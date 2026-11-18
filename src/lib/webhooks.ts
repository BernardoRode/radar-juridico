import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export interface AlertaUrgenciaPayload {
  numeroProcesso: string;
  tribunal: string;
  tipoAto: string;
  prazoFatal?: string;
  statusConcorrencia: string;
}

const WEBHOOK_SECRET =
  process.env.WEBHOOK_HMAC_SECRET || 'radar-juridico-webhook-hmac-secret';

async function enviarComRetryHmac(url: string, bodyStr: string, tentativas = 2): Promise<boolean> {
  const assinatura = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(bodyStr)
    .digest('hex');

  for (let i = 0; i <= tentativas; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Radar-Signature': `sha256=${assinatura}`,
        },
        body: bodyStr,
      });
      if (res.ok) return true;
    } catch {
      // Backoff antes da próxima tentativa
    }
    if (i < tentativas) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return false;
}

/**
 * Issue #9 + Issue #32: Dispara notificações HTTP POST resilientes (com Retry exponencial
 * e assinatura HMAC-SHA256 `X-Radar-Signature`) para todos os destinos ativos.
 */
export async function dispararWebhooksAlertaAlta(
  alertas: AlertaUrgenciaPayload[]
): Promise<{ enviados: number; falhas: number }> {
  if (!alertas || alertas.length === 0) {
    return { enviados: 0, falhas: 0 };
  }

  const webhooks = await prisma.webhookAlerta.findMany({
    where: { ativo: true },
  });

  if (webhooks.length === 0) {
    return { enviados: 0, falhas: 0 };
  }

  let enviados = 0;
  let falhas = 0;

  const payload = {
    evento: 'ALERTA_URGENCIA_ALTA',
    sistema: 'RadarJuridico',
    disparadoEm: new Date().toISOString(),
    totalAlertas: alertas.length,
    alertas,
  };

  await Promise.all(
    webhooks.map(async (wh) => {
      const bodyStr = JSON.stringify({
        ...payload,
        canal: wh.canal,
        destinoNome: wh.nome,
      });
      const ok = await enviarComRetryHmac(wh.urlDestino, bodyStr, 2);
      if (ok) enviados += 1;
      else falhas += 1;
    })
  );

  return { enviados, falhas };
}
