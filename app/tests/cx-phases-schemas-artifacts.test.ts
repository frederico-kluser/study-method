/**
 * tests/cx-phases-schemas-artifacts.test.ts — CARACTERIZAÇÃO (golden master)
 * de `engine/schemas/artifacts.ts` (os shapes dos artefatos da engine).
 *
 * PINA: os SHAPES como contrato de fronteira — campos obrigatórios (INV-05:
 * ausência reprova, `z.preprocess` materializa vazio explícito só onde o
 * documento prevê), enums FECHADOS (faixas, eixos, categorias, severidade,
 * catálogo de ações, provas do report), limites numéricos (answerIndex 0..3,
 * ≤3 assertions, ≤2 produtivas, apontamentos ≤12, confiança 0..1), a ORDEM
 * justificativa→decisão (INV-04, A-P04-2 — o lint varre esta ordem real, e o
 * pin aqui é por POSIÇÃO EXATA: campo ausente FALHA, índice −1 nunca passa) e
 * o SCHEMA_REGISTRY com seus 14 nomes + schemas lazy resolvíveis.
 *
 * INV-05 é pinado com a REGRA do lint REAL (`encontrarCamposOpcionais`,
 * schemas/fieldOrder.ts) — negar ZodOptional, ZodDefault e união-com-undefined
 * em todo nó — e com COBERTURA SUPERSET: a varredura recursiva desce a árvore
 * zod INTEIRA de TODO o SCHEMA_REGISTRY (topo, aninhados, arrays, tuplas INCLUINDO
 * `rest`, records (chave E valor), uniões, catchall, effects, lazy) e ainda o
 * que o lint atual NÃO desce (blind spots listados em
 * `cx-phases-gap-lint-real.test.ts` — bug R, fix na Onda 3). INV-04 é pinado
 * por POSIÇÃO EXATA em TODOS os pares decisão×justificativa reais do registro.
 * Provas de mutação por fixture; produção intocada.
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
import {
  DECISION_FIELD_NAMES,
  JUSTIFICATION_FIELD_NAMES,
} from '../electron/main/engine/schemas/fieldOrder';

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

/**
 * Posição EXATA de um campo na ordem de declaração do shape (INV-04) — e o
 * campo AUSENTE FALHA: `indexOf` solto devolvia −1 e o "−1 < x" passava o
 * campo ausente como ordenado. Aqui, ausente reprova nomeando o campo.
 */
function posicao(chaves: readonly string[], campo: string, contexto: string): number {
  const indice = chaves.indexOf(campo);
  assert.notEqual(
    indice,
    -1,
    `${contexto}: campo obrigatório "${campo}" sumiu do shape — o par justificativa→decisão só é ordenável com os DOIS presentes`,
  );
  return indice;
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

  it('a ORDEM real dos campos é PINADA por POSIÇÃO EXATA: justificativa/motivo antes de aprovado/ação, e campo AUSENTE falha', () => {
    // INV-04 (A-P04-2): o lint `lintOrdemCampos` (schemas/fieldOrder.ts) varre
    // ESTA ordem. A régua é a POSIÇÃO EXATA (helper `posicao`, acima — campo
    // ausente FALHA, índice −1 nunca passa). Os índices exatos do par
    // justificativa→decisão já implicam a ordem: 7 < 8 etc. Estes são os 5
    // pares do DOCUMENTO (o de apontamento não está nas tabelas do lint); a
    // seção 7 pinna TODOS os pares das tabelas do lint, em todo o registro.

    const chavesBrief = Object.keys(BriefSchema.shape);
    assert.equal(posicao(chavesBrief, 'justificativa', 'brief'), 7, 'brief: justificativa na posição exata 7');
    assert.equal(posicao(chavesBrief, 'aprovado', 'brief'), 8, 'brief: aprovado na posição exata 8');

    const chavesAula = Object.keys(LessonDraftSchema.shape);
    assert.equal(posicao(chavesAula, 'justificativa', 'lesson-draft'), 14, 'lesson: justificativa na posição exata 14');
    assert.equal(posicao(chavesAula, 'role', 'lesson-draft'), 15, 'lesson: role na posição exata 15');
    assert.equal(posicao(chavesAula, 'status', 'lesson-draft'), 16, 'lesson: status na posição exata 16');

    const chavesAcao = Object.keys(ActionsSchema.shape.acoes.element.shape);
    assert.equal(posicao(chavesAcao, 'motivo', 'actions.acoes[]'), 3, 'ações: motivo na posição exata 3');
    assert.equal(posicao(chavesAcao, 'acao', 'actions.acoes[]'), 4, 'ações: acao na posição exata 4');

    const chavesReport = Object.keys(ReportSchema.shape);
    assert.equal(posicao(chavesReport, 'justificativa', 'report'), 12, 'report: justificativa na posição exata 12');
    assert.equal(posicao(chavesReport, 'veredito', 'report'), 13, 'report: veredito na posição exata 13');

    const chavesApontamento = Object.keys(ApontamentoSchema.shape);
    assert.equal(posicao(chavesApontamento, 'evidencia', 'apontamento'), 4, 'apontamento: evidencia na posição exata 4');
    assert.equal(posicao(chavesApontamento, 'defeito', 'apontamento'), 5, 'apontamento: defeito na posição exata 5');
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
// 7. O registro (A-P04-2) — INV-05 pela régua do lint REAL (árvore inteira)
// ---------------------------------------------------------------------------

/** Um nó opcional encontrado pela varredura recursiva (a regra do lint real). */
type ProblemaOpcionalDeTeste = {
  caminho: string;
  tipo: 'ZodOptional' | 'ZodDefault' | 'uniao-com-undefined';
};

interface VarreduraZodDeTeste {
  /** caminho de TODO nó visitado — prova de que a varredura ENTROU na árvore. */
  visitados: string[];
  opcionais: ProblemaOpcionalDeTeste[];
}

/** Um shape de objeto visitado na árvore (topo ou aninhado) e a ordem das chaves. */
interface ShapeColetado {
  registro: string;
  caminho: string;
  chaves: string[];
}

/** Um par real decisão×justificativa (tabelas do lint) com as posições EXATAS. */
interface ParInv04Pinado {
  registro: string;
  caminho: string;
  campo_decisao: string;
  indice_decisao: number;
  campo_justificativa: string;
  indice_justificativa: number;
}

/**
 * Teto fail-closed da varredura: árvore finita mas gigante estoura FALHANDO.
 * Lazy DEGENERADO (getter que fabrica um schema novo a cada chamada) morre
 * antes disso com RangeError de stack — também FALHA, nunca passa em silêncio;
 * o teto existe para a falha sair nomeada quando a árvore for apenas vasta.
 */
const TETO_DE_NOS_DA_VARREDURA = 10_000;

/**
 * Nó zod SEM depender da identidade da classe: `instanceof z.ZodType` é FALSO
 * quando o zod é carregado duas vezes (ESM×CJS — medido: `node -e` carrega
 * cópia diferente do tsx e o instanceof nega tudo), o que faria a varredura
 * pular a árvore inteira. O contrato real é `_def` + `safeParse`.
 */
function ehNoZod(valor: unknown): valor is z.ZodTypeAny {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as { safeParse?: unknown }).safeParse === 'function' &&
    typeof (valor as { _def?: unknown })._def === 'object'
  );
}

/**
 * CAMINHADA RECURSIVA da árvore zod INTEIRA — SUPERSET da régua do lint real
 * (`caminhar`/`encontrarCamposOpcionais`, schemas/fieldOrder.ts). Desce objeto
 * (shape + catchall), array, tupla (`items` E `rest` — o repro do revisor),
 * record (chave E valor), lazy (getter resolvido) e, pelo fallback genérico
 * que roda SEMPRE no fim, TODO filho zod guardado em `_def`: `options` de
 * união (array e `optionsMap` de discriminated), `innerType`, `type`, `schema`,
 * `left`/`right`, `in`/`out`… O que um caso explícito esquecer não escapa —
 * exatamente o que já escapou do lint (ver blind spots documentados em
 * `cx-phases-gap-lint-real.test.ts` — bug R).
 */
function caminharZod(
  raiz: unknown,
  visitarNo: (schema: z.ZodTypeAny, caminho: string, tipo: string) => void,
): void {
  const vistos = new Set<z.ZodTypeAny>();
  let nos = 0;

  const descer = (no: unknown, caminho: string): void => {
    if (!ehNoZod(no) || vistos.has(no)) return;
    vistos.add(no);
    nos += 1;
    if (nos > TETO_DE_NOS_DA_VARREDURA) {
      throw new Error(`varredura zod estourou o teto de ${TETO_DE_NOS_DA_VARREDURA} nós — árvore degenerada?`);
    }

    const def = (no._def ?? {}) as Record<string, unknown> & { typeName?: string };
    const tipo = def.typeName ?? 'desconhecido';
    visitarNo(no, caminho, tipo);

    switch (tipo) {
      case 'ZodObject':
        for (const [chave, filho] of Object.entries((no as z.ZodObject<z.ZodRawShape>).shape)) {
          descer(filho, caminho === '' ? chave : `${caminho}.${chave}`);
        }
        break;
      case 'ZodLazy':
        descer((def as { getter: () => unknown }).getter(), caminho);
        break;
      case 'ZodArray':
        descer(def.type, `${caminho}[]`);
        break;
      case 'ZodTuple':
        for (const item of ((def.items as unknown[] | undefined) ?? [])) descer(item, `${caminho}[]`);
        descer(def.rest, `${caminho}[]`);
        break;
      case 'ZodRecord':
        descer(def.keyType, `${caminho}{}`);
        descer(def.valueType, `${caminho}[]`);
        break;
      default:
        break;
    }

    // Fallback genérico SEMPRE (idempotente — `vistos` impede duplicata): todo
    // filho zod guardado em `_def` (arrays, Maps de `optionsMap`, `innerType`,
    // `catchall`, `left`/`right`, `in`/`out`…) também desce. Os casos
    // explícitos acima só acertam o FORMATO do caminho; nada fica de fora.
    for (const valor of Object.values(def)) {
      if (Array.isArray(valor)) {
        for (const item of valor) descer(item, caminho);
      } else if (valor instanceof Map) {
        for (const item of valor.values()) descer(item, caminho);
      } else {
        descer(valor, caminho);
      }
    }
  };

  descer(raiz, '');
}

/**
 * INV-05 — varredura dos OPCIONAIS pela mesma regra do lint real (cobertura
 * superset): ZodOptional, ZodDefault e união-com-undefined em QUALQUER nó.
 * `z.null()` em união NÃO é opcional (é vazio EXPLÍCITO).
 */
function varrerOpcionais(raiz: z.ZodTypeAny): VarreduraZodDeTeste {
  const visitados: string[] = [];
  const opcionais: ProblemaOpcionalDeTeste[] = [];
  caminharZod(raiz, (no, caminho, tipo) => {
    const exibido = caminho === '' ? '(raiz)' : caminho;
    visitados.push(exibido);
    const def = no._def as Record<string, unknown>;
    if (tipo === 'ZodOptional') {
      opcionais.push({ caminho: exibido, tipo: 'ZodOptional' });
    } else if (tipo === 'ZodDefault') {
      opcionais.push({ caminho: exibido, tipo: 'ZodDefault' });
    } else if (tipo === 'ZodUnion' || tipo === 'ZodDiscriminatedUnion') {
      const opcoes: unknown[] = Array.isArray(def.options)
        ? def.options
        : def.options instanceof Map
          ? [...def.options.values()]
          : [];
      const aceitaUndefined = opcoes.some(
        (opcao) => ehNoZod(opcao) && (opcao._def as { typeName?: string }).typeName === 'ZodUndefined',
      );
      if (aceitaUndefined) opcionais.push({ caminho: exibido, tipo: 'uniao-com-undefined' });
    }
  });
  return { visitados, opcionais };
}

/** Todos os shapes de objeto do registro — topo e aninhados, lazy inclusos. */
function coletarShapesDoRegistro(): ShapeColetado[] {
  const shapes: ShapeColetado[] = [];
  for (const { nome, schema } of SCHEMA_REGISTRY) {
    caminharZod(schema, (no, caminho, tipo) => {
      if (tipo === 'ZodObject') {
        shapes.push({
          registro: nome,
          caminho: caminho === '' ? '(raiz)' : caminho,
          chaves: Object.keys((no as z.ZodObject<z.ZodRawShape>).shape),
        });
      }
    });
  }
  return shapes;
}

/**
 * INV-04 — todos os pares reais decisão×justificativa das TABELAS DO LINT
 * (`DECISION_FIELD_NAMES` × `JUSTIFICATION_FIELD_NAMES`, fieldOrder.ts), na
 * ordem de varredura do lint (justificativa por fora, decisão por dentro).
 */
function derivarParesInv04(): ParInv04Pinado[] {
  const pares: ParInv04Pinado[] = [];
  for (const { registro, caminho, chaves } of coletarShapesDoRegistro()) {
    for (const campo_justificativa of JUSTIFICATION_FIELD_NAMES) {
      const indice_justificativa = chaves.indexOf(campo_justificativa);
      if (indice_justificativa === -1) continue;
      for (const campo_decisao of DECISION_FIELD_NAMES) {
        const indice_decisao = chaves.indexOf(campo_decisao);
        if (indice_decisao === -1) continue;
        pares.push({ registro, caminho, campo_decisao, indice_decisao, campo_justificativa, indice_justificativa });
      }
    }
  }
  return pares;
}

/**
 * GOLDEN MASTER dos 21 pares decisão×justificativa reais do SCHEMA_REGISTRY
 * (derivados pela função acima; ordem = ordem de varredura do lint). Mudança
 * de posição, campo SUMIDO ou par novo reprova o teste da seção 7.
 */
const PARES_INV04: readonly ParInv04Pinado[] = [
  { registro: 'brief', caminho: '(raiz)', campo_decisao: 'aprovado', indice_decisao: 8, campo_justificativa: 'justificativa', indice_justificativa: 7 },
  { registro: 'concepts', caminho: 'conceitos[]', campo_decisao: 'atomico', indice_decisao: 11, campo_justificativa: 'raciocinio_de_projeto', indice_justificativa: 10 },
  { registro: 'graph', caminho: 'arestas_duras[]', campo_decisao: 'aprovado', indice_decisao: 3, campo_justificativa: 'justificativa', indice_justificativa: 2 },
  { registro: 'graph', caminho: 'arestas_de_uso[]', campo_decisao: 'aprovado', indice_decisao: 3, campo_justificativa: 'evidencia', indice_justificativa: 2 },
  { registro: 'graph', caminho: 'aulas[]', campo_decisao: 'aprovado', indice_decisao: 4, campo_justificativa: 'justificativa', indice_justificativa: 2 },
  { registro: 'graph', caminho: 'aulas[]', campo_decisao: 'role', indice_decisao: 3, campo_justificativa: 'justificativa', indice_justificativa: 2 },
  { registro: 'order', caminho: 'modulos[]', campo_decisao: 'aprovado', indice_decisao: 3, campo_justificativa: 'justificativa', indice_justificativa: 2 },
  { registro: 'lesson-draft', caminho: '(raiz)', campo_decisao: 'aprovado', indice_decisao: 17, campo_justificativa: 'justificativa', indice_justificativa: 14 },
  { registro: 'lesson-draft', caminho: '(raiz)', campo_decisao: 'role', indice_decisao: 15, campo_justificativa: 'justificativa', indice_justificativa: 14 },
  { registro: 'lesson-draft', caminho: '(raiz)', campo_decisao: 'status', indice_decisao: 16, campo_justificativa: 'justificativa', indice_justificativa: 14 },
  { registro: 'challenge-draft', caminho: '(raiz)', campo_decisao: 'aprovado', indice_decisao: 20, campo_justificativa: 'justificativa', indice_justificativa: 19 },
  { registro: 'actions', caminho: 'acoes[]', campo_decisao: 'acao', indice_decisao: 4, campo_justificativa: 'motivo', indice_justificativa: 3 },
  { registro: 'report', caminho: '(raiz)', campo_decisao: 'veredito', indice_decisao: 13, campo_justificativa: 'justificativa', indice_justificativa: 12 },
  { registro: 'author-output', caminho: '(raiz)', campo_decisao: 'aprovado', indice_decisao: 18, campo_justificativa: 'justificativa', indice_justificativa: 15 },
  { registro: 'author-output', caminho: '(raiz)', campo_decisao: 'role', indice_decisao: 16, campo_justificativa: 'justificativa', indice_justificativa: 15 },
  { registro: 'author-output', caminho: '(raiz)', campo_decisao: 'status', indice_decisao: 17, campo_justificativa: 'justificativa', indice_justificativa: 15 },
  { registro: 'author-output', caminho: '(raiz)', campo_decisao: 'aprovado', indice_decisao: 18, campo_justificativa: 'raciocinio_de_projeto', indice_justificativa: 0 },
  { registro: 'author-output', caminho: '(raiz)', campo_decisao: 'role', indice_decisao: 16, campo_justificativa: 'raciocinio_de_projeto', indice_justificativa: 0 },
  { registro: 'author-output', caminho: '(raiz)', campo_decisao: 'status', indice_decisao: 17, campo_justificativa: 'raciocinio_de_projeto', indice_justificativa: 0 },
  { registro: 'desafio-author-output', caminho: '(raiz)', campo_decisao: 'aprovado', indice_decisao: 21, campo_justificativa: 'justificativa', indice_justificativa: 20 },
  { registro: 'desafio-author-output', caminho: '(raiz)', campo_decisao: 'aprovado', indice_decisao: 21, campo_justificativa: 'raciocinio_de_projeto', indice_justificativa: 0 },
];

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

  it('INV-05: varredura RECURSIVA da árvore zod de TODO o SCHEMA_REGISTRY — nada é ZodDefault, ZodOptional nem união-com-undefined', () => {
    // REGRA DO LINT REAL (`encontrarCamposOpcionais`, schemas/fieldOrder.ts):
    // negar ZodOptional, ZodDefault e união-com-undefined em todo nó. A
    // COBERTURA aqui é SUPERSET do lint (a varredura desce também tuple-rest,
    // record-key, catchall, readonly/interseção/pipeline/discriminatedUnion —
    // os blind spots que o lint atual NÃO desce, listados em
    // `cx-phases-gap-lint-real.test.ts`, bug R). A árvore é INTEIRA: os 14
    // registros, lazy resolvidos (author-output e desafio-author-output) e
    // nós de EFEITO (`z.preprocess`), que o pin antigo pulava por não ter
    // `shape`. Ausência semanticamente válida é valor vazio EXPLÍCITO
    // materializado por `z.preprocess` (ex.: assertions → [], sectionId → "")
    // ou `z.null()` em união — nunca `.optional()`, `.default()` ou
    // `undefined` em união.
    //
    // PROVA DE MUTAÇÃO (sem tocar produção): adicionar `z.string().default('')`
    // — ou `.optional()`, ou `z.union([z.string(), z.undefined()])`, ou
    // `.rest(...optional)` em tupla — em QUALQUER nó de QUALQUER schema do
    // registro reprova ESTE teste, como provam as fixtures dos testes seguintes.
    for (const { nome, schema } of SCHEMA_REGISTRY) {
      const { visitados, opcionais } = varrerOpcionais(schema);
      assert.deepEqual(opcionais, [], `${nome}: nenhum nó da árvore zod pode ser opcional (INV-05)`);
      assert.ok(
        visitados.length >= 5,
        `${nome}: a varredura precisa ENTRAR na árvore inteira (lazy/efeito inclusos) — visitou só ${visitados.length} nó(s)`,
      );
    }
  });

  it('INV-05 (prova de mutação): a varredura reprova `.default()`, `.optional()` aninhado, união-com-undefined e o mesmo sob array/tupla/record/lazy/efeito', () => {
    // Se alguém adicionar `z.string().default('')` num schema real, o pin acima
    // reprova EXATAMENTE como este fixture reprova aqui.
    const casos: Array<[string, z.ZodTypeAny, ProblemaOpcionalDeTeste[]]> = [
      [
        'a mutação `z.string().default(\'\')` num campo de objeto reprova',
        z.object({ campo: z.string().default('') }),
        [{ caminho: 'campo', tipo: 'ZodDefault' }],
      ],
      [
        'a MESMA mutação num schema REAL derivado do registro (BriefSchema.extend) reprova',
        BriefSchema.extend({ apelido: z.string().default('') }),
        [{ caminho: 'apelido', tipo: 'ZodDefault' }],
      ],
      [
        '.optional() ANINHADO (objeto.dentro.array[]) reprova',
        z.object({ aninhado: z.object({ dentro: z.array(z.string().optional()) }) }),
        [{ caminho: 'aninhado.dentro[]', tipo: 'ZodOptional' }],
      ],
      [
        'união-com-undefined sob LAZY reprova (o getter resolve e a árvore entra)',
        z.lazy(() => z.object({ escondido: z.union([z.string(), z.undefined()]) })),
        [{ caminho: 'escondido', tipo: 'uniao-com-undefined' }],
      ],
      [
        '`.default()` sob EFEITO (z.preprocess) reprova (efeito não esconde)',
        z.preprocess((v: unknown) => v, z.object({ d: z.string().default('x') })),
        [{ caminho: 'd', tipo: 'ZodDefault' }],
      ],
      [
        'opcional em elemento de TUPLA reprova',
        z.object({ t: z.tuple([z.string(), z.number().optional()]) }),
        [{ caminho: 't[]', tipo: 'ZodOptional' }],
      ],
      [
        'opcional no REST de tupla reprova (repro do revisor: z.tuple([...]).rest(z.string().optional()))',
        z.object({ t: z.tuple([z.string()]).rest(z.string().optional()) }),
        [{ caminho: 't[]', tipo: 'ZodOptional' }],
      ],
      [
        'opcional sob INTERSEÇÃO reprova (o lint atual NÃO pega — superset)',
        z.intersection(z.object({ a: z.string() }), z.object({ b: z.string().optional() })),
        [{ caminho: 'b', tipo: 'ZodOptional' }],
      ],
      [
        'default em valor de RECORD reprova',
        z.object({ r: z.record(z.string().default('')) }),
        [{ caminho: 'r[]', tipo: 'ZodDefault' }],
      ],
      [
        'optional na RAIZ reprova',
        z.object({ x: z.string() }).optional(),
        [{ caminho: '(raiz)', tipo: 'ZodOptional' }],
      ],
    ];
    for (const [rotulo, schema, esperado] of casos) {
      assert.deepEqual(varrerOpcionais(schema).opcionais, esperado, rotulo);
    }
  });

  it('INV-05 (controle negativo): `z.null()` em união e o `z.preprocess` de vazio explícito NÃO são opcionais', () => {
    assert.deepEqual(varrerOpcionais(z.object({ e: z.union([z.string(), z.null()]) })).opcionais, [], 'null explícito é permitido');
    assert.deepEqual(
      varrerOpcionais(z.object({ a: z.preprocess((v: unknown) => (v === undefined ? [] : v), z.array(z.string())) })).opcionais,
      [],
      'o idioma do projeto (ausência → vazio explícito) não é opcionalidade',
    );
    assert.deepEqual(varrerOpcionais(z.object({ a: z.string() })).opcionais, []);
  });

  it('INV-04: TODOS os pares decisão×justificativa do registro (tabelas do lint) têm posição EXATA e campo ausente reprova', () => {
    // O pin clássico da seção 1 cobre os 5 pares do DOCUMENTO; ESTE cobre TODOS
    // os pares reais das tabelas do lint (`DECISION_FIELD_NAMES` ×
    // `JUSTIFICATION_FIELD_NAMES`) em TODOS os shapes — topo e aninhados — dos
    // 14 registros, lazy inclusos. Bug R (registrado; fix na Onda 3): o lint
    // real `continue`s no `indexOf === -1` (fieldOrder.ts:177-180) — campo
    // AUSENTO de um par não pinado some do relato em silêncio (ex.: remover
    // `raciocinio_de_projeto` de ConceitoAtomicoSchema ou `justificativa` de
    // OrderSchema.modulos). Este pin fecha o furo no lado do teste: para cada
    // par ESPERADO, os DOIS campos precisam EXISTIR (helper `posicao` falha
    // nomeando o ausente) e ocupar a posição EXATA; e o conjunto derivado
    // precisa bater INTEIRO — par sumido, par novo ou posição mudada reprova.
    const shapes = coletarShapesDoRegistro();
    for (const par of PARES_INV04) {
      const contexto = `${par.registro}@${par.caminho}`;
      const shape = shapes.find((s) => s.registro === par.registro && s.caminho === par.caminho);
      assert.ok(shape !== undefined, `${contexto}: shape do par sumiu da árvore do registro`);
      assert.equal(
        posicao(shape.chaves, par.campo_justificativa, contexto),
        par.indice_justificativa,
        `${contexto}: posição exata da justificativa "${par.campo_justificativa}"`,
      );
      assert.equal(
        posicao(shape.chaves, par.campo_decisao, contexto),
        par.indice_decisao,
        `${contexto}: posição exata da decisão "${par.campo_decisao}"`,
      );
    }
    assert.deepEqual(derivarParesInv04(), PARES_INV04, 'o conjunto INTEIRO de pares decisão×justificativa do registro é o golden master');
  });
});
