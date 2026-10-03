/**
 * tests/focusTrap.test.ts — o LAÇO DE FOCO do diálogo, sem jsdom.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * `src/lib/focusTrap.ts` é a fonte única do seletor `FOCUSABLE`, da volta do
 * Tab nas bordas e da devolução de foco ao abridor (auditoria de layout §7 —
 * o bloco que estava copiado 4×). O DOM é por INJEÇÃO: tudo aqui corre com
 * objetos de mentira que satisfazem os contratos estruturais (`focus`,
 * `querySelectorAll`, `isConnected`, `querySelector`), exatamente como o
 * `node:test` desta base manda (sem jsdom — ver
 * tests/quizOverlayFocusReturn.test.ts, que exercita a versão original).
 *
 *   BLOCO 1 — SELETOR: a lista canónica é a do exemplar e NÃO aceita
 *     `[tabindex="-1"]` nem controlo desabilitado (quem não recebe Tab não
 *     entra no ciclo).
 *   BLOCO 2 — getFocusable: consulta injetada → array plano; contentor nulo
 *     devolve vazio (nunca lança).
 *   BLOCO 3 — trapTabTarget: as cinco regras do contrato —
 *     (1) sem alvos, o Tab volta ao painel; (2) Shift+Tab no primeiro (ou no
 *     painel) dá a volta ao último; (3) Tab no último dá a volta ao primeiro;
 *     (4) foco ESCAPADO volta a entrar pela ponta certa; (5) no meio da lista
 *     o laço não intervém.
 *   BLOCO 4 — createFocusLoop: só chama preventDefault quando INTERVÉM (o
 *     trap que sequestra Tab no meio do formulário é bug), ignora outras
 *     teclas e desliga-se sem contentor.
 *   BLOCO 5 — focusReturnTarget: as três pernas da devolução (abridor
 *     conectado → abridor; senão a âncora conectada; senão NINGUÉM).
 *
 * Reprodução: `bash tools/t.sh tests/focusTrap.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FOCUSABLE_SELECTOR,
  createFocusLoop,
  focusElement,
  focusReturnTarget,
  getFocusable,
  trapTabTarget,
  type FocusLoopKeyEventLike,
  type FocusRootLike,
  type FocusableLike,
} from '../src/lib/focusTrap';

/** Um alvo focável de mentira: conta as chamadas de `focus`. */
function alvo(nome: string): { nome: string; chamadas: number; focus(): void } {
  return {
    nome,
    chamadas: 0,
    focus() {
      this.chamadas += 1;
    },
  };
}

/** Contentor de mentira: devolve `itens` a QUALQUER seletor. */
function contentor(itens: Array<ReturnType<typeof alvo>>): FocusRootLike {
  return {
    querySelectorAll: () => itens,
  };
}

/** Evento de teclado de mentira com `preventDefault` contado. */
function tecla(
  key: string,
  shiftKey = false,
): FocusLoopKeyEventLike & { prevenido: number } {
  return {
    key,
    shiftKey,
    prevenido: 0,
    preventDefault() {
      this.prevenido += 1;
    },
  };
}

describe('focusTrap — BLOCO 1: o seletor canónico', () => {
  it('é a lista do exemplar (a[href] + controlos não desabilitados + tabindex útil)', () => {
    assert.equal(
      FOCUSABLE_SELECTOR,
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
  });

  it('não inclui tabindex="-1" nem botão desabilitado (quem não recebe Tab fica fora)', () => {
    assert.ok(FOCUSABLE_SELECTOR.includes('[tabindex]:not([tabindex="-1"])'));
    assert.ok(FOCUSABLE_SELECTOR.includes('button:not([disabled])'));
  });
});

describe('focusTrap — BLOCO 2: getFocusable consulta por injeção', () => {
  it('devolve os itens do contentor como array plano', () => {
    const a = alvo('a');
    const b = alvo('b');
    const raiz = contentor([a, b]);
    assert.deepEqual(getFocusable(raiz), [a, b]);
  });

  it('contentor nulo devolve vazio — nunca lança', () => {
    assert.deepEqual(getFocusable(null), []);
  });
});

/** Um "activeElement" que não pertence a lista nenhuma (o body, por exemplo). */
const foraDeCena = alvo('fora');

describe('focusTrap — BLOCO 3: trapTabTarget (as cinco regras)', () => {
  const primeiro = alvo('primeiro');
  const meio = alvo('meio');
  const ultimo = alvo('ultimo');
  const painel = alvo('painel');
  const itens = [primeiro, meio, ultimo];

  it('regra 5: no meio da lista o laço NÃO intervém', () => {
    assert.equal(trapTabTarget(itens, meio, false, painel), null);
    assert.equal(trapTabTarget(itens, meio, true, painel), null);
  });

  it('regra 3: Tab no último dá a volta ao primeiro', () => {
    assert.equal(trapTabTarget(itens, ultimo, false, painel), primeiro);
  });

  it('regra 2: Shift+Tab no primeiro — e no próprio painel — dá a volta ao último', () => {
    assert.equal(trapTabTarget(itens, primeiro, true, painel), ultimo);
    assert.equal(trapTabTarget(itens, painel, true, painel), ultimo);
  });

  it('regra 4: foco escapado volta a entrar pela ponta certa', () => {
    const fora = alvo('fora');
    assert.equal(trapTabTarget(itens, fora, false, painel), primeiro);
    assert.equal(trapTabTarget(itens, fora, true, painel), ultimo);
  });

  it('regra 1: sem nada focável, o Tab volta ao painel', () => {
    assert.equal(trapTabTarget([], painel, false, painel), painel);
    assert.equal(trapTabTarget([], foraDeCena, true, painel), painel);
  });

  it('sem painel e sem alvos, não há o que fazer (null)', () => {
    assert.equal(trapTabTarget([], null, false, null), null);
  });
});

describe('focusTrap — BLOCO 4: createFocusLoop (o handler pronto)', () => {
  it('Tab no último: preventDefault UMA vez e o foco vai ao primeiro', () => {
    const primeiro = alvo('primeiro');
    const ultimo = alvo('ultimo');
    const painel: FocusRootLike & { focus(): void; chamadas: number } = {
      querySelectorAll: () => [primeiro, ultimo],
      chamadas: 0,
      focus() {
        this.chamadas += 1;
      },
    };
    const loop = createFocusLoop({ getContainer: () => painel, getActive: () => ultimo });
    const e = tecla('Tab');
    loop(e);
    assert.equal(e.prevenido, 1);
    assert.equal(primeiro.chamadas, 1);
    assert.equal(ultimo.chamadas, 0);
  });

  it('Shift+Tab no painel: o foco vai ao último (quem abre o modal foca o painel)', () => {
    const primeiro = alvo('primeiro');
    const ultimo = alvo('ultimo');
    const painel: FocusRootLike & { focus(): void } = {
      querySelectorAll: () => [primeiro, ultimo],
      focus() {},
    };
    const loop = createFocusLoop({ getContainer: () => painel, getActive: () => painel });
    const e = tecla('Tab', true);
    loop(e);
    assert.equal(e.prevenido, 1);
    assert.equal(ultimo.chamadas, 1);
  });

  it('no meio da lista não há preventDefault (o Tab do formulário não é sequestrado)', () => {
    const a = alvo('a');
    const b = alvo('b');
    const painel: FocusRootLike & { focus(): void } = {
      querySelectorAll: () => [a, b],
      focus() {},
    };
    const loop = createFocusLoop({ getContainer: () => painel, getActive: () => a });
    const e = tecla('Tab');
    loop(e);
    assert.equal(e.prevenido, 0);
    assert.equal(a.chamadas + b.chamadas, 0);
  });

  it('outras teclas e contentor nulo não fazem nada', () => {
    const a = alvo('a');
    const painel: FocusRootLike & { focus(): void } = {
      querySelectorAll: () => [a],
      focus() {},
    };
    const loop = createFocusLoop({ getContainer: () => painel, getActive: () => painel });
    const escape = tecla('Escape');
    loop(escape);
    assert.equal(escape.prevenido, 0);
    assert.equal(a.chamadas, 0);

    const loopSemContentor = createFocusLoop({ getContainer: () => null, getActive: () => null });
    const tab = tecla('Tab');
    loopSemContentor(tab);
    assert.equal(tab.prevenido, 0);
  });

  it('com UM alvo só, o Tab dentro dele dá a volta nele mesmo (trap fechado)', () => {
    const so = alvo('so');
    const painel: FocusRootLike & { focus(): void } = {
      querySelectorAll: () => [so],
      focus() {},
    };
    const loop = createFocusLoop({ getContainer: () => painel, getActive: () => so });
    const e = tecla('Tab');
    loop(e);
    assert.equal(e.prevenido, 1);
    assert.equal(so.chamadas, 1);
  });
});

describe('focusTrap — BLOCO 5: focusReturnTarget (para onde o foco volta)', () => {
  interface NoFake {
    readonly isConnected: boolean;
    chamadas: number;
    focus(): void;
    querySelector(seletor: string): NoFake | null;
  }

  function no(conectado: boolean, filho: NoFake | null = null): NoFake {
    return {
      isConnected: conectado,
      chamadas: 0,
      focus() {
        this.chamadas += 1;
      },
      querySelector: () => filho,
    };
  }

  it('perna 1: o abridor conectado ganha', () => {
    const abridor = no(true);
    const ancora = no(true, no(true));
    assert.equal(focusReturnTarget(abridor, ancora), abridor);
  });

  it('perna 2: abridor desconectado → a âncora conectada devolve o primeiro focável', () => {
    const filho = no(true);
    const ancora = no(true, filho);
    assert.equal(focusReturnTarget(no(false), ancora), filho);
  });

  it('perna 3: sem abridor nem âncora válidos, NINGUÉM (nunca um foco arbitrário)', () => {
    assert.equal(focusReturnTarget(null, null), null);
    assert.equal(focusReturnTarget(no(false), no(false, no(true))), null);
    assert.equal(focusReturnTarget(no(false), no(true, null)), null);
    assert.equal(focusReturnTarget(null, no(true, null)), null);
  });

  it('focusElement tolera alvo sem focus (contrato opcional) e null', () => {
    // `FocusableLike` tem só `focus` opcional (weak type): um objeto VAZIO é
    // candidato válido — e é exatamente o caso do DOM (`Element` não tem
    // `focus`).
    const semFocus: FocusableLike = {};
    focusElement(semFocus);
    focusElement(null);
    focusElement(undefined);
    const com = no(true);
    focusElement(com);
    assert.equal(com.chamadas, 1);
  });
});
