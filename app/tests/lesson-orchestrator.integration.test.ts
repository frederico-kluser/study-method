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
 * `judgeCalls` conta quantas vezes o juiz foi DE FATO chamado (o único cenário em
 * que isso acontece é quando sobrou mutante sobrevivente e o exit 10 disparou).
 */
const judgeCalls: number[] = [0];
async function fakeJudge(pedido: StudyRequestEnvelope): Promise<unknown> {
  judgeCalls[0] += 1;
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

      // AUTHOR fake: LessonDraft python, 1 desafio. CRÍTICO para o approve real:
      //  (a) o nome da função é `fatorial_recursivo` = mesmo nome que challenge-new.sh
      //      DERIVA do slug (`fatorial-recursivo` → fatorial_recursivo). Desde o
      //      fix-author-consistency (7b5155b) o orchestrator NÃO depende da semente
      //      para os ocultos de .solution: materializeChallenge REGRAVA stub.py/
      //      tests/test_stub.py/README.md, a referência canônica `.solution/reference.py`
      //      (com draft.referenceCode; por linguagem: reference.rs, reference.c, ...),
      //      a cópia canônica `.solution/empty_stub.py` (com draft.stubCode) e as
      //      `reference_alt_*` (com draft.referenceAlternates ?? draft.referenceCode —
      //      fallback que nunca deixa um path declarado no meta sem conteúdo
      //      compilável). Ou seja: os ocultos vêm da AUTORIA, com a MESMA assinatura
      //      do stub — a assinatura toy da semente não vaza para a validação nas
      //      linguagens sem header externo; em C o stub.h do seed só é substituído
      //      quando a extração do protótipo autorado tem sucesso (se a extração
      //      falhar ou o arquivo não existir, o header do seed é PRESERVADO — nunca
      //      pior que antes);
      //  (b) a referência é a ITERATIVA SEM guarda de negativo, porque as alternativas
      //      da semente (recursiva e reduce) também não guardam — um teste com
      //      ValueError(-1) seria over-specification (passo 3) e derrubaria o approve.
      //  (c) o teste mata 12 dos 13 mutantes do catálogo fixo; o 13º é o mutante
      //      GENUINAMENTE equivalente `range(2,n+1)→range(1,n+1)`, que sobrevive e
      //      faz o exit 10 disparar → o juiz fake É CHAMADO → classifica `equivalent`
      //      → score = 12/(13-1) = 1,0 → approved (verificado com os scripts reais).
      // Escopos: boundary (0), example (1,5,10) e property f(n)==f(n-1)*n.
      const scenarios = [
        { id: 'fatorial_recursivo_de_zero', name: 'Fatorial de zero', type: 'boundary' as const, input: '0', expected: '1', description: 'fatorial(0) = 1 — o produto vazio' },
        { id: 'fatorial_recursivo_de_um', name: 'Fatorial de um', type: 'example' as const, input: '1', expected: '1', description: 'fatorial(1) = 1' },
        { id: 'fatorial_recursivo_de_cinco', name: 'Fatorial de cinco', type: 'example' as const, input: '5', expected: '120', description: 'fatorial(5) = 120' },
        { id: 'fatorial_recursivo_de_dez', name: 'Fatorial de dez', type: 'example' as const, input: '10', expected: '3628800', description: 'fatorial(10) = 3628800' },
        { id: 'fatorial_recursivo_propriedade', name: 'Relação do fatorial', type: 'property' as const, input: '2..7', expected: null as unknown as string, description: 'fatorial(n) == fatorial(n-1) * n para n em 2..7' },
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
              'def fatorial_recursivo(n):',
              '    raise NotImplementedError',
              '',
            ].join('\n'),
            testCode: [
              'import unittest',
              '',
              'from stub import fatorial_recursivo',
              '',
              '',
              'class TestStub(unittest.TestCase):',
              '    def test_fatorial_recursivo_de_zero(self):',
              '        self.assertEqual(fatorial_recursivo(0), 1, "fatorial de 0 é 1")',
              '',
              '    def test_fatorial_recursivo_de_um(self):',
              '        self.assertEqual(fatorial_recursivo(1), 1, "fatorial de 1 é 1")',
              '',
              '    def test_fatorial_recursivo_de_cinco(self):',
              '        self.assertEqual(fatorial_recursivo(5), 120, "fatorial de 5 é 120")',
              '',
              '    def test_fatorial_recursivo_de_dez(self):',
              '        self.assertEqual(fatorial_recursivo(10), 3628800, "fatorial de 10 é 3628800")',
              '',
              '    def test_fatorial_recursivo_propriedade(self):',
              '        for n in range(2, 8):',
              '            self.assertEqual(fatorial_recursivo(n), fatorial_recursivo(n - 1) * n, "relação do fatorial")',
              '',
              '',
              'if __name__ == "__main__":',
              '    unittest.main()',
              '',
            ].join('\n'),
            referenceCode: [
              'def fatorial_recursivo(n):',
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

      // Total = 1 desafio (aprovado; o P2 exige evidência REAL de approved).
      assert.equal(lesson.challenges.length + rejected.length, 1, 'exatamente 1 desafio na cadeia');

      // ⭐ EVidência real do P2: o desafio TEM que chegar a `approved` e o juiz TEM
      // que ser chamado (o juiz só roda no exit 10 do classify_survivor quando sobra
      // mutante sobrevivente). O conjunto abaixo foi verificado com os scripts REAIS
      // da skill: 5 cenários (boundary 0, example 1/5/10, property f(n)==f(n-1)*n)
      // matam 12/13 mutantes; o 13º (range(2,n+1)→range(1,n+1)) é genuinamente
      // equivalente → sobrevive → exit 10 → juiz chamado → classifica equivalent →
      // score = 12/(13-1) = 1,0 → approved.
      assert.equal(rejected.length, 0, `esperado approved (sem rejected), veio: ${JSON.stringify(rejected)}`);
      assert.equal(lesson.challenges.length, 1, 'o desafio deveria ter sido aprovado');
      assert.equal(lesson.challenges[0].verdict, 'approved');
      assert.equal(lesson.challenges[0].status, 'validated');
      assert.equal(lesson.challenges[0].language, 'python');
      assert.ok(
        judgeCalls[0] > 0,
        `o juiz DEVERIA ter sido chamado (sobreviveu mutante no passo 4); chamadas = ${judgeCalls[0]}`,
      );

      // Localiza o diretório do desafio materializado em <setup>/challenges/.
      const challengeDirs = await fsp.readdir(path.join(setupRoot, 'challenges'));
      assert.equal(challengeDirs.length, 1, `esperado 1 desafio em challenges, veio ${challengeDirs.length}`);
      const challengeDir = path.join(setupRoot, 'challenges', challengeDirs[0]);
      assert.equal(lesson.challenges[0].workspaceDir, challengeDir);

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
      assert.match(stub, /def fatorial_recursivo\(n\)/);
      const testCode = await readFile(testPath);
      assert.match(testCode, /test_fatorial_recursivo_de_zero/);
      assert.match(testCode, /test_fatorial_recursivo_propriedade/);
      const ref = await readFile(refPath);
      assert.match(ref, /def fatorial_recursivo\(n\)/);

      // meta.json foi RE-MERGEADO pela autoria (writeMeta).
      assert.equal(meta.title, 'Fatorial recursivo');
      assert.equal(meta.execution.expected_test_count, scenarios.length);
      assert.equal(meta.scenarios.length, scenarios.length);
      assert.deepEqual(
        meta.scenarios.map((s: { test_name: string }) => s.test_name),
        [
          'test_fatorial_recursivo_de_zero',
          'test_fatorial_recursivo_de_um',
          'test_fatorial_recursivo_de_cinco',
          'test_fatorial_recursivo_de_dez',
          'test_fatorial_recursivo_propriedade',
        ],
      );

      // A validação registrou `approved` com mutation score 1,0 (12 mortos, 1
      // equivalente) e o juiz foi chamado — a prova de que o approved é REAL.
      const verdictSteps = (meta.validation?.steps ?? {}) as Record<string, { status?: string }>;
      assert.equal(verdictSteps.step_1_empty_stub?.status, 'passed', 'passo 1 (falha contra stub vazio) deveria ter passado');
      assert.equal(verdictSteps.step_3_alternatives?.status, 'passed', 'passo 3 (alternativas) deveria ter passado');
      assert.equal(verdictSteps.step_4_mutation?.status, 'passed', 'passo 4 (mutação) deveria ter passado');
      assert.equal(meta.validation?.verdict, 'approved');
    },
  );
});