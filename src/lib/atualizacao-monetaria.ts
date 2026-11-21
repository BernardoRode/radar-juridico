export type RegimeAtualizacaoMonetaria =
  | 'ADC_58_STF'
  | 'SELIC_CIVIL'
  | 'IPCA_E_JUROS_1_PORCENTO'
  | 'INPC_JUROS_1_PORCENTO';

export interface EntradaAtualizacaoMonetaria {
  valorOriginal: number;
  dataInicial: string; // YYYY-MM-DD
  dataCitacao?: string; // YYYY-MM-DD (relevante para ADC 58 STF: pré vs judicial)
  dataFinal?: string; // YYYY-MM-DD (default: hoje)
  regime: RegimeAtualizacaoMonetaria;
  multaArt523Cpc?: boolean; // +10% Art. 523 §1º CPC
  honorariosSucumbenciaPct?: number; // 0..20%
}

export interface MemoriaMesCalculo {
  competencia: string; // YYYY-MM
  fase: 'PRE_JUDICIAL' | 'JUDICIAL';
  indiceAplicado: string;
  taxaCorrecaoPct: number;
  taxaJurosPct: number;
  saldoInicio: number;
  valorCorrecao: number;
  valorJuros: number;
  saldoFim: number;
}

export interface ResultadoAtualizacaoMonetaria {
  regime: RegimeAtualizacaoMonetaria;
  fundamentacaoLegal: string;
  fonteIndices: string;
  valorOriginal: number;
  dataInicial: string;
  dataCitacao: string | null;
  dataFinal: string;
  mesesComputados: number;
  correcaoMonetariaAcumulada: number;
  jurosMoraAcumulados: number;
  subtotalCorrigido: number;
  multaArt523Valor: number;
  honorariosValor: number;
  valorAtualizadoTotal: number;
  variacaoPercentualTotal: number;
  memoriaMensal: MemoriaMesCalculo[];
}

/**
 * Taxas mensais de referência BCB/IBGE (em %) para simulação de passivo.
 * Mantém valores históricos recentes e médias de referência para competências fora da tabela explícita.
 */
const TAXA_MENSAL_IPCA_E: Record<string, number> = {
  '2024-01': 0.31,
  '2024-02': 0.78,
  '2024-03': 0.36,
  '2024-04': 0.21,
  '2024-05': 0.44,
  '2024-06': 0.39,
  '2024-07': 0.3,
  '2024-08': 0.19,
  '2024-09': 0.28,
  '2024-10': 0.54,
  '2024-11': 0.62,
  '2024-12': 0.34,
  '2025-01': 0.16,
  '2025-02': 1.23,
  '2025-03': 0.56,
  '2025-04': 0.43,
  '2025-05': 0.36,
  '2025-06': 0.24,
};

const TAXA_MENSAL_SELIC: Record<string, number> = {
  '2024-01': 0.97,
  '2024-02': 0.8,
  '2024-03': 0.83,
  '2024-04': 0.89,
  '2024-05': 0.83,
  '2024-06': 0.79,
  '2024-07': 0.91,
  '2024-08': 0.87,
  '2024-09': 0.84,
  '2024-10': 0.93,
  '2024-11': 0.79,
  '2024-12': 0.93,
  '2025-01': 1.01,
  '2025-02': 0.99,
  '2025-03': 0.96,
  '2025-04': 1.06,
  '2025-05': 1.14,
  '2025-06': 1.1,
};

const TAXA_MENSAL_INPC: Record<string, number> = {
  '2024-01': 0.57,
  '2024-02': 0.81,
  '2024-03': 0.19,
  '2024-04': 0.37,
  '2024-05': 0.46,
  '2024-06': 0.25,
  '2024-07': 0.26,
  '2024-08': -0.14,
  '2024-09': 0.48,
  '2024-10': 0.61,
  '2024-11': 0.33,
  '2024-12': 0.48,
  '2025-01': 0.0,
  '2025-02': 1.48,
  '2025-03': 0.51,
};

function arredondar2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function listarCompetencias(inicioIso: string, fimIso: string): string[] {
  const ini = new Date(`${inicioIso.slice(0, 10)}T00:00:00Z`);
  const fim = new Date(`${fimIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime()) || ini > fim) {
    return [];
  }

  const competencias: string[] = [];
  let ano = ini.getUTCFullYear();
  let mes = ini.getUTCMonth() + 1;
  const anoFim = fim.getUTCFullYear();
  const mesFim = fim.getUTCMonth() + 1;

  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    competencias.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    if (competencias.length > 360) break; // Limite de segurança de 30 anos
  }
  return competencias;
}

function fundamentacaoPorRegime(regime: RegimeAtualizacaoMonetaria): string {
  switch (regime) {
    case 'ADC_58_STF':
      return 'ADC 58/59 STF (Trabalhista): IPCA-E na fase pré-judicial e Taxa SELIC (englobando correção e juros) a partir da citação/ajuizamento.';
    case 'SELIC_CIVIL':
      return 'Art. 406 do Código Civil / Lei 14.905/2024: Taxa SELIC acumulada englobando correção monetária e juros moratórios.';
    case 'IPCA_E_JUROS_1_PORCENTO':
      return 'Tabela Prática Cível: IPCA-E mensal + juros de mora simples de 1% ao mês.';
    case 'INPC_JUROS_1_PORCENTO':
      return 'Tabela Cível/Previdenciária: INPC mensal + juros de mora simples de 1% ao mês.';
  }
}

/**
 * Issue #98: Simulador de Atualização Monetária Automática (SELIC / IPCA-E / INPC / ADC 58 STF).
 */
export function calcularAtualizacaoMonetaria(
  entrada: EntradaAtualizacaoMonetaria
): ResultadoAtualizacaoMonetaria {
  const valorOriginal = Math.max(0, Number(entrada.valorOriginal) || 0);
  const dataFinal = (entrada.dataFinal || new Date().toISOString().slice(0, 10)).slice(
    0,
    10
  );
  const dataInicial = entrada.dataInicial.slice(0, 10);
  const dataCitacao = entrada.dataCitacao ? entrada.dataCitacao.slice(0, 10) : null;
  const compCitacao = dataCitacao ? dataCitacao.slice(0, 7) : null;

  const competencias = listarCompetencias(dataInicial, dataFinal);
  let principalCorrigido = valorOriginal;
  let jurosSimplesAcumulados = 0;
  let correcaoAcumulada = 0;
  const memoriaMensal: MemoriaMesCalculo[] = [];

  for (const comp of competencias) {
    const fase: 'PRE_JUDICIAL' | 'JUDICIAL' =
      compCitacao && comp < compCitacao ? 'PRE_JUDICIAL' : 'JUDICIAL';

    let taxaCorrecaoPct = 0;
    let taxaJurosPct = 0;
    let indiceAplicado = '';

    if (entrada.regime === 'ADC_58_STF') {
      if (fase === 'PRE_JUDICIAL') {
        taxaCorrecaoPct = TAXA_MENSAL_IPCA_E[comp] ?? 0.4;
        taxaJurosPct = 0; // Na ADC 58, juros pré-judiciais (TR) são residuais/não cumulados com 1%
        indiceAplicado = 'IPCA-E (Pré-Judicial ADC 58)';
      } else {
        // SELIC engloba correção + juros
        taxaCorrecaoPct = TAXA_MENSAL_SELIC[comp] ?? 0.95;
        taxaJurosPct = 0;
        indiceAplicado = 'SELIC (Judicial ADC 58)';
      }
    } else if (entrada.regime === 'SELIC_CIVIL') {
      taxaCorrecaoPct = TAXA_MENSAL_SELIC[comp] ?? 0.95;
      taxaJurosPct = 0;
      indiceAplicado = 'SELIC (Art. 406 CC)';
    } else if (entrada.regime === 'IPCA_E_JUROS_1_PORCENTO') {
      taxaCorrecaoPct = TAXA_MENSAL_IPCA_E[comp] ?? 0.4;
      taxaJurosPct = 1.0;
      indiceAplicado = 'IPCA-E + Juros 1% a.m.';
    } else {
      taxaCorrecaoPct = TAXA_MENSAL_INPC[comp] ?? 0.42;
      taxaJurosPct = 1.0;
      indiceAplicado = 'INPC + Juros 1% a.m.';
    }

    const saldoInicio = arredondar2(principalCorrigido + jurosSimplesAcumulados);
    const valorCorrecao = principalCorrigido * (taxaCorrecaoPct / 100);
    principalCorrigido += valorCorrecao;
    correcaoAcumulada += valorCorrecao;

    const valorJuros = principalCorrigido * (taxaJurosPct / 100);
    jurosSimplesAcumulados += valorJuros;

    const saldoFim = arredondar2(principalCorrigido + jurosSimplesAcumulados);

    memoriaMensal.push({
      competencia: comp,
      fase,
      indiceAplicado,
      taxaCorrecaoPct,
      taxaJurosPct,
      saldoInicio,
      valorCorrecao: arredondar2(valorCorrecao),
      valorJuros: arredondar2(valorJuros),
      saldoFim,
    });
  }

  const subtotalCorrigido = arredondar2(principalCorrigido + jurosSimplesAcumulados);
  const multaArt523Valor = entrada.multaArt523Cpc
    ? arredondar2(subtotalCorrigido * 0.1)
    : 0;
  const pctHon = Math.max(0, Math.min(20, entrada.honorariosSucumbenciaPct ?? 0));
  const honorariosValor = arredondar2(subtotalCorrigido * (pctHon / 100));
  const valorAtualizadoTotal = arredondar2(
    subtotalCorrigido + multaArt523Valor + honorariosValor
  );
  const variacaoPercentualTotal =
    valorOriginal > 0
      ? arredondar2(((valorAtualizadoTotal - valorOriginal) / valorOriginal) * 100)
      : 0;

  return {
    regime: entrada.regime,
    fundamentacaoLegal: fundamentacaoPorRegime(entrada.regime),
    fonteIndices: 'REFERENCIA_BCB_IBGE',
    valorOriginal: arredondar2(valorOriginal),
    dataInicial,
    dataCitacao,
    dataFinal,
    mesesComputados: competencias.length,
    correcaoMonetariaAcumulada: arredondar2(correcaoAcumulada),
    jurosMoraAcumulados: arredondar2(jurosSimplesAcumulados),
    subtotalCorrigido,
    multaArt523Valor,
    honorariosValor,
    valorAtualizadoTotal,
    variacaoPercentualTotal,
    memoriaMensal,
  };
}
