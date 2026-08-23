/**
 * src/components/terminal/AnswerTerminal.tsx — terminal xterm para a saída dos
 * testes e das fases do pi (Determinística, não-interativo).
 *
 * É um wrapper fino sobre @xterm/xterm + @xterm/addon-fit que expõe uma API
 * imperativa por ref (useImperativeHandle):
 *
 *   - `writeLine(text, color?)` — imprime uma linha; `color` opcional mapeia
 *     para os nomes named do ANSI usados no tema dracula/tema claro (`green`,
 *     `red`, `yellow`, `accent`, `muted`, …).
 *   - `clear()` — limpa o buffer.
 *   - `autoFit()`. — reajusta ao container (chamado também no resize via
 *     ResizeObserver).
 *
 * A saída DETERMINÍSTICA dos testes (TestAnswerResult.output) e os banners
 * PASS/FAIL são desenhados aqui; as fases de streaming do pi aparecem no painel
 * de feedback da ChallengeView, e apenas eventos de tool/status podem ecoar aqui
 * (via `writeLine`) se assim a view decidir.
 *
 * CSS do xterm precisa ser importado uma vez (é global).
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { ReactElement } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/** Cores nomeadas aceitas por writeLine, mapeadas para cores do tema. */
export type AnswerTerminalColor =
  | 'default'
  | 'green'
  | 'red'
  | 'yellow'
  | 'accent'
  | 'muted'
  | 'cyan';

/** Mapa nome → cor ANSI (tema Dracula-ish sobre fundo background). */
const ANSI: Record<AnswerTerminalColor, string> = {
  default: '#e6e8ec',
  green: '#49b36b',
  red: '#e05252',
  yellow: '#e5c07b',
  accent: '#4f8cff',
  muted: '#9aa3b2',
  cyan: '#56b6c2',
};

export interface AnswerTerminalHandle {
  /** Imprime uma linha no terminal; `pipe` imprime sem newline (append). */
  writeLine: (text: string, color?: AnswerTerminalColor) => void;
  /** Limpa o conteúdo do terminal. */
  clear: () => void;
  /** Reajusta o terminal ao tamanho do container. */
  autoFit: () => void;
}

interface AnswerTerminalProps {
  /** Rótulo acessível opcional. */
  'aria-label'?: string;
}

/** Terminal xterm com handle imperativo para saída dos testes. */
export const AnswerTerminal = forwardRef<AnswerTerminalHandle, AnswerTerminalProps>(
  function AnswerTerminal(_props, ref): ReactElement {
    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Xterm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);

    // Cria o terminal UMA vez no mount (instância única).
    useEffect(() => {
      const container = containerRef.current;
      if (!container || xtermRef.current) return;

      const xterm = new Xterm({
        convertEol: true,
        cursorBlink: false,
        fontSize: 13,
        fontFamily:
          "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
        theme: {
          background: '#0f1115',
          foreground: ANSI.default,
          cursor: ANSI.accent,
        },
        // Evita scrollback excessivo para saída de teste (ainda com memória).
        scrollback: 5000,
      });
      const fit = new FitAddon();
      xterm.loadAddon(fit);
      xterm.open(container);

      xtermRef.current = xterm;
      fitRef.current = fit;

      // Fit inicial adiado para o próximo frame (container pode estar 0×0).
      const raf = requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {
          /* sem layout ainda — ResizeObserver repete */
        }
      });
      const observer = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* container sem layout */
        }
      });
      observer.observe(container);

      return () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        xterm.dispose();
        xtermRef.current = null;
        fitRef.current = null;
      };
    }, []);

    // Handle imperativo com a API de saída.
    useImperativeHandle(
      ref,
      (): AnswerTerminalHandle => ({
        writeLine(text: string, color: AnswerTerminalColor = 'default') {
          const xterm = xtermRef.current;
          if (!xterm) return;
          xterm.writeln(`\x1b[${ANSI[color]}m${text}\x1b[0m`);
        },
        clear() {
          xtermRef.current?.clear();
        },
        autoFit() {
          try {
            fitRef.current?.fit();
          } catch {
            /* sem layout */
          }
        },
      }),
      [],
    );

    return (
      <div className="answer-terminal">
        <div
          ref={containerRef}
          className="answer-terminal__viewport"
          aria-label={_props['aria-label']}
        />
      </div>
    );
  },
);

/**
 * Imprime o banner PASS/FAIL no terminal dado o resultado determinístico.
 * Usado pela ChallengeView após `study.testAnswer`.
 */
export function printTestBanner(
  terminal: AnswerTerminalHandle,
  { passed, testsRun, expectedTests, output }: {
    passed: boolean;
    testsRun: number;
    expectedTests: number;
    output: string;
  },
): void {
  terminal.clear();
  terminal.writeLine('=== TESTES (fase determinística) ===', 'muted');
  const color: AnswerTerminalColor = passed ? 'green' : 'red';
  terminal.writeLine(passed ? 'PASSOU' : 'NÃO PASSOU', color);
  terminal.writeLine(
    `TESTS_RUN=${testsRun} ESPERADOS=${expectedTests}`,
    'muted',
  );
  if (output && output.trim()) {
    terminal.writeLine('──────────────────────────────────────────', 'muted');
    for (const line of output.split(/\r?\n/)) {
      terminal.writeLine(line, 'default');
    }
  }
  terminal.writeLine('==========================================', 'muted');
}