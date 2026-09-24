/**
 * app/electron/main/engine/quality/mutantsSuporte.ts — suporte do gerador de
 * mutantes (P-20): a prova por parser, a guarda JS-only e a FIXTURE válida de
 * calibração construída em memória.
 *
 * A prosa normativa vive na fachada `mutants.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { ChallengeDraftSchema } from '../schemas/artifacts';
import { exigirAdaptadorJavascript, extractAtoms } from '../extract';
import { adapterIdForChallengeLanguage } from '../lang/registry';
import { type Desafio, type DesafioParaMutacao } from './mutantsTipos';

/** Extrai as chaves de átomo de um trecho — a prova por parser das mutações. */
export function chavesDe(code: string): string[] {
  const resultado = extractAtoms(code);
  if (!resultado.ok) {
    throw new Error(
      `mutants: código com sintaxe inválida (${resultado.error.message} linha ${resultado.error.line}) — a mutação não pode ser medida`,
    );
  }
  return resultado.keys;
}

/**
 * GUARDA DE LINGUAGEM das entradas públicas. `desafio.language` é um TOKEN
 * (`'nodejs'` é o runtime do adaptador `javascript` — §6), então ele passa
 * primeiro pelo resolvedor do registro; token que não resolve para adaptador
 * nenhum cai na falha fail-closed de `getAdapter`, com a lista do que é válido.
 */
export function exigirJsDoDesafio(base: DesafioParaMutacao, fn: string): void {
  const token = String(base.desafio.language);
  exigirAdaptadorJavascript(
    `engine/quality/mutants.ts (${fn})`,
    'a fixture e as quatro mutações são texto de JavaScript literal, e o defeito injetado é provado pelo extrator do AST do TypeScript',
    adapterIdForChallengeLanguage(token) ?? token,
  );
}

/** Devolve uma cópia da base trocando SÓ o desafio (a aula intata). */
export function somenteDesafio(base: DesafioParaMutacao, desafio: Desafio): DesafioParaMutacao {
  return { ...base, desafio };
}

/**
 * O desafio VÁLIDO de calibração, construído em memória (nenhuma trilha real,
 * nenhum IO). Por CONSTRUÇÃO:
 *
 *   - `requires` = chaves da solução válida ∪ chaves da variante que não
 *     exercita a aula (divisão, multiplicação e parênteses como PRÉ-REQUISITOS
 *     já ensinados; `Math.round` idem) — a variante (d) fica DENTRO do
 *     orçamento e FORA dos introduces, um defeito só;
 *   - `introducesProductive = ['op:binary:%']` — a construção nova da aula,
 *     derivada por parser (o que a solução válida usa e a variante (d) não);
 *   - a solução válida usa `%` — exercita a aula (J2).
 *
 * A própria fixture é verificada aqui (schema + o átomo da aula): o gerador
 * não mede sobre uma base quebrada.
 */
export function desafioValidoExemplo(): DesafioParaMutacao {
  const solutionCode = 'export function ehPar(n) {\n  return n % 2 === 0;\n}\n';
  const solucaoQueNaoExercita = 'export function ehPar(n) {\n  return n / 2 === Math.round(n / 2);\n}\n';
  const keysValida = chavesDe(solutionCode);
  const keysSemOModulo = chavesDe(solucaoQueNaoExercita);
  const requires = [...new Set([...keysValida, ...keysSemOModulo])];
  const introducesProductive = keysValida.filter((chave) => !keysSemOModulo.includes(chave));

  const desafio: Desafio = {
    slug: 'm01/a03/desafio-paridade',
    conceito: 'op:binary:%',
    // ADITIVO (registro de linguagens): o ChallengeDraftSchema passou a exigir
    // `language` — o draft F8 atravessa F9/F12 e precisa dizer em que
    // linguagem ele é. 'nodejs' é o DEFAULT do registro e o mesmo literal que
    // a F12 já escrevia em challenge.json.
    language: 'nodejs',
    statement:
      'Escreva a função `ehPar(n)` que retorna true quando n é par e false caso contrário.',
    starterCode: 'export function ehPar(n) {\n  // seu código aqui\n}\n',
    solutionCode,
    testsCode: [
      "import { ehPar } from './solution.mjs';",
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      '',
      "test('numero par', () => {",
      '  assert.equal(ehPar(4), true);',
      '});',
      '',
      "test('numero impar', () => {",
      '  assert.equal(ehPar(5), false);',
      '});',
    ].join('\n'),
    expectedTestCount: 2,
    outputChannel: 'retorno',
    requires,
    notRequired: ['laços', 'console'],
    subgoals: ['calcular o resto da divisão', 'comparar o resto com zero'],
    scenarios: [
      { tipo: 'exemplo', derivado_de: 'op:binary:%', descricao: '4 é par' },
      { tipo: 'limite', derivado_de: 'op:binary:%', descricao: '0 é par' },
      { tipo: 'erro', derivado_de: 'op:binary:%', descricao: 'negativo preserva o sinal do resto' },
    ],
    taskSkill: 'aplicar o operador de resto',
    supportLevel: 'com_andaime',
    surfaceDomain: 'aritmética de inteiros',
    solutionAlternates: ['export function ehPar(n) {\n  return n % 2 === 0;\n}\n'],
    wrongSolutions: ['export function ehPar(n) {\n  return n % 2 === 1;\n}\n'],
    requirements: [
      { id: 'REQ-1', descricao: 'retorna true para número par', teste: 'ehPar(4) === true' },
      { id: 'REQ-2', descricao: 'retorna false para número ímpar', teste: 'ehPar(5) === false' },
    ],
    justificativa: 'o desafio exercita o operador de resto (`op:binary:%`), a construção nova da aula',
    aprovado: true,
  };

  ChallengeDraftSchema.parse(desafio);
  if (introducesProductive.length !== 1 || introducesProductive[0] !== 'op:binary:%') {
    throw new Error(
      `mutants: a fixture não derivou o átomo da aula esperado ('op:binary:%') — recebido [${introducesProductive.join(', ')}]; o gerador não pode medir exercício da aula`,
    );
  }
  return { desafio, introducesProductive };
}
