/**
 * tests/moduleMastery.test.ts — ANÁLISE DE DOMÍNIO do desafio de módulo
 * (pedido do dono: "analisar profundamente usando o conteúdo das aulas e
 * propor o conhecimento que o aluno demonstrou possuir e marcar como finalizado
 * as aulas que ele não precisaria fazer — porém sendo criterioso: apenas
 * parecer dominar não significa dominar").
 *
 * O QUE ESTA SUÍTE TRAVA (as regras R1–R5 de services/moduleMastery.ts):
 *   1. R1 — execução que não chegou aos testes NÃO marca aula nenhuma;
 *   2. R2 — teste reprovado que exercita a aula DESQUALIFICA a marcação (a
 *      evidência negativa vence qualquer aparência); teste aprovado que a
 *      exercita + código que usa as construções ⇒ marcada;
 *   3. R3 — código que NÃO usa as construções da aula nunca a marca (o juiz e
 *      os testes não substituem escrever);
 *   4. R4 — aula sem construções declaradas é ambígua e nunca é marcada; sem
 *      teste mapeável e sem juiz, nada é marcado (fail-closed);
 *   5. o caminho do JUIZ (análise profunda) marca aulas que a cobertura
 *      mecânica não alcança — MAS nunca sozinho (R1+R3 são pisos) e nunca por
 *      cima de teste reprovado atribuído;
 *   6. R5 — pré-requisito não demonstrado derruba a dependente; pré-requisito
 *      já concluído ou FORA do escopo não bloqueia;
 *   7. `refazer` nunca inclui aula já concluída; `marcaveis` segue a ordem
 *      pedagógica;
 *   8. as leituras defensivas (`readIntroducesProductive`/`readPrerequisites`)
 *      não quebram com meta antiga sem o campo;
 *   9. `buildTestEvidence` espelha os checks reais (mesmo sem cobertura
 *      derivada — o caso do desafio de módulo REAL `rachando-a-conta`, de um
 *      teste só, que é justamente o que obriga o juiz).
 *
 * Reprodução: `cd app && npm test -- tests/moduleMastery.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  analyzeModuleMastery,
  buildTestEvidence,
  readIntroducesProductive,
  readPrerequisites,
  submittedAtomKeys,
  type ModuleMasteryInput,
  type ModuleMasteryLesson,
} from '../electron/main/services/moduleMastery';

const HERE = dirname(fileURLToPath(import.meta.url));

function lesson(over: Partial<ModuleMasteryLesson> = {}): ModuleMasteryLesson {
  return {
    lessonId: 'a-print',
    title: 'A primeira linha',
    productiveAtoms: ['global:print'],
    prerequisites: [],
    alreadyDone: false,
    ...over,
  };
}

function input(over: Partial<ModuleMasteryInput> = {}): ModuleMasteryInput {
  return {
    lessons: [lesson()],
    tests: [{ test: 'test_imprime', passed: true, atoms: ['global:print', 'node:Call'] }],
    submittedAtoms: ['global:print', 'node:Call'],
    executionOk: true,
    ...over,
  };
}

describe('moduleMastery — R1/R2/R3/R4: a evidência mecânica', () => {
  it('R1: execução que não chegou aos testes ⇒ NENHUMA aula marcada', () => {
    const analysis = analyzeModuleMastery(input({ executionOk: false }));
    assert.deepEqual(analysis.marcaveis, []);
    assert.equal(analysis.lessons[0].dominada, false);
  });

  it('R2/R3: teste aprovado cobrindo a aula + código que usa as construções ⇒ demonstrada', () => {
    const analysis = analyzeModuleMastery(input());
    assert.deepEqual(analysis.marcaveis, ['a-print']);
    assert.deepEqual(analysis.refazer, []);
    assert.match(analysis.lessons[0].motivo, /Demonstrada/);
  });

  it('R2: teste REPROVADO que exercita a aula desqualifica — mesmo com o código usando as construções', () => {
    const analysis = analyzeModuleMastery(
      input({ tests: [{ test: 'test_imprime', passed: false, atoms: ['global:print'] }] }),
    );
    assert.deepEqual(analysis.marcaveis, []);
    assert.deepEqual(analysis.refazer, ['a-print']);
    assert.match(analysis.lessons[0].motivo, /Reprovou o que a aula cobre/);
  });

  it('R3: código que não usa as construções da aula nunca a marca', () => {
    const analysis = analyzeModuleMastery(input({ submittedAtoms: ['node:Call'] }));
    assert.deepEqual(analysis.marcaveis, []);
    assert.match(analysis.lessons[0].motivo, /não usa as construções/);
  });

  it('R4: aula sem construções declaradas é ambígua — nunca marcada', () => {
    const analysis = analyzeModuleMastery(input({ lessons: [lesson({ productiveAtoms: [] })] }));
    assert.deepEqual(analysis.marcaveis, []);
    assert.match(analysis.lessons[0].motivo, /não declara as construções/);
  });

  it('R4: sem teste mapeável e sem juiz ⇒ nada é marcado (fail-closed)', () => {
    const analysis = analyzeModuleMastery(input({ tests: [] }));
    assert.deepEqual(analysis.marcaveis, []);
    assert.match(analysis.lessons[0].motivo, /sem evidência/);
  });
});

describe('moduleMastery — o caminho do JUIZ (análise profunda)', () => {
  const juizFavoravel = [
    {
      lessonId: 'a-print',
      demonstrada: true,
      motivo: 'o código usa print() corretamente nas linhas do recibo',
      relacionada: [],
    },
  ];

  it('desafio de UM teste só (cobertura vazia) + juiz favorável + R3 ⇒ demonstrada', () => {
    const analysis = analyzeModuleMastery(input({ tests: [], judge: juizFavoravel }));
    assert.deepEqual(analysis.marcaveis, ['a-print']);
    assert.match(analysis.lessons[0].motivo, /análise profunda/);
  });

  it('o juiz NUNCA marca sozinho: sem evidência de código (R3) a aula cai', () => {
    const analysis = analyzeModuleMastery(
      input({ tests: [], submittedAtoms: [], judge: juizFavoravel }),
    );
    assert.deepEqual(analysis.marcaveis, []);
  });

  it('teste reprovado ATRIBUÍDO pelo juiz desqualifica, mesmo com demonstrada: true', () => {
    const analysis = analyzeModuleMastery(
      input({
        tests: [{ test: 'test_notas', passed: false, atoms: [] }],
        judge: [
          {
            lessonId: 'a-print',
            demonstrada: true,
            motivo: 'engano do juiz',
            relacionada: ['test_notas'],
          },
        ],
      }),
    );
    assert.deepEqual(analysis.marcaveis, []);
    assert.match(analysis.lessons[0].motivo, /Reprovou o que a aula cobre/);
  });

  it('juiz desfavorável não marca (a incerteza é sempre contra a marcação)', () => {
    const analysis = analyzeModuleMastery(
      input({
        tests: [],
        judge: [{ lessonId: 'a-print', demonstrada: false, motivo: 'usa print, mas o round está errado', relacionada: [] }],
      }),
    );
    assert.deepEqual(analysis.marcaveis, []);
    assert.deepEqual(analysis.refazer, ['a-print']);
  });
});

describe('moduleMastery — R5: a base garantida', () => {
  it('pré-requisito NÃO demonstrado derruba a dependente (mesmo com evidência)', () => {
    const analysis = analyzeModuleMastery(
      input({
        lessons: [
          lesson({ lessonId: 'a-print' }),
          lesson({
            lessonId: 'a-round',
            title: 'Duas casas',
            productiveAtoms: ['global:round'],
            prerequisites: ['a-print'],
          }),
        ],
        tests: [
          { test: 't1', passed: false, atoms: ['global:print'] },
          { test: 't2', passed: true, atoms: ['global:round'] },
        ],
        submittedAtoms: ['global:print', 'global:round'],
      }),
    );
    assert.deepEqual(analysis.marcaveis, [], 'a dependente não pode passar antes da base');
    assert.equal(analysis.lessons.length, 2);
    assert.match(analysis.lessons[1].motivo, /pré-requisita/);
  });

  it('pré-requisito JÁ CONCLUÍDO libera a dependente', () => {
    const analysis = analyzeModuleMastery(
      input({
        lessons: [
          lesson({ lessonId: 'a-print', alreadyDone: true }),
          lesson({
            lessonId: 'a-round',
            productiveAtoms: ['global:round'],
            prerequisites: ['a-print'],
          }),
        ],
        tests: [{ test: 't2', passed: true, atoms: ['global:round'] }],
        submittedAtoms: ['global:round'],
      }),
    );
    assert.deepEqual(analysis.marcaveis, ['a-print', 'a-round']);
  });

  it('pré-requisito FORA do escopo da análise não bloqueia', () => {
    const analysis = analyzeModuleMastery(
      input({
        lessons: [
          lesson({
            lessonId: 'a-round',
            productiveAtoms: ['global:round'],
            prerequisites: ['outra-unidade'], // não está na lista — fora do escopo
          }),
        ],
        tests: [{ test: 't2', passed: true, atoms: ['global:round'] }],
        submittedAtoms: ['global:round'],
      }),
    );
    assert.deepEqual(analysis.marcaveis, ['a-round']);
  });

  it('cadeia: a neta só passa se a filha passar (ponto fixo da demora)', () => {
    const analysis = analyzeModuleMastery(
      input({
        lessons: [
          lesson({ lessonId: 'a1', productiveAtoms: ['op:binary:+'] }),
          lesson({ lessonId: 'a2', productiveAtoms: ['op:binary:*'], prerequisites: ['a1'] }),
          lesson({ lessonId: 'a3', productiveAtoms: ['global:round'], prerequisites: ['a2'] }),
        ],
        tests: [
          { test: 't1', passed: false, atoms: ['op:binary:+'] },
          { test: 't2', passed: true, atoms: ['op:binary:*'] },
          { test: 't3', passed: true, atoms: ['global:round'] },
        ],
        submittedAtoms: ['op:binary:+', 'op:binary:*', 'global:round'],
      }),
    );
    assert.deepEqual(analysis.marcaveis, [], 'a reprovação de a1 derruba a cadeia toda');
  });
});

describe('moduleMastery — a saída que a tela consome', () => {
  it('refazer nunca inclui aula já concluída; marcaveis segue a ordem pedagógica', () => {
    const analysis = analyzeModuleMastery(
      input({
        lessons: [
          lesson({ lessonId: 'a1', productiveAtoms: ['op:binary:+'], alreadyDone: true }),
          lesson({ lessonId: 'a2', productiveAtoms: ['op:binary:*'] }),
          lesson({ lessonId: 'a3', productiveAtoms: ['global:round'] }),
        ],
        tests: [
          { test: 't2', passed: true, atoms: ['op:binary:*'] },
          { test: 't3', passed: false, atoms: ['global:round'] },
        ],
        submittedAtoms: ['op:binary:*', 'global:round'],
      }),
    );
    assert.deepEqual(analysis.marcaveis, ['a1', 'a2']);
    assert.deepEqual(analysis.refazer, ['a3'], 'a1 já estava concluída — não é o que se refaz');
  });
});

describe('moduleMastery — leituras defensivas do meta (loader faz cast, não pick)', () => {
  it('readIntroducesProductive: meta antiga/malformada ⇒ [] (nunca lança)', () => {
    assert.deepEqual(readIntroducesProductive(undefined), []);
    assert.deepEqual(readIntroducesProductive({}), []);
    assert.deepEqual(readIntroducesProductive({ introduces: { productive: 'não é lista' } }), []);
    assert.deepEqual(readIntroducesProductive({ introduces: { productive: ['global:print', 42, ''] } }), [
      'global:print',
    ]);
  });

  it('readPrerequisites: só strings não-vazias', () => {
    assert.deepEqual(readPrerequisites({ prerequisites: ['a1', null, ' ', 7] }), ['a1']);
    assert.deepEqual(readPrerequisites({}), []);
  });
});

describe('moduleMastery — buildTestEvidence: a evidência de teste real', () => {
  it('espelha os checks e deriva a cobertura por teste (JS, node:test)', () => {
    const challenge = {
      testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { soma } from './solution.mjs';\ntest('soma devolve a soma', () => {\n  assert.equal(soma(1, 2), 3);\n});\n`,
      solutionCode: 'export function soma(a, b) {\n  return a + b;\n}\n',
      starterCode: 'export function soma(a, b) {}\n',
    };
    const evidence = buildTestEvidence(
      challenge,
      [
        { name: 'soma devolve a soma', passed: true },
        { name: 'teste sem requirement', passed: false },
      ],
      'nodejs',
    );
    assert.equal(evidence.length, 2, 'todo check com resultado entra');
    const soma = evidence.find((t) => t.test === 'soma devolve a soma');
    assert.equal(soma?.passed, true);
    assert.ok((soma?.atoms.length ?? 0) > 0, 'a cobertura derivada traz as construções da solução');
    assert.deepEqual(
      evidence.find((t) => t.test === 'teste sem requirement')?.atoms,
      [],
      'check sem requirement derivado entra com cobertura vazia (nunca cobre aula)',
    );
  });

  it('sem checks ⇒ [] (R1 decide); derivação que não parseia ⇒ [] (fail-closed)', () => {
    assert.deepEqual(buildTestEvidence({ testsCode: 'x' }, [], 'nodejs'), []);
    assert.deepEqual(
      buildTestEvidence(
        { testsCode: 'não parseia (((((', solutionCode: '', starterCode: '' },
        [{ name: 't', passed: true }],
        'nodejs',
      ),
      [],
    );
  });

  it('CASO REAL rachando-a-conta (python, 1 teste, script): a cobertura derivada é VAZIA — é o que obriga o juiz', () => {
    const ch = JSON.parse(
      readFileSync(
        resolve(HERE, '../resources/tracks/python-iniciante/modules/a-tela/challenges/rachando-a-conta/challenge.json'),
        'utf8',
      ),
    ) as { testsCode: string; solutionCode: string; starterCode: string };
    const evidence = buildTestEvidence(
      ch,
      [{ name: 'test_imprime_o_recibo_completo', passed: false }],
      'python',
    );
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].passed, false);
    assert.deepEqual(evidence[0].atoms, [], 'programa de um teste só não localiza aula nenhuma por teste');
  });
});

describe('moduleMastery — submittedAtomKeys: o código do aluno fala', () => {
  it('python: extrai as construções usadas; qualquer arquivo que não parseia ⇒ [] (fail-closed)', () => {
    const atoms = submittedAtomKeys({ code: 'print("oi")\nx = 1 + 2\n' }, 'python');
    assert.ok(atoms.includes('global:print'), 'o print do aluno aparece como evidência');
    assert.deepEqual(submittedAtomKeys({ code: 'def (((' }, 'python'), [], 'parse falhou ⇒ nada é presumido');
    assert.deepEqual(submittedAtomKeys({}, 'python'), []);
  });

  it('multi-arquivo: união dos arquivos submetidos', () => {
    const atoms = submittedAtomKeys(
      {
        files: [
          { path: 'lib/a.mjs', code: 'export const a = 1;\n' },
          { path: 'lib/b.mjs', code: 'console.log(2);\n' },
        ],
      },
      'nodejs',
    );
    assert.ok(atoms.includes('global:console'), 'a união cobre os dois arquivos');
    assert.ok(atoms.length > 1, 'os dois arquivos contribuem para a evidência');
  });
});
