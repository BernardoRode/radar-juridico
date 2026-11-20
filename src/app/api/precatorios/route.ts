import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * GET /api/precatorios
 * Issue #106: Endpoint estruturado de Precatórios, RPVs e Alvarás para fintechs e jurídico financeiro.
 * Extrai tipo (`PRECATORIO` | `RPV` | `ALVARA`), natureza (`ALIMENTAR` | `COMUM`), ente devedor e valor.
 */
export async function GET(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const publicacoes = await prisma.publicacao.findMany({
      where: {
        OR: [
          { texto: { contains: 'precatório' } },
          { texto: { contains: 'precatorio' } },
          { texto: { contains: 'RPV' } },
          { texto: { contains: 'alvará' } },
          { texto: { contains: 'requisição de pequeno valor' } },
        ],
      },
      include: {
        processo: {
          select: {
            numeroProcesso: true,
            numeroFormatado: true,
            siglaTribunal: true,
            orgaoJulgador: true,
            partesJson: true,
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });

    const itens = publicacoes.map((pub) => {
      const t = pub.texto.toLowerCase();
      const tipo = t.includes('precatório') || t.includes('precatorio')
        ? 'PRECATORIO'
        : t.includes('rpv') || t.includes('pequeno valor')
        ? 'RPV'
        : 'ALVARA';

      const natureza =
        t.includes('alimentar') ||
        t.includes('salário') ||
        t.includes('previdenci') ||
        pub.processo.siglaTribunal.startsWith('TRT')
          ? 'ALIMENTAR'
          : 'COMUM';

      const enteDevedor =
        t.includes('união') || pub.processo.siglaTribunal.startsWith('TRF')
          ? 'FEDERAL (UNIÃO / INSS / AUTARQUIAS)'
          : t.includes('estado') || t.includes('fazenda pública estadual')
          ? 'ESTADUAL'
          : t.includes('município') || t.includes('prefeitura')
          ? 'MUNICIPAL'
          : 'PRIVADO / OUTRO';

      return {
        cnjId: pub.cnjId,
        numeroProcesso: pub.processo.numeroProcesso,
        numeroFormatado: pub.processo.numeroFormatado,
        tribunal: pub.processo.siglaTribunal,
        orgaoJulgador: pub.processo.orgaoJulgador,
        dataDisponibilizacao: pub.dataDisponibilizacao,
        tipo,
        natureza,
        enteDevedor,
        valorDetectado: pub.valorDetectado || null,
        riscoGolpeAlvara: true,
        resumoTexto: pub.texto.slice(0, 320),
      };
    });

    return NextResponse.json({
      sucesso: true,
      total: itens.length,
      precatoriosERpvs: itens,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao listar precatórios e RPVs';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
