/**
 * src/lib/typewriterReveal.ts — as DECISÕES PURAS da revelação por passos do
 * typewriter, extraídas de `components/chat/TypewriterText.tsx` para serem
 * testáveis por `node:test` sem jsdom (convenção da casa: `chatBubbleStyle.ts`,
 * `themeModeState.ts`, `quizOverlayState.ts`).
 *
 * ─── O QUE FICA AQUI E O QUE FICA NO COMPONENTE ───────────────────────────
 * O componente `TypewriterText` é DONO DO RELÓGIO (timers/refs/efeitos — a
 * fronteira DOM, que o SSR não exercita). O que este módulo toma é a POLÍTICA
 * de revelação — as decisões que determinam QUANTO do texto está visível e SE
 * a revelação terminou — que antes viviam inline no efeito e eram só
 * exercitáveis a correr o relógio de verdade:
 *
 *   1. `initialRevealCut` — o corte com que a bolha nasce: `instant`/restaurada
 *      (`active=false`) nasce inteira; a mensagem nova nasce vazia (vai
 *      digitar). ONDA2-CHAT-NINTENDO + regra de ouro do cache.
 *   2. `planSkipReveal` — o que o PULO do aluno faz: sem resto para varrer ou
 *      `prefers-reduced-motion: reduce` (SC 2.3.3) → completa na hora;
 *      caso contrário → varredura linear de ~1 s (ONDA-SKIP-1S). NUNCA digita
 *      de novo nem re-dispara `onStart` (decisão do dono).
 *   3. `typingRevealStep` — um passo do relógio de DIGITAÇÃO: o corte sai de
 *      `typewriterCut` (a conta de velocidade, intocada — ver
 *      `trackLessonState.ts`) e o `done` fecha o passo quando o texto acaba.
 *
 * ─── O QUE FICA DE FORA, E PORQUÊ (dívida registada) ──────────────────────
 * O relógio da VARREDURA do `skip` (`skipSweepCut` + tick de
 * `SKIP_SWEEP_TICK_MS`) continua no corpo do `startSweep` do componente:
 * `tests/lessonTypewriterReadingSpeed.test.ts` (ficheiro da área da aula, não
 * deste dono) guarda POR FONTE que o corte da varredura é calculado por
 * `skipSweepCut(` dentro de `TypewriterText.tsx`, com o tick de
 * `SKIP_SWEEP_TICK_MS` e o corpo do `startSweep` literais. A conta em si já é
 * pura e testada em `trackLessonState.ts`; o que fica por extrair é só o passo
 * (`{ cut, done }`) à volta dela.
 *
 * PURO: sem React, sem DOM, sem timers (`src/lib` é compilado pelo
 * tsconfig.node.json com lib ES2022 SEM DOM — é daqui que os testes node:test
 * leem).
 */
import { typewriterCut } from './trackLessonState';

/** Um passo de revelação: o corte visível e se o texto terminou. */
export interface RevealStep {
  /** Índice do corte (nº de caracteres já visíveis). */
  cut: number;
  /** true quando o texto inteiro já está visível. */
  done: boolean;
}

/**
 * (1) O corte com que a mensagem NASCE.
 *
 * - `instant` (bolha de erro de execução — ONDA2-CHAT-NINTENDO) ou
 *   `active=false` (restaurada do cache/seed — regra de ouro: mensagens
 *   antigas NUNCA digitam) → texto COMPLETO (`text.length`);
 * - mensagem NOVA (`active=true`) → corte 0 (vai digitar do início).
 */
export function initialRevealCut(text: string, active: boolean, instant: boolean): number {
  return instant || !active ? text.length : 0;
}

/**
 * (2) O plano do PULO do aluno (`skip`) — ONDA10 + ONDA-SKIP-1S.
 *
 * 'complete' → o texto inteiro aparece agora (com `onDone` uma única vez):
 *   - não há RESTO para varrer (o corte já chegou ao fim — o pulo chegou
 *     depois do fim natural, ou texto vazio); ou
 *   - `prefers-reduced-motion: reduce` (SC 2.3.3 — política do projeto, ver
 *     src/theme.ts): sob redução de movimento a varredura vira revelação
 *     instantânea; o movimento é dispensável, o conteúdo não.
 * 'sweep' → varredura LINEAR do resto por ~1 s (`SKIP_SWEEP_MS`), começando
 *   exatamente onde a digitação parou: nada pisca para trás, o texto não
 *   estoura na cara do aluno.
 */
export type SkipRevealPlan = 'complete' | 'sweep';

export function planSkipReveal(
  textLength: number,
  cut: number,
  reducedMotion: boolean,
): SkipRevealPlan {
  if (cut >= textLength) return 'complete';
  if (reducedMotion) return 'complete';
  return 'sweep';
}

/**
 * (3) Um passo do relógio de DIGITAÇÃO normal (ONDA2 imessage, intocado).
 *
 * O corte vem da função pura `typewriterCut(text, elapsedMs, tps)` — a conta
 * de velocidade da casa (~400 chars/s no default 100 tps; teoria a 7 tps).
 * `done` fecha o passo quando o corte cobre o texto inteiro (inclui o texto
 * vazio, que termina no primeiro passo).
 */
export function typingRevealStep(text: string, tps: number, elapsedMs: number): RevealStep {
  const cut = typewriterCut(text, elapsedMs, tps);
  return { cut, done: cut >= text.length };
}
