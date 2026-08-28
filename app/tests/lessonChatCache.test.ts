/**
 * tests/lessonChatCache.test.ts — cache de sessão do chat da aula
 * (onda3-chat-cache). Sem jsdom: save/take/clear/reset são funções puras sobre
 * a variável de módulo. Contratos que mordem:
 *   1. save → take round-trip devolve o MESMO estado (histórico e
 *      presentedSections intactos — a teoria restaurada volta onde estava);
 *   2. take é DRAIN one-shot — a 2ª chamada devolve null;
 *   3. take ZERA lastError (um erro transiente do último turno não volta);
 *   4. clear remove pontualmente;
 *   5. chaves diferentes não colidem (cache por trackSlug:lessonId);
 *   6. __reset esvazia TUDO (beforeEach do suíte);
 *   7. createLessonChatHolder retém o take entre passadas (anti-StrictMode —
 *      mesmo contrato do createTrackLessonPendingHolder da rodada 11).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetLessonChatForTests,
  clearLessonChat,
  createLessonChatHolder,
  saveLessonChat,
  takeLessonChat,
} from '../src/lib/lessonChatCache';
import {
  applyTutorReply,
  createTrackLessonState,
  pushUserMessage,
  seedChallengeError,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import type { TrackChallengeErrorReport } from '../shared/ipc-contract';

beforeEach(() => {
  __resetLessonChatForTests();
});

/** Estado com UMA seção de teoria apresentada (histórico = 2 mensagens). */
function theoryState(): TrackLessonUiState {
  let s = createTrackLessonState();
  s = applyTutorReply(s, {
    ok: true,
    message: 'Seção 1 apresentada.',
    sectionId: 's1',
    sectionTitle: 'Seção 1',
    done: false,
  });
  s = pushUserMessage(s, 'e se eu usar um for?');
  s = applyTutorReply(s, {
    ok: true,
    message: 'Boa pergunta!',
    sectionId: null,
    done: false,
  });
  return s;
}

describe('lessonChatCache — save/take round-trip', () => {
  it('começa vazio (take = null)', () => {
    assert.equal(
      takeLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' }),
      null,
    );
  });

  it('save → take devolve o MESMO estado (teoria preservada na íntegra)', () => {
    const s = theoryState();
    saveLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' }, s);
    const taken = takeLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
    assert.ok(taken, 'restaurou o chat');
    assert.deepEqual(taken.history, s.history, 'histórico idêntico');
    assert.deepEqual(taken.presentedSections, ['s1'], 'seções apresentadas idênticas');
    assert.equal(taken.theoryDone, s.theoryDone);
    assert.equal(taken.challengeError, s.challengeError);
  });

  it('take é one-shot — a 2ª chamada devolve null (drain)', () => {
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, theoryState());
    assert.ok(takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' }));
    assert.equal(
      takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' }),
      null,
      'cache já foi consumido',
    );
  });

  it('take ZERA lastError no estado devolvido (erro transiente não volta)', () => {
    const s = { ...theoryState(), lastError: 'o tutor demorou demais' };
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, s);
    const taken = takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' });
    assert.ok(taken);
    assert.equal(taken.lastError, null, 'lastError zerado na restauração');
    assert.deepEqual(taken.history, s.history, 'resto do estado intacto');
  });

  it('take devolve CLONE RASO (objeto novo; arrays compartilhadas)', () => {
    const s = theoryState();
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, s);
    const taken = takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' });
    assert.ok(taken);
    assert.notEqual(taken, s, 'não devolve a referência interna');
    assert.equal(taken.history, s.history, 'clone RASO — arrays são as mesmas');
  });

  it('clear remove pontualmente (take pós-clear = null)', () => {
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, theoryState());
    clearLessonChat({ trackSlug: 'ts', lessonId: 'l1' });
    assert.equal(takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' }), null);
  });

  it('chaves diferentes NÃO colidem — cada aula tem o SEU chat', () => {
    const sA = theoryState();
    const sB = { ...createTrackLessonState(), history: [{ role: 'user' as const, content: 'outra aula', ts: 0 }] };
    saveLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' }, sA);
    saveLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-2' }, sB);
    // Mesma TRILHA, aulas diferentes → não restaura a aula errada.
    assert.equal(
      takeLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-3' }),
      null,
      'aula sem cache → null (key-match)',
    );
    const takenA = takeLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
    assert.deepEqual(takenA?.history, sA.history);
    const takenB = takeLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-2' });
    assert.deepEqual(takenB?.history, sB.history);
    // Trilhas diferentes, mesmo lessonId → não colide (key inclui a trilha).
    const sC = theoryState();
    saveLessonChat({ trackSlug: 'outra-trilha', lessonId: 'aula-1' }, sC);
    assert.deepEqual(
      takeLessonChat({ trackSlug: 'outra-trilha', lessonId: 'aula-1' })?.history,
      sC.history,
    );
  });

  it('save de um estado com bolhas de erro preserva o challengeError (dedupe no remount)', () => {
    const report: TrackChallengeErrorReport = {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      challengeId: 'dobro-do-numero',
      challengeTitle: 'O dobro do número',
      files: [{ path: 'solution.mjs', code: '' }],
      output: 'saída',
      checks: [],
      passedCount: 0,
      totalCount: 1,
    };
    const s = seedChallengeError(theoryState(), report, 'O que você acha que errou?');
    saveLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' }, s);
    const taken = takeLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
    assert.ok(taken);
    assert.deepEqual(taken.challengeError, report, 'contexto de erro em discussão preservado');
    assert.equal(taken.history.length, s.history.length);
  });

  it('round-trip preserva ts/kind/errorFor das bolhas (clone raso — metadados intactos)', () => {
    const report: TrackChallengeErrorReport = {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      challengeId: 'dobro-do-numero',
      challengeTitle: 'O dobro do número',
      files: [{ path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' }],
      output: 'saída',
      checks: [{ name: 'check', passed: false }],
      passedCount: 0,
      totalCount: 1,
    };
    const s = seedChallengeError(theoryState(), report, 'O que você acha que errou?', {}, 4242);
    saveLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' }, s);
    const taken = takeLessonChat({ trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' });
    assert.ok(taken, 'restaurou o chat');
    assert.deepEqual(taken.history, s.history, 'histórico idêntico — ts/kind/errorFor preservados');
    assert.equal(taken.history[3].kind, 'review', 'kind da bolha de review preservado');
    assert.equal(taken.history[3].errorFor, 'dobro-do-numero', 'errorFor preservado');
    assert.equal(taken.history[3].ts, 4242, 'ts da bolha preservado');
    assert.equal(taken.history[4].kind, 'message', 'kind da pergunta preservado');
    assert.equal(taken.history[4].ts, 4242, 'ts da pergunta preservado');
  });

  it('__reset esvazia TUDO (montagens novas não veem cache de teste anterior)', () => {
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, theoryState());
    __resetLessonChatForTests();
    assert.equal(takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' }), null);
  });
});

// ─── createLessonChatHolder (anti-StrictMode — retenção entre passadas) ─────
// Em dev o React <StrictMode> executa os efeitos em setup → cleanup → setup do
// MESMO fiber. O take é one-shot: a 1ª passada consome o cache e a 2ª veria
// null — e como a 2ª passada RE-executa o mesmo efeito, ela sobrescreveria a
// restauração da 1ª com um chat vazio. O holder RETÉM o valor entre as
// passadas (refs do mesmo fiber sobrevivem ao double-invoke). Estes testes
// travam essa semântica exata.

describe('createLessonChatHolder — retenção anti-StrictMode', () => {
  it('get() no primeiro acesso drena o cache e devolve o valor', () => {
    const s = theoryState();
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, s);
    const holder = createLessonChatHolder({ trackSlug: 'ts', lessonId: 'l1' });
    assert.deepEqual(holder.get()?.history, s.history);
    assert.equal(
      takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' }),
      null,
      'cache foi drenado no 1º acesso',
    );
  });

  it('get() de novo (cache JÁ vazio) devolve o MESMO valor — 2ª passada do double-invoke', () => {
    const s = theoryState();
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, s);
    const holder = createLessonChatHolder({ trackSlug: 'ts', lessonId: 'l1' });
    const first = holder.get();
    // Simula o setup da passada 2 do StrictMode: o cache já foi drenado, mas o
    // holder RETÉM o valor — nunca devolve null aqui (senão: restauração
    // sobrescrita com chat vazio).
    assert.equal(holder.get(), first, 'mesma referência retida nas passadas');
    assert.deepEqual(holder.get()?.history, s.history);
    assert.equal(takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' }), null, 'não re-drenou');
  });

  it('holder NOVO com cache vazio devolve null — remontagem real sem cache', () => {
    const s = theoryState();
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, s);
    createLessonChatHolder({ trackSlug: 'ts', lessonId: 'l1' }).get();
    // Remontagem de verdade cria um holder NOVO (ref novo por fiber); o cache
    // já foi consumido pela montagem anterior → null, como esperado.
    const remount = createLessonChatHolder({ trackSlug: 'ts', lessonId: 'l1' });
    assert.equal(remount.get(), null);
  });

  it('cache vazio no primeiro acesso → get() retorna null (e permanece null)', () => {
    const holder = createLessonChatHolder({ trackSlug: 'ts', lessonId: 'l1' });
    assert.equal(holder.get(), null);
    assert.equal(holder.get(), null, 'retém null — nunca muda depois');
    // Chat NOVO chegando DEPOIS não reabastece um holder já retido: ele
    // pertence a uma nova desmontagem → nova montagem → novo holder.
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, theoryState());
    assert.equal(holder.get(), null, 'holder retido não re-drena cache novo');
  });

  it('holder de UMA aula não toca no cache de OUTRA (key-match)', () => {
    saveLessonChat({ trackSlug: 'ts', lessonId: 'l1' }, theoryState());
    const holder = createLessonChatHolder({ trackSlug: 'ts', lessonId: 'l2' });
    assert.equal(holder.get(), null, 'aula diferente → não restaura');
    assert.ok(
      takeLessonChat({ trackSlug: 'ts', lessonId: 'l1' }),
      'o cache da aula certa segue lá para o alvo certo',
    );
  });
});
