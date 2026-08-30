/**
 * app/electron/main/engine/review/loop.ts — O LAÇO DE REVISÃO F11 (pacote
 * P-18, onda 3 do plano de execução v1). "ESTE É O PACOTE MAIS PERIGOSO DO
 * PLANO — a regra de ouro: NENHUM caminho de código com laço aberto sobre
 * apontamento de revisor; a condição de parada 0 é MECÂNICA."
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6 INTEIRO (6.1 a ordem;
 * 6.2 papéis e restrições de roteamento; 6.3 o schema do apontamento; 6.4 o
 * filtro R1–R8; 6.5 severidade por tabela; 6.6 a cascata de parada; 6.7 a
 * anti-oscilação) + §5.5 (violação de ordem × lacuna de currículo).
 *
 * A ORDEM DA RODADA (6.1), item a item:
 *
 *   1. VERIFICADORES DETERMINÍSTICOS — orçamento por AST (`extractAtoms`
 *      contra o snapshot de F4), provas de execução (via o `ProverDeDesafio`
 *      — contrato P-31) e o conjunto INTEIRO de pins. Havendo violação
 *      mecânica, o REVISOR LLM NÃO é chamado (o defeito já está localizado e
 *      provado) — as violações viram apontamentos MECÂNICOS (id `MEC-…`,
 *      `reproduzivel_por` com prefixo `mecanico:`) e, quando um pin está
 *      vermelho, o apontamento ORIGINAL do pin é REGENERADO (a regressão
 *      mecânica reabre o canal de correção com o MESMO id).
 *   2. REVISOR LLM (só com os três verificadores verdes): `validarRoteamento`
 *      (P-12) ANTES; artefato NORMALIZADO (P-12); instrumentos com regras
 *      DISJUNTAS (default: um instrumento único C1–C8 — particionável por
 *      eixo); severidade anexada por TABELA FIXA (`anexarSeveridadePorTabela`).
 *   3. FILTRO ESTRUTURAL R1–R8 (review/filter.ts) — o revisor reporta tudo;
 *      a triagem é aqui; descarta antes do planejador.
 *   4. PROVADOR (review/prover.ts) — cada candidato vira PIN executável que
 *      falha HOJE; candidato sem pin MORRE EM SILÊNCIO. SUGESTÃO (severity
 *      'sugestao', §6.5) NÃO é candidato: o provador a ignora por construção —
 *      sem pin, sem planejador, sem corretor; ela vai para a QUOTA POR
 *      ARTEFATO da sessão (3 por aula — `guardarSugestao`); além da quota é
 *      descartada COM CONTAGEM registrada. A parada 0 e `pinsFalhandoFinal`
 *      contam APENAS bloqueante/corrigir.
 *   5. PLANEJADOR (P-13: plano de ações + catálogo FECHADO; a lista DECLARADA
 *      `excluidosComoExcecao` alimenta o prompt; ação fora do catálogo ou de
 *      polaridade errada vira DEFEITO DO CATÁLOGO) → CORRETOR (verify-first,
 *      DIREITO de rejeitar com justificativa ≥40 caracteres → ledger; diff
 *      fora do span é rejeitado pelo gate `validarDiffNoSpan`).
 *   6. RE-VERIFICAÇÃO — só os itens TOcados (orçamento/provas) + TODOS os
 *      pins; correção que quebra pin verde é REJEITADA (artefato volta).
 *
 * A CASCATA DE PARADA (6.6), nesta ordem:
 *   0. MECÂNICA: 0 violações de orçamento ∧ 0 provas falhando ∧ todos os
 *      pins verdes ∧ 0 apontamentos bloqueante/corrigir sobreviventes ao
 *      provador — A APROVAÇÃO DO REVISOR NÃO É CONDIÇÃO DE PARADA EM NENHUM
 *      CAMINHO (`avaliarParadaMecanica` é função pura e testável);
 *   1. PING-PONG: hash(y_t) == hash(y_t-2) != hash(y_t-1) → devolve a versão
 *      de menor score do version buffer;
 *   2. ROLLBACK: score_erro_t > score_erro_t-1 + 0,10 → volta para y_{t-1}
 *      — é AÇÃO, não parada: o laço continua. AJUSTE DECLARADO: o score
 *      (3×viol_orçamento + 3×testes_falhando + 2×pins_falhando +
 *      1×apontamentos_corrigir) usa TERMOS DE LAG para pins e corrigir
 *      (medidos no estado ANTERIOR): uma rodada que apenas DESCOBRE um
 *      bloqueador novo não se auto-castiga com rollback — o rollback reage à
 *      piora do estado PROVÁVEL (orçamento/provas) e das regressões prévias;
 *   3. ESTAGNOU: PROXY DETERMINÍSTICO DECLARADO para a "distância de
 *      embedding" — 1 − Jaccard normalizado sobre tokens de palavras dos
 *      artefatos NORMALIZADOS (P-12). NUNCA se promete embedding real: o
 *      limiar 0,06 é medido sobre o proxy (falsificável em teste). Dispara
 *      após 2 rodadas consecutivas com distância < limiar E número de
 *      bloqueantes que não caiu;
 *   4. FAILSAFE: rodada `rodadasMaximas` sem parada 0 → ESCALA com placar
 *      (`quality_warning`) — NUNCA aceita por cansaço.
 *
 * O LAÇO RODA EXATAMENTE `rodadasMaximas` RODADAS (constante declarada no
 * contexto; default 1, teto duro 3; a 2ª/3ª só ocorre se sobrou bloqueante —
 * se a parada 0 dispara antes, o laço para). NENHUM `while
 * (revisor.temApontamento())`: a iteração é um `for` com limite numérico, e
 * cada rodada tem barreira própria. Recomendações que sobrevivem à rodada
 * final viram o placar de escalada.
 *
 * O TETO VALE PARA TODA A SUPERFÍCIE PÚBLICA: `rodarRodadaDeRevisao` (chamada
 * avulsa por rodada — o repair P-23 tem, no máx., as rodadas do mesmo teto)
 * NÃO roda além: sessão que já atingiu `rodadasMaximas` responde com
 * `ErroEstruturadoDoLaco` (código `RODADAS_ESGOTADAS`), nunca rodada extra
 * em silêncio. A mesma guarda protege `rodarLacoDeRevisao` com sessão semeada
 * já esgotada.
 *
 * FAIL-CLOSED: revisor/planejador/corretor indisponíveis (erro do transporte
 * — LLM_STAGE_TIMEOUT/KEY_MISSING…) produzem `ErroEstruturadoDoLaco`, NUNCA
 * aprovação por omissão; roteamento inválido (P-12) lança antes da revisão;
 * categoria de severidade desconhecida lança; sem verificador injetado o laço
 * nem começa.
 *
 * API DE SAÍDA (para o P-23 repair, que REUSA este laço): entrada é um
 * `ContextoDoLaco` (artefatos + snapshot/verificadores + `proverDesafio` +
 * funções LLM já cabeadas no transporte + roteamento); saída é
 * `ResultadoDoLaco` com `rodadas[]`, `paradaFinal`, `acessado` e
 * `artefatosFinais` (o repair P-23 grava estes artefatos e as correções do
 * catálogo LEVAM AO GIT — nunca o laço escreve por conta própria).
 *
 * LIMITES DECLARADOS: as provas de execução valem para artefatos que são
 * desafios executáveis; o verificador de orçamento pula superfícies ausentes
 * e código que não parseia (parse quebrado é erro de build do §5.3, não
 * violação de orçamento); R5 (filtro) herda o escopo do harness (socket cru
 * fora do alcance).
 */

import { extractAtoms } from '../extract';
import type { ExecFn } from '../exec/proofs';
import { validarDiffNoSpan, isRejeicaoDoCorretor, type DecisaoDoCorretor, type DiffDeArquivo, type RejeicaoDoCorretor, type TrechoDeDiff } from '../prompts/fixer';
import { anexarSeveridadePorTabela, type RegraDoCatalogo, type RevisaoDoRevisor } from '../prompts/reviewer';
import { type Apontamento } from './actionCatalog';
import { validarAcaoParaApontamento, defeitoSemMapeamento, type AcaoCatalogo, type DefeitoDoCatalogo, type SpanDeArquivo } from './actionCatalog';
import { regrasDaConstituicao } from './constituicao';
import { REPRODUZIVEL_MECANICO_PREFIX, filtrarApontamentos, type DescarteDoFiltro } from './filter';
import { normalizarArtefato, validarRoteamento, type MapaDeFamilias } from './normalize';
import { criarPinParaAchado, extrairProvasDoArtefato, PinsDeRegressao, type PinDeRegressao, type ProverDeDesafio } from './prover';
import { LedgerDeRejeicoes, materialDoApontamento } from './rejections';
import { hashDeConteudo as hashConteudo, VersionBuffer } from './versionBuffer';

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

// ---------------------------------------------------------------------------
// Primitivos puros do laço (exportados — testáveis isoladamente)
// ---------------------------------------------------------------------------

/** O score_erro do §6.6: 3×orç + 3×testes + 2×pins + 1×corrigir. */
export function scoreErro(
  violacoesOrcamento: number,
  testesFalhando: number,
  pinsFalhando: number,
  apontamentosCorrigir: number,
): number {
  return 3 * violacoesOrcamento + 3 * testesFalhando + 2 * pinsFalhando + 1 * apontamentosCorrigir;
}

/**
 * A PARADA 0 — MECÂNICA (§6.6). FUNÇÃO PURA e exportada: a aprovação do
 * revisor NÃO é um dos argumentos — é impossível parar por opinião.
 */
export function avaliarParadaMecanica(estado: {
  violacoesOrcamento: number;
  testesFalhando: number;
  pinsFalhando: number;
  apontamentosBloqueantesOuCorrigir: number;
}): boolean {
  return (
    estado.violacoesOrcamento === 0 &&
    estado.testesFalhando === 0 &&
    estado.pinsFalhando === 0 &&
    estado.apontamentosBloqueantesOuCorrigir === 0
  );
}

/** Tokens de palavras (minúsculas, sem pontuação) — a base do PROXY Jaccard. */
function tokensDe(texto: string): Set<string> {
  const normalizado = normalizarArtefato(texto).toLowerCase();
  const tokens = normalizado.split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length > 0);
  return new Set(tokens);
}

/**
 * Jaccard normalizado sobre dois textos (0 = nenhum token em comum;
 * 1 = mesmos tokens). Ambos vazios → 1 (idênticos). FUNÇÃO PURA.
 */
export function jaccardNormalizado(a: string, b: string): number {
  const ta = tokensDe(a);
  const tb = tokensDe(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let intersecao = 0;
  for (const token of ta) if (tb.has(token)) intersecao += 1;
  const uniao = ta.size + tb.size - intersecao;
  return uniao === 0 ? 1 : intersecao / uniao;
}

/**
 * O PROXY DETERMINÍSTICO DECLARADO para a "distância de embedding" do
 * critério 'estagnou' (§6.6): 1 − Jaccard normalizado sobre os artefatos
 * NORMALIZADOS (P-12). NUNCA promete embedding real — o limiar 0,06 é
 * ajustado sobre ESTE proxy (falsificável em teste). Artefato que some troca
 * de caminho conta distância 1; a média sobre todos os pares.
 */
export function distanciaDeArtefatos(
  antes: ReadonlyMap<string, string> | Map<string, string>,
  depois: ReadonlyMap<string, string> | Map<string, string>,
): number {
  const caminhos = new Set<string>([...antes.keys(), ...depois.keys()]);
  if (caminhos.size === 0) return 1;
  let soma = 0;
  for (const caminho of caminhos) {
    const a = antes.get(caminho);
    const b = depois.get(caminho);
    if (a === undefined || b === undefined) {
      soma += 1;
      continue;
    }
    soma += 1 - jaccardNormalizado(a, b);
  }
  return soma / caminhos.size;
}

/** Hash do CONJUNTO de artefatos (identidade de conteúdo do estado do laço). */
export function hashDoConjunto(artefatos: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): string {
  return hashDeConteudoDeMapa(artefatos);
}

/**
 * O hash de conteúdo do conjunto (sha256 sobre caminho+sha256(conteúdo)
 * ordenado) — estados iguais byte a byte têm o MESMO hash em qualquer rodada,
 * que é exatamente o que o ping-pong compara.
 */
function hashDeConteudoDeMapa(artefatos: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): string {
  const partes = [...artefatos.entries()]
    .map(([caminho, artefato]) => `${caminho}:${hashConteudo(artefato.conteudo)}`)
    .sort();
  return hashConteudo(partes.join('|'));
}

/** Aplica um delta (lista de trechos) a um conteúdo — PUB (gate já passou). */
export function aplicarDelta(conteudo: string, trechos: readonly TrechoDeDiff[]): string {
  const ordenados = [...trechos].sort((a, b) => b.inicio - a.inicio);
  let resultado = conteudo;
  for (const trecho of ordenados) {
    resultado = resultado.slice(0, trecho.inicio) + trecho.substituicao + resultado.slice(trecho.fim);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Verificadores determinísticos default (factories)
// ---------------------------------------------------------------------------

/** O verificador de ORÇAMENTO por AST (extractAtoms × snapshot de F4). */
export function criarVerificadorDeOrcamento(snapshot: SnapshotDeOrcamento): VerificadorDeOrcamento {
  return (artefatos) => {
    const violacoes: ViolacaoMecanica[] = [];
    for (const surface of snapshot.surfaces) {
      const artefato = artefatos.get(surface.caminho);
      if (artefato === undefined) continue; // superfície ausente — não acusa (gate de presença é de F8; declarado)
      const resultado = extractAtoms(artefato.conteudo);
      if (!resultado.ok) continue; // código que não parseia é erro de build (§5.3), não violação de orçamento
      const permitidos = new Set<string>(surface.permitidos);
      for (const ocorrencia of resultado.occurrences) {
        if (permitidos.has(ocorrencia.key)) continue;
        const inicio = artefato.conteudo.indexOf(ocorrencia.snippet);
        const fim = inicio >= 0 ? Math.max(inicio + Math.max(ocorrencia.snippet.length, 1), 1) : Math.min(artefato.conteudo.length, 1);
        violacoes.push({
          caminho: surface.caminho,
          surface: surface.superficie,
          construcao: ocorrencia.key,
          tipo: 'orcamento',
          inicio: Math.max(inicio, 0),
          fim,
          linha: ocorrencia.line,
          coluna: ocorrencia.column,
          trechoOfensor: ocorrencia.snippet,
          primeiraAulaQueEnsina: snapshot.primeiroEnsina[ocorrencia.key] ?? null,
          mensagem: `construção ${ocorrencia.key} fora do orçamento ${surface.faixa} da superfície ${surface.superficie} (ref ${snapshot.ref})`,
        });
      }
    }
    return violacoes;
  };
}

/** O verificador de PROVAS de execução (quatro provas do §5.4 via P-31). */
export function criarVerificadorDeProvas(prover: ProverDeDesafio): VerificadorDeProvas {
  return async (artefatos) => {
    const violacoes: ViolacaoMecanica[] = [];
    for (const artefato of artefatos.values()) {
      const provas = extrairProvasDoArtefato(artefato.conteudo);
      if (provas === null) continue; // não é desafio executável — declarado
      const veredito = await prover(provas);
      if (!veredito.valid) {
        for (const falha of veredito.failures) {
          const fim = Math.min(artefato.conteudo.length, Math.max(falha.proof.length + 2, 2));
          violacoes.push({
            caminho: artefato.caminho,
            surface: 'execucao',
            construcao: `prova:${falha.proof}`,
            tipo: 'execucao',
            inicio: 0,
            fim,
            linha: 1,
            coluna: 1,
            trechoOfensor: `prova:${falha.proof}`,
            primeiraAulaQueEnsina: null,
            mensagem: `desafio "${artefato.caminho}": ${falha.reason}`,
          });
        }
      }
    }
    return violacoes;
  };
}

// ---------------------------------------------------------------------------
// A sessão
// ---------------------------------------------------------------------------

function criarMapaDeArtefatos(artefatos: readonly ArtefatoNoLaco[]): Map<string, ArtefatoNoLaco> {
  const mapa = new Map<string, ArtefatoNoLaco>();
  for (const artefato of artefatos) mapa.set(artefato.caminho, { ...artefato });
  return mapa;
}

function mapaToStrings(mapa: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): ReadonlyMap<string, string> {
  const saida = new Map<string, string>();
  for (const [caminho, artefato] of mapa) saida.set(caminho, artefato.conteudo);
  return saida;
}

/**
 * Cria a sessão de UMA execução do laço. EXPORTADA para a suíte (e para o
 * repair P-23) semear estado — pins pré-existentes, exceções intencionais no
 * ledger — antes de `rodarRodadaDeRevisao(ctx, sessao)`.
 */
export function criarSessaoDeRevisao(ctx: ContextoDoLaco): SessaoDoLaco {
  const artefatos = criarMapaDeArtefatos(ctx.artefatos);
  const sessao: SessaoDoLaco = {
    artefatos,
    buffer: new VersionBuffer(),
    ledger: new LedgerDeRejeicoes(),
    pins: new PinsDeRegressao({
      proverDesafio: ctx.proverDesafio,
      obterArquivo: async (caminho) => artefatos.get(caminho)?.conteudo ?? null,
    }),
    rodadaAtual: 0,
    hashes: [hashDeConteudoDeMapa(artefatos)],
    estados: [mapaToStrings(artefatos)],
    distancias: [],
    bloqueantesPorRodada: [],
    apontamentosCorrigirAnterior: 0,
    sugestoesPorArtefato: new Map<string, Apontamento[]>(),
    sugestoesDescartadasPorQuota: 0,
    guardarSugestao: (artefato, apontamento) => {
      // A mesma sugestão (mesmo id) já registrada não consome quota de novo —
      // re-reportes do revisor entre rodadas não estouram a quota da aula.
      const atuais = sessao.sugestoesPorArtefato.get(artefato) ?? [];
      if (atuais.some((a) => a.id === apontamento.id)) return true;
      if (atuais.length >= QUOTA_DE_SUGESTOES_POR_ARTEFATO) {
        sessao.sugestoesDescartadasPorQuota += 1;
        return false;
      }
      atuais.push(apontamento);
      sessao.sugestoesPorArtefato.set(artefato, atuais);
      return true;
    },
  };
  return sessao;
}

// ---------------------------------------------------------------------------
// Ajudantes internos da rodada
// ---------------------------------------------------------------------------

/** Guarda o estado ATUAL de todos os artefatos no version buffer. */
function guardarEstado(sessao: SessaoDoLaco, rodada: number, score: number): void {
  for (const artefato of sessao.artefatos.values()) {
    sessao.buffer.guardar({
      caminho: artefato.caminho,
      conteudo: artefato.conteudo,
      score_erro: score,
      rodada,
    });
  }
}

/** Restaura y_{t-1} (a versão anterior no buffer) em todos os artefatos. */
function restaurarYAnterior(sessao: SessaoDoLaco): void {
  for (const artefato of sessao.artefatos.values()) {
    const anterior = sessao.buffer.anterior(artefato.caminho);
    if (anterior !== undefined) artefato.conteudo = anterior.conteudo;
  }
}

/** Restaura a versão de MENOR score do buffer (alvo do ping-pong, §6.6). */
function restaurarMenorScore(sessao: SessaoDoLaco): void {
  for (const artefato of sessao.artefatos.values()) {
    const melhor = sessao.buffer.menorScore(artefato.caminho);
    if (melhor !== undefined && melhor.conteudo !== artefato.conteudo) artefato.conteudo = melhor.conteudo;
  }
}

/** A visão NORMALIZADA (P-12) que o revisor recebe — nunca o rascunho. */
function visaoNormalizada(artefatos: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): string {
  const partes: string[] = [];
  for (const artefato of artefatos.values()) {
    partes.push(`Artefato: ${artefato.caminho}\n\n${normalizarArtefato(artefato.conteudo)}`);
  }
  return partes.join('\n\n---\n\n');
}

/** Renderiza as violações mecânicas para o bloco de verificadores do revisor. */
function renderizarViolacoes(violacoes: readonly ViolacaoMecanica[]): string {
  if (violacoes.length === 0) return '';
  return violacoes
    .map((v, i) => `${i + 1}. ${v.mensagem} (${v.caminho}:${v.linha}:${v.coluna}; ${v.trechoOfensor})`)
    .join('\n');
}

/** Todas as chaves permitidas do snapshot (o lado "no orçamento" do R4). */
function chavesPermitidas(ctx: ContextoDoLaco): string[] {
  const chaves = new Set<string>();
  for (const surface of ctx.snapshotDeOrcamento?.surfaces ?? []) {
    for (const permitida of surface.permitidos) chaves.add(permitida);
  }
  return [...chaves];
}

/** A categoria do apontamento mecânico, por tipo/construção (§5.5, §6.5). */
function categoriaDaViolacao(v: ViolacaoMecanica): Apontamento['categoria'] {
  if (v.tipo === 'execucao') {
    if (v.construcao === 'prova:solutionPasses') return 'gabarito_nao_passa';
    return 'teste_invalido';
  }
  if (v.construcao.startsWith('api:')) return 'api_nao_ensinada';
  return 'construcao_nao_ensinada';
}

/** violação mecânica → apontamento MEC-… (mesmo pipeline de correção). */
function violacaoParaApontamento(v: ViolacaoMecanica, rodada: number, sequencia: number): Apontamento {
  const id = `MEC-${String(sequencia + 1).padStart(4, '0')}`;
  return {
    id,
    rodada,
    artefato: v.surface,
    alvo: { caminho: v.caminho, linha: Math.max(v.linha, 1), span: [v.inicio, v.fim], no_ast: v.construcao, token: v.construcao },
    evidencia: {
      tipo: v.tipo === 'execucao' ? 'execucao' : 'orcamento',
      prova: v.mensagem,
      introduzido_em: v.primeiraAulaQueEnsina,
      reproduzivel_por: `${REPRODUZIVEL_MECANICO_PREFIX} verificado pelo verificador determinístico nesta rodada`,
    },
    defeito: v.mensagem,
    regra_violada: 'C1',
    categoria: categoriaDaViolacao(v),
    severity: 'bloqueante',
    acao_sugerida:
      v.primeiraAulaQueEnsina === null
        ? 'criar a aula que ensina a construção (lacuna de currículo — §5.5), nunca reescrever para caber no furo'
        : 'reescrever o artefato sem a construção ou mover a aula que a ensina para antes (violação de ordem — §5.5)',
    confianca: 1,
  };
}

/** pin vermelho → apontamento regenerado (MESMO id — a regressão reabre). */
function pinParaApontamento(pin: PinDeRegressao, rodada: number): Apontamento {
  return { ...pin.apontamento, rodada };
}

/** Valida e normaliza os instrumentos de revisão (regras DISJUNTAS). */
function instrumentosDeRevisao(ctx: ContextoDoLaco): readonly InstrumentoDeRevisao[] {
  const instrumentos = ctx.revisores ?? [{ nome: 'unico', regras: regrasDaConstituicao(), chamar: ctx.llm.revisar }];
  const ids = new Map<string, string>();
  const constituicaoCompleta = new Set(regrasDaConstituicao().map((r) => r.id));
  const presentes = new Set<string>();
  for (const instrumento of instrumentos) {
    if (instrumento.regras.length === 0) {
      throw new ErroEstruturadoDoLaco({
        codigo: 'LACO_INSTRUMENTO_SEM_REGRAS',
        etapa: `revisor:${instrumento.nome}`,
        mensagem: `instrumento "${instrumento.nome}" sem regras — um revisor sem constituição não existe (fail-closed)`,
      });
    }
    for (const regra of instrumento.regras) {
      const dono = ids.get(regra.id);
      if (dono !== undefined) {
        throw new ErroEstruturadoDoLaco({
          codigo: 'LACO_REGRAS_NAO_DISJUNTAS',
          etapa: 'revisor',
          mensagem: `regra ${regra.id} em dois instrumentos (${dono} e ${instrumento.nome}) — categorias disjuntas por instrumento (§6.1)`,
        });
      }
      ids.set(regra.id, instrumento.nome);
      presentes.add(regra.id);
    }
  }
  if (instrumentos.length > 1) {
    const faltando = [...constituicaoCompleta].filter((id) => !presentes.has(id));
    if (faltando.length > 0) {
      throw new ErroEstruturadoDoLaco({
        codigo: 'LACO_CONSTITUICAO_INCOMPLETA',
        etapa: 'revisor',
        mensagem: `artigos de fora dos instrumentos: ${faltando.join(', ')} — a constituição C1–C8 inteira tem de ser revisada (§6.7, as DUAS polaridades)`,
      });
    }
  }
  return instrumentos;
}

/** Wrapper fail-closed das chamadas LLM e do pipeline de validação. */
async function chamarSeguro<T>(etapa: string, fn: () => Promise<T>, ctx: ContextoDoLaco): Promise<T> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ErroEstruturadoDoLaco) throw erro;
    if (erro instanceof Error && erro.name === 'ErroDeRoteamento') {
      throw new ErroEstruturadoDoLaco({
        codigo: 'LACO_ROTEAMENTO_INVALIDO',
        etapa,
        mensagem: erro.message,
        causa: erro,
      });
    }
    const codigo =
      typeof erro === 'object' && erro !== null && typeof (erro as { code?: unknown }).code === 'string'
        ? ((erro as { code: string }).code as string)
        : 'LACO_ETAPA_FALHOU';
    throw new ErroEstruturadoDoLaco({
      codigo,
      etapa,
      mensagem: erro instanceof Error ? erro.message : String(erro),
      causa: erro,
    });
  }
}

// ---------------------------------------------------------------------------
// A RODADA — uma barreira completa (§6.1, itens 1–6)
// ---------------------------------------------------------------------------

/**
 * O teto de rodadas CLAMPED do §6.6 (default 1, teto duro 3) — UMA única
 * conta para TODA a superfície pública do laço. A garantia normativa é:
 * NENHUM caminho roda além de `rodadasMaximas` — nem o laço, nem a chamada
 * avulsa `rodarRodadaDeRevisao`.
 */
export function calcularRodadasMaximas(ctx: ContextoDoLaco): number {
  return Math.min(Math.max(1, Math.floor(ctx.rodadasMaximas ?? RODADAS_DEFAULT)), TETO_DE_RODADAS);
}

async function rodarRodadaInterna(ctx: ContextoDoLaco, sessao: SessaoDoLaco): Promise<ResultadoDeRodada> {
  // ── TETO — a guarda ÚNICA de todas as superfícies públicas (§6.6) ─────────
  // A sessão já rodou `rodadasMaximas` rodadas → a PRÓXIMA rodada estaria
  // além do teto: erro ESTRUTURADO (fail-closed, nunca rodada extra em
  // silêncio). Vale para `rodarLacoDeRevisao` (sessão semeada esgotada) e
  // para `rodarRodadaDeRevisao` (a 2ª chamada com rodadasMaximas 1 LANÇA).
  const teto = calcularRodadasMaximas(ctx);
  if (sessao.rodadaAtual >= teto) {
    throw new ErroEstruturadoDoLaco({
      codigo: 'RODADAS_ESGOTADAS',
      etapa: 'laco',
      mensagem:
        `a sessão já rodou ${sessao.rodadaAtual} rodada(s) do teto ${teto} (teto duro ${TETO_DE_RODADAS}) — ` +
        'NENHUMA superfície pública roda além de rodadasMaximas (§6.6): falha estruturada, nunca rodada extra.',
    });
  }
  const rodada = sessao.rodadaAtual + 1;
  sessao.rodadaAtual = rodada;

  // ── (1) VERIFICADORES DETERMINÍSTICOS — orçamento AST + provas + pins ─────
  const verificadorDeOrcamento =
    ctx.verificadorDeOrcamento ??
    (ctx.snapshotDeOrcamento !== undefined ? criarVerificadorDeOrcamento(ctx.snapshotDeOrcamento) : undefined);
  const verificadorDeProvas =
    ctx.verificadorDeProvas ?? (ctx.proverDesafio !== undefined ? criarVerificadorDeProvas(ctx.proverDesafio) : undefined);
  if (verificadorDeOrcamento === undefined) {
    throw new ErroEstruturadoDoLaco({
      codigo: 'LACO_SEM_VERIFICADOR_DE_ORCAMENTO',
      etapa: 'verificacao',
      mensagem: 'laço sem snapshotDeOrcamento e sem verificadorDeOrcamento injetado — o gate determinístico não existe (fail-closed)',
    });
  }
  if (verificadorDeProvas === undefined) {
    throw new ErroEstruturadoDoLaco({
      codigo: 'LACO_SEM_VERIFICADOR_DE_PROVAS',
      etapa: 'verificacao',
      mensagem: 'laço sem verificadorDeProvas injetado nem proverDesafio — as provas de execução não rodam (fail-closed)',
    });
  }

  const violacoesDeOrcamento = await verificadorDeOrcamento(sessao.artefatos);
  const falhasDeProvas = await verificadorDeProvas(sessao.artefatos);
  const vereditosDePins = await sessao.pins.todosRodam();
  // Pin de SUGESTÃO não existe por construção (§6.5 — o provador ignora
  // sugestões); um pin SEMEADO com severity 'sugestao' é irrelevante para a
  // mecânica: não derruba a parada 0, não regenera apontamento (que reabriria
  // o canal de correção) e não segura o revisor fora.
  const pinsDaMecanica = vereditosDePins.filter((v) => v.pin.apontamento.severity !== 'sugestao');
  const pinsVermelhos = pinsDaMecanica.filter((v) => !v.verde);
  const temViolacaoMecanica = violacoesDeOrcamento.length > 0 || falhasDeProvas.length > 0 || pinsVermelhos.length > 0;

  // Guarda o estado pré-rodada (y_{t-1} para rollback, §6.6) com o score dela.
  // Score com termos de LAG (pins vermelhos e corrigir pendentes medidos no
  // estado ANTERIOR — ver apontamento no cabeçalho): a rodada que apenas
  // DESCOBRE um bloqueador novo não se auto-castiga com rollback; o rollback
  // reage à piora do estado PROVÁVEL (orçamento/provas) e das regressões
  // prévias. Pins criados NESTA rodada ficam fora do score.
  const pinsAnterioresVermelhos = pinsDaMecanica.filter((v) => !v.verde && v.pin.criado_na_rodada < rodada).length;
  const scoreAntes = scoreErro(
    violacoesDeOrcamento.length,
    falhasDeProvas.length,
    pinsAnterioresVermelhos,
    sessao.apontamentosCorrigirAnterior,
  );
  guardarEstado(sessao, rodada - 1, scoreAntes);

  // Apontamentos MECÂNICOS entram direto no pipeline (sem LLM — passo 1):
  // violações de orçamento/provas viraram apontamentos; pins vermelhos
  // REGENERAM o apontamento original do pin (a regressão mecânica reabre o
  // canal de correção com o MESMO id, e o ledger reconcilia por chave).
  const apontamentosMecanicos: Apontamento[] = [];
  for (let i = 0; i < violacoesDeOrcamento.length; i += 1) {
    apontamentosMecanicos.push(violacaoParaApontamento(violacoesDeOrcamento[i], rodada, i));
  }
  for (let i = 0; i < falhasDeProvas.length; i += 1) {
    apontamentosMecanicos.push(violacaoParaApontamento(falhasDeProvas[i], rodada, violacoesDeOrcamento.length + i));
  }
  for (const pinVermelho of pinsVermelhos) {
    apontamentosMecanicos.push(pinParaApontamento(pinVermelho.pin, rodada));
  }

  // ── (2) REVISOR LLM — SÓ com os verificadores verdes ──────────────────────
  let apontamentosDoRevisor: Apontamento[] = [];
  let descartados: DescarteDoFiltro[] = [];
  let revisorChamado = false;
  if (!temViolacaoMecanica) {
    // Rotegamento ANTES da revisão (P-12) — fail-closed.
    await chamarSeguro('roteamento', async () => {
      validarRoteamento(ctx.modeloAutor, ctx.modeloRevisor, ctx.familias);
    }, ctx);

    const instrumentos = instrumentosDeRevisao(ctx);
    const visao = visaoNormalizada(sessao.artefatos);
    const verificadores = renderizarViolacoes([...violacoesDeOrcamento, ...falhasDeProvas]);
    const hashCode = hashDeConteudoDeMapa(sessao.artefatos);
    const porId = new Map<string, Apontamento>();

    for (const instrumento of instrumentos) {
      const revisao = await chamarSeguro(`revisor:${instrumento.nome}`, async () => {
        const bruta = await instrumento.chamar({
          instrumento: instrumento.nome,
          artefatoNormalizado: visao,
          regras: instrumento.regras,
          verificadores,
          rodada,
          hashCode,
        });
        // Severidade por TABELA FIXA (§6.5) — categoria desconhecida LANÇA
        // (ErroDeCategoriaDesconhecida, fail-closed) e o wrapper estrutura.
        return anexarSeveridadePorTabela(bruta);
      }, ctx);
      for (const apontamento of revisao.apontamentos) porId.set(apontamento.id, apontamento);
      revisorChamado = true;
    }
    apontamentosDoRevisor = [...porId.values()];

    // ── (3) FILTRO ESTRUTURAL R1–R8 (triagem separada do §6.5) ───────────────
    const resultadoDoFiltro = await filtrarApontamentos(apontamentosDoRevisor, {
      obterConteudo: (caminho) => sessao.artefatos.get(caminho)?.conteudo ?? null,
      orcamento: chavesPermitidas(ctx),
      exec: ctx.execDeReproducaoR5,
      timeoutMs: ctx.timeoutDeExecucaoMs ?? TIMEOUT_DEFAULT_DE_EXECUCAO_MS,
    });
    descartados = resultadoDoFiltro.descartados;
  }

  // ── (4) PROVADOR — candidatos (mecânicos + sobreviventes do filtro) viram
  //      pins; candidato SEM PIN MORRE EM SILÊNCIO (§6.1) ────────────────────
  const apontamentosSobreviventesDoFiltro = apontamentosDoRevisor.filter(
    (a) => !descartados.some((d) => d.apontamento.id === a.id),
  );
  // §6.5 — SUGESTÃO NUNCA ABRE RODADA: `sugestao` sobrevivente ao filtro NÃO
  // passa pelo provador (SEM pin, por construção — "o provador ignora
  // sugestões"); vai para a QUOTA POR ARTEFATO da sessão. Tudo o resto
  // (bloqueante/corrigir, mecânicos inclusos) segue o pipeline.
  const sugestoesDoRevisor = apontamentosSobreviventesDoFiltro.filter((a) => a.severity === 'sugestao');
  const candidatos = [...apontamentosMecanicos, ...apontamentosSobreviventesDoFiltro.filter((a) => a.severity !== 'sugestao')];
  const provados: { apontamento: Apontamento; pin: PinDeRegressao | null }[] = [];
  for (const candidato of candidatos) {
    const pin = await chamarSeguro(
      `provador:${candidato.id}`,
      () =>
        criarPinParaAchado(candidato, {
          obterArquivo: async (caminho) => sessao.artefatos.get(caminho)?.conteudo ?? null,
          proverDesafio: ctx.proverDesafio,
        }),
      ctx,
    );
    provados.push({ apontamento: candidato, pin });
  }
  const comPin = provados
    .filter((p): p is { apontamento: Apontamento; pin: PinDeRegressao } => p.pin !== null)
    .map((p) => ({ apontamento: p.apontamento, pin: p.pin }));
  for (const c of comPin) sessao.pins.adicionarPin(c.pin);

  // ── QUOTA DE SUGESTÕES (§6.5 — 3 por artefato/aula) ───────────────────────
  // Guardadas FORA do pipeline; além da quota → descartada COM CONTAGEM
  // registrada na sessão (fail-closed declarado: porta de saída observável,
  // nunca abertura de rodada).
  let sugestoesDescartadasPorQuota = 0;
  for (const sugestao of sugestoesDoRevisor) {
    if (!sessao.guardarSugestao(sugestao.alvo.caminho, sugestao)) {
      sugestoesDescartadasPorQuota += 1;
    }
  }

  // ── EXCEÇÃO INTENCIONAL (6.7): apontamento nesse estado NÃO reabre rodada ──
  // O pin dele é DESARMADO (a decisão de projeto contradiz a regressão; o
  // ledger desconta importância); o id entra na lista DECLARADA do planejador.
  const excluidos: string[] = [];
  const agir: Apontamento[] = [];
  for (const c of comPin) {
    const conteudo = sessao.artefatos.get(c.apontamento.alvo.caminho)?.conteudo ?? null;
    const material = materialDoApontamento(c.apontamento, conteudo);
    if (sessao.ledger.eExcecaoIntencional(material)) {
      // Exceção intencional NÃO reabre rodada (§6.7): fora do plano, e a
      // regressão mecânica dele sai do conjunto (o pin contradiz a decisão
      // de projeto — o DESARME é o canal; a importância do ledger já foi
      // descontada quando a exceção foi confirmada).
      excluidos.push(c.apontamento.id);
      sessao.pins.removerPin(c.pin.id);
      continue;
    }
    agir.push(c.apontamento);
  }

  // ── (5) PLANEJADOR → CORRETOR (catálogo FECHADO; gate do diff) ─────────────
  const defeitosDoCatalogo: DefeitoDoCatalogo[] = [];
  const plano: AcaoDoPlano[] = [];
  const correcoes: CorrecaoAplicada[] = [];
  const rejeicoesDoCorretor: RejeicaoDoCorretor[] = [];
  const correcoesInvalidas: { apontamento_id: string; motivo: string }[] = [];
  const rejeicoesPorPinQuebrado: { apontamento_id: string; pin_id: string }[] = [];
  const verdesAntes = new Set(pinsDaMecanica.filter((v) => v.verde).map((v) => v.pin.id));

  if (agir.length > 0) {
    const planoDoModelo = await chamarSeguro(
      'planejador',
      () =>
        ctx.llm.planejar({
          trilha: ctx.trilha,
          rodada,
          apontamentos: agir,
          excluidosComoExcecao: excluidos,
          ledgerDeRejeicoes: sessao.ledger.renderizar(),
        }),
      ctx,
    );
    for (const acao of [...planoDoModelo.acoes].sort((a, b) => a.posicao - b.posicao)) {
      plano.push(acao);
      const alvo = agir.find((a) => a.id === acao.apontamento_id);
      if (alvo === undefined) {
        // O plano referencia apontamento que não sobreviveu — defeito ESTRUTURADO
        // do laço (nunca ação improvisada; §7.3).
        defeitosDoCatalogo.push(
          defeitoSemMapeamento(acao.apontamento_id, `plano referencia apontamento inexistente "${acao.apontamento_id}" — o apontamento morreu no provador ou foi excluído`),
        );
        continue;
      }
      const validacao = validarAcaoParaApontamento(alvo, acao.acao);
      if (!validacao.ok) {
        defeitosDoCatalogo.push(validacao.defeito);
        continue;
      }
      const decisao: DecisaoDoCorretor = {
        apontamento: alvo,
        acao: validacao.plano.acao,
        alvo: { arquivo: acao.alvo.arquivo, span: acao.alvo.span },
        resultado_esperado: acao.resultado_esperado,
      };
      const resultadoDoCorretor = await chamarSeguro(
        `corretor:${alvo.id}`,
        () =>
          ctx.llm.corrigir({
            trilha: ctx.trilha,
            rodada,
            decisao,
            pins: sessao.pins.renderizar(),
          }),
        ctx,
      );

      if (isRejeicaoDoCorretor(resultadoDoCorretor)) {
        // DIREITO DE REJEITAR (§7.4): vai para o LEDGER. Um pin VERMELHO do
        // mesmo apontamento CONTRADIZ a rejeição (desconta importância §6.7).
        const conteudo = sessao.artefatos.get(alvo.alvo.caminho)?.conteudo ?? null;
        const material = materialDoApontamento(alvo, conteudo);
        const mutacao = sessao.ledger.registrarRejeicao({
          material,
          justificativa: resultadoDoCorretor.justificativa,
          rodada,
          apontamento_id: alvo.id,
        });
        rejeicoesDoCorretor.push(resultadoDoCorretor);
        if (!mutacao.invalida) {
          const pinDoApontamento = comPin.find((c) => c.apontamento.id === alvo.id)?.pin;
          if (pinDoApontamento !== undefined && vereditosDePins.some((v) => v.pin.id === pinDoApontamento.id && !v.verde)) {
            sessao.ledger.contradizerComPin(material);
          }
        }
        continue;
      }

      // Corretor ACEITOU: o GATE do span é lei (§7.4) — diff fora do span ou
      // malformado invalida a correção inteira; artefato inexistente idem.
      const artefatoAlvo = sessao.artefatos.get(decisao.alvo.arquivo);
      if (artefatoAlvo === undefined) {
        correcoesInvalidas.push({ apontamento_id: alvo.id, motivo: `arquivo "${decisao.alvo.arquivo}" não existe no laço` });
        continue;
      }
      const diff: DiffDeArquivo = { arquivo: decisao.alvo.arquivo, trechos: resultadoDoCorretor.delta };
      const gate = validarDiffNoSpan(diff, decisao.alvo.span);
      if (!gate.ok) {
        correcoesInvalidas.push({ apontamento_id: alvo.id, motivo: 'diff fora do span ou malformado — gate §7.4 (fail-closed)' });
        continue;
      }
      const antes = artefatoAlvo.conteudo;
      const depois = aplicarDelta(antes, resultadoDoCorretor.delta);
      if (depois === antes) {
        correcoesInvalidas.push({ apontamento_id: alvo.id, motivo: 'corretor devolveu delta que não muda nada' });
        continue;
      }

      // ── (6) RE-VERIFICAÇÃO PARCIAL: TODOS os pins (regressão roda já) ───────
      artefatoAlvo.conteudo = depois;
      const vereditosPos = await sessao.pins.todosRodam();
      const quebrouVerde = vereditosPos.some((v) => verdesAntes.has(v.pin.id) && !v.verde);
      if (quebrouVerde) {
        // Correção que quebra pin verde é REJEITADA (§6.7) — o artefato volta.
        artefatoAlvo.conteudo = antes;
        const primeiroQuebrado = vereditosPos.find((v) => verdesAntes.has(v.pin.id) && !v.verde);
        rejeicoesPorPinQuebrado.push({ apontamento_id: alvo.id, pin_id: primeiroQuebrado?.pin.id ?? '?' });
        continue;
      }
      artefatoAlvo.ultimaEdicao = rodada;
      correcoes.push({
        apontamento_id: alvo.id,
        acao: decisao.acao,
        arquivo: decisao.alvo.arquivo,
        span: decisao.alvo.span,
        delta: resultadoDoCorretor.delta,
      });
    }
  }

  // ── RE-VERIFICAÇÃO FINAL: só os itens TOCADOS + TODOS os pins ─────────────
  const tocados = new Set(correcoes.map((c) => c.arquivo));
  const mapaDaReVerificacao =
    tocados.size === 0
      ? sessao.artefatos
      : (() => {
          const mapa = new Map<string, ArtefatoNoLaco>();
          for (const caminho of tocados) {
            const artefato = sessao.artefatos.get(caminho);
            if (artefato !== undefined) mapa.set(caminho, artefato);
          }
          return mapa;
        })();
  const [violacoesFinais, provasFinais] = await Promise.all([
    verificadorDeOrcamento(mapaDaReVerificacao),
    verificadorDeProvas(mapaDaReVerificacao),
  ]);
  const vereditosFinais = await sessao.pins.todosRodam();
  // A parada 0 e o score contam APENAS pins de bloqueante/corrigir (§6.5):
  // pin de sugestão — semeado ou não — nunca derruba a parada 0.
  const pinsDaMecanicaFinais = vereditosFinais.filter((v) => v.pin.apontamento.severity !== 'sugestao');
  const pinsFalhandoFinal = pinsDaMecanicaFinais.filter((v) => !v.verde).length;

  // Os sobreviventes AO PROVADOR que importam para a parada 0 e para o score:
  // excluídos não reabrem rodada e não contam; sugestão nunca abre (§6.5); e
  // um sobrevivente cujo PIN JÁ ESTÁ VERDE foi CORRIGIDO — não é mais um
  // bloqueador em aberto (uma rodada que conserta tudo precisa PARAR, §6.6).
  const sobreviventesAoProvador = comPin.map((c) => c.apontamento);
  const semExcecao = sobreviventesAoProvador.filter((a) => !excluidos.includes(a.id));
  const redIds = new Set(pinsDaMecanicaFinais.filter((v) => !v.verde).map((v) => v.pin.id));
  const bloqueantesOuCorrigir = semExcecao.filter((a) => a.severity !== 'sugestao' && redIds.has(`pin-${a.id}`));
  const somenteCorrigir = semExcecao.filter((a) => a.severity === 'corrigir' && redIds.has(`pin-${a.id}`)).length;

  // score_erro (§6.6) — termos de LAG mantidos do estado ANTERIOR (ver
  // scoreAntes acima): a comparação com a tolerância de rollback mede a piora
  // do estado PROVÁVEL e das regressões prévias, não a descoberta de
  // bloqueadores novos pela própria rodada.
  const scoreDepois = scoreErro(
    violacoesFinais.length,
    provasFinais.length,
    pinsAnterioresVermelhos,
    sessao.apontamentosCorrigirAnterior,
  );
  sessao.apontamentosCorrigirAnterior = somenteCorrigir;

  // O estado pós-rodada entra no buffer (toda versão é guardada — §6.7).
  guardarEstado(sessao, rodada, scoreDepois);

  // Históricos do laço (ping-pong, estagnação) — snapshot do estado
  // pós-rodada ANTES de qualquer restauração da cascata.
  const empurrarHistorico = (): void => {
    sessao.hashes.push(hashDeConteudoDeMapa(sessao.artefatos));
    sessao.estados.push(mapaToStrings(sessao.artefatos));
    sessao.bloqueantesPorRodada.push(bloqueantesOuCorrigir.length);
    if (sessao.estados.length >= 2) {
      sessao.distancias.push(
        distanciaDeArtefatos(sessao.estados[sessao.estados.length - 2], sessao.estados[sessao.estados.length - 1]),
      );
    }
  };
  empurrarHistorico();

  // ── A CASCATA DE PARADA (6.6), na ordem em que dispara ─────────────────────
  const tolerancia = ctx.toleranciaDeRollback ?? TOLERANCIA_DEFAULT_DE_ROLLBACK;
  const limiar = ctx.limiarDeEstagnacao ?? LIMIAR_DEFAULT_DE_ESTAGNACAO;

  let parada: ParadaDeRodada = 'nenhuma';
  let escalada: PlacarDeEscalada | null = null;

  // 0 — MECÂNICA (o oráculo; aprovação do revisor NÃO entra aqui).
  if (
    avaliarParadaMecanica({
      violacoesOrcamento: violacoesFinais.length,
      testesFalhando: provasFinais.length,
      pinsFalhando: pinsFalhandoFinal,
      apontamentosBloqueantesOuCorrigir: bloqueantesOuCorrigir.length,
    })
  ) {
    parada = 'mecanico';
  }
  // 1 — PING-PONG: hash(y_t) == hash(y_t-2) != hash(y_t-1) → menor score.
  else if (
    sessao.hashes.length >= 3 &&
    sessao.hashes[sessao.hashes.length - 1] === sessao.hashes[sessao.hashes.length - 3] &&
    sessao.hashes[sessao.hashes.length - 1] !== sessao.hashes[sessao.hashes.length - 2]
  ) {
    restaurarMenorScore(sessao);
    // O estado restaurado é o estado REAL do fim da rodada — o histórico é
    // refeito para que as rodadas seguintes comparem contra a verdade.
    empurrarHistorico();
    parada = 'pingpong';
  }
  // 2 — ROLLBACK: score_erro_t > score_erro_t-1 + 0,10 → volta y_{t-1}.
  else if (scoreDepois > scoreAntes + tolerancia) {
    restaurarYAnterior(sessao);
    // O estado restaurado volta a ser a base da próxima rodada; re-guardamos
    // o score restaurado e o histórico fiel (§6.7).
    guardarEstado(sessao, rodada, scoreAntes);
    empurrarHistorico();
    parada = 'rollback';
  }
  // 3 — ESTAGNOU (PROXY DECLARADO): 2 rodadas seguidas com distância < limiar
  //     E o número de bloqueantes não caiu.
  else if (
    sessao.distancias.length >= 2 &&
    sessao.distancias[sessao.distancias.length - 1] < limiar &&
    sessao.distancias[sessao.distancias.length - 2] < limiar &&
    sessao.bloqueantesPorRodada.length >= 2 &&
    sessao.bloqueantesPorRodada[sessao.bloqueantesPorRodada.length - 1] >=
      sessao.bloqueantesPorRodada[sessao.bloqueantesPorRodada.length - 2]
  ) {
    parada = 'estagnou';
  }
  // 4 — FAILSAFE: rodada final sem convergir → ESCALA, nunca aceita. O teto
  // é o CLAMPED (a mesma conta da guarda): mesmo com `rodadasMaximas` bruto
  // acima do teto duro na chamada avulsa, a rodada final DENTRO do teto já
  // emite o placar (a próxima chamada lançaria RODADAS_ESGOTADAS).
  else if (rodada >= teto) {
    parada = 'failsafe';
    escalada = {
      quality_warning: true,
      rodada,
      score_erro: scoreDepois,
      apontamentos: semExcecao,
      motivo:
        `rodada ${rodada} de ${teto} sem que a parada 0 MECÂNICA fosse atendida — ` +
        'ESCALA com placar (quality_warning): nunca aceitar por cansaço (§6.6 failsafe).',
    };
  }

  return {
    rodada,
    temViolacaoMecanica,
    revisorChamado,
    apontamentosDoRevisor,
    descartados,
    apontamentosMecanicos,
    sobreviventesAoProvador,
    sugestoes: sugestoesDoRevisor,
    sugestoesDescartadasPorQuota,
    excluidosComoExcecao: excluidos,
    pinsCriados: comPin.map((c) => c.pin),
    defeitosDoCatalogo,
    plano,
    correcoes,
    rejeicoesDoCorretor,
    correcoesInvalidas,
    rejeicoesPorPinQuebrado,
    violacoesDeOrcamento: violacoesFinais.length,
    falhasDeProvas: provasFinais.length,
    pinsFalhando: pinsFalhandoFinal,
    scoreAntes,
    scoreDepois,
    parada,
    escalada,
  };
}

// ---------------------------------------------------------------------------
// A API pública do laço
// ---------------------------------------------------------------------------

/**
 * UMA rodada de revisão (barreira própria, §6.1). Com `sessao` ausente, cria
 * uma sessão nova (rodada 1 do zero). Com `sessao`, roda a PRÓXIMA rodada da
 * mesma execução (compartilhando pins, ledger e version buffer).
 *
 * TETO (§6.6) — VALE AQUI TAMBÉM: `rodarRodadaDeRevisao` NUNCA roda além de
 * `rodadasMaximas` (default 1, teto duro 3). Se a sessão já rodou o teto
 * (ex.: 2ª chamada com `rodadasMaximas: 1`), a chamada LANÇA
 * `ErroEstruturadoDoLaco` com código `RODADAS_ESGOTADAS` — a garantia
 * "nenhum caminho roda mais que maxRodadas" cobre TODA a superfície pública.
 */
export async function rodarRodadaDeRevisao(ctx: ContextoDoLaco, sessao?: SessaoDoLaco): Promise<ResultadoDeRodada> {
  const sessaoViva = sessao ?? criarSessaoDeRevisao(ctx);
  return rodarRodadaInterna(ctx, sessaoViva);
}

/**
 * O LAÇO COMPLETO (F11): roda EXATAMENTE `rodadasMaximas` rodadas (constante,
 * default 1, teto duro 3) — JAMAIS um laço condicionado a apontamento do
 * revisor. A parada 0 MECÂNICA interrompe antes; a rodada final sem convergir
 * vira FAILSAFE com placar (nunca aceita por cansaço).
 *
 * `sessao` opcional: quando fornecida (ex.: o repair P-23 ou a suíte que já
 * semeou pins/exceções), o laço roda SOBRE ela em vez de criar uma nova.
 */
export async function rodarLacoDeRevisao(ctx: ContextoDoLaco, sessao?: SessaoDoLaco): Promise<ResultadoDoLaco> {
  const rodadasMaximas = calcularRodadasMaximas(ctx);
  const contexto: ContextoDoLaco = { ...ctx, rodadasMaximas };
  const sessaoViva = sessao ?? criarSessaoDeRevisao(contexto);
  if (sessaoViva.rodadaAtual >= rodadasMaximas) {
    // Sessão semeada JÁ esgotada desde antes do laço — nem uma rodada a mais:
    // fail-closed (a guarda de `rodarRodadaInterna` faria o mesmo na 1ª
    // chamada; aqui o erro é ESTRUTURADO e imediato, sem rodar nada).
    throw new ErroEstruturadoDoLaco({
      codigo: 'RODADAS_ESGOTADAS',
      etapa: 'laco',
      mensagem:
        `a sessão já rodou ${sessaoViva.rodadaAtual} rodada(s) do teto ${rodadasMaximas} (teto duro ${TETO_DE_RODADAS}) — ` +
        'o laço não tem rodada alguma a rodar (§6.6): falha estruturada, nunca rodada extra em silêncio.',
    });
  }
  const rodadas: ResultadoDeRodada[] = [];

  let paradaFinal: TipoDeParada | null = null;
  for (let r = 1; r <= rodadasMaximas; r += 1) {
    const rodada = await rodarRodadaInterna(contexto, sessaoViva);
    rodadas.push(rodada);
    if (rodada.parada === 'mecanico' || rodada.parada === 'pingpong' || rodada.parada === 'estagnou') {
      paradaFinal = rodada.parada;
      break;
    }
    if (rodada.parada === 'failsafe') {
      paradaFinal = 'failsafe';
      break;
    }
    // 'nenhuma' e 'rollback' (ação, não parada): continua para a próxima
    // rodada se houver (r < rodadasMaximas).
  }

  // O `for` é NUMÉRICO e limitado: terminou sem break → rodadasMaximas rodadas
  // foram rodadas (a última já emitiria failsafe; redundância defensiva).
  if (paradaFinal === null) {
    paradaFinal = 'failsafe';
  }

  const ultima = rodadas[rodadas.length - 1];
  const escalada: PlacarDeEscalada | null =
    rodadas.length === 0
      ? null
      : ultima.escalada ??
        (paradaFinal === 'failsafe'
          ? {
              quality_warning: true,
              rodada: ultima.rodada,
              score_erro: ultima.scoreDepois,
              apontamentos: ultima.sobreviventesAoProvador.filter(
                (a) => !ultima.excluidosComoExcecao.includes(a.id) && a.severity !== 'sugestao',
              ),
              motivo:
                'rodadas esgotadas sem parada 0 mecânica — ESCALA com placar: nunca aceitar por cansaço (§6.6 failsafe).',
            }
          : null);

  return {
    rodadas,
    paradaFinal,
    acessado: paradaFinal === 'mecanico',
    escalada,
    scoreFinal: ultima?.scoreDepois ?? 0,
    artefatosFinais: [...sessaoViva.artefatos.values()].map((a) => ({ ...a })),
  };
}