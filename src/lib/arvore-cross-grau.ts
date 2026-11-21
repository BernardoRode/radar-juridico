import { prisma } from '@/lib/prisma';

export type TipoVinculoCrossGrau =
  | 'ORIGINARIO'
  | 'RECURSO_2_GRAU'
  | 'TRIBUNAL_SUPERIOR'
  | 'CUMPRIMENTO_SENTENCA'
  | 'INCIDENTE'
  | 'CONEXO';

export type GrauProcesso = 'G1' | 'G2' | 'SUP' | 'EXECUCAO';

export interface NoArvoreProcessual {
  numeroProcesso: string;
  numeroFormatado: string;
  grau: GrauProcesso;
  siglaTribunal: string;
  classeProcessual: string;
  orgaoJulgador: string;
  faseProcessual: string;
  prazoFatal: string | null;
  tipoVinculoComRaiz?: TipoVinculoCrossGrau;
  evidencia?: string | null;
}

export interface ArvoreCrossGrauResultado {
  numeroRaiz: string;
  totalNos: number;
  grausPresentes: GrauProcesso[];
  raiz: NoArvoreProcessual;
  originarios: NoArvoreProcessual[];
  recursosECumprimentos: NoArvoreProcessual[];
  timelineUnificada: Array<{
    data: string;
    grau: GrauProcesso;
    numeroProcesso: string;
    tribunal: string;
    tipoAto: string;
    resumo: string;
  }>;
}

/**
 * Infere o grau provável a partir da sigla do tribunal ou classe processual.
 */
export function inferirGrauProcesso(
  siglaTribunal?: string | null,
  classeProcessual?: string | null
): GrauProcesso {
  const trib = (siglaTribunal || '').toUpperCase();
  const classe = (classeProcessual || '').toUpperCase();

  if (['STF', 'STJ', 'TST', 'TSE', 'STM'].includes(trib)) {
    return 'SUP';
  }
  if (
    classe.includes('CUMPRIMENTO') ||
    classe.includes('EXECUCAO') ||
    classe.includes('EXECUÇÃO')
  ) {
    return 'EXECUCAO';
  }
  if (
    classe.includes('AGRAVO') ||
    classe.includes('APELAÇÃO') ||
    classe.includes('APELACAO') ||
    classe.includes('RECURSO') ||
    classe.includes('EMBARGOS DE DECLARAÇÃO NO') ||
    classe.includes('MANDADO DE SEGURANÇA')
  ) {
    return 'G2';
  }
  return 'G1';
}

/**
 * Detecta automaticamente referências a outros números CNJ em textos de publicações
 * (ex: processo originário em Agravo de Instrumento, cumprimento de sentença ou recurso).
 */
export function detectarVinculosNoTexto(
  numeroBaseRaw: string,
  texto: string,
  siglaTribunalBase?: string
): Array<{
  numeroOrigem: string;
  numeroRelacionado: string;
  tipoVinculo: TipoVinculoCrossGrau;
  grauOrigem: GrauProcesso;
  grauRelacionado: GrauProcesso;
  evidencia: string;
}> {
  const numeroBase = (numeroBaseRaw || '').replace(/[^0-9]/g, '');
  if (!numeroBase || !texto) return [];

  const regexCnj = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
  const matches = texto.match(regexCnj) || [];
  const lower = texto.toLowerCase();

  const resultados: Array<{
    numeroOrigem: string;
    numeroRelacionado: string;
    tipoVinculo: TipoVinculoCrossGrau;
    grauOrigem: GrauProcesso;
    grauRelacionado: GrauProcesso;
    evidencia: string;
  }> = [];

  const vistos = new Set<string>();

  for (const m of matches) {
    const outroLimpo = m.replace(/[^0-9]/g, '');
    if (!outroLimpo || outroLimpo === numeroBase || vistos.has(outroLimpo)) {
      continue;
    }
    vistos.add(outroLimpo);

    let tipoVinculo: TipoVinculoCrossGrau = 'CONEXO';
    let grauOrigem: GrauProcesso = inferirGrauProcesso(siglaTribunalBase);
    let grauRelacionado: GrauProcesso = 'G2';

    if (
      lower.includes('originário') ||
      lower.includes('originario') ||
      lower.includes('agravo de instrumento') ||
      lower.includes('processo de origem')
    ) {
      tipoVinculo = 'ORIGINARIO';
      grauOrigem = 'G1';
      grauRelacionado = 'G2';
    } else if (
      lower.includes('recurso especial') ||
      lower.includes('recurso extraordinário') ||
      lower.includes('recurso extraordinario') ||
      lower.includes('recurso de revista') ||
      lower.includes('stj') ||
      lower.includes('tst') ||
      lower.includes('stf')
    ) {
      tipoVinculo = 'TRIBUNAL_SUPERIOR';
      grauOrigem = 'G2';
      grauRelacionado = 'SUP';
    } else if (
      lower.includes('cumprimento de sentença') ||
      lower.includes('cumprimento de sentenca') ||
      lower.includes('execução definitiva') ||
      lower.includes('execucao definitiva')
    ) {
      tipoVinculo = 'CUMPRIMENTO_SENTENCA';
      grauOrigem = 'G1';
      grauRelacionado = 'EXECUCAO';
    } else if (
      lower.includes('incidente') ||
      lower.includes('desconsideração') ||
      lower.includes('desconsideracao')
    ) {
      tipoVinculo = 'INCIDENTE';
    }

    resultados.push({
      numeroOrigem: tipoVinculo === 'ORIGINARIO' ? outroLimpo : numeroBase,
      numeroRelacionado: tipoVinculo === 'ORIGINARIO' ? numeroBase : outroLimpo,
      tipoVinculo,
      grauOrigem,
      grauRelacionado,
      evidencia: `CNJ ${m} citado no texto da publicação`,
    });
  }

  return resultados;
}

/**
 * Persiste vínculos cross-grau detectados no banco SQLite.
 */
export async function registrarVinculosCrossGrau(
  vinculos: Array<{
    numeroOrigem: string;
    numeroRelacionado: string;
    tipoVinculo: TipoVinculoCrossGrau;
    grauOrigem?: GrauProcesso;
    grauRelacionado?: GrauProcesso;
    tribunalOrigem?: string;
    tribunalRelacionado?: string;
    evidencia?: string;
  }>
): Promise<number> {
  let salvos = 0;
  for (const v of vinculos) {
    const orig = (v.numeroOrigem || '').replace(/[^0-9]/g, '');
    const rel = (v.numeroRelacionado || '').replace(/[^0-9]/g, '');
    if (!orig || !rel || orig === rel) continue;

    await prisma.vinculoCrossGrau.upsert({
      where: {
        numeroOrigem_numeroRelacionado_tipoVinculo: {
          numeroOrigem: orig,
          numeroRelacionado: rel,
          tipoVinculo: v.tipoVinculo,
        },
      },
      create: {
        numeroOrigem: orig,
        numeroRelacionado: rel,
        tipoVinculo: v.tipoVinculo,
        grauOrigem: v.grauOrigem || 'G1',
        grauRelacionado: v.grauRelacionado || 'G2',
        tribunalOrigem: v.tribunalOrigem ?? null,
        tribunalRelacionado: v.tribunalRelacionado ?? null,
        evidencia: v.evidencia ?? null,
      },
      update: {
        evidencia: v.evidencia ?? undefined,
      },
    });
    salvos += 1;
  }
  return salvos;
}

/**
 * Issue #92: Constrói a árvore processual cross-grau (1º Grau, 2º Grau, STJ/TST e Cumprimento)
 * unificando nós e timeline de publicações de todos os graus vinculados.
 */
export async function construirArvoreCrossGrau(
  numeroProcessoRaw: string
): Promise<ArvoreCrossGrauResultado> {
  const numeroRaiz = (numeroProcessoRaw || '').replace(/[^0-9]/g, '');

  const vinculos = await prisma.vinculoCrossGrau.findMany({
    where: {
      OR: [{ numeroOrigem: numeroRaiz }, { numeroRelacionado: numeroRaiz }],
    },
  });

  const todosNumeros = new Set<string>([numeroRaiz]);
  for (const v of vinculos) {
    todosNumeros.add(v.numeroOrigem);
    todosNumeros.add(v.numeroRelacionado);
  }

  const processos = await prisma.processo.findMany({
    where: { numeroProcesso: { in: Array.from(todosNumeros) } },
    include: {
      publicacoes: {
        orderBy: { dataDisponibilizacao: 'desc' },
        take: 15,
      },
    },
  });

  const mapaProc = new Map(processos.map((p) => [p.numeroProcesso, p]));

  const montarNo = (
    num: string,
    grauPadrao: GrauProcesso,
    tipoVinculoComRaiz?: TipoVinculoCrossGrau,
    evidencia?: string | null
  ): NoArvoreProcessual => {
    const p = mapaProc.get(num);
    return {
      numeroProcesso: num,
      numeroFormatado: p?.numeroFormatado || num,
      grau: p ? inferirGrauProcesso(p.siglaTribunal, p.classeProcessual) : grauPadrao,
      siglaTribunal: p?.siglaTribunal || 'N/I',
      classeProcessual: p?.classeProcessual || 'Não carregada',
      orgaoJulgador: p?.orgaoJulgador || 'Não informado',
      faseProcessual: p?.faseProcessual || 'Andamento',
      prazoFatal: p?.prazoFatal || null,
      tipoVinculoComRaiz,
      evidencia,
    };
  };

  const raiz = montarNo(numeroRaiz, 'G1');
  const originarios: NoArvoreProcessual[] = [];
  const recursosECumprimentos: NoArvoreProcessual[] = [];

  for (const v of vinculos) {
    if (v.numeroRelacionado === numeroRaiz) {
      originarios.push(
        montarNo(
          v.numeroOrigem,
          (v.grauOrigem as GrauProcesso) || 'G1',
          v.tipoVinculo as TipoVinculoCrossGrau,
          v.evidencia
        )
      );
    } else if (v.numeroOrigem === numeroRaiz) {
      recursosECumprimentos.push(
        montarNo(
          v.numeroRelacionado,
          (v.grauRelacionado as GrauProcesso) || 'G2',
          v.tipoVinculo as TipoVinculoCrossGrau,
          v.evidencia
        )
      );
    }
  }

  const timelineUnificada: ArvoreCrossGrauResultado['timelineUnificada'] = [];
  for (const p of processos) {
    const grau = inferirGrauProcesso(p.siglaTribunal, p.classeProcessual);
    for (const pub of p.publicacoes) {
      timelineUnificada.push({
        data: pub.dataDisponibilizacao,
        grau,
        numeroProcesso: p.numeroFormatado || p.numeroProcesso,
        tribunal: p.siglaTribunal,
        tipoAto: pub.tipoAtoDetectado,
        resumo: (pub.texto || '').slice(0, 220),
      });
    }
  }

  timelineUnificada.sort((a, b) => b.data.localeCompare(a.data));

  const grausPresentes = Array.from(
    new Set<GrauProcesso>([
      raiz.grau,
      ...originarios.map((o) => o.grau),
      ...recursosECumprimentos.map((r) => r.grau),
    ])
  );

  return {
    numeroRaiz,
    totalNos: 1 + originarios.length + recursosECumprimentos.length,
    grausPresentes,
    raiz,
    originarios,
    recursosECumprimentos,
    timelineUnificada,
  };
}
