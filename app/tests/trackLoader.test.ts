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
  validateTrackSource,
  type TrackChallengeSource,
  type TrackLessonSource,
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

async function writeTrack(dir: string, t: TrackSource, lessons: TrackLessonSource[], prof: TrackChallengeSource | null = null): Promise<void> {
  await fs.mkdir(path.join(dir, 'modules', 'modulo-1', 'lessons', 'aula-1', 'challenges', 'desafio-1'), { recursive: true });
  await fs.writeFile(path.join(dir, 'track.json'), JSON.stringify(t), 'utf8');
  await fs.writeFile(
    path.join(dir, 'modules', 'modulo-1', 'module.json'),
    JSON.stringify({ schemaVersion: TRACK_SCHEMA_VERSION, slug: 'modulo-1', title: 'Módulo 1', order: 1, lessons: lessons.map((l) => l.slug) }),
    'utf8',
  );
  for (const l of lessons) {
    await fs.writeFile(path.join(dir, 'modules', 'modulo-1', 'lessons', l.slug, 'lesson.json'), JSON.stringify(l), 'utf8');
    for (const ch of l.challenges) {
      await fs.writeFile(
        path.join(dir, 'modules', 'modulo-1', 'lessons', l.slug, 'challenges', ch, 'challenge.json'),
        JSON.stringify(challenge({ slug: ch })),
        'utf8',
      );
    }
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
});
