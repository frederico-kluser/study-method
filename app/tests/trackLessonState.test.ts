/**
 * tests/trackLessonState.test.ts — máquina de estado da aula em CHAT (rodada 8).
 *
 * Contratos que mordem:
 *   1. applyTutorReply com sectionId acrescenta a seção (sem duplicar) e a
 *      mensagem ao histórico; done=true marca theoryDone.
 *   2. Resposta vazia ('next' sem seções restantes) não adiciona mensagem.
 *   3. pushUserMessage ignora texto vazio e limpa lastError.
 *   4. tutorNextAction: 'next' enquanto houver seção; 'answer' após done.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTutorReply,
  chatHistory,
  createTrackLessonState,
  presentedCount,
  pushUserMessage,
  tutorNextAction,
} from '../src/lib/trackLessonState';
import type { TutorReply } from '../shared/ipc-contract';

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
