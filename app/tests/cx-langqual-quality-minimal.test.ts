/**
 * tests/cx-langqual-quality-minimal.test.ts — CARACTERIZAÇÃO (golden master)
 * da síntese de CÓDIGO MÍNIMO (`engine/quality/minimal.ts`). Rede de segurança
 * para a refatoração.
 *
 * Contratos que mordem aqui:
 *   1. `extrairLiteraisDoTeste` é determinístico e fail-closed: teste que não
 *      parseia é `{ok:false, error}` (nunca exceção, nunca silêncio); funções
 *      alvo vêm do import do módulo `solution*` (ou do fallback dos callees de
 *      assert); cada literal traz assert/funcao/esperado serializado/
 *      argumentos literais (null = não-literal);
 *   2. `gerarCandidatos` é PURO e ordenado por MINIMALIDADE (ordem fixa):
 *      ECHO → LITERAL (até 3 distintos) → GAP DE BLOCO → EXPORT → PODA (só
 *      quando nada acima gerou candidato — a poda mascararia o sinal
 *      SEM_SOLUCAO); starter que não parseia ⇒ ZERO candidatos;
 *   3. `sintetizarCodigoMinimo` roda os candidatos pela ORDEM e devolve o
 *      PRIMEIRO que passa no prover injetado; todos reprovados ⇒
 *      `SEM_SOLUCAO_ACESSIVEL`; prover só falhando por INFRA ⇒
 *      `PROVER_FALHOU`; teste que não parseia ⇒ `PARSE_FALHOU` — cada um com
 *      `detail`, nunca veredito silencioso;
 *   4. `sintetizarEmLote` preserva a ORDEM dos ctxs (índice estável, nunca a
 *      ordem de conclusão) e limita concorrência por semáforo; a GUARDA de
 *      linguagem roda ANTES do lote (uma linguagem sem sintetizador derruba a
 *      chamada, não vira N vereditos);
 *   5. O MÓDULO É JAVASCRIPT-ONLY por decisão: pedir outra linguagem LANÇA
 *      `EngineLinguagemError` em todas as entradas públicas.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EngineLinguagemError } from '../electron/main/engine/extract';
import type { ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';

import {
  extrairLiteraisDoTeste,
  gerarCandidatos,
  sintetizarCodigoMinimo,
  contarLinhas,
  sintetizarEmLote,
  type MinimalCtx,
  type LiteraisDoTeste,
} from '../electron/main/engine/quality/minimal';

// ---------------------------------------------------------------------------
// Fixtures — os desafios L1 (resposta→7) e eco (mesma família dos testes de
// requirements), com o starter lacrado.
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

const ECO_TESTS = [
  "import { eco } from './solution.mjs';",
  "test('eco devolve o valor recebido', () => {",
  "  assert.equal(eco('oi'), 'oi');",
  '});',
  '',
].join('\n');
const ECO_SOLUTION = 'export function eco(texto) {\n  return texto;\n}\n';
const ECO_STARTER = 'export function eco(texto) {\n  // LACUNA: devolva o valor recebido\n}\n';

const CTX_L1: MinimalCtx = {
  starterCode: L1_STARTER,
  solutionCode: L1_SOLUTION,
  testsCode: L1_TESTS,
  expectedTestCount: 1,
};

/** Prover falso: aprova o candidato em que `aprovado(codigo)` é true. */
function proverFake(aprovado: (codigo: string) => boolean) {
  return async (input: { solutionCode: string }): Promise<ChallengeProofsVerdict> =>
    (aprovado(input.solutionCode) ? { valid: true } : { valid: false }) as unknown as ChallengeProofsVerdict;
}

function proverQueFalhaSempre() {
  return async (): Promise<ChallengeProofsVerdict> => {
    throw new Error('boom de infra');
  };
}

describe('minimal — (1) extrairLiteraisDoTeste: determinístico e fail-closed', () => {
  it('funções-alvo vêm do import do solution*; literais trazem assert/funcao/esperado/argumentos', () => {
    const r = extrairLiteraisDoTeste(L1_TESTS);
    assert.ok(r.ok);
    assert.deepEqual(r.dados.funcoesAlvo, ['resposta']);
    assert.deepEqual(r.dados.literais, [
      {
        assert: 'equal',
        funcao: 'resposta',
        esperado: '7',
        argumentos: [],
        trecho: 'assert.equal(resposta(), 7)',
      },
    ]);
  });

  it('argumentos literais são serializados; não-literal vira null; await é despelotado', () => {
    const tests = [
      "import { eco, soma } from './solution.mjs';",
      "assert.equal(eco('oi'), 'oi');",
      'assert.equal(soma(x, 2), 3);',
      'assert.equal(await eco(1), 1);',
    ].join('\n');
    const r = extrairLiteraisDoTeste(tests);
    assert.ok(r.ok);
    assert.deepEqual(r.dados.literais[0].argumentos, ["'oi'"]);
    assert.deepEqual(r.dados.literais[1].argumentos, [null, '2'], 'x não é literal ⇒ null');
    assert.deepEqual(r.dados.literais[2].argumentos, ['1'], 'await despelotado');
    assert.deepEqual(r.dados.funcoesAlvo, ['eco', 'soma'], 'ordenadas');
  });

  it('esperado só em assert de comparação; objetos/arrays de literais serializam como texto', () => {
    const tests = [
      "import { f } from './solution.mjs';",
      'assert.deepEqual(f(), { a: 1 });',
      "assert.ok(f());",
      'assert.throws(() => f());',
    ].join('\n');
    const r = extrairLiteraisDoTeste(tests);
    assert.ok(r.ok);
    assert.equal(r.dados.literais[0].esperado, '{ a: 1 }');
    assert.equal(r.dados.literais[1].esperado, null, 'ok não tem esperado');
    assert.equal(r.dados.literais[1].assert, 'ok');
    assert.equal(r.dados.literais[2].assert, 'throws');
  });

  it('SEM import de solution: fallback — todo callee de assert vira função-alvo', () => {
    const r = extrairLiteraisDoTeste('assert.equal(f(1), 2);\nassert.equal(g(1), 2);\n');
    assert.ok(r.ok);
    assert.deepEqual(r.dados.funcoesAlvo, ['f', 'g']);
  });

  it('teste que NÃO parseia ⇒ {ok:false, error} — nunca exceção, nunca conjunto vazio', () => {
    assert.deepEqual(extrairLiteraisDoTeste('assert.equal( {'), {
      ok: false,
      error: 'testsCode não parseia como JavaScript',
    });
  });

  it('é determinístico: mesma entrada, mesma saída', () => {
    assert.deepEqual(extrairLiteraisDoTeste(L1_TESTS), extrairLiteraisDoTeste(L1_TESTS));
  });
});

describe('minimal — (2) gerarCandidatos: ordem de MINIMALIDADE, puro e determinístico', () => {
  it('L1: o primeiro candidato é o LITERAL do esperado (corpo → return 7)', () => {
    const dados = extrairLiteraisDoTeste(L1_TESTS);
    assert.ok(dados.ok);
    const cs = gerarCandidatos(L1_STARTER, L1_SOLUTION, dados.dados);
    assert.deepEqual(cs, ['export function resposta() {\n  return 7;\n}\n']);
  });

  it('ECO: o primeiro candidato é o ECHO (return <param>) — e vem antes de qualquer literal', () => {
    const dados = extrairLiteraisDoTeste(ECO_TESTS);
    assert.ok(dados.ok);
    const cs = gerarCandidatos(ECO_STARTER, ECO_SOLUTION, dados.dados);
    assert.deepEqual(cs[0], 'export function eco(texto) {\n  return texto;\n}\n');
    assert.ok(cs.length >= 2, 'o literal do esperado ainda é candidato seguinte');
  });

  it('LITERAL: até 3 literais DISTINTOS, na ordem do teste (o 4º não entra)', () => {
    const tests = [
      "import { f } from './solution.mjs';",
      'assert.equal(f(), 1);',
      'assert.equal(f(), 2);',
      'assert.equal(f(), 3);',
      'assert.equal(f(), 1);',
      'assert.equal(f(), 4);',
    ].join('\n');
    const dados = extrairLiteraisDoTeste(tests);
    assert.ok(dados.ok);
    const cs = gerarCandidatos('export function f() {\n  return 0;\n}\n', 'export function f() {\n  return 0;\n}\n', dados.dados);
    const retornos = cs.filter((c) => c.includes('return ')).map((c) => /return (\S+);/.exec(c)?.[1]);
    assert.deepEqual(retornos.slice(0, 3), ['1', '2', '3']);
    assert.ok(!retornos.includes('4'), 'só 3 literais distintos');
  });

  it('sem a função-alvo no starter ⇒ candidato DO ZERO com o primeiro literal', () => {
    const dados = extrairLiteraisDoTeste(L1_TESTS);
    assert.ok(dados.ok);
    const cs = gerarCandidatos('export function outra() {\n  return 1;\n}\n', L1_SOLUTION, dados.dados);
    assert.deepEqual(cs, ['export function resposta() {\n  return 7;\n}']);
  });

  it('starter que NÃO parseia ⇒ ZERO candidatos (fail-closed — quem decide é o chamador)', () => {
    const dados = extrairLiteraisDoTeste(L1_TESTS);
    assert.ok(dados.ok);
    assert.deepEqual(gerarCandidatos('export function ( {', L1_SOLUTION, dados.dados), []);
  });

  it('PODA é ÚLTIMO recurso: só entra quando nenhum candidato de minimalidade existiu', () => {
    const soOk = [
      "import { f } from './solution.mjs';",
      'assert.ok(f());',
    ].join('\n');
    const dados = extrairLiteraisDoTeste(soOk);
    assert.ok(dados.ok);
    const solution = 'export function f() {\n  return true;\n}\n';
    const cs = gerarCandidatos(solution, solution, dados.dados);
    assert.deepEqual(cs, [solution], 'sem literal/eco/gap/export resta a PODA — e ela carrega a solução');
  });

  it('é PURO: mesma entrada, mesma saída', () => {
    const dados = extrairLiteraisDoTeste(ECO_TESTS);
    assert.ok(dados.ok);
    assert.deepEqual(
      gerarCandidatos(ECO_STARTER, ECO_SOLUTION, dados.dados),
      gerarCandidatos(ECO_STARTER, ECO_SOLUTION, dados.dados),
    );
  });
});

describe('minimal — (3) sintetizarCodigoMinimo: o primeiro candidato que passa vence', () => {
  it('o PRIMEIRO que passa no prover vence, com atoms do código mínimo e atomsDoTeste separados', async () => {
    // o literal errado (6) vem antes do certo (7) — o prover decide.
    const ctx: MinimalCtx = {
      starterCode: L1_STARTER,
      solutionCode: L1_SOLUTION,
      testsCode: L1_TESTS,
      expectedTestCount: 1,
    };
    const prover = proverFake((c) => c.includes('return 7'));
    const v = await sintetizarCodigoMinimo(prover, ctx);
    assert.ok(v.ok);
    assert.equal(v.minimalCode, 'export function resposta() {\n  return 7;\n}\n');
    assert.equal(v.proofsValid, true);
    assert.equal(v.lines, contarLinhas(v.minimalCode));
    assert.ok(v.atoms.includes('node:ReturnStatement'));
    assert.ok(v.atoms.includes('node:NumericLiteral'));
    assert.ok(v.atomsDoTeste.includes('node:CallExpression'), 'enriquecimento com o trecho do teste');
  });

  it('todos reprovados ⇒ SEM_SOLUCAO_ACESSIVEL com detail honesto', async () => {
    const v = await sintetizarCodigoMinimo(proverFake(() => false), CTX_L1);
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.reason, 'SEM_SOLUCAO_ACESSIVEL');
      assert.match(v.detail ?? '', /nenhum dos \d+ candidato\(s\) passou/);
    }
  });

  it('prover que SÓ falha por infra ⇒ PROVER_FALHOU (nunca SEM_SOLUCAO — senão o sinal mente)', async () => {
    const v = await sintetizarCodigoMinimo(proverQueFalhaSempre(), CTX_L1);
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.reason, 'PROVER_FALHOU');
      assert.match(v.detail ?? '', /todas as \d+ tentativa\(s\) falharam por falha de infraestrutura/);
    }
  });

  it('execError do veredito conta como falha de INFRA; veredito inválido comum não', async () => {
    const soExecError = async (): Promise<ChallengeProofsVerdict> =>
      ({ valid: false, execError: 'spawn morreu' }) as unknown as ChallengeProofsVerdict;
    const v = await sintetizarCodigoMinimo(soExecError, CTX_L1);
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.reason, 'PROVER_FALHOU');

    const soReprovado = proverFake(() => false);
    const v2 = await sintetizarCodigoMinimo(soReprovado, CTX_L1);
    assert.equal(v2.ok, false);
    if (!v2.ok) assert.equal(v2.reason, 'SEM_SOLUCAO_ACESSIVEL');
  });

  it('teste que não parseia ⇒ PARSE_FALHOU (fail-closed, com detail)', async () => {
    const v = await sintetizarCodigoMinimo(proverFake(() => true), {
      ...CTX_L1,
      testsCode: 'test( {',
    });
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.reason, 'PARSE_FALHOU');
      assert.equal(v.detail, 'testsCode não parseia como JavaScript');
    }
  });

  it('starter que não parseia ⇒ SEM_SOLUCAO_ACESSIVEL com o detail de "nenhum candidato"', async () => {
    const v = await sintetizarCodigoMinimo(proverFake(() => true), {
      ...CTX_L1,
      starterCode: 'function ( {',
    });
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.equal(v.reason, 'SEM_SOLUCAO_ACESSIVEL');
      assert.equal(v.detail, 'nenhum candidato mínimo gerado a partir do starter e dos literais do teste');
    }
  });
});

describe('minimal — (4) sintetizarEmLote: ordem estável, concorrência limitada, guarda ANTES', () => {
  it('resultados na MESMA ordem dos ctxs — nunca a ordem de conclusão', async () => {
    const ctxA: MinimalCtx = { ...CTX_L1, testsCode: L1_TESTS };
    const ecoDados = extrairLiteraisDoTeste(ECO_TESTS);
    assert.ok(ecoDados.ok);
    const ctxB: MinimalCtx = {
      starterCode: ECO_STARTER,
      solutionCode: ECO_SOLUTION,
      testsCode: ECO_TESTS,
      expectedTestCount: 1,
    };
    // o prover demora MAIS no primeiro ctx — a conclusão chega invertida.
    const prover = async (input: { solutionCode: string; testsCode: string }): Promise<ChallengeProofsVerdict> => {
      if (input.testsCode === L1_TESTS) await new Promise((r) => setTimeout(r, 30));
      return { valid: true } as unknown as ChallengeProofsVerdict;
    };
    const vs = await sintetizarEmLote(prover, [ctxA, ctxB]);
    assert.equal(vs.length, 2);
    assert.ok(vs[0].ok && vs[0].minimalCode.includes('resposta'), 'índice 0 = ctxA');
    assert.ok(vs[1].ok && vs[1].minimalCode.includes('eco'), 'índice 1 = ctxB');
  });

  it('concorrência LIMITADA pelo semáforo (a suíte observa o pico)', async () => {
    let ativos = 0;
    let pico = 0;
    const prover = async (): Promise<ChallengeProofsVerdict> => {
      ativos += 1;
      pico = Math.max(pico, ativos);
      await new Promise((r) => setTimeout(r, 5));
      ativos -= 1;
      return { valid: true } as unknown as ChallengeProofsVerdict;
    };
    const ctxs = [CTX_L1, CTX_L1, CTX_L1, CTX_L1];
    const vs = await sintetizarEmLote(prover, ctxs, { concorrencia: 1 });
    assert.equal(vs.length, 4);
    assert.equal(pico, 1, 'com concorrência 1 o pico de proveres simultâneos é 1');
  });

  it('a GUARDA de linguagem roda ANTES do lote: uma linguagem sem sintetizador derruba a chamada', async () => {
    const prover = proverFake(() => true);
    await assert.rejects(
      () => sintetizarEmLote(prover, [{ ...CTX_L1, language: 'python' }]),
      (e: unknown) => {
        assert.ok(e instanceof EngineLinguagemError);
        return true;
      },
    );
  });
});

describe('minimal — (5) contarLinhas e a guarda JAVASCRIPT-ONLY', () => {
  it('contarLinhas: split por \\n — vazio é 0, sem quebra é 1', () => {
    assert.equal(contarLinhas(''), 0);
    assert.equal(contarLinhas('x'), 1);
    assert.equal(contarLinhas('x\ny\nz'), 3);
    assert.equal(contarLinhas('x\n'), 2, 'split por \\n conta a linha vazia final');
  });

  it('todas as entradas públicas LANÇAM EngineLinguagemError fora de javascript', async () => {
    assert.throws(
      () => extrairLiteraisDoTeste(L1_TESTS, 'python'),
      (e: unknown) => e instanceof EngineLinguagemError,
    );
    const dados = {} as LiteraisDoTeste;
    assert.throws(
      () => gerarCandidatos('', '', dados, 'rust'),
      (e: unknown) => e instanceof EngineLinguagemError,
    );
    await assert.rejects(
      () => sintetizarCodigoMinimo(proverFake(() => true), { ...CTX_L1, language: 'c' }),
      (e: unknown) => e instanceof EngineLinguagemError,
    );
  });

  it('language ausente cai no DEFAULT javascript (contrato histórico)', async () => {
    const r = extrairLiteraisDoTeste(L1_TESTS);
    assert.ok(r.ok, 'sem language não lança');
  });
});
