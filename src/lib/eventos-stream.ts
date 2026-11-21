export interface EventoTempoReal {
  id: string;
  tipo:
    | 'NOVA_PUBLICACAO'
    | 'ALERTA_URGENCIA_ALTA'
    | 'WEBHOOK_ENTREGUE'
    | 'WEBHOOK_DLQ'
    | 'RECLAMACAO_PRE_PROCESSUAL'
    | 'SISTEMA';
  timestamp: string;
  organizacaoId?: string | null;
  dados: Record<string, unknown>;
}

type OuvinteEvento = (evento: EventoTempoReal) => void;

const globalForStream = globalThis as unknown as {
  radarStreamOuvintes?: Set<OuvinteEvento>;
  radarStreamHistorico?: EventoTempoReal[];
};

const ouvintes = globalForStream.radarStreamOuvintes ?? new Set<OuvinteEvento>();
const historico = globalForStream.radarStreamHistorico ?? [];

if (!globalForStream.radarStreamOuvintes) {
  globalForStream.radarStreamOuvintes = ouvintes;
}
if (!globalForStream.radarStreamHistorico) {
  globalForStream.radarStreamHistorico = historico;
}

/**
 * Issue #97: Publica um evento em tempo real para todos os clientes SSE conectados.
 */
export function publicarEventoTempoReal(
  evento: Omit<EventoTempoReal, 'id' | 'timestamp'>
): EventoTempoReal {
  const completo: EventoTempoReal = {
    id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...evento,
  };

  historico.unshift(completo);
  if (historico.length > 100) {
    historico.length = 100;
  }

  for (const cb of ouvintes) {
    try {
      cb(completo);
    } catch {
      // Ignora erro de cliente desconectado
    }
  }

  return completo;
}

export function assinarEventosTempoReal(cb: OuvinteEvento): () => void {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

export function obterEventosRecentesBuffer(limite = 20): EventoTempoReal[] {
  return historico.slice(0, Math.max(1, Math.min(limite, 100)));
}
