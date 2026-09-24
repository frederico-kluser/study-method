/**
 * app/electron/main/engine/quality/progressaoDemo.ts — a DEMONSTRAÇÃO por
 * aula (Demo(i), DemoSec1(i) e a seção que demonstra cada chave) e as
 * CONSTRUÇÕES de uma linha (o colapso didático do A14b).
 *
 * A prosa normativa vive na fachada `progressao.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { TrackTheorySection } from '../../content/trackTypes';
import type { AtomKey } from '../atomKeys';
import { extractAllOccurrences } from '../extract';
import {
  DEFAULT_ADAPTER_ID,
  classifyTheoryTag,
  type LanguageId,
} from '../lang/registry';
import { extractFencedBlocks } from '../theoryCode';

/** Os blocos com tag do adaptador dentro do markdown de uma seção. */
function blocosFencedDe(secao: TrackTheorySection, adapterId: LanguageId): string[] {
  const out: string[] = [];
  if (typeof secao.markdown === 'string' && secao.markdown.length > 0) {
    const fenced = extractFencedBlocks(secao.markdown);
    for (const b of fenced.blocks) if (b.adapterId === adapterId) out.push(b.code);
  }
  return out;
}

/**
 * O campo `code` da seção QUANDO ele é da linguagem da trilha — a ASSIMETRIA
 * DO BLOCO SEM TAG é preservada byte a byte, e não é descuido: campo `code`
 * SEM `language` → adaptador DEFAULT (o schema garante que é código); cerca
 * ``` sem tag → parser NENHUM (pode ser saída de terminal e envenenaria o
 * orçamento). É a mesma regra de `collectLessonCode`
 * (`engine/theoryCode.ts:216-238`), agora escrita uma vez em cada lado com a
 * MESMA fonte.
 */
function blocoCodeDaSecao(secao: TrackTheorySection, adapterId: LanguageId): string | null {
  const code = secao.code;
  if (code && typeof code.code === 'string' && code.code.trim().length > 0) {
    const lang = (code.language ?? '').toLowerCase();
    const alvo = lang === '' ? DEFAULT_ADAPTER_ID : classifyTheoryTag(lang).adapterId;
    if (alvo === adapterId) return code.code;
  }
  return null;
}

/**
 * Blocos de UMA seção de teoria QUE SÃO DA LINGUAGEM DA TRILHA (fences com tag
 * do adaptador + o campo `code`). Era `blocosJsDaSecao`, com `b.isJavaScript`
 * e `JS_FENCE_TAGS.has(lang)` cravados — quem decide agora é o REGISTRO:
 * `block.adapterId` (posto por `theoryCode.ts` via `adapterIdForTheoryTag`) e
 * `classifyTheoryTag`, a mesma função que o §6 (linha 954) descreve como "quem
 * diz ao extrator qual parser aplicar a cada bloco cercado da teoria".
 */
export function blocosDaSecao(secao: TrackTheorySection, adapterId: LanguageId): string[] {
  const out = blocosFencedDe(secao, adapterId);
  const code = blocoCodeDaSecao(secao, adapterId);
  if (code !== null) out.push(code);
  return out;
}

export interface DemoDaAula {
  /** Demo(i) — TODOS os átomos demonstrados na teoria desta aula. */
  chaves: Set<AtomKey>;
  /** DemoSec1(i) — átomos da PRIMEIRA seção com código. */
  primeiraSecao: Set<AtomKey>;
  /** chave → (índice, título) da primeira seção da PRÓPRIA aula que a demonstra. */
  secaoDe: Map<AtomKey, { index: number; titulo: string }>;
}

/** O título estável de uma seção (title → id → o índice). */
function tituloDaSecao(secao: TrackTheorySection, index: number): string {
  return secao.title ?? secao.id ?? String(index);
}

/** Processa UMA seção acumulando as chaves que ela demonstra. */
function processarSecao(
  secao: TrackTheorySection,
  index: number,
  adapterId: LanguageId,
  acc: DemoDaAula,
): void {
  const chavesDaSecao = new Set<AtomKey>();
  for (const codigo of blocosDaSecao(secao, adapterId)) {
    const r = extractAllOccurrences(codigo, { language: adapterId });
    if (!r.ok) continue; // bloco que não parseia não demonstra nada (mesma régua do budget)
    for (const occ of r.occurrences) chavesDaSecao.add(occ.key);
  }
  for (const k of chavesDaSecao) {
    acc.chaves.add(k);
    if (!acc.secaoDe.has(k)) acc.secaoDe.set(k, { index, titulo: tituloDaSecao(secao, index) });
  }
  // DemoSec1(i) = átomos da PRIMEIRA seção (índice 0) — mesmo que ela não
  // tenha código (fica vazia). A spec §6.1 diz "a primeira seção da teoria
  // de i que tem código", mas o test case §6.5 nº 1 desambigua: "seção 1 sem
  // código, seção 2 com `if`; 1º desafio solução `if` → VIOLA" — se a seção 2
  // contasse como "primeira com código", o `if` estaria permitido e o teste
  // não violaria. Então a seção inicial é a de índice 0, e uma seção de abertura
  // sem código demonstra NADA — que é exatamente o caso do `o-que-e-programacao`
  // real ("1ª seção sem código nenhum; o desafio precisa de if/typeof/...").
  if (index === 0) {
    for (const k of chavesDaSecao) acc.primeiraSecao.add(k);
  }
}

export function demoDaAula(secoes: readonly TrackTheorySection[], adapterId: LanguageId): DemoDaAula {
  const acc: DemoDaAula = {
    chaves: new Set<AtomKey>(),
    primeiraSecao: new Set<AtomKey>(),
    secaoDe: new Map<AtomKey, { index: number; titulo: string }>(),
  };
  secoes.forEach((secao, index) => processarSecao(secao, index, adapterId, acc));
  return acc;
}

/**
 * As CONSTRUÇÕES de uma linha (A14b): as chaves novas da linha COLAPSADAS na
 * granularidade didática — `node:BinaryExpression` colapsa no `op:*` (a
 * construção é o sinal), e a maquinaria da declaração
 * (VariableStatement/VariableDeclarationList/VariableDeclaration) colapsa no
 * `decl:*` (a construção é `let`/`const`/`var`). É a régua que faz o binário
 * de sanidade da spec §4.2 passar (`let x = 1;` = UMA construção) e que
 * reproduz o exemplo medido L5 (`return 'Olá, ' + nome + '!';` =
 * ReturnStatement + op:binary:+ = 2, apesar de DOIS `+` e um nó
 * BinaryExpression — "a contagem é por construção-na-linha, não por chave").
 */
export function construcoesDaLinha(chaves: Iterable<AtomKey>): Set<AtomKey> {
  const construcoes = new Set<AtomKey>();
  for (const k of chaves) {
    if (k === 'node:BinaryExpression') continue; // colapsa no op: binário
    if (k === 'node:VariableStatement' || k === 'node:VariableDeclarationList' || k === 'node:VariableDeclaration') {
      continue; // colapsa no decl: (let/const/var)
    }
    construcoes.add(k);
  }
  return construcoes;
}

export function tamanhoDaInterseccao(a: ReadonlySet<AtomKey>, b: ReadonlySet<AtomKey>): number {
  let n = 0;
  for (const k of a) if (b.has(k)) n += 1;
  return n;
}
