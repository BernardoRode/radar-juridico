import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/processos
 * Lista todas as pastas de processos persistidas automaticamente no banco de dados.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim();

    const processos = await prisma.processo.findMany({
      where: status ? { statusConcorrencia: status } : undefined,
      include: {
        _count: {
          select: { publicacoes: true, documentos: true },
        },
      },
      orderBy: { atualizadoEm: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      sucesso: true,
      total: processos.length,
      processos,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar processos';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
