/**
 * tests/researchProgress.test.ts — máquina de estado PURA do checklist de
 * pesquisa ao vivo (onda3-pesquisa-checklist-ui).
 *
 * Cobre: sequência completa feliz; interleaving de queries concorrentes;
 * término por research:done; término por markResolved/markErrored SEM nenhum
 * evento (modo E2E — emit do stub é no-op); retrocompat (sem research:plan →
 * checklist vazio/invisível); erro por query e códigos; terminal cola.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyResearchEvent,
  createResearchChecklist,
  getResearchChecklist,
  getResearchCounters,
  hasResearchPlan,
  isResearchTerminal,
  markResearchErrored,
  markResearchResolved,
  researchErrorKey,
  researchErrorKindKey,
  researchPhaseErrorKey,
  type ResearchChecklistState,
} from '../src/lib/researchProgress';
import type { ResearchProgressEvent } from '../shared/ipc-contract';

/** Constrói um plano de pesquisa com N queries por sub-pergunta (helper). */
function planEvent(queries: Array<[string, string, string]>): ResearchProgressEvent {
  // queries: [id, q, sub]
  const subs = [...new Set(queries.map(([, , sub]) => sub))];
  return {
    kind: 'research:plan',
    subQuestions: subs.map((sub, i) => ({ id: sub, question: `Pergunta ${i + 1}?` })),
    queries: queries.map(([id, q, sub]) => ({
      id,
      q,
      sub,
      category: 'official-docs',
    })),
    maxRounds: 2,
  };
}

function queryDone(over: Partial<Extract<ResearchProgressEvent, { kind: 'research:query-done' }>>): ResearchProgressEvent {
  return {
    kind: 'research:query-done',
    queryId: 'q1',
    q: 'query',
    ok: true,
    provider: 'brave',
    hits: 3,
    ...over,
  };
}

describe('createResearchChecklist', () => {
  it('estado inicial: sem plano, aberta, sem queries', () => {
    const s = createResearchChecklist();
    assert.equal(s.planned, false);
    assert.equal(s.queries.size, 0);
    assert.equal(s.currentRound, null);
    assert.equal(s.terminal, false);
    assert.equal(isResearchTerminal(s), false);
    assert.equal(hasResearchPlan(s), false);
  });

  it('getResearchChecklist vazio e contadores zerados sem plano', () => {
    const s = createResearchChecklist();
    assert.deepEqual(getResearchChecklist(s), []);
    const c = getResearchCounters(s);
    assert.equal(c.concluded, 0);
    assert.equal(c.total, 0);
    assert.equal(c.uniqueSources, 0);
  });
});

describe('applyResearchEvent — sequência completa feliz', () => {
  it('plan → round-start → query-start → query-done(ok) ×2 → round-done → done', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, planEvent([['q1', 'q1 texto', 'sq1'], ['q2', 'q2 texto', 'sq2']]));
    assert.equal(hasResearchPlan(s), true);
    assert.equal(s.queries.size, 2);
    assert.equal(s.subQuestions.length, 2);
    assert.equal(s.totalRounds, 2);
    assert.equal(s.queries.get('q1')?.status, 'pending');

    s = applyResearchEvent(s, { kind: 'research:round-start', round: 1, totalRounds: 2 });
    assert.equal(s.currentRound, 1);
    assert.equal(s.totalRounds, 2);

    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'q1', q: 'q1 texto' });
    assert.equal(s.queries.get('q1')?.status, 'running');

    s = applyResearchEvent(s, queryDone({ queryId: 'q1', q: 'q1 texto', ok: true, hits: 4 }));
    assert.equal(s.queries.get('q1')?.status, 'done');
    assert.equal(s.queries.get('q1')?.hits, 4);
    assert.equal(s.queries.get('q1')?.provider, 'brave');
    assert.equal(s.queries.get('q1')?.errorCode, undefined);

    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'q2', q: 'q2 texto' });
    s = applyResearchEvent(s, queryDone({ queryId: 'q2', q: 'q2 texto', ok: true, hits: 2 }));
    assert.equal(s.queries.get('q2')?.status, 'done');

    s = applyResearchEvent(s, { kind: 'research:round-done', round: 1, ok: 2, failed: 0, uniqueSources: 3 });
    assert.equal(s.ok, 2);
    assert.equal(s.failed, 0);
    assert.equal(s.uniqueSources, 3);

    s = applyResearchEvent(s, { kind: 'research:done', sources: 3, rounds: 1, stopReason: 'ok' });
    assert.equal(isResearchTerminal(s), true);
    assert.equal(s.terminalKind, 'done');
    assert.equal(s.sources, 3);
    assert.equal(s.rounds, 1);
  });

  it('checklist agrupado por sub-pergunta respeita a ordem do plano', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(
      s,
      planEvent([
        ['q1', 'conceito', 'sq1'],
        ['q2', 'exemplo', 'sq2'],
        ['q3', 'erros', 'sq2'],
      ]),
    );
    s = applyResearchEvent(s, queryDone({ queryId: 'q1', q: 'conceito', ok: true, hits: 2 }));
    const groups = getResearchChecklist(s);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0].queries.map((q) => q.id), ['q1']);
    assert.deepEqual(groups[1].queries.map((q) => q.id), ['q2', 'q3']);
    assert.equal(groups[0].question, 'Pergunta 1?');
    assert.equal(groups[0].queries[0].status, 'done');
    assert.equal(groups[1].queries[0].status, 'pending');
  });
});

describe('applyResearchEvent — interleaving de queries concorrentes', () => {
  it('starts/dones fora de ordem por query mantêm cada status individual', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(
      s,
      planEvent([
        ['q1', 'a', 'sq1'],
        ['q2', 'b', 'sq2'],
        ['q3', 'c', 'sq1'],
      ]),
    );
    // Concorrência: q2 termina ANTES de q1; q3 começa depois de q1 terminar.
    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'q1', q: 'a' });
    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'q2', q: 'b' });
    s = applyResearchEvent(s, queryDone({ queryId: 'q2', q: 'b', ok: false, error: { code: 'BRAVE_RATE_LIMIT' } }));
    assert.equal(s.queries.get('q2')?.status, 'failed');
    assert.equal(s.queries.get('q1')?.status, 'running');
    s = applyResearchEvent(s, queryDone({ queryId: 'q1', q: 'a', ok: true, hits: 5 }));
    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'q3', q: 'c' });
    assert.equal(s.queries.get('q1')?.status, 'done');
    assert.equal(s.queries.get('q3')?.status, 'running');
    s = applyResearchEvent(s, queryDone({ queryId: 'q3', q: 'c', ok: true, hits: 1 }));
    assert.equal(s.queries.get('q3')?.status, 'done');
    assert.equal(getResearchCounters(s).concluded, 3);
    assert.equal(getResearchCounters(s).running, 0);
  });

  it('query-done sem query-start prévio é aceito (defensivo, fora de ordem)', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, planEvent([['q1', 'a', 'sq1']]));
    s = applyResearchEvent(s, queryDone({ queryId: 'q1', ok: true, hits: 1 }));
    assert.equal(s.queries.get('q1')?.status, 'done');
  });

  it('query-done de id desconhecido (sem plan/start) é ignorado sem quebrar', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, planEvent([['q1', 'a', 'sq1']]));
    s = applyResearchEvent(s, queryDone({ queryId: 'ghost', ok: true, hits: 1 }));
    assert.equal(s.queries.size, 1);
    assert.equal(s.queries.get('ghost'), undefined);
  });

  it('query-start sem plan é tolerado (crash-avoidance); sem plan o checklist fica invisível', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'qX', q: 'órfã' });
    assert.equal(hasResearchPlan(s), false);
    assert.equal(s.queries.get('qX')?.status, 'running');
    assert.deepEqual(getResearchChecklist(s), []);
    // O plan (quando chega depois) é AUTORITATIVO: redefine o conjunto de queries.
    s = applyResearchEvent(s, planEvent([['q1', 'a', 'sq1']]));
    assert.equal(s.queries.size, 1);
    assert.equal(s.queries.get('qX'), undefined);
  });

  it('query-start com id fora do plano vira órfã em grupo implícito (sub não achado)', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, planEvent([['q1', 'a', 'sq1']]));
    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'qX', q: 'órfã' });
    const groups = getResearchChecklist(s);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[1].queries.map((q) => q.id), ['qX']);
    assert.equal(groups[1].question, '');
    assert.equal(groups[1].queries[0].status, 'running');
  });
});

describe('término — research:done e mark*', () => {
  it('research:done fecha a máquina', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, { kind: 'research:done', sources: 1, rounds: 1, stopReason: 'ok' });
    assert.equal(isResearchTerminal(s), true);
    assert.equal(s.terminalKind, 'done');
  });

  it('markResearchResolved SEM nenhum evento fecha a máquina (modo E2E)', () => {
    const s = createResearchChecklist();
    const closed = markResearchResolved(s);
    assert.equal(isResearchTerminal(closed), true);
    assert.equal(closed.terminalKind, 'resolved');
    // Sem plan: checklist permanece invisível — a barra de fases atual é soberana.
    assert.equal(hasResearchPlan(closed), false);
    assert.deepEqual(getResearchChecklist(closed), []);
  });

  it('markResearchErrored SEM nenhum evento fecha a máquina (modo E2E)', () => {
    const s = createResearchChecklist();
    const closed = markResearchErrored(s);
    assert.equal(isResearchTerminal(closed), true);
    assert.equal(closed.terminalKind, 'errored');
  });

  it('mark* após research:done é idempotente (terminal cola)', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, { kind: 'research:done', sources: 1, rounds: 1, stopReason: 'ok' });
    const r = markResearchResolved(s);
    assert.equal(isResearchTerminal(r), true);
    assert.equal(r.terminalKind, 'done'); // o primeiro terminal vence
    const e = markResearchErrored(s);
    assert.equal(e.terminalKind, 'done');
  });

  it('eventos DEPOIS de terminal são ignorados (estado congelado)', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, planEvent([['q1', 'a', 'sq1']]));
    s = applyResearchEvent(s, { kind: 'research:done', sources: 0, rounds: 1, stopReason: 'ok' });
    const before = s;
    const after = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'q1', q: 'a' });
    assert.equal(after, before); // mesma referência: nenhuma mudança
    assert.equal(s.queries.get('q1')?.status, 'pending');
  });

  it('plan após terminal não reabre a máquina', () => {
    let s = createResearchChecklist();
    s = markResearchResolved(s);
    const after = applyResearchEvent(s, planEvent([['q1', 'a', 'sq1']]));
    assert.equal(after, s);
    assert.equal(hasResearchPlan(after), false);
  });
});

describe('retrocompat — backend sem o canal novo', () => {
  it('sem research:plan o checklist fica vazio/invisível e os contadores zerados', () => {
    const s = createResearchChecklist();
    // Apenas eventos de fases (lesson-progress) NÃO tocam a máquina da pesquisa.
    const after = applyResearchEvent(s, { kind: 'unknown', whatever: true });
    assert.equal(after, s);
    assert.equal(hasResearchPlan(s), false);
    assert.deepEqual(getResearchChecklist(s), []);
  });
});

describe('erro por query e códigos', () => {
  it('query-done ok:false → status failed com errorCode e message preservados', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, planEvent([['q1', 'a', 'sq1']]));
    s = applyResearchEvent(s, {
      kind: 'research:query-done',
      queryId: 'q1',
      q: 'a',
      ok: false,
      provider: 'brave',
      error: { code: 'BRAVE_KEY_INVALID', message: 'rejeitada' },
    });
    const q = s.queries.get('q1');
    assert.equal(q?.status, 'failed');
    assert.equal(q?.errorCode, 'BRAVE_KEY_INVALID');
    assert.equal(q?.errorMessage, 'rejeitada');
    assert.equal(q?.hits, undefined);
  });

  it('researchErrorKey mapeia os 4 códigos conhecidos para i18n', () => {
    assert.equal(researchErrorKey('BRAVE_KEY_MISSING'), 'translation:lesson.research.errorCodes.BRAVE_KEY_MISSING');
    assert.equal(researchErrorKey('BRAVE_KEY_INVALID'), 'translation:lesson.research.errorCodes.BRAVE_KEY_INVALID');
    assert.equal(researchErrorKey('BRAVE_RATE_LIMIT'), 'translation:lesson.research.errorCodes.BRAVE_RATE_LIMIT');
    assert.equal(researchErrorKey('BRAVE_SERVER_ERROR'), 'translation:lesson.research.errorCodes.BRAVE_SERVER_ERROR');
  });

  it('researchErrorKey com código desconhecido/ausente → genérico', () => {
    assert.equal(researchErrorKey('ALGO_NOVO'), 'translation:lesson.research.queryFailed');
    assert.equal(researchErrorKey(undefined), 'translation:lesson.research.queryFailed');
    assert.equal(researchErrorKey(''), 'translation:lesson.research.queryFailed');
  });

  it('researchPhaseErrorKey só cobre os códigos de chave (aborto da geração)', () => {
    assert.equal(researchPhaseErrorKey('BRAVE_KEY_MISSING'), 'translation:lesson.research.phaseError.BRAVE_KEY_MISSING');
    assert.equal(researchPhaseErrorKey('BRAVE_KEY_INVALID'), 'translation:lesson.research.phaseError.BRAVE_KEY_INVALID');
    assert.equal(researchPhaseErrorKey('BRAVE_RATE_LIMIT'), null);
    assert.equal(researchPhaseErrorKey(undefined), null);
  });

  it('research:done com errorKind de chave → terminal "errored" (interrompido) + errorKind', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, {
      kind: 'research:done',
      sources: 0,
      rounds: 1,
      stopReason: 'sem chave',
      errorKind: 'brave-missing',
    });
    assert.equal(isResearchTerminal(s), true);
    assert.equal(s.terminalKind, 'errored'); // NÃO 'done' — o resumo mostra interrompido
    assert.equal(s.errorKind, 'brave-missing');
    assert.equal(researchErrorKindKey(s.errorKind), 'translation:lesson.research.phaseError.BRAVE_KEY_MISSING');
  });

  it('research:done sem errorKind → terminal "done" (concluída feliz); ambos os errorKind → "errored"', () => {
    const done = applyResearchEvent(createResearchChecklist(), {
      kind: 'research:done',
      sources: 1,
      rounds: 1,
      stopReason: 'ok',
    });
    assert.equal(done.terminalKind, 'done');
    const missing = applyResearchEvent(createResearchChecklist(), {
      kind: 'research:done',
      sources: 0,
      rounds: 1,
      stopReason: 'sem chave',
      errorKind: 'brave-missing',
    });
    assert.equal(missing.terminalKind, 'errored');
    const invalid = applyResearchEvent(createResearchChecklist(), {
      kind: 'research:done',
      sources: 0,
      rounds: 1,
      stopReason: 'chave rejeitada',
      errorKind: 'brave-key-invalid',
    });
    assert.equal(invalid.terminalKind, 'errored');
    assert.equal(invalid.errorKind, 'brave-key-invalid');
  });

  it('markResearchErrored DEPOIS de done+errorKind é no-op (já terminal "errored")', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, {
      kind: 'research:done',
      sources: 0,
      rounds: 1,
      stopReason: 'sem chave',
      errorKind: 'brave-key-invalid',
    });
    const r = markResearchErrored(s);
    assert.equal(r, s); // mesma referência: nenhuma mudança
    assert.equal(r.terminalKind, 'errored');
  });

  it('researchErrorKindKey mapeia errorKind do contrato para a mensagem de aborto de chave', () => {
    assert.equal(researchErrorKindKey('brave-missing'), 'translation:lesson.research.phaseError.BRAVE_KEY_MISSING');
    assert.equal(researchErrorKindKey('brave-key-invalid'), 'translation:lesson.research.phaseError.BRAVE_KEY_INVALID');
    assert.equal(researchErrorKindKey(undefined), null);
    assert.equal(researchErrorKindKey('algo-novo'), null);
  });
});

describe('defensividade do apply', () => {
  it('payload não-objeto devolve o MESMO estado', () => {
    const s = createResearchChecklist();
    assert.equal(applyResearchEvent(s, null), s);
    assert.equal(applyResearchEvent(s, 'x'), s);
    assert.equal(applyResearchEvent(s, 42), s);
  });

  it('kind não-string é ignorado', () => {
    const s = createResearchChecklist();
    assert.equal(applyResearchEvent(s, { kind: 7 }), s);
  });

  it('round-done emite DELTAS da rodada — contadores ACUMULAM (soma, último não vence)', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, { kind: 'research:round-done', round: 1, ok: 2, failed: 1, uniqueSources: 4 });
    s = applyResearchEvent(s, { kind: 'research:round-done', round: 2, ok: 1, failed: 0, uniqueSources: 3 });
    assert.equal(s.ok, 3);
    assert.equal(s.failed, 1);
    assert.equal(s.uniqueSources, 7);
    assert.equal(s.currentRound, null); // round-done não mexe na rodada atual
  });

  it('duas rodadas de deltas + done.sources autoritativo → contadores totais (3 ok, 3 fontes)', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(
      s,
      planEvent([
        ['q1', 'a', 'sq1'],
        ['q2', 'b', 'sq1'],
        ['q3', 'c', 'sq1'],
      ]),
    );
    // Rodada 1 {2 ok, 0 falhas, 2 fontes novas} + Rodada 2 {1 ok, 0 falhas, 1 fonte nova}.
    s = applyResearchEvent(s, { kind: 'research:round-start', round: 1, totalRounds: 2 });
    s = applyResearchEvent(s, { kind: 'research:round-done', round: 1, ok: 2, failed: 0, uniqueSources: 2 });
    s = applyResearchEvent(s, { kind: 'research:round-start', round: 2, totalRounds: 2 });
    s = applyResearchEvent(s, { kind: 'research:round-done', round: 2, ok: 1, failed: 0, uniqueSources: 1 });
    // done.sources é o TOTAL de fontes únicas do emissor (autoritativo).
    s = applyResearchEvent(s, { kind: 'research:done', sources: 3, rounds: 2, stopReason: 'ok' });
    assert.equal(s.ok, 3);
    assert.equal(s.failed, 0);
    assert.equal(s.uniqueSources, 3);
    assert.equal(s.sources, 3);
    const c = getResearchCounters(s);
    assert.equal(c.ok, 3);
    assert.equal(c.failed, 0);
    assert.equal(c.uniqueSources, 3); // o resumo do header mostra 3, não 1
    assert.equal(s.terminalKind, 'done');
  });

  it('done.sources ausente não quebra (mantém acumulado); 0 zera no aborto de chave', () => {
    // done sem o campo sources (payload enxuto) → acumulado preservado.
    let s = createResearchChecklist();
    s = applyResearchEvent(s, { kind: 'research:round-done', round: 1, ok: 1, failed: 0, uniqueSources: 2 });
    s = applyResearchEvent(s, { kind: 'research:done', rounds: 1, stopReason: 'ok' });
    assert.equal(s.uniqueSources, 2);
    // done com errorKind manda sources: 0 (aborto antes de qualquer fonte).
    let s2 = createResearchChecklist();
    s2 = applyResearchEvent(s2, { kind: 'research:round-done', round: 1, ok: 1, failed: 0, uniqueSources: 2 });
    s2 = applyResearchEvent(s2, {
      kind: 'research:done',
      sources: 0,
      rounds: 1,
      stopReason: 'sem chave',
      errorKind: 'brave-missing',
    });
    assert.equal(s2.uniqueSources, 0);
  });

  it('round-start atualiza rodada atual e total', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(s, { kind: 'research:round-start', round: 2, totalRounds: 3 });
    assert.equal(s.currentRound, 2);
    assert.equal(s.totalRounds, 3);
  });

  it('contadores do header: concluídas conta done+failed; total = queries do plano', () => {
    let s = createResearchChecklist();
    s = applyResearchEvent(
      s,
      planEvent([
        ['q1', 'a', 'sq1'],
        ['q2', 'b', 'sq1'],
        ['q3', 'c', 'sq1'],
      ]),
    );
    s = applyResearchEvent(s, queryDone({ queryId: 'q1', ok: true, hits: 1 }));
    s = applyResearchEvent(s, queryDone({ queryId: 'q2', ok: false, error: { code: 'BRAVE_SERVER_ERROR' } }));
    s = applyResearchEvent(s, { kind: 'research:query-start', queryId: 'q3', q: 'c' });
    const c = getResearchCounters(s);
    assert.equal(c.concluded, 2);
    assert.equal(c.total, 3);
    assert.equal(c.running, 1);
    assert.equal(c.ok, 0); // ok do round-done ainda não chegou — acumulado separado
  });
});
