/**
 * tests/cx-phases-schemas-artifacts.test.ts — CARACTERIZAÇÃO (golden master)
 * de `engine/schemas/artifacts.ts` (os shapes dos artefatos da engine).
 *
 * PINA: os SHAPES como contrato de fronteira — campos obrigatórios (INV-05:
 * ausência reprova, `z.preprocess` materializa vazio explícito só onde o
 * documento prevê), enums FECHADOS (faixas, eixos, categorias, severidade,
 * catálogo de ações, provas do report), limites numéricos (answerIndex 0..3,
 * ≤3 assertions, ≤2 produtivas, apontamentos ≤12, confiança 0..1), a ORDEM
 * justificativa→decisão (INV-04, A-P04-2 — o lint varre esta ordem real) e o
 * SCHEMA_REGISTRY com seus 14 nomes + schemas lazy resolvíveis.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  ACAO_CATALOGO,
  ActionsSchema,
  ApontamentoSchema,
  AssertionDraftSchema,
  BriefSchema,
  BudgetSchema,
  CategoriaSchema,
  ChallengeDraftSchema,
  ConceptsSchema,
  ConceitoAtomicoSchema,
  FaixaSchema,
  FaixasSchema,
  FindingsSchema,
  FreezeSchema,
  GraphSchema,
  LessonDraftSchema,
  MatrizEstadoSchema,
  NOMES_DOS_ARTEFATOS,
  NotionalMachineSchema,
  OrderSchema,
  ReportSchema,
  SCHEMA_REGISTRY,
  SeveritySchema,
  SpanSchema,
  type SchemaRegistrado,
} from '../electron/main/engine/schemas/artifacts';

// ---------------------------------------------------------------------------
// Builders — drafts VÁLIDOS; `over` corrige um campo por teste.
// ---------------------------------------------------------------------------

function brief(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tema: 'JavaScript do zero',
    objetivo_geral: 'escrever programas simples',
    publico_alvo: 'iniciantes',
    criterios_de_entrada: [],
    construcoes_alvo: ['decl:let'],
    politica_de_harness: 'receptive-seed',
    restricoes: [],
    justificativa: 'todo começo precisa de um mapa',
    aprovado: false,
    ...over,
  };
}

function apontamento(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ap-1',
    rodada: 1,
    artefato: 'lesson-draft',
    alvo: { caminho: 'aula/lesson.json', linha: 1, span: [0, 10], no_ast: 'Identifier', token: 'soma' },
    evidencia: { tipo: 'orcamento', prova: 'o trecho `soma` viola o orçamento.', introduzido_em: null, reproduzivel_por: 'mecanico:auditor' },
    defeito: 'a construção soma não é ensinada antes.',
    regra_violada: 'C1',
    categoria: 'construcao_nao_ensinada',
    severity: 'bloqueante',
    acao_sugerida: 'criar a aula que ensina a construção.',
    confianca: 1,
    ...over,
  };
}

function assertion(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'af-1',
    statement: 'let declara variável mutável.',
    question: 'qual palavra-chave declara variável mutável?',
    options: ['let', 'const', 'var', 'def'],
    answerIndex: 0,
    feedback: 'let permite reatribuição.',
    sectionId: 'teoria-1',
    ...over,
  };
}

function lessonDraft(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'aula-1',
    title: 'Variáveis',
    objective: { verbo: 'declarar', enunciado: 'variáveis', contexto: 'programas simples', criterio: 'compila' },
    introduces: { receptive: ['decl:let'], productive: ['decl:let'] },
    introducesTerms: [],
    foraDeEscopo: ['closures'],
    eiClass: 'fato',
    targetAtom: 'decl:let',
    notionalMachineDelta: 'o binding passa a existir',
    budgetHash: 'a'.repeat(64),
    budgetVersion: '1',
    research: [],
    theory: [{ id: 'teoria-1', secao: 'teoria', markdown: 'let x = 1;', tag: '' }],
    justificativa: 'primeira unidade de estado',
    role: 'regular',
    status: 'rascunho',
    aprovado: false,
    ...over,
  };
}

function challengeDraft(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'soma',
    conceito: 'decl:let',
    language: 'javascript',
    statement: 'implemente soma',
    starterCode: 'export function soma() {}',
    solutionCode: 'export function soma(a, b) { return a + b; }',
    testsCode: "test('soma', () => {});",
    expectedTestCount: 1,
    outputChannel: 'retorno',
    requires: [],
    notRequired: [],
    subgoals: [],
    scenarios: [{ tipo: 'exemplo', derivado_de: 'op:binary:+', descricao: 'soma simples' }],
    taskSkill: 'implementar função',
    supportLevel: 'sem_andaime',
    surfaceDomain: 'números',
    solutionAlternates: [],
    wrongSolutions: [],
    requirements: [{ id: 'r1', descricao: 'soma correta', teste: 'soma' }],
    justificativa: 'exercita o introduzido',
    aprovado: false,
    ...over,
  };
}

function report(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    trilha: 'js-do-zero',
    comando: 'npm --prefix app test',
    gerado_em: '2026-01-01T00:00:00.000Z',
    placar: { passou: 1, falhou: 0, pendente: 0 },
    violacoes_orcamento: [],
    desafios_que_falham: [],
    cobertura: { conceitos_sem_aula_dona: [], aulas_sem_desafio: [] },
    distribuicao_construcoes_novas: [],
    similaridade_exemplo_solucao: [],
    taxa_falso_passe_revisor: { amostras: 0, frente_a_mutantes: 0, taxa: 0 },
    tokens_por_fase: [],
    limitacoes: [],
    justificativa: 'tudo verde',
    veredito: 'aprovado',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Compartilhados e ordem de campos (INV-04)
// ---------------------------------------------------------------------------

describe('artifacts — compartilhados e INV-04 (justificativa ANTES da decisão)', () => {
  it('FaixaSchema é o enum fechado receptive/productive; SpanSchema é [int≥0, int≥0]', () => {
    assert.equal(FaixaSchema.safeParse('receptive').success, true);
    assert.equal(FaixaSchema.safeParse('productive').success, true);
    assert.equal(FaixaSchema.safeParse('outra').success, false);
    assert.equal(SpanSchema.safeParse([0, 10]).success, true);
    assert.equal(SpanSchema.safeParse([3, 3]).success, true);
    assert.equal(SpanSchema.safeParse([-1, 3]).success, false);
    assert.equal(SpanSchema.safeParse([0, 1.5]).success, false);
    assert.equal(SpanSchema.safeParse([10, 5]).success, true, 'o schema NÃO valida inversão (quem valida é o filtro R1)');
  });

  it('a ORDEM real dos campos tem justificativa/motivo ANTES de aprovado/ação (o lint varre esta ordem)', () => {
    const chavesBrief = Object.keys(BriefSchema.shape);
    assert.ok(chavesBrief.indexOf('justificativa') < chavesBrief.indexOf('aprovado'), 'brief: justificativa < aprovado');

    const chavesAula = Object.keys(LessonDraftSchema.shape);
    assert.ok(chavesAula.indexOf('justificativa') < chavesAula.indexOf('role'), 'lesson: justificativa < role');
    assert.ok(chavesAula.indexOf('justificativa') < chavesAula.indexOf('status'));

    const chavesAcao = Object.keys(ActionsSchema.shape.acoes.element.shape);
    assert.ok(chavesAcao.indexOf('motivo') < chavesAcao.indexOf('acao'), 'ações: motivo < acao');

    const chavesReport = Object.keys(ReportSchema.shape);
    assert.ok(chavesReport.indexOf('justificativa') < chavesReport.indexOf('veredito'), 'report: justificativa < veredito');

    const chavesApontamento = Object.keys(ApontamentoSchema.shape);
    assert.ok(chavesApontamento.indexOf('evidencia') < chavesApontamento.indexOf('defeito'), 'apontamento: evidência antes do julgamento');
  });
});

// ---------------------------------------------------------------------------
// 2. F0 — brief e máquina nocional
// ---------------------------------------------------------------------------

describe('artifacts — BriefSchema e NotionalMachineSchema (F0)', () => {
  it('brief válido passa; campo obrigatório ausente/vazio reprova (INV-05)', () => {
    assert.equal(BriefSchema.safeParse(brief()).success, true);
    for (const campo of ['tema', 'objetivo_geral', 'publico_alvo', 'justificativa']) {
      const sem = brief();
      delete sem[campo];
      assert.equal(BriefSchema.safeParse(sem).success, false, `${campo} ausente reprova`);
      assert.equal(BriefSchema.safeParse(brief({ [campo]: '' })).success, false, `${campo} vazio reprova`);
    }
    assert.equal(BriefSchema.safeParse(brief({ aprovado: 'sim' })).success, false, 'aprovado é boolean');
  });

  it('politica_de_harness é o enum fechado do documento (as alternativas REJEITADAS não passam)', () => {
    for (const boa of ['receptive-seed', 'aula-zero', 'wrapper-gerado']) {
      assert.equal(BriefSchema.safeParse(brief({ politica_de_harness: boa })).success, true, boa);
    }
    assert.equal(BriefSchema.safeParse(brief({ politica_de_harness: 'none' })).success, false);
  });

  it('máquina nocional: nenhuma parte do shape é opcional', () => {
    const valida = {
      nome: 'máquina',
      descricao: 'modelo mental',
      componentes: [{ nome: 'pilha', funcao: 'guarda chamadas' }],
      estados: [{ nome: 'parado', descricao: 'sem execução' }],
      transicoes: [{ de: 'parado', para: 'rodando', condicao: 'chamada' }],
      limites: [],
      analogia: 'roteiro de teatro',
      fonte: 'ECMA-262',
    };
    assert.equal(NotionalMachineSchema.safeParse(valida).success, true);
    for (const campo of Object.keys(valida)) {
      const parcial = { ...valida } as Record<string, unknown>;
      delete parcial[campo];
      assert.equal(NotionalMachineSchema.safeParse(parcial).success, false, `${campo} ausente reprova`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. F1/F2 — conceitos e grafo
// ---------------------------------------------------------------------------

describe('artifacts — ConceitoAtomico/Concepts/Graph/Order', () => {
  it('ConceitoAtomicoSchema exige os 4 critérios + forma_mais_simples e o eixo FECHADO (com form)', () => {
    const conceito = {
      id: 'c1',
      nome: 'declaração let',
      familia_sintatica: 'decl',
      eixo: 'decl',
      chave_atomo: 'decl:let',
      forma_mais_simples: true,
      demonstravel: true,
      exercitavel: true,
      orcamentavel: true,
      cronometravel: true,
      raciocinio_de_projeto: 'estado mutável é a base',
      atomico: true,
    };
    assert.equal(ConceitoAtomicoSchema.safeParse(conceito).success, true);
    for (const eixo of ['node', 'decl', 'op', 'global', 'api', 'form', 'term']) {
      assert.equal(ConceitoAtomicoSchema.safeParse({ ...conceito, eixo }).success, true, `eixo ${eixo}`);
    }
    assert.equal(ConceitoAtomicoSchema.safeParse({ ...conceito, eixo: 'construcao' }).success, false);
    for (const campo of ['forma_mais_simples', 'demonstravel', 'exercitavel', 'orcamentavel', 'cronometravel', 'atomico']) {
      const parcial = { ...conceito } as Record<string, unknown>;
      delete parcial[campo];
      assert.equal(ConceitoAtomicoSchema.safeParse(parcial).success, false, `${campo} é OBRIGATÓRIO`);
    }
  });

  it('ConceptsSchema exige conceitos E concepcoes_alternativas (com ancora_na_spec)', () => {
    assert.equal(ConceptsSchema.safeParse({ conceitos: [], concepcoes_alternativas: [] }).success, true);
    assert.equal(ConceptsSchema.safeParse({ conceitos: [] }).success, false);
    assert.equal(
      ConceptsSchema.safeParse({
        conceitos: [],
        concepcoes_alternativas: [{ id: 'm1', descricao: 'confunde = com ==', ancora_na_spec: 'MDN: assignment' }],
      }).success,
      true,
    );
    assert.equal(
      ConceptsSchema.safeParse({ conceitos: [], concepcoes_alternativas: [{ id: 'm1', descricao: 'x' }] }).success,
      false,
      'ancora_na_spec é obrigatória',
    );
  });

  it('GraphSchema: duas arestas semanticamente distintas + aulas com role; justificativa antes de role', () => {
    const grafo = {
      conceitos: [{ id: 'c1', nome: 'let' }],
      arestas_duras: [{ de: 'c1', para: 'c2', justificativa: 'precisa do anterior', aprovado: true }],
      arestas_de_uso: [{ de: 'c2', para: 'c1', evidencia: 'usado no exemplo', aprovado: false }],
      aulas: [{ slug: 'a1', introduz: ['c1'], justificativa: 'unidade mínima', role: 'integration', aprovado: true }],
    };
    assert.equal(GraphSchema.safeParse(grafo).success, true);
    assert.equal(GraphSchema.safeParse({ ...grafo, aulas: [{ slug: 'a1', introduz: [], justificativa: 'x', role: 'fora', aprovado: true }] }).success, false, 'role é enum regular|integration');
    assert.equal(GraphSchema.safeParse({ ...grafo, arestas_duras: [{ de: 'c1', para: 'c2', aprovado: true }] }).success, false, 'aresta dura exige justificativa');
    assert.equal(GraphSchema.safeParse({ ...grafo, arestas_de_uso: [{ de: 'c1', para: 'c2', aprovado: true }] }).success, false, 'aresta de uso exige evidencia');
  });

  it('OrderSchema: order de módulo é inteiro não-negativo; posicao idem', () => {
    const ordem = {
      modulos: [{ slug: 'm1', order: 0, justificativa: 'primeiro', aprovado: true }],
      aulas: [{ slug: 'a1', posicao: 0 }],
    };
    assert.equal(OrderSchema.safeParse(ordem).success, true);
    assert.equal(OrderSchema.safeParse({ ...ordem, modulos: [{ slug: 'm1', order: -1, justificativa: 'x', aprovado: true }] }).success, false);
    assert.equal(OrderSchema.safeParse({ ...ordem, modulos: [{ slug: 'm1', order: 1.5, justificativa: 'x', aprovado: true }] }).success, false);
  });
});

// ---------------------------------------------------------------------------
// 4. F4/F5 — orçamento e freeze
// ---------------------------------------------------------------------------

describe('artifacts — BudgetSchema e FreezeSchema', () => {
  function aulaBudget(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ref: 'm1/a1',
      entryConstructs: [],
      budget_entrada: { receptive: [], productive: [] },
      budget_saida: { receptive: ['decl:let'], productive: ['decl:let'] },
      introduces: { receptive: [], productive: ['decl:let'] },
      matrix: [{ construcao: 'decl:let', estado: 'nova' }],
      element_count: 1,
      tetos: { construcoes_produtivas_novas: 2, elementos_interagindo: 3, elementos_nao_interativos: 2, tempo_resolucao_s: 600 },
      ...over,
    };
  }

  it('BudgetSchema: matriz de 3 estados, tetos obrigatórios, fonte/politica/hash fechados', () => {
    const budget = {
      aulas: [aulaBudget()],
      fonte: 'declared',
      politica_de_harness: 'receptive-seed',
      hash: 'a'.repeat(64),
    };
    assert.equal(BudgetSchema.safeParse(budget).success, true);
    for (const estado of ['nao_disponivel', 'disponivel', 'nova']) {
      assert.equal(MatrizEstadoSchema.safeParse(estado).success, true);
    }
    assert.equal(MatrizEstadoSchema.safeParse('talvez').success, false);
    assert.equal(BudgetSchema.safeParse({ ...budget, fonte: 'adivinhado' }).success, false);
    assert.equal(BudgetSchema.safeParse({ ...budget, politica_de_harness: 'none' }).success, true, 'o schema do budget aceita none (é o vocabulário do artefato gerado)');
    assert.equal(BudgetSchema.safeParse({ ...budget, aulas: [aulaBudget({ tetos: { construcoes_produtivas_novas: 2 } })] }).success, false, 'os 4 tetos são obrigatórios');
    assert.equal(BudgetSchema.safeParse({ ...budget, aulas: [aulaBudget({ element_count: -1 })] }).success, false);
  });

  it('FaixasSchema aceita vazios explícitos (ausência semanticamente válida) mas exige os DOIS campos', () => {
    assert.equal(FaixasSchema.safeParse({ receptive: [], productive: [] }).success, true);
    assert.equal(FaixasSchema.safeParse({ receptive: [] }).success, false);
  });

  it('FreezeSchema: hashes/carimbo + dossies E snapshots (listas obrigatórias, itens com hash/caminho)', () => {
    const snapshot = { aula_slug: 'm1/a1', hash: 'b'.repeat(64), caminho: 'dossies/m1-a1.json' };
    const freeze = {
      hash_orcamento: 'a'.repeat(64),
      hash_grafo: 'c'.repeat(64),
      carimbo: '2026-01-01T00:00:00.000Z',
      dossies: [snapshot],
      snapshots: [snapshot],
    };
    assert.equal(FreezeSchema.safeParse(freeze).success, true);
    assert.equal(FreezeSchema.safeParse({ ...freeze, dossies: [] }).success, true, 'vazio explícito é válido');
    assert.equal(FreezeSchema.safeParse({ ...freeze, snapshots: undefined }).success, false, 'ausência não');
    assert.equal(FreezeSchema.safeParse({ ...freeze, snapshots: [{ aula_slug: 'x', hash: '', caminho: 'y' }] }).success, false, 'hash vazio reprova');
  });
});

// ---------------------------------------------------------------------------
// 5. F7/F8 — drafts de aula e desafio
// ---------------------------------------------------------------------------

describe('artifacts — LessonDraftSchema e ChallengeDraftSchema', () => {
  it('lesson draft: ≤2 produtivas, foraDeEscopo OBRIGATÓRIO e não-vazio, status/role fechados', () => {
    assert.equal(LessonDraftSchema.safeParse(lessonDraft()).success, true);
    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ introduces: { receptive: [], productive: ['a', 'b', 'c'] } })).success, false, 'máximo 2 produtivas (A7/I2)');
    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ foraDeEscopo: [] })).success, false, 'foraDeEscopo não-vazio');
    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ foraDeEscopo: undefined })).success, false);
    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ status: 'quase_pronto' })).success, false);
    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ status: 'bloqueado' })).success, true, 'bloqueado é devolutivo previsto');
    for (const secao of ['teoria', 'referencia', 'drill']) {
      assert.equal(LessonDraftSchema.safeParse(lessonDraft({ theory: [{ id: 't', secao, markdown: 'x', tag: '' }] })).success, true, secao);
    }
  });

  it('assertions: AUSÊNCIA vira [] (z.preprocess); >3 ou shape errado REPROVA o draft', () => {
    const semAssertions = lessonDraft();
    delete semAssertions.assertions;
    const r = LessonDraftSchema.safeParse(semAssertions);
    assert.equal(r.success, true);
    if (r.success) assert.deepEqual(r.data.assertions, []);

    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ assertions: [assertion(), assertion({ id: 'a2' }), assertion({ id: 'a3' }), assertion({ id: 'a4' })] })).success, false, 'máximo 3');
    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ assertions: [assertion({ options: ['a', 'b', 'c'] })] })).success, false, 'options é EXATAMENTE 4');
    assert.equal(LessonDraftSchema.safeParse(lessonDraft({ assertions: [assertion({ answerIndex: 4 })] })).success, false, 'answerIndex 0..3 (fail-fast no draft)');
  });

  it('AssertionDraftSchema: sectionId presente é não-vazio; optionRationales é 0 OU 4 (meia-declaração reprova)', () => {
    assert.equal(AssertionDraftSchema.safeParse(assertion()).success, true);
    assert.equal(AssertionDraftSchema.safeParse(assertion({ sectionId: '' })).success, false);
    const semSection = assertion();
    delete semSection.sectionId;
    assert.equal(AssertionDraftSchema.safeParse(semSection).success, false, 'ausência vira "" e "" reprova min(1)');

    assert.equal(AssertionDraftSchema.safeParse(assertion({ optionRationales: [] })).success, true);
    assert.equal(AssertionDraftSchema.safeParse(assertion({ optionRationales: ['a', 'b', 'c', 'd'] })).success, true);
    for (const meio of [1, 2, 3, 5]) {
      assert.equal(
        AssertionDraftSchema.safeParse(assertion({ optionRationales: Array.from({ length: meio }, () => 'x') })).success,
        false,
        `${meio} racionais é meia-declaração`,
      );
    }
  });

  it('challenge draft: language AUSENTE vira DEFAULT "nodejs"; enum de tokens; outputChannel/provas fechados', () => {
    const semLanguage = challengeDraft();
    delete semLanguage.language;
    const r = ChallengeDraftSchema.safeParse(semLanguage);
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.language, 'nodejs', 'mesmo literal que a F12 escrevia');

    for (const linguagem of ['javascript', 'nodejs', 'python', 'python3', 'cpython', 'typescript', 'ts', 'c', 'c11', 'rust', 'rs']) {
      assert.equal(ChallengeDraftSchema.safeParse(challengeDraft({ language: linguagem })).success, true, linguagem);
    }
    assert.equal(ChallengeDraftSchema.safeParse(challengeDraft({ language: 'cobol' })).success, false);
    assert.equal(ChallengeDraftSchema.safeParse(challengeDraft({ expectedTestCount: 0 })).success, false, 'expectedTestCount positivo');
    assert.equal(ChallengeDraftSchema.safeParse(challengeDraft({ outputChannel: 'arquivo' })).success, false, 'outputChannel é retorno|impressao');
    assert.equal(ChallengeDraftSchema.safeParse(challengeDraft({ scenarios: [{ tipo: 'surpresa', derivado_de: 'x', descricao: 'y' }] })).success, false);
    assert.equal(ChallengeDraftSchema.safeParse(challengeDraft({ supportLevel: 'com_estagiario' })).success, false);
  });
});

// ---------------------------------------------------------------------------
// 6. F10/F11/F12 — apontamentos, ações e report
// ---------------------------------------------------------------------------

describe('artifacts — Apontamento/Findings/Actions/Report', () => {
  function evidencia(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      tipo: 'orcamento',
      prova: 'o trecho `soma` viola o orçamento.',
      introduzido_em: null,
      reproduzivel_por: 'mecanico:auditor',
      ...over,
    };
  }

  function alvo(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { caminho: 'aula/lesson.json', linha: 1, span: [0, 10], no_ast: 'Identifier', token: 'soma', ...over };
  }

  it('ApontamentoSchema: evidência ANTES do julgamento; introduzido_em string OU null; confiança 0..1', () => {
    assert.equal(ApontamentoSchema.safeParse(apontamento()).success, true);
    assert.equal(ApontamentoSchema.safeParse(apontamento({ evidencia: evidencia({ introduzido_em: 'm1/a1' }) })).success, true);
    assert.equal(ApontamentoSchema.safeParse(apontamento({ evidencia: evidencia({ introduzido_em: undefined }) })).success, false, 'null declarado, nunca ausente');
    assert.equal(ApontamentoSchema.safeParse(apontamento({ confianca: 1.5 })).success, false);
    assert.equal(ApontamentoSchema.safeParse(apontamento({ alvo: alvo({ linha: 0 }) })).success, false, 'linha positiva');
    for (const categoria of CategoriaSchema.options) {
      assert.equal(ApontamentoSchema.safeParse(apontamento({ categoria })).success, true, `categoria ${categoria}`);
    }
    assert.equal(CategoriaSchema.options.length, 12, 'categorias são a tabela fixa de §6.5');
    assert.deepEqual([...SeveritySchema.options], ['bloqueante', 'corrigir', 'sugestao']);
  });

  it('FindingsSchema: teto de 12 apontamentos (R8) — 13 reprova', () => {
    const base = { artefato: 'lesson-draft', hash_artefato: 'a'.repeat(64), rodada: 1, resumo: 'resumo' };
    const doze = Array.from({ length: 12 }, (_, i) => apontamento({ id: `ap-${i}` }));
    assert.equal(FindingsSchema.safeParse({ ...base, apontamentos: doze }).success, true);
    assert.equal(FindingsSchema.safeParse({ ...base, apontamentos: [...doze, apontamento({ id: 'ap-12' })] }).success, false);
  });

  it('ActionsSchema: ação é do catálogo FECHADO de 14 (ação improvisada não parseia)', () => {
    assert.equal(ACAO_CATALOGO.length, 14);
    const acao = {
      posicao: 0,
      apontamento_id: 'ap-1',
      alvo: { arquivo: 'aula/lesson.json', span: [0, 10] },
      motivo: 'a lacuna exige aula nova',
      acao: 'INSERT_INTERMEDIATE',
      resultado_esperado: 'a construção ganha aula dona',
    };
    assert.equal(ActionsSchema.safeParse({ acoes: [acao] }).success, true);
    for (const a of ACAO_CATALOGO) {
      assert.equal(ActionsSchema.safeParse({ acoes: [{ ...acao, acao: a }] }).success, true, a);
    }
    assert.equal(ActionsSchema.safeParse({ acoes: [{ ...acao, acao: 'INVENTADA' }] }).success, false);
    assert.equal(ActionsSchema.safeParse({ acoes: [{ ...acao, posicao: -1 }] }).success, false);
  });

  it('ReportSchema: placar do repositório, provas ENUM do desafio, limitacoes obrigatório, veredito fechado', () => {
    assert.equal(ReportSchema.safeParse(report()).success, true);
    for (const prova of ['solucao_passa', 'starter_falha', 'contagem_testes', 'stub_vazio_falha']) {
      assert.equal(
        ReportSchema.safeParse(report({ desafios_que_falham: [{ desafio: 'soma', prova, motivo: 'não passa' }] })).success,
        true,
        prova,
      );
    }
    assert.equal(ReportSchema.safeParse(report({ desafios_que_falham: [{ desafio: 'soma', prova: 'types', motivo: 'x' }] })).success, false);
    assert.equal(ReportSchema.safeParse(report({ limitacoes: undefined })).success, false, 'limitação declarada, nunca omitida');
    assert.equal(ReportSchema.safeParse(report({ veredito: 'talvez' })).success, false);
    assert.equal(ReportSchema.safeParse(report({ taxa_falso_passe_revisor: { amostras: 0, frente_a_mutantes: 0, taxa: 2 } })).success, false, 'taxa 0..1');
    assert.equal(
      ReportSchema.safeParse(
        report({
          violacoes_orcamento: [{
            arquivo: 'a.json', campo: 'solutionCode', linha: 1, coluna: 1,
            eixo: 'op', construcao: 'op:binary:+', faixa: 'productive',
            trechoOfensor: '+ 1', primeiraAulaQueEnsina: null, mensagem: 'fora do orçamento',
          }],
        }),
      ).success,
      true,
      'primeiraAulaQueEnsina null = lacuna de currículo (§5.5)',
    );
  });
});

// ---------------------------------------------------------------------------
// 7. O registro (A-P04-2)
// ---------------------------------------------------------------------------

describe('artifacts — SCHEMA_REGISTRY', () => {
  it('fixa os 14 nomes de artefato na ordem do registro', () => {
    assert.deepEqual([...NOMES_DOS_ARTEFATOS], [
      'brief',
      'notional-machine',
      'concepts',
      'graph',
      'order',
      'budget',
      'freeze',
      'lesson-draft',
      'challenge-draft',
      'findings',
      'actions',
      'report',
      'author-output',
      'desafio-author-output',
    ]);
    assert.equal(SCHEMA_REGISTRY.length, 14);
  });

  it('os schemas LAZY do autor resolvem sob demanda (o getter é exercitado)', () => {
    for (const nome of ['author-output', 'desafio-author-output']) {
      const registrado = SCHEMA_REGISTRY.find((s) => s.nome === nome) as SchemaRegistrado;
      assert.ok(registrado !== undefined, `${nome} registrado`);
      assert.ok(typeof registrado.schema.safeParse === 'function', `${nome} resolve para um schema zod utilizável`);
    }
  });

  it('INV-05: nenhum campo de nenhum schema do registro é `.optional()`', () => {
    for (const { nome, schema } of SCHEMA_REGISTRY) {
      const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
      if (shape === undefined) continue; // schemas lazy/efeito — varridos pelo lint de campo
      for (const [campo, def] of Object.entries(shape)) {
        // A INVARIANTE é "nada é ZodOptional": ausência semanticamente válida
        // usa z.preprocess → valor vazio explícito (ex.: assertions → []).
        assert.ok(
          !(def instanceof z.ZodOptional),
          `${nome}.${campo} não pode ser .optional() (INV-05)`,
        );
      }
    }
  });
});
