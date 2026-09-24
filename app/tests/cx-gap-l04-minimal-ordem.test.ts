/**
 * tests/cx-gap-l04-minimal-ordem.test.ts — GAP de cobertura do lote L04: a
 * CADEIA COMPLETA de ordem de minimalidade dos candidatos de solução mínima,
 * com as posições do GAP DE BLOCO e do EXPORT e o DEDUPE entre etapas.
 *
 * Os irmãos `engineMinimal.test.ts` e `cx-langqual-quality-minimal*.test.ts`
 * já pinavam pedaços da ordem (eco primeiro, até 3 literais, poda por último,
 * referência ÚLTIMA em py/rust/c); o que NÃO estava pinado — e é exatamente o
 * que uma refatoração de `gerarCandidatos`/`gerarCandidatosRust` pode
 * embaralhar sem quebrar nada — é:
 *
 *   1. a ordem TOTAL JS `ECHO → LITERAL(≤3) → GAP DE BLOCO → EXPORT`, com os
 *      textos EXATOS de cada candidato (mudar a posição de qualquer etapa vira
 *      teste vermelho);
 *   2. o DEDUPE entre etapas: quando o candidato do GAP é byte a byte o mesmo
 *      do LITERAL, existe UM candidato só na lista (nunca dois iguais);
 *   3. o DEDUPE do Rust: ECO e LITERAL que renderizam o mesmo código viram UM
 *      candidato, e a solução de referência continua ÚLTIMA.
 *
 * Pins literais do plano do lote (lei): "ORDEM de minimalidade dos candidatos
 * (ECHO→LITERAL(3)→GAP→EXPORT→PODA; … Rust: eco→literal→referência) + dedupe".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extrairLiteraisDoTeste,
  gerarCandidatos,
} from '../electron/main/engine/quality/minimal';
import {
  extrairLiteraisDoTesteRust,
  gerarCandidatosRust,
} from '../electron/main/engine/quality/minimalRust';

describe('minimal JS — a cadeia COMPLETA de minimalidade (ECHO → LITERAL(3) → GAP → EXPORT)', () => {
  // A função-alvo NÃO é exportada e o starter tem comentário de topo (a lacuna
  // de `export`) E comentário de bloco dentro do corpo (a lacuna de GAP) — os
  // quatro estágios produzem candidatos DISTINTOS, todos observáveis na ordem.
  const STARTER = [
    '// complete a função',
    'function eco(texto) {',
    '  /* LACUNA: corpo */',
    '  return texto;',
    '}',
    '',
  ].join('\n');
  const SOLUTION = 'export function eco(texto) {\n  return texto;\n}\n';
  const TESTS = [
    "import { eco } from './solution.mjs';",
    "assert.equal(eco('oi'), 'oi');",
    "assert.equal(eco('a'), 'x1');",
    "assert.equal(eco('b'), 'x2');",
    "assert.equal(eco('c'), 'x3');",
    "assert.equal(eco('d'), 'x4');",
  ].join('\n');

  it('ordem EXATA: eco, 3 literais (o 4º não entra), gap com o 1º literal, export', () => {
    const dados = extrairLiteraisDoTeste(TESTS);
    assert.ok(dados.ok);
    const cs = gerarCandidatos(STARTER, SOLUTION, dados.dados);
    assert.deepEqual(cs, [
      // 1. ECHO — o teste devolve o próprio argumento (`eco('oi') === 'oi'`).
      '// complete a função\nexport function eco(texto) {\n  return texto;\n}\n',
      // 2..4. LITERAL — até 3 literais DISTINTOS, na ordem do teste ('oi' é o
      // esperado do assert de eco e ocupa a 1ª vaga; 'x3'/'x4' ficam de fora).
      "// complete a função\nfunction eco(texto) {\n  return 'oi';\n}\n",
      "// complete a função\nfunction eco(texto) {\n  return 'x1';\n}\n",
      "// complete a função\nfunction eco(texto) {\n  return 'x2';\n}\n",
      // 5. GAP DE BLOCO — só preenche a lacuna `/* … */` do corpo, com o
      // PRIMEIRO literal do teste.
      "// complete a função\nfunction eco(texto) {\n  'oi'\n  return texto;\n}\n",
      // 6. EXPORT — remove os comentários de topo e prefixa `export `.
      'export function eco(texto) {\n  /* LACUNA: corpo */\n  return texto;\n}\n',
    ]);
  });

  it('a PODA não entra quando existe candidato de minimalidade (ela carrega a solução inteira)', () => {
    const dados = extrairLiteraisDoTeste(TESTS);
    assert.ok(dados.ok);
    const cs = gerarCandidatos(STARTER, SOLUTION, dados.dados);
    assert.ok(!cs.includes(SOLUTION), 'a solução de referência só é candidato pela PODA (último recurso JS)');
    for (const c of cs) assert.ok(c !== SOLUTION);
  });

  it('DEDUPE: gap idêntico ao literal colapsa num candidato só (nunca dois iguais)', () => {
    const starter = 'export function resposta() {\n  return /* lacuna */;\n}\n';
    const solution = 'export function resposta() {\n  return 7;\n}\n';
    const tests = [
      "import { resposta } from './solution.mjs';",
      "test('devolve 7', () => { assert.equal(resposta(), 7); });",
    ].join('\n');
    const dados = extrairLiteraisDoTeste(tests);
    assert.ok(dados.ok);
    const cs = gerarCandidatos(starter, solution, dados.dados);
    // literal (`return 7;` no corpo) e gap (`/* lacuna */` → `7`) renderizam o
    // MESMO módulo: UM candidato, e o dedupe é da lista inteira.
    assert.deepEqual(cs, ['export function resposta() {\n  return 7;\n}\n']);
    assert.equal(new Set(cs).size, cs.length, 'nenhum candidato duplicado');
  });
});

describe('minimal Rust — eco/literal deduplicados e a referência ÚLTIMA', () => {
  it('ECO e LITERAL que renderizam o mesmo corpo viram UM candidato; a solução é a última', () => {
    const starter = 'pub fn eco(x: i32) -> i32 {\n    todo!()\n}\n';
    const solution = 'pub fn eco(x: i32) -> i32 {\n    // devolve o próprio argumento\n    x\n}\n';
    const tests = 'use desafio::eco;\n#[test]\nfn t() {\n    assert_eq!(eco(x), x);\n}\n';
    const dados = extrairLiteraisDoTesteRust(tests);
    assert.ok(dados.ok, dados.ok ? '' : dados.error);
    const cs = gerarCandidatosRust(starter, solution, dados.dados);
    // `assert_eq!(eco(x), x)` é ECO (argumento === esperado) E literal `x`:
    // os dois estágios renderizam `pub fn eco(x: i32) -> i32 { x }` — UM só.
    assert.deepEqual(cs, [
      'pub fn eco(x: i32) -> i32 {\n    x\n}\n',
      solution,
    ]);
    assert.equal(cs[cs.length - 1], solution, 'a referência é sempre o ÚLTIMO candidato');
  });

  it('a referência IDÊNTICA a um candidato menor também é deduplicada (nunca dois iguais)', () => {
    const starter = 'pub fn eco(x: i32) -> i32 {\n    todo!()\n}\n';
    const solution = 'pub fn eco(x: i32) -> i32 {\n    x\n}\n';
    const tests = 'use desafio::eco;\n#[test]\nfn t() {\n    assert_eq!(eco(x), x);\n}\n';
    const dados = extrairLiteraisDoTesteRust(tests);
    assert.ok(dados.ok, dados.ok ? '' : dados.error);
    const cs = gerarCandidatosRust(starter, solution, dados.dados);
    assert.deepEqual(cs, [solution]);
  });
});
