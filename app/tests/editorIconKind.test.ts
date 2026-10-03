/**
 * tests/editorIconKind.test.ts — a família de ÍCONE por ficheiro (dado puro
 * de `src/lib/editorLanguage.ts`, usado pelas abas do EditorPane e pela árvore
 * do FileExplorer). Quem escolhe o glifo é a view; aqui prova-se só a
 * decisão, sem DOM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { iconKindForFilename } from '../src/lib/editorLanguage';

describe('iconKindForFilename', () => {
  it('código: linguagens com parser dedicado ou fallback', () => {
    for (const f of [
      'main.py',
      'solution.rs',
      'solver.c',
      'lib.hpp',
      'app.tsx',
      'script.sh',
      'src/nested/fib.py',
    ]) {
      assert.equal(iconKindForFilename(f), 'code', f);
    }
  });

  it('dados: json', () => {
    assert.equal(iconKindForFilename('data.json'), 'data');
  });

  it('documentos: markdown', () => {
    assert.equal(iconKindForFilename('README.md'), 'doc');
    assert.equal(iconKindForFilename('docs/notas.markdown'), 'doc');
  });

  it('texto/ignorados caem em "file"', () => {
    for (const f of ['notas.txt', 'run.log', 'Dockerfile', '.gitignore', 'sem-extensao']) {
      assert.equal(iconKindForFilename(f), 'file', f);
    }
  });

  it('extração de extensão igual à dos realces (basename após o último ponto)', () => {
    assert.equal(iconKindForFilename('a.b.py'), 'code');
    assert.equal(iconKindForFilename('dir.d/file'), 'file');
    assert.equal(iconKindForFilename('trailing.'), 'file');
  });
});
