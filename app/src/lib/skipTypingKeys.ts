/**
 * src/lib/skipTypingKeys.ts — a decisão "este gesto pula a digitação?", PURA.
 *
 * ─── O DEFEEITO QUE ISTO MATA (W6 + S8 da auditoria de UX da Aula) ─────────
 * O atalho de "pular a digitação" era INCONDICIONAL: um `keydown` capturado no
 * `window` chamava `requestSkipTyping` para QUALQUER tecla, e o clique no
 * painel do chat também. Duas consequências medidas:
 *
 *   1. DIGITAR NO CAMPO DE PERGUNTA pulava a digitação da seção — cada tecla
 *      do aluno era um "mostrar tudo" disfarçado (o listener é `capture`,
 *      então ele via o evento antes do TextField);
 *   2. CLICAR EM "Copiar"/links/botões dentro da bolha também pulava — o
 *      clique borbulhava até ao painel e virava skip.
 *
 * ─── POR QUE UM MÓDULO PURO ────────────────────────────────────────────────
 * A decisão tem de ser testável sem DOM (a base não tem jsdom) e consumida
 * pelos DOIS gatilhos (tecla e clique) sem duplicar regra. Ela recebe o
 * EVENTO por ESTRUTURA (as interfaces abaixo — nunca tipos DOM crus: este
 * módulo vive em `src/lib`, que o `tsconfig.node.json` compila SEM lib.dom) e
 * devolve booleano. Quem executa é a LessonView.
 *
 * ─── AS REGRAS (todas NEGATIVAS: "não pula quando…") ───────────────────────
 *   - o alvo é superfície de DIGITAÇÃO (`input`/`textarea`/contentEditable) —
 *     a tecla pertence ao texto que o aluno está escrevendo;
 *   - o alvo é/está dentro de um CONTROLE (`button`, `a`, `[role="button"]`) —
 *     o gesto pertence ao "Copiar"/link/botão da bolha (S8);
 *   - a tecla é MODIFICADORA (`Shift`/`Control`/`Alt`/`Meta`, ou um atalho com
 *     Ctrl/Meta/Alt) — quem chama um atalho não está a pedir "mostrar tudo";
 *   - a tecla é de NAVEGAÇÃO (Tab/setas/Escape/Home/End/PageUp/PageDown) —
 *     Tab navega, Escape fecha, as setas movem o cursor: roubar qualquer uma
 *     destas é o "roubo de digitação" que o aluno relatou.
 *
 * Fora destes casos, o gesto é um pedido de revelar — a view pula a digitação.
 */

/** O pedaço de ELEMENTO ALVO que a decisão lê (o DOM real casca por aqui). */
export interface SkipTypingTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  /** `Element.closest` — o guard S8 ("está dentro de um controle?"). */
  closest?: (selector: string) => unknown;
}

/** Evento de TECLA, pela estrutura que a decisão usa (nunca tipos DOM). */
export interface SkipTypingKeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

/** Evento de CLIQUE, pela estrutura que a decisão usa. */
export interface SkipTypingClickEventLike {
  target?: unknown;
}

/** O disparador do skip: tecla OU clique (a view passa o evento que tem). */
export type SkipTypingTriggerLike = SkipTypingKeyEventLike | SkipTypingClickEventLike;

/** Teclas que o skip NUNCA rouba: modificadoras e de navegação. */
const SKIP_KEY_BLOCKLIST: ReadonlySet<string> = new Set([
  // modificadoras
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'Dead',
  // navegação (Tab/setas/Escape + as do mesmo papel)
  'Tab',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Onde o aluno DIGITA — uma tecla ali nunca é um pedido de skip. */
const TYPING_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA']);

/** Controles: o clique (ou Enter/Espaço) ali pertence ao controle, não ao painel. */
const INTERACTIVE_SELECTOR = 'button, a, [role="button"]';

/** Leitura defensiva do alvo (o evento pode ser sintético, parcial ou nulo). */
function readTarget(target: unknown): SkipTypingTargetLike | null {
  if (target === null || typeof target !== 'object') return null;
  return target as SkipTypingTargetLike;
}

/**
 * O alvo é superfície de digitação (`input`/`textarea`/contentEditable)?
 * PURA — e o motivo está no cabeçalho: digitar não é um pedido de revelar.
 */
export function isTypingTarget(target: unknown): boolean {
  const el = readTarget(target);
  if (el === null) return false;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (TYPING_TAGS.has(tag)) return true;
  return el.isContentEditable === true;
}

/**
 * O alvo é (ou está dentro de) um controle — `button`, `a`, `[role="button"]`?
 * PURA. É o guard do S8: o clique em "Copiar"/link dentro da bolha borbulha
 * até ao painel e NÃO pode virar "mostrar tudo". O `closest` é chamado COM o
 * elemento como `this` (método do DOM) e cobre o clique no FILHO do controle
 * (o ícone, o rótulo).
 */
export function isInteractiveTarget(target: unknown): boolean {
  const el = readTarget(target);
  if (el === null || typeof el.closest !== 'function') return false;
  return el.closest(INTERACTIVE_SELECTOR) !== null;
}

/**
 * A TECLA pula a digitação? PURA — ver as regras no cabeçalho do módulo.
 */
export function shouldSkipTypingOnKey(event: SkipTypingKeyEventLike): boolean {
  if (isTypingTarget(event.target)) return false;
  if (isInteractiveTarget(event.target)) return false;
  // Atalho com modificador (Ctrl/Meta/Alt) ou a própria tecla modificadora.
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return false;
  if (SKIP_KEY_BLOCKLIST.has(event.key)) return false;
  return true;
}

/**
 * O CLIQUE pula a digitação? PURA — só o clique no "vazio" do painel (não em
 * controle) é que é um pedido de revelar.
 */
export function shouldSkipTypingOnClick(event: SkipTypingClickEventLike): boolean {
  return !isInteractiveTarget(event.target);
}

/**
 * O DISPARADOR pula a digitação? PURA. Tecla tem `key` (string) e segue as
 * regras da tecla; o resto (clique do painel) segue as do clique. Sem evento
 * (o botão "Mostrar tudo" / o avanço que revela) o pedido é sempre legítimo.
 */
export function shouldSkipTyping(event: SkipTypingTriggerLike | undefined): boolean {
  if (event === undefined) return true;
  if (typeof (event as SkipTypingKeyEventLike).key === 'string') {
    return shouldSkipTypingOnKey(event as SkipTypingKeyEventLike);
  }
  return shouldSkipTypingOnClick(event as SkipTypingClickEventLike);
}
