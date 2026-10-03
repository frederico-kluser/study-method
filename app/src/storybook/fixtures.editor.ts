/**
 * src/storybook/fixtures.editor.ts — fixtures da ÁREA do editor (abas, árvore
 * de workspace, código de exemplo, saída do terminal).
 *
 * Complemento de `./fixtures.ts` (que NÃO se edita): os dados partilhados
 * globais ficam lá (`fixtureWorkspaceFiles`, `fixtureWorkspaceFileContents` —
 * usados pelo `mockApi` do `study:*`); aqui só os conjuntos que as stories do
 * editor, do CodeMirror e do terminal precisam e que não pertencem ao mock.
 *
 * Regras: só DADO (sem JSX, sem lógica de produto). Nenhum valor de design —
 * hex/cor vivem em `src/lib/designTokens.ts`/`codeTheme.ts`; as cores das
 * linhas do terminal são NOMES SEMÂNTICOS (`TerminalColorName`), resolvidos
 * pela paleta real do app.
 */
import type { WorkspaceFile } from '../../shared/ipc-contract';
import type { EditorTab } from '../lib/editorTabs';
import type { TerminalBufferLine } from '../lib/terminalBuffer';

/** Diretório de trabalho usado nas stories do EditorPane (caminho fictício). */
export const FIXTURE_EDITOR_WORKSPACE_DIR = 'desafio-dobro/workspace';

/**
 * Árvore de workspace aninhada: pastas implícitas e explícitas, linguagens
 * reais do editor (py/rs/c/json/md/txt) e um nome COMPRIDO para o teste de
 * overflow (a política da casa: o nome quebra, nunca trunca).
 */
export const fixtureEditorWorkspaceFiles: WorkspaceFile[] = [
  { path: 'README.md', name: 'README.md', size: 412, dir: false, language: 'markdown' },
  { path: 'fib.rs', name: 'fib.rs', size: 268, dir: false, language: 'rust' },
  { path: 'dados.json', name: 'dados.json', size: 120, dir: false, language: 'json' },
  {
    path: 'experimento_com_nome_extremamente_longo_para_testar_a_quebra_de_linha_na_arvore.txt',
    name: 'experimento_com_nome_extremamente_longo_para_testar_a_quebra_de_linha_na_arvore.txt',
    size: 96,
    dir: false,
    language: 'text',
  },
  { path: 'src', name: 'src', size: 0, dir: true },
  { path: 'src/main.py', name: 'main.py', size: 268, dir: false, language: 'python' },
  { path: 'src/deep', name: 'deep', size: 0, dir: true },
  { path: 'src/deep/solver.c', name: 'solver.c', size: 355, dir: false, language: 'c' },
];

/* ─── Abas ───────────────────────────────────────────────────────────────── */

/** Uma aba aberta e limpa (o caso mais comum). */
export const fixtureEditorTabsUma: EditorTab[] = [
  {
    path: 'src/main.py',
    name: 'main.py',
    content: '# Pronto para editar\n',
    dirty: false,
    language: 'python',
  },
];

/** Várias abas: uma ativa limpa, uma suja (não salva) e um documento. */
export const fixtureEditorTabsVarias: EditorTab[] = [
  {
    path: 'src/main.py',
    name: 'main.py',
    content: 'def dobro(n: int) -> int:\n    return n * 2\n',
    dirty: false,
    language: 'python',
  },
  {
    path: 'fib.rs',
    name: 'fib.rs',
    content: 'fn fib(n: u64) -> u64 {\n    n\n}\n',
    dirty: true,
    language: 'rust',
  },
  {
    path: 'README.md',
    name: 'README.md',
    content: '# Desafio: funções reutilizáveis\n',
    dirty: false,
    language: 'markdown',
  },
];

/** Overflow: abas suficientes para a barra ganhar scroll horizontal. */
export const fixtureEditorTabsOverflow: EditorTab[] = [
  ...fixtureEditorTabsVarias,
  {
    path: 'src/deep/solver.c',
    name: 'solver.c',
    content: 'int dobro(int n) { return n * 2; }\n',
    dirty: false,
    language: 'c',
  },
  {
    path: 'dados.json',
    name: 'dados.json',
    content: '{ "casos": 3 }\n',
    dirty: true,
    language: 'json',
  },
  {
    path: 'experimento_com_nome_extremamente_longo_para_testar_a_quebra_de_linha_na_arvore.txt',
    name: 'experimento_com_nome_extremamente_longo_para_testar_a_quebra_de_linha_na_arvore.txt',
    content: 'medição 1\n',
    dirty: false,
    language: 'text',
  },
  { path: 'notas.md', name: 'notas.md', content: 'notas\n', dirty: false, language: 'markdown' },
  { path: 'run.log', name: 'run.log', content: 'ok\n', dirty: false, language: 'log' },
];

/* ─── Código de exemplo (linguagens REAIS do editor — ver editorLanguage.ts) ─ */

export const fixtureEditorCodePython = `# Desafio: dobro com sinal preservado
def dobro(n: int) -> int:
    """Devolve o dobro de n, com o sinal preservado."""
    return n * 2


if __name__ == "__main__":
    print(dobro(-7))
`;

export const fixtureEditorCodeC = `#include <stdio.h>

/* Desafio: dobro com sinal preservado */
int dobro(int n) {
    return n * 2;
}

int main(void) {
    printf("%d\\n", dobro(-7));
    return 0;
}
`;

export const fixtureEditorCodeRust = `/// Desafio: dobro com sinal preservado.
fn dobro(n: i64) -> i64 {
    n * 2
}

fn main() {
    println!("{}", dobro(-7));
}
`;

/* ─── Saída do terminal (nomes semânticos — a paleta é a do app) ─────────── */

/** Linhas de saída determinística de uma rodada de testes (PASSOU). */
export const fixtureEditorTerminalSaida: TerminalBufferLine[] = [
  { text: '=== TESTES ===', color: 'accent' },
  { text: '✔ dobro de 0 devolve 0', color: 'default' },
  { text: '✔ dobro de 7 devolve 14', color: 'default' },
  { text: '✔ dobro de -3 devolve -6', color: 'default' },
  { text: '3 de 3 testes', color: 'muted' },
  { text: 'PASSOU', color: 'green' },
];

/** Execução em curso (o painel ainda não tem veredicto). */
export const fixtureEditorTerminalExecucao: TerminalBufferLine[] = [
  { text: '=== TESTES ===', color: 'accent' },
  { text: 'A executar a fase determinística…', color: 'yellow' },
  { text: '▸ test_solution.py', color: 'muted' },
];

/** Falha: veredicto negativo com a saída do teste que falhou. */
export const fixtureEditorTerminalErro: TerminalBufferLine[] = [
  { text: '=== TESTES ===', color: 'accent' },
  { text: '✘ dobro de 7 devolve 14', color: 'default' },
  { text: 'AssertionError: assert 14 == 15', color: 'red' },
  { text: '2 de 3 testes', color: 'muted' },
  { text: 'NÃO PASSOU', color: 'red' },
];
