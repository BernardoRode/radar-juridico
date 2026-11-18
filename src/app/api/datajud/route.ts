import { NextRequest, NextResponse } from 'next/server';
import { consultarDatajudProcesso } from '@/lib/datajud';

/**
 * GET /api/datajud?numeroProcesso=<20_digitos>&siglaTribunal=<opcional>
 * Consulta a API Pública do Datajud (CNJ) para enriquecer a capa do processo (classe, assuntos TPU,
 * data de ajuizamento) e a árvore completa de movimentações.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const numeroProcesso = searchParams.get('numeroProcesso')?.trim();
    const siglaTribunal = searchParams.get('siglaTribunal')?.trim();

    if (!numeroProcesso) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Informe o parâmetro ?numeroProcesso= (20 dígitos padrão CNJ).',
        },
        { status: 400 }
      );
    }

    const dados = await consultarDatajudProcesso(numeroProcesso, siglaTribunal);

    return NextResponse.json({
      sucesso: true,
      datajud: dados,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao consultar Datajud';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
