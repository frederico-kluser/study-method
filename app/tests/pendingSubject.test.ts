/**
 * tests/pendingSubject.test.ts — estado compartilhado de assunto pré-selecionado
 * (onda 17A — Home → Aula). Sem jsdom: set/drain/peek/clear são funções puras
 * sobre a variável de módulo. Cobre o round-trip, o consumer one-shot e a
 * limpeza (reset para teste). Também cobre os pendentes de TRILHA (rodada 8:
 * pendingTrackLesson/pendingTrackSlug) e a retenção anti-StrictMode do holder.
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetPendingSubjectForTests,
  clearPendingDomain,
  clearPendingLessonId,
  clearPendingSubject,
  clearPendingTrackLesson,
  clearPendingTrackSlug,
  consumePendingSubject,
  createTrackLessonPendingHolder,
  drainPendingDomain,
  drainPendingLessonId,
  drainPendingSubject,
  drainPendingTrackLesson,
  drainPendingTrackSlug,
  peekPendingDomain,
  peekPendingLessonId,
  peekPendingSubject,
  peekPendingTrackLesson,
  peekPendingTrackSlug,
  setPendingDomain,
  setPendingLessonId,
  setPendingSubject,
  setPendingTrackLesson,
  setPendingTrackSlug,
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

// ─── pendingTrackLesson / pendingTrackSlug (rodada 8 — Trilha → Aula) ──────
// O PAR (trackSlug, lessonId) abre a aula de TRILHA em modo chat (sem
// generate): a LessonView drena na montagem e monta o chat com o tutor. O
// slug SOZINHO abre o DETALHE da trilha na RoadmapView (Home → Trilha): o
// clique na Home grava o slug, a RoadmapView drena e monta a lista. São
// one-shots INDEPENDENTES — o consumo de um nunca pode esvaziar o outro, nem
// interferir nos pendentes legados (subject/domain/lessonId).

describe('pendingTrackLesson — Trilha → Aula em modo chat (rodada 8)', () => {
  it('começa vazio (peek/drain = null)', () => {
    assert.equal(peekPendingTrackLesson(), null);
    assert.equal(drainPendingTrackLesson(), null);
  });

  it('set → drain devolve o PAR (trackSlug + lessonId) e consome (one-shot)', () => {
    setPendingTrackLesson('estruturas-de-dados', 'lesson-7');
    assert.deepEqual(peekPendingTrackLesson(), {
      trackSlug: 'estruturas-de-dados',
      lessonId: 'lesson-7',
    });
    assert.deepEqual(drainPendingTrackLesson(), {
      trackSlug: 'estruturas-de-dados',
      lessonId: 'lesson-7',
    });
    assert.equal(drainPendingTrackLesson(), null, 'dado já foi consumido');
  });

  it('set aplica trim nos DOIS campos do par', () => {
    setPendingTrackLesson('  estruturas-de-dados  ', '  lesson-7  ');
    assert.deepEqual(drainPendingTrackLesson(), {
      trackSlug: 'estruturas-de-dados',
      lessonId: 'lesson-7',
    });
  });

  it('set com AMBOS os campos brancos → null', () => {
    setPendingTrackLesson('   ', '   ');
    assert.equal(peekPendingTrackLesson(), null);
  });

  it('set com UM campo branco → null (o par exige os dois)', () => {
    setPendingTrackLesson('estruturas-de-dados', '   ');
    assert.equal(peekPendingTrackLesson(), null, 'lessonId branco invalida o par');
    setPendingTrackLesson('   ', 'lesson-7');
    assert.equal(peekPendingTrackLesson(), null, 'trackSlug branco invalida o par');
  });

  it('sempre o último set vence', () => {
    setPendingTrackLesson('trilha-1', 'lesson-1');
    setPendingTrackLesson('trilha-2', 'lesson-2');
    assert.deepEqual(drainPendingTrackLesson(), {
      trackSlug: 'trilha-2',
      lessonId: 'lesson-2',
    });
  });

  it('último set vence mesmo quando é inválido (brancos → null)', () => {
    setPendingTrackLesson('trilha-1', 'lesson-1');
    setPendingTrackLesson(' ', ' ');
    assert.equal(drainPendingTrackLesson(), null, 'set inválido posterior zera o par');
  });

  it('peek NÃO consome (vê o mesmo par sem esvaziar o store)', () => {
    setPendingTrackLesson('trilha-1', 'lesson-1');
    assert.deepEqual(peekPendingTrackLesson(), {
      trackSlug: 'trilha-1',
      lessonId: 'lesson-1',
    });
    assert.deepEqual(
      peekPendingTrackLesson(),
      { trackSlug: 'trilha-1', lessonId: 'lesson-1' },
      'peek repetido devolve o mesmo par',
    );
    assert.deepEqual(
      drainPendingTrackLesson(),
      { trackSlug: 'trilha-1', lessonId: 'lesson-1' },
      'o valor segue lá para o drain',
    );
  });

  it('clear zera sem devolver', () => {
    setPendingTrackLesson('trilha-1', 'lesson-1');
    clearPendingTrackLesson();
    assert.equal(peekPendingTrackLesson(), null);
    assert.equal(drainPendingTrackLesson(), null, 'drain pós-clear também é null');
  });
});

describe('pendingTrackSlug — Home → Trilha (rodada 8)', () => {
  it('começa vazio (peek/drain = null)', () => {
    assert.equal(peekPendingTrackSlug(), null);
    assert.equal(drainPendingTrackSlug(), null);
  });

  it('set → drain devolve o slug e consome (one-shot)', () => {
    setPendingTrackSlug('estruturas-de-dados');
    assert.equal(peekPendingTrackSlug(), 'estruturas-de-dados');
    assert.equal(drainPendingTrackSlug(), 'estruturas-de-dados');
    assert.equal(drainPendingTrackSlug(), null, 'dado já foi consumido');
  });

  it('set com brancos só é consumido se houver texto (trim)', () => {
    setPendingTrackSlug('   ');
    assert.equal(peekPendingTrackSlug(), null);
    setPendingTrackSlug('  estruturas-de-dados  ');
    assert.equal(drainPendingTrackSlug(), 'estruturas-de-dados');
  });

  it('sempre o último set vence', () => {
    setPendingTrackSlug('trilha-1');
    setPendingTrackSlug('trilha-2');
    assert.equal(drainPendingTrackSlug(), 'trilha-2');
  });

  it('peek NÃO consome', () => {
    setPendingTrackSlug('trilha-1');
    assert.equal(peekPendingTrackSlug(), 'trilha-1');
    assert.equal(drainPendingTrackSlug(), 'trilha-1', 'o valor segue lá para o drain');
  });

  it('clear zera sem devolver', () => {
    setPendingTrackSlug('trilha-1');
    clearPendingTrackSlug();
    assert.equal(peekPendingTrackSlug(), null);
  });
});

// ─── Independência: trilha vs legadas (subject/domain/lessonId) ────────────
// A LessonView drena o PAR na montagem e a RoadmapView drena o SLUG — o
// consumo de um NUNCA pode esvaziar o outro (senão a navegação Home → Trilha
// perderia o slug por causa de um drain de aula), e nenhum deles pode
// interferir no fluxo legado subject → generate.

describe('pendências de trilha — independência e reset', () => {
  it('drenar trackLesson NÃO toca trackSlug (e vice-versa)', () => {
    setPendingTrackSlug('trilha-1');
    setPendingTrackLesson('trilha-1', 'lesson-1');
    assert.deepEqual(drainPendingTrackLesson(), {
      trackSlug: 'trilha-1',
      lessonId: 'lesson-1',
    });
    assert.equal(peekPendingTrackSlug(), 'trilha-1', 'o slug sobrevive ao drain do par');
    assert.equal(drainPendingTrackSlug(), 'trilha-1');
    assert.equal(peekPendingTrackLesson(), null);
  });

  it('clear de UMA pendência de trilha não afeta a outra', () => {
    setPendingTrackSlug('trilha-1');
    setPendingTrackLesson('trilha-1', 'lesson-1');
    clearPendingTrackLesson();
    assert.equal(peekPendingTrackLesson(), null);
    assert.equal(peekPendingTrackSlug(), 'trilha-1', 'clear do par não rouba o slug');
  });

  it('trackLesson/trackSlug são independentes dos legados subject/domain/lessonId', () => {
    setPendingSubject('Grafos');
    setPendingDomain('math');
    setPendingLessonId('lesson-abc');
    setPendingTrackLesson('trilha-1', 'lesson-1');
    setPendingTrackSlug('trilha-1');
    // A LessonView drena subject/domain/lessonId no fluxo legado — isso não
    // pode esvaziar as pendências de trilha gravadas pela mesma navegação.
    assert.equal(drainPendingSubject(), 'Grafos');
    assert.equal(drainPendingDomain(), 'math');
    assert.equal(drainPendingLessonId(), 'lesson-abc');
    assert.deepEqual(peekPendingTrackLesson(), {
      trackSlug: 'trilha-1',
      lessonId: 'lesson-1',
    });
    assert.equal(peekPendingTrackSlug(), 'trilha-1');
  });

  it('o holder consome APENAS pendingTrackLesson — não rouba trackSlug', () => {
    setPendingTrackSlug('trilha-1');
    setPendingTrackLesson('trilha-1', 'lesson-1');
    const holder = createTrackLessonPendingHolder();
    assert.deepEqual(holder.get(), { trackSlug: 'trilha-1', lessonId: 'lesson-1' });
    assert.equal(peekPendingTrackLesson(), null, 'o holder drenou o par');
    assert.equal(
      peekPendingTrackSlug(),
      'trilha-1',
      'o holder NÃO toca no slug — ele pertence à RoadmapView',
    );
    // Segunda passada do double-invoke: o holder retém o par, mas continua
    // sem roubar o slug.
    assert.deepEqual(holder.get(), { trackSlug: 'trilha-1', lessonId: 'lesson-1' });
    assert.equal(peekPendingTrackSlug(), 'trilha-1');
    assert.equal(drainPendingTrackSlug(), 'trilha-1', 'o slug segue consumível por quem é dele');
  });

  it('holder com o par vazio devolve null mesmo com trackSlug gravado', () => {
    setPendingTrackSlug('trilha-1');
    const holder = createTrackLessonPendingHolder();
    assert.equal(holder.get(), null, 'não há par para drenar');
    assert.equal(peekPendingTrackSlug(), 'trilha-1', 'o slug não foi drenado pelo holder');
  });

  it('__reset limpa TUDO — subject, domain, lessonId, trackLesson e trackSlug', () => {
    setPendingSubject('Grafos');
    setPendingDomain('math');
    setPendingLessonId('lesson-abc');
    setPendingTrackLesson('trilha-1', 'lesson-1');
    setPendingTrackSlug('trilha-1');
    __resetPendingSubjectForTests();
    assert.equal(peekPendingSubject(), null);
    assert.equal(peekPendingDomain(), null);
    assert.equal(peekPendingLessonId(), null);
    assert.equal(peekPendingTrackLesson(), null);
    assert.equal(peekPendingTrackSlug(), null);
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
