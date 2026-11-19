import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  assinarJwt,
  COOKIE_SESSAO_RADAR,
  extrairUsuarioJwt,
  gerarHashSenha,
  type PerfilRbac,
} from '@/lib/auth-jwt';

const PERFIS_VALIDOS: PerfilRbac[] = [
  'ADMIN',
  'SOCIO',
  'CONTROLADORIA',
  'ADVOGADO',
  'ESTAGIARIO',
];

function gerarSlug(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'escritorio'
  );
}

/**
 * POST /api/auth/register
 * Issue #69: Cria a Organização inicial (se necessário) e o Usuário com senha scrypt + cookie HttpOnly.
 * O primeiro usuário do sistema é automaticamente ADMIN.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const nome = String(body?.nome || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const senha = String(body?.senha || '');
    const nomeOrganizacao = String(body?.organizacao || 'Meu Escritório').trim();
    const perfilSolicitado = String(body?.perfil || 'ADVOGADO').toUpperCase() as PerfilRbac;

    if (!nome || !email || !email.includes('@')) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe nome e e-mail válidos.' },
        { status: 400 }
      );
    }

    if (senha.length < 6) {
      return NextResponse.json(
        { sucesso: false, erro: 'A senha deve ter no mínimo 6 caracteres.' },
        { status: 400 }
      );
    }

    const totalUsuarios = await prisma.usuario.count();
    const ehPrimeiroUsuario = totalUsuarios === 0;

    // Quando ENFORCE_AUTH=true e já existe usuário, apenas ADMIN pode criar novas contas
    if (!ehPrimeiroUsuario && process.env.ENFORCE_AUTH === 'true') {
      const solicitante = extrairUsuarioJwt(request);
      if (!solicitante || solicitante.perfil !== 'ADMIN') {
        return NextResponse.json(
          { sucesso: false, erro: 'Apenas um administrador autenticado pode cadastrar novos usuários.' },
          { status: 403 }
        );
      }
    }

    const jaExiste = await prisma.usuario.findUnique({ where: { email } });
    if (jaExiste) {
      return NextResponse.json(
        { sucesso: false, erro: 'Já existe uma conta cadastrada com este e-mail.' },
        { status: 409 }
      );
    }

    const slugBase = gerarSlug(nomeOrganizacao);
    let org = await prisma.organizacao.findUnique({ where: { slug: slugBase } });
    if (!org) {
      org = await prisma.organizacao.create({
        data: {
          nome: nomeOrganizacao,
          slug: slugBase,
          cnpj: body?.cnpj ? String(body.cnpj).trim() : null,
        },
      });
    }

    const perfilFinal: PerfilRbac = ehPrimeiroUsuario
      ? 'ADMIN'
      : PERFIS_VALIDOS.includes(perfilSolicitado)
      ? perfilSolicitado
      : 'ADVOGADO';

    const usuario = await prisma.usuario.create({
      data: {
        nome,
        email,
        senhaHash: gerarHashSenha(senha),
        perfil: perfilFinal,
        organizacaoId: org.id,
        ultimoLoginEm: new Date(),
      },
      include: { organizacao: true },
    });

    const token = assinarJwt({
      sub: usuario.email,
      nome: usuario.nome,
      perfil: perfilFinal,
      organizacao: org.nome,
      organizacaoId: org.id,
    });

    const res = NextResponse.json({
      sucesso: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        organizacao: org.nome,
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
    const msg = error instanceof Error ? error.message : 'Erro ao cadastrar usuário';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
