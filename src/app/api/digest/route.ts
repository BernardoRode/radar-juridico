import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/digest?cliente=<opcional>
 * Issue #21 (Digest Matinal 08h) + Issue #25 (Portal do Cliente White-Label).
 * Retorna o boletim executivo consolidado com prazos urgentes, novas citações sem advogado
 * e processos filtrados para o departamento jurídico do cliente.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filtroCliente = searchParams.get('cliente')?.trim().toUpperCase();

    const todosProcessos = await prisma.processo.findMany({
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

    const urgenciaAlta = processos.filter((p) => p.urgenciaMaxima === 'ALTA');
    const semAdvogado = processos.filter(
      (p) => p.statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO'
    );
    const comPrazoFatal = processos.filter((p) => !!p.prazoFatal);

    const textoBoletimWhatsApp = [
      `🌅 *DIGEST MATINAL — RADAR JURÍDICO (${new Date().toLocaleDateString('pt-BR')})*`,
      filtroCliente ? `🏢 Cliente: *${filtroCliente}*` : '🏢 Visão Geral do Escritório',
      `• Total de Processos Monitorados: *${processos.length}*`,
      `• Alertas de Alta Urgência: *${urgenciaAlta.length}*`,
      `• Processos com Prazo Fatal Aberto: *${comPrazoFatal.length}*`,
      `• Novas Citações Sem Advogado (Res. 455): *${semAdvogado.length}*`,
    ].join('\n');

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
      processosDestaque: processos.slice(0, 25),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar digest';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
