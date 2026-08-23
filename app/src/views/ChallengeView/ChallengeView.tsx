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
import type {
  ChallengeInfo,
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
   * recarrega o workspace.
   */
  useEffect(() => {
    if (nav.selectedChallenge) {
      setActive(nav.selectedChallenge);
    }
  }, [nav.selectedChallenge, nav.version]);

  // Carrega a lista quando não há desafio selecionado.
  const loadChallenges = useCallback(async (): Promise<void> => {
    setListing('loading');
    setListError('');
    try {
      const api = getApi();
      const list = await (api.study.listChallenges as (
        args?: ListChallengesArgs,
      ) => Promise<ChallengeInfo[]>)({});
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
  }, []);

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

  // Ao montar: se veio com desafio do contexto, já está setado; senão lista.
  useEffect(() => {
    if (!nav.selectedChallenge) void loadChallenges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Fase determinística dos testes. */
  const runTests = useCallback(async (): Promise<void> => {
    if (!active) return;
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
    } catch (err) {
      setTestStatus('error');
      setTestResult(null);
      termRef.current?.writeLine(`Erro na fase determinística: ${String(err)}`, 'red');
    }
  }, [active]);

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
        modelConfig: { provider: 'deepseek', model: 'deepseek-v4-flash-0731' },
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
      await runTests();
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
    setActive(ch);
    void loadWorkspace(ch);
  };

  const providerChipKey = feedbackProviderChipKey(feedbackProvider);
  const busy = testStatus === 'running' || piStatus === 'running';
  const piRunning = piStatus === 'running';

  return (
    <Box component="section" sx={{ p: { xs: 1, md: 2 }, maxWidth: 1200, mx: 'auto' }}>
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
              disabled={listing === 'loading'}
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
                  <ReactMarkdown components={MarkdownComponents()}>{statement}</ReactMarkdown>
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
                <AnswerTerminal ref={termRef} aria-label={t('translation:challenge.outputAria')} />
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