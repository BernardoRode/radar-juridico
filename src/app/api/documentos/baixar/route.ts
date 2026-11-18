import { NextRequest, NextResponse } from 'next/server';
import { extrairDocumentoPorUrl } from '@/lib/crawler-documentos';

/**
 * GET /api/documentos/baixar?url=<url_validacao>
 * Faz o download do PDF original assinado pelo magistrado e o retorna em streaming binário (application/pdf).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url')?.trim();

    if (!url || !url.startsWith('http')) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o parâmetro ?url= com um link válido do PJe ou tribunal.' },
        { status: 400 }
      );
    }

    const { resultado, pdfBuffer } = await extrairDocumentoPorUrl(url);

    if (!pdfBuffer) {
      return NextResponse.json(
        {
          sucesso: false,
          statusExtracao: resultado.statusExtracao,
          erro: resultado.mensagem,
        },
        { status: resultado.statusExtracao === 'CAPTCHA_NECESSARIO' ? 403 : 404 }
      );
    }

    const nomeArquivo = (resultado.tituloDocumento || 'documento-judicial')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nomeArquivo}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao baixar documento.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
