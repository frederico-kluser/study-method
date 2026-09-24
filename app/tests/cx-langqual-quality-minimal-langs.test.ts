/**
 * tests/cx-langqual-quality-minimal-langs.test.ts — CARACTERIZAÇÃO (golden
 * master) dos sintetizadores de código mínimo POR LINGUAGEM
 * (`engine/quality/minimalPython.ts`, `minimalRust.ts`, `minimalC.ts`). Rede
 * de segurança para a refatoração.
 *
 * Contratos que mordem aqui:
 *   1. Cada módulo lê o teste NA estrutura da linguagem (`def test_…`+`assert*`,
 *      `#[test]`+`assert_eq!`, `SM_TEST`+`checa_*`) e é fail-closed: parse
 *      quebrado ⇒ `{ok:false, error}` com código/l:c do adaptador;
 *   2. `gerarCandidatos*` é PURO e ordenado por minimalidade, com a SOLUÇÃO DE
 *      REFERÊNCIA sempre por ÚLTIMO quando a forma é reconhecida (literal
 *      primeiro expõe o EXCESSO; computação exige a referência); em forma
 *      DESCONHECIDA a referência NÃO entra (viraria "mínimo" que é o máximo);
 *   3. Literais: `decodificarReprDeStringPython` é fail-closed (escape fora da
 *      tabela ⇒ null — nunca inventa valor); `literalPythonDeString` é
 *      determinístico (sempre aspas duplas); `tipoDeLiteralRust` só infere
 *      escalares (o resto é null — nunca inventa tipo); C copia o FONTE do
 *      literal verbatim (a tabela de literais de C é o próprio fonte);
 *   4. `sintetizarCodigoMinimo{Python,Rust,C}`: PRIMEIRO candidato que passa no
 *      prover vence; `PARSE_FALHOU`/`SEM_SOLUCAO_ACESSIVEL`/`PROVER_FALHOU`
 *      cada um com `detail` (o de forma desconhecida EXPLICA a forma esperada);
 *      `atomsDoTeste` é VAZIO por DECISÃO (os átomos do teste são o harness);
 *   5. Os EMPTY_STUB são o ARQUIVO VAZIO (`''`) — `export {};` do default é JS e
 *      faria a prova 4 reprovar por sintaxe em vez de ausência de solução.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';

import {
  MINIMAL_PYTHON_LANGUAGE,
  MODULO_DA_SOLUCAO,
  ASSERTS_DE_COMPARACAO_PY,
  ASSERTS_PY,
  decodificarReprDeStringPython,
  literalPythonDeString,
  extrairLiteraisDoTestePython,
  localizarFuncoesNoStarterPy,
  candidatosDeImpressao,
  gerarCandidatosPython,
  PY_EMPTY_STUB_CODE,
  sintetizarCodigoMinimoPython,
} from '../electron/main/engine/quality/minimalPython';
import {
  MINIMAL_RUST_LANGUAGE,
  CRATE_DA_SOLUCAO,
  extrairLiteraisDoTesteRust,
  localizarFuncoesNoStarterRs,
  candidatoComCorpo,
  tipoDeLiteralRust,
  gerarCandidatosRust,
  RS_EMPTY_STUB_CODE,
  sintetizarCodigoMinimoRust,
} from '../electron/main/engine/quality/minimalRust';
import {
  MINIMAL_C_LANGUAGE,
  C_EMPTY_STUB_CODE,
  extrairLiteraisDoTesteC,
  formaDoTesteC,
  gerarCandidatosC,
  sintetizarCodigoMinimoC,
  type LiteraisDoTesteC,
} from '../electron/main/engine/quality/minimalC';

type VerdictFake = ChallengeProofsVerdict;

function proverFake(aprovado: (codigo: string) => boolean) {
  return async (input: { solutionCode: string }): Promise<VerdictFake> =>
    (aprovado(input.solutionCode)
      ? { valid: true }
      : { valid: false, failures: [] }) as unknown as VerdictFake;
}

function proverQueFalhaSempre() {
  return async (): Promise<VerdictFake> => {
    throw new Error('boom de infra');
  };
}

// ===========================================================================
// minimalPython
// ===========================================================================

const PY_TESTS_IMPORT = [
  'from unittest import TestCase',
  'from solucao import somar, eco',
  'class T(TestCase):',
  '    def test_soma(self):',
  '        self.assertEqual(somar(1, 2), 3)',
  '    def test_eco(self):',
  '        self.assertEqual(eco("oi"), "oi")',
  '',
].join('\n');

const PY_TESTS_STDOUT = [
  'import runpy',
  'def rodar():',
  '    runpy.run_path("solucao.py", run_name="__main__")',
  'class T(TestCase):',
  '    def test_tela(self):',
  '        self.assertEqual(rodar(), "oi\\n")',
  '',
].join('\n');

describe('minimalPython — leitura, literais e candidatos', () => {
  it('constantes do contrato: linguagem, módulo, stub vazio e as TABELAS de assert', () => {
    assert.equal(MINIMAL_PYTHON_LANGUAGE, 'python');
    assert.equal(MODULO_DA_SOLUCAO, 'solucao');
    assert.equal(PY_EMPTY_STUB_CODE, '', 'stub certo de Python é o módulo VAZIO, não export {};');
    assert.ok(ASSERTS_DE_COMPARACAO_PY.has('assertEqual'));
    assert.ok(ASSERTS_DE_COMPARACAO_PY.has('assertIs'));
    assert.ok(!ASSERTS_DE_COMPARACAO_PY.has('assertTrue'), 'assertTrue é unário, não comparação');
    assert.ok(ASSERTS_PY.has('assertTrue'));
    assert.ok(ASSERTS_PY.has('assertRaises'));
    for (const a of ASSERTS_DE_COMPARACAO_PY) {
      assert.ok(ASSERTS_PY.has(a), 'ASSERTS_PY é a união');
    }
  });

  it('decodificarReprDeStringPython: a tabela de escapes — e FAIL-CLOSED (fora dela é null)', () => {
    assert.equal(decodificarReprDeStringPython("'oi'"), 'oi');
    assert.equal(decodificarReprDeStringPython('"oi"'), 'oi');
    assert.equal(decodificarReprDeStringPython("'a\\nb'"), 'a\nb');
    assert.equal(decodificarReprDeStringPython("'a\\\\b'"), 'a\\b');
    assert.equal(decodificarReprDeStringPython("'\\x41'"), 'A');
    assert.equal(decodificarReprDeStringPython("'\\u00e9'"), 'é');
    assert.equal(decodificarReprDeStringPython("''"), '', 'repr de string vazia');
    assert.equal(decodificarReprDeStringPython("'abc"), null, 'sem aspa de fecho');
    assert.equal(decodificarReprDeStringPython("a'"), null, 'sem aspa de abertura');
    assert.equal(decodificarReprDeStringPython("'a\\ab'"), null, 'escape \\a fora da tabela ⇒ null');
    assert.equal(decodificarReprDeStringPython("'a'b'"), null, 'aspa não-escapada no corpo');
  });

  it('literalPythonDeString: sempre aspas duplas, escapes mínimos, determinístico', () => {
    assert.equal(literalPythonDeString('oi'), '"oi"');
    assert.equal(literalPythonDeString('a"b'), '"a\\"b"');
    assert.equal(literalPythonDeString('a\\b'), '"a\\\\b"');
    assert.equal(literalPythonDeString('a\nb'), '"a\\nb"');
    assert.equal(literalPythonDeString('\x01'), '"\\x01"');
    assert.equal(literalPythonDeString('ação'), '"ação"', 'não-ASCII imprimível vai literal');
  });

  it('extrairLiteraisDoTestePython: forma import — asserts com esperado/argumentos literais', () => {
    const r = extrairLiteraisDoTestePython(PY_TESTS_IMPORT);
    assert.ok(r.ok);
    assert.equal(r.dados.forma, 'import');
    assert.deepEqual(r.dados.funcoesAlvo, ['eco', 'somar']);
    const soma = r.dados.asserts[0];
    assert.equal(soma.assert, 'assertEqual');
    assert.equal(soma.funcao, 'somar');
    assert.equal(soma.esperado, '3');
    assert.deepEqual(soma.argumentos, ['1', '2']);
    const eco = r.dados.asserts[1];
    assert.equal(eco.funcao, 'eco');
    assert.equal(eco.esperadoTexto, 'oi', 'o valor da string é DECODIFICADO do repr');
  });

  it('forma stdout é marcada pelo runpy.run_path("solucao.py"); sem nada disso é desconhecida', () => {
    const stdout = extrairLiteraisDoTestePython(PY_TESTS_STDOUT);
    assert.ok(stdout.ok);
    assert.equal(stdout.dados.forma, 'stdout');
    assert.deepEqual(stdout.dados.funcoesAlvo, []);

    const desconhecida = extrairLiteraisDoTestePython('class T:\n    def test_a(self):\n        self.assertTrue(1)\n');
    assert.ok(desconhecida.ok);
    assert.equal(desconhecida.dados.forma, 'desconhecida');
  });

  it('teste que não parseia ⇒ {ok:false} com código/l:c — nunca exceção', () => {
    const r = extrairLiteraisDoTestePython('def f(:\n');
    assert.ok(!r.ok);
    assert.match(r.error, /^testsCode não parseia como Python \(PARSE_ERROR em \d+:\d+\)/);
  });

  it('localizarFuncoesNoStarterPy: def/async def com params na ordem; quebrado ⇒ []', () => {
    const fns = localizarFuncoesNoStarterPy('def somar(a, b):\n    return 0\n', ['somar']);
    assert.deepEqual(fns.map((f) => [f.nome, f.params]), [['somar', ['a', 'b']]]);
    assert.deepEqual(localizarFuncoesNoStarterPy('def f(:\n', ['f']), []);
  });

  it('candidatosDeImpressao: print() quando termina em \\n; end="" só depois; vazio é o arquivo vazio', () => {
    assert.deepEqual(candidatosDeImpressao('oi\n'), ['print("oi")\n', 'print("oi\\n", end="")\n']);
    assert.deepEqual(candidatosDeImpressao('oi'), ['print("oi", end="")\n']);
    assert.deepEqual(candidatosDeImpressao(''), ['']);
  });

  it('gerarCandidatosPython: stdout imprime (print + end="") e a SOLUÇÃO é a ÚLTIMA (dedup incluído)', () => {
    const r = extrairLiteraisDoTestePython(PY_TESTS_STDOUT);
    assert.ok(r.ok);
    const cs = gerarCandidatosPython('', 'print("oi")\n', r.dados);
    assert.deepEqual(cs, ['print("oi")\n', 'print("oi\\n", end="")\n', 'print("oi")\n'].filter((c, i, a) => a.indexOf(c) === i));
  });

  it('gerarCandidatosPython: import tem ECO primeiro (1 param) e LITERAL depois, solução no fim', () => {
    const r = extrairLiteraisDoTestePython(
      'from solucao import eco\nclass T:\n    def test_eco(self):\n        self.assertEqual(eco("x"), "x")\n',
    );
    assert.ok(r.ok);
    const starter = 'def eco(x):\n    return None\n';
    const solution = 'def eco(x):\n    return x\n';
    const cs = gerarCandidatosPython(starter, solution, r.dados);
    assert.deepEqual(cs, [
      'def eco(x):\n    return x\n',
      'def eco(x):\n    return "x"\n',
    ], 'a solução é adicionada por último — mas aqui ela DEDUPLICA com o candidato eco (texto idêntico)');
  });

  it('forma desconhecida NÃO recebe a referência (ela viraria "mínimo" máximo)', () => {
    const r = extrairLiteraisDoTestePython('class T:\n    def test_a(self):\n        self.assertTrue(1)\n');
    assert.ok(r.ok);
    assert.deepEqual(gerarCandidatosPython('', 'def f():\n    pass\n', r.dados), []);
  });
});

describe('minimalPython — sintetizarCodigoMinimoPython (fail-closed)', () => {
  const ctx = {
    starterCode: 'def eco(x):\n    return None\n',
    solutionCode: 'def eco(x):\n    return x\n',
    testsCode: 'from solucao import eco\nclass T:\n    def test_eco(self):\n        self.assertEqual(eco("oi"), "oi")\n',
    expectedTestCount: 1,
  };

  it('o PRIMEIRO candidato que passa vence — com atoms e atomsDoTeste VAZIO por decisão', async () => {
    const v = await sintetizarCodigoMinimoPython(proverFake((c) => c.includes('return x')), ctx);
    assert.ok(v.ok);
    assert.equal(v.minimalCode, 'def eco(x):\n    return x\n');
    assert.deepEqual(v.atomsDoTeste, [], 'os átomos do teste são o harness — nunca cobrança');
    assert.ok(v.atoms.length > 0);
    assert.equal(v.proofsValid, true);
  });

  it('todos reprovados ⇒ SEM_SOLUCAO_ACESSIVEL com os motivos; prover só falhando ⇒ PROVER_FALHOU', async () => {
    const v = await sintetizarCodigoMinimoPython(proverFake(() => false), ctx);
    assert.ok(!v.ok);
    assert.equal(v.reason, 'SEM_SOLUCAO_ACESSIVEL');
    assert.match(v.detail ?? '', /^nenhum dos \d+ candidato\(s\) passou/);

    const v2 = await sintetizarCodigoMinimoPython(proverQueFalhaSempre(), ctx);
    assert.ok(!v2.ok);
    assert.equal(v2.reason, 'PROVER_FALHOU');
    assert.match(v2.detail ?? '', /todas as \d+ tentativa\(s\) falharam por falha de infraestrutura/);
    assert.match(v2.detail ?? '', /boom de infra/, 'os motivos entram no detail');
  });

  it('PARSE_FALHOU com o erro do adaptador; forma desconhecida EXPLICA a forma esperada', async () => {
    const v = await sintetizarCodigoMinimoPython(proverFake(() => true), { ...ctx, testsCode: 'def f(:\n' });
    assert.ok(!v.ok);
    assert.equal(v.reason, 'PARSE_FALHOU');

    const v2 = await sintetizarCodigoMinimoPython(proverFake(() => true), {
      ...ctx,
      testsCode: 'class T:\n    def test_a(self):\n        self.assertTrue(1)\n',
    });
    assert.ok(!v2.ok);
    assert.equal(v2.reason, 'SEM_SOLUCAO_ACESSIVEL');
    assert.match(v2.detail ?? '', /forma de teste de Python não reconhecida/);
    assert.match(v2.detail ?? '', /runpy\.run_path\("solucao\.py"\)/);
    assert.match(v2.detail ?? '', /nem importa de solucao \(forma import\)/);
  });
});

// ===========================================================================
// minimalRust
// ===========================================================================

const RS_TESTS = [
  'use desafio::{dobro, eco};',
  '#[test]',
  'fn t_soma() { assert_eq!(dobro(2), 4); }',
  '#[test]',
  'fn t_eco() { assert_eq!(eco("oi"), "oi"); }',
  '',
].join('\n');

describe('minimalRust — leitura, tipos e candidatos', () => {
  it('constantes do contrato: linguagem, crate e stub vazio', () => {
    assert.equal(MINIMAL_RUST_LANGUAGE, 'rust');
    assert.equal(CRATE_DA_SOLUCAO, 'desafio');
    assert.equal(RS_EMPTY_STUB_CODE, '', 'stub certo de Rust é o src/lib.rs VAZIO');
  });

  it('extrairLiteraisDoTesteRust: forma import pelo use desafio::…; assert_eq! com alvo/argumentos/esperado', () => {
    const r = extrairLiteraisDoTesteRust(RS_TESTS);
    assert.ok(r.ok);
    assert.equal(r.dados.forma, 'import');
    assert.deepEqual(r.dados.funcoesAlvo, ['dobro', 'eco']);
    const a = r.dados.asserts[0];
    assert.equal(a.assert, 'assert_eq!');
    assert.equal(a.funcao, 'dobro');
    assert.equal(a.alvo, 'dobro(2)');
    assert.equal(a.argumentosDaChamada, '2');
    assert.equal(a.esperado, '4');
  });

  it('assert! de um argumento não tem esperado; sem use desafio::… a forma é desconhecida; quebrado ⇒ {ok:false}', () => {
    const r = extrairLiteraisDoTesteRust('#[test]\nfn t() { assert!(x > 0); }\n');
    assert.ok(r.ok);
    assert.equal(r.dados.forma, 'desconhecida');
    assert.equal(r.dados.asserts[0].esperado, null);

    const q = extrairLiteraisDoTesteRust('fn f( {\n');
    assert.ok(!q.ok);
    assert.match(q.error, /^testsCode não parseia como Rust \(PARSE_ERROR em \d+:\d+\)/);
  });

  it('localizarFuncoesNoStarterRs traz a declaração INTEIRA e o offset do corpo; quebrado ⇒ []', () => {
    const fns = localizarFuncoesNoStarterRs('pub fn dobro(x: i32) -> i32 {\n    0\n}\n', ['dobro']);
    assert.equal(fns.length, 1);
    assert.equal(fns[0].nome, 'dobro');
    assert.equal(fns[0].texto, 'pub fn dobro(x: i32) -> i32 {\n    0\n}');
    assert.equal(fns[0].corpoStart, fns[0].texto.indexOf('{'));
    assert.deepEqual(localizarFuncoesNoStarterRs('fn f( {\n', ['f']), []);
  });

  it('candidatoComCorpo preserva a assinatura e troca SÓ o corpo', () => {
    const fns = localizarFuncoesNoStarterRs('pub fn dobro(x: i32) -> i32 {\n    0\n}\n', ['dobro']);
    assert.equal(candidatoComCorpo(fns[0], 'return x;'), 'pub fn dobro(x: i32) -> i32 {\n    return x;\n}\n');
  });

  it('tipoDeLiteralRust infere SÓ escalares — o resto é null (nunca inventa tipo)', () => {
    assert.equal(tipoDeLiteralRust('4'), 'i32');
    assert.equal(tipoDeLiteralRust('-3'), 'i32');
    assert.equal(tipoDeLiteralRust('2.5'), 'f64');
    assert.equal(tipoDeLiteralRust('true'), 'bool');
    assert.equal(tipoDeLiteralRust("'a'"), 'char');
    assert.equal(tipoDeLiteralRust('"oi"'), '&str');
    assert.equal(tipoDeLiteralRust('[1, 2]'), null);
    assert.equal(tipoDeLiteralRust('x'), null);
  });

  it('gerarCandidatosRust: ECO (1 param) e LITERAL pela assinatura do starter, solução POR ÚLTIMO', () => {
    const r = extrairLiteraisDoTesteRust('use desafio::eco;\n#[test]\nfn t() { assert_eq!(eco("oi"), "oi"); }\n');
    assert.ok(r.ok);
    const starter = 'pub fn eco(x: &str) -> &str {\n    ""\n}\n';
    const solution = 'pub fn eco(x: &str) -> &str {\n    x\n}\n';
    const cs = gerarCandidatosRust(starter, solution, r.dados);
    assert.deepEqual(cs, [
      'pub fn eco(x: &str) -> &str {\n    x\n}\n',
      'pub fn eco(x: &str) -> &str {\n    "oi"\n}\n',
    ], 'a solução é adicionada por último — mas aqui ela DEDUPLICA com o candidato eco (texto idêntico)');
  });

  it('sem starter: a assinatura é INFERIDA dos literais (p0: tipo) — e escalares só', () => {
    const r = extrairLiteraisDoTesteRust('use desafio::dobro;\n#[test]\nfn t() { assert_eq!(dobro(2), 4); }\n');
    assert.ok(r.ok);
    const cs = gerarCandidatosRust('', '', r.dados);
    assert.deepEqual(cs, ['pub fn dobro(p0: i32) -> i32 {\n    4\n}\n']);
  });

  it('forma desconhecida NÃO recebe a referência', () => {
    const r = extrairLiteraisDoTesteRust('#[test]\nfn t() { assert!(1 > 0); }\n');
    assert.ok(r.ok);
    assert.deepEqual(gerarCandidatosRust('', 'pub fn f() {}\n', r.dados), []);
  });
});

describe('minimalRust — sintetizarCodigoMinimoRust (fail-closed)', () => {
  const ctx = {
    starterCode: 'pub fn eco(x: &str) -> &str {\n    ""\n}\n',
    solutionCode: 'pub fn eco(x: &str) -> &str {\n    x\n}\n',
    testsCode: 'use desafio::eco;\n#[test]\nfn t() { assert_eq!(eco("oi"), "oi"); }\n',
    expectedTestCount: 1,
  };

  it('vencedor com atoms e atomsDoTeste VAZIO; reprovados ⇒ SEM_SOLUCAO; infra ⇒ PROVER_FALHOU', async () => {
    const v = await sintetizarCodigoMinimoRust(
      proverFake((c) => c === 'pub fn eco(x: &str) -> &str {\n    x\n}\n'),
      ctx,
    );
    assert.ok(v.ok);
    assert.equal(v.minimalCode, 'pub fn eco(x: &str) -> &str {\n    x\n}\n');
    assert.deepEqual(v.atomsDoTeste, []);
    assert.ok(v.atoms.length > 0);

    const v2 = await sintetizarCodigoMinimoRust(proverFake(() => false), ctx);
    assert.ok(!v2.ok);
    assert.equal(v2.reason, 'SEM_SOLUCAO_ACESSIVEL');

    const v3 = await sintetizarCodigoMinimoRust(proverQueFalhaSempre(), ctx);
    assert.ok(!v3.ok);
    assert.equal(v3.reason, 'PROVER_FALHOU');
  });

  it('PARSE_FALHOU e forma desconhecida com o motivo nominal', async () => {
    const v = await sintetizarCodigoMinimoRust(proverFake(() => true), { ...ctx, testsCode: 'fn f( {\n' });
    assert.ok(!v.ok);
    assert.equal(v.reason, 'PARSE_FALHOU');

    const v2 = await sintetizarCodigoMinimoRust(proverFake(() => true), {
      ...ctx,
      testsCode: '#[test]\nfn t() { assert!(1 > 0); }\n',
    });
    assert.ok(!v2.ok);
    assert.match(v2.detail ?? '', /forma de teste de Rust não reconhecida/);
    assert.match(v2.detail ?? '', /use desafio::/);
  });
});

// ===========================================================================
// minimalC
// ===========================================================================

const C_TESTS = [
  'int dobro(int x);',
  'SM_TEST(dobro_de_2) { checa_int("2*2", dobro(2), 4, "dobro"); }',
  '',
].join('\n');

describe('minimalC — leitura, formaDoTesteC e candidatos', () => {
  it('constantes do contrato: linguagem e stub vazio (unidade de tradução vazia)', () => {
    assert.equal(MINIMAL_C_LANGUAGE, 'c');
    assert.equal(C_EMPTY_STUB_CODE, '');
  });

  it('extrairLiteraisDoTesteC: protótipo vira assinatura SEM o ";" (o contrato do teste) e a checa_* vira verificação', () => {
    const r = extrairLiteraisDoTesteC(C_TESTS);
    assert.ok(r.ok);
    assert.equal(r.dados.prototipos.length, 1, 'só o protótipo do ALUNO — preâmbulo e test_/sm_/checa_* filtrados');
    assert.deepEqual(r.dados.prototipos[0].nome, 'dobro');
    assert.deepEqual(r.dados.prototipos[0].assinatura, 'int dobro(int x)');
    assert.deepEqual(r.dados.prototipos[0].params, ['x']);
    assert.deepEqual(r.dados.checas, [
      {
        helper: 'checa_int',
        chamadaAlvo: 'dobro',
        argumentosAlvo: ['2'],
        esperadoTexto: '4',
        esperadoKind: 'IntegerLiteral',
      },
    ]);
  });

  it('obtido que NÃO é chamada (captura de stdout) tem chamadaAlvo null; quebrado ⇒ {ok:false}', () => {
    const r = extrairLiteraisDoTesteC('void tela(void);\nSM_TEST(t) { char *linha = 0; checa_str("s", linha, "oi\\n", "tela"); }\n');
    assert.ok(r.ok);
    assert.equal(r.dados.checas[0].chamadaAlvo, null);

    const q = extrairLiteraisDoTesteC('int f( {\n');
    assert.ok(!q.ok);
    assert.match(q.error, /^testsCode não parseia como C \(PARSE_ERROR em \d+:\d+\)/);
  });

  it('formaDoTesteC decide pelos 4 baldes: impressao × valor × mista × desconhecida', () => {
    const base: LiteraisDoTesteC = { prototipos: [], checas: [] };
    const captura = { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: '"oi"', esperadoKind: 'StringLiteral' };
    const valor = { helper: 'checa_int', chamadaAlvo: 'dobro', argumentosAlvo: ['2'], esperadoTexto: '4', esperadoKind: 'IntegerLiteral' };
    assert.equal(formaDoTesteC(base), 'desconhecida');
    assert.equal(formaDoTesteC({ ...base, checas: [captura] }), 'impressao');
    assert.equal(formaDoTesteC({ ...base, checas: [valor] }), 'valor');
    assert.equal(formaDoTesteC({ ...base, checas: [captura, valor] }), 'mista');
  });

  it('gerarCandidatosC: UM printf (com as DUAS grafias deduplicadas) e a solução POR ÚLTIMO', () => {
    const dados: LiteraisDoTesteC = {
      prototipos: [{ nome: 'tela', assinatura: 'void tela(void)', params: [], start: 0 }],
      checas: [
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: '"oi\\n"', esperadoKind: 'StringLiteral' },
      ],
    };
    const solution = '#include <stdio.h>\nvoid tela(void) {\n    printf("oi\\n");\n}\n';
    const cs = gerarCandidatosC('', solution, dados);
    assert.deepEqual(cs, [
      '#include <stdio.h>\n\nvoid tela(void) {\n    printf("oi\\n");\n}\n',
      solution,
    ]);
  });

  it('gerarCandidatosC com DUAS linhas de saída: printf concatenado vem antes do printf por verificação', () => {
    const dados: LiteraisDoTesteC = {
      prototipos: [{ nome: 'tela', assinatura: 'void tela(void)', params: [], start: 0 }],
      checas: [
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: '"um\\n"', esperadoKind: 'StringLiteral' },
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: '"dois\\n"', esperadoKind: 'StringLiteral' },
      ],
    };
    const solution = 'void tela(void) {\n    printf("um\\n");\n    printf("dois\\n");\n}\n';
    const cs = gerarCandidatosC('', solution, dados);
    assert.deepEqual(cs, [
      '#include <stdio.h>\n\nvoid tela(void) {\n    printf("um\\n" "dois\\n");\n}\n',
      '#include <stdio.h>\n\nvoid tela(void) {\n    printf("um\\n");\n    printf("dois\\n");\n}\n',
      solution,
    ]);
  });

  it('gerarCandidatosC: ECO (return <param>) e LITERAL (return <esperado>) com a assinatura COPIDA do protótipo', () => {
    const dados: LiteraisDoTesteC = {
      prototipos: [{ nome: 'eco', assinatura: 'int eco(int x)', params: ['x'], start: 0 }],
      checas: [
        { helper: 'checa_int', chamadaAlvo: 'eco', argumentosAlvo: ['x'], esperadoTexto: 'x', esperadoKind: 'IntegerLiteral' },
        { helper: 'checa_int', chamadaAlvo: 'eco', argumentosAlvo: ['3'], esperadoTexto: '4', esperadoKind: 'IntegerLiteral' },
      ],
    };
    const solution = 'int eco(int x) {\n    return x;\n}\n';
    const cs = gerarCandidatosC('', solution, dados);
    assert.deepEqual(cs, [
      'int eco(int x) {\n    return x;\n}\n',
      'int eco(int x) {\n    return 4;\n}\n',
    ], 'a solução é adicionada por último — mas aqui ela DEDUPLICA com o candidato eco (texto idêntico)');
  });

  it('sem protótipo do aluno ⇒ ZERO candidatos (nada a definir)', () => {
    const dados: LiteraisDoTesteC = {
      prototipos: [],
      checas: [{ helper: 'checa_int', chamadaAlvo: 'f', argumentosAlvo: [], esperadoTexto: '1', esperadoKind: 'IntegerLiteral' }],
    };
    assert.deepEqual(gerarCandidatosC('', 'int f(void);\n', dados), []);
  });
});

describe('minimalC — sintetizarCodigoMinimoC (fail-closed)', () => {
  const ctx = {
    starterCode: 'int eco(int x);\n',
    solutionCode: 'int eco(int x) {\n    return x;\n}\n',
    testsCode: 'int eco(int x);\nSM_TEST(eco_1) { checa_int("eco", eco(3), 3, "eco"); }\n',
    expectedTestCount: 1,
  };

  it('vencedor com atoms e atomsDoTeste VAZIO; reprovados ⇒ SEM_SOLUCAO; infra ⇒ PROVER_FALHOU', async () => {
    const v = await sintetizarCodigoMinimoC(proverFake((c) => c.includes('return x;')), ctx);
    assert.ok(v.ok);
    assert.equal(v.minimalCode, 'int eco(int x) {\n    return x;\n}\n');
    assert.deepEqual(v.atomsDoTeste, []);
    assert.ok(v.atoms.length > 0);

    const v2 = await sintetizarCodigoMinimoC(proverFake(() => false), ctx);
    assert.ok(!v2.ok);
    assert.equal(v2.reason, 'SEM_SOLUCAO_ACESSIVEL');

    const v3 = await sintetizarCodigoMinimoC(proverQueFalhaSempre(), ctx);
    assert.ok(!v3.ok);
    assert.equal(v3.reason, 'PROVER_FALHOU');
  });

  it('PARSE_FALHOU e forma desconhecida com o motivo nominal (counter_protocol)', async () => {
    const v = await sintetizarCodigoMinimoC(proverFake(() => true), { ...ctx, testsCode: 'int f( {\n' });
    assert.ok(!v.ok);
    assert.equal(v.reason, 'PARSE_FALHOU');

    const v2 = await sintetizarCodigoMinimoC(proverFake(() => true), {
      ...ctx,
      testsCode: 'SM_TEST(sozinho) { }\n',
    });
    assert.ok(!v2.ok);
    assert.match(v2.detail ?? '', /forma de teste de C não reconhecida/);
    assert.match(v2.detail ?? '', /checa_int\/checa_long\/checa_double\/checa_char\/checa_str/);
  });
});
