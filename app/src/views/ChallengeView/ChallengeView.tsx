/**
 * src/views/ChallengeView/ChallengeView.tsx — a tela de Desafio (editor + testes
 * + feedback do pi coding agent).
 *
 * Substitue o placeholder em views/index.ts. Duas fontes de desafio:
 *
 *  (a) um desafio selecionado via contexto (ChallengeNav — vindo da Aula);
 *  (b) a lista `study.listChallenges({})` (usa o último setup); se vazia,
 *      mostra um erro claro ("gere uma aula primeiro").
 *
 * Layout em três painéis:
 *  - esquerda: enunciado (README.md renderizado via react-markdown);
 *  - centro: FileExplorer + EditorPane (workspaceDir do desafio);
 *  - direita/inferior: AnswerTerminal (saída determinística dos testes) +
 *    painel de feedback streamado do pi + botões.
 *
 * Botão "Testar resposta":
 *  1. fase determinística — `study.testAnswer({challengeDir: workspaceDir})`
 *     + `onTestAnswerEvent` (started/done) + banner PASS/FAIL (verde/vermelho),
 *     linha TESTS_RUN/ESPERADOS e a saída real desenhada no AnswerTerminal;
 *  2. fase pi — monta o prompt (lib pura) e `pi.execute` com
 *     `additionalContext` = código atual + saída determinística; streama
 *     events (text/thinking/tool) num painel colapsável; guarda sessionId em
 *     status_change p/ abort; ao final mostra PiExecuteResult.output.
 *
 * Regras de UI pt-BR: veredito factual, sem bajulação automática (C-12 — o
 * feedback VEM do pi; a UI apenas não distorce).
 */
import ReactMarkdown from 'react-markdown';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Play,
  Ban,
  ChevronDown,
  ChevronRight,
  Loader2,
  Database,
  Cpu,
} from 'lucide-react';
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
import { mapTestAnswerPhase } from '../../lib/testAnswerEvents';
import { useChallengeNav } from '../../lib/challengeNav';
import { AnswerTerminal, printTestBanner, type AnswerTerminalHandle } from '../../components/terminal/AnswerTerminal';
import { FileExplorer } from '../../components/editor/FileExplorer';
import { EditorPane, type EditorPaneHandle } from '../../components/editor/EditorPane';
import { StatusText, InlineSpinner } from '../SettingsView/FormControls';

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

export default function ChallengeView(): ReactElement {
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
        setListError('Nenhum desafio disponível. Gere uma aula primeiro na aba "Aula".');
      } else {
        setListing('idle');
      }
    } catch (err) {
      setListing('error');
      setListError(`Não consegui listar os desafios: ${String(err)}`);
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
        setStatementError('Enunciado (README.md) indisponível.');
      }
      // Arquivos:
      const wsFiles = await (api.study.listWorkspaceFiles as (a: { workspaceDir: string }) => Promise<WorkspaceFile[]>)({
        workspaceDir: ch.workspaceDir,
      });
      setFiles(wsFiles);
    } catch (err) {
      setStatementError(`Erro ao carregar o workspace: ${String(err)}`);
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
        setBlocks((b) => [...b, { kind: 'tool', text: `✓ ${ev.toolName} (ok)` }]);
        break;
      case 'error':
        setBlocks((b) => [...b, { kind: 'error', text: String(ev.data) }]);
        break;
      default:
        break;
    }
  }, []);

  /** Fase pi coding agent — monta prompt e executa com streaming. */
  const runPi = useCallback(async (): Promise<void> => {
    if (!active) return;
    setPiStatus('running');
    setPiError('');
    setBlocks([]);
    setSessionId(null);
    const api = getApi();

    // Monta o código real do aluno (código do arquivo principal do workspace)
    // + saída determinística para o additionalContext do pi.
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
    const codeSnippet =
      (primaryCodePath ? `\n[arquivo ${primaryCodePath}]\n\`\`\`\n${studentCode}\n\`\`\`\n` : '') +
      `\n[resultado dos testes determinísticos]\n${testOut || '(sem saída)'}\n`;

    const prompt = buildPiFeedbackPrompt({
      subject: active?.concept,
      statement,
      studentCode: (primaryCodePath ? studentCode : ''),
      testOutput: testOut,
      language: active?.language ?? '',
    });

    try {
      // Assina o stream ANTES de executar.
      streamStopRef.current?.();
      streamStopRef.current = api.pi.onStreamEvent(handlePiStreamEvent);

      const result = (await api.pi.execute({
        prompt,
        workingDirectory: active.workspaceDir,
        modelConfig: { provider: 'deepseek', model: 'deepseek-v4-flash-0731' },
        skillSystemPrompt: digestStudyMethodRules(),
        additionalContext: codeSnippet,
      })) as PiExecuteResult;

      setPiFinal(result.output ?? '');
      if (!result.success) {
        setPiStatus('error');
        setPiError(
          result.error?.includes('chave') || result.error?.includes('key')
            ? 'Falha ao chamar o pi: chave DeepSeek ausente ou inválida. Abra as Configurações para cadastrar a chave.'
            : `Falha ao chamar o pi: ${result.error ?? 'erro desconhecido'}`,
        );
      } else {
        setPiStatus('done');
      }
      streamStopRef.current?.();
      streamStopRef.current = undefined;
    } catch (err) {
      setPiStatus('error');
      setPiError(`Erro ao executar o pi: ${String(err)}`);
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

  return (
    <section className="view challenge">
      <header className="challenge__header">
        <h1 className="challenge__title">Desafio</h1>
        {/* Seleção quando a fonte é a lista */}
        {!nav.selectedChallenge ? (
          <div className="challenge__picker">
            <select
              className="form-field__input"
              value={active?.challengeId ?? ''}
              onChange={(e) => {
                const ch = challenges.find((c) => c.challengeId === e.target.value);
                if (ch) pickChallenge(ch);
              }}
              disabled={listing === 'loading'}
            >
              {listing === 'loading' ? (
                <option>Carregando…</option>
              ) : challenges.length === 0 ? (
                <option value="">Nenhum desafio</option>
              ) : (
                challenges.map((c) => (
                  <option key={c.challengeId} value={c.challengeId}>
                    {c.title} ({c.language})
                  </option>
                ))
              )}
            </select>
          </div>
        ) : null}
      </header>

      {listing === 'error' && !active ? (
        <StatusText tone="danger">{listError}</StatusText>
      ) : null}

      {!active ? (
        <StatusText tone="muted">Selecione um desafio para começar.</StatusText>
      ) : (
        <div className="challenge__body">
          {/* PAINEL ESQUERDO — enunciado */}
          <div className="challenge__panel challenge__panel--statement">
            <h2 className="challenge__panel-title">
              {active.title}
              <span className="badge badge--accent">{active.language}</span>
            </h2>
            {statementError ? (
              <StatusText tone="muted">{statementError}</StatusText>
            ) : statement ? (
              <div className="challenge__markdown">
                <ReactMarkdown
                  components={{
                    pre: ({ children }) => <pre className="md-pre">{children}</pre>,
                    code: (props) => <code className="md-code" {...props} />,
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noreferrer noopener">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {statement}
                </ReactMarkdown>
              </div>
            ) : (
              <StatusText tone="muted">Carregando enunciado…</StatusText>
            )}
          </div>

          {/* PAINEL CENTRAL — editor */}
          <div className="challenge__panel challenge__panel--editor">
            <FileExplorer
              files={files}
              activePath={null}
              onOpenFile={(p) => editorRef.current?.openFile(p)}
              onCreateFile={(n) => editorRef.current?.createFile(n)}
              onDeleteFile={(p) => editorRef.current?.deleteFile(p)}
              onRefresh={() => active && void loadWorkspace(active)}
            />
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
          </div>

          {/* PAINEL DIREITO/INFERIOR — saída + feedback + botões */}
          <div className="challenge__panel challenge__panel--output">
            <div className="challenge__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={testAnswerClick}
                disabled={!canTest}
              >
                {testStatus === 'running' || piStatus === 'running' ? (
                  <InlineSpinner text="Testando…" />
                ) : (
                  <>
                    <Play size={14} /> Testar resposta
                  </>
                )}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={abortPi}
                disabled={piStatus !== 'running'}
              >
                <Ban size={14} /> Abortar
              </button>
            </div>

            <div className="challenge__section-title">
              <Database size={13} /> Testes (determinístico)
            </div>
            <div className="challenge__terminal">
              <AnswerTerminal ref={termRef} aria-label="Saída dos testes" />
            </div>

            <div className="challenge__section-title">
              <Cpu size={13} /> Feedback do pi
              {piStatus === 'running' ? (
                <span className="challenge__pi-running">
                  <Loader2 size={12} className="spin" /> rodando…
                </span>
              ) : null}
              {piStatus === 'aborted' ? <span className="badge badge--muted">abortado</span> : null}
            </div>

            <div className="challenge__feedback">
              <button
                type="button"
                className="challenge__thinking-toggle"
                onClick={() => setShowThinking((s) => !s)}
              >
                {showThinking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Raciocínio…
              </button>

              {blocks.filter((b) => b.kind === 'text' || b.kind === 'tool' || b.kind === 'error').length >
              0 ? (
                <div className="challenge__stream mono">
                  {blocks
                    .filter((b) => (showThinking ? true : b.kind !== 'thinking'))
                    .map((b, i) => (
                      <div key={i} className={`challenge__stream-block is-${b.kind}`}>
                        {b.text}
                      </div>
                    ))}
                </div>
              ) : null}

              {piFinal ? (
                <pre className="challenge__final mono">{piFinal}</pre>
              ) : null}
              {piError ? <StatusText tone="danger">{piError}</StatusText> : null}
            </div>
          </div>
        </div>
      )}
    </section>
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