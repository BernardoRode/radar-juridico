import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gerarHashApiKey, resolverEscopoOrganizacao } from '@/lib/tenant';
import {
  aplicarHeadersQuota,
  calcularInfoQuota,
  PLANOS_B2B,
} from '@/lib/billing-quota';

/**
 * Issue #99: Self-Service B2B Sem Fidelidade — Consulta de cota, consumo, custo excedente e planos.
 * Retorna headers padronizados `X-Quota-Limit`, `X-Quota-Remaining`, `X-Quota-Used`, `X-Quota-Reset`, etc.
 */
export async function GET(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const apiKeyHeader = request.headers.get('x-api-key')?.trim();
  if (apiKeyHeader) {
    const key = await prisma.apiKeyCliente.findUnique({
      where: { chaveHash: gerarHashApiKey(apiKeyHeader) },
    });
    if (key) {
      const info = calcularInfoQuota({
        plano: key.plano,
        limiteMensal: key.limiteMensal,
        usoMesAtual: key.usoMesAtual,
        payAsYouGoAtivo: key.payAsYouGoAtivo,
        precoExcedenteCentavos: key.precoExcedenteCentavos,
      });
      const resp = NextResponse.json({
        sucesso: true,
        chavePrefixo: key.prefixo,
        quota: info,
        planosDisponiveis: Object.values(PLANOS_B2B),
      });
      return aplicarHeadersQuota(resp, info);
    }
  }

  const chaves = await prisma.apiKeyCliente.findMany({
    where: { ...escopo.filtroPrisma, ativa: true },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      nome: true,
      prefixo: true,
      plano: true,
      limiteMensal: true,
      usoMesAtual: true,
      mesReferencia: true,
      payAsYouGoAtivo: true,
      precoExcedenteCentavos: true,
    },
  });

  const resumo = chaves.map((k) => ({
    ...k,
    quota: calcularInfoQuota({
      plano: k.plano,
      limiteMensal: k.limiteMensal,
      usoMesAtual: k.usoMesAtual,
      payAsYouGoAtivo: k.payAsYouGoAtivo,
      precoExcedenteCentavos: k.precoExcedenteCentavos,
    }),
  }));

  const resp = NextResponse.json({
    sucesso: true,
    totalChavesAtivas: resumo.length,
    chaves: resumo,
    planosDisponiveis: Object.values(PLANOS_B2B),
  });
  return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
}

/**
 * POST /api/billing/quota -> Ativa/desativa Pay-as-you-go ou altera plano self-service sem fidelidade.
 */
export async function POST(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  try {
    const body = (await request.json()) as {
      apiKeyId?: string;
      plano?: string;
      payAsYouGoAtivo?: boolean;
    };

    if (!body.apiKeyId) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe apiKeyId.' },
        { status: 400 }
      );
    }

    const planoKey = body.plano?.toUpperCase();
    const defPlano = planoKey ? PLANOS_B2B[planoKey] : undefined;

    const atualizada = await prisma.apiKeyCliente.update({
      where: { id: body.apiKeyId },
      data: {
        ...(defPlano
          ? {
              plano: defPlano.codigo,
              limiteMensal: defPlano.limiteMensalPadrao,
              precoExcedenteCentavos: defPlano.precoExcedenteCentavos,
            }
          : {}),
        ...(typeof body.payAsYouGoAtivo === 'boolean'
          ? { payAsYouGoAtivo: body.payAsYouGoAtivo }
          : {}),
      },
    });

    const info = calcularInfoQuota({
      plano: atualizada.plano,
      limiteMensal: atualizada.limiteMensal,
      usoMesAtual: atualizada.usoMesAtual,
      payAsYouGoAtivo: atualizada.payAsYouGoAtivo,
      precoExcedenteCentavos: atualizada.precoExcedenteCentavos,
    });

    const resp = NextResponse.json({
      sucesso: true,
      mensagem: 'Configuração de plano/cota atualizada em modo self-service.',
      quota: info,
    });
    return aplicarHeadersQuota(resp, info);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao atualizar cota.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
