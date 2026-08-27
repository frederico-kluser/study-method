/**
 * tests/trackServices.test.ts — serviços de trilha (rodada 8): runner de
 * desafios (challengeExec), chat do tutor (tutorChat) e regeneração com
 * nunca-repetir (challengeRegenerator). SEM jsdom, SEM electron.
 *
 * Contratos que mordem:
 *   1. runStudentCode: passed exige exit 0 E igualdade de contagem
 *      (testsRun === expectedTestCount === testes declarados).
 *   2. verifyChallengePair: solução passa + starter falha + contagem bate.
 *   3. tutorChat 'next': apresenta a próxima seção e devolve sectionId; ao
 *      terminar todas, done=true; LLM falhou → fallback verbatim (nunca trava).
 *   4. tutorChat 'answer': usa o histórico; sem pergunta → erro EMPTY_REPLY;
 *      LLM falhou → TUTOR_UNAVAILABLE (nunca inventa resposta).
 *   5. regenerateChallenge: JSON inválido/código inválido → retry e, no fim,
 *      erro estruturado (nunca devolve desafio ruim); sucesso só com o par
 *      validado por execução.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRACK_SCHEMA_VERSION, type TrackLessonSource } from '../electron/main/content/trackTypes';
import {
  countTestDeclarations,
  pairIsValid,
  runStudentCode,
  verifyChallengePair,
} from '../electron/main/services/challengeExec';
import {
  REGEN_ERROR_CODES,
  buildRegenerationPrompt,
  extractJsonObject,
  regenerateChallenge,
  slugToFunctionName,
} from '../electron/main/services/challengeRegenerator';
import { TUTOR_ERROR_CODES, nextSection, trimHistory, tutorChat } from '../electron/main/services/tutorChat';

const GOOD_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from './solution.mjs';
test('caso 1', () => { assert.equal(f(1), 2); });
test('caso 2', () => { assert.equal(f(2), 3); });
`;
// solução de referência: f(x) = x + 1 (ambos passam)

function lesson(over: Partial<TrackLessonSource> = {}): TrackLessonSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'aula-1',
    title: 'Aula 1',
    summary: 'Resumo.',
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: ['aula-0'],
    theory: [
      { id: 's1', title: 'Seção 1', markdown: 'Texto da seção 1.' },
      { id: 's2', title: 'Seção 2', markdown: 'Texto da seção 2.', code: { language: 'js', code: 'const x = 1;', explanation: 'Explica.' } },
    ],
    sources: [],
    challenges: [],
    ...over,
  };
}

describe('challengeExec — execução determinística', () => {
  it('passa quando todos os testes rodam e passam (gate de igualdade)', async () => {
    const res = await runStudentCode({
      studentCode: 'export function f(x) { return x + 1; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.equal(res.passed, true);
    assert.equal(res.testsRun, 2);
    assert.equal(res.fail, 0);
  });

  it('falha quando o código do aluno não passa (erro no teste)', async () => {
    // f(x) = 2x passa o caso 1 (f(1)=2) e falha o caso 2 (f(2)=4 ≠ 3)
    const res = await runStudentCode({
      studentCode: 'export function f(x) { return x * 2; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.equal(res.passed, false);
    assert.equal(res.fail, 1);
  });

  it('falha com sintaxe inválida no código do aluno (import quebra)', async () => {
    const res = await runStudentCode({
      studentCode: 'export function f( { return 1; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.equal(res.passed, false);
    assert.ok(res.output.includes('SyntaxError') || res.output.includes('Error'));
  });

  it('gate de igualdade: contagem de testes divergente NUNCA passa', async () => {
    // 1 teste declarado mas expectedTestCount=3 → não passa mesmo com exit 0
    const res = await runStudentCode({
      studentCode: 'export function f(x) { return x + 1; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 3,
    });
    assert.equal(res.passed, false);
  });

  it('verifyChallengePair: solução passa + starter falha', async () => {
    const v = await verifyChallengePair({
      solutionCode: 'export function f(x) { return x + 1; }\n',
      starterCode: 'export function f(x) { throw new Error("não implementado"); }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.equal(v.solutionPasses, true);
    assert.equal(v.starterFails, true);
    assert.equal(v.countMatches, true);
    assert.equal(pairIsValid(v), true);
  });

  it('countTestDeclarations conta test( no arquivo', () => {
    assert.equal(countTestDeclarations(GOOD_TEST), 2);
    assert.equal(countTestDeclarations('// test( no comentário\n'), 0);
  });
});

describe('tutorChat — chat progressivo da aula', () => {
  const okChat = async (req: { messages: Array<{ role: string; content: string }> }) => ({
    content: `resposta do tutor para ${req.messages.length} mensagens`,
  });
  const failChat = async () => {
    throw new Error('boom');
  };

  it('next: apresenta a próxima seção com sectionId', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: ['Aula 0'], presentedSections: [], history: [], action: 'next' },
      okChat,
    );
    assert.equal(r.ok, true);
    assert.equal(r.sectionId, 's1');
    assert.equal(r.done, false);
    assert.ok(r.message.includes('resposta do tutor'));
  });

  it('next: seção seguinte respeita as apresentadas', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: [], presentedSections: ['s1'], history: [], action: 'next' },
      okChat,
    );
    assert.equal(r.sectionId, 's2');
  });

  it('next: com todas as seções apresentadas → done sem mensagem', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: [], presentedSections: ['s1', 's2'], history: [], action: 'next' },
      okChat,
    );
    assert.equal(r.done, true);
    assert.equal(r.sectionId, null);
  });

  it('next: LLM falhou → fallback verbatim do markdown (nunca trava)', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: [], presentedSections: [], history: [], action: 'next' },
      failChat,
    );
    assert.equal(r.ok, true);
    assert.equal(r.sectionId, 's1');
    assert.ok(r.message.includes('Texto da seção 1'));
  });

  it('answer: responde com o histórico do aluno', async () => {
    const r = await tutorChat(
      {
        trackTitle: 'T',
        lesson: lesson(),
        prereqTitles: [],
        presentedSections: ['s1'],
        history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'não entendi' }],
        action: 'answer',
      },
      okChat,
    );
    assert.equal(r.ok, true);
    assert.equal(r.sectionId, null);
  });

  it('answer: sem pergunta do aluno → EMPTY_REPLY', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: [], presentedSections: [], history: [], action: 'answer' },
      okChat,
    );
    assert.equal(r.ok, false);
    assert.equal(r.error?.code, TUTOR_ERROR_CODES.EMPTY_REPLY);
  });

  it('answer: LLM falhou → TUTOR_UNAVAILABLE (nunca inventa)', async () => {
    const r = await tutorChat(
      {
        trackTitle: 'T',
        lesson: lesson(),
        prereqTitles: [],
        presentedSections: [],
        history: [{ role: 'user', content: 'pergunta' }],
        action: 'answer',
      },
      failChat,
    );
    assert.equal(r.ok, false);
    assert.equal(r.error?.code, TUTOR_ERROR_CODES.UNAVAILABLE);
  });

  it('nextSection/trimHistory — helpers', () => {
    assert.equal(nextSection(lesson(), [])?.id, 's1');
    assert.equal(nextSection(lesson(), ['s1'])?.id, 's2');
    assert.equal(nextSection(lesson(), ['s1', 's2']), null);
    const hist = Array.from({ length: 25 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    assert.equal(trimHistory(hist).length, 20);
  });
});

describe('challengeRegenerator — nunca-repetir', () => {
  const GOOD_DRAFT = {
    title: 'Dobro do número',
    concept: 'variaveis',
    difficulty: 2,
    statement: 'Escreva uma função que devolve o dobro.',
    starterCode: 'export function dobro(x) { throw new Error("não implementado"); }\n',
    testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dobro } from './solution.mjs';
test('dobro 1', () => { assert.equal(dobro(1), 2); });
test('dobro 0', () => { assert.equal(dobro(0), 0); });
`,
    solutionCode: 'export function dobro(x) { return x * 2; }\n',
    expectedTestCount: 2,
  };

  it('gera desafio válido e o contexto nunca-repetir entra no prompt', async () => {
    const failed = [{ slug: 'ch-velho', title: 'Velho', statement: 'Enunciado velho.' }];
    let sawPrompt = '';
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed,
      llm: async (req) => {
        sawPrompt = req.messages[1].content;
        return { content: JSON.stringify(GOOD_DRAFT) };
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.challenge?.slug, 'dobro-do-numero');
    assert.ok(sawPrompt.includes('ch-velho'));
    assert.ok(sawPrompt.includes('NÃO REPITA'));
  });

  it('JSON inválido → retry com feedback; sucesso na 2ª tentativa', async () => {
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      llm: async (req) => {
        calls += 1;
        if (calls === 1) return { content: 'não é json' };
        return { content: JSON.stringify(GOOD_DRAFT) };
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(calls, 2);
  });

  it('código inválido nas DUAS tentativas → erro estruturado, nunca desafio ruim', async () => {
    const bad = { ...GOOD_DRAFT, solutionCode: 'export function dobro(x) { return x; }\n' }; // falha nos testes
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      llm: async () => ({ content: JSON.stringify(bad) }),
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error?.code, REGEN_ERROR_CODES.INVALID_CODE);
  });

  it('LLM fora do ar → UNAVAILABLE', async () => {
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      llm: async () => {
        throw new Error('network');
      },
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error?.code, REGEN_ERROR_CODES.UNAVAILABLE);
  });

  it('extractJsonObject tolera fences de markdown', () => {
    assert.deepEqual(extractJsonObject('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extractJsonObject('texto {"b":2} resto'), { b: 2 });
    assert.equal(extractJsonObject('sem objeto'), null);
  });

  it('slugToFunctionName: kebab → camelCase com dígitos', () => {
    assert.equal(slugToFunctionName('desafio-1'), 'desafio1');
    assert.equal(slugToFunctionName('fibonacci-recursivo'), 'fibonacciRecursivo');
  });

  it('buildRegenerationPrompt inclui o material e os erros do aluno', () => {
    const prompt = buildRegenerationPrompt({
      trackTitle: 'Node.js do Zero',
      lesson: lesson(),
      failed: [{ slug: 'x', title: 'X', statement: 'Stmt x' }],
    });
    assert.ok(prompt.includes('Node.js do Zero'));
    assert.ok(prompt.includes('Texto da seção 1'));
    assert.ok(prompt.includes('Stmt x'));
  });
});

describe('challengeExec — parse com ANSI (cores herdadas do ambiente)', () => {
  it('parseSpecCounts ignora códigos ANSI no relatório', () => {
    const { parseSpecCounts } = require('../electron/main/services/challengeExec') as typeof import('../electron/main/services/challengeExec');
    const colored = '\x1b[32m✔ caso 1\x1b[39m\n\x1b[34mℹ tests 3\x1b[39m\n\x1b[34mℹ pass 3\x1b[39m\n\x1b[34mℹ fail 0\x1b[39m\n';
    assert.deepEqual(parseSpecCounts(colored), { testsRun: 3, pass: 3, fail: 0 });
  });
});
