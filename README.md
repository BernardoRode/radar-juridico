# ⚖️ Radar Jurídico — API de Publicações & Inteligência Jurídica

Plataforma completa e **API REST B2B** para monitoramento do **Diário de Justiça Eletrônico Nacional (DJEN / Comunica PJe)**, enriquecimento via **Datajud (CNJ)**, extração de **inteiro teor assinado (PJe / eproc)**, **Pool Multi-IA Gratuito com Failover Automático**, **Memória Coletiva Anonimizada (LGPD)** e **Gestão Multi-Tenant**.

---

## 🚀 Principais Diferenciais

- **Captura Multi-Critério (DJEN/CNJ):** Busca por OAB, Advogado, Nome do Cliente, Variações/CNPJ e Número CNJ.
- **Inteligência Competitiva ("Um Passo à Frente"):** Classifica automaticamente cada processo em `NOSSO_ESCRITORIO`, `ESCRITORIO_CONCORRENTE` ou `SEM_ADVOGADO_CADASTRADO` (alerta antecipado com cronômetro de **3 dias úteis da Res. CNJ 455**).
- **Calendário Forense Real (Art. 220 CPC):** Calcula Prazo Fatal pulando fins de semana, feriados forenses/estaduais e Recesso Forense (`20/12` a `20/01`), gerando **Prazo Interno D-2**, feed **`.ics`** (Google Agenda/Outlook) e **`.csv`** (Excel/Google Sheets).
- **Crawler de Inteiro Teor Assinado (PJe & eproc):** Valida assinatura ICP-Brasil (`assinadoPor`), baixa PDF original, extrai texto (`unpdf`) e aciona **OCR multimodal** em PDFs escaneados.
- **Datajud CNJ + Cache L2:** Capa, assuntos TPU, movimentações e **detecção automática de protocolo** (baixa de prazo sem trabalho manual).
- **Pool Multi-IA Gratuito com Ciclo & Concorrência (`src/lib/ia-router.ts`):**
  - Rotaciona automaticamente entre **10 provedores gratuitos** (Google Gemini AI Studio, Groq, Cerebras, OpenRouter `:free`, Mistral, NVIDIA NIM, Hugging Face, Cloudflare Workers AI, Cohere e Ollama local).
  - **Least-Loaded Round-Robin:** múltiplos clientes simultâneos vão em paralelo para IAs diferentes sem fila.
  - **Cache SHA-256 + Context Pruning:** limpa ruídos repetitivos do DJEN/PJe e economiza 40%–70% dos tokens.
  - **Memória Coletiva Anonimizada (LGPD):** aprende padrões de Varas/Tribunais e estruturas de minutas validadas sem nunca vazar CPFs, nomes ou números de processo.
- **Pronto para SaaS / B2B:** Autenticação `scrypt` + JWT HS256 (`HttpOnly` + Bearer), isolamento **Multi-Tenant (`organizacaoId`)**, **API Keys por cliente (`rk_live_...`)** com cota mensal e **Explorer OpenAPI 3.1 interativo em `/docs`**.

---

## 🛠️ Setup Rápido (Local — Custo R$ 0)

```bash
# 1. Instalar dependências
npm install

# 2. Criar arquivo .env a partir do exemplo
cp .env.example .env

# 3. Sincronizar banco SQLite local e gerar Prisma Client
npx prisma db push
npx prisma generate

# 4. Rodar testes e iniciar servidor
npm test
npm run dev
```

Acesse:
- **Painel Principal:** `http://localhost:3000`
- **Documentação Interativa OpenAPI (`/docs`):** `http://localhost:3000/docs`
- **Especificação OpenAPI JSON:** `http://localhost:3000/api/openapi.json`
- **Tela de Login / Primeiro Acesso:** `http://localhost:3000/login`

---

## 📡 Principais Endpoints REST

| Categoria | Endpoints |
|---|---|
| **Captura & Tribunais** | `GET /api/publicacoes`, `GET /api/datajud`, `POST /api/inspecionar-link`, `GET /api/documentos/baixar`, `GET /api/saude-tribunais` |
| **Inteligência Artificial** | `POST /api/ia/analisar`, `POST /api/ia/minuta`, `POST /api/ia/chat-base`, `GET/POST /api/ia/memoria-coletiva` |
| **Autenticação & B2B** | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET/POST/DELETE /api/api-keys`, `GET /api/openapi.json` |
| **Operação & Portal** | `GET/PATCH /api/processos`, `GET/POST/PATCH/DELETE /api/config/advogados`, `GET/POST/DELETE /api/config/clientes`, `GET /api/config/status`, `POST /api/compartilhar` |
| **Automação & Exportação** | `GET/POST /api/cron/radar`, `GET/POST /api/digest`, `GET/POST/DELETE /api/webhooks`, `GET /api/calendario/prazos.ics`, `GET /api/exportar/csv`, `GET /api/exportar/backup?lgpd=true` |

---

## ✅ Qualidade & CI

- **TypeScript:** `npm run typecheck`
- **Testes Unitários (Vitest):** `npm test` (20 testes cobrindo calendário forense Art. 220 CPC, concorrência, Anti-SSRF, Datajud, JWT/scrypt, Multi-IA failover/paralelismo, Context Pruning, LGPD e OpenAPI)
- **CI GitHub Actions:** `.github/workflows/ci.yml`
