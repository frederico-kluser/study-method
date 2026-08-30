/**
 * tests/engineForm.test.ts — o eixo `form:` de FORMA de uso (onda 1 do P-06).
 *
 * Contrato que morde aqui (`docs/16-engine-de-trilha.md` §3.1, §3.5, I9/I11):
 * o orçamento é uma lista de PARES (construção, restrição de forma) — liberar
 * `FunctionDeclaration` não libera função como valor de variável, e liberar
 * `if` não libera `if` sem `else`. O seletor é a DSL MÍNIMA de
 * `form/selector.ts` (sem esquery — zero dependências novas).
 *
 * Regras verificadas:
 *   - `form/selector.ts` — sintaxe mínima documentada (tipo, `[attr=null]`,
 *     `[attr!=null]`, `[attr=Tipo]`, `A > B`); exemplo normativo
 *     `IfStatement[alternate=null]` casa no AST do TypeScript com a MESMA
 *     configuração do extrator (§5.3); chave canônica compacta casa com o
 *     `ATOM_KEY_RE`; seletor malformado é ERRO NA CARGA (A-P06-4), nunca
 *     silêncio em verificação.
 *   - `form/rules.ts` — a bateria inicial de cinco formas compilada na carga.
 *   - `extract.ts` — emissão ADITIVA de `form:<seletor>` quando a forma aparece.
 *
 * Sem rede, sem disco, sem LLM: fixtures em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ts from 'typescript';

import { ATOM_KEY_RE, axisOf, isAtomKey } from '../electron/main/engine/atomKeys';
import { deriveTrackBudget } from '../electron/main/engine/budget';
import { extractAtoms } from '../electron/main/engine/extract';
import {
  FORM_SELECTOR_INVALID,
  FormSelectorError,
  formKey,
  parseFormKey,
  parseSelector,
  selectorMatches,
} from '../electron/main/engine/form/selector';
import { FORM_RULES, buildFormRules } from '../electron/main/engine/form/rules';
import { auditTrack } from '../electron/main/engine/audit';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';

// ---------------------------------------------------------------------------
// helpers (fixtures em memória — nenhum IO)
// ---------------------------------------------------------------------------

function keysOf(code: string): string[] {
  const r = extractAtoms(code);
  assert.equal(r.ok, true, `extractAtoms falhou para:\n${code}\n${r.ok ? '' : r.error.message}`);
  return r.ok ? r.keys : [];
}

function formKeysOf(code: string): string[] {
  return keysOf(code).filter((k) => k.startsWith('form:'));
}

function theory(id: string, markdown: string, code?: string): TrackTheorySection {
  return {
    id,
    title: id,
    markdown,
    ...(code ? { code: { language: 'javascript', code } } : {}),
  };
}

function challenge(slug: string, over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: slug,
    concept: 'conceito',
    difficulty: 1,
    language: 'nodejs',
    statement: `# ${slug}`,
    starterCode: 'export function f() {\n}\n',
    testsCode: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('ok', () => { assert.equal(f(1), 1); });\n",
    solutionCode: "export function f() {\n  return 1;\n}\n",
    expectedTestCount: 1,
    ...over,
  };
}

function lesson(slug: string, sections: TrackTheorySection[], challenges: TrackChallengeSource[]): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: slug,
      summary: slug,
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: sections,
      sources: [],
      challenges: challenges.map((c) => c.slug),
    },
    challenges,
  };
}

function moduleOf(slug: string, order: number, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
  };
}

function trackOf(modules: LoadedModule[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      modules: modules.map((m) => m.meta.slug),
    },
    modules,
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

// ---------------------------------------------------------------------------
// as cinco formas iniciais — cada uma com caso de teste próprio
// ---------------------------------------------------------------------------

describe('form — função como valor de variável', () => {
  it('`const f = function () {}` EMITE a forma; `function f() {}` NÃO emite', () => {
    assert.ok(formKeysOf('const f = function () {};').includes('form:VariableDeclaration>FunctionExpression'));
    assert.deepEqual(formKeysOf('function f() {}'), []);
  });

  it('a forma não dispara em outros lugares que um FunctionExpression aparece', () => {
    // callback de chamada e RHS de atribuição não são "função como valor de variável".
    assert.deepEqual(formKeysOf('usa(function () {});'), []);
    assert.deepEqual(formKeysOf('x = function () {};'), []);
  });
});

describe('form — if sem else', () => {
  it('`if` sem `else` é distinguido de `if/else`', () => {
    assert.ok(formKeysOf('if (a) { usa(a); }').includes('form:IfStatement[alternate=null]'));
    assert.deepEqual(formKeysOf('if (a) { usa(a); } else { usa(b); }'), []);
  });

  it('o exemplo do documento normativo casa no AST do TypeScript (§3.1, §5.3)', () => {
    const compiled = parseSelector('IfStatement[alternate=null]');
    // `alternate` é vocabulário ESTree; no AST do TS o atributo real é elseStatement.
    assert.equal(compiled.steps[0].filters[0].resolvedName, 'elseStatement');
    // MESMA configuração do extrator: ScriptTarget.Latest + setParentNodes + ScriptKind.JS.
    const source = ts.createSourceFile('x.js', 'if (a) { b(); }', ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let ifNode: ts.IfStatement | undefined;
    const find = (n: ts.Node): void => {
      if (ts.isIfStatement(n)) ifNode = n;
      ts.forEachChild(n, find);
    };
    ts.forEachChild(source, find);
    assert.ok(ifNode, 'o fixture precisa ter um IfStatement sem else');
    assert.equal(selectorMatches(compiled, ifNode), true);

    const withElse = ts.createSourceFile('x.js', 'if (a) { b(); } else { c(); }', ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let elseNode: ts.IfStatement | undefined;
    const find2 = (n: ts.Node): void => {
      if (ts.isIfStatement(n)) elseNode = n;
      ts.forEachChild(n, find2);
    };
    ts.forEachChild(withElse, find2);
    assert.ok(elseNode);
    assert.equal(selectorMatches(compiled, elseNode), false);
  });
});

describe('form — atributo inexistente (typo) não casa — A-P06-2/WARNING', () => {
  it('`[elseStatemnt=null]` (nome errado) NÃO casa — antes casava TODO IfStatement como null', () => {
    const compiled = parseSelector('IfStatement[elseStatemnt=null]');
    const source = ts.createSourceFile('x.js', 'if (a) { b(); }', ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let ifNode: ts.IfStatement | undefined;
    const find = (n: ts.Node): void => {
      if (ts.isIfStatement(n)) ifNode = n;
      ts.forEachChild(n, find);
    };
    ts.forEachChild(source, find);
    assert.ok(ifNode, 'o fixture precisa ter um IfStatement sem else');
    assert.equal(selectorMatches(compiled, ifNode), false);
  });

  it('`[elseStatemnt!=null]` (nome errado) também NÃO casa — `!=` não casa propriedade ausente', () => {
    const compiled = parseSelector('IfStatement[elseStatemnt!=null]');
    const source = ts.createSourceFile('x.js', 'if (a) { b(); } else { c(); }', ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let ifNode: ts.IfStatement | undefined;
    const find = (n: ts.Node): void => {
      if (ts.isIfStatement(n)) ifNode = n;
      ts.forEachChild(n, find);
    };
    ts.forEachChild(source, find);
    assert.ok(ifNode, 'o fixture precisa ter um IfStatement com else');
    assert.equal(selectorMatches(compiled, ifNode), false);
  });

  it('atributo REAL com valor nulo continua casando — `if` sem else permanece detectável', () => {
    assert.ok(formKeysOf('if (a) { usa(a); }').includes('form:IfStatement[alternate=null]'));
  });
});

describe('form — arrow com corpo de expressão', () => {
  it('arrow de expressão é distinguida de arrow com bloco', () => {
    assert.ok(formKeysOf('const f = (x) => x + 1;').includes('form:ArrowFunction[body!=Block]'));
    assert.deepEqual(formKeysOf('const f = (x) => { return x + 1; };'), []);
  });
});

describe('form — parâmetro com valor default', () => {
  it('parâmetro com default EMITE a forma; parâmetro simples NÃO', () => {
    assert.ok(formKeysOf('function f(x = 1) { return x; }').includes('form:Parameter[initializer!=null]'));
    assert.deepEqual(formKeysOf('function f(x) { return x; }'), []);
  });
});

describe('form — método declarado em objeto literal', () => {
  it('método em objeto literal EMITE a forma; método de classe NÃO', () => {
    assert.ok(formKeysOf('const api = { somar(a, b) { return a + b; } };').includes('form:ObjectLiteralExpression>MethodDeclaration'));
    assert.deepEqual(formKeysOf('class C { m() {} }'), []);
    // propriedade com função como valor é outra forma (PropertyAssignment), não esta.
    assert.ok(!formKeysOf('const o = { m: function () {} };').includes('form:ObjectLiteralExpression>MethodDeclaration'));
  });
});

// ---------------------------------------------------------------------------
// a chave e o contrato com atomKeys.ts
// ---------------------------------------------------------------------------

describe('form — a chave emitida', () => {
  it('toda chave form: casa com o ATOM_KEY_RE e tem o eixo form (previsto em atomKeys.ts)', () => {
    assert.ok(FORM_RULES.length >= 5, 'a bateria inicial tem no mínimo as cinco formas do procedimento');
    for (const rule of FORM_RULES) {
      assert.ok(ATOM_KEY_RE.test(rule.key), `chave fora do ATOM_KEY_RE: ${rule.key}`);
      assert.ok(isAtomKey(rule.key), `isAtomKey rejeitou: ${rule.key}`);
      assert.equal(axisOf(rule.key), 'form', `axisOf errou para ${rule.key}`);
    }
    const r = extractAtoms('const f = function () {};');
    assert.equal(r.ok, true);
    if (r.ok) {
      for (const k of r.keys.filter((x) => x.startsWith('form:'))) {
        assert.equal(axisOf(k), 'form');
        assert.ok(ATOM_KEY_RE.test(k));
      }
    }
  });

  it('a mesma forma escrita com ou sem espaços gera a MESMA chave', () => {
    assert.equal(formKey('VariableDeclaration > FunctionExpression'), formKey('VariableDeclaration>FunctionExpression'));
    assert.equal(formKey('IfStatement[alternate = null]'), 'form:IfStatement[alternate=null]');
  });

  it('código sem nenhuma das formas iniciais não emite chave form: nenhuma', () => {
    assert.deepEqual(formKeysOf('function f() { return 1; }'), []);
  });

  it('o seletor compilado é a ÚNICA checagem — a forma casa pelo nó (fim-a-fim no extrator)', () => {
    // `if` com else: o eixo node: continua emitindo node:IfStatement; o eixo form: NÃO.
    const r = extractAtoms('if (a) { b(); } else { c(); }');
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(r.keys.includes('node:IfStatement'));
      assert.ok(!r.keys.some((k) => k.startsWith('form:')));
    }
  });
});

// ---------------------------------------------------------------------------
// A-P06-4 — seletor malformado é erro NA CARGA, nunca silêncio em verificação
// ---------------------------------------------------------------------------

describe('form — seletor malformado é erro de carga (A-P06-4)', () => {
  const malformados: Array<[string, string]> = [
    ['', 'seletor vazio'],
    ['IfStatement[alternate=', 'filtro aberto e nunca fechado'],
    ['IfStatement[]', 'filtro sem atributo'],
    ['[alternate=null]', 'passo sem tipo de nó'],
    ['IfStatement[alternate==null]', 'operador duplo'],
    ['IfStatement[alternate]', 'filtro sem operador'],
    ['IfStatement[alternate=null', 'colchete não fechado'],
    ['VariableDeclaration >', 'cadeia terminando em >'],
    ['> IfStatement', 'cadeia começando em >'],
    ['IfStatement[body=Blok]', 'valor que não é nome de nó do TS'],
    ['NaoExisteStatement', 'tipo de nó que não existe'],
    ['IfStatement[alternate=null] >', 'segunda cadeia sem sujeito'],
  ];

  it('parseSelector lança FormSelectorError estruturado para cada sintaxe inválida', () => {
    for (const [sel, motivo] of malformados) {
      assert.throws(
        () => parseSelector(sel),
        (err: unknown) => err instanceof FormSelectorError && err.code === FORM_SELECTOR_INVALID,
        `"${sel}" deveria ser rejeitado (${motivo})`,
      );
    }
  });

  it('buildFormRules (a CARGA da bateria) falha no primeiro seletor quebrado', () => {
    assert.throws(
      () => buildFormRules([{ selector: 'IfStatement[alternate=', description: 'quebrado' }]),
      (err: unknown) => err instanceof FormSelectorError && err.code === FORM_SELECTOR_INVALID,
    );
    // A carga falha ALTO mesmo quando a bateria só tem UM defeito entre vários.
    assert.throws(
      () =>
        buildFormRules([
          { selector: 'IfStatement[alternate=null]', description: 'ok' },
          { selector: 'ArrowFunction[body!=', description: 'quebrado' },
        ]),
      FormSelectorError,
    );
  });

  it('parseFormKey (chaves form: vindas do orçamento) valida na carga', () => {
    assert.throws(
      () => parseFormKey('form:IfStatement[alternate='),
      (err: unknown) => err instanceof FormSelectorError && err.code === FORM_SELECTOR_INVALID,
    );
    // chave boa passa e devolve o seletor compilado.
    const compiled = parseFormKey('form:IfStatement[alternate=null]');
    assert.equal(compiled.steps[0].nodeType, 'IfStatement');
  });

  it('em tempo de verificação só existem regras compiladas — sem silêncio possível', () => {
    // A bateria carregada no módulo é sempre válida: se qualquer seletor da
    // lista fixa fosse malformado, este import teria lançado FormSelectorError.
    for (const rule of FORM_RULES) {
      assert.equal(rule.compiled.source, rule.selector);
      assert.equal(rule.key, `form:${rule.compiled.canonical}`);
    }
    // E o extrator, dado um corpo de código, emite exatamente as formas das regras.
    const r = extractAtoms('const f = function (x = 1) { return x; };');
    assert.equal(r.ok, true);
    if (r.ok) {
      for (const k of r.keys) {
        if (k.startsWith('form:')) {
          assert.ok(FORM_RULES.some((rule) => rule.key === k), `chave form: ${k} não vem de nenhuma regra da bateria`);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// fim-a-fim: a forma atravessa o orçamento (I9/I11)
// ---------------------------------------------------------------------------

describe('form — fim-a-fim no gate de orçamento (I9/I11)', () => {
  const bareIfSolution = "export function f(x) { if (x) { console.log('x'); } console.log('y'); }";

  it('liberar if/else na teoria NÃO libera if sem else no desafio (lacuna de currículo)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'texto', "if (a) { console.log('x'); } else { console.log('y'); }")], [
          challenge('c1', { solutionCode: bareIfSolution }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const formV = report.violations.filter((v) => (v.construcao ?? '').startsWith('form:'));
    assert.equal(formV.length, 1, JSON.stringify(report.violations, null, 2));
    assert.equal(formV[0].construcao, 'form:IfStatement[alternate=null]');
    assert.equal(formV[0].regra, 'A2');
    assert.equal(formV[0].campo, 'solutionCode');
    assert.equal(formV[0].primeiraAulaQueEnsina, null); // if/else foi ensinado; if sem else NÃO.
  });

  it('ensinar if SEM else na teoria libera o desafio — a forma entra no orçamento', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'texto', "if (a) { console.log('x'); }")], [
          challenge('c1', { solutionCode: bareIfSolution }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const formV = report.violations.filter((v) => (v.construcao ?? '').startsWith('form:'));
    assert.deepEqual(formV, [], JSON.stringify(report.violations, null, 2));
  });
});

// ---------------------------------------------------------------------------
// A-P06-2 — o harness/starter entram no orçamento RECEPTIVO por política (seed);
// o padrão do CORPUS REAL é arrow de EXPRESSÃO, não arrow de bloco.
// ---------------------------------------------------------------------------

describe('form — harness/starter do corpus real (A-P06-2)', () => {
  const corpusTestsCode = (fn: string, arg: string): string =>
    `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${fn} } from './solution.mjs';\n\ntest('recusa um valor que não é texto', () => {\n  assert.throws(() => ${fn}(${arg}));\n});\n`;

  // A teoria da aula 1 ensina função declarada — o que isola o que este teste
  // quer provar: o default-param e a arrow de expressão chegam pelo RUNNER e
  // pelo STARTER (seed RECEPTIVA), não por aula.
  const theoryFuncao = "export function saudar(nome) {\n  console.log(nome);\n}\n";

  it('fixture do corpus: testsCode com `assert.throws(() => f(x))` NÃO viola com a seed', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'texto', theoryFuncao)], [
          challenge('c1', {
            starterCode: 'export function cumprimentar(nome) {\n}\n',
            testsCode: corpusTestsCode('cumprimentar', '42'),
            solutionCode: 'export function cumprimentar(nome) {\n  return "Olá, " + nome;\n}\n',
          }),
        ]),
      ]),
    ]);
    // a isenção vem da política receptiva, não de golpe no orçamento: a forma
    // arrow-de-expressão está na ENTRADA receptiva da aula 1 e fora do produtivo.
    const budget = deriveTrackBudget(t);
    assert.ok(budget.lessons[0].entrada.receptive.has('form:ArrowFunction[body!=Block]'));
    assert.ok(!budget.lessons[0].entrada.productive.has('form:ArrowFunction[body!=Block]'));

    const report = auditTrack(t);
    // nada do arquivo de teste viola (A3) — o padrão do corpus fica limpo...
    const testsV = report.violations.filter((v) => v.campo === 'testsCode');
    assert.deepEqual(testsV, [], JSON.stringify(report.violations, null, 2));
    // ...e nenhuma forma viola em superfície nenhuma.
    const formV = report.violations.filter((v) => (v.construcao ?? '').startsWith('form:'));
    assert.deepEqual(formV, [], JSON.stringify(report.violations, null, 2));
  });

  it('fixture do corpus: starter com assinatura default congelada NÃO viola (A1)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'texto', theoryFuncao)], [
          challenge('c1', {
            starterCode: "export function montarPackageJson(nome, versao = '1.0.0') {\n}\n",
            testsCode: corpusTestsCode('montarPackageJson', "'', '1.0.0'"),
            solutionCode:
              "export function montarPackageJson(nome, versao = '1.0.0') {\n  return { name: nome, version: versao };\n}\n",
          }),
        ]),
      ]),
    ]);
    const budget = deriveTrackBudget(t);
    assert.ok(budget.lessons[0].entrada.receptive.has('form:Parameter[initializer!=null]'));
    assert.ok(!budget.lessons[0].entrada.productive.has('form:Parameter[initializer!=null]'));

    const report = auditTrack(t);
    // a assinatura congelada (com default) não viola A1 nem A2: a forma está na seed.
    const formV = report.violations.filter((v) => (v.construcao ?? '').startsWith('form:'));
    assert.deepEqual(formV, [], JSON.stringify(report.violations, null, 2));
  });

  it('a isenção é SÓ receptiva: solutionCode com arrow de expressão continua violando (A2)', () => {
    // Aula em modo DECLARADO sem introduzir a forma no produtivo: a seed libera
    // a LEITURA (teoria usa arrow de expressão sem violar A4), mas ESCREVER a
    // forma no desafio segue exigindo aula que a introduza no produtivo.
    const t = trackOf([
      moduleOf('m1', 1, [
        {
          ...lesson('a1', [theory('s1', 'texto', 'const dobra = (x) => x + 1;')], [
            challenge('c1', { solutionCode: 'export const dobro = (x) => x * 2;' }),
          ]),
          meta: {
            ...lesson('a1', [theory('s1', 'texto')], [challenge('c1')]).meta,
            introduces: {},
          } as LoadedLesson['meta'],
        },
      ]),
    ]);
    const report = auditTrack(t);
    const formV = report.violations.filter((v) => (v.construcao ?? '').startsWith('form:'));
    assert.equal(formV.length, 1, JSON.stringify(report.violations, null, 2));
    assert.equal(formV[0].construcao, 'form:ArrowFunction[body!=Block]');
    assert.equal(formV[0].regra, 'A2');
    assert.equal(formV[0].campo, 'solutionCode');
    // Lacuna de currículo: nenhuma aula introduziu a forma no produtivo — a
    // seed isentou só o receptivo, e escrever a forma segue exigindo aula.
    assert.equal(formV[0].primeiraAulaQueEnsina, null);
  });
});