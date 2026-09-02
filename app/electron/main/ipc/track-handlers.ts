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
  TrackOrphanEntry,
  TrackOrphansResult,
  TrackPurgeOrphansRequest,
  TrackPurgeOrphansResult,
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
  listTrackSlugs,
  loadAllTracks,
  loadTrack,
} from '../content/trackLoader';
import {
  computeOrphanState,
  type OrphanTrackState,
  type TrackScopedState,
} from '../db/reconcile';
import { findLessonAnywhere } from '../content/trackLoader';
import { defaultAdapter } from '../engine/lang/registry';
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
  REGEN_ERROR_CODES,
  SEMANTIC_GATE_MESSAGES,
  regenerateChallenge,
  type FailedChallengeInfo,
} from '../services/challengeRegenerator';
import { buildChallengeContext, type ChallengeContext } from '../services/challengeContextValidator';
import type { LlmClient } from '../services/llmClient';

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
  /**
   * ADITIVO (onda9-cache-reconcilia). OPCIONAIS de propósito: os fakes de
   * teste e os stubs E2E que já implementam TrackRepoLike continuam válidos
   * sem estes dois — a ausência degrada para "não sei reconciliar" (erro
   * estruturado), nunca para "nada órfão" (que seria uma mentira tranquila).
   */
  listTrackScopedState?(): Promise<TrackScopedState[]>;
  purgeTrackScopedState?(slug: string): Promise<TrackScopedState | null>;
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
  /** OPCIONAL: cliente de LLM remoto para o tutor/regeneração. Ausente → erros estruturados. */
  llm?: LlmClient;
  /** OPCIONAL (onda3-generate-flow): emite eventos push ao renderer
   *  (track:challenge-regenerate-progress). Ausente → no-op (testes/fixtures). */
  emit?: (channel: string, ev: unknown) => void;
}

export function buildTrackHandlers(deps: TrackHandlerDeps): Map<string, IpcHandlerFn> {
  const map = new Map<string, IpcHandlerFn>();

  const tracksDir = (): string => deps.getTracksDir();
  const repo = deps.repo;
  // ONDA3 (generate-flow): emissor de eventos push (no-op sem deps.emit —
  // fixtures/testes). O index.ts injeta o emit da janela (emitWindow).
  const emit = deps.emit ?? (() => {});

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

  // Ponte tutor/regenerador → cliente de chat. NÃO passa esforço de raciocínio:
  // o default do cliente já é o MÁXIMO do contrato congelado
  // (`reasoning: { enabled: true, effort: 'max' }` — shared/llm/constants.ts),
  // e a profundidade é parâmetro do protocolo, nunca texto de prompt (docs/16 §7).
  const chatFn: ChatFn = async (req) => {
    if (!deps.llm) throw new Error('cliente de LLM indisponível');
    const res = await deps.llm.chatCompletion({
      messages: req.messages as Parameters<LlmClient['chatCompletion']>[0]['messages'],
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

  // ─── track:orphans / track:purge-orphans (onda9-cache-reconcilia) ─────────
  //
  // A RECONCILIAÇÃO. `listTrackSlugs` é a verdade do disco (dirs com
  // track.json); `repo.listTrackScopedState()` é a verdade do banco;
  // `computeOrphanState` (puro) cruza as duas. Resquício NÃO é apagado aqui —
  // este canal só CONTA o que sobrou, e é o que a Home usa para não exibir
  // fantasma e o painel das Configurações para mostrar o que será removido
  // ANTES de remover.
  //
  // Diretório inexistente/ilegível: `listTrackSlugs` levanta ENOENT. Nesse
  // caso NÃO devolvemos "zero instaladas" (o que declararia TODO o progresso
  // do aluno órfão por um erro de I/O) — devolvemos erro estruturado.
  // FAIL-CLOSED: sem certeza sobre o disco, nada é declarado órfão.
  const dtoFromOrphan = (o: OrphanTrackState): TrackOrphanEntry => ({
    slug: o.slug,
    subjectName: o.subjectName,
    domain: o.domain,
    attemptCount: o.attemptCount,
    lessonsDoneCount: o.lessonsDoneCount,
    hasProficiency: o.hasProficiency,
    generatedChallengeCount: o.generatedChallengeCount,
    rowCount: o.rowCount,
  });

  async function reconcile(): Promise<
    { installed: string[]; orphans: OrphanTrackState[] } | { error: string }
  > {
    if (!repo) return { error: 'persistência indisponível.' };
    if (!repo.listTrackScopedState) {
      return { error: 'reconciliação indisponível nesta build (repo sem listTrackScopedState).' };
    }
    let installed: string[];
    try {
      installed = await listTrackSlugs(tracksDir());
    } catch (err) {
      return { error: `não foi possível ler as trilhas instaladas: ${String(err)}` };
    }
    try {
      const rows = await repo.listTrackScopedState();
      return { installed, orphans: computeOrphanState(installed, rows) };
    } catch (err) {
      return { error: `falha ao ler o estado persistido: ${String(err)}` };
    }
  }

  map.set(TRACK_CHANNELS.ORPHANS, async (): Promise<TrackOrphansResult> => {
    const res = await reconcile();
    if ('error' in res) return { ok: false, error: res.error };
    return { ok: true, orphans: res.orphans.map(dtoFromOrphan), installedSlugs: res.installed };
  });

  map.set(TRACK_CHANNELS.PURGE_ORPHANS, async (_event, payload: unknown): Promise<TrackPurgeOrphansResult> => {
    const p = (payload ?? {}) as TrackPurgeOrphansRequest;
    const res = await reconcile();
    if ('error' in res) return { ok: false, error: res.error };
    if (!repo?.purgeTrackScopedState) {
      return { ok: false, error: 'remoção indisponível nesta build (repo sem purgeTrackScopedState).' };
    }
    // Sem `slugs` → todos os órfãos. Com `slugs` → SOMENTE os que a
    // reconciliação acabou de provar órfãos; o resto vai para `skipped`.
    // É esta interseção que garante o requisito "nunca tocar em progresso de
    // trilha que EXISTE" mesmo com um payload IPC mentiroso.
    const requested = Array.isArray(p.slugs)
      ? p.slugs.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim())
      : null;
    const orphanBySlug = new Map(res.orphans.map((o) => [o.slug, o]));
    const targets = requested === null ? res.orphans : requested.map((s) => orphanBySlug.get(s)).filter((o): o is OrphanTrackState => o !== undefined);
    const skipped = requested === null ? [] : requested.filter((s) => !orphanBySlug.has(s));

    const removed: TrackOrphanEntry[] = [];
    for (const target of targets) {
      try {
        const gone = await repo.purgeTrackScopedState(target.slug);
        // null = já não havia nada (idempotente) — não conta como removido.
        if (gone) removed.push(dtoFromOrphan(target));
      } catch (err) {
        return { ok: false, error: `falha ao remover '${target.slug}': ${String(err)}` };
      }
    }
    return { ok: true, removed, skipped };
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
      // ONDA 4 (next-glow): `nextLesson` (próxima aula destravada e não feita)
      // é montado DENTRO do buildTrackLesson e propaga no payload inteiro —
      // nada a copiar aqui (o `lesson` volta completo no TrackLessonResult).
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
      // ONDA2-FIX: valida os ITENS — files:[null] passa em Array.isArray mas
      // quebra buildErrorContextSection (f.path de null) fora do try/catch.
      r.files.every((f) => typeof f?.path === 'string' && typeof f?.code === 'string') &&
      typeof r.output === 'string' &&
      Array.isArray(r.checks) &&
      r.checks.every((c) => typeof c?.name === 'string' && typeof c?.passed === 'boolean') &&
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
        // ONDA 5: o regex de caminho seguro é o `filePathPattern` do ADAPTADOR
        // (§6 obs. 1 de docs/research/08) — travá-lo em `.mjs` aqui impediria
        // qualquer outra linguagem de existir. A mensagem mostra o padrão REAL
        // em vigor, em vez de repetir um literal que pode divergir dele.
        (f) => typeof f?.path !== 'string' || !defaultAdapter().filePathPattern.test(f.path),
      )
    ) {
      return submitError(
        'SUBMIT_BAD_REQUEST',
        `path de arquivo inválido (esperado ${defaultAdapter().filePathPattern.source}).`,
      );
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
  // ONDA3 (generate-flow): o handler emite o progresso REAL do processo no
  // canal track:challenge-regenerate-progress, "por volta" da chamada ao
  // regenerador (que fica PURO — não é instrumentado). REVISÃO ALTO-1: o
  // terminal 'error' é emitido em TODOS os caminhos de falha — retornos
  // antecipados (bad request / sem repo / sem cliente de LLM / trilha inválida /
  // aula não encontrada) e QUALQUER exceção inesperada (try/catch do corpo:
  // challengeExec faz mkdtemp/spawn e pode lançar) — o modal global nunca
  // fica preso em 'running'. REVISÃO ALTO-2: o generationId do request é
  // ecoado em TODOS os eventos — o renderer descarta eventos de processos
  // anteriores (o withTimeout de 150s não aborta o main).
  const emitProgress = (
    generationId: number | undefined,
    stage: 'generating' | 'validating' | 'executing' | 'inserting' | 'done' | 'error',
    extra?: { label?: string; challenge?: { slug: string; title: string }; error?: string },
  ): void => {
    emit(TRACK_CHANNELS.CHALLENGE_REGENERATE_PROGRESS, {
      stage,
      ...extra,
      ...(generationId !== undefined ? { generationId } : {}),
    });
  };
  map.set(TRACK_CHANNELS.CHALLENGE_REGENERATE, async (_event, payload: unknown): Promise<TrackRegenerateResult> => {
    const p = (payload ?? {}) as TrackRegenerateRequest;
    // Eco do id de geração (ALTO-2): os eventos carregam o id para o renderer
    // correlacionar; ausente (request legado/teste) → sem eco.
    const generationId = typeof p.generationId === 'number' ? p.generationId : undefined;
    const progress = (
      stage: 'generating' | 'validating' | 'executing' | 'inserting' | 'done' | 'error',
      extra?: { label?: string; challenge?: { slug: string; title: string }; error?: string },
    ): void => emitProgress(generationId, stage, extra);
    // ALTO-1: QUALQUER exceção vira terminal 'error' (o modal nunca fica em
    // 'running' — ex.: verifyChallengePair pode lançar em mkdtemp/spawn).
    try {
      if (!p.trackSlug || !p.lessonId) {
        progress('error', { error: 'requer trackSlug + lessonId.' });
        return { ok: false, error: { code: 'REGEN_BAD_REQUEST', message: 'requer trackSlug + lessonId.' } };
      }
      if (!repo) {
        progress('error', { error: 'persistência indisponível.' });
        return { ok: false, error: { code: 'NO_REPO', message: 'persistência indisponível.' } };
      }
      if (!deps.llm) {
        progress('error', { error: 'serviço de IA indisponível.' });
        return { ok: false, error: { code: 'REGEN_UNAVAILABLE', message: 'serviço de IA indisponível.' } };
      }
      const loaded = await loadTrackOrError(p.trackSlug);
      if ('error' in loaded) {
        progress('error', { error: loaded.error });
        return { ok: false, error: { code: 'TRACK_INVALID', message: loaded.error } };
      }
      const found = findLessonAnywhere(loaded, p.lessonId);
      if (!found) {
        progress('error', { error: 'aula não encontrada na trilha.' });
        return { ok: false, error: { code: 'LESSON_NOT_FOUND', message: 'aula não encontrada na trilha.' } };
      }

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

    // Contexto pedagógico (critérios da trilha + aulas anteriores + a aula
    // atual) para a validação SEMÂNTICA do desafio regenerado — o desafio só
    // pode cobrar o que foi ensinado.
    //
    // FAIL-CLOSED (docs/16-engine-de-trilha.md §9.3). Aqui morava o TERCEIRO
    // furo do gate: a montagem falhando virava `console.warn` + `context =
    // undefined`, e o regenerador entregava o desafio validado só por
    // execução — bastava a montagem do contexto quebrar para um desafio
    // chegar ao aluno sem NENHUM veredito semântico. Agora a falha é erro
    // estruturado, ANTES de qualquer chamada de LLM.
    //
    // Na prática o ramo é inalcançável e é bom que continue assim: os slugs
    // vêm de `findLessonAnywhere`, que devolve `{ moduleSlug: mod.meta.slug,
    // lesson }` de um módulo que CONTÉM a aula, e `buildChallengeContext` só
    // lança quando `findLesson(track, moduleSlug, lessonSlug)` não acha esse
    // par (trackLoader.ts:274-288). O `catch` fica como rede de segurança de
    // um LoadedTrack corrompido — e a rede agora prende, em vez de deixar
    // passar.
    let context: ChallengeContext;
    try {
      context = buildChallengeContext(loaded, found.moduleSlug, found.lesson.meta.slug);
    } catch (e) {
      const message = SEMANTIC_GATE_MESSAGES.noContext((e as Error).message);
      console.warn('[track:challenge-regenerate] buildChallengeContext falhou:', (e as Error).message);
      progress('error', { error: message });
      return { ok: false, error: { code: REGEN_ERROR_CODES.SEMANTIC_NOT_RUN, message } };
    }

    // ONDA3 (generate-flow): 'generating' ANTES da 1ª chamada LLM — o draft
    // (pensar o desafio + escrever os testes) é o polo longo da geração e
    // pulsa na etapa 1 do modal enquanto a LLM trabalha.
    progress('generating');
    const outcome = await regenerateChallenge({
      trackTitle: loaded.root.title,
      lesson: found.lesson.meta,
      failed,
      context,
      // FAIL-CLOSED (§9.3): este é o caminho do ALUNO — sem veredito semântico
      // não há entrega. Redundante com o `context` garantido acima, e é essa a
      // intenção: a exigência viaja no CONTRATO da chamada, então nem um
      // refactor futuro que reintroduza um contexto opcional aqui reabre o
      // gate em silêncio.
      requireSemanticGate: true,
      llm: chatFn,
    });
    if (!outcome.ok || !outcome.challenge) {
      progress('error', {
        error: outcome.error?.message ?? 'não foi possível gerar um novo desafio.',
      });
      return { ok: false, error: outcome.error };
    }
    const draft = outcome.challenge;
    // A validação SEMÂNTICA e a verificação de EXECUÇÃO rodaram DENTRO do
    // challengeRegenerator — reportadas aqui, em sequência (a ordem de
    // exibição do modal; o momento exato não é observável de fora sem
    // instrumentar o regenerador, o que é proibido: ele fica PURO).
    //
    // O marco não é mais condicional: chegar aqui com `outcome.ok` significa
    // que o gate semântico CONCLUIU aprovando (§9.3) — o rótulo "conferindo a
    // coerência" do modal agora descreve algo que sempre aconteceu.
    progress('validating');
    progress('executing');
    // 'inserting' ANTES do insert no banco.
    progress('inserting');
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
      progress('error', {
        error: `desafio gerado mas não persistiu: ${String(err)}`,
      });
      return { ok: false, error: { code: 'REGEN_PERSIST_FAILED', message: `desafio gerado mas não persistiu: ${String(err)}` } };
    }
    // TERMINAL 'done': persistiu — o modal global mostra o desafio novo com
    // "Ver desafio" (navegação de conclusão via store, não via view).
    progress('done', { challenge: { slug: draft.slug, title: draft.title } });
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
    } catch (err) {
      // ALTO-1: exceção inesperada (ex.: challengeExec lançando em mkdtemp/spawn)
      // → terminal 'error' + erro estruturado (o invoke rejeitado não é o único
      // caminho — o modal lê o EVENTO; a view montada lê o resultado).
      progress('error', { error: `falha inesperada na regeneração: ${String(err)}` });
      return {
        ok: false,
        error: { code: 'REGEN_INTERNAL', message: `falha inesperada na regeneração: ${String(err)}` },
      };
    }
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
