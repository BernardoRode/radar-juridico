import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolverEscopoOrganizacao } from '@/lib/tenant';

export async function GET(request: NextRequest) {
  try {
    const escopo = await resolverEscopoOrganizacao(request);
    if (escopo.erroQuota) return escopo.erroQuota;

    const advogados = await prisma.advogadoEscritorio.findMany({
      where: escopo.filtroPrisma,
      orderBy: { criadoEm: 'desc' },
    });
    return NextResponse.json({ sucesso: true, advogados });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar advogados';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const escopo = await resolverEscopoOrganizacao(request);
    if (escopo.erroQuota) return escopo.erroQuota;

    const body = await request.json();
    const nome = String(body.nome || '').trim();
    const numeroOab = String(body.numeroOab || '').replace(/[^0-9]/g, '');
    const ufOab = String(body.ufOab || '').trim().toUpperCase().slice(0, 2);
    const emFeriasAte = body.emFeriasAte ? String(body.emFeriasAte).trim() : null;
    const advogadoSubstituto = body.advogadoSubstituto
      ? String(body.advogadoSubstituto).trim()
      : null;

    if (!nome || !numeroOab || ufOab.length !== 2) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe nome, número da OAB e UF (2 letras).' },
        { status: 400 }
      );
    }

    const advogado = await prisma.advogadoEscritorio.upsert({
      where: { numeroOab_ufOab: { numeroOab, ufOab } },
      create: {
        nome,
        numeroOab,
        ufOab,
        emFeriasAte,
        advogadoSubstituto,
        organizacaoId: escopo.organizacaoId,
      },
      update: {
        nome,
        ativo: true,
        emFeriasAte,
        advogadoSubstituto,
        ...(escopo.organizacaoId ? { organizacaoId: escopo.organizacaoId } : {}),
      },
    });
    return NextResponse.json({ sucesso: true, advogado }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao salvar advogado';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/config/advogados
 * Issue #47: Atualiza férias (`emFeriasAte`), substituto (`advogadoSubstituto`) ou status `ativo`.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) {
      return NextResponse.json({ sucesso: false, erro: 'Informe id do advogado.' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.ativo === 'boolean') data.ativo = body.ativo;
    if (body.emFeriasAte !== undefined) {
      data.emFeriasAte = body.emFeriasAte ? String(body.emFeriasAte).trim() : null;
    }
    if (body.advogadoSubstituto !== undefined) {
      data.advogadoSubstituto = body.advogadoSubstituto
        ? String(body.advogadoSubstituto).trim()
        : null;
    }

    const advogado = await prisma.advogadoEscritorio.update({
      where: { id },
      data,
    });
    return NextResponse.json({ sucesso: true, advogado });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao atualizar advogado';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o parâmetro ?id=.' },
        { status: 400 }
      );
    }
    await prisma.advogadoEscritorio.delete({ where: { id } });
    return NextResponse.json({ sucesso: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao remover advogado';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
