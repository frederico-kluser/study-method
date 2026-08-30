/**
 * tests/engineVocab.test.ts — o vocabulário gerado por máquina (pacote P-05,
 * `docs/16-engine-de-trilha.md` §3.1 e §5.3).
 *
 * Contratos que mordem aqui:
 *   1. O universo de nós vem do enum `ts.SyntaxKind` passado pela TABELA
 *      CANÔNICA do extrator (`extract.kindName`) — sem marcadores de faixa
 *      (`FirstLiteralToken`, `LastToken`, …), sem JSX/Experimental, sem
 *      trivia, sem pontuação. `node:NumericLiteral` precisa existir (a busca
 *      reversa do enum devolveria `FirstLiteralToken`).
 *   2. Toda chave gerada casa com `ATOM_KEY_RE` (importado de `atomKeys.ts`) —
 *      um vocabulário com chave inválida seria consumido em silêncio.
 *   3. O catálogo separa API de linguagem de nome de domínio: estrutura com
 *      receptores (class/object/module) e membros enumerados por
 *      `Object.getOwnPropertyNames` — campos de dados da trilha real (lidos de
 *      `resources/tracks/nodejs-do-zero`) NÃO viram `api:`.
 *   4. A geração é determinística: duas execuções produzem os MESMOS bytes, e
 *      o artefato commitado É a saída byte a byte do gerador no runtime atual
 *      (a prova exigida pelo aceite A-P05-2).
 *
 * Sem rede, sem LLM: só o runtime do Node + os artefatos commitados.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ATOM_KEY_RE,
  DECLARATION_KINDS,
  FORBIDDEN_ALWAYS,
  HARNESS_RECEPTIVE_SEED,
  axisOf,
  isAtomKey,
} from '../electron/main/engine/atomKeys';
import { RUNTIME_GLOBALS } from '../electron/main/engine/extract';
import {
  gerarAtomos,
  gerarCatalogoApi,
  gerarUniversoDecl,
  gerarUniversoGlobais,
  gerarUniversoModulos,
  gerarUniversoNos,
  gerarUniversoOps,
  nomesCanonicosSyntaxKind,
  runtimeDoProcesso,
} from '../electron/main/engine/vocab/generate';
import {
  RECEPTORES_LINGUAGEM,
  RECEPTORES_MODULO,
  type CatalogoApi,
} from '../electron/main/engine/vocab/catalog';

// `t.sh` roda com cwd em app/; ainda assim, ancorar pelo __dirname (padrão do
// repositório, ver tests/runsh-bootstrap.test.ts) deixa os testes robustos.
const VOCAB_DIR = path.resolve(__dirname, '..', 'electron', 'main', 'engine', 'vocab');

interface AtomosJson {
  schema: number;
  node_version: string;
  typescript_version: string;
  axes: { node: string[]; op: string[]; decl: string[]; global: string[]; api: string[] };
  total: number;
}

function lerAtomos(): AtomosJson {
  return JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, 'atoms.json'), 'utf8')) as AtomosJson;
}

function lerCatalogo(): CatalogoApi {
  return JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, 'api-catalog.json'), 'utf8')) as CatalogoApi;
}

/**
 * Campos de dados da trilha REAL (`resources/tracks/nodejs-do-zero` — campos
 * lidos das 136 challenges + módulos/aulas). Nenhum deles é API de linguagem;
 * o catálogo precisa provar que o filtro os mantém fora do eixo `api:`.
 */
const CAMPOS_DE_DOMINIO_DA_TRILHA: readonly string[] = [
  'statement',
  'starterCode',
  'testsCode',
  'solutionCode',
  'expectedTestCount',
  'minFirstStarMs',
  'schemaVersion',
  'prerequisites',
  'summary',
  'concept',
  'theory',
  'slug',
  'difficulty',
  'explanation',
  'markdown',
  'challenges',
  'lessons',
];

describe('engineVocab: universo de nós (A-P05-2)', () => {
  const atomos = lerAtomos();
  const nos = atomos.axes.node;

  it('tem MAIS DE 100 chaves node:', () => {
    assert.ok(nos.length > 100, `esperado > 100 chaves node:, gerado ${nos.length}`);
    assert.equal(nos.filter((k) => k.startsWith('node:')).length, nos.length);
  });

  it('não contém marcador de faixa do enum', () => {
    for (const chave of nos) {
      assert.ok(!/^node:First/.test(chave) && !/^node:Last/.test(chave), `marcador de faixa vazou: ${chave}`);
    }
    assert.ok(!nos.includes('node:FirstLiteralToken'));
    assert.ok(!nos.includes('node:LastToken'));
    assert.ok(!nos.includes('node:FirstStatement'));
  });

  it('contém os kinds reais que a busca reversa do enum sequestraria', () => {
    assert.ok(nos.includes('node:NumericLiteral'));
    assert.ok(nos.includes('node:ArrowFunction'));
    assert.ok(nos.includes('node:IfStatement'));
    assert.ok(nos.includes('node:ExportKeyword'));
    assert.ok(nos.includes('node:EndOfFileToken'));
  });

  it('exclui JSX, Experimental, trivia e pontuação', () => {
    for (const chave of nos) {
      assert.ok(!/jsx/i.test(chave), `JSX vazou: ${chave}`);
      assert.ok(!/experimental/i.test(chave), `Experimental vazou: ${chave}`);
      assert.ok(!/Trivia/.test(chave), `trivia vazou: ${chave}`);
    }
    assert.ok(!nos.includes('node:JsxElement'));
    assert.ok(!nos.includes('node:SingleLineCommentTrivia'));
    assert.ok(!nos.includes('node:PlusToken'), 'pontuação não pode virar node: (vira op:)');
  });

  it('o eixo node: commitado É a saída do gerador (nada digitado à mão)', () => {
    assert.deepEqual(nos, gerarUniversoNos(runtimeDoProcesso()));
    // e cada sufixo é um nome canônico do enum — a prova de que não há chave inventada
    const canonicos = new Set(nomesCanonicosSyntaxKind(runtimeDoProcesso()));
    for (const chave of nos) {
      assert.ok(canonicos.has(chave.slice('node:'.length)), `não é SyntaxKind canônico: ${chave}`);
    }
  });

  it('cobre as chaves node: do harness e das proibições globais (onda 0)', () => {
    const conjunto = new Set(nos);
    for (const chave of HARNESS_RECEPTIVE_SEED) {
      if (chave.startsWith('node:')) {
        assert.ok(conjunto.has(chave), `seed do harness sem chave no vocabulário: ${chave}`);
      }
    }
    for (const chave of ['node:WithStatement', 'node:DebuggerStatement', 'node:LabeledStatement']) {
      assert.ok(conjunto.has(chave), `proibição global sem chave no vocabulário: ${chave}`);
    }
  });
});

describe('engineVocab: toda chave casa com ATOM_KEY_RE', () => {
  it('valida todas as chaves de atoms.json (seis eixos)', () => {
    const atomos = lerAtomos();
    let total = 0;
    for (const [eixo, chaves] of Object.entries(atomos.axes)) {
      for (const chave of chaves) {
        assert.ok(isAtomKey(chave), `chave inválida em ${eixo}: "${chave}"`);
        assert.ok(ATOM_KEY_RE.test(chave), `ATOM_KEY_RE rejeitou "${chave}"`);
        assert.equal(axisOf(chave), eixo, `eixo declarado ${eixo} ≠ eixo real de "${chave}"`);
        total += 1;
      }
    }
    assert.equal(atomos.total, total, 'campo total tem que ser a soma das chaves');
  });

  it('valida todos os caminhos do catálogo (api_paths)', () => {
    const catalogo = lerCatalogo();
    for (const caminho of catalogo.api_paths) {
      assert.ok(isAtomKey(caminho), `caminho inválido: "${caminho}"`);
      assert.equal(axisOf(caminho), 'api');
    }
  });

  it('os universos puros também validam (fail-closed na geração)', () => {
    const runtime = runtimeDoProcesso();
    const todas = [
      ...gerarUniversoNos(runtime),
      ...gerarUniversoOps(runtime),
      ...gerarUniversoDecl(),
      ...gerarUniversoGlobais(runtime),
      ...gerarUniversoModulos(runtime),
    ];
    for (const chave of todas) assert.ok(ATOM_KEY_RE.test(chave), `gerador emitiu chave inválida: "${chave}"`);
  });
});

describe('engineVocab: o catálogo separa API de linguagem de nome de domínio', () => {
  it('tem estrutura que distingue os receptores built-in', () => {
    const catalogo = lerCatalogo();
    assert.ok(catalogo.receivers.length >= 40, `esperado >= 40 receptores, gerado ${catalogo.receivers.length}`);

    const array = catalogo.receivers.find((r) => r.name === 'Array');
    assert.ok(array, 'Array deveria ser um receptor');
    assert.equal(array.kind, 'class');
    assert.ok(array.members.includes('Array.from'), 'estático de classe deveria estar em members');
    assert.ok(array.prototypeMembers.includes('Array.prototype.push'), 'membro de protótipo deveria estar em prototypeMembers');
    assert.ok(catalogo.api_paths.includes('api:Array.prototype.push'));

    const json = catalogo.receivers.find((r) => r.name === 'JSON');
    assert.ok(json && json.kind === 'object');
    assert.equal(json.prototypeMembers.length, 0, 'objeto singleton não tem protótipo');

    const assertMod = catalogo.receivers.find((r) => r.name === 'assert');
    assert.ok(assertMod && assertMod.kind === 'module');
    assert.ok(assertMod.members.includes('assert.equal'));
    assert.ok(catalogo.api_paths.includes('api:assert.equal'));
  });

  it('o filtro existe e funciona: só entram receptores da lista escolhida', () => {
    const catalogo = lerCatalogo();
    const nomesEscolhidos = new Set([
      ...RECEPTORES_LINGUAGEM.map((r) => r.name),
      ...RECEPTORES_MODULO.map((r) => r.name),
    ]);
    for (const receptor of catalogo.receivers) {
      assert.ok(nomesEscolhidos.has(receptor.name), `receptor fora da lista documentada: ${receptor.name}`);
    }
    // `fetch` existe em globalThis (Node ≥ 18) mas NÃO é linguagem — a prova
    // de que o catálogo não é "tudo que está no runtime".
    assert.ok(!catalogo.receivers.some((r) => r.name === 'fetch'));
    assert.ok(!catalogo.receivers.some((r) => r.name === 'URL'));
  });

  it('campos de dados da trilha real não viram api:', () => {
    const catalogo = lerCatalogo();
    const nomesReceptores = new Set(catalogo.receivers.map((r) => r.name));
    for (const campo of CAMPOS_DE_DOMINIO_DA_TRILHA) {
      assert.ok(!nomesReceptores.has(campo), `campo de domínio virou receptor: ${campo}`);
      assert.ok(!catalogo.api_paths.includes(`api:${campo}`), `campo de domínio virou api:: ${campo}`);
      assert.ok(
        !catalogo.api_paths.some((p) => p.endsWith(`.${campo}`)),
        `campo de domínio virou membro de api:: ${campo}`,
      );
    }
    // acesso a campo com receptor local vira a forma `.campo` no extrator —
    // forma que o catálogo rejeita por construção (nenhum caminho começa com api:.)
    for (const caminho of catalogo.api_paths) {
      assert.ok(!caminho.startsWith('api:.'), `forma de campo de dados vazou: ${caminho}`);
    }
  });

  it('o eixo api: de atoms.json = módulos ∪ catálogo (nada inventado)', () => {
    const atomos = lerAtomos();
    const catalogo = lerCatalogo();
    const runtime = runtimeDoProcesso();
    const esperado = new Set([...gerarUniversoModulos(runtime), ...catalogo.api_paths]);
    assert.equal(atomos.axes.api.length, esperado.size);
    for (const chave of atomos.axes.api) assert.ok(esperado.has(chave), `api: fora do universo derivado: ${chave}`);
  });

  it('cobre as chaves api: que o harness usa (onda 0)', () => {
    const atomos = lerAtomos();
    const conjunto = new Set(atomos.axes.api);
    for (const chave of [
      'api:node:test',
      'api:node:assert',
      'api:node:assert/strict',
      'api:assert',
      'api:assert/strict',
      'api:test',
      'api:assert.equal',
      'api:assert.strictEqual',
      'api:assert.deepEqual',
      'api:assert.deepStrictEqual',
      'api:assert.throws',
      'api:assert.ok',
    ]) {
      assert.ok(conjunto.has(chave), `chave api: do harness ausente: ${chave}`);
    }
  });
});

describe('engineVocab: determinismo e proveniência', () => {
  it('duas execuções produzem bytes idênticos', () => {
    const runtime = runtimeDoProcesso();
    assert.equal(gerarAtomos(runtime), gerarAtomos(runtime));
    assert.equal(gerarCatalogoApi(runtime), gerarCatalogoApi(runtime));
  });

  it('o artefato commitado É a saída byte a byte do gerador (A-P05-2)', () => {
    const runtime = runtimeDoProcesso();
    const atomosGerados = gerarAtomos(runtime);
    const catalogoGerado = gerarCatalogoApi(runtime);
    const atomosNoDisco = fs.readFileSync(path.join(VOCAB_DIR, 'atoms.json'), 'utf8');
    const catalogoNoDisco = fs.readFileSync(path.join(VOCAB_DIR, 'api-catalog.json'), 'utf8');
    assert.equal(atomosNoDisco, atomosGerados, 'atoms.json está dessincronizado do gerador — re-gera e commita');
    assert.equal(catalogoNoDisco, catalogoGerado, 'api-catalog.json está dessincronizado do gerador — re-gera e commita');
  });

  it('os artefatos carregam as versões de Node e TypeScript que os produziram', () => {
    const atomos = lerAtomos();
    const catalogo = lerCatalogo();
    const runtime = runtimeDoProcesso();
    assert.equal(atomos.node_version, runtime.nodeVersion);
    assert.equal(atomos.typescript_version, runtime.typescriptVersion);
    assert.equal(catalogo.node_version, runtime.nodeVersion);
    assert.equal(catalogo.typescript_version, runtime.typescriptVersion);
    assert.ok(atomos.node_version.startsWith('v'), 'node_version precisa ter o formato vX.Y.Z');
    assert.ok(/^\d+\.\d+\.\d+/.test(atomos.typescript_version), 'typescript_version precisa ter o formato X.Y.Z');
  });

  it('os eixos são ordenados canonicamente (sem ordem de iteração não garantida)', () => {
    const atomos = lerAtomos();
    for (const [eixo, chaves] of Object.entries(atomos.axes)) {
      const ordenado = [...chaves].sort();
      assert.deepEqual(chaves, ordenado, `eixo ${eixo} fora de ordem canônica`);
    }
    const catalogo = lerCatalogo();
    assert.deepEqual(catalogo.api_paths, [...catalogo.api_paths].sort());
  });
});

describe('engineVocab: consistência com o extrator (onda 0)', () => {
  it('todo global que o extrator reconhece está no vocabulário', () => {
    const atomos = lerAtomos();
    const globaisGerados = new Set(atomos.axes.global);
    for (const nome of RUNTIME_GLOBALS) {
      assert.ok(globaisGerados.has(`global:${nome}`), `extrator reconhece global:${nome} mas o vocabulário não`);
    }
    assert.ok(atomos.axes.global.includes('global:console'));
    assert.ok(atomos.axes.global.includes('global:arguments'));
    assert.ok(atomos.axes.global.includes('global:eval'));
  });

  it('os universos op: e decl: cobrem o que o extrator emite', () => {
    const atomos = lerAtomos();
    const ops = new Set(atomos.axes.op);
    const decls = new Set(atomos.axes.decl);
    for (const chave of [
      'op:binary:!==',
      'op:binary:,',
      'op:binary:in',
      'op:binary:instanceof',
      'op:logical:&&',
      'op:logical:??',
      'op:unary:typeof',
      'op:unary:void',
      'op:unary:delete',
      'op:update:++',
      'op:assign:=',
      'op:assign:+=',
      'op:assign:&&=',
    ]) {
      assert.ok(ops.has(chave), `extrator pode emitir ${chave} mas o vocabulário não`);
    }
    for (const kind of DECLARATION_KINDS) {
      assert.ok(decls.has(`decl:${kind}`));
    }
  });

  it('nada além dos seis eixos entra no vocabulário (chaves estranhas são erro)', () => {
    const atomos = lerAtomos();
    for (const chaves of Object.values(atomos.axes)) {
      for (const chave of chaves) assert.ok(isAtomKey(chave));
    }
  });
});