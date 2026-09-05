/**
 * tests/chatCodePresentation.test.ts — as REGRESSÕES DE GUARDA da onda
 * "chat e código": fonte, tamanho, highlight e a memoização dos componentes de
 * markdown.
 *
 * Os quatro defeitos abaixo eram invisíveis em código e visíveis na tela.
 * Nenhum deles quebraria um teste de comportamento — por isso a guarda é
 * ESTÁTICA sobre `src/`, no mesmo estilo da invariante `palette.mode ===` que
 * `tests/theme.test.ts` já mantém.
 *
 * 1. FONTE. O chat pedia a pilha literal
 *      'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace
 *    e o pacote instalado registra a família **'JetBrains Mono Variable'**
 *    (provado aqui contra o CSS do próprio @fontsource-variable, não de
 *    memória). Nenhum dos dois primeiros nomes existia na máquina: o primeiro
 *    item que resolvia era o `monospace` do sistema. Ou seja, **o código do
 *    chat não usava a fonte de código do projeto** — e o defeito era invisível
 *    justamente porque o fallback do sistema também é monoespaçado.
 *
 * 2. TAMANHO. Havia TRÊS medidas: `0.8125rem` (13px) no chat, `TYPE.codeSize`
 *    14 no contrato congelado e 15px na variante `code` do tema. A autoridade,
 *    declarada no cabeçalho de `src/lib/codeTheme.ts`, é `CODE_TYPOGRAPHY`: o
 *    14 é o número do CONTRATO (calibração de contraste e construtor do xterm)
 *    e o 15 é o valor EFETIVO de renderização. Quem desenha código lê de
 *    `CODE_TYPOGRAPHY` — §7.4 do redesign: editor e terminal (e agora o chat)
 *    pintam da MESMA fonte de verdade.
 *
 * 3. HIGHLIGHT. `codeTheme.ts` tem 9 papéis de sintaxe medidos contra a
 *    seleção e o chat não usava nenhum. A guarda exige que TODOS os 9 papéis
 *    apareçam nas regras do `CodeBlock` — um papel novo em `codeTheme` que
 *    ninguém plugar aqui reprova.
 *
 * 4. MEMOIZAÇÃO. `components={MarkdownComponents()}` criava um objeto NOVO por
 *    render: durante a digitação (~28 quadros/s) o react-markdown REMONTAVA a
 *    subárvore e o `<pre>` perdia o `scrollLeft` do aluno. A guarda proíbe
 *    passar uma CHAMADA de função para `components=`/`remarkPlugins=`/
 *    `rehypePlugins=` em qualquer lugar de `src/`.
 *
 * Reprodução:
 *   cd app && bash tools/t.sh tests/chatCodePresentation.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

import { CODE_SYNTAX_ROLES, CODE_TYPOGRAPHY, CODE_LIGHT, CODE_DARK } from '../src/lib/codeTheme';
import { FONT_STACK, TYPE, contrastRatio, CONTRAST_FLOOR } from '../src/lib/designTokens';
import theme from '../src/theme';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../src');
const APP = resolve(HERE, '..');

/** Todo arquivo .ts/.tsx sob `src/`, em caminho relativo ao app. */
function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (extname(full) === '.ts' || extname(full) === '.tsx') out.push(full);
  }
  return out;
}

/**
 * Remove comentários preservando literais de string/template. As guardas falam
 * do CÓDIGO; os cabeçalhos deste repositório DOCUMENTAM os antipadrões (é a
 * convenção mais visível do projeto) e não podem reprovar a si mesmos.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i] ?? '';
    const next = source[i + 1] ?? '';
    if (quote !== null) {
      out += ch;
      if (ch === '\\') {
        out += next;
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const CODE_FILES = sourceFiles().map((file) => ({
  path: relative(APP, file),
  code: stripComments(readFileSync(file, 'utf8')),
}));

describe('guarda 1 — a FONTE de código do chat é a do projeto', () => {
  it('o pacote instalado registra mesmo a família "JetBrains Mono Variable"', () => {
    const css = readFileSync(
      resolve(APP, 'node_modules/@fontsource-variable/jetbrains-mono/index.css'),
      'utf8',
    );
    assert.ok(
      css.includes("font-family: 'JetBrains Mono Variable'"),
      'o @fontsource-variable declara outra família — a pilha do contrato precisa acompanhar',
    );
    assert.ok(FONT_STACK.mono.includes("'JetBrains Mono Variable'"));
    // E ela é o PRIMEIRO item: é o que decide qual arquivo o navegador usa.
    assert.ok(FONT_STACK.mono.startsWith("'JetBrains Mono Variable'"));
  });

  it('nenhum arquivo de src/ escreve uma pilha mono LITERAL (só o contrato tem hex e famílias)', () => {
    const offenders = CODE_FILES.filter(
      (f) => f.code.includes('SFMono-Regular') && f.path !== 'src/lib/designTokens.ts',
    ).map((f) => f.path);
    assert.deepEqual(offenders, []);
  });

  it('a tipografia de código do app tem UMA fonte de verdade', () => {
    assert.equal(CODE_TYPOGRAPHY.fontFamily, FONT_STACK.mono);
    // A variante `code` do tema e o CODE_TYPOGRAPHY não podem divergir: são as
    // duas formas do MESMO número (string com unidade nos dois casos).
    const code = theme.typography.code as { fontFamily?: string; fontSize?: string | number };
    assert.equal(code.fontFamily, FONT_STACK.mono);
    assert.equal(code.fontSize, CODE_TYPOGRAPHY.fontSize);
  });
});

describe('guarda 2 — o TAMANHO do código não volta a divergir', () => {
  it('o 13px literal (0.8125rem) não existe mais em src/', () => {
    const offenders = CODE_FILES.filter((f) => f.code.includes('0.8125rem')).map((f) => f.path);
    assert.deepEqual(offenders, []);
  });

  it('o CodeBlock lê o tamanho de CODE_TYPOGRAPHY, não de um literal', () => {
    const block = CODE_FILES.find((f) => f.path === 'src/components/markdown/CodeBlock.tsx');
    assert.ok(block, 'src/components/markdown/CodeBlock.tsx precisa existir');
    assert.ok(block.code.includes('CODE_TYPOGRAPHY.fontFamily'));
    assert.ok(block.code.includes('CODE_TYPOGRAPHY.fontSize'));
    assert.ok(block.code.includes('TYPE.codeLineHeight'));
  });

  it('as duas formas do número continuam concordando (px como string e o contrato)', () => {
    assert.equal(CODE_TYPOGRAPHY.fontSize, `${CODE_TYPOGRAPHY.fontSizePx}px`);
    // O contrato congelado segue em 14 — é o número da CALIBRAGEM, não o da
    // renderização (ver o cabeçalho de codeTheme.ts). Se um dia forem
    // unificados, este teste é o lugar de registrar a decisão.
    assert.equal(TYPE.codeSize, 14);
    assert.equal(CODE_TYPOGRAPHY.fontSizePx, 15);
  });
});

describe('guarda 3 — o HIGHLIGHT usa a paleta de código inteira', () => {
  it('os 9 papéis de sintaxe do codeTheme aparecem nas regras do CodeBlock', () => {
    const block = CODE_FILES.find((f) => f.path === 'src/components/markdown/CodeBlock.tsx');
    assert.ok(block);
    // As regras são geradas a partir da própria lista — a guarda é que a lista
    // seja a de `codeTheme`, e não uma cópia escrita à mão que envelhece.
    assert.ok(block.code.includes('CODE_SYNTAX_ROLES'));
    assert.ok(block.code.includes('CODE_LIGHT'));
    assert.ok(block.code.includes('CODE_DARK'));
    assert.equal(CODE_SYNTAX_ROLES.length, 9);
  });

  it('nenhum papel de sintaxe cai abaixo de 4,5:1 sobre o well do bloco (nível 2)', () => {
    for (const palette of [CODE_LIGHT, CODE_DARK]) {
      for (const role of CODE_SYNTAX_ROLES) {
        const ratio = contrastRatio(palette.syntax[role], palette.chrome.surface);
        assert.ok(
          ratio >= CONTRAST_FLOOR.bodyAA,
          `${palette.scheme}/${role}: ${ratio.toFixed(3)}:1 sobre ${palette.chrome.surface}`,
        );
      }
    }
  });

  it('a polaridade do bloco NUNCA vem de um ternário sobre palette.mode (§6.2)', () => {
    const markdown = CODE_FILES.filter((f) => f.path.startsWith('src/components/markdown/'));
    assert.ok(markdown.length >= 3);
    for (const file of markdown) {
      assert.equal(file.code.includes('palette.mode'), false, file.path);
    }
    const block = CODE_FILES.find((f) => f.path === 'src/components/markdown/CodeBlock.tsx');
    assert.ok(block?.code.includes("applyStyles('dark'"), 'a camada escura é applyStyles');
  });
});

describe('guarda 4 — os componentes de markdown são CONSTANTE, não fábrica por render', () => {
  it('nenhum lugar de src/ passa uma CHAMADA de função para components/plugins', () => {
    const bad = /(components|remarkPlugins|rehypePlugins)=\{[A-Za-z_$][\w$.]*\(\)/;
    const offenders = CODE_FILES.filter((f) => bad.test(f.code)).map((f) => f.path);
    assert.deepEqual(offenders, []);
  });

  it('só o módulo de markdown importa react-markdown (fim da tripla duplicação)', () => {
    const importers = CODE_FILES.filter((f) => /from 'react-markdown'/.test(f.code)).map(
      (f) => f.path,
    );
    assert.deepEqual(importers, ['src/components/markdown/MarkdownView.tsx']);
  });

  it('o chat passa pelos plugins KaTeX (o $x^2$ da aula parou de sair literal)', () => {
    const view = CODE_FILES.find((f) => f.path === 'src/components/markdown/MarkdownView.tsx');
    assert.ok(view);
    assert.ok(view.code.includes('katexRemarkPlugins'));
    assert.ok(view.code.includes('katexRehypePlugins'));
    assert.ok(view.code.includes('escapeLoneDollarSigns'));
  });
});

describe('guarda 5 — o balão do chat ganhou o traço do resto do app', () => {
  it('nada no chat usa alpha() do MUI (ele LANÇA com CSS var — MUI error #9)', () => {
    const chat = CODE_FILES.filter((f) => f.path.startsWith('src/components/chat/'));
    assert.ok(chat.length >= 4);
    for (const file of chat) {
      assert.equal(/\balpha\(/.test(file.code), false, file.path);
    }
  });

  it('o raio da bolha vem de SHAPE, não de um literal "16px 16px 4px 16px"', () => {
    const surfaces = CODE_FILES.find((f) => f.path === 'src/components/chat/chatSurfaces.tsx');
    assert.ok(surfaces);
    assert.ok(surfaces.code.includes('SHAPE.lg'));
    assert.ok(surfaces.code.includes('SHAPE.sm'));
    const chat = CODE_FILES.filter((f) => f.path.startsWith('src/components/chat/'));
    for (const file of chat) {
      assert.equal(file.code.includes("16px 16px 4px 16px"), false, file.path);
    }
  });

  it('borda 2px e sombra colorida por color-mix nas fórmulas que o tema já usa', () => {
    const surfaces = CODE_FILES.find((f) => f.path === 'src/components/chat/chatSurfaces.tsx');
    assert.ok(surfaces);
    assert.ok(surfaces.code.includes('2px solid'));
    // 40% = MuiButton contained · 25% = MuiPaper selected (src/theme.ts).
    assert.ok(surfaces.code.includes('40%, transparent'));
    assert.ok(surfaces.code.includes('25%, transparent'));
    const themeSource = stripComments(readFileSync(resolve(APP, 'src/theme.ts'), 'utf8'));
    assert.ok(themeSource.includes('40%, transparent'));
    assert.ok(themeSource.includes('25%, transparent'));
  });
});
