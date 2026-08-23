/**
 * src/lib/draculaTheme.ts — paleta Dracula canónica (nomeada), compartilhada
 * entre o editor CodeMirror e o terminal xterm para coerência visual.
 *
 * O editor (`components/cm/CodeMirrorField.tsx`) já usa o tema real Dracula via
 * `@uiw/codemirror-theme-dracula`, cujas cores canónicas são exatamente estas
 * (ver `defaultSettingsDracula`/`draculaDarkStyle` no dist do pacote). Este
 * módulo guarda a MESMA paleta em hex, nomeada, para que o terminal
 * (`components/terminal/AnswerTerminal.tsx`) pinte a saída com as mesmas cores
 * do editor — sem duplicar hex mágico espalhado e sem depender do tema MUI
 * (o terminal e o editor permanecem Dracula escuro fixo).
 *
 * Referência: https://draculatheme.com — paleta oficial de Zeno Rocha.
 */

/** Cores nomeadas do terminal aceitas por `writeLine` do AnswerTerminal. */
export type TerminalColorName =
  | 'default'
  | 'green'
  | 'red'
  | 'yellow'
  | 'accent'
  | 'muted'
  | 'cyan';

/**
 * Paleta Dracula canónica (nomeada), espelhando as cores do tema usado no
 * editor. Background/foreground/caret batem com `defaultSettingsDracula` do
 * `@uiw/codemirror-theme-dracula`; as demais com os estilos de token
 * (`draculaDarkStyle`) e com a tabela ANSI oficial do Dracula CLI/terminalbox.
 */
export const DRACULA = {
  /** Fundo do editor/terminal (#282a36). */
  background: '#282a36',
  /** Texto padrão (#f8f8f2). */
  foreground: '#f8f8f2',
  /** Linha atual / cursor (#f8f8f0, caret do defaultSettingsDracula). */
  caret: '#f8f8f0',
  /** Comentário / muted do Dracula (#6272a4). */
  comment: '#6272a4',
  /** Magenta/purple — accent (#bd93f9). */
  purple: '#bd93f9',
  /** Ciano sintaxe (#8be9fd). */
  cyan: '#8be9fd',
  /** Verde sintaxe/status (#50fa7b). */
  green: '#50fa7b',
  /** Laranja (#ffb86c). */
  orange: '#ffb86c',
  /** Rosa/keyword (#ff79c6). */
  pink: '#ff79c6',
  /** Vermelho/erro (#ff5555). */
  red: '#ff5555',
  /** Amarelo/string (#f1fa8c). */
  yellow: '#f1fa8c',
} as const satisfies Record<string, string>;

/**
 * Mapeamento dos nomes semânticos de cor do terminal para a paleta Dracula
 * canónica. Mantém o contrato público de `writeLine` (e de `terminalBanner.ts`)
 * intacto — só muda o hex para as cores oficiais do Dracula.
 */
export const TERMINAL_DRACULA_COLORS: Readonly<Record<TerminalColorName, string>> = {
  default: DRACULA.foreground,
  green: DRACULA.green,
  red: DRACULA.red,
  yellow: DRACULA.yellow,
  accent: DRACULA.purple,
  muted: DRACULA.comment,
  cyan: DRACULA.cyan,
};

/**
 * Converte um hex `#rrggbb` (paleta Dracula) em {r,g,b} 0–255 puro.
 * Usado para montar a sequência truecolor do xterm (SGR 38;2;r;g;b) — o xterm
 * NÃO entende `\x1b[#rrggbbm` (param inválido), por isso o terminal precisa do
 * RGB numérico e não do recurso `\x1b[<hex>m`.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`hex inválida para Dracula (esperado #rrggbb): "${hex}"`);
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Sequência ANSI truecolor (SGR 38;2;r;g;b) que ADIANTE o texto para a cor
 * dada, pronta para append no buffer do xterm. É ela que torna a paleta
 * efetiva — `writeLine` a usa em vez do antigo `\x1b[<hex>m` (que o xterm
 * ignora silenciosamente, deixando a saída sem cor).
 */
export function truecolorForeground(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}