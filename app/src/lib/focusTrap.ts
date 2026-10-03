/**
 * src/lib/focusTrap.ts — o SELETOR de focáveis e o LAÇO DE FOCO do diálogo,
 * uma vez só (auditoria de layout §7).
 *
 * ─── DE ONDE VEM ──────────────────────────────────────────────────────────
 * A lista do que recebe Tab dentro de um `aria-modal` estava copiada 4×
 * (`QuizOverlayHost.tsx` — o exemplar —, `ChallengeGenerateModal.tsx`,
 * `TutorialSelectionModal.tsx`, `OnboardingOverlay.tsx`, os dois últimos com
 * comentário a dizer "cópia do QuizOverlayHost") e o laço `Shift+Tab`/`Tab` +
 * devolução de foco ao abridor estava reimplementado em cada um. Sem o laço, o
 * `aria-modal="true"` mente (SC 2.4.3).
 *
 * ─── POR QUE FUNÇÕES PURAS COM DOM POR INJEÇÃO ────────────────────────────
 * Este projeto testa sem jsdom (`src/lib` é compilado pelo tsconfig.node.json,
 * lib ES2022 SEM DOM — a prova mecânica está lá). Por isso nada aqui declara
 * `HTMLElement` nem importa React: os contratos são ESTRUTURAIS (`focus`,
 * `querySelectorAll`, `isConnected`) e o DOM real chega por injeção. Um
 * `HTMLDivElement` de verdade satisfaz os contratos por estrutura, e um objeto
 * de mentira do `node:test` também — as duas pernas são exercitadas em
 * `tests/focusTrap.test.ts`.
 *
 * O adapter React (`useFocusTrap`, em `components/ui/`) é cola fina sobre
 * estas funções: a DECISÃO toda mora aqui.
 *
 * ─── A REGRA DO LAÇO (o que `trapTabTarget` decide) ───────────────────────
 *   1. sem nada focável dentro, o Tab não pode sair mesmo assim — o próprio
 *      painel (tabIndex -1) recebe o foco de volta;
 *   2. `Shift+Tab` no primeiro alvo (ou no próprio painel, que é onde o foco
 *      entra ao abrir) dá a volta ao ÚLTIMO;
 *   3. `Tab` no último alvo dá a volta ao PRIMEIRO;
 *   4. foco FORA do laço (escapou para o body ou para trás do scrim) volta a
 *      entrar: primeiro alvo com Tab, último com Shift+Tab;
 *   5. no meio da lista o navegador faz o Tab normal — o laço só intervém nas
 *      bordas (é isso que evita sequestrar o Tab de quem escreve num campo).
 *
 * A regra 4 é um REFORÇO em relação às quatro cópias: elas só davam a volta
 * nas bordas e deixavam o foco escapado continuar fora do diálogo. O APG
 * ("Modal Dialog") manda o foco ficar preso; esta função é o que torna a
 * promessa do `aria-modal` verdadeira também nesse caso.
 */
/**
 * A lista canónica do laço — tudo que pode receber Tab dentro do diálogo.
 * `button:not([disabled])` é deliberado: controle desabilitado não recebe
 * foco, e portanto não entra no ciclo (o exemplar `QuizOverlayHost` documenta
 * a mesma escolha).
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Contrato estrutural mínimo de um alvo focável. `focus` é OPCIONAL porque nem
 * todo candidato que o DOM devolve o tem (`Element` não declara `focus`) —
 * chamar via `focusElement()` nunca rebenta.
 */
export interface FocusableLike {
  focus?: () => void;
}

/** Contentor injetado — o DOM real satisfaz por estrutura; os testes, por fakes. */
export interface FocusRootLike {
  querySelectorAll(selectors: string): ArrayLike<FocusableLike>;
}

/** Chave de teclado como o laço a vê (o `KeyboardEvent` real satisfaz isto). */
export interface FocusLoopKeyEventLike {
  key: string;
  shiftKey: boolean;
  preventDefault(): void;
}

/** Foca (ou ignora em silêncio) um alvo cujo `focus` é opcional. */
export function focusElement(target: FocusableLike | null | undefined): void {
  target?.focus?.();
}

/** Os focáveis dentro de `root`, na ordem do documento. `null` devolve `[]`. */
export function getFocusable(root: FocusRootLike | null): FocusableLike[] {
  if (root === null) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
}

/**
 * O alvo do Tab quando o laço está ativo — ou `null` para deixar o Tab correr
 * normal. `container` é o painel `aria-modal` (recebe o foco quando não há
 * nada focável dentro) e `active` é o elemento focado AGORA (o
 * `document.activeElement`, injetado). A ordem das regras é a da lista 1–5 do
 * cabeçalho.
 */
export function trapTabTarget<E>(
  items: readonly E[],
  active: unknown,
  shiftKey: boolean,
  container: unknown = null,
): E | null {
  if (items.length === 0) return container === null ? null : (container as E);
  const primeiro = items[0]!;
  const ultimo = items[items.length - 1]!;
  const dentro = active === container || items.includes(active as E);

  // Regra 4: foco escapou do laço — volta a entrar pela ponta certa.
  if (!dentro) return shiftKey ? ultimo : primeiro;
  // Regra 2.
  if (shiftKey && (active === primeiro || active === container)) return ultimo;
  // Regra 3.
  if (!shiftKey && active === ultimo) return primeiro;
  // Regra 5.
  return null;
}

/**
 * O handler de `keydown` do laço, pronto para `addEventListener`/`onKeyDown`.
 * As consultas (contentor, foco atual) entram por GETTERS — é a injeção que o
 * torna testável sem DOM; no navegador são `() => ref.current` e
 * `() => document.activeElement`.
 */
export function createFocusLoop<E extends FocusRootLike & FocusableLike>(options: {
  /** O painel `aria-modal` (ou `null` quando fechado). */
  getContainer: () => E | null;
  /** O elemento focado agora. */
  getActive: () => unknown;
}): (event: FocusLoopKeyEventLike) => void {
  return (event) => {
    if (event.key !== 'Tab') return;
    const container = options.getContainer();
    if (container === null) return;
    const alvos = getFocusable(container);
    const alvo = trapTabTarget(alvos, options.getActive(), event.shiftKey, container);
    // Só sequestra o Tab quando o laço INTERVÉM (regras 1–4); no meio da
    // lista o preventDefault aqui seria o bug clássico do trap que não deixa
    // digitar.
    if (alvo === null) return;
    event.preventDefault();
    focusElement(alvo);
  };
}

/**
 * PARA ONDE o foco volta quando o modal sai (SC 2.4.3) — a regra que estava
 * escrita e comentada em cada cópia do laço:
 *
 *   1. o próprio elemento que abriu, SE ele ainda estiver na árvore
 *      (`isConnected` — um nó desmontado não recebe foco, e `focus()` nele é
 *      um no-op que PARECE ter funcionado);
 *   2. senão, o primeiro focável dentro da ÂNCORA que sobrevive ao fecho (o
 *      card que continha o CTA — é o caminho real: o CTA renasce ali);
 *   3. senão, NINGUÉM. Devolver o foco a um elemento arbitrário da página é
 *      pior que deixá-lo onde o navegador o colocou.
 *
 * Os tipos são estruturais (como na origem deste código,
 * `QuizOverlayHost.focusReturnTarget`, que a Fase C passa a importar daqui):
 * é o que permite ao `node:test` exercitar as três pernas com objetos de
 * mentira, num projeto compilado SEM a lib DOM. `<body>` nunca é abridor — o
 * chamador filtra-o antes (ele está sempre `isConnected` e o `focus()` dele é
 * o no-op que este contrato não consegue detetar sozinho).
 */
export interface FocusReturnNode {
  readonly isConnected: boolean;
  focus: () => void;
}

export interface FocusReturnAnchor<N extends FocusReturnNode> {
  readonly isConnected: boolean;
  querySelector: (selectors: string) => N | null;
}

export function focusReturnTarget<N extends FocusReturnNode>(
  opener: N | null,
  anchor: FocusReturnAnchor<N> | null,
): N | null {
  if (opener !== null && opener.isConnected) return opener;
  if (anchor === null || !anchor.isConnected) return null;
  return anchor.querySelector(FOCUSABLE_SELECTOR);
}
