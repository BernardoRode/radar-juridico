/**
 * Issue #88: PII Vault (Cofre de Dados Pessoais LGPD) & Proteção de Segredo de Justiça.
 *
 * 1. Substitui CPFs, CNPJs e e-mails por placeholders reversíveis (`[CPF_PII_1]`, `[CNPJ_PII_1]`, `[EMAIL_PII_1]`)
 *    antes de enviar o prompt para provedores de LLM externos, restaurando os valores originais na resposta.
 * 2. Bloqueia envio a LLMs em nuvem externa quando o processo está sob Segredo de Justiça (`nivelSigilo > 0`),
 *    permitindo apenas Ollama local ou análise heurística local.
 */

export interface ResultadoMascaramentoPii {
  textoMascarado: string;
  mapaReversao: Record<string, string>;
  totalMascarados: number;
}

export function mascararDadosSensiveisPii(texto: string): ResultadoMascaramentoPii {
  if (!texto) {
    return { textoMascarado: '', mapaReversao: {}, totalMascarados: 0 };
  }

  const mapaReversao: Record<string, string> = {};
  const valorParaToken = new Map<string, string>();
  let contadorCpf = 0;
  let contadorCnpj = 0;
  let contadorEmail = 0;

  function registrarToken(valorOriginal: string, prefixo: 'CPF' | 'CNPJ' | 'EMAIL'): string {
    const existente = valorParaToken.get(valorOriginal);
    if (existente) return existente;

    let idx = 1;
    if (prefixo === 'CPF') idx = ++contadorCpf;
    else if (prefixo === 'CNPJ') idx = ++contadorCnpj;
    else idx = ++contadorEmail;

    const token = `[${prefixo}_PII_${idx}]`;
    valorParaToken.set(valorOriginal, token);
    mapaReversao[token] = valorOriginal;
    return token;
  }

  let resultado = texto;

  // 1. Mascara CNPJ formatado (XX.XXX.XXX/XXXX-XX)
  resultado = resultado.replace(
    /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
    (match) => registrarToken(match, 'CNPJ')
  );

  // 2. Mascara CPF formatado (XXX.XXX.XXX-XX)
  resultado = resultado.replace(
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    (match) => registrarToken(match, 'CPF')
  );

  // 3. Mascara e-mails
  resultado = resultado.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    (match) => registrarToken(match, 'EMAIL')
  );

  return {
    textoMascarado: resultado,
    mapaReversao,
    totalMascarados: Object.keys(mapaReversao).length,
  };
}

export function restaurarDadosSensiveisPii(
  textoResposta: string,
  mapaReversao: Record<string, string>
): string {
  if (!textoResposta || !mapaReversao) return textoResposta;
  let restaurado = textoResposta;
  for (const [token, valorOriginal] of Object.entries(mapaReversao)) {
    restaurado = restaurado.split(token).join(valorOriginal);
  }
  return restaurado;
}

/**
 * Issue #88: Determina se o processo possui Segredo de Justiça (`nivelSigilo > 0` ou menção expressa),
 * caso em que o envio a LLMs externas em nuvem deve ser bloqueado (permitindo apenas Ollama local ou heurística).
 */
export function deveBloquearLlmExternaPorSigilo(
  nivelSigilo?: number | null,
  texto?: string | null
): boolean {
  if (typeof nivelSigilo === 'number' && nivelSigilo > 0) {
    return true;
  }
  const t = (texto || '').toLowerCase();
  if (
    t.includes('segredo de justiça') ||
    t.includes('tramitação em sigilo') ||
    t.includes('processo sigiloso')
  ) {
    return true;
  }
  return false;
}
