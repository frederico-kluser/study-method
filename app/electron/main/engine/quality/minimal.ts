/**
 * app/electron/main/engine/quality/minimal.ts — o SINTETIZADOR DETERMINÍSTICO
 * de solução mínima (zero LLM).
 *
 * Problema real: o dono do produto quer saber O QUE o teste de um desafio
 * REALMENTE cobra — não o que a solução de referência faz, não o que a aula
 * diz que ensina, mas o MÍNIMO de código que passa no teste. Com isso em mãos
 * dá para decidir, por diferença de conjuntos, se a aula precisa ser mais
 * quebrada (o teste exige construção que a aula não oferece) ou se a aula
 * oferece mais do que o teste cobra.
 *
 * Este arquivo NÃO é um sintetizador de programas: é um sintetizador de
 * LITERAIS. Ele lê o teste (AST TypeScript), extrai os valores literais que o
 * teste compara com o retorno das funções, e gera candidatos de solução
 * mínima na ordem de minimalidade — o primeiro que passa nas QUATRO PROVAS
 * reais (`verifyChallengeProofs`, via o `ProverDeDesafio` injetado) vence.
 * Um teste cuja solução exige COMPUTAÇÃO (somar dois parâmetros, um loop, uma
 * atribuição com estado) NÃO tem candidato literal que passe — o veredito é
 * `SEM_SOLUCAO_ACESSIVEL`: o sinal exato que o dono quer ver ("o teste exige
 * mais que literais"), nunca um veredito falso.
 *
 * POR QUE NÃO O ALUNO SIMULADO (`solvable.ts`): aquele é o aluno LLM com
 * pass^k, NÃO determinístico por construção (o LLM é o ponto de variação).
 * Este módulo é o espelho DETERMINÍSTICO: mesmos testes, mesma solução
 * mínima, sempre. Onde o aluno simulado responde "o aluno consegue?", este
 * responde "qual é o menor código que o teste aceita?".
 *
 * FAIL-CLOSED (regra 1 do plano): nenhum caminho devolve veredito falso.
 *   - teste que não parseia        → `PARSE_FALHOU`
 *   - prover com falha de INFRA em TODAS as tentativas → `PROVER_FALHOU`
 *   - nenhum candidato passa       → `SEM_SOLUCAO_ACESSIVEL` (sinal de teste
 *     quebrado OU de solução que exige mais que literais — os dois são
 *     defeito/limite que o chamador precisa ver, não esconder)
 *   - nenhum candidato gerado      → `SEM_SOLUCAO_ACESSIVEL` (com detalhe)
 *
 * LIMITES DECLARADOS (determinismo acima de tudo):
 *   - a geração de candidatos é sobre a PRIMEIRA função-alvo no starter
 *     (ordem de aparição); desafios multi-função ficam para a poda da solução
 *     de referência (último recurso);
 *   - `atoms` é o que o aluno PRECISA escrever (o código mínimo); `atomsDoTeste`
 *     é o enriquecimento com os átomos do trecho do teste que chama a função —
 *     separados de propósito: a comparação com o orçamento da aula usa `atoms`.
 */

import * as ts from 'typescript';

import type { AtomKey } from '../atomKeys';
import { RUNTIME_GLOBALS, extractAtoms } from '../extract';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import type { ChallengeProofsVerdict } from '../exec/proofs';

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

export interface MinimalCtx {
  starterCode: string;
  solutionCode: string;
  testsCode: string;
  expectedTestCount: number;
}

export type MinimalVerdict =
  | {
      ok: true;
      /** o código mínimo (módulo ESM completo) que passou nas quatro provas. */
      minimalCode: string;
      /** o que o teste REALMENTE cobra — `extractAtoms(minimalCode).keys`. */
      atoms: AtomKey[];
      /** enriquecimento: átomos do trecho do teste que chama a função-alvo. */
      atomsDoTeste: AtomKey[];
      /** nº de linhas do código mínimo. */
      lines: number;
      /** sempre true por construção (o vencedor passou nas provas). */
      proofsValid: boolean;
    }
  | {
      ok: false;
      reason: 'SEM_SOLUCAO_ACESSIVEL' | 'PARSE_FALHOU' | 'PROVER_FALHOU';
      detail?: string;
    };

/**
 * Um assert extraído do teste. `esperado` é o texto SERIALIZADO do literal do
 * lado direito (`7`, `'oi'`, `[1, 2]`, `{ a: 1 }`) — null quando o lado direito
 * não é literal. `argumentos` carrega o texto serializado de cada argumento
 * literal da chamada (null quando o argumento não é literal).
 */
export interface LiteralExtraido {
  /** método do assert: equal | strictEqual | deepEqual | deepStrictEqual | ok | throws. */
  assert: string;
  /** nome da função chamada (callee identificador do primeiro argumento). */
  funcao: string | null;
  /** lado direito do assert, serializado — null quando não é literal. */
  esperado: string | null;
  /** argumentos literais da chamada, serializados (null = argumento não literal). */
  argumentos: Array<string | null>;
  /** texto cru do nó do assert (descrição determinística). */
  trecho: string;
}

export interface LiteraisDoTeste {
  /** funções que o teste importa do módulo do aluno (solution.mjs). */
  funcoesAlvo: string[];
  /** asserts do teste, na ordem de aparição. */
  literais: LiteralExtraido[];
}

export type ExtrairLiteraisResult =
  | { ok: true; dados: LiteraisDoTeste }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Parse e extração de literais (determinístico, AST TypeScript)
// ---------------------------------------------------------------------------

const ASSERTS_DE_COMPARACAO: ReadonlySet<string> = new Set([
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
]);

const ASSERTS_TODOS: ReadonlySet<string> = new Set([
  'equal',
  'strictEqual',
  'deepEqual',
  'deepStrictEqual',
  'ok',
  'throws',
]);

function parseSource(code: string, fileName: string): ts.SourceFile | null {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const holder = source as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] };
  const diagnostics = holder.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    return null;
  }
  return source;
}

/** É literal? Números, strings, booleanos, null e arrays/objetos de literais. */
function isLiteral(node: ts.Node): boolean {
  if (ts.isNumericLiteral(node) || ts.isStringLiteral(node)) return true;
  if (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((el) => !ts.isSpreadElement(el) && isLiteral(el));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (p) =>
        ts.isPropertyAssignment(p) &&
        (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name)) &&
        isLiteral(p.initializer),
    );
  }
  return false;
}

/** Nome do callee de uma chamada (`assert.equal` → `equal`; `resposta()` → `resposta`). */
function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

/** Nome da função chamada dentro do primeiro argumento de um assert. */
function funcaoChamadaNoArg(assertCall: ts.CallExpression): string | null {
  const arg = assertCall.arguments[0];
  if (!arg) return null;
  const despelotado = ts.isAwaitExpression(arg) ? arg.expression : arg;
  if (ts.isCallExpression(despelotado)) return calleeName(despelotado);
  if (ts.isArrowFunction(despelotado) && ts.isCallExpression(despelotado.body)) return calleeName(despelotado.body);
  return null;
}

/**
 * Extrai os literais dos asserts de um arquivo de teste. Deterministtico:
 * mesma entrada, mesma saída. Parse falhou → `{ ok: false, error }`.
 */
export function extrairLiteraisDoTeste(testsCode: string): ExtrairLiteraisResult {
  const source = parseSource(testsCode, 'tests.mjs');
  if (!source) {
    return { ok: false, error: 'testsCode não parseia como JavaScript' };
  }

  // Funções-alvo: imports nomeados do módulo da solução (especifier relativo
  // cujo basename começa com 'solution'). Sem import relativo → fallback: todo
  // callee identificador visto dentro de asserts de comparação.
  const funcoesAlvo = new Set<string>();
  const calleesDeAssert = new Set<string>();
  const literais: LiteralExtraido[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec) && spec.text.startsWith('.') && /\/?solution[^/]*$/.test(spec.text)) {
        const clause = node.importClause;
        if (clause) {
          if (clause.name) funcoesAlvo.add(clause.name.text);
          if (clause.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings)) {
              funcoesAlvo.add(clause.namedBindings.name.text);
            } else if (ts.isNamedImports(clause.namedBindings)) {
              for (const el of clause.namedBindings.elements) {
                funcoesAlvo.add(el.name.text);
                if (el.propertyName) funcoesAlvo.add(el.propertyName.text);
              }
            }
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const nome = calleeName(node);
      if (nome !== null && ASSERTS_TODOS.has(nome)) {
        const fn = funcaoChamadaNoArg(node);
        if (fn) calleesDeAssert.add(fn);

        const arg1 = node.arguments[0];
        let funcao: string | null = null;
        const argumentos: Array<string | null> = [];
        if (arg1) {
          const despelotado = ts.isAwaitExpression(arg1) ? arg1.expression : arg1;
          if (ts.isCallExpression(despelotado)) {
            funcao = calleeName(despelotado);
            for (const a of despelotado.arguments) {
              argumentos.push(isLiteral(a) ? a.getText(source) : null);
            }
          }
        }

        let esperado: string | null = null;
        const arg2 = node.arguments[1];
        if (arg2 && ASSERTS_DE_COMPARACAO.has(nome)) {
          esperado = isLiteral(arg2) ? arg2.getText(source) : null;
        }

        if (funcao || esperado !== null || nome === 'throws' || nome === 'ok') {
          literais.push({
            assert: nome,
            funcao,
            esperado,
            argumentos,
            trecho: node.getText(source).slice(0, 120),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  const alvo = funcoesAlvo.size > 0 ? [...funcoesAlvo].sort() : [...calleesDeAssert].sort();
  return { ok: true, dados: { funcoesAlvo: alvo, literais } };
}

// ---------------------------------------------------------------------------
// Geração de candidatos (pura, ordenada por minimalidade)
// ---------------------------------------------------------------------------

/** Estrutura mínima de uma função-alvo no starter (para edição determinística). */
interface FuncaoNoStarter {
  nome: string;
  /** span da declaração INTEIRA (para substituição/inserção de export). */
  declStart: number;
  declEnd: number;
  /** nó da declaração (FunctionDeclaration | VariableStatement | …). */
  decl: ts.Node;
  /** parâmetros reais (null quando a função não tem parâmetro identificável). */
  params: ts.NodeArray<ts.ParameterDeclaration> | null;
  /** span do CORPO (bloco) — null quando não há bloco. */
  corpo: { start: number; end: number } | null;
  /** a função tem modificador export (ou é `export const … = …`)? */
  ehExportada: boolean;
}

/**
 * Localiza as funções-alvo no starter. Suporta `export function nome(){}`,
 * `function nome(){}` e `export const nome = (…) => …` / `= function …`.
 */
function localizarFuncoesNoStarter(starter: string, funcoesAlvo: string[]): { source: ts.SourceFile; funcoes: FuncaoNoStarter[] } | null {
  const source = parseSource(starter, 'starter.mjs');
  if (!source) return null;
  const alvo = new Set(funcoesAlvo);
  const funcoes: FuncaoNoStarter[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && alvo.has(node.name.text)) {
      const corpo = node.body
        ? { start: node.body.getStart(source), end: node.body.getEnd() }
        : null;
      funcoes.push({
        nome: node.name.text,
        declStart: node.getStart(source),
        declEnd: node.getEnd(),
        decl: node,
        params: node.parameters,
        corpo,
        ehExportada: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false,
      });
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !alvo.has(d.name.text)) continue;
        const init = d.initializer;
        if (!init) continue;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          const corpo = init.body
            ? { start: init.body.getStart(source), end: init.body.getEnd() }
            : null;
          funcoes.push({
            nome: d.name.text,
            declStart: node.getStart(source),
            declEnd: node.getEnd(),
            decl: node,
            params: init.parameters,
            corpo: ts.isBlock(init.body) ? corpo : null,
            ehExportada: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  // ordem determinística: ordem de aparição no código.
  funcoes.sort((a, b) => a.declStart - b.declStart);
  return { source, funcoes };
}

/** true quando o identificador está em posição de VALOR (e não de nome/rótulo). */
function isEmPosicaoDeValor(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === node) return false;
  if (ts.isClassDeclaration(parent) && parent.name === node) return false;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  return true;
}

/** Nomes declarados no starter inteiro (params, locais, imports). */
function nomesDeclaradosNoArquivo(source: ts.SourceFile): Set<string> {
  const declarados = new Set<string>();
  const coletar = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarados.add(node.name.text);
    else if (ts.isFunctionDeclaration(node) && node.name) declarados.add(node.name.text);
    else if (ts.isClassDeclaration(node) && node.name) declarados.add(node.name.text);
    else if (ts.isParameter(node) && ts.isIdentifier(node.name)) declarados.add(node.name.text);
    else if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) {
      declarados.add(node.variableDeclaration.name.text);
    } else if (ts.isImportSpecifier(node)) declarados.add(node.name.text);
    ts.forEachChild(node, coletar);
  };
  ts.forEachChild(source, coletar);
  return declarados;
}

/**
 * Identificador livre do corpo: a referência a um nome NÃO declarado no
 * arquivo e NÃO global — quando houver EXATAMENTE um. É o que permite inferir
 * o nome do parâmetro quando o starter tem a lacuna na lista de parâmetros
 * (`export function eco(/* LACUNA *​/ ) { return x; }` → `x`).
 */
function inferirIdentificadorLivre(fn: FuncaoNoStarter, fonte: ts.SourceFile, starter: string): string | null {
  if (!fn.corpo) return null;
  const declarados = nomesDeclaradosNoArquivo(fonte);
  const corpoTexto = starter.slice(fn.corpo.start, fn.corpo.end);
  const corpoSource = ts.createSourceFile('corpo.mjs', corpoTexto, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const livres = new Set<string>();
  const visitar = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isEmPosicaoDeValor(node)) {
      if (!declarados.has(node.text) && !RUNTIME_GLOBALS.has(node.text)) livres.add(node.text);
    }
    ts.forEachChild(node, visitar);
  };
  ts.forEachChild(corpoSource, visitar);
  return livres.size === 1 ? [...livres][0] : null;
}

/** Remove comentários (de bloco e de linha) que estejam no NÍVEL SUPERIOR —
 * fora de qualquer declaração de função/classe/variável. Passo único sobre o
 * texto ORIGINAL: os offsets dos matches são os offsets originais, então a
 * decisão dentro/fora-de-declaração é exata antes de qualquer remoção.
 */
function removerComentariosTopo(starter: string, fonte: ts.SourceFile): string {
  const spansDecl = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) {
      spansDecl.add(`${node.getStart(fonte)}:${node.getEnd()}`);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fonte, visit);

  const dentroDeDecl = (pos: number): boolean => {
    for (const s of spansDecl) {
      const sep = s.indexOf(':');
      const a = Number(s.slice(0, sep));
      const b = Number(s.slice(sep + 1));
      if (pos >= a && pos < b) return true;
    }
    return false;
  };

  let out = starter;
  // comentários de bloco no topo.
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m, offset: number) => {
    if (dentroDeDecl(offset)) return m;
    return '';
  });
  // comentários de linha no topo (a linha inteira, incluindo o '\n').
  out = out.replace(/^[ \t]*\/\/[^\n]*\n?/gm, (m, offset: number) => {
    if (dentroDeDecl(offset)) return m;
    return '';
  });
  return out;
}

/**
 * Candidato "export": a função-alvo existe mas NÃO é exportada e o starter tem
 * um comentário LACUNA no topo (a lacuna é a palavra `export`). Remove os
 * comentários de topo e prefixa `export ` na declaração (re-localizada no
 * texto já limpo — os offsets mudaram com a remoção).
 */
function candidatoExport(starter: string, fn: FuncaoNoStarter, fonte: ts.SourceFile): string | null {
  if (fn.ehExportada) return null;
  const limpo = removerComentariosTopo(starter, fonte);
  if (limpo === starter) return null; // não havia comentário de topo — não é a lacuna de export
  const relocalizado = localizarFuncoesNoStarter(limpo, [fn.nome]);
  if (!relocalizado || relocalizado.funcoes.length === 0) return null;
  const alvo = relocalizado.funcoes[0];
  if (alvo.ehExportada) return null;
  return limpo.slice(0, alvo.declStart) + 'export ' + limpo.slice(alvo.declStart);
}

/** Primeiro comentário de bloco `/* … *​/` dentro do span de uma função. */
function acharGapDeBloco(starter: string, fn: FuncaoNoStarter): { start: number; end: number } | null {
  const re = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(starter)) !== null) {
    const start = m.index;
    if (start >= fn.declStart && start < fn.declEnd) {
      return { start, end: re.lastIndex };
    }
  }
  return null;
}

/** O candidato "eco": `return <param>;` quando o teste devolve o próprio argumento. */
function candidatoEcho(
  starter: string,
  fn: FuncaoNoStarter,
  fonte: ts.SourceFile,
  dados: LiteraisDoTeste,
): string | null {
  const comparacoes = dados.literais.filter(
    (l) => l.funcao === fn.nome && ASSERTS_DE_COMPARACAO.has(l.assert) && l.esperado !== null,
  );
  const eco = comparacoes.some((l) => l.argumentos.length >= 1 && l.argumentos[0] !== null && l.argumentos[0] === l.esperado);
  if (!eco) return null;

  let param: string | null = null;
  if (fn.params && fn.params.length > 0 && ts.isIdentifier(fn.params[0].name)) {
    param = fn.params[0].name.text;
  } else if ((!fn.params || fn.params.length === 0)) {
    param = inferirIdentificadorLivre(fn, fonte, starter);
  }
  if (!param) return null;

  const nova = `export function ${fn.nome}(${param}) {\n  return ${param};\n}`;
  return starter.slice(0, fn.declStart) + nova + starter.slice(fn.declEnd);
}

/** Candidato "literal": corpo da função → `return <literal>;`. */
function candidatoLiteral(
  starter: string,
  fn: FuncaoNoStarter,
  esperado: string,
): string | null {
  if (!fn.corpo) return null;
  const novoCorpo = `{\n  return ${esperado};\n}`;
  return starter.slice(0, fn.corpo.start) + novoCorpo + starter.slice(fn.corpo.end);
}

/** Candidato "do zero": starter sem a função-alvo → módulo mínimo do zero. */
function candidatoDoZero(starter: string, fn: string, esperado: string): string {
  return `export function ${fn}() {\n  return ${esperado};\n}`;
}

/** Candidato "gap de bloco": substitui o comentário de bloco `/* … *​/` dentro da função pelo literal. */
function candidatoGapDeBloco(starter: string, fn: FuncaoNoStarter, esperado: string): string | null {
  const gap = acharGapDeBloco(starter, fn);
  if (!gap) return null;
  return starter.slice(0, gap.start) + esperado + starter.slice(gap.end);
}

/**
 * Poda a solução de referência: mantém apenas imports e declarações cujo nome
 * está nas funções-alvo (heurística simples e determinística).
 */
function podarSolucao(solution: string, funcoesAlvo: string[]): string | null {
  const source = parseSource(solution, 'solution.mjs');
  if (!source) return null;
  const alvo = new Set(funcoesAlvo);
  const pedacos: string[] = [];
  let algumDescartado = false;
  for (const stmt of source.statements) {
    if (ts.isImportDeclaration(stmt)) {
      pedacos.push(stmt.getText(source));
      continue;
    }
    let casa = false;
    if (ts.isFunctionDeclaration(stmt) && stmt.name && alvo.has(stmt.name.text)) casa = true;
    else if (ts.isClassDeclaration(stmt) && stmt.name && alvo.has(stmt.name.text)) casa = true;
    else if (ts.isVariableStatement(stmt)) {
      casa = stmt.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && alvo.has(d.name.text));
    }
    if (casa) pedacos.push(stmt.getText(source));
    else algumDescartado = true;
  }
  if (pedacos.length === 0) return null;
  const podado = pedacos.join('\n\n') + '\n';
  // se nada foi descartado, o candidato é a própria solução (ainda é o melhor
  // proxy determinístico disponível).
  return algumDescartado || podado.trim() !== solution.trim() ? podado : solution;
}

/**
 * Gera candidatos de solução mínima a partir do starter, na ordem de
 * minimalidade (o primeiro que passar nas provas vence). PURO: mesma entrada,
 * mesma saída. Máximo ~8 candidatos, ordem fixa e determinística:
 *
 *   1. ECHO          — `return <param>;` (o teste devolve o próprio argumento)
 *   2. LITERAL       — corpo da função → `return <literal>;` (até 3 literais
 *                      distintos, na ordem do código do teste)
 *   3. DO ZERO       — starter sem a função-alvo → módulo mínimo do zero
 *   4. GAP DE BLOCO  — `/* … *​/` dentro da função substituído pelo literal
 *   5. EXPORT        — função existe mas não é exportada + lacuna no topo
 *   6. PODA          — SÓ quando nada acima gerou candidato: solução de
 *                      referência podada às funções-alvo (último recurso)
 */
export function gerarCandidatos(starter: string, solution: string, dados: LiteraisDoTeste): string[] {
  const localizado = localizarFuncoesNoStarter(starter, dados.funcoesAlvo);
  const candidatos: string[] = [];
  const adicionar = (c: string | null): void => {
    if (c === null || c === undefined) return;
    if (!candidatos.includes(c)) candidatos.push(c);
  };

  if (!localizado) {
    // starter não parseia — sem base para editar; nenhum candidato (o chamador
    // decide o veredito fail-closed).
    return [];
  }
  const { source: fonte, funcoes } = localizado;

  if (funcoes.length === 0) {
    // nenhuma função-alvo no starter: candidato do zero com o primeiro literal.
    const primeiro = dados.literais.find((l) => ASSERTS_DE_COMPARACAO.has(l.assert) && l.esperado !== null);
    const esperado = primeiro?.esperado;
    if (esperado !== null && esperado !== undefined && dados.funcoesAlvo.length > 0) {
      adicionar(candidatoDoZero(starter, dados.funcoesAlvo[0], esperado));
    }
  } else {
    // Função-alvo: a MAIS referenciada pelos asserts de comparação do teste
    // (desempate determinístico: ordem de aparição no starter). Sem referência
    // de comparação → primeira função do starter.
    let fn = funcoes[0];
    let melhor = -1;
    for (const f of funcoes) {
      const refs = dados.literais.filter(
        (l) => l.funcao === f.nome && ASSERTS_DE_COMPARACAO.has(l.assert),
      ).length;
      if (refs > melhor) {
        melhor = refs;
        fn = f;
      }
    }

    // 1. eco
    adicionar(candidatoEcho(starter, fn, fonte, dados));

    // 2. literal (até 3 literais distintos, ordem do código do teste)
    const vistos = new Set<string>();
    for (const l of dados.literais) {
      if (l.funcao === fn.nome && ASSERTS_DE_COMPARACAO.has(l.assert) && l.esperado !== null && !vistos.has(l.esperado)) {
        vistos.add(l.esperado);
        adicionar(candidatoLiteral(starter, fn, l.esperado));
        if (vistos.size >= 3) break;
      }
    }

    // 4. gap de bloco (o mais conservador: só preenche a lacuna existente)
    const primeiroLiteral = dados.literais.find((l) => ASSERTS_DE_COMPARACAO.has(l.assert) && l.esperado !== null);
    if (primeiroLiteral?.esperado) {
      adicionar(candidatoGapDeBloco(starter, fn, primeiroLiteral.esperado));
    }

    // 5. export (função não exportada + lacuna de topo)
    adicionar(candidatoExport(starter, fn, fonte));
  }

  // 6. poda — SÓ quando nenhum candidato foi gerado (a poda carrega a solução
  // inteira; se houvesse candidato literal, a poda mascararia o sinal
  // SEM_SOLUCAO que o dono quer ver).
  if (candidatos.length === 0) {
    adicionar(podarSolucao(solution, dados.funcoesAlvo));
  }

  return candidatos.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Síntese: map-reduce de candidatos contra o prover (fail-closed)
// ---------------------------------------------------------------------------

/** Trecho do teste que chama as funções-alvo — enriquecimento dos átomos. */
function trechoDoTesteParaAtomos(testsCode: string, funcoesAlvo: string[]): string {
  const source = parseSource(testsCode, 'tests.mjs');
  if (!source) return '';
  const alvo = new Set(funcoesAlvo);
  const trechos: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && alvo.has(node.expression.text)) {
      trechos.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return trechos.join('\n');
}

/**
 * Sintetiza o código mínimo que passa no teste. Roda cada candidato pelo
 * prover REAL (injetado — `criarProverDeDesafio` na produção, fake nos
 * testes) e devolve o PRIMEIRO que passa nas quatro provas. Fail-closed.
 */
export async function sintetizarCodigoMinimo(prover: ProverDeDesafio, ctx: MinimalCtx): Promise<MinimalVerdict> {
  const extraido = extrairLiteraisDoTeste(ctx.testsCode);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatos(ctx.starterCode, ctx.solutionCode, dados);
  if (candidatos.length === 0) {
    return {
      ok: false,
      reason: 'SEM_SOLUCAO_ACESSIVEL',
      detail: 'nenhum candidato mínimo gerado a partir do starter e dos literais do teste',
    };
  }

  let tentativas = 0;
  let falhasDeInfra = 0;
  for (const candidato of candidatos) {
    tentativas += 1;
    let veredito: ChallengeProofsVerdict;
    try {
      veredito = await prover({
        starterCode: ctx.starterCode,
        solutionCode: candidato,
        testsCode: ctx.testsCode,
        expectedTestCount: ctx.expectedTestCount,
      });
    } catch (err) {
      falhasDeInfra += 1;
      continue;
    }
    if (veredito.execError !== undefined) {
      falhasDeInfra += 1;
      continue;
    }
    if (veredito.valid) {
      const extraidoAtoms = extractAtoms(candidato);
      const atoms = extraidoAtoms.ok ? extraidoAtoms.keys : [];
      const trecho = trechoDoTesteParaAtomos(ctx.testsCode, dados.funcoesAlvo);
      const atomsDoTeste = (() => {
        if (trecho.length === 0) return [] as AtomKey[];
        const extraido = extractAtoms(trecho);
        return extraido.ok ? extraido.keys : [];
      })();
      return {
        ok: true,
        minimalCode: candidato,
        atoms,
        atomsDoTeste,
        lines: contarLinhas(candidato),
        proofsValid: true,
      };
    }
  }

  if (tentativas > 0 && falhasDeInfra === tentativas) {
    return {
      ok: false,
      reason: 'PROVER_FALHOU',
      detail: `todas as ${tentativas} tentativa(s) falharam por falha de infraestrutura do prover`,
    };
  }
  return {
    ok: false,
    reason: 'SEM_SOLUCAO_ACESSIVEL',
    detail: `nenhum dos ${tentativas} candidato(s) passou nas provas — o teste exige mais que literais ou está quebrado`,
  };
}

/** Conta linhas de um trecho de código (split por '\n'). */
export function contarLinhas(codigo: string): number {
  if (codigo === '') return 0;
  return codigo.split('\n').length;
}

/** Re-export útil para os consumidores (CLI/requisitos) — assinatura conferida. */
export type { AtomKey };
