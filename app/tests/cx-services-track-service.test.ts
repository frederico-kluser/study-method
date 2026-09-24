/**
 * tests/cx-services-track-service.test.ts — CARACTERIZAÇÃO (golden master) de
 * `electron/main/services/trackService.ts` ANTES da refatoração de
 * core/services.
 *
 * Fixa o casamento conteúdo (trilha do disco) × progresso (repo): estados
 * locked/done/current, destrava sequencial, próxima aula (regra (d) — done
 * simulada), payload de aula/detalhe/lista, gate de conclusão por desafio e a
 * resolução de especificação de desafio (aula/módulo/proficiência/gerado).
 * SEM Electron: repo é um fake estrutural (TrackProgressWriter) em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeSource,
  TrackLessonSource,
} from '../electron/main/content/trackTypes';
import type { TrackChallengeSpec, TrackVerdict } from '../shared/ipc-contract';
import {
  buildChallengeSummaries,
  buildTrackDetail,
  buildTrackLesson,
  buildTrackList,
  completeLessonOnChallengePass,
  computeNextLesson,
  computeUnlockStates,
  findLessonInTrack,
  flattenTrackLessons,
  lessonChallengesAllPassed,
  lessonIsLocked,
  loadTrackState,
  resolveChallengeSpec,
  summarizeAttempts,
  timeLimitForDifficultyMs,
  type TrackProgressWriter,
} from '../electron/main/services/trackService';

// ─── fixtures ────────────────────────────────────────────────────────────────

function challenge(slug: string, over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: `Desafio ${slug}`,
    concept: 'funcoes',
    difficulty: 2,
    language: 'nodejs',
    statement: 'Implemente.',
    starterCode: 'export function f() {}',
    testsCode: 'test("t", () => {});',
    solutionCode: 'export function f() { return 1; }',
    expectedTestCount: 1,
    ...over,
  };
}

function lesson(slug: string, over: Partial<TrackLessonSource> = {}, challenges: TrackChallengeSource[] = []): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: `Aula ${slug}`,
      summary: `Resumo ${slug}`,
      difficulty: 1,
      concepts: ['funcoes'],
      prerequisites: [],
      theory: [
        {
          id: `sec-${slug}`,
          title: `Teoria ${slug}`,
          markdown: 'markdown da seção',
          code: { language: 'js', code: 'const x = 1;' },
        },
      ],
      sources: [{ title: 'Fonte', url: 'https://f', description: 'desc' }],
      challenges: challenges.map((c) => c.slug),
      ...over,
    },
    challenges,
  };
}

function moduleOf(slug: string, order: number, lessons: LoadedLesson[], modChallenge: TrackChallengeSource | null = null): LoadedModule {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: `Módulo ${slug}`,
      order,
      lessons: lessons.map((l) => l.meta.slug),
      ...(modChallenge ? { challenge: modChallenge.slug } : {}),
    },
    lessons,
    challenge: modChallenge,
  };
}

function trackDe(modules: LoadedModule[], over: { proficiency?: TrackChallengeSource | null } = {}): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'js-do-zero',
      title: 'JS do Zero',
      description: 'Do zero ao primeiro desafio.',
      language: 'pt-BR',
      domain: 'programming',
      modules: modules.map((m) => m.meta.slug),
    },
    modules,
    proficiency: over.proficiency ?? null,
    dir: '/tmp/trilha',
  };
}

/** Trilha de 3 aulas em 2 módulos (m1: a1,a2 · m2: a3) + desafio de módulo em m2. */
function trilhaBase(): LoadedTrack {
  const c1 = challenge('c-a1');
  return trackDe(
    [
      moduleOf('m1', 1, [lesson('a1', {}, [c1]), lesson('a2')]),
      moduleOf('m2', 2, [lesson('a3')], challenge('c-mod')),
    ],
    { proficiency: challenge('c-prof', { difficulty: 4 }) },
  );
}

interface AttemptRow {
  id: string;
  subjectId: string;
  lessonId: string;
  challengeId: string;
  verdict: TrackVerdict;
  stars: number;
  durationMs: number;
  createdAt: string;
}

function repoFake(
  over: {
    progress?: string[];
    prof?: { verdict: 'passed' | 'failed'; stars: number } | null;
    generated?: Array<{ challengeId: string; statement?: string }>;
    attempts?: Record<string, AttemptRow[]>;
  } = {},
): TrackProgressWriter & { marcas: Array<[string, string]> } {
  const marcas: Array<[string, string]> = [];
  const attempts = over.attempts ?? {};
  return {
    marcas,
    async listTrackLessonProgress() {
      return (over.progress ?? []).map((lessonId) => ({
        trackSlug: 'js-do-zero',
        lessonId,
        completedAt: '2026-01-01T00:00:00.000Z',
      }));
    },
    async getTrackProficiency() {
      if (!over.prof) return null;
      return {
        trackSlug: 'js-do-zero',
        verdict: over.prof.verdict,
        stars: over.prof.stars,
        passedAt: '2026-01-01T00:00:00.000Z',
      };
    },
    async listGeneratedChallenges() {
      return (over.generated ?? []).map((g) => ({
        id: `gen-${g.challengeId}`,
        trackSlug: 'js-do-zero',
        lessonId: 'a1',
        challengeId: g.challengeId,
        statement: g.statement ?? 'statement gerado',
        starterCode: 'starter gerado',
        testsCode: 'test("g", () => {});',
        solutionCode: 'solução gerada',
        expectedTestCount: 1,
        createdAt: '2026-01-02T00:00:00.000Z',
      }));
    },
    async getAttemptsForChallenge(challengeId: string) {
      return attempts[challengeId] ?? [];
    },
    async markTrackLessonDone(trackSlug: string, lessonId: string) {
      marcas.push([trackSlug, lessonId]);
    },
  };
}

function attempt(verdict: TrackVerdict, stars = 0): AttemptRow {
  return {
    id: `id-${verdict}-${stars}`,
    subjectId: 'sub',
    lessonId: 'lesson:x',
    challengeId: 'qualquer',
    verdict,
    stars,
    durationMs: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

// ─── funções puras ───────────────────────────────────────────────────────────

describe('cx/trackService: timeLimitForDifficultyMs (twin do renderer)', () => {
  it('T = 90s + difficulty*60s; dificuldade inválida/ausente ⇒ fallback 300s', () => {
    assert.equal(timeLimitForDifficultyMs(1), 150_000);
    assert.equal(timeLimitForDifficultyMs(3), 270_000);
    assert.equal(timeLimitForDifficultyMs(5), 390_000);
    assert.equal(timeLimitForDifficultyMs(undefined), 300_000);
    assert.equal(timeLimitForDifficultyMs(0), 300_000);
    assert.equal(timeLimitForDifficultyMs(-1), 300_000);
    assert.equal(timeLimitForDifficultyMs(NaN), 300_000);
    assert.equal(timeLimitForDifficultyMs(Infinity), 300_000);
  });
});

describe('cx/trackService: summarizeAttempts', () => {
  it('último veredito/estrelas vencem; failed|timeout contam; abandoned/passed não', () => {
    assert.deepEqual(summarizeAttempts([]), { lastVerdict: null, stars: 0, failedCount: 0 });
    assert.deepEqual(
      summarizeAttempts([
        { verdict: 'failed', stars: 1 },
        { verdict: 'timeout', stars: 2 },
        { verdict: 'abandoned', stars: 0 },
        { verdict: 'passed', stars: 3 },
      ]),
      { lastVerdict: 'passed', stars: 3, failedCount: 2 },
    );
  });
});

describe('cx/trackService: flattenTrackLessons e computeUnlockStates', () => {
  it('achatamento segue order dos módulos e a ordem declarada das aulas', () => {
    const flat = flattenTrackLessons(trilhaBase());
    assert.deepEqual(
      flat.map((f) => [f.moduleSlug, f.lesson.meta.slug]),
      [
        ['m1', 'a1'],
        ['m1', 'a2'],
        ['m2', 'a3'],
      ],
    );
  });

  it('sequencial: 1ª livre; seguintes travam até a anterior concluir; current é a 1ª livre não-feita', () => {
    const track = trilhaBase();
    const estados = computeUnlockStates(track, new Set(), false);
    assert.deepEqual(estados.get('a1'), { locked: false, done: false, current: true });
    assert.deepEqual(estados.get('a2'), { locked: true, done: false, current: false });
    assert.deepEqual(estados.get('a3'), { locked: true, done: false, current: false });
  });

  it('concluir a1 destrava a2 (current anda); concluir tudo ⇒ current nenhuma', () => {
    const track = trilhaBase();
    const meio = computeUnlockStates(track, new Set(['a1']), false);
    assert.deepEqual(meio.get('a1'), { locked: false, done: true, current: false });
    assert.deepEqual(meio.get('a2'), { locked: false, done: false, current: true });
    assert.equal(meio.get('a3')?.locked, true);

    const fim = computeUnlockStates(track, new Set(['a1', 'a2', 'a3']), false);
    for (const slug of ['a1', 'a2', 'a3']) {
      assert.equal(fim.get(slug)?.done, true);
      assert.equal(fim.get(slug)?.locked, false, 'aula feita nunca volta a travar');
      assert.equal(fim.get(slug)?.current, false, 'trilha 100% ⇒ sem current');
    }
  });

  it('proficiência passada DESTRAVA a trilha inteira mesmo sem done', () => {
    const estados = computeUnlockStates(trilhaBase(), new Set(), true);
    for (const slug of ['a1', 'a2', 'a3']) {
      assert.deepEqual(estados.get(slug), { locked: false, done: false, current: slug === 'a1' });
    }
  });
});

describe('cx/trackService: loadTrackState e computeNextLesson', () => {
  it('proficient só com veredito passed (failed NÃO destrava)', async () => {
    const ok = await loadTrackState('js-do-zero', repoFake({ progress: ['a1'], prof: { verdict: 'passed', stars: 2 } }));
    assert.deepEqual([...ok.doneSet], ['a1']);
    assert.equal(ok.proficient, true);
    const falhou = await loadTrackState('js-do-zero', repoFake({ prof: { verdict: 'failed', stars: 0 } }));
    assert.equal(falhou.proficient, false);
  });

  it('próxima = 1ª destravada e não-feita DEPOIS da atual, com esta simulada concluída (regra d)', () => {
    const track = trilhaBase();
    assert.deepEqual(computeNextLesson(track, 'a1', new Set(), false), {
      slug: 'a2',
      title: 'Aula a2',
    });
    // a2 simulada concluída destrava a3 ⇒ próxima é a3 (mesmo sem done real).
    assert.deepEqual(computeNextLesson(track, 'a2', new Set(), false), {
      slug: 'a3',
      title: 'Aula a3',
    });
  });

  it('próxima pula aula JÁ feita; última aula/slug inexistente ⇒ null; proficiência nunca deixa a próxima trancada', () => {
    const track = trilhaBase();
    assert.deepEqual(computeNextLesson(track, 'a1', new Set(['a2']), false), {
      slug: 'a3',
      title: 'Aula a3',
    });
    assert.equal(computeNextLesson(track, 'a3', new Set(), false), null);
    assert.equal(computeNextLesson(track, 'nao-existe', new Set(), false), null);
    assert.deepEqual(
      computeNextLesson(track, 'a2', new Set(), true),
      { slug: 'a3', title: 'Aula a3' },
    );
  });
});

// ─── payloads do contrato ────────────────────────────────────────────────────

describe('cx/trackService: buildTrackList / buildTrackDetail', () => {
  it('lista: contagens por trilha (módulos/aulas/feitas) + proficiência', async () => {
    const lista = await buildTrackList([trilhaBase()], repoFake({ progress: ['a1', 'a2'], prof: { verdict: 'passed', stars: 3 } }));
    assert.deepEqual(lista, [
      {
        slug: 'js-do-zero',
        title: 'JS do Zero',
        description: 'Do zero ao primeiro desafio.',
        domain: 'programming',
        moduleCount: 2,
        lessonCount: 3,
        doneCount: 2,
        proficient: true,
      },
    ]);
  });

  it('detalhe: estados por aula + desafio de módulo (disponível/último veredito/estrelas)', async () => {
    const repo = repoFake({
      progress: ['a1'],
      attempts: { 'c-mod': [attempt('failed', 1), attempt('passed', 2)] },
    });
    const detalhe = await buildTrackDetail(trilhaBase(), repo);
    assert.equal(detalhe.slug, 'js-do-zero');
    assert.equal(detalhe.proficiencyAvailable, true, 'a trilha declara proficiência');
    assert.equal(detalhe.proficient, false);
    assert.equal(detalhe.lessonCount, 3);
    assert.equal(detalhe.doneCount, 1);

    assert.deepEqual(detalhe.modules.map((m) => m.slug), ['m1', 'm2']);
    const m2 = detalhe.modules[1];
    assert.equal(m2.order, 2);
    assert.equal(m2.challengeAvailable, true);
    assert.deepEqual(m2.challenge, { slug: 'c-mod', title: 'Desafio c-mod' });
    assert.equal(m2.challengeLastVerdict, 'passed');
    assert.equal(m2.challengeStars, 2);
    assert.equal(detalhe.modules[0].challengeAvailable, false);
    assert.deepEqual(detalhe.modules[0].challenge, null);

    assert.deepEqual(
      detalhe.modules[0].lessons.map((l) => [l.slug, l.locked, l.done, l.current]),
      [
        ['a1', false, true, false],
        ['a2', false, false, true],
      ],
    );
  });
});

describe('cx/trackService: buildTrackLesson (payload de UMA aula)', () => {
  it('teoria, fontes, pré-requisitos resolvidos (desconhecidos somem), assertions e estados', async () => {
    const track = trackDe([
      moduleOf('m1', 1, [
        lesson('a1'),
        lesson(
          'a2',
          {
            prerequisites: ['a1', 'fantasma'],
            assertions: [
              {
                id: 'af-1',
                statement: 's',
                question: 'q?',
                options: ['a', 'b', 'c', 'd'],
                answerIndex: 0,
                feedback: 'f',
                sectionId: 'sec-a2',
                optionRationales: ['r0', 'r1', 'r2', 'r3'],
              },
            ],
          },
          [challenge('c-a2')],
        ),
      ]),
    ]);
    const payload = await buildTrackLesson(track, 'm1', 'a2', repoFake({ progress: ['a1'] }));

    assert.ok(payload);
    assert.equal(payload.slug, 'a2');
    assert.equal(payload.title, 'Aula a2');
    assert.deepEqual(payload.prerequisites, [{ slug: 'a1', title: 'Aula a1' }], 'pré-requisito sem aula some');
    assert.deepEqual(payload.theory, [
      { id: 'sec-a2', title: 'Teoria a2', markdown: 'markdown da seção', code: { language: 'js', code: 'const x = 1;' } },
    ]);
    assert.deepEqual(payload.sources, [{ title: 'Fonte', url: 'https://f', description: 'desc' }]);
    assert.deepEqual(payload.assertions, [
      {
        id: 'af-1',
        statement: 's',
        question: 'q?',
        options: ['a', 'b', 'c', 'd'],
        answerIndex: 0,
        feedback: 'f',
        sectionId: 'sec-a2',
        optionRationales: ['r0', 'r1', 'r2', 'r3'],
      },
    ]);
    assert.deepEqual(payload.challenges, [
      {
        slug: 'c-a2',
        title: 'Desafio c-a2',
        concept: 'funcoes',
        difficulty: 2,
        lastVerdict: null,
        stars: 0,
        failedCount: 0,
        generated: false,
      },
    ]);
    assert.equal(payload.locked, false);
    assert.equal(payload.done, false);
    assert.equal(payload.nextLesson, null, 'a2 é a última ⇒ sem próxima');
  });

  it('aula/ módulo inexistentes ⇒ null; assertions ausentes ⇒ payload SEM o campo', async () => {
    const track = trilhaBase();
    assert.equal(await buildTrackLesson(track, 'm1', 'nao-existe', repoFake()), null);
    assert.equal(await buildTrackLesson(track, 'modulo-errado', 'a1', repoFake()), null);
    const payload = await buildTrackLesson(track, 'm1', 'a1', repoFake());
    assert.ok(payload);
    assert.equal(
      payload.assertions,
      undefined,
      'aula sem quiz: assertions vem undefined (chave presente, valor vazio)',
    );
  });
});

describe('cx/trackService: buildChallengeSummaries (gerados PRIMEIRO, autorais depois)', () => {
  it('ordem, identidade do gerado (title=challengeId, concept "gerado", difficulty 2) e tentativas por slug', async () => {
    const track = trilhaBase();
    const a1 = findLessonInTrack(track, 'a1')!.lesson;
    const repo = repoFake({
      generated: [{ challengeId: 'gen-dobro' }],
      attempts: {
        'gen-dobro': [attempt('failed', 0), attempt('passed', 3)],
        'c-a1': [attempt('timeout', 1)],
      },
    });
    const resumos = await buildChallengeSummaries('js-do-zero', a1, repo, track);
    assert.deepEqual(resumos, [
      {
        slug: 'gen-dobro',
        title: 'gen-dobro',
        concept: 'gerado',
        difficulty: 2,
        lastVerdict: 'passed',
        stars: 3,
        failedCount: 1,
        generated: true,
      },
      {
        slug: 'c-a1',
        title: 'Desafio c-a1',
        concept: 'funcoes',
        difficulty: 2,
        lastVerdict: 'timeout',
        stars: 1,
        failedCount: 1,
        generated: false,
      },
    ]);
  });
});

// ─── gates e conclusão ───────────────────────────────────────────────────────

describe('cx/trackService: lessonIsLocked / lessonChallengesAllPassed / completeLessonOnChallengePass', () => {
  it('lessonIsLocked é a régua Única da trava sequencial', async () => {
    const track = trilhaBase();
    assert.equal(await lessonIsLocked(track, 'js-do-zero', 'a1', repoFake()), false);
    assert.equal(await lessonIsLocked(track, 'js-do-zero', 'a2', repoFake()), true);
    assert.equal(await lessonIsLocked(track, 'js-do-zero', 'a2', repoFake({ prof: { verdict: 'passed', stars: 1 } })), false);
  });

  it('lessonChallengesAllPassed: tudo passed OU o recém-submetido conta pelo id; sem desafios ⇒ true', () => {
    const base = [{ slug: 'c1', lastVerdict: null as TrackVerdict | null }, { slug: 'c2', lastVerdict: 'passed' as TrackVerdict }];
    assert.equal(lessonChallengesAllPassed(base, 'c1'), true, 'o recém-aprovado conta pelo id');
    assert.equal(lessonChallengesAllPassed(base, 'outro'), false);
    assert.equal(lessonChallengesAllPassed([], 'qualquer'), true);
    assert.equal(
      lessonChallengesAllPassed([{ slug: 'c1', lastVerdict: 'failed' }, { slug: 'c2', lastVerdict: 'passed' }], 'c2'),
      false,
    );
  });

  it('passar no desafio conclui a aula E grava done — só quando o gate inteiro passa', async () => {
    const track = trilhaBase(); // a1 tem só o desafio c-a1
    // (a) happy: c-a1 recém-aprovado conta pelo id.
    const feliz = repoFake();
    assert.equal(
      await completeLessonOnChallengePass(
        track,
        { trackSlug: 'js-do-zero', lessonId: 'a1', challengeId: 'c-a1' },
        feliz,
      ),
      true,
    );
    assert.deepEqual(feliz.marcas, [['js-do-zero', 'a1']]);

    // (b) aula trancada NÃO grava (gate sequencial idem ao track:lesson-done).
    const trancada = repoFake();
    assert.equal(
      await completeLessonOnChallengePass(
        track,
        { trackSlug: 'js-do-zero', lessonId: 'a2', challengeId: 'c-qualquer' },
        trancada,
      ),
      false,
    );
    assert.deepEqual(trancada.marcas, []);

    // (c) aula inexistente ⇒ false em silêncio.
    const fantasma = repoFake();
    assert.equal(
      await completeLessonOnChallengePass(
        track,
        { trackSlug: 'js-do-zero', lessonId: 'nao-existe', challengeId: 'c-x' },
        fantasma,
      ),
      false,
    );
    assert.deepEqual(fantasma.marcas, []);
  });

  it('desafio reprovado em aula com 2 desafios NÃO conclui (falta o outro)', async () => {
    const track = trackDe([
      moduleOf('m1', 1, [
        lesson('a1', {}, [challenge('c1'), challenge('c2')]),
      ]),
    ]);
    const repo = repoFake({ attempts: { c1: [attempt('failed')] } });
    assert.equal(
      await completeLessonOnChallengePass(
        track,
        { trackSlug: 'js-do-zero', lessonId: 'a1', challengeId: 'c2' },
        repo,
      ),
      false,
      'c1 continua reprovado ⇒ aula não fecha',
    );
    assert.deepEqual(repo.marcas, []);
  });
});

// ─── resolveChallengeSpec ────────────────────────────────────────────────────

describe('cx/trackService: resolveChallengeSpec (aula × módulo × proficiência × gerado)', () => {
  it('desafio de AULA: spec completo, minFirstStar default 60s, timeLimit por dificuldade', async () => {
    const track = trilhaBase();
    const spec = await resolveChallengeSpecSafe(track, 'lesson', 'a1', 'c-a1', repoFake());
    assert.ok(spec);
    assert.equal(spec.slug, 'c-a1');
    assert.equal(spec.source, 'track');
    assert.equal(spec.concept, 'funcoes');
    assert.equal(spec.minFirstStarMs, 60_000, 'DEFAULT_MIN_FIRST_STAR_MS');
    assert.equal(spec.timeLimitMs, timeLimitForDifficultyMs(2));
    assert.equal(spec.statement, 'Implemente.');
    assert.equal(spec.expectedTestCount, 1);
  });

  it('multi-arquivo: files por arquivo com starters; starterCode de topo vem do 1º arquivo', async () => {
    const track = trackDe([
      moduleOf('m1', 1, [
        lesson('a1', {}, [
          challenge('c-multi', {
            files: [
              { path: 'lib/um.mjs', starterCode: 'starter um', solutionCode: 'sol um' },
              { path: 'lib/dois.mjs', starterCode: 'starter dois', solutionCode: 'sol dois' },
            ],
          }),
        ]),
      ]),
    ]);
    const spec = await resolveChallengeSpecSafe(track, 'lesson', 'a1', 'c-multi', repoFake());
    assert.ok(spec);
    assert.deepEqual(spec.files, [
      { path: 'lib/um.mjs', starterCode: 'starter um' },
      { path: 'lib/dois.mjs', starterCode: 'starter dois' },
    ]);
    assert.equal(spec.starterCode, 'starter um');
  });

  it('PROFICIÊNCIA: carência da 1ª estrela 120s e slug precisa bater; módulo idem com 60s', async () => {
    const track = trilhaBase();
    const prof = await resolveChallengeSpecSafe(track, 'proficiency', undefined, 'c-prof', repoFake());
    assert.ok(prof);
    assert.equal(prof.source, 'track');
    assert.equal(prof.minFirstStarMs, 120_000, 'PROFICIENCY_MIN_FIRST_STAR_MS');
    assert.equal(prof.timeLimitMs, timeLimitForDifficultyMs(4));

    assert.equal(
      await resolveChallengeSpecSafe(track, 'proficiency', undefined, 'slug-errado', repoFake()),
      null,
    );
    assert.equal(
      await resolveChallengeSpecSafe(trackDe([moduleOf('m1', 1, [lesson('a1')])]), 'proficiency', undefined, 'c-prof', repoFake()),
      null,
      'trilha sem proficiência',
    );

    const mod = await resolveChallengeSpecSafe(track, 'module', undefined, 'c-mod', repoFake(), 'm2');
    assert.ok(mod);
    assert.equal(mod.slug, 'c-mod');
    assert.equal(mod.minFirstStarMs, 60_000);
    assert.equal(
      await resolveChallengeSpecSafe(track, 'module', undefined, 'c-mod', repoFake(), 'm1'),
      null,
      'módulo errado',
    );
  });

  it('desafio GERADO: source "generated", identidade sintética e contexto das tentativas', async () => {
    const track = trilhaBase();
    const repo = repoFake({
      generated: [{ challengeId: 'gen-dobro', statement: 'st gerado' }],
      attempts: { 'gen-dobro': [attempt('failed', 0), attempt('passed', 3)] },
    });
    const spec = await resolveChallengeSpecSafe(track, 'lesson', 'a1', 'gen-dobro', repo);
    assert.ok(spec);
    assert.equal(spec.source, 'generated');
    assert.equal(spec.title, 'gen-dobro');
    assert.equal(spec.concept, 'gerado');
    assert.equal(spec.difficulty, 2);
    assert.equal(spec.statement, 'st gerado');
    assert.equal(spec.minFirstStarMs, 60_000);
    assert.equal(spec.timeLimitMs, timeLimitForDifficultyMs(2));
    assert.equal(spec.lastVerdict, 'passed');
    assert.equal(spec.stars, 3);
    assert.equal(spec.failedCount, 1);
  });

  it('alvos inexistentes ⇒ null (sem lessonId, desafio desconhecido, lesson inexistente)', async () => {
    const track = trilhaBase();
    assert.equal(await resolveChallengeSpecSafe(track, 'lesson', undefined, 'c-a1', repoFake()), null);
    assert.equal(await resolveChallengeSpecSafe(track, 'lesson', 'a1', 'nao-existe', repoFake()), null);
    assert.equal(await resolveChallengeSpecSafe(track, 'lesson', 'nao-existe', 'c-a1', repoFake()), null);
  });
});

describe('cx/trackService: findLessonInTrack', () => {
  it('acha a aula em QUALQUER módulo com o moduleSlug dela; inexistente ⇒ null', () => {
    const track = trilhaBase();
    assert.deepEqual(
      findLessonInTrack(track, 'a3')?.moduleSlug,
      'm2',
    );
    assert.equal(findLessonInTrack(track, 'nao-existe'), null);
  });
});

// ─── REGRESSÃO (bug G): assertion.optionRationales atravessa o payload ───────

describe('cx/trackService: bug G — assertion.optionRationales chega ao payload (regressão)', () => {
  it('o payload CARREGA optionRationales quando a aula o declara (campo incluído)', async () => {
    const track = trackDe([
      moduleOf('m1', 1, [
        lesson(
          'a1',
          {
            assertions: [
              {
                id: 'af-1',
                statement: 's',
                question: 'q?',
                options: ['a', 'b', 'c', 'd'],
                answerIndex: 0,
                feedback: 'f',
                optionRationales: ['r0', 'r1', 'r2', 'r3'],
              },
            ],
          },
        ),
      ]),
    ]);
    const payload = await buildTrackLesson(track, 'm1', 'a1', repoFake());
    assert.ok(payload?.assertions);
    assert.equal(
      'optionRationales' in payload.assertions[0],
      true,
      'campo incluído: optionRationales faz parte da assertion do payload',
    );
    assert.deepEqual(
      payload.assertions[0].optionRationales,
      ['r0', 'r1', 'r2', 'r3'],
      'o racional autoral declarado atravessa o payload',
    );
  });

  it(
    'regressão (bug G): buildTrackLesson COPIA assertion.optionRationales para o payload — trackService.ts:325-336',
    async () => {
      // Comportamento CORRETO: o DTO TrackAssertionDto DECLARA optionRationales
      // (shared/ipc-contract.ts) — o mapping atravessa-o quando presente.
      const track = trackDe([
        moduleOf('m1', 1, [
          lesson(
            'a1',
            {
              assertions: [
                {
                  id: 'af-1',
                  statement: 's',
                  question: 'q?',
                  options: ['a', 'b', 'c', 'd'],
                  answerIndex: 0,
                  feedback: 'f',
                  optionRationales: ['r0', 'r1', 'r2', 'r3'],
                },
              ],
            },
          ),
        ]),
      ]);
      const payload = await buildTrackLesson(track, 'm1', 'a1', repoFake());
      assert.deepEqual(
        payload?.assertions?.[0]?.optionRationales,
        ['r0', 'r1', 'r2', 'r3'],
        'correto: o racional autoral chega ao renderer/tutor',
      );
    },
  );
});

// wrapper para encurtar as chamadas de resolveChallengeSpec (assinatura longa).
async function resolveChallengeSpecSafe(
  track: LoadedTrack,
  target: 'lesson' | 'proficiency' | 'module',
  lessonId: string | undefined,
  challengeId: string | undefined,
  repo: TrackProgressWriter,
  moduleSlug?: string,
): Promise<TrackChallengeSpec | null> {
  return resolveChallengeSpec(track, target, lessonId, challengeId, repo, moduleSlug);
}
