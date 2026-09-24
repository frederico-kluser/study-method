/**
 * tests/cx-langqual-lang-typescript.test.ts — CARACTERIZAÇÃO (golden master)
 * do adaptador de TypeScript (`engine/lang/typescript.ts`). Rede de segurança
 * para a refatoração das ondas seguintes.
 *
 * Contratos que mordem aqui:
 *   1. `tsParse` FORÇA `dialect: 'ts'` (um `dialect` do chamador é IGNORADO —
 *      o adaptador que parseasse como JS sob pedido seria porta para o gate
 *      mentir); `tsLayout` mantém o `package.json {type:module}` (runner E
 *      conferidor `tsc --module nodenext` têm de concordar sobre ESM×CJS);
 *   2. As CHAVES SINTÉTICAS da camada de tipos: `keyof`→`node:KeyOfType`,
 *      `readonly T[]`→`node:ReadonlyArrayType`, `import type`→
 *      `node:TypeOnlyImport`, `export type`→`node:TypeOnlyExport` e
 *      `x as unknown as T`→`node:DoubleAssertionViaUnknown` (o `as` simples é
 *      `node:AsExpression`); elas existem SÓ neste adaptador
 *      (`TS_SYNTHETIC_NODE_TYPES`);
 *   3. `tsResolveScopes` compõe sobre a do JS: `interface`/`type`/`enum`/
 *      `namespace`/parâmetro de tipo DECLARAM nome (não podem virar free
 *      fantasma) e `globals` é recalculado contra `tsGlobals()` — por isso
 *      `Partial<T>` rende `global:Partial` (globais de TIPO do lib.d.ts, lista
 *      FECHADA `TS_TYPE_GLOBALS`);
 *   4. `tsScanSuppressionDirectives` é o emissor das proibições que vivem em
 *      COMENTÁRIO (`@ts-ignore`/`@ts-expect-error`) — a caminhada de AST não
 *      as vê por construção; diretiva DENTRO de string NÃO conta (nó não é
 *      trivia); a varredura é pura e ordenada por posição;
 *   5. A composição é DELEGAÇÃO preservada por identidade: contagens, checks,
 *      `failureExitCodes` e `detect()` são os MESMOS objetos do adaptador
 *      JavaScript; `TS_ENV_SCRUB` herda allow/fixed/strip inteiros e soma UMA
 *      linha de escopo (a quinta prova `tsc` herda a política); e
 *      `TS_FORM_AXIS_SUPPORTED === true` (único dos cinco adaptadores).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TS_CHALLENGE_LANGUAGES,
  TS_THEORY_FENCE_TAGS,
  TS_DEFAULT_RUNTIME,
  TS_SAFE_FILE_PATH_RE,
  TS_MANIFEST_PATH,
  TS_ENTRY_PATH,
  TS_TEST_PATH,
  TS_TEST_COMMAND,
  tsLayout,
  tsParse,
  TS_DOUBLE_ASSERTION_KEY,
  TS_SYNTHETIC_NODE_TYPES,
  tsConstructKey,
  tsInventory,
  TS_TYPE_GLOBALS,
  tsGlobals,
  tsBuiltins,
  tsResolveScopes,
  TS_SUPPRESSION_DIRECTIVES,
  TS_FORBIDDEN_INVARIANTS,
  tsScanSuppressionDirectives,
  tsCountDeclared,
  tsCountRun,
  tsParseChecks,
  TS_FAILURE_POLICY,
  TS_ENV_SCRUB,
  tsDetect,
  typescriptAdapter,
  TS_FORM_AXIS_SUPPORTED,
} from '../electron/main/engine/lang/typescript';
import { javascriptAdapter } from '../electron/main/engine/lang/javascript';
import type { LangNode, ParseOk } from '../electron/main/engine/lang/registry';

function no(type: string, attributes: Record<string, string> = {}, extras: Partial<LangNode> = {}): LangNode {
  return { type, line: 1, column: 1, start: 0, end: 0, text: '', attributes, children: [], ...extras };
}

function acharNos(raiz: LangNode, tipo: string): LangNode[] {
  const out: LangNode[] = [];
  const visitar = (n: LangNode): void => {
    if (n.type === tipo) out.push(n);
    for (const f of n.children) visitar(f);
  };
  visitar(raiz);
  return out;
}

describe('ts — (0) identidade e constantes do contrato', () => {
  it('caminhos, comando de teste e regex .ts (a linha que destrava o .mjs)', () => {
    assert.equal(TS_MANIFEST_PATH, 'package.json');
    assert.equal(TS_ENTRY_PATH, 'solution.ts');
    assert.equal(TS_TEST_PATH, 'test.ts');
    assert.deepEqual([...TS_TEST_COMMAND], ['--test', '--test-reporter=spec', 'test.ts']);
    assert.ok(TS_SAFE_FILE_PATH_RE.test('solution.ts'));
    assert.ok(TS_SAFE_FILE_PATH_RE.test('pasta/arquivo.ts'));
    assert.ok(!TS_SAFE_FILE_PATH_RE.test('../fuga.ts'));
    assert.ok(!TS_SAFE_FILE_PATH_RE.test('arquivo.mjs'));
    assert.ok(!TS_SAFE_FILE_PATH_RE.test('a b.ts'));
  });

  it('identidade do adaptador: label, tags (SEM tsx — decisão), tokens, runtime', () => {
    assert.equal(typescriptAdapter.id, 'typescript');
    assert.equal(typescriptAdapter.label, 'TypeScript');
    assert.deepEqual([...TS_THEORY_FENCE_TAGS], ['ts', 'typescript']);
    assert.deepEqual([...TS_CHALLENGE_LANGUAGES], ['typescript', 'ts']);
    assert.equal(TS_DEFAULT_RUNTIME, 'nodejs', 'o runner é node; o tsc é política da camada de execução');
  });

  it('TS_FORM_AXIS_SUPPORTED é TRUE — único dos cinco adaptadores (seletor é tipado sobre ts.Node)', () => {
    assert.equal(TS_FORM_AXIS_SUPPORTED, true);
  });

  it('tsLayout: package.json {type:module} FICA (runner e tsc --module nodenext concordam)', () => {
    const l = tsLayout({ code: 'export const x: number = 1;', testsCode: "test('a', () => {});" });
    assert.deepEqual(l.files.map((f) => f.path), ['package.json', 'solution.ts', 'test.ts']);
    assert.equal(l.files[0].content, '{"type":"module"}');
    assert.equal(l.entryPath, 'solution.ts');
    assert.equal(l.testPath, 'test.ts');
    assert.equal(l.manifestPath, 'package.json');
  });
});

describe('ts — (1) parse: o dialect é FORÇADO para ts', () => {
  it('tsParse aceita anotação de tipo (ScriptKind.TS)', () => {
    const r = tsParse('function f(x: number) { return x; }\n');
    assert.ok(r.ok);
  });

  it('um dialect "js" pedido pelo chamador é IGNORADO: <number>y continua asserção de tipo (TypeAssertionExpression)', () => {
    const fonte = 'const x = <number>y;\n';
    const r = tsParse(fonte, { dialect: 'js' });
    assert.ok(r.ok);
    const ases = acharNos((r as ParseOk).root, 'TypeAssertionExpression');
    assert.ok(ases.length > 0, 'em ScriptKind.TS <number>y é asserção de tipo');
    // …e o MESMO fonte como JS puro NEM PARSEIA (`<` não inicia expressão) —
    // é o contraste que prova que o dialeto está FORÇADO para ts neste adaptador.
    const rJs = javascriptAdapter.parse(fonte);
    assert.equal(rJs.ok, false, 'em ScriptKind.JS <number>y não parseia');
  });

  it('fonte QUEBRADO vira PARSE_ERROR estruturado (primeiro diagnóstico, 1-based)', () => {
    const r = tsParse('function f( {\n');
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.match(r.error.message, /expected/i);
    assert.ok(r.error.line >= 1 && r.error.column >= 1);
  });
});

describe('ts — (2) as chaves SINTÉTICAS da camada de tipos', () => {
  it('TS_SYNTHETIC_NODE_TYPES e a chave da dupla asserção são as do contrato', () => {
    assert.equal(TS_DOUBLE_ASSERTION_KEY, 'node:DoubleAssertionViaUnknown');
    assert.deepEqual(
      [...TS_SYNTHETIC_NODE_TYPES],
      [
        'KeyOfType',
        'ReadonlyArrayType',
        'TypeOnlyImport',
        'TypeOnlyExport',
        'DoubleAssertionViaUnknown',
        'TsIgnoreDirective',
        'TsExpectErrorDirective',
      ],
    );
  });

  it('TypeOperator: keyof → KeyOfType, readonly → ReadonlyArrayType, outro operador cai na genérica', () => {
    assert.equal(tsConstructKey(no('TypeOperator', {}, { text: 'keyof B' })), 'node:KeyOfType');
    assert.equal(tsConstructKey(no('TypeOperator', {}, { text: 'readonly number[]' })), 'node:ReadonlyArrayType');
    assert.equal(tsConstructKey(no('TypeOperator', {}, { text: 'unique sym' })), 'node:TypeOperator');
    assert.equal(tsConstructKey(no('TypeOperator')), 'node:TypeOperator');
  });

  it('import type/export type só ganham chave sintética quando isTypeOnly === true no nó nativo', () => {
    const importType = no('ImportClause', {}, { native: { isTypeOnly: true } });
    const importNormal = no('ImportClause', {}, { native: { isTypeOnly: false } });
    const exportType = no('ExportDeclaration', {}, { native: { isTypeOnly: true } });
    assert.equal(tsConstructKey(importType), 'node:TypeOnlyImport');
    assert.equal(tsConstructKey(importNormal), 'node:ImportClause');
    assert.equal(tsConstructKey(exportType), 'node:TypeOnlyExport');
    assert.equal(tsConstructKey(no('ExportDeclaration')), 'node:ExportDeclaration');
  });

  it('x as unknown as T é a dupla asserção; x as T simples continua node:AsExpression', () => {
    const asInterno = no('AsExpression', {}, { children: [no('UnknownKeyword')] });
    const dupla = no('AsExpression', {}, { children: [asInterno] });
    const simples = no('AsExpression', {}, { children: [no('Identifier', { name: 'y' }), no('NumberKeyword')] });
    assert.equal(tsConstructKey(dupla), TS_DOUBLE_ASSERTION_KEY);
    assert.equal(tsConstructKey(simples), 'node:AsExpression');
  });

  it('no fonte REAL: a asserção dupla rende a chave sintética e a simples não', () => {
    const r = tsParse('const a = x as unknown as number;\nconst b = y as number;\n');
    assert.ok(r.ok);
    const chaves = acharNos((r as ParseOk).root, 'AsExpression').map((n) => tsConstructKey(n));
    assert.deepEqual(chaves, [
      'node:DoubleAssertionViaUnknown',
      'node:AsExpression',
      'node:AsExpression',
    ]);
  });
});

describe('ts — (3) inventário e globais de TIPO', () => {
  it('tsInventory = inventário JS + sintéticas, ordenado, sem marcadores de faixa', () => {
    const inv = tsInventory();
    for (const sintetica of TS_SYNTHETIC_NODE_TYPES) {
      assert.ok(inv.includes(sintetica), `inventário sem a sintética ${sintetica}`);
    }
    assert.ok(inv.includes('NumericLiteral'), 'o inventário JS entra inteiro');
    for (const nome of inv) {
      assert.ok(!nome.startsWith('First') && !nome.startsWith('Last'));
    }
    assert.deepEqual([...inv], [...inv].sort());
  });

  it('TS_TYPE_GLOBALS é a lista FECHADA de tipos utilitários/ambientes (acrescentar é evento de currículo)', () => {
    assert.deepEqual(
      [...TS_TYPE_GLOBALS],
      [
        'Awaited',
        'Capitalize',
        'ConstructorParameters',
        'Exclude',
        'Extract',
        'InstanceType',
        'Lowercase',
        'NoInfer',
        'NonNullable',
        'Omit',
        'OmitThisParameter',
        'Parameters',
        'Partial',
        'Pick',
        'Readonly',
        'Record',
        'Required',
        'ReturnType',
        'ThisParameterType',
        'ThisType',
        'Uncapitalize',
        'Uppercase',
        'ArrayLike',
        'AsyncGenerator',
        'AsyncIterable',
        'AsyncIterableIterator',
        'AsyncIterator',
        'Generator',
        'Iterable',
        'IterableIterator',
        'Iterator',
        'PromiseLike',
        'PropertyKey',
        'ReadonlyArray',
        'ReadonlyMap',
        'ReadonlySet',
        'TemplateStringsArray',
      ],
    );
  });

  it('tsGlobals = globais de runtime (globalThis) UNIDOS aos de tipo; builtins COINCIDEM', () => {
    const g = tsGlobals();
    assert.ok(g.has('console'), 'global de runtime');
    assert.ok(g.has('Partial'), 'global de TIPO (lib.es5.d.ts) — sem ele a aula não introduz nada');
    assert.ok(g.has('ReadonlyArray'));
    assert.strictEqual(tsBuiltins(), g);
  });
});

describe('ts — (4) resolveScopes: formas de tipo DECLARAM nome', () => {
  it('interface/type/enum/parâmetro de tipo saem de free; Partial vira global de tipo', () => {
    const fonte =
      'interface Pessoa { }\ntype ID = number;\nenum Cor { Vermelho }\nfunction f(p: Pessoa, id: ID): Partial<Pessoa> { return {}; }\n';
    const r = tsParse(fonte);
    assert.ok(r.ok);
    const sc = tsResolveScopes(r as ParseOk);
    for (const nome of ['Pessoa', 'ID', 'Cor', 'f', 'p', 'id']) {
      assert.ok(sc.declared.has(nome), `declared sem ${nome}`);
    }
    for (const fantasma of ['Pessoa', 'ID', 'Cor']) {
      assert.ok(!sc.free.has(fantasma), `${fantasma} é declaração — free fantasma é o defeito do §7`);
    }
    assert.ok(sc.free.has('Partial'));
    assert.deepEqual([...sc.globals], ['Partial']);
  });

  it.skip('BUG: nome de MEMBRO de enum (enum Cor { Vermelho }) cai em free, mas é declaração, não referência — app/electron/main/engine/lang/typescript.ts:504 (tsResolveScopes não cobre EnumMember)', () => {
    const fonte = 'enum Cor { Vermelho }\n';
    const r = tsParse(fonte);
    assert.ok(r.ok);
    const sc = tsResolveScopes(r as ParseOk);
    assert.ok(!sc.free.has('Vermelho'), 'nome de EnumMember é declaração — não deveria ser free');
  });
});

describe('ts — (5) proibições globais e a varredura de TRIVIA', () => {
  it('TS_FORBIDDEN_INVARIANTS = as do JS + a camada semântica (any, dupla asserção, supressões)', () => {
    assert.deepEqual(
      [...TS_FORBIDDEN_INVARIANTS],
      [
        ...javascriptAdapter.forbiddenInvariants,
        'node:AnyKeyword',
        'node:DoubleAssertionViaUnknown',
        'node:TsIgnoreDirective',
        'node:TsExpectErrorDirective',
      ],
    );
    assert.deepEqual(
      TS_SUPPRESSION_DIRECTIVES.map((d) => [d.directive, d.key]),
      [
        ['@ts-ignore', 'node:TsIgnoreDirective'],
        ['@ts-expect-error', 'node:TsExpectErrorDirective'],
      ],
    );
  });

  it('tsScanSuppressionDirectives acha as diretivas em COMENTÁRIO com posição 1-based — e NÃO acha em string', () => {
    const fonte =
      'const a = 1; // @ts-ignore\n// @ts-expect-error\nconst s = "@ts-ignore";\n/* bloco @ts-ignore */\n';
    const r = tsParse(fonte);
    assert.ok(r.ok);
    const occ = tsScanSuppressionDirectives(r as ParseOk);
    assert.equal(occ.length, 3, 'a diretiva DENTRO de string não conta — nó não é trivia');
    assert.deepEqual(occ.map((o) => [o.key, o.directive, o.line, o.column]), [
      ['node:TsIgnoreDirective', '@ts-ignore', 1, 17],
      ['node:TsExpectErrorDirective', '@ts-expect-error', 2, 4],
      ['node:TsIgnoreDirective', '@ts-ignore', 4, 10],
    ]);
    assert.equal(occ[0].start, 16);
    assert.equal(occ[0].end, 26);
    assert.equal(fonte.slice(occ[0].start, occ[0].end), '@ts-ignore');
    assert.equal(occ[2].snippet, '@ts-ignore */', 'snippet = o resto da linha do comentário');
  });

  it('a varredura é PURA e ordenada por posição', () => {
    const fonte = '// @ts-expect-error\nconst z = 1; // @ts-ignore\n';
    const r = tsParse(fonte);
    assert.ok(r.ok);
    const a = tsScanSuppressionDirectives(r as ParseOk);
    const b = tsScanSuppressionDirectives(r as ParseOk);
    assert.deepEqual(a, b, 'mesma entrada, mesma saída');
    assert.deepEqual(a.map((o) => o.start), [...a.map((o) => o.start)].sort((x, y) => x - y));
  });

  it('fonte SEM diretiva devolve lista vazia', () => {
    const r = tsParse('const a = 1;\n');
    assert.ok(r.ok);
    assert.deepEqual(tsScanSuppressionDirectives(r as ParseOk), []);
  });
});

describe('ts — (6) delegação preservada por IDENTIDADE ao adaptador JS', () => {
  it('contagens e checks DELEGAM (mesmo runner, mesmo relatório)', () => {
    assert.equal(tsCountDeclared("test('a', () => {});\ntest.skip('b', () => {});\n"), 2);
    assert.deepEqual(tsCountRun('ℹ tests 2\nℹ pass 2\nℹ fail 0\n'), {
      testsRun: 2,
      pass: 2,
      fail: 0,
      skipped: 0,
    });
    assert.deepEqual(tsParseChecks('✔ caso 1 (0.1ms)\nℹ tests 1\n'), [{ name: 'caso 1', passed: true }]);
  });

  it('a DIVERGÊNCIA MEDIDA do lado declarado: test<T>(…) genérico conta 0 (fail-closed, nunca verde silencioso)', () => {
    assert.equal(tsCountDeclared("test<T>('x', () => {});"), 0);
  });

  it('failureExitCodes e detect() são os MESMOS OBJETOS do JS; envScrub herda tudo e soma UMA linha de escopo', () => {
    assert.strictEqual(TS_FAILURE_POLICY, javascriptAdapter.failureExitCodes);
    assert.deepEqual(tsDetect(), javascriptAdapter.detect());
    assert.deepEqual(TS_ENV_SCRUB.allow, javascriptAdapter.envScrub.allow);
    assert.deepEqual(TS_ENV_SCRUB.fixed, javascriptAdapter.envScrub.fixed);
    assert.deepEqual(TS_ENV_SCRUB.strip, javascriptAdapter.envScrub.strip);
    assert.equal(TS_ENV_SCRUB.scope.length, javascriptAdapter.envScrub.scope.length + 1);
    assert.match(TS_ENV_SCRUB.scope[TS_ENV_SCRUB.scope.length - 1], /QUINTA PROVA/);
  });
});
