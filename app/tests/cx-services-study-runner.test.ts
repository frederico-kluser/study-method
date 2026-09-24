/**
 * tests/cx-services-study-runner.test.ts — CARACTERIZAÇÃO (golden master) de
 * `electron/main/services/studyMethodRunner.ts` ANTES da refatoração de
 * core/services.
 *
 * Fixa a ponte GUI ↔ scripts da skill: literais de exit code (docs/00 §5),
 * anti path-traversal do runScript, protocolo REQUEST/APPLY (exit 10 → juiz →
 * --apply, teto 2 ciclos, discriminadores honestos), wrappers createSetup/
 * newSession/createChallenge/verifyChallenge e a execução determinística da
 * resposta do aluno (testStudentAnswer com o contrato 0/1/2/3/66).
 *
 * SEM REDE e SEM a skill real: os "scripts" são bashs mínimos gravados em
 * tmpdirs próprios (/tmp/do-cxsvc-*) e o juiz LLM é fake. A execução é REAL
 * (bash do sistema) de propósito — é o comportamento observável do runner.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DEFAULT_OUTPUT_LIMIT,
  REQUEST_APPLY_MAX_CYCLES,
  REQUEST_APPLY_PROTOCOL,
  REQUEST_APPLY_PROTOCOL_VERSION,
  RUNNER_EXIT_CODES,
  SKILL_EXIT_CODES,
  createStudyMethodRunner,
  type LlmJudge,
  type StudyMethodRunner,
  type StudyRequestEnvelope,
} from '../electron/main/services/studyMethodRunner';

let tmpRaiz = '';
let skillDir = '';

async function writeScript(nome: string, corpo: string): Promise<void> {
  const p = path.join(skillDir, 'scripts', nome);
  await fsp.writeFile(p, `#!/usr/bin/env bash\n${corpo}`, 'utf8');
  await fsp.chmod(p, 0o755);
}

function runner(over: Partial<Parameters<typeof createStudyMethodRunner>[0]> = {}): StudyMethodRunner {
  return createStudyMethodRunner({
    skillDir,
    tmpDir: tmpRaiz,
    defaultTimeoutMs: 5_000,
    outputLimit: DEFAULT_OUTPUT_LIMIT,
    ...over,
  });
}

const ENVELOPE_REQUEST = JSON.stringify({
  protocol: 'study-method/request-apply',
  protocol_version: '1.0',
  request_id: 'abc123def456',
  script: 'challenge-verify.sh',
  kind: 'classify_survivor',
  setup_id: null,
  generated_at: '2026-01-01T00:00:00Z',
  response_schema: 'urn:study-method:schema:x:1',
  instructions_pt_br: 'Classifique o sobrevivente.',
  payload: { items: [] },
});

before(async () => {
  tmpRaiz = await fsp.mkdtemp('/tmp/do-cxsvc-runner-').catch(async () =>
    fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxsvc-runner-')),
  );
  skillDir = path.join(tmpRaiz, 'skill');
  await fsp.mkdir(path.join(skillDir, 'scripts'), { recursive: true });

  // setup-init.sh: o 1º arg (o path do setup) decide o cenário.
  await writeScript(
    'setup-init.sh',
    [
      'case "$1" in',
      '  *falha*) echo "boom" >&2; exit 1 ;;',
      '  *id-ruim*) echo "saida qualquer"; exit 0 ;;',
      'esac',
      'echo "registry atualizado"',
      'echo "9f2c41ab77e0"',
      'exit 0',
    ].join('\n'),
  );

  // session-new.sh: exit 4 (RESOURCE_LOCKED) traz `session_id <NNNN>` no stderr.
  await writeScript(
    'session-new.sh',
    [
      'case "$1" in',
      '  *travado*) echo "recurso ocupado: session_id 0007 vivo" >&2; exit 4 ;;',
      '  *id-ruim*) echo "abc"; exit 0 ;;',
      '  *falha*) echo "sem setup" >&2; exit 3 ;;',
      'esac',
      'echo "0012"',
      'exit 0',
    ].join('\n'),
  );

  // challenge-new.sh: devolve o caminho relativo do desafio.
  await writeScript(
    'challenge-new.sh',
    [
      'case "$*" in',
      '  *slug-ruim*) echo "caminho/invalido"; exit 0 ;;',
      'esac',
      'echo "challenges/0003-soma"',
      'exit 0',
    ].join('\n'),
  );

  // challenge-verify.sh: o 1º arg (challengeDir) escolhe o cenário.
  await writeScript(
    'challenge-verify.sh',
    [
      'DIR="$1"',
      'case "$DIR" in',
      '  *esgotado*)',
      `    echo '${ENVELOPE_REQUEST}'; exit 10 ;;`,
      '  *resposta-recusada*)',
      '    if [[ "$*" == *--apply* ]]; then echo "schema da resposta recusado" >&2; exit 5; fi',
      `    echo '${ENVELOPE_REQUEST}'; exit 10 ;;`,
      '  *ciclo-ok*)',
      '    if [[ "$*" == *--apply* ]]; then echo "aplicado"; exit 0; fi',
      `    echo '${ENVELOPE_REQUEST}'; exit 10 ;;`,
      '  *pedido-ruim*)',
      '    echo "quero julgamento mas sem envelope"; exit 10 ;;',
      '  *aprovado*)',
      `    echo '{"verdict":"approved","mutation_score":90,"killed":9,"survived":1,"rejections":[]}'; exit 0 ;;`,
      '  *rejeitado*)',
      `    echo '{"verdict":"rejected","rejections":["fails_on_reference"]}'; exit 0 ;;`,
      '  *sem-resumo*) exit 0 ;;',
      '  *schema-ruim*) echo "meta.json inválido" >&2; exit 5 ;;',
      '  *setup-faltando*) exit 3 ;;',
      '  *travado*) exit 4 ;;',
      'esac',
      'exit 0',
    ].join('\n'),
  );

  // eco.sh / variaveis.sh / limite.sh / dorme.sh — utilitários do runScript.
  await writeScript('eco.sh', 'echo "arg=$1"; echo "skill=$STUDY_METHOD_SKILL_DIR"');
  await writeScript('variaveis.sh', 'echo "VAR=$MINHA_VAR"');
  await writeScript('limite.sh', 'echo "0123456789ABCDEF"');
  await writeScript('dorme.sh', 'sleep 30');

  // Scripts standalone do protocolo REQUEST/APPLY (testes de handleExit10).
  await writeScript(
    'ciclo-ok.sh',
    [
      'if [[ "$*" == *--apply* ]]; then echo "aplicado"; exit 0; fi',
      `echo '${ENVELOPE_REQUEST}'`,
      'exit 10',
    ].join('\n'),
  );
  await writeScript('pedido-ruim.sh', 'echo "quero julgamento mas sem envelope"; exit 10');
  await writeScript('esgotado.sh', `echo '${ENVELOPE_REQUEST}'\nexit 10`);
});

after(async () => {
  await fsp.rm(tmpRaiz, { recursive: true, force: true });
});

// ─── literais de contrato (docs/00 §5) ───────────────────────────────────────

describe('cx/studyRunner: constantes (golden master × docs/00-contratos.md §5/§6)', () => {
  it('SKILL_EXIT_CODES = tabela §5.1 (0/1/2/3/4/5/10; 6-9 e 11+ reservados)', () => {
    assert.deepEqual(SKILL_EXIT_CODES, {
      OK: 0,
      EXEC_ERROR: 1,
      USAGE: 2,
      SETUP_NOT_FOUND: 3,
      RESOURCE_LOCKED: 4,
      SCHEMA_FAILED: 5,
      NEEDS_MODEL_INPUT: 10,
    });
  });

  it('RUNNER_EXIT_CODES = exceção nomeada §5.2 (0/1/2/3 + 66 do cd)', () => {
    assert.deepEqual(RUNNER_EXIT_CODES, {
      PASSED: 0,
      FAILED: 1,
      COUNT_MISMATCH: 2,
      TIMEOUT: 3,
      CD_FAILED: 66,
    });
  });

  it('protocolo REQUEST/APPLY: nome, versão, teto de 2 ciclos e limite de saída', () => {
    assert.equal(REQUEST_APPLY_PROTOCOL, 'study-method/request-apply');
    assert.equal(REQUEST_APPLY_PROTOCOL_VERSION, '1.0');
    assert.equal(REQUEST_APPLY_MAX_CYCLES, 2);
    assert.equal(DEFAULT_OUTPUT_LIMIT, 50 * 1024);
  });
});

// ─── runScript ───────────────────────────────────────────────────────────────

describe('cx/studyRunner: runScript (contenção de path + captura)', () => {
  it('nomes que não são basename simples são REJEITADOS sem executar (anti path-traversal)', async () => {
    const r = runner();
    for (const nome of ['../fora.sh', 'a/b.sh', 'x\\y.sh', '.', '..', '']) {
      const res = await r.runScript(nome, []);
      assert.equal(res.exitCode, -1, nome);
      assert.ok(/inválido|vazio/.test(res.stderr), `stderr para ${nome}: ${res.stderr}`);
    }
  });

  it('script inexistente ⇒ exit 1 (EXEC_ERROR) com o caminho tentado', async () => {
    const res = await runner().runScript('nao-existe.sh', []);
    assert.equal(res.exitCode, SKILL_EXIT_CODES.EXEC_ERROR);
    assert.ok(res.stderr.includes('script não encontrado'));
  });

  it('roda de verdade: repasse de args + STUDY_METHOD_SKILL_DIR no ambiente', async () => {
    const res = await runner().runScript('eco.sh', ['meu-arg']);
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.includes('arg=meu-arg'));
    assert.ok(res.stdout.includes(`skill=${skillDir}`));
  });

  it('opts.env é acrescido ao ambiente; outputLimit do runner corta o stdout pelos ÚLTIMOS bytes', async () => {
    const r = runner();
    const res = await r.runScript('variaveis.sh', [], { env: { MINHA_VAR: 'valor-env' } });
    assert.ok(res.stdout.includes('VAR=valor-env'));

    // O corte é o teto de CAPTURA do runner (RunScriptOptions não tem limite
    // por chamada): fica a CAUDA — onde o veredito sempre está.
    const limitado = await runner({ outputLimit: 10 }).runScript('limite.sh', []);
    assert.equal(limitado.stdout, '789ABCDEF\n');
  });

  it('timeout mata o script e reporta EXEC_ERROR com "timeout após Nms"', async () => {
    const res = await runner().runScript('dorme.sh', [], { timeoutMs: 150 });
    assert.equal(res.exitCode, SKILL_EXIT_CODES.EXEC_ERROR);
    assert.ok(res.stderr.includes('timeout após 150ms'));
  });
});

// ─── handleExit10 (protocolo REQUEST/APPLY) ─────────────────────────────────

describe('cx/studyRunner: handleExit10 (juiz → --apply, teto 2 ciclos)', () => {
  function juizFake(resposta: unknown | ((p: StudyRequestEnvelope) => unknown)): {
    judge: LlmJudge;
    recebidos: StudyRequestEnvelope[];
  } {
    const recebidos: StudyRequestEnvelope[] = [];
    const judge: LlmJudge = async (pedido) => {
      recebidos.push(pedido);
      return typeof resposta === 'function' ? (resposta as (p: StudyRequestEnvelope) => unknown)(pedido) : resposta;
    };
    return { judge, recebidos };
  }

  it('exit 10 com PEDIDO ⇒ juiz chamado com o envelope e o script re-invocado com --apply', async () => {
    const { judge, recebidos } = juizFake({ request_kind: 'challenge_verify', items: [] });
    const res = await runner({ llmJudge: judge }).handleExit10('ciclo-ok.sh', []);
    assert.equal(res.result.exitCode, 0);
    assert.equal(res.cyclesUsed, 1);
    assert.equal(res.applyExhausted, false);
    assert.equal(res.protocolIssue, undefined);
    assert.equal(recebidos.length, 1);
    assert.equal(recebidos[0].protocol, 'study-method/request-apply');
    assert.equal(recebidos[0].request_id, 'abc123def456');
    assert.equal(recebidos[0].kind, 'classify_survivor');
  });

  it('exit 10 SEM juiz ⇒ degradado com cyclesUsed 0 e protocolIssue undefined (caminho honesto)', async () => {
    const res = await runner().handleExit10('ciclo-ok.sh', []);
    assert.equal(res.cyclesUsed, 0);
    assert.equal(res.applyExhausted, false);
    assert.equal(res.protocolIssue, undefined, '"juiz ausente" não é issue de protocolo');
  });

  it('exit 10 sem envelope parseável ⇒ protocolIssue "request_unparseable" (mesmo COM juiz)', async () => {
    const { judge, recebidos } = juizFake({});
    const res = await runner({ llmJudge: judge }).handleExit10('pedido-ruim.sh', []);
    assert.equal(res.protocolIssue, 'request_unparseable');
    assert.equal(res.applyExhausted, false);
    assert.equal(recebidos.length, 0, 'sem PEDIDO não há o que responder');
  });

  it('RESPOSTA do juiz com items > 1 é recusada (RESP-3) e vira apply_exhausted', async () => {
    const { judge } = juizFake([1, 2]);
    const res = await runner({ llmJudge: judge }).handleExit10('ciclo-ok.sh', []);
    assert.equal(res.protocolIssue, 'apply_exhausted');
    assert.equal(res.applyExhausted, true);
    assert.ok(res.result.stderr.includes('RESP-3'));
  });

  it('dois ciclos sem o script decidir ⇒ applyExhausted + "apply_exhausted" (RA-6)', async () => {
    const { judge, recebidos } = juizFake({ request_kind: 'challenge_verify' });
    const res = await runner({ llmJudge: judge }).handleExit10('esgotado.sh', []);
    assert.equal(res.cyclesUsed, REQUEST_APPLY_MAX_CYCLES);
    assert.equal(res.applyExhausted, true);
    assert.equal(res.protocolIssue, 'apply_exhausted');
    assert.equal(res.result.exitCode, SKILL_EXIT_CODES.NEEDS_MODEL_INPUT);
    assert.equal(recebidos.length, 2, 'um julgamento por ciclo');
  });
});

// ─── wrappers dos scripts ────────────────────────────────────────────────────

describe('cx/studyRunner: createSetup / newSession / createChallenge', () => {
  it('createSetup devolve o setup_id da ÚLTIMA linha (12 hex) e o setupRoot pedido', async () => {
    const out = await runner().createSetup({
      path: path.join(tmpRaiz, 'setup-ok'),
      subject: 'funções',
      subjectSlug: 'funcoes',
      title: 'Aula',
    });
    assert.deepEqual(out, { setupId: '9f2c41ab77e0', setupRoot: path.join(tmpRaiz, 'setup-ok') });
  });

  it('createSetup: exit != 0 LANÇA com o stderr; saída sem setup_id válido LANÇA', async () => {
    await assert.rejects(
      () =>
        runner().createSetup({
          path: path.join(tmpRaiz, 'qualquer-falha'),
          subject: 's',
          subjectSlug: 's',
          title: 't',
        }),
      /setup-init\.sh falhou \(exit 1\): boom/,
    );
    await assert.rejects(
      () =>
        runner().createSetup({
          path: path.join(tmpRaiz, 'qualquer-id-ruim'),
          subject: 's',
          subjectSlug: 's',
          title: 't',
        }),
      /setup_id válido/,
    );
  });

  it('newSession devolve o NNNN; reuseLive reusa a sessão viva do exit 4 (session_id no stderr)', async () => {
    const r = runner();
    assert.equal(await r.newSession(path.join(tmpRaiz, 'setup-ok')), '0012');
    assert.equal(await r.newSession(path.join(tmpRaiz, 'setup-travado'), 'meta', { reuseLive: true }), '0007');
  });

  it('newSession: exit 4 sem reuseLive LANÇA; NNNN inválido LANÇA; exit 3 LANÇA', async () => {
    const r = runner();
    await assert.rejects(() => r.newSession(path.join(tmpRaiz, 'setup-travado')), /session-new\.sh falhou \(exit 4\)/);
    await assert.rejects(() => r.newSession(path.join(tmpRaiz, 'setup-id-ruim')), /NNNN válido/);
    await assert.rejects(() => r.newSession(path.join(tmpRaiz, 'setup-falha')), /exit 3/);
  });

  it('createChallenge devolve caminho absoluto + relativo canônico challenges/NNNN-slug', async () => {
    const setupRoot = path.join(tmpRaiz, 'setup-ch');
    const out = await runner().createChallenge(setupRoot, {
      language: 'javascript',
      slug: 'soma',
      concept: 'funcoes',
    });
    assert.deepEqual(out, {
      challengeDirAbs: path.resolve(setupRoot, 'challenges/0003-soma'),
      relativePath: 'challenges/0003-soma',
    });
    await assert.rejects(
      () => runner().createChallenge(setupRoot, { language: 'js', slug: 'slug-ruim', concept: 'c' }),
      /caminho de desafio válido/,
    );
  });
});

// ─── verifyChallenge ─────────────────────────────────────────────────────────

describe('cx/studyRunner: verifyChallenge (veredito do stdout + exits de infra)', () => {
  it('resumo JSON vira veredito completo (verdict/mutation_score/killed/survived/rejections)', async () => {
    const ok = await runner().verifyChallenge(path.join(tmpRaiz, 'desafio-aprovado'));
    assert.equal(ok.verdict, 'approved');
    assert.equal(ok.mutationScore, 90);
    assert.equal(ok.killed, 9);
    assert.equal(ok.survived, 1);
    assert.deepEqual(ok.rejections, []);
    assert.equal(ok.exitCode, 0);

    const rejeitado = await runner().verifyChallenge(path.join(tmpRaiz, 'desafio-rejeitado'));
    assert.equal(rejeitado.verdict, 'rejected');
    assert.deepEqual(rejeitado.rejections, ['fails_on_reference']);
  });

  it('exit 0 sem resumo ⇒ "not_run" honesto (nunca aprova por omissão)', async () => {
    const res = await runner().verifyChallenge(path.join(tmpRaiz, 'desafio-sem-resumo'));
    assert.equal(res.verdict, 'not_run');
    assert.deepEqual(res.rejections, []);
    assert.equal(res.exitCode, 0);
  });

  it('exit 5 SEM ciclo --apply LANÇA (infra real: meta.json inválido)', async () => {
    await assert.rejects(
      () => runner().verifyChallenge(path.join(tmpRaiz, 'desafio-schema-ruim')),
      /challenge-verify\.sh falhou \(exit 5\)/,
    );
  });

  it('exit 5 COM ciclo --apply ⇒ degrada para not_run (resposta do juiz recusada)', async () => {
    const { judge } = juizFakeSimples();
    const res = await runner({ llmJudge: judge }).verifyChallenge(
      path.join(tmpRaiz, 'desafio-resposta-recusada'),
    );
    assert.equal(res.verdict, 'not_run');
    assert.equal(res.applyExhausted, true);
    assert.equal(res.protocolIssue, 'apply_exhausted');
    assert.equal(res.exitCode, 5);
  });

  it('exits 3 e 4 ⇒ not_run com o discriminador nomeado (não lançam)', async () => {
    const r3 = await runner().verifyChallenge(path.join(tmpRaiz, 'desafio-setup-faltando'));
    assert.equal(r3.verdict, 'not_run');
    assert.equal(r3.protocolIssue, 'exit_setup_not_found');
    assert.equal(r3.exitCode, 3);

    const r4 = await runner().verifyChallenge(path.join(tmpRaiz, 'desafio-travado'));
    assert.equal(r4.verdict, 'not_run');
    assert.equal(r4.protocolIssue, 'exit_resource_locked');
    assert.equal(r4.exitCode, 4);
  });

  it('exit 10 sem pedido parseável ⇒ "request_unparseable"; com pedido mas sem juiz ⇒ undefined', async () => {
    const { judge } = juizFakeSimples();
    const comJuiz = await runner({ llmJudge: judge }).verifyChallenge(
      path.join(tmpRaiz, 'desafio-pedido-ruim'),
    );
    assert.equal(comJuiz.verdict, 'not_run');
    assert.equal(comJuiz.protocolIssue, 'request_unparseable');

    // o check do PEDIDO vem ANTES do check do juiz: sem envelope, é problema de
    // protocolo mesmo sem juiz configurado; com envelope e sem juiz, o
    // protocolIssue fica undefined ("juiz ausente" é o caminho normal).
    const semEnvelope = await runner().verifyChallenge(path.join(tmpRaiz, 'desafio-pedido-ruim'));
    assert.equal(semEnvelope.protocolIssue, 'request_unparseable');

    const comEnvelopeSemJuiz = await runner().verifyChallenge(path.join(tmpRaiz, 'desafio-ciclo-ok'));
    assert.equal(comEnvelopeSemJuiz.verdict, 'not_run');
    assert.equal(comEnvelopeSemJuiz.protocolIssue, undefined);
    assert.equal(comEnvelopeSemJuiz.applyExhausted, false);
  });

  it('2 ciclos esgotados ⇒ not_run + applyExhausted (o veredito nunca vira "approved" por cansaço)', async () => {
    const { judge } = juizFakeSimples();
    const res = await runner({ llmJudge: judge }).verifyChallenge(path.join(tmpRaiz, 'desafio-esgotado'));
    assert.equal(res.verdict, 'not_run');
    assert.equal(res.applyExhausted, true);
    assert.equal(res.protocolIssue, 'apply_exhausted');
  });
});

function juizFakeSimples(): { judge: LlmJudge } {
  return { judge: async () => ({ request_kind: 'challenge_verify' }) };
}

// ─── testStudentAnswer (contrato do runner.sh) ───────────────────────────────

describe('cx/studyRunner: testStudentAnswer (0/1/2/3/66 + cópia sem .solution/.git)', () => {
  async function desafioFixture(nome: string, runnerCorpo: string, meta?: unknown): Promise<string> {
    const dir = path.join(tmpRaiz, `desafio-${nome}`);
    await fsp.mkdir(path.join(dir, '.solution'), { recursive: true });
    await fsp.mkdir(path.join(dir, '.git'), { recursive: true });
    await fsp.mkdir(path.join(dir, 'tests'), { recursive: true });
    await fsp.writeFile(path.join(dir, '.solution', 'reference.mjs'), 'SOLUCAO SECRETA', 'utf8');
    await fsp.writeFile(path.join(dir, 'stub.mjs'), 'codigo do aluno', 'utf8');
    await fsp.writeFile(path.join(dir, 'tests', 'test.mjs'), 'testes', 'utf8');
    await fsp.writeFile(path.join(dir, 'runner.sh'), `#!/usr/bin/env bash\n${runnerCorpo}`, 'utf8');
    await fsp.chmod(path.join(dir, 'runner.sh'), 0o755);
    if (meta !== undefined) {
      await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
    }
    return dir;
  }

  it('exit 0 ⇒ passed, com TESTS_RUN/ESPERADO/VEREDITO lidos e workspace SEM .solution/.git', async () => {
    const dir = await desafioFixture(
      'passou',
      [
        'echo "T=$CHALLENGE_TIMEOUT"',
        'test -d .solution && echo "VIU_SOLUTION" || echo "SEM_SOLUTION"',
        'test -d .git && echo "VIU_GIT" || echo "SEM_GIT"',
        'test -f tests/test.mjs && echo "VIU_TESTS"',
        'echo "TESTS_RUN=2 ESPERADO=2"',
        'echo "VEREDITO=passed"',
        'exit 0',
      ].join('\n'),
      { execution: { timeout_seconds: 7 } },
    );
    const res = await runner().testStudentAnswer(dir);
    assert.equal(res.success, true);
    assert.equal(res.exitCode, 0);
    assert.equal(res.passed, true);
    assert.equal(res.testsRun, 2);
    assert.equal(res.expectedTests, 2);
    assert.equal(res.verdict, 'passed');
    assert.ok(res.output.includes('T=7'), 'CHALLENGE_TIMEOUT vem do meta.json (7s)');
    assert.ok(res.output.includes('SEM_SOLUTION'), '.solution NÃO é copiado');
    assert.ok(res.output.includes('SEM_GIT'), '.git NÃO é copiado');
    assert.ok(res.output.includes('VIU_TESTS'), 'o resto do workspace vai junto');
  });

  it('exits 1/2/3 ⇒ sucesso de EXECUÇÃO com passed:false e veredito próprio; 66/estranho ⇒ infra', async () => {
    const r = runner();
    const casos: Array<[string, number, string, boolean]> = [
      ['falhou', 1, 'failed', true],
      ['contagem', 2, 'count_mismatch', true],
      ['timeout', 3, 'timeout', true],
      ['cd-falhou', 66, 'infra', false],
      ['estranho', 77, 'infra', false],
    ];
    for (const [nome, exit, veredito, success] of casos) {
      const dir = await desafioFixture(nome, `echo "TESTS_RUN=1 ESPERADO=2"; exit ${exit}`);
      const res = await r.testStudentAnswer(dir);
      assert.equal(res.success, success, nome);
      assert.equal(res.exitCode, exit, nome);
      assert.equal(res.passed, false, nome);
      assert.equal(res.verdict, veredito, nome);
      assert.equal(res.testsRun, 1, nome);
      assert.equal(res.expectedTests, 2, nome);
    }
    // `VEREDITO=` explícito no output vence o default derivado do exit code.
    const custom = await desafioFixture('custom', 'echo "VEREDITO=meu-veredito"; exit 1');
    assert.equal((await r.testStudentAnswer(custom)).verdict, 'meu-veredito');
  });

  it('sem runner.sh ⇒ infra "missing_runner" (nunca inventa contagem)', async () => {
    const dir = path.join(tmpRaiz, 'desafio-sem-runner');
    await fsp.mkdir(dir, { recursive: true });
    const res = await runner().testStudentAnswer(dir);
    assert.equal(res.success, false);
    assert.equal(res.exitCode, RUNNER_EXIT_CODES.CD_FAILED);
    assert.equal(res.verdict, 'missing_runner');
    assert.equal(res.testsRun, null);
    assert.equal(res.expectedTests, null);
    assert.ok(res.output.includes('runner.sh não encontrado'));
  });

  it('timeout do runner: meta.json manda (mínimo 5s); meta inválido/ausente ⇒ backstop defaultTimeoutMs', async () => {
    const r = runner({ defaultTimeoutMs: 8_000 });
    // 2s é clampado para o mínimo de 5s.
    const curto = await desafioFixture(
      'meta-curto',
      'echo "T=$CHALLENGE_TIMEOUT"; exit 0',
      { execution: { timeout_seconds: 2 } },
    );
    assert.ok((await r.testStudentAnswer(curto)).output.includes('T=5'));

    // meta inválido ⇒ backstop em segundos (8s).
    const semMeta = await desafioFixture('meta-quebrado', 'echo "T=$CHALLENGE_TIMEOUT"; exit 0');
    await fsp.writeFile(path.join(semMeta, 'meta.json'), '{quebrado', 'utf8');
    assert.ok((await r.testStudentAnswer(semMeta)).output.includes('T=8'));

    // meta com timeout_seconds inválido ⇒ backstop também.
    const invalido = await desafioFixture(
      'meta-invalido',
      'echo "T=$CHALLENGE_TIMEOUT"; exit 0',
      { execution: { timeout_seconds: 'muitos' } },
    );
    assert.ok((await r.testStudentAnswer(invalido)).output.includes('T=8'));
  });

  it('outputLimit corta a saída pelos ÚLTIMOS bytes (o fim é onde está o veredito)', async () => {
    const dir = await desafioFixture('limite', 'echo "XXXXXXXXXX"; echo "VEREDITO=failed"; exit 1');
    const res = await runner().testStudentAnswer(dir, { outputLimit: 40 });
    assert.ok(res.output.length <= 40);
    assert.ok(res.output.includes('VEREDITO=failed'), 'a cauda (veredito) sobrevive ao corte');
    assert.equal(res.verdict, 'failed');
  });
});
