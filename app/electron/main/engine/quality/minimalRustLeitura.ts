/**
 * app/electron/main/engine/quality/minimalRustLeitura.ts — a LEITURA do teste
 * e do starter de Rust pelo AST do adaptador (subprocesso node + WASM):
 * asserts, forma do teste e a assinatura no starter.
 *
 * A prosa normativa vive na fachada `minimalRust.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { RS_ENTRY_PATH, RS_TEST_PATH } from '../lang/rust';
import { getAdapter, type LangNode } from '../lang/registry';
import {
  CRATE_DA_SOLUCAO,
  MINIMAL_RUST_LANGUAGE,
  type AssertRust,
  type ExtrairLiteraisRustResult,
  type FormaDoTesteRust,
  type FuncaoNoStarterRs,
  type LiteraisDoTesteRust,
} from './minimalRustTipos';

function caminhar(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminhar(filho, fn);
}

/**
 * Os ARGUMENTOS top-level de uma macro, como TEXTO-FONTE — a MESMA leitura de
 * `requirements.ts`: o extrator emite um nó sintético `MacroArg` por
 * argumento top-level (`extract_ast.mjs`, ramo `macro_invocation`), então
 * aqui é só leitura.
 */
function argumentosDoMacro(macro: LangNode): string[] {
  return macro.children
    .filter((c) => c.type === 'MacroArg' && c.synthetic)
    .map((c) => c.attributes.argText ?? '')
    .filter((t) => t !== '');
}

/** `dobro(2)` → `{ funcao: 'dobro', argumentosInternos: '2' }`. */
function partirChamada(alvo: string): { funcao: string; argumentosInternos: string } | null {
  const m = /^([a-zA-Z_][A-Za-z0-9_]*(?:::[a-zA-Z_][A-Za-z0-9_]*)?)\s*\((.*)\)\s*$/.exec(alvo.trim());
  if (m === null) return null;
  const partes = m[1].split('::');
  return { funcao: partes[partes.length - 1], argumentosInternos: m[2].trim() };
}

/** `use desafio::a, b;` — coleta as funções-alvo da forma `import`. */
function coletarUsoDoCrate(node: LangNode, funcoesAlvo: Set<string>): void {
  if (node.type !== 'UseDeclaration' || node.attributes.useRoot !== CRATE_DA_SOLUCAO) return;
  for (const nome of (node.attributes.imports ?? '').split(',')) {
    if (nome !== '' && nome !== 'self') funcoesAlvo.add(nome);
  }
}

/** Lê UMA macro de assert (`assert_eq!`/`assert_ne!`/`assert!`) — null fora da tabela. */
function lerMacroAssert(node: LangNode, nome: string): AssertRust | null {
  if (nome !== 'assert_eq!' && nome !== 'assert_ne!' && nome !== 'assert!') return null;
  const argumentos = argumentosDoMacro(node);
  let funcao: string | null = null;
  let alvo: string | null = null;
  let argumentosDaChamada: string | null = null;
  if (argumentos.length > 0) {
    alvo = argumentos[0];
    const chamada = partirChamada(alvo);
    if (chamada !== null) {
      funcao = chamada.funcao;
      argumentosDaChamada = chamada.argumentosInternos;
    }
  }
  return {
    assert: nome,
    funcao,
    alvo,
    argumentosDaChamada,
    esperado: argumentos.length >= 2 ? argumentos[1] : null,
    trecho: node.text.slice(0, 120),
  };
}

/**
 * Lê os asserts e a FORMA de um arquivo de teste de Rust.
 * Determinístico: mesma entrada, mesma saída. Parse falhou ⇒ `{ok:false}`.
 */
export function extrairLiteraisDoTesteRust(testsCode: string): ExtrairLiteraisRustResult {
  const adapter = getAdapter(MINIMAL_RUST_LANGUAGE);
  const parsed = adapter.parse(testsCode, { fileName: RS_TEST_PATH });
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        'testsCode não parseia como Rust (' +
        parsed.error.code + ' em ' + parsed.error.line + ':' + parsed.error.column + '): ' +
        parsed.error.message,
    };
  }

  const funcoesAlvo = new Set<string>();
  const asserts: AssertRust[] = [];

  caminhar(parsed.root, (node) => {
    coletarUsoDoCrate(node, funcoesAlvo);
    if (node.type !== 'MacroInvocation') return;
    const assert = lerMacroAssert(node, `${node.attributes.name ?? ''}!`);
    if (assert !== null) asserts.push(assert);
  });

  const forma: FormaDoTesteRust = funcoesAlvo.size > 0 ? 'import' : 'desconhecida';
  return { ok: true, dados: { forma, funcoesAlvo: [...funcoesAlvo].sort(), asserts } };
}

/** Localiza as funções-alvo no starter (`fn nome(…) { … }`, com ou sem pub). */
export function localizarFuncoesNoStarterRs(
  starter: string,
  alvos: readonly string[],
): FuncaoNoStarterRs[] {
  const adapter = getAdapter(MINIMAL_RUST_LANGUAGE);
  const parsed = adapter.parse(starter, { fileName: RS_ENTRY_PATH });
  if (!parsed.ok) return [];
  const querido = new Set(alvos);
  const out: FuncaoNoStarterRs[] = [];
  caminhar(parsed.root, (node) => {
    if (node.type !== 'FunctionItem') return;
    const nome = node.attributes.name;
    if (nome === undefined || !querido.has(nome)) return;
    const corpo = [...node.children].reverse().find((c) => c.type === 'Block');
    if (corpo === undefined) return;
    out.push({
      nome,
      texto: node.text,
      corpoStart: corpo.start - node.start,
      start: node.start,
    });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}
