/**
 * src/lib/terminalBanner.ts — lógica PURA do banner PASS/FAIL do terminal de
 * saída (extraída do componente AnswerTerminal para ser testável sem DOM).
 *
 * Recebe o resultado determinístico dos testes (`passed`, contagens, saída crua)
 * e devolve a lista de linhas a imprimir, cada uma com a cor ANSI nomeada. O
 * componente React (`components/terminal/AnswerTerminal.printTestBanner`) apenas
 * itera estas linhas chamando `terminal.writeLine(line.text, line.color)`.
 *
 * O CONTRATO DE COR NÃO MUDOU nesta onda — a FONTE mudou. `TerminalBannerColor`
 * era uma união escrita à mão, byte a byte igual à de `draculaTheme.ts`; agora
 * é um ALIAS de `TerminalColorName` (`lib/codeTheme`), de onde `writeLine`
 * resolve o hex. Os sete nomes seguem os mesmos, e o alias existe para que
 * acrescentar um nome aqui e esquecê-lo lá deixe de compilar: duas cópias de
 * uma união só divergem em silêncio. É import de TIPO (apagado na emissão),
 * então este módulo continua puro e sem dependência de runtime.
 */
import type { TerminalColorName } from './codeTheme';

/** Cores nomeadas compatíveis com o mapeamento ANSI do AnswerTerminal. */
export type TerminalBannerColor = TerminalColorName;

/** Uma linha do banner: texto + cor nomeada. */
export interface TerminalBannerLine {
  text: string;
  color: TerminalBannerColor;
}

/** Entrada do resultado determinístico dos testes (shape de `TestAnswerResult`). */
export interface TerminalBannerInput {
  passed: boolean;
  testsRun: number;
  expectedTests: number;
  output: string;
}

const RULE_MUTED: TerminalBannerLine = { text: '──────────────────────────────────────────', color: 'muted' };

/**
 * Monta a sequência de linhas do banner (cabeçalho + PASS/FAIL + contagens +
 * saída real). Linhas com texto vazio são descartadas. Mantém a MESMA ordem e
 * conteúdo exibidos pelo AnswerTerminal histórico.
 */
export function buildTestBannerLines(input: TerminalBannerInput): TerminalBannerLine[] {
  const lines: TerminalBannerLine[] = [
    { text: '=== TESTES (fase determinística) ===', color: 'muted' },
    {
      text: input.passed ? 'PASSOU' : 'NÃO PASSOU',
      color: input.passed ? 'green' : 'red',
    },
    {
      text: `TESTS_RUN=${input.testsRun} ESPERADOS=${input.expectedTests}`,
      color: 'muted',
    },
  ];

  const out = (input.output ?? '').trim();
  if (out) {
    lines.push(RULE_MUTED);
    for (const line of out.split(/\r?\n/)) {
      lines.push({ text: line, color: 'default' });
    }
  }
  lines.push({ text: '==========================================', color: 'muted' });
  return lines;
}