/**
 * tests/cx-phases-extract.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/extract.ts` (o extrator determinístico de construções).
 *
 * PINA: os CONJUNTOS DE CHAVES exatos por eixo (node/decl/op/global/api/form)
 * para snippets canônicos, a dedupe "primeira ocorrência por chave" do
 * `extractAtoms` vs. todas as do `extractAllOccurrences`, a forma das
 * ocorrências (linha/coluna 1-based, snippet/start/end), o PARSE_ERROR
 * estruturado, a contagem de testes por AST (comentário NÃO conta) e as
 * guardas fail-closed de linguagem (EngineLinguagemError / registro).
 *
 * PURO: sem IO, sem rede, sem subprocesso (só dialetos ts-node aqui).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ts from 'typescript';

import {
  CAMINHADA_POR_LINGUAGEM,
  EngineLinguagemError,
  LINGUAGEM_SEM_EXTRATOR,
  LINGUAGENS_COM_CAMINHADA,
  RUNTIME_GLOBALS,
  SNIPPET_MAX_CHARS,
  countTestDeclarations,
  exigirAdaptadorComCaminhada,
  exigirAdaptadorJavascript,
  extractAllOccurrences,
  extractAtoms,
  isValueReference,
  type AtomOccurrence,
} from '../electron/main/engine/extract';
import type { LanguageId } from '../electron/main/engine/lang/registry';

// ---------------------------------------------------------------------------
// 1. Chaves extraídas — o vocabulário OBSERVADO (golden master por eixo)
// ---------------------------------------------------------------------------

describe('extract — extractAtoms (chaves por eixo, ordem estável)', () => {
  it('declaração trivial: eixos decl: e node:', () => {
    const r = extractAtoms('const x = 1;');
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.keys, [
        'decl:const',
        'node:EndOfFileToken',
        'node:Identifier',
        'node:NumericLiteral',
        'node:VariableDeclaration',
        'node:VariableDeclarationList',
        'node:VariableStatement',
      ]);
      assert.deepEqual(r.keys, [...r.keys].sort(), 'keys saem em ordem alfabética');
    }
  });

  it('expressão binária composta emite op:binary:+ UMA vez no extractAtoms (dedupe pela primeira)', () => {
    const r = extractAtoms('let total = a + b + 1;');
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.keys, [
        'decl:let',
        'node:BinaryExpression',
        'node:EndOfFileToken',
        'node:Identifier',
        'node:NumericLiteral',
        'node:VariableDeclaration',
        'node:VariableDeclarationList',
        'node:VariableStatement',
        'op:binary:+',
      ]);
      assert.equal(r.occurrences.filter((o) => o.key === 'op:binary:+').length, 1, 'dedupe: PRIMEIRA ocorrência por chave');
    }
  });

  it('acento de API emite api: e global:; if emite form: com o seletor do AST', () => {
    const chamada = extractAtoms('console.log(1);');
    assert.ok(chamada.ok);
    if (chamada.ok) {
      assert.ok(chamada.keys.includes('api:console.log'));
      assert.ok(chamada.keys.includes('global:console'), 'console usado como valor é global do runtime');
    }
    const cond = extractAtoms('if (x) { y(); }');
    assert.ok(cond.ok);
    if (cond.ok) {
      assert.ok(cond.keys.includes('form:IfStatement[alternate=null]'), 'o eixo form: casa o seletor contra o AST');
      assert.ok(cond.keys.includes('node:IfStatement'));
    }
  });

  it('extractAllOccurrences mantém TODAS as ocorrências; extractAtoms projeta a primeira por chave', () => {
    const todas = extractAllOccurrences('let t = a + b + 1;');
    const primeira = extractAtoms('let t = a + b + 1;');
    assert.ok(todas.ok && primeira.ok);
    if (todas.ok && primeira.ok) {
      assert.equal(todas.occurrences.filter((o) => o.key === 'op:binary:+').length, 2, 'duas somas empilhadas');
      assert.deepEqual(todas.keys, primeira.keys, 'o conjunto de chaves é o mesmo nas duas projeções');
    }
  });

  it('ocorrência carrega posição 1-based e span absoluto coerente com o código', () => {
    const r = extractAtoms('let t = a + b + 1;');
    assert.ok(r.ok);
    if (r.ok) {
      const occ = r.occurrences.find((o) => o.key === 'decl:let') as AtomOccurrence;
      assert.equal(occ.line, 1);
      assert.ok(occ.column >= 1, 'coluna 1-based');
      assert.ok(occ.start < occ.end && occ.end <= 'let t = a + b + 1;'.length, 'span absoluto dentro do código');
      assert.ok(occ.snippet.length <= SNIPPET_MAX_CHARS, 'trecho citável cabe numa linha legível');
      assert.equal(SNIPPET_MAX_CHARS, 72);
    }
  });

  it('é PURO: mesma entrada, mesma saída (duas chamadas idênticas)', () => {
    assert.deepEqual(extractAtoms('function f() { return g(); }'), extractAtoms('function f() { return g(); }'));
  });
});

// ---------------------------------------------------------------------------
// 2. Erro de parse (fail-closed, posição nomeada)
// ---------------------------------------------------------------------------

describe('extract — PARSE_ERROR estruturado', () => {
  it('código que não parseia devolve ok:false com código, mensagem e posição', () => {
    const r = extractAtoms('function (');
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.code, 'PARSE_ERROR');
      assert.equal(r.error.message, 'Identifier expected.');
      assert.equal(r.error.line, 1);
      assert.equal(r.error.column, 10);
    }
  });

  it('extractAllOccurrences compartilha o MESMO formato de erro', () => {
    const r = extractAllOccurrences('function (');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'PARSE_ERROR');
  });

  it('dialect "ts" parseia sintaxe de tipo (o extrator é o mesmo, muda o ScriptKind)', () => {
    const r = extractAtoms('const x: number = 1;', { dialect: 'ts' });
    assert.equal(r.ok, true);
  });
});

// ---------------------------------------------------------------------------
// 3. Contagem de testes por AST (o lado DECLARADO da dupla-igualdade)
// ---------------------------------------------------------------------------

describe('extract — countTestDeclarations (comentário NÃO é nó)', () => {
  it('conta test(...) e test.skip(...); o test( COMENTADO não conta', () => {
    const code = "test('a', () => {});\n// test('b', () => {});\ntest.skip('c', () => {});\n";
    assert.equal(countTestDeclarations(code), 2);
    assert.equal(countTestDeclarations("test('um', () => {});"), 1);
    assert.equal(countTestDeclarations('const x = 1;'), 0);
    assert.equal(countTestDeclarations(''), 0);
  });

  it('a linguagem default é o adaptador javascript (contagem por AST)', () => {
    assert.equal(countTestDeclarations("test('a', () => {});", 'javascript'), 1);
  });
});

// ---------------------------------------------------------------------------
// 4. isValueReference (posição do identificador: valor × nome)
// ---------------------------------------------------------------------------

describe('extract — isValueReference', () => {
  function identificadores(code: string): Map<string, ts.Identifier> {
    const source = ts.createSourceFile('t.mjs', code, ts.ScriptTarget.Latest, true);
    const mapa = new Map<string, ts.Identifier>();
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) mapa.set(`${node.text}@${node.pos}`, node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return mapa;
  }

  it('nome de propriedade/declaração NÃO é referência de valor; uso comum é', () => {
    const mapa = identificadores('const obj = { log: 1 };\nobj.log;\n');
    const porTexto = (texto: string): ts.Identifier[] => [...mapa.values()].filter((n) => n.text === texto);
    // 'obj' aparece na declaração (nome — NÃO referência) e no acesso (valor).
    const usos = porTexto('obj');
    assert.equal(usos.length, 2);
    assert.deepEqual(usos.map((n) => isValueReference(n)), [false, true]);
    // 'log' é nome de property assignment E nome de property access: nenhum dos
    // dois é referência de valor.
    for (const n of porTexto('log')) assert.equal(isValueReference(n), false);
    // 'x' é o nome da variável declarada — não é referência.
    for (const n of porTexto('x')) assert.equal(isValueReference(n), false);
  });
});

// ---------------------------------------------------------------------------
// 5. Guardas de linguagem (fail-closed — nunca parser errado em silêncio)
// ---------------------------------------------------------------------------

describe('extract — guardas de linguagem', () => {
  it('as DUAS caminhadas estão declaradas: ts-node (js/ts) e lang-node (python/c/rust)', () => {
    assert.deepEqual(CAMINHADA_POR_LINGUAGEM, {
      javascript: 'ts-node',
      typescript: 'ts-node',
      python: 'lang-node',
      c: 'lang-node',
      rust: 'lang-node',
    });
    assert.deepEqual([...LINGUAGENS_COM_CAMINHADA], ['c', 'javascript', 'python', 'rust', 'typescript']);
  });

  it('exigirAdaptadorJavascript: só javascript passa; python é EngineLinguagemError nomeando o que falta', () => {
    assert.equal(exigirAdaptadorJavascript('quality/minimal.ts', 'motivo').id, 'javascript');
    assert.equal(exigirAdaptadorJavascript('m', 'motivo', 'javascript').id, 'javascript');
    assert.throws(
      () => exigirAdaptadorJavascript('quality/minimal.ts', 'as tabelas são ts.SyntaxKind', 'python'),
      (erro: unknown) => {
        assert.ok(erro instanceof EngineLinguagemError);
        assert.equal(erro.code, LINGUAGEM_SEM_EXTRATOR);
        assert.match(erro.message, /quality\/minimal\.ts: sem implementação para a linguagem "python" \(só javascript\)/);
        assert.match(erro.message, /ts\.SyntaxKind/);
        assert.deepEqual(erro.detalhes.suportado, 'javascript');
        return true;
      },
    );
  });

  it('exigirAdaptadorComCaminhada: as 5 linguagens da tabela passam; id fora do registro é fail-closed', () => {
    for (const linguagem of ['javascript', 'typescript', 'python', 'c', 'rust'] as LanguageId[]) {
      assert.equal(exigirAdaptadorComCaminhada(linguagem).id, linguagem);
    }
    assert.equal(exigirAdaptadorComCaminhada().id, 'javascript');
    // Linguagem CONHECIDA do chamador mas fora do registro: o próprio registro
    // lança (fail-closed) — nunca um parser errado em silêncio.
    assert.throws(() => exigirAdaptadorComCaminhada('ruby'), /ruby/);
    // E o extrator repassa a guarda: nada é extraído com adaptador desconhecido.
    assert.throws(() => extractAtoms('const x = 1;', { language: 'ruby' as LanguageId }), /ruby/);
  });

  it('RUNTIME_GLOBALS vem do adaptador (não de lista digitada) e cobre o básico do runtime', () => {
    assert.ok(RUNTIME_GLOBALS.has('console'));
    assert.ok(RUNTIME_GLOBALS.has('Math'));
    assert.ok(RUNTIME_GLOBALS.has('JSON'));
  });
});
