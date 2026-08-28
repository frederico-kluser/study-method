/**
 * tests/pendingSubject.test.ts — estado compartilhado de assunto pré-selecionado
 * (onda 17A — Home → Aula). Sem jsdom: set/drain/peek/clear são funções puras
 * sobre a variável de módulo. Cobre o round-trip, o consumer one-shot e a
 * limpeza (reset para teste).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetPendingSubjectForTests,
  clearPendingDomain,
  clearPendingLessonId,
  clearPendingSubject,
  consumePendingSubject,
  createTrackLessonPendingHolder,
  drainPendingDomain,
  drainPendingLessonId,
  drainPendingSubject,
  peekPendingDomain,
  peekPendingLessonId,
  peekPendingSubject,
  peekPendingTrackLesson,
  setPendingDomain,
  setPendingLessonId,
  setPendingSubject,
  setPendingTrackLesson,
} from '../src/lib/pendingSubject';

beforeEach(() => {
  __resetPendingSubjectForTests();
});

describe('pendingSubject — Home → Aula', () => {
  it('começa vazio (peek/drain = null)', () => {
    assert.equal(peekPendingSubject(), null);
    assert.equal(drainPendingSubject(), null);
  });

  it('set → drain devolve o assunto e consome (one-shot)', () => {
    setPendingSubject('Inverter uma árvore binária');
    assert.equal(peekPendingSubject(), 'Inverter uma árvore binária');
    assert.equal(drainPendingSubject(), 'Inverter uma árvore binária');
    assert.equal(drainPendingSubject(), null, 'dado já foi consumido');
  });

  it('set com brancos só é consumido se houver texto (trim)', () => {
    setPendingSubject('   ');
    assert.equal(peekPendingSubject(), null);
    setPendingSubject('  Matemática  ');
    assert.equal(drainPendingSubject(), 'Matemática');
  });

  it('clear zera sem devolver', () => {
    setPendingSubject('assunto');
    clearPendingSubject();
    assert.equal(peekPendingSubject(), null);
  });

  it('sempre o último set vence', () => {
    setPendingSubject('primeiro');
    setPendingSubject('segundo');
    assert.equal(drainPendingSubject(), 'segundo');
  });

  // fix17c ACHADO-1: consumir no lazy initializer do useState (LessonView).
  it('consumePendingSubject devolve o valor E limpa o store (one-shot)', () => {
    setPendingSubject('Análise combinatória');
    assert.equal(consumePendingSubject(), 'Análise combinatória');
    assert.equal(peekPendingSubject(), null, 'store foi esvaziado após o consume');
  });

  // fix17c ACHADO-3: o consumo drena — re-mounts (sem novo set) não re-enchem.
  it('segundo consume na MESMA montagem devolve null (JÁ consumido)', () => {
    setPendingSubject('Grafos');
    assert.equal(consumePendingSubject(), 'Grafos');
    assert.equal(consumePendingSubject(), null, 'não há pendência nova');
  });

  it('consume com store vazio devolve null (remount sem pendência = campo vazio)', () => {
    assert.equal(consumePendingSubject(), null);
  });
});

// ─── pendingDomain (onda 4 — matérias da Home) ──────────────────────────────

describe('pendingDomain — Home → payload do generate-lesson (onda 5)', () => {
  it('começa vazio (peek/drain = null)', () => {
    assert.equal(peekPendingDomain(), null);
    assert.equal(drainPendingDomain(), null);
  });

  it('set → drain devolve o domínio e consome (one-shot)', () => {
    setPendingDomain('math');
    assert.equal(peekPendingDomain(), 'math');
    assert.equal(drainPendingDomain(), 'math');
    assert.equal(drainPendingDomain(), null, 'dado já foi consumido');
  });

  it('aceita os DOIS domínios do contrato (programming | math)', () => {
    setPendingDomain('programming');
    assert.equal(drainPendingDomain(), 'programming');
    setPendingDomain('math');
    assert.equal(drainPendingDomain(), 'math');
  });

  it('sempre o último set vence', () => {
    setPendingDomain('programming');
    setPendingDomain('math');
    assert.equal(drainPendingDomain(), 'math');
  });

  it('clear zera sem devolver', () => {
    setPendingDomain('programming');
    clearPendingDomain();
    assert.equal(peekPendingDomain(), null);
  });

  it('__reset limpa subject E domain juntos', () => {
    setPendingSubject('Grafos');
    setPendingDomain('math');
    __resetPendingSubjectForTests();
    assert.equal(peekPendingSubject(), null);
    assert.equal(peekPendingDomain(), null);
  });

  it('subject e domain são consumidos como one-shots INDEPENDENTES', () => {
    setPendingSubject('Grafos');
    setPendingDomain('programming');
    // A onda 5 drena o domínio no payload do generate-lesson, depois (ou antes)
    // a LessonView drena o subject — a ordem não pode interferir.
    assert.equal(drainPendingDomain(), 'programming');
    assert.equal(drainPendingSubject(), 'Grafos');
    assert.equal(peekPendingDomain(), null);
    assert.equal(peekPendingSubject(), null);
  });
});

// ─── pendingLessonId (onda 5 — Trilha → Aula por id) ──────────────────────

describe('pendingLessonId — Trilha → Aula (onda 5)', () => {
  it('começa vazio (peek/drain = null)', () => {
    assert.equal(peekPendingLessonId(), null);
    assert.equal(drainPendingLessonId(), null);
  });

  it('set → drain devolve o id e consome (one-shot)', () => {
    setPendingLessonId('lesson-abc');
    assert.equal(peekPendingLessonId(), 'lesson-abc');
    assert.equal(drainPendingLessonId(), 'lesson-abc');
    assert.equal(drainPendingLessonId(), null, 'dado já foi consumido');
  });

  it('set com brancos só é consumido se houver id (trim)', () => {
    setPendingLessonId('   ');
    assert.equal(peekPendingLessonId(), null);
    setPendingLessonId('  lesson-xyz  ');
    assert.equal(drainPendingLessonId(), 'lesson-xyz');
  });

  it('sempre o último set vence', () => {
    setPendingLessonId('lesson-1');
    setPendingLessonId('lesson-2');
    assert.equal(drainPendingLessonId(), 'lesson-2');
  });

  it('clear zera sem devolver', () => {
    setPendingLessonId('lesson-1');
    clearPendingLessonId();
    assert.equal(peekPendingLessonId(), null);
  });

  it('é independente de subject/domain (mesma navegação grava os TRÊS)', () => {
    setPendingSubject('Filas em C');
    setPendingDomain('programming');
    setPendingLessonId('lesson-abc');
    // A LessonView drena os TRÊS na montagem — a ordem não pode interferir.
    assert.equal(drainPendingLessonId(), 'lesson-abc');
    assert.equal(drainPendingSubject(), 'Filas em C');
    assert.equal(drainPendingDomain(), 'programming');
    assert.equal(peekPendingLessonId(), null);
  });

  it('__reset limpa subject, domain E lessonId juntos', () => {
    setPendingSubject('Grafos');
    setPendingDomain('math');
    setPendingLessonId('lesson-abc');
    __resetPendingSubjectForTests();
    assert.equal(peekPendingSubject(), null);
    assert.equal(peekPendingDomain(), null);
    assert.equal(peekPendingLessonId(), null);
  });
});

// ─── createTrackLessonPendingHolder (rodada 11 — retenção anti-StrictMode) ──
// O holder existe para a MONTAGEM da LessonView: em dev o React <StrictMode>
// executa os efeitos em setup → cleanup → setup do MESMO fiber. O drain puro é
// one-shot — a 1ª passada consome e a 2ª veria null, enquanto o cleanup da 1ª
// já cancelou o load → spinner eterno. O holder RETÉM o valor entre as
// passadas (refs do mesmo fiber sobrevivem ao double-invoke), então cada setup
// re-dispara o load. Estes testes travam essa semântica exata.

describe('createTrackLessonPendingHolder — retenção anti-StrictMode', () => {
  it('get() no primeiro acesso drena o store e devolve o valor', () => {
    setPendingTrackLesson('ts', 'lesson-1');
    const holder = createTrackLessonPendingHolder();
    assert.deepEqual(holder.get(), { trackSlug: 'ts', lessonId: 'lesson-1' });
    assert.equal(peekPendingTrackLesson(), null, 'store foi drenado no 1º acesso');
  });

  it('get() de novo (store JÁ vazio) devolve o MESMO valor — 2ª passada do double-invoke', () => {
    setPendingTrackLesson('ts', 'lesson-1');
    const holder = createTrackLessonPendingHolder();
    assert.deepEqual(holder.get(), { trackSlug: 'ts', lessonId: 'lesson-1' });
    // Simula o setup da passada 2 do StrictMode: o store já foi drenado, mas o
    // holder RETÉM o valor — nunca devolve null aqui (senão: load órfão).
    assert.deepEqual(holder.get(), { trackSlug: 'ts', lessonId: 'lesson-1' });
    assert.equal(peekPendingTrackLesson(), null, 'o holder não re-drenou nada');
  });

  it('holder NOVO com store vazio devolve null — remontagem real sem pendência', () => {
    setPendingTrackLesson('ts', 'lesson-1');
    createTrackLessonPendingHolder().get();
    // Remontagem de verdade cria um holder NOVO (ref novo por fiber); o store
    // já foi consumido pela montagem anterior → null, como esperado.
    const remount = createTrackLessonPendingHolder();
    assert.equal(remount.get(), null);
  });

  it('store vazio no primeiro acesso → get() retorna null (e permanece null)', () => {
    const holder = createTrackLessonPendingHolder();
    assert.equal(holder.get(), null);
    assert.equal(holder.get(), null, 'retém null — nunca muda depois');
    // Pendência NOVA chegando DEPOIS não reabastece um holder já retido: ela
    // pertence a uma nova navegação → nova montagem → novo holder.
    setPendingTrackLesson('ts', 'lesson-2');
    assert.equal(holder.get(), null, 'holder retido não re-drena pendência nova');
  });
});
