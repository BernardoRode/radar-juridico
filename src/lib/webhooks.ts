import { prisma } from '@/lib/prisma';

export interface AlertaUrgenciaPayload {
  numeroProcesso: string;
  tribunal: string;
  tipoAto: string;
  prazoFatal?: string;
  statusConcorrencia: string;
}

/**
 * Dispara notificações HTTP POST (Webhook / WhatsApp Gateway / Push Service)
 * para todos os destinos ativos quando surgirem alertas de urgência ALTA.
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
      try {
        const res = await fetch(wh.urlDestino, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            canal: wh.canal,
            destinoNome: wh.nome,
          }),
        });
        if (res.ok) enviados += 1;
        else falhas += 1;
      } catch {
        falhas += 1;
      }
    })
  );

  return { enviados, falhas };
}
