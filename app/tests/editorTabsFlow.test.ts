/**
 * tests/editorTabsFlow.test.ts — as DECISÕES puras do fluxo de abas do editor
 * (extraídas do container `EditorPane.tsx` no âmbito do contrato state/view do
 * STORY-SPEC §5). Sem jsdom: funções puras de `src/lib/editorTabs.ts`.
 *
 * O que se prova aqui é o que o container ORQUESTRA:
 *  - autosave antes de TROCAR de aba (só quando a corrente está suja);
 *  - autosave antes de FECHAR aba suja;
 *  - o save de C1 (todos os buffers sujos, pela ordem das abas);
 *  - o ficheiro de uma aba (o da lista, ou o sintetizado do path).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dirtyPaths,
  editorTabsReducer,
  findTab,
  initialEditorTabs,
  needsAutosaveBeforeClose,
  pathToAutosaveBeforeActivate,
  workspaceFileFor,
} from '../src/lib/editorTabs';

const FILE_A = { path: 'src/a.py', name: 'a.py', size: 3, dir: false, language: 'py' };
const FILE_B = { path: 'src/b.rs', name: 'b.rs', size: 3, dir: false, language: 'rs' };

/** Estado com A (suja) e B (limpa), com A ativa. */
function stateWithDirtyA(): ReturnType<typeof editorTabsReducer> {
  let s = editorTabsReducer(initialEditorTabs, { type: 'open', file: FILE_A, content: 'v1' });
  s = editorTabsReducer(s, { type: 'update_content', path: FILE_A.path, content: 'v2' });
  s = editorTabsReducer(s, { type: 'open', file: FILE_B, content: 'fn main() {}' });
  s = editorTabsReducer(s, { type: 'activate', path: FILE_A.path });
  return s;
}

describe('pathToAutosaveBeforeActivate', () => {
  it('devolve o path da aba suja corrente antes de trocar', () => {
    const s = stateWithDirtyA();
    assert.equal(pathToAutosaveBeforeActivate(s, FILE_B.path), FILE_A.path);
  });

  it('não pede save quando a corrente está limpa', () => {
    let s = stateWithDirtyA();
    s = editorTabsReducer(s, { type: 'mark_saved', path: FILE_A.path });
    assert.equal(pathToAutosaveBeforeActivate(s, FILE_B.path), null);
  });

  it('não pede save para a própria aba ativa', () => {
    const s = stateWithDirtyA();
    assert.equal(pathToAutosaveBeforeActivate(s, FILE_A.path), null);
  });

  it('não pede save sem abas', () => {
    assert.equal(pathToAutosaveBeforeActivate(initialEditorTabs, 'x.py'), null);
  });
});

describe('needsAutosaveBeforeClose', () => {
  it('true só para a aba suja', () => {
    const s = stateWithDirtyA();
    assert.equal(needsAutosaveBeforeClose(s, FILE_A.path), true);
    assert.equal(needsAutosaveBeforeClose(s, FILE_B.path), false);
    assert.equal(needsAutosaveBeforeClose(s, 'nao-existe'), false);
  });
});

describe('dirtyPaths (save de C1)', () => {
  it('devolve todos os sujos pela ordem das abas', () => {
    let s = stateWithDirtyA();
    s = editorTabsReducer(s, { type: 'update_content', path: FILE_B.path, content: 'mudou' });
    assert.deepEqual(dirtyPaths(s), [FILE_A.path, FILE_B.path]);
  });

  it('vazio quando nada está sujo', () => {
    let s = stateWithDirtyA();
    s = editorTabsReducer(s, { type: 'mark_saved', path: FILE_A.path });
    assert.deepEqual(dirtyPaths(s), []);
  });
});

describe('findTab', () => {
  it('acha a aba aberta e ignora paths fechados', () => {
    const s = stateWithDirtyA();
    assert.equal(findTab(s, FILE_B.path)?.name, 'b.rs');
    assert.equal(findTab(s, 'nao-existe'), undefined);
  });
});

describe('workspaceFileFor', () => {
  it('usa o WorkspaceFile da lista quando existe', () => {
    assert.deepEqual(workspaceFileFor([FILE_A], FILE_A.path), FILE_A);
  });

  it('sintetiza o mínimo pelo basename quando a lista não o traz', () => {
    const synthesized = workspaceFileFor([], 'src/novo.txt');
    assert.equal(synthesized.path, 'src/novo.txt');
    assert.equal(synthesized.name, 'novo.txt');
    assert.equal(synthesized.dir, false);
    assert.equal(synthesized.size, 0);
  });

  it('path sem basename cai no path inteiro', () => {
    assert.equal(workspaceFileFor([], 'raiz').name, 'raiz');
  });
});
