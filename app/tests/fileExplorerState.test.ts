/**
 * tests/fileExplorerState.test.ts — a máquina de estado PURA do FileExplorer
 * (expansão de pastas, seleção, formulário de novo ficheiro, exclusão
 * confirmada), extraída de `components/editor/FileExplorer.tsx` (contrato
 * state/view do STORY-SPEC §5). Sem jsdom: reducer puro.
 *
 * O invariante que este ficheiro TRAVA é o C2: excluir um arquivo é
 * DESTRUTIVO e irreversível — nunca acontece num clique. `request_delete`
 * só ENFILEIRA o diálogo; só `delete_confirmed` autoriza o chamador a apagar.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSubmitNewFile,
  fileExplorerReducer,
  initialFileExplorerState,
  isDirOpen,
  pendingDeleteName,
  type FileExplorerAction,
  type FileExplorerState,
} from '../src/lib/fileExplorerState';

const FILES = [
  { path: 'src', name: 'src', size: 0, dir: true },
  { path: 'src/main.py', name: 'main.py', size: 10, dir: false, language: 'py' },
  { path: 'src/deep', name: 'deep', size: 0, dir: true },
  { path: 'src/deep/solver.c', name: 'solver.c', size: 10, dir: false, language: 'c' },
  { path: 'README.md', name: 'README.md', size: 5, dir: false, language: 'md' },
];

function run(actions: FileExplorerAction[], from?: FileExplorerState): FileExplorerState {
  let s = from ?? initialFileExplorerState(FILES);
  for (const a of actions) s = fileExplorerReducer(s, a);
  return s;
}

describe('initialFileExplorerState', () => {
  it('começa com TODOS os diretórios abertos e nada selecionado', () => {
    const s = initialFileExplorerState(FILES);
    assert.equal(isDirOpen(s, 'src'), true);
    assert.equal(isDirOpen(s, 'src/deep'), true);
    assert.equal(s.selectedPath, null);
    assert.equal(s.pendingDelete, null);
    assert.equal(s.showNew, false);
    assert.equal(s.newName, '');
  });
});

describe('toggle_dir', () => {
  it('abre/fecha sem tocar nas outras pastas', () => {
    const s = run([{ type: 'toggle_dir', path: 'src' }]);
    assert.equal(isDirOpen(s, 'src'), false);
    assert.equal(isDirOpen(s, 'src/deep'), true);
    const back = run([{ type: 'toggle_dir', path: 'src' }], s);
    assert.equal(isDirOpen(back, 'src'), true);
  });
});

describe('seleção', () => {
  it('seleciona o ficheiro clicado (liberta o botão excluir)', () => {
    const s = run([{ type: 'select_file', path: 'src/main.py' }]);
    assert.equal(s.selectedPath, 'src/main.py');
  });
});

describe('formulário de novo ficheiro', () => {
  it('só submete com nome não-vazio (aparado)', () => {
    const empty = run([{ type: 'set_new_name', name: '   ' }]);
    assert.equal(canSubmitNewFile(empty), false);
    const ok = run([{ type: 'set_new_name', name: ' novo.py ' }]);
    assert.equal(canSubmitNewFile(ok), true);
  });

  it('toggle abre; submeter/fechar limpam o rascunho', () => {
    const open = run([
      { type: 'toggle_new_form' },
      { type: 'set_new_name', name: 'novo.py' },
    ]);
    assert.equal(open.showNew, true);
    assert.equal(open.newName, 'novo.py');

    const submitted = fileExplorerReducer(open, { type: 'new_file_submitted' });
    assert.equal(submitted.showNew, false);
    assert.equal(submitted.newName, '');

    const reopened = run([{ type: 'toggle_new_form' }, { type: 'set_new_name', name: 'x' }], submitted);
    const escaped = fileExplorerReducer(reopened, { type: 'close_new_form' });
    assert.equal(escaped.showNew, false);
    assert.equal(escaped.newName, '');

    // toggle fechado descarta o rascunho (o mesmo que o Escape)
    const toggledShut = run([{ type: 'toggle_new_form' }, { type: 'set_new_name', name: 'y' }]);
    const shut = fileExplorerReducer(toggledShut, { type: 'toggle_new_form' });
    assert.equal(shut.showNew, false);
    assert.equal(shut.newName, '');
  });
});

describe('C2 — exclusão sempre a dois passos', () => {
  it('request_delete só ENFILEIRA o diálogo (não apaga)', () => {
    const s = run([
      { type: 'select_file', path: 'src/main.py' },
      { type: 'request_delete' },
    ]);
    assert.equal(s.pendingDelete, 'src/main.py');
    assert.equal(s.selectedPath, 'src/main.py', 'a seleção mantém-se até confirmar');
  });

  it('sem seleção não há diálogo (botão excluir desabilitado)', () => {
    const s = run([{ type: 'request_delete' }]);
    assert.equal(s.pendingDelete, null);
  });

  it('cancelar fecha o diálogo e mantém a seleção', () => {
    const s = run([
      { type: 'select_file', path: 'README.md' },
      { type: 'request_delete' },
      { type: 'cancel_delete' },
    ]);
    assert.equal(s.pendingDelete, null);
    assert.equal(s.selectedPath, 'README.md');
  });

  it('confirmar limpa diálogo E seleção (botão excluir volta a desabilitar)', () => {
    const s = run([
      { type: 'select_file', path: 'src/deep/solver.c' },
      { type: 'request_delete' },
      { type: 'delete_confirmed' },
    ]);
    assert.equal(s.pendingDelete, null);
    assert.equal(s.selectedPath, null);
  });

  it('confirmar sem diálogo pendente é inócuo', () => {
    const s = run([{ type: 'select_file', path: 'README.md' }, { type: 'delete_confirmed' }]);
    assert.equal(s.selectedPath, null);
  });
});

describe('pendingDeleteName', () => {
  it('devolve o basename do ficheiro em confirmação', () => {
    const s = run([{ type: 'select_file', path: 'src/deep/solver.c' }, { type: 'request_delete' }]);
    assert.equal(pendingDeleteName(s), 'solver.c');
  });

  it('vazio sem diálogo aberto', () => {
    assert.equal(pendingDeleteName(initialFileExplorerState(FILES)), '');
  });
});
