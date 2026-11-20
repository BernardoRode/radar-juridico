import crypto from 'crypto';

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

// Feriados Nacionais e Forenses Fixos (MM-DD) — Issue #11
const FERIADOS_FIXOS_MMDD = new Set([
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '08-11', // Dia do Advogado / Criação dos Cursos Jurídicos
  '09-07', // Independência do Brasil
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados (Feriado Forense)
  '11-15', // Proclamação da República
  '11-20', // Dia Nacional de Zumbi e da Consciência Negra
  '12-08', // Dia da Justiça (Feriado Forense Nacional - Decreto-Lei 8.292/45)
  '12-25', // Natal
]);

// Feriados Estaduais por UF / Tribunal (MM-DD)
const FERIADOS_POR_UF: Record<string, string[]> = {
  RS: ['09-20'], // Revolução Farroupilha (TJRS / TRT4 / TRF4)
  SP: ['07-09'], // Revolução Constitucionalista (TJSP / TRT2 / TRT15 / TRF3)
  RJ: ['04-23'], // São Jorge (TJRJ / TRT1 / TRF2)
  BA: ['07-02'], // Independência da Bahia
  MG: ['04-21'],
  SC: ['08-11'],
};

function extrairUfDoTribunal(siglaTribunal?: string): string | undefined {
  const s = (siglaTribunal || '').toUpperCase();
  if (s.includes('RS') || s === 'TRT4' || s === 'TRF4') return 'RS';
  if (s.includes('SP') || s === 'TRT2' || s === 'TRT15' || s === 'TRF3') return 'SP';
  if (s.includes('RJ') || s === 'TRT1' || s === 'TRF2') return 'RJ';
  if (s.includes('SC') || s === 'TRT12') return 'SC';
  if (s.includes('BA') || s === 'TRT5') return 'BA';
  return undefined;
}

/**
 * Verifica se a data cai no Recesso Forense (Art. 220 do CPC: 20 de dezembro a 20 de janeiro).
 */
export function ehRecessoForenseArt220CPC(d: Date): boolean {
  const mes = d.getUTCMonth() + 1; // 1..12
  const dia = d.getUTCDate();
  if (mes === 12 && dia >= 20) return true;
  if (mes === 1 && dia <= 20) return true;
  return false;
}

/**
 * Issue #93: Calcula o Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) para feriados móveis forenses:
 * Carnaval (Seg/Ter: -48/-47 dias), Sexta-Feira Santa (-2 dias) e Corpus Christi (+60 dias).
 */
export function calcularDomingoPascoaUtc(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3=Março, 4=Abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

export function obterFeriadosMoveisAno(ano: number): Set<string> {
  const pascoa = calcularDomingoPascoaUtc(ano).getTime();
  const offsets = [-48, -47, -2, 60]; // Seg/Ter Carnaval, Sexta-Feira Santa, Corpus Christi
  const set = new Set<string>();
  for (const off of offsets) {
    const dt = new Date(pascoa + off * 86400000);
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    set.add(`${mm}-${dd}`);
  }
  return set;
}

export function ehFeriadoForense(d: Date, siglaTribunal?: string): boolean {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const chave = `${mm}-${dd}`;

  if (FERIADOS_FIXOS_MMDD.has(chave)) return true;
  if (obterFeriadosMoveisAno(d.getUTCFullYear()).has(chave)) return true;

  const uf = extrairUfDoTribunal(siglaTribunal);
  if (uf && FERIADOS_POR_UF[uf]?.includes(chave)) return true;

  return false;
}

function ehFimDeSemana(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia === 0 || dia === 6;
}

export function ehDiaUtilForense(d: Date, siglaTribunal?: string): boolean {
  return (
    !ehFimDeSemana(d) &&
    !ehRecessoForenseArt220CPC(d) &&
    !ehFeriadoForense(d, siglaTribunal)
  );
}

export function avancarDiasUteisForenses(
  dataBase: Date,
  diasUteis: number,
  siglaTribunal?: string
): Date {
  const atual = new Date(dataBase.getTime());
  let cont = 0;
  while (cont < diasUteis) {
    atual.setUTCDate(atual.getUTCDate() + 1);
    if (ehDiaUtilForense(atual, siglaTribunal)) {
      cont += 1;
    }
  }
  return atual;
}

export function recuarDiasUteisForenses(
  dataFatal: Date,
  diasUteis: number,
  siglaTribunal?: string
): Date {
  const atual = new Date(dataFatal.getTime());
  let cont = 0;
  while (cont < diasUteis) {
    atual.setUTCDate(atual.getUTCDate() - 1);
    if (ehDiaUtilForense(atual, siglaTribunal)) {
      cont += 1;
    }
  }
  return atual;
}

function formatarDataBr(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}`;
}

function formatarDataIso(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

export interface CalculoPrazoFatal {
  dataFatalISO: string;
  dataFatalFormatada: string;
  prazoInternoD2Formatado: string; // Issue #38: Dupla checagem Controladoria D-2
  diasRestantes: number;
  memoriaCalculoPrazo?: {
    dataDisponibilizacao: string;
    dataPublicacao: string;
    diasContados: number;
    prazoEmDobroAplicado: boolean;
    feriadosOuRecessoPulados: string[];
    regraLegal: string;
  };
}

/**
 * Calcula a data fatal considerando Feriados Nacionais/Estaduais e o Recesso Forense
 * do Art. 220 do CPC (20/12 a 20/01), além do Prazo Interno D-2 (Issue #11 e Issue #38).
 */
export function calcularPrazoFatal(
  dataDisponibilizacao?: string,
  prazoDetectado?: string,
  siglaTribunal?: string,
  opcoes?: { prazoEmDobro?: boolean }
): CalculoPrazoFatal | undefined {
  if (!dataDisponibilizacao || !prazoDetectado) return undefined;

  const dataDisp = parseDataBrOuIso(dataDisponibilizacao);
  if (!dataDisp) return undefined;

  const matchNum = prazoDetectado.match(/(\d+)/);
  if (!matchNum) return undefined;
  const quantidade = parseInt(matchNum[1], 10);
  if (isNaN(quantidade) || quantidade <= 0 || quantidade > 180) return undefined;

  const ehHoras = /horas?/i.test(prazoDetectado);
  // Dia da publicação = 1º dia útil forense seguinte à disponibilização
  const dataPublicacao = avancarDiasUteisForenses(dataDisp, 1, siglaTribunal);

  const fatorDobro = opcoes?.prazoEmDobro ? 2 : 1;
  const diasParaAvancar = (ehHoras
    ? Math.max(1, Math.ceil(quantidade / 24))
    : quantidade) * fatorDobro;

  const dataFatal = avancarDiasUteisForenses(
    dataPublicacao,
    diasParaAvancar,
    siglaTribunal
  );

  // Prazo Interno D-2 da Controladoria (Issue #38)
  const dataInternaD2 =
    diasParaAvancar > 2
      ? recuarDiasUteisForenses(dataFatal, 2, siglaTribunal)
      : dataPublicacao;

  const hojeUtc = new Date();
  const hojeZero = Date.UTC(
    hojeUtc.getUTCFullYear(),
    hojeUtc.getUTCMonth(),
    hojeUtc.getUTCDate()
  );
  const diasRestantes = Math.ceil(
    (dataFatal.getTime() - hojeZero) / (1000 * 60 * 60 * 24)
  );

  const feriadosOuRecessoPulados: string[] = [];
  const cursorMem = new Date(dataDisp.getTime());
  while (cursorMem.getTime() < dataFatal.getTime()) {
    cursorMem.setUTCDate(cursorMem.getUTCDate() + 1);
    if (
      !ehFimDeSemana(cursorMem) &&
      (ehRecessoForenseArt220CPC(cursorMem) || ehFeriadoForense(cursorMem, siglaTribunal))
    ) {
      feriadosOuRecessoPulados.push(formatarDataBr(cursorMem));
    }
  }

  return {
    dataFatalISO: formatarDataIso(dataFatal),
    dataFatalFormatada: formatarDataBr(dataFatal),
    prazoInternoD2Formatado: formatarDataBr(dataInternaD2),
    diasRestantes,
    memoriaCalculoPrazo: {
      dataDisponibilizacao: formatarDataBr(dataDisp),
      dataPublicacao: formatarDataBr(dataPublicacao),
      diasContados: diasParaAvancar,
      prazoEmDobroAplicado: Boolean(opcoes?.prazoEmDobro),
      feriadosOuRecessoPulados,
      regraLegal: opcoes?.prazoEmDobro
        ? 'Art. 219/220/224 CPC c/c Prazo em Dobro (Art. 183/186/229 CPC).'
        : 'Art. 219/220/224 CPC + Feriados Nacionais, Móveis e Estaduais.',
    },
  };
}

/**
 * Issue #36: Anti-Multa Domicílio Judicial Eletrônico (Res. CNJ 455).
 * Para citações ou processos recém-distribuídos sem advogado, calcula o limite de 3 dias úteis
 * para confirmação da citação antes da multa de até 5% do valor da causa.
 */
export function calcularLimiteConfirmacaoDomicilio(
  dataDisponibilizacao?: string,
  siglaTribunal?: string
): string | undefined {
  const dataDisp = parseDataBrOuIso(dataDisponibilizacao);
  if (!dataDisp) return undefined;
  const dataLimite = avancarDiasUteisForenses(dataDisp, 3, siglaTribunal);
  return formatarDataBr(dataLimite);
}

/**
 * Issue #37: Filtro Anti-Ruído (separa "Mero Expediente" de atos que exigem ação/prazo).
 */
export function detectarMeroExpediente(
  texto: string,
  urgencia: 'ALTA' | 'MEDIA' | 'NORMAL',
  prazoDetectado?: string
): boolean {
  if (urgencia !== 'NORMAL' || prazoDetectado) return false;
  const t = (texto || '').toLowerCase();
  const termosComando = [
    'intime-se',
    'manifeste-se',
    'apresentar',
    'comprovar',
    'pagar',
    'audiência',
    'sentença',
    'liminar',
    'citação',
    'penhora',
    'sisbajud',
    'alvará',
    'precatório',
    'rpv',
  ];
  if (termosComando.some((termo) => t.includes(termo))) return false;
  return true;
}

/**
 * Issue #54: Extrator Automático de Links de Audiência Virtual (Zoom / Teams / Meet / Webex / PJe).
 */
export function extrairLinkAudienciaVirtual(texto: string): string | undefined {
  if (!texto) return undefined;
  const regex =
    /https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:zoom\.us|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com)[^\s<>"')]+/i;
  const match = texto.match(regex);
  return match ? match[0].replace(/[.,;]+$/, '') : undefined;
}

/**
 * Issue #51: Escudo Anti-Golpe do Falso Advogado (detecta expedição de Alvará, Precatório, RPV ou Levantamento).
 */
export function detectarRiscoGolpeAlvara(texto: string): boolean {
  const t = (texto || '').toLowerCase();
  return (
    t.includes('alvará') ||
    t.includes('precatório') ||
    t.includes('rpv') ||
    t.includes('requisição de pequeno valor') ||
    t.includes('levantamento de valores') ||
    t.includes('expedição de guia de retirada')
  );
}

/**
 * Issue #39 + #51: Gera mensagem pronta de WhatsApp para o cliente (Tradutor Juridiquês + Escudo Anti-Golpe).
 */
export function gerarMensagemWhatsAppCliente(params: {
  numeroProcesso: string;
  tribunal: string;
  tipoAtoDetectado: string;
  prazoFatal?: string;
  riscoGolpeAlvara: boolean;
  ehMeroExpediente: boolean;
}): string {
  const codigoSeguranca = params.numeroProcesso.replace(/[^0-9]/g, '').slice(-4) || '8492';

  if (params.riscoGolpeAlvara) {
    return `🛡️ *AVISO DE SEGURANÇA E ATUALIZAÇÃO PROCESSUAL*\nProcesso: ${params.numeroProcesso} (${params.tribunal})\n\nOlá! Identificamos uma movimentação referente a *Alvará / Liberação de Valores* no seu processo.\n\n⚠️ *ALERTA ANTI-GOLPE:* O nosso escritório *NUNCA* solicita Pix, taxas antecipadas ou transferências para liberar alvarás ou precatórios. Qualquer contato verdadeiro nosso informará o seu Código de Segurança: *#${codigoSeguranca}*.`;
  }

  if (params.ehMeroExpediente) {
    return `📋 *Atualização de Rotina Processual*\nProcesso: ${params.numeroProcesso} (${params.tribunal})\n\nOlá! O seu processo teve hoje uma movimentação interna de rotina do próprio cartório (*${params.tipoAtoDetectado}*). Não há nenhuma exigência ou ação necessária da sua parte no momento. Seguimos acompanhando!`;
  }

  return `⚖️ *Informativo do Seu Processo*\nProcesso: ${params.numeroProcesso} (${params.tribunal})\n\nOlá! Saiu uma nova atualização no seu processo classificada como *${params.tipoAtoDetectado}*${
    params.prazoFatal ? ` (prazo de manifestação do escritório até ${params.prazoFatal})` : ''
  }. Nossa equipe jurídica já capturou o documento original do tribunal e está tomando todas as providências necessárias.`;
}

/**
 * Issue #10: Calcula o Score de Oportunidade Comercial / Risco (0 a 100) do processo.
 */
export function calcularScoreOportunidade(params: {
  statusConcorrencia: 'NOSSO_ESCRITORIO' | 'ESCRITORIO_CONCORRENTE' | 'SEM_ADVOGADO_CADASTRADO';
  urgenciaMaxima: 'ALTA' | 'MEDIA' | 'NORMAL';
  textoConcatenado: string;
  temValorMonetario: boolean;
}): { score: number; motivos: string[] } {
  let score = 20;
  const motivos: string[] = [];
  const t = (params.textoConcatenado || '').toLowerCase();

  if (params.statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO') {
    score += 45;
    motivos.push('Processo sem advogado habilitado (Abordagem antecipada)');
  } else if (params.statusConcorrencia === 'ESCRITORIO_CONCORRENTE') {
    score += 25;
    motivos.push('Conduzido por escritório concorrente');
  }

  if (t.includes('revelia') || t.includes('intempestiv') || t.includes('decurso de prazo')) {
    score += 30;
    motivos.push('Falha crítica detectada (Revelia / Perda de Prazo)');
  }
  if (t.includes('sisbajud') || t.includes('penhora') || t.includes('bloqueio')) {
    score += 25;
    motivos.push('Risco patrimonial imediato (Sisbajud / Penhora)');
  }
  if (params.urgenciaMaxima === 'ALTA') {
    score += 15;
    motivos.push('Ato judicial de Alta Urgência');
  }
  if (params.temValorMonetario) {
    score += 10;
    motivos.push('Valor financeiro expresso no despacho');
  }

  return {
    score: Math.min(100, score),
    motivos,
  };
}

/**
 * Issue #52: Extrai menções a Honorários de Sucumbência / Advocatícios (% ou R$).
 */
export function extrairHonorariosSucumbencia(texto: string): string | undefined {
  if (!texto) return undefined;
  const matchPerc = texto.match(
    /honor[áa]rios[^.]{0,80}?(\d{1,2}\s*%\s*(?:sobre[^.,;]+)?)/i
  );
  if (matchPerc) return matchPerc[1].trim();

  const matchValor = texto.match(
    /honor[áa]rios[^.]{0,60}?(R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})/i
  );
  if (matchValor) return matchValor[1].trim();

  return undefined;
}

/**
 * Issue #61: Detecta Trânsito em Julgado ou Arquivamento Definitivo.
 */
export function detectarTransitoEmJulgado(texto: string): boolean {
  const t = (texto || '').toLowerCase();
  return (
    t.includes('trânsito em julgado') ||
    t.includes('transitado em julgado') ||
    t.includes('transitou em julgado') ||
    t.includes('arquivamento definitivo') ||
    t.includes('arquive-se definitivamente') ||
    t.includes('baixa definitiva')
  );
}

/**
 * Issue #63: Detecta Inclusão em Pauta de Julgamento / Sessão de 2º Grau para Sustentação Oral.
 */
export function detectarPautaJulgamento2Grau(
  texto: string,
  nomeOrgao?: string
): boolean {
  const t = `${texto || ''} ${nomeOrgao || ''}`.toLowerCase();
  return (
    t.includes('pauta de julgamento') ||
    t.includes('sessão de julgamento') ||
    t.includes('sustentação oral') ||
    t.includes('incluído em pauta') ||
    (t.includes('acórdão') && (t.includes('turma') || t.includes('câmara')))
  );
}

/**
 * Issue #64: Gera checklist obrigatório quando o processo entra na fase de Perícia.
 */
export function gerarChecklistPericia(fase: FaseProcessual): string[] | undefined {
  if (fase !== 'PERICIA') return undefined;
  return [
    '1. Indicar Assistente Técnico nos autos',
    '2. Elaborar e protocolar Quesitos Técnicos',
    '3. Agendar data/local da perícia com o cliente e perito',
  ];
}

/**
 * Issue #29: Gera Hash SHA-256 determinístico (Prova de Captura Auditável) para comprovar
 * o conteúdo exato disponibilizado pelo CNJ.
 */
export function gerarHashProvaCaptura(
  numeroProcesso: string,
  dataDisponibilizacao: string,
  texto: string
): string {
  const base = `${numeroProcesso}|${dataDisponibilizacao}|${(texto || '').trim()}`;
  const digest = crypto.createHash('sha256').update(base, 'utf8').digest('hex').toUpperCase();
  return `SHA256-${digest}`;
}

/**
 * Issue #33: Detecta menções a Súmulas e Temas de Repercussão Geral / Repetitivos (STF, STJ, TST).
 */
export function detectarPrecedentesVinculantes(texto: string): string[] | undefined {
  if (!texto) return undefined;
  const encontrados = new Set<string>();
  const regexSumula = /s[úu]mula\s+(?:vinculante\s+)?(?:n[º°.]?\s*)?\d+\s*(?:do\s+(?:stf|stj|tst|tnu))?/gi;
  const regexTema = /tema\s+(?:n[º°.]?\s*)?\d+\s*(?:do\s+(?:stf|stj|tst))?/gi;

  (texto.match(regexSumula) || []).forEach((m) => encontrados.add(m.trim()));
  (texto.match(regexTema) || []).forEach((m) => encontrados.add(m.trim()));

  return encontrados.size > 0 ? Array.from(encontrados) : undefined;
}

/**
 * Issue #53: Monitor de "Teimosinha" Sisbajud, Renajud e Infojud na Execução.
 */
export function detectarTeimosinhaSisbajud(texto: string): string | undefined {
  const t = (texto || '').toLowerCase();
  if (t.includes('teimosinha') || (t.includes('sisbajud') && t.includes('reitera'))) {
    return 'Teimosinha Sisbajud (reiteração automática de 30 dias) detectada — acompanhar bloqueios diários.';
  }
  if (t.includes('sisbajud') || t.includes('bacenjud')) {
    return 'Ordem Sisbajud emitida — verificar prazo de 5 dias (Art. 854 §3º CPC) para impugnação ou conversão em penhora.';
  }
  if (t.includes('renajud') || t.includes('infojud') || t.includes('cnib')) {
    return 'Pesquisa patrimonial (Renajud / Infojud / CNIB) determinada nos autos.';
  }
  return undefined;
}

/**
 * Issue #23: Gera Dossiê Pré-Audiência automático quando há audiência designada.
 */
export function gerarDossiePreAudiencia(
  fase: FaseProcessual,
  audienciaDetectada?: string
): string[] | undefined {
  if (fase !== 'AUDIENCIA' && !audienciaDetectada) return undefined;
  return [
    `Data/Hora da Audiência: ${audienciaDetectada || 'Confirmar no despacho'}`,
    '1. Confirmar presença do preposto e carta de preposição assinada',
    '2. Arrolar/intimar testemunhas ou levar declaração de comparecimento',
    '3. Revisar proposta de acordo autorizada pelo cliente (Settlement Predictor)',
    '4. Testar link de videoconferência 15 minutos antes da sessão',
  ];
}

/**
 * Issue #59: Calculadora Automática de Viabilidade de Acordo (Settlement Predictor).
 */
export function calcularViabilidadeAcordo(
  fase: FaseProcessual,
  urgencia: 'ALTA' | 'MEDIA' | 'NORMAL',
  valorDetectado?: string
): { recomendacao: string; economiaEstimada: string } {
  if (fase === 'EXECUCAO_PENHORA' || fase === 'SENTENCA') {
    return {
      recomendacao:
        'Fase avançada: avaliar acordo à vista com deságio de 15% a 25% sobre o valor atualizado para evitar multa de 10% (Art. 523 CPC) e bloqueio Sisbajud.',
      economiaEstimada: 'Redução média de 20% + dispensa de custas finais',
    };
  }
  if (fase === 'CITACAO' || fase === 'AUDIENCIA' || urgencia === 'ALTA') {
    return {
      recomendacao:
        'Fase inicial / Audiência: acordo preventivo recomendado entre 30% e 45% do risco estimado caso haja prova documental desfavorável.',
      economiaEstimada: valorDetectado
        ? `Economia de até 55% sobre ${valorDetectado} + honorários periciais`
        : 'Economia de 3 a 4 anos de juros, correção e honorários periciais',
    };
  }
  return {
    recomendacao: 'Aguardar instrução/decisão interlocutória antes de ofertar acordo.',
    economiaEstimada: 'Monitoramento preventivo ativo',
  };
}


/**
 * Issue #85 (Res. CNJ 569/2024): Calcula o início da contagem de prazo após confirmação
 * de citação eletrônica no Domicílio Judicial Eletrônico (DJE).
 * Pela Res. CNJ 569/2024, o prazo somente começa a correr no 5º dia útil seguinte à confirmação.
 */
export function calcularInicioPrazoCitacaoDjeRes569(
  dataConfirmacaoDje?: string,
  prazoDiasUteis = 15,
  siglaTribunal?: string
):
  | {
      dataConfirmacaoFormatada: string;
      dataInicioContagem: string;
      dataFatalFormatada: string;
      regraAplicada: string;
    }
  | undefined {
  const dtConf = parseDataBrOuIso(dataConfirmacaoDje);
  if (!dtConf) return undefined;

  const dtInicio = avancarDiasUteisForenses(dtConf, 5, siglaTribunal);
  const dtFatal = avancarDiasUteisForenses(
    dtInicio,
    Math.max(1, prazoDiasUteis),
    siglaTribunal
  );

  return {
    dataConfirmacaoFormatada: formatarDataBr(dtConf),
    dataInicioContagem: formatarDataBr(dtInicio),
    dataFatalFormatada: formatarDataBr(dtFatal),
    regraAplicada:
      'Res. CNJ 569/2024: início da contagem do prazo no 5º dia útil seguinte à confirmação da citação no DJE.',
  };
}

/**
 * Issue #85: Audita o atraso de remessa entre a data de assinatura ICP-Brasil do magistrado no PJe
 * (`dataHoraAssinatura`) e a data de disponibilização efetiva no DJEN (`dataDisponibilizacao`).
 * Fundamenta arguição de tempestividade pela data oficial do DJEN (Art. 224 CPC / Res. CNJ 455 e 569).
 */
export function auditarAtrasoRemessaDjen(
  dataHoraAssinatura?: string,
  dataDisponibilizacao?: string
): { diasAtrasoRemessa: number; alertaAtraso?: string } | undefined {
  const dtAssinatura = parseDataBrOuIso(dataHoraAssinatura);
  const dtDisp = parseDataBrOuIso(dataDisponibilizacao);
  if (!dtAssinatura || !dtDisp) return undefined;

  const diffDias = Math.round(
    (dtDisp.getTime() - dtAssinatura.getTime()) / (1000 * 60 * 60 * 24)
  );
  const diasAtrasoRemessa = Math.max(0, diffDias);

  return {
    diasAtrasoRemessa,
    ...(diasAtrasoRemessa >= 2
      ? {
          alertaAtraso: `Atraso de ${diasAtrasoRemessa} dia(s) entre a assinatura no PJe (${formatarDataBr(
            dtAssinatura
          )}) e a disponibilização no DJEN (${formatarDataBr(
            dtDisp
          )}). Pela Res. CNJ 455/569 e Art. 224 CPC, prevalece a data do DJEN para contagem de tempestividade.`,
        }
      : {}),
  };
}
