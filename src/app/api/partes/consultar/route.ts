import { NextRequest, NextResponse } from 'next/server';
import { resolverEscopoOrganizacao } from '@/lib/tenant';
import { aplicarHeadersQuota } from '@/lib/billing-quota';
import {
  consultarPorDocumento,
  reindexarBaseLocalPartes,
} from '@/lib/indexador-partes';

/**
 * Issue #91: Consulta histórica de processos por CPF ou CNPJ na base indexada local.
 * GET /api/partes/consultar?documento=00000000000191
 */
export async function GET(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const { searchParams } = new URL(request.url);
  const documento = searchParams.get('documento') || '';

  if (!documento.replace(/[^0-9]/g, '')) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: 'Informe o parâmetro ?documento= com CPF (11 dígitos) ou CNPJ (14 dígitos).',
      },
      { status: 400 }
    );
  }

  try {
    const resultado = await consultarPorDocumento(documento, escopo.organizacaoId);
    const resp = NextResponse.json({
      sucesso: true,
      ...resultado,
    });
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao consultar documento.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * POST /api/partes/consultar -> Reindexa processos e publicações locais em ParteIndexada.
 */
export async function POST(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  try {
    const resumo = await reindexarBaseLocalPartes(escopo.organizacaoId);
    const resp = NextResponse.json({
      sucesso: true,
      mensagem: 'Reindexação histórica de CPFs/CNPJs concluída.',
      ...resumo,
    });
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao reindexar partes.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
