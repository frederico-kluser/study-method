/**
 * app/electron/main/engine/phases/f5Freeze.ts — F5 · FREEZE (ponto de não
 * retorno) + snapshots imutáveis por aula (pacote P-10).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §2 (P3 — "Congelar o
 * orçamento ANTES do fan-out converte 'saída do agente anterior' em 'arquivo
 * versionado', e só então a autoria vira map-reduce legítimo. Depois do
 * freeze, cada autor recebe um snapshot imutável carimbado com hash, nunca o
 * estado global ao vivo.") e §4 (F5 ▮ FREEZE = ponto de não retorno).
 *
 * O QUE ESTE ARQUIVO É:
 *   - `FREEZE.json` com o shape do FreezeSchema (P-04, schemas/artifacts.ts):
 *     `hash_orcamento` (sha256 do orçamento CANONICALIZADO — A-P10-2:
 *     reordenar chaves não muda o hash), `hash_grafo` (idem, sobre o grafo),
 *     `carimbo` (ISO-8601 do momento do freeze), `dossies` (lista de dossiês
 *     congelados — VAZIA na F5: os dossiês de aula são derivados na autoria
 *     da F7; ausência válida = valor vazio EXPLÍTICO, INV-05) e `snapshots`
 *     imutáveis por aula. O artefato É VALIDADO contra o FreezeSchema
 *     (safeParse) em criação, materialização e leitura — a F5 honra o
 *     contrato do P-04 do mesmo jeito que a F4 honra o BudgetSchema (HIGH-1).
 *   - SNAPSHOT IMUTÁVEL por aula, carimbado com o hash do orçamento de
 *     entrada/saída da aula (campo ADITIVO `budgetHash` no snapshot: o
 *     FreezeSchema não é strict, então parse passa e o arquivo carrega o
 *     campo; os snapshots do schema são {aula_slug, hash, caminho} e o hash
 *     do snapshot cobre {aula_slug, caminho, budgetHash}). Mutou o grafo →
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
 *   - RE-CONGELAMENTO (W-5, onda 2): `congelar` re-executado NUNCA
 *     sobrescreve em silêncio — (a) idempotente quando o conteúdo congelado
 *     bate (hash_orcamento + hash_grafo + snapshots; o carimbo não conta);
 *     (b) conteúdo DIFERENTE sem a flag `permitirRecongelar` →
 *     FreezeError('FREEZE_EXISTENTE_DIVERGENTE'); (c) com a flag, o freeze
 *     ANTERIOR é arquivado em `FREEZE.previous.json` antes de substituir
 *     (recuperável — o arquivamento É o registro do freeze anterior no
 *     conjunto de artefatos do run).
 *   - Canal formal de exceção: o AUTOR devolve `blocked` → `pedidoDeBloqueio`
 *     vira um PEDIDO estruturado ao PLANEJADOR entre ondas (função PURA).
 *     Autor nunca fala com autor e NUNCA escreve no orçamento — o pedido não
 *     tem campo de escrita; a resolução é do planejador (catálogo fechado
 *     ACAO_CATALOGO, P-04), não licença de improviso.
 *
 * DISK LAYOUT (por run, sob `app/content-src/<slug>/`):
 *   - `budget.generated.json` (F4 — declarado em f4Budget.ts)
 *   - `FREEZE.json` (este módulo)
 *   - `FREEZE.previous.json` (re-congelamento com flag — W-5)
 *   - `snapshots/<ref-com-__>.json` (caminho DECLARADO no snapshot; a
 *     materialização do arquivo por aula é onda posterior — a F7)
 *
 * DEPENDÊNCIA: f5Freeze importa de f4Budget (hash, escrita, leitura). f4Budget
 * NÃO importa daqui — sem ciclos (a constante FREEZE_FILENAME vive no módulo
 * inferior e é re-exportada aqui).
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { z } from 'zod';

import { canonicalizarJson, sha256Hex } from '../runtime/ledger';
import { type EscreverArquivoFn, escreverAtomico, isHashSha256, lerArquivoOuVazio } from '../runtime/runState';
import type { ConceptGraph, ConceptId } from '../graph/model';
import { toposort } from '../graph/dag';
import { ACAO_CATALOGO, FreezeSchema } from '../schemas/artifacts';
import {
  BUDGET_FILENAME,
  FREEZE_FILENAME,
  type BudgetF4,
  F4Error,
  congelarProfundamente,
  freezeExiste,
  hashDoOrcamento,
  lerOrcamento,
  seriarBudget,
} from './f4Budget';

export { FREEZE_FILENAME }; // um único dono da constante (f4Budget declara)

/** Nome do artefato que arquiva o freeze ANTERIOR num re-congelamento (W-5). */
export const FREEZE_ANTERIOR_FILENAME = 'FREEZE.previous.json';

// ---------------------------------------------------------------------------
// Erros estruturados (fail-closed — INV-03)
// ---------------------------------------------------------------------------

export type FreezeErrorCode =
  | 'FREEZE_AUSENTE' // FREEZE.json não existe (autoria sem freeze é proibida)
  | 'FREEZE_CORROMPIDO' // arquivo não parseia como JSON
  | 'FREEZE_INVALIDO' // parseia mas viola o shape (FreezeSchema P-04)
  | 'ARTEFATO_CORROMPIDO' // shape OK mas o CONTEÚDO foi adulterado (W-2)
  | 'ORCAMENTO_AUSENTE' // congelar sem budget.generated.json em disco ou sem orçamento no input
  | 'ORCAMENTO_DIVERGENTE' // freeze.hash_orcamento não bate com o orçamento (em disco ou do input)
  | 'SNAPSHOTS_DIVERGENTES' // snapshots do freeze não deriváveis do orçamento em disco
  | 'GRAFO_INVALIDO' // o grafo a congelar não é um DAG válido
  | 'ORCAMENTO_CONGELADO' // escrita recusada: FREEZE.json já existe (A-P10-3)
  | 'FREEZE_EXISTENTE_DIVERGENTE' // re-congelar com conteúdo diferente sem a flag (W-5)
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
// Tipos do freeze e do snapshot (shape = FreezeSchema P-04, HIGH-1)
// ---------------------------------------------------------------------------

/**
 * Um snapshot imutável de UMA aula: o autor da F7 recebe EXATAMENTE isto —
 * nunca o estado global ao vivo (P3). O trio `aula_slug`/`hash`/`caminho` é o
 * SnapshotSchema do P-04; `budgetHash` é o campo ADITIVO do pacote P-10 (o
 * FreezeSchema não é strict — o safeParse passa e o arquivo carrega o campo):
 * o sha256 do orçamento de entrada/saída da aula, que faz a invalidação por
 * snapshot funcionar; `hash` cobre o conteúdo do snapshot (sem o próprio
 * campo) e sustenta a reverificação de conteúdo do W-2.
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

/** Base do artefato = inferência do FreezeSchema P-04 (tipos DERIVADOS do schema). */
type FreezeDoSchema = z.infer<typeof FreezeSchema>;

/** Uma entrada de dossiê congelado — shape PURO do SnapshotSchema (sem o campo aditivo P-10). */
export interface Dossie {
  aula_slug: string;
  hash: string;
  caminho: string;
}

/**
 * O artefato `FREEZE.json` — o ponto de não retorno da trilha. Shape =
 * FreezeSchema (P-04): `hash_orcamento`, `hash_grafo`, `carimbo`, `dossies`,
 * `snapshots` — com `snapshots` enriquecidos pelo campo aditivo P-10
 * `budgetHash` (o FreezeSchema não é strict: o safeParse passa e o arquivo
 * carrega o campo). `FreezeSchema.safeParse(artefato)` DEVE passar —
 * `criarFreeze` prova em runtime e o teste fixa (HIGH-1).
 */
export type Freeze = Omit<FreezeDoSchema, 'dossies' | 'snapshots'> & {
  dossies: Dossie[];
  snapshots: SnapshotAula[];
};

export interface EntradaCongelar {
  orcamento: BudgetF4;
  grafo: ConceptGraph;
  /** injetável para testes determinísticos; default agora. */
  timestamp?: string;
}

export interface OpcoesFreeze {
  /** escrita injetável — testes usam dirs temp. */
  escreverArquivo?: EscreverArquivoFn;
  /**
   * Autoriza re-congelamento DIVERGENTE (W-5): sem a flag, um FREEZE.json
   * existente com conteúdo diferente é ERRO FREEZE_EXISTENTE_DIVERGENTE; com
   * a flag, o freeze anterior é arquivado em FREEZE.previous.json antes de
   * substituir (recuperável).
   */
  permitirRecongelar?: boolean;
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
 * invalida o snapshot (e só ele). `hash` cobre {aula_slug, caminho,
 * budgetHash} (o conteúdo do snapshot sem o próprio campo) — é O QUE O W-2
 * recomputa na leitura.
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

/** valida UMA entrada de snapshot/dossiê e devolve o trio do SnapshotSchema. */
function refinarEntrada(s: unknown, nome: 'snapshots' | 'dossies', i: number): { aula_slug: string; hash: string; caminho: string } {
  const caminhoErro = (campo: string, motivo: string) =>
    new FreezeError('FREEZE_INVALIDO', `${nome}[${i}].${campo} ${motivo}`, `${nome}[${i}].${campo}`);
  if (typeof s !== 'object' || s === null || Array.isArray(s)) {
    throw new FreezeError('FREEZE_INVALIDO', `${nome}[${i}] não é um objeto`, `${nome}[${i}]`);
  }
  const so = s as Record<string, unknown>;
  for (const campo of ['aula_slug', 'caminho', 'hash'] as const) {
    if (typeof so[campo] !== 'string' || (so[campo] as string).trim() === '') {
      throw caminhoErro(campo, 'obrigatório e não vazio');
    }
  }
  if (!isHashSha256(so['hash'])) {
    throw caminhoErro('hash', `não é sha256 em hex (64): ${JSON.stringify(so['hash'])}`);
  }
  return {
    aula_slug: so['aula_slug'] as string,
    caminho: so['caminho'] as string,
    hash: so['hash'] as string,
  };
}

/** refina os SNAPSHOTS do freeze: trio do SnapshotSchema + campo aditivo P-10 `budgetHash` (sha256). */
function refinarSnapshots(lista: unknown): SnapshotAula[] {
  if (!Array.isArray(lista)) {
    throw new FreezeError('FREEZE_INVALIDO', "campo 'snapshots' obrigatório (array)", 'snapshots');
  }
  return lista.map((s, i) => {
    const base = refinarEntrada(s, 'snapshots', i);
    const so = s as Record<string, unknown>;
    const budgetHash = so['budgetHash'];
    if (typeof budgetHash !== 'string' || budgetHash.trim() === '' || !isHashSha256(budgetHash)) {
      const caminhoErro = (campo: string, motivo: string) =>
        new FreezeError('FREEZE_INVALIDO', `snapshots[${i}].${campo} ${motivo}`, `snapshots[${i}].${campo}`);
      throw caminhoErro('budgetHash', `não é sha256 em hex (64): ${JSON.stringify(budgetHash)}`);
    }
    return { ...base, budgetHash };
  });
}

/** refina os DOSSIÊS do freeze — shape puro do SnapshotSchema (vazios na F5). */
function refinarDossies(lista: unknown): Dossie[] {
  if (!Array.isArray(lista)) {
    throw new FreezeError('FREEZE_INVALIDO', "campo 'dossies' obrigatório (array)", 'dossies');
  }
  return lista.map((s, i) => refinarEntrada(s, 'dossies', i));
}

/** valida `raw` (JSON.parse ou objeto em memória) como Freeze COMPLETO: schema P-04 + refinamentos P-10. */
export function validarFreeze(raw: unknown): Freeze {
  const checagem = FreezeSchema.safeParse(raw);
  if (!checagem.success) {
    const primeiro = checagem.error.issues[0];
    const campo = primeiro !== undefined && primeiro.path.length > 0 ? primeiro.path.join('.') : '(raiz)';
    throw new FreezeError(
      'FREEZE_INVALIDO',
      `FREEZE.json viola o FreezeSchema (P-04): campo '${campo}': ${primeiro?.message ?? 'valor fora do contrato'}`,
      campo,
    );
  }
  const o = raw as Record<string, unknown>;
  const hash_orcamento = o['hash_orcamento'] as string; // não vazio garantido pelo schema
  if (!isHashSha256(hash_orcamento)) {
    throw new FreezeError(
      'FREEZE_INVALIDO',
      `hash_orcamento não é sha256 em hex (64): ${JSON.stringify(hash_orcamento)}`,
      'hash_orcamento',
    );
  }
  const hash_grafo = o['hash_grafo'] as string;
  if (!isHashSha256(hash_grafo)) {
    throw new FreezeError('FREEZE_INVALIDO', `hash_grafo não é sha256 em hex (64): ${JSON.stringify(hash_grafo)}`, 'hash_grafo');
  }
  const carimbo = o['carimbo'] as string;
  if (!isDataISO(carimbo)) {
    throw new FreezeError('FREEZE_INVALIDO', `carimbo não é data ISO-8601: ${JSON.stringify(carimbo)}`, 'carimbo');
  }
  // snapshots/dossies já passaram pelo z.array(SnapshotSchema) do schema; os
  // refinamentos abaixo exigem o campo aditivo P-10 (hash sha256) nos snapshots.
  const snapshots = refinarSnapshots(o['snapshots']);
  const dossies = refinarDossies(o['dossies']);
  return { hash_orcamento, hash_grafo, carimbo, dossies, snapshots };
}

/**
 * CRIA o freeze em memória (PURA): hashes do orçamento canonicalizado e do
 * grafo canonicalizado, snapshots derivados, tudo DEVOLVIDO CONGELADO EM
 * PROFUNDIDADE (A-P10-4 — mutar o objeto recebido não altera nada). Ao final,
 * PROVA de conformidade com o FreezeSchema do P-04 (HIGH-1): o artefato só
 * existe se o schema aceitar — a F5 honra o mesmo contrato que a F4 honra
 * com o BudgetSchema.
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
    // mapeamento dos internos do P-10 para os NOMES DO FreezeSchema:
    // hash_orcamento = hash do orçamento canonicalizado (A-P10-2);
    // hash_grafo     = hash do grafo canonicalizado;
    // carimbo        = momento do freeze (ISO-8601);
    // dossies        = vazio na F5 (dossiês derivados por aula na autoria F7 —
    //                  ausência válida é valor vazio EXPLÍCITO, INV-05);
    // snapshots      = snapshots imutáveis por aula (com budgetHash aditivo).
    hash_orcamento: budgetHash,
    hash_grafo: hashDoGrafo(entrada.grafo),
    carimbo: entrada.timestamp ?? new Date().toISOString(),
    dossies: [],
    snapshots: derivarSnapshots(entrada.orcamento),
  };
  const prova = FreezeSchema.safeParse(freeze);
  if (!prova.success) {
    throw new FreezeError('FREEZE_INVALIDO', `freeze criado viola o FreezeSchema (P-04): ${prova.error.message}`);
  }
  return congelarProfundamente(freeze);
}

/**
 * MATERIALIZA o FREEZE.json (escrita atômica, D-WRITE). VERIFICA o orçamento
 * EM DISCO: `budget.generated.json` precisa existir, ser íntegro (hash) e
 * bater com `freeze.hash_orcamento`; e os snapshots precisam ser exatamente
 * os deriváveis desse orçamento (SNAPSHOTS_DIVERGENTES). Fail-closed: freeze
 * com hash mentiroso não vai a disco.
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
  if (budgetEmDisco.hash !== freeze.hash_orcamento) {
    throw new FreezeError(
      'ORCAMENTO_DIVERGENTE',
      `orçamento em disco (${budgetEmDisco.hash}) não bate com o hash_orcamento do freeze (${freeze.hash_orcamento})`,
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
 * Dois freezes são EQUIVALENTES quando congelam o MESMO conteúdo:
 * hash_orcamento + hash_grafo + snapshots idênticos. O `carimbo` NÃO conta —
 * idempotência é sobre o conteúdo congelado, não sobre o instante (W-5).
 */
function freezesEquivalentes(a: Freeze, b: Freeze): boolean {
  return (
    a.hash_orcamento === b.hash_orcamento &&
    a.hash_grafo === b.hash_grafo &&
    canonicalizarJson(a.snapshots) === canonicalizarJson(b.snapshots)
  );
}

/**
 * O ponto de entrada da F5 E o único caminho de RE-CONGELAMENTO. Valida o
 * orçamento (shape + hash + G-MONO? não — G-MONO é a barreira da F4, rodada
 * ANTES), valida o grafo, escreve `budget.generated.json` (A-P10-1: SEMPRE
 * materializado) e `FREEZE.json` atomically, e devolve o freeze congelado.
 *
 * Re-congelamento (W-5 — NUNCA sobrescreve em silêncio):
 *   - FREEZE.json já existe com o MESMO conteúdo → NO-OP (devolve o freeze
 *     existente, com o carimbo dele; nem o orçamento é reescrito);
 *   - existe com conteúdo DIFERENTE e sem `opcoes.permitirRecongelar` →
 *     FreezeError('FREEZE_EXISTENTE_DIVERGENTE');
 *   - existe com conteúdo DIFERENTE e com a flag → o freeze ANTERIOR é
 *     arquivado em FREEZE.previous.json (recuperável) ANTES de substituir.
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

  const jaCongelado = await freezeExiste(dir);
  if (jaCongelado) {
    // lerFreeze REVERIFICA o conteúdo (W-2): um freeze anterior corrompido
    // bloqueia o re-congelamento (fail-closed — não se sobrescreve ruína).
    const anterior = await lerFreeze(dir, opcoes);
    if (freezesEquivalentes(anterior, freeze)) {
      // (a) idempotente: mesmo conteúdo congelado → no-op total.
      return anterior;
    }
    if (!(opcoes.permitirRecongelar ?? false)) {
      // (b) divergente sem flag → erro estruturado, nunca sobrescrita muda.
      throw new FreezeError(
        'FREEZE_EXISTENTE_DIVERGENTE',
        `FREEZE.json existente em ${dir} congela conteúdo diferente (hash_orcamento ${anterior.hash_orcamento} ≠ ${freeze.hash_orcamento}; ` +
          `hash_grafo ${anterior.hash_grafo} ≠ ${freeze.hash_grafo}) — re-congelar com conteúdo divergente exige a flag permitirRecongelar (W-5)`,
      );
    }
    // (c) com a flag: arquiva o freeze ANTERIOR como FREEZE.previous.json
    // ANTES de substituir — o arquivamento É o REGISTRO do freeze anterior no
    // conjunto de artefatos do run (recuperável a qualquer momento).
    const caminhoAnterior = path.join(dir, FREEZE_ANTERIOR_FILENAME);
    try {
      await escreverAtomico(caminhoAnterior, `${JSON.stringify(anterior, null, 2)}\n`, opcoes.escreverArquivo);
    } catch (erro) {
      if (erro instanceof FreezeError) throw erro;
      throw new FreezeError('FREEZE_INVALIDO', `falha ao arquivar ${caminhoAnterior}: ${mensagemDe(erro)}`);
    }
  }

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
 * REVERIFICAÇÃO DE CONTEÚDO (W-2) — mesmo espírito de `lerOrcamento`
 * (f4Budget): depois do shape, o CONTEÚDO é conferido:
 *   1. cada snapshot: o hash declarado é recomputado sobre o conteúdo do
 *      PRÓPRIO ARQUIVO, exceto os campos de hash ({aula_slug, caminho,
 *      budgetHash}) — adulterar qualquer um desses campos quebra o hash;
 *   2. `hash_orcamento`: cross-check com o budget.generated.json EM DISCO
 *      (cujo próprio conteúdo é verificado por `lerOrcamento` — adulterar o
 *      hash_orcamento no arquivo OU o orçamento em disco diverge aqui).
 * `hash_grafo` NÃO é recomputável deste módulo (não há arquivo do grafo no
 * dir do run) — fica verificado por shape; limite DECLARADO, sem overclaim.
 * Qualquer divergência → FreezeError('ARTEFATO_CORROMPIDO').
 */
async function reverificarConteudoFreeze(dir: string, freeze: Freeze, opcoes: OpcoesFreeze): Promise<void> {
  for (const snapshot of freeze.snapshots) {
    const recomputado = sha256Hex(
      canonicalizarJson({ aula_slug: snapshot.aula_slug, caminho: snapshot.caminho, budgetHash: snapshot.budgetHash }),
    );
    if (recomputado !== snapshot.hash) {
      throw new FreezeError(
        'ARTEFATO_CORROMPIDO',
        `FREEZE.json adulterado: o hash do snapshot '${snapshot.aula_slug}' não bate com o conteúdo do próprio arquivo`,
      );
    }
  }
  for (const dossie of freeze.dossies) {
    // dossies são vazios na F5; quando presentes (ondas posteriores), o hash
    // cobre o trio do SnapshotSchema {aula_slug, caminho} (sem budgetHash).
    const recomputado = sha256Hex(canonicalizarJson({ aula_slug: dossie.aula_slug, caminho: dossie.caminho }));
    if (recomputado !== dossie.hash) {
      throw new FreezeError(
        'ARTEFATO_CORROMPIDO',
        `FREEZE.json adulterado: o hash do dossiê '${dossie.aula_slug}' não bate com o conteúdo do próprio arquivo`,
      );
    }
  }
  let budgetEmDisco: BudgetF4;
  try {
    budgetEmDisco = await lerOrcamento(dir, opcoes);
  } catch (erro) {
    if (erro instanceof F4Error && (erro.code === 'ARTEFATO_INVALIDO' || erro.code === 'ARTEFATO_CORROMPIDO')) {
      throw new FreezeError('ARTEFATO_CORROMPIDO', `FREEZE.json não pode ser re-verificado: ${erro.message}`);
    }
    throw erro;
  }
  if (budgetEmDisco.hash !== freeze.hash_orcamento) {
    throw new FreezeError(
      'ARTEFATO_CORROMPIDO',
      `FREEZE.json adulterado: hash_orcamento (${freeze.hash_orcamento}) não bate com o orçamento em disco (${budgetEmDisco.hash})`,
    );
  }
}

/**
 * LÊ o FREEZE.json do diretório — fail-closed: sem freeze (FREEZE_AUSENTE),
 * JSON inválido (FREEZE_CORROMPIDO), shape inválido (FREEZE_INVALIDO) ou
 * CONTEÚDO adulterado (ARTEFATO_CORROMPIDO, W-2) é ERRO estruturado. É a
 * porta de entrada da AUTORIA (F7): os autores recebem os SNAPSHOTS daqui,
 * nunca o estado global ao vivo (P3) — nenhum caminho permite autoria
 * começar antes do freeze.
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
  const freeze = validarFreeze(cru);
  await reverificarConteudoFreeze(dir, freeze, opcoes); // W-2: ARTEFATO_CORROMPIDO
  return congelarProfundamente(freeze);
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