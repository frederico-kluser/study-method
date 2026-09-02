/**
 * tests/tutorChatError.test.ts — ONDA1 (error-contract): discussão do erro de
 * um desafio que FALHOU no chat da aula.
 *
 * O contrato (aditivo — nada existente quebra):
 *   - `TutorChatRequest.challengeError` (TrackChallengeErrorReport) chega ao
 *     tutor nos turnos 'answer' — o system prompt ganha o bloco ADICIONAL
 *     "CONTEXTO DE ERRO" (título do desafio, código do aluno, saída dos
 *     testes, checklist ✔/✖ com contagens) + "REGRAS DE ERRO".
 *   - Sem challengeError o prompt é byte-idêntico ao fluxo normal (sem
 *     regressão); 'next' continua DETERMINÍSTICO e ignora o erro.
 *   - O handler TUTOR_CHAT propaga p.challengeError com validação mínima
 *     (shape inválido → undefined → fluxo normal intacto).
 *
 * Contratos que mordem:
 *   1. buildErrorContextSection é PURA: '' sem challengeError OU em 'next'.
 *   2. O prompt com erro = prompt normal + '\n\n' + bloco de erro (prefixo
 *      byte-idêntico — prova a não-regressão).
 *   3. As REGRAS DE ERRO estão no prompt ("NÃO SABE", "NUNCA resolva o
 *      desafio por ele", "mostrando EXATAMENTE onde está o erro real").
 *   4. 'next' com challengeError: chat NUNCA é chamado; seção verbatim.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { TrackChallengeErrorReport, TutorReply } from '../shared/ipc-contract';
import { TRACK_CHANNELS } from '../shared/ipc-contract';
import { buildTrackHandlers } from '../electron/main/ipc/track-handlers';
import type { IpcHandlerFn } from '../electron/main/ipc/safeHandle';
import { TRACK_SCHEMA_VERSION, type TrackLessonSource } from '../electron/main/content/trackTypes';
import { buildErrorContextSection, tutorChat } from '../electron/main/services/tutorChat';

/** Chama um handler com (null, payload) e tipa o resultado (invoke real é (event, ...args)). */
function call<T>(map: Map<string, IpcHandlerFn>, channel: string, payload?: unknown): Promise<T> {
  return map.get(channel)!(null, payload) as Promise<T>;
}

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

/** Relatório do erro REAL de um desafio que falhou (shape do submit falho). */
const CHALLENGE_ERROR: TrackChallengeErrorReport = {
  trackSlug: 'trilha-teste',
  lessonId: 'aula-1',
  challengeId: 'desafio-1',
  challengeTitle: 'Dobro do número',
  files: [{ path: 'solution.mjs', code: 'export function dobro(x) { return x; }\n' }],
  output: '✖ caso 1: esperado 2, recebido 1\n✖ caso 2: esperado 4, recebido 2',
  checks: [
    { name: 'caso 1', passed: false },
    { name: 'caso 2', passed: false },
  ],
  passedCount: 0,
  totalCount: 2,
};

describe('buildErrorContextSection — função PURA do bloco de erro', () => {
  it('com challengeError + action answer → contém título, código, saída, checks e contagens', () => {
    const section = buildErrorContextSection({
      trackTitle: 'T',
      lesson: lesson(),
      prereqTitles: [],
      presentedSections: [],
      history: [{ role: 'user', content: 'achei que era o x' }],
      action: 'answer',
      challengeError: CHALLENGE_ERROR,
    });
    assert.ok(section.length > 0);
    assert.ok(section.includes('CONTEXTO DE ERRO'));
    assert.ok(section.includes('Dobro do número'), 'título do desafio');
    assert.ok(section.includes('export function dobro(x) { return x; }'), 'código do aluno');
    assert.ok(section.includes('solution.mjs'), 'path do arquivo');
    assert.ok(section.includes('esperado 2, recebido 1'), 'saída dos testes');
    assert.ok(section.includes('✖ caso 1'), 'check falho com ✖');
    assert.ok(section.includes('0 de 2'), 'contagem passou/total');
  });

  it('sem challengeError → string vazia (nada muda no fluxo normal)', () => {
    const section = buildErrorContextSection({
      trackTitle: 'T',
      lesson: lesson(),
      prereqTitles: [],
      presentedSections: [],
      history: [{ role: 'user', content: 'não entendi' }],
      action: 'answer',
    });
    assert.equal(section, '');
  });

  it("com challengeError mas action 'next' → string vazia (o bloco só vale na discussão do erro)", () => {
    const section = buildErrorContextSection({
      trackTitle: 'T',
      lesson: lesson(),
      prereqTitles: [],
      presentedSections: [],
      history: [],
      action: 'next',
      challengeError: CHALLENGE_ERROR,
    });
    assert.equal(section, '');
  });
});

describe('tutorChat — discussão do erro do desafio (ONDA1)', () => {
  const capturingChat = (capture: (systemPrompt: string) => void) => async (req: {
    messages: Array<{ role: string; content: string }>;
  }) => {
    capture(req.messages[0].content);
    return { content: 'resposta do tutor' };
  };

  it("answer + challengeError: o system prompt contém código do aluno, saída dos testes e checks", async () => {
    let prompt = '';
    const r = await tutorChat(
      {
        trackTitle: 'T',
        lesson: lesson(),
        prereqTitles: [],
        presentedSections: ['s1'],
        history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'achei que era só o x que estava errado' }],
        action: 'answer',
        challengeError: CHALLENGE_ERROR,
      },
      capturingChat((p) => void (prompt = p)),
    );
    assert.equal(r.ok, true);
    assert.ok(prompt.includes('CONTEXTO DE ERRO'));
    assert.ok(prompt.includes('CÓDIGO ENVIADO PELO ALUNO'));
    assert.ok(prompt.includes('export function dobro(x) { return x; }'), 'código do aluno no prompt');
    assert.ok(prompt.includes('SAÍDA DOS TESTES'));
    assert.ok(prompt.includes('esperado 2, recebido 1'), 'saída dos testes no prompt');
    assert.ok(prompt.includes('CHECKLIST DOS TESTES'));
    assert.ok(prompt.includes('✖ caso 1'), 'checks individuais no prompt');
  });

  it('sem challengeError: o prompt NÃO tem o bloco de erro e é byte-idêntico ao fluxo normal (sem regressão)', async () => {
    let promptWith = '';
    let promptWithout = '';
    const baseInput = {
      trackTitle: 'T',
      lesson: lesson(),
      prereqTitles: [],
      presentedSections: ['s1'],
      history: [
        { role: 'assistant' as const, content: 'Seção 1...' },
        { role: 'user' as const, content: 'não entendi' },
      ],
      action: 'answer' as const,
    };
    await tutorChat({ ...baseInput, challengeError: CHALLENGE_ERROR }, capturingChat((p) => void (promptWith = p)));
    await tutorChat(baseInput, capturingChat((p) => void (promptWithout = p)));

    assert.ok(!promptWithout.includes('CONTEXTO DE ERRO'), 'sem erro, sem bloco de erro');
    assert.ok(!promptWithout.includes('REGRAS DE ERRO'));
    // Prova da não-regressão: o prompt com erro = prompt normal + bloco
    // ADICIONAL ao final (o conteúdo anterior é byte-idêntico).
    const expectedWith = promptWithout + '\n\n' + buildErrorContextSection({ ...baseInput, challengeError: CHALLENGE_ERROR });
    assert.equal(promptWith, expectedWith);
    assert.ok(promptWith.startsWith(promptWithout));
  });

  it("next + challengeError: DETERMINÍSTICO — apresenta a seção verbatim e IGNORA o erro (LLM nunca chamada)", async () => {
    let chatCalls = 0;
    const r = await tutorChat(
      {
        trackTitle: 'T',
        lesson: lesson(),
        prereqTitles: [],
        presentedSections: [],
        history: [],
        action: 'next',
        challengeError: CHALLENGE_ERROR,
      },
      async () => {
        chatCalls += 1;
        return { content: 'resposta da LLM (NÃO deve aparecer)' };
      },
    );
    assert.equal(r.ok, true);
    assert.equal(r.sectionId, 's1');
    assert.equal(r.done, false);
    assert.ok(r.message.includes('Texto da seção 1'));
    assert.equal(chatCalls, 0, "'next' NUNCA chama a LLM — o erro não muda o fluxo");
  });

  it('as REGRAS DE ERRO estão no prompt: "não sei", não-resolver e apontar o trecho real', async () => {
    let prompt = '';
    const r = await tutorChat(
      {
        trackTitle: 'T',
        lesson: lesson(),
        prereqTitles: [],
        presentedSections: ['s1'],
        history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'não sei' }],
        action: 'answer',
        challengeError: CHALLENGE_ERROR,
      },
      capturingChat((p) => void (prompt = p)),
    );
    assert.equal(r.ok, true);
    // Regra 2 — "não sei" / não faz ideia → a IA analisa o erro sozinha:
    assert.ok(prompt.includes('NÃO SABE'), 'regra do "não sei" no prompt');
    assert.ok(prompt.includes('não faz ideia'), 'variação "não faz ideia" no prompt');
    // Regra 3 — nunca resolver o desafio por ele:
    assert.ok(prompt.includes('NUNCA resolva o desafio por ele'), 'regra de não-resolver no prompt');
    assert.ok(prompt.includes('não escreva a solução completa'), 'proibição da solução completa');
    // Regra 1 — apontar EXATAMENTE o erro real no código (citar o trecho):
    assert.ok(prompt.includes('mostrando EXATAMENTE onde está o erro real'), 'regra de citar o trecho real');
    assert.ok(prompt.includes('confirme se a hipótese está certa ou corrija'), 'regra de validar a hipótese');
  });

  it("answer + challengeError com código MULTI-ARQUIVO: todos os arquivos entram no prompt", async () => {
    let prompt = '';
    const multi = {
      ...CHALLENGE_ERROR,
      files: [
        { path: 'lib/soma.mjs', code: 'export function soma(a, b) { return a - b; }\n' },
        { path: 'lib/multiplica.mjs', code: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
      checks: [{ name: 'soma 2+3', passed: false }, { name: 'multiplica 2*3', passed: true }],
      passedCount: 1,
      totalCount: 2,
    };
    const r = await tutorChat(
      {
        trackTitle: 'T',
        lesson: lesson(),
        prereqTitles: [],
        presentedSections: ['s1'],
        history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'achei que era a soma' }],
        action: 'answer',
        challengeError: multi,
      },
      capturingChat((p) => void (prompt = p)),
    );
    assert.equal(r.ok, true);
    assert.ok(prompt.includes('lib/soma.mjs'), 'primeiro arquivo no prompt');
    assert.ok(prompt.includes('lib/multiplica.mjs'), 'segundo arquivo no prompt');
    assert.ok(prompt.includes('export function soma(a, b) { return a - b; }'));
    assert.ok(prompt.includes('✖ soma 2+3'), 'check falho com ✖');
    assert.ok(prompt.includes('✔ multiplica 2*3'), 'check passado com ✔');
    assert.ok(prompt.includes('1 de 2'), 'contagem parcial 1 de 2');
  });
});

describe('track:tutor-chat (handler) — propagação do challengeError (ONDA1)', () => {
  const CHALLENGE = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'desafio-1',
    title: 'Desafio 1',
    concept: 'variaveis',
    difficulty: 1,
    language: 'nodejs',
    statement: 'Enunciado do desafio.',
    starterCode: 'export function f(x) { throw new Error("não implementado"); }\n',
    testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('caso 1', () => { assert.equal(f(1), 2); });\n`,
    solutionCode: 'export function f(x) { return x + 1; }\n',
    expectedTestCount: 1,
  };

  async function makeTrackDir(): Promise<string> {
    const root = mkdtempSync(path.join(os.tmpdir(), 'tutor-error-handler-'));
    const track = path.join(root, 'trilha-teste');
    await fs.mkdir(path.join(track, 'modules', 'mod-1', 'lessons', 'aula-1', 'challenges', 'desafio-1'), { recursive: true });
    await fs.writeFile(
      path.join(track, 'track.json'),
      JSON.stringify({
        schemaVersion: TRACK_SCHEMA_VERSION,
        slug: 'trilha-teste',
        title: 'Trilha Teste',
        description: 'Desc.',
        language: 'pt-BR',
        domain: 'programming',
        modules: ['mod-1'],
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(track, 'modules', 'mod-1', 'module.json'),
      JSON.stringify({ schemaVersion: TRACK_SCHEMA_VERSION, slug: 'mod-1', title: 'Módulo 1', order: 1, lessons: ['aula-1'] }),
      'utf8',
    );
    await fs.writeFile(
      path.join(track, 'modules', 'mod-1', 'lessons', 'aula-1', 'lesson.json'),
      JSON.stringify({
        schemaVersion: TRACK_SCHEMA_VERSION,
        slug: 'aula-1',
        title: 'Aula 1',
        summary: 'Resumo.',
        difficulty: 1,
        concepts: ['variaveis'],
        prerequisites: [],
        theory: [{ id: 'intro', title: 'Intro', markdown: 'Teoria simples.' }],
        sources: [],
        challenges: ['desafio-1'],
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(track, 'modules', 'mod-1', 'lessons', 'aula-1', 'challenges', 'desafio-1', 'challenge.json'),
      JSON.stringify(CHALLENGE),
      'utf8',
    );
    return track;
  }

  const fakeLlmClient = (capture: (prompt: string) => void) =>
    ({
      chatCompletion: async (req: { messages: Array<{ role: string; content: string }> }) => {
        capture(req.messages[0].content);
        return { content: 'resposta do tutor', model: 'fake' };
      },
    }) as never;

  it("answer com challengeError no payload: o relatório chega à LLM (código + saída + checks no prompt)", async () => {
    const dir = await makeTrackDir();
    let prompt = '';
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), llm: fakeLlmClient((p) => void (prompt = p)) });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: ['intro'],
      history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'achei que era o x' }],
      action: 'answer',
      challengeError: CHALLENGE_ERROR,
    });
    assert.equal(result.ok, true);
    assert.ok(prompt.includes('CONTEXTO DE ERRO'));
    assert.ok(prompt.includes('export function dobro(x) { return x; }'), 'código do aluno propagado');
    assert.ok(prompt.includes('esperado 2, recebido 1'), 'saída dos testes propagada');
    assert.ok(prompt.includes('✖ caso 1'), 'checks propagados');
  });

  it("answer SEM challengeError no payload: fluxo normal intacto (sem bloco de erro)", async () => {
    const dir = await makeTrackDir();
    let prompt = '';
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), llm: fakeLlmClient((p) => void (prompt = p)) });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: ['intro'],
      history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'não entendi' }],
      action: 'answer',
    });
    assert.equal(result.ok, true);
    assert.ok(!prompt.includes('CONTEXTO DE ERRO'), 'sem payload, sem bloco de erro');
    assert.ok(prompt.includes('MATERIAL DA AULA'), 'prompt normal intacto');
  });

  it("challengeError com shape INVÁLIDO (files ausente) → vira undefined e o fluxo normal segue", async () => {
    const dir = await makeTrackDir();
    let prompt = '';
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), llm: fakeLlmClient((p) => void (prompt = p)) });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: ['intro'],
      history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'achei que era o x' }],
      action: 'answer',
      challengeError: { challengeId: 'x', challengeTitle: 'X' } as never,
    });
    assert.equal(result.ok, true);
    assert.ok(!prompt.includes('CONTEXTO DE ERRO'), 'shape inválido é descartado (validação mínima)');
  });

  it("challengeError com ITEM inválido em files/checks (files:[null], checks:[null], files:[{path:1,code:null}]) → descartado, fluxo normal (sem TypeError)", async () => {
    const dir = await makeTrackDir();
    const invalidVariants: unknown[] = [
      { ...CHALLENGE_ERROR, files: [null] },
      { ...CHALLENGE_ERROR, checks: [null] },
      { ...CHALLENGE_ERROR, files: [{ path: 1, code: null }] },
    ];
    for (const challengeError of invalidVariants) {
      let prompt = '';
      const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), llm: fakeLlmClient((p) => void (prompt = p)) });
      const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
        trackSlug: 'trilha-teste',
        lessonId: 'aula-1',
        presentedSections: ['intro'],
        history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'achei que era o x' }],
        action: 'answer',
        challengeError: challengeError as never,
      });
      assert.equal(result.ok, true);
      assert.ok(!prompt.includes('CONTEXTO DE ERRO'), 'item inválido descarta o relatório (validação dos itens)');
    }
  });

  it("challengeError com null/undefined → passa como undefined (fluxo normal)", async () => {
    const dir = await makeTrackDir();
    let prompt = '';
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), llm: fakeLlmClient((p) => void (prompt = p)) });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: ['intro'],
      history: [{ role: 'assistant', content: 'Seção 1...' }, { role: 'user', content: 'não entendi' }],
      action: 'answer',
      challengeError: null,
    });
    assert.equal(result.ok, true);
    assert.ok(!prompt.includes('CONTEXTO DE ERRO'));
  });
});
