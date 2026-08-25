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

    it('path traversal (../x.sh) é rejeitado sem executar nada (exec fake não é chamado)', async () => {
      const calls: Array<{ file: string; args: string[] }> = [];
      const fakeExec = ((file: string, args: string[]) => {
        calls.push({ file, args });
        return { stdout: null, stderr: null, kill: () => {}, on: () => {} };
      }) as unknown as typeof import('node:child_process').spawn;
      const runner = makeRunner(undefined, { exec: fakeExec });
      const res = await runner.runScript('../x.sh', []);
      assert.equal(calls.length, 0, 'o exec fake NÃO deve ser chamado para traversal');
      assert.equal(res.exitCode, -1, JSON.stringify(res));
      assert.match(res.stderr, /inválido|traversal/);
    });

    it('path traversal (a/b.sh) é rejeitado sem executar nada (exec fake não é chamado)', async () => {
      const calls: Array<{ file: string; args: string[] }> = [];
      const fakeExec = ((file: string, args: string[]) => {
        calls.push({ file, args });
        return { stdout: null, stderr: null, kill: () => {}, on: () => {} };
      }) as unknown as typeof import('node:child_process').spawn;
      const runner = makeRunner(undefined, { exec: fakeExec });
      const res = await runner.runScript('a/b.sh', []);
      assert.equal(calls.length, 0, 'o exec fake NÃO deve ser chamado para traversal');
      assert.equal(res.exitCode, -1, JSON.stringify(res));
      assert.match(res.stderr, /inválido|traversal/);
    });

    it('backslash (a\\b.sh), vazio e ".." também são rejeitados sem executar', async () => {
      const calls: Array<{ file: string; args: string[] }> = [];
      const fakeExec = ((file: string, args: string[]) => {
        calls.push({ file, args });
        return { stdout: null, stderr: null, kill: () => {}, on: () => {} };
      }) as unknown as typeof import('node:child_process').spawn;
      const runner = makeRunner(undefined, { exec: fakeExec });
      for (const name of ['..\\x.sh', '', '..']) {
        const res = await runner.runScript(name, []);
        assert.equal(calls.length, 0, `exec fake NÃO deve ser chamado para '${name}'`);
        assert.equal(res.exitCode, -1, `'${name}' deveria ser rejeitado: ${JSON.stringify(res)}`);
      }
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

    /** envelope de PEDIDO do fixture challenge-verify.sh (fase 1 do fake). */
    const VERIFY_ENVELOPE = JSON.stringify({
      protocol: 'study-method/request-apply', protocol_version: '1.0',
      request_id: 'f1e2d3c4b5a6', script: 'challenge-verify.sh', kind: 'classify_survivor',
      setup_id: null, generated_at: '2026-08-23T21:00:00-03:00',
      response_schema: 'urn:study-method:schema:challenge-verify-response:1',
      instructions_pt_br: 'Classifique cada mutante sobrevivente como equivalent ou not_equivalent, com justification.',
      payload: { items: [] },
    });

    /**
     * child fake no padrão fakeExec do arquivo: emite stdout/stderr via 'data' e o
     * exitCode via 'close', com comportamento POR CHAMADA (a última fase se repete).
     */
    function fakeVerifyChild(
      phases: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
    ): { fakeExec: typeof import('node:child_process').spawn; calls: Array<{ file: string; args: string[] }> } {
      const calls: Array<{ file: string; args: string[] }> = [];
      const fakeExec = ((file: string, args: string[]) => {
        calls.push({ file, args });
        const phase = phases[Math.min(calls.length - 1, phases.length - 1)];
        const stream = {
          on: (ev: string, cb: (chunk: Buffer) => void) => {
            if (ev === 'data') {
              if (phase.stdout) cb(Buffer.from(phase.stdout));
              if (phase.stderr) cb(Buffer.from(phase.stderr));
            }
            return stream;
          },
        };
        return {
          stdout: stream,
          stderr: stream,
          kill: () => {},
          on: (ev: string, cb: (code?: number) => void) => {
            if (ev === 'close') cb(phase.exitCode);
          },
        };
      }) as unknown as typeof import('node:child_process').spawn;
      return { fakeExec, calls };
    }

    // fix-generation-robustness: juiz malformado (JSON válido mas fora do
    // response_schema, ex.: faltou schema_version/request_kind) → o SCRIPT recusa o
    // apply com exit 5 (sm_apply_read → SCHEMA_FAILED, RA-3). O desafio DEGRADA para
    // not_run (apply_exhausted) em vez de abortar a aula inteira: verifyChallenge NÃO lança.
    it('exit 5 no ciclo --apply (juiz recusado pelo schema) NÃO lança: degrada para not_run/apply_exhausted', async () => {
      const { fakeExec, calls } = fakeVerifyChild([
        // 1º ciclo SEM --apply: pedido REQUEST parseável no stdout, sai 10.
        { exitCode: 10, stdout: `${VERIFY_ENVELOPE}\n` },
        // 2º ciclo COM --apply: o script recusa a RESPOSTA do juiz (SCHEMA_FAILED).
        { exitCode: 5, stderr: 'sm_apply_read: resposta fora do response_schema (faltou schema_version/request_kind)' },
      ]);
      // o juiz devolve algo que passa no buildApplyFile para o apply ser escrito.
      const judge = async (_p: StudyRequestEnvelope) => ({ request_kind: 'challenge_verify', classifications: [] });
      const runner = makeRunner(judge, { exec: fakeExec });
      const dir = path.join(tmp, 'chal-apply-rejected');
      await writeFile(path.join(dir, 'meta.json'), '{}');
      const res = await runner.verifyChallenge(dir);

      assert.equal(calls.length, 2, JSON.stringify(calls));
      assert.match(calls[1].args.join(' '), /--apply/, 'o 2º ciclo re-invoca com --apply');
      assert.equal(res.verdict, 'not_run');
      assert.equal(res.protocolIssue, 'apply_exhausted');
      assert.equal(res.applyExhausted, true);
      assert.equal(res.exitCode, 5);
      assert.deepEqual(res.rejections, []);
    });

    // meta.json inválido (infra REAL, sem ciclo --apply): exit 5 na 1ª chamada
    // continua sendo erro de infraestrutura — verifyChallenge LANÇA (aula deve abortar).
    it('exit 5 SEM ciclo --apply (meta inválido — infra) continua lançando', async () => {
      const { fakeExec, calls } = fakeVerifyChild([
        { exitCode: 5, stderr: 'challenge-verify.sh: meta.json inválido (SCHEMA_FAILED)' },
      ]);
      const runner = makeRunner(undefined, { exec: fakeExec });
      const dir = path.join(tmp, 'chal-meta-invalido');
      await writeFile(path.join(dir, 'meta.json'), '{ inválido');
      await assert.rejects(
        () => runner.verifyChallenge(dir),
        /challenge-verify\.sh falhou \(exit 5\)/,
      );
      assert.equal(calls.length, 1, 'sem ciclo --apply, o script é invocado 1x só');
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

    // P3(a)/(b): exits de infraestrutura (66) e desconhecidos (42) caem no caminho
    // 'infra' — success:false, o exit é preservado e o veredito do output é infra.
    for (const exit of [66, 42]) {
      it(`mapeia exit ${exit} -> infra (success:false, exitCode preservado, verdict infra)`, async () => {
        const dir = await buildRunnerChallenge(exit);
        const runner = makeRunner();
        const res = await runner.testStudentAnswer(dir);
        assert.equal(res.success, false, JSON.stringify(res));
        assert.equal(res.passed, false);
        assert.equal(res.exitCode, exit);
        assert.equal(res.verdict, 'infra');
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

    // P3(d): timeout primário vem de execution.timeout_seconds no meta.json (com
    // floor de 5s). runner fake dorme 8s; meta pede 2s -> floor de 5s age -> o
    // runner é morto em ~5s (verdict timeout), bem antes do backstop de 60s.
    it('usa execution.timeout_seconds do meta.json como timeout primário (floor 5s) e seta CHALLENGE_TIMEOUT coerente', async () => {
      const dir = path.join(tmp, `chal-meta-timeout-${Math.random().toString(36).slice(2)}`);
      await writeFile(path.join(dir, 'stub.py'), 'x');
      await writeFile(path.join(dir, 'meta.json'),
        JSON.stringify({ execution: { timeout_seconds: 2 } }));
      await writeFile(path.join(dir, 'runner.sh'),
        '#!/usr/bin/env bash\n'
        + 'echo "CHALLENGE_TIMEOUT=$CHALLENGE_TIMEOUT"\n'
        + 'sleep 8\n'
        + 'echo "TESTS_RUN=1 ESPERADO=1 EXIT_BRUTO=0 DECORRIDO_MS=2 LINGUAGEM=x"\n'
        + 'echo "VEREDITO=passed"\nexit 0\n');
      await fsp.chmod(path.join(dir, 'runner.sh'), 0o755);
      const runner = makeRunner();
      const t0 = Date.now();
      const res = await runner.testStudentAnswer(dir);
      const elapsed = Date.now() - t0;
      assert.equal(res.exitCode, 3, JSON.stringify(res));
      assert.equal(res.verdict, 'timeout');
      // coerência: CHALLENGE_TIMEOUT reflete o floor aplicado (5s), não o 2 cru nem o 60 do backstop.
      assert.match(res.output, /CHALLENGE_TIMEOUT=5/);
      assert.ok(elapsed < 8000, `timeout primário do meta.json deveria matar em ~5s, levou ${elapsed}ms`);
    });

    it('sem meta.json válido cai no backstop de 60s (CHALLENGE_TIMEOUT=60)', async () => {
      const dir = await buildRunnerChallenge(0);
      // remove o meta.json (caso exista) para garantir backstop.
      const metaPath = path.join(dir, 'meta.json');
      if (await fileExists(metaPath)) await fsp.rm(metaPath);
      const runner = makeRunner();
      const res = await runner.testStudentAnswer(dir);
      assert.equal(res.exitCode, 0, JSON.stringify(res));
      assert.equal(res.verdict, 'passed');
      unsetRunExit();
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

    // fix-session-reuse: geração pode reusar a sessão viva do setup (exit 4 da
    // skill). O stderr real traz `session_id <NNNN>` no corpo da mensagem de erro
    // (sm_die 4 de session-new.sh); o runner só devolve esse id com reuseLive:true.
    // Sem reuseLive, ou sem id parseável, o erro original da skill continua lançado.
    const LOCKED_STDERR =
      'study-method: erro 4: já há uma sessão viva neste setup (session_id 0001; lock com TTL 8h). ' +
      'Feche-a com session-close.sh, ou siga em modo somente-leitura (sem gravar NNNN.json).';

    /** child fake no padrão fakeExec do arquivo: emite stderr no 'data' e exitCode no 'close'. */
    function fakeSessionChild(
      exitCode: number,
      stderrText: string,
    ): { fakeExec: typeof import('node:child_process').spawn; calls: Array<{ file: string; args: string[] }> } {
      const calls: Array<{ file: string; args: string[] }> = [];
      const fakeExec = ((file: string, args: string[]) => {
        calls.push({ file, args });
        const stream = {
          on: (ev: string, cb: (chunk: Buffer) => void) => {
            if (ev === 'data') cb(Buffer.from(stderrText));
            return stream;
          },
        };
        return {
          stdout: null,
          stderr: stream,
          kill: () => {},
          on: (ev: string, cb: (code?: number) => void) => {
            if (ev === 'close') cb(exitCode);
          },
        };
      }) as unknown as typeof import('node:child_process').spawn;
      return { fakeExec, calls };
    }

    it('exit 4 + reuseLive:true devolve o session_id da sessão viva (0001)', async () => {
      const { fakeExec } = fakeSessionChild(4, LOCKED_STDERR);
      const runner = makeRunner(undefined, { exec: fakeExec });
      const nnnn = await runner.newSession('/tmp/setup-mat', 'estudar limites', { reuseLive: true });
      assert.equal(nnnn, '0001');
    });

    it('exit 4 SEM reuseLive lança a mensagem original da skill (ação explícita do aluno)', async () => {
      const { fakeExec } = fakeSessionChild(4, LOCKED_STDERR);
      const runner = makeRunner(undefined, { exec: fakeExec });
      await assert.rejects(
        () => runner.newSession('/tmp/setup-mat', 'estudar limites'),
        /já há uma sessão viva neste setup \(session_id 0001/,
      );
    });

    it('exit 4 + reuseLive:true mas stderr sem session_id NÃO degrada em silêncio: lança o erro original', async () => {
      const { fakeExec } = fakeSessionChild(4, 'study-method: erro 4: recurso travado (sem id visível).');
      const runner = makeRunner(undefined, { exec: fakeExec });
      await assert.rejects(
        () => runner.newSession('/tmp/setup-mat', 'estudar limites', { reuseLive: true }),
        /session-new\.sh falhou \(exit 4\)/,
      );
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