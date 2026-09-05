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
 *
 * ─── ONDA 2 (python-roda) — DUAS MUDANÇAS, E POR QUÊ ────────────────────────
 *
 * 1. A LINGUAGEM DO DESAFIO CHEGA AO RUNNER. `submitter` chamava
 *    `runStudentCode({...})` sem exec e sem adaptador, e validava o path dos
 *    arquivos com o `filePathPattern` do adaptador DEFAULT. Resultado medido
 *    pelo caminho de produção (este Map, canal `track:challenge-submit`): o
 *    aluno da trilha `python` digitava `print("oi")` — a solução de referência
 *    da aula 1 — e recebia `passed:false`, `checks:[]` e `SyntaxError:
 *    Unexpected token 'import'`. Como o gate da aula exige desafio passado, e
 *    o destravamento exige a aula anterior concluída, NENHUMA das 20 aulas
 *    podia ser terminada. Agora `resolveTestsCode` devolve também a linguagem,
 *    e ela decide adaptador, binário, layout e regex de path.
 *
 * 2. OS QUATRO CANAIS DO QUIZ ADAPTATIVO foram registrados aqui
 *    (`track:quiz-attempt`, `-explain`, `-remedial`, `-history`). Attempt e
 *    history são PURAMENTE repo (sem LLM); explain e remedial delegam ao
 *    serviço `services/quizRemediation.ts` e persistem o resultado. Todos
 *    FAIL-CLOSED no mesmo idioma dos outros canais: sem repo, sem serviço ou
 *    sem trilha/aula, `{ ok:false, code }` — nunca conteúdo inventado.
 */

import * as path from 'node:path';

import type {
  QuizAttemptDto,
  QuizAttemptReply,
  QuizAttemptRequest,
  QuizExplainReply,
  QuizExplainRequest,
  QuizHistoryReply,
  QuizHistoryRequest,
  QuizRemedialReply,
  QuizRemedialRequest,
  QuizErrorCode,
  QuizRemediationDto,
  QuizSectionMasteryDto,
  RemedialQuizDto,
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
import { QUIZ_ERROR_CODES, TRACK_CHANNELS } from '@shared/ipc-contract';

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
import type { LanguageAdapter } from '../engine/lang/registry';
// ONDA 2 (python-roda): o adaptador vem do `challenge.language` do desafio
// RESOLVIDO, nunca do default — `adapterDoDesafio` é a MESMA resolução das
// provas de execução (fail-closed: token desconhecido LANÇA).
import { adapterDoDesafio } from '../engine/exec/proofs';
import { trackHarnessLanguage } from '../content/trackTypes';
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
// ONDA 2 (python-roda): o ciclo de remediação do quiz. A ASSINATURA é
// congelada (commit de PREP da onda); o CORPO é substituído por outro agente
// nesta mesma onda. Este arquivo escreve contra a assinatura, nunca contra o
// corpo — é por isso que o import é do módulo e não de um detalhe dele.
import { createQuizRemediation, type QuizRemediation } from '../services/quizRemediation';

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
  /**
   * ADITIVO (onda2-python-roda): a superfície v5 do QUIZ ADAPTATIVO
   * (`db/repo.ts` §v5). OPCIONAIS pelo MESMO motivo de `listTrackScopedState`:
   * os fakes da suíte e os stubs E2E que já implementam `TrackRepoLike` não
   * conhecem estes métodos, e exigi-los aqui quebraria arquivos que não são
   * desta sub-tarefa. A ausência degrada para erro estruturado
   * (`QUIZ_UNAVAILABLE`) — nunca para "nenhuma tentativa registrada", que
   * seria uma mentira tranquila sobre o que o aluno provou saber.
   */
  recordQuizAttempt?(input: {
    trackSlug: string;
    lessonId: string;
    sectionKey: string;
    assertionId: string;
    selectedIndex: number;
    correct: boolean;
    attemptNo?: number;
    quizOrigin?: 'authored' | 'remedial';
  }): Promise<QuizAttemptRowLike>;
  listQuizAttempts?(scope: { trackSlug: string; lessonId: string }): Promise<QuizAttemptRowLike[]>;
  saveQuizRemediation?(input: {
    id?: string;
    trackSlug: string;
    lessonId: string;
    sectionKey: string;
    originAssertionId: string;
    generation: number;
    explanation: string;
    quiz: RemedialQuizDto;
  }): Promise<unknown>;
  listQuizRemediations?(scope: { trackSlug: string; lessonId: string }): Promise<QuizRemediationRowLike[]>;
  quizMasteryFor?(scope: { trackSlug: string; lessonId: string }): Promise<QuizSectionMasteryDto[]>;
}

/**
 * A linha de `quiz_attempts` como este arquivo a consome. É o `QuizAttemptRow`
 * de `db/repo.ts` menos o `id` da linha (que o DTO do contrato não carrega) —
 * declarado aqui, e não importado, porque `ipc/` já não importa `db/repo.ts`
 * em lugar nenhum (o repo chega SEMPRE por injeção, e é isso que deixa os
 * testes rodarem sem SQLite).
 */
interface QuizAttemptRowLike extends QuizAttemptDto {
  id: string;
}

/** A linha de `quiz_remediations` como este arquivo a consome (ver acima). */
interface QuizRemediationRowLike extends Omit<QuizRemediationDto, 'quiz'> {
  quiz: RemedialQuizDto | null;
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
  /**
   * OPCIONAL (onda2-python-roda): o ciclo de remediação do quiz. Ausente E com
   * `llm` presente → construído aqui com o mesmo `chatFn` do tutor. Ausente E
   * sem `llm` → NÃO EXISTE, e os canais `quiz-explain`/`quiz-remedial`
   * respondem `QUIZ_UNAVAILABLE`. O slot existe para a suíte injetar um duplo
   * sem rede (mesma disciplina de `tutorChat(input, chat)`), e para que este
   * arquivo não precise ser tocado quando o corpo do serviço mudar.
   */
  quizRemediation?: QuizRemediation;
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
  //
  // ONDA 2 (python-roda): a resolução devolve TAMBÉM a LINGUAGEM do desafio.
  // Sem ela o handler chamava `runStudentCode({...})` sem adaptador e sem exec,
  // o runner caía no default (javascript) e a trilha `python` respondia
  // `SyntaxError: Unexpected token 'import'` para a solução de referência da
  // própria aula 1 — o aluno não saía da primeira aula.
  interface TestSpec {
    testsCode: string;
    expectedTestCount: number;
    /** `challenge.language` do desafio resolvido (token do disco: 'nodejs', 'python', …). */
    language: string;
  }
  async function resolveTestsCode(
    loaded: LoadedTrack,
    p: TrackSubmitRequest,
    isProficiency: boolean,
  ): Promise<TestSpec | null> {
    if (isProficiency) {
      const prof = loaded.proficiency;
      if (!prof || (p.challengeId && p.challengeId !== prof.slug)) return null;
      return { testsCode: prof.testsCode, expectedTestCount: prof.expectedTestCount, language: prof.language };
    }
    // ADITIVO (rodada 9): desafio do MÓDULO (target 'module').
    if (p.target === 'module') {
      const mod = loaded.modules.find((m) => m.meta.slug === p.moduleSlug);
      if (!mod?.challenge || (p.challengeId && p.challengeId !== mod.challenge.slug)) return null;
      return {
        testsCode: mod.challenge.testsCode,
        expectedTestCount: mod.challenge.expectedTestCount,
        language: mod.challenge.language,
      };
    }
    const found = findLessonAnywhere(loaded, p.lessonId ?? '');
    if (!found) return null;
    const ch = found.lesson.challenges.find((c) => c.slug === p.challengeId);
    if (ch) return { testsCode: ch.testsCode, expectedTestCount: ch.expectedTestCount, language: ch.language };
    if (repo && p.challengeId) {
      const gen = await repo.listGeneratedChallenges(loaded.root.slug, p.lessonId!);
      const g = gen.find((x) => x.challengeId === p.challengeId);
      // LIMITAÇÃO DECLARADA: a tabela `generated_challenges` não guarda
      // linguagem (nasceu monolíngue). O fallback é a linguagem em que os
      // `testsCode` DA TRILHA são escritos (`harnessLanguage`, default =
      // `programmingLanguage`, default = javascript) — que é exatamente a
      // pergunta que o runner faz. Trilha de uma linguagem só (o caso de hoje,
      // e o que o loader exige: todo `challenge.language` da trilha resolve
      // para o MESMO adaptador) ⇒ o fallback é a resposta certa.
      if (g) {
        return {
          testsCode: g.testsCode,
          expectedTestCount: g.expectedTestCount,
          language: trackHarnessLanguage(loaded.root),
        };
      }
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
    if (!repo) return submitError('NO_REPO', 'persistência indisponível.');
    const loaded = await loadTrackOrError(p.trackSlug);
    if ('error' in loaded) return submitError('TRACK_INVALID', loaded.error);

    const testSpec = await resolveTestsCode(loaded, p, isProficiency);
    if (!testSpec) return submitError('CHALLENGE_NOT_FOUND', 'desafio não encontrado.');

    // O ADAPTADOR DO DESAFIO — não o default. Token declarado e desconhecido
    // LANÇA (fail-closed do registro); aqui vira erro estruturado, porque um
    // handler IPC nunca rejeita o invoke do aluno com exceção crua.
    let adapter: LanguageAdapter;
    try {
      adapter = adapterDoDesafio(testSpec.language);
    } catch (err) {
      return submitError('CHALLENGE_LANGUAGE_UNSUPPORTED', String(err));
    }

    // FIX (revisão adversarial): valida cada path de arquivo ANTES de qualquer
    // escrita — path malicioso ('a/../../escape.mjs') faria o runner escrever
    // FORA do workdir de execução (path.join resolve o '..' no writeFile).
    //
    // ONDA 2 (python-roda): a validação MUDOU DE LUGAR — passou para DEPOIS da
    // resolução do desafio, porque o regex de caminho seguro é do ADAPTADOR
    // DELE e não do default: em JavaScript o arquivo termina em `.mjs`
    // (`/^[a-zA-Z0-9_\-/]+\.mjs$/`), em Python em `.py`. Antes, um desafio
    // multi-arquivo de Python era rejeitado com "path de arquivo inválido"
    // ANTES de qualquer execução. Continua sendo a PRIMEIRA coisa que acontece
    // antes de escrever qualquer byte em disco — que é o que a defesa exige.
    if (
      hasFiles &&
      (p.files as { path: string; code: string }[]).some(
        // A mensagem mostra o padrão REAL em vigor, em vez de repetir um
        // literal que pode divergir dele.
        (f) => typeof f?.path !== 'string' || !adapter.filePathPattern.test(f.path),
      )
    ) {
      return submitError(
        'SUBMIT_BAD_REQUEST',
        `path de arquivo inválido (esperado ${adapter.filePathPattern.source}).`,
      );
    }

    const res = await runStudentCode({
      studentCode: typeof p.code === 'string' ? p.code : '',
      files: hasFiles ? p.files : undefined,
      testsCode: testSpec.testsCode,
      expectedTestCount: testSpec.expectedTestCount,
      // A LINHA QUE FALTAVA no caminho do aluno.
      language: testSpec.language,
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

  // ─── QUIZ ADAPTATIVO: os quatro canais ─────────────────────────────────────
  //
  // A REGRA DO PRODUTO (shared/ipc-contract.ts, "DTOs: QUIZ ADAPTATIVO"): o
  // aluno erra ⇒ a IA explica POR QUE aquela opção está errada ⇒ um quiz NOVO
  // sobre o mesmo conteúdo é gerado na hora ⇒ o desafio só abre depois do
  // acerto ⇒ tudo sobrevive ao fechamento do app.
  //
  // A DIVISÃO DE TRABALHO, e por que ela é assim:
  //   - `quiz-attempt` e `quiz-history` são PURAMENTE repo. Não há LLM no
  //     caminho: registrar uma resposta e ler o histórico são perguntas ao
  //     banco, e enfiar um serviço remoto no meio delas transformaria uma
  //     escrita local em algo que falha quando a internet cai;
  //   - `quiz-explain` e `quiz-remedial` delegam a `services/quizRemediation.ts`
  //     e NÃO decidem nada de pedagogia aqui.
  //
  // FAIL-CLOSED em todos os quatro, no mesmo idioma dos outros canais deste
  // arquivo: sem repo, sem serviço ou com pedido incompleto ⇒
  // `{ ok:false, code, message }`. Nunca uma explicação inventada, nunca um
  // quiz malformado, nunca "0 tentativas" no lugar de "não consegui ler".

  /** O serviço: injetado (suíte) ou construído do `llm` (produto). Sem `llm`, não existe. */
  const quizService: QuizRemediation | undefined =
    deps.quizRemediation ?? (deps.llm ? createQuizRemediation({ chat: chatFn }) : undefined);

  // O ramo de falha é IDÊNTICO nas quatro respostas do contrato
  // (`{ ok:false; code: QuizErrorCode; message: string }`), então uma função só
  // serve as quatro — e o tipo do `code` vem do contrato, o que impede um
  // código inventado de chegar ao renderer.
  const quizErro = (
    code: QuizErrorCode,
    message: string,
  ): { ok: false; code: QuizErrorCode; message: string } => ({ ok: false, code, message });

  const textoNaoVazio = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

  /** Escopo (trilha, aula) de qualquer pedido de quiz — validação MÍNIMA do payload IPC. */
  const escopoDoQuiz = (p: { trackSlug?: unknown; lessonId?: unknown }): { trackSlug: string; lessonId: string } | null =>
    textoNaoVazio(p.trackSlug) && textoNaoVazio(p.lessonId)
      ? { trackSlug: p.trackSlug, lessonId: p.lessonId }
      : null;

  const masteryDto = (m: QuizSectionMasteryDto): QuizSectionMasteryDto => ({
    sectionKey: m.sectionKey,
    mastered: m.mastered,
    attemptCount: m.attemptCount,
    correctCount: m.correctCount,
    firstCorrectAt: m.firstCorrectAt,
    lastAttemptAt: m.lastAttemptAt,
  });

  /** A linha do banco vira DTO: o `id` da linha não atravessa o IPC. */
  const attemptDto = (row: QuizAttemptRowLike): QuizAttemptDto => ({
    trackSlug: row.trackSlug,
    lessonId: row.lessonId,
    sectionKey: row.sectionKey,
    assertionId: row.assertionId,
    selectedIndex: row.selectedIndex,
    correct: row.correct,
    attemptNo: row.attemptNo,
    quizOrigin: row.quizOrigin,
    createdAt: row.createdAt,
  });

  /**
   * A maestria RECALCULADA depois de gravar. `quizMasteryFor` ausente na repo
   * ⇒ `[]`: a tentativa FOI gravada e negá-la seria pior; a lista vazia diz
   * "nenhuma seção provada", que é o estado seguro do gate (o desafio não abre
   * por omissão — ele abre por acerto registrado).
   */
  async function maestriaDaAula(scope: { trackSlug: string; lessonId: string }): Promise<QuizSectionMasteryDto[]> {
    if (!repo?.quizMasteryFor) return [];
    return (await repo.quizMasteryFor(scope)).map(masteryDto);
  }

  // ─── track:quiz-attempt ────────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.QUIZ_ATTEMPT, async (_event, payload: unknown): Promise<QuizAttemptReply> => {
    const p = (payload ?? {}) as QuizAttemptRequest;
    const scope = escopoDoQuiz(p);
    if (!scope || !textoNaoVazio(p.sectionKey) || !textoNaoVazio(p.assertionId)) {
      return quizErro(QUIZ_ERROR_CODES.NOT_FOUND, 'quiz-attempt requer trackSlug, lessonId, sectionKey e assertionId.');
    }
    if (typeof p.selectedIndex !== 'number' || !Number.isInteger(p.selectedIndex) || p.selectedIndex < 0) {
      return quizErro(QUIZ_ERROR_CODES.NOT_FOUND, 'selectedIndex inválido (índice inteiro da opção escolhida).');
    }
    if (typeof p.correct !== 'boolean') {
      // O veredito NÃO é derivado aqui: quem sabe o `answerIndex` é o
      // renderer, que já tem a afirmação. Derivar de novo neste ponto seria uma
      // segunda implementação da mesma regra — e um booleano ausente é pedido
      // incompleto, não "errou".
      return quizErro(QUIZ_ERROR_CODES.NOT_FOUND, 'correct ausente: o pedido precisa dizer se a resposta acertou.');
    }
    if (!repo?.recordQuizAttempt) {
      return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, 'persistência de quiz indisponível nesta build.');
    }
    try {
      const row = await repo.recordQuizAttempt({
        ...scope,
        sectionKey: p.sectionKey,
        assertionId: p.assertionId,
        selectedIndex: p.selectedIndex,
        correct: p.correct,
        // `attemptNo` omitido de propósito quando o pedido não o traz: a repo o
        // DERIVA (COUNT+1) na mesma transação do INSERT — é o único lugar onde
        // a contagem não corre risco de ficar defasada.
        ...(typeof p.attemptNo === 'number' ? { attemptNo: p.attemptNo } : {}),
        ...(p.quizOrigin ? { quizOrigin: p.quizOrigin } : {}),
      });
      return { ok: true, attempt: attemptDto(row), mastery: await maestriaDaAula(scope) };
    } catch (err) {
      return quizErro(QUIZ_ERROR_CODES.PERSIST_FAILED, `falha ao gravar a resposta: ${String(err)}`);
    }
  });

  // ─── track:quiz-history ────────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.QUIZ_HISTORY, async (_event, payload: unknown): Promise<QuizHistoryReply> => {
    const p = (payload ?? {}) as QuizHistoryRequest;
    const scope = escopoDoQuiz(p);
    if (!scope) return quizErro(QUIZ_ERROR_CODES.NOT_FOUND, 'quiz-history requer trackSlug + lessonId.');
    if (!repo?.listQuizAttempts || !repo.listQuizRemediations) {
      return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, 'histórico de quiz indisponível nesta build.');
    }
    try {
      const [attempts, remediations, mastery] = await Promise.all([
        repo.listQuizAttempts(scope),
        repo.listQuizRemediations(scope),
        maestriaDaAula(scope),
      ]);
      return {
        ok: true,
        attempts: attempts.map(attemptDto),
        // `quiz: null` sobrevive: é o parse DEFENSIVO da repo (um `quiz_json`
        // corrompido não derruba o histórico inteiro da aula).
        remediations: remediations.map(
          (r): QuizRemediationDto => ({
            id: r.id,
            trackSlug: r.trackSlug,
            lessonId: r.lessonId,
            sectionKey: r.sectionKey,
            originAssertionId: r.originAssertionId,
            generation: r.generation,
            explanation: r.explanation,
            quiz: r.quiz,
            createdAt: r.createdAt,
          }),
        ),
        mastery,
      };
    } catch (err) {
      return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, `falha ao ler o histórico do quiz: ${String(err)}`);
    }
  });

  // ─── track:quiz-explain ────────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.QUIZ_EXPLAIN, async (_event, payload: unknown): Promise<QuizExplainReply> => {
    const p = (payload ?? {}) as QuizExplainRequest;
    const scope = escopoDoQuiz(p);
    if (!scope || !textoNaoVazio(p.sectionKey) || !p.assertion || !textoNaoVazio(p.assertion.id)) {
      return quizErro(QUIZ_ERROR_CODES.NOT_FOUND, 'quiz-explain requer trackSlug, lessonId, sectionKey e a afirmação.');
    }
    if (typeof p.selectedIndex !== 'number') {
      return quizErro(QUIZ_ERROR_CODES.NOT_FOUND, 'selectedIndex ausente: a explicação é DA opção escolhida.');
    }
    // FAIL-CLOSED, e IMEDIATO: sem repo ou sem serviço não há explicação. A
    // ordem importa — nada de chamar a LLM para descobrir depois que não dá
    // para guardar o que ela disse.
    if (!repo) return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, 'persistência indisponível.');
    if (!quizService) return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, 'serviço de IA indisponível.');
    try {
      // A explicação NÃO é persistida aqui: a linha de `quiz_remediations`
      // guarda explicação + quiz JUNTOS (é o par que o aluno viu), e o quiz só
      // existe no passo seguinte. A gravação acontece no `quiz-remedial`, com a
      // explicação que o renderer devolve no pedido.
      return await quizService.explain(p);
    } catch (err) {
      return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, `falha ao explicar o erro: ${String(err)}`);
    }
  });

  /**
   * O quiz remedial cabe no contrato? Checagem ANTES de gravar — a linha vai
   * para a MESMA tabela de tentativas do quiz autorado, e um registro torto
   * envenena o histórico e o gate.
   *
   * A REGRA QUE MAIS IMPORTA: `quiz.id` NUNCA pode ser o `originAssertionId`.
   * As tentativas dos dois vivem na mesma tabela (`quiz_attempts.assertion_id`)
   * e, com ids iguais, o histórico deixaria de distinguir "errou a autorada" de
   * "errou a remedial" — e a maestria contaria o acerto do quiz fácil como
   * prova de que a afirmação difícil foi entendida.
   */
  const quizRemedialValido = (q: RemedialQuizDto, originAssertionId: string): string | null => {
    if (!textoNaoVazio(q.id)) return 'o quiz gerado veio sem id.';
    if (q.id === originAssertionId) {
      return `o quiz gerado reusou o id da afirmação de origem (${originAssertionId}) — as tentativas dos dois vivem na mesma tabela.`;
    }
    if (!textoNaoVazio(q.question) || !textoNaoVazio(q.statement)) return 'o quiz gerado veio sem enunciado ou sem pergunta.';
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(textoNaoVazio)) {
      return 'o quiz gerado precisa de pelo menos duas opções não vazias.';
    }
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.options.length) {
      return 'o quiz gerado tem answerIndex fora das opções.';
    }
    return null;
  };

  // ─── track:quiz-remedial ───────────────────────────────────────────────────
  map.set(TRACK_CHANNELS.QUIZ_REMEDIAL, async (_event, payload: unknown): Promise<QuizRemedialReply> => {
    const p = (payload ?? {}) as QuizRemedialRequest;
    const scope = escopoDoQuiz(p);
    if (!scope || !textoNaoVazio(p.sectionKey) || !textoNaoVazio(p.originAssertionId) || !p.assertion) {
      return quizErro(
        QUIZ_ERROR_CODES.NOT_FOUND,
        'quiz-remedial requer trackSlug, lessonId, sectionKey, originAssertionId e a afirmação de origem.',
      );
    }
    const generation = typeof p.generation === 'number' && Number.isInteger(p.generation) && p.generation >= 1 ? p.generation : 1;
    if (!repo) return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, 'persistência indisponível.');
    if (!quizService) return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, 'serviço de IA indisponível.');

    let reply: QuizRemedialReply;
    try {
      reply = await quizService.remedial({ ...p, generation });
    } catch (err) {
      return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, `falha ao gerar o quiz novo: ${String(err)}`);
    }
    if (!reply.ok) return reply;

    const problema = quizRemedialValido(reply.quiz, p.originAssertionId);
    if (problema) return quizErro(QUIZ_ERROR_CODES.INVALID_QUIZ, problema);

    // A REMEDIAÇÃO É PERSISTIDA AQUI, com a explicação que o aluno JÁ leu (o
    // renderer a devolve no pedido) — é o par explicação+quiz que faz a
    // remediação "ficar no histórico da aula" depois de o app fechar.
    if (!repo.saveQuizRemediation) {
      return quizErro(QUIZ_ERROR_CODES.UNAVAILABLE, 'persistência de remediação indisponível nesta build.');
    }
    try {
      await repo.saveQuizRemediation({
        ...scope,
        sectionKey: p.sectionKey,
        originAssertionId: p.originAssertionId,
        generation,
        explanation: typeof p.explanation === 'string' ? p.explanation : '',
        quiz: reply.quiz,
      });
    } catch (err) {
      // NÃO devolvemos o quiz "só desta vez, sem gravar". Ele é a verificação
      // que o gate de maestria consulta: entregue e não persistido, ele some no
      // próximo boot e o histórico passa a mentir sobre o que o aluno viu.
      return quizErro(QUIZ_ERROR_CODES.PERSIST_FAILED, `quiz gerado mas não persistiu: ${String(err)}`);
    }
    return reply;
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
