/**
 * app/electron/main/engine/quality/requirementsTipos.ts — o contrato público
 * da derivação de requirements, o erro fail-closed de parse e a BIJEÇÃO
 * declarados × testes escrita uma vez para todas as linguagens.
 *
 * A prosa normativa vive na fachada `requirements.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import type { AtomKey } from '../atomKeys';
import { exigirAdaptadorJavascript } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';

export interface Requirement {
  /** `REQ-<n>` na ordem dos test() do arquivo — determinístico. */
  id: string;
  /** descrição em pt-BR derivada do texto REAL do assert. */
  descricao: string;
  /** nome do `test('…')` de onde o requirement veio. */
  teste: string;
}

export interface RequirementCobertura {
  requirementId: string;
  /** átomos que o aluno precisa escrever para satisfazer o requirement. */
  atoms: AtomKey[];
}

export interface RequirementsDerivados {
  requirements: Requirement[];
  cobertura: RequirementCobertura[];
}

export interface RequirementDeclarado {
  id: string;
  descricao?: string;
  /** nome do teste (campo `teste` do challenge.json). */
  teste: string;
}

export interface CorrespondenciaRequirement {
  requirementId: string;
  testName: string;
}

export interface ValidacaoRequirements {
  /** true ⇔ semTeste vazio E testesSemRequirement vazio (bijeção completa). */
  ok: boolean;
  /** ids declarados sem `test('…')` correspondente no testsCode. */
  semTeste: string[];
  /** nomes de `test('…')` sem requirement declarado correspondente. */
  testesSemRequirement: string[];
  /** pares (requirement declarado × teste) casados por nome. */
  correspondencias: CorrespondenciaRequirement[];
}

// ---------------------------------------------------------------------------
// Parse (fail-closed: erro é exceção, nunca silêncio)
// ---------------------------------------------------------------------------

export const ASSERTS_DE_COMPARACAO: ReadonlySet<string> = new Set([
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
]);

export class RequirementsParseError extends Error {
  constructor(message: string) {
    super(`requirements: testsCode não parseia — ${message}`);
    this.name = 'RequirementsParseError';
  }
}

/** GUARDA de linguagem da derivação de JavaScript (ver o cabeçalho). */
export function exigirJs(fn: string, language: LanguageId): void {
  exigirAdaptadorJavascript(
    `engine/quality/requirements.ts (${fn})`,
    "a derivação reconhece a forma test('nome', …) + assert.* do node:test sobre o AST do TypeScript; outra linguagem tem outra estrutura de teste, não outro parâmetro",
    language ?? DEFAULT_ADAPTER_ID,
  );
}

/** Normalização do nome para a bijeção: trim + colapsa espaços em branco. */
export function normalizarNome(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ');
}

/**
 * A BIJEÇÃO, escrita UMA vez para todas as linguagens: o que muda entre elas é
 * COMO se descobre a lista de nomes de teste, nunca como ela se casa com o que
 * o `challenge.json` declara.
 */
export function casarBijecao(
  nomesDeTestes: string[],
  requirementsDeclarados: RequirementDeclarado[],
): ValidacaoRequirements {
  const normTestes = new Map<string, string>(); // nomeNormalizado → nome real
  for (const nome of nomesDeTestes) normTestes.set(normalizarNome(nome), nome);

  const semTeste: string[] = [];
  const correspondencias: CorrespondenciaRequirement[] = [];

  for (const req of requirementsDeclarados) {
    const norm = normalizarNome(req.teste ?? '');
    const real = normTestes.get(norm);
    if (real === undefined) {
      semTeste.push(req.id);
    } else {
      correspondencias.push({ requirementId: req.id, testName: real });
    }
  }

  const casados = new Set(correspondencias.map((c) => normalizarNome(c.testName)));
  const testesSemRequirement = nomesDeTestes.filter((nome) => !casados.has(normalizarNome(nome)));

  return {
    ok: semTeste.length === 0 && testesSemRequirement.length === 0,
    semTeste,
    testesSemRequirement,
    correspondencias,
  };
}
