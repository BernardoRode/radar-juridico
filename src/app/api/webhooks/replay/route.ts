import { NextRequest, NextResponse } from 'next/server';
import { reprocessarWebhooksFalhos } from '@/lib/webhooks';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * POST /api/webhooks/replay
 * Issue #83: Reprocessa entregas de webhooks com `sucesso: false` preservando o `X-Radar-Event-Id`
 * original para garantir idempotência quando o servidor do cliente voltar ao ar.
 */
export async function POST(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request, ['ADMIN', 'SOCIO', 'CONTROLADORIA', 'ADVOGADO']);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const body = await request.json().catch(() => ({}));
    const logId = body?.logId ? String(body.logId).trim() : undefined;
    const limite = body?.limite ? Number(body.limite) : 20;

    const resultado = await reprocessarWebhooksFalhos({ logId, limite });
    return NextResponse.json({
      sucesso: true,
      replay: resultado,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao executar replay de webhooks';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
