/**
 * tests/navigationGuard.test.ts — fix HIGH (onda 2): embed de Fontes sem
 * `sandbox` + main sem guard `will-navigate`.
 *
 * A cadeia: um iframe cross-origin com user activation podia fazer
 * `top.location = 'https://hostil'` — a JANELA inteira navegava, o preload
 * RE-executava no novo documento do mesmo webContents e a página hostil
 * recebia a superfície completa de window.api. O CSP `frame-src` do
 * index.html NÃO protege (só filtra frames que o próprio documento carrega).
 *
 * O fix tem DUAS camadas independentes, ambas provadas aqui:
 *   BLOCO 1 — A DECISÃO, PURA. `isAppOwnNavigation` (sem import do electron):
 *     origem própria libera; http(s) externo nega; file: conforme as origens
 *     próprias (origin de file: é o opaco 'null'); garbage/relativa/vazia é
 *     deny-safe; whitespace/casing não furam a comparação.
 *   BLOCO 2 — A CAMADA 1, ANCORADA NA FONTE. O iframe do `LessonSourceViewer`
 *     declara `sandbox=` com `allow-scripts` e SEM `allow-top-navigation`
 *     (o frame não navega o topo — mata a cadeia na origem).
 *   BLOCO 3 — A CAMADA 2, ANCORADA NA FONTE. O main registra `will-navigate`
 *     com `preventDefault` + `shell.openExternal` consumindo a função pura —
 *     o MESMO estilo do `setWindowOpenHandler` existente.
 *
 * Reprodução: `bash tools/t.sh tests/navigationGuard.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { isAppOwnNavigation } from '../electron/main/navigation-guard';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const MAIN_PATH = resolve(HERE, '../electron/main/index.ts');
const MAIN_SRC = readFileSync(MAIN_PATH, 'utf8');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
/** Colapso de espaços — a âncora casa em UMA linha lógica, não em uma física. */
function flat(text: string): string {
  return codeOf(text).replace(/\s+/g, ' ');
}

describe('1. isAppOwnNavigation — a decisão pura', () => {
  const DEV_ORIGINS = ['http://localhost:5173/'] as const;
  const PROD_ORIGINS = ['file:///'] as const;

  it('origem própria (dev, http) libera a navegação', () => {
    assert.equal(isAppOwnNavigation('http://localhost:5173/lesson/1', DEV_ORIGINS), true);
    assert.equal(isAppOwnNavigation('http://localhost:5173', DEV_ORIGINS), true);
  });

  it('http(s) externo nega — é a cadeia do embed hostil', () => {
    assert.equal(isAppOwnNavigation('https://hostil.example/top', DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('https://hostil.example/top', PROD_ORIGINS), false);
    assert.equal(isAppOwnNavigation('http://localhost.evil:5173/', DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('http://127.0.0.1:5173/', DEV_ORIGINS), false);
  });

  it('file: conforme as origens próprias (origin de file: é opaco)', () => {
    assert.equal(isAppOwnNavigation('file:///opt/app/out/renderer/index.html', PROD_ORIGINS), true);
    assert.equal(isAppOwnNavigation('file:///qualquer/coisa.html', DEV_ORIGINS), false);
  });

  it('esquemas não-web (data:, about:, javascript:) são deny-safe', () => {
    assert.equal(isAppOwnNavigation("javascript:top.location='https://hostil'", DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('data:text/html,<script>alert(1)</script>', DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('about:blank', DEV_ORIGINS), false);
  });

  it('garbage/relativa/vazia é deny-safe (false, nunca throw)', () => {
    assert.equal(isAppOwnNavigation('nao-e-url', DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('', DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('   ', DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('http://', DEV_ORIGINS), false);
    assert.equal(isAppOwnNavigation('://sem-esquema', DEV_ORIGINS), false);
  });

  it('whitespace e casing não furam a comparação de origem', () => {
    assert.equal(isAppOwnNavigation('  https://LOCALHOST:5173/x  ', ['https://localhost:5173']), true);
    assert.equal(isAppOwnNavigation('http://LOCALHOST:5173/', DEV_ORIGINS), true);
  });

  it('portas diferentes são origens diferentes', () => {
    assert.equal(isAppOwnNavigation('http://localhost:9999/', DEV_ORIGINS), false);
  });

  it('origem própria malformada não libera nada (deny-safe)', () => {
    assert.equal(isAppOwnNavigation('http://localhost:5173/', ['###', '']), false);
  });
});

describe('2. A camada 1 na fonte — o iframe do viewer é sandboxado', () => {
  const VIEW = flat(VIEW_SRC);

  it('o iframe do LessonSourceViewer declara sandbox com allow-scripts', () => {
    assert.match(
      VIEW,
      /component="iframe" src=\{source\.url\}.*sandbox="allow-scripts allow-same-origin allow-popups allow-forms"/,
    );
  });

  it('o sandbox NÃO tem allow-top-navigation — o frame não navega o topo', () => {
    const iframe = VIEW.slice(VIEW.indexOf('component="iframe"'), VIEW.indexOf('component="iframe"') + 900);
    assert.ok(iframe.includes('sandbox='), 'iframe do viewer deve declarar sandbox');
    assert.ok(!iframe.includes('allow-top-navigation'), 'allow-top-navigation NÃO pode estar presente');
    assert.ok(!iframe.includes('allow-plugins'), 'allow-plugins NÃO pode estar presente');
  });

  it('a ausência de allow-top-navigation está documentada no local', () => {
    assert.ok(VIEW_SRC.includes('allow-top-navigation'), 'comentário deve explicar o token ausente');
  });
});

describe('3. A camada 2 na fonte — o main bloqueia navegação de topo estranha', () => {
  const MAIN = flat(MAIN_SRC);

  it('o main registra will-navigate com preventDefault + openExternal', () => {
    assert.match(MAIN, /webContents\.on\('will-navigate', \(event, url\) => \{/);
    assert.match(MAIN, /event\.preventDefault\(\)/);
    assert.match(MAIN, /shell\.openExternal\(url\)/);
  });

  it('o handler consome a função pura como decisão', () => {
    assert.match(MAIN, /isAppOwnNavigation\(url, ownOrigins\)/);
    assert.ok(MAIN_SRC.includes("from './navigation-guard'"), 'import do módulo puro');
  });

  it('as origens próprias derivam do carregamento real (dev URL vs file:)', () => {
    assert.match(MAIN, /ELECTRON_RENDERER_URL/);
    assert.match(MAIN, /\['file:\/\/\/'\]/);
  });
});
