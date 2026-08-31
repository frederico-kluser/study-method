/**
 * tests/engineMinimal.test.ts — o SINTETIZADOR DETERMINÍSTICO de solução
 * mínima (`engine/quality/minimal.ts`).
 *
 * Os unit tests usam um PROVER FAKE (A-P07-2: a suíte não gera processo real
 * para os casos unitários): o fake importa o candidato como módulo ESM real
 * via data URL, avalia os asserts do teste (AST) com igualdade profunda e
 * devolve um `ChallengeProofsVerdict` determinístico. Um teste de INTEGRAÇÃO
 * roda o prover REAL (`criarProverDeDesafio` — spawn `node --test`) para
 * provar que o candidato gerado passa no runner oficial.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import * as ts from 'typescript';

import { countTestDeclarations } from '../electron/main/engine/extract';
import {
  contarLinhas,
  extrairLiteraisDoTeste,
  gerarCandidatos,
  sintetizarCodigoMinimo,
  type LiteralExtraido,
} from '../electron/main/engine/quality/minimal';
import { criarProverDeDesafio } from '../electron/main/engine/phases/f9Verifier';
import type { ChallengeProofsInput, ChallengeProofsVerdict, ProofJudgement } from '../electron/main/engine/exec/proofs';

// ---------------------------------------------------------------------------
// Prover FAKE — importa o candidato via data URL e avalia os asserts (AST)
// ---------------------------------------------------------------------------

/** Avalia um nó literal do AST para um valor JS (números, strings, bool, null, arrays, objetos). */
function avaliarLiteral(node: ts.Node): unknown {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(avaliarLiteral);
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {};
    for (const p of node.properties) {
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
        out[p.name.text] = avaliarLiteral(p.initializer);
      }
    }
    return out;
  }
  throw new Error(`literal não suportado pelo fake: ${node.kind}`);
}

interface CasoAssert {
  funcao: string;
  metodo: 'equal' | 'strictEqual' | 'deepEqual' | 'deepStrictEqual' | 'throws';
  args: unknown[];
  esperado?: unknown;
  avaliável: boolean;
}

interface BlocoDeTeste {
  nome: string;
  casos: CasoAssert[];
}

/** Extrai os asserts avaliáveis de cada test('nome', fn). */
function extrairBlocosDeTeste(testsCode: string): BlocoDeTeste[] {
  const source = ts.createSourceFile('tests.mjs', testsCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const blocos: BlocoDeTeste[] = [];

  const nomeDoMetodo = (call: ts.CallExpression): string | null => {
    const c = call.expression;
    if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === 'assert') {
      return c.name.text;
    }
    return null;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const ehTest =
        (ts.isIdentifier(callee) && callee.text === 'test') ||
        (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'test');
      if (ehTest && node.arguments.length >= 2 && ts.isStringLiteral(node.arguments[0])) {
        const casos: CasoAssert[] = [];
        const fn = node.arguments[1];
        const visitar = (n: ts.Node): void => {
          if (ts.isCallExpression(n)) {
            const metodo = nomeDoMetodo(n);
            if (metodo !== null) {
              const arg0 = n.arguments[0];
              if (
                (metodo === 'equal' || metodo === 'strictEqual' || metodo === 'deepEqual' || metodo === 'deepStrictEqual') &&
                arg0 &&
                ts.isCallExpression(arg0) &&
                ts.isIdentifier(arg0.expression)
              ) {
                const args = arg0.arguments;
                const argLit = args.map((a) => (isLiteralNode(a) ? avaliarLiteral(a) : undefined));
                const todosLiterais = argLit.every((v) => v !== undefined);
                const arg1 = n.arguments[1];
                const esperadoLit = arg1 && isLiteralNode(arg1) ? avaliarLiteral(arg1) : undefined;
                casos.push({
                  funcao: arg0.expression.text,
                  metodo: metodo as CasoAssert['metodo'],
                  args: todosLiterais ? (argLit as unknown[]) : [],
                  esperado: esperadoLit,
                  avaliável: todosLiterais && esperadoLit !== undefined,
                });
              } else if (metodo === 'throws' && arg0 && ts.isArrowFunction(arg0) && ts.isCallExpression(arg0.body) && ts.isIdentifier(arg0.body.expression)) {
                const args = arg0.body.arguments;
                const argLit = args.map((a) => (isLiteralNode(a) ? avaliarLiteral(a) : undefined));
                casos.push({
                  funcao: arg0.body.expression.text,
                  metodo: 'throws',
                  args: argLit.every((v) => v !== undefined) ? (argLit as unknown[]) : [],
                  avaliável: argLit.every((v) => v !== undefined),
                });
              } else {
                casos.push({ funcao: '', metodo: 'equal', args: [], avaliável: false });
              }
            }
          }
          ts.forEachChild(n, visitar);
        };
        visitar(fn);
        blocos.push({ nome: node.arguments[0].text, casos });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return blocos;
}

function isLiteralNode(node: ts.Node): boolean {
  if (ts.isNumericLiteral(node) || ts.isStringLiteral(node)) return true;
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isArrayLiteralExpression(node)) return node.elements.every((el) => isLiteralNode(el));
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && isLiteralNode(p.initializer));
  }
  return false;
}

async function importarComoModulo(code: string): Promise<{ ok: true; mod: Record<string, unknown> } | { ok: false }> {
  try {
    const url = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
    const mod = (await import(url)) as Record<string, unknown>;
    return { ok: true, mod };
  } catch {
    return { ok: false };
  }
}

function avaliarCaso(mod: Record<string, unknown>, caso: CasoAssert): boolean {
  if (!caso.avaliável) return false;
  const fn = mod[caso.funcao];
  if (typeof fn !== 'function') return false;
  try {
    const actual = fn(...caso.args);
    if (caso.metodo === 'throws') return false; // não lançou — o teste de throws falha
    const esperado = caso.esperado;
    if (caso.metodo === 'deepEqual' || caso.metodo === 'deepStrictEqual') {
      return isDeepStrictEqual(actual, esperado);
    }
    return actual === esperado;
  } catch {
    return caso.metodo === 'throws';
  }
}

/** Prover fake: importa o lado via data URL e roda os asserts com lógica real. */
function criarProverFake() {
  return async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => {
    const blocos = extrairBlocosDeTeste(input.testsCode);
    const declared = countTestDeclarations(input.testsCode);

    const rodarLado = async (code: string): Promise<number> => {
      const mod = await importarComoModulo(code);
      if (!mod.ok) return 0;
      let passaram = 0;
      for (const b of blocos) {
        if (b.casos.length > 0 && b.casos.every((c) => avaliarCaso(mod.mod, c))) passaram += 1;
      }
      return passaram;
    };

    const sol = await rodarLado(input.solutionCode);
    const starter = await rodarLado(input.starterCode);
    const stub = await rodarLado('export {};\n');

    const failures: ProofJudgement[] = [];
    if (sol !== blocos.length || blocos.length !== input.expectedTestCount) {
      failures.push({ proof: 'solutionPasses', passed: false, reason: `solução passou ${sol}/${blocos.length} blocos` });
    }
    if (starter === blocos.length) {
      failures.push({ proof: 'starterFails', passed: false, reason: 'starter passou em todos os blocos' });
    }
    if (declared !== input.expectedTestCount) {
      failures.push({ proof: 'countMatches', passed: false, reason: `declarados ${declared} ≠ esperados ${input.expectedTestCount}` });
    }
    if (stub === blocos.length) {
      failures.push({ proof: 'emptyStubFails', passed: false, reason: 'stub vazio passou' });
    }
    return { valid: failures.length === 0, failures, declared, executed: blocos.length };
  };
}

// ---------------------------------------------------------------------------
// Fixtures (regra 3: código mínimo de exemplo, sem conteúdo didático)
// ---------------------------------------------------------------------------

const L1_STARTER = 'export function resposta() {\n  return /* lacuna */;\n}\n';
const L1_SOLUTION = 'export function resposta() {\n  return 7;\n}\n';
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

const ECHO_STARTER = 'export function eco(texto) {\n  // LACUNA: devolva o valor recebido\n}\n';
const ECHO_SOLUTION = 'export function eco(texto) {\n  return texto;\n}\n';
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

const SOMAR_STARTER = 'export function somar(a, b) {\n  return /* lacuna */;\n}\n';
const SOMAR_SOLUTION = 'export function somar(a, b) {\n  return a + b;\n}\n';
const SOMAR_TESTS = [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { somar } from './solution.mjs';",
  '',
  "test('soma dois números', () => {",
  '  assert.equal(somar(2, 3), 5);',
  '  assert.equal(somar(10, 1), 11);',
  '});',
  '',
].join('\n');

describe('minimal — extrairLiteraisDoTeste (determinístico)', () => {
  it('extrai literais, função chamada e argumentos do assert', () => {
    const r = extrairLiteraisDoTeste(L1_TESTS);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.dados.funcoesAlvo, ['resposta']);
    assert.equal(r.dados.literais.length, 1);
    const l = r.dados.literais[0] as LiteralExtraido;
    assert.equal(l.assert, 'equal');
    assert.equal(l.funcao, 'resposta');
    assert.equal(l.esperado, '7');
    assert.deepEqual(l.argumentos, []);
  });

  it('extrai o eco com argumento literal e esperado igual', () => {
    const r = extrairLiteraisDoTeste(ECHO_TESTS);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const l = r.dados.literais[0] as LiteralExtraido;
    assert.equal(l.funcao, 'eco');
    assert.equal(l.esperado, "'oi'");
    assert.deepEqual(l.argumentos, ["'oi'"]);
  });

  it('fallback de função-alvo: callee do assert quando não há import da solução', () => {
    const r = extrairLiteraisDoTeste("import assert from 'node:assert/strict';\nassert.equal(resposta(), 7);\n");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.dados.funcoesAlvo, ['resposta']);
  });

  it('PARSE_FALHOU para teste que não parseia', () => {
    const r = extrairLiteraisDoTeste('import { test } from \'node:test\';\ntest(\'quebrado\', () => { assert.equal(; });\n');
    assert.equal(r.ok, false);
  });
});

describe('minimal — gerarCandidatos (puro, ordenado)', () => {
  it('gera candidato literal para o desafio L1', () => {
    const dados = extrairLiteraisDoTeste(L1_TESTS);
    assert.equal(dados.ok, true);
    if (!dados.ok) return;
    const candidatos = gerarCandidatos(L1_STARTER, L1_SOLUTION, dados.dados);
    assert.ok(candidatos.length > 0);
    assert.ok(candidatos[0].includes('return 7;'));
    // máximo ~8 candidatos, ordem fixa e determinística.
    assert.ok(candidatos.length <= 8);
  });

  it('gera candidato ECO antes do literal (minimalidade)', () => {
    const dados = extrairLiteraisDoTeste(ECHO_TESTS);
    assert.equal(dados.ok, true);
    if (!dados.ok) return;
    const candidatos = gerarCandidatos(ECHO_STARTER, ECHO_SOLUTION, dados.dados);
    assert.ok(candidatos.length > 0);
    assert.ok(candidatos[0].includes('return texto;'));
  });

  it('geração idempotente: mesma entrada, mesma saída', () => {
    const dados = extrairLiteraisDoTeste(L1_TESTS);
    assert.equal(dados.ok, true);
    if (!dados.ok) return;
    const a = gerarCandidatos(L1_STARTER, L1_SOLUTION, dados.dados);
    const b = gerarCandidatos(L1_STARTER, L1_SOLUTION, dados.dados);
    assert.deepEqual(a, b);
  });
});

describe('minimal — sintetizarCodigoMinimo com prover FAKE', () => {
  it('L1: minimal `return 7;` com atoms de NumericLiteral e ReturnStatement', async () => {
    const prover = criarProverFake();
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: L1_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, true);
    if (!veredito.ok) return;
    assert.ok(veredito.minimalCode.includes('return 7;'), `minimalCode: ${veredito.minimalCode}`);
    assert.ok(veredito.atoms.includes('node:NumericLiteral'));
    assert.ok(veredito.atoms.includes('node:ReturnStatement'));
    assert.ok(veredito.proofsValid);
    assert.ok(veredito.lines >= 1);
  });

  it('echo: minimal `return texto;` (param forwarding)', async () => {
    const prover = criarProverFake();
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: ECHO_STARTER,
      solutionCode: ECHO_SOLUTION,
      testsCode: ECHO_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, true);
    if (!veredito.ok) return;
    assert.ok(veredito.minimalCode.includes('return texto;'), `minimalCode: ${veredito.minimalCode}`);
    assert.ok(veredito.atoms.includes('node:Identifier'));
  });

  it('teste IMPOSSÍVEL (soma exige computação): SEM_SOLUCAO_ACESSIVEL', async () => {
    const prover = criarProverFake();
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: SOMAR_STARTER,
      solutionCode: SOMAR_SOLUTION,
      testsCode: SOMAR_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, false);
    if (veredito.ok) return;
    assert.equal(veredito.reason, 'SEM_SOLUCAO_ACESSIVEL');
  });

  it('PARSE_FALHOU quando o teste não parseia', async () => {
    const prover = criarProverFake();
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: 'import { test } from \'node:test\';\ntest(\'x\', () => { assert.equal(; });\n',
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, false);
    if (veredito.ok) return;
    assert.equal(veredito.reason, 'PARSE_FALHOU');
  });

  it('PROVER_FALHOU quando TODAS as tentativas falham por infra', async () => {
    const prover = async (): Promise<ChallengeProofsVerdict> => {
      throw new Error('infra quebrada');
    };
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: L1_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, false);
    if (veredito.ok) return;
    assert.equal(veredito.reason, 'PROVER_FALHOU');
  });
});

describe('minimal — integração com o prover REAL (spawn node --test)', () => {
  it('L1: o candidato mínimo passa no runner oficial', { timeout: 60_000 }, async () => {
    const prover = criarProverDeDesafio();
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: L1_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, true);
    if (!veredito.ok) return;
    assert.ok(veredito.minimalCode.includes('return 7;'));
    assert.ok(veredito.atoms.includes('node:NumericLiteral'));
    assert.ok(veredito.atoms.includes('node:ReturnStatement'));
  });

  it('teste IMPOSSÍVEL com prover REAL: SEM_SOLUCAO_ACESSIVEL', { timeout: 60_000 }, async () => {
    const prover = criarProverDeDesafio();
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: SOMAR_STARTER,
      solutionCode: SOMAR_SOLUTION,
      testsCode: SOMAR_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, false);
    if (veredito.ok) return;
    assert.equal(veredito.reason, 'SEM_SOLUCAO_ACESSIVEL');
  });
});

describe('minimal — contarLinhas', () => {
  it('conta linhas de um trecho', () => {
    assert.equal(contarLinhas(''), 0);
    assert.equal(contarLinhas('a\nb\nc'), 3);
    assert.equal(contarLinhas('export function f() {\n  return 1;\n}\n'), 4);
  });
});
