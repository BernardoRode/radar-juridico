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
 * Analisa o texto da publicação/decisão usando Gemini, OpenAI ou fallback heurístico local.
 */
export async function analisarPublicacaoComIA(
  params: ParametrosAnaliseIA
): Promise<AnaliseIAJuridica> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
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
