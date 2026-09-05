/**
 * tests/engineCoverageCli.test.ts — o comando `coverage` do CLI da engine
 * (`tools/track-engine/cli.ts`) como SUBPROCESSO REAL.
 *
 * O QUE ELE TRAVA, e o defeito é MEDIDO (`main@26dbc19`):
 *
 *   $ npx tsx tools/track-engine/cli.ts coverage python
 *   PLACAR (coverage)
 *     desafios 21 · passou 0 · parse-falhou 21 · lacunas 0     [exit 0]
 *
 * Duas mentiras num placar só:
 *   (A) CEGUEIRA — "0 lacunas" sobre ZERO desafio medido não é "nenhuma
 *       lacuna", é "nada foi olhado". A trilha é Python e o sintetizador lia
 *       o teste com o parser de JavaScript;
 *   (B) FAIL-OPEN — o comando saía 0 nesse estado, contra
 *       `docs/16-engine-de-trilha.md` §9.3 ("a engine falha fechada.
 *       Indisponibilidade produz erro estruturado, nunca veredito falso nem
 *       aprovação por omissão").
 *
 * Por que subprocesso: `cli.ts` roda `main()` no import (é entry point) — o
 * contrato observável dele é stdout + exit code, e é isso que este arquivo
 * prova.
 *
 * Toda trilha usada aqui é FIXTURE alcançada por `--dir` (convenção do commit
 * 33b0eab): `app/resources/tracks` não é lido nem tocado, e nenhum veredito
 * deste arquivo muda quando o conteúdo publicado muda.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const APP_DIR = path.resolve(__dirname, '..');
const TIMEOUT_CLI_MS = 180_000;

/** A fixture MENSURÁVEL: 1 desafio de Python na forma stdout. */
const FIXTURE_MEDIVEL = path.join(__dirname, 'fixtures', 'tracks', 'trilha-python-minima');
/** A fixture NÃO MENSURÁVEL: o `testsCode` do único desafio não parseia. */
const FIXTURE_NAO_MEDIVEL = path.join(__dirname, 'fixtures', 'tracks', 'trilha-python-nao-medivel');
/** Uma trilha de JavaScript, para provar que o caminho de sempre não mudou. */
const FIXTURE_JS = path.join(__dirname, 'fixtures', 'tracks', 'trilha-minima');

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

describe('coverage — a trilha de PYTHON deixa de ser invisível', () => {
  it('mede o desafio de Python: 1 passou, 0 parse-falhou, exit 0', async () => {
    const r = await runEngine(['coverage', 'trilha-python-minima', '--dir', FIXTURE_MEDIVEL]);
    assert.equal(r.code, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /linguagem: python/);
    assert.match(r.stdout, /passou \(solucao minima\) \.+ 1/);
    assert.match(r.stdout, /parse-falhou \.+ 0/);
    assert.match(r.stdout, /NAO MEDIDOS \(soma das 4 acima\) 0/);
    // O MÍNIMO é código de PYTHON, e os átomos são os do adaptador de Python.
    assert.match(r.stdout, /print\("oi"\)/);
    assert.match(r.stdout, /ATOMS COBRADOS \(6\).*global:print.*node:StrLiteral/);
    assert.doesNotMatch(r.stdout, /não parseia como JavaScript/);
  });

  it('o mesmo desafio no --json traz linguagem, placar e naoMedidos', async () => {
    const r = await runEngine(['coverage', 'trilha-python-minima', '--dir', FIXTURE_MEDIVEL, '--json']);
    assert.equal(r.code, 0, r.stderr);
    const dados = JSON.parse(r.stdout) as {
      linguagem: string;
      placar: { desafios: number; passou: number; parseFalhou: number; naoMedidos: number };
      desafios: Array<{ status: string; atoms?: string[] }>;
    };
    assert.equal(dados.linguagem, 'python');
    assert.deepEqual(dados.placar.desafios, 1);
    assert.deepEqual(dados.placar.passou, 1);
    assert.deepEqual(dados.placar.parseFalhou, 0);
    assert.deepEqual(dados.placar.naoMedidos, 0);
    assert.equal(dados.desafios[0].status, 'ok');
    assert.ok(dados.desafios[0].atoms?.includes('global:print'));
  });
});

describe('coverage — fail-closed: desafio NÃO MEDIDO reprova o comando', () => {
  it('parse-falhou faz o comando sair 1 e DIZER o motivo', async () => {
    const r = await runEngine(['coverage', 'trilha-python-nao-medivel', '--dir', FIXTURE_NAO_MEDIVEL]);
    // Até main@26dbc19 este mesmo estado saía 0 — a mentira que este teste trava.
    assert.notEqual(r.code, 0, `esperado exit != 0; stdout:\n${r.stdout}`);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /parse-falhou \.+ 1/);
    assert.match(r.stdout, /NAO MEDIDOS \(soma das 4 acima\) 1/);
    assert.match(r.stdout, /REPROVADO — 1 desafio\(s\) NAO MEDIDO\(S\)/);
    assert.match(r.stdout, /PARSE-FALHOU modulo-1\/a-aula\/o-desafio/);
    // E o placar NÃO pode alegar aprovação: zero desafio passou.
    assert.match(r.stdout, /passou \(solucao minima\) \.+ 0/);
  });

  it('o --json do mesmo caso conta o desafio como NÃO medido, nunca como ok', async () => {
    const r = await runEngine([
      'coverage',
      'trilha-python-nao-medivel',
      '--dir',
      FIXTURE_NAO_MEDIVEL,
      '--json',
    ]);
    assert.equal(r.code, 1);
    const dados = JSON.parse(r.stdout) as {
      placar: { passou: number; parseFalhou: number; naoMedidos: number };
      desafios: Array<{ status: string; detail?: string }>;
    };
    assert.equal(dados.placar.passou, 0);
    assert.equal(dados.placar.parseFalhou, 1);
    assert.equal(dados.placar.naoMedidos, 1);
    assert.equal(dados.desafios[0].status, 'parse-falhou');
    assert.match(dados.desafios[0].detail ?? '', /não parseia como Python/);
  });
});

describe('coverage — o caminho de JavaScript continua o de sempre', () => {
  it('a trilha-fixture de JavaScript continua sendo medida e sai 0', async () => {
    const r = await runEngine(['coverage', 'trilha-minima', '--dir', FIXTURE_JS]);
    assert.equal(r.code, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /linguagem: javascript/);
    assert.match(r.stdout, /NAO MEDIDOS \(soma das 4 acima\) 0/);
    assert.match(r.stdout, /parse-falhou \.+ 0/);
  });
});
