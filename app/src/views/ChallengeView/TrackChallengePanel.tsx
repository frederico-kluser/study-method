/**
 * src/views/ChallengeView/TrackChallengePanel.tsx — desafio de TRILHA (rodada 8).
 *
 * Fluxo completo do desafio da trilha, em 3 atos:
 *
 *   1. ENUNCIADO — o cronômetro NÃO roda até o aluno ler e clicar em "Começar"
 *      (requisito do dono do produto: só depois de começar é que o contador
 *      anda). As estrelas só podem sumir por DEMORA depois de `minFirstStarMs`
 *      (carência da 1ª estrela); perdas explícitas (blur/erro/timeout) seguem
 *      imediatas.
 *   2. RESOLUÇÃO — editor (autocomplete OFF) + "Testar resposta" →
 *      track:challenge-submit (o main roda o código contra os testes — os
 *      testes nunca aparecem na UI). ADITIVO (rodada 9): desafio MULTI-ARQUIVO
 *      → SELETOR DE ARQUIVOS (abas MUI), um editor CodeMirror por arquivo; o
 *      submit envia o código de TODOS os arquivos (files no request).
 *   3. VEREDITO — passou: confete + mark 'passed' (estrelas/duração) via
 *      study:mark-challenge-attempt; errou (target 'lesson', ONDA2): o painel
 *      FECHA e o chat da aula reabre com a bolha de erro + pergunta do tutor
 *      (markAttempt → reportChallengeError → navigateToLesson — o desafio
 *      NUNCA é repetido: a LLM vê os desafios que o aluno errou naquela aula);
 *      errou (proficiency/module): o ERRO é apresentado + botão "Gerar novo
 *      desafio" (proficiency) — comportamento atual preservado.
 *
 * A proficiência usa o MESMO painel (target 'proficiency'); ao passar, o main
 * grava o veredito e destrava a trilha inteira. ADITIVO (rodada 9): o desafio
 * do MÓDULO (target 'module' + moduleSlug) usa o mesmo painel — sem botão de
 * regeneração (conteúdo autoral).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

import { getApi } from '../../lib/apiBridge';
import {
  ACTION_TIMEOUTS,
  IPC_TIMEOUT_MS,
  isTimeoutError,
  resolveChannelError,
  withTimeout,
} from '../../lib/ipcTimeout';
import { fireConfetti } from '../../lib/confetti';
import { createStarTracker, formatClock, type StarTracker } from '../../lib/challengeStars';
import { CodeMirrorField } from '../../components/cm/CodeMirrorField';
import { buildErrorReport } from '../../lib/trackLessonState';
import { setPendingTrackLesson } from '../../lib/pendingSubject';
import type { NavKey } from '../../lib/shellNav';
// ONDA3 (generate-flow): o processo de "Gerar novo desafio" é GLOBAL (store
// module-level + modal de etapas no shell) — o painel dispara via store + IPC
// e atualiza o spec local quando o invoke resolve (o modal mostra o progresso).
import {
  failChallengeGenerate,
  finishChallengeGenerate,
  peekChallengeGenerate,
  startChallengeGenerate,
  subscribeChallengeGenerate,
} from '../../lib/challengeGenerateStore';
import type {
  TrackChallengeSpec,
  TrackSubmitResult,
} from '../../../shared/ipc-contract';
import { useChallengeNav, type TrackChallengeNavSelection } from '../../lib/challengeNav';
import { MarkdownView } from '../../components/markdown';

export function TrackChallengePanel({
  selection,
  onNavigate,
}: {
  selection: TrackChallengeNavSelection;
  /**
   * ONDA 4 (next-glow): navegação genérica do shell (NavKey) para o FALLBACK
   * "sem próxima aula" → trilha. No-op quando ausente (testes/uso sem shell).
   * A navegação para a próxima AULA usa o fluxo track (setPendingTrackLesson +
   * nav.navigateToLesson) — o mesmo padrão do RoadmapView.openLesson.
   */
  onNavigate?: (key: NavKey) => void;
}): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  // ONDA2 (error-flow): o painel fecha um desafio de AULA que falhou —
  // reporta o erro e navega de volta ao chat da aula (bolha de erro).
  const nav = useChallengeNav();

  const [spec, setSpec] = useState<TrackChallengeSpec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Ato 1: enunciado → "Começar".
  const [started, setStarted] = useState(false);
  const startTsRef = useRef(0);

  // Cronômetro + estrelas.
  const [elapsedMs, setElapsedMs] = useState(0);
  const [starsLeft, setStarsLeft] = useState(3);
  const trackerRef = useRef<StarTracker | null>(null);
  const [concluded, setConcluded] = useState<'passed' | 'failed' | 'timeout' | null>(null);

  // Editor + teste.
  const [code, setCode] = useState('');
  /** ADITIVO (rodada 9): desafio MULTI-ARQUIVO — código por caminho de arquivo. */
  const [filesCode, setFilesCode] = useState<Record<string, string>>({});
  /** arquivo ativo no seletor de abas (path; default = primeiro arquivo). */
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TrackSubmitResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Regeneração (nunca-repetir).
  const [regenerating, setRegenerating] = useState(false);
  // ONDA3 (generate-flow): processo GLOBAL em voo — gateia o botão mesmo se
  // este painel montou DEPOIS do disparo (ex.: voltou à aba Desafio no meio
  // da geração iniciada na bolha da aula).
  const generateState = useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate);
  const generateRunning = generateState.status === 'running';

  const markedRef = useRef<string | null>(null);

  // Guard de montagem (MESMO padrão do loadSpec): durante `running` o rail de
  // abas segue clicável — se o painel desmontar no meio do submit (troca de
  // aba), o `await withTimeout(challengeSubmit)` ainda resolve depois e NADA
  // pode rodar: nem markAttempt/setResult/setConcluded, nem
  // reportChallengeError/navigateToLesson, nem setSubmissionError/setRunning.
  // O reset na montagem é OBRIGATÓRIO (StrictMode no dev double-invoca o
  // efeito: cleanup → re-mount; sem o reset o guard bloquearia tudo no dev).
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const loadSpec = useCallback(
    (sel: TrackChallengeNavSelection): void => {
      setLoading(true);
      setLoadError(null);
      let cancelled = false;
      const req =
        sel.target === 'proficiency'
          ? { trackSlug: sel.trackSlug, target: 'proficiency' as const, challengeId: sel.challengeId }
          : sel.target === 'module'
            ? { trackSlug: sel.trackSlug, target: 'module' as const, moduleSlug: sel.moduleSlug, challengeId: sel.challengeId }
            : { trackSlug: sel.trackSlug, target: 'lesson' as const, lessonId: sel.lessonId, challengeId: sel.challengeId };
      const call = sel.target === 'proficiency' ? getApi().track.proficiency : getApi().track.challenge;
      // Timeout: canal mudo (IPC nunca resolve) vira loadError com retry —
      // o CircularProgress do loading nunca fica eterno.
      withTimeout(call(req), IPC_TIMEOUT_MS, sel.target === 'proficiency' ? 'track.proficiency' : 'track.challenge')
        .then((res) => {
          if (cancelled) return;
          if (res.ok === false) {
            // W3 (falsy-proof): '' é erro VÁLIDO — só null significa "sem erro".
            setLoadError(resolveChannelError(res, tI('challenge.trackLoadFailed')));
            return;
          }
          if (!res.challenge) {
            setLoadError(tI('challenge.trackNotFound'));
            return;
          }
          setSpec(res.challenge);
          // ADITIVO (rodada 9): multi-arquivo — um editor por arquivo, starters
          // de cada um; sem files, editor único com starterCode (comportamento atual).
          if (res.challenge.files && res.challenge.files.length > 0) {
            setFilesCode(
              Object.fromEntries(res.challenge.files.map((f) => [f.path, f.starterCode])),
            );
            setActiveFile(res.challenge.files[0].path);
          } else {
            setFilesCode({});
            setActiveFile(null);
            setCode(res.challenge.starterCode);
          }
          setStarted(false);
          setElapsedMs(0);
          setStarsLeft(3);
          setConcluded(null);
          setResult(null);
          setSubmissionError(null);
          markedRef.current = null;
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setLoadError(isTimeoutError(err) ? tI('challenge.trackLoadTimeout') : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    },
    [tI],
  );

  // Montagem: carrega a spec do desafio selecionado.
  useEffect(() => {
    loadSpec(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.trackSlug, selection.challengeId, selection.target, selection.lessonId, selection.moduleSlug]);

  /** Marca a tentativa (nunca-repetir) — idempotente por desafio+veredito. */
  const markAttempt = useCallback(
    (verdict: 'passed' | 'failed' | 'timeout' | 'abandoned', stars: number, durationMs: number): void => {
      if (!spec || !started || markedRef.current === verdict) return;
      markedRef.current = verdict;
      const payload = {
        subjectSlug: selection.trackSlug,
        lessonId: selection.target === 'lesson' ? selection.lessonId : undefined,
        challengeId: spec.slug,
        verdict,
        stars,
        durationMs,
      };
      getApi()
        .study.markChallengeAttempt(payload)
        .catch(() => {
          /* mark é otimista: falha transitória perde o registro — limitação documentada */
        });
    },
    [spec, started, selection.trackSlug, selection.lessonId, selection.target],
  );

  // Ato 1: "Começar" — o cronômetro SÓ começa aqui.
  const handleStart = useCallback((): void => {
    if (!spec || started) return;
    setStarted(true);
    startTsRef.current = Date.now();
    trackerRef.current = createStarTracker({
      timeLimitMs: spec.timeLimitMs,
      minFirstStarMs: spec.minFirstStarMs,
    });
    setElapsedMs(0);
    setStarsLeft(3);
  }, [spec, started]);

  // Tick de 1s: estrelas por demora + timeout.
  useEffect(() => {
    if (!started || concluded) return undefined;
    const tick = (): void => {
      const elapsed = Date.now() - startTsRef.current;
      setElapsedMs(elapsed);
      const tracker = trackerRef.current;
      if (tracker) {
        tracker.onTick(elapsed);
        setStarsLeft(tracker.stars());
        if (tracker.isTimedOut(elapsed)) {
          setConcluded('timeout');
          markAttempt('timeout', tracker.stars(), elapsed);
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [started, concluded, markAttempt]);

  // Blur (janela perdeu foco): -1 estrela imediata.
  useEffect(() => {
    if (!started || concluded) return undefined;
    const handleBlur = (): void => {
      const tracker = trackerRef.current;
      if (tracker) {
        tracker.onBlur();
        setStarsLeft(tracker.stars());
      }
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleBlur);
    };
  }, [started, concluded]);

  // Troca de desafio sem concluir → abandoned. ONDA2 (error-flow): o desafio
  // de AULA que falhou já foi marcado 'failed' ANTES de navegar (ordem:
  // markAttempt → report → navigate) — o setConcluded não chega a commitar
  // antes do unmount, então este cleanup veria `concluded` null e marcaria
  // 'abandoned' POR CIMA do 'failed' (o repo é append — a última linha vira o
  // lastVerdict). O guard lê o REF (sempre atual): terminal já marcado → o
  // unmount não sobrescreve.
  useEffect(() => {
    return () => {
      if (started && !concluded && spec && markedRef.current !== 'failed') {
        const elapsed = startTsRef.current > 0 ? Date.now() - startTsRef.current : 0;
        markAttempt('abandoned', starsLeft, elapsed);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, concluded, spec, selection.challengeId]);

  /** Roda o código do aluno contra os testes (o main nunca expõe os testes). */
  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!spec || !started || running || concluded) return;
    setRunning(true);
    setSubmissionError(null);
    try {
      // ADITIVO (rodada 9): multi-arquivo — o submit envia o código de TODOS
      // os arquivos (files); sem files, envia o code único (comportamento atual).
      const multiFile = spec.files && spec.files.length > 0;
      const payload = {
        trackSlug: selection.trackSlug,
        target: selection.target,
        lessonId: selection.target === 'lesson' ? selection.lessonId : undefined,
        moduleSlug: selection.target === 'module' ? selection.moduleSlug : undefined,
        challengeId: spec.slug,
        code: multiFile ? (filesCode[activeFile ?? ''] ?? '') : code,
        ...(multiFile
          ? { files: spec.files.map((f) => ({ path: f.path, code: filesCode[f.path] ?? '' })) }
          : {}),
        ...(selection.target === 'proficiency' ? { stars: starsLeft } : {}),
      };
      // FIX W1 (onda 4): timeout de 45s — > 30s do exec do código no main
      // (challengeExec.ts) + overhead de spawn/load; canal MUDO nunca trava o
      // botão "Testar resposta" para sempre (finally limpa o `running`).
      const res = await withTimeout(
        getApi().track.challengeSubmit(payload as never),
        ACTION_TIMEOUTS.challengeSubmit,
        'track.challengeSubmit',
      );
      // Guard de montagem: painel desmontado durante o submit → descarta
      // silenciosamente (nada de markAttempt, setResult, reportChallengeError,
      // navigateToLesson) — o unmount já marcou 'abandoned' no cleanup.
      if (cancelledRef.current) return;
      if (res.ok) {
        setResult(res);
        if (res.passed) {
          setConcluded('passed');
          fireConfetti();
          markAttempt('passed', starsLeft, Date.now() - startTsRef.current);
        } else if (selection.target === 'lesson') {
          // ONDA2 (error-flow): desafio de AULA que FALHOU → o painel FECHA e o
          // chat da aula reabre com a bolha de erro + pergunta do tutor. Ordem
          // (contrato): markAttempt (nunca-repetir) → reportChallengeError →
          // navigateToLesson. O mark é otimista (fire-and-forget) e o report
          // é drenado pela LessonView na montagem (seed anti-StrictMode com
          // ref). proficiency/module e submissionError/timeout NÃO chegam aqui
          // — o painel permanece (comportamento atual intacto).
          markAttempt('failed', starsLeft, Date.now() - startTsRef.current);
          const files = multiFile
            ? spec.files.map((f) => ({ path: f.path, code: filesCode[f.path] ?? '' }))
            : [{ path: 'solution.mjs', code }];
          const errorReport = buildErrorReport({
            trackSlug: selection.trackSlug,
            lessonId: selection.lessonId ?? '',
            challengeId: spec.slug,
            challengeTitle: spec.title,
            files,
            result: res,
          });
          nav.reportChallengeError(errorReport);
          nav.navigateToLesson();
          return; // o painel fecha antes de renderizar a bolha determinística
        } else {
          setConcluded('failed');
          markAttempt('failed', starsLeft, Date.now() - startTsRef.current);
        }
      } else {
        setSubmissionError(res.error?.message ?? 'erro ao testar');
      }
    } catch (err) {
      // Guard de montagem: idem — desmontado, nem o catch seta estado.
      if (cancelledRef.current) return;
      setSubmissionError(isTimeoutError(err) ? tI('challenge.submitTimeout') : String(err));
    } finally {
      // Idem loadSpec: o finally também só roda montado.
      if (!cancelledRef.current) setRunning(false);
    }
  }, [spec, started, running, concluded, selection, code, filesCode, activeFile, starsLeft, markAttempt, tI, nav]);

  /** Regenera o desafio: a LLM vê os erros do aluno nesta aula e não repete.
   *
   *  ONDA3 (generate-flow): o processo é GLOBAL — dispara via
   *  challengeGenerateStore + o IPC; o modal de etapas (no shell) mostra o
   *  progresso real (eventos do main). DECISÃO (documentada): o painel MANTÉM
   *  a atualização local do spec quando o invoke resolve (setSpec — fluxo
   *  atual intacto); se o painel desmontou durante a geração (troca de aba),
   *  o modal global mostra o done com "Ver desafio" (navega para o desafio
   *  novo) — o guard cancelledRef impede setState/navegação pós-await. */
  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!spec || regenerating || generateRunning) return;
    const generationId = startChallengeGenerate({
      trackSlug: selection.trackSlug,
      lessonId: selection.lessonId ?? selection.challengeId,
      // BAIXO-3: o painel de proficiência navega com target 'proficiency'
      // (nunca hardcode 'lesson' — o modal usa o target guardado no store).
      target: selection.target === 'proficiency' ? 'proficiency' : 'lesson',
    });
    if (generationId === null) {
      // Já existe um processo em voo (ex.: disparado pela bolha da aula) — o
      // modal global é o único processo; nada a fazer aqui.
      return;
    }
    setRegenerating(true);
    try {
      // FIX W1 (onda 4): timeout de 150s — o main faz ATÉ 2 tentativas de LLM
      // com 60s cada (challengeRegenerator.ts) = ~120s legítimos + verificação;
      // o timeout só desbloqueia o canal MUDO, nunca corta geração legítima.
      const res = await withTimeout(
        getApi().track.challengeRegenerate({
          trackSlug: selection.trackSlug,
          lessonId: selection.lessonId ?? selection.challengeId,
          // ALTO-2: o main ecoa o id nos eventos de progresso — o modal
          // descarta eventos de processos anteriores.
          generationId,
        }),
        ACTION_TIMEOUTS.challengeRegenerate,
        'track.challengeRegenerate',
      );
      // Guard de montagem: painel desmontado durante a geração → descarta
      // silenciosamente (o modal global conclui pelos eventos do main).
      if (cancelledRef.current) return;
      if (res.ok && res.challenge) {
        // O modal global (sempre montado) já recebeu o 'done' do main — este
        // finish é idempotente (estado terminal sticky + correlação no store).
        finishChallengeGenerate({ slug: res.challenge.slug, title: res.challenge.title }, generationId);
        setSpec(res.challenge);
        setCode(res.challenge.starterCode);
        setStarted(false);
        setElapsedMs(0);
        setStarsLeft(3);
        setConcluded(null);
        setResult(null);
        setSubmissionError(null);
        markedRef.current = null;
      } else {
        const msg = res.error?.message ?? 'não foi possível gerar um novo desafio';
        failChallengeGenerate(msg, generationId);
        setSubmissionError(msg);
      }
    } catch (err) {
      // Guard de montagem: idem — desmontado, nem o catch seta estado.
      if (cancelledRef.current) return;
      const msg = isTimeoutError(err) ? tI('challenge.regenerateTimeout') : String(err);
      failChallengeGenerate(msg, generationId);
      setSubmissionError(msg);
    } finally {
      // Idem handleSubmit: o finally também só roda montado.
      if (!cancelledRef.current) setRegenerating(false);
    }
  }, [spec, regenerating, generateRunning, selection.target, selection.trackSlug, selection.lessonId, selection.challengeId, tI]);

  /**
   * ONDA 4 (next-glow): "Avançar para a próxima aula" pós-sucesso — navega para
   * a PRÓXIMA aula destravada e NÃO concluída da MESMA trilha (a aula do desafio
   * excluída), via setPendingTrackLesson + nav.navigateToLesson (padrão do
   * RoadmapView.openLesson). O spec do desafio não carrega a próxima aula
   * (quem carrega é o payload de track:lesson, `nextLesson`); aqui o painel
   * resolve pelo DETALHE da trilha (track.get): aulas na ordem dos módulos,
   * primeira com locked=false e done=false DEPOIS da aula deste desafio (a
   * mesma aula que o campo `current` do detalhe apontaria quando ela já está
   * concluída — e mais correta quando ainda não está). Fallback: erro do IPC,
   * trilha sem próxima (última aula / tudo concluído) ou lessonId ausente →
   * navega para a TRILHA (roadmap), onde o usuário vê o estado real.
   */
  const handleAdvanceToNextLesson = useCallback(async (): Promise<void> => {
    if (!spec || selection.target !== 'lesson' || !selection.lessonId) {
      onNavigate?.('roadmap');
      return;
    }
    let next: { slug: string; title: string } | null = null;
    try {
      const res = await withTimeout(
        getApi().track.get({ trackSlug: selection.trackSlug }),
        IPC_TIMEOUT_MS,
        'track.get',
      );
      if (res.ok && res.track) {
        const flat = res.track.modules.flatMap((m) => m.lessons);
        const idx = flat.findIndex((l) => l.slug === selection.lessonId);
        // Defensivo: aula deste desafio sumiu do detalhe → sem próxima (vai
        // para o fallback da trilha); NUNCA começa a varredura do índice 0
        // (idx=-1 → i=0 reapontaria para a PRÓPRIA aula).
        for (let i = idx >= 0 ? idx + 1 : flat.length; i < flat.length; i++) {
          const l = flat[i];
          if (!l.locked && !l.done) {
            next = { slug: l.slug, title: l.title };
            break;
          }
        }
      }
    } catch {
      next = null;
    }
    if (next) {
      setPendingTrackLesson(selection.trackSlug, next.slug);
      nav.navigateToLesson();
    } else {
      onNavigate?.('roadmap');
    }
  }, [spec, selection.trackSlug, selection.target, selection.lessonId, nav, onNavigate]);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // W3 (falsy-proof): só `null` significa "sem erro" — '' é erro válido.
  if (loadError !== null || !spec) {
    return (
      <Box sx={{ p: 2, maxWidth: 720, mx: 'auto', pt: 4 }}>
        <Alert severity="error">{loadError ?? t('translation:challenge.trackNotFound')}</Alert>
        <Button variant="outlined" onClick={() => loadSpec(selection)} sx={{ mt: 1 }}>
          {t('translation:common.tryAgain')}
        </Button>
      </Box>
    );
  }

  const clock = formatClock(Math.max(0, spec.timeLimitMs - elapsedMs));
  // ADITIVO (rodada 9): multi-arquivo — TODOS os arquivos precisam de código.
  const multiFile = !!(spec.files && spec.files.length > 0);
  const canSubmit =
    started &&
    !concluded &&
    !running &&
    (multiFile
      ? spec.files!.every((f) => (filesCode[f.path] ?? '').trim().length > 0)
      : code.trim().length > 0);

  return (
    <Box sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
 <Stack spacing={2}>
        {/* Cabeçalho: título + dificuldade + cronômetro + estrelas. */}
 <Stack direction="row" spacing={1}  sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',  }}>
          <Box>
            <Typography variant="h5" component="h1">
              {spec.title}
            </Typography>
 <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }} >
              <Chip size="small" variant="outlined" label={tI('challenge.difficulty', { n: spec.difficulty })} />
              <Chip size="small" variant="outlined" label={tI('challenge.testsCount', { n: spec.expectedTestCount })} />
              {spec.source === 'generated' ? (
                <Chip size="small" color="secondary" label={t('translation:challenge.generatedBadge')} />
              ) : null}
            </Stack>
          </Box>
 <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box>
              {[0, 1, 2].map((i) =>
                i < starsLeft ? (
                  <StarIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />
                ) : (
                  <StarBorderIcon key={i} fontSize="small" sx={{ color: 'action.disabled' }} />
                ),
              )}
            </Box>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }} role="timer">
              {started ? clock : formatClock(spec.timeLimitMs)}
            </Typography>
          </Stack>
        </Stack>

        {/* Ato 1: enunciado + Começar (o contador só roda depois). */}
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: 2,
            '& p:first-of-type': { mt: 0 },
            '& p:last-of-type': { mb: 0 },
          }}
        >
          {/* ONDA "chat e código": a renderização de markdown deixou de ser
              uma cópia local (a MESMA função estava duplicada byte a byte aqui,
              na ChallengeView e no ChatBubble, descartando o `className` da
              cerca e pedindo uma pilha mono que não incluía a família REALMENTE
              instalada). Agora vem de src/components/markdown — com KaTeX,
              highlight de sintaxe e a distinção entrada x saída. */}
          <MarkdownView markdown={spec.statement} />
          {!started ? (
            <Button
              variant="contained"
              size="large"
              onClick={handleStart}
              startIcon={<PlayArrowIcon />}
              sx={{ mt: 2 }}
              fullWidth
            >
              {t('translation:challenge.startButton')}
            </Button>
          ) : null}
        </Box>

        {started ? (
          <>
            <Divider />

            {/* Ato 2: editor (autocomplete OFF) + testar. ADITIVO (rodada 9):
                multi-arquivo → SELETOR DE ARQUIVOS (abas MUI) com UM editor
                CodeMirror por arquivo; o submit envia o código de TODOS. */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {multiFile
                  ? t('translation:challenge.filesTitle')
                  : t('translation:challenge.editorLabel')}
              </Typography>
              {multiFile ? (
                <>
                  <Tabs
                    value={activeFile ?? spec.files![0].path}
                    onChange={(_e, v: unknown) => setActiveFile(String(v))}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ mb: 1, minHeight: 36 }}
                  >
                    {spec.files!.map((f) => (
                      <Tab
                        key={f.path}
                        value={f.path}
                        label={f.path}
                        sx={{ textTransform: 'none', minHeight: 36 }}
                        aria-label={tI('challenge.fileTabAria', { file: f.path })}
                      />
                    ))}
                  </Tabs>
                  <CodeMirrorField
                    value={filesCode[activeFile ?? ''] ?? ''}
                    onChange={(v) =>
                      setFilesCode((prev) => ({ ...prev, [activeFile ?? '']: v }))
                    }
                    filename={activeFile ?? 'solution.mjs'}
                    ariaLabel={tI('challenge.fileTabAria', { file: activeFile ?? '' })}
                    readOnly={concluded !== null}
                  />
                </>
              ) : (
                <CodeMirrorField
                  value={code}
                  onChange={setCode}
                  filename="solution.mjs"
                  ariaLabel={t('translation:challenge.editorLabel')}
                  readOnly={concluded !== null}
                />
              )}
              <Button
                variant="contained"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                sx={{ mt: 1 }}
                startIcon={running ? <CircularProgress size={16} /> : undefined}
              >
                {t('translation:challenge.testButton')}
              </Button>
            </Box>

            {/* Ato 3: veredito. */}
            {concluded === 'passed' ? (
              <Stack spacing={1}>
                <Alert severity="success">{tI('challenge.passedAnnounce', { stars: starsLeft })}</Alert>
                {/* ONDA 4 (next-glow): pós-sucesso de um desafio de AULA → o
                    aluno avança para a PRÓXIMA aula ou gera OUTRO desafio.
                    NÃO aparece para target 'module' (desafio autoral — não
                    regenera) nem 'proficiency' (fluxo próprio de
                    destravamento da trilha inteira). */}
                {selection.target === 'lesson' ? (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => void handleAdvanceToNextLesson()}
                      startIcon={<PlayCircleIcon />}
                    >
                      {t('translation:challenge.nextLessonButton')}
                    </Button>
                    <Button
                      variant="outlined"
                      color="secondary"
                      onClick={() => void handleRegenerate()}
                      disabled={regenerating || generateRunning}
                      startIcon={regenerating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
                    >
                      {t('translation:challenge.generateNewAfterPass')}
                    </Button>
                  </Stack>
                ) : null}
              </Stack>
            ) : null}

            {concluded === 'timeout' ? (
              <Alert severity="warning">{t('translation:challenge.timedOutAnnounce')}</Alert>
            ) : null}

            {result && !result.passed ? (
              <Alert severity="error" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {/* ONDA 1 (checks por teste): razão PARCIAL (N de M) + checklist
                    individual — o veredito não é tudo-ou-nada; o aluno vê o que
                    passou e o que falta antes da próxima tentativa. Sem checks
                    (erro de sintaxe etc.) a razão some — a saída fala por si. */}
                {result.checks.length > 0 ? (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'inherit' }}>
                      {tI('challenge.partialCount', { passed: result.passedCount, total: result.totalCount })}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>
                      {t('translation:challenge.checksTitle')}
                    </Typography>
                    <List dense disablePadding>
                      {result.checks.map((c, i) => (
                        <ListItem key={i} disableGutters dense sx={{ py: 0 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            {c.passed ? (
                              <CheckCircleIcon fontSize="small" color="success" />
                            ) : (
                              <CancelIcon fontSize="small" color="error" />
                            )}
                          </ListItemIcon>
                          <ListItemText
                            primary={c.name}
                            slotProps={{ primary: { variant: 'body2', sx: { fontFamily: 'inherit' } } }}
                          />
                        </ListItem>
                      ))}
                    </List>
                    </Box>
                  </Box>
                ) : null}
                <Box component="pre" sx={{ m: 0, mt: 1, maxHeight: 200, overflowY: 'auto' }}>
                  {result.output.slice(0, 4000)}
                </Box>
              </Alert>
            ) : null}

            {submissionError ? <Alert severity="error">{submissionError}</Alert> : null}

            {/* Nunca-repetir: qualquer NÃO-aprovação (falhou OU timeout) →
                erro + botão de NOVO desafio. Veredito parcial (passou alguns
                testes) também conta como não-aprovação: só passed=true aprova.
                ONDA2 (error-flow): para target 'lesson' este botão NÃO chega a
                renderizar — o painel FECHA no submit falho e a regeneração
                migrou para a bolha de erro no chat da aula. Aqui ele segue
                para a proficiência. ADITIVO (rodada 9): desafios de MÓDULO são
                autorais — a regeneração é por AULA, então não aparece para
                target 'module'. */}
            {selection.target !== 'module' && (concluded === 'failed' || concluded === 'timeout') ? (
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => void handleRegenerate()}
                // ONDA3 (generate-flow): o gating também cobre o processo
                // GLOBAL em voo (o modal pode estar rodando mesmo se este
                // painel montou depois do disparo).
                disabled={regenerating || generateRunning}
                startIcon={regenerating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
              >
                {t('translation:challenge.regenerateButton')}
              </Button>
            ) : null}

            {concluded === 'passed' && selection.target === 'proficiency' ? (
              <Alert severity="info">{t('translation:challenge.proficiencyPassed')}</Alert>
            ) : null}
          </>
        ) : null}
      </Stack>
    </Box>
  );
}
