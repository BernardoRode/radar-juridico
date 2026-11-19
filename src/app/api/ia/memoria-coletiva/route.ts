import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { salvarMinutaValidadaAnonimizada } from '@/lib/memoria-coletiva';

/**
 * GET /api/ia/memoria-coletiva
 * Issue #78: Lista estatísticas anonimizadas por Vara/Tribunal e modelos de minutas validadas.
 */
export async function GET() {
  try {
    const [perfisVara, modelosMinuta] = await Promise.all([
      prisma.perfilColetivoVara.findMany({
        orderBy: { totalAnalises: 'desc' },
        take: 30,
      }),
      prisma.modeloMinutaValidada.findMany({
        orderBy: [{ aprovacoes: 'desc' }, { atualizadoEm: 'desc' }],
        take: 20,
        select: {
          id: true,
          tipoMinuta: true,
          siglaTribunal: true,
          tituloPeca: true,
          aprovacoes: true,
          atualizadoEm: true,
        },
      }),
    ]);

    return NextResponse.json({
      sucesso: true,
      lgpdAnonimizado: true,
      totalVarasMapeadas: perfisVara.length,
      totalModelosMinuta: modelosMinuta.length,
      perfisVara: perfisVara.map((p) => ({
        ...p,
        sumulasTemas: p.sumulasTemasJson ? JSON.parse(p.sumulasTemasJson) : [],
      })),
      modelosMinuta,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao consultar memória coletiva';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * POST /api/ia/memoria-coletiva
 * Issue #78: Aprova uma pré-minuta na Biblioteca Viva (100% anonimizada LGPD — sem nomes/CPFs/CNJs).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tipoMinuta = String(body?.tipoMinuta || 'RESPOSTA_AUTOMATICA').trim();
    const siglaTribunal = String(body?.siglaTribunal || 'GERAL').trim();
    const tituloPeca = String(body?.tituloPeca || 'Petição Validada').trim();
    const minutaOriginal = String(body?.minutaTexto || '').trim();

    if (minutaOriginal.length < 40) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o texto da minuta (mínimo 40 caracteres) para salvar.' },
        { status: 400 }
      );
    }

    const salvo = await salvarMinutaValidadaAnonimizada({
      tipoMinuta,
      siglaTribunal,
      tituloPeca,
      minutaOriginal,
    });

    return NextResponse.json({
      sucesso: true,
      lgpdAnonimizado: true,
      modelo: {
        id: salvo.id,
        tipoMinuta: salvo.tipoMinuta,
        siglaTribunal: salvo.siglaTribunal,
        tituloPeca: salvo.tituloPeca,
        estruturaAnonimizada: salvo.estruturaAnonimizada,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao salvar minuta validada';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
