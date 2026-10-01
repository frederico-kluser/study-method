/**
 * src/lib/codeTheme.ts — paleta de CÓDIGO do design system "Apple", em DUAS
 * polaridades, compartilhada pelo editor CodeMirror e pelo terminal xterm.
 *
 * ─── O DEFEITO QUE ESTE MÓDULO EXISTE PARA CORRIGIR ───────────────────────
 * `src/lib/draculaTheme.ts` prende editor e terminal a Dracula escuro FIXO nos
 * dois esquemas — um retângulo preto dentro de um app claro. Este módulo troca
 * isso por uma paleta existindo em claro E escuro, com editor e terminal
 * pintando da MESMA fonte de verdade.
 *
 * ─── DE ONDE VEM CADA HEX ─────────────────────────────────────────────────
 * As MATIZES são as do Xcode: a preferência "Syntax Coloring" do editor da
 * Apple, papel por papel. A LUMINOSIDADE é re-resolvida para as superfícies
 * deste app, com a varredura em `tools/design/codepalette.ts` (rodável:
 * `npx tsx tools/design/codepalette.ts`). O contrato completo das decisões está
 * em `docs/ux-apple.md`, §7.
 *
 * ─── O PISO É MEDIDO CONTRA A SELEÇÃO, NÃO CONTRA O FUNDO ─────────────────
 * Bloco de código é texto de 15px: não existe alívio de "large scale text" (só
 * a partir de 24px regular / 18,67px bold), então TODO token fica preso ao piso
 * cheio de 4,5:1 do SC 1.4.3 — comentário incluído. E o token não é lido só
 * sobre o fundo: quando o usuário seleciona uma linha ele passa a ser lido
 * sobre a FAIXA DE SELEÇÃO. "O piso não negocia": onde um cinza bonito não
 * passava, ele foi trocado.
 *
 * ─── ZERO IMPORT DE RUNTIME (de propósito) ────────────────────────────────
 * Este módulo é só DADO. Não importa `@xterm/xterm`, `@uiw/codemirror-themes`
 * nem `@codemirror/*` em runtime, por três razões:
 *   1. `src/lib` é compilado pelo `tsconfig.node.json`, cujo `lib` é `ES2022`
 *      SEM DOM, e é daqui que os testes unitários (node:test, sem jsdom) leem;
 *   2. dado puro é testável sem montar editor nem terminal;
 *   3. os tipos abaixo são ESTRUTURALMENTE compatíveis com `ITheme` do
 *      `@xterm/xterm` e com `Settings` do `@uiw/codemirror-themes` (todos os
 *      campos de lá são `string` opcionais), então o consumidor passa os
 *      objetos direto, sem conversão.
 */
import {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  DIVIDER_LIGHT,
  DIVIDER_DARK,
  FONT_STACK,
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

/**
 * ONDA-CODIGO-EDITOR (pedido do dono: *"quero que melhore os items de saida ou
 * demonstração de código… com highlight para ate o output, e ficar facil de
 * entender as coisas"*): o vocabulário PINTÁVEL total de uma superfície de
 * código — os 9 papéis de SINTAXE (o que é código-fonte) mais os 5 de ESTADO
 * (o que o computador responde). A SAÍDA passa a ser pintada com os papéis de
 * estado (mais `string`/`number` para valores citados/contagens) em vez de
 * sair monocromática: "teste falhou" em vermelho e "✓ passou" em verde são
 * informação de leitura, não enfeite. Contraste dos 14 papéis medido contra o
 * well (nível 2) nas DUAS polaridades: sintaxe ≥ 4,5:1 (varredura
 * `tools/design/codepalette.ts`) e estado ≥ 5,37:1 (medido; ver o teste de
 * contraste de chatCodePresentation).
 */
export type CodePaintRole = CodeSyntaxRole | CodeStateRole;

/** Todos os papéis pintáveis — a fonte dos testes de completude das classes. */
export const CODE_PAINT_ROLES: readonly CodePaintRole[] = [
  ...CODE_SYNTAX_ROLES,
  ...CODE_STATE_ROLES,
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

/* ─── DE ONDE VEM CADA HOJE ───────────────────────────────────────────────
 * As MATIZES são as do Xcode, o editor da Apple: cada papel de sintaxe herda a
 * cor que o Xcode publica na preferência "Syntax Coloring" (Comments, Keywords,
 * Strings, Numbers, Project Function Names, Project Class Names, Attributes).
 * É isso que "fiel aos produtos Apple" significa aqui — não uma paleta inventada
 * com ar de Apple, e sim a paleta que a própria Apple usa para ler código.
 *
 * O que NÃO vem do Xcode é a LUMINOSIDADE. Ela é re-resolvida porque o fundo é
 * outro: no Xcode a seleção é azul e o editor é quase branco (ou quase preto);
 * aqui a seleção é o nível 4 da rampa tonal do app, e é contra ela que cada
 * token precisa ser lido. A varredura que produz os valores está em
 * `tools/design/codepalette.ts` (rodável: `npx tsx tools/design/codepalette.ts`).
 *
 * Três decisões de composição ficam explícitas:
 *   - `variable` é a TINTA primária e `operator` a secundária. O token mais
 *     frequente do código fica NEUTRO: código inteiro colorido é arco-íris, e
 *     arco-íris é ruído, não informação.
 *   - o `normal` de cada cromática ANSI é o MESMO valor do estado do terminal
 *     correspondente. "Teste falhou" em vermelho e a saída ANSI em vermelho
 *     têm que ser o mesmo vermelho, ou o terminal fala duas línguas.
 *   - `function` (Project Function Names) e `type` (Project Class Names) são os
 *     dois teals adjacentes do Xcode. Eles são próximos POR REFERÊNCIA: é assim
 *     que o Xcode desenha, e separá-los por invenção quebraria a fidelidade que
 *     este módulo existe para ter.
 *
 * ─── O PISO É MEDIDO CONTRA A SELEÇÃO, NÃO CONTRA O FUNDO ─────────────────
 * Bloco de código é texto de 15px: não existe alívio de "large scale text" (só
 * a partir de 24px regular / 18,67px bold), então TODO token fica preso ao piso
 * cheio de 4,5:1 do SC 1.4.3 — comentário incluído. E o token não é lido só
 * sobre o fundo: quando o usuário seleciona uma linha ele passa a ser lido
 * sobre a FAIXA DE SELEÇÃO, que é a superfície mais hostil da paleta.
 *
 * ─── A TABELA ANSI TEM DOIS NÍVEIS DE ÊNFASE ─────────────────────────────
 * O `bright` é levado A 7:1 contra o well, com teto: o invariante é "levado a
 * 7:1", não "escurecido à vontade". O `normal` fica ABAIXO dessa faixa, para o
 * par não empatar em ênfase, e ainda acima do piso de texto sobre a seleção.
 * Essa janela só existe porque a distância em luminância entre o well (nível 2)
 * e a seleção (nível 4) foi calibrada para ela — ver SURFACE_DARK em
 * `designTokens.ts`.
 *
 * ─── SATURAÇÃO É LIMITADA PELO RED FLASH, NÃO PELO GOSTO ──────────────────
 * A família do erro é a que mais se aproxima do teto do SC 2.3.1 e é por isso
 * que ela desce de saturação: turbinar o vermelho do terminal empurra a cor
 * para dentro do gatilho de fotossensibilidade. A folga real de toda cor desta
 * paleta está medida em `tests/codeTheme.test.ts`.
 */

/* ─── CLARO ───────────────────────────────────────────────────────────────
 * well #ececf2 · linha atual #e0e0e8 · seleção #d9d9e3
 * Matizes do Xcode, luminância resolvida para o L mais CLARO (mais vívido) de
 * cada uma que ainda alcança o piso de texto sobre a SELEÇÃO.
 */
export const CODE_LIGHT: CodePalette = {
  scheme: 'light',
  chrome: {
    surface: SURFACE_LIGHT.level2,
    ink: INK_LIGHT.primary,
    selection: SURFACE_LIGHT.level4,
    selectionInactive: SURFACE_LIGHT.level3,
    currentLine: SURFACE_LIGHT.level3,
    cursor: '#005dbb',
    cursorAccent: SURFACE_LIGHT.level2,
    gutterBackground: SURFACE_LIGHT.level2,
    gutterForeground: '#54616d',
    gutterActiveForeground: INK_LIGHT.primary,
    gutterBorder: DIVIDER_LIGHT,
    border: DIVIDER_LIGHT,
  },
  syntax: {
    comment: '#54616d',
    keyword: '#a4259c',
    string: '#b9221e',
    number: '#484add',
    function: '#2f676e',
    type: '#3a666c',
    variable: INK_LIGHT.primary,
    operator: INK_LIGHT.secondary,
    constant: '#715d23',
  },
  state: {
    success: '#1c6e31',
    error: '#b8241c',
    warn: '#885300',
    info: '#006690',
    muted: '#54616d',
  },
  ansi: {
    // escada de cinza INVERTIDA (polaridade positiva): forte → atenuado
    black: INK_LIGHT.primary,
    brightBlack: '#323234',
    white: '#464648',
    brightWhite: '#5b5b5d',
    // cromáticas: normal = valor do estado; bright = mesma matiz a 7:1 contra o
    // well. Em polaridade positiva "brilhante" significa MAIS ESCURO (mais
    // ênfase) — clarear a saída no papel a apagaria.
    red: '#b8241c',
    brightRed: '#981e17',
    green: '#1c6e31',
    brightGreen: '#145a25',
    yellow: '#885300',
    brightYellow: '#704400',
    blue: '#2057ce',
    brightBlue: '#1a47a9',
    magenta: '#9411d7',
    brightMagenta: '#7b0eb2',
    cyan: '#006690',
    brightCyan: '#005477',
  },
} as const;

/* ─── ESCURO ──────────────────────────────────────────────────────────────
 * well #2c2c2e · linha atual #363638 · seleção #404042
 * Mesmas matizes do Xcode, luminância resolvida na direção oposta: o L mais
 * ESCURO de cada uma que ainda alcança o piso de texto sobre a SELEÇÃO.
 */
export const CODE_DARK: CodePalette = {
  scheme: 'dark',
  chrome: {
    surface: SURFACE_DARK.level2,
    ink: INK_DARK.primary,
    selection: SURFACE_DARK.level4,
    selectionInactive: SURFACE_DARK.level3,
    currentLine: SURFACE_DARK.level3,
    cursor: '#61b0ff',
    cursorAccent: SURFACE_DARK.level2,
    gutterBackground: SURFACE_DARK.level2,
    gutterForeground: '#a1adb7',
    gutterActiveForeground: INK_DARK.primary,
    gutterBorder: DIVIDER_DARK,
    border: DIVIDER_DARK,
  },
  syntax: {
    comment: '#a1adb7',
    keyword: '#e58cdf',
    string: '#f2908d',
    number: '#a3a5ee',
    function: '#6bb7c0',
    type: '#7fb4ba',
    variable: INK_DARK.primary,
    operator: INK_DARK.secondary,
    constant: '#c8a84b',
  },
  state: {
    success: '#32c457',
    error: '#ff8982',
    warn: '#f59500',
    info: '#03b6ff',
    muted: '#a1adb7',
  },
  ansi: {
    // escada de cinza na polaridade negativa: atenuado → forte
    black: '#acacae',
    brightBlack: '#c0c0c2',
    white: '#d7d7d9',
    brightWhite: '#ececee',
    red: '#ff8982',
    brightRed: '#ff9f99',
    green: '#32c457',
    brightGreen: '#35d35c',
    yellow: '#f59500',
    brightYellow: '#ffa416',
    blue: '#8cabed',
    brightBlue: '#9eb8f0',
    magenta: '#d491f6',
    brightMagenta: '#dba3f8',
    cyan: '#03b6ff',
    brightCyan: '#36c5ff',
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

/** A tipografia do código. Única, compartilhada, sem polaridade.
 *
 * ONDA 1 (game-foundations): 14 → 15, junto da variante `code` do tema
 * (src/theme.ts) — editor e terminal são a TELA que o usuário lê, e o pedido
 * do dono foi tipografia maior. `TYPE.codeSize` (14) permanece o número do
 * CONTRATO (calibração de contraste e construtor do xterm não mudam de fonte
 * de verdade); o valor EFETIVO de renderização mora aqui, com a mesma
 * estrutura do tema (string com unidade para o CodeMirror, número para o
 * xterm). */
export const CODE_TYPOGRAPHY: CodeTypography = {
  fontFamily: FONT_STACK.mono,
  fontSizePx: 15,
  fontSize: '15px',
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
