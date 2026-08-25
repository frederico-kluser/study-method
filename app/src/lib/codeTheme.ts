/**
 * src/lib/codeTheme.ts — paleta de CÓDIGO do redesign "Cartucho", em DUAS
 * polaridades, compartilhada pelo editor CodeMirror e pelo terminal xterm.
 *
 * ─── O DEFEITO QUE ESTE MÓDULO EXISTE PARA CORRIGIR ───────────────────────
 * `src/lib/draculaTheme.ts` prende editor e terminal a Dracula escuro FIXO nos
 * dois esquemas — um retângulo preto dentro de um app claro. A §7.4 de
 * `docs/ux-redesign.md` troca isso por uma paleta derivada dos acentos do app,
 * existindo em claro E escuro, com editor e terminal pintando da MESMA fonte de
 * verdade (a propriedade boa que o Dracula já tinha e que se mantém).
 *
 * ─── DE ONDE VEM CADA HEX ─────────────────────────────────────────────────
 * Nada aqui foi escolhido a olho. As matizes e saturações são EXATAMENTE as
 * cinco famílias de `ramp2.py` que geraram `ACCENT_LIGHT`/`ACCENT_DARK` em
 * `designTokens.ts` (é isso que "derivada dos acentos" quer dizer); só a
 * LUMINOSIDADE foi re-resolvida, porque o fundo mudou: o acento da UI é medido
 * contra o nível 0 e o token de código é lido contra o well.
 * Três matizes novas existem só aqui:
 *   - `rose` (h=330) para constante/magenta — o roxo `study` (h=272) é violeta,
 *     não magenta, e ocupar os dois slots com ele apagaria a distinção;
 *   - `slate` (h=215, s≈0.15) para comentário — FRIO de propósito, para não
 *     colidir com a tinta secundária QUENTE do esquema claro (#544e45), que é
 *     quem pinta o operador. Dois cinzas mornos lado a lado viram um só;
 *   - `blue` (h≈222, s≈0.62) para o slot `blue` do ANSI — ele não pertence a
 *     nenhuma família de acento: a família `info` (h=196) é CIANO e já ocupa o
 *     slot `cyan`, então sem matiz própria `blue` e `cyan` sairiam iguais na
 *     tabela de 16. O `coderamp.ts` o imprime como família à parte,
 *     `blue (ansi)`; ele é a única cromática do ANSI sem par em sintaxe/estado.
 * A varredura que produziu os valores está em `docs/ux-redesign/coderamp.ts`
 * (mesmo método do `ramp2.py`, rodável: `npx tsx ../docs/ux-redesign/coderamp.ts`).
 *
 * ─── O PISO É MEDIDO CONTRA A SELEÇÃO, NÃO CONTRA O FUNDO ─────────────────
 * Bloco de código é texto de 14px (`TYPE.codeSize`): não existe alívio de
 * "large scale text" (só a partir de 24px regular / 18,67px bold), então TODO
 * token fica preso ao piso cheio de 4,5:1 do SC 1.4.3 — comentário incluído.
 * E o token não é lido só sobre o fundo: quando o usuário seleciona uma linha
 * ele passa a ser lido sobre a FAIXA DE SELEÇÃO. Por isso a varredura mira o
 * nível 4 (a superfície mais hostil em que o token ainda precisa ser lido), o
 * que dá de brinde folga no nível 3 (linha atual) e no nível 2 (o well):
 *   claro  — seleção ≈4,5:1 · linha atual ≈5,2:1 · well ≈5,7:1
 *   escuro — seleção ≈4,5:1 · linha atual ≈5,3:1 · well ≈6,1:1
 * "O piso não negocia": onde um cinza bonito não passava, ele foi trocado.
 *
 * ─── SATURAÇÃO É LIMITADA PELO RED FLASH, NÃO PELO GOSTO ──────────────────
 * Achado medido durante a varredura (família `action`, esquema claro):
 *     s=0,78 → #af2a16   R/(R+G+B) = 0,732   ok
 *     s=0,90 → #b5200a   R/(R+G+B) = 0,812   É RED FLASH (SC 2.3.1) — proibido
 *     s=1,00 → #b71800   R/(R+G+B) = 0,884   É RED FLASH — proibido
 * Ou seja: turbinar o vermelho do erro do terminal para "ficar mais Nintendo"
 * o empurra para dentro do gatilho de fotossensibilidade, exatamente como o
 * #E60012 da Nintendo (0,927) documentado na §3.4. As saturações do `ramp2.py`
 * JÁ SÃO o teto seguro — por isso foram mantidas letra por letra. A folga real
 * de toda cor desta paleta está medida em `tests/codeTheme.test.ts`.
 *
 * ─── ZERO IMPORT DE RUNTIME (de propósito) ────────────────────────────────
 * Este módulo é só DADO. Não importa `@xterm/xterm`, `@uiw/codemirror-themes`
 * nem `@codemirror/*` em runtime:
 *   1. `@uiw/codemirror-themes`, `@codemirror/language` e `@lezer/highlight`
 *      são dependências FANTASMA (resolvem hoje por hoist, mas não estão
 *      declaradas em `app/package.json` — ver "Para a onda 2" no fim);
 *   2. `src/lib` é compilado pelo `tsconfig.node.json`, cujo `lib` é `ES2022`
 *      SEM DOM, e é dali que os testes unitários (node:test, sem jsdom) leem;
 *   3. dado puro é testável sem montar editor nem terminal.
 * Os tipos abaixo são ESTRUTURALMENTE compatíveis com `ITheme` do
 * `@xterm/xterm` e com `Settings` do `@uiw/codemirror-themes` (todos os campos
 * de lá são `string` opcionais), então o consumidor passa os objetos direto.
 */
import {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  DIVIDER_LIGHT,
  DIVIDER_DARK,
  FONT_STACK,
  TYPE,
} from './designTokens';

/* ─── Vocabulário ─────────────────────────────────────────────────────────── */

/** As duas polaridades. Espelha o `colorSchemes` do MUI (`light` | `dark`). */
export type CodeScheme = 'light' | 'dark';

/** Papéis de sintaxe pintados no editor. */
export type CodeSyntaxRole =
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'function'
  | 'type'
  | 'variable'
  | 'operator'
  | 'constant';

/** Papéis de ESTADO pintados pelo terminal (resultado de teste, aviso, etc.). */
export type CodeStateRole = 'success' | 'error' | 'warn' | 'info' | 'muted';

/**
 * Nomes semânticos de cor aceitos por `writeLine` do AnswerTerminal e emitidos
 * por `terminalBanner.ts`. Este contrato PÚBLICO é o mesmo do
 * `draculaTheme.TerminalColorName` — a onda 2 troca a FONTE das cores, não a
 * interface. Mexer nesta união quebra `buildTestBannerLines`.
 */
export type TerminalColorName =
  | 'default'
  | 'green'
  | 'red'
  | 'yellow'
  | 'accent'
  | 'muted'
  | 'cyan';

/** Listas literais dos papéis — a fonte que os testes usam para exigir completude. */
export const CODE_SYNTAX_ROLES: readonly CodeSyntaxRole[] = [
  'comment',
  'keyword',
  'string',
  'number',
  'function',
  'type',
  'variable',
  'operator',
  'constant',
] as const;

/** Idem para os papéis de estado do terminal. */
export const CODE_STATE_ROLES: readonly CodeStateRole[] = [
  'success',
  'error',
  'warn',
  'info',
  'muted',
] as const;

/** Idem para o contrato de nomes do `writeLine`. */
export const TERMINAL_COLOR_NAMES: readonly TerminalColorName[] = [
  'default',
  'green',
  'red',
  'yellow',
  'accent',
  'muted',
  'cyan',
] as const;

/* ─── Formas ──────────────────────────────────────────────────────────────── */

/**
 * Cromo do painel de código: as superfícies e os adornos que NÃO são token de
 * sintaxe. `surface` é o nível 2 da rampa (o "well" afundado, §3.1); `selection`
 * é o nível 4 e `currentLine` o nível 3 — é essa escada que a varredura usou
 * como alvo de contraste.
 */
export interface CodeChrome {
  /** Fundo do editor e do terminal — nível 2 da rampa (well de código). */
  readonly surface: string;
  /** Tinta padrão do código e da saída do terminal. */
  readonly ink: string;
  /** Faixa de seleção — nível 4. É o fundo mais hostil que a paleta tolera. */
  readonly selection: string;
  /** Seleção quando o editor perde o foco — nível 3 (mais fraca). */
  readonly selectionInactive: string;
  /** Realce da linha sob o cursor — nível 3. */
  readonly currentLine: string;
  /** Cursor/caret. É o acento `action` — o único ponto vivo da superfície quieta. */
  readonly cursor: string;
  /** Tinta do caractere COBERTO por um cursor em bloco (o inverso do `cursor`). */
  readonly cursorAccent: string;
  /** Fundo da calha de números — igual ao well, para não criar degrau. */
  readonly gutterBackground: string;
  /** Número de linha inativo. */
  readonly gutterForeground: string;
  /** Número da linha atual. */
  readonly gutterActiveForeground: string;
  /** Fio entre a calha e o código. */
  readonly gutterBorder: string;
  /** Contorno do painel contra a superfície de fora. */
  readonly border: string;
}

/**
 * Tabela ANSI de 16 cores do terminal. Existe porque a saída DETERMINÍSTICA dos
 * testes é texto de um processo real (compilador, runner) e pode vir com
 * escapes ANSI próprios — sem esta tabela o xterm cairia nos defaults dele, que
 * são calibrados para fundo preto e somem no esquema claro.
 *
 * REGRA DOS QUATRO CINZAS: em polaridade NEGATIVA eles vão do mais atenuado
 * (`black`) ao mais forte (`brightWhite`); em polaridade POSITIVA a escada é
 * INVERTIDA. Em nenhum dos dois o "branco" é branco nem o "preto" é preto — se
 * fosse, metade da saída desapareceria na própria superfície.
 */
export interface CodeAnsi {
  readonly black: string;
  readonly red: string;
  readonly green: string;
  readonly yellow: string;
  readonly blue: string;
  readonly magenta: string;
  readonly cyan: string;
  readonly white: string;
  readonly brightBlack: string;
  readonly brightRed: string;
  readonly brightGreen: string;
  readonly brightYellow: string;
  readonly brightBlue: string;
  readonly brightMagenta: string;
  readonly brightCyan: string;
  readonly brightWhite: string;
}

/** Chaves da tabela ANSI — usada pelos testes para exigir as 16. */
export const CODE_ANSI_KEYS: readonly (keyof CodeAnsi)[] = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

/** Uma polaridade inteira da paleta de código. */
export interface CodePalette {
  readonly scheme: CodeScheme;
  readonly chrome: CodeChrome;
  readonly syntax: Readonly<Record<CodeSyntaxRole, string>>;
  readonly state: Readonly<Record<CodeStateRole, string>>;
  readonly ansi: CodeAnsi;
}

/* ─── CLARO ───────────────────────────────────────────────────────────────
 * well #f3eee5 · linha atual #e9e2d6 · seleção #ddd5c6
 * Varredura: o L mais CLARO (mais vívido) de cada matiz que ainda alcança
 * 4,5:1 contra a SELEÇÃO. Ratios medidos (well / linha / seleção):
 *   keyword  #af2a16  5,74 / 5,15 / 4,55
 *   string   #196941  5,79 / 5,20 / 4,59
 *   function #0b6484  5,73 / 5,15 / 4,54
 *   number   #7f5305  5,78 / 5,19 / 4,59
 *   type     #812fc8  5,73 / 5,14 / 4,54
 *   constant #ad1f66  5,74 / 5,16 / 4,55
 *   comment  #525d6d  5,78 / 5,19 / 4,58
 *   variable #191713 15,49 /13,90 /12,28   (tinta primária — token mais frequente
 *                                           fica NEUTRO; código não é arco-íris)
 *   operator #544e45  7,12 / 6,39 / 5,64   (tinta secundária — pontuação densa
 *                                           colorida é ruído, não informação)
 */
export const CODE_LIGHT: CodePalette = {
  scheme: 'light',
  chrome: {
    surface: SURFACE_LIGHT.level2,
    ink: INK_LIGHT.primary,
    selection: SURFACE_LIGHT.level4,
    selectionInactive: SURFACE_LIGHT.level3,
    currentLine: SURFACE_LIGHT.level3,
    cursor: '#af2a16',
    cursorAccent: SURFACE_LIGHT.level2,
    gutterBackground: SURFACE_LIGHT.level2,
    gutterForeground: '#525d6d',
    gutterActiveForeground: INK_LIGHT.primary,
    gutterBorder: DIVIDER_LIGHT,
    border: DIVIDER_LIGHT,
  },
  syntax: {
    comment: '#525d6d',
    keyword: '#af2a16',
    string: '#196941',
    number: '#7f5305',
    function: '#0b6484',
    type: '#812fc8',
    variable: INK_LIGHT.primary,
    operator: INK_LIGHT.secondary,
    constant: '#ad1f66',
  },
  state: {
    success: '#196941',
    error: '#af2a16',
    warn: '#7f5305',
    info: '#0b6484',
    muted: '#525d6d',
  },
  ansi: {
    // escada de cinza INVERTIDA (polaridade positiva): forte → atenuado
    black: INK_LIGHT.primary,
    brightBlack: '#46505d',
    white: '#525d6d',
    brightWhite: INK_LIGHT.secondary,
    // cromáticas: normal = valor do estado/sintaxe; bright = mesma matiz a 7:1
    // contra o well. Em polaridade positiva "brilhante" significa MAIS ESCURO
    // (mais ênfase) — clarear a saída no papel a apagaria.
    red: '#af2a16',
    brightRed: '#962413',
    green: '#196941',
    brightGreen: '#155b38',
    yellow: '#7f5305',
    brightYellow: '#6e4705',
    blue: '#2c57bc',
    brightBlue: '#254a9f',
    magenta: '#ad1f66',
    brightMagenta: '#961a58',
    cyan: '#0b6484',
    brightCyan: '#095571',
  },
} as const;

/* ─── ESCURO ──────────────────────────────────────────────────────────────
 * well #232733 · linha atual #2c313f · seleção #363c4c
 * Mesma varredura na direção oposta (o L mais ESCURO que passa). Ratios:
 *   keyword  #f08a7a  6,12 / 5,33 / 4,52
 *   string   #2dbe75  6,20 / 5,40 / 4,58
 *   function #23b2e7  6,10 / 5,31 / 4,50
 *   number   #e4950c  6,10 / 5,32 / 4,51
 *   type     #c494ee  6,26 / 5,45 / 4,62
 *   constant #eb86b9  6,13 / 5,34 / 4,53
 *   comment  #9ca7b7  6,12 / 5,33 / 4,52
 *   variable #eceef4 12,84 /11,19 / 9,49
 *   operator #a7adbd  6,64 / 5,78 / 4,90
 * O vermelho escuro sai salmão (#f08a7a) e não vinho: vermelho tem coeficiente
 * de luminância baixo (0,2126), então alcançar 4,5:1 contra uma superfície
 * média-escura EXIGE clarear. Compare com o #ff5555 do Dracula, que dá só
 * 4,53:1 contra o próprio fundo (#282a36) — e 2,91:1 sobre a seleção dele
 * (#44475a), ou seja, ABAIXO do piso assim que o texto é selecionado.
 */
export const CODE_DARK: CodePalette = {
  scheme: 'dark',
  chrome: {
    surface: SURFACE_DARK.level2,
    ink: INK_DARK.primary,
    selection: SURFACE_DARK.level4,
    selectionInactive: SURFACE_DARK.level3,
    currentLine: SURFACE_DARK.level3,
    cursor: '#f08a7a',
    cursorAccent: SURFACE_DARK.level2,
    gutterBackground: SURFACE_DARK.level2,
    gutterForeground: '#9ca7b7',
    gutterActiveForeground: INK_DARK.primary,
    gutterBorder: DIVIDER_DARK,
    border: DIVIDER_DARK,
  },
  syntax: {
    comment: '#9ca7b7',
    keyword: '#f08a7a',
    string: '#2dbe75',
    number: '#e4950c',
    function: '#23b2e7',
    type: '#c494ee',
    variable: INK_DARK.primary,
    operator: INK_DARK.secondary,
    constant: '#eb86b9',
  },
  state: {
    success: '#2dbe75',
    error: '#f08a7a',
    warn: '#e4950c',
    info: '#23b2e7',
    muted: '#9ca7b7',
  },
  ansi: {
    // escada de cinza (polaridade negativa): atenuado → forte
    black: '#9ca7b7',
    brightBlack: '#a9b3c1',
    white: INK_DARK.secondary,
    brightWhite: INK_DARK.primary,
    red: '#f08a7a',
    brightRed: '#f39c8f',
    green: '#2dbe75',
    brightGreen: '#30cc7e',
    yellow: '#e4950c',
    brightYellow: '#f3a114',
    blue: '#8ba6e4',
    brightBlue: '#9cb3e8',
    magenta: '#eb86b9',
    brightMagenta: '#ee98c3',
    cyan: '#23b2e7',
    brightCyan: '#47bfeb',
  },
} as const;

/** Seletor por esquema — o ponto de entrada de todo consumidor. */
export function codePalette(scheme: CodeScheme): CodePalette {
  return scheme === 'dark' ? CODE_DARK : CODE_LIGHT;
}

/* ─── Contrato de TIPOGRAFIA (editor E terminal) ──────────────────────────── */

/**
 * A tipografia do código, em UMA declaração para os dois consumidores.
 *
 * ─── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * `xtermTheme()` exporta só COR (`XtermCodeTheme extends CodeAnsi`). Sem um
 * contrato de tipografia, o terminal ficou com uma pilha própria escrita à mão
 * — `'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace`, SEM a
 * variável `'JetBrains Mono Variable'` que é a única realmente empacotada — e
 * com um corpo de 13 literal. O editor, lendo daqui, ia para JetBrains Mono
 * Variable 14px: família E tamanho divergentes, exatamente na propriedade que a
 * §7.4 nomeia como a que importa (editor e terminal pintam da MESMA fonte de
 * verdade). O defeito era invisível enquanto as fontes nem carregavam — os dois
 * lados caíam no `monospace` do sistema e pareciam iguais.
 *
 * ─── POR QUE NÃO É POR POLARIDADE ─────────────────────────────────────────
 * Não é `Record<CodeScheme, …>` nem campo de `CodePalette`: a fonte do código
 * não muda entre claro e escuro, e duplicá-la nas duas polaridades criaria o
 * lugar exato onde elas voltariam a divergir. Uma constante só.
 *
 * ─── AS DUAS FORMAS DO MESMO NÚMERO ───────────────────────────────────────
 * `new Terminal({ fontSize })` do xterm exige NÚMERO em px; `settings.fontSize`
 * do `@uiw/codemirror-themes` exige STRING com unidade. As duas saem daqui já
 * prontas, para que nenhum consumidor componha `${...}px` na mão — é assim que
 * um `13` literal reaparece.
 */
export interface CodeTypography {
  /** Pilha monoespaçada — a MESMA de `FONT_STACK.mono` (a `@fontsource-variable`). */
  readonly fontFamily: string;
  /** Corpo em px, como NÚMERO — a forma que o construtor do xterm exige. */
  readonly fontSizePx: number;
  /** O MESMO corpo com unidade — a forma que o CodeMirror exige. */
  readonly fontSize: string;
}

/** A tipografia do código. Única, compartilhada, sem polaridade. */
export const CODE_TYPOGRAPHY: CodeTypography = {
  fontFamily: FONT_STACK.mono,
  fontSizePx: TYPE.codeSize,
  fontSize: `${TYPE.codeSize}px`,
} as const;

/**
 * Acessor da tipografia do código — a porta que editor e terminal usam.
 * Sem parâmetro de propósito: ver "POR QUE NÃO É POR POLARIDADE" acima.
 */
export function codeTypography(): CodeTypography {
  return CODE_TYPOGRAPHY;
}

/* ─── Contrato do terminal ────────────────────────────────────────────────── */

/**
 * Mapa dos nomes semânticos de `writeLine` para a paleta CLARA.
 * `accent` é o roxo `study` (papel de destaque, como o purple do Dracula era) e
 * `cyan` é a família `info` — os dois nomes existem por compatibilidade com o
 * `terminalBanner.ts` e continuam significando a mesma coisa.
 */
export const TERMINAL_CODE_COLORS_LIGHT: Readonly<Record<TerminalColorName, string>> = {
  default: CODE_LIGHT.chrome.ink,
  green: CODE_LIGHT.state.success,
  red: CODE_LIGHT.state.error,
  yellow: CODE_LIGHT.state.warn,
  accent: CODE_LIGHT.syntax.type,
  muted: CODE_LIGHT.state.muted,
  cyan: CODE_LIGHT.state.info,
};

/** Idem para a paleta ESCURA. */
export const TERMINAL_CODE_COLORS_DARK: Readonly<Record<TerminalColorName, string>> = {
  default: CODE_DARK.chrome.ink,
  green: CODE_DARK.state.success,
  red: CODE_DARK.state.error,
  yellow: CODE_DARK.state.warn,
  accent: CODE_DARK.syntax.type,
  muted: CODE_DARK.state.muted,
  cyan: CODE_DARK.state.info,
};

/** Seletor do mapa de nomes semânticos do terminal. */
export function terminalColors(scheme: CodeScheme): Readonly<Record<TerminalColorName, string>> {
  return scheme === 'dark' ? TERMINAL_CODE_COLORS_DARK : TERMINAL_CODE_COLORS_LIGHT;
}

/**
 * Tema do xterm. ESTRUTURALMENTE compatível com `ITheme` de `@xterm/xterm`
 * (lá todo campo é `string` opcional), então vai direto em
 * `new Terminal({ theme: xtermTheme(scheme) })` sem cast.
 */
export interface XtermCodeTheme extends CodeAnsi {
  readonly background: string;
  readonly foreground: string;
  readonly cursor: string;
  readonly cursorAccent: string;
  readonly selectionBackground: string;
  readonly selectionInactiveBackground: string;
}

function toXtermTheme(p: CodePalette): XtermCodeTheme {
  return {
    background: p.chrome.surface,
    foreground: p.chrome.ink,
    cursor: p.chrome.cursor,
    cursorAccent: p.chrome.cursorAccent,
    selectionBackground: p.chrome.selection,
    selectionInactiveBackground: p.chrome.selectionInactive,
    ...p.ansi,
  };
  // `selectionForeground` fica AUSENTE de propósito: fixá-lo apagaria a cor de
  // sintaxe do texto selecionado, e é justamente para o texto continuar
  // colorido sobre a seleção que a varredura mirou o nível 4.
}

/** Tema xterm do esquema claro. */
export const XTERM_THEME_LIGHT: XtermCodeTheme = toXtermTheme(CODE_LIGHT);

/** Tema xterm do esquema escuro. */
export const XTERM_THEME_DARK: XtermCodeTheme = toXtermTheme(CODE_DARK);

/** Seletor do tema xterm. */
export function xtermTheme(scheme: CodeScheme): XtermCodeTheme {
  return scheme === 'dark' ? XTERM_THEME_DARK : XTERM_THEME_LIGHT;
}

/* ─── Contrato do editor ──────────────────────────────────────────────────── */

/**
 * Ajustes de aparência do CodeMirror. ESTRUTURALMENTE compatível com
 * `CreateThemeOptions['settings']` de `@uiw/codemirror-themes` (o mesmo shape
 * que o `defaultSettingsDracula` preenchia), então entra direto em
 * `createTheme({ theme, settings: codeMirrorSettings(scheme), styles })`.
 */
export interface CodeMirrorCodeSettings {
  readonly background: string;
  readonly foreground: string;
  readonly caret: string;
  readonly selection: string;
  readonly selectionMatch: string;
  readonly lineHighlight: string;
  readonly gutterBackground: string;
  readonly gutterForeground: string;
  readonly gutterActiveForeground: string;
  readonly gutterBorder: string;
  readonly fontFamily: string;
  readonly fontSize: string;
}

function toCodeMirrorSettings(p: CodePalette): CodeMirrorCodeSettings {
  return {
    background: p.chrome.surface,
    foreground: p.chrome.ink,
    caret: p.chrome.cursor,
    selection: p.chrome.selection,
    selectionMatch: p.chrome.selectionInactive,
    lineHighlight: p.chrome.currentLine,
    gutterBackground: p.chrome.gutterBackground,
    gutterForeground: p.chrome.gutterForeground,
    gutterActiveForeground: p.chrome.gutterActiveForeground,
    gutterBorder: p.chrome.gutterBorder,
    fontFamily: CODE_TYPOGRAPHY.fontFamily,
    fontSize: CODE_TYPOGRAPHY.fontSize,
  };
}

/** Settings do CodeMirror no esquema claro. */
export const CODEMIRROR_SETTINGS_LIGHT: CodeMirrorCodeSettings = toCodeMirrorSettings(CODE_LIGHT);

/** Settings do CodeMirror no esquema escuro. */
export const CODEMIRROR_SETTINGS_DARK: CodeMirrorCodeSettings = toCodeMirrorSettings(CODE_DARK);

/** Seletor dos settings do CodeMirror. */
export function codeMirrorSettings(scheme: CodeScheme): CodeMirrorCodeSettings {
  return scheme === 'dark' ? CODEMIRROR_SETTINGS_DARK : CODEMIRROR_SETTINGS_LIGHT;
}

/**
 * Mapa papel-de-sintaxe → hex, pronto para virar os `styles: TagStyle[]` do
 * `createTheme`. Fica separado dos settings porque a ponte papel → tag do
 * `@lezer/highlight` é decisão do consumidor (ver "Para a onda 2" no topo do
 * arquivo) e este módulo não importa CodeMirror.
 */
export function codeMirrorSyntax(scheme: CodeScheme): Readonly<Record<CodeSyntaxRole, string>> {
  return codePalette(scheme).syntax;
}

/* ─── Utilitários ANSI (o terminal depende deles) ─────────────────────────── */

/**
 * Converte `#rrggbb` em {r,g,b} 0–255. O xterm NÃO entende `\x1b[#rrggbbm`
 * (parâmetro inválido) — ele precisa do RGB numérico.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`hex inválida (esperado #rrggbb): "${hex}"`);
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Sequência ANSI truecolor (SGR 38;2;r;g;b) que adianta o texto para a cor
 * dada. É ela que torna a paleta efetiva no buffer do xterm.
 */
export function truecolorForeground(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/* ─── Introspecção (a favor dos testes e da onda 2) ───────────────────────── */

/**
 * TODA cor de uma polaridade, achatada em pares `[rótulo, hex]`. Existe para
 * que o teste de contraste e o de red flash varram a paleta REAL em vez de uma
 * lista escrita à mão: cor nova entra automaticamente sob as duas garantias, e
 * um teste que passasse com a paleta vazia deixa de ser possível.
 */
export function codeColorEntries(p: CodePalette): readonly (readonly [string, string])[] {
  const out: [string, string][] = [];
  for (const role of CODE_SYNTAX_ROLES) out.push([`syntax.${role}`, p.syntax[role]]);
  for (const role of CODE_STATE_ROLES) out.push([`state.${role}`, p.state[role]]);
  for (const key of CODE_ANSI_KEYS) out.push([`ansi.${key}`, p.ansi[key]]);
  out.push(['chrome.cursor', p.chrome.cursor]);
  out.push(['chrome.gutterForeground', p.chrome.gutterForeground]);
  out.push(['chrome.gutterActiveForeground', p.chrome.gutterActiveForeground]);
  return out;
}

/**
 * Cores que a camada de resposta PODE animar (o banner de teste piscando, o
 * cursor, a linha de erro). Todas precisam de folga contra o limiar de red
 * flash do SC 2.3.1 — ver `isRedFlashColor` em `designTokens.ts`.
 */
export function animatableCodeColors(p: CodePalette): readonly (readonly [string, string])[] {
  return [
    ['state.error', p.state.error],
    ['state.success', p.state.success],
    ['state.warn', p.state.warn],
    ['state.info', p.state.info],
    ['chrome.cursor', p.chrome.cursor],
    ['ansi.red', p.ansi.red],
    ['ansi.brightRed', p.ansi.brightRed],
  ] as const;
}
