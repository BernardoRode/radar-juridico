import { NextRequest, NextResponse } from 'next/server';
import { analisarPublicacaoComIA } from '@/lib/ia-juridica';

/**
 * POST /api/ia/analisar
 * Gera resumo executivo em 2 linhas e auditoria de riscos/falhas da concorrência.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const texto = String(body?.texto || '').trim();

    if (!texto) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o campo `texto` da publicação ou decisão.' },
        { status: 400 }
      );
    }

    const analise = await analisarPublicacaoComIA({
      texto,
      statusConcorrencia: body?.statusConcorrencia,
      tipoAtoDetectado: body?.tipoAtoDetectado,
      tribunal: body?.tribunal,
      numeroProcesso: body?.numeroProcesso,
    });

    return NextResponse.json({ sucesso: true, analise });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro na análise com IA';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
