import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolverEscopoOrganizacao } from '@/lib/tenant';
import { aplicarHeadersQuota } from '@/lib/billing-quota';
import {
  calcularRiscoJudicializacao,
  normalizarCanalPreProcessual,
  normalizarStatusPreProcessual,
} from '@/lib/pre-processual';
import { publicarEventoTempoReal } from '@/lib/eventos-stream';

/**
 * Issue #95: Legal Ops Pré-Processual — Lista reclamações (Procon / Consumidor.gov / Reclame Aqui).
 */
export async function GET(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const { searchParams } = new URL(request.url);
  const canal = searchParams.get('canal');
  const status = searchParams.get('status');
  const risco = searchParams.get('risco');
  const empresa = searchParams.get('empresa');

  const itens = await prisma.reclamacaoPreProcessual.findMany({
    where: {
      ...escopo.filtroPrisma,
      ...(canal ? { canal: normalizarCanalPreProcessual(canal) } : {}),
      ...(status ? { status: normalizarStatusPreProcessual(status) } : {}),
      ...(risco ? { riscoJudicializacao: risco.toUpperCase() } : {}),
      ...(empresa ? { empresaReclamada: { contains: empresa } } : {}),
    },
    orderBy: { criadoEm: 'desc' },
    take: 200,
  });

  const resp = NextResponse.json({
    sucesso: true,
    total: itens.length,
    resumoRisco: {
      ALTO: itens.filter((i) => i.riscoJudicializacao === 'ALTO').length,
      MEDIO: itens.filter((i) => i.riscoJudicializacao === 'MEDIO').length,
      BAIXO: itens.filter((i) => i.riscoJudicializacao === 'BAIXO').length,
    },
    reclamacoes: itens,
  });
  return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
}

/**
 * POST /api/legal-ops/reclamacoes -> Ingestão via API/Webhook de Procon, Consumidor.gov ou Reclame Aqui.
 */
export async function POST(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  try {
    const body = (await request.json()) as {
      protocoloExterno?: string;
      canal?: string;
      empresaReclamada?: string;
      cnpjReclamada?: string;
      reclamanteNome?: string;
      reclamanteCpf?: string;
      assunto?: string;
      descricao?: string;
      valorPleiteado?: number;
      prazoResposta?: string;
    };

    if (!body.protocoloExterno || !body.empresaReclamada || !body.reclamanteNome) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Campos obrigatórios: protocoloExterno, empresaReclamada e reclamanteNome.',
        },
        { status: 400 }
      );
    }

    const canal = normalizarCanalPreProcessual(body.canal);
    const assunto = body.assunto || 'Reclamação de Consumo';
    const descricao = body.descricao || '';
    const riscoJudicializacao = calcularRiscoJudicializacao({
      canal,
      assunto,
      descricao,
      valorPleiteado: body.valorPleiteado,
    });

    const registro = await prisma.reclamacaoPreProcessual.upsert({
      where: {
        canal_protocoloExterno: {
          canal,
          protocoloExterno: body.protocoloExterno.trim(),
        },
      },
      create: {
        organizacaoId: escopo.organizacaoId,
        protocoloExterno: body.protocoloExterno.trim(),
        canal,
        empresaReclamada: body.empresaReclamada.trim(),
        cnpjReclamada: body.cnpjReclamada?.replace(/[^0-9]/g, '') || null,
        reclamanteNome: body.reclamanteNome.trim(),
        reclamanteCpf: body.reclamanteCpf?.replace(/[^0-9]/g, '') || null,
        assunto,
        descricao,
        valorPleiteado: body.valorPleiteado ?? null,
        prazoResposta: body.prazoResposta ?? null,
        riscoJudicializacao,
        payloadBrutoJson: JSON.stringify(body),
      },
      update: {
        assunto,
        descricao,
        valorPleiteado: body.valorPleiteado ?? undefined,
        prazoResposta: body.prazoResposta ?? undefined,
        riscoJudicializacao,
      },
    });

    publicarEventoTempoReal({
      tipo: 'RECLAMACAO_PRE_PROCESSUAL',
      organizacaoId: escopo.organizacaoId,
      dados: {
        id: registro.id,
        canal: registro.canal,
        protocoloExterno: registro.protocoloExterno,
        empresaReclamada: registro.empresaReclamada,
        riscoJudicializacao: registro.riscoJudicializacao,
      },
    });

    const resp = NextResponse.json(
      { sucesso: true, reclamacao: registro },
      { status: 201 }
    );
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao ingerir reclamação.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/legal-ops/reclamacoes -> Atualiza status ou vincula processo judicial convertido.
 */
export async function PATCH(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  try {
    const body = (await request.json()) as {
      id?: string;
      status?: string;
      numeroProcessoConvertido?: string;
    };

    if (!body.id) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o id da reclamação.' },
        { status: 400 }
      );
    }

    const atualizada = await prisma.reclamacaoPreProcessual.update({
      where: { id: body.id },
      data: {
        ...(body.status ? { status: normalizarStatusPreProcessual(body.status) } : {}),
        ...(body.numeroProcessoConvertido
          ? {
              numeroProcessoConvertido: body.numeroProcessoConvertido.replace(
                /[^0-9]/g,
                ''
              ),
              status: 'CONVERTIDA_EM_PROCESSO',
            }
          : {}),
      },
    });

    const resp = NextResponse.json({ sucesso: true, reclamacao: atualizada });
    return escopo.quota ? aplicarHeadersQuota(resp, escopo.quota) : resp;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao atualizar reclamação.';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
