import { ComunicacaoCNJ } from '@/types/juridico';

export const CNJ_API_URL = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
export const MAX_ITENS_POR_PAGINA_DJEN = 50;

export interface ResultadoConsultaDjen {
  ok: boolean;
  statusHttp: number;
  items: ComunicacaoCNJ[];
  totalNoCnj: number;
  paginasConsultadas: number;
  itensPorPaginaAplicado: number;
  tentativasExecutadas: number;
  endpointConsultado: string;
  erro?: string;
}

/**
 * Issue #81: Normaliza `itensPorPagina` para nunca exceder o limite seguro de 50 itens do DJEN/CNJ.
 */
export function normalizarItensPorPaginaDjen(raw?: string | number | null): number {
  const num = Number(raw);
  if (isNaN(num) || num <= 0) return 25;
  return Math.min(MAX_ITENS_POR_PAGINA_DJEN, Math.max(1, Math.floor(num)));
}

async function fetchPaginaDjenComRetry(
  url: string,
  timeoutMs = 20000,
  maxRetries = 2
): Promise<{ ok: boolean; status: number; data?: unknown; erroTexto?: string; tentativas: number }> {
  let ultimoStatus = 0;
  let ultimoErro = '';

  for (let tentativa = 0; tentativa <= maxRetries; tentativa++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RadarJuridico/1.0 (BR-gru1)',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      ultimoStatus = res.status;

      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: res.status, data, tentativas: tentativa + 1 };
      }

      ultimoErro = await res.text().catch(() => `HTTP ${res.status}`);
      // Só faz retry em rate-limit (429) ou erro transitório de servidor (5xx)
      if (res.status !== 429 && res.status < 500) {
        return {
          ok: false,
          status: res.status,
          erroTexto: ultimoErro,
          tentativas: tentativa + 1,
        };
      }
    } catch (e: unknown) {
      ultimoErro = e instanceof Error ? e.message : 'Timeout ou erro de rede no DJEN';
    } finally {
      clearTimeout(timer);
    }

    if (tentativa < maxRetries) {
      const backoffMs = 500 * Math.pow(2, tentativa);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return {
    ok: false,
    status: ultimoStatus || 504,
    erroTexto: ultimoErro,
    tentativas: maxRetries + 1,
  };
}

/**
 * Issue #81: Consulta a API oficial do Comunica PJe / DJEN com:
 * 1. Teto estrito `itensPorPagina <= 50` (evita truncamento silencioso do CNJ);
 * 2. Retry exponencial inteligente em timeouts (10s-40s), HTTP 429 e 5xx;
 * 3. Paginação automática opcional (`maxPaginas`) quando `count > items.length`.
 */
export async function consultarDjenComRetryEPaginacao(
  baseParams: URLSearchParams,
  opcoes?: {
    maxPaginas?: number;
    timeoutMs?: number;
    maxRetries?: number;
  }
): Promise<ResultadoConsultaDjen> {
  const params = new URLSearchParams(baseParams.toString());
  const paginaInicial = Math.max(1, Number(params.get('pagina') || '1') || 1);
  const itensPorPagina = normalizarItensPorPaginaDjen(params.get('itensPorPagina'));
  params.set('pagina', String(paginaInicial));
  params.set('itensPorPagina', String(itensPorPagina));

  const maxPaginas = Math.max(1, Math.min(10, opcoes?.maxPaginas ?? 1));
  const timeoutMs = opcoes?.timeoutMs ?? 20000;
  const maxRetries = opcoes?.maxRetries ?? 2;

  const primeiraUrl = `${CNJ_API_URL}?${params.toString()}`;
  const primeiraResp = await fetchPaginaDjenComRetry(primeiraUrl, timeoutMs, maxRetries);

  if (!primeiraResp.ok) {
    return {
      ok: false,
      statusHttp: primeiraResp.status,
      items: [],
      totalNoCnj: 0,
      paginasConsultadas: 1,
      itensPorPaginaAplicado: itensPorPagina,
      tentativasExecutadas: primeiraResp.tentativas,
      endpointConsultado: primeiraUrl,
      erro: primeiraResp.erroTexto,
    };
  }

  const rawData = primeiraResp.data as { items?: ComunicacaoCNJ[]; count?: number } | ComunicacaoCNJ[];
  const primeirosItens: ComunicacaoCNJ[] = Array.isArray((rawData as { items?: ComunicacaoCNJ[] })?.items)
    ? ((rawData as { items: ComunicacaoCNJ[] }).items)
    : Array.isArray(rawData)
    ? rawData
    : [];

  const totalNoCnj =
    typeof (rawData as { count?: number })?.count === 'number'
      ? (rawData as { count: number }).count
      : primeirosItens.length;

  const mapaItens = new Map<number, ComunicacaoCNJ>();
  for (const item of primeirosItens) {
    if (item && typeof item.id === 'number') {
      mapaItens.set(item.id, item);
    }
  }

  let paginasConsultadas = 1;
  let tentativasExecutadas = primeiraResp.tentativas;

  // Paginação automática se houver mais resultados no CNJ e maxPaginas > 1
  if (
    maxPaginas > 1 &&
    primeirosItens.length >= itensPorPagina &&
    totalNoCnj > mapaItens.size
  ) {
    for (let offset = 1; offset < maxPaginas; offset++) {
      if (mapaItens.size >= totalNoCnj) break;
      const pagAtual = paginaInicial + offset;
      const pPag = new URLSearchParams(params.toString());
      pPag.set('pagina', String(pagAtual));
      const urlPag = `${CNJ_API_URL}?${pPag.toString()}`;
      const respPag = await fetchPaginaDjenComRetry(urlPag, timeoutMs, maxRetries);
      tentativasExecutadas += respPag.tentativas;
      if (!respPag.ok) break;

      const dPag = respPag.data as { items?: ComunicacaoCNJ[] } | ComunicacaoCNJ[];
      const itensPag: ComunicacaoCNJ[] = Array.isArray((dPag as { items?: ComunicacaoCNJ[] })?.items)
        ? ((dPag as { items: ComunicacaoCNJ[] }).items)
        : Array.isArray(dPag)
        ? dPag
        : [];
      paginasConsultadas += 1;
      if (itensPag.length === 0) break;

      for (const item of itensPag) {
        if (item && typeof item.id === 'number') {
          mapaItens.set(item.id, item);
        }
      }
      if (itensPag.length < itensPorPagina) break;
    }
  }

  return {
    ok: true,
    statusHttp: primeiraResp.status,
    items: Array.from(mapaItens.values()),
    totalNoCnj,
    paginasConsultadas,
    itensPorPaginaAplicado: itensPorPagina,
    tentativasExecutadas,
    endpointConsultado: primeiraUrl,
  };
}
