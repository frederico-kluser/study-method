/**
 * tests/cx-services-requirements.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/quality/requirements.ts` ANTES da refatoração de core/services.
 *
 * Fixa a derivação de requirements do arquivo de teste (um por `test('…')`,
 * descrições em pt-BR derivadas dos asserts REAIS), a BIJEÇÃO requirements
 * declarados × testes, o fail-closed de parse e o dispatch por linguagem.
 * Caminho JavaScript coberto por ser o default do contrato; os demais idiomas
 * (python/c/rust) têm derivação própria já coberta pelos testes de linguagem.
 * PURO: sem disco, sem rede, sem LLM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EngineLinguagemError } from '../electron/main/engine/extract';
import {
  LINGUAGENS_COM_REQUIREMENTS,
  derivarRequirements,
  validarRequirements,
} from '../electron/main/engine/quality/requirements';

const TESTS_JS = [
  "test('dobro de 2', () => {",
  '  assert.equal(dobro(2), 4);',
  '});',
  "test('lança com texto', () => {",
  "  assert.throws(() => parse('x'));",
  '});',
  "test('sem asserts', () => {",
  '  const y = 1;',
  '});',
].join('\n');

const SOLUTION_JS = [
  'export function dobro(x) {',
  '  return x * 2;',
  '}',
  "export function parse(t) {",
  "  if (!t) throw new Error('vazio');",
  '  return t;',
  '}',
].join('\n');

describe('cx/requirements: dispatch (tabela de linguagens com derivação)', () => {
  it('LINGUAGENS_COM_REQUIREMENTS é a tabela ESCRITA, em ordem estável', () => {
    assert.deepEqual(LINGUAGENS_COM_REQUIREMENTS, ['c', 'javascript', 'python', 'rust']);
  });

  it('linguagem REGISTRADA sem derivação ⇒ EngineLinguagemError (fail-closed, nunca vazio silencioso)', () => {
    assert.throws(
      () => derivarRequirements('test("a", () => {});', '', '', 'typescript'),
      (e: unknown) => {
        assert.ok(e instanceof EngineLinguagemError, `esperava EngineLinguagemError, veio ${String(e)}`);
        assert.equal(e.detalhes.pedido, 'typescript');
        assert.deepEqual(e.detalhes.suportado, LINGUAGENS_COM_REQUIREMENTS);
        return true;
      },
    );
    assert.throws(() => validarRequirements('test("a", () => {});', [], 'typescript'), EngineLinguagemError);
  });
});

describe('cx/requirements: derivarRequirements (javascript — default do contrato)', () => {
  it('um requirement por test(…), na ordem dos test() do arquivo, com ids REQ-<n>', () => {
    const { requirements, cobertura } = derivarRequirements(TESTS_JS, SOLUTION_JS, '');
    assert.deepEqual(
      requirements.map((r) => [r.id, r.teste]),
      [
        ['REQ-1', 'dobro de 2'],
        ['REQ-2', 'lança com texto'],
        ['REQ-3', 'sem asserts'],
      ],
    );
    assert.deepEqual(
      cobertura.map((c) => c.requirementId),
      ['REQ-1', 'REQ-2', 'REQ-3'],
    );
    for (const c of cobertura) assert.ok(Array.isArray(c.atoms));
  });

  it('descrições vêm do TEXTO REAL do assert (determinístico, pt-BR)', () => {
    const { requirements } = derivarRequirements(TESTS_JS, SOLUTION_JS, '');
    assert.equal(
      requirements[0].descricao,
      'A função dobro deve devolver 4 quando chamada com 2.',
    );
    assert.equal(
      requirements[1].descricao,
      "A função parse deve lançar um erro quando chamada com 'x'.",
    );
    assert.equal(requirements[2].descricao, "O teste 'sem asserts' não contém asserts.");
  });

  it('vários asserts no MESMO teste são unidos por " E " (ordem do corpo)', () => {
    const tests = [
      "test('dois asserts', () => {",
      '  assert.equal(f(1), 2);',
      '  assert.ok(f(2));',
      '});',
    ].join('\n');
    const { requirements } = derivarRequirements(tests, 'export function f(n) { return n + 1; }', '');
    assert.equal(requirements.length, 1);
    assert.equal(
      requirements[0].descricao,
      'A função f deve devolver 2 quando chamada com 1. E O teste exige que f(2) seja verdadeiro.',
    );
  });

  it('assert.equal com literal booleano/identificador nomeia o esperado verbatim', () => {
    const tests = [
      "test('bool', () => {",
      '  assert.equal(cheio(), true);',
      '});',
    ].join('\n');
    const { requirements } = derivarRequirements(tests, 'export function cheio() { return true; }', '');
    assert.equal(requirements[0].descricao, 'A função cheio deve devolver true.');
  });

  it('test.skip/test.only entram na derivação (callee de propriedade)', () => {
    const tests = [
      "test.skip('pulado', () => {",
      '  assert.ok(x);',
      '});',
      "test.only('focado', () => {",
      '  assert.ok(y);',
      '});',
    ].join('\n');
    const { requirements } = derivarRequirements(tests, '', '');
    assert.deepEqual(
      requirements.map((r) => r.teste),
      ['pulado', 'focado'],
    );
  });

  it('arquivo SEM test() ⇒ derivação VAZIA (diferente do fail-closed de parse)', () => {
    const { requirements, cobertura } = derivarRequirements('const nada = 1;', '', '');
    assert.deepEqual(requirements, []);
    assert.deepEqual(cobertura, []);
  });

  it('testsCode que NÃO parseia ⇒ RequirementsParseError (nunca conjunto vazio)', () => {
    assert.throws(
      () => derivarRequirements('const x = {', '', ''),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.equal(e.name, 'RequirementsParseError');
        assert.ok(e.message.startsWith('requirements: testsCode não parseia'));
        return true;
      },
    );
  });
});

describe('cx/requirements: validarRequirements (a BIJEÇÃO)', () => {
  const TESTS = ["test('um', () => {});", "test('dois', () => {});"].join('\n');

  it('bijeção completa ⇒ ok com as correspondências por nome', () => {
    const v = validarRequirements(TESTS, [
      { id: 'REQ-1', teste: 'um', descricao: 'x' },
      { id: 'REQ-2', teste: 'dois' },
    ]);
    assert.deepEqual(v, {
      ok: true,
      semTeste: [],
      testesSemRequirement: [],
      correspondencias: [
        { requirementId: 'REQ-1', testName: 'um' },
        { requirementId: 'REQ-2', testName: 'dois' },
      ],
    });
  });

  it('casamento por nome NORMALIZADO (trim + espaços colapsados)', () => {
    const v = validarRequirements(TESTS, [{ id: 'REQ-1', teste: '   um   ' }, { id: 'REQ-2', teste: 'd o i s' }]);
    // 'd o i s' NÃO casa 'dois' — só whitespace é normalizado.
    assert.deepEqual(v.semTeste, ['REQ-2']);
    assert.deepEqual(v.testesSemRequirement, ['dois']);
    assert.deepEqual(v.correspondencias, [{ requirementId: 'REQ-1', testName: 'um' }]);
    assert.equal(v.ok, false);

    const v2 = validarRequirements(TESTS, [{ id: 'REQ-1', teste: ' um ' }, { id: 'REQ-2', teste: 'dois  ' }]);
    assert.equal(v2.ok, true);
  });

  it('requirement sem teste ⇒ semTeste; teste sem requirement ⇒ testesSemRequirement', () => {
    const v = validarRequirements(TESTS, [{ id: 'REQ-9', teste: 'nao-existe' }]);
    assert.equal(v.ok, false);
    assert.deepEqual(v.semTeste, ['REQ-9']);
    assert.deepEqual(v.testesSemRequirement, ['um', 'dois']);
  });

  it('testsCode que não parseia LANÇA aqui também (fail-closed)', () => {
    assert.throws(
      () => validarRequirements('function ({{{', [], 'javascript'),
      (e: unknown) => (e as Error).name === 'RequirementsParseError',
    );
  });
});
