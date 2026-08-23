/**
 * tests/lesson-orchestrator-gaps.test.ts — fecha os gaps de FUNÇÃO do
 * lesson-orchestrator (onda 3): defaultSetupsDir (sem setupsDir DI),
 * readMetaJson (parse + meta não-objeto), listSetups/readSetupInstances (lê
 * setup.json de um tmp realizado), resolveSkillDirInfo, testAnswer e o caminho
 * do `challengeIdFromDir` (relativePath sem prefixo 4-digito). NUNCA toca rede
 * nem scripts reais.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import {
  createLessonOrchestrator,
  defaultSetupsDir,
  readMetaJson,
} from '../electron/main/services/lessonOrchestrator';
import type { AuthorFn, LessonDraft } from '../electron/main/services/lessonTypes';
import { mkTempDir, rmrf, writeFile } from './_helpers/fs';

/** Runner fake mínimo para os métodos de serviço usados aqui. */
function fakeRunner() {
  return {
    resolveSkillDir: async () => '/tmp/skill',
    createSetup: async (s: { path: string }) => {
      await writeFile(path.join(s.path, 'setup.json'), JSON.stringify({ setup_id: 'x', subject_slug: 's' }));
      return { setupId: 'x', setupRoot: s.path };
    },
    newSession: async () => '0001',
    createChallenge: async (root: string, c: { slug: string }) => {
      const dir = path.join(root, 'challenges', `0001-${c.slug}`);
      await writeFile(path.join(dir, 'meta.json'), JSON.stringify({ artifacts: {} }));
      return { challengeDirAbs: dir, relativePath: `challenges/0001-${c.slug}` };
    },
    verifyChallenge: async () => ({ verdict: 'approved', rejections: [], stdout: '' }),
    testStudentAnswer: async () => ({ success: true, exitCode: 0, passed: true, testsRun: 2, expectedTests: 2, verdict: 'pass', output: 'ok' }),
  };
}

const draft: LessonDraft = {
  lessonTitle: 'A',
  lessonMarkdown: '# A',
  challenges: [
    {
      slug: 'desafio',
      language: 'python',
      concept: 'recursao',
      title: 'Desafio',
      statement: 'Faça X.',
      stubCode: 'def x(): pass',
      testCode: 'import unittest\n',
      referenceCode: 'def x(): return 1',
      scenarios: [{ id: 'c1', name: 'C1', type: 'example', input: '1', expected: '1', description: 'cinco' }],
      expectedTestCount: 1,
    },
  ],
};

const author: AuthorFn = async () => ({ ...draft });

describe('lesson-orchestrator gaps', () => {
  let tmp = '';
  before(async () => { tmp = await mkTempDir('lesson-orch-gaps-'); });
  after(async () => { await rmrf(tmp); });

  it('defaultSetupsDir: sem env usa ~/.local/share/... e recai p/ env quando setado', () => {
    const prev = process.env.STUDY_METHOD_SETUPS_DIR;
    try {
      delete process.env.STUDY_METHOD_SETUPS_DIR;
      assert.ok(defaultSetupsDir().includes('study-method/setups'));
      process.env.STUDY_METHOD_SETUPS_DIR = '/custom/setups';
      assert.equal(defaultSetupsDir(), '/custom/setups');
    } finally {
      if (prev === undefined) delete process.env.STUDY_METHOD_SETUPS_DIR;
      else process.env.STUDY_METHOD_SETUPS_DIR = prev;
    }
  });

  it('createLessonOrchestrator sem setupsDir: usa defaultSetupsDir() e getGeneratedDir default', () => {
    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    const runner = fakeRunner();
    const orch = createLessonOrchestrator({ research, runner, author });
    assert.equal(orch.setupsDir, defaultSetupsDir());
    assert.equal(orch.getGeneratedDir('/s'), '/s/docs/generated');
  });

  it('readMetaJson: parse ok; JSON não-objeto → lança claro', async () => {
    const dir = path.join(tmp, 'meta-ok');
    await writeFile(path.join(dir, 'meta.json'), JSON.stringify({ a: 1 }));
    assert.deepEqual(await readMetaJson(dir), { a: 1 });

    const bad = path.join(tmp, 'meta-bad');
    await writeFile(path.join(bad, 'meta.json'), JSON.stringify(42));
    await assert.rejects(() => readMetaJson(bad), /não é objeto/);

    const missing = path.join(tmp, 'meta-missing');
    await assert.rejects(() => readMetaJson(missing), /ENOENT/);
  });

  it('listSetups: lê setup.json por subdir e ignora dirs sem meta', async () => {
    const setupsDir = path.join(tmp, 'setups');
    await writeFile(path.join(setupsDir, 'alguma-aula', 'setup.json'), JSON.stringify({ setup_id: 'aa1', subject_slug: 'python' }));
    await writeFile(path.join(setupsDir, 'sem-meta', 'arquivo.txt'), 'x');

    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    const runner = fakeRunner();
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir });
    const res = await orch.listSetups();
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].setupId, 'aa1');
    assert.equal(res.rows[0].subjectSlug, 'python');
    assert.equal(res.rows[0].setupRoot, path.join(setupsDir, 'alguma-aula'));
  });

  it('listSetups: diretório inexistente → lista vazia', async () => {
    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    const orch = createLessonOrchestrator({ research, runner: fakeRunner(), author, setupsDir: path.join(tmp, 'nao-existe') });
    assert.deepEqual(await orch.listSetups(), { rows: [] });
  });

  it('resolveSkillDirInfo e testAnswer delegam ao runner', async () => {
    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    const runner = fakeRunner();
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });

    assert.deepEqual(await orch.resolveSkillDirInfo(), { skillDir: '/tmp/skill' });

    const t = await orch.testAnswer('/tmp/ch');
    assert.equal(t.success, true);
    assert.equal(t.testsRun, 2);
    assert.equal(t.expectedTests, 2);
    assert.equal(t.verdictFeedback, 'pass');
    assert.equal(t.output, 'ok');
  });

  it('materializeChallenge: relativePath sem prefixo 4-digito → challengeId vazio (challengeIdFromDir)', async () => {
    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    let relPath = '';
    const runner = {
      resolveSkillDir: async () => '/tmp/skill',
      createSetup: async (s: { path: string }) => ({ setupId: 'x', setupRoot: s.path } as const),
      newSession: async () => '0001',
      createChallenge: async (root: string, c: { slug: string }) => {
        const dir = path.join(root, 'challenges', c.slug); // sem prefixo NNNN-
        relPath = `challenges/${c.slug}`;
        await writeFile(path.join(dir, 'meta.json'), JSON.stringify({
          challenge_id: '0042',
          artifacts: { statement_path: 'README.md', stub_path: 'stub.py', test_path: 'tests/test_stub.py', reference_path: '.solution/reference.py' },
        }));
        return { challengeDirAbs: dir, relativePath: relPath };
      },
      verifyChallenge: async () => ({ verdict: 'approved', rejections: [], stdout: '' }),
      testStudentAnswer: async () => ({ success: true, exitCode: 0, passed: true, testsRun: 1, expectedTests: 1, output: '' }),
    };
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });
    const ch = draft.challenges[0];
    const materialized = await orch.materializeChallenge(tmp, ch, 2, 'python');
    assert.equal(materialized.relativePath, relPath);
    // sem prefixo 4-digito no basename → cai no fallback do meta.challenge_id.
    assert.equal(materialized.challengeId, '0042');
  });

  it('generateLesson com goal → newSession recebe goal; not_run sem apply/protocol → reason juiz ausente', async () => {
    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    let goalSeen: string | undefined;
    const runner = {
      resolveSkillDir: async () => '/tmp/skill',
      createSetup: async (s: { path: string }) => ({ setupId: 'x', setupRoot: s.path } as const),
      newSession: async (_r: string, goal?: string) => { goalSeen = goal; return '0001'; },
      createChallenge: async (root: string, c: { slug: string }) => {
        const dir = path.join(root, 'challenges', `0001-${c.slug}`);
        await writeFile(path.join(dir, 'meta.json'), JSON.stringify({ artifacts: { statement_path: 'README.md', stub_path: 'stub.py', test_path: 'tests/test_stub.py', reference_path: '.solution/reference.py' } }));
        return { challengeDirAbs: dir, relativePath: `challenges/0001-${c.slug}` };
      },
      verifyChallenge: async () => ({ verdict: 'not_run', rejections: [], stdout: '', applyExhausted: false }),
      testStudentAnswer: async () => ({ success: true, exitCode: 0, passed: true, testsRun: 1, expectedTests: 1, output: '' }),
    };
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });
    const res = await orch.generateLesson('x', { goal: 'minha meta' });
    assert.equal(goalSeen, 'minha meta');
    assert.equal(res.lesson.challenges.length, 0);
    assert.equal(res.rejected.length, 1);
    assert.match(res.rejected[0].reason ?? '', /juiz ausente/);
  });
});