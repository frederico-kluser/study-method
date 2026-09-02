/**
 * tests/runsh-bootstrap.test.ts — run.sh/install.sh: bootstrap idempotente e robusto.
 *
 * Roda os scripts bash REAIS do repositório (copiados para um tmp) com node/npm
 * FALSOS no PATH: nenhum download, nenhuma rede, determinístico. Os fast-paths
 * provados aqui:
 *   - node_modules com marcador .install-ok → `npm ci` NÃO roda de novo;
 *   - skill idêntica na origem×destino → não é recopiada;
 *   - .env.local ausente → criado do example com aviso; presente → nunca sobrescrito;
 *   - node velho → erro claro ANTES de qualquer npm;
 *   - npm ci morto no meio (fake sai 1) → sem marcador; a próxima execução refaz.
 *
 * O marcador node_modules/.install-ok é a prova de instalação COMPLETA: um npm ci
 * interrompido deixa a pasta pela metade — pasta presente ≠ instalado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, cp } from 'node:fs/promises';
import * as path from 'node:path';
import { fileExists, mkTempDir, readFile, writeFile } from './_helpers/fs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

interface FakeProjectOptions {
  /** Versão que o `node --version` falso responde. Ex.: 'v22.14.0'. */
  nodeVersion: string;
  /** Resposta do `node -p '<checagem de versão>'` falso: 'ok' ou 'old'. */
  nodeOk: 'ok' | 'old';
  /** Exit code inicial do `npm ci` falso (0 = sucesso, 1 = morre no meio). */
  npmExit: 0 | 1;
  /** 'absent' = sem node_modules · 'partial' = pasta existe SEM marcador · 'ok' = completa. */
  nodeModules: 'absent' | 'partial' | 'ok';
  /** app/.env.local já existe? */
  envLocal: boolean;
  /** Destino da skill (CLAUDE_SKILLS_DIR) já tem uma cópia idêntica à origem? */
  skillDest: boolean;
}

interface FakeProject {
  root: string;
  app: string;
  fakeBin: string;
  skillsDest: string;
  npmExitFile: string;
  npmLog: string;
  runDevLog: string;
  /** Roda `bash <script>` na raiz do projeto falso com o PATH/node/npm falsos. */
  run(script: string, extraEnv?: Record<string, string>): { status: number | null; stdout: string; stderr: string };
  /** Troca o exit code do `npm ci` falso (para simular retry em outra execução). */
  setNpmExit(code: 0 | 1): Promise<void>;
}

const SKILL_SRC = '---\nname: study-method\n---\n# study-method — tutor (mínimo p/ teste).\n';
const EXAMPLE_ENV = '# example\nOPENROUTER_API_KEY=\nBRAVE_API_KEY=\n';

async function writeFakeNode(binDir: string, version: string, nodeOk: string): Promise<void> {
  const script = `#!/usr/bin/env bash
# fake node — simulacão determinística das chamadas que run.sh/install.sh fazem.
if [ "\${1:-}" = "--version" ]; then
  echo "${version}"
  exit 0
fi
if [ "\${1:-}" = "-p" ]; then
  case "\$2" in
    *process.versions.node*) echo "${nodeOk}" ;;
    *) echo "undefined" ;;
  esac
  exit 0
fi
echo "fake node: chamada não simulada: $*" >&2
exit 1
`;
  await writeFile(path.join(binDir, 'node'), script);
  await chmod(path.join(binDir, 'node'), 0o755);
}

async function writeFakeNpm(binDir: string, logPath: string, exitFile: string): Promise<void> {
  const script = `#!/usr/bin/env bash
# fake npm — registra a chamada e simula o resultado de um npm ci.
# O exit code vem de um arquivo (o teste troca o arquivo p/ simular retry).
echo "npm ci called" >> "${logPath}"
prefix=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) prefix="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ -n "$prefix" ]; then
  # como um npm ci de verdade: remove node_modules inteiro e reinstala do zero
  rm -rf -- "$prefix/node_modules"
  mkdir -p -- "$prefix/node_modules"
fi
code="\$(cat "${exitFile}" 2>/dev/null || echo 0)"
exit "\$code"
`;
  await writeFile(path.join(binDir, 'npm'), script);
  await chmod(path.join(binDir, 'npm'), 0o755);
}

async function writeFakeRunDev(appDir: string, logPath: string): Promise<void> {
  const script = `#!/usr/bin/env bash
# fake run-dev — prova que o app foi delegado.
echo "run-dev called" >> "${logPath}"
exit 0
`;
  await writeFile(path.join(appDir, 'run-dev.sh'), script);
  await chmod(path.join(appDir, 'run-dev.sh'), 0o755);
}

async function makeFakeProject(o: FakeProjectOptions): Promise<FakeProject> {
  const base = await mkTempDir('runsh-bootstrap-');
  const root = path.join(base, 'proj');
  const app = path.join(root, 'app');
  await writeFile(path.join(root, 'tools', 'check-env.sh'), '');
  await writeFile(path.join(root, 'skills', 'study-method', 'SKILL.md'), SKILL_SRC);

  // scripts reais do repositório (copiados, não editados)
  await cp(path.join(REPO_ROOT, 'run.sh'), path.join(root, 'run.sh'));
  await chmod(path.join(root, 'run.sh'), 0o755);
  await cp(path.join(REPO_ROOT, 'install.sh'), path.join(root, 'install.sh'));
  await chmod(path.join(root, 'install.sh'), 0o755);
  await cp(path.join(REPO_ROOT, 'tools', 'check-env.sh'), path.join(root, 'tools', 'check-env.sh'));

  // app mínimo
  await writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'fake-app', version: '0.0.1' }));
  await writeFile(
    path.join(app, 'package-lock.json'),
    JSON.stringify({ name: 'fake-app', version: '0.0.1', lockfileVersion: 3, packages: {} }),
  );
  await writeFile(path.join(app, '.env.local.example'), EXAMPLE_ENV);
  if (o.envLocal) {
    await writeFile(path.join(app, '.env.local'), EXAMPLE_ENV);
  }

  // node_modules conforme o cenário
  if (o.nodeModules !== 'absent') {
    await writeFile(path.join(app, 'node_modules', '.keep'), '');
    if (o.nodeModules === 'ok') {
      await writeFile(path.join(app, 'node_modules', '.install-ok'), 'ok\n');
    }
    // 'partial' = pasta existe SEM o marcador (npm ci morto no meio)
  }

  // destino da skill já instalado?
  const skillsDest = path.join(base, 'claude-skills');
  if (o.skillDest) {
    await writeFile(path.join(skillsDest, 'study-method', 'SKILL.md'), SKILL_SRC);
  }

  // fakes no PATH
  const fakeBin = path.join(base, 'bin');
  await writeFakeNode(fakeBin, o.nodeVersion, o.nodeOk);
  const npmLog = path.join(base, 'npm.log');
  const npmExitFile = path.join(base, 'npm-exit');
  await writeFile(npmExitFile, String(o.npmExit));
  await writeFakeNpm(fakeBin, npmLog, npmExitFile);
  const runDevLog = path.join(base, 'run-dev.log');
  await writeFakeRunDev(app, runDevLog);

  return {
    root,
    app,
    fakeBin,
    skillsDest,
    npmExitFile,
    npmLog,
    runDevLog,
    run(script: string, extraEnv: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
      const res = spawnSync('bash', [script], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          CLAUDE_SKILLS_DIR: skillsDest,
          ...extraEnv,
        },
        encoding: 'utf8',
      });
      return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
    },
    async setNpmExit(code: 0 | 1): Promise<void> {
      await writeFile(npmExitFile, String(code));
    },
  };
}

async function npmCalls(p: FakeProject): Promise<string[]> {
  try {
    const log = await readFile(p.npmLog);
    return log.split('\n').filter((l) => l.trim() !== '');
  } catch {
    return [];
  }
}

describe('run.sh — bootstrap automático', () => {
  it('clone sem node_modules: instala (npm ci), instala a skill, cria .env.local do example e sobe o app', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 0,
      nodeModules: 'absent',
      envLocal: false,
      skillDest: false,
    });
    const r = p.run('run.sh');
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout + r.stderr;
    assert.match(out, /instalando dependências/);
    assert.match(out, /preencha as chaves/);
    assert.match(out, /Skill: instalada por cópia/);
    // npm ci rodou e o marcador de instalação COMPLETA existe
    assert.deepEqual(await npmCalls(p), ['npm ci called']);
    assert.equal(await fileExists(path.join(p.app, 'node_modules', '.install-ok')), true);
    // .env.local criado do example
    assert.equal(await fileExists(path.join(p.app, '.env.local')), true);
    assert.match(await readFile(path.join(p.app, '.env.local')), /OPENROUTER_API_KEY=/);
    // skill instalada no destino
    assert.equal(await fileExists(path.join(p.skillsDest, 'study-method', 'SKILL.md')), true);
    // app foi delegado para run-dev.sh
    assert.match(await readFile(p.runDevLog), /run-dev called/);
  });

  it('segunda execução: no-op rápido — sem npm ci, sem recopiar skill, sem recriar .env.local', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 0,
      nodeModules: 'ok',
      envLocal: true,
      skillDest: true,
    });
    // sentinelas: provam que nada é re-copiado/sobrescrito
    await writeFile(path.join(p.skillsDest, 'study-method', '.sentinel'), 'x');
    await writeFile(path.join(p.app, '.env.local'), '# sentinela do usuário\nOPENROUTER_API_KEY=valor\n');
    const r = p.run('run.sh');
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout + r.stderr;
    assert.doesNotMatch(out, /instalando dependências/);
    assert.doesNotMatch(out, /instalada por cópia/);
    // npm NUNCA foi chamado
    assert.deepEqual(await npmCalls(p), []);
    // skill não recopiada — o sentinela dentro do destino sobreviveu
    assert.equal(await readFile(path.join(p.skillsDest, 'study-method', '.sentinel')), 'x');
    // .env.local não recriado — o sentinela do usuário sobreviveu
    assert.match(await readFile(path.join(p.app, '.env.local')), /sentinela do usuário/);
    // app foi delegado
    assert.match(await readFile(p.runDevLog), /run-dev called/);
  });

  it('node velho: erro claro ANTES de qualquer download — npm nunca é chamado, app não sobe', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v20.10.0',
      nodeOk: 'old',
      npmExit: 0,
      nodeModules: 'absent',
      envLocal: false,
      skillDest: false,
    });
    const r = p.run('run.sh');
    assert.notEqual(r.status, 0);
    const out = r.stdout + r.stderr;
    assert.match(out, /velho demais/);
    assert.match(out, /22\.13/);
    assert.deepEqual(await npmCalls(p), []);
    assert.equal(await fileExists(p.runDevLog), false);
  });

  it('node/npm ausentes do PATH: erro claro antes de qualquer download', async (t) => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 0,
      nodeModules: 'absent',
      envLocal: false,
      skillDest: false,
    });
    // PATH só com diretórios de sistema — sem o fakeBin e sem node/npm reais.
    const slimPath = '/usr/bin:/bin:/usr/sbin:/sbin';
    const probe = spawnSync('bash', ['-c', 'command -v node || command -v npm || true'], {
      env: { ...process.env, PATH: slimPath },
      encoding: 'utf8',
    });
    if ((probe.stdout ?? '').trim() !== '') {
      t.skip(`não dá para simular ausência nesta máquina (node/npm existem em ${slimPath})`);
      return;
    }
    const r = p.run('run.sh', { PATH: slimPath });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /faltam node\/npm/);
    assert.deepEqual(await npmCalls(p), []);
    assert.equal(await fileExists(p.runDevLog), false);
  });
});

describe('install.sh — idempotência', () => {
  it('com tudo instalado: não recopia a skill, não roda npm ci, não recria .env.local', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 0,
      nodeModules: 'ok',
      envLocal: true,
      skillDest: true,
    });
    await writeFile(path.join(p.skillsDest, 'study-method', '.sentinel'), 'x');
    const r = p.run('install.sh');
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout + r.stderr;
    assert.match(out, /Skill: já instalada/);
    assert.match(out, /dependências já instaladas/);
    assert.deepEqual(await npmCalls(p), []);
    assert.equal(await readFile(path.join(p.skillsDest, 'study-method', '.sentinel')), 'x');
  });

  it('sem node_modules: roda npm ci e escreve o marcador .install-ok', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 0,
      nodeModules: 'absent',
      envLocal: false,
      skillDest: false,
    });
    const r = p.run('install.sh');
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.deepEqual(await npmCalls(p), ['npm ci called']);
    assert.equal(await fileExists(path.join(p.app, 'node_modules', '.install-ok')), true);
    assert.equal(await fileExists(path.join(p.app, '.env.local')), true);
    assert.equal(await fileExists(path.join(p.skillsDest, 'study-method', 'SKILL.md')), true);
  });

  it('skill com diferença na origem: recopia (sincroniza o destino com a origem)', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 0,
      nodeModules: 'ok',
      envLocal: true,
      skillDest: true,
    });
    // destino diverge da origem → tem que recopiar
    await writeFile(path.join(p.skillsDest, 'study-method', 'SKILL.md'), '---\nname: study-method\n---\n# versão antiga\n');
    const r = p.run('install.sh');
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout + r.stderr, /instalada por cópia/);
    assert.doesNotMatch(await readFile(path.join(p.skillsDest, 'study-method', 'SKILL.md')), /versão antiga/);
    assert.deepEqual(await npmCalls(p), []);
  });

  it('node velho: erro claro antes do npm ci', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v20.10.0',
      nodeOk: 'old',
      npmExit: 0,
      nodeModules: 'absent',
      envLocal: false,
      skillDest: false,
    });
    const r = p.run('install.sh');
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /velho demais/);
    assert.deepEqual(await npmCalls(p), []);
  });
});

describe('instalação morta no meio — sem estado quebrado irreversível', () => {
  it('npm ci falha: pasta pela metade SEM marcador; a próxima execução refaz e completa', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 1,
      nodeModules: 'absent',
      envLocal: false,
      skillDest: false,
    });
    // 1ª tentativa: npm ci morre no meio
    const r1 = p.run('install.sh');
    assert.notEqual(r1.status, 0);
    assert.deepEqual(await npmCalls(p), ['npm ci called']);
    // estado pós-falha: node_modules existe (pela metade) MAS sem o marcador
    assert.equal(await fileExists(path.join(p.app, 'node_modules')), true);
    assert.equal(await fileExists(path.join(p.app, 'node_modules', '.install-ok')), false);

    // 2ª tentativa (disco ok): o install.sh refaz o ci do zero e completa
    await p.setNpmExit(0);
    const r2 = p.run('install.sh');
    assert.equal(r2.status, 0, `stderr: ${r2.stderr}`);
    assert.deepEqual(await npmCalls(p), ['npm ci called', 'npm ci called']);
    assert.equal(await fileExists(path.join(p.app, 'node_modules', '.install-ok')), true);
  });

  it('run.sh com node_modules pela metade (sem marcador): refaz a instalação antes de subir', async () => {
    const p = await makeFakeProject({
      nodeVersion: 'v22.14.0',
      nodeOk: 'ok',
      npmExit: 0,
      nodeModules: 'partial',
      envLocal: true,
      skillDest: true,
    });
    const r = p.run('run.sh');
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // npm ci RODOU de novo (o fast-path NÃO confia em pasta existente sem marcador)
    assert.deepEqual(await npmCalls(p), ['npm ci called']);
    assert.equal(await fileExists(path.join(p.app, 'node_modules', '.install-ok')), true);
    assert.match(await readFile(p.runDevLog), /run-dev called/);
  });
});
