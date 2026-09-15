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
 * contra o nível 0, caía ABAIXO do piso AA no nível 1 do escuro.
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
 * Os tamanhos saem da MESMA escala modular (razão 1,28) sobre a base de corpo
 * da ONDA 1 (18px — pedido do dono por tipografia maior; ver a seção da escala
 * adiante), do passo +5 ao passo −1:
 *   h1 62 · h2 48 · h3 38 · h4 29 · h5 23 · h6 18 · caption/overline 14
 * `body2`/`subtitle2` usam o degrau de 16.
 *
 * FRONTEIRA DISPLAY/CORPO — é SEMÂNTICA, não de tamanho: TÍTULO (h1–h6) é
 * `FONT_STACK.display` (Nunito Variable, 800 no topo e 700 do h4 para baixo);
 * TEXTO — corpo, subtítulo, rótulo de botão, legenda, overline — é
 * `FONT_STACK.body` (Inter). Traçar a fronteira por tamanho é o que produzia um
 * H1 em display 700 seguido de um H2 em Inter 400: a hierarquia trocava de VOZ
 * no meio do caminho. Como h6 empata com `body1` em 18px, quem separa os dois é
 * a família e o peso, não o corpo — e é de propósito que o menor título nunca
 * fique ABAIXO do texto que ele encabeça. (A variante `pixel` — nome LEGADO,
 * ver a seção da escala — é um RÓTULO de HUD em display, não um nível de
 * hierarquia.)
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
  SCRIM,
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
    /** escurecimento por trás de um modal — `color-mix` já pronto, ver SCRIM. */
    scrim: string;
  }
  interface PaletteOptions {
    study?: AccentPaletteColor;
    surface?: SurfaceRamp;
    nonText?: NonTextLayer;
    scrim?: string;
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

  /** Variante tipográfica de código/terminal (mono, 15/1,5). */
  interface TypographyVariants {
    code: TypographyStyle;
    /** Rótulo de HUD em uppercase pequeno (display 700/13px). O nome `pixel` é
     *  LEGADO — a fonte de pixel saiu na onda 11; ver a definição da variante.
     *  Variante, não `sx` espalhado: é token de tema. */
    pixel: TypographyStyle;
  }
  interface TypographyVariantsOptions {
    code?: TypographyStyle;
    pixel?: TypographyStyle;
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
    pixel: true;
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
  /**
   * A ÚNICA saída permitida quando uma variável CSS não resolve o problema —
   * e ela existe porque um caso real apareceu na onda 11: o papel do
   * `<Dialog>`. Sob polaridade NEGATIVA (escuro) elevação é LUZ, então o
   * modal é o TOPO da rampa; sob polaridade POSITIVA (claro) a rampa
   * ESCURECE conforme sobe, e um modal mais escuro que a página seria um
   * buraco. Não existe uma variável só que signifique "level4 no escuro e
   * level1 no claro", então o galho é `applyStyles`, SEMPRE por último no
   * objeto de estilo (é ele que precisa vencer por ordem).
   * O que continua PROIBIDO é o ternário sobre `palette.mode`: aquele
   * resolve UMA vez, na construção do tema, e trava no galho errado.
   */
  applyStyles: Theme['applyStyles'];
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
 * >= 3:1 contra os níveis 0 e 1 —
 *   [medido] NONTEXT_LIGHT.focus x SURFACE_LIGHT.level0 = 3,02:1
 *   [medido] NONTEXT_LIGHT.focus x SURFACE_LIGHT.level1 = 3,23:1
 *   [medido] NONTEXT_DARK.focus x SURFACE_DARK.level0 = 3,51:1
 *   [medido] NONTEXT_DARK.focus x SURFACE_DARK.level1 = 3,13:1
 * — e CAI abaixo do piso nos níveis 3–4, que são justamente o chrome (rail,
 * dock, menu) onde há muito alvo focável:
 *   [medido] NONTEXT_LIGHT.focus x SURFACE_LIGHT.level4 = 2,21:1
 *   [medido] NONTEXT_DARK.focus x SURFACE_DARK.level4 = 2,04:1
 * (Este parágrafo dizia "3,35 e 3,03 no escuro" desde a onda 11, quando o
 * `focus` escuro mudou de valor e ninguém recalculou — o número certo é o
 * medido acima. A forma `[medido]` existe para que a próxima troca de hex
 * reprove o teste em vez de envelhecer em silêncio; ver a regra 5 do cabeçalho
 * de designTokens.ts.)
 * A tinta primária, essa, alcança o piso não-texto contra TODOS os cinco níveis
 * nos dois esquemas — o pior caso é
 * [medido] INK_DARK.primary x SURFACE_DARK.level4 = 9,83:1 —, então o indicador
 * composto continua válido em qualquer superfície: é a técnica de indicador de
 * duas cores do Understanding do SC 1.4.11.
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
 * O PAPEL DE UM MODAL — a superfície do cartão que flutua sobre o scrim.
 *
 * ONDA 12: isto era um `styleOverrides` do `MuiDialog` e mais nada; o overlay do
 * quiz (`src/components/quiz/QuizOverlayHost.tsx`), que NÃO é um `<Dialog>`,
 * pintava o próprio cartão no nível 3 nos DOIS esquemas — e no CLARO o nível 3
 * (#e9e2d6) é mais ESCURO que a página (#faf7f2), então o modal lia como buraco
 * em vez de elevação. Era o único modal da base fora da regra. Extraído para cá
 * como função para que o `MuiDialog` e todo overlay feito à mão consumam a MESMA
 * decisão em vez de reimplementá-la:
 *
 *   - ESCURO: nível 4, o TOPO da rampa. Sob polaridade negativa elevação é LUZ —
 *     o objeto mais alto da tela é o mais claro, e é esse valor que bate com o
 *     cinza médio do cartão da referência.
 *   - CLARO: nível 1, a superfície de leitura. Sob polaridade positiva a rampa
 *     ESCURECE conforme sobe; qualquer nível acima de 1 aqui é um buraco.
 *
 * A assimetria é o motivo de existir `applyStyles` (ver `StyleTheme.applyStyles`)
 * e ele vem SEMPRE POR ÚLTIMO no objeto — é a ordem que faz o galho escuro
 * vencer. Ternário sobre `palette.mode` resolveria uma vez só e travaria.
 *
 * Serve tanto para `styleOverrides` quanto para `sx`: a chave que o
 * `applyStyles` devolve é um seletor aninhado, que o `sx` também entende.
 */
export function modalSurfaceStyles(theme: StyleTheme): Record<string, unknown> {
  return {
    backgroundColor: theme.vars.palette.surface.level1,
    ...theme.applyStyles('dark', {
      backgroundColor: theme.vars.palette.surface.level4,
    }),
  };
}

/**
 * Escala tipográfica. O contrato de tokens fixa apenas DOIS degraus de tamanho
 * (corpo 16 e código 14) — títulos não estão lá, porque a spec não os calculou.
 * Em vez de inventar números soltos, TODA variante sai do corpo por uma escala
 * modular (razão 1,28), arredondada ao pixel. É ESCOLHA DE PROJETO declarada,
 * não achado de pesquisa.
 *
 * ── ONDA 1 (game-foundations): TIPOGRAFIA MAIOR ────────────────────────────
 * Pedido do dono ("a fonte da app não está boa; textos MAIORES e melhores de
 * ler", no espírito do projeto irmão leet-code-rpg, cuja raiz escala 18/20.8/
 * 23.2px). O contrato `TYPE` (bodySize 16, codeSize 14) fica CONGELADO — estas
 * constantes locais são a base da ESCALA do tema, não novos tokens:
 *
 *   corpo   16 → 18   (body1; um degrau cheio, o mesmo piso do leet-code-rpg)
 *   corpo2  14 → 16   (body2/subtitle2)
 *   código  14 → 15   (code — a variante do tema E o CODE_TYPOGRAPHY, ver
 *                      src/lib/codeTheme.ts; TYPE.codeSize segue 14 no
 *                      contrato para o construtor do xterm e a calibração)
 *   títulos          escala modular razão 1,25 → 1,28 sobre a nova base
 *
 *   passo  +5   +4   +3   +2   +1    0    −1
 *   px      62   48   38   29   23   18    14
 *   uso     h1   h2   h3   h4   h5   h6    caption/overline
 *
 * A escala é pinada do topo ao fim JUSTAMENTE porque `typography.fontSize`
 * re-baseia o rem do MUI e infla tudo que ficar sem tamanho explícito — foi
 * assim que `h5` (27,43px) passou na frente de `h4` (25px).
 */
const TYPE_BODY_SIZE = 18;
/** body2/subtitle2 — um degrau abaixo do corpo (15,5–16 pedidos; escolhido 16). */
const TYPE_BODY2_SIZE = 16;
/** código/terminal (a variante do tema; TYPE.codeSize segue 14 no contrato). */
const TYPE_CODE_SIZE = 15;
const TYPE_SCALE_RATIO = 1.28;

/** Entrelinha dos títulos (compacta; a de 1,6 é da PROSA, não do display). */
const DISPLAY_LINE_HEIGHT = 1.2;

/** Tamanho, em px, do degrau `step` da escala modular sobre o corpo. */
function scaleSize(step: number): number {
  return Math.round(TYPE_BODY_SIZE * TYPE_SCALE_RATIO ** step);
}

/** Peso dos subtítulos e rótulos — corpo com autoridade, sem virar título. */
const LABEL_WEIGHT = 600;

/* ── PESO DOS TÍTULOS: 800 no topo, 700 na base (ONDA 11) ───────────────────
 * O display voltou a ser VARIÁVEL (Nunito, eixo wght 200..1000). O Chakra Petch
 * da onda 1 era estático e parava em 700, então h1 e h6 tinham exatamente o
 * MESMO peso e a hierarquia dependia só do tamanho — que no piso da escala é
 * zero (h6 e body1 empatam em 18px).
 * Com o eixo aberto, os TRÊS níveis de topo (h1–h3, os títulos de tela) sobem
 * para 800 e os TRÊS de baixo (h4–h6, títulos dentro de um cartão) ficam em
 * 700. Assim a hierarquia passa a ter DOIS sinais em vez de um, e o h6 continua
 * separado do body1 por família (Nunito x Inter) E por peso (700 x 400).
 * O piso é 700 de propósito: abaixo disso o Nunito, que é arredondado, deixa de
 * ler como título ao lado do Inter 600 dos subtítulos. */
const DISPLAY_WEIGHT_TOP = 800;
const DISPLAY_WEIGHT_BASE = 700;

/** Famílias padrão do MUI que recebem os dois papéis de acento. */
const ACCENT_SLOTS = ['primary', 'secondary', 'error', 'warning', 'info', 'success'] as const;

/* ── Forma das SUPERFÍCIES (cartão, papel, chip, modal) — ONDA 11 ───────────
 * Um número só para os três, porque eles têm que combinar: a referência
 * (Nintendo Switch Online) é feita de retângulos de canto generoso SEM contorno
 * pesado, e um card de borda 2px ao lado de um modal de borda 0 lê como duas
 * bases de design diferentes na mesma tela.
 * `SURFACE_RADIUS` = 16 fica um degrau acima do `SHAPE.base` (14) que rege
 * botão e campo, exatamente como no mock: o container é mais macio que o
 * controle dentro dele. */
const SURFACE_RADIUS = 16;
/** 1px: aresta, não moldura. A onda 1 usava 2px (traço "game" do leet-code-rpg). */
const SURFACE_BORDER_WIDTH = 1;

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
    // ONDA 12: o SCRIM vira slot de paleta. Ele é IGUAL nos dois esquemas de
    // propósito — escurecer é escurecer, e a cor base é acromática (ver SCRIM em
    // designTokens.ts) —, mas passa pelo palette assim mesmo para virar a
    // variável `--mui-palette-scrim`: é ela que os overlays fora do MuiBackdrop
    // (o do quiz, o de geração de desafio) consomem por
    // `theme.vars.palette.scrim`, em vez de cada um pintar a sua rgba() crua.
    // `color-mix` e não `alpha()`: a regra do cabeçalho de designTokens.ts.
    scrim: `color-mix(in srgb, ${SCRIM.color} ${SCRIM.opacityPercent}%, transparent)`,
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
    // `fontSize` é a BASE do rem do MUI (default 14). ONDA 1 (game-foundations)
    // subiu a base para 18 junto com o corpo — mas a re-baseia SÓ atinge quem
    // não tem tamanho próprio, e por isso TODAS as variantes de texto abaixo
    // são pinadas em pixel: nenhuma fica à mercê do coeficiente, e a ordem da
    // escala deixa de ser acidente.
    fontSize: TYPE_BODY_SIZE,

    // ── TÍTULOS (h1–h6): stack de DISPLAY, sem exceção ────────────────────
    // ONDA 11: Nunito Variable (geométrica-humanista, arredondada — a voz da
    // referência Nintendo Switch) no lugar do Chakra Petch, que era techno e
    // quadrada. "A fonte nao quero retro", verbatim do dono. 800 nos três
    // níveis de topo, 700 nos três de baixo (ver DISPLAY_WEIGHT_*). A fronteira
    // display/corpo é SEMÂNTICA: título é display, texto é corpo. Nenhum nível
    // de título troca de família no meio da hierarquia.
    h1: {
      fontFamily: FONT_STACK.display,
      fontWeight: DISPLAY_WEIGHT_TOP,
      fontSize: scaleSize(5),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h2: {
      fontFamily: FONT_STACK.display,
      fontWeight: DISPLAY_WEIGHT_TOP,
      fontSize: scaleSize(4),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h3: {
      fontFamily: FONT_STACK.display,
      fontWeight: DISPLAY_WEIGHT_TOP,
      fontSize: scaleSize(3),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h4: {
      fontFamily: FONT_STACK.display,
      fontWeight: DISPLAY_WEIGHT_BASE,
      fontSize: scaleSize(2),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    h5: {
      fontFamily: FONT_STACK.display,
      fontWeight: DISPLAY_WEIGHT_BASE,
      fontSize: scaleSize(1),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },
    // h6 empata com body1 em 18px — é o PISO da escala de título, e de
    // propósito ele nunca cai abaixo do texto que encabeça. Quem separa os
    // dois é a família (Nunito x Inter) e o peso (700 x 400), não o corpo.
    h6: {
      fontFamily: FONT_STACK.display,
      fontWeight: DISPLAY_WEIGHT_BASE,
      fontSize: scaleSize(0),
      lineHeight: DISPLAY_LINE_HEIGHT,
    },

    // ── TEXTO: stack de CORPO ─────────────────────────────────────────────
    // subtitle1/2 são RÓTULO, não título: mesma família do corpo, peso 600, e
    // nos mesmos dois degraus da escala do tema (18 e 16).
    subtitle1: {
      fontFamily: FONT_STACK.body,
      fontWeight: LABEL_WEIGHT,
      fontSize: TYPE_BODY_SIZE,
    },
    subtitle2: {
      fontFamily: FONT_STACK.body,
      fontWeight: LABEL_WEIGHT,
      fontSize: TYPE_BODY2_SIZE,
    },

    // Corpo: 18px / 1,6 — o intervalo de teste do C21 é "between 1.5 and 2".
    // ONDA 1: subiu de 16 (o contrato TYPE.bodySize segue congelado em 16).
    body1: {
      fontFamily: FONT_STACK.body,
      fontSize: TYPE_BODY_SIZE,
      lineHeight: TYPE.proseLineHeight,
    },
    // Um degrau ABAIXO de body1 (16px — pedido 15,5–16; escolhido 16), sem
    // herdar o uplift do rem base.
    body2: {
      fontFamily: FONT_STACK.body,
      fontSize: TYPE_BODY2_SIZE,
      lineHeight: TYPE.codeLineHeight,
    },

    // Legenda e overline: o degrau −1 da escala (18/1,28 = 14,06 -> 14px).
    caption: {
      fontFamily: FONT_STACK.body,
      fontSize: scaleSize(-1),
    },
    overline: {
      fontFamily: FONT_STACK.body,
      fontWeight: LABEL_WEIGHT,
      fontSize: scaleSize(-1),
    },

    // `pixel` — NOME LEGADO. ONDA 11: a família que dava nome à variante
    // (Press Start 2P, uma fonte de PIXEL) saiu do projeto com o resto do
    // registro retro. A VARIANTE ficou porque dois componentes a consomem
    // (`SessionFrame` nos rótulos do quadro de sessão e `CodeBlock` no rótulo
    // de linguagem/saída do bloco de código) e eles pertencem a outra frente;
    // renomeá-la para `label` exige tocar nesses dois arquivos.
    //
    // O PAPEL não mudou — rótulo de HUD, uppercase pequeno, nunca corpo nem
    // título —, mudou a VOZ: agora é o próprio display (Nunito) em 700, o que
    // mantém o rótulo na mesma família dos títulos sem competir com eles (13px
    // fica abaixo do menor degrau da escala, os 14px de `caption`).
    // A entrelinha caiu de 1,8 para 1,5: os 1,8 existiam porque glifo de pixel
    // é cortado quando a caixa aperta, e essa razão morreu junto com a fonte.
    pixel: {
      fontFamily: FONT_STACK.display,
      fontWeight: DISPLAY_WEIGHT_BASE,
      fontSize: 13,
      lineHeight: 1.5,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    },

    // Código e terminal: mono, 15/1,5. ONDA 1: subiu de 14 (TYPE.codeSize
    // segue 14 no contrato; a CONSTANTE do tema é TYPE_CODE_SIZE).
    //
    // O `fontSize` desta variante — e SÓ desta — é STRING COM UNIDADE, não o
    // número. Motivo medido, não estético: com `cssVariables`, o MUI publica
    // cada variante como o shorthand `font` em `--mui-font-<variante>`, e o
    // gerador (@mui/system/cssVars/prepareTypographyVars.mjs:7) concatena
    // `fontSize` CRU, sem sufixar 'px'. Com o número 15 o var sairia
    //     --mui-font-code: 15/1.5 'JetBrains Mono Variable', …
    // e `15` sem unidade NÃO é um <font-size> válido no shorthand `font`
    // (unitless só vale para 0, e index.html é standards mode). A declaração
    // inteira caía, EM SILÊNCIO: `.cm-editor, .xterm { font: var(--mui-font-code) }`
    // media family="Inter Variable" / 16px / lh normal no Blink. Com a string
    // o var vira `15px/1.5 '…'`, shorthand válido, e o CSS de bootstrap
    // (src/index.css) volta a ter UMA fonte de verdade para a fonte de código.
    //
    // `TYPE.codeSize` continua sendo o NÚMERO 14 no contrato (calibração de
    // contraste); quem renderiza código de verdade — editor e terminal — usa o
    // CODE_TYPOGRAPHY de `src/lib/codeTheme.ts`, também subido para 15 nesta
    // onda, para o CSS var e a tela concordarem.
    code: {
      fontFamily: FONT_STACK.mono,
      fontSize: `${TYPE_CODE_SIZE}px`,
      lineHeight: TYPE.codeLineHeight,
    },

    button: {
      // rótulo de botão não fica em CAIXA ALTA (legibilidade e tom).
      fontFamily: FONT_STACK.body,
      textTransform: 'none',
      fontWeight: LABEL_WEIGHT,
      fontSize: TYPE_BODY_SIZE,
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
        // ONDA 1 (layout+a11y): campos de TEXTO e SELEÇÃO NÃO recebem o anel —
        // o outline 3px + halo boxShadow ficam visualmente POR CIMA do campo
        // (caso mais visível: o TextField do chat da aula). O campo mantém a
        // indicação de foco PRÓPRIA (borda do OutlinedInput vira `primary` no
        // estado Mui-focused), então a acessibilidade de teclado segue. A
        // especificidade (0,1,1) vence o `*:focus-visible` (0,1,0) logo acima.
        // Botões, links, chips e demais alvos clicáveis (MuiButtonBase)
        // MANTÊM o anel — preservado onde ele ajuda. `[role="combobox"]`
        // cobre o MuiSelect (o alvo de foco é um div com esse papel, não um
        // <select>); o Autocomplete usa <input> por baixo (já coberto).
        // `[role="textbox"]` e `[contenteditable]` cobrem o editing host do
        // CodeMirror 6 (`.cm-content`, contenteditable com role="textbox",
        // no editor de código da ChallengeView), que também recebia o anel do
        // `*:focus-visible` por cima do `outline: none` do baseTheme.
        'input:focus-visible, textarea:focus-visible, select:focus-visible, [role="combobox"]:focus-visible, [role="textbox"]:focus-visible, [contenteditable]:focus-visible': {
          outline: 'none',
          outlineOffset: 0,
          boxShadow: 'none',
        },
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
        // sombra é elevação por SOMBRA; aqui a elevação é por COR. As sombras
        // COLORIDAS da onda 1 (game-foundations) entram EXPLICITAMENTE por
        // variante — `disableElevation` só zera a elevação cinza do MUI.
        disableElevation: true,
        // ── O RIPPLE DE FOCO NÃO PULSA MAIS (ONDA 13) ────────────────────
        // Prova visual do dono, medida no app rodando 2,5s DEPOIS do Tab, em
        // REPOUSO, nos dois esquemas: sobre a pílula de alternativa (472x52) o
        // `TouchRipple` de foco desenhava um `.MuiTouchRipple-childPulsate` de
        // 363x363 com `border-radius: 50%`. Num alvo SETE VEZES mais largo que
        // alto o raio de 50% nunca aparece: o que chega ao olho é uma BARRA
        // CINZA CHAPADA atravessando a cápsula, com as pontas escuras
        // sobrando. E ela não é um flash — `ButtonBase` chama `ripple.pulsate()`
        // enquanto o foco estiver ali (ButtonBase.js:202-203), então fica.
        // Desligar é o certo e não custa acessibilidade: o indicador de foco
        // desta base é o ANEL DE DUAS CORES (`focusRingStyles`, técnica do
        // Understanding do SC 1.4.11), que é mais forte que o ripple e é o que
        // a norma pede. O ripple de CLIQUE continua — só o de foco sai.
        disableFocusRipple: true,
      },
      styleOverrides: {
        root: ({ theme: t }: { theme: StyleTheme }) => ({
          borderRadius: SHAPE.md,
          // ── O HALO DO ANEL DE FOCO, DE VOLTA (ONDA 13) ──────────────────
          // O `disableElevation` logo acima tem um efeito colateral que não
          // está no nome dele: o MUI, para a variante `disableElevation`,
          // declara `boxShadow: 'none'` TAMBÉM em `&.Mui-focusVisible`
          // (Button.js:260-262). Como o halo do nosso anel de foco É um
          // `boxShadow` (`focusRingStyles`: outline em `nonText.focus` + halo
          // de 2px em `text.primary`, preenchendo a folga do `outline-offset`),
          // o `disableElevation` vinha apagando a SEGUNDA COR do indicador em
          // TODO botão do app, em silêncio, desde a onda 1.
          // O que a prova visual mediu na pílula: `outline: 2.4px solid
          // rgb(12,113,150)` com `outline-offset: 2px` e `box-shadow: none` —
          // as duas cores adjacentes ao anel eram o próprio cartão (#3b3b3b),
          // e [medido] NONTEXT_DARK.focus x SURFACE_DARK.level4 = 2,04:1, abaixo do
          // piso NÃO-TEXTO de 3:1. Com o halo de volta, quem encosta no anel é
          // `text.primary`, cujo pior par é
          // [medido] INK_DARK.primary x SURFACE_DARK.level4 = 9,83:1 — que é
          // exatamente a razão de o indicador ser de duas cores.
          // `styleOverrides` do tema é aplicado DEPOIS das variantes do
          // componente, então esta declaração vence a do `disableElevation`.
          '&.Mui-focusVisible': {
            boxShadow: `0 0 0 ${FOCUS_RING.haloWidth}px ${t.vars.palette.text.primary}`,
          },
          // ONDA 1 (game-foundations): resposta de botão de JOGO — todo botão
          // sobe 2% no hover e afunda para 0,96 no press, com o transform em
          // movimento SPATIAL (pode ultrapassar) e cor/sombra em EFFECTS. A
          // variante `pop` redefine a própria transição logo abaixo (mais
          // específica) — a dela é idêntica em espírito.
          transition: [
            effectsTransition(t, ['background-color', 'color', 'border-color', 'box-shadow'], 'fast'),
            spatialTransition(t, ['transform'], 'fast'),
          ].join(', '),
          '&:hover': {
            transform: 'scale(1.02)',
          },
          '&:active': {
            transform: 'scale(0.96)',
          },
          // ── DESABILITADO QUE CARREGA INFORMAÇÃO (ONDA 12) ─────────────
          // Prova visual do dono: o "Avançar" (o botão de avanço da aula,
          // antes "Próximo →") bloqueado pelo quiz ficava
          // cinza sobre cinza no escuro, praticamente invisível — e ele é o
          // estado NORMAL enquanto a aula não foi respondida, ou seja, o que o
          // aluno mais vê. O default do MUI pinta `action.disabled`, que no
          // escuro é branco a 30%: composto sobre o nível 0 isso vira #565656 e
          // mede [medido] #565656 x SURFACE_DARK.level0 = 2,63:1, abaixo até do
          // piso NÃO-TEXTO.
          // Um controle desabilitado é dispensado do contraste pela própria
          // WCAG ("inactive user interface component"), mas ESTE carrega o
          // motivo do bloqueio e vem com explicação ao lado: ele precisa ser
          // LIDO. Vai para a tinta SECUNDÁRIA, que o contrato calibra contra os
          // cinco níveis dos dois esquemas — o pior par é
          // [medido] INK_DARK.secondary x SURFACE_DARK.level4 = 4,99:1, ainda
          // sobre o piso AA. O que sinaliza "desligado" passa a ser a ausência
          // de preenchimento, o cursor e o cadeado, não a ilegibilidade.
          '&.Mui-disabled': {
            transform: 'none',
            color: t.vars.palette.text.secondary,
            // A borda do `outlined` desabilitado é `action.disabledBackground`
            // (branco a 12% no escuro): sobre o nível 0 ela some, e o botão
            // vira texto solto no meio da tela. O divisor decorativo é fraco de
            // propósito — [medido] DIVIDER_DARK x SURFACE_DARK.level0 = 2,28:1 —
            // mas DESENHA a moldura, que é o que faltava. `borderColor`
            // (longhand) vem depois do `border` (shorthand) do MUI porque
            // styleOverrides do tema é aplicado por último; nas variantes sem
            // borda a declaração é inerte.
            borderColor: t.vars.palette.divider,
          },
          // Ícone+texto nunca GRUDADOS (pedido do dono): o startIcon abre 10px
          // do rótulo (o default do MUI é 8/6px e some quando um `px` pequeno
          // aperta o botão). O margin-left NEGATIVO default do MUI fica — é o
          // alinhamento óptico e o paddingInline dos tamanhos (abaixo) o
          // compensa.
          '& .MuiButton-startIcon': {
            marginRight: t.spacing(1.25),
          },
          // Sem movimento, o botão continua um botão: some o transform,
          // permanecem as cores e o rótulo.
          '@media (prefers-reduced-motion: reduce)': {
            '&:hover': { transform: 'none' },
            '&:active': { transform: 'none' },
          },
          variants: [
            // ORDENAÇÃO ÚLTIMA-VENCE. Primeiro a correção de AA nas variantes
            // nativas, depois as sombras coloridas do `contained`, e por fim a
            // variante `pop`, que é a mais específica.

            // `text` e `outlined` pintam o RÓTULO com o acento — e rótulo é
            // TEXTO. O default do MUI usa `main` (o preenchimento), que sobre a
            // superfície do app fica abaixo de 4,5:1. Reapontado para
            // `accentText`, que o contrato calibrou como texto.
            ...ACCENT_SLOTS.flatMap((slot) => [
              {
                props: { variant: 'text' as const, color: slot },
                style: ({ theme: t2 }: { theme: StyleTheme }) => ({
                  color: t2.vars.palette[slot].accentText,
                }),
              },
              {
                props: { variant: 'outlined' as const, color: slot },
                style: ({ theme: t2 }: { theme: StyleTheme }) => ({
                  color: t2.vars.palette[slot].accentText,
                  borderColor: t2.vars.palette[slot].accentText,
                }),
              },
            ]),

            // ONDA 1 (game-foundations): SOMBRA COLORIDA nos botões de
            // preenchimento — o glow do leet-code-rpg (shadow-indigo-500/25),
            // na tinta do próprio acento via color-mix (nenhum hex novo). A
            // sombra é `effects` (cor), nunca `spatial`. O `contained` default
            // do MUI fica coberto aqui para TODOS os slots de acento.
            ...ACCENT_SLOTS.flatMap((slot) => [
              {
                props: { variant: 'contained' as const, color: slot },
                style: ({ theme: t2 }: { theme: StyleTheme }) => ({
                  boxShadow: `0 4px 14px -4px color-mix(in srgb, ${t2.vars.palette[slot].fill} 40%, transparent)`,
                  '&:hover': {
                    boxShadow: `0 6px 18px -4px color-mix(in srgb, ${t2.vars.palette[slot].fill} 55%, transparent)`,
                  },
                  '&:active': {
                    boxShadow: `0 2px 8px -2px color-mix(in srgb, ${t2.vars.palette[slot].fill} 30%, transparent)`,
                  },
                }),
              },
            ]),

            // `pop` — o botão "kimochi ii". Preenchimento chapado da família
            // action, raio generoso, resposta ao toque como MOVIMENTO ESPACIAL
            // (sobe 2% no hover, afunda para 0,97 no press) e o glow colorido
            // do acento em cima da sombra cinza que o disableElevation zera.
            // A cor não participa do overshoot (é `effects`); só o transform é
            // `spatial`.
            {
              props: { variant: 'pop' as const },
              style: ({ theme: t2 }: { theme: StyleTheme }) => ({
                backgroundColor: t2.vars.palette.primary.fill,
                color: t2.vars.palette.primary.onFill,
                borderRadius: SHAPE.lg,
                paddingInline: t2.spacing(2.5),
                paddingBlock: t2.spacing(1),
                fontWeight: 700,
                boxShadow: `0 4px 14px -4px color-mix(in srgb, ${t2.vars.palette.primary.fill} 40%, transparent)`,
                transition: [
                  effectsTransition(t2, ['background-color', 'color', 'border-color', 'box-shadow'], 'fast'),
                  spatialTransition(t2, ['transform'], 'fast'),
                ].join(', '),
                '&:hover': {
                  // acento CHAPADO: o hover não muda a cor, muda a geometria
                  // e a Sombra cresce.
                  backgroundColor: t2.vars.palette.primary.fill,
                  boxShadow: `0 6px 18px -4px color-mix(in srgb, ${t2.vars.palette.primary.fill} 55%, transparent)`,
                  transform: 'scale(1.02)',
                },
                '&:active': {
                  boxShadow: `0 2px 8px -2px color-mix(in srgb, ${t2.vars.palette.primary.fill} 30%, transparent)`,
                  transform: 'scale(0.97)',
                },
                '&.Mui-disabled': {
                  boxShadow: 'none',
                  transform: 'none',
                  // O `pop` desabilitado MANTÉM o preenchimento do acento (o
                  // MUI não conhece esta variante e não pinta o fundo cinza de
                  // desabilitado nela), então a tinta tem que continuar sendo a
                  // do preenchimento. Sem esta linha ele herdaria a tinta
                  // secundária do `.Mui-disabled` da raiz, e aí sim ficaria
                  // ilegível: [medido] INK_DARK.secondary x ACCENT_DARK.action.fill
                  // = 1,80:1. Com ela, segue no par calibrado do contrato.
                  color: t2.vars.palette.primary.onFill,
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '&:hover': { transform: 'none' },
                  '&:active': { transform: 'none' },
                },
              }),
            },
          ],
        }),
        // ONDA 1 (game-foundations): PADDING LATERAL MÍNIMO por tamanho
        // (ícone+texto grudados é bug reportado pelo dono). O default do MUI
        // é small 4px 10px / medium 6px 16px / large 8px 22px; aqui o small
        // sobe para 12px de paddingInline e os demais ficam EXPLÍCITOS (>= o
        // mínimo pedido: small >= 12, medium >= 16). `paddingBlock` default do
        // MUI permanece em cada tamanho — só o inline é tocado.
        sizeSmall: ({ theme: t2 }: { theme: StyleTheme }) => ({
          paddingInline: t2.spacing(1.5),
        }),
        sizeMedium: ({ theme: t2 }: { theme: StyleTheme }) => ({
          paddingInline: t2.spacing(2),
        }),
        sizeLarge: ({ theme: t2 }: { theme: StyleTheme }) => ({
          paddingInline: t2.spacing(2.75),
        }),
      },
    },

    /* ── Superfícies: variantes por NÍVEL da rampa tonal ─────────────────────
     * ONDA 11 (referência Nintendo Switch): a borda voltou de 2px para 1px e o
     * `selected` PERDEU o glow colorido. Os dois eram o traço "game" que a onda
     * 1 trouxe do leet-code-rpg, e são exatamente o que separa esta base da
     * referência: no mock do Switch nenhuma superfície tem contorno grosso nem
     * brilho de cor — o que distingue um plano do outro é a RAMPA TONAL, que é
     * a decisão 2 deste tema. Um glow de acento em cima da rampa neutra é ruído
     * colorido competindo com o único acento que deveria estar vivo na tela
     * (o CTA). O traço fica em 1px, no divisor decorativo, só para dar aresta. */
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
                border: `${SURFACE_BORDER_WIDTH}px solid ${t.vars.palette.divider}`,
                boxShadow: 'none',
              }),
            },
            {
              props: { variant: 'raised' as const },
              style: ({ theme: t }: { theme: StyleTheme }) => ({
                backgroundColor: t.vars.palette.surface.level3,
                border: `${SURFACE_BORDER_WIDTH}px solid ${t.vars.palette.divider}`,
                boxShadow: 'none',
              }),
            },
            {
              props: { variant: 'selected' as const },
              style: ({ theme: t }: { theme: StyleTheme }) => ({
                backgroundColor: t.vars.palette.surface.level4,
                border: `${SURFACE_BORDER_WIDTH}px solid ${t.vars.palette.divider}`,
                boxShadow: 'none',
              }),
            },
          ],
        },
      },
    },

    // ONDA 13: mesma decisão do `MuiButton` — o ripple de FOCO sai, o anel de
    // duas cores fica. `IconButton` também passa `focusRipple={!disableFocusRipple}`
    // para o `ButtonBase` (IconButton.js), então o default do `MuiButtonBase`
    // não alcançaria: a prop explícita do componente vence. Aqui o alvo é
    // quadrado e o círculo do ripple não deforma como na pílula, mas ele PULSA
    // do mesmo jeito enquanto o foco estiver ali — e o microfone e o enviar do
    // chat são exatamente onde o teclado mais para.
    MuiIconButton: {
      defaultProps: {
        disableFocusRipple: true,
      },
    },

    MuiCard: {
      defaultProps: {
        // borda em vez de sombra — coerente com elevação por cor.
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          // Cards em rounded-2xl (16px — o raio base do tema é 14, que vira o
          // piso de botões/inputs). ONDA 11: a borda voltou para 1px, pelo
          // mesmo motivo do MuiPaper acima.
          borderRadius: SURFACE_RADIUS,
          borderWidth: SURFACE_BORDER_WIDTH,
        },
      },
    },

    /* ── Modal: o CARTÃO SOBRE O SCRIM da referência ────────────────────────
     * Este é o componente que o dono apontou de dedo ("as cores do modo dark
     * nao ficaram boas"): no mock do Switch o modal é um retângulo de CINZA
     * MÉDIO NEUTRO, raio ~16px, sem contorno e sem brilho, flutuando sobre um
     * scrim escuro. O default do MUI entregava outra coisa: `background.paper`
     * (o nível 1 — a superfície de LEITURA, quase preta no escuro) mais a
     * sombra de elevação 24.
     *
     * A ESCOLHA DE NÍVEL É ASSIMÉTRICA ENTRE OS ESQUEMAS, e por isso passa por
     * `applyStyles` (ver o comentário de `StyleTheme.applyStyles`):
     *   - ESCURO: nível 4, o TOPO da rampa (#3b3b3b). Sob polaridade negativa,
     *     elevação é LUZ — o objeto mais alto da tela é o mais claro, e é
     *     justamente esse valor que bate com o cinza médio da referência.
     *   - CLARO: nível 1, a superfície de leitura (#ffffff). Sob polaridade
     *     positiva a rampa ESCURECE conforme sobe; usar o nível 4 aqui daria um
     *     modal bege mais escuro que a página atrás dele — um buraco, não uma
     *     elevação.
     * O scrim é quem separa o cartão do fundo nos dois casos, então a sombra de
     * elevação sai (elevação nesta base é por COR, decisão 2 do cabeçalho). */
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme: t }: { theme: StyleTheme }) => ({
          borderRadius: SURFACE_RADIUS,
          backgroundImage: 'none',
          boxShadow: 'none',
          // ONDA 12: a escolha de nível saiu daqui para `modalSurfaceStyles()`,
          // logo acima, porque o overlay do quiz não é um <Dialog> e precisa da
          // MESMA regra. Continua por último no objeto: é o galho escuro do
          // applyStyles que precisa vencer por ordem.
          ...modalSurfaceStyles(t),
        }),
      },
    },

    /* ── Scrim: o modal da referência flutua sobre um fundo BEM apagado ──────
     * O default do MUI é `rgba(0, 0, 0, 0.5)`, e a onda 11 o trocou por um
     * color-mix de 62% escrito AQUI. ONDA 12: o número saiu do tema e virou o
     * token `SCRIM` (designTokens.ts), publicado como `palette.scrim` — porque
     * o MuiBackdrop NÃO é o único scrim da base: o overlay do quiz e o de
     * geração de desafio desenham o deles à mão, e estavam pintando
     * `rgba(8, 10, 20, 0.66)`, uma cor crua AZULADA que tingia a tela inteira
     * de azul por cima da rampa neutra. Um token só, um valor só, os três
     * scrims iguais. */
    MuiBackdrop: {
      styleOverrides: {
        root: ({ theme: t }: { theme: StyleTheme }) => ({
          // `:not(.MuiBackdrop-invisible)` NÃO é preciosismo: o MUI monta o
          // scrim transparente de Menu, Select e Popover com o MESMO Backdrop,
          // marcado pela classe `invisible`, e um styleOverrides de tema é
          // aplicado DEPOIS das variantes do próprio componente. Sem o
          // `:not(...)` todo menu do app abriria com fundo preto a 62%.
          '&:not(.MuiBackdrop-invisible)': {
            backgroundColor: t.vars.palette.scrim,
          },
        }),
      },
    },

    /* ── Chips: contorno FINO (1px), como as pílulas de opção da referência.
     * A onda 1 os tinha engrossado para 2-3px ("elemento game"); a onda 11
     * desfaz isso junto com as bordas de Paper e Card — chip é rótulo, não
     * moldura. ──────────────────────────────────────────────────────────── */
    MuiChip: {
      styleOverrides: {
        root: {
          '&.MuiChip-outlined': {
            borderWidth: SURFACE_BORDER_WIDTH,
          },
        },
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
        // ── FOCO DE TECLADO NO CAMPO: DUAS CORES, E SÓ NO TECLADO ─────────
        // Estado anterior, medido com Tab no app rodando: o único indicador
        // era o `notchedOutline` de 1,6px no acento (`rgb(217,81,60)` no
        // escuro), com `box-shadow: none` e `outline: 0px`. Dois problemas, e
        // nenhum deles é contraste — o acento contra o campo mede
        // [medido] ACCENT_DARK.action.fill x SURFACE_DARK.level1 = 4,26:1 e
        // [medido] ACCENT_LIGHT.action.fill x SURFACE_LIGHT.level1 = 4,75:1:
        //   1. UMA cor só. O indicador desta base é de DUAS cores de propósito
        //      (`focusRingStyles` — técnica do Understanding do SC 1.4.11), e
        //      o campo era a única exceção da tela.
        //   2. Era `:focus-within`, não teclado. A borda vira acento também no
        //      CLIQUE de mouse, então o desenho não distinguia "cheguei aqui
        //      pelo teclado" de "cliquei aqui" — e é a primeira situação que a
        //      norma existe para servir.
        // Por que não o anel padrão: o `MuiCssBaseline` desliga `outline` e
        // halo em `input:focus-visible` de propósito (onda 1) — o outline de
        // 3px mais o halo ficam visualmente POR CIMA do campo, e o caso mais
        // visível é justamente o campo de dúvida do chat da aula. Aquela
        // decisão continua de pé.
        // A saída é pintar o anel no ROOT (a moldura), não no <input>: o
        // `:has(:focus-visible)` só casa quando o navegador decidiu mostrar
        // indicação de teclado, então o clique de mouse segue sem anel. A
        // SEGUNDA cor entra como halo de `text.primary` colado na borda de
        // acento, o mesmo par do resto do app.
        // [medido] INK_DARK.primary x SURFACE_DARK.level1 = 15,11:1 e
        // [medido] INK_LIGHT.primary x SURFACE_LIGHT.level1 = 17,90:1 — o halo
        // é a cor que carrega o piso, exatamente como no anel padrão.
        root: ({ theme: t }) => ({
          '&:has(:focus-visible)': {
            boxShadow: `0 0 0 ${FOCUS_RING.haloWidth}px ${t.vars.palette.text.primary}`,
          },
        }),
        notchedOutline: ({ theme: t }) => ({
          borderColor: t.vars.palette.nonText.neutral,
        }),
      },
    },

    /* ── As variantes `code` e `pixel` precisam de elemento próprio ────────── */
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          code: 'code',
          pixel: 'span',
        },
      },
    },
  },
});

export default theme;
