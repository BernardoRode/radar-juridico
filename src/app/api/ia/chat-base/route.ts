import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/ia/chat-base
 * Issue #27: Busca Semântica / RAG sobre todos os processos, publicações e PDFs extraídos
 * salvos no banco de dados SQLite do escritório.
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
      .replace(/[?.,!;]/g, '')
      .split(/\s+/)
      .filter((t) => t.length >= 3);

    const [publicacoes, documentos] = await Promise.all([
      prisma.publicacao.findMany({
        include: { processo: true },
        orderBy: { criadoEm: 'desc' },
        take: 150,
      }),
      prisma.documentoOriginal.findMany({
        include: { processo: true },
        orderBy: { criadoEm: 'desc' },
        take: 100,
      }),
    ]);

    const trechosRelevantes: Array<{
      fonte: string;
      processo: string;
      tribunal: string;
      trecho: string;
      pontos: number;
    }> = [];

    for (const pub of publicacoes) {
      const txt = `${pub.texto} ${pub.tipoAtoDetectado} ${pub.processo.numeroFormatado} ${pub.processo.siglaTribunal}`.toLowerCase();
      const pontos = termos.reduce((acc, t) => acc + (txt.includes(t) ? 1 : 0), 0);
      if (pontos > 0 || trechosRelevantes.length < 3) {
        trechosRelevantes.push({
          fonte: `Publicação DJEN (${pub.dataDisponibilizacao})`,
          processo: pub.processo.numeroFormatado,
          tribunal: pub.processo.siglaTribunal,
          trecho: pub.texto.slice(0, 320),
          pontos,
        });
      }
    }

    for (const doc of documentos) {
      if (!doc.textoExtraido) continue;
      const txt = `${doc.textoExtraido} ${doc.tituloDocumento || ''} ${doc.assinadoPor || ''}`.toLowerCase();
      const pontos = termos.reduce((acc, t) => acc + (txt.includes(t) ? 2 : 0), 0);
      if (pontos > 0) {
        trechosRelevantes.push({
          fonte: `PDF Extraído (${doc.sistema} — Assinado por: ${doc.assinadoPor || 'N/I'})`,
          processo: doc.processo?.numeroFormatado || doc.urlOriginal.slice(0, 45),
          tribunal: doc.processo?.siglaTribunal || doc.sistema,
          trecho: doc.textoExtraido.slice(0, 350),
          pontos,
        });
      }
    }

    const topContexto = trechosRelevantes
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 5);

    const respostaSintetizada =
      topContexto.length === 0
        ? 'Ainda não há publicações ou PDFs gravados no banco local que correspondam aos termos pesquisados. Dispare uma busca no Radar ou extraia um link do PJe primeiro.'
        : `Encontrei ${topContexto.length} registro(s) relevante(s) na base local do escritório para "${pergunta}":\n\n` +
          topContexto
            .map(
              (c, idx) =>
                `${idx + 1}. [${c.tribunal} — Proc. ${c.processo}] (${c.fonte}):\n"${c.trecho.replace(/\s+/g, ' ')}..."`
            )
            .join('\n\n');

    return NextResponse.json({
      sucesso: true,
      pergunta,
      totalFontesConsultadas: publicacoes.length + documentos.length,
      resposta: respostaSintetizada,
      fontes: topContexto,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro na busca RAG';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
