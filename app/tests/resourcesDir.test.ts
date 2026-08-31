/**
 * tests/resourcesDir.test.ts — resolução de `resources/` por CADEIA DE
 * CANDIDATOS (onda 2a, rodada 10 — fix do "loader infinito ao abrir aula em
 * clone limpo"; ver docs/app-gui.md §2.16, Bug 1).
 *
 * Cobre os 3 modos de execução + cwd-aleatório:
 *   - dev / `electron .`: app.getAppPath() já é a raiz → <raiz>/resources;
 *   - built-unpackaged com entry por arquivo (`electron out/main/index.js`):
 *     app.getAppPath()=<raiz>/out/main → a cadeia sobe até achar resources/;
 *   - packaged: process.resourcesPath vence incondicionalmente (ramo preservado);
 *   - cwd aleatório: último recurso, nunca âncora (não mascara o entry).
 * E o caso NADA-EXISTE: devolve o path derivado mesmo inexistente (o erro
 * ENOENT é tratado em runtime pelos consumidores — decisão documentada).
 *
 * Sem electron, sem jsdom, sem fs real (exists injetado) — puro node:test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEntryDir,
  resolveAppRoot,
  resolveResourcesDir,
  resolveTracksDir,
  type ResourcesDirInput,
} from '../electron/main/services/resourcesDir';

/** exists fake: verdadeiro só para os diretórios listados. */
function makeExists(...dirs: string[]): (dir: string) => boolean {
  const set = new Set(dirs);
  return (dir) => set.has(dir);
}

/** Entradas padrão (não-packaged, appPath=raiz, cwd arbitrário). */
function base(over: Partial<ResourcesDirInput> = {}): ResourcesDirInput {
  return {
    isPackaged: false,
    resourcesPath: '/pkg/Contents/Resources',
    appPath: '/proj/app',
    cwd: '/some/random/cwd',
    ...over,
  };
}

describe('normalizeEntryDir (parte pura, sem fs)', () => {
  it('raiz dev fica inalterada', () => {
    assert.equal(normalizeEntryDir('/proj/app'), '/proj/app');
  });

  it('entry buildado out/main sobe 2 níveis (out/main → raiz)', () => {
    assert.equal(normalizeEntryDir('/proj/app/out/main'), '/proj/app');
  });

  it('normaliza separador/trailing (resolve() remove o slash final)', () => {
    assert.equal(normalizeEntryDir('/proj/app/out/main/'), '/proj/app');
    assert.equal(normalizeEntryDir('/proj/app/'), '/proj/app');
  });
});

describe('resolveAppRoot (padrão out/main + walk-up package.json)', () => {
  it('dev: package.json na raiz → raiz', () => {
    const has = (dir: string) => dir === '/proj/app';
    assert.equal(resolveAppRoot('/proj/app', has), '/proj/app');
  });

  it('entry out/main → raiz pelo padrão, mesmo SEM package.json em lugar nenhum', () => {
    const has = () => false;
    assert.equal(resolveAppRoot('/proj/app/out/main', has), '/proj/app');
  });

  it('layout fora do padrão (dist/main) → walk-up acha o package.json da raiz', () => {
    const has = (dir: string) => dir === '/proj/app';
    assert.equal(resolveAppRoot('/proj/app/dist/main', has), '/proj/app');
  });

  it('sem package.json em nenhum ancestral → devolve o path normalizado mesmo inexistente (ENOENT em runtime)', () => {
    const has = () => false;
    assert.equal(resolveAppRoot('/proj/app/dist/main', has), '/proj/app/dist/main');
  });
});

describe('resolveResourcesDir (cadeia de candidatos)', () => {
  it('dev: appPath é a raiz → <raiz>/resources', () => {
    const exists = makeExists('/proj/app/resources');
    assert.equal(resolveResourcesDir(base({ exists })), '/proj/app/resources');
  });

  it('entry: appPath=<raiz>/out/main, resources só na raiz → sobe 2 níveis até <raiz>/resources', () => {
    const exists = makeExists('/proj/app/resources');
    assert.equal(
      resolveResourcesDir(base({ appPath: '/proj/app/out/main', exists })),
      '/proj/app/resources',
    );
  });

  it('entry: ordem da cadeia respeitada (out/main → out → raiz)', () => {
    const exists = makeExists('/proj/app/out/resources', '/proj/app/resources');
    assert.equal(
      resolveResourcesDir(base({ appPath: '/proj/app/out/main', exists })),
      '/proj/app/out/resources',
    );
  });

  it('packaged: process.resourcesPath vence INCONDICIONALMENTE (ramo preservado)', () => {
    // Mesmo com resources na raiz existindo, empacotado ignora a cadeia.
    const exists = makeExists('/proj/app/resources');
    assert.equal(
      resolveResourcesDir(base({ isPackaged: true, exists })),
      '/pkg/Contents/Resources',
    );
  });

  it('cwd aleatório: NUNCA vence enquanto a cadeia do app resolver', () => {
    const exists = makeExists('/proj/app/out/resources', '/other/cwd/resources');
    assert.equal(
      resolveResourcesDir(base({ appPath: '/proj/app/out/main', cwd: '/other/cwd', exists })),
      '/proj/app/out/resources',
    );
  });

  it('cwd como ÚNICA fonte (nada na cadeia do app) → <cwd>/resources (último recurso)', () => {
    const exists = makeExists('/other/cwd/resources');
    assert.equal(
      resolveResourcesDir(base({ appPath: '/proj/app/out/main', cwd: '/other/cwd', exists })),
      '/other/cwd/resources',
    );
  });

  it('harness (cwd=APP_ROOT) não mascara o entry: resolve para <raiz>/resources', () => {
    const exists = makeExists('/proj/app/resources');
    assert.equal(
      resolveResourcesDir(base({ appPath: '/proj/app/out/main', cwd: '/proj/app', exists })),
      '/proj/app/resources',
    );
  });

  it('nada existe → fallback: raiz derivada do appPath + /resources, devolvido MESMO inexistente', () => {
    const exists = makeExists();
    assert.equal(
      resolveResourcesDir(base({ appPath: '/proj/app/out/main', exists })),
      '/proj/app/resources',
    );
    assert.equal(
      resolveResourcesDir(base({ exists })),
      '/proj/app/resources',
    );
  });
});

describe('resolveTracksDir (consumidor trilhas)', () => {
  it('dev → <raiz>/resources/tracks', () => {
    const exists = makeExists('/proj/app/resources');
    assert.equal(resolveTracksDir(base({ exists })), '/proj/app/resources/tracks');
  });

  it('entry → <raiz>/resources/tracks (subida da cadeia)', () => {
    const exists = makeExists('/proj/app/resources');
    assert.equal(
      resolveTracksDir(base({ appPath: '/proj/app/out/main', exists })),
      '/proj/app/resources/tracks',
    );
  });

  it('packaged → <resourcesPath>/tracks', () => {
    assert.equal(
      resolveTracksDir(base({ isPackaged: true })),
      '/pkg/Contents/Resources/tracks',
    );
  });
});
