import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolverEscopoOrganizacao } from '@/lib/tenant';

/**
 * GET /api/processos
 * Lista todas as pastas de processos persistidas automaticamente no banco de dados.
 * Issue #79: Filtra automaticamente por `organizacaoId` quando autenticado.
 */
export async function GET(request: NextRequest) {
  try {
    const escopo = await resolverEscopoOrganizacao(request);
    if (escopo.erroQuota) return escopo.erroQuota;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim();
    const incluirIgnorados = searchParams.get('incluirIgnorados') === 'true';

    const where: Record<string, unknown> = { ...escopo.filtroPrisma };
    if (status) where.statusConcorrencia = status;
    if (!incluirIgnorados) where.ignoradoHomonimo = false;

    const processos = await prisma.processo.findMany({
      where,
      include: {
        _count: {
          select: { publicacoes: true, documentos: true },
        },
      },
      orderBy: { atualizadoEm: 'desc' },
      take: 150,
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

/**
 * PATCH /api/processos
 * Issues #38, #42, #44, #64: Persiste no banco as ações operacionais da controladoria:
 * - ignoradoHomonimo (Marcar como Homônimo)
 * - prazoBaixado (Confirmar Baixa de Prazo)
 * - minutaPronta (Check D-2 da Controladoria)
 * - checklistPericiaJson (Itens marcados do checklist de perícia)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body?.id ? String(body.id).trim() : undefined;
    const numeroProcesso = body?.numeroProcesso
      ? String(body.numeroProcesso).replace(/[^0-9]/g, '')
      : undefined;

    if (!id && !numeroProcesso) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe id ou numeroProcesso para atualizar o processo.' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (typeof body.ignoradoHomonimo === 'boolean') {
      data.ignoradoHomonimo = body.ignoradoHomonimo;
    }
    if (typeof body.prazoBaixado === 'boolean') {
      data.prazoBaixado = body.prazoBaixado;
      data.prazoBaixadoEm = body.prazoBaixado ? new Date() : null;
    }
    if (typeof body.minutaPronta === 'boolean') {
      data.minutaPronta = body.minutaPronta;
    }
    if (body.checklistPericiaJson !== undefined) {
      data.checklistPericiaJson =
        typeof body.checklistPericiaJson === 'string'
          ? body.checklistPericiaJson
          : JSON.stringify(body.checklistPericiaJson);
    }

    const processo = await prisma.processo.update({
      where: id ? { id } : { numeroProcesso: numeroProcesso! },
      data,
    });

    return NextResponse.json({ sucesso: true, processo });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao atualizar processo';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
