/**
 * tests/engineRepairCli.test.ts — o CLI da engine (`tools/track-engine/cli.ts`)
 * como SUBPROCESSO REAL, cobrindo o que a onda LIGOU:
 *
 *   1. `repair` é COMANDO DE VERDADE. Antes desta onda o dispatch imprimia
 *      "'repair' ainda nao esta implementado" e saía 2 — enquanto
 *      `engine/modes/repair.ts` exportava `repararTrilha` completo e testado.
 *      O laço do dono (gerar → auditar → consertar → regerar) era impossível
 *      de rodar pela linha de comando.
 *   2. O RÓTULO da linha de truncamento do `audit`. Ela somava ERROS e AVISOS
 *      e chamava o total de "violacao(oes)" — enquanto o PLACAR logo abaixo os
 *      separa. A mentira só aparece com `--limite 0`, que é exatamente o modo
 *      que a documentação (§8/§9.4) manda usar.
 *
 * Por que subprocesso: `cli.ts` roda `main()` no import (é um entry point) —
 * importá-lo de um teste EXECUTARIA o comando. O contrato observável do CLI é
 * stdout/stderr + exit code, e é isso que este arquivo prova.
 *
 * Nada aqui precisa de chave de API: o dry-run do repair é função PURA (o
 * plano não chama LLM) e o caminho `--aplicar` é exercitado justamente para
 * provar o FAIL-CLOSED (§9.3) — sem chave ele aborta DECLARANDO e NÃO grava
 * nada. A trilha fixture nasce num diretório temporário e o `--dir` a alcança
 * sem tocar `app/resources/tracks` (o git fica limpo).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const APP_DIR = path.resolve(__dirname, '..');
const TIMEOUT_CLI_MS = 120_000;

interface SaidaDoCli {
  code: number;
  stdout: string;
  stderr: string;
}

/** Roda `npx tsx tools/track-engine/cli.ts <args...>` com cwd = app. */
function runEngine(args: string[], envOver: NodeJS.ProcessEnv = {}): Promise<SaidaDoCli> {
  return new Promise((resolve, reject) => {
    // NODE_TEST_CONTEXT é setado pelo node:test do processo PAI; herdado pelo
    // filho, faria o node:test do CLI pular testes (mesma armadilha do
    // trackCli.test.ts). Remover sempre.
    const env: NodeJS.ProcessEnv = { ...process.env, ...envOver };
    delete env.NODE_TEST_CONTEXT;
    for (const [k, v] of Object.entries(envOver)) if (v === undefined) delete env[k];
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

/** Roda o CLI SEM nenhuma chave de API alcançável (o settingsStore exige Electron). */
function runEngineSemChave(args: string[]): Promise<SaidaDoCli> {
  return runEngine(args, { OPENROUTER_API_KEY: undefined, DEEPSEEK_API_KEY: undefined });
}

async function writeJson(dir: string, file: string, data: unknown): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const FIXTURE_SLUG = 'fixture-repair';
const MOD = 'modulo-1';
const AULA_1 = 'aula-1';
const AULA_2 = 'aula-2';
const DESAFIO_1 = 'desafio-1';
const DESAFIO_2 = 'desafio-2';

/** O arquivo que o plano de reparo alveja (a superfície com a violação de ORDEM). */
const ARQUIVO_ALVO = path.join('modules', MOD, 'lessons', AULA_1, 'challenges', DESAFIO_1, 'challenge.json');

/**
 * Trilha fixture com UMA violação de ORDEM plantada: o desafio da AULA 1 usa
 * `const` na solução, e `const` só é demonstrado na teoria da AULA 2. É
 * exatamente a distinção do §5.5 — `primeiraAulaQueEnsina !== null` ⇒ ORDEM
 * (reescrever), nunca LACUNA DE CURRÍCULO (criar aula).
 */
async function escreverFixture(trackDir: string): Promise<void> {
  await writeJson(trackDir, 'track.json', {
    schemaVersion: 1,
    slug: FIXTURE_SLUG,
    title: 'Fixture do repair',
    description: 'Trilha temporária com uma violação de ORDEM plantada.',
    language: 'pt-BR',
    domain: 'programming',
    modules: [MOD],
  });
  await writeJson(path.join(trackDir, 'modules', MOD), 'module.json', {
    schemaVersion: 1,
    slug: MOD,
    title: 'Módulo 1',
    order: 1,
    lessons: [AULA_1, AULA_2],
  });
  await writeJson(path.join(trackDir, 'modules', MOD, 'lessons', AULA_1), 'lesson.json', {
    schemaVersion: 1,
    slug: AULA_1,
    title: 'Aula 1',
    summary: 'Função e retorno.',
    difficulty: 1,
    concepts: ['funcao'],
    prerequisites: [],
    theory: [
      {
        id: 's1',
        title: 'Função',
        markdown: 'Uma função devolve valor.\n\n```js\nexport function resposta() {\n  return 1;\n}\n```',
      },
    ],
    sources: [],
    challenges: [DESAFIO_1],
  });
  await writeJson(path.join(trackDir, 'modules', MOD, 'lessons', AULA_1, 'challenges', DESAFIO_1), 'challenge.json', {
    schemaVersion: 1,
    slug: DESAFIO_1,
    title: 'Desafio 1',
    concept: 'funcao',
    difficulty: 1,
    language: 'nodejs',
    statement: '# Desafio 1\n\nDevolva 2.',
    starterCode: 'export function resposta() {\n  return 0;\n}\n',
    // `const` aqui é a violação de ORDEM: quem ensina é a aula 2.
    solutionCode: 'export function resposta() {\n  const dois = 2;\n  return dois;\n}\n',
    testsCode:
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { resposta } from './solution.mjs';\ntest('devolve 2', () => { assert.equal(resposta(), 2); });\n",
    expectedTestCount: 1,
  });
  await writeJson(path.join(trackDir, 'modules', MOD, 'lessons', AULA_2), 'lesson.json', {
    schemaVersion: 1,
    slug: AULA_2,
    title: 'Aula 2',
    summary: 'const.',
    difficulty: 1,
    concepts: ['const'],
    prerequisites: [],
    theory: [
      {
        id: 's1',
        title: 'const',
        markdown: 'Uma caixa fixa.\n\n```js\nexport function resposta() {\n  const tres = 3;\n  return tres;\n}\n```',
      },
    ],
    sources: [],
    challenges: [DESAFIO_2],
  });
  await writeJson(path.join(trackDir, 'modules', MOD, 'lessons', AULA_2, 'challenges', DESAFIO_2), 'challenge.json', {
    schemaVersion: 1,
    slug: DESAFIO_2,
    title: 'Desafio 2',
    concept: 'const',
    difficulty: 1,
    language: 'nodejs',
    statement: '# Desafio 2\n\nDevolva 3.',
    starterCode: 'export function resposta() {\n  return 0;\n}\n',
    solutionCode: 'export function resposta() {\n  const tres = 3;\n  return tres;\n}\n',
    testsCode:
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { resposta } from './solution.mjs';\ntest('devolve 3', () => { assert.equal(resposta(), 3); });\n",
    expectedTestCount: 1,
  });
}

/** Cria a fixture num tmp próprio e a remove no fim (nunca toca resources/tracks). */
async function comFixture(corpo: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-repair-cli-'));
  try {
    await escreverFixture(dir);
    await corpo(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 1. `repair` existe de verdade
// ---------------------------------------------------------------------------

describe('engine CLI — repair é um COMANDO REAL (anotação #9)', () => {
  it('--help documenta repair com suas flags e NÃO o declara não-implementado', async () => {
    const r = await runEngine(['--help']);
    assert.equal(r.code, 0, `--help deve sair 0 — stderr:\n${r.stderr}`);
    assert.ok(/repair <slug>/.test(r.stdout), `repair ausente do USAGE — stdout:\n${r.stdout}`);
    assert.ok(r.stdout.includes('--aplicar'), 'a flag --aplicar precisa estar documentada');
    assert.ok(r.stdout.includes('--modelo-revisor'), 'o roteamento §6.2 precisa estar documentado');
    assert.ok(
      !/repair[^\n]*nao implementad/i.test(r.stdout),
      `o USAGE ainda declara repair como não implementado — stdout:\n${r.stdout}`,
    );
  });

  it('dry-run (default): classifica ORDEM × LACUNA, imprime o plano do catálogo fechado e sai 1', async () => {
    await comFixture(async (dir) => {
      const r = await runEngineSemChave(['repair', FIXTURE_SLUG, '--dir', dir]);
      assert.equal(r.code, 1, `há violações ⇒ exit 1 — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.ok(r.stdout.includes('REPAIR (modo dry-run)'), 'o modo default é dry-run');
      assert.ok(r.stdout.includes('REWRITE_IN_BUDGET'), `a ação de ORDEM do §5.5 não apareceu — stdout:\n${r.stdout}`);
      assert.ok(r.stdout.includes('decl:const'), 'a construção ofensora plantada precisa aparecer no plano');
      assert.ok(r.stdout.includes('LACUNAS DE CURRICULO'), 'a lista de bloqueios v1 é declarada');
      assert.ok(r.stdout.includes('LIMITACOES DECLARADAS'), '§9.2 — limitação nunca é omitida');
      assert.ok(
        r.stdout.includes('dry-run funciona SEM chave de API'),
        'a limitação "a correção exige LLM" tem de estar declarada',
      );
    });
  });

  it('dry-run NÃO grava: os artefatos da trilha ficam byte-idênticos (A-P23-3)', async () => {
    await comFixture(async (dir) => {
      const alvo = path.join(dir, ARQUIVO_ALVO);
      const antes = await fs.readFile(alvo, 'utf8');
      const r = await runEngineSemChave(['repair', FIXTURE_SLUG, '--dir', dir]);
      assert.equal(r.code, 1);
      assert.equal(await fs.readFile(alvo, 'utf8'), antes, 'o dry-run tocou o disco — a dep de gravação não pode ser chamada');
    });
  });

  it('--json entrega o plano estruturado (plano, placar inicial, bloqueios)', async () => {
    await comFixture(async (dir) => {
      const r = await runEngineSemChave(['repair', FIXTURE_SLUG, '--dir', dir, '--json']);
      assert.equal(r.code, 1);
      const dados = JSON.parse(r.stdout) as {
        slug: string;
        modo: string;
        placarInicial: { violacoes: number };
        plano: { ordens: unknown[]; deltasEsperados: unknown[] };
        escritos: unknown[];
        llmChamado: boolean;
      };
      assert.equal(dados.slug, FIXTURE_SLUG);
      assert.equal(dados.modo, 'dry-run');
      assert.equal(dados.llmChamado, false, 'o dry-run não chama LLM');
      assert.deepEqual(dados.escritos, [], 'o dry-run não grava');
      assert.ok(dados.placarInicial.violacoes > 0);
      assert.ok(dados.plano.deltasEsperados.length > 0, 'o delta esperado é o produto do dry-run');
    });
  });

  it('trilha limpa (programacao-do-zero, 0 violações) sai 0', async () => {
    const r = await runEngineSemChave(['repair', 'programacao-do-zero']);
    assert.equal(r.code, 0, `trilha sem violação ⇒ exit 0 — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.ok(r.stdout.includes('REPAIR (modo dry-run)'));
  });
});

// ---------------------------------------------------------------------------
// 2. As barreiras do repair — fail-closed em cada porta (§9.3)
// ---------------------------------------------------------------------------

describe('engine CLI — repair: barreiras estruturais (exit 2, nunca silêncio)', () => {
  it('nodejs-do-zero é SLUG PROIBIDO — recusado antes de qualquer carga', async () => {
    const r = await runEngineSemChave(['repair', 'nodejs-do-zero']);
    assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /SLUG PROIBIDO/);
  });

  it('--aplicar sem --modelo-revisor é USO INCORRETO (o §6.2 exige dois modelos)', async () => {
    await comFixture(async (dir) => {
      const r = await runEngineSemChave(['repair', FIXTURE_SLUG, '--dir', dir, '--aplicar']);
      assert.equal(r.code, 2);
      assert.match(r.stderr, /--modelo-revisor/);
      assert.match(r.stderr, /6\.2/);
    });
  });

  it('--modelo-revisor igual ao --modelo-autor é recusado (model(AUTOR) !== model(REVISOR))', async () => {
    await comFixture(async (dir) => {
      const r = await runEngineSemChave([
        'repair',
        FIXTURE_SLUG,
        '--dir',
        dir,
        '--aplicar',
        '--modelo-autor',
        'x/mesmo',
        '--modelo-revisor',
        'x/mesmo',
      ]);
      assert.equal(r.code, 2);
      assert.match(r.stderr, /model\(AUTOR\) != model\(REVISOR\)/);
    });
  });

  it('--aplicar SEM chave: aborta com erro estruturado e NÃO grava nada (fail-closed)', async () => {
    await comFixture(async (dir) => {
      const alvo = path.join(dir, ARQUIVO_ALVO);
      const antes = await fs.readFile(alvo, 'utf8');
      const r = await runEngineSemChave([
        'repair',
        FIXTURE_SLUG,
        '--dir',
        dir,
        '--aplicar',
        '--modelo-revisor',
        'fake/revisor',
      ]);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /erro estruturado \[REPAIR_/, 'o erro do repair é estruturado, com código');
      assert.match(r.stderr, /chave de API|REPAIR_SEM_LLM/i, 'a limitação (sem chave) é DECLARADA');
      assert.equal(await fs.readFile(alvo, 'utf8'), antes, 'nada pode ser gravado quando o laço falha');
    });
  });

  it('slug ausente é uso incorreto (exit 2 + USAGE)', async () => {
    const r = await runEngineSemChave(['repair']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /informe o slug/);
  });
});

// ---------------------------------------------------------------------------
// 3. O rótulo da linha de truncamento do audit (anotação #11)
// ---------------------------------------------------------------------------

/** Lê "N violacao(oes) + M aviso(s)" da linha de truncamento. */
function lerTruncamento(stdout: string): { total: number; erros: number; avisos: number } {
  const m = /\.\.\. e mais (\d+) achado\(s\) nao exibido\(s\): (\d+) violacao\(oes\) \+ (\d+) aviso\(s\)/.exec(stdout);
  assert.ok(m, `linha de truncamento ausente ou fora do formato — stdout:\n${stdout.slice(0, 3000)}`);
  return { total: Number(m[1]), erros: Number(m[2]), avisos: Number(m[3]) };
}

/** Lê o PLACAR (a fonte de verdade que já separava as duas severidades). */
function lerPlacar(stdout: string): { violacoes: number; avisos: number } {
  const v = /\n {2}violacoes \.+ (\d+)/.exec(stdout);
  const a = /\n {2}avisos \([^)]*\) \.+ (\d+)/.exec(stdout);
  assert.ok(v && a, `PLACAR não encontrado — stdout:\n${stdout.slice(-2000)}`);
  return { violacoes: Number(v[1]), avisos: Number(a[1]) };
}

// ---------------------------------------------------------------------------
// 4. generate: a F10 (laço de revisão) agora É fiada pelo CLI (anotação #10)
// ---------------------------------------------------------------------------

/** Slug temporário do generate — o run nasce em `app/content-src/<slug>`. */
function slugTemporario(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Remove o run e o produto de um slug temporário (o git fica limpo). */
async function limparSlugTemporario(slug: string): Promise<void> {
  await fs.rm(path.join(APP_DIR, 'content-src', slug), { recursive: true, force: true });
  await fs.rm(path.join(APP_DIR, 'resources', 'tracks', slug), { recursive: true, force: true });
}

describe('engine CLI — generate: o laço de revisão da F10 é INJETADO (anotação #10)', () => {
  it('SEM --modelo-revisor: a F10 fica NÃO fiada e o CLI diz como ligá-la (limitação declarada, §9.2)', async () => {
    const slug = slugTemporario('tmp-f10-off');
    try {
      // Sem chave a execução para na F0 (SEM_CHAVE) — mas a decisão de fiação
      // da F10 já foi impressa ANTES, que é o que se prova aqui.
      const r = await runEngineSemChave(['generate', slug, '--assunto', 'teste de fiacao']);
      assert.equal(r.code, 2, `sem chave o generate para declarando — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.ok(
        r.stdout.includes('F10: laco de revisao NAO fiado'),
        `a limitação da F10 tem de ser declarada — stdout:\n${r.stdout}`,
      );
      assert.ok(r.stdout.includes('--modelo-revisor'), 'a saída diz COMO ligar o laço');
    } finally {
      await limparSlugTemporario(slug);
    }
  });

  it('COM --modelo-revisor: a F10 é fiada com o roteamento do §6.2 declarado na saída', async () => {
    const slug = slugTemporario('tmp-f10-on');
    try {
      const r = await runEngineSemChave([
        'generate',
        slug,
        '--assunto',
        'teste de fiacao',
        '--modelo-revisor',
        'fake/revisor',
      ]);
      assert.equal(r.code, 2, `sem chave o generate para declarando — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.ok(
        /F10: laco de revisao FIADO — autor=\S+ revisor=fake\/revisor/.test(r.stdout),
        `a F10 não foi fiada — stdout:\n${r.stdout}`,
      );
    } finally {
      await limparSlugTemporario(slug);
    }
  });

  it('roteamento inválido (autor === revisor) é recusado ANTES de criar o run', async () => {
    const slug = slugTemporario('tmp-f10-bad');
    try {
      const r = await runEngineSemChave([
        'generate',
        slug,
        '--assunto',
        'teste de fiacao',
        '--modelo-autor',
        'x/mesmo',
        '--modelo-revisor',
        'x/mesmo',
      ]);
      assert.equal(r.code, 2);
      assert.match(r.stderr, /model\(AUTOR\) != model\(REVISOR\)/);
      await assert.rejects(
        () => fs.access(path.join(APP_DIR, 'content-src', slug)),
        'nenhum run pode nascer de um roteamento inválido',
      );
    } finally {
      await limparSlugTemporario(slug);
    }
  });

  it('--rodadas inválido é uso incorreto (o teto DURO de rodadas é do laço, §6.6)', async () => {
    const r = await runEngineSemChave(['repair', 'programacao-do-zero', '--rodadas', '0']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--rodadas invalido/);
  });
});

describe('engine CLI — audit: a linha de truncamento NÃO chama aviso de violação', () => {
  it('trilha só com AVISOS: o truncamento reporta 0 violações, batendo com o PLACAR', async () => {
    // `programacao-do-zero` tem 0 violações e avisos > 0 — o caso EXATO em que
    // o rótulo antigo mentia: ele chamava todos os achados de "violacao(oes)".
    const r = await runEngineSemChave(['audit', 'programacao-do-zero', '--limite', '0']);
    assert.equal(r.code, 0, `0 violações ⇒ exit 0 — stderr:\n${r.stderr}`);
    const trunc = lerTruncamento(r.stdout);
    const placar = lerPlacar(r.stdout);
    assert.ok(placar.avisos > 0, 'a fixture desta prova precisa ter avisos (senão nada é truncado)');
    assert.equal(placar.violacoes, 0, 'a trilha é limpa de ERROS — é isso que torna a mentira visível');
    assert.equal(trunc.erros, placar.violacoes, 'o truncamento tem de contar as MESMAS violações do placar');
    assert.equal(trunc.avisos, placar.avisos, 'o truncamento tem de contar os MESMOS avisos do placar');
    assert.equal(trunc.total, trunc.erros + trunc.avisos, 'o total é a soma declarada, não um rótulo só');
  });

  it('trilha com as duas severidades: erros e avisos aparecem SEPARADOS e somam o total', async () => {
    const r = await runEngineSemChave(['audit', 'nodejs-do-zero', '--limite', '0']);
    assert.equal(r.code, 1, 'trilha com violações ⇒ exit 1');
    const trunc = lerTruncamento(r.stdout);
    const placar = lerPlacar(r.stdout);
    assert.ok(trunc.erros > 0 && trunc.avisos > 0, 'esta prova exige as duas severidades presentes');
    assert.equal(trunc.erros, placar.violacoes);
    assert.equal(trunc.avisos, placar.avisos);
    assert.equal(trunc.total, trunc.erros + trunc.avisos);
  });
});

// ---------------------------------------------------------------------------
// ONDA DO REGISTRO DE LINGUAGENS — `--linguagem` / `--plataforma` no generate
// ---------------------------------------------------------------------------

/**
 * Os campos `linguagem`/`plataforma` JA existiam em `ComandosGeracao`
 * (`engine/fiacao/geraTrilha.ts:303-305`) e JA chegavam a F0 (`:947-953`) — o
 * CLI simplesmente nunca os parseava, e nenhum caminho de linha de comando
 * conseguia enche-los. Estes testes cobrem o parse e o FAIL-CLOSED da
 * validacao contra o registro de adaptadores.
 *
 * Nenhum deles chega a criar run: a validacao de flags acontece ANTES de
 * qualquer escrita em `content-src/` (o `fail()` sai com exit 2 na hora).
 */
describe('cli generate — --linguagem / --plataforma (registro de adaptadores)', () => {
  it('--linguagem sem adaptador ABORTA com exit 2 e lista o que vale', async () => {
    // 'ruby' e o id de teste desde a onda 5 (quando 'python' passou a EXISTIR
    // como segundo adaptador); o §7 o lista como proximo da fila.
    const r = await runEngineSemChave(['generate', 'trilha-nao-criada', '--assunto', 'x', '--linguagem', 'ruby']);
    assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.ok(r.stderr.includes('--linguagem invalido'), r.stderr);
    assert.ok(r.stderr.includes('ruby'), r.stderr);
    assert.ok(r.stderr.includes('javascript'), r.stderr);
    assert.ok(r.stderr.includes('nodejs'), r.stderr);
    assert.ok(r.stderr.includes('python'), r.stderr);
  });

  it('--plataforma vazia ABORTA (contexto em branco e pior que contexto ausente)', async () => {
    const r = await runEngineSemChave(['generate', 'trilha-nao-criada', '--assunto', 'x', '--plataforma', '  ']);
    assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.ok(r.stderr.includes('--plataforma vazio'), r.stderr);
  });

  it('o USAGE documenta as duas flags novas', async () => {
    const r = await runEngineSemChave([]);
    const texto = `${r.stdout}\n${r.stderr}`;
    assert.ok(texto.includes('--linguagem'), texto.slice(0, 400));
    assert.ok(texto.includes('--plataforma'), texto.slice(0, 400));
  });
});
