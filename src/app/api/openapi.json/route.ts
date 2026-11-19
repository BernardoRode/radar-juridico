import { NextRequest, NextResponse } from 'next/server';
import { gerarEspecificacaoOpenApi } from '@/lib/openapi-spec';

/**
 * GET /api/openapi.json
 * Issue #80: Retorna especificação OpenAPI 3.1.0 completa de todas as rotas da API.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin || 'http://localhost:3000';
  return NextResponse.json(gerarEspecificacaoOpenApi(origin), {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
