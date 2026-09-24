/**
 * tests/cx-cli-engine-medicao.test.ts — CARACTERIZAÇÃO (golden master) da
 * superfície de MEDIÇÃO do CLI da engine (`app/tools/track-engine/cli.ts`):
 * `audit`, `barra`, `coverage`, `requirements`, `discrimination` e `revise`.
 *
 * Estes testes FIXAM o comportamento OBSERVÁVEL de hoje — invocações, exit
 * codes, mensagens de uso e o shape do JSON de saída — para que a refatoração
 * dos CLIs (ondas seguintes) prove que "continua funcionando". Fonte primária
 * do contrato: `docs/00-contratos.md` §8.1 e `docs/16-engine-de-trilha.md` §8
 * (convenção: 0 sem violação · 1 violações encontradas · 2 uso incorreto).
 *
 * SEM REDE, SEM LLM, SEM CHAVES: todo subprocesso roda com env limpa
 * (OPENROUTER_API_KEY / BRAVE_API_KEY / DEEPSEEK_API_KEY removidas) e HOME /
 * XDG_CONFIG_HOME isolados num tmpdir, para que o settingsStore nunca enxergue
 * a chave do desenvolvedor. Duas fixtures inline e determinísticas:
 *
 *   FIX-BAD   teoria que NÃO ensina o que os testes cobram → lacunas (exit 1);
 *   FIX-CLEAN teoria que demonstra exatamente o mínimo + `introduces`
 *             declarado pedagogicamente limpo → zero achados (exit 0).
 *
 * Os números pinados (totals/placar) saíram da medição real destas fixtures em
 * 2026-09-24 e são função pura do conteúdo delas — é exatamente o que faz deles
 * uma rede de segurança: mudou o número, mudou o comportamento do CLI.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
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

/**
 * Roda `npx tsx tools/track-engine/cli.ts <args...>` como SUBPROCESSO REAL,
 * com env limpa (sem chaves de API, sem NODE_TEST_CONTEXT herdado) e HOME /
 * XDG_CONFIG_HOME isolados. Mesmo idioma de trackCli.test.ts / engineFiacao.
 */
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
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 120_000);
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

/**
 * FIX-BAD: trilha que o gate REPROVA — a teoria ensina `const`/`+` e os testes
 * cobrem função/parâmetro/retorno/throw (A1/A2/A11/A13 → 28 violações, todas
 * lacuna de currículo no modo `inferred`).
 */
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

/**
 * FIX-CLEAN: trilha que o gate APROVA — a teoria demonstra exatamente o que os
 * testes cobram (2 formas sintáticas por chave, A22), o starter é inofensivo e
 * o `introduces` declarado cobre o mínimo (A17–A23 zerados, exit 0 no audit,
 * barra, coverage, requirements e revise).
 */
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

// ─── fixtures e ambiente isolado (por arquivo) ───────────────────────────────
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

/** env isolada: sem chaves e com settingsStore/home apontando para tmpdir. */
function envIsolada(): NodeJS.ProcessEnv {
  return { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
}

// ─── superfície de USO (contrato: mensagens + exit codes) ────────────────────

describe('engine CLI — superfície de uso (caracterização)', () => {
  it('sem argumentos: USAGE no stdout e exit 2 (uso incorreto)', async () => {
    const r = await runEngine([], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stdout.startsWith('uso: npm run engine -- <comando> [args...]'), r.stdout.slice(0, 200));
  });

  it('--help: o MESMO USAGE e exit 0; o texto declara a convenção de exit codes', async () => {
    const r = await runEngine(['--help'], { env: envIsolada() });
    assert.equal(r.code, 0);
    assert.ok(
      r.stdout.includes('exit codes: 0 sem violacao · 1 violacoes encontradas · 2 uso incorreto'),
      r.stdout.slice(-400),
    );
    const linhas = r.stdout.trimEnd().split('\n');
    assert.equal(linhas[linhas.length - 1], '  como todos os outros.', r.stdout.slice(-200));
  });

  it('-h: alias de --help, exit 0', async () => {
    const r = await runEngine(['-h'], { env: envIsolada() });
    assert.equal(r.code, 0);
    assert.ok(r.stdout.startsWith('uso: npm run engine -- <comando> [args...]'));
  });

  it('comando desconhecido: "erro: comando desconhecido: <x>" no stderr + USAGE e exit 2', async () => {
    const r = await runEngine(['wat'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.includes('erro: comando desconhecido: wat'), r.stderr.slice(0, 300));
    assert.ok(r.stderr.includes('uso: npm run engine -- <comando> [args...]'));
    assert.equal(r.stdout, '');
  });
});

// ─── audit ───────────────────────────────────────────────────────────────────

describe('engine CLI — audit (caracterização)', () => {
  it('FIX-CLEAN --json: exit 0 e totals EXATOS sem nenhum achado', async () => {
    const r = await runEngine(['audit', 'cx-ok', '--dir', fixClean, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const report = JSON.parse(r.stdout) as Record<string, unknown>;
    // em modo `declared` a barra RODA e o relatório carrega o placar dela.
    assert.deepEqual(Object.keys(report).sort(), [
      'barra',
      'budgetSource',
      'hygiene',
      'limitacoes',
      'metrics',
      'parseErrors',
      'totals',
      'trackSlug',
      'violations',
    ]);
    assert.ok(Array.isArray((report.barra as any).porRegra), 'placar da barra por regra ausente');
    assert.equal(report.trackSlug, 'cx-ok');
    assert.equal(report.budgetSource, 'declared');
    assert.deepEqual(report.totals, {
      aulas: 2,
      aulasSemConstrucaoNova: 0,
      avisos: 0,
      checagensNaoExecutadas: 0,
      desafios: 2,
      desafiosComViolacao: 0,
      desafiosDeModulo: 0,
      lacunasDeCurriculo: 0,
      violacoes: 0,
      errosDaBarra: 0,
      avisosDaBarra: 0,
    });
  });

  it('FIX-BAD --json: exit 1 (violações) e totals EXATOS — 28 lacunas, barra NÃO rodou em inferred', async () => {
    const r = await runEngine(['audit', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 1);
    const report = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(report.budgetSource, 'inferred');
    assert.deepEqual(report.totals, {
      aulas: 2,
      aulasSemConstrucaoNova: 0,
      avisos: 0,
      checagensNaoExecutadas: 1,
      desafios: 2,
      desafiosComViolacao: 2,
      desafiosDeModulo: 0,
      lacunasDeCurriculo: 28,
      violacoes: 28,
    });
    // limitação DECLARADA na saída (§9.2 — nunca omitida): a barra A17-A23
    // não roda em orçamento inferred (e por isso o report NÃO tem a chave
    // `barra` — ausente = NÃO MEDIDO, nunca zero).
    assert.equal('barra' in report, false, 'barra em inferred é ausente, não zero');
    const limitacoes = (report.limitacoes ?? []) as Array<Record<string, unknown>>;
    assert.ok(
      limitacoes.some((l) => l.id === 'A17-A23-NAO-RODOU-EM-INFERRED'),
      `limitação não declarada: ${JSON.stringify(limitacoes).slice(0, 300)}`,
    );
    for (const k of ['id', 'checagem', 'motivo']) {
      assert.ok(k in limitacoes[0], `limitacao sem a chave ${k}`);
    }
    // shape de cada violação (o relatório é arquivo:linha:coluna).
    const v0 = (report.violations as any[])[0];
    for (const k of ['regra', 'arquivo', 'campo', 'linha', 'coluna', 'mensagem', 'ref']) {
      assert.ok(k in v0, `violation sem a chave ${k}: ${JSON.stringify(v0).slice(0, 200)}`);
    }
  });

  it('FIX-BAD humano --limite 0: só o placar, com a linha de truncamento SEPARANDO erro de aviso', async () => {
    const r = await runEngine(['audit', 'cx-fix', '--dir', fixBad, '--limite', '0'], { env: envIsolada() });
    assert.equal(r.code, 1);
    assert.ok(r.stdout.includes('TRILHA cx-fix'));
    assert.ok(
      r.stdout.includes('... e mais 28 achado(s) nao exibido(s): 28 violacao(oes) + 0 aviso(s)'),
      r.stdout.slice(0, 600),
    );
    assert.ok(r.stdout.includes('PLACAR'));
    assert.ok(r.stdout.includes('  violacoes ............................ 28'));
    assert.ok(r.stdout.includes('  0 passou · 2 falhou · 0 pendente'));
  });

  it('argv inválido — sem slug, --modo errado, --harness errado, --limite inválido: exit 2 com "erro:" + USAGE', async () => {
    const casos: Array<{ args: string[]; erro: string }> = [
      { args: ['audit'], erro: 'erro: informe o slug da trilha' },
      { args: ['audit', 'cx-fix', '--dir', fixBad, '--modo', 'errado'], erro: 'erro: --modo invalido: errado (esperado declared ou inferred)' },
      { args: ['audit', 'cx-fix', '--dir', fixBad, '--harness', 'errado'], erro: 'erro: --harness invalido: errado (esperado receptive-seed ou none)' },
      { args: ['audit', 'cx-fix', '--dir', fixBad, '--limite', '-1'], erro: 'erro: --limite invalido: -1' },
      { args: ['audit', 'cx-fix', '--dir', fixBad, '--limite', 'abc'], erro: 'erro: --limite invalido: abc' },
    ];
    for (const caso of casos) {
      const r = await runEngine(caso.args, { env: envIsolada() });
      assert.equal(r.code, 2, `${caso.args.join(' ')} → exit ${r.code}`);
      assert.ok(r.stderr.startsWith(caso.erro), `${caso.args.join(' ')} → ${r.stderr.slice(0, 200)}`);
      assert.ok(r.stderr.includes('uso: npm run engine -- <comando> [args...]'));
    }
  });

  it('trilha inexistente (sem --dir): exit 2 declarando a falha de carga e listando as trilhas disponíveis', async () => {
    const r = await runEngine(['audit', 'nao-existe-xyz'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(
      r.stderr.includes("erro: falha ao carregar a trilha 'nao-existe-xyz':"),
      r.stderr.slice(0, 300),
    );
    assert.ok(r.stderr.includes('trilhas disponiveis:'), r.stderr.slice(0, 400));
  });

  it('trilha com schema quebrado: exit 1 com "problema(s) de schema/integridade" (é erro de CONTEÚDO, não de uso)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'do-cxcli-badjson-'));
    try {
      await writeJson(dir, 'track.json', {
        schemaVersion: 1,
        slug: 'cx-quebrado',
        title: 'Quebrada',
        description: 'd',
        language: 'pt-BR',
        domain: 'programming',
        modules: ['modulo-inexistente'],
      });
      const r = await runEngine(['audit', 'cx-quebrado', '--dir', dir], { env: envIsolada() });
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('problema(s) de schema/integridade'), r.stderr.slice(0, 300));
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ─── barra ───────────────────────────────────────────────────────────────────

describe('engine CLI — barra (caracterização)', () => {
  it('FIX-CLEAN --json: exit 0, zero erros e zero avisos (A17-A23/A24)', async () => {
    const r = await runEngine(['barra', 'cx-ok', '--dir', fixClean, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.deepEqual(Object.keys(rel).sort(), ['achados', 'adapterId', 'budgetSource', 'metricas', 'totais', 'trackSlug']);
    assert.equal(rel.adapterId, 'javascript');
    assert.deepEqual(rel.totais, { aulas: 2, erros: 0, avisos: 0, aulasComErro: 0, blocosQueNaoParseiam: 0 });
    assert.deepEqual(rel.achados, []);
  });

  it('FIX-BAD --json: exit 1 (ERROS da barra) e totais EXATOS', async () => {
    const r = await runEngine(['barra', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 1);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(rel.budgetSource, 'inferred');
    assert.deepEqual(rel.totais, { aulas: 2, erros: 4, avisos: 4, aulasComErro: 2, blocosQueNaoParseiam: 0 });
    const a0 = rel.achados[0];
    for (const k of ['regra', 'ref', 'severidade', 'mensagem', 'evidencia', 'acao']) {
      assert.ok(k in a0, `achado sem a chave ${k}`);
    }
  });

  it('--aula MOD/AULA recorta a medição (FIX-CLEAN): exit 0 e UMA métrica', async () => {
    const r = await runEngine(['barra', 'cx-ok', '--dir', fixClean, '--aula', 'm1/a1', '--json'], { env: envIsolada() });
    assert.equal(r.code, 0);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(rel.metricas.length, 1);
    assert.equal(rel.metricas[0].ref, 'm1/a1');
    assert.equal(rel.totais.aulas, 1);
  });

  it('--aula inexistente: exit 2 com o formato exigido', async () => {
    const r = await runEngine(['barra', 'cx-ok', '--dir', fixClean, '--aula', 'm1/nao-existe'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(
      r.stderr.startsWith('erro: --aula m1/nao-existe nao existe na trilha (formato: <modulo>/<aula>)'),
      r.stderr.slice(0, 200),
    );
  });

  it('sem slug: exit 2 com "erro: informe o slug da trilha"', async () => {
    const r = await runEngine(['barra'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: informe o slug da trilha (ex.: npm run engine -- barra rust-iniciante)'));
  });
});

// ─── coverage ────────────────────────────────────────────────────────────────

describe('engine CLI — coverage (caracterização)', () => {
  it('FIX-CLEAN --json: exit 0 — tudo medido, zero lacuna, zero não-medido', async () => {
    const r = await runEngine(['coverage', 'cx-ok', '--dir', fixClean, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.deepEqual(Object.keys(rel).sort(), ['desafios', 'linguagem', 'orcamento', 'placar', 'trilha']);
    assert.equal(rel.linguagem, 'javascript');
    assert.deepEqual(rel.placar, {
      desafios: 2,
      passou: 2,
      semSolucao: 0,
      parseFalhou: 0,
      proverFalhou: 0,
      ignorados: 0,
      lacunas: 0,
      excessos: 2,
      naoMedidos: 0,
    });
  });

  it('FIX-BAD --json: exit 1 — 6 lacunas (o teste cobra construção que a aula não oferece)', async () => {
    const r = await runEngine(['coverage', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 1);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.deepEqual(rel.placar, {
      desafios: 2,
      passou: 2,
      semSolucao: 0,
      parseFalhou: 0,
      proverFalhou: 0,
      ignorados: 0,
      lacunas: 6,
      excessos: 4,
      naoMedidos: 0,
    });
    const d0 = rel.desafios[0];
    assert.equal(d0.ref, 'm1/a1/c1');
    assert.equal(d0.status, 'ok');
    assert.deepEqual(d0.lacuna, ['node:FunctionDeclaration', 'node:Parameter', 'node:ReturnStatement']);
  });

  it('--limite 0 é USO INCORRETO (exit 2): mediria zero desafio e sairia verde sem medir nada', async () => {
    const r = await runEngine(['coverage', 'cx-ok', '--dir', fixClean, '--limite', '0'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: --limite invalido: 0 (esperado inteiro ≥ 1'), r.stderr.slice(0, 200));
  });

  it('sem slug: exit 2 com "erro: informe o slug da trilha"', async () => {
    const r = await runEngine(['coverage'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: informe o slug da trilha'));
  });
});

// ─── requirements ────────────────────────────────────────────────────────────

describe('engine CLI — requirements (caracterização)', () => {
  it('FIX-CLEAN --json: exit 0 — bijeção completa requirement↔teste', async () => {
    const r = await runEngine(['requirements', 'cx-ok', '--dir', fixClean, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.deepEqual(Object.keys(rel).sort(), ['desafios', 'linguagem', 'placar', 'trilha']);
    assert.equal(rel.linguagem, 'javascript');
    assert.deepEqual(rel.placar, {
      desafios: 2,
      comBijecaoCompleta: 2,
      comGaps: 0,
      semTeste: 0,
      testesSemRequirement: 0,
    });
    assert.deepEqual(rel.desafios[0].validacao, {
      ok: true,
      semTeste: [],
      testesSemRequirement: [],
      correspondencias: [{ requirementId: 'REQ-1', testName: 'soma 2+3' }],
    });
  });

  it('FIX-BAD --json: exit 1 — teste sem requirement declarado é GAP', async () => {
    const r = await runEngine(['requirements', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 1);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.deepEqual(rel.placar, {
      desafios: 2,
      comBijecaoCompleta: 0,
      comGaps: 2,
      semTeste: 0,
      testesSemRequirement: 2,
    });
    // a DERIVAÇÃO usa a linguagem da trilha e sai do arquivo de TESTE.
    const d0 = rel.desafios[0];
    assert.equal(d0.derivados.requirements[0].teste, 'soma 2+3');
    assert.deepEqual(d0.declarados, []);
  });

  it('--limite 0 é USO INCORRETO (exit 2) — mesma regra do coverage', async () => {
    const r = await runEngine(['requirements', 'cx-ok', '--dir', fixClean, '--limite', '0'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: --limite invalido: 0 (esperado inteiro ≥ 1'));
  });
});

// ─── discrimination ──────────────────────────────────────────────────────────

describe('engine CLI — discrimination (caracterização)', () => {
  it('FIX-BAD --json: exit 0 SEMPRE que mediu (classificacao literal "aviso"), com placar EXATO', async () => {
    const r = await runEngine(['discrimination', 'cx-fix', '--dir', fixBad, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0, `discrimination nunca sai 1 — exit ${r.code}`);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(rel.classificacao, 'aviso');
    assert.deepEqual(rel.placar, {
      desafios: 2,
      medidos: 2,
      naoMedidos: 0,
      semAlvo: 0,
      discriminam: 0,
      naoDiscriminam: 2,
      alvosMedidos: 3,
      alvosDiscriminados: 0,
      alvosNaoDiscriminados: 3,
      aulasComAlvoNaoDiscriminado: 2,
      aulasMedidas: 2,
    });
    const d0 = rel.desafios[0];
    for (const k of ['ref', 'lessonRef', 'status', 'alvos', 'alvosNaSolucao', 'atomsDoMinimo', 'discriminados', 'naoDiscriminados', 'motivo']) {
      assert.ok(k in d0, `desafio sem a chave ${k}`);
    }
  });

  it('FIX-CLEAN: exit 0 — achado (se houver) é AVISO, nunca violação', async () => {
    const r = await runEngine(['discrimination', 'cx-ok', '--dir', fixClean, '--json'], { env: envIsolada() });
    assert.equal(r.code, 0);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.equal(rel.classificacao, 'aviso');
  });

  it('--limite 0 é USO INCORRETO (exit 2)', async () => {
    const r = await runEngine(['discrimination', 'cx-ok', '--dir', fixClean, '--limite', '0'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: --limite invalido: 0 (esperado inteiro ≥ 1'));
  });
});

// ─── revise ──────────────────────────────────────────────────────────────────

describe('engine CLI — revise (caracterização)', () => {
  /** O revise GRAVA o relatório em content-src/<slug>/revisao-progressiva/ — slug único + limpeza. */
  async function comSlugUnico(fn: (slug: string) => Promise<RunResult>): Promise<RunResult> {
    const slug = `cx-rev-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    try {
      return await fn(slug);
    } finally {
      await fs.rm(path.join(APP_DIR, 'content-src', slug), { recursive: true, force: true }).catch(() => {});
    }
  }

  it('FIX-CLEAN --json: exit 0 — convergiu sem lacuna (cobertas 2)', async () => {
    const r = await comSlugUnico((slug) =>
      runEngine(['revise', slug, '--dir', fixClean, '--json'], { env: envIsolada(), timeoutMs: 180_000 }),
    );
    assert.equal(r.code, 0, r.stderr.slice(0, 500));
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.deepEqual(rel.placar, {
      aulas: 2,
      cobertas: 2,
      comLacuna: 0,
      naoRevisaveis: 0,
      comExcesso: 1,
      splitsPendentes: 0,
    });
    assert.equal(rel.convergencia, true);
    assert.equal(rel.orcamentoFonte, 'declared');
  });

  it('FIX-BAD --json: exit 1 — lacuna vira candidato a SPLIT (fail-closed, nunca loopa)', async () => {
    const r = await comSlugUnico((slug) =>
      runEngine(['revise', slug, '--dir', fixBad, '--json'], { env: envIsolada(), timeoutMs: 180_000 }),
    );
    assert.equal(r.code, 1);
    const rel = JSON.parse(r.stdout) as Record<string, any>;
    assert.deepEqual(rel.placar, {
      aulas: 2,
      cobertas: 0,
      comLacuna: 2,
      naoRevisaveis: 0,
      comExcesso: 0,
      splitsPendentes: 2,
    });
    const a0 = rel.aulas[0];
    for (const k of ['aula', 'indice', 'titulo', 'desafios', 'precisaQuebrar', 'memoria']) {
      assert.ok(k in a0, `aula sem a chave ${k}`);
    }
  });

  it('--limite 0 é USO INCORRETO (exit 2)', async () => {
    const r = await runEngine(['revise', 'cx-ok', '--dir', fixClean, '--limite', '0'], { env: envIsolada() });
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: --limite invalido: 0 (esperado inteiro ≥ 1 — 0 mediria zero aula(s)'));
  });
});
