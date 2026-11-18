import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function anonimizarTextoLgpd(texto?: string | null): string | null {
  if (!texto) return null;
  return texto
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**')
    .replace(/\b\d{11}\b/g, '***********');
}

/**
 * GET /api/exportar/backup?lgpd=true|false
 * Issue #48 (Zero Vendor Lock-in) + Issue #62 (Anonimização 1-Clique LGPD).
 * Exporta toda a base do escritório em JSON portátil.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anonimizarLgpd = searchParams.get('lgpd') === 'true';

    const [clientes, advogados, processos, publicacoes, documentos, execucoes] =
      await Promise.all([
        prisma.clienteMonitorado.findMany(),
        prisma.advogadoEscritorio.findMany(),
        prisma.processo.findMany(),
        prisma.publicacao.findMany({ take: 500, orderBy: { criadoEm: 'desc' } }),
        prisma.documentoOriginal.findMany({ take: 200, orderBy: { criadoEm: 'desc' } }),
        prisma.execucaoRadar.findMany({ take: 50, orderBy: { iniciadoEm: 'desc' } }),
      ]);

    const payload = {
      sistema: 'Radar Jurídico — Backup Portátil (Zero Lock-in)',
      exportadoEm: new Date().toISOString(),
      anonimizadoLgpd: anonimizarLgpd,
      totais: {
        clientes: clientes.length,
        advogados: advogados.length,
        processos: processos.length,
        publicacoes: publicacoes.length,
        documentos: documentos.length,
      },
      dados: {
        clientes,
        advogados,
        processos: anonimizarLgpd
          ? processos.map((p) => ({
              ...p,
              partesJson: anonimizarTextoLgpd(p.partesJson),
            }))
          : processos,
        publicacoes: anonimizarLgpd
          ? publicacoes.map((pub) => ({
              ...pub,
              texto: anonimizarTextoLgpd(pub.texto) || '',
            }))
          : publicacoes,
        documentos: anonimizarLgpd
          ? documentos.map((d) => ({
              ...d,
              textoExtraido: anonimizarTextoLgpd(d.textoExtraido),
            }))
          : documentos,
        execucoes,
      },
    };

    const sufixo = anonimizarLgpd ? '-lgpd-anonimizado' : '-completo';
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup-radar-juridico${sufixo}.json"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar backup';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
