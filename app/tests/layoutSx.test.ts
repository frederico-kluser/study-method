/**
 * tests/layoutSx.test.ts — os `sx` partilhados de layout, sem jsdom.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * `src/lib/layoutSx.ts` é a fonte única dos blocos `sx` que estavam copiados
 * pela base (auditoria de layout §1, §3, §4, §8, §10). Cada bloco medido aqui
 * é um composto EXATO das cópias que aposenta — se um valor divergir, é a
 * cópia que sai errada, não o token.
 *
 *   BLOCO 1 — ALVO DE TOQUE: os três compostos do §1 (`touchTargetSx`,
 *     `touchTargetBoxSx`, `actionButtonSx`) e os dois de rótulo que quebra
 *     (§1) derivam TODOS de `TARGET.minTouchTargetPx` — nunca de um 44 solto.
 *   BLOCO 2 — ALERTA COM DETALHE (§3): o par body2/caption das 4 cópias.
 *   BLOCO 3 — COLUNA CENTRADA (§4): `centeredColumnSx` com e sem `topPad`.
 *   BLOCO 4 — SECÇÃO E CARTÃO (§8/§10): a descrição `body2` das 5 cópias, o
 *     padding canónico do CardContent (3 cópias) e o título semibold (16).
 *   BLOCO 5 — GUARDA DE VALORES: nenhum estilo aqui contém cor crua (hex) —
 *     cor vive em designTokens/theme; estas receitas são geometria.
 *
 * Reprodução: `bash tools/t.sh tests/layoutSx.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  actionButtonSx,
  alertDetailSx,
  alertMessageSx,
  centeredColumnSx,
  infoCardPaddingSx,
  infoCardTitleSx,
  sectionDescriptionSx,
  touchTargetBoxSx,
  touchTargetSx,
  wrappingActionAnywhereSx,
  wrappingActionSx,
} from '../src/lib/layoutSx';
import { TARGET } from '../src/lib/designTokens';

/** Varre strings dentro de um objeto de estilo (para as guardas de classe). */
function stringsDe(valor: unknown, saida: string[] = []): string[] {
  if (typeof valor === 'string') {
    saida.push(valor);
  } else if (Array.isArray(valor)) {
    for (const item of valor) stringsDe(item, saida);
  } else if (valor !== null && typeof valor === 'object') {
    for (const item of Object.values(valor)) stringsDe(item, saida);
  }
  return saida;
}

describe('layoutSx — BLOCO 1: alvo de toque (§1)', () => {
  it('touchTargetSx é o minHeight do piso — vindo do token, nunca de literal', () => {
    assert.deepEqual(touchTargetSx, { minHeight: TARGET.minTouchTargetPx });
    assert.equal(touchTargetSx.minHeight, 44);
  });

  it('touchTargetBoxSx é a caixa quadrada do piso (width + height)', () => {
    assert.deepEqual(touchTargetBoxSx, {
      width: TARGET.minTouchTargetPx,
      height: TARGET.minTouchTargetPx,
    });
  });

  it('actionButtonSx é o composto das 5 cópias: nowrap + piso + px: 3', () => {
    assert.deepEqual(actionButtonSx, {
      whiteSpace: 'nowrap',
      minHeight: TARGET.minTouchTargetPx,
      px: 3,
    });
  });

  it('os rótulos que quebram mantêm o piso e distinguem break-word de anywhere', () => {
    assert.equal(wrappingActionSx.minHeight, TARGET.minTouchTargetPx);
    assert.equal(wrappingActionSx.whiteSpace, 'normal');
    assert.equal(wrappingActionSx.overflowWrap, 'break-word');
    assert.equal(wrappingActionAnywhereSx.minHeight, TARGET.minTouchTargetPx);
    assert.equal(wrappingActionAnywhereSx.overflowWrap, 'anywhere');
  });
});

describe('layoutSx — BLOCO 2: alerta com detalhe (§3)', () => {
  it('o par body2/caption é exatamente o das 4 cópias', () => {
    assert.deepEqual(alertMessageSx, { display: 'block' });
    assert.deepEqual(alertDetailSx, { display: 'block', opacity: 0.85 });
  });
});

describe('layoutSx — BLOCO 3: coluna centrada (§4)', () => {
  it('o molde é p: 2 + maxWidth + mx auto', () => {
    assert.deepEqual(centeredColumnSx(640), { p: 2, maxWidth: 640, mx: 'auto' });
  });

  it('topPad é opcional e entra como pt (as variantes com respiro)', () => {
    assert.deepEqual(centeredColumnSx(640, 4), { p: 2, maxWidth: 640, mx: 'auto', pt: 4 });
  });

  it('a largura é do chamador — o token LAYOUT decide, o helper obedece', () => {
    assert.equal(centeredColumnSx(1200).maxWidth, 1200);
  });
});

describe('layoutSx — BLOCO 4: secção e cartão (§8/§10)', () => {
  it('a descrição de secção é a das 5 cópias (text.secondary + mb 1.5)', () => {
    assert.deepEqual(sectionDescriptionSx, { color: 'text.secondary', mb: 1.5 });
  });

  it('o padding do CardContent é o canónico (p 1.5 e last-child sem respiro extra)', () => {
    assert.deepEqual(infoCardPaddingSx, { p: 1.5, '&:last-child': { pb: 1.5 } });
  });

  it('o título do cartão é semibold e quebra em limites de palavra', () => {
    assert.deepEqual(infoCardTitleSx, { fontWeight: 600, overflowWrap: 'break-word' });
  });
});

describe('layoutSx — BLOCO 5: nenhuma cor crua nestas receitas', () => {
  const receitas: Array<[string, unknown]> = [
    ['touchTargetSx', touchTargetSx],
    ['touchTargetBoxSx', touchTargetBoxSx],
    ['actionButtonSx', actionButtonSx],
    ['wrappingActionSx', wrappingActionSx],
    ['wrappingActionAnywhereSx', wrappingActionAnywhereSx],
    ['alertMessageSx', alertMessageSx],
    ['alertDetailSx', alertDetailSx],
    ['centeredColumnSx', centeredColumnSx(640)],
    ['infoCardPaddingSx', infoCardPaddingSx],
    ['infoCardTitleSx', infoCardTitleSx],
  ];

  it('nenhuma string com hex: cor vive em designTokens/theme (regra do design system)', () => {
    for (const [nome, receita] of receitas) {
      for (const texto of stringsDe(receita)) {
        assert.ok(
          !/#[0-9a-fA-F]{3,8}\b/.test(texto),
          `${nome} contém cor crua "${texto}" — cor vive em designTokens/theme`,
        );
      }
    }
  });
});
