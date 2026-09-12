/**
 * tests/e2eTrackProgress.test.ts — O PROGRESSO DO HARNESS E2E PERSISTE
 * (onda11-cadeado).
 *
 * ─── O DEFEITO QUE ESTE ARQUIVO TRAVA ────────────────────────────────────
 * `buildE2ETrackRepo()` (electron/main/services/e2eStubs.ts) criava
 * `done`/`attempts`/`prof` LOCAIS e CADA handler o chamava de novo. O Set em
 * que `markTrackLessonDone` escrevia era descartado no mesmo tick: em modo E2E
 * o progresso NUNCA persistia, `computeUnlockStates` sempre lia doneSet vazio
 * e o cadeado da aula 2 NUNCA poderia abrir. Nenhuma spec Playwright podia
 * observar "concluí a aula 1 → a aula 2 destrava" — que é exatamente o bug que
 * o dono relatou; o e2e-lesson.spec.ts chegou a DOCUMENTAR essa cegueira como
 * "limitação do harness".
 *
 * Este teste é a rede que faltava, e roda SEM build e SEM Electron: chama os
 * handlers do stub direto, na ordem em que a tela os chama.
 *
 * ─── POR QUE ELE NÃO É REDUNDANTE COM A SPEC PLAYWRIGHT ──────────────────
 * A spec e2e prova o fluxo do ALUNO (a tela); esta prova o CONTRATO do stub em
 * milissegundos — se alguém reintroduzir estado por chamada, a falha aparece
 * no `npm test`, sem precisar de build + Playwright para descobrir.
 *
 * O flag STUDY_METHOD_E2E é lido no LOAD do módulo, e o store de progresso é de
 * MÓDULO: cada cenário usa um import cache-busted (query string) para nascer
 * com o store vazio — a mesma disciplina de tests/e2eStubs.test.ts.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { STUDY_CHANNELS, TRACK_CHANNELS } from '../shared/ipc-contract';
import type { IpcHandlerFn } from '../electron/main/ipc/safeHandle';
import type * as E2EStubs from '../electron/main/services/e2eStubs';

let savedWorkspace: string | undefined;
let savedE2E: string | undefined;
let tmpRoot = '';

before(async () => {
  savedWorkspace = process.env.E2E_WORKSPACE_ROOT;
  savedE2E = process.env.STUDY_METHOD_E2E;
  // registerE2EStubs é NO-OP fora do modo E2E (guarda de segurança do módulo).
  process.env.STUDY_METHOD_E2E = '1';
  // Workspace PRÓPRIO: o harness (writeFixtureTrack) nunca toca o compartilhado.
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'e2e-track-progress-'));
  process.env.E2E_WORKSPACE_ROOT = tmpRoot;
});

after(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
  if (savedWorkspace === undefined) delete process.env.E2E_WORKSPACE_ROOT;
  else process.env.E2E_WORKSPACE_ROOT = savedWorkspace;
  if (savedE2E === undefined) delete process.env.STUDY_METHOD_E2E;
  else process.env.STUDY_METHOD_E2E = savedE2E;
});

let loadSeq = 0;
/** Instância fresca do e2eStubs (store de módulo vazio). */
async function loadE2EStubs(): Promise<typeof E2EStubs> {
  loadSeq += 1;
  const url = `../electron/main/services/e2eStubs.ts?track-progress-${loadSeq}`;
  return (await import(url)) as typeof E2EStubs;
}

interface DetailLesson {
  slug: string;
  locked: boolean;
  done: boolean;
  current: boolean;
}
interface DetailModule {
  slug: string;
  lessons: DetailLesson[];
  challengeLastVerdict: string | null;
}

async function trackDetail(map: Map<string, IpcHandlerFn>, trackSlug: string): Promise<DetailModule[]> {
  const res = (await map.get(TRACK_CHANNELS.GET)!(undefined, { trackSlug })) as {
    ok: true;
    track: { modules: DetailModule[] } | null;
  };
  assert.equal(res.ok, true);
  assert.ok(res.track, 'esperava o detalhe da trilha fixture');
  return res.track.modules;
}

describe('e2eStubs: o progresso do harness sobrevive entre chamadas de canal', () => {
  it('track:lesson-done marca a aula 1 e o track:get SEGUINTE mostra a aula 2 DESTRAVADA', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers() as unknown as Map<string, IpcHandlerFn>;

    // Estado inicial: a aula 2 (prerequisites: ['aula-1']) nasce com CADEADO.
    const antes = await trackDetail(map, 'nodejs-do-zero');
    assert.equal(antes[0].lessons[0].slug, 'aula-1');
    assert.equal(antes[0].lessons[0].locked, false, 'a primeira aula nunca é travada');
    assert.equal(antes[0].lessons[1].slug, 'aula-2');
    assert.equal(antes[0].lessons[1].locked, true, 'a aula 2 começa TRAVADA');

    // O aluno conclui a aula 1 (o mesmo canal que a LessonView chama).
    const done = (await map.get(TRACK_CHANNELS.LESSON_DONE)!(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
    })) as { ok: boolean };
    assert.equal(done.ok, true);

    // A LEITURA SEGUINTE precisa VER isso. Era aqui que o harness mentia.
    const depois = await trackDetail(map, 'nodejs-do-zero');
    assert.equal(depois[0].lessons[0].done, true, 'a aula 1 ficou concluída');
    assert.equal(depois[0].lessons[1].locked, false, 'O CADEADO DA AULA 2 ABRIU');
    assert.equal(depois[0].lessons[1].current, true, 'a aula 2 virou a aula atual');
  });

  it('o payload da AULA concluída aponta a próxima (nextLesson) — o botão "Avançar" tem para onde ir', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers() as unknown as Map<string, IpcHandlerFn>;
    await map.get(TRACK_CHANNELS.LESSON_DONE)!(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
    });
    const res = (await map.get(TRACK_CHANNELS.LESSON)!(undefined, {
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
    })) as { ok: true; lesson: { done: boolean; nextLesson: { slug: string } | null } | null };
    assert.equal(res.lesson?.done, true);
    assert.equal(res.lesson?.nextLesson?.slug, 'aula-2');
  });

  it('o progresso é POR TRILHA — concluir em nodejs-do-zero não mexe numa trilha vizinha', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers() as unknown as Map<string, IpcHandlerFn>;
    await map.get(TRACK_CHANNELS.LESSON_DONE)!(undefined, {
      trackSlug: 'outra-trilha',
      lessonId: 'aula-1',
    });
    // A conclusão foi registrada em OUTRA trilha: a fixture segue intocada.
    const detalhe = await trackDetail(map, 'nodejs-do-zero');
    assert.equal(detalhe[0].lessons[0].done, false, 'progresso de outra trilha não vaza para esta');
    assert.equal(detalhe[0].lessons[1].locked, true, 'e o cadeado da aula 2 continua fechado');
  });

  it('study:mark-challenge-attempt persiste o veredito que o track:get lê de volta', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers() as unknown as Map<string, IpcHandlerFn>;
    const ipc = new Map<string, IpcHandlerFn>();
    const registrou = mod.registerE2EStubs({
      removeHandler(): void {
        /* fake sem handlers prévios */
      },
      handle(channel: string, fn: unknown): void {
        ipc.set(channel, fn as IpcHandlerFn);
      },
    });
    assert.equal(registrou, true, 'registerE2EStubs precisa do STUDY_METHOD_E2E=1 (ver o runner)');

    // Antes: o desafio do módulo nunca foi tentado.
    assert.equal((await trackDetail(map, 'nodejs-do-zero'))[0].challengeLastVerdict, null);

    // O RENDERER de produção (TrackChallengePanel.markAttempt) chama isto.
    const marcou = (await ipc.get(STUDY_CHANNELS.MARK_CHALLENGE_ATTEMPT)!(undefined, {
      subjectSlug: 'nodejs-do-zero',
      challengeId: 'desafio-do-modulo',
      verdict: 'passed',
      stars: 3,
      durationMs: 1234,
    })) as { ok: boolean };
    assert.equal(marcou.ok, true, 'sem repo o canal respondia ok:false e o veredito evaporava');

    // E a trilha passa a mostrar o desafio como concluído.
    assert.equal((await trackDetail(map, 'nodejs-do-zero'))[0].challengeLastVerdict, 'passed');
  });

  /**
   * O FLAKE PRÉ-EXISTENTE, TRAVADO AQUI (onda 2 — seção crítica da fixture).
   *
   * ─── O DEFEITO MEDIDO ────────────────────────────────────────────────────
   * `writeFixtureTrack` escreve a fixture inteira com `fsp.writeFile` (que
   * TRUNCA antes de gravar) a CADA handler, e o harness disparava uma escrita
   * extra NÃO aguardada na montagem do Map. Duas escritas concorrentes se
   * intercalavam e o leitor que caísse no meio lia JSON vazio:
   * `TrackLoadError` — "declarado ... mas arquivo ausente/ilegível".
   * Medido no arquivo VIZINHO (10 execuções de cada, sempre o mesmo ponto):
   * tests/e2eStubs.test.ts falhou 1×/10 e este arquivo falhou 1×/10; os dois
   * passam ISOLADOS — é corrida, não defeito de fixture.
   *
   * ─── POR QUE ESTE TESTE CHAMA OS HANDLERS **CONCORRENTEMENTE** ───────────
   * Os outros testes deste arquivo chamam um handler por vez e por isso NÃO
   * enxergavam a corrida dominante: é a Trilha do app que dispara `track:list`,
   * `track:get` e `track:lesson` JUNTOS na montagem. Uma correção que serialize
   * só as ESCRITAS passa nos testes sequenciais e continua quebrada aqui (o
   * handler A lê enquanto a escrita do handler B trunca os mesmos arquivos):
   * medido, 36 rejeições em 40 rodadas desse lote concorrente. É este teste que
   * exige a SEÇÃO CRÍTICA (escrita + leitura no mesmo elo da fila).
   *
   * MUTAÇÃO (registrada no handoff): trocando `withFixtureTrack` por
   * "serializa a escrita e lê FORA da fila", este teste falha — é ele que
   * morde. Com a seção crítica, passa.
   */
  it('handlers CONCORRENTES (como a Trilha chama): nenhuma leitura pega a fixture no meio de uma escrita', async () => {
    const mod = await loadE2EStubs();
    const map = mod.buildTrackStubHandlers() as unknown as Map<string, IpcHandlerFn>;

    const nomes: string[] = [];
    const chamadas: Promise<unknown>[] = [];
    // `IpcHandlerFn` devolve `unknown` (o handler pode ser sincrono): o
    // `Promise.resolve` normaliza para a lista de promessas do lote.
    const push = (nome: string, p: unknown): void => {
      nomes.push(nome);
      chamadas.push(Promise.resolve(p));
    };
    // 20 rodadas do lote que a Trilha provoca (os 5 canais de LEITURA da
    // fixture + o tutor; o CHALLENGE_SUBMIT fica fora porque roda `node --test`
    // de verdade e o alvo aqui é a corrida de I/O, não a execução).
    for (let i = 0; i < 20; i++) {
      push('track:get', map.get(TRACK_CHANNELS.GET)!(undefined, { trackSlug: 'nodejs-do-zero' }));
      push(
        'track:lesson',
        map.get(TRACK_CHANNELS.LESSON)!(undefined, { trackSlug: 'nodejs-do-zero', lessonId: 'aula-1' }),
      );
      push('track:list', map.get(TRACK_CHANNELS.LIST)!());
      push(
        'track:challenge',
        map.get(TRACK_CHANNELS.CHALLENGE_GET)!(undefined, {
          trackSlug: 'nodejs-do-zero',
          target: 'lesson',
          lessonId: 'aula-1',
          challengeId: 'dobro-do-numero',
        }),
      );
      push(
        'track:proficiency',
        map.get(TRACK_CHANNELS.PROFICIENCY_GET)!(undefined, {
          trackSlug: 'nodejs-do-zero',
          challengeId: 'proficiencia',
        }),
      );
      push(
        'track:tutor-chat',
        map.get(TRACK_CHANNELS.TUTOR_CHAT)!(undefined, {
          trackSlug: 'nodejs-do-zero',
          lessonId: 'aula-1',
          action: 'next',
          presentedSections: [],
          history: [],
        }),
      );
    }

    const resultados = await Promise.allSettled(chamadas);
    const rejeitadas = resultados
      .map((r, i) => (r.status === 'rejected' ? `${nomes[i]}: ${String(r.reason).split('\n')[0]}` : null))
      .filter((x): x is string => x !== null);
    assert.deepEqual(rejeitadas, [], 'leitura no meio de uma escrita da fixture');

    // `track:list` é o caso que FALHA EM SILÊNCIO: o `loadAllTracks` engole o
    // TrackLoadError da trilha ilegível e devolve a lista VAZIA — sem esta
    // linha, um LIST que perde a corrida passaria despercebido (medido: 1 em 60
    // rodadas alternando DUAS instâncias do módulo, cada uma com a sua fila).
    const listasVazias = resultados.filter(
      (r, i) =>
        nomes[i] === 'track:list' &&
        r.status === 'fulfilled' &&
        (r.value as { tracks: unknown[] }).tracks.length === 0,
    );
    assert.equal(listasVazias.length, 0, 'track:list devolveu ZERO trilhas (fixture lida no meio de uma escrita)');
  });
});
