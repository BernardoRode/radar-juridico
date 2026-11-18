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
    faseProcessual?: string;
    prazoDetectado?: string;
    prazoFatal?: string;
    prazoInternoD2?: string;
    limiteConfirmacaoDomicilio3Dias?: string;
    audienciaDetectada?: string;
    linkAudienciaVirtual?: string;
    valorDetectado?: string;
    honorariosDetectados?: string;
    ehMeroExpediente?: boolean;
    riscoGolpeAlvara?: boolean;
    transitoEmJulgado?: boolean;
    pautaJulgamento2Grau?: boolean;
    checklistPericia?: string[];
    precedentesDetectados?: string[];
    alertaTeimosinhaSisbajud?: string;
    hashProvaCaptura?: string;
    timestampCaptura?: string;
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
  faseProcessual?: string;
  prazoFatal?: string;
  prazoInternoD2?: string;
  limiteConfirmacaoDomicilio3Dias?: string;
  linkAudienciaVirtual?: string;
  honorariosDetectados?: string;
  ehMeroExpediente?: boolean;
  riscoGolpeAlvara?: boolean;
  transitoEmJulgado?: boolean;
  pautaJulgamento2Grau?: boolean;
  checklistPericia?: string[];
  precedentesDetectados?: string[];
  alertaTeimosinhaSisbajud?: string;
  dossiePreAudiencia?: string[];
  viabilidadeAcordo?: {
    recomendacao: string;
    economiaEstimada: string;
  };
  hashProvaCaptura?: string;
  scoreOportunidade?: number;
  motivosScore?: string[];
  mensagemClienteWhatsApp?: string;
  urgenciaMaxima: 'ALTA' | 'MEDIA' | 'NORMAL';
  totalPublicacoes: number;
  linksDocumentosOriginais: AnaliseInteligencia['linksValidacao'];
  historicoPublicacoes: PublicacaoEnriquecida[];
}

export interface ResultadoExtracaoDocumento {
  sistema: 'PJE' | 'EPROC' | 'OUTRO';
  statusExtracao: 'SUCESSO' | 'CAPTCHA_NECESSARIO' | 'INDISPONIVEL' | 'ERRO';
  urlOriginal: string;
  endpointConsultado?: string;
  tituloDocumento?: string;
  resultadoValidacao?: string;
  assinadoPor?: string;
  dataHoraAssinatura?: string;
  algoritmoAssinatura?: string;
  totalPaginas?: number;
  tamanhoPdfBytes?: number;
  temPdfDisponivel: boolean;
  textoExtraido?: string;
  alertasDoDocumento?: AnaliseInteligencia['alertasAutomaticos'];
  mensagem: string;
}

export interface MovimentoDatajud {
  codigo: number;
  nome: string;
  dataHora: string;
  orgaoJulgador?: {
    codigo?: string | number;
    nome?: string;
  };
  complementosTabelados?: Array<{
    codigo: number;
    descricao: string;
    valor: number | string;
    nome: string;
  }>;
}

export interface DadosDatajud {
  encontrado: boolean;
  indiceConsultado: string;
  numeroProcesso: string;
  tribunal?: string;
  grau?: string;
  classe?: { codigo: number; nome: string };
  assuntos: Array<{ codigo: number; nome: string }>;
  dataAjuizamento?: string;
  dataHoraUltimaAtualizacao?: string;
  orgaoJulgador?: { codigo: number; nome: string; codigoMunicipioIBGE?: number };
  sistema?: { codigo: number; nome: string };
  formato?: { codigo: number; nome: string };
  nivelSigilo?: number;
  totalMovimentos: number;
  movimentos: MovimentoDatajud[];
  protocoloRecenteDetectado?: string;
  origemCache?: boolean;
  mensagem?: string;
}
