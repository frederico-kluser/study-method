/**
 * app/electron/main/engine/quality/requirementsC.ts — a derivação de
 * requirements de C: blocos `SM_TEST(<slug>)` + helpers `checa_*` do
 * counter_protocol sobre o AST do adaptador C.
 *
 * A prosa normativa (incluindo "A DERIVAÇÃO DE C") vive na fachada
 * `requirements.ts`. Refatoração L04: arquivo ≤500 linhas e toda função com
 * CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import { extractAllOccurrences } from '../extract';
import { C_ENTRY_PATH, C_TEST_PATH, SM_COUNT_PREABULO } from '../lang/c';
import { getAdapter, type LanguageId, type LangNode } from '../lang/registry';
import {
  RequirementsParseError,
  casarBijecao,
  type Requirement,
  type RequirementCobertura,
  type RequirementDeclarado,
  type RequirementsDerivados,
  type ValidacaoRequirements,
} from './requirementsTipos';

/** Os helpers de verificação do counter_protocol (03-tdd §3.9.3) — os MESMOS
 * nomes que `SM_HARNESS_HEADER` define e `SM_COUNT_PREABULO` prototipa. */
export const CHECAS_C: ReadonlySet<string> = new Set([
  'checa_int',
  'checa_long',
  'checa_double',
  'checa_char',
  'checa_str',
]);

/** A expansão de `SM_TEST(slug)` define `test_<slug>` (e `sm_reg_<slug>`,
 * construtor — excluído por não começar com este prefixo). */
export const PREFIXO_TESTE_C = 'test_';

/** Parseia o testsCode de C com a ante-sala da macro; falha é exceção. */
export function parseSourceC(code: string, fileName: string, language: LanguageId): LangNode {
  const parsed = getAdapter(language).parse(`${SM_COUNT_PREABULO}\n${code}`, { fileName });
  if (!parsed.ok) {
    throw new RequirementsParseError(
      `${parsed.error.code} em ${parsed.error.line}:${parsed.error.column}: ${parsed.error.message}`,
    );
  }
  return parsed.root;
}

/** Caminha a árvore do adaptador C aplicando `fn` a cada nó (pré-ordem). */
export function caminharC(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminharC(filho, fn);
}

/**
 * Um cenário de teste C: a DEFINIÇÃO `test_<slug>` (com corpo).
 *
 * A expansão da macro emite a decl e a def como DOIS nós — a MESMA regra que
 * `cCountDeclared` aplica para não dobrar a contagem; dedupe por slug e fica
 * a definição. O nome para a bijeção é o SLUG (sem o prefixo `test_`).
 */
export interface TesteNodeC {
  slug: string;
  corpo: LangNode;
}

/** Blocos `SM_TEST(<slug>)` — definições `test_*` com corpo, na ordem do fonte. */
export function coletarTestesC(root: LangNode): TesteNodeC[] {
  const porSlug = new Map<string, TesteNodeC>();
  caminharC(root, (n) => {
    if (n.type !== 'FunctionDecl') return;
    const nome = n.attributes.name;
    if (nome === undefined || !nome.startsWith(PREFIXO_TESTE_C)) return;
    const corpo = n.children.find((f) => f.type === 'CompoundStmt');
    if (corpo === undefined) return; // protótipo da expansão — a def é outro nó
    const slug = nome.slice(PREFIXO_TESTE_C.length);
    const anterior = porSlug.get(slug);
    if (anterior === undefined || n.start >= anterior.corpo.start) {
      porSlug.set(slug, { slug, corpo: n });
    }
  });
  return [...porSlug.values()].sort((a, b) => a.corpo.start - b.corpo.start);
}

/**
 * O nome do callee de uma chamada C: `checa_int(…)` → `checa_int`;
 * `dobro(2)` → `dobro`. O callee de C é o PRIMEIRO filho `DeclRefExpr` (os
 * portadores sintéticos — `ApiRef`/`IndirectCall` — são anexados ao FIM).
 */
export function nomeDoCalleeC(call: LangNode): string | null {
  const callee = call.children[0];
  if (callee === undefined || callee.type !== 'DeclRefExpr') return null;
  return callee.attributes.name ?? null;
}

/** É chamada a um helper `checa_*` do counter_protocol? Devolve o nome. */
export function checaC(call: LangNode): string | null {
  const nome = nomeDoCalleeC(call);
  return nome !== null && CHECAS_C.has(nome) ? nome : null;
}

/** Os argumentos de uma chamada C, na ordem — sem os portadores sintéticos. */
export function argumentosC(call: LangNode): LangNode[] {
  return call.children.slice(1).filter((c) => c.synthetic !== true);
}

/** As verificações `checa_*` dentro de um nó, em ordem de fonte. */
export function checasDentroDeC(node: LangNode): LangNode[] {
  const out: LangNode[] = [];
  caminharC(node, (n) => {
    if (n.type !== 'CallExpr') return;
    if (checaC(n) !== null) out.push(n);
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Descrição em pt-BR de UMA verificação `checa_*(cenario, obtido, esperado,
 * porque)`, derivada do TEXTO REAL — a MESMA fórmula dos lados JavaScript e
 * Python: a chamada à função do aluno no argumento `obtido` vira "A função X
 * deve devolver Y quando chamada com Z"; o que não é chamada vira a igualdade
 * literal.
 */
export function descreverAssertC(call: LangNode): string {
  if (checaC(call) === null) return `O teste exige: ${call.text.slice(0, 100)}.`;

  const args = argumentosC(call);
  const obtido = args[1];
  const esperado = args[2];

  if (obtido === undefined) return `O teste exige: ${call.text.slice(0, 100)}.`;

  if (obtido.type === 'CallExpr') {
    const fnTexto = nomeDoCalleeC(obtido) ?? obtido.text;
    const argsTexto = argumentosC(obtido)
      .map((a) => a.text)
      .join(', ');
    const esperadoTexto = esperado !== undefined ? esperado.text : 'o resultado esperado';
    return argsTexto.length > 0
      ? `A função ${fnTexto} deve devolver ${esperadoTexto} quando chamada com ${argsTexto}.`
      : `A função ${fnTexto} deve devolver ${esperadoTexto}.`;
  }

  if (esperado !== undefined) {
    return `O teste exige que ${obtido.text} seja igual a ${esperado.text}.`;
  }
  return `O teste exige: ${call.text.slice(0, 100)}.`;
}

/** As funções chamadas dentro das verificações do cenário (exceto `checa_*`). */
export function funcoesChamadasNoTesteC(corpo: LangNode): string[] {
  const nomes = new Set<string>();
  for (const checa of checasDentroDeC(corpo)) {
    caminharC(checa, (n) => {
      if (n.type !== 'CallExpr') return;
      const nome = nomeDoCalleeC(n);
      if (nome !== null && !CHECAS_C.has(nome)) nomes.add(nome);
    });
  }
  return [...nomes];
}

/** Átomos do trecho da SOLUÇÃO de C que define as funções chamadas. */
export function atomsDasFuncoesNaSolucaoC(
  solutionCode: string,
  funcoes: string[],
  language: LanguageId,
): AtomKey[] {
  if (funcoes.length === 0) return [];
  const alvo = new Set(funcoes);

  const extraido = extractAllOccurrences(solutionCode, {
    fileName: C_ENTRY_PATH,
    language,
  });
  if (!extraido.ok) return [];

  const parsed = getAdapter(language).parse(solutionCode, { fileName: C_ENTRY_PATH });
  if (!parsed.ok) return [];

  // Só DEFINIÇÃO (com corpo) conta — o protótipo que o próprio testsCode
  // declara não é o que o aluno escreve.
  const spans: Array<{ start: number; end: number }> = [];
  caminharC(parsed.root, (n) => {
    if (n.type !== 'FunctionDecl') return;
    const nome = n.attributes.name;
    if (nome === undefined || !alvo.has(nome)) return;
    if (n.children.some((f) => f.type === 'CompoundStmt')) {
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

/**
 * C: deriva requirements do arquivo de teste — um por bloco `SM_TEST(<slug>)`,
 * com descrição em pt-BR derivada das verificações `checa_*` REAIS. Lança
 * `RequirementsParseError` se o teste não parseia como C (fail-closed — nunca
 * um conjunto vazio silencioso).
 */
export function derivarRequirementsC(
  testsCode: string,
  solutionCode: string,
  _starterCode: string,
  language: LanguageId,
): RequirementsDerivados {
  const root = parseSourceC(testsCode, C_TEST_PATH, language);
  const testes = coletarTestesC(root);

  const requirements: Requirement[] = [];
  const cobertura: RequirementCobertura[] = [];

  testes.forEach((t, index) => {
    const id = `REQ-${index + 1}`;
    const checas = checasDentroDeC(t.corpo);
    const descricoes = checas.map(descreverAssertC);
    const descricao =
      descricoes.length > 0
        ? descricoes.join(' E ')
        : `O teste '${t.slug}' não contém verificações.`;
    requirements.push({ id, descricao, teste: t.slug });

    const atoms = atomsDasFuncoesNaSolucaoC(
      solutionCode,
      funcoesChamadasNoTesteC(t.corpo),
      language,
    );
    cobertura.push({ requirementId: id, atoms });
  });

  return { requirements, cobertura };
}

/** C: a bijeção requirements declarados × blocos `SM_TEST(<slug>)` (o slug). */
export function validarRequirementsC(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId,
): ValidacaoRequirements {
  const root = parseSourceC(testsCode, C_TEST_PATH, language);
  return casarBijecao(
    coletarTestesC(root).map((t) => t.slug),
    requirementsDeclarados,
  );
}
