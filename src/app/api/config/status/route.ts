import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/config/status
 * Issue #67: Retorna um diagnóstico transparente do ambiente atual (sem expor segredos),
 * informando o que está configurado de verdade vs. rodando em fallback/heurística.
 */
export async function GET() {
  let bancoConectado = false;
  let totalClientes = 0;
  let totalAdvogados = 0;
  let totalProcessos = 0;
  let totalPublicacoes = 0;
  let totalWebhooks = 0;

  try {
    [
      totalClientes,
      totalAdvogados,
      totalProcessos,
      totalPublicacoes,
      totalWebhooks,
    ] = await Promise.all([
      prisma.clienteMonitorado.count({ where: { ativo: true } }),
      prisma.advogadoEscritorio.count({ where: { ativo: true } }),
      prisma.processo.count(),
      prisma.publicacao.count(),
      prisma.webhookAlerta.count({ where: { ativo: true } }),
    ]);
    bancoConectado = true;
  } catch {
    bancoConectado = false;
  }

  const dbUrl = process.env.DATABASE_URL || '';
  const tipoBanco = dbUrl.startsWith('postgres') ? 'POSTGRESQL' : 'SQLITE_LOCAL';

  const temGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const temOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
  const provedorIA = temGemini
    ? 'GEMINI'
    : temOpenAI
    ? 'OPENAI'
    : 'HEURISTICA_LOCAL';

  const temJwtSecret = Boolean(process.env.JWT_SECRET?.trim());
  const temCronSecret = Boolean(process.env.CRON_SECRET?.trim());
  const temWebhookSecret = Boolean(process.env.WEBHOOK_HMAC_SECRET?.trim());
  const temApiAccessKey = Boolean(process.env.API_ACCESS_KEY?.trim());
  const temResend = Boolean(process.env.RESEND_API_KEY?.trim());

  const pendencias: string[] = [];
  if (!bancoConectado) {
    pendencias.push('Banco de dados indisponível — verifique DATABASE_URL e execute npx prisma db push.');
  }
  if (totalAdvogados === 0) {
    pendencias.push('Nenhuma OAB do escritório cadastrada — cadastre para classificar Nosso Escritório vs. Concorrência.');
  }
  if (totalClientes === 0) {
    pendencias.push('Nenhum cliente monitorado cadastrado — adicione ao menos 1 empresa para o Radar 24/7.');
  }
  if (provedorIA === 'HEURISTICA_LOCAL') {
    pendencias.push('IA rodando em modo heurístico local — defina GEMINI_API_KEY ou OPENAI_API_KEY no .env para ativar LLM real.');
  }
  if (totalWebhooks === 0 && !temResend) {
    pendencias.push('Nenhum canal de alerta ativo (Webhook/Slack/WhatsApp/E-mail) cadastrado.');
  }
  if (tipoBanco === 'SQLITE_LOCAL') {
    pendencias.push('Usando SQLite local (ideal para seu PC; para deploy na Vercel, migre DATABASE_URL para PostgreSQL).');
  }

  return NextResponse.json({
    sucesso: true,
    verificadoEm: new Date().toISOString(),
    ambiente: process.env.NODE_ENV || 'development',
    banco: {
      conectado: bancoConectado,
      tipo: tipoBanco,
      totais: {
        clientesAtivos: totalClientes,
        advogadosAtivos: totalAdvogados,
        processos: totalProcessos,
        publicacoes: totalPublicacoes,
        webhooksAtivos: totalWebhooks,
      },
    },
    ia: {
      provedorAtivo: provedorIA,
      geminiConfigurado: temGemini,
      openaiConfigurado: temOpenAI,
    },
    integracoes: {
      datajudUsandoChavePropria: Boolean(process.env.DATAJUD_API_KEY?.trim()),
      emailResendConfigurado: temResend,
      webhooksAtivos: totalWebhooks,
    },
    seguranca: {
      jwtSecretCustomizado: temJwtSecret,
      cronSecretConfigurado: temCronSecret,
      webhookHmacCustomizado: temWebhookSecret,
      apiAccessKeyConfigurada: temApiAccessKey,
      enforceAuth: process.env.ENFORCE_AUTH === 'true',
    },
    prontoParaUsoLocal: bancoConectado && totalAdvogados > 0 && totalClientes > 0,
    pendencias,
  });
}
