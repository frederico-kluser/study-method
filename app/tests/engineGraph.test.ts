/**
 * tests/engineGraph.test.ts — pacote P-08: grafo de conceitos (tipos + DAG +
 * invariantes I1-I11) da engine de trilhas (`docs/16-engine-de-trilha.md` §3.4
 * e §5.2).
 *
 * O que este arquivo PROVA:
 *   - TYPE CHECK DURO: passar um slug de aula onde se espera ConceptId é ERRO
 *     DE TIPO. O `@ts-expect-error` aqui NÃO é enfeite: `npm run lint` roda
 *     `tsc` sobre `tests/`, e um `@ts-expect-error` numa linha que NÃO dá erro
 *     quebra o build — ou seja, este arquivo só compila se o tipo recusar.
 *     (Runtime não vê tipos: o gate real é o compilador, e o teste de lint é
 *     a prova de que ele morde.)
 *   - dag: ciclo reportado COM caminho, critério gravado, estabilidade,
 *     órfão reportado, fail-closed em referência inexistente.
 *   - fechoTransitivoRedundante: identifica arestas redundantes SEM remover
 *     do grafo (visão de renderização, nunca armazenamento).
 *   - invariantes I1-I11: cada uma com caso que VIOLA e caso que SATISFAZ
 *     (A-P08-3) — invariante só com caso negativo não prova que ela aprova algo.
 *
 * Sem rede, sem disco, sem LLM: fixtures em memória, funções puras.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { conceptId } from '../electron/main/engine/graph/model';
import type { Concept, ConceptGraph, ConceptId } from '../electron/main/engine/graph/model';
import { fechoTransitivoRedundante, toposort } from '../electron/main/engine/graph/dag';
import { checkInvariants } from '../electron/main/engine/graph/invariants';
import type { AulaNaVisao, InvarianteId, ViolacaoEstrutural, VisaoDeEnsino } from '../electron/main/engine/graph/invariants';

// ---------------------------------------------------------------------------
// Fixtures PURAS (nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

/** conceito com arestas vazias por padrão — explicitude à vista. */
function conc(id: string, over: Partial<Concept> = {}): Concept {
  return { id: conceptId(id), desbloqueadoPor: [], usa: [], ...over };
}

/** aula na visão de ensino com metadados vazios por padrão. */
function aula(ref: string, over: Partial<AulaNaVisao> = {}): AulaNaVisao {
  return {
    ref,
    introduces: [],
    usa: [],
    teoriaExemplos: [],
    desafios: [],
    artefatos: [],
    orcamentoVigente: [],
    ...over,
  };
}

/**
 * A TRILHA EXEMPLAR: satisfaz TODAS as invariantes I1-I11 de uma vez (o teste
 * abaixo prova `checkInvariants` vazio). Cada teste negativo quebra UMA coisa.
 */
function trilhaExemplar(): { grafo: ConceptGraph; visao: VisaoDeEnsino; a: ConceptId; b: ConceptId; c: ConceptId; d: ConceptId } {
  const a = conceptId('variaveis');
  const b = conceptId('funcoes');
  const c = conceptId('condicionais');
  const d = conceptId('lacos');

  const grafo: ConceptGraph = {
    conceitos: [
      { id: a, familiaSintatica: 'dados', desbloqueadoPor: [], usa: [] },
      {
        id: b,
        familiaSintatica: 'funcao',
        formas: [
          { nome: 'FunctionDeclaration', complexidade: 0 },
          { nome: 'ArrowFunctionExpression', complexidade: 1 },
        ],
        desbloqueadoPor: [a],
        usa: [a],
      },
      {
        id: c,
        familiaSintatica: 'condicional',
        formas: [
          { nome: 'IfStatement', complexidade: 0 },
          { nome: 'ConditionalExpression', complexidade: 1 },
        ],
        desbloqueadoPor: [b],
        usa: [a, b],
      },
      { id: d, familiaSintatica: 'laco', desbloqueadoPor: [c], usa: [b, c] },
    ],
  };

  const visao: VisaoDeEnsino = {
    aulas: [
      aula('m1/a1', { familiaSintatica: 'dados', introduces: [a], usa: [a], teoriaExemplos: [[a]], desafios: [[a]], artefatos: [[a], [a]], orcamentoVigente: [a] }),
      aula('m1/a2', {
        familiaSintatica: 'funcao',
        introduces: [b],
        usa: [a, b],
        teoriaExemplos: [[a, b]],
        desafios: [[a, b]],
        artefatos: [[a, b], [b]],
        orcamentoVigente: [a, b],
        formasApresentadas: [{ construcao: b, forma: 'FunctionDeclaration' }],
      }),
      aula('m1/a3', {
        familiaSintatica: 'condicional',
        introduces: [c],
        usa: [a, b, c],
        teoriaExemplos: [[b, c]],
        desafios: [[c]],
        artefatos: [[b, c], [a, b]],
        orcamentoVigente: [a, b, c],
        formasApresentadas: [{ construcao: c, forma: 'IfStatement' }],
      }),
      aula('m1/a4', { familiaSintatica: 'laco', introduces: [d], usa: [b, c, d], teoriaExemplos: [[c, d]], desafios: [[d]], artefatos: [[c, d], [b, d]], orcamentoVigente: [a, b, c, d] }),
      aula('m1/a5', { introduces: [], usa: [a, b, c, d], teoriaExemplos: [[a, b, c]], desafios: [[a, b, c, d]], artefatos: [[a, b, c, d], [b, c], [d], [c, d]], orcamentoVigente: [a, b, c, d] }),
    ],
  };

  return { grafo, visao, a, b, c, d };
}

/** filtra violações por invariante. */
function de(invariante: InvarianteId, violacoes: ViolacaoEstrutural[]): ViolacaoEstrutural[] {
  return violacoes.filter((v) => v.invariante === invariante);
}

// ---------------------------------------------------------------------------
// model — o TYPE CHECK DURO (ConceptId × slug de aula)
// ---------------------------------------------------------------------------

describe('model — ConceptId (type check duro da §3.4)', () => {
  it('conceptId() é a única porta de entrada e valida o formato em runtime', () => {
    // id de conceito é snake_case; slug de aula (kebab / com '/') NÃO passa.
    assert.throws(() => conceptId('modulo1/aula1'), /snake_case/);
    assert.throws(() => conceptId('variaveis-const'), /snake_case/);
    assert.throws(() => conceptId(''), /snake_case/);
    assert.equal(conceptId('variaveis'), 'variaveis');
  });

  it('passar um slug onde se espera ConceptId é ERRO DE TIPO — o @ts-expect-error só compila se o tipo recusar', () => {
    function esperaConceptId(id: ConceptId): ConceptId {
      return id;
    }

    // @ts-expect-error — slug de aula NÃO é ConceptId (violação de tipo duro)
    esperaConceptId('modulo1/aula1');

    // @ts-expect-error — desbloqueadoPor[] só aceita ConceptId; slug é erro de tipo
    const invalido: Concept = { id: conceptId('a'), desbloqueadoPor: ['modulo1/aula1'], usa: [] };

    // O `tsc` é o gate real (ver cabeçalho); aqui só provamos que o código
    // válido flui e que o objeto inválido nem chega a ser usado.
    assert.equal(esperaConceptId(conceptId('variaveis')), 'variaveis');
    assert.equal(invalido.desbloqueadoPor.length, 1);
  });
});

// ---------------------------------------------------------------------------
// dag — toposort (Kahn com desempate)
// ---------------------------------------------------------------------------

describe('dag — toposort (Kahn com desempate)', () => {
  function cadeia(): ConceptGraph {
    return {
      conceitos: [
        conc('a'),
        conc('b', { desbloqueadoPor: [conceptId('a')] }),
        conc('c', { desbloqueadoPor: [conceptId('b')] }),
      ],
    };
  }

  it('ordena uma cadeia e GRAVA o critério usado', () => {
    const r = toposort(cadeia());
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.ordem, ['a', 'b', 'c']);
    assert.equal(r.criterio, 'ordem-lexicografica-por-id');
    assert.deepEqual(r.orfaos, []);
  });

  it('é ESTÁVEL: mesma entrada → mesma linearização, independente da ordem do array', () => {
    const g1 = cadeia();
    const r1 = toposort(g1);
    const r2 = toposort(g1);
    assert.deepEqual(r1, r2); // byte a byte

    // ordem de declaração embaralhada, MESMAS arestas → mesma linearização.
    const embaralhado: ConceptGraph = { conceitos: [...g1.conceitos].reverse() };
    const r3 = toposort(embaralhado);
    assert.ok(r1.ok && r3.ok);
    if (!r1.ok || !r3.ok) return;
    assert.deepEqual(r3.ordem, r1.ordem);
  });

  it('desempate lexicográfico: dois nós prontos ao mesmo tempo saem na ordem dos ids', () => {
    const grafo: ConceptGraph = {
      conceitos: [
        conc('b'),
        conc('a'),
        conc('c', { desbloqueadoPor: [conceptId('a'), conceptId('b')] }),
      ],
    };
    const lex = toposort(grafo);
    assert.ok(lex.ok);
    if (!lex.ok) return;
    assert.deepEqual(lex.ordem, ['a', 'b', 'c']);

    const declarada = toposort(grafo, { criterio: 'ordem-declarada' });
    assert.ok(declarada.ok);
    if (!declarada.ok) return;
    assert.deepEqual(declarada.ordem, ['b', 'a', 'c']);
    assert.equal(declarada.criterio, 'ordem-declarada');

    const custom = toposort(grafo, { comparador: (x, y) => (x > y ? -1 : x < y ? 1 : 0) });
    assert.ok(custom.ok);
    if (!custom.ok) return;
    assert.deepEqual(custom.ordem, ['b', 'a', 'c']);
    assert.equal(custom.criterio, 'customizado');
  });

  it('detecta ciclo e reporta o CAMINHO do ciclo', () => {
    const grafo: ConceptGraph = {
      conceitos: [
        conc('x', { desbloqueadoPor: [conceptId('z')] }),
        conc('y', { desbloqueadoPor: [conceptId('x')] }),
        conc('z', { desbloqueadoPor: [conceptId('y')] }),
      ],
    };
    const r = toposort(grafo);
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.equal(r.falha, 'ciclo');
    if (r.falha !== 'ciclo') return;
    assert.deepEqual(r.ciclo, ['x', 'y', 'z', 'x']);
  });

  it('auto-dependência (self-loop) é ciclo de tamanho 1', () => {
    const grafo: ConceptGraph = { conceitos: [conc('a', { desbloqueadoPor: [conceptId('a')] })] };
    const r = toposort(grafo);
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.equal(r.falha, 'ciclo');
    if (r.falha !== 'ciclo') return;
    assert.deepEqual(r.ciclo, ['a', 'a']);
  });

  it('referência a conceito inexistente é FALHA (fail-closed), não silêncio', () => {
    const grafo: ConceptGraph = {
      conceitos: [
        conc('a'),
        conc('b', { desbloqueadoPor: [conceptId('a'), conceptId('milagre')] }),
        conc('c'),
      ],
    };
    const r = toposort(grafo);
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.equal(r.falha, 'referencia-inexistente');
    if (r.falha !== 'referencia-inexistente') return;
    assert.deepEqual(r.refs, ['milagre']);
  });

  it('id duplicado em conceitos é FALHA (fail-closed)', () => {
    const grafo: ConceptGraph = { conceitos: [conc('a'), conc('a')] };
    const r = toposort(grafo);
    assert.ok(!r.ok);
    if (r.ok) return;
    assert.equal(r.falha, 'ids-duplicados');
    if (r.falha !== 'ids-duplicados') return;
    assert.deepEqual(r.ids, ['a']);
  });

  it('nó órfão (sem aresta nenhuma) é REPORTADO', () => {
    const grafo: ConceptGraph = {
      conceitos: [
        conc('a'),
        conc('b', { desbloqueadoPor: [conceptId('a')] }),
        conc('c', { desbloqueadoPor: [conceptId('b')] }),
        conc('solo'),
      ],
    };
    const r = toposort(grafo);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.orfaos, ['solo']);
    assert.deepEqual(r.ordem, ['a', 'b', 'c', 'solo']);
  });
});

// ---------------------------------------------------------------------------
// dag — fecho transitivo (poda = visão de renderização, nunca armazenamento)
// ---------------------------------------------------------------------------

describe('dag — fechoTransitivoRedundante', () => {
  it('identifica aresta transitivamente redundante com o caminho alternativo e NÃO remove do grafo', () => {
    const grafo: ConceptGraph = {
      conceitos: [
        conc('a'),
        conc('b', { desbloqueadoPor: [conceptId('a')] }),
        conc('c', { desbloqueadoPor: [conceptId('a'), conceptId('b')] }), // a→c é redundante: a→b→c
      ],
    };
    const redundantes = fechoTransitivoRedundante(grafo);
    assert.deepEqual(redundantes, [
      { origem: conceptId('a'), destino: conceptId('c'), caminho: [conceptId('a'), conceptId('b'), conceptId('c')] },
    ]);
    // o grafo NÃO mudou — a poda é visão de renderização.
    assert.deepEqual(grafo.conceitos[2].desbloqueadoPor, [conceptId('a'), conceptId('b')]);
  });

  it('usa o caminho mais curto quando há vários caminhos alternativos', () => {
    const grafo: ConceptGraph = {
      conceitos: [
        conc('a'),
        conc('b', { desbloqueadoPor: [conceptId('a')] }),
        conc('c', { desbloqueadoPor: [conceptId('b')] }),
        conc('d', { desbloqueadoPor: [conceptId('a'), conceptId('c')] }), // a→d redundante via a→b→c→d
      ],
    };
    const redundantes = fechoTransitivoRedundante(grafo);
    assert.deepEqual(redundantes, [
      { origem: conceptId('a'), destino: conceptId('d'), caminho: [conceptId('a'), conceptId('b'), conceptId('c'), conceptId('d')] },
    ]);
  });

  it('não reporta aresta sem caminho alternativo', () => {
    const grafo: ConceptGraph = {
      conceitos: [conc('a'), conc('b', { desbloqueadoPor: [conceptId('a')] }), conc('c', { desbloqueadoPor: [conceptId('b')] })],
    };
    assert.deepEqual(fechoTransitivoRedundante(grafo), []);
  });
});

// ---------------------------------------------------------------------------
// invariantes I1-I11
// ---------------------------------------------------------------------------

describe('invariantes — checkInvariants', () => {
  it('a trilha exemplar satisfaz TODAS as invariantes (I1-I11) de uma vez', () => {
    const { grafo, visao } = trilhaExemplar();
    assert.deepEqual(checkInvariants(grafo, visao), []);
  });

  describe('I1 — DAG + todo referenciado existe', () => {
    it('ciclo é violação, com o caminho do ciclo nos refs', () => {
      const grafo: ConceptGraph = {
        conceitos: [
          conc('x', { desbloqueadoPor: [conceptId('z')] }),
          conc('y', { desbloqueadoPor: [conceptId('x')] }),
          conc('z', { desbloqueadoPor: [conceptId('y')] }),
        ],
      };
      const i1 = de('I1', checkInvariants(grafo, { aulas: [] }));
      assert.equal(i1.length, 1);
      assert.deepEqual(i1[0].refs, ['x', 'y', 'z', 'x']);
    });

    it('desbloqueado_por apontando para conceito inexistente é violação', () => {
      const grafo: ConceptGraph = {
        conceitos: [conc('a'), conc('b', { desbloqueadoPor: [conceptId('a'), conceptId('milagre')] })],
      };
      const i1 = de('I1', checkInvariants(grafo, { aulas: [] }));
      assert.equal(i1.length, 1);
      assert.deepEqual(i1[0].refs, ['milagre']);
    });

    it('usa (Q-matrix) apontando para conceito inexistente também é violação', () => {
      const { grafo } = trilhaExemplar();
      grafo.conceitos[0].usa = [conceptId('milagre2')];
      const i1 = de('I1', checkInvariants(grafo, { aulas: [] }));
      assert.equal(i1.length, 1);
      assert.ok(i1[0].mensagem.includes('usa'));
    });

    it('grafo válido não viola I1', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I1', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I2 — introduces.productive ≤ 2', () => {
    it('aula que introduz 3 construções produtivas é violação', () => {
      const { grafo, visao, b } = trilhaExemplar();
      visao.aulas[1].introduces = [b, conceptId('x'), conceptId('y')];
      const i2 = de('I2', checkInvariants(grafo, visao));
      assert.equal(i2.length, 1);
      assert.ok(i2[0].mensagem.includes('3'));
    });

    it('aula que introduz 2 construções passa', () => {
      const { grafo, visao, a, b } = trilhaExemplar();
      visao.aulas[1].introduces = [a, b];
      assert.deepEqual(de('I2', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I3 — unicidade de origem', () => {
    it('construção introduzida por duas aulas é violação', () => {
      const { grafo, visao, b, c } = trilhaExemplar();
      visao.aulas[2].introduces = [c, b]; // b já é introduzida em m1/a2
      const i3 = de('I3', checkInvariants(grafo, visao));
      assert.equal(i3.length, 1);
      assert.ok(i3[0].refs[0] === 'funcoes');
      assert.deepEqual(i3[0].refs.slice(1), ['m1/a2', 'm1/a3']);
    });

    it('cada construção com uma única aula de origem passa', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I3', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I4 — usada ⇒ tem aula de origem antes', () => {
    it('construção usada sem aula de origem é violação', () => {
      const { grafo, visao, a, b, c, d } = trilhaExemplar();
      visao.aulas[4].usa = [a, b, c, d, conceptId('estranha')];
      const i4 = de('I4', checkInvariants(grafo, visao));
      assert.equal(i4.length, 1);
      assert.ok(i4[0].mensagem.includes('estranha'));
      assert.ok(i4[0].mensagem.includes('origem'));
    });

    it('construção usada ANTES da própria aula de origem é violação', () => {
      const { grafo, visao, a, d } = trilhaExemplar();
      visao.aulas[0].usa = [a, d]; // d só é introduzida em m1/a4
      const i4 = de('I4', checkInvariants(grafo, visao));
      assert.equal(i4.length, 1);
      assert.ok(i4[0].mensagem.includes('DEPOIS'));
    });

    it('construção do axioma de entrada não precisa de aula de origem', () => {
      const { grafo, visao, a } = trilhaExemplar();
      const harness = conceptId('harness');
      visao.construcoesDeEntrada = [harness];
      visao.aulas[0].usa = [a, harness];
      assert.deepEqual(checkInvariants(grafo, visao), []);
    });

    it('toda construção usada com origem anterior satisfaz', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I4', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I5 — introduzida aparece na teoria da própria aula', () => {
    it('introduzida sem aparecer em nenhum exemplo da própria aula é violação', () => {
      const { grafo, visao, c } = trilhaExemplar();
      visao.aulas[3].teoriaExemplos = [[c]]; // 'lacos' (d) some da teoria
      const i5 = de('I5', checkInvariants(grafo, visao));
      assert.equal(i5.length, 1);
      assert.ok(i5[0].mensagem.includes('lacos'));
    });

    it('aparecer em um exemplo da própria aula satisfaz', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I5', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I6 — introduzida é exigida no desafio da própria aula', () => {
    it('introduzida sem ser exigida em nenhum desafio é violação', () => {
      const { grafo, visao, c } = trilhaExemplar();
      visao.aulas[3].desafios = [[c]]; // 'lacos' (d) não é exigida
      const i6 = de('I6', checkInvariants(grafo, visao));
      assert.equal(i6.length, 1);
      assert.ok(i6[0].mensagem.includes('lacos'));
    });

    it('exigida em algum desafio satisfaz', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I6', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I7 — reaparece em ≥3 artefatos posteriores', () => {
    it('reaparecer em menos de 3 artefatos posteriores é violação', () => {
      const { grafo, visao, a, b, c, d } = trilhaExemplar();
      // 'lacos' (d, introduzida em m1/a4) passa a reaparecer só uma vez em m1/a5.
      visao.aulas[4].artefatos = [[a, b, c, d], [b, c]];
      const i7 = de('I7', checkInvariants(grafo, visao));
      assert.equal(i7.length, 1);
      assert.ok(i7[0].mensagem.includes('lacos'));
      assert.ok(i7[0].mensagem.includes('1'));
    });

    it('reaparecer em ≥3 artefatos posteriores satisfaz', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I7', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I8 — interleaving de famílias sintáticas', () => {
    it('3 aulas consecutivas da MESMA família é violação', () => {
      const { grafo, visao } = trilhaExemplar();
      visao.aulas[0].familiaSintatica = 'condicional';
      visao.aulas[1].familiaSintatica = 'condicional';
      // m1/a3 já é 'condicional' → janela (0,1,2) fecha.
      const i8 = de('I8', checkInvariants(grafo, visao));
      assert.equal(i8.length, 1);
      assert.deepEqual(i8[0].refs, ['m1/a1', 'm1/a2', 'm1/a3']);
    });

    it('famílias intercaladas passam', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I8', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I9 — primeira aparição é a forma mais simples', () => {
    it('arrow antes de FunctionDeclaration é violação de forma-mais-simples-primeiro', () => {
      const { grafo, visao, b } = trilhaExemplar();
      visao.aulas[1].formasApresentadas = [{ construcao: b, forma: 'ArrowFunctionExpression' }];
      visao.aulas[2].formasApresentadas = [{ construcao: b, forma: 'FunctionDeclaration' }];
      const i9 = de('I9', checkInvariants(grafo, visao));
      assert.equal(i9.length, 1);
      assert.ok(i9[0].refs[0] === 'funcoes');
      assert.ok(i9[0].mensagem.includes('mais simples'));
    });

    it('FunctionDeclaration antes da arrow passa', () => {
      const { grafo, visao, b } = trilhaExemplar();
      visao.aulas[2].formasApresentadas = [{ construcao: b, forma: 'ArrowFunctionExpression' }];
      assert.deepEqual(de('I9', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I10 — ≥1 desafio resolvível com o orçamento vigente', () => {
    it('nenhum desafio dentro do orçamento vigente é violação', () => {
      const { grafo, visao, a, b } = trilhaExemplar();
      visao.aulas[2].orcamentoVigente = [a, b]; // desafio exige 'condicionais' (c)
      const i10 = de('I10', checkInvariants(grafo, visao));
      assert.equal(i10.length, 1);
      assert.ok(i10[0].mensagem.includes('m1/a3'));
    });

    it('orçamento vigente ausente é violação (fail-closed)', () => {
      const { grafo, visao } = trilhaExemplar();
      visao.aulas[3].orcamentoVigente = undefined;
      const i10 = de('I10', checkInvariants(grafo, visao));
      assert.equal(i10.length, 1);
      assert.ok(i10[0].mensagem.includes('orçamento'));
    });

    it('desafio resolvível apenas com o orçamento vigente passa', () => {
      const { grafo, visao } = trilhaExemplar();
      assert.deepEqual(de('I10', checkInvariants(grafo, visao)), []);
    });
  });

  describe('I11 — mudança de forma exige aula dedicada', () => {
    it('mudança de forma embutida em aula que apresenta outras formas é violação', () => {
      const { grafo, visao, b, c } = trilhaExemplar();
      visao.aulas[2].formasApresentadas = [
        { construcao: c, forma: 'IfStatement' },
        { construcao: b, forma: 'ArrowFunctionExpression' }, // b já ensinada como FunctionDeclaration em m1/a2
      ];
      const i11 = de('I11', checkInvariants(grafo, visao));
      assert.equal(i11.length, 1);
      assert.ok(i11[0].refs[0] === 'funcoes');
      assert.ok(i11[0].mensagem.includes('DEDICADA'));
    });

    it('aula DEDICADA à mudança de forma passa', () => {
      const { grafo, visao, b } = trilhaExemplar();
      visao.aulas[2].formasApresentadas = [{ construcao: b, forma: 'ArrowFunctionExpression' }];
      assert.deepEqual(de('I11', checkInvariants(grafo, visao)), []);
    });

    it('apresentar duas formas da MESMA construção na INTRODUÇÃO não é mudança de forma', () => {
      const { grafo, visao, c } = trilhaExemplar();
      visao.aulas[2].formasApresentadas = [
        { construcao: c, forma: 'IfStatement' },
        { construcao: c, forma: 'ConditionalExpression' },
      ];
      assert.deepEqual(de('I11', checkInvariants(grafo, visao)), []);
    });
  });
});