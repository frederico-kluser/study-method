/**
 * app/electron/main/engine/graph/model.ts — o GRAFO DE CONCEITOS da engine de
 * trilhas (`docs/16-engine-de-trilha.md` §3.4).
 *
 * PROBLEMA REAL: o repositório hoje chama a aresta de pré-requisito de
 * `lesson.prerequisites` e a preenche com slugs de AULA — 105 das 134
 * referências violam o contrato — o que torna o grafo inválido por construção:
 * o orçamento cumulativo de uma aula passa a depender de um slug que nenhum
 * conceito conhece. Este módulo reseta: o nó é o CONCEITO (a coisa ensinada),
 * a aula é a unidade de entrega, e eles NÃO podem compartilhar campo.
 *
 * DUAS ARESTAS SEMANTICAMENTE DISTINTAS, campos separados, e conflatá-las é a
 * correção nº 1 em relação ao estado atual:
 *
 *   desbloqueado_por[]  aresta DURA: "não dá para aprender B sem A". Alimenta
 *                       a ordenação topológica e a detecção de salto (dag.ts).
 *   usa[]               linha da Q-matrix: "B exercita A". Alimenta o orçamento
 *                       cumulativo (P-16). Uma aresta dura errada corrompe o
 *                       orçamento de TODOS os descendentes, em silêncio.
 *
 * TYPE CHECK DURO (contract legal, não convenção): todo item das duas arestas
 * é um `ConceptId`, JAMAIS um `lesson.slug`. O `ConceptId` é um BRANDED TYPE —
 * um `string` puro não é atribuível a ele; passar um slug onde se espera um id
 * de conceito é ERRO DE TIPO em tempo de compilação. E a única porta de
 * entrada (`conceptId()`) ainda valida o FORMATO em runtime: id de conceito é
 * snake_case (`variaveis`), slug de aula é kebab-case (`variaveis-const`) — a
 * distinção de formato é mais uma camada anti-confusão.
 *
 * O que este módulo NÃO faz: não ordena (é `dag.ts`), não valida invariantes
 * (é `invariants.ts`) e não modela a aula — o mapeamento dos tipos de produto
 * (trackTypes) é de outra onda (P-16/P-21). O grafo é auto-contido: entra um
 * grafo, sai um grafo.
 */

/** Formato de um id de conceito: snake_case minúsculo (docs/04-proficiencia.md §1). */
export const CONCEPT_ID_RE = /^[a-z][a-z0-9_]{0,62}$/;

/**
 * Id de conceito — `string` com marca de tipo. Um `string` puro (slug de aula
 * incluído) NÃO é atribuível a `ConceptId`: a violação é de tipo, em tempo de
 * compilação, e é exatamente esse o contrato duro da §3.4.
 *
 * A marca é nominal: `type ConceptId = string & { readonly __brand: 'ConceptId' }`.
 */
export type ConceptId = string & { readonly __brand: 'ConceptId' };

/**
 * ÚNICA porta de entrada para um `ConceptId`. Além da marca de tipo (que só
 * existe em tempo de compilação), valida o formato em runtime: id de conceito
 * é snake_case — um slug kebab (`modulo/aula`) é rejeitado AQUI, mesmo que o
 * chamador force o tipo.
 */
export function conceptId(id: string): ConceptId {
  if (!CONCEPT_ID_RE.test(id)) {
    throw new Error(
      `conceptId inválido: ${JSON.stringify(id)} — id de conceito é snake_case (ex.: 'variaveis'); ` +
        `slug de aula (kebab-case) NÃO é ConceptId.`,
    );
  }
  return id as ConceptId;
}

/**
 * Uma FORMA de uma construção já ensinada — `if/else` contra ternário,
 * `FunctionDeclaration` contra `ArrowFunctionExpression`: a mesma ideia em
 * forma nova, e mudar a forma exige aula dedicada (§3.5, I9 e I11).
 */
export interface FormaDaConstrucao {
  /** nome canônico da forma (ex.: 'FunctionDeclaration', 'IfStatement'). */
  nome: string;
  /** complexidade relativa — MENOR = MAIS SIMPLES (I9: primeira aparição é a forma mais simples). */
  complexidade: number;
}

/**
 * Um nó do grafo: a COISA ENSINADA. A aula é outra entidade (VisaoDeEnsino,
 * invariants.ts) — nunca um campo deste nó.
 */
export interface Concept {
  id: ConceptId;

  /** família sintática do conceito (ex.: 'funcao', 'condicional') — usada por I8. */
  familiaSintatica?: string;

  /**
   * formas da construção em ordem de complexidade crescente — usadas por I9/I11.
   * Ausente = o conceito tem uma forma só (nenhuma regra de forma dispara).
   */
  formas?: FormaDaConstrucao[];

  /**
   * aresta DURA (desbloqueado_por): este conceito não pode ser aprendido sem
   * estes. Alimenta a ordenação topológica (dag.ts).
   */
  desbloqueadoPor: ConceptId[];

  /**
   * aresta da Q-matrix (usa): este conceito EXERCITA estes — a linha do
   * orçamento cumulativo. Alimenta o orçamento (P-16), NUNCA a ordem.
   */
  usa: ConceptId[];
}

/** O grafo de conceitos de uma trilha — auto-contido (conceitos + as duas arestas). */
export interface ConceptGraph {
  conceitos: Concept[];
}