import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { consultarDjenComRetryEPaginacao } from '@/lib/djen';
import {
  consolidarProcessosAutomaticamente,
  enriquecerComunicacao,
} from '@/lib/inteligencia';
import { obterOabsEscritorio, salvarRadarNoBanco } from '@/lib/persistencia';
import { verificarAcessoApi } from '@/lib/auth-jwt';

function extrairValorRS(valorStr?: string | null): number {
  if (!valorStr) return 0;
  const limpo = valorStr
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

/**
 * POST /api/due-diligence
 * Issue #86: Compliance / KYC / Background Check Jurídico por CPF, CNPJ, Raiz de CNPJ (8 dígitos) ou Razão Social.
 * Retorna Score de Risco Jurídico (0-100), volume por esfera, passivo estimado e alertas societários (RJ/Falência/IDPJ).
 */
export async function POST(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const body = await request.json();
    const documentoRaw = String(body?.documento || body?.cnpj || body?.cpf || '').trim();
    const nomeRaw = String(body?.nome || '').trim();
    const consultarAoVivo = body?.consultarDjenAoVivo === true;

    const digitosDoc = documentoRaw.replace(/[^0-9]/g, '');
    const raizCnpj = digitosDoc.length >= 8 ? digitosDoc.slice(0, 8) : '';

    if (!digitosDoc && !nomeRaw) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Informe "documento" (CPF, CNPJ ou Raiz de CNPJ de 8 dígitos) ou "nome" da parte.',
        },
        { status: 400 }
      );
    }

    if (consultarAoVivo) {
      const nossasOabs = await obterOabsEscritorio();
      const params = new URLSearchParams({
        pagina: '1',
        itensPorPagina: '50',
      });
      if (nomeRaw) params.set('nomeParte', nomeRaw);
      else if (digitosDoc) params.set('texto', digitosDoc);

      const djenRes = await consultarDjenComRetryEPaginacao(params, { maxPaginas: 1 });
      if (djenRes.ok && djenRes.items.length > 0) {
        const enriquecidas = djenRes.items.map((i) => enriquecerComunicacao(i, nossasOabs));
        const consolidados = consolidarProcessosAutomaticamente(enriquecidas);
        await salvarRadarNoBanco(consolidados);
      }
    }

    const todosProcessos = await prisma.processo.findMany({
      where: { ignoradoHomonimo: false },
      include: { publicacoes: true },
      orderBy: { atualizadoEm: 'desc' },
      take: 300,
    });

    const termoNome = nomeRaw.toUpperCase();
    const processosAlvo = todosProcessos.filter((p) => {
      const partes = (p.partesJson || '').toUpperCase();
      const textos = p.publicacoes.map((pub) => pub.texto).join(' ');
      if (termoNome && partes.includes(termoNome)) return true;
      if (digitosDoc && (textos.includes(digitosDoc) || textos.includes(documentoRaw))) {
        return true;
      }
      if (raizCnpj && raizCnpj.length === 8 && textos.includes(raizCnpj)) return true;
      return false;
    });

    const esferas = {
      trabalhista: 0,
      civelEstadual: 0,
      federalFiscal: 0,
      execucoesBloqueios: 0,
      falenciaRecuperacaoIdpj: 0,
    };

    let passivoEstimadoRS = 0;
    const alertasCriticos: string[] = [];

    for (const proc of processosAlvo) {
      const trib = (proc.siglaTribunal || '').toUpperCase();
      if (trib.startsWith('TRT') || trib === 'TST') esferas.trabalhista += 1;
      else if (trib.startsWith('TRF') || trib.startsWith('JF')) esferas.federalFiscal += 1;
      else esferas.civelEstadual += 1;

      if (proc.faseProcessual.includes('EXECUCAO') || proc.faseProcessual.includes('Execução')) {
        esferas.execucoesBloqueios += 1;
      }

      let maiorVal = 0;
      const textoConcat = proc.publicacoes
        .map((pub) => {
          const v = extrairValorRS(pub.valorDetectado);
          if (v > maiorVal) maiorVal = v;
          return pub.texto;
        })
        .join(' ')
        .toLowerCase();

      passivoEstimadoRS += maiorVal;

      if (
        textoConcat.includes('falência') ||
        textoConcat.includes('recuperação judicial') ||
        textoConcat.includes('desconsideração da personalidade jurídica') ||
        textoConcat.includes('idpj')
      ) {
        esferas.falenciaRecuperacaoIdpj += 1;
        alertasCriticos.push(
          `[${proc.siglaTribunal}] Proc. ${proc.numeroFormatado}: Risco societário (RJ/Falência/IDPJ)`
        );
      }
      if (textoConcat.includes('sisbajud') || textoConcat.includes('penhora')) {
        alertasCriticos.push(
          `[${proc.siglaTribunal}] Proc. ${proc.numeroFormatado}: Constrição patrimonial (Sisbajud/Penhora)`
        );
      }
    }

    // Cálculo determinístico do Score de Risco Jurídico (0 a 100)
    const scoreBruto =
      processosAlvo.length * 5 +
      esferas.execucoesBloqueios * 15 +
      esferas.falenciaRecuperacaoIdpj * 30 +
      (passivoEstimadoRS > 100_000 ? 20 : passivoEstimadoRS > 20_000 ? 10 : 0);
    const scoreRiscoJuridico = Math.min(100, scoreBruto);

    const classificacaoRisco: 'BAIXO' | 'MODERADO' | 'ALTO' | 'CRITICO' =
      scoreRiscoJuridico >= 75
        ? 'CRITICO'
        : scoreRiscoJuridico >= 45
        ? 'ALTO'
        : scoreRiscoJuridico >= 20
        ? 'MODERADO'
        : 'BAIXO';

    return NextResponse.json({
      sucesso: true,
      alvoConsultado: {
        documento: documentoRaw || null,
        raizCnpj: raizCnpj || null,
        nome: nomeRaw || null,
      },
      scoreRiscoJuridico,
      classificacaoRisco,
      totalProcessosIdentificados: processosAlvo.length,
      passivoEstimadoRS,
      passivoFormatado: passivoEstimadoRS.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
      distribuicaoPorEsfera: esferas,
      alertasCriticos: alertasCriticos.slice(0, 15),
      processosResumo: processosAlvo.slice(0, 25).map((p) => ({
        numeroFormatado: p.numeroFormatado,
        tribunal: p.siglaTribunal,
        orgaoJulgador: p.orgaoJulgador,
        classe: p.classeProcessual,
        fase: p.faseProcessual,
        urgencia: p.urgenciaMaxima,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao executar due diligence';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
