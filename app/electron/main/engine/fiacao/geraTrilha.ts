/**
 * app/electron/main/engine/fiacao/geraTrilha.ts — P-22 (onda 3/4): o MODO
 * GENERATE da engine de trilhas (`docs/16-engine-de-trilha.md` §8).
 *
 * `gerarTrilha(deps, comandos)` executa F0..F12 — a fiação INJETÁVEL do
 * pipeline — e produz uma trilha nova em `deps.dirProduto`. O CLI
 * (`app/tools/track-engine/cli.ts`) resolve os deps de produção (client,
 * transporte, busca, provador, juiz); os testes injetam FAKES e rodam
 * OFFLINE (A-P22-2). Nada aqui sai à rede por conta própria.
 *
 * DECISÕES DE ARQUITETURA (declaradas — o restante do projeto depende):
 *
 * 1. A MÁQUINA DE FASES É DO runState (P-03). Este módulo apenas a DIRIGE:
 *    `primeiraFasePendente(run)` → executa a fase → `concluirFase(run)`. A
 *    retomada (`--from <fase>`) só VALIDA o pedido contra o run.json e
 *    continua de `primeiraFasePendente` — a fase `em_andamento` (interrompida
 *    no meio) é executada DIRETO, sem `iniciarFase` de novo (contrato de
 *    retomada do runState, cabeçalho do módulo).
 *
 * 2. TODO ESTADO INTERMEDIÁRIO VAI A DISCO (artefatos em `<dir>/artefatos/`
 *    + `budget.generated.json` + `FREEZE.json` + drafts). Uma fase NUNCA
 *    depende de memória da fase anterior: a retomada lê o que já existe.
 *
 * 3. EVENTOS NO LEDGER com runId: `run_criado`, `fase_iniciada`,
 *    `fase_concluida`, `checkpoint`. O checkpoint é O ponto de retomada:
 *    falha de fase → checkpoint OBRIGATÓRIO + run.json INTACTO (a fase fica
 *    `em_andamento`, nada é marcado done → a retomada reexecuta só ela).
 *
 * 4. TETO DE TOKENS POR EXECUÇÃO: o acumulador é a TELEMETRIA existente
 *    (`telemetry.jsonl` — soma de tokensEntrada+tokensSaida de TODAS as
 *    linhas do run). É checado na ENTRADA de cada fase; estourou →
 *    `ErroGeracao('TOKENS_ESGOTADOS')` + checkpoint. A retomada HERDA o
 *    consumo já registrado (fases concluídas não reexecutam → o consumo não
 *    conta duas vezes); a fase que estava no meio consome de novo e isso é
 *    registrado (é consumo REAL).
 *
 * 5. SEM CHAVE: a primeira chamada de LLM falha com o código de chave do
 *    transporte → mapeado para `ErroGeracao('SEM_CHAVE')` com mensagem
 *    DECLARANDO a limitação (§9.2). O RUN FOI CRIADO e fica retomável: a
 *    retomada com a chave configurada continua da fase pendente.
 *
 * 6. F6 (piloto + portão humano): o piloto (3 aulas — raiz, a mais
 *    armadilhada, a tardia) é AUTORADO e então o PORTÃO é consultado —
 *    `deps.lerAprovacaoF6(dir)` (INJETADO; a interface contratada do P-25:
 *    só lança/erro F6_NAO_APROVADO ou devolve a aprovação). O DEFAULT lê
 *    `<dir>/aprovacaoF6.json` (`{aprovado, parecer?}`) — o humano escreve o
 *    arquivo depois de revisar o piloto. `--from F7+` EXIGE o marker ANTES
 *    de qualquer coisa (a fase F6 não roda na retomada → o portão é
 *    revalidado na entrada). Se o marker já estiver aprovado na entrada da
 *    F6, o piloto NÃO é re-autorado (retomada da própria F6).
 *
 * 7. F10/F11 (laço de revisão) é INJETADO (`deps.revisao`): SEM o dep, a
 *    rodada de revisão é DECLARADA como limitação na saída (nunca omitida —
 *    §9.2) e a máquina segue (F11 re-verifica os drafts). COM o dep, a
 *    fiação oferece `criarRevisaoDaFiacao(...)` (onda 5 — paralelização): o
 *    bridge pronto que roda o laço REAL `rodarLacoDeRevisao`
 *    (`review/loop.ts`) sobre os DRAFTS recém-autorados da onda — o chamador
 *    só provê o transporte LLM dos papéis (revisar/planejar/corrigir), os
 *    modelos e o provador; o restante do `ContextoDoLaco` (artefatos no laço,
 *    snapshot de orçamento por ref a partir do F2 + harness, verificadores
 *    JSON-aware dos drafts) é montado AQUI com as deps padrão da fiação.
 *
 * 8. PARALELISMO DA VERIFICAÇÃO (onda 5): a F9 e a re-verificação da F11
 *    verificam os refs em MAP PARALELO com `createExecSemaphore()` (SEM_EXEC
 *    — `availableParallelism()-1`), via `verificarRefsEmParalelo`. Cada ref é
 *    verificado INDEPENDENTEMENTE (prover + orçamento) e o relatório é
 *    reordenado pela ordem estável dos refs após o `Promise.all` — resultado
 *    byte-idêntico ao serial. A verificação é READ-ONLY sobre os drafts (o
 *    laço de revisão escreve nos próprios artefatos em memória; os drafts em
 *    disco só são lidos) — sem corrida de escrita.
 *
 * 8. HASHLESS placeholders: `criarRun` nasce com `budgetHash`/`graphHash` =
 *    `sha256Hex('')` (o runState exige sha256 válido); a F5, com o freeze
 *    real, ATUALIZA o run.json com os hashes reais (`hashDoOrcamento` +
 *    `hashDoGrafo`).
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

// ─── runtime (P-01/P-02/P-03) ────────────────────────────────────────────────

import {
  FASES_ORDEM,
  criarRun,
  iniciarFase,
  concluirFase,
  primeiraFasePendente,
  runConcluido,
  lerRun,
  salvarRun,
  temRun,
  escreverArquivoPadrao,
  escreverAtomico,
  type EscreverArquivoFn,
  type FaseId,
  type RunState,
} from '../runtime/runState';
import { Ledger, TelemetriaFile, sha256Hex, type EventoNovo, type Telemetria } from '../runtime/ledger';
import type { EngineLlm, LlmStageError, StageUsage } from '../runtime/callLlm';
import { createExecSemaphore, createSemaphore, type Semaphore } from '../runtime/semaphore';
import type { RateLimiters } from '../runtime/scheduler';
import { LLM_ERROR_CODES } from '../../services/llmClient';

// ─── laço de revisão (P-18) + ponte audit→laço (P-35) — o bridge da F10 ────

import {
  rodarLacoDeRevisao,
  type ArtefatoNoLaco,
  type ContextoDoLaco,
  type CorretorLlm,
  type PlanejadorLlm,
  type RevisorLlm,
  type SnapshotDeOrcamento,
  type SurfaceDeOrcamento,
  type VerificadorDeOrcamento,
  type VerificadorDeProvas,
  type ViolacaoMecanica,
} from '../review/loop';
import { localizarSpanNoArquivo, localizarValoresDeStringNoJson } from '../review/audit2Laco';
import type { MapaDeFamilias } from '../review/normalize';
import type { ExecFn } from '../exec/proofs';
import { extractAtoms } from '../extract';

// ─── fases (leitura OK — SEM modificações; fiação aqui) ─────────────────────

import { gerarBrief, type Brief } from '../phases/f0Brief';
import { gerarNotionalMachine, type NotionalMachine } from '../phases/notionalMachine';
import {
  criarBuscaPlanejada,
  criarF1Research,
  type ArtefatoF1,
  type Busca,
  type ExecutorDeMultiBusca,
  type F1Config,
} from '../phases/f1Research';
import { decomporAssunto, type FamiliaAssunto, type NoAtomico } from '../phases/f2Decompose';
import {
  criarJuizDeArestaLlm,
  rodarF3,
  type JuizDeAresta,
  type ResultadoF3,
} from '../phases/f3Graph';
import {
  deriveBudgetDoGrafo,
  materializarBudget,
  orcamentoMonotonico,
  hashDoOrcamento,
  checarGMonotonicidade,
  type AulaPlano,
  type BudgetF4,
  type ResultadoF4,
} from '../phases/f4Budget';
import { congelar, hashDoGrafo, type Freeze } from '../phases/f5Freeze';
import {
  caminhoDraftAula,
  caminhoDraftDesafio,
  runOndaDeAutoria,
  type DepsDaOndaAutoria,
  type DossieDeAula,
} from '../phases/f7Theory';
import {
  montarInputDasProvas,
  ofensasDeOrcamentoDoDesafio,
  type ProverDeDesafio,
  type SaidaDesafio,
} from '../phases/f8Challenges';
import {
  gFinal,
  materializarTrilha,
  type DepsMaterializar,
  type DesafioDoDossie,
  type DossieDeTrilha,
  type ResultadoGFinal,
  type ResultadoMaterializacao,
} from '../phases/f12Materialize';
import { montarDossie, type Dossier } from '../prompts/dossier';

// ─── schemas / lint (G-SCHEMA preflight — P-04/P-33) ────────────────────────

import {
  SCHEMA_REGISTRY,
  LessonDraftSchema,
  ChallengeDraftSchema,
} from '../schemas/artifacts';
import { garantirSchemasValidos, lintSchemasDaEngine } from '../schemas/fieldOrder';
import { conceptId } from '../graph/model';
import type { ConceptGraph, ConceptId } from '../graph/model';
import { HARNESS_RECEPTIVE_SEED } from '../atomKeys';

// ---------------------------------------------------------------------------
// Erros estruturados (fail-closed — INV-03)
// ---------------------------------------------------------------------------

export type CodigoErroGeracao =
  | 'F6_NAO_APROVADO'
  | 'TOKENS_ESGOTADOS'
  | 'SEM_CHAVE'
  | 'BARREIRA_G_SCHEMA'
  | 'G_COVER_PESQ_NAO_APROVADO'
  | 'G_ATOM_VAZIO'
  | 'VIOLACAO_DE_GRAFO'
  | 'G_MONO_NAO_CUMPRIDO'
  | 'AUTORIA_FALHOU'
  | 'AUTORIA_BLOQUEADA'
  | 'DRAFTS_INVALIDOS'
  | 'VERIFICACAO_FALHOU'
  | 'GFINAL_FALHOU'
  | 'FASE_FALHOU'
  | 'RETOMADA_INCOMPATIVEL'
  | 'SEM_RUN_PARA_RETOMAR'
  | 'F1_BUSCA_NAO_FIADA'
  | 'ARTEFATO_AUSENTE'
  | 'FASE_INVALIDA';

/** Erro estruturado da geração — código estável + fase (quando aplicável). */
export class ErroGeracao extends Error {
  readonly code: CodigoErroGeracao;
  /** Fase em que a geração parou (a fase fica `em_andamento` — retomável). */
  fase?: FaseId;
  readonly causa?: unknown;

  constructor(code: CodigoErroGeracao, mensagem: string, fase?: FaseId, causa?: unknown) {
    super(mensagem);
    this.name = 'ErroGeracao';
    this.code = code;
    if (fase !== undefined) this.fase = fase;
    if (causa !== undefined) this.causa = causa;
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

// ---------------------------------------------------------------------------
// Layout dos artefatos do run (este módulo é o dono; F5/F4 têm os próprios
// arquivos canônicos: budget.generated.json e FREEZE.json)
// ---------------------------------------------------------------------------

/** Nome do diretório de artefatos da fiação (dentro do dir do run). */
export const DIR_ARTEFATOS = 'artefatos';
/** Nome do marker do portão humano da F6 (escrito pelo HUMANO). */
export const ARQUIVO_APROVACAO_F6 = 'aprovacaoF6.json';

export const ARTEFATO_BRIEF = 'brief.json';
export const ARTEFATO_NOTIONAL = 'notional-machine.json';
export const ARTEFATO_F1 = 'f1.json';
export const ARTEFATO_NOS = 'nos.json';
export const ARTEFATO_F3 = 'f3.json';
export const ARTEFATO_F4 = 'f4.json';
export const ARTEFATO_F5 = 'f5.json';
export const ARTEFATO_F9 = 'f9.json';
export const ARTEFATO_REPORT = 'report.json';

function caminhoArtefato(dir: string, nome: string): string {
  return path.join(dir, DIR_ARTEFATOS, nome);
}

// ---------------------------------------------------------------------------
// Contratos da fiação (INJETÁVEIS — offline testável)
// ---------------------------------------------------------------------------

/** Comandos do modo generate (o que o CLI entrega). */
export interface ComandosGeracao {
  /** Slug da trilha nova (padrão seguro — validação do runState). */
  slug: string;
  /** Assunto pedido pelo usuário — o tema a produzir (F0). */
  assunto: string;
  /**
   * --from <fase>: ponto de retomada pedido. A máquina VALIDA contra
   * `primeiraFasePendente(run.json)` e continua daí (nunca salta).
   */
  from?: FaseId | string;
  /**
   * --only <slug>: restringe a AUTORIA/verificação a UMA aula (depuração).
   * A F12 só fecha quando TODAS as aulas do orçamento têm draft — no modo
   * `--only` o run normalmente para antes (falha declarada).
   */
  only?: string;
  /** --teto-tokens N: teto de tokens POR EXECUÇÃO (acumulado do run). */
  tetoTokens?: number;
  /** --familia: família de decomposição do F2 (default 'sintaxe'). */
  familia?: FamiliaAssunto;
  /** --linguagem / --plataforma: contexto do brief. */
  linguagem?: string;
  plataforma?: string;
}

/** Aprovação do portão humano da F6 (contrato do P-25 e do DEFAULT). */
export interface AprovacaoF6 {
  aprovado: boolean;
  parecer?: string;
}

/** Artefatos que a fiação entrega ao laço de revisão (seam pós-merge P-35). */
export interface ArtefatosDaRevisao {
  dir: string;
  freeze: Freeze;
  budget: BudgetF4;
  aulas: Array<{ ref: string; aula: unknown; desafio: SaidaDesafio }>;
}

/** A fiação da revisão (F10/F11) — INJETÁVEL; default: não operada. */
export interface RevisaoInjetada {
  rodar(artefatos: ArtefatosDaRevisao, opcoes?: { rodadasMaximas?: number }): Promise<{ rodadas: number }>;
  rodadasMaximas?: number;
}

/** Contexto entregue a um executor de fase INJETADO (testes). */
export interface ContextoDeFase {
  dir: string;
  dirProduto: string;
  comandos: ComandosGeracao;
  run: RunState;
  lerArtefato<T>(nome: string): Promise<T>;
  gravarArtefato(nome: string, valor: unknown): Promise<void>;
  anexarEvento(evento: EventoNovo): Promise<void>;
  anexarTelemetria(linha: Omit<Telemetria, 'quando'>): Promise<void>;
}

/** Executor de fase injetável — sobrescreve a implementação REAL (testes). */
export type ExecutorDeFase = (ctx: ContextoDeFase) => Promise<RunState | void>;

export interface DepsGeracao {
  /** Raiz do run (onde run.json/ledger/artefatos vivem). OBRIGATÓRIO. */
  dir: string;
  /** Destino do produto final (F12). OBRIGATÓRIO. */
  dirProduto: string;
  /** Transporte ÚNICO de LLM (P-01) — fake nos testes (A-P22-2). */
  llm: EngineLlm;
  /** Provador das quatro provas (P-31) — fake nos testes. OBRIGATÓRIO. */
  prover: ProverDeDesafio;
  /**
   * Busca F1 INJETADA (A-P14-2). AUSENTE: o dep default é montado de
   * `multi` (executor de multi-busca — em produção, o Brave); sem `multi`
   * também, a F1 ABORTA com F1_BUSCA_NAO_FIADA (limitação declarada).
   */
  busca?: Busca;
  multi?: ExecutorDeMultiBusca;
  /** Juiz de arestas da F3 — default: criarJuizDeArestaLlm(llm). */
  juizArestas?: JuizDeAresta;
  /**
   * Portão da F6 — interface CONTRATADA do P-25 (`phases/f6Pilot`:
   * `lerAprovacaoF6(dir)`). AUSENTE: default lê `<dir>/aprovacaoF6.json`.
   * O P-25 pós-merge injeta a implementação real sem tocar neste módulo.
   */
  lerAprovacaoF6?: (dir: string) => Promise<AprovacaoF6>;
  /** Laço de revisão (F10/F11) — seam pós-merge do P-35 (ver cabeçalho). */
  revisao?: RevisaoInjetada;
  /** Config da F1 (parciais; omitidos usam os defaults declarados aqui). */
  f1Config?: Partial<F1Config>;
  /** Pool do escalonador de autoria — SEPARADO do SEM_LLM do transporte (P-27). */
  semaforoOnda?: Semaphore;
  /** Semáforo do fan-out de julgamento de arestas (F3). */
  semaforoJulgamento?: Semaphore;
  /**
   * SEM_EXEC da VERIFICAÇÃO F9/F11 (map paralelo por ref — onda 5). Default:
   * `createExecSemaphore()` (teto = `availableParallelism()-1`, §4.1). A
   * verificação é READ-ONLY sobre os drafts (cada ref roda prover + orçamento
   * independentemente) — o semáforo limita os spawns das provas em voo; o
   * relatório sai na ordem ESTÁVEL dos refs (nunca na ordem de conclusão).
   */
  semaforoVerificacao?: Semaphore;
  /**
   * O AXIOMA de entrada da trilha (F0 → F3/F4): construções que o aluno JÁ
   * domina ao entrar (produtivas). Default: [] (trilha de senso iniciante).
   * NOTA DE TIPAGEM: entryConstructs/seedsReceptivos são ids de CONCEITO do
   * GRAFO (snake_case — validados por `conceptId`/`validarPlano`), NÃO chaves
   * de átomo (com ':'); a decisão do axioma pertence ao escritor serial da F3
   * — o P-22 expõe o seam e documenta (o harness entra nas PERMITIDAS de
   * F8/F9, não no grafo).
   */
  entryConstructs?: string[];
  seedsReceptivos?: string[];
  /** Limiters completos da autoria (default: 3 objetos criados de semaforoOnda). */
  limiters?: RateLimiters;
  /** Sobrescreve fases REAIS (testes). */
  faseOverride?: Partial<Record<FaseId, ExecutorDeFase>>;
  /** Deps do F12/gFinal (verificador/loader injetáveis — testes). */
  gFinalDeps?: DepsMaterializar;
  /** Teto de tokens por execução (soma da telemetria do run). */
  tetoTokensPorExecucao?: number;
  /** Progresso linha-a-linha com runId — o CLI imprime `[<runId>] ...`. */
  onEvento?: (linha: string) => void;
}

/** Resultado estruturado do modo generate. */
export interface ResultadoGeracao {
  runId: string;
  slug: string;
  concluido: boolean;
  /** Fase atual da máquina (a primeira não concluída; 'F12' num run concluído). */
  faseAtual: FaseId;
  /** Destino da trilha materializada (quando F12 rodou). */
  destino?: string;
  arquivosMaterializados?: number;
  gFinal?: ResultadoGFinal;
  /** Limitações DECLARADAS da execução (§9.2 — nunca omitidas). */
  limitacoes: string[];
  /** Artefatos da fiação gravados no run. */
  artefatos: { nome: string; caminho: string }[];
}

// ---------------------------------------------------------------------------
// Defaults da fiação
// ---------------------------------------------------------------------------

/**
 * Os átomos do HARNESS de teste — a SEMENTE CURADA do produto
 * (`atomKeys.HARNESS_RECEPTIVE_SEED` — política `receptive-seed`, docs §3.2/D1):
 * o que o aluno LÊ em todo desafio (`import`, `node:test`/`assert`, a chamada
 * de teste) e nunca escreve. É a base das listas PERMITIDAS que a F8/F9
 * conferem contra os drafts — a MESMA base que a autoria usou (o dossiê).
 * Determinística, sem extractor: a fonte única é a lista medida do produto.
 */
export function atomosDeHarnessReceptivo(): string[] {
  return [...HARNESS_RECEPTIVE_SEED];
}

/** Defaults declarados da config F1 (parâmetros do paralelismo §4.1). */
export function f1ConfigDefault(): F1Config {
  return {
    concorrenciaDeAssuntos: 2,
    atrasoEntreLotesMs: 250,
    atrasoSobRateLimitMs: 30_000,
    tetoTokensPorRetorno: 2000,
    tetoAchadosPorSubTopico: 15,
    tetoQueriesPorSubTopico: 8,
    stageVersion: 'f1-plano-v1',
    timeoutMs: 120_000,
  };
}

/** Dossiês de aula DETERMINÍSTICOS a partir do freeze + orçamento + F2 + F0. */
export function construirDossiesDeAula(opts: {
  freeze: Freeze;
  budget: BudgetF4;
  nos: readonly NoAtomico[];
  brief: Brief;
}): DossieDeAula[] {
  const porRef = new Map(opts.budget.aulas.map((a) => [a.ref, a]));
  const noPorRef = new Map<string, NoAtomico>();
  for (const no of opts.nos) noPorRef.set(`m1/${no.chave_conceito}`, no);
  const harness = atomosDeHarnessReceptivo();

  return opts.freeze.snapshots.map((snap): DossieDeAula => {
    const aula = porRef.get(snap.aula_slug);
    if (aula === undefined) {
      // Inalcançável (snapshots derivam do MESMO orçamento), mas fail-closed.
      throw new ErroGeracao(
        'ARTEFATO_AUSENTE',
        `snapshot do freeze sem entrada no orçamento: ${snap.aula_slug}`,
      );
    }
    const no = noPorRef.get(snap.aula_slug);
    const dedup = (lista: readonly string[]): string[] => {
      const vistos: string[] = [];
      for (const item of lista) if (!vistos.includes(item)) vistos.push(item);
      return vistos;
    };
    // BASELINE determinístico (documentado no cabeçalho): as listas de
    // ORÇAMENTO do dossiê são os ÁTOMOS que o nó F2 introduz (a mesma fonte
    // da validação pós-autoria F8/F9) + a semente curada do harness para o
    // budget_teste. O portão humano da F6 revisa exatamente esta qualidade.
    const introduz = no ?? { introduces: { receptive: [] as string[], productive: [] as string[] } };
    const dossie: Dossier = montarDossie({
      objetivo: {
        verbo: 'aplicar',
        objeto: no?.nome ?? snap.aula_slug,
        contexto: opts.brief.tema,
        criterio: 'resolver o desafio da aula usando a construção introduzida',
      },
      introduces_productive: [...(introduz.introduces.productive ?? [])],
      budget_produtivo: [...(introduz.introduces.productive ?? [])],
      budget_receptivo: [...(introduz.introduces.receptive ?? [])],
      budget_teste: dedup([...harness, ...(introduz.introduces.receptive ?? []), ...(introduz.introduces.productive ?? [])]),
      kc_type: no?.kc_type ?? 'regra',
      ei_class: no?.ei_class ?? 'isolado',
      subgoals: no ? [no.nome] : [],
      terms: [],
      notional_machine_delta: `máquina nocional do brief (F0): ${opts.brief.tema}`,
      fora_de_escopo: [
        { item: 'construções fora dos orçamentos', motivo: '§7.1 R3 — defeito do grafo, não licença' },
      ],
      misconceptions_a_refutar: [],
      desafios_ja_escritos: [],
    });
    return { aula_slug: snap.aula_slug, snapshot: snap, dossie, desafios_anteriores: [] };
  });
}

/** Plano de aulas 1-conceito-por-aula (espelho do planoPadrao da F3, §4.1). */
export function planoDeAulasDosNos(nos: readonly NoAtomico[]): AulaPlano[] {
  return [...nos]
    .sort((a, b) => a.chave_conceito.localeCompare(b.chave_conceito))
    .map((no) => ({ ref: `m1/${conceptId(no.chave_conceito)}`, introduz: [conceptId(no.chave_conceito)] }));
}

/** As TRÊS aulas do piloto da F6: raiz, a mais armadilhada e a tardia (§4/§12-D2). */
export function selecionarPiloto(dossies: readonly DossieDeAula[], budget: BudgetF4): DossieDeAula[] {
  const posicao = new Map(budget.aulas.map((a, i) => [a.ref, i]));
  const ordenadas = [...dossies].sort(
    (a, b) => (posicao.get(a.aula_slug) ?? Number.MAX_SAFE_INTEGER) - (posicao.get(b.aula_slug) ?? Number.MAX_SAFE_INTEGER),
  );
  if (ordenadas.length <= 3) return ordenadas;
  const porRef = new Map(budget.aulas.map((a) => [a.ref, a]));
  let maisArmadilhada = ordenadas[0];
  let maiorContagem = -1;
  for (const d of ordenadas) {
    const aula = porRef.get(d.aula_slug);
    const contagem = aula?.element_count ?? 0;
    if (contagem > maiorContagem) {
      maiorContagem = contagem;
      maisArmadilhada = d;
    }
  }
  const escolhidas: DossieDeAula[] = [];
  for (const candidata of [ordenadas[0], maisArmadilhada, ordenadas[ordenadas.length - 1]]) {
    if (!escolhidas.some((e) => e.aula_slug === candidata.aula_slug)) escolhidas.push(candidata);
  }
  return escolhidas;
}

/** Cria os limiters do escalonador (pools SEPARADOS do SEM_LLM — P-27). */
export function criarLimitersDefault(semaforo?: Semaphore): RateLimiters {
  const pool = semaforo ?? createSemaphore(8);
  return { llm: pool, exec: createSemaphore(4), cpu: createSemaphore(4) };
}

// ---------------------------------------------------------------------------
// A máquina (dirige a máquina de fases do runState; eventos no ledger)
// ---------------------------------------------------------------------------

/** O veredito de UMA ref na verificação F9/F11 (provas + orçamento). */
export interface FaseF9Ref {
  ref: string;
  provas: { valid: boolean; falhas: string[] };
  ofensasOrcamento: string[];
  falhaDeParse: string | null;
  ok: boolean;
}

export class GeradorDeTrilha {
  private readonly limitacoes: string[] = [];
  private readonly artefatosGravados: { nome: string; caminho: string }[] = [];
  private runId = '';
  /**
   * SEM_EXEC da verificação F9/F11 — criado UMA vez por run (F9 e F11
   * compartilham o MESMO pool; injetável via `deps.semaforoVerificacao`).
   */
  private readonly semaforoVerificacao: Semaphore;

  constructor(
    private readonly deps: DepsGeracao,
    private readonly comandos: ComandosGeracao,
  ) {
    this.semaforoVerificacao = deps.semaforoVerificacao ?? createExecSemaphore();
  }

  // ── infra ─────────────────────────────────────────────────────────────────

  private dir(): string {
    return this.deps.dir;
  }

  private dirProduto(): string {
    return this.deps.dirProduto;
  }

  private emitir(mensagem: string): void {
    if (this.deps.onEvento && this.runId !== '') {
      this.deps.onEvento(`[${this.runId}] ${mensagem}`);
    }
  }

  private async anexarEvento(evento: EventoNovo): Promise<void> {
    const ledger = new Ledger(this.dir());
    const linha = await ledger.anexar(evento);
    this.emitir('evento-ledger:' + linha.tipo);
  }

  private async gravarArtefato(nome: string, valor: unknown): Promise<void> {
    const caminho = caminhoArtefato(this.dir(), nome);
    await fsp.mkdir(path.dirname(caminho), { recursive: true });
    await escreverAtomico(caminho, `${JSON.stringify(valor, null, 2)}\n`);
    if (!this.artefatosGravados.some((a) => a.nome === nome)) {
      this.artefatosGravados.push({ nome, caminho });
    }
  }

  private async lerArtefato<T>(nome: string): Promise<T> {
    const caminho = caminhoArtefato(this.dir(), nome);
    let texto: string;
    try {
      texto = await fsp.readFile(caminho, 'utf8');
    } catch (erro) {
      throw new ErroGeracao(
        'ARTEFATO_AUSENTE',
        `artefato ${nome} ausente em ${caminho} — a fase anterior não concluiu (${mensagemDe(erro)})`,
      );
    }
    try {
      return JSON.parse(texto) as T;
    } catch (erro) {
      throw new ErroGeracao('ARTEFATO_AUSENTE', `artefato ${nome} corrompido: ${mensagemDe(erro)}`);
    }
  }

  private contexto(run: RunState): ContextoDeFase {
    const dir = this.dir();
    return {
      dir,
      dirProduto: this.dirProduto(),
      comandos: this.comandos,
      run,
      lerArtefato: (nome) => this.lerArtefato(nome),
      gravarArtefato: (nome, valor) => this.gravarArtefato(nome, valor),
      anexarEvento: (e) => this.anexarEvento(e),
      anexarTelemetria: (l) => this.anexarTelemetria(l),
    };
  }

  private async anexarTelemetria(linha: Omit<Telemetria, 'quando'>): Promise<void> {
    const telemetria = new TelemetriaFile(this.dir());
    await telemetria.anexar({ quando: new Date().toISOString(), ...linha });
  }

  /** Soma de tokens da telemetria existente do run (o acumulador do teto). */
  private async tokensAcumuladosDoRun(): Promise<number> {
    const telemetria = new TelemetriaFile(this.dir());
    const linhas = await telemetria.ler();
    return linhas.reduce((soma, l) => soma + l.tokensEntrada + l.tokensSaida, 0);
  }

  private async verificarTetoDeTokens(): Promise<void> {
    const teto = this.comandos.tetoTokens ?? this.deps.tetoTokensPorExecucao;
    if (teto === undefined) return;
    const acumulado = await this.tokensAcumuladosDoRun();
    if (acumulado >= teto) {
      throw new ErroGeracao(
        'TOKENS_ESGOTADOS',
        `teto de tokens por execução estourado: ${acumulado} ≥ ${teto} (acumulado da telemetria do run). ` +
          'Nada se perdeu: a fase pendente continua em_andamento e a retomada herda o consumo já registrado.',
      );
    }
  }

  /** Uso agregado do transporte ANTES de uma fase (para o delta da telemetria). */
  private usoAgregado(): { entrada: number; saida: number } {
    const usos = this.deps.llm.getAllStageUsage() as Readonly<Record<string, StageUsage>>;
    let entrada = 0;
    let saida = 0;
    for (const uso of Object.values(usos)) {
      entrada += uso.promptTokens;
      saida += uso.completionTokens;
    }
    return { entrada, saida };
  }

  private async telemetriaDaFase(
    fase: FaseId,
    antes: { entrada: number; saida: number },
    inicioEm: number,
  ): Promise<void> {
    const depois = this.usoAgregado();
    await this.anexarTelemetria({
      tarefa: 'fase',
      etapa: fase,
      tokensEntrada: Math.max(0, depois.entrada - antes.entrada),
      tokensSaida: Math.max(0, depois.saida - antes.saida),
      latenciaMs: Date.now() - inicioEm,
      contagem: 1,
    });
  }

  /** Determina o ponto de retomada (--from validado) e carrega/cria o run. */
  private async prepararRun(): Promise<{ run: RunState; criado: boolean }> {
    const { slug, from } = this.comandos;
    const existe = await temRun(this.dir());

    if (existe) {
      const run = await lerRun(this.dir());
      if (from !== undefined) {
        const pendente = primeiraFasePendente(run);
        if (pendente !== null && from !== pendente) {
          throw new ErroGeracao(
            'RETOMADA_INCOMPATIVEL',
            `--from ${from} não casa com o run existente (a primeira fase não concluída é ${pendente}). ` +
              'A retomada NUNCA salta fases: continue de onde o run parou (ou remova --from).',
          );
        }
        if (pendente === null && from !== 'F12') {
          throw new ErroGeracao('RETOMADA_INCOMPATIVEL', `o run já está concluído (--from ${from} ignorado).`);
        }
      }
      this.runId = run.runId;
      return { run, criado: false };
    }

    if (from !== undefined && from !== 'F0') {
      throw new ErroGeracao(
        'SEM_RUN_PARA_RETOMAR',
        `--from ${from} exige um run existente (${this.dir()}/run.json ausente). ` +
          'Crie o run sem --from e retome depois da interrupção.',
      );
    }

    const run = criarRun({
      slug,
      // Placeholders de hash até a F5 (a F5 grava os hashes REAIS no run.json).
      budgetHash: sha256Hex(''),
      graphHash: sha256Hex(''),
      modelosPorEtapa: {},
      promptVersao: '1.0.0',
      catalogoVersao: '1.0.0',
    });
    await fsp.mkdir(this.dir(), { recursive: true });
    await fsp.mkdir(path.join(this.dir(), DIR_ARTEFATOS), { recursive: true });
    await salvarRun(this.dir(), run);
    await this.anexarEvento({ tipo: 'run_criado', runId: run.runId, slug });
    this.runId = run.runId;
    return { run, criado: true };
  }

  /** F6+ exige o marker do portão — revalidado na ENTRADA (--from F7+). */
  private async verificarPortaoF6NaEntrada(): Promise<void> {
    const aprovacao = await this.lerAprovacaoF6();
    if (!aprovacao.aprovado) {
      throw new ErroGeracao(
        'F6_NAO_APROVADO',
        aprovacao.parecer
          ? `portão humano da F6 não aprovou o piloto: ${aprovacao.parecer}`
          : 'portão humano da F6 não aprovou o piloto (marker ausente ou aprovado:false). ' +
              'A autoria completa (F7+) NÃO pode rodar sem o marker da F6.',
      );
    }
  }

  /** O portão da F6 — injetável (P-25 pós-merge); default: arquivo do humano. */
  async lerAprovacaoF6(): Promise<AprovacaoF6> {
    if (this.deps.lerAprovacaoF6) {
      return this.deps.lerAprovacaoF6(this.dir());
    }
    const caminho = path.join(this.dir(), ARQUIVO_APROVACAO_F6);
    let texto: string;
    try {
      texto = await fsp.readFile(caminho, 'utf8');
    } catch {
      return { aprovado: false, parecer: `marker ausente (escreva ${ARQUIVO_APROVACAO_F6} com {aprovado:true})` };
    }
    try {
      const cru = JSON.parse(texto) as { aprovado?: unknown; parecer?: unknown };
      return {
        aprovado: cru.aprovado === true,
        parecer: typeof cru.parecer === 'string' ? cru.parecer : undefined,
      };
    } catch (erro) {
      throw new ErroGeracao('F6_NAO_APROVADO', `marker ${ARQUIVO_APROVACAO_F6} ilegível: ${mensagemDe(erro)}`);
    }
  }

  // ── o laço da máquina ─────────────────────────────────────────────────────

  async rodar(): Promise<ResultadoGeracao> {
    const { run: runInicial, criado } = await this.prepararRun();
    if (criado) this.emitir(`run criado (${runInicial.runId}) — trilha ${this.comandos.slug}`);

    // --from F7+ (ou retomada cuja pendente é F7+) EXIGE o marker da F6.
    const pendenteInicial = primeiraFasePendente(runInicial);
    if (pendenteInicial !== null && FASES_ORDEM.indexOf(pendenteInicial) >= FASES_ORDEM.indexOf('F7')) {
      await this.verificarPortaoF6NaEntrada();
      this.emitir('portão F6 (marker) validado — prosseguindo para a autoria');
    }

    let run = runInicial;
    let pendente = primeiraFasePendente(run);
    while (pendente !== null) {
      run = await this.executarFase(run, pendente);
      pendente = primeiraFasePendente(run);
    }

    return {
      runId: run.runId,
      slug: run.slug,
      concluido: runConcluido(run),
      faseAtual: run.faseAtual,
      destino: this.dirProduto(),
      gFinal: this.gFinalResultado,
      limitacoes: [...this.limitacoes],
      artefatos: [...this.artefatosGravados],
    };
  }

  private gFinalResultado: ResultadoGFinal | undefined;

  private async executarFase(runAtual: RunState, fase: FaseId): Promise<RunState> {
    // TETO DE TOKENS — checado na ENTRADA de cada fase (acumulador da telemetria).
    // Estourou → checkpoint OBRIGATÓRIO + run.json INTACTO (a fase nem inicia;
    // fica `pendente` — a retomada herda o consumo já registrado e continua).
    try {
      await this.verificarTetoDeTokens();
    } catch (erro) {
      if (erro instanceof ErroGeracao && erro.code === 'TOKENS_ESGOTADOS') {
        await this.anexarEvento({
          tipo: 'checkpoint',
          runId: this.runId,
          descricao: `TOKENS_ESGOTADOS na entrada da fase ${fase}: teto alcançado, aborto estruturado (nada foi executado nesta fase)`,
        });
      }
      throw erro;
    }

    let run = runAtual;
    if (run.fases[fase] === 'pendente') {
      run = iniciarFase(run, fase);
      await salvarRun(this.dir(), run);
      await this.anexarEvento({ tipo: 'fase_iniciada', runId: this.runId, fase });
      this.emitir(`Fase ${fase} iniciada`);
    } else if (run.fases[fase] === 'em_andamento') {
      // Retomada no MEIO da fase: executa direto (contrato de retomada P-03).
      this.emitir(`Fase ${fase} retomada (estava em_andamento)`);
    } else {
      throw new ErroGeracao('FASE_INVALIDA', `fase ${fase} já concluída — máquina inconsistente`);
    }

    const usoAntes = this.usoAgregado();
    const inicioEm = Date.now();
    let runAposFase: RunState | undefined;
    try {
      const override = this.deps.faseOverride?.[fase];
      if (override) {
        runAposFase = (await override(this.contexto(run))) ?? undefined;
      } else {
        runAposFase = (await this.executarFaseReal(run, fase)) ?? undefined;
      }
    } catch (erro) {
      // Checkpoint OBRIGATÓRIO + run.json INTACTO (fase fica em_andamento).
      const detalhe = this.detalharFalha(erro, fase);
      await this.anexarEvento({
        tipo: 'checkpoint',
        runId: this.runId,
        descricao: `falha na fase ${fase}: ${detalhe.mensagem}`,
      });
      await this.telemetriaDaFase(fase, usoAntes, inicioEm);
      if (erro instanceof ErroGeracao) {
        if (erro.fase === undefined) erro.fase = fase;
        throw erro;
      }
      throw detalhe.erro;
    }

    await this.telemetriaDaFase(fase, usoAntes, inicioEm);

    // A fase pode ter DEVOLVIDO um run novo (ex.: a F5 grava os hashes reais) —
    // a máquina adota esse estado para o `concluirFase` (nunca sobrescreve).
    if (runAposFase) run = runAposFase;

    run = concluirFase(run, fase);
    await salvarRun(this.dir(), run);
    await this.anexarEvento({ tipo: 'fase_concluida', runId: this.runId, fase });
    this.emitir(`Fase ${fase} concluida`);
    return run;
  }

  /** Classifica QUALQUER falha de fase em ErroGeracao estruturado. */
  private detalharFalha(erro: unknown, fase: FaseId): { erro: ErroGeracao; mensagem: string } {
    if (erro instanceof ErroGeracao) {
      return { erro, mensagem: erro.message };
    }
    const codigo = (erro as { code?: unknown } | null)?.code;
    if (codigo === LLM_ERROR_CODES.KEY_MISSING || codigo === 'F1_LLM_SEM_CHAVE' || codigo === 'F1_BUSCA_SEM_CHAVE' || codigo === 'BRAVE_KEY_MISSING') {
      const erroEstruturado = new ErroGeracao(
        'SEM_CHAVE',
        `LIMITAÇÃO DECLARADA: a execução parou na fase ${fase} SEM chave de API configurada. ` +
          'O run foi criado e é RETOMÁVEL: configure a chave (OPENROUTER_API_KEY / Brave) e rode generate com --from para continuar.',
        fase,
        erro,
      );
      return { erro: erroEstruturado, mensagem: erroEstruturado.message };
    }
    const erroEstruturado = new ErroGeracao('FASE_FALHOU', `falha na fase ${fase}: ${mensagemDe(erro)}`, fase, erro);
    return { erro: erroEstruturado, mensagem: erroEstruturado.message };
  }

  // ── as fases REAIS ────────────────────────────────────────────────────────

  private async executarFaseReal(run: RunState, fase: FaseId): Promise<RunState | void> {
    switch (fase) {
      case 'F0': return this.faseF0(run);
      case 'F1': return this.faseF1(run);
      case 'F2': return this.faseF2(run);
      case 'F3': return this.faseF3(run);
      case 'F4': return this.faseF4(run);
      case 'F5': return this.faseF5(run);
      case 'F6': return this.faseF6(run);
      case 'F7': return this.faseF7(run);
      case 'F8': return this.faseF8(run);
      case 'F9': return this.faseF9(run);
      case 'F10': return this.faseF10(run);
      case 'F11': return this.faseF11(run);
      case 'F12': return this.faseF12(run);
      default:
        throw new ErroGeracao('FASE_INVALIDA', `fase não implementada: ${fase}`, fase);
    }
  }

  /** F0 — brief + máquina nocional (G-SCHEMA: lint preflight + validarBrief). */
  private async faseF0(_run: RunState): Promise<void> {
    // Preflight G-SCHEMA: lint de ordem/opcionais sobre o registro REAL (P-33
    // incluso) — falha de build vira barreira, nunca silêncio.
    const lint = lintSchemasDaEngine(SCHEMA_REGISTRY);
    if (lint.ordem.length > 0 || lint.camposOpcionais.length > 0) {
      throw new ErroGeracao(
        'BARREIRA_G_SCHEMA',
        `lint de schemas da engine falhou (${lint.ordem.length} inversão(ões) de ordem, ` +
          `${lint.camposOpcionais.length} campo(s) opcional(is)) — rode 'npm run engine -- lint-schemas' para o detalhe.`,
      );
    }
    garantirSchemasValidos(SCHEMA_REGISTRY); // forma fail-closed (lança listando tudo)

    // Closure BOUND: as fases recebem `callLlm` como função (gerarBrief chama
    // `input.callLlm(...)`), então um método não-bound perderia o `this` do
    // transporte (fake de classe quebra; produção não chama `this`).
    const callLlm: EngineLlm['callLlm'] = (etapa, req) => this.deps.llm.callLlm(etapa, req);
    const { brief } = await gerarBrief({
      callLlm,
      assunto: this.comandos.assunto,
      linguagem: this.comandos.linguagem,
      plataforma: this.comandos.plataforma,
    });
    const { maquina } = await gerarNotionalMachine({
      callLlm,
      linguagem: this.comandos.linguagem,
      plataforma: this.comandos.plataforma,
    });
    await this.gravarArtefato(ARTEFATO_BRIEF, brief);
    await this.gravarArtefato(ARTEFATO_NOTIONAL, maquina);
  }

  /** F1 — pesquisa profunda (G-COVER-PESQ). */
  private async faseF1(_run: RunState): Promise<void> {
    const busca: Busca | undefined =
      this.deps.busca ??
      (this.deps.multi
        ? criarBuscaPlanejada({
            llm: this.deps.llm,
            multi: this.deps.multi,
            stageVersion: (this.deps.f1Config?.stageVersion ?? f1ConfigDefault().stageVersion),
            timeoutMs: this.deps.f1Config?.timeoutMs ?? f1ConfigDefault().timeoutMs,
          })
        : undefined);
    if (busca === undefined) {
      throw new ErroGeracao(
        'F1_BUSCA_NAO_FIADA',
        'a fase F1 exige a busca INJETADA (deps.busca) ou o executor de multi-busca (deps.multi) — ' +
          'nenhum dos dois foi fio nesta execução; a pesquisa é declarada como NÃO operada.',
      );
    }
    const brief = await this.lerArtefato<Brief>(ARTEFATO_BRIEF);
    const config: F1Config = { ...f1ConfigDefault(), ...this.deps.f1Config };
    const fase = criarF1Research({ busca, config });
    const artefato = await fase.executar({
      tema: brief.tema,
      // Sub-assuntos determinísticos: o tema + as construções candidatas do F0.
      subtopicos: [...new Set([brief.tema, ...brief.construcoes_alvo])].slice(0, 4),
    });
    if (!artefato.gCoverPesqAprovado) {
      throw new ErroGeracao(
        'G_COVER_PESQ_NAO_APROVADO',
        `G-COVER-PESQ reprovou: ${artefato.cobertura.filter((c) => !c.comFonte).map((c) => c.subTopicoId).join(', ') || 'sem subtópico com fonte'}`,
      );
    }
    if (artefato.limitacoes.length > 0) {
      this.limitacoes.push(...artefato.limitacoes.map((l) => `F1: ${l}`));
    }
    await this.gravarArtefato(ARTEFATO_F1, artefato);
  }

  /** F2 — decomposição atômica (G-ATOM: nós não-vazios). */
  private async faseF2(_run: RunState): Promise<void> {
    const brief = await this.lerArtefato<Brief>(ARTEFATO_BRIEF);
    const familia: FamiliaAssunto = this.comandos.familia ?? 'sintaxe';
    const resultado = await decomporAssunto(
      { llm: this.deps.llm },
      familia,
      brief.tema,
    );
    if (resultado.nos.length === 0) {
      throw new ErroGeracao('G_ATOM_VAZIO', 'a decomposição atômica não devolveu NENHUM nó — G-ATOM reprovou');
    }
    await this.gravarArtefato(ARTEFATO_NOS, resultado.nos);
  }

  private axiomaDaTrilha(): { entryConstructs: ConceptId[]; seedsReceptivos: ConceptId[] } {
    // Axioma GRAPH-LEVEL: ids de conceito (snake_case). Default [] — o harness
    // NÃO vira conceito do grafo; ele entra nas PERMITIDAS de F8/F9 e no
    // budget_teste dos dossiês (política de harness, ver os dois usos).
    const entry = (this.deps.entryConstructs ?? []).map((id) => conceptId(id));
    const seeds = (this.deps.seedsReceptivos ?? []).map((id) => conceptId(id));
    return { entryConstructs: entry, seedsReceptivos: seeds };
  }

  /** F3 — grafo de pré-requisitos (G-DAG/G-TYPE/I1-I11). */
  private async faseF3(_run: RunState): Promise<void> {
    const nos = await this.lerArtefato<NoAtomico[]>(ARTEFATO_NOS);
    const plano = planoDeAulasDosNos(nos);
    const { entryConstructs, seedsReceptivos } = this.axiomaDaTrilha();
    const juiz: JuizDeAresta = this.deps.juizArestas ?? criarJuizDeArestaLlm(this.deps.llm);
    const resultado = await rodarF3({
      nos,
      candidatos: [],
      planoDeAulas: plano,
      entryConstructs,
      seedsReceptivos,
      juiz,
      semaforo: this.deps.semaforoJulgamento,
    });
    this.barreirasF3(resultado);
    await this.gravarArtefato(ARTEFATO_F3, {
      grafo: resultado.grafo,
      confirmadas: resultado.confirmadas,
      rejeitadas: resultado.rejeitadas,
      justificativas: resultado.justificativas,
      roles: resultado.roles,
      ordem: resultado.ordem,
      violacoes: resultado.violacoes,
      budget: resultado.budget ?? null,
      falhaDerivacaoBudget: resultado.falhaDerivacaoBudget,
    });
  }

  private barreirasF3(resultado: ResultadoF3): void {
    if (!resultado.ordem.ok) {
      const ciclo = Array.isArray((resultado.ordem as { ciclo?: ConceptId[] }).ciclo)
        ? `: ${(resultado.ordem as { ciclo: ConceptId[] }).ciclo.join(' → ')}`
        : '';
      throw new ErroGeracao(
        'VIOLACAO_DE_GRAFO',
        `G-DAG reprovou: o grafo não é um DAG (${resultado.ordem.falha}${ciclo})`,
      );
    }
    if (resultado.violacoes.length > 0) {
      throw new ErroGeracao(
        'VIOLACAO_DE_GRAFO',
        `invariantes I1–I11 violadas (${resultado.violacoes.length}): ` +
          resultado.violacoes.slice(0, 5).map((v) => v.invariante).join(', '),
      );
    }
    if (resultado.budget === null) {
      throw new ErroGeracao(
        'VIOLACAO_DE_GRAFO',
        `a derivação de orçamento da F3 falhou: ${resultado.falhaDerivacaoBudget?.mensagem ?? 'motivo desconhecido'}`,
      );
    }
  }

  /** F4 — orçamento cumulativo (G-MONO) + materialização (sempre em disco). */
  private async faseF4(_run: RunState): Promise<void> {
    const nos = await this.lerArtefato<NoAtomico[]>(ARTEFATO_NOS);
    const f3 = await this.lerArtefato<{ grafo: ConceptGraph }>(ARTEFATO_F3);
    const { entryConstructs, seedsReceptivos } = this.axiomaDaTrilha();
    const derive: ResultadoF4 = deriveBudgetDoGrafo({
      grafo: f3.grafo,
      aulas: planoDeAulasDosNos(nos),
      entryConstructs,
      seedsReceptivos,
    });
    const violacoesGMonotonicidade = checarGMonotonicidade(derive.budget);
    if (!orcamentoMonotonico(derive.budget)) {
      throw new ErroGeracao(
        'G_MONO_NAO_CUMPRIDO',
        `G-MONO reprovou (${violacoesGMonotonicidade.length} violação(ões)) — o orçamento derivado não é monótono`,
      );
    }
    await materializarBudget(this.dir(), derive.budget); // budget.generated.json
    await this.gravarArtefato(ARTEFATO_F4, {
      budget: derive.budget,
      topo: derive.topo,
      violacoesGMonotonicidade,
    });
  }

  /** F5 — FREEZE (ponto de não retorno) + hashes REAIS no run.json. */
  private async faseF5(run: RunState): Promise<RunState> {
    const f4 = await this.lerArtefato<{ budget: BudgetF4 }>(ARTEFATO_F4);
    const f3 = await this.lerArtefato<{ grafo: ConceptGraph }>(ARTEFATO_F3);
    const freeze = await congelar(this.dir(), { orcamento: f4.budget, grafo: f3.grafo });
    await this.gravarArtefato(ARTEFATO_F5, freeze);
    // ATUALIZA os placeholders de hash do run pelos hashes REAIS do freeze e
    // DEVOLVE o run novo — a máquina adota este estado no concluirFase (senão
    // o salvarRun seguinte sobrescreveria os hashes reais pelos placeholders).
    const comHashes: RunState = {
      ...run,
      budgetHash: hashDoOrcamento(f4.budget),
      graphHash: hashDoGrafo(f3.grafo),
    };
    await salvarRun(this.dir(), comHashes);
    return comHashes;
  }

  /** F6 — piloto (3 aulas) + PORTÃO humano (lerAprovacaoF6). */
  private async faseF6(_run: RunState): Promise<void> {
    const freeze = await this.lerArtefato<Freeze>(ARTEFATO_F5);
    const f4 = await this.lerArtefato<{ budget: BudgetF4 }>(ARTEFATO_F4);
    const nos = await this.lerArtefato<NoAtomico[]>(ARTEFATO_NOS);
    const brief = await this.lerArtefato<Brief>(ARTEFATO_BRIEF);

    const jaAprovado = (await this.lerAprovacaoF6()).aprovado;
    if (!jaAprovado) {
      // Primeira passagem: autorar o piloto e PARAR para o humano revisar.
      const dossies = construirDossiesDeAula({ freeze, budget: f4.budget, nos, brief });
      const piloto = selecionarPiloto(dossies, f4.budget);
      await this.autorarOnda(piloto, 'F6-piloto');
      this.emitir('piloto autorado — portao humano aberto (aguardando aprovacaoF6.json)');
      const aprovacao = await this.lerAprovacaoF6();
      if (!aprovacao.aprovado) {
        throw new ErroGeracao(
          'F6_NAO_APROVADO',
          aprovacao.parecer
            ? `o piloto (${piloto.map((p) => p.aula_slug).join(', ')}) não foi aprovado: ${aprovacao.parecer}`
            : `o piloto (${piloto.map((p) => p.aula_slug).join(', ')}) NÃO foi aprovado. Escreva ${ARQUIVO_APROVACAO_F6} ` +
              `com {aprovado:true} e retome com --from F6 para liberar a autoria completa.`,
        );
      }
      this.emitir('piloto APROVADO pelo portão humano');
    } else {
      // Retomada da F6 com o marker já aprovado: o piloto não é re-autorado.
      this.emitir('portão F6 já aprovado — piloto preservado, autoria liberada');
    }
  }

  /** F7 — autoria completa (F7+F8 interno §4.3) em ondas de ≤15. */
  private async faseF7(_run: RunState): Promise<void> {
    const freeze = await this.lerArtefato<Freeze>(ARTEFATO_F5);
    const f4 = await this.lerArtefato<{ budget: BudgetF4 }>(ARTEFATO_F4);
    const nos = await this.lerArtefato<NoAtomico[]>(ARTEFATO_NOS);
    const brief = await this.lerArtefato<Brief>(ARTEFATO_BRIEF);
    let dossies = construirDossiesDeAula({ freeze, budget: f4.budget, nos, brief });
    if (this.comandos.only) {
      dossies = dossies.filter((d) => this.matchesOnly(d.aula_slug));
    }
    if (dossies.length === 0) {
      throw new ErroGeracao('AUTORIA_FALHOU', `--only ${this.comandos.only} não casa nenhuma aula do freeze`);
    }
    await this.autorarOnda(dossies, 'F7');
  }

  private matchesOnly(ref: string): boolean {
    const only = this.comandos.only ?? '';
    return ref === only || ref.endsWith(`/${only}`);
  }

  /** Autorar UMA onda (usada pela F6 e pela F7) + barreiras blocked/falhou. */
  private async autorarOnda(dossies: readonly DossieDeAula[], origem: string): Promise<void> {
    // O diretório dos drafts (posse por aula — §4.1) é criado ANTES da onda:
    // o executor da onda grava `drafts/<ref>.lesson-draft.json` etc.
    await fsp.mkdir(path.join(this.dir(), 'drafts'), { recursive: true });
    const limiters = this.deps.limiters ?? criarLimitersDefault(this.deps.semaforoOnda);
    const depsOnda: DepsDaOndaAutoria = {
      llm: this.deps.llm,
      prover: this.deps.prover,
      limiters,
      escreverArquivo: escreverArquivoPadrao,
      baseDir: this.dir(),
    };
    const resultado = await runOndaDeAutoria(depsOnda, [...dossies]);
    const blocked = resultado.estados.find((e) => e.status === 'blocked');
    if (blocked) {
      throw new ErroGeracao(
        'AUTORIA_BLOQUEADA',
        `autor(a) da aula ${blocked.aula_slug} devolveu BLOCKED (§7.1 R3 — defeito do grafo, não licença): ` +
          `faltantes [${(blocked.faltantes ?? []).join(', ')}] — ${blocked.motivo ?? 'sem motivo'}`,
      );
    }
    const falhou = resultado.estados.find((e) => e.status === 'falhou');
    if (falhou) {
      throw new ErroGeracao(
        'AUTORIA_FALHOU',
        `autoria da aula ${falhou.aula_slug} falhou (${origem}): ${falhou.erro ?? 'sem erro'}`,
      );
    }
    this.emitir(`${origem}: ${resultado.estados.length} aula(s), ${resultado.ondas} onda(s)`);
  }

  /** Lê os drafts de aula+desafio de UMA aula (com validação de schema). */
  private async lerDraftsDaAula(ref: string): Promise<{ aula: unknown; desafio: SaidaDesafio }> {
    const ler = async (relativo: string): Promise<string> => {
      const caminho = path.join(this.dir(), relativo);
      try {
        return await fsp.readFile(caminho, 'utf8');
      } catch (erro) {
        throw new ErroGeracao('DRAFTS_INVALIDOS', `draft ausente para ${ref} (${relativo}): ${mensagemDe(erro)}`);
      }
    };
    const rawAula = JSON.parse(await ler(caminhoDraftAula(ref))) as unknown;
    const rawDesafio = JSON.parse(await ler(caminhoDraftDesafio(ref))) as unknown;
    const aulaOk = LessonDraftSchema.safeParse(rawAula);
    if (!aulaOk.success) {
      throw new ErroGeracao('DRAFTS_INVALIDOS', `draft de aula ${ref} viola o LessonDraftSchema: ${aulaOk.error.message}`);
    }
    const desafioOk = ChallengeDraftSchema.safeParse(rawDesafio);
    if (!desafioOk.success) {
      throw new ErroGeracao('DRAFTS_INVALIDOS', `draft de desafio ${ref} viola o ChallengeDraftSchema: ${desafioOk.error.message}`);
    }
    return { aula: aulaOk.data, desafio: desafioOk.data as SaidaDesafio };
  }

  /** F8 — verificação ESTRUTURAL dos drafts escritos (schema + orçamento). */
  private async faseF8(_run: RunState): Promise<void> {
    const freeze = await this.lerArtefato<Freeze>(ARTEFATO_F5);
    const refs = this.refsComFiltroOnly(freeze);
    for (const ref of refs) {
      const { desafio } = await this.lerDraftsDaAula(ref); // lança DRAFTS_INVALIDOS
      const { uniao, produtivas } = await this.permitidasDaAula(ref);
      // Nova assinatura do gate (§3.3): as três FAIXAS recebem a MESMA base
      // disponível na fiação (a união — a autoria F8 já validou cada superfície
      // contra a faixa PRÓPRIA do dossiê; aqui a verificação estrutural usa a
      // base do F2) e o terceiro argumento carrega as produtivas (A6 não entra
      // no veredito desta fase — quem decide é o prover/provas).
      const orcamento = ofensasDeOrcamentoDoDesafio(desafio, { receptivo: uniao, produtivo: uniao, teste: uniao }, produtivas);
      if (orcamento.falhaDeParse !== null) {
        throw new ErroGeracao('DRAFTS_INVALIDOS', `desafio ${ref} não parseia (${orcamento.falhaDeParse.campo}): ${orcamento.falhaDeParse.mensagem}`);
      }
      if (orcamento.ofensas.length > 0) {
        throw new ErroGeracao(
          'DRAFTS_INVALIDOS',
          `desafio ${ref} usa construções fora do orçamento: ${orcamento.ofensas.map((o) => o.construcao).join(', ')}`,
        );
      }
    }
  }

  /** F9 — provas de execução (G-TEST, via deps.prover) sobre todos os drafts. */
  private async faseF9(_run: RunState): Promise<void> {
    const verificacao = await this.verificarDesafiosF9();
    await this.gravarArtefato(ARTEFATO_F9, verificacao);
    if (!verificacao.ok) {
      throw new ErroGeracao(
        'VERIFICACAO_FALHOU',
        `F9 reprovou em ${verificacao.falhas.length} desafio(s). As provas determinísticas (G-BUDGET/G-TEST) ` +
          'falharam sobre os drafts escritos — a autoria deve ser corrigida ou a fase reexecutada. ' +
          `Primeiras falhas: ${verificacao.falhas.slice(0, 3).join(' | ')}`,
      );
    }
  }

  /** Re-verificação da F11 (pós-laço) — o MESMO código da F9, só os itens. */
  private async faseF11(_run: RunState): Promise<void> {
    const verificacao = await this.verificarDesafiosF9();
    await this.gravarArtefato('f11-reverificacao.json', verificacao);
    if (!verificacao.ok) {
      throw new ErroGeracao(
        'VERIFICACAO_FALHOU',
        `re-verificação pós-revisão (F11) reprovou em ${verificacao.falhas.length} desafio(s): ` +
          verificacao.falhas.slice(0, 3).join(' | '),
      );
    }
  }

  private refsComFiltroOnly(freeze: Freeze): string[] {
    const refs = freeze.snapshots.map((s) => s.aula_slug);
    return this.comandos.only ? refs.filter((r) => this.matchesOnly(r)) : refs;
  }

  /**
   * A base de construções permitidas de UMA aula — a MESMA base da autoria:
   * a UNIÃO (harness receptivo + introduces receptive/productive). Também
   * devolve as PRODUTIVAS introduzidas (para o argumento A6 do gate §3.3 do
   * desafio — a fiação F9/F11 decide por veredito/provas, não pelo A6).
   */
  private async permitidasDaAula(ref: string): Promise<{ uniao: ReadonlySet<string>; produtivas: ReadonlySet<string> }> {
    const nos = await this.lerArtefato<NoAtomico[]>(ARTEFATO_NOS);
    const no = nos.find((n) => `m1/${n.chave_conceito}` === ref);
    const uniao = new Set<string>(atomosDeHarnessReceptivo());
    const produtivas = new Set<string>();
    if (no) {
      for (const item of [...(no.introduces.receptive ?? []), ...(no.introduces.productive ?? [])]) uniao.add(item);
      for (const item of no.introduces.productive ?? []) produtivas.add(item);
    }
    return { uniao, produtivas };
  }

  /** Roda as provas + orçamento sobre os drafts (F9/F11 compartilham). */
  private async verificarDesafiosF9(): Promise<{ ok: boolean; desafios: number; refs: FaseF9Ref[]; falhas: string[] }> {
    const freeze = await this.lerArtefato<Freeze>(ARTEFATO_F5);
    const refs = this.refsComFiltroOnly(freeze);
    return verificarRefsEmParalelo({
      refs,
      semaforo: this.semaforoVerificacao,
      verificarUma: async (ref) => {
        const { desafio } = await this.lerDraftsDaAula(ref);
        const veredito = await this.deps.prover(montarInputDasProvas(desafio));
        const { uniao, produtivas } = await this.permitidasDaAula(ref);
        // Nova assinatura do gate (§3.3) — as três faixas com a MESMA base da
        // fiação (união) e as produtivas no argumento A6 (não entra no veredito).
        const orcamento = ofensasDeOrcamentoDoDesafio(desafio, { receptivo: uniao, produtivo: uniao, teste: uniao }, produtivas);
        const falhaParse = orcamento.falhaDeParse !== null ? `${orcamento.falhaDeParse.campo}: ${orcamento.falhaDeParse.mensagem}` : null;
        const ofensas = orcamento.ofensas.map((o) => o.construcao);
        const ok =
          veredito.valid &&
          falhaParse === null &&
          ofensas.length === 0;
        return {
          ref,
          provas: {
            valid: veredito.valid,
            falhas: veredito.failures.map((f) => `${f.proof}${f.reason !== undefined ? `: ${f.reason}` : ''}`),
          },
          ofensasOrcamento: ofensas,
          falhaDeParse: falhaParse,
          ok,
        };
      },
    });
  }

  /**
   * F10 — laço de revisão (INJETADO; ausente → limitação DECLARADA).
   *
   * ONDA 5 (fiação): quando `deps.revisao` está presente, o laço roda sobre
   * os DRAFTS recém-autorados da onda (`ArtefatosDaRevisao.aulas`). O
   * chamador pode injetar o próprio `RevisaoInjetada` OU usar o bridge
   * `criarRevisaoDaFiacao(...)` (abaixo) — que monta o `ContextoDoLaco` do
   * laço REAL `rodarLacoDeRevisao` com as deps padrão da fiação (prover,
   * snapshot de orçamento por ref a partir do F2 + harness, verificadores
   * JSON-aware dos drafts). SEM `revisao`, o fluxo atual permanece
   * byte-idêntico: limitação DECLARADA na saída (§9.2 — nunca omitida).
   */
  private async faseF10(_run: RunState): Promise<void> {
    if (!this.deps.revisao) {
      this.limitacoes.push(
        'F10: laço de revisão NÃO operado — deps.revisao ausente (a fiação oferece o bridge ' +
          'criarRevisaoDaFiacao (fiacao/geraTrilha.ts) que roda o rodarLacoDeRevisao REAL de ' +
          'review/loop.ts sobre os drafts da onda; sem o dep, a limitação é declarada e a máquina segue).',
      );
      await this.anexarEvento({
        tipo: 'checkpoint',
        runId: this.runId,
        descricao: 'revisao_nao_fiada — F10 não operada (deps.revisao ausente); limitação declarada na saída',
      });
      return;
    }
    const freeze = await this.lerArtefato<Freeze>(ARTEFATO_F5);
    const f4 = await this.lerArtefato<{ budget: BudgetF4 }>(ARTEFATO_F4);
    const aulas = [];
    for (const snap of freeze.snapshots) {
      const { aula, desafio } = await this.lerDraftsDaAula(snap.aula_slug);
      aulas.push({ ref: snap.aula_slug, aula, desafio });
    }
    const rodadasMaximas = this.deps.revisao.rodadasMaximas ?? 1;
    const resultado = await this.deps.revisao.rodar(
      { dir: this.dir(), freeze, budget: f4.budget, aulas },
      { rodadasMaximas },
    );
    await this.anexarEvento({
      tipo: 'checkpoint',
      runId: this.runId,
      descricao: `revisao_concluida: ${resultado.rodadas} rodada(s) (teto ${rodadasMaximas})`,
    });
    this.emitir(`laço de revisão: ${resultado.rodadas} rodada(s)`);
  }

  /** F12 — integrador único (materializarTrilha) + G-FINAL. */
  private async faseF12(_run: RunState): Promise<void> {
    const brief = await this.lerArtefato<Brief>(ARTEFATO_BRIEF);
    const freeze = await this.lerArtefato<Freeze>(ARTEFATO_F5);
    const f4 = await this.lerArtefato<{ budget: BudgetF4 }>(ARTEFATO_F4);

    const modulos: DossieDeTrilha['modulos'] = [];
    const modulosVistos = new Map<string, number>();
    const aulas: DossieDeTrilha['aulas'] = [];
    const desafios: DesafioDoDossie[] = [];
    for (const aula of f4.budget.aulas) {
      const barra = aula.ref.indexOf('/');
      const moduloSlug = barra === -1 ? aula.ref : aula.ref.slice(0, barra);
      if (!modulosVistos.has(moduloSlug)) {
        const ordem = modulosVistos.size + 1;
        modulosVistos.set(moduloSlug, ordem);
        modulos.push({ slug: moduloSlug, title: humanizarId(moduloSlug), order: ordem });
      }
      const { aula: draftAula, desafio: draftDesafio } = await this.lerDraftsDaAula(aula.ref);
      aulas.push({ modulo: moduloSlug, draft: draftAula as DossieDeTrilha['aulas'][number]['draft'] });
      desafios.push({ ref: aula.ref, draft: draftDesafio });
    }

    const dossie: DossieDeTrilha = {
      slug: this.comandos.slug,
      title: brief.tema,
      description: brief.objetivo_geral,
      language: 'pt-BR',
      domain: 'programming',
      entryCriteria: brief.criterios_de_entrada,
      modulos,
      aulas,
      desafios,
      orcamento: f4.budget,
    };

    const depsMat: DepsMaterializar = this.deps.gFinalDeps ?? {};
    const materializacao: ResultadoMaterializacao = await materializarTrilha(depsMat, dossie, this.dirProduto());
    const gRes: ResultadoGFinal = await gFinal(depsMat, this.dirProduto());
    this.gFinalResultado = gRes;

    await this.gravarArtefato(ARTEFATO_REPORT, {
      materializacao,
      gFinal: gRes,
      limitacoes: this.limitacoes,
    });

    this.emitir(`F12 materializou ${materializacao.arquivos} arquivo(s) em ${materializacao.destino}`);
    if (!gRes.ok) {
      const partes: string[] = [];
      if (!gRes.load.ok) partes.push(`load: ${gRes.load.issues.slice(0, 3).join('; ')}`);
      if (!gRes.provas.ok) partes.push(`provas: ${gRes.provas.falhas.slice(0, 3).join('; ')}`);
      if (!gRes.audit.ok) partes.push(`audit: ${gRes.audit.violacoes.slice(0, 3).join('; ')}`);
      throw new ErroGeracao('GFINAL_FALHOU', `G-FINAL reprovou sobre a trilha materializada: ${partes.join(' | ') || 'sem detalhe'}`);
    }
  }
}

function humanizarId(id: string): string {
  const palavra = id.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (palavra === '') return id;
  return palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

/**
 * O NÚCLEO PARALELO da verificação F9/F11 (onda 5 — paralelização máxima):
 * verifica N refs em MAP PARALELO com o semáforo SEM_EXEC (`verificarUma`
 * roda `prover` + orçamento por ref, INDEPENDENTE — a verificação é
 * READ-ONLY sobre os drafts, sem corrida de escrita). O RELATÓRIO sai na
 * ORDEM ESTÁVEL dos refs — reordenado pelo índice após o `Promise.all`
 * (nunca pela ordem de conclusão), byte-idêntico ao serial. Exportado para
 * a suíte (e reutilizável por qualquer chamador que queira o mesmo padrão).
 *
 * Fail-closed: se `verificarUma(ref)` LANÇA (ex.: draft ausente/inválido —
 * DRAFTS_INVALIDOS), a promise do ref rejeita e o `Promise.all` propaga —
 * a fase aborta com checkpoint, como no fluxo serial. Veredito INVÁLIDO
 * (provas/orçamento reprovados) NÃO lança: entra no relatório como falha.
 */
export async function verificarRefsEmParalelo(opts: {
  refs: readonly string[];
  semaforo: Semaphore;
  verificarUma: (ref: string) => Promise<FaseF9Ref>;
}): Promise<{ ok: boolean; desafios: number; refs: FaseF9Ref[]; falhas: string[] }> {
  const porRef = new Map<string, FaseF9Ref>();
  await Promise.all(
    opts.refs.map(async (ref) => {
      const release = await opts.semaforo.acquire();
      try {
        porRef.set(ref, await opts.verificarUma(ref));
      } finally {
        release();
      }
    }),
  );
  // ORDEM ESTÁVEL: o relatório segue a ordem dos refs de entrada, nunca a
  // ordem de conclusão das promises — resultado idêntico ao serial.
  const resultados = opts.refs.map((ref) => {
    const resultado = porRef.get(ref);
    if (resultado === undefined) {
      throw new ErroGeracao(
        'VERIFICACAO_FALHOU',
        `ref ${ref} sem resultado na verificação paralela (verificarUma não resolveu)`,
      );
    }
    return resultado;
  });
  const falhas = resultados
    .filter((r) => !r.ok)
    .map(
      (r) =>
        `${r.ref}: provas [${r.provas.falhas.join('; ')}] orçamento [${r.ofensasOrcamento.join(', ')}] parse [${r.falhaDeParse ?? '-'}]`,
    );
  return { ok: falhas.length === 0, desafios: opts.refs.length, refs: resultados, falhas };
}

// ---------------------------------------------------------------------------
// O bridge da F10 (onda 5 — paralelização máxima): o laço REAL sobre os drafts
// ---------------------------------------------------------------------------

/** Default de rodadas do bridge (o laço clampa em [1, TETO_DE_RODADAS]). */
const RODADAS_DA_REVISAO_DEFAULT = 1;

/** Opções do bridge `criarRevisaoDaFiacao` — o que só o chamador sabe. */
export interface OpcoesDeRevisaoDaFiacao {
  /** transporte LLM dos papéis do laço (REVISOR/PLANEJADOR/CORRETOR) — o chamador cabeia no transporte. */
  llm: { revisar: RevisorLlm; planejar: PlanejadorLlm; corrigir: CorretorLlm };
  modeloAutor: string;
  modeloRevisor: string;
  /** roteamento §6.2 (opcional — sem ele, só a restrição model(AUTOR) ≠ model(REVISOR) é verificada). */
  familias?: MapaDeFamilias;
  /** o provador de desafio — a MESMA assinatura da fiação (`deps.prover`). */
  prover: ProverDeDesafio;
  /** executor endurecido do R5 do filtro (opcional — default: sem execução de reprodução). */
  execDeReproducaoR5?: ExecFn;
  /** rodadas do laço (default 1, teto duro 3 — calculado pelo próprio laço). */
  rodadasMaximas?: number;
  /** SEAM de teste: o laço real por padrão; a suíte injeta spy. */
  rodarLaco?: typeof rodarLacoDeRevisao;
}

/**
 * O bridge PRONTO da F10: devolve um `RevisaoInjetada` que roda o laço REAL
 * `rodarLacoDeRevisao` (`review/loop.ts`) sobre os DRAFTS recém-autorados da
 * onda (`ArtefatosDaRevisao.aulas`). O chamador só provê o que é dele
 * (transporte LLM dos papéis, modelos, prover); a fiação monta o resto do
 * `ContextoDoLaco` com as deps PADRÃO:
 *
 *   - `artefatos` — os drafts (aula + desafio por ref) viram `ArtefatoNoLaco`
 *     (caminho = o caminho relativo do draft no run, conteúdo = o JSON);
 *   - `snapshotDeOrcamento` + `verificadorDeOrcamento` — a MESMA base da
 *     F8/F9 (união harness + introduces do F2 por ref), com um verificador
 *     JSON-aware que decodifica os campos de código do draft ANTES do
 *     `extractAtoms` (o verificador default do laço rodaria `extractAtoms`
 *     sobre o JSON INTEIRO — quebrado; a P-35 resolve isto para o audit, o
 *     bridge resolve para os drafts);
 *   - `verificadorDeProvas` + `proverDesafio` — as quatro provas via o prover
 *     da fiação, decodificando o draft de desafio;
 *   - `trilha` — o slug do run (lido do run.json).
 *
 * SEM `deps.revisao` a fiação NÃO cria isto: a limitação é declarada na saída
 * e a máquina segue (F11 re-verifica) — o fluxo atual permanece byte-idêntico
 * (regressão protegida pelo teste `engineParalelismo.test.ts`).
 */
export function criarRevisaoDaFiacao(opcoes: OpcoesDeRevisaoDaFiacao): RevisaoInjetada {
  const rodarLaco = opcoes.rodarLaco ?? rodarLacoDeRevisao;
  return {
    rodadasMaximas: opcoes.rodadasMaximas,
    async rodar(artefatos, opcoesDoLaço): Promise<{ rodadas: number }> {
      const rodadasMaximas = opcoesDoLaço?.rodadasMaximas ?? opcoes.rodadasMaximas ?? RODADAS_DA_REVISAO_DEFAULT;
      const run = await lerRun(artefatos.dir);
      const nos = await lerNosDoRun(artefatos.dir);
      const snapshot = snapshotDeOrcamentoDosDrafts(artefatos, nos, run.slug);
      const contexto: ContextoDoLaco = {
        trilha: run.slug,
        artefatos: draftsEmArtefatosDoLaco(artefatos),
        snapshotDeOrcamento: snapshot,
        verificadorDeOrcamento: criarVerificadorDeOrcamentoDosDrafts(snapshot),
        verificadorDeProvas: criarVerificadorDeProvasDosDrafts(opcoes.prover),
        proverDesafio: opcoes.prover,
        llm: opcoes.llm,
        modeloAutor: opcoes.modeloAutor,
        modeloRevisor: opcoes.modeloRevisor,
        familias: opcoes.familias,
        execDeReproducaoR5: opcoes.execDeReproducaoR5,
        rodadasMaximas,
      };
      const resultado = await rodarLaco(contexto);
      return { rodadas: resultado.rodadas.length };
    },
  };
}

/** Lê o artefato F2 (`artefatos/nos.json`) do run — a base atômica da F8/F9. */
async function lerNosDoRun(dir: string): Promise<NoAtomico[]> {
  const caminho = path.join(dir, DIR_ARTEFATOS, ARTEFATO_NOS);
  let texto: string;
  try {
    texto = await fsp.readFile(caminho, 'utf8');
  } catch (erro) {
    throw new ErroGeracao(
      'ARTEFATO_AUSENTE',
      `bridge da revisão (criarRevisaoDaFiacao): artefato F2 ausente em ${caminho} — ${mensagemDe(erro)}`,
    );
  }
  try {
    return JSON.parse(texto) as NoAtomico[];
  } catch (erro) {
    throw new ErroGeracao('ARTEFATO_AUSENTE', `bridge da revisão: artefato F2 corrompido: ${mensagemDe(erro)}`);
  }
}

/** Os drafts da onda viram `ArtefatoNoLaco` (aula + desafio por ref). */
function draftsEmArtefatosDoLaco(artefatos: ArtefatosDaRevisao): ArtefatoNoLaco[] {
  const saida: ArtefatoNoLaco[] = [];
  for (const aula of artefatos.aulas) {
    saida.push({
      caminho: caminhoDraftAula(aula.ref),
      nome: 'aula',
      conteudo: JSON.stringify(aula.aula, null, 2),
      ultimaEdicao: -1,
    });
    saida.push({
      caminho: caminhoDraftDesafio(aula.ref),
      nome: 'desafio',
      conteudo: JSON.stringify(aula.desafio, null, 2),
      ultimaEdicao: -1,
    });
  }
  return saida;
}

/** A união (harness + introduces do F2) por ref — a MESMA base da F8/F9. */
function permitidosDaRefPorNos(nos: readonly NoAtomico[], ref: string): { uniao: Set<string>; produtivas: Set<string> } {
  const uniao = new Set<string>(atomosDeHarnessReceptivo());
  const produtivas = new Set<string>();
  const no = nos.find((n) => `m1/${n.chave_conceito}` === ref);
  if (no) {
    for (const item of [...(no.introduces.receptive ?? []), ...(no.introduces.productive ?? [])]) uniao.add(item);
    for (const item of no.introduces.productive ?? []) produtivas.add(item);
  }
  return { uniao, produtivas };
}

/**
 * O snapshot de orçamento do laço sobre os drafts: as três superfícies de
 * código do desafio (solutionCode/starterCode/testsCode) por ref, com a
 * UNIÃO da aula como permitidos (a MESMA base da F9 — a fiação aplica a
 * união às três faixas) e o índice REVERSO construção → aula que a ensina
 * (do F2 — a distinção §5.5 lacuna × ordem). LIMITE DECLARADO: a teoria
 * (markdown) fica fora — é prosa/objeto, não código exigível; a cobertura
 * da teoria é do audit no G-FINAL.
 */
function snapshotDeOrcamentoDosDrafts(artefatos: ArtefatosDaRevisao, nos: readonly NoAtomico[], slug: string): SnapshotDeOrcamento {
  const primeiroEnsina: Record<string, string> = {};
  const surfaces: SurfaceDeOrcamento[] = [];
  for (const aula of artefatos.aulas) {
    const { uniao } = permitidosDaRefPorNos(nos, aula.ref);
    const permitidos = [...uniao];
    const caminho = caminhoDraftDesafio(aula.ref);
    surfaces.push(
      { superficie: 'solutionCode', caminho, faixa: 'productive', permitidos },
      { superficie: 'starterCode', caminho, faixa: 'receptive', permitidos },
      { superficie: 'testsCode', caminho, faixa: 'receptive', permitidos },
    );
    // índice §5.5: a PRIMEIRA aula (ordem da onda/freeze) que introduz cada construção.
    const no = nos.find((n) => `m1/${n.chave_conceito}` === aula.ref);
    if (no) {
      for (const item of [...(no.introduces.receptive ?? []), ...(no.introduces.productive ?? [])]) {
        if (!(item in primeiroEnsina)) primeiroEnsina[item] = aula.ref;
      }
    }
  }
  return { ref: slug, surfaces, primeiroEnsina };
}

/**
 * O verificador de ORÇAMENTO JSON-aware dos drafts (o default do laço é para
 * conteúdo JS puro — sobre o JSON do draft ele quebraria). Decodifica os
 * campos de código do desafio e roda `extractAtoms` sobre o valor; spans no
 * arquivo JSON INTEIRO via a ponte P-35 (`localizarSpanNoArquivo`).
 */
function criarVerificadorDeOrcamentoDosDrafts(snapshot: SnapshotDeOrcamento): VerificadorDeOrcamento {
  // As superfícies de código do desafio — os campos STRING do JSON do draft.
  const CAMPOS_DE_CODIGO: ReadonlySet<string> = new Set(['solutionCode', 'starterCode', 'testsCode']);
  return (artefatos: ReadonlyMap<string, ArtefatoNoLaco>): ViolacaoMecanica[] => {
    const violacoes: ViolacaoMecanica[] = [];
    for (const surface of snapshot.surfaces) {
      if (!CAMPOS_DE_CODIGO.has(surface.superficie)) continue;
      const artefato = artefatos.get(surface.caminho);
      if (artefato === undefined) continue; // superfície ausente — não acusa (gate de presença é da F8; declarado)
      const valores = localizarValoresDeStringNoJson(artefato.conteudo);
      const permitidos = new Set<string>(surface.permitidos);
      for (const valor of valores) {
        if (valor.campo !== surface.superficie) continue;
        const resultado = extractAtoms(valor.decodificado, { fileName: `${surface.caminho}#${surface.superficie}` });
        if (!resultado.ok) continue; // JS quebrado é erro de build (§5.3), não violação — declarado
        for (const ocorrencia of resultado.occurrences) {
          if (permitidos.has(ocorrencia.key)) continue;
          const span = localizarSpanNoArquivo(artefato.conteudo, valores, {
            campo: surface.superficie,
            linha: ocorrencia.line,
            coluna: ocorrencia.column,
            trecho: ocorrencia.snippet,
          });
          violacoes.push({
            caminho: surface.caminho,
            surface: surface.superficie,
            construcao: ocorrencia.key,
            tipo: 'orcamento',
            inicio: span.inicio,
            fim: span.fim,
            linha: ocorrencia.line,
            coluna: ocorrencia.column,
            trechoOfensor: ocorrencia.snippet,
            primeiraAulaQueEnsina: snapshot.primeiroEnsina[ocorrencia.key] ?? null,
            mensagem: `construção ${ocorrencia.key} fora do orçamento ${surface.faixa} da superfície ${surface.superficie} (ref ${snapshot.ref})`,
          });
        }
      }
    }
    return violacoes;
  };
}

/**
 * O verificador de PROVAS JSON-aware: decodifica o draft de desafio
 * (`SaidaDesafio` → `montarInputDasProvas`) e roda o prover da fiação. A
 * superfície da teoria não é executável — só o desafio (limite declarado,
 * o mesmo do laço).
 */
function criarVerificadorDeProvasDosDrafts(prover: ProverDeDesafio): VerificadorDeProvas {
  return async (artefatos: ReadonlyMap<string, ArtefatoNoLaco>): Promise<ViolacaoMecanica[]> => {
    const violacoes: ViolacaoMecanica[] = [];
    for (const artefato of artefatos.values()) {
      if (!artefato.caminho.endsWith('.challenge-draft.json')) continue; // só desafio é executável (declarado)
      let draft: SaidaDesafio;
      try {
        draft = JSON.parse(artefato.conteudo) as SaidaDesafio;
      } catch {
        continue; // JSON quebrado não é violação de provas (o parse é gate da F8 — fail-closed lá)
      }
      const veredito = await prover(montarInputDasProvas(draft));
      if (veredito.valid) continue;
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
          mensagem: `desafio "${artefato.caminho}": ${falha.reason ?? falha.proof}`,
        });
      }
    }
    return violacoes;
  };
}

// ---------------------------------------------------------------------------
// O ponto de entrada público — `gerarTrilha(deps, comandos)`
// ---------------------------------------------------------------------------

/**
 * Roda o MODO GENERATE (F0..F12) com a fiação INJETÁVEL (A-P22-2). Ver o
 * cabeçalho do módulo para as decisões (máquina do runState, artefatos em
 * disco, ledger com runId, teto de tokens, portão F6, seams pós-merge).
 */
export async function gerarTrilha(deps: DepsGeracao, comandos: ComandosGeracao): Promise<ResultadoGeracao> {
  const gerador = new GeradorDeTrilha(deps, comandos);
  return gerador.rodar();
}

// re-export impraticável de tipos usados pelos consumidores
export type { FaseId, RunState };
export { FASES_ORDEM };
export type { NotionalMachine, ArtefatoF1 };
export type { DepsMaterializar };
export type { Busca, ExecutorDeMultiBusca };
export type { Dossier };
export type { EscreverArquivoFn };
export type { EngineLlm, LlmStageError, StageUsage };
export type { Semaphore };
export type { RateLimiters };