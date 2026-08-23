/**
 * tests/editorFiles.test.ts — construção da árvore de arquivos a partir da
 * lista plana de WorkspaceFile (FileExplorer).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTreeFromFiles,
  sortTree,
  findNode,
} from '../src/lib/editorFiles';
import type { WorkspaceFile } from '../shared/ipc-contract';

const F = (path: string, dir = false): WorkspaceFile => ({
  path,
  name: path.split('/').pop() ?? path,
  size: dir ? 0 : 4,
  dir,
});

describe('buildTreeFromFiles', () => {
  it('pasta vazia → árvore vazia', () => {
    assert.equal(buildTreeFromFiles([]).length, 0);
  });

  it('arquivos planos na raiz ficam na raiz', () => {
    const tree = buildTreeFromFiles([F('README.md'), F('main.py')]);
    const names = tree.map((n) => n.name);
    assert.deepEqual(names, ['README.md', 'main.py']);
  });

  it('aninha arquivos sob diretórios e deduplica pastas', () => {
    const files = [
      F('src/a.py'),
      F('src/b.py'),
      F('README.md'),
      F('tests/x_test.py'),
    ];
    const tree = buildTreeFromFiles(files);
    const src = tree.find((n) => n.name === 'src');
    assert.ok(src && src.dir);
    assert.equal(src.children.length, 2);
    const tests = tree.find((n) => n.name === 'tests');
    assert.ok(tests && tests.dir);
  });

  it('item dir:true vira diretório mesmo sem filhos na lista', () => {
    const tree = buildTreeFromFiles([F('assets', true)]);
    assert.equal(tree[0].dir, true);
    assert.equal(tree[0].children.length, 0);
  });

  it('não perde prefixo quando um dir também aparece na lista de items', () => {
    const files = [F('src', true), F('src/main.py')];
    const tree = buildTreeFromFiles(files);
    // raiz só tem o diretório src; o arquivo vai para dentro dele.
    assert.equal(tree.length, 1);
    assert.equal(tree[0].dir, true);
    assert.equal(tree[0].children.length, 1);
  });

  it('sortTree põe diretórios primeiro e ordena por nome', () => {
    const tree = sortTree(buildTreeFromFiles([F('z.py'), F('a/1.py'), F('a/b/2.py'), F('b.py')]));
    const top = tree.map((n) => n.name);
    assert.equal(top[0], 'a');
    assert.deepEqual(top.slice(1).sort(), ['b.py', 'z.py']);
  });

  it('findNode acha arquivo por path e devolve undefined quando ausente', () => {
    const tree = buildTreeFromFiles([F('src/a.py')]);
    assert.equal(findNode(tree, 'src/a.py')?.name, 'a.py');
    assert.equal(findNode(tree, 'nope.txt'), undefined);
  });
});