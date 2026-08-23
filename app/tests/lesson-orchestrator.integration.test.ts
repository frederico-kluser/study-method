/**
 * tests/lesson-orchestrator.integration.test.ts — INTEGRAÇÃO do ORQUESTRADOR REAL
 * com os SCRIPTS REAIS da skill study-method (env-guarded).
 *
 * Diferente da versão antiga (que materializava MANUALMENTE), este teste RODA O
 * ORQUESTRADOR DE VERDADE: `createLessonOrchestrator` + `generateLesson`, com
 * RESEARCH fake + AUTHOR fake e RUNNER REAL (`createStudyMethodRunner({llmJudge})`
 * sobre `STUDY_METHOD_SKILL_DIR`). A cadeia inteira é exercitada de ponta a ponta:
 *   research.plan → author → setup-init.sh → session-new.sh → challenge-new.sh →
 *   (materializeChallenge sobrescreve stub/tests/reference/README) → challenge-verify.sh
 *   com JUIZ FAKE no exit 10 (classify_survivor).
 *
 * O juiz fake devolve o shape EXATO de `challenge-verify.response.schema.json`
 * (docs/05 §4.6): body = items[0] com `classifications[]` { mutant_id,
 * classification, justification }. Classificando sobreviventes como `equivalent` os
 * baitas sobreviventes saem do denominador e o score sobe para auditoria — o mesmo
 * truque que a versão antiga validou contra os scripts reais.
 *
 * Habilite com: STUDY_METHOD_INTEGRATION_TESTS=1 STUDY_METHOD_SKILL_DIR=<BASE_DIR>/skills/study-method
 * NUNCA roda no gate: garante sem rede e sem depender dos toolchains.
 */
import { after, before, describe, it as _it, test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import { createStudyMethodRunner, type StudyRequestEnvelope } from '../electron/main/services/studyMethodRunner';
import { createLessonOrchestrator, slugify } from '../electron/main/services/lessonOrchestrator';
import { mkTempDir, rmrf, readFile } from './_helpers/fs';

// Guarda de env: só roda quando STUDY_METHOD_INTEGRATION_TESTS === '1'.
type TestOptions = { timeout?: number; skip?: string | boolean };
const it =
  process.env.STUDY_METHOD_INTEGRATION_TESTS === '1'
    ? _it
    : (name: string, optsOrFn?: TestOptions | (() => void | Promise<void>), maybeFn?: () => void | Promise<void>) => {
      const opts = typeof optsOrFn === 'function' ? {} : (optsOrFn ?? {});
      const fn = typeof optsOrFn === 'function' ? optsOrFn : maybeFn;
      test(name, { skip: 'habilite com STUDY_METHOD_INTEGRATION_TESTS=1', ...opts }, fn);
    };

const SKILL_DIR = process.env.STUDY_METHOD_SKILL_DIR;

/** justificativa com >= 40 caracteres (contrato do --apply, docs/05 §4.6 item 4). */
const JUSTIFICATION =
  'Mutante e comportamentalmente identico a referencia; nenhum teste consegue distingui-lo.';

/**
 * Juiz fake para o exit 10 (classify_survivor): ecoa o request e classifica cada
 * sobrevivente como 'equivalent'. Assinatura = LlmJudge (pedido → corpo de items[0]).
 */
async function fakeJudge(pedido: StudyRequestEnvelope): Promise<unknown> {
  const payload = (pedido.payload ?? {}) as {
    challenge_id?: string;
    request_kind?: string;
    survivors?: Array<{ mutant_id: string }>;
  };
  const survivors = payload.survivors ?? [];
  return {
    schema_version: '1.0',
    request_kind: payload.request_kind ?? 'challenge_verify',
    challenge_id: payload.challenge_id ?? '',
    classifications: survivors.map((s) => ({
      mutant_id: s.mutant_id,
      classification: 'equivalent',
      justification: JUSTIFICATION,
      distinguishing_input: null,
    })),
  };
}

describe('lesson-orchestrator integration (env-guarded)', () => {
  let tmp = '';
  before(async () => {
    tmp = await mkTempDir('lesson-orch-int-');
  });
  after(async () => {
    await rmrf(tmp);
  });

  it(
    'generateLesson roda a cadeia REAL (setup→sessão→materializa→verifica) de ponta a ponta',
    { timeout: 180_000 },
    async () => {
      assert.ok(SKILL_DIR, 'STUDY_METHOD_SKILL_DIR obrigatório no teste de integração');
      const skillExists = await fsp
        .access(path.join(SKILL_DIR, 'scripts', 'challenge-verify.sh'))
        .then(() => true)
        .catch(() => false);
      assert.ok(skillExists, `skill real não encontrada em ${SKILL_DIR}`);

      // RUNNER REAL (skill via STUDY_METHOD_SKILL_DIR) + juiz fake.
      const runner = createStudyMethodRunner({
        skillDir: SKILL_DIR,
        llmJudge: fakeJudge,
        tmpDir: tmp,
        defaultTimeoutMs: 90_000,
      });

      // research fake: plano mínimo com 1 finding.
      const research = {
        async plan(subject: string) {
          return {
            subject,
            queries: [`${subject} conceito`],
            findings: [{ query: 'recursao', title: 'Recursão', url: 'https://example/recursao', description: 'recursão' }],
            createdAt: new Date().toISOString(),
          };
        },
      };

      // AUTHOR fake: LessonDraft python curto, 1 desafio. Os nomes de caso do
      // testCode são EXATAMENTE `computeTestName('python', scenario.id)` (test_<id>).
      const scenarios = [
        { id: 'fatorial_de_zero', name: 'Fatorial de zero', type: 'boundary' as const, input: '0', expected: '1', description: 'fatorial(0) = 1 — borda do domínio' },
        { id: 'fatorial_de_cinco', name: 'Fatorial de cinco', type: 'example' as const, input: '5', expected: '120', description: 'fatorial(5) = 120' },
        { id: 'fatorial_de_dez', name: 'Fatorial de dez', type: 'example' as const, input: '10', expected: '3628800', description: 'fatorial(10) = 3628800' },
      ];
      const author = async () => ({
        lessonTitle: 'Recursão na prática (integração)',
        lessonMarkdown: '# Recursão\n\nAula de exemplo de integração.',
        challenges: [
          {
            slug: 'fatorial-recursivo',
            language: 'python',
            concept: 'recursao',
            difficulty: 2,
            skillLevel: 'beginner',
            title: 'Fatorial recursivo',
            statement: 'Implemente fatorial recursivo.',
            stubCode: [
              'def fatorial(n):',
              '    raise NotImplementedError',
              '',
            ].join('\n'),
            testCode: [
              'import unittest',
              '',
              'from stub import fatorial',
              '',
              '',
              'class TestStub(unittest.TestCase):',
              '    def test_fatorial_de_zero(self):',
              '        self.assertEqual(fatorial(0), 1, "fatorial(0) deve ser 1")',
              '',
              '    def test_fatorial_de_cinco(self):',
              '        self.assertEqual(fatorial(5), 120, "fatorial(5) deve ser 120")',
              '',
              '    def test_fatorial_de_dez(self):',
              '        self.assertEqual(fatorial(10), 3628800, "fatorial(10) deve ser 3628800")',
              '',
              '',
              'if __name__ == "__main__":',
              '    unittest.main()',
              '',
            ].join('\n'),
            referenceCode: [
              'def fatorial(n):',
              '    if n < 0:',
              '        raise ValueError("negativo")',
              '    resultado = 1',
              '    for i in range(2, n + 1):',
              '        resultado *= i',
              '    return resultado',
              '',
            ].join('\n'),
            scenarios,
            expectedTestCount: scenarios.length,
          },
        ],
      });

      // ORQUESTRADOR REAL: chama generateLesson de VERDADE.
      const orch = createLessonOrchestrator({ research, runner, author, setupsDir: tmp });
      const { lesson, rejected } = await orch.generateLesson('Recursão');

      // O setup materializou sob <setupsDir>/<slug>.
      const slug = slugify('Recursão');
      const setupRoot = path.join(tmp, slug);

      // Total = 1 desafio (aprovado OU rejeitado por motivo real).
      assert.equal(lesson.challenges.length + rejected.length, 1, 'exatamente 1 desafio na cadeia');

      // VERDICT NUNCA 'not_run': o juiz fake permite o exit 10 prosseguir (a menos
      // que o verify tenha legitimamente terminado sem juiz — que não é o caso aqui).
      if (rejected.length > 0) {
        assert.notEqual(rejected[0].verdict, 'not_run', `rejeitado na cadeia deveria ter veredito real, veio: ${rejected[0].verdict}`);
        assert.ok(
          !/juiz ausente/.test(rejected[0].reason ?? ''),
          `motivo não deveria citar juiz ausente: ${rejected[0].reason}`,
        );
      }

      // Localiza o diretório do desafio materializado em <setup>/challenges/.
      const challengeDirs = await fsp.readdir(path.join(setupRoot, 'challenges'));
      assert.equal(challengeDirs.length, 1, `esperado 1 desafio em challenges, veio ${challengeDirs.length}`);
      const challengeDir = path.join(setupRoot, 'challenges', challengeDirs[0]);

      // Arquivos materializados EXISTEM com o conteúdo da autoria.
      const meta = JSON.parse(await readFile(path.join(challengeDir, 'meta.json')));
      const artifacts = meta.artifacts as {
        statement_path: string;
        stub_path: string;
        test_path: string;
        reference_path: string;
      };
      const stubPath = path.join(challengeDir, artifacts.stub_path);
      const testPath = path.join(challengeDir, artifacts.test_path);
      const refPath = path.join(challengeDir, artifacts.reference_path);
      await fsp.access(stubPath);
      await fsp.access(testPath);
      await fsp.access(refPath);

      const stub = await readFile(stubPath);
      assert.match(stub, /def fatorial\(n\)/);
      const testCode = await readFile(testPath);
      assert.match(testCode, /test_fatorial_de_zero/);
      assert.match(testCode, /test_fatorial_de_cinco/);
      const ref = await readFile(refPath);
      assert.match(ref, /def fatorial\(n\)/);

      // meta.json foi RE-MERGEADO pela autoria (writeMeta).
      assert.equal(meta.title, 'Fatorial recursivo');
      assert.equal(meta.execution.expected_test_count, scenarios.length);
      assert.equal(meta.scenarios.length, scenarios.length);
      assert.deepEqual(
        meta.scenarios.map((s: { test_name: string }) => s.test_name),
        ['test_fatorial_de_zero', 'test_fatorial_de_cinco', 'test_fatorial_de_dez'],
      );

      // Se aprovado, entra em lesson.challenges com status validated.
      if (lesson.challenges.length === 1) {
        assert.equal(lesson.challenges[0].verdict, 'approved');
        assert.equal(lesson.challenges[0].status, 'validated');
        assert.equal(lesson.challenges[0].language, 'python');
        assert.equal(lesson.challenges[0].workspaceDir, challengeDir);
      }
    },
  );
});