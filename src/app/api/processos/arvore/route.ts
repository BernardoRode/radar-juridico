import { NextRequest, NextResponse } from 'next/server';
import { resolverEscopoOrganizacao } from '@/lib/tenant';
import { aplicarHeadersQuota } from '@/lib/billing-quota';
import {
  construirArvoreCrossGrau,
  GrauProcesso,
  registrarVinculosCrossGrau,
  TipoVinculoCrossGrau,
} from '@/lib/arvore-cross-grau';

/**
 * Issue #92: Retorna a árvore processual cross-grau (1º Grau, 2º Grau, STJ/TST e Cumprimento).
 * GET /api/processos/arvore?numeroProcesso=0000000-00.0000.0.00.0000
 */
export async function GET(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const { searchParams } = new URL(request.url);
  const numeroProcesso = searchParams.get('numeroProcesso') || '';
  if (!numeroProcesso.replace(/[^0-9]/g, '')) {
    return NextResponse.json(
      { sucesso: false, erro: 'Informe o parâmetro ?numeroProcesso=' },
      { status: 400 }
    );
  }

  try {
    const arvore = await construirArvoreCrossGrau(numeroProcesso);
    const resp = NextResponse.json({
      sucesso: true,
      ...arvore,
    });
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao montar árvore cross-grau.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * POST /api/processos/arvore -> Cria vínculo explícito entre dois processos (ex: 1º Grau <-> Agravo/STJ/Cumprimento).
 */
export async function POST(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  try {
    const body = (await request.json()) as {
      numeroOrigem?: string;
      numeroRelacionado?: string;
      tipoVinculo?: TipoVinculoCrossGrau;
      grauOrigem?: GrauProcesso;
      grauRelacionado?: GrauProcesso;
      tribunalOrigem?: string;
      tribunalRelacionado?: string;
      evidencia?: string;
    };

    if (!body.numeroOrigem || !body.numeroRelacionado || !body.tipoVinculo) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Informe numeroOrigem, numeroRelacionado e tipoVinculo.',
        },
        { status: 400 }
      );
    }

    const salvos = await registrarVinculosCrossGrau([
      {
        numeroOrigem: body.numeroOrigem,
        numeroRelacionado: body.numeroRelacionado,
        tipoVinculo: body.tipoVinculo,
        grauOrigem: body.grauOrigem,
        grauRelacionado: body.grauRelacionado,
        tribunalOrigem: body.tribunalOrigem,
        tribunalRelacionado: body.tribunalRelacionado,
        evidencia: body.evidencia || 'Vínculo registrado via API Cross-Grau',
      },
    ]);

    const arvore = await construirArvoreCrossGrau(body.numeroOrigem);
    const resp = NextResponse.json({
      sucesso: true,
      vinculosRegistrados: salvos,
      arvore,
    });
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao vincular processos.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
