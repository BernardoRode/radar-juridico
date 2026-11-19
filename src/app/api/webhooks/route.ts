import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dispararWebhooksAlertaAlta } from '@/lib/webhooks';
import { validarUrlWebhookSegura } from '@/lib/seguranca';

export async function GET() {
  try {
    const webhooks = await prisma.webhookAlerta.findMany({
      orderBy: { criadoEm: 'desc' },
    });
    return NextResponse.json({ sucesso: true, webhooks });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar webhooks';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('testar') === 'true') {
      const resultado = await dispararWebhooksAlertaAlta([
        {
          numeroProcesso: '5009926-95.2020.4.04.7201',
          tribunal: 'TRF4',
          tipoAto: 'Teste de Alerta Crítico (Radar Jurídico)',
          prazoFatal: new Date(Date.now() + 5 * 86400000).toLocaleDateString('pt-BR'),
          statusConcorrencia: 'NOSSO_ESCRITORIO',
        },
      ]);
      return NextResponse.json({ sucesso: true, testeDisparado: resultado });
    }

    const body = await request.json();
    const nome = String(body?.nome || '').trim();
    const canal = String(body?.canal || 'WEBHOOK').toUpperCase();
    const urlDestino = String(body?.urlDestino || '').trim();

    if (!nome || !urlDestino.startsWith('http')) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe nome e uma urlDestino HTTP/HTTPS válida.' },
        { status: 400 }
      );
    }

    const validacao = await validarUrlWebhookSegura(urlDestino);
    if (!validacao.valida) {
      return NextResponse.json(
        { sucesso: false, erro: validacao.motivo || 'URL de webhook bloqueada por segurança.' },
        { status: 400 }
      );
    }

    const webhook = await prisma.webhookAlerta.create({
      data: { nome, canal, urlDestino },
    });
    return NextResponse.json({ sucesso: true, webhook }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao cadastrar webhook';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ sucesso: false, erro: 'Informe ?id=.' }, { status: 400 });
    }
    await prisma.webhookAlerta.delete({ where: { id } });
    return NextResponse.json({ sucesso: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao remover webhook';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
