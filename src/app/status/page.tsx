import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Issue #100: Página Pública de Status & SLA (`/status`) alimentada pelo histórico `LogSaudeTribunal`.
 */
export default async function StatusPage() {
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const logs = await prisma.logSaudeTribunal
    .findMany({
      where: { verificadoEm: { gte: trintaDiasAtras } },
      orderBy: { verificadoEm: 'desc' },
      take: 300,
    })
    .catch(() => []);

  const porServico = new Map<
    string,
    {
      servico: string;
      sistema: string;
      total: number;
      online: number;
      latenciaTotal: number;
      ultimoStatus: string;
      ultimaVerificacao: Date;
    }
  >();

  for (const log of logs) {
    const atual = porServico.get(log.servico) || {
      servico: log.servico,
      sistema: log.sistema,
      total: 0,
      online: 0,
      latenciaTotal: 0,
      ultimoStatus: log.status,
      ultimaVerificacao: log.verificadoEm,
    };
    atual.total += 1;
    if (log.status === 'ONLINE') atual.online += 1;
    atual.latenciaTotal += log.latenciaMs;
    porServico.set(log.servico, atual);
  }

  const servicos = Array.from(porServico.values());

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Transparência Radical — SLA 30 Dias
            </span>
            <h1 className="mt-1 text-2xl font-bold text-white">
              Status dos Tribunais & Barramentos (DJEN / PJe / eproc)
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Monitoramento real de latência e disponibilidade histórica capturado pelo Radar Jurídico.
            </p>
          </div>
          <a
            href="/api/saude-tribunais"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
          >
            Testar Saúde Agora (JSON)
          </a>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {servicos.map((s) => {
            const uptime = ((s.online / Math.max(1, s.total)) * 100).toFixed(1);
            const latMedia = Math.round(s.latenciaTotal / Math.max(1, s.total));
            return (
              <div key={s.servico} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-400">{s.sistema}</span>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                      s.ultimoStatus === 'ONLINE'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : s.ultimoStatus === 'INSTAVEL'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {s.ultimoStatus}
                  </span>
                </div>
                <h2 className="mt-2 font-semibold text-white text-sm">{s.servico}</h2>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div className="rounded-lg bg-slate-950 p-2.5">
                    <span className="text-slate-500 block">Uptime 30d</span>
                    <strong className="text-emerald-400 text-base">{uptime}%</strong>
                  </div>
                  <div className="rounded-lg bg-slate-950 p-2.5">
                    <span className="text-slate-500 block">Latência Média</span>
                    <strong className="text-indigo-300 text-base">{latMedia} ms</strong>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Última checagem: {s.ultimaVerificacao.toLocaleString('pt-BR')} ({s.total} amostras)
                </p>
              </div>
            );
          })}

          {servicos.length === 0 && (
            <div className="md:col-span-3 rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
              Nenhuma amostra registrada ainda nos últimos 30 dias. Acesse{' '}
              <code className="text-indigo-300">/api/saude-tribunais</code> para registrar a primeira medição.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
