import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function converterBrParaIcsDate(dataBr: string): string | null {
  const m = dataBr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}${m[2]}${m[1]}`;
}

/**
 * GET /api/calendario/prazos.ics
 * Issue #11 + #43: Exporta prazos fatais no formato padrão iCalendar (.ics)
 * para importação ou assinatura ao vivo no Google Calendar, Apple Calendar e Outlook.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const numeroParam = searchParams.get('numeroProcesso');
    const prazoParam = searchParams.get('prazoFatal');
    const atoParam = searchParams.get('ato') || 'Prazo Processual';
    const tribunalParam = searchParams.get('tribunal') || 'Tribunal';

    const eventos: Array<{
      uid: string;
      dtStart: string;
      summary: string;
      description: string;
    }> = [];

    if (numeroParam && prazoParam) {
      const dt = converterBrParaIcsDate(prazoParam);
      if (dt) {
        eventos.push({
          uid: `prazo-${numeroParam.replace(/[^0-9]/g, '')}-${dt}@radarjuridico`,
          dtStart: dt,
          summary: `[PRAZO FATAL] ${tribunalParam} - Proc. ${numeroParam}`,
          description: `Ato: ${atoParam} | Prazo Fatal calculado pelo Radar Jurídico (${prazoParam}).`,
        });
      }
    } else {
      const processos = await prisma.processo.findMany({
        where: { prazoFatal: { not: null } },
        orderBy: { atualizadoEm: 'desc' },
        take: 100,
      });

      for (const p of processos) {
        if (!p.prazoFatal) continue;
        const dt = converterBrParaIcsDate(p.prazoFatal);
        if (!dt) continue;
        eventos.push({
          uid: `prazo-${p.numeroProcesso}-${dt}@radarjuridico`,
          dtStart: dt,
          summary: `[PRAZO FATAL] ${p.siglaTribunal} - ${p.numeroFormatado}`,
          description: `Fase: ${p.faseProcessual} | Status: ${p.ultimoStatusDetectado} | Órgão: ${p.orgaoJulgador}`,
        });
      }
    }

    const linhasIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Radar Juridico//Calendario Forense CNJ//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Radar Jurídico - Prazos Fatais',
    ];

    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    for (const ev of eventos) {
      linhasIcs.push(
        'BEGIN:VEVENT',
        `UID:${ev.uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;VALUE=DATE:${ev.dtStart}`,
        `SUMMARY:${ev.summary}`,
        `DESCRIPTION:${ev.description.replace(/\r?\n/g, ' ')}`,
        'END:VEVENT'
      );
    }

    linhasIcs.push('END:VCALENDAR');

    return new NextResponse(linhasIcs.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="prazos-radar-juridico.ics"',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar calendário .ics';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
