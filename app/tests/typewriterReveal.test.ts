/**
 * tests/typewriterReveal.test.ts — a MÁQUINA DE REVELAÇÃO por passos do
 * typewriter, sem jsdom.
 *
 * O `TypewriterText` é o dono do relógio (timers/refs — a fronteira DOM); as
 * DECISÕES que ele toma a cada momento vivem na pura
 * `src/lib/typewriterReveal.ts` (extração state/view da onda Storybook) e são
 * exercitadas aqui sem timers nem DOM:
 *
 *   BLOCO 1 — `initialRevealCut`: o corte com que a mensagem nasce
 *     (mensagem nova → 0, para digitar; `instant`/restaurada → inteira).
 *
 *   BLOCO 2 — `planSkipReveal`: o plano do PULO do aluno (ONDA10 +
 *     ONDA-SKIP-1S): sem resto → 'complete'; `prefers-reduced-motion: reduce`
 *     (SC 2.3.3) → 'complete'; resto com movimento → 'sweep' (~1 s, nunca
 *     estoura na cara, nunca re-dispara onStart).
 *
 *   BLOCO 3 — `typingRevealStep`: um passo do relógio de digitação — o corte
 *     sai de `typewriterCut` (a conta de velocidade, guardada em
 *     tests/lessonTypewriterReadingSpeed.test.ts) e `done` fecha o passo.
 *
 *   BLOCO 4 — a VIEW delega: `TypewriterText` REAL renderizado por
 *     react-dom/server (import dinâmico com URL — padrão de
 *     tests/lessonSidebarHeader.test.ts), provando que o corte inicial do
 *     render é o da pura em todos os modos (o efeito de timers não corre em
 *     SSR, então o que se mede é exatamente `initialRevealCut`).
 *
 * Reprodução: `bash tools/t.sh tests/typewriterReveal.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  initialRevealCut,
  planSkipReveal,
  typingRevealStep,
} from '../src/lib/typewriterReveal';
import { typewriterCut, typewriterDelayPerChar } from '../src/lib/trackLessonState';

// ATENÇÃO ao padrão da casa: o componente é .tsx e o tsconfig de tests/ não
// liga `jsx` — por isso a importação é DINÂMICA por URL (mesma técnica de
// tests/lessonSidebarHeader.test.ts).
const TYPEWRITER_MODULE = new URL('../src/components/chat/TypewriterText.tsx', import.meta.url)
  .href;

/** Props do TypewriterText (contrato local — o tipo real vive no .tsx). */
type TypewriterTextProps = {
  text: string;
  active: boolean;
  tps?: number;
  instant?: boolean;
  skip?: boolean;
  onStart?: () => void;
  onDone?: () => void;
  onTick?: () => void;
  children: (partial: string, cut: number) => ReactNode;
};

const TEXTO = 'A soma dos quadrados de catetos…';

/* ═══════════════════════════ BLOCO 1 — initialRevealCut ═══════════════════ */

describe('initialRevealCut — o corte com que a mensagem nasce', () => {
  it('mensagem NOVA (active, sem instant) nasce VAZIA — vai digitar do zero', () => {
    assert.equal(initialRevealCut(TEXTO, true, false), 0);
  });

  it('`instant` (bolha de erro — ONDA2-CHAT-NINTENDO) nasce INTEIRA', () => {
    assert.equal(initialRevealCut(TEXTO, true, true), TEXTO.length);
  });

  it('restaurada do cache/seed (active=false) nasce INTEIRA — nunca digita', () => {
    assert.equal(initialRevealCut(TEXTO, false, false), TEXTO.length);
  });

  it('`instant` vence sobre `active` (decisão de CONTEÚDO)', () => {
    assert.equal(initialRevealCut(TEXTO, false, true), TEXTO.length);
  });

  it('texto vazio nasce "inteiro" nos dois modos (0 = 0)', () => {
    assert.equal(initialRevealCut('', true, false), 0);
    assert.equal(initialRevealCut('', false, true), 0);
  });
});

/* ═══════════════════════════ BLOCO 2 — planSkipReveal ════════════════════ */

describe('planSkipReveal — o plano do pulo do aluno (ONDA-SKIP-1S)', () => {
  it('com RESTO e movimento normal → varredura de ~1 s (nunca instantâneo)', () => {
    assert.equal(planSkipReveal(300, 120, false), 'sweep');
  });

  it('sem RESTO (o pulo chegou depois do fim natural) → complete', () => {
    assert.equal(planSkipReveal(300, 300, false), 'complete');
    assert.equal(planSkipReveal(300, 301, false), 'complete');
  });

  it('texto vazio → complete (não há resto para varrer)', () => {
    assert.equal(planSkipReveal(0, 0, false), 'complete');
  });

  it('SC 2.3.3: prefers-reduced-motion → complete (o conteúdo não depende do movimento)', () => {
    assert.equal(planSkipReveal(300, 0, true), 'complete');
    assert.equal(planSkipReveal(300, 120, true), 'complete');
  });

  it('o pulo COMPLETO ainda é instantâneo mesmo sem resto — nunca re-varre', () => {
    // Idempotência: a mesma entrada devolve sempre o mesmo plano (o `doneRef`
    // do componente é quem sela; aqui, a decisão não oscila).
    assert.equal(planSkipReveal(300, 300, false), planSkipReveal(300, 300, false));
  });
});

/* ═══════════════════════════ BLOCO 3 — typingRevealStep ══════════════════ */

describe('typingRevealStep — um passo do relógio de digitação', () => {
  it('o corte sai de typewriterCut (a conta de velocidade da casa, intocada)', () => {
    const texto = 'x'.repeat(1000);
    const step = typingRevealStep(texto, 100, 100);
    assert.equal(step.cut, typewriterCut(texto, 100, 100));
    assert.equal(step.cut, 40, '100 tps ≈ 400 chars/s → 100 ms = 40 chars');
  });

  it('a teoria (7 tps = 28 chars/s) revela em velocidade de LEITURA', () => {
    const texto = 'x'.repeat(28);
    const meio = typingRevealStep(texto, 7, 500);
    assert.equal(meio.cut, 14, 'metade do tempo → metade do texto');
    assert.equal(meio.done, false);
    const fim = typingRevealStep(texto, 7, 1000);
    assert.equal(fim.cut, 28);
    assert.equal(fim.done, true);
  });

  it('done só quando o corte cobre o texto inteiro', () => {
    const texto = 'abcde';
    assert.equal(typingRevealStep(texto, 100, 0).done, false);
    assert.equal(typingRevealStep(texto, 100, 10).done, false, '4 de 5 chars ainda não é o fim');
    assert.equal(typingRevealStep(texto, 100, 12.5).done, true, '5 de 5 chars é o fim');
    assert.equal(typingRevealStep(texto, 100, 1000).done, true);
  });

  it('monotônico: o corte nunca recua e nunca passa do fim', () => {
    const texto = 'x'.repeat(500);
    let anterior = -1;
    for (const elapsed of [0, 50, 123, 400, 999, 1250, 9999]) {
      const { cut } = typingRevealStep(texto, 100, elapsed);
      assert.ok(cut >= anterior, `corte recuou em ${elapsed}ms`);
      assert.ok(cut <= texto.length, 'corte passou do fim');
      anterior = cut;
    }
  });

  it('texto vazio termina no primeiro passo (cut 0 ≥ length 0)', () => {
    assert.deepEqual(typingRevealStep('', 100, 0), { cut: 0, done: true });
  });

  it('o atraso por caractere acompanha o tps (1000 / (tps * 4))', () => {
    assert.equal(typewriterDelayPerChar(100), 2.5);
    assert.equal(typewriterDelayPerChar(7), 1000 / 28);
  });
});

/* ═══════════════════ BLOCO 4 — a VIEW delega à pura (SSR real) ═══════════ */

describe('TypewriterText (SSR) — o corte inicial renderizado é o de initialRevealCut', () => {
  let TypewriterText: ComponentType<TypewriterTextProps>;

  before(async () => {
    const mod = (await import(TYPEWRITER_MODULE)) as {
      TypewriterText: ComponentType<TypewriterTextProps>;
    };
    TypewriterText = mod.TypewriterText;
  });

  /** O que a render-prop recebeu em cada render (`partial`, `cut`). */
  function renderCorte(props: Omit<TypewriterTextProps, 'children'>): {
    partial: string;
    cut: number;
  } {
    const recebido: { partial: string; cut: number } = { partial: '', cut: -1 };
    renderToStaticMarkup(
      createElement(
        TypewriterText,
        { ...props, children: (partial: string, cut: number) => {
          recebido.partial = partial;
          recebido.cut = cut;
          return createElement('span', null, partial);
        } },
      ),
    );
    return recebido;
  }

  it('mensagem NOVA nasce vazia (cut 0) — o parcial é a string vazia', () => {
    const { partial, cut } = renderCorte({ text: TEXTO, active: true });
    assert.equal(cut, 0);
    assert.equal(partial, '');
  });

  it('restaurada (active=false) renderiza o texto INTEIRO de uma vez', () => {
    const { partial, cut } = renderCorte({ text: TEXTO, active: false });
    assert.equal(cut, TEXTO.length);
    assert.equal(partial, TEXTO);
  });

  it('`instant` (bolha de erro) renderiza o texto INTEIRO de uma vez', () => {
    const { partial, cut } = renderCorte({ text: TEXTO, active: true, instant: true });
    assert.equal(cut, TEXTO.length);
    assert.equal(partial, TEXTO);
  });

  it('o parcial é sempre text.slice(0, cut) — o contrato da render-prop', () => {
    const { partial, cut } = renderCorte({ text: TEXTO, active: true, instant: true });
    assert.equal(partial, TEXTO.slice(0, cut));
  });
});
