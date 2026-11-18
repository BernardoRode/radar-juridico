import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const clientes = await prisma.clienteMonitorado.findMany({
      orderBy: { criadoEm: 'desc' },
    });
    return NextResponse.json({ sucesso: true, clientes });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar clientes';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nome = String(body.nome || '').trim();
    const variacoes = body.variacoes ? String(body.variacoes).trim() : null;
    const cnpjs = body.cnpjs ? String(body.cnpjs).trim() : null;

    if (!nome) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o nome da empresa/cliente.' },
        { status: 400 }
      );
    }

    const cliente = await prisma.clienteMonitorado.create({
      data: { nome, variacoes, cnpjs },
    });
    return NextResponse.json({ sucesso: true, cliente }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao salvar cliente';
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
    await prisma.clienteMonitorado.delete({ where: { id } });
    return NextResponse.json({ sucesso: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao remover cliente';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
