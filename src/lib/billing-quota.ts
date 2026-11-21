import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export interface DefinicaoPlanoB2B {
  codigo: 'FREE' | 'PRO' | 'ENTERPRISE' | 'PAY_AS_YOU_GO';
  nome: string;
  limiteMensalPadrao: number;
  precoMensalBrl: number;
  precoExcedenteCentavos: number;
  permitePayAsYouGo: boolean;
}

export const PLANOS_B2B: Record<string, DefinicaoPlanoB2B> = {
  FREE: {
    codigo: 'FREE',
    nome: 'Starter / Sandbox Gratuito',
    limiteMensalPadrao: 1000,
    precoMensalBrl: 0,
    precoExcedenteCentavos: 10,
    permitePayAsYouGo: false,
  },
  PAY_AS_YOU_GO: {
    codigo: 'PAY_AS_YOU_GO',
    nome: 'Pay-as-you-go Sem Fidelidade',
    limiteMensalPadrao: 500,
    precoMensalBrl: 0,
    precoExcedenteCentavos: 5,
    permitePayAsYouGo: true,
  },
  PRO: {
    codigo: 'PRO',
    nome: 'Pro Legal Ops',
    limiteMensalPadrao: 25000,
    precoMensalBrl: 299,
    precoExcedenteCentavos: 3,
    permitePayAsYouGo: true,
  },
  ENTERPRISE: {
    codigo: 'ENTERPRISE',
    nome: 'Enterprise High-Volume',
    limiteMensalPadrao: 250000,
    precoMensalBrl: 1490,
    precoExcedenteCentavos: 1,
    permitePayAsYouGo: true,
  },
};

export interface QuotaHeadersInfo {
  plano: string;
  limiteMensal: number;
  usoMesAtual: number;
  restante: number;
  resetIso: string;
  payAsYouGoAtivo: boolean;
  excedenteReqs: number;
  custoExcedenteBrl: string;
}

export function obterProximoResetMensalIso(referencia = new Date()): string {
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth();
  const proximo = new Date(Date.UTC(ano, mes + 1, 1, 0, 0, 0));
  return proximo.toISOString();
}

export function calcularInfoQuota(params: {
  plano: string;
  limiteMensal: number;
  usoMesAtual: number;
  payAsYouGoAtivo?: boolean;
  precoExcedenteCentavos?: number;
}): QuotaHeadersInfo {
  const excedenteReqs = Math.max(0, params.usoMesAtual - params.limiteMensal);
  const restante = Math.max(0, params.limiteMensal - params.usoMesAtual);
  const centavos = params.precoExcedenteCentavos ?? 5;
  const custoExcedenteBrl = ((excedenteReqs * centavos) / 100).toFixed(2);

  return {
    plano: params.plano,
    limiteMensal: params.limiteMensal,
    usoMesAtual: params.usoMesAtual,
    restante,
    resetIso: obterProximoResetMensalIso(),
    payAsYouGoAtivo: Boolean(params.payAsYouGoAtivo),
    excedenteReqs,
    custoExcedenteBrl,
  };
}

/**
 * Issue #99: Aplica os headers padronizados `X-Quota-*` em qualquer resposta da API B2B.
 */
export function aplicarHeadersQuota<T>(
  response: NextResponse<T>,
  info: QuotaHeadersInfo
): NextResponse<T> {
  response.headers.set('X-Quota-Limit', String(info.limiteMensal));
  response.headers.set('X-Quota-Remaining', String(info.restante));
  response.headers.set('X-Quota-Used', String(info.usoMesAtual));
  response.headers.set('X-Quota-Reset', info.resetIso);
  response.headers.set('X-Quota-Plan', info.plano);
  response.headers.set(
    'X-Quota-Overage-Allowed',
    info.payAsYouGoAtivo ? 'true' : 'false'
  );
  response.headers.set('X-Quota-Overage-Cost-BRL', info.custoExcedenteBrl);
  return response;
}

/**
 * Issue #99: Verifica, reseta mês se necessário e contabiliza consumo de uma API Key B2B.
 */
export async function verificarEConsumirQuotaApiKey(chaveBruta: string): Promise<{
  permitido: boolean;
  motivoBloqueio?: string;
  apiKeyId?: string;
  organizacaoId?: string | null;
  quota?: QuotaHeadersInfo;
}> {
  const hash = crypto.createHash('sha256').update(chaveBruta).digest('hex');
  const key = await prisma.apiKeyCliente.findUnique({
    where: { chaveHash: hash },
  });

  if (!key || !key.ativa) {
    return { permitido: false, motivoBloqueio: 'API Key inválida ou revogada.' };
  }

  const mesAtual = new Date().toISOString().slice(0, 7);
  const usoBase = key.mesReferencia === mesAtual ? key.usoMesAtual : 0;

  if (usoBase >= key.limiteMensal && !key.payAsYouGoAtivo) {
    const quotaAtual = calcularInfoQuota({
      plano: key.plano,
      limiteMensal: key.limiteMensal,
      usoMesAtual: usoBase,
      payAsYouGoAtivo: key.payAsYouGoAtivo,
      precoExcedenteCentavos: key.precoExcedenteCentavos,
    });
    return {
      permitido: false,
      motivoBloqueio:
        'Cota mensal atingida. Ative o modo Pay-as-you-go em /api/billing/quota para continuar sem bloqueio.',
      apiKeyId: key.id,
      organizacaoId: key.organizacaoId,
      quota: quotaAtual,
    };
  }

  const novoUso = usoBase + 1;
  await prisma.apiKeyCliente.update({
    where: { id: key.id },
    data: {
      usoMesAtual: novoUso,
      mesReferencia: mesAtual,
      ultimoUsoEm: new Date(),
    },
  });

  const quota = calcularInfoQuota({
    plano: key.plano,
    limiteMensal: key.limiteMensal,
    usoMesAtual: novoUso,
    payAsYouGoAtivo: key.payAsYouGoAtivo,
    precoExcedenteCentavos: key.precoExcedenteCentavos,
  });

  return {
    permitido: true,
    apiKeyId: key.id,
    organizacaoId: key.organizacaoId,
    quota,
  };
}
