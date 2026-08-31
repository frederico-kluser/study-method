/**
 * tests/engineRevision.test.ts — a REVISÃO PROGRESSIVA (`engine/revision/
 * progressiva.ts`, onda 5 — o núcleo do pedido original do dono).
 *
 * Os unit tests usam um PROVER FAKE (mesmo padrão da Onda 1 — engineMinimal):
 * o fake importa o candidato como módulo ESM real via data URL e avalia os
 * asserts do teste (AST) com igualdade profunda. As trilhas são FIXTURES EM
 * MEMÓRIA (nenhum IO, nenhuma trilha real) — o orçamento por aula é injetado
 * por `orcamentoPorAula`, mantendo cada caso isolado e determinístico.
 *
 * Os 6 casos do contrato A4:
 *   1. desafio cobra construção fora do orçamento ⇒ precisaQuebrar=true + motivo
 *   2. desafio coberto ⇒ precisaQuebrar=false
 *   3. teste impossível ⇒ aula NÃO-revisável (fail-closed, nunca loopa)
 *   4. convergência em 2 iterações estáveis (hash)
 *   5. memória: o feedback da aula 1 aparece no contexto da aula 2
 *   6. SPLIT: minimalCode persistido como artefato (pendência mesmo sem LLM)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import * as ts from 'typescript';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource } from '../electron/main/content/trackTypes';
import { countTestDeclarations } from '../electron/main/engine/extract';
import {
  gravarRelatorio,
  revisarCurso,
  rodarRevisaoAteConvergir,
  type OrcamentoDeAula,
} from '../electron/main/engine/revision/progressiva';
import { sintetizarCodigoMinimo } from '../electron/main/engine/quality/minimal';
import type { ChallengeProofsInput, ChallengeProofsVerdict, ProofJudgement } from '../electron/main/engine/exec/proofs';
import { mkTempDir, rmrf, writeFile, readFile, fileExists } from './_helpers/fs';

// ---------------------------------------------------------------------------
// Prover FAKE — importa o candidato via data URL e avalia os asserts (AST)
// ---------------------------------------------------------------------------

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
    if (caso.metodo === 'throws') return false;
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
// Fixtures (regra 4: código mínimo de exemplo, sem conteúdo didático real)
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

function challengeDe(slug: string, over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: slug,
    concept: 'conceito',
    difficulty: 1,
    language: 'nodejs',
    statement: `# ${slug}`,
    starterCode: L1_STARTER,
    solutionCode: L1_SOLUTION,
    testsCode: L1_TESTS,
    expectedTestCount: 1,
    ...over,
  };
}

function lessonDe(slug: string, challenges: TrackChallengeSource[]): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: `Aula ${slug}`,
      summary: slug,
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: [],
      sources: [],
      challenges: challenges.map((c) => c.slug),
    },
    challenges,
  };
}

function moduloDe(slug: string, order: number, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
  };
}

function trackDe(modulos: LoadedModule[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      modules: modulos.map((m) => m.meta.slug),
    },
    modules: modulos,
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

/** Orçamento vazio: NENHUM átomo é coberto ⇒ tudo é lacuna. */
function orcamentoVazio(ref: string): OrcamentoDeAula {
  return { productive: new Set(), receptive: new Set(), introducesProductive: [], ref };
}

/** Orçamento que cobre EXATAMENTE os átomos dados (produtivo = receptivo). */
function orcamentoCobrindo(ref: string, atoms: string[]): OrcamentoDeAula {
  return { productive: new Set(atoms), receptive: new Set(atoms), introducesProductive: [], ref };
}

// ---------------------------------------------------------------------------
// Casos do contrato A4
// ---------------------------------------------------------------------------

describe('revision — LACUNA fora do orçamento ⇒ precisaQuebrar=true', () => {
  it('desafio cujo mínimo cobra construção fora do orçamento da aula vira SPLIT com motivo', async () => {
    const prover = criarProverFake();
    const track = trackDe([moduloDe('m1', 1, [lessonDe('l1', [challengeDe('resposta')])])]);

    const relatorio = await revisarCurso({
      track,
      prover,
      orcamentoPorAula: () => orcamentoVazio('m1/l1'),
    });

    assert.equal(relatorio.aulas.length, 1);
    const aula = relatorio.aulas[0];
    assert.equal(aula.precisaQuebrar, true);
    assert.equal(aula.naoRevisavel, undefined);
    assert.match(aula.motivo, /fora do orçamento/);
    assert.ok(aula.motivo.includes('node:NumericLiteral'), `motivo deveria citar o átomo: ${aula.motivo}`);
    // o que o teste REALMENTE cobra (atoms do mínimo) foi extraído
    assert.ok(aula.desafios[0].atomsCobrados.includes('node:NumericLiteral'));
    assert.ok(aula.desafios[0].foraDoOrcamento.includes('node:NumericLiteral'));
    // SPLIT registrado como pendência com o minimalCode pronto (nada se perde)
    assert.equal(relatorio.splitsPendentes.length, 1);
    assert.equal(relatorio.splitsPendentes[0].aula, 'm1/l1');
    assert.equal(relatorio.splitsPendentes[0].desafio, 'resposta');
    assert.ok(relatorio.splitsPendentes[0].minimalCode.includes('return 7;'));
    assert.ok(relatorio.placar.comLacuna === 1);
    assert.ok(relatorio.placar.cobertas === 0);
  });
});

describe('revision — aula COBERTA ⇒ precisaQuebrar=false', () => {
  it('quando o orçamento cobre os atoms do mínimo, a aula está coberta', async () => {
    const prover = criarProverFake();
    const track = trackDe([moduloDe('m1', 1, [lessonDe('l1', [challengeDe('resposta')])])]);

    // Átomos do mínimo = exatamente o que o teste cobra — orçamento cobre tudo.
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: L1_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, true);
    if (!veredito.ok) return;
    const atoms = veredito.atoms;

    const relatorio = await revisarCurso({
      track,
      prover,
      orcamentoPorAula: () => orcamentoCobrindo('m1/l1', atoms),
    });

    const aula = relatorio.aulas[0];
    assert.equal(aula.precisaQuebrar, false);
    assert.equal(aula.naoRevisavel, undefined);
    assert.deepEqual(aula.desafios[0].foraDoOrcamento, []);
    assert.deepEqual(aula.desafios[0].excesso, []);
    assert.equal(relatorio.placar.cobertas, 1);
    assert.equal(relatorio.placar.comLacuna, 0);
    assert.equal(relatorio.splitsPendentes.length, 0);
  });

  it('EXCESSO: introduces.productive não usado pelo mínimo é registrado (ajuste, não violação)', async () => {
    const prover = criarProverFake();
    const track = trackDe([moduloDe('m1', 1, [lessonDe('l1', [challengeDe('resposta')])])]);

    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: L1_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(veredito.ok, true);
    if (!veredito.ok) return;

    // A aula declara introduces.productive com um átomo que o teste NÃO cobra.
    const orcamento: OrcamentoDeAula = {
      productive: new Set(veredito.atoms),
      receptive: new Set(veredito.atoms),
      introducesProductive: ['op:binary:+'],
      ref: 'm1/l1',
    };
    const relatorio = await revisarCurso({ track, prover, orcamentoPorAula: () => orcamento });

    const aula = relatorio.aulas[0];
    assert.equal(aula.precisaQuebrar, false);
    assert.deepEqual(aula.desafios[0].excesso, ['op:binary:+']);
    assert.equal(relatorio.placar.comExcesso, 1);
    // excesso é decisão de ajuste — não gera split pendente.
    assert.equal(relatorio.splitsPendentes.length, 0);
  });
});

describe('revision — teste IMPOSSÍVEL ⇒ aula NÃO-revisável (fail-closed, sem loop)', () => {
  it('SEM_SOLUCAO_ACESSIVEL documenta a aula como não-revisável e o loop converge sem repetir', async () => {
    const prover = criarProverFake();
    const track = trackDe([
      moduloDe('m1', 1, [lessonDe('l1', [challengeDe('somar', { starterCode: SOMAR_STARTER, solutionCode: SOMAR_SOLUTION, testsCode: SOMAR_TESTS })])]),
    ]);

    const relatorio = await rodarRevisaoAteConvergir({
      revisarCurso: () =>
        revisarCurso({
          track,
          prover,
          orcamentoPorAula: () => orcamentoCobrindo('m1/l1', ['node:FunctionDeclaration', 'node:Identifier', 'op:binary:+']),
        }),
      maxIteracoes: 3,
    });

    const aula = relatorio.aulas[0];
    // fail-closed: não-revisável, documentada, NUNCA loopa — e não vira split
    // (sem mínimo não há lacuna determinável).
    assert.equal(aula.naoRevisavel, true);
    assert.equal(aula.precisaQuebrar, false);
    assert.match(aula.naoRevisavelMotivo ?? '', /SEM_SOLUCAO_ACESSIVEL/);
    assert.equal(aula.desafios[0].veredito.ok, false);
    if (!aula.desafios[0].veredito.ok) {
      assert.equal(aula.desafios[0].veredito.reason, 'SEM_SOLUCAO_ACESSIVEL');
    }
    assert.equal(relatorio.splitsPendentes.length, 0);
    // o loop terminou rápido e de forma estável — nada de iteração infinita.
    assert.equal(relatorio.convergencia, true);
    assert.equal(relatorio.iteracoes, 2);
    assert.equal(relatorio.placar.naoRevisaveis, 1);
  });
});

describe('revision — convergência por hash', () => {
  it('varredura determinística converge em 2 iterações estáveis', async () => {
    const prover = criarProverFake();
    const track = trackDe([
      moduloDe('m1', 1, [
        lessonDe('l1', [challengeDe('resposta')]),
        lessonDe('l2', [challengeDe('eco', { starterCode: ECHO_STARTER, solutionCode: ECHO_SOLUTION, testsCode: ECHO_TESTS })]),
      ]),
    ]);

    const vereditoL1 = await sintetizarCodigoMinimo(prover, {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: L1_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(vereditoL1.ok, true);
    if (!vereditoL1.ok) return;
    const vereditoEco = await sintetizarCodigoMinimo(prover, {
      starterCode: ECHO_STARTER,
      solutionCode: ECHO_SOLUTION,
      testsCode: ECHO_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(vereditoEco.ok, true);
    if (!vereditoEco.ok) return;

    const relatorio = await rodarRevisaoAteConvergir({
      revisarCurso: () =>
        revisarCurso({
          track,
          prover,
          orcamentoPorAula: (ref) =>
            ref.endsWith('/l1') ? orcamentoCobrindo(ref, vereditoL1.atoms) : orcamentoCobrindo(ref, vereditoEco.atoms),
        }),
      maxIteracoes: 3,
    });

    assert.equal(relatorio.convergencia, true);
    assert.equal(relatorio.iteracoes, 2);
    assert.equal(relatorio.placar.cobertas, 2);
    assert.equal(relatorio.placar.comLacuna, 0);
  });
});

describe('revision — MEMÓRIA entre aulas (progressividade)', () => {
  it('o feedback da aula 1 aparece como contexto da aula 2 no relatório', async () => {
    const prover = criarProverFake();
    const track = trackDe([
      moduloDe('m1', 1, [
        // aula 1 com lacuna (orçamento vazio) → split registrado
        lessonDe('l1', [challengeDe('resposta')]),
        // aula 2 coberta
        lessonDe('l2', [challengeDe('eco', { starterCode: ECHO_STARTER, solutionCode: ECHO_SOLUTION, testsCode: ECHO_TESTS })]),
      ]),
    ]);

    const vereditoEco = await sintetizarCodigoMinimo(prover, {
      starterCode: ECHO_STARTER,
      solutionCode: ECHO_SOLUTION,
      testsCode: ECHO_TESTS,
      expectedTestCount: 1,
    });
    assert.equal(vereditoEco.ok, true);
    if (!vereditoEco.ok) return;

    const relatorio = await revisarCurso({
      track,
      prover,
      orcamentoPorAula: (ref) =>
        ref.endsWith('/l1') ? orcamentoVazio(ref) : orcamentoCobrindo(ref, vereditoEco.atoms),
    });

    assert.equal(relatorio.aulas.length, 2);
    const aula1 = relatorio.aulas[0];
    const aula2 = relatorio.aulas[1];

    // aula 1: split; memória inicial vazia.
    assert.equal(aula1.precisaQuebrar, true);
    assert.equal(aula1.memoria.aulaAnterior, null);
    assert.deepEqual(aula1.memoria.lacunasVistas, []);

    // aula 2: o CONTEXTO carrega o feedback da aula 1 (progressividade).
    assert.equal(aula2.memoria.aulaAnterior, 'm1/l1');
    assert.ok(aula2.memoria.lacunasVistas.includes('node:NumericLiteral'), `lacunasVistas: ${aula2.memoria.lacunasVistas}`);
    assert.equal(aula2.memoria.decisoes.length, 1);
    assert.equal(aula2.memoria.decisoes[0].aula, 'm1/l1');
    assert.equal(aula2.memoria.decisoes[0].decisao, 'split');
    assert.equal(aula2.precisaQuebrar, false);

    // memória final: o que foi aprendido e reavaliado no curso inteiro.
    assert.equal(relatorio.memoriaFinal.aulaAnterior, 'm1/l2');
    assert.equal(relatorio.memoriaFinal.decisoes.length, 2);
    assert.deepEqual(
      relatorio.memoriaFinal.decisoes.map((d) => d.decisao),
      ['split', 'ok'],
    );
  });
});

describe('revision — SPLIT: nada se perde (artefato gravado mesmo sem LLM)', () => {
  it('gravarRelatorio persiste minimalCode + atoms como pendência em disco', async () => {
    const prover = criarProverFake();
    const track = trackDe([moduloDe('m1', 1, [lessonDe('l1', [challengeDe('resposta')])])]);

    const relatorio = await revisarCurso({
      track,
      prover,
      orcamentoPorAula: () => orcamentoVazio('m1/l1'),
    });
    assert.equal(relatorio.splitsPendentes.length, 1);

    const dir = await mkTempDir('engine-revision-');
    try {
      const gravado = await gravarRelatorio(relatorio, dir);

      // artefato JSON completo
      assert.ok(gravado.arquivos.includes(`${dir}/relatorio-revisao.json`));
      const json = JSON.parse(await readFile(`${dir}/relatorio-revisao.json`)) as { splitsPendentes: { minimalCode: string }[] };
      assert.equal(json.splitsPendentes.length, 1);

      // markdown pt-BR legível
      assert.ok(await fileExists(`${dir}/relatorio-revisao.md`));
      const md = await readFile(`${dir}/relatorio-revisao.md`);
      assert.match(md, /PRECISA QUEBRAR/);
      assert.match(md, /node:NumericLiteral/);

      // a SEMENTE do split: o minimalCode persistido como arquivo (pendência
      // registrada mesmo sem LLM na execução — o feedback nunca se perde).
      const seedPath = `${dir}/splits/m1__l1--resposta.minimal.mjs`;
      assert.ok(await fileExists(seedPath), `esperava ${seedPath}`);
      const seed = await readFile(seedPath);
      assert.ok(seed.includes('return 7;'), `semente: ${seed}`);
      assert.ok(await fileExists(`${dir}/splits/m1__l1--resposta.seed.json`));
      const seedJson = JSON.parse(await readFile(`${dir}/splits/m1__l1--resposta.seed.json`)) as { atoms: string[] };
      assert.ok(seedJson.atoms.includes('node:NumericLiteral'));
    } finally {
      await rmrf(dir);
    }
  });
});
