/**
 * tests/cx-phases-atomkeys.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/atomKeys.ts` (o alfabeto das chaves de átomo).
 *
 * PINA: os construtores (a única forma legítima de criar chave), o regex de
 * validação (eixos + form:), `axisOf`, os rótulos humanos, as proibições
 * globais por linguagem, as sementes do harness (`harnessReceptiveSeed`) e as
 * estruturais (`structuralAlwaysAllowed`) por linguagem, e o fail-closed
 * `TabelaDeLinguagemAusenteError` (semear com a tabela de OUTRA linguagem é
 * exatamente o que o gate não pode fazer).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ATOM_KEY_RE,
  AXIS_PREFIX,
  DECLARATION_KINDS,
  FORBIDDEN_ALWAYS,
  HARNESS_RECEPTIVE_SEED,
  LINGUAGENS_COM_TABELA,
  OPERATOR_FAMILIES,
  TabelaDeLinguagemAusenteError,
  apiKey,
  axisOf,
  declKey,
  globalKey,
  harnessReceptiveSeed,
  humanLabel,
  isAtomKey,
  isForbiddenAlways,
  nodeKey,
  opKey,
  structuralAlwaysAllowed,
  termKey,
} from '../electron/main/engine/atomKeys';
import type { LanguageId } from '../electron/main/engine/lang/registry';

// ---------------------------------------------------------------------------
// 1. Alfabeto: construtores, regex, eixos
// ---------------------------------------------------------------------------

describe('atomKeys — construtores e validação de chave', () => {
  it('os construtores são a ÚNICA forma legítima de montar chave (formato exato)', () => {
    assert.equal(nodeKey('IfStatement'), 'node:IfStatement');
    assert.equal(declKey('let'), 'decl:let');
    assert.equal(opKey('binary', '+'), 'op:binary:+');
    assert.equal(opKey('assign', '??='), 'op:assign:??=');
    assert.equal(globalKey('console'), 'global:console');
    assert.equal(apiKey('Array.prototype.push'), 'api:Array.prototype.push');
    assert.equal(termKey('closure'), 'term:closure');
  });

  it('fixa o alfabeto de eixos/famílias (a ordem é a de leitura do documento)', () => {
    assert.deepEqual(AXIS_PREFIX, { node: 'node', decl: 'decl', op: 'op', global: 'global', api: 'api', term: 'term' });
    assert.deepEqual([...OPERATOR_FAMILIES], ['binary', 'logical', 'unary', 'update', 'assign', 'other']);
    assert.deepEqual([...DECLARATION_KINDS], ['let', 'const', 'var']);
  });

  it('ATOM_KEY_RE/isAtomKey: 7 eixos (incluindo form:), sem espaço, com conteúdo após o :', () => {
    for (const boa of [
      'node:IfStatement',
      'decl:let',
      'op:binary:+',
      'op:unary:typeof',
      'global:console',
      'api:Array.prototype.push',
      'term:closure',
      'form:IfStatement[alternate=null]',
    ]) {
      assert.equal(isAtomKey(boa), true, boa);
      assert.equal(ATOM_KEY_RE.test(boa), true);
    }
    for (const ruim of ['', 'node:', 'api:', 'node:com espaço', 'xyz:algo', 'Node:IfStatement', 'decl:let ', 'semeixo']) {
      assert.equal(isAtomKey(ruim), false, JSON.stringify(ruim));
    }
  });

  it('axisOf devolve o eixo (form: incluso) ou null', () => {
    assert.equal(axisOf('op:unary:typeof'), 'op');
    assert.equal(axisOf('node:Block'), 'node');
    assert.equal(axisOf('term:closure'), 'term');
    assert.equal(axisOf('form:IfStatement[alternate=null]'), 'form');
    assert.equal(axisOf('weird:coisa'), null);
    assert.equal(axisOf('semeixo'), null);
  });

  it('humanLabel cita o TOKEN que a pessoa escreveu (não o nome do nó)', () => {
    assert.equal(humanLabel('decl:let'), '`let`');
    assert.equal(humanLabel('op:binary:+'), '`+`', 'a família do operador some do rótulo');
    assert.equal(humanLabel('op:unary:typeof'), '`typeof`');
    assert.equal(humanLabel('global:console'), '`console`');
    assert.equal(humanLabel('api:node:test'), '`node:test`');
    assert.equal(humanLabel('term:closure'), '"closure"', 'termo é palavra, entre aspas');
    assert.equal(humanLabel('node:IfStatement'), '`IfStatement`');
    assert.equal(humanLabel('form:IfStatement[alternate=null]'), '`IfStatement[alternate=null]`');
  });
});

// ---------------------------------------------------------------------------
// 2. Proibições globais por linguagem (decidibilidade)
// ---------------------------------------------------------------------------

describe('atomKeys — isForbiddenAlways (proibições por linguagem)', () => {
  it('FORBIDDEN_ALWAYS é a lista do adaptador DEFAULT — tudo nela é chave válida e está proibido', () => {
    assert.ok(FORBIDDEN_ALWAYS.length > 0, 'a lista nunca é vazia');
    for (const chave of FORBIDDEN_ALWAYS) {
      assert.equal(isAtomKey(chave), true, chave);
      assert.equal(isForbiddenAlways(chave), true, chave);
    }
    assert.equal(isForbiddenAlways('node:IfStatement'), false, 'construção comum não é proibição global');
    assert.equal(isForbiddenAlways('chave-inventada'), false);
  });

  it('cada linguagem tem o SEU veneno de decidibilidade (não se perdoa com a lista errada)', () => {
    const js = FORBIDDEN_ALWAYS;
    const python = structuralAlwaysAllowed('python') && harnessReceptiveSeed('python') ? forbiddenDe('python') : [];
    assert.notDeepEqual([...python].sort(), [...js].sort(), 'python e javascript não compartilham a lista');
  });
});

function forbiddenDe(language: LanguageId): readonly string[] {
  // espelha isForbiddenAlways por varredura das chaves candidatas conhecidas
  const candidatas = ['api:eval', 'api:Function', 'api:exec', 'api:getattr', 'api:node:test'];
  return candidatas.filter((k) => isForbiddenAlways(k, language));
}

// ---------------------------------------------------------------------------
// 3. Sementes e estruturais por linguagem
// ---------------------------------------------------------------------------

describe('atomKeys — harnessReceptiveSeed e structuralAlwaysAllowed', () => {
  it('a semente receptiva do harness JS existe desde a aula 1 e é toda chave válida', () => {
    assert.ok(HARNESS_RECEPTIVE_SEED.length > 0);
    assert.ok(HARNESS_RECEPTIVE_SEED.includes('node:ExportKeyword'));
    for (const chave of HARNESS_RECEPTIVE_SEED) assert.equal(isAtomKey(chave), true, chave);
    assert.deepEqual([...harnessReceptiveSeed()], [...HARNESS_RECEPTIVE_SEED], 'default = javascript');
    assert.deepEqual([...harnessReceptiveSeed('javascript')], [...HARNESS_RECEPTIVE_SEED]);
  });

  it('typescript = semente JS MAIS as chaves de tipo; python/c/rust têm lista PRÓPRIA', () => {
    const ts = harnessReceptiveSeed('typescript');
    assert.ok(ts.length > HARNESS_RECEPTIVE_SEED.length, 'TS = JS + chaves de tipo');
    for (const chave of HARNESS_RECEPTIVE_SEED) {
      assert.ok(ts.includes(chave), `TS herda ${chave} da semente JS`);
    }
    for (const linguagem of ['python', 'c', 'rust'] as LanguageId[]) {
      const seed = harnessReceptiveSeed(linguagem);
      assert.ok(seed.length > 0, `${linguagem} tem semente própria`);
      for (const chave of seed) assert.equal(isAtomKey(chave), true, `${linguagem}: ${chave}`);
    }
    assert.notDeepEqual([...harnessReceptiveSeed('python')], [...HARNESS_RECEPTIVE_SEED], 'semear Python com o harness do Node é o que o gate não pode fazer');
  });

  it('estruturais: js e ts COMPARTILHAM a lista; python/c/rust têm a própria', () => {
    const js = structuralAlwaysAllowed();
    assert.ok(js.length > 0);
    assert.deepEqual([...structuralAlwaysAllowed('typescript')], [...js], 'mesmo ts.SyntaxKind nos dois dialetos');
    for (const linguagem of ['python', 'c', 'rust'] as LanguageId[]) {
      const lista = structuralAlwaysAllowed(linguagem);
      assert.ok(lista.length > 0);
      assert.notDeepEqual([...lista], [...js], `${linguagem} não herda os nomes de nó do ts.SyntaxKind`);
    }
  });

  it('LINGUAGENS_COM_TABELA fixa as 5 tabelas declaradas', () => {
    assert.deepEqual([...LINGUAGENS_COM_TABELA], ['javascript', 'typescript', 'python', 'c', 'rust']);
  });

  it('fail-closed: pedir tabela de linguagem fora do registro nunca semeia com a de outra', () => {
    assert.throws(() => harnessReceptiveSeed('ruby' as LanguageId), /ruby/);
    assert.throws(() => structuralAlwaysAllowed('ruby' as LanguageId), /ruby/);
  });

  it('TabelaDeLinguagemAusenteError é estruturado: código estável + tabela/pedido/disponíveis', () => {
    const erro = new TabelaDeLinguagemAusenteError({
      tabela: 'HARNESS_RECEPTIVE_SEED',
      pedido: 'ruby',
      disponivel: LINGUAGENS_COM_TABELA,
    });
    assert.equal(erro.code, 'TABELA_DE_LINGUAGEM_AUSENTE');
    assert.equal(erro.name, 'TabelaDeLinguagemAusenteError');
    assert.match(erro.message, /tabela "HARNESS_RECEPTIVE_SEED"/);
    assert.match(erro.message, /pedido: "ruby"/);
    assert.deepEqual([...erro.detalhes.disponivel], ['javascript', 'typescript', 'python', 'c', 'rust']);
  });
});
