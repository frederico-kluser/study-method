/**
 * tests/cx-cli-track-cli.test.ts — CARACTERIZAÇÃO (golden master) do CLI de
 * AUTORIA de trilhas (`app/tools/track-cli.ts`, `npm run track`): os ONZE
 * subcomandos — track:new, track:module:new, track:lesson:new,
 * track:challenge:new, track:module:challenge:new, track:proficiency:new,
 * track:challenge:verify, track:challenge:context, track:validate,
 * track:list e track:reset-orphans.
 *
 * Fonte primária do contrato: cabeçalho de tools/track-cli.ts,
 * docs/00-contratos.md §8.1 (superfície Electron) e docs/16 §8. O que este
 * arquivo congela: invocações, mensagens de uso, exit codes e o SHAPE dos
 * JSONs de scaffold que o loader do app precisa carregar.
 *
 * CONTRATO CONGELADO: `track:challenge:context` é o ÚNICO subcomando que exige
 * OPENROUTER_API_KEY (fail-closed). Os testes cobrem só a RECUSA com env limpa
 * e os erros estruturados ANTES de qualquer chamada de LLM — nunca chamada real.
 *
 * O CLI escreve em app/resources/tracks/<slug> (TRACKS_DIR fixo, sem env de
 * override): cada teste usa slug kebab-case ÚNICO e apaga tudo no `finally` —
 * nenhum conteúdo versionado é tocado e o git fica limpo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { openMigratedSqlite } from '../electron/main/db/connection';
import { createLessonRepo } from '../electron/main/db/repo';

const APP_DIR = path.resolve(__dirname, '..');
const TRACKS_DIR = path.join(APP_DIR, 'resources', 'tracks');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Roda `npx tsx tools/track-cli.ts <args...>` com env limpa (sem chaves). */
function runTrack(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // env limpa PRIMEIRO (sem chaves herdadas), depois o override do teste —
    // só os testes de recusa de contexto injetam uma chave FALSA de propósito.
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.OPENROUTER_API_KEY;
    delete env.DEEPSEEK_API_KEY;
    delete env.BRAVE_API_KEY;
    delete env.DEEPSEEK_BASE_URL;
    // Ruído herdado do `npm test` (npm_config_*) faz o `npx` filho imprimir
    // "npm warn/notice" no stderr e contaminar a asserção de mensagem — fora.
    for (const k of Object.keys(env)) {
      if (/^npm_/i.test(k)) delete env[k];
    }
    Object.assign(env, opts.env ?? {});
    const semRuidoNpm = (t: string): string =>
      t
        .split('\n')
        .filter((l) => !/^npm (notice|warn|error)/.test(l))
        .join('\n');
    const child = spawn('npx', ['--no-install', 'tsx', 'tools/track-cli.ts', ...args], {
      cwd: APP_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 90_000);
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

function slugUnico(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function limparTrilha(slug: string): Promise<void> {
  await fs.rm(path.join(TRACKS_DIR, slug), { recursive: true, force: true }).catch(() => {});
}

async function lerJson(file: string): Promise<any> {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

// ─── superfície de USO ───────────────────────────────────────────────────────

describe('track CLI — superfície de uso (caracterização)', () => {
  it('sem argumentos imprime o USAGE e sai 0 (diferente do engine CLI, que sai 2)', async () => {
    const r = await runTrack([]);
    assert.equal(r.code, 0);
    assert.ok(r.stdout.startsWith('uso: npm run track -- <comando> [args...]'), r.stdout.slice(0, 200));
  });

  it('--help e -h: o mesmo USAGE, exit 0', async () => {
    for (const flag of ['--help', '-h']) {
      const r = await runTrack([flag]);
      assert.equal(r.code, 0, flag);
      assert.ok(r.stdout.startsWith('uso: npm run track -- <comando> [args...]'), flag);
    }
  });

  it('comando desconhecido: "erro: comando desconhecido: <x>" + USAGE no stderr, exit 2', async () => {
    const r = await runTrack(['wat']);
    assert.equal(r.code, 2);
    assert.ok(r.stderr.startsWith('erro: comando desconhecido: wat'), r.stderr.slice(0, 200));
    assert.ok(r.stderr.includes('uso: npm run track -- <comando> [args...]'));
  });
});

// ─── track:new ───────────────────────────────────────────────────────────────

describe('track CLI — track:new (caracterização)', () => {
  it('scaffold nasce VÁLIDO: track.json com o shape exato e o "próximo passo" no stdout', async () => {
    const slug = slugUnico('cx-new');
    try {
      const r = await runTrack(['track:new', slug, '--title', 'Trilha Nova', '--description', 'Desc.']);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`✓ trilha '${slug}' criada em ${path.join(TRACKS_DIR, slug)}`), r.stdout);
      assert.ok(r.stdout.includes(`  próximo: npm run track -- track:module:new ${slug} <moduleSlug> --title "..." --order 1`));
      const track = await lerJson(path.join(TRACKS_DIR, slug, 'track.json'));
      assert.deepEqual(track, {
        schemaVersion: 1,
        slug,
        title: 'Trilha Nova',
        description: 'Desc.',
        language: 'pt-BR',
        domain: 'programming',
        modules: [],
      });
    } finally {
      await limparTrilha(slug);
    }
  });

  it('--criteria "a; b; c" vira entryCriteria (split ";", trim, filtra vazios); --domain math vira domain', async () => {
    const slug = slugUnico('cx-crit');
    try {
      const r = await runTrack([
        'track:new',
        slug,
        '--title',
        'Trilha Critérios',
        '--description',
        'Desc.',
        '--domain',
        'math',
        '--criteria',
        'Aritmética básica;  ; Ler enunciados',
      ]);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes('  critérios de entrada: Aritmética básica; Ler enunciados'), r.stdout);
      const track = await lerJson(path.join(TRACKS_DIR, slug, 'track.json'));
      assert.equal(track.domain, 'math');
      assert.deepEqual(track.entryCriteria, ['Aritmética básica', 'Ler enunciados']);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('sem --criteria o campo entryCriteria NÃO existe (trilha de senso iniciante)', async () => {
    const slug = slugUnico('cx-semcrit');
    try {
      const r = await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      assert.equal(r.code, 0, r.stderr);
      const track = await lerJson(path.join(TRACKS_DIR, slug, 'track.json'));
      assert.equal('entryCriteria' in track, false);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('argv inválido — sem slug, sem --title, sem --description e trilha duplicada: exit 2', async () => {
    const slug = slugUnico('cx-newdup');
    try {
      const casos: Array<{ args: string[]; erro: string }> = [
        { args: ['track:new'], erro: 'erro: track:new <slug>' },
        { args: ['track:new', slug], erro: 'erro: flag --title obrigatória' },
        { args: ['track:new', slug, '--title', 'T'], erro: 'erro: flag --description obrigatória' },
      ];
      for (const caso of casos) {
        const r = await runTrack(caso.args);
        assert.equal(r.code, 2, caso.args.join(' '));
        assert.ok(r.stderr.startsWith(caso.erro), `${caso.args.join(' ')} → ${r.stderr.slice(0, 200)}`);
        assert.ok(r.stderr.includes('uso: npm run track -- <comando> [args...]'));
      }
      assert.equal((await runTrack(['track:new', slug, '--title', 'T', '--description', 'D'])).code, 0);
      const dup = await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      assert.equal(dup.code, 2);
      assert.ok(dup.stderr.startsWith(`erro: trilha '${slug}' já existe em ${path.join(TRACKS_DIR, slug)}`), dup.stderr);
    } finally {
      await limparTrilha(slug);
    }
  });
});

// ─── track:module:new / track:lesson:new ─────────────────────────────────────

describe('track CLI — scaffold de módulo e aula (caracterização)', () => {
  it('track:module:new grava module.json e declara o módulo no track.json', async () => {
    const slug = slugUnico('cx-mod');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      const r = await runTrack(['track:module:new', slug, 'modulo-um', '--title', 'Fundamentos', '--order', '1']);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`✓ módulo 'modulo-um' criado e declarado na trilha '${slug}'.`), r.stdout);
      const mod = await lerJson(path.join(TRACKS_DIR, slug, 'modules', 'modulo-um', 'module.json'));
      assert.deepEqual(mod, {
        schemaVersion: 1,
        slug: 'modulo-um',
        title: 'Fundamentos',
        order: 1,
        lessons: [],
      });
      const track = await lerJson(path.join(TRACKS_DIR, slug, 'track.json'));
      assert.deepEqual(track.modules, ['modulo-um']);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('track:module:new — --order inválido e módulo duplicado: exit 2', async () => {
    const slug = slugUnico('cx-moderr');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      const ordem = await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '0']);
      assert.equal(ordem.code, 2);
      assert.ok(ordem.stderr.startsWith('erro: --order deve ser inteiro >= 1'), ordem.stderr);
      const faltando = await runTrack(['track:module:new', slug]);
      assert.equal(faltando.code, 2);
      assert.ok(faltando.stderr.startsWith('erro: track:module:new <slug> <moduleSlug>'));
      assert.equal((await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1'])).code, 0);
      const dup = await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      assert.equal(dup.code, 2);
      assert.ok(dup.stderr.startsWith(`erro: módulo 'm1' já existe em `), dup.stderr);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('track:lesson:new grava lesson.json (teoria TODO) e declara a aula no module.json', async () => {
    const slug = slugUnico('cx-les');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      const r = await runTrack(['track:lesson:new', slug, 'm1', 'aula-um', '--title', 'A', '--summary', 'S']);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`✓ aula 'aula-um' criada no módulo 'm1'.`), r.stdout);
      assert.ok(r.stdout.includes(`  preencha a teoria e rode: npm run track -- track:validate ${slug}`));
      const aula = await lerJson(path.join(TRACKS_DIR, slug, 'modules', 'm1', 'lessons', 'aula-um', 'lesson.json'));
      assert.equal(aula.slug, 'aula-um');
      assert.equal(aula.difficulty, 1);
      assert.deepEqual(aula.concepts, []);
      assert.deepEqual(aula.prerequisites, []);
      assert.deepEqual(aula.sources, []);
      assert.deepEqual(aula.challenges, []);
      assert.equal(aula.theory.length, 1);
      assert.equal(aula.theory[0].id, 'introducao');
      assert.equal(aula.theory[0].title, 'Introdução');
      assert.ok(String(aula.theory[0].markdown).startsWith('TODO: escreva aqui a base teórica'));
      const mod = await lerJson(path.join(TRACKS_DIR, slug, 'modules', 'm1', 'module.json'));
      assert.deepEqual(mod.lessons, ['aula-um']);

      const dup = await runTrack(['track:lesson:new', slug, 'm1', 'aula-um', '--title', 'A', '--summary', 'S']);
      assert.equal(dup.code, 2);
      assert.ok(dup.stderr.startsWith("erro: aula 'aula-um' já existe em "), dup.stderr);
    } finally {
      await limparTrilha(slug);
    }
  });
});

// ─── track:challenge:new / track:module:challenge:new / proficiency ──────────

describe('track CLI — scaffold de desafio (caracterização)', () => {
  it('track:challenge:new: template nodejs com expectedTestCount 1, fn camelCase do slug e declaração na aula', async () => {
    const slug = slugUnico('cx-ch');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      const r = await runTrack([
        'track:challenge:new', slug, 'm1', 'a1', 'desafio-um',
        '--title', 'Desafio Um', '--concept', 'variaveis',
      ]);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`✓ desafio 'desafio-um' criado na aula 'a1'.`), r.stdout);
      assert.ok(
        r.stdout.includes(`  npm run track -- track:challenge:verify ${slug} m1 a1 desafio-um`),
        r.stdout,
      );
      const ch = await lerJson(
        path.join(TRACKS_DIR, slug, 'modules', 'm1', 'lessons', 'a1', 'challenges', 'desafio-um', 'challenge.json'),
      );
      assert.equal(ch.language, 'nodejs');
      assert.equal(ch.expectedTestCount, 1);
      assert.equal(ch.difficulty, 2);
      assert.ok(ch.starterCode.includes('export function desafioUm(x)'), ch.starterCode);
      assert.ok(ch.solutionCode.includes('export function desafioUm(x)'));
      assert.ok(ch.testsCode.includes("import { desafioUm } from './solution.mjs'"));
      assert.ok(typeof ch.minFirstStarMs === 'number');
      const aula = await lerJson(path.join(TRACKS_DIR, slug, 'modules', 'm1', 'lessons', 'a1', 'lesson.json'));
      assert.deepEqual(aula.challenges, ['desafio-um']);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('track:challenge:new sem --concept: exit 2 "flag --concept obrigatória"', async () => {
    const slug = slugUnico('cx-cherr');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      const r = await runTrack(['track:challenge:new', slug, 'm1', 'a1', 'c1', '--title', 'C']);
      assert.equal(r.code, 2);
      assert.ok(r.stderr.startsWith('erro: flag --concept obrigatória'), r.stderr);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('track:module:challenge:new --files "a,b" monta desafio MULTI-ARQUIVO (expectedTestCount = nº de arquivos) e declara no module.json', async () => {
    const slug = slugUnico('cx-mch');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      const r = await runTrack([
        'track:module:challenge:new', slug, 'm1', 'desafio-mod',
        '--title', 'Desafio do Módulo', '--concept', 'variaveis', '--files', 'lib/soma.mjs,lib/multiplica.mjs',
      ]);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`✓ desafio do módulo 'desafio-mod' criado em`), r.stdout);
      const ch = await lerJson(path.join(TRACKS_DIR, slug, 'modules', 'm1', 'challenges', 'desafio-mod', 'challenge.json'));
      assert.equal(ch.expectedTestCount, 2);
      assert.deepEqual(
        ch.files.map((f: any) => f.path),
        ['lib/soma.mjs', 'lib/multiplica.mjs'],
      );
      assert.ok(!('starterCode' in ch) || ch.starterCode === undefined, 'multi-arquivo não tem starter de topo');
      assert.ok(ch.testsCode.includes("import { soma } from './lib/soma.mjs'"));
      const mod = await lerJson(path.join(TRACKS_DIR, slug, 'modules', 'm1', 'module.json'));
      assert.equal(mod.challenge, 'desafio-mod');
    } finally {
      await limparTrilha(slug);
    }
  });

  it('track:module:challenge:new sem --files cai no template single-file', async () => {
    const slug = slugUnico('cx-mch1');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      const r = await runTrack([
        'track:module:challenge:new', slug, 'm1', 'desafio-solo',
        '--title', 'D', '--concept', 'variaveis',
      ]);
      assert.equal(r.code, 0, r.stderr);
      const ch = await lerJson(path.join(TRACKS_DIR, slug, 'modules', 'm1', 'challenges', 'desafio-solo', 'challenge.json'));
      assert.equal(ch.expectedTestCount, 1);
      assert.ok(!('files' in ch), 'template single-file não carrega files[]');
    } finally {
      await limparTrilha(slug);
    }
  });

  it('track:proficiency:new: proficiência nasce com difficulty 5 e carência MAIOR da 1ª estrela (120000 ms)', async () => {
    const slug = slugUnico('cx-prof');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      const r = await runTrack(['track:proficiency:new', slug, '--title', 'Prof', '--concept', 'variaveis']);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`✓ teste de proficiência criado na trilha '${slug}'.`), r.stdout);
      const ch = await lerJson(path.join(TRACKS_DIR, slug, 'proficiency.json'));
      assert.equal(ch.slug, 'proficiencia');
      assert.equal(ch.difficulty, 5);
      assert.equal(ch.minFirstStarMs, 120_000);

      const err = await runTrack(['track:proficiency:new', slug, '--title', 'Prof']);
      assert.equal(err.code, 2);
      assert.ok(err.stderr.startsWith('erro: flag --concept obrigatória'), err.stderr);
    } finally {
      await limparTrilha(slug);
    }
  });
});

// ─── track:challenge:verify ──────────────────────────────────────────────────

describe('track CLI — track:challenge:verify (caracterização)', () => {
  it('scaffold aprovado pelas DUAS provas de execução: solução passa, starter FALHA, contagem bate (exit 0)', async () => {
    const slug = slugUnico('cx-ver');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      await runTrack(['track:challenge:new', slug, 'm1', 'a1', 'c1', '--title', 'C', '--concept', 'variaveis']);
      const r = await runTrack(['track:challenge:verify', slug, 'm1', 'a1', 'c1'], { timeoutMs: 120_000 });
      assert.equal(r.code, 0, `stdout:\n${r.stdout}\n--- stderr:\n${r.stderr}`);
      assert.ok(r.stdout.includes("desafio 'c1' (C)"), r.stdout);
      assert.ok(r.stdout.includes('  testes declarados:        1'), r.stdout);
      assert.ok(r.stdout.includes('  testes no arquivo:        1'), r.stdout);
      assert.ok(r.stdout.includes('  solução de referência:    PASSA ✓'), r.stdout);
      assert.ok(r.stdout.includes('  starter (aluno):          FALHA (ok) ✓'), r.stdout);
      assert.ok(r.stdout.includes('✓ desafio aprovado pelas provas de execução.'), r.stdout);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('contagem declarada errada reprova: exit 1 e o placar de testes denuncia a divergência', async () => {
    const slug = slugUnico('cx-verko');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      await runTrack(['track:challenge:new', slug, 'm1', 'a1', 'c1', '--title', 'C', '--concept', 'variaveis']);
      const file = path.join(TRACKS_DIR, slug, 'modules', 'm1', 'lessons', 'a1', 'challenges', 'c1', 'challenge.json');
      const ch = await lerJson(file);
      ch.expectedTestCount = 2;
      await fs.writeFile(file, `${JSON.stringify(ch, null, 2)}\n`, 'utf8');
      const r = await runTrack(['track:challenge:verify', slug, 'm1', 'a1', 'c1'], { timeoutMs: 120_000 });
      assert.equal(r.code, 1);
      assert.ok(r.stdout.includes('  testes declarados:        2'), r.stdout);
      assert.ok(r.stdout.includes('  testes no arquivo:        1'), r.stdout);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('posicionais faltando: exit 2 com a invocação correta', async () => {
    const r = await runTrack(['track:challenge:verify', 'so-dois', 'args']);
    assert.equal(r.code, 2);
    assert.ok(
      r.stderr.startsWith('erro: track:challenge:verify <slug> <moduleSlug> <lessonSlug> <challengeSlug>'),
      r.stderr.slice(0, 200),
    );
  });
});

// ─── track:challenge:context (fail-closed de OPENROUTER_API_KEY) ─────────────

describe('track CLI — track:challenge:context (caracterização — só recusa, sem rede)', () => {
  it('env limpa: RECUSA fail-closed com exit 1 antes de qualquer chamada de LLM', async () => {
    const slug = slugUnico('cx-ctx');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      await runTrack(['track:challenge:new', slug, 'm1', 'a1', 'c1', '--title', 'C', '--concept', 'variaveis']);
      const r = await runTrack(['track:challenge:context', slug, 'm1', 'a1', 'c1'], { env: { OPENROUTER_API_KEY: '' } });
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('erro: OPENROUTER_API_KEY não definida'), r.stderr);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('com chave no ambiente, trilha inválida vira erro ESTRUTURADO (exit 1) — o contexto é montado ANTES do LLM', async () => {
    const slug = slugUnico('cx-ctxbad');
    try {
      await fs.mkdir(path.join(TRACKS_DIR, slug), { recursive: true });
      await fs.writeFile(
        path.join(TRACKS_DIR, slug, 'track.json'),
        `${JSON.stringify({ schemaVersion: 1, slug, title: 'X', description: 'D', language: 'pt-BR', domain: 'programming', modules: ['sumido'] }, null, 2)}\n`,
        'utf8',
      );
      const r = await runTrack(['track:challenge:context', slug, 'm1', 'a1', 'c1'], {
        env: { OPENROUTER_API_KEY: 'chave-falsa-somente-teste' },
      });
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes(`✗ trilha '${slug}' inválida (`), r.stderr.slice(0, 300));
      assert.ok(!r.stderr.includes('erro inesperado'), r.stderr.slice(0, 300));
    } finally {
      await limparTrilha(slug);
    }
  });

  it('desafio inexistente vira mensagem LIMPA e acionável (exit 1), nunca stack trace', async () => {
    const slug = slugUnico('cx-ctxmiss');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      const r = await runTrack(['track:challenge:context', slug, 'm1', 'a1', 'desafio-sumido'], {
        env: { OPENROUTER_API_KEY: 'chave-falsa-somente-teste' },
      });
      assert.equal(r.code, 1);
      assert.ok(
        r.stderr.includes(`✗ não foi possível montar a validação do desafio 'desafio-sumido'`),
        r.stderr.slice(0, 300),
      );
      assert.ok(r.stderr.includes(`confira os slugs com: npm run track -- track:validate ${slug}`));
    } finally {
      await limparTrilha(slug);
    }
  });
});

// ─── track:validate ──────────────────────────────────────────────────────────

describe('track CLI — track:validate (caracterização)', () => {
  it('trilha inteira roda para o aluno: exit 0, placar e veredito por desafio', async () => {
    const slug = slugUnico('cx-val');
    try {
      await runTrack(['track:new', slug, '--title', 'Trilha Válida', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      await runTrack(['track:challenge:new', slug, 'm1', 'a1', 'c1', '--title', 'C', '--concept', 'variaveis']);
      const r = await runTrack(['track:validate', slug], { timeoutMs: 120_000 });
      assert.equal(r.code, 0, `stdout:\n${r.stdout}\n--- stderr:\n${r.stderr}`);
      assert.ok(r.stdout.includes(`✓ trilha '${slug}' — Trilha Válida`), r.stdout);
      assert.ok(r.stdout.includes('  proficiência: ausente'), r.stdout);
      assert.ok(r.stdout.includes('  [m1/a1] c1: verificado ✓'), r.stdout);
      assert.ok(r.stdout.includes('  verificados: 1 · reprovados: 0'), r.stdout);
      assert.ok(r.stdout.includes(`✓ trilha '${slug}': todos os desafios verificados por execução.`), r.stdout);
    } finally {
      await limparTrilha(slug);
    }
  });

  it('desafio que não roda reprova a TRILHA INTEIRA: exit 1 e o placar espelha a saída', async () => {
    const slug = slugUnico('cx-ko');
    try {
      await runTrack(['track:new', slug, '--title', 'T', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      await runTrack(['track:challenge:new', slug, 'm1', 'a1', 'c1', '--title', 'C', '--concept', 'variaveis']);
      const file = path.join(TRACKS_DIR, slug, 'modules', 'm1', 'lessons', 'a1', 'challenges', 'c1', 'challenge.json');
      const ch = await lerJson(file);
      ch.expectedTestCount = 2;
      await fs.writeFile(file, `${JSON.stringify(ch, null, 2)}\n`, 'utf8');
      const r = await runTrack(['track:validate', slug], { timeoutMs: 120_000 });
      assert.equal(r.code, 1);
      assert.ok(r.stdout.includes('  [m1/a1] c1: NÃO VERIFICADO ✗'), r.stdout);
      assert.ok(r.stdout.includes('  verificados: 0 · reprovados: 1'), r.stdout);
      assert.ok(
        r.stderr.includes(`✗ trilha '${slug}': 1 desafio(s) NÃO VERIFICADO(S) — a trilha não roda para o aluno.`),
        r.stderr.slice(0, 300),
      );
    } finally {
      await limparTrilha(slug);
    }
  });

  it('trilha com schema quebrado: exit 1 com a lista de problemas (fail-closed)', async () => {
    const slug = slugUnico('cx-valbad');
    try {
      await fs.mkdir(path.join(TRACKS_DIR, slug), { recursive: true });
      await fs.writeFile(
        path.join(TRACKS_DIR, slug, 'track.json'),
        `${JSON.stringify({ schemaVersion: 1, slug, title: 'X', description: 'D', language: 'pt-BR', domain: 'programming', modules: ['sumido'] }, null, 2)}\n`,
        'utf8',
      );
      const r = await runTrack(['track:validate', slug]);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes(`✗ trilha '${slug}' inválida (1 problema(s)):`), r.stderr.slice(0, 300));
      assert.ok(r.stderr.includes('sumido'), r.stderr.slice(0, 400));
    } finally {
      await limparTrilha(slug);
    }
  });

  it('slug inexistente: exit 1 (o loader estoura ENOENT e o main() captura)', async () => {
    const r = await runTrack(['track:validate', 'trilha-que-nao-existe-xyz']);
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('erro inesperado:'), r.stderr.slice(0, 300));
  });

  it.skip(
    'BUG: track:validate com slug inexistente despeja stack trace em vez de erro estruturado acionável — app/tools/track-cli.ts:799',
    { skip: 'BUG: track:validate inexistente vaza stack trace (main().catch) em vez de erro limpo — app/tools/track-cli.ts:799' },
    async () => {
      // COMPORTAMENTO CORRETO segundo o padrão do próprio CLI (o mesmo que
      // track:challenge:context já faz): mensagem limpa, acionável, exit 1.
      const r = await runTrack(['track:validate', 'trilha-que-nao-existe-xyz']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes(`✗ trilha 'trilha-que-nao-existe-xyz' inválida`), r.stderr.slice(0, 300));
      assert.ok(!r.stderr.includes('at async'), 'não pode vazar stack trace');
    },
  );
});

// ─── track:list ──────────────────────────────────────────────────────────────

describe('track CLI — track:list (caracterização)', () => {
  it('lista a trilha com título e contagens; trilha quebrada aparece como INVALIDA (nunca aborta a lista)', async () => {
    const slug = slugUnico('cx-lst');
    const quebrada = slugUnico('cx-lstbad');
    try {
      await runTrack(['track:new', slug, '--title', 'Trilha Listada', '--description', 'D']);
      await runTrack(['track:module:new', slug, 'm1', '--title', 'M', '--order', '1']);
      await runTrack(['track:lesson:new', slug, 'm1', 'a1', '--title', 'A', '--summary', 'S']);
      await fs.mkdir(path.join(TRACKS_DIR, quebrada), { recursive: true });
      await fs.writeFile(
        path.join(TRACKS_DIR, quebrada, 'track.json'),
        `${JSON.stringify({ schemaVersion: 1, slug: quebrada, title: 'X', description: 'D', language: 'pt-BR', domain: 'programming', modules: ['sumido'] }, null, 2)}\n`,
        'utf8',
      );
      const r = await runTrack(['track:list']);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`- ${slug}: Trilha Listada (1 módulos, 1 aulas)`), r.stdout);
      assert.ok(r.stdout.includes(`- ${quebrada}: INVALIDA (1 problema(s))`), r.stdout);
    } finally {
      await limparTrilha(slug);
      await limparTrilha(quebrada);
    }
  });
});

// ─── track:reset-orphans ─────────────────────────────────────────────────────

describe('track CLI — track:reset-orphans (caracterização)', () => {
  it('banco inexistente: NÃO cria arquivo e declara "nada a fazer" (exit 0)', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'do-cxcli-db-'));
    try {
      const dbPath = path.join(tmp, 'study.db');
      const r = await runTrack(['track:reset-orphans', '--db', dbPath]);
      assert.equal(r.code, 0, r.stderr);
      assert.ok(r.stdout.includes(`banco não encontrado: ${dbPath}`), r.stdout);
      assert.ok(r.stdout.includes('nada a fazer (o app ainda não guardou nada aqui).'), r.stdout);
      assert.equal(existsSync(dbPath), false, 'comando de limpeza não pode fabricar o banco');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('progresso de trilha que sumiu do disco: dry-run lista sem tocar nada; --yes remove e fica idempotente', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'do-cxcli-db-'));
    const fantasma = `cx-fantasma-${Date.now().toString(36)}`;
    const dbPath = path.join(tmp, 'study.db');
    try {
      // semeia progresso de uma trilha que NÃO está em resources/tracks
      const conn = await openMigratedSqlite(dbPath);
      const repo = createLessonRepo(() => conn.db);
      await repo.setTrackProficiency(fantasma, 'passed', 3);
      conn.close();

      const dry = await runTrack(['track:reset-orphans', '--db', dbPath]);
      assert.equal(dry.code, 0, dry.stderr);
      assert.ok(dry.stdout.includes('1 resquício(s) — progresso de trilha que NÃO está mais no disco:'), dry.stdout);
      assert.ok(dry.stdout.includes(`  ${fantasma}`), dry.stdout);
      assert.ok(dry.stdout.includes('DRY-RUN: nada foi removido.'), dry.stdout);
      assert.ok(dry.stdout.includes('para remover de verdade:  npm run track -- track:reset-orphans --yes'), dry.stdout);

      const sim = await runTrack(['track:reset-orphans', '--db', dbPath, '--yes']);
      assert.equal(sim.code, 0, sim.stderr);
      assert.ok(sim.stdout.includes(`removido: ${fantasma} (`), sim.stdout);
      assert.ok(sim.stdout.includes('pronto. rode de novo para conferir (deve reportar "nada órfão").'), sim.stdout);

      const deNovo = await runTrack(['track:reset-orphans', '--db', dbPath]);
      assert.equal(deNovo.code, 0);
      assert.ok(deNovo.stdout.includes('nada órfão: todo o progresso guardado tem trilha instalada ou aula própria.'), deNovo.stdout);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  });
});
