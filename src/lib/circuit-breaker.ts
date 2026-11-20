/**
 * Issue #103: Circuit Breaker por Tribunal / Serviço Externo.
 * Impede efeito cascata de timeouts quando um tribunal específico está indisponível.
 */

type EstadoCircuito = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface RegistroCircuito {
  estado: EstadoCircuito;
  falhasConsecutivas: number;
  abertoAte: number;
  ultimoErro?: string;
}

const circuitos = new Map<string, RegistroCircuito>();
const LIMITE_FALHAS_ABERTURA = 3;
const TEMPO_ABERTO_MS = 1000 * 60 * 2; // 2 minutos

export function podeConsultarTribunal(chave: string): {
  permitido: boolean;
  estado: EstadoCircuito;
} {
  const reg = circuitos.get(chave);
  if (!reg) return { permitido: true, estado: 'CLOSED' };

  if (reg.estado === 'OPEN') {
    if (Date.now() >= reg.abertoAte) {
      reg.estado = 'HALF_OPEN';
      return { permitido: true, estado: 'HALF_OPEN' };
    }
    return { permitido: false, estado: 'OPEN' };
  }

  return { permitido: true, estado: reg.estado };
}

export function registrarSucessoTribunal(chave: string): void {
  circuitos.delete(chave);
}

export function registrarFalhaTribunal(chave: string, erro?: string): void {
  const atual = circuitos.get(chave) || {
    estado: 'CLOSED' as EstadoCircuito,
    falhasConsecutivas: 0,
    abertoAte: 0,
  };
  atual.falhasConsecutivas += 1;
  atual.ultimoErro = erro;

  if (atual.falhasConsecutivas >= LIMITE_FALHAS_ABERTURA) {
    atual.estado = 'OPEN';
    atual.abertoAte = Date.now() + TEMPO_ABERTO_MS;
  }
  circuitos.set(chave, atual);
}

export function obterStatusCircuitos(): Record<string, RegistroCircuito> {
  return Object.fromEntries(circuitos.entries());
}
