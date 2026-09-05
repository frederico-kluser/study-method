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
 * por afirmação. Os helpers do quiz são PUROS: a UI renderiza o card APÓS a
 * bolha da seção que o demonstra e o mantém preenchido com o feedback.
 *
 * ONDA10 (bug do dono — "o quiz pode ser ignorado"): o quiz DEIXOU de ser
 * reforço e virou GATE. `pendingQuizzes` bloqueia o "Concluir aula" e
 * `pendingQuizzesForCurrentSection` bloqueia o "Próximo".
 *
 * ONDA1-MAESTRIA (decisão do dono desta onda — a regra do produto MUDA):
 * **responder deixou de bastar; agora é preciso ACERTAR.** Errar não libera —
 * abre um CICLO DE REMEDIAÇÃO:
 *
 *     erro → a IA explica por que aquela alternativa não se sustenta →
 *     a explicação ENTRA NO HISTÓRICO do chat (bolha `kind:
 *     'quiz-explanation'`) → um quiz NOVO sobre o MESMO conteúdo é injetado
 *     (`injectRemediationQuiz`, geração N+1) → o ciclo repete até o acerto.
 *
 * Só depois do acerto (`stage: 'dominado'`) a chave FECHA e o gate libera —
 * "só vamos para o desafio depois que o aluno provar que entendeu".
 *
 * ONDA4-SAÍDA-DO-CICLO: o gate acima mais o FAIL-CLOSED da IA travavam o aluno
 * PARA SEMPRE quando a IA saía do ar — sem quiz remediador não há o que
 * responder, e só o acerto abre. A saída é `reopenStalledQuiz`: com o canal
 * caído, o aluno REABRE a pergunta corrente (geração N+1, mesma pergunta) para
 * uma tentativa nova. Ela NÃO dispensa o gate (o estado resultante é
 * 'aguardando-resposta', nunca 'dominado') e NÃO apaga o rastro do erro
 * (`attempts` preservado, id `<chave>#g<N+1>` que a recorrência ERR-4 conta).
 * O bloco antes da função explica por que ela é uma GERAÇÃO NOVA e não um
 * "zerar o card".
 *
 * ERRAR CONTINUA NÃO SENDO PUNIÇÃO — `docs/ux-redesign.md` §8 item 3 é
 * normativo ("Teste falhou → sem punição… O painel troca para estado de
 * diagnóstico… redação informativa") e §8.2 proíbe o elogio ritualizado
 * (d = −0,40 medido) em favor do feedback INFORMACIONAL específico (d = +0,43
 * em adultos). O tom de todo texto deste ciclo é DIAGNÓSTICO: descreve onde a
 * alternativa se separa do que a seção mostra, nunca repreende. O bloqueio do
 * gate não é castigo: é a informação de que aquele trecho ainda não foi
 * demonstrado.
 *
 * BUG DE COLISÃO DE CHAVE CONSERTADO nesta onda (ver `quizKeyFor`): a chave
 * era `sectionId ?? assertion.id`, então DUAS assertions da MESMA seção
 * compartilhavam estado — responder uma marcava as duas. Medido em ≥4 das 20
 * aulas do módulo M1 real (`resources/tracks/python/modules/a-tela/lessons/*`
 * — a-primeira-linha, dar-nome-a-um-valor, de-texto-para-numero,
 * quando-da-errado têm 3 assertions cada). Com maestria obrigatória isso vira
 * um furo: o aluno pularia um quiz sem NUNCA respondê-lo.
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
 *
 * ONDA3-PERSISTÊNCIA: o ciclo do quiz DEIXA de morrer no fechamento do app.
 * `hydrateQuizFromHistory` (perto do fim do arquivo) reconstrói
 * `quizBySection` a partir do que `track:quiz-history` devolve — tentativas e
 * remediações persistidas —, com a sessão vencendo o banco chave a chave. A
 * conta completa (chave, geração, precedência, conteúdo que mudou) está no
 * bloco da própria função.
 */
import type {
  QuizAttemptDto,
  QuizRemediationDto,
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
   *     submetido; carrega `errorFor` com o challengeId);
   *   - 'quiz-explanation' (ONDA1-MAESTRIA) — a explicação diagnóstica do
   *     erro no quiz (`registerQuizExplanation`). Kind PRÓPRIO, e não
   *     'message', por um motivo mecânico: `isTheoryPresentationBubble` (e,
   *     por ela, `sectionPresentationIndexes`/`quizzesByMessageIndex`) conta
   *     bolhas 'message' como APRESENTAÇÃO DE SEÇÃO — uma explicação com kind
   *     'message' deslocaria a âncora de todos os quizzes seguintes e o gate
   *     passaria a olhar a bolha errada. Com kind próprio, a explicação entra
   *     na conversa sem tocar a ancoragem.
   * Presente nas mensagens 'assistant' criadas pelo módulo; ausente nas
   * mensagens 'user'. NUNCA trafega no histórico enviado ao main
   * (chatHistory stripa).
   */
  kind?: 'message' | 'reply' | 'review' | 'quiz-explanation';
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
 * ONDA1-MAESTRIA: em que ponto do CICLO aquela afirmação está.
 *
 *   - 'aguardando-resposta'  — a geração CORRENTE do quiz ainda não recebeu
 *                              resposta (o estado de partida);
 *   - 'explicando'           — a geração corrente foi respondida ERRADO; falta
 *                              a explicação diagnóstica entrar no chat;
 *   - 'novo-quiz-pendente'   — a explicação já está no histórico; falta o quiz
 *                              remediador da geração seguinte;
 *   - 'dominado'             — houve acerto. A chave FECHA: imutável dali em
 *                              diante, e é o único estado que libera o gate.
 */
export type QuizCycleStage =
  | 'aguardando-resposta'
  | 'explicando'
  | 'novo-quiz-pendente'
  | 'dominado';

/**
 * ONDA1-MAESTRIA: UMA tentativa registrada. O histórico de tentativas é o que
 * permite ao card de uma geração ANTIGA continuar mostrando o próprio feedback
 * depois que a geração corrente virou outra (ver
 * `optionVisualStateForGeneration`) — sem ele, injetar o quiz remediador
 * apagaria da tela o erro que o aluno acabou de cometer.
 */
export interface QuizAttempt {
  /** geração do quiz em que a tentativa aconteceu (0 = o quiz autoral). */
  generation: number;
  /** índice da alternativa escolhida. */
  selected: number;
  /** veredito da tentativa. */
  correct: boolean;
  /** Date.now() do registro (injetável nos testes, como o resto do módulo). */
  ts: number;
}

/**
 * ONDA4 (quiz): estado de UMA resposta do quiz — `answered` marca a resposta
 * dada, `selected` o índice da opção escolhida e `correct` o veredito
 * (answerIndex === selected). Estado IMUTÁVEL por contrato (mesmo padrão do
 * TrackLessonUiState): os helpers devolvem um objeto novo a cada update.
 *
 * ONDA1-MAESTRIA: os campos do CICLO abaixo são ADITIVOS e OPCIONAIS de
 * propósito — um estado restaurado do `lessonChatCache` (ou construído por um
 * teste antigo) tem só os três campos originais, e `quizCycleOf` normaliza
 * esse caso legado sem que nenhum chamador precise saber. `answered`/
 * `selected`/`correct` passam a descrever a GERAÇÃO CORRENTE (o card na tela);
 * o histórico completo vive em `attempts`.
 */
export interface QuizState {
  answered: boolean;
  selected: number | null;
  correct: boolean | null;
  /** ONDA1-MAESTRIA: em que ponto do ciclo esta afirmação está. */
  stage?: QuizCycleStage;
  /** ONDA1-MAESTRIA: geração corrente (0 = quiz autoral; N = N-ésimo remediador). */
  generation?: number;
  /** ONDA1-MAESTRIA: TODAS as tentativas, em ordem cronológica. */
  attempts?: readonly QuizAttempt[];
  /** ONDA1-MAESTRIA: markdown da última explicação diagnóstica registrada. */
  explanation?: string | null;
  /** ONDA1-MAESTRIA: o quiz remediador da geração corrente (null = o autoral). */
  remediation?: TrackAssertionDto | null;
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
 *
 * ONDA1-MAESTRIA: a bolha 'quiz-explanation' entra na MESMA velocidade da
 * teoria (7 tps = 28 chars/s). O critério é o do bloco TYPEWRITER_TPS acima —
 * a velocidade é de LEITURA, e a explicação do erro é exatamente texto que o
 * aluno precisa LER (não é a resposta que ele pediu e já espera na tela).
 */
export function chatBubbleTps(history: readonly TutorChatMessage[], i: number): number {
  if (history[i]?.kind === 'review') return TYPEWRITER_TPS.review;
  if (history[i]?.kind === 'quiz-explanation') return TYPEWRITER_TPS.theory;
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
 *                    apresentada) NÃO DOMINADO. Vem PRIMEIRO porque é o
 *                    desbloqueio mais barato: o card está na tela, a um
 *                    clique de distância;
 *   - 'challenges' → algum desafio da aula não passou (regra ONDA2-imessage,
 *                    intacta);
 *   - null         → liberado.
 *
 * ONDA1-MAESTRIA — O QUE MUDOU: até a onda 10 o gate lia `answered` e NUNCA
 * `correct`, então errar liberava igual a acertar. Agora ele lê MAESTRIA
 * (`isQuizMastered` — houve acerto): errar mantém o bloqueio e abre o ciclo de
 * remediação (explicação + quiz novo), porque a aula só avança depois que o
 * aluno prova que entendeu. O bloqueio NÃO é punição (§8 item 3): é a
 * informação de que aquele trecho ainda não foi demonstrado — a UI diz qual é
 * o próximo passo, e o ciclo o entrega. PURA.
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

// ─── ONDA4 (quiz) → ONDA1-MAESTRIA: o quiz com CICLO DE REMEDIAÇÃO ──────────
//
// Contrato (REPLAN A1): cada assertion do payload TrackLessonPayload carrega
// `sectionId` (a seção de teoria que a demonstra). O quiz de uma assertion
// renderiza APÓS a bolha da seção cujo id == sectionId ser apresentada
// ('next') e é VISÍVEL só quando `presentedSections` contém o sectionId.
// ONDA10: o quiz virou GATE (ver `pendingQuizzes` no fim do arquivo).
// ONDA1-MAESTRIA: o gate passou a exigir ACERTO, e o erro abre o ciclo
// erro → explicação no chat → quiz novo → … → acerto (ver o cabeçalho do
// arquivo). Assertion sem sectionId (trilhas antigas, defensivo) cai na chave
// sintética `FALLBACK_QUIZ_SECTION` e aparece APÓS a ÚLTIMA seção de teoria
// apresentada (fallback determinístico). Os helpers abaixo são PUROS
// (node:test, sem React/DOM/i18n).

/** Chave sintética das assertions SEM sectionId (nunca colide com um id real
 *  de seção — slugs de arquivo). O quiz delas ancora na última seção
 *  apresentada. */
export const FALLBACK_QUIZ_SECTION = '__quiz_fallback__';

/**
 * Separador da chave composta `sectionId::assertionId` (ver `quizKeyFor`).
 * `::` nunca ocorre em slug de arquivo (o formato de todo id de seção e de
 * assertion desta base), então a concatenação é injetiva.
 */
export const QUIZ_KEY_SEPARATOR = '::';

/** Sufixo `#g<N>` que marca a id de um quiz REMEDIADOR (ver
 *  `remediationAssertionId`). `#` não ocorre em slug autoral. */
const REMEDIATION_ID_RE = /^(.+)#g(\d+)$/;

/**
 * Id DETERMINÍSTICA do quiz remediador da geração `generation` da chave
 * `key` — `<chave>#g<N>`. Duas razões para ela ser derivada, e não a que a
 * LLM inventar: (a) `key` da React fica estável e única por geração;
 * (b) `quizKeyFor` consegue voltar da assertion remediadora para a chave do
 * estado (o sufixo é reversível), então nenhum chamador precisa carregar a
 * chave por fora. PURA.
 */
export function remediationAssertionId(key: string, generation: number): string {
  return `${key}#g${generation}`;
}

/** Leitura NORMALIZADA do ciclo de uma chave — o formato que todo helper usa
 *  internamente (e que a view pode ler direto). */
export interface QuizCycle {
  stage: QuizCycleStage;
  /** geração corrente (0 = o quiz autoral). */
  generation: number;
  /** todas as tentativas, em ordem cronológica. */
  attempts: readonly QuizAttempt[];
  /** markdown da última explicação diagnóstica registrada (null = nenhuma). */
  explanation: string | null;
  /** quiz remediador da geração corrente (null = ainda é o autoral). */
  remediation: TrackAssertionDto | null;
  /** true SÓ depois de um acerto — a única condição que libera o gate. */
  mastered: boolean;
  /** true quando a geração CORRENTE já recebeu resposta. */
  answeredThisGeneration: boolean;
}

const NO_ATTEMPTS: readonly QuizAttempt[] = Object.freeze([]);

const FRESH_CYCLE: QuizCycle = Object.freeze({
  stage: 'aguardando-resposta' as QuizCycleStage,
  generation: 0,
  attempts: NO_ATTEMPTS,
  explanation: null,
  remediation: null,
  mastered: false,
  answeredThisGeneration: false,
});

/**
 * Normaliza um `QuizState` (inclusive o LEGADO, sem os campos do ciclo) para
 * o `QuizCycle` completo. Existe porque os campos novos são opcionais: um
 * estado restaurado do `lessonChatCache` — ou um literal de teste da era
 * "responder basta" — traz só `answered/selected/correct`, e todo o resto do
 * módulo precisa enxergar o mesmo formato.
 *
 * INFERÊNCIA DO LEGADO (documentada porque é uma decisão, não um detalhe):
 *   - sem resposta            → 'aguardando-resposta';
 *   - respondido e CORRETO    → 'dominado' (o acerto antigo vale como maestria
 *                               — nada a refazer);
 *   - respondido e ERRADO     → 'explicando' (o ciclo REABRE: sob a regra
 *                               nova aquele erro nunca foi resolvido, e o
 *                               aluno recebe a explicação + o quiz novo).
 * PURA.
 */
export function quizCycleOf(quiz: QuizState | undefined): QuizCycle {
  if (quiz === undefined) return FRESH_CYCLE;
  const generation = quiz.generation ?? 0;
  const stage: QuizCycleStage =
    quiz.stage ??
    (quiz.answered !== true
      ? 'aguardando-resposta'
      : quiz.correct === true
        ? 'dominado'
        : 'explicando');
  const attempts: readonly QuizAttempt[] =
    quiz.attempts ??
    (quiz.answered === true && quiz.selected !== null
      ? [{ generation, selected: quiz.selected, correct: quiz.correct === true, ts: 0 }]
      : NO_ATTEMPTS);
  return {
    stage,
    generation,
    attempts,
    explanation: quiz.explanation ?? null,
    remediation: quiz.remediation ?? null,
    mastered: stage === 'dominado',
    answeredThisGeneration: quiz.answered === true,
  };
}

/** O ciclo da chave `key` no estado (chave nunca respondida → ciclo zerado). PURA. */
export function quizCycleFor(state: TrackLessonUiState, key: string): QuizCycle {
  return quizCycleOf(state.quizBySection[key]);
}

/**
 * Registra a resposta do quiz da chave. ONDA1-MAESTRIA — deixou de ser
 * cegamente idempotente:
 *
 *   - ACERTO  → a chave FECHA ('dominado'). Imutável dali em diante: qualquer
 *     submissão posterior é no-op (mesma referência de estado);
 *   - ERRO    → NÃO fecha. Grava a tentativa e ABRE o ciclo de remediação
 *     ('explicando'). O gate continua bloqueado — o próximo passo é a
 *     explicação diagnóstica (`registerQuizExplanation`) e o quiz novo
 *     (`injectRemediationQuiz`), não a punição;
 *   - PROTEÇÃO ANTI-DUPLA-SUBMISSÃO PRESERVADA: uma segunda resposta na MESMA
 *     geração é no-op (dois cliques no card, StrictMode, evento repetido). Só
 *     uma geração NOVA aceita resposta nova.
 *
 * `now` é injetável (default Date.now()) como no resto do módulo. PURA.
 */
export function submitQuizAnswer(
  state: TrackLessonUiState,
  sectionId: string,
  answerIndex: number,
  correctIndex: number,
  now: number = Date.now(),
): TrackLessonUiState {
  const cycle = quizCycleFor(state, sectionId);
  // Acerto anterior fecha a chave para sempre; dupla submissão da MESMA
  // geração é o clique repetido — os dois são no-op por referência.
  if (cycle.mastered || cycle.answeredThisGeneration) return state;
  const correct = answerIndex === correctIndex;
  const attempt: QuizAttempt = {
    generation: cycle.generation,
    selected: answerIndex,
    correct,
    ts: now,
  };
  return {
    ...state,
    quizBySection: {
      ...state.quizBySection,
      [sectionId]: {
        answered: true,
        selected: answerIndex,
        correct,
        stage: correct ? 'dominado' : 'explicando',
        generation: cycle.generation,
        attempts: [...cycle.attempts, attempt],
        explanation: cycle.explanation,
        remediation: cycle.remediation,
      },
    },
  };
}

/** Estado do quiz da chave (undefined = ainda não respondido). PURA. */
export function quizForSection(state: TrackLessonUiState, sectionId: string): QuizState | undefined {
  return state.quizBySection[sectionId];
}

/**
 * true quando a GERAÇÃO CORRENTE do quiz já foi respondida (certo OU errado).
 * ATENÇÃO — não é mais o predicado do GATE: desde a ONDA1-MAESTRIA quem
 * libera é `isQuizMastered`. Este continua existindo porque é o que o card
 * precisa saber para mostrar o feedback da resposta atual. PURA.
 */
export function isQuizAnswered(state: TrackLessonUiState, sectionId: string): boolean {
  return state.quizBySection[sectionId]?.answered === true;
}

/**
 * ONDA1-MAESTRIA: true quando o aluno ACERTOU aquela afirmação — o predicado
 * do gate, e o único que libera "Próximo"/"Concluir aula". PURA.
 */
export function isQuizMastered(state: TrackLessonUiState, key: string): boolean {
  return quizCycleFor(state, key).mastered;
}

/** Tentativas registradas na chave, em ordem cronológica. PURA. */
export function quizAttempts(state: TrackLessonUiState, key: string): readonly QuizAttempt[] {
  return quizCycleFor(state, key).attempts;
}

/** Geração corrente do quiz da chave (0 = o quiz autoral). PURA. */
export function quizGeneration(state: TrackLessonUiState, key: string): number {
  return quizCycleFor(state, key).generation;
}

/** Markdown da última explicação diagnóstica registrada (null = nenhuma). PURA. */
export function quizExplanation(state: TrackLessonUiState, key: string): string | null {
  return quizCycleFor(state, key).explanation;
}

/** Quiz remediador da geração corrente (null = ainda é o autoral). PURA. */
export function remediationQuizFor(
  state: TrackLessonUiState,
  key: string,
): TrackAssertionDto | null {
  return quizCycleFor(state, key).remediation;
}

/** A tentativa registrada NAQUELA geração (undefined = geração sem resposta). PURA. */
export function attemptForGeneration(
  quiz: QuizState | undefined,
  generation: number,
): QuizAttempt | undefined {
  return quizCycleOf(quiz).attempts.find((a) => a.generation === generation);
}

// ─── ONDA1-MAESTRIA: a explicação diagnóstica vira BOLHA do chat ────────────

/**
 * Rótulos da bolha da explicação (o módulo é PURO — sem i18n; a view injeta as
 * traduções correntes, como já faz com `ErrorBubbleLabels`). O default é a
 * redação pt-BR, no tom de `docs/ux-redesign.md` §8 item 3 / §8.2:
 * DIAGNÓSTICA e informacional — descreve onde a alternativa se separa do que a
 * seção mostra. Nada de "errado", "que pena", "tente de novo": nem punição,
 * nem elogio ritualizado (d = −0,40), nem prescrição de comportamento.
 */
export interface QuizExplanationLabels {
  /** Título da bolha (chave sugerida `lesson.quizExplanationTitle`). */
  title: string;
  /** Rótulo da alternativa que o aluno marcou. */
  chosen: string;
}

const DEFAULT_QUIZ_EXPLANATION_LABELS: QuizExplanationLabels = {
  title: 'Onde essa alternativa se separa do que a seção mostra',
  chosen: 'Alternativa marcada',
};

/** Entrada de `formatQuizExplanationBubble` — o que a view/serviço já tem em
 *  mãos no momento do erro. */
export interface QuizExplanationInput {
  /** A pergunta do quiz que foi respondida. */
  question: string;
  /** O TEXTO da alternativa marcada (não o índice — a bolha é para ler). */
  chosenOption: string;
  /** A explicação da IA: por que aquela alternativa não se sustenta. */
  explanation: string;
  /** Trecho de código citado (opcional) — vai em code block. */
  codeExcerpt?: string | null;
  /** Linguagem do code block (default: sem linguagem). */
  codeLanguage?: string;
}

/**
 * Markdown DETERMINÍSTICO da bolha da explicação — UMA mensagem do histórico,
 * mesmo padrão de `formatErrorBubble`. O code block usa `fenceFor` pelo MESMO
 * motivo de lá: o trecho citado é conteúdo de autoria não controlada (LLM +
 * código do aluno) e pode conter runs de 3+ backticks, que quebrariam um fence
 * fixo. PURA.
 */
export function formatQuizExplanationBubble(
  input: QuizExplanationInput,
  labels: Partial<QuizExplanationLabels> = {},
): string {
  const l: QuizExplanationLabels = { ...DEFAULT_QUIZ_EXPLANATION_LABELS, ...labels };
  const parts = [`## ${l.title}`, `**${input.question}**`, `${l.chosen}: ${input.chosenOption}`, input.explanation];
  const excerpt = input.codeExcerpt?.trim();
  if (excerpt) {
    const fence = fenceFor(excerpt);
    parts.push(`${fence}${input.codeLanguage ?? ''}\n${excerpt}\n${fence}`);
  }
  return parts.join('\n\n');
}

/**
 * Registra a explicação do erro: ela vira BOLHA do chat (kind
 * 'quiz-explanation' — ver o comentário do campo `kind`: um kind próprio é o
 * que impede a explicação de ser contada como apresentação de seção e
 * deslocar a âncora de todos os quizzes seguintes) e o ciclo avança para
 * 'novo-quiz-pendente'.
 *
 * NO-OP fora do estado 'explicando' (chave dominada, ainda sem resposta, ou
 * explicação já registrada) — o guard que torna a chamada segura sob
 * StrictMode/reentrada. `now` injetável. PURA.
 */
export function registerQuizExplanation(
  state: TrackLessonUiState,
  key: string,
  input: QuizExplanationInput,
  labels: Partial<QuizExplanationLabels> = {},
  now: number = Date.now(),
): TrackLessonUiState {
  const cycle = quizCycleFor(state, key);
  if (cycle.stage !== 'explicando') return state;
  const current = state.quizBySection[key];
  if (current === undefined) return state;
  const content = formatQuizExplanationBubble(input, labels);
  return {
    ...state,
    history: [
      ...state.history,
      { role: 'assistant' as const, content, ts: now, kind: 'quiz-explanation' as const },
    ],
    quizBySection: {
      ...state.quizBySection,
      [key]: { ...current, stage: 'novo-quiz-pendente', explanation: content },
    },
  };
}

/**
 * Injeta o quiz REMEDIADOR sobre o mesmo conteúdo: geração N+1, card zerado
 * (answered=false — o aluno responde do zero) e ciclo de volta a
 * 'aguardando-resposta'. As tentativas anteriores PERMANECEM (`attempts`), e é
 * por isso que o card da geração antiga continua mostrando o próprio feedback
 * na conversa (`optionVisualStateForGeneration`).
 *
 * A id da assertion guardada é REESCRITA para `remediationAssertionId(key, N+1)`
 * — determinística, única e reversível por `quizKeyFor` (a LLM não escolhe a
 * identidade do estado).
 *
 * NO-OP quando a chave já está dominada ou quando o ciclo ainda não pediu quiz
 * novo (estados 'aguardando-resposta'/'dominado'). Aceita tanto
 * 'novo-quiz-pendente' (o caminho normal) quanto 'explicando' (o caminho de
 * degradação: a explicação não pôde ser gerada e o ciclo segue mesmo assim —
 * travar o aluno seria pior). PURA.
 */
export function injectRemediationQuiz(
  state: TrackLessonUiState,
  key: string,
  assertion: TrackAssertionDto,
): TrackLessonUiState {
  const cycle = quizCycleFor(state, key);
  if (cycle.stage !== 'novo-quiz-pendente' && cycle.stage !== 'explicando') return state;
  const generation = cycle.generation + 1;
  return {
    ...state,
    quizBySection: {
      ...state.quizBySection,
      [key]: {
        answered: false,
        selected: null,
        correct: null,
        stage: 'aguardando-resposta',
        generation,
        attempts: cycle.attempts,
        explanation: cycle.explanation,
        remediation: { ...assertion, id: remediationAssertionId(key, generation) },
      },
    },
  };
}

// ─── ONDA4-SAÍDA-DO-CICLO: o ciclo travado porque a IA está FORA ────────────
//
// O DEFEITO, medido pela cobertura e2e desta base (tests/e2e/e2e-quiz.spec.ts,
// teste 5, que o afirmava como comportamento OBSERVADO e não como aprovação):
// com `E2E_QUIZ_AI=off`, ERRAR deixa a afirmação em 'explicando' /
// 'novo-quiz-pendente' PARA SEMPRE. Sem quiz remediador não há o que
// responder, e o gate de maestria só abre com ACERTO — o "Próximo" fica
// desabilitado sem saída nenhuma. É a consequência de DUAS decisões corretas
// que se combinam mal: o gate ("só vamos para o desafio depois que o aluno
// provar que entendeu", pedido explícito do dono) e o FAIL-CLOSED da IA
// (nunca inventar explicação nem quiz).
//
// A SAÍDA: quando o ciclo não consegue avançar porque a IA está fora, o aluno
// REABRE a pergunta que já está na tela para uma tentativa NOVA. Ela NÃO
// dispensa o gate — continua sendo preciso ACERTAR; ela só devolve a chance de
// responder o que já está ali, em vez de esperar por um quiz novo que não vai
// chegar.
//
// POR QUE A REABERTURA É `injectRemediationQuiz` COM A MESMA PERGUNTA, e não
// um "zerar o card" (nem o `resetQuiz`, que apaga a chave inteira). Três
// propriedades que a implementação PRECISA ter, e a geração N+1 é o que dá as
// três de uma vez:
//
//   1. O INVARIANTE SAGRADO. Reabrir a MESMA geração deixaria a tentativa dela
//      registrada, e `optionVisualStateForGeneration` ACHARIA essa tentativa —
//      pintando a alternativa certa de verde ANTES do clique. A resposta
//      vazaria exatamente pela porta que a ONDA10 fechou. Subindo a geração,
//      `attemptForGeneration(quiz, N+1)` é `undefined`, as duas funções de
//      decisão visual retornam CEDO no neutro e `answerIndex` NEM É LIDO.
//   2. A PROTEÇÃO ANTI-DUPLA-SUBMISSÃO de `submitQuizAnswer` é POR GERAÇÃO
//      (`answeredThisGeneration`). Uma geração NOVA aceita resposta nova sem
//      que a proteção precise ser afrouxada em nada — reabrir CONVIVE com ela
//      em vez de contorná-la.
//   3. A CONTAGEM HONESTA. `attempts` é PRESERVADO, e a id da geração nova é
//      `remediationAssertionId(key, N+1)` — a MESMA convenção `<chave>#g<N>`
//      que `recurrenceOf` (electron/main/services/quizRemediation.ts) lê para
//      dizer "esta é a Nª vez seguida" (ERR-4). Reabrir NÃO apaga o rastro do
//      erro: a tentativa nova conta no histórico (`track.quizAttempt` grava a
//      id da geração) e conta na recorrência que a explicação seguinte usa.
//
// `channelFailed` é PARÂMETRO, não campo do estado: o ciclo não pode ficar
// sabendo de rede (a MESMA disciplina de `overlayStatusFor`, que recebe a
// falha do canal por argumento). E ele é OBRIGATÓRIO justamente para que isto
// não vire um botão de "pular o quiz" sempre disponível, o que esvaziaria o
// gate: com o canal de pé, a transição é no-op por referência.

/**
 * true quando a REABERTURA está disponível: o canal caiu E o ciclo está
 * TRAVADO esperando algo que a IA deveria entregar —
 *
 *   - 'explicando'           → a explicação não veio (e o quiz novo, que o
 *                              caminho de degradação pediria em seguida,
 *                              também não);
 *   - 'novo-quiz-pendente'   → a explicação entrou, o quiz novo não veio.
 *
 * FALSO em 'aguardando-resposta' (não há nada a reabrir: a pergunta já está
 * clicável) e em 'dominado' (a chave FECHOU — reabrir uma afirmação já
 * demonstrada seria refazer trabalho provado). PURA.
 */
export function canReopenStalledQuiz(
  quiz: QuizState | undefined,
  channelFailed: boolean,
): boolean {
  if (channelFailed !== true) return false;
  const stage = quizCycleOf(quiz).stage;
  return stage === 'explicando' || stage === 'novo-quiz-pendente';
}

/**
 * REABRE a pergunta corrente para uma tentativa nova quando o ciclo travou por
 * indisponibilidade da IA (ver o bloco acima). `assertion` é a afirmação da
 * geração CORRENTE — a mesma que o aluno está vendo (`visibleQuizFor(...)
 * .assertion`): a reabertura repete a pergunta, não inventa outra.
 *
 * Delega a `injectRemediationQuiz` de propósito: é a MESMA transição de
 * geração (N+1, card zerado, `attempts`/`explanation` preservados, id
 * determinística), e reimplementá-la aqui abriria a chance de as duas
 * divergirem. O que esta função acrescenta é a GUARDA: sem `channelFailed`,
 * no-op por referência.
 *
 * O GATE CONTINUA DE PÉ: o estado resultante é 'aguardando-resposta', nunca
 * 'dominado' — nenhum caminho daqui leva ao desafio sem acerto.
 *
 * LIMITAÇÃO DECLARADA (CONTRIBUTING.md: "limitação conhecida é melhor que
 * escondida"). A geração REABERTA não grava linha em `quiz_remediations`: esse
 * canal (`track:quiz-remedial`) é o que CHAMA a IA, e chamá-lo aqui seria
 * pedir de novo exatamente o que acabou de falhar. Consequência, traçada e
 * medida em `tests/quizStalledExit.test.ts`: se o app FECHAR no meio,
 * `hydrateQuizFromHistory` reconstrói a chave só a partir das tentativas —
 * a geração e o histórico voltam certos, e a assertion volta a ser a AUTORAL
 * (que é a MESMA pergunta que a reabertura repetia, então o aluno não vê
 * diferença). Nada de maestria inventada e nada de tentativa perdida; o que se
 * perde é uma reabertura ainda NÃO respondida, e nesse caso o ciclo volta ao
 * estado travado — onde a reabertura é oferecida de novo. PURA.
 */
export function reopenStalledQuiz(
  state: TrackLessonUiState,
  key: string,
  assertion: TrackAssertionDto,
  channelFailed: boolean,
): TrackLessonUiState {
  if (!canReopenStalledQuiz(state.quizBySection[key], channelFailed)) return state;
  return injectRemediationQuiz(state, key, assertion);
}

// ─── ONDA3-PERSISTÊNCIA: o ciclo do quiz VOLTA depois de o app FECHAR ───────
//
// O DEFEITO QUE ISTO MATA, medido e declarado pela onda anterior: o ciclo
// inteiro funcionava e era GRAVADO (`quiz_attempts` / `quiz_remediations`,
// migração v5, mais os quatro canais de `track:quiz-*`), mas ninguém LIA de
// volta — `track:quiz-history` nunca era chamado. A maestria sobrevivia à
// troca de aba (o `lessonChatCache` é um Map em memória de módulo) e MORRIA no
// fechamento do app: o aluno que dominou três quizzes reabria a aula com tudo
// por responder, e o gate de maestria o travava de novo em algo que ele já
// tinha provado.
//
// A reconstrução é PURA e mora aqui (o módulo não sabe o que é React nem IPC):
// a view busca o histórico no canal e entrega as DUAS listas do contrato a
// `hydrateQuizFromHistory`, que devolve o estado com `quizBySection`
// reconstruído.

/**
 * A GERAÇÃO a que uma tentativa pertence, lida da id da afirmação respondida.
 *
 * O banco NÃO guarda a geração da tentativa — guarda a `assertion_id`, e ela
 * BASTA porque a id do quiz remediador é determinística e REVERSÍVEL
 * (`remediationAssertionId` escreve `<chave>#g<N>`): sem o sufixo, a tentativa
 * é do quiz AUTORAL (geração 0); com ele, a geração é o N. É a mesma ida e
 * volta que `quizKeyFor` já faz para devolver a chave original a partir da
 * assertion remediadora. PURA.
 */
function generationOfAttempt(assertionId: string): number {
  if (typeof assertionId !== 'string') return 0;
  const match = REMEDIATION_ID_RE.exec(assertionId);
  if (match === null) return 0;
  const generation = Number(match[2]);
  return Number.isSafeInteger(generation) && generation > 0 ? generation : 0;
}

/**
 * ISO-8601 do banco → o `ts` (Date.now()-like) do estado. Data ilegível vira
 * 0, que é EXATAMENTE o valor que `quizCycleOf` já usa ao normalizar uma
 * tentativa legada: o `ts` é informativo e nenhuma decisão do ciclo depende
 * dele (a ordem cronológica vem da ordem da lista, que o canal já entrega
 * ordenada por `created_at`).
 */
function attemptTimestamp(createdAt: string): number {
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : 0;
}

/** Explicação REALMENTE lida pelo aluno (o caminho de degradação grava ''; e
 *  '' é tão "sem explicação" quanto ausente). */
function explanationTextOf(row: QuizRemediationDto | undefined): string | null {
  const texto = row?.explanation;
  return typeof texto === 'string' && texto.trim() !== '' ? texto : null;
}

/**
 * Reconstrói o `QuizState` de UMA chave a partir do que o banco guardou.
 * `attempts` NUNCA é vazio aqui (a chave nasce das tentativas) e vem em ordem
 * cronológica; `byGeneration` indexa as remediações daquela chave pela geração
 * do quiz que cada uma produziu.
 *
 * As quatro leituras, e por que cada uma é o que é:
 *
 *   - HOUVE ACERTO → 'dominado', na GERAÇÃO em que o acerto aconteceu. A chave
 *     fecha, imutável, como `submitQuizAnswer` a fecharia — e o gate abre. É
 *     o único caminho que devolve maestria: `mastered` é "houve ≥1 acerto";
 *   - SEM ACERTO, com a remediação da geração SEGUINTE já persistida (com
 *     quiz legível) → o ciclo já tinha AVANÇADO antes de o app fechar: o card
 *     volta ZERADO naquela geração ('aguardando-resposta'), que é o estado
 *     que `injectRemediationQuiz` deixa. O aluno continua de onde parou, sem
 *     pagar de novo pela explicação nem por uma geração de quiz;
 *   - SEM ACERTO, com a linha da geração seguinte presente mas o `quiz`
 *     ILEGÍVEL (`quiz: null` é o parse DEFENSIVO da repo — um registro
 *     corrompido não derruba o histórico inteiro) → a explicação JÁ foi lida,
 *     então o passo que falta é só o quiz novo: 'novo-quiz-pendente';
 *   - SEM ACERTO e sem remediação nenhuma depois do erro → aquele erro NUNCA
 *     foi resolvido: o ciclo REABRE em 'explicando' e a view pede a
 *     explicação e o quiz novo. É a mesma disciplina do legado em
 *     `quizCycleOf` ("respondido e errado → 'explicando'"), e o motivo é o
 *     mesmo: sob a regra de maestria, um erro pendurado não vira 'dominado'
 *     por decurso de prazo.
 * PURA.
 */
function cycleFromHistory(
  key: string,
  attempts: readonly QuizAttempt[],
  byGeneration: ReadonlyMap<number, QuizRemediationDto> | undefined,
): QuizState {
  const explanationAt = (generation: number): string | null =>
    generation === 0 ? null : explanationTextOf(byGeneration?.get(generation));
  const remediationAt = (generation: number): TrackAssertionDto | null => {
    const quiz = generation === 0 ? null : (byGeneration?.get(generation)?.quiz ?? null);
    // A id volta a ser a do ESTADO (`<chave>#g<N>`): a linha do banco guarda a
    // que o serviço gerou, e no fluxo vivo é `injectRemediationQuiz` quem a
    // reescreve. Reescrever aqui também é o que mantém `quizKeyFor` reversível
    // para esta chave depois da restauração — sem isso, responder um quiz
    // remediador restaurado abriria uma chave NOVA em vez de fechar a antiga.
    return quiz === null ? null : { ...quiz, id: remediationAssertionId(key, generation) };
  };

  const won = attempts.find((a) => a.correct);
  if (won !== undefined) {
    return {
      answered: true,
      selected: won.selected,
      correct: true,
      stage: 'dominado',
      generation: won.generation,
      attempts,
      explanation: explanationAt(won.generation),
      remediation: remediationAt(won.generation),
    };
  }

  const last = attempts[attempts.length - 1];
  const next = byGeneration?.get(last.generation + 1);
  if (next !== undefined && next.quiz !== null && next.quiz !== undefined) {
    const generation = last.generation + 1;
    return {
      answered: false,
      selected: null,
      correct: null,
      stage: 'aguardando-resposta',
      generation,
      attempts,
      explanation: explanationAt(generation),
      remediation: remediationAt(generation),
    };
  }
  return {
    answered: true,
    selected: last.selected,
    correct: false,
    stage: next === undefined ? 'explicando' : 'novo-quiz-pendente',
    generation: last.generation,
    attempts,
    explanation:
      next === undefined
        ? explanationAt(last.generation)
        : (explanationTextOf(next) ?? explanationAt(last.generation)),
    remediation: remediationAt(last.generation),
  };
}

/**
 * O REDUTOR DA PERSISTÊNCIA: o `quizBySection` reconstruído a partir do que
 * `track:quiz-history` devolveu (tentativas + remediações desta aula).
 *
 * A CHAVE é a canônica de `quizKeyFor` (`sectionId::assertionId`) — e ela não
 * é recalculada aqui: o `sectionKey` que a view GRAVA no banco já É essa
 * chave (a view registra `sectionKey: visible.key`, e `visible.key` sai de
 * `quizKeyFor`). Ler `sectionKey` como chave é, portanto, ler de volta o que
 * foi escrito, e não uma segunda implementação da mesma regra. A geração, essa
 * sim, é derivada — pela ida e volta `remediationAssertionId`/`quizKeyFor`
 * descrita em `generationOfAttempt`.
 *
 * AS TENTATIVAS SÃO A ORIGEM DA CHAVE: uma seção SEM tentativa não aparece no
 * resultado (a ausência é a resposta — a mesma regra da maestria que o banco
 * calcula). Em particular, uma remediação ÓRFÃ (a gravação da tentativa falhou
 * e a do par explicação+quiz não — os dois canais falham de forma
 * independente) é IGNORADA: reabrir a aula no meio de um ciclo cuja tentativa
 * o histórico não contém mostraria ao aluno um quiz remediador por um erro que
 * o registro não tem. Restaurar o quiz autoral é honesto e custa uma resposta.
 *
 * PRECEDÊNCIA — o estado DESTA SESSÃO vence, chave a chave, e o banco só
 * PREENCHE as chaves que a sessão não tem. O motivo é de ordem causal: toda
 * resposta desta sessão foi escrita PRIMEIRO no estado (`submitQuizAnswer`) e
 * só depois no banco (`track:quiz-attempt`, best-effort — a falha dele acende
 * um aviso e NÃO desfaz a resposta). Para uma chave que a sessão já tocou, o
 * banco só pode estar ATRASADO, nunca adiantado; sobrescrever apagaria uma
 * resposta cuja gravação falhou, reabriria uma chave já dominada e jogaria
 * fora um ciclo em voo. Para uma chave que a sessão nunca tocou, o banco é a
 * ÚNICA fonte que existe. Daí a união com a sessão vencendo o empate.
 *
 * FAIL-CLOSED por construção: este redutor não INVENTA maestria — 'dominado'
 * só sai de uma tentativa com `correct` verdadeiro gravada no banco. E o
 * INVARIANTE SAGRADO continua de pé: nenhuma linha daqui lê
 * `assertion.answerIndex` (o veredito vem do banco, que o recebeu de quem
 * tinha a afirmação em mãos no momento da resposta).
 *
 * Nada além de `quizBySection` é tocado: o `history` do chat NÃO recebe de
 * volta as bolhas de explicação lidas em sessões passadas. A conversa é
 * artefato de SESSÃO (a teoria é reapresentada da seção 1 a cada abertura), e
 * enfileirar explicações antigas no topo de um histórico vazio mostraria a
 * discussão de um erro antes de a pergunta ter sido feita. O texto não se
 * perde: ele volta em `QuizState.explanation`, que é de onde o ciclo o lê.
 *
 * Devolve o MESMO objeto de estado quando não há nada a acrescentar (a
 * disciplina de referência do módulo — nenhum re-render à toa). PURA.
 */
export function hydrateQuizFromHistory(
  state: TrackLessonUiState,
  attempts: readonly QuizAttemptDto[],
  remediations: readonly QuizRemediationDto[],
): TrackLessonUiState {
  // Índice das remediações por chave e por geração. A linha MAIS NOVA de uma
  // mesma (chave, geração) vence: a lista chega em ordem cronológica e uma
  // segunda geração do mesmo quiz (o canal falhou, o aluno pediu de novo)
  // grava uma linha nova em vez de atualizar a antiga.
  const remediationsByKey = new Map<string, Map<number, QuizRemediationDto>>();
  for (const row of remediations) {
    if (row === null || typeof row !== 'object') continue;
    if (typeof row.sectionKey !== 'string' || row.sectionKey === '') continue;
    if (!Number.isSafeInteger(row.generation) || row.generation < 1) continue;
    const byGeneration = remediationsByKey.get(row.sectionKey) ?? new Map<number, QuizRemediationDto>();
    byGeneration.set(row.generation, row);
    remediationsByKey.set(row.sectionKey, byGeneration);
  }

  const attemptsByKey = new Map<string, QuizAttempt[]>();
  for (const row of attempts) {
    if (row === null || typeof row !== 'object') continue;
    if (typeof row.sectionKey !== 'string' || row.sectionKey === '') continue;
    if (typeof row.assertionId !== 'string' || row.assertionId === '') continue;
    // Índice negativo é linha CORROMPIDA: o handler de `track:quiz-attempt`
    // recusa `selectedIndex < 0` na gravação, então ela não pode ter nascido
    // do fluxo normal. Descartar a linha custa uma resposta ao aluno;
    // restaurá-la marcaria uma alternativa que não existe.
    if (!Number.isInteger(row.selectedIndex) || row.selectedIndex < 0) continue;
    const list = attemptsByKey.get(row.sectionKey) ?? [];
    list.push({
      generation: generationOfAttempt(row.assertionId),
      selected: row.selectedIndex,
      correct: row.correct === true,
      ts: attemptTimestamp(row.createdAt),
    });
    attemptsByKey.set(row.sectionKey, list);
  }
  if (attemptsByKey.size === 0) return state;

  let quizBySection: Record<string, QuizState> | null = null;
  for (const [key, list] of attemptsByKey) {
    // A SESSÃO VENCE (ver o bloco de PRECEDÊNCIA acima).
    if (state.quizBySection[key] !== undefined) continue;
    quizBySection ??= { ...state.quizBySection };
    quizBySection[key] = cycleFromHistory(key, list, remediationsByKey.get(key));
  }
  return quizBySection === null ? state : { ...state, quizBySection };
}

/**
 * O PRÓXIMO PASSO do ciclo — o que a view/serviço deve fazer agora. É a
 * tradução do `stage` para uma instrução, para que nenhum chamador precise
 * reimplementar o switch (e para que o passo seja testável sem React):
 *
 *   - 'aguardar-resposta' → o card está na tela esperando o clique;
 *   - 'explicar-erro'     → pedir à IA a explicação da alternativa `selected`
 *                           e registrá-la com `registerQuizExplanation`;
 *   - 'gerar-novo-quiz'   → pedir o quiz remediador e injetá-lo com
 *                           `injectRemediationQuiz`;
 *   - 'dominado'          → nada a fazer; o gate está liberado para esta chave.
 * PURA.
 */
export type QuizCycleStep =
  | { kind: 'aguardar-resposta'; generation: number }
  | { kind: 'explicar-erro'; generation: number; selected: number }
  | { kind: 'gerar-novo-quiz'; generation: number }
  | { kind: 'dominado'; generation: number };

export function quizStepOf(quiz: QuizState | undefined): QuizCycleStep {
  const cycle = quizCycleOf(quiz);
  switch (cycle.stage) {
    case 'dominado':
      return { kind: 'dominado', generation: cycle.generation };
    case 'explicando': {
      const last = cycle.attempts[cycle.attempts.length - 1];
      return {
        kind: 'explicar-erro',
        generation: cycle.generation,
        selected: last?.selected ?? -1,
      };
    }
    case 'novo-quiz-pendente':
      return { kind: 'gerar-novo-quiz', generation: cycle.generation };
    default:
      return { kind: 'aguardar-resposta', generation: cycle.generation };
  }
}

/** O próximo passo do ciclo da chave `key` no estado. PURA. */
export function nextQuizStep(state: TrackLessonUiState, key: string): QuizCycleStep {
  return quizStepOf(state.quizBySection[key]);
}

/**
 * O que a UI deve RENDERIZAR para uma assertion autoral: a chave do estado, a
 * assertion da geração corrente (a remediadora, quando existe) e o passo do
 * ciclo. É o ÚNICO ponto de entrada que a view precisa — em particular, a
 * chave sai SEMPRE da assertion AUTORAL (a remediadora vive sob a mesma
 * chave), o que elimina a classe de bug de "responder o remediador cria um
 * quiz novo em vez de fechar o antigo". PURA.
 */
export interface VisibleQuiz {
  key: string;
  assertion: TrackAssertionDto;
  generation: number;
  quiz: QuizState | undefined;
  step: QuizCycleStep;
}

export function visibleQuizFor(
  state: TrackLessonUiState,
  original: TrackAssertionDto,
): VisibleQuiz {
  const key = quizKeyFor(original);
  const quiz = state.quizBySection[key];
  const cycle = quizCycleOf(quiz);
  return {
    key,
    assertion: cycle.remediation ?? original,
    generation: cycle.generation,
    quiz,
    step: quizStepOf(quiz),
  };
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
 * ONDA1-MAESTRIA: o MESMO estado visual, porém de uma GERAÇÃO específica do
 * quiz — o que permite ao card da geração antiga continuar mostrando o próprio
 * feedback depois que o remediador entrou (a geração corrente volta a
 * `answered: false`, e sem isto o erro sumiria da tela).
 *
 * O INVARIANTE SAGRADO DE `optionVisualState` VALE AQUI IGUAL: enquanto NÃO
 * existir tentativa registrada naquela geração, a função RETORNA CEDO o neutro
 * e `assertion.answerIndex` NEM É LIDO. Nenhum caminho — nem para o quiz
 * autoral, nem para o remediador — deixa o índice da resposta influenciar o
 * pixel antes de o aluno responder AQUELA geração.
 */
export function optionVisualStateForGeneration(
  i: number,
  assertion: Pick<TrackAssertionDto, 'answerIndex'>,
  quiz: QuizState | undefined,
  generation: number,
): QuizOptionVisual {
  const attempt = attemptForGeneration(quiz, generation);
  // GERAÇÃO NÃO RESPONDIDA: retorno CEDO, neutro. `answerIndex` não é lido
  // neste caminho — a resposta não pode vazar por construção.
  if (attempt === undefined) return { ...QUIZ_OPTION_NEUTRAL };
  const isCorrectOption = i === assertion.answerIndex;
  const isWrongPick = !attempt.correct && i === attempt.selected;
  return {
    color: isCorrectOption ? 'success' : isWrongPick ? 'error' : 'inherit',
    variant: isCorrectOption ? 'contained' : 'outlined',
    icon: isCorrectOption ? 'correct' : isWrongPick ? 'wrong' : null,
    disabled: true,
  };
}

/**
 * Zera a resposta do quiz da seção (a seção volta a oferecer as opções) —
 * INCLUSIVE o ciclo inteiro (tentativas, explicação e quiz remediador saem
 * junto: a chave some do mapa). Escape hatch, não parte do ciclo: o caminho
 * normal do erro é `registerQuizExplanation` + `injectRemediationQuiz`, que
 * PRESERVAM o histórico de tentativas.
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

// ─── ONDA10 (bug 2) → ONDA1-MAESTRIA: o gate exige ACERTO ───────────────────
// ONDA10, o dono: "o quiz pode ser ignorado e ja vem selecionado; quero que o
// usuario tenha que responder". O quiz virou GATE — mas RESPONDER bastava.
// ONDA1-MAESTRIA, o dono de novo: errar NÃO libera; a IA explica, um quiz novo
// é gerado sobre o mesmo conteúdo, e só o ACERTO abre caminho ("só vamos para
// o desafio depois que o aluno provar que entendeu"). As duas regras de
// PRECEDÊNCIA e VISIBILIDADE ficam intactas:
//
//   - "Próximo"       bloqueia enquanto a seção ATUAL (a última apresentada)
//                     tiver quiz NÃO DOMINADO — `pendingQuizzesForCurrentSection`;
//   - "Concluir aula" bloqueia enquanto QUALQUER quiz já visível estiver NÃO
//                     DOMINADO — `pendingQuizzes` (e 'quiz' vem ANTES de
//                     'challenges' em `lessonFinishBlock`);
//   - VISIBILIDADE: só entram no gate os quizzes ANCORADOS numa bolha já
//     apresentada (`quizzesByMessageIndex`) — um quiz que o aluno ainda não
//     pode ver nunca bloqueia nada;
//   - PROTEÇÃO PRESERVADA: `submitQuizAnswer` continua recusando uma segunda
//     resposta na MESMA geração (dois cliques não viram duas tentativas).

/**
 * Chave do estado do quiz de uma assertion.
 *
 * BUG CONSERTADO (ONDA1-MAESTRIA) — a chave era `sectionId ?? assertion.id`, e
 * DUAS assertions da MESMA seção COLIDIAM: responder uma marcava as duas como
 * respondidas e o gate liberava sem que a segunda tivesse sido vista. Isso não
 * é hipótese: das 20 aulas do módulo M1 real
 * (`resources/tracks/python/modules/a-tela/lessons/<aula>/lesson.json`), pelo
 * menos 4 (a-primeira-linha, dar-nome-a-um-valor, de-texto-para-numero,
 * quando-da-errado) trazem 3 assertions cada, várias na mesma seção. Sob a
 * regra antiga ("responder basta") o efeito era 1 quiz pulado; sob MAESTRIA
 * seria um furo no gate inteiro — o aluno avançaria sem NUNCA responder.
 *
 * A chave nova é `sectionId::assertionId` (única por assertion, e mantém a
 * seção legível na chave — a ancoragem por seção do gate "Próximo" continua
 * vindo de `quizzesByMessageIndex`/`sectionPresentationIndexes`, que leem o
 * `sectionId` da assertion, não a chave). Sem sectionId, a `id` sozinha (já é
 * única por aula).
 *
 * REVERSÍVEL PARA O REMEDIADOR: a id de um quiz remediador é
 * `<chave>#g<N>` (`remediationAssertionId`), então `quizKeyFor` devolve a
 * chave ORIGINAL ao receber a assertion remediadora — o ciclo inteiro de uma
 * afirmação vive numa chave só. PURA.
 */
export function quizKeyFor(assertion: Pick<TrackAssertionDto, 'id' | 'sectionId'>): string {
  const remediation = REMEDIATION_ID_RE.exec(assertion.id);
  if (remediation) return remediation[1];
  return assertion.sectionId === undefined
    ? assertion.id
    : `${assertion.sectionId}${QUIZ_KEY_SEPARATOR}${assertion.id}`;
}

/**
 * Quizzes JÁ VISÍVEIS (ancorados numa bolha apresentada) ainda NÃO DOMINADOS —
 * o gate do "Concluir aula". ONDA1-MAESTRIA: "pendente" passou a significar
 * "sem acerto" (antes: "sem resposta"); um quiz respondido errado continua
 * pendente e o ciclo de remediação é quem o resolve. Ordem determinística:
 * pela ordem das bolhas do histórico e, dentro da bolha, pela ordem das
 * assertions. PURA.
 */
export function pendingQuizzes(
  state: TrackLessonUiState,
  assertions: readonly TrackAssertionDto[],
): TrackAssertionDto[] {
  const byIndex = quizzesByMessageIndex(state, assertions);
  const out: TrackAssertionDto[] = [];
  for (const idx of [...byIndex.keys()].sort((a, b) => a - b)) {
    for (const a of byIndex.get(idx) ?? []) {
      if (!isQuizMastered(state, quizKeyFor(a))) out.push(a);
    }
  }
  return out;
}

/**
 * Quizzes da seção ATUAL (a ÚLTIMA apresentada) ainda NÃO DOMINADOS — o gate
 * do "Próximo". Inclui os quizzes de assertions SEM sectionId, que ancoram
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
  return here.filter((a) => !isQuizMastered(state, quizKeyFor(a)));
}

/**
 * true quando o "Próximo" (avançar a teoria) está bloqueado por quiz não
 * dominado na seção atual. Açúcar sobre `pendingQuizzesForCurrentSection` —
 * o nome é o que a LessonView lê. PURA.
 */
export function isNextSectionBlockedByQuiz(
  state: TrackLessonUiState,
  assertions: readonly TrackAssertionDto[],
): boolean {
  return pendingQuizzesForCurrentSection(state, assertions).length > 0;
}
