import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extrairUsuarioJwt } from '@/lib/auth-jwt';

export interface EscopoTenant {
  organizacaoId: string | null;
  origem: 'JWT' | 'API_KEY_CLIENTE' | 'API_KEY_MESTRA' | 'LOCAL_LIVRE';
  plano?: string;
  filtroPrisma: { organizacaoId?: string };
  erroQuota?: NextResponse;
}

export function gerarHashApiKey(chaveBruta: string): string {
  return crypto.createHash('sha256').update(chaveBruta.trim(), 'utf8').digest('hex');
}

export function gerarNovaApiKeyBruta(): { chaveBruta: string; prefixo: string; chaveHash: string } {
  const random = crypto.randomBytes(24).toString('hex');
  const chaveBruta = `rk_live_${random}`;
  const prefixo = chaveBruta.slice(0, 16);
  const chaveHash = gerarHashApiKey(chaveBruta);
  return { chaveBruta, prefixo, chaveHash };
}

function obterMesAtual(): string {
  const d = new Date();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mes}`;
}

/**
 * Issue #79 + #80: Resolve o tenant (`organizacaoId`) da requisição via JWT (cookie/Bearer)
 * ou via `X-API-Key` de cliente B2B (`ApiKeyCliente`), contabilizando o consumo mensal.
 *
 * - Quando autenticado com `organizacaoId`: retorna `filtroPrisma: { organizacaoId }`,
 *   isolando completamente os dados entre escritórios/clientes.
 * - Em modo local sem login (`ENFORCE_AUTH !== 'true'`): retorna `filtroPrisma: {}`
 *   para manter zero atrito nos testes locais.
 */
export async function resolverEscopoOrganizacao(
  request: NextRequest
): Promise<EscopoTenant> {
  // 1) Tenta JWT (Bearer ou Cookie HttpOnly)
  const usuario = extrairUsuarioJwt(request);
  if (usuario) {
    const orgId = usuario.organizacaoId || null;
    return {
      organizacaoId: orgId,
      origem: 'JWT',
      filtroPrisma: orgId ? { organizacaoId: orgId } : {},
    };
  }

  // 2) Tenta X-API-Key (chave B2B por cliente na tabela ApiKeyCliente)
  const apiKeyHeader = request.headers.get('x-api-key')?.trim();
  if (apiKeyHeader) {
    const apiKeyMestra = process.env.API_ACCESS_KEY?.trim();
    if (apiKeyMestra && apiKeyHeader === apiKeyMestra) {
      return {
        organizacaoId: null,
        origem: 'API_KEY_MESTRA',
        plano: 'ENTERPRISE',
        filtroPrisma: {},
      };
    }

    try {
      const chaveHash = gerarHashApiKey(apiKeyHeader);
      const registro = await prisma.apiKeyCliente.findUnique({
        where: { chaveHash },
      });

      if (registro && registro.ativa) {
        const mesAtual = obterMesAtual();
        const usoAtual = registro.mesReferencia === mesAtual ? registro.usoMesAtual : 0;

        if (usoAtual >= registro.limiteMensal) {
          return {
            organizacaoId: registro.organizacaoId,
            origem: 'API_KEY_CLIENTE',
            plano: registro.plano,
            filtroPrisma: registro.organizacaoId
              ? { organizacaoId: registro.organizacaoId }
              : {},
            erroQuota: NextResponse.json(
              {
                sucesso: false,
                erro: `Limite mensal da API Key atingido (${registro.limiteMensal} req/mês no plano ${registro.plano}).`,
              },
              { status: 429 }
            ),
          };
        }

        // Contabiliza uso mensal em background
        prisma.apiKeyCliente
          .update({
            where: { id: registro.id },
            data: {
              mesReferencia: mesAtual,
              usoMesAtual: usoAtual + 1,
              ultimoUsoEm: new Date(),
            },
          })
          .catch(() => {});

        return {
          organizacaoId: registro.organizacaoId,
          origem: 'API_KEY_CLIENTE',
          plano: registro.plano,
          filtroPrisma: registro.organizacaoId
            ? { organizacaoId: registro.organizacaoId }
            : {},
        };
      }
    } catch {
      // Silencioso se banco ainda não sincronizado
    }
  }

  return {
    organizacaoId: null,
    origem: 'LOCAL_LIVRE',
    filtroPrisma: {},
  };
}
