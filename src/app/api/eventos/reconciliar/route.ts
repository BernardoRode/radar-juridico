import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * GET /api/eventos/reconciliar?desde=ISO&ate=ISO&limite=100
 * Issue #105: Endpoint de reconciliação cronológica ("polling de fechamento") para que
 * sistemas clientes garantam zero perda de publicações/eventos mesmo após quedas.
 */
export async function GET(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const { searchParams } = new URL(request.url);
    const desdeRaw = searchParams.get('desde');
    const ateRaw = searchParams.get('ate');
    const limite = Math.min(200, Math.max(1, Number(searchParams.get('limite') || '100')));

    const desde = desdeRaw
      ? new Date(desdeRaw)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ate = ateRaw ? new Date(ateRaw) : new Date();

    if (isNaN(desde.getTime()) || isNaN(ate.getTime())) {
      return NextResponse.json(
        { sucesso: false, erro: 'Parâmetros "desde" ou "ate" inválidos (use ISO-8601).' },
        { status: 400 }
      );
    }

    const publicacoes = await prisma.publicacao.findMany({
      where: {
        criadoEm: {
          gte: desde,
          lte: ate,
        },
      },
      include: {
        processo: {
          select: {
            numeroProcesso: true,
            numeroFormatado: true,
            siglaTribunal: true,
            statusConcorrencia: true,
            faseProcessual: true,
            prazoFatal: true,
          },
        },
      },
      orderBy: { criadoEm: 'asc' },
      take: limite,
    });

    const eventos = publicacoes.map((pub, idx) => ({
      sequenceNumber: idx + 1,
      eventId: `pub_${pub.cnjId}`,
      occurredAt: pub.criadoEm.toISOString(),
      numeroProcesso: pub.processo.numeroProcesso,
      numeroFormatado: pub.processo.numeroFormatado,
      siglaTribunal: pub.processo.siglaTribunal,
      statusConcorrencia: pub.processo.statusConcorrencia,
      tipoComunicacao: pub.tipoComunicacao,
      tipoAtoDetectado: pub.tipoAtoDetectado,
      faseProcessual: pub.faseProcessual,
      prazoFatal: pub.prazoFatal,
      urgencia: pub.urgencia,
      dataDisponibilizacao: pub.dataDisponibilizacao,
    }));

    return NextResponse.json({
      sucesso: true,
      janela: { desde: desde.toISOString(), ate: ate.toISOString() },
      totalEventos: eventos.length,
      eventos,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao reconciliar eventos';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
