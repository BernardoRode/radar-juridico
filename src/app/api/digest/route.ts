import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dispararWebhooksAlertaAlta } from '@/lib/webhooks';

async function montarDigest(filtroCliente?: string) {
  const todosProcessos = await prisma.processo.findMany({
    where: { ignoradoHomonimo: false },
    include: {
      _count: { select: { publicacoes: true, documentos: true } },
    },
    orderBy: { atualizadoEm: 'desc' },
    take: 150,
  });

  const processos = filtroCliente
    ? todosProcessos.filter((p) =>
        (p.partesJson || '').toUpperCase().includes(filtroCliente)
      )
    : todosProcessos;

  const urgenciaAlta = processos.filter((p) => p.urgenciaMaxima === 'ALTA' && !p.prazoBaixado);
  const semAdvogado = processos.filter(
    (p) => p.statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO'
  );
  const comPrazoFatal = processos.filter((p) => !!p.prazoFatal && !p.prazoBaixado);

  const textoBoletimWhatsApp = [
    `🌅 *DIGEST MATINAL — RADAR JURÍDICO (${new Date().toLocaleDateString('pt-BR')})*`,
    filtroCliente ? `🏢 Cliente: *${filtroCliente}*` : '🏢 Visão Geral do Escritório',
    `• Total de Processos Monitorados: *${processos.length}*`,
    `• Alertas de Alta Urgência em Aberto: *${urgenciaAlta.length}*`,
    `• Processos com Prazo Fatal Aberto: *${comPrazoFatal.length}*`,
    `• Novas Citações Sem Advogado (Res. 455): *${semAdvogado.length}*`,
  ].join('\n');

  return {
    processos,
    urgenciaAlta,
    semAdvogado,
    comPrazoFatal,
    textoBoletimWhatsApp,
  };
}

/**
 * GET /api/digest?cliente=<opcional>&disparar=true
 * Issue #21 (Digest Matinal 08h) + Issue #25 (Portal do Cliente White-Label).
 * Quando chamado pelo Vercel Cron com `?disparar=true`, envia o resumo aos webhooks/e-mail configurados.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filtroCliente = searchParams.get('cliente')?.trim().toUpperCase();
    const deveDisparar = searchParams.get('disparar') === 'true';

    if (deveDisparar && process.env.CRON_SECRET) {
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json(
          { sucesso: false, erro: 'Não autorizado para disparar o Digest agendado.' },
          { status: 401 }
        );
      }
    }

    const { processos, urgenciaAlta, semAdvogado, comPrazoFatal, textoBoletimWhatsApp } =
      await montarDigest(filtroCliente);

    let envioDigest: { enviados: number; falhas: number } | undefined;
    if (deveDisparar) {
      envioDigest = await dispararWebhooksAlertaAlta(
        urgenciaAlta.slice(0, 10).map((p) => ({
          numeroProcesso: p.numeroFormatado,
          tribunal: p.siglaTribunal,
          tipoAto: p.ultimoStatusDetectado,
          prazoFatal: p.prazoFatal || undefined,
          statusConcorrencia: p.statusConcorrencia,
        })),
        'DIGEST_MATINAL_08H',
        textoBoletimWhatsApp
      );
    }

    return NextResponse.json({
      sucesso: true,
      geradoEm: new Date().toISOString(),
      clienteFiltrado: filtroCliente || null,
      resumoDigest: {
        totalProcessos: processos.length,
        urgenciaAlta: urgenciaAlta.length,
        comPrazoFatal: comPrazoFatal.length,
        semAdvogado: semAdvogado.length,
      },
      textoBoletimWhatsApp,
      ...(envioDigest ? { envioDigest } : {}),
      processosDestaque: processos.slice(0, 25),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar digest';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * POST /api/digest
 * Dispara manualmente o Digest Matinal para todos os webhooks/e-mail configurados.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const filtroCliente = body?.cliente ? String(body.cliente).trim().toUpperCase() : undefined;
    const { urgenciaAlta, textoBoletimWhatsApp } = await montarDigest(filtroCliente);

    const envioDigest = await dispararWebhooksAlertaAlta(
      urgenciaAlta.slice(0, 10).map((p) => ({
        numeroProcesso: p.numeroFormatado,
        tribunal: p.siglaTribunal,
        tipoAto: p.ultimoStatusDetectado,
        prazoFatal: p.prazoFatal || undefined,
        statusConcorrencia: p.statusConcorrencia,
      })),
      'DIGEST_MATINAL_08H',
      textoBoletimWhatsApp
    );

    return NextResponse.json({
      sucesso: true,
      textoBoletimWhatsApp,
      envioDigest,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao disparar digest';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
