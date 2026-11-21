import { NextRequest } from 'next/server';
import { resolverEscopoOrganizacao } from '@/lib/tenant';
import {
  assinarEventosTempoReal,
  obterEventosRecentesBuffer,
} from '@/lib/eventos-stream';

export const dynamic = 'force-dynamic';

/**
 * Issue #97: Stream SSE (Server-Sent Events) em tempo real para publicações,
 * alertas críticos, entregas de webhook e DLQ.
 */
export async function GET(request: NextRequest) {
  const escopo = await resolverEscopoOrganizacao(request);
  if (escopo.erroQuota) return escopo.erroQuota;

  const encoder = new TextEncoder();
  let limparAssinatura: (() => void) | null = null;
  let timerHeartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enviar = (eventName: string, payload: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          // Stream já fechado
        }
      };

      enviar('connected', {
        status: 'CONECTADO',
        timestamp: new Date().toISOString(),
        organizacaoId: escopo.organizacaoId,
      });

      const recentes = obterEventosRecentesBuffer(10).filter(
        (ev) => !escopo.organizacaoId || !ev.organizacaoId || ev.organizacaoId === escopo.organizacaoId
      );
      if (recentes.length > 0) {
        enviar('snapshot', { eventos: recentes });
      }

      limparAssinatura = assinarEventosTempoReal((evento) => {
        if (
          escopo.organizacaoId &&
          evento.organizacaoId &&
          evento.organizacaoId !== escopo.organizacaoId
        ) {
          return;
        }
        enviar(evento.tipo.toLowerCase(), evento);
      });

      timerHeartbeat = setInterval(() => {
        enviar('ping', { timestamp: new Date().toISOString() });
      }, 15000);

      request.signal.addEventListener('abort', () => {
        if (limparAssinatura) limparAssinatura();
        if (timerHeartbeat) clearInterval(timerHeartbeat);
        try {
          controller.close();
        } catch {
          // Já fechado
        }
      });
    },
    cancel() {
      if (limparAssinatura) limparAssinatura();
      if (timerHeartbeat) clearInterval(timerHeartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
