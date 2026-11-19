import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * GET /api/lote/[id]
 * Issue #87: Consulta o progresso e resultados consolidados de um JobLoteConsulta.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const { id } = await params;
    const job = await prisma.jobLoteConsulta.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { sucesso: false, erro: 'Job de lote não encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      job: {
        id: job.id,
        tipo: job.tipo,
        status: job.status,
        totalItens: job.totalItens,
        processados: job.processados,
        sucessos: job.sucessos,
        falhas: job.falhas,
        iniciadoEm: job.iniciadoEm,
        finalizadoEm: job.finalizadoEm,
        resultados: job.resultadosJson ? JSON.parse(job.resultadosJson) : [],
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao consultar status do lote';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
