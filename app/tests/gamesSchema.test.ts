/**
 * tests/gamesSchema.test.ts — schemas zod do conteúdo de games + o loader de
 * mundos (`engine/games/schema.ts` + `engine/games/worlds.ts`).
 *
 * O que prova:
 *   1. o contrato de nível/world valida e materializa defaults (boss/hidden);
 *   2. conteúdo fora do contrato é REJEITADO (mode é literal 'io', langs sem
 *      nenhuma linguagem é rejeitado, casos vazios idem);
 *   3. o loader tolera layouts de pasta distintos (l1.json, levels/l2.json,
 *      l1/level.json), ordena pela ordem canónica de world.levels e NÃO mente
 *      na listagem (nível/mundo quebrado é saltado, nunca prometido);
 *   4. julgamento é FAIL-CLOSED: loadGameLevel/loadGameLevelPayload lançam
 *      GameContentError para nível/linguagem ausente;
 *   5. o payload do aluno é sem SPOILERS (sem casos hidden no conteúdo, sem
 *      reference) e conta visíveis/hidden direitinho;
 *   6. a listagem injeta o progresso (completed/bestLines/bestTimeMs).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  GameContentError,
  parseGameLevel,
  parseGameWorld,
} from '../electron/main/engine/games/schema';
import { emptyGameProgress } from '../electron/main/engine/games/progress';
import {
  findWorldDir,
  listGameWorlds,
  loadGameLevel,
  loadGameLevelPayload,
  resolveGamesDir,
} from '../electron/main/engine/games/worlds';

// ---------------------------------------------------------------------------
// Fixtures — um nível io válido reutilizado pelos testes
// ---------------------------------------------------------------------------

function nivelValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'l1',
    title: 'Soma simples',
    enunciado: 'Leia dois números e escreva a soma.',
    introduces: ['entrada-saida'],
    contract: {
      mode: 'io',
      cases: [
        { name: 'caso-1', input: '1 2\n', expectedOutput: '3\n' },
        { name: 'caso-oculto', input: '2 2\n', expectedOutput: '4\n', hidden: true },
      ],
    },
    langs: {
      python: {
        starter: '# escreva a soma\n',
        reference: 'print(sum(map(int, input().split())))\n',
      },
      c: {
        starter: '/* escreva a soma */\n',
        reference: '#include <stdio.h>\nint main(void){long a,b;scanf("%ld %ld",&a,&b);printf("%ld\\n",a+b);}\n',
      },
    },
    optimize: { lines: { par: 3 }, timeMs: { parMs: 120 } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1.2 — schema: aceita o contrato e rejeita o resto
// ---------------------------------------------------------------------------

describe('games/schema — world.json e nível', () => {
  it('nível válido materializa defaults (boss=false, hidden=false)', () => {
    const level = parseGameLevel(nivelValido(), 'mem.json');
    assert.equal(level.id, 'l1');
    assert.equal(level.boss, false, 'boss ausente deve materializar false');
    assert.equal(level.contract.cases[0].hidden, false, 'hidden ausente deve materializar false');
    assert.equal(level.contract.cases[1].hidden, true);
    assert.equal(level.langs.python?.starter, '# escreva a soma\n');
    assert.equal(level.langs.rust, undefined);
  });

  it('boss:true e a ordem de introduces passam intactos', () => {
    const level = parseGameLevel(nivelValido({ boss: true, introduces: ['lacos', 'arrays'] }), 'mem.json');
    assert.equal(level.boss, true);
    assert.deepEqual(level.introduces, ['lacos', 'arrays']);
  });

  it('REJEITA mode que não seja io (literal fechado)', () => {
    const raw = nivelValido();
    (raw.contract as Record<string, unknown>).mode = 'unit';
    assert.throws(() => parseGameLevel(raw, 'mem.json'), GameContentError);
  });

  it('REJEITA nível sem casos e sem linguagem nenhuma', () => {
    const semCasos = nivelValido();
    (semCasos.contract as Record<string, unknown>).cases = [];
    assert.throws(() => parseGameLevel(semCasos, 'mem.json'), GameContentError);

    const semLangs = nivelValido({ langs: {} });
    assert.throws(() => parseGameLevel(semLangs, 'mem.json'), /pelo menos UMA linguagem/);
  });

  it('REJEITA optimize não-positivo e campos obrigatórios ausentes', () => {
    assert.throws(
      () => parseGameLevel(nivelValido({ optimize: { lines: { par: 0 }, timeMs: { parMs: 100 } } }), 'm.json'),
      GameContentError,
    );
    const semTitulo = nivelValido();
    delete semTitulo.title;
    assert.throws(() => parseGameLevel(semTitulo, 'm.json'), GameContentError);
  });

  it('world válido: levels ausente materializa [] e description é livre', () => {
    const world = parseGameWorld({ id: 'alpha', title: 'Alpha', description: '' }, 'mem.json');
    assert.deepEqual(world.levels, []);
    assert.equal(world.description, '');
  });

  it('world REJEITA sem id/title', () => {
    assert.throws(() => parseGameWorld({ title: 'x' }, 'mem.json'), GameContentError);
  });
});

// ---------------------------------------------------------------------------
// 3–6 — loader de mundos (conteúdo em disco)
// ---------------------------------------------------------------------------

describe('games/worlds — loader de app/resources/games/<world>/', () => {
  let root: string;
  let gamesDir: string;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'games-worlds-'));
    gamesDir = path.join(root, 'games');

    // alpha: world.json com ordem canónica INVERTIDA + níveis em 2 layouts
    // distintos (raiz e subpasta) — o loader tem de apanhar os dois.
    await fs.mkdir(path.join(gamesDir, 'alpha', 'l2dir'), { recursive: true });
    await fs.writeFile(
      path.join(gamesDir, 'alpha', 'world.json'),
      JSON.stringify({ id: 'alpha', title: 'Mundo Alpha', description: 'desc', levels: ['l2', 'l1'] }),
      'utf8',
    );
    await fs.writeFile(path.join(gamesDir, 'alpha', 'l1.json'), JSON.stringify(nivelValido()), 'utf8');
    await fs.writeFile(
      path.join(gamesDir, 'alpha', 'l2dir', 'level.json'),
      JSON.stringify(nivelValido({ id: 'l2', title: 'Chefe', boss: true })),
      'utf8',
    );

    // beta: world.json CORROMPIDO — mundo saltado na listagem (tolerância).
    await fs.mkdir(path.join(gamesDir, 'beta'), { recursive: true });
    await fs.writeFile(path.join(gamesDir, 'beta', 'world.json'), '{ corrompido', 'utf8');

    // gamma: mundo válido mas UM nível corrompido — só o nível é saltado.
    await fs.mkdir(path.join(gamesDir, 'gamma'), { recursive: true });
    await fs.writeFile(
      path.join(gamesDir, 'gamma', 'world.json'),
      JSON.stringify({ id: 'gamma', title: 'Gamma', description: '' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(gamesDir, 'gamma', 'ok.json'),
      JSON.stringify(nivelValido({ id: 'g1', title: 'G1' })),
      'utf8',
    );
    await fs.writeFile(path.join(gamesDir, 'gamma', 'quebrado.json'), '{ não é json', 'utf8');
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('resolveGamesDir segue o mecanismo de resources/tracks', () => {
    assert.equal(
      resolveGamesDir({ isPackaged: false, resourcesPath: '/x', appPath: root, cwd: root, exists: () => true }),
      path.join(root, 'resources', 'games'),
    );
  });

  it('listGameWorlds: ordena por world.levels, marca boss e NÃO promete o quebrado', async () => {
    const worlds = await listGameWorlds(gamesDir, emptyGameProgress());
    assert.deepEqual(
      worlds.map((w) => w.id),
      ['alpha', 'gamma'],
      'beta (mundo corrompido) não pode aparecer',
    );
    const alpha = worlds[0];
    assert.deepEqual(
      alpha.levels.map((l) => l.id),
      ['l2', 'l1'],
      'a ordem canónica de world.levels manda',
    );
    assert.equal(alpha.levels[0].boss, true);
    assert.equal(alpha.levels[0].completed, false);
    const gamma = worlds[1];
    assert.deepEqual(gamma.levels.map((l) => l.id), ['g1'], 'o nível corrompido não é prometido');
  });

  it('listGameWorlds injeta o progresso (completed/bestLines/bestTimeMs)', async () => {
    const progress = {
      worlds: { alpha: { l1: { completedAt: '2026-10-03T00:00:00.000Z', bestLines: 7, attempts: 3, history: [7] } } },
    };
    const worlds = await listGameWorlds(gamesDir, progress);
    const l1 = worlds[0].levels.find((l) => l.id === 'l1');
    assert.equal(l1?.completed, true);
    assert.equal(l1?.bestLines, 7);
    assert.equal(l1?.bestTimeMs, undefined, 'bestTimeMs ausente não é inventado');
  });

  it('loadGameLevelPayload: sem spoilers e com as contagens certas', async () => {
    const payload = await loadGameLevelPayload(gamesDir, 'alpha', 'l1', 'python');
    assert.equal(payload.caseCount, 1, 'só os casos visíveis contam');
    assert.equal(payload.hiddenCount, 1);
    assert.equal(payload.starter, '# escreva a soma\n');
    assert.equal(payload.boss, false);
    assert.deepEqual(payload.optimize, { lines: { par: 3 }, timeMs: { parMs: 120 } });
    const keys = Object.keys(payload);
    assert.ok(!keys.includes('reference'), 'a reference NUNCA vai para o payload do aluno');
    assert.ok(!keys.includes('cases'), 'os casos (com expectedOutput) NÃO vão para o payload');
  });

  it('FAIL-CLOSED: nível/linguagem/mundo ausentes lançam GameContentError', async () => {
    await assert.rejects(() => loadGameLevel(gamesDir, 'alpha', 'nao-existe'), GameContentError);
    await assert.rejects(() => loadGameLevelPayload(gamesDir, 'alpha', 'l1', 'rust'), /não suporta a linguagem/);
    await assert.rejects(() => loadGameLevel(gamesDir, 'nao-existe', 'l1'), /mundo não encontrado/);
  });

  it('findWorldDir aceita id do world.json quando o nome da pasta difere', async () => {
    const dir = await findWorldDir(gamesDir, 'gamma');
    assert.equal(path.basename(dir), 'gamma');
  });
});
