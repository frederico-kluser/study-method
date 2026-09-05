/**
 * src/components/quiz/quizOverlayContent.ts — o CONTEÚDO que o overlay do quiz
 * desenha, publicado pela LessonView e lido pelo host montado no shell.
 *
 * POR QUE ESTE ARQUIVO EXISTE (e por que ele NÃO é um segundo store de estado)
 * ──────────────────────────────────────────────────────────────────────────
 * `src/lib/quizOverlayState.ts` é a máquina do overlay e ela guarda só
 * IDENTIDADE: `quizKey`, `assertionId`, `generation`, `sectionId`,
 * `anchorIndex`. É de propósito — a máquina é pura e testável em `node:test`,
 * e nada de conteúdo de aula (assertion, opções, callbacks React) pode entrar
 * lá sem contaminá-la.
 *
 * Só que o overlay é montado PERMANENTEMENTE no shell (`App.tsx`, o molde do
 * `ChallengeGenerateModal`) e o conteúdo do quiz vive no `useState` da
 * LessonView. Faltava a ponte. Este módulo é essa ponte, e só ela:
 *
 *     LessonView  ──publishQuizOverlayContent──▶  [módulo]  ──▶  QuizOverlayHost
 *                                                (peek/subscribe)
 *
 * REGRAS QUE ELE HERDA DO IRMÃO (`challengeGenerateStore.ts`):
 *   - SNAPSHOT ESTÁVEL: `peekQuizOverlayContent` devolve SEMPRE a mesma
 *     referência enquanto nada muda. `publish` compara campo a campo e, se o
 *     conteúdo for igual, NÃO troca a referência nem notifica — sem isso o
 *     `useSyncExternalStore` do host entraria no laço "The result of
 *     getSnapshot should be cached" a cada render da view;
 *   - módulo (não Context): o valor sobrevive a qualquer re-render, e o host
 *     lê por `subscribe` + `peek`.
 *
 * O QUE ACONTECE AO TROCAR DE ABA. O shell monta SÓ a view ativa: sair da aba
 * Aula DESMONTA a LessonView, e o cleanup dela publica `null` aqui. O host
 * então não tem o que desenhar e o overlay SAI da tela — mas a FASE continua
 * no `quizOverlayState` (módulo), e o estado das respostas continua no
 * `lessonChatCache`. Voltar para a aba Aula republica o conteúdo e o overlay
 * REAPARECE na mesma fase, com a mesma geração. É isto que "não perder estado
 * ao trocar de aba" significa aqui: o quiz não é reiniciado nem re-respondido
 * — e um quiz de uma seção de aula também não fica pairando por cima do
 * Roadmap, onde ele não teria contexto nenhum.
 *
 * PURO o suficiente para `node:test`: sem React, sem DOM, sem MUI. Os
 * callbacks trafegam como funções opacas (o módulo nunca os chama).
 */
import type { TrackAssertionDto } from '../../../shared/ipc-contract';
import type { QuizState } from '../../lib/trackLessonState';

/**
 * Em que ponto do ciclo o card está, do ponto de vista de QUEM DESENHA. É a
 * tradução do `QuizCycleStep` da máquina pura para os quatro textos que a tela
 * precisa dizer — mais o quinto, que a máquina pura não conhece porque ele não
 * é do ciclo e sim do CANAL: 'indisponivel'.
 */
export type QuizOverlayStatus =
  /** o card espera o clique do aluno (a única fase interativa). */
  | 'aguardando'
  /** respondeu errado; a explicação diagnóstica está sendo escrita. */
  | 'explicando'
  /** a explicação já entrou na conversa; o quiz novo está sendo gerado. */
  | 'gerando'
  /** o canal falhou (fail-closed) — a UI diz o que faltou e oferece repetir. */
  | 'indisponivel'
  /** houve acerto: a afirmação fechou. */
  | 'dominado';

/** O que o host precisa para desenhar o card sobre a tela. */
export interface QuizOverlayContent {
  /** chave canônica do estado do quiz (`quizKeyFor` — nunca calculada aqui). */
  quizKey: string;
  /** a assertion da GERAÇÃO corrente (a remediadora, quando existe). */
  assertion: TrackAssertionDto;
  /** estado da resposta da geração corrente (undefined = ainda não respondida). */
  quiz: QuizState | undefined;
  /** geração exibida (0 = o quiz autoral da trilha). */
  generation: number;
  /** ponto do ciclo, já traduzido para o vocabulário da tela. */
  status: QuizOverlayStatus;
  /**
   * Aviso informativo do CANAL (fail-closed), já traduzido pela view — null
   * quando não há nada a dizer. NUNCA é repreensão: descreve o que faltou.
   */
  notice: string | null;
  /** clique numa alternativa (a view submete e minimiza). */
  onSelect: (answerIndex: number) => void;
  /** minimizar para a conversa (Esc, backdrop, botão). */
  onMinimize: () => void;
  /** repetir o pedido que falhou; null quando não há nada a repetir. */
  onRetry: (() => void) | null;
}

let content: QuizOverlayContent | null = null;
const listeners = new Set<() => void>();

/** true quando os dois conteúdos são o MESMO desenho (comparação campo a campo). */
function isSameContent(a: QuizOverlayContent | null, b: QuizOverlayContent | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.quizKey === b.quizKey &&
    a.assertion === b.assertion &&
    a.quiz === b.quiz &&
    a.generation === b.generation &&
    a.status === b.status &&
    a.notice === b.notice &&
    a.onSelect === b.onSelect &&
    a.onMinimize === b.onMinimize &&
    a.onRetry === b.onRetry
  );
}

/**
 * Publica (ou LIMPA, com `null`) o conteúdo do overlay. No-op por referência
 * quando nada mudou — a garantia de identidade que o `useSyncExternalStore`
 * exige. Devolve true quando houve mudança (útil nos testes).
 */
export function publishQuizOverlayContent(next: QuizOverlayContent | null): boolean {
  if (isSameContent(content, next)) return false;
  content = next;
  for (const l of listeners) l();
  return true;
}

/** Lê o conteúdo SEM consumir (o par de subscribe p/ useSyncExternalStore). */
export function peekQuizOverlayContent(): QuizOverlayContent | null {
  return content;
}

/** Assina mudanças do conteúdo (devolve unsubscribe). */
export function subscribeQuizOverlayContent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reseta o módulo (só para testes — chamado no beforeEach). */
export function __resetQuizOverlayContentForTests(): void {
  content = null;
  listeners.clear();
}
