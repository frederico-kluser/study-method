/**
 * app/electron/main/engine/quality/requirements.ts — DERIVAÇÃO DETERMINÍSTICA
 * de requirements a partir do teste (zero LLM).
 *
 * O dono quer comparar "o que o teste realmente cobra" com "o que a aula
 * oferece" para decidir se a aula precisa ser mais quebrada. Este arquivo é o
 * lado "requirement" dessa conta: para CADA `test('nome', …)` do node:test,
 * extrai os asserts dentro e gera um requirement estruturado
 * `{ id, descricao, teste }` — a descrição em pt-BR DERIVADA do texto real do
 * assert ("a função X deve devolver Y quando chamada com Z"), nunca inventada.
 *
 * Além de derivar, este arquivo VALIDA a bijeção requirements × testes:
 * todo requirement declarado (campo `requirements` do challenge.json) precisa
 * ter um `test('…')` correspondente, e todo `test('…')` precisa ter um
 * requirement declarado. O gap é determinístico — exatamente o que o CLI
 * `requirements` reporta como violação de conteúdo.
 *
 * FAIL-CLOSED: teste que não parseia é erro (lança) — nunca um conjunto vazio
 * silencioso que faria o gate passar por ignorância.
 *
 * LIMITE DECLARADO: `cobertura[].atoms` são os átomos das FUNÇÕES da solução
 * de referência chamadas pelos asserts daquele requirement (o que o aluno
 * precisa ESCREVER para satisfazê-lo). Se a solução não parseia ou a função
 * não é encontrada, cai para os átomos do trecho do assert (o que o teste
 * EXERCE) — determinístico nos dois casos.
 *
 * ─── JAVASCRIPT-ONLY, E ISSO É DECISÃO (onda 5) ───────────────────────────
 *
 * A derivação lê o teste com `ts.createSourceFile` e reconhece a forma
 * `test('nome', …)` + `assert.*(…)` do `node:test`; a descrição em pt-BR é
 * montada a partir do TEXTO dos nós do AST do TypeScript. Em `unittest` o
 * mesmo papel é um método `def test_…(self)` dentro de uma classe, com
 * `self.assertEqual` — outra estrutura, não outro parâmetro.
 *
 * O modo de falha que a guarda evita é o SILENCIOSO: um arquivo de teste de
 * outra linguagem que por acaso parseie produziria ZERO testes reconhecidos, e
 * `validarRequirements` reportaria "todo requirement declarado está sem teste"
 * — uma violação de CONTEÚDO inventada por defeito de FERRAMENTA. Por isso as
 * duas entradas públicas LANÇAM `EngineLinguagemError` estruturado.
 */

import * as ts from 'typescript';

import type { AtomKey } from '../atomKeys';
import { exigirAdaptadorJavascript, extractAllOccurrences } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';

/** GUARDA de linguagem das duas entradas públicas (ver o cabeçalho). */
function exigirJs(fn: string, language: LanguageId): void {
  exigirAdaptadorJavascript(
    `engine/quality/requirements.ts (${fn})`,
    "a derivação reconhece a forma test('nome', …) + assert.* do node:test sobre o AST do TypeScript; outra linguagem tem outra estrutura de teste, não outro parâmetro",
    language,
  );
}

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

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

const ASSERTS_DE_COMPARACAO: ReadonlySet<string> = new Set([
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
]);

class RequirementsParseError extends Error {
  constructor(message: string) {
    super(`requirements: testsCode não parseia — ${message}`);
    this.name = 'RequirementsParseError';
  }
}

function parseSource(code: string, fileName: string): ts.SourceFile {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const holder = source as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] };
  const diagnostics = holder.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const primeiro = diagnostics[0];
    throw new RequirementsParseError(
      ts.flattenDiagnosticMessageText(primeiro.messageText, ' '),
    );
  }
  return source;
}

function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function isAssertCall(node: ts.CallExpression): boolean {
  const nome = calleeName(node);
  return nome !== null && (ASSERTS_DE_COMPARACAO.has(nome) || nome === 'ok' || nome === 'throws');
}

/** Declarações `test('nome', fn)` — inclui test.skip/test.only (callee prop). */
interface TesteNode {
  nome: string;
  fn: ts.Node | null;
}

function coletarTestes(source: ts.SourceFile): TesteNode[] {
  const testes: TesteNode[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const ehTest =
        (ts.isIdentifier(callee) && callee.text === 'test') ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'test' &&
          (callee.name.text === 'skip' || callee.name.text === 'only' || callee.name.text === 'todo'));
      if (ehTest && node.arguments.length >= 1 && ts.isStringLiteral(node.arguments[0])) {
        const fn = node.arguments[1] ?? null;
        testes.push({ nome: node.arguments[0].text, fn });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return testes;
}

// ---------------------------------------------------------------------------
// Descrições determinísticas em pt-BR (sempre com o TEXTO REAL extraído)
// ---------------------------------------------------------------------------

function textoDosArgumentos(args: ts.NodeArray<ts.Expression>, source: ts.SourceFile): string {
  return args.map((a) => a.getText(source)).join(', ');
}

/** Remove um `await` externo (assert.equal(await f(), x) → a chamada f()). */
function despelotarAwait(node: ts.Expression): ts.Expression {
  if (ts.isAwaitExpression(node)) return node.expression;
  return node;
}

function descreverAssert(call: ts.CallExpression, source: ts.SourceFile): string {
  const nome = calleeName(call);
  if (nome === null) return `O teste exige: ${call.getText(source).slice(0, 100)}.`;

  const arg0 = call.arguments[0] ? despelotarAwait(call.arguments[0]) : undefined;
  const arg1 = call.arguments[1];

  if (ASSERTS_DE_COMPARACAO.has(nome) && arg0 && ts.isCallExpression(arg0)) {
    const fn = calleeName(arg0);
    const fnTexto = fn ?? arg0.expression.getText(source);
    const argsTexto = textoDosArgumentos(arg0.arguments, source);
    if (arg1 && (ts.isNumericLiteral(arg1) || ts.isStringLiteral(arg1) || ts.isIdentifier(arg1) || arg1.kind === ts.SyntaxKind.TrueKeyword || arg1.kind === ts.SyntaxKind.FalseKeyword)) {
      const esperado = arg1.getText(source);
      return argsTexto.length > 0
        ? `A função ${fnTexto} deve devolver ${esperado} quando chamada com ${argsTexto}.`
        : `A função ${fnTexto} deve devolver ${esperado}.`;
    }
    return argsTexto.length > 0
      ? `A função ${fnTexto} deve devolver o resultado esperado quando chamada com ${argsTexto}.`
      : `A função ${fnTexto} deve devolver o resultado esperado.`;
  }

  if (nome === 'throws' && arg0) {
    let fnTexto = '';
    let argsTexto = '';
    if (ts.isArrowFunction(arg0) && ts.isCallExpression(arg0.body)) {
      fnTexto = calleeName(arg0.body) ?? arg0.body.expression.getText(source);
      argsTexto = textoDosArgumentos(arg0.body.arguments, source);
    } else if (ts.isCallExpression(arg0)) {
      fnTexto = calleeName(arg0) ?? arg0.expression.getText(source);
      argsTexto = textoDosArgumentos(arg0.arguments, source);
    }
    if (fnTexto) {
      return argsTexto.length > 0
        ? `A função ${fnTexto} deve lançar um erro quando chamada com ${argsTexto}.`
        : `A função ${fnTexto} deve lançar um erro.`;
    }
    return `O teste exige que a chamada lance um erro (${arg0.getText(source).slice(0, 60)}).`;
  }

  if (nome === 'ok' && arg0) {
    return `O teste exige que ${arg0.getText(source)} seja verdadeiro.`;
  }

  return `O teste exige: ${call.getText(source).slice(0, 100)}.`;
}

// ---------------------------------------------------------------------------
// Cobertura: átomos das funções da solução chamadas pelos asserts
// ---------------------------------------------------------------------------

/** Nomes de função chamados dentro do callback de um teste. */
function funcoesChamadasNoTeste(fnNode: ts.Node | null): string[] {
  if (!fnNode) return [];
  const nomes = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isAssertCall(node)) {
      const arg0 = node.arguments[0] ? despelotarAwait(node.arguments[0]) : null;
      if (arg0 && ts.isCallExpression(arg0)) {
        const n = calleeName(arg0);
        if (n) nomes.add(n);
      } else if (arg0 && ts.isArrowFunction(arg0) && ts.isCallExpression(arg0.body)) {
        const n = calleeName(arg0.body);
        if (n) nomes.add(n);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fnNode, visit);
  return [...nomes];
}

/** Átomos do trecho da solução correspondente às funções chamadas. */
function atomsDasFuncoesNaSolucao(solutionCode: string, funcoes: string[]): AtomKey[] {
  if (funcoes.length === 0) return [];
  const alvo = new Set(funcoes);

  const extraido = extractAllOccurrences(solutionCode, { fileName: 'solution.mjs' });
  if (!extraido.ok) return [];

  const source = ts.createSourceFile('solution.mjs', solutionCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const spans: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && alvo.has(node.name.text)) {
      spans.push({ start: node.getStart(source), end: node.getEnd() });
    } else if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      if (
        decl &&
        ts.isIdentifier(decl.name) &&
        alvo.has(decl.name.text) &&
        decl.initializer &&
        (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
      ) {
        spans.push({ start: node.getStart(source), end: node.getEnd() });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  if (spans.length === 0) return [];
  const chaves = new Set<AtomKey>();
  for (const occ of extraido.occurrences) {
    if (spans.some((s) => occ.start >= s.start && occ.end <= s.end)) chaves.add(occ.key);
  }
  return [...chaves].sort();
}

/** Átomos do trecho do assert (fallback quando a solução não cobre). */
function atomsDoTrechoDoAssert(trecho: string): AtomKey[] {
  const extraido = extractAllOccurrences(trecho, { fileName: 'assert.mjs' });
  return extraido.ok ? extraido.keys : [];
}

// ---------------------------------------------------------------------------
// Derivação e validação (determinísticas)
// ---------------------------------------------------------------------------

/**
 * Deriva requirements do arquivo de teste: um por `test('nome', …)`, com
 * descrição em pt-BR derivada dos asserts REAIS e cobertura com os átomos das
 * funções da solução chamadas. Lança `RequirementsParseError` se o teste não
 * parseia (fail-closed — nunca um conjunto vazio silencioso).
 */
export function derivarRequirements(
  testsCode: string,
  solutionCode: string,
  _starterCode: string,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): RequirementsDerivados {
  exigirJs('derivarRequirements', language);
  const source = parseSource(testsCode, 'tests.mjs');
  const testes = coletarTestes(source);

  const requirements: Requirement[] = [];
  const cobertura: RequirementCobertura[] = [];

  testes.forEach((t, index) => {
    const id = `REQ-${index + 1}`;
    const descricoes: string[] = [];
    const trechos: string[] = [];
    const fnDoTeste = t.fn;

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isAssertCall(node)) {
        descricoes.push(descreverAssert(node, source));
        trechos.push(node.getText(source));
      }
      ts.forEachChild(node, visit);
    };
    if (fnDoTeste) ts.forEachChild(fnDoTeste, visit);

    const descricao = descricoes.length > 0 ? descricoes.join(' E ') : `O teste '${t.nome}' não contém asserts.`;
    requirements.push({ id, descricao, teste: t.nome });

    const funcoes = funcoesChamadasNoTeste(fnDoTeste);
    let atoms = atomsDasFuncoesNaSolucao(solutionCode, funcoes);
    if (atoms.length === 0) {
      atoms = atomsDoTrechoDoAssert(trechos.join('\n'));
    }
    cobertura.push({ requirementId: id, atoms });
  });

  return { requirements, cobertura };
}

/** Normalização do nome para a bijeção: trim + colapsa espaços em branco. */
function normalizarNome(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ');
}

/**
 * Valida a BIJEÇÃO requirements declarados × test('…') do testsCode. Todo
 * requirement declarado precisa de um teste correspondente (por nome
 * normalizado) e todo teste precisa de um requirement declarado. Determinístico,
 * zero LLM. Lança `RequirementsParseError` se o teste não parseia.
 */
export function validarRequirements(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId = DEFAULT_ADAPTER_ID,
): ValidacaoRequirements {
  exigirJs('validarRequirements', language);
  const source = parseSource(testsCode, 'tests.mjs');
  const nomesDeTestes = coletarTestes(source).map((t) => t.nome);

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
