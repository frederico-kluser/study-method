/**
 * src/lib/splitRatio.ts — MATEMÁTICA PURA do split-pane do Desafio (sem DOM).
 *
 * A tela de Desafio deixa de ser uma pilha de três `Paper` e vira um SPLIT-PANE
 * real: enunciado ⟷ editor, divisória arrastável, razão persistida
 * (docs/ux-redesign.md §7.3). Este módulo é TODA a aritmética dessa divisória —
 * clamp, conversão razão⟷px, passo de teclado, valores ARIA e persistência — de
 * modo que o componente da onda 3 seja só marcação, ref e eventos.
 *
 * POR QUE PURO: a ChallengeView tem 733 linhas e já carrega o IPC do
 * `testAnswer`, o streaming do pi com `sessionId`/abort, o ref imperativo do
 * terminal e três alvos de onboarding. A matemática do split chega lá pronta e
 * testada em node:test SEM jsdom — zero React, zero DOM, zero MUI aqui dentro.
 *
 * VOCABULÁRIO (fixado para não sobrar ambiguidade na onda 3):
 *   - `ratio` é SEMPRE a fração do painel LÍDER — o da esquerda numa divisória
 *     vertical, o de cima numa horizontal. Nesta tela: o ENUNCIADO.
 *   - `containerPx` é o eixo INTEIRO disponível, divisória incluída.
 *   - `usablePx = containerPx - dividerPx` é o que sobra para os dois painéis.
 *
 * ── DECISÕES, E DE ONDE ELAS VÊM ─────────────────────────────────────────────
 *
 * 1. PISO EM PIXEL POR PAINEL, não só piso de razão. Um painel que some é um
 *    painel que o usuário NÃO traz de volta com o mouse — não sobra alça para
 *    agarrar. Precedente documentado: ServiceNow Horizon (Resizable Panes) —
 *    "A minimum width can be configured that prevents the user from sizing the
 *    slot lower than a ratio and/or pixel value"; Kendo Splitter (min/max por
 *    painel, aceitando px E %); shadcn/ReUI Resizable — "Set minSize and maxSize
 *    on each panel to prevent collapse or excessive expansion". Por isso
 *    `splitBounds()` CRUZA os dois limites e devolve as fronteiras efetivas: é
 *    delas que saem `aria-valuemin`/`aria-valuemax`, e não das constantes cruas.
 *
 * 2. PERSISTE RAZÃO, NUNCA PIXEL. Precedente direto: react-resizable-panels,
 *    CHANGELOG — "Change local storage key for persisted sizes to avoid
 *    restoring pixel-based sizes (#233)". Uma janela Electron muda de tamanho
 *    entre sessões: px guardado volta errado, razão volta certa.
 *
 * 3. TECLADO COMPLETO — é o que faz a pergunta "a divisória é arrastável por
 *    teclado?" ter resposta verificável. WAI-ARIA APG, Window Splitter Pattern:
 *      "Left Arrow: Moves a vertical splitter to the left. Right Arrow: Moves a
 *       vertical splitter to the right. Up Arrow: Moves a horizontal splitter
 *       up. Down Arrow: Moves a horizontal splitter down."
 *      "Home (Optional): Moves splitter to the position that gives the primary
 *       pane its smallest allowed size."
 *      "End (Optional): Moves splitter to the position that gives the primary
 *       pane its largest allowed size."
 *    `nextRatioForKey()` implementa exatamente isso e devolve `null` para toda
 *    tecla que NÃO trata — assim a onda 3 só chama `preventDefault()` quando de
 *    fato consumiu a tecla, e não sequestra Tab/atalhos do editor.
 *    `PageUp`/`PageDown` (passo grosso) são ADIÇÃO nossa, fora da APG.
 *
 * 4. `Enter` NÃO é tratado aqui, e isso é deliberado. A APG define
 *    "Enter: If the primary pane is not collapsed, collapses the pane. If the
 *    pane is collapsed, restores the splitter to its previous position" — só que
 *    o painel principal DESTA divisória é o ENUNCIADO, e o contrato de
 *    informação do redesign diz o contrário: as VS Code UX Guidelines mandam
 *    para o dock o que "provides supporting functionality" e PROÍBEM lá o que
 *    "is meant to be always visible since users often minimize the Panel". O
 *    enunciado é justamente o que precisa estar sempre visível
 *    (docs/ux-redesign.md §7.2) — logo, nunca colapsa. Quem colapsa e restaura
 *    nesta tela é o DOCK, e lá o `Enter` da APG ESTÁ implementado
 *    (src/lib/dockState.ts, `dockActionForKey`).
 *
 * 5. RTL fora de escopo: os dois locales embutidos (pt-BR, en) são LTR.
 *
 * 6. LEITURA TOLERANTE A LIXO, e ela cai no DEFAULT (não clampa). Valor ausente,
 *    JSON quebrado, versão errada, tipo errado, não-finito, FORA DE FAIXA, ou
 *    `localStorage` que lança na leitura: tudo vira `DEFAULT_SPLIT_RATIO`, e
 *    nada nunca lança. Alternativa considerada e recusada: clampar o valor fora
 *    de faixa para a fronteira mais próxima — preservaria melhor a intenção do
 *    usuário se as constantes mudassem entre versões, mas as fronteiras deste
 *    módulo são constantes, então um valor fora de faixa só chega aqui por
 *    corrupção, e para corrupção o default é a resposta honesta.
 *
 * Testado em tests/splitRatio.test.ts (node:test, sem jsdom).
 */
import { MOTION } from './designTokens';

/**
 * Orientação da DIVISÓRIA (o traço), não do arranjo dos painéis — é a mesma
 * convenção do `aria-orientation` de `role="separator"`, cujo valor implícito é
 * `horizontal` (MDN: "Elements with the role separator have an implicit
 * aria-orientation value of horizontal"). Painéis lado a lado ⇒ traço VERTICAL.
 */
export type SplitOrientation = 'vertical' | 'horizontal';

/** Limites geométricos da divisória. Todos em fração (0..1), exceto os `*Px`. */
export interface SplitConstraints {
  /** Piso da razão do painel líder (antes do cruzamento com `minPanePx`). */
  readonly minRatio: number;
  /** Teto da razão do painel líder. */
  readonly maxRatio: number;
  /** Tamanho mínimo, em px, de CADA painel — o que impede o sumiço. */
  readonly minPanePx: number;
  /** Espessura da divisória; sai do espaço distribuível. */
  readonly dividerPx: number;
  /** Passo das setas (fração do contêiner por tecla). */
  readonly stepRatio: number;
  /** Passo grosso de PageUp/PageDown. */
  readonly coarseStepRatio: number;
}

/**
 * Constantes do split enunciado ⟷ editor.
 *   - `minPanePx: 280` — piso de leitura para a prosa e de código para o editor;
 *     abaixo disso o CodeMirror vira uma coluna de uma palavra.
 *   - `stepRatio: 0.02` — ~24 px por seta num contêiner de 1200 px: move de
 *     verdade sem exigir trinta toques para atravessar a tela.
 *   - `dividerPx: 8` — alvo de mouse confortável sem virar uma barra.
 */
export const SPLIT_CONSTRAINTS: SplitConstraints = {
  minRatio: 0.2,
  maxRatio: 0.8,
  minPanePx: 280,
  dividerPx: 8,
  stepRatio: 0.02,
  coarseStepRatio: 0.1,
};

/**
 * Razão inicial: o editor nasce um pouco maior que o enunciado, porque linha de
 * código é mais larga que linha de prosa (a prosa tem teto de medida em 72ch —
 * `TYPE.measureCh` — e não ganha nada em ficar mais larga que isso).
 */
export const DEFAULT_SPLIT_RATIO = 0.45;

/** Casas decimais mantidas na razão — corta a deriva de float do arraste. */
export const SPLIT_RATIO_PRECISION = 4;

/** Ids estáveis para `aria-controls`/`aria-labelledby` da onda 3. */
export const SPLIT_PRIMARY_PANE_ID = 'challenge-statement-pane';
export const SPLIT_SECONDARY_PANE_ID = 'challenge-editor-pane';
export const SPLIT_DIVIDER_ID = 'challenge-split-divider';

/** Chaves i18n já presentes nos dois locales (`challenge.split.*`). */
export const SPLIT_ARIA_I18N_KEY = 'translation:challenge.split.aria' as const;
export const SPLIT_HINT_I18N_KEY = 'translation:challenge.split.hint' as const;
export const SPLIT_PRIMARY_LABEL_I18N_KEY = 'translation:challenge.statementPane' as const;
export const SPLIT_SECONDARY_LABEL_I18N_KEY = 'translation:challenge.editorPane' as const;

/**
 * Movimento do split. `flex-basis` está em `SPATIAL_ALLOWED_PROPERTIES`
 * (designTokens §Movimento), então usa a curva `spatial`. REGRA DE USO: anima
 * só o passo de TECLADO; durante o arraste a razão segue o ponteiro sem
 * transição, senão a divisória "nada" atrás do mouse.
 */
export const SPLIT_MOTION = {
  property: 'flex-basis',
  durationMs: MOTION.spatial.fast,
  easing: MOTION.spatial.easing,
} as const;

/** Arredonda a razão para `SPLIT_RATIO_PRECISION` casas. */
export function roundSplitRatio(ratio: number): number {
  const factor = 10 ** SPLIT_RATIO_PRECISION;
  return Math.round(ratio * factor) / factor;
}

function clampToRange(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Fronteiras EFETIVAS da razão, já cruzando piso de razão com piso em px. */
export interface SplitBounds {
  /** Menor razão permitida ao painel líder — vira `aria-valuemin`. */
  readonly min: number;
  /** Maior razão permitida ao painel líder — vira `aria-valuemax`. */
  readonly max: number;
  /** `containerPx` foi medido (finito e > 0). Falso antes do primeiro layout. */
  readonly measured: boolean;
  /** Cabe `minPanePx` nos DOIS painéis ao mesmo tempo. */
  readonly feasible: boolean;
  /** Espaço distribuível entre os painéis (contêiner menos a divisória). */
  readonly usablePx: number;
}

/**
 * Fronteiras efetivas para um contêiner de `containerPx`.
 *
 * - contêiner NÃO medido (0, negativo, NaN): devolve as fronteiras de razão
 *   cruas — antes do primeiro layout não há px para verificar, e travar a razão
 *   em 0.5 aqui faria a tela "pular" no primeiro frame;
 * - contêiner medido e viável: `min = max(minRatio, minPanePx/usable)` e
 *   `max = min(maxRatio, 1 - minPanePx/usable)`;
 * - contêiner medido e INVIÁVEL (não cabe `minPanePx` dos dois lados): as duas
 *   fronteiras colapsam no MEIO. Quando ninguém pode ter o mínimo, dividir em
 *   partes iguais é a degradação justa — e mantém `min <= max` sempre, que é o
 *   que impede `aria-valuenow` de sair da faixa.
 */
export function splitBounds(
  containerPx: number,
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): SplitBounds {
  const c = constraints;
  if (!Number.isFinite(containerPx) || containerPx <= 0) {
    return { min: c.minRatio, max: c.maxRatio, measured: false, feasible: false, usablePx: 0 };
  }
  const usablePx = Math.max(0, containerPx - c.dividerPx);
  if (usablePx <= 0) {
    const mid = clampToRange(0.5, c.minRatio, c.maxRatio);
    return { min: mid, max: mid, measured: true, feasible: false, usablePx: 0 };
  }
  const pxFloor = c.minPanePx / usablePx;
  const min = Math.max(c.minRatio, pxFloor);
  const max = Math.min(c.maxRatio, 1 - pxFloor);
  if (min > max) {
    const mid = clampToRange(0.5, c.minRatio, c.maxRatio);
    return { min: mid, max: mid, measured: true, feasible: false, usablePx };
  }
  return { min, max, measured: true, feasible: true, usablePx };
}

/**
 * Clampa uma razão nas fronteiras efetivas do contêiner. Entrada não-finita cai
 * no default (também clampado) — nunca devolve NaN, nunca lança.
 */
export function clampSplitRatio(
  ratio: number,
  containerPx: number,
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): number {
  const bounds = splitBounds(containerPx, constraints);
  if (!Number.isFinite(ratio)) {
    return clampToRange(DEFAULT_SPLIT_RATIO, bounds.min, bounds.max);
  }
  return clampToRange(roundSplitRatio(ratio), bounds.min, bounds.max);
}

/** Repartição em pixels inteiros — o que a onda 3 põe no estilo dos painéis. */
export interface SplitPixels {
  /** Razão efetivamente aplicada (já clampada). */
  readonly ratio: number;
  /** Painel líder (enunciado). */
  readonly primaryPx: number;
  /** Painel seguidor (editor). */
  readonly secondaryPx: number;
  /** Espessura da divisória (ecoada para o layout somar exato). */
  readonly dividerPx: number;
}

/**
 * Razão → pixels. `primaryPx` arredonda e `secondaryPx` sai por SUBTRAÇÃO, para
 * que `primaryPx + secondaryPx + dividerPx === containerPx` exatamente e não
 * sobre um fio de fundo entre os painéis.
 */
export function ratioToPx(
  ratio: number,
  containerPx: number,
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): SplitPixels {
  const c = constraints;
  const bounds = splitBounds(containerPx, c);
  const applied = clampSplitRatio(ratio, containerPx, c);
  if (!bounds.measured) {
    return { ratio: applied, primaryPx: 0, secondaryPx: 0, dividerPx: c.dividerPx };
  }
  const primaryPx = Math.round(bounds.usablePx * applied);
  return {
    ratio: applied,
    primaryPx,
    secondaryPx: bounds.usablePx - primaryPx,
    dividerPx: c.dividerPx,
  };
}

/** Pixels do painel líder → razão clampada. */
export function pxToRatio(
  primaryPx: number,
  containerPx: number,
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): number {
  const bounds = splitBounds(containerPx, constraints);
  if (!bounds.measured || bounds.usablePx <= 0 || !Number.isFinite(primaryPx)) {
    return clampSplitRatio(DEFAULT_SPLIT_RATIO, containerPx, constraints);
  }
  return clampSplitRatio(primaryPx / bounds.usablePx, containerPx, constraints);
}

/**
 * Coordenada do ponteiro → razão. `pointerPx` e `containerOriginPx` estão no
 * MESMO eixo e no mesmo sistema (clientX/left para vertical, clientY/top para
 * horizontal). O ponteiro fica no CENTRO da divisória, então o painel líder
 * termina meia divisória antes dele.
 */
export function ratioFromPointer(
  pointerPx: number,
  containerOriginPx: number,
  containerPx: number,
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): number {
  const c = constraints;
  if (!Number.isFinite(pointerPx) || !Number.isFinite(containerOriginPx)) {
    return clampSplitRatio(DEFAULT_SPLIT_RATIO, containerPx, c);
  }
  return pxToRatio(pointerPx - containerOriginPx - c.dividerPx / 2, containerPx, c);
}

/** Teclas que `nextRatioForKey` trata, por orientação da divisória. */
export const SPLIT_KEYS: Readonly<
  Record<SplitOrientation, { readonly decrease: string; readonly increase: string }>
> = {
  vertical: { decrease: 'ArrowLeft', increase: 'ArrowRight' },
  horizontal: { decrease: 'ArrowUp', increase: 'ArrowDown' },
};

/** Opções do passo de teclado. */
export interface SplitKeyOptions {
  /** Default `'vertical'` (o split enunciado ⟷ editor). */
  readonly orientation?: SplitOrientation;
  readonly constraints?: SplitConstraints;
}

/**
 * Próxima razão para uma tecla — ou `null` quando a tecla NÃO é tratada (aí a
 * onda 3 não chama `preventDefault()`).
 *
 * Setas movem um passo; `PageUp`/`PageDown` movem o passo grosso; `Home` e `End`
 * vão para as fronteiras efetivas (menor e maior tamanho permitido ao painel
 * líder, exatamente como a APG descreve). Nas fronteiras a tecla continua sendo
 * tratada e a razão simplesmente não passa — nunca escapa da faixa.
 */
export function nextRatioForKey(
  key: string,
  ratio: number,
  containerPx: number,
  options: SplitKeyOptions = {},
): number | null {
  const orientation = options.orientation ?? 'vertical';
  const c = options.constraints ?? SPLIT_CONSTRAINTS;
  const keys = SPLIT_KEYS[orientation];
  const bounds = splitBounds(containerPx, c);
  const current = clampSplitRatio(ratio, containerPx, c);
  if (key === keys.decrease) return clampSplitRatio(current - c.stepRatio, containerPx, c);
  if (key === keys.increase) return clampSplitRatio(current + c.stepRatio, containerPx, c);
  if (key === 'PageUp') return clampSplitRatio(current - c.coarseStepRatio, containerPx, c);
  if (key === 'PageDown') return clampSplitRatio(current + c.coarseStepRatio, containerPx, c);
  if (key === 'Home') return bounds.min;
  if (key === 'End') return bounds.max;
  return null;
}

/** O que a onda 3 despeja nos atributos do `role="separator"`. */
export interface SplitAriaValues {
  /** `aria-valuenow` — posição atual, em % do contêiner (inteiro). */
  readonly valueNow: number;
  /** `aria-valuemin` — posição de tamanho MÍNIMO do painel líder. */
  readonly valueMin: number;
  /** `aria-valuemax` — posição de tamanho MÁXIMO do painel líder. */
  readonly valueMax: number;
  /** `aria-orientation` — orientação do TRAÇO. */
  readonly orientation: SplitOrientation;
}

/**
 * Valores ARIA da divisória, em porcentagem inteira.
 *
 * A APG exige `aria-valuenow` "set to a decimal value representing the current
 * position of the separator", `aria-valuemin` "the position where the primary
 * pane has its minimum size" e `aria-valuemax` "...its maximum size" — por isso
 * min/max saem de `splitBounds()` (fronteiras EFETIVAS, com o piso em px), e não
 * das constantes cruas: anunciar 20 quando o piso real é 28 é mentir para o
 * leitor de tela. `valueNow` é clampado ANTES de arredondar; como o
 * arredondamento é monotônico, `valueMin <= valueNow <= valueMax` vale sempre.
 */
export function splitAriaValues(
  ratio: number,
  containerPx: number,
  orientation: SplitOrientation = 'vertical',
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): SplitAriaValues {
  const bounds = splitBounds(containerPx, constraints);
  const now = clampSplitRatio(ratio, containerPx, constraints);
  return {
    valueNow: Math.round(now * 100),
    valueMin: Math.round(bounds.min * 100),
    valueMax: Math.round(bounds.max * 100),
    orientation,
  };
}

/* ── Persistência ─────────────────────────────────────────────────────────── */

/** Chave de `localStorage` da razão. O `-v1` é o portão de migração. */
export const SPLIT_RATIO_STORAGE_KEY = 'study-method-challenge-split-v1';

/** Versão do payload persistido. */
export const SPLIT_RATIO_STORAGE_VERSION = 1;

/**
 * Fronteira mínima de storage — só o que este módulo usa. Existe para que o
 * teste rode em node:test SEM jsdom: ou injeta-se um fake, ou passa-se `null`
 * para simular "sem storage".
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * `undefined` (argumento omitido) = usar `globalThis.localStorage`;
 * `null` explícito = não há storage. O acesso vai em try/catch porque em modo
 * privado/sandbox o próprio GETTER de `localStorage` pode lançar.
 */
function resolveStorage(injected?: StorageLike | null): StorageLike | null {
  if (injected !== undefined) return injected;
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Lê a razão persistida. NUNCA lança e NUNCA devolve algo fora da faixa de
 * razão: ausente, JSON quebrado, versão desconhecida, tipo errado, não-finito,
 * fora de faixa ou storage que lança ⇒ `DEFAULT_SPLIT_RATIO`.
 *
 * Note que o clamp aqui usa só as fronteiras de RAZÃO: o piso em px depende do
 * contêiner, que na hidratação ainda não foi medido. O cruzamento com px
 * acontece no primeiro layout, via `clampSplitRatio(ratio, containerPx)`.
 */
export function readSplitRatio(
  storage?: StorageLike | null,
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): number {
  const ls = resolveStorage(storage);
  if (!ls) return DEFAULT_SPLIT_RATIO;
  let raw: string | null = null;
  try {
    raw = ls.getItem(SPLIT_RATIO_STORAGE_KEY);
  } catch {
    return DEFAULT_SPLIT_RATIO;
  }
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_SPLIT_RATIO;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SPLIT_RATIO;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SPLIT_RATIO;
  const payload = parsed as { version?: unknown; ratio?: unknown };
  if (payload.version !== SPLIT_RATIO_STORAGE_VERSION) return DEFAULT_SPLIT_RATIO;
  const ratio = payload.ratio;
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  if (ratio < constraints.minRatio || ratio > constraints.maxRatio) return DEFAULT_SPLIT_RATIO;
  return roundSplitRatio(ratio);
}

/**
 * Grava a razão. Silenciosa por desenho: preferência de layout que não salvou
 * não merece um console.warn no caminho do arraste (o `setItem` pode lançar por
 * quota ou por modo privado). Valor não-finito NÃO é gravado — melhor manter o
 * valor bom anterior do que trocá-lo por lixo.
 */
export function writeSplitRatio(
  ratio: number,
  storage?: StorageLike | null,
  constraints: SplitConstraints = SPLIT_CONSTRAINTS,
): void {
  if (!Number.isFinite(ratio)) return;
  const ls = resolveStorage(storage);
  if (!ls) return;
  const safe = roundSplitRatio(clampToRange(ratio, constraints.minRatio, constraints.maxRatio));
  try {
    ls.setItem(
      SPLIT_RATIO_STORAGE_KEY,
      JSON.stringify({ version: SPLIT_RATIO_STORAGE_VERSION, ratio: safe }),
    );
  } catch {
    /* preferência de layout é descartável — nunca derruba o arraste */
  }
}

/** Esquece a razão persistida (volta ao default no próximo boot). */
export function clearSplitRatio(storage?: StorageLike | null): void {
  const ls = resolveStorage(storage);
  if (!ls) return;
  try {
    ls.removeItem(SPLIT_RATIO_STORAGE_KEY);
  } catch {
    /* idem */
  }
}
