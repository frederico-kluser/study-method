/**
 * app/electron/main/engine/quality/requirementsRust.ts — a derivação de
 * requirements de RUST: `#[test] fn …` + `assert_eq!`/`assert!` sobre o AST do
 * adaptador Rust.
 *
 * A prosa normativa vive na fachada `requirements.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import type { AtomKey } from '../atomKeys';
import { extractAllOccurrences, extractAtoms } from '../extract';
import { RS_CRATE_NAME, RS_ENTRY_PATH, RS_TEST_PATH } from '../lang/rust';
import { getAdapter, type LangNode } from '../lang/registry';
import {
  RequirementsParseError,
  casarBijecao,
  type Requirement,
  type RequirementCobertura,
  type RequirementDeclarado,
  type RequirementsDerivados,
  type ValidacaoRequirements,
} from './requirementsTipos';
import type { TesteNodePy } from './requirementsPy';

export const RS_LANGUAGE = 'rust' as const;

export function parseSourceRust(code: string, fileName: string): LangNode {
  const parsed = getAdapter(RS_LANGUAGE).parse(code, { fileName });
  if (!parsed.ok) {
    throw new RequirementsParseError(
      `${parsed.error.code} em ${parsed.error.line}:${parsed.error.column}: ${parsed.error.message}`,
    );
  }
  return parsed.root;
}

export function caminharRust(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminharRust(filho, fn);
}

/** As funções de teste: `#[test] fn <nome>`, na ordem do fonte. */
export function coletarTestesRust(root: LangNode): TesteNodePy[] {
  const out: TesteNodePy[] = [];
  caminharRust(root, (n) => {
    if (n.type !== 'FunctionItem' && n.type !== 'FunctionSignatureItem') return;
    if (n.attributes.test !== 'true') return;
    const nome = n.attributes.name;
    if (nome === undefined) return;
    out.push({ nome, corpo: n, start: n.start });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** As macros de asserção do prelude, dentro de um nó, em ordem de fonte. */
export const ASSERTS_RUST: ReadonlySet<string> = new Set(['assert_eq!', 'assert_ne!', 'assert!']);

export function assertsDentroDeRust(node: LangNode): LangNode[] {
  const out: LangNode[] = [];
  caminharRust(node, (n) => {
    if (n.type !== 'MacroInvocation') return;
    const nome = `${n.attributes.name ?? ''}!`;
    if (ASSERTS_RUST.has(nome)) out.push(n);
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Os ARGUMENTOS top-level de uma macro, como TEXTO-FONTE — o extrator já os
 * emite como nós sintéticos `MacroArg` (`extract_ast.mjs`, ramo
 * `macro_invocation`), então aqui é só LEITURA: `assert_eq!(dobro(2, -3), 4)`
 * rende `['dobro(2, -3)', '4']`, na ordem.
 */
export function argumentosDoTokenTree(macro: LangNode): string[] {
  return macro.children
    .filter((c) => c.type === 'MacroArg' && c.synthetic)
    .map((c) => c.attributes.argText ?? '')
    .filter((t) => t !== '');
}

/** O nome chamado no primeiro argumento de um assert (`dobro(2)` → `dobro`). */
export function funcaoDoPrimeiroArgRust(argumentos: string[]): string | null {
  const primeiro = argumentos[0];
  if (primeiro === undefined) return null;
  const m = /^([a-zA-Z_][A-Za-z0-9_]*)\s*::\s*([a-zA-Z_][A-Za-z0-9_]*)\s*\(/.exec(primeiro);
  if (m) return m[2];
  const simples = /^([a-zA-Z_][A-Za-z0-9_]*)\s*\(/.exec(primeiro);
  if (simples) return simples[1];
  const caminho = /^([a-zA-Z_][A-Za-z0-9_]*)/.exec(primeiro);
  return caminho ? caminho[1] : null;
}

/** "A função X deve devolver Y…" de `assert_eq!` — null fora da forma. */
function descreverIgualdadeRust(
  nome: string,
  alvo: string,
  argumentos: readonly string[],
): string | null {
  if (nome !== 'assert_eq!' || argumentos.length < 2) return null;
  const esperado = argumentos[1];
  const funcao = funcaoDoPrimeiroArgRust([...argumentos]);
  if (funcao !== null) {
    const m = /^[a-zA-Z_][A-Za-z0-9_]*(?:::[a-zA-Z_][A-Za-z0-9_]*)?\s*\((.*)\)\s*$/.exec(alvo);
    const args = m !== null ? m[1].trim() : '';
    return args.length > 0
      ? `A função ${funcao} deve devolver ${esperado} quando chamada com ${args}.`
      : `A função ${funcao} deve devolver ${esperado}.`;
  }
  return `O teste exige que ${alvo} seja igual a ${esperado}.`;
}

export function descreverAssertRust(macro: LangNode): string {
  const nome = macro.attributes.name !== undefined ? `${macro.attributes.name}!` : '';
  const argumentos = argumentosDoTokenTree(macro);
  if (argumentos.length === 0) return `O teste exige: ${macro.text.slice(0, 100)}.`;
  const alvo = argumentos[0];

  const igualdade = descreverIgualdadeRust(nome, alvo, argumentos);
  if (igualdade !== null) return igualdade;
  if (nome === 'assert_ne!' && argumentos.length >= 2) {
    return `O teste exige que ${alvo} NÃO seja ${argumentos[1]}.`;
  }
  if (nome === 'assert!') {
    return `O teste exige que ${alvo} seja verdadeiro.`;
  }
  return `O teste exige: ${macro.text.slice(0, 100)}.`;
}

/** Nomes de função chamados nos asserts de um teste. */
export function funcoesChamadasNoTesteRust(corpo: LangNode): string[] {
  const nomes = new Set<string>();
  for (const a of assertsDentroDeRust(corpo)) {
    const f = funcaoDoPrimeiroArgRust(argumentosDoTokenTree(a));
    if (f !== null) nomes.add(f);
  }
  return [...nomes];
}

/** Os nomes que o teste importa do CRATE DO ALUNO (`use desafio::…`). */
export function funcoesImportadasDaSolucaoRust(root: LangNode): Set<string> {
  const out = new Set<string>();
  caminharRust(root, (n) => {
    if (n.type !== 'UseDeclaration') return;
    if (n.attributes.useRoot !== RS_CRATE_NAME) return;
    for (const nome of (n.attributes.imports ?? '').split(',')) {
      if (nome !== '' && nome !== 'self') out.add(nome);
    }
  });
  return out;
}

/** Átomos do trecho da solução de Rust que declara as funções chamadas. */
export function atomsDasFuncoesNaSolucaoRust(solutionCode: string, funcoes: string[]): AtomKey[] {
  if (funcoes.length === 0) return [];
  const alvo = new Set(funcoes);

  const extraido = extractAllOccurrences(solutionCode, {
    fileName: RS_ENTRY_PATH,
    language: RS_LANGUAGE,
  });
  if (!extraido.ok) return [];

  const parsed = getAdapter(RS_LANGUAGE).parse(solutionCode, { fileName: RS_ENTRY_PATH });
  if (!parsed.ok) return [];

  const spans: Array<{ start: number; end: number }> = [];
  caminharRust(parsed.root, (n) => {
    if (n.type !== 'FunctionItem') return;
    if (n.attributes.name !== undefined && alvo.has(n.attributes.name)) {
      spans.push({ start: n.start, end: n.end });
    }
  });
  if (spans.length === 0) return [];

  const chaves = new Set<AtomKey>();
  for (const occ of extraido.occurrences) {
    if (spans.some((s) => occ.start >= s.start && occ.end <= s.end)) chaves.add(occ.key);
  }
  return [...chaves].sort();
}

/** Átomos do trecho do assert (fallback declarado, igual ao lado Python). */
export function atomsDoTrechoDoAssertRust(trecho: string): AtomKey[] {
  if (trecho.trim() === '') return [];
  const extraido = extractAtoms(trecho, {
    fileName: 'assert.rs',
    language: RS_LANGUAGE,
  });
  return extraido.ok ? extraido.keys : [];
}

/** RUST: deriva requirements do arquivo de teste — um por `#[test] fn`. */
export function derivarRequirementsRust(
  testsCode: string,
  solutionCode: string,
  _starterCode: string,
): RequirementsDerivados {
  const root = parseSourceRust(testsCode, RS_TEST_PATH);
  const importadas = funcoesImportadasDaSolucaoRust(root);
  const testes = coletarTestesRust(root);

  const requirements: Requirement[] = [];
  const cobertura: RequirementCobertura[] = [];

  testes.forEach((t, index) => {
    const id = `REQ-${index + 1}`;
    const asserts = assertsDentroDeRust(t.corpo);
    const descricoes = asserts.map((a) => descreverAssertRust(a));
    const descricao =
      descricoes.length > 0 ? descricoes.join(' E ') : `O teste '${t.nome}' não contém asserts.`;
    requirements.push({ id, descricao, teste: t.nome });

    // Só as funções que vêm DA SOLUÇÃO — um helper local do teste não é o
    // que o aluno precisa escrever (o mesmo filtro do lado Python).
    const funcoes = funcoesChamadasNoTesteRust(t.corpo).filter((f) => importadas.has(f));
    let atoms = atomsDasFuncoesNaSolucaoRust(solutionCode, funcoes);
    if (atoms.length === 0) {
      atoms = atomsDoTrechoDoAssertRust(
        asserts
          .map((a) => a.text)
          .join('\n'),
      );
    }
    cobertura.push({ requirementId: id, atoms });
  });

  return { requirements, cobertura };
}

/** RUST: a bijeção requirements declarados × `#[test] fn` (nome da função). */
export function validarRequirementsRust(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
): ValidacaoRequirements {
  const root = parseSourceRust(testsCode, RS_TEST_PATH);
  return casarBijecao(
    coletarTestesRust(root).map((t) => t.nome),
    requirementsDeclarados,
  );
}
