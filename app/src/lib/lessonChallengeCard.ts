/**
 * src/lib/lessonChallengeCard.ts — lógica PURA do card do desafio no INÍCIO
 * da aula (onda1-card-desafio-inicial).
 *
 * Pedido do dono, verbatim: "o desafio deve ser mostrado logo no começo da
 * aula, abaixo da inicial, falando o que é o desafio, para o aluno que quiser
 * pular". A aula abre com a bolha `lesson.chatStart` + "Começar aula"; ABAIXO
 * dela entra este card quando a aula tem desafios pendentes, com o botão
 * "Tentar o desafio agora" — o caminho de fuga de quem não quer (ou não
 * precisa) passar pela teoria.
 *
 * PREMISSA DE PRODUTO (exceção ao gate): a regra do dono "só vamos para o
 * desafio depois que o aluno provar que entendeu" vale para o fluxo PÓS-
 * teoria (lessonFinishBlock / challengeOpenBlockedByQuiz — intactos). O card
 * de início é a EXCEÇÃO que o dono pediu explicitamente: quem está na
 * abertura da aula e clica no card vai DIRETO ao desafio, mesmo com quiz da
 * aula pendente — pular a teoria É pular a prova de entendimento, e o gate
 * não pode anular o pedido. O gate do fluxo normal não muda uma linha.
 *
 * Módulo 100% puro e testável sem jsdom (precedente: answerFlow.ts,
 * lessonParse.ts). A LessonView só traduz o resultado.
 */
import type { TrackChallengeSummaryDto } from '../../shared/ipc-contract';

/** Entrada da decisão — o payload `track.lesson` (só o que interessa ao card). */
export interface LessonChallengeCardInput {
  /** Os desafios da aula, como `track.lesson.challenges` os traz. */
  challenges: ReadonlyArray<TrackChallengeSummaryDto>;
}

/**
 * Decisão traduzida pela view: `show` liga/desliga o card; `challenge` é o
 * desafio DESTACADO nele (null quando o card não aparece).
 */
export interface LessonChallengeCardDecision {
  show: boolean;
  challenge: TrackChallengeSummaryDto | null;
}

/**
 * Estado do desafio destacado, para a linha secundária do card (a view mapeia
 * para as chaves i18n que JÁ existem — lesson.challengeUntried /
 * lesson.challengeFailedCount — sem chave nova por estado).
 */
export type LessonChallengeCardStatus = 'untried' | 'failed';

/** Rótulo de status do desafio destacado. PURA. */
export function lessonChallengeCardStatus(
  challenge: TrackChallengeSummaryDto,
): LessonChallengeCardStatus {
  // null = nunca tentou; qualquer veredito que não seja 'passed' (failed/
  // timeout/abandoned) é "tentou e não passou" — o MESMO critério de
  // pendência que handleChallengeStep e challengeBadgeCount já usam.
  return challenge.lastVerdict === null ? 'untried' : 'failed';
}

/**
 * O CARD DO DESAFIO aparece nesta abertura de aula? PURA.
 *
 * Regras (na ordem):
 *   1. Sem desafios na aula → não aparece (o dono: "não aparecer quando a
 *      aula não tem desafios").
 *   2. Só desafios JÁ PASSADOS → não aparece (o card existe para quem quer
 *      pular; com tudo passado não há o que pular — o fluxo normal cuida do
 *      resto).
 *   3. Senão → aparece, destacando o PRIMEIRO desafio pendente na ordem do
 *      payload. A ordem de `challenges` é a ordem editorial da trilha — a
 *      MESMA que `handleChallengeStep` usa para `pending[0]` —, então o card
 *      e o botão de ação convergem no mesmo desafio quando há exatamente um
 *      pendente.
 *
 * O que aqui NÃO decide: quiz pendente e teoria. O card de início é a
 * exceção do dono (ver cabeçalho do módulo) — e o gate do fluxo normal
 * continua inteiro em challengeOpenBlockedByQuiz/openChallenge, que este
 * módulo não toca.
 */
export function lessonChallengeCard(input: LessonChallengeCardInput): LessonChallengeCardDecision {
  // null = nunca tentado; failed/timeout/abandoned = tentou e não passou —
  // o MESMO critério de pendência de handleChallengeStep/challengeBadgeCount.
  const pending = input.challenges.filter((ch) => ch.lastVerdict !== 'passed');
  if (pending.length === 0) return { show: false, challenge: null };
  return { show: true, challenge: pending[0] };
}

// ─── ONDA2 (falha-ver-aula): o que a bolha de erro oferece depois da falha ───
//
// Pedido do dono, verbatim: "quando clico em tentar desafio e falho, posso
// clicar para VER A AULA e não em próximo ou continuar, porque tentei o
// desafio antes da aula — clicar nisso limpa tudo e começa a aula do início.
// Nesse caso o aluno REFAZ O MESMO teste; somente se falhar de novo é que se
// gera um novo desafio".

/** Ação que a bolha de erro do chat da aula oferece. */
export type LessonChallengeBubbleAction = 'viewLesson' | 'regenerate';

/** Entrada da regra — o que a LessonView sabe SEM IPC e sem jsdom. */
export interface LessonChallengeBubbleActionInput {
  /**
   * A falha veio do desafio aberto pelo CARD de início da aula (flag
   * `errorBeforeLesson` da bolha 'review', que veio do relatório de erro, que
   * veio do `TrackChallengeNavSelection`).
   */
  attemptedBeforeLesson: boolean;
  /**
   * `failedCount` do desafio no payload `track.lesson` (falhas + timeouts
   * gravados). A falha que semeou a bolha JÁ está contada (o `markAttempt` do
   * painel roda ANTES de navegar de volta) — então 1ª falha = 1, 2ª falha = 2.
   */
  failedCount: number;
}

/**
 * A bolha de erro oferece "Ver a aula" ou "Gerar novo desafio"? PURA.
 *
 * Regra do dono: na falha do desafio TENTADO ANTES DA AULA, a bolha NÃO
 * oferece "Gerar novo desafio" — oferece "Ver a aula" (que limpa o chat e
 * recomeça a aula do início; o aluno depois REFAZ O MESMO teste pelo card).
 * Só depois de falhar DE NOVO (2ª falha — `failedCount >= 2`, já com a aula
 * vista) é que o novo desafio se gera.
 *
 * Casos, na ordem:
 *   - flag ausente (fluxo normal pós-teoria — popover "Desafios", gate
 *     intacto) → 'regenerate': é o comportamento que a bolha SEMPRE teve;
 *   - flag presente + failedCount < 2 → 'viewLesson' (a 1ª falha antes da
 *     aula);
 *   - flag presente + failedCount >= 2 → 'regenerate' (falhou DE NOVO: o dono
 *     manda gerar o desafio novo — mesmo vindo do card de novo).
 */
export function lessonChallengeBubbleAction(
  input: LessonChallengeBubbleActionInput,
): LessonChallengeBubbleAction {
  // `!(x >= 2)` (e não `x < 2`): NaN cai no ramo da 1ª falha — payload
  // indefinido nunca deve autorizar gerar desafio novo antes da aula.
  if (input.attemptedBeforeLesson && !(input.failedCount >= 2)) return 'viewLesson';
  return 'regenerate';
}
