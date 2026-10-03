/**
 * AnswerTerminal.stories.helpers.ts — apoio das histórias do terminal (sem
 * JSX de propósito: o ficheiro NÃO casa o glob `*.stories.ts(x)` e não vira
 * história — STORY-SPEC §1).
 *
 * O `AnswerTerminal` é imperativo por ref (`writeLine`/`clear`/`autoFit`) — é
 * assim que a ChallengeView o alimenta. Para o catálogo mostrar linhas SEM
 * inventar uma prop que o produto não tem, esta casca semeia o handle exatamente
 * como o app o faz: no efeito de montagem, DEPOIS do xterm existir (os efeitos
 * do filho correm antes dos do pai).
 */
import { createElement, useEffect, useRef, type ReactElement } from 'react';
import { AnswerTerminal, type AnswerTerminalHandle } from './AnswerTerminal';
import type { TerminalBufferLine } from '../../lib/terminalBuffer';

export interface TerminalComLinhasProps {
  /** Linhas a imprimir no arranque (vazio = terminal limpo). */
  lines?: readonly TerminalBufferLine[];
  /** Rótulo acessível da região de log (a view passa `challenge.outputAria`). */
  'aria-label'?: string;
}

/** Terminal semeado com linhas — o mesmo caminho imperativo do app. */
export function TerminalComLinhas({
  lines,
  'aria-label': ariaLabel,
}: TerminalComLinhasProps): ReactElement {
  const ref = useRef<AnswerTerminalHandle | null>(null);
  // O array das fixtures é estável; o efeito corre UMA vez por montagem.
  const seed = lines ?? [];
  useEffect(() => {
    const terminal = ref.current;
    if (!terminal) return;
    terminal.clear();
    for (const line of seed) {
      terminal.writeLine(line.text, line.color);
    }
  }, [seed]);
  return createElement(AnswerTerminal, {
    ref,
    'aria-label': ariaLabel ?? 'Saída dos testes',
  });
}
