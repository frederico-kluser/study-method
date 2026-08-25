/**
 * tests/splitRatio.test.ts — contrato da matemática do split-pane (sem jsdom).
 *
 * Estes testes são escritos para MORDER: cada invariante tem uma asserção que
 * uma implementação frouxa reprova.
 *   - o clamp tem que usar as fronteiras EFETIVAS (piso em px), não só as de
 *     razão — por isso várias asserções comparam contra `bounds.min` E exigem
 *     que ele seja ESTRITAMENTE maior que `minRatio` no contêiner de teste;
 *   - o passo de teclado é comparado com o valor EXATO esperado, então um passo
 *     zerado ou pela metade reprova;
 *   - `aria-valuemin <= aria-valuenow <= aria-valuemax` é varrido em centenas de
 *     combinações de contêiner × razão;
 *   - toda leitura de lixo é verificada com `assert.doesNotThrow` + valor default.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import { SPATIAL_ALLOWED_PROPERTIES, SPATIAL_FORBIDDEN_PROPERTIES } from '../src/lib/designTokens';
import {
  clampSplitRatio,
  clearSplitRatio,
  DEFAULT_SPLIT_RATIO,
  nextRatioForKey,
  pxToRatio,
  ratioFromPointer,
  ratioToPx,
  readSplitRatio,
  roundSplitRatio,
  SPLIT_ARIA_I18N_KEY,
  SPLIT_CONSTRAINTS,
  SPLIT_DIVIDER_ID,
  SPLIT_HINT_I18N_KEY,
  SPLIT_KEYS,
  SPLIT_MOTION,
  SPLIT_PRIMARY_PANE_ID,
  SPLIT_RATIO_STORAGE_KEY,
  SPLIT_RATIO_STORAGE_VERSION,
  SPLIT_SECONDARY_PANE_ID,
  splitAriaValues,
  splitBounds,
  writeSplitRatio,
  type StorageLike,
} from '../src/lib/splitRatio';

const C = SPLIT_CONSTRAINTS;

/**
 * Contêiner de referência: 1000 px. Escolhido de propósito porque nele o PISO EM
 * PIXEL manda (280/992 = 0,2823 > minRatio 0,2). Um clamp que só olhe as
 * fronteiras de razão passa em 2000 px e REPROVA aqui.
 */
const PX_BOUND_CONTAINER = 1000;
/** Contêiner largo: aqui quem manda são as fronteiras de razão (0,2 / 0,8). */
const RATIO_BOUND_CONTAINER = 2000;
/** Contêiner inviável: não cabem 280 px dos dois lados (492 úteis). */
const TIGHT_CONTAINER = 500;

/* ── helpers ──────────────────────────────────────────────────────────────── */

interface FakeStorage extends StorageLike {
  readonly map: Map<string, string>;
}

function makeStorage(seed?: Record<string, string>): FakeStorage {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

/** Storage que EXPLODE — modo privado, quota estourada, sandbox. */
function makeThrowingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('SecurityError: localStorage indisponível');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
}

function stored(ratio: unknown, version: unknown = SPLIT_RATIO_STORAGE_VERSION): string {
  return JSON.stringify({ version, ratio });
}

function lookup(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, source);
}

/* ── splitBounds ──────────────────────────────────────────────────────────── */

describe('splitBounds: fronteiras efetivas', () => {
  it('contêiner NÃO medido devolve as fronteiras de razão cruas', () => {
    for (const container of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const b = splitBounds(container);
      assert.equal(b.measured, false, `container=${container}`);
      assert.equal(b.min, C.minRatio);
      assert.equal(b.max, C.maxRatio);
      assert.equal(b.usablePx, 0);
    }
  });

  it('contêiner largo: quem manda são as fronteiras de RAZÃO', () => {
    const b = splitBounds(RATIO_BOUND_CONTAINER);
    assert.equal(b.measured, true);
    assert.equal(b.feasible, true);
    assert.equal(b.min, C.minRatio);
    assert.equal(b.max, C.maxRatio);
    assert.equal(b.usablePx, RATIO_BOUND_CONTAINER - C.dividerPx);
  });

  it('contêiner estreito: o PISO EM PIXEL sobe a fronteira acima de minRatio', () => {
    const b = splitBounds(PX_BOUND_CONTAINER);
    assert.equal(b.feasible, true);
    // A asserção que mata o "clamp só por razão": a fronteira NÃO é 0,2.
    assert.ok(b.min > C.minRatio, `esperava piso de px acima de ${C.minRatio}, veio ${b.min}`);
    assert.ok(b.max < C.maxRatio);
    assert.equal(roundSplitRatio(b.min), roundSplitRatio(C.minPanePx / b.usablePx));
    // E o piso realmente vale 280 px de painel.
    assert.ok(b.min * b.usablePx >= C.minPanePx - 1e-9);
    assert.ok((1 - b.max) * b.usablePx >= C.minPanePx - 1e-9);
  });

  it('contêiner inviável colapsa as duas fronteiras no meio (e nunca inverte)', () => {
    const b = splitBounds(TIGHT_CONTAINER);
    assert.equal(b.measured, true);
    assert.equal(b.feasible, false);
    assert.equal(b.min, 0.5);
    assert.equal(b.max, 0.5);
  });

  it('min <= max em TODO tamanho de contêiner de 1 a 4000 px', () => {
    for (let container = 1; container <= 4000; container += 1) {
      const b = splitBounds(container);
      assert.ok(b.min <= b.max, `min>max em ${container}px (${b.min} > ${b.max})`);
      assert.ok(b.min >= 0 && b.max <= 1, `fora de [0,1] em ${container}px`);
    }
  });
});

/* ── clampSplitRatio ──────────────────────────────────────────────────────── */

describe('clampSplitRatio: o painel nunca some', () => {
  it('clampa nas fronteiras EFETIVAS, não nas de razão', () => {
    const b = splitBounds(PX_BOUND_CONTAINER);
    const low = clampSplitRatio(0.05, PX_BOUND_CONTAINER);
    const high = clampSplitRatio(0.99, PX_BOUND_CONTAINER);
    assert.equal(low, b.min);
    assert.equal(high, b.max);
    // Se o clamp ignorasse o piso em px, low seria 0.2 e high seria 0.8.
    assert.notEqual(low, C.minRatio);
    assert.notEqual(high, C.maxRatio);
  });

  it('deixa passar um valor já dentro da faixa (só arredondando)', () => {
    assert.equal(clampSplitRatio(0.5, PX_BOUND_CONTAINER), 0.5);
    assert.equal(clampSplitRatio(0.45, RATIO_BOUND_CONTAINER), 0.45);
  });

  it('corta a deriva de float em 4 casas', () => {
    // 0.45 - 0.02 === 0.43000000000000005 em IEEE-754.
    assert.equal(clampSplitRatio(0.45 - 0.02, RATIO_BOUND_CONTAINER), 0.43);
    assert.equal(roundSplitRatio(0.123456789), 0.1235);
  });

  it('valor não-finito cai no default (nunca NaN, nunca lança)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = clampSplitRatio(bad, RATIO_BOUND_CONTAINER);
      assert.ok(Number.isFinite(r), `NaN vazou para ${bad}`);
      assert.equal(r, DEFAULT_SPLIT_RATIO);
    }
  });

  it('PROPRIEDADE: nenhum painel fica abaixo de minPanePx em contêiner viável', () => {
    let checked = 0;
    for (let container = 600; container <= 3000; container += 37) {
      for (let raw = -0.5; raw <= 1.5; raw += 0.07) {
        const b = splitBounds(container);
        if (!b.feasible) continue;
        const { primaryPx, secondaryPx } = ratioToPx(clampSplitRatio(raw, container), container);
        assert.ok(
          primaryPx >= C.minPanePx,
          `primário ${primaryPx}px < ${C.minPanePx} (container=${container}, raw=${raw})`,
        );
        assert.ok(
          secondaryPx >= C.minPanePx,
          `secundário ${secondaryPx}px < ${C.minPanePx} (container=${container}, raw=${raw})`,
        );
        checked += 1;
      }
    }
    assert.ok(checked > 1000, `varredura fraca demais (${checked} casos)`);
  });
});

/* ── razão ⟷ px ──────────────────────────────────────────────────────────── */

describe('ratioToPx / pxToRatio', () => {
  it('a soma fecha EXATAMENTE o contêiner (sem fio de fundo entre os painéis)', () => {
    for (let container = 600; container <= 2500; container += 13) {
      for (const ratio of [0.3, 0.45, 0.5, 0.62]) {
        const px = ratioToPx(ratio, container);
        assert.equal(
          px.primaryPx + px.secondaryPx + px.dividerPx,
          container,
          `soma quebrada em container=${container}, ratio=${ratio}`,
        );
      }
    }
  });

  it('é monotônico: mais razão, mais pixel no painel líder', () => {
    let previous = -1;
    for (let ratio = 0.3; ratio <= 0.7; ratio += 0.05) {
      const { primaryPx } = ratioToPx(ratio, RATIO_BOUND_CONTAINER);
      assert.ok(primaryPx > previous, `não cresceu em ratio=${ratio}`);
      previous = primaryPx;
    }
  });

  it('contêiner não medido devolve zero px (e a razão já clampada)', () => {
    const px = ratioToPx(0.45, 0);
    assert.equal(px.primaryPx, 0);
    assert.equal(px.secondaryPx, 0);
    assert.equal(px.ratio, 0.45);
  });

  it('faz round-trip px → razão → px', () => {
    for (const primary of [300, 420, 500, 640]) {
      const ratio = pxToRatio(primary, PX_BOUND_CONTAINER);
      const back = ratioToPx(ratio, PX_BOUND_CONTAINER);
      assert.ok(
        Math.abs(back.primaryPx - primary) <= 1,
        `round-trip perdeu ${primary} → ${back.primaryPx}`,
      );
    }
  });

  it('px inválido ou contêiner não medido cai no default clampado', () => {
    assert.equal(pxToRatio(Number.NaN, PX_BOUND_CONTAINER), DEFAULT_SPLIT_RATIO);
    assert.equal(pxToRatio(500, 0), DEFAULT_SPLIT_RATIO);
  });
});

describe('ratioFromPointer: arraste', () => {
  it('ponteiro no meio do contêiner devolve metade a metade', () => {
    // primário = 500 - origem 0 - metade da divisória (4) = 496; 496/992 = 0,5.
    assert.equal(ratioFromPointer(500, 0, PX_BOUND_CONTAINER), 0.5);
  });

  it('respeita a origem do contêiner (não assume que a tela começa em 0)', () => {
    assert.equal(ratioFromPointer(500 + 320, 320, PX_BOUND_CONTAINER), 0.5);
  });

  it('arrastar para fora para nas fronteiras efetivas, não no zero', () => {
    const b = splitBounds(PX_BOUND_CONTAINER);
    assert.equal(ratioFromPointer(-9999, 0, PX_BOUND_CONTAINER), b.min);
    assert.equal(ratioFromPointer(9999, 0, PX_BOUND_CONTAINER), b.max);
    assert.ok(b.min > 0, 'a fronteira mínima não pode ser 0 — o painel sumiria');
  });

  it('coordenada não-finita não vira NaN', () => {
    assert.ok(Number.isFinite(ratioFromPointer(Number.NaN, 0, PX_BOUND_CONTAINER)));
  });
});

/* ── teclado ──────────────────────────────────────────────────────────────── */

describe('nextRatioForKey: a divisória é operável só com o teclado', () => {
  it('setas movem EXATAMENTE um passo na divisória vertical', () => {
    assert.equal(nextRatioForKey('ArrowLeft', 0.45, RATIO_BOUND_CONTAINER), 0.43);
    assert.equal(nextRatioForKey('ArrowRight', 0.45, RATIO_BOUND_CONTAINER), 0.47);
    // E o passo é mesmo `stepRatio` (um passo zerado ou dobrado reprova aqui).
    assert.equal(
      roundSplitRatio(
        Math.abs((nextRatioForKey('ArrowRight', 0.45, RATIO_BOUND_CONTAINER) as number) - 0.45),
      ),
      C.stepRatio,
    );
  });

  it('a divisória vertical IGNORA as setas verticais (e vice-versa)', () => {
    assert.equal(nextRatioForKey('ArrowUp', 0.45, RATIO_BOUND_CONTAINER), null);
    assert.equal(nextRatioForKey('ArrowDown', 0.45, RATIO_BOUND_CONTAINER), null);
    const h = { orientation: 'horizontal' as const };
    assert.equal(nextRatioForKey('ArrowUp', 0.45, RATIO_BOUND_CONTAINER, h), 0.43);
    assert.equal(nextRatioForKey('ArrowDown', 0.45, RATIO_BOUND_CONTAINER, h), 0.47);
    assert.equal(nextRatioForKey('ArrowLeft', 0.45, RATIO_BOUND_CONTAINER, h), null);
    assert.equal(nextRatioForKey('ArrowRight', 0.45, RATIO_BOUND_CONTAINER, h), null);
  });

  it('SPLIT_KEYS declara as mesmas teclas que a função trata', () => {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      const keys = SPLIT_KEYS[orientation];
      const opts = { orientation };
      assert.notEqual(nextRatioForKey(keys.decrease, 0.5, RATIO_BOUND_CONTAINER, opts), null);
      assert.notEqual(nextRatioForKey(keys.increase, 0.5, RATIO_BOUND_CONTAINER, opts), null);
      assert.ok(
        (nextRatioForKey(keys.decrease, 0.5, RATIO_BOUND_CONTAINER, opts) as number) < 0.5,
      );
      assert.ok(
        (nextRatioForKey(keys.increase, 0.5, RATIO_BOUND_CONTAINER, opts) as number) > 0.5,
      );
    }
  });

  it('Home e End vão para os extremos EFETIVOS (APG: menor/maior tamanho do líder)', () => {
    const b = splitBounds(PX_BOUND_CONTAINER);
    assert.equal(nextRatioForKey('Home', 0.5, PX_BOUND_CONTAINER), b.min);
    assert.equal(nextRatioForKey('End', 0.5, PX_BOUND_CONTAINER), b.max);
    // Extremos EFETIVOS: no contêiner de 1000 px eles NÃO são 0,2 e 0,8.
    assert.notEqual(nextRatioForKey('Home', 0.5, PX_BOUND_CONTAINER), C.minRatio);
    assert.notEqual(nextRatioForKey('End', 0.5, PX_BOUND_CONTAINER), C.maxRatio);
  });

  it('PageUp/PageDown usam o passo grosso', () => {
    assert.equal(nextRatioForKey('PageUp', 0.45, RATIO_BOUND_CONTAINER), 0.35);
    assert.equal(nextRatioForKey('PageDown', 0.45, RATIO_BOUND_CONTAINER), 0.55);
  });

  it('devolve null para tudo que NÃO trata — inclusive Enter (decisão documentada)', () => {
    for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a', '', 'ArrowLeftX']) {
      assert.equal(
        nextRatioForKey(key, 0.45, RATIO_BOUND_CONTAINER),
        null,
        `tecla "${key}" não deveria ser tratada`,
      );
    }
  });

  it('martelar a seta encosta na fronteira e PARA lá (nunca abaixo)', () => {
    const b = splitBounds(PX_BOUND_CONTAINER);
    let ratio = 0.5;
    for (let i = 0; i < 60; i += 1) {
      ratio = nextRatioForKey('ArrowLeft', ratio, PX_BOUND_CONTAINER) as number;
      assert.ok(ratio >= b.min, `passou da fronteira na iteração ${i}: ${ratio} < ${b.min}`);
    }
    assert.equal(ratio, b.min);
    for (let i = 0; i < 60; i += 1) {
      ratio = nextRatioForKey('ArrowRight', ratio, PX_BOUND_CONTAINER) as number;
      assert.ok(ratio <= b.max, `passou da fronteira na iteração ${i}`);
    }
    assert.equal(ratio, b.max);
  });

  it('razão de entrada corrompida ainda produz uma razão válida', () => {
    const r = nextRatioForKey('ArrowRight', Number.NaN, PX_BOUND_CONTAINER) as number;
    assert.ok(Number.isFinite(r));
    const b = splitBounds(PX_BOUND_CONTAINER);
    assert.ok(r >= b.min && r <= b.max);
  });
});

/* ── ARIA ─────────────────────────────────────────────────────────────────── */

describe('splitAriaValues: o que vai no role="separator"', () => {
  it('valueMin <= valueNow <= valueMax em toda combinação varrida', () => {
    let checked = 0;
    for (let container = 200; container <= 3000; container += 29) {
      for (let ratio = -0.2; ratio <= 1.2; ratio += 0.11) {
        const a = splitAriaValues(ratio, container);
        assert.ok(
          Number.isInteger(a.valueNow) &&
            Number.isInteger(a.valueMin) &&
            Number.isInteger(a.valueMax),
          `valor ARIA não inteiro em container=${container}`,
        );
        assert.ok(
          a.valueMin <= a.valueNow && a.valueNow <= a.valueMax,
          `fora da faixa: ${a.valueMin} <= ${a.valueNow} <= ${a.valueMax} (container=${container}, ratio=${ratio})`,
        );
        checked += 1;
      }
    }
    assert.ok(checked > 1000, `varredura fraca demais (${checked} casos)`);
  });

  it('anuncia as fronteiras EFETIVAS, não as constantes cruas', () => {
    const a = splitAriaValues(0.45, PX_BOUND_CONTAINER);
    assert.equal(a.valueNow, 45);
    assert.equal(a.valueMin, 28);
    assert.equal(a.valueMax, 72);
    assert.notEqual(a.valueMin, 20);
    assert.notEqual(a.valueMax, 80);
  });

  it('ecoa a orientação do traço para o aria-orientation', () => {
    assert.equal(splitAriaValues(0.5, PX_BOUND_CONTAINER).orientation, 'vertical');
    assert.equal(
      splitAriaValues(0.5, PX_BOUND_CONTAINER, 'horizontal').orientation,
      'horizontal',
    );
  });

  it('os ids de painel/divisória são estáveis e distintos (aria-controls)', () => {
    const ids = [SPLIT_PRIMARY_PANE_ID, SPLIT_SECONDARY_PANE_ID, SPLIT_DIVIDER_ID];
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z][\w-]*$/);
  });
});

/* ── persistência ─────────────────────────────────────────────────────────── */

describe('readSplitRatio / writeSplitRatio: tolerância a lixo', () => {
  it('faz round-trip pela chave versionada', () => {
    const ls = makeStorage();
    writeSplitRatio(0.62, ls);
    assert.equal(readSplitRatio(ls), 0.62);
    const raw = ls.map.get(SPLIT_RATIO_STORAGE_KEY) as string;
    assert.deepEqual(JSON.parse(raw), { version: SPLIT_RATIO_STORAGE_VERSION, ratio: 0.62 });
  });

  it('sem nada guardado devolve o default', () => {
    assert.equal(readSplitRatio(makeStorage()), DEFAULT_SPLIT_RATIO);
  });

  it('LIXO em todas as formas cai no default e NUNCA lança', () => {
    const garbage: string[] = [
      '',
      'null',
      'undefined',
      'not json at all',
      '{',
      '[]',
      '"0.5"',
      '42',
      '{}',
      stored(0.5, 2),
      stored(0.5, '1'),
      '{"ratio":0.5}',
      stored('0.5'),
      stored(null),
      stored(true),
      stored({ nested: 1 }),
      '{"version":1,"ratio":null}',
      '{"version":1}',
    ];
    for (const raw of garbage) {
      const ls = makeStorage({ [SPLIT_RATIO_STORAGE_KEY]: raw });
      let value = -1;
      assert.doesNotThrow(() => {
        value = readSplitRatio(ls);
      }, `lançou em ${JSON.stringify(raw)}`);
      assert.equal(value, DEFAULT_SPLIT_RATIO, `não caiu no default em ${JSON.stringify(raw)}`);
    }
  });

  it('valor FORA DE FAIXA cai no default (decisão documentada)', () => {
    for (const bad of [0, 0.05, 0.199, 0.81, 1, 2, -3]) {
      const ls = makeStorage({ [SPLIT_RATIO_STORAGE_KEY]: stored(bad) });
      assert.equal(readSplitRatio(ls), DEFAULT_SPLIT_RATIO, `aceitou ${bad}`);
    }
  });

  it('valor NA faixa sobrevive intacto (arredondado)', () => {
    for (const good of [0.2, 0.35, 0.5, 0.8]) {
      const ls = makeStorage({ [SPLIT_RATIO_STORAGE_KEY]: stored(good) });
      assert.equal(readSplitRatio(ls), good);
    }
    const ls = makeStorage({ [SPLIT_RATIO_STORAGE_KEY]: stored(0.333333333) });
    assert.equal(readSplitRatio(ls), 0.3333);
  });

  it('storage que EXPLODE não derruba nem a leitura nem a escrita', () => {
    const boom = makeThrowingStorage();
    let value = -1;
    assert.doesNotThrow(() => {
      value = readSplitRatio(boom);
    });
    assert.equal(value, DEFAULT_SPLIT_RATIO);
    assert.doesNotThrow(() => {
      writeSplitRatio(0.5, boom);
    });
    assert.doesNotThrow(() => {
      clearSplitRatio(boom);
    });
  });

  it('sem storage nenhum (null explícito) devolve o default sem escrever', () => {
    assert.equal(readSplitRatio(null), DEFAULT_SPLIT_RATIO);
    assert.doesNotThrow(() => {
      writeSplitRatio(0.5, null);
    });
  });

  it('escrever lixo NÃO apaga o valor bom que já estava lá', () => {
    const ls = makeStorage();
    writeSplitRatio(0.62, ls);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      writeSplitRatio(bad, ls);
      assert.equal(readSplitRatio(ls), 0.62, `${bad} corrompeu o valor guardado`);
    }
  });

  it('escrever fora de faixa grava clampado (nunca um valor impossível)', () => {
    const ls = makeStorage();
    writeSplitRatio(9, ls);
    assert.equal(readSplitRatio(ls), C.maxRatio);
    writeSplitRatio(-9, ls);
    assert.equal(readSplitRatio(ls), C.minRatio);
  });

  it('clearSplitRatio faz o próximo boot voltar ao default', () => {
    const ls = makeStorage();
    writeSplitRatio(0.7, ls);
    clearSplitRatio(ls);
    assert.equal(readSplitRatio(ls), DEFAULT_SPLIT_RATIO);
  });
});

describe('readSplitRatio: fronteira com globalThis.localStorage', () => {
  let previous: unknown;

  beforeEach(() => {
    previous = (globalThis as { localStorage?: unknown }).localStorage;
  });

  afterEach(() => {
    if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previous;
  });

  it('usa globalThis.localStorage quando o argumento é omitido', () => {
    const ls = makeStorage({ [SPLIT_RATIO_STORAGE_KEY]: stored(0.66) });
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    assert.equal(readSplitRatio(), 0.66);
    writeSplitRatio(0.3);
    assert.equal(readSplitRatio(), 0.3);
  });

  it('sem localStorage no ambiente (node puro) devolve o default', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    assert.doesNotThrow(() => readSplitRatio());
    assert.equal(readSplitRatio(), DEFAULT_SPLIT_RATIO);
  });
});

/* ── contratos cruzados ───────────────────────────────────────────────────── */

describe('contratos cruzados do split', () => {
  it('SPLIT_MOTION anima uma propriedade que o nível spatial PODE animar', () => {
    assert.ok(
      (SPATIAL_ALLOWED_PROPERTIES as readonly string[]).includes(SPLIT_MOTION.property),
      `${SPLIT_MOTION.property} não está em SPATIAL_ALLOWED_PROPERTIES`,
    );
    assert.ok(
      !(SPATIAL_FORBIDDEN_PROPERTIES as readonly string[]).includes(SPLIT_MOTION.property),
    );
    assert.ok(SPLIT_MOTION.durationMs > 0);
  });

  it('as chaves i18n da divisória existem NOS DOIS locales', () => {
    for (const key of [
      SPLIT_ARIA_I18N_KEY,
      SPLIT_HINT_I18N_KEY,
      'translation:challenge.statementPane',
      'translation:challenge.editorPane',
    ]) {
      const path = key.replace('translation:', '');
      assert.equal(typeof lookup(ptBR, path), 'string', `pt-BR sem ${path}`);
      assert.equal(typeof lookup(en, path), 'string', `en sem ${path}`);
      assert.ok((lookup(ptBR, path) as string).length > 0);
      assert.ok((lookup(en, path) as string).length > 0);
    }
  });

  it('o default cabe entre as fronteiras de razão', () => {
    assert.ok(DEFAULT_SPLIT_RATIO >= C.minRatio && DEFAULT_SPLIT_RATIO <= C.maxRatio);
  });
});
