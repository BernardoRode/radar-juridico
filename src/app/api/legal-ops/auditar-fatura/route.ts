import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { consultarDatajudProcesso } from '@/lib/datajud';
import { verificarAcessoApi } from '@/lib/auth-jwt';

/**
 * POST /api/legal-ops/auditar-fatura
 * Issue #96: Conferência automática de faturas de escritórios terceirizados (E-Billing Legal Ops).
 * Recebe uma lista de CNJs cobrados na fatura mensal e cruza com o banco + Datajud para apontar
 * processos já transitados em julgado, arquivados definitivamente ou sem movimentação recente.
 */
export async function POST(request: NextRequest) {
  try {
    const acesso = verificarAcessoApi(request);
    if (!acesso.autorizado && acesso.respostaErro) return acesso.respostaErro;

    const body = await request.json();
    const itensRaw: unknown[] = Array.isArray(body?.processos) ? body.processos : [];
    const diasSemMovimentoAlerta = Math.max(30, Number(body?.diasSemMovimentoAlerta || 180));

    if (itensRaw.length === 0) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: 'Envie "processos": array de números CNJ (ou objetos { numeroProcesso, valorCobrado }).',
        },
        { status: 400 }
      );
    }

    const auditoria: Array<{
      numeroProcesso: string;
      statusAuditoria: 'REGULAR' | 'GLOSA_ARQUIVADO_TRANSITADO' | 'ALERTA_SEM_MOVIMENTACAO' | 'NAO_LOCALIZADO';
      arquivadoDefinitivo: boolean;
      ultimaMovimentacao?: string;
      diasSemMovimento?: number;
      valorCobrado?: number;
      motivo: string;
    }> = [];

    let totalGlosaSugeridaRS = 0;

    for (const raw of itensRaw.slice(0, 100)) {
      const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
      const numStr = String(obj?.numeroProcesso ?? raw ?? '').trim();
      const valorCobrado = obj?.valorCobrado ? Number(obj.valorCobrado) : undefined;
      const numLimpo = numStr.replace(/[^0-9]/g, '');
      if (numLimpo.length < 10) continue;

      const procLocal = await prisma.processo.findUnique({
        where: { numeroProcesso: numLimpo },
      });
      const dj = await consultarDatajudProcesso(numLimpo, procLocal?.siglaTribunal);

      const arquivado =
        Boolean(dj.resumoTpu?.arquivadoDefinitivo) ||
        (procLocal?.ultimoStatusDetectado || '').toLowerCase().includes('trânsito em julgado') ||
        (procLocal?.ultimoStatusDetectado || '').toLowerCase().includes('arquivamento');

      const ultimaDataStr =
        dj.movimentos?.[0]?.dataHora || dj.dataHoraUltimaAtualizacao || procLocal?.ultimaAtualizacao;
      let diasSemMov: number | undefined;
      if (ultimaDataStr) {
        const dt = new Date(ultimaDataStr);
        if (!isNaN(dt.getTime())) {
          diasSemMov = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000));
        }
      }

      if (arquivado) {
        if (valorCobrado && !isNaN(valorCobrado)) totalGlosaSugeridaRS += valorCobrado;
        auditoria.push({
          numeroProcesso: procLocal?.numeroFormatado || numStr,
          statusAuditoria: 'GLOSA_ARQUIVADO_TRANSITADO',
          arquivadoDefinitivo: true,
          ultimaMovimentacao: dj.movimentos?.[0]?.nome || procLocal?.ultimoStatusDetectado,
          diasSemMovimento: diasSemMov,
          valorCobrado,
          motivo: 'Processo com Trânsito em Julgado ou Arquivamento Definitivo — passível de glosa na fatura.',
        });
      } else if (!dj.encontrado && !procLocal) {
        auditoria.push({
          numeroProcesso: numStr,
          statusAuditoria: 'NAO_LOCALIZADO',
          arquivadoDefinitivo: false,
          valorCobrado,
          motivo: 'Processo não localizado na base local nem no Datajud (verificar sigilo ou numeração).',
        });
      } else if (typeof diasSemMov === 'number' && diasSemMov >= diasSemMovimentoAlerta) {
        auditoria.push({
          numeroProcesso: procLocal?.numeroFormatado || numStr,
          statusAuditoria: 'ALERTA_SEM_MOVIMENTACAO',
          arquivadoDefinitivo: false,
          ultimaMovimentacao: dj.movimentos?.[0]?.nome || procLocal?.ultimoStatusDetectado,
          diasSemMovimento: diasSemMov,
          valorCobrado,
          motivo: `Sem movimentação há ${diasSemMov} dias (acima do limite de ${diasSemMovimentoAlerta} dias).`,
        });
      } else {
        auditoria.push({
          numeroProcesso: procLocal?.numeroFormatado || numStr,
          statusAuditoria: 'REGULAR',
          arquivadoDefinitivo: false,
          ultimaMovimentacao: dj.movimentos?.[0]?.nome || procLocal?.ultimoStatusDetectado,
          diasSemMovimento: diasSemMov,
          valorCobrado,
          motivo: 'Processo ativo com tramitação regular.',
        });
      }
    }

    return NextResponse.json({
      sucesso: true,
      totalAuditados: auditoria.length,
      resumo: {
        regulares: auditoria.filter((a) => a.statusAuditoria === 'REGULAR').length,
        glosaArquivados: auditoria.filter((a) => a.statusAuditoria === 'GLOSA_ARQUIVADO_TRANSITADO').length,
        alertaSemMovimentacao: auditoria.filter((a) => a.statusAuditoria === 'ALERTA_SEM_MOVIMENTACAO').length,
        naoLocalizados: auditoria.filter((a) => a.statusAuditoria === 'NAO_LOCALIZADO').length,
        totalGlosaSugeridaRS,
      },
      auditoria,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao auditar fatura';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
