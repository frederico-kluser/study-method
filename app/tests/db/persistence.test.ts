/**
 * tests/db/persistence.test.ts — integração openMigratedSqlite em arquivo REAL.
 *
 * Valida o `DatabaseSync` do node:sqlite com arquivo em disco (não `:memory:`):
 * abrir+migrar, CRUD completo pela repo, fechar a conexão, REABRIR o MESMO
 * arquivo e confirmar que os dados persistiram. É o coração da onda 2: a troca
 * do addon better-sqlite3 pelo node:sqlite embutido só é segura se o banco em
 * arquivo real abrir, migrar, persistir e reabrir corretamente.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { openMigratedSqlite } from '../../electron/main/db/connection';
import { SCHEMA_VERSION } from '../../electron/main/db/schema';
import { createLessonRepo } from '../../electron/main/db/repo';
import { mkTempDir, rmrf, fileExists } from '../_helpers/fs';

/** Todos os mkdtemp deste run — o after limpa CADA um (nenhum vaza). */
const dirs: string[] = [];

after(async () => {
  await Promise.all(dirs.map((d) => rmrf(d)));
});

describe('openMigratedSqlite — persistência em arquivo real', () => {
  it('CRUD completo → close → REABRIR o MESMO arquivo → dados persistem', async () => {
    const dir = await mkTempDir('study-persist-');
    dirs.push(dir);
    // diretório pai aninhado NÃO existe: openSqlite cria (mkdir recursivo).
    const file = join(dir, 'user-data', 'study.db');

    // ————— primeira sessão: migra e escreve —————
    const conn1 = await openMigratedSqlite(file);
    assert.equal(conn1.migrate.getUserVersion(), SCHEMA_VERSION);
    const repo1 = createLessonRepo(() => conn1.db);
    const { subject } = await repo1.upsertSubject('Persistência');
    const lessonId = await repo1.createLesson({
      subjectSlug: subject.slug,
      title: 'Sobrevive ao restart',
      body: 'corpo da aula',
      challenge: {
        slug: 's',
        title: 'T',
        language: 'py',
        concept: 'c',
        statement: 'st',
        testCasesJson: '[]',
        solutionJson: '{}',
        hints: [{ position: 1, hintText: 'h1' }],
      },
    });
    await repo1.recordAnswer(lessonId, 'resposta persistida');
    await repo1.markLessonCompleted(lessonId);
    const chId = (conn1.db.prepare('SELECT id FROM challenges LIMIT 1').get() as { id: string }).id;
    await repo1.consumeHint(chId, 'h1');
    conn1.close(); // fecha a conexão ANTES de reabrir

    // o arquivo existe em disco após abrir+fechar.
    assert.ok(await fileExists(file), 'arquivo do banco deveria existir em disco');

    // ————— segunda sessão: REABRE o MESMO arquivo —————
    const conn2 = await openMigratedSqlite(file);
    try {
      assert.equal(conn2.migrate.getUserVersion(), SCHEMA_VERSION, 'versão persistiu');
      const repo2 = createLessonRepo(() => conn2.db);
      const lesson = await repo2.getLessonById(lessonId);
      assert.ok(lesson, 'lesson deveria ter persistido');
      assert.equal(lesson!.title, 'Sobrevive ao restart');
      assert.equal(lesson!.body, 'corpo da aula');
      assert.ok(lesson!.completed_at, 'completed_at deveria ter persistido');
      const answer = await repo2.getAnswerForLesson(lessonId);
      assert.equal(answer?.answer_text, 'resposta persistida');
      const totals = await repo2.answeredTopicCount(subject.slug);
      assert.deepEqual(totals, { answered: 1, hintConsumed: 1, becameChildren: 0 });
      const list = await repo2.listSubjects();
      assert.equal(list.length, 1);
      assert.equal(list[0].lessonCount, 1);
    } finally {
      conn2.close();
    }
  });

  it('bancos em arquivos DIFERENTES são isolados (nada vaza entre arquivos)', async () => {
    const dir = await mkTempDir('study-isolate-');
    dirs.push(dir);
    const f1 = join(dir, 'a.db');
    const f2 = join(dir, 'b.db');

    const connA = await openMigratedSqlite(f1);
    const repoA = createLessonRepo(() => connA.db);
    await repoA.upsertSubject('Só no A');
    connA.close();

    const connB = await openMigratedSqlite(f2);
    try {
      const repoB = createLessonRepo(() => connB.db);
      assert.deepEqual(await repoB.listSubjects(), [], 'b.db não pode ver dados de a.db');
      await repoB.upsertSubject('Só no B');
      assert.equal((await repoB.listSubjects()).length, 1);
    } finally {
      connB.close();
    }

    // reabrir A de novo: ainda tem só o assunto de A.
    const connA2 = await openMigratedSqlite(f1);
    try {
      const repoA2 = createLessonRepo(() => connA2.db);
      const list = await repoA2.listSubjects();
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Só no A');
    } finally {
      connA2.close();
    }
  });
});
