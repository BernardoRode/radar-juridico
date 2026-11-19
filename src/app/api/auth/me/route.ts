import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extrairUsuarioJwt } from '@/lib/auth-jwt';

/**
 * GET /api/auth/me
 * Issue #69: Retorna dados da sessão atual (cookie HttpOnly ou Bearer JWT) + status de setup inicial.
 */
export async function GET(request: NextRequest) {
  const usuario = extrairUsuarioJwt(request);
  const totalUsuarios = await prisma.usuario.count().catch(() => 0);

  return NextResponse.json({
    sucesso: true,
    autenticado: Boolean(usuario),
    enforceAuth: process.env.ENFORCE_AUTH === 'true',
    totalUsuarios,
    usuario: usuario
      ? {
          email: usuario.sub,
          nome: usuario.nome,
          perfil: usuario.perfil,
          organizacao: usuario.organizacao || 'Escritório',
        }
      : null,
  });
}
