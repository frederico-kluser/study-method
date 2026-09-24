/**
 * tests/cx-views-theme-design.test.ts — GOLDEN MASTER de `src/theme.ts`
 * (helpers puros) e `src/lib/designTokens.ts` para as ondas de refatoração.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO É
 * ══════════════════════════════════════════════════════════════════════════
 * Caracterização: fixa o contrato OBSERVÁVEL dos helpers de movimento
 * (`spatialTransition`/`effectsTransition`), do anel de foco
 * (`focusRingStyles`/`FOCUS_RING`), da superfície de modal
 * (`modalSurfaceStyles`) e das FUNÇÕES + CONSTANTES de designTokens. É a rede
 * de segurança da refatoração: mover, renomear ou recompor pode; mudar a saída
 * observada aqui, não.
 *
 * Os helpers de movimento são medidos com um `MotionTheme` de mentira que
 * REGISTRA o que lhe foi pedido — a pergunta é "o que sai daqui pede ao tema",
 * não "como o MUI formata uma string de transição" (a segunda é da biblioteca
 * e mudaria com um upgrade sem quebrar produto nenhum). Um teste final ancora
 * no `theme` real para garantir que o pedido resolve de verdade.
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-theme-design.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  effectsTransition,
  focusRingStyles,
  FOCUS_RING,
  modalSurfaceStyles,
  spatialTransition,
  theme,
  type MotionSpeed,
  type MotionTheme,
  type SpatialProperty,
} from '../src/theme';
import {
  ACCENT_DARK,
  ACCENT_LIGHT,
  CELEBRATION,
  contrastRatio,
  CONTRAST_FLOOR,
  DIVIDER_DARK,
  DIVIDER_LIGHT,
  FONT_STACK,
  INK_DARK,
  INK_LIGHT,
  isRedFlashColor,
  MOTION,
  NONTEXT_DARK,
  NONTEXT_LIGHT,
  READING_SURFACE_LEVELS,
  redFlashRatio,
  relativeLuminance,
  SCRIM,
  SHAPE,
  SPATIAL_ALLOWED_PROPERTIES,
  SPATIAL_FORBIDDEN_PROPERTIES,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPE,
} from '../src/lib/designTokens';

/* ─── Temas de mentira que REGISTRAM o pedido ─────────────────────────────── */

interface ChamadaTransicao {
  props: string[];
  options: { duration?: number | string; easing?: string; delay?: number | string } | undefined;
}

function fakeMotionTheme(): { theme: MotionTheme; chamadas: ChamadaTransicao[] } {
  const chamadas: ChamadaTransicao[] = [];
  const theme: MotionTheme = {
    transitions: {
      create: (props, options) => {
        chamadas.push({ props: Array.isArray(props) ? props : [props], options });
        return `TRANSICAO(${chamadas.length})`;
      },
      easing: { spatial: MOTION.spatial.easing, effects: MOTION.effects.easing },
      duration: {
        spatialFast: MOTION.spatial.fast,
        spatialNormal: MOTION.spatial.normal,
        spatialSlow: MOTION.spatial.slow,
        effectsFast: MOTION.effects.fast,
        effectsNormal: MOTION.effects.normal,
        effectsSlow: MOTION.effects.slow,
      },
    },
  };
  return { theme, chamadas };
}

/** Fatia de tema que o anel de foco e a superfície de modal consomem. */
function fakeVarsTheme(): {
  vars: { palette: { nonText: { focus: string }; text: { primary: string }; surface: { level1: string; level4: string } } };
  aplicados: Array<{ mode: string; style: unknown }>;
  applyStyles: (mode: string, style: unknown) => Record<string, unknown>;
} {
  const aplicados: Array<{ mode: string; style: unknown }> = [];
  const t = {
    vars: {
      palette: {
        nonText: { focus: 'var(--non-text-focus)' },
        text: { primary: 'var(--text-primary)' },
        surface: { level1: 'var(--surface-1)', level4: 'var(--surface-4)' },
      },
    },
    aplicados,
    applyStyles: (mode: string, style: unknown): Record<string, unknown> => {
      aplicados.push({ mode, style });
      return { [`@media (prefers-color-scheme: ${mode})`]: style };
    },
  };
  return t;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. MOVIMENTO — a separação por propriedade é a regra 2 do contrato
 * ══════════════════════════════════════════════════════════════════════════ */

describe('spatialTransition — a ÚNICA porta do easing com overshoot', () => {
  it('pede ao tema as propriedades com o easing SPATIAL e a duração do degrau', () => {
    const { theme: t, chamadas } = fakeMotionTheme();
    assert.equal(spatialTransition(t, ['transform', 'flex-basis'], 'fast'), 'TRANSICAO(1)');
    assert.deepEqual(chamadas[0], {
      props: ['transform', 'flex-basis'],
      options: { easing: MOTION.spatial.easing, duration: MOTION.spatial.fast },
    });
  });

  it('os três degraus mapeiam para as durações espaciais (default = normal)', () => {
    const esperado: Record<MotionSpeed, number> = {
      fast: MOTION.spatial.fast,
      normal: MOTION.spatial.normal,
      slow: MOTION.spatial.slow,
    };
    for (const speed of ['fast', 'normal', 'slow'] as const) {
      const { theme: t, chamadas } = fakeMotionTheme();
      spatialTransition(t, ['height'], speed);
      assert.equal(chamadas[0].options?.duration, esperado[speed], `degrau ${speed}`);
    }
    const { theme: t, chamadas } = fakeMotionTheme();
    spatialTransition(t, ['height']);
    assert.equal(chamadas[0].options?.duration, MOTION.spatial.normal, 'sem argumento = normal');
  });

  it('REPROVA em runtime toda propriedade proibida (overshoot em texto cintila)', () => {
    for (const prop of SPATIAL_FORBIDDEN_PROPERTIES) {
      const { theme: t, chamadas } = fakeMotionTheme();
      assert.throws(
        () => spatialTransition(t, [prop as SpatialProperty]),
        /não pode animar/,
        `spatial em "${prop}" deveria lançar`,
      );
      assert.equal(chamadas.length, 0, 'nada é pedido ao tema quando a regra reprova');
    }
  });

  it('só propriedade do contrato passa: toda SpatialProperty está em SPATIAL_ALLOWED_PROPERTIES', () => {
    // O tipo de compilação é a primeira trava; esta varredura é a segunda,
    // para o consumo a partir de JavaScript (o `as` e o módulo em JS puro).
    for (const prop of SPATIAL_ALLOWED_PROPERTIES) {
      const { theme: t } = fakeMotionTheme();
      assert.equal(typeof spatialTransition(t, [prop as SpatialProperty]), 'string');
    }
  });
});

describe('effectsTransition — cor/opacidade, sem overshoot', () => {
  it('pede ao tema com o easing EFFECTS e a duração do degrau (aceita QUALQUER propriedade)', () => {
    const { theme: t, chamadas } = fakeMotionTheme();
    effectsTransition(t, ['color', 'box-shadow'], 'slow');
    assert.deepEqual(chamadas[0], {
      props: ['color', 'box-shadow'],
      options: { easing: MOTION.effects.easing, duration: MOTION.effects.slow },
    });
  });

  it('os três degraus mapeiam para as durações de efeito (default = normal)', () => {
    const esperado: Record<MotionSpeed, number> = {
      fast: MOTION.effects.fast,
      normal: MOTION.effects.normal,
      slow: MOTION.effects.slow,
    };
    for (const speed of ['fast', 'normal', 'slow'] as const) {
      const { theme: t, chamadas } = fakeMotionTheme();
      effectsTransition(t, ['opacity'], speed);
      assert.equal(chamadas[0].options?.duration, esperado[speed], `degrau ${speed}`);
    }
    const { theme: t, chamadas } = fakeMotionTheme();
    effectsTransition(t, ['opacity']);
    assert.equal(chamadas[0].options?.duration, MOTION.effects.normal);
  });

  it('com o theme REAL os dois pedidos resolvem (a porta existe de verdade)', () => {
    const espacial = spatialTransition(theme, ['transform']);
    const efeito = effectsTransition(theme, ['color']);
    assert.ok(espacial.includes(MOTION.spatial.easing), `resolve com o easing spatial: "${espacial}"`);
    assert.ok(efeito.includes(MOTION.effects.easing), `resolve com o easing effects: "${efeito}"`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. FOCO E SUPERFÍCIE DE MODAL
 * ══════════════════════════════════════════════════════════════════════════ */

describe('FOCUS_RING / focusRingStyles — o anel de duas cores (SC 1.4.11)', () => {
  it('as medidas do anel são 3 de traço + 2 de folga + 2 de halo', () => {
    assert.deepEqual({ ...FOCUS_RING }, { width: 3, offset: 2, haloWidth: 2 });
  });

  it('o estilo sai pronto: outline na cor de foco, offset e halo de tinta na folga', () => {
    const t = fakeVarsTheme();
    const estilo = focusRingStyles(t as never);
    assert.equal(estilo.outline, '3px solid var(--non-text-focus)');
    assert.equal(estilo.outlineOffset, 2);
    assert.equal(estilo.boxShadow, '0 0 0 2px var(--text-primary)', 'o halo preenche exatamente a folga');
  });
});

describe('modalSurfaceStyles — o papel de um modal (claro ≠ escuro)', () => {
  it('o cartão base é o nível 1 (leitura) e o galho ESCURO sobe para o nível 4', () => {
    const t = fakeVarsTheme();
    const estilo = modalSurfaceStyles(t as never);
    assert.equal(estilo['backgroundColor'], 'var(--surface-1)', 'claro: o modal é superfície de leitura');
    assert.deepEqual(t.aplicados, [
      { mode: 'dark', style: { backgroundColor: 'var(--surface-4)' } },
    ]);
    const chaveDark = Object.keys(estilo).find((k) => k !== 'backgroundColor');
    assert.equal(chaveDark, '@media (prefers-color-scheme: dark)');
    assert.deepEqual(estilo[chaveDark!], { backgroundColor: 'var(--surface-4)' });
  });

  it('o galho de esquema vem SEMPRE por último (é a ordem que faz o escuro vencer)', () => {
    const t = fakeVarsTheme();
    const chaves = Object.keys(modalSurfaceStyles(t as never));
    assert.deepEqual(chaves, ['backgroundColor', '@media (prefers-color-scheme: dark)']);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. MATEMÁTICA DE COR — red flash (SC 2.3.1) e contraste (SC 1.4.3/1.4.6)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('redFlashRatio / isRedFlashColor (WCAG 2.2 SC 2.3.1, Nota 3)', () => {
  it('a razão é R/(R+G+B) — o vermelho Nintendo mede 0,927 e fica de fora', () => {
    assert.ok(Math.abs(redFlashRatio('#e60012') - 230 / 248) < 1e-12);
    assert.equal(redFlashRatio('#000000'), 0, 'preto puro: soma zero → razão zero');
    assert.ok(Math.abs(redFlashRatio('#ffffff') - 1 / 3) < 1e-12);
  });

  it('aceita hex com ou sem # e em qualquer caixa (o parser só pula o #)', () => {
    assert.equal(redFlashRatio('#BE3B27'), redFlashRatio('be3b27'));
  });

  it('o limiar é INCLUSIVO em 0,8 — exatamente no teto já reprova', () => {
    assert.ok(Math.abs(redFlashRatio('#080101') - 0.8) < 1e-12, '8/(8+1+1) = 0,8 exato');
    assert.equal(isRedFlashColor('#080101'), true);
    assert.equal(isRedFlashColor('#070101'), false, '7/9 = 0,778 — abaixo do teto passa');
    assert.equal(isRedFlashColor('#e60012'), true);
  });

  // ─── BUG K (CORRIGIDO) — testemunha de regressão permanente ─────────────────
  // HISTÓRIA DO BUG (o caso substituído era uma caracterização MAL CLASSIFICADA
  // como "entrada malformada, não-bug"): `redFlashRatio` fatiava a hex como se
  // fosse SEMPRE `#rrggbb` e não validava o formato. Na grafia CSS curta
  // (`#f00`) os slices casavam dígito avulso, `parseInt` devolvia NaN e o NaN
  // vazava: `NaN >= 0.8` é `false`, logo `isRedFlashColor('#f00')` = false
  // enquanto `isRedFlashColor('#ff0000')` = true para a MESMA cor. Uma guarda de
  // acessibilidade (SC 2.3.1) que falha ABERTO — cor red-flash aprovada para
  // piscar — é bug nomeado, não caso-limite. CORRIGIDO: as duas grafias CSS
  // válidas (`#rgb` e `#rrggbb`) são aceitas e a MESMA cor tem o MESMO veredito
  // nas duas; entrada FORA do contrato lança erro claro (mesmo contrato de
  // rejeição do `hexToRgb` de `codeTheme.ts`) — nunca NaN. O limiar continua
  // CELEBRATION.redFlashRatioThreshold = 0,8 INCLUSIVO, provado nos casos
  // anteriores deste describe, que ficaram intactos.
  it('BUG K: "#f00" e "#ff0000" são a MESMA cor e dão o MESMO veredito', () => {
    assert.equal(redFlashRatio('#f00'), redFlashRatio('#ff0000'), 'as duas grafias medem diferente');
    assert.equal(redFlashRatio('#f00'), 1, 'vermelho puro: 255/(255+0+0) = 1 nas duas grafias');
    assert.equal(isRedFlashColor('#f00'), isRedFlashColor('#ff0000'), 'as duas grafias julgam diferente');
    assert.equal(isRedFlashColor('#f00'), true, 'vermelho puro DISPARA red flash — nas DUAS grafias');
    assert.equal(isRedFlashColor('#fff'), isRedFlashColor('#ffffff'));
    assert.equal(isRedFlashColor('#fff'), false);
    assert.equal(redFlashRatio('#000'), redFlashRatio('#000000'), 'preto curto ≠ preto longo');
    assert.equal(redFlashRatio('#000'), 0, 'preto puro: soma zero → razão zero');
  });

  it('BUG K: #rgb expande cada dígito para o par — cor a cor, #rgb ≡ #rrggbb', () => {
    // Um par por canal: se a expansão dobrar errado UM dígito, este caso cai.
    // Os MESMOS 8 pares varrem as TRÊS medições do parser comum — redFlashRatio,
    // relativeLuminance e contrastRatio (com par de referência branco, cujo
    // argumento também troca de grafia) — mais o veredito isRedFlashColor.
    const ref: readonly [string, string] = ['#fff', '#ffffff'];
    for (const [curta, longa] of [
      ['#000', '#000000'],
      ['#123', '#112233'],
      ['#811', '#881111'],
      ['#abc', '#aabbcc'],
      ['#f00', '#ff0000'],
      ['#0f0', '#00ff00'],
      ['#00f', '#0000ff'],
      ['#fff', '#ffffff'],
    ] as const) {
      assert.equal(redFlashRatio(curta), redFlashRatio(longa), `redFlashRatio: ${curta} ≢ ${longa}`);
      assert.equal(isRedFlashColor(curta), isRedFlashColor(longa), `isRedFlashColor: ${curta} ≢ ${longa}`);
      assert.equal(relativeLuminance(curta), relativeLuminance(longa), `relativeLuminance: ${curta} ≢ ${longa}`);
      assert.equal(
        contrastRatio(curta, ref[0]),
        contrastRatio(longa, ref[1]),
        `contrastRatio: ${curta}×${ref[0]} ≢ ${longa}×${ref[1]}`,
      );
      assert.equal(
        contrastRatio(curta, ref[1]),
        contrastRatio(longa, ref[0]),
        `contrastRatio (referência cruzada): ${curta} ≢ ${longa}`,
      );
    }
  });

  it('BUG K: o teto 0,8 INCLUSIVO vale na grafia CURTA — "#811" = "#881111" = 0,8 exato', () => {
    // 136/(136+17+17) = 136/170 = 0,8 EXATO (Object.is), e exatamente no teto
    // já reprova (>=). O caso do limiar pinava só a forma longa '#080101';
    // aqui a grafia curta fica pinada junto.
    assert.ok(Object.is(redFlashRatio('#811'), 0.8), 'redFlashRatio("#811") devia ser 0,8 EXATO');
    assert.ok(Object.is(redFlashRatio('#881111'), 0.8), 'redFlashRatio("#881111") devia ser 0,8 EXATO');
    assert.equal(isRedFlashColor('#811'), true, 'exatamente no teto reprova — na grafia CURTA');
    assert.equal(isRedFlashColor('#881111'), true, 'exatamente no teto reprova — na grafia LONGA');
  });

  it('BUG K: nenhuma grafia válida deixa NaN vazar (qualquer caixa, com ou sem #)', () => {
    for (const hex of ['#f00', '#F00', 'f00', '#abc', '#e60012', '#E60012', 'be3b27', '#000']) {
      assert.equal(Number.isNaN(redFlashRatio(hex)), false, `redFlashRatio("${hex}") devolveu NaN`);
    }
  });

  it('BUG K: entrada FORA do contrato lança erro claro (contrato do hexToRgb) — nunca NaN nem false', () => {
    for (const invalida of ['#12345', '#1234567', '#ff000080', '##ff0000', '#ggg', '#ff 000', 'rgb(255,0,0)', '']) {
      assert.throws(
        () => redFlashRatio(invalida),
        /hex inválida/,
        `redFlashRatio("${invalida}") devia rejeitar com erro claro`,
      );
    }
    // o veredito de red flash rejeita JUNTO: engolir o erro e virar `false` seria
    // voltar a falhar ABERTO (entrada malformada aprovada para piscar).
    assert.throws(() => isRedFlashColor('#12345'), /hex inválida/);
  });

  it('BUG K/L: "#f008" (#rgba, 4 dígitos com alfa) é FORA do contrato — rejeitada nas QUATRO funções', () => {
    // Rejeição dedicada: o parser comum só promete `#rgb` e `#rrggbb`; alfa não
    // mede R/(R+G+B), e aceitar 4 dígitos calado reabriria a porta do NaN.
    assert.throws(() => redFlashRatio('#f008'), /hex inválida/, 'redFlashRatio("#f008")');
    assert.throws(() => isRedFlashColor('#f008'), /hex inválida/, 'isRedFlashColor("#f008")');
    assert.throws(() => relativeLuminance('#f008'), /hex inválida/, 'relativeLuminance("#f008")');
    assert.throws(() => contrastRatio('#f008', '#fff'), /hex inválida/, 'contrastRatio("#f008", …)');
    assert.throws(() => contrastRatio('#fff', '#f008'), /hex inválida/, 'contrastRatio(…, "#f008")');
  });
});

describe('relativeLuminance / contrastRatio (fórmula normativa do WCAG 2.x)', () => {
  it('extremos: branco = 1, preto = 0 (canais lineares normalizados)', () => {
    assert.equal(relativeLuminance('#ffffff'), 1);
    assert.equal(relativeLuminance('#000000'), 0);
  });

  it('um canal puro pesa pelo coeficiente da fórmula (R = 0,2126 no topo)', () => {
    assert.ok(Math.abs(relativeLuminance('#ff0000') - 0.2126) < 1e-12);
    assert.ok(Math.abs(relativeLuminance('#00ff00') - 0.7152) < 1e-12);
    assert.ok(Math.abs(relativeLuminance('#0000ff') - 0.0722) < 1e-12);
  });

  it('razão é SIMÉTRICA e clampa no par máximo 21:1 (branco × preto)', () => {
    assert.ok(Math.abs(contrastRatio('#ffffff', '#000000') - 21) < 1e-9);
    assert.equal(contrastRatio('#be3b27', '#f3eee5'), contrastRatio('#f3eee5', '#be3b27'));
    assert.equal(contrastRatio('#123456', '#123456'), 1, 'mesma cor = 1:1');
  });

  it('os pisos normativos são os do contrato (AA 4,5 / AAA 7 / large 3 / não-texto 3)', () => {
    assert.deepEqual({ ...CONTRAST_FLOOR }, { bodyAA: 4.5, bodyAAA: 7, largeAA: 3, nonText: 3 });
    assert.equal(CELEBRATION.redFlashRatioThreshold, 0.8, 'o teto de red flash mora em CELEBRATION');
  });

  // ─── BUG L (CORRIGIDO) — padrão irmão do BUG K, fechado ─────────────────────
  // HISTÓRIA DO BUG: `relativeLuminance`/`contrastRatio` mantinham o MESMO
  // parsing naïve que o BUG K pegou em `redFlashRatio` (slice de 2 dígitos sem
  // validar o formato). Na grafia CSS curta (`#f00`) os slices casavam dígito
  // avulso, `parseInt` devolvia NaN e a MEDIÇÃO WCAG inteira virava NaN —
  // falha silenciosa numa fórmula normativa. CORRIGIDO na causa: as três
  // funções passam pelo MESMO parser comum (`#rgb` ≡ `#rrggbb`, `#` opcional,
  // caixa livre, trim) e entrada fora do contrato lança erro claro — nunca
  // NaN. Os pins deste describe (extremos, coeficientes, simetria, pisos)
  // ficaram intactos.
  it('BUG L: "#f00" ≡ "#ff0000" também na LUMINÂNCIA — mesma cor, mesma medição', () => {
    assert.equal(relativeLuminance('#f00'), relativeLuminance('#ff0000'), 'as duas grafias medem diferente');
    assert.ok(Math.abs(relativeLuminance('#f00') - 0.2126) < 1e-12, 'vermelho puro = coeficiente R, nas duas grafias');
    assert.equal(relativeLuminance('#fff'), relativeLuminance('#ffffff'), 'branco curto ≠ branco longo');
    assert.equal(relativeLuminance('#fff'), 1, 'branco curto = 1, como #ffffff');
    assert.equal(relativeLuminance('#000'), relativeLuminance('#000000'), 'preto curto ≠ preto longo');
    assert.equal(relativeLuminance('#000'), 0, 'preto curto = 0, como #000000');
  });

  it('BUG L: contrastRatio mede igual nas duas grafias — par máximo e simetria preservados', () => {
    assert.equal(contrastRatio('#fff', '#000'), contrastRatio('#ffffff', '#000000'), 'branco×preto diverge por grafia');
    assert.ok(Math.abs(contrastRatio('#fff', '#000') - 21) < 1e-9, 'branco×preto nas grafias curtas = par máximo');
    assert.equal(contrastRatio('#fff', '#ffffff'), 1, 'a MESMA cor escrita nas duas grafias é 1:1');
    assert.equal(contrastRatio('#f00', '#fff'), contrastRatio('#ff0000', '#ffffff'));
    // simetria A×B == B×A vale em grafia curta, longa e MISTA
    assert.equal(contrastRatio('#f00', '#000'), contrastRatio('#000', '#f00'));
    assert.equal(contrastRatio('#f00', '#000000'), contrastRatio('#000000', '#ff0000'), 'simetria em grafia mista');
  });

  it('BUG L: fora do contrato lança erro claro nas TRÊS medições — nunca NaN', () => {
    for (const invalida of ['#12345', '#ggg', 'rgb(0,0,0)', '']) {
      assert.throws(() => relativeLuminance(invalida), /hex inválida/, `relativeLuminance("${invalida}")`);
      assert.throws(() => contrastRatio(invalida, '#ffffff'), /hex inválida/, `contrastRatio("${invalida}", …)`);
      assert.throws(() => contrastRatio('#ffffff', invalida), /hex inválida/, `contrastRatio(…, "${invalida}")`);
      // as três medições recusam JUNTO — é o mesmo parser comum
      assert.throws(() => redFlashRatio(invalida), /hex inválida/, `redFlashRatio("${invalida}")`);
    }
    for (const valida of ['#f00', '#e60012', '#fff']) {
      assert.equal(Number.isNaN(relativeLuminance(valida)), false, `relativeLuminance("${valida}")`);
      assert.equal(Number.isNaN(contrastRatio(valida, '#fff')), false, `contrastRatio("${valida}", …)`);
      assert.equal(Number.isNaN(redFlashRatio(valida)), false, `redFlashRatio("${valida}")`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. OS TOKENS, VALOR A VALOR (o contrato congelado do "Cartucho")
 * ══════════════════════════════════════════════════════════════════════════ */

describe('rampas, tinta e camada não-texto — os hex EXATOS do contrato', () => {
  it('SURFACE_LIGHT / SURFACE_DARK (5 níveis cada)', () => {
    assert.deepEqual({ ...SURFACE_LIGHT }, {
      level0: '#faf7f2', level1: '#ffffff', level2: '#f3eee5', level3: '#e9e2d6', level4: '#ddd5c6',
    });
    assert.deepEqual({ ...SURFACE_DARK }, {
      level0: '#0e0e0e', level1: '#1b1b1b', level2: '#272727', level3: '#313131', level4: '#3b3b3b',
    });
  });

  it('a rampa escura é NEUTRA (R = G = B nos cinco níveis — elevação só por luminância)', () => {
    for (const [nivel, hex] of Object.entries(SURFACE_DARK)) {
      const h = hex.slice(1);
      const [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
      assert.equal(r, g, `${nivel} (${hex})`);
      assert.equal(g, b, `${nivel} (${hex})`);
    }
  });

  it('INK (primária e secundária nos dois esquemas) e NONTEXT (neutral/action/focus)', () => {
    assert.deepEqual({ ...INK_LIGHT }, { primary: '#191713', secondary: '#544e45' });
    assert.deepEqual({ ...INK_DARK }, { primary: '#f0f0f0', secondary: '#adadad' });
    assert.deepEqual({ ...NONTEXT_LIGHT }, { neutral: '#978e7f', action: '#dd6b5a', focus: '#109acb' });
    assert.deepEqual({ ...NONTEXT_DARK }, { neutral: '#7a7a7a', action: '#c9432c', focus: '#0c7196' });
  });

  it('os divisores decorativos ficam ABAIXO de 3:1 de propósito', () => {
    assert.equal(DIVIDER_LIGHT, '#ddd5c6');
    assert.equal(DIVIDER_DARK, '#4d4d4d');
    assert.ok(contrastRatio(DIVIDER_LIGHT, SURFACE_LIGHT.level0) < CONTRAST_FLOOR.nonText);
    assert.ok(contrastRatio(DIVIDER_DARK, SURFACE_DARK.level0) < CONTRAST_FLOOR.nonText);
  });

  it('READING_SURFACE_LEVELS são os níveis 0 e 1 (os únicos onde a tinta alcança 7:1)', () => {
    assert.deepEqual([...READING_SURFACE_LEVELS], [0, 1]);
  });
});

describe('acentos — as seis famílias, com os papéis texto/preenchimento/onFill', () => {
  it('ACCENT_LIGHT, família a família', () => {
    assert.deepEqual({ ...ACCENT_LIGHT }, {
      action: { text: '#be3b27', fill: '#cf402a', onFill: '#ffffff' },
      success: { text: '#1d7b4c', fill: '#1f8653', onFill: '#ffffff' },
      info: { text: '#0d759b', fill: '#0e7ea7', onFill: '#ffffff' },
      warn: { text: '#966106', fill: '#a46a07', onFill: '#ffffff' },
      study: { text: '#9146d3', fill: '#9a54d7', onFill: '#ffffff' },
      error: { text: '#cd2462', fill: '#db306f', onFill: '#ffffff' },
    });
  });

  it('ACCENT_DARK, família a família (onFill é o nível 0 neutro)', () => {
    assert.deepEqual({ ...ACCENT_DARK }, {
      action: { text: '#eb614c', fill: '#d9513c', onFill: '#0e0e0e' },
      success: { text: '#26a163', fill: '#218f58', onFill: '#0e0e0e' },
      info: { text: '#1698c7', fill: '#1489b3', onFill: '#0e0e0e' },
      warn: { text: '#c37f0a', fill: '#ae7209', onFill: '#0e0e0e' },
      study: { text: '#b171e8', fill: '#a45be4', onFill: '#0e0e0e' },
      error: { text: '#e55f90', fill: '#e03e79', onFill: '#0e0e0e' },
    });
  });

  it('as mesmas seis famílias existem nos DOIS esquemas (o mapa é fechado)', () => {
    const familias = ['action', 'success', 'info', 'warn', 'study', 'error'];
    assert.deepEqual(Object.keys(ACCENT_LIGHT).sort(), [...familias].sort());
    assert.deepEqual(Object.keys(ACCENT_DARK).sort(), [...familias].sort());
    for (const f of familias as Array<keyof typeof ACCENT_LIGHT>) {
      for (const papel of ['text', 'fill', 'onFill'] as const) {
        assert.match(ACCENT_LIGHT[f][papel], /^#[0-9a-f]{6}$/i, `light.${f}.${papel}`);
        assert.match(ACCENT_DARK[f][papel], /^#[0-9a-f]{6}$/i, `dark.${f}.${papel}`);
      }
    }
  });
});

describe('scrim, movimento, forma, tipografia e celebração', () => {
  it('SCRIM é preto ACROMÁTICO a 55% (escurecer não pode tingir)', () => {
    assert.deepEqual({ ...SCRIM }, { color: '#000000', opacityPercent: 55 });
  });

  it('MOTION: dois níveis com easings distintos (spatial com overshoot, effects sem)', () => {
    assert.deepEqual({ ...MOTION }, {
      spatial: { easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fast: 105, normal: 150, slow: 230 },
      effects: { easing: 'cubic-bezier(0.2, 0, 0, 1)', fast: 100, normal: 160, slow: 240 },
    });
  });

  it('nenhuma propriedade é ao mesmo tempo permitida e proibida ao spatial', () => {
    for (const p of SPATIAL_ALLOWED_PROPERTIES) {
      assert.equal((SPATIAL_FORBIDDEN_PROPERTIES as readonly string[]).includes(p), false, `${p} nas duas listas`);
    }
  });

  it('SHAPE / TYPE / CELEBRATION / FONT_STACK', () => {
    assert.deepEqual({ ...SHAPE }, { sm: 8, md: 14, lg: 20, pill: 999, base: 14 });
    assert.deepEqual({ ...TYPE }, {
      bodySize: 16,
      proseLineHeight: 1.6,
      proseParagraphGap: '2.25em',
      measureCh: 72,
      measureMaxCh: 80,
      codeSize: 14,
      codeLineHeight: 1.5,
      largeTextBoldPx: 18.67,
      largeTextRegularPx: 24,
    });
    assert.deepEqual({ ...CELEBRATION }, {
      maxDurationMs: 4000,
      maxOpposingTransitionsPerSecond: 3,
      maxFlashAreaPx2: 21824,
      redFlashRatioThreshold: 0.8,
    });
    // Três papéis de fonte — e o papel `accent` NÃO existe mais (nada de porta
    // aberta para fonte retro voltar sem ninguém notar).
    assert.deepEqual(Object.keys(FONT_STACK).sort(), ['body', 'display', 'mono']);
    assert.match(FONT_STACK.display, /Nunito/);
    assert.match(FONT_STACK.mono, /JetBrains Mono/);
    assert.match(FONT_STACK.body, /Inter/);
  });
});

describe('o theme REAL continua consumindo os MESMOS tokens', () => {
  it('easing e durações do tema = MOTION; raio base = SHAPE.base', () => {
    assert.equal(theme.transitions.easing.spatial, MOTION.spatial.easing);
    assert.equal(theme.transitions.easing.effects, MOTION.effects.easing);
    assert.equal(theme.transitions.duration.spatialFast, MOTION.spatial.fast);
    assert.equal(theme.transitions.duration.spatialNormal, MOTION.spatial.normal);
    assert.equal(theme.transitions.duration.spatialSlow, MOTION.spatial.slow);
    assert.equal(theme.transitions.duration.effectsFast, MOTION.effects.fast);
    assert.equal(theme.transitions.duration.effectsNormal, MOTION.effects.normal);
    assert.equal(theme.transitions.duration.effectsSlow, MOTION.effects.slow);
    assert.equal(theme.shape.borderRadius, SHAPE.base);
  });
});
