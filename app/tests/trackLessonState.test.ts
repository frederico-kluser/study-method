/**
 * tests/trackLessonState.test.ts — máquina de estado da aula em CHAT (rodada 8).
 *
 * Contratos que mordem:
 *   1. applyTutorReply com sectionId acrescenta a seção (sem duplicar) e a
 *      mensagem ao histórico; done=true marca theoryDone.
 *   2. Resposta vazia ('next' sem seções restantes) não adiciona mensagem.
 *   3. pushUserMessage ignora texto vazio e limpa lastError.
 *   4. tutorNextAction: 'next' enquanto houver seção; 'answer' após done.
 *
 * ONDA2 (error-flow):
 *   5. buildErrorReport monta o relatório com TODOS os arquivos submetidos.
 *   6. formatErrorBubble devolve markdown determinístico (razão parcial,
 *      checklist ✔/✖, saída em code block).
 *   7. seedChallengeError deduplica POR challengeId (mesmo desafio → no-op;
 *      desafio diferente → REPÕE as bolhas antigas) e grava challengeError.
 *   8. clearChallengeError zera challengeError mantendo o histórico.
 *   9. chatHistory STRIPA o kind (o histórico ao main é texto puro).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTutorReply,
  buildErrorReport,
  chatHistory,
  clearChallengeError,
  createTrackLessonState,
  formatErrorBubble,
  presentedCount,
  pushUserMessage,
  seedChallengeError,
  tutorNextAction,
} from '../src/lib/trackLessonState';
import type { TrackChallengeErrorReport, TrackSubmitResult, TutorReply } from '../shared/ipc-contract';

function reply(over: Partial<TutorReply> = {}): TutorReply {
  return {
    ok: true,
    message: 'Seção apresentada.',
    sectionId: 's1',
    sectionTitle: 'Seção 1',
    done: false,
    ...over,
  };
}

describe('trackLessonState — aula em chat', () => {
  it('next acrescenta a seção e a mensagem ao estado', () => {
    const s0 = createTrackLessonState();
    const s1 = applyTutorReply(s0, reply());
    assert.deepEqual(s1.presentedSections, ['s1']);
    assert.equal(s1.history.length, 1);
    assert.equal(s1.history[0].role, 'assistant');
    assert.equal(s1.theoryDone, false);
  });

  it('seção repetida não duplica presentedSections', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply());
    const s2 = applyTutorReply(s1, reply());
    assert.deepEqual(s2.presentedSections, ['s1']);
  });

  it('done=true marca theoryDone e o estado segue para answer', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ sectionId: 's1', done: true }));
    assert.equal(s1.theoryDone, true);
    assert.equal(tutorNextAction(s1), 'answer');
    assert.equal(tutorNextAction(createTrackLessonState()), 'next');
  });

  it('resposta vazia (fim) não adiciona mensagem', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ message: '', sectionId: null, done: true }));
    assert.equal(s1.history.length, 0);
    assert.equal(s1.theoryDone, true);
  });

  it('erro do tutor grava lastError sem tocar no histórico', () => {
    const s1 = applyTutorReply(createTrackLessonState(), {
      ok: false,
      message: '',
      sectionId: null,
      done: false,
      error: { code: 'TUTOR_UNAVAILABLE', message: 'indisponível' },
    });
    assert.equal(s1.lastError, 'indisponível');
    assert.equal(s1.history.length, 0);
  });

  it('pushUserMessage adiciona a pergunta e limpa lastError; vazio é no-op', () => {
    const s1 = applyTutorReply(createTrackLessonState(), {
      ok: false,
      message: '',
      sectionId: null,
      done: false,
      error: { code: 'X', message: 'erro' },
    });
    const s2 = pushUserMessage(s1, '  não entendi  ');
    assert.equal(s2.history[0].content, 'não entendi');
    assert.equal(s2.history[0].role, 'user');
    assert.equal(s2.lastError, null);
    assert.equal(pushUserMessage(s2, '   '), s2);
  });

  it('chatHistory devolve as mensagens puras; presentedCount conta seções', () => {
    const s = pushUserMessage(applyTutorReply(createTrackLessonState(), reply()), 'pergunta');
    assert.deepEqual(chatHistory(s).map((m) => m.role), ['assistant', 'user']);
    assert.equal(presentedCount(s), 1);
  });
});

// ─── ONDA2 (error-flow): relatório, bolha e seed da discussão do erro ────────

const SUBMIT_RESULT: TrackSubmitResult = {
  ok: true,
  passed: false,
  testsRun: 2,
  expectedTests: 3,
  output: '✔ dobro de 0 é 0\n✖ dobro de 2 é 4 (esperava 4, recebeu 2)',
  checks: [
    { name: 'dobro de 2 é 4', passed: false },
    { name: 'dobro de 0 é 0', passed: true },
    { name: 'dobro de -3 é -6', passed: false },
  ],
  passedCount: 1,
  totalCount: 3,
};

function report(over: Partial<TrackChallengeErrorReport> = {}): TrackChallengeErrorReport {
  return {
    trackSlug: 'nodejs-do-zero',
    lessonId: 'aula-1',
    challengeId: 'dobro-do-numero',
    challengeTitle: 'O dobro do número',
    files: [{ path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' }],
    output: SUBMIT_RESULT.output,
    checks: SUBMIT_RESULT.checks,
    passedCount: 1,
    totalCount: 3,
    ...over,
  };
}

describe('trackLessonState — onda2 error-flow', () => {
  it('buildErrorReport monta o relatório com TODOS os arquivos submetidos', () => {
    const r = buildErrorReport({
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      challengeId: 'dobro-do-numero',
      challengeTitle: 'O dobro do número',
      files: [
        { path: 'lib/soma.mjs', code: 'export const soma = (a, b) => a + b;' },
        { path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' },
      ],
      result: SUBMIT_RESULT,
    });
    assert.equal(r.trackSlug, 'nodejs-do-zero');
    assert.equal(r.lessonId, 'aula-1');
    assert.equal(r.challengeId, 'dobro-do-numero');
    assert.equal(r.challengeTitle, 'O dobro do número');
    assert.deepEqual(r.files, [
      { path: 'lib/soma.mjs', code: 'export const soma = (a, b) => a + b;' },
      { path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' },
    ]);
    assert.equal(r.output, SUBMIT_RESULT.output);
    assert.deepEqual(r.checks, SUBMIT_RESULT.checks);
    assert.equal(r.passedCount, 1);
    assert.equal(r.totalCount, 3);
  });

  it('formatErrorBubble devolve markdown determinístico (título, N de M, checklist ✔/✖, saída)', () => {
    const md = formatErrorBubble(report());
    assert.ok(md.includes('## Seu código falhou nos testes'), 'título da bolha');
    assert.ok(md.includes('**O dobro do número**'), 'título do desafio');
    assert.ok(md.includes('**1 de 3 testes passaram**'), 'razão parcial N de M');
    assert.ok(md.includes('Resultado por teste'), 'rótulo do checklist');
    assert.ok(md.includes('- ✖ dobro de 2 é 4'), 'check falho com ✖');
    assert.ok(md.includes('- ✔ dobro de 0 é 0'), 'check passado com ✔');
    assert.ok(md.includes('Saída:'), 'rótulo da saída');
    assert.ok(md.includes('```text'), 'saída em code block');
    assert.ok(md.includes(SUBMIT_RESULT.output), 'saída completa no code block');
    // Determinístico: mesma entrada → byte-idêntico.
    assert.equal(formatErrorBubble(report()), md);
  });

  it('formatErrorBubble sem checks mostra a saída falando por si', () => {
    const md = formatErrorBubble(report({ checks: [], passedCount: 0, totalCount: 0 }));
    assert.ok(!md.includes('- ✔'), 'sem checks não há checklist');
    assert.ok(md.includes('nenhum check rodou'), 'aviso determinístico do fluxo sem checks');
  });

  it('seedChallengeError insere bolha de erro + pergunta e grava challengeError', () => {
    const s0 = createTrackLessonState();
    const s1 = seedChallengeError(s0, report(), 'O que você acha que errou?');
    assert.equal(s1.history.length, 2);
    assert.equal(s1.history[0].kind, 'error-bubble');
    assert.equal(s1.history[0].role, 'assistant');
    assert.ok(s1.history[0].content.startsWith('## '));
    assert.equal(s1.history[1].kind, 'error-question');
    assert.equal(s1.history[1].content, 'O que você acha que errou?');
    assert.deepEqual(s1.challengeError, report());
  });

  it('seedChallengeError deduplica POR challengeId — mesmo desafio é no-op (guard anti-StrictMode)', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta 1');
    // Mesmo challengeId → NO-OP: nem a pergunta muda nem a bolha duplica.
    const s2 = seedChallengeError(s1, report(), 'pergunta 2 (não pode duplicar)');
    assert.equal(s2, s1, 'o estado NÃO pode ser um objeto novo');
    assert.equal(s2.history.length, 2);
    assert.equal(s2.history[1].content, 'pergunta 1');
  });

  it('seedChallengeError com desafio DIFERENTE REPÕE as bolhas do erro anterior', () => {
    const s1 = seedChallengeError(
      createTrackLessonState(),
      report(),
      'O que você acha que errou?',
    );
    const segundo = report({ challengeId: 'dobro-outro', challengeTitle: 'Outro desafio' });
    const s2 = seedChallengeError(s1, segundo, 'E agora?');
    assert.equal(s2.history.length, 2, 'as bolhas antigas foram REMOVIDAS e as novas entram');
    assert.equal(s2.history[0].kind, 'error-bubble');
    assert.ok(s2.history[0].content.includes('**Outro desafio**'));
    assert.equal(s2.history[1].content, 'E agora?');
    assert.equal(s2.challengeError?.challengeId, 'dobro-outro');
  });

  it('clearChallengeError zera o contexto e MANTÉM o histórico', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta');
    const s2 = clearChallengeError(s1);
    assert.equal(s2.challengeError, null);
    assert.equal(s2.history.length, 2, 'bolhas continuam na conversa');
    assert.equal(clearChallengeError(s2), s2, 'sem contexto, clear é no-op');
  });

  it('chatHistory STRIPA o kind — o histórico ao main é texto puro', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta');
    const hist = chatHistory(s1);
    assert.equal(hist.length, 2);
    for (const m of hist) {
      assert.ok(!('kind' in m), `kind não pode trafegar ao main (${JSON.stringify(m)})`);
      assert.deepEqual(Object.keys(m).sort(), ['content', 'role']);
    }
    assert.equal(hist[0].content, s1.history[0].content);
  });

  it('applyTutorReply e pushUserMessage PRESERVAM o challengeError em discussão', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta');
    const s2 = applyTutorReply(s1, reply({ sectionId: null, done: false }));
    assert.deepEqual(s2.challengeError, report(), 'a resposta do tutor não zera o contexto');
    const s3 = pushUserMessage(s2, 'eu acho que errei no retorno');
    assert.deepEqual(s3.challengeError, report());
    assert.equal(s3.history[s3.history.length - 1].content, 'eu acho que errei no retorno');
  });
});
