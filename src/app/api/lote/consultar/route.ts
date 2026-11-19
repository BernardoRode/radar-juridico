import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { consultarDatajudProcesso } from '@/lib/datajud';
import { enviarComRetryHmac } from '@/lib/webhooks';
import { validarUrlWebhookSegura } from '@/lib/seguranca';
import { verificarAcessoApi } from '@/lib/auth-jwt';

async function processarJobLote(jobId: string, tipo: string, itens: string[], callbackUrl?: string) {
  const resultados: Array<{
    item: string;
    sucesso: boolean;
    tribunal?: string;
    totalMovimentos?: number;
    ultimoStatus?: string;
  }> = [];
  let sucessos = 0;
  let falhas = 0;

  for (const rawItem of itens) {
    const limpo = rawItem.replace(/[^0-9]/g, '');
    try {
      if (tipo === 'PROCESSOS' && limpo.length === 20) {
        const procLocal = await prisma.processo.findUnique({
          where: { numeroProcesso: limpo },
        });
        if (procLocal) {
          sucessos += 1;
          resultados.push({
            item: rawItem,
            sucesso: true,
            tribunal: procLocal.siglaTribunal,
            ultimoStatus: procLocal.ultimoStatusDetectado,
          });
        } else {
          const dj = await consultarDatajudProcesso(limpo);
          if (dj.encontrado) {
            sucessos += 1;
            resultados.push({
              item: rawItem,
              sucesso: true,
              tribunal: dj.tribunal,
              totalMovimentos: dj.totalMovimentos,
              ultimoStatus: dj.movimentos?.[0]?.nome || 'Localizado no Datajud',
            });
          } else {
            falhas += 1;
            resultados.push({
              item: rawItem,
              sucesso: false,
              ultimoStatus: dj.mensagem || 'Não localizado',
            });
          }
        }
      } else {
        // Busca por CNPJ/CPF/Nome no banco local
        const encontrados = await prisma.processo.count({
          where: {
            OR: [
              { partesJson: { contains: rawItem } },
              ...(limpo ? [{ partesJson: { contains: limpo } }] : []),
            ],
          },
        });
        sucessos += 1;
        resultados.push({
          item: rawItem,
          sucesso: true,
          ultimoStatus: `${encontrados} processo(s) vinculado(s) na base`,
        });
      }
    } catch {
      falhas += 1;
      resultados.push({ item: rawItem, sucesso: false, ultimoStatus: 'Erro ao consultar item' });
    }
  }

  const jobFinalizado = await prisma.jobLoteConsulta.update({
    where: { id: jobId },
    data: {
      status: 'CONCLUIDO',
      processados: itens.length,
      sucessos,
      falhas,
      resultadosJson: JSON.stringify(resultados),
      finalizadoEm: new Date(),
    },
  });

  if (callbackUrl) {
    const payloadStr = JSON.stringify({
      evento: 'LOTE_CONSULTA_CONCLUIDO',
      jobId: jobFinalizado.id,
      tipo: jobFinalizado.tipo,
      totalItens: jobFinalizado.totalItens,
      sucessos,
      falhas,
      resultados,
    });
    await enviarComRetryHmac(callbackUrl, payloadStr, 2).catch(() => {});
  }

  return { sucessos, falhas, resultados };
}

/**
 * POST /api/lote/consultar
 * Issue #87: Consulta e Monitoramento Assíncrono em Massa (50 a 500 números CNJ ou CNPJs)
 * com gravação de progresso em `JobLoteConsulta` e callback webhook opcional.
 */
export async function POST(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const body = await request.json();
    const tipo = body?.tipo === 'CNPJS' ? 'CNPJS' : 'PROCESSOS';
    const itensRaw: unknown[] = Array.isArray(body?.itens) ? body.itens : [];
    const itens = itensRaw
      .map((i) => String(i || '').trim())
      .filter(Boolean)
      .slice(0, 500);
    const callbackUrl = body?.callbackUrl ? String(body.callbackUrl).trim() : undefined;
    const sincrono = body?.sincrono !== false && itens.length <= 15;

    if (itens.length === 0) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Envie um array "itens" com ao menos 1 número CNJ ou CNPJ (máximo 500 por lote).',
        },
        { status: 400 }
      );
    }

    if (callbackUrl) {
      const validacao = await validarUrlWebhookSegura(callbackUrl);
      if (!validacao.valida) {
        return NextResponse.json(
          { sucesso: false, erro: validacao.motivo || 'callbackUrl bloqueada por segurança (SSRF).' },
          { status: 400 }
        );
      }
    }

    const job = await prisma.jobLoteConsulta.create({
      data: {
        organizacaoId: acesso.usuario?.organizacao || null,
        tipo,
        status: 'EM_ANDAMENTO',
        totalItens: itens.length,
        callbackUrl: callbackUrl || null,
        entradasJson: JSON.stringify(itens),
      },
    });

    if (sincrono) {
      const { sucessos, falhas, resultados } = await processarJobLote(
        job.id,
        tipo,
        itens,
        callbackUrl
      );
      return NextResponse.json({
        sucesso: true,
        jobId: job.id,
        status: 'CONCLUIDO',
        totalItens: itens.length,
        sucessos,
        falhas,
        statusUrl: `/api/lote/${job.id}`,
        resultados,
      });
    }

    // Lotes maiores processam em background sem travar a requisição HTTP
    void processarJobLote(job.id, tipo, itens, callbackUrl);

    return NextResponse.json(
      {
        sucesso: true,
        jobId: job.id,
        status: 'EM_ANDAMENTO',
        totalItens: itens.length,
        statusUrl: `/api/lote/${job.id}`,
        mensagem:
          'Lote recebido e em processamento assíncrono. Consulte statusUrl ou aguarde o callbackUrl.',
      },
      { status: 202 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao criar lote de consulta';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
