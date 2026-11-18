import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function escaparCsv(val: unknown): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

/**
 * GET /api/exportar/csv
 * Issue #43 + #48: Exporta toda a carteira de processos persistidos em formato CSV
 * compatível com Excel e com a fórmula `=IMPORTDATA(".../api/exportar/csv")` do Google Sheets.
 */
export async function GET() {
  try {
    const processos = await prisma.processo.findMany({
      include: {
        _count: { select: { publicacoes: true, documentos: true } },
      },
      orderBy: { atualizadoEm: 'desc' },
    });

    const cabecalho = [
      'Numero_CNJ',
      'Tribunal',
      'Orgao_Julgador',
      'Classe_Processual',
      'Fase_Processual',
      'Ultimo_Ato',
      'Prazo_Fatal',
      'Urgencia',
      'Status_Concorrencia',
      'Total_Publicacoes',
      'Total_Documentos_Extraidos',
      'Ultima_Disponibilizacao',
    ].join(',');

    const linhas = processos.map((p) =>
      [
        escaparCsv(p.numeroFormatado),
        escaparCsv(p.siglaTribunal),
        escaparCsv(p.orgaoJulgador),
        escaparCsv(p.classeProcessual),
        escaparCsv(p.faseProcessual),
        escaparCsv(p.ultimoStatusDetectado),
        escaparCsv(p.prazoFatal || ''),
        escaparCsv(p.urgenciaMaxima),
        escaparCsv(p.statusConcorrencia),
        escaparCsv(p._count.publicacoes),
        escaparCsv(p._count.documentos),
        escaparCsv(p.ultimaAtualizacao),
      ].join(',')
    );

    const csv = '\uFEFF' + [cabecalho, ...linhas].join('\r\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="radar-juridico-processos.csv"',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao exportar CSV';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
