#!/usr/bin/env node
/**
 * app/electron/main/engine/vocab/rs/gerar_inventario.mjs — O GERADOR do
 * inventário de Rust (`vocab/atoms.rust.json`).
 *
 * É o análogo exato do `vocab/py/gerar_inventario.py`: passa o CORPUS
 * (`tests/fixtures/rust/corpus.rs`) pelo extrator REAL
 * (`vocab/rs/extract_ast.mjs`) e escreve o artefato com
 *
 *   - `axes.node` — TODO tipo de nó emitido pelo corpus (inclui os SINTÉTICOS:
 *     `MutableReference`, `ElseIf`, `Op`, `GlobalRef`? — não: os portadores
 *     `GlobalRef`/`ApiRef`/`Op` NÃO entram no inventário, porque a chave deles
 *     sai pelo ATRIBUTO (`global:`/`api:`/`op:`) e a genérica seria lixo — o
 *     mesmo critério do Python, que não lista `Binding`. Os sintéticos cuja
     *   chave JÁ é do eixo `node:` (`MutableReference`, `ElseIf`) entram);
 *   - `axes.op` / `axes.decl` — as chaves emitidas nesses eixos;
 *   - `axes.global` — o PRELUDE estático do extrator (a lista fechada de
 *     nomes sempre no escopo — o corpus não precisa USAR todos para o
 *     inventário conhecê-los, igual ao `dir(builtins)` do Python);
 *   - `axes.api` — as macros do prelude (`println!`…) mais as chaves `api:`
 *     emitidas pelo corpus (`api:test`, `api:derive.Debug`, …) — o eixo `api:`
 *     é ABERTO por desenho (o caminho vem do código), como em Python;
 *   - `builtins` — igual a `axes.global` (em Rust os dois coincidem).
 *
 * Uso (a partir de `app/`):
 *
 *     node electron/main/engine/vocab/rs/gerar_inventario.mjs
 *
 * A versão da toolchain que produziu o artefato vai dentro dele
 * (`rust_toolchain`), como o `python_version` vai no `atoms.python.json`.
 * Regenerar: rode de novo depois de mudar o extrator ou o corpus.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const raizApp = join(dir, '..', '..', '..', '..', '..');
const extrator = join(dir, 'extract_ast.mjs');
const corpus = join(raizApp, 'tests', 'fixtures', 'rust', 'corpus.rs');
const saida = join(dir, '..', 'atoms.rust.json');

// A versão da toolchain vem de `rustc --version` — é INFORMAÇÃO do artefato
// (o que o gerou), não uma dependência: quem regenera sem rustc na máquina
// produz o artefato igual, só com o campo `null`.
let versaoRust = null;
try {
  const r = spawnSync('rustc', ['--version'], { encoding: 'utf8' });
  if (r.status === 0) {
    const m = /rustc\s+(\S+)/.exec(r.stdout ?? '');
    if (m) versaoRust = m[1];
  }
} catch {
  versaoRust = null;
}

const fonte = readFileSync(corpus, 'utf8');
const bruto = execFileSync(process.execPath, [extrator, 'corpus.rs'], {
  input: fonte,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const resultado = JSON.parse(bruto);
if (!resultado.ok) {
  console.error('o corpus não parseia — conserte `tests/fixtures/rust/corpus.rs` antes de gerar:');
  console.error(JSON.stringify(resultado.error));
  process.exit(1);
}

// As chaves de PORTADOR cuja chave sai pelo ATRIBUTO (global:/api:/op:) não
// entram no eixo `node:` — o mesmo critério de `vocab/py/gerar_inventario.py`,
// que não lista `Binding`.
const PORTADORES = new Set(['GlobalRef', 'ApiRef', 'Op']);

const nos = new Set();
const ops = new Set();
const decls = new Set();
const apis = new Set();
(function caminhar(n) {
  if (n.synthetic) {
    const a = n.attributes;
    if (a.declKind !== undefined) decls.add(`decl:${a.declKind}`);
    else if (a.globalName !== undefined) { /* eixo global: não vem do corpus */ }
    else if (a.apiPath !== undefined) apis.add(`api:${a.apiPath}`);
    else if (a.operatorFamily !== undefined) ops.add(`op:${a.operatorFamily}:${a.operator}`);
    else if (!PORTADORES.has(n.type)) nos.add(`node:${n.type}`);
  } else {
    nos.add(`node:${n.type}`);
    const a = n.attributes;
    if (a.declKind !== undefined) decls.add(`decl:${a.declKind}`);
    if (a.operatorFamily !== undefined) ops.add(`op:${a.operatorFamily}:${a.operator}`);
  }
  for (const filho of n.children) caminhar(filho);
})(resultado.root);

// Chaves de nó que o corpus não emite mas o extrator EMITE por construção
// (nós raiz e formas que o corpus ainda não usa — lista explícita e mínima;
// quando o corpus crescer, a chave entra pela medição e esta lista encolhe).
for (const extraDeConstrucao of ['node:ForeignMod']) nos.add(extraDeConstrucao);

const artefato = {
  schema: 1,
  rust_toolchain: versaoRust,
  parser: resultado.rust,
  axes: {
    // TODOS os eixos com PREFIXO (o mesmo formato do `atoms.python.json`) —
    // quem lê sem prefixo usa `semPrefixo` do adaptador.
    node: [...nos].sort(),
    op: [...ops].sort(),
    decl: [...decls].sort(),
    global: resultado.globalsRust.map((n) => `global:${n}`),
    api: [...apis].sort(),
  },
  // Em Rust builtins === globals: o prelude é "o que a linguagem embute sem
  // import", e não há a fronteira builtin × global-de-módulo que o Python tem.
  builtins: resultado.globalsRust,
  total: 0,
};
artefato.total =
  artefato.axes.node.length +
  artefato.axes.op.length +
  artefato.axes.decl.length +
  artefato.axes.global.length +
  artefato.axes.api.length;

writeFileSync(saida, JSON.stringify(artefato, null, 2) + '\n', 'utf8');
console.log(
  `atoms.rust.json gerado: ${artefato.axes.node.length} node, ` +
    `${artefato.axes.op.length} op, ${artefato.axes.decl.length} decl, ` +
    `${artefato.axes.global.length} global, ${artefato.axes.api.length} api ` +
    `(total ${artefato.total}) — toolchain ${versaoRust ?? 'n/d'}`,
);
