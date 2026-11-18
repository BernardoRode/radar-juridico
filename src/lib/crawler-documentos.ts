import { extractText } from 'unpdf';
import { extrairAlertasTexto } from '@/lib/inteligencia';
import { ResultadoExtracaoDocumento } from '@/types/juridico';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RadarJuridico/1.0';
const FETCH_TIMEOUT_MS = 15000;

export interface ExtracaoComBinario {
  resultado: ResultadoExtracaoDocumento;
  pdfBuffer?: Buffer;
}

function detectarSistema(url: string): 'PJE' | 'EPROC' | 'OUTRO' {
  if (
    url.includes('pjekz/validacao') ||
    url.includes('pje.') ||
    url.includes('/validacao/')
  ) {
    return 'PJE';
  }
  if (
    url.includes('eproc') ||
    url.includes('consulta_publica_documento')
  ) {
    return 'EPROC';
  }
  return 'OUTRO';
}

function limparHtmlParaTexto(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

async function extrairTextoDePdf(
  pdfBuffer: Buffer
): Promise<{ texto: string; totalPaginas: number }> {
  const uint8 = new Uint8Array(pdfBuffer);
  const { text, totalPages } = await extractText(uint8, { mergePages: true });
  return {
    texto: (text || '').trim(),
    totalPaginas: totalPages || 1,
  };
}

async function fetchComTimeout(
  url: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        ...headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function extrairPje(parsedUrl: URL): Promise<ExtracaoComBinario> {
  const partesPath = parsedUrl.pathname.split('/').filter(Boolean);
  const idxValidacao = partesPath.findIndex((p) => p === 'validacao');
  const codigoValidacao =
    idxValidacao !== -1 ? partesPath[idxValidacao + 1] : undefined;
  const instancia = parsedUrl.searchParams.get('instancia') || '1';

  if (!codigoValidacao) {
    return {
      resultado: {
        sistema: 'PJE',
        statusExtracao: 'ERRO',
        urlOriginal: parsedUrl.toString(),
        temPdfDisponivel: false,
        mensagem:
          'Não foi possível identificar o código de validação na URL do PJe.',
      },
    };
  }

  const apiUrl = `${parsedUrl.origin}/pje-comum-api/api/assinaturas2/validacao/${encodeURIComponent(
    codigoValidacao
  )}?instancia=${encodeURIComponent(instancia)}`;

  const res = await fetchComTimeout(apiUrl, { Accept: 'application/json' });

  if (!res.ok) {
    return {
      resultado: {
        sistema: 'PJE',
        statusExtracao: 'INDISPONIVEL',
        urlOriginal: parsedUrl.toString(),
        endpointConsultado: apiUrl,
        temPdfDisponivel: false,
        mensagem: `A API pública de validação do PJe retornou status ${res.status}.`,
      },
    };
  }

  const dados = (await res.json()) as {
    resultadoValidacao?: string;
    dataHoraAssinatura?: string;
    assinadoPor?: string;
    algoritmoAssinatura?: string;
    tituloDocumento?: string;
    conteudoPdf?: string;
  };

  if (!dados.conteudoPdf) {
    return {
      resultado: {
        sistema: 'PJE',
        statusExtracao: 'INDISPONIVEL',
        urlOriginal: parsedUrl.toString(),
        endpointConsultado: apiUrl,
        tituloDocumento: dados.tituloDocumento,
        resultadoValidacao: dados.resultadoValidacao,
        assinadoPor: dados.assinadoPor,
        dataHoraAssinatura: dados.dataHoraAssinatura,
        algoritmoAssinatura: dados.algoritmoAssinatura,
        temPdfDisponivel: false,
        mensagem:
          'Metadados de assinatura obtidos no PJe, mas o PDF não foi retornado pelo tribunal.',
      },
    };
  }

  const pdfBuffer = Buffer.from(dados.conteudoPdf, 'base64');
  let textoExtraido = '';
  let totalPaginas = 1;

  try {
    const pdfInfo = await extrairTextoDePdf(pdfBuffer);
    textoExtraido = pdfInfo.texto;
    totalPaginas = pdfInfo.totalPaginas;
  } catch {
    textoExtraido =
      '[PDF binário obtido com sucesso, mas não foi possível extrair texto selecionável.]';
  }

  const alertasDoDocumento = textoExtraido
    ? extrairAlertasTexto(textoExtraido, dados.tituloDocumento)
    : undefined;

  return {
    pdfBuffer,
    resultado: {
      sistema: 'PJE',
      statusExtracao: 'SUCESSO',
      urlOriginal: parsedUrl.toString(),
      endpointConsultado: apiUrl,
      tituloDocumento: dados.tituloDocumento || 'Documento PJe',
      resultadoValidacao: dados.resultadoValidacao,
      assinadoPor: dados.assinadoPor,
      dataHoraAssinatura: dados.dataHoraAssinatura,
      algoritmoAssinatura: dados.algoritmoAssinatura,
      totalPaginas,
      tamanhoPdfBytes: pdfBuffer.length,
      temPdfDisponivel: true,
      textoExtraido,
      alertasDoDocumento,
      mensagem:
        'Documento original e assinatura digital extraídos com sucesso via API pública do PJe.',
    },
  };
}

async function extrairEprocOuGenerico(
  parsedUrl: URL,
  sistema: 'EPROC' | 'OUTRO'
): Promise<ExtracaoComBinario> {
  const url = parsedUrl.toString();
  const res = await fetchComTimeout(url, {
    Accept: 'text/html,application/pdf,application/xhtml+xml,*/*',
  });

  if (!res.ok) {
    return {
      resultado: {
        sistema,
        statusExtracao: 'INDISPONIVEL',
        urlOriginal: url,
        temPdfDisponivel: false,
        mensagem: `O portal do tribunal retornou status ${res.status}.`,
      },
    };
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawBuffer = Buffer.from(await res.arrayBuffer());

  if (contentType.includes('application/pdf')) {
    const { texto, totalPaginas } = await extrairTextoDePdf(rawBuffer);
    return {
      pdfBuffer: rawBuffer,
      resultado: {
        sistema,
        statusExtracao: 'SUCESSO',
        urlOriginal: url,
        tituloDocumento: 'Documento PDF do Tribunal',
        totalPaginas,
        tamanhoPdfBytes: rawBuffer.length,
        temPdfDisponivel: true,
        textoExtraido: texto,
        alertasDoDocumento: texto ? extrairAlertasTexto(texto) : undefined,
        mensagem: 'PDF original baixado e texto extraído com sucesso.',
      },
    };
  }

  const charset = contentType.includes('iso-8859-1') ? 'iso-8859-1' : 'utf-8';
  const html = new TextDecoder(charset).decode(rawBuffer);

  const temCaptcha =
    html.includes('cf-turnstile') ||
    html.includes('challenges.cloudflare.com/turnstile') ||
    html.includes('g-recaptcha') ||
    html.includes('h-captcha') ||
    html.includes('infraCaptcha');

  if (temCaptcha) {
    return {
      resultado: {
        sistema,
        statusExtracao: 'CAPTCHA_NECESSARIO',
        urlOriginal: url,
        temPdfDisponivel: false,
        mensagem:
          'O portal do tribunal protege este documento com verificação humana (CAPTCHA / Cloudflare Turnstile). Abra o link original no navegador para validar o acesso.',
      },
    };
  }

  const textoExtraido = limparHtmlParaTexto(html);
  return {
    resultado: {
      sistema,
      statusExtracao: 'SUCESSO',
      urlOriginal: url,
      tituloDocumento: 'Documento HTML do Tribunal',
      temPdfDisponivel: false,
      textoExtraido: textoExtraido.slice(0, 20000),
      alertasDoDocumento: textoExtraido
        ? extrairAlertasTexto(textoExtraido)
        : undefined,
      mensagem: 'Conteúdo textual extraído diretamente da página do tribunal.',
    },
  };
}

/**
 * Faz o crawling do documento original a partir de um link de validação (PJe, eproc ou tribunal).
 * Respeita integralmente barreiras de verificação humana (CAPTCHA/Turnstile), reportando-as sem tentar burlar.
 */
export async function extrairDocumentoPorUrl(
  url: string
): Promise<ExtracaoComBinario> {
  const parsedUrl = new URL(url);
  const sistema = detectarSistema(url);

  try {
    if (sistema === 'PJE') {
      return await extrairPje(parsedUrl);
    }
    return await extrairEprocOuGenerico(parsedUrl, sistema);
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Erro inesperado ao consultar o documento no tribunal.';
    return {
      resultado: {
        sistema,
        statusExtracao: 'ERRO',
        urlOriginal: url,
        temPdfDisponivel: false,
        mensagem: `Falha ao acessar o documento do tribunal: ${msg}`,
      },
    };
  }
}
