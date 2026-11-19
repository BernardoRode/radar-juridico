'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<'login' | 'register'>('login');
  const [totalUsuarios, setTotalUsuarios] = useState<number | null>(null);
  const [enforceAuth, setEnforceAuth] = useState(false);

  const [nome, setNome] = useState('');
  const [organizacao, setOrganizacao] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data?.sucesso) {
          setTotalUsuarios(data.totalUsuarios ?? 0);
          setEnforceAuth(Boolean(data.enforceAuth));
          if (data.totalUsuarios === 0) {
            setModo('register');
          }
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const endpoint = modo === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        modo === 'login'
          ? { email, senha }
          : { nome, email, senha, organizacao: organizacao || 'Meu Escritório' };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.sucesso) {
        setErro(data.erro || 'Não foi possível autenticar.');
        setCarregando(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setErro('Erro de conexão ao autenticar.');
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-3">
            ⚖️ Radar Jurídico • Issue #69
          </div>
          <h1 className="text-2xl font-bold text-white">
            {modo === 'login'
              ? 'Acessar Plataforma'
              : totalUsuarios === 0
              ? 'Criar Administrador Inicial'
              : 'Cadastrar Novo Usuário'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {enforceAuth
              ? 'Autenticação obrigatória ativa (ENFORCE_AUTH=true).'
              : 'Ambiente local em modo livre (ENFORCE_AUTH=false) — login opcional para testes.'}
          </p>
        </div>

        {erro && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
            ⚠ {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {modo === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Dr. Bernardo Rode"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Escritório / Organização
                </label>
                <input
                  type="text"
                  value={organizacao}
                  onChange={(e) => setOrganizacao(e.target.value)}
                  placeholder="Ex: Rode Advogados Associados"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="advogado@escritorio.com.br"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Senha (mín. 6 caracteres)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition cursor-pointer mt-2"
          >
            {carregando
              ? 'Processando...'
              : modo === 'login'
              ? 'Entrar no Radar Jurídico'
              : 'Criar Conta e Entrar'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setErro(null);
              setModo(modo === 'login' ? 'register' : 'login');
            }}
            className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            {modo === 'login' ? 'Criar nova conta' : 'Já tenho conta — Entrar'}
          </button>
          {!enforceAuth && (
            <Link href="/" className="text-slate-400 hover:text-slate-200">
              Voltar ao painel →
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
