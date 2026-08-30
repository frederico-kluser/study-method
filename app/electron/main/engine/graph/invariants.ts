/**
 * app/electron/main/engine/graph/invariants.ts — INVARIANTES DE ESTRUTURA
 * I1 a I11 (`docs/16-engine-de-trilha.md` §5.2).
 *
 * Rodam ANTES de existir uma linha de prosa: o que elas verificam é a FORMA do
 * currículo (grafo + ordem de aulas + metadados mínimos), não o texto. Uma
 * trilha que viola I1-I11 não merece ter prosa escrita sobre ela.
 *
 * A ÚNICA função pública é `checkInvariants` — PURA: entra grafo (+ metadados
 * mínimos em `VisaoDeEnsino`), sai lista de violações tipadas. Nenhum IO,
 * nenhum disco, nenhuma rede, nenhum LLM — determinística.
 *
 * SOBRE A ENTRADA MÍNIMA (VisaoDeEnsino): o grafo conhece conceitos e arestas;
 * as invariantes I2-I11 precisam de dados de AULA que o grafo, por decisão do
 * modelo, não tem (a aula é outra entidade — P-16/P-21). Quem monta a visão
 * (a onda de orçamento) resolve: aula → conceitos introduzidos/exercitados,
 * exigências do desafio, artefatos, formas apresentadas, orçamento vigente.
 * `checkInvariants` apenas CONSUME — nunca deriva: a derivação do orçamento
 * (entrada ∪ fecho-para-baixo ∪ introduces) é da F4/P-10
 * (`phases/f4Budget.ts::deriveBudgetDoGrafo`), e a visão é MONTADA pela
 * F3/P-16 consumindo o orçamento (NÃO re-deriva; orcamentoVigente =
 * budget_saida.receptive ∪ budget_saida.productive — ver `phases/f3Graph.ts`).
 *
 * AS ONZE:
 *   I1  o grafo é um DAG e todo referenciado existe (arestas duras E da Q-matrix);
 *   I2  introduces.productive tem no máximo 2 itens em toda aula;
 *   I3  nenhuma construção é introduzida por duas aulas (unicidade de origem);
 *   I4  toda construção usada tem aula de origem, e ela NÃO vem depois (ordem);
 *   I5  construção introduzida aparece em ≥1 exemplo da teoria da própria aula;
 *   I6  construção introduzida é exigida no desafio da própria aula;
 *   I7  construção introduzida reaparece em ≥3 artefatos POSTERIORES;
 *   I8  não há 3 aulas consecutivas da mesma família sintática (interleaving);
 *   I9  a primeira aparição é a forma mais simples (FunctionDeclaration antes de arrow);
 *   I10 toda aula tem ≥1 desafio resolvível apenas com o orçamento vigente;
 *   I11 mudar a FORMA de construção já ensinada exige aula dedicada.
 */

import { toposort } from './dag';
import type { ConceptGraph, ConceptId } from './model';

/** as invariantes de estrutura implementadas aqui (I12-I17 vivem em audit.ts). */
export type InvarianteId = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8' | 'I9' | 'I10' | 'I11';

/** uma violação encontrada por `checkInvariants`. */
export interface ViolacaoEstrutural {
  invariante: InvarianteId;
  /** o que foi violado, em prosa curta e acionável. */
  mensagem: string;
  /** conceitos (ConceptId marcado) e/ou aulas (refs de aula) envolvidos. */
  refs: Array<ConceptId | string>;
}

/**
 * Uma forma apresentada por uma aula: a aula apresentou a forma `forma` da
 * construção `construcao` (ex.: construcao 'funcoes', forma
 * 'ArrowFunctionExpression'). Alimenta I9 e I11.
 */
export interface FormaApresentada {
  construcao: ConceptId;
  forma: string;
}

/**
 * Uma aula na visão de ensino — os metadados MÍNIMOS que as invariantes I2-I11
 * consomem. A posição no array `aulas` É a ordem de ensino (topológica): I4,
 * I7, I8, I9, I10 e I11 comparam índices.
 */
export interface AulaNaVisao {
  /** ref da aula (ex.: '<modulo>/<aula>') — usada nas mensagens e refs. */
  ref: string;

  /** família sintática da aula (ex.: 'funcao') — I8. Resolvida pelo builder a partir do conceito principal. */
  familiaSintatica?: string | null;

  /** construções introduzidas no PRODUTIVO por esta aula (introduces.productive) — I2, I3, I4, I5, I6, I7. */
  introduces: ConceptId[];

  /** construções que esta aula EXERCITA (linha da Q-matrix) — I4. */
  usa: ConceptId[];

  /** cada item = UM exemplo da teoria da aula; itens internos = construções que aparecem nele — I5. */
  teoriaExemplos: ConceptId[][];

  /** cada item = UM desafio da aula; itens internos = construções que ele exige — I6, I10. */
  desafios: ConceptId[][];

  /** cada item = UM artefato da aula (starter, solução, exemplo…) — I7. */
  artefatos: ConceptId[][];

  /** formas apresentadas nesta aula — I9, I11. Preencher quando a construção tiver mais de uma forma. */
  formasApresentadas?: FormaApresentada[];

  /**
   * orçamento vigente para o desafio desta aula (o que o aluno tem direito de
   * usar) — I10. Dado de entrada (a derivação real — entrada ∪ fecho-para-baixo
   * ∪ introduces — é da F4/P-10, `deriveBudgetDoGrafo`; a F3/P-16 monta a visão
   * com orcamentoVigente = budget_saida.receptive ∪ budget_saida.productive).
   * Ausente = não verificável = violação (fail-closed).
   */
  orcamentoVigente?: ConceptId[];
}

/**
 * A visão de ensino: aulas na ORDEM de ensino + construções do axioma de
 * entrada (as que não precisam de aula de origem — ex.: harness, I4 e I10).
 */
export interface VisaoDeEnsino {
  /** aulas na ordem de ensino — posição no array = ordem (topológica). */
  aulas: AulaNaVisao[];
  /** construções do axioma de entrada (não precisam de aula de origem) — I4, I10. */
  construcoesDeEntrada?: ConceptId[];
}

// ─── utilitários internos ────────────────────────────────────────────────────

function viol(invariante: InvarianteId, mensagem: string, refs: Array<ConceptId | string>): ViolacaoEstrutural {
  return { invariante, mensagem, refs };
}

function formaDeConstrucao(grafo: ConceptGraph): Map<ConceptId, Map<string, number>> {
  const nomes = new Map<ConceptId, Map<string, number>>();
  for (const conceito of grafo.conceitos) {
    const mapa = new Map<string, number>();
    for (const f of conceito.formas ?? []) mapa.set(f.nome, f.complexidade);
    nomes.set(conceito.id, mapa);
  }
  return nomes;
}

function complexidadeDaForma(
  registros: Map<ConceptId, Map<string, number>>,
  construcao: ConceptId,
  forma: string,
): number {
  // forma não declarada no grafo = complexidade desconhecida → trata como a
  // MAIS complexa (fail-closed: nunca esconde que existe forma mais simples).
  return registros.get(construcao)?.get(forma) ?? Number.MAX_SAFE_INTEGER;
}

// ─── as onze invariantes ─────────────────────────────────────────────────────

function checkI1(grafo: ConceptGraph): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  const resultado = toposort(grafo);

  if (!resultado.ok) {
    if (resultado.falha === 'ciclo') {
      saida.push(
        viol(
          'I1',
          `o grafo não é um DAG: ciclo ${resultado.ciclo.join(' → ')} (${resultado.ciclo.length - 1} arestas fechando o ciclo)`,
          resultado.ciclo,
        ),
      );
    } else if (resultado.falha === 'referencia-inexistente') {
      saida.push(
        viol(
          'I1',
          `desbloqueado_por referencia conceito que não existe: ${resultado.refs.join(', ')}`,
          resultado.refs,
        ),
      );
    } else {
      saida.push(
        viol('I1', `grafo inválido: ids duplicados em conceitos: ${resultado.ids.join(', ')}`, resultado.ids),
      );
    }
  }

  // A Q-matrix também precisa apontar para conceitos existentes — uma aresta
  // `usa` órfã corrompe o orçamento de todos os descendentes, em silêncio.
  const existentes = new Set(grafo.conceitos.map((c) => c.id));
  for (const conceito of grafo.conceitos) {
    for (const alvo of conceito.usa) {
      if (!existentes.has(alvo)) {
        saida.push(
          viol('I1', `usa referencia conceito que não existe: ${alvo} (em ${conceito.id})`, [conceito.id, alvo]),
        );
      }
    }
  }
  return saida;
}

function checkI2(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  for (const aula of visao.aulas) {
    if (aula.introduces.length > 2) {
      saida.push(
        viol(
          'I2',
          `'${aula.ref}' introduz ${aula.introduces.length} construções produtivas — máximo é 2`,
          [aula.ref, ...aula.introduces],
        ),
      );
    }
  }
  return saida;
}

function checkI3(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  const origem = new Map<ConceptId, string>();
  for (const aula of visao.aulas) {
    for (const construcao of aula.introduces) {
      const anterior = origem.get(construcao);
      if (anterior !== undefined) {
        saida.push(
          viol(
            'I3',
            `'${construcao}' é introduzida por duas aulas: '${anterior}' e '${aula.ref}' — unicidade de origem`,
            [construcao, anterior, aula.ref],
          ),
        );
      } else {
        origem.set(construcao, aula.ref);
      }
    }
  }
  return saida;
}

function checkI4(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  const entrada = new Set(visao.construcoesDeEntrada ?? []);

  // origem de cada construção: primeira aula que a introduz.
  const origem = new Map<ConceptId, { ref: string; indice: number }>();
  visao.aulas.forEach((aula, indice) => {
    for (const construcao of aula.introduces) {
      if (!origem.has(construcao)) origem.set(construcao, { ref: aula.ref, indice });
    }
  });

  visao.aulas.forEach((aula, indice) => {
    for (const construcao of aula.usa) {
      if (entrada.has(construcao)) continue; // axioma de entrada não precisa de aula
      const o = origem.get(construcao);
      if (o === undefined) {
        saida.push(
          viol('I4', `'${aula.ref}' usa '${construcao}', que não tem aula de origem em lugar nenhum`, [
            construcao,
            aula.ref,
          ]),
        );
      } else if (o.indice > indice) {
        saida.push(
          viol(
            'I4',
            `'${aula.ref}' usa '${construcao}', mas a aula de origem ('${o.ref}') vem DEPOIS na ordem de ensino`,
            [construcao, aula.ref, o.ref],
          ),
        );
      }
      // origem na MESMA aula é permitida: a aula que introduz também exercita (I6).
    }
  });
  return saida;
}

function checkI5(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  for (const aula of visao.aulas) {
    for (const construcao of aula.introduces) {
      const aparece = aula.teoriaExemplos.some((exemplo) => exemplo.includes(construcao));
      if (!aparece) {
        saida.push(
          viol(
            'I5',
            `'${construcao}' é introduzida em '${aula.ref}' mas não aparece em NENHUM exemplo da teoria da própria aula`,
            [construcao, aula.ref],
          ),
        );
      }
    }
  }
  return saida;
}

function checkI6(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  for (const aula of visao.aulas) {
    for (const construcao of aula.introduces) {
      const exigida = aula.desafios.some((desafio) => desafio.includes(construcao));
      if (!exigida) {
        saida.push(
          viol('I6', `'${construcao}' é introduzida em '${aula.ref}' mas não é exigida em NENHUM desafio da aula`, [
            construcao,
            aula.ref,
          ]),
        );
      }
    }
  }
  return saida;
}

function checkI7(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  visao.aulas.forEach((aula, indice) => {
    for (const construcao of aula.introduces) {
      let reaparicoes = 0;
      for (let j = indice + 1; j < visao.aulas.length; j++) {
        for (const artefato of visao.aulas[j].artefatos) {
          if (artefato.includes(construcao)) reaparicoes++;
        }
      }
      if (reaparicoes < 3) {
        saida.push(
          viol(
            'I7',
            `'${construcao}' introduzida em '${aula.ref}' reaparece em apenas ${reaparicoes} artefato(s) posterior(es) — mínimo 3`,
            [construcao, aula.ref],
          ),
        );
      }
    }
  });
  return saida;
}

function checkI8(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  const aulas = visao.aulas;
  for (let i = 0; i + 2 < aulas.length; i++) {
    const familia = aulas[i].familiaSintatica;
    if (familia == null) continue;
    if (aulas[i + 1].familiaSintatica !== familia || aulas[i + 2].familiaSintatica !== familia) continue;
    saida.push(
      viol(
        'I8',
        `3 aulas consecutivas da mesma família sintática '${familia}': '${aulas[i].ref}', '${aulas[i + 1].ref}', '${aulas[i + 2].ref}' (interleaving)`,
        [aulas[i].ref, aulas[i + 1].ref, aulas[i + 2].ref],
      ),
    );
  }
  return saida;
}

function checkI9(grafo: ConceptGraph, visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  const registros = formaDeConstrucao(grafo);

  // agrupa as apresentações por construção: [(indiceDaAula, forma)]
  const apresentacoes = new Map<ConceptId, Array<{ indice: number; forma: string; ref: string }>>();
  visao.aulas.forEach((aula, indice) => {
    for (const apresentada of aula.formasApresentadas ?? []) {
      const lista = apresentacoes.get(apresentada.construcao) ?? [];
      lista.push({ indice, forma: apresentada.forma, ref: aula.ref });
      apresentacoes.set(apresentada.construcao, lista);
    }
  });

  for (const [construcao, lista] of apresentacoes) {
    const complexidades = lista.map((p) => ({
      ...p,
      complexidade: complexidadeDaForma(registros, construcao, p.forma),
    }));
    const primeiraIndice = Math.min(...complexidades.map((p) => p.indice));
    const naPrimeira = complexidades.filter((p) => p.indice === primeiraIndice);
    const minPrimeira = Math.min(...naPrimeira.map((p) => p.complexidade));
    const minGeral = Math.min(...complexidades.map((p) => p.complexidade));

    if (minGeral < minPrimeira) {
      const maisSimples = complexidades.find((p) => p.complexidade === minGeral && p.indice > primeiraIndice);
      saida.push(
        viol(
          'I9',
          `a primeira aparição de '${construcao}' (em '${naPrimeira[0].ref}') não é a forma mais simples: a forma '${maisSimples?.forma ?? '?'}' (mais simples, complexidade ${minGeral}) só aparece depois`,
          [construcao, naPrimeira[0].ref, ...(maisSimples ? [maisSimples.ref] : [])],
        ),
      );
    }
  }
  return saida;
}

function checkI10(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];
  for (const aula of visao.aulas) {
    if (aula.orcamentoVigente === undefined) {
      saida.push(
        viol('I10', `'${aula.ref}' não declara orçamento vigente — impossível provar que há desafio resolvível`, [
          aula.ref,
        ]),
      );
      continue;
    }
    const orcamento = new Set(aula.orcamentoVigente);
    const resolvivel = aula.desafios.some((desafio) => desafio.every((c) => orcamento.has(c)));
    if (!resolvivel) {
      saida.push(
        viol(
          'I10',
          `'${aula.ref}' não tem NENHUM desafio resolvível apenas com o orçamento vigente (${[...orcamento].join(', ') || 'vazio'})`,
          [aula.ref],
        ),
      );
    }
  }
  return saida;
}

function checkI11(visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  const saida: ViolacaoEstrutural[] = [];

  // TODAS as apresentações de cada construção, com o índice da aula — a
  // "já ensinada" de I11 é a que veio de uma aula ANTERIOR (mudar a forma DENTRO
  // da mesma aula não é mudar o que já foi ensinado).
  const apresentacoes = new Map<ConceptId, Array<{ indice: number; forma: string }>>();
  visao.aulas.forEach((aula, indice) => {
    for (const apresentada of aula.formasApresentadas ?? []) {
      const lista = apresentacoes.get(apresentada.construcao) ?? [];
      lista.push({ indice, forma: apresentada.forma });
      apresentacoes.set(apresentada.construcao, lista);
    }
  });

  visao.aulas.forEach((aula, indice) => {
    const pares = aula.formasApresentadas ?? [];
    for (const apresentada of pares) {
      const anteriores = new Set<string>();
      for (const p of apresentacoes.get(apresentada.construcao) ?? []) {
        if (p.indice < indice) anteriores.add(p.forma);
      }
      const mudancaDeForma = anteriores.size > 0 && !anteriores.has(apresentada.forma);
      if (mudancaDeForma && pares.length !== 1) {
        saida.push(
          viol(
            'I11',
            `'${aula.ref}' muda a forma de '${apresentada.construcao}' para '${apresentada.forma}' dentro de uma aula que apresenta ${pares.length} formas — mudança de forma exige AULA DEDICADA`,
            [apresentada.construcao, aula.ref],
          ),
        );
      }
    }
  });
  return saida;
}

/**
 * Roda TODAS as invariantes I1-I11 sobre o grafo + visão de ensino.
 *
 * PURA e determinística: entra grafo (+ metadados mínimos), sai a lista de
 * violações. Sem IO. Fail-closed: dado ausente (orçamento, por ex.) é
 * violação, nunca silêncio.
 */
export function checkInvariants(grafo: ConceptGraph, visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  return [
    ...checkI1(grafo),
    ...checkI2(visao),
    ...checkI3(visao),
    ...checkI4(visao),
    ...checkI5(visao),
    ...checkI6(visao),
    ...checkI7(visao),
    ...checkI8(visao),
    ...checkI9(grafo, visao),
    ...checkI10(visao),
    ...checkI11(visao),
  ];
}