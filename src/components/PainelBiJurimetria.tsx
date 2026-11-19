'use client';

import React from 'react';
import type { ProcessoAutoGerido } from '@/types/juridico';
import { gerarRelatorioBIJuridico } from '@/lib/analytics-juridico';

interface PainelBiJurimetriaProps {
  processos: ProcessoAutoGerido[];
  perguntaRag: string;
  setPerguntaRag: (v: string) => void;
  respostaRag: string | null;
  consultandoRag: boolean;
  onConsultarChatRag: (e: React.FormEvent) => void;
}

/**
 * Issues #12, #16, #17, #18, #19, #20, #24, #27, #45, #55 + #75:
 * Componente modular de BI Jurídico, Jurimetria e Chat Semântico RAG.
 */
export function PainelBiJurimetria({
  processos,
  perguntaRag,
  setPerguntaRag,
  respostaRag,
  consultandoRag,
  onConsultarChatRag,
}: PainelBiJurimetriaProps) {
  const bi = gerarRelatorioBIJuridico(processos);

  return (
    <section className="space-y-6">
      {/* Linha 1: Provisionamento Financeiro & Benchmark SLA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              💰 Provisionamento Financeiro &amp; Contingência (#24 / #45)
            </h2>
            <span className="text-lg font-bold font-mono text-emerald-400">
              {bi.passivoFormatado}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <span className="text-[10px] text-rose-300 uppercase block">
                Risco Provável (Alta Urgência)
              </span>
              <span className="text-sm font-bold font-mono text-white">
                {bi.contingenciaPorRisco.provavelRS.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <span className="text-[10px] text-amber-300 uppercase block">
                Risco Possível (Média)
              </span>
              <span className="text-sm font-bold font-mono text-white">
                {bi.contingenciaPorRisco.possivelRS.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block">
                Risco Remoto (Normal)
              </span>
              <span className="text-sm font-bold font-mono text-white">
                {bi.contingenciaPorRisco.remotoRS.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white">
            📊 Benchmark &amp; Auditoria de SLA — Nosso Escritório vs. Terceirizados (#19 / #55)
          </h2>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <span className="text-[10px] text-emerald-300 uppercase block">
                Nosso Escritório
              </span>
              <p className="text-lg font-bold text-white">
                {bi.benchmarkConcorrencia.nossoEscritorio.processos} proc.
              </p>
              <span className="text-[10px] text-slate-400">
                {bi.benchmarkConcorrencia.nossoEscritorio.incidentesCriticos} críticos
              </span>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <span className="text-[10px] text-amber-300 uppercase block">
                Concorrência / Terceiros
              </span>
              <p className="text-lg font-bold text-amber-300">
                {bi.benchmarkConcorrencia.concorrencia.processos} proc.
              </p>
              <span className="text-[10px] text-rose-300 font-semibold">
                {bi.benchmarkConcorrencia.concorrencia.incidentesCriticos} incidentes/bloqueios
              </span>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
              <span className="text-[10px] text-purple-300 uppercase block">
                Sem Advogado (Novos)
              </span>
              <p className="text-lg font-bold text-purple-300">
                {bi.benchmarkConcorrencia.semAdvogado.processos} proc.
              </p>
              <span className="text-[10px] text-slate-400">Abordagem imediata</span>
            </div>
          </div>
        </div>
      </div>

      {/* Linha 2: Mapa de Calor (#18), Jurimetria Varas (#12) e Ofensores/Bancas (#16) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white">
            🗺️ Mapa de Calor por Tribunal / UF (#18)
          </h3>
          {bi.distribuicaoPorTribunal.length === 0 ? (
            <p className="text-slate-500">Dispare uma busca para visualizar o mapa.</p>
          ) : (
            <div className="space-y-2">
              {bi.distribuicaoPorTribunal.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800"
                >
                  <span className="font-bold text-indigo-300">{t.tribunal}</span>
                  <span>
                    <strong>{t.totalProcessos}</strong> proc. ({t.urgenciaAlta} urgentes)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white">
            ⚖️ Jurimetria por Vara / Órgão Julgador (#12)
          </h3>
          {bi.topOrgaosJulgadores.length === 0 ? (
            <p className="text-slate-500">Sem órgãos julgadores analisados ainda.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {bi.topOrgaosJulgadores.map((o, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5"
                >
                  <p className="font-semibold text-white truncate">{o.orgao}</p>
                  <p className="text-[11px] text-slate-400">
                    {o.processos} proc. • Fase predominante: {o.fasePredominante}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white">
            🚨 Autores Contumazes &amp; Advogados Externos (#16)
          </h3>
          {bi.autoresOuAdvogadosRecorrentes.length === 0 ? (
            <p className="text-slate-500">Nenhum ofensor/banca listado ainda.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {bi.autoresOuAdvogadosRecorrentes.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800"
                >
                  <span className="truncate text-slate-200">{item.nome}</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px] shrink-0">
                    {item.quantidadeProcessos}x
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Semântico / RAG com a Base do Escritório (Issue #27) */}
      <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
        <h3 className="font-bold text-white flex items-center gap-2">
          🧠 Busca Semântica / Chat RAG com Todos os Processos e PDFs do Banco (#27)
        </h3>
        <form onSubmit={onConsultarChatRag} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={perguntaRag}
            onChange={(e) => setPerguntaRag(e.target.value)}
            placeholder="Ex: Quais processos têm bloqueio Sisbajud, intimação ou sentença no TRT4?"
            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
          />
          <button
            type="submit"
            disabled={consultandoRag}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
          >
            {consultandoRag ? 'Pesquisando Base...' : 'Perguntar à Base'}
          </button>
        </form>
        {respostaRag && (
          <pre className="whitespace-pre-wrap font-sans text-slate-200 bg-slate-950 p-4 rounded-xl border border-slate-800">
            {respostaRag}
          </pre>
        )}
      </div>
    </section>
  );
}
