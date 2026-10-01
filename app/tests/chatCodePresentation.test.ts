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
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { CODE_SYNTAX_ROLES, CODE_STATE_ROLES, CODE_TYPOGRAPHY, CODE_LIGHT, CODE_DARK } from '../src/lib/codeTheme';
import { FONT_STACK, TYPE, contrastRatio, CONTRAST_FLOOR } from '../src/lib/designTokens';
import theme from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';

// ATENÇÃO ao padrão da casa: o componente é .tsx e o tsconfig de tests/ não
// liga `jsx` — por isso a importação é DINÂMICA por URL (mesma técnica de
// tests/lessonSidebarHeader.test.ts e tests/quizOverlayRender.test.ts).
const CODEBLOCK_MODULE = new URL('../src/components/markdown/CodeBlock.tsx', import.meta.url).href;

/** Props do CodeBlock (contrato local — o tipo real vive no .tsx). */
type CodeBlockProps = { code: string; lang: string; visibleLines?: number };

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
    // Ela é a PRIMEIRA família que este bundle resolve de verdade. À frente
    // dela só podem estar nomes de SISTEMA — `'SF Mono'` (a fonte de código da
    // Apple, que só existe na plataforma dela) e `ui-monospace`. Qualquer outra
    // família empacotada na frente roubaria o carregamento dela.
    const before = FONT_STACK.mono
      .split(',')
      .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
      .slice(
        0,
        FONT_STACK.mono
          .split(',')
          .findIndex((f) => f.trim().replace(/^['"]|['"]$/g, '') === 'JetBrains Mono Variable'),
      );
    for (const family of before) {
      assert.ok(
        family === 'SF Mono' || family === 'ui-monospace',
        `FONT_STACK.mono tem '${family}' antes da família empacotada: ` +
          `"${FONT_STACK.mono}". Só nomes de SISTEMA podem vir antes dela.`,
      );
    }
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

  it('ONDA-CODIGO-EDITOR: os 5 papéis de ESTADO (saída) também passam 4,5:1 sobre o well', () => {
    // A saída do computador passou a ser pintada (pedido do dono "com highlight
    // para ate o output") — logo os papéis de estado entram no MESMO piso de
    // contraste da sintaxe. Medidos: 5,37–5,43 (claro) e 6,07–6,09 (escuro).
    for (const palette of [CODE_LIGHT, CODE_DARK]) {
      for (const role of CODE_STATE_ROLES) {
        const ratio = contrastRatio(palette.state[role], palette.chrome.surface);
        assert.ok(
          ratio >= CONTRAST_FLOOR.bodyAA,
          `${palette.scheme}/${role}: ${ratio.toFixed(3)}:1 sobre ${palette.chrome.surface}`,
        );
      }
    }
    const block = CODE_FILES.find((f) => f.path === 'src/components/markdown/CodeBlock.tsx');
    assert.ok(block?.code.includes('CODE_STATE_ROLES'), 'o bloco pinta os DOIS vocabulários');
    assert.ok(block?.code.includes('highlightOutputLines'), 'a saída vai pelo caminho de estado');
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

  // ONDA11 — o dono mandou a REFERÊNCIA de chat e ela é CHAPADA (balão cinza
  // neutro, acento lavado, raio uniforme, zero brilho). As duas guardas abaixo
  // travavam o traço ANTERIOR — cauda de 8px no raio e sombra colorida nas
  // fórmulas do tema — e foram reescritas para o traço novo. O que a cor
  // significa AGORA (e o contraste que ela produz) é medido em
  // tests/chatBubbleSurface.test.ts, contra o componente renderizado.

  it('o raio da bolha vem de SHAPE e é UNIFORME (a cauda apontava para o avatar que saiu)', () => {
    const surfaces = CODE_FILES.find((f) => f.path === 'src/components/chat/chatSurfaces.tsx');
    assert.ok(surfaces);
    assert.ok(surfaces.code.includes('SHAPE.lg'));
    const chat = CODE_FILES.filter((f) => f.path.startsWith('src/components/chat/'));
    for (const file of chat) {
      assert.equal(file.code.includes('16px 16px 4px 16px'), false, file.path);
      // Um raio com ESPAÇO é raio por canto: a cauda voltando pela porta dos
      // fundos. O balão da referência tem o mesmo canto nos quatro lados.
      assert.equal(/borderRadius:\s*`[^`]*\s[^`]*`/.test(file.code), false, file.path);
    }
  });

  it('o balão é CHAPADO: 2px de borda em todo tom, e nenhuma sombra colorida', () => {
    const surfaces = CODE_FILES.find((f) => f.path === 'src/components/chat/chatSurfaces.tsx');
    assert.ok(surfaces);
    // A borda continua em TODO tom (só é `transparent` nos tons quietos):
    // sem ela, a caixa encolheria 4px em cada eixo conforme o turno.
    assert.ok(surfaces.code.includes('2px solid'));
    assert.ok(surfaces.code.includes("BUBBLE_FLAT_SHADOW = '0 0 0 0 transparent'"));
    // As fórmulas de sombra colorida do tema (40% = MuiButton contained, 25% =
    // MuiPaper selected) não podem voltar para o balão: era exatamente o
    // "brilho roxo" que o dono apontou na bolha de resposta e no card do quiz.
    const chat = CODE_FILES.filter((f) => f.path.startsWith('src/components/chat/'));
    for (const file of chat) {
      assert.equal(file.code.includes('40%, transparent'), false, file.path);
      assert.equal(file.code.includes('25%, transparent'), false, file.path);
    }
  });
});

/* ═══════════ guarda 6 — ONDA-CODIGO-EDITOR: o GUTTER (SSR de verdade) ═════ */

describe('guarda 6 — o bloco parece um editor: gutter, cópia e sinais de forma', () => {
  /** O CodeBlock REAL, carregado dinamicamente no `before` (ver CODEBLOCK_MODULE). */
  let CodeBlock: ComponentType<CodeBlockProps>;

  before(async () => {
    process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
    await i18next.use(initReactI18next).init({
      lng: 'pt-BR',
      // A MESMA opção de interpolação da produção (src/i18n/index.ts).
      interpolation: { escapeValue: false },
      resources: { 'pt-BR': { translation: ptBR } },
    });
    const mod = (await import(CODEBLOCK_MODULE)) as { CodeBlock: ComponentType<CodeBlockProps> };
    CodeBlock = mod.CodeBlock;
  });

  /** O CodeBlock REAL, com tema real — o mesmo molde de chatBubbleWidth. */
  function renderBlock(props: CodeBlockProps): string {
    return renderToStaticMarkup(
      createElement(ThemeProvider, { theme }, createElement(CodeBlock, props)),
    );
  }

  it('o gutter existe, é ADORNO (aria-hidden + user-select:none) e traz 1 número por linha, fora do <code>', () => {
    const html = renderBlock({ code: 'int a;\nint b;\nint c;', lang: 'c' });
    assert.ok(html.includes('aria-hidden="true"'), 'os números não podem ir para o leitor de ecrã');
    assert.ok(html.includes('user-select:none'), 'copiar tem de levar SÓ o código');
    assert.ok(html.includes('font-variant-numeric:tabular-nums'), 'dígitos de largura constante (editor)');
    const codeAt = html.indexOf('<code>');
    assert.notEqual(codeAt, -1, 'o <code> precisa existir');
    // Os números vivem ANTES do <code> (coluna própria) — nunca dentro do fluxo
    // de texto copiável.
    const gutter = html.slice(0, codeAt);
    for (const n of ['>1<', '>2<', '>3<']) {
      assert.ok(gutter.includes(n), `falta o número ${n} no gutter`);
    }
    assert.equal(gutter.includes('>4<'), false, 'não existe número para a linha 4');
  });

  it('o typewriter esconde o número JUNTO com a linha (visibleLines reserva a altura)', () => {
    const html = renderBlock({ code: 'a\nb\nc', lang: 'text', visibleLines: 1 });
    // A linha 1 está visível; as linhas 2–3 e os números 2–3 ficam
    // `visibility:hidden` — a caixa tem a altura final desde o 1º quadro.
    assert.match(html, /<span style="display:block">1<\/span>/, 'o número 1 nasce visível');
    assert.match(html, /<span style="display:block;visibility:hidden">2<\/span>/, 'o número 2 some com a linha 2');
    assert.match(html, /<span style="display:block;visibility:hidden">3<\/span>/, 'o número 3 some com a linha 3');
    assert.equal((html.match(/visibility:hidden/g) ?? []).length, 4, '2 números + 2 linhas ainda não reveladas');
  });

  /* ── Finding-2 da auditoria uxui: "Copiar" em 1 clique ────────────────── */

  it('o cabeçalho tem o botão "Copiar" (aria-label i18n) em TODAS as caixas', () => {
    const entrada = renderBlock({ code: 'int a;', lang: 'c' });
    const saida = renderBlock({ code: 'ola', lang: 'text' });
    for (const html of [entrada, saida]) {
      assert.match(
        html,
        new RegExp(`<button[^>]*aria-label="${ptBR.common.copyCode}"`),
        'o botão Copiar nasce com o nome acessível certo',
      );
      assert.ok(html.includes(ptBR.common.copyCode), 'o rótulo visível é o mesmo do aria-label');
    }
  });

  it('a cópia leva o `code` CRU (sem números de linha) e confirma "Copiado ✓" por ~2s', () => {
    const block = CODE_FILES.find((f) => f.path === 'src/components/markdown/CodeBlock.tsx');
    assert.ok(block);
    assert.ok(
      block.code.includes('copyTextToClipboard(code)'),
      'o botão copia o code cru — o gutter (aria-hidden/user-select:none) e o prompt nunca entram',
    );
    assert.ok(block.code.includes('COPIED_HOLD_MS'), 'a confirmação tem duração nomeada, não um número solto');
    assert.ok(block.code.includes('translation:common.copiedCode'), 'o estado copiado mostra "Copiado ✓"');
    assert.ok(block.code.includes('clearTimeout'), 'o timeout de "Copiado" é limpo no desmonte');
  });

  /* ── Finding-1 da auditoria uxui: entrada × saída por SINAL DE FORMA ──── */

  it('a SAÍDA tem moldura tracejada e prefixo de terminal; a ENTRADA não tem nenhuma', () => {
    const entrada = renderBlock({ code: 'int a;', lang: 'c' });
    const saida = renderBlock({ code: 'ola, tela!', lang: 'text' });
    // Forma, não cor: o tracejado sobrevive a daltonismo, a percorrer rápido e
    // a impressão a preto (a cor do fio e o chip são sinais A MAIS).
    assert.ok(!entrada.includes('dashed'), 'a caixa de entrada é de moldura SÓLIDA');
    assert.ok(saida.includes('dashed'), 'a caixa de saída é de moldura TRACEJADA');
    // O prefixo de terminal (❯) é ADORNO: fora do leitor de ecrã e da cópia.
    assert.ok(!entrada.includes('❯'), 'a entrada não ganha prefixo de terminal');
    assert.ok(saida.includes('❯'), 'a saída traz o prefixo de terminal na primeira linha');
    assert.match(saida, /aria-hidden="true"[^>]*>\s*❯/, 'o prefixo é decorativo (aria-hidden)');
    assert.ok(saida.includes('user-select:none'), 'o prefixo não entra na seleção/copiado manual');
  });

  it('os ícones de tipo (terminal × código) são decorativos e vêm do MUI', () => {
    const block = CODE_FILES.find((f) => f.path === 'src/components/markdown/CodeBlock.tsx');
    assert.ok(block);
    assert.ok(block.code.includes('TerminalRoundedIcon'), 'a saída leva o ícone de terminal');
    assert.ok(block.code.includes('CodeRoundedIcon'), 'a entrada leva o ícone de código');
    assert.ok(
      block.code.includes('aria-hidden="true"'),
      'os ícones são adorno — o nome acessível da caixa continua a ser o rótulo',
    );
  });
});
