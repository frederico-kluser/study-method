/**
 * tests/cx-gap-l04-progressao-a14b.test.ts — GAP de cobertura do lote L04: os
 * COLAPSOS de granularidade didática do A14b (`construcoesDaLinha`).
 *
 * O A14b mede "no máximo 1 construção nova por linha da solução", e a
 * CONSTRUÇÃO não é a chave crua: `node:BinaryExpression` colapsa no `op:*` (a
 * construção é o sinal) e a maquinaria da declaração
 * (`node:VariableStatement`/`VariableDeclarationList`/`VariableDeclaration`)
 * colapsa no `decl:*` (a construção é `let`/`const`/`var`). Os testes
 * existentes pinavam o RESULTADO pontual (`return a + b;` = 2 construções);
 * o que NÃO estava pinado — e uma refatoração pode calar sem ruído — é que a
 * linha `const x = 5;` é UMA construção e a linha `a + b;` é UMA construção:
 * sem os colapsos, as mesmas linhas teriam 4 e 2 chaves novas e reprovariam.
 *
 * Pin literal do plano do lote (lei): "A14b máx 1 construção nova por linha
 * (colapsos BinaryExpression→op:*, VariableStatement/List/Declaration→decl:*)".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { TrackTheorySection } from '../electron/main/content/trackTypes';
import {
  auditarProgressao,
  type ProgressaoDesafioInput,
  type ProgressaoLessonInput,
} from '../electron/main/engine/quality/progressao';

function secao(id: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria mostra o código', code: { language: 'js', code } };
}

function desafio(slug: string, solution: string, starter = ''): ProgressaoDesafioInput {
  return {
    slug,
    desafioFile: `modules/m/lessons/l/challenges/${slug}.json`,
    files: [{ path: 'solution.mjs', starter, solution }],
    tests: '',
  };
}

function aula(slug: string, teoria: string, solution: string): ProgressaoLessonInput {
  return {
    ref: `modulo/${slug}`,
    baseDir: `modules/m/lessons/${slug}`,
    theory: [secao('s1', teoria)],
    challenges: [desafio('d1', solution)],
  };
}

const a14b = (aulas: ProgressaoLessonInput[]) =>
  auditarProgressao(aulas).violations.filter((v) => v.regra === 'A14b');

describe('progressao A14b — colapsos decl:* e op:* (construção ≠ chave crua)', () => {
  it('`const x = 5;` é UMA construção (decl:*): VariableStatement/List/Declaration colapsam', () => {
    // A teoria demonstra a linha; a solução repete a MESMA linha. As chaves
    // novas da linha são decl:const + node:VariableStatement +
    // node:VariableDeclarationList + node:VariableDeclaration (NumericLiteral é
    // H13) — o colapso decl:* as junta em UMA construção, e a linha passa.
    // Sem o colapso seriam 4 construções novas na linha ⇒ A14b vermelho.
    assert.deepEqual(a14b([aula('decl', 'const x = 5;\n', 'const x = 5;\n')]), []);
  });

  it('`a + b;` é UMA construção (op:*): BinaryExpression colapsa no sinal', () => {
    // As chaves novas da linha incluem node:BinaryExpression + op:binary:+ —
    // o colapso op:* mantém SÓ o sinal: 1 construção, a linha passa. Sem o
    // colapso seriam 2 ⇒ A14b vermelho.
    assert.deepEqual(a14b([aula('op', 'a + b;\n', 'a + b;\n')]), []);
  });

  it('dois `+` na MESMA linha são UMA construção op:binary:+ — a conta do exemplo L5', () => {
    // `return a + b + c;` = ReturnStatement + op:binary:+ = 2 construções
    // (a spec §4.2, exemplo medido L5): "a contagem é por construção-na-linha,
    // não por chave" — DOIS `nós BinaryExpression` e DOIS `+` rendem UM op.
    const v = a14b([
      aula('l5', 'function f(a, b, c) {\n  return a + b + c;\n}\n', 'function f(a, b, c) {\n  return a + b + c;\n}\n'),
    ]).filter((x) => x.linha === 2);
    assert.equal(v.length, 1, JSON.stringify(v, null, 2));
    assert.match(v[0].mensagem, /a linha 2 do solutionCode de `modulo\/l5` combina 2 construções novas/);
    assert.match(v[0].mensagem, /\(node:ReturnStatement, op:binary:\+\)/, 'as duas CONSTRUÇÕES, já colapsadas');
  });
});
