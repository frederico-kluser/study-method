/**
 * tests/language.test.ts — mapa de extensão → realce do editor (CodeMirror).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  languageForExt,
  extensionsForFilename,
  normalizeExt,
} from '../src/lib/editorLanguage';

describe('normalizeExt', () => {
  it('remove ponto inicial e normalize para lowercase', () => {
    assert.equal(normalizeExt('.TS'), 'ts');
    assert.equal(normalizeExt('PY'), 'py');
    assert.equal(normalizeExt(' .md '), 'md');
  });
});

describe('languageForExt', () => {
  it('mapeia javascript/typescript/python/json/markdown', () => {
    const js = languageForExt('js');
    assert.equal(js.label, 'JavaScript');
    assert.equal(js.fallback, undefined);

    const ts = languageForExt('ts');
    assert.equal(ts.label, 'TypeScript');

    const py = languageForExt('py');
    assert.equal(py.label, 'Python');

    const json = languageForExt('json');
    assert.equal(json.label, 'JSON');

    const md = languageForExt('md');
    assert.equal(md.label, 'Markdown');
  });

  it('linguagens sem parser dedicado caem em fallback (documentado)', () => {
    const go = languageForExt('go');
    assert.equal(go.fallback, true);
    const sh = languageForExt('sh');
    assert.equal(sh.fallback, true);
  });

  it('extensão desconhecida/de vazio → fallback texto puro', () => {
    assert.equal(languageForExt('unknownxyz').fallback, true);
    assert.equal(languageForExt('').label, 'Texto puro');
  });

  it('línguas com parser dedicado retornam extensões não-vazias', () => {
    assert.ok(languageForExt('py').extensions.length > 0);
    assert.ok(languageForExt('md').extensions.length > 0);
  });
});

describe('extensionsForFilename', () => {
  it('deduz a extensão do basename', () => {
    assert.equal(extensionsForFilename('src/main.py').length, 1);
    // texto puro (sem parser) ainda tem extensão da tabela para .md
    assert.ok(extensionsForFilename('a.md').length >= 1);
  });
  it('arquivo sem extensão → texto puro (0 extensões)', () => {
    assert.equal(extensionsForFilename('README').length, 0);
    assert.equal(extensionsForFilename('.gitignore').length, 0);
  });
});