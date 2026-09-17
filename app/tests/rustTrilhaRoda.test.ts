/**
 * tests/rustTrilhaRoda.test.ts — A TRILHA RUST RODA PARA O ALUNO.
 *
 * Espelho FIEL de `pythonTrilhaRoda.test.ts` para a trilha `rust-iniciante`:
 * o mesmo defeito que a suíte Python tranca tem aqui um caminho próprio — o
 * adaptador Rust spawna o `cargo`, e um desafio de Rust entregue ao binário
 * errado (node, python3) reprovaria a SOLUÇÃO DE REFERÊNCIA da própria trilha.
 *
 * POR QUE PELO HANDLER, E NÃO POR `runStudentCode`: o bug do irmão Python
 * ESTAVA no chamador. `ipc/track-handlers.ts` chamava `runStudentCode({...})`
 * sem exec e sem adaptador — um teste que chamasse o runner direto passaria
 * verde com o produto quebrado. Por isso aqui se monta
 * `buildTrackHandlers()` e se invoca o handler REAL de
 * `TRACK_CHANNELS.CHALLENGE_SUBMIT` — o mesmo Map que `registerTrackHandlers`
 * entrega ao `ipcMain`.
 *
 * POR QUE CONTRA A TRILHA REAL DO DISCO (`resources/tracks/rust-iniciante`), e
 * não contra uma fixture: uma fixture de Rust escrita pelo teste provaria que
 * o runner sabe rodar Rust, não que O PRODUTO roda A TRILHA QUE EXISTE. O
 * `solutionCode` submetido é lido do `challenge.json` de verdade — se a trilha
 * mudar, o teste continua submetendo a solução correta dela.
 *
 * DEPENDÊNCIA DECLARADA (fail-closed): precisa de `cargo` no PATH (o adaptador
 * Rust spawna `cargo test --offline`). Sem cargo o teste FALHA — de propósito:
 * pular seria exatamente o fail-open que esta onda veio fechar. (O ambiente do
 * gate pin CARGO_HOME/RUSTUP_HOME e o `--offline` dispensa rede: a crate do
 * desafio tem `[dependencies]` vazio, std-only.)
 *
 * ESTE TESTE FICA VERDE SÓ NA INTEGRAÇÃO: o `track.json` da trilha declara os
 * dois módulos da onda (`a-tela` + `decisao`) e o loader é fail-closed — com
 * `decisao` ausente no disco, CARREGAR a trilha falha e este teste é VERMELHO
 * antes de qualquer execução. É esperado no worktree do autor do `a-tela`; o
 * gate autoritativo é o snapshot do orquestrador com os 2 módulos presentes.
 * NÃO pular, NÃO enfraquecer.
 *
 * O que este arquivo NÃO faz: não cobre a UI (o gate de aula vive em
 * `src/lib/trackLessonState.ts`), não cobre a geração de desafio por LLM e não
 * substitui `tests/track-handlers.test.ts` — a não-regressão do caminho
 * JavaScript é a suíte inteira, que roda o mesmo handler com
 * `language: 'nodejs'`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import type { TrackSubmitResult } from '../shared/ipc-contract';
import { TRACK_CHANNELS } from '../shared/ipc-contract';
import { buildTrackHandlers, type TrackRepoLike } from '../electron/main/ipc/track-handlers';
import type { IpcHandlerFn } from '../electron/main/ipc/safeHandle';
import { challengePairFromSource } from '../electron/main/services/challengeExec';
import type { TrackChallengeSource } from '../electron/main/content/trackTypes';

const APP_DIR = path.resolve(__dirname, '..');
const TRACKS_DIR = path.join(APP_DIR, 'resources', 'tracks');

/** A aula 1 da trilha real: `pub fn dobro(x: i32) -> i32 { x * 2 }`. */
const TRILHA = 'rust-iniciante';
const MODULO = 'a-tela';
const AULA = 'a-primeira-funcao';
const DESAFIO = 'dobre-o-numero';

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

/**
 * A DEPENDÊNCIA DECLARADA, à prova no início de cada execução: sem `cargo` no
 * PATH o teste FALHA com a mensagem que diz o que falta — nunca um skip.
 */
function exigirCargo(): void {
  const probe = spawnSync('cargo', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    assert.fail(
      'cargo não disponível no PATH — o adaptador Rust spawna `cargo test --offline`, ' +
        'e esta suíte é fail-closed: sem toolchain o teste FALHA (nunca pula). ' +
        'Instale o toolchain pinado da trilha (runtime cargo-1.98) e rode de novo. ' +
        `detalhe: ${probe.error ? String(probe.error) : `exit ${probe.status}`}`,
    );
  }
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

describe('a trilha rust roda para o aluno (caminho de PRODUÇÃO)', () => {
  it('challengePairFromSource COPIA challenge.language (a raiz do defeito do irmão Python)', async () => {
    const desafio = await lerDesafioReal();
    assert.equal(desafio.language, 'rust', 'a trilha real declara language rust');
    const par = challengePairFromSource(desafio);
    assert.equal(
      par.language,
      'rust',
      'o par perdeu a linguagem — todo consumidor abaixo cairia no adaptador errado',
    );
  });

  it('track:challenge-submit com a solução de referência da aula 1 → passed:true', async () => {
    exigirCargo();
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
    exigirCargo();
    // Sem este caso o teste acima seria satisfeito por um runner que aprova
    // tudo. O starter é `todo!()`: compila e PANICA em runtime — o teste tem
    // de falhar, e o veredito tem de dizer que falhou.
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

  it('a saída da submissão é do cargo/libtest, nunca do node (a evidência do bug antigo)', async () => {
    exigirCargo();
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
      /Unexpected token 'import'|bad option|SyntaxError/,
      'saída de runner errado: o desafio Rust foi entregue a um binário que não é o cargo',
    );
    assert.match(
      r.output,
      /running \d+ tests|test result:/,
      `saída não é do libtest do cargo:\n${r.output}`,
    );
  });
});
