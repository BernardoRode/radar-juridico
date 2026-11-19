import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { avaliarRegraAutomacaoEmItem } from '@/lib/regras-automacao';
import { enviarComRetryHmac } from '@/lib/webhooks';
import { gerarPreMinutaPeticao } from '@/lib/ia-juridica';
import { validarUrlWebhookSegura } from '@/lib/seguranca';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * GET /api/regras
 * Issue #90: Lista todas as regras No-Code de automação e roteamento cadastradas.
 */
export async function GET(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const regras = await prisma.regraAutomacao.findMany({
      orderBy: { criadoEm: 'desc' },
    });
    return NextResponse.json({ sucesso: true, total: regras.length, regras });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar regras';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * POST /api/regras
 * - Se `?avaliar=true`: avalia um evento/publicação contra todas as regras ativas, disparando
 *   webhook customizado e/ou pré-minuta automática quando houver match.
 * - Caso contrário: cria uma nova `RegraAutomacao` No-Code.
 */
export async function POST(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const { searchParams } = new URL(request.url);
    const body = await request.json();

    if (searchParams.get('avaliar') === 'true') {
      const regrasAtivas = await prisma.regraAutomacao.findMany({
        where: { ativa: true },
      });

      const evento = {
        numeroProcesso: String(body?.numeroProcesso || '0000000-00.0000.0.00.0000'),
        tribunal: String(body?.tribunal || 'TRT4'),
        valorRS: Number(body?.valorRS || 0),
        tipoAto: String(body?.tipoAto || 'Sentença'),
        urgencia: String(body?.urgencia || 'ALTA'),
        statusConcorrencia: String(body?.statusConcorrencia || 'NOSSO_ESCRITORIO'),
        texto: String(body?.texto || ''),
      };

      const regrasAcionadas: Array<{
        regraId: string;
        nome: string;
        webhookEnviado: boolean;
        minutaGerada?: { tituloPeca: string; modo: string };
      }> = [];

      for (const regra of regrasAtivas) {
        if (!avaliarRegraAutomacaoEmItem(regra, evento)) continue;

        let webhookEnviado = false;
        if (regra.acaoWebhookUrl) {
          const payload = JSON.stringify({
            evento: 'REGRA_AUTOMACAO_ACIONADA',
            regraNome: regra.nome,
            prioridade: regra.acaoPrioridade,
            dadosProcesso: evento,
          });
          const resWh = await enviarComRetryHmac(regra.acaoWebhookUrl, payload, 1);
          webhookEnviado = resWh.ok;
        }

        let minutaGerada: { tituloPeca: string; modo: string } | undefined;
        if (regra.acaoGerarMinuta) {
          const m = await gerarPreMinutaPeticao({
            numeroProcesso: evento.numeroProcesso,
            tribunal: evento.tribunal,
            orgaoJulgador: `Juízo do ${evento.tribunal}`,
            partes: [],
            tipoAtoDetectado: evento.tipoAto,
            textoPublicacao: evento.texto || evento.tipoAto,
          });
          minutaGerada = { tituloPeca: m.tituloPeca, modo: m.modo };
        }

        await prisma.regraAutomacao
          .update({
            where: { id: regra.id },
            data: {
              totalDisparos: { increment: 1 },
              ultimoDisparoEm: new Date(),
            },
          })
          .catch(() => {});

        regrasAcionadas.push({
          regraId: regra.id,
          nome: regra.nome,
          webhookEnviado,
          minutaGerada,
        });
      }

      return NextResponse.json({
        sucesso: true,
        totalRegrasAvaliadas: regrasAtivas.length,
        totalAcionadas: regrasAcionadas.length,
        regrasAcionadas,
      });
    }

    const nome = String(body?.nome || '').trim();
    if (!nome) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe o nome da regra de automação.' },
        { status: 400 }
      );
    }

    const acaoWebhookUrl = body?.acaoWebhookUrl ? String(body.acaoWebhookUrl).trim() : null;
    if (acaoWebhookUrl) {
      const validacao = await validarUrlWebhookSegura(acaoWebhookUrl);
      if (!validacao.valida) {
        return NextResponse.json(
          { sucesso: false, erro: validacao.motivo || 'acaoWebhookUrl inválida.' },
          { status: 400 }
        );
      }
    }

    const regra = await prisma.regraAutomacao.create({
      data: {
        organizacaoId: acesso.usuario?.organizacao || null,
        nome,
        condTribunal: body?.condTribunal ? String(body.condTribunal).trim().toUpperCase() : null,
        condValorMinRS:
          body?.condValorMinRS !== undefined && body?.condValorMinRS !== null
            ? Number(body.condValorMinRS)
            : null,
        condTipoAto: body?.condTipoAto ? String(body.condTipoAto).trim() : null,
        condUrgencia: body?.condUrgencia ? String(body.condUrgencia).trim().toUpperCase() : null,
        condConcorrencia: body?.condConcorrencia
          ? String(body.condConcorrencia).trim().toUpperCase()
          : null,
        acaoWebhookUrl,
        acaoGerarMinuta: Boolean(body?.acaoGerarMinuta),
        acaoPrioridade: body?.acaoPrioridade ? String(body.acaoPrioridade).trim() : 'CRITICA',
      },
    });

    return NextResponse.json({ sucesso: true, regra }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao processar regra de automação';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) {
      return NextResponse.json({ sucesso: false, erro: 'Informe ?id=.' }, { status: 400 });
    }

    await prisma.regraAutomacao.delete({ where: { id } });
    return NextResponse.json({ sucesso: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao remover regra';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
