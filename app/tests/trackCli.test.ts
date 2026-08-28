/**
 * tests/trackCli.test.ts — SMOKE do CLI de autoria (tools/track-cli.ts) como
 * SUBPROCESSO REAL (child_process + tsx), fechando o gap F6: `track:validate`
 * verifica desafios MULTI-ARQUIVO (aula) E de MÓDULO — caminho completo que o
 * teste unitário não cobre: JSON no disco → loader → challengePairFromSource
 * (files[] → solutionFiles/starterFiles) → provas de execução por `node --test`
 * real. Sem jsdom, sem electron.
 *
 * O CLI resolve TRACKS_DIR fixo em app/resources/tracks (path.resolve do
 * __dirname) — não há env var de override. A trilha fixture nasce num dir
 * temporário em tmp e é COPIADA para app/resources/tracks/<slug> só para a
 * execução; o finally remove o tmp E a cópia — o git fica limpo e nenhum
 * conteúdo de trilha versionado é tocado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const APP_DIR = path.resolve(__dirname, '..');
const TRACKS_DIR = path.join(APP_DIR, 'resources', 'tracks');

const MODULE_SLUG = 'modulo-1';
const LESSON_SLUG = 'aula-1';
const LESSON_CHALLENGE = 'desafio-aula';
const MODULE_CHALLENGE = 'desafio-modulo';

/** Roda `npx tsx tools/track-cli.ts <args...>` com cwd = app (subprocesso REAL). */
function runCli(args: string[], timeoutMs: number, envOver: NodeJS.ProcessEnv = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // NODE_TEST_CONTEXT é setado pelo node:test do processo PAI; herdado pelo
    // filho, faria o node:test DO CLI pular os testes (mesma armadilha que o
    // nodeExec do challengeExec remove). Remover sempre.
    const env = { ...process.env, ...envOver };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn('npx', ['--no-install', 'tsx', 'tools/track-cli.ts', ...args], {
      cwd: APP_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
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

/** Roda `npx tsx tools/track-cli.ts track:validate <slug>` com cwd = app. */
function runTrackValidate(slug: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return runCli(['track:validate', slug], timeoutMs);
}

async function writeJson(dir: string, file: string, data: unknown): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * Trilha fixture mínima e VÁLIDA para o loader: um módulo com UMA aula
 * (desafio multi-arquivo) + UM desafio de módulo multi-arquivo. Código real
 * que passa (solução) / que falha (starter throw) — as provas de execução do
 * validate exigem os dois lados.
 */
async function writeTrackFixtures(trackDir: string, slug: string): Promise<void> {
  await writeJson(trackDir, 'track.json', {
    schemaVersion: 1,
    slug,
    title: 'Smoke F6',
    description: 'Trilha temporária do smoke do CLI.',
    language: 'pt-BR',
    domain: 'programming',
    modules: [MODULE_SLUG],
  });
  await writeJson(path.join(trackDir, 'modules', MODULE_SLUG), 'module.json', {
    schemaVersion: 1,
    slug: MODULE_SLUG,
    title: 'Módulo 1',
    order: 1,
    lessons: [LESSON_SLUG],
    challenge: MODULE_CHALLENGE,
  });
  await writeJson(path.join(trackDir, 'modules', MODULE_SLUG, 'lessons', LESSON_SLUG), 'lesson.json', {
    schemaVersion: 1,
    slug: LESSON_SLUG,
    title: 'Aula 1',
    summary: 'Resumo.',
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: [],
    theory: [{ id: 's1', title: 'Seção 1', markdown: 'Texto da seção.' }],
    sources: [],
    challenges: [LESSON_CHALLENGE],
  });
  await writeJson(
    path.join(trackDir, 'modules', MODULE_SLUG, 'lessons', LESSON_SLUG, 'challenges', LESSON_CHALLENGE),
    'challenge.json',
    {
      schemaVersion: 1,
      slug: LESSON_CHALLENGE,
      title: 'Desafio da aula',
      concept: 'variaveis',
      difficulty: 2,
      language: 'nodejs',
      statement: '# Desafio da aula\n\nImplemente soma e multiplica.',
      files: [
        {
          path: 'lib/soma.mjs',
          starterCode: 'export function soma(a, b) { throw new Error("não implementado"); }',
          solutionCode: 'export function soma(a, b) { return a + b; }',
        },
        {
          path: 'lib/multiplica.mjs',
          starterCode: 'export function multiplica(a, b) { throw new Error("não implementado"); }',
          solutionCode: 'export function multiplica(a, b) { return a * b; }',
        },
      ],
      testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soma } from './lib/soma.mjs';
import { multiplica } from './lib/multiplica.mjs';
test('soma 2+3', () => { assert.equal(soma(2, 3), 5); });
test('multiplica 2*3', () => { assert.equal(multiplica(2, 3), 6); });
`,
      expectedTestCount: 2,
    },
  );
  await writeJson(path.join(trackDir, 'modules', MODULE_SLUG, 'challenges', MODULE_CHALLENGE), 'challenge.json', {
    schemaVersion: 1,
    slug: MODULE_CHALLENGE,
    title: 'Desafio do módulo',
    concept: 'variaveis',
    difficulty: 3,
    language: 'nodejs',
    statement: '# Desafio do módulo\n\nImplemente dobra e triplica.',
    files: [
      {
        path: 'lib/dobra.mjs',
        starterCode: 'export function dobra(x) { throw new Error("não implementado"); }',
        solutionCode: 'export function dobra(x) { return x * 2; }',
      },
      {
        path: 'lib/triplica.mjs',
        starterCode: 'export function triplica(x) { throw new Error("não implementado"); }',
        solutionCode: 'export function triplica(x) { return x * 3; }',
      },
    ],
    testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dobra } from './lib/dobra.mjs';
import { triplica } from './lib/triplica.mjs';
test('dobra 2', () => { assert.equal(dobra(2), 4); });
test('triplica 3', () => { assert.equal(triplica(3), 9); });
`,
    expectedTestCount: 2,
  });
}

describe('CLI de autoria — track:validate (smoke de subprocesso, F6)', () => {
  it('valida trilha com aula multi-arquivo E desafio de módulo multi-arquivo (exit 0 + verificado ✓)', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'track-cli-smoke-'));
    // slug kebab-case único (SLUG_RE do loader) — evita colisão com rodadas
    // paralelas do mesmo teste.
    const slug = `smoke-f6-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const target = path.join(TRACKS_DIR, slug);
    try {
      await writeTrackFixtures(tmp, slug);
      await fs.cp(tmp, target, { recursive: true });
      const r = await runTrackValidate(slug, 60_000);
      assert.equal(r.code, 0, `exit 0 esperado — stdout:\n${r.stdout}\n--- stderr:\n${r.stderr}`);
      assert.ok(r.stdout.includes('✓ trilha'), `cabeçalho da trilha ausente — stdout:\n${r.stdout}`);
      assert.ok(
        r.stdout.includes(`[${MODULE_SLUG}/${LESSON_SLUG}] ${LESSON_CHALLENGE}: verificado ✓`),
        `aula multi-arquivo não verificada — stdout:\n${r.stdout}`,
      );
      assert.ok(
        r.stdout.includes(`[${MODULE_SLUG}/module] ${MODULE_CHALLENGE}: verificado ✓`),
        `desafio de módulo multi-arquivo não verificado — stdout:\n${r.stdout}`,
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ─── ONDA 2 (autoria): track:new --criteria + track:challenge:context ────────
// O CLI escreve em app/resources/tracks/<slug> (TRACKS_DIR fixo) — o teste
// cria slugs únicos e limpa no finally (mesmo padrão do smoke de validate).

describe('CLI de autoria — track:new com --criteria (ONDA 2)', () => {
  async function runTrackNew(
    slug: string,
    extra: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return runCli(['track:new', slug, '--title', 'Trilha Critérios', '--description', 'Desc.', ...extra], 60_000);
  }

  it('--criteria "a; b; c" grava entryCriteria no track.json (split por ;, trim, filtra vazios)', async () => {
    const slug = `cli-crit-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const target = path.join(TRACKS_DIR, slug);
    try {
      const r = await runTrackNew(slug, ['--criteria', 'Aritmética básica;  ; Ler enunciados']);
      assert.equal(r.code, 0, `exit 0 esperado — stderr:\n${r.stderr}`);
      const track = JSON.parse(await fs.readFile(path.join(target, 'track.json'), 'utf8')) as Record<string, unknown>;
      assert.deepEqual(track.entryCriteria, ['Aritmética básica', 'Ler enunciados'], 'split/trim/filtro de vazios');
    } finally {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('sem --criteria → track.json SEM o campo entryCriteria (trilha de senso iniciante)', async () => {
    const slug = `cli-semcrit-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const target = path.join(TRACKS_DIR, slug);
    try {
      const r = await runTrackNew(slug, []);
      assert.equal(r.code, 0, `exit 0 esperado — stderr:\n${r.stderr}`);
      const track = JSON.parse(await fs.readFile(path.join(target, 'track.json'), 'utf8')) as Record<string, unknown>;
      assert.equal('entryCriteria' in track, false, 'campo ausente sem a flag');
    } finally {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('CLI de autoria — track:challenge:context (ONDA 2)', () => {
  it('sem DEEPSEEK_API_KEY → erro claro "DEEPSEEK_API_KEY não definida" e exit 1 (não chega à rede)', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'track-cli-ctx-'));
    const slug = `cli-ctx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const target = path.join(TRACKS_DIR, slug);
    try {
      await writeTrackFixtures(tmp, slug);
      await fs.cp(tmp, target, { recursive: true });
      // chave FORA do ambiente do filho — o fluxo real com LLM fica para a
      // onda 2.2 (evidência: este teste prova o gate + o erro estruturado).
      const r = await runCli(
        ['track:challenge:context', slug, MODULE_SLUG, LESSON_SLUG, LESSON_CHALLENGE],
        30_000,
        { DEEPSEEK_API_KEY: '' },
      );
      assert.equal(r.code, 1, `exit 1 esperado — stdout:\n${r.stdout}\n--- stderr:\n${r.stderr}`);
      assert.ok(r.stderr.includes('DEEPSEEK_API_KEY não definida'), `erro claro esperado — stderr:\n${r.stderr}`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
      await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
  });
});
