'use client';

import React from 'react';
import type { PublicacaoEnriquecida } from '@/types/juridico';

interface PainelFeedPublicacoesProps {
  publicacoes: PublicacaoEnriquecida[];
}

/**
 * Issue #75: Componente modular do Feed de Publicações do DJEN/CNJ.
 */
export function PainelFeedPublicacoes({ publicacoes }: PainelFeedPublicacoesProps) {
  return (
    <section className="space-y-4">
      {publicacoes.map((pub) => (
        <div
          key={pub.id}
          className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-indigo-600/20 text-indigo-300 font-bold text-xs">
                {pub.siglaTribunal}
              </span>
              <span className="font-mono text-sm font-bold text-white">
                {pub.numeroprocessocommascara || pub.numero_processo}
              </span>
              <span className="text-xs text-slate-400">• {pub.nomeOrgao}</span>
            </div>
            <span className="text-xs text-slate-400">
              Data: {pub.data_disponibilizacao}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-950 p-4 rounded-xl border border-slate-800/80">
            {pub.texto}
          </p>
        </div>
      ))}
    </section>
  );
}
