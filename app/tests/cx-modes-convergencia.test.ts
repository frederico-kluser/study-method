/**
 * tests/cx-modes-convergencia.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/modes/convergencia.ts`: o vetor de estado, a classificação nos seis
 * ramos, o planejador da QUEBRA, as ações do catálogo fechado e o LAÇO
 * (medir → classificar → planejar → aplicar → medir) com a cascata de parada.
 *
 * Fixtures sintéticas para as funções puras; trilha em memória + deps fake
 * para o laço. OFFLINE, tmpdirs próprios, zero produção tocada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackLessonSource, TrackModuleSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import type { AuditReport, Violation } from '../electron/main/engine/audit';
import type { AtomKey } from '../electron/main/engine/atomKeys';
import type { LessonBudget } from '../electron/main/engine/budget';
import {
  REGRAS_DA_BARRA,
  TETO_NOVAS_TOTAL,
  TETO_PRODUTIVAS_NOVAS,
  TETO_PRODUTIVAS_NOVAS_AULA_1,
  type AchadoDaBarra,
  type MetricaDaBarra,
  type RelatorioDaBarra,
} from '../electron/main/engine/quality/barra';
import {
  COMPONENTES_DE_MU,
  COMPONENTES_DO_VETOR,
  ErroDeConvergencia,
  PREFIXO_SLUG_QUEBRA,
  RAMOS,
  RAMO_DA_BARRA,
  algumaComponenteDesceu,
  chaveQueDistingue,
  classificarAchados,
  convergirTrilha,
  criarLeitorDaCadeia,
  hashDoVetor,
  lessonJsonDaQuebra,
  medirVetor,
  minimoDeSecoes,
  moduleJsonComAulasDaQuebra,
  muDoVetor,
  planejarAcoes,
  planejarQuebra,
  posicoesDasChaves,
  slugDaAulaDaQuebra,
  type AchadoClassificado,
  type AulaDaQuebra,
  type PlanoDeQuebra,
  type VetorDeEstado,
} from '../electron/main/engine/modes/convergencia';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function vetor(parcial: Partial<VetorDeEstado> = {}): VetorDeEstado {
  return {
    violacoesDeOrcamento: 0,
    lacunasDeCurriculo: 0,
    errosDaBarra: 0,
    excessoDePasso: 0,
    chavesSemDemonstracao: 0,
    aulasSemDesafio: 0,
    secoesInsuficientes: 0,
    ...parcial,
  };
}

function violacao(parcial: Partial<Violation> = {}): Violation {
  return {
    regra: 'A3',
    arquivo: 'modules/m01/lessons/a01/challenges/d1/challenge.json',
    ref: 'm01/a01',
    campo: 'solutionCode',
    linha: 2,
    coluna: 3,
    construcao: 'op:unary:typeof',
    eixo: 'op',
    faixa: 'productive',
    trechoOfensor: 'typeof v;',
    primeiraAulaQueEnsina: null,
    mensagem: 'mensagem de fixture',
    ...parcial,
  } as Violation;
}

function reportDe(violacoes: Violation[]): AuditReport {
  return {
    trackSlug: 'fixture',
    budgetSource: 'inferred',
    violations: violacoes,
    metrics: [],
    totals: {
      aulas: 0,
      desafios: 0,
      desafiosComViolacao: 0,
      violacoes: violacoes.filter((v) => (v.severidade ?? 'erro') !== 'aviso').length,
      lacunasDeCurriculo: violacoes.filter((v) => v.primeiraAulaQueEnsina === null && v.construcao !== null).length,
      aulasSemConstrucaoNova: 0,
    },
    hygiene: [],
    parseErrors: [],
    limitacoes: [],
  } as AuditReport;
}

function metrica(parcial: Partial<MetricaDaBarra> = {}): MetricaDaBarra {
  return {
    ref: 'm01/a01',
    index: 0,
    produtivasNovas: 0,
    produtivasColapsadas: 0,
    novasTotais: 0,
    secoesDeTeoria: 0,
    blocosDeCodigo: 0,
    chavesSemDemonstracao: 0,
    chavesComUmaFormaSo: 0,
    desafios: 1,
    afirmacoesMedidas: 0,
    afirmacoesQueVazamPorTamanho: 0,
    grupos: [],
    ...parcial,
  } as MetricaDaBarra;
}

function achadoDaBarra(parcial: Partial<AchadoDaBarra> = {}): AchadoDaBarra {
  return {
    regra: 'A17',
    ref: 'm01/a01',
    chave: null,
    evidencia: 'evidencia de fixture',
    mensagem: 'mensagem de fixture',
    acao: 'SPLIT_LESSON',
    severidade: 'erro',
    ...parcial,
  } as AchadoDaBarra;
}

function barraDe(achados: AchadoDaBarra[], metricas: MetricaDaBarra[] = []): RelatorioDaBarra {
  return {
    trackSlug: 'fixture',
    adapterId: 'javascript',
    budgetSource: 'inferred',
    achados,
    metricas,
    totais: {
      aulas: metricas.length,
      erros: achados.filter((a) => a.severidade === 'erro').length,
      avisos: achados.filter((a) => a.severidade === 'aviso').length,
      aulasComErro: new Set(achados.filter((a) => a.severidade === 'erro').map((a) => a.ref)).size,
      blocosQueNaoParseiam: 0,
    },
  };
}

function achadoClassificado(parcial: Partial<AchadoClassificado> = {}): AchadoClassificado {
  return {
    regra: 'A3',
    ref: 'm01/a01',
    chave: 'op:unary:typeof',
    arquivo: 'modules/m01/lessons/a01/challenges/d1/challenge.json',
    evidencia: 'evidencia',
    mensagem: 'mensagem',
    ramo: 'LACUNA',
    acao: 'INSERT_INTERMEDIATE',
    severidade: 'erro',
    ...parcial,
  } as AchadoClassificado;
}

function secaoTeoria(id: string, codigo: string): TrackTheorySection {
  return { id, title: id, markdown: 'Prosa.', code: { language: 'js', code: codigo } };
}

function desafio(slug: string, solutionCode: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: `Desafio ${slug}`,
    concept: 'conceito',
    difficulty: 2,
    language: 'nodejs',
    statement: 'Escreva a função conforme o enunciado.',
    starterCode: 'export function f(v) {\n  return v;\n}\n',
    testsCode:
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('f', () => { assert.equal(f(1), 'sim'); });\n",
    solutionCode,
    expectedTestCount: 1,
  };
}

interface AulaDeFixture {
  slug: string;
  teoria: string;
  desafios: TrackChallengeSource[];
}

function fazerTrilha(slug: string, aulas: AulaDeFixture[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug,
      title: 'Trilha de fixture',
      description: 'fixture de caracterização da convergência',
      language: 'pt-BR',
      domain: 'programming',
      modules: ['m01'],
    },
    modules: [
      {
        meta: { schemaVersion: 1, slug: 'm01', title: 'Módulo 1', order: 1, lessons: aulas.map((a) => a.slug) },
        challenge: null,
        lessons: aulas.map((a) => ({
          meta: {
            schemaVersion: 1,
            slug: a.slug,
            title: `Aula ${a.slug}`,
            summary: 'resumo',
            difficulty: 2,
            concepts: ['conceito'],
            prerequisites: [],
            theory: [secaoTeoria(`t-${a.slug}`, a.teoria)],
            sources: [],
            challenges: a.desafios.map((d) => d.slug),
          },
          challenges: a.desafios,
        })),
      },
    ],
    proficiency: null,
    dir: '/nao-existe/cx-fixture-convergencia',
  };
}

/** Trilha VAZIA — o limite do ponto fixo sem achado nenhum. */
function trilhaVazia(): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'cx-vazia',
      title: 'Vazia',
      description: 'sem módulos',
      language: 'pt-BR',
      domain: 'programming',
      modules: [],
    },
    modules: [],
    proficiency: null,
    dir: '/nao-existe/cx-vazia',
  };
}

/** Trilha com ACHADO PERSISTENTE: `typeof` cobrado e nunca ensinado (LACUNA). */
function trilhaComAchadoPersistente(): LoadedTrack {
  return fazerTrilha('cx-persistente', [
    {
      slug: 'a01',
      teoria: 'function dobro(n) {\n  let r = n + n;\n  return r;\n}\n',
      desafios: [desafio('d1', 'export function f(v) {\n  let t = typeof v;\n  return t;\n}\n')],
    },
  ]);
}

/** A entrada canônica do planejador da quebra: 3 grupos, 2 produtivos. */
function entradaDaQuebra(over: Partial<Parameters<typeof planejarQuebra>[0]> = {}): Parameters<typeof planejarQuebra>[0] {
  const chavesG1: AtomKey[] = ['node:TypeOfExpression', 'op:unary:typeof'];
  const chavesG2: AtomKey[] = ['node:BinaryExpression', 'op:binary:+'];
  const chavesG3: AtomKey[] = ['node:ReturnStatement'];
  const meta = {
    schemaVersion: 1,
    slug: 'a01',
    title: 'Aula a01',
    summary: 'resumo',
    difficulty: 2,
    concepts: [],
    prerequisites: [],
    theory: [
      secaoTeoria('t1', "let t = typeof v;\n"),
      secaoTeoria('t2', 'let s = 1 + 2;\n'),
      secaoTeoria('t3', 'function f() {\n  return 1;\n}\n'),
    ],
    sources: [],
    challenges: ['d1'],
  } as unknown as TrackLessonSource;
  const entrada: LessonBudget = {
    index: 0,
    moduleSlug: 'm01',
    lessonSlug: 'a01',
    ref: 'm01/a01',
    entrada: { receptive: new Set(), productive: new Set() },
    saida: { receptive: new Set(), productive: new Set() },
    introduces: {
      receptive: [...chavesG1, ...chavesG2, ...chavesG3],
      productive: [...chavesG1, ...chavesG2, ...chavesG3],
    },
    source: 'declared',
  };
  return {
    meta,
    moduloSlug: 'm01',
    moduloTitulo: 'Módulo 1',
    lessonsDoModulo: ['a01', 'a02'],
    metrica: metrica({
      ref: 'm01/a01',
      grupos: [chavesG1, chavesG2, chavesG3],
      produtivasNovas: 5,
      produtivasColapsadas: 3,
      novasTotais: 5,
    }),
    orcamento: entrada,
    adapterId: 'javascript',
    primeiraDaTrilha: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. O vetor de estado e a medida de terminação
// ---------------------------------------------------------------------------

describe('vetor de estado — componentes pinadas na ordem do hash', () => {
  it('GOLDEN: COMPONENTES_DO_VETOR e COMPONENTES_DE_MU são exatamente estes', () => {
    assert.deepEqual([...COMPONENTES_DO_VETOR], [
      'violacoesDeOrcamento',
      'lacunasDeCurriculo',
      'errosDaBarra',
      'excessoDePasso',
      'chavesSemDemonstracao',
      'aulasSemDesafio',
      'secoesInsuficientes',
    ]);
    assert.deepEqual([...COMPONENTES_DE_MU], [
      'excessoDePasso',
      'chavesSemDemonstracao',
      'aulasSemDesafio',
      'violacoesDeOrcamento',
      'lacunasDeCurriculo',
    ]);
    assert.deepEqual([...RAMOS], ['ORDEM', 'CADEIA', 'LACUNA', 'QUEBRA', 'DEMONSTRACAO', 'PROVA']);
  });

  it('minimoDeSecoes: piso 2, senão ceil(novas/2)', () => {
    assert.equal(minimoDeSecoes(0), 2);
    assert.equal(minimoDeSecoes(1), 2);
    assert.equal(minimoDeSecoes(3), 2);
    assert.equal(minimoDeSecoes(5), 3);
  });

  it('medirVETOR: soma por aula (excessos, A19, A20, A21) + contagens do audit SEM a barra mesclada', () => {
    const audit = reportDe([
      violacao({ regra: 'A3' }),
      violacao({ regra: 'A3', campo: 'testsCode', linha: 9 }), // deduplicável no classificador, conta aqui
      violacao({ regra: 'A17', construcao: null, severidade: 'aviso' }), // regra da barra DESCONTADA
      violacao({ regra: 'A2', construcao: null, primeiraAulaQueEnsina: 'm01/a02' }), // erro do audit conta
    ]);
    const b = barraDe([], [
      metrica({ produtivasColapsadas: 3, novasTotais: 6, chavesSemDemonstracao: 2, desafios: 0, secoesDeTeoria: 1 }),
      metrica({ produtivasColapsadas: 1, novasTotais: 1, chavesSemDemonstracao: 0, desafios: 1, secoesDeTeoria: 5 }),
    ]);
    const v = medirVetor(audit, b);
    // aula 1: max(0,3-2)=1 + max(0,6-4)=2; aula 2: 0 → excesso 3
    assert.equal(v.excessoDePasso, 3);
    assert.equal(v.chavesSemDemonstracao, 2);
    assert.equal(v.aulasSemDesafio, 1);
    // aula 1: novas 6 > 0 e 1 seção < minimoDeSecoes(6)=3 → conta; aula 2: 5 ≥ 2 → não
    assert.equal(v.secoesInsuficientes, 1);
    // erros do audit sem regras da barra: A3×2 + A2 = 3 (aviso fora)
    assert.equal(v.violacoesDeOrcamento, 3);
    // LITERAIS, não relidos do próprio input (as duas A3 sem aula que ensina
    // são as lacunas; a A17-aviso e a A2-sem-construção não contam; a barra
    // deste caso não tem achado nenhum)
    assert.equal(v.lacunasDeCurriculo, 2);
    assert.equal(v.errosDaBarra, 0);
  });

  it('LIMITE: tudo zero mede zero (e o hash é estável)', () => {
    const v = medirVetor(reportDe([]), barraDe([]));
    assert.deepEqual(v, vetor());
    assert.equal(hashDoVetor(v), hashDoVetor(vetor()));
  });

  it('hashDoVetor: 16 hex, sensível a QUALQUER componente; muDoVetor só soma as 5 de μ', () => {
    const base = vetor({ excessoDePasso: 3 });
    const h = hashDoVetor(base);
    assert.match(h, /^[0-9a-f]{16}$/);
    assert.equal(h, hashDoVetor(vetor({ excessoDePasso: 3 })));
    assert.notEqual(h, hashDoVetor(vetor({ excessoDePasso: 4 })));
    assert.notEqual(h, hashDoVetor(vetor({ excessoDePasso: 3, secoesInsuficientes: 1 })));
    assert.equal(muDoVetor(vetor({ excessoDePasso: 3, chavesSemDemonstracao: 2, aulasSemDesafio: 1, violacoesDeOrcamento: 4, lacunasDeCurriculo: 5, errosDaBarra: 100, secoesInsuficientes: 100 })), 15);
  });

  it('algumaComponenteDesceu: descer em QUALQUER componente (inclusive fora de μ) conta como descida', () => {
    assert.ok(algumaComponenteDesceu(vetor({ excessoDePasso: 2 }), vetor({ excessoDePasso: 1 })));
    assert.ok(algumaComponenteDesceu(vetor({ secoesInsuficientes: 2 }), vetor({ secoesInsuficientes: 1 })));
    assert.ok(!algumaComponenteDesceu(vetor({ excessoDePasso: 1 }), vetor({ excessoDePasso: 1 })));
    assert.ok(!algumaComponenteDesceu(vetor({ excessoDePasso: 1 }), vetor({ excessoDePasso: 2 })));
  });
});

// ---------------------------------------------------------------------------
// 2. A classificação nos seis ramos (§5.5 × §6)
// ---------------------------------------------------------------------------

describe('classificarAchados — cada achado cai em EXATAMENTE UM ramo', () => {
  const cadeiaVazia = new Map<AtomKey, string>();

  it('ORDEM: tem aula dona depois → REWRITE_IN_BUDGET, com a evidência citável', () => {
    const r = classificarAchados({
      audit: reportDe([violacao({ primeiraAulaQueEnsina: 'm01/a03' })]),
      barra: barraDe([]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(r.achados.length, 1);
    assert.equal(r.achados[0].ramo, 'ORDEM');
    assert.equal(r.achados[0].acao, 'REWRITE_IN_BUDGET');
    assert.match(r.achados[0].evidencia, /ensinada em m01\/a03 \(DEPOIS desta aula\)/);
    assert.equal(r.porRamo.ORDEM, 1);
  });

  it('CADEIA × LACUNA: ensinado no curso anterior vira MOVE_CONCEPT_TO_ENTRY_BUDGET; senão INSERT_INTERMEDIATE', () => {
    const semCadeia = classificarAchados({
      audit: reportDe([violacao()]),
      barra: barraDe([]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(semCadeia.achados[0].ramo, 'LACUNA');
    assert.equal(semCadeia.achados[0].acao, 'INSERT_INTERMEDIATE');

    const comCadeia = classificarAchados({
      audit: reportDe([violacao()]),
      barra: barraDe([]),
      ensinadoAntesNaCadeia: new Map([['op:unary:typeof', 'curso-anterior/mod/aula']]),
    });
    assert.equal(comCadeia.achados[0].ramo, 'CADEIA');
    assert.equal(comCadeia.achados[0].acao, 'MOVE_CONCEPT_TO_ENTRY_BUDGET');
    assert.equal(comCadeia.porRamo.CADEIA, 1);
  });

  it('foraDosRamos: DEC e violação sem construção são DECLARADOS, nunca improvisados', () => {
    const r = classificarAchados({
      audit: reportDe([violaçãoDEC(), violacao({ regra: 'A6', construcao: null })]),
      barra: barraDe([]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(r.achados.length, 0);
    assert.equal(r.foraDosRamos.length, 2);
    assert.equal(r.foraDosRamos[0].regra, 'DEC');
    assert.match(r.foraDosRamos[0].motivo, /DECIDIBILIDADE/);
    function violaçãoDEC(): Violation {
      return violacao({ regra: 'DEC', primeiraAulaQueEnsina: 'm01/a03' });
    }
  });

  it('DEDUPLICAÇÃO por (regra, arquivo, campo, construção) — a posição (linha) fica de fora', () => {
    const r = classificarAchados({
      audit: reportDe([violação(), violacao({ linha: 77, coluna: 88 })]),
      barra: barraDe([]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(r.achados.length, 1);
    function violação(): Violation {
      return violacao();
    }
  });

  it('AVISO: o do AUDIT nem entra (errosDoAudit); o da BARRA entra sem abrir rodada (fora do porRamo)', () => {
    const doAudit = classificarAchados({
      audit: reportDe([violacao({ severidade: 'aviso' })]),
      barra: barraDe([]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(doAudit.achados.length, 0, 'aviso do audit é filtrado por errosDoAudit');
    assert.equal(doAudit.porRamo.LACUNA, 0);

    const daBarra = classificarAchados({
      audit: reportDe([]),
      barra: barraDe([achadoDaBarra({ regra: 'A22', severidade: 'aviso', acao: 'REWRITE_IN_BUDGET' })]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(daBarra.achados.length, 1);
    assert.equal(daBarra.achados[0].severidade, 'aviso');
    assert.equal(daBarra.porRamo.DEMONSTRACAO, 0, 'aviso não abre rodada');
  });

  it('barra: RAMO_DA_BARRA é esta tabela LITERAL (chave E ramo) — regra sem linha é defeito', () => {
    const RAMO_ESPERADO: Record<string, 'QUEBRA' | 'DEMONSTRACAO' | 'PROVA'> = {
      A17: 'QUEBRA',
      A18: 'QUEBRA',
      A21: 'QUEBRA',
      A19: 'DEMONSTRACAO',
      A22: 'DEMONSTRACAO',
      A23: 'DEMONSTRACAO',
      A20: 'PROVA',
      A24: 'PROVA',
    };
    assert.deepEqual({ ...RAMO_DA_BARRA }, RAMO_ESPERADO, 'a tabela é FECHADA: chave ou ramo mudou, atualize o golden');
    for (const regra of REGRAS_DA_BARRA) {
      assert.equal(
        RAMO_DA_BARRA[regra],
        RAMO_ESPERADO[regra],
        `regra ${regra}: sem linha na tabela RAMO_DA_BARRA ou com ramo diferente do literal`,
      );
    }
  });

  it('a classificação segue o ramo LITERAL regra a regra (A17/A19/A22/A24…) e o arquivo é derivado da ref', () => {
    const ramoPorRegra = {
      A17: 'QUEBRA',
      A18: 'QUEBRA',
      A21: 'QUEBRA',
      A19: 'DEMONSTRACAO',
      A22: 'DEMONSTRACAO',
      A23: 'DEMONSTRACAO',
      A20: 'PROVA',
      A24: 'PROVA',
    } as const;
    for (const [regra, ramo] of Object.entries(ramoPorRegra)) {
      const r = classificarAchados({
        audit: reportDe([]),
        barra: barraDe([achadoDaBarra({ regra: regra as AchadoDaBarra['regra'], acao: 'REWRITE_IN_BUDGET' })]),
        ensinadoAntesNaCadeia: cadeiaVazia,
      });
      assert.equal(r.achados.length, 1, `regra ${regra}`);
      assert.equal(r.achados[0].ramo, ramo, `regra ${regra}: ramo classificado`);
      assert.equal(r.achados[0].acao, 'REWRITE_IN_BUDGET', `regra ${regra}: a ação vem do próprio achado`);
    }
    const r = classificarAchados({
      audit: reportDe([]),
      barra: barraDe([achadoDaBarra({ regra: 'A24', acao: 'REWRITE_IN_BUDGET' })]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(r.achados[0].ramo, 'PROVA');
    assert.equal(r.achados[0].arquivo, 'modules/m01/lessons/a01/lesson.json');
  });

  it('regra da barra SEM linha na tabela → DEFEITO do catálogo em foraDosRamos (nunca ação improvisada)', () => {
    const r = classificarAchados({
      audit: reportDe([]),
      barra: barraDe([achadoDaBarra({ regra: 'A99' as AchadoDaBarra['regra'] })]),
      ensinadoAntesNaCadeia: cadeiaVazia,
    });
    assert.equal(r.achados.length, 0);
    assert.equal(r.foraDosRamos.length, 1);
    assert.match(r.foraDosRamos[0].motivo, /DEFEITO do catálogo/);
  });
});

// ---------------------------------------------------------------------------
// 3. O planejador da QUEBRA (o ramo (c) do pedido do dono)
// ---------------------------------------------------------------------------

describe('chaveQueDistingue / slugDaAulaDaQuebra — decisões de código, determinísticas', () => {
  it('alvo da aula vence; senão a primeira produtiva declarada; senão alfabética', () => {
    const g: AtomKey[] = ['node:TypeOfExpression', 'op:unary:typeof'];
    assert.equal(chaveQueDistingue(g, ['op:unary:typeof', 'node:TypeOfExpression'], 'node:TypeOfExpression'), 'node:TypeOfExpression');
    assert.equal(chaveQueDistingue(g, ['op:unary:typeof'], undefined), 'op:unary:typeof');
    assert.equal(chaveQueDistingue(g, [], undefined), 'node:TypeOfExpression');
  });

  it('GOLDEN: o slug da quebra é `passo-<alvo>-<sha8>` byte a byte', () => {
    assert.equal(slugDaAulaDaQuebra('node:FunctionItem', ['node:FunctionItem', 'node:Parameter']), 'passo-node-functionitem-332b6a35');
    assert.equal(slugDaAulaDaQuebra('api:todo', ['api:todo']), 'passo-api-todo-2fffaaa1');
    assert.equal(PREFIXO_SLUG_QUEBRA, 'passo');
  });
});

describe('planejarQuebra — o split sem partir grupo, com teto e ordem de dependência', () => {
  it('happy: 3 grupos → 2 pacotes → 1 aula nova ANTES da original (o último pacote fica)', () => {
    const p = planejarQuebra(entradaDaQuebra());
    assert.equal(p.tetoDeGruposProdutivos, TETO_PRODUTIVAS_NOVAS);
    assert.equal(p.aulasNovas.length, 1);
    const nova = p.aulasNovas[0];
    assert.equal(nova.inserirAntesDe, 'm01/a01');
    assert.equal(nova.indiceNoModulo, 0);
    assert.deepEqual(nova.prerequisites, []);
    assert.equal(nova.gruposProdutivos, 2);
    assert.deepEqual(nova.chaves, ['node:BinaryExpression', 'node:TypeOfExpression', 'op:binary:+', 'op:unary:typeof']);
    assert.deepEqual(p.chavesQuePerde, ['node:BinaryExpression', 'node:TypeOfExpression', 'op:binary:+', 'op:unary:typeof']);
    assert.deepEqual(p.chavesQueFicam, ['node:ReturnStatement']);
    assert.equal(nova.jaExiste, false);
    assert.equal(nova.autoria.modulo, 'm01');
    assert.equal(nova.autoria.aula, 1);
    // a ORDEM dos grupos é a da primeira ocorrência na teoria (g1, g2, g3)
    assert.deepEqual(p.grupos.map((g) => g.chaveQueDistingue), ['node:TypeOfExpression', 'node:BinaryExpression', 'node:ReturnStatement']);
  });

  it('PRIMEIRA DA TRILHA: teto 1 grupo produtivo no primeiro pacote (A18)', () => {
    const p = planejarQuebra(entradaDaQuebra({ primeiraDaTrilha: true }));
    assert.equal(p.tetoDeGruposProdutivos, TETO_PRODUTIVAS_NOVAS_AULA_1);
    assert.equal(p.aulasNovas.length, 1);
    assert.equal(p.aulasNovas[0].gruposProdutivos, 1);
  });

  it('último pacote SEM produtivo é fundido no anterior (aula que nasce A20 é retrabalho)', () => {
    const e = entradaDaQuebra();
    const p = planejarQuebra({
      ...e,
      metrica: metrica({
        ref: 'm01/a01',
        grupos: [e.metrica.grupos[0], e.metrica.grupos[1], ['node:ReturnStatement']],
        produtivasNovas: 4,
        produtivasColapsadas: 2,
        novasTotais: 5,
      }),
      orcamento: { ...e.orcamento, introduces: { receptive: [...e.metrica.grupos[0], ...e.metrica.grupos[1]], productive: [...e.metrica.grupos[0], ...e.metrica.grupos[1]] } },
    });
    assert.equal(p.aulasNovas.length, 0);
    assert.ok(p.declaracoes.some((d) => d.includes('ÚLTIMO PACOTE SEM GRUPO PRODUTIVO')));
    assert.ok(p.declaracoes.some((d) => d.includes('NENHUMA aula nova')));
  });

  it('grupo que sozinho estoura o teto de CHAVES NÃO se parte: vira derivada declarada (A23)', () => {
    const cinco: AtomKey[] = ['node:A1', 'node:A2', 'node:A3', 'node:A4', 'node:A5'];
    const p = planejarQuebra(
      entradaDaQuebra({
        metrica: metrica({ ref: 'm01/a01', grupos: [cinco], produtivasNovas: 5, produtivasColapsadas: 5, novasTotais: 5 }),
        orcamento: {
          index: 0, moduleSlug: 'm01', lessonSlug: 'a01', ref: 'm01/a01',
          entrada: { receptive: new Set(), productive: new Set() },
          saida: { receptive: new Set(), productive: new Set() },
          introduces: { receptive: [...cinco], productive: [...cinco] },
          source: 'declared',
        },
      }),
    );
    assert.equal(p.derivadasAPropor.length, 1);
    assert.equal(p.derivadasAPropor[0].aula, 'm01/a01', 'sem aula nova a declaração fica na original');
    assert.equal(p.derivadasAPropor[0].derived.length, 4);
    assert.ok(p.derivadasAPropor[0].derived.every((d) => d.de === 'node:A1'));
    assert.ok(p.declaracoes.some((d) => d.includes('introduces.derived')));
  });

  it('IDEMPOTÊNCIA: slug já no module.json → jaExiste: true (a quebra nunca é aplicada 2×)', () => {
    const slug = planejarQuebra(entradaDaQuebra()).aulasNovas[0].slug;
    const p = planejarQuebra(entradaDaQuebra({ lessonsDoModulo: ['a01', slug, 'a02'] }));
    assert.equal(p.aulasNovas.length, 1);
    assert.equal(p.aulasNovas[0].jaExiste, true);
  });

  it('posicoesDasChaves: primeira ocorrência por bloco/linha; chave sem demonstração vai para o FIM', () => {
    const e = entradaDaQuebra();
    const pos = posicoesDasChaves(e.meta, 'javascript');
    assert.ok(pos.get('op:unary:typeof') !== undefined);
    assert.equal(pos.get('node:Inexistente'), undefined);
    // chave só do grupo g3 (terceiro bloco) aparece DEPOIS da do primeiro bloco
    assert.ok((pos.get('node:ReturnStatement') ?? 0) > (pos.get('op:unary:typeof') ?? 0));
  });
});

describe('lessonJsonDaQuebra / moduleJsonComAulasDaQuebra — o esqueleto honesto', () => {
  function aulaDeExemplo(): AulaDaQuebra {
    const p = planejarQuebra(entradaDaQuebra());
    return p.aulasNovas[0];
  }

  it('o esqueleto nasce SEM introduces, SEM desafio, COM a ficha `autoria` e o rastro `origem`', () => {
    const p = planejarQuebra(entradaDaQuebra());
    const j = lessonJsonDaQuebra(p.aulasNovas[0], p, 9);
    assert.equal((j as Record<string, unknown>).introduces, undefined, 'declarar sem demonstrar seria A19');
    assert.deepEqual(j.challenges, []);
    assert.equal(j.difficulty, 5, 'dificuldade clampada em 1..5');
    assert.deepEqual((j as Record<string, unknown>).autoria, p.aulasNovas[0].autoria);
    const origem = (j as Record<string, unknown>).origem as Record<string, unknown>;
    assert.equal(origem.subfluxo, 'convergencia-quebra-v1');
    assert.equal(origem.acao, 'SPLIT_LESSON');
    assert.equal(origem.deAula, 'm01/a01');
  });

  it('module.json: aulas novas entram ANTES da âncora, na ordem; slug já existente não duplica', () => {
    const meta = { schemaVersion: 1, slug: 'm01', title: 'Módulo', order: 1, lessons: ['a01', 'a02'] } as unknown as TrackModuleSource;
    const nova = aulaDeExemplo();
    const r = moduleJsonComAulasDaQuebra(meta, [nova]);
    assert.deepEqual(r.lessons, [nova.slug, 'a01', 'a02']);
    const deNovo = moduleJsonComAulasDaQuebra({ ...meta, lessons: [...r.lessons] }, [nova]);
    assert.deepEqual(deNovo.lessons, [nova.slug, 'a01', 'a02'], 'idempotente: não duplica');
  });
});

describe('planejarAcoes — catálogo FECHADO, mecânico primeiro, autoria depois', () => {
  it('a ordem dos ramos é ORDEM, QUEBRA, CADEIA, LACUNA, DEMONSTRACAO, PROVA — e só ORDEM é aplicável', () => {
    const acoes = planejarAcoes(
      [
        achadoClassificado({ ramo: 'PROVA', acao: 'ADD_TEST' }),
        achadoClassificado({ ramo: 'LACUNA', acao: 'INSERT_INTERMEDIATE' }),
        achadoClassificado({ ramo: 'CADEIA', acao: 'MOVE_CONCEPT_TO_ENTRY_BUDGET', chave: 'op:binary:+' }),
        achadoClassificado({ ramo: 'QUEBRA', acao: 'SPLIT_LESSON' }),
        achadoClassificado({ ramo: 'ORDEM', acao: 'REWRITE_IN_BUDGET', chave: 'op:binary:-', ref: 'm01/a02' }),
        achadoClassificado({ ramo: 'DEMONSTRACAO', acao: 'REWRITE_IN_BUDGET', chave: 'op:binary:*' }),
      ],
      [],
    );
    assert.deepEqual(acoes.map((a) => a.ramo), ['ORDEM', 'QUEBRA', 'CADEIA', 'LACUNA', 'DEMONSTRACAO', 'PROVA']);
    assert.equal(acoes[0].aplicavel, true);
    for (const a of acoes.slice(1)) assert.equal(a.aplicavel, false);
    assert.match(acoes[2].motivoNaoAplicavel ?? '', /ORÇAMENTO/);
    assert.match(acoes[4].motivoNaoAplicavel ?? '', /AUTORIA/);
  });

  it('QUEBRA vira UMA ação por ref (SPLIT_LESSON) + REWRITE_IN_BUDGET para cada derivada (não aplicável)', () => {
    const plano: PlanoDeQuebra = planejarQuebra(
      entradaDaQuebra({
        metrica: metrica({
          ref: 'm01/a01',
          grupos: [['node:A1', 'node:A2', 'node:A3', 'node:A4', 'node:A5']],
          produtivasNovas: 5,
          produtivasColapsadas: 5,
          novasTotais: 5,
        }),
        orcamento: {
          index: 0, moduleSlug: 'm01', lessonSlug: 'a01', ref: 'm01/a01',
          entrada: { receptive: new Set(), productive: new Set() },
          saida: { receptive: new Set(), productive: new Set() },
          introduces: { receptive: ['node:A1', 'node:A2', 'node:A3', 'node:A4', 'node:A5'], productive: ['node:A1', 'node:A2', 'node:A3', 'node:A4', 'node:A5'] },
          source: 'declared',
        },
      }),
    );
    const acoes = planejarAcoes(
      [
        achadoClassificado({ ramo: 'QUEBRA', acao: 'SPLIT_LESSON', ref: 'm01/a01' }),
        achadoClassificado({ ramo: 'QUEBRA', acao: 'SPLIT_LESSON', ref: 'm01/a01', chave: 'op:binary:+' }),
      ],
      [plano],
    );
    assert.equal(acoes.filter((a) => a.acao === 'SPLIT_LESSON').length, 1, 'uma ação por ref, não por achado');
    const derivadas = acoes.filter((a) => a.alvo === 'introduces.derived');
    assert.equal(derivadas.length, 1);
    assert.equal(derivadas[0].aplicavel, false);
    assert.match(derivadas[0].motivoNaoAplicavel ?? '', /ORÇAMENTO/);
  });
});

// ---------------------------------------------------------------------------
// 4. A cadeia de cursos e o ambiente do ledger
// ---------------------------------------------------------------------------

describe('criarLeitorDaCadeia / lerCommitDoGit / lerAmbienteDoHost', () => {
  it('o leitor da cadeia devolve Map + declaração — nunca lança (fail-soft aditivo)', async () => {
    const ler = criarLeitorDaCadeia('/nao-existe/tracks');
    const r = await ler(trilhaVazia());
    assert.ok(r.mapa instanceof Map);
    assert.match(r.declaracao, /^RAMO CADEIA (ATIVO|VAZIO)/);
  });

  it('o commit do git é sha ou null (nunca inventado); o ambiente tem o node do host', async () => {
    const { lerAmbienteDoHost, lerCommitDoGit } = await import('../electron/main/engine/modes/convergencia');
    const commit = await lerCommitDoGit();
    assert.ok(commit === null || /^[0-9a-f]{40}$/.test(commit));
    const ambiente = await lerAmbienteDoHost();
    assert.match(ambiente.node ?? '', /^v\d+/);
  });
});

// ---------------------------------------------------------------------------
// 5. O LAÇO — a cascata de parada (PONTO-FIXO, CICLO, TETO, DRY-RUN)
// ---------------------------------------------------------------------------

describe('convergirTrilha — mede, classifica, planeja e PARA pela cascata (nunca por cansaço)', () => {
  function depsDe(track: LoadedTrack) {
    const ledger: string[] = [];
    const escritos = new Map<string, string>();
    let cargas = 0;
    return {
      ledger,
      escritos,
      get cargas() { return cargas; },
      deps: {
        carregarTrilha: async () => { cargas += 1; return track; },
        gravarArquivo: async (arquivo: string, conteudo: string) => { escritos.set(arquivo, conteudo); },
        registrarNoLedger: async (linha: string) => { ledger.push(linha); },
      },
    };
  }

  it('--max-iteracoes inválido → ErroDeConvergencia (fail-closed antes de medir)', async () => {
    const { deps } = depsDe(trilhaVazia());
    for (const maxIteracoes of [0, -1, 1.5]) {
      await assert.rejects(
        convergirTrilha(deps, { slug: 'cx-vazia', modo: 'dry-run', maxIteracoes }),
        (e: unknown) => e instanceof ErroDeConvergencia && e.codigo === 'CONVERGENCIA_MAX_ITERACOES_INVALIDO',
      );
    }
  });

  it('PONTO-FIXO: trilha sem achado para em UMA iteração, nos dois modos', async () => {
    for (const modo of ['dry-run', 'aplicar'] as const) {
      const { deps, ledger, escritos } = depsDe(trilhaVazia());
      const r = await convergirTrilha(deps, { slug: 'cx-vazia', modo });
      assert.equal(r.veredito, 'PONTO-FIXO', `modo ${modo}`);
      assert.equal(r.iteracoes.length, 1);
      assert.equal(ledger.length, 1, 'uma linha de ledger por iteração, nos dois modos');
      assert.equal(escritos.size, 0);
      assert.deepEqual(r.escritos, []);
    }
  });

  it('DRY-RUN: com achado, roda UMA iteração e para com veredito DRY-RUN (sem aplicar nada)', async () => {
    const { deps, ledger } = depsDe(trilhaComAchadoPersistente());
    const r = await convergirTrilha(deps, { slug: 'cx-persistente', modo: 'dry-run' });
    assert.equal(r.veredito, 'DRY-RUN');
    assert.equal(r.iteracoes.length, 1);
    assert.equal(ledger.length, 1);
    assert.ok(r.achadosRemanescentes.length > 0, 'a fixture precisa ter achado');
    assert.ok(r.iteracoes[0].mu >= 0);
    assert.match(r.iteracoes[0].hashDoVetor, /^[0-9a-f]{16}$/);
  });

  it('CICLO: `aplicar` sobre achado que não desce → hash repete → PARA e ESCALA (2 iterações)', async () => {
    const { deps, ledger } = depsDe(trilhaComAchadoPersistente());
    const r = await convergirTrilha(deps, { slug: 'cx-persistente', modo: 'aplicar' });
    assert.equal(r.veredito, 'CICLO');
    assert.equal(r.iteracoes.length, 2);
    assert.equal(ledger.length, 2);
    assert.equal(r.iteracoes[1].hashDoVetor, r.iteracoes[0].hashDoVetor);
  });

  it('TETO: com --max-iteracoes N o laço PARA em TETO na iteração N (exit 1 do gate)', async () => {
    const { deps } = depsDe(trilhaComAchadoPersistente());
    const r = await convergirTrilha(deps, { slug: 'cx-persistente', modo: 'aplicar', maxIteracoes: 1 });
    assert.equal(r.veredito, 'TETO');
    assert.equal(r.iteracoes.length, 1);
  });

  it('cada iteração registra medições reproduzíveis (audit + barra) e os ramos por contagem', async () => {
    const { deps } = depsDe(trilhaComAchadoPersistente());
    const r = await convergirTrilha(deps, { slug: 'cx-persistente', modo: 'dry-run' });
    const it = r.iteracoes[0];
    assert.deepEqual(it.medicoes.map((m) => m.comando), [
      'npm run engine -- audit cx-persistente --limite 0',
      'npm run engine -- barra cx-persistente',
    ]);
    assert.ok(it.medicoes.every((m) => m.exit === 0 || m.exit === 1));
    assert.deepEqual(Object.keys(it.achadosPorRamo), [...RAMOS]);
  });
});
