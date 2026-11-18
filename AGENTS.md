# AGENTS.md — Guia Oficial do Projeto Radar Jurídico & API de Publicações

Este arquivo define a visão de produto, regras de negócio, fontes de dados jurídicas e arquitetura técnica do projeto **Radar Jurídico**. Toda IA / Agente que iniciar uma conversa neste workspace deve seguir estas diretrizes.

---

## 1. Visão do Produto & Proposta de Valor
O **Radar Jurídico** não é apenas um buscador simples de Diário Oficial por OAB. Ele é uma plataforma e API de **Inteligência Jurídica, Radar de Clientes, Monitoramento de Concorrência e Auto-Gestão de Processos**.

### Problemas que o sistema resolve:
1. **Busca Multi-Critério (OAB + Radar de Cliente):**
   - Permite buscar publicações pela **OAB / Nome do Advogado** (carteira própria do escritório).
   - Permite buscar pelo **Nome da Empresa / Cliente** (`nomeParte` e `texto` livre/CNPJ) — ex: `"LG ELECTRONICS"`.
2. **Inteligência Competitiva & Early Warning ("Um Passo à Frente"):**
   - Grandes empresas (como a LG) são processadas diariamente ou têm processos conduzidos por vários escritórios diferentes.
   - Ao monitorar as publicações em nome do cliente, o sistema cruza automaticamente a lista de advogados retornada na publicação (`destinatarioadvogados`) com as **OABs do nosso escritório** (`nossasOabs`).
   - Com isso, classifica cada processo automaticamente em:
     - `NOSSO_ESCRITORIO`: Processo conduzido pela nossa banca.
     - `ESCRITORIO_CONCORRENTE`: Processo do cliente conduzido por outro escritório (permite auditar pontos críticos que o concorrente deixou passar ou identificar oportunidades de atuação).
     - `SEM_ADVOGADO_CADASTRADO`: Processo recém-distribuído ou em fase de citação inicial onde o cliente ainda nem habilitou advogado (alerta antecipado antes mesmo da citação chegar!).
3. **Auto-Atualização de Processos (Zero Trabalho Manual):**
   - Sempre que novas publicações chegam, o motor de inteligência agrupa os dados por número CNJ (`numero_processo`), cria ou atualiza a pasta do processo automaticamente, extrai prazos (`prazo de X dias`), datas de audiência, valores monetários (`R$`) e classifica o nível de urgência (`ALTA`, `MEDIA`, `NORMAL`).

---

## 2. Fontes Oficiais de Dados Jurídicos & Como Funcionam

### A. API Pública do Comunica PJe / DJEN (CNJ) — Fonte Primária
- **Endpoint Base:** `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao`
- **Documentação Swagger:** `https://comunicaapi.pje.jus.br/swagger/index.html`
- **Características:** API REST pública em JSON mantida pelo CNJ (Diário de Justiça Eletrônico Nacional). Não exige token para consultas públicas.
- **Parâmetros Principais Suportados:**
  - `numeroOab`, `ufOab`, `nomeAdvogado`
  - `nomeParte` (Nome do cliente/empresa, ex: `LG ELECTRONICS`)
  - `texto` (Busca textual no teor do despacho/decisão, útil para CNPJ ou termos específicos)
  - `numeroProcesso` (20 dígitos padrão CNJ)
  - `siglaTribunal` (ex: `TRT4`, `TRF4`, `TJRS`, `TJSP`, etc.)
  - `dataDisponibilizacaoInicio`, `dataDisponibilizacaoFim` (`YYYY-MM-DD`)
  - `pagina`, `itensPorPagina`

### B. Links de Validação de Documentos (PJe e eproc)
As publicações jurídicas trazem no campo `link` ou dentro do próprio `texto` as URLs diretas para o inteiro teor do documento assinado pelo magistrado nos sistemas dos tribunais:
1. **PJe (`pjekz/validacao`):**
   - Exemplo: `https://pje.trt4.jus.br/pjekz/validacao/26111612374902100000201044828?instancia=1`
   - Permite validar e baixar a decisão/sentença/certidão original sem login.
2. **eproc (`acao=consulta_publica_documento`):**
   - Exemplo: `https://eproc.jfsc.jus.br/eprocV2/externo_controlador.php?acao=consulta_publica_documento&numProcesso=50099269520204047201&idDocumento=721794864303096789645203838960&hash=b7d0e09a4ce4fd5ccc8bf79144eeba813f19793d5060a35e22aae9f22d3ef0f7`
   - Contém `numProcesso`, `idDocumento` e `hash` criptográfico do documento original no eproc.

### C. API Pública do Datajud (CNJ) — Fonte Complementar para Capa e Andamentos
- **Endpoint Base:** `https://api-publica.datajud.cnj.jus.br/api_publica_<sigla_tribunal>/_search`
- Usada quando necessário enriquecer a árvore de movimentações processuais (TPU/CNJ) além das publicações de diário.

---

## 3. Arquitetura Técnica & Stack
- **Framework:** Next.js (App Router) com TypeScript e Tailwind CSS.
- **Motivo da Escolha:** Permite servir a **API REST** (`/api/...`) e a **Interface Web responsiva** no mesmo projeto, facilitando futura conversão/integração com aplicativo mobile (PWA, Capacitor ou React Native consumindo as mesmas rotas `/api`).

### Estrutura de Arquivos Principais:
- `src/types/juridico.ts`: Tipagens completas do retorno do CNJ (`ComunicacaoCNJ`), análise de inteligência (`AnaliseInteligencia`), publicação enriquecida (`PublicacaoEnriquecida`) e pasta consolidada do processo (`ProcessoAutoGerido`).
- `src/lib/inteligencia.ts`:
  - `extrairLinksValidacao()`: Detecta e classifica links `pjekz/validacao` (PJe) e `consulta_publica_documento` (eproc).
  - `extrairAlertasTexto()`: Extrai tipo de ato (Citação, Sentença, Liminar, Audiência, Penhora), prazos, datas e valores em R$.
  - `enriquecerComunicacao()`: Cruza os advogados da publicação com as OABs do nosso escritório para detectar atuação da concorrência.
  - `consolidarProcessosAutomaticamente()`: Agrupa publicações por processo e monta a pasta auto-atualizada.
- `src/app/api/publicacoes/route.ts`: Endpoint `GET /api/publicacoes` que consulta o CNJ, aplica o motor de inteligência e retorna `resumo`, `processosConsolidados` e `publicacoes`.
- `src/app/api/inspecionar-link/route.ts`: Endpoint `POST /api/inspecionar-link` que decodifica links de validação do PJe e eproc.
- `src/app/page.tsx`: Dashboard completo com Radar de Clientes, Busca por OAB, Busca por Processo, Inspetor de Links (TRT4/JFSC) e visualização das Pastas de Processos Auto-Atualizadas.

---

## 4. Diretrizes para Próximas Evoluções
Sempre que o usuário pedir novas funcionalidades em novos chats dentro deste projeto:
1. Priorize a **automação**: o advogado nunca deve precisar cadastrar ou atualizar andamentos manualmente se a informação puder ser inferida da publicação ou do link do PJe/eproc.
2. Mantenha os endpoints `/api/*` limpos, documentados e prontos para consumo tanto pelo frontend Web quanto por um futuro aplicativo mobile.
3. Preserve o idioma **Português (pt-BR)** em toda a interface, comentários de regras de negócio e respostas da API.
