/**
 * src/lib/trackLessonState.ts — máquina de estado PURA da aula em modo CHAT
 * (rodada 8).
 *
 * A aula é um chat direto com a IA: o tutor apresenta a base teórica uma SEÇÃO
 * por vez ('next') e responde dúvidas ('answer'). Este módulo mantém o estado
 * do chat SEM React/DOM (testável em node:test):
 *
 *   - `presentedSections`: ids das seções já apresentadas (ordem);
 *   - `history`: mensagens do chat (assistant/user);
 *   - `theoryDone`: todas as seções apresentadas (a aula teórica terminou);
 *   - `challengeError`: relatório do erro do desafio de aula que falhou
 *     (onda2-error-flow) — anexado aos turnos 'answer' da discussão do erro.
 *
 * Fluxo: o usuário clica "Próximo" → action 'next' (com presentedSections) →
 * a resposta do tutor vira uma mensagem assistant e sectionId entra em
 * presentedSections. O usuário digita → action 'answer' → a resposta do tutor
 * vira mensagem assistant (sem avançar seção).
 *
 * ONDA2 (error-flow): quando um desafio de AULA falha, o painel fecha e o chat
 * da aula reabre com DUAS bolhas semeadas por `seedChallengeError`:
 * `kind: 'error-bubble'` (markdown determinístico do erro — ver
 * `formatErrorBubble`) e `kind: 'error-question'` (a pergunta do tutor "o que
 * você acha que errou?"). O `kind` é METADADOS DE UI — `chatHistory` o STRIPA
 * antes de enviar ao main (o histórico é texto puro).
 */
import type {
  TrackChallengeErrorReport,
  TrackSubmitResult,
  TutorReply,
} from '../../shared/ipc-contract';

export interface TutorChatMessage {
  role: 'assistant' | 'user';
  content: string;
  /**
   * ADITIVO (onda2-error-flow): metadados de UI de uma bolha do fluxo de erro
   * do desafio — 'error-bubble' (a bolha com checklist/saída + botão "Gerar
   * novo desafio") e 'error-question' (a pergunta do tutor). Ausente nas
   * mensagens normais. NUNCA trafega no histórico enviado ao main
   * (chatHistory stripa).
   */
  kind?: 'error-bubble' | 'error-question';
}

export interface TrackLessonUiState {
  presentedSections: string[];
  history: TutorChatMessage[];
  /** true quando todas as seções da teoria já foram apresentadas. */
  theoryDone: boolean;
  /** mensagem de erro do último turno (null = sem erro). */
  lastError: string | null;
  /**
   * ADITIVO (onda2-error-flow): relatório do erro do desafio de aula que
   * falhou, em discussão no chat. A LessonView o anexa aos turnos 'answer' do
   * `tutorChat` (o main usa em 'answer' para analisar a hipótese do aluno).
   * Zera no 'next' (a teoria retoma) e em `clearChallengeError`.
   */
  challengeError: TrackChallengeErrorReport | null;
}

export function createTrackLessonState(): TrackLessonUiState {
  return {
    presentedSections: [],
    history: [],
    theoryDone: false,
    lastError: null,
    challengeError: null,
  };
}

/** Aplica a resposta do tutor (de 'track:tutor-chat') ao estado. */
export function applyTutorReply(state: TrackLessonUiState, reply: TutorReply): TrackLessonUiState {
  const history = reply.message.trim()
    ? [...state.history, { role: 'assistant' as const, content: reply.message }]
    : state.history;
  const presentedSections =
    reply.sectionId && !state.presentedSections.includes(reply.sectionId)
      ? [...state.presentedSections, reply.sectionId]
      : state.presentedSections;
  return {
    presentedSections,
    history,
    theoryDone: state.theoryDone || reply.done,
    lastError: reply.ok ? null : reply.error?.message ?? 'erro desconhecido',
    // ONDA2 (error-flow): a resposta do tutor PRESERVA o contexto de erro em
    // discussão — só 'next' (sendNext) e clearChallengeError o zeram.
    challengeError: state.challengeError,
  };
}

/** Adiciona a pergunta do aluno ao histórico. */
export function pushUserMessage(state: TrackLessonUiState, text: string): TrackLessonUiState {
  const content = text.trim();
  if (!content) return state;
  return {
    ...state,
    history: [...state.history, { role: 'user' as const, content }],
    lastError: null,
  };
}

/**
 * O histórico enviado ao main (mensagens PURAS). ONDA2 (error-flow): o `kind`
 * das bolhas de erro é metadado de UI — STRIPADO aqui (o contrato do main
 * trafega só role/content; as bolhas continuam no histórico como texto).
 */
export function chatHistory(state: TrackLessonUiState): TutorChatMessage[] {
  return state.history.map((m) => ({ role: m.role, content: m.content }));
}

/** A próxima ação do tutor: 'next' enquanto houver seção; depois, fim. */
export function tutorNextAction(state: TrackLessonUiState): 'next' | 'answer' {
  return state.theoryDone ? 'answer' : 'next';
}

/** Nº de seções apresentadas (para a UI mostrar o progresso da aula). */
export function presentedCount(state: TrackLessonUiState): number {
  return state.presentedSections.length;
}

// ─── ONDA2 (error-flow): relatório do erro + bolha determinística ────────────

/** Entrada de buildErrorReport — o que o painel do desafio sabe no submit. */
export interface BuildErrorReportArgs {
  trackSlug: string;
  lessonId: string;
  challengeId: string;
  challengeTitle: string;
  /** TODOS os arquivos submetidos (multi-arquivo ou o único solution.mjs). */
  files: { path: string; code: string }[];
  /** Resultado de track:challenge-submit (passed=false). */
  result: TrackSubmitResult;
}

/**
 * Monta o `TrackChallengeErrorReport` a partir do resultado do submit — o que
 * o MAIN precisa para analisar a hipótese do aluno contra o erro REAL (código
 * enviado + saída + checks), SEM a solução (nunca trafega testsCode/
 * solutionCode). PURA e testável.
 */
export function buildErrorReport(args: BuildErrorReportArgs): TrackChallengeErrorReport {
  return {
    trackSlug: args.trackSlug,
    lessonId: args.lessonId,
    challengeId: args.challengeId,
    challengeTitle: args.challengeTitle,
    files: args.files.map((f) => ({ path: f.path, code: f.code })),
    output: args.result.output,
    checks: args.result.checks.map((c) => ({ name: c.name, passed: c.passed })),
    passedCount: args.result.passedCount,
    totalCount: args.result.totalCount,
  };
}

/**
 * Rótulos i18n da bolha de erro (a lib é PURA — sem i18n; a LessonView injeta
 * as traduções atuais; sem labels, o default espelha o padrão das chaves
 * pt-BR `challenge.partialCount`/`challenge.checksTitle`/`challenge.output`).
 */
export interface ErrorBubbleLabels {
  /** Título da bolha (chave `lesson.errorBubbleTitle`). */
  title: string;
  /** Razão parcial JÁ interpolada ("1 de 3 testes passaram"). */
  partialCount: string;
  /** Rótulo do checklist (chave `challenge.checksTitle`). */
  checksTitle: string;
  /** Rótulo da saída (chave `challenge.output`). */
  outputTitle: string;
}

const DEFAULT_BUBBLE_LABELS: ErrorBubbleLabels = {
  title: 'Seu código falhou nos testes',
  partialCount: '{{passed}} de {{total}} testes passaram',
  checksTitle: 'Resultado por teste',
  outputTitle: 'Saída',
};

/**
 * Markdown DETERMINÍSTICO da bolha de erro — UMA mensagem do histórico (o
 * ChatBubble renderiza markdown): título do desafio, razão parcial (N de M,
 * mesmo padrão das chaves i18n `challenge.partialCount`/`checksTitle`),
 * checklist com ✔/✖ e a saída em code block. `labels` permite à UI injetar
 * as traduções correntes (default = padrão pt-BR acima).
 */
export function formatErrorBubble(
  report: TrackChallengeErrorReport,
  labels: Partial<ErrorBubbleLabels> = {},
): string {
  const l: ErrorBubbleLabels = { ...DEFAULT_BUBBLE_LABELS, ...labels };
  const partial = l.partialCount
    .replaceAll('{{passed}}', String(report.passedCount))
    .replaceAll('{{total}}', String(report.totalCount));
  const checks = report.checks.length > 0
    ? report.checks.map((c) => `- ${c.passed ? '✔' : '✖'} ${c.name}`).join('\n')
    : '- _(nenhum check rodou — a execução nem chegou aos testes)_';
  return [
    `## ${l.title}`,
    `**${report.challengeTitle}**`,
    `**${partial}**`,
    `${l.checksTitle}`,
    checks,
    `${l.outputTitle}:`,
    '```text',
    report.output,
    '```',
  ].join('\n\n');
}

/**
 * Semeia a discussão do erro no chat da aula (chamado pela LessonView na
 * MONTAGEM, quando `nav.challengeErrorReport` está presente). Regras:
 *
 *   - DEDUPE POR challengeId: o MESMO desafio já semeado → no-op (guard
 *     anti-StrictMode/remount — a bolha nasce UMA única vez);
 *   - desafio DIFERENTE → REPÕE as bolhas do erro anterior (remove as
 *     mensagens kind 'error-bubble'/'error-question' antigas e insere as
 *     novas no MESMO ponto);
 *   - insere a bolha de erro (kind 'error-bubble', markdown de
 *     `formatErrorBubble`) + a bolha da pergunta (kind 'error-question') e
 *     grava `challengeError` no estado.
 *
 * `questionText` vem como parâmetro (a lib é pura, sem i18n) e `labels`
 * opcional injeta as traduções da bolha (padrão pt-BR).
 */
export function seedChallengeError(
  state: TrackLessonUiState,
  report: TrackChallengeErrorReport,
  questionText: string,
  labels: Partial<ErrorBubbleLabels> = {},
): TrackLessonUiState {
  if (state.challengeError?.challengeId === report.challengeId) return state;
  const errorBubble: TutorChatMessage = {
    role: 'assistant',
    kind: 'error-bubble',
    content: formatErrorBubble(report, labels),
  };
  const questionBubble: TutorChatMessage = {
    role: 'assistant',
    kind: 'error-question',
    content: questionText,
  };
  const prev = state.challengeError ? state.challengeError.challengeId : null;
  let history = state.history;
  if (prev) {
    // REPÕE: remove as bolhas do erro ANTERIOR no ponto em que estavam e
    // re-insere as novas no mesmo lugar (o diálogo do erro vira o novo erro).
    const insertAt = history.findIndex((m) => m.kind === 'error-bubble' || m.kind === 'error-question');
    history = history.filter((m) => m.kind !== 'error-bubble' && m.kind !== 'error-question');
    if (insertAt >= 0) {
      history = [...history.slice(0, insertAt), errorBubble, questionBubble, ...history.slice(insertAt)];
    } else {
      history = [...history, errorBubble, questionBubble];
    }
  } else {
    history = [...history, errorBubble, questionBubble];
  }
  return { ...state, history, challengeError: report };
}

/**
 * Zera o contexto de erro em discussão (MANTÉM o histórico — as bolhas
 * continuam visíveis na conversa). Usado pela LessonView após o 'next'
 * (a teoria retoma) e quando um seed limpo é necessário.
 */
export function clearChallengeError(state: TrackLessonUiState): TrackLessonUiState {
  if (!state.challengeError) return state;
  return { ...state, challengeError: null };
}
