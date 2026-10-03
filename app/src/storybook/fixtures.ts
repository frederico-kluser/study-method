/**
 * src/storybook/fixtures.ts — dados de exemplo das stories do Storybook.
 *
 * Um único MUNDO coerente alimenta o mock de API (mockApi.ts) e as stories: as
 * trilhas, as aulas, os desafios e os desfechos partilham ids/slugs, para que
 * uma story de vista composta (Trilha → Aula → Desafio) faça sentido.
 *
 *   - cada fixture é EXPORTADO e TIPADO com os tipos reais do contrato
 *     (`@shared/ipc-contract`) — nunca objetos soltos sem tipo;
 *   - o universo canónico é a trilha `python-iniciante` (2 módulos, 6 aulas):
 *     `aula-1` concluída, `aula-2` em curso (current) e as restantes
 *     bloqueadas — os estados mistos que as vistas desenham;
 *   - `c-iniciante` (por começar) e `rust-iniciante` (proficiência passada,
 *     aulas todas destravadas) completam a listagem;
 *   - os ids dos modelos locais/voz seguem os catálogos reais
 *     (shared/constants/localModels.ts) para os cards renderizarem como no app;
 *   - só os PAYLOADS tipados vivem aqui — os sucessos triviais (`{ ok: true }`)
 *     são resolvidos pelo próprio mockApi.
 */
import type {
  AppSettings,
  ChallengeAttemptRow,
  ChallengeInfo,
  DownloadProgress,
  GameLevelPayload,
  GameRunResult,
  GameWorldSummary,
  GetLessonByIdResult,
  HardwareInfo,
  JudgeAnswerOutcome,
  KeysStatus,
  LessonExercise,
  LessonRow,
  LessonSummary,
  LocalAiChatResult,
  LocalModelInfo,
  LocalTtsPreference,
  MarkChallengeAttemptResult,
  MathAnswerCheckResult,
  PiExecuteResult,
  PiStreamEvent,
  QuizAttemptDto,
  QuizAttemptReply,
  QuizExplainReply,
  QuizHistoryReply,
  QuizRemedialReply,
  QuizRemediationDto,
  QuizSectionMasteryDto,
  RemedialQuizDto,
  ResearchProgressEvent,
  StartupStatus,
  SttEngineStatusPayload,
  SttModelProgressPayload,
  SttModelStatus,
  SttPartialPayload,
  StudyFinding,
  StudyLesson,
  SubjectSummary,
  TestAnswerResult,
  TrackAssertionDto,
  TrackChallengeSpec,
  TrackChallengeSummaryDto,
  TrackDetailPayload,
  TrackLessonPayload,
  TrackListEntry,
  TrackListResult,
  TrackModuleEntry,
  TrackOrphansResult,
  TrackRegenerateResult,
  TrackSourceLinkDto,
  TrackSubmitResult,
  TrackTheorySectionDto,
  TtsDownloadProgressPayload,
  TtsGenerateResult,
  TtsModelInfo,
  TutorReply,
  ValidationResult,
  WorkspaceFile,
} from '@shared/ipc-contract';
import type { LessonProgress } from '../../electron/main/services/lessonTypes';

// ─── Configuração, chaves e gate de início ───────────────────────────────────

/** Definições plausíveis de `settings:get` (o app recém-configurado). */
export const fixtureSettings: AppSettings = {
  setupsDir: '/home/aluno/StudyMethod/setups',
  lastSubject: 'Funções em Python',
  defaultModelProvider: 'local',
  defaultModelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M',
  language: 'pt-BR',
};

/** Estado das chaves de API — as duas configuradas e validadas. */
export const fixtureKeysStatus: KeysStatus = {
  llmConfigured: true,
  braveConfigured: true,
  llmValidated: true,
  braveValidated: true,
};

/** `keys:startup-status` do gate de início — fase 'ready' (app livre). */
export const fixtureStartupStatus: StartupStatus = {
  phase: 'ready',
  llm: { configured: true, valid: true },
  brave: { configured: true, valid: true },
  offline: false,
  checkedAt: '2026-02-10T09:00:00.000Z',
};

/** Validação de chave OpenRouter bem-sucedida (painel de chaves). */
export const fixtureValidationLlm: ValidationResult = {
  isValid: true,
  provider: 'openrouter',
  checkedAt: '2026-02-10T09:00:05.000Z',
};

/** Validação de chave Brave bem-sucedida (painel de chaves). */
export const fixtureValidationBrave: ValidationResult = {
  isValid: true,
  provider: 'brave',
  checkedAt: '2026-02-10T09:00:06.000Z',
};

// ─── LLM local (hardware e catálogo de modelos) ──────────────────────────────

/** Máquina plausível para o painel de LLM local (GPU com 12 GB de VRAM). */
export const fixtureHardwareInfo: HardwareInfo = {
  backend: 'cuda',
  ramGb: 32,
  vramGb: 12,
  cpuModel: 'Intel Core i7-13700H',
};

/**
 * Catálogo de modelos locais — mesmos ids do `LOCAL_MODEL_CATALOG` real
 * ("<repo>:<quant>"), com o default descarregado/ativo e o resto por baixar.
 */
export const fixtureLocalModels: LocalModelInfo[] = [
  {
    id: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M',
    label: 'LFM2.5-8B-A1B (Q4_K_M)',
    hfRepo: 'LiquidAI/LFM2.5-8B-A1B-GGUF',
    filename: 'LFM2.5-8B-A1B-Q4_K_M.gguf',
    quant: 'Q4_K_M',
    sizeBytes: 5_580_000_000,
    recommended: true,
    active: true,
    downloaded: true,
    agentReady: true,
  },
  {
    id: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q5_K_M',
    label: 'LFM2.5-8B-A1B (Q5_K_M)',
    hfRepo: 'LiquidAI/LFM2.5-8B-A1B-GGUF',
    filename: 'LFM2.5-8B-A1B-Q5_K_M.gguf',
    quant: 'Q5_K_M',
    sizeBytes: 6_220_000_000,
    downloaded: false,
    agentReady: true,
  },
  {
    id: 'LiquidAI/LFM2-1.2B-GGUF:Q4_K_M',
    label: 'LFM2-1.2B (Q4_K_M)',
    hfRepo: 'LiquidAI/LFM2-1.2B-GGUF',
    filename: 'LFM2-1.2B-Q4_K_M.gguf',
    quant: 'Q4_K_M',
    sizeBytes: 1_070_000_000,
    downloaded: true,
    agentReady: true,
  },
];

/** Avaliação de um modelo local em bloco (`localAi:chat`). */
export const fixtureLocalAiChat: LocalAiChatResult = {
  text: 'A função `dobro` está correta: multiplica o argumento por 2 e devolve o resultado. Falta apenas tratar o caso de entrada não numérica.',
};

/** Progresso de download de um modelo local (evento `localAi:download-progress`). */
export const fixtureDownloadProgress: DownloadProgress = {
  modelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q4_K_M',
  transferredBytes: 2_340_000_000,
  totalBytes: 5_580_000_000,
  percent: 42,
  speedBps: 12_400_000,
  done: false,
};

// ─── Pi (agente de código) ───────────────────────────────────────────────────

/** Resultado de uma corrida do Pi que terminou com sucesso. */
export const fixturePiExecuteResult: PiExecuteResult = {
  success: true,
  output:
    '✔ dobro de 0 devolve 0\n✔ dobro de 7 devolve 14\n✔ dobro de -3 devolve -6\n3 passed in 0.05s',
  executionTimeMs: 1842,
};

/**
 * Sequência de eventos do Pi (push `pi:stream-event`) — o que a ChallengeView
 * desenha durante a fase de correção com IA.
 */
export const fixturePiStreamEvents: PiStreamEvent[] = [
  { type: 'status_change', status: 'running', timestamp: 1_770_800_000_000 },
  { type: 'thinking_delta', data: 'O teste falha porque o sinal não é preservado…', timestamp: 1_770_800_001_000 },
  { type: 'text_delta', data: 'O problema está em `dobro`: ', timestamp: 1_770_800_002_000 },
  { type: 'tool_start', toolName: 'edit', data: 'solution.py', timestamp: 1_770_800_003_000 },
  { type: 'tool_end', toolName: 'edit', data: 'solution.py', timestamp: 1_770_800_004_000 },
  { type: 'agent_end', data: 'Corrigido: `return n * 2` preserva o sinal.', timestamp: 1_770_800_005_000 },
];

// ─── Study legado (geração de aulas, tópicos e workspace) ────────────────────

/** Matérias persistidas (`study:list-topics`). */
export const fixtureSubjectTopics: SubjectSummary[] = [
  {
    id: 'subject-1',
    name: 'Funções em Python',
    slug: 'funcoes-em-python',
    domain: 'programming',
    lessonCount: 4,
    answeredCount: 2,
  },
  {
    id: 'subject-2',
    name: 'Álgebra básica',
    slug: 'algebra-basica',
    domain: 'math',
    lessonCount: 3,
    answeredCount: 1,
  },
];

/** Aulas de `funcoes-em-python` (`study:list-lessons-by-subject`) — 1 concluída. */
export const fixtureLessonSummaries: LessonSummary[] = [
  {
    id: 'lesson-1',
    title: 'O que é uma função?',
    body: 'Uma função é um bloco de código reutilizável que recebe entradas e devolve uma saída.',
    difficulty: 1,
    completedAt: '2026-02-08T15:20:00.000Z',
  },
  {
    id: 'lesson-2',
    title: 'Parâmetros e retorno',
    body: 'Parâmetros entram pela assinatura; o valor de saída volta por `return`.',
    difficulty: 2,
    completedAt: null,
  },
  {
    id: 'lesson-3',
    title: 'Escopo e closures',
    body: 'O que uma função enxerga do mundo exterior, e o que aprisiona para sempre.',
    difficulty: 3,
    completedAt: null,
  },
  {
    id: 'lesson-4',
    title: 'Recursão simples',
    body: 'Uma função que se chama a si própria precisa de um caso base.',
    difficulty: 3,
    completedAt: null,
  },
];

/** Linha completa de uma aula persistida (o corpo é markdown curto). */
export const fixtureLessonRow: LessonRow = {
  id: 'lesson-1',
  subject_id: 'subject-1',
  title: 'O que é uma função?',
  body:
    '# O que é uma função?\n\n' +
    'Uma função é um bloco de código com nome que você pode reutilizar.\n\n' +
    '```python\ndef dobro(n):\n    return n * 2\n```\n',
  difficulty: 1,
  parent_lesson_id: null,
  origin_lesson_id: null,
  created_at: '2026-02-08T14:00:00.000Z',
  completed_at: '2026-02-08T15:20:00.000Z',
  exercise: null,
};

/** `study:get-lesson-by-id` de `lesson-1` (com desafio fundido, ONDA5). */
export const fixtureGetLessonById: GetLessonByIdResult = {
  lesson: fixtureLessonRow,
  exercise: null,
  domain: 'programming',
  subjectSlug: 'funcoes-em-python',
  challenge: { slug: 'funcoes-reutilizaveis', title: 'Desafio: funções reutilizáveis' },
};

/** Exercício de matemática persistido (a mathLib computou o esperado). */
export const fixtureLessonExercise: LessonExercise = {
  kind: 'math',
  family: 'linear-equations',
  seed: 42,
  prompt: 'Resolva a equação 3x + 7 = 22. Qual é o valor de x?',
  expectedNormalized: '5',
};

/** `study:check-math-answer` — resposta certa recomputada por execução. */
export const fixtureMathAnswerCheck: MathAnswerCheckResult = {
  correct: true,
  expectedNormalized: '5',
};

/** `study:judge-answer` — interpretação parcialmente correta (LLM remoto). */
export const fixtureJudgeAnswer: JudgeAnswerOutcome = {
  ok: true,
  verdict: 'partial',
  feedback:
    'A sua ideia de isolar o x está certa, mas faltou dividir os dois membros por 3 depois de subtrair 7.',
  provider: 'openrouter',
};

/** `study:test-answer` — todos os testes determinísticos passaram. */
export const fixtureTestAnswerResult: TestAnswerResult = {
  success: true,
  testsRun: 3,
  expectedTests: 3,
  passed: true,
  output: '✔ dobro de 0 devolve 0\n✔ dobro de 7 devolve 14\n✔ dobro de -3 devolve -6\n3 passed in 0.05s',
  verdictFeedback: 'Todos os testes passaram — pode avançar.',
};

/** Ficheiros do workspace de um desafio (`study:list-workspace-files`). */
export const fixtureWorkspaceFiles: WorkspaceFile[] = [
  { path: 'README.md', name: 'README.md', size: 412, dir: false, language: 'markdown' },
  { path: 'solution.py', name: 'solution.py', size: 268, dir: false, language: 'python' },
  { path: 'test_solution.py', name: 'test_solution.py', size: 355, dir: false, language: 'python' },
  { path: 'src', name: 'src', size: 0, dir: true },
];

/** Conteúdo dos ficheiros do workspace (para o editor e as stories de código). */
export const fixtureWorkspaceFileContents: Record<string, string> = {
  'README.md':
    '# Desafio: funções reutilizáveis\n\n' +
    'Implemente `dobro(n)` devolvendo o dobro de `n`, preservando o sinal.\n',
  'solution.py': 'def dobro(n):\n    return n * 2\n',
  'test_solution.py':
    'import unittest\nfrom solution import dobro\n\n' +
    'class TesteDobro(unittest.TestCase):\n' +
    '    def test_zero(self):\n        self.assertEqual(dobro(0), 0)\n',
};

/** Desafios do setup `funcoes-em-python` (`study:list-challenges`). */
export const fixtureChallengeInfos: ChallengeInfo[] = [
  {
    challengeId: '0001-funcoes-reutilizaveis',
    title: 'Desafio: funções reutilizáveis',
    language: 'python',
    concept: 'funcoes',
    difficulty: 2,
    status: 'validated',
    verdict: 'approved',
    workspaceDir: '/home/aluno/StudyMethod/setups/funcoes-em-python/challenges/0001-funcoes-reutilizaveis',
    statementPath:
      '/home/aluno/StudyMethod/setups/funcoes-em-python/challenges/0001-funcoes-reutilizaveis/README.md',
    slug: 'funcoes-reutilizaveis',
    subjectId: 'subject-1',
  },
  {
    challengeId: '0002-recursao-simples',
    title: 'Desafio: contagem recursiva',
    language: 'python',
    concept: 'recursao',
    difficulty: 3,
    status: 'validated',
    verdict: 'approved',
    workspaceDir: '/home/aluno/StudyMethod/setups/funcoes-em-python/challenges/0002-recursao-simples',
    statementPath:
      '/home/aluno/StudyMethod/setups/funcoes-em-python/challenges/0002-recursao-simples/README.md',
    slug: 'recursao-simples',
    subjectId: 'subject-1',
  },
];

/** Fontes da pesquisa de uma aula (`study:get-findings`). */
export const fixtureStudyFindings: StudyFinding[] = [
  {
    query: 'funções em Python',
    title: 'Definindo funções — Documentação do Python',
    url: 'https://docs.python.org/pt/3/tutorial/controlflow.html#defining-functions',
    description: 'A referência oficial de assinatura, parâmetros e `return`.',
    score: 0.94,
  },
  {
    query: 'funções em Python',
    title: 'Python Functions — W3Schools',
    url: 'https://www.w3schools.com/python/python_functions.asp',
    description: 'Exemplos curtos de definição e chamada de funções.',
    score: 0.71,
  },
];

/** Aula gerada pelo fluxo legado (`study:generate-lesson`/`study:get-lesson`). */
export const fixtureStudyLesson: StudyLesson = {
  title: 'Funções em Python',
  subject: 'Funções em Python',
  markdown:
    '# Funções em Python\n\n' +
    '> Uma função é um bloco de código com nome que você reutiliza quando quiser.\n\n' +
    '## Analogia\n\n' +
    'Pense numa função como uma **receita**: tem ingredientes (parâmetros), ' +
    'um modo de fazer (o corpo) e um prato pronto (o retorno).\n\n' +
    '## Fórmula (KaTeX)\n\n' +
    'O dobro de um número $n$ é $d = 2n$.\n\n' +
    '## Código\n\n' +
    '```python\ndef dobro(n):\n    return n * 2\n\nprint(dobro(7))  # 14\n```\n',
  findings: fixtureStudyFindings,
  challenges: fixtureChallengeInfos,
  createdAt: '2026-02-10T10:00:00.000Z',
  lessonId: 'lesson-1',
  subjectId: 'subject-1',
};

/** Uma tentativa de desafio registrada (`study:mark-challenge-attempt`). */
export const fixtureChallengeAttempt: ChallengeAttemptRow = {
  id: 'attempt-1',
  subjectId: 'subject-1',
  lessonId: 'lesson-1',
  challengeId: 'funcoes-reutilizaveis',
  verdict: 'failed',
  stars: 1,
  durationMs: 184_000,
  createdAt: '2026-02-10T11:12:00.000Z',
};

/** `study:mark-challenge-attempt` — a linha gravada volta inteira. */
export const fixtureMarkChallengeAttempt: MarkChallengeAttemptResult = {
  ok: true,
  attempt: fixtureChallengeAttempt,
};

/**
 * Evento `study:test-answer-event` — o main emite `{ phase, challengeDir,
 * result?|error? }` (docs/app-gui.md §2.3; consumido por mapTestAnswerPhase).
 */
export interface TestAnswerEvent {
  phase: 'started' | 'done';
  challengeDir: string;
  result?: TestAnswerResult;
  error?: string;
}

/** Evento de teste concluído — o payload que a ChallengeView reflete no status. */
export const fixtureTestAnswerEvent: TestAnswerEvent = {
  phase: 'done',
  challengeDir: '/home/aluno/StudyMethod/setups/funcoes-em-python/challenges/0001-funcoes-reutilizaveis',
  result: fixtureTestAnswerResult,
};

/** Fase de geração de aula (evento `study:lesson-progress`). */
export const fixtureLessonProgress: LessonProgress = {
  phase: 'authoring',
  message: 'Escrevendo a aula…',
  fraction: 0.5,
};

/**
 * Sequência COMPLETA de `study:research-progress` (plano → rodada → fecho) — a
 * mesma ordem que o main emite e que o e2eStubs reproduz.
 */
export const fixtureResearchProgressEvents: ResearchProgressEvent[] = [
  {
    kind: 'research:plan',
    subQuestions: [
      { id: 'sq1', question: 'funções em Python: conceito e fundamentos' },
      { id: 'sq2', question: 'funções em Python: exemplos e erros comuns' },
    ],
    queries: [
      { id: 'q1', q: 'funções em Python conceito', sub: 'sq1', category: 'official-docs' },
      { id: 'q2', q: 'funções em Python erros comuns', sub: 'sq2', category: 'common-errors' },
    ],
    maxRounds: 1,
  },
  { kind: 'research:round-start', round: 1, totalRounds: 1 },
  { kind: 'research:query-start', queryId: 'q1', q: 'funções em Python conceito' },
  {
    kind: 'research:query-done',
    queryId: 'q1',
    q: 'funções em Python conceito',
    ok: true,
    provider: 'brave',
    hits: 3,
    latencyMs: 142,
  },
  { kind: 'research:query-start', queryId: 'q2', q: 'funções em Python erros comuns' },
  {
    kind: 'research:query-done',
    queryId: 'q2',
    q: 'funções em Python erros comuns',
    ok: true,
    provider: 'brave',
    hits: 2,
    latencyMs: 128,
  },
  { kind: 'research:round-done', round: 1, ok: 2, failed: 0, uniqueSources: 4 },
  { kind: 'research:done', sources: 4, rounds: 1, stopReason: 'pesquisa planejada concluída' },
];

// ─── Trilhas (rodada 8) ──────────────────────────────────────────────────────

/**
 * As três trilhas instaladas (`track:list`) com o progresso do aluno.
 * `python-iniciante` é a canónica — os números batem certo com
 * `fixtureTrackDetail` (2 módulos, 6 aulas, 1 concluída).
 */
export const fixtureTrackEntries: TrackListEntry[] = [
  {
    slug: 'python-iniciante',
    title: 'Python do Zero',
    description: 'Primeiros passos em Python: variáveis, tipos, condicionais e estruturas de dados.',
    domain: 'programming',
    moduleCount: 2,
    lessonCount: 6,
    doneCount: 1,
    proficient: false,
  },
  {
    slug: 'c-iniciante',
    title: 'C do Zero',
    description: 'Fundamentos de C: sintaxe, memória e ponteiros para quem nunca programou.',
    domain: 'programming',
    moduleCount: 1,
    lessonCount: 3,
    doneCount: 0,
    proficient: false,
  },
  {
    slug: 'rust-iniciante',
    title: 'Rust do Zero',
    description: 'Ownership, borrowing e enums — a base segura do Rust.',
    domain: 'programming',
    moduleCount: 2,
    lessonCount: 5,
    doneCount: 2,
    proficient: true,
  },
];

/** `track:list` — envelope ok com as três trilhas. */
export const fixtureTrackList: TrackListResult = {
  ok: true,
  tracks: fixtureTrackEntries,
};

/**
 * Módulos da trilha canónica (`track:get`) — estados mistos por aula:
 * `aula-1` concluída, `aula-2` current, `aula-3`… bloqueadas (progressão
 * sequencial) e um desafio de módulo com tentativa falhada.
 */
export const fixtureTrackModules: TrackModuleEntry[] = [
  {
    slug: 'fundamentos',
    title: 'Fundamentos',
    order: 1,
    challengeAvailable: true,
    challenge: { slug: 'desafio-modulo-fundamentos', title: 'Desafio do módulo: Fundamentos' },
    challengeLastVerdict: 'failed',
    challengeStars: 1,
    lessons: [
      {
        slug: 'aula-1',
        moduleSlug: 'fundamentos',
        title: 'Olá, Python',
        summary: 'Como rodar o primeiro programa e ler a saída.',
        difficulty: 1,
        locked: false,
        done: true,
        current: false,
      },
      {
        slug: 'aula-2',
        moduleSlug: 'fundamentos',
        title: 'Variáveis e tipos',
        summary: 'Guardar valores com nome e conhecer os tipos básicos.',
        difficulty: 2,
        locked: false,
        done: false,
        current: true,
      },
      {
        slug: 'aula-3',
        moduleSlug: 'fundamentos',
        title: 'Condicionais',
        summary: 'Decidir o caminho com if, elif e else.',
        difficulty: 2,
        locked: true,
        done: false,
        current: false,
      },
    ],
  },
  {
    slug: 'estruturas-de-dados',
    title: 'Estruturas de dados',
    order: 2,
    challengeAvailable: false,
    challenge: null,
    challengeLastVerdict: null,
    challengeStars: 0,
    lessons: [
      {
        slug: 'aula-4',
        moduleSlug: 'estruturas-de-dados',
        title: 'Listas e fatiamento',
        summary: 'Guardar muitos valores em ordem.',
        difficulty: 2,
        locked: true,
        done: false,
        current: false,
      },
      {
        slug: 'aula-5',
        moduleSlug: 'estruturas-de-dados',
        title: 'Dicionários',
        summary: 'Associar chaves a valores.',
        difficulty: 3,
        locked: true,
        done: false,
        current: false,
      },
      {
        slug: 'aula-6',
        moduleSlug: 'estruturas-de-dados',
        title: 'Conjuntos e tuplas',
        summary: 'Valores sem repetição e sequências imutáveis.',
        difficulty: 3,
        locked: true,
        done: false,
        current: false,
      },
    ],
  },
];

/** `track:get` da trilha canónica (detalhe completo). */
export const fixtureTrackDetail: TrackDetailPayload = {
  slug: 'python-iniciante',
  title: 'Python do Zero',
  description: 'Primeiros passos em Python: variáveis, tipos, condicionais e estruturas de dados.',
  domain: 'programming',
  modules: fixtureTrackModules,
  proficiencyAvailable: true,
  proficient: false,
  doneCount: 1,
  lessonCount: 6,
};

/**
 * Seções de teoria de `aula-2` — o tutor apresenta-as uma a uma. As seções
 * misturam markdown com LISTA, bloco de CÓDIGO e fórmula KaTeX, para as
 * stories exercitarem o renderizador completo.
 */
export const fixtureTrackTheory: TrackTheorySectionDto[] = [
  {
    id: 'sec-variavel',
    title: 'O que é uma variável?',
    markdown:
      'Uma variável é um **nome** que aponta para um valor na memória.\n\n' +
      '- o nome escolhe-se livremente (`temperatura`, `n`, `total`);\n' +
      '- o valor tem um TIPO (`int`, `float`, `str`, `bool`);\n' +
      '- o `=` não é uma igualdade: é uma **atribuição**.\n',
    code: {
      language: 'python',
      code: 'temperatura = 23\nnome = "Faber"\nativo = True',
      explanation: 'Três variáveis, três tipos: inteiro, texto e booleano.',
    },
  },
  {
    id: 'sec-atribuicao',
    title: 'Atribuição e tipos',
    markdown:
      'O Python descobre o tipo pelo valor à direita do `=`.\n\n' +
      'A conversão de Fahrenheit para Celsius é a fórmula $c = \\frac{5}{9}(f - 32)$.\n\n' +
      'Use `float(...)` quando a conta puder ter casas decimais.\n',
    code: {
      language: 'python',
      code: 'f = 98.6\nc = (f - 32) * 5 / 9\nprint(c)  # 37.0',
      explanation: 'A atribuição cria `c` com o resultado da expressão.',
    },
  },
  {
    id: 'sec-conversao',
    title: 'Conversão de tipos',
    markdown:
      'Converter é explícito: `int("7")`, `float("3.5")`, `str(7)`.\n\n' +
      '1. lê o valor como texto;\n' +
      '2. converte para o tipo certo;\n' +
      '3. só então faz a conta.\n\n' +
      'A regra de ouro: a área de um círculo é $A = \\pi r^2$ — o tipo de `r` decide o tipo do resultado.\n',
    code: {
      language: 'python',
      code: 'entrada = input("Temperatura em F: ")\nf = float(entrada)\nprint((f - 32) * 5 / 9)',
      explanation: 'Sem o `float(...)`, o texto entraria na conta e o Python reclamaria.',
    },
  },
];

/** Fontes da aula (`track:lesson.sources`) — só o botão "Fontes" as mostra. */
export const fixtureTrackSources: TrackSourceLinkDto[] = [
  {
    title: 'Tipos básicos — Documentação do Python',
    url: 'https://docs.python.org/pt/3/tutorial/introduction.html',
    description: 'A referência oficial de literais, variáveis e tipos.',
  },
  {
    title: 'Built-in Types — Documentação do Python',
    url: 'https://docs.python.org/pt/3/library/stdtypes.html',
    description: 'Detalhe de int, float, str e bool.',
  },
];

/**
 * Quizzes de `aula-2` (afirmações) — cada um ancorado à seção de teoria que o
 * demonstra, com racional por opção (o contrato pede EXATAMENTE 4).
 */
export const fixtureTrackAssertions: TrackAssertionDto[] = [
  {
    id: 'assert-tipos',
    statement: 'Em Python, o tipo de uma variável é decidido pelo valor atribuído.',
    question: 'O que decide o tipo da variável em `temperatura = 23`?',
    options: [
      'O nome da variável',
      'A declaração explícita antes do `=`',
      'O valor à direita do `=`',
      'A primeira letra do nome',
    ],
    answerIndex: 2,
    feedback: 'O Python é dinamicamente tipado: o tipo vem do valor atribuído.',
    sectionId: 'sec-variavel',
    optionRationales: [
      'O nome não carrega tipo — `temperatura` poderia receber um texto.',
      'Python não tem declaração de tipo obrigatória.',
      'Correto: o valor à direita do `=` define o tipo.',
      'Convenções de nome (snake_case) não afetam o tipo.',
    ],
  },
  {
    id: 'assert-conversao',
    statement: 'A conversão de tipos em Python é sempre explícita.',
    question: 'Como converter o texto `"3.5"` em número antes de somar?',
    options: ['Somar direto e o Python converte', 'Usar float("3.5")', 'Usar str("3.5")', 'Não é possível'],
    answerIndex: 1,
    feedback: 'Conversões são explícitas: `float("3.5")` devolve 3.5.',
    sectionId: 'sec-conversao',
    optionRationales: [
      'Somar texto e número lança TypeError.',
      'Correto: `float("3.5")` converte o texto em número.',
      '`str(...)` mantém o valor como texto.',
      'É possível — com as funções de conversão.',
    ],
  },
];

/** Resumo do desafio de `aula-2` (o card dentro do conteúdo da aula). */
export const fixtureTrackChallengeSummary: TrackChallengeSummaryDto = {
  slug: 'desafio-aula-2-temperatura',
  title: 'Desafio: converter temperatura',
  concept: 'tipos',
  difficulty: 2,
  lastVerdict: 'failed',
  stars: 1,
  failedCount: 2,
  generated: false,
};

/** `track:lesson` de `aula-2` — a aula rica (teoria + quizzes + desafio). */
export const fixtureTrackLesson = {
  slug: 'aula-2',
  moduleSlug: 'fundamentos',
  trackTitle: 'Python do Zero',
  title: 'Variáveis e tipos',
  summary: 'Guardar valores com nome e conhecer os tipos básicos.',
  difficulty: 2,
  concepts: ['variáveis', 'tipos', 'atribuição', 'conversão'],
  prerequisites: [{ slug: 'aula-1', title: 'Olá, Python' }],
  theory: fixtureTrackTheory,
  assertions: fixtureTrackAssertions,
  sources: fixtureTrackSources,
  challenges: [fixtureTrackChallengeSummary],
  locked: false,
  done: false,
  nextLesson: { slug: 'aula-3', title: 'Condicionais' },
} satisfies TrackLessonPayload;

/**
 * `track:challenge` de `aula-2` — enunciado + starter multi-arquivo + o
 * histórico de vereditos do aluno (`lastVerdict`/`stars`/`failedCount`).
 */
export const fixtureTrackChallenge: TrackChallengeSpec = {
  slug: 'desafio-aula-2-temperatura',
  title: 'Desafio: converter temperatura',
  concept: 'tipos',
  difficulty: 2,
  statement:
    '# Converter temperatura\n\n' +
    'Escreva `para_celsius(f)` que recebe a temperatura em Fahrenheit e devolve em Celsius.\n\n' +
    'A fórmula é $c = \\frac{5}{9}(f - 32)$.\n\n' +
    '- `para_celsius(32)` deve devolver `0.0`;\n' +
    '- `para_celsius(212)` deve devolver `100.0`;\n' +
    '- o resultado deve ser `float`, mesmo quando dá número redondo.\n',
  files: [
    {
      path: 'solution.py',
      starterCode: 'def para_celsius(f):\n    # TODO: aplique a fórmula\n    raise NotImplementedError\n',
    },
  ],
  starterCode: 'def para_celsius(f):\n    # TODO: aplique a fórmula\n    raise NotImplementedError\n',
  expectedTestCount: 3,
  minFirstStarMs: 45_000,
  timeLimitMs: 210_000,
  source: 'track',
  lastVerdict: 'failed',
  stars: 1,
  failedCount: 2,
};

/**
 * `track:challenge-submit` — tentativa PARCIAL (2 de 3 checks): o painel do
 * desafio desenha o veredito de falha com o checklist individual.
 */
export const fixtureTrackSubmitResult: TrackSubmitResult = {
  ok: true,
  passed: false,
  testsRun: 3,
  expectedTests: 3,
  output:
    '✔ para_celsius(32) devolve 0.0\n' +
    '✖ para_celsius(212) devolve 100.0\n' +
    '    AssertionError: 99.99999999999999 != 100.0\n' +
    '✔ o resultado é float',
  checks: [
    { name: 'para_celsius(32) devolve 0.0', passed: true },
    { name: 'para_celsius(212) devolve 100.0', passed: false },
    { name: 'o resultado é float', passed: true },
  ],
  passedCount: 2,
  totalCount: 3,
};

/** `track:challenge-regenerate` — desafio NOVO para não repetir o que falhou. */
export const fixtureTrackRegenerateResult: TrackRegenerateResult = {
  ok: true,
  challenge: {
    ...fixtureTrackChallenge,
    slug: 'desafio-gerado-arredondamento',
    title: 'Desafio: arredondar temperatura',
    statement:
      '# Arredondar temperatura\n\n' +
      'Escreva `para_celsius_arredondado(f)` devolvendo a temperatura em Celsius ' +
      'ARREDONDADA a uma casa decimal.\n\n' +
      '- `para_celsius_arredondado(98.6)` deve devolver `37.0`;\n' +
      '- `para_celsius_arredondado(72)` deve devolver `22.2`.\n',
    source: 'generated',
    lastVerdict: null,
    stars: 0,
    failedCount: 0,
  },
  failedContext: [{ slug: 'desafio-aula-2-temperatura', title: 'Desafio: converter temperatura' }],
};

/** `track:orphans` — um curso apagado do disco com progresso ainda guardado. */
export const fixtureTrackOrphans: TrackOrphansResult = {
  ok: true,
  orphans: [
    {
      slug: 'sql-basico',
      subjectName: 'SQL básico',
      domain: 'programming',
      attemptCount: 3,
      lessonsDoneCount: 2,
      hasProficiency: false,
      generatedChallengeCount: 1,
      rowCount: 7,
    },
  ],
  installedSlugs: ['python-iniciante', 'c-iniciante', 'rust-iniciante'],
};

/** `track:tutor-chat` — resposta do tutor à dúvida do aluno (ação 'answer'). */
export const fixtureTutorReply: TutorReply = {
  ok: true,
  message:
    'Boa pergunta! O `=` guarda um VALOR num nome — quando você escreve `f = 98.6`, ' +
    'o Python coloca o número 98.6 na memória e escreve `f` na etiqueta.',
  sectionId: null,
  done: true,
};

// ─── Quiz adaptativo (onda1-contrato-quiz) ───────────────────────────────────

/** Uma resposta do aluno ao quiz de `aula-2` (persistida em quiz_attempts). */
export const fixtureQuizAttemptDto: QuizAttemptDto = {
  trackSlug: 'python-iniciante',
  lessonId: 'aula-2',
  sectionKey: 'sec-variavel',
  assertionId: 'assert-tipos',
  selectedIndex: 1,
  correct: false,
  attemptNo: 1,
  quizOrigin: 'authored',
  createdAt: '2026-02-10T12:00:00.000Z',
};

/** Maestria por seção — o que o gate do desafio consulta. */
export const fixtureQuizMastery: QuizSectionMasteryDto[] = [
  {
    sectionKey: 'sec-variavel',
    mastered: true,
    attemptCount: 2,
    correctCount: 1,
    firstCorrectAt: '2026-02-10T12:03:00.000Z',
    lastAttemptAt: '2026-02-10T12:03:00.000Z',
  },
  {
    sectionKey: 'sec-conversao',
    mastered: false,
    attemptCount: 1,
    correctCount: 0,
    firstCorrectAt: null,
    lastAttemptAt: '2026-02-10T12:01:00.000Z',
  },
];

/** `track:quiz-attempt` — a linha gravada + a maestria recalculada. */
export const fixtureQuizAttemptReply: QuizAttemptReply = {
  ok: true,
  attempt: fixtureQuizAttemptDto,
  mastery: fixtureQuizMastery,
};

/** `track:quiz-explain` — por que a opção escolhida estava errada. */
export const fixtureQuizExplainReply: QuizExplainReply = {
  ok: true,
  explanation:
    'Escolheu "A declaração explícita antes do `=`", mas Python não tem declaração de tipo: ' +
    'o tipo nasce do valor atribuído. Repare em `temperatura = 23` — o `23` é que decide ' +
    'que a variável é inteira.',
};

/** Quiz remedial gerado sobre o MESMO conteúdo (forma de afirmação + identidade). */
export const fixtureRemedialQuiz: RemedialQuizDto = {
  id: 'remedial-assert-tipos-1',
  originAssertionId: 'assert-tipos',
  generation: 1,
  statement: 'Em Python, o tipo de uma variável nasce do valor atribuído a ela.',
  question: 'Depois de `x = "7"`, qual é o tipo de `x`?',
  options: ['inteiro', 'texto', 'booleano', 'depende do nome'],
  answerIndex: 1,
  feedback: 'As aspas fazem de "7" um texto (str), não um inteiro.',
  sectionId: 'sec-variavel',
  optionRationales: [
    'Seria inteiro se fosse `x = 7` (sem aspas).',
    'Correto: as aspas fazem de "7" um texto.',
    'Booleanos são apenas True/False.',
    'O nome não interfere no tipo.',
  ],
};

/** `track:quiz-remedial` — o quiz novo depois da explicação do erro. */
export const fixtureQuizRemedialReply: QuizRemedialReply = {
  ok: true,
  quiz: fixtureRemedialQuiz,
};

/** Remediação persistida (explicação já lida + o quiz que veio depois dela). */
export const fixtureQuizRemediation: QuizRemediationDto = {
  id: 'remediation-1',
  trackSlug: 'python-iniciante',
  lessonId: 'aula-2',
  sectionKey: 'sec-variavel',
  originAssertionId: 'assert-tipos',
  generation: 1,
  explanation: fixtureQuizExplainReply.ok ? fixtureQuizExplainReply.explanation : '',
  quiz: fixtureRemedialQuiz,
  createdAt: '2026-02-10T12:02:00.000Z',
};

/** `track:quiz-history` — tentativas + remediações + maestria da aula. */
export const fixtureQuizHistoryReply: QuizHistoryReply = {
  ok: true,
  attempts: [fixtureQuizAttemptDto],
  remediations: [fixtureQuizRemediation],
  mastery: fixtureQuizMastery,
};

// ─── Games (ONDA-GAMES) ──────────────────────────────────────────────────────

/** Mundos/níveis com o progresso do aluno (`games:list-worlds`). */
export const fixtureGameWorlds: GameWorldSummary[] = [
  {
    id: 'mundo-eco',
    title: 'O Eco das Variáveis',
    description: 'Entrada e saída, uma variável de cada vez.',
    levels: [
      { id: 'nivel-1', title: 'Primeiro eco', boss: false, completed: true, bestLines: 6, bestTimeMs: 420 },
      { id: 'nivel-2', title: 'Eco em laço', boss: false, completed: true, bestLines: 9 },
      { id: 'nivel-3', title: 'Chefe: o eco multiplicado', boss: true, completed: false },
    ],
  },
  {
    id: 'mundo-labirinto',
    title: 'O Labirinto dos Arrays',
    description: 'Percorrer listas sem se perder.',
    levels: [
      { id: 'nivel-1', title: 'A primeira porta', boss: false, completed: false },
      { id: 'nivel-2', title: 'Chefe: o corredor invertido', boss: true, completed: false },
    ],
  },
];

/** Nível carregado para jogar (`games:load-level`) — SEM spoilers. */
export const fixtureGameLevelPayload: GameLevelPayload = {
  id: 'nivel-2',
  title: 'Eco em laço',
  enunciado:
    'Leia linhas da entrada e devolva cada uma com o prefixo "eco: ".\n' +
    'A entrada termina quando não há mais linhas.',
  introduces: ['lacos', 'entrada-saida'],
  starter: 'while True:\n    linha = input()\n    # TODO: devolva "eco: " + linha\n',
  caseCount: 3,
  hiddenCount: 2,
  optimize: { lines: { par: 8 }, timeMs: { parMs: 500 } },
  boss: false,
};

/** `games:run` — veredito com casos visíveis + métricas do modo otimização. */
export const fixtureGameRunResult: GameRunResult = {
  ok: true,
  cases: [
    { name: 'caso 1', ok: true, expected: 'eco: olá', actual: 'eco: olá' },
    { name: 'caso 2', ok: true, expected: 'eco: mundo', actual: 'eco: mundo' },
    { name: 'caso oculto 1', ok: true },
  ],
  metrics: { lines: 9, timeMs: 460 },
  best: { lines: 8, timeMs: 420 },
  histogram: { bins: [12, 10, 8, 5, 3], myIndex: 2, par: 8 },
  completed: true,
};

// ─── Voz local (STT/TTS — onda 8) ────────────────────────────────────────────

/** Modelos de STT e o seu estado de instalação (`stt:model-status`). */
export const fixtureSttModelStatuses: SttModelStatus[] = [
  {
    modelId: 'sherpa-nemo-nano',
    state: 'installed',
    embedded: true,
    downloadedBytes: 64_000_000,
    totalBytes: 64_000_000,
    progress: 1,
  },
  {
    modelId: 'sherpa-nemo-small',
    state: 'absent',
    embedded: false,
    downloadedBytes: 0,
    totalBytes: 128_000_000,
    progress: 0,
  },
];

/** Progresso de download de um modelo de STT (push `stt:model-download-progress`). */
export const fixtureSttModelProgress: SttModelProgressPayload = {
  modelId: 'sherpa-nemo-small',
  progress: 0.37,
  downloadedBytes: 47_000_000,
  totalBytes: 128_000_000,
};

/** Transcrição parcial cumulativa (push `stt:stream-partial`). */
export const fixtureSttPartial: SttPartialPayload = {
  sessionId: 'mic',
  text: 'explique-me o que é uma variável',
  isFinal: false,
};

/** Estado do motor de STT (push `stt:engine-status`). */
export const fixtureSttEngineStatus: SttEngineStatusPayload = { status: 'ready' };

/** Catálogo de TTS local (`localTts:list`) — o pt-BR embutido e o en por baixar. */
export const fixtureTtsModels: TtsModelInfo[] = [
  {
    id: 'piper-pt-br-faber',
    language: 'pt-BR',
    label: 'Piper — Faber (pt-BR)',
    embedded: true,
    installed: true,
    sampleRate: 22050,
    totalSizeBytes: 63_000_000,
  },
  {
    id: 'piper-en-amy',
    language: 'en',
    label: 'Piper — Amy (en)',
    embedded: false,
    installed: false,
    sampleRate: 22050,
    totalSizeBytes: 65_000_000,
  },
];

/** Preferência persistida do TTS (`localTts:get-preference`). */
export const fixtureTtsPreference: LocalTtsPreference = {
  modelId: 'piper-pt-br-faber',
  defaultVoiceId: 'default',
  speed: 1,
};

/** `localTts:generate` — um WAV mínimo válido em base64 (cabeçalho RIFF). */
export const fixtureTtsGenerateResult: TtsGenerateResult = {
  audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=',
  format: 'wav',
  sampleRate: 22050,
};

/** Progresso de download de um modelo de TTS (push `localTts:download-progress`). */
export const fixtureTtsDownloadProgress: TtsDownloadProgressPayload = {
  modelId: 'piper-en-amy',
  progress: 0.28,
  downloadedBytes: 18_000_000,
  totalBytes: 65_000_000,
};