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
 *      testes nunca aparecem na UI).
 *   3. VEREDITO — passou: confete + mark 'passed' (estrelas/duração) via
 *      study:mark-challenge-attempt; errou: o ERRO é apresentado + botão
 *      "Gerar novo desafio" — a LLM vê TODOS os desafios que o aluno errou
 *      naquela aula e não repete nenhum (nunca-repetir da rodada 8).
 *
 * A proficiência usa o MESMO painel (target 'proficiency'); ao passar, o main
 * grava o veredito e destrava a trilha inteira.
 */
import ReactMarkdown from 'react-markdown';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { getApi } from '../../lib/apiBridge';
import { fireConfetti } from '../../lib/confetti';
import { createStarTracker, formatClock, type StarTracker } from '../../lib/challengeStars';
import { CodeMirrorField } from '../../components/cm/CodeMirrorField';
import type {
  TrackChallengeSpec,
  TrackSubmitResult,
} from '../../../shared/ipc-contract';
import type { TrackChallengeNavSelection } from '../../lib/challengeNav';

function MarkdownComponents() {
  return {
    pre: ({ children }: { children?: ReactNode }) => (
      <Box
        component="pre"
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          bgcolor: 'action.hover',
          borderRadius: 1,
          p: 1,
          overflowX: 'auto',
          fontSize: '0.8125rem',
          m: 0,
        }}
      >
        {children}
      </Box>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <Box
        component="code"
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          fontSize: '0.8125rem',
        }}
      >
        {children}
      </Box>
    ),
  };
}

export function TrackChallengePanel({ selection }: { selection: TrackChallengeNavSelection }): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );

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
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TrackSubmitResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Regeneração (nunca-repetir).
  const [regenerating, setRegenerating] = useState(false);

  const markedRef = useRef<string | null>(null);

  const loadSpec = useCallback(
    (sel: TrackChallengeNavSelection): void => {
      setLoading(true);
      setLoadError(null);
      let cancelled = false;
      const req =
        sel.target === 'proficiency'
          ? { trackSlug: sel.trackSlug, target: 'proficiency' as const, challengeId: sel.challengeId }
          : { trackSlug: sel.trackSlug, target: 'lesson' as const, lessonId: sel.lessonId, challengeId: sel.challengeId };
      const call = sel.target === 'proficiency' ? getApi().track.proficiency : getApi().track.challenge;
      call(req)
        .then((res) => {
          if (cancelled) return;
          if (res.ok === false) {
            setLoadError(res.error);
            return;
          }
          if (!res.challenge) {
            setLoadError(tI('challenge.trackNotFound'));
            return;
          }
          setSpec(res.challenge);
          setCode(res.challenge.starterCode);
          setStarted(false);
          setElapsedMs(0);
          setStarsLeft(3);
          setConcluded(null);
          setResult(null);
          setSubmissionError(null);
          markedRef.current = null;
        })
        .catch((err: unknown) => {
          if (!cancelled) setLoadError(String(err));
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
  }, [selection.trackSlug, selection.challengeId, selection.target, selection.lessonId]);

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

  // Troca de desafio sem concluir → abandoned.
  useEffect(() => {
    return () => {
      if (started && !concluded && spec) {
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
      const payload = {
        trackSlug: selection.trackSlug,
        target: selection.target,
        lessonId: selection.target === 'lesson' ? selection.lessonId : undefined,
        challengeId: spec.slug,
        code,
        ...(selection.target === 'proficiency' ? { stars: starsLeft } : {}),
      };
      const res = await getApi().track.challengeSubmit(payload as never);
      if (res.ok) {
        setResult(res);
        if (res.passed) {
          setConcluded('passed');
          fireConfetti();
          markAttempt('passed', starsLeft, Date.now() - startTsRef.current);
        } else {
          setConcluded('failed');
          markAttempt('failed', starsLeft, Date.now() - startTsRef.current);
        }
      } else {
        setSubmissionError(res.error?.message ?? 'erro ao testar');
      }
    } catch (err) {
      setSubmissionError(String(err));
    } finally {
      setRunning(false);
    }
  }, [spec, started, running, concluded, selection, code, starsLeft, markAttempt]);

  /** Regenera o desafio: a LLM vê os erros do aluno nesta aula e não repete. */
  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!spec || regenerating) return;
    setRegenerating(true);
    try {
      const res = await getApi().track.challengeRegenerate({
        trackSlug: selection.trackSlug,
        lessonId: selection.lessonId ?? selection.challengeId,
      });
      if (res.ok && res.challenge) {
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
        setSubmissionError(res.error?.message ?? 'não foi possível gerar um novo desafio');
      }
    } catch (err) {
      setSubmissionError(String(err));
    } finally {
      setRegenerating(false);
    }
  }, [spec, regenerating, selection.trackSlug, selection.lessonId, selection.challengeId]);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadError || !spec) {
    return (
      <Box sx={{ p: 2, maxWidth: 720, mx: 'auto', pt: 4 }}>
        <Alert severity="error">{loadError ?? t('translation:challenge.trackNotFound')}</Alert>
      </Box>
    );
  }

  const clock = formatClock(Math.max(0, spec.timeLimitMs - elapsedMs));
  const canSubmit = started && !concluded && !running && code.trim().length > 0;

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
          <ReactMarkdown components={MarkdownComponents()}>{spec.statement}</ReactMarkdown>
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

            {/* Ato 2: editor (autocomplete OFF) + testar. */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {t('translation:challenge.editorLabel')}
              </Typography>
              <CodeMirrorField
                value={code}
                onChange={setCode}
                filename="solution.mjs"
                ariaLabel={t('translation:challenge.editorLabel')}
                readOnly={concluded !== null}
              />
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
              <Alert severity="success">{tI('challenge.passedAnnounce', { stars: starsLeft })}</Alert>
            ) : null}

            {concluded === 'timeout' ? (
              <Alert severity="warning">{t('translation:challenge.timedOutAnnounce')}</Alert>
            ) : null}

            {result && !result.passed ? (
              <Alert severity="error" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {tI('challenge.failedSummary', { testsRun: result.testsRun, expected: result.expectedTests })}
                <Box component="pre" sx={{ m: 0, mt: 1, maxHeight: 200, overflowY: 'auto' }}>
                  {result.output.slice(0, 4000)}
                </Box>
              </Alert>
            ) : null}

            {submissionError ? <Alert severity="error">{submissionError}</Alert> : null}

            {/* Nunca-repetir: errou → erro + botão de NOVO desafio. */}
            {concluded === 'failed' ? (
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => void handleRegenerate()}
                disabled={regenerating}
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
