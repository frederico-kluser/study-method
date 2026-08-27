/**
 * tests/trackServices.test.ts — serviços de trilha (rodada 8): runner de
 * desafios (challengeExec), chat do tutor (tutorChat) e regeneração com
 * nunca-repetir (challengeRegenerator). SEM jsdom, SEM electron.
 *
 * Contratos que mordem:
 *   1. runStudentCode: passed exige exit 0 E igualdade de contagem
 *      (testsRun === expectedTestCount === testes declarados). ONDA 1: o
 *      resultado traz os CHECKS individuais (nome + passou?) parseados do
 *      relatório spec — veredito parcial visível (N de M).
 *   2. verifyChallengePair: solução passa + starter falha + contagem bate.
 *   3. tutorChat 'next' (ONDA 1, teoria-pronta): DETERMINÍSTICO — devolve o
 *      markdown da seção (com code block/explanation) SEM chamar a LLM (uma
 *      chat que LANÇA continua funcionando); ao terminar todas, done=true.
 *   4. tutorChat 'answer': usa o histórico; sem pergunta → erro EMPTY_REPLY;
 *      chat que lança → TUTOR_UNAVAILABLE imediato (falha rápida, nunca
 *      spinner infinito).
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
  parseSpecChecks,
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
    // 2 testes declarados mas expectedTestCount=3 → não passa mesmo com exit 0
    const res = await runStudentCode({
      studentCode: 'export function f(x) { return x + 1; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 3,
    });
    assert.equal(res.passed, false);
    // F5 (onda1-ux): TODOS os checks passaram (o relatório não mente) — e
    // MESMO ASSIM passed=false. Os checks NUNCA fabricam passed: o gate de
    // igualdade (exit 0 && testsRun === expected) continua sendo a única
    // fonte de aprovação.
    assert.equal(res.checks.length, 2);
    assert.ok(res.checks.every((c) => c.passed), 'checks todos passados — mas passed segue false');
    assert.equal(res.passedCount, 2);
    assert.equal(res.totalCount, 2);
  });

  it('checks por teste: 1 de 2 passando → veredito parcial visível', async () => {
    // f(x) = 2x passa o caso 1 (f(1)=2) e falha o caso 2 (f(2)=4 ≠ 3)
    const res = await runStudentCode({
      studentCode: 'export function f(x) { return x * 2; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.equal(res.passed, false);
    assert.equal(res.checks.length, 2);
    assert.equal(res.checks[0].name, 'caso 1');
    assert.equal(res.checks[0].passed, true);
    assert.equal(res.checks[1].name, 'caso 2');
    assert.equal(res.checks[1].passed, false);
    assert.equal(res.passedCount, 1);
    assert.equal(res.totalCount, 2);
  });

  it('checks por teste: todos passando → todos os checks true', async () => {
    const res = await runStudentCode({
      studentCode: 'export function f(x) { return x + 1; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.equal(res.passed, true);
    assert.equal(res.passedCount, 2);
    assert.equal(res.totalCount, 2);
    assert.deepEqual(
      res.checks.map((c) => c.passed),
      [true, true],
    );
  });

  it('checks por teste: nome sai sem a duração do relatório', async () => {
    const res = await runStudentCode({
      studentCode: 'export function f(x) { return x + 1; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.ok(res.checks.every((c) => !/\([0-9.]+m?s\)$/.test(c.name)));
  });

  it('checks por teste: erro de sintaxe → checks vazio (0 de 0)', async () => {
    const res = await runStudentCode({
      studentCode: 'export function f( { return 1; }\n',
      testsCode: GOOD_TEST,
      expectedTestCount: 2,
    });
    assert.equal(res.passed, false);
    assert.deepEqual(res.checks, []);
    assert.equal(res.passedCount, 0);
    assert.equal(res.totalCount, 0);
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

  // ONDA 1 (teoria-pronta): 'next' é DETERMINÍSTICO — o markdown da seção
  // vira a mensagem SEM chamar a LLM. Uma chat que LANÇA continua funcionando.

  it('next: devolve o markdown da seção VERBATIM sem chamar o chat', async () => {
    let chatCalls = 0;
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: ['Aula 0'], presentedSections: [], history: [], action: 'next' },
      async () => {
        chatCalls += 1;
        return { content: 'resposta da LLM (NÃO deve aparecer)' };
      },
    );
    assert.equal(r.ok, true);
    assert.equal(r.sectionId, 's1');
    assert.equal(r.done, false);
    assert.ok(r.message.includes('Texto da seção 1'));
    assert.equal(chatCalls, 0, 'next NUNCA chama a LLM');
  });

  it('next: seção seguinte respeita as apresentadas (verbatim)', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: [], presentedSections: ['s1'], history: [], action: 'next' },
      okChat,
    );
    assert.equal(r.sectionId, 's2');
    assert.ok(r.message.includes('Texto da seção 2'));
  });

  it('next: seção com code block → markdown + código + explanation', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: [], presentedSections: ['s1'], history: [], action: 'next' },
      failChat, // lança — e mesmo assim funciona (não há chamada).
    );
    assert.equal(r.ok, true);
    assert.equal(r.sectionId, 's2');
    assert.ok(r.message.includes('Texto da seção 2'));
    assert.ok(r.message.includes('const x = 1;'));
    assert.ok(r.message.includes('Explica.'));
    assert.ok(r.message.includes('```js'));
  });

  it('next: com todas as seções apresentadas → done sem mensagem', async () => {
    const r = await tutorChat(
      { trackTitle: 'T', lesson: lesson(), prereqTitles: [], presentedSections: ['s1', 's2'], history: [], action: 'next' },
      okChat,
    );
    assert.equal(r.done, true);
    assert.equal(r.sectionId, null);
  });

  it('next: chat que LANÇA — ainda funciona (determinístico, sem LLM)', async () => {
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

  it('answer: sem chat (lança) → TUTOR_UNAVAILABLE imediato (falha rápida)', async () => {
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

describe('parseSpecChecks — checks individuais do relatório spec (ONDA 1)', () => {
  // Fixtures fiéis ao relatório REAL do node:test v24 (medido: ✔/✖ + duração
  // "(0.42175ms)" no fim da linha; a seção "failing tests:" vem DEPOIS do
  // resumo `ℹ tests N` e repete cada teste falho).

  it('nome sai sem a duração (ms e s)', () => {
    const checks = parseSpecChecks('✔ caso 1 (0.42175ms)\n✖ caso 2 (1.203ms)\n✖ caso 3 (5s)\nℹ tests 3\n');
    assert.deepEqual(
      checks.map((c) => c.name),
      ['caso 1', 'caso 2', 'caso 3'],
    );
    assert.deepEqual(
      checks.map((c) => c.passed),
      [true, false, false],
    );
  });

  it('mistura ANSI + duração na MESMA linha → nome limpo e passed correto', () => {
    // node:test pinta quando o ambiente pede cor (FORCE_COLOR herdado do
    // Playwright): o escape vem ANTES do ✔/✖ e no FIM da linha.
    const colored = '\x1b[32m✔ caso 1 (0.440166ms)\x1b[39m\n\x1b[31m✖ caso 2 (0.538459ms)\x1b[39m\n\x1b[34mℹ tests 2\x1b[39m\n\x1b[34mℹ pass 1\x1b[39m\n\x1b[34mℹ fail 1\x1b[39m\n';
    const checks = parseSpecChecks(colored);
    assert.deepEqual(checks, [
      { name: 'caso 1', passed: true },
      { name: 'caso 2', passed: false },
    ]);
  });

  it('seção "failing tests:" NÃO duplica os checks (truncamento no resumo)', () => {
    // Relatório REAL de execução com 1 de 2 passando: cada teste falho aparece
    // no corpo E de novo na seção do fim — só a 1ª ocorrência pode contar.
    const output = '✔ caso 1 (0.440166ms)\n✖ caso 2 (0.538459ms)\nℹ tests 2\nℹ pass 1\nℹ fail 1\n\n✖ failing tests:\n✖ caso 2 (0.538459ms)\n';
    const checks = parseSpecChecks(output);
    assert.equal(checks.length, 2, 'caso 2 não pode entrar DUAS vezes');
    assert.deepEqual(checks, [
      { name: 'caso 1', passed: true },
      { name: 'caso 2', passed: false },
    ]);
  });

  it('nomes SINTÉTICOS de falha de load são filtrados (test.mjs / test failed / tests failed)', () => {
    // Sintaxe no solution.mjs → o node:test trata O ARQUIVO como um teste e
    // emite `✖ test.mjs` (v24, com duração) / `✖ test failed` (v20):
    const v24 = '✖ test.mjs (30.848791ms)\nℹ tests 1\nℹ pass 0\nℹ fail 1\n';
    assert.deepEqual(parseSpecChecks(v24), []);
    const v20 = '✖ test failed\nℹ tests 1\nℹ pass 0\nℹ fail 1\n';
    assert.deepEqual(parseSpecChecks(v20), []);
    const plural = '✖ tests failed\nℹ tests 1\nℹ pass 0\nℹ fail 1\n';
    assert.deepEqual(parseSpecChecks(plural), []);
  });

  it('linha ✔ sem nome não vira check fantasma', () => {
    assert.deepEqual(parseSpecChecks('✔ \nℹ tests 1\n'), []);
    assert.deepEqual(parseSpecChecks('ℹ tests 0\nℹ pass 0\nℹ fail 0\n'), []);
  });

  it('subtestes INDENTADOS nunca entram (ancoragem no início da linha)', () => {
    // Relatório real de teste pai com filhos: `✖ pai` (sem duração) antes dos
    // filhos indentados e `✖ pai (1.23ms)` depois — filhos ficam de fora.
    const output = '✖ pai\n  ✔ filho ok (0.302916ms)\n  ✖ filho ruim (0.466375ms)\n✖ pai (1.230917ms)\nℹ tests 3\nℹ pass 1\nℹ fail 2\n';
    const checks = parseSpecChecks(output);
    assert.ok(checks.every((c) => !c.name.includes('filho')), 'nenhum subteste indentado pode entrar');
    assert.ok(checks.every((c) => c.name === 'pai'), `só o teste pai conta (2x, como no relatório real) — veio: ${JSON.stringify(checks.map((c) => c.name))}`);
  });

  it('nome de teste com duração NO MEIO não é cortado (regex âncora no fim)', () => {
    const checks = parseSpecChecks('✔ dobro (par) 2 (0.5ms)\nℹ tests 1\n');
    assert.deepEqual(checks, [{ name: 'dobro (par) 2', passed: true }]);
  });
});
