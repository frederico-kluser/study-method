/**
 * src/lib/terminalBuffer.ts — buffer de linhas IMPRESSAS do terminal de saída
 * (lógica PURA extraída de `components/terminal/AnswerTerminal.tsx`).
 *
 * ─── PORQUE EXISTE (a armadilha 3 do AnswerTerminal) ───────────────────────
 * O scrollback do xterm guarda o SGR ANTIGO: cada linha já impressa carrega o
 * truecolor absoluto que valia quando foi escrita, e trocar `options.theme`
 * NÃO desfaz um `38;2;r;g;b` que já está no buffer. A decisão (documentada no
 * componente) foi REIMPRIMIR em vez de limpar — trocar de tema não pode
 * destruir o resultado da rodada de testes que o utilizador acabou de ver.
 * Reimprimir é possível porque cada linha é guardada pelo NOME SEMÂNTICO da
 * cor (`TerminalColorName`, resolvido por `terminalColors()` de
 * `lib/codeTheme`) — e é isso que este módulo faz: guardar e re-resolver.
 *
 * O teto é o mesmo do scrollback do xterm, com descarte pela frente — a
 * memória não cresce sem limite. Puro (sem DOM, sem xterm): testável no gate
 * `node:test`, tal como `lib/terminalBanner.ts`.
 */
import { truecolorForeground, type TerminalColorName } from './codeTheme';

/** Uma linha já impressa, guardada pelo NOME da cor (não pelo hex). */
export interface TerminalBufferLine {
  text: string;
  color: TerminalColorName;
}

/** Teto de linhas guardadas — o mesmo do scrollback do xterm. */
export const TERMINAL_SCROLLBACK_LINES = 5000;

/**
 * Acrescenta uma linha ao buffer, descartando as mais antigas quando passa do
 * teto (muta o array do chamador — é o `historyRef` do componente).
 */
export function pushTerminalLine(
  buffer: TerminalBufferLine[],
  text: string,
  color: TerminalColorName = 'default',
  cap: number = TERMINAL_SCROLLBACK_LINES,
): void {
  buffer.push({ text, color });
  if (buffer.length > cap) {
    buffer.splice(0, buffer.length - cap);
  }
}

/** Esvazia o buffer (o `clear()` do handle imperativo). */
export function clearTerminalBuffer(buffer: TerminalBufferLine[]): void {
  buffer.length = 0;
}

/**
 * Formata uma linha para o `writeln` do xterm: truecolor absoluto (SGR
 * `38;2;r;g;b` — o xterm ignora `\x1b[#rrggbbm`, ver doc do componente) +
 * reset. A cor vem RESOLVIDA da paleta do esquema corrente.
 */
export function formatTerminalLine(
  line: TerminalBufferLine,
  colors: Readonly<Record<TerminalColorName, string>>,
): string {
  return `${truecolorForeground(colors[line.color])}${line.text}\x1b[0m`;
}

/**
 * Reimprime o buffer inteiro contra a paleta do esquema NOVO (armadilha 3):
 * devolve as linhas já formatadas, na ordem. É o corpo do efeito de troca de
 * esquema do AnswerTerminal (`xterm.reset()` + writeln de cada linha).
 */
export function replayTerminalLines(
  buffer: readonly TerminalBufferLine[],
  colors: Readonly<Record<TerminalColorName, string>>,
): string[] {
  return buffer.map((line) => formatTerminalLine(line, colors));
}
