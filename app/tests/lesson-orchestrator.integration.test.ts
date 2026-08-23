/**
 * tests/lesson-orchestrator.integration.test.ts — INTEGRAÇÃO com os SCRIPTS REAIS
 * da skill study-method (env-guarded).
 *
 * Habilite com: STUDY_METHOD_INTEGRATION_TESTS=1 STUDY_METHOD_SKILL_DIR=<BASE_DIR>/skills/study-method
 * (o runner REAL resolve a skill via env). Roda o fluxo de materialização REAL:
 *   setup-init.sh → session-new.sh → challenge-new.sh → (escrita dos artefatos
 *   em tmp) → challenge-verify.sh com um JUIZ FAKE no REQUEST/APPLY (exit 10).
 *
 * O juiz fake devolve `hidden` em disco classifica os sobreviventes pelo shape
 * EXATO de `challenge-verify.response.schema.json` (docs/05 §4.6): body = items[0]
 * com `classifications[]` { conflict_id? mutant_id, classification, justification }.
 * Semanticamente usa `classification: "equivalent"` com justificativa >= 40 chars
 * — baita sobreviventes equivalentes saem do denominador (score sobe para auditoria).
 *
 * NUNCA roda no gate: garante sem rede e sem depender dos toolchains. É apenas o
 * guarda-corpo manual de validar a fiação contra os scripts reais.
 */
import { after, before, describe, it as _it, test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import { createStudyMethodRunner, type StudyRequestEnvelope } from '../electron/main/services/studyMethodRunner';
import { mkTempDir, rmrf, readFile, writeFile } from './_helpers/fs';

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
    tmp = await mkTempDir('lesson-verify-int-');
  });
  after(async () => {
    await rmrf(tmp);
  });

  it(
    'materializa um desafio python trivial com os scripts REAIS e verifica com juiz fake (verdict nunca not_run)',
    { timeout: 120_000 },
    async () => {
      assert.ok(SKILL_DIR, 'STUDY_METHOD_SKILL_DIR obrigatório no teste de integração');
      const skillExists = await fsp
        .access(path.join(SKILL_DIR, 'scripts', 'challenge-verify.sh'))
        .then(() => true)
        .catch(() => false);
      assert.ok(skillExists, `skill real não encontrada em ${SKILL_DIR}`);

      if (process.env.STUDY_METHOD_SKILL_DIR) {
        // (redundante com a asserção acima, mas deixa explícito)
      }

      const runner = createStudyMethodRunner({
        skillDir: SKILL_DIR,
        llmJudge: fakeJudge,
        tmpDir: tmp,
        defaultTimeoutMs: 90_000,
      });

      // 1) setup real
      const setupPath = path.join(tmp, 'integracao-recursao');
      const setup = await runner.createSetup({
        path: setupPath,
        subject: 'Recursão',
        subjectSlug: 'recursao',
        title: 'Recursão (integração)',
        language: 'python',
        skillLevel: 'beginner',
      });
      assert.ok(typeof setup.setupId === 'string' && setup.setupId.length === 12);

      // 2) sessão
      const session = await runner.newSession(setup.setupRoot, 'Aula de integração');
      assert.match(session, /^[0-9]{4}$/);

      // 3) desafio via challenge-new.sh (gera o esqueleto com runner.sh + meta.json)
      const ch = await runner.createChallenge(setup.setupRoot, {
        language: 'python',
        slug: 'fatorial-integracao',
        concept: 'recursao',
        difficulty: 2,
        skillLevel: 'beginner',
      });
      assert.ok(ch.relativePath.startsWith('challenges/') && ch.relativePath.includes('fatorial-integracao'));

      // 4) escreve os artefatos da autoria no layout do meta.json materializado
      const metaPath = path.join(ch.challengeDirAbs, 'meta.json');
      const meta = JSON.parse(await readFile(metaPath));
      const artifacts = meta.artifacts as {
        statement_path: string;
        stub_path: string;
        test_path: string;
        reference_path: string;
      };
      const stubPath = path.join(ch.challengeDirAbs, artifacts.stub_path);
      const testPath = path.join(ch.challengeDirAbs, artifacts.test_path);
      const refPath = path.join(ch.challengeDirAbs, artifacts.reference_path);
      const readmePath = path.join(ch.challengeDirAbs, artifacts.statement_path);

      await fsp.mkdir(path.dirname(refPath), { recursive: true });
      await writeFile(stubPath, [
        'def fatorial(n):',
        '    raise NotImplementedError',
        '',
      ].join('\n'));
      await writeFile(testPath, [
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
      ].join('\n'));
      await writeFile(refPath, [
        'def fatorial(n):',
        '    if n < 0:',
        '        raise ValueError("negativo")',
        '    resultado = 1',
        '    for i in range(2, n + 1):',
        '        resultado *= i',
        '    return resultado',
        '',
      ].join('\n'));
      await writeFile(readmePath, '# Fatorial recursivo\n\nImplemente fatorial.\n');

      // 5) atualiza meta.json: cenários + expected_test_count (como o orquestrador faz)
      const scenarios = [
        { scenario_id: 'fatorial_de_zero', test_name: 'test_fatorial_de_zero', kind: 'boundary', description: 'fatorial(0) = 1 — borda do domínio', failure_message_template: 'esperado 1' },
        { scenario_id: 'fatorial_de_cinco', test_name: 'test_fatorial_de_cinco', kind: 'example', description: 'fatorial(5) = 120', failure_message_template: 'esperado 120' },
        { scenario_id: 'fatorial_de_dez', test_name: 'test_fatorial_de_dez', kind: 'example', description: 'fatorial(10) = 3628800', failure_message_template: 'esperado 3628800' },
      ];
      meta.title = 'Fatorial recursivo (integração)';
      meta.difficulty = 2;
      meta.skill_level = 'beginner';
      meta.target_concepts = [{ concept_id: 'recursao', label: 'recursao', role: 'primary' }];
      meta.scenarios = scenarios;
      meta.execution.expected_test_count = scenarios.length;
      meta.updated_at = new Date().toISOString();
      await writeFile(metaPath, JSON.stringify(meta, null, 2));

      // 6) verify REAL com juiz fake
      const v = await runner.verifyChallenge(ch.challengeDirAbs);

      // NUNCA 'not_run' (o juiz fake permite o exit 10 prosseguir)
      assert.ok(
        ['approved', 'weak', 'rejected'].includes(v.verdict),
        `verdict inesperado: '${v.verdict}' (stdout: ${v.stdout.slice(0, 500)})`,
      );

      // selagem: se aprovado, challenge_status vira 'validated'
      const metaAfter = JSON.parse(await readFile(metaPath));
      if (v.verdict === 'approved') {
        assert.equal(metaAfter.challenge_status, 'validated', 'aprovado → selado');
      } else {
        // weak/rejected NÃO são selados (desafio ainda draft), mas o veredito veio do harness
        assert.ok(
          metaAfter.challenge_status === 'draft' || metaAfter.challenge_status === 'rejected',
          `status inesperado: ${metaAfter.challenge_status}`,
        );
      }
    },
  );
});