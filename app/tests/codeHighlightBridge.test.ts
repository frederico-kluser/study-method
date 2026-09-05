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
  hasHighlightGrammar,
  highlightCodeLines,
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

  it('a SAÍDA do computador nunca é colorida (não é código-fonte)', () => {
    // `codeFenceRole` decide, e o CodeBlock passa '' como linguagem nesse caso.
    assert.equal(codeFenceRole('text'), 'output');
    assert.deepEqual(rolesOf('boa noite', ''), []);
  });

  it('código PYTHON inválido não lança e não perde texto', () => {
    const quebrado = 'def (: !!! }}';
    assert.equal(textOf(quebrado, 'python'), quebrado);
  });
});
