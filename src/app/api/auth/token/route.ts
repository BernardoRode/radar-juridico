import { NextRequest, NextResponse } from 'next/server';
import { assinarJwt, extrairUsuarioJwt, PerfilRbac } from '@/lib/auth-jwt';

const PERFIS_VALIDOS: PerfilRbac[] = [
  'ADMIN',
  'SOCIO',
  'CONTROLADORIA',
  'ADVOGADO',
  'ESTAGIARIO',
  'MOBILE_APP',
  'INTEGRACAO',
];

/**
 * POST /api/auth/token
 * Issue #9 + #30 + #31: Emite um token JWT HS256 com perfil RBAC para App Mobile,
 * equipes multi-perfil e integrações B2B.
 * Se API_ACCESS_KEY estiver definida no .env, exige o campo `accessKey` correspondente.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessKeyEnv = process.env.API_ACCESS_KEY?.trim();

    if (accessKeyEnv && body?.accessKey !== accessKeyEnv) {
      return NextResponse.json(
        { sucesso: false, erro: 'Chave de acesso (accessKey) inválida.' },
        { status: 401 }
      );
    }

    const email = String(body?.email || 'advogado@escritorio.com.br').trim();
    const nome = String(body?.nome || 'Advogado Radar Jurídico').trim();
    const organizacao = body?.organizacao
      ? String(body.organizacao).trim()
      : 'Escritório Principal';
    const perfilRaw = String(body?.perfil || 'ADVOGADO').toUpperCase() as PerfilRbac;
    const perfil: PerfilRbac = PERFIS_VALIDOS.includes(perfilRaw)
      ? perfilRaw
      : 'ADVOGADO';

    const token = assinarJwt({ sub: email, nome, perfil, organizacao });

    return NextResponse.json({
      sucesso: true,
      tokenType: 'Bearer',
      accessToken: token,
      perfil,
      organizacao,
      expiraEmSegundos: 60 * 60 * 24 * 7,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao gerar JWT';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}

/**
 * GET /api/auth/token
 * Valida o header `Authorization: Bearer <token>` e retorna os dados decodificados.
 */
export async function GET(request: NextRequest) {
  const usuario = extrairUsuarioJwt(request);
  if (!usuario) {
    return NextResponse.json(
      { sucesso: false, autenticado: false, erro: 'Token JWT ausente ou inválido.' },
      { status: 401 }
    );
  }
  return NextResponse.json({ sucesso: true, autenticado: true, usuario });
}
