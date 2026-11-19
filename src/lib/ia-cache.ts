import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export type TipoCacheIA = 'ANALISE_PUBLICACAO' | 'PRE_MINUTA' | 'RAG_CHAT';

/**
 * Issue #77: Limpeza de ruído de contexto jurídico (Context Pruning).
 * Remove cabeçalhos/rodapés repetitivos de assinatura eletrônica do DJEN/PJe/eproc,
 * separadores longos e espaços redundantes antes de enviar o texto à LLM,
 * economizando tokens sem perder nenhuma informação jurídica relevante.
 */
export function limparRuidoContextoJuridico(
  texto: string,
  maxChars = 5000
): string {
  if (!texto) return '';

  const limpo = texto
    // Remove avisos padronizados de validação de assinatura eletrônica
    .replace(
      /Documento assinado eletronicamente por[\s\S]{0,350}?(?:Lei\s*11\.419\/2006\.?|ICP-Brasil\.?|\n|$)/gi,
      ' '
    )
    .replace(
      /A autenticidade do documento pode ser conferida[\s\S]{0,280}?(?:CRC\s*[A-Z0-9-]+|\n|$)/gi,
      ' '
    )
    .replace(/Código verificador:\s*[A-Z0-9-]{6,}/gi, '')
    .replace(/Código CRC:\s*[A-Z0-9-]{4,}/gi, '')
    // Remove URLs muito longas de validação/rastreamento (preserva links curtos de audiência)
    .replace(/https?:\/\/[^\s]{90,}/gi, '[URL_LONGA_OMITIDA]')
    // Remove linhas puramente decorativas (===, ---, ___, ***)
    .replace(/[=\-_~*]{5,}/g, ' ')
    // Normaliza quebras de linha e espaços excessivos
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (limpo.length <= maxChars) return limpo;
  return `${limpo.slice(0, maxChars).trim()}...`;
}

/**
 * Issue #77: Gera hash SHA-256 determinístico para deduplicar chamadas de IA idênticas.
 */
export function gerarHashContextoIA(
  tipo: TipoCacheIA,
  conteudoNormalizado: string
): string {
  const base = `${tipo}|${conteudoNormalizado
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()}`;
  return crypto.createHash('sha256').update(base, 'utf8').digest('hex');
}

/**
 * Busca resposta de IA previamente calculada no banco (0 tokens gastos).
 */
export async function buscarCacheAnaliseIA<T>(
  hashConteudo: string
): Promise<{
  dados: T;
  provedorIA: string;
  modeloIA: string | null;
  hits: number;
} | null> {
  try {
    const registro = await prisma.cacheAnaliseIA.findUnique({
      where: { hashConteudo },
    });
    if (!registro) return null;
    if (registro.expiraEm.getTime() <= Date.now()) {
      return null;
    }

    const dados = JSON.parse(registro.respostaJson) as T;
    // Incrementa contador de economia em background
    prisma.cacheAnaliseIA
      .update({
        where: { id: registro.id },
        data: { hits: { increment: 1 } },
      })
      .catch(() => {});

    return {
      dados,
      provedorIA: registro.provedorIA,
      modeloIA: registro.modeloIA,
      hits: registro.hits + 1,
    };
  } catch {
    return null;
  }
}

/**
 * Grava resposta de IA real no banco para reuso futuro com TTL configurável.
 */
export async function salvarCacheAnaliseIA(params: {
  hashConteudo: string;
  tipo: TipoCacheIA;
  provedorIA: string;
  modeloIA?: string | null;
  dados: unknown;
  ttlHoras?: number;
}): Promise<void> {
  try {
    const ttlHoras = params.ttlHoras ?? 168; // 7 dias por padrão
    const expiraEm = new Date(Date.now() + ttlHoras * 60 * 60 * 1000);
    const respostaJson = JSON.stringify(params.dados);

    await prisma.cacheAnaliseIA.upsert({
      where: { hashConteudo: params.hashConteudo },
      create: {
        hashConteudo: params.hashConteudo,
        tipo: params.tipo,
        provedorIA: params.provedorIA,
        modeloIA: params.modeloIA || null,
        respostaJson,
        hits: 1,
        expiraEm,
      },
      update: {
        provedorIA: params.provedorIA,
        modeloIA: params.modeloIA || null,
        respostaJson,
        expiraEm,
      },
    });
  } catch {
    // Nunca quebra a requisição se o cache falhar
  }
}
