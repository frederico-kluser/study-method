/**
 * src/theme.ts — tema Material UI v9.3.1 do Study Method, identidade "Cartucho".
 *
 * ─── O QUE ESTE ARQUIVO É ──────────────────────────────────────────────────
 * A TRADUÇÃO do contrato congelado `src/lib/designTokens.ts` para a linguagem do
 * MUI. Ele NÃO decide cor, tempo nem tamanho de corpo: todo hex, toda duração e
 * todo easing vêm de `designTokens.ts` (origem em `docs/ux-redesign.md`, com os
 * cálculos reproduzíveis em `docs/ux-redesign/`).
 *
 * REGRA DURA: nenhum literal hexadecimal mora neste arquivo. Se um valor de cor
 * não existe em `designTokens.ts`, ele não entra no produto. O teste
 * `tests/theme.test.ts` mede o contraste de cada par que este tema produz.
 *
 * ─── DECISÃO 1: o acento tem DOIS papéis, não um ───────────────────────────
 * O erro clássico que este redesign existe para corrigir é usar `primary.main`
 * como cor de LINK: o valor calibrado para ser FUNDO de botão (com tinta clara
 * por cima) quase nunca alcança 4,5:1 quando vira TEXTO sobre a superfície do
 * app. Por isso cada família de acento expõe CINCO valores, vindos do
 * `AccentPair` do contrato:
 *   - `main`        = o preenchimento (idêntico a `fill`, para o MUI nativo);
 *   - `contrastText`= a tinta que vai EM CIMA do preenchimento (= `onFill`);
 *   - `accentText`  = o acento legível como TEXTO/LINK nos níveis 0, 1 e 2;
 *   - `fill`/`onFill` = os mesmos valores de `main`/`contrastText`, nomeados
 *     pelo papel, para quem lê o tema sem conhecer a convenção do MUI.
 * As variantes `text`/`outlined` do MuiButton e o MuiLink são reapontados para
 * `accentText` justamente para que o default do MUI deixe de reprovar AA.
 *
 * FRONTEIRA QUE O CONTRATO IMPÕE (e que este arquivo não pode contornar sem
 * inventar hex): `accentText` é válido nos NÍVEIS 0, 1 e 2 — fundo do app,
 * cartão de leitura e painel afundado. Foi recalibrado contra o nível 2 (o mais
 * exigente dos três) justamente porque `<Link>` dentro de `<Paper>` já existe
 * nesta base (LessonView, lista de fontes) e a calibração antiga, feita só
 * contra o nível 0, caía a 4,07:1 no nível 1 do escuro.
 * Nos níveis 3 e 4 — o CHROME (rail, dock, estado selecionado) — texto é TINTA
 * (`text.primary`/`text.secondary`); ali o acento aparece como preenchimento,
 * ícone ou borda, papéis cujo piso é 3:1, não 4,5:1. `palette.nonText` tem a
 * fronteira ainda mais apertada: só alcança 3:1 nos níveis 0 e 1, e é por isso
 * que o anel de foco daqui é de DUAS cores.
 *
 * ─── DECISÃO 1b: erro NÃO é o vermelho da ação ─────────────────────────────
 * `error` tem família PRÓPRIA no contrato (carmim, matiz 338), a 30° do
 * vermelho-laranja da `action` (matiz 8). Enquanto os dois compartilhavam
 * `accents.action`, `error.main` era byte-idêntico a `primary.main` — e este app
 * tem exclusão real (`editor.confirmDelete`, `challenge.confirmDelete`): um
 * "Apagar" com exatamente a cor do "Testar resposta" é risco de usabilidade,
 * não risco semântico abstrato.
 *
 * ─── DECISÃO 2: elevação por COR, não por sombra ───────────────────────────
 * A rampa tonal de superfície (níveis 0–4) entra como slot de paleta
 * customizado `palette.surface`, porque rail, dock e menus precisam dos níveis
 * 2–4 e o MUI só oferece `background.default`/`background.paper` (níveis 0 e 1).
 * Prosa longa e código só nos níveis 0 e 1 — do 3 em diante a tinta secundária
 * deixa de alcançar 7:1 (regra 3 do contrato).
 *
 * ─── DECISÃO 2b: a escala tipográfica é PINADA INTEIRA ────────────────────
 * `typography.fontSize: 16` re-baseia o coeficiente de rem do MUI de 14/14 = 1
 * para 16/14 = 1,142857 — ou seja, TODA variante não pinada infla +14,29%. Com
 * só h1–h4 pinadas, `h5` saía a 27,43px contra os 25px de `h4`: a escala ficava
 * INVERTIDA, e um `variant="h5" component="h2"` renderizava maior que o
 * `variant="h4" component="h1"` logo acima dele. Por isso as TREZE variantes de
 * texto (h1–h6, subtitle1/2, body1/2, button, caption, overline) têm tamanho
 * explícito: nenhuma depende do coeficiente.
 *
 * Os tamanhos saem da MESMA escala modular de terça maior (razão 1,25) sobre
 * `TYPE.bodySize`, do passo +5 ao passo −1:
 *   h1 49 · h2 39 · h3 31 · h4 25 · h5 20 · h6 16 · caption/overline 13
 * `body2`/`subtitle2` usam o outro degrau que o contrato fixa (14, o do código).
 *
 * FRONTEIRA DISPLAY/CORPO — é SEMÂNTICA, não de tamanho: TÍTULO (h1–h6) é
 * `FONT_STACK.display` (Nunito, 700/800); TEXTO — corpo, subtítulo, rótulo de
 * botão, legenda, overline — é `FONT_STACK.body` (Inter). Traçar a fronteira por
 * tamanho é o que produzia um H1 em Nunito 700 seguido de um H2 em Inter 400:
 * a hierarquia trocava de VOZ no meio do caminho. Como h6 empata com `body1` em
 * 16px, quem separa os dois é a família e o peso, não o corpo — e é de propósito
 * que o menor título nunca fique ABAIXO do texto que ele encabeça.
 *
 * ─── DECISÃO 3: dois níveis de movimento, separados por PROPRIEDADE ────────
 * `theme.transitions` ganha, por module augmentation, os nomes `spatial` e
 * `effects` (easing) e `spatialFast|Normal|Slow` / `effectsFast|Normal|Slow`
 * (duração). O nível `spatial` PODE ultrapassar (overshoot ~9,5%) e por isso só
 * pode animar transform/geometria; aplicar `spatial` a `color`,
 * `background-color` ou `opacity` é o bug que faz texto longo cintilar.
 * A regra é imposta pelo TIPO: `spatialTransition()` aceita apenas
 * `SPATIAL_ALLOWED_PROPERTIES`, e ainda checa em runtime. Toda referência a
 * `theme.transitions.easing.spatial` neste arquivo vive DENTRO desse helper —
 * `tests/theme.test.ts` assere que a ocorrência é única.
 *
 * ─── MECÂNICA OBRIGATÓRIA DO MUI v9 (condição de funcionamento) ────────────
 * 1. `cssVariables: { colorSchemeSelector: 'class' }` — o default é `'media'`, e
 *    sob `'media'` o `setMode()` do toggle NÃO tem efeito nenhum
 *    (`createCssVarsProvider.js` loga isso). PRESERVADO da onda 11.
 * 2. NUNCA decidir estilo por ternário sobre o MODO do palette
 *    (`mode === 'dark' ? A : B`). Sob `cssVariables`,
 *    `createThemeWithVars.js` copia o palette do `defaultColorScheme` para o
 *    topo do tema — o ternário resolve UMA vez e nunca reage ao toggle. Não é
 *    flicker: é galho errado permanente. Aqui NÃO existe um único ternário de
 *    esquema: todo estilo de componente lê `theme.vars.palette.*`, que é uma
 *    referência `var(--mui-palette-*)` resolvida pela classe `.light`/`.dark` no
 *    <html>. Onde uma variável CSS não servisse, a saída seria
 *    `theme.applyStyles('dark', {...})` SEMPRE por último no array.
 * 3. NÃO declarar um bloco `palette` no topo junto de `colorSchemes` (lição da
 *    fix17c): isso derruba os slots de cor customizada do scheme light.
 * 4. Variante nova é TOKEN DE TEMA, não `sx` espalhado:
 *    `styleOverrides.root.variants: [{ props, style }]` com ordenação
 *    última-vence, mais a module augmentation do `*PropsVariantOverrides`.
 * 5. `@mui/material` fica em 9.3.1 — os itens 2 e 3 são comportamento de
 *    implementação, não API pública garantida.
 */
import { createTheme, type Theme, type TypographyStyle } from '@mui/material/styles';
import {
  ACCENT_DARK,
  ACCENT_LIGHT,
  DIVIDER_DARK,
  DIVIDER_LIGHT,
  FONT_STACK,
  INK_DARK,
  INK_LIGHT,
  MOTION,
  NONTEXT_DARK,
  NONTEXT_LIGHT,
  SHAPE,
  SPATIAL_FORBIDDEN_PROPERTIES,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPE,
  type AccentFamily,
  type AccentPair,
} from './lib/designTokens';

/* ═══════════════════════════════════════════════════════════════════════════
 * TIPOS DO CONTRATO EXPORTADO
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Rampa tonal de superfície (elevação por cor). 0 = fundo · 1 = leitura ·
 *  2 = afundado/well · 3 = chrome elevado (rail/dock/menu) · 4 = selecionado. */
export interface SurfaceRamp {
  level0: string;
  level1: string;
  level2: string;
  level3: string;
  level4: string;
}

/** Camada NÃO-TEXTO (>= 3:1, SC 1.4.11): borda de campo, ícone informativo,
 *  anel de foco. Divisor decorativo NÃO usa esta camada (é `palette.divider`). */
export interface NonTextLayer {
  neutral: string;
  action: string;
  focus: string;
}

/** Uma família de acento com os DOIS papéis resolvidos (texto e preenchimento). */
export interface AccentPaletteColor {
  /** preenchimento — igual a `fill`; é o slot que o MUI nativo consome. */
  main: string;
  /** tinta em cima do preenchimento — igual a `onFill`; slot do MUI nativo. */
  contrastText: string;
  /** acento legível como TEXTO/LINK nas superfícies de nível 0, 1 e 2 (>= 4,5:1). */
  accentText: string;
  /** preenchimento chapado de botão/chip (alias explícito de `main`). */
  fill: string;
  /** tinta que vai EM CIMA do `fill` (alias explícito de `contrastText`). */
  onFill: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MODULE AUGMENTATION — sem isto os slots novos não existem para o TypeScript
 * ═══════════════════════════════════════════════════════════════════════════ */

declare module '@mui/material/styles' {
  /** Liga a tipagem de `theme.vars` / `theme.colorSchemes` (recomendação do MUI
   *  para projetos com `cssVariables`). Sem isto `theme.vars` é `Partial` e todo
   *  consumidor precisaria de cast. */
  interface CssThemeVariables {
    enabled: true;
  }

  /** Os DOIS papéis do acento em TODA família padrão (primary/secondary/error/
   *  warning/info/success). Nenhuma delas fica sem valor: o tema define as seis. */
  interface PaletteColor {
    accentText: string;
    fill: string;
    onFill: string;
  }
  interface SimplePaletteColorOptions {
    accentText?: string;
    fill?: string;
    onFill?: string;
  }

  interface Palette {
    /** família `study` do contrato — matemática, fórmula, KaTeX. */
    study: AccentPaletteColor;
    /** rampa tonal completa (níveis 0–4); o MUI só cobre 0 e 1. */
    surface: SurfaceRamp;
    /** camada não-texto (>= 3:1): borda de campo, ícone, anel de foco. */
    nonText: NonTextLayer;
  }
  interface PaletteOptions {
    study?: AccentPaletteColor;
    surface?: SurfaceRamp;
    nonText?: NonTextLayer;
  }

  /** Nível SPATIAL (transform/geometria, pode ultrapassar) e nível EFFECTS
   *  (cor/opacidade, nunca ultrapassa) — portados à mão do M3 Expressive. */
  interface Easing {
    spatial: string;
    effects: string;
  }
  interface Duration {
    spatialFast: number;
    spatialNormal: number;
    spatialSlow: number;
    effectsFast: number;
    effectsNormal: number;
    effectsSlow: number;
  }

  /** Variante tipográfica de código/terminal (mono, 14/1,5). */
  interface TypographyVariants {
    code: TypographyStyle;
  }
  interface TypographyVariantsOptions {
    code?: TypographyStyle;
  }
}

declare module '@mui/material/Button' {
  /** `pop` — o botão "kimochi ii": preenchimento chapado + resposta espacial. */
  interface ButtonPropsVariantOverrides {
    pop: true;
  }
}

declare module '@mui/material/Paper' {
  /** Variantes por NÍVEL da rampa tonal. Card herda estas (repassa `variant`
   *  para o Paper interno), então valem para <Paper> e <Card>. */
  interface PaperPropsVariantOverrides {
    /** nível 2 — painel afundado, well de código. */
    sunken: true;
    /** nível 3 — chrome elevado: rail, dock, menu. */
    raised: true;
    /** nível 4 — estado selecionado / hover forte. */
    selected: true;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    code: true;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MOVIMENTO — helpers que impõem a separação por propriedade
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Propriedades que o nível `spatial` pode animar (o tipo é a trava). */
export type SpatialProperty =
  | 'transform'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'width'
  | 'height'
  | 'inset'
  | 'top'
  | 'left'
  | 'right'
  | 'bottom'
  | 'flex-basis';

/** Os três degraus de cada nível de movimento. */
export type MotionSpeed = 'fast' | 'normal' | 'slow';

/**
 * Fatia mínima do tema que os helpers de movimento exigem. É estrutural de
 * propósito: serve tanto para o `theme` de `useTheme()` quanto para o `theme`
 * que chega dentro de `styleOverrides`.
 */
export interface MotionTheme {
  transitions: {
    create: (
      props: string | string[],
      options?: { duration?: number | string; easing?: string; delay?: number | string },
    ) => string;
    easing: { spatial: string; effects: string };
    duration: {
      spatialFast: number;
      spatialNormal: number;
      spatialSlow: number;
      effectsFast: number;
      effectsNormal: number;
      effectsSlow: number;
    };
  };
}

/**
 * Forma do tema como ele chega DENTRO de `styleOverrides`/`variants[].style`.
 * Só o que os callbacks deste arquivo consomem — `vars` (as referências
 * var(--mui-palette-*), que trocam sozinhas com a classe .light/.dark),
 * `spacing` e as transições. Existe para dar tipo aos callbacks sem espalhar
 * `any`; a augmentation de `CssThemeVariables` acima é o que torna
 * `Theme['vars']` não-opcional.
 */
export interface StyleTheme extends MotionTheme {
  vars: Theme['vars'];
  spacing: Theme['spacing'];
}

const SPATIAL_DURATION_KEY = {
  fast: 'spatialFast',
  normal: 'spatialNormal',
  slow: 'spatialSlow',
} as const;

const EFFECTS_DURATION_KEY = {
  fast: 'effectsFast',
  normal: 'effectsNormal',
  slow: 'effectsSlow',
} as const;

const FORBIDDEN_FOR_SPATIAL: ReadonlySet<string> = new Set<string>(SPATIAL_FORBIDDEN_PROPERTIES);

/**
 * Transição ESPACIAL — a única porta de entrada do easing com overshoot.
 * O tipo `SpatialProperty` já barra `color`/`background-color`/`opacity` em
 * tempo de compilação; a checagem de runtime pega o caso do `as` e o consumo a
 * partir de JavaScript. Não remova nenhuma das duas: a regra 2 do contrato de
 * tokens depende delas.
 */
export function spatialTransition(
  theme: MotionTheme,
  properties: readonly SpatialProperty[],
  speed: MotionSpeed = 'normal',
): string {
  for (const property of properties) {
    if (FORBIDDEN_FOR_SPATIAL.has(property)) {
      throw new Error(
        `[theme] movimento spatial não pode animar "${property}": o nível spatial ultrapassa ` +
          `o valor final (overshoot) e só é válido em transform/geometria. Use effectsTransition().`,
      );
    }
  }
  return theme.transitions.create([...properties], {
    easing: theme.transitions.easing.spatial,
    duration: theme.transitions.duration[SPATIAL_DURATION_KEY[speed]],
  });
}

/**
 * Transição de EFEITO — cor, opacidade, sombra, borda. Criticamente amortecida:
 * nunca ultrapassa o valor final. É a única transição permitida em superfície de
 * leitura.
 */
export function effectsTransition(
  theme: MotionTheme,
  properties: readonly string[],
  speed: MotionSpeed = 'normal',
): string {
  return theme.transitions.create([...properties], {
    easing: theme.transitions.easing.effects,
    duration: theme.transitions.duration[EFFECTS_DURATION_KEY[speed]],
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FOCO, FORMA E ESCALA DE DISPLAY
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Anel de foco — a leitura Nintendo de foco: grande e inconfundível, não um
 * fiozinho de 1px.
 *
 * Composição: 3px de traço em `nonText.focus` + 2px de folga, e a folga é
 * PREENCHIDA por um halo de `text.primary` (box-shadow com spread 2px, exatamente
 * a largura do offset). O halo não é enfeite: `nonText.focus` foi calibrado em
 * >= 3:1 contra os níveis 0 e 1 (3,02 e 3,23 no claro; 3,35 e 3,03 no escuro),
 * mas cai para ~2,5:1 nos níveis 3–4, que são justamente o chrome (rail, dock,
 * menu) onde há muito alvo focável. A tinta primária alcança >= 9,4:1 contra
 * TODOS os cinco níveis nos dois esquemas, então o indicador composto continua
 * válido em qualquer superfície — é a técnica de indicador de duas cores do
 * Understanding do SC 1.4.11.
 *
 * Exportado (junto de `focusRingStyles`) para que rail, dock e paleta de
 * comandos usem o MESMO anel em vez de reinventar cada um o seu.
 */
export const FOCUS_RING = {
  /** espessura do outline, em px */
  width: 3,
  /** folga entre o componente e o anel, em px */
  offset: 2,
  /** espessura do halo de tinta que preenche a folga, em px (= `offset`) */
  haloWidth: 2,
} as const;

/** Fatia do tema que o anel de foco consome. */
export interface FocusRingTheme {
  vars: Theme['vars'];
}

/**
 * Estilo do anel de foco, pronto para entrar em qualquer `&:focus-visible`.
 * Lê de `theme.vars`, ou seja: referências `var(--mui-palette-*)` que trocam
 * sozinhas com a classe `.light`/`.dark` do <html>. Nenhum ternário de esquema.
 */
export function focusRingStyles(theme: FocusRingTheme): {
  outline: string;
  outlineOffset: number;
  boxShadow: string;
} {
  return {
    outline: `${FOCUS_RING.width}px solid ${theme.vars.palette.nonText.focus}`,
    outlineOffset: FOCUS_RING.offset,
    boxShadow: `0 0 0 ${FOCUS_RING.haloWidth}px ${theme.vars.palette.text.primary}`,
  };
}

/**
 * Escala tipográfica. O contrato de tokens fixa apenas DOIS degraus de tamanho
 * (corpo 16 e código 14) — títulos não estão lá, porque a spec não os calculou.
 * Em vez de inventar números soltos, TODA variante sai de `TYPE.bodySize` por
 * uma escala modular de terça maior (razão 1,25), arredondada ao pixel. É
 * ESCOLHA DE PROJETO declarada, não achado de pesquisa — e é derivada do único
 * tamanho que o contrato fixa, então continua havendo uma fonte de verdade só.
 *
 *   passo  +5   +4   +3   +2   +1    0    −1
 *   px      49   39   31   25   20   16    13
 *   uso     h1   h2   h3   h4   h5   h6    caption/overline
 *
 * A escala é pinada do topo ao fim JUSTAMENTE porque `typography.fontSize: 16`
 * infla em +14,29% tudo que ficar sem tamanho explícito — foi assim que `h5`
 * (27,43px) passou na frente de `h4` (25px).
 */
const TYPE_SCALE_RATIO = 1.25;

/** Entrelinha dos títulos (compacta; a de 1,6 é da PROSA, não do display). */
const DISPLAY_LINE_HEIGHT = 1.2;

/** Tamanho, em px, do degrau `step` da escala modular sobre o corpo. */
function scaleSize(step: number): number {
  return Math.round(TYPE.bodySize * TYPE_SCALE_RATIO ** step);
}

/** Peso dos subtítulos e rótulos — corpo com autoridade, sem virar título. */
const LABEL_WEIGHT = 600;

/** Famílias padrão do MUI que recebem os dois papéis de acento. */
const ACCENT_SLOTS = ['primary', 'secondary', 'error', 'warning', 'info', 'success'] as const;

/* ═══════════════════════════════════════════════════════════════════════════
 * PALETA — construída DUAS vezes com a mesma função, uma por esquema
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Expande um `AccentPair` do contrato nos slots que o MUI e o app consomem. */
function accent(pair: AccentPair): AccentPaletteColor {
  return {
    main: pair.fill,
    contrastText: pair.onFill,
    accentText: pair.text,
    fill: pair.fill,
    onFill: pair.onFill,
  };
}

/**
 * Monta o palette de UM esquema. Construir os dois pela MESMA função é o que
 * garante simetria: nenhum slot pode existir só no claro (foi exatamente esse o
 * bug da fix17c). O mapeamento das famílias:
 *   primary   <- action  (botão primário, "testar", CTA)
 *   error     <- error   (família PRÓPRIA em carmim. NÃO reaponte para `action`:
 *                         `error.main === primary.main` faz o "Apagar" ficar
 *                         idêntico ao CTA, e este app exclui aula e desafio de
 *                         verdade)
 *   secondary <- study   (o contrato não define uma família "secondary"; a de
 *                         estudo é o segundo acento de fato do app)
 *   warning   <- warn · info <- info · success <- success
 *   study     <- study   (slot customizado, para quem quer o nome semântico)
 */
function cartridgePalette(
  surface: SurfaceRamp,
  ink: { primary: string; secondary: string },
  accents: Readonly<Record<AccentFamily, AccentPair>>,
  nonText: NonTextLayer,
  divider: string,
) {
  return {
    // nível 0 = fundo do app · nível 1 = cartão / superfície de leitura
    background: { default: surface.level0, paper: surface.level1 },
    text: { primary: ink.primary, secondary: ink.secondary },
    // divisor DECORATIVO: abaixo de 3:1 de propósito (isento por "Incidental").
    // Borda de campo de formulário NÃO usa este valor — usa `nonText.neutral`.
    divider,
    primary: accent(accents.action),
    secondary: accent(accents.study),
    error: accent(accents.error),
    warning: accent(accents.warn),
    info: accent(accents.info),
    success: accent(accents.success),
    study: accent(accents.study),
    surface,
    nonText,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * O TEMA
 * ═══════════════════════════════════════════════════════════════════════════ */

export const theme = createTheme({
  // `light` primeiro → defaultColorScheme = 'light', coerente com a decisão da
  // spec de que a POLARIDADE POSITIVA é o default de leitura. O modo efetivo
  // continua vindo do `defaultMode="system"` do ThemeProvider (main.tsx).
  colorSchemes: {
    light: {
      palette: cartridgePalette(
        SURFACE_LIGHT,
        INK_LIGHT,
        ACCENT_LIGHT,
        NONTEXT_LIGHT,
        DIVIDER_LIGHT,
      ),
    },
    dark: {
      palette: cartridgePalette(SURFACE_DARK, INK_DARK, ACCENT_DARK, NONTEXT_DARK, DIVIDER_DARK),
    },
  },

  // OBRIGATÓRIO: com o default `'media'` o `setMode()` do toggle não faz nada.
  // Em v9.3.1 esta opção vive dentro de `cssVariables` (o type de ThemeOptions
  // a omite do topo; o runtime a promove de volta ao tema).
  cssVariables: {
    colorSchemeSelector: 'class',
  },

  // v9 nativo: as transições dos PRÓPRIOS componentes MUI passam a respeitar
  // `prefers-reduced-motion` (SC 2.3.3). O CssBaseline abaixo estende a mesma
  // preferência para o CSS do app.
  motion: {
    reducedMotion: 'system',
  },

  shape: {
    borderRadius: SHAPE.base,
  },

  transitions: {
    // Os nomes default do MUI (easeInOut, standard, ...) continuam existindo;
    // estes são ACRÉSCIMOS, não substituições.
    easing: {
      spatial: MOTION.spatial.easing,
      effects: MOTION.effects.easing,
    },
    duration: {
      spatialFast: MOTION.spatial.fast,
      spatialNormal: MOTION.spatial.normal,
      spatialSlow: MOTION.spatial.slow,
      effectsFast: MOTION.effects.fast,
      effectsNormal: MOTION.effects.normal,
      effectsSlow: MOTION.effects.slow,
    },
  },

  typography: {
    fontFamily: FONT_STACK.body,
    // `fontSize` é a BASE do rem do MUI (default 14). Subir para 16 re-baseia
    // toda a escala default em +14,29%, que é o que queremos num app de leitura
    // — MAS só para quem não tem tamanho próprio. Por isso TODAS as treze
    // variantes de texto abaixo são pinadas em pixel: nenhuma fica à mercê do
    // coeficiente, e a ordem da escala deixa de ser acidente.
    fontSize: TYPE.bodySize,

    // ── TÍTULOS (h1–h6): stack de DISPLAY, sem exceção ────────────────────
    // Nunito (terminais arredondados = registro lúdico sem virar fonte de
    // brinquedo), 800 nos dois primeiros degraus e 700 do terceiro ao sexto.
    // A fronteira display/corpo é SEMÂNTICA: título é display, texto é corpo.
    // Nenhum nível de título troca de família no meio da hierarquia.
    h1: {
      fontFamily: FONT_STACK.display,
      fontWeight: 800,
      fontSize: scaleSize(5),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h2: {
      fontFamily: FONT_STACK.display,
      fontWeight: 800,
      fontSize: scaleSize(4),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h3: {
      fontFamily: FONT_STACK.display,
      fontWeight: 700,
      fontSize: scaleSize(3),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h4: {
      fontFamily: FONT_STACK.display,
      fontWeight: 700,
      fontSize: scaleSize(2),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h5: {
      fontFamily: FONT_STACK.display,
      fontWeight: 700,
      fontSize: scaleSize(1),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    // h6 empata com body1 em 16px — é o PISO da escala de título, e de propósito
    // ele nunca cai abaixo do texto que encabeça. Quem separa os dois é a
    // família (Nunito x Inter) e o peso (700 x 400), não o corpo.
    h6: {
      fontFamily: FONT_STACK.display,
      fontWeight: 700,
      fontSize: scaleSize(0),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },

    // ── TEXTO: stack de CORPO ─────────────────────────────────────────────
    // subtitle1/2 são RÓTULO, não título: mesma família do corpo, peso 600,
    // e nos mesmos dois degraus que o contrato fixa (16 e 14).
    subtitle1: {
      fontFamily: FONT_STACK.body,
      fontWeight: LABEL_WEIGHT,
      fontSize: TYPE.bodySize,
    },
    subtitle2: {
      fontFamily: FONT_STACK.body,
      fontWeight: LABEL_WEIGHT,
      fontSize: TYPE.codeSize,
    },

    // Corpo: 16px / 1,6 — o intervalo de teste do C21 é "between 1.5 and 2".
    body1: {
      fontFamily: FONT_STACK.body,
      fontSize: TYPE.bodySize,
      lineHeight: TYPE.proseLineHeight,
    },
    // O contrato só define DOIS degraus de tamanho; o segundo (14) é o do
    // código. body2 usa esse mesmo degrau em vez de herdar o uplift de +14,29%
    // do rem base — assim body2 continua sendo um degrau ABAIXO de body1.
    body2: {
      fontFamily: FONT_STACK.body,
      fontSize: TYPE.codeSize,
      lineHeight: TYPE.codeLineHeight,
    },

    // Legenda e overline: o degrau −1 da escala (12,8 -> 13px).
    caption: {
      fontFamily: FONT_STACK.body,
      fontSize: scaleSize(-1),
    },
    overline: {
      fontFamily: FONT_STACK.body,
      fontWeight: LABEL_WEIGHT,
      fontSize: scaleSize(-1),
    },

    // Código e terminal: mono, 14/1,5. Escolha de projeto declarada na spec.
    code: {
      fontFamily: FONT_STACK.mono,
      fontSize: TYPE.codeSize,
      lineHeight: TYPE.codeLineHeight,
    },

    button: {
      // rótulo de botão não fica em CAIXA ALTA (legibilidade e tom).
      fontFamily: FONT_STACK.body,
      textTransform: 'none',
      fontWeight: LABEL_WEIGHT,
      fontSize: TYPE.bodySize,
    },
  },

  // fix17c ACHADO-4: NÃO repetir um bloco `palette` no topo junto de
  // `colorSchemes` — isso derruba os slots de cor customizada do scheme light
  // (o antigo `tertiary` caía para undefined). Os dois esquemas são a única
  // fonte de paleta deste tema.

  components: {
    /* ── Baseline global: anel de foco + respeito a reduced motion ─────────── */
    MuiCssBaseline: {
      // ATENÇÃO: o callback do CssBaseline recebe o TEMA direto, não `{ theme }`
      // (é a única exceção entre os styleOverrides do MUI).
      styleOverrides: (t) => ({
        // Anel de foco grande, pintado com a camada não-texto (>= 3:1 nos dois
        // esquemas). `theme.vars` é uma referência var(--mui-palette-*): troca
        // sozinha com a classe .light/.dark, sem ternário de esquema.
        '*:focus-visible': focusRingStyles(t),
        // SC 2.3.3 (AAA) — técnica C39: a preferência do SO desliga o movimento
        // do app inteiro. O overshoot espacial é justamente o que não pode
        // sobreviver aqui; a INFORMAÇÃO (passou/falhou) nunca depende dele.
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      }),
    },

    /* ── Todo alvo clicável usa o MESMO anel de foco ───────────────────────── */
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          // `.MuiButtonBase-root { outline: 0 }` do MUI perde para esta regra
          // (especificidade 0,2,0), então o anel global nunca é engolido.
          '&:focus-visible': focusRingStyles(t),
        }),
      },
    },

    MuiButton: {
      defaultProps: {
        // sombra é elevação por SOMBRA; aqui a elevação é por COR.
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: SHAPE.md,
          variants: [
            // ORDENAÇÃO ÚLTIMA-VENCE. Primeiro a correção de AA nas variantes
            // nativas, depois a variante `pop`, que é a mais específica.

            // `text` e `outlined` pintam o RÓTULO com o acento — e rótulo é
            // TEXTO. O default do MUI usa `main` (o preenchimento), que sobre a
            // superfície do app fica abaixo de 4,5:1. Reapontado para
            // `accentText`, que o contrato calibrou como texto.
            ...ACCENT_SLOTS.flatMap((slot) => [
              {
                props: { variant: 'text' as const, color: slot },
                style: ({ theme: t }: { theme: StyleTheme }) => ({
                  color: t.vars.palette[slot].accentText,
                }),
              },
              {
                props: { variant: 'outlined' as const, color: slot },
                style: ({ theme: t }: { theme: StyleTheme }) => ({
                  color: t.vars.palette[slot].accentText,
                  borderColor: t.vars.palette[slot].accentText,
                }),
              },
            ]),

            // `pop` — o botão "kimochi ii". Preenchimento chapado da família
            // action, raio generoso, e a resposta ao toque como MOVIMENTO
            // ESPACIAL: sobe 2% no hover, afunda para 0,97 no press. A cor não
            // participa do overshoot (é `effects`); só o transform é `spatial`.
            {
              props: { variant: 'pop' as const },
              style: ({ theme: t }: { theme: StyleTheme }) => ({
                backgroundColor: t.vars.palette.primary.fill,
                color: t.vars.palette.primary.onFill,
                borderRadius: SHAPE.lg,
                paddingInline: t.spacing(2.5),
                paddingBlock: t.spacing(1),
                fontWeight: 700,
                boxShadow: 'none',
                transition: [
                  effectsTransition(t, ['background-color', 'color', 'border-color'], 'fast'),
                  spatialTransition(t, ['transform'], 'fast'),
                ].join(', '),
                '&:hover': {
                  // acento CHAPADO: o hover não muda a cor, muda a geometria.
                  backgroundColor: t.vars.palette.primary.fill,
                  boxShadow: 'none',
                  transform: 'scale(1.02)',
                },
                '&:active': {
                  transform: 'scale(0.97)',
                },
                '&.Mui-disabled': {
                  transform: 'none',
                },
                // Sem movimento, o botão continua um botão: some o transform,
                // permanece o preenchimento e o rótulo.
                '@media (prefers-reduced-motion: reduce)': {
                  '&:hover': { transform: 'none' },
                  '&:active': { transform: 'none' },
                },
              }),
            },
          ],
        },
      },
    },

    /* ── Superfícies: variantes por NÍVEL da rampa tonal ───────────────────── */
    MuiPaper: {
      styleOverrides: {
        root: {
          // Sem gradiente em superfície (spec §3). O MUI pinta um overlay em
          // `backgroundImage` para simular elevação no dark; aqui a elevação é
          // a própria rampa de cor, então o overlay sai.
          backgroundImage: 'none',
          variants: [
            {
              props: { variant: 'sunken' as const },
              style: ({ theme: t }: { theme: StyleTheme }) => ({
                backgroundColor: t.vars.palette.surface.level2,
                border: `1px solid ${t.vars.palette.divider}`,
                boxShadow: 'none',
              }),
            },
            {
              props: { variant: 'raised' as const },
              style: ({ theme: t }: { theme: StyleTheme }) => ({
                backgroundColor: t.vars.palette.surface.level3,
                border: `1px solid ${t.vars.palette.divider}`,
                boxShadow: 'none',
              }),
            },
            {
              props: { variant: 'selected' as const },
              style: ({ theme: t }: { theme: StyleTheme }) => ({
                backgroundColor: t.vars.palette.surface.level4,
                border: `1px solid ${t.vars.palette.divider}`,
                boxShadow: 'none',
              }),
            },
          ],
        },
      },
    },

    MuiCard: {
      defaultProps: {
        // borda em vez de sombra — coerente com elevação por cor.
        variant: 'outlined',
      },
    },

    /* ── Link = família `info` do contrato, no valor de TEXTO ──────────────── */
    MuiLink: {
      defaultProps: {
        underline: 'hover',
      },
      styleOverrides: {
        root: {
          variants: [
            {
              // só o default do MUI (`color="primary"`) é reapontado; quem passa
              // uma cor explícita continua mandando.
              props: { color: 'primary' as const },
              style: ({ theme: t }: { theme: StyleTheme }) => ({
                color: t.vars.palette.info.accentText,
                textDecorationColor: 'currentColor',
              }),
            },
          ],
        },
      },
    },

    /* ── Borda de campo NÃO é decorativa: usa a camada de 3:1 ──────────────── */
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: ({ theme: t }) => ({
          borderColor: t.vars.palette.nonText.neutral,
        }),
      },
    },

    /* ── A variante tipográfica `code` precisa de um elemento próprio ──────── */
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          code: 'code',
        },
      },
    },
  },
});

export default theme;
