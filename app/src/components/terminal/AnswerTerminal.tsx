/**
 * src/components/terminal/AnswerTerminal.tsx — terminal xterm para a saída dos
 * testes e das fases do pi (Determinística, não-interativo).
 *
 * É um wrapper fino sobre @xterm/xterm + @xterm/addon-fit que expõe uma API
 * imperativa por ref (useImperativeHandle):
 *
 *   - `writeLine(text, color?)` — imprime uma linha; `color` é um dos nomes
 *     semânticos (`default`, `green`, `red`, `yellow`, `accent`, `muted`,
 *     `cyan`) resolvidos por `terminalColors()` de `lib/codeTheme`.
 *   - `clear()` — limpa o buffer (e o histórico de repintura, abaixo).
 *   - `autoFit()` — reajusta ao container (chamado também no resize via
 *     ResizeObserver).
 *
 * A saída DETERMINÍSTICA dos testes (TestAnswerResult.output) e os banners
 * PASS/FAIL são desenhados aqui; as fases de streaming do pi aparecem no painel
 * de feedback da ChallengeView, e apenas eventos de tool/status podem ecoar aqui
 * (via `writeLine`) se assim a view decidir.
 *
 * ─── O DEFEITO QUE ESTE ARQUIVO DEIXOU DE TER ──────────────────────────────
 * O terminal era Dracula escuro FIXO (`#282a36`) nos DOIS esquemas do app —
 * uma janela preta dentro de uma superfície de papel no tema claro
 * (`docs/ux-redesign.md` §7.4, item 8 do escopo). Agora ele lê `lib/codeTheme`,
 * a MESMA fonte de verdade do editor CodeMirror
 * (`components/cm/CodeMirrorField.tsx`): a coerência editor ⇄ terminal, que era
 * a propriedade boa do arranjo Dracula, continua — o que saiu foi a polaridade
 * única. `writeLine` continua emitindo truecolor real (SGR 38;2;r;g;b): o xterm
 * ignora `\x1b[#rrggbbm` (parâmetro inválido), então a cor depende do RGB
 * numérico, não do hex.
 *
 * ─── AS TRÊS ARMADILHAS DE CICLO DE VIDA (invisíveis até clicar no toggle) ─
 * Trocar o import não bastava. Um terminal xterm é imperativo e vive FORA do
 * ciclo de render do React, então três coisas ficam presas ao esquema ANTIGO se
 * ninguém as soltar:
 *
 *  1. **A instância é criada UMA vez** num `useEffect(..., [])`. O `theme`
 *     passado ao construtor nunca mais é lido. Solução: um efeito SEPARADO,
 *     declarado DEPOIS do de criação (efeitos rodam na ordem de declaração,
 *     então na montagem o terminal já existe), que faz
 *     `xterm.options.theme = xtermTheme(scheme)` a cada troca.
 *  2. **O mapa de cores ficava capturado** no `useImperativeHandle(..., [])`.
 *     Com deps vazias — que são necessárias para o handle não trocar de
 *     identidade a cada render — o closure congelaria as cores do primeiro
 *     esquema e `writeLine` seguiria pintando com elas para sempre. Solução:
 *     `colorsRef`, atualizado no corpo do render (mesmo padrão do `onSaveRef`
 *     do CodeMirrorField), lido no momento da escrita.
 *  3. **O scrollback guarda o SGR ANTIGO.** Cada linha já impressa carrega o
 *     truecolor absoluto que valia na hora em que foi escrita; trocar
 *     `options.theme` repinta o FUNDO e o texto sem cor explícita, mas NÃO
 *     desfaz um `38;2;r;g;b` que já está no buffer. Um PASSOU em verde-escuro
 *     (#196941, calibrado para papel) sobreviveria sobre o well escuro.
 *
 * ─── DECISÃO SOBRE A ARMADILHA 3: REIMPRIMIR, não limpar ──────────────────
 * As duas saídas honestas eram limpar o terminal ou reimprimir o conteúdo com
 * as cores novas. Limpar é trivial mas DESTRÓI TRABALHO DO USUÁRIO: o conteúdo
 * daqui é o resultado da rodada de testes que ele acabou de rodar, e trocar o
 * tema não é motivo para perdê-lo — seria punir uma ação inócua.
 * Reimprimir preserva conteúdo E corrige a cor, e é possível porque `writeLine`
 * recebe a cor pelo NOME SEMÂNTICO, não pelo hex: guardando `(texto, nome)` em
 * `historyRef`, a mesma linha é re-resolvida na paleta nova. O custo é um array
 * limitado ao mesmo teto do scrollback do xterm (`SCROLLBACK_LINES`), com
 * descarte pela frente — a memória não cresce sem limite.
 * O `reset()` (e não `clear()`) é quem apaga: `clear()` do xterm PRESERVA a
 * linha corrente, o que deixaria um resíduo da paleta velha no topo.
 *
 * ─── COMO A POLARIDADE CHEGA AQUI ─────────────────────────────────────────
 * Por `useColorScheme()` do MUI, NUNCA por `theme.palette.mode` — sob
 * `cssVariables` o ternário sobre o modo resolve UMA vez e nunca reage ao
 * toggle (ver "MECÂNICA OBRIGATÓRIA DO MUI v9", item 2, em `src/theme.ts`).
 * O fundo do <Paper> circundante nem precisa de JS: `surface.level2` é o MESMO
 * nível de rampa que `CodePalette.chrome.surface`, e como token de paleta ele
 * vira `var(--mui-palette-surface-level2)` — repinta pela classe do <html>.
 *
 * CSS do xterm precisa ser importado uma vez (é global).
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { ReactElement } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import Paper from '@mui/material/Paper';
import { useColorScheme } from '@mui/material/styles';
import { buildTestBannerLines, type TerminalBannerInput } from '../../lib/terminalBanner';
import {
  codeTypography,
  terminalColors,
  truecolorForeground,
  xtermTheme,
  type CodeScheme,
  type TerminalColorName,
} from '../../lib/codeTheme';

/**
 * Cores nomeadas aceitas por `writeLine`. É o contrato PÚBLICO do terminal, e
 * é exatamente o `TerminalColorName` de `lib/codeTheme` — o alias existe para
 * a ChallengeView não precisar importar do lib só por causa do tipo.
 */
export type AnswerTerminalColor = TerminalColorName;

/** Teto de linhas guardadas — o mesmo do scrollback do xterm (ver armadilha 3). */
const SCROLLBACK_LINES = 5000;

/** Uma linha já impressa, guardada pelo NOME da cor (não pelo hex). */
interface PrintedLine {
  text: string;
  color: AnswerTerminalColor;
}

/**
 * Polaridade lida do <html> — o fallback do PRIMEIRO render.
 *
 * `useColorScheme().colorScheme` é `undefined` até o efeito de montagem do
 * provider (`useCurrentColorScheme` do `@mui/system` inicia `isClient` em
 * `false` quando há mais de um scheme suportado). O `primeColorSchemeClass()`
 * do `src/main.tsx` já grava a classe `.light`/`.dark` no <html> ANTES do
 * primeiro paint, então ela é a resposta certa nesse frame.
 * (Gêmea da função homônima em `components/cm/CodeMirrorField.tsx`: `src/lib` é
 * compilado pelo `tsconfig.node.json`, que não tem DOM, e não há módulo comum
 * de componente no escopo desta onda para hospedá-la uma vez só.)
 */
function domColorScheme(): CodeScheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export interface AnswerTerminalHandle {
  /** Imprime uma linha no terminal, na cor semântica dada (default: `default`). */
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

    const { colorScheme } = useColorScheme();
    const scheme: CodeScheme = (colorScheme ?? domColorScheme()) === 'dark' ? 'dark' : 'light';

    // Armadilha 2: o handle imperativo tem deps vazias de propósito (identidade
    // estável para a ChallengeView), então a paleta NÃO pode viver no closure.
    const colorsRef = useRef(terminalColors(scheme));
    colorsRef.current = terminalColors(scheme);

    // Armadilha 1: a instância é criada uma vez; o efeito de criação precisa do
    // esquema CORRENTE sem virar dependente dele.
    const schemeRef = useRef(scheme);
    schemeRef.current = scheme;

    // Armadilha 3: o que já foi impresso, guardado por NOME de cor.
    const historyRef = useRef<PrintedLine[]>([]);

    // Cria o terminal UMA vez no mount (instância única).
    useEffect(() => {
      const container = containerRef.current;
      if (!container || xtermRef.current) return;

      const xterm = new Xterm({
        convertEol: true,
        cursorBlink: false,
        // Tipografia do MESMO contrato que o editor lê (`codeTypography()`),
        // e não uma pilha escrita à mão aqui.
        //
        // Nenhuma folha de CSS governa isto: o DomRenderer injeta
        // `<seletor> .xterm-rows { font-family: …; font-size: <options
        // .fontSize>px }` — dois níveis de classe, mais específico que
        // qualquer `.xterm` global. O `index.css` nunca mandou no corpo do
        // terminal; o `13` de antes só COINCIDIA com ele.
        //
        // A pilha antiga (`'SFMono-Regular', 'JetBrains Mono', Menlo,
        // Consolas, monospace`) era pior que divergente: nenhuma dessas
        // famílias está empacotada nem existe no Linux, e ela OMITIA
        // justamente a `'JetBrains Mono Variable'` que o `@fontsource-variable`
        // instala — o terminal caía no `monospace` do sistema enquanto o
        // editor renderizava a fonte real.
        fontSize: codeTypography().fontSizePx,
        fontFamily: codeTypography().fontFamily,
        theme: xtermTheme(schemeRef.current),
        // Evita scrollback excessivo para saída de teste (ainda com memória).
        scrollback: SCROLLBACK_LINES,
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

    // Troca de esquema: repinta o cromo (armadilha 1) e REIMPRIME o scrollback
    // com a paleta nova (armadilha 3). Declarado DEPOIS do efeito de criação —
    // na montagem o terminal já existe e isto é um no-op idempotente.
    useEffect(() => {
      const xterm = xtermRef.current;
      if (!xterm) return;
      xterm.options.theme = xtermTheme(scheme);
      const printed = historyRef.current;
      if (printed.length === 0) return;
      const colors = terminalColors(scheme);
      // `reset()` e não `clear()`: `clear()` preserva a linha corrente e
      // deixaria um resíduo com o SGR da paleta velha.
      xterm.reset();
      for (const line of printed) {
        xterm.writeln(`${truecolorForeground(colors[line.color])}${line.text}\x1b[0m`);
      }
    }, [scheme]);

    // Handle imperativo com a API de saída.
    useImperativeHandle(
      ref,
      (): AnswerTerminalHandle => ({
        writeLine(text: string, color: AnswerTerminalColor = 'default') {
          const xterm = xtermRef.current;
          if (!xterm) return;
          const printed = historyRef.current;
          printed.push({ text, color });
          if (printed.length > SCROLLBACK_LINES) {
            printed.splice(0, printed.length - SCROLLBACK_LINES);
          }
          xterm.writeln(`${truecolorForeground(colorsRef.current[color])}${text}\x1b[0m`);
        },
        clear() {
          historyRef.current.length = 0;
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
      <Paper
        variant="outlined"
        square
        sx={{
          // Mesmo nível de rampa que `CodePalette.chrome.surface` — como token
          // de paleta vira `var(--mui-palette-surface-level2)` e acompanha a
          // classe do <html> sem passar por JS.
          bgcolor: 'surface.level2',
          borderColor: 'divider',
          overflow: 'hidden',
          '& .xterm': { px: 1.5 },
          // `xterm.css` declara `.xterm .xterm-viewport { background-color:
          // #000 }` e o xterm só pinta o tema INLINE no elemento scrollable,
          // que é `position: relative` em fluxo e cobre apenas a content box.
          // O viewport é `position: absolute` com inset 0, então os 12px de
          // padding lateral acima (e a sobra vertical de até uma linha) ficam
          // PRETOS — invisível sobre o Dracula #282a36 de antes, gritante
          // contra o papel #f3eee5. O VS Code sobrescreve esta mesma regra.
          '& .xterm-viewport': { backgroundColor: 'surface.level2' },
        }}
      >
        <div
          ref={containerRef}
          className="answer-terminal__viewport"
          aria-label={_props['aria-label']}
        />
      </Paper>
    );
  },
);

/**
 * Imprime o banner PASS/FAIL no terminal dado o resultado determinístico.
 * Usado pela ChallengeView após `study.testAnswer`. A composição das linhas
 * vive em `lib/terminalBanner.ts` (função pura testável); aqui só se itera.
 */
export function printTestBanner(terminal: AnswerTerminalHandle, input: TerminalBannerInput): void {
  terminal.clear();
  for (const line of buildTestBannerLines(input)) {
    terminal.writeLine(line.text, line.color);
  }
}
