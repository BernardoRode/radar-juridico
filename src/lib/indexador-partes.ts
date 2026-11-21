import { prisma } from '@/lib/prisma';
import {
  normalizarPoloCanonico,
  validarCnpj,
  validarCpf,
} from '@/lib/validadores';

export interface ParteParaIndexar {
  nome: string;
  documento?: string;
  polo?: string;
}

export interface ResultadoBuscaDocumento {
  documento: string;
  tipoDocumento: 'CPF' | 'CNPJ';
  documentoValido: boolean;
  totalProcessos: number;
  distribuicaoPolos: {
    ATIVO: number;
    PASSIVO: number;
    TERCEIRO: number;
    DESCONHECIDO: number;
  };
  tribunais: string[];
  processos: Array<{
    numeroProcesso: string;
    numeroFormatado: string;
    siglaTribunal: string;
    orgaoJulgador: string;
    classeProcessual: string;
    polo: string;
    nomeParte: string;
    faseProcessual: string;
    urgenciaMaxima: string;
    prazoFatal: string | null;
    fonte: string;
  }>;
  fontesConsultadas: string[];
}

/**
 * Extrai todos os CPFs (11 dígitos) e CNPJs (14 dígitos) matematicamente válidos de um texto livre.
 */
export function extrairDocumentosValidosDoTexto(
  texto: string
): Array<{ documento: string; tipoDocumento: 'CPF' | 'CNPJ' }> {
  const encontrados = new Map<string, 'CPF' | 'CNPJ'>();
  if (!texto) return [];

  // CNPJs formatados ou limpos (14 dígitos)
  const regexCnpj = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  for (const m of texto.match(regexCnpj) || []) {
    const limpo = m.replace(/[^0-9]/g, '');
    if (limpo.length === 14 && validarCnpj(limpo)) {
      encontrados.set(limpo, 'CNPJ');
    }
  }

  // CPFs formatados ou limpos (11 dígitos)
  const regexCpf = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  for (const m of texto.match(regexCpf) || []) {
    const limpo = m.replace(/[^0-9]/g, '');
    if (limpo.length === 11 && validarCpf(limpo)) {
      encontrados.set(limpo, 'CPF');
    }
  }

  return Array.from(encontrados.entries()).map(([documento, tipoDocumento]) => ({
    documento,
    tipoDocumento,
  }));
}

/**
 * Issue #91: Indexa partes com CPF/CNPJ de um processo na tabela ParteIndexada.
 */
export async function indexarPartesDoProcesso(params: {
  numeroProcesso: string;
  siglaTribunal: string;
  partes?: ParteParaIndexar[];
  textoPublicacao?: string;
  fonte?: 'DJEN' | 'DATAJUD' | 'MANUAL';
  organizacaoId?: string | null;
}): Promise<number> {
  const numLimpo = (params.numeroProcesso || '').replace(/[^0-9]/g, '');
  if (!numLimpo) return 0;

  const registros: Array<{
    documento: string;
    tipoDocumento: 'CPF' | 'CNPJ';
    nome: string;
    polo: string;
  }> = [];

  for (const p of params.partes || []) {
    const docLimpo = (p.documento || '').replace(/[^0-9]/g, '');
    if (docLimpo.length === 11 && validarCpf(docLimpo)) {
      registros.push({
        documento: docLimpo,
        tipoDocumento: 'CPF',
        nome: (p.nome || 'Parte não identificada').trim(),
        polo: normalizarPoloCanonico(p.polo),
      });
    } else if (docLimpo.length === 14 && validarCnpj(docLimpo)) {
      registros.push({
        documento: docLimpo,
        tipoDocumento: 'CNPJ',
        nome: (p.nome || 'Empresa não identificada').trim(),
        polo: normalizarPoloCanonico(p.polo),
      });
    }
  }

  if (params.textoPublicacao) {
    const extraidos = extrairDocumentosValidosDoTexto(params.textoPublicacao);
    for (const ext of extraidos) {
      if (!registros.some((r) => r.documento === ext.documento)) {
        registros.push({
          documento: ext.documento,
          tipoDocumento: ext.tipoDocumento,
          nome: `Identificado em Publicação (${ext.tipoDocumento})`,
          polo: 'TERCEIRO',
        });
      }
    }
  }

  let indexados = 0;
  for (const reg of registros) {
    await prisma.parteIndexada.upsert({
      where: {
        documento_numeroProcesso: {
          documento: reg.documento,
          numeroProcesso: numLimpo,
        },
      },
      create: {
        organizacaoId: params.organizacaoId ?? null,
        documento: reg.documento,
        tipoDocumento: reg.tipoDocumento,
        nome: reg.nome,
        polo: reg.polo,
        numeroProcesso: numLimpo,
        siglaTribunal: params.siglaTribunal || 'DESCONHECIDO',
        fonte: params.fonte || 'DJEN',
      },
      update: {
        nome: reg.nome,
        polo: reg.polo !== 'DESCONHECIDO' ? reg.polo : undefined,
        siglaTribunal: params.siglaTribunal || undefined,
      },
    });
    indexados += 1;
  }

  return indexados;
}

/**
 * Reindexa toda a base local de Processo + Publicacao para popular ParteIndexada.
 */
export async function reindexarBaseLocalPartes(organizacaoId?: string | null): Promise<{
  processosAnalisados: number;
  documentosIndexados: number;
}> {
  const processos = await prisma.processo.findMany({
    where: organizacaoId ? { organizacaoId } : undefined,
    include: {
      publicacoes: {
        select: { texto: true },
        take: 5,
      },
    },
  });

  let documentosIndexados = 0;
  for (const proc of processos) {
    let partes: ParteParaIndexar[] = [];
    if (proc.partesJson) {
      try {
        const parsed = JSON.parse(proc.partesJson) as Array<{
          nome?: string;
          polo?: string;
          documento?: string;
          numeroDocumento?: string;
        }>;
        partes = parsed.map((p) => ({
          nome: p.nome || 'Parte',
          polo: p.polo,
          documento: p.documento || p.numeroDocumento,
        }));
      } catch {
        partes = [];
      }
    }
    const textoCombinado = proc.publicacoes.map((pub) => pub.texto).join('\n');
    documentosIndexados += await indexarPartesDoProcesso({
      numeroProcesso: proc.numeroProcesso,
      siglaTribunal: proc.siglaTribunal,
      partes,
      textoPublicacao: textoCombinado,
      fonte: 'DJEN',
      organizacaoId: proc.organizacaoId,
    });
  }

  return {
    processosAnalisados: processos.length,
    documentosIndexados,
  };
}

/**
 * Issue #91: Consulta unificada por CPF ou CNPJ na base histórica indexada + fallback em Processo/ClienteMonitorado.
 */
export async function consultarPorDocumento(
  documentoRaw: string,
  organizacaoId?: string | null
): Promise<ResultadoBuscaDocumento> {
  const documento = (documentoRaw || '').replace(/[^0-9]/g, '');
  const tipoDocumento: 'CPF' | 'CNPJ' = documento.length > 11 ? 'CNPJ' : 'CPF';
  const documentoValido =
    tipoDocumento === 'CNPJ' ? validarCnpj(documento) : validarCpf(documento);

  const indexados = await prisma.parteIndexada.findMany({
    where: {
      documento,
      ...(organizacaoId ? { organizacaoId } : {}),
    },
    orderBy: { atualizadoEm: 'desc' },
  });

  const numerosEncontrados = indexados.map((i) => i.numeroProcesso);
  const processosDb = numerosEncontrados.length
    ? await prisma.processo.findMany({
        where: { numeroProcesso: { in: numerosEncontrados } },
      })
    : [];

  const mapaProc = new Map(processosDb.map((p) => [p.numeroProcesso, p]));

  const distribuicaoPolos = {
    ATIVO: 0,
    PASSIVO: 0,
    TERCEIRO: 0,
    DESCONHECIDO: 0,
  };

  const processos = indexados.map((idx) => {
    const proc = mapaProc.get(idx.numeroProcesso);
    const polo = normalizarPoloCanonico(idx.polo);
    distribuicaoPolos[polo] += 1;

    return {
      numeroProcesso: idx.numeroProcesso,
      numeroFormatado: proc?.numeroFormatado || idx.numeroProcesso,
      siglaTribunal: proc?.siglaTribunal || idx.siglaTribunal,
      orgaoJulgador: proc?.orgaoJulgador || 'Não informado',
      classeProcessual: proc?.classeProcessual || 'Não informada',
      polo,
      nomeParte: idx.nome,
      faseProcessual: proc?.faseProcessual || 'Andamento',
      urgenciaMaxima: proc?.urgenciaMaxima || 'NORMAL',
      prazoFatal: proc?.prazoFatal || null,
      fonte: idx.fonte,
    };
  });

  const tribunais = Array.from(new Set(processos.map((p) => p.siglaTribunal)));

  return {
    documento,
    tipoDocumento,
    documentoValido,
    totalProcessos: processos.length,
    distribuicaoPolos,
    tribunais,
    processos,
    fontesConsultadas: ['ParteIndexada (SQLite Local)', 'Processo (Radar)'],
  };
}
