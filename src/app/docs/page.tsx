'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface OpenApiOp {
  tags?: string[];
  summary?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    description?: string;
  }>;
}

interface OpenApiDoc {
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, OpenApiOp>>;
}

/**
 * Issue #80: Página interativa de documentação OpenAPI / Swagger Explorer (/docs).
 */
export default function ApiDocsInteractivePage() {
  const [spec, setSpec] = useState<OpenApiDoc | null>(null);
  const [filtroTag, setFiltroTag] = useState<string>('TODAS');
  const [testandoRota, setTestandoRota] = useState<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/openapi.json')
      .then((r) => r.json())
      .then((data) => setSpec(data))
      .catch(() => {});
  }, []);

  const rotasFlat = spec
    ? Object.entries(spec.paths).flatMap(([caminho, metodos]) =>
        Object.entries(metodos).map(([metodo, op]) => ({
          id: `${metodo.toUpperCase()} ${caminho}`,
          metodo: metodo.toUpperCase(),
          caminho,
          tag: op.tags?.[0] || 'Geral',
          summary: op.summary || '',
          parameters: op.parameters || [],
        }))
      )
    : [];

  const tags = ['TODAS', ...Array.from(new Set(rotasFlat.map((r) => r.tag)))];
  const filtradas =
    filtroTag === 'TODAS' ? rotasFlat : rotasFlat.filter((r) => r.tag === filtroTag);

  async function testarEndpointGet(caminho: string, id: string) {
    setTestandoRota(id);
    try {
      const res = await fetch(caminho);
      const texto = await res.text();
      setResultadoTeste((prev) => ({
        ...prev,
        [id]: `HTTP ${res.status}\n${texto.slice(0, 1200)}`,
      }));
    } catch (err: unknown) {
      setResultadoTeste((prev) => ({
        ...prev,
        [id]: `Erro: ${err instanceof Error ? err.message : 'Falha de rede'}`,
      }));
    } finally {
      setTestandoRota(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-2">
              OpenAPI 3.1 • Issue #80
            </span>
            <h1 className="text-2xl font-bold text-white">
              {spec?.info.title || 'Radar Jurídico — API Docs'}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              {spec?.info.description || 'Carregando especificação OpenAPI...'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <a
              href="/api/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-indigo-300 font-mono"
            >
              /api/openapi.json
            </a>
            <Link
              href="/"
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              ← Painel
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setFiltroTag(tag)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
                filtroTag === tag
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtradas.map((r) => (
            <div
              key={r.id}
              className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                      r.metodo === 'GET'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : r.metodo === 'POST'
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : r.metodo === 'PATCH'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {r.metodo}
                  </span>
                  <code className="text-sm font-mono text-white font-semibold">{r.caminho}</code>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {r.tag}
                  </span>
                </div>

                {r.metodo === 'GET' && !r.parameters.some((p) => p.required) && (
                  <button
                    type="button"
                    disabled={testandoRota === r.id}
                    onClick={() => testarEndpointGet(r.caminho, r.id)}
                    className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold cursor-pointer"
                  >
                    {testandoRota === r.id ? 'Testando...' : '▶ Testar GET'}
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-300">{r.summary}</p>

              {r.parameters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {r.parameters.map((p) => (
                    <span
                      key={p.name}
                      className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300"
                      title={p.description}
                    >
                      ?{p.name}
                      {p.required ? '*' : ''}
                    </span>
                  ))}
                </div>
              )}

              {resultadoTeste[r.id] && (
                <pre className="text-[11px] font-mono text-emerald-300 bg-slate-950 border border-slate-800 p-3 rounded-lg overflow-x-auto max-h-60">
                  {resultadoTeste[r.id]}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
