/**
 * VERIFICAÇÃO A05 — check 6 (L-04 content-src): todos os arquivos de texto do
 * experimento terminam com newline final. Replica o L-04 do gate-lint sobre o
 * escopo content-src/let-e-atribuicao (md + json; .mts não é varrido pelo gate).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..'); // content-src/let-e-atribuicao

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(md|json|tsv|sh|py|tmpl)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(base).sort();
const bad: string[] = [];
for (const f of files) {
  const buf = fs.readFileSync(f);
  if (buf.length === 0 || buf[buf.length - 1] !== 0x0a) bad.push(path.relative(base, f));
}
console.log('=== CHECK 6 — L-04 (newline final) sobre content-src/let-e-atribuicao ===');
console.log(`arquivos varridos: ${files.length}`);
console.log(`sem newline final: ${bad.length === 0 ? '0 — todos OK' : bad.join(', ')}`);
if (bad.length > 0) process.exit(1);
