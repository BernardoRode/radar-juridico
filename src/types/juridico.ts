export interface AdvogadoDestinatario {
  id?: number;
  comunicacao_id?: number;
  advogado_id?: number;
  advogado: {
    id?: number;
    nome: string;
    numero_oab: string;
    uf_oab: string;
  };
}

export interface DestinatarioParte {
  nome: string;
  polo?: string; // 'A' (Ativo), 'P' (Passivo), etc.
  comunicacao_id?: number;
}

export interface ComunicacaoCNJ {
  id: number;
  data_disponibilizacao: string;
  siglaTribunal: string;
  tipoComunicacao: string;
  nomeOrgao: string;
  texto: string;
  numero_processo: string;
  meio: string;
  link?: string;
  tipoDocumento?: string;
  nomeClasse?: string;
  codigoClasse?: string;
  numeroComunicacao?: number;
  ativo?: boolean;
  hash?: string;
  datadisponibilizacao?: string;
  meiocompleto?: string;
  numeroprocessocommascara?: string;
  destinatarios: DestinatarioParte[];
  destinatarioadvogados: AdvogadoDestinatario[];
}

export interface AnaliseInteligencia {
  ehEscritorioProprio: boolean;
  statusConcorrencia: 'NOSSO_ESCRITORIO' | 'ESCRITORIO_CONCORRENTE' | 'SEM_ADVOGADO_CADASTRADO';
  advogadosIdentificados: Array<{
    nome: string;
    oab: string;
    uf: string;
    ehNosso: boolean;
  }>;
  linksValidacao: Array<{
    sistema: 'PJE' | 'EPROC' | 'OUTRO';
    url: string;
    codigoValidacao?: string;
  }>;
  alertasAutomaticos: {
    tipoAtoDetectado: string;
    prazoDetectado?: string;
    audienciaDetectada?: string;
    valorDetectado?: string;
    urgencia: 'ALTA' | 'MEDIA' | 'NORMAL';
  };
}

export interface PublicacaoEnriquecida extends ComunicacaoCNJ {
  inteligencia: AnaliseInteligencia;
}

export interface ProcessoAutoGerido {
  numeroProcesso: string;
  numeroFormatado: string;
  siglaTribunal: string;
  orgaoJulgador: string;
  classeProcessual: string;
  partes: DestinatarioParte[];
  advogadosAtuantes: AnaliseInteligencia['advogadosIdentificados'];
  statusConcorrencia: AnaliseInteligencia['statusConcorrencia'];
  ultimaAtualizacao: string;
  ultimoStatusDetectado: string;
  urgenciaMaxima: 'ALTA' | 'MEDIA' | 'NORMAL';
  totalPublicacoes: number;
  linksDocumentosOriginais: AnaliseInteligencia['linksValidacao'];
  historicoPublicacoes: PublicacaoEnriquecida[];
}
