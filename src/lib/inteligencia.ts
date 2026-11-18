import {
  AnaliseInteligencia,
  ComunicacaoCNJ,
  ProcessoAutoGerido,
  PublicacaoEnriquecida,
} from '@/types/juridico';

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
  tipoComunicacao?: string
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

  return {
    tipoAtoDetectado,
    prazoDetectado,
    audienciaDetectada,
    valorDetectado,
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
  const alertasAutomaticos = extrairAlertasTexto(com.texto, com.tipoComunicacao);

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
    }
  }

  return Array.from(mapa.values());
}
