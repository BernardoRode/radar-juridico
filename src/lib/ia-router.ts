/**
 * Roteador Multi-IA Gratuito com Ciclo e Failover Automático (Custo Zero).
 *
 * Mantém um pool circular de provedores/modelos gratuitos configurados no `.env`.
 * Quando um modelo ou provedor atinge limite de cota/rate-limit (HTTP 429/402/503),
 * ele entra automaticamente em cooldown temporário e a mesma requisição já pula para
 * a próxima IA disponível do ciclo. Quando o cooldown expira, ele volta para a fila.
 */

export type ProvedorIAId =
  | 'GEMINI'
  | 'GROQ'
  | 'CEREBRAS'
  | 'OPENROUTER'
  | 'MISTRAL'
  | 'NVIDIA'
  | 'HUGGINGFACE'
  | 'CLOUDFLARE'
  | 'COHERE'
  | 'OLLAMA'
  | 'OPENAI';

export type ProtocoloIA = 'gemini' | 'openai' | 'cohere';

export interface SlotIA {
  id: string;
  provedor: ProvedorIAId;
  modelo: string;
  protocolo: ProtocoloIA;
  endpoint: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
}

export interface CooldownSlot {
  ate: number;
  motivo: string;
  statusHttp?: number;
}

export interface ResultadoChamadaMultiIA {
  texto: string;
  provedor: ProvedorIAId;
  modelo: string;
  modo: `LLM_${ProvedorIAId}`;
  slotId: string;
  tentativas: number;
}

export interface StatusPoolIA {
  modoOperacao: 'MULTI_IA_ATIVO' | 'HEURISTICA_LOCAL';
  estrategiaCiclo: 'FAILOVER_CICLICO' | 'ROUND_ROBIN';
  provedorAtivo: string;
  modeloAtivo: string | null;
  totalProvedoresConfigurados: number;
  totalSlotsConfigurados: number;
  slotsDisponiveisAgora: number;
  slotsEmCooldown: number;
  totalEmAndamentoAgora: number;
  totalRequisicoes: number;
  totalFailovers: number;
  ultimoUso: {
    provedor: ProvedorIAId;
    modelo: string;
    em: string;
  } | null;
  slots: Array<{
    id: string;
    provedor: ProvedorIAId;
    modelo: string;
    status: 'DISPONIVEL' | 'EM_COOLDOWN';
    emAndamentoAgora: number;
    cooldownSegundosRestantes: number;
    motivoCooldown?: string;
  }>;
}

interface EstadoPoolGlobal {
  ponteiroCiclo: number;
  cooldownPorSlot: Map<string, CooldownSlot>;
  emAndamentoPorSlot: Map<string, number>;
  totalRequisicoes: number;
  totalFailovers: number;
  ultimoUso: { provedor: ProvedorIAId; modelo: string; em: string } | null;
}

const globalForIaRouter = globalThis as unknown as {
  __radarIaRouterEstado?: EstadoPoolGlobal;
};

function obterEstadoGlobal(): EstadoPoolGlobal {
  if (!globalForIaRouter.__radarIaRouterEstado) {
    globalForIaRouter.__radarIaRouterEstado = {
      ponteiroCiclo: 0,
      cooldownPorSlot: new Map<string, CooldownSlot>(),
      emAndamentoPorSlot: new Map<string, number>(),
      totalRequisicoes: 0,
      totalFailovers: 0,
      ultimoUso: null,
    };
  }
  return globalForIaRouter.__radarIaRouterEstado;
}

export function resetarEstadoPoolIA(): void {
  const estado = obterEstadoGlobal();
  estado.ponteiroCiclo = 0;
  estado.cooldownPorSlot.clear();
  estado.emAndamentoPorSlot.clear();
  estado.totalRequisicoes = 0;
  estado.totalFailovers = 0;
  estado.ultimoUso = null;
}

function parseListaCsv(valor?: string): string[] {
  if (!valor) return [];
  return valor
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const ORDEM_PADRAO_PROVEDORES: ProvedorIAId[] = [
  'GEMINI',
  'GROQ',
  'CEREBRAS',
  'OPENROUTER',
  'MISTRAL',
  'NVIDIA',
  'HUGGINGFACE',
  'CLOUDFLARE',
  'COHERE',
  'OLLAMA',
  'OPENAI',
];

function montarSlotsPorProvedor(provedor: ProvedorIAId): SlotIA[] {
  const slots: SlotIA[] = [];

  switch (provedor) {
    case 'GEMINI': {
      const keys = parseListaCsv(process.env.GEMINI_API_KEY);
      const modelos = parseListaCsv(process.env.GEMINI_MODELS);
      const listaModelos =
        modelos.length > 0 ? modelos : ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `GEMINI#${kIdx + 1}:${modelo}`,
            provedor: 'GEMINI',
            modelo,
            protocolo: 'gemini',
            endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
              modelo
            )}:generateContent?key=${encodeURIComponent(key)}`,
            apiKey: key,
          });
        }
      }
      break;
    }

    case 'GROQ': {
      const keys = parseListaCsv(process.env.GROQ_API_KEY);
      const modelos = parseListaCsv(process.env.GROQ_MODELS);
      const listaModelos =
        modelos.length > 0
          ? modelos
          : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `GROQ#${kIdx + 1}:${modelo}`,
            provedor: 'GROQ',
            modelo,
            protocolo: 'openai',
            endpoint: 'https://api.groq.com/openai/v1/chat/completions',
            apiKey: key,
          });
        }
      }
      break;
    }

    case 'CEREBRAS': {
      const keys = parseListaCsv(process.env.CEREBRAS_API_KEY);
      const modelos = parseListaCsv(process.env.CEREBRAS_MODELS);
      const listaModelos =
        modelos.length > 0 ? modelos : ['llama-3.3-70b', 'llama3.1-8b'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `CEREBRAS#${kIdx + 1}:${modelo}`,
            provedor: 'CEREBRAS',
            modelo,
            protocolo: 'openai',
            endpoint: 'https://api.cerebras.ai/v1/chat/completions',
            apiKey: key,
          });
        }
      }
      break;
    }

    case 'OPENROUTER': {
      const keys = parseListaCsv(process.env.OPENROUTER_API_KEY);
      const modelos = parseListaCsv(process.env.OPENROUTER_MODELS);
      const listaModelos =
        modelos.length > 0
          ? modelos
          : [
              'meta-llama/llama-3.3-70b-instruct:free',
              'google/gemma-3-27b-it:free',
              'mistralai/mistral-small-3.1-24b-instruct:free',
              'deepseek/deepseek-r1-0528:free',
            ];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `OPENROUTER#${kIdx + 1}:${modelo}`,
            provedor: 'OPENROUTER',
            modelo,
            protocolo: 'openai',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey: key,
            extraHeaders: {
              'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
              'X-Title': 'Radar Juridico',
            },
          });
        }
      }
      break;
    }

    case 'MISTRAL': {
      const keys = parseListaCsv(process.env.MISTRAL_API_KEY);
      const modelos = parseListaCsv(process.env.MISTRAL_MODELS);
      const listaModelos =
        modelos.length > 0 ? modelos : ['mistral-small-latest', 'open-mistral-nemo'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `MISTRAL#${kIdx + 1}:${modelo}`,
            provedor: 'MISTRAL',
            modelo,
            protocolo: 'openai',
            endpoint: 'https://api.mistral.ai/v1/chat/completions',
            apiKey: key,
          });
        }
      }
      break;
    }

    case 'NVIDIA': {
      const keys = parseListaCsv(process.env.NVIDIA_API_KEY);
      const modelos = parseListaCsv(process.env.NVIDIA_MODELS);
      const listaModelos =
        modelos.length > 0
          ? modelos
          : ['meta/llama-3.3-70b-instruct', 'mistralai/mistral-small-24b-instruct'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `NVIDIA#${kIdx + 1}:${modelo}`,
            provedor: 'NVIDIA',
            modelo,
            protocolo: 'openai',
            endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
            apiKey: key,
          });
        }
      }
      break;
    }

    case 'HUGGINGFACE': {
      const keys = parseListaCsv(process.env.HUGGINGFACE_API_KEY);
      const modelos = parseListaCsv(process.env.HUGGINGFACE_MODELS);
      const listaModelos =
        modelos.length > 0
          ? modelos
          : ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `HUGGINGFACE#${kIdx + 1}:${modelo}`,
            provedor: 'HUGGINGFACE',
            modelo,
            protocolo: 'openai',
            endpoint: 'https://router.huggingface.co/v1/chat/completions',
            apiKey: key,
          });
        }
      }
      break;
    }

    case 'CLOUDFLARE': {
      const tokens = parseListaCsv(process.env.CLOUDFLARE_API_TOKEN);
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
      if (!accountId || tokens.length === 0) break;
      const modelos = parseListaCsv(process.env.CLOUDFLARE_MODELS);
      const listaModelos =
        modelos.length > 0
          ? modelos
          : ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
      for (const [kIdx, token] of tokens.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `CLOUDFLARE#${kIdx + 1}:${modelo}`,
            provedor: 'CLOUDFLARE',
            modelo,
            protocolo: 'openai',
            endpoint: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
              accountId
            )}/ai/v1/chat/completions`,
            apiKey: token,
          });
        }
      }
      break;
    }

    case 'COHERE': {
      const keys = parseListaCsv(process.env.COHERE_API_KEY);
      const modelos = parseListaCsv(process.env.COHERE_MODELS);
      const listaModelos =
        modelos.length > 0 ? modelos : ['command-a-03-2025', 'command-r-08-2024'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `COHERE#${kIdx + 1}:${modelo}`,
            provedor: 'COHERE',
            modelo,
            protocolo: 'cohere',
            endpoint: 'https://api.cohere.com/v2/chat',
            apiKey: key,
          });
        }
      }
      break;
    }

    case 'OLLAMA': {
      const baseUrl = process.env.OLLAMA_BASE_URL?.trim().replace(/\/+$/, '');
      if (!baseUrl) break;
      const modelos = parseListaCsv(process.env.OLLAMA_MODELS);
      const listaModelos = modelos.length > 0 ? modelos : ['llama3.2', 'qwen2.5:7b'];
      for (const modelo of listaModelos) {
        slots.push({
          id: `OLLAMA#1:${modelo}`,
          provedor: 'OLLAMA',
          modelo,
          protocolo: 'openai',
          endpoint: `${baseUrl}/v1/chat/completions`,
          apiKey: 'ollama',
        });
      }
      break;
    }

    case 'OPENAI': {
      const keys = parseListaCsv(process.env.OPENAI_API_KEY);
      const modelos = parseListaCsv(process.env.OPENAI_MODELS);
      const listaModelos = modelos.length > 0 ? modelos : ['gpt-4o-mini'];
      for (const [kIdx, key] of keys.entries()) {
        for (const modelo of listaModelos) {
          slots.push({
            id: `OPENAI#${kIdx + 1}:${modelo}`,
            provedor: 'OPENAI',
            modelo,
            protocolo: 'openai',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: key,
          });
        }
      }
      break;
    }
  }

  return slots;
}

/**
 * Monta dinamicamente o pool de slots configurados a partir do `.env`.
 */
export function montarPoolSlotsIA(): SlotIA[] {
  const ordemCustom = parseListaCsv(process.env.IA_ORDEM_PROVEDORES).map((p) =>
    p.toUpperCase()
  ) as ProvedorIAId[];

  const ordemFinal: ProvedorIAId[] =
    ordemCustom.length > 0
      ? [
          ...ordemCustom.filter((p) => ORDEM_PADRAO_PROVEDORES.includes(p)),
          ...ORDEM_PADRAO_PROVEDORES.filter((p) => !ordemCustom.includes(p)),
        ]
      : ORDEM_PADRAO_PROVEDORES;

  const slots: SlotIA[] = [];
  for (const provedor of ordemFinal) {
    slots.push(...montarSlotsPorProvedor(provedor));
  }
  return slots;
}

function calcularCooldownMs(
  statusHttp: number | undefined,
  retryAfterHeader: string | null,
  corpoErro: string
): { ms: number; motivo: string } {
  if (retryAfterHeader) {
    const segundos = Number(retryAfterHeader);
    if (!Number.isNaN(segundos) && segundos > 0) {
      const limitado = Math.min(Math.max(segundos, 10), 3600);
      return {
        ms: limitado * 1000,
        motivo: `HTTP ${statusHttp ?? 429} (Retry-After: ${limitado}s)`,
      };
    }
  }

  const textoLower = corpoErro.toLowerCase();
  if (statusHttp === 429) {
    const pareceCotaDiaria =
      textoLower.includes('day') ||
      textoLower.includes('daily') ||
      textoLower.includes('quota') ||
      textoLower.includes('rpd') ||
      textoLower.includes('tpd');
    return pareceCotaDiaria
      ? { ms: 15 * 60 * 1000, motivo: 'Limite de cota/dia atingido (HTTP 429)' }
      : { ms: 65 * 1000, motivo: 'Rate limit por minuto atingido (HTTP 429)' };
  }

  if (statusHttp === 402) {
    return { ms: 60 * 60 * 1000, motivo: 'Crédito/cota esgotada (HTTP 402)' };
  }

  if (statusHttp === 401 || statusHttp === 403) {
    return { ms: 30 * 60 * 1000, motivo: `Chave inválida ou sem permissão (HTTP ${statusHttp})` };
  }

  if (statusHttp === 404) {
    return { ms: 30 * 60 * 1000, motivo: 'Modelo indisponível/descontinuado (HTTP 404)' };
  }

  return {
    ms: 45 * 1000,
    motivo: statusHttp ? `Instabilidade do provedor (HTTP ${statusHttp})` : 'Timeout ou erro de rede',
  };
}

async function dispararRequisicaoSlot(
  slot: SlotIA,
  prompt: string,
  systemInstruction?: string,
  exigirJson = false,
  timeoutMs = 25000
): Promise<
  | { ok: true; texto: string }
  | { ok: false; statusHttp?: number; retryAfter: string | null; erro: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res: Response;

    if (slot.protocolo === 'gemini') {
      res = await fetch(slot.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
            : {}),
          contents: [{ parts: [{ text: prompt }] }],
          ...(exigirJson
            ? { generationConfig: { responseMimeType: 'application/json' } }
            : {}),
        }),
      });
    } else if (slot.protocolo === 'cohere') {
      const messages = [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt },
      ];
      res = await fetch(slot.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slot.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: slot.modelo,
          messages,
        }),
      });
    } else {
      // Protocolo OpenAI-compatível (Groq, Cerebras, OpenRouter, Mistral, NVIDIA, HF, Cloudflare, Ollama, OpenAI)
      const messages = [
        ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
        { role: 'user', content: prompt },
      ];
      const payload: Record<string, unknown> = {
        model: slot.modelo,
        messages,
      };
      if (
        exigirJson &&
        ['GROQ', 'CEREBRAS', 'OPENAI', 'MISTRAL'].includes(slot.provedor)
      ) {
        payload.response_format = { type: 'json_object' };
      }
      res = await fetch(slot.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slot.apiKey}`,
          ...(slot.extraHeaders || {}),
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      return {
        ok: false,
        statusHttp: res.status,
        retryAfter: res.headers.get('retry-after'),
        erro: corpo.slice(0, 300),
      };
    }

    const data = await res.json();
    let rawText = '';

    if (slot.protocolo === 'gemini') {
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (slot.protocolo === 'cohere') {
      const parts = data?.message?.content;
      rawText = Array.isArray(parts)
        ? parts.map((p: { text?: string }) => p?.text || '').join('\n')
        : '';
    } else {
      rawText = data?.choices?.[0]?.message?.content || '';
    }

    const textoLimpo = String(rawText).trim();
    if (!textoLimpo) {
      return {
        ok: false,
        statusHttp: 502,
        retryAfter: null,
        erro: 'Resposta vazia do modelo',
      };
    }

    return { ok: true, texto: textoLimpo };
  } catch (err: unknown) {
    return {
      ok: false,
      retryAfter: null,
      erro: err instanceof Error ? err.message : 'Erro de rede',
    };
  } finally {
    clearTimeout(timer);
  }
}

function pontuarAdequacaoModelo(
  modelo: string,
  complexidade?: 'LEVE' | 'FORTE'
): number {
  if (!complexidade) return 0;
  const m = modelo.toLowerCase();
  const ehLeve =
    m.includes('lite') ||
    m.includes('8b') ||
    m.includes('mini') ||
    m.includes('nemo') ||
    m.includes('3b') ||
    m.includes('7b');
  if (complexidade === 'LEVE') return ehLeve ? 0 : 1;
  return ehLeve ? 1 : 0;
}

/**
 * Issue #76 + #77: Executa a chamada no pool Multi-IA com distribuição paralela por carga
 * (Least-Loaded Round-Robin), reserva atômica do slot antes do `fetch` e roteamento por complexidade.
 * - Pula slots em cooldown.
 * - Múltiplos clientes simultâneos são distribuídos automaticamente em IAs diferentes sem fila.
 * - Ao receber 429/erro, coloca o slot em cooldown e avança para o próximo na mesma chamada.
 */
export async function executarChamadaMultiIA(params: {
  prompt: string;
  systemInstruction?: string;
  exigirJson?: boolean;
  timeoutMs?: number;
  complexidade?: 'LEVE' | 'FORTE';
}): Promise<ResultadoChamadaMultiIA | null> {
  const slots = montarPoolSlotsIA();
  if (slots.length === 0) return null;

  const estado = obterEstadoGlobal();
  const agora = Date.now();
  const estrategiaRoundRobin =
    (process.env.IA_MODO_CICLO || '').toUpperCase() === 'ROUND_ROBIN';

  // Reserva atômica do ponto de partida antes de qualquer `await`
  const inicio = estado.ponteiroCiclo % slots.length;
  if (estrategiaRoundRobin) {
    estado.ponteiroCiclo = (inicio + 1) % slots.length;
  }

  const ordenadosPorCiclo: Array<{ slot: SlotIA; idx: number; ordemCiclo: number }> = [];
  for (let i = 0; i < slots.length; i++) {
    const idx = (inicio + i) % slots.length;
    ordenadosPorCiclo.push({ slot: slots[idx], idx, ordemCiclo: i });
  }

  const disponiveis = ordenadosPorCiclo
    .filter(({ slot }) => {
      const cd = estado.cooldownPorSlot.get(slot.id);
      if (!cd) return true;
      if (agora >= cd.ate) {
        estado.cooldownPorSlot.delete(slot.id);
        return true;
      }
      return false;
    })
    // Least-Loaded Round-Robin (#76) + Preferência Leve vs. Forte (#77):
    // 1) Sempre prioriza slots com menos requisições em andamento agora (evita fila/trombada)
    // 2) Desempata pela adequação do modelo (LEVE vs FORTE) quando informado
    // 3) Mantém a ordem circular do pool
    .sort((a, b) => {
      const cargaA = estado.emAndamentoPorSlot.get(a.slot.id) ?? 0;
      const cargaB = estado.emAndamentoPorSlot.get(b.slot.id) ?? 0;
      if (cargaA !== cargaB) return cargaA - cargaB;

      const adequacaoA = pontuarAdequacaoModelo(a.slot.modelo, params.complexidade);
      const adequacaoB = pontuarAdequacaoModelo(b.slot.modelo, params.complexidade);
      if (adequacaoA !== adequacaoB) return adequacaoA - adequacaoB;

      return a.ordemCiclo - b.ordemCiclo;
    });

  // Se todos estiverem em cooldown, tenta o que tem cooldown mais próximo de vencer
  const filaTentativa =
    disponiveis.length > 0
      ? disponiveis
      : [...ordenadosPorCiclo]
          .sort((a, b) => {
            const cdA = estado.cooldownPorSlot.get(a.slot.id)?.ate ?? 0;
            const cdB = estado.cooldownPorSlot.get(b.slot.id)?.ate ?? 0;
            return cdA - cdB;
          })
          .slice(0, 1);

  let tentativas = 0;

  for (const { slot, idx } of filaTentativa) {
    tentativas++;
    const emAndamentoAntes = estado.emAndamentoPorSlot.get(slot.id) ?? 0;
    estado.emAndamentoPorSlot.set(slot.id, emAndamentoAntes + 1);

    let resposta: Awaited<ReturnType<typeof dispararRequisicaoSlot>>;
    try {
      resposta = await dispararRequisicaoSlot(
        slot,
        params.prompt,
        params.systemInstruction,
        Boolean(params.exigirJson),
        params.timeoutMs
      );
    } finally {
      const atual = estado.emAndamentoPorSlot.get(slot.id) ?? 1;
      if (atual <= 1) {
        estado.emAndamentoPorSlot.delete(slot.id);
      } else {
        estado.emAndamentoPorSlot.set(slot.id, atual - 1);
      }
    }

    if (resposta.ok) {
      estado.cooldownPorSlot.delete(slot.id);
      estado.totalRequisicoes++;
      estado.ultimoUso = {
        provedor: slot.provedor,
        modelo: slot.modelo,
        em: new Date().toISOString(),
      };
      if (!estrategiaRoundRobin) {
        estado.ponteiroCiclo = idx;
      }

      return {
        texto: resposta.texto,
        provedor: slot.provedor,
        modelo: slot.modelo,
        modo: `LLM_${slot.provedor}`,
        slotId: slot.id,
        tentativas,
      };
    }

    const { ms, motivo } = calcularCooldownMs(
      resposta.statusHttp,
      resposta.retryAfter,
      resposta.erro
    );
    estado.cooldownPorSlot.set(slot.id, {
      ate: Date.now() + ms,
      motivo,
      statusHttp: resposta.statusHttp,
    });
    estado.totalFailovers++;
    estado.ponteiroCiclo = (idx + 1) % slots.length;
  }

  return null;
}

/**
 * Retorna diagnóstico em tempo real do pool Multi-IA (sem expor nenhuma API Key).
 */
export function obterStatusPoolIA(): StatusPoolIA {
  const slots = montarPoolSlotsIA();
  const estado = obterEstadoGlobal();
  const agora = Date.now();

  const provedoresUnicos = new Set(slots.map((s) => s.provedor));
  let totalEmAndamentoAgora = 0;

  const detalhesSlots = slots.map((slot) => {
    const cd = estado.cooldownPorSlot.get(slot.id);
    const emCooldown = Boolean(cd && agora < cd.ate);
    if (cd && !emCooldown) {
      estado.cooldownPorSlot.delete(slot.id);
    }
    const emAndamentoAgora = estado.emAndamentoPorSlot.get(slot.id) ?? 0;
    totalEmAndamentoAgora += emAndamentoAgora;

    return {
      id: slot.id,
      provedor: slot.provedor,
      modelo: slot.modelo,
      status: (emCooldown ? 'EM_COOLDOWN' : 'DISPONIVEL') as 'DISPONIVEL' | 'EM_COOLDOWN',
      emAndamentoAgora,
      cooldownSegundosRestantes:
        emCooldown && cd ? Math.max(1, Math.ceil((cd.ate - agora) / 1000)) : 0,
      ...(emCooldown && cd ? { motivoCooldown: cd.motivo } : {}),
    };
  });

  const disponiveis = detalhesSlots.filter((s) => s.status === 'DISPONIVEL');
  const slotAtual =
    slots.length > 0 ? slots[estado.ponteiroCiclo % slots.length] : null;

  return {
    modoOperacao: slots.length > 0 ? 'MULTI_IA_ATIVO' : 'HEURISTICA_LOCAL',
    estrategiaCiclo:
      (process.env.IA_MODO_CICLO || '').toUpperCase() === 'ROUND_ROBIN'
        ? 'ROUND_ROBIN'
        : 'FAILOVER_CICLICO',
    provedorAtivo:
      slots.length === 0
        ? 'HEURISTICA_LOCAL'
        : estado.ultimoUso?.provedor || slotAtual?.provedor || 'HEURISTICA_LOCAL',
    modeloAtivo:
      slots.length === 0
        ? null
        : estado.ultimoUso?.modelo || slotAtual?.modelo || null,
    totalProvedoresConfigurados: provedoresUnicos.size,
    totalSlotsConfigurados: slots.length,
    slotsDisponiveisAgora: disponiveis.length,
    slotsEmCooldown: detalhesSlots.length - disponiveis.length,
    totalEmAndamentoAgora,
    totalRequisicoes: estado.totalRequisicoes,
    totalFailovers: estado.totalFailovers,
    ultimoUso: estado.ultimoUso,
    slots: detalhesSlots,
  };
}
