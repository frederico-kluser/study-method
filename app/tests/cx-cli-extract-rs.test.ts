/**
 * tests/cx-cli-extract-rs.test.ts — CARACTERIZAÇÃO (golden master) da Porta 1
 * de Rust (`app/electron/main/engine/vocab/rs/extract_ast.mjs`).
 *
 * Invocado pelo adaptador (`lang/rust.ts`) sempre assim:
 *
 *     node extract_ast.mjs <fileName>     # fonte no STDIN, JSON no STDOUT
 *
 * O parser é o tree-sitter (WASM) DENTRO do subprocesso node. O que se congela:
 * o SHAPE do JSON (`ParseOk` com `rust`/`root`/`scopes`/`globalsRust`), o exit
 * code SEMPRE 0, o tratamento de fonte quebrado (o tree-sitter é tolerante e o
 * extrator converte ERROR em `ParseError` estruturado) e os offsets em
 * CARACTERES (sem a armadilha de bytes do CPython). Fontes inline por
 * child_process; nada de rede.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const EXTRACTOR = path.resolve(__dirname, '..', 'electron', 'main', 'engine', 'vocab', 'rs', 'extract_ast.mjs');

interface RsResult {
  code: number;
  json: any;
  raw: string;
}

/** `node extract_ast.mjs [nome]` com o fonte no stdin. */
function extract(fonte: Buffer | string, args: string[] = ['main.rs']): Promise<RsResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [EXTRACTOR, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let raw = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.stdout.on('data', (d: Buffer) => (raw += String(d)));
    child.stderr.on('data', (d: Buffer) => (stderr += String(d)));
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        resolve({ code: code ?? 1, json: JSON.parse(raw), raw });
      } catch (err) {
        reject(new Error(`saída não é JSON (${String(err)}): ${raw.slice(0, 200)} / stderr: ${stderr.slice(0, 200)}`));
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdin.write(fonte);
    child.stdin.end();
  });
}

describe('extract_ast.mjs — fonte bem-formado (shape do ParseOk)', () => {
  it('emite ok:true com rust/root/scopes/globalsRust e o LangNode canônico', async () => {
    const r = await extract('fn soma(a: i32, b: i32) -> i32 {\n    let x = a + b;\n    x\n}\n');
    assert.equal(r.code, 0, 'o veredito vive no JSON — o exit code é SEMPRE 0');
    assert.deepEqual(Object.keys(r.json).sort(), ['globalsRust', 'ok', 'root', 'rust', 'scopes']);
    assert.equal(r.json.ok, true);
    // a proveniência do parser é DECLARADA na saída (determinismo do WASM).
    assert.equal(r.json.rust.parser, 'web-tree-sitter');
    assert.equal(r.json.rust.grammar, 'tree-sitter-rust');
    assert.match(String(r.json.rust.grammarVersion), /^\d+\.\d+\.\d+/);
    assert.deepEqual(Object.keys(r.json.root).sort(), [
      'attributes',
      'children',
      'column',
      'end',
      'line',
      'start',
      'synthetic',
      'text',
      'type',
    ]);
    assert.equal(r.json.root.type, 'SourceFile');
    assert.deepEqual(
      { line: r.json.root.line, column: r.json.root.column, start: r.json.root.start, end: r.json.root.end },
      { line: 1, column: 1, start: 0, end: 60 },
    );
    const fn = r.json.root.children[0];
    assert.equal(fn.type, 'FunctionItem');
    assert.deepEqual(
      { line: fn.line, column: fn.column, start: fn.start, end: fn.end },
      { line: 1, column: 1, start: 0, end: 59 },
    );
  });

  it('escopos em DUAS camadas (itens hoisted + let/parâmetros lexicais) e globalsRust do adaptador', async () => {
    const r = await extract('fn soma(a: i32, b: i32) -> i32 {\n    let x = a + b;\n    x\n}\n');
    assert.deepEqual(r.json.scopes, { declared: ['a', 'b', 'soma', 'x'], imported: [], free: [] });
    assert.ok(Array.isArray(r.json.globalsRust));
    assert.ok(r.json.globalsRust.includes('Arc'), r.json.globalsRust.slice(0, 5));
  });
});

describe('extract_ast.mjs — fonte quebrado (ParseError estruturado, nunca crash)', () => {
  it('construção não reconhecida vira ok:false com code/message/line/column e exit 0', async () => {
    const r = await extract('fn main( {\n');
    assert.equal(r.code, 0, 'erro de parse NÃO pode virar crash nem exit != 0');
    assert.equal(r.json.ok, false);
    assert.deepEqual(Object.keys(r.json), ['ok', 'error']);
    assert.deepEqual(Object.keys(r.json.error).sort(), ['code', 'column', 'line', 'message']);
    assert.equal(r.json.error.code, 'PARSE_ERROR');
    // o nome do arquivo do argv entra no motivo (acionável para o autor).
    assert.ok(r.json.error.message.includes('erro de sintaxe (main.rs)'), r.json.error.message);
    assert.ok(r.json.error.message.includes('construção não reconhecida pelo parser'), r.json.error.message);
    assert.equal(r.json.error.line, 1);
    assert.equal(r.json.error.column, 1);
  });
});

describe('extract_ast.mjs — limites (vazio, UTF-8 multibyte, CRLF, bytes inválidos)', () => {
  it('fonte VAZIO: ok:true, SourceFile sem filhos, escopos vazios', async () => {
    const r = await extract('');
    assert.equal(r.code, 0);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.root.type, 'SourceFile');
    assert.deepEqual(r.json.root.children, []);
    assert.deepEqual(r.json.scopes, { declared: [], imported: [], free: [] });
  });

  it('UTF-8 multibyte: start/end em CARACTERES (o tree-sitter conta code points)', async () => {
    // `let s = "ação";` — em bytes a string iria até 17; em caracteres até 14.
    const r = await extract('let s = "ação";\n');
    assert.equal(r.json.ok, true);
    const decl = r.json.root.children[0];
    assert.equal(decl.type, 'LetDeclaration');
    assert.deepEqual(
      { line: decl.line, column: decl.column, start: decl.start, end: decl.end },
      { line: 1, column: 1, start: 0, end: 15 },
    );
    const str = decl.children.find((c: any) => c.type === 'StringLiteral');
    assert.ok(str, `StringLiteral ausente: ${JSON.stringify(decl.children.map((c: any) => c.type))}`);
    assert.deepEqual(
      { line: str.line, column: str.column, start: str.start, end: str.end },
      { line: 1, column: 9, start: 8, end: 14 },
    );
  });

  it('CRLF: segunda instrução na linha 2 e offsets contando o \\r\\n', async () => {
    const r = await extract('let a = 1;\r\nlet b = 2;\r\n');
    assert.equal(r.json.ok, true);
    const linhas = r.json.root.children.map((c: any) => ({
      type: c.type,
      line: c.line,
      column: c.column,
      start: c.start,
      end: c.end,
    }));
    assert.deepEqual(linhas, [
      { type: 'LetDeclaration', line: 1, column: 1, start: 0, end: 10 },
      { type: 'LetDeclaration', line: 2, column: 1, start: 12, end: 22 },
    ]);
  });

  it('bytes que NÃO são UTF-8: substituição + ParseError estruturado (o contrato é erro, nunca crash)', async () => {
    const r = await extract(Buffer.from([0xff, 0xfe]));
    assert.equal(r.code, 0);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.error.code, 'PARSE_ERROR');
    assert.deepEqual(Object.keys(r.json.error).sort(), ['code', 'column', 'line', 'message']);
  });
});
