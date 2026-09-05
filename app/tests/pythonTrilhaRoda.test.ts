/**
 * tests/pythonTrilhaRoda.test.ts — A TRILHA PYTHON RODA PARA O ALUNO.
 *
 * O QUE ESTE ARQUIVO PROVA, e por que ele existe no caminho de PRODUÇÃO em vez
 * de chamar o runner direto.
 *
 * O defeito que ele tranca: `challengePairFromSource` não copiava
 * `challenge.language`, e `runStudentCode`/`verifyChallengePair` defaultavam
 * para o adaptador `javascript`. O aluno digitava `print("oi")` — a SOLUÇÃO DE
 * REFERÊNCIA da própria trilha — e recebia `passed:false`, `checks:[]` e
 * `SyntaxError: Unexpected token 'import'` (o Node tentando executar Python).
 * Como `isLessonFinishBlocked` exige desafio passado e `computeUnlockStates`
 * exige a aula anterior concluída, NENHUMA das 20 aulas podia ser terminada.
 *
 * POR QUE PELO HANDLER, E NÃO POR `runStudentCode`: o bug ESTAVA no chamador.
 * `ipc/track-handlers.ts` chamava `runStudentCode({...})` sem exec e sem
 * adaptador; um teste que chamasse `runStudentCode(input, exec, pythonAdapter)`
 * passaria verde com o produto quebrado. Por isso aqui se monta
 * `buildTrackHandlers()` e se invoca o handler REAL de
 * `TRACK_CHANNELS.CHALLENGE_SUBMIT` — o mesmo Map que `registerTrackHandlers`
 * entrega ao `ipcMain`.
 *
 * POR QUE CONTRA A TRILHA REAL DO DISCO (`resources/tracks/python`), e não
 * contra uma fixture: uma fixture de Python escrita pelo teste provaria que o
 * runner sabe rodar Python, não que O PRODUTO roda A TRILHA QUE EXISTE. O
 * `solutionCode` submetido é lido do `challenge.json` de verdade — se a trilha
 * mudar, o teste continua submetendo a solução correta dela.
 *
 * DEPENDÊNCIA DECLARADA: precisa de `python3` no PATH (o adaptador Python
 * spawna o interpretador). Sem ele o teste FALHA — de propósito: pular seria
 * exatamente o fail-open que esta onda veio fechar.
 *
 * O que este arquivo NÃO faz: não cobre a UI (o gate de aula vive em
 * `src/lib/trackLessonState.ts`, puro, e tem suíte própria), não cobre a
 * geração de desafio por LLM e não substitui `tests/track-handlers.test.ts` —
 * a não-regressão do caminho JavaScript é a suíte inteira, que roda o mesmo
 * handler com `language: 'nodejs'`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import type { TrackSubmitResult } from '../shared/ipc-contract';
import { TRACK_CHANNELS } from '../shared/ipc-contract';
import { buildTrackHandlers, type TrackRepoLike } from '../electron/main/ipc/track-handlers';
import type { IpcHandlerFn } from '../electron/main/ipc/safeHandle';
import { challengePairFromSource } from '../electron/main/services/challengeExec';
import type { TrackChallengeSource } from '../electron/main/content/trackTypes';

const APP_DIR = path.resolve(__dirname, '..');
const TRACKS_DIR = path.join(APP_DIR, 'resources', 'tracks');

/** A aula 1 da trilha real: `print("oi")` e nada mais. */
const TRILHA = 'python';
const MODULO = 'a-tela';
const AULA = 'a-primeira-linha';
const DESAFIO = 'escreva-oi';

const CAMINHO_DESAFIO = path.join(
  TRACKS_DIR,
  TRILHA,
  'modules',
  MODULO,
  'lessons',
  AULA,
  'challenges',
  DESAFIO,
  'challenge.json',
);

async function lerDesafioReal(): Promise<TrackChallengeSource> {
  return JSON.parse(await fs.readFile(CAMINHO_DESAFIO, 'utf8')) as TrackChallengeSource;
}

/** Chama um handler com (null, payload) — `invoke` real é (event, ...args). */
function call<T>(map: Map<string, IpcHandlerFn>, channel: string, payload?: unknown): Promise<T> {
  return map.get(channel)!(null, payload) as Promise<T>;
}

/** Repo mínimo: o submit só precisa de `listGeneratedChallenges` (desafio do banco). */
function fakeRepo(): TrackRepoLike {
  return {
    listTrackLessonProgress: async () => [],
    getTrackProficiency: async () => null,
    listGeneratedChallenges: async () => [],
    getAttemptsForChallenge: async () => [],
    markTrackLessonDone: async () => {},
    setTrackProficiency: async () => {},
    insertGeneratedChallenge: async () => {},
    listFailedChallengeSlugs: async () => [],
  };
}

function handlersDaTrilhaReal(): Map<string, IpcHandlerFn> {
  return buildTrackHandlers({ getTracksDir: () => TRACKS_DIR, repo: fakeRepo() });
}

describe('a trilha python roda para o aluno (caminho de PRODUÇÃO)', () => {
  it('challengePairFromSource COPIA challenge.language (a raiz do defeito)', async () => {
    const desafio = await lerDesafioReal();
    assert.equal(desafio.language, 'python', 'a trilha real declara language python');
    const par = challengePairFromSource(desafio);
    assert.equal(
      par.language,
      'python',
      'o par perdeu a linguagem — todo consumidor abaixo cairia no adaptador javascript',
    );
  });

  it('track:challenge-submit com a solução de referência da aula 1 → passed:true', async () => {
    const desafio = await lerDesafioReal();
    const map = handlersDaTrilhaReal();
    const r = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      challengeId: DESAFIO,
      code: desafio.solutionCode,
    });
    assert.equal(r.ok, true, `handler devolveu erro: ${JSON.stringify(r.error)}`);
    assert.equal(
      r.passed,
      true,
      `o aluno digitou a SOLUÇÃO DE REFERÊNCIA e reprovou. saída:\n${r.output}`,
    );
    assert.equal(r.testsRun, desafio.expectedTestCount);
    assert.equal(r.expectedTests, desafio.expectedTestCount);
    assert.equal(r.totalCount, desafio.expectedTestCount, 'a UI precisa dos checks individuais');
    assert.equal(r.passedCount, desafio.expectedTestCount);
    assert.ok(r.checks.length > 0, 'checks vazios = a execução nem chegou aos testes');
    assert.ok(
      r.checks.every((c) => c.passed),
      `check reprovado: ${JSON.stringify(r.checks)}`,
    );
  });

  it('track:challenge-submit com o starter da aula 1 → passed:false (o veredito discrimina)', async () => {
    // Sem este caso o teste acima seria satisfeito por um runner que aprova
    // tudo. O starter é um comentário: não imprime nada, o teste tem de falhar.
    const desafio = await lerDesafioReal();
    const map = handlersDaTrilhaReal();
    const r = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      challengeId: DESAFIO,
      code: desafio.starterCode ?? '',
    });
    assert.equal(r.ok, true);
    assert.equal(r.passed, false, `o starter PASSOU — o desafio não cobra nada. saída:\n${r.output}`);
  });

  it('a saída da submissão é de Python, nunca do node (a evidência do bug antigo)', async () => {
    const desafio = await lerDesafioReal();
    const map = handlersDaTrilhaReal();
    const r = await call<TrackSubmitResult>(map, TRACK_CHANNELS.CHALLENGE_SUBMIT, {
      trackSlug: TRILHA,
      lessonId: AULA,
      challengeId: DESAFIO,
      code: desafio.solutionCode,
    });
    assert.doesNotMatch(
      r.output,
      /Unexpected token 'import'|bad option/,
      'saída de runner errado: o desafio Python foi entregue ao binário do node',
    );
    assert.match(r.output, /Ran 1 test|OK/, `saída não é do unittest:\n${r.output}`);
  });
});

// ─── track:validate FALHA FECHADA (docs/16-engine-de-trilha.md §9.3) ─────────
//
// O CLI resolve TRACKS_DIR fixo em app/resources/tracks (path.resolve do
// __dirname) — não há env var de override. Mesmo padrão de tests/trackCli.
// test.ts: a fixture nasce em tmp, é COPIADA para TRACKS_DIR sob um slug único
// só durante a execução, e o finally remove as duas cópias.

/** Roda `npx tsx tools/track-cli.ts <args...>` com cwd = app (subprocesso REAL). */
function runCli(args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // NODE_TEST_CONTEXT é setado pelo node:test do processo PAI; herdado pelo
    // filho, faria o node:test DO CLI pular os testes.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn('npx', ['--no-install', 'tsx', 'tools/track-cli.ts', ...args], {
      cwd: APP_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += String(d)));
    child.stderr.on('data', (d: Buffer) => (stderr += String(d)));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function writeJson(dir: string, file: string, data: unknown): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/**
 * Trilha fixture de UMA aula com UM desafio. `quebrado` decide se a solução de
 * referência passa nos testes — o loader NÃO roda teste nenhum, então as duas
 * variantes carregam igual e a diferença aparece só nas provas de execução.
 */
async function escreverFixturePython(dir: string, slug: string, quebrado: boolean): Promise<void> {
  await writeJson(dir, 'track.json', {
    schemaVersion: 1,
    slug,
    title: 'Fixture Python',
    description: 'Trilha temporária do smoke do track:validate.',
    language: 'pt-BR',
    domain: 'programming',
    programmingLanguage: 'python',
    runtime: 'cpython-3.14',
    modules: ['mod-1'],
  });
  await writeJson(path.join(dir, 'modules', 'mod-1'), 'module.json', {
    schemaVersion: 1,
    slug: 'mod-1',
    title: 'Módulo 1',
    order: 1,
    lessons: ['aula-1'],
  });
  await writeJson(path.join(dir, 'modules', 'mod-1', 'lessons', 'aula-1'), 'lesson.json', {
    schemaVersion: 1,
    slug: 'aula-1',
    title: 'Aula 1',
    summary: 'Resumo.',
    difficulty: 1,
    concepts: ['imprimir'],
    prerequisites: [],
    theory: [{ id: 's1', title: 'Seção 1', markdown: 'Texto da seção.' }],
    sources: [],
    challenges: ['desafio-1'],
  });
  await writeJson(
    path.join(dir, 'modules', 'mod-1', 'lessons', 'aula-1', 'challenges', 'desafio-1'),
    'challenge.json',
    {
      schemaVersion: 1,
      slug: 'desafio-1',
      title: 'Escreva oi',
      concept: 'imprimir',
      difficulty: 1,
      language: 'python',
      statement: '# Escreva oi\n\nImprima oi.',
      starterCode: '# escreva aqui\n',
      // O `quebrado` imprime a coisa ERRADA: a solução de referência reprova.
      solutionCode: quebrado ? 'print("tchau")\n' : 'print("oi")\n',
      testsCode:
        'import contextlib\nimport io\nimport runpy\nimport unittest\n\n\n' +
        'def rodar():\n    saida = io.StringIO()\n    with contextlib.redirect_stdout(saida):\n' +
        '        runpy.run_path("solucao.py")\n    return saida.getvalue()\n\n\n' +
        'class TestOi(unittest.TestCase):\n    def test_imprime_oi(self):\n' +
        '        """imprime oi"""\n        self.assertEqual(rodar(), "oi\\n")\n',
      expectedTestCount: 1,
    },
  );
}

/** Cria a fixture em tmp, copia para TRACKS_DIR, roda `track:validate`, limpa. */
async function validarFixture(quebrado: boolean): Promise<{ code: number; stdout: string; stderr: string }> {
  const slug = `cli-py-${quebrado ? 'ruim' : 'bom'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'track-cli-py-'));
  const target = path.join(TRACKS_DIR, slug);
  try {
    await escreverFixturePython(tmp, slug, quebrado);
    await fs.cp(tmp, target, { recursive: true });
    return await runCli(['track:validate', slug], 120_000);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
  }
}

describe('track:validate — falha FECHADA e roda Python', () => {
  it('trilha python válida → "verificado ✓" e exit 0', async () => {
    const r = await validarFixture(false);
    assert.equal(r.code, 0, `exit 0 esperado — stdout:\n${r.stdout}\n--- stderr:\n${r.stderr}`);
    assert.ok(
      r.stdout.includes('[mod-1/aula-1] desafio-1: verificado ✓'),
      `desafio python não verificado — stdout:\n${r.stdout}`,
    );
  });

  it('desafio que NÃO VERIFICA → exit != 0 (o gate parava de sair verde só depois desta onda)', async () => {
    const r = await validarFixture(true);
    assert.ok(
      r.stdout.includes('[mod-1/aula-1] desafio-1: NÃO VERIFICADO ✗'),
      `o relatório deveria acusar o desafio — stdout:\n${r.stdout}`,
    );
    assert.notEqual(
      r.code,
      0,
      `FAIL-OPEN: 'NÃO VERIFICADO ✗' impresso e exit 0 — é o veredito falso que docs/16 §9.3 proíbe.\nstdout:\n${r.stdout}`,
    );
  });
});
