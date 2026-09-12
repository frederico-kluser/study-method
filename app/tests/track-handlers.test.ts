/**
 * tests/track-handlers.test.ts — handlers IPC de TRILHAS (rodada 8).
 *
 * Cobre buildTrackHandlers com repo fake + trilha fake em disco (sem electron):
 * listar, detalhe, aula, tutor-chat, desafio (get/submit), proficiência e
 * regeneração com nunca-repetir.
 *
 * Contratos que mordem:
 *   1. list sem repo → ok:false (persistência indisponível) — nunca derruba.
 *   2. get com trilha inválida → ok:false com issues.
 *   3. submit roda o código do aluno contra os testes da trilha (nunca expõe
 *      os testes ao renderer) e devolve veredito por execução.
 *   4. proficiência passada grava o veredito (destravamento).
 *   5. regenerate: o contexto de erros do aluno chega à LLM e o desafio novo
 *      é validado por execução antes de persistir.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  TrackChallengeResult,
  TrackDetailResult,
  TrackLessonDoneResult,
  TrackLessonResult,
  TrackListResult,
  TrackRegenerateResult,
  TrackSubmitResult,
  TutorReply,
} from '../shared/ipc-contract';
import { TRACK_CHANNELS } from '../shared/ipc-contract';
import { buildTrackHandlers, type TrackRepoLike } from '../electron/main/ipc/track-handlers';
import type { IpcHandlerFn } from '../electron/main/ipc/safeHandle';
import { TRACK_SCHEMA_VERSION } from '../electron/main/content/trackTypes';
import { runStudentCode } from '../electron/main/services/challengeExec';

/**
 * Veredito SEMÂNTICO válido com `n` itens (um por test() do testsCode do
 * draft). FAIL-CLOSED (docs/16-engine-de-trilha.md §9.3): o handler agora exige
 * que o gate semântico CONCLUA aprovando, então uma llm fake que devolve
 * sempre o mesmo draft — como estes testes faziam — não valida mais nada e o
 * desafio é (corretamente) recusado. Quem quer testar o caminho FELIZ tem de
 * responder um veredito de verdade na 2ª chamada.
 */
function verdictJson(n: number): string {
  return JSON.stringify({
    aprovado: true,
    testes: Array.from({ length: n }, (_, i) => ({
      nome: `n${i + 1}`,
      construcoes_encontradas: ['aritmética'],
      motivo: 'A aula ensina soma.',
      aprovado: true,
    })),
  });
}

/** Chama um handler com (null, payload) e tipa o resultado (invoke real é (event, ...args)). */
function call<T>(map: Map<string, IpcHandlerFn>, channel: string, payload?: unknown): Promise<T> {
  return map.get(channel)!(null, payload) as Promise<T>;
}

const CHALLENGE = {
  schemaVersion: TRACK_SCHEMA_VERSION,
  slug: 'desafio-1',
  title: 'Desafio 1',
  concept: 'variaveis',
  difficulty: 1,
  language: 'nodejs',
  statement: 'Enunciado do desafio.',
  starterCode: 'export function f(x) { throw new Error("não implementado"); }\n',
  testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f } from './solution.mjs';
test('caso 1', () => { assert.equal(f(1), 2); });
test('caso 2', () => { assert.equal(f(2), 3); });
`,
  solutionCode: 'export function f(x) { return x + 1; }\n',
  expectedTestCount: 2,
};

const PROFICIENCY = {
  ...CHALLENGE,
  slug: 'proficiencia',
  title: 'Proficiência',
  difficulty: 5,
};

// ADITIVO (rodada 9): desafio MULTI-ARQUIVO de AULA (2 arquivos, testes que
// importam dos dois — execução REAL no submit pelo fluxo de aula com files[]).
const LESSON_MULTI_CHALLENGE = {
  schemaVersion: TRACK_SCHEMA_VERSION,
  slug: 'desafio-multi',
  title: 'Desafio multi',
  concept: 'funcoes',
  difficulty: 1,
  language: 'nodejs',
  statement: 'Implemente soma e multiplicação nos dois arquivos.',
  files: [
    { path: 'lib/soma.mjs', starterCode: 'export function soma(a, b) { throw new Error("não implementado"); }\n', solutionCode: 'export function soma(a, b) { return a + b; }\n' },
    { path: 'lib/multiplica.mjs', starterCode: 'export function multiplica(a, b) { throw new Error("não implementado"); }\n', solutionCode: 'export function multiplica(a, b) { return a * b; }\n' },
  ],
  testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soma } from './lib/soma.mjs';
import { multiplica } from './lib/multiplica.mjs';
test('soma 2+3', () => { assert.equal(soma(2, 3), 5); });
test('multiplica 2*3', () => { assert.equal(multiplica(2, 3), 6); });
`,
  expectedTestCount: 2,
};

// ADITIVO (rodada 9): desafio do MÓDULO MULTI-ARQUIVO (2 arquivos, testes que
// importam dos dois — execução REAL no submit).
const MODULE_CHALLENGE = {
  schemaVersion: TRACK_SCHEMA_VERSION,
  slug: 'desafio-do-modulo',
  title: 'Desafio do módulo',
  concept: 'funcoes',
  difficulty: 2,
  language: 'nodejs',
  statement: 'Implemente soma e multiplicação nos dois arquivos.',
  files: [
    { path: 'lib/soma.mjs', starterCode: 'export function soma(a, b) { throw new Error("não implementado"); }\n', solutionCode: 'export function soma(a, b) { return a + b; }\n' },
    { path: 'lib/multiplica.mjs', starterCode: 'export function multiplica(a, b) { throw new Error("não implementado"); }\n', solutionCode: 'export function multiplica(a, b) { return a * b; }\n' },
  ],
  testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soma } from './lib/soma.mjs';
import { multiplica } from './lib/multiplica.mjs';
test('soma 2+3', () => { assert.equal(soma(2, 3), 5); });
test('multiplica 2*3', () => { assert.equal(multiplica(2, 3), 6); });
`,
  expectedTestCount: 2,
};

async function makeTrackDir(
  opts: {
    entryCriteria?: string[];
    previousLesson?: { slug: string; title: string; theory: string };
    /** ONDA 1 (destrave-desafio): aula DEPOIS da aula-1 — é ela que tem de
     *  destravar quando o desafio da aula-1 é aprovado. */
    nextLesson?: { slug: string; title: string };
    /** ONDA 1 (destrave-desafio): desafios DECLARADOS na aula-1. Default: os
     *  dois do fixture (desafio-1 + desafio-multi), que é o caso "aula com
     *  DOIS desafios"; `['desafio-1']` é o caso "aula com UM desafio". */
    lessonChallenges?: string[];
  } = {},
): Promise<string> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'track-handlers-'));
  const track = path.join(root, 'trilha-teste');
  const lessonSlugs = [
    ...(opts.previousLesson ? [opts.previousLesson.slug] : []),
    'aula-1',
    ...(opts.nextLesson ? [opts.nextLesson.slug] : []),
  ];
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
      ...(opts.entryCriteria ? { entryCriteria: opts.entryCriteria } : {}),
      modules: ['mod-1'],
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(track, 'modules', 'mod-1', 'module.json'),
    JSON.stringify({
      schemaVersion: TRACK_SCHEMA_VERSION,
      slug: 'mod-1',
      title: 'Módulo 1',
      order: 1,
      lessons: lessonSlugs,
      challenge: 'desafio-do-modulo',
    }),
    'utf8',
  );
  if (opts.previousLesson) {
    await fs.mkdir(path.join(track, 'modules', 'mod-1', 'lessons', opts.previousLesson.slug), { recursive: true });
    await fs.writeFile(
      path.join(track, 'modules', 'mod-1', 'lessons', opts.previousLesson.slug, 'lesson.json'),
      JSON.stringify({
        schemaVersion: TRACK_SCHEMA_VERSION,
        slug: opts.previousLesson.slug,
        title: opts.previousLesson.title,
        summary: 'Resumo anterior.',
        difficulty: 1,
        concepts: ['programacao'],
        prerequisites: [],
        theory: [{ id: 'intro', title: 'Intro', markdown: opts.previousLesson.theory }],
        sources: [],
        challenges: [],
      }),
      'utf8',
    );
  }
  if (opts.nextLesson) {
    await fs.mkdir(path.join(track, 'modules', 'mod-1', 'lessons', opts.nextLesson.slug), { recursive: true });
    await fs.writeFile(
      path.join(track, 'modules', 'mod-1', 'lessons', opts.nextLesson.slug, 'lesson.json'),
      JSON.stringify({
        schemaVersion: TRACK_SCHEMA_VERSION,
        slug: opts.nextLesson.slug,
        title: opts.nextLesson.title,
        summary: 'Resumo seguinte.',
        difficulty: 1,
        concepts: ['programacao'],
        prerequisites: [],
        theory: [{ id: 'intro', title: 'Intro', markdown: 'Depois.' }],
        sources: [],
        challenges: [],
      }),
      'utf8',
    );
  }
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
      sources: [{ title: 'MDN', url: 'https://example.org', description: 'Fonte' }],
      challenges: opts.lessonChallenges ?? ['desafio-1', 'desafio-multi'],
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(track, 'modules', 'mod-1', 'lessons', 'aula-1', 'challenges', 'desafio-1', 'challenge.json'),
    JSON.stringify(CHALLENGE),
    'utf8',
  );
  await fs.mkdir(path.join(track, 'modules', 'mod-1', 'lessons', 'aula-1', 'challenges', 'desafio-multi'), { recursive: true });
  await fs.writeFile(
    path.join(track, 'modules', 'mod-1', 'lessons', 'aula-1', 'challenges', 'desafio-multi', 'challenge.json'),
    JSON.stringify(LESSON_MULTI_CHALLENGE),
    'utf8',
  );
  await fs.mkdir(path.join(track, 'modules', 'mod-1', 'challenges', 'desafio-do-modulo'), { recursive: true });
  await fs.writeFile(
    path.join(track, 'modules', 'mod-1', 'challenges', 'desafio-do-modulo', 'challenge.json'),
    JSON.stringify(MODULE_CHALLENGE),
    'utf8',
  );
  await fs.writeFile(path.join(track, 'proficiency.json'), JSON.stringify(PROFICIENCY), 'utf8');
  return track;
}

function fakeRepo(over: Partial<TrackRepoLike> = {}): TrackRepoLike {
  const attempts = new Map<string, Array<{ verdict: string; stars: number }>>();
  const proficiency: { verdict: 'passed' | 'failed'; stars: number } = { verdict: 'failed', stars: 0 };
  const generated: unknown[] = [];
  return {
    listTrackLessonProgress: async () => [],
    getTrackProficiency: async () => null,
    listGeneratedChallenges: async () => [],
    getAttemptsForChallenge: async (id: string) =>
      (attempts.get(id) ?? []).map((a, i) => ({
        id: `${id}#${i}`,
        subjectId: 's',
        lessonId: 'l',
        challengeId: id,
        verdict: a.verdict as 'passed' | 'failed' | 'timeout' | 'abandoned',
        stars: a.stars,
        durationMs: 0,
        createdAt: String(i),
      })),
    markTrackLessonDone: async () => {},
    setTrackProficiency: async (_t, v, s) => {
      proficiency.verdict = v;
      proficiency.stars = s;
    },
    insertGeneratedChallenge: async (input) => {
      generated.push(input);
    },
    listFailedChallengeSlugs: async () => ['desafio-1'],
    ...over,
  };
}

const goodAnswer = 'export function f(x) { return x + 1; }\n';
const badAnswer = 'export function f(x) { return x; }\n';

describe('buildTrackHandlers — trilhas', () => {
  it('track:list devolve as trilhas com contagens', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackListResult>(map, TRACK_CHANNELS.LIST);
    assert.equal(result.ok, true);
    assert.equal(result.tracks.length, 1);
    assert.equal(result.tracks[0].slug, 'trilha-teste');
    assert.equal(result.tracks[0].lessonCount, 1);
  });

  it('track:list sem repo → ok:false gracioso', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir) });
    const result = await call<TrackListResult>(map, TRACK_CHANNELS.LIST);
    assert.equal(result.ok, false);
  });

  it('track:get monta módulos com estados (1ª aula destravada)', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackDetailResult>(map, TRACK_CHANNELS.GET, { trackSlug: 'trilha-teste' });
    assert.equal(result.ok, true);
    assert.equal(result.track?.modules[0].lessons[0].locked, false);
    assert.equal(result.track?.proficiencyAvailable, true);
  });

  it('track:get com trilha inválida → ok:false com erro', async () => {
    const map = buildTrackHandlers({ getTracksDir: () => '/tmp/nao-existe', repo: fakeRepo() });
    const result = await call<TrackDetailResult>(map, TRACK_CHANNELS.GET, { trackSlug: 'fantasma' });
    assert.equal(result.ok, false);
    assert.ok(result.error.length > 0);
  });

  it('track:lesson devolve teoria, fontes e desafios', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackLessonResult>(map, TRACK_CHANNELS.LESSON, { trackSlug: 'trilha-teste', lessonId: 'aula-1' });
    assert.equal(result.ok, true);
    assert.equal(result.lesson?.theory[0].id, 'intro');
    assert.equal(result.lesson?.sources.length, 1);
    assert.equal(result.lesson?.challenges[0].slug, 'desafio-1');
  });

  it('track:lesson-done marca a aula concluída', async () => {
    const dir = await makeTrackDir();
    let done = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({ markTrackLessonDone: async () => void (done = true) }),
    });
    const result = await call<TrackLessonDoneResult>(map, TRACK_CHANNELS.LESSON_DONE, { trackSlug: 'trilha-teste', lessonId: 'aula-1' });
    assert.equal(result.ok, true);
    assert.equal(done, true);
  });

  /* ═════════════════════════════════════════════════════════════════════════
   * ONDA 15 — O GATE SEQUENCIAL MORA NO MAIN, NÃO SÓ NA TELA
   *
   * A revisão adversarial mediu um FALSO DESTRAVAMENTO — o pior caso deste
   * eixo, porque um falso travamento só irrita e um falso destravamento
   * quebra o produto. O único gate era o `disabled={lesson.locked}` do tile
   * da Trilha; a LessonView nunca lê o `locked` do payload. Qualquer outra
   * entrada abre a aula trancada, e concluí-la gravava aqui — o que destrava
   * a SEGUINTE com todas as anteriores por fazer, já que `computeUnlockStates`
   * só olha a aula imediatamente anterior.
   * Estes dois testes fecham a porta de trás: é a GRAVAÇÃO que recusa.
   * ═════════════════════════════════════════════════════════════════════════ */
  it('track:lesson-done RECUSA aula trancada — a anterior não foi concluída', async () => {
    const dir = await makeTrackDir({ previousLesson: { slug: 'aula-0', title: 'Aula 0', theory: 'Antes.' } });
    let gravou = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      // progresso VAZIO: nada foi concluído, então 'aula-1' está trancada.
      repo: fakeRepo({ markTrackLessonDone: async () => void (gravou = true) }),
    });
    const result = await call<TrackLessonDoneResult>(map, TRACK_CHANNELS.LESSON_DONE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
    });
    assert.equal(result.ok, false, 'concluir uma aula trancada destravaria a seguinte por cima das anteriores');
    assert.match(String((result as { error?: string }).error), /trancada/i, 'a recusa precisa DIZER o motivo');
    assert.equal(gravou, false, 'nada pode chegar ao banco — o gate é a última porta antes dele');
  });

  it('track:lesson-done ACEITA quando a anterior está concluída (o gate ordena, não trava)', async () => {
    const dir = await makeTrackDir({ previousLesson: { slug: 'aula-0', title: 'Aula 0', theory: 'Antes.' } });
    let gravou = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({
        listTrackLessonProgress: async () => [
          { trackSlug: 'trilha-teste', lessonId: 'aula-0', completedAt: '1' },
        ],
        markTrackLessonDone: async () => void (gravou = true),
      }),
    });
    const result = await call<TrackLessonDoneResult>(map, TRACK_CHANNELS.LESSON_DONE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
    });
    assert.equal(result.ok, true, 'com a anterior concluída a gravação tem de passar');
    assert.equal(gravou, true);
  });

  it("track:tutor-chat 'next' é DETERMINÍSTICO — markdown verbatim, LLM NÃO é chamada (ONDA 1)", async () => {
    const dir = await makeTrackDir();
    let llmCalls = 0;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      llm: {
        chatCompletion: async () => {
          llmCalls += 1;
          return { content: 'Bem-vindo à aula!', model: 'fake' };
        },
      } as never,
    });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: [],
      history: [],
      action: 'next',
    });
    assert.equal(result.ok, true);
    assert.equal(result.sectionId, 'intro');
    assert.equal(result.done, true); // única seção da aula fixture.
    assert.ok(result.message.includes('Teoria simples'));
    assert.equal(llmCalls, 0, "'next' nunca chama a LLM");
  });

  it("track:tutor-chat 'next' sem llm → markdown verbatim (ok ainda true)", async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: [],
      history: [],
      action: 'next',
    });
    assert.equal(result.ok, true);
    assert.ok(result.message.includes('Teoria simples'));
  });

  it("track:tutor-chat 'answer' sem llm (sem cliente) → TUTOR_UNAVAILABLE imediato (ONDA 1)", async () => {
    // F2: falha RÁPIDA — sem cliente o handler nunca deixa o renderer em
    // spinner infinito; o erro estruturado chega na hora.
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: [],
      history: [{ role: 'user', content: 'não entendi' }],
      action: 'answer',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'TUTOR_UNAVAILABLE');
    assert.equal(result.message, '');
    assert.equal(result.done, false);
  });

  it("track:tutor-chat 'answer' com llm que LANÇA → TUTOR_UNAVAILABLE imediato", async () => {
    // F2: erro de rede/LLM também é falha rápida — nunca resposta inventada.
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      llm: {
        chatCompletion: async () => {
          throw new Error('network down');
        },
      } as never,
    });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: [],
      history: [{ role: 'user', content: 'dúvida' }],
      action: 'answer',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'TUTOR_UNAVAILABLE');
  });

  it("track:tutor-chat 'answer' com llm ok → responde com o texto do chat", async () => {
    const dir = await makeTrackDir();
    let sawMessages = 0;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      llm: {
        chatCompletion: async (req: { messages: Array<{ role: string; content: string }> }) => {
          sawMessages = req.messages.length;
          return { content: 'Resposta do tutor para sua dúvida.', model: 'fake' };
        },
      } as never,
    });
    const result = await call<TutorReply>(map, TRACK_CHANNELS.TUTOR_CHAT, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      presentedSections: ['intro'],
      history: [
        { role: 'assistant', content: 'Seção 1...' },
        { role: 'user', content: 'não entendi' },
      ],
      action: 'answer',
    });
    assert.equal(result.ok, true);
    assert.equal(result.message, 'Resposta do tutor para sua dúvida.');
    assert.equal(result.sectionId, null);
    // system + 2 do histórico (assistant + user) — o material da aula entra.
    assert.equal(sawMessages, 3);
  });

  it('track:challenge devolve a spec sem os testes', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackChallengeResult>(map, TRACK_CHANNELS.CHALLENGE_GET, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
    });
    assert.equal(result.ok, true);
    assert.equal(result.challenge?.slug, 'desafio-1');
    assert.equal((result.challenge as unknown as Record<string, unknown>).testsCode, undefined);
    assert.equal(result.challenge?.minFirstStarMs, 60_000);
  });

  it('track:challenge-submit: resposta certa passa; errada falha', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const good = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: goodAnswer,
    });
    assert.equal(good.ok, true);
    assert.equal(good.passed, true);
    assert.equal(good.testsRun, 2);
    // ONDA 1 (checks por teste): veredito não é tudo-ou-nada.
    assert.equal(good.checks.length, 2);
    assert.equal(good.passedCount, 2);
    assert.equal(good.totalCount, 2);
    assert.ok(good.checks.every((c) => c.passed));

    const bad = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: badAnswer,
    });
    assert.equal(bad.ok, true);
    assert.equal(bad.passed, false);
    assert.equal(bad.expectedTests, 2);
    // badAnswer = f(x)=x → caso 1 f(1)=1≠2 ✖ e caso 2 f(2)=2≠3 ✖ (0 de 2):
    assert.equal(bad.checks.length, 2);
    assert.equal(bad.passedCount, 0);
    assert.equal(bad.totalCount, 2);
    assert.ok(bad.checks.every((c) => !c.passed));
  });

  it('track:proficiency-submit passado grava o veredito (destravamento)', async () => {
    const dir = await makeTrackDir();
    let prof: { verdict: string; stars: number } | null = null;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({
        setTrackProficiency: async (_t, v, s) => void (prof = { verdict: v, stars: s }),
      }),
    });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.PROFICIENCY_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'proficiency',
      code: goodAnswer,
      stars: 2,
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, true);
    assert.deepEqual(prof, { verdict: 'passed', stars: 2 });
  });

  it('track:challenge-regenerate: gera com contexto de erros, valida e persiste', async () => {
    const dir = await makeTrackDir();
    let persisted: unknown = null;
    let promptSaw = '';
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({
        listFailedChallengeSlugs: async () => ['desafio-1'],
        insertGeneratedChallenge: async (input) => void (persisted = input),
      }),
      llm: {
        chatCompletion: async (req: { messages: Array<{ role: string; content: string }> }) => {
          // A 1ª chamada é a GERAÇÃO (é ela que carrega o contexto do
          // nunca-repetir); a 2ª é o VALIDADOR SEMÂNTICO, que agora precisa
          // devolver um veredito de verdade — sem aprovação semântica o
          // handler recusa a entrega (fail-closed, §9.3).
          if (!promptSaw) {
            promptSaw = req.messages.map((m) => m.content).join('\n');
            return {
              content: JSON.stringify({
                title: 'Novo desafio',
                concept: 'variaveis',
                difficulty: 2,
                statement: 'Novo enunciado.',
                starterCode: 'export function novo(x) { throw new Error("x"); }\n',
                testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { novo } from './solution.mjs';\ntest('n1', () => { assert.equal(novo(1), 2); });\ntest('n2', () => { assert.equal(novo(2), 3); });\n`,
                solutionCode: 'export function novo(x) { return x + 1; }\n',
                expectedTestCount: 2,
              }),
              model: 'fake',
            };
          }
          return { content: verdictJson(2), model: 'fake' };
        },
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
    });
    assert.equal(result.ok, true);
    assert.equal(result.challenge?.source, 'generated');
    assert.ok(promptSaw.includes('desafio-1')); // contexto do nunca-repetir
    assert.ok(promptSaw.includes('NÃO REPITA'));
    assert.ok(persisted); // validado por execução antes de persistir
  });

  it('track:challenge-regenerate: LLM inválida nas 2 tentativas → erro estruturado', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      llm: {
        chatCompletion: async () => ({
          content: 'resposta sem json',
          model: 'fake',
        }),
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
    });
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  // ─── ADITIVO (onda3-generate-flow): eventos de PROGRESSO reais ─────────────

  it('track:challenge-regenerate: emite os marcos de progresso reais no canal push (com contexto → validação incluída)', async () => {
    const dir = await makeTrackDir();
    const events: Array<{ stage: string; generationId?: number; challenge?: { slug: string; title: string }; error?: string }> = [];
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      emit: (_channel, ev) => {
        events.push(ev as { stage: string; generationId?: number; challenge?: { slug: string; title: string }; error?: string });
      },
      llm: {
        chatCompletion: (() => {
          let calls = 0;
          return async () => {
            calls += 1;
            // 1ª = geração; 2ª = veredito semântico APROVADO (sem ele o
            // handler recusaria a entrega — fail-closed, §9.3).
            if (calls > 1) return { content: verdictJson(2), model: 'fake' };
            return {
              content: JSON.stringify({
                title: 'Novo desafio',
                concept: 'variaveis',
                difficulty: 2,
                statement: 'Novo enunciado.',
                starterCode: 'export function novo(x) { throw new Error("x"); }\n',
                testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { novo } from './solution.mjs';\ntest('n1', () => { assert.equal(novo(1), 2); });\ntest('n2', () => { assert.equal(novo(2), 3); });\n`,
                solutionCode: 'export function novo(x) { return x + 1; }\n',
                expectedTestCount: 2,
              }),
              model: 'fake',
            };
          };
        })(),
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      generationId: 42, // ALTO-2: ecoado em TODOS os eventos (correlação)
    });
    assert.equal(result.ok, true);
    // Ordem dos marcos: generating ANTES da LLM; validating (o gate semântico
    // SEMPRE roda no caminho do aluno — §9.3) → executing → inserting → done
    // TERMINAL com o challenge novo.
    assert.deepEqual(
      events.map((e) => e.stage),
      ['generating', 'validating', 'executing', 'inserting', 'done'],
    );
    assert.ok(
      events.every((e) => e.generationId === 42),
      'o generationId do request é ecoado em todos os eventos',
    );
    const terminal = events[events.length - 1];
    assert.equal(terminal.challenge?.slug, result.challenge?.slug);
    assert.ok(terminal.challenge?.title);
  });

  it('track:challenge-regenerate: falha da LLM emite o terminal error (nunca done)', async () => {
    const dir = await makeTrackDir();
    const events: Array<{ stage: string; generationId?: number; error?: string }> = [];
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      emit: (_channel, ev) => {
        events.push(ev as { stage: string; generationId?: number; error?: string });
      },
      llm: {
        chatCompletion: async () => ({ content: 'resposta sem json', model: 'fake' }),
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      generationId: 7,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(
      events.map((e) => e.stage),
      ['generating', 'error'],
    );
    assert.ok(events[1].error, 'terminal error carrega a mensagem');
    assert.equal(events[1].generationId, 7, 'o terminal error também ecoa o id');
  });

  // ─── REVISÃO ALTO-1: terminal 'error' em TODOS os caminhos ────────────────

  it('track:challenge-regenerate: bad request emite o terminal error (o modal nunca fica preso em running)', async () => {
    const dir = await makeTrackDir();
    const events: Array<{ stage: string; error?: string }> = [];
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      emit: (_channel, ev) => {
        events.push(ev as { stage: string; error?: string });
      },
      llm: {
        chatCompletion: async () => ({ content: '{}', model: 'fake' }),
      } as never,
    });
    // Payload inválido (sem lessonId) — retorno antecipado COM terminal.
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'REGEN_BAD_REQUEST');
    assert.deepEqual(events.map((e) => e.stage), ['error']);
    assert.ok(events[0].error);

    // Sem repo — idem.
    events.length = 0;
    const mapNoRepo = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      llm: {
        chatCompletion: async () => ({ content: '{}', model: 'fake' }),
      } as never,
    });
    const noRepo = await call<TrackRegenerateResult>(mapNoRepo, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
    });
    assert.equal(noRepo.ok, false);
    assert.equal(noRepo.error?.code, 'NO_REPO');
  });

  it('track:challenge-regenerate: exceção inesperada vira terminal error (try/catch do corpo — ALTO-1)', async () => {
    const dir = await makeTrackDir();
    const events: Array<{ stage: string; error?: string }> = [];
    let threw = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      // O emit lança UMA vez (simula transporte com falha no meio do processo
      // — ex.: webContents destruída): o try/catch do corpo garante o terminal
      // 'error' no caminho seguinte (o emit do catch funciona).
      emit: (_channel, ev) => {
        if (!threw) {
          threw = true;
          throw new Error('boom no transporte');
        }
        events.push(ev as { stage: string; error?: string });
      },
      llm: {
        chatCompletion: async () => ({
          content: JSON.stringify({
            title: 'Novo desafio',
            concept: 'variaveis',
            difficulty: 2,
            statement: 'Novo enunciado.',
            starterCode: 'export function novo(x) { throw new Error("x"); }\n',
            testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { novo } from './solution.mjs';\ntest('n1', () => { assert.equal(novo(1), 2); });\n`,
            solutionCode: 'export function novo(x) { return x + 1; }\n',
            expectedTestCount: 1,
          }),
          model: 'fake',
        }),
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      generationId: 99,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'REGEN_INTERNAL');
    assert.deepEqual(events.map((e) => e.stage), ['error']);
    assert.ok(events[0].error?.includes('falha inesperada'));
  });

  it('track:challenge-regenerate: emit ausente nos deps → no-op (fixtures/testes seguem funcionando)', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      llm: {
        chatCompletion: (() => {
          let calls = 0;
          return async () => {
            calls += 1;
            if (calls > 1) return { content: verdictJson(1), model: 'fake' };
            return {
              content: JSON.stringify({
                title: 'Novo desafio',
                concept: 'variaveis',
                difficulty: 2,
                statement: 'Novo enunciado.',
                starterCode: 'export function novo(x) { throw new Error("x"); }\n',
                testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { novo } from './solution.mjs';\ntest('n1', () => { assert.equal(novo(1), 2); });\n`,
                solutionCode: 'export function novo(x) { return x + 1; }\n',
                expectedTestCount: 1,
              }),
              model: 'fake',
            };
          };
        })(),
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
    });
    assert.equal(result.ok, true);
    assert.equal(result.challenge?.source, 'generated');
  });

  // ONDA 2 (autoria): o handler monta o CONTEXTO PEDAGÓGICO (buildChallengeContext
  // com critérios da trilha + aulas anteriores + a aula atual) e o passa ao
  // regenerador — o draft aprovado na execução ainda é validado pela SEMÂNTICA.
  it('track:challenge-regenerate: passa o CONTEXTO pedagógico ao regenerador (critérios + aulas anteriores) e valida semanticamente', async () => {
    const dir = await makeTrackDir({
      entryCriteria: ['Aritmética básica'],
      previousLesson: { slug: 'aula-0', title: 'Aula 0', theory: 'Teoria da aula anterior: typeof e throw.' },
    });
    const prompts: string[] = [];
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({ listFailedChallengeSlugs: async () => ['desafio-1'] }),
      llm: {
        chatCompletion: async (req: { messages: Array<{ role: string; content: string }> }) => {
          prompts.push(req.messages.map((m) => m.content).join('\n'));
          if (prompts.length === 1) {
            // 1ª chamada: GERAÇÃO do desafio (draft válido por execução).
            return {
              content: JSON.stringify({
                title: 'Novo desafio',
                concept: 'variaveis',
                difficulty: 2,
                statement: 'Novo enunciado.',
                starterCode: 'export function novo(x) { throw new Error("x"); }\n',
                testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { novo } from './solution.mjs';\ntest('n1', () => { assert.equal(novo(1), 2); });\ntest('n2', () => { assert.equal(novo(2), 3); });\n`,
                solutionCode: 'export function novo(x) { return x + 1; }\n',
                expectedTestCount: 2,
              }),
              model: 'fake',
            };
          }
          // 2ª chamada: VALIDAÇÃO SEMÂNTICA — veredito por teste aprovado.
          return {
            content: JSON.stringify({
              aprovado: true,
              testes: [
                { nome: 'n1', aprovado: true, motivo: 'Soma está na aula.' },
                { nome: 'n2', aprovado: true, motivo: 'Soma está na aula.' },
              ],
            }),
            model: 'fake',
          };
        },
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
    });
    assert.equal(result.ok, true);
    assert.equal(result.challenge?.source, 'generated');
    assert.equal(prompts.length, 2, '1 geração + 1 validação semântica');
    // O prompt de GERAÇÃO carrega o contexto pedagógico montado pelo handler.
    assert.ok(prompts[0].includes('Aritmética básica'), 'entryCriteria da trilha chega ao prompt');
    assert.ok(prompts[0].includes('CONTEÚDO DAS AULAS ANTERIORES'), 'seção de aulas anteriores presente');
    assert.ok(prompts[0].includes('Teoria da aula anterior: typeof e throw.'), 'teoria da aula anterior chega ao prompt');
    // A 2ª chamada é o VALIDADOR (prompt com THINKING MÁXIMO da onda 1).
    assert.ok(prompts[1].includes('VALIDADOR PEDAGÓGICO'), 'validação semântica roda com o contexto');
    assert.ok(prompts[1].includes('Aritmética básica'), 'o contexto também chega ao validador');
  });

  // FAIL-CLOSED (docs/16-engine-de-trilha.md §9.3): se a montagem do contexto
  // falhar, o handler NÃO regenera mais sem contexto (era `console.warn` +
  // `context = undefined`, e o desafio saía validado só por execução) — devolve
  // REGEN_SEMANTIC_NOT_RUN com mensagem para o aluno, antes de qualquer chamada
  // de LLM. O ramo não é exercitável daqui e isso é uma PROPRIEDADE, não uma
  // lacuna: `findLessonAnywhere` devolve `{ moduleSlug, lesson }` de um módulo
  // que contém a aula, e `buildChallengeContext` só lança quando
  // `findLesson(track, moduleSlug, lessonSlug)` não acha esse mesmo par
  // (trackLoader.ts:274-288) — nenhum estado do loader produz isso com os
  // slugs que o handler acabou de resolver (mock de módulo exigiria flag fora
  // do runner t.sh). O contrato do parâmetro está pinado em unidade:
  // tests/challengeRegenerator.test.ts, 'gate EXIGIDO sem contexto →
  // FAIL-CLOSED antes da 1ª chamada de LLM'.

  it('track:challenge-regenerate: validador semântico FORA DO AR → recusa a entrega com erro estruturado (§9.3)', async () => {
    const dir = await makeTrackDir();
    const events: Array<{ stage: string; error?: string }> = [];
    let persisted = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({ insertGeneratedChallenge: async () => void (persisted = true) }),
      emit: (_channel, ev) => {
        events.push(ev as { stage: string; error?: string });
      },
      llm: {
        chatCompletion: (() => {
          let calls = 0;
          return async () => {
            calls += 1;
            // 1ª chamada: draft PERFEITO (passa nas quatro provas de execução
            // de §5.4). 2ª: o validador semântico está fora do ar.
            if (calls > 1) throw new Error('rede fora do ar');
            return {
              content: JSON.stringify({
                title: 'Novo desafio',
                concept: 'variaveis',
                difficulty: 2,
                statement: 'Novo enunciado.',
                starterCode: 'export function novo(x) { throw new Error("x"); }\n',
                testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { novo } from './solution.mjs';\ntest('n1', () => { assert.equal(novo(1), 2); });\n`,
                solutionCode: 'export function novo(x) { return x + 1; }\n',
                expectedTestCount: 1,
              }),
              model: 'fake',
            };
          };
        })(),
      } as never,
    });
    const result = await call<TrackRegenerateResult>(map, TRACK_CHANNELS.CHALLENGE_REGENERATE, {
      trackSlug: 'trilha-teste',
      lessonId: 'aula-1',
      generationId: 11,
    });
    assert.equal(result.ok, false, 'draft válido na execução NÃO basta sem o veredito semântico');
    assert.equal(result.error?.code, 'REGEN_SEMANTIC_UNAVAILABLE');
    assert.equal(persisted, false, 'nada é persistido — o aluno não recebe o desafio');
    // O modal precisa do terminal 'error' com a mensagem humana (é ela que a
    // UI mostra crua, em ChallengeGenerateModal/TrackChallengePanel).
    assert.deepEqual(events.map((e) => e.stage), ['generating', 'error']);
    assert.match(events[1].error ?? '', /nada foi gerado/i);
    assert.match(events[1].error ?? '', /chave da API e os créditos/i);
  });

  // ─── ADITIVO (rodada 9): desafio do MÓDULO (target 'module') ────────────────

  it('track:challenge devolve o desafio do MÓDULO com os starters por arquivo', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackChallengeResult>(map, TRACK_CHANNELS.CHALLENGE_GET, {
      trackSlug: 'trilha-teste',
      target: 'module',
      moduleSlug: 'mod-1',
      challengeId: 'desafio-do-modulo',
    });
    assert.equal(result.ok, true);
    assert.equal(result.challenge?.slug, 'desafio-do-modulo');
    assert.equal(result.challenge?.files?.length, 2);
    assert.equal(result.challenge?.files?.[0].path, 'lib/soma.mjs');
    // os testes NUNCA chegam ao renderer:
    assert.equal((result.challenge as unknown as Record<string, unknown>).testsCode, undefined);
    // as SOLUÇÕES nunca chegam ao renderer:
    assert.equal((result.challenge?.files?.[0] as unknown as Record<string, unknown>).solutionCode, undefined);
  });

  it('track:challenge-submit com target module + files: TODOS os arquivos certos passam', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'module',
      moduleSlug: 'mod-1',
      challengeId: 'desafio-do-modulo',
      code: '', // ignorado — files presente.
      files: [
        { path: 'lib/soma.mjs', code: 'export function soma(a, b) { return a + b; }\n' },
        { path: 'lib/multiplica.mjs', code: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, true);
    assert.equal(result.testsRun, 2);
  });

  it('track:challenge-submit com target module: um arquivo errado → falha com parcial', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'module',
      moduleSlug: 'mod-1',
      challengeId: 'desafio-do-modulo',
      code: '',
      files: [
        { path: 'lib/soma.mjs', code: 'export function soma(a, b) { return a - b; }\n' },
        { path: 'lib/multiplica.mjs', code: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, false);
    // F7: os checks NOMINAIS mostram QUAL teste falhou no desafio do módulo.
    const somaCheck = result.checks.find((c) => c.name === 'soma 2+3');
    const multCheck = result.checks.find((c) => c.name === 'multiplica 2*3');
    assert.ok(somaCheck, 'check da soma deve existir');
    assert.equal(somaCheck!.passed, false, 'soma errada → teste da soma falha');
    assert.ok(multCheck, 'check da multiplicação deve existir');
    assert.equal(multCheck!.passed, true, 'multiplicação certa → teste dela passa');
    assert.equal(result.passedCount, 1);
    assert.equal(result.totalCount, 2);
  });

  // ADITIVO (rodada 9): desafio MULTI-ARQUIVO DE AULA — o painel envia files[]
  // para QUALQUER desafio com files[] (não só módulo); o caminho lesson do
  // resolveTestsCode precisa resolver o testsCode do desafio e rodar os arquivos.
  it('track:challenge-submit de AULA com files: todos os arquivos certos passam', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-multi',
      code: '',
      files: [
        { path: 'lib/soma.mjs', code: 'export function soma(a, b) { return a + b; }\n' },
        { path: 'lib/multiplica.mjs', code: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, true);
    assert.equal(result.testsRun, 2);
    assert.equal(result.totalCount, 2);
  });

  it('track:challenge-submit de AULA com files: um arquivo errado → falha com checks nominais', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-multi',
      code: '',
      files: [
        { path: 'lib/soma.mjs', code: 'export function soma(a, b) { return a - b; }\n' },
        { path: 'lib/multiplica.mjs', code: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, false);
    // os checks NOMINAIS mostram exatamente qual teste falhou (F7):
    const somaCheck = result.checks.find((c) => c.name === 'soma 2+3');
    const multCheck = result.checks.find((c) => c.name === 'multiplica 2*3');
    assert.ok(somaCheck, 'check da soma deve existir');
    assert.equal(somaCheck!.passed, false, 'soma errada → teste da soma falha');
    assert.ok(multCheck, 'check da multiplicação deve existir');
    assert.equal(multCheck!.passed, true, 'multiplicação certa → teste dela passa');
    assert.equal(result.passedCount, 1);
    assert.equal(result.totalCount, 2);
  });

  it('track:challenge-submit com target module + moduleSlug errado → CHALLENGE_NOT_FOUND', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'module',
      moduleSlug: 'modo-inexistente',
      challengeId: 'desafio-do-modulo',
      code: '',
      files: [{ path: 'lib/soma.mjs', code: 'export function soma(a, b) { return a + b; }\n' }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'CHALLENGE_NOT_FOUND');
  });

  // FIX (revisão adversarial): submit malicioso — path com '..' escreveria
  // FORA do workdir de execução (path.join resolve o '..' no writeFile).
  it('track:challenge-submit: files com path que escapa do workdir → SUBMIT_BAD_REQUEST e nada é escrito', async () => {
    const dir = await makeTrackDir();
    const map = buildTrackHandlers({ getTracksDir: () => path.dirname(dir), repo: fakeRepo() });
    const escapeName = `escape-${Date.now()}.mjs`;
    // Onde o path malicioso escreveria SEM a validação: o workdir é
    // os.tmpdir()/track-submit-*/ — '../..' resolve para o PAI do tmpdir.
    const escapedPath = path.join(os.tmpdir(), '..', escapeName);
    await fs.rm(escapedPath, { force: true });

    // 1. Handler: rejeita com erro estruturado ANTES de rodar/gravar qualquer coisa.
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'module',
      moduleSlug: 'mod-1',
      challengeId: 'desafio-do-modulo',
      code: '',
      files: [{ path: `../../${escapeName}`, code: 'export const x = 1;\n' }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'SUBMIT_BAD_REQUEST');

    // 2. Defesa em profundidade: o runner sozinho (main E CLI) também recusa.
    const runner = await runStudentCode({
      studentCode: '',
      files: [{ path: `../../${escapeName}`, code: 'export const x = 1;\n' }],
      testsCode: `import { test } from 'node:test';\ntest('nada', () => {});\n`,
      expectedTestCount: 1,
    });
    assert.equal(runner.passed, false);
    assert.equal(runner.error, 'path inválido');
    assert.equal(runner.checks.length, 0);
    assert.equal(runner.totalCount, 0);

    // 3. NENHUM arquivo foi criado fora do workdir (o path resolvido não existe).
    await assert.rejects(fs.access(escapedPath), (err) => {
      assert.equal((err as NodeJS.ErrnoException).code, 'ENOENT');
      return true;
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════
   * ONDA 1 (destrave-desafio) — PASSAR NO DESAFIO CONCLUI A AULA
   *
   * O pedido do dono ("quando eu passo no desafio já quero que libere a destrave
   * a próxima aula") tem UMA régua: a aula está completa quando TODO desafio
   * dela tem último veredito `passed` — a MESMA pergunta do `lessonFinishBlock`
   * da tela. Estes testes medem o caminho REAL do canal, com a trilha fake em
   * disco e o repo fake:
   *   - o veredito do desafio recém-aprovado NÃO está no banco no instante do
   *     submit (quem persiste é o renderer, DEPOIS, via
   *     study:mark-challenge-attempt) e ainda assim ele CONTA;
   *   - aula trancada NÃO conclui — o gate é o mesmo do `track:lesson-done`;
   *   - proficiência e desafio de MÓDULO não passam por este caminho;
   *   - o retorno do canal é SEMPRE o veredito do submit: o destrave é efeito
   *     colateral silencioso, nunca um erro que o aluno veja por ter acertado.
   * ═════════════════════════════════════════════════════════════════════════ */

  it('track:challenge-submit aprovado em aula de UM desafio conclui a aula e DESTRAVA a próxima', async () => {
    const dir = await makeTrackDir({
      lessonChallenges: ['desafio-1'],
      nextLesson: { slug: 'aula-2', title: 'Aula 2' },
    });
    // O fake registra o PAR (trackSlug + lessonId): com só o `lessonId` um
    // `trackSlug` errado passaria despercebido — e é ele que escolhe a trilha
    // cujo progresso está sendo gravado.
    const concluidas: Array<{ trackSlug: string; lessonId: string }> = [];
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      // Repo COM MEMÓRIA: o `track:get` depois do submit tem de enxergar o
      // `done` que o destrave acabou de gravar — é esse estado que a Trilha lê.
      repo: fakeRepo({
        listTrackLessonProgress: async () =>
          concluidas.map((c) => ({ trackSlug: c.trackSlug, lessonId: c.lessonId, completedAt: '1' })),
        markTrackLessonDone: async (trackSlug, lessonId) => void concluidas.push({ trackSlug, lessonId }),
      }),
    });

    const antes = await call<TrackDetailResult>(map, TRACK_CHANNELS.GET, { trackSlug: 'trilha-teste' });
    assert.equal(antes.ok, true);
    assert.equal(antes.track?.modules[0].lessons[1].locked, true, 'sem a aula 1 concluída, a aula 2 começa trancada');

    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: goodAnswer,
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, true);
    assert.deepEqual(
      concluidas,
      [{ trackSlug: 'trilha-teste', lessonId: 'aula-1' }],
      'a aprovação grava a conclusão da aula (trackSlug + lessonId)',
    );

    const depois = await call<TrackDetailResult>(map, TRACK_CHANNELS.GET, { trackSlug: 'trilha-teste' });
    assert.equal(depois.ok, true);
    assert.equal(depois.track?.modules[0].lessons[0].done, true, 'a aula 1 fica concluída');
    assert.equal(
      depois.track?.modules[0].lessons[1].locked,
      false,
      'a aula seguinte destrava SEM o clique em "Concluir aula" — era este o defeito medido',
    );
  });

  it('track:challenge-submit aprovado em aula de DOIS desafios, com o outro pendente → NÃO conclui', async () => {
    const dir = await makeTrackDir(); // aula-1 declara desafio-1 + desafio-multi
    let gravou = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      // Nenhuma tentativa no banco: o desafio-multi segue pendente.
      repo: fakeRepo({ markTrackLessonDone: async () => void (gravou = true) }),
    });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: goodAnswer,
    });
    assert.equal(result.passed, true);
    assert.equal(gravou, false, 'aula com desafio pendente não pode ser dada como concluída');
  });

  it('track:challenge-submit aprovado conta o PRÓPRIO desafio (o banco ainda não tem a tentativa) → conclui', async () => {
    const dir = await makeTrackDir(); // desafio-1 + desafio-multi
    let gravou = 0;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({
        // O OUTRO desafio da aula já foi aprovado numa tentativa anterior.
        getAttemptsForChallenge: async (id: string) =>
          id === 'desafio-multi'
            ? [{ id: 'a#0', subjectId: 's', lessonId: 'aula-1', challengeId: id, verdict: 'passed' as const, stars: 1, durationMs: 0, createdAt: '0' }]
            : [],
        markTrackLessonDone: async () => void (gravou += 1),
      }),
    });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: goodAnswer,
    });
    assert.equal(result.passed, true);
    assert.equal(
      gravou,
      1,
      'o desafio recém-aprovado NÃO está no banco neste instante (o renderer persiste depois) e tem de contar',
    );
  });

  it('track:challenge-submit aprovado em aula TRANCADA → NÃO conclui (mesmo gate do lesson-done)', async () => {
    const dir = await makeTrackDir({
      previousLesson: { slug: 'aula-0', title: 'Aula 0', theory: 'Antes.' },
      lessonChallenges: ['desafio-1'],
    });
    let gravou = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      // Progresso VAZIO: 'aula-1' está trancada (a anterior não foi concluída).
      repo: fakeRepo({ markTrackLessonDone: async () => void (gravou = true) }),
    });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: goodAnswer,
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, true);
    assert.equal(gravou, false, 'passar um desafio de aula trancada não pode destravar a seguinte por cima da ordem');
  });

  it('track:challenge-submit REPROVADO → NÃO conclui nada', async () => {
    const dir = await makeTrackDir({ lessonChallenges: ['desafio-1'] });
    let gravou = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({ markTrackLessonDone: async () => void (gravou = true) }),
    });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: badAnswer,
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, false);
    assert.equal(gravou, false, 'veredito não aprovado não conclui aula');
  });

  it('track:challenge-submit do MÓDULO aprovado → NÃO conclui aula (canal não é o de aula)', async () => {
    const dir = await makeTrackDir({ lessonChallenges: ['desafio-1'] });
    let gravou = false;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({
        // A aula-1 tem TODOS os desafios já aprovados no banco (o outro
        // caminho de recusa possível — "desafio pendente" — está fechado).
        getAttemptsForChallenge: async (id: string) =>
          id === 'desafio-1'
            ? [
                {
                  id: 'desafio-1#0',
                  subjectId: 's',
                  lessonId: 'aula-1',
                  challengeId: id,
                  verdict: 'passed' as const,
                  stars: 1,
                  durationMs: 0,
                  createdAt: '0',
                },
              ]
            : [],
        markTrackLessonDone: async () => void (gravou = true),
      }),
    });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'module',
      moduleSlug: 'mod-1',
      // PAYLOAD SINTÉTICA, DE PROPÓSITO (prova a CLÁUSULA, não o formato que o
      // painel manda): o desafio de módulo é autoral e o painel nunca envia
      // `lessonId` aqui. O `lessonId: 'aula-1'` — aula REAL do fixture, com
      // todos os desafios já aprovados — é o que isola o `target`: sem ele o
      // teste passaria só porque `findLessonAnywhere` devolve null. Com a aula
      // completa no banco, o ÚNICO motivo de não gravar é `target !== 'lesson'`.
      // ⚠ MUTAÇÃO: apagar `p.target === 'lesson'` do handler faz ESTE teste
      // falhar (o destrave contaria a aula-1 como completa e gravaria).
      lessonId: 'aula-1',
      challengeId: 'desafio-do-modulo',
      code: '',
      files: [
        { path: 'lib/soma.mjs', code: 'export function soma(a, b) { return a + b; }\n' },
        { path: 'lib/multiplica.mjs', code: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.passed, true);
    assert.equal(gravou, false, 'o desafio do módulo é autoral e não conclui aula');
  });

  it('target proficiency NÃO conclui aula no canal do destrave (quem destrava a trilha é o PROFICIENCY_SUBMIT)', async () => {
    const dir = await makeTrackDir({ lessonChallenges: ['desafio-1'] });
    let gravou = false;
    let proficiencia: string | null = null;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo({
        markTrackLessonDone: async () => void (gravou = true),
        setTrackProficiency: async (_t, v) => void (proficiencia = v),
      }),
    });

    // (1) O CANAL DE VERDADE da proficiência: destrava a trilha inteira e NÃO
    // passa pelo destrave automático de aula (o handler dele não tem cláusula
    // `target` nenhuma — por isso este trecho, sozinho, não prova nada sobre ela).
    const prof = await call<TrackSubmitResult>(map, TRACK_CHANNELS.PROFICIENCY_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'proficiency',
      challengeId: 'proficiencia',
      code: goodAnswer,
      stars: 2,
    });
    assert.equal(prof.ok, true);
    assert.equal(prof.passed, true);
    assert.equal(proficiencia, 'passed', 'a proficiência destrava no canal próprio');
    assert.equal(gravou, false, 'nenhuma aula é concluída pelo canal da proficiência');

    // (2) O CANAL DO DESTRAVE com um payload de proficiência: `target`
    // 'proficiency' + `lessonId` VÁLIDO ('aula-1', do fixture) + o desafio da
    // PRÓPRIA aula recém-aprovado. PAYLOAD SINTÉTICA, DE PROPÓSITO (prova a
    // CLÁUSULA, não o formato que o painel manda): o submit resolve o desafio
    // pelo caminho de aula e APROVA de verdade — sem o `lessonId` real o teste
    // passaria só porque `findLessonAnywhere` devolve null. Aqui o ÚNICO motivo
    // de não gravar é `target !== 'lesson'`.
    // ⚠ MUTAÇÃO: apagar `p.target === 'lesson'` do handler faz ESTE teste
    // falhar (o destrave gravaria a conclusão da aula-1).
    const sintetico = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'proficiency',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: goodAnswer,
    });
    assert.equal(sintetico.ok, true);
    assert.equal(sintetico.passed, true, 'o submit aprova de verdade — a recusa é só do destrave');
    assert.equal(gravou, false, 'target proficiency não é caminho de conclusão de aula');
  });

  it('track:challenge-submit: falha do destrave NÃO vira erro do submit (o veredito do aluno é o retorno)', async () => {
    const dir = await makeTrackDir({ lessonChallenges: ['desafio-1'] });
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      // A gravação da conclusão LANÇA (disco/SQLite): o submit não pode pagar
      // por isso — o aluno acertou o desafio e recebe o veredito DELE.
      repo: fakeRepo({
        markTrackLessonDone: async () => {
          throw new Error('banco fora do ar');
        },
      }),
    });
    const result = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: 'trilha-teste',
      target: 'lesson',
      lessonId: 'aula-1',
      challengeId: 'desafio-1',
      code: goodAnswer,
    });
    assert.equal(result.ok, true, 'o canal continua respondendo o veredito do submitter');
    assert.equal(result.passed, true);
    assert.equal(result.testsRun, 2);
    assert.equal(result.passedCount, 2);
    assert.equal(result.totalCount, 2);
    assert.equal(result.error, undefined);
  });
});
