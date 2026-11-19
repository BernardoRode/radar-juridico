/**
 * Issue #80: Especificação OpenAPI 3.1.0 completa da API REST do Radar Jurídico.
 */
export function gerarEspecificacaoOpenApi(baseUrl = 'http://localhost:3000') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Radar Jurídico — API de Inteligência & Publicações',
      version: '1.0.0',
      description:
        'API REST completa de monitoramento DJEN/CNJ, Datajud, extração de PDFs assinados PJe/eproc, Pool Multi-IA Gratuito, Memória Coletiva Anonimizada, Multi-Tenant SaaS e Portal do Cliente.',
    },
    servers: [{ url: baseUrl, description: 'Servidor Atual' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
    paths: {
      '/api/publicacoes': {
        get: {
          tags: ['Captura & Inteligência'],
          summary: 'Busca multi-critério no DJEN/CNJ com detecção de concorrência e prazos',
          parameters: [
            { name: 'nomeParte', in: 'query', schema: { type: 'string' }, description: 'Nome do cliente/parte (ex: LG ELECTRONICS)' },
            { name: 'numeroOab', in: 'query', schema: { type: 'string' }, description: 'Número da OAB' },
            { name: 'ufOab', in: 'query', schema: { type: 'string' }, description: 'UF da OAB (ex: RS)' },
            { name: 'numeroProcesso', in: 'query', schema: { type: 'string' }, description: 'Número CNJ do processo' },
            { name: 'siglaTribunal', in: 'query', schema: { type: 'string' }, description: 'Sigla do tribunal (ex: TRT4, TJRS, TJSP)' },
            { name: 'dataInicio', in: 'query', schema: { type: 'string' }, description: 'Data início YYYY-MM-DD' },
            { name: 'dataFim', in: 'query', schema: { type: 'string' }, description: 'Data fim YYYY-MM-DD' },
          ],
          responses: { '200': { description: 'Resumo, BI jurídico, pastas consolidadas e publicações' } },
        },
      },
      '/api/inspecionar-link': {
        post: {
          tags: ['Captura & Inteligência'],
          summary: 'Decodifica link PJe/eproc, valida assinatura ICP-Brasil e extrai texto/OCR do PDF',
          responses: { '200': { description: 'Metadados da assinatura digital e texto extraído' } },
        },
      },
      '/api/documentos/baixar': {
        get: {
          tags: ['Captura & Inteligência'],
          summary: 'Faz streaming do PDF original assinado pelo magistrado (com proteção anti-SSRF)',
          parameters: [{ name: 'url', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Arquivo application/pdf' } },
        },
      },
      '/api/datajud': {
        get: {
          tags: ['Captura & Inteligência'],
          summary: 'Consulta capa, assuntos TPU, movimentações e protocolo recente no Datajud CNJ (com cache L2)',
          parameters: [
            { name: 'numeroProcesso', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'siglaTribunal', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Dados completos do Datajud CNJ' } },
        },
      },
      '/api/ia/analisar': {
        post: {
          tags: ['Inteligência Artificial (Multi-IA)'],
          summary: 'Gera resumo executivo em 2 linhas, nível de risco e auditoria da concorrência (com Cache SHA-256)',
          responses: { '200': { description: 'Análise estruturada em JSON' } },
        },
      },
      '/api/ia/minuta': {
        post: {
          tags: ['Inteligência Artificial (Multi-IA)'],
          summary: 'Gera pré-minuta de petição usando publicação + PDF extraído + biblioteca anonimizada',
          responses: { '200': { description: 'Peça processual gerada' } },
        },
      },
      '/api/ia/chat-base': {
        post: {
          tags: ['Inteligência Artificial (Multi-IA)'],
          summary: 'Chat RAG sobre todos os processos, publicações e PDFs salvos na base',
          responses: { '200': { description: 'Resposta fundamentada com fontes citadas' } },
        },
      },
      '/api/ia/memoria-coletiva': {
        get: {
          tags: ['Inteligência Artificial (Multi-IA)'],
          summary: 'Lista estatísticas anonimizadas por Vara/Tribunal e modelos de minutas validadas (#78)',
          responses: { '200': { description: 'Resumo da memória coletiva anonimizada' } },
        },
        post: {
          tags: ['Inteligência Artificial (Multi-IA)'],
          summary: 'Salva uma minuta aprovada na Biblioteca Viva (100% anonimizada LGPD)',
          responses: { '200': { description: 'Modelo salvo na biblioteca coletiva' } },
        },
      },
      '/api/auth/register': {
        post: {
          tags: ['Autenticação & B2B'],
          summary: 'Cria organização + usuário (senha scrypt + cookie HttpOnly JWT)',
          responses: { '200': { description: 'Usuário autenticado e token JWT' } },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Autenticação & B2B'],
          summary: 'Autentica usuário por e-mail/senha e emite cookie HttpOnly + Bearer JWT',
          responses: { '200': { description: 'Sessão iniciada' } },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Autenticação & B2B'],
          summary: 'Retorna usuário autenticado e status de ENFORCE_AUTH',
          responses: { '200': { description: 'Dados da sessão atual' } },
        },
      },
      '/api/api-keys': {
        get: {
          tags: ['Autenticação & B2B'],
          summary: 'Lista API Keys B2B cadastradas e consumo mensal por cliente (#80)',
          responses: { '200': { description: 'Lista de chaves (apenas prefixo seguro)' } },
        },
        post: {
          tags: ['Autenticação & B2B'],
          summary: 'Gera nova API Key B2B (rk_live_...) vinculada à organização com limite mensal',
          responses: { '200': { description: 'Chave bruta exibida uma única vez + metadados' } },
        },
        delete: {
          tags: ['Autenticação & B2B'],
          summary: 'Revoga uma API Key B2B por id',
          parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Chave revogada' } },
        },
      },
      '/api/processos': {
        get: {
          tags: ['Operação & Banco'],
          summary: 'Lista pastas de processos persistidas (filtradas por organizacaoId quando autenticado)',
          responses: { '200': { description: 'Lista de processos' } },
        },
        patch: {
          tags: ['Operação & Banco'],
          summary: 'Atualiza baixa de prazo, homônimo ignorado, minuta pronta ou checklist de perícia',
          responses: { '200': { description: 'Processo atualizado' } },
        },
      },
      '/api/config/clientes': {
        get: { tags: ['Operação & Banco'], summary: 'Lista clientes monitorados', responses: { '200': { description: 'OK' } } },
        post: { tags: ['Operação & Banco'], summary: 'Cadastra cliente monitorado', responses: { '200': { description: 'OK' } } },
        delete: { tags: ['Operação & Banco'], summary: 'Remove cliente monitorado', responses: { '200': { description: 'OK' } } },
      },
      '/api/config/advogados': {
        get: { tags: ['Operação & Banco'], summary: 'Lista OABs do escritório', responses: { '200': { description: 'OK' } } },
        post: { tags: ['Operação & Banco'], summary: 'Cadastra OAB do escritório', responses: { '200': { description: 'OK' } } },
        patch: { tags: ['Operação & Banco'], summary: 'Atualiza férias e advogado substituto (#47)', responses: { '200': { description: 'OK' } } },
        delete: { tags: ['Operação & Banco'], summary: 'Remove OAB', responses: { '200': { description: 'OK' } } },
      },
      '/api/config/status': {
        get: {
          tags: ['Operação & Banco'],
          summary: 'Diagnóstico em tempo real do banco, Pool Multi-IA, integrações e segurança',
          responses: { '200': { description: 'Status detalhado do ambiente' } },
        },
      },
      '/api/webhooks': {
        get: { tags: ['Alertas, Crons & Exportação'], summary: 'Lista webhooks ou histórico de entregas (?logs=true)', responses: { '200': { description: 'OK' } } },
        post: { tags: ['Alertas, Crons & Exportação'], summary: 'Cadastra webhook de alerta crítico (anti-SSRF)', responses: { '200': { description: 'OK' } } },
        delete: { tags: ['Alertas, Crons & Exportação'], summary: 'Remove webhook', responses: { '200': { description: 'OK' } } },
      },
      '/api/compartilhar': {
        post: {
          tags: ['Alertas, Crons & Exportação'],
          summary: 'Gera link temporário assinado para Correspondente (48h) ou Portal do Cliente (com opção LGPD)',
          responses: { '200': { description: 'Token e URL relativa do portal' } },
        },
      },
      '/api/cron/radar': {
        get: { tags: ['Alertas, Crons & Exportação'], summary: 'Executa varredura 24/7 ou retorna histórico (?historico=true)', responses: { '200': { description: 'OK' } } },
      },
      '/api/digest': {
        get: { tags: ['Alertas, Crons & Exportação'], summary: 'Boletim matinal consolidado (08h) e visão por cliente', responses: { '200': { description: 'OK' } } },
      },
      '/api/saude-tribunais': {
        get: { tags: ['Alertas, Crons & Exportação'], summary: 'Health-check em tempo real DJEN / PJe / eproc + certidões', responses: { '200': { description: 'OK' } } },
      },
      '/api/calendario/prazos.ics': {
        get: { tags: ['Alertas, Crons & Exportação'], summary: 'Feed iCalendar (.ics) de prazos fatais', responses: { '200': { description: 'text/calendar' } } },
      },
      '/api/exportar/csv': {
        get: { tags: ['Alertas, Crons & Exportação'], summary: 'Exportação CSV para Excel / Google Sheets', responses: { '200': { description: 'text/csv' } } },
      },
      '/api/exportar/backup': {
        get: { tags: ['Alertas, Crons & Exportação'], summary: 'Backup completo JSON Zero Lock-in (com ?lgpd=true)', responses: { '200': { description: 'application/json' } } },
      },
    },
  };
}
