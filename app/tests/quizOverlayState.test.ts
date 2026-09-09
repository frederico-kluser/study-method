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
 *      `applyQuizOverlayStep` traduzem o passo do ciclo em fase do overlay;
 *   5. ONDA11: NENHUM passo do ciclo sobe o modal — quem o abre é sempre um
 *      gesto do aluno (o último bloco desta suíte).
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
  // ONDA11: 'aguardar-resposta' DEIXOU de pedir a tela — o quiz estaciona na
  // conversa e quem o sobe é o botão do card. Ver o bloco final desta suíte.
  const passos: [QuizCycleStep, string][] = [
    [{ kind: 'aguardar-resposta', generation: 0 }, 'minimizado-no-chat'],
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
    // 1) o quiz aparece NA CONVERSA (ONDA11: não sobe sozinho) e o aluno abre
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
    reopenQuizOverlay('s1::a1');
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
    // 2) respondeu errado → minimiza para a conversa (a explicação vem lá)
    applyQuizOverlayStep(ctx(), { kind: 'explicar-erro', generation: 0, selected: 3 });
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
    assert.equal(peekQuizOverlay().minimizeCount, 1);
    // 3) o ciclo pede o quiz novo — continua minimizado
    applyQuizOverlayStep(ctx(), { kind: 'gerar-novo-quiz', generation: 0 });
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
    // 4) o remediador chegou (geração 1): ele TAMBÉM espera o gesto do aluno
    const g1 = ctx({ assertionId: 's1::a1#g1', generation: 1 });
    applyQuizOverlayStep(g1, { kind: 'aguardar-resposta', generation: 1 });
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat');
    assert.equal(peekQuizOverlay().generation, 1);
    reopenQuizOverlay('s1::a1');
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
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

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA11 — O MODAL NUNCA SOBE SOZINHO
 *
 * O pedido do dono, literal: *"tinha o texto sendo escrito, eu cliquei, e
 * depois renderizou o texto e já abriu o modal com o quiz, quero um botão de
 * abrir quiz pro usuário acionar o modal manualmente"*.
 *
 * O caminho medido do defeito: a seção termina de ser digitada →
 * `pendingQuizCards` passa a incluí-la → o efeito da LessonView chama
 * `applyQuizOverlayStep(ctx, {kind:'aguardar-resposta'})` → 'sobre-a-tela'. O
 * modal subia por cima da tela no instante exato em que o aluno acabara de
 * clicar para pular a digitação.
 *
 * Estas asserções travam o caminho do PRODUTO (`applyQuizOverlayStep`), não só
 * o valor de retorno da função de intenção: quem abre o overlay passa a ser
 * SEMPRE um gesto — `reopenQuizOverlay` (o botão do card) ou
 * `openQuizOverlay`.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('ONDA11 — o overlay só sobe por GESTO do aluno', () => {
  it('a seção terminou de ser apresentada: o quiz FICA NA CONVERSA, não sobe', () => {
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    assert.equal(
      peekQuizOverlay().phase,
      'minimizado-no-chat',
      'o modal subiu sozinho no fim da digitação — foi exatamente a queixa do dono',
    );
    assert.equal(peekQuizOverlay().quizKey, 's1::a1', 'o contexto é escrito para o card da conversa');
  });

  it('nenhum passo do ciclo tem intenção de SUBIR o overlay', () => {
    const todos: QuizCycleStep[] = [
      { kind: 'aguardar-resposta', generation: 0 },
      { kind: 'explicar-erro', generation: 0, selected: 3 },
      { kind: 'gerar-novo-quiz', generation: 0 },
      { kind: 'dominado', generation: 1 },
    ];
    for (const step of todos) {
      assert.notEqual(
        quizOverlayIntent(step),
        'sobre-a-tela',
        `${step.kind} pede a tela por conta própria — só o gesto do aluno pode`,
      );
    }
  });

  it('o quiz NOVO (remediador) também chega na conversa, sem subir', () => {
    // volta completa: espera → erra → explica → gera → o remediador chega
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    applyQuizOverlayStep(ctx(), { kind: 'explicar-erro', generation: 0, selected: 3 });
    applyQuizOverlayStep(ctx(), { kind: 'gerar-novo-quiz', generation: 0 });
    const g1 = ctx({ assertionId: 's1::a1#g1', generation: 1 });
    applyQuizOverlayStep(g1, { kind: 'aguardar-resposta', generation: 1 });
    const s = peekQuizOverlay();
    assert.equal(s.phase, 'minimizado-no-chat', 'o quiz novo não sobe por cima da explicação');
    assert.equal(s.generation, 1, 'mas o card da conversa já é o da geração nova');
  });

  it('o GESTO abre — e um re-render com o mesmo passo NÃO derruba o que o aluno abriu', () => {
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    reopenQuizOverlay('s1::a1');
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela', 'o botão do card abre o modal');
    const aberto = peekQuizOverlay();
    // A view reexecuta o efeito a cada mudança do chat, com o MESMO passo.
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    assert.equal(peekQuizOverlay(), aberto, 'no-op por referência: o modal aberto continua aberto');
  });

  it("'dominado' continua FECHANDO o overlay", () => {
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    reopenQuizOverlay('s1::a1');
    applyQuizOverlayStep(ctx(), { kind: 'dominado', generation: 0 });
    assert.equal(peekQuizOverlay().phase, 'fechado');
  });

  it('sair e voltar da aba Aula preserva a fase (o efeito reexecuta sem apagar nada)', () => {
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    reopenQuizOverlay('s1::a1');
    // …a view desmonta (nada acontece no store) e remonta: o efeito roda de novo
    applyQuizOverlayStep(ctx(), { kind: 'aguardar-resposta', generation: 0 });
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela', 'a fase sobreviveu à troca de aba');
  });
});
