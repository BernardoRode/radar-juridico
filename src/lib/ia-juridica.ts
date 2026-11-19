export interface AnaliseIAJuridica {
  resumoExecutivo: string;
  nivelRisco: 'CRITICO' | 'ALTO' | 'MODERADO' | 'BAIXO';
  falhasOuRiscosDetectados: string[];
  oportunidadeComercial: string;
  modo: 'LLM_GEMINI' | 'LLM_OPENAI' | 'ANALISE_HEURISTICA';
}

export interface ParametrosAnaliseIA {
  texto: string;
  statusConcorrencia?: string;
  tipoAtoDetectado?: string;
  tribunal?: string;
  numeroProcesso?: string;
}

/**
 * Helper centralizado para chamadas de texto a LLM (Gemini 2.5 Flash ou OpenAI GPT-4o-mini).
 * Retorna `null` se nenhuma chave estiver configurada ou em caso de indisponibilidade,
 * permitindo fallback seguro sem quebrar a aplicação.
 */
export async function chamarLlmTexto(
  prompt: string,
  systemInstruction?: string
): Promise<{ texto: string; modo: 'LLM_GEMINI' | 'LLM_OPENAI' } | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(systemInstruction
              ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
              : {}),
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText && String(rawText).trim()) {
          return { texto: String(rawText).trim(), modo: 'LLM_GEMINI' };
        }
      }
    } catch {
      // Continua para OpenAI ou fallback
    }
  }

  if (openaiKey) {
    try {
      const messages = [
        ...(systemInstruction
          ? [{ role: 'system', content: systemInstruction }]
          : []),
        { role: 'user', content: prompt },
      ];
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const rawText = data?.choices?.[0]?.message?.content;
        if (rawText && String(rawText).trim()) {
          return { texto: String(rawText).trim(), modo: 'LLM_OPENAI' };
        }
      }
    } catch {
      // Fallback
    }
  }

  return null;
}

/**
 * Issue #28: OCR Multimodal real para PDFs escaneados / sem texto selecionável usando Gemini API.
 * Envia o PDF em base64 (até 12 MB) para transcrição fiel do teor judicial.
 */
export async function extrairTextoPdfViaOcrLlm(
  pdfBuffer: Buffer
): Promise<{ texto: string; provedor: 'GEMINI_OCR_PDF' } | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) return null;
  if (pdfBuffer.length > 12 * 1024 * 1024) return null; // Limite seguro inline

  try {
    const base64Pdf = pdfBuffer.toString('base64');
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        geminiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: base64Pdf,
                  },
                },
                {
                  text: 'Faça OCR completo e fiel deste documento judicial brasileiro em português. Retorne apenas o texto transcrito preservando parágrafos, números de processo, valores em reais, prazos e datas, sem comentários adicionais.',
                },
              ],
            },
          ],
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawText && String(rawText).trim().length > 10) {
      return { texto: String(rawText).trim(), provedor: 'GEMINI_OCR_PDF' };
    }
  } catch {
    return null;
  }

  return null;
}

function montarPromptJuridico(params: ParametrosAnaliseIA): string {
  return `Você é um advogado sênior especialista em inteligência jurídica contenciosa no Brasil.
Analise a publicação judicial abaixo e responda EXCLUSIVAMENTE em JSON válido com as chaves:
- "resumoExecutivo": string (máximo 2 linhas objetivas explicando o que o juiz determinou)
- "nivelRisco": "CRITICO" | "ALTO" | "MODERADO" | "BAIXO"
- "falhasOuRiscosDetectados": array de strings (ex: "Revelia decretada", "Perda de prazo / Intempestividade", "Bloqueio Sisbajud / Penhora", "Condenação / Multa", "Citação sem advogado habilitado")
- "oportunidadeComercial": string (se statusConcorrencia for ESCRITORIO_CONCORRENTE ou SEM_ADVOGADO_CADASTRADO, sugira uma abordagem estratégica ao cliente; se for NOSSO_ESCRITORIO, sugira a próxima providência processual)

Contexto:
- Processo: ${params.numeroProcesso || 'Não informado'} (${params.tribunal || 'Tribunal'})
- Status de Concorrência: ${params.statusConcorrencia || 'Não informado'}
- Tipo de Ato Detectado: ${params.tipoAtoDetectado || 'Comunicação'}

Texto da publicação:
${params.texto.slice(0, 6000)}`;
}

function analiseHeuristicaJuridica(
  params: ParametrosAnaliseIA
): AnaliseIAJuridica {
  const t = (params.texto || '').toLowerCase();
  const riscos: string[] = [];
  let nivelRisco: AnaliseIAJuridica['nivelRisco'] = 'BAIXO';

  if (t.includes('revelia') || t.includes('revel')) {
    riscos.push('Revelia detectada nos autos');
    nivelRisco = 'CRITICO';
  }
  if (
    t.includes('intempestiv') ||
    t.includes('preclus') ||
    t.includes('decurso de prazo') ||
    t.includes('sem manifestação')
  ) {
    riscos.push('Possível perda de prazo / preclusão');
    nivelRisco = 'CRITICO';
  }
  if (t.includes('sisbajud') || t.includes('bloqueio') || t.includes('penhora')) {
    riscos.push('Ordem de bloqueio financeiro (Sisbajud) ou penhora');
    nivelRisco = 'CRITICO';
  }
  if (t.includes('multa') || t.includes('astreintes') || t.includes('litigância de má-fé')) {
    riscos.push('Aplicação ou cominação de multa / astreintes');
    if (nivelRisco !== 'CRITICO') nivelRisco = 'ALTO';
  }
  if (t.includes('julgo procedente') || t.includes('condeno')) {
    riscos.push('Decisão condenatória / procedência desfavorável');
    if (nivelRisco !== 'CRITICO') nivelRisco = 'ALTO';
  }
  if (t.includes('tutela de urgência') || t.includes('liminar')) {
    riscos.push('Medida liminar / tutela de urgência');
    if (nivelRisco === 'BAIXO') nivelRisco = 'ALTO';
  }
  if (t.includes('citação') || t.includes('cite-se')) {
    riscos.push('Ato citatório — prazo de defesa prestes a iniciar');
    if (nivelRisco === 'BAIXO') nivelRisco = 'MODERADO';
  }

  if (riscos.length === 0) {
    riscos.push('Nenhum risco crítico explícito identificado no despacho.');
  }

  const sentencas = params.texto
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 20);
  const resumoExecutivo =
    sentencas.slice(0, 2).join(' ').slice(0, 320) ||
    `${params.tipoAtoDetectado || 'Comunicação processual'} disponibilizada no ${params.tribunal || 'tribunal'}.`;

  let oportunidadeComercial =
    'Acompanhar o prazo em curso e registrar a providência na pasta do processo.';

  if (params.statusConcorrencia === 'ESCRITORIO_CONCORRENTE') {
    oportunidadeComercial =
      nivelRisco === 'CRITICO' || nivelRisco === 'ALTO'
        ? 'Oportunidade de auditoria/abordagem ao cliente: o escritório concorrente sofreu evento crítico/adverso neste processo. Apresentar parecer preventivo e plano de reversão.'
        : 'Processo conduzido por escritório concorrente. Manter monitoramento de eventuais falhas de prazo ou decisões desfavoráveis para abordagem estratégica.';
  } else if (params.statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO') {
    oportunidadeComercial =
      'Alerta antecipado ("Um Passo à Frente"): o cliente ainda não possui advogado habilitado neste processo. Contatar o jurídico do cliente imediatamente para assumir a defesa.';
  }

  return {
    resumoExecutivo,
    nivelRisco,
    falhasOuRiscosDetectados: riscos,
    oportunidadeComercial,
    modo: 'ANALISE_HEURISTICA',
  };
}

/**
 * Issue #8: Analisa o texto da publicação/decisão usando Gemini, OpenAI ou fallback heurístico local.
 */
export async function analisarPublicacaoComIA(
  params: ParametrosAnaliseIA
): Promise<AnaliseIAJuridica> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const prompt = montarPromptJuridico(params);

  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return {
            resumoExecutivo: parsed.resumoExecutivo,
            nivelRisco: parsed.nivelRisco || 'MODERADO',
            falhasOuRiscosDetectados: Array.isArray(parsed.falhasOuRiscosDetectados)
              ? parsed.falhasOuRiscosDetectados
              : [],
            oportunidadeComercial: parsed.oportunidadeComercial || '',
            modo: 'LLM_GEMINI',
          };
        }
      }
    } catch {
      // Fallback para OpenAI ou heurística
    }
  }

  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const rawText = data?.choices?.[0]?.message?.content;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          return {
            resumoExecutivo: parsed.resumoExecutivo,
            nivelRisco: parsed.nivelRisco || 'MODERADO',
            falhasOuRiscosDetectados: Array.isArray(parsed.falhasOuRiscosDetectados)
              ? parsed.falhasOuRiscosDetectados
              : [],
            oportunidadeComercial: parsed.oportunidadeComercial || '',
            modo: 'LLM_OPENAI',
          };
        }
      }
    } catch {
      // Fallback para heurística
    }
  }

  return analiseHeuristicaJuridica(params);
}

export type TipoMinuta =
  | 'RESPOSTA_AUTOMATICA'
  | 'NULIDADE_ART_272_CPC'
  | 'HABILITACAO_URGENTE'
  | 'IMPUGNACAO_SISBAJUD';

export interface ParametrosPreMinuta {
  numeroProcesso: string;
  tribunal: string;
  orgaoJulgador: string;
  partes: string[];
  tipoAtoDetectado: string;
  textoPublicacao: string;
  textoPdfExtraido?: string;
  tipoMinuta?: TipoMinuta;
}

/**
 * Issue #15 + Issue #46 + Issue #68: Gera pré-minuta de petição pronta para protocolo.
 * Usa LLM real (Gemini / OpenAI) quando configurada no `.env`, com fallback estruturado para template jurídico.
 */
export async function gerarPreMinutaPeticao(
  params: ParametrosPreMinuta
): Promise<{ tituloPeca: string; minutaTexto: string; modo: string }> {
  const orgao = (params.orgaoJulgador || `JUÍZO DO ${params.tribunal}`).toUpperCase();
  const partesTexto =
    params.partes && params.partes.length > 0
      ? params.partes.join(' / ')
      : 'PARTE INTERESSADA (QUALIFICADA NOS AUTOS)';

  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const t = `${params.textoPublicacao || ''} ${params.textoPdfExtraido || ''}`.toLowerCase();
  let tituloPeca = 'Petição de Manifestação Processual';
  if (params.tipoMinuta === 'NULIDADE_ART_272_CPC') {
    tituloPeca = 'Arguição de Nulidade de Intimação e Devolução de Prazo (Art. 272, §§ 2º e 5º do CPC)';
  } else if (
    params.tipoMinuta === 'IMPUGNACAO_SISBAJUD' ||
    t.includes('sisbajud') ||
    t.includes('penhora') ||
    t.includes('bloqueio')
  ) {
    tituloPeca = 'Impugnação à Penhora / Pedido de Desbloqueio via Sisbajud (Art. 854, § 3º, CPC)';
  } else if (t.includes('perícia') || t.includes('laudo') || t.includes('perito')) {
    tituloPeca = 'Indicação de Assistente Técnico e Apresentação de Quesitos (Art. 465, § 1º, CPC)';
  } else if (
    params.tipoMinuta === 'HABILITACAO_URGENTE' ||
    t.includes('citação') ||
    t.includes('cite-se')
  ) {
    tituloPeca = 'Petição de Habilitação nos Autos e Juntada de Procuração';
  }

  // Tenta geração contextualizada via LLM real (Gemini / OpenAI) quando houver chave configurada
  const promptMinuta = `Elabore uma pré-minuta jurídica formal em português brasileiro, pronta para revisão do advogado, seguindo rigorosamente o CPC/CLT aplicável.

DADOS DO PROCESSO:
- Endereçamento: ${orgao} - ${params.tribunal}
- Processo nº: ${params.numeroProcesso}
- Partes: ${partesTexto}
- Peça solicitada: ${tituloPeca}
- Tipo de ato/despacho: ${params.tipoAtoDetectado}
- Data: ${dataHoje}

TEXTO DA PUBLICAÇÃO:
${(params.textoPublicacao || '').slice(0, 5000)}
${
  params.textoPdfExtraido
    ? `\nINTEIRO TEOR DO PDF ASSINADO EXTRAÍDO:\n${params.textoPdfExtraido.slice(0, 6000)}`
    : ''
}

INSTRUÇÕES:
- Use estrutura forense completa (Endereçamento, Número do Processo, Qualificação resumida, Título da Peça, Dos Fatos e do Ato Recorrido/Respondido, Do Direito com fundamentação legal aplicável, Dos Pedidos objetivos, Fecho com Local/Data e espaço para assinatura OAB/UF).
- Não invente fatos que não estejam no texto; onde faltar dado específico do cliente, use marcadores claros entre colchetes como [COMPLETAR COM PROVA DOCUMENTAL].
- Retorne apenas o texto da petição em texto puro (sem markdown \`\`\`).`;

  const llmRes = await chamarLlmTexto(
    promptMinuta,
    'Você é um advogado sênior contencioso brasileiro especialista em redação de peças processuais precisas e objetivas.'
  );

  if (llmRes) {
    return {
      tituloPeca,
      modo: llmRes.modo,
      minutaTexto: llmRes.texto,
    };
  }

  // Fallback estruturado quando não há GEMINI_API_KEY / OPENAI_API_KEY
  if (params.tipoMinuta === 'NULIDADE_ART_272_CPC') {
    return {
      tituloPeca,
      modo: 'TEMPLATE_FALLBACK',
      minutaTexto: `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DO(A) ${orgao} - ${params.tribunal}

Processo nº ${params.numeroProcesso}

${partesTexto}, já devidamente qualificada nos autos do processo em epígrafe, vem, respeitosamente, à presença de Vossa Excelência, por seus advogados signatários, arguir

NULIDADE DE INTIMAÇÃO C/C PEDIDO DE DEVOLUÇÃO DE PRAZO PROCESSUAL
(com fulcro no Art. 272, §§ 2º e 5º, e Art. 280 do Código de Processo Civil)

1. DOS FATOS E DA FALHA NA DISPONIBILIZAÇÃO DA INTIMAÇÃO
Em auditoria automatizada no barramento oficial do Diário de Justiça Eletrônico Nacional (DJEN / Comunica PJe), constatou-se a disponibilização do ato "${params.tipoAtoDetectado}" sem a regular observância dos patronos devidamente cadastrados ou mediante indisponibilidade técnica do inteiro teor.

2. DO DIREITO (ART. 272, § 5º, DO CPC)
Dispõe expressamente o art. 272, § 5º, do CPC que: "Constando dos autos pedido expresso para que as comunicações dos atos processuais sejam feitas em nome dos advogados indicados, o seu desatendimento implicará nulidade".

3. DOS PEDIDOS
Diante do exposto, requer:
a) O reconhecimento da nulidade da intimação disponibilizada, com a consequente republicação do ato constando expressamente os patronos constituídos;
b) A integral devolução do prazo legal para manifestação acerca do r. despacho/decisão.

Termos em que, pede deferimento.
Local/Data: ${dataHoje}.

_________________________________________________
ADVOGADO(A) — OAB/UF`,
    };
  }

  let corpoEspecifico = `1. DA TEMPESTIVIDADE E DO ATENDIMENTO AO DESPACHO
Em atenção à r. publicação disponibilizada referente a "${params.tipoAtoDetectado}", a Requerente comparece tempestivamente aos autos para apresentar sua manifestação técnica.

2. DO MÉRITO DA MANIFESTAÇÃO
Conforme se extrai do inteiro teor do ato judicial ("${params.textoPublicacao.slice(0, 260).replace(/\s+/g, ' ')}..."), cumpre esclarecer e requerer o prosseguimento regular do feito nos seguintes termos:
[INSERIR FUNDAMENTAÇÃO ESPECÍFICA DO CASO]`;

  if (t.includes('sisbajud') || t.includes('penhora') || t.includes('bloqueio')) {
    corpoEspecifico = `1. DO BLOQUEIO REALIZADO E DA EXCESSIVIDADE / IMPENHORABILIDADE
Em atenção à ordem de constrição via Sisbajud detectada nos autos, vem a Executada, no prazo do art. 854, § 3º, do CPC, demonstrar a necessidade de imediata liberação dos valores constritos, evitando-se grave dano à operação empresarial (art. 805 do CPC - princípio da menor onerosidade).`;
  } else if (t.includes('perícia') || t.includes('laudo') || t.includes('perito')) {
    corpoEspecifico = `1. DA INDICAÇÃO DE ASSISTENTE TÉCNICO E QUESITOS
Em cumprimento ao r. despacho que determinou a realização de prova pericial, a parte indica como seu Assistente Técnico o(a) profissional [NOME / REGISTRO], apresentando desde já seus Quesitos Técnicos e requerendo seja intimado(a) da data e local de início da diligência (Art. 466, § 2º, do CPC).`;
  } else if (t.includes('citação') || t.includes('cite-se')) {
    corpoEspecifico = `1. DA HABILITAÇÃO IMEDIATA E CADASTRAMENTO DE PATRONOS (ART. 272, § 5º, CPC)
A Requerida comparece espontaneamente aos autos para requerer a imediata juntada de seus atos constitutivos e instrumento de mandato, requerendo ainda que todas as futuras publicações e intimações sejam realizadas EXCLUSIVAMENTE em nome dos advogados subscritores, sob pena de nulidade (Art. 272, § 5º, do CPC).`;
  }

  return {
    tituloPeca,
    modo: 'TEMPLATE_FALLBACK',
    minutaTexto: `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DO(A) ${orgao} - ${params.tribunal}

Processo nº ${params.numeroProcesso}

${partesTexto}, já qualificada nos autos em epígrafe, por seus advogados que esta subscrevem, vem, respeitosamente, à presença de Vossa Excelência apresentar

${tituloPeca.toUpperCase()}

${corpoEspecifico}

3. DOS PEDIDOS
Ante o exposto, requer a juntada da presente manifestação e o acolhimento dos requerimentos acima formulados, observando-se a exclusividade das intimações em nome dos patronos constituídos (Art. 272, § 5º, do CPC).

Termos em que, pede deferimento.
Local/Data: ${dataHoje}.

_________________________________________________
ADVOGADO(A) — OAB/UF`,
  };
}
