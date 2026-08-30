/**
 * app/electron/main/engine/phases/f4Budget.ts — F4 · ORÇAMENTO CUMULATIVO
 * DECLARADO, derivado do GRAFO (pacote P-10, onda 1 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §3.5 (fecho-para-baixo,
 * matriz construção × aula com TRÊS estados) e §4 (F4 ▮ G-MONO).
 *
 * O QUE ESTE ARQUIVO É:
 *   - a derivação do orçamento da ENGINE a partir do GRAFO DE CONCEITOS
 *     (P-08), NÃO da ordem linear de um track carregado (onda 0, budget.ts).
 *     A fonte de ordem é a topo-sort do DAG (`graph/dag.ts::toposort`, com o
 *     critério GRAVADO) — a mesma linearização que a F3 materializou como
 *     artefato; o caller pode passá-la pronta (`ordem` + `criterio`) ou deixar
 *     este módulo derivá-la (determinístico). Derivação ZERO LLM.
 *   - a MATERIALIZAÇÃO da matriz construção × aula com os três estados do
 *     §3.5: `nao_disponivel` (—), `disponivel` (x) e `nova` (new). O terceiro
 *     estado existe porque mudar a FORMA (eixo form:) de algo já ensinado é
 *     evento de currículo com aula própria — a matriz é quem torna essa
 *     distinção visível e verificável.
 *   - o gate G-MONO (barreira da F4): orçamento MONOTÔNICO — nada é
 *     reensinado (nenhuma construção volta de `nova` para `x`, e nenhum `x`
 *     regride a `—`); a aula 0 recebe EXATAMENTE o axioma; toda aula introduz
 *     ao menos uma construção (a matriz tem `new` em toda coluna).
 *   - o hash de CONTEÚDO CANONICALIZADO do orçamento (`hashDoOrcamento`) —
 *     A-P10-2: reordenar chaves do JSON NÃO muda o hash (o par primitivo
 *     sha256Hex/canonicalizarJson vem do `runtime/ledger.ts`, exportado de
 *     propósito para F5/P-10).
 *
 * REUSO DA ONDA 0 (declarado, não silencioso): o algoritmo de CARRY
 * (entrada(N) = saída(N-1); saída(N) = entrada(N) ∪ introduces(N)) e a
 * semântica do axioma/harness vêm de `budget.ts` (`deriveTrackBudget`/
 * `entryAxiom`/`HarnessPolicy`); o que muda é a FONTE DE ORDEM — aqui a
 * topo-sort do DAG (P-08) substitui o `pedagogicalOrder(track)` da onda 0, e
 * o vocabulário é o do GRAFO (ConceptId), não chaves de átomo (AtomKey). A
 * ponte conceito→chave de átomo é da onda que materializa artefatos de
 * produto (P-16, ver `graph/model.ts`); este módulo deriva o orçamento NO
 * NÍVEL DO CONCEITO e registra a política de harness como dado
 * (`politica_de_harness`, shape do BudgetSchema P-04).
 *
 * DISCIPLINA DE ESCRITA (A-P10-3 — "nenhum caminho permite autoria começar
 * antes do freeze"): `materializarBudget` RECUSA escrever quando já existe um
 * `FREEZE.json` no diretório (guarda embutida via `freezeExiste`). A única
 * exceção é o re-congelamento (F5), que é o ÚNICO caminho que escreve o
 * orçamento depois do primeiro freeze — ver cabeçalho de `f5Freeze.ts`
 * (`congelar`). A constante `FREEZE_FILENAME` vive AQUI (e é re-exportada pela
 * F5) para que a guarda de F4 não dependa de f5Freeze — sem ciclo f4↔f5.
 *
 * PURO/DI: derivação 100% em memória; o único IO é `materializarBudget`/
 * `lerOrcamento`, com escrita atômica injetável (testes usam dirs temp e fake
 * de escrita). Sem rede, sem LLM.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { canonicalizarJson, sha256Hex } from '../runtime/ledger';
import { type EscreverArquivoFn, escreverAtomico, lerArquivoOuVazio } from '../runtime/runState';
import { type ConceptGraph, type ConceptId } from '../graph/model';
import { toposort, type CriterioOrdenacao, type ResultadoToposort } from '../graph/dag';
import type { HarnessPolicy } from '../budget';
import { BudgetSchema } from '../schemas/artifacts';

// ---------------------------------------------------------------------------
// Layout de disco e versões (declarados — ver cabeçalho)
// ---------------------------------------------------------------------------

/** Nome do artefato do orçamento materializado (§3.5: SEMPRE em disco). */
export const BUDGET_FILENAME = 'budget.generated.json';

/**
 * Nome do artefato do FREEZE (F5). Declarado AQUI para a guarda A-P10-3 de
 * `materializarBudget` não depender de `f5Freeze` (evita o ciclo f4↔f5);
 * `f5Freeze.ts` o re-exporta — um único dono da constante.
 */
export const FREEZE_FILENAME = 'FREEZE.json';

/** Versão do formato do artefato de orçamento (bump quebra o contrato F5). */
export const BUDGET_VERSION = '1';

// ---------------------------------------------------------------------------
// Erros estruturados (fail-closed — INV-03)
// ---------------------------------------------------------------------------

export type F4ErrorCode =
  | 'GRAFO_INVALIDO' // toposort falhou: ciclo, referência inexistente ou id duplicado
  | 'ORDEM_INVALIDA' // a linearização recebida não é uma topo-sort válida do grafo
  | 'PLANO_INVALIDO' // aula sem introduces, conceito desconhecido ou introduzido 2×
  | 'PREREQUISITO_AUSENTE' // a aula introduz algo cujo fecho-para-baixo não está disponível
  | 'REENSINO_NA_DERIVACAO' // aula introduz conceito já disponível (derivação não gera reensino)
  | 'ARTEFATO_INVALIDO' // orçamento viola o BudgetSchema (P-04)
  | 'ARTEFATO_CORROMPIDO' // hash do conteúdo não bate com o hash declarado
  | 'ORCAMENTO_CONGELADO' // escrita recusada: FREEZE.json já existe (A-P10-3)
  | 'IO_ERRO'; // falha de disco

export class F4Error extends Error {
  readonly code: F4ErrorCode;
  readonly campo?: string;

  constructor(code: F4ErrorCode, mensagem: string, campo?: string) {
    super(mensagem);
    this.name = 'F4Error';
    this.code = code;
    this.campo = campo;
  }
}

// ---------------------------------------------------------------------------
// Tipos do orçamento (shape = BudgetSchema P-04, vocabulário = ConceptId)
// ---------------------------------------------------------------------------

/** Os TRÊS estados da matriz construção × aula (§3.5). */
export type EstadoMatriz = 'nao_disponivel' | 'disponivel' | 'nova';

/** Uma célula da matriz: o estado de UMA construção numa dada aula. */
export interface CelulaMatriz {
  construcao: ConceptId;
  estado: EstadoMatriz;
}

/** As duas faixas do orçamento (invariante: productive ⊆ receptive). */
export interface FaixasF4 {
  receptive: ConceptId[];
  productive: ConceptId[];
}

/** As quatro réguas do §3.6 — parâmetros configuráveis, nunca achados. */
export interface TetosOrcamento {
  construcoes_produtivas_novas: number;
  elementos_interagindo: number;
  elementos_nao_interativos: number;
  tempo_resolucao_s: number;
}

/** Defaults do §3.6 (mesmos valores da tabela normativa). */
export const TETOS_DEFAULT: TetosOrcamento = {
  construcoes_produtivas_novas: 2,
  elementos_interagindo: 4,
  elementos_nao_interativos: 7,
  tempo_resolucao_s: 120,
};

/** O orçamento DE UMA aula — shape exato do objeto interno do BudgetSchema. */
export interface BudgetAula {
  /** `<moduleSlug>/<lessonSlug>` — a chave usada nos relatórios. */
  ref: string;
  /** o axioma de entrada (constante na trilha) — o que o aluno JÁ domina. */
  entryConstructs: ConceptId[];
  /** orçamento do testsCode (§3.3): o que o aluno pode LER antes da aula. */
  budget_entrada: FaixasF4;
  /** orçamento do solutionCode: entrada ∪ introduces. */
  budget_saida: FaixasF4;
  /** o que ESTA aula acrescenta, por faixa. */
  introduces: FaixasF4;
  /** linha da matriz construção × aula (3 estados) — NA ORDEM CANÔNICA das linhas. */
  matrix: CelulaMatriz[];
  /** construções novas desta aula (introduces) — "element_count" do §3.6. */
  element_count: number;
  /** as quatro réguas do §3.6 desta trilha. */
  tetos: TetosOrcamento;
}

/** O orçamento declarado da trilha (F4) — o artefato `budget.generated.json`. */
export interface BudgetF4 {
  aulas: BudgetAula[];
  /** a engine declara `introduces` no plano da F3 — único modo da derivação. */
  fonte: 'declared';
  politica_de_harness: HarnessPolicy;
  /** sha256 do conteúdo canonicalizado SEM o próprio campo hash. */
  hash: string;
}

/** Uma aula do PLANO da F3: o que a aula introduz (conceitos). */
export interface AulaPlano {
  ref: string;
  introduz: ConceptId[];
}

export interface ParametrosF4 {
  grafo: ConceptGraph;
  /**
   * O plano de aulas da F3 (ref + o que introduz). A ORDEM DAS COLUNAS vem do
   * DAG (cada aula entra na posição do menor índice topológico de seus
   * introduces) — a ordem do array não é a fonte de ordem (contrato P-10).
   */
  aulas: AulaPlano[];
  /** o axioma: conceitos já dominados ao entrar (produtivo; ⊆ receptivo). */
  entryConstructs: ConceptId[];
  /** conceitos SÓ-RECEPTIVOS do axioma (ex.: harness conceitual) — default []. */
  seedsReceptivos?: ConceptId[];
  /**
   * Critério de desempate da topo-sort, GRAVADO no resultado. Default:
   * 'ordem-lexicografica-por-id' (igual ao default do dag.ts).
   */
  criterio?: Exclude<CriterioOrdenacao, 'customizado'>;
  /**
   * A linearização já calculada pela F3 (ordem + critério gravado). Se
   * ausente, este módulo deriva via `toposort`. Quando fornecida, é
   * REVALIDADA como topo-sort válida (defesa em profundidade, fail-closed).
   */
  ordem?: ConceptId[];
  /** réguas do §3.6 — default TETOS_DEFAULT. */
  tetos?: TetosOrcamento;
  /** default 'receptive-seed' (igual ao default da onda 0). */
  politicaDeHarness?: HarnessPolicy;
}

export interface TopoResultado {
  /** a linearização usada como fonte de ordem. */
  ordem: ConceptId[];
  /** o critério que a produziu (gravado — contrato do dag.ts). */
  criterio: CriterioOrdenacao;
  /** nós sem nenhuma aresta (reportados pelo dag.ts). */
  orfaos: ConceptId[];
}

/** Resultado da derivação: o artefato + a topo-sort que serviu de ordem. */
export interface ResultadoF4 {
  budget: BudgetF4;
  topo: TopoResultado;
}

// ---------------------------------------------------------------------------
// Hash de conteúdo (A-P10-2) — compartilhado com a F5
// ---------------------------------------------------------------------------

/**
 * sha256 do CONTEÚDO CANONICALIZADO do orçamento, SEM o próprio campo `hash`
 * (o campo é o carimbo — incluí-lo no hash seria auto-referência). Reordenar
 * chaves do JSON NÃO muda o resultado (canonicalizarJson ordena
 * recursivamente) — A-P10-2. F5 usa exatamente esta função para o
 * `budget_hash` do FREEZE.
 */
export function hashDoOrcamento(budget: unknown): string {
  if (typeof budget !== 'object' || budget === null || Array.isArray(budget)) {
    throw new F4Error('ARTEFATO_INVALIDO', 'hashDoOrcamento espera o objeto do orçamento');
  }
  const semHash = { ...(budget as Record<string, unknown>) };
  delete semHash['hash'];
  return sha256Hex(canonicalizarJson(semHash));
}

// ---------------------------------------------------------------------------
// Derivação — PURO, zero LLM, fail-closed
// ---------------------------------------------------------------------------

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** fecho-para-baixo (ancestrais ESTRITOS via desbloqueado_por) de um conjunto. */
function fechoParaBaixo(grafo: ConceptGraph, alvos: ConceptId[]): ConceptId[] {
  const pais = new Map<ConceptId, ConceptId[]>();
  for (const c of grafo.conceitos) {
    for (const pre of c.desbloqueadoPor) {
      const lista = pais.get(c.id) ?? [];
      lista.push(pre);
      pais.set(c.id, lista);
    }
  }
  const visto = new Set<ConceptId>();
  const pilha = [...alvos];
  while (pilha.length > 0) {
    const atual = pilha.pop() as ConceptId;
    for (const pre of pais.get(atual) ?? []) {
      if (visto.has(pre)) continue;
      visto.add(pre);
      pilha.push(pre);
    }
  }
  return [...visto].sort();
}

/** reordena as aulas pela topo-sort (FONTE DE ORDEM = DAG) com desempate por ref. */
function ordenarAulasPeloDag(ordem: ConceptId[], aulas: AulaPlano[]): AulaPlano[] {
  const pos = new Map(ordem.map((id, i) => [id, i]));
  return [...aulas].sort((a, b) => {
    const pa = Math.min(...a.introduz.map((c) => pos.get(c) ?? Number.MAX_SAFE_INTEGER));
    const pb = Math.min(...b.introduz.map((c) => pos.get(c) ?? Number.MAX_SAFE_INTEGER));
    if (pa !== pb) return pa - pb;
    return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  });
}

/** valida que `ordem` é uma topo-sort VÁLIDA do grafo (permutação + arestas). */
function validarOrdem(grafo: ConceptGraph, ordem: ConceptId[]): void {
  const ids = new Set(grafo.conceitos.map((c) => c.id));
  const vistos = new Set<ConceptId>();
  if (ordem.length !== grafo.conceitos.length) {
    throw new F4Error(
      'ORDEM_INVALIDA',
      `a linearização tem ${ordem.length} ids para ${grafo.conceitos.length} conceitos`,
    );
  }
  for (const id of ordem) {
    if (!ids.has(id)) throw new F4Error('ORDEM_INVALIDA', `a linearização referencia conceito inexistente: ${id}`);
    if (vistos.has(id)) throw new F4Error('ORDEM_INVALIDA', `a linearização repete o conceito: ${id}`);
    vistos.add(id);
  }
  const pos = new Map(ordem.map((id, i) => [id, i]));
  for (const c of grafo.conceitos) {
    for (const pre of c.desbloqueadoPor) {
      if ((pos.get(pre) ?? -1) >= (pos.get(c.id) ?? -1)) {
        throw new F4Error(
          'ORDEM_INVALIDA',
          `a linearização viola a aresta dura ${pre} → ${c.id} (${pre} precisa vir antes)`,
        );
      }
    }
  }
}

/** converte falha de toposort em F4Error estruturado (ciclo COM caminho). */
function topoOuErro(
  grafo: ConceptGraph,
  criterio: Exclude<CriterioOrdenacao, 'customizado'>,
): Extract<ResultadoToposort, { ok: true }> {
  const resultado = toposort(grafo, { criterio });
  if (resultado.ok) return resultado;
  if (resultado.falha === 'ciclo') {
    throw new F4Error(
      'GRAFO_INVALIDO',
      `o grafo não é um DAG: ciclo ${resultado.ciclo.join(' → ')} (${resultado.ciclo.length - 1} arestas)`,
    );
  }
  if (resultado.falha === 'referencia-inexistente') {
    throw new F4Error('GRAFO_INVALIDO', `desbloqueado_por referencia conceito inexistente: ${resultado.refs.join(', ')}`);
  }
  throw new F4Error('GRAFO_INVALIDO', `ids duplicados em conceitos: ${resultado.ids.join(', ')}`);
}

/** valida o plano contra o grafo (conceitos existem, unicidade, aulas não vazias). */
function validarPlano(grafo: ConceptGraph, aulas: AulaPlano[]): void {
  const ids = new Set(grafo.conceitos.map((c) => c.id));
  if (aulas.length === 0) {
    throw new F4Error('PLANO_INVALIDO', 'o plano não tem nenhuma aula — orçamento vazio');
  }
  const origem = new Map<ConceptId, string>();
  for (const aula of aulas) {
    if (aula.ref.trim() === '') throw new F4Error('PLANO_INVALIDO', 'aula com ref vazia');
    if (aula.introduz.length === 0) {
      throw new F4Error('PLANO_INVALIDO', `aula '${aula.ref}' não introduz NENHUMA construção (G-MONO: toda aula introduz ≥1)`);
    }
    for (const c of aula.introduz) {
      if (!ids.has(c)) {
        throw new F4Error('PLANO_INVALIDO', `aula '${aula.ref}' introduz conceito desconhecido do grafo: ${c}`);
      }
      const anterior = origem.get(c);
      if (anterior !== undefined) {
        throw new F4Error(
          'PLANO_INVALIDO',
          `'${c}' é introduzida por duas aulas ('${anterior}' e '${aula.ref}') — unicidade de origem (I3)`,
        );
      }
      origem.set(c, aula.ref);
    }
  }
}

/** constrói a ORDEM CANÔNICA DAS LINHAS da matriz (fixa, determinística). */
function ordemDasLinhas(entryConstructs: ConceptId[], seedsReceptivos: ConceptId[], ordem: ConceptId[]): ConceptId[] {
  const juntas = [...entryConstructs, ...seedsReceptivos];
  const foraDoGrafo = [...new Set(juntas)].sort();
  const linhas: ConceptId[] = [];
  const vistos = new Set<ConceptId>();
  for (const c of foraDoGrafo) {
    linhas.push(c);
    vistos.add(c);
  }
  for (const c of ordem) {
    if (vistos.has(c)) continue;
    linhas.push(c);
    vistos.add(c);
  }
  return linhas;
}

/**
 * DERIVA o orçamento cumulativo da trilha a partir do GRAFO (P-08) + plano da
 * F3. PURO e determinístico: mesma entrada → mesmo artefato (hash incluído).
 *
 * Fail-closed: grafo inválido (ciclo/ref/dup), ordem inválida, plano inválido
 * (aula vazia/conceito desconhecido/origem duplicada) e pré-requisito ausente
 * (fecho-para-baixo não contido na entrada) LANÇAM F4Error — nunca um
 * orçamento "quase certo".
 *
 * Fonte de ordem: a topo-sort com critério GRAVADO (parâmetro `ordem`/`criterio`
 * ou derivada aqui). As COLUNAS da matriz são as aulas reordenadas pelo DAG
 * (min posição topológica do introduces, desempate por ref).
 */
export function deriveBudgetDoGrafo(entrada: ParametrosF4): ResultadoF4 {
  const criterio = entrada.criterio ?? 'ordem-lexicografica-por-id';
  const politica = entrada.politicaDeHarness ?? 'receptive-seed';
  const tetos = entrada.tetos ?? TETOS_DEFAULT;
  const seeds = entrada.seedsReceptivos ?? [];

  // 1) Ordem: usa a linearização da F3 se veio pronta, senão deriva.
  let ordem: ConceptId[];
  let topo: TopoResultado;
  if (entrada.ordem !== undefined) {
    validarOrdem(entrada.grafo, entrada.ordem);
    ordem = entrada.ordem;
    // O critério GRAVADO é o declarado pela F3 (default lexicográfico); a
    // re-derivação abaixo serve só para reportar os órfãos do grafo.
    const checagem = toposort(entrada.grafo, { criterio });
    topo = { ordem: entrada.ordem, criterio, orfaos: checagem.ok ? checagem.orfaos : [] };
  } else {
    const resultado = topoOuErro(entrada.grafo, criterio);
    ordem = resultado.ordem;
    topo = { ordem: resultado.ordem, criterio: resultado.criterio, orfaos: resultado.orfaos };
  }

  // 2) Plano validado (fail-closed) e reordenado pelo DAG.
  validarPlano(entrada.grafo, entrada.aulas);
  const aulas = ordenarAulasPeloDag(ordem, entrada.aulas);

  // 3) Carry cumulativo (mesmo algoritmo da onda 0, outra fonte de ordem).
  const productive = new Set<ConceptId>(entrada.entryConstructs);
  const receptive = new Set<ConceptId>([...entrada.entryConstructs, ...seeds]);
  const linhas = ordemDasLinhas(entrada.entryConstructs, seeds, ordem);

  const aulasBudget: BudgetAula[] = [];
  for (const aula of aulas) {
    const entradaReceptiva = [...receptive].sort();
    const entradaProdutiva = [...productive].sort();

    // fecha-para-baixo dos introduces: tudo que a aula precisa JÁ disponível.
    const fecho = fechoParaBaixo(entrada.grafo, aula.introduz);
    const faltando = fecho.filter((c) => !receptive.has(c));
    if (faltando.length > 0) {
      throw new F4Error(
        'PREREQUISITO_AUSENTE',
        `aula '${aula.ref}' introduz conceitos cujo fecho-para-baixo não está disponível: ${faltando.join(', ')} — ` +
          `a ordem das aulas viola o DAG (F4 deriva do grafo, não da ordem linear)`,
      );
    }

    // Reensino é ERRO na derivação (a G-MONO também o reprovaria; fail-closed).
    const jaDisponiveis = aula.introduz.filter((c) => receptive.has(c));
    if (jaDisponiveis.length > 0) {
      throw new F4Error(
        'REENSINO_NA_DERIVACAO',
        `aula '${aula.ref}' introduz conceito(s) já disponível(is): ${jaDisponiveis.join(', ')}`,
      );
    }

    const introduz = [...aula.introduz].sort();
    for (const c of introduz) {
      productive.add(c);
      receptive.add(c);
    }

    const matrix: CelulaMatriz[] = linhas.map((c) => {
      const estado: EstadoMatriz = introduz.includes(c) ? 'nova' : entradaReceptiva.includes(c) ? 'disponivel' : 'nao_disponivel';
      return { construcao: c, estado };
    });

    aulasBudget.push({
      ref: aula.ref,
      entryConstructs: [...entrada.entryConstructs].sort(),
      budget_entrada: { receptive: entradaReceptiva, productive: entradaProdutiva },
      budget_saida: { receptive: [...receptive].sort(), productive: [...productive].sort() },
      introduces: { receptive: introduz, productive: introduz },
      matrix,
      element_count: introduz.length,
      tetos,
    });
  }

  const semHash: Omit<BudgetF4, 'hash'> = { aulas: aulasBudget, fonte: 'declared', politica_de_harness: politica };
  const budget: BudgetF4 = { ...semHash, hash: hashDoOrcamento(semHash) };

  // Conformidade com o schema P-04 (fail-closed — prova de que o shape casa).
  const checagem = BudgetSchema.safeParse(budget);
  if (!checagem.success) {
    throw new F4Error('ARTEFATO_INVALIDO', `orçamento derivado viola o BudgetSchema: ${checagem.error.message}`);
  }

  return { budget: congelarProfundamente(budget), topo };
}

// ---------------------------------------------------------------------------
// G-MONO — o orçamento é MONOTÔNICO (barreira da F4, função PURA)
// ---------------------------------------------------------------------------

export type ViolacaoGMonotonicidadeId = 'AULA_SEM_CONSTRUCAO_NOVA' | 'ENTRADA_DIVERGENTE_DO_AXIOMA' | 'PERDA_DE_CONSTRUCAO' | 'REENSINO';

/** Uma violação de monotonicidade — lista não-vazia = G-MONO REPROVA. */
export interface ViolacaoGMonotonicidade {
  codigo: ViolacaoGMonotonicidadeId;
  /** aula envolvida (quando aplicável). */
  aula?: string;
  /** construção envolvida (quando aplicável). */
  construcao?: ConceptId;
  mensagem: string;
}

/**
 * G-MONO — função PURA sobre o ARTEFATO (vale para orçamentos derivados E
 * orçamentos editados à mão — é o gate, a derivação é só uma fonte).
 *
 * Regras (§3.5 + contrato P-10):
 *   - toda aula introduz ≥1 construção (`nova` em toda coluna da matriz);
 *   - a aula 0 recebe EXATAMENTE o axioma (entrada produtiva ≡ entryConstructs);
 *   - nada regride: nenhuma construção volta de `nova`/`disponivel` para
 *     `nao_disponivel` numa aula posterior (PERDA_DE_CONSTRUCAO);
 *   - nada é reensinado: nenhuma construção tem `nova` depois de já
 *     `disponivel`, nem `nova` repetida (REENSINO).
 */
export function checarGMonotonicidade(budget: BudgetF4): ViolacaoGMonotonicidade[] {
  const violacoes: ViolacaoGMonotonicidade[] = [];

  if (budget.aulas.length === 0) {
    return [
      {
        codigo: 'AULA_SEM_CONSTRUCAO_NOVA',
        mensagem: 'orçamento sem nenhuma aula — G-MONO exige ≥1 aula, cada uma introduzindo ≥1 construção',
      },
    ];
  }

  // Colunas: toda aula introduz ≥1.
  budget.aulas.forEach((aula, i) => {
    const novas = aula.matrix.filter((c) => c.estado === 'nova').length;
    if (novas === 0) {
      violacoes.push({
        codigo: 'AULA_SEM_CONSTRUCAO_NOVA',
        aula: aula.ref,
        mensagem: `aula '${aula.ref}' (coluna ${i}) não introduz NENHUMA construção — a matriz precisa de 'nova' em toda coluna`,
      });
    }
  });

  // Aula 0: entrada EXATAMENTE o axioma (produtivo ≡ entryConstructs).
  const aula0 = budget.aulas[0];
  const axioma = new Set(aula0.entryConstructs);
  const entrada0 = new Set(aula0.budget_entrada.productive);
  const sobra = [...entrada0].filter((c) => !axioma.has(c));
  const falta = [...axioma].filter((c) => !entrada0.has(c));
  if (sobra.length > 0 || falta.length > 0) {
    violacoes.push({
      codigo: 'ENTRADA_DIVERGENTE_DO_AXIOMA',
      aula: aula0.ref,
      mensagem:
        `aula 0 '${aula0.ref}' não recebe EXATAMENTE o axioma ` +
        `(sobra: ${sobra.join(', ') || '—'}; falta: ${falta.join(', ') || '—'})`,
    });
  }

  // Linhas: para cada construção, a sequência de estados nas colunas.
  const construcoes = new Set<ConceptId>();
  for (const aula of budget.aulas) {
    for (const celula of aula.matrix) construcoes.add(celula.construcao);
  }
  for (const construcao of [...construcoes].sort()) {
    let ativo = false; // já ficou nova ou disponivel
    let jaNova = false;
    budget.aulas.forEach((aula, i) => {
      const celula = aula.matrix.find((c) => c.construcao === construcao);
      const estado: EstadoMatriz = celula?.estado ?? 'nao_disponivel'; // célula ausente = regressão (fail-closed)

      if (estado === 'nova') {
        if (jaNova) {
          violacoes.push({
            codigo: 'REENSINO',
            aula: aula.ref,
            construcao,
            mensagem: `'${construcao}' é marcada 'nova' de novo na aula '${aula.ref}' (coluna ${i}) — unicidade de origem violada`,
          });
        } else if (ativo) {
          violacoes.push({
            codigo: 'REENSINO',
            aula: aula.ref,
            construcao,
            mensagem: `'${construcao}' volta a 'nova' na aula '${aula.ref}' (coluna ${i}) depois de já estar disponível — reensinar o que já estava no orçamento é proibido`,
          });
        }
        jaNova = true;
        ativo = true;
      } else if (estado === 'disponivel') {
        ativo = true;
      } else if (ativo) {
        violacoes.push({
          codigo: 'PERDA_DE_CONSTRUCAO',
          aula: aula.ref,
          construcao,
          mensagem: `'${construcao}' volta a 'nao_disponivel' na aula '${aula.ref}' (coluna ${i}) depois de já disponível — o orçamento PERDEU a construção entre aulas`,
        });
      }
    });
  }

  return violacoes;
}

/** Conveniência: G-MONO aprovado ⟺ lista de violações vazia. */
export function orcamentoMonotonico(budget: BudgetF4): boolean {
  return checarGMonotonicidade(budget).length === 0;
}

// ---------------------------------------------------------------------------
// Imutabilidade em profundidade (A-P10-4 — snapshot congelado)
// ---------------------------------------------------------------------------

/** congela o objeto EM PROFUNDIDADE (Object.freeze recursivo em objetos/arrays). */
export function congelarProfundamente<T>(valor: T): T {
  if (typeof valor !== 'object' || valor === null) return valor;
  if (Array.isArray(valor)) {
    for (const item of valor) congelarProfundamente(item);
    return Object.freeze(valor) as T;
  }
  for (const chave of Object.keys(valor as Record<string, unknown>)) {
    congelarProfundamente((valor as Record<string, unknown>)[chave]);
  }
  return Object.freeze(valor) as T;
}

// ---------------------------------------------------------------------------
// IO do orçamento (F4 materializa SEMPRE — §3.5)
// ---------------------------------------------------------------------------

/** O FREEZE já existe no diretório? (guarda A-P10-3 — declarada aqui, sem f5). */
export async function freezeExiste(dir: string): Promise<boolean> {
  try {
    await fsp.access(path.join(dir, FREEZE_FILENAME));
    return true;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new F4Error('IO_ERRO', `falha ao inspecionar FREEZE.json em ${dir}: ${mensagemDe(erro)}`);
  }
}

export interface OpcoesEscritaF4 {
  /** escrita injetável — testes simulam diretórios temp sem tocar em disco real do app. */
  escreverArquivo?: EscreverArquivoFn;
}

/** serializa o orçamento no formato de disco (JSON pretty + nova linha). */
export function seriarBudget(budget: BudgetF4): string {
  const checagem = BudgetSchema.safeParse(budget);
  if (!checagem.success) {
    throw new F4Error('ARTEFATO_INVALIDO', `orçamento viola o BudgetSchema: ${checagem.error.message}`);
  }
  return `${JSON.stringify(budget, null, 2)}\n`;
}

/**
 * MATERIALIZA `budget.generated.json` no diretório do run — SEMPRE em disco,
 * nunca só em memória (§3.5: é o que permite ao revisor ler sem executar e ao
 * git mostrar o diff). Escrita ATÔMICA (D-WRITE) com writer injetável.
 *
 * GUARDA A-P10-3: se um `FREEZE.json` já existir, a escrita LANÇA
 * F4Error('ORCAMENTO_CONGELADO') — depois do freeze, escrever no orçamento é
 * erro; a única exceção é o re-congelamento via `f5Freeze.congelar` (que é a
 * autoridade do freeze).
 */
export async function materializarBudget(dir: string, budget: BudgetF4, opcoes: OpcoesEscritaF4 = {}): Promise<void> {
  if (await freezeExiste(dir)) {
    throw new F4Error(
      'ORCAMENTO_CONGELADO',
      `recusa escrever o orçamento em ${dir}: FREEZE.json já existe — depois do freeze, escrever no orçamento é erro (A-P10-3)`,
    );
  }
  const conteudo = seriarBudget(budget);
  const caminho = path.join(dir, BUDGET_FILENAME);
  try {
    await escreverAtomico(caminho, conteudo, opcoes.escreverArquivo);
  } catch (erro) {
    if (erro instanceof F4Error) throw erro;
    throw new F4Error('IO_ERRO', `falha ao gravar ${caminho}: ${mensagemDe(erro)}`);
  }
}

/**
 * LÊ e valida `budget.generated.json` do diretório — fail-closed: parse falho,
 * shape fora do BudgetSchema ou HASH DO CONTEÚDO divergente do campo `hash`
 * (adulteração ingênua) é erro estruturado, nunca orçamento "quase certo".
 */
export async function lerOrcamento(dir: string, opcoes: OpcoesEscritaF4 = {}): Promise<BudgetF4> {
  const caminho = path.join(dir, BUDGET_FILENAME);
  const conteudo = await lerArquivoOuVazio(caminho);
  if (conteudo === '') throw new F4Error('ARTEFATO_INVALIDO', `orçamento não existe em ${caminho}`);
  let cru: unknown;
  try {
    cru = JSON.parse(conteudo);
  } catch (erro) {
    throw new F4Error('ARTEFATO_INVALIDO', `orçamento não é JSON válido: ${mensagemDe(erro)}`);
  }
  const checagem = BudgetSchema.safeParse(cru);
  if (!checagem.success) {
    throw new F4Error('ARTEFATO_INVALIDO', `orçamento em ${caminho} viola o BudgetSchema: ${checagem.error.message}`);
  }
  const budget = cru as BudgetF4;
  if (hashDoOrcamento(budget) !== budget.hash) {
    throw new F4Error(
      'ARTEFATO_CORROMPIDO',
      `hash do conteúdo de ${caminho} não bate com o campo 'hash' — orçamento adulterado`,
    );
  }
  return congelarProfundamente(budget);
}