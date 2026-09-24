/**
 * app/electron/main/engine/quality/barraGrupos.ts — o que a aula ACRESCENTA
 * (novas produtivas/colapsadas) e os GRUPOS da regra do par medidos no disco
 * (união-find sobre co-ocorrência de linha).
 *
 * A prosa normativa vive na fachada `barra.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import type { LessonBudget } from '../budget';

/** O que a aula acrescenta de fato: o declarado MENOS o que já estava na entrada. */
export function novasDa(orcamento: LessonBudget): { produtivas: AtomKey[]; todas: AtomKey[] } {
  const produtivas = orcamento.introduces.productive.filter((k) => !orcamento.entrada.productive.has(k));
  const receptivas = orcamento.introduces.receptive.filter((k) => !orcamento.entrada.receptive.has(k));
  const todas = [...new Set([...produtivas, ...receptivas])].sort();
  return { produtivas, todas };
}

/**
 * O COLAPSO pela regra do par: remove do conjunto as chaves declaradas como
 * derivadas VÁLIDAS (A23 já reprovou as inválidas, e elas seguem contando).
 */
export function colapsar(chaves: readonly AtomKey[], derivadasValidas: ReadonlySet<AtomKey>): AtomKey[] {
  return chaves.filter((k) => !derivadasValidas.has(k));
}

/** União-find: a raiz da chave (com compressão de caminho iterativa). */
function raizDe(
  k: AtomKey,
  pai: Map<AtomKey, AtomKey>,
): AtomKey {
  let atual = k;
  while (pai.get(atual) !== atual) atual = pai.get(atual)!;
  return atual;
}

/** Duas chaves co-ocorrem em alguma linha comum? */
function coocorrem(
  a: AtomKey,
  b: AtomKey,
  linhasPorChave: ReadonlyMap<AtomKey, ReadonlySet<string>>,
): boolean {
  const la = linhasPorChave.get(a);
  const lb = linhasPorChave.get(b);
  if (la === undefined || lb === undefined) return false;
  return [...la].some((linha) => lb.has(linha));
}

/** Une as chaves que co-ocorrem em alguma linha (união-find sobre o par). */
function unirCoocorrencias(
  ordenadas: readonly AtomKey[],
  linhasPorChave: ReadonlyMap<AtomKey, ReadonlySet<string>>,
  pai: Map<AtomKey, AtomKey>,
): void {
  for (let i = 0; i < ordenadas.length; i += 1) {
    for (let j = i + 1; j < ordenadas.length; j += 1) {
      const a = ordenadas[i];
      const b = ordenadas[j];
      if (!coocorrem(a, b, linhasPorChave)) continue;
      const ra = raizDe(a, pai);
      const rb = raizDe(b, pai);
      if (ra !== rb) pai.set(ra, rb);
    }
  }
}

/** Agrupa as chaves ordenadas pela raiz — a saída é estável e determinística. */
function montarGrupos(
  ordenadas: readonly AtomKey[],
  pai: Map<AtomKey, AtomKey>,
): AtomKey[][] {
  const porRaiz = new Map<AtomKey, AtomKey[]>();
  for (const k of ordenadas) {
    const r = raizDe(k, pai);
    if (!porRaiz.has(r)) porRaiz.set(r, []);
    porRaiz.get(r)!.push(k);
  }
  return [...porRaiz.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Agrupa as chaves novas por CO-OCORRÊNCIA DE LINHA — a regra do par medida no
 * disco, sem declaração nenhuma (ver `MetricaDaBarra.grupos`).
 *
 * É união-find sobre "existe uma linha de bloco desta aula em que as duas
 * ocorrem": duas chaves que sempre aparecem juntas na mesma linha são a MESMA
 * construção para quem está aprendendo. Chave sem demonstração vira grupo
 * unitário (A19 já a reprovou; o planejador da quebra precisa dela na conta).
 *
 * PURA e determinística: a ordem de saída é a das chaves ordenadas.
 */
export function agruparPorLinha(
  chaves: readonly AtomKey[],
  linhasPorChave: ReadonlyMap<AtomKey, ReadonlySet<string>>,
): AtomKey[][] {
  const pai = new Map<AtomKey, AtomKey>();
  for (const k of chaves) pai.set(k, k);
  const ordenadas = [...chaves].sort();
  unirCoocorrencias(ordenadas, linhasPorChave, pai);
  return montarGrupos(ordenadas, pai);
}
