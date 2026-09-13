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
  /**
   * ONDA16-CICLO-CARGA: o ciclo QUER rodar, mas espera a vez — um turno do
   * tutor está em voo e o motor NÃO enfileira o pedido atrás dele (a fila FIFO
   * do LLM local estourava o timeout do renderer). Nada foi pedido ainda: o
   * card diz isso em vez de mentir "explicando"/"gerando".
   */
  | 'aguardando-vez'
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
  /**
   * ONDA4-SAÍDA-DO-CICLO: reabrir a MESMA pergunta para uma tentativa nova
   * (`reopenStalledQuiz`) — a saída do ciclo travado com a IA fora do ar.
   * `null` quando o ciclo não está travado: reabrir não é um botão de "pular o
   * quiz" sempre disponível, e a maestria continua exigindo ACERTO.
   */
  onReopen: (() => void) | null;
}

/**
 * ONDA12-FOCO: o atributo que marca, no DOM, o CARD DA CONVERSA de um quiz.
 *
 * POR QUE ELE MORA AQUI, e não em cada componente. O CTA "Responder" é
 * DESMONTADO quando o modal sobe (`QuizChatCard`: `canOpen = !onScreen && …`),
 * então o `document.activeElement` gravado na abertura está SEMPRE desconectado
 * na hora de devolver o foco — a devolução prometida no cabeçalho do
 * `QuizOverlayHost` nunca acontecia e o Esc largava o teclado no `<body>`
 * (SC 2.4.3). A âncora que SOBREVIVE é o próprio card da conversa: ele fica na
 * tela nos dois estados, e o CTA renasce dentro dele quando o modal sai.
 *
 * Duas metades (a que ESCREVE o atributo e a que o PROCURA) vivendo em arquivos
 * diferentes é exatamente o tipo de par que se descola numa refatoração e falha
 * EM SILÊNCIO — o foco simplesmente não volta, e nada quebra. Uma constante só,
 * importada pelos dois, torna a divergência impossível. É string, não DOM: este
 * módulo continua puro o bastante para `node:test`.
 */
export const QUIZ_CARD_ANCHOR_ATTR = 'data-quiz-chat-card';

/** O seletor da âncora acima (qualquer card do quiz na conversa). */
export const QUIZ_CARD_ANCHOR_SELECTOR = `[${QUIZ_CARD_ANCHOR_ATTR}]`;

/**
 * O seletor do card de UM quiz específico — a âncora de devolução de foco.
 *
 * ONDA 13. A âncora carregava o valor literal `"true"`, então só existia o
 * seletor genérico acima; com mais de um quiz pendente na conversa (caso REAL —
 * uma seção pode ancorar duas afirmações, e o histórico guarda as anteriores),
 * `document.querySelector` devolveria o PRIMEIRO card, não o que o aluno
 * acabou de fechar. O valor do atributo passa a ser a CHAVE CANÔNICA do quiz e
 * a devolução de foco vira endereçada.
 *
 * A chave é `sectionId::assertionId` e o `assertionId` vem do JSON da trilha —
 * ou seja, é texto de AUTOR, não identificador controlado por nós. Por isso o
 * escape: aspa dupla e contrabarra são os dois caracteres que quebrariam
 * (ou pior, ESTENDERIAM) um seletor de atributo entre aspas. `CSS.escape` não
 * serve aqui — ele escapa identificadores, não o interior de uma string
 * literal — e este módulo é importado por `node:test`, onde `CSS` não existe.
 */
export function quizCardAnchorSelector(quizKey: string): string {
  const escaped = quizKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${QUIZ_CARD_ANCHOR_ATTR}="${escaped}"]`;
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
    a.onRetry === b.onRetry &&
    a.onReopen === b.onReopen
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
