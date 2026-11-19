# AGENTS.md — Guia Oficial do Projeto Radar Jurídico & API de Publicações

Este arquivo define a visão de produto, regras de negócio, fontes de dados jurídicas, arquitetura técnica completa e o **Guia Passo a Passo de Setup para Qualquer Agente / Máquina (ex: Ambiente de Casa)**. Toda IA / Agente que iniciar uma conversa neste workspace deve seguir estas diretrizes.

---

## 0. 🚀 Guia Rápido para o Agente de Casa (Como Deixar o Ambiente 100% Funcional)

Se você é o Agente rodando na máquina de casa do usuário (ou em qualquer novo computador após `git clone` / `git pull`), siga **exatamente** estes 5 passos para subir o sistema sem erros:

### Passo 1: Atualizar o repositório e instalar pacotes
```bash
git pull origin main
npm install
```
*(No Windows/Antigravity, caso o sandbox bloqueie rede no `npm install`, execute com acesso à rede liberado / `BypassSandbox: true`).*

### Passo 2: Criar o arquivo `.env` na raiz do projeto
O arquivo `.env` e o banco local `prisma/dev.db` não vão para o Git por segurança (`.gitignore`). Crie o arquivo `.env` na raiz com o seguinte conteúdo mínimo:
```env
DATABASE_URL="file:./dev.db"

# Opcionais (o sistema já possui fallbacks inteligentes caso não sejam preenchidos):
# DATAJUD_API_KEY="cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
# GEMINI_API_KEY="sua-chave-gemini-opcional"
# OPENAI_API_KEY="sua-chave-openai-opcional"
# JWT_SECRET="segredo-jwt-para-app-mobile"
# CRON_SECRET="segredo-opcional-para-rota-cron"
# WEBHOOK_HMAC_SECRET="segredo-hmac-para-webhooks"
```

### Passo 3: Criar e sincronizar o Banco de Dados SQLite + Prisma Client
```bash
npx prisma db push
npx prisma generate
```
*(Isso criará automaticamente o arquivo `prisma/dev.db` com todas as 6 tabelas: `ClienteMonitorado`, `AdvogadoEscritorio`, `Processo`, `Publicacao`, `DocumentoOriginal`, `ExecucaoRadar` e `WebhookAlerta`).*

### Passo 4: Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```
O sistema estará acessível em **`http://localhost:3000`**.
> **⚠️ Regra Importante no Windows:** Não execute `npm run build` enquanto `npm run dev` estiver rodando no mesmo diretório, pois o processo do Next.js trava a DLL do Prisma (`query_engine-windows.dll.node`) e a pasta `.next`. Se precisar rodar `npm run build` ou `npx prisma generate`, pare o `npm run dev` antes e inicie-o novamente depois.

---

## 1. Visão do Produto & Diferenciais Competitivos
O **Radar Jurídico** não é apenas um buscador passivo de Diário Oficial. Ele é uma plataforma completa de **Inteligência Jurídica, Radar de Clientes, Auditoria de Concorrência, Jurimetria, Blindagem Contra Perda de Prazos e Auto-Gestão de Processos**.

### Problemas Reais que o Sistema Resolve (65 Issues Implementadas):
1. **Busca Multi-Critério (OAB + Radar de Cliente + Variações/CNPJ):**
   - Busca publicações pela **OAB / Nome do Advogado** (carteira própria do escritório).
   - Busca pelo **Nome da Empresa / Cliente** (`nomeParte`, variações de grafia e `texto`/CNPJ) — ex: `"LG ELECTRONICS"`.
2. **Inteligência Competitiva & Early Warning ("Um Passo à Frente"):**
   - Cruza automaticamente a lista de advogados retornada na publicação (`destinatarioadvogados`) com as **OABs do nosso escritório** salvas no SQLite (`AdvogadoEscritorio`).
   - Classifica cada processo em:
     - `NOSSO_ESCRITORIO`: Processo conduzido pela nossa banca.
     - `ESCRITORIO_CONCORRENTE`: Processo do cliente conduzido por outro escritório (audita revelias, bloqueios Sisbajud e falhas para abordagem estratégica).
     - `SEM_ADVOGADO_CADASTRADO`: Processo recém-distribuído onde o cliente ainda não habilitou advogado (alerta antecipado com cronômetro de **3 dias úteis da Res. CNJ 455 / Domicílio Judicial Eletrônico** para evitar multa de 5%!).
3. **Crawler de Inteiro Teor Assinado (PJe & eproc):**
   - Decodifica links `pjekz/validacao` do PJe, consulta a API pública oficial do tribunal (`/pje-comum-api/api/assinaturas2/validacao/<codigo>`), valida a assinatura digital ICP-Brasil (`assinadoPor`), baixa o PDF original e extrai todo o texto com `unpdf`.
   - Em links `eproc` (`consulta_publica_documento`), detecta automaticamente barreiras de verificação humana (Cloudflare Turnstile / CAPTCHA) sem tentar burlá-las, orientando a abertura direta no navegador.
4. **Auto-Atualização, Calendário Forense Real (Art. 220 CPC) e Dupla Checagem (`D-2`):**
   - Calcula automaticamente o **Prazo Fatal** pulando fins de semana, feriados nacionais/forenses (`11/08`, `08/12`, etc.), feriados estaduais por tribunal e o **Recesso Forense de 20/12 a 20/01 (Art. 220 do CPC)**.
   - Calcula o **Prazo Interno de Revisão (`D-2`)** da controladoria e exporta para **Google Calendar / Outlook (`.ics`)** e **Google Sheets / Excel (`.csv`)**.
5. **Escudo Anti-Golpe do Falso Advogado & Tradutor Juridiquês → WhatsApp:**
   - Gera mensagem em linguagem simples para o WhatsApp do cliente e, ao detectar **Alvará / Precatório / RPV**, insere alerta preventivo com **Código de Segurança (`#XXXX`)** para blindar o cliente contra o golpe do falso advogado.

---

## 2. Arquitetura Técnica & Mapa Completo de Arquivos

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS.
- **Banco de Dados:** Prisma ORM v6 + SQLite (`prisma/schema.prisma` -> `prisma/dev.db`).
- **Extração de PDF:** `unpdf` (serverless-ready, sem dependências nativas).

### Bibliotecas Core (`src/lib/`):
- `src/types/juridico.ts`: Tipagens completas do CNJ, Inteligência, Processos Auto-Geridos, Extração de PDF e Datajud.
- `src/lib/auto-update.ts`:
  - Classificador de Fase Processual (`Citação`, `Audiência`, `Perícia`, `Sentença`, `Recurso`, `Execução / Penhora`, `Andamento`).
  - Calculadora de Prazo Fatal com Calendário Forense Real (Art. 220 CPC + Feriados) e Prazo Interno `D-2`.
  - Cronômetro Anti-Multa de 3 dias úteis do Domicílio Judicial Eletrônico (Res. CNJ 455).
  - Filtro Anti-Ruído (`detectarMeroExpediente`), Extrator de Link de Audiência Virtual (`Zoom/Teams/Meet/Webex`), Extrator de Honorários de Sucumbência, Detector de Trânsito em Julgado, Pauta de 2º Grau, Checklist de Perícia, Súmulas/Temas Repetitivos, Teimosinha Sisbajud, Viabilidade de Acordo (Settlement Predictor), Hash SHA-256 de Prova de Captura e Gerador de Mensagem WhatsApp Anti-Golpe.
- `src/lib/inteligencia.ts`: Motor que enriquece cada comunicação do CNJ e consolida as pastas dos processos (`consolidarProcessosAutomaticamente`).
- `src/lib/crawler-documentos.ts`: Crawler de inteiro teor para links de validação do PJe (`pjekz/validacao`) e eproc.
- `src/lib/datajud.ts`: Conector da API Pública do Datajud (CNJ) com resolução automática de índice pelo número CNJ, cache em memória Anti-429 (30 min), persistência no SQLite e **Detecção Automática de Protocolo (Baixa Automática de Prazo)**.
- `src/lib/ia-juridica.ts`: Resumo executivo em 2 linhas, auditoria de falhas da concorrência (Gemini / OpenAI / Heurística Jurídica) e **Copiloto Gerador de Pré-Minutas** (Contestação/Manifestação, Impugnação Sisbajud, Quesitos de Perícia e **Arguição de Nulidade de Intimação / Devolução de Prazo — Art. 272 §5º CPC**).
- `src/lib/analytics-juridico.ts`: Motor de BI & Jurimetria (Provisionamento Financeiro Provável/Possível/Remoto, Benchmark SLA Nosso Escritório vs. Concorrência, Mapa de Calor por Tribunal, Jurimetria por Vara e Monitor de Autores Contumazes).
- `src/lib/prisma.ts` & `src/lib/persistencia.ts`: Singleton do Prisma e gravação automática de processos, publicações e documentos extraídos.
- `src/lib/radar-worker.ts`: Worker 24/7 que varre Clientes (incluindo variações de nome), OABs do escritório e Números CNJ dos nossos processos (blindagem contra omissão de OAB pela secretaria da Vara).
- `src/lib/auth-jwt.ts` & `src/lib/webhooks.ts`: Autenticação JWT HS256 para App Mobile e disparador de Webhooks com assinatura HMAC-SHA256 (`X-Radar-Signature`) e retry exponencial.

### Rotas da API REST (`src/app/api/`):
1. `GET /api/publicacoes`: Busca multi-critério no CNJ, aplica motor de inteligência, salva no SQLite e retorna `resumo`, `biJuridico`, `processosConsolidados` e `publicacoes`.
2. `POST /api/inspecionar-link`: Decodifica links PJe/eproc, extrai PDF assinado + texto do inteiro teor e salva em `DocumentoOriginal`.
3. `GET /api/documentos/baixar?url=...`: Faz streaming do PDF original assinado pelo magistrado (`application/pdf`).
4. `GET /api/datajud?numeroProcesso=...`: Consulta capa, assuntos TPU, data de ajuizamento e movimentações no Datajud CNJ (com cache Anti-429 e detecção de protocolo).
5. `POST /api/ia/analisar`: Gera resumo executivo em 2 linhas e auditoria estratégica da concorrência.
6. `POST /api/ia/minuta`: Gera pré-minuta de petição ou pedido de devolução de prazo (Art. 272 §5º CPC).
7. `POST /api/ia/chat-base`: Busca Semântica / Chat RAG sobre todos os processos, publicações e PDFs extraídos salvos no banco local.
8. `GET / POST /api/cron/radar`: Executa a varredura automática 24/7 (ou retorna histórico com `?historico=true`).
9. `GET / POST / DELETE /api/config/clientes`: CRUD de `ClienteMonitorado`.
10. `GET / POST / DELETE /api/config/advogados`: CRUD de `AdvogadoEscritorio` (OABs da nossa banca).
11. `GET /api/processos`: Lista as pastas de processos persistidas no SQLite.
12. `GET / POST / DELETE /api/webhooks`: CRUD e disparo de teste de Webhooks de alerta crítico (`WHATSAPP`, `PUSH`, `SLACK`, `WEBHOOK`).
13. `GET / POST /api/auth/token`: Emissão e validação de tokens JWT Bearer para App Mobile.
14. `GET /api/calendario/prazos.ics`: Feed iCalendar (`.ics`) para Google Calendar / Outlook / Apple Calendar.
15. `GET /api/exportar/csv`: Exportação de toda a carteira em CSV (compatível com Excel e `=IMPORTDATA()` no Google Sheets).
16. `GET /api/exportar/backup?lgpd=true|false`: Exportação portátil completa da base em JSON (Zero Vendor Lock-in) com opção de anonimização automática de CPFs pela LGPD.
17. `GET /api/saude-tribunais`: Health-check em tempo real da latência do DJEN/CNJ, PJe e eproc com links diretos para as certidões oficiais de indisponibilidade.
18. `GET /api/digest?cliente=...`: Boletim matinal consolidado (08h) e visão filtrada para Portal do Cliente.

---

## 3. Diretrizes Permanentes para Próximas Evoluções
1. **Automação Total (Zero Trabalho Manual):** O advogado nunca deve precisar cadastrar andamentos ou calcular prazos manualmente se a informação puder ser inferida da publicação, do PDF do PJe ou do Datajud.
2. **Respeito Estrito a Barreiras de Segurança:** Nunca tentar burlar CAPTCHAs (como Cloudflare Turnstile no eproc); sempre detectar a barreira e entregar o link direto para validação humana no navegador.
3. **Idioma:** Preservar **Português (pt-BR)** em toda a interface, regras de negócio e respostas de API.


---

## 4. Atualizações de Prontidão, Segurança, IA Real & CI (Novas Rotas e Testes)
- **Diagnóstico de Ambiente:** `GET /api/config/status` + barra visual [`PwaEStatusBanner`](src/components/PwaEStatusBanner.tsx) + `.env.example`.
- **IA Real & OCR Multimodal:** `POST /api/ia/minuta`, `POST /api/ia/chat-base` (RAG) e `crawler-documentos.ts` (OCR de PDFs escaneados) agora consomem `GEMINI_API_KEY` / `OPENAI_API_KEY` quando configurados, mantendo fallback seguro quando ausentes.
- **Persistência Operacional & Segurança:**
  - `PATCH /api/processos` (baixa de prazo, homônimo ignorado, check D-2, checklist perícia) e `PATCH /api/config/advogados` (férias e substituto).
  - Cache persistente L2 do Datajud (`CacheDatajud`), histórico de quedas (`LogSaudeTribunal`), logs de entrega (`LogEntregaWebhook`), proteção anti-SSRF (`src/lib/seguranca.ts`) e Rate Limiting (`src/lib/rate-limit.ts`).
  - Links temporários assinados (48h Correspondente & Portal do Cliente White-Label): `POST/GET /api/compartilhar` e página `/compartilhado/[token]`.
  - PWA completo com Service Worker (`public/sw.js`) e atalhos de teclado (`J`/`K`/`E`/`C`).
- **Qualidade & CI:** `npm test` (Vitest em `src/lib/__tests__/radar-core.test.ts` — 20 testes), `npm run typecheck` e `.github/workflows/ci.yml`.

---

## 5. 🏠 Handoff Exato para o Agente do PC de Casa (Estado Atual & Próximos Passos)

### O que já está 100% implementado e fechado no código (`#1`–`#65`, `#69`, `#71`, `#73`, `#75`, `#76`, `#77`, `#78`, `#79`, `#80`):
- **Pool Multi-IA Gratuito com Ciclo, Failover & Concorrência (`src/lib/ia-router.ts`):** suporta 10 provedores gratuitos (`GEMINI`, `GROQ`, `CEREBRAS`, `OPENROUTER`, `MISTRAL`, `NVIDIA`, `HUGGINGFACE`, `CLOUDFLARE`, `COHERE`, `OLLAMA` + `OPENAI`), distribuição paralela *Least-Loaded Round-Robin* (`#76`), cooldown automático em HTTP 429 e roteamento `LEVE` vs `FORTE`.
- **Economia de Tokens (`src/lib/ia-cache.ts` + `CacheAnaliseIA`):** Cache SHA-256 de análises/minutas e *Context Pruning* removendo ruídos do DJEN/PJe (`#77`).
- **Memória Coletiva Anonimizada LGPD (`src/lib/memoria-coletiva.ts` + `/api/ia/memoria-coletiva`):** `PerfilColetivoVara` e `ModeloMinutaValidada` sem nomes/CPFs/CNJs (`#78`).
- **Autenticação, Multi-Tenant SaaS & B2B (`#69`, `#79`, `#80`):**
  - Tabelas `Organizacao`, `Usuario`, `ApiKeyCliente` + `organizacaoId` nas tabelas operacionais (`src/lib/tenant.ts`).
  - Login/Registro com `scrypt` + JWT HS256 (`HttpOnly` + Bearer) em `/api/auth/register|login|logout|me`, página `/login` e `src/middleware.ts` Edge (respeitando `ENFORCE_AUTH="false"` em dev local).
  - Documentação OpenAPI 3.1 interativa em `/docs` (`/api/openapi.json`) e gestão de API Keys B2B (`rk_live_...`) em `/api/api-keys`.
- **Frontend Modular (`src/components/`):** `PainelCockpitKanban`, `PainelBiJurimetria`, `PainelFeedPublicacoes`, `PainelConfiguracoes`, `PainelB2BeMemoriaColetiva`, `PainelApiDocs` e `PwaEStatusBanner`.
- **Tribunais validados ao vivo (`#71`):** DJEN (`TRT4`, `TJRS`, `TJSP`), PJe TRT4, eproc TRF4 e Datajud TRF4 com Cache L2 funcionando.

### O que o Agente do PC de Casa deve fazer assim que o usuário abrir o projeto lá:
1. **Sincronizar ambiente local:**
   ```bash
   git pull origin main
   npm install
   npx prisma db push
   npx prisma generate
   npm test
   ```
2. **Atacar as únicas 3 issues locais pendentes (Custo R$ 0):**
   - **Issue #67 (Principal):** Ajudar o usuário a colar no `.env` as chaves gratuitas do Pool Multi-IA (ver lista completa e links no `.env.example`: Google AI Studio `GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`+`CLOUDFLARE_API_TOKEN`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `HUGGINGFACE_API_KEY`, `COHERE_API_KEY` ou `OLLAMA_BASE_URL`) e testar ao vivo `/api/ia/analisar`, `/api/ia/minuta`, `/api/ia/chat-base` e OCR de PDF.
   - **Issue #70:** Conectar ao menos 1 canal real gratuito de alerta (Slack Incoming Webhook, Resend Free ou Evolution API/n8n para WhatsApp) e validar na tabela `LogEntregaWebhook`.
   - **Issue #72:** Cadastrar as OABs reais do escritório (`AdvogadoEscritorio`) e clientes/CNPJs monitorados (`ClienteMonitorado`), disparar a primeira varredura real e confirmar `prontoParaUsoLocal: true` em `/api/config/status`.
3. **Issues estacionadas de propósito (NÃO executar ainda até o usuário decidir sair de teste):**
   - **#66** (PostgreSQL em nuvem), **#68** (Deploy Vercel + Crons 24/7 + `ENFORCE_AUTH="true"`) e **#74** (Upstash Redis + `pgvector`).
