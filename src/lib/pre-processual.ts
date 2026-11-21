export type CanalPreProcessual =
  | 'PROCON'
  | 'CONSUMIDOR_GOV'
  | 'RECLAME_AQUI'
  | 'OUVIDORIA'
  | 'OUTRO';

export type StatusPreProcessual =
  | 'ABERTA'
  | 'EM_TRATATIVA'
  | 'ACORDO_PRE_PROCESSUAL'
  | 'CONVERTIDA_EM_PROCESSO'
  | 'ENCERRADA';

export type RiscoJudicializacao = 'ALTO' | 'MEDIO' | 'BAIXO';

export function normalizarCanalPreProcessual(canalRaw?: string): CanalPreProcessual {
  const c = (canalRaw || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (c.includes('PROCON')) return 'PROCON';
  if (c.includes('CONSUMIDOR')) return 'CONSUMIDOR_GOV';
  if (c.includes('RECLAME')) return 'RECLAME_AQUI';
  if (c.includes('OUVIDORIA')) return 'OUVIDORIA';
  return 'OUTRO';
}

export function normalizarStatusPreProcessual(statusRaw?: string): StatusPreProcessual {
  const s = (statusRaw || '').trim().toUpperCase();
  if (s.includes('ACORDO')) return 'ACORDO_PRE_PROCESSUAL';
  if (s.includes('CONVERT') || s.includes('JUDICIAL')) return 'CONVERTIDA_EM_PROCESSO';
  if (s.includes('TRATATIVA') || s.includes('ANDAMENTO')) return 'EM_TRATATIVA';
  if (s.includes('ENCERR') || s.includes('FECHAD') || s.includes('CONCLUID')) {
    return 'ENCERRADA';
  }
  return 'ABERTA';
}

/**
 * Issue #95: Avalia automaticamente o risco de uma reclamação pré-processual virar ação judicial.
 */
export function calcularRiscoJudicializacao(params: {
  canal: CanalPreProcessual;
  assunto: string;
  descricao: string;
  valorPleiteado?: number | null;
}): RiscoJudicializacao {
  const texto = `${params.assunto} ${params.descricao}`.toLowerCase();
  const palavrasCriticas = [
    'advogado',
    'juizado',
    'processo',
    'judicial',
    'danos morais',
    'dano moral',
    'serasa',
    'spc',
    'negativação',
    'negativacao',
    'fraude',
    'bloqueio',
    'procon',
    'liminar',
    'audiência',
    'audiencia',
  ];

  const hits = palavrasCriticas.filter((p) => texto.includes(p)).length;
  const valor = params.valorPleiteado ?? 0;

  if (
    hits >= 2 ||
    valor >= 10000 ||
    (params.canal === 'PROCON' && hits >= 1)
  ) {
    return 'ALTO';
  }
  if (hits === 1 || valor >= 2000 || params.canal === 'PROCON' || params.canal === 'CONSUMIDOR_GOV') {
    return 'MEDIO';
  }
  return 'BAIXO';
}
