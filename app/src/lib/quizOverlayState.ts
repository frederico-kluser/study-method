/**
 * src/lib/quizOverlayState.ts — o OVERLAY do quiz (ONDA1-MAESTRIA).
 *
 * O pedido do dono, literal: *"o layout do quiz deve ser sobre a tela e
 * respondendo ele minimiza para ficar no chat"*. São TRÊS fases, e a do meio é
 * a que dita a arquitetura:
 *
 *     fechado ──abrir──▶ sobre-a-tela ──responder──▶ minimizado-no-chat
 *                            ▲                            │
 *                            └──────── reabrir ───────────┘
 *                                  (bolha minimizada)
 *     qualquer fase ──dominar──▶ fechado
 *
 * POR QUE UM STORE DE MÓDULO, E NÃO `useState`/`Dialog`/`Popover`
 * ────────────────────────────────────────────────────────────────
 * O molde é o do irmão `challengeGenerateStore.ts` + `ChallengeGenerateModal`
 * (montado PERMANENTEMENTE no shell, `App.tsx`, com o `AnimatePresence` e a
 * condicional DENTRO do componente). O shell monta SÓ a view ativa
 * (`const View = VIEWS[active]`): trocar de aba DESMONTA a LessonView e zera
 * qualquer `useState` dela. Um quiz "minimizado no chat" precisa sobreviver a
 * isso — e um `Dialog`/`Popover` do MUI não serve, porque o estado dele morre
 * com o componente que o renderiza e o conteúdo desmonta ao fechar (minimizar
 * viraria "perder a resposta"). O estado vive no MÓDULO (uma variável do
 * processo do renderer), a UI só o lê por `useSyncExternalStore`.
 *
 * SNAPSHOT ESTÁVEL (requisito do React 19, não estética): `peekQuizOverlay`
 * devolve SEMPRE o mesmo objeto enquanto nada muda. Toda transição passa por
 * `commit`, que compara campo a campo e, se o resultado for igual ao atual,
 * NÃO troca a referência nem notifica — sem isso, `useSyncExternalStore`
 * entraria em laço de re-render infinito ("The result of getSnapshot should be
 * cached").
 *
 * TRANSIÇÕES NOMEADAS (nenhum `setState` cru sai daqui):
 *   - `openQuizOverlay`     — a seção foi apresentada e o quiz dela sobe SOBRE
 *                             A TELA; também é a porta do quiz REMEDIADOR (a
 *                             geração nova reabre o overlay);
 *   - `minimizeQuizOverlay` — o aluno respondeu: o card desce para a bolha do
 *                             chat (o ciclo continua lá — explicação e quiz
 *                             novo aparecem na conversa);
 *   - `reopenQuizOverlay`   — clique na bolha minimizada;
 *   - `closeQuizOverlay`    — a afirmação foi DOMINADA (o único fim do ciclo).
 *
 * PURO: sem React, sem DOM, sem MUI, sem Electron — `node:test` cobre o
 * arquivo inteiro. A única importação é de TIPO, da máquina pura irmã.
 */
import type { QuizCycleStep } from './trackLessonState';

/** As três fases do overlay (nomes em português, como o resto do ciclo). */
export type QuizOverlayPhase = 'fechado' | 'sobre-a-tela' | 'minimizado-no-chat';

/** Quem está aberto — o que a view precisa para renderizar o card e a bolha. */
export interface QuizOverlayContext {
  /** Chave do estado do quiz (`quizKeyFor` da assertion AUTORAL). */
  quizKey: string;
  /** Id da assertion EXIBIDA (a autoral, ou a remediadora da geração). */
  assertionId: string;
  /** Geração exibida (0 = o quiz autoral). */
  generation: number;
  /** Seção que ancora o quiz (null = assertion sem sectionId). */
  sectionId: string | null;
  /** Índice da bolha do histórico onde a versão minimizada mora (-1 = sem âncora). */
  anchorIndex: number;
}

/**
 * O estado publicado. Repete os campos do contexto em vez de estendê-lo
 * porque, FECHADO, não há quiz nenhum: `quizKey`/`assertionId` são `null` —
 * o tipo diz a verdade sobre a fase 'fechado' em vez de mentir com um cast.
 */
export interface QuizOverlayState {
  phase: QuizOverlayPhase;
  /** Chave do quiz aberto (null = fechado). */
  quizKey: string | null;
  /** Id da assertion exibida (null = fechado). */
  assertionId: string | null;
  /** Geração exibida (0 = o quiz autoral, e também o valor do estado fechado). */
  generation: number;
  /** Seção que ancora o quiz (null = sem seção / fechado). */
  sectionId: string | null;
  /** Índice da bolha do histórico onde a versão minimizada mora (-1 = nenhuma). */
  anchorIndex: number;
  /**
   * Quantas vezes o quiz ABERTO foi minimizado. Informacional (a view pode
   * usar para não repetir uma animação de entrada); zera a cada `open` de um
   * quiz/geração diferente.
   */
  minimizeCount: number;
}

/** Nada aberto — o estado de partida e o destino de `closeQuizOverlay`. */
const CLOSED_STATE: QuizOverlayState = Object.freeze({
  phase: 'fechado' as QuizOverlayPhase,
  quizKey: null,
  assertionId: null,
  generation: 0,
  sectionId: null,
  anchorIndex: -1,
  minimizeCount: 0,
});

let state: QuizOverlayState = CLOSED_STATE;
const listeners = new Set<() => void>();

/**
 * Troca o estado SÓ quando ele realmente mudou (comparação campo a campo) —
 * a garantia de identidade referencial que o `useSyncExternalStore` exige.
 * Devolve true quando houve mudança (útil nos testes).
 */
function commit(next: QuizOverlayState): boolean {
  if (
    next.phase === state.phase &&
    next.quizKey === state.quizKey &&
    next.assertionId === state.assertionId &&
    next.generation === state.generation &&
    next.sectionId === state.sectionId &&
    next.anchorIndex === state.anchorIndex &&
    next.minimizeCount === state.minimizeCount
  ) {
    return false;
  }
  state = next;
  for (const l of listeners) l();
  return true;
}

/** true quando o contexto pedido é o MESMO quiz/geração já no store. */
function isSameQuiz(ctx: Pick<QuizOverlayContext, 'quizKey' | 'generation'>): boolean {
  return state.quizKey === ctx.quizKey && state.generation === ctx.generation;
}

/**
 * ABRE o quiz SOBRE A TELA (a seção acabou de ser apresentada, ou o quiz
 * remediador da geração seguinte chegou).
 *
 * Idempotente para o MESMO quiz/geração já sobre a tela (no-op por
 * referência — anti-StrictMode/efeito reexecutado). Uma geração NOVA da mesma
 * chave, ou outro quiz, SOBE por cima: o overlay é único, como o modal irmão,
 * e o quiz que acabou de aparecer é o que interessa. Reabrir a MESMA geração
 * que estava minimizada é `reopenQuizOverlay` — `openQuizOverlay` não
 * ressuscita um card minimizado por acidente.
 */
export function openQuizOverlay(ctx: QuizOverlayContext): void {
  if (isSameQuiz(ctx) && state.phase !== 'fechado') return;
  commit({ ...ctx, phase: 'sobre-a-tela', minimizeCount: 0 });
}

/**
 * MINIMIZA para a bolha do chat — a transição do pedido do dono, disparada ao
 * RESPONDER. No-op fora de 'sobre-a-tela' (nada a minimizar) e no-op quando
 * `quizKey` é informado e não é o quiz aberto (evento atrasado de outro card).
 */
export function minimizeQuizOverlay(quizKey?: string): void {
  if (state.phase !== 'sobre-a-tela') return;
  if (quizKey !== undefined && quizKey !== state.quizKey) return;
  commit({ ...state, phase: 'minimizado-no-chat', minimizeCount: state.minimizeCount + 1 });
}

/**
 * REABRE a partir da bolha minimizada (clique do aluno). No-op fora de
 * 'minimizado-no-chat' e no-op para uma chave que não é a aberta.
 */
export function reopenQuizOverlay(quizKey?: string): void {
  if (state.phase !== 'minimizado-no-chat') return;
  if (quizKey !== undefined && quizKey !== state.quizKey) return;
  commit({ ...state, phase: 'sobre-a-tela' });
}

/**
 * FECHA — o fim do ciclo (a afirmação foi DOMINADA). Com `quizKey`, fecha só
 * se for o quiz aberto (um "dominado" atrasado de outra chave não derruba o
 * quiz que está na tela agora); sem argumento, fecha o que estiver aberto.
 */
export function closeQuizOverlay(quizKey?: string): void {
  if (quizKey !== undefined && quizKey !== state.quizKey) return;
  commit(CLOSED_STATE);
}

/**
 * A FASE que um passo do ciclo pede — a ponte pura entre a máquina de maestria
 * (`trackLessonState`) e este store:
 *
 *   - 'aguardar-resposta'                  → 'sobre-a-tela' (o card espera o clique);
 *   - 'explicar-erro' / 'gerar-novo-quiz'  → 'minimizado-no-chat' (respondeu:
 *     o ciclo continua NA CONVERSA — a explicação e o quiz novo chegam lá);
 *   - 'dominado'                           → 'fechado'.
 */
export function quizOverlayIntent(step: QuizCycleStep): QuizOverlayPhase {
  switch (step.kind) {
    case 'aguardar-resposta':
      return 'sobre-a-tela';
    case 'explicar-erro':
    case 'gerar-novo-quiz':
      return 'minimizado-no-chat';
    default:
      return 'fechado';
  }
}

/**
 * Aplica um passo do ciclo ao overlay (`quizOverlayIntent` + a transição
 * correspondente). É o atalho que a view usa depois de cada mutação do estado
 * da aula, para não reimplementar o switch: minimizar quando o passo pede a
 * bolha (abrindo o contexto primeiro, se o store estiver em outro quiz) e
 * fechar quando a afirmação foi dominada.
 */
export function applyQuizOverlayStep(ctx: QuizOverlayContext, step: QuizCycleStep): void {
  const intent = quizOverlayIntent(step);
  if (intent === 'fechado') {
    closeQuizOverlay(ctx.quizKey);
    return;
  }
  if (intent === 'sobre-a-tela') {
    openQuizOverlay(ctx);
    return;
  }
  // 'minimizado-no-chat': o card respondido vive na conversa. Escrever o
  // contexto junto cobre o caso "a view remontou e o store estava fechado".
  commit({
    ...ctx,
    phase: 'minimizado-no-chat',
    minimizeCount: isSameQuiz(ctx) ? Math.max(1, state.minimizeCount) : 1,
  });
}

/** true quando ESTE quiz é o que está no overlay (em qualquer fase aberta). */
export function isQuizOverlayOpenFor(quizKey: string): boolean {
  return state.phase !== 'fechado' && state.quizKey === quizKey;
}

/** Lê o estado SEM consumir (peek — o par de subscribe p/ useSyncExternalStore). */
export function peekQuizOverlay(): QuizOverlayState {
  return state;
}

/** Alias com o nome do contrato do React 19 — MESMA referência de `peek`. */
export function getQuizOverlaySnapshot(): QuizOverlayState {
  return state;
}

/** Assina mudanças do estado (devolve unsubscribe). */
export function subscribeQuizOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reseta o módulo (só para testes — chamado no beforeEach). */
export function __resetQuizOverlayForTests(): void {
  state = CLOSED_STATE;
  listeners.clear();
}
