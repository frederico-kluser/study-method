/**
 * electron/main/services/trackService.ts — lógica de TRILHA (rodada 8).
 *
 * Conteúdo = arquivos estáticos (trackLoader); progresso = SQLite (repo).
 * Este serviço CASAMENTA os dois e produz os DTOs do contrato
 * (shared/ipc-contract.ts): lista de trilhas, detalhe com estados
 * locked/done/current, conteúdo de aula, especificação de desafio e o
 * destravamento sequencial (aula seguinte só destrava quando a anterior foi
 * concluída — OU quando o teste de proficiência, que cobre TUDO, foi passado).
 *
 * PURE/DI: `repo` é a interface mínima (TrackProgressLike) — injetável em
 * testes sem electron.
 */

import {
  DEFAULT_MIN_FIRST_STAR_MS,
  PROFICIENCY_MIN_FIRST_STAR_MS,
  TrackChallengeSource,
} from '../content/trackTypes';
import {
  LoadedLesson,
  LoadedModule,
  LoadedTrack,
  findChallenge,
  findLesson,
} from '../content/trackLoader';
import type {
  TrackChallengeSpec,
  TrackDetailPayload,
  TrackLessonEntry,
  TrackLessonPayload,
  TrackListEntry,
  TrackVerdict,
} from '../../../shared/ipc-contract';

/** Interface mínima de progresso exigida pelo serviço (subconjunto do repo). */
export interface TrackProgressLike {
  listTrackLessonProgress(trackSlug: string): Promise<{ trackSlug: string; lessonId: string; completedAt: string }[]>;
  getTrackProficiency(trackSlug: string): Promise<{ trackSlug: string; verdict: 'passed' | 'failed'; stars: number; passedAt: string } | null>;
  listGeneratedChallenges(
    trackSlug: string,
    lessonId: string,
  ): Promise<{ id: string; trackSlug: string; lessonId: string; challengeId: string; statement: string; starterCode: string; testsCode: string; solutionCode: string; expectedTestCount: number; createdAt: string }[]>;
  getAttemptsForChallenge(challengeId: string): Promise<{ id: string; subjectId: string; lessonId: string; challengeId: string; verdict: TrackVerdict; stars: number; durationMs: number; createdAt: string }[]>;
}

/**
 * Limite de tempo por dificuldade — MESMA fórmula do renderer
 * (src/lib/challengeStars.ts: T = 90s + difficulty*60s; fallback 300s).
 * Duplicada aqui de propósito: o main monta o TrackChallengeSpec e o renderer
 * roda o cronômetro; cada lado tem o seu twin testado.
 */
export function timeLimitForDifficultyMs(difficulty?: number): number {
  if (typeof difficulty !== 'number' || !Number.isFinite(difficulty) || difficulty < 1) {
    return 300_000;
  }
  return 90_000 + difficulty * 60_000;
}

/** Último veredito + estrelas + contagem de falhas de um desafio. */
export interface AttemptSummary {
  lastVerdict: TrackVerdict | null;
  stars: number;
  failedCount: number;
}

export function summarizeAttempts(
  attempts: readonly { verdict: TrackVerdict; stars: number }[],
): AttemptSummary {
  let lastVerdict: TrackVerdict | null = null;
  let stars = 0;
  let failedCount = 0;
  for (const a of attempts) {
    lastVerdict = a.verdict;
    stars = a.stars;
    if (a.verdict === 'failed' || a.verdict === 'timeout') failedCount += 1;
  }
  return { lastVerdict, stars, failedCount };
}

/** Achatamento das aulas na ordem da trilha (módulos por order, aulas declaradas). */
export function flattenTrackLessons(track: LoadedTrack): Array<{ moduleSlug: string; lesson: LoadedLesson }> {
  const out: Array<{ moduleSlug: string; lesson: LoadedLesson }> = [];
  const modules = [...track.modules].sort((a, b) => a.meta.order - b.meta.order);
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      out.push({ moduleSlug: mod.meta.slug, lesson });
    }
  }
  return out;
}

/**
 * Estados de destravamento da trilha (PURA — testável sem repo):
 * - done: lessonId ∈ doneSet;
 * - locked: false para a PRIMEIRA aula; para as demais, true quando a aula
 *   anterior ainda não está concluída E o aluno não passou na proficiência;
 * - current: a primeira aula destravada e não concluída (no máx. 1; nenhuma
 *   quando a trilha está 100% concluída).
 */
export interface LessonUnlockState {
  locked: boolean;
  done: boolean;
  current: boolean;
}

export function computeUnlockStates(
  track: LoadedTrack,
  doneSet: ReadonlySet<string>,
  proficient: boolean,
): Map<string, LessonUnlockState> {
  const flat = flattenTrackLessons(track);
  const out = new Map<string, LessonUnlockState>();
  let prevDone = true; // primeira aula destrava
  for (const { lesson } of flat) {
    const done = doneSet.has(lesson.meta.slug);
    const locked = !prevDone && !proficient;
    out.set(lesson.meta.slug, { locked, done, current: false });
    prevDone = done;
  }
  // current = primeira destravada e não concluída
  let foundCurrent = false;
  for (const { lesson } of flat) {
    const st = out.get(lesson.meta.slug)!;
    if (!st.locked && !st.done) {
      if (!foundCurrent) {
        st.current = true;
        foundCurrent = true;
      } else {
        st.current = false;
      }
    }
  }
  return out;
}

/** Estado da trilha inteira: doneSet + proficiência (uma leitura só). */
export async function loadTrackState(
  trackSlug: string,
  repo: TrackProgressLike,
): Promise<{ doneSet: Set<string>; proficient: boolean }> {
  const [progress, prof] = await Promise.all([
    repo.listTrackLessonProgress(trackSlug),
    repo.getTrackProficiency(trackSlug),
  ]);
  return {
    doneSet: new Set(progress.map((p) => p.lessonId)),
    proficient: prof?.verdict === 'passed',
  };
}

export async function buildTrackList(tracks: LoadedTrack[], repo: TrackProgressLike): Promise<TrackListEntry[]> {
  const out: TrackListEntry[] = [];
  for (const track of tracks) {
    const flat = flattenTrackLessons(track);
    const { doneSet, proficient } = await loadTrackState(track.root.slug, repo);
    const doneCount = flat.filter(({ lesson }) => doneSet.has(lesson.meta.slug)).length;
    out.push({
      slug: track.root.slug,
      title: track.root.title,
      description: track.root.description,
      domain: track.root.domain,
      moduleCount: track.modules.length,
      lessonCount: flat.length,
      doneCount,
      proficient,
    });
  }
  return out;
}

export async function buildTrackDetail(track: LoadedTrack, repo: TrackProgressLike): Promise<TrackDetailPayload> {
  const { doneSet, proficient } = await loadTrackState(track.root.slug, repo);
  const states = computeUnlockStates(track, doneSet, proficient);
  const flat = flattenTrackLessons(track);

  const modules: TrackDetailPayload['modules'] = [];
  for (const mod of [...track.modules].sort((a, b) => a.meta.order - b.meta.order)) {
    const lessons: TrackLessonEntry[] = mod.lessons.map((lesson) => {
      const st = states.get(lesson.meta.slug)!;
      return {
        slug: lesson.meta.slug,
        moduleSlug: mod.meta.slug,
        title: lesson.meta.title,
        summary: lesson.meta.summary,
        difficulty: lesson.meta.difficulty,
        locked: st.locked,
        done: st.done,
        current: st.current,
      };
    });
    // ADITIVO (rodada 9): desafio do MÓDULO — disponibilidade + estado do aluno
    // (último veredito/estrelas via getAttemptsForChallenge do slug).
    let challengeLastVerdict: TrackVerdict | null = null;
    let challengeStars = 0;
    if (mod.challenge) {
      const sum = summarizeAttempts(await repo.getAttemptsForChallenge(mod.challenge.slug));
      challengeLastVerdict = sum.lastVerdict;
      challengeStars = sum.stars;
    }
    modules.push({
      slug: mod.meta.slug,
      title: mod.meta.title,
      order: mod.meta.order,
      lessons,
      challengeAvailable: mod.challenge !== null,
      challenge: mod.challenge ? { slug: mod.challenge.slug, title: mod.challenge.title } : null,
      challengeLastVerdict,
      challengeStars,
    });
  }

  return {
    slug: track.root.slug,
    title: track.root.title,
    description: track.root.description,
    domain: track.root.domain,
    modules,
    proficiencyAvailable: track.proficiency !== null,
    proficient,
    doneCount: flat.filter(({ lesson }) => doneSet.has(lesson.meta.slug)).length,
    lessonCount: flat.length,
  };
}

/** Monta o payload de UMA aula (teoria, fontes, pré-requisitos, desafios). */
export async function buildTrackLesson(
  track: LoadedTrack,
  moduleSlug: string,
  lessonSlug: string,
  repo: TrackProgressLike,
): Promise<TrackLessonPayload | null> {
  const lesson = findLesson(track, moduleSlug, lessonSlug);
  if (!lesson) return null;
  const { doneSet, proficient } = await loadTrackState(track.root.slug, repo);
  const states = computeUnlockStates(track, doneSet, proficient);
  const st = states.get(lessonSlug)!;

  const challengeSummaries = await buildChallengeSummaries(
    track.root.slug,
    lesson,
    repo,
    track,
  );

  const prereqEntries = lesson.meta.prerequisites
    .map((slug) => {
      for (const mod of track.modules) {
        const found = mod.lessons.find((l) => l.meta.slug === slug);
        if (found) return { slug, title: found.meta.title };
      }
      return null;
    })
    .filter((x): x is { slug: string; title: string } => x !== null);

  return {
    slug: lesson.meta.slug,
    moduleSlug,
    title: lesson.meta.title,
    summary: lesson.meta.summary,
    difficulty: lesson.meta.difficulty,
    concepts: lesson.meta.concepts,
    prerequisites: prereqEntries,
    theory: lesson.meta.theory.map((s) => ({
      id: s.id,
      title: s.title,
      markdown: s.markdown,
      code: s.code,
    })),
    // ADITIVO (onda 1 schema-quiz): afirmações da aula — ausente → payload sem
    // o campo (aula sem quiz, trilhas antigas inalteradas).
    assertions: lesson.meta.assertions?.map((a) => ({
      id: a.id,
      statement: a.statement,
      question: a.question,
      options: a.options,
      answerIndex: a.answerIndex,
      feedback: a.feedback,
    })),
    sources: lesson.meta.sources.map((s) => ({ title: s.title, url: s.url, description: s.description })),
    challenges: challengeSummaries,
    locked: st.locked,
    done: st.done,
  };
}

/** Resumo dos desafios de UMA aula: os da trilha + os regenerados do aluno.
 *
 * ONDA3 (generate-flow, pedido C do dono): os desafios GERADOS vêm PRIMEIRO
 * (o novo desafio aparece ACIMA do primeiro visível — mais recente primeiro:
 * o repo listGeneratedChallenges já ordena created_at DESC) e DEPOIS os
 * autorais (ordem declarada da trilha). */
export async function buildChallengeSummaries(
  trackSlug: string,
  lesson: LoadedLesson,
  repo: TrackProgressLike,
  _track: LoadedTrack,
): Promise<TrackLessonPayload['challenges']> {
  const out: TrackLessonPayload['challenges'] = [];
  const generated = await repo.listGeneratedChallenges(trackSlug, lesson.meta.slug);
  for (const g of generated) {
    const attempts = await repo.getAttemptsForChallenge(g.challengeId);
    const sum = summarizeAttempts(attempts);
    out.push({
      slug: g.challengeId,
      title: g.challengeId,
      concept: 'gerado',
      difficulty: 2,
      lastVerdict: sum.lastVerdict,
      stars: sum.stars,
      failedCount: sum.failedCount,
      generated: true,
    });
  }
  for (const ch of lesson.challenges) {
    const attempts = await repo.getAttemptsForChallenge(ch.slug);
    const sum = summarizeAttempts(attempts);
    out.push({
      slug: ch.slug,
      title: ch.title,
      concept: ch.concept,
      difficulty: ch.difficulty,
      lastVerdict: sum.lastVerdict,
      stars: sum.stars,
      failedCount: sum.failedCount,
      generated: false,
    });
  }
  return out;
}

/**
 * Resolve a especificação de UM desafio (aula, proficiência ou módulo — ADITIVO
 * rodada 9), incluindo desafios REGENERADOS (source 'generated'). null quando
 * não existe.
 */
export async function resolveChallengeSpec(
  track: LoadedTrack,
  target: 'lesson' | 'proficiency' | 'module',
  lessonId: string | undefined,
  challengeId: string | undefined,
  repo: TrackProgressLike,
  moduleSlug?: string,
): Promise<TrackChallengeSpec | null> {
  let source: TrackChallengeSource | null = null;
  let baseMinFirstStar = DEFAULT_MIN_FIRST_STAR_MS;

  if (target === 'proficiency') {
    if (!track.proficiency || !challengeId || challengeId !== track.proficiency.slug) return null;
    source = track.proficiency;
    baseMinFirstStar = PROFICIENCY_MIN_FIRST_STAR_MS;
  } else if (target === 'module') {
    // ADITIVO (rodada 9): desafio do MÓDULO (fim do módulo) — o slug precisa
    // bater com o declarado no module.json (mesmo padrão da proficiência).
    const mod = track.modules.find((m) => m.meta.slug === moduleSlug);
    if (!mod || !mod.challenge || !challengeId || challengeId !== mod.challenge.slug) return null;
    source = mod.challenge;
  } else {
    if (!lessonId) return null;
    // desafio da trilha?
    for (const mod of track.modules) {
      const lesson = mod.lessons.find((l) => l.meta.slug === lessonId);
      if (!lesson) continue;
      source = findChallenge(lesson, challengeId ?? '');
      if (source) break;
    }
    // desafio regenerado do aluno?
    if (!source && challengeId) {
      const generated = await repo.listGeneratedChallenges(track.root.slug, lessonId);
      const g = generated.find((x) => x.challengeId === challengeId);
      if (g) {
        const attempts = await repo.getAttemptsForChallenge(g.challengeId);
        const sum = summarizeAttempts(attempts);
        return {
          slug: g.challengeId,
          title: g.challengeId,
          concept: 'gerado',
          difficulty: 2,
          statement: g.statement,
          starterCode: g.starterCode,
          expectedTestCount: g.expectedTestCount,
          minFirstStarMs: DEFAULT_MIN_FIRST_STAR_MS,
          timeLimitMs: timeLimitForDifficultyMs(2),
          source: 'generated',
          lastVerdict: sum.lastVerdict,
          stars: sum.stars,
          failedCount: sum.failedCount,
        };
      }
      return null;
    }
  }

  if (!source) return null;
  const attempts = await repo.getAttemptsForChallenge(source.slug);
  const sum = summarizeAttempts(attempts);
  return {
    slug: source.slug,
    title: source.title,
    concept: source.concept,
    difficulty: source.difficulty,
    statement: source.statement,
    // ADITIVO (rodada 9): multi-arquivo — os STARTERS por arquivo vão no spec
    // (nunca as soluções); o starterCode único carrega o do PRIMEIRO arquivo
    // (fallback — a UI usa `files` quando presente).
    files: source.files?.map((f) => ({ path: f.path, starterCode: f.starterCode })),
    starterCode: source.files && source.files.length > 0 ? (source.files[0].starterCode ?? '') : (source.starterCode ?? ''),
    expectedTestCount: source.expectedTestCount,
    minFirstStarMs: source.minFirstStarMs ?? baseMinFirstStar,
    timeLimitMs: timeLimitForDifficultyMs(source.difficulty),
    source: 'track',
    lastVerdict: sum.lastVerdict,
    stars: sum.stars,
    failedCount: sum.failedCount,
  };
}

/** Aula pelo slug em QUALQUER módulo (para o tutor abrir pré-requisito). */
export function findLessonInTrack(track: LoadedTrack, lessonSlug: string): { moduleSlug: string; lesson: LoadedLesson } | null {
  for (const mod of track.modules) {
    const lesson = mod.lessons.find((l) => l.meta.slug === lessonSlug);
    if (lesson) return { moduleSlug: mod.meta.slug, lesson };
  }
  return null;
}
