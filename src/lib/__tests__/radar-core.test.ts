import { normalizarItensPorPaginaDjen } from '@/lib/djen';
import { extrairDocumentosValidosDoTexto } from '@/lib/indexador-partes';
import { detectarVinculosNoTexto, inferirGrauProcesso } from '@/lib/arvore-cross-grau';
import {
  calcularRiscoJudicializacao,
  normalizarCanalPreProcessual,
} from '@/lib/pre-processual';
import {
  assinarEventosTempoReal,
  publicarEventoTempoReal,
} from '@/lib/eventos-stream';
import { calcularAtualizacaoMonetaria } from '@/lib/atualizacao-monetaria';
import { calcularInfoQuota } from '@/lib/billing-quota';
import { detectarFalhaParcialShardsDatajud } from '@/lib/datajud';
import { gerarEventIdWebhook } from '@/lib/webhooks';
import {
  auditarAtrasoRemessaDjen,
  calcularInicioPrazoCitacaoDjeRes569,
} from '@/lib/auto-update';
import {
  deveBloquearLlmExternaPorSigilo,
  mascararDadosSensiveisPii,
  restaurarDadosSensiveisPii,
} from '@/lib/pii-vault';
import { avaliarRegraAutomacaoEmItem } from '@/lib/regras-automacao';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  calcularLimiteConfirmacaoDomicilio,
  calcularPrazoFatal,
  detectarMeroExpediente,
  detectarPautaJulgamento2Grau,
  detectarPrecedentesVinculantes,
  detectarRiscoGolpeAlvara,
  detectarTransitoEmJulgado,
  ehFeriadoForense,
  ehRecessoForenseArt220CPC,
  extrairHonorariosSucumbencia,
  extrairLinkAudienciaVirtual,
  gerarHashProvaCaptura,
  gerarMensagemWhatsAppCliente,
} from '@/lib/auto-update';
import {
  consolidarProcessosAutomaticamente,
  enriquecerComunicacao,
} from '@/lib/inteligencia';
import {
  ehIpPrivadoOuReservado,
  validarUrlTribunalPermitida,
} from '@/lib/seguranca';
import { resolverIndiceDatajud } from '@/lib/datajud';
import {
  assinarJwt,
  gerarHashSenha,
  verificarJwt,
  verificarSenha,
} from '@/lib/auth-jwt';
import {
  executarChamadaMultiIA,
  montarPoolSlotsIA,
  obterStatusPoolIA,
  resetarEstadoPoolIA,
} from '@/lib/ia-router';
import {
  gerarHashContextoIA,
  limparRuidoContextoJuridico,
} from '@/lib/ia-cache';
import { anonimizarTextoJuridicoLgpd } from '@/lib/memoria-coletiva';
import { gerarHashApiKey, gerarNovaApiKeyBruta } from '@/lib/tenant';
import { gerarEspecificacaoOpenApi } from '@/lib/openapi-spec';
import type { ComunicacaoCNJ } from '@/types/juridico';

describe('Calendário Forense & Auto-Update (auto-update.ts)', () => {
  it('identifica corretamente o Recesso Forense do Art. 220 do CPC (20/12 a 20/01)', () => {
    expect(ehRecessoForenseArt220CPC(new Date(Date.UTC(2026, 11, 19)))).toBe(false);
    expect(ehRecessoForenseArt220CPC(new Date(Date.UTC(2026, 11, 20)))).toBe(true);
    expect(ehRecessoForenseArt220CPC(new Date(Date.UTC(2027, 0, 20)))).toBe(true);
    expect(ehRecessoForenseArt220CPC(new Date(Date.UTC(2027, 0, 21)))).toBe(false);
  });

  it('reconhece feriados forenses nacionais e estaduais por tribunal', () => {
    expect(ehFeriadoForense(new Date(Date.UTC(2026, 11, 8)), 'TJSP')).toBe(true); // 08/12 Dia da Justiça
    expect(ehFeriadoForense(new Date(Date.UTC(2026, 8, 20)), 'TRT4')).toBe(true); // 20/09 RS
    expect(ehFeriadoForense(new Date(Date.UTC(2026, 8, 20)), 'TJSP')).toBe(false);
    expect(ehFeriadoForense(new Date(Date.UTC(2026, 6, 9)), 'TJSP')).toBe(true); // 09/07 SP
  });

  it('calcula prazo fatal pulando recesso forense e gera prazo interno D-2', () => {
    // Disponibilização em 18/12/2026 (sexta): publicação pula recesso (20/12-20/01) -> 21/01/2027 (quinta)
    // + 5 dias úteis: 22, 25, 26, 27, 28/01/2027
    const res = calcularPrazoFatal('2026-12-18', '5 dias', 'TJRS');
    expect(res).toBeDefined();
    expect(res?.dataFatalFormatada).toBe('28/01/2027');
    expect(res?.prazoInternoD2Formatado).toBe('26/01/2027');
  });

  it('calcula limite de 3 dias úteis do Domicílio Judicial Eletrônico (Res. CNJ 455)', () => {
    const limite = calcularLimiteConfirmacaoDomicilio('2026-08-10', 'TJSP'); // 11/08 é feriado forense!
    expect(limite).toBe('14/08/2026');
  });

  it('gera hash SHA-256 criptográfico real com 64 dígitos hexadecimais', () => {
    const h1 = gerarHashProvaCaptura('50099269520204047201', '2026-11-18', 'Intime-se a parte.');
    const h2 = gerarHashProvaCaptura('50099269520204047201', '2026-11-18', 'Intime-se a parte.');
    const h3 = gerarHashProvaCaptura('50099269520204047201', '2026-11-18', 'Outro texto.');
    expect(h1).toMatch(/^SHA256-[0-9A-F]{64}$/);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('extrai link de audiência virtual, honorários, precedentes e risco de golpe do alvará', () => {
    expect(
      extrairLinkAudienciaVirtual('Audiência telepresencial pelo link https://us02web.zoom.us/j/123456789.')
    ).toBe('https://us02web.zoom.us/j/123456789');
    expect(extrairHonorariosSucumbencia('Condeno em honorários advocatícios de 15% sobre a condenação.')).toContain('15%');
    expect(detectarRiscoGolpeAlvara('Expeça-se alvará para levantamento de valores.')).toBe(true);
    expect(detectarTransitoEmJulgado('Certifico o trânsito em julgado da sentença.')).toBe(true);
    expect(detectarPautaJulgamento2Grau('Processo incluído em pauta de julgamento da 3ª Turma.')).toBe(true);
    expect(detectarPrecedentesVinculantes('Aplica-se a Súmula 331 do TST e Tema 1046 do STF.')).toHaveLength(2);
    expect(detectarMeroExpediente('Certidão de juntada de documentos aos autos.', 'NORMAL')).toBe(true);

    const msg = gerarMensagemWhatsAppCliente({
      numeroProcesso: '5009926-95.2020.4.04.7201',
      tribunal: 'TRF4',
      tipoAtoDetectado: 'Alvará',
      riscoGolpeAlvara: true,
      ehMeroExpediente: false,
    });
    expect(msg).toContain('ALERTA ANTI-GOLPE');
    expect(msg).toContain('#7201');
  });
});

describe('Motor de Inteligência & Concorrência (inteligencia.ts)', () => {
  const baseComunicacao: ComunicacaoCNJ = {
    id: 1001,
    data_disponibilizacao: '2026-11-18',
    siglaTribunal: 'TRT4',
    meio: 'D',
    tipoComunicacao: 'Intimação',
    nomeOrgao: '1ª Vara do Trabalho de Porto Alegre',
    texto: 'Intime-se a reclamada para manifestação no prazo de 5 dias sobre bloqueio Sisbajud de R$ 15.000,00.',
    numero_processo: '00201234520255040001',
    numeroprocessocommascara: '0020123-45.2025.5.04.0001',
    nomeClasse: 'Ação Trabalhista',
    destinatarios: [{ nome: 'LG ELECTRONICS DO BRASIL LTDA', polo: 'P' }],
    destinatarioadvogados: [
      { advogado: { nome: 'Dr. Fulano', numero_oab: '12345', uf_oab: 'RS' } },
    ],
  };

  it('classifica processo como NOSSO_ESCRITORIO quando OAB coincide e consolida pasta', () => {
    const enr = enriquecerComunicacao(baseComunicacao, ['12345RS']);
    expect(enr.inteligencia.statusConcorrencia).toBe('NOSSO_ESCRITORIO');
    expect(enr.inteligencia.alertasAutomaticos.urgencia).toBe('ALTA');

    const pastas = consolidarProcessosAutomaticamente([enr]);
    expect(pastas).toHaveLength(1);
    expect(pastas[0].statusConcorrencia).toBe('NOSSO_ESCRITORIO');
  });

  it('classifica processo como ESCRITORIO_CONCORRENTE quando apenas outro advogado atua', () => {
    const enr = enriquecerComunicacao(baseComunicacao, ['99999SP']);
    expect(enr.inteligencia.statusConcorrencia).toBe('ESCRITORIO_CONCORRENTE');
  });

  it('classifica processo como SEM_ADVOGADO_CADASTRADO quando não há advogados', () => {
    const semAdv: ComunicacaoCNJ = { ...baseComunicacao, destinatarioadvogados: [] };
    const enr = enriquecerComunicacao(semAdv, ['12345RS']);
    expect(enr.inteligencia.statusConcorrencia).toBe('SEM_ADVOGADO_CADASTRADO');
  });
});

describe('Segurança Anti-SSRF, Datajud & JWT RBAC', () => {
  it('bloqueia IPs privados/loopback/metadata e URLs fora de *.jus.br', () => {
    expect(ehIpPrivadoOuReservado('127.0.0.1')).toBe(true);
    expect(ehIpPrivadoOuReservado('169.254.169.254')).toBe(true);
    expect(ehIpPrivadoOuReservado('10.0.0.5')).toBe(true);
    expect(ehIpPrivadoOuReservado('192.168.0.10')).toBe(true);
    expect(ehIpPrivadoOuReservado('::1')).toBe(true);
    expect(ehIpPrivadoOuReservado('8.8.8.8')).toBe(false);

    expect(
      validarUrlTribunalPermitida('https://pje.trt4.jus.br/pjekz/validacao/123?instancia=1').valida
    ).toBe(true);
    expect(validarUrlTribunalPermitida('http://127.0.0.1:3000/api/processos').valida).toBe(false);
    expect(validarUrlTribunalPermitida('https://evil.example.com/pje').valida).toBe(false);
  });

  it('resolve corretamente o índice Datajud a partir da sigla ou número CNJ', () => {
    expect(resolverIndiceDatajud('50099269520204047201', 'JFRS')).toBe('api_publica_trf4');
    expect(resolverIndiceDatajud('00201234520255040001')).toBe('api_publica_trt4');
    expect(resolverIndiceDatajud('50012345620258210001')).toBe('api_publica_tjrs');
    expect(resolverIndiceDatajud('07012345620258070001')).toBe('api_publica_tjdft');
  });

  it('assina e valida JWT HS256 com perfil RBAC e rejeita token adulterado', () => {
    const token = assinarJwt({
      sub: 'socio@escritorio.com.br',
      nome: 'Dr. Sócio',
      perfil: 'SOCIO',
      organizacao: 'Banca Teste',
    });
    const payload = verificarJwt(token);
    expect(payload?.perfil).toBe('SOCIO');
    expect(payload?.organizacao).toBe('Banca Teste');
    expect(verificarJwt(`${token}adulterado`)).toBeNull();
  });

  it('gera hash scrypt seguro com salt aleatório e valida senha corretamente (Issue #69)', () => {
    const h1 = gerarHashSenha('MinhaSenhaForte@2026');
    const h2 = gerarHashSenha('MinhaSenhaForte@2026');
    expect(h1).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(h1).not.toBe(h2); // Salt aleatório
    expect(verificarSenha('MinhaSenhaForte@2026', h1)).toBe(true);
    expect(verificarSenha('SenhaErrada', h1)).toBe(false);
  });
});

describe('Roteador Multi-IA Gratuito com Ciclo & Failover (ia-router.ts)', () => {
  beforeEach(() => {
    for (const k of [
      'GEMINI_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY',
      'NVIDIA_API_KEY', 'HUGGINGFACE_API_KEY', 'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN', 'COHERE_API_KEY', 'OLLAMA_BASE_URL', 'OPENAI_API_KEY',
      'IA_ORDEM_PROVEDORES',
    ]) {
      delete process.env[k];
    }
  });
  const envBackup = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    resetarEstadoPoolIA();
    process.env = { ...envBackup };
  });

  it('monta múltiplos slots a partir de chaves e modelos gratuitos no .env', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_teste_1';
    process.env.GROQ_MODELS = 'llama-3.3-70b-versatile,llama-3.1-8b-instant';
    process.env.OPENROUTER_API_KEY = 'sk-or-teste_1';
    process.env.OPENROUTER_MODELS = 'meta-llama/llama-3.3-70b-instruct:free';

    const slots = montarPoolSlotsIA();
    expect(slots.length).toBe(3);
    expect(slots[0].provedor).toBe('GROQ');
    expect(slots[2].provedor).toBe('OPENROUTER');
  });

  it('faz failover automático em HTTP 429, coloca slot em cooldown e avança no ciclo', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_teste_1';
    process.env.GROQ_MODELS = 'llama-3.3-70b-versatile';
    process.env.CEREBRAS_API_KEY = 'csk_teste_1';
    process.env.CEREBRAS_MODELS = 'llama-3.3-70b';

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'retry-after': '120' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Resposta gerada pelo Cerebras no failover.' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const res = await executarChamadaMultiIA({ prompt: 'Teste de failover' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res?.provedor).toBe('CEREBRAS');
    expect(res?.modo).toBe('LLM_CEREBRAS');
    expect(res?.tentativas).toBe(2);

    const status = obterStatusPoolIA();
    expect(status.totalFailovers).toBe(1);
    expect(status.slotsEmCooldown).toBe(1);
    expect(status.slotsDisponiveisAgora).toBe(1);
    expect(status.provedorAtivo).toBe('CEREBRAS');
  });

  it('distribui 3 chamadas simultâneas em paralelo para 3 provedores diferentes sem fila (Issue #76)', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_teste_1';
    process.env.GROQ_MODELS = 'llama-3.3-70b-versatile';
    process.env.CEREBRAS_API_KEY = 'csk_teste_1';
    process.env.CEREBRAS_MODELS = 'llama-3.3-70b';
    process.env.OPENROUTER_API_KEY = 'sk-or-teste_1';
    process.env.OPENROUTER_MODELS = 'meta-llama/llama-3.3-70b-instruct:free';

    const resolvers: Array<() => void> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(() =>
            resolve(
              new Response(
                JSON.stringify({ choices: [{ message: { content: 'OK paralelo' } }] }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              )
            )
          );
        })
    );

    const p1 = executarChamadaMultiIA({ prompt: 'Cliente 1' });
    const p2 = executarChamadaMultiIA({ prompt: 'Cliente 2' });
    const p3 = executarChamadaMultiIA({ prompt: 'Cliente 3' });

    // Enquanto as 3 rodam simultaneamente, cada slot deve ter exatamente 1 em andamento
    const statusDurante = obterStatusPoolIA();
    expect(statusDurante.totalEmAndamentoAgora).toBe(3);

    resolvers.forEach((r) => r());
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    const provedoresUsados = new Set([r1?.provedor, r2?.provedor, r3?.provedor]);
    expect(provedoresUsados.size).toBe(3);
    expect(obterStatusPoolIA().totalEmAndamentoAgora).toBe(0);
  });

  it('limpa ruído jurídico (Context Pruning), gera hash SHA-256 e roteia LEVE vs FORTE (Issue #77)', async () => {
    const bruto = `
      Intime-se a ré para pagar R$ 25.000,00 em 5 dias.
      ==============================================
      Documento assinado eletronicamente por Juiz Fulano conforme Lei 11.419/2006.
      A autenticidade do documento pode ser conferida no site do tribunal usando CRC ABCD1234
      Código verificador: 9988776655
    `;
    const limpo = limparRuidoContextoJuridico(bruto);
    expect(limpo).toContain('Intime-se a ré para pagar R$ 25.000,00 em 5 dias.');
    expect(limpo).not.toContain('Documento assinado eletronicamente');
    expect(limpo).not.toContain('Código verificador');

    const h1 = gerarHashContextoIA('ANALISE_PUBLICACAO', 'Intime-se   a parte.');
    const h2 = gerarHashContextoIA('ANALISE_PUBLICACAO', 'intime-se a parte.');
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);

    // Roteamento LEVE vs FORTE no mesmo provedor
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_teste_1';
    process.env.GROQ_MODELS = 'llama-3.3-70b-versatile,llama-3.1-8b-instant';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const resLeve = await executarChamadaMultiIA({ prompt: 'Resumo', complexidade: 'LEVE' });
    expect(resLeve?.modelo).toBe('llama-3.1-8b-instant');

    const resForte = await executarChamadaMultiIA({ prompt: 'Minuta', complexidade: 'FORTE' });
    expect(resForte?.modelo).toBe('llama-3.3-70b-versatile');
  });
});

describe('Memória Coletiva LGPD (#78), Multi-Tenant API Keys (#79/#80) e OpenAPI (#80)', () => {
  it('anonimiza CPF, CNPJ, número CNJ, e-mail e OAB antes de salvar na Memória Coletiva (#78)', () => {
    const texto =
      'Processo 5009926-95.2020.4.04.7201 do cliente CPF 123.456.789-00 e CNPJ 12.345.678/0001-99, advogado OAB/RS 54321, contato teste@banca.com.br.';
    const anon = anonimizarTextoJuridicoLgpd(texto);
    expect(anon).not.toContain('5009926-95.2020.4.04.7201');
    expect(anon).not.toContain('123.456.789-00');
    expect(anon).not.toContain('12.345.678/0001-99');
    expect(anon).not.toContain('teste@banca.com.br');
    expect(anon).not.toContain('54321');
    expect(anon).toContain('[PROCESSO_OCULTO]');
    expect(anon).toContain('[CPF_OCULTO]');
    expect(anon).toContain('[CNPJ_OCULTO]');
  });

  it('gera API Key B2B com prefixo seguro e hash SHA-256 determinístico (#79/#80)', () => {
    const { chaveBruta, prefixo, chaveHash } = gerarNovaApiKeyBruta();
    expect(chaveBruta.startsWith('rk_live_')).toBe(true);
    expect(prefixo).toBe(chaveBruta.slice(0, 16));
    expect(chaveHash).toMatch(/^[0-9a-f]{64}$/);
    expect(gerarHashApiKey(chaveBruta)).toBe(chaveHash);
  });

  it('gera especificação OpenAPI 3.1 válida cobrindo os endpoints principais (#80)', () => {
    const spec = gerarEspecificacaoOpenApi('https://api.radarjuridico.com.br');
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/api/publicacoes']).toBeDefined();
    expect(spec.paths['/api/ia/memoria-coletiva']).toBeDefined();
    expect(spec.paths['/api/api-keys']).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(20);
  });
});


describe('Fase 13 — Blindagem DJEN/Datajud, Webhooks Replay, Res. CNJ 569/2024, PII Vault & Regras No-Code (#81-#90)', () => {
  it('trava itensPorPagina do DJEN em no máximo 50 itens (#81)', () => {
    expect(normalizarItensPorPaginaDjen(200)).toBe(50);
    expect(normalizarItensPorPaginaDjen('100')).toBe(50);
    expect(normalizarItensPorPaginaDjen('15')).toBe(15);
    expect(normalizarItensPorPaginaDjen(undefined)).toBe(25);
  });

  it('detecta falha silenciosa de shards no Elasticsearch do Datajud (_shards.failed > 0) (#82)', () => {
    expect(detectarFalhaParcialShardsDatajud({ _shards: { total: 5, successful: 3, failed: 2 } })).toEqual({
      parcial: true,
      falhos: 2,
      total: 5,
    });
    expect(detectarFalhaParcialShardsDatajud({ _shards: { total: 5, successful: 5, failed: 0 } })).toEqual({
      parcial: false,
      falhos: 0,
      total: 5,
    });
  });

  it('gera X-Radar-Event-Id determinístico para idempotência de webhooks (#83)', () => {
    const id1 = gerarEventIdWebhook('ALERTA_URGENCIA_ALTA', '{"proc":"123"}');
    const id2 = gerarEventIdWebhook('ALERTA_URGENCIA_ALTA', '{"proc":"123"}');
    const id3 = gerarEventIdWebhook('ALERTA_URGENCIA_ALTA', '{"proc":"456"}');
    expect(id1).toMatch(/^evt_[0-9a-f]{24}$/);
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });

  it('calcula regra dos 5 dias úteis pós-confirmação DJE e audita atraso de remessa PJe vs DJEN (Res. CNJ 569/2024 - #85)', () => {
    const res569 = calcularInicioPrazoCitacaoDjeRes569('2026-08-03', 15, 'TJRS');
    expect(res569?.dataInicioContagem).toBe('10/08/2026');
    expect(res569?.regraAplicada).toContain('Res. CNJ 569/2024');

    const atraso = auditarAtrasoRemessaDjen('2026-11-10', '2026-11-14');
    expect(atraso?.diasAtrasoRemessa).toBe(4);
    expect(atraso?.alertaAtraso).toContain('Atraso de 4 dia(s)');
  });

  it('mascara e restaura CPF/CNPJ/e-mail no PII Vault e bloqueia LLM externa em Segredo de Justiça (#88)', () => {
    const original = 'O autor CPF 111.222.333-44 e ré CNPJ 12.345.678/0001-99 (contato@empresa.com.br) firmaram acordo.';
    const { textoMascarado, mapaReversao, totalMascarados } = mascararDadosSensiveisPii(original);
    expect(totalMascarados).toBe(3);
    expect(textoMascarado).not.toContain('111.222.333-44');
    expect(textoMascarado).not.toContain('12.345.678/0001-99');
    expect(textoMascarado).not.toContain('contato@empresa.com.br');
    expect(textoMascarado).toContain('[CPF_PII_1]');
    expect(textoMascarado).toContain('[CNPJ_PII_1]');
    expect(textoMascarado).toContain('[EMAIL_PII_1]');

    const restaurado = restaurarDadosSensiveisPii(
      'Resumo: acordo entre [CPF_PII_1] e [CNPJ_PII_1] ([EMAIL_PII_1]).',
      mapaReversao
    );
    expect(restaurado).toBe(
      'Resumo: acordo entre 111.222.333-44 e 12.345.678/0001-99 (contato@empresa.com.br).'
    );

    expect(deveBloquearLlmExternaPorSigilo(1, 'Despacho comum')).toBe(true);
    expect(deveBloquearLlmExternaPorSigilo(0, 'Processo em segredo de justiça')).toBe(true);
    expect(deveBloquearLlmExternaPorSigilo(0, 'Despacho público normal')).toBe(false);
  });

  it('avalia corretamente regras No-Code de automação por tribunal, valor e tipo de ato (#90)', () => {
    const regra = {
      condTribunal: 'TRT4',
      condValorMinRS: 50000,
      condTipoAto: 'Sentença',
      condUrgencia: 'ALTA',
    };
    expect(
      avaliarRegraAutomacaoEmItem(regra, {
        tribunal: 'TRT4',
        valorRS: 80000,
        tipoAto: 'Sentença Condenatória',
        urgencia: 'ALTA',
        statusConcorrencia: 'NOSSO_ESCRITORIO',
      })
    ).toBe(true);
    expect(
      avaliarRegraAutomacaoEmItem(regra, {
        tribunal: 'TRT4',
        valorRS: 12000,
        tipoAto: 'Sentença Condenatória',
        urgencia: 'ALTA',
        statusConcorrencia: 'NOSSO_ESCRITORIO',
      })
    ).toBe(false);
  });
});

import {
  validarCpf,
  validarCnpj,
  validarNumeroCnjMod97,
  normalizarPoloCanonico,
} from '@/lib/validadores';
import { analisarArvoreMovimentosTpu } from '@/lib/tpu-normalizer';
import {
  podeConsultarTribunal,
  registrarFalhaTribunal,
  registrarSucessoTribunal,
} from '@/lib/circuit-breaker';
import {
  gerarChaveDeduplicacaoAto,
  resolverPrevalenciaTema1180STJ,
} from '@/lib/deduplicacao';
import {
  calcularDomingoPascoaUtc,
  obterFeriadosMoveisAno,
} from '@/lib/auto-update';

describe('Fase 14 & 15 — Engenharia B2B: Feriados Móveis, Prazo em Dobro, TPU CNJ, Tema 1.180, Circuit Breaker & Validadores', () => {
  it('calcula Páscoa e feriados móveis forenses e aplica prazo em dobro com memória de cálculo (#93, #107)', () => {
    const pascoa2026 = calcularDomingoPascoaUtc(2026);
    expect(pascoa2026.toISOString().slice(0, 10)).toBe('2026-04-05');
    const moveis = obterFeriadosMoveisAno(2026);
    expect(moveis.has('04-03')).toBe(true); // Sexta-Feira Santa 2026
    expect(moveis.has('06-04')).toBe(true); // Corpus Christi 2026

    const simples = calcularPrazoFatal('2026-06-01', '5 dias', 'TJSP');
    const dobro = calcularPrazoFatal('2026-06-01', '5 dias', 'TJSP', { prazoEmDobro: true });
    expect(simples?.memoriaCalculoPrazo?.diasContados).toBe(5);
    expect(dobro?.memoriaCalculoPrazo?.diasContados).toBe(10);
    expect(dobro?.memoriaCalculoPrazo?.prazoEmDobroAplicado).toBe(true);
    expect(dobro?.memoriaCalculoPrazo?.feriadosOuRecessoPulados).toContain('04/06/2026');
  });

  it('valida matematicamente CPF, CNPJ e CNJ Módulo 97 e normaliza Polo Canônico (#104)', () => {
    expect(validarNumeroCnjMod97('5009926-95.2020.4.04.7201')).toBe(true);
    expect(validarNumeroCnjMod97('5009926-00.2020.4.04.7201')).toBe(false);
    expect(validarCpf('111.111.111-11')).toBe(false);
    expect(validarCnpj('11.222.333/0001-81')).toBe(true);
    expect(validarCnpj('11.222.333/0001-00')).toBe(false);
    expect(normalizarPoloCanonico('A')).toBe('ATIVO');
    expect(normalizarPoloCanonico('Reclamado')).toBe('PASSIVO');
    expect(normalizarPoloCanonico('Terceiro Interessado')).toBe('TERCEIRO');
  });

  it('normaliza árvore TPU CNJ e detecta sobrestamento (11025) e mudança de classe (10966) (#102, #108)', () => {
    const resumo = analisarArvoreMovimentosTpu([
      {
        codigo: 11025,
        nome: 'Suspensão ou Sobrestamento por Tema 1046 do STF',
        dataHora: '2026-11-10T10:00:00Z',
      },
      {
        codigo: 10966,
        nome: 'Mudança de Classe Processual',
        dataHora: '2026-10-01T10:00:00Z',
      },
    ]);
    expect(resumo.marcoCanonicoAtual).toBe('SOBRESTAMENTO');
    expect(resumo.sobrestado).toBe(true);
    expect(resumo.temaSobrestamento).toMatch(/Tema 1046/i);
    expect(resumo.mudancaClasseDetectada).toBe(true);
  });

  it('abre Circuit Breaker após 3 falhas consecutivas e fecha após sucesso (#103)', () => {
    const chave = 'datajud:api_publica_teste';
    registrarSucessoTribunal(chave);
    expect(podeConsultarTribunal(chave).permitido).toBe(true);
    registrarFalhaTribunal(chave, 'timeout');
    registrarFalhaTribunal(chave, 'timeout');
    registrarFalhaTribunal(chave, 'timeout');
    expect(podeConsultarTribunal(chave).permitido).toBe(false);
    registrarSucessoTribunal(chave);
    expect(podeConsultarTribunal(chave).permitido).toBe(true);
  });

  it('gera chave de deduplicação e aplica prevalência do Tema 1.180 STJ (#101)', () => {
    const k1 = gerarChaveDeduplicacaoAto('5009926-95.2020.4.04.7201', '2026-11-18', 'Intime-se a parte.');
    const k2 = gerarChaveDeduplicacaoAto('50099269520204047201', '2026-11-18', 'intime-se   a parte.');
    expect(k1).toBe(k2);
    const tema = resolverPrevalenciaTema1180STJ({ houveIntimacaoPortal: true });
    expect(tema.fontePrevalente).toBe('PORTAL_ELETRONICO');
    expect(tema.prazoCienciaTacitaDiasCorridos).toBe(10);
  });
});

describe('Fase 14 — Indexação CPF/CNPJ, Cross-Grau, Pré-Processual, SSE, SELIC & Quota (#91, #92, #95, #97, #98, #99)', () => {
  it('extrai apenas CPFs e CNPJs matematicamente válidos de texto jurídico (#91)', () => {
    const docs = extrairDocumentosValidosDoTexto(
      'Réu CNPJ 00.000.000/0001-91 e inválido 11.111.111/1111-11 e CPF inválido 123.456.789-00.'
    );
    expect(docs).toEqual([{ documento: '00000000000191', tipoDocumento: 'CNPJ' }]);
  });

  it('detecta vínculos cross-grau (Agravo / Originário / Cumprimento) e infere grau (#92)', () => {
    expect(inferirGrauProcesso('STJ', 'Recurso Especial')).toBe('SUP');
    expect(inferirGrauProcesso('TJRS', 'Agravo de Instrumento')).toBe('G2');
    const vinculos = detectarVinculosNoTexto(
      '5001111-22.2025.8.21.0000',
      'Trata-se de Agravo de Instrumento contra decisão proferida no processo originário 5009926-95.2020.4.04.7201.',
      'TJRS'
    );
    expect(vinculos.length).toBe(1);
    expect(vinculos[0].tipoVinculo).toBe('ORIGINARIO');
    expect(vinculos[0].numeroOrigem).toBe('50099269520204047201');
  });

  it('classifica risco de judicialização em reclamações pré-processuais (#95)', () => {
    expect(normalizarCanalPreProcessual('consumidor.gov.br')).toBe('CONSUMIDOR_GOV');
    const riscoAlto = calcularRiscoJudicializacao({
      canal: 'PROCON',
      assunto: 'Negativação indevida Serasa',
      descricao: 'Consumidor ameaça ingressar com ação judicial por danos morais.',
      valorPleiteado: 15000,
    });
    expect(riscoAlto).toBe('ALTO');
  });

  it('publica e entrega eventos em tempo real para assinantes SSE (#97)', () => {
    const recebidos: string[] = [];
    const cancelar = assinarEventosTempoReal((ev) => recebidos.push(ev.tipo));
    publicarEventoTempoReal({
      tipo: 'ALERTA_URGENCIA_ALTA',
      dados: { numeroProcesso: '123' },
    });
    cancelar();
    expect(recebidos).toContain('ALERTA_URGENCIA_ALTA');
  });

  it('calcula atualização monetária pela ADC 58 STF (IPCA-E pré + SELIC judicial) (#98)', () => {
    const calc = calcularAtualizacaoMonetaria({
      valorOriginal: 10000,
      dataInicial: '2024-01-01',
      dataCitacao: '2024-07-01',
      dataFinal: '2024-12-01',
      regime: 'ADC_58_STF',
      multaArt523Cpc: true,
      honorariosSucumbenciaPct: 10,
    });
    expect(calc.mesesComputados).toBe(12);
    expect(calc.memoriaMensal[0].fase).toBe('PRE_JUDICIAL');
    expect(calc.memoriaMensal[6].fase).toBe('JUDICIAL');
    expect(calc.valorAtualizadoTotal).toBeGreaterThan(12000);
    expect(calc.multaArt523Valor).toBeGreaterThan(0);
    expect(calc.honorariosValor).toBeGreaterThan(0);
  });

  it('calcula headers X-Quota-* e custo excedente Pay-as-you-go (#99)', () => {
    const info = calcularInfoQuota({
      plano: 'PAY_AS_YOU_GO',
      limiteMensal: 500,
      usoMesAtual: 600,
      payAsYouGoAtivo: true,
      precoExcedenteCentavos: 5,
    });
    expect(info.restante).toBe(0);
    expect(info.excedenteReqs).toBe(100);
    expect(info.custoExcedenteBrl).toBe('5.00');
  });
});
