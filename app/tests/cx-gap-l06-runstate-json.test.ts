/**
 * tests/cx-gap-l06-runstate-json.test.ts — GAP de cobertura do lote L06 sobre
 * `engine/runtime/runState.ts`: o FORMATO de serialização do `run.json` não
 * tinha cobertura própria. O pin do repositório ("JSON serializado com 2
 * espaços + \n") é observável aqui em `salvarRun` — as demais materializações
 * com 2 espaços vivem em modes//fiacao/ (outros lotes).
 *
 * O que este testa PINA (é o que uma refatoração da escrita pode quebrar em
 * silêncio): `run.json` é `JSON.stringify(estado, null, 2)` + `\n` final —
 * indentação de DOIS espaços e newline de cauda, byte a byte.
 *
 * Sem rede, sem LLM, sem chave: só disco temporário (mkdtemp).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  RUN_FILENAME,
  criarRun,
  salvarRun,
  type CriarRunInput,
} from '../electron/main/engine/runtime/runState';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

async function tmpDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'do-l06-runjson-'));
}

function entradaValida(): CriarRunInput {
  return {
    slug: 'trilha-l06',
    budgetHash: HASH_A,
    graphHash: HASH_B,
    modelosPorEtapa: {},
    promptVersao: 'p1',
    catalogoVersao: 'c1',
  };
}

describe('runState — serialização do run.json (2 espaços + \\n, pin do repositório)', () => {
  it('run.json é JSON.stringify(..., null, 2) + "\\n": indentação de 2 espaços e newline de cauda', async () => {
    const dir = await tmpDir();
    try {
      const run = criarRun(entradaValida());
      await salvarRun(dir, run);
      const cru = await fsp.readFile(path.join(dir, RUN_FILENAME), 'utf8');

      // newline de cauda obrigatório
      assert.ok(cru.endsWith('}\n'), 'o arquivo termina com } + \\n');
      // round-trip de FORMATAÇÃO: re-serializar o conteúdo com null, 2 devolve
      // o MESMO texto (2 espaços em todo nível de aninhamento, sem tabulação)
      const reparsed = JSON.parse(cru) as Record<string, unknown>;
      assert.equal(cru, `${JSON.stringify(reparsed, null, 2)}\n`);
      // indentação literal de dois espaços no segundo nível do objeto
      assert.ok(cru.includes('\n  "fases": {'), 'segundo nível indentado com DOIS espaços');
      assert.ok(cru.includes('\n    "F0":'), 'terceiro nível indentado com QUATRO espaços (2 por nível)');
      assert.ok(!cru.includes('\t'), 'nenhuma tabulação');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
