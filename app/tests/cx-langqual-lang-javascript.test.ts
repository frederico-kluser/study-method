/**
 * tests/cx-langqual-lang-javascript.test.ts — CARACTERIZAÇÃO (golden master)
 * do adaptador de JavaScript (`engine/lang/javascript.ts`). Rede de segurança
 * para a refatoração das ondas seguintes.
 *
 * Contratos que mordem aqui:
 *   1. `jsParse` (compilador TypeScript embutido) é SÍNCRONO e FAIL-CLOSED:
 *      erro de sintaxe vira `PARSE_ERROR` com o PRIMEIRO diagnóstico em
 *      linha/coluna 1-based — nunca exceção; `root` é PREGUIÇOSO (getter
 *      memoizado) e `native` é o `ts.SourceFile`;
 *   2. `jsKindName` prefere o nome CANÔNICO ao marcador de faixa
 *      (`NumericLiteral`, nunca `FirstLiteralToken`) — a armadilha do enum
 *      reverso do `ts.SyntaxKind`; `jsInventory` é o enum fechado canônico
 *      (sem `First*`/`Last*`, ordenado);
 *   3. `jsResolveScopes` é PLANO com limite declarado: propriedade
 *      (`a.prop`) e nome de import não são referência de valor; o que sobra é
 *      `free`, e `free ∩ globals()` é o global de runtime usado;
 *   4. A DUPLA-IGUALDADE anti-forja: `jsCountDeclared` conta `test(…)` por AST
 *      (comentário não conta; `test.skip`/`test.only` contam); `jsCountRun`
 *      lhe o ÚLTIMO bloco `ℹ tests N` (resumo forjado no início perde para o
 *      real, que sai por último) e `jsParseChecks` só lê ANTES do resumo (o
 *      reprime de `✖ failing tests:` não duplica checks) e filtra os nomes
 *      sintéticos de falha de load;
 *   5. `exitCodeMeaning` é honesta (137 = "timeout-ou-OOM", nunca afirmar
 *      qual) e `JS_ENV_SCRUB` reproduz o `buildChildEnv` vigente (denylist:
 *      NODE_TEST_CONTEXT primeiro — herdado, faz o node:test do filho sair 0
 *      sem rodar nada).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

import {
  JS_SAFE_FILE_PATH_RE,
  JS_TEST_COMMAND,
  JS_FORBIDDEN_INVARIANTS,
  JS_ENV_SCRUB,
  exitCodeMeaning,
  JS_FAILURE_POLICY,
  jsLayout,
  jsGlobals,
  jsBuiltins,
  jsKindName,
  jsViewNode,
  jsParse,
  jsConstructKey,
  jsInventory,
  jsResolveScopes,
  jsCountDeclared,
  jsCountRun,
  jsParseChecks,
  jsNodeBinary,
  jsDetect,
  JS_THEORY_FENCE_TAGS,
  JS_CHALLENGE_LANGUAGES,
  javascriptAdapter,
} from '../electron/main/engine/lang/javascript';
import type { LangNode, ParseOk } from '../electron/main/engine/lang/registry';

function no(type: string, attributes: Record<string, string> = {}): LangNode {
  return { type, line: 1, column: 1, start: 0, end: 0, text: '', attributes, children: [] };
}

describe('js — (0) identidade e constantes do contrato', () => {
  it('regex de caminho seguro, testCommand e proibições globais são os pinados', () => {
    assert.deepEqual([...JS_TEST_COMMAND], ['--test', '--test-reporter=spec', 'test.mjs']);
    assert.deepEqual(
      [...JS_FORBIDDEN_INVARIANTS],
      [
        'global:eval',
        'global:Function',
        'node:WithStatement',
        'node:DebuggerStatement',
        'node:LabeledStatement',
        'node:CommaListExpression',
        'global:arguments',
        'node:ComputedNonLiteralAccess',
      ],
    );
    assert.ok(JS_SAFE_FILE_PATH_RE.test('solution.mjs'));
    assert.ok(JS_SAFE_FILE_PATH_RE.test('pasta/arquivo.mjs'));
    assert.ok(!JS_SAFE_FILE_PATH_RE.test('../fuga.mjs'));
    assert.ok(!JS_SAFE_FILE_PATH_RE.test('arquivo.js'), 'travado em .mjs por decisão');
    assert.ok(!JS_SAFE_FILE_PATH_RE.test('a b.mjs'));
  });

  it('identidade do adaptador: label, tags, tokens (nodejs é o RUNTIME)', () => {
    assert.equal(javascriptAdapter.id, 'javascript');
    assert.equal(javascriptAdapter.label, 'JavaScript');
    assert.deepEqual([...JS_THEORY_FENCE_TAGS], ['js', 'javascript', 'mjs', 'cjs', 'node', 'jsx']);
    assert.deepEqual([...JS_CHALLENGE_LANGUAGES], ['javascript', 'nodejs']);
    assert.equal(javascriptAdapter.defaultRuntime, 'nodejs');
  });

  it('JS_ENV_SCRUB: denylist VIGENTE do buildChildEnv — NODE_TEST_CONTEXT primeiro, proxies e NODE_OPTIONS fora', () => {
    assert.deepEqual(JS_ENV_SCRUB.allow, ['npm_node_execpath']);
    assert.deepEqual(JS_ENV_SCRUB.fixed, { NO_PROXY: '*', no_proxy: '*' });
    assert.equal(JS_ENV_SCRUB.strip[0], 'NODE_TEST_CONTEXT', 'a armadilha medida é a PRIMEIRA da lista');
    for (const veneno of [
      'HTTP_PROXY',
      'http_proxy',
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'FORCE_COLOR',
      'NODE_OPTIONS',
    ]) {
      assert.ok(JS_ENV_SCRUB.strip.includes(veneno), `strip tem de levar ${veneno}`);
    }
    for (const nome of JS_ENV_SCRUB.strip) {
      assert.ok(!(nome in JS_ENV_SCRUB.fixed), 'fixed e strip nunca se sobrepõem');
    }
    assert.ok(JS_ENV_SCRUB.scope.some((s) => s.startsWith('LIMITE:')), 'os limites são declarados, não escondidos');
  });
});

describe('js — (1) exitCodeMeaning e FailurePolicy', () => {
  it('exitCodeMeaning é HONESTA: 137 é timeout-OU-OOM (nunca afirmar qual); o resto é literal', () => {
    assert.equal(exitCodeMeaning(137), 'timeout-ou-OOM');
    assert.equal(exitCodeMeaning(0), 'exit 0');
    assert.equal(exitCodeMeaning(42), 'exit 42');
    assert.equal(exitCodeMeaning(-1), 'exit -1');
    assert.strictEqual(JS_FAILURE_POLICY.meaning, exitCodeMeaning, 'a policy DELEGA para a função pública');
    assert.equal(JS_FAILURE_POLICY.isFailure(0), false);
    assert.equal(JS_FAILURE_POLICY.isFailure(1), true);
    assert.equal(JS_FAILURE_POLICY.successRequiresCountMatch, true);
  });
});

describe('js — (2) layout (package.json {type:module} + solution.mjs + test.mjs)', () => {
  it('layout de arquivo único: manifesto, solução e teste, na ordem de escrita', () => {
    const l = jsLayout({ code: 'export const x = 1;', testsCode: "test('a', () => {});" });
    assert.deepEqual(l.files.map((f) => f.path), ['package.json', 'solution.mjs', 'test.mjs']);
    assert.equal(l.files[0].content, '{"type":"module"}');
    assert.equal(l.files[1].content, 'export const x = 1;');
    assert.equal(l.files[2].content, "test('a', () => {});");
    assert.equal(l.entryPath, 'solution.mjs');
    assert.equal(l.testPath, 'test.mjs');
    assert.equal(l.manifestPath, 'package.json');
  });

  it('layout multi-arquivo: files VERBATIM, sem solution.mjs implícito', () => {
    const l = jsLayout({
      code: 'ignorado',
      files: [
        { path: 'solution.mjs', code: 'a' },
        { path: 'util.mjs', code: 'b' },
      ],
      testsCode: 'c',
    });
    assert.deepEqual(l.files.map((f) => f.path), ['package.json', 'solution.mjs', 'util.mjs', 'test.mjs']);
  });
});

describe('js — (3) globais/builtins lidos da máquina e nomes CANÔNICOS de kind', () => {
  it('globais são lidos de globalThis + as palavras da linguagem; memo idêntico; builtins COINCIDEM', () => {
    const g = jsGlobals();
    for (const nome of ['undefined', 'NaN', 'Infinity', 'arguments', 'eval', 'console', 'JSON']) {
      assert.ok(g.has(nome), `global ausente: ${nome}`);
    }
    assert.strictEqual(jsGlobals(), g, 'memo: mesma instância');
    assert.strictEqual(jsBuiltins(), g, 'em JS os dois conjuntos coincidem');
  });

  it('jsKindName prefere o nome canônico ao marcador de faixa (a armadilha do enum reverso)', () => {
    assert.equal(jsKindName(ts.SyntaxKind.NumericLiteral), 'NumericLiteral', 'NUNCA FirstLiteralToken');
    assert.equal(jsKindName(ts.SyntaxKind.VariableDeclarationList), 'VariableDeclarationList');
    assert.equal(jsKindName(999999), '999999', 'kind desconhecido vira o próprio número em string');
  });

  it('jsInventory é o enum FECHADO canônico: sem First*/Last*, ordenado, com os kinds reais', () => {
    const inv = jsInventory();
    for (const esperado of ['NumericLiteral', 'CallExpression', 'VariableDeclarationList', 'SourceFile']) {
      assert.ok(inv.includes(esperado), `inventário sem ${esperado}`);
    }
    for (const nome of inv) {
      assert.ok(!nome.startsWith('First') && !nome.startsWith('Last'), `marcador de faixa no inventário: ${nome}`);
    }
    assert.deepEqual([...inv], [...inv].sort(), 'ordem estável');
    assert.strictEqual(jsInventory(), inv, 'memo: mesma instância');
  });
});

describe('js — (4) parse: fail-closed, root PREGUIÇOSO e a vista de nó', () => {
  it('parseia JS real: SourceFile, offsets no source, 1-based', () => {
    const fonte = 'export function resposta() {\n  return 7;\n}\n';
    const r = jsParse(fonte);
    assert.ok(r.ok);
    assert.equal(r.source, fonte);
    const root = (r as ParseOk).root;
    assert.equal(root.type, 'SourceFile');
    const fn = root.children.find((c) => c.type === 'FunctionDeclaration');
    assert.ok(fn, 'FunctionDeclaration não encontrado');
    assert.equal(fn.line, 1);
    assert.equal(fn.attributes.name, undefined, 'o name SÓ vive no nó Identifier (atributosDoNo)');
    const nome = fn.children.find((c) => c.type === 'Identifier');
    assert.deepEqual(nome?.attributes, { name: 'resposta' });
    assert.equal(fonte.slice(fn.start, fn.end), fn.text);
  });

  it('fonte QUEBRADO vira PARSE_ERROR com o primeiro diagnóstico do TS (nunca exceção)', () => {
    const r = jsParse('function f( {\n');
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.match(r.error.message, /expected/i);
    assert.ok(r.error.line >= 1 && r.error.column >= 1, 'linha/coluna 1-based');
  });

  it('root é PREGUIÇOSO e MEMOIZADO: duas leituras do getter dão a MESMA instância', () => {
    const r = jsParse('let a = 1;\n');
    assert.ok(r.ok);
    const o1 = (r as ParseOk).root;
    const o2 = (r as ParseOk).root;
    assert.strictEqual(o1, o2, 'getter memoizado');
  });

  it('jsViewNode expõe um ts.Node como LangNode (ponte para constructKey) — mesmo shape da normalização', () => {
    const fonte = 'const x = 1 + 2;\n';
    const r = jsParse(fonte);
    assert.ok(r.ok);
    const raiz = (r as ParseOk).root;
    const filhoNativo = raiz.children[0].native;
    const vista = jsViewNode(filhoNativo, r.native);
    assert.equal(vista.type, raiz.children[0].type);
    assert.equal(vista.line, 1);
    assert.equal(vista.text, raiz.children[0].text);
    assert.deepEqual(vista.attributes, raiz.children[0].attributes);
    assert.equal(vista.synthetic, undefined, 'JS/TS não cria nó portador — synthetic fica undefined');
    assert.equal(vista.children.length, raiz.children[0].children.length);
  });

  it('fonte VAZIO parseia sem erro (gramática livre — quem reprova é o orçamento)', () => {
    assert.equal(jsParse('').ok, true);
  });
});

describe('js — (5) escopo PLANO (limite declarado) e a chave de orçamento', () => {
  it('propriedade e nome de import não são referência de valor; o que sobra é free', () => {
    const fonte = [
      "import { eco } from './solution.mjs';",
      'const util = 1;',
      'function f(a) { return a + eco(1) + Math.floor(2) + propriedade.x; }',
      'class C {}',
      '',
    ].join('\n');
    const r = jsParse(fonte);
    assert.ok(r.ok);
    const sc = jsResolveScopes(r as ParseOk);
    assert.deepEqual([...sc.declared].sort(), ['C', 'a', 'eco', 'f', 'util']);
    assert.deepEqual([...sc.imported], ['eco']);
    assert.ok(sc.free.has('Math'), 'Math é referência de valor (o objeto, não o .floor)');
    assert.ok(sc.free.has('propriedade'));
    assert.ok(!sc.free.has('floor'), 'nome de propriedade NÃO é referência de valor');
    assert.ok(!sc.free.has('x'), 'nome de propriedade NÃO é referência de valor');
    assert.deepEqual([...sc.globals], ['Math'], 'free ∩ globals()');
  });

  it('constructKey: op: tem precedência; decl: só em VariableDeclarationList; resto é node:', () => {
    assert.equal(
      jsConstructKey(no('BinaryExpression', { operator: '+', operatorFamily: 'binary' })),
      'op:binary:+',
    );
    assert.equal(
      jsConstructKey(no('VariableDeclarationList', { kind: 'const' })),
      'decl:const',
    );
    assert.equal(jsConstructKey(no('IfStatement')), 'node:IfStatement');
    assert.equal(
      jsConstructKey(no('VariableDeclarationList', { kind: 'let', operator: '+', operatorFamily: 'binary' })),
      'op:binary:+',
      'op: vence decl:',
    );
    assert.equal(jsConstructKey(no('Outro', { kind: 'const' })), 'node:Outro', 'decl: exige o tipo exato');
  });
});

describe('js — (6) a dupla-igualdade anti-forja', () => {
  it('countDeclared conta test(…) por AST; test.skip/test.only contam; comentário NÃO', () => {
    const tests = [
      "test('a', () => {});",
      "test.skip('b', () => {});",
      "test.only('c', () => {});",
      "// test('comentado', () => {});",
      "meuTest('não conta', () => {});",
      '',
    ].join('\n');
    assert.equal(jsCountDeclared(tests), 3);
    assert.equal(jsCountDeclared(''), 0);
  });

  it('jsCountRun lê o ÚLTIMO bloco ℹ tests (o resumo forjado no INÍCIO perde para o real)', () => {
    const forjado = 'ℹ tests 9\nℹ pass 9\nℹ fail 0\n';
    const real = 'ℹ tests 3\nℹ pass 2\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 5';
    assert.deepEqual(jsCountRun(forjado + 'algo no meio\n' + real), {
      testsRun: 3,
      pass: 2,
      fail: 1,
      skipped: 0,
    });
  });

  it('jsCountRun: bloco mínimo (tests/pass/fail) também vale; pass/fail/skipped vêm SÓ do bloco; ausente ⇒ 0', () => {
    assert.deepEqual(jsCountRun('ℹ tests 2\nℹ pass 1\nℹ fail 1\n'), { testsRun: 2, pass: 1, fail: 1, skipped: 0 });
    assert.deepEqual(jsCountRun('ℹ tests 5\nℹ pass 5\nℹ fail 0\nℹ skipped 2\n'), {
      testsRun: 5,
      pass: 5,
      fail: 0,
      skipped: 2,
    });
    assert.deepEqual(jsCountRun('ℹ pass 5\nℹ fail 0\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(jsCountRun('ℹ tests 4\n'), { testsRun: 4, pass: 0, fail: 0, skipped: 0 }, 'sem ℹ pass no bloco ⇒ 0 (fail-closed)');
  });

  it('ANSI de cor não derruba o parse do resumo', () => {
    assert.deepEqual(jsCountRun('\u001b[34mℹ tests 3\u001b[39m\n\u001b[32mℹ pass 3\u001b[39m\nℹ fail 0\n'), {
      testsRun: 3,
      pass: 3,
      fail: 0,
      skipped: 0,
    });
  });

  it('jsParseChecks: ✔/✖ por linha, só ANTES do resumo, sem duração, sem sintéticos de load, sem subtests', () => {
    const saida = [
      '✔ caso 1 (0.42175ms)',
      '✖ caso 2 (1.5ms)',
      '  ✔ subtest indentado (0.1ms)',
      'ℹ tests 2',
      'ℹ pass 1',
      'ℹ fail 1',
      '✖ failing tests:',
      '  ✖ caso 2 (reprise que NÃO pode duplicar)',
    ].join('\n');
    assert.deepEqual(jsParseChecks(saida), [
      { name: 'caso 1', passed: true },
      { name: 'caso 2', passed: false },
    ]);
  });

  it('jsParseChecks filtra os nomes SINTÉTICOS de falha de load e o cabeçalho failing tests:', () => {
    const semResumo = ['✖ test.mjs', '✖ test failed', '✖ failing tests:'].join('\n');
    assert.deepEqual(jsParseChecks(semResumo), []);
  });
});

describe('js — (7) detect() sem subprocesso', () => {
  it('em node puro: binary é o execPath, version vem de process.versions, sem degradação', () => {
    assert.equal(jsNodeBinary(), process.execPath);
    const d = jsDetect();
    assert.equal(d.ok, true);
    assert.equal(d.binary, process.execPath);
    assert.equal(d.version, process.versions.node ?? null);
    assert.equal(d.degradacao, null, 'sem Electron não há incerteza a declarar');
  });
});
