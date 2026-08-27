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

async function makeTrackDir(): Promise<string> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'track-handlers-'));
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
      sources: [{ title: 'MDN', url: 'https://example.org', description: 'Fonte' }],
      challenges: ['desafio-1'],
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(track, 'modules', 'mod-1', 'lessons', 'aula-1', 'challenges', 'desafio-1', 'challenge.json'),
    JSON.stringify(CHALLENGE),
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

  it("track:tutor-chat 'next' é DETERMINÍSTICO — markdown verbatim, LLM NÃO é chamada (ONDA 1)", async () => {
    const dir = await makeTrackDir();
    let llmCalls = 0;
    const map = buildTrackHandlers({
      getTracksDir: () => path.dirname(dir),
      repo: fakeRepo(),
      deepseek: {
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

  it("track:tutor-chat 'next' sem deepseek → markdown verbatim (ok ainda true)", async () => {
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
      deepseek: {
        chatCompletion: async (req: { messages: Array<{ role: string; content: string }> }) => {
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
      deepseek: {
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
});
