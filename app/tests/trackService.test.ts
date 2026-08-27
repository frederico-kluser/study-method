/**
 * tests/trackService.test.ts — lógica de TRILHA (rodada 8): destravamento
 * sequencial, DTOs (lista/detalhe/aula/desafio) e resolução de desafios
 * regenerados. SEM jsdom, SEM electron — repo fake.
 *
 * Contratos que mordem:
 *   1. A 1ª aula da trilha SEMPRE destrava; a seguinte só quando a anterior
 *      está concluída OU o aluno passou na proficiência.
 *   2. 'current' = primeira destravada e não concluída (no máx. 1; nenhuma
 *      quando a trilha está 100% concluída).
 *   3. Aulas concluídas ficam 'done' mesmo quando a anterior não está.
 *   4. Desafio regenerado (generated_challenges) aparece na aula e resolve
 *      como spec com source 'generated'.
 *   5. Proficiência: spec com minFirstStarMs maior (120s) e dificuldade do
 *      arquivo; sem proficiência → proficiencyAvailable false.
 *   6. summarizeAttempts: último veredito vence, estrelas do último, falhas
 *      contam failed|timeout.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { TrackVerdict } from '../shared/ipc-contract';
import {
  TRACK_SCHEMA_VERSION,
  type TrackChallengeSource,
  type TrackLessonSource,
  type TrackSource,
} from '../electron/main/content/trackTypes';
import type { LoadedTrack } from '../electron/main/content/trackLoader';
import {
  TrackProgressLike,
  buildChallengeSummaries,
  buildTrackDetail,
  buildTrackLesson,
  computeUnlockStates,
  findLessonInTrack,
  resolveChallengeSpec,
  summarizeAttempts,
  timeLimitForDifficultyMs,
} from '../electron/main/services/trackService';

function challenge(slug: string, over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug,
    title: slug,
    concept: 'variaveis',
    difficulty: 1,
    language: 'nodejs',
    statement: 'Enunciado.',
    starterCode: 'export function f() { throw new Error("x"); }\n',
    testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('a', () => { assert.ok(true); });\n`,
    solutionCode: 'export function f() { return 1; }\n',
    expectedTestCount: 1,
    ...over,
  };
}

function lesson(slug: string, over: Partial<TrackLessonSource> = {}): TrackLessonSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug,
    title: slug,
    summary: `Resumo ${slug}`,
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: [],
    theory: [{ id: 'intro', title: 'Intro', markdown: 'Teoria.' }],
    sources: [],
    challenges: [`ch-${slug}`],
    ...over,
  };
}

function makeTrack(lessons: Array<{ moduleSlug: string; lesson: TrackLessonSource; challenge?: TrackChallengeSource }>): LoadedTrack {
  const modules = new Map<string, { schemaVersion: number; slug: string; title: string; order: number; lessons: string[] }>();
  const byModule = new Map<string, Array<{ meta: TrackLessonSource; challenges: TrackChallengeSource[] }>>();
  for (const { moduleSlug, lesson, challenge } of lessons) {
    if (!modules.has(moduleSlug)) {
      const order = modules.size + 1;
      modules.set(moduleSlug, { schemaVersion: TRACK_SCHEMA_VERSION, slug: moduleSlug, title: moduleSlug, order, lessons: [] });
      byModule.set(moduleSlug, []);
    }
    modules.get(moduleSlug)!.lessons.push(lesson.slug);
    byModule.get(moduleSlug)!.push({ meta: lesson, challenges: challenge ? [challenge] : [] });
  }
  const track: TrackSource = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'trilha',
    title: 'Trilha',
    description: 'Desc.',
    language: 'pt-BR',
    domain: 'programming',
    modules: [...modules.values()].sort((a, b) => a.order - b.order).map((m) => m.slug),
  };
  return {
    root: track,
    modules: [...modules.values()]
      .sort((a, b) => a.order - b.order)
      .map((m) => ({ meta: m, lessons: byModule.get(m.slug)! })),
    proficiency: null,
    dir: '/fake',
  };
}

/** Repo fake com progresso programável. */
function fakeRepo(over: Partial<TrackProgressLike> = {}): TrackProgressLike {
  const attempts = new Map<string, Array<{ verdict: TrackVerdict; stars: number }>>();
  return {
    listTrackLessonProgress: async () => [],
    getTrackProficiency: async () => null,
    listGeneratedChallenges: async () => [],
    getAttemptsForChallenge: async (challengeId: string) =>
      (attempts.get(challengeId) ?? []).map((a, i) => ({
        id: `${challengeId}#${i}`,
        subjectId: 's',
        lessonId: 'l',
        challengeId,
        verdict: a.verdict,
        stars: a.stars,
        durationMs: 0,
        createdAt: String(i),
      })),
    ...over,
  };
}

describe('computeUnlockStates — destravamento sequencial', () => {
  it('primeira aula destrava; as seguintes exigem a anterior concluída', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
      { moduleSlug: 'm2', lesson: lesson('a3') },
    ]);
    const states = computeUnlockStates(track, new Set(), false);
    assert.equal(states.get('a1')!.locked, false);
    assert.equal(states.get('a2')!.locked, true);
    assert.equal(states.get('a3')!.locked, true);
    // current = a1 (primeira destravada e não concluída)
    assert.equal(states.get('a1')!.current, true);
    assert.equal(states.get('a2')!.current, false);
  });

  it('concluir a a1 destrava a a2; concluir tudo não tem current', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
    ]);
    const states = computeUnlockStates(track, new Set(['a1']), false);
    assert.equal(states.get('a1')!.done, true);
    assert.equal(states.get('a2')!.locked, false);
    assert.equal(states.get('a2')!.current, true);

    const all = computeUnlockStates(track, new Set(['a1', 'a2']), false);
    assert.equal(all.get('a1')!.current, false);
    assert.equal(all.get('a2')!.current, false);
  });

  it('proficiência passada destrava TODAS mesmo sem concluir as anteriores', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
    ]);
    const states = computeUnlockStates(track, new Set(), true);
    assert.equal(states.get('a1')!.locked, false);
    assert.equal(states.get('a2')!.locked, false);
  });

  it('ordem dos módulos respeita module.order, não a ordem declarada', () => {
    // módulo m2 declarado antes de m1, mas com order maior
    const track = makeTrack([
      { moduleSlug: 'm2', lesson: lesson('b1') },
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
    ]);
    track.modules[0].meta.order = 2; // m2 declarado 1º, mas order maior
    track.modules[1].meta.order = 1; // m1 declarado 2º, mas order menor
    const states = computeUnlockStates(track, new Set(), false);
    assert.equal(states.get('a1')!.locked, false);
    assert.equal(states.get('a2')!.locked, true);
    assert.equal(states.get('b1')!.locked, true);
  });
});

describe('buildTrackDetail / buildTrackLesson — DTOs', () => {
  it('monta detalhe com contagens e proficiência', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    const repo = fakeRepo({
      listTrackLessonProgress: async () => [{ trackSlug: 'trilha', lessonId: 'a1', completedAt: 'x' }],
      getTrackProficiency: async () => ({ trackSlug: 'trilha', verdict: 'passed', stars: 3, passedAt: 'x' }),
    });
    const detail = await buildTrackDetail(track, repo);
    assert.equal(detail.lessonCount, 1);
    assert.equal(detail.doneCount, 1);
    assert.equal(detail.proficient, true);
    assert.equal(detail.proficiencyAvailable, false); // track sem proficiency.json
    assert.equal(detail.modules[0].lessons[0].done, true);
  });

  it('monta aula com pré-requisitos resolvidos e desafios com estado', async () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a0') },
      { moduleSlug: 'm1', lesson: lesson('a1', { prerequisites: ['a0'] }), challenge: challenge('ch-a1') },
    ]);
    const repo = fakeRepo();
    const payload = await buildTrackLesson(track, 'm1', 'a1', repo);
    assert.ok(payload);
    assert.deepEqual(payload.prerequisites, [{ slug: 'a0', title: 'a0' }]);
    assert.equal(payload.challenges.length, 1);
    assert.equal(payload.challenges[0].slug, 'ch-a1');
    assert.equal(payload.challenges[0].lastVerdict, null);
    assert.equal(payload.locked, true); // a0 não concluída
  });

  it('desafio com tentativas reflete último veredito, estrelas e falhas', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1'), challenge: challenge('ch-a1') }]);
    const repo = fakeRepo({
      getAttemptsForChallenge: async (id: string) => [
        { id: '1', subjectId: 's', lessonId: 'l', challengeId: id, verdict: 'failed', stars: 2, durationMs: 0, createdAt: '1' },
        { id: '2', subjectId: 's', lessonId: 'l', challengeId: id, verdict: 'failed', stars: 1, durationMs: 0, createdAt: '2' },
        { id: '3', subjectId: 's', lessonId: 'l', challengeId: id, verdict: 'passed', stars: 1, durationMs: 0, createdAt: '3' },
      ],
    });
    const payload = await buildTrackLesson(track, 'm1', 'a1', repo);
    assert.ok(payload);
    assert.equal(payload.challenges[0].lastVerdict, 'passed');
    assert.equal(payload.challenges[0].stars, 1);
    assert.equal(payload.challenges[0].failedCount, 2);
  });

  it('aula inexistente devolve null', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    const payload = await buildTrackLesson(track, 'm1', 'nao-existe', fakeRepo());
    assert.equal(payload, null);
  });
});

describe('resolveChallengeSpec — desafios da trilha e regenerados', () => {
  it('resolve desafio da aula com tempo e carência por dificuldade', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1'), challenge: challenge('ch-a1', { difficulty: 3 }) }]);
    const spec = await resolveChallengeSpec(track, 'lesson', 'a1', 'ch-a1', fakeRepo());
    assert.ok(spec);
    assert.equal(spec.source, 'track');
    assert.equal(spec.timeLimitMs, timeLimitForDifficultyMs(3));
    assert.equal(spec.minFirstStarMs, 60_000); // default do produto
  });

  it('resolve desafio REGENERADO com source generated e carência default', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    const repo = fakeRepo({
      listGeneratedChallenges: async () => [
        {
          id: 'g1',
          trackSlug: 'trilha',
          lessonId: 'a1',
          challengeId: 'novo-desafio',
          statement: 'Novo.',
          starterCode: 'export function f() {}\n',
          testsCode: '// tests\n',
          solutionCode: 'export function f() {}\n',
          expectedTestCount: 1,
          createdAt: 'x',
        },
      ],
    });
    const spec = await resolveChallengeSpec(track, 'lesson', 'a1', 'novo-desafio', repo);
    assert.ok(spec);
    assert.equal(spec.source, 'generated');
    assert.equal(spec.slug, 'novo-desafio');
  });

  it('proficiência: só resolve com o slug do arquivo e usa carência maior', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    track.proficiency = challenge('proficiencia', { difficulty: 5 });
    const spec = await resolveChallengeSpec(track, 'proficiency', undefined, 'proficiencia', fakeRepo());
    assert.ok(spec);
    assert.equal(spec.minFirstStarMs, 120_000);
    assert.equal(spec.timeLimitMs, timeLimitForDifficultyMs(5));
    const wrong = await resolveChallengeSpec(track, 'proficiency', undefined, 'outro', fakeRepo());
    assert.equal(wrong, null);
  });

  it('sem proficiência na trilha → proficiency null', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    const spec = await resolveChallengeSpec(track, 'proficiency', undefined, 'proficiencia', fakeRepo());
    assert.equal(spec, null);
  });
});

describe('summarizeAttempts / timeLimit / findLessonInTrack', () => {
  it('último veredito vence; falhas contam failed|timeout', () => {
    const s = summarizeAttempts([
      { verdict: 'failed', stars: 2 },
      { verdict: 'timeout', stars: 1 },
      { verdict: 'passed', stars: 3 },
    ]);
    assert.equal(s.lastVerdict, 'passed');
    assert.equal(s.stars, 3);
    assert.equal(s.failedCount, 2);
    assert.equal(summarizeAttempts([]).lastVerdict, null);
    assert.equal(summarizeAttempts([]).failedCount, 0);
  });

  it('timeLimitForDifficultyMs usa a fórmula 90s + difficulty*60s', () => {
    assert.equal(timeLimitForDifficultyMs(1), 150_000);
    assert.equal(timeLimitForDifficultyMs(5), 390_000);
    assert.equal(timeLimitForDifficultyMs(undefined), 300_000);
  });

  it('findLessonInTrack acha em qualquer módulo', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm2', lesson: lesson('b1') },
    ]);
    assert.equal(findLessonInTrack(track, 'b1')?.moduleSlug, 'm2');
    assert.equal(findLessonInTrack(track, 'x'), null);
  });
});
