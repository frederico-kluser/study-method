/**
 * shared/ipc-contract.ts — CONTRATO único entre main process, preload e renderer.
 *
 * CONGELADO no COMMIT PREP da onda 1: todos os agentes implementam CONTRA estes
 * nomes de canal e estes tipos base. Nomes não mudam sem atualizar este arquivo
 * (e o preload/renderer juntos). Extensões de tipo por agente são permitidas
 * DENTRO dos seus arquivos, nunca renomeando canais já declarados aqui.
 */

// ─── Canais: chaves de API ────────────────────────────────────────────────────
export const KEYS_CHANNELS = {
  GET_STATUS: 'keys:get-status',
  SET_KEY: 'keys:set-key',
  VALIDATE_DEEPSEEK: 'keys:validate-deepseek',
  VALIDATE_BRAVE: 'keys:validate-brave',
  // ADITIVO (onda 6 — startup gate): o GATE DE INÍCIO consulta esse canal no
  // montage do AppGate. Registrado por `registerStartupHandlers` (um
  // registrador SEPARADO do registerKeysHandlers, que continua dono dos 4
  // canais acima). O preload expõe `window.api.keys.startupStatus` de forma
  // automática (deriva de API_GROUPS=KEYS_CHANNELS).
  STARTUP_STATUS: 'keys:startup-status',
} as const;

// ─── Canais: pi coding agent ──────────────────────────────────────────────────
export const PI_CHANNELS = {
  EXECUTE: 'pi:execute',
  ABORT: 'pi:abort',
  STREAM_EVENT: 'pi:stream-event',
  GET_STATUS: 'pi:get-status',
} as const;

export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface PiModelConfig {
  provider: string;
  model: string;
  thinkingLevel?: PiThinkingLevel;
}

export interface PiExecuteRequest {
  prompt: string;
  workingDirectory?: string;
  modelConfig: PiModelConfig;
  skillSystemPrompt?: string;
  additionalContext?: string;
  timeout?: number;
}

export type PiStreamEvent =
  | { type: 'status_change'; status: string; data?: string; timestamp: number }
  | { type: 'text_delta'; data: string; toolName?: string; timestamp: number }
  | { type: 'thinking_delta'; data: string; timestamp: number }
  | { type: 'tool_start'; toolName: string; data?: string; timestamp: number }
  | { type: 'tool_end'; toolName: string; data?: string; timestamp: number }
  | { type: 'turn_start'; data?: string; timestamp: number }
  | { type: 'turn_end'; data?: string; timestamp: number }
  | { type: 'agent_end'; data?: string; timestamp: number }
  | { type: 'error'; data: string; timestamp: number };

export interface PiExecuteResult {
  success: boolean;
  output: string;
  error?: string;
  executionTimeMs: number;
}

// ─── Canais: LLM local (node-llama-cpp) ───────────────────────────────────────
export const LOCAL_AI_CHANNELS = {
  DETECT_HARDWARE: 'localAi:detect-hardware',
  RECOMMEND: 'localAi:recommend',
  LIST: 'localAi:list',
  DOWNLOAD: 'localAi:download',
  DOWNLOAD_PROGRESS: 'localAi:download-progress',
  DELETE: 'localAi:delete',
  GET_ACTIVE: 'localAi:get-active',
  SET_ACTIVE: 'localAi:set-active',
  CHAT: 'localAi:chat',
} as const;

export interface HardwareInfo {
  backend: string;
  ramGb: number;
  vramGb: number | null;
  cpuModel: string;
}

export interface LocalModelInfo {
  id: string;
  label: string;
  hfRepo: string;
  filename: string;
  quant: string;
  sizeBytes: number;
  recommended?: boolean;
  active?: boolean;
  downloaded?: boolean;
  agentReady: boolean;
}

export interface DownloadProgress {
  modelId: string;
  transferredBytes: number;
  totalBytes: number;
  percent: number;
  speedBps: number;
  done: boolean;
  error?: string;
}

/** Pedido de `localAi:chat` — inferência do modelo local como avaliador. */
export interface LocalAiChatRequest {
  modelId?: string;
  prompt: string;
}

/** Resultado de `localAi:chat` — o texto final do modelo (bloco único, s/ streaming). */
export interface LocalAiChatResult {
  text: string;
}

// ─── Canais: study-method (scripts da skill) ──────────────────────────────────
export const STUDY_CHANNELS = {
  RESOLVE_SKILL_DIR: 'study:resolve-skill-dir',
  GET_SETUPS: 'study:get-setups',
  CREATE_SETUP: 'study:create-setup',
  NEW_SESSION: 'study:new-session',
  PLAN_LESSON: 'study:plan-lesson',
  GENERATE_LESSON: 'study:generate-lesson',
  LESSON_PROGRESS: 'study:lesson-progress',
  // ADITIVO (onda2-research-live): progresso em TEMPO REAL da pesquisa Brave
  // (surf-research style) durante study:generate-lesson — plan/query-start/
  // query-done/round-start/round-done/done. O canal study:lesson-progress por
  // FASES continua intacto (retrocompat — a UI antiga segue funcionando).
  RESEARCH_PROGRESS: 'study:research-progress',
  GET_LESSON: 'study:get-lesson',
  GET_FINDINGS: 'study:get-findings',
  LIST_CHALLENGES: 'study:list-challenges',
  CREATE_CHALLENGE: 'study:create-challenge',
  VERIFY_CHALLENGE: 'study:verify-challenge',
  TEST_ANSWER: 'study:test-answer',
  TEST_ANSWER_EVENT: 'study:test-answer-event',
  LIST_WORKSPACE_FILES: 'study:list-workspace-files',
  READ_WORKSPACE_FILE: 'study:read-workspace-file',
  WRITE_WORKSPACE_FILE: 'study:write-workspace-file',
  DELETE_WORKSPACE_FILE: 'study:delete-workspace-file',
  // Onda 3 (seleção de aulas — persistência): fiação da camada SQL (repo.ts)
  // aos canais IPC. O renderer lista os assuntos com aulas persistidas, lista/
  // lê aulas de um assunto e registra respostas/lição concluída.
  LIST_TOPICS: 'study:list-topics',
  LIST_LESSONS_BY_SUBJECT: 'study:list-lessons-by-subject',
  GET_LESSON_BY_ID: 'study:get-lesson-by-id',
  RECORD_ANSWER: 'study:record-answer',
  MARK_LESSON_COMPLETED: 'study:mark-lesson-completed',
  // ADITIVO (onda3-respostas): verificação POR EXECUÇÃO da resposta de um
  // exercício de matemática (invoke, SEM LLM): o handler RECOMPUTA o esperado
  // a partir de (family, seed) via mathLib — nunca confia no renderer.
  CHECK_MATH_ANSWER: 'study:check-math-answer',
  // ADITIVO (onda3-respostas): avaliação da RESPOSTA DIGITADA (interpretação)
  // com LLM — deepseek primeiro, fallback embeddedLlm local; falha total
  // devolve erro estruturado com `code` (nunca inventa veredito).
  JUDGE_ANSWER: 'study:judge-answer',
  // ADITIVO (onda4-desafio-persistencia): registra UMA tentativa de desafio
  // (nunca-repetir). challengeId = slug estável do desafio OU slug sintético de
  // math 'math:<subjectSlug>:<family>:<seed>'. O handler resolve o subjectId
  // (explícito, ou por subjectSlug, ou upsert sob demanda) e grava a linha.
  MARK_CHALLENGE_ATTEMPT: 'study:mark-challenge-attempt',
  // ADITIVO (onda1-nav-ui — reset de progresso na Settings): apaga TODAS as
  // tabelas de AVANÇO do aluno (attempts, track lesson-done, proficiência,
  // desafios gerados, contadores legados) — o conteúdo/currículo fica.
  CLEAR_PROGRESS: 'study:clear-progress',
} as const;

// ─── DTOs de persistência (onda 3 — seleção de aulas) ─────────────────────────
// Estas interfaces são STANDALONE — shared é importado pelo renderer, então NUNCA
// importa de electron/main. Espelham os shapes da camada SQL (db/repo.ts):
// `listSubjects`/`listLessonsBySubject` de lá são a fonte de verdade; estes DTOs
// são a forma tipada que trafega pelos canais study:* abaixo.

/** Assunto com contagens (de `study:list-topics` ← repo.listSubjects). */
export interface SubjectSummary {
  id: string;
  name: string;
  slug: string;
  /** domínio do assunto (v2) — 'programming' | 'math', default 'programming'. */
  domain: 'programming' | 'math';
  lessonCount: number;
  answeredCount: number;
}

/** Aula resumida por assunto (de `study:list-lessons-by-subject`). */
export interface LessonSummary {
  id: string;
  title: string;
  body: string;
  difficulty: number;
  completedAt: string | null;
}

/** Aula completa (de `study:get-lesson-by-id`). */
export interface LessonRow {
  id: string;
  subject_id: string;
  title: string;
  body: string;
  difficulty: number;
  parent_lesson_id: string | null;
  origin_lesson_id: string | null;
  created_at: string;
  completed_at: string | null;
  /** ONDA4 (v3): exercício de matemática PERSISTIDO (parse defensivo de
   * exercise_json) — null quando ausente/inválido (nunca lança). */
  exercise: LessonExercise | null;
}

/** Resultado de `study:get-lesson-by-id` (ONDA4: exercício + domínio; ONDA5:
 * subjectSlug + challenge — aditivo, campos nullable, consumidores antigos
 * seguem funcionando). */
export interface GetLessonByIdResult {
  lesson: LessonRow | null;
  /** exercício parseado de exercise_json (null para lição inexistente/ausente). */
  exercise: LessonExercise | null;
  /** domínio do assunto da lição (subjects.domain); null quando inexistente. */
  domain: 'programming' | 'math' | null;
  /** ONDA5: slug do subject da lição (subjects.slug, do mesmo JOIN do domain) —
   *  usado pela UI para resolver o setupRoot ao reabrir uma lição persistida;
   *  null quando a lição não existe. */
  subjectSlug: string | null;
  /** ONDA5: desafio fundido da lição (challenges por lesson_id — createLesson
   *  persiste no máximo 1 por lição) — a UI reabre o desafio pelo slug; null
   *  para lições math / sem desafio persistido. */
  challenge: { slug: string; title: string } | null;
}

/** Linha de tentativa de desafio (de `study:mark-challenge-attempt`). */
export interface ChallengeAttemptRow {
  id: string;
  subjectId: string;
  lessonId: string;
  challengeId: string;
  verdict: 'passed' | 'failed' | 'timeout' | 'abandoned';
  stars: number;
  durationMs: number;
  createdAt: string;
}

/** Pedido de `study:mark-challenge-attempt` (nunca-repetir). */
export interface MarkChallengeAttemptRequest {
  /** subjectId explícito (tem precedência sobre subjectSlug). */
  subjectId?: string;
  /** subjectSlug do setup — resolvido via findSubjectBySlug ou upsert sob demanda. */
  subjectSlug?: string;
  /** slug estável do desafio OU slug sintético de math 'math:<subjectSlug>:<family>:<seed>'. */
  challengeId: string;
  verdict: 'passed' | 'failed' | 'timeout' | 'abandoned';
  /** 0..3 (default 0). */
  stars?: number;
  /** milissegundos de duração (default 0). */
  durationMs?: number;
  /** ADITIVO (rodada8-trilhas): lessonId da AULA da trilha — grava
   * `lesson:<lessonId>` na tentativa (o padrão antigo deriva do subjectSlug).
   * Permite o nunca-repetir por aula (desafios errados DAQUELA aula). */
  lessonId?: string;
}

/** Resultado de `study:mark-challenge-attempt`. */
export type MarkChallengeAttemptResult =
  | { ok: true; attempt: ChallengeAttemptRow }
  | { ok: false; error: string };

// ─── Canais: TRILHAS (rodada 8 — conteúdo pré-definido por CLI) ──────────────
// A partir da rodada 8 o aluno NÃO GERA mais aula: as trilhas chegam prontas
// (resources/tracks, criadas pelo CLI de autoria tools/track-cli.ts) e o aluno
// abre a trilha e escolhe a aula. Estes canais são ADITIVOS ao contrato
// congelado (grupo novo = window.api.track.* no preload); os canais antigos de
// geração (study:generate-lesson etc.) continuam existindo e são usados apenas
// pelos fluxos legados.

export const TRACK_CHANNELS = {
  /** Lista as trilhas disponíveis com progresso do aluno. → TrackListResult */
  LIST: 'track:list',
  /** Detalhe de UMA trilha (módulos + aulas com estados locked/done/current). */
  GET: 'track:get',
  /** Conteúdo de UMA aula (teoria, fontes, pré-requisitos, desafios). */
  LESSON: 'track:lesson',
  /** Marca a aula como concluída (progressão sequencial da trilha). */
  LESSON_DONE: 'track:lesson-done',
  /** Chat com o tutor da aula: apresenta a próxima seção ou tira dúvida. */
  TUTOR_CHAT: 'track:tutor-chat',
  /** Desafio de UMA aula (enunciado + starter + tempo + carência de estrela). */
  CHALLENGE_GET: 'track:challenge',
  /** Executa o código do aluno contra os testes do desafio (determinístico). */
  CHALLENGE_SUBMIT: 'track:challenge-submit',
  /** Regenera UM desafio da aula: a LLM vê os desafios que o aluno ERROU e não repete. */
  CHALLENGE_REGENERATE: 'track:challenge-regenerate',
  /** ADITIVO (onda3-generate-flow): progresso do track:challenge-regenerate em
   * TEMPO REAL (push main→renderer) — o main emite os marcos que conhece "por
   * volta" da chamada (o challengeRegenerator fica puro). O modal global de
   * etapas lê estes eventos e atualiza o challengeGenerateStore. */
  CHALLENGE_REGENERATE_PROGRESS: 'track:challenge-regenerate-progress',
  /** Teste de proficiência da trilha (cobre tudo — destrava as aulas). */
  PROFICIENCY_GET: 'track:proficiency',
  /** Executa o código do aluno contra o teste de proficiência. */
  PROFICIENCY_SUBMIT: 'track:proficiency-submit',
} as const;

export type TrackVerdict = 'passed' | 'failed' | 'timeout' | 'abandoned';

/** Uma trilha na listagem (track:list). */
export interface TrackListEntry {
  slug: string;
  title: string;
  description: string;
  domain: 'programming' | 'math';
  moduleCount: number;
  lessonCount: number;
  /** lições concluídas pelo aluno (progresso sequencial). */
  doneCount: number;
  /** true quando o aluno passou no teste de proficiência. */
  proficient: boolean;
}

export type TrackListResult =
  | { ok: true; tracks: TrackListEntry[] }
  | { ok: false; error: string };

/** Aula resumida dentro do detalhe da trilha (track:get). */
export interface TrackLessonEntry {
  slug: string;
  moduleSlug: string;
  title: string;
  summary: string;
  difficulty: number;
  /**
   * Progressão: aula destravada quando a anterior está concluída OU a
   * proficiência foi passada. A primeira aula da trilha sempre destrava.
   */
  locked: boolean;
  done: boolean;
  /** próxima aula a fazer (primeira destravada e não concluída) — no máx. 1. */
  current: boolean;
}

export interface TrackModuleEntry {
  slug: string;
  title: string;
  order: number;
  lessons: TrackLessonEntry[];
  /**
   * ADITIVO (rodada 9): true quando o módulo tem um desafio próprio definido
   * (module.json challenge — desafio do FIM do módulo, multi-arquivo).
   */
  challengeAvailable: boolean;
  /** ADITIVO (rodada 9): o desafio do módulo (slug + título). null quando não há. */
  challenge: { slug: string; title: string } | null;
  /** ADITIVO (rodada 9): último veredito do aluno no desafio do módulo (null = nunca tentou). */
  challengeLastVerdict: TrackVerdict | null;
  /** ADITIVO (rodada 9): estrelas do último veredito do desafio do módulo (0..3). */
  challengeStars: number;
}

export interface TrackDetailPayload {
  slug: string;
  title: string;
  description: string;
  domain: 'programming' | 'math';
  modules: TrackModuleEntry[];
  /** true quando a trilha tem teste de proficiência definido. */
  proficiencyAvailable: boolean;
  proficient: boolean;
  doneCount: number;
  lessonCount: number;
}

export type TrackDetailResult =
  | { ok: true; track: TrackDetailPayload | null }
  | { ok: false; error: string };

/** Seção de teoria da aula (o tutor apresenta em modo chat, seção a seção). */
export interface TrackTheorySectionDto {
  id: string;
  title: string;
  markdown: string;
  code?: { language: string; code: string; explanation?: string };
}

/**
 * ADITIVO (onda 1 schema-quiz): AFIRMAÇÃO da aula — frase que a aula ensina
 * com um quiz de múltipla escolha (4 opções, índice da correta e feedback)
 * que o aluno responde DURANTE a aula (máx. 3 por aula). Espelha
 * TrackAssertion (electron/main/content/trackTypes.ts).
 */
export interface TrackAssertionDto {
  id: string;
  statement: string;
  question: string;
  options: string[];
  answerIndex: number;
  feedback: string;
  /**
   * ADITIVO (onda 1 replan sectionId, REPLAN A1): id da seção de teoria
   * (`theory[].id`) que DEMONSTRA esta afirmação — a âncora do quiz na base
   * teórica da aula (a ordem das assertions NÃO é a ordem das seções).
   * OPCIONAL: ausente = afirmação sem âncora declarada (trilhas antigas
   * chegam sem o campo).
   */
  sectionId?: string;
}

/** Fonte do conteúdo — exibida SOMENTE pelo botão "Fontes", nunca no fluxo. */
export interface TrackSourceLinkDto {
  title: string;
  url: string;
  description: string;
}

/** Desafio resumido dentro do conteúdo da aula. */
export interface TrackChallengeSummaryDto {
  slug: string;
  title: string;
  concept: string;
  difficulty: number;
  /** último veredito do aluno (null = nunca tentou). */
  lastVerdict: TrackVerdict | null;
  /** estrelas do último veredito (0..3). */
  stars: number;
  /** nº de vezes que o aluno falhou este desafio (para a UI exibir). */
  failedCount: number;
  /** true quando foi REGENERADO para este aluno (não existe na trilha). */
  generated: boolean;
}

/** Conteúdo completo de UMA aula (track:lesson). */
export interface TrackLessonPayload {
  slug: string;
  moduleSlug: string;
  title: string;
  summary: string;
  difficulty: number;
  concepts: string[];
  /** aulas ANTERIORES da trilha — revisão quando o aluno não entender. */
  prerequisites: { slug: string; title: string }[];
  theory: TrackTheorySectionDto[];
  /**
   * ADITIVO (onda 1 schema-quiz): afirmações da AULA (até 3) com quiz de
   * múltipla escolha — a unidade é a AULA, não a seção. Ausente = aula sem
   * quiz (trilhas antigas chegam sem o campo).
   */
  assertions?: TrackAssertionDto[];
  sources: TrackSourceLinkDto[];
  challenges: TrackChallengeSummaryDto[];
  locked: boolean;
  done: boolean;
}

export type TrackLessonResult =
  | { ok: true; lesson: TrackLessonPayload | null }
  | { ok: false; error: string };

export type TrackLessonDoneResult = { ok: boolean; error?: string };

/** Mensagem do chat do tutor (histórico enviado pelo renderer). */
export interface TutorMessage {
  role: 'assistant' | 'user';
  content: string;
}

/**
 * ADITIVO (onda1-error-contract): relatório do erro REAL de um desafio que
 * falhou — o que o main SABE que aconteceu (código enviado + saída dos testes
 * + checklist), SEM a solução (nunca trafega testsCode/solutionCode). O
 * renderer monta a partir do resultado de `track:challenge-submit` (passed
 * false) + os arquivos que o aluno enviou, e anexa ao turno 'answer' da
 * discussão do erro no chat da aula.
 */
export interface TrackChallengeErrorReport {
  trackSlug: string;
  lessonId: string;
  challengeId: string;
  challengeTitle: string;
  /** código(s) enviados pelo aluno no submit (todos os arquivos). */
  files: { path: string; code: string }[];
  /** saída dos testes determinísticos (runStudentCode). */
  output: string;
  /** checks individuais do relatório node:test. */
  checks: { name: string; passed: boolean }[];
  passedCount: number;
  totalCount: number;
}

export interface TutorChatRequest {
  trackSlug: string;
  lessonId: string;
  /** ids das seções JÁ apresentadas (o main decide qual é a próxima). */
  presentedSections: string[];
  history: TutorMessage[];
  /**
   * 'next' — apresenta a próxima seção da teoria em linguagem simples;
   * 'answer' — responde à dúvida do aluno (última mensagem do history).
   */
  action: 'next' | 'answer';
  /**
   * ADITIVO (onda1-error-contract): contexto de erro de um desafio que falhou
   * (código enviado + saída + checklist). Presente nos turnos 'answer' da
   * discussão do erro; ausente no fluxo normal (o main ignora em 'next').
   */
  challengeError?: TrackChallengeErrorReport;
}

export interface TutorReply {
  ok: boolean;
  error?: { code: string; message: string };
  /** texto do tutor (seção apresentada ou resposta à dúvida). */
  message: string;
  /** seção apresentada por 'next' (null em 'answer' ou fim). */
  sectionId: string | null;
  sectionTitle?: string;
  /** true quando TODAS as seções já foram apresentadas. */
  done: boolean;
}

/** Especificação de UM desafio (track:challenge / regeneração). */
export interface TrackChallengeSpec {
  slug: string;
  title: string;
  concept: string;
  difficulty: number;
  statement: string;
  /**
   * ADITIVO (rodada 9): desafio MULTI-ARQUIVO — os arquivos do desafio com os
   * STARTERS por arquivo (nunca as soluções). Ausente = desafio de arquivo
   * único (solution.mjs, starterCode vale). Quando presente, `starterCode`
   * carrega o starter do PRIMEIRO arquivo (fallback — a UI usa `files`).
   */
  files?: { path: string; starterCode: string }[];
  starterCode: string;
  expectedTestCount: number;
  /** carência da 1ª estrela (ms) — antes disso o tempo não tira estrela. */
  minFirstStarMs: number;
  /** limite de tempo derivado da dificuldade (T = 90s + difficulty*60s). */
  timeLimitMs: number;
  /** 'track' = veio da trilha; 'generated' = regenerado para este aluno. */
  source: 'track' | 'generated';
  /** última tentativa do aluno neste desafio. */
  lastVerdict: TrackVerdict | null;
  stars: number;
  failedCount: number;
}

export type TrackChallengeResult =
  | { ok: true; challenge: TrackChallengeSpec | null }
  | { ok: false; error: string };

export interface TrackChallengeGetRequest {
  trackSlug: string;
  /**
   * 'lesson' (desafio de aula), 'proficiency' (teste da trilha) ou 'module'
   * (desafio do módulo — ADITIVO rodada 9).
   */
  target: 'lesson' | 'proficiency' | 'module';
  lessonId?: string;
  /** slug do módulo (target 'module'). */
  moduleSlug?: string;
  challengeId?: string;
}

/** Submissão de código contra os testes de um desafio (execução determinística). */
export interface TrackSubmitRequest {
  trackSlug: string;
  target: 'lesson' | 'proficiency' | 'module';
  lessonId?: string;
  /** slug do módulo (target 'module'). */
  moduleSlug?: string;
  challengeId?: string;
  code: string;
  /**
   * ADITIVO (rodada 9): código do aluno POR ARQUIVO (desafio multi-arquivo) —
   * o aluno edita TODOS os arquivos do desafio. Quando presente, o main roda
   * estes arquivos (o `code` único é ignorado).
   */
  files?: { path: string; code: string }[];
}

export interface TrackSubmitResult {
  ok: boolean;
  error?: { code: string; message: string };
  /** true = TODOS os testes passaram. */
  passed: boolean;
  testsRun: number;
  expectedTests: number;
  output: string;
  /**
   * ADITIVO (rodada 9): checks INDIVIDUAIS do relatório spec do node:test
   * (linhas `✔ nome` / `✖ nome`). Vazio quando a execução nem chegou a rodar
   * os testes (erro de sintaxe, spawn falhou etc.).
   */
  checks: { name: string; passed: boolean }[];
  /** nº de checks que passaram (parcial: aprovado só quando passed=true). */
  passedCount: number;
  /** nº total de checks do relatório. */
  totalCount: number;
}

/** Regeneração de desafio — a LLM vê os desafios que o aluno errou na aula. */
export interface TrackRegenerateRequest {
  trackSlug: string;
  lessonId: string;
  /** ADITIVO (onda3-generate-flow, revisão ALTO-2): id da geração no STORE do
   *  renderer (incremento global). O main ecoa nos eventos de progresso —
   *  o renderer correlaciona: eventos de um processo ANTERIOR (o invoke não
   *  aborta o main; um terminal atrasado de A pode cruzar com o processo B)
   *  são descartados. Ausente → o handler simplesmente não ecoa. */
  generationId?: number;
}

export interface TrackRegenerateResult {
  ok: boolean;
  error?: { code: string; message: string };
  challenge?: TrackChallengeSpec;
  /** desafios que o aluno errou nesta aula (contexto do nunca-repetir). */
  failedContext?: { slug: string; title: string }[];
}

/**
 * ADITIVO (onda3-generate-flow): evento de PROGRESSO do track:challenge-
 * regenerate (canal push track:challenge-regenerate-progress). O main emite os
 * marcos que CONHECE por volta da chamada ao challengeRegenerator (que fica
 * PURO — não é instrumentado):
 *
 *   - 'generating' — ANTES da 1ª chamada LLM (o draft — pensar + escrever os
 *     testes — é o polo longo da geração; pulsa enquanto a LLM trabalha);
 *   - 'validating' — reportado logo após a chamada retornar, SÓ quando havia
 *     contexto pedagógico (revisão BAIXO-2: o RÓTULO da etapa no modal é
 *     honesto — "conferindo a coerência" — porque o regenerador PODE pular a
 *     validação semântica quando o validador está indisponível; o marco é o
 *     mesmo, o texto da UI não afirma validação que pode não ocorrer);
 *   - 'executing' — idem (verificação de execução do draft);
 *   - 'inserting' — antes do insert no banco (repo.insertGeneratedChallenge);
 *   - 'done' (TERMINAL) — persistiu; carrega o challenge novo (o modal global
 *     navega "Ver desafio" a partir dele — a view que disparou pode já ter
 *     desmontado: navegação durante a geração);
 *   - 'error' (TERMINAL) — falhou (LLM, execução, persistência OU exceção
 *     inesperada — o handler emite em TODOS os caminhos, revisão ALTO-1:
 *     o modal nunca fica preso em 'running').
 *
 * O renderer mapeia os 4 estágios de trabalho para as 5 etapas do modal
 * (Etapa 2 "Escrevendo os testes" conclui junto da Etapa 1 — o draft da LLM
 * já contém os testes; ver challengeGenerateStore.ts).
 */
export interface TrackRegenerateProgressEvent {
  stage: 'generating' | 'validating' | 'executing' | 'inserting' | 'done' | 'error';
  /** rótulo opcional do marco (ex.: nome do desafio sendo gerado). */
  label?: string;
  /** presente em 'done' — o desafio NOVO (para o "Ver desafio" navegar). */
  challenge?: { slug: string; title: string };
  /** presente em 'error' — mensagem do erro exibida pelo modal. */
  error?: string;
  /** ADITIVO (revisão ALTO-2): eco do generationId do request — o renderer
   *  descarta eventos de processos anteriores (o withTimeout de 150s NÃO
   *  aborta o main; um terminal atrasado não pode sequestrar a geração nova). */
  generationId?: number;
}

export interface StudyFinding {
  query: string;
  title: string;
  url: string;
  description: string;
  score?: number;
}

export interface StudyLesson {
  title: string;
  subject: string;
  markdown: string;
  findings: StudyFinding[];
  challenges: ChallengeInfo[];
  createdAt: string;
  /**
   * ADITIVO (onda3-respostas): exercício da aula quando o domínio é 'math'.
   * O esperado (expectedNormalized) foi computado PELA mathLib no momento da
   * geração (= conferido ANTES de gerar — regra do produto, DES-6): o LLM
   * NUNCA inventa números para matemática.
   */
  exercise?: LessonExercise;
  /**
   * ONDA4 (desafio-persistencia): id da lição PERSISTIDA (createLesson) —
   * presente quando a geração rodou com repo e a persistência funcionou.
   * A onda 5 usa para recordAnswer/markLessonCompleted/judge-answer com ids
   * reais (também devolvido no topo do resultado do generate-lesson).
   */
  lessonId?: string;
  /** ONDA4: id do subject persistido (upsertSubject) — mesmo gate do lessonId. */
  subjectId?: string;
}

/** Exercício de matemática gerado pela mathLib (verificação por execução). */
export interface LessonExercise {
  kind: 'math';
  /** Família da mathLib: arithmetic | fractions | percentages | linear-equations. */
  family: string;
  /** Seed determinístico — (family, seed) re-computa o problema via mathLib. */
  seed: number;
  /** Enunciado em pt-BR (o que o aluno lê). */
  prompt: string;
  /** Valor esperado na forma canônica ('7' | '5/6') — computado pela biblioteca. */
  expectedNormalized: string;
}

export interface ChallengeInfo {
  challengeId: string;
  title: string;
  language: string;
  concept: string;
  difficulty: number;
  status: string;
  verdict: string;
  workspaceDir: string;
  statementPath: string;
  /**
   * ADITIVO (onda4-desafio-persistencia): slug ESTÁVEL do desafio — basename do
   * workspaceDir SEM o prefixo NNNN ('0007-fatorial-recursivo' →
   * 'fatorial-recursivo'). A MESMA string que a UI grava como challengeId nas
   * tentativas (mark-challenge-attempt) e que o list-challenges usa para
   * nunca-repetir. Sempre presente no main; opcional no tipo por retrocompat
   * com consumidores que constroem o shape sem o campo (renderer).
   */
  slug?: string;
  /**
   * ADITIVO (onda2-research-live): subject_id do assunto ao qual o desafio
   * pertence, quando persistido na camada SQL (challenges→lessons→subject_id /
   * challenge_attempts.subject_id). undefined quando ainda não persistido
   * (ex.: aula recém-gerada sem tentativas registradas).
   */
  subjectId?: string;
}

// ─── DTOs de progresso da pesquisa (onda2-research-live — surf-research style) ─
// Canal push `study:research-progress` durante study:generate-lesson. União
// discriminada por `kind`; a ORDEM de emissão é fixa por rodada:
//   research:plan → (research:round-start → (research:query-start →
//   research:query-done)* → research:round-done)* → research:done.
// Retrocompat: o canal study:lesson-progress por fases continua sendo emitido
// intacto — estes eventos são um canal NOVO, aditivo ao contrato congelado.

/** Categorias fixas das queries de pesquisa (estilo deep-orchestrator). */
export type ResearchQueryCategory =
  | 'official-docs'
  | 'practice'
  | 'common-errors'
  | 'comparison'
  | 'exercises';

/** Sub-pergunta do plano de pesquisa (id estável referenciado por queries[].sub). */
export interface ResearchSubQuestion {
  id: string;
  question: string;
}

/** Uma query planejada: id estável (referenciado por query-start/query-done). */
export interface ResearchQuerySpec {
  id: string;
  q: string;
  /** id da sub-pergunta à qual a query pertence ('sq1', 'sq2', …). */
  sub: string;
  category: ResearchQueryCategory | null;
}

/** Erro de UMA query (códigos do braveSearchService quando conhecidos). */
export interface ResearchQueryError {
  /** 'BRAVE_KEY_MISSING' | 'BRAVE_KEY_INVALID' | 'BRAVE_RATE_LIMIT' | 'BRAVE_SERVER_ERROR'. */
  code?: string;
  message?: string;
}

export type ResearchProgressEvent =
  | {
      kind: 'research:plan';
      subQuestions: ResearchSubQuestion[];
      queries: ResearchQuerySpec[];
      maxRounds: number;
    }
  | { kind: 'research:query-start'; queryId: string; q: string }
  | {
      kind: 'research:query-done';
      queryId: string;
      q: string;
      ok: boolean;
      provider: 'brave';
      /** nº de resultados (hits) devolvidos pela API para esta query. */
      hits?: number;
      latencyMs?: number;
      /**
       * Créditos restantes quando a API os expõe. A Brave Search API NÃO expõe
       * saldo — o campo existe no DTO para futuras fontes que o façam (Tavily
       * etc.) e fica undefined no provider 'brave'.
       */
      credits?: number;
      error?: ResearchQueryError;
    }
  | { kind: 'research:round-start'; round: number; totalRounds: number }
  | {
      kind: 'research:round-done';
      round: number;
      ok: number;
      failed: number;
      /** fontes ÚNICAS (dedup por url) acumuladas até o fim desta rodada. */
      uniqueSources: number;
    }
  | {
      kind: 'research:done';
      sources: number;
      rounds: number;
      stopReason: string;
      /**
       * 'brave-missing' ⇒ chave Brave ausente; nenhuma query foi executada.
       * 'brave-key-invalid' ⇒ chave Brave rejeitada (401/403) em TODAS as
       * queries de uma rodada sem nenhuma fonte coletada; aborta a geração.
       */
      errorKind?: 'brave-missing' | 'brave-key-invalid';
    };

export interface TestAnswerResult {
  success: boolean;
  testsRun: number;
  expectedTests: number;
  passed: boolean;
  output: string;
  verdictFeedback?: string;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  dir: boolean;
  language?: string;
}

// ─── DTOs de respostas (onda3-respostas — check-math-answer / judge-answer) ───
// `study:check-math-answer` é a verificação POR EXECUÇÃO do exercício de
// matemática (SEM LLM): o main RECOMPUTA o esperado de (family, seed) via
// mathLib e compara com a resposta digitada — a UI nunca envia o esperado.
// `study:judge-answer` avalia a INTERPRETAÇÃO digitada com LLM (deepseek →
// fallback embeddedLlm); em falha total devolve erro estruturado com `code`
// (nunca inventa veredito).

/** Pedido de `study:check-math-answer` (invoke, sem LLM). */
export interface MathAnswerCheckRequest {
  /** Família da mathLib (vem do LessonExercise.family da lição). */
  family: string;
  /** Seed do exercício (vem do LessonExercise.seed da lição). */
  seed: number;
  /** O que o aluno digitou como resposta. */
  answerText: string;
}

/** Resultado de `study:check-math-answer`. */
export interface MathAnswerCheckResult {
  correct: boolean;
  /**
   * Esperado na forma canônica, RECOMPUTADO pelo main a partir de
   * (family, seed) — presente sempre que family/seed são válidos
   * (ex.: '7' | '5/6'); null apenas se o esperado não pôde ser computado.
   */
  expectedNormalized: string | null;
  /** 'wrong' = resposta válida mas diferente do esperado; 'malformed' = não é
   *  um número reconhecível (parse falhou). Ausente quando correct === true. */
  reason?: 'wrong' | 'malformed';
}

/** Pedido de `study:judge-answer` (invoke, LLM com fallback local). */
export interface JudgeAnswerRequest {
  /** Id da lição quando a resposta pertence a uma aula persistida. */
  lessonId?: string;
  /** O que o aluno digitou (a interpretação dele). */
  answerText: string;
  context: {
    /** Assunto da aula (ex.: 'Closures em JavaScript'). */
    subject: string;
    /** Trecho do material da aula (contexto do que foi ensinado). */
    lessonExcerpt: string;
  };
}

/**
 * Resultado de `study:judge-answer`. União discriminada por `ok`:
 * - ok:true  → veredito + feedback em pt-BR (provider informa quem julgou);
 * - ok:false → erro estruturado com `code` (ANSWER_JUDGE_* — nunca veredito
 *   inventado em falha total).
 */
export type JudgeAnswerOutcome =
  | {
      ok: true;
      verdict: 'correct' | 'partial' | 'incorrect';
      feedback: string;
      provider: 'deepseek' | 'embedded';
    }
  | { ok: false; error: { code: string; message: string } };

// ─── Canais: validação de chaves ──────────────────────────────────────────────
export interface ValidationResult {
  isValid: boolean;
  provider: 'deepseek' | 'brave';
  errorMessage?: string;
  checkedAt: string;
}

export interface KeysStatus {
  deepseekConfigured: boolean;
  braveConfigured: boolean;
  deepseekValidated: boolean;
  braveValidated: boolean;
}

/**
 * Status do GATE DE INÍCIO (onda 6 — startup gate). Resultado de
 * `keys:startup-status`: a validação real das DUAS chaves (DeepSeek + Brave)
 * acontecida no main no primeiro acesso do renderer.
 *
 * `phase` interpreta o estado agregado:
 * - 'checking' → ainda validando (o AppGate mostra splash);
 * - 'blocked'  → alguma chave falta configurar ou é inválida (401/403).
 *               O AppGate renderiza o SetupView obrigatório;
 * - 'offline'  → ambas as chaves ESTÃO configuradas mas as DUAS falharam por
 *               erro de rede — o app inicia com um aviso e as features online
 *               ficam gateadas (LLM local continua utilizável);
 * - 'ready'    → as duas chaves são válidas; app inicia livre.
 *
 * Por provedor: `configured` = há chave salva; `valid` = a validação passou
 * (401/403 → false; 402/429/200 → true); `error` = mensagem clara quando a
 * chave é inválida ou falhou por rede.
 */
export interface StartupStatus {
  phase: 'checking' | 'ready' | 'blocked' | 'offline';
  deepseek: { configured: boolean; valid: boolean; error?: string };
  brave: { configured: boolean; valid: boolean; error?: string };
  /** true APENAS quando ambas as chaves configuradas falharam por erro de rede. */
  offline: boolean;
  checkedAt: string;
}

// ─── Canais: settings ─────────────────────────────────────────────────────────
export const SETTINGS_CHANNELS = {
  GET: 'settings:get',
  SET: 'settings:set',
  GET_SETUPS_DIR: 'settings:get-setups-dir',
  SET_SETUPS_DIR: 'settings:set-setups-dir',
} as const;

export interface AppSettings {
  setupsDir?: string;
  lastSubject?: string;
  defaultModelProvider?: 'deepseek' | 'local';
  defaultModelId?: string;
  /** ADITIVO (onda 6): idioma ativo, persistido pelo LanguageSwitcher do i18n. */
  language?: string;
}

// ─── Canais: STT local (onda 8 — voz) ────────────────────────────────────────
// On-device ASR via sherpa-onnx-node (Nemotron streaming) num utility process.
// Todos os handlers devolvem o envelope `{ success, data?, error? }`.

export const STT_CHANNELS = {
  MODEL_STATUS: 'stt:model-status',
  MODEL_DOWNLOAD: 'stt:model-download',
  MODEL_DOWNLOAD_PROGRESS: 'stt:model-download-progress',
  MODEL_CANCEL: 'stt:model-cancel',
  MODEL_DELETE: 'stt:model-delete',
  STREAM_START: 'stt:stream-start',
  STREAM_CHUNK: 'stt:stream-chunk',
  STREAM_STOP: 'stt:stream-stop',
  STREAM_CANCEL: 'stt:stream-cancel',
  STREAM_PARTIAL: 'stt:stream-partial',
  ENGINE_STATUS: 'stt:engine-status',
} as const;

/** Estado de UM modelo de STT local (catálogo + disco + download em voo). */
export interface SttModelStatus {
  modelId: string;
  state: 'absent' | 'installed' | 'downloading';
  /** Modelo embutido no pacote (resources/stt-models) — não deletável. */
  embedded: boolean;
  downloadedBytes: number;
  totalBytes: number;
  progress: number;
}

/** Push `stt:model-download-progress` — progresso do download de um modelo. */
export interface SttModelProgressPayload {
  modelId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

/** Push `stt:stream-partial` — transcrição parcial CUMULATIVA (replace). */
export interface SttPartialPayload {
  sessionId: string;
  text: string;
  /** true no commit do final (e no resultado de `stt:stream-stop`). */
  isFinal: boolean;
}

/** Push `stt:engine-status` — de um utility process de STT. */
export interface SttEngineStatusPayload {
  status: 'ready' | 'restarting' | 'dead';
}

/** Pedido de `stt:stream-start` — abertura de UMA sessão local. */
export interface SttStreamStartRequest {
  /** Locale da UI ('pt-BR' | 'en') — resolve o hint de língua do modelo. */
  locale: string;
  /** Id de sessão (geralmente fixo 'mic'). */
  sessionId: string;
}

/** Pedido de `stt:stream-chunk` — um frame PCM 16 kHz mono (≤ 48000 amostras). */
export interface SttStreamChunk {
  sessionId: string;
  samples: Float32Array;
}

// ─── Canais: TTS local (onda 8 — voz) ────────────────────────────────────────
// On-device TTS via binário externo (sherpa-onnx-offline-tts / Piper, GPL
// isolado num processo filho). Todos os handlers devolvem o envelope
// `{ success, data?, error? }`.

export const TTS_CHANNELS = {
  LIST: 'localTts:list',
  DOWNLOAD: 'localTts:download',
  DOWNLOAD_PROGRESS: 'localTts:download-progress',
  CANCEL_DOWNLOAD: 'localTts:cancel-download',
  DELETE: 'localTts:delete',
  GENERATE: 'localTts:generate',
  CANCEL_GENERATE: 'localTts:cancel-generate',
  GET_PREFERENCE: 'localTts:get-preference',
  SET_PREFERENCE: 'localTts:set-preference',
} as const;

/** Uma entrada do catálogo de TTS local + estado de instalação. */
export interface TtsModelInfo {
  id: string;
  language: string;
  label: string;
  /** Modelo embutido no pacote (resources/tts-models) — não deletável. */
  embedded: boolean;
  installed: boolean;
  sampleRate: number;
  totalSizeBytes: number;
}

/** Push `localTts:download-progress` — progresso do download de um modelo. */
export interface TtsDownloadProgressPayload {
  modelId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

/** Pedido de `localTts:generate` — síntese de fala de um modelo Piper. */
export interface TtsGenerateRequest {
  /** Id único do chamador — permite `localTts:cancel-generate`. */
  requestId: string;
  modelId: string;
  text: string;
  /** Voz default do modelo (Piper é single-speaker → sid 0). */
  defaultVoiceId?: string;
  /** Velocidade (`0.5`..`2.0`); omissa usa 1.0. */
  speed?: number;
  /** Provedor — 'local' é o único suportado nesta onda. */
  provider: 'local';
}

/** Resultado de `localTts:generate` — um WAV em base64. */
export interface TtsGenerateResult {
  audioBase64: string;
  format: 'wav';
  sampleRate: number;
  /** Path do arquivo temporário quando a UI pede para salvar (opcional). */
  savedTo?: string;
}

/** Preferência persistida do TTS local (`localTts:get-preference`/`set-preference`). */
export interface LocalTtsPreference {
  /** ModelId/voz a usar por padrão (ex.: 'piper-pt-br-faber'). */
  modelId?: string;
  defaultVoiceId?: string;
  speed?: number;
}