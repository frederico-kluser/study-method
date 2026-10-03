/**
 * src/views/ChallengeView/ChallengeView.tsx — a tela de Desafio (editor +
 * testes + feedback do pi coding agent). CHROME MUI v9 (path imports,
 * mobile-first, a11y).
 *
 * ─── CONTRATO STATE/VIEW (docs/storybook/STORY-SPEC.md §5) ─────────────────
 * Este ficheiro é o CONTAINER: só liga estado→view. O estado vive em
 * `hooks/` (useChallengeList, useChallengeWorkspace, useChallengeStarClock,
 * useTestAnswerStream, useChallengeSubmit) e a apresentação em `blocks/`
 * (ChallengeStatusRegion, ChallengeViewHeader, ChallengeStarsTimer,
 * ChallengeStatementPanel, ChallengeWorkspacePanel, ChallengeFeedbackPanel,
 * ChallengeSubmitBar, ChallengeListStates) — views puras, só props. A
 * lógica pura (streams, identidade, veredito) vive em `challengeUi.ts`.
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
 * Botão "Testar resposta" (useChallengeSubmit):
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
 *
 * ─── DÍVIDA/COMPORTAMENTO REGISTADO NA SEPARAÇÃO STATE/VIEW ───────────────
 * A branch de conteúdo principal estava guardada por
 * `(!active && listing !== 'empty') ? prompt : conteúdo` — com lista vazia e
 * sem desafio ativo o conteúdo principal renderizava SEM `active` e o
 * `active.title` rebentava (o Alert vazio aparecia e a view crashava). O
 * container passou a renderizar o conteúdo principal SÓ com desafio ativo
 * (`active ? conteúdo : prompt/empty`) — o único delta de comportamento é o
 * estado "sem desafios" deixar de rebentar (história de story exigida pelo
 * catálogo; registado no relatório da onda).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import type { ChallengeInfo } from '../../../shared/ipc-contract';
import { feedbackProviderChipKey } from '../../lib/feedbackProviderUi';
import { LAYOUT } from '../../lib/designTokens';
import { centeredColumnSx } from '../../lib/layoutSx';
import { useChallengeNav } from '../../lib/challengeNav';
import { TrackChallengePanel } from './TrackChallengePanel';
import type { ViewProps } from '../placeholders';
import {
  formatClock,
  timeLimitForDifficulty,
  INITIAL_STARS,
} from '../../lib/challengeStars';
import { shouldMarkAttempt } from '../../lib/answerFlow';
import {
  AnswerTerminal,
  printTestBanner,
  type AnswerTerminalHandle,
} from '../../components/terminal/AnswerTerminal';
import { type EditorPaneHandle } from '../../components/editor/EditorPane';
import { challengeAttemptKey, verdictSeverity } from './challengeUi';
import { useChallengeList } from './hooks/useChallengeList';
import { useChallengeWorkspace } from './hooks/useChallengeWorkspace';
import { useChallengeStarClock } from './hooks/useChallengeStarClock';
import { useTestAnswerStream } from './hooks/useTestAnswerStream';
import {
  useChallengeSubmit,
  type ChallengeOutputBridge,
  type UseChallengeSubmit,
} from './hooks/useChallengeSubmit';
import { ChallengeStatusRegion } from './blocks/ChallengeStatusRegion';
import { ChallengeViewHeader } from './blocks/ChallengeViewHeader';
import { ChallengeStarsTimer } from './blocks/ChallengeStarsTimer';
import { ChallengeStatementPanel } from './blocks/ChallengeStatementPanel';
import { ChallengeWorkspacePanel } from './blocks/ChallengeWorkspacePanel';
import { ChallengeFeedbackPanel } from './blocks/ChallengeFeedbackPanel';
import { ChallengeSubmitBar } from './blocks/ChallengeSubmitBar';
import { ChallengeListStates } from './blocks/ChallengeListStates';

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

  // Desafio ativo (do contexto OU selecionado da lista).
  const [active, setActive] = useState<ChallengeInfo | null>(nav.selectedChallenge);
  // KEY do desafio ativo: trocar de desafio RESETA estrelas + cronômetro.
  const activeKey = active ? challengeAttemptKey(active) : null;

  // ─── Estado (hooks/) ─────────────────────────────────────────────────────
  const list = useChallengeList({ lastSetupRoot: nav.lastSetupRoot });

  // Referência do hook de submit para o reset a jusante da carga de workspace
  // (o workspace carrega primeiro; o submit ainda não existe no 1.º render).
  const submitRef = useRef<UseChallengeSubmit | null>(null);

  const clock = useChallengeStarClock({
    challenge: active,
    challengeKey: activeKey,
    markAttempt: list.markAttempt,
    markedForKeyRef: list.markedForKeyRef,
  });

  const workspace = useChallengeWorkspace({
    challenge: active,
    onResetDownstream: () => submitRef.current?.resetAfterWorkspaceLoad(),
  });

  // Terminal de saída determinística (ref imperativa) + handle do EditorPane
  // (para FileExplorer abrir/criar/excluir e p/ o C1 salvar os buffers sujos
  // antes de testar).
  const termRef = useRef<AnswerTerminalHandle | null>(null);
  const editorRef = useRef<EditorPaneHandle | null>(null);

  // Ponte para a superfície de saída (o xterm vive FORA do hook de submit).
  const output = useMemo<ChallengeOutputBridge>(
    () => ({
      printBanner: (result): void => {
        if (termRef.current) {
          // S4 (auditoria de UX): o banner sai todo traduzido — as linhas vêm
          // em `labels` e a contagem usa a MESMA terminologia do
          // `partialCount` ("N de M testes").
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
      },
      writeAborted: (): void => {
        termRef.current?.writeLine(t('translation:challenge.aborted'), 'yellow');
      },
      writeFailure: (err): void => {
        // W9 (onda-ux): a frase é i18n; o erro cru vira linha técnica MUTED —
        // o terminal é a superfície de diagnóstico, nunca a frase principal.
        termRef.current?.writeLine(t('translation:challenge.deterministicError'), 'red');
        termRef.current?.writeLine(String(err), 'muted');
      },
    }),
    [t, tI],
  );

  const submit = useChallengeSubmit({
    challenge: active,
    challengeKey: activeKey,
    statement: workspace.statement,
    primaryCodePath: workspace.primaryCodePath,
    markAttempt: list.markAttempt,
    markedForKeyRef: list.markedForKeyRef,
    clock,
    saveEditor: () => editorRef.current?.save(),
    output,
  });
  submitRef.current = submit;

  // Assina o canal de eventos dos testes (main push). Os eventos started/done
  // apenas refletem progresso no status; o resultado vem do retorno de
  // testAnswer. C4: eventos de uma corrida que JÁ terminou não reescrevem o
  // status (guarda testInFlightRef).
  useTestAnswerStream({
    isInFlight: () => submit.testInFlightRef.current,
    onPhase: submit.applyStreamPhase,
  });

  /**
   * Quando o contexto muda (aula → desafio), sincroniza o desafio ativo e
   * recarrega o workspace. ONDA5: TROCA DE DESAFIO SEM CONCLUIR é evento
   * TERMINAL — marca 'abandoned' do desafio ANTERIOR ANTES de trocar
   * (captura `active` do render anterior; a guarda de identidade em runTests
   * descarta o resultado em voo — o mark aqui é a captura antecipada).
   */
  useEffect(() => {
    if (nav.selectedChallenge) {
      const newKey = challengeAttemptKey(nav.selectedChallenge);
      if (active && activeKey && activeKey !== newKey) {
        const verdict = shouldMarkAttempt({
          event: 'switched',
          alreadyMarked: list.markedForKeyRef.current === activeKey,
          concluded: clock.isConcluded(),
          timedOut: clock.wasTimedOut(),
        });
        if (verdict) {
          list.markAttempt(
            active,
            verdict,
            clock.starsNow(),
            clock.elapsedNow(),
          );
        }
      }
      setActive(nav.selectedChallenge);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.selectedChallenge, nav.version]);

  // Ao montar: se veio com desafio do contexto, já está setado; senão lista.
  // Fix15c-review: dispara também quando `lastSetupRoot` muda (loadChallenges é
  // useCallback estável que só troca de identidade quando o root muda) — assim a
  // lista recarrega com o setup novo mesmo com a view montada. Sem loop:
  // listChallenges não altera o root, então a dep é estável.
  useEffect(() => {
    if (!nav.selectedChallenge) void list.loadChallenges();
  }, [nav.selectedChallenge, list.loadChallenges]);

  // Limite de tempo do desafio ativo: T = 90s + difficulty*60s (sem difficulty
  // exposta → fallback 300s documentado em timeLimitForDifficulty).
  const timeLimitMs = useMemo(
    () => timeLimitForDifficulty(active ? active.difficulty : undefined),
    [active],
  );

  /** Escolha pelo picker: ONDA5 marca 'abandoned' do desafio anterior ANTES. */
  const pickChallenge = useCallback(
    (ch: ChallengeInfo): void => {
      const oldKey = activeKey;
      if (oldKey && oldKey !== challengeAttemptKey(ch)) {
        const verdict = shouldMarkAttempt({
          event: 'switched',
          alreadyMarked: list.markedForKeyRef.current === oldKey,
          concluded: clock.isConcluded(),
          timedOut: clock.wasTimedOut(),
        });
        if (verdict && active) {
          list.markAttempt(
            active,
            verdict,
            clock.starsNow(),
            clock.elapsedNow(),
          );
        }
      }
      setActive(ch);
      void workspace.loadWorkspace(ch);
    },
    [activeKey, active, list, clock, workspace],
  );

  const providerChipKey = feedbackProviderChipKey(submit.feedbackProvider);
  const busy = submit.testStatus === 'running' || submit.piStatus === 'running';
  const piRunning = submit.piStatus === 'running';
  const canTest = Boolean(active) && submit.testStatus !== 'running' && submit.piStatus !== 'running';

  return (
    <Box
      component="section"
      sx={{
        // Coluna de página (auditoria §4 — o molde centrado com a largura em
        // `LAYOUT.pageMaxPx`; o padding mantém a escala responsiva da view).
        ...centeredColumnSx(LAYOUT.pageMaxPx),
        p: { xs: 1, md: 2 },
      }}
    >
      {/* Região de status (SC 4.1.3 / docs §8): sempre no DOM, visualmente
          oculta; announceStatus() reutiliza este elemento. */}
      <ChallengeStatusRegion />

      {/* Cabeçalho (título + picker — escondido com seleção do contexto). */}
      <ChallengeViewHeader
        showPicker={!nav.selectedChallenge}
        picker={{
          value: active?.challengeId ?? '',
          loading: list.listing === 'loading',
          disabled: busy,
          options: list.challenges.map((c) => ({
            challengeId: c.challengeId,
            title: c.title,
            language: c.language,
          })),
          onSelect: (id) => {
            const ch = list.challenges.find((c) => c.challengeId === id);
            if (ch) pickChallenge(ch);
          },
        }}
      />

      {/* Estrelas + cronômetro do desafio (visíveis enquanto há desafio ativo). */}
      {active ? (
        <ChallengeStarsTimer
          starsLeft={clock.starsLeft}
          totalStars={INITIAL_STARS}
          timedOut={clock.timedOut}
          clockText={formatClock(Math.max(0, timeLimitMs - clock.elapsedMs))}
        />
      ) : null}

      {/* Estados da listagem sem desafio ativo (erro com retry, vazio com CTA,
          convite a escolher). */}
      <ChallengeListStates
        listing={list.listing}
        listError={list.listError}
        hasActive={Boolean(active)}
        onRetry={() => void list.loadChallenges()}
        onGoToLesson={() => props.onNavigate?.('lesson')}
      />

      {active ? (
        <>
        <Grid container spacing={2} sx={{ mt: 0, width: '100%' }}>
          {/* ENUNCIADO */}
          <Grid size={12}>
            <ChallengeStatementPanel
              title={active.title}
              language={active.language}
              statement={workspace.statement}
              statementError={workspace.statementError}
              onRetry={() => void workspace.loadWorkspace(active)}
            />
          </Grid>

          {/* EDITOR + ÁRVORE DE FICHEIROS */}
          <Grid size={12}>
            <ChallengeWorkspacePanel
              workspaceDir={active.workspaceDir}
              files={workspace.files}
              editorRef={editorRef}
              onOpenFile={(p) => editorRef.current?.openFile(p)}
              onCreateFile={(n) => editorRef.current?.createFile(n)}
              onDeleteFile={(p) => editorRef.current?.deleteFile(p)}
              onRefresh={() => void workspace.loadWorkspace(active)}
              onFilesChanged={() => void workspace.loadWorkspace(active)}
            />
          </Grid>

          {/* SAÍDA + FEEDBACK — W13: os BOTÕES saíram daqui para a barra de
              ação PEGAJOSA (fim do fluxo, `position: sticky`); os três
              painéis mantêm a estrutura. */}
          <Grid size={12}>
            <ChallengeFeedbackPanel
              terminal={
                <AnswerTerminal ref={termRef} aria-label={t('translation:challenge.outputAria')} />
              }
              testRunning={submit.testStatus === 'running'}
              testError={submit.testStatus === 'error' ? submit.testError : null}
              onRetryTests={submit.testAnswerClick}
              providerLabel={providerChipKey ? t(`translation:${providerChipKey}`) : null}
              piRunning={piRunning}
              piAborted={submit.piStatus === 'aborted'}
              requestingFeedback={piRunning && submit.blocks.length === 0 && !submit.piFinal}
              showThinking={submit.showThinking}
              onToggleThinking={() => submit.setShowThinking((s) => !s)}
              blocks={submit.blocks}
              verdict={
                submit.piFinal
                  ? { severity: verdictSeverity(submit.testResult), markdown: submit.piFinal }
                  : null
              }
              piError={submit.piError ? { text: submit.piError, kind: submit.piErrorKind } : null}
              onRetryPi={() => void submit.runPi()}
            />
          </Grid>
        </Grid>

        {/* W13 (auditoria de UX): BARRA DE AÇÃO PEGAJOSA — a ação principal
            está sempre alcançável sem scroll. */}
        <ChallengeSubmitBar
          canTest={canTest}
          busy={busy}
          testSignal={submit.testStatus}
          onTest={submit.testAnswerClick}
          onAbort={submit.abortRun}
        />
        </>
      ) : null}
    </Box>
  );
}
