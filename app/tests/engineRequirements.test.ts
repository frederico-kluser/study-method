/**
 * tests/engineRequirements.test.ts — DERIVAÇÃO e VALIDAÇÃO determinísticas de
 * requirements (`engine/quality/requirements.ts`).
 *
 * Contratos que mordem aqui:
 *   1. `derivarRequirements` produz UM requirement por `test('nome', …)`, com
 *      id sequencial REQ-N, descrição em pt-BR derivada do TEXTO REAL do
 *      assert e nome do teste mapeado;
 *   2. `cobertura` carrega os átomos das funções da SOLUÇÃO chamadas pelos
 *      asserts daquele requirement;
 *   3. `validarRequirements` implementa a BIJEÇÃO requirements declarados ×
 *      test('…') — requirement sem teste e teste sem requirement são gaps
 *      reportados, nunca silêncio;
 *   4. teste que não parseia é ERRO (exceção estruturada), nunca um conjunto
 *      vazio silencioso.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  derivarRequirements,
  validarRequirements,
  type RequirementDeclarado,
} from '../electron/main/engine/quality/requirements';

// ---------------------------------------------------------------------------
// Fixtures — desafio L1 e o de eco (mesmos dos testes do minimal)
// ---------------------------------------------------------------------------

const L1_TESTS = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { resposta } from './solution.mjs';",
  '',
  "test('devolve o número 7', () => {",
  '  assert.equal(resposta(), 7);',
  '});',
  '',
].join('\n');

const L1_SOLUTION = 'export function resposta() {\n  return 7;\n}\n';
const L1_STARTER = 'export function resposta() {\n  return /* lacuna */;\n}\n';

const ECHO_TESTS = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { eco } from './solution.mjs';",
  '',
  "test('eco devolve o valor recebido', () => {",
  "  assert.equal(eco('oi'), 'oi');",
  '});',
  '',
].join('\n');

const ECHO_SOLUTION = 'export function eco(texto) {\n  return texto;\n}\n';
const ECHO_STARTER = 'export function eco(texto) {\n  // LACUNA: devolva o valor recebido\n}\n';

describe('requirements — derivarRequirements', () => {
  it('L1: um requirement com descrição derivada do assert real', () => {
    const r = derivarRequirements(L1_TESTS, L1_SOLUTION, L1_STARTER);
    assert.equal(r.requirements.length, 1);
    const req = r.requirements[0];
    assert.equal(req.id, 'REQ-1');
    assert.equal(req.teste, 'devolve o número 7');
    assert.match(req.descricao, /resposta/);
    assert.match(req.descricao, /devolver 7/);
  });

  it('L1: cobertura com átomos da função resposta na solução', () => {
    const r = derivarRequirements(L1_TESTS, L1_SOLUTION, L1_STARTER);
    assert.equal(r.cobertura.length, 1);
    const atoms = r.cobertura[0].atoms;
    assert.ok(atoms.includes('node:ReturnStatement'));
    assert.ok(atoms.includes('node:NumericLiteral'));
  });

  it('echo: descrição usa o texto real do argumento e do esperado', () => {
    const r = derivarRequirements(ECHO_TESTS, ECHO_SOLUTION, ECHO_STARTER);
    assert.equal(r.requirements.length, 1);
    const req = r.requirements[0];
    assert.match(req.descricao, /eco/);
    assert.match(req.descricao, /'oi'/);
    assert.ok(r.cobertura[0].atoms.includes('node:Identifier'));
  });

  it('dois test() geram dois requirements com ids sequenciais', () => {
    const tests = [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { f } from './solution.mjs';",
      '',
      "test('primeiro', () => { assert.equal(f(1), 2); });",
      "test('segundo', () => { assert.equal(f(2), 3); });",
      '',
    ].join('\n');
    const r = derivarRequirements(tests, 'export function f(x) {\n  return x + 1;\n}\n', 'export function f(x) {\n  throw new Error("não implementado");\n}\n');
    assert.deepEqual(r.requirements.map((q) => q.id), ['REQ-1', 'REQ-2']);
    assert.deepEqual(r.requirements.map((q) => q.teste), ['primeiro', 'segundo']);
  });

  it('teste que não parseia LANÇA erro estruturado (fail-closed)', () => {
    assert.throws(
      () => derivarRequirements('import { test } from \'node:test\';\ntest(\'x\', () => { assert.equal(; });\n', L1_SOLUTION, L1_STARTER),
      /não parseia/,
    );
  });
});

describe('requirements — validarRequirements (bijeção)', () => {
  it('bijeção completa quando todo requirement tem teste e todo teste tem requirement', () => {
    const declarados: RequirementDeclarado[] = [
      { id: 'REQ-1', descricao: 'A função resposta deve devolver 7.', teste: 'devolve o número 7' },
    ];
    const v = validarRequirements(L1_TESTS, declarados);
    assert.equal(v.ok, true);
    assert.deepEqual(v.semTeste, []);
    assert.deepEqual(v.testesSemRequirement, []);
    assert.equal(v.correspondencias.length, 1);
    assert.equal(v.correspondencias[0].requirementId, 'REQ-1');
    assert.equal(v.correspondencias[0].testName, 'devolve o número 7');
  });

  it('requirement declarado SEM teste correspondente vira gap semTeste', () => {
    const declarados: RequirementDeclarado[] = [
      { id: 'REQ-1', teste: 'devolve o número 7' },
      { id: 'REQ-2', teste: 'teste que não existe' },
    ];
    const v = validarRequirements(L1_TESTS, declarados);
    assert.equal(v.ok, false);
    assert.deepEqual(v.semTeste, ['REQ-2']);
  });

  it('teste SEM requirement declarado vira gap testesSemRequirement', () => {
    const declarados: RequirementDeclarado[] = [];
    const v = validarRequirements(L1_TESTS, declarados);
    assert.equal(v.ok, false);
    assert.deepEqual(v.semTeste, []);
    assert.deepEqual(v.testesSemRequirement, ['devolve o número 7']);
  });

  it('correspondência tolera espaçamento/trim no nome do teste', () => {
    const declarados: RequirementDeclarado[] = [{ id: 'REQ-1', teste: '  devolve   o número 7 ' }];
    const v = validarRequirements(L1_TESTS, declarados);
    assert.equal(v.ok, true);
    assert.equal(v.correspondencias.length, 1);
    assert.equal(v.correspondencias[0].testName, 'devolve o número 7');
  });

  it('teste que não parseia LANÇA erro estruturado (fail-closed)', () => {
    assert.throws(
      () => validarRequirements('import { test } from \'node:test\';\ntest(\'x\', () => { assert.equal(; });\n', []),
      /não parseia/,
    );
  });
});
