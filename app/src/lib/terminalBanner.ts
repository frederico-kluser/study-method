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

/**
 * S4 (auditoria de UX): as LINHAS de texto do banner chegam TRADUZIDAS por
 * argumento — quem chama tem `t()`, este módulo continua puro e sem i18n.
 * Antes as quatro frases viviam aqui em pt-BR cru (o utilizador via
 * "TESTES (fase determinística)" / "TESTS_RUN=… ESPERADOS=…" — jargão
 * interno + EN/PT na mesma linha). `counts` já vem interpolado pelo chamador
 * ("{{n}} de {{m}} testes" → "3 de 5 testes"): a terminologia é ÚNICA, a do
 * `partialCount` ("N de M testes").
 */
export interface TerminalBannerLabels {
  /** Linha de título (ex.: "=== TESTES ==="). */
  title: string;
  /** Linha de SUCESSO (ex.: "PASSOU"). */
  passed: string;
  /** Linha de FALHA (ex.: "NÃO PASSOU"). */
  failed: string;
  /** Contagens já interpoladas (ex.: "3 de 5 testes"). */
  counts: string;
}

const RULE_MUTED: TerminalBannerLine = { text: '──────────────────────────────────────────', color: 'muted' };

/**
 * Monta a sequência de linhas do banner (cabeçalho + PASS/FAIL + contagens +
 * saída real). Linhas com texto vazio são descartadas. A ORDEM e a estrutura
 * são as do AnswerTerminal histórico; os TEXTOS vêm todos em `labels`
 * (traduzidos pelo chamador — ver `TerminalBannerLabels`).
 */
export function buildTestBannerLines(
  input: TerminalBannerInput,
  labels: TerminalBannerLabels,
): TerminalBannerLine[] {
  const lines: TerminalBannerLine[] = [
    { text: labels.title, color: 'muted' },
    {
      text: input.passed ? labels.passed : labels.failed,
      color: input.passed ? 'green' : 'red',
    },
    { text: labels.counts, color: 'muted' },
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