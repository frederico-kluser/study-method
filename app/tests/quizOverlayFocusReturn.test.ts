/**
 * tests/quizOverlayFocusReturn.test.ts — PARA ONDE O FOCO VOLTA quando o modal
 * do quiz sai da tela (§8.1 do docs/ux-redesign.md; WCAG SC 2.4.3).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA MATAR
 * ══════════════════════════════════════════════════════════════════════════
 * O cabeçalho a11y do `QuizOverlayHost` prometia, desde a onda 11, que "ao
 * sair o foco VOLTA para o elemento que abriu o modal". O código era:
 *
 *     const opener = openerRef.current;
 *     openerRef.current = null;
 *     if (opener !== null && opener.isConnected) opener.focus();
 *
 * e ele NUNCA disparava. O único elemento que abre este modal é o CTA
 * "Responder" do `QuizChatCard`, e esse botão é DESMONTADO enquanto o modal
 * está em cena (`canOpen = !onScreen && status === 'aguardando'`): o
 * `document.activeElement` gravado na abertura está sempre desconectado na
 * hora de devolver o foco, `isConnected` é sempre false, e fechar com Esc
 * largava o teclado no `<body>`. Uma feature documentada como funcionando e
 * que nasce morta é pior que a ausência dela: ninguém vai procurar o bug.
 *
 * A correção não é "focar o CTA": é gravar uma ÂNCORA QUE SOBREVIVE — o card
 * da conversa, que ocupa o lugar nos dois estados — e devolver o foco ao
 * primeiro focável dentro dela, que é o CTA renascido.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE TESTE PODE EXISTIR NUM REPO SEM jsdom
 * ══════════════════════════════════════════════════════════════════════════
 * Porque a DECISÃO foi separada do DOM. `focusReturnTarget` recebe dois nós
 * estruturais (`isConnected` + `focus` + `querySelector`) e devolve o alvo;
 * quem chama `focus()` de verdade é o efeito do host. Aqui os nós são objetos
 * de mentira e as três pernas da regra ficam medidas de verdade — inclusive a
 * que o código antigo não tinha.
 *
 * O import é DINÂMICO com specifier computado, pela mesma razão do irmão
 * `tests/quizOverlayRender.test.ts`: o projeto composite dos testes compila
 * sem `jsx` e sem a lib DOM de propósito, e um import estático de `.tsx`
 * obrigaria a ligar as duas no projeto inteiro.
 *
 * Reprodução: `bash tools/t.sh tests/quizOverlayFocusReturn.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUIZ_CARD_ANCHOR_ATTR,
  QUIZ_CARD_ANCHOR_SELECTOR,
} from '../src/components/quiz/quizOverlayContent';

const HOST_MODULE = new URL('../src/components/quiz/QuizOverlayHost.tsx', import.meta.url).href;

/** O mínimo que a função enxerga de um nó (o mesmo contrato estrutural). */
interface FakeNode {
  isConnected: boolean;
  focus: () => void;
  querySelector: (selectors: string) => FakeNode | null;
  focado: number;
}

/** Um nó de mentira. `dentro` é o que o `querySelector` do laço encontraria. */
function node(isConnected: boolean, dentro: FakeNode | null = null): FakeNode {
  const n: FakeNode = {
    isConnected,
    focado: 0,
    focus: () => {
      n.focado += 1;
    },
    querySelector: () => dentro,
  };
  return n;
}

let focusReturnTarget: (opener: FakeNode | null, anchor: FakeNode | null) => FakeNode | null;

before(async () => {
  const mod = (await import(HOST_MODULE)) as { focusReturnTarget: typeof focusReturnTarget };
  focusReturnTarget = mod.focusReturnTarget;
});

describe('o foco volta para onde o aluno estava (SC 2.4.3)', () => {
  it('O CASO REAL: o CTA desmontou — o alvo é o botão que renasceu no card', () => {
    // Este é o cenário que acontece em 100% das aberturas deste modal, e é o
    // que a implementação anterior não cobria: `opener.isConnected` false.
    const cta = node(true);
    const opener = node(false);
    const anchor = node(true, cta);

    const alvo = focusReturnTarget(opener, anchor);
    assert.equal(alvo, cta, 'o alvo é o primeiro focável dentro do card da conversa');

    alvo?.focus();
    assert.equal(cta.focado, 1, 'o teclado volta para o CTA, não para o <body>');
    assert.equal(opener.focado, 0, 'ninguém tenta focar um elemento desconectado');
  });

  it('se o abridor SOBREVIVEU, é ele que recebe o foco de volta (e a âncora nem é lida)', () => {
    let consultada = 0;
    const opener = node(true);
    const anchor = node(true, node(true));
    anchor.querySelector = () => {
      consultada += 1;
      return null;
    };

    assert.equal(focusReturnTarget(opener, anchor), opener, 'a primeira perna da regra ganha');
    assert.equal(consultada, 0, 'a âncora é o PLANO B — sem abridor vivo, não antes');
  });

  it('card e abridor fora da árvore: NINGUÉM é focado (nunca um alvo arbitrário)', () => {
    // Trocar de aba desmonta a LessonView inteira. Devolver o foco a "o
    // primeiro focável que sobrou na página" jogaria o teclado num controle
    // que o aluno não pediu — pior que deixá-lo onde o navegador o colocou.
    assert.equal(focusReturnTarget(node(false), node(false, node(true))), null);
    assert.equal(focusReturnTarget(null, null), null);
    assert.equal(focusReturnTarget(node(false), null), null);
  });

  it('card vivo mas sem nada focável dentro: null, e sem exceção', () => {
    // Acontece de verdade: o card do quiz DOMINADO não desenha botão nenhum.
    assert.equal(focusReturnTarget(node(false), node(true, null)), null);
  });

  it('a regra não é "focar sempre": quem chama é o efeito, e ele só chama o alvo', () => {
    const cta = node(true);
    const anchor = node(true, cta);
    focusReturnTarget(node(false), anchor);
    assert.equal(cta.focado, 0, 'a função ESCOLHE; focar é decisão de quem chama');
    assert.equal(anchor.focado, 0, 'o card em si nunca recebe o foco (ele não é focável)');
  });
});

describe('o nome do atributo da âncora é ÚNICO e derivado', () => {
  it('o seletor é o atributo entre colchetes (nada de duas strings soltas)', () => {
    assert.equal(QUIZ_CARD_ANCHOR_ATTR, 'data-quiz-chat-card');
    assert.equal(QUIZ_CARD_ANCHOR_SELECTOR, `[${QUIZ_CARD_ANCHOR_ATTR}]`);
  });
});
