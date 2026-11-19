import { describe, expect, it, vi, afterEach } from 'vitest';
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
});
