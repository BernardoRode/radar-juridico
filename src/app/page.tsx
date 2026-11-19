'use client';

import React, { useEffect, useState } from 'react';
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
  Download,
  FileCheck2,
  Database,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  DadosDatajud,
  ProcessoAutoGerido,
  PublicacaoEnriquecida,
  ResultadoExtracaoDocumento,
} from '@/types/juridico';
import type { AnaliseIAJuridica } from '@/lib/ia-juridica';
import { PainelCockpitKanban } from '@/components/PainelCockpitKanban';
import { PainelBiJurimetria } from '@/components/PainelBiJurimetria';
import { PainelFeedPublicacoes } from '@/components/PainelFeedPublicacoes';
import {
  PainelConfiguracoes,
  type AdvogadoDbItem,
} from '@/components/PainelConfiguracoes';
import { PainelApiDocs } from '@/components/PainelApiDocs';

type ModoBusca = 'RADAR_CLIENTE' | 'OAB_ADVOGADO' | 'PROCESSO_DIRETO' | 'INSPETOR_LINKS';
type AbaVisualizacao =
  | 'PROCESSOS_AUTO'
  | 'COCKPIT_KANBAN'
  | 'BI_JURIMETRIA'
  | 'FEED_PUBLICACOES'
  | 'BANCO_CONFIG'
  | 'API_DOCS';

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
  const [inspecionandoLink, setInspecionandoLink] = useState(false);
  const [resultadoLink, setResultadoLink] = useState<{
    sucesso?: boolean;
    sistemaDetectado?: string;
    tribunalHost?: string;
    urlOriginal?: string;
    parametrosExtraidos?: Record<string, string>;
    extracao?: ResultadoExtracaoDocumento;
    explicacaoTecnica?: string;
  } | null>(null);
  const [extraindoUrl, setExtraindoUrl] = useState<string | null>(null);
  const [documentosExtraidos, setDocumentosExtraidos] = useState<
    Record<string, ResultadoExtracaoDocumento>
  >({});
  const [carregandoDatajud, setCarregandoDatajud] = useState(false);
  const [datajudPorProcesso, setDatajudPorProcesso] = useState<
    Record<string, DadosDatajud>
  >({});
  const [analisandoIA, setAnalisandoIA] = useState(false);
  const [analiseIAPorProcesso, setAnaliseIAPorProcesso] = useState<
    Record<string, AnaliseIAJuridica>
  >({});
  const [ocultarMeroExpediente, setOcultarMeroExpediente] = useState(false);
  const [copiadoWhatsApp, setCopiadoWhatsApp] = useState(false);
  const [processosConcluidos, setProcessosConcluidos] = useState<Record<string, boolean>>({});
  const [gerandoMinuta, setGerandoMinuta] = useState(false);
  const [minutaPorProcesso, setMinutaPorProcesso] = useState<
    Record<string, { tituloPeca: string; minutaTexto: string }>
  >({});

  async function gerarMinutaDoProcesso(
    proc: ProcessoAutoGerido,
    tipoMinuta: 'RESPOSTA_AUTOMATICA' | 'NULIDADE_ART_272_CPC'
  ) {
    setGerandoMinuta(true);
    try {
      const ultimaPub = proc.historicoPublicacoes[0];
      const res = await fetch('/api/ia/minuta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numeroProcesso: proc.numeroFormatado,
          tribunal: proc.siglaTribunal,
          orgaoJulgador: proc.orgaoJulgador,
          partes: proc.partes.map((p) => p.nome),
          tipoAtoDetectado: proc.ultimoStatusDetectado,
          textoPublicacao: ultimaPub?.texto || '',
          tipoMinuta,
        }),
      });
      const json = await res.json();
      if (json.sucesso) {
        setMinutaPorProcesso((prev) => ({
          ...prev,
          [proc.numeroProcesso]: {
            tituloPeca: json.tituloPeca,
            minutaTexto: json.minutaTexto,
          },
        }));
      }
    } finally {
      setGerandoMinuta(false);
    }
  }

  async function analisarProcessoComIA(proc: ProcessoAutoGerido) {
    const ultimaPub = proc.historicoPublicacoes[0];
    if (!ultimaPub?.texto) return;
    setAnalisandoIA(true);
    try {
      const res = await fetch('/api/ia/analisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: ultimaPub.texto,
          statusConcorrencia: proc.statusConcorrencia,
          tipoAtoDetectado: proc.ultimoStatusDetectado,
          tribunal: proc.siglaTribunal,
          numeroProcesso: proc.numeroFormatado,
        }),
      });
      const json = await res.json();
      if (json.analise) {
        setAnaliseIAPorProcesso((prev) => ({
          ...prev,
          [proc.numeroProcesso]: json.analise,
        }));
      }
    } finally {
      setAnalisandoIA(false);
    }
  }

  // Estado da Aba Banco & Configurações (Issue #5)
  const [clientesDb, setClientesDb] = useState<
    Array<{ id: string; nome: string; variacoes?: string; cnpjs?: string }>
  >([]);
  const [advogadosDb, setAdvogadosDb] = useState<AdvogadoDbItem[]>([]);
  const [processosDb, setProcessosDb] = useState<
    Array<{
      id: string;
      numeroFormatado: string;
      siglaTribunal: string;
      statusConcorrencia: string;
      ultimoStatusDetectado: string;
      urgenciaMaxima: string;
      _count?: { publicacoes: number; documentos: number };
    }>
  >([]);
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteCnpj, setNovoClienteCnpj] = useState('');
  const [novoAdvNome, setNovoAdvNome] = useState('');
  const [novoAdvOab, setNovoAdvOab] = useState('');
  const [novoAdvUf, setNovoAdvUf] = useState('RS');
  const [rodandoCron, setRodandoCron] = useState(false);
  const [execucoesRadar, setExecucoesRadar] = useState<
    Array<{
      id: string;
      origem: string;
      clientesVarredura: number;
      oabsVarredura: number;
      publicacoesEncontradas: number;
      processosSalvos: number;
      alertasAlta: number;
      status: string;
      iniciadoEm: string;
    }>
  >([]);
  const [webhooksDb, setWebhooksDb] = useState<
    Array<{ id: string; nome: string; canal: string; urlDestino: string }>
  >([]);
  const [novoWebhookNome, setNovoWebhookNome] = useState('');
  const [novoWebhookCanal, setNovoWebhookCanal] = useState('WHATSAPP');
  const [novoWebhookUrl, setNovoWebhookUrl] = useState('');
  const [tokenJwtGerado, setTokenJwtGerado] = useState<string | null>(null);
  const [saudeTribunais, setSaudeTribunais] = useState<
    Array<{
      servico: string;
      sistema: string;
      status: string;
      latenciaMs: number;
      urlCertidaoIndisponibilidade: string;
    }>
  >([]);
  const [verificandoSaude, setVerificandoSaude] = useState(false);
  const [homonimosIgnorados, setHomonimosIgnorados] = useState<Record<string, boolean>>({});
  const [perguntaRag, setPerguntaRag] = useState('');
  const [respostaRag, setRespostaRag] = useState<string | null>(null);
  const [consultandoRag, setConsultandoRag] = useState(false);
  const [linkCompartilhadoCopiado, setLinkCompartilhadoCopiado] = useState<string | null>(null);
  const [prazoBaixadoAviso, setPrazoBaixadoAviso] = useState<string | null>(null);

  async function gerarLinkCorrespondente48h(numeroProcesso: string) {
    try {
      const res = await fetch('/api/compartilhar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'CORRESPONDENTE_48H', escopo: numeroProcesso, horasValidade: 48 }),
      });
      const json = await res.json();
      if (json?.link?.urlPublica) {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(json.link.urlPublica).catch(() => {});
        }
        setLinkCompartilhadoCopiado(json.link.urlPublica);
        setTimeout(() => setLinkCompartilhadoCopiado(null), 5000);
      }
    } catch {
      // Silencioso
    }
  }

  async function marcarPrazoBaixadoNoBanco(numeroProcesso: string) {
    try {
      await fetch('/api/processos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroProcesso, prazoBaixado: true, minutaPronta: true }),
      });
      setPrazoBaixadoAviso(numeroProcesso);
      setTimeout(() => setPrazoBaixadoAviso(null), 3500);
    } catch {
      // Silencioso
    }
  }

  // Issue #49: Atalhos de teclado globais na triagem (J/K navegar, E extrair PDF, C confirmar/baixar prazo)
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      const tag = (ev.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.ctrlKey || ev.metaKey || ev.altKey) {
        return;
      }
      const lista = processos.filter(
        (proc) => !homonimosIgnorados[proc.numeroProcesso]
      );
      if (lista.length === 0) return;
      const idxAtual = processoSelecionado
        ? lista.findIndex((proc) => proc.numeroProcesso === processoSelecionado.numeroProcesso)
        : -1;
      const key = ev.key.toLowerCase();
      if (key === 'j') {
        ev.preventDefault();
        const prox = lista[(idxAtual + 1) % lista.length];
        if (prox) setProcessoSelecionado(prox);
      } else if (key === 'k') {
        ev.preventDefault();
        const ant = lista[(idxAtual - 1 + lista.length) % lista.length];
        if (ant) setProcessoSelecionado(ant);
      } else if (key === 'e' && processoSelecionado) {
        const pubComLink = processoSelecionado.historicoPublicacoes.find((pub) => pub.link);
        if (pubComLink?.link) {
          ev.preventDefault();
          inspecionarLinkTribunal(pubComLink.link);
        }
      } else if (key === 'c' && processoSelecionado) {
        ev.preventDefault();
        marcarPrazoBaixadoNoBanco(processoSelecionado.numeroProcesso);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [processos, processoSelecionado, homonimosIgnorados]);

  async function consultarChatRag(e: React.FormEvent) {
    e.preventDefault();
    if (!perguntaRag.trim()) return;
    setConsultandoRag(true);
    try {
      const res = await fetch('/api/ia/chat-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta: perguntaRag }),
      });
      const json = await res.json();
      setRespostaRag(json.resposta || json.erro || 'Sem resposta.');
    } finally {
      setConsultandoRag(false);
    }
  }

  function tocarAudioBriefing() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const textoFala = processoSelecionado
      ? `Briefing do Radar Jurídico. Processo número ${processoSelecionado.numeroFormatado}, tribunal ${processoSelecionado.siglaTribunal}. Fase atual: ${processoSelecionado.faseProcessual}. Último ato: ${processoSelecionado.ultimoStatusDetectado}. ${
          processoSelecionado.prazoFatal
            ? `Atenção: prazo fatal em ${processoSelecionado.prazoFatal}.`
            : 'Sem prazo fatal aberto.'
        }`
      : `Radar Jurídico ativo com ${processos.length} processos monitorados na tela.`;
    const utterance = new SpeechSynthesisUtterance(textoFala);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }

  async function verificarSaudeDosTribunais() {
    setVerificandoSaude(true);
    try {
      const res = await fetch('/api/saude-tribunais');
      const json = await res.json();
      if (json.servicos) setSaudeTribunais(json.servicos);
    } finally {
      setVerificandoSaude(false);
    }
  }

  async function carregarBancoEConfig() {
    const [rCli, rAdv, rProc, rCron, rWh] = await Promise.all([
      fetch('/api/config/clientes').then((r) => r.json()),
      fetch('/api/config/advogados').then((r) => r.json()),
      fetch('/api/processos').then((r) => r.json()),
      fetch('/api/cron/radar?historico=true').then((r) => r.json()),
      fetch('/api/webhooks').then((r) => r.json()),
    ]);
    if (rCli.sucesso) setClientesDb(rCli.clientes || []);
    if (rAdv.sucesso) setAdvogadosDb(rAdv.advogados || []);
    if (rProc.sucesso) setProcessosDb(rProc.processos || []);
    if (rCron.sucesso) setExecucoesRadar(rCron.execucoes || []);
    if (rWh.sucesso) setWebhooksDb(rWh.webhooks || []);
  }

  async function adicionarWebhookDb(e: React.FormEvent) {
    e.preventDefault();
    if (!novoWebhookNome.trim() || !novoWebhookUrl.trim()) return;
    await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: novoWebhookNome,
        canal: novoWebhookCanal,
        urlDestino: novoWebhookUrl,
      }),
    });
    setNovoWebhookNome('');
    setNovoWebhookUrl('');
    carregarBancoEConfig();
  }

  async function removerWebhookDb(id: string) {
    await fetch(`/api/webhooks?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    carregarBancoEConfig();
  }

  async function gerarTokenMobileJwt() {
    const res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'App Mobile Radar Jurídico',
        email: 'mobile@escritorio.com.br',
        perfil: 'MOBILE_APP',
      }),
    });
    const json = await res.json();
    if (json.accessToken) setTokenJwtGerado(json.accessToken);
  }

  async function dispararVarreduraRadar() {
    setRodandoCron(true);
    try {
      await fetch('/api/cron/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diasRetroativos: 3 }),
      });
      await carregarBancoEConfig();
    } finally {
      setRodandoCron(false);
    }
  }

  async function adicionarClienteDb(e: React.FormEvent) {
    e.preventDefault();
    if (!novoClienteNome.trim()) return;
    await fetch('/api/config/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoClienteNome, cnpjs: novoClienteCnpj }),
    });
    setNovoClienteNome('');
    setNovoClienteCnpj('');
    carregarBancoEConfig();
  }

  async function removerClienteDb(id: string) {
    await fetch(`/api/config/clientes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    carregarBancoEConfig();
  }

  async function adicionarAdvogadoDb(e: React.FormEvent) {
    e.preventDefault();
    if (!novoAdvNome.trim() || !novoAdvOab.trim()) return;
    await fetch('/api/config/advogados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novoAdvNome, numeroOab: novoAdvOab, ufOab: novoAdvUf }),
    });
    setNovoAdvNome('');
    setNovoAdvOab('');
    carregarBancoEConfig();
  }

  async function removerAdvogadoDb(id: string) {
    await fetch(`/api/config/advogados?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    carregarBancoEConfig();
  }

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
    setInspecionandoLink(true);
    try {
      const res = await fetch('/api/inspecionar-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlParaTestar }),
      });
      const json = await res.json();
      setResultadoLink(json);
    } finally {
      setInspecionandoLink(false);
    }
  }

  async function extrairDocumentoDoProcesso(url: string) {
    setExtraindoUrl(url);
    try {
      const res = await fetch('/api/inspecionar-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.extracao) {
        setDocumentosExtraidos((prev) => ({
          ...prev,
          [url]: json.extracao,
        }));
      }
    } finally {
      setExtraindoUrl(null);
    }
  }

  async function consultarCapaDatajud(numeroProcesso: string, siglaTribunal?: string) {
    setCarregandoDatajud(true);
    try {
      const params = new URLSearchParams({ numeroProcesso });
      if (siglaTribunal) params.set('siglaTribunal', siglaTribunal);
      const res = await fetch(`/api/datajud?${params.toString()}`);
      const json = await res.json();
      if (json.datajud) {
        setDatajudPorProcesso((prev) => ({
          ...prev,
          [numeroProcesso]: json.datajud,
        }));
      }
    } finally {
      setCarregandoDatajud(false);
    }
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
              onClick={() => setAbaAtiva('COCKPIT_KANBAN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                abaAtiva === 'COCKPIT_KANBAN'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Cockpit Kanban
            </button>
            <button
              onClick={() => setAbaAtiva('BI_JURIMETRIA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                abaAtiva === 'BI_JURIMETRIA'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              BI &amp; Jurimetria
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
              onClick={() => {
                setAbaAtiva('BANCO_CONFIG');
                carregarBancoEConfig();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                abaAtiva === 'BANCO_CONFIG'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Banco &amp; Config
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
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-3">
                <p className="font-semibold text-amber-300">
                  Crawler de Inteiro Teor (PJe &amp; eproc) — Issue #3:
                </p>
                <p>
                  Cole qualquer link de validação do PJe (<code className="text-amber-300">pjekz/validacao/...</code>) ou do eproc (<code className="text-amber-300">consulta_publica_documento</code>) para validar a assinatura digital, extrair o inteiro teor do PDF e baixar o documento original.
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={linkInspecao}
                    onChange={(e) => setLinkInspecao(e.target.value)}
                    placeholder="https://pje.trt4.jus.br/pjekz/validacao/..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    disabled={inspecionandoLink}
                    onClick={() => inspecionarLinkTribunal(linkInspecao)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
                  >
                    {inspecionandoLink ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Extraindo...
                      </>
                    ) : (
                      <>
                        <FileCheck2 className="w-3.5 h-3.5" />
                        Extrair Inteiro Teor
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      inspecionarLinkTribunal(
                        'https://pje.trt4.jus.br/pjekz/validacao/26111612374902100000201044828?instancia=1'
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 font-mono text-[11px] cursor-pointer"
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
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 font-mono text-[11px] cursor-pointer"
                  >
                    Testar Link 2: JFSC (eprocV2/consulta_publica_documento)
                  </button>
                </div>
              </div>

              {resultadoLink?.extracao && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-bold">
                          {resultadoLink.sistemaDetectado}
                        </span>
                        {resultadoLink.extracao.statusExtracao === 'SUCESSO' && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                            Extraído com Sucesso
                          </span>
                        )}
                        {resultadoLink.extracao.statusExtracao === 'CAPTCHA_NECESSARIO' && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-semibold">
                            Verificação Humana Exigida (CAPTCHA)
                          </span>
                        )}
                        {(resultadoLink.extracao.statusExtracao === 'ERRO' ||
                          resultadoLink.extracao.statusExtracao === 'INDISPONIVEL') && (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-semibold">
                            {resultadoLink.extracao.statusExtracao}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300">
                        {resultadoLink.extracao.mensagem}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {resultadoLink.extracao.temPdfDisponivel && (
                        <a
                          href={`/api/documentos/baixar?url=${encodeURIComponent(
                            resultadoLink.extracao.urlOriginal
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar PDF Assinado (
                          {Math.round((resultadoLink.extracao.tamanhoPdfBytes || 0) / 1024)} KB)
                        </a>
                      )}
                      <a
                        href={resultadoLink.extracao.urlOriginal}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                      >
                        Abrir no Tribunal <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {resultadoLink.extracao.assinadoPor && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block">
                          Documento / Validação
                        </span>
                        <span className="text-white font-semibold">
                          {resultadoLink.extracao.tituloDocumento} (
                          {resultadoLink.extracao.resultadoValidacao})
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block">
                          Assinado Digitalmente Por
                        </span>
                        <span className="text-emerald-300 font-medium">
                          {resultadoLink.extracao.assinadoPor}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 uppercase block">
                          Data/Hora Assinatura
                        </span>
                        <span className="text-slate-200 font-mono">
                          {resultadoLink.extracao.dataHoraAssinatura}
                        </span>
                      </div>
                    </div>
                  )}

                  {resultadoLink.extracao.textoExtraido && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                        Inteiro Teor Extraído ({resultadoLink.extracao.totalPaginas || 1} pág.)
                      </span>
                      <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-900/80 p-4 rounded-xl border border-slate-800 max-h-80 overflow-y-auto">
                        {resultadoLink.extracao.textoExtraido}
                      </div>
                    </div>
                  )}

                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                      Ver metadados técnicos (JSON)
                    </summary>
                    <pre className="mt-2 text-emerald-400 font-mono text-[11px] overflow-x-auto bg-slate-900 p-3 rounded-lg border border-slate-800">
                      {JSON.stringify(
                        {
                          ...resultadoLink,
                          extracao: {
                            ...resultadoLink.extracao,
                            textoExtraido: resultadoLink.extracao.textoExtraido
                              ? `[${resultadoLink.extracao.textoExtraido.length} caracteres]`
                              : undefined,
                          },
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Processos Auto-Cadastrados ({processos.length})
                </h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={ocultarMeroExpediente}
                      onChange={(e) => setOcultarMeroExpediente(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                    />
                    Ocultar Mero Expediente
                  </label>
                  {endpointGerado && (
                    <a
                      href={endpointGerado}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      JSON <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
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
                  {processos
                    .filter((p) => (!ocultarMeroExpediente ? true : !p.ehMeroExpediente))
                    .filter((p) => !homonimosIgnorados[p.numeroProcesso])
                    .map((proc) => {
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
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold text-[11px]">
                              {proc.siglaTribunal}
                            </span>
                            {typeof proc.scoreOportunidade === 'number' && (
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-bold">
                                Score {proc.scoreOportunidade}
                              </span>
                            )}
                          </div>
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

                        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-indigo-300 font-medium truncate">
                            {proc.faseProcessual || proc.ultimoStatusDetectado}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {proc.prazoFatal && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-mono">
                                Fatal: {proc.prazoFatal}
                              </span>
                            )}
                            <span className="text-slate-500">
                              {proc.ultimaAtualizacao}
                            </span>
                          </div>
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

                    <div className="text-right space-y-1">
                      <span className="text-[11px] text-slate-400 block">
                        Fase &amp; Status Automático
                      </span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {processoSelecionado.faseProcessual && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold">
                            {processoSelecionado.faseProcessual}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {processoSelecionado.ultimoStatusDetectado}
                        </span>
                        {processoSelecionado.prazoFatal && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            Prazo Fatal: {processoSelecionado.prazoFatal}
                          </span>
                        )}
                        {processoSelecionado.prazoInternoD2 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                            Revisão D-2: {processoSelecionado.prazoInternoD2}
                          </span>
                        )}
                        {processoSelecionado.prazoFatal && (
                          <a
                            href={`/api/calendario/prazos.ics?numeroProcesso=${encodeURIComponent(
                              processoSelecionado.numeroFormatado
                            )}&prazoFatal=${encodeURIComponent(
                              processoSelecionado.prazoFatal
                            )}&tribunal=${encodeURIComponent(
                              processoSelecionado.siglaTribunal
                            )}&ato=${encodeURIComponent(
                              processoSelecionado.ultimoStatusDetectado
                            )}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition"
                          >
                            <Download className="w-3 h-3" /> Agenda (.ics)
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={tocarAudioBriefing}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-xs font-semibold cursor-pointer"
                        >
                          🔊 Ouvir Áudio (#22)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHomonimosIgnorados((prev) => ({
                              ...prev,
                              [processoSelecionado.numeroProcesso]: true,
                            }));
                            fetch('/api/processos', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                numeroProcesso: processoSelecionado.numeroProcesso,
                                ignoradoHomonimo: true,
                              }),
                            }).catch(() => {});
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                        >
                          Ignorar Homônimo (#44)
                        </button>
                        <button
                          type="button"
                          onClick={() => marcarPrazoBaixadoNoBanco(processoSelecionado.numeroProcesso)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold cursor-pointer"
                        >
                          {prazoBaixadoAviso === processoSelecionado.numeroProcesso
                            ? '? Baixa Salva!'
                            : '? Baixar Prazo (C)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => gerarLinkCorrespondente48h(processoSelecionado.numeroProcesso)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold cursor-pointer"
                        >
                          {linkCompartilhadoCopiado ? '? Link 48h Copiado!' : '?? Link 48h (#60)'}
                        </button>
                      </div>
                      {processoSelecionado.hashProvaCaptura && (
                        <span className="text-[10px] font-mono text-slate-500 block mt-1">
                          🔒 Prova de Captura (#29): {processoSelecionado.hashProvaCaptura}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Viabilidade de Acordo (#59), Precedentes (#33), Teimosinha (#53) e Dossiê Pré-Audiência (#23) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {processoSelecionado.viabilidadeAcordo && (
                      <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1">
                        <span className="font-bold text-cyan-300 block">
                          🤝 Calculadora de Viabilidade de Acordo (#59)
                        </span>
                        <p className="text-slate-300">
                          {processoSelecionado.viabilidadeAcordo.recomendacao}
                        </p>
                        <span className="text-[11px] text-emerald-400 font-medium block">
                          {processoSelecionado.viabilidadeAcordo.economiaEstimada}
                        </span>
                      </div>
                    )}
                    {processoSelecionado.dossiePreAudiencia && (
                      <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-1">
                        <span className="font-bold text-indigo-300 block">
                          📋 Dossiê Pré-Audiência 48h (#23)
                        </span>
                        <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                          {processoSelecionado.dossiePreAudiencia.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {processoSelecionado.precedentesDetectados && (
                      <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/30">
                        <span className="font-bold text-purple-300 block">
                          📚 Súmulas / Temas Repetitivos Detectados (#33)
                        </span>
                        <span className="text-slate-200">
                          {processoSelecionado.precedentesDetectados.join(' • ')}
                        </span>
                      </div>
                    )}
                    {processoSelecionado.alertaTeimosinhaSisbajud && (
                      <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30">
                        <span className="font-bold text-rose-300 block">
                          🏦 Monitor Sisbajud / Teimosinha (#53)
                        </span>
                        <span className="text-slate-200">
                          {processoSelecionado.alertaTeimosinhaSisbajud}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Alerta Crítico Anti-Multa Domicílio Judicial Eletrônico (Issue #36) */}
                  {processoSelecionado.limiteConfirmacaoDomicilio3Dias && (
                    <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-200">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>
                          <strong>Domicílio Judicial Eletrônico (Res. CNJ 455):</strong> Confirmar citação em até 3 dias úteis (limite:{' '}
                          <strong className="underline">{processoSelecionado.limiteConfirmacaoDomicilio3Dias}</strong>) para evitar revelia e <strong>multa de até 5% do valor da causa</strong>.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Botão Sala de Audiência Virtual (Issue #54) */}
                  {processoSelecionado.linkAudienciaVirtual && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-emerald-200 font-medium">
                        🎥 Sala de Audiência Telepresencial detectada automaticamente no despacho!
                      </span>
                      <a
                        href={processoSelecionado.linkAudienciaVirtual}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
                      >
                        Entrar na Audiência Virtual <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  {/* Alertas Especiais: Honorários (#52), Trânsito em Julgado (#61), Pauta 2º Grau (#63) e Perícia (#64) */}
                  {(processoSelecionado.honorariosDetectados ||
                    processoSelecionado.transitoEmJulgado ||
                    processoSelecionado.pautaJulgamento2Grau ||
                    processoSelecionado.checklistPericia) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {processoSelecionado.honorariosDetectados && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                          <span className="font-bold text-emerald-300 block">
                            💰 Honorários de Sucumbência Detectados (Issue #52)
                          </span>
                          <span>Fixados em: {processoSelecionado.honorariosDetectados}</span>
                        </div>
                      )}
                      {processoSelecionado.transitoEmJulgado && (
                        <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200">
                          <span className="font-bold text-cyan-300 block">
                            🏁 Trânsito em Julgado / Arquivamento (Issue #61)
                          </span>
                          <span>Apto para baixa de monitoramento ou execução de honorários.</span>
                        </div>
                      )}
                      {processoSelecionado.pautaJulgamento2Grau && (
                        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200">
                          <span className="font-bold text-amber-300 block">
                            🏛️ Pauta de Julgamento 2º Grau / Sustentação Oral (Issue #63)
                          </span>
                          <span>Verificar prazo de inscrição para sustentação oral e envio de memoriais!</span>
                        </div>
                      )}
                      {processoSelecionado.checklistPericia && (
                        <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/40 text-indigo-200 sm:col-span-2">
                          <span className="font-bold text-indigo-300 block mb-1">
                            🔬 Checklist Obrigatório de Perícia (Issue #64)
                          </span>
                          <ul className="space-y-1">
                            {processoSelecionado.checklistPericia.map((item, idx) => (
                              <li key={idx} className="flex items-center gap-2">
                                <input type="checkbox" className="rounded bg-slate-900 border-slate-700" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tradutor Juridiquês -> WhatsApp do Cliente + Escudo Anti-Golpe (Issue #39 + #51) */}
                  {processoSelecionado.mensagemClienteWhatsApp && (
                    <div
                      className={`p-4 rounded-xl border space-y-2 text-xs ${
                        processoSelecionado.riscoGolpeAlvara
                          ? 'bg-amber-500/15 border-amber-500/40'
                          : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-200 flex items-center gap-1.5">
                          {processoSelecionado.riscoGolpeAlvara ? (
                            <span className="text-amber-300">
                              🛡️ Escudo Anti-Golpe do Falso Advogado (Alvará / RPV Detectado)
                            </span>
                          ) : (
                            <span>💬 Mensagem Pronta para o WhatsApp do Cliente (Sem Juridiquês)</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              processoSelecionado.mensagemClienteWhatsApp || ''
                            );
                            setCopiadoWhatsApp(true);
                            setTimeout(() => setCopiadoWhatsApp(false), 2000);
                          }}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] cursor-pointer"
                        >
                          {copiadoWhatsApp ? 'Copiado!' : 'Copiar para WhatsApp'}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-slate-300 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                        {processoSelecionado.mensagemClienteWhatsApp}
                      </pre>
                    </div>
                  )}

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
                    <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3">
                      <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4" />
                        Links Diretos de Validação / Documento Original (PJe &amp; eproc)
                      </h4>
                      <div className="space-y-3">
                        {processoSelecionado.linksDocumentosOriginais.map((lk, i) => {
                          const docExtraido = documentosExtraidos[lk.url];
                          const carregandoDoc = extraindoUrl === lk.url;
                          return (
                            <div key={i} className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={carregandoDoc}
                                  onClick={() => extrairDocumentoDoProcesso(lk.url)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 border border-emerald-500/40 text-emerald-200 text-xs transition cursor-pointer"
                                >
                                  {carregandoDoc ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <FileCheck2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {carregandoDoc
                                      ? 'Extraindo Inteiro Teor...'
                                      : `Extrair Inteiro Teor (${lk.sistema})`}
                                  </span>
                                </button>
                                <a
                                  href={lk.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs transition"
                                >
                                  <span>Abrir no Tribunal ({lk.sistema})</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>

                              {docExtraido && (
                                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-semibold text-emerald-300">
                                      {docExtraido.tituloDocumento || docExtraido.sistema} —{' '}
                                      {docExtraido.statusExtracao}
                                    </span>
                                    {docExtraido.temPdfDisponivel && (
                                      <a
                                        href={`/api/documentos/baixar?url=${encodeURIComponent(
                                          docExtraido.urlOriginal
                                        )}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-medium"
                                      >
                                        <Download className="w-3 h-3" /> Baixar PDF
                                      </a>
                                    )}
                                  </div>
                                  {docExtraido.assinadoPor && (
                                    <p className="text-[11px] text-slate-400">
                                      Assinado por: {docExtraido.assinadoPor} em{' '}
                                      {docExtraido.dataHoraAssinatura}
                                    </p>
                                  )}
                                  {docExtraido.textoExtraido ? (
                                    <div className="text-slate-200 whitespace-pre-wrap bg-slate-900/70 p-3 rounded-lg border border-slate-800 max-h-56 overflow-y-auto">
                                      {docExtraido.textoExtraido}
                                    </div>
                                  ) : (
                                    <p className="text-amber-300">{docExtraido.mensagem}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Enriquecimento Datajud CNJ (Capa & Movimentações TPU) */}
                  <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5" />
                        Capa &amp; Movimentações Completas (Datajud CNJ)
                      </h4>
                      <button
                        type="button"
                        disabled={carregandoDatajud}
                        onClick={() =>
                          consultarCapaDatajud(
                            processoSelecionado.numeroProcesso,
                            processoSelecionado.siglaTribunal
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 disabled:opacity-50 border border-cyan-500/40 text-cyan-200 text-xs font-medium transition cursor-pointer"
                      >
                        {carregandoDatajud ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {carregandoDatajud
                            ? 'Consultando Datajud...'
                            : datajudPorProcesso[processoSelecionado.numeroProcesso]
                            ? 'Atualizar Datajud'
                            : 'Carregar Capa & Andamentos'}
                        </span>
                      </button>
                    </div>

                    {datajudPorProcesso[processoSelecionado.numeroProcesso] && (() => {
                      const dj = datajudPorProcesso[processoSelecionado.numeroProcesso];
                      if (!dj.encontrado) {
                        return (
                          <p className="text-xs text-amber-300">
                            {dj.mensagem || 'Processo não encontrado no índice público do Datajud.'}
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-3 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">
                                Data de Ajuizamento
                              </span>
                              <span className="text-white font-semibold">
                                {dj.dataAjuizamento || 'Não informada'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">
                                Grau / Sistema
                              </span>
                              <span className="text-white font-semibold">
                                {dj.grau || '-'} • {dj.sistema?.nome || '-'} ({dj.formato?.nome || '-'})
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">
                                Total de Movimentos (TPU)
                              </span>
                              <span className="text-cyan-300 font-bold">
                                {dj.totalMovimentos} andamentos
                              </span>
                            </div>
                          </div>

                          {dj.protocoloRecenteDetectado && (
                            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-emerald-200">
                              <span>
                                ✅ <strong>Baixa Automática (Issue #42):</strong> Protocolo detectado no Datajud ({dj.protocoloRecenteDetectado})!
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setProcessosConcluidos((prev) => ({
                                    ...prev,
                                    [processoSelecionado.numeroProcesso]: true,
                                  }))
                                }
                                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer"
                              >
                                Confirmar Baixa do Prazo
                              </button>
                            </div>
                          )}

                          {dj.assuntos.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {dj.assuntos.map((a, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-200 text-[11px]"
                                >
                                  {a.nome} (TPU {a.codigo})
                                </span>
                              ))}
                            </div>
                          )}

                          {dj.movimentos.length > 0 && (
                            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                              {dj.movimentos.slice(0, 20).map((mov, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80 flex items-start justify-between gap-3"
                                >
                                  <div>
                                    <p className="text-slate-200 font-medium">
                                      {mov.nome}{' '}
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        #{mov.codigo}
                                      </span>
                                    </p>
                                    {mov.complementosTabelados && mov.complementosTabelados.length > 0 && (
                                      <p className="text-[11px] text-slate-400">
                                        {mov.complementosTabelados
                                          .map((c) => `${c.descricao}: ${c.nome}`)
                                          .join(' • ')}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                                    {mov.dataHora?.slice(0, 10)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Auditoria & Resumo com IA Jurídica (Issue #8) */}
                  <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        IA Jurídica — Resumo &amp; Auditoria da Concorrência
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={analisandoIA}
                          onClick={() => analisarProcessoComIA(processoSelecionado)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/25 hover:bg-purple-600/35 disabled:opacity-50 border border-purple-500/40 text-purple-200 text-xs font-medium transition cursor-pointer"
                        >
                          {analisandoIA ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {analisandoIA
                              ? 'Analisando...'
                              : analiseIAPorProcesso[processoSelecionado.numeroProcesso]
                              ? 'Reanalisar com IA'
                              : 'Resumo & Auditoria IA'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={gerandoMinuta}
                          onClick={() =>
                            gerarMinutaDoProcesso(processoSelecionado, 'RESPOSTA_AUTOMATICA')
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/35 disabled:opacity-50 border border-indigo-500/40 text-indigo-200 text-xs font-medium transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Pré-Minuta de Resposta (#15)</span>
                        </button>
                        <button
                          type="button"
                          disabled={gerandoMinuta}
                          onClick={() =>
                            gerarMinutaDoProcesso(processoSelecionado, 'NULIDADE_ART_272_CPC')
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-50 border border-rose-500/40 text-rose-200 text-xs font-medium transition cursor-pointer"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Devolução de Prazo Art. 272 (#46)</span>
                        </button>
                      </div>
                    </div>

                    {minutaPorProcesso[processoSelecionado.numeroProcesso] && (
                      <div className="space-y-2 text-xs bg-slate-950 p-4 rounded-xl border border-indigo-500/40">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-indigo-300">
                            📄 {minutaPorProcesso[processoSelecionado.numeroProcesso].tituloPeca}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              navigator.clipboard.writeText(
                                minutaPorProcesso[processoSelecionado.numeroProcesso].minutaTexto
                              )
                            }
                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Copiar Petição
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-200 bg-slate-900 p-3 rounded-lg border border-slate-800 max-h-64 overflow-y-auto">
                          {minutaPorProcesso[processoSelecionado.numeroProcesso].minutaTexto}
                        </pre>
                      </div>
                    )}

                    {analiseIAPorProcesso[processoSelecionado.numeroProcesso] && (() => {
                      const ia = analiseIAPorProcesso[processoSelecionado.numeroProcesso];
                      return (
                        <div className="space-y-3 text-xs bg-slate-950/90 p-4 rounded-xl border border-slate-800">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold text-[10px]">
                              Risco: {ia.nivelRisco}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Motor: {ia.modo}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase block mb-0.5">
                              Resumo Executivo (2 linhas)
                            </span>
                            <p className="text-slate-100 leading-relaxed">{ia.resumoExecutivo}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase block mb-1">
                              Riscos / Falhas Detectadas
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-amber-300">
                              {ia.falhasOuRiscosDetectados.map((r, idx) => (
                                <li key={idx}>{r}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-200">
                            <span className="text-[10px] font-bold uppercase block text-emerald-400 mb-0.5">
                              Recomendação Estratégica
                            </span>
                            {ia.oportunidadeComercial}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

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

        {/* CONTEÚDO DA ABA: COCKPIT KANBAN DE PRAZOS (ISSUE #13 + #42 + #75) */}
        {abaAtiva === 'COCKPIT_KANBAN' && (
          <PainelCockpitKanban
            processos={processos}
            processosConcluidos={processosConcluidos}
            onAbrirProcesso={(proc) => {
              setProcessoSelecionado(proc);
              setAbaAtiva('PROCESSOS_AUTO');
            }}
            onAlternarConcluido={(numProc) => marcarPrazoBaixadoNoBanco(numProc)}
          />
        )}

        {/* CONTEÚDO DA ABA: BI & JURIMETRIA (ISSUE #75) */}
        {abaAtiva === 'BI_JURIMETRIA' && (
          <PainelBiJurimetria
            processos={processos}
            perguntaRag={perguntaRag}
            setPerguntaRag={setPerguntaRag}
            respostaRag={respostaRag}
            consultandoRag={consultandoRag}
            onConsultarChatRag={consultarChatRag}
          />
        )}

        {/* CONTEÚDO DA ABA: FEED DE PUBLICAÇÕES (ISSUE #75) */}
        {abaAtiva === 'FEED_PUBLICACOES' && (
          <PainelFeedPublicacoes publicacoes={publicacoes} />
        )}

        {/* CONTEÚDO DA ABA: BANCO & CONFIGURAÇÕES (ISSUE #5 + #73 + #75) */}
        {abaAtiva === 'BANCO_CONFIG' && (
          <PainelConfiguracoes
            advogadosDb={advogadosDb}
            clientesDb={clientesDb}
            execucoesRadar={execucoesRadar}
            webhooksDb={webhooksDb}
            processosDb={processosDb}
            saudeTribunais={saudeTribunais}
            novoAdvNome={novoAdvNome}
            setNovoAdvNome={setNovoAdvNome}
            novoAdvOab={novoAdvOab}
            setNovoAdvOab={setNovoAdvOab}
            novoAdvUf={novoAdvUf}
            setNovoAdvUf={setNovoAdvUf}
            novoClienteNome={novoClienteNome}
            setNovoClienteNome={setNovoClienteNome}
            novoClienteCnpj={novoClienteCnpj}
            setNovoClienteCnpj={setNovoClienteCnpj}
            novoWebhookNome={novoWebhookNome}
            setNovoWebhookNome={setNovoWebhookNome}
            novoWebhookCanal={novoWebhookCanal}
            setNovoWebhookCanal={setNovoWebhookCanal}
            novoWebhookUrl={novoWebhookUrl}
            setNovoWebhookUrl={setNovoWebhookUrl}
            rodandoCron={rodandoCron}
            verificandoSaude={verificandoSaude}
            tokenJwtGerado={tokenJwtGerado}
            onAdicionarAdvogado={adicionarAdvogadoDb}
            onRemoverAdvogado={removerAdvogadoDb}
            onAdicionarCliente={adicionarClienteDb}
            onRemoverCliente={removerClienteDb}
            onDispararVarredura={dispararVarreduraRadar}
            onAdicionarWebhook={adicionarWebhookDb}
            onRemoverWebhook={removerWebhookDb}
            onGerarTokenJwt={gerarTokenMobileJwt}
            onVerificarSaude={verificarSaudeDosTribunais}
            onRecarregarTudo={carregarBancoEConfig}
          />
        )}

        {/* CONTEÚDO DA ABA: DOCUMENTAÇÃO DA API (ISSUE #75) */}
        {abaAtiva === 'API_DOCS' && <PainelApiDocs />}
      </main>
    </div>
  );
}