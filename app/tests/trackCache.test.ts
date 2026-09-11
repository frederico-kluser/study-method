/**
 * tests/trackCache.test.ts — caches de TRILHA do processo main (onda2-load).
 *
 * Cobre services/trackCache.ts com trilhas fakes em tmp (sem electron):
 *   1. dedup: chamadas CONCORRENTES ao mesmo dir compartilham a MESMA
 *      promessa, e o disco estável NÃO recarrega (identidade preservada);
 *   2. frescor/invalidação: mudar um arquivo (qualquer *.json) OU chamar a
 *      invalidação explícita força recarga com o conteúdo novo;
 *   3. carga via listagem (loadAllTracksCached) aquece o cache de conteúdo;
 *   4. payload LRU: hit só com a MESMA instância de trilha + MESMA época de
 *      progresso; bump (writer de progresso) zera e a remontagem vê o estado
 *      novo (inutilização da entrada pré-carregada com progresso velho);
 *   5. dedup de builds concorrentes do MESMO payload (promessa única);
 *   6. PRÉ-CARGA: depois de montar a aula N, a aula N+1 (nextLesson) está
 *      montada no cache SEM chamada explícita — e um erro da pré-carga é
 *      SILENCIOSO (não propaga para quem pediu a aula N, não vira
 *      unhandledRejection).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TRACK_SCHEMA_VERSION } from '../electron/main/content/trackTypes';
import {
  TrackProgressLike,
  loadTrackState,
} from '../electron/main/services/trackService';
import {
  __peekTrackLessonCache,
  __resetTrackCachesForTests,
  buildTrackLessonCached,
  bumpProgressEpoch,
  invalidateTrackCache,
  loadAllTracksCached,
  loadTrackCached,
} from '../electron/main/services/trackCache';

let tmpRoot: string;

function tmpTrackDir(): string {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'track-cache-'));
  return path.join(tmpRoot, 'trilha-teste');
}

/** Trilha fake mínima: 1 módulo, `lessonSlugs` aulas SEM desafios. */
async function writeFixtureTrack(
  trackDir: string,
  lessonSlugs: string[],
  overrides: Record<string, { title: string }> = {},
): Promise<void> {
  await fs.mkdir(path.join(trackDir, 'modules', 'mod-1'), { recursive: true });
  await fs.writeFile(
    path.join(trackDir, 'track.json'),
    JSON.stringify({
      schemaVersion: TRACK_SCHEMA_VERSION,
      slug: 'trilha-teste',
      title: 'Trilha Teste',
      description: 'Desc.',
      language: 'pt-BR',
      domain: 'programming',
      modules: ['mod-1'],
    }),
    'utf8',
  );
  await fs.writeFile(
    path.join(trackDir, 'modules', 'mod-1', 'module.json'),
    JSON.stringify({
      schemaVersion: TRACK_SCHEMA_VERSION,
      slug: 'mod-1',
      title: 'Módulo 1',
      order: 1,
      lessons: lessonSlugs,
    }),
    'utf8',
  );
  for (const slug of lessonSlugs) {
    const lessonDir = path.join(trackDir, 'modules', 'mod-1', 'lessons', slug);
    await fs.mkdir(lessonDir, { recursive: true });
    await fs.writeFile(
      path.join(lessonDir, 'lesson.json'),
      JSON.stringify({
        schemaVersion: TRACK_SCHEMA_VERSION,
        slug,
        title: overrides[slug]?.title ?? `Aula ${slug}`,
        summary: 'Resumo.',
        difficulty: 1,
        concepts: ['variaveis'],
        prerequisites: [],
        theory: [{ id: 'intro', title: 'Intro', markdown: 'Teoria simples.' }],
        sources: [],
        challenges: [],
      }),
      'utf8',
    );
  }
}

/**
 * Repo fake: estado mutável exposto no MESMO objeto devolvido (os closures
 * leem do holder, então `repo.progress.push` / `repo.failListGeneratedFor =`
 * são vistos pelas leituras seguintes).
 */
function fakeRepo(over: Partial<TrackProgressLike> = {}): TrackProgressLike & {
  progress: { trackSlug: string; lessonId: string; completedAt: string }[];
  failListGeneratedFor?: string;
} {
  const holder = {
    progress: [] as { trackSlug: string; lessonId: string; completedAt: string }[],
    failListGeneratedFor: undefined as string | undefined,
  };
  const repo: TrackProgressLike = {
    listTrackLessonProgress: async () => [...holder.progress],
    getTrackProficiency: async () => null,
    listGeneratedChallenges: async (_trackSlug, lessonId) => {
      if (holder.failListGeneratedFor === lessonId) throw new Error(`boom em ${lessonId}`);
      return [];
    },
    getAttemptsForChallenge: async () => [],
    ...over,
  };
  return Object.assign(holder, repo);
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('trackCache — cache de CONTEÚDO (trilha carregada)', () => {
  beforeEach(() => {
    __resetTrackCachesForTests();
  });

  it('chamadas CONCORRENTES ao mesmo dir compartilham a MESMA promessa (uma leitura só)', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1', 'aula-2']);

    // frias e simultâneas: o slot nasce registrado no primeiro acesso
    const p1 = loadTrackCached(dir);
    const p2 = loadTrackCached(dir);
    assert.strictEqual(p1, p2, 'dedup de leitura: a segunda chamada fria NÃO relê');

    const track = await p1;
    assert.strictEqual(track.root.slug, 'trilha-teste');
    assert.equal(track.modules.length, 1);
    assert.equal(track.modules[0].lessons.length, 2);
  });

  it('NÃO recarrega quando o disco não mudou — a identidade da instância é preservada', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);

    const p1 = loadTrackCached(dir);
    const t1 = await p1;
    // vários acessos quentes (entre eles um await completo): a MESMA instância
    // validada (se tivesse relido, loadTrack teria criado um objeto novo).
    const t2 = await loadTrackCached(dir);
    assert.strictEqual(t2, t1, 'acesso quente devolve a MESMA instância (nunca relêu)');
    assert.strictEqual(await p1, t1);
  });

  it('mudar um ARQUIVO da trilha força recarga com o conteúdo novo', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);

    const t1 = await loadTrackCached(dir);
    const titleAntes = t1.modules[0].lessons[0].meta.title;

    // o disco muda (conteúdo de lesson.json — título com tamanho diferente
    // para o fingerprint mtime+size divergir com certeza)
    const lessonPath = path.join(dir, 'modules', 'mod-1', 'lessons', 'aula-1', 'lesson.json');
    await fs.writeFile(
      lessonPath,
      (await fs.readFile(lessonPath, 'utf8')).replace(titleAntes, 'Titulo Completamente Diferente'),
      'utf8',
    );

    const t2 = await loadTrackCached(dir);
    assert.notStrictEqual(t2, t1, 'disco mudou → nova instância');
    assert.equal(t2.modules[0].lessons[0].meta.title, 'Titulo Completamente Diferente');
  });

  it('invalidação EXPLÍCITA força recarga mesmo com disco estável', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);

    const t1 = await loadTrackCached(dir);
    invalidateTrackCache(dir);
    const t2 = await loadTrackCached(dir);
    assert.notStrictEqual(t2, t1, 'invalidação explícita → recarga');
  });

  it('recargas concorrentes após staleness compartilham UMA promessa', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);

    await loadTrackCached(dir);
    // disco muda
    const lessonPath = path.join(dir, 'modules', 'mod-1', 'lessons', 'aula-1', 'lesson.json');
    await fs.writeFile(
      lessonPath,
      (await fs.readFile(lessonPath, 'utf8')).replace('Aula aula-1', 'Aula Mudada Em Tamanho'),
      'utf8',
    );

    const [a, b] = await Promise.all([loadTrackCached(dir), loadTrackCached(dir)]);
    assert.strictEqual(a, b, 'as duas chamadas velhas compartilham a MESMA recarga');
    assert.equal(a.modules[0].lessons[0].meta.title, 'Aula Mudada Em Tamanho');
  });

  it('loadAllTracksCached (track:list) AQUECE o cache de conteúdo', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);

    const { tracks, issues } = await loadAllTracksCached(tmpRoot);
    assert.equal(issues.length, 0);
    assert.equal(tracks.length, 1);
    // o clique seguinte na aula NÃO relê — mesma instância da listagem
    const t = await loadTrackCached(dir);
    assert.strictEqual(t, tracks[0], 'a listagem já deixou a trilha pronta no cache');
  });
});

describe('trackCache — cache de PAYLOAD (LRU + época de progresso)', () => {
  beforeEach(() => {
    __resetTrackCachesForTests();
  });

  it('payload é reusado no hit e a remontagem vê progresso novo após bump', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);
    const repo = fakeRepo();
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    const p1 = await buildTrackLessonCached(track, mod, 'aula-1', repo);
    assert.equal(p1?.done, false);

    // WITER de progresso: o aluno conclui a aula → bump (zera payloads)
    // e o repo reflete a conclusão — a remontagem PRECISA ver o estado novo.
    repo.progress.push({ trackSlug: 'trilha-teste', lessonId: 'aula-1', completedAt: '1' });
    bumpProgressEpoch();

    const p2 = await buildTrackLessonCached(track, mod, 'aula-1', repo);
    assert.equal(p2?.done, true, 'após bump, a remontagem lê o progresso novo');
    assert.notStrictEqual(p2, p1, 'e o payload é outro (remontado)');
  });

  it('builds CONCORRENTES do mesmo payload compartilham a MESMA promessa', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);
    // gate: segura o build (estado em voo) para as duas chamadas chegarem juntas
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const repo = fakeRepo({
      listTrackLessonProgress: async () => {
        await gate;
        return [];
      },
    });
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    const p1 = buildTrackLessonCached(track, mod, 'aula-1', repo);
    const p2 = buildTrackLessonCached(track, mod, 'aula-1', repo);
    assert.strictEqual(p1, p2, 'dedup: um build em voo só por chave');
    release();
    const payload = await p1;
    assert.equal(payload?.slug, 'aula-1');
  });

  it('PRÉ-CARGA: montar a aula N deixa a aula N+1 (nextLesson) pronta no cache', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1', 'aula-2']);
    const repo = fakeRepo();
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    const p1 = await buildTrackLessonCached(track, mod, 'aula-1', repo);
    assert.equal(p1?.nextLesson?.slug, 'aula-2');

    // sem NENHUMA chamada explícita para aula-2: a pré-carga é quem monta.
    await tick();
    assert.equal(
      __peekTrackLessonCache(dir, 'aula-2'),
      true,
      'a aula seguinte está montada no cache (pré-carga pós-build)',
    );
    const p2 = await buildTrackLessonCached(track, mod, 'aula-2', repo);
    assert.equal(p2?.slug, 'aula-2', 'e o clique em "Avançar" é cache hit');
    assert.equal(p2?.done, false);
  });

  it('pré-carga NÃO é recursiva (um nível só)', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1', 'aula-2', 'aula-3']);
    const repo = fakeRepo();
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    const p1 = await buildTrackLessonCached(track, mod, 'aula-1', repo);
    assert.equal(p1?.nextLesson?.slug, 'aula-2');
    await tick();
    assert.equal(__peekTrackLessonCache(dir, 'aula-2'), true);
    assert.equal(
      __peekTrackLessonCache(dir, 'aula-3'),
      false,
      'a pré-carga da aula-2 não encadeia para a aula-3',
    );
  });

  it('entrada pré-carregada é INUTILIZADA se o progresso mudou durante a pré-carga', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1', 'aula-2']);
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    // Segura a PRÉ-CARGA da aula-2 em voo: a 1ª leitura de progresso é a do
    // build da aula-1 (passa); a 2ª é a da aula-2 (pré-carga) — fica presa.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let leiturasDeProgresso = 0;
    const gatedRepo = fakeRepo({
      listTrackLessonProgress: async () => {
        leiturasDeProgresso += 1;
        if (leiturasDeProgresso >= 2) await gate;
        return gatedRepo.progress;
      },
    });

    void buildTrackLessonCached(track, mod, 'aula-1', gatedRepo);
    // pré-carga da aula-2 em voo (presa no gate)
    await tick();
    assert.equal(__peekTrackLessonCache(dir, 'aula-2'), false, 'ainda em voo');

    // O aluno conclui a aula-1 DURANTE a pré-carga → bump + progresso novo
    gatedRepo.progress.push({ trackSlug: 'trilha-teste', lessonId: 'aula-1', completedAt: '1' });
    bumpProgressEpoch();
    release();
    await tick();
    await tick();

    assert.equal(
      __peekTrackLessonCache(dir, 'aula-2'),
      false,
      'o resultado da pré-carga velha foi DESCARTADO (época mudou)',
    );
    // a remontagem pós-done (aula-1) pré-carrega a aula-2 JÁ com o estado novo
    const p1 = await buildTrackLessonCached(track, mod, 'aula-1', gatedRepo);
    await tick();
    assert.equal(p1?.done, true, 'a remontagem pós-done vê a conclusão');
    assert.equal(__peekTrackLessonCache(dir, 'aula-2'), true, 'e a aula-2 é pré-carregada de novo, agora com progresso novo');
    const p2 = await buildTrackLessonCached(track, mod, 'aula-2', gatedRepo);
    assert.equal(p2?.done, false);
  });

  it('erro da PRÉ-CARGA é silencioso — não propaga para quem pediu a aula atual', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1', 'aula-2']);
    // a montagem da aula-2 quebra (listGeneratedChallenges lança SÓ nela)
    const repo = fakeRepo();
    repo.failListGeneratedFor = 'aula-2';
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    // a aula ATUAL monta e resolve normalmente — sem exceção propagada
    const p1 = await buildTrackLessonCached(track, mod, 'aula-1', repo);
    assert.equal(p1?.slug, 'aula-1');

    await tick();
    assert.equal(__peekTrackLessonCache(dir, 'aula-2'), false, 'a pré-carga falhou em silêncio');
    // o erro continua sendo um erro REAL no ponto de chamada explícito
    await assert.rejects(buildTrackLessonCached(track, mod, 'aula-2', repo), /boom em aula-2/);
    // se a pré-carga tivesse vazado como unhandledRejection, o processo do
    // teste já teria caído — chegar aqui é a prova do silêncio.
  });

  it('payload com a aula do FIM da trilha não dispara pré-carga (sem nextLesson)', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1', 'aula-2']);
    const repo = fakeRepo();
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    const p2 = await buildTrackLessonCached(track, mod, 'aula-2', repo);
    assert.equal(p2?.nextLesson, null);
    await tick();
    assert.equal(__peekTrackLessonCache(dir, 'aula-2'), true, 'a própria aula fica cacheada');
  });

  it('hit não depende do repo: a aula continua cacheada após stable disk + mesmo progresso', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1']);
    const repo = fakeRepo();
    const track = await loadTrackCached(dir);
    const mod = track.modules[0].meta.slug;

    const p1 = await buildTrackLessonCached(track, mod, 'aula-1', repo);
    const p2 = await buildTrackLessonCached(track, mod, 'aula-1', repo);
    assert.strictEqual(p2, p1, 'segundo pedido = hit (mesma promessa/payload)');
  });
});

describe('trackCache — interação com loadTrackState (repo)', () => {
  beforeEach(() => {
    __resetTrackCachesForTests();
  });

  it('loadTrackState continua funcionando normalmente (sem cache) após os tests acima', async () => {
    const dir = tmpTrackDir();
    await writeFixtureTrack(dir, ['aula-1', 'aula-2']);
    const repo = fakeRepo();
    repo.progress.push({ trackSlug: 'trilha-teste', lessonId: 'aula-1', completedAt: '1' });
    const { doneSet, proficient } = await loadTrackState('trilha-teste', repo);
    assert.equal(doneSet.has('aula-1'), true);
    assert.equal(doneSet.has('aula-2'), false);
    assert.equal(proficient, false);
  });
});