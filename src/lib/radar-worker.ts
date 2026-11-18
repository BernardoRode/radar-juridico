import { prisma } from '@/lib/prisma';
import {
  consolidarProcessosAutomaticamente,
  enriquecerComunicacao,
} from '@/lib/inteligencia';
import {
  obterOabsEscritorio,
  salvarRadarNoBanco,
} from '@/lib/persistencia';
import { dispararWebhooksAlertaAlta } from '@/lib/webhooks';
import { ComunicacaoCNJ } from '@/types/juridico';

const CNJ_API_URL = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

async function consultarCnj(params: URLSearchParams): Promise<ComunicacaoCNJ[]> {
  const url = `${CNJ_API_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RadarJuridico/1.0',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export interface ResultadoVarreduraRadar {
  execucaoId: string;
  origem: 'CRON' | 'MANUAL';
  clientesVarredura: number;
  oabsVarredura: number;
  publicacoesEncontradas: number;
  processosSalvos: number;
  alertasAlta: number;
  status: 'SUCESSO' | 'PARCIAL' | 'ERRO';
  alertasDestaque: Array<{
    numeroProcesso: string;
    tribunal: string;
    tipoAto: string;
    prazoFatal?: string;
    statusConcorrencia: string;
  }>;
}

/**
 * Executa uma varredura completa em todos os clientes monitorados e OABs do escritório
 * cadastrados no banco de dados, atualizando processos e registrando alertas de alta urgência.
 */
export async function executarVarreduraRadar(
  origem: 'CRON' | 'MANUAL' = 'MANUAL',
  diasRetroativos = 3
): Promise<ResultadoVarreduraRadar> {
  const execucao = await prisma.execucaoRadar.create({
    data: { origem, status: 'EM_ANDAMENTO' },
  });

  const hoje = new Date().toISOString().split('T')[0];
  const inicio = new Date(Date.now() - diasRetroativos * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  try {
    const [clientes, advogados, nossasOabs] = await Promise.all([
      prisma.clienteMonitorado.findMany({ where: { ativo: true } }),
      prisma.advogadoEscritorio.findMany({ where: { ativo: true } }),
      obterOabsEscritorio(),
    ]);

    const todasComunicacoes = new Map<number, ComunicacaoCNJ>();
    const erros: string[] = [];

    // 1. Varre cada Cliente Monitorado
    for (const cli of clientes) {
      try {
        const p = new URLSearchParams({
          nomeParte: cli.nome,
          dataDisponibilizacaoInicio: inicio,
          dataDisponibilizacaoFim: hoje,
          pagina: '1',
          itensPorPagina: '25',
        });
        const itens = await consultarCnj(p);
        for (const item of itens) {
          if (item.id) todasComunicacoes.set(item.id, item);
        }
      } catch (e: unknown) {
        erros.push(`Cliente ${cli.nome}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }

    // 2. Varre cada OAB do Escritório
    for (const adv of advogados) {
      try {
        const p = new URLSearchParams({
          numeroOab: adv.numeroOab,
          ufOab: adv.ufOab,
          dataDisponibilizacaoInicio: inicio,
          dataDisponibilizacaoFim: hoje,
          pagina: '1',
          itensPorPagina: '25',
        });
        const itens = await consultarCnj(p);
        for (const item of itens) {
          if (item.id) todasComunicacoes.set(item.id, item);
        }
      } catch (e: unknown) {
        erros.push(`OAB ${adv.numeroOab}/${adv.ufOab}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }

    const enriquecidas = Array.from(todasComunicacoes.values()).map((c) =>
      enriquecerComunicacao(c, nossasOabs)
    );
    const processos = consolidarProcessosAutomaticamente(enriquecidas);
    const { processosSalvos } = await salvarRadarNoBanco(processos);

    const alertasDestaque = enriquecidas
      .filter((p) => p.inteligencia.alertasAutomaticos.urgencia === 'ALTA')
      .slice(0, 20)
      .map((p) => ({
        numeroProcesso: p.numeroprocessocommascara || p.numero_processo,
        tribunal: p.siglaTribunal,
        tipoAto: p.inteligencia.alertasAutomaticos.tipoAtoDetectado,
        prazoFatal: p.inteligencia.alertasAutomaticos.prazoFatal,
        statusConcorrencia: p.inteligencia.statusConcorrencia,
      }));

    const statusFinal: 'SUCESSO' | 'PARCIAL' =
      erros.length > 0 ? 'PARCIAL' : 'SUCESSO';

    if (alertasDestaque.length > 0) {
      await dispararWebhooksAlertaAlta(alertasDestaque);
    }

    await prisma.execucaoRadar.update({
      where: { id: execucao.id },
      data: {
        clientesVarredura: clientes.length,
        oabsVarredura: advogados.length,
        publicacoesEncontradas: enriquecidas.length,
        processosSalvos,
        alertasAlta: alertasDestaque.length,
        status: statusFinal,
        detalhesJson: JSON.stringify({ erros, periodo: { inicio, hoje } }),
        finalizadoEm: new Date(),
      },
    });

    return {
      execucaoId: execucao.id,
      origem,
      clientesVarredura: clientes.length,
      oabsVarredura: advogados.length,
      publicacoesEncontradas: enriquecidas.length,
      processosSalvos,
      alertasAlta: alertasDestaque.length,
      status: statusFinal,
      alertasDestaque,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    await prisma.execucaoRadar.update({
      where: { id: execucao.id },
      data: {
        status: 'ERRO',
        detalhesJson: JSON.stringify({ erro: msg }),
        finalizadoEm: new Date(),
      },
    });
    throw error;
  }
}
