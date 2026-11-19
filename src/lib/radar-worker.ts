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
    substitutoFerias?: string;
  }>;
}

function estaEmFeriasHoje(emFeriasAte?: string | null): boolean {
  if (!emFeriasAte) return false;
  const parsed = new Date(emFeriasAte);
  if (isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= Date.now();
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

    // Issue #47: Mapeia OABs em férias para redirecionamento automático ao substituto
    const mapaSubstitutoFerias = new Map<string, string>();
    for (const adv of advogados) {
      if (estaEmFeriasHoje(adv.emFeriasAte) && adv.advogadoSubstituto) {
        mapaSubstitutoFerias.set(
          `${adv.numeroOab}${adv.ufOab}`.toUpperCase(),
          `${adv.advogadoSubstituto} (férias de ${adv.nome} até ${adv.emFeriasAte})`
        );
      }
    }

    const todasComunicacoes = new Map<number, ComunicacaoCNJ>();
    const erros: string[] = [];

    // 1. Varre cada Cliente Monitorado + Variações de Nome e Raiz de CNPJ (Issue #14)
    for (const cli of clientes) {
      const termosCliente = [
        cli.nome,
        ...(cli.variacoes ? cli.variacoes.split(',').map((s) => s.trim()) : []),
      ].filter(Boolean);

      for (const termo of termosCliente.slice(0, 4)) {
        try {
          const p = new URLSearchParams({
            nomeParte: termo,
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
          erros.push(`Cliente ${termo}: ${e instanceof Error ? e.message : 'erro'}`);
        }
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

    // 3. Issue #41: Varre também pelo Número Único dos processos já vinculados ao Nosso Escritório
    // (excluindo homônimos ignorados) para blindar contra omissão de OAB pela secretaria da Vara
    const processosNossos = await prisma.processo.findMany({
      where: {
        statusConcorrencia: 'NOSSO_ESCRITORIO',
        ignoradoHomonimo: false,
      },
      select: { numeroProcesso: true },
      take: 25,
    });
    for (const procNosso of processosNossos) {
      try {
        const p = new URLSearchParams({
          numeroProcesso: procNosso.numeroProcesso,
          dataDisponibilizacaoInicio: inicio,
          dataDisponibilizacaoFim: hoje,
          pagina: '1',
          itensPorPagina: '10',
        });
        const itens = await consultarCnj(p);
        for (const item of itens) {
          if (item.id) todasComunicacoes.set(item.id, item);
        }
      } catch {
        // Continua silenciosamente
      }
    }

    const enriquecidas = Array.from(todasComunicacoes.values()).map((c) =>
      enriquecerComunicacao(c, nossasOabs)
    );
    const processos = consolidarProcessosAutomaticamente(enriquecidas);
    const { processosSalvos } = await salvarRadarNoBanco(processos);

    // Issue #74: Deduplicação de alertas críticos (evita reenviar alerta do mesmo processo em < 12h)
    const dozeHorasAtras = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const processosRecemAlertados = new Set(
      (
        await prisma.processo.findMany({
          where: {
            OR: [
              { ignoradoHomonimo: true },
              { ultimoAlertaEnviadoEm: { gte: dozeHorasAtras } },
            ],
          },
          select: { numeroProcesso: true },
        })
      ).map((p) => p.numeroProcesso)
    );

    const alertasDestaque = enriquecidas
      .filter((p) => {
        if (p.inteligencia.alertasAutomaticos.urgencia !== 'ALTA') return false;
        const limpo = (p.numero_processo || '').replace(/[^0-9]/g, '');
        return !processosRecemAlertados.has(limpo);
      })
      .slice(0, 20)
      .map((p) => {
        let substitutoFerias: string | undefined;
        for (const adv of p.inteligencia.advogadosIdentificados || []) {
          const chave = `${adv.oab}${adv.uf}`.toUpperCase();
          if (mapaSubstitutoFerias.has(chave)) {
            substitutoFerias = mapaSubstitutoFerias.get(chave);
            break;
          }
        }
        return {
          numeroLimpo: (p.numero_processo || '').replace(/[^0-9]/g, ''),
          numeroProcesso: p.numeroprocessocommascara || p.numero_processo,
          tribunal: p.siglaTribunal,
          tipoAto: p.inteligencia.alertasAutomaticos.tipoAtoDetectado,
          prazoFatal: p.inteligencia.alertasAutomaticos.prazoFatal,
          statusConcorrencia: p.inteligencia.statusConcorrencia,
          substitutoFerias,
        };
      });

    const statusFinal: 'SUCESSO' | 'PARCIAL' =
      erros.length > 0 ? 'PARCIAL' : 'SUCESSO';

    if (alertasDestaque.length > 0) {
      await dispararWebhooksAlertaAlta(alertasDestaque);
      const numerosAlertados = Array.from(
        new Set(alertasDestaque.map((a) => a.numeroLimpo).filter(Boolean))
      );
      if (numerosAlertados.length > 0) {
        await prisma.processo
          .updateMany({
            where: { numeroProcesso: { in: numerosAlertados } },
            data: { ultimoAlertaEnviadoEm: new Date() },
          })
          .catch(() => {});
      }
    }

    const alertasPublicos = alertasDestaque.map(
      ({ numeroProcesso, tribunal, tipoAto, prazoFatal, statusConcorrencia, substitutoFerias }) => ({
        numeroProcesso,
        tribunal,
        tipoAto,
        prazoFatal,
        statusConcorrencia,
        substitutoFerias,
      })
    );

    await prisma.execucaoRadar.update({
      where: { id: execucao.id },
      data: {
        clientesVarredura: clientes.length,
        oabsVarredura: advogados.length,
        publicacoesEncontradas: enriquecidas.length,
        processosSalvos,
        alertasAlta: alertasPublicos.length,
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
      alertasAlta: alertasPublicos.length,
      status: statusFinal,
      alertasDestaque: alertasPublicos,
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
