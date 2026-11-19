export interface CondicoesRegraNoCode {
  condTribunal?: string | null;
  condValorMinRS?: number | null;
  condTipoAto?: string | null;
  condUrgencia?: string | null;
  condConcorrencia?: string | null;
}

export interface EventoParaAvaliacaoRegra {
  tribunal: string;
  valorRS?: number;
  tipoAto: string;
  urgencia: string;
  statusConcorrencia: string;
  texto?: string;
}

/**
 * Issue #90: Avalia de forma determinística se um evento processual atende a todas as condições
 * configuradas em uma regra No-Code (`RegraAutomacao`).
 */
export function avaliarRegraAutomacaoEmItem(
  regra: CondicoesRegraNoCode,
  evento: EventoParaAvaliacaoRegra
): boolean {
  if (regra.condTribunal) {
    const tribEsperado = regra.condTribunal.trim().toUpperCase();
    if (evento.tribunal.trim().toUpperCase() !== tribEsperado) {
      return false;
    }
  }

  if (typeof regra.condValorMinRS === 'number' && regra.condValorMinRS > 0) {
    const valEvento = typeof evento.valorRS === 'number' ? evento.valorRS : 0;
    if (valEvento < regra.condValorMinRS) {
      return false;
    }
  }

  if (regra.condTipoAto) {
    const termoAto = regra.condTipoAto.trim().toLowerCase();
    const alvoTexto = `${evento.tipoAto || ''} ${evento.texto || ''}`.toLowerCase();
    if (!alvoTexto.includes(termoAto)) {
      return false;
    }
  }

  if (regra.condUrgencia) {
    if (evento.urgencia.trim().toUpperCase() !== regra.condUrgencia.trim().toUpperCase()) {
      return false;
    }
  }

  if (regra.condConcorrencia) {
    if (
      evento.statusConcorrencia.trim().toUpperCase() !==
      regra.condConcorrencia.trim().toUpperCase()
    ) {
      return false;
    }
  }

  return true;
}
