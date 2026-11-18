import { NextRequest, NextResponse } from 'next/server';
import { gerarPreMinutaPeticao } from '@/lib/ia-juridica';

/**
 * POST /api/ia/minuta
 * Issue #15 + Issue #46: Gera pré-minuta de resposta ou pedido de devolução de prazo (Art. 272 CPC).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resultado = await gerarPreMinutaPeticao({
      numeroProcesso: body.numeroProcesso || '0000000-00.0000.0.00.0000',
      tribunal: body.tribunal || 'Tribunal',
      orgaoJulgador: body.orgaoJulgador || 'Juízo Competente',
      partes: Array.isArray(body.partes) ? body.partes : [],
      tipoAtoDetectado: body.tipoAtoDetectado || 'Comunicação Processual',
      textoPublicacao: body.textoPublicacao || '',
      tipoMinuta: body.tipoMinuta,
    });

    return NextResponse.json({ sucesso: true, ...resultado });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar pré-minuta';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
