/**
 * tests/trackOrphans.test.ts — RECONCILIAÇÃO banco ↔ disco (onda9-cache-reconcilia).
 *
 * O DEFEITO REPRODUZIDO: o dono apagou as trilhas de `resources/tracks` e a Home
 * continuou mostrando o curso "nodejs-do-zero" — porque o progresso vive no
 * SQLite (`subjects` + `challenge_attempts`) e o app nunca confrontava o banco
 * com o disco. Estado medido no banco real do dono:
 *   subjects:           1 linha  (nodejs-do-zero / programming)
 *   challenge_attempts: 2 linhas (lesson:o-que-e-programacao / cumprimentar)
 *   lessons:            0 linhas
 *   resources/tracks:   VAZIO (só .gitkeep)
 *
 * Este arquivo reconstrói EXATAMENTE esse estado num banco temporário e num
 * `resources/tracks` temporário, e prova que:
 *   1. o slug é reconhecido como ÓRFÃO (banco confrontado com o disco);
 *   2. a Home não mostra fantasma — a matéria some das listagens navegáveis;
 *   3. zero trilhas instaladas é VAZIO LEGÍTIMO ('empty'), não erro;
 *   4. NADA é apagado por conta própria — o resquício continua no banco e é
 *      REPORTADO; só a remoção EXPLÍCITA o apaga;
 *   5. a remoção é idempotente e NUNCA toca em progresso de trilha instalada.
 *
 * NENHUMA escrita em `~/.config/study-method-gui/`: todo banco vive em
 * `mkdtemp` e é apagado no fim.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { openMigratedSqlite, type SqliteConnection } from '../electron/main/db/connection';
import { createLessonRepo, type LessonRepo } from '../electron/main/db/repo';
import {
  computeOrphanState,
  formatOrphanReport,
  orphanRowCount,
  orphanSlugs,
  resolveUserDataDir,
  STUDY_DB_FILENAME,
  type TrackScopedState,
} from '../electron/main/db/reconcile';
import { buildTrackHandlers, type TrackRepoLike } from '../electron/main/ipc/track-handlers';
import type { IpcHandlerFn } from '../electron/main/ipc/safeHandle';
import { TRACK_CHANNELS } from '../shared/ipc-contract';
import type {
  SubjectSummary,
  TrackListResult,
  TrackOrphansResult,
  TrackPurgeOrphansResult,
} from '../shared/ipc-contract';
import { homeTracksState, splitSubjectsByOrphanSlug } from '../src/lib/homeSetup';
import en from '../src/i18n/locales/en/translation.json';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';

const THE_SLUG = 'nodejs-do-zero';

function call<T>(map: Map<string, IpcHandlerFn>, channel: string, payload?: unknown): Promise<T> {
  return map.get(channel)!(null, payload) as Promise<T>;
}

function state(over: Partial<TrackScopedState> = {}): TrackScopedState {
  return {
    slug: THE_SLUG,
    subjectId: 'sub-1',
    subjectName: THE_SLUG,
    domain: 'programming',
    hasOwnLessons: false,
    attemptCount: 2,
    lessonsDoneCount: 0,
    hasProficiency: false,
    generatedChallengeCount: 0,
    ...over,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A REGRA (pura) — o que é órfão
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('computeOrphanState — o disco manda', () => {
  it('slug SEM trilha instalada e SEM aula própria é ÓRFÃO (o bug do dono)', () => {
    const orphans = computeOrphanState([], [state()]);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].slug, THE_SLUG);
    // subject (1) + 2 tentativas = 3 linhas apagáveis.
    assert.equal(orphans[0].rowCount, 3);
  });

  it('trilha INSTALADA com o mesmo slug ⇒ nunca órfão (a trilha voltou)', () => {
    assert.deepEqual(computeOrphanState([THE_SLUG], [state()]), []);
    // E o slug volta a ser órfão se a trilha sumir de novo — sem estado extra:
    assert.equal(computeOrphanState([], [state()]).length, 1);
  });

  it('matéria com AULAS PRÓPRIAS no banco nunca é órfã (fluxo livre de geração)', () => {
    const livre = state({ slug: 'algebra-linear', hasOwnLessons: true, attemptCount: 0 });
    assert.deepEqual(computeOrphanState([], [livre]), []);
  });

  it('progresso de trilha SEM matéria persistida também é órfão (e conta)', () => {
    const soProgresso = state({ subjectId: null, subjectName: null, domain: null, attemptCount: 0, lessonsDoneCount: 4, hasProficiency: true });
    const orphans = computeOrphanState([], [soProgresso]);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].rowCount, 5); // 4 aulas + 1 proficiência
  });

  it('ordem estável (alfabética) — a listagem e a limpeza casam entre chamadas', () => {
    const rows = [state({ slug: 'zeta' }), state({ slug: 'alfa' }), state({ slug: 'meio' })];
    assert.deepEqual(orphanSlugs(computeOrphanState([], rows)), ['alfa', 'meio', 'zeta']);
  });

  it('slug vazio/em branco é ignorado (nunca vira alvo de remoção)', () => {
    assert.deepEqual(computeOrphanState([], [state({ slug: '   ' })]), []);
  });

  it('orphanRowCount soma as cinco fontes de linha', () => {
    assert.equal(
      orphanRowCount(state({ attemptCount: 3, lessonsDoneCount: 2, hasProficiency: true, generatedChallengeCount: 4 })),
      1 + 3 + 2 + 1 + 4,
    );
  });
});

describe('resolveUserDataDir — o CLI acha o MESMO banco que o app', () => {
  const join = (...p: string[]): string => p.join('/');
  it('linux: ~/.config/<app> (o caminho medido nesta máquina)', () => {
    assert.equal(
      resolveUserDataDir({ platform: 'linux', env: {}, home: '/home/u', appName: 'study-method-gui', join }),
      '/home/u/.config/study-method-gui',
    );
  });
  it('linux com XDG_CONFIG_HOME respeita a variável', () => {
    assert.equal(
      resolveUserDataDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/xdg' }, home: '/home/u', appName: 'a', join }),
      '/xdg/a',
    );
  });
  it('darwin e win32 seguem a regra do Electron', () => {
    assert.equal(
      resolveUserDataDir({ platform: 'darwin', env: {}, home: '/Users/u', appName: 'a', join }),
      '/Users/u/Library/Application Support/a',
    );
    assert.equal(
      resolveUserDataDir({ platform: 'win32', env: { APPDATA: 'C:/AppData' }, home: 'C:/u', appName: 'a', join }),
      'C:/AppData/a',
    );
  });
  it('o nome do arquivo é o mesmo literal do main', () => {
    assert.equal(STUDY_DB_FILENAME, 'study.db');
  });
});

describe('formatOrphanReport — mostra O QUE sairia ANTES de sair', () => {
  it('lista o inventário por slug', () => {
    const lines = formatOrphanReport(computeOrphanState([], [state()]), {
      dbPath: '/tmp/x/study.db',
      installedSlugs: [],
    });
    const text = lines.join('\n');
    assert.match(text, /trilhas: {2}nenhuma instalada/);
    assert.match(text, new RegExp(THE_SLUG));
    assert.match(text, /tentativas de desafio \.+ 2/);
    assert.match(text, /linhas que seriam apagadas \.+ 3/);
  });
  it('nada órfão é dito com todas as letras (o estado bom)', () => {
    const text = formatOrphanReport([], { dbPath: '/tmp/x/study.db', installedSlugs: ['a'] }).join('\n');
    assert.match(text, /nada órfão/);
    assert.match(text, /1 instalada/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. O CENÁRIO REAL — banco temporário + resources/tracks vazio
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('reconciliação ponta a ponta (banco temporário — NUNCA o ~/.config real)', () => {
  let tmp = '';
  let dbPath = '';
  let tracksDir = '';
  let conn: SqliteConnection | null = null;
  let repo: LessonRepo | null = null;

  /** Reconstrói o estado MEDIDO no banco do dono. */
  async function seedGhost(): Promise<void> {
    const { subject } = await repo!.upsertSubject(THE_SLUG, 'programming');
    for (const verdict of ['passed', 'abandoned'] as const) {
      await repo!.markChallengeAttempt({
        subjectId: subject.id,
        lessonId: 'lesson:o-que-e-programacao',
        challengeId: 'cumprimentar',
        verdict,
        stars: 3,
        durationMs: 73_444,
      });
    }
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'study-orphans-'));
    dbPath = path.join(tmp, 'userData', STUDY_DB_FILENAME);
    // `resources/tracks` VAZIO — com o .gitkeep do repositório, exatamente
    // como o disco do dono depois de apagar as trilhas.
    tracksDir = path.join(tmp, 'resources', 'tracks');
    await fs.mkdir(tracksDir, { recursive: true });
    await fs.writeFile(path.join(tracksDir, '.gitkeep'), '', 'utf8');
    conn = await openMigratedSqlite(dbPath);
    repo = createLessonRepo(() => conn!.db);
  });

  afterEach(async () => {
    conn?.close();
    conn = null;
    repo = null;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  function handlers(): Map<string, IpcHandlerFn> {
    return buildTrackHandlers({
      getTracksDir: () => tracksDir,
      repo: repo as unknown as TrackRepoLike,
    });
  }

  it('o estado do dono é lido do banco e reconhecido como órfão', async () => {
    await seedGhost();
    const rows = await repo!.listTrackScopedState();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slug, THE_SLUG);
    assert.equal(rows[0].attemptCount, 2);
    assert.equal(rows[0].hasOwnLessons, false);

    const res = await call<TrackOrphansResult>(handlers(), TRACK_CHANNELS.ORPHANS);
    assert.equal(res.ok, true);
    assert.ok(res.ok);
    assert.deepEqual(res.installedSlugs, []);
    assert.equal(res.orphans.length, 1);
    assert.equal(res.orphans[0].slug, THE_SLUG);
    assert.equal(res.orphans[0].attemptCount, 2);
    assert.equal(res.orphans[0].rowCount, 3);
  });

  it('A HOME: sem trilha no disco e com órfão no banco → vazio LEGÍTIMO, sem erro e sem fantasma', async () => {
    await seedGhost();
    const map = handlers();

    // (a) a seção Trilhas: ok:true com lista VAZIA — não é erro.
    const list = await call<TrackListResult>(map, TRACK_CHANNELS.LIST);
    assert.equal(list.ok, true);
    assert.ok(list.ok);
    assert.deepEqual(list.tracks, []);
    assert.equal(homeTracksState(list.tracks, null), 'empty');
    assert.notEqual(homeTracksState(list.tracks, null), 'error');

    // (b) a seção Matérias: a matéria fantasma NÃO vira cartão.
    const orphansRes = await call<TrackOrphansResult>(map, TRACK_CHANNELS.ORPHANS);
    assert.ok(orphansRes.ok);
    const topics: SubjectSummary[] = (await repo!.listSubjects()) as SubjectSummary[];
    assert.equal(topics.length, 1, 'o banco AINDA tem a matéria (nada foi apagado)');
    const split = splitSubjectsByOrphanSlug(topics, orphansRes.orphans.map((o) => o.slug));
    assert.deepEqual(split.visible, [], 'nenhum cartão fantasma na Home');
    assert.equal(split.orphaned.length, 1, 'o resquício é reportado, não sumido');

    // (c) e o progresso continua NO BANCO — a reconciliação não apaga nada.
    assert.equal((await repo!.listTrackScopedState()).length, 1);
  });

  it('banco VAZIO + disco vazio: nada órfão, nada de erro (primeira execução)', async () => {
    const map = handlers();
    const list = await call<TrackListResult>(map, TRACK_CHANNELS.LIST);
    assert.ok(list.ok);
    assert.equal(homeTracksState(list.tracks, null), 'empty');
    const res = await call<TrackOrphansResult>(map, TRACK_CHANNELS.ORPHANS);
    assert.ok(res.ok);
    assert.deepEqual(res.orphans, []);
  });

  it('a trilha VOLTA com o mesmo slug ⇒ deixa de ser órfã sozinha (nada a restaurar)', async () => {
    await seedGhost();
    await writeMinimalTrack(tracksDir, THE_SLUG);
    const res = await call<TrackOrphansResult>(handlers(), TRACK_CHANNELS.ORPHANS);
    assert.ok(res.ok);
    assert.deepEqual(res.orphans, [], 'trilha instalada ⇒ o progresso é dela de novo');
    assert.deepEqual(res.installedSlugs, [THE_SLUG]);
    // E as 2 tentativas continuam lá, intactas.
    const rows = await repo!.listTrackScopedState();
    assert.equal(rows[0].attemptCount, 2);
  });

  it('REMOÇÃO EXPLÍCITA apaga o resquício e é IDEMPOTENTE', async () => {
    await seedGhost();
    const map = handlers();
    const first = await call<TrackPurgeOrphansResult>(map, TRACK_CHANNELS.PURGE_ORPHANS, {});
    assert.ok(first.ok);
    assert.equal(first.removed.length, 1);
    assert.equal(first.removed[0].slug, THE_SLUG);
    assert.deepEqual(await repo!.listTrackScopedState(), []);
    assert.deepEqual(await repo!.listSubjects(), []);

    // Segunda passada: nada a remover, sem erro.
    const second = await call<TrackPurgeOrphansResult>(map, TRACK_CHANNELS.PURGE_ORPHANS, {});
    assert.ok(second.ok);
    assert.deepEqual(second.removed, []);
  });

  it('a remoção NUNCA toca em progresso de trilha INSTALADA, nem com payload mentiroso', async () => {
    await seedGhost();
    // Uma trilha instalada, com progresso do aluno.
    await writeMinimalTrack(tracksDir, 'trilha-viva');
    await repo!.markTrackLessonDone('trilha-viva', 'aula-1');
    const { subject } = await repo!.upsertSubject('trilha-viva', 'programming');
    await repo!.markChallengeAttempt({
      subjectId: subject.id,
      lessonId: 'lesson:aula-1',
      challengeId: 'x',
      verdict: 'passed',
      stars: 3,
      durationMs: 1,
    });

    const map = handlers();
    // O renderer PEDE a remoção da trilha viva (payload IPC não é confiável).
    const res = await call<TrackPurgeOrphansResult>(map, TRACK_CHANNELS.PURGE_ORPHANS, {
      slugs: ['trilha-viva', THE_SLUG],
    });
    assert.ok(res.ok);
    assert.deepEqual(res.removed.map((r) => r.slug), [THE_SLUG], 'só o órfão saiu');
    assert.deepEqual(res.skipped, ['trilha-viva'], 'o pedido inválido é recusado e reportado');

    const rows = await repo!.listTrackScopedState();
    assert.deepEqual(rows.map((r) => r.slug), ['trilha-viva']);
    assert.equal(rows[0].lessonsDoneCount, 1);
    assert.equal(rows[0].attemptCount, 1);
  });

  it('diretório de trilhas ILEGÍVEL ⇒ erro estruturado, JAMAIS "tudo órfão"', async () => {
    await seedGhost();
    const map = buildTrackHandlers({
      getTracksDir: () => path.join(tmp, 'nao-existe'),
      repo: repo as unknown as TrackRepoLike,
    });
    const res = await call<TrackOrphansResult>(map, TRACK_CHANNELS.ORPHANS);
    assert.equal(res.ok, false);
    assert.ok(!res.ok && /trilhas instaladas/.test(res.error));
    // Fail-closed de verdade: a remoção também recusa.
    const purge = await call<TrackPurgeOrphansResult>(map, TRACK_CHANNELS.PURGE_ORPHANS, {});
    assert.equal(purge.ok, false);
    assert.equal((await repo!.listTrackScopedState()).length, 1, 'nada foi apagado');
  });

  it('sem repo (persistência desabilitada) os canais respondem gracioso', async () => {
    const map = buildTrackHandlers({ getTracksDir: () => tracksDir });
    const res = await call<TrackOrphansResult>(map, TRACK_CHANNELS.ORPHANS);
    assert.equal(res.ok, false);
    const purge = await call<TrackPurgeOrphansResult>(map, TRACK_CHANNELS.PURGE_ORPHANS, {});
    assert.equal(purge.ok, false);
  });

  it('purgeTrackScopedState de slug inexistente é no-op (null)', async () => {
    assert.equal(await repo!.purgeTrackScopedState('nao-existe'), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. As funções puras da Home + as chaves i18n do estado vazio
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('homeTracksState — vazio é estado, não erro', () => {
  it('null ⇒ loading; [] ⇒ empty; com item ⇒ list; erro ⇒ error', () => {
    assert.equal(homeTracksState(null, null), 'loading');
    assert.equal(homeTracksState([], null), 'empty');
    assert.equal(homeTracksState([{}], null), 'list');
    assert.equal(homeTracksState([], 'falhou'), 'error');
  });
  it("erro com texto VAZIO ainda é erro (falsy-proof: só null é 'sem erro')", () => {
    assert.equal(homeTracksState([], ''), 'error');
  });
});

describe('splitSubjectsByOrphanSlug', () => {
  const subject = (slug: string): SubjectSummary => ({
    id: slug,
    name: slug,
    slug,
    domain: 'programming',
    lessonCount: 0,
    answeredCount: 0,
  });

  it('separa o resquício das matérias alcançáveis', () => {
    const { visible, orphaned } = splitSubjectsByOrphanSlug(
      [subject('viva'), subject(THE_SLUG)],
      [THE_SLUG],
    );
    assert.deepEqual(visible.map((s) => s.slug), ['viva']);
    assert.deepEqual(orphaned.map((s) => s.slug), [THE_SLUG]);
  });

  it('sem veredito da reconciliação (null) NADA é escondido', () => {
    const topics = [subject(THE_SLUG)];
    assert.deepEqual(splitSubjectsByOrphanSlug(topics, null).visible, topics);
    assert.deepEqual(splitSubjectsByOrphanSlug(topics, []).visible, topics);
  });

  it('topics ausente devolve listas vazias (nunca lança)', () => {
    assert.deepEqual(splitSubjectsByOrphanSlug(null, [THE_SLUG]), { visible: [], orphaned: [] });
  });
});

describe('i18n — o estado vazio e os resquícios têm texto nos DOIS locales', () => {
  const keys = [
    'home.tracksEmptyTitle',
    'home.tracksEmptyDescription',
    'home.orphansNotice',
    'home.orphansAction',
    'roadmap.noTracksHint',
    'settings.orphansTitle',
    'settings.orphansDescription',
    'settings.orphansEmpty',
    'settings.orphansRemove',
    'settings.orphansConfirmTitle',
    'settings.orphansConfirmDescription',
    'settings.orphansConfirmAction',
    'settings.orphansCliHint',
  ];
  const valueAt = (obj: Record<string, unknown>, dotted: string): unknown =>
    dotted.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], obj);

  for (const key of keys) {
    it(`${key} existe e não é vazia em pt-BR e en`, () => {
      for (const [name, bundle] of [['pt-BR', ptBR], ['en', en]] as const) {
        const value = valueAt(bundle as unknown as Record<string, unknown>, key);
        assert.equal(typeof value, 'string', `${key} ausente em ${name}`);
        assert.notEqual((value as string).trim(), '', `${key} vazia em ${name}`);
      }
    });
  }

  it('o aviso da Home interpola {{n}} (e NÃO usa `count`, que dispara plural)', () => {
    for (const bundle of [ptBR, en]) {
      const value = valueAt(bundle as unknown as Record<string, unknown>, 'home.orphansNotice') as string;
      assert.match(value, /\{\{n\}\}/);
      assert.doesNotMatch(value, /\{\{count\}\}/);
    }
  });
});

/** Escreve a MENOR trilha válida possível (um módulo, uma aula, sem desafio). */
async function writeMinimalTrack(dir: string, slug: string): Promise<void> {
  const root = path.join(dir, slug);
  const lessonDir = path.join(root, 'modules', 'modulo-1', 'lessons', 'aula-1');
  await fs.mkdir(lessonDir, { recursive: true });
  await fs.writeFile(
    path.join(root, 'track.json'),
    JSON.stringify({
      schemaVersion: 1,
      slug,
      title: slug,
      description: 'trilha de teste',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'javascript',
      modules: ['modulo-1'],
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'modules', 'modulo-1', 'module.json'),
    JSON.stringify({ schemaVersion: 1, slug: 'modulo-1', title: 'Módulo 1', order: 1, lessons: ['aula-1'] }),
    'utf8',
  );
  await fs.writeFile(
    path.join(lessonDir, 'lesson.json'),
    JSON.stringify({
      schemaVersion: 1,
      slug: 'aula-1',
      title: 'Aula 1',
      summary: 'resumo',
      difficulty: 1,
      prerequisites: [],
      challenges: [],
      sections: [{ id: 's1', title: 'Seção', body: 'corpo' }],
    }),
    'utf8',
  );
}
