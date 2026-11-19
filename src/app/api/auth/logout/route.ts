import { NextResponse } from 'next/server';
import { COOKIE_SESSAO_RADAR } from '@/lib/auth-jwt';

/**
 * POST /api/auth/logout
 * Issue #69: Encerra a sessão removendo o cookie HttpOnly.
 */
export async function POST() {
  const res = NextResponse.json({ sucesso: true, mensagem: 'Sessão encerrada.' });
  res.cookies.set(COOKIE_SESSAO_RADAR, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
