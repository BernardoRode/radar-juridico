'use client';

import React, { useState } from 'react';
import {
  Search,
  Building2,
  Scale,
  FileText,
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  Users,
  Code2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Clock,
  Link2,
} from 'lucide-react';
import { ProcessoAutoGerido, PublicacaoEnriquecida } from '@/types/juridico';

type ModoBusca = 'RADAR_CLIENTE' | 'OAB_ADVOGADO' | 'PROCESSO_DIRETO' | 'INSPETOR_LINKS';
type AbaVisualizacao = 'PROCESSOS_AUTO' | 'FEED_PUBLICACOES' | 'API_DOCS';

export default function RadarJuridicoHome() {
  const [modoBusca, setModoBusca] = useState<ModoBusca>('RADAR_CLIENTE');
  const [abaAtiva, setAbaAtiva] = useState<AbaVisualizacao>('PROCESSOS_AUTO');

  // Campos de filtro
  const [nomeParte, setNomeParte] = useState('LG ELECTRONICS');
  const [textoLivre, setTextoLivre] = useState('');
  const [numeroOab, setNumeroOab] = useState('');
  const [ufOab, setUfOab] = useState('RS');
  const [nomeAdvogado, setNomeAdvogado] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [siglaTribunal, setSiglaTribunal] = useState('');
  const [nossasOabs, setNossasOabs] = useState('');

  // Datas (padrão: últimos 7 dias)
  const hoje = new Date().toISOString().split('T')[0];
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [dataInicio, setDataInicio] = useState(seteDiasAtras);
  const [dataFim, setDataFim] = useState(hoje);

  // Estado dos resultados da API
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [endpointGerado, setEndpointGerado] = useState<string>('');
  const [resumo, setResumo] = useState<{
    totalPublicacoesRetornadas: number;
    totalNoCnj: number;
    totalProcessosUnicos: number;
    processosNossoEscritorio: number;
    processosConcorrencia: number;
    processosSemAdvogadoRecemDistribuidos: number;
    alertasUrgenciaAlta: number;
  } | null>(null);
  const [processos, setProcessos] = useState<ProcessoAutoGerido[]>([]);
  const [publicacoes, setPublicacoes] = useState<PublicacaoEnriquecida[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoAutoGerido | null>(null);

  // Estado do Inspetor de Links do PJe/eproc (os 2 links enviados pelo usuário)
  const [linkInspecao, setLinkInspecao] = useState(
    'https://pje.trt4.jus.br/pjekz/validacao/26111612374902100000201044828?instancia=1'
  );
  const [resultadoLink, setResultadoLink] = useState<Record<string, unknown> | null>(null);

  async function executarBusca(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setCarregando(true);
    setErro(null);

    try {
      const params = new URLSearchParams();
      if (modoBusca === 'RADAR_CLIENTE') {
        if (nomeParte) params.set('nomeParte', nomeParte);
        if (textoLivre) params.set('texto', textoLivre);
      } else if (modoBusca === 'OAB_ADVOGADO') {
        if (numeroOab) params.set('numeroOab', numeroOab);
        if (ufOab) params.set('ufOab', ufOab);
        if (nomeAdvogado) params.set('nomeAdvogado', nomeAdvogado);
      } else if (modoBusca === 'PROCESSO_DIRETO') {
        if (numeroProcesso) params.set('numeroProcesso', numeroProcesso);
      }

      if (siglaTribunal) params.set('siglaTribunal', siglaTribunal);
      if (dataInicio) params.set('dataInicio', dataInicio);
      if (dataFim) params.set('dataFim', dataFim);
      if (nossasOabs) params.set('nossasOabs', nossasOabs);
      params.set('itensPorPagina', '30');

      const apiUrl = `/api/publicacoes?${params.toString()}`;
      setEndpointGerado(apiUrl);

      const res = await fetch(apiUrl);
      const json = await res.json();

      if (!json.sucesso) {
        setErro(json.erro || 'Erro ao buscar publicações');
        return;
      }

      setResumo(json.resumo);
      setProcessos(json.processosConsolidados || []);
      setPublicacoes(json.publicacoes || []);
      setProcessoSelecionado(json.processosConsolidados?.[0] || null);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Falha de comunicação com a API');
    } finally {
      setCarregando(false);
    }
  }

  async function inspecionarLinkTribunal(urlParaTestar: string) {
    setLinkInspecao(urlParaTestar);
    const res = await fetch('/api/inspecionar-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlParaTestar }),
    });
    const json = await res.json();
    setResultadoLink(json);
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0d1322]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  RadarJurídico <span className="text-indigo-400">API</span>
                </h1>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  CNJ • PJe • eproc
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Monitoramento de Clientes, Inteligência contra Concorrência e Auto-Atualização de Processos
              </p>
            </div>
          </div>

          {/* Seletor de Abas Principais */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setAbaAtiva('PROCESSOS_AUTO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                abaAtiva === 'PROCESSOS_AUTO'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Pastas Auto-Atualizadas ({processos.length})
            </button>
            <button
              onClick={() => setAbaAtiva('FEED_PUBLICACOES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                abaAtiva === 'FEED_PUBLICACOES'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Feed de Publicações ({publicacoes.length})
            </button>
            <button
              onClick={() => setAbaAtiva('API_DOCS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                abaAtiva === 'API_DOCS'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Documentação da Sua API
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Painel de Busca Multi-Critério */}
        <section className="bg-[#0f1628] border border-slate-800/90 rounded-2xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-800">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setModoBusca('RADAR_CLIENTE')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  modoBusca === 'RADAR_CLIENTE'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4" />
                1. Radar de Cliente / Empresa (Ex: LG)
              </button>

              <button
                type="button"
                onClick={() => setModoBusca('OAB_ADVOGADO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  modoBusca === 'OAB_ADVOGADO'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                2. Busca por OAB / Advogado
              </button>

              <button
                type="button"
                onClick={() => setModoBusca('PROCESSO_DIRETO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  modoBusca === 'PROCESSO_DIRETO'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                3. Monitorar Nº de Processo
              </button>

              <button
                type="button"
                onClick={() => {
                  setModoBusca('INSPETOR_LINKS');
                  inspecionarLinkTribunal(linkInspecao);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  modoBusca === 'INSPETOR_LINKS'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-900 text-amber-300 hover:bg-slate-800 border border-amber-500/30'
                }`}
              >
                <Link2 className="w-4 h-4" />
                4. Inspetor de Links (TRT4 PJe & JFSC eproc)
              </button>
            </div>
          </div>

          {modoBusca === 'INSPETOR_LINKS' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                <p className="font-semibold text-amber-300">
                  Como a Loy Legal e a sua API usam os links de validação do PJe e eproc:
                </p>
                <p>
                  Quando a sua API busca uma publicação no barramento nacional, o próprio retorno da publicação traz os links diretos de validação do documento assinado pelo juiz. Abaixo estão os 2 links que você enviou para testar a decodificação:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      inspecionarLinkTribunal(
                        'https://pje.trt4.jus.br/pjekz/validacao/26111612374902100000201044828?instancia=1'
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 font-mono text-[11px]"
                  >
                    Testar Link 1: TRT4 (pjekz/validacao)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      inspecionarLinkTribunal(
                        'https://eproc.jfsc.jus.br/eprocV2/externo_controlador.php?acao=consulta_publica_documento&numProcesso=50099269520204047201&idDocumento=721794864303096789645203838960&hash=b7d0e09a4ce4fd5ccc8bf79144eeba813f19793d5060a35e22aae9f22d3ef0f7'
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 font-mono text-[11px]"
                  >
                    Testar Link 2: JFSC (eprocV2/consulta_publica_documento)
                  </button>
                </div>
              </div>

              {resultadoLink && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs overflow-x-auto">
                  <pre className="text-emerald-400">
                    {JSON.stringify(resultadoLink, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={executarBusca} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {modoBusca === 'RADAR_CLIENTE' && (
                  <>
                    <div className="md:col-span-5">
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Nome da Empresa / Cliente (Radar Nacional)
                      </label>
                      <input
                        type="text"
                        value={nomeParte}
                        onChange={(e) => setNomeParte(e.target.value)}
                        placeholder="Ex: LG ELECTRONICS, BANCO X, CONSTRUTORA Y..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Filtro no Texto / CNPJ (Opcional)
                      </label>
                      <input
                        type="text"
                        value={textoLivre}
                        onChange={(e) => setTextoLivre(e.target.value)}
                        placeholder="CNPJ ou palavra-chave no despacho..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}

                {modoBusca === 'OAB_ADVOGADO' && (
                  <>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Número da OAB
                      </label>
                      <input
                        type="text"
                        value={numeroOab}
                        onChange={(e) => setNumeroOab(e.target.value)}
                        placeholder="Ex: 123456"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        UF da OAB
                      </label>
                      <input
                        type="text"
                        maxLength={2}
                        value={ufOab}
                        onChange={(e) => setUfOab(e.target.value.toUpperCase())}
                        placeholder="RS, SP, SC..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white uppercase focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Ou Nome do Advogado
                      </label>
                      <input
                        type="text"
                        value={nomeAdvogado}
                        onChange={(e) => setNomeAdvogado(e.target.value)}
                        placeholder="Nome completo ou parcial..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}

                {modoBusca === 'PROCESSO_DIRETO' && (
                  <div className="md:col-span-9">
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Número Único do Processo (Padrão CNJ - 20 dígitos)
                    </label>
                    <input
                      type="text"
                      value={numeroProcesso}
                      onChange={(e) => setNumeroProcesso(e.target.value)}
                      placeholder="Ex: 5009926-95.2020.4.04.7201 ou 50099269520204047201"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Tribunal (Opcional)
                  </label>
                  <input
                    type="text"
                    value={siglaTribunal}
                    onChange={(e) => setSiglaTribunal(e.target.value.toUpperCase())}
                    placeholder="Todos (ou TRT4, TRF4, TJSP...)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Linha 2: Datas + OABs do nosso escritório para detecção de concorrência */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
                <div className="md:col-span-5">
                  <label className="block text-xs font-medium text-indigo-300 mb-1">
                    Suas OABs (Para separar Seus Processos vs. Concorrência)
                  </label>
                  <input
                    type="text"
                    value={nossasOabs}
                    onChange={(e) => setNossasOabs(e.target.value)}
                    placeholder="Ex: 12345RS, 98765SP (separadas por vírgula)"
                    className="w-full px-3.5 py-2 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="md:col-span-3 flex items-end">
                  <button
                    type="submit"
                    disabled={carregando}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                  >
                    {carregando ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Consultando Tribunais...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Disparar Radar & Atualizar Processos
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>

        {/* Mensagem de Erro */}
        {erro && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold">Atenção ao consultar o barramento:</p>
              <p>{erro}</p>
            </div>
          </div>
        )}

        {/* Cards de Inteligência Executiva */}
        {resumo && (
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="bg-[#0f1628] border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] text-slate-400">Processos Consolidados</span>
              <p className="text-2xl font-bold text-white mt-1">
                {resumo.totalProcessosUnicos}
              </p>
              <span className="text-[10px] text-emerald-400">
                Pastas atualizadas sozinhas
              </span>
            </div>

            <div className="bg-[#0f1628] border border-amber-500/30 rounded-xl p-4">
              <span className="text-[11px] text-amber-300">Com Outros Escritórios</span>
              <p className="text-2xl font-bold text-amber-400 mt-1">
                {resumo.processosConcorrencia}
              </p>
              <span className="text-[10px] text-slate-400">
                Concorrência atuando pelo cliente
              </span>
            </div>

            <div className="bg-[#0f1628] border border-purple-500/30 rounded-xl p-4">
              <span className="text-[11px] text-purple-300">Sem Advogado Habilitado</span>
              <p className="text-2xl font-bold text-purple-400 mt-1">
                {resumo.processosSemAdvogadoRecemDistribuidos}
              </p>
              <span className="text-[10px] text-slate-400">
                Oportunidade / Recém-distribuídos!
              </span>
            </div>

            <div className="bg-[#0f1628] border border-emerald-500/30 rounded-xl p-4">
              <span className="text-[11px] text-emerald-300">Nosso Escritório</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {resumo.processosNossoEscritorio}
              </p>
              <span className="text-[10px] text-slate-400">
                Com nossas OABs vinculadas
              </span>
            </div>

            <div className="bg-[#0f1628] border border-rose-500/30 rounded-xl p-4">
              <span className="text-[11px] text-rose-300">Alertas de Alta Urgência</span>
              <p className="text-2xl font-bold text-rose-400 mt-1">
                {resumo.alertasUrgenciaAlta}
              </p>
              <span className="text-[10px] text-slate-400">
                Citações, Sentenças, Liminares
              </span>
            </div>
          </section>
        )}

        {/* CONTEÚDO DA ABA 1: PASTAS DE PROCESSOS AUTO-ATUALIZADAS */}
        {abaAtiva === 'PROCESSOS_AUTO' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Lista de Processos à Esquerda */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Processos Auto-Cadastrados ({processos.length})
                </h2>
                {endpointGerado && (
                  <a
                    href={endpointGerado}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    Ver JSON da API <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {processos.length === 0 ? (
                <div className="bg-[#0f1628] border border-slate-800/80 rounded-2xl p-8 text-center space-y-2">
                  <Scale className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-300">
                    Clique em &ldquo;Disparar Radar & Atualizar Processos&rdquo; acima
                  </p>
                  <p className="text-xs text-slate-500">
                    A API vai buscar no CNJ em tempo real, separar o que é seu do que é de escritórios concorrentes, extrair prazos e montar a pasta de cada processo sozinha.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                  {processos.map((proc) => {
                    const ativo =
                      processoSelecionado?.numeroProcesso === proc.numeroProcesso;
                    return (
                      <div
                        key={proc.numeroProcesso}
                        onClick={() => setProcessoSelecionado(proc)}
                        className={`p-4 rounded-xl border transition cursor-pointer ${
                          ativo
                            ? 'bg-indigo-950/40 border-indigo-500 shadow-lg'
                            : 'bg-[#0f1628] border-slate-800/90 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold text-[11px]">
                            {proc.siglaTribunal}
                          </span>
                          {proc.statusConcorrencia === 'NOSSO_ESCRITORIO' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                              Nosso Escritório
                            </span>
                          )}
                          {proc.statusConcorrencia === 'ESCRITORIO_CONCORRENTE' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                              Escritório Concorrente / Terceiro
                            </span>
                          )}
                          {proc.statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO' && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                              Recém-Distribuído (Sem Advogado)
                            </span>
                          )}
                        </div>

                        <p className="font-mono text-xs font-bold text-white">
                          {proc.numeroFormatado}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {proc.classeProcessual} • {proc.orgaoJulgador}
                        </p>

                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                          <span className="text-indigo-300 font-medium">
                            {proc.ultimoStatusDetectado}
                          </span>
                          <span className="text-slate-500">
                            {proc.ultimaAtualizacao}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ficha Completa Auto-Atualizada do Processo à Direita */}
            <div className="lg:col-span-7">
              {processoSelecionado ? (
                <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-6 space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
                          {processoSelecionado.siglaTribunal}
                        </span>
                        <h3 className="text-base font-bold font-mono text-white">
                          Processo nº {processoSelecionado.numeroFormatado}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {processoSelecionado.classeProcessual} — {processoSelecionado.orgaoJulgador}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">
                        Status Automático do Processo
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {processoSelecionado.ultimoStatusDetectado}
                      </span>
                    </div>
                  </div>

                  {/* Partes e Advogados Identificados (Radar de Concorrência) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Partes Envolvidas (Extraídas da Publicação)
                      </h4>
                      {processoSelecionado.partes.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Citadas diretamente no corpo do texto abaixo.
                        </p>
                      ) : (
                        <ul className="space-y-1.5 text-xs">
                          {processoSelecionado.partes.map((p, idx) => (
                            <li
                              key={idx}
                              className="flex items-center justify-between gap-2 text-slate-200"
                            >
                              <span className="truncate">{p.nome}</span>
                              {p.polo && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 shrink-0">
                                  Polo {p.polo}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                      <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Advogados / Escritórios Atuando
                      </h4>
                      {processoSelecionado.advogadosAtuantes.length === 0 ? (
                        <p className="text-xs text-purple-300">
                          Nenhum advogado habilitado ainda! (Possível processo recém-distribuído antes da citação).
                        </p>
                      ) : (
                        <ul className="space-y-1.5 text-xs">
                          {processoSelecionado.advogadosAtuantes.map((adv, idx) => (
                            <li
                              key={idx}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="text-slate-200 truncate">
                                {adv.nome}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] shrink-0 ${
                                  adv.ehNosso
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                OAB/{adv.uf} {adv.oab} {adv.ehNosso ? '(Nosso)' : '(Externo)'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Links de Documentos Originais do PJe / eproc */}
                  {processoSelecionado.linksDocumentosOriginais.length > 0 && (
                    <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
                      <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4" />
                        Links Diretos de Validação / Documento Original (PJe & eproc)
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {processoSelecionado.linksDocumentosOriginais.map((lk, i) => (
                          <a
                            key={i}
                            href={lk.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs transition"
                          >
                            <span>Abrir Inteiro Teor ({lk.sistema})</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Linha do Tempo de Publicações do Processo */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Linha do Tempo Automática ({processoSelecionado.historicoPublicacoes.length}{' '}
                      publicação/ões)
                    </h4>
                    <div className="space-y-4">
                      {processoSelecionado.historicoPublicacoes.map((pub) => (
                        <div
                          key={pub.id}
                          className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 text-xs font-semibold">
                                {pub.inteligencia.alertasAutomaticos.tipoAtoDetectado}
                              </span>
                              {pub.inteligencia.alertasAutomaticos.prazoDetectado && (
                                <span className="px-2.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Prazo: {pub.inteligencia.alertasAutomaticos.prazoDetectado}
                                </span>
                              )}
                              {pub.inteligencia.alertasAutomaticos.valorDetectado && (
                                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-xs font-mono">
                                  Valor detectado: {pub.inteligencia.alertasAutomaticos.valorDetectado}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-400">
                              Disponibilizado em: {pub.data_disponibilizacao}
                            </span>
                          </div>

                          <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-900/70 p-3.5 rounded-lg border border-slate-800/80 max-h-72 overflow-y-auto">
                            {pub.texto}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0f1628] border border-slate-800/80 rounded-2xl p-12 text-center text-slate-500 text-sm">
                  Selecione um processo ao lado para visualizar a pasta auto-atualizada, os advogados concorrentes identificados e os links originais do PJe/eproc.
                </div>
              )}
            </div>
          </section>
        )}

        {/* CONTEÚDO DA ABA 2: FEED DE PUBLICAÇÕES */}
        {abaAtiva === 'FEED_PUBLICACOES' && (
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
        )}

        {/* CONTEÚDO DA ABA 3: DOCUMENTAÇÃO DA SUA API */}
        {abaAtiva === 'API_DOCS' && (
          <section className="bg-[#0f1628] border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white">
                Como consumir a sua própria API (Web ou App Mobile React Native / Flutter)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                O seu projeto Next.js já expõe endpoints REST prontos em <code>/api/publicacoes</code> e <code>/api/inspecionar-link</code>.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
                  GET /api/publicacoes
                </span>
                <p className="text-xs text-slate-300">
                  Busca publicações por OAB, Advogado, Nome do Cliente (ex: LG) ou Processo, analisa concorrência, extrai prazos/valores e retorna tanto as publicações individuais quanto as pastas dos processos já consolidadas.
                </p>
                <pre className="text-xs font-mono text-indigo-300 bg-slate-900 p-3 rounded-lg overflow-x-auto">
{`// Exemplo 1: Monitorar tudo da "LG ELECTRONICS" e comparar com as OABs do seu escritório
GET /api/publicacoes?nomeParte=LG%20ELECTRONICS&nossasOabs=12345RS,99887SP&dataInicio=2026-11-01&dataFim=2026-11-18

// Exemplo 2: Buscar diretamente pela OAB do advogado
GET /api/publicacoes?numeroOab=12345&ufOab=RS

// Exemplo 3: Buscar por número de processo específico
GET /api/publicacoes?numeroProcesso=50099269520204047201`}
                </pre>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
