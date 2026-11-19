'use client';

import React, { useEffect, useState } from 'react';
import { Brain, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';

interface ApiKeyItem {
  id: string;
  nome: string;
  prefixo: string;
  plano: string;
  limiteMensal: number;
  usoMesAtual: number;
  mesReferencia: string;
  ativa: boolean;
}

interface PerfilVaraItem {
  id: string;
  siglaTribunal: string;
  orgaoJulgador: string;
  totalAnalises: number;
  totalBloqueios: number;
  totalLiminares: number;
  sumulasTemas: string[];
}

/**
 * Issues #78 & #80: Gestão visual de API Keys B2B (rk_live_...) + Memória Coletiva Anonimizada LGPD.
 */
export function PainelB2BeMemoriaColetiva() {
  // API Keys B2B (#80)
  const [chaves, setChaves] = useState<ApiKeyItem[]>([]);
  const [nomeChave, setNomeChave] = useState('');
  const [planoChave, setPlanoChave] = useState('FREE');
  const [criandoChave, setCriandoChave] = useState(false);
  const [chaveRecemCriada, setChaveRecemCriada] = useState<string | null>(null);

  // Memória Coletiva LGPD (#78)
  const [perfisVara, setPerfisVara] = useState<PerfilVaraItem[]>([]);
  const [totalModelosMinuta, setTotalModelosMinuta] = useState(0);
  const [carregando, setCarregando] = useState(false);

  async function carregarDados() {
    setCarregando(true);
    try {
      const [resKeys, resMem] = await Promise.all([
        fetch('/api/api-keys').then((r) => r.json()).catch(() => null),
        fetch('/api/ia/memoria-coletiva').then((r) => r.json()).catch(() => null),
      ]);
      if (resKeys?.sucesso && Array.isArray(resKeys.chaves)) {
        setChaves(resKeys.chaves);
      }
      if (resMem?.sucesso) {
        setPerfisVara(Array.isArray(resMem.perfisVara) ? resMem.perfisVara : []);
        setTotalModelosMinuta(resMem.totalModelosMinuta ?? 0);
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  async function criarApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeChave.trim()) return;
    setCriandoChave(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeChave.trim(), plano: planoChave }),
      });
      const data = await res.json();
      if (data?.sucesso && data.apiKey) {
        setChaveRecemCriada(data.apiKey);
        navigator.clipboard?.writeText(data.apiKey).catch(() => {});
        setNomeChave('');
        carregarDados();
      }
    } finally {
      setCriandoChave(false);
    }
  }

  async function revogarApiKey(id: string) {
    await fetch(`/api/api-keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    carregarDados();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Gestão de API Keys B2B (#80) */}
      <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              API Keys B2B por Cliente (#80)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Chaves <code className="text-emerald-300">X-API-Key</code> com hash SHA-256 e cota mensal automática.
            </p>
          </div>
          <a
            href="/docs"
            className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-[11px] text-indigo-300 font-semibold shrink-0"
          >
            Abrir /docs →
          </a>
        </div>

        <form onSubmit={criarApiKey} className="grid grid-cols-12 gap-2">
          <input
            type="text"
            value={nomeChave}
            onChange={(e) => setNomeChave(e.target.value)}
            placeholder="Nome do cliente / integração (ex: ERP Astrea)"
            className="col-span-6 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
          />
          <select
            value={planoChave}
            onChange={(e) => setPlanoChave(e.target.value)}
            className="col-span-4 px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
          >
            <option value="FREE">FREE (1k/mês)</option>
            <option value="PRO">PRO (25k/mês)</option>
            <option value="ENTERPRISE">ENTERPRISE (250k)</option>
          </select>
          <button
            type="submit"
            disabled={criandoChave}
            className="col-span-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>

        {chaveRecemCriada && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] space-y-1">
            <p className="text-emerald-300 font-semibold">
              ✓ Nova API Key gerada e copiada (salve agora, não será exibida novamente):
            </p>
            <code className="block font-mono text-white break-all">{chaveRecemCriada}</code>
          </div>
        )}

        <div className="space-y-2 max-h-44 overflow-y-auto">
          {chaves.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhuma API Key B2B emitida ainda.</p>
          ) : (
            chaves.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
              >
                <div className="min-w-0">
                  <span className="text-white font-medium">{c.nome}</span>
                  <span className="ml-2 font-mono text-emerald-400 text-[11px]">
                    {c.prefixo}...
                  </span>
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                    {c.plano} • {c.usoMesAtual}/{c.limiteMensal} ({c.mesReferencia})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => revogarApiKey(c.id)}
                  className="text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                  title="Revogar API Key"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Memória Coletiva Anonimizada LGPD (#78) */}
      <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              Memória Coletiva Anonimizada LGPD (#78)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Padrões de Varas/Tribunais e biblioteca de minutas sem nenhum dado pessoal (auto-alimentação).
            </p>
          </div>
          <button
            type="button"
            onClick={carregarDados}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-semibold">
            Varas Mapeadas: {perfisVara.length}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            Minutas Validadas (Few-Shot): <strong>{totalModelosMinuta}</strong>
          </span>
        </div>

        <div className="space-y-2 max-h-44 overflow-y-auto">
          {perfisVara.length === 0 ? (
            <p className="text-xs text-slate-500">
              A memória coletiva é alimentada automaticamente a cada análise de publicação realizada pela IA.
            </p>
          ) : (
            perfisVara.map((p) => (
              <div
                key={p.id}
                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-300">
                    {p.siglaTribunal} — {p.orgaoJulgador}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {p.totalAnalises} análises • {p.totalBloqueios} bloqueios • {p.totalLiminares} liminares
                  </span>
                </div>
                {p.sumulasTemas.length > 0 && (
                  <p className="text-[11px] text-slate-400 truncate">
                    Precedentes: {p.sumulasTemas.join(', ')}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
