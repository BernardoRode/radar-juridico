export type FaseProcessual =
  | 'CITACAO'
  | 'AUDIENCIA'
  | 'PERICIA'
  | 'SENTENCA'
  | 'RECURSO'
  | 'EXECUCAO_PENHORA'
  | 'ANDAMENTO';

export const LABEL_FASE_PROCESSUAL: Record<FaseProcessual, string> = {
  CITACAO: 'Citação / Inicial',
  AUDIENCIA: 'Audiência',
  PERICIA: 'Perícia',
  SENTENCA: 'Sentença',
  RECURSO: 'Recurso',
  EXECUCAO_PENHORA: 'Execução / Penhora',
  ANDAMENTO: 'Andamento / Despacho',
};

/**
 * Classifica automaticamente a fase processual a partir do texto da publicação.
 */
export function classificarFaseProcessual(
  texto: string,
  tipoComunicacao?: string
): FaseProcessual {
  const t = `${texto || ''} ${tipoComunicacao || ''}`.toLowerCase();

  if (
    t.includes('penhora') ||
    t.includes('sisbajud') ||
    t.includes('bloqueio') ||
    t.includes('execução') ||
    t.includes('cumprimento de sentença')
  ) {
    return 'EXECUCAO_PENHORA';
  }
  if (
    t.includes('contrarrazões') ||
    t.includes('recurso ordinário') ||
    t.includes('apelação') ||
    t.includes('agravo') ||
    t.includes('embargos de declaração')
  ) {
    return 'RECURSO';
  }
  if (
    t.includes('sentença') ||
    t.includes('julgo procedente') ||
    t.includes('julgo improcedente') ||
    t.includes('julgo parcialmente procedente')
  ) {
    return 'SENTENCA';
  }
  if (t.includes('laudo pericial') || t.includes('perícia') || t.includes('perito')) {
    return 'PERICIA';
  }
  if (t.includes('audiência')) {
    return 'AUDIENCIA';
  }
  if (
    t.includes('citação') ||
    t.includes('cite-se') ||
    t.includes('citar a reclamada')
  ) {
    return 'CITACAO';
  }
  return 'ANDAMENTO';
}

function ehFimDeSemana(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia === 0 || dia === 6;
}

function avancarDiasUteis(dataBase: Date, diasUteis: number): Date {
  const atual = new Date(dataBase.getTime());
  let cont = 0;
  while (cont < diasUteis) {
    atual.setUTCDate(atual.getUTCDate() + 1);
    if (!ehFimDeSemana(atual)) {
      cont += 1;
    }
  }
  return atual;
}

function parseDataBrOuIso(raw?: string): Date | null {
  if (!raw) return null;
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  }
  return null;
}

export interface CalculoPrazoFatal {
  dataFatalISO: string;
  dataFatalFormatada: string;
  diasRestantes: number;
}

/**
 * Calcula a data fatal estimada a partir da data de disponibilização no DJE/DJEN
 * e do prazo extraído (ex: "15 dias", "5 (cinco) dias úteis", "48 horas").
 * Regra padrão CPC/CLT: Publicação no 1º dia útil seguinte + contagem em dias úteis.
 */
export function calcularPrazoFatal(
  dataDisponibilizacao?: string,
  prazoDetectado?: string
): CalculoPrazoFatal | undefined {
  if (!dataDisponibilizacao || !prazoDetectado) return undefined;

  const dataDisp = parseDataBrOuIso(dataDisponibilizacao);
  if (!dataDisp) return undefined;

  const matchNum = prazoDetectado.match(/(\d+)/);
  if (!matchNum) return undefined;
  const quantidade = parseInt(matchNum[1], 10);
  if (isNaN(quantidade) || quantidade <= 0 || quantidade > 180) return undefined;

  const ehHoras = /horas?/i.test(prazoDetectado);
  // Dia da publicação = próximo dia útil após a disponibilização
  const dataPublicacao = avancarDiasUteis(dataDisp, 1);

  let dataFatal: Date;
  if (ehHoras) {
    const diasEquivalentes = Math.max(1, Math.ceil(quantidade / 24));
    dataFatal = avancarDiasUteis(dataPublicacao, diasEquivalentes);
  } else {
    dataFatal = avancarDiasUteis(dataPublicacao, quantidade);
  }

  const yyyy = dataFatal.getUTCFullYear();
  const mm = String(dataFatal.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dataFatal.getUTCDate()).padStart(2, '0');

  const hojeUtc = new Date();
  const hojeZero = Date.UTC(
    hojeUtc.getUTCFullYear(),
    hojeUtc.getUTCMonth(),
    hojeUtc.getUTCDate()
  );
  const diasRestantes = Math.ceil(
    (dataFatal.getTime() - hojeZero) / (1000 * 60 * 60 * 24)
  );

  return {
    dataFatalISO: `${yyyy}-${mm}-${dd}`,
    dataFatalFormatada: `${dd}/${mm}/${yyyy}`,
    diasRestantes,
  };
}
