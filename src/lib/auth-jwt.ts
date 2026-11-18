import crypto from 'crypto';
import { NextRequest } from 'next/server';

const JWT_SECRET =
  process.env.JWT_SECRET || 'radar-juridico-dev-secret-alterar-em-producao';

export interface JwtPayload {
  sub: string;
  nome: string;
  perfil: 'ADVOGADO' | 'MOBILE_APP' | 'INTEGRACAO';
  iat: number;
  exp: number;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function assinarJwt(
  dados: Omit<JwtPayload, 'iat' | 'exp'>,
  expiraEmSegundos = 60 * 60 * 24 * 7
): string {
  const agora = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      ...dados,
      iat: agora,
      exp: agora + expiraEmSegundos,
    })
  );

  const assinatura = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest();

  return `${header}.${payload}.${base64UrlEncode(assinatura)}`;
}

export function verificarJwt(token: string): JwtPayload | null {
  try {
    const partes = token.split('.');
    if (partes.length !== 3) return null;

    const [header, payload, assinaturaRecebida] = partes;
    const assinaturaEsperada = base64UrlEncode(
      crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest()
    );

    const a = Buffer.from(assinaturaRecebida);
    const b = Buffer.from(assinaturaEsperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const decoded = JSON.parse(base64UrlDecode(payload)) as JwtPayload;
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function extrairUsuarioJwt(request: NextRequest): JwtPayload | null {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verificarJwt(auth.slice(7).trim());
}
