/**
 * tests/engineLangTypescript.test.ts — O ADAPTADOR TYPESCRIPT, o terceiro do
 * registro e a prova da SEGUNDA CAMADA DE TRAVA.
 *
 * Contrato normativo: `docs/research/08-multilingua-trava-deterministica.md`
 * §5 (ficha TypeScript — Tier A, "a trava passa a ter duas camadas
 * decidíveis") e §6 (os 15 membros); `docs/18-trilha-typescript.md` inteiro,
 * em especial §"A segunda decisão: o erro de tipo não é observável rodando o
 * teste", §"A semente receptiva do harness TypeScript" e §"O que esta trilha
 * exige da engine".
 *
 * Este arquivo prova CINCO coisas, e a ordem é a da confiança:
 *
 *   1. QUE O ADAPTADOR É COMPOSIÇÃO, E QUE A COMPOSIÇÃO É REAL — onze dos
 *      quinze membros são o objeto do adaptador `javascript` (identidade de
 *      referência, não igualdade de valor), e os quatro que mudam mudam pelo
 *      motivo declarado.
 *   2. QUE O DIALETO É `ts` DE VERDADE — `interface`, `as`, `enum`, `keyof`
 *      parseiam e emitem as chaves `node:` esperadas, e existe um par de
 *      fontes que separa os dois dialetos NOS DOIS SENTIDOS (uma que só
 *      parseia como TypeScript e uma que só parseia como JavaScript).
 *   3. QUE A RESOLUÇÃO DE ESCOPO ENXERGA A CAMADA DE TIPOS — `interface`,
 *      `type`, `enum` e `<T>` declaram nome, e `Partial` cai no eixo `global:`
 *      mesmo aparecendo só em posição de tipo.
 *   4. QUE A SEMENTE RECEPTIVA É NECESSÁRIA — medido: o harness mínimo de um
 *      desafio TypeScript emite chaves de TIPO que a semente de JavaScript não
 *      cobre; sem o acréscimo, todo desafio da trilha nasceria violando.
 *   5. QUE A QUINTA PROVA MORDE, E SÓ ELA — com `tsc` e `node` REAIS: o mesmo
 *      arquivo que o `node --test` aprova (exit 0, `pass 1`) o `tsc --noEmit`
 *      reprova (TS2322), a prova 5 cai, e as provas 2 e 4 continuam
 *      RUNTIME-ONLY.
 *
 * O item 5 é o único que gera processo. Ele existe porque a afirmação
 * normativa de `docs/18` — "o Node APAGA os tipos, ele não os confere" — não é
 * verificável com executor fake: um fake que devolvesse o que se espera
 * provaria apenas que o fake foi escrito de acordo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TS_CHALLENGE_LANGUAGES,
  TS_DEFAULT_RUNTIME,
  TS_DOUBLE_ASSERTION_KEY,
  TS_ENTRY_PATH,
  TS_ENV_SCRUB,
  TS_FORBIDDEN_INVARIANTS,
  TS_FORM_AXIS_SUPPORTED,
  TS_MANIFEST_PATH,
  TS_SAFE_FILE_PATH_RE,
  TS_SUPPRESSION_DIRECTIVES,
  TS_TEST_COMMAND,
  TS_TEST_PATH,
  TS_THEORY_FENCE_TAGS,
  TS_TYPE_GLOBALS,
  tsScanSuppressionDirectives,
  typescriptAdapter,
} from '../electron/main/engine/lang/typescript';
import { javascriptAdapter } from '../electron/main/engine/lang/javascript';
import {
  KNOWN_LANGUAGE_IDS,
  adapterIdForChallengeLanguage,
  adapterIdForTheoryTag,
  applyEnvScrub,
  classifyTheoryTag,
  getAdapter,
  type LangNode,
  type ParseOk,
} from '../electron/main/engine/lang/registry';
import {
  HARNESS_RECEPTIVE_SEED,
  STRUCTURAL_ALWAYS_ALLOWED,
  TYPESCRIPT_HARNESS_RECEPTIVE_SEED,
  TYPESCRIPT_TYPE_HARNESS_SEED,
  harnessReceptiveSeed,
  isForbiddenAlways,
  structuralAlwaysAllowed,
} from '../electron/main/engine/atomKeys';
import { extractAtoms } from '../electron/main/engine/extract';
import { prepareIsolatedDir, cleanupDir } from '../electron/main/engine/exec/harness';
import {
  EMPTY_STUB_CODE,
  judgeEmptyStubFails,
  judgeStarterFails,
  judgeTypesCheck,
  type ExecFn,
  type ExecResult,
} from '../electron/main/engine/exec/proofs';
import {
  TSC_NOEMIT_ARGS,
  alvosDaChecagem,
  criarTypesCheck,
  politicaDeTipos,
  resolverCompiladorNpm,
} from '../electron/main/engine/exec/typesCheck';
import atoms from '../electron/main/engine/vocab/atoms.json';

const ts = typescriptAdapter;
const js = javascriptAdapter;
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'typescript');

/** Todos os nós da árvore normalizada, em pré-ordem. */
function todosOsNos(raiz: LangNode): LangNode[] {
  const out: LangNode[] = [];
  const visitar = (n: LangNode): void => {
    out.push(n);
    for (const f of n.children) visitar(f);
  };
  visitar(raiz);
  return out;
}

/** O `ParseOk` de um fonte — falha o teste se o parser reprovar. */
function parsear(fonte: string): ParseOk {
  const r = ts.parse(fonte);
  assert.ok(r.ok, r.ok ? '' : `parse falhou: ${r.error.message}`);
  return r;
}

/** Todas as chaves que `constructKey` emite para um fonte. */
function chavesDe(fonte: string): Set<string> {
  return new Set(
    todosOsNos(parsear(fonte).root)
      .map((n) => ts.constructKey(n))
      .filter((k): k is string => k !== null),
  );
}

/** O corpo TypeScript da fixture de diretivas (tudo depois do marcador). */
function fonteDasDiretivas(): string {
  const bruto = fs.readFileSync(path.join(FIXTURES, 'diretivas-de-supressao.ts.txt'), 'utf8');
  const i = bruto.indexOf('// ---8<---');
  assert.notEqual(i, -1, 'a fixture perdeu o marcador de início do fonte');
  return bruto.slice(i);
}

// ---------------------------------------------------------------------------
// 1. Identidade e registro
// ---------------------------------------------------------------------------

describe('typescript — identidade e registro', () => {
  it('está registrado, e o id é a LINGUAGEM (não o runtime nem o conferidor)', () => {
    assert.ok((KNOWN_LANGUAGE_IDS as readonly string[]).includes('typescript'));
    assert.equal(getAdapter('typescript'), ts);
    assert.equal(ts.id, 'typescript');
    assert.equal(ts.label, 'TypeScript');
  });

  it("'ts' é grafia curta da linguagem; as duas resolvem para o MESMO adaptador", () => {
    assert.deepEqual([...TS_CHALLENGE_LANGUAGES], ['typescript', 'ts']);
    for (const token of TS_CHALLENGE_LANGUAGES) {
      assert.equal(adapterIdForChallengeLanguage(token), 'typescript', token);
    }
    assert.equal(adapterIdForChallengeLanguage('TypeScript'), 'typescript', 'caixa normalizada');
    // e não roubam os tokens do vizinho
    assert.equal(adapterIdForChallengeLanguage('nodejs'), 'javascript');
    assert.equal(adapterIdForChallengeLanguage('javascript'), 'javascript');
  });

  it("defaultRuntime é 'nodejs' — o RUNNER; o conferidor de tipos é outra camada", () => {
    // Node 24 roda `.ts` sem flag, mas APAGANDO os tipos. A metade `tsc` do par
    // não é runtime: ela é política de execução (POLITICAS_DE_TIPOS).
    assert.equal(ts.defaultRuntime, 'nodejs');
    assert.equal(TS_DEFAULT_RUNTIME, 'nodejs');
    assert.equal(ts.defaultRuntime, js.defaultRuntime, 'o runner é literalmente o mesmo');
    assert.equal(politicaDeTipos('typescript').required, true, 'e por isso a quinta prova é EXIGIDA');
    assert.equal(politicaDeTipos('javascript').required, false);
  });

  it('as tags de teoria são `ts` e `typescript`; `tsx` NÃO é reivindicada', () => {
    assert.deepEqual([...ts.theoryFenceTags], [...TS_THEORY_FENCE_TAGS]);
    assert.equal(adapterIdForTheoryTag('ts'), 'typescript');
    assert.equal(adapterIdForTheoryTag('typescript'), 'typescript');
    // `docs/18` põe JSX/TSX fora do escopo do produto, e `ScriptKind.TS` não
    // parseia JSX — reivindicar a tag faria um bloco TSX correto virar
    // PARSE_ERROR. Sem a tag, ele fica fora de parser nenhum (fail-closed).
    assert.equal(classifyTheoryTag('tsx').kind, 'desconhecida');
    assert.equal(adapterIdForTheoryTag('tsx'), null);
    // e as tags de JavaScript continuam com o dono de sempre
    assert.equal(adapterIdForTheoryTag('js'), 'javascript');
    assert.equal(adapterIdForTheoryTag('jsx'), 'javascript');
  });

  it('o eixo `form:` está disponível (ao contrário de Python) — declarado como VALOR', () => {
    assert.equal(TS_FORM_AXIS_SUPPORTED, true);
  });
});

// ---------------------------------------------------------------------------
// 2. Composição — o que é DELEGADO é o MESMO objeto, não uma cópia
// ---------------------------------------------------------------------------

describe('typescript — composição sobre o adaptador javascript', () => {
  it('failureExitCodes e a política de ambiente são os do JavaScript (mesmo processo, mesmos exit codes)', () => {
    assert.equal(ts.failureExitCodes, js.failureExitCodes, 'identidade de referência: nada foi copiado');
    assert.equal(ts.failureExitCodes.successRequiresCountMatch, true, 'a dupla-igualdade é invariante');
    assert.equal(TS_ENV_SCRUB.allow, js.envScrub.allow);
    assert.equal(TS_ENV_SCRUB.fixed, js.envScrub.fixed);
    assert.equal(TS_ENV_SCRUB.strip, js.envScrub.strip);
    assert.ok(
      (TS_ENV_SCRUB.strip as readonly string[]).includes('NODE_OPTIONS'),
      'NODE_OPTIONS herdado poderia desligar o type stripping do Node 24',
    );
    assert.ok(
      (TS_ENV_SCRUB.strip as readonly string[]).includes('NODE_TEST_CONTEXT'),
      'sem isso o node:test do filho sai 0 sem rodar nada',
    );
    assert.ok(TS_ENV_SCRUB.scope.length > js.envScrub.scope.length, 'a quinta prova acrescenta uma linha de escopo');
  });

  it('detect() delega — o binário do filho é o mesmo `node`', () => {
    assert.deepEqual(ts.detect(), js.detect());
  });

  it('countDeclared/countRun/parseChecks delegam (mesmo runner, mesmo relatório)', () => {
    const testsCode = [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { dobro } from './solution.ts';",
      '',
      "test('dobro', () => {",
      '  const esperado: number = 4;',
      '  assert.equal(dobro(2), esperado);',
      '});',
      '',
      "test.skip('pulado', (): void => {});",
      '',
      '// test("comentado nao conta", () => {});',
      '',
    ].join('\n');
    // comentário não é nó — o `// test(` comentado NÃO entra na contagem
    assert.equal(ts.countDeclared(testsCode), 2);
    assert.equal(ts.countDeclared(testsCode), js.countDeclared(testsCode));

    const relatorio = 'ℹ tests 2\nℹ pass 2\nℹ fail 0\nℹ skipped 0\n';
    assert.deepEqual(ts.countRun(relatorio), js.countRun(relatorio));
    assert.equal(ts.countRun(relatorio).testsRun, 2);

    const spec = '✔ soma dois (1ms)\n✖ soma tres (2ms)\nℹ tests 2\nℹ pass 1\nℹ fail 1\nℹ skipped 0\n';
    assert.deepEqual(ts.parseChecks(spec), js.parseChecks(spec));
  });

  it('inventory() é o do JavaScript MAIS as chaves sintéticas de tipo', () => {
    const inv = new Set(ts.inventory());
    for (const nome of js.inventory()) assert.ok(inv.has(nome), `perdeu ${nome}`);
    for (const nome of ['KeyOfType', 'ReadonlyArrayType', 'TypeOnlyImport', 'TypeOnlyExport']) {
      assert.ok(inv.has(nome), `sintética ausente: ${nome}`);
    }
    // o universo de `ts.SyntaxKind` já é o dos DOIS dialetos (é o mesmo compilador)
    for (const nome of ['InterfaceDeclaration', 'TypeAliasDeclaration', 'EnumDeclaration', 'AsExpression']) {
      assert.ok(inv.has(nome), nome);
      assert.ok((js.inventory() as readonly string[]).includes(nome), `${nome} já vinha do enum compartilhado`);
    }
    assert.deepEqual([...ts.inventory()], [...ts.inventory()].sort(), 'ordem estável');
  });

  it('globals() acrescenta os globais que só existem em posição de TIPO', () => {
    const g = ts.globals();
    for (const nome of js.globals()) assert.ok(g.has(nome), `perdeu o global de runtime ${nome}`);
    for (const nome of ['Partial', 'Pick', 'Omit', 'Record', 'Required', 'ReturnType', 'Parameters', 'Awaited']) {
      assert.ok(g.has(nome), `global de tipo ausente: ${nome}`);
      assert.ok(!js.globals().has(nome), `${nome} NÃO é propriedade de globalThis — é por isso que a lista existe`);
    }
    assert.ok(g.has('Promise'), 'Promise é global nos DOIS mundos (valor e tipo)');
    assert.equal(ts.builtins(), ts.globals(), 'em TypeScript builtins e globals coincidem');
    // A lista é DIGITADA (o espaço de nomes de TIPO não tem `globalThis` de
    // onde lê-la) e agrupada por origem — utilitários de `lib.es5.d.ts` antes
    // dos tipos ambientes. O que o teste exige dela é o que importa: nenhum
    // nome repetido, e nenhum que já viesse do runtime.
    assert.equal(new Set(TS_TYPE_GLOBALS).size, TS_TYPE_GLOBALS.length, 'lista digitada sem repetição');
  });
});

// ---------------------------------------------------------------------------
// 3. parse — o dialeto `ts` tem um consumidor, e ele é REAL
// ---------------------------------------------------------------------------

describe('typescript — parse com dialect: ts', () => {
  it('`interface`, `as` e `enum` parseiam e emitem as chaves `node:` esperadas', () => {
    const fonte = [
      'interface Pessoa { nome: string; idade?: number }',
      'enum Cor { Vermelho, Azul }',
      'const p = { nome: "a" } as Pessoa;',
      'type Identificador = string | number;',
      'const q: any = 1;',
      'function f(x: string): boolean { return x.length > 0; }',
      'const lista: string[] = [];',
    ].join('\n');
    const chaves = chavesDe(fonte);
    for (const esperada of [
      'node:InterfaceDeclaration',
      'node:PropertySignature',
      'node:EnumDeclaration',
      'node:EnumMember',
      'node:AsExpression',
      'node:TypeAliasDeclaration',
      'node:UnionType',
      'node:TypeReference',
      'node:AnyKeyword',
      'node:StringKeyword',
      'node:NumberKeyword',
      'node:BooleanKeyword',
      'node:ArrayType',
    ]) {
      assert.ok(chaves.has(esperada), `faltou ${esperada} (emitidas: ${[...chaves].sort().join(' ')})`);
    }
  });

  it('a MESMA fonte pelo extrator (ExtractOptions.dialect: ts) emite as MESMAS chaves node:', () => {
    // A costura `dialect: 'ts'` existia em `extract.ts` SEM CHAMADOR; o
    // `adapter.parse` deste adaptador é o chamador que faltava.
    const fonte = fs.readFileSync(path.join(FIXTURES, 'camada-de-tipos.ts'), 'utf8');
    const r = extractAtoms(fonte, { fileName: 'camada-de-tipos.ts', dialect: 'ts' });
    assert.ok(r.ok, r.ok ? '' : `extração falhou: ${r.error.message}`);
    const doExtrator = new Set(r.keys);
    for (const esperada of [
      'node:InterfaceDeclaration',
      'node:TypeAliasDeclaration',
      'node:EnumDeclaration',
      'node:AsExpression',
      'node:UnionType',
      'node:TypeReference',
      'node:ArrayType',
      'node:StringKeyword',
      'node:NumberKeyword',
      'node:BooleanKeyword',
    ]) {
      assert.ok(doExtrator.has(esperada), `o extrator não emitiu ${esperada}`);
    }
    // e o MESMO fonte sem o dialeto reprova — a fixture é TypeScript de verdade
    const semDialeto = extractAtoms(fonte, { fileName: 'camada-de-tipos.ts' });
    assert.equal(semDialeto.ok, true, 'o parser do TS aceita anotação nos DOIS ScriptKind (medido)');
  });

  it('o dialeto é `ts` DE VERDADE — o par de fontes separa os dois sentidos', () => {
    // `<string>alvo` é asserção de tipo em TypeScript e abertura de JSX em
    // JavaScript; `<div />` é o contrário. Se `tsParse` estivesse delegando
    // sem trocar o dialeto, as duas linhas dariam o MESMO veredito.
    const assercao = 'const y = <string>alvo;';
    assert.equal(ts.parse(assercao).ok, true, 'TypeScript: asserção de tipo');
    assert.equal(js.parse(assercao).ok, false, 'JavaScript: JSX sem fechamento');

    const jsx = 'const w = <div />;';
    assert.equal(js.parse(jsx).ok, true, 'JavaScript: elemento JSX');
    assert.equal(ts.parse(jsx).ok, false, 'TypeScript: `>` esperado');
  });

  it('o `dialect` do CHAMADOR é ignorado — este adaptador não parseia como JavaScript sob pedido', () => {
    const assercao = 'const y = <string>alvo;';
    assert.equal(ts.parse(assercao, { dialect: 'js' }).ok, true, 'continua TypeScript');
  });

  it('erro de sintaxe vira PARSE_ERROR estruturado com linha e coluna 1-based', () => {
    const r = ts.parse('interface Pessoa { nome: string\nfunction );');
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.ok(r.error.line >= 1 && r.error.column >= 1);
    assert.ok(r.error.message.length > 0);
  });

  it('os offsets do nó normalizado indexam a MESMA string do fonte (inclusive com acento)', () => {
    const fonte = 'const informação: string = "número";\n';
    const raiz = parsear(fonte).root;
    for (const n of todosOsNos(raiz)) {
      assert.equal(fonte.slice(n.start, n.end), n.text, `offset furado em ${n.type}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. constructKey — as chaves sintéticas da camada de tipos
// ---------------------------------------------------------------------------

describe('typescript — constructKey e as chaves sintéticas', () => {
  it('`keyof T` e `readonly T[]` deixam de ser o MESMO node:TypeOperator', () => {
    const chaves = chavesDe(['type A = keyof Pessoa;', 'type B = readonly string[];'].join('\n'));
    assert.ok(chaves.has('node:KeyOfType'));
    assert.ok(chaves.has('node:ReadonlyArrayType'));
    assert.ok(!chaves.has('node:TypeOperator'), 'a chave genérica não distinguia as duas aulas');
  });

  it('`import type` e `export type` viram chave própria (o discriminante é um booleano do nó)', () => {
    const chaves = chavesDe(["import type { Foo } from './foo.ts';\nexport type { Bar } from './bar.ts';"].join('\n'));
    assert.ok(chaves.has('node:TypeOnlyImport'));
    assert.ok(chaves.has('node:TypeOnlyExport'));
    // o import de VALOR continua sendo o nó de sempre
    const valor = chavesDe("import { Foo } from './foo.ts';");
    assert.ok(valor.has('node:ImportClause'));
    assert.ok(!valor.has('node:TypeOnlyImport'));
  });

  it('`as unknown as T` tem chave própria — a fuga da camada semântica', () => {
    const chaves = chavesDe('const n = p as unknown as number;');
    assert.ok(chaves.has(TS_DOUBLE_ASSERTION_KEY));
    assert.equal(TS_DOUBLE_ASSERTION_KEY, 'node:DoubleAssertionViaUnknown');
    // uma asserção simples NÃO dispara a chave
    assert.ok(!chavesDe('const p = x as Pessoa;').has(TS_DOUBLE_ASSERTION_KEY));
  });

  it('os eixos que não são de tipo continuam vindo do JavaScript, byte a byte', () => {
    const fonte = 'let a = 1;\nconst b = a !== 2;\na += 3;\n';
    for (const n of todosOsNos(parsear(fonte).root)) {
      assert.equal(ts.constructKey(n), js.constructKey(n), `divergiu em ${n.type}`);
    }
    const chaves = chavesDe(fonte);
    assert.ok(chaves.has('decl:let'));
    assert.ok(chaves.has('decl:const'));
    assert.ok(chaves.has('op:binary:!=='));
    assert.ok(chaves.has('op:assign:+='));
  });
});

// ---------------------------------------------------------------------------
// 5. resolveScopes — a camada de tipos TAMBÉM declara nome
// ---------------------------------------------------------------------------

describe('typescript — resolveScopes enxerga a camada de tipos', () => {
  const fonte = [
    'interface Pessoa { nome: string }',
    'type Id = string;',
    'enum Cor { Vermelho }',
    'function f<T>(p: Pessoa, i: Id, c: Cor, t: T): Partial<Pessoa> { return p; }',
    '',
  ].join('\n');

  it('`interface`, `type`, `enum` e `<T>` entram em `declared` — e somem de `free`', () => {
    const s = ts.resolveScopes(parsear(fonte));
    for (const nome of ['Pessoa', 'Id', 'Cor', 'T', 'f', 'p', 'i', 'c', 't']) {
      assert.ok(s.declared.has(nome), `${nome} deveria estar declarado`);
      assert.ok(!s.free.has(nome), `${nome} não pode ficar livre`);
    }
    // e o adaptador de JavaScript, que não conhece essas formas, deixaria os
    // nomes de TIPO livres — é a diferença que este membro existe para cobrir
    const sJs = js.resolveScopes(parsear(fonte));
    assert.ok(sJs.free.has('Pessoa'), 'a resolução de JavaScript não vê `interface`');
    assert.ok(sJs.free.has('T'), 'nem parâmetro de tipo');
  });

  it('`Partial` cai no eixo `global:` mesmo aparecendo SÓ em posição de tipo', () => {
    const s = ts.resolveScopes(parsear(fonte));
    assert.ok(s.globals.has('Partial'), 'docs/18, exigência 6 da lista acionável');
    assert.ok(!js.resolveScopes(parsear(fonte)).globals.has('Partial'), 'globalThis não tem `Partial`');
  });

  it('globals continua sendo `free ∩ globals()` — o contrato de ScopeResolution', () => {
    const s = ts.resolveScopes(parsear('console.log(Math.max(1, 2));\nconst x: Pick<A, "b"> = y;\n'));
    for (const nome of s.globals) {
      assert.ok(s.free.has(nome), `${nome} está em globals mas não em free`);
      assert.ok(ts.globals().has(nome), `${nome} não é global do adaptador`);
    }
    assert.ok(s.globals.has('console'));
    assert.ok(s.globals.has('Math'));
    assert.ok(s.globals.has('Pick'));
  });

  it('imported continua sendo subconjunto de declared', () => {
    const s = ts.resolveScopes(parsear("import type { Foo } from './foo.ts';\nimport { bar } from './bar.ts';\n"));
    for (const nome of s.imported) assert.ok(s.declared.has(nome), nome);
    assert.ok(s.imported.has('bar'));
  });
});

// ---------------------------------------------------------------------------
// 6. layout, caminho seguro e comando de teste — `.ts`, nunca `.mjs`
// ---------------------------------------------------------------------------

describe('typescript — layout e caminhos', () => {
  it('layout() escreve package.json {type:module} + solution.ts + test.ts, nessa ordem', () => {
    const l = ts.layout({ code: 'export const f = 1;\n', testsCode: "import './solution.ts';\n" });
    assert.deepEqual(
      l.files.map((f) => f.path),
      [TS_MANIFEST_PATH, TS_ENTRY_PATH, TS_TEST_PATH],
    );
    assert.equal(l.entryPath, 'solution.ts');
    assert.equal(l.testPath, 'test.ts');
    assert.equal(l.manifestPath, 'package.json');
    assert.deepEqual(JSON.parse(l.files[0].content), { type: 'module' });
  });

  it('o manifesto FICA — é o que faz o runner e o conferidor concordarem sobre ESM', () => {
    // `node --test test.ts` decide ESM×CJS pelo `type` do package.json mais
    // próximo, e `tsc --module nodenext` lê o MESMO campo. Se divergissem, a
    // prova 5 aprovaria o que a prova 1 reprova.
    const l = ts.layout({ code: 'x', testsCode: 'y' });
    assert.equal(l.manifestPath, js.layout({ code: 'x', testsCode: 'y' }).manifestPath);
    assert.equal(l.files[0].content, js.layout({ code: 'x', testsCode: 'y' }).files[0].content);
  });

  it('layout() multi-arquivo respeita os arquivos do desafio (desafio de MÓDULO)', () => {
    const l = ts.layout({
      code: 'ignorado',
      files: [
        { path: 'pessoa.ts', code: 'export interface Pessoa { nome: string }' },
        { path: 'lib/saudar.ts', code: 'export const s = 1;' },
      ],
      testsCode: 'z',
    });
    assert.deepEqual(
      l.files.map((f) => f.path),
      ['package.json', 'pessoa.ts', 'lib/saudar.ts', 'test.ts'],
    );
  });

  it('filePathPattern admite `.ts` e recusa `.mjs`, `.js` e escape de diretório', () => {
    assert.equal(TS_SAFE_FILE_PATH_RE.flags, '', 'sem /g: lastIndex compartilhado daria falso-negativo');
    assert.ok(ts.filePathPattern.test('solution.ts'));
    assert.ok(ts.filePathPattern.test('lib/pessoa.ts'));
    assert.ok(!ts.filePathPattern.test('solution.mjs'), '§6 obs. 1: o `.mjs` fixo é o que este campo destrava');
    assert.ok(!ts.filePathPattern.test('solution.js'));
    assert.ok(!ts.filePathPattern.test('../fuga.ts'));
    assert.ok(!ts.filePathPattern.test('a.b.ts'));
    // e o do JavaScript continua sendo o dele
    assert.ok(js.filePathPattern.test('solution.mjs'));
    assert.ok(!js.filePathPattern.test('solution.ts'));
  });

  it('testCommand roda `test.ts` SEM flag nenhuma (Node 24)', () => {
    assert.deepEqual([...TS_TEST_COMMAND], ['--test', '--test-reporter=spec', 'test.ts']);
    assert.deepEqual([...ts.testCommand], [...TS_TEST_COMMAND]);
    assert.ok(!ts.testCommand.some((a) => a.includes('strip-types')), 'type stripping é default no Node 24');
  });

  it('alvosDaChecagem manda os FONTES `.ts` ao compilador e nunca o manifesto', () => {
    const alvos = alvosDaChecagem(ts, { code: 'a', testsCode: 'b' });
    assert.deepEqual(alvos, ['solution.ts', 'test.ts']);
    assert.ok(!alvos.includes('package.json'), 'package.json não é fonte');
  });
});

// ---------------------------------------------------------------------------
// 7. forbiddenInvariants e a varredura de TRIVIA
// ---------------------------------------------------------------------------

describe('typescript — proibições globais (as duas camadas)', () => {
  it('herda TODAS as do JavaScript (as que quebram a decidibilidade)', () => {
    for (const chave of js.forbiddenInvariants) {
      assert.ok(
        (TS_FORBIDDEN_INVARIANTS as readonly string[]).includes(chave),
        `perdeu a proibição herdada ${chave}`,
      );
      assert.ok(isForbiddenAlways(chave, 'typescript'), chave);
    }
    assert.ok(isForbiddenAlways('global:eval', 'typescript'));
    assert.ok(isForbiddenAlways('node:ComputedNonLiteralAccess', 'typescript'));
  });

  it('acrescenta as QUATRO da camada semântica (docs/18 §Regras para os desafios)', () => {
    for (const chave of [
      'node:AnyKeyword',
      'node:DoubleAssertionViaUnknown',
      'node:TsIgnoreDirective',
      'node:TsExpectErrorDirective',
    ]) {
      assert.ok(isForbiddenAlways(chave, 'typescript'), `${chave} deveria ser proibida`);
      assert.ok(!isForbiddenAlways(chave, 'javascript'), `${chave} não é proibição de JavaScript`);
    }
  });

  it('`any` e `as unknown as` são PEGOS pelas chaves — as duas saem da árvore', () => {
    const chaves = chavesDe('const q: any = 1;\nconst n = q as unknown as number;\n');
    const proibidas = [...chaves].filter((k) => isForbiddenAlways(k, 'typescript'));
    assert.ok(proibidas.includes('node:AnyKeyword'));
    assert.ok(proibidas.includes('node:DoubleAssertionViaUnknown'));
  });
});

describe('typescript — a varredura de TRIVIA (@ts-ignore / @ts-expect-error)', () => {
  it('as duas diretivas são COMENTÁRIO, e a caminhada do AST não as emite', () => {
    // `extract.ts` depende explicitamente de "comentário não é nó" (é o que faz
    // um `// test(` comentado não contar). Este teste FIXA essa consequência:
    // sem a varredura de trivia, as duas proibições seriam letra morta.
    const fonte = '// @ts-ignore\nconst a: number = 1;\n';
    const chaves = chavesDe(fonte);
    assert.ok(!chaves.has('node:TsIgnoreDirective'), 'o AST não vê comentário — por isso a varredura existe');
    const r = extractAtoms(fonte, { dialect: 'ts' });
    assert.ok(r.ok);
    assert.ok(!r.keys.includes('node:TsIgnoreDirective'), 'nem o extrator');
  });

  it('a varredura acha as SETE diretivas da fixture, em todas as posições de comentário', () => {
    const achados = tsScanSuppressionDirectives(parsear(fonteDasDiretivas()));
    assert.equal(achados.length, 7, achados.map((a) => `${a.line}:${a.column} ${a.directive}`).join(' | '));
    assert.equal(achados.filter((a) => a.directive === '@ts-ignore').length, 4);
    assert.equal(achados.filter((a) => a.directive === '@ts-expect-error').length, 3);
    for (const a of achados) {
      assert.ok(a.line >= 1 && a.column >= 1, 'posição 1-based');
      assert.ok(a.snippet.includes(a.directive));
      assert.ok((TS_FORBIDDEN_INVARIANTS as readonly string[]).includes(a.key));
    }
    // ordenadas por posição no fonte
    const offsets = achados.map((a) => a.start);
    assert.deepEqual(offsets, [...offsets].sort((x, y) => x - y));
  });

  it('NÃO acha a diretiva escrita dentro de string ou de template — literal é NÓ, não trivia', () => {
    const achados = tsScanSuppressionDirectives(
      parsear("const s = '@ts-ignore';\nconst t = `@ts-expect-error`;\n"),
    );
    assert.deepEqual(achados, [], 'falso positivo em literal seria pior que não cobrir');
  });

  it('a posição apontada é a da diretiva, não a do bloco de trivia', () => {
    const fonte = 'const a = 1;\nfunction f() {\n  // @ts-ignore\n  return 1;\n}\n';
    const achados = tsScanSuppressionDirectives(parsear(fonte));
    assert.equal(achados.length, 1);
    assert.equal(achados[0].line, 3);
    assert.equal(achados[0].column, 6);
    assert.equal(fonte.slice(achados[0].start, achados[0].end), '@ts-ignore');
  });

  it('as chaves da varredura são exatamente as declaradas em TS_SUPPRESSION_DIRECTIVES', () => {
    assert.deepEqual(
      TS_SUPPRESSION_DIRECTIVES.map((d) => d.directive),
      ['@ts-ignore', '@ts-expect-error'],
    );
    assert.deepEqual(
      TS_SUPPRESSION_DIRECTIVES.map((d) => d.key),
      ['node:TsIgnoreDirective', 'node:TsExpectErrorDirective'],
    );
  });
});

// ---------------------------------------------------------------------------
// 8. A SEMENTE RECEPTIVA — sem ela, todo desafio TS nasce violando
// ---------------------------------------------------------------------------

describe('typescript — a semente receptiva do harness', () => {
  /** O harness mínimo de um desafio real da trilha (solução + teste). */
  const HARNESS = [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { saudar, nomes, ativo } from './solution.ts';",
    '',
    "test('saudar', () => {",
    "  assert.equal(saudar('Ana'), 'Ola, Ana');",
    '});',
    '',
    'export function saudar(nome: string): string {',
    "  return 'Ola, ' + nome;",
    '}',
    'export function nomes(p: Pessoa): string[] {',
    '  return [p.nome];',
    '}',
    'export function ativo(n: number): boolean {',
    '  return n > 0;',
    '}',
    '',
  ].join('\n');

  it('a semente de TypeScript é a de JavaScript INTEIRA mais as sete chaves de tipo', () => {
    const semente = harnessReceptiveSeed('typescript');
    for (const chave of HARNESS_RECEPTIVE_SEED) assert.ok(semente.includes(chave), `perdeu ${chave}`);
    for (const chave of TYPESCRIPT_TYPE_HARNESS_SEED) assert.ok(semente.includes(chave), `faltou ${chave}`);
    assert.deepEqual([...semente], [...TYPESCRIPT_HARNESS_RECEPTIVE_SEED]);
    assert.deepEqual(
      [...TYPESCRIPT_TYPE_HARNESS_SEED],
      [
        'form:Parameter[type!=null]',
        'form:FunctionDeclaration[type!=null]',
        'node:StringKeyword',
        'node:NumberKeyword',
        'node:BooleanKeyword',
        'node:TypeReference',
        'node:ArrayType',
      ],
      'a lista de docs/18 §"A semente receptiva do harness TypeScript"',
    );
  });

  it('a semente de JAVASCRIPT não se move — o placar de nodejs-do-zero não pode mudar', () => {
    for (const chave of TYPESCRIPT_TYPE_HARNESS_SEED) {
      assert.ok(
        !HARNESS_RECEPTIVE_SEED.includes(chave),
        `${chave} vazou para a semente de JavaScript e liberaria construção em nodejs-do-zero`,
      );
    }
    assert.deepEqual([...harnessReceptiveSeed('javascript')], [...HARNESS_RECEPTIVE_SEED]);
    assert.deepEqual([...harnessReceptiveSeed()], [...HARNESS_RECEPTIVE_SEED]);
  });

  it('MEDIDO: sem o acréscimo, o harness de um desafio TS já nasce fora do orçamento', () => {
    const r = extractAtoms(HARNESS, { fileName: 'harness.ts', dialect: 'ts' });
    assert.ok(r.ok, r.ok ? '' : r.error.message);
    const emitidas = new Set(r.keys);

    const permitidoComoJs = new Set<string>([...HARNESS_RECEPTIVE_SEED, ...STRUCTURAL_ALWAYS_ALLOWED]);
    const permitidoComoTs = new Set<string>([
      ...harnessReceptiveSeed('typescript'),
      ...structuralAlwaysAllowed('typescript'),
    ]);

    const chavesDeTipo = ['node:StringKeyword', 'node:NumberKeyword', 'node:BooleanKeyword', 'node:TypeReference', 'node:ArrayType'];
    for (const chave of chavesDeTipo) {
      assert.ok(emitidas.has(chave), `o harness mínimo emite ${chave} — ele é do harness, não da aula`);
      assert.ok(!permitidoComoJs.has(chave), `${chave} violaria com a semente de JavaScript`);
      assert.ok(permitidoComoTs.has(chave), `${chave} tem de ser perdoada pela semente de TypeScript`);
    }
  });

  it('LIMITE FECHADO (onda 7): as duas chaves `form:` da semente TÊM emissor', () => {
    // ERA um limite declarado: `engine/form/rules.ts` compilava CINCO formas,
    // todas de JavaScript, e `form:Parameter[type!=null]` estava na semente sem
    // que ninguém a emitisse — uma semente sem emissor perdoa o que nunca
    // aparece. `docs/18` §"As formas novas que a bateria precisa registrar"
    // exige CATORZE, e a bateria agora as tem (ver `engineForm.test.ts`, o par
    // mínimo de cada uma). O harness mínimo desta trilha emite as duas: a
    // semente passa a perdoar algo que de fato acontece.
    const r = extractAtoms(HARNESS, { fileName: 'harness.ts', dialect: 'ts' });
    assert.ok(r.ok);
    assert.ok(r.keys.includes('form:Parameter[type!=null]'), 'o harness tipa o parâmetro — a forma tem de sair');
    assert.ok(r.keys.includes('form:FunctionDeclaration[type!=null]'), 'o harness tipa o retorno — a forma tem de sair');
    // e as duas são perdoadas pela semente de TypeScript, não pela de JavaScript
    const permitidoComoTs = new Set<string>([...harnessReceptiveSeed('typescript'), ...structuralAlwaysAllowed('typescript')]);
    for (const chave of ['form:Parameter[type!=null]', 'form:FunctionDeclaration[type!=null]']) {
      assert.ok(permitidoComoTs.has(chave), `${chave} tem de ser perdoada pela semente de TypeScript`);
      assert.ok(!HARNESS_RECEPTIVE_SEED.includes(chave as never), `${chave} não pode entrar na semente de JavaScript`);
    }
  });

  it('toda chave `node:` da semente EXISTE em vocab/atoms.json (nenhum artefato novo)', () => {
    const universo = new Set((atoms as { axes: { node: string[] } }).axes.node);
    for (const chave of TYPESCRIPT_TYPE_HARNESS_SEED) {
      if (!chave.startsWith('node:')) continue;
      assert.ok(universo.has(chave), `${chave} não está no vocabulário`);
    }
  });

  it('as estruturais NÃO mudam — anotar não é estrutural, é conteúdo de aula', () => {
    assert.deepEqual([...structuralAlwaysAllowed('typescript')], [...STRUCTURAL_ALWAYS_ALLOWED]);
    for (const chave of structuralAlwaysAllowed('typescript')) {
      assert.ok(!TYPESCRIPT_TYPE_HARNESS_SEED.includes(chave), chave);
    }
  });

  it('a porta continua FECHADA para quem não tem tabela (Python)', () => {
    assert.throws(() => harnessReceptiveSeed('python'), (e: unknown) => e instanceof Error);
    assert.throws(() => structuralAlwaysAllowed('python'), (e: unknown) => e instanceof Error);
  });
});

// ---------------------------------------------------------------------------
// 9. A QUINTA PROVA, COM `tsc` E `node` REAIS
// ---------------------------------------------------------------------------

/** Uma solução que RODA certo e MENTE no tipo — o caso central de `docs/18`. */
const SOLUCAO_TIPO_QUEBRADO = [
  'export function dobro(x: number): number {',
  '  const rotulo: number = "isto e uma string";',
  '  console.log(rotulo);',
  '  return x * 2;',
  '}',
  '',
].join('\n');

/** A mesma solução, com o contrato de tipo honrado. */
const SOLUCAO_CORRETA = ['export function dobro(x: number): number {', '  return x * 2;', '}', ''].join('\n');

const TESTS_TS = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { dobro } from './solution.ts';",
  '',
  "test('dobro de 2 é 4', () => {",
  '  assert.equal(dobro(2), 4);',
  '});',
  '',
].join('\n');

/**
 * ExecFn REAL — `node <args>` no diretório da prova, com o ambiente montado
 * pela política do PRÓPRIO adaptador. O `applyEnvScrub` não é detalhe: esta
 * suíte roda sob `node --test`, então `NODE_TEST_CONTEXT` está no ambiente do
 * pai, e herdá-lo faria o `node:test` do filho sair 0 SEM RODAR NADA — a
 * armadilha que a política existe para cortar.
 */
const execReal: ExecFn = (dir, args, opts) =>
  new Promise<ExecResult>((resolve) => {
    const env = applyEnvScrub(ts.envScrub, process.env) as NodeJS.ProcessEnv;
    const filho = spawn(process.execPath, args, { cwd: dir, env });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
    filho.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    const teto = setTimeout(() => filho.kill('SIGKILL'), opts?.timeoutMs ?? 60_000);
    filho.on('close', (code) => {
      clearTimeout(teto);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });

const TEM_TSC = resolverCompiladorNpm('typescript/bin/tsc') !== null;

describe('typescript — a QUINTA prova, com tsc e node REAIS', { skip: TEM_TSC ? false : 'typescript não resolveu' }, () => {
  /** Prepara o diretório isolado de um lado e devolve o caminho. */
  async function prepararDir(code: string): Promise<string> {
    return prepareIsolatedDir(os.tmpdir(), { code, testsCode: TESTS_TS }, ts);
  }

  it('os args do tsc são os medidos: nodenext + extensão explícita + typeRoots', () => {
    const args = [...TSC_NOEMIT_ARGS];
    assert.ok(args.includes('--noEmit'));
    assert.ok(args.includes('--strict'));
    assert.deepEqual(args.slice(args.indexOf('--module'), args.indexOf('--module') + 2), ['--module', 'nodenext']);
    assert.ok(args.includes('--allowImportingTsExtensions'), 'docs/18 exige `from ./solution.ts`');
    assert.ok(!args.includes('bundler'), 'bundler aprovaria import sem extensão, que o runner derruba');
    assert.equal(politicaDeTipos('typescript').compilador, 'typescript/bin/tsc');
    assert.deepEqual([...politicaDeTipos('typescript').args], args);
  });

  it('NODE APAGA OS TIPOS: a solução com erro de tipo PASSA no `node --test` (exit 0)', async () => {
    const dir = await prepararDir(SOLUCAO_TIPO_QUEBRADO);
    try {
      const res = await execReal(dir, [...ts.testCommand], { timeoutMs: 60_000 });
      assert.equal(res.exitCode, 0, `stderr: ${res.stderr}`);
      const counts = ts.countRun(res.stdout);
      assert.equal(counts.testsRun, 1);
      assert.equal(counts.pass, 1);
      assert.equal(counts.fail, 0);
    } finally {
      await cleanupDir(dir);
    }
  });

  it('O `tsc` REPROVA a MESMA solução (TS2322) e a QUINTA prova cai', async () => {
    const dir = await prepararDir(SOLUCAO_TIPO_QUEBRADO);
    try {
      const check = criarTypesCheck({ exec: execReal, adapter: ts, timeoutMs: 120_000 });
      const r = await check(dir, { code: SOLUCAO_TIPO_QUEBRADO, testsCode: TESTS_TS });
      assert.equal(r.applicable, true);
      assert.equal(r.degradacao, null, 'o compilador está na máquina');
      assert.equal(r.ok, false, `saída: ${r.output}`);
      assert.match(r.output, /TS2322/, r.output);
      assert.match(r.output, /solution\.ts/);

      const j = judgeTypesCheck(r, ts);
      assert.equal(j.passed, false);
      assert.equal(j.proof, 'typesCheck');
      assert.match(j.reason ?? '', /TS2322/);
    } finally {
      await cleanupDir(dir);
    }
  });

  it('a solução CORRETA passa nas duas camadas — e o harness `.ts` compila de verdade', async () => {
    const dir = await prepararDir(SOLUCAO_CORRETA);
    try {
      const runtime = await execReal(dir, [...ts.testCommand], { timeoutMs: 60_000 });
      assert.equal(runtime.exitCode, 0, `stderr: ${runtime.stderr}`);

      const check = criarTypesCheck({ exec: execReal, adapter: ts, timeoutMs: 120_000 });
      const r = await check(dir, { code: SOLUCAO_CORRETA, testsCode: TESTS_TS });
      assert.equal(r.ok, true, `o tsc reprovou o harness correto: ${r.output}`);
      assert.equal(judgeTypesCheck(r, ts).passed, true);
    } finally {
      await cleanupDir(dir);
    }
  });

  it('PROVA 2 continua RUNTIME-ONLY: o starter que o `tsc` reprova mas o `node` aprova NÃO satisfaz a prova', async () => {
    // Este é o caso que destruiria a prova 2 se falha de compilação contasse:
    // o MESMO arquivo que o tsc acabou de reprovar sai 0 no runner. Se `tsc`
    // contasse aqui, a prova 2 estaria satisfeita — e ela existe para provar
    // que o aluno TEM O QUE FAZER, não que o starter não compila.
    const dir = await prepararDir(SOLUCAO_TIPO_QUEBRADO);
    try {
      const res = await execReal(dir, [...ts.testCommand], { timeoutMs: 60_000 });
      assert.equal(res.exitCode, 0);
      const j = judgeStarterFails(res, ts);
      assert.equal(j.passed, false, 'a prova 2 lê SOMENTE o exit code da rodada de teste');
    } finally {
      await cleanupDir(dir);
    }
  });

  it('PROVA 4 continua RUNTIME-ONLY: o stub vazio falha por EXECUÇÃO, e um stub que sai 0 reprova', async () => {
    const dir = await prepareIsolatedDir(os.tmpdir(), { code: EMPTY_STUB_CODE, testsCode: TESTS_TS }, ts);
    try {
      const res = await execReal(dir, [...ts.testCommand], { timeoutMs: 60_000 });
      assert.notEqual(res.exitCode, 0, 'o import de `dobro` de um módulo vazio quebra EM EXECUÇÃO');
      assert.equal(judgeEmptyStubFails(res, ts).passed, true);
      // e o contrato negativo: um stub que SAI 0 reprova o desafio (teste
      // tautológico), mesmo numa linguagem em que ele não compilaria.
      const forjado: ExecResult = { exitCode: 0, stdout: 'ℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ skipped 0\n', stderr: '' };
      const j = judgeEmptyStubFails(forjado, ts);
      assert.equal(j.passed, false);
      assert.match(j.reason ?? '', /tautológicos/);
    } finally {
      await cleanupDir(dir);
    }
  });

  it('FAIL-CLOSED: compilador ausente ⇒ a prova REPROVA com mensagem de degradação', async () => {
    const check = criarTypesCheck({ exec: execReal, adapter: ts, resolverCompilador: () => null });
    const r = await check('/nao/importa', { code: SOLUCAO_CORRETA, testsCode: TESTS_TS });
    assert.equal(r.applicable, true);
    assert.equal(r.ok, false);
    assert.match(r.degradacao ?? '', /TypeScript/);
    assert.equal(judgeTypesCheck(r, ts).passed, false);
  });
});
