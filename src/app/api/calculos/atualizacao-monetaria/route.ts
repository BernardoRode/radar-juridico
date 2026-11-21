import { NextRequest, NextResponse } from 'next/server';
import { resolverEscopoOrganizacao } from '@/lib/tenant';
import { aplicarHeadersQuota } from '@/lib/billing-quota';
import {
  calcularAtualizacaoMonetaria,
  RegimeAtualizacaoMonetaria,
} from '@/lib/atualizacao-monetaria';

const REGIMES_SUPORTADOS = [
  {
    codigo: 'ADC_58_STF',
    nome: 'Trabalhista — ADC 58/59 STF',
    descricao: 'IPCA-E na fase pré-judicial e Taxa SELIC a partir da citação.',
  },
  {
    codigo: 'SELIC_CIVIL',
    nome: 'Cível — Taxa SELIC (Art. 406 CC / Lei 14.905/2024)',
    descricao: 'Taxa SELIC acumulada englobando correção monetária e juros.',
  },
  {
    codigo: 'IPCA_E_JUROS_1_PORCENTO',
    nome: 'Cível/Fazenda — IPCA-E + Juros 1% a.m.',
    descricao: 'Correção mensal pelo IPCA-E acrescida de juros simples de 1% ao mês.',
  },
  {
    codigo: 'INPC_JUROS_1_PORCENTO',
    nome: 'Consumo/Previdenciário — INPC + Juros 1% a.m.',
    descricao: 'Correção mensal pelo INPC acrescida de juros simples de 1% ao mês.',
  },
];

export async function GET(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const resp = NextResponse.json({
    sucesso: true,
    regimes: REGIMES_SUPORTADOS,
  });
  return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
}

/**
 * Issue #98: Simulador de Atualização Monetária Automática (SELIC / IPCA-E / INPC / ADC 58 STF).
 */
export async function POST(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  try {
    const body = (await request.json()) as {
      valorOriginal?: number;
      dataInicial?: string;
      dataCitacao?: string;
      dataFinal?: string;
      regime?: RegimeAtualizacaoMonetaria;
      multaArt523Cpc?: boolean;
      honorariosSucumbenciaPct?: number;
    };

    if (!body.valorOriginal || body.valorOriginal <= 0 || !body.dataInicial) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Informe valorOriginal (> 0) e dataInicial (YYYY-MM-DD).',
        },
        { status: 400 }
      );
    }

    const resultado = calcularAtualizacaoMonetaria({
      valorOriginal: Number(body.valorOriginal),
      dataInicial: body.dataInicial,
      dataCitacao: body.dataCitacao,
      dataFinal: body.dataFinal,
      regime: body.regime || 'ADC_58_STF',
      multaArt523Cpc: Boolean(body.multaArt523Cpc),
      honorariosSucumbenciaPct: body.honorariosSucumbenciaPct ?? 0,
    });

    const resp = NextResponse.json({
      sucesso: true,
      ...resultado,
    });
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao calcular atualização monetária.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
