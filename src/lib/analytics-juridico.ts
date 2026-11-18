import { ProcessoAutoGerido } from '@/types/juridico';

export interface RelatorioBIJuridico {
  // Issue #24 + #45: Provisionamento Financeiro & Valor em Risco
  passivoTotalEstimadoRS: number;
  passivoFormatado: string;
  contingenciaPorRisco: {
    provavelRS: number;
    possivelRS: number;
    remotoRS: number;
  };
  // Issue #18: Mapa de Calor por Tribunal
  distribuicaoPorTribunal: Array<{
    tribunal: string;
    totalProcessos: number;
    urgenciaAlta: number;
  }>;
  // Issue #12: Jurimetria por Vara / Órgão Julgador
  topOrgaosJulgadores: Array<{
    orgao: string;
    tribunal: string;
    processos: number;
    fasePredominante: string;
  }>;
  // Issue #16: Monitor de Autores Contumazes / Advogados Ofensores
  autoresOuAdvogadosRecorrentes: Array<{
    nome: string;
    tipo: 'PARTE_RECORRENTE' | 'ADVOGADO_EXTERNO';
    quantidadeProcessos: number;
  }>;
  // Issue #19 + #55: Benchmark Nosso Escritório vs. Concorrência (SLA Legal Ops)
  benchmarkConcorrencia: {
    nossoEscritorio: { processos: number; incidentesCriticos: number };
    concorrencia: { processos: number; incidentesCriticos: number };
    semAdvogado: { processos: number; incidentesCriticos: number };
  };
  // Issue #17: Radar de Precatórios, RPVs e Alvarás
  oportunidadesCreditoAlvara: Array<{
    numeroFormatado: string;
    tribunal: string;
    valorDetectado?: string;
    ato: string;
  }>;
  // Issue #20: Radar Societário (IDPJ / Falência / RJ)
  alertasSocietariosIdpj: Array<{
    numeroFormatado: string;
    tribunal: string;
    evento: string;
  }>;
}

function extrairValorNumericoRS(valorStr?: string): number {
  if (!valorStr) return 0;
  const limpo = valorStr
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function formatarMoedaBR(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Consolida automaticamente os indicadores de Jurimetria (#12), Litigância Contumaz (#16),
 * Precatórios/Alvarás (#17), Mapa de Calor (#18), Benchmark/SLA (#19/#55), IDPJ/RJ (#20)
 * e Provisionamento Financeiro (#24/#45) a partir da carteira de processos.
 */
export function gerarRelatorioBIJuridico(
  processos: ProcessoAutoGerido[]
): RelatorioBIJuridico {
  let passivoTotalEstimadoRS = 0;
  let provavelRS = 0;
  let possivelRS = 0;
  let remotoRS = 0;

  const mapaTribunal = new Map<string, { totalProcessos: number; urgenciaAlta: number }>();
  const mapaOrgao = new Map<
    string,
    { tribunal: string; processos: number; fasePredominante: string }
  >();
  const mapaPartes = new Map<string, number>();
  const mapaAdvExternos = new Map<string, number>();

  const oportunidadesCreditoAlvara: RelatorioBIJuridico['oportunidadesCreditoAlvara'] = [];
  const alertasSocietariosIdpj: RelatorioBIJuridico['alertasSocietariosIdpj'] = [];

  const benchmarkConcorrencia = {
    nossoEscritorio: { processos: 0, incidentesCriticos: 0 },
    concorrencia: { processos: 0, incidentesCriticos: 0 },
    semAdvogado: { processos: 0, incidentesCriticos: 0 },
  };

  for (const proc of processos) {
    // 1. Mapa de Calor por Tribunal (#18)
    const trib = proc.siglaTribunal || 'OUTRO';
    const atualTrib = mapaTribunal.get(trib) || { totalProcessos: 0, urgenciaAlta: 0 };
    atualTrib.totalProcessos += 1;
    if (proc.urgenciaMaxima === 'ALTA') atualTrib.urgenciaAlta += 1;
    mapaTribunal.set(trib, atualTrib);

    // 2. Jurimetria por Vara (#12)
    const chaveOrgao = `${proc.orgaoJulgador} (${trib})`;
    const atualOrgao = mapaOrgao.get(chaveOrgao) || {
      tribunal: trib,
      processos: 0,
      fasePredominante: proc.faseProcessual || 'Andamento',
    };
    atualOrgao.processos += 1;
    mapaOrgao.set(chaveOrgao, atualOrgao);

    // 3. Contagem de Partes e Advogados Externos (#16)
    for (const p of proc.partes || []) {
      const nomeLimpo = (p.nome || '').trim().toUpperCase();
      if (nomeLimpo.length > 3) {
        mapaPartes.set(nomeLimpo, (mapaPartes.get(nomeLimpo) || 0) + 1);
      }
    }
    for (const adv of proc.advogadosAtuantes || []) {
      if (!adv.ehNosso) {
        const chaveAdv = `${adv.nome} (OAB/${adv.uf} ${adv.oab})`;
        mapaAdvExternos.set(chaveAdv, (mapaAdvExternos.get(chaveAdv) || 0) + 1);
      }
    }

    // 4. Provisionamento Financeiro (#24 + #45)
    let maiorValorProc = 0;
    for (const pub of proc.historicoPublicacoes) {
      const val = extrairValorNumericoRS(pub.inteligencia.alertasAutomaticos.valorDetectado);
      if (val > maiorValorProc) maiorValorProc = val;
    }
    passivoTotalEstimadoRS += maiorValorProc;
    if (proc.urgenciaMaxima === 'ALTA') provavelRS += maiorValorProc;
    else if (proc.urgenciaMaxima === 'MEDIA') possivelRS += maiorValorProc;
    else remotoRS += maiorValorProc;

    // 5. Benchmark Nosso Escritório vs. Concorrência (#19 + #55)
    const textoTodo = proc.historicoPublicacoes
      .map((p) => p.texto)
      .join(' ')
      .toLowerCase();
    const temIncidenteCritico =
      proc.urgenciaMaxima === 'ALTA' ||
      textoTodo.includes('revelia') ||
      textoTodo.includes('sisbajud') ||
      textoTodo.includes('penhora');

    if (proc.statusConcorrencia === 'NOSSO_ESCRITORIO') {
      benchmarkConcorrencia.nossoEscritorio.processos += 1;
      if (temIncidenteCritico) benchmarkConcorrencia.nossoEscritorio.incidentesCriticos += 1;
    } else if (proc.statusConcorrencia === 'ESCRITORIO_CONCORRENTE') {
      benchmarkConcorrencia.concorrencia.processos += 1;
      if (temIncidenteCritico) benchmarkConcorrencia.concorrencia.incidentesCriticos += 1;
    } else {
      benchmarkConcorrencia.semAdvogado.processos += 1;
      if (temIncidenteCritico) benchmarkConcorrencia.semAdvogado.incidentesCriticos += 1;
    }

    // 6. Radar de Precatórios / RPVs / Alvarás (#17)
    if (proc.riscoGolpeAlvara) {
      const valDet = proc.historicoPublicacoes.find(
        (p) => p.inteligencia.alertasAutomaticos.valorDetectado
      )?.inteligencia.alertasAutomaticos.valorDetectado;
      oportunidadesCreditoAlvara.push({
        numeroFormatado: proc.numeroFormatado,
        tribunal: proc.siglaTribunal,
        valorDetectado: valDet,
        ato: proc.ultimoStatusDetectado,
      });
    }

    // 7. Radar Societário: IDPJ / Recuperação Judicial / Falência (#20)
    if (
      textoTodo.includes('desconsideração da personalidade jurídica') ||
      textoTodo.includes('idpj') ||
      textoTodo.includes('recuperação judicial') ||
      textoTodo.includes('falência')
    ) {
      alertasSocietariosIdpj.push({
        numeroFormatado: proc.numeroFormatado,
        tribunal: proc.siglaTribunal,
        evento: textoTodo.includes('falência')
          ? 'Falência / Quebra mencionada'
          : textoTodo.includes('recuperação judicial')
          ? 'Recuperação Judicial mencionada'
          : 'Incidente de Desconsideração da Personalidade Jurídica (IDPJ)',
      });
    }
  }

  const distribuicaoPorTribunal = Array.from(mapaTribunal.entries())
    .map(([tribunal, info]) => ({ tribunal, ...info }))
    .sort((a, b) => b.totalProcessos - a.totalProcessos);

  const topOrgaosJulgadores = Array.from(mapaOrgao.entries())
    .map(([orgao, info]) => ({ orgao, ...info }))
    .sort((a, b) => b.processos - a.processos)
    .slice(0, 8);

  const autoresOuAdvogadosRecorrentes: RelatorioBIJuridico['autoresOuAdvogadosRecorrentes'] = [
    ...Array.from(mapaAdvExternos.entries())
      .filter(([, q]) => q >= 1)
      .map(([nome, quantidadeProcessos]) => ({
        nome,
        tipo: 'ADVOGADO_EXTERNO' as const,
        quantidadeProcessos,
      })),
    ...Array.from(mapaPartes.entries())
      .filter(([, q]) => q >= 2)
      .map(([nome, quantidadeProcessos]) => ({
        nome,
        tipo: 'PARTE_RECORRENTE' as const,
        quantidadeProcessos,
      })),
  ]
    .sort((a, b) => b.quantidadeProcessos - a.quantidadeProcessos)
    .slice(0, 10);

  return {
    passivoTotalEstimadoRS,
    passivoFormatado: formatarMoedaBR(passivoTotalEstimadoRS),
    contingenciaPorRisco: {
      provavelRS,
      possivelRS,
      remotoRS,
    },
    distribuicaoPorTribunal,
    topOrgaosJulgadores,
    autoresOuAdvogadosRecorrentes,
    benchmarkConcorrencia,
    oportunidadesCreditoAlvara,
    alertasSocietariosIdpj,
  };
}
