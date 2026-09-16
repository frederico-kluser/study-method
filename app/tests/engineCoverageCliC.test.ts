/**
 * tests/engineCoverageCliC.test.ts — o comando `coverage` do CLI da engine
 * (`tools/track-engine/cli.ts`) sobre trilhas de C, como SUBPROCESSO REAL.
 *
 * O DEFEITO QUE ESTE ARQUIVO TRAVA (onda 4 da trilha C): `npm run engine --
 * coverage c-iniciante` saía exit 2 fail-closed — "não existe sintetizador
 * para c" (`EngineLinguagemError`, cli.ts:791-800). O sintetizador de C
 * (`quality/minimalC.ts`) fecha o bloqueio REAL dos agentes de conteúdo da
 * onda 5, cujo gate por `--dir` inclui o coverage.
 *
 * Duas provas, nos termos falsificáveis da onda:
 *   1. FIXTURE — `coverage trilha-c-minima --dir <fixture>` sai exit 0 com
 *      placar honesto (2 desafios medidos, 0 lacunas);
 *   2. TRILHA REAL — `coverage c-iniciante` (a trilha no disco, lida e NUNCA
 *      escrita) roda exit 0/1 — nunca 2 — com TODOS os desafios medidos.
 *      A trilha real é FIXTURE DE LEITURA deste teste: nenhum veredito aqui
 *      muda conteúdo dela.
 *
 * Por que subprocesso: `cli.ts` roda `main()` no import (é entry point) — o
 * contrato observável dele é stdout + exit code, e é isso que este arquivo
 * prova. Skip declarado quando a máquina não tem a toolchain de C completa
 * (CONTRIBUTING: degradação declarada, nunca verde sem ter provado).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { cDetect } from '../electron/main/engine/lang/c';

const TEM_C = cDetect().ok;
const APP_DIR = path.resolve(__dirname, '..');
const TIMEOUT_CLI_MS = 300_000;

/** A fixture C: 1 aula, 2 desafios (impressão + valor) no counter_protocol. */
const FIXTURE_C = path.join(__dirname, 'fixtures', 'tracks', 'trilha-c-minima');

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

interface PlacarCoverage {
  desafios: number;
  passou: number;
  semSolucao: number;
  parseFalhou: number;
  proverFalhou: number;
  ignorados: number;
  naoMedidos: number;
  lacunas: number;
  excessos: number;
}

describe('coverage de C — a trilha-fixture sai do exit 2 fail-closed para o placar honesto', { skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false }, () => {
  it('coverage trilha-c-minima --dir roda, mede os 2 desafios e sai 0', async () => {
    const r = await runEngine(['coverage', 'trilha-c-minima', '--dir', FIXTURE_C]);
    assert.equal(r.code, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /linguagem: c/);
    assert.match(r.stdout, /passou \(solucao minima\) \.+ 2/);
    assert.match(r.stdout, /parse-falhou \.+ 0/);
    assert.match(r.stdout, /NAO MEDIDOS \(soma das 4 acima\) 0/);
    assert.match(r.stdout, /lacunas \(fora do orcamento\) \.+ 0/);
    // O MÍNIMO é código de C: protótipo copiado do teste + printf, átomos do
    // adaptador de C.
    assert.match(r.stdout, /void tela\(void\) \{/);
    assert.match(r.stdout, /printf\("oi\\n"\);/);
    assert.match(r.stdout, /ATOMS COBRADOS \(\d+\).*api:printf.*node:IncludeDirective/);
    assert.doesNotMatch(r.stdout, /não existe sintetizador/);
  });

  it('o --json da mesma trilha traz linguagem c, placar e nenhum nao-medido', async () => {
    const r = await runEngine(['coverage', 'trilha-c-minima', '--dir', FIXTURE_C, '--json']);
    assert.equal(r.code, 0, r.stderr);
    const dados = JSON.parse(r.stdout) as {
      linguagem: string;
      placar: PlacarCoverage;
      desafios: Array<{ status: string; atoms?: string[]; minimalCode?: string }>;
    };
    assert.equal(dados.linguagem, 'c');
    assert.equal(dados.placar.desafios, 2);
    assert.equal(dados.placar.passou, 2);
    assert.equal(dados.placar.naoMedidos, 0);
    assert.equal(dados.placar.lacunas, 0);
    assert.deepEqual(dados.desafios.map((d) => d.status), ['ok', 'ok']);
    for (const d of dados.desafios) {
      assert.ok(d.atoms?.length, 'todo mínimo medido emite átomos');
      assert.ok(!d.minimalCode?.includes('export {}'), 'o mínimo de C não é JavaScript');
    }
  });
});

describe('coverage de C — a trilha REAL c-iniciante roda exit 0/1 (nunca 2)', { skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false }, () => {
  it('coverage c-iniciante mede os desafios do M1 sem abortar por falta de sintetizador', async () => {
    // LEITURA de app/resources/tracks/c-iniciante — o diretório NUNCA é
    // escrito (a compilação roda em mkdtemp do executor endurecido).
    const r = await runEngine(['coverage', 'c-iniciante', '--json']);
    // FALSIFICÁVEL DA ONDA: exit 0/1 — o exit 2 ("não existe sintetizador
    // para c") é exatamente o estado que este trabalho fecha.
    assert.ok(r.code === 0 || r.code === 1, `exit inesperado ${r.code}: stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const dados = JSON.parse(r.stdout) as {
      trilha: string;
      linguagem: string;
      placar: PlacarCoverage;
      desafios: Array<{ ref: string; status: string; detail?: string }>;
    };
    assert.equal(dados.trilha, 'c-iniciante');
    assert.equal(dados.linguagem, 'c');
    // NADA de falha de FERRAMENTA: parse-falhou e prover-falhou são defeito de
    // engine, não de conteúdo — têm de ser 0 sempre. (sem-solucao/ignorado são
    // sinais de CONTEÚDO legítimos — sairiam 1, honestos.)
    assert.equal(dados.placar.parseFalhou, 0);
    assert.equal(dados.placar.proverFalhou, 0);
    assert.ok(dados.placar.desafios >= 2, `esperado ≥ 2 desafios, placar: ${JSON.stringify(dados.placar)}`);
    // Os desafios do M1 medidos na onda 4 passam como mínimo sintetizado.
    const medidos = dados.desafios.filter((d) => d.status === 'ok');
    assert.ok(medidos.length >= 2, `esperado ≥ 2 ok, veio: ${JSON.stringify(dados.desafios)}`);
    assert.ok(
      dados.desafios.some((d) => d.ref.endsWith('sua-primeira-janela')),
      'o desafio sua-primeira-janela não apareceu no coverage',
    );
  });
});
