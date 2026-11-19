import { prisma } from '@/lib/prisma';

function anonimizarCpf(texto?: string | null): string {
  if (!texto) return '';
  return texto
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '***.***.***-**')
    .replace(/\b\d{11}\b/g, '***********');
}

export default async function PaginaCompartilhada({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const registro = await prisma.linkCompartilhamento.findUnique({
    where: { token },
  });

  if (!registro || registro.expiraEm.getTime() < Date.now()) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-xl font-bold text-rose-400">Link Inválido ou Expirado</h1>
          <p className="mt-3 text-sm text-slate-400">
            Este link temporário de acesso restrito expirou ou não existe mais. Solicite um novo link ao escritório responsável.
          </p>
        </div>
      </main>
    );
  }

  const expiraBr = registro.expiraEm.toLocaleString('pt-BR');

  if (registro.tipo === 'CORRESPONDENTE_48H') {
    const proc = await prisma.processo.findUnique({
      where: { numeroProcesso: registro.escopo.replace(/[^0-9]/g, '') },
      include: {
        publicacoes: { orderBy: { criadoEm: 'desc' }, take: 20 },
        documentos: { orderBy: { criadoEm: 'desc' }, take: 10 },
      },
    });

    if (!proc) {
      return (
        <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <h1 className="text-xl font-bold text-amber-400">Processo não encontrado</h1>
            <p className="mt-2 text-sm text-slate-400">O processo vinculado a esta diligência ainda não consta na base.</p>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="rounded-2xl border border-indigo-500/30 bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Kit Temporário de Diligência — Correspondente Externo
              </span>
              <span className="text-xs text-slate-400">Expira em: {expiraBr}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-white">{proc.numeroFormatado}</h1>
            <p className="mt-1 text-sm text-slate-300">
              {proc.siglaTribunal} • {proc.orgaoJulgador} • {proc.classeProcessual}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <span className="rounded-full bg-slate-800 px-3 py-1">Fase: {proc.faseProcessual}</span>
              {proc.prazoFatal && (
                <span className="rounded-full bg-rose-500/20 text-rose-300 px-3 py-1 font-semibold">
                  Prazo Fatal: {proc.prazoFatal}
                </span>
              )}
              {registro.anonimizarLgpd && (
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-3 py-1">
                  Anonimizado LGPD
                </span>
              )}
            </div>
          </header>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Publicações Recentes ({proc.publicacoes.length})
            </h2>
            {proc.publicacoes.map((pub) => (
              <article key={pub.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{pub.tipoAtoDetectado}</span>
                  <span>{pub.dataDisponibilizacao}</span>
                </div>
                <p className="mt-2 text-sm text-slate-200 whitespace-pre-wrap">
                  {registro.anonimizarLgpd ? anonimizarCpf(pub.texto) : pub.texto}
                </p>
              </article>
            ))}
          </section>

          {proc.documentos.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">
                Documentos Originais Extraídos ({proc.documentos.length})
              </h2>
              {proc.documentos.map((doc) => (
                <article key={doc.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{doc.tituloDocumento || doc.sistema}</span>
                    <span>Assinado por: {doc.assinadoPor || 'N/I'}</span>
                  </div>
                  {doc.textoExtraido && (
                    <p className="mt-2 text-xs text-slate-300 whitespace-pre-wrap">
                      {(registro.anonimizarLgpd
                        ? anonimizarCpf(doc.textoExtraido)
                        : doc.textoExtraido
                      ).slice(0, 3000)}
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}
        </div>
      </main>
    );
  }

  // PORTAL_CLIENTE White-Label (Issue #25)
  const todos = await prisma.processo.findMany({
    where: { ignoradoHomonimo: false },
    include: { _count: { select: { publicacoes: true, documentos: true } } },
    orderBy: { atualizadoEm: 'desc' },
    take: 200,
  });
  const filtro = registro.escopo.toUpperCase();
  const processos = todos.filter((p) => (p.partesJson || '').toUpperCase().includes(filtro));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="rounded-2xl border border-emerald-500/30 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Portal Executivo do Cliente — Acesso Restrito
            </span>
            <span className="text-xs text-slate-400">Válido até: {expiraBr}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">{registro.escopo}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Total de processos monitorados: {processos.length}
          </p>
        </header>

        <section className="grid gap-4">
          {processos.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-white">{p.numeroFormatado}</h2>
                <span className="text-xs rounded-full bg-slate-800 px-3 py-1 text-slate-300">
                  {p.siglaTribunal} • {p.faseProcessual}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{p.orgaoJulgador}</p>
              <p className="mt-2 text-sm text-slate-200">{p.ultimoStatusDetectado}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                <span>Publicações: {p._count.publicacoes}</span>
                <span>Documentos: {p._count.documentos}</span>
                {p.prazoFatal && (
                  <span className="text-rose-300 font-semibold">Prazo Fatal: {p.prazoFatal}</span>
                )}
                {p.prazoBaixado && (
                  <span className="text-emerald-400 font-semibold">✓ Prazo Cumprido/Baixado</span>
                )}
              </div>
            </div>
          ))}
          {processos.length === 0 && (
            <p className="text-sm text-slate-400">
              Nenhum processo localizado para &ldquo;{registro.escopo}&rdquo; no momento.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
