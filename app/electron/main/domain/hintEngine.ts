/**
 * electron/main/domain/hintEngine.ts — motor de HINTS + ESTOU-PERDIDO + QUEBRA
 * (onda2-desafio-hints). Domínio PURO: nenhum módulo de banco/electron, sem I/O.
 *
 * Quando o aluno trava num desafio FUNDIDO na aula, ele tem um botão de dicas:
 * até 3 hints (positions 0..2); no 4º clique o sistema pergunta o que o aluno
 * NÃO entendeu e QUEBRA a aula (com aquele desafio) em mais aulas. O botão
 * "estou perdido" tem o MESMO efeito do 4º clique (o aluno escreve o porquê).
 *
 * A repo persistente NÃO é chamada aqui — ela é injetada pela FIÇÃO (onda3).
 * Este módulo monta a decisão e a ESTRUTURA da quebra de forma determinística;
 * a geração REAL das sub-aulas por LLM fica para o orquestrador (onda4), que
 * usa o plano aqui produzido como esqueleto.
 *
 * Tudo é função pura: recebe os dados por parâmetro e devolve tipos fechados.
 */

/** Estratégia de hints: no máximo 3 dicas antes da quebra. */
export const HINT_STRATEGY = {
  MAX_HINTS: 3,
} as const;

/** Razão de quebra, espelha o enum de `hint_break_events.reason` (schema.ts). */
export type BreakReason = 'hint-4th' | 'lost-manual';

/** Resultado fechado de pedir a próxima dica: uma dica OU a quebra da aula. */
export type HintResult =
  | { kind: 'hint'; hint: string }
  | { kind: 'break'; reason: BreakReason };

/** Uma sub-aula da quebra: título + pedaço do corpo + ideia-chave coberta. */
export interface SubLesson {
  title: string;
  bodySubset: string;
  keyIdea: string;
}

/** Plano de quebra: a aula original vira 2+ sub-aulas focadas. */
export interface BreakPlan {
  subLessons: SubLesson[];
}

/**
 * Próxima dica do desafio.
 *
 * - Se `hintsUsed < MAX_HINTS` e há uma dica na posição correspondente →
 *   devolve `{kind:'hint', hint}` (a chance foi consumida).
 * - Se `hintsUsed >= MAX_HINTS` (4º clique: 0,1,2,3 = 4 cliques) → devolve
 *   `{kind:'break', reason:'hint-4th'}`: NÃO dá mais dica, dispara a quebra.
 * - Se `hintsUsed >= MAX_HINTS` mas a lista de hints está vazia → ainda devolve
 *   break (não tem mais o que dar).
 */
export function nextHint(hintsUsed: number, hints: string[]): HintResult {
  const used = Math.max(0, Math.floor(hintsUsed));

  if (used >= HINT_STRATEGY.MAX_HINTS) {
    // 4º clique (ou já estourou) → quebra, não importa se sobrou hint: pára.
    return { kind: 'break', reason: 'hint-4th' };
  }

  const hint = hints[used];
  // Não há dica disponível na posição pedida.
  if (typeof hint !== 'string' || hint.length === 0) {
    return { kind: 'break', reason: 'hint-4th' };
  }

  return { kind: 'hint', hint };
}

/**
 * Botão "estou perdido". Tem o MESMO efeito do 4º clique: quebra a aula.
 * (O aluno escreve o porquê — a nota fica com a repo, não aqui.)
 */
export function lostButton(): HintResult {
  return { kind: 'break', reason: 'lost-manual' };
}

/** Divide um corpo de aula (markdown) em parágrafos não vazios. */
function splitParagraphs(body: string): string[] {
  return (body ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Monta a ESTRUTURA da quebra de forma DETERMINÍSTICA.
 *
 * Dado o que o aluno NÃO entendeu (`whatTheyDidntUnderstand`), QUEBRA a aula
 * original em 2+ sub-aulas focadas que cobrem os conceitos base do desafio de
 * forma menor e mais gradual. Cada sub-aula tem um `title`, um `keyIdea` e um
 * `bodySubset` (um pedaço do corpo relacionado à ideia).
 *
 * Quando há pedaços de body, distribui de forma determinística: a primeira
 * sub-aula cobre a ideia-chave que o aluno NÃO entendeu (o texto digitado); as
 * seguintes cobrem os demais parágrafos do corpo. Sem body, ainda gera as
 * sub-aulas com `bodySubset` vazio, apenas títulos/ideias — o orquestrador
 * (onda4) preenche o conteúdo via LLM.
 */
export function buildBreakPlan(input: {
  lessonTitle: string;
  lessonBody: string;
  question: string;
  challenge: string;
  whatTheyDidntUnderstand: string;
}): BreakPlan {
  const lessonTitle = (input.lessonTitle ?? '').trim();
  const baseTitle = lessonTitle.length > 0 ? lessonTitle : 'Aula';
  const confusion = (input.whatTheyDidntUnderstand ?? '').trim();
  const challenge = (input.challenge ?? '').trim();
  const paragraphs = splitParagraphs(input.lessonBody ?? '');

  // Ideia-chave da primeira sub-aula: o que o aluno disse que não entendeu;
  // senão, o conceito do desafio (nome do desafio) como fallback.
  const keyIdea0 =
    confusion.length > 0
      ? confusion
      : challenge.length > 0
        ? challenge
        : baseTitle;

  const subLessons: SubLesson[] = [];

  // Sub-aula 1 — cobre a ideia-chave que ele NÃO entendeu.
  subLessons.push({
    title: `${baseTitle} — fundamentos`,
    bodySubset: paragraphs[0] ?? '',
    keyIdea: keyIdea0,
  });

  // Sub-aulas seguintes — distribui os demais parágrafos do corpo.
  for (let i = 1; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    subLessons.push({
      title: `${baseTitle} — passo ${i + 1}`,
      bodySubset: para,
      keyIdea: `consolidar o que foi visto no passo ${i}`,
    });
  }

  // Garantia do contrato: 2+ sub-aulas. Se o corpo tinha só 1 parágrafo (ou
  // nenhum), adiciona uma sub-aula de prática/desafio para fechar.
  if (subLessons.length < 2) {
    subLessons.push({
      title: `${baseTitle} — prática guiada`,
      bodySubset: paragraphs[1] ?? '',
      keyIdea: `aplicar a ideia "${keyIdea0}" num mini-desafio`,
    });
  }

  return { subLessons };
}

/**
 * Decide se a quebra JÁ deve acontecer: ≥ MAX_HINTS hints consumidos (3) OU um
 * break event já registrado. `hintsUsed` é o total de hints consumidos (a
 * contagem agregada `progress.hint_consumed` ou as `used_at` preenchidas).
 */
export function breakDueToHint(history: {
  hintsUsed: number;
  breakEvents: number;
}): boolean {
  const hintsUsed = Math.max(0, Math.floor(history.hintsUsed ?? 0));
  const breakEvents = Math.max(0, Math.floor(history.breakEvents ?? 0));
  return hintsUsed >= HINT_STRATEGY.MAX_HINTS || breakEvents >= 1;
}
