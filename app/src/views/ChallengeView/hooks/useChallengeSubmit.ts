/**
 * src/views/ChallengeView/hooks/useChallengeSubmit.ts — o FLUXO DE SUBMISSÃO
 * da ChallengeView ("Testar resposta"): fase determinística dos testes +
 * fase pi (feedback do avaliador), com aborto das duas e guarda de corrida.
 *
 * Separação STATE/VIEW (docs/storybook/STORY-SPEC.md §5): todo o estado e os
 * efeitos das duas fases vivem aqui; a view recebe estados + handlers. A
 * semântica é preservada byte a byte do corpo da ChallengeView (incluindo as
 * invariantes ONDA5/C1/C3/C4/W9/W10/S1/S2/S6/S9 documentadas no ficheiro
 * original):
 *
 *  - C1: `testAnswer` roda o código DO DISCO — o flush dos buffers sujos do
 *    editor (`saveEditor`) acontece ANTES de invocar; falha de save para tudo;
 *  - C4: cancelamento por SEQUÊNCIA (`runSeqRef`) — "Abortar" descarta a
 *    corrida em voo em silêncio; canal mudo vira timeout com retry;
 *  - guarda de corrida CROSS-DESAFIO (`isStillCurrent`): o resultado pertence
 *    ao desafio que COMEÇOU o teste — trocou, descarta-se TUDO (e o mark
 *    'abandoned' idempotente é a rede de segurança);
 *  - ONDA5: mark TERMINAL só em 'tests-passed'/'timed-out' (via `clock` +
 *    `markAttempt`); nunca no primeiro teste falho;
 *  - W10: o TIPO do erro pi ('key' | 'other') decide a UI (keyHint só no ramo
 *    de chave ausente; retry só nos erros que o retry resolve).
 *
 * O terminal (xterm) e o editor (CodeMirror) ficam FORA do hook: entram por
 * `output`/`saveEditor` (ponte de callbacks) — mantém este módulo importável
 * sem o loader de CSS do xterm.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ChallengeInfo,
  PiExecuteResult,
  PiStreamEvent,
  TestAnswerResult,
} from '../../../../shared/ipc-contract';
import { OPENROUTER_MODEL, OPENROUTER_PROVIDER_KEY } from '../../../../shared/llm/constants';
import { getApi } from '../../../lib/apiBridge';
import {
  ACTION_TIMEOUTS,
  IPC_TIMEOUT_MS,
  isTimeoutError,
  withTimeout,
} from '../../../lib/ipcTimeout';
import {
  buildPiFeedbackPrompt,
  digestStudyMethodRules,
} from '../../../lib/piFeedbackPrompt';
import { resolveFeedbackProvider } from '../../../lib/feedbackProvider';
import { fireConfetti, announceStatus } from '../../../lib/confetti';
import { isStillCurrent } from '../../../lib/challengeStars';
import { shouldMarkAttempt } from '../../../lib/answerFlow';
import { appendDelta, type StreamingBlock } from '../challengeUi';
import type { MarkAttemptFn } from './useChallengeList';
import type { ChallengeStarClock } from './useChallengeStarClock';

/** Faz o cast para o payload de runtime (ver nota sobre ApiSchema). */
type TestArgs = { challengeDir: string };
type ReadArgs = { workspaceDir: string; path: string };

/** Estado da fase determinística. */
export type TestRunStatus = 'idle' | 'running' | 'done' | 'error';
/** Estado da fase pi. */
export type PiStatus = 'idle' | 'running' | 'done' | 'error' | 'aborted';

/**
 * Ponte para a superfície de SAÍDA (terminal xterm) — o chamador traduz e
 * escreve; o hook só sinaliza o que aconteceu.
 */
export interface ChallengeOutputBridge {
  /** Banner PASS/FAIL no terminal (labels já traduzidos pelo chamador). */
  printBanner(result: TestAnswerResult): void;
  /** Linha "abortado" (fase determinística cancelada). */
  writeAborted(): void;
  /** Falha de INFRA da fase determinística (frase i18n + detalhe técnico). */
  writeFailure(err: unknown): void;
}

export interface UseChallengeSubmitInput {
  /** Desafio ativo (null = nenhum). */
  challenge: ChallengeInfo | null;
  /** Key do desafio ativo (`${challengeId}:${workspaceDir}`) ou null. */
  challengeKey: string | null;
  /** Enunciado carregado (vai no prompt do avaliador). */
  statement: string;
  /** Path do arquivo principal (o avaliador lê o stub). */
  primaryCodePath: string;
  /** Marcação de tentativa terminal (passed/abandoned). */
  markAttempt: MarkAttemptFn;
  /** Key do último desafio já marcado (idempotência por desafio). */
  markedForKeyRef: { current: string | null };
  /** Relógio de estrelas (conclusão/wrong-answer/guardas). */
  clock: ChallengeStarClock;
  /** Flush dos buffers sujos do editor (false = save falhou, não testar). */
  saveEditor: () => Promise<boolean | undefined> | undefined;
  /** Superfície de saída (terminal). */
  output: ChallengeOutputBridge;
}

export interface UseChallengeSubmit {
  testStatus: TestRunStatus;
  testResult: TestAnswerResult | null;
  testError: string;
  piStatus: PiStatus;
  piFinal: string;
  piError: string;
  piErrorKind: 'key' | 'other';
  feedbackProvider: 'local' | 'openrouter' | null;
  blocks: StreamingBlock[];
  showThinking: boolean;
  setShowThinking: React.Dispatch<React.SetStateAction<boolean>>;
  /** "Há uma fase em voo?" (guarda dos eventos push). */
  testInFlightRef: { current: boolean };
  /** Fase vinda do stream (`study.onTestAnswerEvent`). */
  applyStreamPhase(phase: 'started' | 'done'): void;
  runTests(): Promise<boolean>;
  runPi(): Promise<void>;
  abortRun(): void;
  testAnswerClick(): void;
  /** Reset total das fases — chamado a cada carga de workspace. */
  resetAfterWorkspaceLoad(): void;
}

export function useChallengeSubmit(input: UseChallengeSubmitInput): UseChallengeSubmit {
  const { t } = useTranslation();
  // t() com interpolação (mesmo cast documentado na ChallengeView): o t()
  // strict-typed desta base rejeita options porque os valores dos JSONs chegam
  // como `string`; o RUNTIME interpola normal.
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;

  // Estado da fase determinística.
  const [testStatus, setTestStatus] = useState<TestRunStatus>('idle');
  const [testResult, setTestResult] = useState<TestAnswerResult | null>(null);
  // C3: mensagem i18n do erro de INFRA da fase determinística (renderizada em
  // Alert com retry — antes o erro era invisível e o fluxo seguia para o pi).
  const [testError, setTestError] = useState('');

  // Estado da fase pi.
  const [piStatus, setPiStatus] = useState<PiStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [blocks, setBlocks] = useState<StreamingBlock[]>([]);
  const [piFinal, setPiFinal] = useState<string>('');
  const [piError, setPiError] = useState('');
  // W10: QUAL erro é este? 'key' (chave ausente → a dica da chave) ou 'other'
  // (qualquer outro → ação "Tentar de novo").
  const [piErrorKind, setPiErrorKind] = useState<'key' | 'other'>('other');
  // Provedor que executou a última fase de feedback ('local' | 'openrouter').
  const [feedbackProvider, setFeedbackProvider] = useState<'local' | 'openrouter' | null>(null);

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
  /** Assina os eventos do pi (stream) e guarda o unsubscribe. */
  const streamStopRef = useRef<(() => void) | undefined>(undefined);

  // Estado MAIS RECENTE para os callbacks estáveis (rewrite no corpo do
  // render — mesmo padrão do `activeKeyRef` original): as promessas em voo
  // leem SEMPRE o estado/closure da última render, nunca um stale.
  const latest = useRef(input);
  latest.current = input;
  const latestState = useRef({ testResult, testStatus, piStatus, sessionId });
  latestState.current = { testResult, testStatus, piStatus, sessionId };

  /** Reset total das fases (a cada carga de workspace — semântica original). */
  const resetAfterWorkspaceLoad = useCallback((): void => {
    setTestResult(null);
    setTestError('');
    setBlocks([]);
    setPiFinal('');
    setPiError('');
    setPiStatus('idle');
    setFeedbackProvider(null);
    setTestStatus('idle');
  }, []);

  /**
   * Fase determinística dos testes. Retorna true quando o resultado foi aplicado
   * ao desafio ativo; false quando o resultado foi DESCARTADO (o desafio mudou
   * enquanto o teste rodava, a corrida foi abortada ou a fase falhou por infra)
   * — o chamador não deve seguir para a fase pi.
   */
  const runTests = useCallback(async (): Promise<boolean> => {
    const { challenge: active, challengeKey: activeKey, clock, markAttempt, markedForKeyRef, output } = latest.current;
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
      if (!isStillCurrent(startedKey, latest.current.challengeKey)) {
        // ONDA5: o resultado em voo pertence ao desafio que COMEÇOU o teste (o
        // closure ainda o carrega) — a troca sem concluir já marcou
        // 'abandoned' no efeito de contexto/picker (captura antes de trocar);
        // este mark é a REDE DE SEGURANÇA idempotente para qualquer caminho
        // que troque o ativo sem passar por eles (nunca duplica: o mark do
        // caminho original já registrou markedForKeyRef).
        const verdict = shouldMarkAttempt({
          event: 'switched',
          alreadyMarked: markedForKeyRef.current === startedKey,
          concluded: clock.isConcluded(),
          timedOut: clock.wasTimedOut(),
        });
        if (verdict) {
          markAttempt(
            active,
            verdict,
            clock.starsNow(),
            clock.elapsedNow(),
          );
        }
        return false;
      }
      setTestResult(result);
      setTestStatus('done');
      // S4 (auditoria de UX): o banner sai todo traduzido — as linhas vêm
      // em `labels` e a contagem usa a MESMA terminologia do `partialCount`
      // ("N de M testes"); o jargão "fase determinística"/"TESTS_RUN" sai da
      // cara do utilizador.
      output.printBanner(result);
      // Veredito + estrelas (docs/ux-redesign.md §8): passou → rajada curta de
      // confete + anúncio específico (NUNCA "Parabéns!" ritualizado); falhou →
      // perde 1 estrela e o anúncio aponta o caso que falhou. O banner do
      // terminal continua como está.
      if (result.passed) {
        const durationMs = clock.concludeNow();
        fireConfetti();
        announceStatus(
          tI('translation:challenge.announcePassed', {
            testsRun: result.testsRun,
            expectedTests: result.expectedTests,
          }),
        );
        // ONDA5 mark TERMINAL: passou nos testes → 'passed' (estrelas do
        // tracker + duração real; o relógio congelou em concludeNow).
        const passKey = latest.current.challengeKey;
        const passVerdict = shouldMarkAttempt({
          event: 'tests-passed',
          alreadyMarked: markedForKeyRef.current === passKey,
          concluded: true,
          timedOut: clock.wasTimedOut(),
        });
        const ativo = latest.current.challenge;
        if (passVerdict && ativo) {
          markAttempt(
            ativo,
            passVerdict,
            clock.starsNow(),
            durationMs,
          );
        }
      } else {
        clock.onWrongAnswer();
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
      output.writeFailure(err);
      return false;
    } finally {
      // Qualquer saída (resultado, descarte, aborto, erro) encerra a corrida —
      // eventos do main que cheguem depois são ignorados.
      testInFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Assina os eventos do pi (stream) e acumula os blocos do painel. */
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
    const active = latest.current.challenge;
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
    const primaryCodePath = latest.current.primaryCodePath;
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
    const testOut = latestState.current.testResult?.output ?? '';

    const prompt = buildPiFeedbackPrompt({
      subject: active?.concept,
      statement: latest.current.statement,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlePiStreamEvent]);

  /**
   * "Abortar" vale para AS DUAS fases (C4). Na fase pi o abort é real e vai
   * para o main (`pi:abort`, com sessionId). Na fase determinística não existe
   * IPC cancelável — o aborto local DESCARTA a corrida em voo (guarda de
   * sequência de runTests) e devolve o controle imediatamente; o resultado que
   * chegar depois cai no descarte silencioso.
   */
  const abortRun = useCallback((): void => {
    const { testStatus, piStatus, sessionId } = latestState.current;
    const { output } = latest.current;
    if (testStatus === 'running') {
      runSeqRef.current += 1;
      testInFlightRef.current = false;
      setTestStatus('idle');
      setTestResult(null);
      setTestError('');
      output.writeAborted();
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
  }, []);

  /** Testar resposta: flush dos buffers + fase determinística + fase pi. */
  const testAnswerClick = useCallback((): void => {
    void (async () => {
      // C1: `testAnswer` roda o código DO DISCO — salva os buffers sujos
      // ANTES de invocar. `save()` devolve false quando um write falhou: aí o
      // teste mediria código velho, então o fluxo para aqui (o EditorPane já
      // mostrou o erro do save).
      const saved = await latest.current.saveEditor();
      if (saved === false) return;
      const applied = await runTests();
      // Resultado descartado (desafio trocou, corrida abortada ou falha de
      // infra): não segue para a fase pi — ela avaliaria sem resultado
      // confiável ou o desafio antigo na tela do novo.
      if (!applied) return;
      await runPi();
    })();
  }, [runTests, runPi]);

  /** Fase vinda do stream (`study.onTestAnswerEvent`). */
  const applyStreamPhase = useCallback((phase: 'started' | 'done'): void => {
    if (phase === 'started') setTestStatus('running');
    else if (phase === 'done') setTestStatus('done');
  }, []);

  // Cleanup no UNMOUNT: derruba a assinatura do stream do pi (mesmo padrão do
  // onTestAnswerEvent) — sem isto, sair da tela com o pi rodando vaza o
  // listener de pi:stream-event (WARNING 3).
  useEffect(() => {
    return () => {
      streamStopRef.current?.();
      streamStopRef.current = undefined;
    };
  }, []);

  return {
    testStatus,
    testResult,
    testError,
    piStatus,
    piFinal,
    piError,
    piErrorKind,
    feedbackProvider,
    blocks,
    showThinking,
    setShowThinking,
    testInFlightRef,
    applyStreamPhase,
    runTests,
    runPi,
    abortRun,
    testAnswerClick,
    resetAfterWorkspaceLoad,
  };
}
