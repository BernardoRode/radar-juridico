import { NextRequest, NextResponse } from 'next/server';

const COOKIE_SESSAO = 'radar_session';

const ROTAS_PUBLICAS_PREFIXOS = [
  '/login',
  '/compartilhado',
  '/api/auth/',
  '/api/compartilhar',
  '/api/config/status',
  '/api/saude-tribunais',
  '/api/cron/',
  '/api/digest',
  '/_next/',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
];

function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS_PREFIXOS.some((prefixo) => pathname.startsWith(prefixo));
}

function base64UrlParaBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verificarJwtEdge(token: string, segredo: string): Promise<boolean> {
  try {
    const partes = token.split('.');
    if (partes.length !== 3) return false;
    const [header, payload, assinaturaB64] = partes;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(segredo),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64UrlParaBytes(assinaturaB64);
    const sigBuffer = sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength
    ) as ArrayBuffer;
    const valido = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBuffer,
      enc.encode(`${header}.${payload}`)
    );
    if (!valido) return false;

    const decoded = JSON.parse(new TextDecoder().decode(base64UrlParaBytes(payload))) as {
      exp?: number;
    };
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Issue #69: Middleware de autenticação compatível com Edge Runtime.
 * - Com `ENFORCE_AUTH !== "true"` (padrão local): não bloqueia nada para agilizar testes.
 * - Com `ENFORCE_AUTH === "true"` (produção): exige cookie HttpOnly `radar_session`,
 *   `Authorization: Bearer <JWT>` ou `X-API-Key` válida.
 */
export async function middleware(request: NextRequest) {
  if (process.env.ENFORCE_AUTH !== 'true') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (ehRotaPublica(pathname)) {
    return NextResponse.next();
  }

  const apiKeyHeader = request.headers.get('x-api-key')?.trim();
  const apiAccessKey = process.env.API_ACCESS_KEY?.trim();
  if (apiAccessKey && apiKeyHeader && apiKeyHeader === apiAccessKey) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const cookieToken = request.cookies.get(COOKIE_SESSAO)?.value?.trim() || null;
  const token = bearerToken || cookieToken;

  const segredo =
    process.env.JWT_SECRET || 'radar-juridico-dev-secret-alterar-em-producao';

  if (token && (await verificarJwtEdge(token, segredo))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: 'Autenticação obrigatória. Faça login em /login ou envie Authorization: Bearer <JWT>.',
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
