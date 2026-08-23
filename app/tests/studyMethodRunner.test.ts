/**
 * tests/studyMethodRunner.test.ts — testes do StudyMethodRunner contra FIXTURES bash.
 *
 * As fixtures vivem em tests/_fixtures/skill/ e imitam o contrato dos scripts reais da
 * skill (setup-init.sh, session-new.sh, challenge-new.sh, challenge-verify.sh, exit 10,
 * runner.sh) SEM rodar sandbox real. Toda escrita é em tmp — nunca se cria setup real.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import {
  createStudyMethodRunner,
  type StudyMethodRunner,
  type StudyRequestEnvelope,
} from '../electron/main/services/studyMethodRunner';
import { mkTempDir, rmrf, writeFile, readFile, fileExists } from './_helpers/fs';

const FIXTURE_SKILL = path.resolve(__dirname, '_fixtures', 'skill');

/** monta o runner com skillDir = fixtures; juiz injetável para o exit 10. */
function makeRunner(judge?: (p: StudyRequestEnvelope) => Promise<unknown>, extra?: object): StudyMethodRunner {
  return createStudyMethodRunner({ skillDir: FIXTURE_SKILL, llmJudge: judge, ...extra });
}

/** juiz fake determinístico: ecoa request_kind/classifications no body da resposta. */
async function echoJudge(_p: StudyRequestEnvelope): Promise<unknown> {
  return { request_kind: 'challenge_verify', classifications: [], notes: 'judge-fake' };
}

describe('StudyMethodRunner', () => {
  let tmp = '';

  before(async () => {
    tmp = await mkTempDir();
  });
  after(async () => {
    await rmrf(tmp);
  });

  // ───────────────────────────── resolveSkillDir ─────────────────────────────
  describe('resolveSkillDir', () => {
    it('resolve via getAppPath()/skills/study-method quando não há env nem skillDir', async () => {
      const fakeApp = path.join(tmp, 'FakeApp');
      await writeFile(path.join(fakeApp, 'skills', 'study-method', 'scripts', 'setup-init.sh'), '#!/usr/bin/env bash\n');
      const runner = createStudyMethodRunner({ getAppPath: () => fakeApp });
      assert.equal(await runner.resolveSkillDir(), path.join(fakeApp, 'skills', 'study-method'));
    });

    it('env STUDY_METHOD_SKILL_DIR tem precedência', async () => {
      const fakeApp = path.join(tmp, 'FakeApp2');
      await writeFile(path.join(fakeApp, 'skills', 'study-method', 'scripts', 'setup-init.sh'), '#!/usr/bin/env bash\n');
      const prev = process.env['STUDY_METHOD_SKILL_DIR'];
      process.env['STUDY_METHOD_SKILL_DIR'] = FIXTURE_SKILL;
      try {
        const runner = createStudyMethodRunner({ getAppPath: () => fakeApp });
        assert.equal(await runner.resolveSkillDir(), FIXTURE_SKILL);
      } finally {
        if (prev === undefined) delete process.env['STUDY_METHOD_SKILL_DIR'];
        else process.env['STUDY_METHOD_SKILL_DIR'] = prev;
      }
    });

    it('lança erro claro quando nenhum candidato tem scripts/setup-init.sh', async () => {
      const fakeApp = path.join(tmp, 'FakeMissing');
      await writeFile(path.join(fakeApp, 'skills', 'study-method', 'README.md'), 'sem setup-init');
      const runner = createStudyMethodRunner({ getAppPath: () => fakeApp });
      await assert.rejects(() => runner.resolveSkillDir(), /setup-init\.sh/);
    });
  });

  // ───────────────────────────────── runScript ───────────────────────────────
  describe('runScript', () => {
    it('captura exitCode/stdout e grava STUDY_METHOD_SKILL_DIR no env', async () => {
      const rec = path.join(tmp, 'runscript-record.txt');
      const prev = process.env['STUDY_METHOD_FIXTURE_RECORD'];
      process.env['STUDY_METHOD_FIXTURE_RECORD'] = rec;
      try {
        const runner = makeRunner();
        const res = await runner.runScript('setup-init.sh', ['/s', '--subject', 'Matemática', '--title', 'Cálculo I']);
        assert.equal(res.exitCode, 0);
        assert.match(res.stdout.trim(), /^[0-9a-f]{12}$/);
        assert.ok(await fileExists(rec));
      } finally {
        if (prev === undefined) delete process.env['STUDY_METHOD_FIXTURE_RECORD'];
        else process.env['STUDY_METHOD_FIXTURE_RECORD'] = prev;
      }
    });

    it('timeout mata o script e reporta erro de execução', async () => {
      // um fixture "hang" que dorme; criado num skillDir temporário dedicado.
      const hangSkill = path.join(tmp, 'hang-skill');
      await writeFile(path.join(hangSkill, 'scripts', 'hang.sh'),
        '#!/usr/bin/env bash\nsleep 30\necho "nunca chego aqui"\n');
      const runner = createStudyMethodRunner({ skillDir: hangSkill, defaultTimeoutMs: 80 });
      const t0 = Date.now();
      const res = await runner.runScript('hang.sh', [], { timeoutMs: 80 });
      const elapsed = Date.now() - t0;
      assert.equal(res.exitCode, 1);
      assert.match(res.stderr, /timeout/);
      assert.ok(elapsed < 3000, `timeout deveria matar rápido, levou ${elapsed}ms`);
    });

    it('script inexistente reporta erro claro', async () => {
      const runner = makeRunner();
      const res = await runner.runScript('nao-existe.sh', []);
      assert.equal(res.exitCode, 1);
      assert.match(res.stderr, /script não encontrado/);
    });
  });

  // ────────────────────────── protocolo exit 10 ──────────────────────────────
  describe('handleExit10 (REQUEST/APPLY)', () => {
    it('com juiz: chama llmJudge(pedido), grava reply e re-invoca com o MESMO request_id', async () => {
      const calls: StudyRequestEnvelope[] = [];
      const judge = async (p: StudyRequestEnvelope) => { calls.push(p); return { applied: true }; };
      const runner = makeRunner(judge);
      const handled = await runner.handleExit10('exit10-request.sh', []);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].kind, 'some_judgment');
      assert.equal(calls[0].request_id, 'aabbccddee00');
      assert.equal(calls[0].protocol, 'study-method/request-apply');
      assert.equal(handled.cyclesUsed, 1);
      assert.equal(handled.result.exitCode, 0);
      assert.match(handled.result.stdout, /"applied":\s*"ok"/);
      assert.equal(handled.applyExhausted, false);
    });

    it('sem juiz e com exit 10: retorna degradado sem chamar apply', async () => {
      const runner = makeRunner(); // sem llmJudge
      const handled = await runner.handleExit10('challenge-verify.sh', []);
      assert.equal(handled.result.exitCode, 10);
      assert.equal(handled.cyclesUsed, 0);
    });

    it('max 2 ciclos: se o script segue pedindo exit 10 após --apply, aplica o teto e sinaliza applyExhausted', async () => {
      // um script que SEMPRE pede exit 10 (nunca aceita --apply) num skillDir temporário.
      const loopSkill = path.join(tmp, 'loop-skill');
      const envelope = {
        protocol: 'study-method/request-apply', protocol_version: '1.0',
        request_id: 'cccc0000', script: 'always10.sh', kind: 'classify_survivor', setup_id: null,
        generated_at: 'x', response_schema: 'urn', instructions_pt_br: 'x', payload: {},
      };
      await writeFile(path.join(loopSkill, 'scripts', 'always10.sh'),
        '#!/usr/bin/env bash\n'
        + `printf '%s\\n' '${JSON.stringify(envelope)}'\n`
        + 'exit 10\n');

      let calls = 0;
      const judge = async (p: StudyRequestEnvelope) => { calls++; return { applied: true }; };
      const runner = createStudyMethodRunner({ skillDir: loopSkill, llmJudge: judge });
      const handled = await runner.handleExit10('always10.sh', []);
      assert.equal(handled.cyclesUsed, 2);
      assert.equal(handled.result.exitCode, 10);
      assert.equal(handled.applyExhausted, true);
      assert.ok(calls >= 2, `o juiz deveria ser chamado 2x, foi ${calls}`);
    });

    it('resposta/juiz com corpo inválido não aplica (erro estrutural marcado)', async () => {
      // juiz devolve null -> buildApplyFile não consegue montar items -> aborta.
      const judge = async (_p: StudyRequestEnvelope) => null;
      const runner = makeRunner(judge);
      const handled = await runner.handleExit10('exit10-request.sh', []);
      assert.equal(handled.applyExhausted, true);
    });
  });

  // ───────────────────────────── verifyChallenge ─────────────────────────────
  describe('verifyChallenge', () => {
    it('aprovada: ciclo exit 10 com juiz e veredito approved no stdout', async () => {
      const calls: StudyRequestEnvelope[] = [];
      const judge = async (p: StudyRequestEnvelope) => { calls.push(p); return echoJudge(p); };
      const runner = makeRunner(judge);
      const dir = path.join(tmp, 'chal-approve');
      await writeFile(path.join(dir, 'meta.json'), '{}');
      const res = await runner.verifyChallenge(dir);

      assert.equal(calls.length, 1);
      assert.equal(res.verdict, 'approved');
      assert.equal(res.mutationScore, 0.9);
      assert.equal(res.rejections.length, 0);
      assert.equal(res.applyExhausted, false);
    });

    it('rejeitada (NO_EXIT10): sem chamar juiz, veredito rejected', async () => {
      let judged = false;
      const judge = async (_p: StudyRequestEnvelope) => { judged = true; return {}; };
      const prevNoExit = process.env['STUDY_METHOD_FIXTURE_NO_EXIT10'];
      const prevVerdict = process.env['STUDY_METHOD_FIXTURE_VERDICT'];
      process.env['STUDY_METHOD_FIXTURE_NO_EXIT10'] = '1';
      process.env['STUDY_METHOD_FIXTURE_VERDICT'] = 'rejected';
      try {
        const runner = makeRunner(judge);
        const dir = path.join(tmp, 'chal-reject');
        await writeFile(path.join(dir, 'meta.json'), '{}');
        const res = await runner.verifyChallenge(dir);
        assert.equal(res.verdict, 'rejected');
        assert.equal(judged, false);
      } finally {
        restoreEnv('STUDY_METHOD_FIXTURE_NO_EXIT10', prevNoExit);
        restoreEnv('STUDY_METHOD_FIXTURE_VERDICT', prevVerdict);
      }
    });

    it('exit 10 sem juiz vira not_run com applyExhausted false', async () => {
      const runner = makeRunner(); // sem juiz
      const dir = path.join(tmp, 'chal-nojudge');
      await writeFile(path.join(dir, 'meta.json'), '{}');
      const res = await runner.verifyChallenge(dir);
      assert.equal(res.verdict, 'not_run');
      assert.equal(res.applyExhausted, false);
    });
  });

  // ───────────────────────────── testStudentAnswer ───────────────────────────
  describe('testStudentAnswer', () => {
    async function buildRunnerChallenge(exit: number): Promise<string> {
      const dir = path.join(tmp, `chal-run-${Math.random().toString(36).slice(2)}`);
      await writeFile(path.join(dir, 'stub.py'), '# stub do aluno\n');
      await writeFile(path.join(dir, 'README.md'), '# desafio\n');
      await writeFile(path.join(dir, 'tests', 'test_stub.py'), '# teste\n');
      // arquivo que NÃO deve aparecer no workspace copiado (em .solution/)
      await writeFile(path.join(dir, '.solution', 'reference.py'), 'def fatorial(n):\n    return 1\n');
      await writeFile(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      // copia o runner.sh da fixture (mesmo formato do template real)
      const runnerSrc = await readFile(path.join(FIXTURE_SKILL, 'runner.sh'));
      await writeFile(path.join(dir, 'runner.sh'), runnerSrc);
      await fsp.chmod(path.join(dir, 'runner.sh'), 0o755);
      process.env['STUDY_METHOD_FIXTURE_RUNNER_EXIT'] = String(exit);
      return dir;
    }

    function unsetRunExit(): void {
      delete process.env['STUDY_METHOD_FIXTURE_RUNNER_EXIT'];
    }

    it('exclui .solution/ e .git do workspace copiado; qualquer código do aluno que os referencie falha', async () => {
      // o runner fake verifica que .solution e .git NÃO existem no cwd onde roda.
      const dir = path.join(tmp, `chal-no-sol-${Math.random().toString(36).slice(2)}`);
      await writeFile(path.join(dir, 'stub.py'), 'x');
      await writeFile(path.join(dir, '.solution', 'reference.py'), 'secret');
      await writeFile(path.join(dir, '.git', 'config'), '[core]\n');
      await writeFile(path.join(dir, 'runner.sh'),
        '#!/usr/bin/env bash\n'
        + 'if [ -e .solution ]; then echo BAD_SOLUTION_PRESENT; exit 1; fi\n'
        + 'if [ -e .git ]; then echo BAD_GIT_PRESENT; exit 1; fi\n'
        + 'if [ ! -e stub.py ]; then echo BAD_NO_STUB; exit 1; fi\n'
        + 'echo "---"\n'
        + 'echo "TESTS_RUN=2 ESPERADO=2 EXIT_BRUTO=0 DECORRIDO_MS=1 LINGUAGEM=x"\n'
        + 'echo "VEREDITO=passed"\nexit 0\n');
      await fsp.chmod(path.join(dir, 'runner.sh'), 0o755);
      const runner = makeRunner();
      const res = await runner.testStudentAnswer(dir);
      assert.equal(res.passed, true, res.output);
      assert.ok(!/BAD_SOLUTION_PRESENT/.test(res.output), 'não deve haver .solution no cwd do runner');
      assert.ok(!/BAD_GIT_PRESENT/.test(res.output), 'não deve haver .git no cwd do runner');
      assert.ok(!/BAD_NO_STUB/.test(res.output), 'o stub visível deve existir');
    });

    for (const [exit, passed, verdict] of [
      [0, true, 'passed'],
      [1, false, 'failed'],
      [2, false, 'count_mismatch'],
      [3, false, 'timeout'],
    ] as const) {
      it(`mapeia exit ${exit} -> passed=${passed} (verdict ${verdict})`, async () => {
        const dir = await buildRunnerChallenge(exit);
        const runner = makeRunner();
        const res = await runner.testStudentAnswer(dir);
        // exit 0..3 são decisão do runner (não é erro de infra): success = true.
        assert.equal(res.success, true, JSON.stringify(res));
        assert.equal(res.passed, passed);
        assert.equal(res.exitCode, exit);
        assert.equal(res.verdict, verdict);
        unsetRunExit();
      });
    }

    it('runner ausente -> infra (success:false, exit 66)', async () => {
      const dir = path.join(tmp, `chal-no-runner-${Math.random().toString(36).slice(2)}`);
      await writeFile(path.join(dir, 'stub.py'), 'x');
      const runner = makeRunner();
      const res = await runner.testStudentAnswer(dir);
      assert.equal(res.success, false);
      assert.equal(res.exitCode, 66);
      assert.equal(res.passed, false);
      assert.match(res.output, /runner\.sh não encontrado/);
    });
  });

  // ───────────────────────────── createSetup/newSession/createChallenge ─────
  describe('createSetup/newSession/createChallenge', () => {
    it('createSetup invoca setup-init.sh com os flags corretos (registrados num arquivo)', async () => {
      const rec = path.join(tmp, 'setup-record.txt');
      const prev = process.env['STUDY_METHOD_FIXTURE_RECORD'];
      process.env['STUDY_METHOD_FIXTURE_RECORD'] = rec;
      try {
        const runner = makeRunner();
        const r = await runner.createSetup({
          path: '/tmp/setup-mat',
          subject: 'Matemática',
          subjectSlug: 'calculo-i',
          title: 'Cálculo I',
          language: 'python',
          skillLevel: 'intermediate',
          sessionMinutes: 60,
          theorySource: 'generated',
        });
        assert.equal(r.setupId, 'a1b2c3d4e5f6');
        const argsLine = (await readFile(rec)).trim();
        assert.match(argsLine, /--subject Matemática/);
        assert.match(argsLine, /--subject-slug calculo-i/);
        assert.match(argsLine, /--title Cálculo I/);
        assert.match(argsLine, /--language python/);
        assert.match(argsLine, /--skill-level intermediate/);
        assert.match(argsLine, /--session-minutes 60/);
        assert.match(argsLine, /--theory-source generated/);
      } finally {
        restoreEnv('STUDY_METHOD_FIXTURE_RECORD', prev);
      }
    });

    it('newSession devolve o NNNN alocado (4 dígitos)', async () => {
      const rec = path.join(tmp, 'session-record.txt');
      const prev = process.env['STUDY_METHOD_FIXTURE_RECORD'];
      process.env['STUDY_METHOD_FIXTURE_RECORD'] = rec;
      try {
        const runner = makeRunner();
        const nnnn = await runner.newSession('/tmp/setup-mat', 'estudar limites');
        assert.equal(nnnn, '0042');
        const argsLine = (await readFile(rec)).trim();
        assert.match(argsLine, /--goal estudar limites/);
      } finally {
        restoreEnv('STUDY_METHOD_FIXTURE_RECORD', prev);
      }
    });

    it('createChallenge invoca challenge-new.sh com language/slug/concept e devolve o caminho', async () => {
      const rec = path.join(tmp, 'chal-record.txt');
      const prev = process.env['STUDY_METHOD_FIXTURE_RECORD'];
      process.env['STUDY_METHOD_FIXTURE_RECORD'] = rec;
      try {
        const runner = makeRunner();
        const r = await runner.createChallenge('/tmp/setup-mat', {
          language: 'python',
          slug: 'factorial',
          concept: 'recursion',
          difficulty: 3,
        });
        assert.equal(r.relativePath, 'challenges/0001-factorial');
        assert.equal(r.challengeDirAbs, path.resolve('/tmp/setup-mat', 'challenges/0001-factorial'));
        const argsLine = (await readFile(rec)).trim();
        assert.match(argsLine, /--language python/);
        assert.match(argsLine, /--slug factorial/);
        assert.match(argsLine, /--concept recursion/);
        assert.match(argsLine, /--difficulty 3/);
      } finally {
        restoreEnv('STUDY_METHOD_FIXTURE_RECORD', prev);
      }
    });
  });
});

function restoreEnv(key: string, prev: string | undefined): void {
  if (prev === undefined) delete process.env[key];
  else process.env[key] = prev;
}