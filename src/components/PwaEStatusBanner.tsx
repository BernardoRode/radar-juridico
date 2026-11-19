'use client';

import React, { useEffect, useState } from 'react';

interface StatusAmbiente {
  banco: {
    conectado: boolean;
    tipo: string;
    totais: {
      clientesAtivos: number;
      advogadosAtivos: number;
      processos: number;
      webhooksAtivos: number;
    };
  };
  ia: {
    provedorAtivo: 'GEMINI' | 'OPENAI' | 'HEURISTICA_LOCAL';
  };
  prontoParaUsoLocal: boolean;
  pendencias: string[];
}

/**
 * Issue #35 (Registro do Service Worker PWA) + Issue #67 (Diagnóstico Transparente do Ambiente).
 */
export function PwaEStatusBanner() {
  const [status, setStatus] = useState<StatusAmbiente | null>(null);
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    fetch('/api/config/status')
      .then((r) => r.json())
      .then((data) => {
        if (data?.sucesso) setStatus(data);
      })
      .catch(() => {});
  }, []);

  if (!status || oculto) return null;

  return (
    <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2 text-xs text-slate-300">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
              status.banco.conectado
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            }`}
          >
            {status.banco.conectado ? '● Banco OK' : '● Banco Offline'} ({status.banco.tipo})
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            OABs: <strong>{status.banco.totais.advogadosAtivos}</strong> • Clientes:{' '}
            <strong>{status.banco.totais.clientesAtivos}</strong> • Processos:{' '}
            <strong>{status.banco.totais.processos}</strong>
          </span>
          <span
            className={`px-2 py-0.5 rounded-full font-semibold ${
              status.ia.provedorAtivo === 'HEURISTICA_LOCAL'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
            }`}
          >
            IA: {status.ia.provedorAtivo}
          </span>
          <span className="hidden lg:inline text-slate-500">
            Atalhos (#49): <kbd className="px-1 bg-slate-800 rounded text-slate-300">J</kbd>/
            <kbd className="px-1 bg-slate-800 rounded text-slate-300">K</kbd> navegar •{' '}
            <kbd className="px-1 bg-slate-800 rounded text-slate-300">E</kbd> extrair PDF •{' '}
            <kbd className="px-1 bg-slate-800 rounded text-slate-300">C</kbd> baixar prazo
          </span>
        </div>

        <div className="flex items-center gap-3">
          {status.pendencias.length > 0 && (
            <span className="text-amber-300/90 truncate max-w-md" title={status.pendencias.join('\n')}>
              ⚠ {status.pendencias[0]}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOculto(true)}
            className="text-slate-500 hover:text-slate-300 cursor-pointer"
            aria-label="Fechar barra de diagnóstico"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
