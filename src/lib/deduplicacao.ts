import crypto from 'crypto';

/**
 * Issue #101: Deduplicação Cross-Fonte (Portal Eletrônico vs. DJEN) e Prevalência do Tema Repetitivo 1.180 do STJ.
 */

export function gerarChaveDeduplicacaoAto(
  numeroProcesso: string,
  dataBase: string,
  texto: string
): string {
  const num = (numeroProcesso || '').replace(/[^0-9]/g, '');
  const dataNorm = (dataBase || '').slice(0, 10);
  const textoNorm = (texto || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return crypto
    .createHash('sha256')
    .update(`${num}|${dataNorm}|${textoNorm}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
}

export interface ResultadoPrevalenciaTema1180 {
  fontePrevalente: 'PORTAL_ELETRONICO' | 'DJEN';
  prazoCienciaTacitaDiasCorridos?: number;
  regraAplicada: string;
}

/**
 * Aplica a tese do Tema Repetitivo 1.180 do STJ:
 * Havendo duplicidade entre intimação via Portal Eletrônico e DJe/DJEN, prevalece a intimação
 * eletrônica pelo portal (Lei 11.419/2006, art. 5º), com ciência tácita em 10 dias corridos caso não aberta.
 */
export function resolverPrevalenciaTema1180STJ(params: {
  meio?: string;
  houveIntimacaoPortal?: boolean;
  dataDisponibilizacaoDjen?: string;
  dataIntimacaoPortal?: string;
}): ResultadoPrevalenciaTema1180 {
  if (params.houveIntimacaoPortal || (params.meio || '').toUpperCase() === 'E') {
    return {
      fontePrevalente: 'PORTAL_ELETRONICO',
      prazoCienciaTacitaDiasCorridos: 10,
      regraAplicada:
        'Tema Repetitivo 1.180 STJ + Art. 5º Lei 11.419/2006: havendo dupla intimação (Portal + DJe), prevalece a intimação eletrônica do Portal (ciência no acesso ou tácita após 10 dias corridos).',
    };
  }

  return {
    fontePrevalente: 'DJEN',
    regraAplicada:
      'Res. CNJ 455/569 + Art. 224 CPC: contagem pela disponibilização no Diário de Justiça Eletrônico Nacional (DJEN).',
  };
}
