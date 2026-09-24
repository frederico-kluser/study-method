/**
 * tests/cx-langqual-lang-python.test.ts — CARACTERIZAÇÃO (golden master) do
 * adaptador de Python (`engine/lang/python.ts`). Rede de segurança para a
 * refatoração das ondas seguintes.
 *
 * Contratos que mordem aqui:
 *   1. `pyParse` (python3 -I -S extrator, fonte no STDIN) é FAIL-CLOSED:
 *      sintaxe quebrada vira `PARSE_ERROR` estruturado (aqui a mensagem vem do
 *      CPython: "invalid syntax" + linha/coluna) — nunca exceção, nunca árvore
 *      parcial; árvore memoizada por `fileName + source`;
 *   2. `pyResolveScopes` é POR TABELA (symtable) e ESTRITAMENTE melhor que o
 *      caminho plano: shadowing local NÃO apaga o global em outro escopo — e
 *      por isso um nome pode estar em `declared` E em `free` ao mesmo tempo
 *      ("livre em ALGUM escopo") — leitura que este teste trava de propósito;
 *   3. `pyCountDeclared` segue a regra do `unittest`: só `def test*` no CORPO
 *      de classe derivada de `unittest.TestCase` (com propagação de base local
 *      por ponto fixo); `def test_x` solto no módulo NÃO conta;
 *   4. `pyCountRun` lê o ÚLTIMO bloco `Ran N tests` + veredito `OK|FAILED` e
 *      decodifica o detalhe por par `chave=N` (as chaves têm ESPAÇO:
 *      `expected failures` é PASSOU; `unexpected successes` é FALHA — nunca
 *      regex solta `failures=`); sem veredito após o `Ran`, a contagem vem com
 *      pass=0 (fail-closed);
 *   5. `tests/__init__.py` é OBRIGATÓRIO no layout e É o exit-guard
 *      (`os._exit`/`os.abort` bloqueados); exits 0/1/2/5 interpretados pela
 *      `PY_FAILURE_POLICY` (5 = NADA RODOU); envScrub remove o veneno
 *      PYTHON_* + venv/conda + proxies e fixa determinismo (HASHSEED=0).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  pyExtractorPath,
  pyAtomsPath,
  PY_BINARIOS,
  pyDetect,
  pyResetDetectCache,
  pyInventarioBruto,
  pyResetInventarioCache,
  pyInventory,
  pyGlobals,
  pyBuiltins,
  PY_PARSE_FLAGS,
  pyResetParseCache,
  pyParse,
  pyApplyParseEnv,
  pyResolveScopes,
  pyConstructKey,
  PY_FORBIDDEN_INVARIANTS,
  PY_ENTRY_PATH,
  PY_TEST_PATH,
  PY_PACKAGE_MARKER,
  PY_PACKAGE_MARKER_CONTENT,
  pyLayout,
  PY_SAFE_FILE_PATH_RE,
  PY_TEST_COMMAND,
  pyCountDeclared,
  pyCountRun,
  pyParseChecks,
  PY_FAILURE_POLICY,
  PY_EXIT_NADA_RODOU,
  PY_ENV_SCRUB,
  PY_THEORY_FENCE_TAGS,
  PY_CHALLENGE_LANGUAGES,
  PY_DEFAULT_RUNTIME,
  pythonAdapter,
  PY_FORM_AXIS_SUPPORTED,
} from '../electron/main/engine/lang/python';
import type { LangNode, ParseOk } from '../electron/main/engine/lang/registry';

const TEM_PY = pyDetect().ok;
const SEM_ARTEFATO = pyAtomsPath() === null || pyExtractorPath() === null;

function no(type: string, attributes: Record<string, string> = {}): LangNode {
  return { type, line: 1, column: 1, start: 0, end: 0, text: '', attributes, children: [] };
}

describe('python — (0) identidade e constantes do contrato', () => {
  it('binários, flags de parse e caminhos do desafio são os pinados', () => {
    assert.deepEqual([...PY_BINARIOS], ['python3', 'python']);
    assert.deepEqual([...PY_PARSE_FLAGS], ['-I', '-S']);
    assert.equal(PY_ENTRY_PATH, 'solucao.py');
    assert.equal(PY_TEST_PATH, 'tests/test_solucao.py');
    assert.equal(PY_PACKAGE_MARKER, 'tests/__init__.py');
  });

  it('o testCommand porta o comando MEDIDO (com -B contra .pyc velho e -v para parseChecks)', () => {
    assert.deepEqual(
      [...PY_TEST_COMMAND],
      ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-t', '.', '-p', 'test_*.py', '-v'],
    );
  });

  it('as proibições globais de Python são o vocabulário de montagem de nomes', () => {
    assert.deepEqual(
      [...PY_FORBIDDEN_INVARIANTS],
      [
        'global:eval',
        'global:exec',
        'global:compile',
        'global:__import__',
        'global:globals',
        'global:locals',
        'global:vars',
        'api:importlib.import_module',
        'node:ComputedNonLiteralAttribute',
        'node:DynamicAttributeHook',
      ],
    );
  });

  it('identidade do adaptador: label, tags, tokens, runtime, form DESLIGADO', () => {
    assert.equal(pythonAdapter.id, 'python');
    assert.equal(pythonAdapter.label, 'Python');
    assert.deepEqual([...PY_THEORY_FENCE_TAGS], ['py', 'python', 'python3']);
    assert.deepEqual([...PY_CHALLENGE_LANGUAGES], ['python', 'python3', 'cpython']);
    assert.equal(PY_DEFAULT_RUNTIME, 'cpython');
    assert.equal(PY_FORM_AXIS_SUPPORTED, false);
    assert.strictEqual(pythonAdapter.detect, pyDetect);
  });

  it('os artefatos do extrator e do inventário existem no disco', () => {
    assert.match(pyExtractorPath() ?? '', /py[/\\]extract_ast\.py$/);
    assert.match(pyAtomsPath() ?? '', /atoms\.python\.json$/);
  });

  it('o tests/__init__.py é o EXIT-GUARD: bloqueia os._exit e os.abort com RuntimeError', () => {
    assert.ok(PY_PACKAGE_MARKER_CONTENT.includes('_sm_os._exit = _sm_exit_guard'));
    assert.ok(PY_PACKAGE_MARKER_CONTENT.includes('_sm_os.abort = _sm_exit_guard'));
    assert.ok(PY_PACKAGE_MARKER_CONTENT.includes('RuntimeError'));
    assert.ok(PY_PACKAGE_MARKER_CONTENT.includes('exit-guard'));
  });
});

describe('python — (1) inventário, globais e builtins (do artefato GERADO)', () => {
  it('o inventário vem do artefato gerado e traz as distinções SINTÉTICAS', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const bruto = pyInventarioBruto();
    assert.ok(bruto !== null);
    assert.equal(bruto.schema, 1);
    assert.equal(typeof bruto.python_version, 'string');
    const inv = [...pyInventory()];
    for (const sintetico of ['IntLiteral', 'StrLiteral', 'Elif', 'MethodDef']) {
      assert.ok(inv.includes(sintetico), `sintético ${sintetico} tem de estar no inventário`);
    }
    assert.ok(!inv.includes('Constant'), 'Constant é sempre refinado — nunca é tipo emitido');
    assert.ok(!inv.includes('Add'), 'classe só-operador vira eixo op:, não node:');
  });

  it('builtins ⊂ globais, estritamente: len é builtin, __file__ é global de módulo', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    assert.ok(pyBuiltins().has('len'));
    assert.ok(pyBuiltins().has('range'));
    assert.ok(pyGlobals().has('len'));
    assert.ok(pyGlobals().has('__file__'), '__file__ é global de módulo');
    assert.ok(!pyBuiltins().has('__file__'), 'e NÃO é builtin — os conjuntos NÃO coincidem');
    for (const b of pyBuiltins()) {
      assert.ok(pyGlobals().has(b), 'builtins é subconjunto estrito de globals');
    }
  });

  it('os memos de inventário/detect são reconstruíveis (reset ⇒ mesmo valor)', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const antes = pyInventarioBruto();
    pyResetInventarioCache();
    assert.deepEqual(pyInventarioBruto(), antes);
    const d1 = pyDetect();
    pyResetDetectCache();
    assert.deepEqual(pyDetect(), d1);
  });
});

describe('python — (2) detect() e a degradação honesta', () => {
  it('com interpretador e extrator: ok, binary python3, versão X.Y, sem degradação', { skip: TEM_PY ? false : 'sem python' }, () => {
    const d = pyDetect();
    assert.equal(d.ok, true);
    assert.equal(d.degradacao, null);
    assert.match(d.version ?? '', /^\d+\.\d+/);
  });

  it('sem PATH: detect() NUNCA crasha — ok:false e a degradação DIZ o que faltou', () => {
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = '';
      pyResetDetectCache();
      const d = pyDetect();
      assert.equal(d.ok, false);
      assert.equal(d.binary, 'python3', 'sem binário resolvido sobra o nome candidato');
      assert.equal(d.version, null);
      assert.match(d.degradacao ?? '', /nenhum interpretador Python encontrado no PATH/);
    } finally {
      process.env.PATH = pathOriginal;
      pyResetDetectCache();
    }
  });
});

describe('python — (3) parse: fail-closed e árvore normalizada', () => {
  it('parseia Python real: Module, FunctionDef com name/field, 1-based e offsets no source', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const fonte = 'def dobro(x):\n    return x * 2\n\nprint(dobro(3))\n';
    const r = pyParse(fonte);
    assert.ok(r.ok);
    assert.equal(r.source, fonte);
    assert.equal(r.root.type, 'Module');
    const fn = r.root.children[0];
    assert.equal(fn.type, 'FunctionDef');
    assert.deepEqual(fn.attributes, { field: 'body', name: 'dobro' });
    assert.equal(fn.line, 1);
    assert.ok(fn.children.some((f) => f.type === 'Return'));
    assert.equal(fonte.slice(fn.start, fn.end), fn.text);
  });

  it('fonte QUEBRADO vira PARSE_ERROR com a mensagem do CPython (nunca exceção)', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const r = pyParse('def f(:\n');
    assert.deepEqual(r, {
      ok: false,
      error: { code: 'PARSE_ERROR', message: 'invalid syntax', line: 1, column: 7 },
    });
  });

  it('fonte VAZIO parseia (gramática livre — quem reprova é o orçamento)', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const r = pyParse('');
    assert.ok(r.ok);
    assert.equal(r.root.type, 'Module');
    assert.equal(r.root.children.length, 0);
  });

  it('a árvore é MEMOIZADA por fileName+source e o reset reconstrói', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const fonte = 'x = 1\n';
    const r1 = pyParse(fonte);
    const r2 = pyParse(fonte);
    assert.strictEqual(r1, r2);
    pyResetParseCache();
    const r3 = pyParse(fonte);
    assert.notStrictEqual(r1, r3);
    assert.deepEqual({ ...r1, native: null }, { ...r3, native: null });
  });

  it('sem interpretador no PATH: PARSE_ERROR dizendo que o interpretador ausente', () => {
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = '';
      pyResetDetectCache();
      pyResetParseCache();
      const r = pyParse('x = 1\n');
      assert.equal(r.ok, false);
      assert.match(r.error.message, /^interpretador Python ausente: nenhum de python3, python/);
    } finally {
      process.env.PATH = pathOriginal;
      pyResetDetectCache();
      pyResetParseCache();
    }
  });
});

describe('python — (4) escopos POR TABELA e a chave de orçamento', () => {
  it('shadowing local NÃO apaga o global em outro escopo — nome pode estar em declared E free', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const fonte = 'def f():\n    len = 3\n    return len\ndef g():\n    return len([1])\n';
    const r = pyParse(fonte);
    assert.ok(r.ok);
    const sc = pyResolveScopes(r as ParseOk);
    assert.deepEqual([...sc.declared].sort(), ['f', 'g', 'len']);
    assert.deepEqual([...sc.free], ['len'], 'livre em ALGUM escopo (g) — leitura de conjunto, é correto');
    assert.deepEqual([...sc.globals], ['len'], 'global:len em g continua sendo reportado');
  });

  it('import entra em imported ⊆ declared; builtins usados caem em globals', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const fonte = 'from solucao import eco\nimport math\nprint(eco(1), math.pi)\n';
    const r = pyParse(fonte);
    assert.ok(r.ok);
    const sc = pyResolveScopes(r as ParseOk);
    assert.deepEqual([...sc.declared].sort(), ['eco', 'math']);
    assert.deepEqual([...sc.imported].sort(), ['eco', 'math']);
    assert.deepEqual([...sc.globals], ['print']);
  });

  it('constructKey cobre 5 eixos com a precedência declKind → globalName → apiPath → op → node:', () => {
    assert.equal(pyConstructKey(no('Binding', { declKind: 'unpack' })), 'decl:unpack');
    assert.equal(pyConstructKey(no('GlobalRef', { globalName: 'len' })), 'global:len');
    assert.equal(pyConstructKey(no('ApiRef', { apiPath: 'math.pi' })), 'api:math.pi');
    assert.equal(pyConstructKey(no('Op', { operatorFamily: 'compare', operator: '==' })), 'op:compare:==');
    assert.equal(pyConstructKey(no('If')), 'node:If');
    assert.equal(
      pyConstructKey(no('X', { declKind: 'walrus', globalName: 'g' })),
      'decl:walrus',
    );
  });
});

describe('python — (5) a dupla-igualdade: a regra do unittest', () => {
  it('countDeclared: só def test* no CORPO de classe derivada de TestCase', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const tests = [
      'from unittest import TestCase',
      '',
      'class T(TestCase):',
      '    def test_a(self):',
      '        pass',
      '    def test_b(self):',
      '        pass',
      '    def helper(self):',
      '        pass',
      '',
      'def test_solto(self):',
      '    pass',
      '',
    ].join('\n');
    assert.equal(pyCountDeclared(tests), 2, 'helper e test solto não contam');
  });

  it('base LOCAL herda por ponto fixo; comentário não é nó; quebrado devolve 0', { skip: SEM_ARTEFATO ? 'sem artefatos' : false }, () => {
    const tests = [
      'import unittest',
      'class Base(unittest.TestCase):',
      '    def test_base(self):',
      '        pass',
      '',
      'class T(Base):',
      '    def test_filha(self):',
      '        pass',
      '    # def test_comentado(self):',
      '    #     pass',
      '',
    ].join('\n');
    assert.equal(pyCountDeclared(tests), 2, 'Base e T herdam TestCase por ponto fixo');
    assert.equal(pyCountDeclared('def f(:\n'), 0);
  });

  it('pyCountRun: bloco Ran N tests + OK é a passagem integral', () => {
    assert.deepEqual(pyCountRun('Ran 3 tests in 0.001s\n\nOK\n'), { testsRun: 3, pass: 3, fail: 0, skipped: 0 });
    assert.deepEqual(pyCountRun('Ran 1 test in 0.001s\nOK\n'), { testsRun: 1, pass: 1, fail: 0, skipped: 0 });
  });

  it('o detalhe é lido por par chave=N (chaves COM espaço): expected failures é PASSOU', () => {
    assert.deepEqual(pyCountRun('Ran 2 tests in 0.001s\nOK (expected failures=1)\n'), {
      testsRun: 2,
      pass: 2,
      fail: 0,
      skipped: 0,
    });
  });

  it('unexpected successes é FALHA (e failures= de expected failures NÃO conta — armadilha do regex solto)', () => {
    assert.deepEqual(pyCountRun('Ran 5 tests in 0.001s\nFAILED (failures=1, errors=2, skipped=1, unexpected successes=1)\n'), {
      testsRun: 5,
      pass: 0,
      fail: 4,
      skipped: 1,
    });
  });

  it('skipped carrega o skipped e sai de pass; o ÚLTIMO bloco Ran N vale', () => {
    assert.deepEqual(pyCountRun('Ran 2 tests in 0.001s\nOK (skipped=1)\n'), {
      testsRun: 2,
      pass: 1,
      fail: 0,
      skipped: 1,
    });
    const doisBlocos = ['Ran 1 test in 0.001s', 'OK', '', 'Ran 4 tests in 0.001s', 'FAILED (failures=2)'].join('\n');
    assert.deepEqual(pyCountRun(doisBlocos), { testsRun: 4, pass: 2, fail: 2, skipped: 0 });
  });

  it('sem a linha Ran é ZERO; sem veredito DEPOIS do Ran é contagem com pass=0 (fail-closed)', () => {
    assert.deepEqual(pyCountRun('OK\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(pyCountRun('Ran 3 tests in 0.001s\n'), { testsRun: 3, pass: 0, fail: 0, skipped: 0 });
  });

  it('ANSI de cor não derruba o parse do resumo', () => {
    assert.deepEqual(pyCountRun('\u001b[32mRan 2 tests in 0.001s\u001b[0m\nOK\n'), {
      testsRun: 2,
      pass: 2,
      fail: 0,
      skipped: 0,
    });
  });

  it('parseChecks: uma linha por teste; skipped/expected failure/unexpected success NÃO passam', () => {
    const saida = [
      'test_soma (tests.test_solucao.TestSolucao.test_soma) ... ok',
      'test_erro (tests.test_solucao.TestSolucao.test_erro) ... FAIL',
      'test_pulado (tests.test_solucao.TestSolucao.test_pulado) ... skipped \'sem gcc\'',
      'test_esp (tests.test_solucao.TestSolucao.test_esp) ... expected failure',
      'test_surp (tests.test_solucao.TestSolucao.test_surp) ... unexpected success',
    ].join('\n');
    assert.deepEqual(pyParseChecks(saida), [
      { name: 'test_soma', passed: true },
      { name: 'test_erro', passed: false },
      { name: 'test_pulado', passed: false },
      { name: 'test_esp', passed: false },
      { name: 'test_surp', passed: false },
    ]);
  });

  it('ARMADILHA DO DOCSTRING: resultado na linha do docstring, nome na ANTERIOR', () => {
    const saida = [
      'test_doc (tests.test_solucao.TestSolucao.test_doc) ...',
      'primeira linha do docstring ... ok',
    ].join('\n');
    assert.deepEqual(pyParseChecks(saida), [{ name: 'test_doc', passed: true }]);
  });
});

describe('python — (6) exits, env do parser e envScrub do filho', () => {
  it('PY_FAILURE_POLICY: exit 5 é NADA RODOU (presente em relação ao Node); 137 nunca distingue', () => {
    assert.equal(PY_EXIT_NADA_RODOU, 5);
    assert.equal(PY_FAILURE_POLICY.isFailure(0), false);
    assert.equal(PY_FAILURE_POLICY.isFailure(5), true);
    assert.equal(PY_FAILURE_POLICY.successRequiresCountMatch, true);
    assert.equal(PY_FAILURE_POLICY.meaning(0), 'exit 0');
    assert.equal(PY_FAILURE_POLICY.meaning(1), 'exit 1 (teste falhou ou levantou erro)');
    assert.equal(PY_FAILURE_POLICY.meaning(5), 'exit 5 (NADA rodou — nenhum teste foi coletado)');
    assert.equal(PY_FAILURE_POLICY.meaning(2), 'exit 2 (erro de uso do unittest / import falhou)');
    assert.equal(PY_FAILURE_POLICY.meaning(137), 'timeout-ou-OOM');
    assert.equal(PY_FAILURE_POLICY.meaning(42), 'exit 42');
  });

  it('pyApplyParseEnv: allowlist estrita + determinismo PYTHON* — nada do ambiente vaza', () => {
    assert.deepEqual(
      pyApplyParseEnv({ PATH: '/usr/bin', PYTHONPATH: '/evil', SEGREDO: 'VAZOU?' }),
      {
        PATH: '/usr/bin',
        LC_ALL: 'C.UTF-8',
        TZ: 'UTC',
        PYTHONIOENCODING: 'utf-8',
        PYTHONHASHSEED: '0',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    );
  });

  it('PY_ENV_SCRUB: determinismo fixado e o veneno PYTHON_*/venv/conda/proxies removido', () => {
    assert.deepEqual(PY_ENV_SCRUB.allow, []);
    assert.deepEqual(PY_ENV_SCRUB.fixed, {
      PYTHONHASHSEED: '0',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1',
      PYTHONIOENCODING: 'utf-8',
      NO_PROXY: '*',
      no_proxy: '*',
    });
    for (const veneno of [
      'PYTHONPATH',
      'PYTHONHOME',
      'PYTHONSTARTUP',
      'PYTHONWARNINGS',
      'VIRTUAL_ENV',
      'CONDA_PREFIX',
      'HTTP_PROXY',
      'http_proxy',
      'FORCE_COLOR',
    ]) {
      assert.ok(PY_ENV_SCRUB.strip.includes(veneno), `strip tem de levar ${veneno}`);
    }
    for (const nome of PY_ENV_SCRUB.strip) {
      assert.ok(!(nome in PY_ENV_SCRUB.fixed), 'fixed e strip nunca se sobrepõem');
    }
    assert.ok(PY_ENV_SCRUB.scope.some((s) => s.startsWith('LIMITE:')), 'os limites são declarados, não escondidos');
  });
});

describe('python — (7) layout e caminho seguro de arquivo', () => {
  it('layout de arquivo único: __init__ (exit-guard) PRIMEIRO, depois solucao.py e o teste', () => {
    const l = pyLayout({ code: 'def f(): ...', testsCode: 'import unittest' });
    assert.deepEqual(l.files.map((f) => f.path), ['tests/__init__.py', 'solucao.py', 'tests/test_solucao.py']);
    assert.equal(l.entryPath, 'solucao.py');
    assert.equal(l.testPath, 'tests/test_solucao.py');
    assert.equal(l.manifestPath, null, 'Python não tem manifesto — a ausência é informação');
    assert.equal(l.files[0].content, PY_PACKAGE_MARKER_CONTENT);
    assert.equal(l.files[1].content, 'def f(): ...');
    assert.equal(l.files[2].content, 'import unittest');
  });

  it('layout multi-arquivo: files VERBATIM, sem solucao.py implícito', () => {
    const l = pyLayout({
      code: 'ignorado',
      files: [
        { path: 'solucao.py', code: 'def a(): ...' },
        { path: 'util.py', code: 'def b(): ...' },
      ],
      testsCode: '',
    });
    assert.deepEqual(l.files.map((f) => f.path), ['tests/__init__.py', 'solucao.py', 'util.py', 'tests/test_solucao.py']);
  });

  it('PY_SAFE_FILE_PATH_RE: .py com diretórios seguros passa; .. e extensão errada caem', () => {
    assert.ok(PY_SAFE_FILE_PATH_RE.test('solucao.py'));
    assert.ok(PY_SAFE_FILE_PATH_RE.test('tests/test_solucao.py'));
    assert.ok(!PY_SAFE_FILE_PATH_RE.test('../fuga.py'));
    assert.ok(!PY_SAFE_FILE_PATH_RE.test('a/../b.py'));
    assert.ok(!PY_SAFE_FILE_PATH_RE.test('arquivo.txt'));
    assert.ok(!PY_SAFE_FILE_PATH_RE.test('a b.py'));
  });
});
