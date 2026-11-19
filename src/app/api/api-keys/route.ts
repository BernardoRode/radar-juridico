import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  gerarNovaApiKeyBruta,
  resolverEscopoOrganizacao,
} from '@/lib/tenant';

const LIMITES_POR_PLANO: Record<string, number> = {
  FREE: 1000,
  PRO: 25000,
  ENTERPRISE: 250000,
};

/**
 * GET /api/api-keys
 * Issue #80: Lista API Keys B2B e consumo mensal do tenant autenticado (sem expor o hash).
 */
export async function GET(request: NextRequest) {
  try {
    const escopo = await resolverEscopoOrganizacao(request);
    const chaves = await prisma.apiKeyCliente.findMany({
      where: escopo.filtroPrisma,
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        nome: true,
        prefixo: true,
        plano: true,
        limiteMensal: true,
        usoMesAtual: true,
        mesReferencia: true,
        ativa: true,
        organizacaoId: true,
        ultimoUsoEm: true,
        criadoEm: true,
      },
    });

    return NextResponse.json({ sucesso: true, chaves });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar API Keys';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * POST /api/api-keys
 * Issue #80: Emite uma nova API Key B2B (`rk_live_...`), armazena apenas o SHA-256
 * e retorna a chave bruta uma única vez para o cliente.
 */
export async function POST(request: NextRequest) {
  try {
    const escopo = await resolverEscopoOrganizacao(request);
    const body = await request.json();
    const nome = String(body?.nome || '').trim();
    const plano = String(body?.plano || 'FREE').toUpperCase();
    const limiteCustom = Number(body?.limiteMensal);

    if (!nome) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o nome da integração/cliente para a API Key.' },
        { status: 400 }
      );
    }

    const planoValido = LIMITES_POR_PLANO[plano] ? plano : 'FREE';
    const limiteMensal =
      !Number.isNaN(limiteCustom) && limiteCustom > 0
        ? limiteCustom
        : LIMITES_POR_PLANO[planoValido];

    const { chaveBruta, prefixo, chaveHash } = gerarNovaApiKeyBruta();
    const agora = new Date();
    const mesReferencia = `${agora.getUTCFullYear()}-${String(
      agora.getUTCMonth() + 1
    ).padStart(2, '0')}`;

    const criada = await prisma.apiKeyCliente.create({
      data: {
        nome,
        prefixo,
        chaveHash,
        plano: planoValido,
        limiteMensal,
        usoMesAtual: 0,
        mesReferencia,
        organizacaoId: escopo.organizacaoId || body?.organizacaoId || null,
      },
      select: {
        id: true,
        nome: true,
        prefixo: true,
        plano: true,
        limiteMensal: true,
        mesReferencia: true,
        criadoEm: true,
      },
    });

    return NextResponse.json({
      sucesso: true,
      aviso: 'Guarde esta chave agora — ela não será exibida novamente por segurança.',
      apiKey: chaveBruta,
      registro: criada,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao criar API Key';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/api-keys?id=...
 * Issue #80: Revoga/desativa uma API Key B2B.
 */
export async function DELETE(request: NextRequest) {
  try {
    const escopo = await resolverEscopoOrganizacao(request);
    const id = request.nextUrl.searchParams.get('id')?.trim();
    if (!id) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe ?id=... da API Key.' },
        { status: 400 }
      );
    }

    await prisma.apiKeyCliente.deleteMany({
      where: { id, ...escopo.filtroPrisma },
    });

    return NextResponse.json({ sucesso: true, mensagem: 'API Key revogada.' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao revogar API Key';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
