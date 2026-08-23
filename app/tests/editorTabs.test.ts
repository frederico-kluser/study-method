/**
 * tests/editorTabs.test.ts — reducer de abas do editor (dirty tracking,
 * abrir/ativar/fechar, conteúdo).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  editorTabsReducer,
  initialEditorTabs,
  activeTab,
  hasDirty,
} from '../src/lib/editorTabs';

const FILE_A = { path: 'a.py', name: 'a.py', size: 3, dir: false, language: 'py' };
const FILE_B = { path: 'b.py', name: 'b.py', size: 3, dir: false, language: 'py' };

describe('editorTabsReducer', () => {
  it('abre uma aba e a torna ativa', () => {
    const s = editorTabsReducer(initialEditorTabs, { type: 'open', file: FILE_A, content: 'x' });
    assert.equal(s.tabs.length, 1);
    assert.equal(s.activePath, 'a.py');
    assert.equal(activeTab(s)?.content, 'x');
  });

  it('abrir o mesmo path não duplica e só ativa', () => {
    let s = editorTabsReducer(initialEditorTabs, { type: 'open', file: FILE_A, content: 'x' });
    s = editorTabsReducer(s, { type: 'open', file: FILE_B, content: 'y' });
    s = editorTabsReducer(s, { type: 'open', file: FILE_A, content: 'x' });
    assert.equal(s.tabs.length, 2);
    assert.equal(s.activePath, 'a.py');
  });

  it('update_content marca dirty quando difere do conteúdo salvo', () => {
    let s = editorTabsReducer(initialEditorTabs, { type: 'open', file: FILE_A, content: 'hello' });
    s = editorTabsReducer(s, { type: 'update_content', path: 'a.py', content: 'hello world' });
    assert.equal(activeTab(s)?.dirty, true);
    assert.equal(hasDirty(s), true);
    // mesmo conteúdo → não suja de novo
    s = editorTabsReducer(s, { type: 'update_content', path: 'a.py', content: 'hello world' });
    assert.equal(activeTab(s)?.dirty, true);
  });

  it('mark_saved limpa o dirty', () => {
    let s = editorTabsReducer(initialEditorTabs, { type: 'open', file: FILE_A, content: 'hello' });
    s = editorTabsReducer(s, { type: 'update_content', path: 'a.py', content: 'hi' });
    s = editorTabsReducer(s, { type: 'mark_saved', path: 'a.py' });
    assert.equal(activeTab(s)?.dirty, false);
    assert.equal(hasDirty(s), false);
  });

  it('ativar path inexistente é no-op', () => {
    const s = editorTabsReducer(initialEditorTabs, { type: 'activate', path: 'nope' });
    assert.equal(s.activePath, null);
  });

  it('fechar a aba ativa move para a primeira restante', () => {
    let s = editorTabsReducer(initialEditorTabs, { type: 'open', file: FILE_A, content: 'x' });
    s = editorTabsReducer(s, { type: 'open', file: FILE_B, content: 'y' });
    s = editorTabsReducer(s, { type: 'activate', path: 'b.py' });
    s = editorTabsReducer(s, { type: 'close', path: 'b.py' });
    assert.equal(s.tabs.length, 1);
    assert.equal(s.activePath, 'a.py');
  });

  it('fechar a última aba deixa estado vazio', () => {
    let s = editorTabsReducer(initialEditorTabs, { type: 'open', file: FILE_A, content: 'x' });
    s = editorTabsReducer(s, { type: 'close', path: 'a.py' });
    assert.equal(s.tabs.length, 0);
    assert.equal(s.activePath, null);
  });
});