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
 * 3. ESCALA TIPOGRÁFICA MONOTÔNICA. `typography.fontSize` re-baseia o rem do
 *    MUI e infla toda variante SEM tamanho próprio. Com só h1–h4 pinadas, h5
 *    saía maior que h4 e a hierarquia ficava invertida no app rodando. O teste
 *    assere ORDEM, não só valor: h1 > h2 > h3 > h4 > h5 > h6 estrito,
 *    body1 >= body2, e nenhum título abaixo do corpo. (ONDA 1 game-foundations:
 *    a base subiu de 16 → 18 e a razão de 1,25 → 1,28 — tipografia maior
 *    pedida pelo dono, estilo leet-code-rpg; o contrato TYPE segue congelado.)
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
  modalSurfaceStyles,
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
  SCRIM,
  SHAPE,
  SPATIAL_ALLOWED_PROPERTIES,
  SPATIAL_FORBIDDEN_PROPERTIES,
  SURFACE_DARK,
  SURFACE_LIGHT,
  TYPE,
  CELEBRATION,
  contrastRatio,
  redFlashRatio,
  relativeLuminance,
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
 * ONDA 11 — a rampa ESCURA é CINZA NEUTRO (referência Nintendo Switch)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Canais R, G e B de uma hex. */
function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Distância entre o canal mais alto e o mais baixo — o quanto a cor é CROMÁTICA.
 * Zero = cinza puro. É a medida certa aqui porque não depende de matiz: pega
 * tanto o azul (B alto) quanto o quente (R alto) que a rampa já teve.
 */
function chromaSpread(hex: string): number {
  const [r, g, b] = channels(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Lightness do CIE L*, para medir o passo PERCEPTUAL entre dois níveis. */
function lStar(hex: string): number {
  const y = relativeLuminance(hex);
  return y <= 0.008856 ? 903.3 * y : 116 * Math.cbrt(y) - 16;
}

/**
 * Teto de desvio cromático. 4/255 é a folga do arredondamento de 8 bits, não
 * uma licença: a rampa escura desta onda é R = G = B exato nos cinco níveis.
 * A rampa ANTERIOR ficava entre 8 e 22 — dava o "quase-preto azulado" que o
 * dono fotografou.
 */
const NEUTRAL_SPREAD_MAX = 4;

describe('ONDA 11 — o escuro é cinza NEUTRO, e os níveis se distinguem', () => {
  it('os cinco níveis da rampa escura são acromáticos (R = G = B)', () => {
    // Este é o defeito que o dono relatou de olho: "o escuro atual é um
    // quase-preto AZULADO". A causa era medível — o canal B ficava de 8 a 22
    // pontos acima do R em TODOS os níveis. Um véu azul sobre a tela inteira
    // não é uma escolha de matiz, é uma rampa que ninguém neutralizou.
    for (const level of SURFACE_LEVELS) {
      const hex = SURFACE_DARK[level];
      assert.ok(
        chromaSpread(hex) <= NEUTRAL_SPREAD_MAX,
        `SURFACE_DARK.${level} = ${hex} tem desvio cromático de ` +
          `${chromaSpread(hex)}/255 (teto ${NEUTRAL_SPREAD_MAX}). A referência ` +
          'é um cinza NEUTRO: o que separa um nível do vizinho é luminância, ' +
          'não matiz.',
      );
    }
  });

  it('a tinta e o divisor escuros também são acromáticos', () => {
    // Tinta azulada sobre rampa neutra é o mesmo véu, só que em cima do texto —
    // e texto é metade da tela. O divisor entra junto porque ele desenha a
    // aresta de todo Paper/Card do app.
    for (const [label, hex] of [
      ['INK_DARK.primary', INK_DARK.primary],
      ['INK_DARK.secondary', INK_DARK.secondary],
      ['DIVIDER_DARK', DIVIDER_DARK],
      ['NONTEXT_DARK.neutral', NONTEXT_DARK.neutral],
    ] as const) {
      assert.ok(
        chromaSpread(hex) <= NEUTRAL_SPREAD_MAX,
        `${label} = ${hex} tem desvio cromático de ${chromaSpread(hex)}/255`,
      );
    }
  });

  it('cada nível escuro se distingue do vizinho (passo perceptual >= 4 em L*)', () => {
    // "Níveis mais distinguíveis entre si", pedido do dono. O passo é medido em
    // L* (CIE) e não em contraste WCAG porque a razão de contraste entre duas
    // superfícies vizinhas de uma rampa escura fica sempre perto de 1,1 e não
    // discrimina nada. O teto do topo da rampa NÃO é livre: o nível 4 é a
    // seleção do editor, e tests/codeTheme.test.ts exige 4,5:1 de toda cor de
    // código sobre ela — por isso o que abriu foi a BASE (níveis 0 e 1).
    for (let i = 1; i < SURFACE_LEVELS.length; i += 1) {
      const below = SURFACE_DARK[SURFACE_LEVELS[i - 1]];
      const above = SURFACE_DARK[SURFACE_LEVELS[i]];
      const step = lStar(above) - lStar(below);
      assert.ok(
        step >= 4,
        `SURFACE_DARK.${SURFACE_LEVELS[i - 1]} (${below}) → ` +
          `${SURFACE_LEVELS[i]} (${above}) tem passo de ${step.toFixed(2)} em ` +
          'L* (mínimo 4): dois planos que quase empatam não são dois planos',
      );
    }
  });

  it('o topo da rampa escura lê como CINZA MÉDIO, não como quase-preto', () => {
    // É o cartão sobre o scrim da referência (~#3d3d3d). O piso de L* 20 é o
    // que separa "cinza médio" de "quase-preto"; o teto de 27 é o que o editor
    // impõe (a cor de código mais fraca, #23b2e7, precisa de 4,5:1 sobre a
    // seleção, que é este mesmo nível).
    const top = lStar(SURFACE_DARK.level4);
    assert.ok(top >= 20 && top <= 27, `SURFACE_DARK.level4 tem L* = ${top.toFixed(2)}`);
  });

  it('o divisor escuro NÃO é mais um nível da rampa disfarçado', () => {
    // Regressão concreta: DIVIDER_DARK era '#2c313f', byte a byte o nível 3.
    // A borda de um <Paper variant="raised"> tinha exatamente a cor do papel —
    // uma borda invisível, que é pior que borda nenhuma porque ocupa layout.
    for (const level of SURFACE_LEVELS) {
      assert.notEqual(
        DIVIDER_DARK,
        SURFACE_DARK[level],
        `DIVIDER_DARK é igual a SURFACE_DARK.${level} — a aresta some no papel`,
      );
    }
  });

  it('o preenchimento vermelho grande do escuro foi SUAVIZADO, sem perder AA', () => {
    // Pedido do dono: a barra de progresso vermelha do topo estava estridente.
    // "Suave" aqui tem número: menos saturação que o valor da onda anterior
    // (#e73f25, cujo desvio cromático era 194/255) e ainda assim carregando a
    // tinta `onFill` acima do piso de 4,5:1.
    const fill = ACCENT_DARK.action.fill;
    assert.ok(
      chromaSpread(fill) < 194,
      `action.fill ${fill} tem desvio cromático ${chromaSpread(fill)} — ` +
        'precisa ficar abaixo dos 194 do #e73f25 anterior',
    );
    assertContrast(
      'dark action.onFill sobre action.fill',
      ACCENT_DARK.action.onFill,
      fill,
      CONTRAST_FLOOR.bodyAA,
    );
    // ...e continua longe do limiar de red flash do SC 2.3.1.
    assert.ok(redFlashRatio(fill) < CELEBRATION.redFlashRatioThreshold);
  });

  it('a tinta `onFill` do escuro é o próprio nível 0 da rampa', () => {
    // Ela é o que vai EM CIMA de todo botão preenchido do escuro. Enquanto era
    // uma hex própria (#12141a), ela ficou azulada depois que a rampa virou
    // neutra — uma tinta de outra família dentro do mesmo tema.
    for (const family of ACCENT_FAMILIES) {
      assert.equal(
        ACCENT_DARK[family].onFill,
        SURFACE_DARK.level0,
        `ACCENT_DARK.${family}.onFill saiu do nível 0 da rampa`,
      );
    }
  });
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

  it('typography.fontSize é a base da ONDA 1 (18px — tipografia maior)', () => {
    // O contrato TYPE.bodySize segue 16; a base do TEMA é 18 desde a onda 1
    // (game-foundations, pedido do dono). Só quem NÃO tem tamanho próprio
    // depende desta base — e o teste abaixo garante que ninguém depende.
    assert.equal(theme.typography.fontSize, 18);
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

  it('os tamanhos saem da escala modular (1,28) sobre a base de 18 da ONDA 1', () => {
    // h1..h6 = passos +5..0, base 18, razão 1,28 (antes: 1,25 sobre 16).
    // Nenhum número solto: a escala inteira deriva de UMA base e UMA razão.
    // O contrato TYPE.bodySize (16) fica congelado — a base do TEMA é 18.
    const expected = HEADING_VARIANTS.map((_, index) =>
      Math.round(18 * 1.28 ** (HEADING_VARIANTS.length - 1 - index)),
    );
    for (const [index, heading] of HEADING_VARIANTS.entries()) {
      assert.equal(variantSize(heading), expected[index], `${heading} fora da escala modular`);
    }
    // caption/overline ocupam o passo −1 da MESMA escala (18/1,28 = 14,06 -> 14).
    const step = Math.round(18 / 1.28);
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

  it('o EIXO DE PESO do display é usado: o topo da escala é mais pesado que a base', () => {
    // ONDA 11. Não é gosto: é a prova de que a família display é VARIÁVEL.
    // Enquanto o display foi o Chakra Petch (pacote estático que para em 700),
    // h1 e h6 tinham o MESMO peso — e como h6 empata com body1 em 18px, o piso
    // da hierarquia ficava dependendo de um único sinal (a família). Se alguém
    // trocar o display por outra família que pare em 700, este teste morde.
    const top = theme.typography.h1.fontWeight as number;
    const base = theme.typography.h6.fontWeight as number;
    assert.ok(
      top > base,
      `h1 (${top}) precisa ser mais pesado que h6 (${base}) — o display é ` +
        'variável (Nunito, wght 200..1000) justamente para ter dois sinais de ' +
        'hierarquia, tamanho E peso',
    );
    assert.equal(theme.typography.h3.fontWeight, top, 'h1–h3 são o topo da escala');
    assert.equal(theme.typography.h4.fontWeight, base, 'h4–h6 são a base da escala');
  });

  it('as variantes de TEXTO (subtitle/body/button/caption/overline) usam a stack de CORPO', () => {
    for (const variant of BODY_VARIANTS) {
      const style = theme.typography[variant] as { fontFamily?: unknown };
      assert.equal(style.fontFamily, FONT_STACK.body, `${variant}.fontFamily`);
    }
  });

  it('a variante `code` usa a stack MONO em 15/1,5, com o tamanho em PX EXPLÍCITO', () => {
    assert.equal(theme.typography.code.fontFamily, FONT_STACK.mono);
    assert.equal(theme.typography.code.lineHeight, TYPE.codeLineHeight);
    // A UNIDADE é a invariante, não o número. `--mui-font-code` é montado por
    // @mui/system/cssVars/prepareTypographyVars.mjs concatenando `fontSize`
    // CRU no shorthand `font`; com um NÚMERO o var sairia `15/1.5 '…'`, que é
    // <font-size> inválido, e `font: var(--mui-font-code)` em src/index.css
    // caía inteiro em silêncio (o editor voltava a Inter/16px/lh normal).
    // ONDA 1: 14 → 15 (TYPE.codeSize segue 14 no contrato).
    assert.equal(
      theme.typography.code.fontSize,
      '15px',
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

  it('body1 é a superfície de prosa: 18px na entrelinha de 1,6', () => {
    // ONDA 1 (game-foundations): subiu de 16 → 18 (pedido do dono; o contrato
    // TYPE.bodySize segue 16).
    assert.equal(theme.typography.body1.fontSize, 18);
    assert.equal(theme.typography.body1.lineHeight, TYPE.proseLineHeight);
  });

  it('body2/subtitle2 usam o degrau de 16 (abaixo de body1)', () => {
    assert.equal(theme.typography.body2.fontSize, 16);
    assert.equal(theme.typography.subtitle2.fontSize, 16);
  });

  it('a variante `pixel` é um RÓTULO de HUD em display — não uma fonte pixel', () => {
    // ONDA 11: o nome é LEGADO. A família que o batizou (Press Start 2P) saiu
    // do projeto com o resto do registro retro; a variante ficou porque
    // SessionFrame e CodeBlock a consomem. O que este teste trava é o PAPEL:
    // rótulo — mesma voz dos títulos (display), mas ABAIXO do menor degrau da
    // escala de texto, para que ninguém a promova a nível de hierarquia.
    assert.equal(theme.typography.pixel.fontFamily, FONT_STACK.display);
    const size = (theme.typography.pixel as { fontSize?: unknown }).fontSize;
    assert.equal(typeof size, 'number');
    assert.ok(
      (size as number) < (theme.typography.caption.fontSize as number),
      `pixel (${String(size)}px) tem que ficar abaixo de caption ` +
        `(${String(theme.typography.caption.fontSize)}px) — é rótulo, não voz`,
    );
    assert.equal(theme.typography.pixel.textTransform, 'uppercase');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * VARIANTES DE COMPONENTE — token de tema, não `sx` espalhado
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Lê `components.MuiX.styleOverrides.root.variants` na forma canônica. O
 * `root` pode ser OBJETO ou CALLBACK `({ theme }) => ({...})` (o MUI aceita os
 * dois) — o callback é resolvido aqui para que a forma canônica de leitura
 * seja sempre o objeto final.
 */
function rootVariants(component: string): Array<{
  props: Record<string, unknown>;
  style: unknown;
}> {
  const spec = (
    theme.components as unknown as Record<
      string,
      {
        styleOverrides?: {
          root?:
            | { variants?: Array<{ props: Record<string, unknown>; style: unknown }> }
            | ((a: { theme: typeof theme }) => {
                variants?: Array<{ props: Record<string, unknown>; style: unknown }>;
              });
        };
      }
    >
  )[component];
  const rawRoot = spec?.styleOverrides?.root;
  const root =
    typeof rawRoot === 'function' ? rawRoot({ theme }) : rawRoot;
  const variants = root?.variants;
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

  it('o papel do MODAL é o cartão sobre o scrim: nível 4 no escuro, nível 1 no claro', () => {
    // ONDA 11, e é a tradução direta da referência (Nintendo Switch Online):
    // um retângulo de cinza MÉDIO neutro sobre um scrim escuro. O default do
    // MUI pinta `background.paper` — o nível 1, a superfície de LEITURA, que no
    // escuro é quase preta — e ainda soma a sombra de elevação 24.
    //
    // A assimetria entre esquemas é DE PROPÓSITO e por isso passa por
    // `applyStyles` (o ternário sobre `palette.mode` resolveria uma vez só):
    // sob polaridade negativa elevação é LUZ (topo da rampa); sob polaridade
    // positiva a rampa escurece conforme sobe, e o modal ficaria mais escuro
    // que a página.
    const paper = (
      theme.components as unknown as {
        MuiDialog?: { styleOverrides?: { paper?: (a: { theme: unknown }) => Record<string, unknown> } };
      }
    ).MuiDialog?.styleOverrides?.paper;
    assert.equal(typeof paper, 'function', 'MuiDialog precisa de styleOverrides.paper');
    const style = paper!({ theme });

    assert.equal(
      style.backgroundColor,
      theme.vars.palette.surface.level1,
      'o galho CLARO do papel do diálogo é a superfície de leitura (nível 1)',
    );
    assert.equal(style.boxShadow, 'none', 'elevação nesta base é por COR, não por sombra');

    // O galho escuro entra como uma chave de SELETOR (o que applyStyles produz
    // sob colorSchemeSelector: 'class'), e tem que apontar para o nível 4.
    const darkBranch = Object.entries(style).find(
      ([key, value]) =>
        typeof value === 'object' && value !== null && /dark/.test(key),
    );
    assert.ok(darkBranch, `nenhum galho de esquema escuro em: ${Object.keys(style).join(', ')}`);
    assert.equal(
      (darkBranch![1] as Record<string, unknown>).backgroundColor,
      theme.vars.palette.surface.level4,
      'no escuro o modal é o TOPO da rampa — é esse valor que lê como o cinza ' +
        'médio da referência (#3b3b3b), e não o quase-preto do nível 1',
    );
  });

  it('nenhuma superfície carrega mais o GLOW colorido da onda 1', () => {
    // O brilho de acento em Paper/Card é o que o dono apontou como o que mais
    // destoa da referência ("borda 2px + brilho roxo no modal e no card"). No
    // mock do Switch a distinção entre planos é a rampa tonal, nunca uma sombra
    // colorida. Sobrou `color-mix` de acento só nos BOTÕES, que é onde o acento
    // deve mesmo estar vivo.
    const selected = rootVariants('MuiPaper').find((v) => v.props.variant === 'selected');
    assert.ok(selected, 'MuiPaper precisa da variante `selected`');
    assert.equal(styleOf(selected).boxShadow, 'none');
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

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 12 — NÚMERO EM COMENTÁRIO É AFIRMAÇÃO, E AFIRMAÇÃO SE CONFERE
 *
 * A revisão adversarial desta onda achou QUATRO razões medidas escritas à mão e
 * ERRADAS nos comentários de `designTokens.ts` e `theme.ts`:
 *   1. o divisor claro, anunciado como 1,89 sobre o nível 0, mede 1,36;
 *   2. "o pior red flash é o `error` claro, em 0,605" — o pior era o `action`
 *      claro, em 0,735, com um terço da margem que a frase prometia;
 *   3. o anel de foco escuro, anunciado como "3,35 e 3,03", mede 3,51 e 3,13
 *      desde que a onda 11 trocou o hex do `focus`;
 *   4. a folga do `onFill` do `action` escuro, escrita contra o `onFill` antigo.
 * Todos os quatro têm a MESMA causa: alguém calculou uma vez, mudou a cor
 * depois e não voltou no comentário. Travar os quatro casos um a um não resolve
 * o quinto.
 *
 * Então o que este bloco trava é a CLASSE. Toda razão escrita nesses dois
 * arquivos passa a ter forma fixa —
 *     [medido] <A> x <B> = <n,nn>:1
 *     [medido] red-flash(<A>) = <n,nnn>
 * — e aqui ela é RECALCULADA a partir dos tokens de verdade. Um número que
 * envelheceu reprova; e escrever uma razão FORA dessa forma também reprova, o
 * que fecha a porta pela qual os quatro entraram.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Fonte do contrato de tokens (as afirmações moram nos comentários dele). */
const TOKENS_SOURCE = readFileSync(
  join(__dirname, '..', 'src', 'lib', 'designTokens.ts'),
  'utf8',
);

/**
 * Junta as linhas de um fonte numa string só, apagando os marcadores de
 * comentário (`*` e `//`) do início de cada linha. Sem isto, uma afirmação que
 * quebra de linha no meio — e elas quebram, porque a coluna é de 100 — passaria
 * despercebida pelo varredor, que é exatamente o buraco por onde um número
 * errado voltaria a entrar.
 */
function flattenComments(source: string): string {
  return source.replace(/\n[ \t]*(?:\*\/|\*|\/\/)?[ \t]*/g, ' ');
}

/** Os objetos de token que uma afirmação pode citar pelo nome. */
const CLAIM_TOKENS: Readonly<Record<string, unknown>> = {
  SURFACE_LIGHT,
  SURFACE_DARK,
  INK_LIGHT,
  INK_DARK,
  ACCENT_LIGHT,
  ACCENT_DARK,
  NONTEXT_LIGHT,
  NONTEXT_DARK,
  DIVIDER_LIGHT,
  DIVIDER_DARK,
  SCRIM,
};

/**
 * Resolve o lado de uma afirmação: ou uma hex literal (é assim que um valor
 * HISTÓRICO — o hex que a cor tinha antes — continua conferível depois de sair
 * do contrato), ou um caminho pontuado dentro dos tokens exportados.
 */
function resolveClaimColor(ref: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(ref)) return ref.toLowerCase();
  const parts = ref.split('.');
  let node: unknown = CLAIM_TOKENS[parts[0]!];
  assert.ok(
    node !== undefined,
    `afirmação [medido] cita "${ref}", e "${parts[0]}" não é um token exportado por designTokens.ts`,
  );
  for (const part of parts.slice(1)) {
    assert.ok(
      node !== null && typeof node === 'object' && part in (node as Record<string, unknown>),
      `afirmação [medido] cita "${ref}", e o caminho quebra em "${part}"`,
    );
    node = (node as Record<string, unknown>)[part];
  }
  assert.ok(
    typeof node === 'string' && /^#[0-9a-fA-F]{6}$/.test(node),
    `afirmação [medido] cita "${ref}", que não resolve para uma hex de 6 dígitos (veio ${String(node)})`,
  );
  return (node as string).toLowerCase();
}

/** Uma afirmação de contraste extraída de um comentário. */
interface ContrastClaim {
  file: string;
  a: string;
  b: string;
  claimed: number;
  raw: string;
}

/** Uma afirmação de red flash extraída de um comentário. */
interface RedFlashClaim {
  file: string;
  color: string;
  claimed: number;
  raw: string;
}

const CONTRAST_CLAIM_RE = /\[medido\]\s+(\S+)\s+x\s+(\S+)\s+=\s+(\d+,\d{2}):1/g;
const RED_FLASH_CLAIM_RE = /\[medido\]\s+red-flash\((\S+?)\)\s*=\s*(\d,\d{3})/g;

/** "16,75" -> 16.75 (as afirmações são escritas em português, com vírgula). */
function ptNumber(text: string): number {
  return Number(text.replace(',', '.'));
}

const CLAIM_SOURCES: ReadonlyArray<[string, string]> = [
  ['src/lib/designTokens.ts', flattenComments(TOKENS_SOURCE)],
  ['src/theme.ts', flattenComments(THEME_SOURCE)],
];

function contrastClaims(): ContrastClaim[] {
  const out: ContrastClaim[] = [];
  for (const [file, text] of CLAIM_SOURCES) {
    for (const m of text.matchAll(CONTRAST_CLAIM_RE)) {
      out.push({ file, a: m[1]!, b: m[2]!, claimed: ptNumber(m[3]!), raw: m[0]! });
    }
  }
  return out;
}

function redFlashClaims(): RedFlashClaim[] {
  const out: RedFlashClaim[] = [];
  for (const [file, text] of CLAIM_SOURCES) {
    for (const m of text.matchAll(RED_FLASH_CLAIM_RE)) {
      out.push({ file, color: m[1]!, claimed: ptNumber(m[2]!), raw: m[0]! });
    }
  }
  return out;
}

/**
 * Pisos NORMATIVOS, que não são medida de nada e por isso podem aparecer soltos
 * na prosa. A lista é fechada de propósito: é ela que separa "o SC exige 4,5:1"
 * (norma) de "esta cor dá 4,52:1" (afirmação, que se confere). O `4.499:1` e o
 * `4.5:1` com PONTO são a citação literal do Understanding do SC 1.4.3.
 */
const NORMATIVE_FLOORS: readonly string[] = ['3:1', '4,5:1', '7:1', '4.499:1', '4.5:1'];

describe('ONDA 12 — toda razão escrita num comentário é RECALCULADA', () => {
  it('as afirmações [medido] de contraste existem e batem com o contrato', () => {
    const claims = contrastClaims();
    // Se a varredura parar de achar afirmação nenhuma, o teste inteiro vira
    // decoração — então o piso é explícito.
    assert.ok(
      claims.length >= 20,
      `o varredor achou só ${claims.length} afirmações [medido] de contraste; ` +
        'os dois arquivos deveriam ter dezenas — a forma da afirmação mudou?',
    );
    for (const claim of claims) {
      const actual = contrastRatio(resolveClaimColor(claim.a), resolveClaimColor(claim.b));
      // Meio centésimo: a afirmação é escrita com 2 casas, então o erro máximo
      // de arredondamento honesto é 0,005. Acima disso o número é OUTRO.
      assert.ok(
        Math.abs(actual - claim.claimed) <= 0.005 + 1e-9,
        `${claim.file}: "${claim.raw}" — a conta de verdade dá ${actual.toFixed(4)}:1. ` +
          'Recalcule o comentário; número de contraste em comentário é afirmação, não lembrança.',
      );
    }
  });

  it('as afirmações [medido] de red flash existem e batem com o contrato', () => {
    const claims = redFlashClaims();
    assert.ok(claims.length >= 5, `só ${claims.length} afirmações [medido] de red flash`);
    for (const claim of claims) {
      const actual = redFlashRatio(resolveClaimColor(claim.color));
      assert.ok(
        Math.abs(actual - claim.claimed) <= 0.0005 + 1e-9,
        `${claim.file}: "${claim.raw}" — R/(R+G+B) de verdade é ${actual.toFixed(5)}`,
      );
    }
  });

  it('NENHUMA razão de contraste é escrita fora da forma [medido]', () => {
    // Esta é a trava da CLASSE, e não dos quatro casos: um "~4,1:1" solto no
    // meio da prosa não tem como ser conferido, e foi assim que os quatro
    // números errados nasceram. Ou a razão vem numa afirmação [medido], ou é um
    // piso normativo da lista fechada acima. Não há terceira opção.
    for (const [file, text] of CLAIM_SOURCES) {
      const claimSpans: Array<[number, number]> = [];
      for (const re of [CONTRAST_CLAIM_RE, RED_FLASH_CLAIM_RE]) {
        for (const m of text.matchAll(re)) {
          claimSpans.push([m.index!, m.index! + m[0]!.length]);
        }
      }
      const inClaim = (index: number): boolean =>
        claimSpans.some(([start, end]) => index >= start && index < end);

      for (const m of text.matchAll(/\d+(?:[.,]\d+)?:1/g)) {
        if (NORMATIVE_FLOORS.includes(m[0]!)) continue;
        if (inClaim(m.index!)) continue;
        const around = text.slice(Math.max(0, m.index! - 90), m.index! + 40).trim();
        assert.fail(
          `${file}: a razão "${m[0]}" está escrita fora de uma afirmação [medido] — ` +
            `"…${around}…". Escreva "[medido] <A> x <B> = ${m[0]}" (com A e B em nome ` +
            'de token ou hex) para que ela seja recalculada, ou use um piso normativo.',
        );
      }
    }
  });

  it('NENHUM valor de red flash é escrito fora da forma [medido]', () => {
    // Mesma trava, no outro eixo: R/(R+G+B) é escrito com TRÊS casas nesta base
    // (é a precisão que separa 0,735 de 0,8), e as luminâncias soltas dos
    // comentários da rampa têm cinco ou mais — por isso a busca é ancorada em
    // exatamente três.
    for (const [file, text] of CLAIM_SOURCES) {
      const spans: Array<[number, number]> = [];
      for (const m of text.matchAll(RED_FLASH_CLAIM_RE)) {
        spans.push([m.index!, m.index! + m[0]!.length]);
      }
      for (const m of text.matchAll(/(?<![\d,])0,\d{3}(?![\d])/g)) {
        if (spans.some(([start, end]) => m.index! >= start && m.index! < end)) continue;
        const around = text.slice(Math.max(0, m.index! - 90), m.index! + 40).trim();
        assert.fail(
          `${file}: o valor "${m[0]}" parece um red flash escrito fora de uma afirmação ` +
            `[medido] — "…${around}…"`,
        );
      }
    }
  });

  it('as quatro afirmações que a revisão reprovou estão CORRIGIDAS, uma a uma', () => {
    // O teste acima trava a classe; este documenta os quatro casos concretos,
    // para que a próxima pessoa saiba o que estava escrito e o que é verdade.
    const claims = contrastClaims();
    const has = (a: string, b: string, value: number): boolean =>
      claims.some((c) => c.a === a && c.b === b && Math.abs(c.claimed - value) < 1e-9);

    // 1. o divisor claro: 1,89 anunciado, 1,36 medido.
    assert.ok(
      has('DIVIDER_LIGHT', 'SURFACE_LIGHT.level0', 1.36),
      'o divisor claro precisa afirmar a razão MEDIDA contra o nível 0',
    );
    assert.ok(
      Math.abs(contrastRatio(DIVIDER_LIGHT, SURFACE_LIGHT.level0) - 1.89) > 0.1,
      'se o divisor claro passar a medir 1,89 de verdade, este teste virou obsoleto',
    );
    // 3. o anel de foco escuro: "3,35 e 3,03" anunciados, 3,51 e 3,13 medidos.
    assert.ok(
      has('NONTEXT_DARK.focus', 'SURFACE_DARK.level0', 3.51) &&
        has('NONTEXT_DARK.focus', 'SURFACE_DARK.level1', 3.13),
      'o anel de foco escuro precisa afirmar as razões MEDIDAS nos níveis 0 e 1',
    );
    // 2 e 4 são cobertos pelos testes de red flash e do `onFill` logo abaixo.
    const flashes = redFlashClaims();
    assert.ok(
      flashes.some((c) => c.color === 'ACCENT_LIGHT.action.fill'),
      'o pior caso de red flash da base precisa estar escrito como afirmação',
    );
  });

  it('o PIOR red flash da base é o que o comentário diz que é', () => {
    // A frase antiga não era só um número errado: ela apontava a FAMÍLIA errada
    // ("o pior é `error` claro"), e por isso ninguém foi olhar o `action`. O
    // teto de 0,8 sozinho nunca teria pegado isso — passava com folga aparente.
    const all: Array<[string, string]> = [];
    for (const [scheme, accents] of [
      ['light', ACCENT_LIGHT],
      ['dark', ACCENT_DARK],
    ] as const) {
      for (const [family, pair] of Object.entries(accents)) {
        all.push([`${scheme} ${family}.text`, pair.text]);
        all.push([`${scheme} ${family}.fill`, pair.fill]);
      }
    }
    const worst = all.reduce((a, b) => (redFlashRatio(b[1]) > redFlashRatio(a[1]) ? b : a));
    assert.equal(
      worst[1],
      ACCENT_LIGHT.action.fill,
      `o pior red flash das doze cores de acento é ${worst[0]} (${worst[1]}, ` +
        `${redFlashRatio(worst[1]).toFixed(3)}), e não a \`action\` clara — ` +
        'o comentário de designTokens.ts afirma o contrário e precisa ser reescrito',
    );
    for (const [label, hex] of all) {
      assert.ok(
        redFlashRatio(hex) < CELEBRATION.redFlashRatioThreshold,
        `${label} (${hex}) passa do teto de red flash`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 12 — o vermelho CLARO, o scrim, o papel do modal e o desabilitado
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Matiz HSL (0–360) de uma hex; NaN para acromático. */
function hueOf(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return Number.NaN;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return h;
}

/** Saturação HSL (0–1) — o eixo que esta onda mexeu no vermelho claro. */
function saturationOf(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Luminosidade HSL (0–1) — o eixo que esta onda NÃO mexeu. */
function lightnessOf(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => v / 255) as [number, number, number];
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('ONDA 12 — o vermelho CLARO foi dessaturado, e só isso', () => {
  // A queixa do dono é visual e específica: na tela CLARA o `action` aparecia em
  // quatro elementos ao mesmo tempo (barra de progresso, "Responder", contorno
  // do campo em foco, contorno do "Fontes") e lia como vermelho Nintendo puro
  // sobre o creme. O remédio é o mesmo que a onda 11 aplicou no escuro. O que
  // este bloco impede é o remédio virar OUTRA coisa: trocar de família, escurecer
  // até compensar, ou perder AA no caminho.
  const OLD_TEXT = '#cc3119';
  const OLD_FILL = '#de351b';
  const OLD_NONTEXT = '#ea6551';

  it('a MATIZ da família não se mexeu (dessaturar não é trocar de família)', () => {
    // A matiz é o que amarra `action` ao cursor do editor: tests/codeTheme.test.ts
    // compara `CODE_LIGHT.chrome.cursor` com `ACCENT_LIGHT.action.text` com
    // tolerância de 1°. Uma "suavização" que gira a matiz quebra aquele teste
    // longe daqui, e o motivo fica ilegível.
    for (const [label, before, after] of [
      ['action.text', OLD_TEXT, ACCENT_LIGHT.action.text],
      ['action.fill', OLD_FILL, ACCENT_LIGHT.action.fill],
      ['nonText.action', OLD_NONTEXT, NONTEXT_LIGHT.action],
    ] as const) {
      const delta = Math.abs(hueOf(after) - hueOf(before));
      assert.ok(
        delta <= 0.5,
        `${label}: a matiz saiu de ${hueOf(before).toFixed(2)}° para ` +
          `${hueOf(after).toFixed(2)}° (${delta.toFixed(2)}° de giro, teto 0,5°)`,
      );
    }
  });

  it('a SATURAÇÃO caiu um degrau de verdade — pelo menos 10 pontos percentuais', () => {
    for (const [label, before, after] of [
      ['action.text', OLD_TEXT, ACCENT_LIGHT.action.text],
      ['action.fill', OLD_FILL, ACCENT_LIGHT.action.fill],
      ['nonText.action', OLD_NONTEXT, NONTEXT_LIGHT.action],
    ] as const) {
      const drop = saturationOf(before) - saturationOf(after);
      assert.ok(
        drop >= 0.1,
        `${label}: a saturação caiu só ${(drop * 100).toFixed(1)} pontos ` +
          `(${(saturationOf(before) * 100).toFixed(1)}% → ${(saturationOf(after) * 100).toFixed(1)}%); ` +
          'o pedido era um degrau, como o escuro levou na onda 11',
      );
    }
  });

  it('o vermelho claro é o MENOS saturado dos dois esquemas... ou empata', () => {
    // O escuro já tinha sido suavizado; se o claro ficasse mais saturado que o
    // escuro, a mesma família teria dois registros de temperatura no mesmo app.
    assert.ok(
      saturationOf(ACCENT_LIGHT.action.fill) <= saturationOf(ACCENT_DARK.action.fill) + 0.02,
      `action.fill claro (${(saturationOf(ACCENT_LIGHT.action.fill) * 100).toFixed(1)}%) ` +
        `ficou mais saturado que o escuro (${(saturationOf(ACCENT_DARK.action.fill) * 100).toFixed(1)}%)`,
    );
  });

  it('o texto e o preenchimento GANHARAM contraste — o remédio não custou AA', () => {
    // Baixar saturação mantendo o L do HSL faz a luminância de um vermelho CAIR
    // (o canal R sai com peso 0,2126 e o G entra com peso 0,7152, mas entra
    // menos do que o R sai). Por isso o "suave" aqui é ESTRITAMENTE melhor, e
    // não um empate na casa decimal.
    assert.ok(
      contrastRatio(ACCENT_LIGHT.action.text, SURFACE_LIGHT.level2) >
        contrastRatio(OLD_TEXT, SURFACE_LIGHT.level2),
      'o novo action.text tem que medir MAIS que o antigo contra o nível 2',
    );
    assert.ok(
      contrastRatio(ACCENT_LIGHT.action.onFill, ACCENT_LIGHT.action.fill) >
        contrastRatio('#ffffff', OLD_FILL),
      'o novo action.fill tem que carregar o branco com MAIS folga que o antigo',
    );
    // ...e os pisos continuam de pé (os testes gerais acima já medem os três
    // níveis; aqui a asserção é local, para o defeito não voltar sozinho).
    assertContrast(
      'light action.text sobre o nível 2 (o mais exigente dos três)',
      ACCENT_LIGHT.action.text,
      SURFACE_LIGHT.level2,
      CONTRAST_FLOOR.bodyAA,
    );
  });

  it('a MARGEM de red flash cresceu (era o pior caso da base, com 0,065 de folga)', () => {
    const before = redFlashRatio(OLD_FILL);
    const after = redFlashRatio(ACCENT_LIGHT.action.fill);
    assert.ok(after < before, `red flash não caiu: ${before.toFixed(3)} → ${after.toFixed(3)}`);
    assert.ok(
      CELEBRATION.redFlashRatioThreshold - after >= 0.1,
      `a folga até o teto ficou em ${(CELEBRATION.redFlashRatioThreshold - after).toFixed(3)} — ` +
        'o pior caso da base merece pelo menos um décimo de margem',
    );
  });

  it('a camada não-texto do `action` claro continua alcançando 3:1 nos níveis 0 e 1', () => {
    // Este é o valor que vive colado no piso: por isso ele desceu um degrau de L
    // junto com a dessaturação, e por isso a asserção é local e explícita.
    for (const index of READING_SURFACE_LEVELS) {
      const level = SURFACE_LEVELS[index] as SurfaceLevel;
      assertContrast(
        `light nonText.action sobre surface.${level}`,
        NONTEXT_LIGHT.action,
        SURFACE_LIGHT[level],
        CONTRAST_FLOOR.nonText,
      );
    }
    assert.ok(
      contrastRatio(NONTEXT_LIGHT.action, SURFACE_LIGHT.level0) >
        contrastRatio(OLD_NONTEXT, SURFACE_LIGHT.level0),
      'a borda dessaturada tem que ficar com MAIS folga sobre o nível 0 que a anterior',
    );
  });
});

describe('ONDA 12 — o SCRIM é token, é neutro e deixa ver o que está atrás', () => {
  it('a cor base do scrim é ACROMÁTICA (escurecer não pode tingir)', () => {
    // O defeito medido: os overlays pintavam `rgba(8, 10, 20, 0.66)`, com B 12
    // pontos acima de R. Sob ele o nível 0 (#0e0e0e, cinza puro) vira #090b11 e
    // a tela inteira ganha véu azul — desfazendo a rampa neutra da onda 11 no
    // exato instante em que o quiz abre.
    assert.equal(
      chromaSpread(SCRIM.color),
      0,
      `SCRIM.color = ${SCRIM.color} tem desvio cromático — um scrim com matiz ` +
        'tinge tudo que está atrás dele',
    );
  });

  it('a opacidade deixa a conversa aparecer atrás do cartão', () => {
    // A referência (Nintendo Switch Online) mostra o jogo atrás do cartão do
    // convite. 66% apagava a conversa da aula e fazia o modal parecer uma tela
    // nova; o teto de 60% é o que separa "atenuado" de "sumiu".
    assert.ok(
      SCRIM.opacityPercent <= 60,
      `SCRIM.opacityPercent = ${SCRIM.opacityPercent} — acima de 60% o que está ` +
        'atrás do modal deixa de ser legível como contexto',
    );
    assert.ok(
      SCRIM.opacityPercent >= 40,
      'abaixo de 40% o scrim para de separar o modal do fundo',
    );
  });

  it('o tema publica o scrim como palette.scrim nos DOIS esquemas', () => {
    // É o nome que os overlays fora do MuiBackdrop consomem
    // (`theme.vars.palette.scrim`). Se ele sumir do palette, cada um volta a
    // pintar a sua rgba() crua — que é de onde este bug veio.
    const expected = `color-mix(in srgb, ${SCRIM.color} ${SCRIM.opacityPercent}%, transparent)`;
    for (const scheme of SCHEMES) {
      assert.equal(
        (paletteOf(scheme) as unknown as { scrim?: string }).scrim,
        expected,
        `palette.scrim ausente ou diferente no scheme ${scheme}`,
      );
    }
    assert.ok(
      theme.vars.palette.scrim.startsWith('var(--mui-palette-scrim'),
      `theme.vars.palette.scrim deveria ser uma variável CSS, veio ${theme.vars.palette.scrim}`,
    );
  });

  it('o MuiBackdrop consome o token — não um número escrito à mão', () => {
    const backdrop = (
      theme.components as unknown as {
        MuiBackdrop?: { styleOverrides?: { root?: (a: unknown) => Record<string, unknown> } };
      }
    ).MuiBackdrop?.styleOverrides?.root;
    assert.equal(typeof backdrop, 'function', 'MuiBackdrop precisa de styleOverrides.root');
    const style = backdrop!({ theme });
    const visible = style['&:not(.MuiBackdrop-invisible)'] as Record<string, unknown>;
    assert.ok(visible, 'o scrim só vale para o Backdrop VISÍVEL (menu e select usam o invisível)');
    assert.equal(visible.backgroundColor, theme.vars.palette.scrim);
  });

  it('o tema não carrega mais nenhuma cor CRUA de scrim (rgb/rgba/hsl)', () => {
    // O hex já é proibido por um teste vizinho; rgba() era a porta que restava,
    // e foi por ela que o azul entrou no overlay do quiz.
    const raw = THEME_CODE.match(/\b(?:rgba?|hsla?)\s*\(/g) ?? [];
    assert.deepEqual(raw, [], `cor crua no tema: ${raw.join(', ')}`);
  });
});

describe('ONDA 12 — o papel do modal é UMA decisão, compartilhada', () => {
  it('modalSurfaceStyles é o nível 1 no claro e o nível 4 no escuro', () => {
    // O overlay do quiz não é um <Dialog>: ele pintava o cartão no nível 3 nos
    // DOIS esquemas, e no claro o nível 3 (#e9e2d6) é mais ESCURO que a página
    // (#faf7f2) — o modal lia como buraco. A regra passa a morar numa função só,
    // para os dois consumirem a mesma coisa.
    const style = modalSurfaceStyles(theme);
    assert.equal(style.backgroundColor, theme.vars.palette.surface.level1);
    const darkBranch = Object.entries(style).find(
      ([key, value]) => typeof value === 'object' && value !== null && /dark/.test(key),
    );
    assert.ok(darkBranch, `nenhum galho escuro em: ${Object.keys(style).join(', ')}`);
    assert.equal(
      (darkBranch![1] as Record<string, unknown>).backgroundColor,
      theme.vars.palette.surface.level4,
    );
  });

  it('no CLARO o cartão do modal é MAIS CLARO que a página (elevação, não buraco)', () => {
    // A conta que condena o nível 3 no claro, escrita como teste em vez de como
    // opinião: sob polaridade positiva a rampa ESCURECE conforme sobe.
    assert.ok(
      relativeLuminance(SURFACE_LIGHT.level1) > relativeLuminance(SURFACE_LIGHT.level0),
      'o nível 1 tem que ser mais claro que o nível 0 no esquema claro',
    );
    assert.ok(
      relativeLuminance(SURFACE_LIGHT.level3) < relativeLuminance(SURFACE_LIGHT.level0),
      'o nível 3 do claro é mais ESCURO que a página — é por isso que ele não pode ' +
        'ser o papel de um modal',
    );
    assert.ok(
      relativeLuminance(SURFACE_DARK.level4) > relativeLuminance(SURFACE_DARK.level0),
      'no escuro elevação é LUZ: o topo da rampa é o mais claro',
    );
  });

  it('o MuiDialog usa a MESMA função (uma regra, não duas cópias)', () => {
    const paper = (
      theme.components as unknown as {
        MuiDialog?: { styleOverrides?: { paper?: (a: { theme: unknown }) => Record<string, unknown> } };
      }
    ).MuiDialog?.styleOverrides?.paper;
    const style = paper!({ theme });
    const shared = modalSurfaceStyles(theme);
    for (const [key, value] of Object.entries(shared)) {
      assert.deepEqual(
        style[key],
        value,
        `o papel do MuiDialog divergiu de modalSurfaceStyles em "${key}"`,
      );
    }
  });
});

describe('ONDA 12 — botão DESABILITADO que carrega informação continua legível', () => {
  /** O `&.Mui-disabled` da raiz do MuiButton, resolvido com o tema real. */
  function disabledRootStyle(): Record<string, unknown> {
    const root = (
      theme.components as unknown as {
        MuiButton?: { styleOverrides?: { root?: (a: unknown) => Record<string, unknown> } };
      }
    ).MuiButton?.styleOverrides?.root;
    assert.equal(typeof root, 'function');
    const style = root!({ theme });
    const disabled = style['&.Mui-disabled'] as Record<string, unknown> | undefined;
    assert.ok(disabled, 'MuiButton precisa de um bloco &.Mui-disabled na raiz');
    return disabled;
  }

  it('o rótulo desabilitado é a TINTA SECUNDÁRIA, não o cinza translúcido do MUI', () => {
    // Prova visual do dono: o "Próximo →" bloqueado pelo quiz ficava cinza sobre
    // cinza no escuro — e ele é o estado NORMAL enquanto a aula não foi
    // respondida. O default do MUI é `action.disabled` (branco a 30%), que
    // composto sobre o nível 0 vira #565656 e mede 2,63:1.
    assert.equal(disabledRootStyle().color, theme.vars.palette.text.secondary);
  });

  it('essa tinta alcança AA sobre TODOS os cinco níveis, nos dois esquemas', () => {
    // É o que transforma "escolhi um cinza mais claro" em garantia: o rótulo
    // desabilitado é legível em cima de qualquer superfície da rampa, inclusive
    // dentro de um modal (nível 4 no escuro) e de um well (nível 2).
    for (const scheme of SCHEMES) {
      const tokens = TOKENS_BY_SCHEME[scheme];
      for (const level of SURFACE_LEVELS) {
        assertContrast(
          `${scheme} rótulo desabilitado (text.secondary) sobre surface.${level}`,
          tokens.ink.secondary,
          tokens.surface[level],
          CONTRAST_FLOOR.bodyAA,
        );
      }
    }
  });

  it('o desabilitado ainda DESENHA a moldura (a borda vai para o divisor)', () => {
    // O "Próximo →" bloqueado é `variant="outlined"`, e a borda default do
    // desabilitado é `action.disabledBackground` — branco a 12% no escuro, que
    // sobre o nível 0 some. Sem moldura o botão vira texto solto no meio da
    // tela; um controle desabilitado é dispensado do piso de 3:1, mas não de
    // existir.
    assert.equal(disabledRootStyle().borderColor, theme.vars.palette.divider);
  });

  it('o `pop` desabilitado mantém a tinta do PREENCHIMENTO (ele não fica cinza)', () => {
    // O MUI não conhece a variante `pop` e não pinta o fundo de desabilitado
    // nela: o botão continua com o acento chapado. Se ele herdasse a tinta
    // secundária da raiz, o par ficaria em 1,80:1 — o conserto de um botão
    // quebraria o outro.
    const pop = rootVariants('MuiButton').find((v) => v.props.variant === 'pop');
    assert.ok(pop);
    const disabled = styleOf(pop)['&.Mui-disabled'] as Record<string, unknown>;
    assert.equal(disabled.color, theme.vars.palette.primary.onFill);
    assertContrast(
      'dark pop desabilitado: onFill sobre fill',
      ACCENT_DARK.action.onFill,
      ACCENT_DARK.action.fill,
      CONTRAST_FLOOR.bodyAA,
    );
  });
});
