/**
 * cx-scripts-fixtures/harness.ts — infraestrutura dos testes de CARACTERIZAÇÃO
 * `app/tests/cx-scripts-*.test.ts`.
 *
 * Estes testes pinam o comportamento OBSERVÁVEL (exit code · stdout/stderr ·
 * artefatos em disco) dos scripts shell/python do repositório, para que a
 * refatoração em ondas seguintes tenha uma rede de segurança. Nenhum teste lê
 * o interior dos scripts: só invoca `bash <script>` / `python3 <script>` e olha
 * o que sai pela fronteira pública (docs/00-contratos.md §5, §7, §8).
 *
 * Toda execução roda com:
 *   - `STUDY_METHOD_HOME` apontando para tmp próprio (nunca $HOME real);
 *   - `STUDY_METHOD_TODAY`/`STUDY_METHOD_NOW` fixos (determinismo, §4.4);
 *   - `cwd` em tmp próprio (mktemp -d /tmp/do-cxsh-XXXX);
 *   - rede nenhuma, sudo nenhum, escrita fora de tmp nenhuma.
 */
import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { mkTempDir, writeFile, readFile, fileExists } from '../_helpers/fs';

/** Raiz do repositório (worktree): app/tests/cx-scripts-fixtures/ → ../../.. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
export const SCRIPTS_DIR = path.join(REPO_ROOT, 'skills', 'study-method', 'scripts');
export const LIB_DIR = path.join(SCRIPTS_DIR, 'lib');
export const TESTS_DIR = path.join(REPO_ROOT, 'tests');
export const TOOLS_DIR = path.join(REPO_ROOT, 'tools');
export const EVALS_DIR = path.join(REPO_ROOT, 'evals');

/** Datas fixas de determinismo (§4.4: STUDY_METHOD_TODAY / STUDY_METHOD_NOW). */
export const FIXED_TODAY = '2026-01-15';
export const FIXED_NOW = '2026-01-15T10:00:00-03:00';

/** Hostname fixo para os testes de lock (o predicado compara hostname ANTES de pid/TTL). */
export const FIXTURE_HOSTNAME = 'cx-test-host';

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunOpts {
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
}

function baseEnv(studyHome: string, extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    STUDY_METHOD_HOME: studyHome,
    STUDY_METHOD_TODAY: FIXED_TODAY,
    STUDY_METHOD_NOW: FIXED_NOW,
    HOSTNAME: FIXTURE_HOSTNAME,
    LC_ALL: 'C',
    ...extra,
  };
}

/** `bash <scriptAbs> <args…>` com env/cwd determinísticos. */
export function runBashFile(scriptAbs: string, args: string[], studyHome: string, opts: RunOpts = {}): RunResult {
  const res = spawnSync('bash', [scriptAbs, ...args], {
    cwd: opts.cwd ?? os.tmpdir(),
    env: baseEnv(studyHome, opts.env),
    encoding: 'utf8',
    input: opts.input,
    timeout: 120_000,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** `python3 <scriptAbs> <args…>` — para render-plot.py e lib/_mutate.py. */
export function runPythonFile(scriptAbs: string, args: string[], studyHome: string, opts: RunOpts = {}): RunResult {
  const res = spawnSync('python3', [scriptAbs, ...args], {
    cwd: opts.cwd ?? os.tmpdir(),
    env: baseEnv(studyHome, opts.env),
    encoding: 'utf8',
    input: opts.input,
    timeout: 120_000,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** `bash -c '<código>'` com env determinístico — para `source` de lib/*.sh. */
export function runBashCode(code: string, studyHome: string, opts: RunOpts = {}): RunResult {
  const res = spawnSync('bash', ['-c', code], {
    cwd: opts.cwd ?? os.tmpdir(),
    env: baseEnv(studyHome, opts.env),
    encoding: 'utf8',
    input: opts.input,
    timeout: 120_000,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** `source lib/<lib>.sh` + código livre. Assume `set -u` (LIB-5). */
export function runLib(lib: string, code: string, studyHome: string, opts: RunOpts = {}): RunResult {
  const libPath = path.join(LIB_DIR, lib);
  return runBashCode(`set -u; . "${libPath}"; ${code}`, studyHome, opts);
}

/** setup.json mínimo que satisfaz os scripts sob teste (§3.2 + setup-manifest). */
export function setupJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      schema_version: '1.0',
      setup_id: '0123456789ab',
      setup_name: 'teste-unitario',
      title: 'Setup de teste',
      subject: 'calculo',
      taxonomy: ['calculo'],
      language: { name: 'python', chosen_at: '2026-01-01T10:00:00-03:00' },
      theory_source: 'student_provided',
      session_minutes: 50,
      created_at: '2026-01-01T10:00:00-03:00',
      updated_at: '2026-01-01T10:00:00-03:00',
      session_count: 0,
      decisions: {},
      privacy: { cross_read: 'ask' },
      skill_level: 'beginner',
      ...overrides,
    },
    null,
    2,
  );
}

export interface Sandbox {
  /** tmp raiz (cwd de trabalho dos testes). */
  dir: string;
  /** STUDY_METHOD_HOME próprio (estado global isolado, §3.3). */
  home: string;
  /** <dir>/setup — um setup válido com setup.json (memória vazia). */
  setup: string;
  /** Roda um script de SK/scripts/ pelo nome. */
  script(name: string, args: string[], opts?: RunOpts): RunResult;
  /** Roda um arquivo arbitrário do repo (tests/, tools/, evals/, raiz). */
  file(abs: string, args: string[], opts?: RunOpts): RunResult;
  /** Roda python3 num script do repo. */
  python(abs: string, args: string[], opts?: RunOpts): RunResult;
  /** `source` de lib/<lib> + código. */
  lib(libName: string, code: string, opts?: RunOpts): RunResult;
  /** bash -c livre, com o env do sandbox. */
  sh(code: string, opts?: RunOpts): RunResult;
  write(rel: string, content: string): Promise<string>;
  read(rel: string): Promise<string>;
  exists(rel: string): Promise<boolean>;
  rm(): Promise<void>;
}

/** Cria um sandbox: tmp de trabalho + STUDY_METHOD_HOME + setup mínimo. */
export async function makeSandbox(withSetup = true): Promise<Sandbox> {
  const dir = await mkTempDir('do-cxsh-');
  const home = await mkTempDir('do-cxsh-home-');
  const setup = path.join(dir, 'setup');
  if (withSetup) {
    await fsp.mkdir(setup, { recursive: true });
    await writeFile(path.join(setup, 'setup.json'), setupJson());
  }
  const abs = (rel: string): string => (path.isAbsolute(rel) ? rel : path.join(dir, rel));
  return {
    dir,
    home,
    setup,
    script: (name, args, opts = {}) => runBashFile(path.join(SCRIPTS_DIR, name), args, home, { cwd: dir, ...opts }),
    file: (p, args, opts = {}) => runBashFile(abs(p), args, home, { cwd: dir, ...opts }),
    python: (p, args, opts = {}) => runPythonFile(abs(p), args, home, { cwd: dir, ...opts }),
    lib: (libName, code, opts = {}) => runLib(libName, code, home, { cwd: dir, ...opts }),
    sh: (code, opts = {}) => runBashCode(code, home, { cwd: dir, ...opts }),
    write: async (rel, content) => {
      const p = abs(rel);
      await writeFile(p, content);
      return p;
    },
    read: (rel) => readFile(abs(rel)),
    exists: (rel) => fileExists(abs(rel)),
    rm: () => fsp.rm(dir, { recursive: true, force: true }).then(() => fsp.rm(home, { recursive: true, force: true })),
  };
}

export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
