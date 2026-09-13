/**
 * tests/shellSplitMath.test.ts — A MATEMÁTICA DA DIVISÓRIA DO SHELL, caso a caso.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMPLEMENTO (não cópia) de tests/splitRatio.test.ts — os blocos "extensão
 * shell" de lá varrem as invariantes gerais; ESTE arquivo desce nos números do
 * SHELL_SPLIT_CONSTRAINTS e cobre o que ficou de fora:
 *
 *   BLOCO 1 — REGIMES DAS FRONTEIRAS EFETIVAS. Com minPanePx 180 / dividerPx 6,
 *     o piso em px manda abaixo de ~1291,7px de contêiner e o de razão acima.
 *     E existe um contêiner EXATO (366px: 360 úteis) onde as duas fronteiras
 *     COLIDEM num ponto único (min == max == 0.5) sem ficar inviável — a
 *     "janela mínima" onde a divisória só tem uma posição possível.
 *   BLOCO 2 — geometria px com as constantes do shell: soma exata, janela
 *     mínima, inviável, contêiner não medido, monotonia, round-trip.
 *   BLOCO 3 — teclado APG COMPLETO com as constantes do shell (setas, Home/End
 *     efetivos, PageUp/PageDown, teclas não tratadas, martelar a fronteira) e
 *     o caso degenerado min==max (toda tecla devolve a MESMA razão).
 *   BLOCO 4 — ARIA com as constantes do shell: fronteiras EFETIVAS anunciadas
 *     (18/50 no contêiner de 1000px — não as cruas 14/50), varredura de faixa.
 *   BLOCO 5 — persistência do shell, bordas finas: valores EXATAMENTE nas
 *     fronteiras, payload do Desafio gravado na chave do shell, Infinity
 *     serializado como null, lixo que imita o payload, round-trip via
 *     globalThis.localStorage.
 *   BLOCO 6 — FLUXOS INTEGRADOS (puros, sem DOM): o contrato de arraste do App
 *     reconstruído com as FUNÇÕES DE PRODUÇÃO (ratioFromPointer → write →
 *     read), o passo de teclado persistido, e o pipeline razão persistida →
 *     ratioToPx que o App faz a cada render.
 *
 * Reprodução: `bash tools/t.sh tests/shellSplitMath.test.ts`
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clampSplitRatio,
  clearShellSplitRatio,
  DEFAULT_SHELL_SPLIT_RATIO,
  nextRatioForKey,
  pxToRatio,
  ratioFromPointer,
  ratioToPx,
  readShellSplitRatio,
  roundSplitRatio,
  SHELL_SIDEBAR_PANE_ID,
  SHELL_SPLIT_CONSTRAINTS,
  SHELL_SPLIT_DIVIDER_ID,
  SHELL_SPLIT_RATIO_STORAGE_KEY,
  SPLIT_RATIO_STORAGE_VERSION,
  splitAriaValues,
  splitBounds,
  writeShellSplitRatio,
  type StorageLike,
  type SplitConstraints,
} from '../src/lib/splitRatio';

const S: SplitConstraints = SHELL_SPLIT_CONSTRAINTS;

/* ── helpers (mesma técnica de splitRatio.test.ts) ───────────────────────── */

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

function makeThrowingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('SecurityError');
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

/**
 * Contêiner de referência 1000px: 994 úteis ⇒ piso de px 180/994 ≈ 0,181 > 0,14
 * — no SHELL o piso em px manda em janelas comuns (a fronteira de razão 0,14 só
 * volta a mandar acima de ~1291,7px).
 */
const PX_CONTAINER = 1000;
/** Contêiner largo: quem manda são as fronteiras de RAZÃO (0.14 / 0.5). */
const RATIO_CONTAINER = 2000;
/** Contêiner da COLISÃO: 360 úteis ⇒ 180/360 = 0.5 = maxRatio ⇒ min == max. */
const COLLISION_CONTAINER = 366;
/** Um px abaixo da colisão: inviável (180 não cabe dos dois lados). */
const INFEASIBLE_CONTAINER = 365;

/* ── BLOCO 1 — regimes das fronteiras efetivas do shell ──────────────────── */

describe('shell splitBounds: regimes de fronteira e a janela mínima', () => {
  it('contêiner mais fino que a DIVISÓRIA (1..dividerPx): medido, inviável, 0px úteis', () => {
    // O ramo `usablePx <= 0` de splitBounds — contêiner existe, mas a divisória
    // sozinha o consome. Degradação: meio clampado, 0 px distribuível.
    for (const container of [1, 2, 3, S.dividerPx]) {
      const b = splitBounds(container, S);
      assert.equal(b.measured, true, `container=${container}`);
      assert.equal(b.feasible, false, `container=${container}`);
      assert.equal(b.usablePx, 0, `container=${container}`);
      assert.equal(b.min, S.maxRatio, 'meio clampado: 0.5 está no teto de razão do shell');
      assert.equal(b.max, S.maxRatio);
    }
    // E o mesmo ramo com as constantes do Desafio (dividerPx 8).
    const c8 = splitBounds(3);
    assert.equal(c8.usablePx, 0);
    assert.equal(c8.min, 0.5);
    assert.equal(c8.max, 0.5);
  });
  it('contêiner de 1000px: o PISO EM PX manda (min ≈ 180/994, acima do cru 0.14)', () => {
    const b = splitBounds(PX_CONTAINER, S);
    assert.equal(b.measured, true);
    assert.equal(b.feasible, true);
    assert.equal(roundSplitRatio(b.min), roundSplitRatio(180 / 994));
    assert.ok(b.min > S.minRatio, `esperava min > ${S.minRatio}, veio ${b.min}`);
    assert.equal(b.max, S.maxRatio, 'no teto quem ainda manda é a razão 0.5');
    // O piso anunciado realmente garante os 180px de painel.
    assert.ok(b.min * b.usablePx >= S.minPanePx - 1e-9);
    assert.ok((1 - b.max) * b.usablePx >= S.minPanePx - 1e-9);
  });

  it('contêiner de 2000px: quem manda são as fronteiras de RAZÃO (0.14 / 0.5)', () => {
    const b = splitBounds(RATIO_CONTAINER, S);
    assert.equal(b.min, S.minRatio);
    assert.equal(b.max, S.maxRatio);
    assert.equal(b.feasible, true);
  });

  it('janela mínima (366px): as fronteiras COLIDEM num ponto único viável (min == max == 0.5)', () => {
    const b = splitBounds(COLLISION_CONTAINER, S);
    assert.equal(b.usablePx, 360);
    assert.equal(b.feasible, true, '180px cabe dos DOIS lados de 360 úteis — viável');
    assert.equal(b.min, 0.5);
    assert.equal(b.max, 0.5);
    // E a única posição possível de fato rende 180px para cada painel.
    const px = ratioToPx(0.3, COLLISION_CONTAINER, S);
    assert.equal(px.primaryPx, 180);
    assert.equal(px.secondaryPx, 180);
  });

  it('um px abaixo da colisão (365px): INVIÁVEL, degrada para o meio', () => {
    const b = splitBounds(INFEASIBLE_CONTAINER, S);
    assert.equal(b.feasible, false);
    assert.equal(b.min, 0.5);
    assert.equal(b.max, 0.5);
    assert.equal(b.usablePx, 359);
  });

  it('contêiner não medido (0/NaN/negativo): fronteiras de razão cruas', () => {
    for (const container of [0, -6, Number.NaN]) {
      const b = splitBounds(container, S);
      assert.equal(b.measured, false, `container=${container}`);
      assert.equal(b.min, S.minRatio);
      assert.equal(b.max, S.maxRatio);
      assert.equal(b.usablePx, 0);
    }
  });

  it('min <= max SEMPRE (varredura 1..4000px) e piso de px honrado onde viável', () => {
    let feasible = 0;
    for (let container = 1; container <= 4000; container += 1) {
      const b = splitBounds(container, S);
      assert.ok(b.min <= b.max, `min>max em ${container}px: ${b.min} > ${b.max}`);
      if (b.feasible) {
        feasible += 1;
        assert.ok(b.min * b.usablePx >= S.minPanePx - 1e-9, `piso esquerdo violado em ${container}px`);
        assert.ok((1 - b.max) * b.usablePx >= S.minPanePx - 1e-9, `piso direito violado em ${container}px`);
      }
    }
    // A partir da colisão (366px) toda janela é viável.
    assert.equal(feasible, 4000 - COLLISION_CONTAINER + 1);
  });
});

/* ── BLOCO 2 — geometria px com as constantes do shell ───────────────────── */

describe('shell ratioToPx / pxToRatio: a geometria que App.tsx aplica', () => {
  it('a soma fecha EXATAMENTE o contêiner (sidebar + divisória + main)', () => {
    for (let container = 366; container <= 2500; container += 17) {
      for (const ratio of [0.14, 0.2, 0.3, 0.5]) {
        const px = ratioToPx(ratio, container, S);
        assert.equal(
          px.primaryPx + px.secondaryPx + px.dividerPx,
          container,
          `soma quebrada em ${container}px, ratio=${ratio}`,
        );
        assert.equal(px.dividerPx, S.dividerPx);
      }
    }
  });

  it('nem a sidebar nem o main ficam abaixo de 180px em toda janela viável', () => {
    let checked = 0;
    for (let container = 366; container <= 2500; container += 7) {
      for (let raw = -0.2; raw <= 1.2; raw += 0.09) {
        const px = ratioToPx(raw, container, S);
        assert.ok(px.primaryPx >= S.minPanePx, `sidebar ${px.primaryPx}px < 180 em ${container}px`);
        assert.ok(px.secondaryPx >= S.minPanePx, `main ${px.secondaryPx}px < 180 em ${container}px`);
        checked += 1;
      }
    }
    assert.ok(checked > 1000, `varredura fraca (${checked})`);
  });

  it('na janela de colisão TODA razão de entrada vira 180/180 (sem caminho de colapso)', () => {
    for (const raw of [0, 0.01, 0.14, 0.2, 0.33, 0.49, 0.5, 0.9, 1, Number.NaN, -2]) {
      const px = ratioToPx(raw, COLLISION_CONTAINER, S);
      assert.equal(px.primaryPx, 180, `raw=${raw}`);
      assert.equal(px.secondaryPx, 180, `raw=${raw}`);
    }
  });

  it('contêiner não medido devolve 0px (o App troca pelo px de pré-medida)', () => {
    const px = ratioToPx(0.3, 0, S);
    assert.equal(px.primaryPx, 0);
    assert.equal(px.secondaryPx, 0);
    assert.equal(px.ratio, 0.3, 'a razão já sai clampada nas fronteiras de razão cruas');
    assert.equal(px.dividerPx, S.dividerPx);
  });

  it('é monotônico: mais razão, mais px na sidebar', () => {
    let previous = -1;
    for (let ratio = 0.14; ratio <= 0.5; ratio += 0.02) {
      const { primaryPx } = ratioToPx(ratio, RATIO_CONTAINER, S);
      assert.ok(primaryPx > previous, `não cresceu em ratio=${ratio}`);
      previous = primaryPx;
    }
  });

  it('round-trip px → razão → px com as constantes do shell', () => {
    for (const primary of [180, 240, 300, 420, 497]) {
      const ratio = pxToRatio(primary, PX_CONTAINER, S);
      const back = ratioToPx(ratio, PX_CONTAINER, S);
      assert.ok(
        Math.abs(back.primaryPx - primary) <= 1,
        `round-trip perdeu ${primary} → ${back.primaryPx}`,
      );
    }
  });

  it('clamp com as constantes do shell: 0.05 → min efetivo, 0.9 → 0.5', () => {
    const b = splitBounds(PX_CONTAINER, S);
    assert.equal(clampSplitRatio(0.05, PX_CONTAINER, S), b.min);
    assert.equal(clampSplitRatio(0.9, PX_CONTAINER, S), S.maxRatio);
    assert.equal(clampSplitRatio(0.3, PX_CONTAINER, S), 0.3);
  });
});

/* ── BLOCO 3 — teclado APG com as constantes do shell ────────────────────── */

describe('shell nextRatioForKey: a divisória do shell é operável por teclado', () => {
  const OPTS = { constraints: S } as const;

  it('setas movem EXATAMENTE stepRatio (0.02) — e na direção certa', () => {
    const right = nextRatioForKey('ArrowRight', 0.3, RATIO_CONTAINER, OPTS) as number;
    const left = nextRatioForKey('ArrowLeft', 0.3, RATIO_CONTAINER, OPTS) as number;
    assert.equal(roundSplitRatio(right - 0.3), S.stepRatio);
    assert.equal(roundSplitRatio(0.3 - left), S.stepRatio);
    assert.equal(right, 0.32);
    assert.equal(left, 0.28);
  });

  it('setas verticais são IGNORADAS pela divisória vertical (devolvem null)', () => {
    assert.equal(nextRatioForKey('ArrowUp', 0.3, RATIO_CONTAINER, OPTS), null);
    assert.equal(nextRatioForKey('ArrowDown', 0.3, RATIO_CONTAINER, OPTS), null);
  });

  it('Home/End vão para os EXTREMOS EFETIVOS (no contêiner de 1000px, não 0.14/0.5)', () => {
    const b = splitBounds(PX_CONTAINER, S);
    assert.equal(nextRatioForKey('Home', 0.5, PX_CONTAINER, OPTS), b.min);
    assert.equal(nextRatioForKey('End', 0.5, PX_CONTAINER, OPTS), b.max);
    assert.ok(b.min > S.minRatio, 'o Home anunciado é o piso EFETIVO, não o cru');
    assert.equal(b.max, S.maxRatio);
  });

  it('PageUp/PageDown usam o passo grosso (0.1) — respeitando o teto do shell (0.5)', () => {
    assert.equal(nextRatioForKey('PageUp', 0.45, RATIO_CONTAINER, OPTS), 0.35);
    // 0.45 + 0.1 passaria do TETO DO SHELL (0.5) — cai na fronteira, não em 0.55.
    assert.equal(nextRatioForKey('PageDown', 0.45, RATIO_CONTAINER, OPTS), S.maxRatio);
    assert.equal(nextRatioForKey('PageDown', 0.3, RATIO_CONTAINER, OPTS), 0.4);
  });

  it('teclas não tratadas devolvem null (o componente não chama preventDefault)', () => {
    for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a', 'F2', '', 'ArrowRightX']) {
      assert.equal(nextRatioForKey(key, 0.3, RATIO_CONTAINER, OPTS), null, `tratou "${key}"`);
    }
  });

  it('martelar as setas encosta na fronteira efetiva e PARA (nunca escapa)', () => {
    const b = splitBounds(PX_CONTAINER, S);
    let ratio = 0.5;
    for (let i = 0; i < 80; i += 1) {
      ratio = nextRatioForKey('ArrowLeft', ratio, PX_CONTAINER, OPTS) as number;
      assert.ok(ratio >= b.min, `passou do piso na iteração ${i}`);
    }
    assert.equal(ratio, b.min);
    for (let i = 0; i < 80; i += 1) {
      ratio = nextRatioForKey('ArrowRight', ratio, PX_CONTAINER, OPTS) as number;
      assert.ok(ratio <= b.max, `passou do teto na iteração ${i}`);
    }
    assert.equal(ratio, b.max);
  });

  it('janela mínima (min == max): TODA tecla tratada devolve a MESMA razão 0.5', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']) {
      assert.equal(nextRatioForKey(key, 0.5, COLLISION_CONTAINER, OPTS), 0.5, `key=${key}`);
    }
    // E sem caminho de colapso: nunca 0, nunca 1.
    assert.notEqual(nextRatioForKey('Home', 0.5, COLLISION_CONTAINER, OPTS), 0);
    assert.notEqual(nextRatioForKey('End', 0.5, COLLISION_CONTAINER, OPTS), 1);
  });

  it('janela inviável (365px): teclas tratadas caem no meio degradação (0.5)', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      assert.equal(nextRatioForKey(key, 0.2, INFEASIBLE_CONTAINER, OPTS), 0.5, `key=${key}`);
    }
  });

  it('arraste simulado: ponteiro fora do contêiner nasce nas fronteiras, não em 0/1', () => {
    const b = splitBounds(PX_CONTAINER, S);
    // clientX muito antes da origem e muito depois do fim.
    assert.equal(ratioFromPointer(-5000, 0, PX_CONTAINER, S), b.min);
    assert.equal(ratioFromPointer(15000, 0, PX_CONTAINER, S), b.max);
    // Ponteiro no meio do contêiner real (origem 104 = largura do rail).
    assert.equal(ratioFromPointer(104 + PX_CONTAINER / 2, 104, PX_CONTAINER, S), 0.5);
    // Coordenada não-finita não vira NaN.
    assert.ok(Number.isFinite(ratioFromPointer(Number.NaN, 104, PX_CONTAINER, S)));
  });
});

/* ── BLOCO 4 — ARIA com as constantes do shell ───────────────────────────── */

describe('shell splitAriaValues: fronteiras EFETIVAS no role="separator"', () => {
  it('no contêiner de 1000px anuncia 18/50 (piso em px), NÃO as cruas 14/50', () => {
    const a = splitAriaValues(0.3, PX_CONTAINER, 'vertical', S);
    assert.equal(a.valueNow, 30);
    assert.equal(a.valueMin, Math.round((180 / 994) * 100));
    assert.equal(a.valueMin, 18);
    assert.equal(a.valueMax, 50);
    assert.notEqual(a.valueMin, Math.round(S.minRatio * 100), 'não pode anunciar a fronteira CRUA');
  });

  it('no contêiner de 2000px as fronteiras cruas voltam a valer (14/50)', () => {
    const a = splitAriaValues(0.3, RATIO_CONTAINER, 'vertical', S);
    assert.equal(a.valueMin, 14);
    assert.equal(a.valueMax, 50);
  });

  it('na janela de colisão min == max == now == 50 (uma única posição possível)', () => {
    const a = splitAriaValues(0.3, COLLISION_CONTAINER, 'vertical', S);
    assert.equal(a.valueMin, 50);
    assert.equal(a.valueMax, 50);
    assert.equal(a.valueNow, 50);
  });

  it('valueMin <= valueNow <= valueMax em toda a varredura (constantes do shell)', () => {
    let checked = 0;
    for (let container = 1; container <= 3000; container += 23) {
      for (let ratio = -0.3; ratio <= 1.3; ratio += 0.17) {
        const a = splitAriaValues(ratio, container, 'vertical', S);
        assert.ok(
          a.valueMin <= a.valueNow && a.valueNow <= a.valueMax,
          `${a.valueMin} <= ${a.valueNow} <= ${a.valueMax} falhou em ${container}px, ratio=${ratio}`,
        );
        assert.ok(Number.isInteger(a.valueNow) && Number.isInteger(a.valueMin) && Number.isInteger(a.valueMax));
        checked += 1;
      }
    }
    assert.ok(checked > 700, `varredura fraca (${checked})`);
  });

  it('os ids do shell são válidos e não colidem entre si', () => {
    assert.notEqual(SHELL_SIDEBAR_PANE_ID, SHELL_SPLIT_DIVIDER_ID);
    for (const id of [SHELL_SIDEBAR_PANE_ID, SHELL_SPLIT_DIVIDER_ID]) {
      assert.match(id, /^[a-z][\w-]*$/);
    }
  });
});

/* ── BLOCO 5 — persistência do shell, bordas finas ───────────────────────── */

describe('shell persistência: fronteiras, lixo fino e isolamento', () => {
  it('valores EXATAMENTE nas fronteiras de razão do shell sobrevivem', () => {
    for (const good of [S.minRatio, 0.15, 0.2, 0.49, S.maxRatio]) {
      const ls = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: stored(good) });
      assert.equal(readShellSplitRatio(ls), good, `rejeitou ${good}`);
    }
  });

  it('fora da faixa (por 0.001 que seja) cai no default — sem clamp sorrateiro', () => {
    for (const bad of [0.1399999, 0.5000001, 0, 1]) {
      const ls = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: stored(bad) });
      assert.equal(readShellSplitRatio(ls), DEFAULT_SHELL_SPLIT_RATIO, `aceitou ${bad}`);
    }
  });

  it('payload do Desafio gravado NA CHAVE do shell: versão serve, razão julgada pelas fronteiras do shell', () => {
    // 0.7 é razão LEGÍTIMA do Desafio (0.2..0.8) mas fora da faixa do shell.
    const ls = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: stored(0.7) });
    assert.equal(readShellSplitRatio(ls), DEFAULT_SHELL_SPLIT_RATIO);
    // 0.3 é válido nos dois — prova que a validação é de chave, não de acaso.
    const ok = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: stored(0.3) });
    assert.equal(readShellSplitRatio(ok), 0.3);
  });

  it('Infinity/NaN serializam como null no JSON e caem no default sem lançar', () => {
    for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      const ls = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: stored(bad) });
      let value = -1;
      assert.doesNotThrow(() => {
        value = readShellSplitRatio(ls);
      }, `lançou em ${bad}`);
      assert.equal(value, DEFAULT_SHELL_SPLIT_RATIO);
    }
  });

  it('chaves extras no payload são TOLERADAS (o leitor só lê version/ratio)', () => {
    for (const tolerant of ['{"version":1,"ratio":0.3,"hacked":true}', '{"ratio":0.3,"version":1}']) {
      const ls = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: tolerant });
      assert.equal(readShellSplitRatio(ls), 0.3, `rejeitou ${tolerant}`);
    }
  });

  it('lixo que IMITA o payload (tipo errado, versão errada, cauda estranha) cai no default', () => {
    const mimics = [
      '{"version":1,"ratio":"0.3"}',
      '{"version":"1","ratio":0.3}',
      '{"version":1,"ratio":0.3 } extra',
      '{"version":0,"ratio":0.3}',
      '{"version":true,"ratio":0.3}',
    ];
    for (const raw of mimics) {
      const ls = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: raw });
      assert.equal(readShellSplitRatio(ls), DEFAULT_SHELL_SPLIT_RATIO, `aceitou ${raw}`);
    }
  });

  it('writeShellSplitRatio grava o payload versionado e arredonda a deriva de float', () => {
    const ls = makeStorage();
    writeShellSplitRatio(0.45 - 0.02, ls); // 0.43000000000000005
    assert.deepEqual(JSON.parse(ls.map.get(SHELL_SPLIT_RATIO_STORAGE_KEY) as string), {
      version: SPLIT_RATIO_STORAGE_VERSION,
      ratio: 0.43,
    });
    assert.equal(readShellSplitRatio(ls), 0.43);
  });

  it('writeShellSplitRatio NÃO grava não-finito e preserva o valor bom anterior', () => {
    const ls = makeStorage();
    writeShellSplitRatio(0.33, ls);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      writeShellSplitRatio(bad, ls);
      assert.equal(readShellSplitRatio(ls), 0.33, `${bad} corrompeu o guardado`);
    }
  });

  it('storage que explode / storage nula: leitura e escrita nunca lançam', () => {
    const boom = makeThrowingStorage();
    assert.equal(readShellSplitRatio(boom), DEFAULT_SHELL_SPLIT_RATIO);
    assert.doesNotThrow(() => writeShellSplitRatio(0.3, boom));
    assert.doesNotThrow(() => clearShellSplitRatio(boom));
    assert.equal(readShellSplitRatio(null), DEFAULT_SHELL_SPLIT_RATIO);
    assert.doesNotThrow(() => writeShellSplitRatio(0.3, null));
    assert.doesNotThrow(() => clearShellSplitRatio(null));
  });

  it('round-trip completo pelo globalThis.localStorage (o caminho real do App)', () => {
    const previous = (globalThis as { localStorage?: unknown }).localStorage;
    try {
      const ls = makeStorage();
      (globalThis as { localStorage?: unknown }).localStorage = ls;
      assert.equal(readShellSplitRatio(), DEFAULT_SHELL_SPLIT_RATIO);
      writeShellSplitRatio(0.27);
      assert.equal(readShellSplitRatio(), 0.27);
      assert.ok((ls.map.get(SHELL_SPLIT_RATIO_STORAGE_KEY) as string).includes('"ratio":0.27'));
      clearShellSplitRatio();
      assert.equal(readShellSplitRatio(), DEFAULT_SHELL_SPLIT_RATIO);
    } finally {
      if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage?: unknown }).localStorage = previous;
    }
  });
});

/* ── BLOCO 6 — fluxos integrados (as funções de produção, na ordem do App) ── */

describe('shell fluxos integrados: arraste e teclado persistem a RAZÃO', () => {
  /** Contêiner realista: janela 1280 − rail 104. */
  const WINDOW_CONTAINER = 1176;

  it('arraste: ponteiro → razão → persistência → boot seguinte lê o MESMO valor', () => {
    const ls = makeStorage();
    // O App congela a origem no pointerdown (rect.left=104, rect.width=1176) e
    // segue o clientX. Usuário arrasta até o meio da janela redistribuível.
    const dragged = ratioFromPointer(104 + 500, 104, WINDOW_CONTAINER, S);
    assert.ok(Number.isFinite(dragged) && dragged > S.minRatio && dragged < S.maxRatio);
    writeShellSplitRatio(dragged, ls);
    assert.equal(readShellSplitRatio(ls), roundSplitRatio(dragged));
  });

  it('arraste até a borda da janela: persiste a FRONTEIRA, nunca uma razão impossível', () => {
    const ls = makeStorage();
    const b = splitBounds(WINDOW_CONTAINER, S);
    const dragged = ratioFromPointer(-9999, 104, WINDOW_CONTAINER, S);
    writeShellSplitRatio(dragged, ls);
    assert.equal(readShellSplitRatio(ls), roundSplitRatio(b.min));
    assert.ok(b.min > 0, 'sem caminho de colapso: a fronteira mínima nunca é 0');
  });

  it('teclado: Home → persiste o piso efetivo; End → persiste o teto efetivo', () => {
    const ls = makeStorage();
    const b = splitBounds(WINDOW_CONTAINER, S);
    writeShellSplitRatio(nextRatioForKey('Home', 0.3, WINDOW_CONTAINER, { constraints: S }) as number, ls);
    assert.equal(readShellSplitRatio(ls), roundSplitRatio(b.min));
    writeShellSplitRatio(nextRatioForKey('End', 0.3, WINDOW_CONTAINER, { constraints: S }) as number, ls);
    assert.equal(readShellSplitRatio(ls), roundSplitRatio(b.max));
  });

  it('teclado: caminho completo de setas entre fronteiras, tudo persistível', () => {
    const ls = makeStorage();
    const b = splitBounds(WINDOW_CONTAINER, S);
    let ratio = nextRatioForKey('Home', 0.3, WINDOW_CONTAINER, { constraints: S }) as number;
    let steps = 0;
    while (ratio < b.max && steps < 200) {
      const next = nextRatioForKey('ArrowRight', ratio, WINDOW_CONTAINER, { constraints: S });
      assert.notEqual(next, null, 'ArrowRight é tratado até o teto');
      ratio = next as number;
      writeShellSplitRatio(ratio, ls);
      assert.equal(readShellSplitRatio(ls), roundSplitRatio(ratio), `passo ${steps}`);
      steps += 1;
    }
    assert.equal(ratio, b.max);
    assert.ok(steps > 10, `percurso curto demais (${steps}) — o passo não move`);
  });

  it('pipeline do render: razão persistida → ratioToPx respeita os pisos (FQ7)', () => {
    const ls = makeStorage({ [SHELL_SPLIT_RATIO_STORAGE_KEY]: stored(0.5) });
    const ratio = readShellSplitRatio(ls);
    for (const container of [500, 800, 1176, 1500, 2500]) {
      const b = splitBounds(container, S);
      if (!b.feasible) continue;
      const px = ratioToPx(ratio, container, S);
      assert.ok(px.primaryPx >= S.minPanePx, `sidebar ${px.primaryPx}px em ${container}px`);
      assert.ok(px.secondaryPx >= S.minPanePx, `main ${px.secondaryPx}px em ${container}px`);
    }
    // E a razão persistida NUNCA é px: o payload é {version, ratio}.
    const raw = JSON.parse(ls.map.get(SHELL_SPLIT_RATIO_STORAGE_KEY) as string) as Record<string, unknown>;
    assert.deepEqual(Object.keys(raw).sort(), ['ratio', 'version']);
  });
});
