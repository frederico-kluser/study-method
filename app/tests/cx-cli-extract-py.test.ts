/**
 * tests/cx-cli-extract-py.test.ts — CARACTERIZAÇÃO (golden master) da Porta 1
 * de Python (`app/electron/main/engine/vocab/py/extract_ast.py`).
 *
 * O extrator é um SUBPROCESSO PURO de parse de fonte — invocado pelo adaptador
 * (`lang/python.ts`) sempre assim:
 *
 *     python3 -I -S extract_ast.py <nome>    # fonte no STDIN, JSON no STDOUT
 *
 * O que se congela aqui: o SHAPE do JSON (`ParseOk`/`ParseError` do §6), o
 * exit code SEMPRE 0 (o veredito vive no JSON), e as duas armadilhas de
 * posição medidas no cabeçalho do próprio arquivo — `col_offset` em BYTES
 * UTF-8 convertido para CARACTERE, e a tabela de quebras de linha UNIVERSAL
 * (CRLF/CR). Fontes pequenas inline via child_process; nada de rede, nada de LLM.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const EXTRACTOR = path.resolve(__dirname, '..', 'electron', 'main', 'engine', 'vocab', 'py', 'extract_ast.py');

interface PyResult {
  code: number;
  json: any;
  raw: string;
}

/** `python3 -I -S extract_ast.py [nome]` com o fonte no stdin. */
function extract(fonte: Buffer | string, args: string[] = ['solucao.py']): Promise<PyResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', '-S', EXTRACTOR, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let raw = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
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

// `python3` é a PORTA do adaptador; sem ele o teste não tem o que caracterizar.
const TEM_PYTHON = spawnSync('python3', ['--version']).status === 0;

describe('extract_ast.py — fonte bem-formado (shape do ParseOk)', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('emite ok:true com pythonVersion/implementation/root/scopes e o LangNode canônico', async () => {
    const r = await extract('def soma(a, b):\n    return a + b\n');
    assert.equal(r.code, 0, 'o veredito vive no JSON — o exit code é SEMPRE 0');
    assert.deepEqual(Object.keys(r.json).sort(), ['implementation', 'ok', 'pythonVersion', 'root', 'scopes']);
    assert.equal(r.json.ok, true);
    assert.match(r.json.pythonVersion, /^\d+\.\d+\.\d+/);
    assert.equal(r.json.implementation, 'CPython');
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
    // o `Module` não tem posição nativa: cobre o arquivo inteiro, 1-based.
    assert.equal(r.json.root.type, 'Module');
    assert.deepEqual(
      { line: r.json.root.line, column: r.json.root.column, start: r.json.root.start, end: r.json.root.end },
      { line: 1, column: 1, start: 0, end: 33 },
    );
    assert.equal(r.json.root.text, 'def soma(a, b):\n    return a + b\n');
  });

  it('resolução de escopo (symtable, Tier A): declared/imported/free por tabela', async () => {
    const r = await extract('def soma(a, b):\n    return a + b\n');
    assert.deepEqual(r.json.scopes, { declared: ['a', 'b', 'soma'], imported: [], free: [] });
  });

  it('filho FunctionDef carrega posição e o MESMO envelope do LangNode', async () => {
    const r = await extract('def soma(a, b):\n    return a + b\n');
    const fn = r.json.root.children[0];
    assert.equal(fn.type, 'FunctionDef');
    assert.deepEqual(
      { line: fn.line, column: fn.column, start: fn.start, end: fn.end },
      { line: 1, column: 1, start: 0, end: 32 },
    );
    assert.equal(fn.synthetic, false);
  });
});

describe('extract_ast.py — fonte quebrado (ParseError estruturado, nunca crash)', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('erro de sintaxe vira ok:false com code/MESSAGE/line/column e exit 0', async () => {
    const r = await extract('def f(:\n');
    assert.equal(r.code, 0, 'erro de parse NÃO pode virar crash nem exit != 0');
    assert.equal(r.json.ok, false);
    assert.deepEqual(Object.keys(r.json), ['ok', 'error']);
    assert.deepEqual(Object.keys(r.json.error).sort(), ['code', 'column', 'line', 'message']);
    assert.equal(r.json.error.code, 'PARSE_ERROR');
    assert.equal(r.json.error.message, 'invalid syntax');
    assert.equal(r.json.error.line, 1);
    assert.equal(r.json.error.column, 7);
  });
});

describe('extract_ast.py — limites (vazio, UTF-8 multibyte, CRLF, bytes inválidos)', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('fonte VAZIO: ok:true, Module sem filhos, escopos vazios — nunca erro', async () => {
    const r = await extract('');
    assert.equal(r.code, 0);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.root.type, 'Module');
    assert.deepEqual(r.json.root.children, []);
    assert.deepEqual(r.json.scopes, { declared: [], imported: [], free: [] });
  });

  it('UTF-8 multibyte: start/end/column são em CARACTERES (o col_offset em bytes deslocaria tudo)', async () => {
    // `x = "ação"` — em BYTES a string termina em 12; em CARACTERES em 10.
    const r = await extract('x = "ação"\n');
    assert.equal(r.json.ok, true);
    const assign = r.json.root.children[0];
    assert.equal(assign.type, 'Assign');
    assert.deepEqual(
      { line: assign.line, column: assign.column, start: assign.start, end: assign.end },
      { line: 1, column: 1, start: 0, end: 10 },
    );
    const str = assign.children.find((c: any) => c.type === 'StrLiteral');
    assert.ok(str, `StrLiteral ausente: ${JSON.stringify(assign.children.map((c: any) => c.type))}`);
    assert.deepEqual(
      { line: str.line, column: str.column, start: str.start, end: str.end },
      { line: 1, column: 5, start: 4, end: 10 },
    );
  });

  it('CRLF: a tabela de linhas é UNIVERSAL (\\r\\n conta como quebra, sem deslocar offset)', async () => {
    const r = await extract('a=1\r\nb=2\r\n');
    assert.equal(r.json.ok, true);
    const linhas = r.json.root.children.map((c: any) => ({
      type: c.type,
      line: c.line,
      column: c.column,
      start: c.start,
      end: c.end,
    }));
    assert.deepEqual(linhas, [
      { type: 'Assign', line: 1, column: 1, start: 0, end: 3 },
      { type: 'Assign', line: 2, column: 1, start: 5, end: 8 },
    ]);
  });

  it('bytes que NÃO são UTF-8: ParseError declarando a recusa de decodificação, exit 0', async () => {
    const r = await extract(Buffer.from([0xff, 0xfe]));
    assert.equal(r.code, 0);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.error.code, 'PARSE_ERROR');
    assert.ok(r.json.error.message.startsWith('fonte não é UTF-8 válido'), r.json.error.message);
    assert.equal(r.json.error.line, 1);
    assert.equal(r.json.error.column, 1);
  });
});
