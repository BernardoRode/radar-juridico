import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export interface AlertaUrgenciaPayload {
  numeroProcesso: string;
  tribunal: string;
  tipoAto: string;
  prazoFatal?: string;
  statusConcorrencia: string;
  substitutoFerias?: string;
}

const WEBHOOK_SECRET =
  process.env.WEBHOOK_HMAC_SECRET || 'radar-juridico-webhook-hmac-secret';

function formatarPayloadPorCanal(
  canal: string,
  destinoNome: string,
  evento: string,
  alertas: AlertaUrgenciaPayload[],
  mensagemLivre?: string
): string {
  const resumoLinhas =
    mensagemLivre ||
    alertas
      .map(
        (a) =>
          `• [${a.tribunal}] ${a.numeroProcesso} — ${a.tipoAto}${
            a.prazoFatal ? ` | Prazo Fatal: ${a.prazoFatal}` : ''
          }${a.substitutoFerias ? ` | Férias → Substituto: ${a.substitutoFerias}` : ''}`
      )
      .join('\n');

  if (canal === 'SLACK') {
    return JSON.stringify({
      text: `🚨 *Radar Jurídico — ${evento}* (${destinoNome})\n${resumoLinhas}`,
    });
  }

  if (canal === 'WHATSAPP') {
    return JSON.stringify({
      evento,
      canal: 'WHATSAPP',
      destinoNome,
      text: `⚖️ *Radar Jurídico — ${evento}*\n${resumoLinhas}`,
      message: `⚖️ *Radar Jurídico — ${evento}*\n${resumoLinhas}`,
      alertas,
    });
  }

  return JSON.stringify({
    evento,
    sistema: 'RadarJuridico',
    canal,
    destinoNome,
    disparadoEm: new Date().toISOString(),
    totalAlertas: alertas.length,
    mensagem: resumoLinhas,
    alertas,
  });
}

async function enviarComRetryHmac(
  url: string,
  bodyStr: string,
  tentativas = 2
): Promise<{ ok: boolean; httpStatus?: number; tentativasExecutadas: number; erro?: string }> {
  const assinatura = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(bodyStr)
    .digest('hex');

  let ultimoStatus: number | undefined;
  let ultimoErro: string | undefined;

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
      ultimoStatus = res.status;
      if (res.ok) {
        return { ok: true, httpStatus: res.status, tentativasExecutadas: i + 1 };
      }
      ultimoErro = `HTTP ${res.status}`;
    } catch (e: unknown) {
      ultimoErro = e instanceof Error ? e.message : 'Erro de rede';
    }
    if (i < tentativas) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return {
    ok: false,
    httpStatus: ultimoStatus,
    tentativasExecutadas: tentativas + 1,
    erro: ultimoErro,
  };
}

/**
 * Envio opcional via Resend API quando RESEND_API_KEY e EMAIL_DESTINO_ALERTAS estiverem configurados.
 */
async function tentarEnviarEmailResend(
  assunto: string,
  texto: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const destino = process.env.EMAIL_DESTINO_ALERTAS?.trim();
  if (!apiKey || !destino) return false;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Radar Jurídico <onboarding@resend.dev>',
        to: destino.split(',').map((e) => e.trim()),
        subject: assunto,
        text: texto,
      }),
    });
    await prisma.logEntregaWebhook
      .create({
        data: {
          canal: 'EMAIL',
          urlDestino: destino,
          evento: assunto,
          sucesso: res.ok,
          httpStatus: res.status,
          tentativas: 1,
          erro: res.ok ? null : `Resend HTTP ${res.status}`,
        },
      })
      .catch(() => {});
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Issue #9 + Issue #32 + Issue #75: Dispara notificações resilientes (com Retry exponencial,
 * assinatura HMAC-SHA256 `X-Radar-Signature`, formatação por canal e log persistido no banco).
 */
export async function dispararWebhooksAlertaAlta(
  alertas: AlertaUrgenciaPayload[],
  evento = 'ALERTA_URGENCIA_ALTA',
  mensagemLivre?: string
): Promise<{ enviados: number; falhas: number }> {
  if ((!alertas || alertas.length === 0) && !mensagemLivre) {
    return { enviados: 0, falhas: 0 };
  }

  const webhooks = await prisma.webhookAlerta.findMany({
    where: { ativo: true },
  });

  let enviados = 0;
  let falhas = 0;

  await Promise.all(
    webhooks.map(async (wh) => {
      const bodyStr = formatarPayloadPorCanal(
        wh.canal,
        wh.nome,
        evento,
        alertas,
        mensagemLivre
      );
      const res = await enviarComRetryHmac(wh.urlDestino, bodyStr, 2);
      if (res.ok) enviados += 1;
      else falhas += 1;

      await prisma.logEntregaWebhook
        .create({
          data: {
            webhookId: wh.id,
            canal: wh.canal,
            urlDestino: wh.urlDestino,
            evento,
            sucesso: res.ok,
            httpStatus: res.httpStatus ?? null,
            tentativas: res.tentativasExecutadas,
            erro: res.erro ?? null,
          },
        })
        .catch(() => {});
    })
  );

  // Envio adicional via e-mail Resend se configurado no .env
  const textoEmail =
    mensagemLivre ||
    alertas
      .map(
        (a) =>
          `[${a.tribunal}] ${a.numeroProcesso} - ${a.tipoAto} (Prazo: ${a.prazoFatal || 'N/I'})`
      )
      .join('\n');
  const emailOk = await tentarEnviarEmailResend(
    `[Radar Jurídico] ${evento}`,
    textoEmail
  );
  if (emailOk) enviados += 1;

  return { enviados, falhas };
}
