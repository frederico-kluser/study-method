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
 * ─── DUAS LINGUAGENS, DUAS DERIVAÇÕES, UM DESPACHANTE (onda 10) ───────────
 *
 * Até `main@26dbc19` este arquivo era JAVASCRIPT-ONLY, e o cabeçalho defendia
 * a decisão assim: "a derivação lê o teste com `ts.createSourceFile` e
 * reconhece `test('nome', …)` + `assert.*(…)` do `node:test`; em `unittest` o
 * mesmo papel é um método `def test_…(self)` dentro de uma classe, com
 * `self.assertEqual` — outra estrutura, não outro parâmetro". A frase continua
 * VERDADEIRA; o que estava errado era a conclusão de que a segunda estrutura
 * podia não existir.
 *
 * O DEFEITO MEDIDO que isto fecha (`main@26dbc19`, comando abaixo):
 *
 *     cd app && npx tsx tools/track-engine/cli.ts requirements python
 *     → 21/21 `[parse-falhou] … testsCode não parseia — '=' expected.`
 *       PLACAR: 21 desafios · 0 bijeção completa · 21 com gaps · exit 1
 *
 * A única trilha do produto é Python. O `requirements` REPROVAVA os 21
 * desafios dela — corretamente fechado (`docs/16` §9.3: reprovar é melhor que
 * aprovar por omissão), e ainda assim inútil: "21 com gaps · 0 requirements
 * sem teste · 0 testes sem requirement" não é uma medição de conteúdo, é o
 * parser de JavaScript batendo em `def`.
 *
 * A forma do conserto é a MESMA do `coverage` na onda anterior
 * (`quality/minimalPorLinguagem.ts`): uma TABELA EXPLÍCITA por linguagem,
 * fail-closed, sem segunda implementação de extração — `docs/16` §5.3, "se
 * dois estágios parseiam com opções diferentes, o gate vira loteria". As
 * tabelas de asserts do `unittest` NÃO são redigitadas aqui: vêm de
 * `quality/minimalPython.ts` (`ASSERTS_PY`, `ASSERTS_DE_COMPARACAO_PY`), que é
 * quem já as tinha.
 *
 *   javascript → `test('nome', …)` + `assert.*`   (AST do TypeScript)
 *   python     → `def test_…(self)` + `self.assert*` (AST do adaptador Python)
 *
 * Linguagem REGISTRADA mas sem derivação escrita (hoje `typescript`) continua
 * LANÇANDO `EngineLinguagemError`, e linguagem desconhecida continua lançando
 * `LanguageRegistryError` no `getAdapter`. O modo de falha que as duas guardas
 * evitam é o SILENCIOSO: um arquivo de teste que por acaso parseie no parser
 * errado produziria ZERO testes reconhecidos, e `validarRequirements`
 * reportaria "todo requirement declarado está sem teste" — uma violação de
 * CONTEÚDO inventada por defeito de FERRAMENTA.
 *
 * ─── O QUE A DERIVAÇÃO DE PYTHON NÃO FAZ, E POR QUÊ ───────────────────────
 *
 * Na forma `stdout` (a que os 21 desafios da trilha usam — o teste roda
 * `runpy.run_path("solucao.py")` e compara TUDO o que o programa imprimiu), a
 * `cobertura[].atoms` sai VAZIA, e isso é DECLARADO, não esquecido. O motivo é
 * o mesmo que `quality/minimalPython.ts:583-590` já escreveu para o seu
 * `atomsDoTeste`: o assert chama `rodar()`, um helper do PRÓPRIO arquivo de
 * teste, e os átomos dele (`io`, `contextlib`, `runpy`, `unittest`) são o
 * HARNESS — nunca o que o desafio cobra do aluno. Emitir o harness como se
 * fosse cobrança seria pior que emitir nada.
 *
 * Na forma `import` (`from solucao import somar`) a cobertura é a real: os
 * átomos do trecho da solução que declara as funções chamadas pelos asserts,
 * com o mesmo fallback do lado JavaScript.
 */

import * as ts from 'typescript';

import type { AtomKey } from '../atomKeys';
import { EngineLinguagemError, exigirAdaptadorJavascript, extractAllOccurrences, extractAtoms } from '../extract';
import { PY_ENTRY_PATH } from '../lang/python';
import { DEFAULT_ADAPTER_ID, getAdapter, type LangNode, type LanguageId } from '../lang/registry';
import {
  ASSERTS_DE_COMPARACAO_PY,
  ASSERTS_PY,
  MINIMAL_PYTHON_LANGUAGE,
  MODULO_DA_SOLUCAO,
  decodificarReprDeStringPython,
} from './minimalPython';

/** GUARDA de linguagem da derivação de JavaScript (ver o cabeçalho). */
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
 * JAVASCRIPT: deriva requirements do arquivo de teste — um por
 * `test('nome', …)`, com descrição em pt-BR derivada dos asserts REAIS e
 * cobertura com os átomos das funções da solução chamadas. Lança
 * `RequirementsParseError` se o teste não parseia (fail-closed — nunca um
 * conjunto vazio silencioso).
 */
function derivarRequirementsJs(
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
 * JAVASCRIPT: valida a BIJEÇÃO requirements declarados × `test('…')`. Todo
 * requirement declarado precisa de um teste correspondente (por nome
 * normalizado) e todo teste precisa de um requirement declarado. Determinístico,
 * zero LLM. Lança `RequirementsParseError` se o teste não parseia.
 */
function validarRequirementsJs(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId = DEFAULT_ADAPTER_ID,
): ValidacaoRequirements {
  exigirJs('validarRequirements', language);
  const source = parseSource(testsCode, 'tests.mjs');
  const nomesDeTestes = coletarTestes(source).map((t) => t.nome);
  return casarBijecao(nomesDeTestes, requirementsDeclarados);
}

/**
 * A BIJEÇÃO, escrita UMA vez para todas as linguagens: o que muda entre elas é
 * COMO se descobre a lista de nomes de teste, nunca como ela se casa com o que
 * o `challenge.json` declara.
 */
function casarBijecao(
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

// ---------------------------------------------------------------------------
// PYTHON — `def test_…(self)` + `self.assert*` do `unittest`
// ---------------------------------------------------------------------------

/**
 * O nome de um `Call` na árvore do adaptador Python:
 * `rodar()` → `rodar`; `self.assertEqual(…)` → `assertEqual`.
 *
 * MESMA regra do irmão `calleeName` do lado JavaScript. Duplicada aqui e não
 * importada de `minimalPython.ts` porque lá ela é privada; o que NÃO se
 * duplica são as TABELAS de asserts (elas vêm de lá por import).
 */
function nomeDoCalleePy(call: LangNode): string | null {
  const func = call.children.find((c) => c.attributes.field === 'func');
  if (func === undefined) return null;
  if (func.type === 'Name') return func.attributes.id ?? null;
  if (func.type === 'Attribute') return func.attributes.attr ?? null;
  return null;
}

/** Os argumentos POSICIONAIS de um `Call`, na ordem. */
function argumentosPosicionaisPy(call: LangNode): LangNode[] {
  return call.children.filter((c) => c.attributes.field === 'args');
}

/** Caminha a árvore normalizada aplicando `fn` a cada nó (pré-ordem). */
function caminharPy(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminharPy(filho, fn);
}

/** Parseia Python pelo ADAPTADOR; parse falhou é exceção (fail-closed). */
function parseSourcePython(code: string, fileName: string): LangNode {
  const parsed = getAdapter(MINIMAL_PYTHON_LANGUAGE).parse(code, { fileName });
  if (!parsed.ok) {
    throw new RequirementsParseError(
      `${parsed.error.code} em ${parsed.error.line}:${parsed.error.column}: ${parsed.error.message}`,
    );
  }
  return parsed.root;
}

/**
 * Um método de teste do `unittest`: `def test_…(self)`.
 *
 * O IDENTIFICADOR do teste é o NOME DO MÉTODO, não a docstring — é o que o
 * `unittest` imprime, o que um `challenge.json` pode citar sem ambiguidade e o
 * que não muda quando a prosa é reescrita. A docstring é prosa opcional e por
 * isso não entra na bijeção.
 */
interface TesteNodePy {
  nome: string;
  corpo: LangNode;
  start: number;
}

/** Métodos/funções cujo nome começa em `test` — a convenção do `unittest`. */
function coletarTestesPython(root: LangNode): TesteNodePy[] {
  const out: TesteNodePy[] = [];
  caminharPy(root, (n) => {
    if (n.type !== 'FunctionDef' && n.type !== 'AsyncFunctionDef') return;
    const nome = n.attributes.name;
    if (nome === undefined || !nome.startsWith('test')) return;
    out.push({ nome, corpo: n, start: n.start });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * FORMA `stdout`: o teste roda o arquivo do aluno inteiro
 * (`runpy.run_path("solucao.py")`) e compara o que ele imprimiu.
 *
 * A marca é a MESMA que `quality/minimalPython.ts:300-309` usa — e usa a mesma
 * decodificação de `repr()`, importada de lá, para não existir uma segunda
 * gramática de literal de string do Python neste repositório.
 */
function ehFormaStdoutPy(root: LangNode): boolean {
  let achou = false;
  caminharPy(root, (n) => {
    if (achou || n.type !== 'Call') return;
    if (nomeDoCalleePy(n) !== 'run_path') return;
    const primeiro = argumentosPosicionaisPy(n)[0];
    if (primeiro === undefined || primeiro.type !== 'StrLiteral') return;
    if (decodificarReprDeStringPython(primeiro.attributes.value ?? '') === PY_ENTRY_PATH) achou = true;
  });
  return achou;
}

/** As funções que o teste importa de `solucao` (forma `import`). */
function funcoesImportadasDaSolucaoPy(root: LangNode): Set<string> {
  const out = new Set<string>();
  caminharPy(root, (n) => {
    if (n.type !== 'ImportFrom' || n.attributes.module !== MODULO_DA_SOLUCAO) return;
    for (const alias of n.children) {
      if (alias.type === 'alias' && alias.attributes.name !== undefined) {
        out.add(alias.attributes.asname ?? alias.attributes.name);
      }
    }
  });
  return out;
}

/** Os asserts do `unittest` dentro de um nó, em ordem de fonte. */
function assertsDentroDePy(node: LangNode): LangNode[] {
  const out: LangNode[] = [];
  caminharPy(node, (n) => {
    if (n.type !== 'Call') return;
    const nome = nomeDoCalleePy(n);
    if (nome !== null && ASSERTS_PY.has(nome)) out.push(n);
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Descrição em pt-BR de UM assert do `unittest`, derivada do TEXTO REAL.
 *
 * Na forma `stdout` a frase é sobre o PROGRAMA, não sobre a função: o alvo do
 * assert é `rodar()`, um helper do próprio arquivo de teste, e dizer "a função
 * rodar deve devolver …" descreveria o harness em vez do que o desafio cobra.
 */
function descreverAssertPy(call: LangNode, formaStdout: boolean): string {
  const nome = nomeDoCalleePy(call);
  if (nome === null) return `O teste exige: ${call.text.slice(0, 100)}.`;

  const args = argumentosPosicionaisPy(call);
  const alvo = args[0];
  const esperado = ASSERTS_DE_COMPARACAO_PY.has(nome) ? args[1] : undefined;

  if (ASSERTS_DE_COMPARACAO_PY.has(nome) && alvo !== undefined) {
    if (formaStdout) {
      return esperado !== undefined
        ? `O programa deve imprimir exatamente ${esperado.text}.`
        : `O programa deve imprimir exatamente o que ${call.text.slice(0, 60)} compara.`;
    }
    if (alvo.type === 'Call') {
      const fnTexto = nomeDoCalleePy(alvo) ?? alvo.text;
      const argsTexto = argumentosPosicionaisPy(alvo)
        .map((a) => a.text)
        .join(', ');
      const esperadoTexto = esperado !== undefined ? esperado.text : 'o resultado esperado';
      return argsTexto.length > 0
        ? `A função ${fnTexto} deve devolver ${esperadoTexto} quando chamada com ${argsTexto}.`
        : `A função ${fnTexto} deve devolver ${esperadoTexto}.`;
    }
    return esperado !== undefined
      ? `O teste exige que ${alvo.text} seja igual a ${esperado.text}.`
      : `O teste exige: ${call.text.slice(0, 100)}.`;
  }

  if (alvo !== undefined) {
    if (nome === 'assertTrue') return `O teste exige que ${alvo.text} seja verdadeiro.`;
    if (nome === 'assertFalse') return `O teste exige que ${alvo.text} seja falso.`;
    if (nome === 'assertIsNone') return `O teste exige que ${alvo.text} seja None.`;
    if (nome === 'assertRaises') {
      return `O teste exige que a chamada lance ${alvo.text}.`;
    }
  }

  return `O teste exige: ${call.text.slice(0, 100)}.`;
}

/** Nomes de função chamados no PRIMEIRO argumento dos asserts do método. */
function funcoesChamadasNoTestePy(corpo: LangNode): string[] {
  const nomes = new Set<string>();
  for (const a of assertsDentroDePy(corpo)) {
    const alvo = argumentosPosicionaisPy(a)[0];
    if (alvo !== undefined && alvo.type === 'Call') {
      const n = nomeDoCalleePy(alvo);
      if (n !== null) nomes.add(n);
    }
  }
  return [...nomes];
}

/** Átomos do trecho da solução de Python que declara as funções chamadas. */
function atomsDasFuncoesNaSolucaoPy(solutionCode: string, funcoes: string[]): AtomKey[] {
  if (funcoes.length === 0) return [];
  const alvo = new Set(funcoes);

  const extraido = extractAllOccurrences(solutionCode, {
    fileName: PY_ENTRY_PATH,
    language: MINIMAL_PYTHON_LANGUAGE,
  });
  if (!extraido.ok) return [];

  const parsed = getAdapter(MINIMAL_PYTHON_LANGUAGE).parse(solutionCode, { fileName: PY_ENTRY_PATH });
  if (!parsed.ok) return [];

  const spans: Array<{ start: number; end: number }> = [];
  caminharPy(parsed.root, (n) => {
    if (n.type !== 'FunctionDef' && n.type !== 'AsyncFunctionDef') return;
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

/** Átomos do trecho do assert (fallback declarado, igual ao lado JavaScript). */
function atomsDoTrechoDoAssertPy(trecho: string): AtomKey[] {
  if (trecho.trim() === '') return [];
  const extraido = extractAtoms(trecho, {
    fileName: 'assert.py',
    language: MINIMAL_PYTHON_LANGUAGE,
  });
  return extraido.ok ? extraido.keys : [];
}

/**
 * PYTHON: deriva requirements do arquivo de teste — um por `def test_…`, com
 * descrição em pt-BR derivada dos asserts REAIS. Lança `RequirementsParseError`
 * se o teste não parseia como Python (fail-closed).
 *
 * `cobertura[].atoms` na forma `stdout` é VAZIA por decisão declarada (ver o
 * cabeçalho): o alvo do assert é o helper do próprio teste, e emitir os átomos
 * dele seria emitir o harness como se fosse cobrança.
 */
function derivarRequirementsPython(
  testsCode: string,
  solutionCode: string,
  _starterCode: string,
): RequirementsDerivados {
  const root = parseSourcePython(testsCode, 'tests/test_solucao.py');
  const formaStdout = ehFormaStdoutPy(root);
  const importadas = funcoesImportadasDaSolucaoPy(root);
  const testes = coletarTestesPython(root);

  const requirements: Requirement[] = [];
  const cobertura: RequirementCobertura[] = [];

  testes.forEach((t, index) => {
    const id = `REQ-${index + 1}`;
    const asserts = assertsDentroDePy(t.corpo);
    const descricoes = asserts.map((a) => descreverAssertPy(a, formaStdout));
    const descricao =
      descricoes.length > 0 ? descricoes.join(' E ') : `O teste '${t.nome}' não contém asserts.`;
    requirements.push({ id, descricao, teste: t.nome });

    let atoms: AtomKey[] = [];
    if (!formaStdout) {
      // Só as funções que vêm DA SOLUÇÃO — um helper local do teste não é o que
      // o aluno precisa escrever.
      const funcoes = funcoesChamadasNoTestePy(t.corpo).filter((f) => importadas.has(f));
      atoms = atomsDasFuncoesNaSolucaoPy(solutionCode, funcoes);
      if (atoms.length === 0) {
        atoms = atomsDoTrechoDoAssertPy(asserts.map((a) => a.text).join('\n'));
      }
    }
    cobertura.push({ requirementId: id, atoms });
  });

  return { requirements, cobertura };
}

/** PYTHON: a bijeção requirements declarados × `def test_…` (nome do método). */
function validarRequirementsPython(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
): ValidacaoRequirements {
  const root = parseSourcePython(testsCode, 'tests/test_solucao.py');
  return casarBijecao(
    coletarTestesPython(root).map((t) => t.nome),
    requirementsDeclarados,
  );
}

// ---------------------------------------------------------------------------
// O DESPACHANTE (a mesma forma de `quality/minimalPorLinguagem.ts`)
// ---------------------------------------------------------------------------

/** Quem deriva requirements de cada linguagem. */
type DerivadorDeRequirements = (
  testsCode: string,
  solutionCode: string,
  starterCode: string,
  language: LanguageId,
) => RequirementsDerivados;

/** Quem valida a bijeção de cada linguagem. */
type ValidadorDeRequirements = (
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId,
) => ValidacaoRequirements;

/**
 * A TABELA. Uma linha por linguagem que tem derivação ESCRITA — nunca derivada
 * do registro de adaptadores, porque ter adaptador (parser, layout, runner) não
 * é o mesmo que ter derivação de requirements.
 */
const DERIVACAO_POR_LINGUAGEM: Readonly<
  Record<string, { derivar: DerivadorDeRequirements; validar: ValidadorDeRequirements }>
> = {
  javascript: {
    derivar: (t, s, st, lang) => derivarRequirementsJs(t, s, st, lang),
    validar: (t, d, lang) => validarRequirementsJs(t, d, lang),
  },
  python: {
    derivar: (t, s, st) => derivarRequirementsPython(t, s, st),
    validar: (t, d) => validarRequirementsPython(t, d),
  },
};

/** As linguagens que TÊM derivação de requirements, em ordem estável. */
export const LINGUAGENS_COM_REQUIREMENTS: readonly LanguageId[] = Object.keys(
  DERIVACAO_POR_LINGUAGEM,
).sort() as LanguageId[];

/**
 * Resolve a derivação de uma linguagem. LANÇA `LanguageRegistryError` para id
 * desconhecido (no `getAdapter`) e `EngineLinguagemError` para linguagem
 * registrada cuja derivação ninguém escreveu.
 */
function exigirDerivacao(language: string): {
  derivar: DerivadorDeRequirements;
  validar: ValidadorDeRequirements;
} {
  const adapter = getAdapter(language);
  const par = DERIVACAO_POR_LINGUAGEM[adapter.id];
  if (par === undefined) {
    throw new EngineLinguagemError({
      modulo: 'engine/quality/requirements.ts',
      pedido: language,
      suportado: LINGUAGENS_COM_REQUIREMENTS,
      motivo:
        'a derivação LÊ a estrutura de teste da linguagem alvo (um `test(nome, …)` do node:test não ' +
        'é um `def test_…(self)` do unittest): acrescente a derivação e a linha correspondente nesta ' +
        'tabela — ler o teste com o parser de outra linguagem produziria ZERO testes reconhecidos e ' +
        'uma violação de CONTEÚDO inventada por defeito de FERRAMENTA',
    });
  }
  return par;
}

/**
 * Deriva requirements do arquivo de teste NA LINGUAGEM DO DESAFIO: um por
 * teste declarado, com descrição em pt-BR derivada dos asserts REAIS e a
 * cobertura de átomos que a linguagem consegue apurar.
 *
 * `language` ausente cai no adaptador default (`javascript`) — o contrato
 * histórico. Quem chama por uma trilha REAL deve passar `budget.adapterId`:
 * até `main@26dbc19` o CLI não passava, e os 21 desafios de Python saíam
 * `parse-falhou`.
 *
 * Lança `RequirementsParseError` se o teste não parseia (fail-closed — nunca um
 * conjunto vazio silencioso).
 */
export function derivarRequirements(
  testsCode: string,
  solutionCode: string,
  starterCode: string,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): RequirementsDerivados {
  return exigirDerivacao(language).derivar(testsCode, solutionCode, starterCode, language);
}

/**
 * Valida a BIJEÇÃO requirements declarados × testes do arquivo de teste NA
 * LINGUAGEM DO DESAFIO. Todo requirement declarado precisa de um teste
 * correspondente (por nome normalizado) e todo teste precisa de um requirement
 * declarado. Determinístico, zero LLM.
 *
 * Lança `RequirementsParseError` se o teste não parseia.
 */
export function validarRequirements(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId = DEFAULT_ADAPTER_ID,
): ValidacaoRequirements {
  return exigirDerivacao(language).validar(testsCode, requirementsDeclarados, language);
}
