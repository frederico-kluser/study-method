/**
 * tests/engineLimiteMedicaoCli.test.ts — `--limite 0` como SUBPROCESSO REAL
 * (`tools/track-engine/cli.ts`), nos QUATRO comandos que ele SLICEIA antes de
 * medir: `coverage`, `requirements`, `discrimination`, `revise`.
 *
 * O DEFEITO, MEDIDO nos dois lados do mesmo binário:
 *
 *   cd app && npx tsx tools/track-engine/cli.ts coverage python --limite 0
 *   → exit 0, "desafios ... 0 · passou ... 0 · lacunas ... 0" — NADA foi
 *     olhado, e o comando saiu VERDE.
 *   cd app && npx tsx tools/track-engine/cli.ts coverage python
 *   → "desafios 21 · passou 21 · lacunas 0 · excessos 29" — a mesma trilha,
 *     de verdade medida.
 *
 * `--limite` no `audit` só bound quantas violações são IMPRESSAS sobre uma
 * auditoria SEMPRE completa (`0` lá é o modo recomendado — "só o placar" —
 * e continua saindo 0/1 conforme o achado real; ver
 * `tests/engineRepairCli.test.ts`, describe "audit: a linha de truncamento").
 * Nestes QUATRO comandos, ao contrário, `--limite` fatia a lista de
 * desafios/aulas ANTES de medir qualquer coisa
 * (`coletarDesafios(track).slice(0, limite)` / `pedagogicalOrder(track)
 * .slice(0, limite)`) — `--limite 0` fatiava para uma lista VAZIA, e um
 * placar de zeros sobre zero item medido saía 0. É a MESMA aprovação por
 * omissão que `docs/16-engine-de-trilha.md` §9.3 proíbe, só que pela porta da
 * FLAG em vez da medição.
 *
 * A CORREÇÃO: `--limite` nestes quatro comandos só aceita N >= 1 — `--limite
 * 0` vira uso incorreto (exit 2), a MESMA convenção que `--rodadas 0` já usa
 * (`resolverRodadas`, `tools/track-engine/cli.ts`) para "um número de
 * execuções cujo zero não tem execução sensata nenhuma". O `audit` não muda:
 * ele mede tudo independentemente de `--limite`, então `0` continua sendo um
 * valor válido e útil lá.
 *
 * Por que subprocesso: `cli.ts` roda `main()` no import (é entry point) — o
 * contrato observável dele é stdout/stderr + exit code, e é isso que este
 * arquivo prova. Toda trilha usada aqui é a FIXTURE `trilha-minima`
 * (`--dir`, convenção do commit 33b0eab): `app/resources/tracks` não é lido
 * nem tocado, e nenhum veredito deste arquivo muda quando o conteúdo
 * publicado muda.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const APP_DIR = path.resolve(__dirname, '..');
const TIMEOUT_CLI_MS = 60_000;

const FIXTURE = path.join(__dirname, 'fixtures', 'tracks', 'trilha-minima');

interface SaidaDoCli {
  code: number;
  stdout: string;
  stderr: string;
}

/** Roda `npx tsx tools/track-engine/cli.ts <args...>` com cwd = app. */
function runEngine(args: string[]): Promise<SaidaDoCli> {
  return new Promise((resolve, reject) => {
    // NODE_TEST_CONTEXT é setado pelo node:test do processo PAI; herdado pelo
    // filho, faria o node:test do CLI pular testes.
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn('npx', ['--no-install', 'tsx', 'tools/track-engine/cli.ts', ...args], {
      cwd: APP_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_CLI_MS);
    child.stdout.on('data', (d: Buffer) => (stdout += String(d)));
    child.stderr.on('data', (d: Buffer) => (stderr += String(d)));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe('--limite 0 nos comandos de MEDIÇÃO — uso incorreto, nunca placar zerado', () => {
  it('coverage --limite 0 sai 2 (uso incorreto), nunca um placar de zeros em exit 0', async () => {
    const r = await runEngine(['coverage', 'trilha-minima', '--dir', FIXTURE, '--limite', '0']);
    // Até esta correção: exit 0 com "desafios ... 0 · passou ... 0" — a
    // aprovação por omissão que este teste trava.
    assert.equal(r.code, 2, `esperado exit 2 (uso incorreto); stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /--limite invalido: 0/);
    assert.match(r.stderr, /esperado inteiro/);
    // O placar de zeros do defeito antigo NUNCA chega a ser impresso.
    assert.doesNotMatch(r.stdout, /PLACAR \(coverage\)/);
  });

  it('requirements --limite 0 sai 2 (uso incorreto), nunca um placar de zeros em exit 0', async () => {
    const r = await runEngine(['requirements', 'trilha-minima', '--dir', FIXTURE, '--limite', '0']);
    assert.equal(r.code, 2, `esperado exit 2 (uso incorreto); stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /--limite invalido: 0/);
    assert.doesNotMatch(r.stdout, /PLACAR \(requirements\)/);
  });

  it('discrimination --limite 0 sai 2 (uso incorreto) — mesmo sendo um comando que NUNCA reprova conteúdo', async () => {
    // `discrimination` é a ÚNICA EXCEÇÃO documentada que nunca sai 1 (é
    // AVISO, por decisão de projeto) — mas "medir zero e ainda assim
    // declarar um relatório de achados" seria a MESMA aprovação por omissão
    // disfarçada de AVISO vazio. Por isso o --limite 0 continua sendo
    // barrado ANTES de qualquer medição, como uso incorreto.
    const r = await runEngine(['discrimination', 'trilha-minima', '--dir', FIXTURE, '--limite', '0']);
    assert.equal(r.code, 2, `esperado exit 2 (uso incorreto); stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /--limite invalido: 0/);
    assert.doesNotMatch(r.stdout, /PLACAR \(discriminacao/);
  });

  it('revise --limite 0 sai 2 (uso incorreto) — antes saía 0 com "convergencia: SIM" sobre 0 aulas', async () => {
    const r = await runEngine(['revise', 'trilha-minima', '--dir', FIXTURE, '--limite', '0']);
    assert.equal(r.code, 2, `esperado exit 2 (uso incorreto); stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /--limite invalido: 0/);
    assert.match(r.stderr, /aula\(s\)/, 'a mensagem do revise fala em AULAS, não em desafios');
    // O relatório do defeito antigo ("convergencia: SIM em N iteracao(oes)"
    // sobre zero aulas) nunca chega a ser gravado nem impresso.
    assert.doesNotMatch(r.stdout, /REVISAO PROGRESSIVA/);
  });
});

describe('--limite continua útil para N >= 1 (amostra rápida não regrediu)', () => {
  it('coverage --limite 1 mede exatamente 1 desafio, de verdade', async () => {
    const r = await runEngine(['coverage', 'trilha-minima', '--dir', FIXTURE, '--limite', '1']);
    assert.equal(r.code, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /desafios \.+ 1/);
  });

  it('discrimination --limite 1 mede exatamente 1 desafio, de verdade', async () => {
    const r = await runEngine(['discrimination', 'trilha-minima', '--dir', FIXTURE, '--limite', '1']);
    assert.equal(r.code, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /desafios \.+ 1/);
  });
});

describe('audit --limite 0 NÃO muda: continua "só o placar" sobre a trilha inteira', () => {
  it('audit --limite 0 mede tudo e sai conforme o achado real (nunca uso incorreto)', async () => {
    // `audit` não fatia entrada nenhuma por `--limite` — ele só bound o que é
    // IMPRESSO. Esta prova é a garantia de NÃO regressão: a correção acima
    // vive inteira em `coverage`/`requirements`/`discrimination`/`revise`, e
    // não pode ter tocado a validação do `audit` (já coberta em
    // `tests/engineRepairCli.test.ts`).
    const r = await runEngine(['audit', 'trilha-minima', '--dir', FIXTURE, '--limite', '0']);
    assert.equal(r.code, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /aulas \.+ 3/);
    assert.doesNotMatch(r.stdout, /--limite invalido/);
  });
});
