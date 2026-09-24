/**
 * app/electron/main/engine/review/loopTipos.ts — as CONSTANTES e os TIPOS do
 * laço de revisão F11 (`loop.ts`). Extraído do módulo original na refatoração
 * do lote L05 sem NENHUMA mudança de comportamento — a fachada `loop.ts`
 * re-exporta tudo isto pelos MESMOS nomes.
 */

import type { ExecFn } from '../exec/proofs';
import type {
  DecisaoDoCorretor,
  RejeicaoDoCorretor,
  TrechoDeDiff,
} from '../prompts/fixer';
import type { RegraDoCatalogo, RevisaoDoRevisor } from '../prompts/reviewer';
import type { AcaoCatalogo, Apontamento, DefeitoDoCatalogo, SpanDeArquivo } from './actionCatalog';
import type { DescarteDoFiltro } from './filter';
import type { MapaDeFamilias } from './normalize';
import type { PinDeRegressao, ProverDeDesafio } from './prover';
import type { LedgerDeRejeicoes } from './rejections';
import type { PinsDeRegressao } from './prover';
import type { VersionBuffer } from './versionBuffer';


// ---------------------------------------------------------------------------
// Constantes do laço (§6.6)
// ---------------------------------------------------------------------------

/** Default de refino: 1 rodada por artefato (§6.6 — o ganho é na primeira). */
export const RODADAS_DEFAULT = 1;

/** Teto DURO de rodadas — a 2ª/3ª só existe se a anterior deixou bloqueante. */
export const TETO_DE_RODADAS = 3;

/** Tolerância de rollback: score piorou mais de 0,10 → volta y_{t-1} (§6.6). */
export const TOLERANCIA_DEFAULT_DE_ROLLBACK = 0.1;

/** Limiar de estagnação sobre o PROXY de distância (nunca embedding real). */
export const LIMIAR_DEFAULT_DE_ESTAGNACAO = 0.06;

/** Timeout default das execuções do laço (R5 e pins de execução), em ms. */
export const TIMEOUT_DEFAULT_DE_EXECUCAO_MS = 30_000;

/**
 * A quota de sugestões por artefato (§6.5 — "estilo/tom/prosa: sugestão —
 * NUNCA abre rodada; quota de 3 por aula"). Apontamentos `sugestao`
 * sobreviventes ao filtro são guardados na sessão FORA do pipeline
 * (provador/planejador/corretor); a 4ª sugestão do MESMO artefato é
 * descartada COM contagem registrada (fail-closed declarado — nunca abre
 * rodada, nunca derruba a parada 0).
 */
export const QUOTA_DE_SUGESTOES_POR_ARTEFATO = 3;

// ---------------------------------------------------------------------------
// Tipos do laço
// ---------------------------------------------------------------------------

/** Um artefato sob revisão — conteúdo AO VIVO (mutável pelas correções). */
export interface ArtefatoNoLaco {
  /** chave única (path relativo à trilha — ex.: 'desafios/x/challenge.json'). */
  caminho: string;
  /** nome legível (ex.: 'desafio'). */
  nome: string;
  conteudo: string;
  /** última rodada que editou o artefato (-1 = nunca). */
  ultimaEdicao: number;
}

/** Uma violação MECÂNICA — saída tipada dos verificadores determinísticos. */
export interface ViolacaoMecanica {
  caminho: string;
  surface: string;
  /** a construção ofensora (chave de átomo, ex.: 'op:unary:typeof'). */
  construcao: string;
  /** orcamento (AST) ou execucao (provas). */
  tipo: 'orcamento' | 'execucao';
  inicio: number;
  fim: number;
  linha: number;
  coluna: number;
  trechoOfensor: string;
  /** null = LACUNA DE CURRÍCULO; não-null = violação de ORDEM (§5.5). */
  primeiraAulaQueEnsina: string | null;
  mensagem: string;
}

/** A superfície de uma aula no snapshot de F4 (como o F4 materializou). */
export interface SurfaceDeOrcamento {
  superficie: string;
  caminho: string;
  /** a faixa do orçamento que CONTÉM os permitidos (a assimetria do §3.3). */
  faixa: 'receptive' | 'productive';
  permitidos: readonly string[];
}

/** O snapshot de orçamento congelado que o laço recebe (subset do F4). */
export interface SnapshotDeOrcamento {
  ref: string;
  surfaces: readonly SurfaceDeOrcamento[];
  /** primeira aula que introduz cada construção (a distinção §5.5). */
  primeiroEnsina: Readonly<Record<string, string>>;
}

export type VerificadorDeOrcamento = (
  artefatos: ReadonlyMap<string, ArtefatoNoLaco>,
) => ViolacaoMecanica[] | Promise<ViolacaoMecanica[]>;

export type VerificadorDeProvas = (
  artefatos: ReadonlyMap<string, ArtefatoNoLaco>,
) => ViolacaoMecanica[] | Promise<ViolacaoMecanica[]>;

// ---------------------------------------------------------------------------
// A interface LLM que o laço dirige (fuções já cabeadas no transporte)
// ---------------------------------------------------------------------------

export interface EntradaDeRevisao {
  instrumento: string;
  /** o artefato NORMALIZADO (P-12) — os instrumentos nunca veem o rascunho. */
  artefatoNormalizado: string;
  regras: readonly RegraDoCatalogo[];
  /** saída dos verificadores determinísticos renderizada. */
  verificadores: string;
  rodada: number;
  hashCode: string;
}

/** O revisor: recebe o normalizado + regras + verificadores; devolve findings. */
export type RevisorLlm = (entrada: EntradaDeRevisao) => Promise<RevisaoDoRevisor>;

/** Um instrumento de revisão: um conjunto DISJUNTO de regras + o chamador. */
export interface InstrumentoDeRevisao {
  nome: string;
  regras: readonly RegraDoCatalogo[];
  chamar: RevisorLlm;
}

export interface AcaoDoPlano {
  posicao: number;
  apontamento_id: string;
  alvo: { arquivo: string; span: SpanDeArquivo };
  motivo: string;
  acao: string;
  resultado_esperado: string;
}

export interface EntradaDoPlanejador {
  trilha: string;
  rodada: number;
  apontamentos: readonly Apontamento[];
  /** ids DECLARADOS de excluídos (excecao_intencional — P-13 WARNING-3). */
  excluidosComoExcecao: readonly string[];
  ledgerDeRejeicoes: string;
}

export type SaidaDoPlanejador = { acoes: readonly AcaoDoPlano[] };

export type PlanejadorLlm = (entrada: EntradaDoPlanejador) => Promise<SaidaDoPlanejador>;

export interface EntradaDoCorretor {
  trilha: string;
  rodada: number;
  decisao: DecisaoDoCorretor;
  pins: readonly string[];
}

export type CorretorLlm = (entrada: EntradaDoCorretor) => Promise<RejeicaoDoCorretor | { rejeitado: false; delta: readonly TrechoDeDiff[] }>;

// ---------------------------------------------------------------------------
// O contexto e os resultados
// ---------------------------------------------------------------------------

export interface ContextoDoLaco {
  trilha: string;
  /** o ponto de partida — o laço trabalha numa cópia e devolve o final. */
  artefatos: readonly ArtefatoNoLaco[];
  /** OU snapshot de F4 (verificador default por AST)… */
  snapshotDeOrcamento?: SnapshotDeOrcamento;
  /** …OU verificadores injetados (testes / audit já pronto). */
  verificadorDeOrcamento?: VerificadorDeOrcamento;
  verificadorDeProvas?: VerificadorDeProvas;
  /** o provador de desafio (contrato P-31 — fases/f9Verifier.ts). */
  proverDesafio: ProverDeDesafio;
  /** transporte LLM de cada papel. */
  llm: { revisar: RevisorLlm; planejar: PlanejadorLlm; corrigir: CorretorLlm };
  /** instrumentos de revisão com regras DISJUNTAS (default: C1–C8 único). */
  revisores?: readonly InstrumentoDeRevisao[];
  /** roteamento (P-12): model(AUTOR) !== model(REVISOR) etc. */
  modeloAutor: string;
  modeloRevisor: string;
  familias?: MapaDeFamilias;
  /** executor endurecido (createHardenedExec) para o R5 do filtro. */
  execDeReproducaoR5?: ExecFn;
  /** EXATAMENTE estas rodadas (default 1; teto duro 3 — ver TETO_DE_RODADAS). */
  rodadasMaximas?: number;
  toleranciaDeRollback?: number;
  limiarDeEstagnacao?: number;
  timeoutDeExecucaoMs?: number;
}

export type TipoDeParada = 'mecanico' | 'pingpong' | 'estagnou' | 'failsafe';

/** A parada de uma rodada: as PARE do §6.6 + 'rollback' (ação, não parada). */
export type ParadaDeRodada = TipoDeParada | 'nenhuma' | 'rollback';

export interface PlacarDeEscalada {
  quality_warning: true;
  rodada: number;
  score_erro: number;
  /** recomendações que sobreviveram à rodada final (o que escalar). */
  apontamentos: readonly Apontamento[];
  motivo: string;
}

export interface CorrecaoAplicada {
  apontamento_id: string;
  acao: AcaoCatalogo;
  arquivo: string;
  span: SpanDeArquivo;
  delta: readonly TrechoDeDiff[];
}

export interface ResultadoDeRodada {
  rodada: number;
  temViolacaoMecanica: boolean;
  revisorChamado: boolean;
  apontamentosDoRevisor: readonly Apontamento[];
  descartados: readonly DescarteDoFiltro[];
  /** apontamentos MECÂNICOS (verificadores determinísticos) da rodada. */
  apontamentosMecanicos: readonly Apontamento[];
  /** sobreviventes ao provador (com pin) — os que chegam ao planejador. */
  sobreviventesAoProvador: readonly Apontamento[];
  /**
   * sugestões (§6.5) sobreviventes ao filtro NA RODADA — fora do
   * provador/planejador/corretor; guardadas sob a quota por artefato.
   */
  sugestoes: readonly Apontamento[];
  /** quantas sugestões foram descartadas NESTA rodada por exceder a quota. */
  sugestoesDescartadasPorQuota: number;
  excluidosComoExcecao: readonly string[];
  pinsCriados: readonly PinDeRegressao[];
  defeitosDoCatalogo: readonly DefeitoDoCatalogo[];
  plano: readonly AcaoDoPlano[];
  correcoes: readonly CorrecaoAplicada[];
  rejeicoesDoCorretor: readonly RejeicaoDoCorretor[];
  correcoesInvalidas: readonly { apontamento_id: string; motivo: string }[];
  rejeicoesPorPinQuebrado: readonly { apontamento_id: string; pin_id: string }[];
  violacoesDeOrcamento: number;
  falhasDeProvas: number;
  pinsFalhando: number;
  scoreAntes: number;
  scoreDepois: number;
  parada: ParadaDeRodada;
  escalada: PlacarDeEscalada | null;
}

export interface ResultadoDoLaco {
  rodadas: readonly ResultadoDeRodada[];
  paradaFinal: TipoDeParada;
  /** true ⇔ a parada 0 MECÂNICA foi atendida — a única porta de aceite. */
  acessado: boolean;
  escalada: PlacarDeEscalada | null;
  scoreFinal: number;
  artefatosFinais: readonly ArtefatoNoLaco[];
}

/** Erro ESTRUTURADO do laço — fail-closed: nunca veredito por omissão. */
export interface ErroEstruturadoDoLacoOptions {
  codigo: string;
  etapa: string;
  mensagem: string;
  causa?: unknown;
}

export class ErroEstruturadoDoLaco extends Error {
  readonly codigo: string;
  readonly etapa: string;
  readonly causa?: unknown;

  constructor(opts: ErroEstruturadoDoLacoOptions) {
    super(opts.mensagem);
    this.name = 'ErroEstruturadoDoLaco';
    this.codigo = opts.codigo;
    this.etapa = opts.etapa;
    if (opts.causa !== undefined) this.causa = opts.causa;
  }
}

/** A sessão de uma execução do laço — estado vivo compartilhado entre rodadas. */
export interface SessaoDoLaco {
  artefatos: Map<string, ArtefatoNoLaco>;
  buffer: VersionBuffer;
  ledger: LedgerDeRejeicoes;
  pins: PinsDeRegressao;
  rodadaAtual: number;
  /** hash do conjunto por estado (índice 0 = estado INICIAL, anterior à rodada 1). */
  hashes: string[];
  /** conteúdos por caminho ao fim de cada estado (índice 0 = inicial). */
  estados: ReadonlyMap<string, string>[];
  /** distância do PROXY entre estados consecutivos (índice r-1 = rodada r). */
  distancias: number[];
  /** bloqueantes+corrigir sobreviventes ao fim de cada rodada. */
  bloqueantesPorRodada: number[];
  apontamentosCorrigirAnterior: number;
  /**
   * Sugestões (§6.5) guardadas por artefato (chave = `alvo.caminho`) — a
   * quota de `QUOTA_DE_SUGESTOES_POR_ARTEFATO` por artefato. Sugestão NUNCA:
   * abre rodada, cria pin, chega ao planejador/corretor nem derruba a
   * parada 0 — só fica aQUI, registrada para quem consumir depois.
   */
  sugestoesPorArtefato: Map<string, Apontamento[]>;
  /** quantas sugestões foram DESCARTADAS por exceder a quota (contagem registrada). */
  sugestoesDescartadasPorQuota: number;
  /**
   * Guarda UMA sugestão sob a quota por artefato (§6.5). Devolve `true`
   * quando o apontamento fica registrado (ou já estava registrado — a MESMA
   * sugestão, mesmo id, não consome quota duas vezes na mesma execução);
   * `false` quando a quota do artefato (3) já foi atingida — a sugestão é
   * DESCARTADA e `sugestoesDescartadasPorQuota` é incrementada.
   */
  guardarSugestao: (artefato: string, apontamento: Apontamento) => boolean;
}
