/**
 * components/quiz/quizChatCardState.ts — o MODELO PURO do card do quiz na
 * conversa (extração state/view, onda de stories do design system).
 *
 * O `QuizChatCard` é uma VIEW (props → markup), mas ele DECIDIA duas coisas
 * dentro do JSX: o que a linha de estado diz (o mapeamento
 * `QuizOverlayStatus` → texto, incluindo o estado honesto de espera
 * 'aguardando-vez') e quais AÇÕES DE RESPOSTA existem (o CTA "Responder", o
 * "Pedir de novo" e o "Responder esta pergunta de novo"). As duas decisões
 * saem agora para funções PURAS — testáveis em `node:test` sem jsdom e
 * documentáveis nos argumentos do Storybook — e o componente só desenha.
 *
 * As regras que este módulo guarda, e os defeitos que cada uma impede:
 *
 *   1. a linha de estado é o que está acontecendo COM ESTE quiz, agora. O
 *      estado 'aguardando-vez' (ONDA16-CICLO-CARGA) é HONESTO: o ciclo quer
 *      rodar, mas um turno do tutor está em voo e o motor espera — dizer
 *      "explicando"/"gerando" ali seria anunciar um trabalho que ainda nem
 *      foi pedido;
 *   2. o CTA "Responder" SÓ existe quando o quiz não está sobre a tela E está
 *      à espera do clique (`aguardando`) — o ciclo em andamento não tem botão
 *      (um botão morto é pior que nenhum), e um quiz DOMINADO não aparece
 *      aqui (a LessonView troca o card compacto pelo card cheio);
 *   3. `onRetry`/`onReopen` chegam `null` quando não há o que repetir /
 *      reabrir: a linha de ações só desenha com pelo menos uma delas. Um
 *      "reabrir" sempre disponível seria um botão de pular o quiz.
 *
 * PURO: sem React, sem DOM, sem i18n (devolve a CHAVE, quem traduz é a view).
 * Os callbacks (`onRetry`/`onReopen`) entram só como presença/ausência — este
 * módulo nunca os chama.
 */
import type { QuizOverlayStatus } from './quizOverlayContent';

/** O que a linha de estado DIZ — a chave i18n (sem o prefixo `translation:`). */
export function quizChatStatusKey(status: QuizOverlayStatus, onScreen: boolean): string {
  return onScreen
    ? 'lesson.quizChatOnScreen'
    : status === 'aguardando-vez'
      ? 'lesson.quizChatQueued'
      : status === 'explicando'
        ? 'lesson.quizChatExplaining'
        : status === 'gerando'
          ? 'lesson.quizChatGenerating'
          : status === 'indisponivel'
            ? 'lesson.quizChatUnavailable'
            : status === 'dominado'
              ? 'lesson.quizChatMastered'
              : 'lesson.quizChatWaiting';
}

/** As entradas do modelo — a presença das ações vem como `() => void | null`. */
export interface QuizChatActionsInput {
  status: QuizOverlayStatus;
  /** true quando o card está AGORA sobre a tela (o overlay o está desenhando). */
  onScreen: boolean;
  /** repetir o pedido que falhou; null quando não há nada a repetir. */
  onRetry: (() => void) | null;
  /** responder de novo a MESMA pergunta; null fora do ciclo travado. */
  onReopen: (() => void) | null;
}

/** As AÇÕES DE RESPOSTA que o card desenha (o gesto é da view). */
export interface QuizChatActions {
  /** o CTA "Responder" — o ÚNICO caminho para o quiz subir (ONDA11). */
  canOpen: boolean;
  /** "Pedir de novo" — depende da IA. */
  showRetry: boolean;
  /** "Responder esta pergunta de novo" — NÃO depende da IA (ONDA4). */
  showReopen: boolean;
  /** a linha de ações existe (pelo menos uma das duas saídas do ciclo travado). */
  showActions: boolean;
}

export function quizChatActions({
  status,
  onScreen,
  onRetry,
  onReopen,
}: QuizChatActionsInput): QuizChatActions {
  const showRetry = onRetry !== null;
  const showReopen = onReopen !== null;
  return {
    canOpen: !onScreen && status === 'aguardando',
    showRetry,
    showReopen,
    showActions: showRetry || showReopen,
  };
}
