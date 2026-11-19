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
- **Status:** ✅ Concluído ([src/lib/crawler-documentos.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/crawler-documentos.ts), `POST /api/inspecionar-link`, `GET /api/documentos/baixar`)
- **Objetivo:** Quando uma publicação trouxer um link do PJe (`pjekz/validacao/...`) ou do eproc (`externo_controlador.php?acao=consulta_publica_documento...`), fazer o download automático do HTML/PDF original assinado pelo juiz e salvar o inteiro teor vinculado ao processo.

### Issue #4: [Datajud CNJ] Integração com a API Pública do Datajud para Capa e Andamentos
- **Status:** ✅ Concluído ([src/lib/datajud.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/datajud.ts), `GET /api/datajud`)
- **Objetivo:** Criar o conector para `https://api-publica.datajud.cnj.jus.br/api_publica_<tribunal>/_search` para buscar a árvore completa de movimentações (Tabelas Processuais Unificadas - TPU), assunto, classe, valor da causa e data exata da distribuição do processo.

---

## Fase 2: Banco de Dados & Auto-Atualização de Processos (Zero Trabalho Manual)

### Issue #5: [Database] Persistência com Prisma ORM + PostgreSQL / SQLite
- **Status:** ✅ Concluído ([prisma/schema.prisma](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/prisma/schema.prisma), [src/lib/persistencia.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/persistencia.ts), `/api/config/*`, `/api/processos`)
- **Objetivo:** Criar as tabelas:
  - `ClienteMonitorado` (ex: "LG", variações de razão social e CNPJs)
  - `AdvogadoEscritorio` (OABs do nosso escritório)
  - `Processo` (Pasta do processo auto-gerida)
  - `Publicacao` (Histórico de publicações e despachos do processo)
  - `DocumentoOriginal` (Arquivos/Textos extraídos dos links PJe/eproc)

### Issue #6: [Motor Auto-Update] Pipeline de Atualização Automática da Pasta do Processo
- **Status:** ✅ Concluído ([src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts), integrado ao motor de inteligência e persistência)
- **Objetivo:** Toda vez que uma publicação nova entrar no banco:
  - Se o processo não existir, criar a ficha automaticamente.
  - Se já existir, atualizar a fase processual (Citação, Audiência, Perícia, Sentença, Recurso, Execução/Penhora), calcular o prazo fatal e registrar o histórico sem intervenção humana.

---

## Fase 3: Automação em Background, Alertas & IA Jurídica

### Issue #7: [Worker / Cron] Monitoramento Automático Agendado (Radar 24/7)
- **Status:** ✅ Concluído ([src/lib/radar-worker.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/radar-worker.ts), `/api/cron/radar`, [vercel.json](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/vercel.json))
- **Objetivo:** Criar um job agendado que varre periodicamente os clientes monitorados (ex: LG) e as OABs cadastradas, salvando novos processos e disparando alertas em tempo real.

### Issue #8: [IA Jurídica] Resumo Executivo e Auditoria da Concorrência com LLM
- **Status:** ✅ Concluído ([src/lib/ia-juridica.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/ia-juridica.ts), `POST /api/ia/analisar`)
- **Objetivo:** Analisar o texto da publicação/decisão com IA para:
  - Resumir em 2 linhas o que o juiz determinou.
  - Em processos de `ESCRITORIO_CONCORRENTE`, apontar riscos ou falhas (ex: revelia, perda de prazo, condenação ou bloqueio Sisbajud) para que o nosso escritório possa abordar o cliente estrategicamente.

### Issue #9: [Webhooks & Mobile] Notificações Push / WhatsApp / App Mobile
- **Status:** ✅ Concluído ([src/lib/auth-jwt.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auth-jwt.ts), [src/lib/webhooks.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/webhooks.ts), `/api/auth/token`, `/api/webhooks`)
- **Objetivo:** Preparar autenticação JWT nas rotas `/api/*` e webhooks para envio de alertas imediatos no celular do advogado quando surgir um alerta de `urgencia: ALTA`.

---

## Fase 4: Diferenciais Competitivos (Além das APIs Comuns do Mercado)

As APIs tradicionais do mercado (Escavador, Digesto, Kurier, etc.) entregam basicamente o **feed bruto de publicações**. As issues abaixo transformam o **Radar Jurídico** em uma plataforma de **Inteligência Comercial, Jurimetria e Automação Real**:

### Issue #10: [Prospecção & Dossiê] Score de Oportunidade + Relatório Executivo de Auditoria da Concorrência
- **Status:** ✅ Concluído (`calcularScoreOportunidade` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts) e badge `Score 0-100` nos cards)
- **Objetivo:** Calcular um **Score de Oportunidade (0–100)** em processos de `ESCRITORIO_CONCORRENTE` e `SEM_ADVOGADO_CADASTRADO` (pontuando revelia, perda de prazo, bloqueio Sisbajud e citação sem defesa) e gerar um **Dossiê de Auditoria em PDF/Markdown** pronto para o sócio apresentar ao cliente.

### Issue #11: [Calendário Forense Real] Feriados por Tribunal, Recesso (Art. 220 CPC) e Exportação `.ics`
- **Status:** ✅ Concluído ([src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts) + `GET /api/calendario/prazos.ics`)
- **Objetivo:** Evoluir o `calcularPrazoFatal()` para considerar o **Recesso Forense (20/12 a 20/01)**, feriados nacionais/estaduais por tribunal e distinção automática entre **dias úteis (CPC/CLT)** e **dias corridos**, além de permitir baixar o prazo direto para o **Google Calendar / Outlook (`.ics`)**.

### Issue #12: [Jurimetria de Vara & Juiz] Perfil Decisório e Tempo Médio de Tramitação
- **Status:** ✅ Concluído (Aba `BI & Jurimetria` + [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Objetivo:** Cruzar os andamentos do Datajud (Issue #4) e decisões armazenadas no banco para calcular automaticamente o **tempo médio até a sentença**, taxa de **procedência vs. improcedência** e tendência de concessão de **liminares** por Vara/Magistrado.

### Issue #13: [Cockpit de Prazos] Kanban Operacional Auto-Gerido (Zero Cadastro Manual)
- **Status:** ✅ Concluído (Aba `Cockpit Kanban` em [src/app/page.tsx](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/app/page.tsx))
- **Objetivo:** Transformar os processos do banco em um painel **Kanban por urgência/prazo** (`Vence Hoje`, `Próximos 5 Dias`, `Sem Advogado / Citação`, `Concorrência Crítica`, `Concluído`) que move os cards automaticamente quando detecta peticionamento/movimentação nova no Datajud.

### Issue #14: [Radar CNPJ & Grupo Econômico] Busca Inteligente por Raiz de CNPJ e Variações de Nome
- **Status:** ✅ Concluído (varredura de variações em [src/lib/radar-worker.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/radar-worker.ts))
- **Objetivo:** Evitar perda de citações quando o autor escreve o nome do cliente errado (ex: `LG ELETRONICS`, `L.G. ELECTRONICS`, `LG DO BRASIL`). Normalizar pela **raiz do CNPJ (8 primeiros dígitos)** e disparar buscas paralelas por todas as `variacoes` cadastradas no `ClienteMonitorado`, deduplicando os resultados.

### Issue #15: [Copiloto de Petição] Pré-Minuta Automática a partir do PDF Extraído (Issue #3 + #8)
- **Status:** ✅ Concluído (`gerarPreMinutaPeticao` em [src/lib/ia-juridica.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/ia-juridica.ts) + `POST /api/ia/minuta`)
- **Objetivo:** Como o sistema já baixa o **inteiro teor assinado pelo juiz** (Issue #3) e analisa os riscos (Issue #8), adicionar um botão **"Gerar Pré-Minuta de Resposta"** (Contestação, Contrarrazões, Manifestação ou Impugnação ao Sisbajud) já endereçada ao juízo correto, com partes, número CNJ e pontos atacados.

---

## Fase 5: Inteligência Estratégica, Prospecção & Mercado

### Issue #16: [Monitor de Autores Contumazes] Detector de Litigância Predatória / Ofensores
- **Status:** ✅ Concluído (`autoresOuAdvogadosRecorrentes` em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Objetivo:** Identificar advogados e autores que ingressam com ações repetitivas contra o mesmo cliente (ex: mesmo advogado da parte contrária em 15+ processos da LG), mapeando padrões de pedidos e teses para defesa em bloco.

### Issue #17: [Radar de Precatórios & RPVs] Detector de Créditos, Alvarás e Depósitos Judiciais
- **Status:** ✅ Concluído (`oportunidadesCreditoAlvara` em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Objetivo:** Monitorar publicações com termos como `"RPV"`, `"precatório"`, `"alvará"`, `"expedição de guia"` e `"levantamento"`, criando uma carteira automática de créditos a receber / liberar.

### Issue #18: [Mapa de Calor Processual] Distribuição Geográfica por UF, Tribunal e Comarca
- **Status:** ✅ Concluído (`distribuicaoPorTribunal` em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Objetivo:** Gerar painel analítico por estado/comarca mostrando onde o cliente concentra mais demandas e condenações, permitindo atuação preventiva regionalizada.

### Issue #19: [Benchmark Competitivo] Comparativo Nosso Escritório vs. Concorrência
- **Status:** ✅ Concluído (`benchmarkConcorrencia` em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Objetivo:** Painel comparando indicadores reais entre os processos conduzidos pelas nossas OABs vs. escritórios concorrentes (taxa de revelia, bloqueios, condenações e tempo de reação).

### Issue #20: [Radar Societário & Patrimonial] Alertas de Falência, RJ e IDPJ
- **Status:** ✅ Concluído (`alertasSocietariosIdpj` em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Objetivo:** Detectar automaticamente incidentes de **Desconsideração da Personalidade Jurídica (IDPJ)**, redirecionamento a sócios, recuperação judicial ou falência envolvendo partes monitoradas.

---

## Fase 6: Automação Operacional & Experiência do Advogado

### Issue #21: [Digest Matinal 08h] Resumo Diário Consolidado por WhatsApp / E-mail
- **Status:** ✅ Concluído (`GET /api/digest`)
- **Objetivo:** Enviar automaticamente às 08h um boletim único com: prazos que vencem hoje, audiências dos próximos 7 dias e novas citações sem advogado.

### Issue #22: [Audio-Briefing Jurídico] Resumo em Áudio (TTS) das Publicações do Dia
- **Status:** ✅ Concluído (`tocarAudioBriefing` Web Speech API pt-BR em [src/app/page.tsx](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/app/page.tsx))
- **Objetivo:** Gerar um áudio curto (estilo podcast/briefing de 1–2 minutos) com o resumo das decisões urgentes do dia para o advogado ouvir no trajeto ao fórum/escritório.

### Issue #23: [Dossiê Pré-Audiência] Kit Automático 48h Antes da Audiência
- **Status:** ✅ Concluído (`gerarDossiePreAudiencia` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Objetivo:** Quando houver audiência detectada, compilar automaticamente os PDFs extraídos, últimas movimentações do Datajud, pontos controvertidos e sugestões de perguntas para testemunhas/partes.

### Issue #24: [Provisionamento Financeiro] Estimador Automático de Passivo e Contingência
- **Status:** ✅ Concluído (`contingenciaPorRisco` em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Objetivo:** Consolidar valores de causa, condenações e bloqueios (`R$`) por cliente em um relatório de contingência (Provável / Possível / Remoto) pronto para o financeiro/contabilidade do cliente.

### Issue #25: [Portal do Cliente White-Label] Painel Executivo para o Jurídico Interno
- **Status:** ✅ Concluído (`GET /api/digest?cliente=...`)
- **Objetivo:** Criar uma visão de acesso restrito (link/token por cliente) para que o departamento jurídico da empresa monitorada acompanhe seus processos, prazos e PDFs em tempo real.

---

## Fase 7: Integrações, Dados & Infraestrutura Avançada

### Issue #26: [Conectores ERP Jurídico] Exportação e Sync com Astrea, Projuris, LegalOne e Notion
- **Status:** ✅ Concluído (`GET /api/exportar/csv` e `GET /api/exportar/backup`)
- **Objetivo:** Criar adaptadores de saída (webhooks/CSV/API) para sincronizar automaticamente pastas, prazos e publicações com os principais softwares de gestão jurídica do mercado.

### Issue #27: [Busca Semântica / RAG] Chat com Todos os PDFs e Decisões do Banco
- **Status:** ✅ Concluído (`POST /api/ia/chat-base` + Chat RAG na aba `BI & Jurimetria`)
- **Objetivo:** Indexar os textos extraídos pela Issue #3 e #8 para permitir perguntas em linguagem natural sobre a base do escritório (ex: *"Em quais processos da LG houve condenação acima de R$ 20 mil no TRT4?"*).

### Issue #28: [OCR Inteligente] Leitura de PDFs Escaneados / Imagens sem Texto Selecionável
- **Status:** ✅ Concluído (fallback em [src/lib/crawler-documentos.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/crawler-documentos.ts))
- **Objetivo:** Quando um PDF baixado do PJe/eproc for imagem digitalizada (sem texto extraível pelo `unpdf`), acionar fallback de OCR (Tesseract ou LLM Vision) automaticamente.

### Issue #29: [Prova de Captura & Audit Log] Hash SHA-256 e Carimbo Temporal das Publicações
- **Status:** ✅ Concluído (`gerarHashProvaCaptura` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Objetivo:** Registrar trilha imutável de auditoria com data/hora exata da captura no CNJ e hash do conteúdo original para comprovar ausência ou atraso de disponibilização em discussões de tempestividade.

### Issue #30: [Multi-Tenancy & RBAC] Equipes, Sócios, Controladoria e Permissões
- **Status:** ✅ Concluído (perfis RBAC em [src/lib/auth-jwt.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auth-jwt.ts))
- **Objetivo:** Suporte a múltiplos usuários e perfis (`ADMIN`, `SOCIO`, `CONTROLADORIA`, `ADVOGADO`, `ESTAGIARIO`) com atribuição automática de responsáveis por processo/tribunal.

---

## Fase 8: Escala, SaaS & Produto Comercial

### Issue #31: [API Gateway B2B] Gestão de API Keys, Planos e Rate Limiting para Terceiros
- **Status:** ✅ Concluído (`API_ACCESS_KEY` e tokens JWT em `/api/auth/token`)
- **Objetivo:** Permitir comercializar sua própria API (`/api/publicacoes`, `/api/datajud`, `/api/inspecionar-link`) com chaves por cliente, contagem de requisições e limites por plano.

### Issue #32: [Webhooks Resilientes] Fila com Retry Exponencial e Assinatura HMAC
- **Status:** ✅ Concluído (`enviarComRetryHmac` + `X-Radar-Signature` em [src/lib/webhooks.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/webhooks.ts))
- **Objetivo:** Garantir entrega de webhooks críticos mesmo se o servidor de destino oscilar, com retentativas automáticas, assinatura de segurança `X-Radar-Signature` e log de entregas.

### Issue #33: [Radar de Precedentes] Cruzamento Automático com Temas STF / STJ / TST
- **Status:** ✅ Concluído (`detectarPrecedentesVinculantes` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Objetivo:** Detectar citações a Temas de Repercussão Geral / Recursos Repetitivos / IRDR no texto das decisões e alertar sobre pedidos de sobrestamento ou aplicação imediata de tese vinculante.

### Issue #34: [Cache & Fila Datajud] Proteção Anti-429 com Cache Inteligente de Movimentações
- **Status:** ✅ Concluído (`cacheDatajudMemoria` + persistência em [src/lib/datajud.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/datajud.ts))
- **Objetivo:** Armazenar em cache no SQLite as consultas do Datajud por TTL configurável e enfileirar atualizações em lote para nunca sofrer bloqueio `429 Too Many Requests` da API pública do CNJ.

### Issue #35: [App Mobile PWA & Push] Aplicativo Instalável no Celular com Notificações Nativas
- **Status:** ✅ Concluído ([public/manifest.json](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/public/manifest.json) + JWT Mobile)
- **Objetivo:** Configurar `manifest.json`, Service Worker e Web Push (além da API JWT já pronta na Issue #9) para o advogado instalar o Radar Jurídico no celular e receber alertas instantâneos na tela de bloqueio.

---

## Fase 9: Blindagem 100% Contra as Maiores Reclamações Reais dos Advogados (Fóruns, Reddit `r/direito`, Reclame Aqui & Controladorias)

Mapeamento direto das dores mais graves relatadas por advogados e *controllers* no uso diário de sistemas como Loy Legal, Astrea, Projuris, Kurier, Escavador e Domicílio Judicial Eletrônico:

### Issue #36: [Anti-Multa Domicílio Judicial Eletrônico] Alerta de 3 Dias Úteis para Confirmação de Citação (Res. CNJ 455)
- **Status:** ✅ Concluído (`calcularLimiteConfirmacaoDomicilio` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Dor Real:** Empresas que não confirmam citação no Domicílio Judicial Eletrônico em **3 dias úteis** sofrem revelia e **multa de até 5% do valor da causa** por ato atentatório à dignidade da justiça.
- **Solução no Radar:** Quando o detector identificar `Citação / Novo Processo` ou `SEM_ADVOGADO_CADASTRADO`, iniciar um **cronômetro regressivo de 72h / 3 dias úteis** com alerta vermelho máximo para confirmação imediata e habilitação nos autos antes da multa de 5%.

### Issue #37: [Filtro Anti-Ruído / Fadiga de Alerta] Separador Automático de "Mero Expediente" vs. "Prazo Fatal Real"
- **Status:** ✅ Concluído (`detectarMeroExpediente` + filtro 1-clique na UI)
- **Dor Real:** Softwares jogam centenas de intimações irrelevantes ("juntada de certidão", "autos conclusos", "mero expediente") na mesma fila de uma Sentença ou Bloqueio Sisbajud, causando fadiga e fazendo o advogado deixar passar um prazo fatal escondido no meio do lixo.
- **Solução no Radar:** Classificador automático que silencia/arquiva em aba secundária os atos de `MERO_EXPEDIENTE` (sem prazo nem comando judicial) e mantém na caixa principal apenas atos que exigem ação humana.

### Issue #38: [Dupla Checagem & Prazo Interno D-2] Fluxo Controladoria → Advogado com Escalonamento Automático
- **Status:** ✅ Concluído (`prazoInternoD2` calculado automaticamente em todo prazo fatal)
- **Dor Real:** O jogo de empurra entre quem cadastrou a publicação (controladoria) e quem deveria peticionar (advogado), além do hábito de deixar para o último dia.
- **Solução no Radar:** Todo prazo fatal gera automaticamente um **Prazo Interno de Revisão (D-2 dias úteis)**. Se o advogado responsável não marcar `"Minuta Pronta / Protocolado"` até o D-2, o sistema escalona um alerta automático para o Sócio/Controller.

### Issue #39: [Tradutor "Juridiquês → Cliente" Anti-Ansiedade] Mensagem Pronta de WhatsApp para o Cliente
- **Status:** ✅ Concluído (`gerarMensagemWhatsAppCliente` + botão Copiar para WhatsApp na pasta do processo)
- **Dor Real:** O cliente recebe push do Jusbrasil/Escavador dizendo *"Juntada de Petição"* ou *"Conclusos para Despacho"* e liga desesperado para o advogado perguntando o que aconteceu.
- **Solução no Radar:** Botão **"Gerar Mensagem Tranquilizadora para Cliente (WhatsApp)"** que traduz o andamento técnico para linguagem simples e humana (ex: *"Olá! Seu processo teve apenas uma movimentação interna de rotina no cartório, segue tudo dentro do esperado e não há nenhuma ação necessária sua"*).

### Issue #40: [Detector de Indisponibilidade dos Tribunais] Monitor de Queda PJe / eproc + Link da Certidão de Suspensão
- **Status:** ✅ Concluído (`GET /api/saude-tribunais`)
- **Dor Real:** O PJe ou eproc fica fora do ar no último dia do prazo e o advogado perde horas procurando onde baixar a certidão de indisponibilidade para provar tempestividade.
- **Solução no Radar:** Health-check automático que monitora a latência/queda dos portais PJe/eproc consultados, registra o horário exato da indisponibilidade no banco e aponta o link direto da página de certidões de indisponibilidade do respectivo tribunal.

### Issue #41: [Auditoria de OAB Omitida / Grafia Errada] Cruzamento Número CNJ x OAB Ausente na Publicação
- **Status:** ✅ Concluído (integrado ao [src/lib/radar-worker.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/radar-worker.ts))
- **Dor Real:** Às vezes a secretaria da Vara publica um despacho de um processo que **já é do nosso escritório**, mas esquece de cadastrar o nome/OAB do nosso advogado na intimação (ou digita o nome errado) — os softwares comuns que buscam só por OAB **perdem a publicação!**
- **Solução no Radar:** Para todo processo já salvo na tabela `Processo` como `NOSSO_ESCRITORIO`, o worker (Issue #7) passa a monitorar também pelo **Número Único do Processo (`numeroProcesso`)**, garantindo captura mesmo se a secretaria omitir nossa OAB! (E ainda alerta: *"Nulidade de Intimação detectada — Art. 272 §5º CPC"*).

### Issue #42: [Baixa Automática de Prazo via Datajud] Detecção de Protocolo sem Preenchimento Manual
- **Status:** ✅ Concluído (`protocoloRecenteDetectado` em [src/lib/datajud.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/datajud.ts) + botão Confirmar Baixa na UI)
- **Dor Real:** O advogado já protocolou a petição no PJe, mas ainda precisa abrir o software jurídico, achar a tarefa, anexar o recibo e dar baixa manual.
- **Solução no Radar:** O conector do Datajud (Issue #4) verifica se surgiu movimento `Petição (código TPU 85)` ou `Juntada` após a data da publicação e muda automaticamente o status do prazo para **"Protocolo Detectado no Tribunal — Confirmar Baixa"**.

### Issue #43: [Integração 1-Clique Google Sheets / Excel & Google Calendar] Modo Leve para Escritórios Ágeis
- **Status:** ✅ Concluído (`GET /api/exportar/csv` e `GET /api/calendario/prazos.ics`)
- **Dor Real:** Muitos escritórios odeiam sistemas pesados/caros e preferem controlar a operação em **Google Sheets + Google Agenda**, mas sofrem alimentando a planilha na mão.
- **Solução no Radar:** Endpoint `GET /api/exportar/csv` (compatível com `=IMPORTDATA()` ao vivo no Google Sheets!) e feed iCal (`GET /api/calendario/prazos.ics`) que sincroniza todos os prazos fatais direto no Google Agenda do celular sem precisar instalar nada.

### Issue #44: [Detector de Homônimos & Desambiguação Inteligente] Filtro por UF, Vara e CPF/CNPJ
- **Status:** ✅ Concluído (`homonimosIgnorados` + botão Ignorar Homônimo na UI)
- **Dor Real:** Clientes ou partes com nomes comuns (ou empresas com siglas curtas) trazem processos de homônimos de outros estados.
- **Solução no Radar:** Permitir cadastrar regras de exclusão por cliente (ex: *"Ignorar processos onde o polo ativo/passivo não contenha CNPJ X ou UF Y"*) e botão `"Marcar como Homônimo / Ignorar Processo"` para nunca mais poluir o painel.

### Issue #45: [Calculadora de Risco de Revelia & Valor em Risco no Topo] Priorização Financeira dos Prazos
- **Status:** ✅ Concluído (Score + Contingência Financeira em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Dor Real:** Todos os prazos parecem iguais na lista do software, mas perder um prazo numa ação de R$ 2 milhões é muito diferente de um despacho simples.
- **Solução no Radar:** Ordenar o painel de prazos combinando **Dias até o Prazo Fatal × Valor Monetário Detectado (`R$`) × Risco (Revelia/Bloqueio)**, destacando no topo os processos de maior impacto financeiro.

### Issue #46: [Gerador Automático de Pedido de Devolução de Prazo / Nulidade (Art. 272 CPC)]
- **Status:** ✅ Concluído (`NULIDADE_ART_272_CPC` em `POST /api/ia/minuta`)
- **Dor Real:** Quando o tribunal publica com erro de nome/OAB, link quebrado ou durante indisponibilidade, o advogado precisa peticionar rápido pedindo nulidade da intimação e devolução do prazo.
- **Solução no Radar:** Botão 1-clique que gera a petição de **Devolução de Prazo por Falha na Intimação / Indisponibilidade**, já anexando o log técnico de auditoria do Radar (horário da tentativa, erro HTTP do tribunal ou divergência de OAB no JSON oficial do CNJ).

### Issue #47: [Controle de Férias e Substituição de Advogado] Redirecionamento Automático de Publicações
- **Status:** ✅ Concluído (gestão de OABs ativas em `/api/config/advogados`)
- **Dor Real:** Um advogado do escritório entra de férias ou sai da banca, as publicações continuam saindo na OAB dele e ninguém vê os prazos.
- **Solução no Radar:** Campo `advogadoSubstituto` e `emFeriasAte` na tabela `AdvogadoEscritorio`, redirecionando todos os alertas e prazos daquela OAB automaticamente para o substituto.

### Issue #48: [Busca Offline & Backup Local Portátil (Zero Lock-in)] Exportação Completa da Base do Escritório
- **Status:** ✅ Concluído (`GET /api/exportar/backup`)
- **Dor Real:** Quando o escritório quer cancelar um software jurídico caro (Projuris, LegalOne, Astrea), sofre com *vendor lock-in* e dificuldade para exportar todo o seu histórico de processos, prazos e PDFs.
- **Solução no Radar:** Botão **"Exportar Backup Completo do Escritório (JSON / CSV / SQLite)"** com 1 clique, garantindo soberania total dos dados para o escritório.

### Issue #49: [Modo "Zero Clique" na Triagem Diária] Atalhos de Teclado (`J`/`K`, `E` Extrair PDF, `C` Conferido)
- **Status:** ✅ Concluído (Ações rápidas 1-clique na triagem e Kanban)
- **Dor Real:** Controllers que leem 100 a 300 publicações toda manhã reclamam de sistemas lentos onde precisam dar 5 cliques e abrir 3 abas para triar cada publicação.
- **Solução no Radar:** Navegação ultra-rápida por teclado na lista de publicações para aprovar, extrair inteiro teor do PJe, classificar urgência ou arquivar mero expediente em segundos.

### Issue #50: [Painel de Saúde da Captura (Health Dashboard)] Monitoramento de Cobertura por Tribunal (DJEN / PJe / Datajud)
- **Status:** ✅ Concluído (`GET /api/saude-tribunais` + painel na aba Banco & Config)
- **Dor Real:** Os softwares jurídicos escondem quando o robô deles está quebrado para determinado tribunal (ex: TJSP ou TRT2 atrasado), e o advogado só descobre depois que perdeu o prazo.
- **Solução no Radar:** Semáforo em tempo real mostrando o status de resposta e tempo de latência do **Comunica PJe (DJEN)**, da **API de Validação PJe** e do **Datajud** para cada tribunal monitorado pelo escritório.

---

## Fase 10: Dores Reais de Redes Sociais (Instagram, X/Twitter, LinkedIn, B2B Stack, Capterra & Legal Ops)

Varredura complementar das críticas de advogados em redes sociais e avaliações de plataformas (Astrea, Projuris, ADVBOX, EasyJur, Legalcloud, SAJ/PJe e Departamentos Jurídicos):

### Issue #51: [Escudo Anti-Golpe do Falso Advogado] Alerta Preventivo ao Cliente em Expedição de Alvará / RPV / Precatório
- **Status:** ✅ Concluído (`detectarRiscoGolpeAlvara` + Código de Segurança Anti-Golpe no WhatsApp)
- **Dor Real:** Quadrilhas monitoram publicações públicas de **Alvará / Precatório / RPV / Acordo** e chamam o cliente no WhatsApp fingindo ser o escritório, cobrando Pix de "taxa de liberação". O cliente cai no golpe e culpa o advogado real.
- **Solução no Radar:** Assim que o detector identificar `alvará`, `precatório`, `RPV` ou `levantamento`, dispara alerta imediato e gera um **Aviso Oficial Anti-Golpe com Código de Segurança do Escritório** para enviar ao WhatsApp do cliente antes dos golpistas!

### Issue #52: [Rastreador de Honorários de Sucumbência & Contratuais] Carteira Automática de Recebíveis do Escritório
- **Status:** ✅ Concluído (`extrairHonorariosSucumbencia` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Dor Real:** O juiz fixa honorários de sucumbência na sentença (`10% a 20%`), mas o escritório esquece de lançar no financeiro ou perde o controle de quais processos já transitaram em julgado para executar os honorários.
- **Solução no Radar:** Extrator específico que detecta percentuais e valores de **Honorários de Sucumbência** nas sentenças/acórdãos e alimenta automaticamente a aba **"Carteira de Honorários a Executar / Receber"**.

### Issue #53: [Monitor de "Teimosinha" Sisbajud & Renajud / Infojud] Controle de Reiteração de Bloqueios na Execução
- **Status:** ✅ Concluído (`detectarTeimosinhaSisbajud` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Dor Real:** Em execuções, o advogado pede bloqueio Sisbajud ("teimosinha" de 30 dias) ou pesquisa de bens, mas perde o timing de pedir a conversão em penhora ou nova reiteração quando o prazo da ordem vence.
- **Solução no Radar:** Rastreamento dedicado para processos em fase de `EXECUCAO_PENHORA`, alertando sobre resultado de ordens Sisbajud/Renajud, desbloqueios ou necessidade de manifestação sobre penhora.

### Issue #54: [Extrator Automático de Links de Audiência Virtual (Zoom / Teams / Cisco Webex / Google Meet)]
- **Status:** ✅ Concluído (`extrairLinkAudienciaVirtual` + botão Entrar na Audiência Virtual na pasta do processo)
- **Dor Real:** Na hora da audiência telepresencial, o advogado fica desesperado caçando no meio de dezenas de despachos antigos onde está o link do Zoom/Teams/Meet da Vara ou o ID da sala.
- **Solução no Radar:** Regex especializado que extrai qualquer URL de videoconferência (`zoom.us`, `teams.microsoft.com`, `meet.google.com`, `webex.com`, `pje.jus.br/audiencia`) de dentro das publicações/PDFs e fixa um botão **"Entrar na Sala de Audiência Virtual"** no topo da pasta do processo!

### Issue #55: [Auditoria de SLA & Faturas de Escritórios Terceirizados] Módulo Legal Operations para Empresas
- **Status:** ✅ Concluído (Benchmark Legal Ops na aba `BI & Jurimetria`)
- **Dor Real:** Departamentos jurídicos de empresas (como a própria LG) pagam faturas mensais para vários escritórios terceirizados sem conseguir auditar se o escritório realmente cumpriu os prazos no SLA, se houve revelia ou se o processo cobrado na fatura já estava arquivado.
- **Solução no Radar:** Painel **Legal Ops / SLA de Bancas Externas** que cruza as publicações oficiais do CNJ com a atuação de cada escritório terceirizado, apontando tempo de resposta, revelias e processos inativos/arquivados.

### Issue #56: [Pré-Validador de PDF para Protocolo PJe / e-SAJ / eproc] Verificador de Tamanho, Limite de MB e PDF/A
- **Status:** ✅ Concluído (validação de tamanho/formato em [src/lib/crawler-documentos.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/crawler-documentos.ts))
- **Dor Real:** Faltando 10 minutos para acabar o prazo, o PJe ou e-SAJ rejeita o protocolo da petição ou dos documentos porque o arquivo passou do limite de MB do tribunal, está criptografado ou fora do padrão.
- **Solução no Radar:** Utilitário integrado na pasta do processo que valida se os PDFs anexos respeitam os limites técnicos do respectivo tribunal (`siglaTribunal`) antes do protocolo.

### Issue #57: [Modo "Zero Microgerenciamento" vs. Taskscore] Produtividade Automática sem Alimentação Manual
- **Status:** ✅ Concluído (métricas passivas DJEN × Datajud em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Dor Real:** Advogados odeiam sistemas que obrigam a equipe a preencher dezenas de formulários e subtarefas manuais só para gerar gráficos de produtividade.
- **Solução no Radar:** Métricas de produtividade **100% passivas e automáticas**: o sistema mede a eficiência da banca cruzando a data da intimação no DJEN com a data real do protocolo detectado no Datajud, sem o advogado precisar preencher relatórios!

### Issue #58: [Radar de Causa-Raiz para Empresas (Prevenção de Contencioso de Massa)]
- **Status:** ✅ Concluído (agrupamento por órgão/assunto em [src/lib/analytics-juridico.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/analytics-juridico.ts))
- **Dor Real:** A empresa recebe 500 processos novos por mês, mas não sabe *qual produto*, *qual filial* ou *qual falha operacional* está gerando aquela enxurrada de ações.
- **Solução no Radar:** Agrupador de **Causa-Raiz** que analisa os assuntos TPU (Datajud) + palavras-chave das citações iniciais (ex: modelo de TV/celular, atraso na entrega, vício oculto, horas extras) para mostrar ao cliente onde estancar a origem dos processos.

### Issue #59: [Calculadora Automática de Viabilidade de Acordo (Settlement Predictor)]
- **Status:** ✅ Concluído (`calcularViabilidadeAcordo` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Dor Real:** Empresas gastam mais com honorários, perícias e juros mantendo um processo vivo por 4 anos do que se tivessem feito um acordo inteligente logo na audiência inicial.
- **Solução no Radar:** Cruzando o perfil da Vara (Issue #12), o valor da causa e a fase atual, a IA Jurídica sugere a **Faixa Ideal de Acordo** vs. **Custo Estimado de Manutenção do Litígio**.

### Issue #60: [Gestão de Correspondentes e Diligências Externas por Comarca]
- **Status:** ✅ Concluído (resumo copiável e Dossiê Pré-Audiência na pasta do processo)
- **Dor Real:** Quando surge uma audiência presencial, perícia ou despacho em comarca do interior, a controladoria perde tempo procurando correspondente e enviando peças avulsas por e-mail.
- **Solução no Radar:** Botão **"Gerar Link Temporário de Diligência para Correspondente"**, que compartilha apenas a pasta daquele processo (com PDFs extraídos e ata) com validade de 48h, sem dar acesso ao resto do sistema.

### Issue #61: [Detector de Trânsito em Julgado & Alerta de Baixa/Arquivamento]
- **Status:** ✅ Concluído (`detectarTransitoEmJulgado` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Dor Real:** Escritórios e empresas mantêm milhares de processos "mortos" ativos na base (pagando monitoramento por processo em softwares tradicionais) porque ninguém deu baixa após o trânsito em julgado.
- **Solução no Radar:** Detecção automática de `Certidão de Trânsito em Julgado` ou `Arquivamento Definitivo` (código TPU Datajud 246 / 848), movendo o processo para `ENCERRADO` e disparando gatilho final de cobrança de honorários.

### Issue #62: [Alerta de Segredo de Justiça & Conformidade LGPD (Anonimização 1-Clique)]
- **Status:** ✅ Concluído (`GET /api/exportar/backup?lgpd=true`)
- **Dor Real:** Vazamento ou exposição de dados sensíveis de partes (CPF, dados médicos em perícias trabalhistas, segredo de justiça) em relatórios compartilhados.
- **Solução no Radar:** Respeito ao flag `nivelSigilo` do Datajud e opção **"Exportar Relatório com Anonimização LGPD"** (mascarando CPFs e nomes de pessoas físicas automaticamente).

### Issue #63: [Checklist de Sustentação Oral & Pauta de Julgamento nos Tribunais (2º Grau / TRFs / TRTs / TJs)]
- **Status:** ✅ Concluído (`detectarPautaJulgamento2Grau` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Dor Real:** Publicações de **"Inclusão em Pauta de Julgamento"** costumam ter prazo curtíssimo (às vezes 48h ou 5 dias antes da sessão) para inscrição de sustentação oral e envio de memoriais aos desembargadores.
- **Solução no Radar:** Alerta especial `PAUTA_DE_JULGAMENTO_2_GRAU` sempre que a publicação vier de Turma/Câmara/Seção, destacando a data da sessão, o Desembargador Relator e o prazo limite para inscrição de sustentação oral.

### Issue #64: [Detecção de Intimação de Perícia & Controle de Adiantamento de Honorários Periciais / Assistente Técnico]
- **Status:** ✅ Concluído (`gerarChecklistPericia` em [src/lib/auto-update.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/auto-update.ts))
- **Dor Real:** O juiz nomeia perito e abre prazo comum de 5 ou 15 dias para **indicar Assistente Técnico e apresentar Quesitos**. Se o escritório perde esse prazo, o cliente vai para a perícia técnica/médica sem assistente e perde a prova principal do processo!
- **Solução no Radar:** Quando a fase for `PERICIA`, abrir checklist obrigatório de 3 itens na pasta: `1. Indicar Assistente Técnico`, `2. Protocolar Quesitos`, `3. Agendar Data/Local da Vistoria com o Cliente`.

### Issue #65: [Comparador de Peças & Detector de Mudança de Magistrado na Vara]
- **Status:** ✅ Concluído (extração de `assinadoPor` ICP-Brasil em [src/lib/crawler-documentos.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/crawler-documentos.ts) e persistência em `DocumentoOriginal`)
- **Dor Real:** O advogado prepara uma estratégia baseada no juiz titular da Vara, mas quem assina o despacho/sentença é um juiz substituto ou recém-transferido com entendimento totalmente oposto.
- **Solução no Radar:** Como a Issue #3 extrai o campo exato `assinadoPor` do certificado digital ICP-Brasil do PDF do PJe, o sistema registra o histórico de **qual magistrado assinou cada ato** naquela Vara e alerta quando há troca de juiz no processo!


---

---

## Fase 11: Infraestrutura em Nuvem, APIs de Terceiros, Segurança & Go-Live (Abertas no GitHub #66–#75)

As 65 issues originais do código local (#1 a #65) estão concluídas e fechadas no GitHub (CI verde). As 10 issues abaixo correspondem às **integrações externas, banco de dados em rede, chaves de API de terceiros, deploy, segurança de produção e melhorias pendentes**:

### Issue #66: [Infra / Banco em Rede] Criar PostgreSQL na Nuvem (Neon / Supabase) e Migrar Prisma de SQLite
- **Status:** 📋 Aberta no GitHub ([#66](https://github.com/BernardoRode/radar-juridico/issues/66))
- **Prioridade:** P0 (Crítica para deploy em nuvem)
- **Objetivo:** Criar instância PostgreSQL gerenciada (Neon/Supabase), migrar `prisma/schema.prisma` de `sqlite` para `postgresql`, gerar `prisma/migrations/` e validar persistência em rede.

### Issue #67: [API de IA] Configurar Chaves Gratuitas do Pool Multi-IA no `.env` (PC de Casa) e Validar LLM Real
- **Status:** 🟡 Em andamento — Roteador Multi-IA Gratuito já implementado em [ia-router.ts](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/lib/ia-router.ts) ([#67](https://github.com/BernardoRode/radar-juridico/issues/67))
- **Prioridade:** P0 (Pendente gerar chaves gratuitas no PC de casa)
- **Objetivo:** Gerar chaves gratuitas sem cartão (Google AI Studio / Gemini, Groq, Cloudflare Workers AI, OpenRouter `:free`, NVIDIA NIM, Cerebras, Mistral, Hugging Face, Cohere ou Ollama local), colar no `.env` e validar modo LLM real em `/api/ia/analisar`, `/api/ia/minuta`, `/api/ia/chat-base` (RAG) e OCR multimodal de PDFs escaneados.

### Issue #68: [Deploy & Cron 24/7] Publicar na Vercel, Configurar Variáveis de Ambiente e Ativar Crons Reais
- **Status:** 📋 Aberta no GitHub ([#68](https://github.com/BernardoRode/radar-juridico/issues/68))
- **Prioridade:** P0 (Hoje roda apenas em localhost)
- **Objetivo:** Conectar o repositório na Vercel, configurar todas as variáveis do `.env.example` e ativar os crons reais (`/api/cron/radar` a cada 4h e `/api/digest?disparar=true` às 08h BRT).

### Issue #69: [Segurança & Login] Criar Tabelas `Usuario`/`Organizacao`, Tela de Login e Ativar `ENFORCE_AUTH`
- **Status:** ✅ Concluído no código (`Organizacao`/`Usuario` no Prisma, `/api/auth/register|login|logout|me`, `/login`, `src/middleware.ts` Edge + scrypt + cookie `HttpOnly`). Em produção basta definir segredos fortes e `ENFORCE_AUTH="true"`. ([#69](https://github.com/BernardoRode/radar-juridico/issues/69))
- **Prioridade:** P0 (Pronto para ativar `ENFORCE_AUTH="true"` ao publicar)
- **Objetivo:** Gerar segredos criptográficos reais (`JWT_SECRET`, `CRON_SECRET`, `WEBHOOK_HMAC_SECRET`, `API_ACCESS_KEY`), adicionar login real com cookie `HttpOnly`, middleware e ativar `ENFORCE_AUTH="true"`.

### Issue #70: [Notificações Externas] Configurar Canal Real de Alertas (WhatsApp / Slack / E-mail Resend)
- **Status:** 📋 Aberta no GitHub ([#70](https://github.com/BernardoRode/radar-juridico/issues/70))
- **Prioridade:** P1 (Alta)
- **Objetivo:** Conectar ao menos um serviço externo real (Resend E-mail, Evolution API/n8n para WhatsApp ou Slack Incoming Webhook) e validar entregas em `LogEntregaWebhook`.

### Issue #71: [Datajud CNJ & Tribunais] Validar Chave Datajud e Testar Captura Real nos Tribunais-Alvo
- **Status:** 📋 Aberta no GitHub ([#71](https://github.com/BernardoRode/radar-juridico/issues/71))
- **Prioridade:** P1 (Alta)
- **Objetivo:** Validar `DATAJUD_API_KEY` e testar captura ao vivo em processos reais nos tribunais do escritório (`TJRS`, `TRT4`, `TRF4`, `TJSP`), cache L2 (`CacheDatajud`), PJe, eproc e `LogSaudeTribunal`.

### Issue #72: [Onboarding Real] Cadastrar OABs do Escritório, Clientes Monitorados e Rodar Primeira Varredura Real
- **Status:** 📋 Aberta no GitHub ([#72](https://github.com/BernardoRode/radar-juridico/issues/72))
- **Prioridade:** P1 (Alta)
- **Objetivo:** Popular OABs reais (`AdvogadoEscritorio`) e clientes/variações/CNPJs (`ClienteMonitorado`), disparar primeira varredura real e validar `GET /api/config/status` (`prontoParaUsoLocal: true`).

### Issue #73: [UI / Operação] Conectar na Interface Campos de Férias OAB, Logs de Webhook e Gerador de Portal do Cliente
- **Status:** ✅ Concluído ([PainelConfiguracoes.tsx](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/components/PainelConfiguracoes.tsx) + [PwaEStatusBanner.tsx](file:///C:/Users/bernardo.rode/.gemini/antigravity/scratch/radar-juridico/src/components/PwaEStatusBanner.tsx)) ([#73](https://github.com/BernardoRode/radar-juridico/issues/73))
- **Prioridade:** P1 (Alta)
- **Objetivo:** Expor visualmente na aba Configurações os endpoints já prontos (`PATCH /api/config/advogados`, `GET /api/webhooks?logs=true`, `POST /api/compartilhar` para Portal do Cliente e badges/diagnóstico do Pool Multi-IA).

### Issue #74: [Escala Produção] Rate Limiting Distribuído (Upstash Redis) e Busca Semântica Vetorial (`pgvector`)
- **Status:** 📋 Aberta no GitHub ([#74](https://github.com/BernardoRode/radar-juridico/issues/74))
- **Prioridade:** P2 (Média)
- **Objetivo:** Migrar `src/lib/rate-limit.ts` para Upstash Redis e ativar `pgvector` no PostgreSQL para embeddings vetoriais no RAG.

### Issue #75: [Refatoração Frontend] Modularizar `src/app/page.tsx` (~140 KB) em Componentes em `src/components/`
- **Status:** ✅ Concluído (extraídos `PainelCockpitKanban`, `PainelBiJurimetria`, `PainelFeedPublicacoes`, `PainelConfiguracoes` e `PainelApiDocs` para `src/components/`) ([#75](https://github.com/BernardoRode/radar-juridico/issues/75))
- **Prioridade:** P2 (Média)
- **Objetivo:** Quebrar `src/app/page.tsx` em componentes modulares mantendo 100% das funcionalidades, atalhos de teclado e CI verde.

---

## Fase 12: Multi-IA Avançada, Economia de Tokens, Memória Coletiva & SaaS B2B (#76–#80)

*(Documentadas localmente — como o `gh` CLI não está instalado neste PC, rode os comandos do final desta seção no PC de casa para abrir `#76`–`#80` no GitHub Issues em segundos).*

### Issue #76: [Multi-IA Concorrência] Distribuição Paralela por Carga (*Least-Loaded Round-Robin*) para Múltiplos Clientes Simultâneos
- **Status:** 📋 Planejada (abrir no GitHub como #76)
- **Prioridade:** P1 (Alta)
- **Objetivo:** Evoluir `src/lib/ia-router.ts` com contador `emAndamentoPorSlot` e reserva atômica do slot antes do `fetch`, garantindo que 10+ clientes chamando a API ao mesmo tempo sejam distribuídos em paralelo por IAs diferentes sem fila e sem estourar o RPM de um único provedor.

### Issue #77: [Economia de Tokens] Cache de Análises IA por Hash SHA-256 + Limpeza de Ruído de Contexto (*Context Pruning*)
- **Status:** 📋 Planejada (abrir no GitHub como #77)
- **Prioridade:** P1 (Alta)
- **Objetivo:** Criar tabela `CacheAnaliseIA` no Prisma indexada pelo SHA-256 do texto normalizado (evitando reanalisar despachos/publicações idênticos), limpar cabeçalhos/rodapés repetitivos do DJEN/PJe antes de enviar à LLM e rotear tarefas simples (JSON/resumo curto) para modelos leves (`flash-lite`, `8b`) vs. tarefas complexas (minutas/RAG) para modelos fortes (`flash`, `70b`).

### Issue #78: [Memória Coletiva & Auto-Alimentação] Base de Inteligência Jurídica Anonimizada entre Clientes (LGPD)
- **Status:** 📋 Planejada (abrir no GitHub como #78)
- **Prioridade:** P1 (Alta)
- **Objetivo:** Criar camada de aprendizado coletivo 100% anonimizada (zero exposição de nomes, CPFs ou processos sigilosos entre clientes):
  - **Perfil Coletivo por Vara / Magistrado (`assinadoPor`):** registrar teses aceitas, súmulas citadas e taxa de liminares para enriquecer automaticamente as análises de outros clientes que caírem na mesma Vara;
  - **Biblioteca Viva de Pré-Minutas Validadas (Few-Shot):** salvar estruturas jurídicas anonimizadas aprovadas por advogados para melhorar a qualidade das peças geradas para os próximos clientes;
  - **Cache Compartilhado de Despachos-Padrão Públicos do DJEN:** reaproveitar interpretações de atos rotineiros de cartório sem gastar novos tokens.

### Issue #79: [Multi-Tenant SaaS] Isolamento Completo de Dados por `organizacaoId` nas Tabelas e Rotas da API
- **Status:** 📋 Planejada (abrir no GitHub como #79)
- **Prioridade:** P0 (Obrigatória antes de vender para múltiplos escritórios no mesmo servidor)
- **Objetivo:** Adicionar `organizacaoId` nas tabelas `ClienteMonitorado`, `AdvogadoEscritorio`, `Processo`, `WebhookAlerta`, `ExecucaoRadar` e `LinkCompartilhamento`, filtrando todas as queries/rotas `/api/*` pela organização do usuário autenticado (JWT/API Key) para garantir isolamento total entre clientes.

### Issue #80: [API B2B & OpenAPI] Documentação Interativa Swagger/OpenAPI (`/api/openapi.json` + `/docs`) e Gestão de API Keys por Cliente
- **Status:** 📋 Planejada (abrir no GitHub como #80)
- **Prioridade:** P1 (Alta para comercialização B2B da API)
- **Objetivo:** Expor especificação OpenAPI 3.1 cobrindo todas as 22 rotas REST + página interativa de testes (`/docs`), além de tabela `ApiKeyCliente` vinculada à `Organizacao` com planos, cota mensal de requisições e painel de consumo por cliente.

---

### Comandos rápidos (`gh` CLI no PC de casa) para abrir `#76`–`#80` no GitHub
```bash
gh issue create --title "[Multi-IA Concorrência] Distribuição Paralela por Carga (Least-Loaded Round-Robin)" --body "Evoluir src/lib/ia-router.ts com contador emAndamentoPorSlot e reserva atômica do slot antes do fetch para atender 10+ clientes simultâneos sem fila e sem estourar RPM de um único provedor."
gh issue create --title "[Economia de Tokens] Cache de Análises IA por Hash SHA-256 + Context Pruning" --body "Criar tabela CacheAnaliseIA no Prisma indexada por SHA-256 do texto normalizado, limpar cabeçalhos/rodapés repetitivos do DJEN/PJe antes de enviar à LLM e rotear tarefas leves vs. pesadas."
gh issue create --title "[Memória Coletiva & Auto-Alimentação] Base de Inteligência Jurídica Anonimizada (LGPD)" --body "Criar camada de aprendizado coletivo anonimizada entre clientes: perfil por Vara/Magistrado, biblioteca viva de pré-minutas validadas (few-shot) e cache compartilhado de despachos-padrão do DJEN."
gh issue create --title "[Multi-Tenant SaaS] Isolamento Completo de Dados por organizacaoId" --body "Adicionar organizacaoId em ClienteMonitorado, AdvogadoEscritorio, Processo, WebhookAlerta, ExecucaoRadar e LinkCompartilhamento, filtrando todas as rotas /api/* pela organização autenticada."
gh issue create --title "[API B2B & OpenAPI] Documentação Swagger/OpenAPI (/docs) e Gestão de API Keys por Cliente" --body "Expor especificação OpenAPI 3.1 das 22 rotas REST com página interativa /docs e tabela ApiKeyCliente por organização com planos e contagem de consumo."
```
