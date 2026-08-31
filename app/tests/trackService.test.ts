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
  computeNextLesson,
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

function makeTrack(
  lessons: Array<{ moduleSlug: string; lesson: TrackLessonSource; challenge?: TrackChallengeSource }>,
  moduleChallenges: Array<{ moduleSlug: string; challenge: TrackChallengeSource }> = [],
): LoadedTrack {
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
  // ADITIVO (rodada 9): desafios de MÓDULO por módulo.
  const challengeByModule = new Map(moduleChallenges.map((x) => [x.moduleSlug, x.challenge]));
  return {
    root: track,
    modules: [...modules.values()]
      .sort((a, b) => a.order - b.order)
      .map((m) => ({ meta: m, lessons: byModule.get(m.slug)!, challenge: challengeByModule.get(m.slug) ?? null })),
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

describe('computeNextLesson — próxima aula (onda 4 next-glow)', () => {
  it('meio da trilha → a próxima destravada e não feita', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
      { moduleSlug: 'm1', lesson: lesson('a3') },
    ]);
    // a1 concluída → a2 é a próxima destravada e não feita.
    assert.deepEqual(computeNextLesson(track, 'a1', new Set(['a1']), false), { slug: 'a2', title: 'a2' });
  });

  it('última aula → null (não há próxima)', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
    ]);
    assert.equal(computeNextLesson(track, 'a2', new Set(['a1', 'a2']), false), null);
  });

  it('aula não encontrada na trilha → null (defensivo)', () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    assert.equal(computeNextLesson(track, 'fantasma', new Set(), false), null);
  });

  it('pula aulas JÁ concluídas depois da atual', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
      { moduleSlug: 'm1', lesson: lesson('a3') },
    ]);
    // a2 já feita → a3 (destravada porque a2 está feita).
    assert.deepEqual(computeNextLesson(track, 'a1', new Set(['a1', 'a2']), false), { slug: 'a3', title: 'a3' });
  });

  it('DECISÃO (d): simula esta aula concluída — sem done real, a próxima é a que destravaria', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
      { moduleSlug: 'm1', lesson: lesson('a3') },
    ]);
    // a1 AINDA não feita: sem a simulação, a2 ficaria locked; com a simulação
    // (done=true em a1) → a2 é a próxima destravada e não feita.
    assert.deepEqual(computeNextLesson(track, 'a1', new Set(), false), { slug: 'a2', title: 'a2' });
  });

  it('proficiente destrava tudo → próxima = primeira não feita depois da atual', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
      { moduleSlug: 'm1', lesson: lesson('a3') },
    ]);
    assert.deepEqual(computeNextLesson(track, 'a1', new Set(), true), { slug: 'a2', title: 'a2' });
  });

  it('tudo concluído depois da atual → null', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
    ]);
    assert.equal(computeNextLesson(track, 'a1', new Set(['a1', 'a2']), false), null);
  });

  it('a próxima pode estar no MÓDULO seguinte (ordem por module.order)', () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm2', lesson: lesson('b1') },
    ]);
    assert.deepEqual(computeNextLesson(track, 'a1', new Set(['a1']), false), { slug: 'b1', title: 'b1' });
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

  it('ADITIVO: buildTrackLesson propaga assertions da aula no payload', async () => {
    const assertions = [
      {
        id: 'variavel-guarda-valor',
        statement: 'Uma variável guarda um valor em memória.',
        question: 'O que uma variável guarda?',
        options: ['Um valor', 'Um programa', 'Uma pasta', 'Uma tecla'],
        answerIndex: 0,
        feedback: 'Certo! A variável é uma caixa com um valor.',
      },
    ];
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1', { assertions }), challenge: challenge('ch-a1') },
    ]);
    const payload = await buildTrackLesson(track, 'm1', 'a1', fakeRepo());
    assert.ok(payload);
    assert.equal(payload.assertions?.length, 1);
    assert.equal(payload.assertions?.[0].id, 'variavel-guarda-valor');
    assert.equal(payload.assertions?.[0].answerIndex, 0);
    assert.deepEqual(payload.assertions?.[0].options, ['Um valor', 'Um programa', 'Uma pasta', 'Uma tecla']);
  });

  it('ADITIVO: aula SEM assertions → payload sem o campo (aditivo opcional)', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1'), challenge: challenge('ch-a1') }]);
    const payload = await buildTrackLesson(track, 'm1', 'a1', fakeRepo());
    assert.ok(payload);
    assert.equal(payload.assertions, undefined);
  });

  // ─── ADITIVO (onda3-generate-flow, pedido C): GERADOS no TOPO ──────────────
  it('ONDA3: desafios GERADOS vêm PRIMEIRO (mais recente primeiro), autorais depois', async () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1'), challenge: challenge('ch-a1') },
      { moduleSlug: 'm1', lesson: lesson('a2'), challenge: challenge('ch-a2') },
    ]);
    // O repo já ordena created_at DESC — o serviço NÃO reordena (fonte é a
    // ordem devolvida); os autorais entram depois, na ordem declarada.
    const repo = fakeRepo({
      listGeneratedChallenges: async (_t, _l) => [
        {
          id: 'g2',
          trackSlug: 'trilha',
          lessonId: 'a1',
          challengeId: 'gerado-mais-novo',
          statement: 'Novo 2.',
          starterCode: 'export function f() {}\n',
          testsCode: '// tests\n',
          solutionCode: 'export function f() {}\n',
          expectedTestCount: 1,
          createdAt: '2026-08-28T10:00:00.000Z',
        },
        {
          id: 'g1',
          trackSlug: 'trilha',
          lessonId: 'a1',
          challengeId: 'gerado-antigo',
          statement: 'Novo 1.',
          starterCode: 'export function f() {}\n',
          testsCode: '// tests\n',
          solutionCode: 'export function f() {}\n',
          expectedTestCount: 1,
          createdAt: '2026-08-27T10:00:00.000Z',
        },
      ],
    });
    const payload = await buildTrackLesson(track, 'm1', 'a1', repo);
    assert.ok(payload);
    // 1º: o gerado MAIS NOVO; 2º: o gerado antigo; 3º+: os autorais.
    assert.deepEqual(
      payload.challenges.map((c) => c.slug),
      ['gerado-mais-novo', 'gerado-antigo', 'ch-a1'],
    );
    assert.equal(payload.challenges[0].generated, true);
    assert.equal(payload.challenges[2].generated, false);
  });

  it('ONDA3: sem desafios gerados, os autorais mantêm a ordem declarada', async () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1'), challenge: challenge('ch-b') },
    ]);
    // Segundo desafio autoral na MESMA aula (ordem declarada: ch-b, ch-a).
    (track.modules[0].lessons[0] as { challenges: unknown[] }).challenges.push(challenge('ch-a'));
    const payload = await buildTrackLesson(track, 'm1', 'a1', fakeRepo());
    assert.ok(payload);
    assert.deepEqual(
      payload.challenges.map((c) => c.slug),
      ['ch-b', 'ch-a'],
    );
  });

  // ─── ADITIVO (rodada 9): desafio do MÓDULO ──────────────────────────────────

  it('ADITIVO: buildTrackDetail marca challengeAvailable e o estado do aluno', async () => {
    const track = makeTrack(
      [{ moduleSlug: 'm1', lesson: lesson('a1') }],
      [{ moduleSlug: 'm1', challenge: challenge('desafio-do-modulo', { difficulty: 3 }) }],
    );
    const repo = fakeRepo({
      getAttemptsForChallenge: async (id: string) =>
        id === 'desafio-do-modulo'
          ? [
              { id: '1', subjectId: 's', lessonId: 'l', challengeId: id, verdict: 'failed', stars: 2, durationMs: 0, createdAt: '1' },
              { id: '2', subjectId: 's', lessonId: 'l', challengeId: id, verdict: 'passed', stars: 1, durationMs: 0, createdAt: '2' },
            ]
          : [],
    });
    const detail = await buildTrackDetail(track, repo);
    const mod = detail.modules[0];
    assert.equal(mod.challengeAvailable, true);
    assert.deepEqual(mod.challenge, { slug: 'desafio-do-modulo', title: 'desafio-do-modulo' });
    assert.equal(mod.challengeLastVerdict, 'passed');
    assert.equal(mod.challengeStars, 1);
  });

  it('ADITIVO: buildTrackDetail sem desafio de módulo → challengeAvailable false', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    const detail = await buildTrackDetail(track, fakeRepo());
    assert.equal(detail.modules[0].challengeAvailable, false);
    assert.equal(detail.modules[0].challenge, null);
    assert.equal(detail.modules[0].challengeLastVerdict, null);
    assert.equal(detail.modules[0].challengeStars, 0);
  });

  it('ONDA4: buildTrackLesson propaga nextLesson no payload (próxima destravada)', async () => {
    const track = makeTrack([
      { moduleSlug: 'm1', lesson: lesson('a1') },
      { moduleSlug: 'm1', lesson: lesson('a2') },
    ]);
    const repo = fakeRepo({
      listTrackLessonProgress: async () => [{ trackSlug: 'trilha', lessonId: 'a1', completedAt: 'x' }],
    });
    const payload = await buildTrackLesson(track, 'm1', 'a1', repo);
    assert.ok(payload);
    assert.deepEqual(payload.nextLesson, { slug: 'a2', title: 'a2' });

    // ÚLTIMA aula → nextLesson null (o campo SEMPRE vem no payload, null ou
    // objeto — o renderer não precisa de fallback para undefined).
    const last = await buildTrackLesson(track, 'm1', 'a2', repo);
    assert.ok(last);
    assert.equal(last.nextLesson, null);
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

  // ─── ADITIVO (rodada 9): target 'module' (desafio do módulo) ────────────────

  it('ADITIVO: resolve desafio do MÓDULO com os STARTERS por arquivo (sem soluções)', async () => {
    const track = makeTrack(
      [{ moduleSlug: 'm1', lesson: lesson('a1') }],
      [
        {
          moduleSlug: 'm1',
          challenge: challenge('desafio-do-modulo', {
            difficulty: 3,
            files: [
              { path: 'lib/soma.mjs', starterCode: 'export function soma(a, b) { throw new Error("x"); }\n', solutionCode: 'export function soma(a, b) { return a + b; }\n' },
              { path: 'lib/multiplica.mjs', starterCode: 'export function multiplica(a, b) { throw new Error("x"); }\n', solutionCode: 'export function multiplica(a, b) { return a * b; }\n' },
            ],
          }),
        },
      ],
    );
    const spec = await resolveChallengeSpec(track, 'module', undefined, 'desafio-do-modulo', fakeRepo(), 'm1');
    assert.ok(spec);
    assert.equal(spec.source, 'track');
    assert.equal(spec.files?.length, 2);
    assert.equal(spec.files?.[0].path, 'lib/soma.mjs');
    assert.equal(spec.files?.[0].starterCode, 'export function soma(a, b) { throw new Error("x"); }\n');
    // starters sim, soluções NUNCA:
    assert.equal((spec.files?.[0] as { solutionCode?: unknown }).solutionCode, undefined);
    // starterCode único carrega o do PRIMEIRO arquivo (fallback da UI):
    assert.equal(spec.starterCode, 'export function soma(a, b) { throw new Error("x"); }\n');
    assert.equal(spec.timeLimitMs, timeLimitForDifficultyMs(3));
  });

  it('ADITIVO: target module com moduleSlug errado ou slug divergente → null', async () => {
    const track = makeTrack(
      [{ moduleSlug: 'm1', lesson: lesson('a1') }],
      [{ moduleSlug: 'm1', challenge: challenge('desafio-do-modulo') }],
    );
    assert.equal(await resolveChallengeSpec(track, 'module', undefined, 'desafio-do-modulo', fakeRepo(), 'outro-modulo'), null);
    assert.equal(await resolveChallengeSpec(track, 'module', undefined, 'outro-slug', fakeRepo(), 'm1'), null);
  });

  it('ADITIVO: módulo sem desafio → null', async () => {
    const track = makeTrack([{ moduleSlug: 'm1', lesson: lesson('a1') }]);
    const spec = await resolveChallengeSpec(track, 'module', undefined, 'desafio-do-modulo', fakeRepo(), 'm1');
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
