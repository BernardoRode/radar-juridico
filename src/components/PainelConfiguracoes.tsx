'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Clock,
  Code2,
  Database,
  Download,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';

export interface AdvogadoDbItem {
  id: string;
  nome: string;
  numeroOab: string;
  ufOab: string;
  emFeriasAte?: string | null;
  advogadoSubstituto?: string | null;
}

export interface ClienteDbItem {
  id: string;
  nome: string;
  variacoes?: string | null;
  cnpjs?: string | null;
}

export interface ExecucaoRadarItem {
  id: string;
  origem: string;
  clientesVarredura: number;
  oabsVarredura: number;
  publicacoesEncontradas: number;
  processosSalvos: number;
  alertasAlta: number;
  status: string;
  iniciadoEm: string;
}

export interface WebhookDbItem {
  id: string;
  nome: string;
  canal: string;
  urlDestino: string;
}

export interface ProcessoDbItem {
  id: string;
  numeroFormatado: string;
  siglaTribunal: string;
  statusConcorrencia: string;
  ultimoStatusDetectado: string;
  urgenciaMaxima: string;
  _count?: { publicacoes: number; documentos: number };
}

export interface SaudeTribunalItem {
  servico: string;
  sistema: string;
  status: string;
  latenciaMs: number;
  urlCertidaoIndisponibilidade: string;
}

interface LogWebhookItem {
  id: string;
  canal: string;
  urlDestino: string;
  evento: string;
  sucesso: boolean;
  httpStatus?: number | null;
  tentativas: number;
  erro?: string | null;
  criadoEm: string;
}

interface StatusIaDiagnostico {
  provedorAtivo: string;
  modeloAtivo?: string | null;
  estrategiaCiclo?: string;
  totalProvedoresConfigurados?: number;
  totalSlotsConfigurados?: number;
  slotsDisponiveisAgora?: number;
  slotsEmCooldown?: number;
  totalRequisicoes?: number;
  totalFailovers?: number;
  slots?: Array<{
    id: string;
    provedor: string;
    modelo: string;
    status: 'DISPONIVEL' | 'EM_COOLDOWN';
    cooldownSegundosRestantes: number;
    motivoCooldown?: string;
  }>;
}

interface PainelConfiguracoesProps {
  advogadosDb: AdvogadoDbItem[];
  clientesDb: ClienteDbItem[];
  execucoesRadar: ExecucaoRadarItem[];
  webhooksDb: WebhookDbItem[];
  processosDb: ProcessoDbItem[];
  saudeTribunais: SaudeTribunalItem[];
  novoAdvNome: string;
  setNovoAdvNome: (v: string) => void;
  novoAdvOab: string;
  setNovoAdvOab: (v: string) => void;
  novoAdvUf: string;
  setNovoAdvUf: (v: string) => void;
  novoClienteNome: string;
  setNovoClienteNome: (v: string) => void;
  novoClienteCnpj: string;
  setNovoClienteCnpj: (v: string) => void;
  novoWebhookNome: string;
  setNovoWebhookNome: (v: string) => void;
  novoWebhookCanal: string;
  setNovoWebhookCanal: (v: string) => void;
  novoWebhookUrl: string;
  setNovoWebhookUrl: (v: string) => void;
  rodandoCron: boolean;
  verificandoSaude: boolean;
  tokenJwtGerado: string | null;
  onAdicionarAdvogado: (e: React.FormEvent) => void;
  onRemoverAdvogado: (id: string) => void;
  onAdicionarCliente: (e: React.FormEvent) => void;
  onRemoverCliente: (id: string) => void;
  onDispararVarredura: () => void;
  onAdicionarWebhook: (e: React.FormEvent) => void;
  onRemoverWebhook: (id: string) => void;
  onGerarTokenJwt: () => void;
  onVerificarSaude: () => void;
  onRecarregarTudo: () => void;
}

/**
 * Issues #5, #7, #9, #47, #60, #62, #73 + #75:
 * Painel modular de Banco, Configurações, Férias OAB, Logs de Webhook, Portal do Cliente e Status Multi-IA.
 */
export function PainelConfiguracoes({
  advogadosDb,
  clientesDb,
  execucoesRadar,
  webhooksDb,
  processosDb,
  saudeTribunais,
  novoAdvNome,
  setNovoAdvNome,
  novoAdvOab,
  setNovoAdvOab,
  novoAdvUf,
  setNovoAdvUf,
  novoClienteNome,
  setNovoClienteNome,
  novoClienteCnpj,
  setNovoClienteCnpj,
  novoWebhookNome,
  setNovoWebhookNome,
  novoWebhookCanal,
  setNovoWebhookCanal,
  novoWebhookUrl,
  setNovoWebhookUrl,
  rodandoCron,
  verificandoSaude,
  tokenJwtGerado,
  onAdicionarAdvogado,
  onRemoverAdvogado,
  onAdicionarCliente,
  onRemoverCliente,
  onDispararVarredura,
  onAdicionarWebhook,
  onRemoverWebhook,
  onGerarTokenJwt,
  onVerificarSaude,
  onRecarregarTudo,
}: PainelConfiguracoesProps) {
  // Issue #73: Edição de Férias / Substituto por OAB (PATCH /api/config/advogados)
  const [editandoFeriasId, setEditandoFeriasId] = useState<string | null>(null);
  const [feriasAteInput, setFeriasAteInput] = useState('');
  const [substitutoInput, setSubstitutoInput] = useState('');
  const [salvandoFerias, setSalvandoFerias] = useState(false);

  // Issue #73: Logs de entrega de Webhooks (GET /api/webhooks?logs=true)
  const [logsWebhook, setLogsWebhook] = useState<LogWebhookItem[]>([]);
  const [carregandoLogs, setCarregandoLogs] = useState(false);
  const [mostrarLogs, setMostrarLogs] = useState(false);

  // Issue #73: Gerador visual de Portal do Cliente White-Label (POST /api/compartilhar)
  const [portalClienteEscopo, setPortalClienteEscopo] = useState('');
  const [portalHorasValidade, setPortalHorasValidade] = useState(168); // 7 dias
  const [portalAnonimizarLgpd, setPortalAnonimizarLgpd] = useState(false);
  const [gerandoPortal, setGerandoPortal] = useState(false);
  const [linkPortalGerado, setLinkPortalGerado] = useState<string | null>(null);

  // Issue #73 + #67: Diagnóstico do Pool Multi-IA
  const [statusIa, setStatusIa] = useState<StatusIaDiagnostico | null>(null);

  async function carregarStatusIa() {
    try {
      const res = await fetch('/api/config/status');
      const data = await res.json();
      if (data?.sucesso && data.ia) {
        setStatusIa(data.ia);
      }
    } catch {
      // Silencioso
    }
  }

  useEffect(() => {
    carregarStatusIa();
  }, []);

  async function salvarFeriasAdvogado(advId: string) {
    setSalvandoFerias(true);
    try {
      await fetch('/api/config/advogados', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: advId,
          emFeriasAte: feriasAteInput.trim() || null,
          advogadoSubstituto: substitutoInput.trim() || null,
        }),
      });
      setEditandoFeriasId(null);
      onRecarregarTudo();
    } finally {
      setSalvandoFerias(false);
    }
  }

  async function carregarLogsWebhook() {
    setCarregandoLogs(true);
    setMostrarLogs(true);
    try {
      const res = await fetch('/api/webhooks?logs=true');
      const data = await res.json();
      if (data?.sucesso && Array.isArray(data.logs)) {
        setLogsWebhook(data.logs);
      }
    } finally {
      setCarregandoLogs(false);
    }
  }

  async function gerarLinkPortalCliente(e: React.FormEvent) {
    e.preventDefault();
    const escopo = portalClienteEscopo.trim() || clientesDb[0]?.nome || '';
    if (!escopo) return;
    setGerandoPortal(true);
    try {
      const res = await fetch('/api/compartilhar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'PORTAL_CLIENTE',
          escopo,
          horasValidade: portalHorasValidade,
          anonimizarLgpd: portalAnonimizarLgpd,
        }),
      });
      const data = await res.json();
      if (data?.sucesso && data.urlRelativa) {
        const urlCompleta = `${window.location.origin}${data.urlRelativa}`;
        setLinkPortalGerado(urlCompleta);
        navigator.clipboard?.writeText(urlCompleta).catch(() => {});
      }
    } finally {
      setGerandoPortal(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Advogados do Nosso Escritório + Controle de Férias (#47 / #73) */}
        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              OABs do Nosso Escritório &amp; Férias (#47 / #73)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Toda busca na API cruza com estas OABs. Configure férias para redirecionar alertas ao substituto.
            </p>
          </div>

          <form onSubmit={onAdicionarAdvogado} className="grid grid-cols-12 gap-2">
            <input
              type="text"
              value={novoAdvNome}
              onChange={(e) => setNovoAdvNome(e.target.value)}
              placeholder="Nome do advogado"
              className="col-span-5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <input
              type="text"
              value={novoAdvOab}
              onChange={(e) => setNovoAdvOab(e.target.value)}
              placeholder="Nº OAB"
              className="col-span-3 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <input
              type="text"
              maxLength={2}
              value={novoAdvUf}
              onChange={(e) => setNovoAdvUf(e.target.value.toUpperCase())}
              placeholder="UF"
              className="col-span-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white uppercase"
            />
            <button
              type="submit"
              className="col-span-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {advogadosDb.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma OAB cadastrada ainda.</p>
            ) : (
              advogadosDb.map((adv) => (
                <div
                  key={adv.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-white font-medium">{adv.nome}</span>
                      <span className="ml-2 font-mono text-emerald-400">
                        OAB/{adv.ufOab} {adv.numeroOab}
                      </span>
                      {adv.emFeriasAte && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px]">
                          🏖 Férias até {adv.emFeriasAte}
                          {adv.advogadoSubstituto ? ` → ${adv.advogadoSubstituto}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (editandoFeriasId === adv.id) {
                            setEditandoFeriasId(null);
                          } else {
                            setEditandoFeriasId(adv.id);
                            setFeriasAteInput(adv.emFeriasAte || '');
                            setSubstitutoInput(adv.advogadoSubstituto || '');
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 cursor-pointer"
                      >
                        Férias
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoverAdvogado(adv.id)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {editandoFeriasId === adv.id && (
                    <div className="grid grid-cols-12 gap-2 pt-2 border-t border-slate-800">
                      <input
                        type="date"
                        value={feriasAteInput}
                        onChange={(e) => setFeriasAteInput(e.target.value)}
                        className="col-span-4 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-white"
                        title="Férias até"
                      />
                      <input
                        type="text"
                        value={substitutoInput}
                        onChange={(e) => setSubstitutoInput(e.target.value)}
                        placeholder="Advogado substituto (Nome/OAB)"
                        className="col-span-5 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-white"
                      />
                      <button
                        type="button"
                        disabled={salvandoFerias}
                        onClick={() => salvarFeriasAdvogado(adv.id)}
                        className="col-span-3 px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-[11px] cursor-pointer"
                      >
                        {salvandoFerias ? '...' : 'Salvar'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Clientes Monitorados */}
        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              Clientes Monitorados (Radar Corporativo)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Empresas salvas para monitoramento contínuo (ex: LG ELECTRONICS).
            </p>
          </div>

          <form onSubmit={onAdicionarCliente} className="grid grid-cols-12 gap-2">
            <input
              type="text"
              value={novoClienteNome}
              onChange={(e) => setNovoClienteNome(e.target.value)}
              placeholder="Razão Social / Nome (ex: LG ELECTRONICS)"
              className="col-span-6 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <input
              type="text"
              value={novoClienteCnpj}
              onChange={(e) => setNovoClienteCnpj(e.target.value)}
              placeholder="CNPJ (opcional)"
              className="col-span-4 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <button
              type="submit"
              className="col-span-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {clientesDb.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum cliente cadastrado ainda.</p>
            ) : (
              clientesDb.map((cli) => (
                <div
                  key={cli.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                >
                  <div>
                    <span className="text-white font-medium">{cli.nome}</span>
                    {cli.cnpjs && (
                      <span className="ml-2 font-mono text-slate-400">{cli.cnpjs}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoverCliente(cli.id)}
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Issue #73: Portal do Cliente White-Label + Diagnóstico Pool Multi-IA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gerador Visual de Portal do Cliente (#25 / #62 / #73) */}
        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Link2 className="w-4 h-4 text-cyan-400" />
              Portal do Cliente White-Label (#25 / #73)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Gere um link temporário restrito para o jurídico interno do cliente acompanhar processos e prazos.
            </p>
          </div>

          <form onSubmit={gerarLinkPortalCliente} className="space-y-3 text-xs">
            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                list="lista-clientes-portal"
                value={portalClienteEscopo}
                onChange={(e) => setPortalClienteEscopo(e.target.value)}
                placeholder={clientesDb[0]?.nome || 'Nome do cliente (ex: LG ELECTRONICS)'}
                className="col-span-7 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
              />
              <datalist id="lista-clientes-portal">
                {clientesDb.map((c) => (
                  <option key={c.id} value={c.nome} />
                ))}
              </datalist>
              <select
                value={portalHorasValidade}
                onChange={(e) => setPortalHorasValidade(Number(e.target.value))}
                className="col-span-5 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
              >
                <option value={24}>Validade: 24 horas</option>
                <option value={48}>Validade: 48 horas</option>
                <option value={168}>Validade: 7 dias</option>
                <option value={720}>Validade: 30 dias</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={portalAnonimizarLgpd}
                  onChange={(e) => setPortalAnonimizarLgpd(e.target.checked)}
                  className="rounded border-slate-700"
                />
                Anonimizar CPFs / LGPD (#62)
              </label>

              <button
                type="submit"
                disabled={gerandoPortal}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold cursor-pointer"
              >
                {gerandoPortal ? 'Gerando...' : 'Gerar Link do Portal'}
              </button>
            </div>
          </form>

          {linkPortalGerado && (
            <div className="p-3 rounded-xl bg-slate-950 border border-cyan-500/30 text-xs space-y-1.5">
              <p className="text-cyan-300 font-semibold">
                ✓ Link copiado para a área de transferência:
              </p>
              <a
                href={linkPortalGerado}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-indigo-300 hover:underline break-all inline-flex items-center gap-1"
              >
                {linkPortalGerado} <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          )}
        </div>

        {/* Card de Diagnóstico do Pool Multi-IA (#67 / #73) */}
        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Pool Multi-IA Gratuito &amp; Failover (#67 / #73)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Provedores configurados no <code className="text-indigo-300">.env</code> com rotação automática em HTTP 429.
              </p>
            </div>
            <button
              type="button"
              onClick={carregarStatusIa}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {statusIa ? (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold">
                  Ativo: {statusIa.provedorAtivo}
                  {statusIa.modeloAtivo ? ` (${statusIa.modeloAtivo})` : ''}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                  Provedores: <strong>{statusIa.totalProvedoresConfigurados ?? 0}</strong> • Slots:{' '}
                  <strong>
                    {statusIa.slotsDisponiveisAgora ?? 0}/{statusIa.totalSlotsConfigurados ?? 0}
                  </strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                  Failovers: <strong>{statusIa.totalFailovers ?? 0}</strong>
                </span>
              </div>

              {statusIa.slots && statusIa.slots.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {statusIa.slots.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
                    >
                      <span className="font-mono text-slate-200 truncate pr-2">
                        {s.provedor} • {s.modelo}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-semibold shrink-0 ${
                          s.status === 'DISPONIVEL'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {s.status === 'DISPONIVEL'
                          ? 'DISPONÍVEL'
                          : `COOLDOWN (${s.cooldownSegundosRestantes}s)`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-amber-300/90 text-[11px] bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  Nenhuma chave de IA configurada ainda — rodando em <strong>Heurística Local</strong>.
                  Adicione chaves gratuitas no <code>.env</code> (veja <code>.env.example</code>) para ativar o ciclo Multi-IA.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Carregando diagnóstico de IA...</p>
          )}
        </div>
      </div>

      {/* Worker / Cron Radar 24/7 (Issue #7) */}
      <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Radar 24/7 — Varredura Automática (Worker / Cron)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Varre todos os Clientes Monitorados e OABs salvas via{' '}
              <code className="text-amber-300">GET/POST /api/cron/radar</code>.
            </p>
          </div>
          <button
            type="button"
            disabled={rodandoCron}
            onClick={onDispararVarredura}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs flex items-center gap-2 transition cursor-pointer"
          >
            {rodandoCron ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Varrendo Tribunais...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Disparar Varredura Agora
              </>
            )}
          </button>
        </div>

        {execucoesRadar.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {execucoesRadar.map((ex) => (
              <div
                key={ex.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[10px]">
                    {ex.origem}
                  </span>
                  <span className="text-emerald-400 font-semibold">{ex.status}</span>
                  <span className="text-slate-300">
                    {ex.clientesVarredura} clientes • {ex.oabsVarredura} OABs →{' '}
                    <strong>{ex.publicacoesEncontradas}</strong> pub. /{' '}
                    <strong>{ex.processosSalvos}</strong> proc.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {ex.alertasAlta > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                      {ex.alertasAlta} alta urgência
                    </span>
                  )}
                  <span className="text-slate-500 font-mono text-[11px]">
                    {new Date(ex.iniciadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhooks + Logs de Entrega (#73) & App Mobile JWT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Webhooks de Alerta Imediato (WhatsApp / Push / Slack)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Disparados automaticamente sempre que surgir urgência <strong>ALTA</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={carregarLogsWebhook}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 cursor-pointer shrink-0"
            >
              {carregandoLogs ? 'Carregando...' : 'Ver Logs (#73)'}
            </button>
          </div>

          <form onSubmit={onAdicionarWebhook} className="grid grid-cols-12 gap-2">
            <input
              type="text"
              value={novoWebhookNome}
              onChange={(e) => setNovoWebhookNome(e.target.value)}
              placeholder="Nome (ex: WhatsApp Sócio)"
              className="col-span-4 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <select
              value={novoWebhookCanal}
              onChange={(e) => setNovoWebhookCanal(e.target.value)}
              className="col-span-3 px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            >
              <option value="WHATSAPP">WhatsApp</option>
              <option value="PUSH">Push Mobile</option>
              <option value="SLACK">Slack</option>
              <option value="WEBHOOK">HTTP POST</option>
            </select>
            <input
              type="url"
              value={novoWebhookUrl}
              onChange={(e) => setNovoWebhookUrl(e.target.value)}
              placeholder="https://..."
              className="col-span-3 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
            <button
              type="submit"
              className="col-span-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {webhooksDb.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum webhook cadastrado.</p>
            ) : (
              webhooksDb.map((wh) => (
                <div
                  key={wh.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono text-[10px] mr-2">
                      {wh.canal}
                    </span>
                    <span className="text-white font-medium">{wh.nome}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoverWebhook(wh.id)}
                    className="text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {mostrarLogs && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <p className="text-[11px] font-semibold text-slate-300">
                Histórico de Entregas de Webhook ({logsWebhook.length})
              </p>
              {logsWebhook.length === 0 ? (
                <p className="text-[11px] text-slate-500">Nenhuma entrega registrada ainda.</p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {logsWebhook.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px]"
                    >
                      <div className="truncate">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold mr-1.5 ${
                            log.sucesso
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {log.sucesso ? `OK ${log.httpStatus ?? 200}` : `ERRO ${log.httpStatus ?? ''}`}
                        </span>
                        <span className="text-slate-300">{log.canal}</span> •{' '}
                        <span className="text-slate-400">{log.evento}</span>
                      </div>
                      <span className="text-slate-500 font-mono shrink-0">
                        {new Date(log.criadoEm).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-400" />
                Autenticação JWT para App Mobile
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Gere um token Bearer HS256 via <code className="text-indigo-300">POST /api/auth/token</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={onGerarTokenJwt}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shrink-0"
            >
              Gerar JWT
            </button>
          </div>

          {tokenJwtGerado && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 break-all">
              Authorization: Bearer {tokenJwtGerado}
            </div>
          )}
        </div>
      </div>

      {/* Processos Persistidos no Banco */}
      <div className="bg-[#0f1628] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            Processos Persistidos Automaticamente no Banco ({processosDb.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/exportar/csv"
              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Planilha CSV / Sheets
            </a>
            <a
              href="/api/calendario/prazos.ics"
              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs text-indigo-200 flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5" /> Todos os Prazos (.ics)
            </a>
            <a
              href="/api/exportar/backup"
              className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-xs text-cyan-200 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Backup Zero Lock-in (#48)
            </a>
            <a
              href="/api/exportar/backup?lgpd=true"
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-xs text-purple-200 flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Backup LGPD Anonimizado (#62)
            </a>
            <button
              type="button"
              onClick={onVerificarSaude}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs text-amber-200 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verificandoSaude ? 'animate-spin' : ''}`} />
              Saúde dos Tribunais (#40/#50)
            </button>
            <button
              type="button"
              onClick={onRecarregarTudo}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar
            </button>
          </div>
        </div>

        {saudeTribunais.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            {saudeTribunais.map((st, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{st.servico}</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      st.status === 'ONLINE'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {st.status} ({st.latenciaMs}ms)
                  </span>
                </div>
                <a
                  href={st.urlCertidaoIndisponibilidade}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  Baixar Certidão de Indisponibilidade <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        )}

        {processosDb.length === 0 ? (
          <p className="text-xs text-slate-500">
            Nenhum processo salvo ainda. Ao disparar uma busca na aba Radar de Cliente, OAB ou Processo, as pastas são gravadas automaticamente no banco.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {processosDb.map((p) => (
              <div
                key={p.id}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold text-[10px]">
                    {p.siglaTribunal}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {p._count?.publicacoes || 0} pub. • {p._count?.documentos || 0} doc.
                  </span>
                </div>
                <p className="font-mono font-bold text-white">{p.numeroFormatado}</p>
                <p className="text-[11px] text-indigo-300">{p.ultimoStatusDetectado}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
