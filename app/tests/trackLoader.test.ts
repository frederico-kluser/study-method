/**
 * tests/trackLoader.test.ts — loader de TRILHAS (rodada 8).
 *
 * Cobre trackTypes (validação de schema) + trackLoader (leitura/integridade)
 * com diretórios fakes em tmp — SEM jsdom, SEM electron.
 *
 * Contratos que mordem:
 *   1. Trilha válida carrega com todos os artefatos (módulos → aulas →
 *      desafios + proficiência opcional).
 *   2. Arquivo inválido (schemaVersion errado, slug inválido, teoria vazia,
 *      challenge sem tests) → TrackLoadError com issues detalhadas — nunca um
 *      objeto parcial.
 *   3. Referência quebrada (prerequisite/challenge declarado mas ausente) →
 *      erro de integridade.
 *   4. listTrackSlugs só lista dirs com track.json; loadAllTracks não derruba
 *      numa trilha inválida (coleta issues e segue).
 *   5. findLesson/findLessonAnywhere/findChallenge — helpers de resolução.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  TRACK_SCHEMA_VERSION,
  validateChallengeSource,
  validateLessonSource,
  validateModuleSource,
  validateTrackSource,
  type TrackChallengeSource,
  type TrackLessonSource,
  type TrackModuleSource,
  type TrackSource,
} from '../electron/main/content/trackTypes';
import {
  TrackLoadError,
  findChallenge,
  findLesson,
  findLessonAnywhere,
  listTrackSlugs,
  loadAllTracks,
  loadTrack,
} from '../electron/main/content/trackLoader';

let tmpRoot: string;

function tmpDir(): string {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'track-loader-'));
  return tmpRoot;
}

function challenge(over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'desafio-1',
    title: 'Desafio 1',
    concept: 'variaveis',
    difficulty: 1,
    language: 'nodejs',
    statement: 'Enunciado do desafio.',
    starterCode: 'export function f() { throw new Error("não implementado"); }\n',
    testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('caso 1', () => { assert.equal(f(), 1); });\n`,
    solutionCode: 'export function f() { return 1; }\n',
    expectedTestCount: 1,
    ...over,
  };
}

function lesson(over: Partial<TrackLessonSource> = {}): TrackLessonSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'aula-1',
    title: 'Aula 1',
    summary: 'Resumo da aula 1.',
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: [],
    theory: [{ id: 'introducao', title: 'Introdução', markdown: 'Texto da teoria.' }],
    sources: [{ title: 'MDN', url: 'https://example.org', description: 'Fonte' }],
    challenges: ['desafio-1'],
    ...over,
  };
}

function track(over: Partial<TrackSource> = {}): TrackSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'trilha-teste',
    title: 'Trilha de Teste',
    description: 'Descrição.',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['modulo-1'],
    ...over,
  };
}

async function writeTrack(
  dir: string,
  t: TrackSource,
  lessons: TrackLessonSource[],
  prof: TrackChallengeSource | null = null,
  opts: {
    moduleChallenge?: TrackChallengeSource;
    declareModuleChallenge?: boolean;
    /** ADITIVO (rodada 9): substitui o challenge.json da aula (ex.: multi-arquivo). */
    lessonChallenge?: TrackChallengeSource;
  } = {},
): Promise<void> {
  await fs.mkdir(path.join(dir, 'modules', 'modulo-1', 'lessons', 'aula-1', 'challenges', 'desafio-1'), { recursive: true });
  await fs.writeFile(path.join(dir, 'track.json'), JSON.stringify(t), 'utf8');
  const moduleMeta: TrackModuleSource = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'modulo-1',
    title: 'Módulo 1',
    order: 1,
    lessons: lessons.map((l) => l.slug),
    ...(opts.declareModuleChallenge && opts.moduleChallenge ? { challenge: opts.moduleChallenge.slug } : {}),
  };
  await fs.writeFile(path.join(dir, 'modules', 'modulo-1', 'module.json'), JSON.stringify(moduleMeta), 'utf8');
  for (const l of lessons) {
    await fs.writeFile(path.join(dir, 'modules', 'modulo-1', 'lessons', l.slug, 'lesson.json'), JSON.stringify(l), 'utf8');
    for (const ch of l.challenges) {
      await fs.writeFile(
        path.join(dir, 'modules', 'modulo-1', 'lessons', l.slug, 'challenges', ch, 'challenge.json'),
        JSON.stringify(opts.lessonChallenge && opts.lessonChallenge.slug === ch ? opts.lessonChallenge : challenge({ slug: ch })),
        'utf8',
      );
    }
  }
  if (opts.moduleChallenge) {
    await fs.mkdir(path.join(dir, 'modules', 'modulo-1', 'challenges', opts.moduleChallenge.slug), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'modules', 'modulo-1', 'challenges', opts.moduleChallenge.slug, 'challenge.json'),
      JSON.stringify(opts.moduleChallenge),
      'utf8',
    );
  }
  if (prof) {
    await fs.writeFile(path.join(dir, 'proficiency.json'), JSON.stringify(prof), 'utf8');
  }
}

describe('trackTypes — validação de schema', () => {
  it('rejeita schemaVersion errado e slug inválido no track.json', () => {
    const issues = validateTrackSource({ ...track(), schemaVersion: 99 }, 'track.json');
    assert.ok(issues.some((i) => i.message.includes('schemaVersion')));
    const issues2 = validateTrackSource({ ...track(), slug: 'Trilha Errada!' }, 'track.json');
    assert.ok(issues2.some((i) => i.message.includes('slug')));
  });

  it('aceita trilha válida sem issues', () => {
    assert.deepEqual(validateTrackSource(track(), 'track.json'), []);
  });

  it('rejeita aula sem teoria e sem summary', () => {
    const issues = validateLessonSource({ ...lesson(), theory: [] }, 'lesson.json');
    assert.ok(issues.some((i) => i.message.includes('theory')));
    const issues2 = validateLessonSource({ ...lesson(), summary: '' }, 'lesson.json');
    assert.ok(issues2.some((i) => i.message.includes('summary')));
  });

  it('rejeita desafio sem testsCode/solutionCode e concept não snake_case', () => {
    const issues = validateChallengeSource({ ...challenge(), testsCode: '' }, 'challenge.json');
    assert.ok(issues.some((i) => i.message.includes('testsCode')));
    const issues2 = validateChallengeSource({ ...challenge(), concept: 'Variaveis Com Espaço' }, 'challenge.json');
    assert.ok(issues2.some((i) => i.message.includes('concept')));
  });

  it('aceita minFirstStarMs customizado e rejeita fora da faixa', () => {
    assert.deepEqual(validateChallengeSource(challenge({ minFirstStarMs: 30_000 }), 'challenge.json'), []);
    const issues = validateChallengeSource(challenge({ minFirstStarMs: -5 }), 'challenge.json');
    assert.ok(issues.some((i) => i.message.includes('minFirstStarMs')));
  });

  it('ADITIVO: aceita desafio MULTI-ARQUIVO válido (files[] com path/starter/solution)', () => {
    const multi = challenge({
      files: [
        { path: 'lib/soma.mjs', starterCode: 'export function soma(a, b) { throw new Error("x"); }\n', solutionCode: 'export function soma(a, b) { return a + b; }\n' },
        { path: 'lib/multiplica.mjs', starterCode: 'export function multiplica(a, b) { throw new Error("x"); }\n', solutionCode: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    assert.deepEqual(validateChallengeSource(multi, 'challenge.json'), []);
  });

  it('ADITIVO: multi-arquivo dispensa starter/solution DE TOPO (vivem nos arquivos)', () => {
    const multi = challenge({ files: [{ path: 'lib/soma.mjs', starterCode: 'export const x = 1;\n', solutionCode: 'export const x = 2;\n' }] });
    // remove os campos de topo — o conteúdo agora vive em files[].
    const { starterCode: _s, solutionCode: _sol, ...semTopo } = multi;
    assert.deepEqual(validateChallengeSource(semTopo, 'challenge.json'), []);
  });

  it('ADITIVO: rejeita files vazio, path inseguro e path duplicado', () => {
    const vazio = validateChallengeSource(challenge({ files: [] }), 'challenge.json');
    assert.ok(vazio.some((i) => i.message.includes('files')));
    assert.ok(vazio.some((i) => i.message.includes('vazio')));

    const inseguro = validateChallengeSource(
      challenge({ files: [{ path: '../escapa.mjs', starterCode: 'a', solutionCode: 'b' }] }),
      'challenge.json',
    );
    assert.ok(inseguro.some((i) => i.message.includes('files[0].path')));
    const semExt = validateChallengeSource(
      challenge({ files: [{ path: 'lib/soma.js', starterCode: 'a', solutionCode: 'b' }] }),
      'challenge.json',
    );
    assert.ok(semExt.some((i) => i.message.includes('files[0].path')));

    const duplicado = validateChallengeSource(
      challenge({
        files: [
          { path: 'lib/soma.mjs', starterCode: 'a', solutionCode: 'b' },
          { path: 'lib/soma.mjs', starterCode: 'c', solutionCode: 'd' },
        ],
      }),
      'challenge.json',
    );
    assert.ok(duplicado.some((i) => i.message.includes('duplicado')));
  });

  it('ADITIVO: rejeita entry de files sem starterCode ou com solutionCode vazio', () => {
    const semStarter = validateChallengeSource(
      challenge({ files: [{ path: 'lib/soma.mjs', solutionCode: 'export const x = 1;\n' } as never] }),
      'challenge.json',
    );
    assert.ok(semStarter.some((i) => i.message.includes('files[0].starterCode')));
    const solVazia = validateChallengeSource(
      challenge({ files: [{ path: 'lib/soma.mjs', starterCode: 'a', solutionCode: '   ' }] }),
      'challenge.json',
    );
    assert.ok(solVazia.some((i) => i.message.includes('files[0].solutionCode')));
  });

  it('ADITIVO: module.json aceita challenge slug válido e rejeita inválido', () => {
    const modOk: TrackModuleSource = {
      schemaVersion: TRACK_SCHEMA_VERSION,
      slug: 'modulo-1',
      title: 'Módulo 1',
      order: 1,
      lessons: ['aula-1'],
      challenge: 'desafio-do-modulo',
    };
    assert.deepEqual(validateModuleSource(modOk, 'module.json'), []);
    const issues = validateModuleSource({ ...modOk, challenge: 'Desafio Errado!' }, 'module.json');
    assert.ok(issues.some((i) => i.message.includes('slug inválido')));
  });
});

describe('trackLoader — carregamento', () => {
  it('carrega trilha válida com módulos, aulas, desafios e proficiência', async () => {
    const dir = path.join(tmpDir(), 'trilha-teste');
    await writeTrack(dir, track(), [lesson()], challenge({ slug: 'proficiencia' }));

    const loaded = await loadTrack(dir);
    assert.equal(loaded.root.slug, 'trilha-teste');
    assert.equal(loaded.modules.length, 1);
    assert.equal(loaded.modules[0].lessons.length, 1);
    assert.equal(loaded.modules[0].lessons[0].challenges.length, 1);
    assert.equal(loaded.proficiency?.slug, 'proficiencia');
  });

  it('aceita trilha sem proficiência (proficiency = null)', async () => {
    const dir = path.join(tmpDir(), 'sem-prof');
    await writeTrack(dir, track(), [lesson()]);
    const loaded = await loadTrack(dir);
    assert.equal(loaded.proficiency, null);
  });

  it('lança TrackLoadError com issues quando o desafio declarado não existe', async () => {
    const dir = path.join(tmpDir(), 'ref-quebrada');
    // monta a trilha manualmente: a aula declara 'fantasma' mas o arquivo do
    // desafio NÃO é escrito em disco (integridade de referência quebrada).
    await fs.mkdir(path.join(dir, 'modules', 'modulo-1', 'lessons', 'aula-1'), { recursive: true });
    await fs.writeFile(path.join(dir, 'track.json'), JSON.stringify(track()), 'utf8');
    await fs.writeFile(
      path.join(dir, 'modules', 'modulo-1', 'module.json'),
      JSON.stringify({ schemaVersion: TRACK_SCHEMA_VERSION, slug: 'modulo-1', title: 'Módulo 1', order: 1, lessons: ['aula-1'] }),
      'utf8',
    );
    await fs.writeFile(
      path.join(dir, 'modules', 'modulo-1', 'lessons', 'aula-1', 'lesson.json'),
      JSON.stringify(lesson({ challenges: ['fantasma'] })),
      'utf8',
    );
    await assert.rejects(
      () => loadTrack(dir),
      (err: unknown) => {
        assert.ok(err instanceof TrackLoadError);
        assert.ok(err.issues.some((i) => i.message.includes('fantasma')));
        return true;
      },
    );
  });

  it('lança TrackLoadError quando prerequisite não existe em nenhum módulo', async () => {
    const dir = path.join(tmpDir(), 'pre-ausente');
    await writeTrack(dir, track(), [lesson({ prerequisites: ['aula-inexistente'] })]);
    await assert.rejects(() => loadTrack(dir), (err: unknown) => {
      assert.ok(err instanceof TrackLoadError);
      assert.ok(err.issues.some((i) => i.message.includes('prerequisite')));
      return true;
    });
  });

  it('lança TrackLoadError quando track.json é JSON inválido', async () => {
    const dir = path.join(tmpDir(), 'json-ruim');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'track.json'), 'not json {', 'utf8');
    await assert.rejects(() => loadTrack(dir));
  });

  it('listTrackSlugs só lista diretórios com track.json', async () => {
    const root = tmpDir();
    await writeTrack(path.join(root, 'trilha-teste'), track(), [lesson()]);
    await fs.mkdir(path.join(root, 'nao-trilha'), { recursive: true });
    const slugs = await listTrackSlugs(root);
    assert.deepEqual(slugs, ['trilha-teste']);
  });

  it('loadAllTracks não derruba em trilha inválida — coleta issues e segue', async () => {
    const root = tmpDir();
    await writeTrack(path.join(root, 'boa'), track({ slug: 'boa' }), [lesson()]);
    const bad = path.join(root, 'ruim');
    await fs.mkdir(bad, { recursive: true });
    await fs.writeFile(path.join(bad, 'track.json'), JSON.stringify(track({ slug: 'ruim', modules: ['modulo-ausente'] })), 'utf8');

    const { tracks, issues } = await loadAllTracks(root);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].root.slug, 'boa');
    assert.ok(issues.length > 0);
  });

  it('findLesson/findLessonAnywhere/findChallenge resolvem slugs', async () => {
    const dir = path.join(tmpDir(), 'helpers');
    await writeTrack(dir, track(), [lesson()]);
    const loaded = await loadTrack(dir);

    const found = findLesson(loaded, 'modulo-1', 'aula-1');
    assert.ok(found);
    assert.equal(findLesson(loaded, 'modulo-1', 'x'), null);

    const anywhere = findLessonAnywhere(loaded, 'aula-1');
    assert.ok(anywhere);
    assert.equal(anywhere.moduleSlug, 'modulo-1');

    const ch = findChallenge(found!, 'desafio-1');
    assert.ok(ch);
    assert.equal(findChallenge(found!, 'x'), null);
  });

  it('ADITIVO: módulo com challenge declarado carrega o desafio do módulo', async () => {
    const dir = path.join(tmpDir(), 'mod-challenge');
    const moduleChallenge = challenge({ slug: 'desafio-do-modulo', title: 'Desafio do módulo' });
    await writeTrack(dir, track(), [lesson()], null, {
      moduleChallenge,
      declareModuleChallenge: true,
    });
    const loaded = await loadTrack(dir);
    assert.equal(loaded.modules[0].challenge?.slug, 'desafio-do-modulo');
    assert.equal(loaded.modules[0].challenge?.title, 'Desafio do módulo');
  });

  it('ADITIVO: módulo SEM challenge → challenge null (válido)', async () => {
    const dir = path.join(tmpDir(), 'mod-sem-challenge');
    await writeTrack(dir, track(), [lesson()]);
    const loaded = await loadTrack(dir);
    assert.equal(loaded.modules[0].challenge, null);
  });

  it('ADITIVO: module.json declara challenge mas o arquivo não existe → TrackLoadError', async () => {
    const dir = path.join(tmpDir(), 'mod-challenge-fantasma');
    // monta manualmente: module.json declara 'fantasma' sem o arquivo em disco.
    await fs.mkdir(path.join(dir, 'modules', 'modulo-1', 'lessons', 'aula-1'), { recursive: true });
    await fs.writeFile(path.join(dir, 'track.json'), JSON.stringify(track()), 'utf8');
    await fs.writeFile(
      path.join(dir, 'modules', 'modulo-1', 'module.json'),
      JSON.stringify({
        schemaVersion: TRACK_SCHEMA_VERSION,
        slug: 'modulo-1',
        title: 'Módulo 1',
        order: 1,
        lessons: ['aula-1'],
        challenge: 'fantasma',
      }),
      'utf8',
    );
    // aula sem challenges próprios — o único problema da trilha é o desafio do
    // módulo declarado e ausente (senão o loader falharia ANTES, na aula).
    await fs.writeFile(path.join(dir, 'modules', 'modulo-1', 'lessons', 'aula-1', 'lesson.json'), JSON.stringify(lesson({ challenges: [] })), 'utf8');
    await assert.rejects(
      () => loadTrack(dir),
      (err: unknown) => {
        assert.ok(err instanceof TrackLoadError);
        assert.ok(err.issues.some((i) => i.message.includes('fantasma')));
        return true;
      },
    );
  });

  it('ADITIVO: desafio do módulo INVÁLIDO → TrackLoadError com issues do challenge', async () => {
    const dir = path.join(tmpDir(), 'mod-challenge-invalido');
    await writeTrack(dir, track(), [lesson()], null, {
      moduleChallenge: challenge({ slug: 'desafio-do-modulo', testsCode: '' }),
      declareModuleChallenge: true,
    });
    await assert.rejects(
      () => loadTrack(dir),
      (err: unknown) => {
        assert.ok(err instanceof TrackLoadError);
        assert.ok(err.issues.some((i) => i.message.includes('testsCode')));
        return true;
      },
    );
  });

  it('ADITIVO: desafio do módulo MULTI-ARQUIVO carrega com os arquivos', async () => {
    const dir = path.join(tmpDir(), 'mod-challenge-multi');
    const moduleChallenge = challenge({
      slug: 'desafio-do-modulo',
      files: [
        { path: 'lib/soma.mjs', starterCode: 'export function soma(a, b) { throw new Error("x"); }\n', solutionCode: 'export function soma(a, b) { return a + b; }\n' },
        { path: 'lib/multiplica.mjs', starterCode: 'export function multiplica(a, b) { throw new Error("x"); }\n', solutionCode: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    await writeTrack(dir, track(), [lesson()], null, {
      moduleChallenge,
      declareModuleChallenge: true,
    });
    const loaded = await loadTrack(dir);
    assert.equal(loaded.modules[0].challenge?.files?.length, 2);
    assert.equal(loaded.modules[0].challenge?.files?.[1].path, 'lib/multiplica.mjs');
  });

  it('ADITIVO: desafio MULTI-ARQUIVO de AULA carrega com os arquivos (loader-level)', async () => {
    const dir = path.join(tmpDir(), 'aula-multi');
    const multi = challenge({
      slug: 'desafio-1',
      files: [
        { path: 'lib/soma.mjs', starterCode: 'export function soma(a, b) { throw new Error("x"); }\n', solutionCode: 'export function soma(a, b) { return a + b; }\n' },
        { path: 'lib/multiplica.mjs', starterCode: 'export function multiplica(a, b) { throw new Error("x"); }\n', solutionCode: 'export function multiplica(a, b) { return a * b; }\n' },
      ],
    });
    await writeTrack(dir, track(), [lesson()], null, { lessonChallenge: multi });
    const loaded = await loadTrack(dir);
    assert.equal(loaded.modules[0].lessons[0].challenges[0].files?.length, 2);
    assert.equal(loaded.modules[0].lessons[0].challenges[0].files?.[0].path, 'lib/soma.mjs');
  });

  // F9 (autoria): a validação de files[] com path inseguro NÃO é só do
  // validateChallengeSource — o LOADER também precisa rejeitar a trilha
  // quando um challenge.json em disco carrega um path que escaparia do
  // diretório de execução ('../../x.mjs' → path.join resolveria o '..').
  it('ADITIVO: loader rejeita desafio de AULA com files[] path inseguro → TrackLoadError', async () => {
    const dir = path.join(tmpDir(), 'aula-path-traversal');
    const malicioso = challenge({
      slug: 'desafio-1',
      files: [{ path: '../../escapa.mjs', starterCode: 'export const a = 1;\n', solutionCode: 'export const a = 2;\n' }],
    });
    await writeTrack(dir, track(), [lesson()], null, { lessonChallenge: malicioso });
    await assert.rejects(
      () => loadTrack(dir),
      (err: unknown) => {
        assert.ok(err instanceof TrackLoadError);
        assert.ok(err.issues.some((i) => i.message.includes('files[0].path')));
        return true;
      },
    );
  });

  it('ADITIVO: loader rejeita DESAFIO DO MÓDULO com files[] path inseguro → TrackLoadError', async () => {
    const dir = path.join(tmpDir(), 'mod-path-traversal');
    const malicioso = challenge({
      slug: 'desafio-do-modulo',
      files: [{ path: 'a/../../escapa.mjs', starterCode: 'export const a = 1;\n', solutionCode: 'export const a = 2;\n' }],
    });
    await writeTrack(dir, track(), [lesson()], null, {
      moduleChallenge: malicioso,
      declareModuleChallenge: true,
    });
    await assert.rejects(
      () => loadTrack(dir),
      (err: unknown) => {
        assert.ok(err instanceof TrackLoadError);
        assert.ok(err.issues.some((i) => i.message.includes('files[0].path')));
        return true;
      },
    );
  });

  it('ADITIVO: assertions da aula sobrevivem ao load (campo opcional)', async () => {
    const dir = path.join(tmpDir(), 'aula-assertions');
    const comAssertions = lesson({
      assertions: [
        {
          id: 'variavel-guarda-valor',
          statement: 'Uma variável guarda um valor em memória.',
          question: 'O que uma variável guarda?',
          options: ['Um valor', 'Um programa', 'Uma pasta', 'Uma tecla'],
          answerIndex: 0,
          feedback: 'Certo! A variável é uma caixa com um valor.',
        },
      ],
    });
    await writeTrack(dir, track(), [comAssertions]);
    const loaded = await loadTrack(dir);
    const meta = loaded.modules[0].lessons[0].meta;
    assert.equal(meta.assertions?.length, 1);
    assert.equal(meta.assertions?.[0].id, 'variavel-guarda-valor');
    assert.equal(meta.assertions?.[0].answerIndex, 0);
    assert.deepEqual(meta.assertions?.[0].options, ['Um valor', 'Um programa', 'Uma pasta', 'Uma tecla']);
  });

  it('ADITIVO: aula SEM assertions carrega (trilha antiga, 0 issues)', async () => {
    const dir = path.join(tmpDir(), 'sem-assertions');
    await writeTrack(dir, track(), [lesson()]);
    const loaded = await loadTrack(dir);
    assert.equal(loaded.modules[0].lessons[0].meta.assertions, undefined);
  });

  it('ADITIVO: loader rejeita aula com assertions INVÁLIDAS → TrackLoadError', async () => {
    const dir = path.join(tmpDir(), 'assertions-invalidas');
    await writeTrack(dir, track(), [lesson({ assertions: [{ id: 'x', statement: 's', question: 'q', options: ['a', 'b', 'c'], answerIndex: 2, feedback: 'f' }] })]);
    await assert.rejects(
      () => loadTrack(dir),
      (err: unknown) => {
        assert.ok(err instanceof TrackLoadError);
        assert.ok(err.issues.some((i) => i.message.includes('options')));
        return true;
      },
    );
  });

  it('ADITIVO: loader rejeita aula com MAIS DE 3 assertions → TrackLoadError', async () => {
    const dir = path.join(tmpDir(), 'assertions-demais');
    const muitas = Array.from({ length: 4 }, (_, i) => ({
      id: `afirmacao-${i}`,
      statement: `Frase ${i}.`,
      question: `Pergunta ${i}?`,
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 0,
      feedback: 'Ok.',
    }));
    await writeTrack(dir, track(), [lesson({ assertions: muitas })]);
    await assert.rejects(
      () => loadTrack(dir),
      (err: unknown) => {
        assert.ok(err instanceof TrackLoadError);
        assert.ok(err.issues.some((i) => i.message.includes('máximo')));
        return true;
      },
    );
  });
});
