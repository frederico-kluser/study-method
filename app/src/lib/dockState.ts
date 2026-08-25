/**
 * src/lib/dockState.ts — MÁQUINA DE ESTADOS PURA do dock inferior do Desafio.
 *
 * O dock é a gaveta de Saída / Testes / Feedback que substitui a pilha de
 * `Paper` da ChallengeView (docs/ux-redesign.md §7.3). O encaixe NÃO é invenção:
 * as VS Code UX Guidelines (Panel) são literais sobre o que mora ali —
 *   ✔ "Render Views in the Panel that benefit from more horizontal space"
 *   ✔ "Use for Views that provide supporting functionality"
 *   ✘ "Use for Views that are meant to be always visible since users often
 *      minimize the Panel"
 * e "By default, Views like the Terminal, Problems, and Output can be viewed in
 * a single tab at a time in the Panel". Saída, testes e feedback SÃO apoio, se
 * beneficiam de largura e não precisam estar sempre visíveis ⇒ dock, uma aba por
 * vez. O ENUNCIADO, que precisa estar sempre visível, fica FORA — ele é o painel
 * líder do split-pane (src/lib/splitRatio.ts) e nunca colapsa.
 *
 * PURO por necessidade: zero React, zero DOM, zero MUI, testado em node:test sem
 * jsdom. O componente da onda 3 despacha ações e lê seletores.
 *
 * ── OS QUATRO CONTRATOS QUE ESTE ARQUIVO EXISTE PARA IMPOR ───────────────────
 *
 * 1. RECOLHIDO ≠ DESTRUÍDO. `mountedTabs` é MONOTÔNICO: nenhuma ação remove uma
 *    aba dele, nunca. O terminal xterm vive num objeto imperativo por trás de um
 *    ref (`AnswerTerminalHandle`); desmontar o componente DESCARTA o buffer, e o
 *    usuário perde a saída do teste só por ter fechado a gaveta. O estado diz
 *    quem tem que continuar montado; o componente obedece escondendo com
 *    `display:none`/`hidden`, JAMAIS com renderização condicional.
 *    Use `shouldRenderTab()` no JSX e `isTabVisible()` no estilo.
 *
 * 2. ALTURA PRESERVADA. `heightPx` é SEMPRE a altura EXPANDIDA e é ortogonal a
 *    `collapsed`: recolher não a toca, e reabrir volta exatamente para onde
 *    estava — não para um default. É literalmente o que a WAI-ARIA APG pede do
 *    `Enter` no Window Splitter: "If the primary pane is not collapsed,
 *    collapses the pane. If the pane is collapsed, restores the splitter to its
 *    previous position." Por isso `resize` com o dock RECOLHIDO é IGNORADO — um
 *    efeito de layout disparando resize no estado recolhido não pode sequestrar
 *    a altura de restauração.
 *
 * 3. AUTO-FOCO É TRANSIÇÃO NOMEADA, não efeito colateral. Quando um teste
 *    termina, quem traz a aba certa para a frente é a ação `reveal` — e o mapa
 *    evento→ação vive em `dockActionForSignal()`, um lugar só, puro e testável.
 *    `reveal` tem duas intensidades:
 *      - `force: true`  → abre o dock mesmo recolhido. Reservado para o que o
 *        usuário ACABOU de pedir (clicou "Testar resposta" ⇒ quer ver a saída).
 *      - `force` ausente → respeita o dock recolhido e só acende o marcador de
 *        novidade (`unseen`). O usuário fechou a gaveta; o programa avisa, não
 *        desobedece.
 *    `notify` nunca abre nada — é só o marcador.
 *
 * 4. PERSISTÊNCIA TOLERANTE A LIXO, campo a campo. Ausente, JSON quebrado,
 *    tipo errado, valor fora de faixa ou `localStorage` que lança: cai em
 *    default são e NUNCA lança. A tolerância é por CAMPO (uma aba com nome
 *    desconhecido não faz o usuário perder a altura que ele ajustou), exceto a
 *    `version`, que é mudança de FORMA e descarta o payload inteiro.
 *
 * Testado em tests/dockState.test.ts (node:test, sem jsdom).
 */
import { MOTION } from './designTokens';

/* ── Abas ─────────────────────────────────────────────────────────────────── */

/** As três abas do dock. Uma visível por vez (VS Code Panel). */
export type DockTabId = 'output' | 'tests' | 'feedback';

/**
 * Rótulos i18n. Literais com namespace explícito porque o `strictKeyChecks` do
 * i18next v25 só aceita a forma `translation:<key>` — mesma convenção de
 * `NavI18nKey` em src/lib/shellNav.ts. As chaves já existem nos DOIS locales.
 */
export type DockTabI18nKey =
  | 'translation:challenge.dock.output'
  | 'translation:challenge.dock.tests'
  | 'translation:challenge.dock.feedback';

export interface DockTab {
  readonly id: DockTabId;
  readonly i18nKey: DockTabI18nKey;
}

/** Ordem canônica das abas (Saída → Testes → Feedback: a ordem do fluxo). */
export const DOCK_TABS: readonly DockTab[] = [
  { id: 'output', i18nKey: 'translation:challenge.dock.output' },
  { id: 'tests', i18nKey: 'translation:challenge.dock.tests' },
  { id: 'feedback', i18nKey: 'translation:challenge.dock.feedback' },
];

/** Só os ids, na ordem canônica. */
export const DOCK_TAB_IDS: readonly DockTabId[] = DOCK_TABS.map((tab) => tab.id);

/** Chaves i18n do próprio dock (rótulo da região e do botão de recolher). */
export const DOCK_ARIA_I18N_KEY = 'translation:challenge.dock.aria' as const;
export const DOCK_COLLAPSE_I18N_KEY = 'translation:challenge.dock.collapse' as const;
export const DOCK_EXPAND_I18N_KEY = 'translation:challenge.dock.expand' as const;

/** Ids estáveis para o cabeamento ARIA (tablist/tab/tabpanel e separator). */
export const DOCK_PANE_ID = 'challenge-dock';
export const DOCK_TABLIST_ID = 'challenge-dock-tablist';
export const DOCK_DIVIDER_ID = 'challenge-dock-divider';

/** Id do botão de aba — vai em `aria-labelledby` do painel correspondente. */
export function dockTabElementId(tab: DockTabId): string {
  return `challenge-dock-tab-${tab}`;
}

/** Id do painel da aba — vai em `aria-controls` do botão correspondente. */
export function dockTabPanelId(tab: DockTabId): string {
  return `challenge-dock-panel-${tab}`;
}

/** Reconhece um valor persistido como aba válida. */
export function isDockTabId(value: unknown): value is DockTabId {
  return typeof value === 'string' && (DOCK_TAB_IDS as readonly string[]).includes(value);
}

/* ── Geometria ────────────────────────────────────────────────────────────── */

export interface DockGeometry {
  /** Menor altura ÚTIL do dock aberto (abaixo disso não cabe uma linha + a barra). */
  readonly minHeightPx: number;
  /** Teto do dock como fração da altura do contêiner — o editor manda na tela. */
  readonly maxHeightRatio: number;
  /** Altura do dock RECOLHIDO: só a barra de abas continua clicável. */
  readonly collapsedHeightPx: number;
  /** Altura inicial, e o fallback de toda leitura corrompida. */
  readonly defaultHeightPx: number;
  /** Passo das setas na divisória do dock. */
  readonly stepPx: number;
  /** Passo grosso de PageUp/PageDown. */
  readonly coarseStepPx: number;
  /** Teto usado enquanto o contêiner ainda não foi medido. */
  readonly unmeasuredMaxPx: number;
}

export const DOCK_GEOMETRY: DockGeometry = {
  minHeightPx: 140,
  maxHeightRatio: 0.7,
  collapsedHeightPx: 40,
  defaultHeightPx: 260,
  stepPx: 24,
  coarseStepPx: 96,
  unmeasuredMaxPx: 640,
};

/**
 * Movimento do dock. `height` está em `SPATIAL_ALLOWED_PROPERTIES`
 * (designTokens §Movimento), logo curva `spatial`. REGRA: anima recolher/expandir
 * e o passo de teclado; durante o ARRASTE a altura acompanha o ponteiro sem
 * transição.
 */
export const DOCK_MOTION = {
  property: 'height',
  durationMs: MOTION.spatial.normal,
  easing: MOTION.spatial.easing,
} as const;

/** Fronteiras de altura do dock para um contêiner. `min <= max` sempre. */
export interface DockHeightBounds {
  readonly min: number;
  readonly max: number;
  /** O contêiner foi medido (finito e > 0). */
  readonly measured: boolean;
  /** O teto do contêiner ainda comporta `minHeightPx`. */
  readonly feasible: boolean;
}

/**
 * Fronteiras efetivas. Contêiner não medido ⇒ faixa provisória
 * `[minHeightPx, unmeasuredMaxPx]`. Contêiner pequeno demais para o mínimo ⇒ as
 * duas fronteiras colapsam no teto possível (nunca abaixo do recolhido), o que
 * mantém `min <= max` e impede `aria-valuenow` de sair da faixa.
 */
export function dockHeightBounds(
  containerPx?: number,
  geometry: DockGeometry = DOCK_GEOMETRY,
): DockHeightBounds {
  const g = geometry;
  if (typeof containerPx !== 'number' || !Number.isFinite(containerPx) || containerPx <= 0) {
    return {
      min: g.minHeightPx,
      max: Math.max(g.minHeightPx, g.unmeasuredMaxPx),
      measured: false,
      feasible: false,
    };
  }
  const rawMax = Math.floor(containerPx * g.maxHeightRatio);
  if (rawMax <= g.minHeightPx) {
    // Contêiner apertado: as duas fronteiras colapsam no maior valor possível —
    // nunca abaixo da barra recolhida, e NUNCA acima do próprio contêiner (que
    // pode ser menor que a barra num layout degenerado).
    const only = Math.min(Math.max(g.collapsedHeightPx, rawMax), Math.floor(containerPx));
    return { min: only, max: only, measured: true, feasible: false };
  }
  return { min: g.minHeightPx, max: rawMax, measured: true, feasible: true };
}

/** Clampa uma altura nas fronteiras; entrada não-finita cai no default. */
export function clampDockHeight(
  heightPx: number,
  containerPx?: number,
  geometry: DockGeometry = DOCK_GEOMETRY,
): number {
  const bounds = dockHeightBounds(containerPx, geometry);
  const raw = Number.isFinite(heightPx) ? heightPx : geometry.defaultHeightPx;
  const rounded = Math.round(raw);
  if (rounded < bounds.min) return bounds.min;
  if (rounded > bounds.max) return bounds.max;
  return rounded;
}

/* ── Estado ───────────────────────────────────────────────────────────────── */

export interface DockState {
  /** Aba na frente. Uma por vez (VS Code Panel). */
  readonly activeTab: DockTabId;
  /** Gaveta fechada? A altura EXPANDIDA continua guardada em `heightPx`. */
  readonly collapsed: boolean;
  /** Altura do dock ABERTO. Nunca é tocada por collapse/expand. */
  readonly heightPx: number;
  /**
   * CONTRATO DE BUFFER: abas que precisam continuar MONTADAS, mesmo escondidas,
   * mesmo com o dock recolhido. Só cresce, nunca encolhe.
   */
  readonly mountedTabs: readonly DockTabId[];
  /** Abas com novidade que o usuário ainda não viu (marcador na barra). */
  readonly unseen: readonly DockTabId[];
}

/**
 * A aba de Saída nasce montada porque o terminal precisa existir ANTES do
 * primeiro `testAnswer`: quem escreve nele é um ref imperativo, e um ref só
 * existe se o nó estiver no DOM.
 */
export const INITIAL_DOCK_STATE: DockState = {
  activeTab: 'output',
  collapsed: false,
  heightPx: DOCK_GEOMETRY.defaultHeightPx,
  mountedTabs: ['output'],
  unseen: [],
};

/* ── Ações ────────────────────────────────────────────────────────────────── */

export type DockAction =
  /** Intenção do USUÁRIO: clicou na aba. Sempre abre o dock. */
  | { readonly type: 'select'; readonly tab: DockTabId }
  /** Intenção do PROGRAMA (auto-foco). `force` abre o dock recolhido. */
  | { readonly type: 'reveal'; readonly tab: DockTabId; readonly force?: boolean }
  /** Chegou conteúdo numa aba: marca novidade, nunca rouba a frente. */
  | { readonly type: 'notify'; readonly tab: DockTabId }
  /** Limpa o marcador de novidade (de uma aba, ou de todas). */
  | { readonly type: 'seen'; readonly tab?: DockTabId }
  | { readonly type: 'collapse' }
  | { readonly type: 'expand' }
  | { readonly type: 'toggle' }
  /** Arraste/teclado da divisória. IGNORADA com o dock recolhido (contrato 2). */
  | { readonly type: 'resize'; readonly heightPx: number; readonly containerPx?: number }
  /** Hidratação a partir do storage (a leitura acontece depois da montagem). */
  | { readonly type: 'hydrate'; readonly persisted: DockPersistedState };

/* ── Reducer ──────────────────────────────────────────────────────────────── */

function withTabMounted(
  mounted: readonly DockTabId[],
  tab: DockTabId,
): readonly DockTabId[] {
  if (mounted.includes(tab)) return mounted;
  return DOCK_TAB_IDS.filter((id) => id === tab || mounted.includes(id));
}

function withoutUnseen(unseen: readonly DockTabId[], tab: DockTabId): readonly DockTabId[] {
  if (!unseen.includes(tab)) return unseen;
  return unseen.filter((id) => id !== tab);
}

function withUnseen(unseen: readonly DockTabId[], tab: DockTabId): readonly DockTabId[] {
  if (unseen.includes(tab)) return unseen;
  return DOCK_TAB_IDS.filter((id) => id === tab || unseen.includes(id));
}

function settle(previous: DockState, next: DockState): DockState {
  if (
    previous.activeTab === next.activeTab &&
    previous.collapsed === next.collapsed &&
    previous.heightPx === next.heightPx &&
    previous.mountedTabs === next.mountedTabs &&
    previous.unseen === next.unseen
  ) {
    return previous;
  }
  return next;
}

/**
 * Reducer PURO do dock. Devolve o MESMO objeto quando a ação não muda nada —
 * assim `useReducer` não força re-render (e o terminal não repinta) só porque
 * chegou um evento repetido.
 */
export function dockReducer(state: DockState, action: DockAction): DockState {
  switch (action.type) {
    case 'select':
      // Clique do usuário numa aba SEMPRE abre a gaveta — é o comportamento do
      // Panel do VS Code com o painel minimizado.
      return settle(state, {
        ...state,
        activeTab: action.tab,
        collapsed: false,
        mountedTabs: withTabMounted(state.mountedTabs, action.tab),
        unseen: withoutUnseen(state.unseen, action.tab),
      });

    case 'reveal': {
      const opening = !state.collapsed || action.force === true;
      return settle(state, {
        ...state,
        activeTab: action.tab,
        collapsed: opening ? false : state.collapsed,
        mountedTabs: withTabMounted(state.mountedTabs, action.tab),
        // Se a gaveta continua fechada, o usuário não viu nada: acende o
        // marcador em vez de fingir que trouxe a aba para a frente.
        unseen: opening
          ? withoutUnseen(state.unseen, action.tab)
          : withUnseen(state.unseen, action.tab),
      });
    }

    case 'notify': {
      // Conteúdo chegou ⇒ a aba precisa estar montada para recebê-lo.
      const visible = !state.collapsed && state.activeTab === action.tab;
      return settle(state, {
        ...state,
        mountedTabs: withTabMounted(state.mountedTabs, action.tab),
        unseen: visible ? state.unseen : withUnseen(state.unseen, action.tab),
      });
    }

    case 'seen':
      return settle(state, {
        ...state,
        unseen:
          action.tab === undefined
            ? state.unseen.length === 0
              ? state.unseen
              : []
            : withoutUnseen(state.unseen, action.tab),
      });

    case 'collapse':
      // `heightPx` NÃO é tocada: é ela que faz o reabrir voltar para onde estava.
      return settle(state, { ...state, collapsed: true });

    case 'expand':
      return settle(state, {
        ...state,
        collapsed: false,
        unseen: withoutUnseen(state.unseen, state.activeTab),
      });

    case 'toggle':
      return dockReducer(state, state.collapsed ? { type: 'expand' } : { type: 'collapse' });

    case 'resize': {
      // Contrato 2: recolhido, a altura de restauração é intocável.
      if (state.collapsed) return state;
      const heightPx = clampDockHeight(action.heightPx, action.containerPx);
      return settle(state, { ...state, heightPx });
    }

    case 'hydrate': {
      const persisted = action.persisted;
      return settle(state, {
        ...state,
        activeTab: persisted.activeTab,
        collapsed: persisted.collapsed,
        heightPx: clampDockHeight(persisted.heightPx),
        mountedTabs: withTabMounted(
          withTabMounted(state.mountedTabs, 'output'),
          persisted.activeTab,
        ),
      });
    }

    default:
      return state;
  }
}

/* ── Seletores (o que o componente lê) ────────────────────────────────────── */

/**
 * CONTRATO DE BUFFER no JSX: `true` ⇒ o painel da aba tem que estar no DOM,
 * escondido se preciso, NUNCA removido. Desmontar a Saída descarta o buffer do
 * xterm — é exatamente o bug que este módulo existe para tornar impossível.
 */
export function shouldRenderTab(state: DockState, tab: DockTabId): boolean {
  return state.mountedTabs.includes(tab);
}

/** `true` só quando a aba está de fato à vista (dock aberto E aba na frente). */
export function isTabVisible(state: DockState, tab: DockTabId): boolean {
  return !state.collapsed && state.activeTab === tab;
}

/** `true` quando a aba tem novidade não vista (marcador na barra de abas). */
export function hasUnseen(state: DockState, tab: DockTabId): boolean {
  return state.unseen.includes(tab);
}

/** Altura RENDERIZADA: a barra de abas quando recolhido, a altura viva quando aberto. */
export function dockRenderedHeightPx(
  state: DockState,
  containerPx?: number,
  geometry: DockGeometry = DOCK_GEOMETRY,
): number {
  if (state.collapsed) {
    // Nem a barra recolhida pode ultrapassar o contêiner medido.
    if (typeof containerPx === 'number' && Number.isFinite(containerPx) && containerPx > 0) {
      return Math.min(geometry.collapsedHeightPx, Math.floor(containerPx));
    }
    return geometry.collapsedHeightPx;
  }
  return clampDockHeight(state.heightPx, containerPx, geometry);
}

/* ── Teclado da divisória do dock ─────────────────────────────────────────── */

/**
 * Teclas tratadas na divisória do dock. ATENÇÃO À INVERSÃO em relação a
 * `splitRatio`: lá o painel líder é o de CIMA, aqui o painel líder é o DOCK, que
 * fica EMBAIXO. A APG fala do traço — "Up Arrow: Moves a horizontal splitter up"
 * — e mover o traço para cima faz o dock CRESCER.
 */
export const DOCK_DIVIDER_KEYS: readonly string[] = [
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Enter',
];

/**
 * Tecla → ação do dock, ou `null` quando a tecla não é tratada (a onda 3 só
 * chama `preventDefault()` quando veio ação).
 *
 * `Enter` é o `Enter` da APG e a razão de ele existir aqui e NÃO no split-pane:
 * "If the primary pane is not collapsed, collapses the pane. If the pane is
 * collapsed, restores the splitter to its previous position" — restaurar a
 * posição anterior é exatamente `heightPx` preservada.
 *
 * Com o dock RECOLHIDO, qualquer tecla de movimento vira `expand`: sem isso a
 * divisória ficaria focável e inerte, e a operação por teclado morreria no
 * estado recolhido.
 */
export function dockActionForKey(
  key: string,
  state: DockState,
  containerPx?: number,
  geometry: DockGeometry = DOCK_GEOMETRY,
): DockAction | null {
  if (key === 'Enter') return { type: 'toggle' };
  if (!DOCK_DIVIDER_KEYS.includes(key)) return null;
  if (state.collapsed) return { type: 'expand' };
  const bounds = dockHeightBounds(containerPx, geometry);
  const current = clampDockHeight(state.heightPx, containerPx, geometry);
  switch (key) {
    case 'ArrowUp':
      return { type: 'resize', heightPx: current + geometry.stepPx, containerPx };
    case 'ArrowDown':
      return { type: 'resize', heightPx: current - geometry.stepPx, containerPx };
    case 'PageUp':
      return { type: 'resize', heightPx: current + geometry.coarseStepPx, containerPx };
    case 'PageDown':
      return { type: 'resize', heightPx: current - geometry.coarseStepPx, containerPx };
    case 'Home':
      return { type: 'resize', heightPx: bounds.min, containerPx };
    case 'End':
      return { type: 'resize', heightPx: bounds.max, containerPx };
    default:
      return null;
  }
}

/** Altura do dock a partir da coordenada Y do ponteiro (arraste da divisória). */
export function dockHeightFromPointer(
  pointerY: number,
  containerBottomY: number,
  containerPx?: number,
  geometry: DockGeometry = DOCK_GEOMETRY,
): number {
  if (!Number.isFinite(pointerY) || !Number.isFinite(containerBottomY)) {
    return clampDockHeight(geometry.defaultHeightPx, containerPx, geometry);
  }
  return clampDockHeight(containerBottomY - pointerY, containerPx, geometry);
}

/** Valores ARIA da divisória do dock (`role="separator"`, orientação horizontal). */
export interface DockAriaValues {
  readonly valueNow: number;
  readonly valueMin: number;
  readonly valueMax: number;
  /** `aria-orientation` do TRAÇO — o do dock é horizontal (o valor implícito). */
  readonly orientation: 'horizontal';
}

/**
 * Posição da divisória em % do contêiner, medindo o painel LÍDER — que aqui é o
 * DOCK. `valueMin` é a posição do dock RECOLHIDO (é a menor posição alcançável,
 * já que o `Enter` da APG colapsa), `valueMax` é o teto de altura.
 */
export function dockAriaValues(
  state: DockState,
  containerPx?: number,
  geometry: DockGeometry = DOCK_GEOMETRY,
): DockAriaValues {
  const bounds = dockHeightBounds(containerPx, geometry);
  const rendered = dockRenderedHeightPx(state, containerPx, geometry);
  if (typeof containerPx !== 'number' || !Number.isFinite(containerPx) || containerPx <= 0) {
    const denominator = Math.max(1, bounds.max);
    const now = Math.round((rendered / denominator) * 100);
    return {
      valueNow: now < 0 ? 0 : now > 100 ? 100 : now,
      valueMin: 0,
      valueMax: 100,
      orientation: 'horizontal',
    };
  }
  // Piso e teto ANUNCIADOS têm que conter a posição atual em qualquer contêiner,
  // inclusive no degenerado onde nem a barra recolhida cabe — senão
  // `aria-valuenow` sai da faixa que o próprio elemento declara.
  const floorPx = Math.min(geometry.collapsedHeightPx, bounds.min);
  const ceilingPx = Math.max(bounds.max, floorPx);
  const nowPx = Math.min(Math.max(rendered, floorPx), ceilingPx);
  return {
    valueNow: Math.round((nowPx / containerPx) * 100),
    valueMin: Math.round((floorPx / containerPx) * 100),
    valueMax: Math.round((ceilingPx / containerPx) * 100),
    orientation: 'horizontal',
  };
}

/* ── Auto-foco por evento (transição NOMEADA, não efeito colateral) ───────── */

/**
 * Eventos do ciclo do desafio que o dock escuta. `test:*` vem do
 * `test-answer-event` do main (ver src/lib/testAnswerEvents.ts); `feedback:*`
 * vem do streaming do pi na ChallengeView.
 */
export type DockSignal =
  | 'test:started'
  | 'test:passed'
  | 'test:failed'
  | 'feedback:started'
  | 'feedback:done'
  | 'output:appended';

export const DOCK_SIGNALS: readonly DockSignal[] = [
  'test:started',
  'test:passed',
  'test:failed',
  'feedback:started',
  'feedback:done',
  'output:appended',
];

/**
 * Mapa evento → ação. É AQUI que o auto-foco acontece, num lugar só e puro —
 * nada de `setActiveTab` espalhado por effects.
 *
 *   test:started     → reveal('output', force) — o usuário ACABOU de clicar em
 *                      "Testar resposta"; abrir a gaveta é obedecer, não invadir.
 *   test:passed|failed → reveal('tests') — traz o veredito para a frente, mas
 *                      respeita quem fechou a gaveta de propósito (vira marcador).
 *   feedback:started → notify('feedback') — o pi começou a pensar; o usuário
 *                      ainda está lendo a falha do teste. Só marca.
 *   feedback:done    → reveal('feedback') — é a resposta da pergunta que o
 *                      usuário fez ao clicar em testar; vale a frente do palco.
 *   output:appended  → notify('output') — saída pingando não muda o foco.
 */
export function dockActionForSignal(signal: DockSignal | string): DockAction | null {
  switch (signal) {
    case 'test:started':
      return { type: 'reveal', tab: 'output', force: true };
    case 'test:passed':
    case 'test:failed':
      return { type: 'reveal', tab: 'tests' };
    case 'feedback:started':
      return { type: 'notify', tab: 'feedback' };
    case 'feedback:done':
      return { type: 'reveal', tab: 'feedback' };
    case 'output:appended':
      return { type: 'notify', tab: 'output' };
    default:
      return null;
  }
}

/* ── Persistência ─────────────────────────────────────────────────────────── */

/** O que sobrevive entre sessões. `mountedTabs`/`unseen` são de runtime. */
export interface DockPersistedState {
  readonly activeTab: DockTabId;
  readonly collapsed: boolean;
  readonly heightPx: number;
}

export const DOCK_STORAGE_KEY = 'study-method-challenge-dock-v1';
export const DOCK_STORAGE_VERSION = 1;

/** Default são de toda leitura que falhar. */
export const DEFAULT_DOCK_PERSISTED: DockPersistedState = {
  activeTab: 'output',
  collapsed: false,
  heightPx: DOCK_GEOMETRY.defaultHeightPx,
};

/** Fronteira mínima de storage (ver a justificativa em src/lib/splitRatio.ts). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStorage(injected?: StorageLike | null): StorageLike | null {
  if (injected !== undefined) return injected;
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Lê o estado persistido. NUNCA lança. Tolerância por CAMPO: aba desconhecida
 * não faz o usuário perder a altura ajustada. `version` diferente descarta o
 * payload inteiro — aí a FORMA mudou, e adivinhar campos de outro formato é
 * pior do que recomeçar.
 */
export function readDockPersistedState(storage?: StorageLike | null): DockPersistedState {
  const ls = resolveStorage(storage);
  if (!ls) return DEFAULT_DOCK_PERSISTED;
  let raw: string | null = null;
  try {
    raw = ls.getItem(DOCK_STORAGE_KEY);
  } catch {
    return DEFAULT_DOCK_PERSISTED;
  }
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_DOCK_PERSISTED;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_DOCK_PERSISTED;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_DOCK_PERSISTED;
  const payload = parsed as {
    version?: unknown;
    activeTab?: unknown;
    collapsed?: unknown;
    heightPx?: unknown;
  };
  if (payload.version !== DOCK_STORAGE_VERSION) return DEFAULT_DOCK_PERSISTED;
  const activeTab = isDockTabId(payload.activeTab)
    ? payload.activeTab
    : DEFAULT_DOCK_PERSISTED.activeTab;
  const collapsed =
    typeof payload.collapsed === 'boolean' ? payload.collapsed : DEFAULT_DOCK_PERSISTED.collapsed;
  const heightPx =
    typeof payload.heightPx === 'number' && Number.isFinite(payload.heightPx)
      ? clampDockHeight(payload.heightPx)
      : DEFAULT_DOCK_PERSISTED.heightPx;
  return { activeTab, collapsed, heightPx };
}

/** Recorte persistível de um estado vivo. */
export function toDockPersistedState(state: DockState): DockPersistedState {
  return {
    activeTab: state.activeTab,
    collapsed: state.collapsed,
    heightPx: clampDockHeight(state.heightPx),
  };
}

/** Grava o estado. Silenciosa por desenho (ver src/lib/splitRatio.ts). */
export function writeDockPersistedState(
  state: DockState | DockPersistedState,
  storage?: StorageLike | null,
): void {
  const ls = resolveStorage(storage);
  if (!ls) return;
  const payload: DockPersistedState = {
    activeTab: isDockTabId(state.activeTab) ? state.activeTab : DEFAULT_DOCK_PERSISTED.activeTab,
    collapsed: state.collapsed === true,
    heightPx: clampDockHeight(state.heightPx),
  };
  try {
    ls.setItem(DOCK_STORAGE_KEY, JSON.stringify({ version: DOCK_STORAGE_VERSION, ...payload }));
  } catch {
    /* preferência de layout é descartável */
  }
}

/** Esquece o estado persistido. */
export function clearDockPersistedState(storage?: StorageLike | null): void {
  const ls = resolveStorage(storage);
  if (!ls) return;
  try {
    ls.removeItem(DOCK_STORAGE_KEY);
  } catch {
    /* idem */
  }
}

/**
 * Estado inicial, opcionalmente hidratado. Passe o resultado de
 * `readDockPersistedState()` — ou nada, para o default.
 */
export function createDockState(persisted?: DockPersistedState | null): DockState {
  if (!persisted) return INITIAL_DOCK_STATE;
  return dockReducer(INITIAL_DOCK_STATE, { type: 'hydrate', persisted });
}
