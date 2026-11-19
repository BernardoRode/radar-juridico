import { DadosDatajud, MovimentoDatajud } from '@/types/juridico';
import { prisma } from '@/lib/prisma';

const cacheDatajudMemoria = new Map<
  string,
  { expiraEm: number; dados: DadosDatajud }
>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutos (Issue #34: Cache Anti-429 L1 + L2 Prisma)

const DATAJUD_PUBLIC_API_KEY =
  process.env.DATAJUD_API_KEY ||
  'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

const ESTADOS_TR: Record<string, string> = {
  '01': 'ac',
  '02': 'al',
  '03': 'ap',
  '04': 'am',
  '05': 'ba',
  '06': 'ce',
  '07': 'df',
  '08': 'es',
  '09': 'go',
  '10': 'ma',
  '11': 'mt',
  '12': 'ms',
  '13': 'mg',
  '14': 'pa',
  '15': 'pb',
  '16': 'pr',
  '17': 'pe',
  '18': 'pi',
  '19': 'rj',
  '20': 'rn',
  '21': 'rs',
  '22': 'ro',
  '23': 'rr',
  '24': 'sc',
  '25': 'se',
  '26': 'sp',
  '27': 'to',
};

/**
 * Resolve o índice da API Pública do Datajud (ex: `api_publica_trf4`, `api_publica_trt4`, `api_publica_tjrs`)
 * a partir da sigla do tribunal ou dos dígitos J.TR do número CNJ de 20 dígitos.
 */
export function resolverIndiceDatajud(
  numeroProcesso: string,
  siglaTribunal?: string
): string | null {
  const sig = (siglaTribunal || '').trim().toUpperCase();

  // Seções Judiciárias da Justiça Federal mapeiam para seus TRFs no Datajud
  const mapaSecoesFederais: Record<string, string> = {
    JFRS: 'trf4',
    JFSC: 'trf4',
    JFPR: 'trf4',
    JFSP: 'trf3',
    JFMS: 'trf3',
    JFRJ: 'trf2',
    JFES: 'trf2',
    JFMG: 'trf6',
  };
  if (sig && mapaSecoesFederais[sig]) {
    return `api_publica_${mapaSecoesFederais[sig]}`;
  }

  // Tenta extrair pelos dígitos padrão CNJ: NNNNNNN DD AAAA J TR OOOO (20 dígitos)
  const limpo = numeroProcesso.replace(/[^0-9]/g, '');
  if (limpo.length === 20) {
    const j = limpo[13];
    const tr = limpo.slice(14, 16);

    if (j === '1') return 'api_publica_stf';
    if (j === '2') return 'api_publica_cnj';
    if (j === '3') return 'api_publica_stj';
    if (j === '4') return `api_publica_trf${parseInt(tr, 10)}`;
    if (j === '5') {
      return tr === '00' ? 'api_publica_tst' : `api_publica_trt${parseInt(tr, 10)}`;
    }
    if (j === '6') {
      const uf = ESTADOS_TR[tr];
      return uf ? `api_publica_tre-${uf}` : 'api_publica_tse';
    }
    if (j === '7') return 'api_publica_stm';
    if (j === '8') {
      const uf = ESTADOS_TR[tr];
      if (uf === 'df') return 'api_publica_tjdft';
      return uf ? `api_publica_tj${uf}` : null;
    }
    if (j === '9') {
      const uf = ESTADOS_TR[tr];
      return uf ? `api_publica_tjm${uf}` : null;
    }
  }

  if (sig) {
    return `api_publica_${sig.toLowerCase()}`;
  }

  return null;
}

function formatarDataAjuizamento(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    const ano = digits.slice(0, 4);
    const mes = digits.slice(4, 6);
    const dia = digits.slice(6, 8);
    const hora = digits.length >= 12 ? ` ${digits.slice(8, 10)}:${digits.slice(10, 12)}` : '';
    return `${dia}/${mes}/${ano}${hora}`;
  }
  return raw;
}

/**
 * Consulta a API Pública do Datajud (CNJ) para obter capa, classe, assuntos (TPU),
 * data de distribuição/ajuizamento e a árvore completa de movimentações do processo.
 * Usa cache em 2 níveis (Memória L1 + Banco Prisma L2 `CacheDatajud`) para proteção Anti-429.
 */
export async function consultarDatajudProcesso(
  numeroProcesso: string,
  siglaTribunal?: string
): Promise<DadosDatajud> {
  const numLimpo = numeroProcesso.replace(/[^0-9]/g, '');

  // L1: Cache em memória
  const emCache = cacheDatajudMemoria.get(numLimpo);
  if (emCache && emCache.expiraEm > Date.now()) {
    return { ...emCache.dados, origemCache: true };
  }

  // L2: Cache persistido no banco (Issue #34)
  try {
    const cacheDb = await prisma.cacheDatajud.findUnique({
      where: { numeroProcesso: numLimpo },
    });
    if (cacheDb && cacheDb.expiraEm.getTime() > Date.now()) {
      const dadosDb = JSON.parse(cacheDb.dadosJson) as DadosDatajud;
      cacheDatajudMemoria.set(numLimpo, {
        expiraEm: cacheDb.expiraEm.getTime(),
        dados: dadosDb,
      });
      return { ...dadosDb, origemCache: true };
    }
  } catch {
    // Continua consulta ao vivo se tabela não disponível
  }

  const indice = resolverIndiceDatajud(numLimpo, siglaTribunal);

  if (!indice) {
    return {
      encontrado: false,
      indiceConsultado: 'desconhecido',
      numeroProcesso: numLimpo,
      assuntos: [],
      totalMovimentos: 0,
      movimentos: [],
      mensagem:
        'Não foi possível identificar o tribunal/índice do Datajud para este número de processo.',
    };
  }

  const url = `https://api-publica.datajud.cnj.jus.br/${indice}/_search`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `APIKey ${DATAJUD_PUBLIC_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: {
          match: {
            numeroProcesso: numLimpo,
          },
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        encontrado: false,
        indiceConsultado: indice,
        numeroProcesso: numLimpo,
        assuntos: [],
        totalMovimentos: 0,
        movimentos: [],
        mensagem: `A API Pública do Datajud retornou status ${response.status} para o índice ${indice}.`,
      };
    }

    const json = await response.json();
    const hits = json?.hits?.hits || [];

    if (hits.length === 0) {
      return {
        encontrado: false,
        indiceConsultado: indice,
        numeroProcesso: numLimpo,
        assuntos: [],
        totalMovimentos: 0,
        movimentos: [],
        mensagem: `Processo não localizado na base pública do Datajud (${indice}). Processos em segredo de justiça ou recém-distribuídos podem ainda não constar no índice.`,
      };
    }

    // Se houver mais de um grau (G1, G2), prioriza o de atualização mais recente
    const ordenado = [...hits].sort((a, b) => {
      const da = a?._source?.dataHoraUltimaAtualizacao || '';
      const db = b?._source?.dataHoraUltimaAtualizacao || '';
      return db.localeCompare(da);
    });

    const src = ordenado[0]._source;
    const movimentosBrutos: MovimentoDatajud[] = Array.isArray(src.movimentos)
      ? src.movimentos
      : [];

    const movimentosOrdenados = [...movimentosBrutos].sort((a, b) =>
      (b.dataHora || '').localeCompare(a.dataHora || '')
    );

    // Issue #42: Detecta protocolo de petição nos últimos movimentos para baixa automática de prazo
    const movProtocolo = movimentosOrdenados.slice(0, 5).find((m) => {
      const n = (m.nome || '').toLowerCase();
      return (
        m.codigo === 85 ||
        n.includes('petição') ||
        n.includes('juntada de petição') ||
        n.includes('contestação') ||
        n.includes('recurso')
      );
    });
    const protocoloRecenteDetectado = movProtocolo
      ? `${movProtocolo.nome} em ${(movProtocolo.dataHora || '').slice(0, 10)}`
      : undefined;

    const resultadoFinal: DadosDatajud = {
      encontrado: true,
      indiceConsultado: indice,
      numeroProcesso: src.numeroProcesso || numLimpo,
      tribunal: src.tribunal,
      grau: src.grau,
      classe: src.classe,
      assuntos: Array.isArray(src.assuntos) ? src.assuntos : [],
      dataAjuizamento: formatarDataAjuizamento(src.dataAjuizamento),
      dataHoraUltimaAtualizacao: src.dataHoraUltimaAtualizacao,
      orgaoJulgador: src.orgaoJulgador,
      sistema: src.sistema,
      formato: src.formato,
      nivelSigilo: src.nivelSigilo,
      totalMovimentos: movimentosOrdenados.length,
      movimentos: movimentosOrdenados,
      protocoloRecenteDetectado,
    };

    const expiraEmMs = Date.now() + CACHE_TTL_MS;
    cacheDatajudMemoria.set(numLimpo, {
      expiraEm: expiraEmMs,
      dados: resultadoFinal,
    });

    // Persiste cache L2 + enriquecimento do processo no banco
    prisma.cacheDatajud
      .upsert({
        where: { numeroProcesso: numLimpo },
        create: {
          numeroProcesso: numLimpo,
          indiceConsultado: indice,
          dadosJson: JSON.stringify(resultadoFinal),
          expiraEm: new Date(expiraEmMs),
        },
        update: {
          indiceConsultado: indice,
          dadosJson: JSON.stringify(resultadoFinal),
          expiraEm: new Date(expiraEmMs),
        },
      })
      .catch(() => {});

    prisma.processo
      .update({
        where: { numeroProcesso: numLimpo },
        data: {
          dataAjuizamento: resultadoFinal.dataAjuizamento || null,
          assuntosJson: JSON.stringify(resultadoFinal.assuntos),
        },
      })
      .catch(() => {});

    return resultadoFinal;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return {
      encontrado: false,
      indiceConsultado: indice,
      numeroProcesso: numLimpo,
      assuntos: [],
      totalMovimentos: 0,
      movimentos: [],
      mensagem: `Falha ao consultar o Datajud: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
