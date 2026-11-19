import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  assinarJwt,
  COOKIE_SESSAO_RADAR,
  verificarSenha,
  type PerfilRbac,
} from '@/lib/auth-jwt';

/**
 * POST /api/auth/login
 * Issue #69: Autentica usuário por e-mail/senha e grava cookie HttpOnly `radar_session`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const senha = String(body?.senha || '');

    if (!email || !senha) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe e-mail e senha.' },
        { status: 400 }
      );
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { organizacao: true },
    });

    if (!usuario || !usuario.ativo || !verificarSenha(senha, usuario.senhaHash)) {
      return NextResponse.json(
        { sucesso: false, erro: 'E-mail ou senha inválidos.' },
        { status: 401 }
      );
    }

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLoginEm: new Date() },
    });

    const token = assinarJwt({
      sub: usuario.email,
      nome: usuario.nome,
      perfil: usuario.perfil as PerfilRbac,
      organizacao: usuario.organizacao?.nome || 'Escritório',
    });

    const res = NextResponse.json({
      sucesso: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        organizacao: usuario.organizacao?.nome || 'Escritório',
      },
      token,
    });

    res.cookies.set(COOKIE_SESSAO_RADAR, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao autenticar';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
