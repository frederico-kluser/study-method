/**
 * app/electron/main/engine/phases/f5Freeze.ts — F5 · FREEZE (ponto de não
 * retorno) + snapshots imutáveis por aula (pacote P-10, onda 1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §2 (P3 — "Congelar o
 * orçamento ANTES do fan-out converte 'saída do agente anterior' em 'arquivo
 * versionado', e só então a autoria vira map-reduce legítimo. Depois do
 * freeze, cada autor recebe um snapshot imutável carimbado com hash, nunca o
 * estado global ao vivo.") e §4 (F5 ▮ FREEZE = ponto de não retorno).
 *
 * O QUE ESTE ARQUIVO É:
 *   - `FREEZE.json`: budget_version, budget_hash (sha256 do orçamento
 *     CANONICALIZADO — A-P10-2: reordenar chaves não muda o hash),
 *     graph_hash (idem, sobre o grafo), timestamp e os SNAPSHOTS imutáveis
 *     por aula.
 *   - SNAPSHOT IMUTÁVEL por aula, carimbado com o hash do orçamento de
 *     entrada/saída da aula (campo `budgetHash` no snapshot). Mutou o grafo →
 *     os snapshots AFETADOS são invalidados por hash (`snapshotsInvalidados`,
 *     função PURA: freezes antigo × novo → lista de aulas que voltam para a
 *     fila) — e só os afetados.
 *   - Imutabilidade (A-P10-4): todo objeto devolvido ao chamador é
 *     `Object.freeze` em PROFUNDIDADE — mutar o objeto recebido NÃO altera o
 *     arquivo (o conteúdo em disco é regenerado só pela autoridade do freeze).
 *   - A-P10-3: depois do freeze, ESCREVER no orçamento é ERRO. A guarda
 *     embutida mora em `f4Budget.materializarBudget` (FREEZE.json presente →
 *     lança). A ÚNICA exceção é o RE-CONGELAMENTO: `congelar` é a autoridade
 *     do freeze e o único caminho que escreve o orçamento depois do primeiro
 *     freeze — administrado (novo grafo → nova derivação F4 → novo freeze;
 *     `snapshotsInvalidados` decide o que volta para a fila). Nenhum caminho
 *     permite AUTORIA fora dos snapshots: os autores da F7 leem via
 *     `lerFreeze` (fail-closed: sem FREEZE.json, erro estruturado).
 *   - Canal formal de exceção: o AUTOR devolve `blocked` → `pedidoDeBloqueio`
 *     vira um PEDIDO estruturado ao PLANEJADOR entre ondas (função PURA).
 *     Autor nunca fala com autor e NUNCA escreve no orçamento — o pedido não
 *     tem campo de escrita; a resolução é do planejador (catálogo fechado
 *     ACAO_CATALOGO, P-04), não licença de improviso.
 *
 * DISK LAYOUT (por run, sob `app/content-src/<slug>/`):
 *   - `budget.generated.json` (F4 — declarado em f4Budget.ts)
 *   - `FREEZE.json` (este módulo)
 *   - `snapshots/<ref-com-__>.json` (caminho DECLARADO no snapshot; a
 *     materialização do arquivo por aula é onda posterior — a F7)
 *
 * DEPENDÊNCIA: f5Freeze importa de f4Budget (hash, escrita, leitura). f4Budget
 * NÃO importa daqui — sem ciclos (a constante FREEZE_FILENAME vive no módulo
 * inferior e é re-exportada aqui).
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { canonicalizarJson, sha256Hex } from '../runtime/ledger';
import { type EscreverArquivoFn, escreverAtomico, isHashSha256, lerArquivoOuVazio } from '../runtime/runState';
import type { ConceptGraph, ConceptId } from '../graph/model';
import { toposort } from '../graph/dag';
import { ACAO_CATALOGO } from '../schemas/artifacts';
import {
  BUDGET_FILENAME,
  BUDGET_VERSION,
  FREEZE_FILENAME,
  type BudgetF4,
  F4Error,
  congelarProfundamente,
  freezeExiste,
  hashDoOrcamento,
  lerOrcamento,
  seriarBudget,
  type OpcoesEscritaF4,
} from './f4Budget';

export { FREEZE_FILENAME }; // um único dono da constante (f4Budget declara)

// ---------------------------------------------------------------------------
// Erros estruturados (fail-closed — INV-03)
// ---------------------------------------------------------------------------

export type FreezeErrorCode =
  | 'FREEZE_AUSENTE' // FREEZE.json não existe (autoria sem freeze é proibida)
  | 'FREEZE_CORROMPIDO' // arquivo não parseia como JSON
  | 'FREEZE_INVALIDO' // parseia mas viola o shape
  | 'ORCAMENTO_AUSENTE' // congelar sem budget.generated.json em disco ou sem orçamento no input
  | 'ORCAMENTO_DIVERGENTE' // freeze.hash não bate com o orçamento (em disco ou do input)
  | 'SNAPSHOTS_DIVERGENTES' // snapshots do freeze não deriváveis do orçamento em disco
  | 'GRAFO_INVALIDO' // o grafo a congelar não é um DAG válido
  | 'ORCAMENTO_CONGELADO' // escrita recusada: FREEZE.json já existe (A-P10-3)
  | 'PEDIDO_INVALIDO'; // pedido blocked malformado

export class FreezeError extends Error {
  readonly code: FreezeErrorCode;
  readonly campo?: string;

  constructor(code: FreezeErrorCode, mensagem: string, campo?: string) {
    super(mensagem);
    this.name = 'FreezeError';
    this.code = code;
    this.campo = campo;
  }
}

// ---------------------------------------------------------------------------
// Tipos do freeze e do snapshot
// ---------------------------------------------------------------------------

/**
 * Um snapshot imutável de UMA aula: o autor da F7 recebe EXATAMENTE isto —
 * nunca o estado global ao vivo (P3). `budgetHash` carimba o orçamento de
 * entrada/saída da aula (hash do conteúdo canonicalizado da fatia
 * entrada+saída+introduces); `hash` é o hash do CONTEÚDO do snapshot (sem o
 * próprio campo). Shape = superconjunto do SnapshotSchema P-04 (aula_slug,
 * hash, caminho) + budgetHash (contrato P-10).
 */
export interface SnapshotAula {
  /** `<moduleSlug>/<lessonSlug>` — a identidade da aula. */
  aula_slug: string;
  /** caminho RELATIVO ao dir do run onde o snapshot será materializado. */
  caminho: string;
  /** sha256 do orçamento de entrada/saída DESTA aula (A-P10-2, canonicalizado). */
  budgetHash: string;
  /** sha256 do conteúdo do snapshot (sem o próprio campo hash). */
  hash: string;
}

/** O artefato `FREEZE.json` — o ponto de não retorno da trilha. */
export interface Freeze {
  /** versão do formato do orçamento congelado (BUDGET_VERSION da F4). */
  budget_version: string;
  /** sha256 do orçamento CANONICALIZADO (A-P10-2). */
  budget_hash: string;
  /** sha256 do grafo CANONICALIZADO — mudou o grafo, mudou o freeze. */
  graph_hash: string;
  /** momento do freeze, ISO-8601. */
  timestamp: string;
  /** snapshots imutáveis por aula, na ordem das aulas do orçamento. */
  snapshots: SnapshotAula[];
}

export interface EntradaCongelar {
  orcamento: BudgetF4;
  grafo: ConceptGraph;
  /** default BUDGET_VERSION. */
  budget_version?: string;
  /** injetável para testes determinísticos; default agora. */
  timestamp?: string;
}

export interface OpcoesFreeze {
  /** escrita injetável — testes usam dirs temp. */
  escreverArquivo?: EscreverArquivoFn;
}

// ---------------------------------------------------------------------------
// Hash do grafo (mesma primitiva do orçamento — A-P10-2)
// ---------------------------------------------------------------------------

/** sha256 do GRAFO canonicalizado (ordem de chaves irrelevante). */
export function hashDoGrafo(grafo: ConceptGraph): string {
  return sha256Hex(canonicalizarJson(grafo));
}

// ---------------------------------------------------------------------------
// Snapshots — derivação PURA + invalidação por hash
// ---------------------------------------------------------------------------

/** caminho relativo declarado para o snapshot da aula (determinístico). */
export function caminhoDoSnapshot(ref: string): string {
  return `snapshots/${ref.replace(/\//g, '__')}.json`;
}

/** a fatia do orçamento que carimba a aula (entrada + saída + introduces). */
function fatiaDaAula(aula: BudgetF4['aulas'][number]): Record<string, unknown> {
  return {
    ref: aula.ref,
    budget_entrada: aula.budget_entrada,
    budget_saida: aula.budget_saida,
    introduces: aula.introduces,
  };
}

/**
 * DERIVA os snapshots imutáveis do orçamento (PURA): um por aula, na ordem
 * das aulas. `budgetHash` cobre entrada+saída+introduces da aula — a mudança
 * do grafo que alterar QUALQUER uma dessas fatias muda o budgetHash e
 * invalida o snapshot (e só ele).
 */
export function derivarSnapshots(budget: BudgetF4): SnapshotAula[] {
  const derivados = budget.aulas.map((aula) => {
    const budgetHash = sha256Hex(canonicalizarJson(fatiaDaAula(aula)));
    const caminho = caminhoDoSnapshot(aula.ref);
    const hash = sha256Hex(canonicalizarJson({ aula_slug: aula.ref, caminho, budgetHash }));
    return { aula_slug: aula.ref, caminho, budgetHash, hash };
  });
  return congelarProfundamente(derivados);
}

export interface InvalidacaoSnapshots {
  /** aulas que voltam PARA A FILA: presentes nos dois freezes com budgetHash diferente. */
  invalidados: string[];
  /** aulas que sumiram do freeze novo (não voltam para a fila — saíram do currículo). */
  removidos: string[];
  /** aulas novas do freeze novo (nunca congeladas antes). */
  novos: string[];
}

/**
 * SNAPSHOTS INVALIDADOS — função PURA: freezes antigo × novo → aulas afetadas.
 * "Mudou o grafo → os snapshots AFETADOS são invalidados por hash e as aulas
 * voltam para a fila — e SÓ os afetados": uma aula cuja fatia
 * entrada/saída/introduces não mudou mantém o budgetHash → não é invalidada.
 */
export function snapshotsInvalidados(anterior: Freeze, novo: Freeze): InvalidacaoSnapshots {
  const hashAnterior = new Map(anterior.snapshots.map((s) => [s.aula_slug, s.budgetHash]));
  const hashNovo = new Map(novo.snapshots.map((s) => [s.aula_slug, s.budgetHash]));

  const invalidados: string[] = [];
  const removidos: string[] = [];
  const novos: string[] = [];

  for (const [aula, hash] of hashNovo) {
    if (!hashAnterior.has(aula)) novos.push(aula);
    else if (hashAnterior.get(aula) !== hash) invalidados.push(aula);
  }
  for (const aula of hashAnterior.keys()) {
    if (!hashNovo.has(aula)) removidos.push(aula);
  }

  const ordenar = (xs: string[]) => [...xs].sort();
  return { invalidados: ordenar(invalidados), removidos: ordenar(removidos), novos: ordenar(novos) };
}

// ---------------------------------------------------------------------------
// FREEZE — criação, validação, materialização
// ---------------------------------------------------------------------------

function isDataISO(valor: unknown): valor is string {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** valida `raw` (JSON.parse ou objeto em memória) como Freeze COMPLETO. */
export function validarFreeze(raw: unknown): Freeze {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new FreezeError('FREEZE_INVALIDO', 'FREEZE.json não é um objeto');
  }
  const o = raw as Record<string, unknown>;
  const stringa = (campo: string): string => {
    const v = o[campo];
    if (typeof v !== 'string' || v.trim() === '') {
      throw new FreezeError('FREEZE_INVALIDO', `campo '${campo}' obrigatório e não vazio`, campo);
    }
    return v;
  };
  const budget_version = stringa('budget_version');
  const budget_hash = stringa('budget_hash');
  if (!isHashSha256(budget_hash)) {
    throw new FreezeError('FREEZE_INVALIDO', `budget_hash não é sha256 em hex (64): ${JSON.stringify(budget_hash)}`, 'budget_hash');
  }
  const graph_hash = stringa('graph_hash');
  if (!isHashSha256(graph_hash)) {
    throw new FreezeError('FREEZE_INVALIDO', `graph_hash não é sha256 em hex (64): ${JSON.stringify(graph_hash)}`, 'graph_hash');
  }
  const timestamp = stringa('timestamp');
  if (!isDataISO(timestamp)) {
    throw new FreezeError('FREEZE_INVALIDO', `timestamp não é data ISO-8601: ${JSON.stringify(timestamp)}`, 'timestamp');
  }
  if (!Array.isArray(o['snapshots'])) {
    throw new FreezeError('FREEZE_INVALIDO', "campo 'snapshots' obrigatório e não vazio", 'snapshots');
  }
  const snapshots: SnapshotAula[] = o['snapshots'].map((s, i) => {
    const caminhoErro = (campo: string, motivo: string) =>
      new FreezeError('FREEZE_INVALIDO', `snapshots[${i}].${campo} ${motivo}`, `snapshots[${i}].${campo}`);
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      throw new FreezeError('FREEZE_INVALIDO', `snapshots[${i}] não é um objeto`, `snapshots[${i}]`);
    }
    const so = s as Record<string, unknown>;
    for (const campo of ['aula_slug', 'caminho', 'budgetHash', 'hash'] as const) {
      if (typeof so[campo] !== 'string' || so[campo].trim() === '') {
        throw caminhoErro(campo, 'obrigatório e não vazio');
      }
    }
    for (const campo of ['budgetHash', 'hash'] as const) {
      if (!isHashSha256(so[campo])) {
        throw caminhoErro(campo, `não é sha256 em hex (64): ${JSON.stringify(so[campo])}`);
      }
    }
    return {
      aula_slug: so['aula_slug'] as string,
      caminho: so['caminho'] as string,
      budgetHash: so['budgetHash'] as string,
      hash: so['hash'] as string,
    };
  });
  return { budget_version, budget_hash, graph_hash, timestamp, snapshots };
}

/**
 * CRIA o freeze em memória (PURA): hashes do orçamento canonicalizado e do
 * grafo canonicalizado, snapshots derivados, tudo DEVOLVIDO CONGELADO EM
 * PROFUNDIDADE (A-P10-4 — mutar o objeto recebido não altera nada).
 */
export function criarFreeze(entrada: EntradaCongelar): Freeze {
  const budgetHash = hashDoOrcamento(entrada.orcamento);
  if (entrada.orcamento.hash !== budgetHash) {
    throw new FreezeError(
      'ORCAMENTO_DIVERGENTE',
      'o campo hash do orçamento não bate com o hash do seu conteúdo — orçamento adulterado não congela',
    );
  }
  const grafoValido = toposort(entrada.grafo);
  if (!grafoValido.ok) {
    throw new FreezeError(
      'GRAFO_INVALIDO',
      grafoValido.falha === 'ciclo'
        ? `grafo a congelar não é um DAG: ciclo ${grafoValido.ciclo.join(' → ')}`
        : grafoValido.falha === 'referencia-inexistente'
          ? `grafo a congelar referencia conceito inexistente: ${grafoValido.refs.join(', ')}`
          : `grafo a congelar tem ids duplicados: ${grafoValido.ids.join(', ')}`,
    );
  }
  const freeze: Freeze = {
    budget_version: entrada.budget_version ?? BUDGET_VERSION,
    budget_hash: budgetHash,
    graph_hash: hashDoGrafo(entrada.grafo),
    timestamp: entrada.timestamp ?? new Date().toISOString(),
    snapshots: derivarSnapshots(entrada.orcamento),
  };
  return congelarProfundamente(freeze);
}

/**
 * MATERIALIZA o FREEZE.json (escrita atômica, D-WRITE). VERIFICA o orçamento
 * EM DISCO: `budget.generated.json` precisa existir, ser íntegro (hash) e
 * bater com `freeze.budget_hash`; e os snapshots precisam ser exatamente os
 * deriváveis desse orçamento (SNAPSHOTS_DIVERGENTES). Fail-closed: freeze com
 * hash mentiroso não vai a disco.
 */
export async function materializarFreeze(dir: string, freeze: Freeze, opcoes: OpcoesFreeze = {}): Promise<void> {
  validarFreeze(freeze); // lança FREEZE_INVALIDO

  let budgetEmDisco: BudgetF4;
  try {
    budgetEmDisco = await lerOrcamento(dir, opcoes);
  } catch (erro) {
    if (erro instanceof F4Error && erro.code === 'ARTEFATO_INVALIDO') {
      throw new FreezeError('ORCAMENTO_AUSENTE', `freeze exige budget.generated.json íntegro em ${dir}: ${erro.message}`);
    }
    throw erro;
  }
  if (budgetEmDisco.hash !== freeze.budget_hash) {
    throw new FreezeError(
      'ORCAMENTO_DIVERGENTE',
      `orçamento em disco (${budgetEmDisco.hash}) não bate com o budget_hash do freeze (${freeze.budget_hash})`,
    );
  }
  const derivaveis = derivarSnapshots(budgetEmDisco);
  if (canonicalizarJson(derivaveis) !== canonicalizarJson(freeze.snapshots)) {
    throw new FreezeError('SNAPSHOTS_DIVERGENTES', 'snapshots do freeze não derivam do orçamento em disco');
  }

  const conteudo = `${JSON.stringify(freeze, null, 2)}\n`;
  const caminho = path.join(dir, FREEZE_FILENAME);
  try {
    await escreverAtomico(caminho, conteudo, opcoes.escreverArquivo);
  } catch (erro) {
    if (erro instanceof FreezeError) throw erro;
    throw new FreezeError('FREEZE_INVALIDO', `falha ao gravar ${caminho}: ${mensagemDe(erro)}`);
  }
}

/**
 * O ponto de entrada da F5 E o único caminho de RE-CONGELAMENTO. Valida o
 * orçamento (shape + hash + G-MONO? não — G-MONO é a barreira da F4, rodada
 * ANTES), valida o grafo, escreve `budget.generated.json` (A-P10-1: SEMPRE
 * materializado) e `FREEZE.json` atomically, e devolve o freeze congelado.
 *
 * Escrita do orçamento DEPOIS do freeze (A-P10-3): só AQUI — é a autoridade
 * do freeze; qualquer outro caminho (`materializarBudget` da F4) lança
 * ORCAMENTO_CONGELADO na presença do FREEZE.json. Um re-congelamento é um
 * ciclo NOVO de freeze (novo grafo → nova derivação F4 → este): para decidir
 * o que volta para a fila, compare com o freeze anterior via
 * `snapshotsInvalidados`.
 */
export async function congelar(dir: string, entrada: EntradaCongelar, opcoes: OpcoesFreeze = {}): Promise<Freeze> {
  const freeze = criarFreeze(entrada); // valida orçamento (hash) e grafo (DAG)

  // orçamento SEMPRE materializado em disco — §3.5 e A-P10-1.
  const conteudoBudget = seriarBudget(entrada.orcamento);
  const caminhoBudget = path.join(dir, BUDGET_FILENAME);
  try {
    await fsp.mkdir(dir, { recursive: true });
    await escreverAtomico(caminhoBudget, conteudoBudget, opcoes.escreverArquivo);
  } catch (erro) {
    if (erro instanceof FreezeError || erro instanceof F4Error) throw erro;
    throw new FreezeError('FREEZE_INVALIDO', `falha ao gravar ${caminhoBudget}: ${mensagemDe(erro)}`);
  }

  await materializarFreeze(dir, freeze, opcoes);
  return freeze;
}

/**
 * GUARDA explícita de A-P10-3 para chamadores que querem conferir ANTES de
 * qualquer escrita: lança FreezeError('ORCAMENTO_CONGELADO') se o freeze já
 * existe no diretório. A guarda embutida de `materializarBudget` usa a mesma
 * verificação (freezeExiste, declarada em f4Budget).
 */
export async function garantirOrcamentoEscritivel(dir: string): Promise<void> {
  if (await freezeExiste(dir)) {
    throw new FreezeError(
      'ORCAMENTO_CONGELADO',
      `orçamento congelado em ${dir} — depois do freeze, escrever no orçamento é erro (A-P10-3)`,
    );
  }
}

/**
 * LÊ o FREEZE.json do diretório — fail-closed: sem freeze (FREEZE_AUSENTE),
 * JSON inválido (FREEZE_CORROMPIDO) ou shape inválido (FREEZE_INVALIDO) é
 * ERRO estruturado. É a porta de entrada da AUTORIA (F7): os autores recebem
 * os SNAPSHOTS daqui, nunca o estado global ao vivo (P3) — nenhum caminho
 * permite autoria começar antes do freeze.
 */
export async function lerFreeze(dir: string, opcoes: OpcoesFreeze = {}): Promise<Freeze> {
  const caminho = path.join(dir, FREEZE_FILENAME);
  const conteudo = await lerArquivoOuVazio(caminho);
  if (conteudo === '') {
    throw new FreezeError('FREEZE_AUSENTE', `FREEZE.json não existe em ${dir} — autoria exige o freeze (F5) primeiro`);
  }
  let cru: unknown;
  try {
    cru = JSON.parse(conteudo);
  } catch (erro) {
    throw new FreezeError('FREEZE_CORROMPIDO', `FREEZE.json não é JSON válido: ${mensagemDe(erro)}`);
  }
  return congelarProfundamente(validarFreeze(cru));
}

// ---------------------------------------------------------------------------
// Canal formal de exceção — `blocked` do autor vira PEDIDO ao PLANEJADOR
// ---------------------------------------------------------------------------

/** Subconjunto ESTÁVEL do catálogo fechado que resolve "falta construção". */
const ACOES_PARA_FALTA_DE_CONSTRUCAO: readonly (typeof ACAO_CATALOGO)[number][] = [
  'ADD_EDGE',
  'REMOVE_EDGE',
  'SPLIT_NODE',
  'INSERT_INTERMEDIATE',
  'MOVE_CONCEPT_TO_ENTRY_BUDGET',
  'REWRITE_IN_BUDGET',
];

/**
 * Um pedido ESTRUTURADO do autor ao planejador, entre ondas. NÃO é licença:
 * não há campo de escrita, não há destinatário-autor — a resolução é decisão
 * do planejador dentro do catálogo fechado, nunca improviso do autor (§7.1
 * regra 3: "se você acha que precisa de algo fora do orçamento, isso é
 * defeito do grafo, não licença").
 */
export interface PedidoAoPlanejador {
  origem: 'autor';
  aula: string;
  requisicao: 'pedido-ao-planejador';
  /** as construções que faltaram ao autor dentro do snapshot recebido. */
  faltantes: ConceptId[];
  justificativa: string;
  /** Sugestão de ações (subconjunto do catálogo fechado) — o planejador decide. */
  acoes_sugeridas: typeof ACOES_PARA_FALTA_DE_CONSTRUCAO;
  /** literal: o autor NUNCA escreve no orçamento (A-P10-3). */
  autor_escreve_no_orcamento: false;
}

/**
 * Transforma a devolutiva `blocked` do autor num PEDIDO ao planejador
 * (função PURA). Fail-closed: aula vazia, faltantes vazio ou justificativa
 * vazia LANÇAM FreezeError('PEDIDO_INVALIDO') — um bloqueio sem lista do que
 * falta não vira pedido, vira erro (sem silêncio, sem rota alternativa).
 */
export function pedidoDeBloqueio(entrada: { aula: string; faltantes: ConceptId[]; justificativa: string }): PedidoAoPlanejador {
  if (entrada.aula.trim() === '') {
    throw new FreezeError('PEDIDO_INVALIDO', 'pedido de bloqueio exige a aula que bloqueou', 'aula');
  }
  if (entrada.faltantes.length === 0) {
    throw new FreezeError('PEDIDO_INVALIDO', 'pedido de bloqueio exige a lista do que falta (vazio = sem pedido)', 'faltantes');
  }
  if (entrada.justificativa.trim() === '') {
    throw new FreezeError('PEDIDO_INVALIDO', 'pedido de bloqueio exige justificativa', 'justificativa');
  }
  return congelarProfundamente({
    origem: 'autor',
    aula: entrada.aula,
    requisicao: 'pedido-ao-planejador',
    faltantes: [...entrada.faltantes].sort(),
    justificativa: entrada.justificativa,
    acoes_sugeridas: [...ACOES_PARA_FALTA_DE_CONSTRUCAO],
    autor_escreve_no_orcamento: false,
  });
}