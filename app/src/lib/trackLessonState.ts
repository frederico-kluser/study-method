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
 * `kind: 'review'` (markdown determinístico do erro — ver `formatErrorBubble`)
 * e `kind: 'message'` (a pergunta do tutor "o que você acha que errou?").
 *
 * ONDA1-MODELO-CHAT (chat iMessage): o modelo de mensagem que a Onda 2
 * consome — toda mensagem carrega `ts` (timestamp de CRIAÇÃO, Date.now();
 * injetável nos testes via `now?`), e o `kind` unificado
 * 'message' | 'reply' | 'review':
 *
 *   - 'message' — mensagem normal: seções 'next' do tutor, a pergunta do
 *     tutor no fluxo de erro, mensagens comuns;
 *   - 'reply' — a resposta do tutor a uma pergunta do aluno (a ÚLTIMA
 *     mensagem do histórico é 'user' e a ação NÃO é 'next' — seções 'next'
 *     nunca viram 'reply', o histórico antes de um 'next' termina em
 *     'assistant');
 *   - 'review' — a bolha do review do desafio que falhou (checklist/saída +
 *     código submetido; carrega `errorFor` com o challengeId).
 *
 * O `kind`/`errorFor`/`ts` são METADADOS DE UI — `chatHistory` os STRIPA antes
 * de enviar ao main (o histórico é texto puro role/content).
 *
 * Helpers de STREAMING puros para o efeito "digitação" (~100 tokens/s) da
 * Onda 2: `typewriterCut`/`typewriterDelayPerChar`/`typewriterIsDone`.
 */
import type {
  TrackChallengeErrorReport,
  TrackSubmitResult,
  TrackVerdict,
  TutorMessage,
  TutorReply,
} from '../../shared/ipc-contract';

export interface TutorChatMessage {
  role: 'assistant' | 'user';
  content: string;
  /**
   * ONDA1-MODELO-CHAT: timestamp (Date.now()) do momento da CRIAÇÃO da
   * mensagem — as funções de criação (`pushUserMessage`, `applyTutorReply`,
   * `seedChallengeError`) recebem `now?: number` opcional (default
   * Date.now()) para testes determinísticos. A Onda 2 (chat iMessage) usa o
   * `ts` para exibir o horário da bolha. NUNCA trafega no histórico enviado
   * ao main (chatHistory stripa).
   */
  ts: number;
  /**
   * ONDA1-MODELO-CHAT (substitui 'error-bubble'/'error-question'):
   *   - 'message' — mensagem normal (seção 'next' do tutor, a pergunta do
   *     tutor no fluxo de erro, mensagens comuns);
   *   - 'reply' — resposta do tutor a uma pergunta do aluno (última do
   *     histórico é 'user' e a ação não é 'next');
   *   - 'review' — a bolha do review do desafio (checklist/saída + código
   *     submetido; carrega `errorFor` com o challengeId).
   * Presente nas mensagens 'assistant' criadas pelo módulo; ausente nas
   * mensagens 'user'. NUNCA trafega no histórico enviado ao main
   * (chatHistory stripa).
   */
  kind?: 'message' | 'reply' | 'review';
  /**
   * ONDA3-FIX: challengeId da bolha 'review' — o seed usa o HISTÓRICO por ele
   * para localizar o par antigo daquele desafio no RETRY
   * (`clearChallengeError`/'next' zera o `challengeError` mas as bolhas ficam
   * na conversa; uma 2ª falha do MESMO desafio re-semeia: par antigo sai, par
   * novo entra no fim). Presente SÓ na mensagem 'review' (a pergunta do par
   * não precisa). NUNCA trafega no histórico enviado ao main (chatHistory
   * stripa).
   */
  errorFor?: string;
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

/**
 * Aplica a resposta do tutor (de 'track:tutor-chat') ao estado. ONDA1:
 * `now` injetável (default Date.now()) define o `ts` da mensagem criada, e a
 * resposta ganha `kind: 'reply'` quando responde à pergunta do aluno (a
 * última mensagem do histórico é 'user' e NÃO é uma ação 'next' — o 'next'
 * sempre vem depois de 'assistant'); caso contrário, 'message'.
 */
export function applyTutorReply(
  state: TrackLessonUiState,
  reply: TutorReply,
  now: number = Date.now(),
): TrackLessonUiState {
  const lastIsUser = state.history[state.history.length - 1]?.role === 'user';
  // ONDA1-MODELO-CHAT (regra de REPLY): 'reply' só quando o tutor respondeu à
  // pergunta do aluno ('answer' — a última mensagem é 'user'); seção 'next'
  // (sectionId presente) NUNCA vira 'reply', mesmo se o histórico terminar em
  // 'user' (defensivo — o main responde 'next' sem 'user' antes).
  const kind: TutorChatMessage['kind'] =
    lastIsUser && !reply.sectionId ? 'reply' : 'message';
  const history = reply.message.trim()
    ? [...state.history, { role: 'assistant' as const, content: reply.message, ts: now, kind }]
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

/**
 * Adiciona a pergunta do aluno ao histórico. ONDA1: `now` injetável (default
 * Date.now()) define o `ts` da mensagem criada.
 */
export function pushUserMessage(
  state: TrackLessonUiState,
  text: string,
  now: number = Date.now(),
): TrackLessonUiState {
  const content = text.trim();
  if (!content) return state;
  return {
    ...state,
    history: [...state.history, { role: 'user' as const, content, ts: now }],
    lastError: null,
  };
}

/**
 * O histórico enviado ao main (mensagens PURAS role/content — o contrato
 * `TutorMessage` do main). ONDA2/ONDA3/ONDA1-MODELO-CHAT: `kind`, `errorFor`
 * e `ts` são metadados de UI — STRIPADOS aqui (o contrato do main trafega só
 * role/content; as bolhas continuam no histórico como texto).
 */
export function chatHistory(state: TrackLessonUiState): TutorMessage[] {
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

// ─── ONDA1-MODELO-CHAT: streaming puro (efeito "digitação" ~100 tokens/s) ────

/**
 * Índice de corte do efeito "digitação": quantos caracteres do texto já
 * foram "digitados" após `elapsedMs` — tokens ≈ 4 chars, então
 * chars = floor(elapsedMs * tps * 4 / 1000) (default tps=100 → ~400 chars/s),
 * clampado a [0, text.length]. Monotônico em `elapsedMs`: 0ms → 0; tempo
 * grande (ou tps alto) → text.length. A UI corta `text.slice(0, cut)`.
 */
export function typewriterCut(text: string, elapsedMs: number, tps: number = 100): number {
  const chars = Math.floor((elapsedMs * tps * 4) / 1000);
  return Math.max(0, Math.min(text.length, chars));
}

/**
 * ms por caractere do efeito "digitação" ≈ 1000 / (tps * 4) — com o default
 * tps=100 → ~2.5ms/char. A UI usa para agendar o avanço do typewriter.
 */
export function typewriterDelayPerChar(tps: number = 100): number {
  return 1000 / (tps * 4);
}

/** true quando o typewriter JÁ "digitou" o texto inteiro (cut >= length). */
export function typewriterIsDone(text: string, elapsedMs: number, tps: number = 100): boolean {
  return typewriterCut(text, elapsedMs, tps) >= text.length;
}

// ─── ONDA2-IMESSAGE (chat estilo iMessage): hora, separador de dia e gating ──

/**
 * Hora da bolha (HH:MM — 24h fixo nos DOIS idiomas; decisão documentada no
 * handoff: o pedido do dono é "HH:MM" e o relógio de 24h evita ambiguidade
 * AM/PM nas duas línguas). O `ts` vem do modelo — o cache preserva, então uma
 * mensagem restaurada mostra a hora ORIGINAL de criação. PURA e injetável.
 */
export function formatChatTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts);
}

/**
 * Separador de dia centralizado do chat (estilo iMessage): null quando a
 * mensagem cai no MESMO dia da anterior; `{ kind: 'today' }` / `'yesterday'`
 * (a UI traduz via i18n — a lib é pura) quando o dia muda para hoje/ontem;
 * `{ kind: 'date', label }` com a data COMPLETA no locale do app (ex.:
 * "15 de jul. de 2026" / "Jul 15, 2026") para dias mais antigos. Sem mensagem
 * anterior → null (nenhum separador antes da primeira bolha). DECISÃO:
 * sempre inclui o ano na data completa (uma aula retomada do cache pode
 * atravessar anos). `now` injetável para testes determinísticos.
 */
export type ChatDaySeparator =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'date'; label: string };

export function chatDaySeparator(
  ts: number,
  prevTs: number | undefined,
  locale: string,
  now: number = Date.now(),
): ChatDaySeparator | null {
  if (prevTs === undefined) return null;
  const d = new Date(ts);
  const p = new Date(prevTs);
  const sameDay =
    d.getFullYear() === p.getFullYear() &&
    d.getMonth() === p.getMonth() &&
    d.getDate() === p.getDate();
  if (sameDay) return null;
  const today = new Date(now);
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return { kind: 'today' };
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return { kind: 'yesterday' };
  }
  return {
    kind: 'date',
    label: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ts),
  };
}

/**
 * GATING do "Concluir aula" (ONDA2-imessage): a aula SÓ termina com todos os
 * desafios concluídos — bloqueado quando há desafios E algum não passou
 * (`lastVerdict !== 'passed'` — null = nunca tentado, failed/timeout/
 * abandoned = não passou). Sem desafios → liberado. O payload `track.lesson`
 * traz `lastVerdict` (a re-busca na abertura cobre o estado recém-gravado).
 * PURA e testável.
 */
export function isLessonFinishBlocked(
  challenges: readonly { lastVerdict: TrackVerdict | null }[],
): boolean {
  return challenges.length > 0 && challenges.some((c) => c.lastVerdict !== 'passed');
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
 * ONDA1-MODELO-CHAT: `filesTitle` rotula a seção do código submetido (novo).
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
  /** Rótulo da seção do código submetido (chave `lesson.errorBubbleFilesTitle`). */
  filesTitle: string;
}

const DEFAULT_BUBBLE_LABELS: ErrorBubbleLabels = {
  title: 'Seu código falhou nos testes',
  partialCount: '{{passed}} de {{total}} testes passaram',
  checksTitle: 'Resultado por teste',
  outputTitle: 'Saída',
  filesTitle: 'Código submetido',
};

/**
 * Markdown DETERMINÍSTICO da bolha de erro — UMA mensagem do histórico (o
 * ChatBubble renderiza markdown): título do desafio, razão parcial (N de M,
 * mesmo padrão das chaves i18n `challenge.partialCount`/`checksTitle`), o
 * CÓDIGO SUBMETIDO do aluno (ONDA1-MODELO-CHAT: um code block por arquivo de
 * `report.files`, com o path como título — ANTES da seção de saída/checks; a
 * Onda 2 renderiza e o teste asserta a presença do código), checklist com
 * ✔/✖ e a saída em code block. `labels` permite à UI injetar as traduções
 * correntes (default = padrão pt-BR acima).
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
  // Código submetido: um code block por arquivo, com o path como título.
  const files = report.files.length > 0
    ? report.files
        .map((f) => `**${f.path}**\n\n\`\`\`\n${f.code}\n\`\`\``)
        .join('\n\n')
    : null;
  return [
    `## ${l.title}`,
    `**${report.challengeTitle}**`,
    `**${partial}**`,
    ...(files !== null ? [`${l.filesTitle}`, files] : []),
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
 *   - NO-OP SÓ COM DISCUSSÃO ATIVA: `challengeError` do estado já aponta o
 *     MESMO desafio → no-op (guard anti-StrictMode/remount — o erro já está
 *     em tela). Este é o ÚNICO guard;
 *   - RETRY do MESMO desafio após o 'next' (`clearChallengeError` zerou
 *     `challengeError` mas as bolhas ficaram na conversa): RE-SEMEIA —
 *     remove o par antigo daquele challengeId (a 'review' com
 *     `errorFor === challengeId` e a 'message' da pergunta imediatamente
 *     seguinte — o par é sempre semeado adjacente) e APPENDA o par novo no
 *     FIM do histórico (o retry aconteceu depois das seções de teoria). As
 *     mensagens da discussão antiga (resposta do aluno + análise do tutor)
 *     PERMANECEM como conversa legítima. O `challengeError` novo carrega o
 *     erro da tentativa ATUAL — o 'answer' seguinte vai ao main com ele;
 *   - desafio DIFERENTE → REPÕE as bolhas do erro anterior (remove os pares
 *     de review antigos e insere os novos no MESMO ponto — inclusive quando
 *     `challengeError` já foi zerado pelo 'next' e o diálogo antigo só vive
 *     no histórico);
 *   - insere a bolha de review (kind 'review', markdown de
 *     `formatErrorBubble`) + a bolha da pergunta (kind 'message') e grava
 *     `challengeError` no estado. ONDA1-MODELO-CHAT: as mensagens novas
 *     carregam `ts: now` (injetável — default Date.now()).
 *
 * `questionText` vem como parâmetro (a lib é pura, sem i18n) e `labels`
 * opcional injeta as traduções da bolha (padrão pt-BR).
 */
export function seedChallengeError(
  state: TrackLessonUiState,
  report: TrackChallengeErrorReport,
  questionText: string,
  labels: Partial<ErrorBubbleLabels> = {},
  now: number = Date.now(),
): TrackLessonUiState {
  // FIX-FINAL: guard ÚNICO = discussão ATIVA do MESMO desafio (challengeError
  // setado) → no-op (anti-StrictMode/remount — o erro já está em tela).
  if (state.challengeError?.challengeId === report.challengeId) return state;
  const reviewBubble: TutorChatMessage = {
    role: 'assistant',
    kind: 'review',
    errorFor: report.challengeId,
    ts: now,
    content: formatErrorBubble(report, labels),
  };
  const questionBubble: TutorChatMessage = {
    role: 'assistant',
    kind: 'message',
    ts: now,
    content: questionText,
  };
  // RETRY do MESMO desafio após o 'next' (challengeError null, par antigo no
  // histórico): REMOVE o par antigo daquele challengeId (a 'review' com
  // errorFor === challengeId + a 'message' da pergunta imediatamente
  // seguinte — o par é sempre semeado adjacente) e APPENDA o par novo no FIM
  // do histórico (a cronologia natural: o retry aconteceu depois das seções
  // de teoria). A discussão antiga (resposta do aluno + análise do tutor)
  // PERMANECE — é texto de conversa legítimo.
  const oldBubbleIndex = state.history.findIndex(
    (m) => m.kind === 'review' && m.errorFor === report.challengeId,
  );
  if (oldBubbleIndex >= 0) {
    // Com a taxonomia nova, a pergunta do par é 'message' (kind genérico) —
    // só a ADJACÊNCIA a distingue de uma mensagem normal do tutor (o par é
    // sempre semeado atomicamente, nada entra entre a review e a pergunta).
    const next = state.history[oldBubbleIndex + 1];
    const hasQuestionAfter = next?.role === 'assistant' && next?.kind === 'message';
    const removeEnd = oldBubbleIndex + (hasQuestionAfter ? 2 : 1);
    const history = [
      ...state.history.slice(0, oldBubbleIndex),
      ...state.history.slice(removeEnd),
      reviewBubble,
      questionBubble,
    ];
    return { ...state, history, challengeError: report };
  }
  const stripped = stripSeededReviewPairs(state.history);
  if (stripped.insertAt >= 0) {
    // REPÕE: remove os pares de review do erro ANTERIOR no ponto em que
    // estavam e re-insere os novos no mesmo lugar (o diálogo do erro vira o
    // novo erro). Aqui é sempre REPOSIÇÃO (desafio DIFERENTE — o retry do
    // MESMO desafio foi tratado acima), nunca duplicação.
    const history = [
      ...stripped.history.slice(0, stripped.insertAt),
      reviewBubble,
      questionBubble,
      ...stripped.history.slice(stripped.insertAt),
    ];
    return { ...state, history, challengeError: report };
  }
  const history = [...state.history, reviewBubble, questionBubble];
  return { ...state, history, challengeError: report };
}

/**
 * Remove do histórico os pares de review SEMEADOS (a bolha 'review' + a
 * pergunta 'message' imediatamente seguinte). O par é SEMPRE semeado
 * adjacente (seedChallengeError insere as duas bolhas atomicamente), então a
 * pergunta é identificada por POSIÇÃO — com a taxonomia nova, 'message' é o
 * kind genérico das mensagens do tutor e só a adjacência imediata a uma
 * 'review' distingue a pergunta semeada de uma seção/mensagem normal.
 * Defensivo: uma 'review' no fim do histórico (sem 'message' seguinte) é
 * removida sozinha. Devolve o histórico sem os pares e o índice onde o
 * PRIMEIRO par começava (para re-inserção no mesmo ponto), ou -1 se não
 * havia pares.
 */
function stripSeededReviewPairs(
  history: TutorChatMessage[],
): { history: TutorChatMessage[]; insertAt: number } {
  const removeIdx = new Set<number>();
  for (let i = 0; i < history.length; i++) {
    if (history[i].kind !== 'review') continue;
    removeIdx.add(i);
    const next = history[i + 1];
    if (next?.role === 'assistant' && next?.kind === 'message') removeIdx.add(i + 1);
  }
  if (removeIdx.size === 0) return { history, insertAt: -1 };
  return {
    history: history.filter((_, i) => !removeIdx.has(i)),
    insertAt: Math.min(...removeIdx),
  };
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
