/**
 * tests/quizOverlayState.test.ts — ONDA1-MAESTRIA: o store do OVERLAY do quiz.
 *
 * O pedido do dono: *"o layout do quiz deve ser sobre a tela e respondendo ele
 * minimiza para ficar no chat"*. O molde é o do irmão
 * `challengeGenerateStore` (store de módulo lido por `useSyncExternalStore`,
 * componente montado permanentemente no shell) — é o que permite MINIMIZAR sem
 * perder estado e sobreviver à troca de aba, coisa que `Dialog`/`Popover` não
 * dão (o estado morre com o componente que os renderiza).
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. as quatro transições nomeadas (abrir / minimizar ao responder /
 *      reabrir da bolha / fechar ao dominar) e os guards de cada uma;
 *   2. SNAPSHOT ESTÁVEL: `peek` devolve a MESMA referência enquanto nada muda
 *      (sem isso o `useSyncExternalStore` entra em laço de re-render) e uma
 *      referência NOVA a cada mudança real;
 *   3. `subscribe` notifica só nas mudanças reais e o unsubscribe cala;
 *   4. a ponte com a máquina de maestria: `quizOverlayIntent` /
 *      `applyQuizOverlayStep` traduzem o passo do ciclo em fase do overlay.
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetQuizOverlayForTests,
  applyQuizOverlayStep,
  closeQuizOverlay,
  getQuizOverlaySnapshot,
  isQuizOverlayOpenFor,
  minimizeQuizOverlay,
  openQuizOverlay,
  peekQuizOverlay,
  quizOverlayIntent,
  reopenQuizOverlay,
  subscribeQuizOverlay,
  type QuizOverlayContext,
} from '../src/lib/quizOverlayState';
import type { QuizCycleStep } from '../src/lib/trackLessonState';

function ctx(over: Partial<QuizOverlayContext> = {}): QuizOverlayContext {
  return {
    quizKey: 's1::a1',
    assertionId: 'a1',
    generation: 0,
    sectionId: 's1',
    anchorIndex: 0,
    ...over,
  };
}

beforeEach(() => {
  __resetQuizOverlayForTests();
});

describe('quizOverlayState — as transições do pedido do dono', () => {
  it('parte FECHADO e sem quiz nenhum', () => {
    const s = peekQuizOverlay();
    assert.equal(s.phase, 'fechado');
    assert.equal(s.quizKey, null);
    assert.equal(s.assertionId, null);
    assert.equal(s.anchorIndex, -1);
    assert.equal(isQuizOverlayOpenFor('s1::a1'), false);
  });

  it('ABRIR (seção apresentada) põe o quiz SOBRE A TELA', () => {
    openQuizOverlay(ctx());
    const s = peekQuizOverlay();
    assert.equal(s.phase, 'sobre-a-tela');
    assert.equal(s.quizKey, 's1::a1');
    assert.equal(s.assertionId, 'a1');
    assert.equal(s.sectionId, 's1');
    assert.equal(s.anchorIndex, 0);
    assert.equal(s.minimizeCount, 0);
    assert.equal(isQuizOverlayOpenFor('s1::a1'), true);
    assert.equal(isQuizOverlayOpenFor('s1::a2'), false);
  });

  it('MINIMIZAR ao responder desce para a bolha do chat SEM perder o contexto', () => {
    openQuizOverlay(ctx());
    minimizeQuizOverlay('s1::a1');
    const s = peekQuizOverlay();
    assert.equal(s.phase, 'minimizado-no-chat');
    assert.equal(s.quizKey, 's1::a1', 'o quiz continua sendo o mesmo');
    assert.equal(s.anchorIndex, 0, 'a âncora da bolha sobrevive');
    assert.equal(s.minimizeCount, 1);
    assert.equal(isQuizOverlayOpenFor('s1::a1'), true, 'minimizado ainda é aberto');
  });

  it('REABRIR a partir da bolha volta a sobre-a-tela', () => {
    openQuizOverlay(ctx());
    minimizeQuizOverlay();
    reopenQuizOverlay('s1::a1');
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
    assert.equal(peekQuizOverlay().minimizeCount, 1, 'o contador não zera ao reabrir');
  });

  it('FECHAR ao dominar zera tudo', () => {
    openQuizOverlay(ctx());
    minimizeQuizOverlay();
    closeQuizOverlay('s1::a1');
    const s = peekQuizOverlay();
    assert.equal(s.phase, 'fechado');
    assert.equal(s.quizKey, null);
    assert.equal(s.minimizeCount, 0);
  });

  it('o quiz REMEDIADOR (geração nova) sobe de novo sobre a tela', () => {
    openQuizOverlay(ctx());
    minimizeQuizOverlay();
    openQuizOverlay(ctx({ assertionId: 's1::a1#g1', generation: 1 }));
    const s = peekQuizOverlay();
    assert.equal(s.phase, 'sobre-a-tela');
    assert.equal(s.generation, 1);
    assert.equal(s.assertionId, 's1::a1#g1');
    assert.equal(s.minimizeCount, 0, 'geração nova zera o contador');
  });
});

describe('quizOverlayState — guards (evento atrasado nunca derruba o quiz aberto)', () => {
  it('minimizar/reabrir fora da fase certa é no-op', () => {
    const fechado = peekQuizOverlay();
    minimizeQuizOverlay();
    assert.equal(peekQuizOverlay(), fechado, 'minimizar fechado: no-op por referência');
    reopenQuizOverlay();
    assert.equal(peekQuizOverlay(), fechado, 'reabrir fechado: no-op');

    openQuizOverlay(ctx());
    const aberto = peekQuizOverlay();
    reopenQuizOverlay();
    assert.equal(peekQuizOverlay(), aberto, 'reabrir o que já está na tela: no-op');
  });

  it('transição endereçada a OUTRA chave não toca o estado', () => {
    openQuizOverlay(ctx());
    const aberto = peekQuizOverlay();
    minimizeQuizOverlay('outra::chave');
    assert.equal(peekQuizOverlay(), aberto);
    closeQuizOverlay('outra::chave');
    assert.equal(peekQuizOverlay(), aberto, 'um "dominado" atrasado de outro quiz não fecha este');
    minimizeQuizOverlay('s1::a1');
    reopenQuizOverlay('outra::chave');
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
  });

  it('abrir o MESMO quiz/geração que já está na tela é no-op (anti-StrictMode)', () => {
    openQuizOverlay(ctx());
    const aberto = peekQuizOverlay();
    openQuizOverlay(ctx());
    assert.equal(peekQuizOverlay(), aberto, 'mesma referência');
    // …e não ressuscita um card minimizado por acidente
    minimizeQuizOverlay();
    const minimizado = peekQuizOverlay();
    openQuizOverlay(ctx());
    assert.equal(peekQuizOverlay(), minimizado, 'open não desfaz o minimize da MESMA geração');
  });
});

describe('quizOverlayState — snapshot estável e subscrição', () => {
  it('peek/getSnapshot devolvem a MESMA referência enquanto nada muda', () => {
    const a = peekQuizOverlay();
    assert.equal(peekQuizOverlay(), a, 'leituras repetidas não criam objeto novo');
    assert.equal(getQuizOverlaySnapshot(), a, 'o alias é a MESMA referência');
    openQuizOverlay(ctx());
    const b = peekQuizOverlay();
    assert.notEqual(b, a, 'mudança real → referência nova');
    assert.equal(getQuizOverlaySnapshot(), b);
    openQuizOverlay(ctx());
    assert.equal(peekQuizOverlay(), b, 'no-op preserva a identidade (senão o React entra em laço)');
  });

  it('subscribe só é chamado nas mudanças REAIS; unsubscribe cala', () => {
    let calls = 0;
    const unsubscribe = subscribeQuizOverlay(() => {
      calls += 1;
    });
    openQuizOverlay(ctx());
    assert.equal(calls, 1);
    openQuizOverlay(ctx());
    assert.equal(calls, 1, 'no-op não notifica');
    minimizeQuizOverlay();
    assert.equal(calls, 2);
    minimizeQuizOverlay();
    assert.equal(calls, 2, 'minimizar duas vezes: só a primeira muda algo');
    unsubscribe();
    reopenQuizOverlay();
    assert.equal(calls, 2, 'depois do unsubscribe, silêncio');
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela', 'mas o estado mudou de verdade');
  });
});

describe('quizOverlayState — a ponte com o ciclo de maestria', () => {
  const passos: [QuizCycleStep, string][] = [
    [{ kind: 'aguardar-resposta', generation: 0 }, 'sobre-a-tela'],
    [{ kind: 'explicar-erro', generation: 0, selected: 3 }, 'minimizado-no-chat'],
    [{ kind: 'gerar-novo-quiz', generation: 0 }, 'minimizado-no-chat'],
    [{ kind: 'dominado', generation: 1 }, 'fechado'],
  ];

  it('quizOverlayIntent traduz cada passo do ciclo numa fase', () => {
    for (const [step, fase] of passos) {
      assert.equal(quizOverlayIntent(step), fase, `${step.kind} → ${fase}`);
    }
  });

  it('applyQuizOverlayStep conduz o overlay pelo ciclo inteiro', () => {
    // 1) o quiz aparece
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
    // 2) respondeu errado → minimiza para a conversa (a explicação vem lá)
    applyQuizOverlayStep(ctx(), { kind: 'explicar-erro', generation: 0, selected: 3 });
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
    assert.equal(peekQuizOverlay().minimizeCount, 1);
    // 3) o ciclo pede o quiz novo — continua minimizado
    applyQuizOverlayStep(ctx(), { kind: 'gerar-novo-quiz', generation: 0 });
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
    // 4) o remediador chegou (geração 1) → sobe de novo
    const g1 = ctx({ assertionId: 's1::a1#g1', generation: 1 });
    applyQuizOverlayStep(g1, { kind: 'aguardar-resposta', generation: 1 });
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
    assert.equal(peekQuizOverlay().generation, 1);
    // 5) acertou → fecha
    applyQuizOverlayStep(g1, { kind: 'dominado', generation: 1 });
    assert.equal(peekQuizOverlay().phase, 'fechado');
  });

  it('minimizar por passo funciona mesmo se a view remontou com o store fechado', () => {
    applyQuizOverlayStep(ctx(), { kind: 'gerar-novo-quiz', generation: 0 });
    const s = peekQuizOverlay();
    assert.equal(s.phase, 'minimizado-no-chat');
    assert.equal(s.quizKey, 's1::a1', 'o contexto é escrito junto');
    assert.equal(s.minimizeCount, 1);
  });
});
