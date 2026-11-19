import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { consultarDatajudProcesso } from '@/lib/datajud';
import { consultarDjenComRetryEPaginacao } from '@/lib/djen';
import {
  consolidarProcessosAutomaticamente,
  enriquecerComunicacao,
} from '@/lib/inteligencia';
import { obterOabsEscritorio, salvarRadarNoBanco } from '@/lib/persistencia';
import { analisarPublicacaoComIA } from '@/lib/ia-juridica';
import { auditarAtrasoRemessaDjen } from '@/lib/auto-update';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * GET /api/processo-360?numeroProcesso=<CNJ>&modo=cache|tempo_real
 * Issue #84: Endpoint unificado 360º (estilo Judit API) que funde em um único JSON:
 * - Pasta e publicações do DJEN/CNJ
 * - Capa, assuntos TPU, data de ajuizamento e árvore de movimentos do Datajud
 * - PDFs originais extraídos (PJe/eproc) + auditoria de tempestividade Res. CNJ 569/2024
 * - Prazos fatais, D-2 e análise executiva de IA
 * Suporta `?modo=cache` (Hot Storage em milissegundos) vs `?modo=tempo_real` (On-Demand ao vivo).
 */
export async function GET(request: NextRequest) {
  const inicioMs = Date.now();
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const { searchParams } = new URL(request.url);
    const numeroRaw = searchParams.get('numeroProcesso')?.trim();
    const modo =
      searchParams.get('modo')?.toLowerCase() === 'tempo_real'
        ? 'TEMPO_REAL'
        : 'CACHE_HOT_STORAGE';
    const siglaTribunal = searchParams.get('siglaTribunal')?.trim() || undefined;

    if (!numeroRaw) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o parâmetro ?numeroProcesso=.' },
        { status: 400 }
      );
    }

    const numLimpo = numeroRaw.replace(/[^0-9]/g, '');
    if (numLimpo.length < 10) {
      return NextResponse.json(
        { sucesso: false, erro: 'Número de processo CNJ inválido.' },
        { status: 400 }
      );
    }

    // 1. Tenta Hot Storage no banco Prisma
    let processoDb = await prisma.processo.findUnique({
      where: { numeroProcesso: numLimpo },
      include: {
        publicacoes: { orderBy: { criadoEm: 'desc' }, take: 30 },
        documentos: { orderBy: { criadoEm: 'desc' }, take: 15 },
      },
    });

    // 2. Se modo=TEMPO_REAL ou processo ainda não existe no Hot Storage, consulta DJEN ao vivo
    if (modo === 'TEMPO_REAL' || !processoDb) {
      const nossasOabs = await obterOabsEscritorio();
      const paramsDjen = new URLSearchParams({
        numeroProcesso: numLimpo,
        pagina: '1',
        itensPorPagina: '25',
      });
      if (siglaTribunal) paramsDjen.set('siglaTribunal', siglaTribunal.toUpperCase());

      const djenRes = await consultarDjenComRetryEPaginacao(paramsDjen, { maxPaginas: 2 });
      if (djenRes.ok && djenRes.items.length > 0) {
        const enriquecidas = djenRes.items.map((item) =>
          enriquecerComunicacao(item, nossasOabs)
        );
        const consolidados = consolidarProcessosAutomaticamente(enriquecidas);
        await salvarRadarNoBanco(consolidados);

        processoDb = await prisma.processo.findUnique({
          where: { numeroProcesso: numLimpo },
          include: {
            publicacoes: { orderBy: { criadoEm: 'desc' }, take: 30 },
            documentos: { orderBy: { criadoEm: 'desc' }, take: 15 },
          },
        });
      }
    }

    // 3. Consulta Datajud (usa Cache L1/L2 se modo=CACHE_HOT_STORAGE, ou força tempo real se TEMPO_REAL)
    const dadosDatajud = await consultarDatajudProcesso(
      numLimpo,
      processoDb?.siglaTribunal || siglaTribunal,
      { ignorarCache: modo === 'TEMPO_REAL' }
    );

    const ultimaPub = processoDb?.publicacoes?.[0];
    const ultimoDoc = processoDb?.documentos?.[0];

    // 4. Auditoria de atraso de remessa PJe vs DJEN (Issue #85)
    const auditoriaRemessa =
      ultimoDoc?.dataHoraAssinatura && ultimaPub?.dataDisponibilizacao
        ? auditarAtrasoRemessaDjen(
            ultimoDoc.dataHoraAssinatura,
            ultimaPub.dataDisponibilizacao
          )
        : undefined;

    // 5. Resumo executivo IA (com PII Vault & proteção de sigilo da Issue #88)
    const analiseIA = ultimaPub
      ? await analisarPublicacaoComIA({
          texto: ultimaPub.texto,
          statusConcorrencia: processoDb?.statusConcorrencia,
          tipoAtoDetectado: ultimaPub.tipoAtoDetectado,
          tribunal: processoDb?.siglaTribunal || dadosDatajud.tribunal,
          numeroProcesso: processoDb?.numeroFormatado || numLimpo,
          nivelSigilo: dadosDatajud.nivelSigilo,
        })
      : null;

    return NextResponse.json({
      sucesso: true,
      modoExecutado: modo,
      latenciaMs: Date.now() - inicioMs,
      numeroProcesso: numLimpo,
      encontradoDjen: Boolean(processoDb),
      encontradoDatajud: dadosDatajud.encontrado,
      visao360: {
        capa: {
          numeroFormatado: processoDb?.numeroFormatado || numLimpo,
          tribunal: processoDb?.siglaTribunal || dadosDatajud.tribunal || siglaTribunal || 'N/I',
          orgaoJulgador:
            processoDb?.orgaoJulgador || dadosDatajud.orgaoJulgador?.nome || 'N/I',
          classeProcessual:
            processoDb?.classeProcessual || dadosDatajud.classe?.nome || 'N/I',
          dataAjuizamento:
            processoDb?.dataAjuizamento || dadosDatajud.dataAjuizamento || null,
          assuntosTPU: dadosDatajud.assuntos,
          nivelSigilo: dadosDatajud.nivelSigilo ?? 0,
        },
        operacaoEscritorio: {
          statusConcorrencia:
            processoDb?.statusConcorrencia || 'SEM_ADVOGADO_CADASTRADO',
          faseProcessual: processoDb?.faseProcessual || 'ANDAMENTO',
          ultimoStatusDetectado: processoDb?.ultimoStatusDetectado || null,
          prazoFatal: processoDb?.prazoFatal || null,
          prazoBaixado: processoDb?.prazoBaixado ?? false,
          minutaPronta: processoDb?.minutaPronta ?? false,
          urgenciaMaxima: processoDb?.urgenciaMaxima || 'NORMAL',
          protocoloRecenteDatajud: dadosDatajud.protocoloRecenteDetectado || null,
          auditoriaRemessaRes569: auditoriaRemessa || null,
        },
        partes: processoDb?.partesJson ? JSON.parse(processoDb.partesJson) : [],
        advogados: processoDb?.advogadosJson ? JSON.parse(processoDb.advogadosJson) : [],
        analiseIA,
        publicacoesDjen: processoDb?.publicacoes || [],
        documentosExtraidos: processoDb?.documentos || [],
        datajud: dadosDatajud,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao montar visão 360 do processo';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
