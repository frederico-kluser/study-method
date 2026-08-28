/**
 * electron/main/ipc/track-handlers.ts — handlers IPC das TRILHAS (rodada 8).
 *
 * O aluno NÃO gera mais aula: o conteúdo vive em resources/tracks (criado pelo
 * CLI tools/track-cli.ts) e estes handlers entregam trilha → módulos → aulas →
 * desafios + o chat do tutor + a execução/regeneração de desafios. O progresso
 * do aluno (aulas concluídas, proficiência, tentativas, desafios regenerados)
 * vive no SQLite (repo).
 *
 * `buildTrackHandlers(deps)` é PURA (Map<canal, handler>); `registerTrackHandlers`
 * liga ao ipcMain via safeHandle — ADITIVO ao contrato congelado (grupo novo
 * TRACK_CHANNELS = window.api.track.* no preload).
 */

import * as path from 'node:path';

import type {
  TrackChallengeErrorReport,
  TrackChallengeGetRequest,
  TrackChallengeResult,
  TrackDetailResult,
  TrackLessonDoneResult,
  TrackLessonResult,
  TrackListResult,
  TrackRegenerateRequest,
  TrackRegenerateResult,
  TrackSubmitRequest,
  TrackSubmitResult,
  TutorChatRequest,
  TutorReply,
} from '@shared/ipc-contract';
import { TRACK_CHANNELS } from '@shared/ipc-contract';

import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from './safeHandle';
import {
  LoadedTrack,
  TrackLoadError,
  loadAllTracks,
  loadTrack,
} from '../content/trackLoader';
import { findLessonAnywhere } from '../content/trackLoader';
import { SAFE_FILE_PATH_RE } from '../content/trackTypes';
import {
  TrackProgressLike,
  buildTrackDetail,
  buildTrackLesson,
  buildTrackList,
  resolveChallengeSpec,
} from '../services/trackService';
import { runStudentCode } from '../services/challengeExec';
import { tutorChat, type ChatFn } from '../services/tutorChat';
import {
  regenerateChallenge,
  type FailedChallengeInfo,
} from '../services/challengeRegenerator';
import type { DeepSeekClient } from '../services/deepseekClient';

/** Subconjunto do repo exigido pelos handlers de trilha. */
export interface TrackRepoLike extends TrackProgressLike {
  markTrackLessonDone(trackSlug: string, lessonId: string): Promise<void>;
  setTrackProficiency(trackSlug: string, verdict: 'passed' | 'failed', stars: number): Promise<void>;
  insertGeneratedChallenge(input: {
    id: string;
    trackSlug: string;
    lessonId: string;
    challengeId: string;
    statement: string;
    starterCode: string;
    testsCode: string;
    solutionCode: string;
    expectedTestCount: number;
  }): Promise<void>;
  listFailedChallengeSlugs(trackSlug: string, lessonId: string): Promise<string[]>;
  getAttemptsForChallenge(challengeId: string): Promise<{
    id: string;
    subjectId: string;
    lessonId: string;
    challengeId: string;
    verdict: 'passed' | 'failed' | 'timeout' | 'abandoned';
    stars: number;
    durationMs: number;
    createdAt: string;
  }[]>;
}

export interface TrackHandlerDeps {
  /**
   * Diretório das trilhas (resources/tracks). ONDA 2A: a resolução robusta
   * (cadeia de candidatos dev/entry/packaged) vive em services/resourcesDir.ts —
   * o index.ts injeta `resolveTracksDir({...})` daqui de fora.
   */
  getTracksDir: () => string;
  /** OPCIONAL: repo de progresso. Ausente → handlers respondem gracioso. */
  repo?: TrackRepoLike;
  /** OPCIONAL: cliente DeepSeek para o tutor/regeneração. Ausente → erros estruturados. */
  deepseek?: DeepSeekClient;
}

export function buildTrackHandlers(deps: TrackHandlerDeps): Map<string, IpcHandlerFn> {
  const map = new Map<string, IpcHandlerFn>();

  const tracksDir = (): string => deps.getTracksDir();
  const repo = deps.repo;

  async function loadTrackOrError(trackSlug: string): Promise<LoadedTrack | { error: string }> {
    try {
      return await loadTrack(path.join(tracksDir(), trackSlug));
    } catch (err) {
      if (err instanceof TrackLoadError) {
        return { error: `trilha inválida: ${err.issues.map((i) => i.message).join('; ')}` };
      }
      return { error: `trilha não encontrada ou ilegível: ${String(err)}` };
    }
  }

  const chatFn: ChatFn = async (req) => {
    if (!deps.deepseek) throw new Error('deepseek indisponível');
    const res = await deps.deepseek.chatCompletion({
      messages: req.messages as Parameters<DeepSeekClient['chatCompletion']>[0]['messages'],
      temperature: req.temperature,
      timeoutMs: req.timeoutMs,
    });
    return { content: res.content };
  };

  // ─── track:list ────────────────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.LIST, async (): Promise<TrackListResult> => {
    if (!repo) return { ok: false, error: 'persistência indisponível.' };
    try {
      const { tracks } = await loadAllTracks(tracksDir());
      const entries = await buildTrackList(tracks, repo);
      return { ok: true, tracks: entries };
    } catch (err) {
      return { ok: false, error: `falha ao listar trilhas: ${String(err)}` };
    }
  });

  // ─── track:get ─────────────────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.GET, async (_event, payload: unknown): Promise<TrackDetailResult> => {
    const p = (payload ?? {}) as { trackSlug?: string };
    const slug = p.trackSlug ?? '';
    if (!slug) return { ok: false, error: 'track:get requer trackSlug.' };
    if (!repo) return { ok: false, error: 'persistência indisponível.' };
    const loaded = await loadTrackOrError(slug);
    if ('error' in loaded) return { ok: false, error: loaded.error };
    try {
      return { ok: true, track: await buildTrackDetail(loaded, repo) };
    } catch (err) {
      return { ok: false, error: `falha ao montar trilha: ${String(err)}` };
    }
  });

  // ─── track:lesson ──────────────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.LESSON, async (_event, payload: unknown): Promise<TrackLessonResult> => {
    const p = (payload ?? {}) as { trackSlug?: string; lessonId?: string };
    if (!p.trackSlug || !p.lessonId) return { ok: false, error: 'track:lesson requer trackSlug + lessonId.' };
    if (!repo) return { ok: false, error: 'persistência indisponível.' };
    const loaded = await loadTrackOrError(p.trackSlug);
    if ('error' in loaded) return { ok: false, error: loaded.error };
    const found = findLessonAnywhere(loaded, p.lessonId);
    if (!found) return { ok: true, lesson: null };
    try {
      const lesson = await buildTrackLesson(loaded, found.moduleSlug, p.lessonId, repo);
      return { ok: true, lesson };
    } catch (err) {
      return { ok: false, error: `falha ao montar aula: ${String(err)}` };
    }
  });

  // ─── track:lesson-done ─────────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.LESSON_DONE, async (_event, payload: unknown): Promise<TrackLessonDoneResult> => {
    const p = (payload ?? {}) as { trackSlug?: string; lessonId?: string };
    if (!p.trackSlug || !p.lessonId) return { ok: false, error: 'track:lesson-done requer trackSlug + lessonId.' };
    if (!repo) return { ok: false, error: 'persistência indisponível.' };
    try {
      await repo.markTrackLessonDone(p.trackSlug, p.lessonId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ─── track:tutor-chat ──────────────────────────────────────────────────────
  const tutorError = (code: string, message: string): TutorReply => ({
    ok: false,
    message: '',
    sectionId: null,
    done: false,
    error: { code, message },
  });
  // ONDA1 (error-contract): validação MÍNIMA do relatório de erro vindo do
  // renderer (payload IPC não é confiável). Shape inválido → undefined → o
  // fluxo normal do tutor segue intacto (sem regressão). NUNCA valida
  // conteúdo (código/saída) — é o que o aluno enviou, o tutor precisa ver.
  const isValidChallengeError = (v: unknown): v is TrackChallengeErrorReport => {
    if (!v || typeof v !== 'object') return false;
    const r = v as TrackChallengeErrorReport;
    return (
      typeof r.trackSlug === 'string' &&
      typeof r.lessonId === 'string' &&
      typeof r.challengeId === 'string' &&
      typeof r.challengeTitle === 'string' &&
      Array.isArray(r.files) &&
      typeof r.output === 'string' &&
      Array.isArray(r.checks) &&
      typeof r.passedCount === 'number' &&
      typeof r.totalCount === 'number'
    );
  };
  map.set(TRACK_CHANNELS.TUTOR_CHAT, async (_event, payload: unknown): Promise<TutorReply> => {
    const p = (payload ?? {}) as TutorChatRequest;
    if (!p.trackSlug || !p.lessonId) {
      return tutorError('TUTOR_BAD_REQUEST', 'tutor-chat requer trackSlug + lessonId.');
    }
    const loaded = await loadTrackOrError(p.trackSlug);
    if ('error' in loaded) return tutorError('TRACK_INVALID', loaded.error);
    const found = findLessonAnywhere(loaded, p.lessonId);
    if (!found) return tutorError('LESSON_NOT_FOUND', 'aula não encontrada na trilha.');

    const prereqTitles = found.lesson.meta.prerequisites
      .map((slug) => findLessonAnywhere(loaded, slug)?.lesson.meta.title)
      .filter((t): t is string => !!t);

    const result = await tutorChat(
      {
        trackTitle: loaded.root.title,
        lesson: found.lesson.meta,
        prereqTitles,
        presentedSections: Array.isArray(p.presentedSections) ? p.presentedSections : [],
        history: Array.isArray(p.history) ? p.history : [],
        action: p.action === 'answer' ? 'answer' : 'next',
        // ONDA1 (error-contract): propaga o relatório do desafio que falhou
        // para o tutor (discussão do erro nos turnos 'answer'); payload
        // ausente/inválido vira undefined e nada muda.
        challengeError: isValidChallengeError(p.challengeError) ? p.challengeError : undefined,
      },
      chatFn,
    );
    return {
      ok: result.ok,
      message: result.message,
      sectionId: result.sectionId,
      sectionTitle: result.sectionTitle,
      done: result.done,
      error: result.error,
    };
  });

  // ─── track:challenge / track:proficiency (GET) ─────────────────────────────
  const challengeGetter = async (p: TrackChallengeGetRequest): Promise<TrackChallengeResult> => {
    if (!p.trackSlug) return { ok: false, error: 'requer trackSlug.' };
    if (!repo) return { ok: false, error: 'persistência indisponível.' };
    const loaded = await loadTrackOrError(p.trackSlug);
    if ('error' in loaded) return { ok: false, error: loaded.error };
    try {
      // ADITIVO (rodada 9): p.moduleSlug resolve o desafio do MÓDULO (target 'module').
      const spec = await resolveChallengeSpec(loaded, p.target, p.lessonId, p.challengeId, repo, p.moduleSlug);
      return { ok: true, challenge: spec };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  };
  map.set(TRACK_CHANNELS.CHALLENGE_GET, (_event, payload: unknown) =>
    challengeGetter((payload ?? {}) as TrackChallengeGetRequest),
  );
  map.set(TRACK_CHANNELS.PROFICIENCY_GET, (_event, payload: unknown) =>
    challengeGetter({ ...((payload ?? {}) as object), target: 'proficiency' } as TrackChallengeGetRequest),
  );

  // ─── track:challenge-submit / track:proficiency-submit ─────────────────────
  // Os TESTES nunca trafegam para o renderer (o aluno não os vê): o handler
  // resolve o testsCode INTERNAMENTE (arquivo da trilha ou banco, quando o
  // desafio é regenerado) e roda o código do aluno contra eles.
  async function resolveTestsCode(
    loaded: LoadedTrack,
    p: TrackSubmitRequest,
    isProficiency: boolean,
  ): Promise<{ testsCode: string; expectedTestCount: number } | null> {
    if (isProficiency) {
      const prof = loaded.proficiency;
      if (!prof || (p.challengeId && p.challengeId !== prof.slug)) return null;
      return { testsCode: prof.testsCode, expectedTestCount: prof.expectedTestCount };
    }
    // ADITIVO (rodada 9): desafio do MÓDULO (target 'module').
    if (p.target === 'module') {
      const mod = loaded.modules.find((m) => m.meta.slug === p.moduleSlug);
      if (!mod?.challenge || (p.challengeId && p.challengeId !== mod.challenge.slug)) return null;
      return { testsCode: mod.challenge.testsCode, expectedTestCount: mod.challenge.expectedTestCount };
    }
    const found = findLessonAnywhere(loaded, p.lessonId ?? '');
    if (!found) return null;
    const ch = found.lesson.challenges.find((c) => c.slug === p.challengeId);
    if (ch) return { testsCode: ch.testsCode, expectedTestCount: ch.expectedTestCount };
    if (repo && p.challengeId) {
      const gen = await repo.listGeneratedChallenges(loaded.root.slug, p.lessonId!);
      const g = gen.find((x) => x.challengeId === p.challengeId);
      if (g) return { testsCode: g.testsCode, expectedTestCount: g.expectedTestCount };
    }
    return null;
  }

  const submitError = (code: string, message: string): TrackSubmitResult => ({
    ok: false,
    error: { code, message },
    passed: false,
    testsRun: 0,
    expectedTests: 0,
    output: '',
    checks: [],
    passedCount: 0,
    totalCount: 0,
  });
  const submitter = async (p: TrackSubmitRequest, isProficiency: boolean): Promise<TrackSubmitResult> => {
    // ADITIVO (rodada 9): multi-arquivo — o aluno envia `files` (todos os
    // arquivos editados); o `code` único é exigido só no fluxo de arquivo único.
    const hasFiles = Array.isArray(p.files) && p.files.length > 0;
    if (!p.trackSlug || (typeof p.code !== 'string' && !hasFiles)) {
      return submitError('SUBMIT_BAD_REQUEST', 'requer trackSlug + code (ou files).');
    }
    // FIX (revisão adversarial): valida cada path de arquivo ANTES de qualquer
    // escrita — path malicioso ('a/../../escape.mjs') faria o runner escrever
    // FORA do workdir de execução (path.join resolve o '..' no writeFile).
    if (
      hasFiles &&
      (p.files as { path: string; code: string }[]).some(
        (f) => typeof f?.path !== 'string' || !SAFE_FILE_PATH_RE.test(f.path),
      )
    ) {
      return submitError('SUBMIT_BAD_REQUEST', 'path de arquivo inválido (esperado ^[a-zA-Z0-9_\\-/]+\\.mjs$).');
    }
    if (!repo) return submitError('NO_REPO', 'persistência indisponível.');
    const loaded = await loadTrackOrError(p.trackSlug);
    if ('error' in loaded) return submitError('TRACK_INVALID', loaded.error);

    const testSpec = await resolveTestsCode(loaded, p, isProficiency);
    if (!testSpec) return submitError('CHALLENGE_NOT_FOUND', 'desafio não encontrado.');

    const res = await runStudentCode({
      studentCode: typeof p.code === 'string' ? p.code : '',
      files: hasFiles ? p.files : undefined,
      testsCode: testSpec.testsCode,
      expectedTestCount: testSpec.expectedTestCount,
    });
    return {
      ok: true,
      passed: res.passed,
      testsRun: res.testsRun,
      expectedTests: testSpec.expectedTestCount,
      output: res.output,
      // ONDA 1 (checks por teste): repassa os checks individuais do relatório
      // spec — o veredito não é mais tudo-ou-nada, a UI mostra progresso parcial.
      checks: res.checks,
      passedCount: res.passedCount,
      totalCount: res.totalCount,
    };
  };
  map.set(TRACK_CHANNELS.CHALLENGE_SUBMIT, (_event, payload: unknown) =>
    submitter((payload ?? {}) as TrackSubmitRequest, false),
  );
  map.set(TRACK_CHANNELS.PROFICIENCY_SUBMIT, async (_event, payload: unknown): Promise<TrackSubmitResult> => {
    const p = (payload ?? {}) as TrackSubmitRequest & { stars?: number };
    const base = await submitter(p, true);
    // proficiência passada → destrava a trilha inteira (progressão).
    if (base.ok && base.passed && repo) {
      try {
        await repo.setTrackProficiency(p.trackSlug, 'passed', typeof p.stars === 'number' ? p.stars : 0);
      } catch {
        // registro de proficiência falhou → sem destravamento (degradação honesta)
      }
    }
    return base;
  });

  // ─── track:challenge-regenerate (nunca-repetir) ────────────────────────────
  map.set(TRACK_CHANNELS.CHALLENGE_REGENERATE, async (_event, payload: unknown): Promise<TrackRegenerateResult> => {
    const p = (payload ?? {}) as TrackRegenerateRequest;
    if (!p.trackSlug || !p.lessonId) {
      return { ok: false, error: { code: 'REGEN_BAD_REQUEST', message: 'requer trackSlug + lessonId.' } };
    }
    if (!repo) return { ok: false, error: { code: 'NO_REPO', message: 'persistência indisponível.' } };
    if (!deps.deepseek) return { ok: false, error: { code: 'REGEN_UNAVAILABLE', message: 'serviço de IA indisponível.' } };
    const loaded = await loadTrackOrError(p.trackSlug);
    if ('error' in loaded) return { ok: false, error: { code: 'TRACK_INVALID', message: loaded.error } };
    const found = findLessonAnywhere(loaded, p.lessonId);
    if (!found) return { ok: false, error: { code: 'LESSON_NOT_FOUND', message: 'aula não encontrada na trilha.' } };

    // Contexto do nunca-repetir: TODOS os desafios que o aluno errou nesta aula.
    let failed: FailedChallengeInfo[] = [];
    try {
      const failedSlugs = await repo.listFailedChallengeSlugs(p.trackSlug, p.lessonId);
      failed = failedSlugs
        .map((slug) => {
          const ch = findLessonAnywhere(loaded, p.lessonId)!.lesson.challenges.find((c) => c.slug === slug);
          return ch ? { slug, title: ch.title, statement: ch.statement } : null;
        })
        .filter((x): x is FailedChallengeInfo => x !== null);
    } catch {
      failed = [];
    }

    const outcome = await regenerateChallenge({
      trackTitle: loaded.root.title,
      lesson: found.lesson.meta,
      failed,
      llm: chatFn,
    });
    if (!outcome.ok || !outcome.challenge) {
      return { ok: false, error: outcome.error };
    }
    const draft = outcome.challenge;
    try {
      await repo.insertGeneratedChallenge({
        id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        trackSlug: p.trackSlug,
        lessonId: p.lessonId,
        challengeId: draft.slug,
        statement: draft.statement,
        starterCode: draft.starterCode,
        testsCode: draft.testsCode,
        solutionCode: draft.solutionCode,
        expectedTestCount: draft.expectedTestCount,
      });
    } catch (err) {
      return { ok: false, error: { code: 'REGEN_PERSIST_FAILED', message: `desafio gerado mas não persistiu: ${String(err)}` } };
    }
    return {
      ok: true,
      challenge: {
        slug: draft.slug,
        title: draft.title,
        concept: draft.concept,
        difficulty: draft.difficulty,
        statement: draft.statement,
        starterCode: draft.starterCode,
        expectedTestCount: draft.expectedTestCount,
        minFirstStarMs: 60_000,
        timeLimitMs: 90_000 + draft.difficulty * 60_000,
        source: 'generated',
        lastVerdict: null,
        stars: 0,
        failedCount: 0,
      },
      failedContext: failed.map((f) => ({ slug: f.slug, title: f.title })),
    };
  });

  return map;
}

/** Registra os handlers reais (safeHandle — remove placeholder se houver). */
export async function registerTrackHandlers(deps: TrackHandlerDeps, ipc?: IpcMainHandleLike): Promise<void> {
  const map = buildTrackHandlers(deps);
  if (ipc) {
    safeHandleMap(ipc, map);
    return;
  }
  const { ipcMain } = await import('electron');
  safeHandleMap(ipcMain as unknown as IpcMainHandleLike, map);
}
