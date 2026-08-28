/**
 * electron/main/services/resourcesDir.ts — resolução ROBUSTA do diretório
 * `resources/` do app (rodada 10, onda 2a — fix do "loader infinito ao abrir
 * aula em clone limpo").
 *
 * CAUSA RAIZ (docs/relatorio-rodada10-diag.md, Bug 1): com o main lançado por
 * ENTRY DE ARQUIVO (`electron out/main/index.js` — o modo do harness E2E e o
 * jeito mais comum de rodar o buildado), o Electron define `app.getAppPath()`
 * como o DIRETÓRIO DO ENTRY (`<app>/out/main`), não a raiz do app. O padrão
 * `app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources', ...)`
 * resolvia `<app>/out/main/resources` (que NÃO existe) e todo IPC de trilha
 * respondia ENOENT — a seção Trilhas sumia da Home e a aula ficava inalcançável.
 * Em dev (`electron .` / electron-vite dev) getAppPath() é a raiz → funcionava;
 * por isso o bug só aparecia em outro computador/CI/buildado.
 *
 * Este módulo centraliza a resolução por CADEIA DE CANDIDATOS com checagem de
 * existência e serve os 4 consumidores de `resources/`:
 *   1. trilhas (index.ts → getTracksDir → resolveTracksDir);
 *   2. STT local (sttLocalService.embeddedModelsPath);
 *   3. espeak-ng (espeakAssets.getEspeakNgDataDir);
 *   4. TTS engine (ttsEnginePaths.resourceRoot).
 * Puro Node (sem electron) — importável por node:test.
 *
 * NÃO migrar: LlmProxyService.resolveEngineEntryPath resolve por `__dirname`
 * (llm-engine.js vive AO LADO do bundle em out/main) — correto no modo entry,
 * não usa o padrão quebrado. studyMethodRunner.moduleAppRoot resolve errado em
 * ambos os modos mas está DORMENTE (nenhuma view chama study.run) — fora de
 * escopo da onda 2a, documentado no handoff.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/** Entradas da resolução — todas disponíveis no processo main do Electron. */
export interface ResourcesDirInput {
  /** app.isPackaged — empacotado → resourcesPath é o dono do resources. */
  isPackaged: boolean;
  /** process.resourcesPath (empacotado). */
  resourcesPath: string;
  /** app.getAppPath(). */
  appPath: string;
  /** process.cwd() — ÚLTIMO recurso, nunca âncora (o entry pode vir de outro cwd). */
  cwd: string;
  /** Checagem de existência injetável (testes). Default: existsSync. */
  exists?: (dir: string) => boolean;
}

/**
 * Parte PURA (sem fs): normaliza um appPath (app.getAppPath()) para a raiz do
 * app:
 *   - dev / `electron .`: appPath já é a raiz → inalterado;
 *   - entry buildado (`<root>/out/main` — electron-vite): sobe 2 níveis.
 */
export function normalizeEntryDir(appPath: string): string {
  const root = resolve(appPath);
  const seg = root.split(sep);
  const n = seg.length;
  if (n >= 2 && seg[n - 2] === 'out' && seg[n - 1] === 'main') {
    return join(root, '..', '..');
  }
  return root;
}

/**
 * Raiz REAL do app a partir de um appPath (defensiva, com fallback):
 *   1. normalizeEntryDir — padrão electron-vite (`<root>/out/main` → raiz);
 *   2. walk-up por package.json — layouts fora do padrão (ex.: dist/main) sobem
 *      até achar o diretório que contém package.json;
 *   3. sem package.json em nenhum ancestral → devolve o path normalizado mesmo
 *      que NÃO exista (decisão documentada: o erro ENOENT é tratado em runtime
 *      pelos consumidores — aqui nunca se lança erro de resolução).
 */
export function resolveAppRoot(
  appPath: string,
  hasPackageJson: (dir: string) => boolean = (dir) => existsSync(join(dir, 'package.json')),
): string {
  const start = normalizeEntryDir(appPath);
  let dir = start;
  for (;;) {
    if (hasPackageJson(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/**
 * Diretório `resources/` REAL do app, por CADEIA DE CANDIDATOS — o primeiro
 * que EXISTE vence:
 *   (a) empacotado → process.resourcesPath (ramo PRESERVADO, incondicional);
 *   (b) app.getAppPath()/resources            — dev / `electron .` (a raiz);
 *   (c) pai(appPath)/resources                — 1 nível acima do entry dir
 *       (out/main → out — AINDA não é a raiz; só o próximo resolve);
 *   (d) pai-do-pai(appPath)/resources         — 2 níveis acima (raiz do app);
 *   (e) cwd/resources                         — ÚLTIMO recurso (nunca âncora:
 *       o harness roda com cwd=APP_ROOT e mascararia; o entry pode vir de um
 *       cwd arbitrário onde as trilhas não existem).
 *
 * A checagem é por existência do diretório `resources/` (não de
 * `resources/tracks`): o helper serve 4 consumidores com subdiretórios
 * distintos (tracks, stt-models, espeak-ng-data, tts-*); trilhas é só um.
 * Nenhum candidato existe → fallback: raiz derivada do appPath + '/resources'
 * (devolvido MESMO inexistente — ENOENT tratado em runtime).
 */
export function resolveResourcesDir(input: ResourcesDirInput): string {
  if (input.isPackaged) return input.resourcesPath;
  const exists = input.exists ?? ((dir: string): boolean => existsSync(dir));
  const candidates = [
    join(input.appPath, 'resources'),
    join(dirname(input.appPath), 'resources'),
    join(dirname(dirname(input.appPath)), 'resources'),
    join(input.cwd, 'resources'),
  ];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return join(resolveAppRoot(input.appPath), 'resources');
}

/** Diretório de trilhas: resources/tracks (consumidor track-handlers). */
export function resolveTracksDir(input: ResourcesDirInput): string {
  return join(resolveResourcesDir(input), 'tracks');
}
