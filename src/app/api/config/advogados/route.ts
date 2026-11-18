import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const advogados = await prisma.advogadoEscritorio.findMany({
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
    const body = await request.json();
    const nome = String(body.nome || '').trim();
    const numeroOab = String(body.numeroOab || '').replace(/[^0-9]/g, '');
    const ufOab = String(body.ufOab || '').trim().toUpperCase().slice(0, 2);

    if (!nome || !numeroOab || ufOab.length !== 2) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe nome, número da OAB e UF (2 letras).' },
        { status: 400 }
      );
    }

    const advogado = await prisma.advogadoEscritorio.upsert({
      where: { numeroOab_ufOab: { numeroOab, ufOab } },
      create: { nome, numeroOab, ufOab },
      update: { nome, ativo: true },
    });
    return NextResponse.json({ sucesso: true, advogado }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao salvar advogado';
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
