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
import {
  FORM_RULES,
  JAVASCRIPT_FORM_DEFINITIONS,
  TYPESCRIPT_FORM_DEFINITIONS,
  buildFormRules,
} from '../electron/main/engine/form/rules';
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

/** As chaves `form:` de um trecho lido como TYPESCRIPT (`ExtractOptions.dialect: 'ts'`). */
function formKeysOfTs(code: string): string[] {
  const r = extractAtoms(code, { fileName: 'trecho.ts', dialect: 'ts' });
  assert.equal(r.ok, true, `extractAtoms(ts) falhou para:\n${code}\n${r.ok ? '' : r.error.message}`);
  return (r.ok ? r.keys : []).filter((k) => k.startsWith('form:'));
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
// AS CATORZE FORMAS DE TYPESCRIPT (onda 7)
//
// A lista é FECHADA, e é ESTE arquivo que a fecha. Ela veio da spec de trilha
// de TypeScript da onda 7, apagada em 2026-09-02 (o produto passou a ter uma
// trilha só, de Python — ver o cabeçalho de `engine/lang/typescript.ts`); cada
// linha dela virou aqui um PAR MÍNIMO: um trecho que CASA e um que NÃO casa. Um
// seletor que casa tudo é pior que seletor nenhum: enche o orçamento de ruído e
// o aluno nunca sabe qual aula devia ter ensinado a forma.
// ---------------------------------------------------------------------------

/** [chave sem o prefixo `form:`, trecho que CASA, trecho que NÃO casa, o que o par separa] */
const PARES_TYPESCRIPT: ReadonlyArray<readonly [string, string, string, string]> = [
  [
    'VariableDeclaration[type!=null]',
    'const a: number = 1;',
    'const a = 1;',
    'anotar a variável × deixar o tipo vir por inferência',
  ],
  [
    'Parameter[type!=null]',
    'function f(x: string) { return x; }',
    'function f(x) { return x; }',
    'anotar o parâmetro × parâmetro cru',
  ],
  [
    'FunctionDeclaration[type!=null]',
    'function f(): number { return 1; }',
    'function f() { return 1; }',
    'anotar o retorno × retorno inferido',
  ],
  [
    'ArrowFunction[type!=null]',
    'const g = (x: number): number => x;',
    'const g = (x: number) => x;',
    'arrow com retorno anotado × arrow sem anotação de retorno',
  ],
  [
    'Parameter[questionToken!=null]',
    'function f(x?: string) { return x; }',
    'function f(x: string) { return x; }',
    'parâmetro opcional × parâmetro obrigatório',
  ],
  [
    'PropertySignature[questionToken!=null]',
    'interface I { a?: string }',
    'interface I { a: string }',
    'propriedade opcional × propriedade obrigatória',
  ],
  [
    'PropertyDeclaration[type!=null]',
    'class A { x: number = 1; }',
    'class A { x = 1; }',
    'campo de classe anotado × campo sem anotação',
  ],
  [
    'Parameter[modifiers!=null]',
    'class A { constructor(private x: number) {} }',
    'class A { constructor(x: number) {} }',
    'parameter property (o parâmetro que vira campo) × parâmetro comum do construtor',
  ],
  [
    'Parameter[dotDotDotToken!=null]',
    'function f(...xs: number[]) { return xs; }',
    'function f(xs: number[]) { return xs; }',
    'rest tipado × um parâmetro de array',
  ],
  [
    'FunctionDeclaration[body=null]',
    'declare function f(a: string): void;',
    'function f(a: string): void {}',
    'assinatura de sobrecarga (sem corpo) × declaração com corpo',
  ],
  [
    'TypeParameter[constraint!=null]',
    'function id<T extends object>(x: T) { return x; }',
    'function id<T>(x: T) { return x; }',
    'genérico restringido × genérico livre',
  ],
  [
    'TypeParameter[default!=null]',
    'type B<T = string> = T;',
    'type B<T> = T;',
    'parâmetro de tipo com valor padrão × sem valor padrão',
  ],
  [
    'IfStatement[expression=TypeOfExpression]',
    'if (typeof x) { g(); }',
    'if (x) { g(); }',
    'condição que É um typeof × condição que é um identificador',
  ],
  [
    'IfStatement[expression=BinaryExpression]',
    "if (forma === 'circulo') { g(); }",
    'if (forma) { g(); }',
    'condição que é uma comparação × condição que é um identificador',
  ],
];

describe('form — as catorze formas de TypeScript (onda 7)', () => {
  it('a bateria registra EXATAMENTE as catorze chaves, na ordem, e nada mais', () => {
    // A lista é FECHADA: nem uma a mais (ruído no orçamento), nem uma a menos
    // (aula da trilha sem forma que a distinga).
    assert.deepEqual(
      TYPESCRIPT_FORM_DEFINITIONS.map((d) => `form:${d.selector}`),
      PARES_TYPESCRIPT.map(([chave]) => `form:${chave}`),
    );
    assert.equal(TYPESCRIPT_FORM_DEFINITIONS.length, 14);
    assert.equal(JAVASCRIPT_FORM_DEFINITIONS.length, 5);
    assert.equal(FORM_RULES.length, 19, 'cinco de JavaScript (onda 1) + catorze de TypeScript (onda 7)');
    // as dezenove chaves são distintas — duas regras com a mesma chave seriam
    // emissão duplicada da MESMA forma, e o orçamento não saberia qual aula cobrar.
    assert.equal(new Set(FORM_RULES.map((r) => r.key)).size, 19);
  });

  for (const [chave, casa, naoCasa, oQueSepara] of PARES_TYPESCRIPT) {
    it(`form:${chave} — ${oQueSepara}`, () => {
      assert.ok(
        formKeysOfTs(casa).includes(`form:${chave}`),
        `o lado que CASA não emitiu a forma:\n${casa}\nemitidas: ${formKeysOfTs(casa).join(' ') || '(nenhuma)'}`,
      );
      assert.ok(
        !formKeysOfTs(naoCasa).includes(`form:${chave}`),
        `o lado que NÃO casa emitiu a forma — seletor que casa tudo é pior que seletor nenhum:\n${naoCasa}`,
      );
    });
  }

  it('as duas chaves `form:` da semente receptiva do harness TypeScript TÊM emissor', () => {
    // `TYPESCRIPT_TYPE_HARNESS_SEED` (atomKeys.ts) declara as duas; até a onda 7
    // ninguém as emitia, e uma semente sem emissor perdoa o que nunca aparece.
    const harness = 'export function saudar(nome: string): string {\n  return "Ola, " + nome;\n}\n';
    const emitidas = formKeysOfTs(harness);
    assert.ok(emitidas.includes('form:Parameter[type!=null]'));
    assert.ok(emitidas.includes('form:FunctionDeclaration[type!=null]'));
  });

  it('DIVERGÊNCIA MEDIDA: `if (typeof x === "…")` NÃO casa a forma do typeof — casa a da igualdade', () => {
    // A spec dava `if (typeof x === 'string')` como par mínimo de
    // `form:IfStatement[expression=TypeOfExpression]`. No AST, a condição desse
    // trecho é o BinaryExpression do `===`, e o TypeOfExpression é o operando
    // ESQUERDO dele — dois níveis abaixo do atributo `expression`. A DSL compara
    // o atributo com o tipo do nó NAQUELA POSIÇÃO, sem caminho nem descendente
    // (form/selector.ts §"SINTAXE MÍNIMA", item 3). A forma entra LITERAL, como
    // o documento a escreve; este teste fixa o que ela de fato separa, para que
    // a divergência não seja descoberta pela trilha em produção.
    const emitidas = formKeysOfTs("if (typeof x === 'string') { g(); }");
    assert.ok(!emitidas.includes('form:IfStatement[expression=TypeOfExpression]'));
    assert.ok(emitidas.includes('form:IfStatement[expression=BinaryExpression]'));
    // e o typeof "puro" continua sendo o único trecho que casa a primeira.
    assert.ok(formKeysOfTs('if (typeof x) { g(); }').includes('form:IfStatement[expression=TypeOfExpression]'));
  });
});

// ---------------------------------------------------------------------------
// O GATE DE DIALETO — regra de TypeScript NUNCA é avaliada em código JavaScript
// ---------------------------------------------------------------------------

describe('form — o gate de dialeto (o placar de uma trilha de JavaScript não pode mudar)', () => {
  it('toda regra declara seu(s) dialeto(s): as cinco de JS valem nos dois, as catorze de TS só em ts', () => {
    const porChave = new Map(FORM_RULES.map((r) => [r.key, r]));
    for (const def of JAVASCRIPT_FORM_DEFINITIONS) {
      const regra = porChave.get(`form:${def.selector.replace(/\s+/g, '')}`);
      assert.ok(regra, `regra de JavaScript sumiu da bateria: ${def.selector}`);
      assert.deepEqual([...regra.dialects].sort(), ['js', 'ts'], `${regra.key} deixou de valer nos dois dialetos`);
      assert.deepEqual([...regra.compiled.dialects].sort(), ['js', 'ts']);
    }
    for (const def of TYPESCRIPT_FORM_DEFINITIONS) {
      const regra = porChave.get(`form:${def.selector}`);
      assert.ok(regra, `regra de TypeScript sumiu da bateria: ${def.selector}`);
      assert.deepEqual([...regra.dialects], ['ts'], `${regra.key} seria avaliada em código JavaScript`);
      assert.deepEqual([...regra.compiled.dialects], ['ts']);
    }
  });

  it('MEDIDO: as três formas de TS que casam JavaScript PURO não emitem nada em .mjs', () => {
    // Estas três são a razão de o gate existir. Sem ele, uma trilha de
    // JavaScript ganharia chaves `form:` que nenhuma aula dela declara — e
    // toda violação nova viraria lacuna de currículo inventada pelo gate.
    const armadilhas: Array<[string, string]> = [
      ['function f(...xs) { return xs; }', 'form:Parameter[dotDotDotToken!=null]'],
      ["if (forma === 'circulo') { g(); }", 'form:IfStatement[expression=BinaryExpression]'],
      ['if (typeof x) { g(); }', 'form:IfStatement[expression=TypeOfExpression]'],
    ];
    for (const [codigo, chave] of armadilhas) {
      assert.ok(
        !formKeysOf(codigo).includes(chave),
        `${chave} vazou para o dialeto js em:\n${codigo}\nemitidas: ${formKeysOf(codigo).join(' ')}`,
      );
      // e a MESMA fonte, lida como TypeScript, emite — o gate é do dialeto, não do trecho.
      assert.ok(formKeysOfTs(codigo).includes(chave), `${chave} deveria casar em ts: ${codigo}`);
    }
  });

  it('NENHUMA chave form: nova aparece em código JavaScript — a bateria de JS é a mesma de antes', () => {
    // O canário do placar, em teste: para um corpus de JavaScript idiomático, o
    // conjunto de chaves form: emitidas é subconjunto estrito das CINCO da onda 1.
    const cincoDeJs = new Set(JAVASCRIPT_FORM_DEFINITIONS.map((d) => `form:${d.selector.replace(/\s+/g, '')}`));
    const corpusJs = [
      'const f = function () {};',
      'if (a) { usa(a); }',
      'const dobra = (x) => x * 2;',
      "function montar(nome, versao = '1.0.0') { return { nome, versao }; }",
      'const api = { somar(a, b) { return a + b; } };',
      'function media(...ns) { return ns.length; }',
      "if (tipo === 'circulo') { area(); } else { outro(); }",
      "if (typeof v === 'string') { usa(v); }",
      'class C { constructor(x) { this.x = x; } m() { return this.x; } }',
      'export function saudar(nome) { return `Ola, ${nome}`; }',
    ];
    for (const codigo of corpusJs) {
      for (const chave of formKeysOf(codigo)) {
        assert.ok(cincoDeJs.has(chave), `chave form: NOVA em código JavaScript: ${chave}\n${codigo}`);
      }
    }
  });

  it('as CINCO formas de JavaScript continuam valendo num arquivo .ts (a trilha TS pressupõe o axioma JS)', () => {
    assert.ok(formKeysOfTs('const f = function () {};').includes('form:VariableDeclaration>FunctionExpression'));
    assert.ok(formKeysOfTs('if (a) { usa(a); }').includes('form:IfStatement[alternate=null]'));
    assert.ok(formKeysOfTs('const f = (x: number) => x + 1;').includes('form:ArrowFunction[body!=Block]'));
    assert.ok(formKeysOfTs('function f(x = 1) { return x; }').includes('form:Parameter[initializer!=null]'));
    assert.ok(formKeysOfTs('const api = { somar(a: number, b: number) { return a + b; } };').includes('form:ObjectLiteralExpression>MethodDeclaration'));
  });

  it('o dialeto NÃO entra na chave — a mesma forma tem a mesma chave onde quer que seja avaliada', () => {
    const so_ts = parseSelector('Parameter[type!=null]', ['ts']);
    const nos_dois = parseSelector('Parameter[type!=null]');
    assert.equal(so_ts.canonical, nos_dois.canonical);
    assert.equal(formKey(so_ts), formKey(nos_dois));
    assert.equal(formKey(so_ts), 'form:Parameter[type!=null]');
  });

  it('selectorMatches é quem recusa — o gate mora no seletor, não no chamador', () => {
    const soTs = parseSelector('Parameter[dotDotDotToken!=null]', ['ts']);
    const acharParametro = (code: string, kind: ts.ScriptKind): ts.Node => {
      const source = ts.createSourceFile(kind === ts.ScriptKind.TS ? 'x.ts' : 'x.mjs', code, ts.ScriptTarget.Latest, true, kind);
      let achado: ts.Node | undefined;
      const find = (n: ts.Node): void => {
        if (!achado && ts.isParameter(n)) achado = n;
        ts.forEachChild(n, find);
      };
      ts.forEachChild(source, find);
      assert.ok(achado, 'a fixture precisa ter um Parameter');
      return achado;
    };
    assert.equal(selectorMatches(soTs, acharParametro('function f(...xs: number[]) {}', ts.ScriptKind.TS)), true);
    assert.equal(selectorMatches(soTs, acharParametro('function f(...xs) {}', ts.ScriptKind.JS)), false);
    // o MESMO seletor sem restrição casa nos dois — a diferença é só a marcação.
    const semRestricao = parseSelector('Parameter[dotDotDotToken!=null]');
    assert.equal(selectorMatches(semRestricao, acharParametro('function f(...xs) {}', ts.ScriptKind.JS)), true);
  });

  it('dialeto inválido ou lista vazia é ERRO DE CARGA (A-P06-4), nunca silêncio', () => {
    assert.throws(
      () => parseSelector('Parameter[type!=null]', []),
      (err: unknown) => err instanceof FormSelectorError && err.code === FORM_SELECTOR_INVALID,
      'lista vazia de dialetos — uma regra que não vale em lugar nenhum',
    );
    assert.throws(
      () => buildFormRules([{ selector: 'Parameter[type!=null]', description: 'x', dialects: ['python'] as never }]),
      (err: unknown) => err instanceof FormSelectorError && err.code === FORM_SELECTOR_INVALID,
    );
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
    // Rodada 12: a bateria A13–A16 entrou no gate — a MESMA forma (if sem else,
    // nunca demonstrada) fala no orçamento (A2) E no ensino-efetivo (A13a).
    assert.equal(formV.length, 2, JSON.stringify(report.violations, null, 2));
    assert.ok(formV.every((v) => v.construcao === 'form:IfStatement[alternate=null]'));
    assert.ok(formV.some((v) => v.regra === 'A2' && v.campo === 'solutionCode'));
    assert.ok(formV.some((v) => v.regra === 'A13' && v.campo === 'solutionCode'));
    // if/else foi ENSINADO (demonstrado); if sem else NÃO — nos dois gates a
    // primeiraAulaQueEnsina é null (lacuna: falta a aula da forma).
    assert.ok(formV.every((v) => v.primeiraAulaQueEnsina === null));
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
  // pelo STARTER (seed RECEPTIVA), não por aula. Sem NENHUMA chamada na teoria
  // (antes havia um `console.log(nome)`): com o A13c alinhado à spec §3.2 a
  // teoria DA MESMA aula conta como demonstração — um console.log demonstraria
  // CallExpression e a chamada do teste deixaria de ser o "pecado nº 1" (ver
  // engineProgressao.test.ts, caso "demonstrada na teoria DA MESMA aula").
  const theoryFuncao = 'export function saudar(nome) {\n}\n';

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
    // O contrato ORIGINAL do A-P06-2 segue valendo: A1/A3 (o orçamento) deixam
    // o testsCode do corpus limpo — a seed isenta o RUNNER, não o conteúdo.
    const testsOrcamento = report.violations.filter(
      (v) => v.campo === 'testsCode' && (v.regra === 'A1' || v.regra === 'A3'),
    );
    assert.deepEqual(testsOrcamento, [], JSON.stringify(report.violations, null, 2));
    // A bateria A13 (rodada 12) é MAIS estrita que o orçamento: o teste é lido
    // ANTES da aula 1 e a chamada `cumprimentar(42)` nunca foi DEMONSTRADA —
    // nem nesta aula (a teoria ensina só função declarada, sem chamada) nem em
    // aula anterior → A13c flagia (é o "pecado nº 1" da spec §3.2 — a aula 1
    // que lê chamada sem NENHUMA demonstração em lugar nenhum; se a MESMA aula
    // demonstrasse uma chamada, a fórmula §3.2 a contaria e o A13c passaria,
    // cf. engineProgressao.test.ts). As arrows, porém, ficam DENTRO do span
    // mecânico S13 (assinatura de `assert.throws(() =>`) — nenhuma FORMA viola.
    const testsA13c = report.violations.filter((v) => v.regra === 'A13' && v.campo === 'testsCode');
    assert.ok(
      testsA13c.some((v) => v.construcao === 'node:CallExpression'),
      JSON.stringify(report.violations, null, 2),
    );
    const formV = report.violations.filter((v) => (v.construcao ?? '').startsWith('form:'));
    assert.deepEqual(
      formV.filter((v) => v.regra === 'A1' || v.regra === 'A2' || v.regra === 'A3'),
      [],
      JSON.stringify(report.violations, null, 2),
    );
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
    // O contrato ORIGINAL: a assinatura congelada (com default) não viola A1
    // nem A2 — a forma está na seed receptiva.
    const formAbrigo = report.violations.filter(
      (v) => (v.construcao ?? '').startsWith('form:') && (v.regra === 'A1' || v.regra === 'A2'),
    );
    assert.deepEqual(formAbrigo, [], JSON.stringify(report.violations, null, 2));
    // A bateria A13 (rodada 12): o starter expõe o default SEM demonstração —
    // é o caso real MEDIDO na spec (§3.2: "starter 3 em 2 aulas",
    // npm-e-package-json). A seed isenta o ORÇAMENTO; o ensino-efetivo não.
    const a13bDefault = report.violations.filter(
      (v) => v.regra === 'A13' && v.campo === 'starterCode' && v.construcao === 'form:Parameter[initializer!=null]',
    );
    assert.equal(a13bDefault.length, 1, JSON.stringify(report.violations, null, 2));
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
    const formV = report.violations.filter(
      (v) => (v.construcao ?? '').startsWith('form:') && v.regra === 'A2',
    );
    assert.equal(formV.length, 1, JSON.stringify(report.violations, null, 2));
    assert.equal(formV[0].construcao, 'form:ArrowFunction[body!=Block]');
    assert.equal(formV[0].regra, 'A2');
    assert.equal(formV[0].campo, 'solutionCode');
    // Lacuna de currículo: nenhuma aula introduziu a forma no produtivo — a
    // seed isentou só o receptivo, e escrever a forma segue exigindo aula.
    assert.equal(formV[0].primeiraAulaQueEnsina, null);
  });
});