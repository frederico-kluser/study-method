/**
 * tests/engineMinimalPython.test.ts — o SINTETIZADOR DE SOLUÇÃO MÍNIMA DE
 * PYTHON (`engine/quality/minimalPython.ts`) e o despachante por linguagem
 * (`engine/quality/minimalPorLinguagem.ts`).
 *
 * O DEFEITO QUE ESTE ARQUIVO TRAVA, medido em `main@26dbc19`:
 *
 *   $ npx tsx tools/track-engine/cli.ts coverage python
 *   desafios 21 · passou 0 · parse-falhou 21 · lacunas 0   [exit 0]
 *
 * Os 21 saíam com "testsCode não parseia como JavaScript" — a trilha é Python
 * e o sintetizador lia o teste com `ts.createSourceFile`. O primeiro bloco
 * daqui prova exatamente esse par: o MESMO `testsCode` que o leitor de
 * JavaScript rejeita é lido pelo leitor de Python, e produz os átomos certos.
 *
 * Nenhum teste depende de `app/resources/tracks` — o `testsCode` usado é a
 * fixture commitada `tests/fixtures/tracks/trilha-python-minima`, pela
 * convenção do repositório (commit 33b0eab: oráculo de teste não pode ser
 * conteúdo de produção).
 *
 * PROVER: os unitários usam um FAKE (nenhum spawn). O último bloco roda o
 * PROVER REAL (`criarProverDeDesafio` — spawn de `python3 -m unittest`) e
 * DECLARA a limitação quando não há interpretador na máquina, em vez de
 * passar verde sem ter provado nada (CONTRIBUTING: "se um gate depende de uma
 * ferramenta que falta, ele degrada declarando").
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { EngineLinguagemError } from '../electron/main/engine/extract';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import { extrairLiteraisDoTeste } from '../electron/main/engine/quality/minimal';
import {
  candidatosDeImpressao,
  decodificarReprDeStringPython,
  extrairLiteraisDoTestePython,
  gerarCandidatosPython,
  literalPythonDeString,
  sintetizarCodigoMinimoPython,
} from '../electron/main/engine/quality/minimalPython';
import {
  exigirSintetizadorMinimo,
  sintetizarCodigoMinimoDaLinguagem,
} from '../electron/main/engine/quality/minimalPorLinguagem';
import { criarProverDeDesafio } from '../electron/main/engine/phases/f9Verifier';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';

const FIXTURE = path.join(
  __dirname,
  'fixtures',
  'tracks',
  'trilha-python-minima',
  'modules',
  'modulo-1',
  'lessons',
  'a-primeira-linha',
  'challenges',
  'escreva-oi',
  'challenge.json',
);

interface DesafioFixture {
  starterCode: string;
  solutionCode: string;
  testsCode: string;
  expectedTestCount: number;
}

async function lerFixture(): Promise<DesafioFixture> {
  return JSON.parse(await fs.readFile(FIXTURE, 'utf8')) as DesafioFixture;
}

/** Prover FAKE que APROVA o primeiro candidato (nenhum spawn). */
function proverQueAprova(vistos: string[]): (i: ChallengeProofsInput) => Promise<ChallengeProofsVerdict> {
  return async (input) => {
    vistos.push(input.solutionCode);
    return { valid: true, failures: [], declared: input.expectedTestCount, executed: input.expectedTestCount };
  };
}

/** Prover FAKE que REPROVA todo candidato (o teste exige mais que literais). */
const proverQueReprova = async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
  valid: false,
  failures: [{ proof: 'solutionPasses', passed: false, reason: 'candidato reprovado pelo fake' }],
  declared: input.expectedTestCount,
  executed: 0,
});

/** Prover FAKE cuja INFRA falha sempre (o caso PROVER_FALHOU). */
const proverComFalhaDeInfra = async (): Promise<ChallengeProofsVerdict> => ({
  valid: false,
  failures: [{ proof: 'execError', passed: false, reason: 'boom' }],
  declared: 0,
  executed: 0,
  execError: 'boom de infraestrutura (fake)',
});

// ---------------------------------------------------------------------------
// 1. O PAR QUE PROVA A CEGUEIRA: o leitor de JavaScript recusa, o de Python lê
// ---------------------------------------------------------------------------

describe('minimalPython — a fixture que o leitor de JavaScript recusava', () => {
  it('o leitor de JavaScript REPROVA o testsCode de Python (o defeito medido)', async () => {
    const d = await lerFixture();
    const js = extrairLiteraisDoTeste(d.testsCode);
    assert.equal(js.ok, false, 'o testsCode de Python não pode parsear como JavaScript');
    if (!js.ok) assert.match(js.error, /não parseia como JavaScript/);
  });

  it('o leitor de Python LÊ o mesmo testsCode: forma stdout, 1 assert, esperado oi + quebra', async () => {
    const d = await lerFixture();
    const r = extrairLiteraisDoTestePython(d.testsCode);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.forma, 'stdout');
    assert.deepEqual(r.dados.funcoesAlvo, []);
    const comparacoes = r.dados.asserts.filter((a) => a.assert === 'assertEqual');
    assert.equal(comparacoes.length, 1);
    assert.equal(comparacoes[0].funcao, 'rodar');
    assert.equal(comparacoes[0].esperadoTexto, 'oi\n');
  });

  it('o candidato mínimo é print("oi") — e vem ANTES do que usa end=""', async () => {
    const d = await lerFixture();
    const r = extrairLiteraisDoTestePython(d.testsCode);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const candidatos = gerarCandidatosPython(d.starterCode, d.solutionCode, r.dados);
    assert.equal(candidatos[0], 'print("oi")\n');
    assert.equal(candidatos[1], 'print("oi\\n", end="")\n');
  });

  it('a síntese produz os ÁTOMOS DE PYTHON do código mínimo (não os de JavaScript)', async () => {
    const d = await lerFixture();
    const vistos: string[] = [];
    const v = await sintetizarCodigoMinimoPython(proverQueAprova(vistos), d);
    assert.equal(v.ok, true, 'o candidato mínimo passa nas provas (prover fake)');
    if (!v.ok) return;
    assert.equal(v.minimalCode, 'print("oi")\n');
    assert.deepEqual(v.atoms, [
      'global:print',
      'node:Call',
      'node:Expr',
      'node:Load',
      'node:Name',
      'node:StrLiteral',
    ]);
    assert.deepEqual(v.atomsDoTeste, []);
    assert.equal(v.proofsValid, true);
  });

  it('o prover recebe language=python e o STUB VAZIO de Python (arquivo vazio)', async () => {
    const d = await lerFixture();
    const recebidos: ChallengeProofsInput[] = [];
    const prover = async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => {
      recebidos.push(input);
      return { valid: true, failures: [], declared: 1, executed: 1 };
    };
    await sintetizarCodigoMinimoPython(prover, d);
    assert.equal(recebidos.length, 1);
    assert.equal(recebidos[0].language, 'python');
    assert.equal(recebidos[0].emptyStubCode, '', 'export {}; é JavaScript — num .py viraria SyntaxError');
  });
});

// ---------------------------------------------------------------------------
// 2. FAIL-CLOSED — nenhum caminho devolve veredito falso
// ---------------------------------------------------------------------------

describe('minimalPython — fail-closed (docs/16 §9.3)', () => {
  it('teste que não parseia como Python vira PARSE_FALHOU com linha e coluna', async () => {
    const v = await sintetizarCodigoMinimoPython(proverQueAprova([]), {
      starterCode: '',
      solutionCode: 'print("oi")\n',
      testsCode: 'class T(unittest.TestCase)\n    pass\n',
      expectedTestCount: 1,
    });
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'PARSE_FALHOU');
    assert.match(v.detail ?? '', /não parseia como Python/);
    assert.match(v.detail ?? '', /PARSE_ERROR em \d+:\d+/);
  });

  it('forma de teste desconhecida NÃO cai na solução de referência: SEM_SOLUCAO_ACESSIVEL', async () => {
    const testsCode =
      'import unittest\n\nimport solucao\n\n\n' +
      'class T(unittest.TestCase):\n' +
      '    def test_a(self):\n' +
      '        self.assertEqual(solucao.f(), 1)\n';
    const v = await sintetizarCodigoMinimoPython(proverQueAprova([]), {
      starterCode: 'def f():\n    pass\n',
      solutionCode: 'def f():\n    return 1\n',
      testsCode,
      expectedTestCount: 1,
    });
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'SEM_SOLUCAO_ACESSIVEL');
    assert.match(v.detail ?? '', /forma de teste de Python não reconhecida/);
  });

  it('nenhum candidato passa nas provas vira SEM_SOLUCAO_ACESSIVEL (nunca "passou")', async () => {
    const d = await lerFixture();
    const v = await sintetizarCodigoMinimoPython(proverQueReprova, d);
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'SEM_SOLUCAO_ACESSIVEL');
    assert.match(v.detail ?? '', /exige mais que/);
  });

  it('falha de INFRA em todas as tentativas vira PROVER_FALHOU (nunca SEM_SOLUCAO)', async () => {
    const d = await lerFixture();
    const v = await sintetizarCodigoMinimoPython(proverComFalhaDeInfra, d);
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'PROVER_FALHOU');
    assert.match(v.detail ?? '', /boom de infraestrutura/);
  });
});

// ---------------------------------------------------------------------------
// 3. A tabela de literais (repr do Python -> valor -> literal gerado)
// ---------------------------------------------------------------------------

describe('minimalPython — repr do Python e literal gerado', () => {
  it('decodifica os escapes que o repr() emite', () => {
    assert.equal(decodificarReprDeStringPython("'oi\\n'"), 'oi\n');
    assert.equal(decodificarReprDeStringPython('"tem \' dentro"'), "tem ' dentro");
    assert.equal(decodificarReprDeStringPython("'barra \\\\ dentro'"), 'barra \\ dentro');
    assert.equal(decodificarReprDeStringPython("'tab\\there'"), 'tab\there');
    assert.equal(decodificarReprDeStringPython("'\\x41'"), 'A');
    assert.equal(decodificarReprDeStringPython("'\\u00e7'"), 'ç');
    assert.equal(decodificarReprDeStringPython("'ção'"), 'ção');
  });

  it('fail-closed: repr fora da gramática devolve null (nunca um valor inventado)', () => {
    assert.equal(decodificarReprDeStringPython(''), null);
    assert.equal(decodificarReprDeStringPython("'sem fim"), null);
    assert.equal(decodificarReprDeStringPython("'\\N{BULLET}'"), null);
    assert.equal(decodificarReprDeStringPython("'\\xZZ'"), null);
  });

  it('o literal gerado é sempre de aspas duplas, com o mínimo de escapes', () => {
    assert.equal(literalPythonDeString('oi'), '"oi"');
    assert.equal(literalPythonDeString('a\nb'), '"a\\nb"');
    assert.equal(literalPythonDeString('aspa " dentro'), '"aspa \\" dentro"');
    assert.equal(literalPythonDeString("apostrofo ' dentro"), '"apostrofo \' dentro"');
  });

  it('a saída SEM quebra de linha final só tem o candidato com end=""', () => {
    assert.deepEqual(candidatosDeImpressao('sem quebra'), ['print("sem quebra", end="")\n']);
    assert.deepEqual(candidatosDeImpressao(''), ['']);
  });
});

// ---------------------------------------------------------------------------
// 4. O DESPACHANTE — a linguagem da trilha escolhe quem sintetiza
// ---------------------------------------------------------------------------

describe('minimalPorLinguagem — despacho fail-closed', () => {
  it('python despacha para o sintetizador de Python', async () => {
    const d = await lerFixture();
    const v = await sintetizarCodigoMinimoDaLinguagem(proverQueAprova([]), { ...d, language: 'python' });
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.minimalCode, 'print("oi")\n');
  });

  it('linguagem SEM sintetizador LANÇA EngineLinguagemError (nunca cai em JavaScript)', () => {
    assert.throws(
      () => exigirSintetizadorMinimo('typescript'),
      (err: unknown) => {
        assert.ok(err instanceof EngineLinguagemError);
        assert.match((err as Error).message, /javascript, python/);
        return true;
      },
    );
  });

  it('id que nem adaptador tem continua reprovando no registro', () => {
    assert.throws(() => exigirSintetizadorMinimo('ruby'));
  });
});

// ---------------------------------------------------------------------------
// 5. INTEGRAÇÃO — o prover REAL roda o runner de Python (spawn de verdade)
// ---------------------------------------------------------------------------

describe('minimalPython — prover REAL (spawn do runner de Python)', () => {
  it('o código mínimo passa nas provas do runner OFICIAL de Python', async (t) => {
    const detect = pythonAdapter.detect();
    if (!detect.ok) {
      // Degradação DECLARADA (CONTRIBUTING): sem interpretador não há como
      // provar nada aqui, e passar verde seria mentir sobre a cobertura.
      t.skip(`sem interpretador Python na máquina — ${detect.degradacao ?? 'toolchain ausente'}`);
      return;
    }
    const d = await lerFixture();
    const v = await sintetizarCodigoMinimoPython(criarProverDeDesafio(), d);
    assert.equal(v.ok, true, `esperado ok, veio: ${JSON.stringify(v)}`);
    if (!v.ok) return;
    assert.equal(v.minimalCode, 'print("oi")\n');
    assert.ok(v.atoms.includes('global:print'));
    assert.ok(v.atoms.includes('node:StrLiteral'));
  });
});
