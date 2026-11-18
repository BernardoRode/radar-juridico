# Backlog de Issues (GitHub) — Radar Jurídico & API de Publicações

Este documento organiza todas as entregas do projeto em **Issues estruturadas** para serem criadas no GitHub e acompanhadas passo a passo.

---

## Fase 1: Motor de Captura & Fontes de Dados (Core API)

### Issue #1: [Core API] Busca Multi-Critério na API do Comunica PJe / DJEN (CNJ)
- **Status:** ✅ Concluído no MVP inicial (`GET /api/publicacoes`)
- **Objetivo:** Permitir buscas combinadas por OAB (`numeroOab` + `ufOab`), Nome do Advogado (`nomeAdvogado`), Nome da Parte/Cliente (`nomeParte`), Texto Livre/CNPJ (`texto`), Número do Processo (`numeroProcesso`), Tribunal (`siglaTribunal`) e Período (`dataInicio` / `dataFim`).

### Issue #2: [Inteligência] Detector de Concorrência e Processos Recém-Distribuídos
- **Status:** ✅ Concluído no MVP inicial ([src/lib/inteligencia.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/inteligencia.ts))
- **Objetivo:** Comparar a lista de advogados de cada publicação do cliente (ex: "LG") com as OABs do nosso escritório, classificando automaticamente em:
  - `NOSSO_ESCRITORIO`
  - `ESCRITORIO_CONCORRENTE`
  - `SEM_ADVOGADO_CADASTRADO` (processo novo antes da habilitação!)

### Issue #3: [Extrator de Documentos] Crawler de Inteiro Teor via Links de Validação do PJe e eproc
- **Status:** ⏳ Próximo Passo
- **Objetivo:** Quando uma publicação trouxer um link do PJe (`pjekz/validacao/...`) ou do eproc (`externo_controlador.php?acao=consulta_publica_documento...`), fazer o download automático do HTML/PDF original assinado pelo juiz e salvar o inteiro teor vinculado ao processo.

### Issue #4: [Datajud CNJ] Integração com a API Pública do Datajud para Capa e Andamentos
- **Status:** ⏳ Backlog
- **Objetivo:** Criar o conector para `https://api-publica.datajud.cnj.jus.br/api_publica_<tribunal>/_search` para buscar a árvore completa de movimentações (Tabelas Processuais Unificadas - TPU), assunto, classe, valor da causa e data exata da distribuição do processo.

---

## Fase 2: Banco de Dados & Auto-Atualização de Processos (Zero Trabalho Manual)

### Issue #5: [Database] Persistência com Prisma ORM + PostgreSQL / SQLite
- **Status:** ⏳ Próximo Passo
- **Objetivo:** Criar as tabelas:
  - `ClienteMonitorado` (ex: "LG", variações de razão social e CNPJs)
  - `AdvogadoEscritorio` (OABs do nosso escritório)
  - `Processo` (Pasta do processo auto-gerida)
  - `Publicacao` (Histórico de publicações e despachos do processo)
  - `DocumentoOriginal` (Arquivos/Textos extraídos dos links PJe/eproc)

### Issue #6: [Motor Auto-Update] Pipeline de Atualização Automática da Pasta do Processo
- **Status:** ⏳ Backlog (Protótipo em memória já funcional em `consolidarProcessosAutomaticamente`)
- **Objetivo:** Toda vez que uma publicação nova entrar no banco:
  - Se o processo não existir, criar a ficha automaticamente.
  - Se já existir, atualizar a fase processual (Citação, Audiência, Perícia, Sentença, Recurso, Execução/Penhora), calcular o prazo fatal e registrar o histórico sem intervenção humana.

---

## Fase 3: Automação em Background, Alertas & IA Jurídica

### Issue #7: [Worker / Cron] Monitoramento Automático Agendado (Radar 24/7)
- **Status:** ⏳ Backlog
- **Objetivo:** Criar um job agendado que varre periodicamente os clientes monitorados (ex: LG) e as OABs cadastradas, salvando novos processos e disparando alertas em tempo real.

### Issue #8: [IA Jurídica] Resumo Executivo e Auditoria da Concorrência com LLM
- **Status:** ⏳ Backlog
- **Objetivo:** Analisar o texto da publicação/decisão com IA para:
  - Resumir em 2 linhas o que o juiz determinou.
  - Em processos de `ESCRITORIO_CONCORRENTE`, apontar riscos ou falhas (ex: revelia, perda de prazo, condenação ou bloqueio Sisbajud) para que o nosso escritório possa abordar o cliente estrategicamente.

### Issue #9: [Webhooks & Mobile] Notificações Push / WhatsApp / App Mobile
- **Status:** ⏳ Backlog
- **Objetivo:** Preparar autenticação JWT nas rotas `/api/*` e webhooks para envio de alertas imediatos no celular do advogado quando surgir um alerta de `urgencia: ALTA`.
