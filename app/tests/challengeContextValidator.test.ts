/**
 * tests/challengeContextValidator.test.ts — validador pedagógico de desafios
 * (onda 1 context-validator).
 *
 * Cobre:
 *   - trackTypes: validação do entryCriteria da trilha (campo novo).
 *   - buildChallengeContext: ordem sequencial (módulos por `order`, aulas na
 *     ordem do array), aula atual EXCLUÍDA das anteriores + incluída como
 *     currentLesson, entryCriteria, truncamento da teoria das anteriores.
 *   - buildValidationPrompt: thinking máximo explícito + veredito POR TESTE
 *     (JSON parseável, um item por test('...')).
 *   - verifyChallengeAgainstContext: veredito por teste com llm fake; JSON
 *     inválido → retry 1x com feedback → sucesso ou erro estruturado; llm
 *     indisponível → erro estruturado (NUNCA veredito falso).
 *   - CASO CONCRETO (somar): assert.throws sem validação ensinada no contexto
 *     → teste reprova; com aula anterior que ensina typeof/throws → aprova.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PREVIOUS_LESSON_THEORY_TRUNCATE,
  NO_ENTRY_CRITERIA_LABEL,
  buildChallengeContext,
  buildValidationPrompt,
  countTests,
  verifyChallengeAgainstContext,
  type ChallengeContext,
  type ContextValidatorLlm,
} from '../electron/main/services/challengeContextValidator';
import { validateTrackSource } from '../electron/main/content/trackTypes';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';

// ---------------------------------------------------------------------------
// Fixtures (PURAS — nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

function makeLesson(slug: string, over: Partial<LoadedLesson['meta']> = {}): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: `Aula ${slug}`,
      summary: 'Resumo.',
      difficulty: 1,
      concepts: ['conceito-x'],
      prerequisites: [],
      theory: [{ id: 's1', title: 'Seção 1', markdown: `Teoria da aula ${slug}.` }],
      sources: [],
      challenges: [],
      ...over,
    },
    challenges: [],
  };
}

function makeModule(slug: string, order: number, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: `Módulo ${slug}`,
      order,
      lessons: lessons.map((l) => l.meta.slug),
    },
    lessons,
    challenge: null,
  };
}

function makeTrack(over: Partial<LoadedTrack> = {}): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'trilha-teste',
      title: 'Trilha Teste',
      description: 'Trilha de teste.',
      language: 'pt-BR',
      domain: 'programming',
      modules: [],
    },
    modules: [],
    proficiency: null,
    dir: '/tmp/trilha-teste',
    ...over,
  };
}

/** Llm fake que grava as chamadas e devolve conteúdo programável por chamada. */
function fakeLlm(
  respond: (attempt: number, req: { messages: Array<{ role: string; content: string }> }) => { content: string } | Promise<{ content: string }> | null,
) {
  const calls: Array<{ messages: Array<{ role: 'system' | 'user'; content: string }>; temperature?: number; timeoutMs?: number }> = [];
  const llm: ContextValidatorLlm = async (req) => {
    calls.push(req);
    const r = await respond(calls.length, req);
    if (r === null) throw new Error('boom da llm fake');
    return r;
  };
  return { llm, calls };
}

/** testsCode do caso concreto "somar" — 4 test()s, o último exige assert.throws. */
const SOMAR_TESTS = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { somar } from './solution.mjs';

test('soma dois números positivos', () => {
  assert.equal(somar(2, 3), 5);
});

test('soma número negativo com positivo', () => {
  assert.equal(somar(-4, 10), 6);
});

test('soma dois zeros', () => {
  assert.equal(somar(0, 0), 0);
});

test('recusa texto em vez de número', () => {
  assert.throws(() => somar('2', 3));
});
`;

const SOMAR_SOLUTION = `export function somar(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('ambos precisam ser números');
  }
  return a + b;
}
`;

/** Veredito da llm fake para o caso somar: só o teste de recusa reprova. */
function somarVerdictJson(recusaAprovado: boolean, motivo: string): string {
  return JSON.stringify({
    aprovado: recusaAprovado,
    testes: [
      { nome: 'soma dois números positivos', aprovado: true, motivo: 'Soma de números está na aula.' },
      { nome: 'soma número negativo com positivo', aprovado: true, motivo: 'Soma de negativos está na aula.' },
      { nome: 'soma dois zeros', aprovado: true, motivo: 'Soma com zero está na aula.' },
      { nome: 'recusa texto em vez de número', aprovado: recusaAprovado, motivo },
    ],
  });
}

// ---------------------------------------------------------------------------
// trackTypes — entryCriteria (campo novo na raiz da trilha)
// ---------------------------------------------------------------------------

function rawTrack(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: 'trilha-x',
    title: 'Trilha X',
    description: 'Descrição.',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['m1'],
    ...over,
  };
}

describe('trackTypes: entryCriteria da trilha', () => {
  it('entryCriteria ausente → válido (trilha de senso iniciante, sem critérios)', () => {
    assert.equal(validateTrackSource(rawTrack(), 'track.json').length, 0);
  });

  it('entryCriteria presente com strings não vazias → válido', () => {
    const issues = validateTrackSource(rawTrack({ entryCriteria: ['Somar números de cabeça', 'Saber ler'] }), 'track.json');
    assert.equal(issues.length, 0);
  });

  it('entryCriteria com item vazio → issue apontando o índice', () => {
    const issues = validateTrackSource(rawTrack({ entryCriteria: ['Válido', '', '  '] }), 'track.json');
    assert.equal(issues.length, 2, 'dois itens vazios, duas issues');
    assert.ok(issues.every((i) => i.file === 'track.json'));
    assert.match(issues[0].message, /entryCriteria\[1\]/);
    assert.match(issues[1].message, /entryCriteria\[2\]/);
  });

  it('entryCriteria não-array → issue', () => {
    const issues = validateTrackSource(rawTrack({ entryCriteria: 'somar de cabeça' }), 'track.json');
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /entryCriteria inválido/);
  });
});

// ---------------------------------------------------------------------------
// buildChallengeContext — sequência, exclusão da atual, entryCriteria, trunca
// ---------------------------------------------------------------------------

describe('buildChallengeContext', () => {
  it('módulos ordenados por `order` (não pela ordem do array) e aulas na ordem do array; atual EXCLUÍDA das anteriores', () => {
    // Ordem do DISCO (array modules) ≠ ordem PEDAGÓGICA (order): m2 vem antes de m1.
    const m1 = makeModule('m1', 1, [makeLesson('m1-l1'), makeLesson('m1-l2'), makeLesson('m1-l3')]);
    const m2 = makeModule('m2', 2, [makeLesson('m2-l1')]);
    const track = makeTrack({ modules: [m2, m1] });

    const ctx = buildChallengeContext(track, 'm1', 'm1-l3');
    assert.deepEqual(
      ctx.previousLessons.map((l) => l.slug),
      ['m1-l1', 'm1-l2'],
      'aulas do módulo anterior na ordem do array, SEM a aula atual',
    );
    assert.deepEqual(ctx.currentLesson.slug, 'm1-l3');
    // Nada do módulo posterior (m2) pode aparecer como "anterior".
    assert.ok(!ctx.previousLessons.some((l) => l.slug.startsWith('m2')));
  });

  it('aula do 2º módulo → anteriores = TODAS as aulas do 1º + as anteriores dela no próprio módulo', () => {
    const m1 = makeModule('m1', 1, [makeLesson('m1-l1'), makeLesson('m1-l2')]);
    const m2 = makeModule('m2', 2, [makeLesson('m2-l1'), makeLesson('m2-l2')]);
    const track = makeTrack({ modules: [m1, m2] });

    const ctx = buildChallengeContext(track, 'm2', 'm2-l2');
    assert.deepEqual(
      ctx.previousLessons.map((l) => l.slug),
      ['m1-l1', 'm1-l2', 'm2-l1'],
      '1º módulo inteiro + anteriores do próprio módulo, na ordem da trilha',
    );
    assert.deepEqual(ctx.currentLesson.slug, 'm2-l2');
  });

  it('primeira aula da trilha → sem aulas anteriores', () => {
    const m1 = makeModule('m1', 1, [makeLesson('m1-l1')]);
    const ctx = buildChallengeContext(makeTrack({ modules: [m1] }), 'm1', 'm1-l1');
    assert.deepEqual(ctx.previousLessons, []);
    assert.deepEqual(ctx.currentLesson.slug, 'm1-l1');
  });

  it('entryCriteria da trilha entra no contexto; ausente → array vazio', () => {
    const m1 = makeModule('m1', 1, [makeLesson('m1-l1')]);
    const com = makeTrack({ modules: [m1], root: { ...makeTrack().root, entryCriteria: ['Aritmética básica'] } });
    assert.deepEqual(buildChallengeContext(com, 'm1', 'm1-l1').entryCriteria, ['Aritmética básica']);

    const sem = makeTrack({ modules: [m1] });
    assert.deepEqual(buildChallengeContext(sem, 'm1', 'm1-l1').entryCriteria, []);
  });

  it('teoria das aulas ANTERIORES truncada (1500 chars); a atual vem COMPLETA', () => {
    const longMarkdown = 'A'.repeat(3000);
    const m1 = makeModule('m1', 1, [
      makeLesson('m1-l1', { theory: [{ id: 's1', title: 'S1', markdown: longMarkdown }] }),
      makeLesson('m1-l2', { theory: [{ id: 's1', title: 'S1', markdown: longMarkdown }] }),
    ]);
    const ctx = buildChallengeContext(makeTrack({ modules: [m1] }), 'm1', 'm1-l2');

    assert.equal(ctx.previousLessons.length, 1);
    assert.equal(ctx.previousLessons[0].theoryExcerpt.length, PREVIOUS_LESSON_THEORY_TRUNCATE, 'anterior truncada em 1500');
    assert.equal(ctx.currentLesson.theory.length, 3000, 'aula atual com a teoria COMPLETA (sem truncar)');
  });

  it('aula/módulo inexistente → erro claro (nunca contexto parcial)', () => {
    const m1 = makeModule('m1', 1, [makeLesson('m1-l1')]);
    const track = makeTrack({ modules: [m1] });
    assert.throws(() => buildChallengeContext(track, 'm1', 'nao-existe'), /não encontrada/);
    assert.throws(() => buildChallengeContext(track, 'nao-existe', 'm1-l1'), /não encontrada/);
  });
});

// ---------------------------------------------------------------------------
// buildValidationPrompt — thinking máximo + veredito por teste
// ---------------------------------------------------------------------------

describe('buildValidationPrompt', () => {
  const m1 = makeModule('m1', 1, [makeLesson('m1-l1'), makeLesson('m1-l2')]);
  const track = makeTrack({ modules: [m1] });
  const ctx = buildChallengeContext(track, 'm1', 'm1-l2');

  it('exige thinking máximo EXPLÍCITO (deepseek lê reasoning_content; não há effort por API)', () => {
    const prompt = buildValidationPrompt(ctx, { title: 'Somar', statement: 'S', testsCode: SOMAR_TESTS, solutionCode: SOMAR_SOLUTION });
    assert.match(prompt, /PENSE PROFUNDAMENTE, PASSO A PASSO/);
    assert.match(prompt, /reasoning_content/);
    assert.match(prompt, /validador PEDAGÓGICO/i);
  });

  it('pede veredito POR TESTE em JSON parseável — um item por test(\'...\')', () => {
    const prompt = buildValidationPrompt(ctx, { title: 'Somar', statement: 'S', testsCode: SOMAR_TESTS, solutionCode: SOMAR_SOLUTION });
    assert.match(prompt, /UM item por test\('\.\.\.'\)/);
    assert.match(prompt, /"aprovado": boolean/);
    assert.match(prompt, /"testes": \[\s*\{ "nome": string, "aprovado": boolean, "motivo": string \} \]/);
    assert.match(prompt, /assert\.throws/);
    assert.match(prompt, /typeof/);
  });

  it('inclui o contexto completo: critérios, aulas anteriores e a aula atual', () => {
    const prompt = buildValidationPrompt(ctx, { title: 'Somar', statement: 'S', testsCode: SOMAR_TESTS, solutionCode: SOMAR_SOLUTION });
    assert.match(prompt, /Teoria da aula m1-l1\./);
    assert.match(prompt, /Teoria da aula m1-l2\./);
    assert.match(prompt, /Critérios de entrada da trilha/);
    assert.match(prompt, /Aula atual/);
  });

  it('sem entryCriteria → marca "(nenhum — trilha de senso iniciante)"', () => {
    const prompt = buildValidationPrompt(ctx, { title: 'Somar', statement: 'S', testsCode: SOMAR_TESTS, solutionCode: SOMAR_SOLUTION });
    assert.match(prompt, new RegExp(NO_ENTRY_CRITERIA_LABEL.replace(/[()]/g, '\\$&')));
  });

  it('com entryCriteria → lista os critérios (sem a marca de nenhum)', () => {
    const trackCom = makeTrack({
      modules: [m1],
      root: { ...makeTrack().root, entryCriteria: ['Aritmética básica', 'Ler enunciados'] },
    });
    const prompt = buildValidationPrompt(buildChallengeContext(trackCom, 'm1', 'm1-l2'), {
      title: 'Somar',
      statement: 'S',
      testsCode: SOMAR_TESTS,
      solutionCode: SOMAR_SOLUTION,
    });
    assert.match(prompt, /- Aritmética básica/);
    assert.match(prompt, /- Ler enunciados/);
    assert.ok(!prompt.includes(NO_ENTRY_CRITERIA_LABEL));
  });
});

// ---------------------------------------------------------------------------
// verifyChallengeAgainstContext — veredito por teste, retry, erros estruturados
// ---------------------------------------------------------------------------

function somarContext(over: Partial<ChallengeContext> = {}): ChallengeContext {
  const m1 = makeModule('m1', 1, [makeLesson('m1-l1')]);
  return {
    ...buildChallengeContext(makeTrack({ modules: [m1] }), 'm1', 'm1-l1'),
    ...over,
  };
}

const SOMAR_CHALLENGE = { title: 'Somar dois números', statement: 'Escreva somar(a, b).', testsCode: SOMAR_TESTS, solutionCode: SOMAR_SOLUTION };

describe('verifyChallengeAgainstContext', () => {
  it('llm devolve JSON válido → veredito ok com um item POR teste, na ordem', async () => {
    const { llm, calls } = fakeLlm(() => ({ content: somarVerdictJson(false, 'Nenhuma aula ensinou typeof/validação.') }));
    const verdict = await verifyChallengeAgainstContext({ context: somarContext(), challenge: SOMAR_CHALLENGE, llm });

    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.aprovado, false);
    assert.equal(verdict.testes.length, 4, 'um item por test()');
    assert.deepEqual(verdict.testes.map((t) => t.nome), [
      'soma dois números positivos',
      'soma número negativo com positivo',
      'soma dois zeros',
      'recusa texto em vez de número',
    ]);
    assert.equal(verdict.testes[3].aprovado, false);
    assert.match(verdict.testes[3].motivo, /typeof|validação/);
    assert.equal(calls.length, 1);
    // A llm recebe o contexto (teoria) para julgar — o transporte não inventa.
    assert.match(calls[0].messages[1].content, /Teoria da aula m1-l1\./);
  });

  it('aprovado de topo é DERIVADO dos itens (contradição da llm → itens vencem)', async () => {
    const doisTestes = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from './solution.mjs';
test('caso 1', () => { assert.equal(f(), 1); });
test('recusa texto em vez de número', () => { assert.throws(() => f('2')); });
`;
    const { llm } = fakeLlm(() => ({
      content: JSON.stringify({
        aprovado: true, // contradição: o item de baixo reprova
        testes: [
          { nome: 'caso 1', aprovado: true, motivo: 'ok' },
          { nome: 'recusa texto em vez de número', aprovado: false, motivo: 'não ensinado' },
        ],
      }),
    }));
    const verdict = await verifyChallengeAgainstContext({
      context: somarContext(),
      challenge: { ...SOMAR_CHALLENGE, testsCode: doisTestes },
      llm,
    });
    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.aprovado, false, 'item reprovado força o veredito geral reprovado');
  });

  it('JSON inválido → retry 1x COM feedback → sucesso na 2ª chamada', async () => {
    const { llm, calls } = fakeLlm((attempt) => ({
      content: attempt === 1 ? 'isto não é json' : somarVerdictJson(true, 'Ensinado na aula anterior.'),
    }));
    const verdict = await verifyChallengeAgainstContext({ context: somarContext(), challenge: SOMAR_CHALLENGE, llm });

    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.aprovado, true);
    assert.equal(calls.length, 2, 'retry aconteceu');
    assert.match(calls[1].messages[1].content, /rejeitada/);
    assert.match(calls[1].messages[1].content, /não era um JSON/);
  });

  it('JSON com ESTRUTURA errada (faltando testes) → retry com o motivo PRECISO → erro estruturado', async () => {
    const { llm, calls } = fakeLlm(() => ({ content: JSON.stringify({ aprovado: false }) }));
    const verdict = await verifyChallengeAgainstContext({ context: somarContext(), challenge: SOMAR_CHALLENGE, llm });

    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.error.code, 'CONTEXT_INVALID_JSON');
    assert.match(verdict.error.message, /veredito válido/);
    assert.equal(calls.length, 2);
    assert.match(calls[1].messages[1].content, /"testes" deve ser um array\./);
  });

  it('contagem de itens ≠ nº de test() → retry → erro estruturado (um item por teste é obrigatório)', async () => {
    const { llm, calls } = fakeLlm(() => ({
      content: JSON.stringify({
        aprovado: false,
        testes: [
          { nome: 'soma dois números positivos', aprovado: true, motivo: 'ok' },
          { nome: 'recusa texto em vez de número', aprovado: false, motivo: 'não ensinado' },
        ],
      }),
    }));
    const verdict = await verifyChallengeAgainstContext({ context: somarContext(), challenge: SOMAR_CHALLENGE, llm });
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.error.code, 'CONTEXT_INVALID_JSON');
    assert.equal(calls.length, 2);
    assert.match(calls[1].messages[1].content, /um por test\(\)/);
  });

  it('llm LANÇA → erro estruturado CONTEXT_UNAVAILABLE, sem retry, nunca veredito falso', async () => {
    const { llm, calls } = fakeLlm(() => null);
    const verdict = await verifyChallengeAgainstContext({ context: somarContext(), challenge: SOMAR_CHALLENGE, llm });
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.error.code, 'CONTEXT_UNAVAILABLE');
    assert.match(verdict.error.message, /falha do serviço de IA/);
    assert.equal(calls.length, 1);
  });

  it('llm devolve conteúdo VAZIO → CONTEXT_UNAVAILABLE', async () => {
    const { llm } = fakeLlm(() => ({ content: '   ' }));
    const verdict = await verifyChallengeAgainstContext({ context: somarContext(), challenge: SOMAR_CHALLENGE, llm });
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.error.code, 'CONTEXT_UNAVAILABLE');
  });

  it('JSON inválido nas DUAS tentativas → CONTEXT_INVALID_JSON', async () => {
    const { llm, calls } = fakeLlm(() => ({ content: 'lixo' }));
    const verdict = await verifyChallengeAgainstContext({ context: somarContext(), challenge: SOMAR_CHALLENGE, llm });
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.error.code, 'CONTEXT_INVALID_JSON');
    assert.equal(calls.length, 2);
  });
});

// ---------------------------------------------------------------------------
// CASO CONCRETO (Q3): o teste "recusa texto em vez de número" do desafio somar
// ---------------------------------------------------------------------------

describe('caso concreto: somar (assert.throws x contexto ensinado)', () => {
  it('contexto SEM validação ensinada (teoria só fala de variáveis) → teste de recusa REPROVA', async () => {
    // Aula atual sem typeof/throw/validação em lugar nenhum; sem aulas anteriores.
    const semValidacao = somarContext({
      currentLesson: {
        slug: 'variaveis-e-tipos',
        title: 'Variáveis e tipos',
        concepts: ['variaveis'],
        theory: 'Uma variável guarda um valor: const nome = "Maria". Números: 1, 2.5. Textos: "oi".',
      },
      previousLessons: [],
    });

    const { llm, calls } = fakeLlm(() => ({
      content: somarVerdictJson(false, 'O teste exige typeof/assert.throws e NENHUMA aula do contexto ensina validação de tipos.'),
    }));
    const verdict = await verifyChallengeAgainstContext({ context: semValidacao, challenge: SOMAR_CHALLENGE, llm });

    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.aprovado, false, 'desafio reprova: um teste cobra o não-ensinado');
    const recusa = verdict.testes.find((t) => t.nome === 'recusa texto em vez de número');
    assert.ok(recusa, 'item por teste presente');
    assert.equal(recusa?.aprovado, false);
    assert.match(recusa?.motivo ?? '', /typeof|validação/i);
    // A llm tinha o material para julgar: o prompt traz a teoria COMPLETA da atual.
    assert.match(calls[0].messages[1].content, /Uma variável guarda um valor/);
    assert.match(calls[0].messages[1].content, /\(nenhuma — esta é a primeira aula da trilha\)/);
  });

  it('aula ANTERIOR que ensina typeof/throw no contexto → teste de recusa APROVA', async () => {
    const comValidacao = somarContext({
      previousLessons: [
        {
          slug: 'o-que-e-programacao',
          title: 'O que é programação',
          concepts: ['programacao'],
          theoryExcerpt: 'Conferimos com typeof: typeof 42 é "number". Se não for texto, lançamos um erro com throw.',
        },
      ],
      currentLesson: {
        slug: 'variaveis-e-tipos',
        title: 'Variáveis e tipos',
        concepts: ['variaveis'],
        theory: 'Uma variável guarda um valor. Números e textos.',
      },
    });

    const { llm } = fakeLlm(() => ({
      content: somarVerdictJson(true, 'typeof e throw foram ensinados na aula anterior.'),
    }));
    const verdict = await verifyChallengeAgainstContext({ context: comValidacao, challenge: SOMAR_CHALLENGE, llm });

    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.aprovado, true, 'com validação ensinada, todos os testes aprovam');
    assert.ok(verdict.testes.every((t) => t.aprovado));
  });
});

describe('countTests', () => {
  it('conta um test() por ocorrência', () => {
    assert.equal(countTests(SOMAR_TESTS), 4);
    assert.equal(countTests("test('a', () => {}); test('b', () => {});"), 2);
    assert.equal(countTests('// sem testes'), 0);
  });
});
