/**
 * src/lib/quizPill.ts — o CONTORNO das pílulas de opção do quiz, uma vez só
 * (auditoria de layout §13: `pillOutline` era recalculado à mão em DOIS
 * pontos, com percentagens diferentes).
 *
 * ─── A DUPLICAÇÃO QUE ESTE MÓDULO APOSENTA ────────────────────────────────
 * A mesma fórmula — `color-mix(in srgb, <tinta do tema> N%, transparent)` —
 * estava escrita à mão em:
 *
 *   - `views/LessonView/LessonQuiz.tsx`      (72% — o contorno das pílulas do
 *     card de quiz da aula, medido em tests/lessonQuizHierarchy.test.ts);
 *   - `components/quiz/QuizOverlayHost.tsx`  (55% — o contorno do botão
 *     "Responder de novo" do aviso do overlay).
 *
 * As duas percentagens são INTENCIONALMENTE diferentes (superfícies e
 * distâncias diferentes pedem contornos diferentes — as contas de contraste
 * estão no comentário de cada consumidor) e por isso o que se unifica é a
 * FÓRMULA, com o valor nomeado: `PILL_OUTLINE.card` (72) e
 * `PILL_OUTLINE.overlay` (55). Quem muda um contorno muda NUM lugar, e a
 * divergência volta a ser uma decisão visível (um número nomeado), nunca uma
 * reescrita silenciosa de uma string template.
 *
 * ─── CONTRATO ─────────────────────────────────────────────────────────────
 * `quizPillOutline(theme, pct)` devolve o valor pronto para `borderColor` de
 * `sx`. A tinta vem SEMPRE da variável CSS do tema (`theme.vars.palette.text.
 * primary`) — nunca hex, rgb() ou alpha(): cor com variável CSS usa `color-mix`
 * (a regra da casa, guardada nos testes dos consumidores). A entrada `pct` é
 * validada: uma percentagem que não seja um número finito em [0, 100] não pode
 * chegar a uma fórmula normativa de contraste (NaN/∞ silencioso seria uma
 * falha ABERTA numa guarda de acessibilidade) — LANÇA `RangeError`, o mesmo
 * contrato de rejeição de `parseHexChannels` de `designTokens.ts`.
 *
 * PURO: sem React, sem DOM, sem MUI (`src/lib` é compilado pelo
 * tsconfig.node.json, lib ES2022 SEM DOM — é daqui que os testes `node:test`
 * leem, `tests/quizPill.test.ts`). O `theme` aqui é só o RECORTE que a
 * fórmula precisa (a tinta); o objeto do MUI satisfaz-o estruturalmente.
 */

/** O recorte do tema que a fórmula do contorno precisa: a tinta, nada mais. */
export interface QuizPillTheme {
  readonly vars: {
    readonly palette: {
      readonly text: {
        /** Cor de texto principal — no tema real é uma CSS var. */
        readonly primary: string;
      };
    };
  };
}

/**
 * As percentagens NOMEADAS dos dois contornos reais (§13). Não são números
 * novos: são exatamente os das duas cópias que este módulo unificou.
 */
export const PILL_OUTLINE = {
  /** Contorno do card de quiz (`LessonQuiz`): 1,5px a 72% de tinta. */
  card: 72,
  /** Contorno do aviso do overlay (`QuizOverlayHost`): 55% de tinta. */
  overlay: 55,
} as const;

/**
 * O `borderColor` do contorno da pílula: a tinta do tema diluída por
 * `color-mix` (nada de cor crua), a `pct`% sobre `transparent`.
 */
export function quizPillOutline(theme: QuizPillTheme, pct: number): string {
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new RangeError(
      `quizPillOutline: pct tem de ser um número finito em [0, 100] — recebido ${String(pct)}`,
    );
  }
  return `color-mix(in srgb, ${theme.vars.palette.text.primary} ${pct}%, transparent)`;
}
