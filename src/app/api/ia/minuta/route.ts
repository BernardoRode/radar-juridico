import { NextRequest, NextResponse } from 'next/server';
import { gerarPreMinutaPeticao } from '@/lib/ia-juridica';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/ia/minuta
 * Issue #15 + Issue #46 + Issue #68: Gera pré-minuta de resposta ou pedido de devolução de prazo (Art. 272 CPC),
 * enriquecida com o inteiro teor extraído do PDF (DocumentoOriginal) e LLM real quando configurada.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const numeroProcesso = String(body.numeroProcesso || '0000000-00.0000.0.00.0000');
    let textoPdfExtraido: string | undefined = body.textoPdfExtraido
      ? String(body.textoPdfExtraido)
      : undefined;

    if (!textoPdfExtraido) {
      const numLimpo = numeroProcesso.replace(/[^0-9]/g, '');
      if (numLimpo.length >= 10) {
        const docRecente = await prisma.documentoOriginal
          .findFirst({
            where: {
              processo: { numeroProcesso: numLimpo },
              textoExtraido: { not: null },
            },
            orderBy: { criadoEm: 'desc' },
            select: { textoExtraido: true },
          })
          .catch(() => null);
        if (docRecente?.textoExtraido) {
          textoPdfExtraido = docRecente.textoExtraido;
        }
      }
    }

    const resultado = await gerarPreMinutaPeticao({
      numeroProcesso,
      tribunal: body.tribunal || 'Tribunal',
      orgaoJulgador: body.orgaoJulgador || 'Juízo Competente',
      partes: Array.isArray(body.partes) ? body.partes : [],
      tipoAtoDetectado: body.tipoAtoDetectado || 'Comunicação Processual',
      textoPublicacao: body.textoPublicacao || '',
      textoPdfExtraido,
      tipoMinuta: body.tipoMinuta,
    });

    return NextResponse.json({
      sucesso: true,
      enriquecidaComPdf: Boolean(textoPdfExtraido),
      ...resultado,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar pré-minuta';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
