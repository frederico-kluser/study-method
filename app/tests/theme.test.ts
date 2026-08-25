/**
 * tests/theme.test.ts — contrato do tema MUI v9 "Cartucho" (redesign de UX).
 *
 * O que este arquivo prova, e por quê:
 *
 * 1. CONTRASTE MEDIDO, não conferido de olho. Toda razão sai de `contrastRatio`
 *    de `src/lib/designTokens.ts` — a MESMA função normativa que o contrato usa
 *    ((L1+0.05)/(L2+0.05), glossário do WCAG 2.2), comparada com `>=` cru porque
 *    o Understanding do SC 1.4.3 é explícito que 4.499:1 NÃO passa em 4,5:1.
 *    Reimplementar a fórmula aqui seria abrir espaço para as duas versões
 *    divergirem; o teste consome a normativa.
 *
 *    Pisos assertados:
 *      - tinta (primary e secondary) sobre os níveis 0 e 1: >= 7:1 (AAA, SC 1.4.6)
 *        — esses são os níveis de LEITURA (prosa longa e código);
 *      - a mesma tinta sobre os níveis 2, 3 e 4 (chrome): >= 4,5:1 (AA, SC 1.4.3);
 *      - acento como TEXTO sobre os níveis 0, 1 E 2: >= 4,5:1 — a fronteira do
 *        contrato é "acento-como-texto vale até o nível 2; no chrome (3–4) o
 *        texto é TINTA". Calibrar só contra o nível 0 (como estava) deixava
 *        passar um <Link> dentro de <Paper>, que já existe na LessonView;
 *      - `onFill` sobre `fill` (botão preenchido): >= 4,5:1;
 *      - camada não-texto sobre os níveis onde ela é usada: >= 3:1 (SC 1.4.11).
 *
 *    O par acento-texto/acento-preenchimento é o coração do redesign: usar o
 *    valor de PREENCHIMENTO como cor de link é o erro clássico que reprova AA, e
 *    o teste mede os dois papéis separadamente para que a regressão apareça.
 *
 * 2. MOVIMENTO SEPARADO POR PROPRIEDADE. `spatial` ultrapassa o valor final
 *    (overshoot) e por isso só pode animar transform/geometria. O teste percorre
 *    TODO estilo que o tema produz, acha cada declaração `transition` e assere
 *    que nenhuma propriedade proibida está casada com o easing spatial. É a
 *    diferença entre "tátil" e "texto cintilando".
 *
 * 3. ESCALA TIPOGRÁFICA MONOTÔNICA. `typography.fontSize: 16` re-baseia o rem do
 *    MUI e infla +14,29% toda variante SEM tamanho próprio. Com só h1–h4
 *    pinadas, h5 saía maior que h4 e a hierarquia ficava invertida no app
 *    rodando. O teste assere ORDEM, não só valor: h1 > h2 > h3 > h4 > h5 > h6
 *    estrito, body1 >= body2, e nenhum título abaixo do corpo.
 *
 * 4. MECÂNICA DO MUI v9 que é condição de funcionamento, não estilo:
 *    `colorSchemeSelector: 'class'` (com `'media'` o `setMode()` do toggle não
 *    faz nada) e a ausência de `palette.mode ===` no fonte do tema (sob
 *    `cssVariables` o ternário de esquema resolve UMA vez e nunca reage ao
 *    toggle — bug permanente de galho errado, não flicker).
 *
 * Sem jsdom: `createTheme` é puro.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  theme,
  spatialTransition,
  effectsTransition,
  focusRingStyles,
  FOCUS_RING,
  type SpatialProperty,
} from '../src/theme';
import {
  ACCENT_DARK,
  ACCENT_LIGHT,
  CONTRAST_FLOOR,
  DIVIDER_DARK,
  DIVIDER_LIGHT,
  FONT_STACK,
  INK_DARK,
  INK_LIGHT,
  MOTION,
  NONTEXT_DARK,
  NONTEXT_LIGHT,
  READING_SURFACE_LEVELS,
  SHAPE,
  SPATIAL_ALLOWED_PROPERTIES,
  SPATIAL_FORBIDDEN_PROPERTIES,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPE,
  contrastRatio,
  type AccentFamily,
  type AccentPair,
} from '../src/lib/designTokens';

/* ─── Andaime ──────────────────────────────────────────────────────────────── */

type SchemeName = 'light' | 'dark';

/** As cinco chaves da rampa tonal, na ordem dos níveis 0..4. */
const SURFACE_LEVELS = ['level0', 'level1', 'level2', 'level3', 'level4'] as const;
type SurfaceLevel = (typeof SURFACE_LEVELS)[number];

/** As SEIS famílias de acento do contrato. */
const ACCENT_FAMILIES: readonly AccentFamily[] = [
  'action',
  'success',
  'info',
  'warn',
  'study',
  'error',
];

/**
 * Os slots de paleta do MUI que cada família ocupa. `error` tem família PRÓPRIA
 * (carmim) — enquanto ela dividia o vermelho de `action`, `error.main` era
 * byte-idêntico a `primary.main` e o botão "Apagar" ficava indistinguível do
 * CTA. `secondary` recebe a família de estudo: o contrato não define uma família
 * "secondary", e a de estudo é o segundo acento de fato do app.
 */
const FAMILY_TO_SLOT: Readonly<Record<AccentFamily, readonly string[]>> = {
  action: ['primary'],
  success: ['success'],
  info: ['info'],
  warn: ['warning'],
  study: ['study', 'secondary'],
  error: ['error'],
};

/** Os níveis de superfície em que o acento PODE ser texto (0, 1 e 2). */
const ACCENT_TEXT_LEVELS = [0, 1, 2] as const;

const TOKENS_BY_SCHEME = {
  light: {
    surface: SURFACE_LIGHT,
    ink: INK_LIGHT,
    accents: ACCENT_LIGHT,
    nonText: NONTEXT_LIGHT,
    divider: DIVIDER_LIGHT,
  },
  dark: {
    surface: SURFACE_DARK,
    ink: INK_DARK,
    accents: ACCENT_DARK,
    nonText: NONTEXT_DARK,
    divider: DIVIDER_DARK,
  },
} as const;

const SCHEMES: readonly SchemeName[] = ['light', 'dark'];

/** Palette do esquema pedido — falha alto se o esquema não existir. */
function paletteOf(scheme: SchemeName) {
  const p = theme.colorSchemes[scheme]?.palette;
  assert.ok(p, `colorSchemes.${scheme}.palette deve existir`);
  return p;
}

/** Um slot de acento do palette, com os cinco valores que o tema promete. */
function accentSlot(scheme: SchemeName, slot: string) {
  const palette = paletteOf(scheme) as unknown as Record<
    string,
    { main: string; contrastText: string; accentText: string; fill: string; onFill: string }
  >;
  const color = palette[slot];
  assert.ok(color, `palette.${slot} deve existir no scheme ${scheme}`);
  return color;
}

/** Assere um piso de contraste com mensagem que mostra a conta. */
function assertContrast(label: string, fg: string, bg: string, floor: number): void {
  const ratio = contrastRatio(fg, bg);
  assert.ok(
    ratio >= floor,
    `${label}: ${fg} sobre ${bg} = ${ratio.toFixed(3)}:1 (exigido >= ${floor}:1)`,
  );
}

/**
 * Remove comentários preservando literais de string/template. As invariantes
 * estáticas abaixo falam do CÓDIGO do tema; o cabeçalho de `src/theme.ts`
 * DOCUMENTA os antipadrões (`palette.mode ===`, o easing spatial cru) para que a
 * próxima pessoa saiba por que eles não podem aparecer — e um `grep` ingênuo
 * confundiria a documentação com a infração.
 */
function stripComments(source: string): string {
  type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let mode: Mode = 'code';
  let out = '';
  let i = 0;
  while (i < source.length) {
    const char = source[i]!;
    const next = source[i + 1];
    if (mode === 'code') {
      if (char === '/' && next === '/') {
        mode = 'line';
        i += 2;
        continue;
      }
      if (char === '/' && next === '*') {
        mode = 'block';
        i += 2;
        continue;
      }
      if (char === "'") mode = 'single';
      else if (char === '"') mode = 'double';
      else if (char === '`') mode = 'template';
      out += char;
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (char === '\n') {
        mode = 'code';
        out += char;
      }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') {
        mode = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (char === '\\') {
      out += char + (next ?? '');
      i += 2;
      continue;
    }
    if (
      (mode === 'single' && char === "'") ||
      (mode === 'double' && char === '"') ||
      (mode === 'template' && char === '`')
    ) {
      mode = 'code';
    }
    out += char;
    i += 1;
  }
  return out;
}

/** Fonte do tema, para as invariantes estáticas. */
const THEME_SOURCE = readFileSync(join(__dirname, '..', 'src', 'theme.ts'), 'utf8');

/** O mesmo fonte SEM comentários — é sobre ele que as invariantes falam. */
const THEME_CODE = stripComments(THEME_SOURCE);

/* ═══════════════════════════════════════════════════════════════════════════
 * PALETA — os dois esquemas e todos os slots novos
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('theme "Cartucho" — paleta dos dois esquemas', () => {
  it('habilita colorSchemes.light e colorSchemes.dark', () => {
    assert.ok(theme.colorSchemes.light != null, 'colorSchemes.light deve existir');
    assert.ok(theme.colorSchemes.dark != null, 'colorSchemes.dark deve existir');
  });

  it('usa colorSchemeSelector "class" (com "media" o setMode do toggle não faz nada)', () => {
    assert.equal(theme.colorSchemeSelector, 'class');
  });

  it('gera CSS theme variables (theme.vars presente — mecanismo v6+/v9)', () => {
    assert.ok(theme.vars != null, 'theme.vars deve existir (cssVariables ligado)');
    assert.ok(theme.vars.palette.surface.level3.startsWith('var(--mui-palette-surface-level3'));
    assert.ok(theme.vars.palette.nonText.focus.startsWith('var(--mui-palette-nonText-focus'));
    assert.ok(theme.vars.palette.study.accentText.startsWith('var(--mui-palette-study-accentText'));
  });

  for (const scheme of SCHEMES) {
    const tokens = TOKENS_BY_SCHEME[scheme];

    it(`${scheme}: background.default é o nível 0 e background.paper é o nível 1`, () => {
      const p = paletteOf(scheme);
      assert.equal(p.background.default, tokens.surface.level0);
      assert.equal(p.background.paper, tokens.surface.level1);
    });

    it(`${scheme}: text.primary/text.secondary são a tinta do esquema`, () => {
      const p = paletteOf(scheme);
      assert.equal(p.text.primary, tokens.ink.primary);
      assert.equal(p.text.secondary, tokens.ink.secondary);
    });

    it(`${scheme}: expõe a rampa tonal COMPLETA (níveis 0–4) em palette.surface`, () => {
      const p = paletteOf(scheme);
      for (const level of SURFACE_LEVELS) {
        assert.equal(
          p.surface[level],
          tokens.surface[level],
          `palette.surface.${level} deve vir de designTokens`,
        );
      }
    });

    it(`${scheme}: expõe a camada não-texto em palette.nonText`, () => {
      const p = paletteOf(scheme);
      assert.equal(p.nonText.neutral, tokens.nonText.neutral);
      assert.equal(p.nonText.action, tokens.nonText.action);
      assert.equal(p.nonText.focus, tokens.nonText.focus);
    });

    it(`${scheme}: divider é o divisor DECORATIVO (não a camada de 3:1)`, () => {
      assert.equal(paletteOf(scheme).divider, tokens.divider);
      // A distinção existe de propósito: divisor decorativo é isento por
      // "Incidental"; borda de campo de formulário NÃO é, e usa nonText.neutral.
      assert.notEqual(paletteOf(scheme).divider, tokens.nonText.neutral);
    });

    it(`${scheme}: cada família expõe os DOIS papéis (accentText e fill/onFill)`, () => {
      for (const family of ACCENT_FAMILIES) {
        const pair: AccentPair = tokens.accents[family];
        for (const slot of FAMILY_TO_SLOT[family]) {
          const color = accentSlot(scheme, slot);
          assert.equal(color.accentText, pair.text, `${slot}.accentText (família ${family})`);
          assert.equal(color.fill, pair.fill, `${slot}.fill (família ${family})`);
          assert.equal(color.onFill, pair.onFill, `${slot}.onFill (família ${family})`);
          // `main`/`contrastText` são os nomes que o MUI nativo consome; precisam
          // apontar para o PREENCHIMENTO, nunca para o valor de texto.
          assert.equal(color.main, pair.fill, `${slot}.main deve ser o fill`);
          assert.equal(color.contrastText, pair.onFill, `${slot}.contrastText deve ser o onFill`);
        }
      }
    });
  }

  it('a família study entra como slot de paleta customizado nos DOIS esquemas', () => {
    for (const scheme of SCHEMES) {
      const study = accentSlot(scheme, 'study');
      assert.match(study.main, /^#[0-9a-f]{6}$/i);
      assert.match(study.accentText, /^#[0-9a-f]{6}$/i);
      assert.match(study.onFill, /^#[0-9a-f]{6}$/i);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * CONTRASTE — medido, par a par, nos dois esquemas
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('theme "Cartucho" — contraste WCAG 2.2 medido', () => {
  for (const scheme of SCHEMES) {
    it(`${scheme}: tinta x superfície — AAA (>=7:1) nos níveis de leitura, AA (>=4,5:1) no chrome`, () => {
      const p = paletteOf(scheme);
      const inks: Array<[string, string]> = [
        ['text.primary', p.text.primary],
        ['text.secondary', p.text.secondary],
      ];
      for (const [inkLabel, ink] of inks) {
        for (const [index, level] of SURFACE_LEVELS.entries()) {
          const isReadingSurface = (READING_SURFACE_LEVELS as readonly number[]).includes(index);
          const floor = isReadingSurface ? CONTRAST_FLOOR.bodyAAA : CONTRAST_FLOOR.bodyAA;
          assertContrast(
            `${scheme} ${inkLabel} sobre surface.${level}${isReadingSurface ? ' (leitura)' : ' (chrome)'}`,
            ink,
            p.surface[level],
            floor,
          );
        }
      }
    });

    it(`${scheme}: acento como TEXTO alcança AA (>=4,5:1) nos níveis 0, 1 E 2`, () => {
      // A fronteira do contrato: acento-como-texto vale no fundo do app (0), no
      // cartão de leitura (1) e no painel afundado (2). `<Link>` dentro de
      // `<Paper>` é caso REAL nesta base (LessonView, lista de fontes), então
      // medir só contra o nível 0 deixava passar violação de AA. Do nível 3 em
      // diante (chrome: rail, dock, selecionado) o texto é TINTA — por isso 3 e
      // 4 NÃO entram aqui.
      const p = paletteOf(scheme);
      for (const family of ACCENT_FAMILIES) {
        for (const slot of FAMILY_TO_SLOT[family]) {
          const color = accentSlot(scheme, slot);
          for (const index of ACCENT_TEXT_LEVELS) {
            const level = SURFACE_LEVELS[index] as SurfaceLevel;
            assertContrast(
              `${scheme} palette.${slot}.accentText sobre surface.${level}`,
              color.accentText,
              p.surface[level],
              CONTRAST_FLOOR.bodyAA,
            );
          }
        }
      }
    });

    it(`${scheme}: error NÃO é primary — famílias distintas em main, fill e accentText`, () => {
      // Regressão concreta: enquanto `error` era mapeado para `accents.action`,
      // `error.main === primary.main` byte a byte, e o "Apagar" de
      // editor.confirmDelete / challenge.confirmDelete ficava com a mesma cor do
      // CTA "Testar resposta". Semântica de cor que não distingue nada.
      const error = accentSlot(scheme, 'error');
      const primary = accentSlot(scheme, 'primary');
      assert.notEqual(error.main, primary.main, `${scheme}: error.main não pode ser primary.main`);
      assert.notEqual(error.fill, primary.fill, `${scheme}: error.fill não pode ser primary.fill`);
      assert.notEqual(
        error.accentText,
        primary.accentText,
        `${scheme}: error.accentText não pode ser primary.accentText`,
      );
    });

    it(`${scheme}: botão preenchido — onFill sobre fill alcança AA (>=4,5:1)`, () => {
      for (const family of ACCENT_FAMILIES) {
        for (const slot of FAMILY_TO_SLOT[family]) {
          const color = accentSlot(scheme, slot);
          assertContrast(
            `${scheme} palette.${slot}.onFill sobre palette.${slot}.fill`,
            color.onFill,
            color.fill,
            CONTRAST_FLOOR.bodyAA,
          );
          // E o par nativo do MUI (contrastText sobre main) tem que dar o mesmo
          // resultado — é ele que o <Button variant="contained"> consome.
          assertContrast(
            `${scheme} palette.${slot}.contrastText sobre palette.${slot}.main`,
            color.contrastText,
            color.main,
            CONTRAST_FLOOR.bodyAA,
          );
        }
      }
    });

    it(`${scheme}: camada não-texto alcança >=3:1 nas superfícies onde é usada (0 e 1)`, () => {
      const p = paletteOf(scheme);
      for (const role of ['neutral', 'action', 'focus'] as const) {
        for (const index of READING_SURFACE_LEVELS) {
          const level = SURFACE_LEVELS[index] as SurfaceLevel;
          assertContrast(
            `${scheme} nonText.${role} sobre surface.${level}`,
            p.nonText[role],
            p.surface[level],
            CONTRAST_FLOOR.nonText,
          );
        }
      }
    });

    it(`${scheme}: o halo do anel de foco mantém o indicador >=3:1 em TODOS os níveis`, () => {
      // `nonText.focus` sozinho cai abaixo de 3:1 nos níveis 3–4 (o chrome, onde
      // mora a maior parte dos alvos focáveis). O anel é de DUAS cores: o halo de
      // tinta preenche a folga do outline e alcança o piso em qualquer nível.
      const p = paletteOf(scheme);
      for (const level of SURFACE_LEVELS) {
        assertContrast(
          `${scheme} halo (text.primary) sobre surface.${level}`,
          p.text.primary,
          p.surface[level],
          CONTRAST_FLOOR.nonText,
        );
      }
      assertContrast(
        `${scheme} halo (text.primary) contra o traço (nonText.focus)`,
        p.text.primary,
        p.nonText.focus,
        CONTRAST_FLOOR.nonText,
      );
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
 * MOVIMENTO — dois níveis, separados, e a regra de propriedade
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Divide por vírgula IGNORANDO as que estão dentro de parênteses (cubic-bezier). */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Coleta toda string `transition` produzida por um objeto de estilo aninhado. */
function collectTransitions(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectTransitions(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if ((key === 'transition' || key === 'transitionProperty') && typeof value === 'string') {
      out.push(value);
    } else {
      collectTransitions(value, out);
    }
  }
  return out;
}

/** Renderiza TODO estilo que os `components` do tema produzem, com o tema real. */
function renderAllComponentStyles(): unknown[] {
  const components = theme.components as unknown as Record<
    string,
    {
      styleOverrides?: Record<string, unknown> | ((t: unknown) => unknown);
    }
  >;
  const rendered: unknown[] = [];
  const call = (fn: unknown, arg: unknown): unknown =>
    typeof fn === 'function' ? (fn as (a: unknown) => unknown)(arg) : fn;

  for (const spec of Object.values(components ?? {})) {
    const overrides = spec?.styleOverrides;
    if (overrides == null) continue;
    // MuiCssBaseline é a exceção: o callback recebe o TEMA direto.
    if (typeof overrides === 'function') {
      rendered.push(call(overrides, theme));
      continue;
    }
    for (const slot of Object.values(overrides)) {
      const resolved = call(slot, { theme });
      rendered.push(resolved);
      const variants = (resolved as { variants?: Array<{ style?: unknown }> })?.variants;
      if (Array.isArray(variants)) {
        for (const variant of variants) rendered.push(call(variant.style, { theme }));
      }
    }
  }
  return rendered;
}

describe('theme "Cartucho" — movimento em dois níveis', () => {
  it('expõe os easings spatial e effects, SEPARADOS e vindos de MOTION', () => {
    assert.equal(theme.transitions.easing.spatial, MOTION.spatial.easing);
    assert.equal(theme.transitions.easing.effects, MOTION.effects.easing);
    assert.notEqual(
      theme.transitions.easing.spatial,
      theme.transitions.easing.effects,
      'os dois níveis precisam ser curvas DIFERENTES (spatial ultrapassa, effects não)',
    );
  });

  it('expõe as seis durações e elas batem com MOTION', () => {
    assert.equal(theme.transitions.duration.spatialFast, MOTION.spatial.fast);
    assert.equal(theme.transitions.duration.spatialNormal, MOTION.spatial.normal);
    assert.equal(theme.transitions.duration.spatialSlow, MOTION.spatial.slow);
    assert.equal(theme.transitions.duration.effectsFast, MOTION.effects.fast);
    assert.equal(theme.transitions.duration.effectsNormal, MOTION.effects.normal);
    assert.equal(theme.transitions.duration.effectsSlow, MOTION.effects.slow);
  });

  it('não substitui os tokens de transição default do MUI (são ACRÉSCIMOS)', () => {
    assert.equal(typeof theme.transitions.easing.easeInOut, 'string');
    assert.equal(typeof theme.transitions.duration.standard, 'number');
  });

  it('theme.transitions.create monta a transição com os nomes novos', () => {
    const css = theme.transitions.create('transform', {
      easing: theme.transitions.easing.spatial,
      duration: theme.transitions.duration.spatialNormal,
    });
    assert.ok(css.includes(MOTION.spatial.easing), css);
    assert.ok(css.includes(`${MOTION.spatial.normal}ms`), css);
  });

  it('spatialTransition aceita TODA propriedade permitida e usa o easing spatial', () => {
    for (const property of SPATIAL_ALLOWED_PROPERTIES) {
      const css = spatialTransition(theme, [property], 'fast');
      assert.ok(css.startsWith(property), `${property}: ${css}`);
      assert.ok(css.includes(MOTION.spatial.easing), css);
      assert.ok(css.includes(`${MOTION.spatial.fast}ms`), css);
    }
  });

  it('spatialTransition RECUSA toda propriedade proibida (a regra tem trava de runtime)', () => {
    for (const property of SPATIAL_FORBIDDEN_PROPERTIES) {
      assert.throws(
        () => spatialTransition(theme, [property as unknown as SpatialProperty]),
        /spatial não pode animar/,
        `${property} deveria ser recusada pelo nível spatial`,
      );
    }
  });

  it('effectsTransition usa o easing criticamente amortecido nos três degraus', () => {
    const speeds = [
      ['fast', MOTION.effects.fast],
      ['normal', MOTION.effects.normal],
      ['slow', MOTION.effects.slow],
    ] as const;
    for (const [speed, ms] of speeds) {
      const css = effectsTransition(theme, ['background-color'], speed);
      assert.ok(css.includes(MOTION.effects.easing), css);
      assert.ok(css.includes(`${ms}ms`), css);
    }
  });

  it('NENHUM estilo do tema casa o easing spatial com propriedade proibida', () => {
    const transitions = renderAllComponentStyles().flatMap((style) => collectTransitions(style));
    assert.ok(transitions.length > 0, 'o tema deveria produzir ao menos uma transição');
    const forbidden = new Set<string>(SPATIAL_FORBIDDEN_PROPERTIES);
    for (const declaration of transitions) {
      for (const entry of splitTopLevel(declaration)) {
        if (!entry.includes(MOTION.spatial.easing)) continue;
        const property = entry.split(/\s+/)[0] ?? '';
        assert.ok(
          !forbidden.has(property),
          `easing spatial aplicado a "${property}" — o overshoot faz cor/opacidade cintilar: ${entry}`,
        );
        assert.ok(
          (SPATIAL_ALLOWED_PROPERTIES as readonly string[]).includes(property),
          `easing spatial aplicado a "${property}", que não está em SPATIAL_ALLOWED_PROPERTIES: ${entry}`,
        );
      }
    }
  });

  it('toda referência ao easing spatial no fonte do tema passa pelo helper', () => {
    // Uma única ocorrência = a que vive dentro de spatialTransition(). Se
    // aparecer outra, alguém está montando transição espacial à mão e escapando
    // da trava de tipo.
    const occurrences = THEME_CODE.split('transitions.easing.spatial').length - 1;
    assert.equal(
      occurrences,
      1,
      'easing spatial deve ser referenciado só dentro de spatialTransition()',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * FORMA E TIPOGRAFIA
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Escala tipográfica: andaime ──────────────────────────────────────────── */

/** Os SEIS níveis de título, do maior para o menor. */
const HEADING_VARIANTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/** As variantes que são TEXTO (não título) — stack de corpo. */
const BODY_VARIANTS = [
  'subtitle1',
  'subtitle2',
  'body1',
  'body2',
  'button',
  'caption',
  'overline',
] as const;

/** Toda variante de texto que o tema define. */
const TEXT_VARIANTS = [...HEADING_VARIANTS, ...BODY_VARIANTS] as const;
type TextVariant = (typeof TEXT_VARIANTS)[number];

/**
 * Tamanho em PX de uma variante. Falha alto se o valor não for um número: uma
 * variante sem tamanho próprio herda o coeficiente de rem do MUI
 * (`typography.fontSize / 14`), que aqui vale 1,142857 — e foi exatamente assim
 * que h5 (27,43px) passou na frente de h4 (25px).
 */
function variantSize(variant: TextVariant): number {
  const style = theme.typography[variant] as { fontSize?: unknown } | undefined;
  const size = style?.fontSize;
  assert.equal(
    typeof size,
    'number',
    `typography.${variant}.fontSize precisa ser um número de px EXPLÍCITO (veio ${String(size)}) — ` +
      'sem isso a variante fica à mercê do coeficiente de rem e a escala inverte',
  );
  return size as number;
}

describe('theme "Cartucho" — forma e tipografia', () => {
  it('shape.borderRadius vem de SHAPE.base', () => {
    assert.equal(theme.shape.borderRadius, SHAPE.base);
  });

  it('typography.fontSize vem de TYPE.bodySize', () => {
    assert.equal(theme.typography.fontSize, TYPE.bodySize);
  });

  it('typography.fontFamily é a stack de CORPO', () => {
    assert.equal(theme.typography.fontFamily, FONT_STACK.body);
  });

  it('TODA variante de texto tem tamanho em px explícito (nenhuma depende do rem)', () => {
    // A trava de origem do bug: `typography.fontSize: 16` infla em +14,29% toda
    // variante que não traz o próprio tamanho. Se uma variante nova entrar sem
    // `fontSize`, é aqui que ela é barrada, antes de virar escala invertida.
    for (const variant of TEXT_VARIANTS) {
      assert.ok(variantSize(variant) > 0, `typography.${variant}.fontSize deve ser positivo`);
    }
  });

  it('a escala de TÍTULOS é ESTRITAMENTE monotônica: h1 > h2 > h3 > h4 > h5 > h6', () => {
    // A regressão que este teste existe para pegar: h5 a 27,43px contra h4 a
    // 25px fazia um `variant="h5" component="h2"` renderizar MAIOR que o
    // `variant="h4" component="h1"` logo acima (LessonView.tsx:321 e :395).
    for (let i = 0; i < HEADING_VARIANTS.length - 1; i += 1) {
      const bigger = HEADING_VARIANTS[i]!;
      const smaller = HEADING_VARIANTS[i + 1]!;
      const a = variantSize(bigger);
      const b = variantSize(smaller);
      assert.ok(
        a > b,
        `${bigger} (${a}px) tem que ser ESTRITAMENTE maior que ${smaller} (${b}px) — ` +
          'a hierarquia visual não pode contradizer a hierarquia semântica',
      );
    }
  });

  it('body1 >= body2, e NENHUM título fica abaixo do corpo', () => {
    const body1 = variantSize('body1');
    const body2 = variantSize('body2');
    assert.ok(body1 >= body2, `body1 (${body1}px) não pode ser menor que body2 (${body2}px)`);
    for (const heading of HEADING_VARIANTS) {
      const size = variantSize(heading);
      assert.ok(
        size >= body1,
        `${heading} (${size}px) não pode ficar abaixo de body1 (${body1}px) — ` +
          'um título menor que o texto que ele encabeça não é título',
      );
    }
  });

  it('os tamanhos saem da escala modular de terça maior (1,25) sobre TYPE.bodySize', () => {
    // h1..h6 = passos +5..0. Nenhum número solto: a escala inteira é derivada do
    // único tamanho de corpo que o contrato fixa.
    const expected = HEADING_VARIANTS.map((_, index) =>
      Math.round(TYPE.bodySize * 1.25 ** (HEADING_VARIANTS.length - 1 - index)),
    );
    for (const [index, heading] of HEADING_VARIANTS.entries()) {
      assert.equal(variantSize(heading), expected[index], `${heading} fora da escala modular`);
    }
    // caption/overline ocupam o passo −1 da MESMA escala (12,8 -> 13).
    const step = Math.round(TYPE.bodySize / 1.25);
    assert.equal(variantSize('caption'), step, 'caption fora da escala modular');
    assert.equal(variantSize('overline'), step, 'overline fora da escala modular');
  });

  it('h1–h6 usam a stack de DISPLAY com peso 700/800 (a família não troca no meio)', () => {
    // A fronteira display/corpo é SEMÂNTICA: todo nível de título é display.
    // Antes, h5/h6 caíam no default do MUI (Inter 400/500) e a hierarquia
    // trocava de VOZ entre o H1 e o H2 da mesma tela.
    for (const heading of HEADING_VARIANTS) {
      const variant = theme.typography[heading];
      assert.equal(variant.fontFamily, FONT_STACK.display, `${heading}.fontFamily`);
      assert.ok(
        variant.fontWeight === 700 || variant.fontWeight === 800,
        `${heading}.fontWeight deve ser 700 ou 800, veio ${String(variant.fontWeight)}`,
      );
    }
  });

  it('as variantes de TEXTO (subtitle/body/button/caption/overline) usam a stack de CORPO', () => {
    for (const variant of BODY_VARIANTS) {
      const style = theme.typography[variant] as { fontFamily?: unknown };
      assert.equal(style.fontFamily, FONT_STACK.body, `${variant}.fontFamily`);
    }
  });

  it('a variante `code` usa a stack MONO em 14/1,5, com o tamanho em PX EXPLÍCITO', () => {
    assert.equal(theme.typography.code.fontFamily, FONT_STACK.mono);
    assert.equal(theme.typography.code.lineHeight, TYPE.codeLineHeight);
    // A UNIDADE é a invariante, não o número. `--mui-font-code` é montado por
    // @mui/system/cssVars/prepareTypographyVars.mjs concatenando `fontSize`
    // CRU no shorthand `font`; com o número 14 o var saía `14/1.5 '…'`, que é
    // <font-size> inválido, e `font: var(--mui-font-code)` em src/index.css
    // caía inteiro em silêncio (o editor voltava a Inter/16px/lh normal).
    assert.equal(
      theme.typography.code.fontSize,
      `${TYPE.codeSize}px`,
      'typography.code.fontSize precisa ser STRING COM UNIDADE: o shorthand ' +
        '`font` de --mui-font-code não aceita <font-size> sem unidade e a ' +
        'declaração `font: var(--mui-font-code)` cai inteira, sem erro nenhum',
    );
  });

  it('--mui-font-code sai como shorthand `font` VÁLIDO (com unidade no tamanho)', () => {
    // Reproduz o gerador do MUI (prepareTypographyVars) sobre a variante real e
    // exige que o <font-size> tenha unidade. É a trava de nível de VAR: se
    // alguém repinar `code.fontSize` num número, o shorthand volta a ser
    // inválido e este teste morde ANTES do e2e.
    const style = theme.typography.code as {
      fontSize?: unknown;
      lineHeight?: unknown;
      fontFamily?: unknown;
    };
    const fontVar = `${style.fontSize ?? ''}${style.lineHeight ? `/${style.lineHeight} ` : ''}${style.fontFamily ?? ''}`;
    assert.match(
      fontVar,
      /^\d+(?:\.\d+)?(?:px|rem|em|pt|%)\//,
      `--mui-font-code seria "${fontVar}" — o <font-size> tem que trazer unidade ` +
        '(unitless só é length válido para 0, e app/index.html é standards mode)',
    );
    assert.ok(
      fontVar.includes(FONT_STACK.mono),
      '--mui-font-code tem que terminar na stack MONO de FONT_STACK',
    );
  });

  it('body1 é a superfície de prosa: 16px na entrelinha de 1,6', () => {
    assert.equal(theme.typography.body1.fontSize, TYPE.bodySize);
    assert.equal(theme.typography.body1.lineHeight, TYPE.proseLineHeight);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * VARIANTES DE COMPONENTE — token de tema, não `sx` espalhado
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Lê `components.MuiX.styleOverrides.root.variants` na forma canônica. */
function rootVariants(component: string): Array<{
  props: Record<string, unknown>;
  style: unknown;
}> {
  const spec = (
    theme.components as unknown as Record<
      string,
      { styleOverrides?: { root?: { variants?: Array<{ props: Record<string, unknown>; style: unknown }> } } }
    >
  )[component];
  const variants = spec?.styleOverrides?.root?.variants;
  assert.ok(
    Array.isArray(variants),
    `${component}.styleOverrides.root.variants deve ser um array (forma canônica do MUI v9)`,
  );
  return variants;
}

/** Resolve o `style` de uma variante com o tema real. */
function styleOf(variant: { style: unknown }): Record<string, unknown> {
  const style =
    typeof variant.style === 'function'
      ? (variant.style as (a: unknown) => unknown)({ theme })
      : variant.style;
  assert.ok(style && typeof style === 'object', 'style da variante deve resolver para um objeto');
  return style as Record<string, unknown>;
}

describe('theme "Cartucho" — variantes registradas como token de tema', () => {
  it('MuiButton registra a variante `pop` na forma canônica root.variants', () => {
    const pop = rootVariants('MuiButton').find((v) => v.props.variant === 'pop');
    assert.ok(pop, 'MuiButton precisa da variante `pop`');
    const style = styleOf(pop);
    assert.equal(style.backgroundColor, theme.vars.palette.primary.fill);
    assert.equal(style.color, theme.vars.palette.primary.onFill);
    assert.equal(style.borderRadius, SHAPE.lg, 'raio generoso');
  });

  it('a variante `pop` responde ao :active com scale(0.97) em movimento SPATIAL', () => {
    const pop = rootVariants('MuiButton').find((v) => v.props.variant === 'pop');
    assert.ok(pop);
    const style = styleOf(pop);
    const active = style['&:active'] as Record<string, unknown> | undefined;
    assert.equal(active?.transform, 'scale(0.97)');
    const transition = String(style.transition);
    const spatialEntry = splitTopLevel(transition).find((e) =>
      e.includes(MOTION.spatial.easing),
    );
    assert.ok(spatialEntry, `a transição do pop precisa de uma entrada spatial: ${transition}`);
    assert.ok(spatialEntry.startsWith('transform'), spatialEntry);
    assert.ok(spatialEntry.includes(`${MOTION.spatial.fast}ms`), spatialEntry);
  });

  it('as variantes nativas text/outlined usam o valor de TEXTO, não o preenchimento', () => {
    // É a correção do erro clássico: `main` (preenchimento) como cor de rótulo
    // reprova AA sobre a superfície do app.
    const variants = rootVariants('MuiButton');
    for (const nativeVariant of ['text', 'outlined']) {
      const found = variants.find(
        (v) => v.props.variant === nativeVariant && v.props.color === 'primary',
      );
      assert.ok(found, `MuiButton precisa reapontar a variante ${nativeVariant}`);
      assert.equal(styleOf(found).color, theme.vars.palette.primary.accentText);
    }
  });

  it('MuiPaper registra variantes por NÍVEL da rampa tonal (2, 3 e 4)', () => {
    const expected: Array<[string, 'level2' | 'level3' | 'level4']> = [
      ['sunken', 'level2'],
      ['raised', 'level3'],
      ['selected', 'level4'],
    ];
    const variants = rootVariants('MuiPaper');
    for (const [name, level] of expected) {
      const found = variants.find((v) => v.props.variant === name);
      assert.ok(found, `MuiPaper precisa da variante \`${name}\``);
      assert.equal(styleOf(found).backgroundColor, theme.vars.palette.surface[level]);
    }
  });

  it('as variantes seguem a ordenação ÚLTIMA-VENCE (pop é a última do MuiButton)', () => {
    const variants = rootVariants('MuiButton');
    assert.equal(
      variants[variants.length - 1]?.props.variant,
      'pop',
      'a variante mais específica precisa ser a última do array',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ANEL DE FOCO
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('theme "Cartucho" — anel de foco', () => {
  it('é 3px de traço com 2px de folga, pintado com nonText.focus', () => {
    assert.equal(FOCUS_RING.width, 3);
    assert.equal(FOCUS_RING.offset, 2);
    assert.equal(FOCUS_RING.haloWidth, FOCUS_RING.offset, 'o halo preenche exatamente a folga');
    const ring = focusRingStyles(theme);
    assert.equal(ring.outline, `3px solid ${theme.vars.palette.nonText.focus}`);
    assert.equal(ring.outlineOffset, 2);
    assert.ok(ring.boxShadow.includes(theme.vars.palette.text.primary), ring.boxShadow);
  });

  it('é aplicado globalmente pelo CssBaseline e nos alvos clicáveis', () => {
    const baseline = (
      theme.components as unknown as {
        MuiCssBaseline?: { styleOverrides?: (t: unknown) => Record<string, unknown> };
      }
    ).MuiCssBaseline?.styleOverrides;
    assert.equal(typeof baseline, 'function', 'MuiCssBaseline precisa de styleOverrides');
    const globalStyles = baseline!(theme);
    const focus = globalStyles['*:focus-visible'] as Record<string, unknown> | undefined;
    assert.ok(focus, 'CssBaseline precisa pintar *:focus-visible');
    assert.equal(focus.outline, focusRingStyles(theme).outline);

    const buttonBase = (
      theme.components as unknown as {
        MuiButtonBase?: { styleOverrides?: { root?: (a: unknown) => Record<string, unknown> } };
      }
    ).MuiButtonBase?.styleOverrides?.root;
    assert.equal(typeof buttonBase, 'function');
    const rootStyle = buttonBase!({ theme });
    const buttonFocus = rootStyle['&:focus-visible'] as Record<string, unknown> | undefined;
    assert.ok(buttonFocus, 'ButtonBase precisa reafirmar o anel (o MUI zera o outline)');
    assert.equal(buttonFocus.outline, focusRingStyles(theme).outline);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * MECÂNICA DO MUI v9 — invariantes estáticas do fonte do tema
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('theme "Cartucho" — mecânica obrigatória do MUI v9', () => {
  it('src/theme.ts não contém NENHUM hex literal (tudo vem de designTokens)', () => {
    const hits = THEME_CODE.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    assert.deepEqual(hits, [], `hex literal no tema: ${hits.join(', ')}`);
  });

  it('src/theme.ts não usa `palette.mode ===` (sob cssVariables o ternário fixa o galho)', () => {
    assert.ok(
      !/palette\s*\.\s*mode\s*===/.test(THEME_CODE),
      'ternário de esquema resolve UMA vez e nunca reage ao toggle — use applyStyles/theme.vars',
    );
  });

  it('os dois esquemas expõem os slots customizados (regressão da fix17c)', () => {
    // Declarar um bloco `palette` no topo junto de `colorSchemes` derruba os
    // slots customizados do scheme LIGHT. Este teste é a rede desse buraco.
    for (const scheme of SCHEMES) {
      const p = paletteOf(scheme);
      assert.equal(typeof p.study.main, 'string');
      assert.equal(typeof p.surface.level4, 'string');
      assert.equal(typeof p.nonText.focus, 'string');
    }
  });

  it('mantém o modo declarado em cada esquema (light/dark), não um toggle por palette', () => {
    assert.equal(paletteOf('light').mode, 'light');
    assert.equal(paletteOf('dark').mode, 'dark');
  });

  it('pede ao MUI que respeite prefers-reduced-motion (SC 2.3.3)', () => {
    assert.equal(
      (theme as unknown as { motion?: { reducedMotion?: string } }).motion?.reducedMotion,
      'system',
    );
  });
});
