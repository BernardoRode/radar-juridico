import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function anonimizarCpf(texto?: string | null): string | null {
  if (!texto) return null;
  return texto
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**')
    .replace(/\b\d{11}\b/g, '***********');
}

/**
 * POST /api/compartilhar
 * Issue #25 (Portal do Cliente White-Label) + Issue #60 (Link Temporário 48h para Correspondente).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tipo =
      body?.tipo === 'PORTAL_CLIENTE' ? 'PORTAL_CLIENTE' : 'CORRESPONDENTE_48H';
    const escopo = String(body?.escopo || '').trim();
    const anonimizarLgpd = Boolean(body?.anonimizarLgpd);
    const horasValidade = Math.min(
      24 * 30,
      Math.max(1, Number(body?.horasValidade || (tipo === 'CORRESPONDENTE_48H' ? 48 : 168)))
    );

    if (!escopo) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Informe o escopo (número CNJ do processo para correspondente ou nome do cliente para portal).',
        },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(20).toString('hex');
    const expiraEm = new Date(Date.now() + horasValidade * 60 * 60 * 1000);

    const link = await prisma.linkCompartilhamento.create({
      data: {
        token,
        tipo,
        escopo: tipo === 'CORRESPONDENTE_48H' ? escopo.replace(/[^0-9]/g, '') || escopo : escopo,
        anonimizarLgpd,
        expiraEm,
      },
    });

    const origin = new URL(request.url).origin;
    return NextResponse.json(
      {
        sucesso: true,
        link: {
          ...link,
          urlPublica: `${origin}/compartilhado/${token}`,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar link compartilhável';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * GET /api/compartilhar?token=<token>
 * Retorna exclusivamente os dados autorizados pelo link temporário válido.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token')?.trim();

    if (!token) {
      return NextResponse.json({ sucesso: false, erro: 'Informe ?token=.' }, { status: 400 });
    }

    const registro = await prisma.linkCompartilhamento.findUnique({
      where: { token },
    });

    if (!registro) {
      return NextResponse.json(
        { sucesso: false, erro: 'Link não encontrado ou revogado.' },
        { status: 404 }
      );
    }

    if (registro.expiraEm.getTime() < Date.now()) {
      return NextResponse.json(
        { sucesso: false, erro: 'Este link temporário expirou. Solicite um novo ao escritório.' },
        { status: 410 }
      );
    }

    if (registro.tipo === 'CORRESPONDENTE_48H') {
      const proc = await prisma.processo.findUnique({
        where: { numeroProcesso: registro.escopo.replace(/[^0-9]/g, '') },
        include: {
          publicacoes: { orderBy: { criadoEm: 'desc' }, take: 20 },
          documentos: { orderBy: { criadoEm: 'desc' }, take: 10 },
        },
      });

      if (!proc) {
        return NextResponse.json(
          { sucesso: false, erro: 'Processo vinculado ao link não localizado no banco.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        sucesso: true,
        tipo: registro.tipo,
        expiraEm: registro.expiraEm,
        anonimizarLgpd: registro.anonimizarLgpd,
        processo: registro.anonimizarLgpd
          ? {
              ...proc,
              partesJson: anonimizarCpf(proc.partesJson),
              publicacoes: proc.publicacoes.map((p) => ({
                ...p,
                texto: anonimizarCpf(p.texto) || '',
              })),
              documentos: proc.documentos.map((d) => ({
                ...d,
                textoExtraido: anonimizarCpf(d.textoExtraido),
              })),
            }
          : proc,
      });
    }

    // PORTAL_CLIENTE
    const todos = await prisma.processo.findMany({
      where: { ignoradoHomonimo: false },
      include: {
        _count: { select: { publicacoes: true, documentos: true } },
      },
      orderBy: { atualizadoEm: 'desc' },
      take: 200,
    });

    const filtro = registro.escopo.toUpperCase();
    const filtrados = todos.filter((p) => (p.partesJson || '').toUpperCase().includes(filtro));

    return NextResponse.json({
      sucesso: true,
      tipo: registro.tipo,
      cliente: registro.escopo,
      expiraEm: registro.expiraEm,
      anonimizarLgpd: registro.anonimizarLgpd,
      totalProcessos: filtrados.length,
      processos: registro.anonimizarLgpd
        ? filtrados.map((p) => ({ ...p, partesJson: anonimizarCpf(p.partesJson) }))
        : filtrados,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao consultar link';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
