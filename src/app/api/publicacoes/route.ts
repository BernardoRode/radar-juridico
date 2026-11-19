import { NextRequest, NextResponse } from 'next/server';
import {
  consolidarProcessosAutomaticamente,
  enriquecerComunicacao,
} from '@/lib/inteligencia';
import {
  obterOabsEscritorio,
  salvarRadarNoBanco,
} from '@/lib/persistencia';
import { gerarRelatorioBIJuridico } from '@/lib/analytics-juridico';
import { verificarAcessoApi } from '@/lib/auth-jwt';
import { verificarRateLimit } from '@/lib/rate-limit';
import {
  consultarDjenComRetryEPaginacao,
  normalizarItensPorPaginaDjen,
} from '@/lib/djen';

export async function GET(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;
    const rl = verificarRateLimit(request, 'publicacoes', 60);
    if (!rl.permitido && rl.resposta429) return rl.resposta429;
    const { searchParams } = new URL(request.url);

    // Parâmetros de busca multi-critério
    const numeroOab = searchParams.get('numeroOab')?.trim();
    const ufOab = searchParams.get('ufOab')?.trim();
    const nomeAdvogado = searchParams.get('nomeAdvogado')?.trim();
    const nomeParte = searchParams.get('nomeParte')?.trim(); // Ex: "LG ELECTRONICS"
    const texto = searchParams.get('texto')?.trim(); // Busca livre ou CNPJ no teor da publicação
    const numeroProcesso = searchParams.get('numeroProcesso')?.trim();
    const siglaTribunal = searchParams.get('siglaTribunal')?.trim();
    const dataInicio = searchParams.get('dataInicio')?.trim();
    const dataFim = searchParams.get('dataFim')?.trim();
    const pagina = searchParams.get('pagina') || '1';
    const itensPorPagina = String(
      normalizarItensPorPaginaDjen(searchParams.get('itensPorPagina'))
    );
    const paginarAuto = searchParams.get('paginarAutomaticamente') !== 'false';
    const maxPaginas = paginarAuto
      ? Math.min(5, Math.max(1, Number(searchParams.get('maxPaginas') || '2') || 2))
      : 1;

    // Lista de OABs do nosso escritório (separadas por vírgula)
    const nossasOabsParam = searchParams.get('nossasOabs') || '';
    const oabsBanco = await obterOabsEscritorio();
    const nossasOabs = Array.from(
      new Set([
        ...oabsBanco,
        ...nossasOabsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ])
    );

    if (numeroOab && !nossasOabs.includes(numeroOab)) {
      nossasOabs.push(`${numeroOab}${ufOab || ''}`);
    }

    // Monta query string para a API oficial do Comunica PJe / DJEN (CNJ)
    const cnjParams = new URLSearchParams();
    if (numeroOab) cnjParams.set('numeroOab', numeroOab.replace(/[^0-9]/g, ''));
    if (ufOab) cnjParams.set('ufOab', ufOab.toUpperCase());
    if (nomeAdvogado) cnjParams.set('nomeAdvogado', nomeAdvogado);
    if (nomeParte) cnjParams.set('nomeParte', nomeParte);
    if (texto) cnjParams.set('texto', texto);
    if (numeroProcesso) cnjParams.set('numeroProcesso', numeroProcesso.replace(/[^0-9]/g, ''));
    if (siglaTribunal) cnjParams.set('siglaTribunal', siglaTribunal.toUpperCase());
    if (dataInicio) cnjParams.set('dataDisponibilizacaoInicio', dataInicio);
    if (dataFim) cnjParams.set('dataDisponibilizacaoFim', dataFim);
    cnjParams.set('pagina', pagina);
    cnjParams.set('itensPorPagina', itensPorPagina);

    // Issue #81: Consulta blindada com itensPorPagina <= 50, retry exponencial e paginação automática
    const djenRes = await consultarDjenComRetryEPaginacao(cnjParams, {
      maxPaginas,
    });

    if (!djenRes.ok) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: `A API do CNJ retornou status ${djenRes.statusHttp}`,
          detalhes: djenRes.erro,
          endpointConsultado: djenRes.endpointConsultado,
        },
        { status: djenRes.statusHttp || 502 }
      );
    }

    const items = djenRes.items;

    // Passa todas as publicações pelo Motor de Inteligência & Enriquecimento
    const publicacoesEnriquecidas = items.map((item) =>
      enriquecerComunicacao(item, nossasOabs)
    );

    // Consolida automaticamente as pastas dos processos (Zero trabalho manual)
    const processosConsolidados = consolidarProcessosAutomaticamente(publicacoesEnriquecidas);

    // Persiste automaticamente no banco SQLite/Prisma (Issue #5)
    const persistir = searchParams.get('persistir') !== 'false';
    const persistencia = persistir
      ? await salvarRadarNoBanco(processosConsolidados)
      : { processosSalvos: 0, publicacoesSalvas: 0 };

    // Resumo executivo de inteligência
    const resumo = {
      totalPublicacoesRetornadas: publicacoesEnriquecidas.length,
      totalNoCnj: djenRes.totalNoCnj,
      paginasConsultadas: djenRes.paginasConsultadas,
      itensPorPaginaAplicado: djenRes.itensPorPaginaAplicado,
      totalProcessosUnicos: processosConsolidados.length,
      processosNossoEscritorio: processosConsolidados.filter(
        (p) => p.statusConcorrencia === 'NOSSO_ESCRITORIO'
      ).length,
      processosConcorrencia: processosConsolidados.filter(
        (p) => p.statusConcorrencia === 'ESCRITORIO_CONCORRENTE'
      ).length,
      processosSemAdvogadoRecemDistribuidos: processosConsolidados.filter(
        (p) => p.statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO'
      ).length,
      alertasUrgenciaAlta: publicacoesEnriquecidas.filter(
        (p) => p.inteligencia.alertasAutomaticos.urgencia === 'ALTA'
      ).length,
    };

    const biJuridico = gerarRelatorioBIJuridico(processosConsolidados);

    return NextResponse.json({
      sucesso: true,
      endpointConsultado: djenRes.endpointConsultado,
      oabsConsideradas: nossasOabs,
      persistencia,
      resumo,
      biJuridico,
      processosConsolidados,
      publicacoes: publicacoesEnriquecidas,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json(
      {
        sucesso: false,
        erro: 'Falha ao consultar a API de publicações jurídicas.',
        detalhes: msg,
      },
      { status: 500 }
    );
  }
}
