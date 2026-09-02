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
 * ONDA4 (quiz): `quizBySection` guarda o estado do QUIZ de múltipla escolha
 * por afirmação (chaveado por sectionId — REPLAN A1). Os helpers do quiz são
 * PURA: a UI renderiza o card APÓS a bolha da seção que o demonstra e o mantém
 * preenchido com o feedback após responder (idempotente).
 *
 * ONDA10 (bug do dono — "o quiz pode ser ignorado; quero que o usuario tenha
 * que responder"): o quiz DEIXOU de ser reforço e virou GATE. `pendingQuizzes`
 * (todas as seções já apresentadas) bloqueia o "Concluir aula" e
 * `pendingQuizzesForCurrentSection` bloqueia o "Próximo". O gate lê `answered`
 * e NUNCA `correct` — errar libera igual a acertar.
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
 * Onda 10: `TYPEWRITER_TPS`/`chatBubbleTps` — a TEORIA passa a ser digitada em
 * velocidade de LEITURA (7 tps = 28 chars/s; a conta completa está no bloco).
 */
import type {
  TrackAssertionDto,
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
  /**
   * ADITIVO (onda4-quiz): estado do QUIZ de múltipla escolha por afirmação,
   * chaveado por sectionId (a seção de teoria que demonstra a assertion — ver
   * REPLAN A1). Uma assertion SEM sectionId (trilhas antigas) é ancorada na
   * ÚLTIMA seção apresentada via `FALLBACK_QUIZ_SECTION` (ver
   * `assertionsBySection`). O quiz é REFORÇO (não gate): respostas persistem
   * no estado (e, por extensão, no lessonChatCache) — na retomada da aula o
   * quiz já respondido aparece preenchido.
   */
  quizBySection: Record<string, QuizState>;
}

/**
 * ONDA4 (quiz): estado de UMA resposta do quiz — `answered` marca a resposta
 * dada, `selected` o índice da opção escolhida e `correct` o veredito
 * (answerIndex === selected). Estado IMUTÁVEL por contrato (mesmo padrão do
 * TrackLessonUiState): os helpers devolvem um objeto novo a cada update.
 */
export interface QuizState {
  answered: boolean;
  selected: number | null;
  correct: boolean | null;
}

export function createTrackLessonState(): TrackLessonUiState {
  return {
    presentedSections: [],
    history: [],
    theoryDone: false,
    lastError: null,
    challengeError: null,
    quizBySection: {},
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
    // ONDA4 (quiz): campo ADITIVO — o quiz respondido sobrevive aos turnos
    // (applyTutorReply monta o objeto EXPLICITAMENTE, sem spread; sem esta
    // linha o quizBySection se perderia no primeiro 'next'/'answer').
    quizBySection: state.quizBySection,
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

/**
 * ONDA10 (velocidade de LEITURA — bug 3 do dono: "quero que a escrita da
 * história seja na velocidade de leitura").
 *
 * A CONTA, com os números MEDIDOS nesta trilha (não estimados):
 *
 *   1. Leitura de um adulto em português: 200–250 palavras/min. A calibragem
 *      usa o TOPO da faixa (250 wpm) de propósito — escrever MAIS DEVAGAR que
 *      o leitor é o único erro que PUNE (ele espera); escrever um pouco mais
 *      rápido não custa nada (o texto só já está lá quando o olho chega).
 *   2. Tamanho de palavra MEDIDO na teoria da aula 1 (python/a-tela/
 *      a-primeira-linha): 1212 chars / 223 palavras = 5,43 chars por palavra
 *      (o separador conta — é caractere digitado).
 *        250 palavras/min × 5,43 chars = 1357 chars/min = 22,6 chars/s.
 *   3. O typewriter digita o MARKDOWN CRU, o aluno lê o RENDERIZADO: `**`,
 *      crases, `-` de lista e quebras de linha são digitados e NÃO são lidos.
 *      Medido na aula 1: visível/cru = 0,948 (0,934 na seção mais longa).
 *        22,6 / 0,934 = 24,2 chars/s de markdown cru para entregar 22,6
 *        chars/s de texto visível.
 *   4. Teto de paciência (contrato desta onda): nenhuma seção pode passar de
 *      ~20 s. A seção mais longa de toda a base medida é a `as-tres-partes-
 *      da-linha` da AULA 1, com 564 chars → exige ≥ 28,2 chars/s.
 *   5. chars/s = tps × 4 (a unidade do typewriter é "tokens", ~4 chars).
 *        28 chars/s → tps = 7.
 *
 *   VEREDITO: `theory` = 7 tps = 28 chars/s. A seção mais longa da aula 1
 *   (564 chars) leva 564/28 = 20,1 s; a mediana da base (286 chars) leva
 *   10,2 s; a menor (158 chars) leva 5,6 s. E o aluno NUNCA fica refém: um
 *   clique/tecla completa a seção na hora (prop `skip` do TypewriterText).
 *
 * O default GLOBAL de `typewriterCut` continua 100 (`free`) — quem muda é o
 * CHAMADOR (a LessonView, por `chatBubbleTps`). Trocar o default afetaria em
 * bloco as respostas do tutor e a review, que têm decisões próprias.
 */
export const TYPEWRITER_TPS = {
  /**
   * Respostas do tutor a uma dúvida (kind 'reply') e qualquer bolha fora da
   * teoria: "livre" — o default histórico (ONDA1), ~400 chars/s. NÃO é
   * leitura: é o texto que o aluno PEDIU e já está esperando na tela.
   */
  free: 100,
  /**
   * TEORIA da aula (bolha 'next' — a "escrita da história"): velocidade de
   * LEITURA, 7 tps = 28 chars/s. Ver a conta acima.
   */
  theory: 7,
  /**
   * Review do desafio (ONDA1-NAV-UI, pedido do dono: "10 ao escrever em IA
   * online"). INTOCADO nesta onda.
   */
  review: 10,
} as const;

/**
 * true quando a bolha do índice `i` é uma APRESENTAÇÃO DE TEORIA (a "história"
 * da aula): mensagem `assistant` de kind 'message' que NÃO segue imediatamente
 * uma bolha 'review'. O critério é o MESMO de `sectionPresentationIndexes` — a
 * pergunta semeada do erro (`seedChallengeError`) também é 'message', mas vem
 * SEMPRE colada numa 'review', e por isso NÃO é teoria. PURA.
 */
export function isTheoryPresentationBubble(
  history: readonly TutorChatMessage[],
  i: number,
): boolean {
  const m = history[i];
  if (m === undefined || m.role !== 'assistant' || m.kind !== 'message') return false;
  return history[i - 1]?.kind !== 'review';
}

/**
 * tokens/s do typewriter da bolha `i` do histórico (defeito 3): 'review' → 10;
 * apresentação de TEORIA → velocidade de leitura (7); qualquer outra bolha do
 * tutor → 'free' (100, o default histórico). PURA — a LessonView só repassa.
 */
export function chatBubbleTps(history: readonly TutorChatMessage[], i: number): number {
  if (history[i]?.kind === 'review') return TYPEWRITER_TPS.review;
  if (isTheoryPresentationBubble(history, i)) return TYPEWRITER_TPS.theory;
  return TYPEWRITER_TPS.free;
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
  pendingQuizCount: number = 0,
): boolean {
  return lessonFinishBlock(challenges, pendingQuizCount) !== null;
}

/**
 * ONDA10 (bug 2 do dono: "o quiz pode ser ignorado; quero que o usuario tenha
 * que responder") — MOTIVO do bloqueio do "Concluir aula", para a UI DIZER por
 * que o botão está travado (um botão morto sem explicação é pior que o bug):
 *
 *   - 'quiz'       → ainda há quiz VISÍVEL (ancorado numa seção já
 *                    apresentada) sem resposta. Vem PRIMEIRO porque é o
 *                    desbloqueio mais barato: o card está na tela, a um
 *                    clique de distância;
 *   - 'challenges' → algum desafio da aula não passou (regra ONDA2-imessage,
 *                    intacta);
 *   - null         → liberado.
 *
 * IMPORTANTE — ERRAR NÃO TRAVA: o gate lê `answered`, NUNCA `correct`. O quiz
 * existe para o aluno PENSAR, não para puni-lo; `submitQuizAnswer` é
 * idempotente (a primeira resposta vence) e uma resposta errada libera
 * exatamente como a certa. PURA.
 */
export type LessonFinishBlockReason = 'quiz' | 'challenges';

export function lessonFinishBlock(
  challenges: readonly { lastVerdict: TrackVerdict | null }[],
  pendingQuizCount: number = 0,
): LessonFinishBlockReason | null {
  if (pendingQuizCount > 0) return 'quiz';
  if (challenges.length > 0 && challenges.some((c) => c.lastVerdict !== 'passed')) {
    return 'challenges';
  }
  return null;
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
 * ONDA3-E2E-FENCE: devolve o FENCE do code block adequado ao conteúdo — o
 * fence fixo de 3 backticks quebra o markdown quando o conteúdo tem um run
 * de 3+ backticks (`formatErrorBubble` embute o CÓDIGO DO ALUNO e a SAÍDA do
 * runner — conteúdo de autoria não controlada, que pode ecoar backticks de
 * console.log). Regra: fence = max(3, maiorRunDeBackticks + 1) — um fence de
 * N+1 backticks nunca é fechado por uma linha de conteúdo com run <= N.
 */
export function fenceFor(code: string): string {
  const longestRun = Math.max(0, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  return '`'.repeat(Math.max(3, longestRun + 1));
}

/**
 * Markdown DETERMINÍSTICO da bolha de erro — UMA mensagem do histórico (o
 * ChatBubble renderiza markdown): título do desafio, razão parcial (N de M,
 * mesmo padrão das chaves i18n `challenge.partialCount`/`checksTitle`), o
 * CÓDIGO SUBMETIDO do aluno (ONDA1-MODELO-CHAT: um code block por arquivo de
 * `report.files`, com o path como título — ANTES da seção de saída/checks; a
 * Onda 2 renderiza e o teste asserta a presença do código), checklist com
 * ✔/✖ e a saída em code block. `labels` permite à UI injetar as traduções
 * correntes (default = padrão pt-BR acima).
 *
 * ONDA3-E2E-FENCE: os code blocks de arquivo E o bloco de saída usam fence
 * DINÂMICO (`fenceFor`) — o código do aluno e o output do runner podem
 * conter backticks (o app compõe o fence com conteúdo de autoria do aluno);
 * um fence fixo de 3 quebraria o markdown nesses casos.
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
  // ONDA3-E2E-FENCE: fence DINÂMICO por conteúdo (fenceFor) — o código do
  // aluno pode conter backticks e um fence fixo de 3 quebraria o bloco.
  const files = report.files.length > 0
    ? report.files
        .map((f) => {
          const fence = fenceFor(f.code);
          return `**${f.path}**\n\n${fence}\n${f.code}\n${fence}`;
        })
        .join('\n\n')
    : null;
  // ONDA3-E2E-FENCE: fence dinâmico também na saída (o runner pode ecoar
  // backticks do console.log do aluno) — o fence casa com o opening.
  const outputFence = fenceFor(report.output);
  return [
    `## ${l.title}`,
    `**${report.challengeTitle}**`,
    `**${partial}**`,
    ...(files !== null ? [`${l.filesTitle}`, files] : []),
    `${l.checksTitle}`,
    checks,
    `${l.outputTitle}:`,
    `${outputFence}text`,
    report.output,
    `${outputFence}`,
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

// ─── ONDA4 (quiz): múltipla escolha por afirmação DURANTE a aula ────────────
//
// Contrato (REPLAN A1): cada assertion do payload TrackLessonPayload carrega
// `sectionId` (a seção de teoria que a demonstra). O quiz de uma assertion
// renderiza APÓS a bolha da seção cujo id == sectionId ser apresentada
// ('next') e é VISÍVEL só quando `presentedSections` contém o sectionId. O
// ONDA10: o quiz virou GATE (ver `pendingQuizzes` no fim do arquivo) — antes
// era reforço e não bloqueava nada. Assertion sem sectionId
// (trilhas antigas, defensivo) cai na chave sintética `FALLBACK_QUIZ_SECTION`
// e aparece APÓS a ÚLTIMA seção de teoria apresentada (fallback
// determinístico). Os helpers abaixo são PURA (node:test, sem React/DOM).

/** Chave sintética das assertions SEM sectionId (nunca colide com um id real
 *  de seção — slugs de arquivo). O quiz delas ancora na última seção
 *  apresentada. */
export const FALLBACK_QUIZ_SECTION = '__quiz_fallback__';

/**
 * Marca a resposta do quiz da seção: answered=true, selected=answerIndex,
 * correct=(answerIndex===correctIndex). IDEMPOTENTE: seção já respondida →
 * no-op (a primeira resposta vence — o quiz é "preenchido" e travado). PURA.
 */
export function submitQuizAnswer(
  state: TrackLessonUiState,
  sectionId: string,
  answerIndex: number,
  correctIndex: number,
): TrackLessonUiState {
  if (state.quizBySection[sectionId]?.answered === true) return state;
  return {
    ...state,
    quizBySection: {
      ...state.quizBySection,
      [sectionId]: {
        answered: true,
        selected: answerIndex,
        correct: answerIndex === correctIndex,
      },
    },
  };
}

/** Estado do quiz da seção (undefined = ainda não respondido). PURA. */
export function quizForSection(state: TrackLessonUiState, sectionId: string): QuizState | undefined {
  return state.quizBySection[sectionId];
}

/** true quando a seção JÁ foi respondida no quiz. PURA. */
export function isQuizAnswered(state: TrackLessonUiState, sectionId: string): boolean {
  return state.quizBySection[sectionId]?.answered === true;
}

/**
 * ONDA10 (bug 1 do dono: "o quiz ... ja vem selecionado") — ESTADO VISUAL de
 * UMA alternativa do quiz, extraído do JSX para uma função PURA.
 *
 * O BUG que isto mata: no card antigo a `variant` estava guardada por
 * `answered`, mas `color` e `startIcon` NÃO —
 *
 *     const isCorrectOption = i === assertion.answerIndex;   // sem `answered`
 *     color={isCorrectOption ? 'success' : ...}
 *     startIcon={isCorrectOption ? <CheckCircleIcon /> : ...}
 *
 * — então, ANTES de qualquer clique, a alternativa certa já aparecia VERDE e
 * com ✓. O aluno via a resposta.
 *
 * O conserto é ESTRUTURAL, não um `&& answered` a mais: enquanto
 * `quiz?.answered !== true`, a função RETORNA CEDO com um estado NEUTRO e
 * `assertion.answerIndex` NEM É LIDO. Não existe caminho em que o índice da
 * resposta influencie o pixel antes de responder — e o card consome só este
 * objeto (o JSX não recebe mais `answerIndex`), então o vazamento não tem por
 * onde voltar.
 *
 * `disabled` também mora aqui: respondido → TODAS as opções travam (a resposta
 * é idempotente, a primeira vence).
 */
export interface QuizOptionVisual {
  /** cor do Button MUI — 'inherit' é o neutro (nada distingue nada). */
  color: 'inherit' | 'success' | 'error';
  /** variante do Button MUI. */
  variant: 'outlined' | 'contained';
  /** ícone semântico; o card mapeia para CheckCircle/Cancel. null = sem ícone. */
  icon: 'correct' | 'wrong' | null;
  /** true quando a opção não pode mais ser clicada (já respondido). */
  disabled: boolean;
}

/** Estado visual NEUTRO — o de TODAS as opções antes de responder. */
const QUIZ_OPTION_NEUTRAL: QuizOptionVisual = {
  color: 'inherit',
  variant: 'outlined',
  icon: null,
  disabled: false,
};

export function optionVisualState(
  i: number,
  assertion: Pick<TrackAssertionDto, 'answerIndex'>,
  quiz: QuizState | undefined,
): QuizOptionVisual {
  // NÃO RESPONDIDO: retorno CEDO, neutro para toda opção. `answerIndex` não é
  // lido neste caminho — a resposta não pode vazar por construção.
  if (quiz?.answered !== true) return { ...QUIZ_OPTION_NEUTRAL };
  const isCorrectOption = i === assertion.answerIndex;
  // A escolha ERRADA do aluno (só existe depois de responder).
  const isWrongPick = quiz.correct !== true && i === quiz.selected;
  return {
    color: isCorrectOption ? 'success' : isWrongPick ? 'error' : 'inherit',
    variant: isCorrectOption ? 'contained' : 'outlined',
    icon: isCorrectOption ? 'correct' : isWrongPick ? 'wrong' : null,
    disabled: true,
  };
}

/**
 * Zera a resposta do quiz da seção (a seção volta a oferecer as opções).
 * No-op quando não há resposta gravada. PURA.
 */
export function resetQuiz(state: TrackLessonUiState, sectionId: string): TrackLessonUiState {
  if (state.quizBySection[sectionId] === undefined) return state;
  const quizBySection = { ...state.quizBySection };
  delete quizBySection[sectionId];
  return { ...state, quizBySection };
}

/**
 * Agrupa as assertions da aula por sectionId — uma seção pode demonstrar >1
 * assertion (ex.: 3 assertions × 2 seções → 2 na seção 1, 1 na seção 2). As
 * assertions SEM sectionId caem na chave sintética `FALLBACK_QUIZ_SECTION`
 * (o quiz delas aparece após a última seção apresentada — REPLAN A1). PURA.
 */
export function assertionsBySection(
  assertions: readonly TrackAssertionDto[],
): Record<string, TrackAssertionDto[]> {
  const out: Record<string, TrackAssertionDto[]> = {};
  for (const a of assertions) {
    const key = a.sectionId ?? FALLBACK_QUIZ_SECTION;
    (out[key] ??= []).push(a);
  }
  return out;
}

/**
 * Mapa sectionId → índice da bolha do histórico que APRESENTOU a seção — a
 * âncora do quiz "APÓS a bolha da seção". Identificação determinística: uma
 * apresentação é uma mensagem assistant `kind: 'message'` que NÃO é
 * imediatamente precedida por uma bolha 'review' (a pergunta semeada do erro
 * também é 'message' mas segue SEMPRE uma 'review' — o `seedChallengeError`
 * insere o par adjacente). O contador caminha em PARALELO com
 * `presentedSections` (a ordem das apresentações no histórico é a ordem das
 * seções — a teoria avança em sequência). Fallback determinístico: se a
 * contagem não bater com presentedSections (ex.: 'next' com mensagem vazia —
 * a seção entra no estado SEM bolha), as seções restantes ancoram no FIM do
 * histórico (índice history.length - 1; -1 quando o histórico está vazio).
 * PURA.
 */
export function sectionPresentationIndexes(state: TrackLessonUiState): Map<string, number> {
  const out = new Map<string, number>();
  let k = 0;
  for (let i = 0; i < state.history.length; i++) {
    // MESMO predicado do tps da teoria (`isTheoryPresentationBubble`): uma
    // fonte de verdade só para "esta bolha apresentou uma seção".
    if (!isTheoryPresentationBubble(state.history, i)) continue;
    if (k >= state.presentedSections.length) break;
    out.set(state.presentedSections[k], i);
    k += 1;
  }
  const anchor = state.history.length > 0 ? state.history.length - 1 : -1;
  for (let j = k; j < state.presentedSections.length; j++) {
    out.set(state.presentedSections[j], anchor);
  }
  return out;
}

/**
 * Quizzes a renderizar POR índice da bolha do histórico: assertion com
 * sectionId → índice da bolha que apresentou a seção; assertion SEM sectionId
 * → índice da bolha da ÚLTIMA seção apresentada (fallback determinístico do
 * REPLAN A1; sem seção apresentada ainda, o quiz não aparece — nada no mapa).
 * Devolve TODAS (respondidas ou não) — a UI decide o estado visual de cada
 * card via `quizForSection` (respondido = preenchido com feedback, travado).
 * PURA.
 */
export function quizzesByMessageIndex(
  state: TrackLessonUiState,
  assertions: readonly TrackAssertionDto[],
): Map<number, TrackAssertionDto[]> {
  const bySection = assertionsBySection(assertions);
  const presentation = sectionPresentationIndexes(state);
  const out = new Map<number, TrackAssertionDto[]>();
  const push = (idx: number, a: TrackAssertionDto): void => {
    const list = out.get(idx);
    if (list) list.push(a);
    else out.set(idx, [a]);
  };
  for (const [sectionId, idx] of presentation) {
    for (const a of bySection[sectionId] ?? []) push(idx, a);
  }
  const lastSection = state.presentedSections[state.presentedSections.length - 1];
  const fallbackIdx = lastSection !== undefined ? presentation.get(lastSection) : undefined;
  if (fallbackIdx !== undefined) {
    for (const a of bySection[FALLBACK_QUIZ_SECTION] ?? []) push(fallbackIdx, a);
  }
  return out;
}

// ─── ONDA10 (bug 2): o quiz vira OBRIGATÓRIO ─────────────────────────────────
// O dono: "o quiz pode ser ignorado e ja vem selecionado; quero que o usuario
// tenha que responder". Até aqui o quiz era REFORÇO (o cabeçalho antigo dizia
// "NUNCA bloqueia o Próximo") — dava para terminar a aula sem responder nada.
// Passa a ser GATE, com duas regras e uma garantia:
//
//   - "Próximo"      bloqueia enquanto a seção ATUAL (a última apresentada)
//                    tiver quiz sem resposta — `pendingQuizzesForCurrentSection`;
//   - "Concluir aula" bloqueia enquanto QUALQUER quiz já visível estiver sem
//                    resposta — `pendingQuizzes`;
//   - GARANTIA: o gate lê `answered`, NUNCA `correct`. Responder errado libera
//     igual a acertar (o quiz é para pensar, não para punir), e
//     `submitQuizAnswer` continua idempotente — a primeira resposta vence.
//
// Só entram no gate os quizzes ANCORADOS numa bolha já apresentada
// (`quizzesByMessageIndex`): um quiz que o aluno ainda não pode ver nunca
// bloqueia nada.

/**
 * Chave do estado do quiz de uma assertion — a MESMA que a LessonView usa ao
 * chamar `submitQuizAnswer`: `sectionId` quando existe, senão a `id` da
 * assertion (única por aula, então duas assertions sem sectionId têm quizzes
 * INDEPENDENTES na mesma âncora). PURA.
 */
export function quizKeyFor(assertion: Pick<TrackAssertionDto, 'id' | 'sectionId'>): string {
  return assertion.sectionId ?? assertion.id;
}

/**
 * Quizzes JÁ VISÍVEIS (ancorados numa bolha apresentada) que continuam SEM
 * resposta — o gate do "Concluir aula". Ordem determinística: pela ordem das
 * bolhas do histórico e, dentro da bolha, pela ordem das assertions. PURA.
 */
export function pendingQuizzes(
  state: TrackLessonUiState,
  assertions: readonly TrackAssertionDto[],
): TrackAssertionDto[] {
  const byIndex = quizzesByMessageIndex(state, assertions);
  const out: TrackAssertionDto[] = [];
  for (const idx of [...byIndex.keys()].sort((a, b) => a - b)) {
    for (const a of byIndex.get(idx) ?? []) {
      if (!isQuizAnswered(state, quizKeyFor(a))) out.push(a);
    }
  }
  return out;
}

/**
 * Quizzes da seção ATUAL (a ÚLTIMA apresentada) ainda sem resposta — o gate do
 * "Próximo". Inclui os quizzes de assertions SEM sectionId, que ancoram
 * justamente na última seção apresentada (mesma regra de
 * `quizzesByMessageIndex`). Sem seção apresentada → lista vazia (nada a
 * responder, nada a bloquear). PURA.
 */
export function pendingQuizzesForCurrentSection(
  state: TrackLessonUiState,
  assertions: readonly TrackAssertionDto[],
): TrackAssertionDto[] {
  const last = state.presentedSections[state.presentedSections.length - 1];
  if (last === undefined) return [];
  const idx = sectionPresentationIndexes(state).get(last);
  if (idx === undefined) return [];
  const here = quizzesByMessageIndex(state, assertions).get(idx) ?? [];
  return here.filter((a) => !isQuizAnswered(state, quizKeyFor(a)));
}

/**
 * true quando o "Próximo" (avançar a teoria) está bloqueado por quiz sem
 * resposta na seção atual. Açúcar sobre `pendingQuizzesForCurrentSection` —
 * o nome é o que a LessonView lê. PURA.
 */
export function isNextSectionBlockedByQuiz(
  state: TrackLessonUiState,
  assertions: readonly TrackAssertionDto[],
): boolean {
  return pendingQuizzesForCurrentSection(state, assertions).length > 0;
}
