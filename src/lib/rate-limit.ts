import { NextRequest, NextResponse } from 'next/server';

interface JanelaRateLimit {
  contagem: number;
  resetaEm: number;
}

const janelas = new Map<string, JanelaRateLimit>();

/**
 * Issue #31: Rate Limiting sliding-window por IP ou X-API-Key para o API Gateway B2B.
 */
export function verificarRateLimit(
  request: NextRequest,
  chaveRota: string,
  limitePorMinuto = 60
): { permitido: boolean; restante: number; resposta429?: NextResponse } {
  const apiKey = request.headers.get('x-api-key')?.trim();
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local';
  const identificador = `${chaveRota}:${apiKey ? `key:${apiKey.slice(0, 8)}` : `ip:${ip}`}`;

  const agora = Date.now();
  const janelaAtual = janelas.get(identificador);

  if (!janelaAtual || janelaAtual.resetaEm <= agora) {
    janelas.set(identificador, {
      contagem: 1,
      resetaEm: agora + 60_000,
    });
    return { permitido: true, restante: limitePorMinuto - 1 };
  }

  if (janelaAtual.contagem >= limitePorMinuto) {
    const retryAfterSeg = Math.max(1, Math.ceil((janelaAtual.resetaEm - agora) / 1000));
    return {
      permitido: false,
      restante: 0,
      resposta429: NextResponse.json(
        {
          sucesso: false,
          erro: `Limite de ${limitePorMinuto} requisições/minuto atingido. Tente novamente em ${retryAfterSeg}s.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeg),
            'X-RateLimit-Limit': String(limitePorMinuto),
            'X-RateLimit-Remaining': '0',
          },
        }
      ),
    };
  }

  janelaAtual.contagem += 1;
  return { permitido: true, restante: Math.max(0, limitePorMinuto - janelaAtual.contagem) };
}
