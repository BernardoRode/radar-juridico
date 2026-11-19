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

/**
 * Issue #83: Gera identificador determinístico de evento (`X-Radar-Event-Id`)
 * para garantir idempotência no receptor do cliente mesmo em retries ou replays.
 */
export function gerarEventIdWebhook(evento: string, bodyStr: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${evento}|${bodyStr}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
  return `evt_${hash}`;
}

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

export async function enviarComRetryHmac(
  url: string,
  bodyStr: string,
  tentativas = 2,
  eventIdOverride?: string
): Promise<{
  ok: boolean;
  httpStatus?: number;
  tentativasExecutadas: number;
  eventId: string;
  erro?: string;
}> {
  const assinatura = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(bodyStr)
    .digest('hex');
  const eventId = eventIdOverride || gerarEventIdWebhook('WEBHOOK', bodyStr);

  let ultimoStatus: number | undefined;
  let ultimoErro: string | undefined;

  for (let i = 0; i <= tentativas; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Radar-Signature': `sha256=${assinatura}`,
          'X-Radar-Event-Id': eventId,
        },
        body: bodyStr,
      });
      ultimoStatus = res.status;
      if (res.ok) {
        return {
          ok: true,
          httpStatus: res.status,
          tentativasExecutadas: i + 1,
          eventId,
        };
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
    eventId,
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
    const payloadStr = JSON.stringify({
      from: process.env.EMAIL_FROM || 'Radar Jurídico <onboarding@resend.dev>',
      to: destino.split(',').map((e) => e.trim()),
      subject: assunto,
      text: texto,
    });
    const eventId = gerarEventIdWebhook(assunto, payloadStr);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: payloadStr,
    });
    await prisma.logEntregaWebhook
      .create({
        data: {
          eventId,
          canal: 'EMAIL',
          urlDestino: destino,
          evento: assunto,
          payloadJson: payloadStr,
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
 * Issue #9 + Issue #32 + Issue #75 + Issue #83: Dispara notificações resilientes (com Retry exponencial,
 * assinatura HMAC-SHA256 `X-Radar-Signature`, idempotência `X-Radar-Event-Id`, formatação por canal
 * e payload salvo em `LogEntregaWebhook` para Replay sob demanda).
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
      const eventId = gerarEventIdWebhook(evento, `${wh.id}|${bodyStr}`);
      const res = await enviarComRetryHmac(wh.urlDestino, bodyStr, 2, eventId);
      if (res.ok) enviados += 1;
      else falhas += 1;

      await prisma.logEntregaWebhook
        .create({
          data: {
            webhookId: wh.id,
            eventId: res.eventId,
            canal: wh.canal,
            urlDestino: wh.urlDestino,
            evento,
            payloadJson: bodyStr,
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

/**
 * Issue #83: Reprocessa entregas de webhooks que falharam (`sucesso: false`) preservando
 * o mesmo `X-Radar-Event-Id` e o `payloadJson` original.
 */
export async function reprocessarWebhooksFalhos(opcoes?: {
  logId?: string;
  limite?: number;
}): Promise<{
  totalTentados: number;
  reenviadosComSucesso: number;
  aindaComFalha: number;
}> {
  const logsFalhos = await prisma.logEntregaWebhook.findMany({
    where: {
      ...(opcoes?.logId ? { id: opcoes.logId } : { sucesso: false }),
      payloadJson: { not: null },
      canal: { not: 'EMAIL' },
    },
    orderBy: { criadoEm: 'desc' },
    take: Math.min(50, Math.max(1, opcoes?.limite ?? 20)),
  });

  let reenviadosComSucesso = 0;
  let aindaComFalha = 0;

  for (const log of logsFalhos) {
    if (!log.payloadJson) continue;
    const eventId = log.eventId || gerarEventIdWebhook(log.evento, log.payloadJson);
    const res = await enviarComRetryHmac(log.urlDestino, log.payloadJson, 1, eventId);
    if (res.ok) reenviadosComSucesso += 1;
    else aindaComFalha += 1;

    await prisma.logEntregaWebhook
      .update({
        where: { id: log.id },
        data: {
          eventId,
          sucesso: res.ok,
          httpStatus: res.httpStatus ?? log.httpStatus,
          tentativas: log.tentativas + res.tentativasExecutadas,
          erro: res.ok ? null : res.erro ?? log.erro,
        },
      })
      .catch(() => {});
  }

  return {
    totalTentados: logsFalhos.length,
    reenviadosComSucesso,
    aindaComFalha,
  };
}
