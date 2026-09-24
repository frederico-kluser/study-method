/**
 * tests/cx-cli-engine-modos.test.ts — CARACTERIZAÇÃO (golden master) dos MODOS
 * do CLI da engine (`app/tools/track-engine/cli.ts`): `generate`, `repair`,
 * `reorder`, `gap`, `convergir` e `lint-schemas`.
 *
 * Contrato congelado (docs/00-contratos.md §8.1, docs/16-engine-de-trilha.md
 * §8): exit `0` sem violação · `1` violações encontradas · `2` uso incorreto /
 * barreira estrutural. SEM REDE, SEM LLM real e SEM chaves: os caminhos LLM são
 * testados só na RECUSA com env limpa (`generate` → `erro estruturado
 * [SEM_CHAVE]`; `repair --aplicar` → portão de uso do §6.2 e a guarda
 * `[SEM_CHAVE]` antes do laço; `gap --aplicar` → portão de uso do §6.2), nunca
 * numa chamada real.
 *
 * Os modos de escrita gravam artefato em `content-src/<slug>` (run/ledger/
 * revisão) e, no `--aplicar`, na própria trilha: os testes usam slug ÚNICO,
 * fixture em tmpdir e `finally` apagando — o git da worktree fica limpo.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const APP_DIR = path.resolve(__dirname, '..');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runEngine(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // env limpa PRIMEIRO (sem chaves herdadas do dev), depois o override.
    // Ruído herdado do `npm test` (npm_config_*) faz o `npx` filho imprimir
    // "npm warn/notice" no stderr e contaminar a asserção de mensagem — fora.
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.OPENROUTER_API_KEY;
    delete env.DEEPSEEK_API_KEY;
    delete env.BRAVE_API_KEY;
    delete env.DEEPSEEK_BASE_URL;
    for (const k of Object.keys(env)) {
      if (/^npm_/i.test(k)) delete env[k];
    }
    Object.assign(env, opts.env ?? {});
    const semRuidoNpm = (t: string): string =>
      t
        .split('\n')
        .filter((l) => !/^npm (notice|warn|error)/.test(l))
        .join('\n');
    const child = spawn('npx', ['--no-install', 'tsx', 'tools/track-engine/cli.ts', ...args], {
      cwd: APP_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 180_000);
    child.stdout.on('data', (d: Buffer) => (stdout += String(d)));
    child.stderr.on('data', (d: Buffer) => (stderr += String(d)));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: semRuidoNpm(stdout), stderr: semRuidoNpm(stderr) });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function writeJson(dir: string, file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
  await fs.writeFile(path.join(dir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const TESTS_SOMA =
  "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { soma } from './solution.mjs';\n\ntest('soma 2+3', () => {\n  assert.equal(soma(2, 3), 5);\n});\n";
const TESTS_SUB =
  "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sub } from './solution.mjs';\n\ntest('sub 3-1', () => {\n  assert.equal(sub(3, 1), 2);\n});\n";

/** FIX-BAD: 28 violações (lacunas de currículo) — o gate reprova (exit 1). */
async function buildFixBad(dir: string): Promise<void> {
  await writeJson(dir, 'track.json', {
    schemaVersion: 1,
    slug: 'cx-fix',
    title: 'Fixture CX',
    description: 'Fixture de observação.',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['m1'],
  });
  await writeJson(dir, 'modules/m1/module.json', {
    schemaVersion: 1,
    slug: 'm1',
    title: 'Módulo 1',
    order: 1,
    lessons: ['a1', 'a2'],
  });
  await writeJson(dir, 'modules/m1/lessons/a1/lesson.json', {
    schemaVersion: 1,
    slug: 'a1',
    title: 'Aula 1',
    summary: 'Soma simples.',
    difficulty: 1,
    concepts: ['soma'],
    prerequisites: [],
    theory: [{ id: 't1', title: 'Introdução', markdown: 'Aprenda a somar.\n\n```js\nconst total = 1 + 2;\n```\n' }],
    sources: [],
    challenges: ['c1'],
  });
  await writeJson(dir, 'modules/m1/lessons/a1/challenges/c1/challenge.json', {
    schemaVersion: 1,
    slug: 'c1',
    title: 'Desafio 1',
    concept: 'soma',
    difficulty: 2,
    language: 'nodejs',
    statement: '# Desafio 1\n\nImplemente a soma.',
    starterCode: "export function soma(a, b) {\n  throw new Error('não implementado');\n}\n",
    testsCode: TESTS_SOMA,
    solutionCode: 'export function soma(a, b) {\n  return a + b;\n}\n',
    expectedTestCount: 1,
    minFirstStarMs: 60000,
  });
  await writeJson(dir, 'modules/m1/lessons/a2/lesson.json', {
    schemaVersion: 1,
    slug: 'a2',
    title: 'Aula 2',
    summary: 'Subtração.',
    difficulty: 1,
    concepts: ['subtracao'],
    prerequisites: ['a1'],
    theory: [{ id: 't1', title: 'Introdução', markdown: 'Aprenda a subtrair.\n\n```js\nconst d = 3 - 1;\n```\n' }],
    sources: [],
    challenges: ['c2'],
  });
  await writeJson(dir, 'modules/m1/lessons/a2/challenges/c2/challenge.json', {
    schemaVersion: 1,
    slug: 'c2',
    title: 'Desafio 2',
    concept: 'subtracao',
    difficulty: 2,
    language: 'nodejs',
    statement: '# Desafio 2\n\nImplemente a subtração.',
    starterCode: "export function sub(a, b) {\n  throw new Error('não implementado');\n}\n",
    testsCode: TESTS_SUB,
    solutionCode: 'export function sub(a, b) {\n  return a - b;\n}\n',
    expectedTestCount: 1,
    minFirstStarMs: 60000,
  });
}

/** FIX-CLEAN: zero achados — audit/barra/coverage/requirements/revise saem 0. */
async function buildFixClean(dir: string): Promise<void> {
  await writeJson(dir, 'track.json', {
    schemaVersion: 1,
    slug: 'cx-ok',
    title: 'Fixture CX 2',
    description: 'Fixture de observação v2.',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['m1'],
  });
  await writeJson(dir, 'modules/m1/module.json', {
    schemaVersion: 1,
    slug: 'm1',
    title: 'Módulo 1',
    order: 1,
    lessons: ['a1', 'a2'],
  });
  await writeJson(dir, 'modules/m1/lessons/a1/lesson.json', {
    schemaVersion: 1,
    slug: 'a1',
    title: 'Aula 1',
    summary: 'Função que devolve 5.',
    difficulty: 1,
    concepts: ['funcao'],
    prerequisites: [],
    introduces: {
      productive: ['node:FunctionDeclaration'],
      receptive: ['node:Parameter', 'node:ReturnStatement', 'node:NumericLiteral', 'node:CallExpression'],
    },
    theory: [
      {
        id: 't1',
        title: 'Introdução',
        markdown:
          'Uma função que devolve 5.\n\n```js\nexport function soma(a, b) {\n  return 5;\n}\nsoma(2, 3);\n```\n\nOutra forma de função:\n\n```js\nfunction outra(x) {\n  return x;\n}\n```\n',
      },
      { id: 't2', title: 'Leitura', markdown: 'Leia o código com calma.\n' },
      { id: 't3', title: 'Prática', markdown: 'Agora o exercício.\n' },
    ],
    sources: [],
    challenges: ['c1'],
  });
  await writeJson(dir, 'modules/m1/lessons/a1/challenges/c1/challenge.json', {
    schemaVersion: 1,
    slug: 'c1',
    title: 'Desafio 1',
    concept: 'funcao',
    difficulty: 2,
    language: 'nodejs',
    statement: '# Desafio 1\n\nImplemente a função.',
    starterCode: 'export function soma(a, b) {\n  return 0;\n}\n',
    testsCode: TESTS_SOMA,
    solutionCode: 'export function soma(a, b) {\n  return 5;\n}\n',
    requirements: [{ id: 'REQ-1', teste: 'soma 2+3', descricao: 'Requisito 1.' }],
    expectedTestCount: 1,
    minFirstStarMs: 60000,
  });
  await writeJson(dir, 'modules/m1/lessons/a2/lesson.json', {
    schemaVersion: 1,
    slug: 'a2',
    title: 'Aula 2',
    summary: 'Soma simples.',
    difficulty: 1,
    concepts: ['funcao_dois'],
    prerequisites: ['a1'],
    introduces: { productive: ['node:BinaryExpression', 'op:binary:+'], receptive: [] },
    theory: [
      {
        id: 't1',
        title: 'Introdução',
        markdown:
          'Uma função que soma.\n\n```js\nexport function sub(a, b) {\n  return 2 + 0;\n}\n```\n\nOutra forma de somar:\n\n```js\nfunction mais(a, b) {\n  return a + b;\n}\n```\n',
      },
      { id: 't2', title: 'Prática', markdown: 'Agora o exercício.\n' },
    ],
    sources: [],
    challenges: ['c2'],
  });
  await writeJson(dir, 'modules/m1/lessons/a2/challenges/c2/challenge.json', {
    schemaVersion: 1,
    slug: 'c2',
    title: 'Desafio 2',
    concept: 'funcao_dois',
    difficulty: 2,
    language: 'nodejs',
    statement: '# Desafio 2\n\nImplemente a função.',
    starterCode: 'export function sub(a, b) {\n  return 0;\n}\n',
    testsCode: TESTS_SUB,
    solutionCode: 'export function sub(a, b) {\n  return 2 + 0;\n}\n',
    requirements: [{ id: 'REQ-1', teste: 'sub 3-1', descricao: 'Requisito 1.' }],
    expectedTestCount: 1,
    minFirstStarMs: 60000,
  });
}

let fixBad: string;
let fixClean: string;
let home: string;

before(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'do-cxcli-home-'));
  fixBad = await fs.mkdtemp(path.join(os.tmpdir(), 'do-cxcli-fixbad-'));
  fixClean = await fs.mkdtemp(path.join(os.tmpdir(), 'do-cxcli-fixclean-'));
  await buildFixBad(fixBad);
  await buildFixClean(fixClean);
});

after(async () => {
  for (const d of [fixBad, fixClean, home]) {
    await fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

function envIsolada(): NodeJS.ProcessEnv {
  return { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
}

function slugUnico(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** limpa os artefatos de run que os modos gravam em content-src/<slug>. */
async function limparRun(slug: string): Promise<void> {
  await fs.rm(path.join(APP_DIR, 'content-src', slug), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(APP_DIR, 'resources', 'tracks', slug), { recursive: true, force: true }).catch(() => {});
}

/** digest estável da árvore de uma trilha (`caminho + conteúdo`) — a prova de que NADA foi gravado. */
async function digestArvore(dir: string): Promise<string[]> {
  const saida: string[] = [];
  async function andar(rel: string): Promise<void> {
    for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await andar(r);
      else saida.push(`${r}\n${await fs.readFile(path.join(dir, r), 'utf8')}`);
    }
  }
  await andar('');
  return saida.sort();
}

// ─── portões de USO (exit 2) de todos os modos ───────────────────────────────

describe('engine CLI — modos: portões de uso (caracterização)', () => {
  it('generate: slug/assunto obrigatórios e flags validadas — tudo exit 2 com "erro:" + USAGE', async () => {
    const casos: Array<{ args: string[]; erro: string }> = [
      { args: ['generate'], erro: 'erro: informe o slug da trilha (ex.: npm run engine -- generate javascript-do-zero --assunto "...")' },
      { args: ['generate', 'cx-gen'], erro: 'erro: informe --assunto "..." (o tema da trilha a produzir)' },
      { args: ['generate', 'cx-gen', '--assunto', 'x', '--from', 'WAT'], erro: 'erro: --from invalido: WAT (esperado uma de F0, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12)' },
      { args: ['generate', 'cx-gen', '--assunto', 'x', '--teto-tokens', '0'], erro: 'erro: --teto-tokens invalido: 0 (esperado inteiro ≥ 1)' },
      { args: ['generate', 'cx-gen', '--assunto', 'x', '--familia', 'wat'], erro: 'erro: --familia invalido: wat (esperado uma de sintaxe, estrutura-de-dados, algoritmo, api-runtime, ferramenta)' },
      { args: ['generate', 'cx-gen', '--assunto', 'x', '--rodadas', '0'], erro: 'erro: --rodadas invalido: 0 (esperado inteiro ≥ 1; teto duro 3)' },
      { args: ['generate', 'cx-gen', '--assunto', 'x', '--plataforma', ' '], erro: 'erro: --plataforma vazio (informe o contexto, ex.: "terminal", ou omita a flag)' },
    ];
    for (const caso of casos) {
      const r = await runEngine(caso.args, { env: envIsolada() });
      assert.equal(r.code, 2, `${caso.args.join(' ')} → exit ${r.code}`);
      assert.ok(r.stderr.startsWith(caso.erro), `${caso.args.join(' ')} → ${r.stderr.slice(0, 220)}`);
      assert.ok(r.stderr.includes('uso: npm run engine -- <comando> [args...]'));
    }
  });

  it('generate --linguagem sem adaptador registrado: fail-closed (exit 2) listando os ids aceitos', async () => {
    const r = await runEngine(['generate', 'cx-gen', '--assunto', 'x', '--linguagem', 'wat'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: --linguagem invalido: wat (esperado uma de '), r.stderr.slice(0, 200));
    assert.ok(r.stderr.includes('ids e aliases do registro de adaptadores em engine/lang/registry.ts'));
  });

  it('repair: --aplicar sem --modelo-revisor, --mover/--criar-aulas sem --aplicar e autor==revisor — exit 2', async () => {
    const casos: Array<{ args: string[]; erro: string }> = [
      { args: ['repair'], erro: 'erro: informe o slug da trilha (ex.: npm run engine -- repair minha-trilha)' },
      {
        args: ['repair', 'cx-fix', '--dir', fixBad, '--aplicar'],
        erro: "'repair --aplicar' exige --modelo-revisor <id>",
      },
      { args: ['repair', 'cx-fix', '--dir', fixBad, '--mover'], erro: "'--mover' so vale com --aplicar" },
      { args: ['repair', 'cx-fix', '--dir', fixBad, '--criar-aulas'], erro: "'--criar-aulas' so vale com --aplicar" },
      {
        args: ['repair', 'cx-fix', '--dir', fixBad, '--aplicar', '--modelo-revisor', 'abc', '--modelo-autor', 'abc'],
        erro: 'erro: --modelo-revisor "abc" e igual ao --modelo-autor',
      },
    ];
    for (const caso of casos) {
      const r = await runEngine(caso.args, { env: envIsolada() });
      assert.equal(r.code, 2, `${caso.args.join(' ')} → exit ${r.code}`);
      assert.ok(r.stderr.includes(caso.erro), `${caso.args.join(' ')} → ${r.stderr.slice(0, 220)}`);
    }
  });

  it('reorder/gap/convergir: slug obrigatório; gap --aplicar exige --modelo-revisor; convergir valida --max-iteracoes', async () => {
    const casos: Array<{ args: string[]; erro: string }> = [
      { args: ['reorder'], erro: 'erro: informe o slug da trilha (ex.: npm run engine -- reorder minha-trilha)' },
      { args: ['gap'], erro: 'erro: informe o slug da trilha (ex.: npm run engine -- gap minha-trilha)' },
      { args: ['gap', 'cx-fix', '--dir', fixBad, '--aplicar'], erro: "erro: 'gap --aplicar' exige --modelo-revisor <id>" },
      { args: ['convergir'], erro: 'erro: informe o slug da trilha (ex.: npm run engine -- convergir rust-iniciante)' },
      {
        args: ['convergir', 'cx-fix', '--dir', fixBad, '--max-iteracoes', '0'],
        erro: 'erro: --max-iteracoes invalido: 0 (esperado inteiro >= 1). Sem a flag NAO HA TETO',
      },
    ];
    for (const caso of casos) {
      const r = await runEngine(caso.args, { env: envIsolada() });
      assert.equal(r.code, 2, `${caso.args.join(' ')} → exit ${r.code}`);
      assert.ok(r.stderr.startsWith(caso.erro), `${caso.args.join(' ')} → ${r.stderr.slice(0, 220)}`);
    }
  });
});

// ─── generate ────────────────────────────────────────────────────────────────

describe('engine CLI — generate (caracterização, só recusa sem chave)', () => {
  it('env limpa: o run nasce RETOMÁVEL e o erro é ESTRUTURADO [SEM_CHAVE] com exit 2 — nunca chamada de rede', async () => {
    const slug = slugUnico('cx-gen');
    try {
      const r = await runEngine(['generate', slug, '--assunto', 'observação offline'], {
        env: envIsolada(),
        timeoutMs: 180_000,
      });
      assert.equal(r.code, 2);
      assert.ok(
        r.stderr.includes('erro estruturado [SEM_CHAVE] na fase F0'),
        r.stderr.slice(0, 500),
      );
      assert.ok(
        r.stderr.includes(`o run ficou INTACTO e RETOMAVEL em ${path.join(APP_DIR, 'content-src', slug)}${path.sep}run.json`),
        r.stderr.slice(0, 700),
      );
      assert.ok(existsSync(path.join(APP_DIR, 'content-src', slug, 'run.json')), 'run.json do run retomável ausente');
      // sem --modelo-revisor a F10 NÃO é fiada — e a limitação sai DECLARADA.
      assert.ok(
        r.stdout.includes('F10: laco de revisao NAO fiado — passe --modelo-revisor <id> para liga-lo'),
        r.stdout.slice(0, 400),
      );
    } finally {
      await limparRun(slug);
    }
  });

  it('--modelo-revisor fiaria o laço (declarado na saída) — e a recusa por SEM_CHAVE continua exit 2', async () => {
    const slug = slugUnico('cx-gen');
    try {
      const r = await runEngine(
        ['generate', slug, '--assunto', 'observação offline', '--modelo-revisor', 'outro/modelo'],
        { env: envIsolada(), timeoutMs: 180_000 },
      );
      assert.equal(r.code, 2);
      assert.ok(
        r.stdout.includes('F10: laco de revisao FIADO — autor=z-ai/glm-5.3-flash revisor=outro/modelo'),
        r.stdout.slice(0, 400),
      );
      assert.ok(r.stderr.includes('erro estruturado [SEM_CHAVE]'), r.stderr.slice(0, 300));
    } finally {
      await limparRun(slug);
    }
  });
});

// ─── repair ──────────────────────────────────────────────────────────────────

describe('engine CLI — repair (caracterização)', () => {
  it('FIX-CLEAN dry-run --json: exit 0, zero LLM, zero escrita, placar zero', async () => {
    const r = await runEngine(['repair', 'cx-ok', '--dir', fixClean, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    for (const k of [
      'auditInicial',
      'bloqueios',
      'declaracoes',
      'escritos',
      'lacunasNaoResolvidas',
      'llmChamado',
      'loopRodado',
      'modo',
      'movimentacao',
      'placarInicial',
      'plano',
      'slug',
      'subFluxoDeLacuna',
    ]) {
      assert.ok(k in rel, `repair sem a chave ${k}`);
    }
    assert.equal(rel.modo, 'dry-run');
    assert.equal(rel.llmChamado, false);
    assert.deepEqual(rel.escritos, []);
    assert.deepEqual(rel.placarInicial, { violacoes: 0, desafiosComViolacao: 0, lacunas: 0, aulas: 2, desafios: 2 });
  });

  it('FIX-BAD dry-run --json: exit 1 — 28 violações classificadas, plano FECHADO de ações, nada escrito', async () => {
    const r = await runEngine(['repair', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 1);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(rel.modo, 'dry-run');
    assert.equal(rel.llmChamado, false);
    assert.deepEqual(rel.escritos, []);
    assert.equal(rel.plano.classificadas.length, 28);
    assert.equal(rel.plano.lacunas.length, 2);
    assert.equal(rel.plano.ordens.length, 0);
    assert.equal(rel.plano.estruturais.length, 0);
    assert.deepEqual(rel.placarInicial, { violacoes: 28, desafiosComViolacao: 2, lacunas: 28, aulas: 2, desafios: 2 });
  });

  it('--aplicar com modelo mas SEM chave: aborta ANTES do laço com exit 2 [SEM_CHAVE] — escrita fail-safe, nada gravado', async () => {
    // CONTRATO (§8.1: "2 quando falta `--modelo-revisor` ou chave"): sem chave
    // não existe correção, e o comando aborta DECLARANDO — o relatório do
    // laço mecânico ("nada a reparar mecanicamente", exit 1) dizia "não há o
    // que fazer" quando a verdade é "não há como fazer".
    const arvoreAntes = await digestArvore(fixBad);
    const r = await runEngine(
      ['repair', 'cx-fix', '--dir', fixBad, '--aplicar', '--modelo-revisor', 'outro/modelo', '--json'],
      { env: envIsolada() },
    );
    assert.equal(r.code, 2);
    assert.ok(r.stderr.includes('erro estruturado [SEM_CHAVE]'), r.stderr.slice(0, 300));
    // o aborto é ANTES do laço mecânico: nem relatório sai (mesmo com --json)…
    assert.equal(r.stdout.trim(), '', 'com SEM_CHAVE o laço mecânico não roda: nenhum relatório sai');
    // …e a escrita é fail-safe: a trilha fica byte a byte igual (escritos: []).
    assert.deepEqual(await digestArvore(fixBad), arvoreAntes, 'sem chave o --aplicar NÃO pode gravar nada');
  });

  it('repair --aplicar sem OPENROUTER_API_KEY aborta com exit 2 — erro estruturado [SEM_CHAVE] (contrato do --help e docs §8.1)', async () => {
    // COMPORTAMENTO CORRETO segundo o contrato congelado: "EXIGE
    // --modelo-revisor e a chave de API; sem elas aborta DECLARANDO (exit 2)".
    const r = await runEngine(
      ['repair', 'cx-fix', '--dir', fixBad, '--aplicar', '--modelo-revisor', 'outro/modelo'],
      { env: envIsolada() },
    );
    assert.equal(r.code, 2);
    assert.ok(r.stderr.includes('erro estruturado [SEM_CHAVE]'), r.stderr.slice(0, 300));
  });
});

// ─── reorder ─────────────────────────────────────────────────────────────────

describe('engine CLI — reorder (caracterização)', () => {
  it('FIX-CLEAN --aplicar --json: exit 0 — verificação APROVADA, nada a mover, nada escrito', async () => {
    const r = await runEngine(['reorder', 'cx-ok', '--dir', fixClean, '--aplicar', '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    for (const k of ['aplicado', 'auditInicial', 'declaracoes', 'escritos', 'modo', 'placarInicial', 'plano', 'slug', 'veredicto']) {
      assert.ok(k in rel, `reorder sem a chave ${k}`);
    }
    assert.equal(rel.veredicto.ok, true);
    assert.equal(rel.aplicado, false);
    assert.deepEqual(rel.escritos, []);
    assert.equal(rel.plano.movimentos.length, 0);
  });

  it('FIX-BAD dry-run --json: exit 1 — lacuna de currículo NÃO é problema de ORDEM e sai em "fora de escopo"', async () => {
    const r = await runEngine(['reorder', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 1);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(rel.plano.alvos.length, 0);
    assert.equal(rel.plano.movimentos.length, 0);
    assert.equal(rel.plano.foraDeEscopo.length, 26);
    assert.equal(rel.plano.impossiveis.length, 0);
    assert.equal(rel.veredicto.ok, true);
    assert.equal(rel.placarInicial.violacoes, 28);
  });
});

// ─── gap ─────────────────────────────────────────────────────────────────────

describe('engine CLI — gap (caracterização)', () => {
  it('FIX-CLEAN dry-run --json: exit 0 — nada a fechar (sem lacuna, sem aula nova, sem bloqueio)', async () => {
    const r = await runEngine(['gap', 'cx-ok', '--dir', fixClean, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    for (const k of ['aceitas', 'bloqueios', 'declaracoes', 'escritos', 'modo', 'plano', 'recusadas', 'slug']) {
      assert.ok(k in rel, `gap sem a chave ${k}`);
    }
    assert.equal(rel.plano.lacunas.length, 0);
    assert.equal(rel.plano.aulasNovas.length, 0);
    assert.equal(rel.bloqueios.length, 0);
    assert.equal(rel.declaracoes.length, 6);
  });

  it('FIX-BAD dry-run --json: exit 1 — 14 lacunas viram 4 aulas planejadas (zero LLM, zero escrita)', async () => {
    const r = await runEngine(['gap', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 1);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(rel.modo, 'dry-run');
    assert.equal(rel.plano.lacunas.length, 14);
    assert.equal(rel.plano.aulasNovas.length, 4);
    assert.equal(rel.bloqueios.length, 0);
    assert.deepEqual(rel.escritos, []);
    const a0 = rel.plano.aulasNovas[0];
    for (const k of ['ref', 'acao', 'role', 'construcoes', 'inserirAntesDe', 'indiceDeInsercao', 'cobradaEm']) {
      assert.ok(k in a0, `aula planejada sem a chave ${k}`);
    }
  });
});

// ─── convergir ───────────────────────────────────────────────────────────────

describe('engine CLI — convergir (caracterização)', () => {
  it('FIX-CLEAN --max-iteracoes 1 --json: exit 0 — PONTO-FIXO, mu 0, vetor zerado; ledger APPEND-ONLY escrito', async () => {
    const slug = slugUnico('cx-conv');
    try {
      const r = await runEngine(['convergir', slug, '--dir', fixClean, '--max-iteracoes', '1', '--json'], {
        env: envIsolada(),
        timeoutMs: 300_000,
      });
      assert.equal(r.code, 0, r.stderr.slice(0, 500));
      const rel = JSON.parse(r.stdout) as Record<string, any>;
      for (const k of ['achadosRemanescentes', 'declaracoes', 'escritos', 'foraDosRamos', 'iteracoes', 'modo', 'slug', 'veredito']) {
        assert.ok(k in rel, `convergir sem a chave ${k}`);
      }
      assert.equal(rel.veredito, 'PONTO-FIXO');
      assert.equal(rel.modo, 'dry-run');
      assert.equal(rel.achadosRemanescentes.length, 0);
      assert.equal(rel.foraDosRamos.length, 0);
      const it0 = rel.iteracoes[0];
      assert.equal(it0.mu, 0);
      assert.deepEqual(it0.vetor, {
        violacoesDeOrcamento: 0,
        lacunasDeCurriculo: 0,
        errosDaBarra: 0,
        excessoDePasso: 0,
        chavesSemDemonstracao: 0,
        aulasSemDesafio: 0,
        secoesInsuficientes: 0,
      });
      assert.equal(it0.medicoes.length, 2, 'os DOIS gates (audit + barra) medem em memória');
      // o ledger é a ÚNICA escrita do dry-run, e é de REGISTRO (append-only).
      const ledger = path.join(APP_DIR, 'content-src', slug, 'convergencia', 'ledger.jsonl');
      assert.ok(existsSync(ledger), `ledger ausente: ${ledger}`);
      assert.ok(
        r.stderr.includes(`ledger (append-only, uma linha por iteracao): ${ledger}`),
        r.stderr.slice(0, 400),
      );
    } finally {
      await limparRun(slug);
    }
  });

  it('FIX-BAD --max-iteracoes 1 --json: exit 1 — DRY-RUN com achados remanescentes (veredito nunca mente)', async () => {
    const slug = slugUnico('cx-conv');
    try {
      const r = await runEngine(['convergir', slug, '--dir', fixBad, '--max-iteracoes', '1', '--json'], {
        env: envIsolada(),
        timeoutMs: 300_000,
      });
      assert.equal(r.code, 1);
      const rel = JSON.parse(r.stdout) as Record<string, any>;
      assert.equal(rel.veredito, 'DRY-RUN');
      assert.equal(rel.achadosRemanescentes.length, 34);
      const it0 = rel.iteracoes[0];
      assert.equal(it0.mu, 58);
      assert.deepEqual(it0.vetor, {
        violacoesDeOrcamento: 28,
        lacunasDeCurriculo: 28,
        errosDaBarra: 4,
        excessoDePasso: 2,
        chavesSemDemonstracao: 0,
        aulasSemDesafio: 0,
        secoesInsuficientes: 2,
      });
    } finally {
      await limparRun(slug);
    }
  });

  it('FIX-PENHASCO --aplicar: a ação APLICÁVEL (SPLIT_LESSON/QUEBRA) EXECUTA — esqueleto + ordem de `lessons` gravados, exit 1 pós-aplicação', async () => {
    // A fixture commitada `trilha-rust-minima` é a AULA DE PASSO GRANDE: 6
    // produtivas novas numa aula só (A17/A18/A21 → ramo QUEBRA). Sobre uma
    // CÓPIA (nunca sobre a fixture do repositório), `convergir --aplicar`
    // executa a ação DETERMINÍSTICA do catálogo — SPLIT_LESSON — e grava pela
    // dep `gravarArquivo` do CLI (tools/track-engine/cli.ts, escrita atômica
    // por arquivo) os DOIS arquivos do movimento: o ESQUELETO da aula nova e o
    // `module.json` com o array `lessons` movido (a aula nova ANTES da
    // original). Era o único modo cuja ação APLICÁVEL nenhum teste executava.
    const slug = slugUnico('cx-conv');
    const dirRaiz = await fs.mkdtemp(path.join(os.tmpdir(), 'do-fixc-quebra-'));
    const dir = path.join(dirRaiz, 'track');
    await fs.cp(path.join(APP_DIR, 'tests', 'fixtures', 'tracks', 'trilha-rust-minima'), dir, { recursive: true });
    try {
      const r = await runEngine(['convergir', slug, '--dir', dir, '--aplicar', '--json'], {
        env: envIsolada(),
        timeoutMs: 300_000,
      });
      // EXIT PÓS-APLICAÇÃO: a quebra é honesta — o esqueleto NÃO zera μ (falta
      // a autoria) e o laço para em SEM-PROGRESSO, exit 1 e ESCALA (§6.6).
      assert.equal(r.code, 1, r.stderr.slice(0, 500));
      const rel = JSON.parse(r.stdout) as Record<string, any>;
      assert.equal(rel.modo, 'aplicar');
      assert.equal(rel.veredito, 'SEM-PROGRESSO');
      assert.equal(rel.iteracoes.length, 2, 'a iteração 1 aplica; a 2 RECARREGA do disco e mede o esqueleto');

      const it1 = rel.iteracoes[0];
      const it2 = rel.iteracoes[1];

      // A AÇÃO APLICÁVEL foi EXECUTADA (o gap que este caso fecha).
      const planejada = it1.acoesPlanejadas.find((a: Record<string, any>) => a.acao === 'SPLIT_LESSON');
      assert.ok(planejada, 'o plano precisa ter a SPLIT_LESSON');
      assert.equal(planejada.aplicavel, true);
      assert.equal(planejada.ramo, 'QUEBRA');
      assert.deepEqual(it1.acoesAplicadas, [
        {
          acao: 'SPLIT_LESSON',
          ramo: 'QUEBRA',
          ref: 'modulo-1/a-primeira-funcao',
          arquivos: [
            'modules/modulo-1/lessons/passo-node-functionitem-15c0fd88/lesson.json',
            'modules/modulo-1/module.json',
          ],
        },
      ]);
      // `escritos` — os DOIS caminhos determinísticos do gravarArquivo, em
      // ordem de gravação: o esqueleto e o movimento de ORDEM do `lessons`.
      assert.deepEqual(rel.escritos, [
        'modules/modulo-1/lessons/passo-node-functionitem-15c0fd88/lesson.json',
        'modules/modulo-1/module.json',
      ]);

      // O DISCO concorda com o relatório — esqueleto + movimento de ORDEM.
      const modulo = JSON.parse(await fs.readFile(path.join(dir, 'modules', 'modulo-1', 'module.json'), 'utf8'));
      assert.deepEqual(
        modulo.lessons,
        ['passo-node-functionitem-15c0fd88', 'a-primeira-funcao'],
        'o movimento de ORDEM do array `lessons`: a aula nova ANTES da original',
      );
      const esqueleto = JSON.parse(
        await fs.readFile(
          path.join(dir, 'modules', 'modulo-1', 'lessons', 'passo-node-functionitem-15c0fd88', 'lesson.json'),
          'utf8',
        ),
      ) as Record<string, any>;
      assert.equal(esqueleto.introduces, undefined, 'declarar sem demonstrar seria A19 — o esqueleto nasce SEM introduces');
      assert.deepEqual(esqueleto.challenges, []);
      assert.ok(esqueleto.autoria && typeof esqueleto.autoria.ensina === 'string', 'a ficha `autoria` diz o que autorar');
      assert.deepEqual(esqueleto.origem, {
        subfluxo: 'convergencia-quebra-v1',
        acao: 'SPLIT_LESSON',
        deAula: 'modulo-1/a-primeira-funcao',
        chaves: ['node:FunctionItem', 'node:Parameter', 'node:Parameters', 'node:PrimitiveType', 'node:VisibilityModifier'],
        grupos: [['node:FunctionItem', 'node:Parameter', 'node:Parameters', 'node:PrimitiveType', 'node:VisibilityModifier']],
        gruposProdutivos: 1,
      });
      // O `introduces` da aula EXISTENTE nunca é reescrito (§5.5): a original
      // continua com as 6 produtivas — é por isso que o laço para em
      // SEM-PROGRESSO em vez de fingir que convergiu.
      const original = JSON.parse(
        await fs.readFile(path.join(dir, 'modules', 'modulo-1', 'lessons', 'a-primeira-funcao', 'lesson.json'), 'utf8'),
      ) as Record<string, any>;
      assert.deepEqual(original.introduces.productive, [
        'node:FunctionItem',
        'node:Parameters',
        'node:Parameter',
        'node:IntegerLiteral',
        'op:binary:*',
        'node:BinaryExpression',
      ]);

      // MEDIDA DE TERMINAÇÃO, golden master da medição documentada no cabeçalho
      // de `modes/convergencia.ts`: μ 12 → 13 (o esqueleto soma
      // `aulasSemDesafio` — A20 reprova a aula em autoria) e a iteração 2 NÃO
      // aplica nada (a quebra é IDEMPOTENTE: o slug derivado já existe).
      assert.equal(it1.mu, 12);
      assert.deepEqual(it1.vetor, {
        violacoesDeOrcamento: 0,
        lacunasDeCurriculo: 0,
        errosDaBarra: 5,
        excessoDePasso: 11,
        chavesSemDemonstracao: 1,
        aulasSemDesafio: 0,
        secoesInsuficientes: 1,
      });
      assert.deepEqual(it1.achadosPorRamo, { ORDEM: 0, CADEIA: 0, LACUNA: 0, QUEBRA: 5, DEMONSTRACAO: 0, PROVA: 0 });
      assert.equal(it1.veredito, null, 'a iteração que APLICA nunca fecha o laço');
      assert.equal(it2.mu, 13);
      assert.deepEqual(it2.achadosPorRamo, { ORDEM: 0, CADEIA: 0, LACUNA: 0, QUEBRA: 3, DEMONSTRACAO: 1, PROVA: 2 });
      assert.deepEqual(it2.acoesAplicadas, [], 'idempotência: o esqueleto já existe (jaExiste) e nada mais é aplicável');
      assert.equal(it2.planosDeQuebra[0].aulasNovas[0].jaExiste, true);
      assert.equal(it2.veredito, 'SEM-PROGRESSO');
    } finally {
      await fs.rm(dirRaiz, { recursive: true, force: true }).catch(() => {});
      await limparRun(slug);
    }
  });
});

// ─── lint-schemas ────────────────────────────────────────────────────────────

describe('engine CLI — lint-schemas (caracterização)', () => {
  it('registro atual: exit 0 com a contagem de registers (INV-04/INV-05 válidas)', async () => {
    const r = await runEngine(['lint-schemas'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    assert.match(r.stdout, /^lint de schemas OK: \d+ registers, ordem e obrigatoriedade válidas \(INV-04\/INV-05\)$/m);
  });

  it('não aceita argumento nenhum — a invocação é literal "lint-schemas"', async () => {
    // caracterização do dispatch: o comando ignora resto de argv (não há flags).
    const r = await runEngine(['lint-schemas', 'qualquer-coisa'], { env: envIsolada() });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /^lint de schemas OK: \d+ registers/m);
  });
});
