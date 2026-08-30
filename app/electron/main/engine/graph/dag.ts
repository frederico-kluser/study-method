/**
 * app/electron/main/engine/graph/dag.ts — ORDENAÇÃO TOPOLÓGICA do grafo de
 * conceitos (`docs/16-engine-de-trilha.md` §3.4) + PODA POR FECHO TRANSITIVO.
 *
 * A ordem topológica de um DAG NÃO é única. Sem um critério EXPLÍCITO de
 * desempate, a engine reproduziria o macro-blocking atual (a ordem em que o
 * autor escreveu o conteúdo) sem nunca dizer que a escolheu — e duas execuções
 * poderiam divergir. Este módulo resolve com KAHN + critério declarado e
 * GRAVA a linearização escolhida e o critério que a produziu. ESTÁVEL: mesma
 * entrada → mesma linearização, sempre (determinístico).
 *
 * Direção das arestas: `B.desbloqueadoPor = [A]` significa "B não existe sem A"
 * → aresta A → B → A vem antes de B na ordenação.
 *
 * FAIL-CLOSED: ciclo é detectado e reportado COM O CAMINHO do ciclo; referência
 * a conceito inexistente é falha (não silêncio); id duplicado é falha.
 * Nó órfão (sem aresta nenhuma) é REPORTADO na saída válida.
 *
 * fechoTransitivoRedundante: identifica arestas desbloqueado_por que são
 * REDUNDANTES por fecho transitivo (há caminho alternativo de comprimento ≥ 2).
 * DECLARAÇÃO: é VISÃO DE RENDERIZAÇÃO, NUNCA armazenamento — no track JS da
 * Exercism, 44 de 90 arestas declaradas são transitivamente redundantes e cada
 * uma tem justificativa própria. A poda só reduz perguntas de julgamento (o
 * revisor não precisa julgar a redundante); as arestas FICAM no grafo
 * armazenado. Nada aqui remove nada — retorna a lista.
 */

import type { Concept, ConceptGraph, ConceptId } from './model';

/**
 * Critério de desempate do Kahn, gravado no resultado. A ordenação topológica
 * só é reprodutível se o critério for parte do CONTRATO, não um detalhe.
 */
export type CriterioOrdenacao =
  /** a cada passo, entre os nós prontos, escolhe o menor id (ordem lexicográfica). */
  | 'ordem-lexicografica-por-id'
  /** a cada passo, escolhe o nó que vem primeiro no array `conceitos` da entrada. */
  | 'ordem-declarada'
  /** desempate fornecido pelo chamador (via opcoes.comparador). */
  | 'customizado';

export interface ToposortOpcoes {
  /** critério nomeado; default: `ordem-lexicografica-por-id`. */
  criterio?: Exclude<CriterioOrdenacao, 'customizado'>;
  /**
   * desempate customizado (aplica-se dentro dos nós prontos). Grava
   * `criterio: 'customizado'` no resultado. Empates residuais do comparador
   * caem para ordem lexicográfica — determinismo nunca é opcional.
   */
  comparador?: (a: ConceptId, b: ConceptId) => number;
}

export interface ToposortOk {
  ok: true;
  /** linearização escolhida, do início ao fim da trilha. */
  ordem: ConceptId[];
  /** o critério que produziu ESTA linearização. */
  criterio: CriterioOrdenacao;
  /** nós sem NENHUMA aresta (nem recebida, nem emitida) — órfãos do grafo. */
  orfaos: ConceptId[];
}

export interface ToposortFalhaCiclo {
  ok: false;
  falha: 'ciclo';
  /** o caminho do ciclo fechado: ordem[0] → ordem[1] → … → ordem[n-1] → ordem[0]. */
  ciclo: ConceptId[];
  criterio: CriterioOrdenacao;
}

export interface ToposortFalhaReferencia {
  ok: false;
  falha: 'referencia-inexistente';
  /** ids referenciados em arestas mas ausentes de `conceitos`. */
  refs: ConceptId[];
  criterio: CriterioOrdenacao;
}

export interface ToposortFalhaDuplicado {
  ok: false;
  falha: 'ids-duplicados';
  /** ids que aparecem mais de uma vez em `conceitos`. */
  ids: ConceptId[];
  criterio: CriterioOrdenacao;
}

export type ResultadoToposort =
  | ToposortOk
  | ToposortFalhaCiclo
  | ToposortFalhaReferencia
  | ToposortFalhaDuplicado;

/** Aresta `origem → destino` redundante por fecho transitivo, com a prova. */
export interface ArestaRedundante {
  origem: ConceptId;
  destino: ConceptId;
  /** caminho alternativo origem → … → destino (comprimento ≥ 2) que torna a aresta redundante. */
  caminho: ConceptId[];
}

/** `B.desbloqueadoPor = [A]` quer dizer aresta A → B ("A desbloqueia B"). */
function grafoArestas(grafo: ConceptGraph): { origem: ConceptId; destino: ConceptId }[] {
  const arestas: { origem: ConceptId; destino: ConceptId }[] = [];
  for (const conceito of grafo.conceitos) {
    for (const pre of conceito.desbloqueadoPor) {
      arestas.push({ origem: pre, destino: conceito.id });
    }
  }
  return arestas;
}

/**
 * Ordenação topológica (Kahn) com desempate explícito e DETERMINÍSTICO.
 *
 * PURO: mesma entrada + mesmas opções → mesmo resultado. Não lê disco, não vai
 * à rede, não chama LLM.
 *
 * Saídas:
 *  - ok:true  → `ordem` (a linearização), `criterio` (como foi escolhida) e
 *               `orfaos` (nós sem aresta nenhuma).
 *  - ok:false → a razão exata: ciclo (COM o caminho), referência a conceito
 *               inexistente, ou id duplicado. Fail-closed: nunca um DAG
 *               aparente com bug escondido.
 */
export function toposort(grafo: ConceptGraph, opcoes: ToposortOpcoes = {}): ResultadoToposort {
  const criterioNomeado = opcoes.criterio ?? 'ordem-lexicografica-por-id';
  const criterio: CriterioOrdenacao = opcoes.comparador ? 'customizado' : criterioNomeado;

  // ── validação de entrada (fail-closed) ─────────────────────────────────────
  const visto = new Set<ConceptId>();
  const duplicados: ConceptId[] = [];
  for (const c of grafo.conceitos) {
    if (visto.has(c.id)) duplicados.push(c.id);
    visto.add(c.id);
  }
  if (duplicados.length > 0) return { ok: false, falha: 'ids-duplicados', ids: [...new Set(duplicados)], criterio };

  const arcos: { origem: ConceptId; destino: ConceptId }[] = grafoArestas(grafo);
  const refsAusentes: ConceptId[] = [];
  for (const arco of arcos) {
    const alvo = arco.origem; // quem desbloqueia precisa existir como conceito
    if (!visto.has(alvo)) refsAusentes.push(alvo);
  }
  if (refsAusentes.length > 0) {
    return { ok: false, falha: 'referencia-inexistente', refs: [...new Set(refsAusentes)], criterio };
  }

  // ── índices para os critérios de desempate ─────────────────────────────────
  const declaracao: Map<ConceptId, number> = new Map();
  grafo.conceitos.forEach((c, i) => declaracao.set(c.id, i));
  const lex = (a: ConceptId, b: ConceptId) => (a < b ? -1 : a > b ? 1 : 0);

  // ── Kahn ───────────────────────────────────────────────────────────────────
  // grau de entrada: quantos desbloqueadores A→B ainda precisam sair antes de B.
  const indegree: Map<ConceptId, number> = new Map();
  for (const c of grafo.conceitos) {
    indegree.set(c.id, new Set(c.desbloqueadoPor).size);
  }

  // saídas: X → [Y, …] onde Y.desbloqueadoPor contém X.
  const saida: Map<ConceptId, ConceptId[]> = new Map();
  for (const c of grafo.conceitos) saida.set(c.id, []);
  for (const c of grafo.conceitos) {
    for (const pre of c.desbloqueadoPor) {
      const alvo = saida.get(pre);
      if (alvo) alvo.push(c.id);
    }
  }

  const prontos: ConceptId[] = [];
  for (const [id, grau] of indegree) {
    if (grau === 0) prontos.push(id);
  }

  const ordem: ConceptId[] = [];
  const comparar = (a: ConceptId, b: ConceptId): number => {
    if (opcoes.comparador) {
      const cmp = opcoes.comparador(a, b);
      if (cmp !== 0) return cmp;
      return lex(a, b); // empate residual → determinismo
    }
    if (criterioNomeado === 'ordem-declarada') {
      return (declaracao.get(a) ?? 0) - (declaracao.get(b) ?? 0);
    }
    return lex(a, b);
  };

  while (prontos.length > 0) {
    prontos.sort(comparar);
    const atual = prontos.shift() as ConceptId;
    ordem.push(atual);
    for (const vizinho of saida.get(atual) ?? []) {
      const grau = (indegree.get(vizinho) ?? 0) - 1;
      indegree.set(vizinho, grau);
      if (grau === 0) prontos.push(vizinho);
    }
  }

  if (ordem.length < grafo.conceitos.length) {
    return { ok: false, falha: 'ciclo', ciclo: caminhoDoCiclo(saida, sobra(ordem, indegree)), criterio };
  }

  // ── órfãos: sem aresta recebida E sem aresta emitida ───────────────────────
  const semEntrada = new Set(ordem.filter((id) => new Set((grafo.conceitos.find((c) => c.id === id)?.desbloqueadoPor ?? [])).size === 0));
  const orfaos: ConceptId[] = [];
  for (const c of grafo.conceitos) {
    const temSaida = (saida.get(c.id) ?? []).length > 0;
    if (semEntrada.has(c.id) && !temSaida) orfaos.push(c.id);
  }
  orfaos.sort(lex);

  return { ok: true, ordem, criterio, orfaos };
}

/** nós que o Kahn não conseguiu ordenar (só existem no caso ciclo). */
function sobra(ordenados: ConceptId[], indegree: Map<ConceptId, number>): ConceptId[] {
  return [...indegree.keys()].filter((id) => !ordenados.includes(id));
}

/**
 * Caminho do ciclo a partir de um nó da sobra. Determinístico: começa pelo
 * menor id e visita vizinhos em ordem lexicográfica, então o caminho é sempre
 * o mesmo para a mesma entrada.
 */
function caminhoDoCiclo(saida: Map<ConceptId, ConceptId[]>, sobra: ConceptId[]): ConceptId[] {
  const inicio = [...sobra].sort()[0] as ConceptId;
  const pilha: ConceptId[] = [];
  const visitado = new Set<ConceptId>();

  const busca = (no: ConceptId): ConceptId[] | null => {
    const naPilha = pilha.indexOf(no);
    if (naPilha >= 0) return [...pilha.slice(naPilha), no];
    if (visitado.has(no)) return null;
    pilha.push(no);
    visitado.add(no);
    const vizinhos = [...(saida.get(no) ?? [])].sort();
    for (const vizinho of vizinhos) {
      const ciclo = busca(vizinho);
      if (ciclo) return ciclo;
    }
    pilha.pop();
    return null;
  };

  return busca(inicio) ?? [inicio];
}

/**
 * PODA POR FECHO TRANSITIVO — VISÃO DE RENDERIZAÇÃO, NUNCA ARMAZENAMENTO.
 *
 * Identifica as arestas `desbloqueadoPor` que são transitivamente redundantes:
 * `origem → destino` onde `destino` já é alcançável de `origem` por um caminho
 * de comprimento ≥ 2 (há caminho alternativo provando que a ordem não depende
 * daquela aresta). Para cada uma, devolve o CAMINHO ALTERNATIVO como prova.
 *
 * A função é PURO e NÃO MUTA o grafo: as arestas redundantes FICAM no grafo
 * armazenado (no track JS da Exercism, 44 de 90 arestas declaradas são
 * redundantes e cada uma tem justificativa própria — removê-las perderia
 * informação). A poda só reduz perguntas de julgamento na revisão de arestas
 * (P-16): a aresta com caminho alternativo não precisa ser re-julgada — a sem
 * caminho, sim.
 */
export function fechoTransitivoRedundante(grafo: ConceptGraph): ArestaRedundante[] {
  const arcos = grafoArestas(grafo);

  // derivado do mesmo grafo — garante consistência com toposort.
  const saida = saidasDoGrafo(grafo);

  const redundantes: ArestaRedundante[] = [];
  for (const arco of arcos) {
    // redundante ⟺ o destino continua alcançável SEM esta aresta. A aresta da
    // vez é PODADA do BFS; se houver caminho alternativo, ele aparece.
    const pais = alcanceSemAresta(saida, arco.origem, arco);
    const alcancou = pais.get(arco.destino);
    if (alcancou === undefined) continue; // a aresta é NECESSÁRIA — não poda
    const caminho = reconstroiCaminho(pais, arco.origem, arco.destino);
    redundantes.push({ origem: arco.origem, destino: arco.destino, caminho });
  }

  // ordem determinística (os ids falam por si)
  redundantes.sort((a, b) => {
    const porOrigem = a.origem < b.origem ? -1 : a.origem > b.origem ? 1 : 0;
    if (porOrigem !== 0) return porOrigem;
    return a.destino < b.destino ? -1 : a.destino > b.destino ? 1 : 0;
  });
  return redundantes;
}

/** vizinhança de saída X → [Y, …] onde Y.desbloqueadoPor contém X. */
function saidasDoGrafo(grafo: ConceptGraph): Map<ConceptId, ConceptId[]> {
  const saida: Map<ConceptId, ConceptId[]> = new Map();
  for (const c of grafo.conceitos) saida.set(c.id, []);
  for (const c of grafo.conceitos) {
    for (const pre of c.desbloqueadoPor) {
      saida.get(pre)?.push(c.id);
    }
  }
  return saida;
}

/**
 * BFS de `origem` que NÃO atravessa a aresta bloqueada — responde "o destino
 * ainda é alcançável se esta aresta sumir?". Devolve o mapa de pais (nó → nó
 * anterior no caminho mais curto) para reconstruir a prova.
 */
function alcanceSemAresta(
  saida: Map<ConceptId, ConceptId[]>,
  origem: ConceptId,
  bloqueada: { origem: ConceptId; destino: ConceptId },
): Map<ConceptId, ConceptId> {
  const pai = new Map<ConceptId, ConceptId>();
  const fila: ConceptId[] = [origem];
  while (fila.length > 0) {
    const atual = fila.shift() as ConceptId;
    for (const vizinho of saida.get(atual) ?? []) {
      if (atual === bloqueada.origem && vizinho === bloqueada.destino) continue; // aresta podada
      if (vizinho === origem) continue; // não volta à raiz (evita laço de 2)
      if (pai.has(vizinho)) continue;
      pai.set(vizinho, atual);
      fila.push(vizinho);
    }
  }
  return pai;
}

/** reconstrói o caminho origem → … → destino a partir do mapa de pais. */
function reconstroiCaminho(pai: Map<ConceptId, ConceptId>, origem: ConceptId, destino: ConceptId): ConceptId[] {
  const caminho: ConceptId[] = [];
  let atual: ConceptId | undefined = destino;
  while (atual !== undefined && atual !== origem) {
    caminho.push(atual);
    atual = pai.get(atual);
  }
  if (atual !== origem) return [origem, destino]; // não deveria ocorrer — alcance já provou o caminho
  caminho.push(origem);
  return caminho.reverse();
}