import { NextRequest, NextResponse } from 'next/server';
import { extrairDocumentoPorUrl } from '@/lib/crawler-documentos';
import { salvarDocumentoExtraidoNoBanco } from '@/lib/persistencia';
import { validarUrlTribunalPermitida } from '@/lib/seguranca';

/**
 * Endpoint que inspeciona links de validação do PJe (pjekz/validacao) e do eproc (consulta_publica_documento)
 * e faz o crawling do inteiro teor do documento original assinado pelo magistrado quando acessível sem CAPTCHA.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return NextResponse.json(
        { sucesso: false, erro: 'Informe uma URL válida do PJe ou eproc.' },
        { status: 400 }
      );
    }

    const validacao = validarUrlTribunalPermitida(url);
    if (!validacao.valida || !validacao.url) {
      return NextResponse.json(
        { sucesso: false, erro: validacao.motivo || 'URL não permitida.' },
        { status: 400 }
      );
    }

    const parsedUrl = validacao.url;
    const ehPje = url.includes('pjekz/validacao') || url.includes('pje.');
    const ehEproc = url.includes('eproc') || url.includes('consulta_publica_documento');

    // Extrai parâmetros da própria URL do documento (como número do processo, hash, instância)
    const parametrosExtraidos: Record<string, string> = {};
    parsedUrl.searchParams.forEach((val, key) => {
      parametrosExtraidos[key] = val;
    });

    if (ehPje) {
      const partesPath = parsedUrl.pathname.split('/');
      const idxValidacao = partesPath.findIndex((p) => p === 'validacao');
      if (idxValidacao !== -1 && partesPath[idxValidacao + 1]) {
        parametrosExtraidos['codigoValidacaoPJe'] = partesPath[idxValidacao + 1];
      }
    }

    const { resultado: extracao } = await extrairDocumentoPorUrl(url);
    await salvarDocumentoExtraidoNoBanco(
      extracao,
      parametrosExtraidos['numProcesso'] || body.numeroProcesso
    );

    return NextResponse.json({
      sucesso: true,
      sistemaDetectado: ehPje ? 'PJe (Processo Judicial Eletrônico)' : ehEproc ? 'eproc' : 'Portal do Tribunal',
      tribunalHost: parsedUrl.hostname,
      urlOriginal: url,
      parametrosExtraidos,
      extracao,
      explicacaoTecnica: ehPje
        ? 'Link de validação pública do PJe (pjekz/validacao). Esse link é gerado quando o magistrado assina o ato e é enviado dentro do JSON do Comunica PJe / DJEN.'
        : ehEproc
        ? 'Link de consulta pública de documento do eproc com hash criptográfico de autenticidade.'
        : 'Link externo anexado aos metadados da comunicação processual.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao analisar URL';
    return NextResponse.json({ sucesso: false, erro: msg }, { status: 500 });
  }
}
