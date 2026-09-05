/**
 * tests/engineRequirementsPython.test.ts — a derivação de requirements de
 * PYTHON e o DESPACHANTE por linguagem (`engine/quality/requirements.ts`).
 *
 * O DEFEITO QUE ESTA SUÍTE TRAVA. Até `main@26dbc19`:
 *
 *     cd app && npx tsx tools/track-engine/cli.ts requirements python
 *     → 21/21 `[parse-falhou] … testsCode não parseia — '=' expected.`
 *
 * A derivação lia TODO teste com `ts.createSourceFile` e a única trilha do
 * produto é Python. Reprovava fechado (certo) e não media nada (inútil).
 *
 * O que se prova aqui:
 *   1. a forma `stdout` (`runpy.run_path("solucao.py")` + `assertEqual`) rende
 *      UM requirement por `def test_…`, com descrição derivada do literal REAL;
 *   2. a forma `import` (`from solucao import somar`) rende a descrição de
 *      função e a cobertura de átomos DA SOLUÇÃO;
 *   3. na forma `stdout` a cobertura é VAZIA — e isso é DECLARADO, não
 *      esquecido (o alvo do assert é o helper do próprio teste);
 *   4. a bijeção usa o NOME DO MÉTODO, nos dois sentidos;
 *   5. FAIL-CLOSED: Python que não parseia LANÇA; linguagem sem derivação
 *      LANÇA; linguagem desconhecida LANÇA — nunca "zero testes reconhecidos";
 *   6. o lado JavaScript continua idêntico (nenhuma regressão de despachante).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EngineLinguagemError } from '../electron/main/engine/extract';
import { LanguageRegistryError } from '../electron/main/engine/lang/registry';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import {
  LINGUAGENS_COM_REQUIREMENTS,
  derivarRequirements,
  validarRequirements,
} from '../electron/main/engine/quality/requirements';

const TEM_PYTHON = pythonAdapter.detect().version !== null;

/** O harness `stdout` — o que os 21 desafios da trilha `python` usam. */
const TESTS_STDOUT = [
  'import contextlib',
  'import io',
  'import runpy',
  'import unittest',
  '',
  '',
  'def rodar():',
  '    """Roda solucao.py do zero e devolve tudo o que ele imprimiu."""',
  '    saida = io.StringIO()',
  '    with contextlib.redirect_stdout(saida):',
  '        runpy.run_path("solucao.py")',
  '    return saida.getvalue()',
  '',
  '',
  'class TestPotencia(unittest.TestCase):',
  '    def test_imprime_dois_elevado_a_vinte(self):',
  '        """o programa imprime 2 ** 20"""',
  '        self.assertEqual(rodar(), "1048576\\n")',
  '',
].join('\n');

/** O harness `import` — o que `docs/17` promete a partir da virada em M4. */
const TESTS_IMPORT = [
  'import unittest',
  '',
  'from solucao import somar',
  '',
  '',
  'class TestSomar(unittest.TestCase):',
  '    def test_soma_dois_numeros(self):',
  '        self.assertEqual(somar(2, 3), 5)',
  '',
  '    def test_soma_com_zero(self):',
  '        self.assertEqual(somar(0, 0), 0)',
  '',
].join('\n');

const SOLUCAO_IMPORT = 'def somar(a, b):\n    return a + b\n';

describe('requirements (python) — a derivação da forma `stdout`', {
  skip: !TEM_PYTHON ? 'python3 ausente' : false,
}, () => {
  it('rende UM requirement por `def test_…`, com o LITERAL real do assert', () => {
    const r = derivarRequirements(TESTS_STDOUT, 'print(2 ** 20)\n', '', 'python');
    assert.equal(r.requirements.length, 1, 'o helper `rodar` NÃO é teste');
    assert.equal(r.requirements[0].id, 'REQ-1');
    assert.equal(r.requirements[0].teste, 'test_imprime_dois_elevado_a_vinte');
    assert.equal(r.requirements[0].descricao, 'O programa deve imprimir exatamente "1048576\\n".');
  });

  it('a cobertura sai VAZIA na forma `stdout`, e isso é DECLARADO', () => {
    // O alvo do assert é `rodar()`, um helper do PRÓPRIO teste: os átomos dele
    // (io, contextlib, runpy, unittest) são o HARNESS, nunca o que o desafio
    // cobra. É a mesma decisão de `minimalPython.ts` para o seu `atomsDoTeste`.
    const r = derivarRequirements(TESTS_STDOUT, 'print(2 ** 20)\n', '', 'python');
    assert.deepEqual(r.cobertura, [{ requirementId: 'REQ-1', atoms: [] }]);
  });
});

describe('requirements (python) — a derivação da forma `import`', {
  skip: !TEM_PYTHON ? 'python3 ausente' : false,
}, () => {
  it('descreve a função, os argumentos e o esperado REAIS', () => {
    const r = derivarRequirements(TESTS_IMPORT, SOLUCAO_IMPORT, '', 'python');
    assert.equal(r.requirements.length, 2);
    assert.deepEqual(
      r.requirements.map((x) => x.teste),
      ['test_soma_dois_numeros', 'test_soma_com_zero'],
    );
    assert.equal(
      r.requirements[0].descricao,
      'A função somar deve devolver 5 quando chamada com 2, 3.',
    );
  });

  it('a cobertura são os átomos do trecho da SOLUÇÃO que declara a função chamada', () => {
    const r = derivarRequirements(TESTS_IMPORT, SOLUCAO_IMPORT, '', 'python');
    const atoms = r.cobertura[0].atoms;
    assert.ok(atoms.includes('op:binary:+'), atoms.join(', '));
    assert.ok(
      !atoms.some((a) => a.startsWith('api:unittest')),
      `o harness do teste NÃO pode entrar na cobertura: ${atoms.join(', ')}`,
    );
  });
});

describe('requirements (python) — a bijeção pelo NOME DO MÉTODO', {
  skip: !TEM_PYTHON ? 'python3 ausente' : false,
}, () => {
  it('casa requirement declarado × `def test_…` nos dois sentidos', () => {
    const v = validarRequirements(
      TESTS_IMPORT,
      [
        { id: 'REQ-1', teste: 'test_soma_dois_numeros' },
        { id: 'REQ-2', teste: 'test_soma_com_zero' },
      ],
      'python',
    );
    assert.equal(v.ok, true);
    assert.deepEqual(v.semTeste, []);
    assert.deepEqual(v.testesSemRequirement, []);
    assert.equal(v.correspondencias.length, 2);
  });

  it('requirement declarado SEM método correspondente vira gap', () => {
    const v = validarRequirements(
      TESTS_IMPORT,
      [
        { id: 'REQ-1', teste: 'test_soma_dois_numeros' },
        { id: 'REQ-9', teste: 'test_que_nao_existe' },
      ],
      'python',
    );
    assert.equal(v.ok, false);
    assert.deepEqual(v.semTeste, ['REQ-9']);
    assert.deepEqual(v.testesSemRequirement, ['test_soma_com_zero']);
  });

  it('SEM campo `requirements` no desafio, todo teste fica sem requirement — o gap REAL da trilha', () => {
    const v = validarRequirements(TESTS_STDOUT, [], 'python');
    assert.equal(v.ok, false);
    assert.deepEqual(v.testesSemRequirement, ['test_imprime_dois_elevado_a_vinte']);
    assert.deepEqual(v.semTeste, [], 'nada declarado ⇒ nada declarado sem teste');
  });
});

describe('requirements — o despachante por linguagem (fail-closed)', () => {
  it('a tabela diz QUEM tem derivação escrita, e é explícita', () => {
    assert.deepEqual([...LINGUAGENS_COM_REQUIREMENTS], ['javascript', 'python']);
  });

  it('Python que NÃO parseia LANÇA — nunca um conjunto vazio silencioso', {
    skip: !TEM_PYTHON ? 'python3 ausente' : false,
  }, () => {
    assert.throws(
      () => derivarRequirements('def test_x(self:\n    pass\n', '', '', 'python'),
      /testsCode não parseia/,
    );
    assert.throws(
      () => validarRequirements('def test_x(self:\n    pass\n', [], 'python'),
      /testsCode não parseia/,
    );
  });

  it('linguagem REGISTRADA sem derivação (typescript) LANÇA EngineLinguagemError', () => {
    assert.throws(
      () => derivarRequirements(TESTS_IMPORT, '', '', 'typescript'),
      (e: unknown) => e instanceof EngineLinguagemError,
    );
    assert.throws(
      () => validarRequirements(TESTS_IMPORT, [], 'typescript'),
      (e: unknown) => e instanceof EngineLinguagemError,
    );
  });

  it('linguagem DESCONHECIDA continua lançando LanguageRegistryError no getAdapter', () => {
    assert.throws(
      () => derivarRequirements(TESTS_IMPORT, '', '', 'ruby' as never),
      (e: unknown) => e instanceof LanguageRegistryError,
    );
  });

  it('o lado JavaScript continua idêntico (o despachante não mexeu nele)', () => {
    const tests =
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" +
      "test('soma dois numeros', () => { assert.equal(somar(1, 1), 2); });\n";
    const r = derivarRequirements(tests, 'export function somar(a, b) {\n  return a + b;\n}\n', '');
    assert.equal(r.requirements.length, 1);
    assert.equal(r.requirements[0].teste, 'soma dois numeros');
    assert.equal(r.requirements[0].descricao, 'A função somar deve devolver 2 quando chamada com 1, 1.');
    assert.ok(r.cobertura[0].atoms.includes('op:binary:+'), r.cobertura[0].atoms.join(', '));
  });
});
