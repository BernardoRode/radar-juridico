import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { chamarLlmTexto } from '@/lib/ia-juridica';

/**
 * POST /api/ia/chat-base
 * Issue #27 + Issue #69: Busca Semântica / RAG sobre todos os processos, publicações e PDFs extraídos
 * salvos no banco do escritório, com síntese real por LLM (Gemini/OpenAI) quando configurada.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pergunta = String(body?.pergunta || '').trim();

    if (!pergunta) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe a pergunta para consultar a base do escritório.' },
        { status: 400 }
      );
    }

    const termos = pergunta
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[?.,!;:"'()]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    const normalizar = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const [publicacoes, documentos] = await Promise.all([
      prisma.publicacao.findMany({
        include: { processo: true },
        orderBy: { criadoEm: 'desc' },
        take: 400,
      }),
      prisma.documentoOriginal.findMany({
        include: { processo: true },
        orderBy: { criadoEm: 'desc' },
        take: 250,
      }),
    ]);

    const trechosRelevantes: Array<{
      fonte: string;
      processo: string;
      tribunal: string;
      trecho: string;
      textoCompleto: string;
      pontos: number;
    }> = [];

    for (const pub of publicacoes) {
      const txt = normalizar(
        `${pub.texto} ${pub.tipoAtoDetectado} ${pub.processo.numeroFormatado} ${pub.processo.siglaTribunal} ${pub.processo.orgaoJulgador} ${pub.processo.partesJson || ''} ${pub.valorDetectado || ''}`
      );
      const pontos = termos.reduce((acc, t) => acc + (txt.includes(t) ? 1 : 0), 0);
      if (pontos > 0) {
        trechosRelevantes.push({
          fonte: `Publicação DJEN (${pub.dataDisponibilizacao}) — ${pub.tipoAtoDetectado}`,
          processo: pub.processo.numeroFormatado,
          tribunal: pub.processo.siglaTribunal,
          trecho: pub.texto.slice(0, 360),
          textoCompleto: pub.texto.slice(0, 1400),
          pontos,
        });
      }
    }

    for (const doc of documentos) {
      if (!doc.textoExtraido) continue;
      const txt = normalizar(
        `${doc.textoExtraido} ${doc.tituloDocumento || ''} ${doc.assinadoPor || ''} ${doc.processo?.numeroFormatado || ''}`
      );
      const pontos = termos.reduce((acc, t) => acc + (txt.includes(t) ? 2 : 0), 0);
      if (pontos > 0) {
        trechosRelevantes.push({
          fonte: `PDF Extraído (${doc.sistema} — Assinado por: ${doc.assinadoPor || 'N/I'})`,
          processo: doc.processo?.numeroFormatado || doc.urlOriginal.slice(0, 45),
          tribunal: doc.processo?.siglaTribunal || doc.sistema,
          trecho: doc.textoExtraido.slice(0, 380),
          textoCompleto: doc.textoExtraido.slice(0, 1600),
          pontos,
        });
      }
    }

    const topContexto = trechosRelevantes
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 8);

    if (topContexto.length === 0) {
      return NextResponse.json({
        sucesso: true,
        pergunta,
        modo: 'SEM_RESULTADOS',
        totalFontesConsultadas: publicacoes.length + documentos.length,
        resposta:
          'Ainda não há publicações ou PDFs gravados no banco local que correspondam aos termos pesquisados. Dispare uma busca no Radar ou extraia um link do PJe primeiro.',
        fontes: [],
      });
    }

    // Tenta síntese RAG com LLM real (Gemini / OpenAI) fundamentada exclusivamente nas fontes recuperadas
    const contextoFormatado = topContexto
      .map(
        (c, idx) =>
          `[FONTE ${idx + 1}] Processo: ${c.processo} | Tribunal: ${c.tribunal} | Origem: ${c.fonte}\nConteúdo: ${c.textoCompleto}`
      )
      .join('\n\n---\n\n');

    const llmRes = await chamarLlmTexto(
      `Pergunta do advogado: "${pergunta}"

Responda de forma objetiva e analítica usando EXCLUSIVAMENTE os documentos recuperados da base do escritório abaixo. Cite explicitamente o número do processo, o tribunal e a fonte de cada informação. Se alguma informação pedida não estiver nos trechos, diga claramente o que não foi encontrado.

FONTES RECUPERADAS:
${contextoFormatado}`,
      'Você é um assistente jurídico RAG de alta precisão. Nunca invente processos, valores ou decisões que não constem nas fontes fornecidas.'
    );

    const respostaFinal = llmRes
      ? llmRes.texto
      : `Encontrei ${topContexto.length} registro(s) relevante(s) na base local do escritório para "${pergunta}" (modo busca lexical — configure GEMINI_API_KEY ou OPENAI_API_KEY para síntese por IA):\n\n` +
        topContexto
          .slice(0, 5)
          .map(
            (c, idx) =>
              `${idx + 1}. [${c.tribunal} — Proc. ${c.processo}] (${c.fonte}):\n"${c.trecho.replace(/\s+/g, ' ')}..."`
          )
          .join('\n\n');

    return NextResponse.json({
      sucesso: true,
      pergunta,
      modo: llmRes ? `RAG_${llmRes.modo}` : 'BUSCA_LEXICAL_FALLBACK',
      totalFontesConsultadas: publicacoes.length + documentos.length,
      resposta: respostaFinal,
      fontes: topContexto.map(({ fonte, processo, tribunal, trecho, pontos }) => ({
        fonte,
        processo,
        tribunal,
        trecho,
        pontos,
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro na busca RAG';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
