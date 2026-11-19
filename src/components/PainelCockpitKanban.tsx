'use client';

import React from 'react';
import type { ProcessoAutoGerido } from '@/types/juridico';

interface PainelCockpitKanbanProps {
  processos: ProcessoAutoGerido[];
  processosConcluidos: Record<string, boolean>;
  onAbrirProcesso: (proc: ProcessoAutoGerido) => void;
  onAlternarConcluido: (numeroProcesso: string) => void;
}

/**
 * Issue #13 + #42 + #75: Componente modular do Cockpit Kanban de Prazos.
 */
export function PainelCockpitKanban({
  processos,
  processosConcluidos,
  onAbrirProcesso,
  onAlternarConcluido,
}: PainelCockpitKanbanProps) {
  const colunas = [
    {
      titulo: '🔥 Críticos & Citações (Res. 455)',
      cor: 'border-rose-500/40',
      itens: processos.filter(
        (p) =>
          !processosConcluidos[p.numeroProcesso] &&
          (p.urgenciaMaxima === 'ALTA' ||
            p.statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO')
      ),
    },
    {
      titulo: '⏳ Prazos em Curso (Revisão D-2)',
      cor: 'border-amber-500/40',
      itens: processos.filter(
        (p) =>
          !processosConcluidos[p.numeroProcesso] &&
          p.urgenciaMaxima !== 'ALTA' &&
          p.statusConcorrencia === 'NOSSO_ESCRITORIO'
      ),
    },
    {
      titulo: '🕵️ Concorrência em Auditoria',
      cor: 'border-purple-500/40',
      itens: processos.filter(
        (p) =>
          !processosConcluidos[p.numeroProcesso] &&
          p.urgenciaMaxima !== 'ALTA' &&
          p.statusConcorrencia === 'ESCRITORIO_CONCORRENTE'
      ),
    },
    {
      titulo: '✅ Conferidos / Protocolados',
      cor: 'border-emerald-500/40',
      itens: processos.filter((p) => Boolean(processosConcluidos[p.numeroProcesso])),
    },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {colunas.map((col, idx) => (
        <div
          key={idx}
          className={`bg-[#0f1628] border ${col.cor} rounded-2xl p-4 space-y-3`}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white">{col.titulo}</h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-900 text-slate-300 text-[11px] font-bold">
              {col.itens.length}
            </span>
          </div>
          <div className="space-y-2.5 max-h-[560px] overflow-y-auto">
            {col.itens.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Nenhum processo nesta coluna.
              </p>
            ) : (
              col.itens.map((proc) => (
                <div
                  key={proc.numeroProcesso}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold text-[10px]">
                      {proc.siglaTribunal}
                    </span>
                    {typeof proc.scoreOportunidade === 'number' && (
                      <span className="text-[10px] font-mono text-cyan-300 font-bold">
                        Score {proc.scoreOportunidade}
                      </span>
                    )}
                  </div>
                  <p
                    onClick={() => onAbrirProcesso(proc)}
                    className="font-mono font-bold text-white hover:text-indigo-400 cursor-pointer"
                  >
                    {proc.numeroFormatado}
                  </p>
                  <p className="text-[11px] text-slate-300">{proc.ultimoStatusDetectado}</p>
                  {proc.prazoFatal && (
                    <p className="text-[11px] text-rose-300 font-mono">
                      Fatal: {proc.prazoFatal} (D-2: {proc.prazoInternoD2})
                    </p>
                  )}
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onAlternarConcluido(proc.numeroProcesso)}
                      className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold cursor-pointer"
                    >
                      {processosConcluidos[proc.numeroProcesso]
                        ? 'Reabrir Prazo'
                        : '✓ Marcar Protocolado'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
