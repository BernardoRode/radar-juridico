import { prisma } from '@/lib/prisma';
import { detectarPrecedentesVinculantes } from '@/lib/auto-update';

/**
 * Issue #78: Anonimizador jurídico LGPD.
 * Remove CPFs, CNPJs, números CNJ, e-mails e telefones antes de gravar qualquer
 * estrutura ou padrão na Memória Coletiva compartilhada entre clientes.
 */
export function anonimizarTextoJuridicoLgpd(texto: string): string {
  if (!texto) return '';

  return texto
    // Número CNJ (com máscara ou 20 dígitos seguidos)
    .replace(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g, '[PROCESSO_OCULTO]')
    .replace(/\b\d{20}\b/g, '[PROCESSO_OCULTO]')
    // CNPJ formatado
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ_OCULTO]')
    // CPF formatado
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF_OCULTO]')
    // E-mail
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_OCULTO]')
    // Telefone brasileiro
    .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4}-?\d{4})\b/g, '[TELEFONE_OCULTO]')
    // OAB individual
    .replace(/\bOAB\/[A-Z]{2}\s*(?:n[º°.]?\s*)?\d{3,7}\b/gi, '[OAB_OCULTA]')
    .trim();
}

function normalizarChaveVara(
  siglaTribunal: string,
  orgaoJulgador?: string,
  magistrado?: string
): string {
  const norm = (s?: string) =>
    (s || 'GERAL')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  return `${norm(siglaTribunal)}|${norm(orgaoJulgador)}|${norm(magistrado)}`;
}

/**
 * Issue #78: Alimenta a Memória Coletiva Anonimizada por Vara/Tribunal/Magistrado
 * sempre que uma publicação ou decisão é analisada (zero dados pessoais gravados).
 */
export async function registrarAprendizadoColetivoVara(params: {
  siglaTribunal?: string;
  orgaoJulgador?: string;
  magistrado?: string;
  textoOriginal: string;
  nivelRisco: string;
}): Promise<void> {
  try {
    const sigla = (params.siglaTribunal || '').trim().toUpperCase();
    if (!sigla) return;

    const orgao = (params.orgaoJulgador || 'Vara / Órgão Julgador').trim().slice(0, 120);
    const magistrado = params.magistrado?.trim() || null;
    const chaveUnica = normalizarChaveVara(sigla, orgao, magistrado || undefined);

    const t = (params.textoOriginal || '').toLowerCase();
    const ehCritico = params.nivelRisco === 'CRITICO' ? 1 : 0;
    const ehBloqueio =
      t.includes('sisbajud') || t.includes('bloqueio') || t.includes('penhora') ? 1 : 0;
    const ehLiminar =
      t.includes('tutela de urgência') || t.includes('liminar') ? 1 : 0;
    const precedentesNovos = detectarPrecedentesVinculantes(params.textoOriginal || '');

    const existente = await prisma.perfilColetivoVara.findUnique({
      where: { chaveUnica },
    });

    const sumulasAtuais: string[] = existente?.sumulasTemasJson
      ? JSON.parse(existente.sumulasTemasJson)
      : [];
    const sumulasCombinadas = Array.from(
      new Set([...sumulasAtuais, ...(precedentesNovos ?? [])])
    ).slice(0, 20);

    await prisma.perfilColetivoVara.upsert({
      where: { chaveUnica },
      create: {
        chaveUnica,
        siglaTribunal: sigla,
        orgaoJulgador: orgao,
        magistrado,
        totalAnalises: 1,
        totalCriticos: ehCritico,
        totalBloqueios: ehBloqueio,
        totalLiminares: ehLiminar,
        sumulasTemasJson: JSON.stringify(sumulasCombinadas),
      },
      update: {
        totalAnalises: { increment: 1 },
        totalCriticos: { increment: ehCritico },
        totalBloqueios: { increment: ehBloqueio },
        totalLiminares: { increment: ehLiminar },
        sumulasTemasJson: JSON.stringify(sumulasCombinadas),
      },
    });
  } catch {
    // Nunca quebra a análise se o aprendizado coletivo falhar
  }
}

/**
 * Issue #78: Recupera um resumo curto e 100% anonimizado do histórico coletivo
 * daquele Tribunal/Vara para enriquecer o prompt da IA para novos clientes.
 */
export async function obterContextoColetivoVara(
  siglaTribunal?: string,
  orgaoJulgador?: string
): Promise<string | null> {
  try {
    const sigla = (siglaTribunal || '').trim().toUpperCase();
    if (!sigla) return null;

    const registros = await prisma.perfilColetivoVara.findMany({
      where: {
        siglaTribunal: sigla,
        ...(orgaoJulgador ? { orgaoJulgador: { contains: orgaoJulgador.slice(0, 30) } } : {}),
      },
      orderBy: { totalAnalises: 'desc' },
      take: 3,
    });

    if (registros.length === 0) return null;

    const totalAnalises = registros.reduce((acc, r) => acc + r.totalAnalises, 0);
    const totalBloqueios = registros.reduce((acc, r) => acc + r.totalBloqueios, 0);
    const totalLiminares = registros.reduce((acc, r) => acc + r.totalLiminares, 0);
    const sumulas = Array.from(
      new Set(
        registros.flatMap((r) => {
          try {
            return r.sumulasTemasJson ? (JSON.parse(r.sumulasTemasJson) as string[]) : [];
          } catch {
            return [];
          }
        })
      )
    ).slice(0, 6);

    const partes = [
      `Histórico coletivo anônimo no ${sigla}${orgaoJulgador ? ` (${orgaoJulgador})` : ''}: ${totalAnalises} ato(s) analisado(s)`,
      `${totalBloqueios} com bloqueio/penhora`,
      `${totalLiminares} com liminar/tutela`,
    ];
    if (sumulas.length > 0) {
      partes.push(`precedentes frequentes: ${sumulas.join(', ')}`);
    }
    return partes.join(' | ');
  } catch {
    return null;
  }
}

/**
 * Issue #78: Salva uma estrutura de pré-minuta aprovada na Biblioteca Viva (100% anonimizada).
 */
export async function salvarMinutaValidadaAnonimizada(params: {
  tipoMinuta: string;
  siglaTribunal: string;
  tituloPeca: string;
  minutaOriginal: string;
}) {
  const estruturaAnonimizada = anonimizarTextoJuridicoLgpd(params.minutaOriginal).slice(0, 4000);
  return prisma.modeloMinutaValidada.create({
    data: {
      tipoMinuta: params.tipoMinuta.toUpperCase(),
      siglaTribunal: params.siglaTribunal.toUpperCase(),
      tituloPeca: params.tituloPeca.slice(0, 180),
      estruturaAnonimizada,
      aprovacoes: 1,
    },
  });
}

/**
 * Busca a melhor estrutura anonimizada (few-shot) da Biblioteca Viva para guiar a IA.
 */
export async function buscarReferenciaMinutaAnonimizada(
  tipoMinuta: string,
  siglaTribunal: string
): Promise<string | null> {
  try {
    const modelo = await prisma.modeloMinutaValidada.findFirst({
      where: {
        tipoMinuta: tipoMinuta.toUpperCase(),
        siglaTribunal: siglaTribunal.toUpperCase(),
      },
      orderBy: [{ aprovacoes: 'desc' }, { atualizadoEm: 'desc' }],
    });
    if (modelo) return modelo.estruturaAnonimizada.slice(0, 2200);

    const generico = await prisma.modeloMinutaValidada.findFirst({
      where: { tipoMinuta: tipoMinuta.toUpperCase() },
      orderBy: [{ aprovacoes: 'desc' }, { atualizadoEm: 'desc' }],
    });
    return generico ? generico.estruturaAnonimizada.slice(0, 2200) : null;
  } catch {
    return null;
  }
}
