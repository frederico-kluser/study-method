/**
 * src/views/ChallengeView/ChallengeView.tsx — a tela de Desafio (editor + testes
 * + feedback do pi coding agent). CHROME MUI v9 (path imports, mobile-first,
 * a11y); TODA a lógica de canais/fluxos é preservada intacta.
 *
 * Duas fontes de desafio:
 *  (a) um desafio selecionado via contexto (ChallengeNav — vindo da Aula);
 *  (b) a lista `study.listChallenges({})` (usa o último setup); se vazia,
 *      mostra um erro claro ("gere uma aula primeiro").
 *
 * Layout (decisão: painéis EMPILHADOS — mobile-first robusto; ver handoff):
 *  - Stack vertical: enunciado (Paper + react-markdown), depois o editor
 *    (FileExplorer + EditorPane dentro de Paper com borda) e por fim a saída
 *    (AnswerTerminal xterm em Paper + feedback streamado) com os botões.
 *
 * Botão "Testar resposta":
 *  1. fase determinística — `study.testAnswer({challengeDir: workspaceDir})`
 *     + `onTestAnswerEvent` (started/done) + banner PASS/FAIL (verde/vermelho);
 *  2. fase pi — monta o prompt (lib pura) e `pi.execute` com
 *     `additionalContext` = código atual + saída determinística; streama
 *     events (text/thinking/tool) num painel colapsável; guarda sessionId em
 *     status_change p/ abort; ao final mostra PiExecuteResult.output.
 *
 * Regras de UI pt-BR: veredito factual, sem bajulação automática (C-12 — o
 * feedback VEM do pi; a UI apenas não distorce).
 *
 * ONDA 5 (mark terminal — nunca-repetir): `markChallengeAttempt` é chamado SÓ
 * em eventos TERMINAIS — passou nos testes → 'passed' (estrelas + duração);
 * tempo esgotado sem passar → 'timeout'; troca de desafio sem concluir →
 * 'abandoned' (captura ANTES de trocar: picker, contexto de aula e a guarda de
 * identidade de runTests). NUNCA no primeiro teste falho. Decisão pura em
 * src/lib/answerFlow.ts (shouldMarkAttempt); após cada mark bem-sucedido a
 * lista de desafios é RE-BUSCADA (o filtro nunca-repetir esconde o desafio
 * tentado).
 */
import ReactMarkdown from 'react-markdown';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BlockIcon from '@mui/icons-material/Block';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MemoryIcon from '@mui/icons-material/Memory';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import TimerIcon from '@mui/icons-material/Timer';
import type {
  ChallengeInfo,
  MarkChallengeAttemptRequest,
  MarkChallengeAttemptResult,
  PiExecuteResult,
  PiStreamEvent,
  TestAnswerResult,
  WorkspaceFile,
} from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import {
  buildPiFeedbackPrompt,
  digestStudyMethodRules,
} from '../../lib/piFeedbackPrompt';
import { resolveFeedbackProvider } from '../../lib/feedbackProvider';
import { feedbackProviderChipKey } from '../../lib/feedbackProviderUi';
import { mapTestAnswerPhase } from '../../lib/testAnswerEvents';
import { useChallengeNav } from '../../lib/challengeNav';
import { TrackChallengePanel } from './TrackChallengePanel';
import {
  createStarTracker,
  formatClock,
  isStillCurrent,
  starLossI18nKey,
  timeLimitForDifficulty,
  INITIAL_STARS,
  type StarLossI18nKey,
  type StarTracker,
} from '../../lib/challengeStars';
import { announceStatus, fireConfetti } from '../../lib/confetti';
import { resolveChallengeSlug, shouldMarkAttempt, type MarkAttemptVerdict } from '../../lib/answerFlow';
import { katexRemarkPlugins, katexRehypePlugins, escapeLoneDollarSigns } from '../../lib/lessonMarkdown';
import { AnswerTerminal, printTestBanner, type AnswerTerminalHandle } from '../../components/terminal/AnswerTerminal';
import { FileExplorer } from '../../components/editor/FileExplorer';
import { EditorPane, type EditorPaneHandle } from '../../components/editor/EditorPane';

type TestRunStatus = 'idle' | 'running' | 'done' | 'error';
type PiStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted';

/** Faz o cast para o payload de runtime (ver nota sobre ApiSchema). */
type TestArgs = { challengeDir: string };
type ReadArgs = { workspaceDir: string; path: string };
type ListChallengesArgs = { setupRoot?: string } | Record<string, never>;

/** Fases de streaming do pi exibidas como blocos no painel de feedback. */
interface StreamingBlock {
  kind: 'thinking' | 'text' | 'tool' | 'error';
  text: string;
}

/** Components custom do react-markdown do enunciado (monospace). */
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
        }}
      >
        {children}
      </Box>
    ),
    code: (props: { children?: ReactNode; className?: string }) => (
      <Box
        component="code"
        {...props}
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          fontSize: '0.8125rem',
          bgcolor: 'action.hover',
          borderRadius: 0.5,
          px: 0.25,
        }}
      />
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
  };
}

export default function ChallengeView(): ReactElement {
  const { t } = useTranslation();
  const nav = useChallengeNav();

  // RODADA 8 (trilhas): quando há um desafio de TRILHA selecionado (aula ou
  // proficiência), o fluxo é o TrackChallengePanel — o aluno NÃO gera aula e o
  // desafio vem da trilha (enunciado → Começar → editor → testar → veredito →
  // "Gerar novo desafio" com nunca-repetir). O fluxo legado (workspace da
  // geração) continua intacto abaixo para compatibilidade.
  if (nav.trackChallenge) {
    return <TrackChallengePanel selection={nav.trackChallenge} />;
  }

  // t() com interpolação: o t() strict-typed desta base (src/i18n/i18next.d.ts)
  // rejeita options porque os valores dos JSONs chegam como `string` (não
  // template literals) — o InterpolationMap não resolve, e NENHUMA chave
  // interpolada é chamada hoje. O RUNTIME interpola normal (verificado em
  // tests/i18n-resources.test.ts) — cast local e documentado para as mensagens
  // com contagem (anúncios passou/falhou e aria-labels de estrelas/tempo).
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;

  // Estado da listagem e do desafio ativo.
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([]);
  const [listing, setListing] = useState<'idle' | 'loading' | 'error'>('idle');
  const [listError, setListError] = useState('');
  // Desafio ativo (do contexto OU selecionado da lista).
  const [active, setActive] = useState<ChallengeInfo | null>(nav.selectedChallenge);

  // Workspace: arquivos + enunciado.
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [statement, setStatement] = useState('');
  const [statementError, setStatementError] = useState('');

  // Terminal de saída determinística (ref imperativa).
  const termRef = useRef<AnswerTerminalHandle | null>(null);
  // Handle do EditorPane (para FileExplorer abrir/criar/excluir).
  const editorRef = useRef<EditorPaneHandle | null>(null);

  // Estado da fase determinística.
  const [testStatus, setTestStatus] = useState<TestRunStatus>('idle');
  const [testResult, setTestResult] = useState<TestAnswerResult | null>(null);

  // Estrelas + cronômetro do desafio (pedido do dono do produto; máquina pura
  // em src/lib/challengeStars.ts — SÓ estrelas, sem gamificação extra).
  const [starsLeft, setStarsLeft] = useState(INITIAL_STARS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const trackerRef = useRef<StarTracker | null>(null);
  const startTsRef = useRef(0);
  const lastEventCountRef = useRef(0);
  const timedOutRef = useRef(false);
  const concludedRef = useRef(false);

  // ONDA5 (mark terminal — nunca-repetir): o id do ÚLTIMO desafio com tentativa
  // JÁ marcada (key `${challengeId}:${workspaceDir}`). Idempotência POR
  // DESAFIO: guardas baseadas em key (não em boolean) sobrevivem à troca A→B —
  // marcar 'abandoned' de A não impede o 'timeout' de B.
  const markedForKeyRef = useRef<string | null>(null);
  // Desafio ativo "mais recente" (rewrite a cada render — mesmo padrão do
  // activeKeyRef) para o tick/timeout marcar com o desafio certo.
  const activeRef = useRef<ChallengeInfo | null>(null);
  activeRef.current = active;

  // Estado da fase pi.
  const [piStatus, setPiStatus] = useState<PiStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [blocks, setBlocks] = useState<StreamingBlock[]>([]);
  const [piFinal, setPiFinal] = useState<string>('');
  const [piError, setPiError] = useState('');
  // Provedor que executou a última fase de feedback ('local' | 'deepseek').
  const [feedbackProvider, setFeedbackProvider] = useState<'local' | 'deepseek' | null>(null);

  // Path do arquivo de código "principal" do workspace (para o pi ver o stub).
  const primaryCodePath = useMemo(() => {
    const candidates = files.filter(
      (f) => !f.dir && /\.(py|js|ts|jsx|tsx|go|rs|c|rb|sql)$/i.test(f.path),
    );
    return candidates.length ? candidates[0].path : '';
  }, [files]);

  /**
   * Quando o contexto muda (aula → desafio), sincroniza o desafio ativo e
   * recarrega o workspace. ONDA5: TROCA DE DESAFIO SEM CONCLUIR é evento
   * TERMINAL — marca 'abandoned' do desafio ANTERIOR ANTES de trocar
   * (captura `active` do render anterior; a guarda de identidade em runTests
   * descarta o resultado em voo — o mark aqui é a captura antecipada).
   */
  useEffect(() => {
    if (nav.selectedChallenge) {
      const newKey = `${nav.selectedChallenge.challengeId}:${nav.selectedChallenge.workspaceDir}`;
      if (active && activeKey && activeKey !== newKey) {
        const verdict = shouldMarkAttempt({
          event: 'switched',
          alreadyMarked: markedForKeyRef.current === activeKey,
          concluded: concludedRef.current,
          timedOut: timedOutRef.current,
        });
        if (verdict) {
          markAttempt(
            active,
            verdict,
            trackerRef.current?.stars() ?? INITIAL_STARS,
            Date.now() - startTsRef.current,
          );
        }
      }
      setActive(nav.selectedChallenge);
    }
  }, [nav.selectedChallenge, nav.version]);

  // Carrega a lista quando não há desafio selecionado.
  const loadChallenges = useCallback(async (): Promise<void> => {
    setListing('loading');
    setListError('');
    try {
      const api = getApi();
      // Fix15-list-challenges: passa setupRoot explícito (do contexto, vindo do
      // generateLesson na LessonView) quando disponível; senão deixa o main usar
      // o fallback memory.lastSetupRoot. O `{}` preserva o contrato sem args.
      const args: ListChallengesArgs = nav.lastSetupRoot
        ? { setupRoot: nav.lastSetupRoot }
        : {};
      const list = await (api.study.listChallenges as (
        args?: ListChallengesArgs,
      ) => Promise<ChallengeInfo[]>)(args);
      setChallenges(list);
      if (list.length === 0) {
        setListing('error');
        setListError(t('translation:challenge.noChallengesEmpty'));
      } else {
        setListing('idle');
      }
    } catch (err) {
      setListing('error');
      setListError(`${t('translation:challenge.listError')}: ${String(err)}`);
    }
  }, [nav.lastSetupRoot]);

  /**
   * ONDA5 — marca UMA tentativa terminal do desafio (nunca-repetir). Só
   * eventos TERMINAIS chamam (verificado por `shouldMarkAttempt`): passou nos
   * testes → 'passed'; tempo esgotado → 'timeout'; troca sem concluir →
   * 'abandoned'. NUNCA no primeiro teste falho. Idempotente por desafio
   * (markedForKeyRef). Após ok:true, RE-BUSCA a lista de desafios — o filtro
   * nunca-repetir deve sumir com o desafio tentado da seleção.
   */
  const markAttempt = useCallback(
    (ch: ChallengeInfo, verdict: MarkAttemptVerdict, stars: number, durationMs: number): void => {
      const key = `${ch.challengeId}:${ch.workspaceDir}`;
      markedForKeyRef.current = key; // registra ANTES do invoke (idempotência)
      const api = getApi();
      void (api.study.markChallengeAttempt as (
        input: MarkChallengeAttemptRequest,
      ) => Promise<MarkChallengeAttemptResult>)({
        // subjectId quando o desafio o expõe (onda 4 — fluxo normal com repo);
        // sem ele o handler responde ok:false — a UI segue (defensivo).
        ...(ch.subjectId ? { subjectId: ch.subjectId } : {}),
        challengeId: resolveChallengeSlug(ch),
        verdict,
        stars,
        durationMs,
      })
        .then((res) => {
          if (res.ok) void loadChallenges();
        })
        .catch(() => {
          // Defensivo: falha de persistência nunca quebra o fluxo do desafio.
        });
    },
    [loadChallenges],
  );

  // Carrega arquivos + enunciado do desafio ativo.
  const loadWorkspace = useCallback(async (ch: ChallengeInfo): Promise<void> => {
    setStatement('');
    setStatementError('');
    setFiles([]);
    setTestResult(null);
    setBlocks([]);
    setPiFinal('');
    setPiError('');
    setPiStatus('idle');
    setFeedbackProvider(null);
    setTestStatus('idle');
    try {
      const api = getApi();
      // README:
      try {
        const readme = await (api.study.readWorkspaceFile as (a: ReadArgs) => Promise<string>)(
          { workspaceDir: ch.workspaceDir, path: 'README.md' },
        );
        setStatement(readme);
      } catch {
        setStatementError(t('translation:challenge.statementUnavailable'));
      }
      // Arquivos:
      const wsFiles = await (api.study.listWorkspaceFiles as (a: { workspaceDir: string }) => Promise<WorkspaceFile[]>)({
        workspaceDir: ch.workspaceDir,
      });
      setFiles(wsFiles);
    } catch (err) {
      setStatementError(`${t('translation:challenge.workspaceLoadError')}: ${String(err)}`);
    }
  }, []);

  useEffect(() => {
    if (active) void loadWorkspace(active);
  }, [active, loadWorkspace]);

  // Limite de tempo do desafio ativo: T = 90s + difficulty*60s (sem difficulty
  // exposta → fallback 300s documentado em timeLimitForDifficulty).
  const timeLimitMs = useMemo(
    () => timeLimitForDifficulty(active ? active.difficulty : undefined),
    [active],
  );

  // KEY do desafio ativo: trocar de desafio RESETA estrelas + cronômetro.
  const activeKey = active ? `${active.challengeId}:${active.workspaceDir}` : null;

  // Guarda de identidade do teste em voo (corrida cross-desafio): ref com a key
  // do desafio ATUAL, reescrito a CADA render. A continuação do `await
  // testAnswer` lê ESTE ref — o `active` capturado no closure do useCallback
  // fica stale (a promise em voo segura o closure antigo, do desafio que
  // começou o teste). Reescrito no corpo do render (não em useEffect) de
  // propósito: effects passivos são agendados de forma assíncrona e podem rodar
  // DEPOIS da microtask do resultado — a janela da corrida voltaria a abrir.
  const activeKeyRef = useRef<string | null>(null);
  activeKeyRef.current = activeKey;

  // Reset da máquina de estrelas e do cronômetro ao (des)montar um desafio.
  useEffect(() => {
    trackerRef.current = active
      ? createStarTracker({ timeLimitMs: timeLimitForDifficulty(active.difficulty) })
      : null;
    setStarsLeft(INITIAL_STARS);
    setElapsedMs(0);
    setTimedOut(false);
    timedOutRef.current = false;
    concludedRef.current = false;
    lastEventCountRef.current = 0;
    startTsRef.current = Date.now();
  }, [activeKey, active]);

  // Tick do cronômetro (1s) + listeners de perda de foco (blur/visibility).
  // Registrados por desafio ativo; removidos ao desmontar (sem vazamento).
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!activeKey || !tracker) return undefined;

    const syncStars = (): void => setStarsLeft(tracker.stars());

    // Anuncia perdas NOVAS do log (decaimento por demora no tick; foco). A
    // perda por resposta errada fica fora: o anúncio do resultado cobre.
    const announceNewLosses = (): void => {
      const events = tracker.getEvents();
      const fresh = events.slice(lastEventCountRef.current);
      lastEventCountRef.current = events.length;
      const texts = fresh
        .map((e) => starLossI18nKey(e.cause))
        .filter((k): k is StarLossI18nKey => k !== null)
        .map((k) => t(`translation:${k}`));
      if (texts.length > 0) announceStatus(texts.join(' '));
    };

    const handleBlur = (): void => {
      if (concludedRef.current) return; // desafio concluído: estrelas travadas
      tracker.onBlur();
      syncStars();
      announceNewLosses();
    };
    const handleVisibilityChange = (): void => {
      if (document.hidden) handleBlur();
    };

    const tick = (): void => {
      if (concludedRef.current) return; // relógio congelado após concluir
      const elapsed = Date.now() - startTsRef.current;
      setElapsedMs(elapsed);
      tracker.onTick(elapsed);
      syncStars();
      announceNewLosses();
      if (tracker.isTimedOut(elapsed) && !timedOutRef.current) {
        timedOutRef.current = true;
        tracker.onTimeout();
        syncStars();
        announceNewLosses();
        setTimedOut(true);
        // ONDA5 mark TERMINAL: tempo esgotou SEM passar → 'timeout' (só se o
        // desafio não foi concluído nem já marcado — 1ª tentativa terminal
        // vence). O tick só chega aqui com concludedRef false (early return).
        const key = activeKeyRef.current;
        const verdict = shouldMarkAttempt({
          event: 'timed-out',
          alreadyMarked: markedForKeyRef.current === key,
          concluded: concludedRef.current,
          timedOut: true,
        });
        if (verdict && activeRef.current) {
          markAttempt(
            activeRef.current,
            verdict,
            trackerRef.current?.stars() ?? INITIAL_STARS,
            elapsed,
          );
        }
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = window.setInterval(tick, 1000);
    tick(); // primeiro tique imediato (sincroniza o display)

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [activeKey, markAttempt, t]);

  // Ao montar: se veio com desafio do contexto, já está setado; senão lista.
  // Fix15c-review: dispara também quando `lastSetupRoot` muda (loadChallenges é
  // useCallback estável que só troca de identidade quando o root muda) — assim a
  // lista recarrega com o setup novo mesmo com a view montada. Sem loop:
  // listChallenges não altera o root, então a dep é estável.
  useEffect(() => {
    if (!nav.selectedChallenge) void loadChallenges();
  }, [nav.selectedChallenge, loadChallenges]);

  /**
   * Assina o canal de eventos dos testes (main push). Mantido estável e vazio
   * — a ChallengeView usa o retorno direto de testAnswer para o resultado e o
   * evento started/done apenas para refletir progresso no status.
   */
  useEffect(() => {
    const api = getApi();
    let stop: (() => void) | undefined;
    try {
      stop = api.study.onTestAnswerEvent((raw: unknown) => {
        const phase = mapTestAnswerPhase(raw);
        if (phase === 'started') setTestStatus('running');
        else if (phase === 'done') setTestStatus('done');
        // null → não muda o status (evento desconhecido/irrelevante).
      });
    } catch {
      stop = undefined;
    }
    return () => stop?.();
  }, []);

  /**
   * Fase determinística dos testes. Retorna true quando o resultado foi aplicado
   * ao desafio ativo; false quando o resultado foi DESCARTADO (o desafio mudou
   * enquanto o teste rodava) — o chamador não deve seguir para a fase pi.
   */
  const runTests = useCallback(async (): Promise<boolean> => {
    if (!active) return false;
    // Identidade do desafio no momento em que o teste COMEÇA: o resultado só
    // pode ser aplicado se este desafio ainda for o ativo quando voltar.
    const startedKey = activeKey;
    setTestStatus('running');
    setPiStatus('idle');
    setBlocks([]);
    setPiFinal('');
    setPiError('');
    try {
      const api = getApi();
      const result = (await (api.study.testAnswer as (
        args: TestArgs,
      ) => Promise<TestAnswerResult>)({ challengeDir: active.workspaceDir })) as TestAnswerResult;
      // GUARDA DE CORRIDA CROSS-DESAFIO: o usuário trocou de desafio (picker ou
      // contexto de aula) enquanto o teste rodava? O resultado pertence ao
      // desafio que COMEÇOU o teste — se não é mais o ativo, descarta TUDO:
      // sem setTestResult, sem banner, sem onWrongAnswer, sem confete, sem
      // concluir/concludedRef, sem anúncio (o tracker de B não pode ser
      // atingido por um teste de A; o confete não pode explodir na tela de B;
      // o anúncio não pode usar os números de A). Sem nenhum write de estado:
      // a troca de desafio já resetou status/resultado via loadWorkspace.
      if (!isStillCurrent(startedKey, activeKeyRef.current)) {
        // ONDA5: o resultado em voo pertence ao desafio que COMEÇOU o teste (o
        // closure ainda o carrega) — a troca sem concluir já marcou
        // 'abandoned' no efeito de contexto/picker (captura antes de trocar);
        // este mark é a REDE DE SEGURANÇA idempotente para qualquer caminho
        // que troque o ativo sem passar por eles (nunca duplica: o mark do
        // caminho original já registrou markedForKeyRef).
        const verdict = shouldMarkAttempt({
          event: 'switched',
          alreadyMarked: markedForKeyRef.current === startedKey,
          concluded: concludedRef.current,
          timedOut: timedOutRef.current,
        });
        if (verdict) {
          markAttempt(
            active,
            verdict,
            trackerRef.current?.stars() ?? INITIAL_STARS,
            Date.now() - startTsRef.current,
          );
        }
        return false;
      }
      setTestResult(result);
      setTestStatus('done');
      if (termRef.current) {
        printTestBanner(termRef.current, {
          passed: result.passed,
          testsRun: result.testsRun,
          expectedTests: result.expectedTests,
          output: result.output,
        });
      }
      // Veredito + estrelas (docs/ux-redesign.md §8): passou → rajada curta de
      // confete + anúncio específico (NUNCA "Parabéns!" ritualizado); falhou →
      // perde 1 estrela e o anúncio aponta o caso que falhou. O banner do
      // terminal continua como está.
      if (result.passed) {
        concludedRef.current = true;
        const durationMs = Date.now() - startTsRef.current;
        setElapsedMs(durationMs);
        fireConfetti();
        announceStatus(
          tI('translation:challenge.announcePassed', {
            testsRun: result.testsRun,
            expectedTests: result.expectedTests,
          }),
        );
        // ONDA5 mark TERMINAL: passou nos testes → 'passed' (estrelas do
        // tracker + duração real; o relógio congelou em concludedRef).
        const passKey = activeKeyRef.current;
        const passVerdict = shouldMarkAttempt({
          event: 'tests-passed',
          alreadyMarked: markedForKeyRef.current === passKey,
          concluded: true,
          timedOut: timedOutRef.current,
        });
        if (passVerdict && activeRef.current) {
          markAttempt(
            activeRef.current,
            passVerdict,
            trackerRef.current?.stars() ?? INITIAL_STARS,
            durationMs,
          );
        }
      } else {
        trackerRef.current?.onWrongAnswer();
        setStarsLeft(trackerRef.current?.stars() ?? INITIAL_STARS);
        // Descarta o evento de estrela do log (o anúncio abaixo já cobre) —
        // o próximo tick não anuncia a perda em duplicado.
        if (trackerRef.current) {
          lastEventCountRef.current = trackerRef.current.getEvents().length;
        }
        announceStatus(
          tI('translation:challenge.announceFailed', {
            testsRun: result.testsRun,
            expectedTests: result.expectedTests,
          }),
        );
      }
      return true;
    } catch (err) {
      setTestStatus('error');
      setTestResult(null);
      termRef.current?.writeLine(`Erro na fase determinística: ${String(err)}`, 'red');
      // Mantém o fluxo atual: erro da fase determinística não aborta a fase pi.
      return true;
    }
  }, [active, activeKey, markAttempt, t]);

  /** Assina os eventos do pi (stream) e guarda o unsubscribe. */
  const streamStopRef = useRef<(() => void) | undefined>(undefined);

  const handlePiStreamEvent = useCallback((ev: PiStreamEvent): void => {
    switch (ev.type) {
      case 'status_change':
        // Guarda o sessionId em ev.data (starting e running carregam o id — ver
        // BLOCK 2). DEFENSIVO: só seta se ainda não está setado; assim o último
        // status_change não sobrescreve o id já capturado (o abort usa sessionId).
        if (typeof ev.data === 'string' && ev.data) {
          setSessionId((prev) => prev ?? ev.data);
        }
        break;
      case 'thinking_delta':
        setBlocks((b) => appendDelta(b, 'thinking', ev.data ?? ''));
        break;
      case 'text_delta':
        setBlocks((b) => appendDelta(b, 'text', ev.data ?? ''));
        break;
      case 'tool_start':
        setBlocks((b) => [...b, { kind: 'tool', text: `⚙ ${ev.toolName}` }]);
        break;
      case 'tool_end':
        setBlocks((b) => [...b, { kind: 'tool', text: `✓ ${ev.toolName} ${t('translation:challenge.toolOk')}` }]);
        break;
      case 'error':
        setBlocks((b) => [...b, { kind: 'error', text: String(ev.data) }]);
        break;
      default:
        break;
    }
  }, [t]);

  /** Fase de feedback — decide o provedor e executa (pi DeepSeek OU modelo local). */
  const runPi = useCallback(async (): Promise<void> => {
    if (!active) return;
    setPiStatus('running');
    setPiError('');
    setBlocks([]);
    setSessionId(null);
    setFeedbackProvider(null);
    const api = getApi();

    // Monta o código real do aluno (código do arquivo principal do workspace)
    // + saída determinística para o contexto do avaliador.
    let studentCode = '';
    if (primaryCodePath) {
      try {
        studentCode = await (api.study.readWorkspaceFile as (a: ReadArgs) => Promise<string>)({
          workspaceDir: active.workspaceDir,
          path: primaryCodePath,
        });
      } catch {
        studentCode = `(não consegui ler ${primaryCodePath})`;
      }
    }
    const testOut = testResult?.output ?? '';

    const prompt = buildPiFeedbackPrompt({
      subject: active?.concept,
      statement,
      studentCode: (primaryCodePath ? studentCode : ''),
      testOutput: testOut,
      language: active?.language ?? '',
    });

    // DECISÃO DE PROVEDOR (função pura, testada): o modelo local só avalia quando
    // o usuário selecionou 'local' nas Configurações E há um modelo local ativo.
    let provider: 'local' | 'deepseek' = 'deepseek';
    try {
      const [settings, activeModel] = await Promise.all([
        api.settings.get().catch(() => ({}) as { defaultModelProvider?: 'deepseek' | 'local' }),
        (api.localAi.getActive as () => Promise<string | null>)().catch(() => null),
      ]);
      provider = resolveFeedbackProvider({
        defaultModelProvider: settings?.defaultModelProvider,
        activeLocalModelId: activeModel ?? null,
      });
    } catch {
      provider = 'deepseek'; // defensivo: nunca impede o feedback por falha de leitura.
    }
    setFeedbackProvider(provider);

    // Provedor LOCAL: inferência de bloco único (sem streaming) do modelo local.
    if (provider === 'local') {
      try {
        const activeId = await (api.localAi.getActive as () => Promise<string | null>)();
        const result = await (api.localAi.chat as (req: {
          modelId?: string;
          prompt: string;
        }) => Promise<{ text: string }>)({
          modelId: activeId ?? undefined,
          prompt,
        });
        setPiFinal(result.text ?? '');
        setPiStatus('done');
      } catch (err) {
        // FALHA DO LOCAL — NÃO chamamos o pi de novo automaticamente: mostramos o
        // erro e uma dica clara para voltar ao avaliaador remoto/ativo o local.
        setPiStatus('error');
        setPiError(
          `${t('translation:challenge.localModelError')}: ${String(err)}. ` +
            t('translation:challenge.localModelHint'),
        );
      }
      return;
    }

    // Provedor DEEPSEEK — pi coding agent com streaming/abort (fluxo histórico).
    try {
      // Assina o stream ANTES de executar.
      streamStopRef.current?.();
      streamStopRef.current = api.pi.onStreamEvent(handlePiStreamEvent);

      const result = (await api.pi.execute({
        prompt,
        workingDirectory: active.workspaceDir,
        modelConfig: { provider: 'deepseek', model: 'deepseek-v4-flash' },
        skillSystemPrompt: digestStudyMethodRules(),
        additionalContext:
          (primaryCodePath ? `\n[arquivo ${primaryCodePath}]\n\`\`\`\n${studentCode}\n\`\`\`\n` : '') +
          `\n[resultado dos testes determinísticos]\n${testOut || '(sem saída)'}\n`,
      })) as PiExecuteResult;

      setPiFinal(result.output ?? '');
      if (!result.success) {
        setPiStatus('error');
        setPiError(
          result.error?.includes('chave') || result.error?.includes('key')
            ? t('translation:challenge.piMissingKey')
            : `${t('translation:challenge.piCallError')}: ${result.error ?? t('translation:challenge.unknownError')}`,
        );
      } else {
        setPiStatus('done');
      }
      streamStopRef.current?.();
      streamStopRef.current = undefined;
    } catch (err) {
      setPiStatus('error');
      setPiError(`${t('translation:challenge.piExecuteError')}: ${String(err)}`);
      streamStopRef.current?.();
      streamStopRef.current = undefined;
    }
  }, [active, primaryCodePath, statement, testResult, handlePiStreamEvent]);

  const abortPi = useCallback((): void => {
    const api = getApi();
    const abort = api.pi.abort as (sessionId?: string) => Promise<unknown>;
    if (sessionId) {
      void abort(sessionId);
    } else {
      void abort();
    }
    setPiStatus('aborted');
    streamStopRef.current?.();
    streamStopRef.current = undefined;
  }, [sessionId]);

  /** Testar resposta: fase determinística + fase pi. */
  const testAnswerClick = useCallback((): void => {
    void (async () => {
      const applied = await runTests();
      // Resultado descartado (o desafio trocou enquanto o teste rodava): não
      // segue para a fase pi — ela avaliaria o desafio antigo na tela do novo.
      if (!applied) return;
      await runPi();
    })();
  }, [runTests, runPi]);

  // Cleanup no UNMOUNT: derruba a assinatura do stream do pi (mesmo padrão do
  // onTestAnswerEvent) — sem isto, sair da tela com o pi rodando vaza o
  // listener de pi:stream-event (WARNING 3).
  useEffect(() => {
    return () => {
      streamStopRef.current?.();
      streamStopRef.current = undefined;
    };
  }, []);

  const canTest = active && testStatus !== 'running' && piStatus !== 'running';

  // Painéis de layout conforme o estado.
  const pickChallenge = (ch: ChallengeInfo): void => {
    // ONDA5: trocar de desafio pelo picker SEM concluir o atual é evento
    // TERMINAL — marca 'abandoned' ANTES de trocar (captura o desafio anterior
    // e o estado dos refs; o picker está desabilitado em busy, então aqui o
    // teste/pi não estão em voo — a guarda de identidade de runTests cobre o
    // caminho de contexto de aula separadamente).
    const oldKey = activeKey;
    if (oldKey && oldKey !== `${ch.challengeId}:${ch.workspaceDir}`) {
      const verdict = shouldMarkAttempt({
        event: 'switched',
        alreadyMarked: markedForKeyRef.current === oldKey,
        concluded: concludedRef.current,
        timedOut: timedOutRef.current,
      });
      if (verdict && active) {
        markAttempt(
          active,
          verdict,
          trackerRef.current?.stars() ?? INITIAL_STARS,
          Date.now() - startTsRef.current,
        );
      }
    }
    setActive(ch);
    void loadWorkspace(ch);
  };

  const providerChipKey = feedbackProviderChipKey(feedbackProvider);
  const busy = testStatus === 'running' || piStatus === 'running';
  const piRunning = piStatus === 'running';

  return (
    <Box component="section" sx={{ p: { xs: 1, md: 2 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Região de status (SC 4.1.3 / docs §8): sempre no DOM, visualmente
          oculta; announceStatus() reutiliza este elemento. */}
      <Box
        component="div"
        role="status"
        aria-live="polite"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          m: -1,
          p: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />
      {/* Cabeçalho */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Typography variant="h4" component="h1">
          {t('translation:nav.challenge')}
        </Typography>
        {!nav.selectedChallenge ? (
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 } }}>
            <InputLabel id="challenge-picker-label">{t('translation:challenge.openChallenge')}</InputLabel>
            <Select
              labelId="challenge-picker-label"
              id="challenge-picker"
              label={t('translation:challenge.openChallenge')}
              value={active?.challengeId ?? ''}
              // Desabilitado durante a lista E durante o teste em voo (fase
              // determinística + pi): trocar de desafio no meio deixaria um
              // resultado de A caindo na tela de B (a guarda de identidade em
              // runTests cobre a troca por contexto de aula, que não passa
              // por aqui).
              disabled={listing === 'loading' || busy}
              onChange={(e) => {
                const ch = challenges.find((c) => c.challengeId === e.target.value);
                if (ch) pickChallenge(ch);
              }}
            >
              {listing === 'loading' ? (
                <MenuItem value="" disabled>{t('translation:common.loading')}</MenuItem>
              ) : challenges.length === 0 ? (
                <MenuItem value="">{t('translation:challenge.none')}</MenuItem>
              ) : (
                challenges.map((c) => (
                  <MenuItem key={c.challengeId} value={c.challengeId}>
                    {c.title} ({c.language})
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
        ) : null}
      </Stack>

      {/* Estrelas + cronômetro do desafio (visíveis enquanto há desafio ativo).
          3 estrelas no início; perdas por foco/tempo/resposta errada/demora
          (máquina pura em src/lib/challengeStars.ts). */}
      {active ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap', minHeight: 28 }}
        >
          <Box
            component="span"
            role="img"
            aria-label={tI('translation:challenge.starsAria', {
              current: starsLeft,
              total: INITIAL_STARS,
            })}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
          >
            {Array.from({ length: INITIAL_STARS }, (_, i) =>
              i < starsLeft ? (
                <StarIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />
              ) : (
                <StarBorderIcon key={i} fontSize="small" sx={{ color: 'action.disabled' }} />
              ),
            )}
          </Box>
          <Chip
            size="small"
            variant="outlined"
            icon={timedOut ? undefined : <TimerIcon />}
            label={
              timedOut
                ? t('translation:challenge.timedOut')
                : formatClock(Math.max(0, timeLimitMs - elapsedMs))
            }
            color={timedOut ? 'error' : 'default'}
            aria-label={
              timedOut
                ? t('translation:challenge.timedOut')
                : tI('translation:challenge.timerAria', {
                    time: formatClock(Math.max(0, timeLimitMs - elapsedMs)),
                  })
            }
          />
        </Stack>
      ) : null}

      {listing === 'error' && !active ? (
        <Alert severity="error" sx={{ mt: 1 }}>{listError}</Alert>
      ) : null}

      {!active ? (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          {t('translation:challenge.selectPrompt')}
        </Typography>
      ) : (
        <Grid container spacing={2} sx={{ mt: 0, width: '100%' }}>
          {/* ENUNCIADO */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
                  {active.title}
                </Typography>
                <Chip label={active.language} size="small" variant="outlined" />
              </Stack>
              {statementError ? (
                <Typography variant="body2" color="text.secondary">{statementError}</Typography>
              ) : statement ? (
                <Box>
                  <ReactMarkdown
                    remarkPlugins={katexRemarkPlugins()}
                    rehypePlugins={katexRehypePlugins()}
                    components={MarkdownComponents()}
                  >
                    {escapeLoneDollarSigns(statement)}
                  </ReactMarkdown>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">{t('translation:challenge.statementLoading')}</Typography>
              )}
            </Paper>
          </Grid>

          {/* EDITOR */}
          <Grid size={12}>
            <Paper
              variant="outlined"
              data-onboarding-target="challenge-editor"
              sx={{ height: { xs: 480, md: 560 }, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
                <Box sx={{ width: { xs: 200, sm: 240 }, borderRight: 1, borderColor: 'divider', overflow: 'auto' }}>
                  <FileExplorer
                    files={files}
                    activePath={null}
                    onOpenFile={(p) => editorRef.current?.openFile(p)}
                    onCreateFile={(n) => editorRef.current?.createFile(n)}
                    onDeleteFile={(p) => editorRef.current?.deleteFile(p)}
                    onRefresh={() => active && void loadWorkspace(active)}
                  />
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <EditorPane
                    // key por workspace: ao trocar de desafio o React DESMONTA/MONTA o
                    // EditorPane (reducer de abas zerado) — impede um buffer dirty do
                    // workspace A salvar no workspaceDir B (WARNING 4).
                    key={active.workspaceDir}
                    ref={editorRef}
                    workspaceDir={active.workspaceDir}
                    files={files}
                    onFilesChanged={() => active && void loadWorkspace(active)}
                  />
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* SAÍDA + FEEDBACK + BOTÕES */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1 }}>
                <Button
                  variant="contained"
                  disabled={!canTest}
                  loading={busy}
                  startIcon={!busy ? <PlayArrowIcon /> : undefined}
                  onClick={testAnswerClick}
                  data-onboarding-target="challenge-test-answer"
                  data-onboarding-signal={`test-status:${testStatus}`}
                >
                  {t('translation:challenge.testAnswer')}
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={!piRunning}
                  startIcon={<BlockIcon />}
                  onClick={abortPi}
                >
                  {t('translation:challenge.abort')}
                </Button>
              </Stack>

              {/* Seção de saída determinística */}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
                <Typography variant="subtitle2">{t('translation:challenge.output')}</Typography>
                {testStatus === 'running' ? (
                  <Chip size="small" label={t('translation:challenge.running')} color="primary" variant="outlined" />
                ) : null}
              </Stack>
              <Box sx={{ mt: 0.5, height: 220 }}>
                <Box data-onboarding-target="challenge-terminal" component="span" sx={{ display: 'contents' }}>
                  <AnswerTerminal ref={termRef} aria-label={t('translation:challenge.outputAria')} />
                </Box>
              </Box>

              {/* Seção de feedback */}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2 }}>
                <MemoryIcon fontSize="small" color="action" />
                <Typography variant="subtitle2">{t('translation:challenge.feedback')}</Typography>
                {providerChipKey ? (
                  <Chip label={t(`translation:${providerChipKey}`)} size="small" variant="outlined" color="secondary" />
                ) : null}
                {piRunning ? (
                  <Chip size="small" label={t('translation:challenge.running')} color="primary" variant="outlined" />
                ) : null}
                {piStatus === 'aborted' ? (
                  <Chip size="small" label={t('translation:challenge.aborted')} variant="outlined" />
                ) : null}
              </Stack>

              <Box sx={{ mt: 0.5 }}>
                <Button
                  size="small"
                  startIcon={showThinking ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  onClick={() => setShowThinking((s) => !s)}
                >
                  {t('translation:challenge.thinking')}
                </Button>
                {blocks.filter((b) => b.kind === 'text' || b.kind === 'tool' || b.kind === 'error').length > 0 ? (
                  <Box
                    component="div"
                    sx={{
                      fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
                      fontSize: '0.8125rem',
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      p: 1,
                      mt: 0.5,
                    }}
                  >
                    {blocks
                      .filter((b) => (showThinking ? true : b.kind !== 'thinking'))
                      .map((b, i) => (
                        <Box
                          key={i}
                          component="div"
                          sx={{
                            whiteSpace: 'pre-wrap',
                            color:
                              b.kind === 'error'
                                ? 'error.main'
                                : b.kind === 'tool'
                                  ? 'text.secondary'
                                  : 'text.primary',
                          }}
                        >
                          {b.text}
                        </Box>
                      ))}
                  </Box>
                ) : null}

                {piFinal ? (
                  <Box
                    component="pre"
                    sx={{
                      fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
                      fontSize: '0.8125rem',
                      whiteSpace: 'pre-wrap',
                      bgcolor: 'background.default',
                      borderRadius: 1,
                      p: 1,
                      mt: 0.5,
                    }}
                  >
                    {piFinal}
                  </Box>
                ) : null}
                {piError ? (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    <Box component="div">{piError}</Box>
                    <Box component="div" sx={{ mt: 0.5 }}>
                      {t('translation:challenge.keyHint')}
                    </Box>
                  </Alert>
                ) : null}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

/**
 * Acumula texto de streaming por bloco do mesmo tipo consecutivo — evita criar
 * um bloco por delta (o pi manda muitos deltas pequenos).
 */
function appendDelta(blocks: StreamingBlock[], kind: StreamingBlock['kind'], delta: string): StreamingBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === kind) {
    return [...blocks.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...blocks, { kind, text: delta }];
}