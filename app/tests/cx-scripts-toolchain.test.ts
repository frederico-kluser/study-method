/**
 * cx-scripts-toolchain.test.ts — CARACTERIZAÇÃO de `skills/study-method/scripts/_ensure-toolchain.sh`.
 *
 * Auxiliar de prefixo `_` (fora dos 19 da §8 — é motor do passo `preparar_ambiente`
 * da superfície de AUTORIA). Pina o contrato do cabeçalho dele:
 *  - enum FECHADO de linguagens `python|rust|c` (mais estreito que o enum de 19,
 *    de propósito) — fora dele, exit 2;
 *  - UM modo por execução (--check/--ensure/--self-test) — combinar é exit 2;
 *  - `--self-test` exercita provas e contrato de exit/JSON SEM instalar nada;
 *  - `--check` é só-prova, offline, e o JSON tem as chaves de topo fechadas
 *    (`mode`, `languages`, `harness`, `ensure`, …).
 *
 * NENHUM teste aqui roda `--ensure` (que instala pela distro) — instalação real
 * é proibida nestes testes; o emulador de contêiner cobre esse caminho à parte.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { makeSandbox, SCRIPTS_DIR } from './cx-scripts-fixtures/harness';

const ENSURE = path.join(SCRIPTS_DIR, '_ensure-toolchain.sh');

describe('_ensure-toolchain.sh — prova por execução da toolchain (auxiliar `_`)', () => {
  it('enum fechado de linguagens: fora de {python, rust, c} → exit 2', async () => {
    const sb = await makeSandbox(false);
    for (const lingua of ['go', 'javascript', 'COBOL']) {
      const r = sb.file(ENSURE, ['--check', '--language', lingua]);
      assert.equal(r.status, 2, `linguagem: ${lingua}`);
    }
    assert.equal(sb.file(ENSURE, ['--help']).status, 0);
    await sb.rm();
  });

  it('um modo por execução: --check+--ensure e --self-test+--language saem 2', async () => {
    const sb = await makeSandbox(false);
    assert.equal(sb.file(ENSURE, ['--check', '--ensure']).status, 2);
    assert.equal(sb.file(ENSURE, ['--self-test', '--language', 'python']).status, 2, '--self-test cobre as 3 e não aceita --language');
    assert.equal(sb.file(ENSURE, ['--frobnicate']).status, 2, 'flag desconhecida é uso incorreto');
    await sb.rm();
  });

  it('--self-test: exit 0 provando o contrato de exit/JSON em fixtures, SEM instalar nada', async () => {
    const sb = await makeSandbox(false);
    const r = sb.file(ENSURE, ['--self-test']);
    assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-400)}`);
    assert.match(r.stderr, /auto-teste/);
    assert.match(r.stderr, /nada é instalado/);
    await sb.rm();
  });

  it('--check --language python --json: JSON de 9 chaves, mode=check e a prova de execução aprovada', async () => {
    const sb = await makeSandbox(false);
    const r = sb.file(ENSURE, ['--check', '--language', 'python', '--json']);
    assert.equal(r.status, 0, 'python3 provado por execução nesta máquina');
    const saida = JSON.parse(r.stdout) as {
      schema_version: string;
      mode: string;
      implemented_languages: string[];
      languages: Record<string, { available: boolean; proof?: { ok: boolean } }>;
      harness: unknown;
      ensure: unknown;
    };
    assert.deepEqual(Object.keys(saida).sort(), [
      'ensure',
      'generated_at',
      'harness',
      'host',
      'implemented_languages',
      'languages',
      'mode',
      'platform',
      'schema_version',
    ]);
    assert.equal(saida.mode, 'check');
    assert.deepEqual(saida.implemented_languages, ['python', 'rust', 'c']);
    assert.equal(saida.languages.python.available, true);
    assert.equal(saida.languages.python.proof?.ok, true, 'o veredito sai de EXECUÇÃO, não de leitura de versão');
    await sb.rm();
  });

  it('--check --language rust --json: mesmo envelope (exit 0 ou 1 conforme a máquina; nunca 2/5)', async () => {
    const sb = await makeSandbox(false);
    const r = sb.file(ENSURE, ['--check', '--language', 'rust', '--json']);
    assert.ok(r.status === 0 || r.status === 1, `exit fora de {0,1}: ${r.status} — ${r.stderr.slice(-200)}`);
    const saida = JSON.parse(r.stdout) as { mode: string; languages: Record<string, unknown> };
    assert.equal(saida.mode, 'check');
    assert.ok('rust' in saida.languages, 'a linguagem pedida está reportada');
    assert.ok('harness' in saida, 'o bloco harness (node+npm+jq) é reportado SEMPRE');
    await sb.rm();
  });
});
