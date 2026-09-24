/**
 * tests/cx-cli-extract-c.test.ts — CARACTERIZAÇÃO (golden master) da Porta 1
 * de C (`app/electron/main/engine/vocab/c/extract_ast.py`).
 *
 * Invocado pelo adaptador (`lang/c.ts`) sempre assim:
 *
 *     python3 extract_ast.py <fonte.c>   # JSON do clang -ast-dump=json no STDIN
 *
 * (o clang não lê fonte de stdin — quem grava o temp é o adaptador; este módulo
 * SÓ lê). Duas camadas de teste:
 *
 *   1. dumps SINTÉTICOS inline — determinísticos, sem depender do clang da
 *      máquina: shape do ParseOk, nós TRANSPARENTES derrubados com os filhos
 *      sobendo (ImplicitCastExpr), nós IMPLÍCITOS filtrados, erros estruturados;
 *   2. clang REAL (skip quando ausente) — incl. a armadilha byte→caractere em
 *      fonte multibyte CRLF, medido no cabeçalho do próprio extrator.
 *
 * Fonte em tmpdir próprio; nada de rede; exit code SEMPRE 0 (o veredito vive
 * no JSON).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const EXTRACTOR = path.resolve(__dirname, '..', 'electron', 'main', 'engine', 'vocab', 'c', 'extract_ast.py');

interface CResult {
  code: number;
  json: any;
  raw: string;
}

/** `python3 extract_ast.py <fonte.c>` com o dump do clang no stdin. */
function extract(dump: string, fontePath: string): Promise<CResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [EXTRACTOR, fontePath], { stdio: ['pipe', 'pipe', 'pipe'] });
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
    child.stdin.write(dump);
    child.stdin.end();
  });
}

const TEM_PYTHON = spawnSync('python3', ['--version']).status === 0;
const TEM_CLANG = spawnSync('clang', ['--version']).status === 0;

let tmp: string;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'do-cxcli-csrc-'));
});

after(async () => {
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
});

async function fonte(nome: string, conteudo: string): Promise<string> {
  const p = path.join(tmp, nome);
  await fs.writeFile(p, conteudo, 'utf8');
  return p;
}

/**
 * Dump sintético na forma EXATA do `clang -Xclang -ast-dump=json` (medida em
 * clang real): `kind`/`loc`/`range{begin,end}`/`inner`, com offsets em BYTES e
 * o comprimento do último token em `range.end.tokLen` — as quatro armadilhas
 * documentadas no cabeçalho do extrator.
 */
const DUMP_SINTETICO = JSON.stringify({
  kind: 'TranslationUnitDecl',
  loc: {},
  range: { begin: {}, end: {} },
  inner: [
    {
      kind: 'TypedefDecl',
      loc: {},
      range: { begin: {}, end: {} },
      isImplicit: true,
      name: '__int128_t',
      inner: [],
    },
    {
      kind: 'FunctionDecl',
      loc: { offset: 4, line: 1, col: 5, tokLen: 1 },
      range: { begin: { offset: 0, col: 1, tokLen: 3 }, end: { offset: 27, line: 3, col: 1, tokLen: 1 } },
      name: 'f',
      inner: [
        {
          kind: 'CompoundStmt',
          range: { begin: { offset: 10, line: 1, col: 11, tokLen: 1 }, end: { offset: 27, line: 3, col: 1, tokLen: 1 } },
          inner: [
            {
              kind: 'ReturnStmt',
              range: { begin: { offset: 17, line: 2, col: 3, tokLen: 6 }, end: { offset: 17, line: 2, col: 3, tokLen: 6 } },
              inner: [
                {
                  kind: 'ImplicitCastExpr',
                  range: { begin: { offset: 24, line: 2, col: 10, tokLen: 1 }, end: { offset: 25, line: 2, col: 11, tokLen: 1 } },
                  inner: [
                    {
                      kind: 'DeclRefExpr',
                      range: { begin: { offset: 24, line: 2, col: 10, tokLen: 1 }, end: { offset: 24, line: 2, col: 10, tokLen: 1 } },
                      name: 'g',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

describe('extract_ast.py (C) — erros estruturados (nunca crash)', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('sem caminho de fonte (argv vazio): recusa com a mensagem de USO no JSON, exit 0', async () => {
    const r = await extract('{}', '');
    assert.equal(r.code, 0, 'erro de uso também é declarado no JSON, nunca crash');
    assert.equal(r.json.ok, false);
    assert.equal(r.json.error.code, 'PARSE_ERROR');
    assert.equal(r.json.error.message, 'uso: extract_ast.py <fonte.c> (o JSON do clang vem no stdin)');
  });

  it('dump que não é JSON: ParseError "saída do clang não é JSON válido", exit 0', async () => {
    const p = await fonte('a.c', 'int main(void){return 0;}\n');
    const r = await extract('nao é json', p);
    assert.equal(r.code, 0, 'erro de parse NÃO pode virar crash nem exit != 0');
    assert.equal(r.json.ok, false);
    assert.deepEqual(Object.keys(r.json), ['ok', 'error']);
    assert.deepEqual(Object.keys(r.json.error).sort(), ['code', 'column', 'line', 'message']);
    assert.equal(r.json.error.code, 'PARSE_ERROR');
    assert.ok(r.json.error.message.startsWith('saída do clang não é JSON válido'), r.json.error.message);
  });

  it('fonte ilegível/inexistente: ParseError "fonte temporário ilegível" com o caminho no motivo', async () => {
    const r = await extract('{}', path.join(tmp, 'nao-existe.c'));
    assert.equal(r.code, 0);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.error.code, 'PARSE_ERROR');
    assert.ok(r.json.error.message.startsWith('fonte temporário ilegível'), r.json.error.message);
    assert.ok(r.json.error.message.includes('nao-existe.c'), r.json.error.message);
  });
});

describe('extract_ast.py (C) — dump sintético (shape do ParseOk)', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('emite ok:true com clangKind/root/scopes e o LangNode canônico', async () => {
    const p = await fonte('syn.c', 'int f(void) {\n  return g();\n}\n');
    const r = await extract(DUMP_SINTETICO, p);
    assert.equal(r.code, 0, 'o veredito vive no JSON — o exit code é SEMPRE 0');
    assert.deepEqual(Object.keys(r.json).sort(), ['clangKind', 'ok', 'root', 'scopes']);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.clangKind, 'TranslationUnitDecl');
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
    assert.equal(r.json.root.type, 'TranslationUnitDecl');
    assert.deepEqual(
      { line: r.json.root.line, column: r.json.root.column, start: r.json.root.start, end: r.json.root.end },
      { line: 1, column: 1, start: 0, end: 30 },
    );
  });

  it('nós IMPLÍCITOS são filtrados e nós TRANSPARENTES derrubam com os FILHOS subindo', async () => {
    const p = await fonte('syn2.c', 'int f(void) {\n  return g();\n}\n');
    const r = await extract(DUMP_SINTETICO, p);
    const tipos = JSON.stringify(r.json.root, (k, v) => (k === 'text' ? undefined : v));
    assert.ok(!tipos.includes('TypedefDecl'), 'isImplicit não pode entrar na árvore');
    assert.ok(!tipos.includes('ImplicitCastExpr'), 'nó transparente é derrubado');
    const fn = r.json.root.children[0];
    assert.equal(fn.type, 'FunctionDecl');
    assert.deepEqual(
      { line: fn.line, column: fn.column, start: fn.start, end: fn.end },
      { line: 1, column: 1, start: 0, end: 28 },
    );
    assert.deepEqual(fn.attributes, { name: 'f', declKind: 'func' });
    const composto = fn.children[0];
    assert.equal(composto.type, 'CompoundStmt');
    const retorno = composto.children[0];
    assert.equal(retorno.type, 'ReturnStmt');
    const ref = retorno.children[0];
    assert.equal(ref.type, 'DeclRefExpr', 'o filho do ImplicitCastExpr SOBE para o ReturnStmt');
    assert.deepEqual(
      { line: ref.line, column: ref.column, start: ref.start, end: ref.end },
      { line: 2, column: 11, start: 24, end: 25 },
    );
    assert.deepEqual(ref.attributes, { name: 'g' });
  });

  it('escopos planos declared/imported/free (C não tem import)', async () => {
    const p = await fonte('syn3.c', 'int f(void) {\n  return g();\n}\n');
    const r = await extract(DUMP_SINTETICO, p);
    assert.deepEqual(r.json.scopes, { declared: ['f'], imported: [], free: ['g'] });
  });

  it('dump válido mas vazio + fonte VAZIO: ok:true com TranslationUnitDecl sem filhos', async () => {
    const p = await fonte('vazio.c', '');
    const r = await extract(JSON.stringify({ kind: 'TranslationUnitDecl', inner: [] }), p);
    assert.equal(r.code, 0);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.root.type, 'TranslationUnitDecl');
    assert.deepEqual(r.json.root.children, []);
    assert.deepEqual(r.json.scopes, { declared: [], imported: [], free: [] });
    assert.equal(r.json.root.start, 0);
    assert.equal(r.json.root.end, 0);
  });
});

describe('extract_ast.py (C) — ponte completa com clang real', {
  skip: !TEM_PYTHON ? 'python3 ausente' : !TEM_CLANG ? 'clang ausente' : false,
}, () => {
  /** roda `clang -Xclang -ast-dump=json -fsyntax-only` e alimenta o extrator. */
  function clangExtractSync(fontePath: string): CResult {
    const dump = spawnSync('clang', ['-Xclang', '-ast-dump=json', '-fsyntax-only', fontePath], {
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(dump.status, 0, String(dump.stderr).slice(0, 300));
    const out = spawnSync('python3', [EXTRACTOR, fontePath], {
      input: dump.stdout,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(out.status, 0);
    return { code: out.status ?? 1, json: JSON.parse(String(out.stdout)), raw: String(out.stdout) };
  }

  it('fonte C bem-formado: FunctionDecl na árvore e escopos declarados', async () => {
    const p = await fonte('soma.c', 'int soma(int a, int b) {\n  return a + b;\n}\n');
    const r = clangExtractSync(p);
    assert.equal(r.json.ok, true, r.raw.slice(0, 300));
    assert.equal(r.json.clangKind, 'TranslationUnitDecl');
    assert.equal(r.json.root.children[0].type, 'FunctionDecl');
    assert.deepEqual(r.json.scopes, { declared: ['a', 'b', 'soma'], imported: [], free: [] });
  });

  it('multibyte + CRLF: offsets em CARACTERES e tabela de linhas com \\r\\n preservado', async () => {
    // `const char *s = "ação";\r\n...` — em BYTES a string iria até 24; em
    // caracteres até 22. É a armadilha nº 4 do cabeçalho do extrator.
    const p = await fonte('mb.c', 'const char *s = "ação";\r\nint f(void) {\r\n  return 1;\r\n}\r\n');
    const r = clangExtractSync(p);
    assert.equal(r.json.ok, true, r.raw.slice(0, 300));
    const decl = r.json.root.children[0];
    assert.equal(decl.type, 'VarDecl');
    assert.deepEqual(
      { line: decl.line, column: decl.column, start: decl.start, end: decl.end },
      { line: 1, column: 1, start: 0, end: 22 },
    );
    const str = decl.children.find((c: any) => c.type === 'StringLiteral');
    assert.ok(str, `StringLiteral ausente: ${JSON.stringify(decl.children.map((c: any) => c.type))}`);
    assert.deepEqual(
      { line: str.line, column: str.column, start: str.start, end: str.end },
      { line: 1, column: 17, start: 16, end: 22 },
    );
    assert.equal(str.text, '"ação"');
    const fn = r.json.root.children[1];
    assert.equal(fn.type, 'FunctionDecl');
    assert.deepEqual(
      { line: fn.line, column: fn.column, start: fn.start, end: fn.end },
      { line: 2, column: 1, start: 25, end: 54 },
    );
    const retorno = fn.children.find((c: any) => c.type === 'CompoundStmt').children[0];
    assert.equal(retorno.type, 'ReturnStmt');
    assert.deepEqual(
      { line: retorno.line, column: retorno.column, start: retorno.start, end: retorno.end },
      { line: 3, column: 3, start: 42, end: 50 },
    );
  });
});
