'use client';

import React from 'react';

/**
 * Issue #75: Componente modular de Documentação da API REST do Radar Jurídico.
 */
export function PainelApiDocs() {
  return (
    <section className="bg-[#0f1628] border border-slate-800 rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-base font-bold text-white">
          Como consumir a sua própria API (Web, App Mobile, CRM ou n8n)
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Endpoints REST prontos para captura DJEN/CNJ, Datajud, extração de PDFs PJe/eproc,
          Pool Multi-IA, Portal do Cliente e Autenticação JWT/Cookie.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
            GET /api/publicacoes
          </span>
          <p className="text-xs text-slate-300">
            Busca publicações por OAB, Advogado, Nome do Cliente (ex: LG) ou Processo, analisa
            concorrência, extrai prazos/valores e retorna publicações + pastas consolidadas.
          </p>
          <pre className="text-xs font-mono text-indigo-300 bg-slate-900 p-3 rounded-lg overflow-x-auto">
{`// Monitorar cliente comparando com as OABs do seu escritório
GET /api/publicacoes?nomeParte=LG%20ELECTRONICS&nossasOabs=12345RS,99887SP

// Buscar por OAB ou por número CNJ específico
GET /api/publicacoes?numeroOab=12345&ufOab=RS
GET /api/publicacoes?numeroProcesso=50099269520204047201`}
          </pre>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold">
            POST /api/ia/analisar • POST /api/ia/minuta • POST /api/ia/chat-base
          </span>
          <p className="text-xs text-slate-300">
            Consomem automaticamente o Pool Multi-IA Gratuito com rotação em ciclo (Gemini, Groq,
            Cerebras, OpenRouter, Mistral, NVIDIA, Hugging Face, Cloudflare, Cohere, Ollama).
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-xs font-bold">
            POST /api/auth/register • POST /api/auth/login • GET /api/auth/me • POST /api/compartilhar
          </span>
          <p className="text-xs text-slate-300">
            Autenticação com senha scrypt + JWT HS256 (cookie HttpOnly ou Bearer) e geração de links
            temporários para Correspondentes (48h) e Portal do Cliente White-Label (com anonimização LGPD).
          </p>
        </div>
      </div>
    </section>
  );
}
