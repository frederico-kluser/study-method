/**
 * src/lib/lessonGenerationGuard.ts — guarda de IDENTIDADE de geração da
 * LessonView (fix onda5-resposta-digitada-ui). Módulo PURO (zero deps, sem
 * React/DOM) — testado de tests/lessonGenerationGuard.test.ts sem jsdom.
 *
 * ─── O PROBLEMA ─────────────────────────────────────────────────────────────
 * `study.generateLesson` (IPC) devolve um promise que SOBREVIVE ao unmount da
 * LessonView (troca de aba). Uma geração ANTIGA (assunto A) que resolve depois
 * de uma NOVA (assunto B) — na mesma instância ou numa instância nova após a
 * remontagem — publicava `{subject: A, status: 'done'}` no SessionStateProvider
 * VIVO (que mora acima das views): o quadro de sessão e a Home ficavam com o
 * assunto de A enquanto a tela mostrava B; `markLessonDoneAndPersist`
 * publicava `{status:'done'}` SEM subject, então o subject errado persistia a
 * sessão inteira de B; se A rejeitasse, derrubava a sessão de B para 'error'.
 *
 * ─── POR QUE CONTADOR DE MÓDULO (e não um ref da view) ──────────────────────
 * Um ref da view nasce ZERADO a cada montagem. No cenário troca-de-aba → volta,
 * a geração antiga (token 1, da instância anterior) "acertaria" o token 1 da
 * instância nova e o guard passaria — o bug continuaria. Um contador de MÓDULO
 * é estritamente crescente por processo: cada geração recebe um token único
 * PARA SEMPRE, e qualquer geração de uma instância anterior (ou supersedida
 * por outra) fica stale para sempre.
 *
 * ─── CONTRATO ───────────────────────────────────────────────────────────────
 * - `nextGenerationToken()` — novo token de geração (incrementa o contador).
 *   Chamado no INÍCIO de cada `generateNew`.
 * - `currentGenerationToken()` — token da geração mais recente; é o `current`
 *   das comparações nos continuamentos assíncronos.
 * - `invalidateGenerations()` — invalida TODA geração pendente: a view
 *   (RE)MONTou (troca de aba) e instâncias anteriores estão mortas. Deve rodar
 *   na montagem, ANTES de capturar o token da abertura da lição persistida.
 * - `isStaleToken(current, started)` — true quando o token `started` (capturado
 *   no início de um continuamento) já não é o `current`; nesse caso o
 *   continuamento DESCARTA SILENCIOSAMENTE (nada de publishSession, nada de
 *   estado, nada de error) — o resolve de uma geração morta nunca publica.
 */

/** Contador estritamente crescente por processo (nunca zerado em produção). */
let generationSeq = 0;

/**
 * True quando `started` (token capturado no início de um continuamento
 * assíncrono) já não é o token atual `current` — o continuamento deve
 * descartar silenciosamente.
 */
export function isStaleToken(current: number, started: number): boolean {
  return started !== current;
}

/** Novo token de geração — único por processo (estritamente crescente). */
export function nextGenerationToken(): number {
  generationSeq += 1;
  return generationSeq;
}

/** Token da geração mais recente — o `current` das comparações. */
export function currentGenerationToken(): number {
  return generationSeq;
}

/**
 * Invalida toda geração pendente — a view (RE)MONTou (troca de aba) e
 * instâncias anteriores estão mortas: nenhum continuamento delas pode
 * publicar na sessão viva.
 */
export function invalidateGenerations(): void {
  generationSeq += 1;
}

/** Zera o contador — SÓ para teste (padrão __reset*ForTests do repo). */
export function __resetGenerationSeqForTests(): void {
  generationSeq = 0;
}
