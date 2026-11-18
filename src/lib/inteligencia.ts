import {
  AnaliseInteligencia,
  ComunicacaoCNJ,
  ProcessoAutoGerido,
  PublicacaoEnriquecida,
} from '@/types/juridico';
import {
  calcularLimiteConfirmacaoDomicilio,
  calcularPrazoFatal,
  calcularScoreOportunidade,
  calcularViabilidadeAcordo,
  classificarFaseProcessual,
  detectarMeroExpediente,
  detectarPautaJulgamento2Grau,
  detectarPrecedentesVinculantes,
  detectarRiscoGolpeAlvara,
  detectarTeimosinhaSisbajud,
  detectarTransitoEmJulgado,
  extrairHonorariosSucumbencia,
  extrairLinkAudienciaVirtual,
  gerarChecklistPericia,
  gerarDossiePreAudiencia,
  gerarHashProvaCaptura,
  gerarMensagemWhatsAppCliente,
  LABEL_FASE_PROCESSUAL,
} from '@/lib/auto-update';

/**
 * Extrai links diretos de validação de documentos do PJe (pjekz/validacao)
 * e do eproc (acao=consulta_publica_documento) tanto do campo `link` quanto de dentro do `texto`.
 */
export function extrairLinksValidacao(
  texto: string,
  linkCampo?: string
): AnaliseInteligencia['linksValidacao'] {
  const encontrados = new Map<string, AnaliseInteligencia['linksValidacao'][0]>();

  const analisarUrl = (rawUrl: string) => {
    const url = rawUrl.trim().replace(/[.,;)"']+$/, '');
    if (!url.startsWith('http')) return;

    if (url.includes('pjekz/validacao') || url.includes('pje.') || url.includes('/validacao/')) {
      const matchCod = url.match(/validacao\/([0-9a-zA-Z]+)/);
      encontrados.set(url, {
        sistema: 'PJE',
        url,
        codigoValidacao: matchCod?.[1],
      });
    } else if (
      url.includes('eproc') ||
      url.includes('consulta_publica_documento') ||
      url.includes('hash=')
    ) {
      const matchHash = url.match(/hash=([0-9a-fA-F]+)/);
      encontrados.set(url, {
        sistema: 'EPROC',
        url,
        codigoValidacao: matchHash?.[1]?.slice(0, 16),
      });
    } else {
      encontrados.set(url, {
        sistema: 'OUTRO',
        url,
      });
    }
  };

  if (linkCampo) {
    analisarUrl(linkCampo);
  }

  if (texto) {
    const urlRegex = /https?:\/\/[^\s<>"']+/g;
    const matches = texto.match(urlRegex) || [];
    matches.forEach(analisarUrl);
  }

  return Array.from(encontrados.values());
}

/**
 * Analisa o texto da publicação para extrair prazos, audiências, valores e urgência automaticamente.
 */
export function extrairAlertasTexto(
  texto: string,
  tipoComunicacao?: string,
  dataDisponibilizacao?: string,
  siglaTribunal?: string
): AnaliseInteligencia['alertasAutomaticos'] {
  const t = (texto || '').toLowerCase();

  let tipoAtoDetectado = tipoComunicacao || 'Comunicação Processual';
  let urgencia: 'ALTA' | 'MEDIA' | 'NORMAL' = 'NORMAL';

  if (t.includes('citação') || t.includes('cite-se') || t.includes('citar a reclamada')) {
    tipoAtoDetectado = 'Citação / Novo Processo Detectado';
    urgencia = 'ALTA';
  } else if (t.includes('tutela de urgência') || t.includes('liminar')) {
    tipoAtoDetectado = 'Decisão Liminar / Tutela de Urgência';
    urgencia = 'ALTA';
  } else if (t.includes('sentença') || t.includes('julgo procedente') || t.includes('julgo parcialmente procedente')) {
    tipoAtoDetectado = 'Sentença Proferida';
    urgencia = 'ALTA';
  } else if (t.includes('audiência')) {
    tipoAtoDetectado = 'Designação / Intimação de Audiência';
    urgencia = 'ALTA';
  } else if (t.includes('penhora') || t.includes('sisbajud') || t.includes('bloqueio')) {
    tipoAtoDetectado = 'Ordem de Bloqueio / Penhora';
    urgencia = 'ALTA';
  } else if (t.includes('contrarrazões') || t.includes('recurso ordinário') || t.includes('apelação')) {
    tipoAtoDetectado = 'Intimação para Recurso / Contrarrazões';
    urgencia = 'MEDIA';
  } else if (t.includes('laudo pericial') || t.includes('perícia')) {
    tipoAtoDetectado = 'Intimação sobre Perícia';
    urgencia = 'MEDIA';
  }

  // Extração de prazo (ex: "prazo de 15 dias", "em 5 (cinco) dias", "no prazo de 8 dias")
  const matchPrazo = texto?.match(/prazo\s+de\s+(\d+\s*(?:\([^)]+\))?\s*(?:dias|horas)(?:\s+úteis)?)/i);
  const prazoDetectado = matchPrazo ? matchPrazo[1] : undefined;

  // Extração de data de audiência
  const matchAudiencia = texto?.match(
    /audi[êe]ncia[^.]{0,60}?(\d{2}\/\d{2}\/\d{4}(?:\s*(?:às|as)\s*\d{1,2}[h:]\d{2})?)/i
  );
  const audienciaDetectada = matchAudiencia ? matchAudiencia[1] : undefined;

  // Extração de valor monetário (R$)
  const matchValor = texto?.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/);
  const valorDetectado = matchValor ? matchValor[0] : undefined;

  if (prazoDetectado && urgencia === 'NORMAL') {
    urgencia = 'MEDIA';
  }

  const faseCodigo = classificarFaseProcessual(texto, tipoComunicacao);
  const faseProcessual = LABEL_FASE_PROCESSUAL[faseCodigo];
  const calculoPrazo = calcularPrazoFatal(
    dataDisponibilizacao,
    prazoDetectado,
    siglaTribunal
  );
  const linkAudienciaVirtual = extrairLinkAudienciaVirtual(texto);
  const honorariosDetectados = extrairHonorariosSucumbencia(texto);
  const ehMeroExpediente = detectarMeroExpediente(texto, urgencia, prazoDetectado);
  const riscoGolpeAlvara = detectarRiscoGolpeAlvara(texto);
  const transitoEmJulgado = detectarTransitoEmJulgado(texto);
  const pautaJulgamento2Grau = detectarPautaJulgamento2Grau(texto, tipoComunicacao);
  const checklistPericia = gerarChecklistPericia(faseCodigo);
  const precedentesDetectados = detectarPrecedentesVinculantes(texto);
  const alertaTeimosinhaSisbajud = detectarTeimosinhaSisbajud(texto);
  const hashProvaCaptura = gerarHashProvaCaptura(
    siglaTribunal || 'CNJ',
    dataDisponibilizacao || '',
    texto
  );
  const timestampCaptura = new Date().toISOString();
  const limiteConfirmacaoDomicilio3Dias =
    faseCodigo === 'CITACAO'
      ? calcularLimiteConfirmacaoDomicilio(dataDisponibilizacao, siglaTribunal)
      : undefined;

  return {
    tipoAtoDetectado,
    faseProcessual,
    prazoDetectado,
    prazoFatal: calculoPrazo?.dataFatalFormatada,
    prazoInternoD2: calculoPrazo?.prazoInternoD2Formatado,
    limiteConfirmacaoDomicilio3Dias,
    audienciaDetectada,
    linkAudienciaVirtual,
    valorDetectado,
    honorariosDetectados,
    ehMeroExpediente,
    riscoGolpeAlvara,
    transitoEmJulgado,
    pautaJulgamento2Grau,
    checklistPericia,
    precedentesDetectados,
    alertaTeimosinhaSisbajud,
    hashProvaCaptura,
    timestampCaptura,
    urgencia,
  };
}

/**
 * Enriquece uma comunicação do CNJ cruzando as OABs do nosso escritório
 * para identificar se o processo do cliente está conosco, com um concorrente ou ainda sem advogado habilitado (processo recém-distribuído!).
 */
export function enriquecerComunicacao(
  com: ComunicacaoCNJ,
  nossasOabs: string[] = []
): PublicacaoEnriquecida {
  const oabsNormalizadas = nossasOabs
    .map((o) => o.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())
    .filter(Boolean);

  const advogadosIdentificados = (com.destinatarioadvogados || []).map((item) => {
    const num = String(item.advogado?.numero_oab || '').replace(/[^0-9]/g, '');
    const uf = String(item.advogado?.uf_oab || '').toUpperCase();
    const chaveOab1 = `${num}${uf}`;
    const chaveOab2 = `${uf}${num}`;

    const ehNosso =
      oabsNormalizadas.length > 0 &&
      (oabsNormalizadas.includes(num) ||
        oabsNormalizadas.includes(chaveOab1) ||
        oabsNormalizadas.includes(chaveOab2));

    return {
      nome: item.advogado?.nome || 'Advogado não informado',
      oab: num,
      uf,
      ehNosso,
    };
  });

  const temNossoAdvogado = advogadosIdentificados.some((a) => a.ehNosso);
  let statusConcorrencia: AnaliseInteligencia['statusConcorrencia'] = 'ESCRITORIO_CONCORRENTE';

  if (advogadosIdentificados.length === 0) {
    statusConcorrencia = 'SEM_ADVOGADO_CADASTRADO';
  } else if (temNossoAdvogado) {
    statusConcorrencia = 'NOSSO_ESCRITORIO';
  }

  const linksValidacao = extrairLinksValidacao(com.texto, com.link);
  const alertasAutomaticos = extrairAlertasTexto(
    com.texto,
    com.tipoComunicacao,
    com.data_disponibilizacao,
    com.siglaTribunal
  );
  if (
    statusConcorrencia === 'SEM_ADVOGADO_CADASTRADO' &&
    !alertasAutomaticos.limiteConfirmacaoDomicilio3Dias
  ) {
    alertasAutomaticos.limiteConfirmacaoDomicilio3Dias =
      calcularLimiteConfirmacaoDomicilio(
        com.data_disponibilizacao,
        com.siglaTribunal
      );
  }

  return {
    ...com,
    inteligencia: {
      ehEscritorioProprio: temNossoAdvogado,
      statusConcorrencia,
      advogadosIdentificados,
      linksValidacao,
      alertasAutomaticos,
    },
  };
}

/**
 * Agrupa as publicações por número de processo e monta a pasta do processo auto-atualizada
 * (Zero trabalho manual para o advogado).
 */
export function consolidarProcessosAutomaticamente(
  publicacoes: PublicacaoEnriquecida[]
): ProcessoAutoGerido[] {
  const mapa = new Map<string, ProcessoAutoGerido>();

  for (const pub of publicacoes) {
    const num = pub.numero_processo || pub.numeroprocessocommascara || `SEM-NUMERO-${pub.id}`;
    const existente = mapa.get(num);

    if (!existente) {
      mapa.set(num, {
        numeroProcesso: pub.numero_processo,
        numeroFormatado: pub.numeroprocessocommascara || pub.numero_processo,
        siglaTribunal: pub.siglaTribunal,
        orgaoJulgador: pub.nomeOrgao || 'Órgão Julgador não informado',
        classeProcessual: pub.nomeClasse || 'Classe não informada',
        partes: [...(pub.destinatarios || [])],
        advogadosAtuantes: [...pub.inteligencia.advogadosIdentificados],
        statusConcorrencia: pub.inteligencia.statusConcorrencia,
        ultimaAtualizacao: pub.data_disponibilizacao,
        ultimoStatusDetectado: pub.inteligencia.alertasAutomaticos.tipoAtoDetectado,
        faseProcessual: pub.inteligencia.alertasAutomaticos.faseProcessual,
        prazoFatal: pub.inteligencia.alertasAutomaticos.prazoFatal,
        prazoInternoD2: pub.inteligencia.alertasAutomaticos.prazoInternoD2,
        limiteConfirmacaoDomicilio3Dias:
          pub.inteligencia.alertasAutomaticos.limiteConfirmacaoDomicilio3Dias,
        linkAudienciaVirtual: pub.inteligencia.alertasAutomaticos.linkAudienciaVirtual,
        honorariosDetectados: pub.inteligencia.alertasAutomaticos.honorariosDetectados,
        ehMeroExpediente: pub.inteligencia.alertasAutomaticos.ehMeroExpediente,
        riscoGolpeAlvara: pub.inteligencia.alertasAutomaticos.riscoGolpeAlvara,
        transitoEmJulgado: pub.inteligencia.alertasAutomaticos.transitoEmJulgado,
        pautaJulgamento2Grau: pub.inteligencia.alertasAutomaticos.pautaJulgamento2Grau,
        checklistPericia: pub.inteligencia.alertasAutomaticos.checklistPericia,
        urgenciaMaxima: pub.inteligencia.alertasAutomaticos.urgencia,
        totalPublicacoes: 1,
        linksDocumentosOriginais: [...pub.inteligencia.linksValidacao],
        historicoPublicacoes: [pub],
      });
    } else {
      existente.totalPublicacoes += 1;
      existente.historicoPublicacoes.push(pub);

      // Mesclar partes sem duplicar
      for (const p of pub.destinatarios || []) {
        if (!existente.partes.some((ep) => ep.nome === p.nome)) {
          existente.partes.push(p);
        }
      }

      // Mesclar advogados sem duplicar
      for (const adv of pub.inteligencia.advogadosIdentificados) {
        if (!existente.advogadosAtuantes.some((ea) => ea.oab === adv.oab && ea.uf === adv.uf)) {
          existente.advogadosAtuantes.push(adv);
        }
      }

      // Mesclar links de documentos PJe/eproc
      for (const link of pub.inteligencia.linksValidacao) {
        if (!existente.linksDocumentosOriginais.some((el) => el.url === link.url)) {
          existente.linksDocumentosOriginais.push(link);
        }
      }

      // Atualizar status de concorrência se nosso escritório aparecer em alguma publicação
      if (pub.inteligencia.statusConcorrencia === 'NOSSO_ESCRITORIO') {
        existente.statusConcorrencia = 'NOSSO_ESCRITORIO';
      }

      // Atualizar urgência máxima
      const peso = { ALTA: 3, MEDIA: 2, NORMAL: 1 };
      if (peso[pub.inteligencia.alertasAutomaticos.urgencia] > peso[existente.urgenciaMaxima]) {
        existente.urgenciaMaxima = pub.inteligencia.alertasAutomaticos.urgencia;
      }

      if (!existente.prazoFatal && pub.inteligencia.alertasAutomaticos.prazoFatal) {
        existente.prazoFatal = pub.inteligencia.alertasAutomaticos.prazoFatal;
        existente.prazoInternoD2 = pub.inteligencia.alertasAutomaticos.prazoInternoD2;
      }
      if (!existente.linkAudienciaVirtual && pub.inteligencia.alertasAutomaticos.linkAudienciaVirtual) {
        existente.linkAudienciaVirtual = pub.inteligencia.alertasAutomaticos.linkAudienciaVirtual;
      }
      if (pub.inteligencia.alertasAutomaticos.riscoGolpeAlvara) {
        existente.riscoGolpeAlvara = true;
      }
      if (!existente.honorariosDetectados && pub.inteligencia.alertasAutomaticos.honorariosDetectados) {
        existente.honorariosDetectados = pub.inteligencia.alertasAutomaticos.honorariosDetectados;
      }
      if (pub.inteligencia.alertasAutomaticos.transitoEmJulgado) {
        existente.transitoEmJulgado = true;
      }
      if (pub.inteligencia.alertasAutomaticos.pautaJulgamento2Grau) {
        existente.pautaJulgamento2Grau = true;
      }
      if (!existente.checklistPericia && pub.inteligencia.alertasAutomaticos.checklistPericia) {
        existente.checklistPericia = pub.inteligencia.alertasAutomaticos.checklistPericia;
      }
      if (!pub.inteligencia.alertasAutomaticos.ehMeroExpediente) {
        existente.ehMeroExpediente = false;
      }
      if (pub.inteligencia.alertasAutomaticos.faseProcessual && existente.faseProcessual === 'Andamento / Despacho') {
        existente.faseProcessual = pub.inteligencia.alertasAutomaticos.faseProcessual;
      }
    }
  }

  const listaProcessos = Array.from(mapa.values());

  for (const proc of listaProcessos) {
    const textoConcatenado = proc.historicoPublicacoes.map((p) => p.texto).join('\n');
    const temValorMonetario = proc.historicoPublicacoes.some(
      (p) => !!p.inteligencia.alertasAutomaticos.valorDetectado
    );
    const { score, motivos } = calcularScoreOportunidade({
      statusConcorrencia: proc.statusConcorrencia,
      urgenciaMaxima: proc.urgenciaMaxima,
      textoConcatenado,
      temValorMonetario,
    });
    proc.scoreOportunidade = score;
    proc.motivosScore = motivos;
    const pubPrincipal = proc.historicoPublicacoes[0];
    const alerts0 = pubPrincipal?.inteligencia.alertasAutomaticos;
    proc.precedentesDetectados = alerts0?.precedentesDetectados;
    proc.alertaTeimosinhaSisbajud = alerts0?.alertaTeimosinhaSisbajud;
    proc.hashProvaCaptura = alerts0?.hashProvaCaptura;
    const faseCod = classificarFaseProcessual(textoConcatenado);
    proc.dossiePreAudiencia = gerarDossiePreAudiencia(
      faseCod,
      alerts0?.audienciaDetectada
    );
    proc.viabilidadeAcordo = calcularViabilidadeAcordo(
      faseCod,
      proc.urgenciaMaxima,
      alerts0?.valorDetectado
    );
    proc.mensagemClienteWhatsApp = gerarMensagemWhatsAppCliente({
      numeroProcesso: proc.numeroFormatado,
      tribunal: proc.siglaTribunal,
      tipoAtoDetectado: proc.ultimoStatusDetectado,
      prazoFatal: proc.prazoFatal,
      riscoGolpeAlvara: !!proc.riscoGolpeAlvara,
      ehMeroExpediente: !!proc.ehMeroExpediente,
    });
  }

  return listaProcessos;
}
