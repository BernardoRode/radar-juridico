import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executarVarreduraRadar } from '@/lib/radar-worker';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * GET /api/cron/radar
 * - Se ?historico=true: retorna as últimas 10 execuções do worker agendado.
 * - Caso contrário: executa a varredura automática (usado por Vercel Cron / Agendador).
 *   Se CRON_SECRET estiver definido no .env, exige header `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get('historico') === 'true') {
      const execucoes = await prisma.execucaoRadar.findMany({
        orderBy: { iniciadoEm: 'desc' },
        take: 10,
      });
      return NextResponse.json({ sucesso: true, execucoes });
    }

    const cronSecret = process.env.CRON_SECRET?.trim();
    if (cronSecret) {
      const auth = request.headers.get('authorization');
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { sucesso: false, erro: 'Não autorizado para disparar o Cron.' },
          { status: 401 }
        );
      }
    }

    const dias = Number(searchParams.get('dias') || '3');
    const resultado = await executarVarreduraRadar('CRON', isNaN(dias) ? 3 : dias);

    return NextResponse.json({ sucesso: true, resultado });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro no worker do Radar';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * POST /api/cron/radar
 * Disparo manual da varredura completa de Clientes Monitorados + OABs do Escritório.
 */
export async function POST(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request, ['ADMIN', 'SOCIO', 'CONTROLADORIA', 'ADVOGADO']);
    if (!acesso.autorizado && acesso.respostaErro) {
      return acesso.respostaErro;
    }

    const body = await request.json().catch(() => ({}));
    const dias = Number(body?.diasRetroativos || 3);
    const resultado = await executarVarreduraRadar('MANUAL', isNaN(dias) ? 3 : dias);
    return NextResponse.json({ sucesso: true, resultado });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao executar varredura';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
