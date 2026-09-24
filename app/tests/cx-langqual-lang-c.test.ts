/**
 * tests/cx-langqual-lang-c.test.ts — CARACTERIZAÇÃO (golden master) do adaptador
 * de C (`engine/lang/c.ts`). Rede de segurança para a refatoração das ondas
 * seguintes: mudança de comportamento OBSERVÁVEL destes contratos tem de passar
 * por aqui primeiro.
 *
 * Contratos que mordem aqui:
 *   1. `cParse` é FAIL-CLOSED: fonte quebrado, ferramenta ausente ou saída
 *      corrompida viram SEMPRE o `PARSE_ERROR` estruturado (code/message/
 *      line/column) — nunca exceção solta, nunca árvore parcial. `#include`
 *      vira nó sintético `IncludeDirective` (decisão 5); a árvore é
 *      memoizada por `fileName + source`;
 *   2. `cResolveScopes` é PLANO e `imported` é vazio POR CONSTRUÇÃO (C não
 *      tem import); `cConstructKey` cobre 5 eixos com precedência fixa
 *      (declKind → globalName → apiPath → operatorFamily+operator → node:);
 *   3. A DUPLA-IGUALDADE: `cCountDeclared` conta DEFINIÇÕES `test_*` POR AST
 *      (comentário não conta; proto+def conta 1); `cCountRun` só crê em
 *      linhas COM NONCE `SM… TESTS_RUN=/TESTS_FAILED=` e exige as DUAS
 *      (uma sem a outra ⇒ ZERO — forja por `exit(0)` não passa);
 *   4. Exits NORMALIZADOS 0/1/2/3 + 127/134/137 interpretados pela
 *      `C_FAILURE_POLICY` (nunca afirmar timeout×OOM no 137);
 *   5. `cLayout` gera o harness (sm_harness.h, sm_main.c, run.sh,
 *      sm_fontes.txt) na ordem de escrita; só `.c` entra na lista de TUs;
 *      `manifestPath` é `null` (C não tem manifesto — ausência é informação).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cExtractorPath,
  C_BINARIOS_RUNNER,
  C_PARSE_COMPILER,
  C_PY_BINARIOS,
  C_RUNNER_BINARY,
  cDetect,
  cResetDetectCache,
  cInventory,
  cGlobals,
  cBuiltins,
  C_PARSE_FLAGS,
  cResetParseCache,
  cParse,
  cApplyParseEnv,
  cResolveScopes,
  cConstructKey,
  C_FORBIDDEN_INVARIANTS,
  C_ENTRY_PATH,
  C_TEST_PATH,
  C_HARNESS_HEADER_PATH,
  C_HARNESS_MAIN_PATH,
  C_RUNNER_SCRIPT_PATH,
  C_FONTES_LIST_PATH,
  SM_HARNESS_HEADER,
  SM_MAIN_SOURCE,
  SM_RUNNER_SCRIPT,
  SM_COUNT_PREABULO,
  cLayout,
  C_SAFE_FILE_PATH_RE,
  C_TEST_COMMAND,
  cCountDeclared,
  cCountRun,
  cParseChecks,
  C_FAILURE_POLICY,
  C_ENV_SCRUB,
  C_THEORY_FENCE_TAGS,
  C_CHALLENGE_LANGUAGES,
  C_DEFAULT_RUNTIME,
  cAdapter,
  C_FORM_AXIS_SUPPORTED,
} from '../electron/main/engine/lang/c';
import type { LangNode, ParseOk } from '../electron/main/engine/lang/registry';

const TEM_C = cDetect().ok;

function no(type: string, attributes: Record<string, string> = {}): LangNode {
  return { type, line: 1, column: 1, start: 0, end: 0, text: '', attributes, children: [] };
}

describe('c — (0) identidade e constantes do contrato', () => {
  it('as constantes de binário/flags são as do contrato pinadas', () => {
    assert.deepEqual([...C_BINARIOS_RUNNER], ['cc', 'gcc', 'clang']);
    assert.equal(C_PARSE_COMPILER, 'clang');
    assert.deepEqual([...C_PY_BINARIOS], ['python3', 'python']);
    assert.equal(C_RUNNER_BINARY, 'sh');
    assert.deepEqual(
      [...C_PARSE_FLAGS],
      ['-std=c11', '-fsyntax-only', '-Xclang', '-ast-dump=json', '-Wno-error=implicit-function-declaration'],
    );
  });

  it('os caminhos dos arquivos do desafio/harness são os do contrato', () => {
    assert.equal(C_ENTRY_PATH, 'solucao.c');
    assert.equal(C_TEST_PATH, 'tests/test_solucao.c');
    assert.equal(C_HARNESS_HEADER_PATH, 'tests/sm_harness.h');
    assert.equal(C_HARNESS_MAIN_PATH, 'tests/sm_main.c');
    assert.equal(C_RUNNER_SCRIPT_PATH, 'run.sh');
    assert.equal(C_FONTES_LIST_PATH, 'sm_fontes.txt');
    assert.deepEqual([...C_TEST_COMMAND], ['run.sh']);
  });

  it('as proibições globais de C são IndirectCall + dlsym + system (o eval de C)', () => {
    assert.deepEqual([...C_FORBIDDEN_INVARIANTS], ['node:IndirectCall', 'api:dlsym', 'api:system']);
  });

  it('identidade do adaptador: label, tags, tokens, runtime default, form DESLIGADO', () => {
    assert.equal(cAdapter.id, 'c');
    assert.equal(cAdapter.label, 'C');
    assert.deepEqual([...C_THEORY_FENCE_TAGS], ['c']);
    assert.deepEqual([...C_CHALLENGE_LANGUAGES], ['c', 'c11']);
    assert.equal(C_DEFAULT_RUNTIME, 'cc-c11');
    assert.equal(C_FORM_AXIS_SUPPORTED, false);
    assert.equal(cAdapter.defaultRuntime, 'cc-c11');
    assert.strictEqual(cAdapter.detect, cDetect);
  });

  it('o extrator vocab/c/extract_ast.py é resolvido no disco', () => {
    const p = cExtractorPath();
    assert.ok(p !== null, 'sem extrator não há Porta 1 para C');
    assert.match(p, /c[/\\]extract_ast\.py$/);
  });

  it('os templates do harness existem e têm invariantes observáveis', () => {
    assert.ok(SM_HARNESS_HEADER.includes('sm_harness.h'));
    assert.ok(SM_MAIN_SOURCE.includes('sm_main.c'));
    assert.ok(SM_RUNNER_SCRIPT.startsWith('#!/bin/sh'));
    const preabulo = SM_COUNT_PREABULO;
    assert.equal(typeof preabulo, 'string', 'SM_COUNT_PREABULO já vem .join("\\n")');
    assert.ok(preabulo.includes('#define SM_TEST(slug)'));
    assert.ok(preabulo.includes('void sm_registrar'));
  });
});

describe('c — (1) inventário, globais e builtins', () => {
  it('o inventário é o enum FECHADO dos kinds emitidos + 4 portadores sintéticos', () => {
    assert.deepEqual(
      [...cInventory()],
      [
        'ApiRef',
        'ArraySubscriptExpr',
        'BinaryOperator',
        'BreakStmt',
        'CStyleCastExpr',
        'CallExpr',
        'CharacterLiteral',
        'CompoundAssignOperator',
        'CompoundStmt',
        'ConditionalOperator',
        'ContinueStmt',
        'DeclRefExpr',
        'DeclStmt',
        'DoStmt',
        'FloatingLiteral',
        'ForStmt',
        'FunctionDecl',
        'GlobalRef',
        'IfStmt',
        'IncludeDirective',
        'IndirectCall',
        'InitListExpr',
        'IntegerLiteral',
        'MemberExpr',
        'ParmVarDecl',
        'RecordDecl',
        'ReturnStmt',
        'StringLiteral',
        'SwitchStmt',
        'TypedefDecl',
        'UnaryExprOrTypeTraitExpr',
        'UnaryOperator',
        'VarDecl',
        'WhileStmt',
      ],
    );
  });

  it('globais de runtime são os TRÊS fluxos padrão (detecção por TEXTO, não por símbolo)', () => {
    assert.deepEqual([...cGlobals()].sort(), ['stderr', 'stdin', 'stdout']);
  });

  it('builtins de C é o CONJUNTO VAZIO — printf é api:, não builtin (ausência é informação)', () => {
    assert.equal(cBuiltins().size, 0);
  });
});

describe('c — (2) detect() e a degradação honesta', () => {
  it('com toolchain completa: ok, binary é o sh do runner, sem degradação', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const d = cDetect();
    assert.equal(d.ok, true);
    assert.equal(d.degradacao, null);
    assert.equal(d.binary, 'sh', 'o spawn do runner executa sh run.sh');
    // mudança intencional B1 — versaoDoTexto agora parseia banners gcc; versão deixa de ser null
    assert.match(d.version ?? '', /^\d+\.\d+/);
  });

  it('o memo de detect é reconstrutível (reset ⇒ mesmo valor)', () => {
    const antes = cDetect();
    cResetDetectCache();
    assert.deepEqual(cDetect(), antes);
  });

  it('sem PATH: detect() NUNCA crasha — ok:false e a degradação DIZ o que faltou', () => {
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = '';
      cResetDetectCache();
      const d = cDetect();
      assert.equal(d.ok, false);
      assert.equal(d.binary, 'sh');
      assert.equal(d.version, null);
      assert.ok((d.degradacao ?? '').includes('nenhum compilador C encontrado no PATH'));
      assert.ok((d.degradacao ?? '').includes('clang não encontrado'));
      assert.ok((d.degradacao ?? '').includes('nenhum python3 no PATH'));
      assert.ok(!(d.degradacao ?? '').includes('extract_ast.py não encontrado'), 'o extrator AINDA está no disco');
    } finally {
      process.env.PATH = pathOriginal;
      cResetDetectCache();
    }
  });

  it('com toolchain presente: cDetect().version parseia o banner do compilador — versaoDoTexto casa "cc (GCC) …" (B1 corrigido)', () => {
    const d = cDetect();
    if (!d.ok) return;
    assert.match(d.version ?? '', /^\d+\.\d+/);
  });
});

describe('c — (3) parse: fail-closed e árvore normalizada', () => {
  it('parseia C real: TranslationUnitDecl, #include vira IncludeDirective SINTÉTICO', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const fonte = '#include <stdio.h>\nint dobro(int x) {\n  return x * 2;\n}\n';
    const r = cParse(fonte);
    assert.ok(r.ok);
    assert.equal(r.source, fonte);
    assert.equal(r.root.type, 'TranslationUnitDecl');
    const inc = r.root.children[0];
    assert.equal(inc.type, 'IncludeDirective');
    assert.equal(inc.synthetic, true, 'nó PORTADOR criado pelo adaptador (decisão 5)');
    assert.equal(inc.attributes.path, '<stdio.h>');
    const fn = r.root.children[1];
    assert.equal(fn.type, 'FunctionDecl');
    assert.deepEqual(fn.attributes, { name: 'dobro', declKind: 'func' });
    assert.ok(fn.children.some((f) => f.type === 'ParmVarDecl'));
    assert.ok(fn.children.some((f) => f.type === 'CompoundStmt'));
  });

  it('line/column são 1-based e os offsets indexam o MESMO source devolvido', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const fonte = '#include <stdio.h>\nint dobro(int x) {\n  return x * 2;\n}\n';
    const r = cParse(fonte);
    assert.ok(r.ok);
    assert.equal(r.root.line, 1);
    assert.equal(r.root.column, 1);
    const fn = r.root.children[1];
    assert.equal(fn.line, 2, 'a definição começa na linha 2');
    assert.equal(fonte.slice(fn.start, fn.end), fn.text);
  });

  it('fonte QUEBRADO vira PARSE_ERROR estruturado com o diagnóstico do clang (nunca lança)', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const r = cParse('int f( {\n');
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.match(r.error.message, /^clang reprovou o fonte \(\d+:\d+\): /);
    assert.equal(r.error.line, 1);
    assert.equal(r.error.column, 8);
  });

  it('variável não declarada continua ERRO de parse (é defeito real de C)', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const r = cParse('int main(void) { return y; }\n');
    assert.equal(r.ok, false);
    assert.match(r.error.message, /use of undeclared identifier/);
  });

  it('printf sem #include PARSEIA (implicit-function-declaration é warning, não erro)', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const r = cParse('void mostra(void) { printf("oi"); }\n');
    assert.equal(r.ok, true);
  });

  it('a árvore é MEMOIZADA por fileName+source (mesma instância) e o reset reconstrói', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const fonte = 'int main(void) { return 0; }\n';
    const r1 = cParse(fonte);
    const r2 = cParse(fonte);
    assert.strictEqual(r1, r2, 'memo: mesma instância');
    cResetParseCache();
    const r3 = cParse(fonte);
    assert.notStrictEqual(r1, r3);
    assert.deepEqual({ ...r1, native: null }, { ...r3, native: null });
  });

  it('fileName participa da chave do memo (mesmo source, nomes diferentes ⇒ parses distintos)', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const fonte = 'int main(void) { return 0; }\n';
    const a = cParse(fonte, { fileName: 'a.c' });
    const b = cParse(fonte, { fileName: 'b.c' });
    assert.notStrictEqual(a, b);
  });

  it('sem clang no PATH: PARSE_ERROR dizendo que o PARSE exige clang', () => {
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = '';
      cResetDetectCache();
      cResetParseCache();
      const r = cParse('int main(void) { return 0; }\n');
      assert.equal(r.ok, false);
      assert.equal(r.error.code, 'PARSE_ERROR');
      assert.match(r.error.message, /^clang ausente: o parse de C exige clang/);
      assert.equal(r.error.line, 1);
      assert.equal(r.error.column, 1);
    } finally {
      process.env.PATH = pathOriginal;
      cResetDetectCache();
      cResetParseCache();
    }
  });
});

describe('c — (4) escopos e a chave de orçamento', () => {
  it('resolveScopes é PLANO: declared do arquivo, imported VAZIO por construção, free = o que sobrou', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const fonte =
      '#include <stdio.h>\nint dobro(int x) { return x * 2; }\nvoid mostra(void) { printf("%d", dobro(3)); fprintf(stdout, "fim"); }\n';
    const r = cParse(fonte);
    assert.ok(r.ok);
    const sc = cResolveScopes(r as ParseOk);
    assert.deepEqual([...sc.declared].sort(), ['dobro', 'mostra', 'x']);
    assert.deepEqual([...sc.imported], [], '#include é expansão de texto — C não tem import');
    assert.deepEqual([...sc.free].sort(), ['fprintf', 'printf', 'stdout']);
    assert.deepEqual([...sc.globals].sort(), ['stdout'], 'só os fluxos padrão são globais de runtime');
  });

  it('constructKey cobre 5 eixos com a precedência declKind → globalName → apiPath → op → node:', () => {
    assert.equal(cConstructKey(no('VarDecl', { declKind: 'var' })), 'decl:var');
    assert.equal(cConstructKey(no('FunctionDecl', { declKind: 'func' })), 'decl:func');
    assert.equal(cConstructKey(no('GlobalRef', { globalName: 'stdout' })), 'global:stdout');
    assert.equal(cConstructKey(no('ApiRef', { apiPath: 'printf' })), 'api:printf');
    assert.equal(
      cConstructKey(no('BinaryOperator', { operatorFamily: 'binary', operator: '!==' })),
      'op:binary:!==',
    );
    assert.equal(cConstructKey(no('IfStmt')), 'node:IfStmt');
  });

  it('constructKey: declKind VENCE os demais atributos (precedência é contrato)', () => {
    assert.equal(
      cConstructKey(no('X', { declKind: 'var', globalName: 'g', apiPath: 'p', operatorFamily: 'f', operator: 'o' })),
      'decl:var',
    );
    assert.equal(
      cConstructKey(no('X', { globalName: 'g', apiPath: 'p' })),
      'global:g',
    );
  });
});

describe('c — (5) a dupla-igualdade: countDeclared × countRun', () => {
  it('countDeclared conta DEFINIÇÕES test_* por AST (a macro SM_TEST conta 1 por bloco)', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const tests = [
      'SM_TEST(dobro_de_2) { checa_int("2*2", dobro(2), 4, "dobro"); }',
      'SM_TEST(dobro_de_3) { checa_int("2*3", dobro(3), 6, "dobro"); }',
      '',
    ].join('\n');
    assert.equal(cCountDeclared(tests), 2);
  });

  it('comentário NÃO conta (contagem é AST, nunca regex)', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const tests = [
      'SM_TEST(real) { checa_int("x", dobro(1), 2, "dobro"); }',
      '/* SM_TEST(comentado) { } */',
      '',
    ].join('\n');
    assert.equal(cCountDeclared(tests), 1);
  });

  it('proto+def escritos à mão contam 1 (por NOME único) e sm_reg_* não conta', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    const tests = [
      'static void test_manual(void);',
      'static void test_manual(void) { checa_int("x", 1, 1, "igual"); }',
      '',
    ].join('\n');
    assert.equal(cCountDeclared(tests), 1);
  });

  it('fonte quebrado em countDeclared devolve 0 (fail-closed: 0 nunca bate com expectedTestCount)', { skip: TEM_C ? false : 'sem toolchain C' }, () => {
    assert.equal(cCountDeclared('int f( {\n'), 0);
  });

  it('countRun só crê nas linhas COM nonce SM e exige as DUAS (TESTS_RUN e TESTS_FAILED)', () => {
    assert.deepEqual(cCountRun('SMabc TESTS_RUN=3\nSMabc TESTS_FAILED=1\n'), {
      testsRun: 3,
      pass: 2,
      fail: 1,
      skipped: 0,
    });
  });

  it('uma linha sem a outra é relatório TRUNCADO ⇒ ZERO (forja por printf não passa)', () => {
    assert.deepEqual(cCountRun('SMabc TESTS_RUN=3\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(cCountRun('SMabc TESTS_FAILED=1\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('linha FORJADA pelo código do aluno, sem nonce SM, nunca casa', () => {
    assert.deepEqual(cCountRun('TESTS_RUN=2\nTESTS_FAILED=0\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(cCountRun('SM_TEST forjou: TESTS_RUN=9\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('as ÚLTIMAS linhas de cada tipo valem (o runner real imprime por último)', () => {
    const saida = ['SMx TESTS_RUN=1', 'SMx TESTS_FAILED=0', 'SMx TESTS_RUN=4', 'SMx TESTS_FAILED=2'].join('\n');
    assert.deepEqual(cCountRun(saida), { testsRun: 4, pass: 2, fail: 2, skipped: 0 });
  });

  it('ANSI de cor não derruba o parse; pass = max(0, run − failed)', () => {
    assert.deepEqual(cCountRun('\x1b[32mSMx TESTS_RUN=2\x1b[0m\nSMx TESTS_FAILED=5\n'), {
      testsRun: 2,
      pass: 0,
      fail: 5,
      skipped: 0,
    });
  });

  it('parseChecks: um check por CENÁRIO, com o veredito honesto de cada um', () => {
    const saida = ['SMx T dobro_de_2 ok', 'SMx T dobro_de_3 FALHOU', 'lixo qualquer'].join('\n');
    assert.deepEqual(cParseChecks(saida), [
      { name: 'dobro_de_2', passed: true },
      { name: 'dobro_de_3', passed: false },
    ]);
  });
});

describe('c — (6) exits normalizados e ambiente do filho', () => {
  it('C_FAILURE_POLICY: só exit 0 passa; 137 é timeout-OU-OOM (nunca afirmar qual)', () => {
    assert.equal(C_FAILURE_POLICY.isFailure(0), false);
    assert.equal(C_FAILURE_POLICY.isFailure(1), true);
    assert.equal(C_FAILURE_POLICY.successRequiresCountMatch, true);
    assert.equal(C_FAILURE_POLICY.meaning(0), 'exit 0 (passou)');
    assert.match(C_FAILURE_POLICY.meaning(1), /^exit 1 \(falhou/);
    assert.match(C_FAILURE_POLICY.meaning(2), /^exit 2 \(contagem errada/);
    assert.match(C_FAILURE_POLICY.meaning(3), /^exit 3 \(timeout/);
    assert.equal(C_FAILURE_POLICY.meaning(127), 'exit 127 (nenhum compilador C no PATH)');
    assert.match(C_FAILURE_POLICY.meaning(134), /^exit 134 \(SIGABRT/);
    assert.equal(C_FAILURE_POLICY.meaning(137), 'timeout-ou-OOM');
    assert.equal(C_FAILURE_POLICY.meaning(42), 'exit 42');
  });

  it('cApplyParseEnv: allowlist estrita + núcleo determinístico — nada do ambiente vaza', () => {
    const env = cApplyParseEnv({
      PATH: '/usr/bin',
      HOME: '/home/x',
      SECRET: 'VAZOU?',
      CFLAGS: '-O3',
    });
    assert.deepEqual(env, {
      PATH: '/usr/bin',
      HOME: '/home/x',
      LC_ALL: 'C.UTF-8',
      TZ: 'UTC',
      PYTHONIOENCODING: 'utf-8',
      PYTHONDONTWRITEBYTECODE: '1',
    });
  });

  it('C_ENV_SCRUB: veneno de C nomeado (CFLAGS/CPATH/LD_PRELOAD/DYLD_*/proxies) e NO_PROXY imposto', () => {
    assert.deepEqual(C_ENV_SCRUB.allow, []);
    assert.deepEqual(C_ENV_SCRUB.fixed, { NO_PROXY: '*', no_proxy: '*' });
    for (const veneno of [
      'CFLAGS',
      'CPATH',
      'C_INCLUDE_PATH',
      'LIBRARY_PATH',
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES',
      'LIB',
      'INCLUDE',
      'HTTP_PROXY',
      'http_proxy',
      'FORCE_COLOR',
    ]) {
      assert.ok(C_ENV_SCRUB.strip.includes(veneno), `strip tem de levar ${veneno}`);
    }
    assert.ok(C_ENV_SCRUB.scope.some((s) => s.startsWith('LIMITE:')), 'os limites são declarados, não escondidos');
    for (const nome of C_ENV_SCRUB.strip) {
      assert.ok(!(nome in C_ENV_SCRUB.fixed), 'fixed e strip nunca se sobrepõem');
    }
  });
});

describe('c — (7) layout e caminho seguro de arquivo', () => {
  it('layout de arquivo único: harness + solução + teste + fontes + run.sh, na ordem de escrita', () => {
    const l = cLayout({ code: 'int main(void){return 0;}', testsCode: 'SM_TEST(a) {}' });
    assert.deepEqual(
      l.files.map((f) => f.path),
      ['tests/sm_harness.h', 'tests/sm_main.c', 'solucao.c', 'tests/test_solucao.c', 'sm_fontes.txt', 'run.sh'],
    );
    assert.equal(l.entryPath, 'solucao.c');
    assert.equal(l.testPath, 'tests/test_solucao.c');
    assert.equal(l.manifestPath, null, 'C não tem manifesto — a ausência é informação');
    const teste = l.files.find((f) => f.path === 'tests/test_solucao.c');
    assert.equal(teste?.content, '#include "sm_harness.h"\nSM_TEST(a) {}');
    const fontes = l.files.find((f) => f.path === 'sm_fontes.txt');
    assert.equal(fontes?.content, 'solucao.c\n');
  });

  it('layout multi-arquivo: SÓ .c entra na lista de TUs (header via #include, não -c)', () => {
    const l = cLayout({
      code: 'ignorado',
      files: [
        { path: 'main.c', code: 'int main(void){return 0;}' },
        { path: 'util.h', code: 'int f(void);' },
      ],
      testsCode: '',
    });
    const fontes = l.files.find((f) => f.path === 'sm_fontes.txt');
    assert.equal(fontes?.content, 'main.c\n');
    assert.ok(!l.files.some((f) => f.path === 'solucao.c'), 'com files, o code unitário não entra');
    assert.ok(l.files.some((f) => f.path === 'util.h'), 'o header continua em disco');
  });

  it('C_SAFE_FILE_PATH_RE: .c/.h com diretórios seguros passam; .. e extensão errada caem', () => {
    assert.ok(C_SAFE_FILE_PATH_RE.test('solucao.c'));
    assert.ok(C_SAFE_FILE_PATH_RE.test('tests/test_solucao.c'));
    assert.ok(C_SAFE_FILE_PATH_RE.test('include/meu-header.h'));
    assert.ok(!C_SAFE_FILE_PATH_RE.test('../fuga.c'));
    assert.ok(!C_SAFE_FILE_PATH_RE.test('a/../b.c'));
    assert.ok(!C_SAFE_FILE_PATH_RE.test('arquivo.txt'));
    assert.ok(!C_SAFE_FILE_PATH_RE.test('a b.c'), 'espaço não passa');
    assert.ok(!C_SAFE_FILE_PATH_RE.test('x.c '), 'sem flag g — e sem espaço final');
  });

  it('C_SAFE_FILE_PATH_RE recusa caminho ABSOLUTO ("/etc/x.c") — escape do diretório de execução é proibido pelo contrato', () => {
    assert.ok(!C_SAFE_FILE_PATH_RE.test('/etc/x.c'), 'escape por caminho absoluto deveria ser proibido');
  });
});
