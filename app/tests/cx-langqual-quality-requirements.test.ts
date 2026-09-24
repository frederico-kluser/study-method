/**
 * tests/cx-langqual-quality-requirements.test.ts — CARACTERIZAÇÃO (golden
 * master) da derivação e validação de requirements
 * (`engine/quality/requirements.ts`). Rede de segurança para a refatoração.
 *
 * Contratos que mordem aqui:
 *   1. `derivarRequirements` produz UM requirement por teste declarado, id
 *      sequencial REQ-N na ordem do arquivo, descrição em pt-BR derivada do
 *      TEXTO REAL do assert ("A função X deve devolver Y quando chamada com
 *      Z."), nunca inventada; asserts múltiplos são unidos por " E "; teste
 *      sem assert tem descrição própria;
 *   2. `cobertura[].atoms` são os átomos das FUNÇÕES DA SOLUÇÃO chamadas pelos
 *      asserts; sem função correspondente cai no fallback dos átomos do trecho
 *      do assert (determinístico nos dois casos);
 *   3. `validarRequirements` implementa a BIJEÇÃO declarados × testes por nome
 *      NORMALIZADO (trim + colapsa espaços): requirement sem teste e teste sem
 *      requirement são gaps REPORTADOS nos dois sentidos, nunca silêncio;
 *   4. FAIL-CLOSED com erro ESTRUTURADO e nunca conjunto vazio silencioso:
 *      teste que não parseia → `RequirementsParseError`; linguagem desconhecida
 *      → `LanguageRegistryError` (do getAdapter); linguagem registrada SEM
 *      derivação escrita (typescript) → `EngineLinguagemError` nomeando o que
 *      falta — ler o parser errado inventaria violação de CONTEÚDO;
 *   5. O DESPACHANTE é por LINGUAGEM (js/python/c/rust — `test('nome')`,
 *      `def test_…`, `SM_TEST(slug)`, `#[test] fn`), e `language` ausente cai no
 *      default `javascript` (contrato histórico).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LanguageRegistryError } from '../electron/main/engine/lang/registry';
import { EngineLinguagemError } from '../electron/main/engine/extract';

import {
  derivarRequirements,
  validarRequirements,
  LINGUAGENS_COM_REQUIREMENTS,
  type RequirementDeclarado,
} from '../electron/main/engine/quality/requirements';

const L1_TESTS = [
  "import { test } from 'node:test';",
  "test('devolve o número 7', () => {",
  '  assert.equal(resposta(), 7);',
  '});',
  '',
].join('\n');
const L1_SOLUTION = 'export function resposta() {\n  return 7;\n}\n';

describe('requirements — (1) derivação JS: um requirement por test(), com o texto REAL', () => {
  it('ids REQ-N sequenciais na ordem dos testes, nome mapeado e descrição derivada do assert', () => {
    const dois = [
      "test('primeiro', () => { assert.equal(f(1), 2); });",
      "test('segundo', () => { assert.equal(f(2), 3); });",
      '',
    ].join('\n');
    const r = derivarRequirements(dois, 'function f(x) { return x + 1; }\n', '');
    assert.deepEqual(r.requirements.map((q) => q.id), ['REQ-1', 'REQ-2']);
    assert.deepEqual(r.requirements.map((q) => q.teste), ['primeiro', 'segundo']);
  });

  it('descrição: "A função X deve devolver Y quando chamada com Z." — com o TEXTO extraído', () => {
    const r = derivarRequirements(L1_TESTS, L1_SOLUTION, '');
    assert.equal(r.requirements.length, 1);
    assert.deepEqual(r.requirements[0], {
      id: 'REQ-1',
      descricao: 'A função resposta deve devolver 7.',
      teste: 'devolve o número 7',
    });
  });

  it('esperado identificador/literal é CITADO; esperado expressão complexa vira "o resultado esperado"; await é despelotado', () => {
    const tests =
      "test('a', () => { assert.equal(f(1), esperado); });\ntest('b', () => { assert.equal(await h(2), 3); });\ntest('c', () => { assert.equal(f(1), g(2)); });";
    const r = derivarRequirements(tests, 'function f(x) { return x; }\nfunction h(x) { return x + 1; }\nfunction g(x) { return x; }\n', '');
    assert.equal(r.requirements[0].descricao, 'A função f deve devolver esperado quando chamada com 1.');
    assert.equal(r.requirements[1].descricao, 'A função h deve devolver 3 quando chamada com 2.');
    assert.equal(r.requirements[2].descricao, 'A função f deve devolver o resultado esperado quando chamada com 1.');
  });

  it('assert.throws e assert.ok têm formas próprias; asserts múltiplos são unidos por " E "', () => {
    const tests =
      "test('a', () => { assert.throws(() => f()); assert.ok(g(1)); assert.equal(h(2), 3); });";
    const r = derivarRequirements(
      tests,
      'function f() { throw 1; }\nfunction g(x) { return x; }\nfunction h(x) { return x + 1; }\n',
      '',
    );
    assert.equal(
      r.requirements[0].descricao,
      'A função f deve lançar um erro. E O teste exige que g(1) seja verdadeiro. E A função h deve devolver 3 quando chamada com 2.',
    );
  });

  it('teste SEM assert tem descrição própria (nunca descrição inventada)', () => {
    const r = derivarRequirements("test('vazio', () => {});", 'function f() { return 1; }\n', '');
    assert.deepEqual(r.requirements[0], {
      id: 'REQ-1',
      descricao: "O teste 'vazio' não contém asserts.",
      teste: 'vazio',
    });
  });

  it('test.skip/test.only/test.todo também DECLARAM teste e vira requirement', () => {
    const tests = "test.skip('pulado', () => { assert.ok(f()); });\ntest.only('sozinho', () => {});\ntest.todo('afazer');";
    const r = derivarRequirements(tests, 'function f() { return true; }\n', '');
    assert.deepEqual(r.requirements.map((q) => q.teste), ['pulado', 'sozinho', 'afazer']);
  });

  it('cobertura: átomos das funções DA SOLUÇÃO chamadas pelos asserts', () => {
    const r = derivarRequirements(L1_TESTS, L1_SOLUTION, '');
    const atoms = r.cobertura[0].atoms;
    assert.equal(r.cobertura[0].requirementId, 'REQ-1');
    assert.ok(atoms.includes('node:ReturnStatement'));
    assert.ok(atoms.includes('node:NumericLiteral'));
  });

  it('função que NÃO está na solução cai no fallback: a lista EXATA de átomos do trecho do assert', () => {
    const r = derivarRequirements(
      "test('usa f', () => { assert.equal(f(1), 2); });",
      'export function outra() { return 1; }\n',
      '',
    );
    // O pin era sub-pinado (só `includes` de 3 chaves sobre as 7 produzidas —
    // `node:EndOfFileToken` etc. estavam livres para mudar em silêncio). A
    // lista abaixo é a EXATA produzida pelo fallback (`atomsDoTrechoDoAssert`,
    // sorted + únicos): qualquer chave a mais, a menos ou trocada — e qualquer
    // troca de ordem — vira teste vermelho. Decisão registrada no lote L04.
    assert.deepEqual(r.cobertura[0].atoms, [
      'api:assert.equal',
      'node:CallExpression',
      'node:EndOfFileToken',
      'node:ExpressionStatement',
      'node:Identifier',
      'node:NumericLiteral',
      'node:PropertyAccessExpression',
    ]);
  });
});

describe('requirements — (2) a BIJEÇÃO requirements declarados × testes', () => {
  it('bijeção completa ⇒ ok, com as correspondências casadas por nome real', () => {
    const v = validarRequirements(L1_TESTS, [{ id: 'REQ-1', teste: 'devolve o número 7' }]);
    assert.deepEqual(v, {
      ok: true,
      semTeste: [],
      testesSemRequirement: [],
      correspondencias: [{ requirementId: 'REQ-1', testName: 'devolve o número 7' }],
    });
  });

  it('requirement sem teste é gap REPORTADO (nunca silêncio)', () => {
    const v = validarRequirements(L1_TESTS, [
      { id: 'REQ-1', teste: 'devolve o número 7' },
      { id: 'REQ-2', teste: 'esse teste não existe' },
    ]);
    assert.equal(v.ok, false);
    assert.deepEqual(v.semTeste, ['REQ-2']);
    assert.deepEqual(v.testesSemRequirement, []);
  });

  it('teste sem requirement é gap REPORTADO no OUTRO sentido também', () => {
    const tests = L1_TESTS + "test('órfão', () => {});\n";
    const v = validarRequirements(tests, [{ id: 'REQ-1', teste: 'devolve o número 7' }]);
    assert.equal(v.ok, false);
    assert.deepEqual(v.semTeste, []);
    assert.deepEqual(v.testesSemRequirement, ['órfão']);
  });

  it('o casamento é por nome NORMALIZADO (trim + colapsa espaços)', () => {
    const declarados: RequirementDeclarado[] = [{ id: 'REQ-1', teste: '   devolve   o   número 7  ' }];
    const v = validarRequirements(L1_TESTS, declarados);
    assert.equal(v.ok, true);
    assert.equal(v.correspondencias[0].testName, 'devolve o número 7');
  });

  it('sem testes e sem declarações ⇒ bijeção vazia é completa (ok)', () => {
    const v = validarRequirements("test('a', () => {});\n", []);
    assert.deepEqual(v, {
      ok: false,
      semTeste: [],
      testesSemRequirement: ['a'],
      correspondencias: [],
    });
    const vazia = validarRequirements('', []);
    assert.deepEqual(vazia, { ok: true, semTeste: [], testesSemRequirement: [], correspondencias: [] });
  });
});

describe('requirements — (3) o despachante multi-linguagem e os erros ESTRUTURADOS', () => {
  it('LINGUAGENS_COM_REQUIREMENTS é a tabela escrita, em ordem estável', () => {
    assert.deepEqual([...LINGUAGENS_COM_REQUIREMENTS], ['c', 'javascript', 'python', 'rust']);
  });

  it('language ausente cai no DEFAULT javascript (contrato histórico)', () => {
    const comDefault = derivarRequirements(L1_TESTS, L1_SOLUTION, '');
    const explicito = derivarRequirements(L1_TESTS, L1_SOLUTION, '', 'javascript');
    assert.deepEqual(comDefault, explicito);
  });

  it('PYTHON: def test_…(self) + self.assert* — descrição e cobertura da função importada', () => {
    const tests = [
      'from unittest import TestCase',
      'from solucao import somar',
      'class T(TestCase):',
      '    def test_soma(self):',
      '        self.assertEqual(somar(1, 2), 3)',
      '',
    ].join('\n');
    const r = derivarRequirements(tests, 'def somar(a, b):\n    return a + b\n', '', 'python');
    assert.deepEqual(r.requirements[0], {
      id: 'REQ-1',
      descricao: 'A função somar deve devolver 3 quando chamada com 1, 2.',
      teste: 'test_soma',
    });
    assert.ok(r.cobertura[0].atoms.includes('op:binary:+'), 'átomo da função da SOLUÇÃO');
    assert.ok(r.cobertura[0].atoms.includes('node:Return'));
  });

  it('PYTHON: a bijeção casa por nome de método (def test_…)', () => {
    const tests = ['class T(TestCase):', '    def test_soma(self):', '        pass', ''].join('\n');
    const v = validarRequirements(tests, [{ id: 'REQ-1', teste: 'test_soma' }], 'python');
    assert.equal(v.ok, true);
  });

  it('PYTHON na forma STDOUT (runpy): "O programa deve imprimir exatamente X." e atoms VAZIA (harness não é cobrança)', () => {
    const tests = [
      'import unittest, runpy, io, contextlib',
      'def rodar():',
      '    saida = io.StringIO()',
      '    with contextlib.redirect_stdout(saida):',
      '        runpy.run_path("solucao.py", run_name="__main__")',
      '    return saida.getvalue()',
      'class T(TestCase):',
      '    def test_stdout(self):',
      '        self.assertEqual(rodar(), "oi\\\\n")',
      '',
    ].join('\n');
    const r = derivarRequirements(tests, 'print("oi")', '', 'python');
    assert.deepEqual(r.requirements[0], {
      id: 'REQ-1',
      descricao: 'O programa deve imprimir exatamente "oi\\\\n".',
      teste: 'test_stdout',
    });
    assert.deepEqual(r.cobertura[0].atoms, [], 'átomo do harness seria cobrança inventada — sai VAZIO por decisão');
  });

  it('C: bloco SM_TEST(slug) + checa_*(…) deriva o requirement pelo slug', () => {
    const tests = 'SM_TEST(dobro_de_2) { checa_int("2*2", dobro(2), 4, "dobro"); }\n';
    const r = derivarRequirements(tests, 'int dobro(int x) { return x * 2; }\n', '', 'c');
    assert.deepEqual(r.requirements[0], {
      id: 'REQ-1',
      descricao: 'A função dobro deve devolver 4 quando chamada com 2.',
      teste: 'dobro_de_2',
    });
    assert.ok(r.cobertura[0].atoms.includes('decl:func'), 'átomo da função da solução');
  });

  it('RUST: #[test] fn deriva o requirement pelo nome da função', () => {
    const tests = '#[test]\nfn dobro_de_2() { assert_eq!(dobro(2), 4); }\n';
    const r = derivarRequirements(tests, 'pub fn dobro(x: i32) -> i32 { x * 2 }\n', '', 'rust');
    assert.equal(r.requirements[0].teste, 'dobro_de_2');
    assert.equal(r.requirements[0].descricao, 'A função dobro deve devolver 4 quando chamada com 2.');
  });

  it('teste que NÃO parseia é ERRO ESTRUTURADO (RequirementsParseError) — nunca conjunto vazio', () => {
    assert.throws(
      () => derivarRequirements('test( {', '', ''),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.equal(e.name, 'RequirementsParseError');
        assert.match(e.message, /^requirements: testsCode não parseia — /);
        return true;
      },
    );
  });

  it('linguagem DESCONHECIDA lança LanguageRegistryError no getAdapter (fail-closed)', () => {
    assert.throws(
      () => derivarRequirements('x', '', '', 'golang' as never),
      (e: unknown) => {
        assert.ok(e instanceof LanguageRegistryError);
        assert.equal(e.code, 'ADAPTADOR_DESCONHECIDO');
        return true;
      },
    );
  });

  it('linguagem REGISTRADA sem derivação escrita (typescript) lança EngineLinguagemError nomeando o que falta', () => {
    assert.throws(
      () => derivarRequirements('x', '', '', 'typescript'),
      (e: unknown) => {
        assert.ok(e instanceof EngineLinguagemError);
        assert.match(e.message, /sem implementação para a linguagem "typescript"/);
        return true;
      },
    );
  });

  it('validarRequirements compartilha o mesmo fail-closed de parse', () => {
    assert.throws(
      () => validarRequirements('def(:', [], 'python'),
      (e: unknown) => {
        assert.equal((e as Error).name, 'RequirementsParseError');
        return true;
      },
    );
  });
});
