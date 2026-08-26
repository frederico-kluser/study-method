/**
 * tests/tools/ensure-native-abi.test.ts — fluxo de ERRO do ensure-native-abi.sh.
 *
 * NÃO compila nada: só exercita o ramo em que o alias `better-sqlite3-electron`
 * está ausente — o script deve sair 1 com mensagem clara, sem nunca alcançar o
 * passo de `node-gyp rebuild` (que baixa headers do Electron e compila).
 *
 * O alias (e o marker de idempotência `.bsqlite3-eabi-*`, se existir — ele
 * dispararia o fast path exit 0 antes do check do alias) é renomeado
 * temporariamente e restaurado no `finally`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants as FSC, accessSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(__dirname, '..', '..');
const SCRIPT = 'tools/ensure-native-abi.sh';
const SCRIPT_PATH = join(APP_ROOT, SCRIPT);
const NODE_MODULES = join(APP_ROOT, 'node_modules');
const ALIAS = join(NODE_MODULES, 'better-sqlite3-electron');
const ALIAS_HIDDEN = join(NODE_MODULES, '.bsqlite3-hidden');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Roda `bash tools/ensure-native-abi.sh` com cwd na raiz da app. */
function runScript(): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [SCRIPT], {
      cwd: APP_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.on('data', (d: string) => {
      stderr += d;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('tools/ensure-native-abi.sh', () => {
  it('existe e é executável', () => {
    assert.ok(existsSync(SCRIPT_PATH), `script ausente: ${SCRIPT}`);
    assert.doesNotThrow(() => accessSync(SCRIPT_PATH, FSC.X_OK), 'script sem bit de execução');
  });

  it('alias ausente → exit 1 com mensagem clara (sem compilar)', async (t) => {
    // Precondição: sem node_modules/electron/dist/version o script pula (exit 0)
    // antes de chegar ao check do alias — aí este fluxo de erro não se aplica.
    const versionFile = join(NODE_MODULES, 'electron', 'dist', 'version');
    if (!existsSync(versionFile)) {
      t.skip('node_modules/electron/dist/version ausente — fluxo de erro não alcançável');
      return;
    }

    // Restaura sobras de uma execução anterior interrompida (defensivo).
    if (!existsSync(ALIAS) && existsSync(ALIAS_HIDDEN)) {
      renameSync(ALIAS_HIDDEN, ALIAS);
    }

    const movedMarkers: { from: string; to: string }[] = [];
    const aliasMoved = existsSync(ALIAS);
    try {
      // Esconde o alias: o script deve falhar ANTES de tentar compilar.
      if (aliasMoved) renameSync(ALIAS, ALIAS_HIDDEN);

      // Esconde os markers de idempotência: sem eles o script sairia 0 no fast
      // path antes de inspecionar o alias.
      for (const name of readdirSync(NODE_MODULES)) {
        if (name.startsWith('.bsqlite3-eabi-')) {
          const from = join(NODE_MODULES, name);
          const to = join(NODE_MODULES, `${name}.hidden`);
          renameSync(from, to);
          movedMarkers.push({ from, to });
        }
      }

      const r = await runScript();
      assert.equal(
        r.code,
        1,
        `exit esperado 1, veio ${r.code}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
      );
      assert.ok(
        r.stderr.includes('[ensure-native-abi] ERRO: node_modules/better-sqlite3-electron ausente.'),
        `mensagem de erro ausente\nstderr:\n${r.stderr}`,
      );
    } finally {
      // restaura o alias e os markers para não deixar node_modules quebrado.
      for (const m of movedMarkers) {
        try {
          if (existsSync(m.to)) renameSync(m.to, m.from);
        } catch {
          /* melhor esforço */
        }
      }
      try {
        if (aliasMoved && existsSync(ALIAS_HIDDEN)) renameSync(ALIAS_HIDDEN, ALIAS);
      } catch {
        /* melhor esforço */
      }
    }
  });
});
