/**
 * tests/codeHighlightBridge.test.ts — o chat passou a COLORIR código, e a cor
 * sai da paleta que já existia.
 *
 * DEFEITO: `src/lib/codeTheme.ts` tem 644 linhas, 9 papéis de sintaxe em duas
 * polaridades e o contraste medido contra a SELEÇÃO — e o chat renderizava todo
 * bloco de código como uma caixa cinza chapada. O highlight foi ligado sem
 * NENHUMA dependência nova: `@lezer/highlight` e os `@codemirror/lang-*` já são
 * dependências declaradas (o editor os usa), e aqui a mesma gramática roda
 * direto sobre uma string, sem montar `EditorView` — "withered technology" da
 * §1: peça madura já presente, usada de um jeito novo.
 *
 * ESTA SUÍTE É HEADLESS DE PROPÓSITO. Ela roda em `node:test` puro, sem jsdom:
 * é a prova de que o caminho do highlight não depende de DOM e de que
 * `codeHighlight.ts` continua sendo dado + parser, sem React. Por isso o
 * arquivo está listado em `tsconfig.node.json`.
 *
 * Reprodução:
 *   cd app && bash tools/t.sh tests/codeHighlightBridge.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  codeLabelFor,
  hasHighlightGrammar,
  highlightCodeLines,
  highlightOutputLines,
  type CodeToken,
} from '../src/components/markdown/codeHighlight';
import { CODE_SYNTAX_ROLES } from '../src/lib/codeTheme';
import { codeFenceRole } from '../src/lib/typewriterSegments';

/** Papéis atribuídos a um trecho de código, na ordem em que aparecem. */
function rolesOf(code: string, lang: string): string[] {
  return highlightCodeLines(code, lang)
    .flat()
    .map((t: CodeToken) => t.role)
    .filter((r): r is NonNullable<CodeToken['role']> => r !== null);
}

/** O texto volta INTEIRO — o highlight nunca pode comer um caractere. */
function textOf(code: string, lang: string): string {
  return highlightCodeLines(code, lang)
    .map((line) => line.map((t) => t.text).join(''))
    .join('\n');
}

describe('highlightCodeLines — a primeira linha da AULA 1 sai colorida', () => {
  it('print("oi") em python: função, parênteses e string, cada um no seu papel', () => {
    const [line] = highlightCodeLines('print("oi")', 'python');
    assert.ok(line);
    assert.deepEqual(
      line.map((t) => [t.text, t.role]),
      [
        ['print', 'function'],
        ['(', 'operator'],
        ['"oi"', 'string'],
        [')', 'operator'],
      ],
    );
  });

  it('comentário, palavra-chave e número também têm papel', () => {
    assert.ok(rolesOf('# nota\nif x == 42:\n    pass', 'python').includes('comment'));
    assert.ok(rolesOf('if x == 42:\n    pass', 'python').includes('keyword'));
    assert.ok(rolesOf('x = 42', 'python').includes('number'));
  });

  it('todo papel emitido existe em codeTheme (nenhuma classe órfã)', () => {
    const sample = [
      'import os\n',
      '# comentário\n',
      'class Coisa:\n',
      '    def faz(self, n=3):\n',
      '        texto = "oi"\n',
      '        return texto if n > 1 else None\n',
    ].join('');
    for (const role of rolesOf(sample, 'python')) {
      assert.ok(
        (CODE_SYNTAX_ROLES as readonly string[]).includes(role),
        `papel "${role}" não existe em codeTheme.CODE_SYNTAX_ROLES`,
      );
    }
  });

  it('javascript e json também têm gramática instalada', () => {
    assert.ok(rolesOf('const a = 1; // oi', 'js').includes('keyword'));
    assert.ok(rolesOf('{"a": 1}', 'json').includes('number'));
    for (const lang of ['python', 'py', 'javascript', 'js', 'ts', 'tsx', 'json']) {
      assert.equal(hasHighlightGrammar(lang), true, lang);
    }
  });

  it('rust e rs (tags reais das cercas de teoria) têm gramática DEDICADA', () => {
    // As duas grafias que a engine emite (RS_THEORY_FENCE_TAGS) compartilham o
    // mesmo parser — o CodeBlock chama highlightCodeLines(code, lang) com a tag
    // da cerca, então ambas caem no caminho idêntico do bloco da aula.
    for (const lang of ['rust', 'rs']) {
      assert.equal(hasHighlightGrammar(lang), true, lang);
      const [line] = highlightCodeLines('fn main() { let n: i32 = 42; }', lang);
      assert.ok(line);
      assert.deepEqual(
        line.map((t) => [t.text, t.role]),
        [
          ['fn', 'keyword'],
          [' ', null],
          ['main', 'function'],
          ['(', 'operator'],
          [')', 'operator'],
          [' ', null],
          ['{', 'operator'],
          [' ', null],
          ['let', 'keyword'],
          [' ', null],
          ['n', 'variable'],
          [': ', null],
          ['i32', 'type'],
          [' ', null],
          ['=', 'operator'],
          [' ', null],
          ['42', 'number'],
          [';', 'operator'],
          [' ', null],
          ['}', 'operator'],
        ],
      );
    }
  });
});

describe('o texto nunca é alterado pelo highlight', () => {
  const samples: ReadonlyArray<readonly [string, string]> = [
    ['print("boa noite")', 'python'],
    ['a = 1\n\nb = 2\n', 'python'],
    ['linha só de texto', 'text'],
    ['', 'python'],
    ['   indentação preservada', 'python'],
  ];
  for (const [code, lang] of samples) {
    it(`reconstrói ${JSON.stringify(code.slice(0, 24))} (${lang || 'sem tag'})`, () => {
      assert.equal(textOf(code, lang), code);
    });
  }

  it('o número de linhas casa com o do código (a caixa reserva a altura certa)', () => {
    const code = 'a = 1\n\nb = 2\nc = 3';
    assert.equal(highlightCodeLines(code, 'python').length, code.split('\n').length);
  });
});

describe('degradação DECLARADA — sem gramática, o bloco continua legível', () => {
  it('linguagem desconhecida sai como um único token sem papel', () => {
    assert.equal(hasHighlightGrammar('brainfuck'), false);
    assert.deepEqual(highlightCodeLines('+++[->+<]', 'brainfuck'), [
      [{ text: '+++[->+<]', role: null }],
    ]);
  });

  it('a SAÍDA do computador NUNCA leva papéis de SINTAXE (ela não é código-fonte)', () => {
    // ONDA-CODIGO-EDITOR: a regra mudou de "sem cor" para "cor de ESTADO"
    // (pedido do dono: "com highlight para ate o output, e ficar facil de
    // entender as coisas") — mas a fronteira das DUAS caixas CONTINUA: gramática
    // só em entrada. O caminho antigo (highlightCodeLines com linguagem vazia)
    // continua sem cor; o caminho novo da saída (highlightOutputLines) emite
    // APENAS estado + string/number — nenhum keyword/comment/function/etc.
    assert.equal(codeFenceRole('text'), 'output');
    assert.deepEqual(rolesOf('boa noite', ''), []);
    const permitidos = new Set(['success', 'error', 'warn', 'info', 'muted', 'string', 'number']);
    const saida = highlightOutputLines('Test failed: 2 of 3 (12ms) "x"')
      .flat()
      .map((t: CodeToken) => t.role)
      .filter((r): r is NonNullable<CodeToken['role']> => r !== null);
    assert.ok(saida.length > 0, 'a saída passa a ser pintada (ONDA-CODIGO-EDITOR)');
    for (const r of saida) {
      assert.ok(permitidos.has(r), `papel de sintaxe vazou para a saída: ${r}`);
    }
  });

  it('código PYTHON inválido não lança e não perde texto', () => {
    const quebrado = 'def (: !!! }}';
    assert.equal(textOf(quebrado, 'python'), quebrado);
  });
});

/* ═══════════ ONDA-CODIGO-EDITOR — C/C++ e o highlight da SAÍDA ═══════════ */

describe('C/C++ com gramática dedicada (a trilha c-iniciante deixa de sair cinza)', () => {
  it('c, h, cpp, c++, cc, cxx, hpp têm gramática instalada', () => {
    for (const lang of ['c', 'h', 'cpp', 'c++', 'cc', 'cxx', 'hpp', 'hxx']) {
      assert.equal(hasHighlightGrammar(lang), true, lang);
    }
  });

  it('o bloco C do dono sai colorido: printf é função e a string é string', () => {
    // A captura do dono: printf("ola, tela!\n") em ```c — antes SEM cor nenhuma.
    const [linha] = highlightCodeLines('printf("ola, tela!\\n");', 'c');
    const papeis = linha.map((t: CodeToken) => t.role);
    assert.ok(papeis.includes('function'), `printf sem papel de função: ${JSON.stringify(papeis)}`);
    assert.ok(papeis.includes('string'), `string sem papel: ${JSON.stringify(papeis)}`);
    assert.equal(
      linha.map((t) => t.text).join(''),
      'printf("ola, tela!\\n");',
      'o texto nunca muda',
    );
  });

  it('int/return/constantes de C também têm papel (a gramática é a do editor)', () => {
    const roles = highlightCodeLines('int main(void) { return 0; }', 'cpp')
      .flat()
      .map((t: CodeToken) => t.role);
    assert.ok(roles.includes('keyword'), 'int/return são keyword');
    assert.ok(roles.includes('number'), '0 é number');
  });

  it('o chip do bloco mostra o NOME da linguagem, não a tag crua da cerca', () => {
    // A tag da cerca é apelido de markdown (`c`, `py`, `mjs`) — o dono chamou
    // ao bloco "confuso" e o chip era parte disso. Nome canónico ou nada.
    assert.equal(codeLabelFor('c'), 'C');
    assert.equal(codeLabelFor('py'), 'Python');
    assert.equal(codeLabelFor('mjs'), 'JavaScript');
    assert.equal(codeLabelFor('cpp'), 'C++');
    assert.equal(codeLabelFor('rs'), 'Rust');
    assert.equal(codeLabelFor(''), null, 'tag vazia: o fallback é do bloco');
    assert.equal(codeLabelFor('brainfuck'), null, 'desconhecida não ganha nome inventado');
  });
});

describe('highlightOutputLines — a SAÍDA do computador fala por estado', () => {
  /** Papéis de um trecho de saída, na ordem. */
  function outRoles(code: string): string[] {
    return highlightOutputLines(code)
      .flat()
      .map((t: CodeToken) => t.role)
      .filter((r): r is NonNullable<CodeToken['role']> => r !== null);
  }

  /** A saída reconstrói por inteiro — o highlight nunca come caractere. */
  function outText(code: string): string {
    return highlightOutputLines(code)
      .map((line) => line.map((t) => t.text).join(''))
      .join('\n');
  }

  it('símbolos ✓ ✗ ⚠ mandam no resultado: success/error/warn', () => {
    assert.ok(outRoles('✓ passed').includes('success'));
    assert.ok(outRoles('✗ failed').includes('error'));
    assert.ok(outRoles('⚠ warning').includes('warn'));
  });

  it('palavras de estado (pass/fail/error/ok/sucesso) pintam na cor certa', () => {
    assert.ok(outRoles('2 tests passed').includes('success'));
    assert.ok(outRoles('FAIL tests/validate.sh').includes('error'));
    assert.ok(outRoles('AssertionError: timeout').includes('error'));
    assert.ok(outRoles('ok').includes('success'));
    assert.ok(outRoles('aprovado').includes('success'));
  });

  it('valores citados (string), contagens (number) e durações (muted)', () => {
    const roles = outRoles('esperado "bom dia" mas veio 3 em 12ms');
    assert.ok(roles.includes('string'), 'aspas = valor citado');
    assert.ok(roles.includes('number'), 'contagem');
    assert.ok(roles.includes('muted'), 'duração é contexto, não resultado');
  });

  it('reconstrói o texto por inteiro e linhas vazias ficam VAZIAS', () => {
    const saida = '✓ 2 passed\n\n✗ 1 failed: esperado "x"';
    assert.equal(outText(saida), saida);
    assert.deepEqual(highlightOutputLines(saida)[1], [], 'a linha vazia não ganha tokens');
    assert.equal(highlightOutputLines(saida).length, saida.split('\n').length);
    assert.equal(outText(''), '');
  });
});
