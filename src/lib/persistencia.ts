import { prisma } from '@/lib/prisma';
import {
  ProcessoAutoGerido,
  ResultadoExtracaoDocumento,
} from '@/types/juridico';
import { indexarPartesDoProcesso } from '@/lib/indexador-partes';
import {
  detectarVinculosNoTexto,
  registrarVinculosCrossGrau,
} from '@/lib/arvore-cross-grau';
import { publicarEventoTempoReal } from '@/lib/eventos-stream';

/**
 * Retorna todas as OABs ativas cadastradas para o nosso escritório no banco de dados.
 */
export async function obterOabsEscritorio(): Promise<string[]> {
  try {
    const advogados = await prisma.advogadoEscritorio.findMany({
      where: { ativo: true },
      select: { numeroOab: true, ufOab: true },
    });
    return advogados.map((a) => `${a.numeroOab}${a.ufOab}`.toUpperCase());
  } catch {
    return [];
  }
}

/**
 * Persiste automaticamente processos consolidados e suas publicações no banco SQLite/Prisma.
 * Cria a pasta do processo se não existir ou atualiza se já existir (Zero trabalho manual).
 */
export async function salvarRadarNoBanco(
  processos: ProcessoAutoGerido[]
): Promise<{ processosSalvos: number; publicacoesSalvas: number }> {
  let processosSalvos = 0;
  let publicacoesSalvas = 0;

  for (const proc of processos) {
    const numLimpo = (proc.numeroProcesso || proc.numeroFormatado || '').replace(
      /[^0-9]/g,
      ''
    );
    if (!numLimpo) continue;

    const processoDb = await prisma.processo.upsert({
      where: { numeroProcesso: numLimpo },
      create: {
        numeroProcesso: numLimpo,
        numeroFormatado: proc.numeroFormatado || numLimpo,
        siglaTribunal: proc.siglaTribunal,
        orgaoJulgador: proc.orgaoJulgador,
        classeProcessual: proc.classeProcessual,
        statusConcorrencia: proc.statusConcorrencia,
        ultimoStatusDetectado: proc.ultimoStatusDetectado,
        faseProcessual: proc.faseProcessual || 'Andamento / Despacho',
        prazoFatal: proc.prazoFatal || null,
        urgenciaMaxima: proc.urgenciaMaxima,
        ultimaAtualizacao: proc.ultimaAtualizacao,
        partesJson: JSON.stringify(proc.partes || []),
        advogadosJson: JSON.stringify(proc.advogadosAtuantes || []),
      },
      update: {
        siglaTribunal: proc.siglaTribunal,
        orgaoJulgador: proc.orgaoJulgador,
        classeProcessual: proc.classeProcessual,
        statusConcorrencia: proc.statusConcorrencia,
        ultimoStatusDetectado: proc.ultimoStatusDetectado,
        faseProcessual: proc.faseProcessual || 'Andamento / Despacho',
        prazoFatal: proc.prazoFatal || null,
        urgenciaMaxima: proc.urgenciaMaxima,
        ultimaAtualizacao: proc.ultimaAtualizacao,
        partesJson: JSON.stringify(proc.partes || []),
        advogadosJson: JSON.stringify(proc.advogadosAtuantes || []),
      },
    });
    processosSalvos += 1;

    // Issue #91: Indexação histórica automática de CPF/CNPJ das partes e textos
    const textoConsolidado = proc.historicoPublicacoes
      .map((pub) => pub.texto || '')
      .join('\n');
    await indexarPartesDoProcesso({
      numeroProcesso: numLimpo,
      siglaTribunal: proc.siglaTribunal,
      partes: (proc.partes || []).map((pt) => ({
        nome: pt.nome,
        polo: pt.polo,
      })),
      textoPublicacao: textoConsolidado,
      fonte: 'DJEN',
    }).catch(() => {});

    // Issue #92: Detecção automática de vínculos cross-grau nos textos
    const vinculos = detectarVinculosNoTexto(
      numLimpo,
      textoConsolidado,
      proc.siglaTribunal
    );
    if (vinculos.length > 0) {
      await registrarVinculosCrossGrau(vinculos).catch(() => {});
    }

    for (const pub of proc.historicoPublicacoes) {
      if (!pub.id) continue;
      await prisma.publicacao.upsert({
        where: { cnjId: pub.id },
        create: {
          cnjId: pub.id,
          processoId: processoDb.id,
          dataDisponibilizacao: pub.data_disponibilizacao || '',
          tipoComunicacao: pub.tipoComunicacao || 'Comunicação',
          nomeOrgao: pub.nomeOrgao || '',
          texto: pub.texto || '',
          linkOriginal: pub.link || null,
          tipoAtoDetectado: pub.inteligencia.alertasAutomaticos.tipoAtoDetectado,
          faseProcessual:
            pub.inteligencia.alertasAutomaticos.faseProcessual ||
            'Andamento / Despacho',
          prazoDetectado: pub.inteligencia.alertasAutomaticos.prazoDetectado || null,
          prazoFatal: pub.inteligencia.alertasAutomaticos.prazoFatal || null,
          audienciaDetectada:
            pub.inteligencia.alertasAutomaticos.audienciaDetectada || null,
          valorDetectado: pub.inteligencia.alertasAutomaticos.valorDetectado || null,
          urgencia: pub.inteligencia.alertasAutomaticos.urgencia,
          statusConcorrencia: pub.inteligencia.statusConcorrencia,
        },
        update: {
          tipoAtoDetectado: pub.inteligencia.alertasAutomaticos.tipoAtoDetectado,
          faseProcessual:
            pub.inteligencia.alertasAutomaticos.faseProcessual ||
            'Andamento / Despacho',
          prazoDetectado: pub.inteligencia.alertasAutomaticos.prazoDetectado || null,
          prazoFatal: pub.inteligencia.alertasAutomaticos.prazoFatal || null,
          urgencia: pub.inteligencia.alertasAutomaticos.urgencia,
          statusConcorrencia: pub.inteligencia.statusConcorrencia,
        },
      });
      publicacoesSalvas += 1;
    }

    // Issue #97: Publica evento em tempo real no stream SSE
    publicarEventoTempoReal({
      tipo:
        proc.urgenciaMaxima === 'ALTA'
          ? 'ALERTA_URGENCIA_ALTA'
          : 'NOVA_PUBLICACAO',
      dados: {
        numeroProcesso: numLimpo,
        numeroFormatado: proc.numeroFormatado || numLimpo,
        tribunal: proc.siglaTribunal,
        urgencia: proc.urgenciaMaxima,
        prazoFatal: proc.prazoFatal || null,
      },
    });
  }

  return { processosSalvos, publicacoesSalvas };
}

/**
 * Salva ou atualiza o inteiro teor extraído de um documento PJe/eproc no banco.
 */
export async function salvarDocumentoExtraidoNoBanco(
  extracao: ResultadoExtracaoDocumento,
  numeroProcesso?: string
): Promise<void> {
  try {
    let processoId: string | null = null;
    if (numeroProcesso) {
      const numLimpo = numeroProcesso.replace(/[^0-9]/g, '');
      const proc = await prisma.processo.findUnique({
        where: { numeroProcesso: numLimpo },
        select: { id: true },
      });
      processoId = proc?.id || null;
    }

    await prisma.documentoOriginal.upsert({
      where: { urlOriginal: extracao.urlOriginal },
      create: {
        processoId,
        urlOriginal: extracao.urlOriginal,
        sistema: extracao.sistema,
        statusExtracao: extracao.statusExtracao,
        tituloDocumento: extracao.tituloDocumento || null,
        resultadoValidacao: extracao.resultadoValidacao || null,
        assinadoPor: extracao.assinadoPor || null,
        dataHoraAssinatura: extracao.dataHoraAssinatura || null,
        totalPaginas: extracao.totalPaginas ?? null,
        tamanhoPdfBytes: extracao.tamanhoPdfBytes ?? null,
        textoExtraido: extracao.textoExtraido || null,
      },
      update: {
        processoId: processoId ?? undefined,
        statusExtracao: extracao.statusExtracao,
        tituloDocumento: extracao.tituloDocumento || null,
        resultadoValidacao: extracao.resultadoValidacao || null,
        assinadoPor: extracao.assinadoPor || null,
        dataHoraAssinatura: extracao.dataHoraAssinatura || null,
        totalPaginas: extracao.totalPaginas ?? null,
        tamanhoPdfBytes: extracao.tamanhoPdfBytes ?? null,
        textoExtraido: extracao.textoExtraido || null,
      },
    });
  } catch {
    // Não interrompe a resposta da API caso a persistência opcional falhe
  }
}
