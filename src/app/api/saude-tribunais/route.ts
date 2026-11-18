import { NextResponse } from 'next/server';

interface StatusServicoTribunal {
  servico: string;
  sistema: string;
  status: 'ONLINE' | 'INSTAVEL' | 'INDISPONIVEL';
  httpStatus: number;
  latenciaMs: number;
  urlCertidaoIndisponibilidade: string;
  verificadoEm: string;
}

async function testarEndpoint(
  servico: string,
  sistema: string,
  url: string,
  urlCertidaoIndisponibilidade: string,
  init?: RequestInit
): Promise<StatusServicoTribunal> {
  const inicio = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
    const latenciaMs = Date.now() - inicio;
    let status: StatusServicoTribunal['status'] = 'ONLINE';
    if (!res.ok) {
      status = res.status === 429 ? 'INSTAVEL' : 'INDISPONIVEL';
    } else if (latenciaMs > 4000) {
      status = 'INSTAVEL';
    }
    return {
      servico,
      sistema,
      status,
      httpStatus: res.status,
      latenciaMs,
      urlCertidaoIndisponibilidade,
      verificadoEm: new Date().toISOString(),
    };
  } catch {
    return {
      servico,
      sistema,
      status: 'INDISPONIVEL',
      httpStatus: 0,
      latenciaMs: Date.now() - inicio,
      urlCertidaoIndisponibilidade,
      verificadoEm: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/saude-tribunais
 * Issue #40 + Issue #50: Monitora em tempo real a disponibilidade e latência dos barramentos
 * do CNJ (DJEN, PJe Validação e Datajud) e fornece o link direto da certidão de indisponibilidade.
 */
export async function GET() {
  const servicos = await Promise.all([
    testarEndpoint(
      'Comunica PJe / DJEN Nacional (CNJ)',
      'DJEN',
      'https://comunicaapi.pje.jus.br/api/v1/comunicacao?pagina=1&itensPorPagina=1&siglaTribunal=TRT4',
      'https://www.cnj.jus.br/programas-e-acoes/processo-judicial-eletronico-pje/certidoes-de-indisponibilidade/'
    ),
    testarEndpoint(
      'PJe TRT4 (API Validação de Documentos Assinados)',
      'PJE',
      'https://pje.trt4.jus.br/pje-comum-api/api/assinaturas2/validacao/26111612374902100000201044828?instancia=1',
      'https://www.trt4.jus.br/portais/trt4/pje-indisponibilidades'
    ),
    testarEndpoint(
      'eproc JFSC / TRF4 (Consulta Pública)',
      'EPROC',
      'https://eproc.jfsc.jus.br/eprocV2/',
      'https://www.trf4.jus.br/trf4/controlador.php?acao=pagina_visualizar&id_pagina=2055'
    ),
  ]);

  return NextResponse.json({
    sucesso: true,
    verificadoEm: new Date().toISOString(),
    servicos,
  });
}
