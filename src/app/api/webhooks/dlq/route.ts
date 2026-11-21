import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolverEscopoOrganizacao } from '@/lib/tenant';
import { aplicarHeadersQuota } from '@/lib/billing-quota';
import { enviarComRetryHmac } from '@/lib/webhooks';

/**
 * Issue #97: Lista itens na Dead-Letter Queue (DLQ) de webhooks que falharam após retries.
 */
export async function GET(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status')?.toUpperCase();

  const itens = await prisma.deadLetterWebhook.findMany({
    where: {
      ...escopo.filtroPrisma,
      ...(status ? { status } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    take: 100,
  });

  const resp = NextResponse.json({
    sucesso: true,
    total: itens.length,
    pendentes: itens.filter((i) => i.status === 'PENDENTE').length,
    dlq: itens,
  });
  return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
}

/**
 * POST /api/webhooks/dlq -> Reprocessa um item específico (ou todos pendentes) da DLQ.
 */
export async function POST(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };

    const alvos = body.id
      ? await prisma.deadLetterWebhook.findMany({
          where: { id: body.id, ...escopo.filtroPrisma },
        })
      : await prisma.deadLetterWebhook.findMany({
          where: { status: 'PENDENTE', ...escopo.filtroPrisma },
          take: 25,
        });

    let reprocessados = 0;
    let falhas = 0;

    for (const item of alvos) {
      const res = await enviarComRetryHmac(
        item.urlDestino,
        item.payloadJson,
        1,
        item.eventId
      );

      if (res.ok) {
        reprocessados += 1;
        await prisma.deadLetterWebhook.update({
          where: { id: item.id },
          data: {
            status: 'REPROCESSADO',
            httpStatus: res.httpStatus ?? 200,
            tentativasTotais: item.tentativasTotais + res.tentativasExecutadas,
          },
        });
      } else {
        falhas += 1;
        await prisma.deadLetterWebhook.update({
          where: { id: item.id },
          data: {
            ultimoErro: res.erro || `HTTP ${res.httpStatus || 500}`,
            httpStatus: res.httpStatus ?? null,
            tentativasTotais: item.tentativasTotais + res.tentativasExecutadas,
            proximoRetryEm: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
      }
    }

    const resp = NextResponse.json({
      sucesso: true,
      processados: alvos.length,
      reprocessados,
      falhas,
    });
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao reprocessar DLQ.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/webhooks/dlq?id=... -> Descarta um item da DLQ.
 */
export async function DELETE(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { sucesso: false, erro: 'Informe ?id= para descartar.' },
      { status: 400 }
    );
  }

  await prisma.deadLetterWebhook.update({
    where: { id },
    data: { status: 'DESCARTADO' },
  });

  const resp = NextResponse.json({ sucesso: true, id, status: 'DESCARTADO' });
  return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
}
