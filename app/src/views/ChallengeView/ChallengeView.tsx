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
 *  0. flush dos buffers sujos do editor (`EditorPaneHandle.save()`) — o
 *     `testAnswer` roda o código DO DISCO (C1: sem o flush o teste media
 *     código velho e mentia sobre o que está no editor);
 *  1. fase determinística — `study.testAnswer({challengeDir: workspaceDir})`
 *     + `onTestAnswerEvent` (started/done) + banner PASS/FAIL (verde/vermelho);
 *     falha de INFRA aqui é VISÍVEL (Alert + "Tentar de novo") e NÃO avança
 *     para a fase pi (C3); canal mudo vira timeout com retry (C4) e o
 *     "Abortar" também cancela esta fase;
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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
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
import { OPENROUTER_MODEL, OPENROUTER_PROVIDER_KEY } from '../../../shared/llm/constants';
import { getApi } from '../../lib/apiBridge';
import {
  ACTION_TIMEOUTS,
  IPC_TIMEOUT_MS,
  isTimeoutError,
  withTimeout,
} from '../../lib/ipcTimeout';
import {
  buildPiFeedbackPrompt,
  digestStudyMethodRules,
} from '../../lib/piFeedbackPrompt';
import { resolveFeedbackProvider } from '../../lib/feedbackProvider';
import { feedbackProviderChipKey } from '../../lib/feedbackProviderUi';
import { mapTestAnswerPhase } from '../../lib/testAnswerEvents';
import { useChallengeNav } from '../../lib/challengeNav';
import { TrackChallengePanel } from './TrackChallengePanel';
import type { ViewProps } from '../placeholders';
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
import { MarkdownView } from '../../components/markdown';
import { CODE_TYPOGRAPHY } from '../../lib/codeTheme';
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


export default function ChallengeView(props: ViewProps): ReactElement {
  const { t } = useTranslation();
  const nav = useChallengeNav();

  // RODADA 8 (trilhas): quando há um desafio de TRILHA selecionado (aula ou
  // proficiência), o fluxo é o TrackChallengePanel — o aluno NÃO gera aula e o
  // desafio vem da trilha (enunciado → Começar → editor → testar → veredito →
  // "Gerar novo desafio" com nunca-repetir). O fluxo legado (workspace da
  // geração) continua intacto abaixo para compatibilidade.
  if (nav.trackChallenge) {
    // ONDA 4 (next-glow): repassa a navegação do shell — o botão "Avançar
    // para a próxima aula" usa o fallback → trilha quando não há próxima.
    return <TrackChallengePanel selection={nav.trackChallenge} onNavigate={props.onNavigate} />;
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
  const [listing, setListing] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const [listError, setListError] = useState('');
  // Desafio ativo (do contexto OU selecionado da lista).
  const [active, setActive] = useState<ChallengeInfo | null>(nav.selectedChallenge);

  // Workspace: arquivos + enunciado.
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [statement, setStatement] = useState('');
  // Erro do carregamento do workspace, com severidade (W11): o enunciado
  // indisponível é 'warning' (o desafio continua utilizável); falha de
  // workspace é 'error'. Os dois renderizam como Alert com "Tentar de novo".
  const [statementError, setStatementError] = useState<{
    text: string;
    severity: 'warning' | 'error';
  } | null>(null);

  // Terminal de saída determinística (ref imperativa).
  const termRef = useRef<AnswerTerminalHandle | null>(null);
  // Handle do EditorPane (para FileExplorer abrir/criar/excluir e p/ o C1
  // salvar os buffers sujos antes de testar).
  const editorRef = useRef<EditorPaneHandle | null>(null);

  // Estado da fase determinística.
  const [testStatus, setTestStatus] = useState<TestRunStatus>('idle');
  const [testResult, setTestResult] = useState<TestAnswerResult | null>(null);
  // C3: mensagem i18n do erro de INFRA da fase determinística (renderizada em
  // Alert com retry — antes o erro era invisível e o fluxo seguia para o pi).
  const [testError, setTestError] = useState('');

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
  // W10: QUAL erro é este? 'key' (chave ausente → a dica da chave) ou 'other'
  // (qualquer outro → ação "Tentar de novo"). O keyHint genérico em todo
  // Alert era ruído para quem não tinha problema de chave.
  const [piErrorKind, setPiErrorKind] = useState<'key' | 'other'>('other');
  // Provedor que executou a última fase de feedback ('local' | 'openrouter').
  const [feedbackProvider, setFeedbackProvider] = useState<'local' | 'openrouter' | null>(null);

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
      // C4: canal mudo (invoke que nunca resolve nem rejeita) não pode prender
      // o spinner — withTimeout rejeita e o estado 'error' ganha retry (W11).
      // 10s (IPC_TIMEOUT_MS): listChallenges é leitura local rápida, mesmo
      // teto dos canais de leitura do TrackChallengePanel.
      const list = await withTimeout(
        (api.study.listChallenges as (
          args?: ListChallengesArgs,
        ) => Promise<ChallengeInfo[]>)(args),
        IPC_TIMEOUT_MS,
        'study.listChallenges',
      );
      setChallenges(list);
      if (list.length === 0) {
        // ONDA-UX-VAZIO: lista vazia NÃO é erro — o app se acusava de quebrado
        // por uma pasta vazia (o anti-padrão que a ONDA9 removeu do
        // Roadmap/Home). Estado `empty` próprio, renderizado como aviso
        // informativo com CTA (ver o render).
        setListing('empty');
      } else {
        setListing('idle');
      }
    } catch (err) {
      setListing('error');
      setListError(
        isTimeoutError(err)
          ? t('translation:challenge.listTimeout')
          : `${t('translation:challenge.listError')}: ${String(err)}`,
      );
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
    setStatementError(null);
    setFiles([]);
    setTestResult(null);
    setTestError('');
    setBlocks([]);
    setPiFinal('');
    setPiError('');
    setPiStatus('idle');
    setFeedbackProvider(null);
    setTestStatus('idle');
    try {
      const api = getApi();
      // README (C4: com teto de tempo — canal mudo vira erro claro + retry):
      try {
        const readme = await withTimeout(
          (api.study.readWorkspaceFile as (a: ReadArgs) => Promise<string>)(
            { workspaceDir: ch.workspaceDir, path: 'README.md' },
          ),
          IPC_TIMEOUT_MS,
          'study.readWorkspaceFile',
        );
        setStatement(readme);
      } catch (err) {
        setStatementError({
          text: isTimeoutError(err)
            ? t('translation:challenge.trackLoadTimeout')
            : t('translation:challenge.statementUnavailable'),
          severity: 'warning',
        });
      }
      // Arquivos (mesmo teto):
      const wsFiles = await withTimeout(
        (api.study.listWorkspaceFiles as (a: { workspaceDir: string }) => Promise<WorkspaceFile[]>)({
          workspaceDir: ch.workspaceDir,
        }),
        IPC_TIMEOUT_MS,
        'study.listWorkspaceFiles',
      );
      setFiles(wsFiles);
    } catch (err) {
      setStatementError({
        text: isTimeoutError(err)
          ? t('translation:challenge.trackLoadTimeout')
          : `${t('translation:challenge.workspaceLoadError')}: ${String(err)}`,
        severity: 'error',
      });
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
   * evento started/done apenas para refletir progresso no status. C4: eventos
   * de uma corrida que JÁ terminou (abortada/errada) não reescrevem o status.
   */
  useEffect(() => {
    const api = getApi();
    let stop: (() => void) | undefined;
    try {
      stop = api.study.onTestAnswerEvent((raw: unknown) => {
        if (!testInFlightRef.current) return;
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
   * C4 — cancelamento da fase determinística por SEQUÊNCIA. Cada corrida
   * captura o seu número; o "Abortar" incrementa o contador e a continuação
   * do `await testAnswer` vê a divergência e DESCARTA o resultado (o IPC não
   * é cancelável do lado do main — cancelar aqui é parar de esperar e não
   * aplicar nada).
   */
  const runSeqRef = useRef(0);
  // Companheiro do runSeqRef: "há uma fase determinística em voo?". Os eventos
  // pushed do main (started/done) só contam enquanto isto for true.
  const testInFlightRef = useRef(false);

  /**
   * Fase determinística dos testes. Retorna true quando o resultado foi aplicado
   * ao desafio ativo; false quando o resultado foi DESCARTADO (o desafio mudou
   * enquanto o teste rodava, a corrida foi abortada ou a fase falhou por infra)
   * — o chamador não deve seguir para a fase pi.
   */
  const runTests = useCallback(async (): Promise<boolean> => {
    if (!active) return false;
    // Identidade do desafio no momento em que o teste COMEÇA: o resultado só
    // pode ser aplicado se este desafio ainda for o ativo quando voltar.
    const startedKey = activeKey;
    const runSeq = ++runSeqRef.current;
    testInFlightRef.current = true;
    setTestStatus('running');
    setTestError('');
    setPiStatus('idle');
    setBlocks([]);
    setPiFinal('');
    setPiError('');
    try {
      const api = getApi();
      // C4: teto de tempo do canal. `ACTION_TIMEOUTS.answer` (70s) porque o
      // runner determinístico do main tem backstop de 60s
      // (studyMethodRunner `defaultTimeoutMs`) — 70s nunca corta uma execução
      // legítima e ainda desbloqueia o canal mudo.
      const result = (await withTimeout(
        (api.study.testAnswer as (
          args: TestArgs,
        ) => Promise<TestAnswerResult>)({ challengeDir: active.workspaceDir }),
        ACTION_TIMEOUTS.answer,
        'study.testAnswer',
      )) as TestAnswerResult;
      // C4: corrida abortada pelo botão "Abortar"? Descarta EM SILÊNCIO — sem
      // banner, sem estado, sem mark (abortar não é evento terminal).
      if (runSeq !== runSeqRef.current) return false;
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
        // S4 (auditoria de UX): o banner sai todo traduzido — as linhas vêm
        // em `labels` e a contagem usa a MESMA terminologia do `partialCount`
        // ("N de M testes"); o jargão "fase determinística"/"TESTS_RUN" sai da
        // cara do utilizador.
        printTestBanner(
          termRef.current,
          {
            passed: result.passed,
            testsRun: result.testsRun,
            expectedTests: result.expectedTests,
            output: result.output,
          },
          {
            title: t('translation:challenge.bannerTitle'),
            passed: t('translation:challenge.bannerPassed'),
            failed: t('translation:challenge.bannerFailed'),
            counts: tI('translation:challenge.bannerCounts', {
              n: result.testsRun,
              m: result.expectedTests,
            }),
          },
        );
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
      // C4: corrida abortada — silêncio (o Abortar já devolveu o controle).
      if (runSeq !== runSeqRef.current) return false;
      // C3: falha de INFRA da fase determinística. ANTES o catch seguia para a
      // fase pi (que avaliaria sem resultado confiável) e o erro só aparecia
      // numa linha de terminal fácil de perder. Agora: estado 'error' VISÍVEL
      // (Alert + "Tentar de novo") e o fluxo PARA aqui.
      setTestStatus('error');
      setTestResult(null);
      setTestError(
        isTimeoutError(err)
          ? t('translation:challenge.submitTimeout')
          : t('translation:challenge.deterministicError'),
      );
      // W9 (onda-ux): a frase é i18n; o erro cru vira linha técnica MUTED —
      // o terminal é a superfície de diagnóstico, nunca a frase principal.
      termRef.current?.writeLine(t('translation:challenge.deterministicError'), 'red');
      termRef.current?.writeLine(String(err), 'muted');
      return false;
    } finally {
      // Qualquer saída (resultado, descarte, aborto, erro) encerra a corrida —
      // eventos do main que cheguem depois são ignorados.
      testInFlightRef.current = false;
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

  /** Fase de feedback — decide o provedor e executa (pi no LLM remoto OU modelo local). */
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
        studentCode = await withTimeout(
          (api.study.readWorkspaceFile as (a: ReadArgs) => Promise<string>)({
            workspaceDir: active.workspaceDir,
            path: primaryCodePath,
          }),
          IPC_TIMEOUT_MS,
          'study.readWorkspaceFile',
        );
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
    let provider: 'local' | 'openrouter' = 'openrouter';
    try {
      const [settings, activeModel] = await Promise.all([
        api.settings.get().catch(() => ({}) as { defaultModelProvider?: 'openrouter' | 'local' }),
        (api.localAi.getActive as () => Promise<string | null>)().catch(() => null),
      ]);
      provider = resolveFeedbackProvider({
        defaultModelProvider: settings?.defaultModelProvider,
        activeLocalModelId: activeModel ?? null,
      });
    } catch {
      provider = 'openrouter'; // defensivo: nunca impede o feedback por falha de leitura.
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
        setPiErrorKind('other');
        setPiError(
          `${t('translation:challenge.localModelError')}: ${String(err)}. ` +
            t('translation:challenge.localModelHint'),
        );
      }
      return;
    }

    // Provedor REMOTO — pi coding agent com streaming/abort (fluxo histórico).
    try {
      // Assina o stream ANTES de executar.
      streamStopRef.current?.();
      streamStopRef.current = api.pi.onStreamEvent(handlePiStreamEvent);

      // C4: teto do canal. `ACTION_TIMEOUTS.challengeRegenerate` (150s) — o
      // MAIOR teto de ação do contrato: o pi roda com thinking 'max' +
      // ferramentas e uma resposta legítima passa dos 70s com facilidade; e o
      // "Abortar" manual continua disponível para quem quiser parar antes.
      const result = (await withTimeout(
        api.pi.execute({
          prompt,
          workingDirectory: active.workspaceDir,
          // provider/model VÊM DO CONTRATO (shared/llm/constants) — nunca
          // literais escritos à mão aqui: um id de modelo errado volta HTTP 400 e
          // este repositório já viu um 400 se disfarçar de resposta vazia.
          //
          // thinkingLevel 'max' é OBRIGATÓRIO neste call site. Sem o campo o
          // default é 'off' — era esse o estado anterior, ou seja, o feedback de
          // código do aluno rodava SEM raciocínio nenhum. 'max' é o topo real do
          // modelo alvo (ele aceita só max|high|low).
          modelConfig: {
            provider: OPENROUTER_PROVIDER_KEY,
            model: OPENROUTER_MODEL.id,
            thinkingLevel: 'max',
          },
          skillSystemPrompt: digestStudyMethodRules(),
          additionalContext:
            (primaryCodePath ? `\n[arquivo ${primaryCodePath}]\n\`\`\`\n${studentCode}\n\`\`\`\n` : '') +
            `\n[resultado dos testes determinísticos]\n${testOut || '(sem saída)'}\n`,
        }),
        ACTION_TIMEOUTS.challengeRegenerate,
        'pi.execute',
      )) as PiExecuteResult;

      setPiFinal(result.output ?? '');
      if (!result.success) {
        setPiStatus('error');
        // W10: o tipo do erro decide a UI — só o ramo de CHAVE mostra o
        // keyHint; os restantes ganham ação "Tentar de novo" (ver render).
        const missingKey =
          result.error?.includes('chave') || result.error?.includes('key');
        setPiErrorKind(missingKey ? 'key' : 'other');
        setPiError(
          missingKey
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
      setPiErrorKind('other');
      setPiError(
        isTimeoutError(err)
          ? t('translation:challenge.piTimeout')
          : `${t('translation:challenge.piExecuteError')}: ${String(err)}`,
      );
      streamStopRef.current?.();
      streamStopRef.current = undefined;
    }
  }, [active, primaryCodePath, statement, testResult, handlePiStreamEvent]);

  /**
   * "Abortar" vale para AS DUAS fases (C4). Na fase pi o abort é real e vai
   * para o main (`pi:abort`, com sessionId). Na fase determinística não existe
   * IPC cancelável — o aborto local DESCARTA a corrida em voo (guarda de
   * sequência de runTests) e devolve o controle imediatamente; o resultado que
   * chegar depois cai no descarte silencioso.
   */
  const abortRun = useCallback((): void => {
    if (testStatus === 'running') {
      runSeqRef.current += 1;
      testInFlightRef.current = false;
      setTestStatus('idle');
      setTestResult(null);
      setTestError('');
      termRef.current?.writeLine(t('translation:challenge.aborted'), 'yellow');
    }
    if (piStatus === 'running') {
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
    }
  }, [testStatus, piStatus, sessionId, t]);

  /** Testar resposta: flush dos buffers + fase determinística + fase pi. */
  const testAnswerClick = useCallback((): void => {
    void (async () => {
      // C1: `testAnswer` roda o código DO DISCO — salva os buffers sujos
      // ANTES de invocar. `save()` devolve false quando um write falhou: aí o
      // teste mediria código velho, então o fluxo para aqui (o EditorPane já
      // mostrou o erro do save).
      const saved = await editorRef.current?.save();
      if (saved === false) return;
      const applied = await runTests();
      // Resultado descartado (desafio trocou, corrida abortada ou falha de
      // infra): não segue para a fase pi — ela avaliaria sem resultado
      // confiável ou o desafio antigo na tela do novo.
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
                // W5: estrela vazia é indicador NÃO-TEXTO e precisa de ≥ 3:1
                // (SC 1.4.11). `action.disabled` ficava muito abaixo; o token
                // certo é o `nonText.neutral` (NONTEXT_* de designTokens.ts —
                // medido 3,2:1 no canvas claro e 6,1:1 no escuro).
                <StarBorderIcon
                  key={i}
                  fontSize="small"
                  sx={{ color: (tema) => tema.vars.palette.nonText.neutral }}
                />
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
        // W11: erro de listagem SEMPRE com saída — "Tentar de novo" refaz a
        // consulta (um erro de canal não é beco sem saída).
        <Alert
          severity="error"
          sx={{ mt: 1 }}
          action={
            <Button color="inherit" size="small" onClick={() => void loadChallenges()}>
              {t('translation:common.tryAgain')}
            </Button>
          }
        >
          {listError}
        </Alert>
      ) : null}

      {/* ONDA-UX-VAZIO: o estado vazio legítimo (nenhum desafio gerado ainda)
          é INFORMATIVO e vem com o CTA que o texto pedia a palavras — quem
          quer desafio gera uma aula primeiro, e a aula é na aba Aula. */}
      {listing === 'empty' && !active ? (
        <Alert
          severity="info"
          sx={{ mt: 1 }}
          action={
            <Button color="inherit" size="small" onClick={() => props.onNavigate('lesson')}>
              {t('translation:challenge.emptyGoToLesson')}
            </Button>
          }
        >
          {t('translation:challenge.noChallengesEmpty')}
        </Alert>
      ) : null}

      {!active && listing !== 'empty' ? (
        <Typography variant="body1" sx={{ color: 'text.secondary', mt: 2 }}>
          {t('translation:challenge.selectPrompt')}
        </Typography>
      ) : (
        <>
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
                // W11: enunciado/workspace indisponível NUNCA é um texto morto
                // — Alert com "Tentar de novo" que re-carrega o workspace
                // (statementUnavailable = warning; falha de workspace = error).
                <Alert
                  severity={statementError.severity}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => active && void loadWorkspace(active)}
                    >
                      {t('translation:common.tryAgain')}
                    </Button>
                  }
                >
                  {statementError.text}
                </Alert>
              ) : statement ? (
                <Box>
                  {/* ONDA "chat e código": um único renderizador de markdown
                      para o app inteiro (src/components/markdown) — os mesmos
                      plugins KaTeX de antes, agora em constante de módulo, mais
                      highlight de sintaxe e a distinção entrada x saída no
                      bloco de código. O escape de `$` de moeda mudou de lugar:
                      acontece dentro do MarkdownView. */}
                  <MarkdownView markdown={statement} />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('translation:challenge.statementLoading')}</Typography>
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

          {/* SAÍDA + FEEDBACK — W13: os BOTÕES saíram daqui para uma barra de
              ação PEGAJOSA (fim do fluxo, `position: sticky`), para o
              "Testar resposta" estar sempre alcançável sem scroll (o mesmo
              papel do grupo ancorado do fluxo track — ONDA-INPUT-ANCORADO).
              Os três painéis mantêm a estrutura: só a linha de ação mudou de
              casa. */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
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

              {/* C3: o estado de ERRO da fase determinística, finalmente
                  visível — mensagem i18n + "Tentar de novo" (antes o catch só
                  escrevia no terminal e seguia para o pi como se nada fosse). */}
              {testStatus === 'error' ? (
                <Alert
                  severity="error"
                  sx={{ mt: 1 }}
                  action={
                    <Button color="inherit" size="small" onClick={testAnswerClick}>
                      {t('translation:common.tryAgain')}
                    </Button>
                  }
                >
                  {testError}
                </Alert>
              ) : null}

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
                {/* S2 (auditoria de UX): o INTERSTÍCIO entre os testes e a
                    avaliação era invisível — o "Testar resposta" disparava o
                    pi logo de seguida e, até ao primeiro delta do stream, a
                    tela não dizia que a avaliação estava pedida. Este estado
                    explícito cobre exatamente essa janela (pedido em voo, sem
                    conteúdo ainda). */}
                {piRunning && blocks.length === 0 && !piFinal ? (
                  <Typography variant="body2" role="status" sx={{ color: 'text.secondary', mb: 0.5 }}>
                    {t('translation:challenge.requestingFeedback')}
                  </Typography>
                ) : null}
                <Button
                  size="small"
                  startIcon={showThinking ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  onClick={() => setShowThinking((s) => !s)}
                  // S6: disclosure acessível — o botão diz o que controla
                  // (aria-controls) e se está aberto (aria-expanded).
                  aria-expanded={showThinking}
                  aria-controls="challenge-thinking-panel"
                >
                  {t('translation:challenge.thinking')}
                </Button>
                {/* S6: a região controlada pelo toggle (streams + resultado).
                    Vive no DOM mesmo quando vazia para o aria-controls nunca
                    apontar para um id inexistente. */}
                <Box component="div" id="challenge-thinking-panel">
                  {blocks.filter((b) => b.kind === 'text' || b.kind === 'tool' || b.kind === 'error').length > 0 ? (
                    <Box
                      component="div"
                      sx={{
                        // ONDA "chat e código": a pilha literal pedia
                        // 'SFMono-Regular' e 'JetBrains Mono' — nenhuma das duas
                        // é a família REALMENTE empacotada ("JetBrains Mono
                        // Variable"), então este painel caía no monospace do
                        // sistema, a 13px. Passa a ler a MESMA fonte de verdade
                        // do editor e do terminal (§7.4 do redesign).
                        fontFamily: CODE_TYPOGRAPHY.fontFamily,
                        fontSize: CODE_TYPOGRAPHY.fontSize,
                        // ONDA-UX-SUPERFÍCIE: era `action.hover` — a "única
                        // superfície fora da rampa" que a ONDA12 removeu da
                        // conversa. O painel passa a um degrau REAL da rampa
                        // tonal (nível 2), como o resto da base.
                        bgcolor: (tema) => tema.vars.palette.surface.level2,
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
                              // ONDA-UX-CONTRASTE: `error.main` é PREENCHIMENTO
                              // (2,x:1 como texto). Neste painel (nível 2 da
                              // rampa) o contrato calibra `error.accentText`
                              // como o valor de TEXTO da família (≥ 4,5:1).
                              color:
                                b.kind === 'error'
                                  ? (tema) => tema.vars.palette.error.accentText
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

                  {/* S1 (auditoria de UX): o veredito do avaliador era um
                      `<pre>` cru — a mesma cara da saída do terminal, sem
                      hierarquia (W16 pedia "um bloco Veredito destacado").
                      Passa a BLOCO DE VEREDITO: um Alert com severity por
                      desfecho e o corpo em MarkdownView (o renderizador da
                      casa: KaTeX, código com highlight, listas).
                      Semântica das contagens: `testsRun` é lido pela UI como
                      "casos que passaram" (announceFailed/failedSummary) — é
                      essa a leitura usada no desfecho: sucesso quando passou,
                      warning quando PARCIAL (alguns passaram), error quando
                      NADA passou. */}
                  {piFinal ? (
                    <Alert
                      severity={
                        testResult?.passed
                          ? 'success'
                          : testResult && testResult.testsRun > 0
                            ? 'warning'
                            : 'error'
                      }
                      sx={{ mt: 0.5 }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {t('translation:challenge.verdictLabel')}
                      </Typography>
                      <MarkdownView markdown={piFinal} />
                    </Alert>
                  ) : null}
                </Box>
                {piError ? (
                  <Alert
                    severity="error"
                    sx={{ mt: 1 }}
                    action={
                      // W10: "Tentar de novo" só nos erros que o retry resolve
                      // (repete a fase pi). Erro de CHAVE não ganha retry —
                      // resolve-se nas Configurações.
                      piErrorKind === 'other' ? (
                        <Button color="inherit" size="small" onClick={() => void runPi()}>
                          {t('translation:common.tryAgain')}
                        </Button>
                      ) : undefined
                    }
                  >
                    <Box component="div">{piError}</Box>
                    {/* W10: a dica da chave SÓ no ramo de chave ausente
                        (piMissingKey) — para os restantes erros era ruído. */}
                    {piErrorKind === 'key' ? (
                      <Box component="div" sx={{ mt: 0.5 }}>
                        {t('translation:challenge.keyHint')}
                      </Box>
                    ) : null}
                  </Alert>
                ) : null}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* W13 (auditoria de UX): BARRA DE AÇÃO PEGAJOSA. O "Testar resposta"
            vivia no 3.º painel (após enunciado + editor de 480-560px) — em
            ecrãs pequenos a ação principal exigia scroll (Fitts/Hick: a
            ação tem de estar SEMPRE alcançável). A barra é `position: sticky`
            no contentor rolável (`main`), colada ao fundo como o grupo de
            resposta do fluxo track (ONDA-INPUT-ANCORADO). Os três painéis
            mantêm a estrutura — só a linha de ação mudou de casa. */}
        <Paper
          variant="outlined"
          sx={(theme) => ({
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
            mt: 2,
            p: 1,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1,
            alignItems: 'center',
            // Superfície de chrome (nível 3 da rampa) — a barra flutua sobre o
            // conteúdo e precisa de se separar dele sem sombra.
            backgroundColor: theme.vars.palette.surface.level3,
          })}
        >
          <Button
            variant="contained"
            disabled={!canTest}
            // Onda 1 (botões com ícone): `loading` SEM `loadingPosition`
            // usa 'center' — o MUI v9 pinta o label de `color: transparent`
            // e mostra SÓ o spinner. Com `loadingPosition="start"` o
            // spinner entra EM LINHA no lugar do ícone (startIcon vira
            // `opacity: 0`) e o label "Testar resposta" fica visível o
            // tempo todo.
            loading={busy}
            loadingPosition="start"
            startIcon={<PlayArrowIcon />}
            onClick={testAnswerClick}
            data-onboarding-target="challenge-test-answer"
            data-onboarding-signal={`test-status:${testStatus}`}
          >
            {t('translation:challenge.testAnswer')}
          </Button>
          <Button
            variant="outlined"
            color="error"
            // C4: "Abortar" também durante a fase determinística (antes
            // só desativava com o pi parado e a fase determinística ficava
            // presa até o fim do IPC).
            disabled={!busy}
            startIcon={<BlockIcon />}
            onClick={abortRun}
          >
            {t('translation:challenge.abort')}
          </Button>
        </Paper>
        </>
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