/**
 * tests/cx-services-lesson-orchestrator.test.ts — CARACTERIZAÇÃO (golden
 * master) de `electron/main/services/lessonOrchestrator.ts` ANTES da
 * refatoração de core/services.
 *
 * Fixa os helpers puros (slug, extensões, test_name, domínio, protótipo C) e a
 * orquestração completa generateLesson: ordem das fases de progresso, contrato
 * de aprovados × rejeitados (razões factuais por protocolIssue), caminho math
 * (exercício conferido pela mathLib, sem TDD) e a persistência opcional (repo).
 * SEM rede/LLM: research, author e runner são fakes; a materialização usa
 * tmpdirs próprios.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { StudyFinding } from '../shared/ipc-contract';
import type { AuthorFn, ChallengeDraft, LessonDraft, LessonProgress } from '../electron/main/services/lessonTypes';
import {
  computeTestName,
  createLessonOrchestrator,
  defaultSetupsDir,
  extractCPrototype,
  mapLanguageExtension,
  readMetaJson,
  resolveLessonDomain,
  slugify,
  stableChallengeSlug,
  type LessonOrchestratorDeps,
} from '../electron/main/services/lessonOrchestrator';

let tmpRaiz = '';

before(async () => {
  tmpRaiz = await fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxsvc-lesson-'));
});

after(async () => {
  await fsp.rm(tmpRaiz, { recursive: true, force: true });
});

// ─── helpers puros ───────────────────────────────────────────────────────────

describe('cx/lessonOrchestrator: defaultSetupsDir', () => {
  it('STUDY_METHOD_SETUPS_DIR vence; sem env cai em ~/.local/share/study-method/setups', () => {
    const salvo = process.env.STUDY_METHOD_SETUPS_DIR;
    try {
      process.env.STUDY_METHOD_SETUPS_DIR = '/tmp/setups-custom';
      assert.equal(defaultSetupsDir(), '/tmp/setups-custom');
      delete process.env.STUDY_METHOD_SETUPS_DIR;
      assert.equal(
        defaultSetupsDir(),
        path.join(os.homedir(), '.local/share/study-method/setups'),
      );
    } finally {
      if (salvo === undefined) delete process.env.STUDY_METHOD_SETUPS_DIR;
      else process.env.STUDY_METHOD_SETUPS_DIR = salvo;
    }
  });
});

describe('cx/lessonOrchestrator: slugify (nomes de setup)', () => {
  it('kebab sem acento, sem pontuação e sem hífen duplo', () => {
    assert.equal(slugify('  Cálculo!! Avançado  '), 'calculo-avancado');
    assert.equal(slugify('A---B   C'), 'a-b-c');
  });

  it('sem caractere aproveitável ⇒ "aula" (nunca slug vazio)', () => {
    assert.equal(slugify(''), 'aula');
    assert.equal(slugify('!!! ???'), 'aula');
    assert.equal(slugify('  '), 'aula');
  });

  it('teto de 40 chars cortando em FRONTEIRA de hífen (nunca parte palavra)', () => {
    assert.equal(
      slugify('aaaaa bbbbb ccccc ddddd eeeee fffff ggggg'),
      'aaaaa-bbbbb-ccccc-ddddd-eeeee-fffff',
    );
    // palavra única sem hífen: corte reto em 40.
    assert.equal(slugify('x'.repeat(50)), 'x'.repeat(40));
  });
});

describe('cx/lessonOrchestrator: stableChallengeSlug (o nunca-repetir compara esta string)', () => {
  it('basename SEM o prefixo NNNN-; sem prefixo/devolto como está', () => {
    assert.equal(stableChallengeSlug('challenges/0007-fatorial-recursivo'), 'fatorial-recursivo');
    assert.equal(stableChallengeSlug('/abs/path/0001-soma'), 'soma');
    assert.equal(stableChallengeSlug('sem-prefixo'), 'sem-prefixo');
    assert.equal(stableChallengeSlug(''), '');
    assert.equal(
      stableChallengeSlug('/caminho/'),
      'caminho',
      'path.basename normaliza a barra final (comportamento atual)',
    );
  });
});

describe('cx/lessonOrchestrator: mapLanguageExtension e computeTestName', () => {
  it('extensões por linguagem (primária primeiro); desconhecida ⇒ []', () => {
    assert.deepEqual(mapLanguageExtension('python'), ['py']);
    assert.deepEqual(mapLanguageExtension('javascript'), ['mjs']);
    assert.deepEqual(mapLanguageExtension('node'), ['mjs']);
    assert.deepEqual(mapLanguageExtension('go'), ['go']);
    assert.deepEqual(mapLanguageExtension('rust'), ['rs']);
    assert.deepEqual(mapLanguageExtension('c'), ['c', 'h']);
    assert.deepEqual(mapLanguageExtension('c++'), ['c', 'h']);
    assert.deepEqual(mapLanguageExtension('cpp'), ['c', 'h']);
    assert.deepEqual(mapLanguageExtension('cobol'), []);
    assert.deepEqual(mapLanguageExtension(''), []);
  });

  it('test_name: python prefixa test_; go vira TestCamelCase; o resto usa o id curto', () => {
    assert.equal(computeTestName('python', 'caso_1'), 'test_caso_1');
    assert.equal(computeTestName('go', 'soma_dois_numeros'), 'TestSomaDoisNumeros');
    assert.equal(computeTestName('javascript', 'caso_1'), 'caso_1');
    assert.equal(computeTestName('rust', 'caso_1'), 'caso_1');
    assert.equal(computeTestName('c', 'caso_1'), 'caso_1');
  });
});

describe('cx/lessonOrchestrator: readMetaJson', () => {
  it('lê e parseia o meta.json; ausente/inválido LANÇA (fail-closed)', async () => {
    const dir = path.join(tmpRaiz, 'meta-ok');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'meta.json'), '{"challenge_id":"0001"}', 'utf8');
    assert.deepEqual(await readMetaJson(dir), { challenge_id: '0001' });

    await assert.rejects(() => readMetaJson(path.join(tmpRaiz, 'dir-sem-meta')));
    const quebrado = path.join(tmpRaiz, 'meta-quebrado');
    await fsp.mkdir(quebrado, { recursive: true });
    await fsp.writeFile(path.join(quebrado, 'meta.json'), '{quebrado', 'utf8');
    await assert.rejects(() => readMetaJson(quebrado));
  });
});

describe('cx/lessonOrchestrator: resolveLessonDomain', () => {
  it('explícito da UI vence; senão heurística por palavra-chave (sem acento/caixa); default programming', () => {
    assert.equal(resolveLessonDomain('funções arrow', 'math'), 'math', 'explícito vence');
    assert.equal(resolveLessonDomain('matemática básica', 'programming'), 'programming');
    assert.equal(resolveLessonDomain('Matemática Básica'), 'math');
    assert.equal(resolveLessonDomain('Álgebra Linear'), 'math');
    assert.equal(resolveLessonDomain('geometria plana'), 'math');
    assert.equal(resolveLessonDomain('frações e porcentagens'), 'math');
    assert.equal(resolveLessonDomain('equações lineares'), 'math');
    assert.equal(resolveLessonDomain('closures em javascript'), 'programming');
  });
});

describe('cx/lessonOrchestrator: extractCPrototype (fix-c-stubh — casos básicos)', () => {
  it('primeira definição de função ⇒ assinatura colapsada para uma linha', () => {
    assert.equal(
      extractCPrototype('long soma(long a, long b) {\n  return a + b;\n}\n'),
      'long soma(long a, long b)',
    );
  });

  it('pula #includes e comentários antes da assinatura; sem "{" ⇒ null (stub é só protótipo)', () => {
    assert.equal(
      extractCPrototype('#include <stdio.h>\n// implementação\nint dobro(int n) {\n  return n * 2;\n}'),
      'int dobro(int n)',
    );
    assert.equal(extractCPrototype('int f(void);'), null);
  });

  it('várias definições: extrai a PRIMEIRA (o "{" de profundidade 0 mais cedo)', () => {
    assert.equal(
      extractCPrototype('int f(void) {\n  return 1;\n}\nint g(int x) {\n  return x;\n}'),
      'int f(void)',
    );
  });
});

// ─── fakes da orquestração ───────────────────────────────────────────────────

function challengeDraft(over: Partial<ChallengeDraft> = {}): ChallengeDraft {
  return {
    slug: 'soma',
    language: 'javascript',
    concept: 'funcoes',
    difficulty: 2,
    skillLevel: 'beginner',
    title: 'Soma dois números',
    statement: 'Implemente soma.',
    stubCode: 'export function soma(a, b) {}',
    testCode: 'test("soma", () => {});',
    referenceCode: 'export function soma(a, b) { return a + b; }',
    referenceAlternates: ['alt-1', 'alt-2'],
    scenarios: [
      { id: 'caso_1', name: 'caso 1', type: 'example', input: '1,2', expected: '3', description: 'soma simples' },
      { id: 'c2', name: 'c2', type: 'error', input: 'x' },
    ],
    expectedTestCount: 2,
    ...over,
  };
}

function lessonDraft(over: Partial<LessonDraft> = {}): LessonDraft {
  return {
    lessonTitle: 'Aula sobre funções',
    lessonMarkdown: '# Funções\nConteúdo.',
    challenges: [challengeDraft()],
    ...over,
  };
}

const FINDINGS: StudyFinding[] = [
  { query: 'funções', title: 'Doc', url: 'https://doc', description: 'd', score: 9 },
];

interface VerifyFakeResult {
  verdict: string;
  rejections?: string[];
  protocolIssue?: 'request_unparseable' | 'apply_exhausted' | 'exit_setup_not_found' | 'exit_resource_locked';
  applyExhausted?: boolean;
}

/**
 * Runner fake com materialização REAL em tmp (o materializeChallenge lê o
 * meta.json que o createChallenge gravou — exatamente como o script da skill).
 */
function runnerFake(verifyResults: VerifyFakeResult[] = [{ verdict: 'approved' }]): {
  deps: LessonOrchestratorDeps['runner'];
  chamadas: { challenges: number; verifies: string[] };
} {
  const chamadas = { challenges: 0, verifies: [] as string[] };
  let seq = 0;
  let verifyIdx = 0;
  const base = path.join(tmpRaiz, 'setups-runner');
  const deps: LessonOrchestratorDeps['runner'] = {
    async resolveSkillDir() {
      return '/skill/fake';
    },
    async createSetup(spec) {
      return { setupId: '9f2c41ab77e0', setupRoot: spec.path };
    },
    async newSession() {
      return '0007';
    },
    async createChallenge(setupRoot, c) {
      chamadas.challenges += 1;
      seq += 1;
      const relativePath = `challenges/${String(seq).padStart(4, '0')}-${c.slug}`;
      const challengeDirAbs = path.join(setupRoot, relativePath);
      await fsp.mkdir(path.join(challengeDirAbs, '.solution'), { recursive: true });
      await fsp.writeFile(
        path.join(challengeDirAbs, 'meta.json'),
        JSON.stringify({
          challenge_id: String(seq).padStart(4, '0'),
          difficulty: 2,
          artifacts: {
            statement_path: 'README.md',
            stub_path: 'stub.mjs',
            test_path: 'test.mjs',
            reference_path: '.solution/reference.mjs',
            empty_stub_path: '.solution/empty_stub.mjs',
            reference_alt_paths: [
              '.solution/reference_alt_1.mjs',
              '.solution/reference_alt_2.mjs',
              '.solution/reference_alt_3.mjs',
            ],
            support_paths: [],
          },
          scenarios: [],
          execution: { expected_test_count: 1 },
        }),
        'utf8',
      );
      return { challengeDirAbs, relativePath };
    },
    async verifyChallenge(challengeDir) {
      chamadas.verifies.push(challengeDir);
      const r = verifyResults[Math.min(verifyIdx, verifyResults.length - 1)];
      verifyIdx += 1;
      return { rejections: r.rejections ?? [], stdout: '{}', ...r };
    },
    async testStudentAnswer() {
      return {
        success: true,
        exitCode: 0,
        passed: true,
        testsRun: 2,
        expectedTests: 2,
        verdict: 'passed',
        output: 'ok',
      };
    },
  };
  void base;
  return { deps, chamadas };
}

function orchestratorCom(
  over: Partial<LessonOrchestratorDeps> & { authorDraft?: Partial<LessonDraft> } = {},
  verifyResults: VerifyFakeResult[] = [{ verdict: 'approved' }],
): {
  orch: ReturnType<typeof createLessonOrchestrator>;
  capturas: {
    authorInputs: Array<Parameters<AuthorFn>[0]>;
    createLessons: Array<Record<string, unknown>>;
    upserts: Array<[string, string | undefined]>;
  };
} {
  const { deps: runner } = runnerFake(verifyResults);
  const authorInputs: Array<Parameters<AuthorFn>[0]> = [];
  const createLessons: Array<Record<string, unknown>> = [];
  const upserts: Array<[string, string | undefined]> = [];
  const repo: NonNullable<LessonOrchestratorDeps['repo']> = {
    async upsertSubject(name, domain) {
      upserts.push([name, domain]);
      return {
        subject: { id: 'sub-1', name, slug: slugify(name), domain: domain ?? 'programming' },
        slug: slugify(name),
      };
    },
    async listAttemptedChallengeSlugs() {
      return ['ja-tentado'];
    },
    async createLesson(input) {
      createLessons.push(input as unknown as Record<string, unknown>);
      return 'les-1';
    },
  };
  const orch = createLessonOrchestrator({
    research: {
      async plan() {
        return { subject: 'x', queries: ['q'], findings: FINDINGS, createdAt: '2026-01-01T00:00:00.000Z' };
      },
    },
    runner,
    author: async (ctx) => {
      authorInputs.push(ctx);
      return lessonDraft(over.authorDraft ? { ...over.authorDraft } : {});
    },
    setupsDir: path.join(tmpRaiz, 'setups'),
    repo,
    ...over,
  });
  return { orch, capturas: { authorInputs, createLessons, upserts } };
}

// ─── generateLesson: caminho programming ─────────────────────────────────────

describe('cx/lessonOrchestrator: generateLesson (programming) — fases, veredito e persistência', () => {
  it('ordem das fases de progresso é FIXA; setup criado exposto no progresso', async () => {
    const { orch } = orchestratorCom();
    const fases: LessonProgress[] = [];
    const resultado = await orch.generateLesson('funções', {
      onProgress: (p) => fases.push(p),
    });

    assert.deepEqual(
      fases.map((p) => p.phase),
      ['research', 'authoring', 'materializing', 'materializing', 'materializing', 'validating', 'done'],
    );
    assert.equal(fases[0].fraction, 0.1);
    assert.equal(fases[1].fraction, 0.35);
    assert.ok(fases[3].setupRoot, 'o setup materializado é exposto (fix15-list-challenges)');
    assert.equal(fases[3].setupId, '9f2c41ab77e0');
    assert.equal(fases[5].fraction, 0.75);
    assert.equal(fases[6].fraction, 1);
    assert.equal(fases[6].message, 'Aula pronta.');
    assert.equal(resultado.rejected.length, 0);
    assert.ok(resultado.lesson.createdAt);
  });

  it('aprovado vira ChallengeInfo "validated" com slug ESTÁVEL e desafio persistido na lição', async () => {
    const { orch, capturas } = orchestratorCom();
    const resultado = await orch.generateLesson('funções', { difficulty: 3 });

    const info = resultado.lesson.challenges[0];
    assert.equal(info.challengeId, '0001');
    assert.equal(info.slug, 'soma', 'slug estável SEM o prefixo NNNN');
    assert.equal(info.title, 'Soma dois números');
    assert.equal(info.language, 'javascript');
    assert.equal(info.concept, 'funcoes');
    assert.equal(info.difficulty, 3, 'opts.difficulty vence o do draft');
    assert.equal(info.status, 'validated');
    assert.equal(info.verdict, 'approved');
    assert.ok(info.workspaceDir.includes('challenges/0001-soma'));
    assert.equal(info.statementPath, path.join(info.workspaceDir, 'README.md'));

    // persistência: subject upsertado 2× (seed da math + gravação) e lição com
    // o 1º desafio aprovado serializado.
    assert.equal(resultado.lessonId, 'les-1');
    assert.equal(resultado.subjectId, 'sub-1');
    assert.equal(resultado.lesson.lessonId, 'les-1');
    assert.equal(resultado.lesson.subjectId, 'sub-1');
    assert.equal(capturas.createLessons.length, 1);
    const criada = capturas.createLessons[0];
    assert.equal(criada.subjectSlug, slugify('funções'));
    assert.equal(criada.title, 'Aula sobre funções');
    const challenge = criada.challenge as Record<string, unknown>;
    assert.equal(challenge.slug, 'soma');
    assert.deepEqual(JSON.parse(String(challenge.testCasesJson)), {
      language: 'javascript',
      testCode: 'test("soma", () => {});',
    });
    assert.deepEqual(JSON.parse(String(challenge.solutionJson)), {
      referenceCode: 'export function soma(a, b) { return a + b; }',
      referenceAlternates: ['alt-1', 'alt-2'],
    });
  });

  it('resolveSubjectId entra no ChallengeInfo quando persistido (e falha de resolução não derruba)', async () => {
    const { orch } = orchestratorCom({
      resolveSubjectId: async () => 'sub-resolvido',
    });
    const ok = await orch.generateLesson('funções');
    assert.equal(ok.lesson.challenges[0].subjectId, 'sub-resolvido');

    const { orch: orchQuebrado } = orchestratorCom({
      resolveSubjectId: async () => {
        throw new Error('sql fora');
      },
    });
    const degradado = await orchQuebrado.generateLesson('funções');
    assert.equal(degradado.lesson.challenges[0].subjectId, undefined);
  });

  it('aprovado + REJEITADO: só approved chega ao aluno; a razão do rejected é factual', async () => {
    const { orch } = orchestratorCom({}, [
      { verdict: 'rejected', rejections: ['fails_on_reference', 'zero_tests_executed'] },
    ]);
    const resultado = await orch.generateLesson('funções');
    assert.deepEqual(resultado.lesson.challenges, [], 'DES-2: rejeitado nunca aparece como challenge');
    assert.deepEqual(resultado.rejected, [
      {
        slug: 'soma',
        verdict: 'rejected',
        reason: 'fails_on_reference, zero_tests_executed',
      },
    ]);
    assert.equal(resultado.lessonId, 'les-1', 'lição sem desafio aprovado persiste sem challenge');
  });

  it('not_run: cada protocolIssue vira UMA razão distinta (nada de "rejeitado" genérico)', async () => {
    const casos: Array<[VerifyFakeResult, string]> = [
      [
        { verdict: 'not_run', protocolIssue: 'request_unparseable' },
        'protocolo REQUEST/APPLY malformado (exit 10 sem pedido parseável)',
      ],
      [
        { verdict: 'not_run', protocolIssue: 'apply_exhausted' },
        'apply/esgotado (juiz não decidiu em 2 ciclos ou resposta recusada)',
      ],
      [
        { verdict: 'not_run', protocolIssue: 'exit_setup_not_found' },
        'setup não encontrado pelo script (exit 3)',
      ],
      [
        { verdict: 'not_run', protocolIssue: 'exit_resource_locked' },
        'recurso travado (exit 4)',
      ],
      [
        { verdict: 'not_run', applyExhausted: true },
        'apply/esgotado (juiz não decidiu em 2 ciclos)',
      ],
      [{ verdict: 'not_run' }, 'juiz ausente (runner sem llmJudge); veredito not_run'],
    ];
    for (const [veredito, razao] of casos) {
      const { orch } = orchestratorCom({}, [veredito]);
      const resultado = await orch.generateLesson('funções');
      assert.deepEqual(resultado.rejected, [{ slug: 'soma', verdict: 'not_run', reason: razao }]);
    }
  });

  it('weak sem rejections ⇒ razão genérica "rejeitado na validação"', async () => {
    const { orch } = orchestratorCom({}, [{ verdict: 'weak' }]);
    const resultado = await orch.generateLesson('funções');
    assert.deepEqual(resultado.rejected, [
      { slug: 'soma', verdict: 'weak', reason: 'rejeitado na validação' },
    ]);
  });

  it('erro da pesquisa com `code` vira progress {phase:"error", code} e o throw nomeia o subject', async () => {
    const fases: LessonProgress[] = [];
    const err = Object.assign(new Error('chave Brave ausente'), { code: 'BRAVE_KEY_MISSING' });
    const orch = createLessonOrchestrator({
      research: {
        async plan() {
          throw err;
        },
      },
      runner: runnerFake().deps,
      author: async () => lessonDraft(),
      setupsDir: path.join(tmpRaiz, 'setups'),
    });
    await assert.rejects(
      () => orch.generateLesson('funções', { onProgress: (p) => fases.push(p) }),
      /generateLesson\("funções"\) falhou: chave Brave ausente/,
    );
    const erro = fases.find((p) => p.phase === 'error');
    assert.ok(erro);
    assert.equal(erro.message, 'chave Brave ausente');
    assert.equal((erro as LessonProgress & { code?: string }).code, 'BRAVE_KEY_MISSING');
  });
});

// ─── generateLesson: caminho math ────────────────────────────────────────────

describe('cx/lessonOrchestrator: generateLesson (math) — exercício conferido, sem TDD', () => {
  it('domínio math: sem desafio de código, exercício da mathLib SEM o esperado no autor', async () => {
    const { orch, capturas } = orchestratorCom({ authorDraft: { challenges: [] } });
    const resultado = await orch.generateLesson('matemática básica');

    const ex = resultado.lesson.exercise;
    assert.ok(ex, 'exercício presente na aula');
    assert.equal(ex.kind, 'math');
    assert.ok(typeof ex.seed === 'number');
    assert.ok(ex.prompt.length > 0);
    assert.ok(ex.expectedNormalized.length > 0, 'o esperado fica com o orquestrador');
    assert.deepEqual(resultado.lesson.challenges, []);
    assert.equal(resultado.lessonId, 'les-1', 'persiste com o exercício');

    // o AUTOR recebe o exercício SEM a resposta (DES-6).
    const recebido = capturas.authorInputs[0].mathExercise;
    assert.ok(recebido);
    assert.equal('expectedNormalized' in recebido, false);
    assert.equal(recebido.prompt, ex.prompt);

    const criada = capturas.createLessons[0];
    assert.deepEqual(criada.exercise, ex, 'o exercício COM o esperado é persistido');
  });

  it('sem desafio de código ⇒ createChallenge/verifyChallenge NÃO são chamados (fases: research/authoring/validating/done)', async () => {
    const { deps, chamadas } = runnerFake();
    const fases: LessonProgress[] = [];
    const orch = createLessonOrchestrator({
      research: {
        async plan() {
          return { subject: 'x', queries: [], findings: [], createdAt: '' };
        },
      },
      runner: deps,
      author: async () => lessonDraft({ challenges: [] }),
      setupsDir: path.join(tmpRaiz, 'setups-math'),
    });
    const resultado = await orch.generateLesson('geometria', { onProgress: (p) => fases.push(p) });
    assert.deepEqual(
      fases.map((p) => p.phase),
      ['research', 'authoring', 'materializing', 'materializing', 'validating', 'done'],
    );
    assert.equal(fases[4].message, 'Conferindo o exercício de matemática…');
    assert.equal(fases[5].message, 'Aula de matemática pronta.');
    assert.equal(chamadas.challenges, 0);
    assert.equal(chamadas.verifies.length, 0);
    assert.ok(resultado.lesson.exercise);
  });
});

// ─── materializeChallenge (exposto) ──────────────────────────────────────────

describe('cx/lessonOrchestrator: materializeChallenge (artefatos + meta mesclado)', () => {
  it('escreve stub/test/reference/statement, empty_stub canônico e alternatas; meta ganha scenarios/expected', async () => {
    const { deps } = runnerFake();
    const orch = createLessonOrchestrator({
      research: { async plan() { return { subject: '', queries: [], findings: [], createdAt: '' }; } },
      runner: deps,
      author: async () => lessonDraft(),
      setupsDir: path.join(tmpRaiz, 'setups-mat'),
    });
    const setupRoot = path.join(tmpRaiz, 'setup-mat');
    const draft = challengeDraft();
    const mat = await orch.materializeChallenge(setupRoot, draft, 3, 'javascript');

    const dir = mat.challengeDirAbs;
    assert.equal(mat.challengeId, '0001');
    assert.equal(await fsp.readFile(path.join(dir, 'stub.mjs'), 'utf8'), draft.stubCode);
    assert.equal(await fsp.readFile(path.join(dir, 'test.mjs'), 'utf8'), draft.testCode);
    assert.equal(
      await fsp.readFile(path.join(dir, '.solution', 'reference.mjs'), 'utf8'),
      draft.referenceCode,
    );
    assert.equal(await fsp.readFile(path.join(dir, 'README.md'), 'utf8'), draft.statement);
    // empty_stub é a CÓPIA CANÔNICA do stub autorado (não o do seed).
    assert.equal(
      await fsp.readFile(path.join(dir, '.solution', 'empty_stub.mjs'), 'utf8'),
      draft.stubCode,
    );
    // alternatas: as autoradas, e a que faltou cai na referenceCode.
    assert.equal(await fsp.readFile(path.join(dir, '.solution', 'reference_alt_1.mjs'), 'utf8'), 'alt-1');
    assert.equal(await fsp.readFile(path.join(dir, '.solution', 'reference_alt_2.mjs'), 'utf8'), 'alt-2');
    assert.equal(
      await fsp.readFile(path.join(dir, '.solution', 'reference_alt_3.mjs'), 'utf8'),
      draft.referenceCode,
      'path declarado sem alternata autoral recebe a reference (nunca fica sem código)',
    );

    const meta = await readMetaJson(dir);
    assert.equal(meta.title, 'Soma dois números');
    assert.equal(meta.difficulty, 3, 'difficulty da chamada vence');
    assert.equal(meta.skill_level, 'beginner');
    assert.ok(typeof meta.updated_at === 'string');
    const scenarios = meta.scenarios as Array<Record<string, unknown>>;
    assert.deepEqual(
      scenarios.map((s) => [s.scenario_id, s.test_name, s.kind, s.description]),
      [
        ['caso_1', 'caso_1', 'example', 'soma simples'],
        ['c2', 'c2', 'error', 'Cenário c2: c2', ],
      ],
    );
    assert.equal(scenarios[0].failure_message_template, 'caso 1: esperado 3');
    assert.equal('failure_message_template' in scenarios[1], false);
    assert.deepEqual(meta.execution, { expected_test_count: 2 });
  });
});

// ─── testAnswer / listSetups / resolveSkillDirInfo ───────────────────────────

describe('cx/lessonOrchestrator: testAnswer, listSetups e resolveSkillDirInfo', () => {
  it('testAnswer mapeia o resultado do runner (null vira 0 — nunca "N de M" inventado)', async () => {
    const deps = runnerFake().deps;
    deps.testStudentAnswer = async () => ({
      success: false,
      exitCode: 1,
      passed: false,
      testsRun: null,
      expectedTests: null,
      verdict: 'infra',
      output: 'boom',
    });
    const orch = createLessonOrchestrator({
      research: { async plan() { return { subject: '', queries: [], findings: [], createdAt: '' }; } },
      runner: deps,
      author: async () => lessonDraft(),
      setupsDir: path.join(tmpRaiz, 'setups-ta'),
    });
    const res = await orch.testAnswer('/desafio');
    assert.deepEqual(res, {
      success: false,
      testsRun: 0,
      expectedTests: 0,
      passed: false,
      output: 'boom',
      verdictFeedback: 'infra',
    });
  });

  it('listSetups lê setup.json dos subdiretórios; sem metadado cai no nome do diretório', async () => {
    const setupsDir = path.join(tmpRaiz, 'setups-list');
    await fsp.mkdir(path.join(setupsDir, 'setup-a'), { recursive: true });
    await fsp.writeFile(
      path.join(setupsDir, 'setup-a', 'setup.json'),
      JSON.stringify({ setup_id: '9f2c41ab77e0', subject_slug: 'funcoes' }),
      'utf8',
    );
    await fsp.mkdir(path.join(setupsDir, 'setup-sem-meta'), { recursive: true });
    await fsp.writeFile(path.join(setupsDir, 'arquivo-solto.txt'), 'x', 'utf8');

    const orch = createLessonOrchestrator({
      research: { async plan() { return { subject: '', queries: [], findings: [], createdAt: '' }; } },
      runner: runnerFake().deps,
      author: async () => lessonDraft(),
      setupsDir,
    });
    const { rows } = await orch.listSetups();
    assert.equal(rows.length, 1, 'só diretórios com setup.json legível');
    assert.deepEqual(rows[0], {
      setupId: '9f2c41ab77e0',
      setupRoot: path.join(setupsDir, 'setup-a'),
      subjectSlug: 'funcoes',
    });

    // setup.json sem os campos ⇒ ids vazios com fallback para o nome do dir.
    await fsp.writeFile(path.join(setupsDir, 'setup-sem-meta', 'setup.json'), '{}', 'utf8');
    const { rows: rows2 } = await orch.listSetups();
    const semMeta = rows2.find((r) => r.subjectSlug === 'setup-sem-meta');
    assert.ok(semMeta);
    assert.equal(semMeta.setupId, '');
  });

  it('resolveSkillDirInfo repassa o skillDir do runner', async () => {
    const { orch } = orchestratorCom();
    assert.deepEqual(await orch.resolveSkillDirInfo(), { skillDir: '/skill/fake' });
  });
});
