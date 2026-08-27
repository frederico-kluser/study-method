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
 *   - `theoryDone`: todas as seções apresentadas (a aula teórica terminou).
 *
 * Fluxo: o usuário clica "Próximo" → action 'next' (com presentedSections) →
 * a resposta do tutor vira uma mensagem assistant e sectionId entra em
 * presentedSections. O usuário digita → action 'answer' → a resposta do tutor
 * vira mensagem assistant (sem avançar seção).
 */
import type { TutorReply } from '../../shared/ipc-contract';

export interface TutorChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface TrackLessonUiState {
  presentedSections: string[];
  history: TutorChatMessage[];
  /** true quando todas as seções da teoria já foram apresentadas. */
  theoryDone: boolean;
  /** mensagem de erro do último turno (null = sem erro). */
  lastError: string | null;
}

export function createTrackLessonState(): TrackLessonUiState {
  return { presentedSections: [], history: [], theoryDone: false, lastError: null };
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

/** O histórico enviado ao main (mensagens puras). */
export function chatHistory(state: TrackLessonUiState): TutorChatMessage[] {
  return state.history;
}

/** A próxima ação do tutor: 'next' enquanto houver seção; depois, fim. */
export function tutorNextAction(state: TrackLessonUiState): 'next' | 'answer' {
  return state.theoryDone ? 'answer' : 'next';
}

/** Nº de seções apresentadas (para a UI mostrar o progresso da aula). */
export function presentedCount(state: TrackLessonUiState): number {
  return state.presentedSections.length;
}
