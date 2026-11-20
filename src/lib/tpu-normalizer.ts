import type { MovimentoDatajud } from '@/types/juridico';

export type MarcoCanonicoTpu =
  | 'DISTRIBUICAO'
  | 'CITACAO'
  | 'INTIMACAO'
  | 'AUDIENCIA'
  | 'PERICIA'
  | 'DECISAO_LIMINAR'
  | 'SENTENCA'
  | 'RECURSO'
  | 'EXECUCAO_CALCULO'
  | 'SOBRESTAMENTO'
  | 'MUDANCA_CLASSE'
  | 'TRANSITO_ARQUIVAMENTO'
  | 'MERO_EXPEDIENTE'
  | 'ANDAMENTO_GERAL';

const MAPA_CODIGOS_TPU: Record<number, MarcoCanonicoTpu> = {
  26: 'DISTRIBUICAO',
  7: 'EXECUCAO_CALCULO', // Conversão
  16: 'EXECUCAO_CALCULO', // Cálculo
  85: 'ANDAMENTO_GERAL', // Petição
  970: 'AUDIENCIA',
  11010: 'MERO_EXPEDIENTE',
  11025: 'SOBRESTAMENTO',
  10966: 'MUDANCA_CLASSE',
  12263: 'INTIMACAO',
  12284: 'CITACAO',
  12286: 'INTIMACAO', // Eletrônica
  246: 'TRANSITO_ARQUIVAMENTO', // Arquivamento definitivo
  848: 'TRANSITO_ARQUIVAMENTO', // Trânsito em julgado
  193: 'SENTENCA',
  219: 'SENTENCA',
};

export interface ResumoNormalizadoTpu {
  marcoCanonicoAtual: MarcoCanonicoTpu;
  sobrestado: boolean;
  temaSobrestamento?: string;
  mudancaClasseDetectada: boolean;
  arquivadoDefinitivo: boolean;
  totalMeroExpedienteTpu: number;
}

export function classificarMovimentoTpu(mov: MovimentoDatajud): MarcoCanonicoTpu {
  if (MAPA_CODIGOS_TPU[mov.codigo]) {
    return MAPA_CODIGOS_TPU[mov.codigo];
  }
  const n = (mov.nome || '').toLowerCase();
  if (n.includes('sobrestamento') || n.includes('suspens')) return 'SOBRESTAMENTO';
  if (n.includes('trânsito em julgado') || n.includes('arquivamento definitivo') || n.includes('baixa definitiva')) {
    return 'TRANSITO_ARQUIVAMENTO';
  }
  if (n.includes('mudança de classe') || n.includes('retificação de autuação')) return 'MUDANCA_CLASSE';
  if (n.includes('sentença') || n.includes('julgamento')) return 'SENTENCA';
  if (n.includes('audiência')) return 'AUDIENCIA';
  if (n.includes('perícia') || n.includes('perito')) return 'PERICIA';
  if (n.includes('citação')) return 'CITACAO';
  if (n.includes('intimação')) return 'INTIMACAO';
  if (n.includes('mero expediente') || n.includes('juntada de certidão')) return 'MERO_EXPEDIENTE';
  if (n.includes('cálculo') || n.includes('penhora') || n.includes('execução')) return 'EXECUCAO_CALCULO';
  if (n.includes('recurso') || n.includes('apelação') || n.includes('agravo')) return 'RECURSO';
  return 'ANDAMENTO_GERAL';
}

/**
 * Issue #102 + #108: Normaliza a árvore de movimentos Datajud usando a TPU do CNJ,
 * detectando sobrestamento (TPU 11025 + Tema STF/STJ/TST), mudança de classe (10966) e arquivamento (246/848).
 */
export function analisarArvoreMovimentosTpu(
  movimentos: MovimentoDatajud[]
): ResumoNormalizadoTpu {
  if (!movimentos || movimentos.length === 0) {
    return {
      marcoCanonicoAtual: 'ANDAMENTO_GERAL',
      sobrestado: false,
      mudancaClasseDetectada: false,
      arquivadoDefinitivo: false,
      totalMeroExpedienteTpu: 0,
    };
  }

  let sobrestado = false;
  let temaSobrestamento: string | undefined;
  let mudancaClasseDetectada = false;
  let arquivadoDefinitivo = false;
  let totalMeroExpedienteTpu = 0;

  const marcoCanonicoAtual = classificarMovimentoTpu(movimentos[0]);

  for (const mov of movimentos) {
    const marco = classificarMovimentoTpu(mov);
    if (marco === 'MERO_EXPEDIENTE') totalMeroExpedienteTpu += 1;
    if (marco === 'MUDANCA_CLASSE') mudancaClasseDetectada = true;
    if (marco === 'TRANSITO_ARQUIVAMENTO') arquivadoDefinitivo = true;

    if (marco === 'SOBRESTAMENTO') {
      sobrestado = true;
      const compTxt = (mov.complementosTabelados || [])
        .map((c) => `${c.descricao || ''} ${c.nome || ''} ${c.valor || ''}`)
        .join(' ');
      const matchTema = `${mov.nome} ${compTxt}`.match(/tema\s*(?:n[º°.]?\s*)?\d+(?:\s*(?:do\s+)?(?:stf|stj|tst))?/i);
      if (matchTema && !temaSobrestamento) {
        temaSobrestamento = matchTema[0].trim();
      }
    }
  }

  // Se houve movimento posterior de retomada após o último sobrestamento, não está mais sobrestado
  if (sobrestado && marcoCanonicoAtual !== 'SOBRESTAMENTO') {
    const primeiroNome = (movimentos[0].nome || '').toLowerCase();
    if (primeiroNome.includes('levantamento') || primeiroNome.includes('dessobrestamento') || primeiroNome.includes('prosseguimento')) {
      sobrestado = false;
    }
  }

  return {
    marcoCanonicoAtual,
    sobrestado,
    ...(temaSobrestamento ? { temaSobrestamento } : {}),
    mudancaClasseDetectada,
    arquivadoDefinitivo,
    totalMeroExpedienteTpu,
  };
}
