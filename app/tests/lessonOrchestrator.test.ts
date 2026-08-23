/**
 * tests/lessonOrchestrator.test.ts — testes UNITÁRIOS do lesson-orchestrator com
 * FAKES (research/author/runner). NUNCA toca rede nem os scripts reais da skill.
 * Cobre: a cadeia completa de fases (research→author→materialize→validate→done),
 * a MATERIALIZAÇÃO do draft nos paths do layout (stub.py / tests/test_stub.py /
 * .solution/reference.py / README.md + meta.json scenarios/expected), a ordem de
 * chamadas (setup→sessão→desafios), e a regra DES-2: só 'approved' entra em
 * lesson.challenges; weak/rejected/not_run vão para `rejected`.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import { createLessonOrchestrator, slugify, mapLanguageExtension, computeTestName } from '../electron/main/services/lessonOrchestrator';
import type { AuthorFn, LessonDraft, LessonProgress } from '../electron/main/services/lessonTypes';
import type { StudyFinding } from '@shared/ipc-contract';
import { mkTempDir, rmrf, writeFile } from './_helpers/fs';

const baseFinding = (query: string): StudyFinding => ({
  query,
  title: `T ${query}`,
  url: `https://${query}.example`,
  description: 'descrição',
});

/** LessonDraft fixo pt-BR simples: 1 desafio python. */
const draft: LessonDraft = {
  lessonTitle: 'Recursão na prática',
  lessonMarkdown: '# Recursão\n\nAula de exemplo.',
  challenges: [
    {
      slug: 'fatorial-recursivo',
      language: 'python',
      concept: 'recursao',
      difficulty: 2,
      skillLevel: 'beginner',
      title: 'Fatorial recursivo',
      statement: 'Implemente fatorial recursivo.',
      stubCode: 'def fatorial(n):\n    raise NotImplementedError\n',
      testCode: 'import unittest\nfrom stub import fatorial\nclass TestStub(unittest.TestCase):\n    def test_fatorial_de_cinco(self):\n        self.assertEqual(fatorial(5), 120)\n',
      referenceCode: 'def fatorial(n):\n    return 1 if n <= 1 else n * fatorial(n - 1)\n',
      scenarios: [
        { id: 'fatorial_de_cinco', name: 'Fatorial de cinco', type: 'example', input: '5', expected: '120', description: 'fatorial(5) = 120' },
      ],
      expectedTestCount: 1,
    },
  ],
};

/** monta uma runner fake com filesystem real em tmp; verifyVerdict configura a validate. */
function makeFakes(opts: { verifyVerdict?: string; nChallenges?: number } = {}) {
  const { verifyVerdict = 'approved', nChallenges = 1 } = opts;
  const calls: string[] = [];
  let setupRoot = '';
  const setupId = 'a1b2c3d4e5f6';
  const session = '0001';
  const relativePath = 'challenges/0007-fatorial-recursivo';
  let challengeDir = '';

  const research = {
    async plan(subject: string) {
      calls.push('plan');
      return { subject, queries: [`${subject} conceito`], findings: [baseFinding('recursao')], createdAt: new Date().toISOString() };
    },
  };

  const author: AuthorFn = async () => {
    calls.push('author');
    if (nChallenges <= 1) return { ...draft };
    // devolve n cópias do draft com slug único (para testar vários desafios)
    const challenges = Array.from({ length: nChallenges }, (_, i) => ({
      ...draft.challenges[0],
      slug: `fatorial-${i}`,
      title: `Fatorial ${i}`,
    }));
    return { ...draft, challenges };
  };

  const runner = {
    async resolveSkillDir() {
      return '/tmp/skill';
    },
    async createSetup(spec: { path: string }) {
      calls.push('createSetup');
      setupRoot = spec.path;
      await fsp.mkdir(setupRoot, { recursive: true });
      return { setupId, setupRoot: spec.path };
    },
    async newSession(root: string, _goal?: string) {
      calls.push('newSession');
      assert.equal(root, setupRoot);
      return session;
    },
    async createChallenge(root: string, c: { language: string; slug: string; concept: string; difficulty?: number; skillLevel?: string }) {
      calls.push('createChallenge');
      challengeDir = path.join(root, relativePath);
      await fsp.mkdir(challengeDir, { recursive: true });
      // meta.json base imita o que challenge-new.sh materializa por linguagem.
      await writeFile(path.join(challengeDir, 'meta.json'), JSON.stringify({
        schema_version: '1.0',
        challenge_id: '0007',
        slug: c.slug,
        title: c.slug,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-23T00:00:00Z',
        language: c.language,
        layout_profile: 'generic',
        skill_level: c.skillLevel ?? 'beginner',
        difficulty: c.difficulty ?? 2,
        target_concepts: [{ concept_id: c.concept, label: c.concept, role: 'primary' }],
        challenge_status: 'draft',
        artifacts: {
          statement_path: 'README.md',
          stub_path: 'stub.py',
          test_path: 'tests/test_stub.py',
          runner_path: 'runner.sh',
          hidden_dir: '.solution',
          reference_path: '.solution/reference.py',
        },
        execution: { test_command: ['.'], working_dir: '.', timeout_seconds: 15, expected_test_count: 1, test_count_probe: 'python_unittest_ran_line', failure_exit_codes: { policy: 'non_zero_is_failure' } },
        scenarios: [],
        oracle: { strategies: ['reference_impl'], numeric_mode: 'exact_int' },
        validation: { protocol_version: '1.0', harness: 'challenge-verify.sh', verdict: 'not_run', generation_attempts: 0, steps: {} },
        integrity: { policy: 'warn', test_sha256: null },
        student_progress: { attempts: 0, last_result: 'not_run', hint_level_used: 0, solution_revealed: false },
      }, null, 2));
      return { challengeDirAbs: challengeDir, relativePath };
    },
    async verifyChallenge(dir: string) {
      calls.push('verifyChallenge');
      assert.equal(dir, challengeDir);
      const map: Record<string, { verdict: string; rejections: string[] }> = {
        approved: { verdict: 'approved', rejections: [] },
        weak: { verdict: 'weak', rejections: ['mutation_score_below_threshold'] },
        rejected: { verdict: 'rejected', rejections: ['fails_on_reference'] },
      };
      const r = map[verifyVerdict] ?? { verdict: verifyVerdict, rejections: [] };
      return {
        verdict: r.verdict,
        mutationScore: undefined,
        killed: undefined,
        survived: undefined,
        rejections: r.rejections,
        stdout: JSON.stringify(r),
        applyExhausted: false,
      };
    },
    async testStudentAnswer() {
      throw new Error('not used in unit tests');
    },
  };

  return { runner, research, author, calls, get setupRoot() { return setupRoot; } };
}

describe('lessonOrchestrator (unit / fakes)', () => {
  let tmp = '';
  before(async () => { tmp = await mkTempDir('lesson-orch-unit-'); });
  after(async () => { await rmrf(tmp); });

  it('generateLesson: roda as 5 fases em ordem e só approved entra em lesson.challenges', async () => {
    const { runner, research, author, calls } = makeFakes({ verifyVerdict: 'approved' });
    const progress: string[] = [];
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });

    const result = await orch.generateLesson('Recursão', { onProgress: (p) => progress.push(p.phase) });

    assert.equal(result.lesson.subject, 'Recursão');
    assert.equal(result.lesson.title, 'Recursão na prática');
    assert.equal(result.lesson.challenges.length, 1);
    assert.equal(result.lesson.challenges[0].verdict, 'approved');
    assert.equal(result.lesson.challenges[0].status, 'validated');
    assert.equal(result.lesson.challenges[0].language, 'python');
    assert.equal(result.lesson.challenges[0].workspaceDir, path.join(tmp, 'recursao', 'challenges', '0007-fatorial-recursivo'));
    assert.deepEqual(result.rejected, []);
    // ordem das fases
    assert.deepEqual([...new Set(progress)], ['research', 'authoring', 'materializing', 'validating', 'done']);
    // ordem materialização: plan → author → setup → sessão → challenge → validate
    assert.equal(calls.filter((c) => c === 'plan').length, 1);
    assert.equal(calls.filter((c) => c === 'author').length, 1);
    assert.equal(calls.filter((c) => c === 'createSetup').length, 1);
    assert.equal(calls.filter((c) => c === 'newSession').length, 1);
    assert.equal(calls.filter((c) => c === 'createChallenge').length, 1);
    assert.equal(calls.filter((c) => c === 'verifyChallenge').length, 1);
    const seq = calls.map(String);
    assert.ok(seq.indexOf('createSetup') < seq.indexOf('newSession'), 'setup antes da sessão');
    assert.ok(seq.indexOf('createChallenge') < seq.indexOf('verifyChallenge'), 'challenge antes do validate');
  });

  it('generateLesson: materializa stub/tests/reference/README e atualiza meta.json no layout EXATO', async () => {
    const { runner, research, author } = makeFakes({ verifyVerdict: 'approved' });
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });

    const result = await orch.generateLesson('Recursão');
    const ws = result.lesson.challenges[0].workspaceDir;

    const stub = await fsp.readFile(path.join(ws, 'stub.py'), 'utf8');
    assert.equal(stub, draft.challenges[0].stubCode);
    const testFile = await fsp.readFile(path.join(ws, 'tests', 'test_stub.py'), 'utf8');
    assert.equal(testFile, draft.challenges[0].testCode);
    const ref = await fsp.readFile(path.join(ws, '.solution', 'reference.py'), 'utf8');
    assert.equal(ref, draft.challenges[0].referenceCode);
    const readme = await fsp.readFile(path.join(ws, 'README.md'), 'utf8');
    assert.equal(readme, draft.challenges[0].statement);
    const statementPath = result.lesson.challenges[0].statementPath;
    assert.equal(statementPath, path.join(ws, 'README.md'));

    // meta.json atualizado com a autoria
    const meta = JSON.parse(await fsp.readFile(path.join(ws, 'meta.json'), 'utf8'));
    assert.equal(meta.title, 'Fatorial recursivo');
    assert.equal(meta.execution.expected_test_count, 1);
    assert.equal(meta.scenarios.length, 1);
    assert.equal(meta.scenarios[0].scenario_id, 'fatorial_de_cinco');
    assert.equal(meta.scenarios[0].test_name, 'test_fatorial_de_cinco');
    assert.equal(meta.scenarios[0].kind, 'example');
    assert.equal(meta.difficulty, 2);
    assert.equal(meta.target_concepts[0].concept_id, 'recursao');
  });

  it('generateLesson: desafio weak vai para rejected (não entra na aula) — DES-2', async () => {
    const { runner, research, author } = makeFakes({ verifyVerdict: 'weak' });
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });

    const result = await orch.generateLesson('Recursão');
    assert.equal(result.lesson.challenges.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].verdict, 'weak');
    assert.match(result.rejected[0].reason ?? '', /mutation_score_below_threshold/);
  });

  it('generateLesson: desafio rejected vai para rejected com motivo', async () => {
    const { runner, research, author } = makeFakes({ verifyVerdict: 'rejected' });
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });

    const result = await orch.generateLesson('Recursão');
    assert.equal(result.lesson.challenges.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].verdict, 'rejected');
    assert.match(result.rejected[0].reason ?? '', /fails_on_reference/);
  });

  it('generateLesson: not_run (sem juiz) é registrado como rejeitado com motivo claro', async () => {
    const { runner, research, author } = makeFakes({ verifyVerdict: 'not_run' });
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });

    const result = await orch.generateLesson('Recursão');
    assert.equal(result.lesson.challenges.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].verdict, 'not_run');
    assert.match(result.rejected[0].reason ?? '', /juiz ausente/);
  });

  it('generateLesson: erro do autor → phase error no onProgress + rethrow', async () => {
    const { runner } = makeFakes();
    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    const author = async () => { throw new Error('deu ruim'); };
    const progress: LessonProgress[] = [];
    const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });
    await assert.rejects(() => orch.generateLesson('x', { onProgress: (p) => progress.push(p) }), /deu ruim/);
    assert.equal(progress[progress.length - 1].phase, 'error');
  });

  it('materializeChallenge: layout GO (não fixa extensão py) via meta.json.artifacts', async () => {
    // runner fake com meta.json no layout GO (stub.go / stub_test.go / .solution/reference.go).
    let challengeDir = '';
    const relativePath = 'challenges/0012-fatorial-go';
    const runnerGo = {
      async resolveSkillDir() { return '/tmp/skill'; },
      async createSetup(spec: { path: string }) {
        return { setupId: 'a1b2c3d4e5f6', setupRoot: spec.path };
      },
      async newSession() { return '0001'; },
      async createChallenge(root: string, c: { language: string; slug: string; concept: string }) {
        challengeDir = path.join(root, relativePath);
        await fsp.mkdir(challengeDir, { recursive: true });
        await writeFile(path.join(challengeDir, 'meta.json'), JSON.stringify({
          schema_version: '1.0',
          challenge_id: '0012',
          slug: c.slug,
          title: c.slug,
          created_at: '2026-08-23T00:00:00Z',
          updated_at: '2026-08-23T00:00:00Z',
          language: 'go',
          layout_profile: 'go_module',
          skill_level: 'beginner',
          difficulty: 2,
          target_concepts: [{ concept_id: c.concept, label: c.concept, role: 'primary' }],
          challenge_status: 'draft',
          artifacts: {
            statement_path: 'README.md',
            stub_path: 'stub.go',
            test_path: 'stub_test.go',
            runner_path: 'runner.sh',
            hidden_dir: '.solution',
            reference_path: '.solution/reference.go',
          },
          execution: { test_command: ['.'], working_dir: '.', timeout_seconds: 20, expected_test_count: 1, test_count_probe: 'go_test_ran_line', failure_exit_codes: { policy: 'non_zero_is_failure' } },
          scenarios: [],
          oracle: { strategies: ['reference_impl'], numeric_mode: 'exact_int' },
          validation: { protocol_version: '1.0', harness: 'challenge-verify.sh', verdict: 'not_run', generation_attempts: 0, steps: {} },
          integrity: { policy: 'warn', test_sha256: null },
          student_progress: { attempts: 0, last_result: 'not_run', hint_level_used: 0, solution_revealed: false },
        }, null, 2));
        return { challengeDirAbs: challengeDir, relativePath };
      },
      async verifyChallenge() {
        return { verdict: 'approved', rejections: [], stdout: '', applyExhausted: false };
      },
      async testStudentAnswer() { throw new Error('not used'); },
    };

    // Cópia profunda do draft de referência — não mutar o `draft` compartilhado.
    const goDraft: typeof draft.challenges[0] = JSON.parse(JSON.stringify(draft.challenges[0]));
    goDraft.language = 'go';
    goDraft.slug = 'fatorial-go';
    goDraft.title = 'Fatorial Go';
    goDraft.stubCode = 'package main\n\n// Fatorial computa n!\nfunc Fatorial(n int) int { panic("todo") }\n';
    goDraft.testCode = 'package main\n\nimport "testing"\n\nfunc TestFatorialCinco(t *testing.T) {\n\tif Fatorial(5) != 120 {\n\t\tt.Fatal("esperado 120")\n\t}\n}\n';
    goDraft.referenceCode = 'package main\n\nfunc Fatorial(n int) int {\n\tif n <= 1 { return 1 }\n\treturn n * Fatorial(n-1)\n}\n';
    goDraft.scenarios = [{ id: 'fatorial_cinco', name: 'Fatorial cinco', type: 'example', input: '5', expected: '120', description: 'fatorial(5) = 120' }];
    goDraft.expectedTestCount = 1;

    const research = { async plan() { return { subject: 'x', queries: [], findings: [], createdAt: '' }; } };
    const author: AuthorFn = async () => ({ lessonTitle: 'x', lessonMarkdown: '# x', challenges: [goDraft] });
    const orch = createLessonOrchestrator({ research, runner: runnerGo, author, setupsDir: tmp });

    const materialized = await orch.materializeChallenge(tmp, goDraft, 2, 'go');
    assert.equal(materialized.relativePath, relativePath);

    // os paths do meta.json.artifacts.* são o que orienta a escrita (extensão .go).
    assert.equal(await fsp.readFile(path.join(challengeDir, 'stub.go'), 'utf8'), goDraft.stubCode);
    assert.equal(await fsp.readFile(path.join(challengeDir, 'stub_test.go'), 'utf8'), goDraft.testCode);
    assert.equal(await fsp.readFile(path.join(challengeDir, '.solution', 'reference.go'), 'utf8'), goDraft.referenceCode);
    assert.equal(await fsp.readFile(path.join(challengeDir, 'README.md'), 'utf8'), goDraft.statement);

    // meta.json re-mergeado; test_name em go = Test<Camel>(id) (computeTestName).
    const meta = JSON.parse(await fsp.readFile(path.join(challengeDir, 'meta.json'), 'utf8'));
    assert.equal(meta.title, 'Fatorial Go');
    assert.equal(meta.scenarios.length, 1);
    assert.equal(meta.scenarios[0].test_name, 'TestFatorialCinco');
    assert.equal(meta.execution.expected_test_count, 1);
  });
});

describe('helpers puros', () => {
  it('slugify: acentos + espaços → kebab-case ASCII', () => {
    assert.equal(slugify('Introdução à Programação'), 'introducao-a-programacao');
    assert.equal(slugify('Matemática / Funções!'), 'matematica-funcoes');
    assert.equal(slugify('   Espaços   '), 'espacos');
  });

  it('slugify: vazio → fallback', () => {
    assert.equal(slugify(''), 'aula');
    assert.equal(slugify('   '), 'aula');
  });

  it('slugify: mantém kebab-case e corta a ~SLUG_MAX_LENGTH na fronteira de hífen', () => {
    const long = 'a'.repeat(60);
    assert.ok(slugify(long).length <= 40, `<= 40, veio ${slugify(long).length}`);
    assert.equal(slugify('muitas-palavras-aqui-para-testar-corte'), 'muitas-palavras-aqui-para-testar-corte'.slice(0, 40).replace(/-+$/g, ''));
  });

  it('mapLanguageExtension: mapeia as 5 implementadas + c++', () => {
    assert.deepEqual(mapLanguageExtension('python'), ['py']);
    assert.deepEqual(mapLanguageExtension('javascript'), ['mjs']);
    assert.deepEqual(mapLanguageExtension('node'), ['mjs']);
    assert.deepEqual(mapLanguageExtension('go'), ['go']);
    assert.deepEqual(mapLanguageExtension('rust'), ['rs']);
    assert.deepEqual(mapLanguageExtension('c'), ['c', 'h']);
    assert.deepEqual(mapLanguageExtension('cpp'), ['c', 'h']);
    assert.equal(mapLanguageExtension('desconhecida').length, 0);
  });

  it('computeTestName: nomes exatos como o runner reporta por linguagem', () => {
    assert.equal(computeTestName('python', 'fabr_cinco'), 'test_fabr_cinco');
    assert.equal(computeTestName('javascript', 'fabr_cinco'), 'fabr_cinco');
    assert.equal(computeTestName('node', 'fabr_cinco'), 'fabr_cinco');
    assert.equal(computeTestName('go', 'fabr_cinco'), 'TestFabrCinco');
    assert.equal(computeTestName('rust', 'fabr_cinco'), 'fabr_cinco');
    assert.equal(computeTestName('c', 'fabr_cinco'), 'fabr_cinco');
  });
});