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
