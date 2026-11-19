/**
 * Issue #89: SDK Oficial TypeScript / JavaScript do Radar Jurídico B2B.
 * Compatível com Node.js 18+, Next.js, Edge Runtime e navegadores modernos (zero dependências externas).
 */

export interface OpcoesRadarJuridicoClient {
  baseUrl?: string;
  apiKey?: string;
  bearerToken?: string;
}

export class RadarJuridicoClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly bearerToken?: string;

  constructor(opcoes: OpcoesRadarJuridicoClient = {}) {
    this.baseUrl = (opcoes.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
    this.apiKey = opcoes.apiKey;
    this.bearerToken = opcoes.bearerToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiKey) h['X-API-Key'] = this.apiKey;
    if (this.bearerToken) h['Authorization'] = `Bearer ${this.bearerToken}`;
    return h;
  }

  async buscarPublicacoes(params: {
    nomeParte?: string;
    numeroOab?: string;
    ufOab?: string;
    numeroProcesso?: string;
    siglaTribunal?: string;
    dataInicio?: string;
    dataFim?: string;
    itensPorPagina?: number;
  }) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const res = await fetch(`${this.baseUrl}/api/publicacoes?${qs.toString()}`, {
      headers: this.headers(),
    });
    return res.json();
  }

  async obterProcesso360(
    numeroProcesso: string,
    modo: 'cache' | 'tempo_real' = 'cache'
  ) {
    const qs = new URLSearchParams({ numeroProcesso, modo });
    const res = await fetch(`${this.baseUrl}/api/processo-360?${qs.toString()}`, {
      headers: this.headers(),
    });
    return res.json();
  }

  async executarDueDiligence(params: {
    documento?: string;
    nome?: string;
    consultarDjenAoVivo?: boolean;
  }) {
    const res = await fetch(`${this.baseUrl}/api/due-diligence`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    return res.json();
  }

  async criarLoteConsulta(params: {
    tipo: 'PROCESSOS' | 'CNPJS';
    itens: string[];
    callbackUrl?: string;
    sincrono?: boolean;
  }) {
    const res = await fetch(`${this.baseUrl}/api/lote/consultar`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
    });
    return res.json();
  }

  async consultarStatusLote(jobId: string) {
    const res = await fetch(`${this.baseUrl}/api/lote/${encodeURIComponent(jobId)}`, {
      headers: this.headers(),
    });
    return res.json();
  }

  async replayWebhooksFalhos(limite = 20) {
    const res = await fetch(`${this.baseUrl}/api/webhooks/replay`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ limite }),
    });
    return res.json();
  }
}
