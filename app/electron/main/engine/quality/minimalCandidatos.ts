/**
 * app/electron/main/engine/quality/minimalCandidatos.ts — a GERAÇÃO dos
 * candidatos de solução mínima de JavaScript a partir do starter, pura e
 * ordenada por minimalidade (ECHO → LITERAL(≤3) → GAP DE BLOCO → EXPORT →
 * PODA por último, com dedupe).
 *
 * A prosa normativa (a ordem e o porquê de cada estágio) vive na fachada
 * `minimal.ts`. Refatoração L04: arquivo ≤500 linhas e toda função com CC≤8,
 * sem mudança de comportamento observável.
 */

import * as ts from 'typescript';

import { RUNTIME_GLOBALS } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';
import { exigirJs, parseSource, ASSERTS_DE_COMPARACAO } from './minimalBase';
import { calleeName, isLiteral } from './minimalLiterais';
import { type LiteralExtraido, type LiteraisDoTeste } from './minimalTipos';

/** Estrutura mínima de uma função-alvo no starter (para edição determinística). */
export interface FuncaoNoStarter {
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

/** A declaração tem o modificador `export`? */
function ehDeclaracaoExportada(node: ts.VariableStatement | ts.FunctionDeclaration): boolean {
  return node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** `export function nome(){}` / `function nome(){}` localizada no starter. */
function comoFuncaoDeclarada(
  node: ts.Node,
  alvo: ReadonlySet<string>,
  source: ts.SourceFile,
): FuncaoNoStarter | null {
  if (!ts.isFunctionDeclaration(node) || !node.name || !alvo.has(node.name.text)) return null;
  const corpo = node.body
    ? { start: node.body.getStart(source), end: node.body.getEnd() }
    : null;
  return {
    nome: node.name.text,
    declStart: node.getStart(source),
    declEnd: node.getEnd(),
    decl: node,
    params: node.parameters,
    corpo,
    ehExportada: ehDeclaracaoExportada(node),
  };
}

/** O corpo BLOCO de uma função anônima atribuída (arrow de expressão ⇒ null). */
function corpoDeInit(
  init: ts.ArrowFunction | ts.FunctionExpression,
  source: ts.SourceFile,
): { start: number; end: number } | null {
  if (!ts.isBlock(init.body)) return null;
  return { start: init.body.getStart(source), end: init.body.getEnd() };
}

/** `export const nome = (…) => …` / `= function …` localizada no starter. */
function comoVariavelFuncao(
  node: ts.Node,
  alvo: ReadonlySet<string>,
  source: ts.SourceFile,
): FuncaoNoStarter[] {
  if (!ts.isVariableStatement(node)) return [];
  const out: FuncaoNoStarter[] = [];
  for (const d of node.declarationList.declarations) {
    if (!ts.isIdentifier(d.name) || !alvo.has(d.name.text)) continue;
    const init = d.initializer;
    if (!init) continue;
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      out.push({
        nome: d.name.text,
        declStart: node.getStart(source),
        declEnd: node.getEnd(),
        decl: node,
        params: init.parameters,
        corpo: corpoDeInit(init, source),
        ehExportada: ehDeclaracaoExportada(node),
      });
    }
  }
  return out;
}

/**
 * Localiza as funções-alvo no starter. Suporta `export function nome(){}`,
 * `function nome(){}` e `export const nome = (…) => …` / `= function …`.
 */
export function localizarFuncoesNoStarter(
  starter: string,
  funcoesAlvo: string[],
): { source: ts.SourceFile; funcoes: FuncaoNoStarter[] } | null {
  const source = parseSource(starter, 'starter.mjs');
  if (!source) return null;
  const alvo = new Set(funcoesAlvo);
  const funcoes: FuncaoNoStarter[] = [];

  const visit = (node: ts.Node): void => {
    const declarada = comoFuncaoDeclarada(node, alvo, source);
    if (declarada !== null) funcoes.push(declarada);
    for (const v of comoVariavelFuncao(node, alvo, source)) funcoes.push(v);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  // ordem determinística: ordem de aparição no código.
  funcoes.sort((a, b) => a.declStart - b.declStart);
  return { source, funcoes };
}

/** Um predicado de posição de NÃO-valor (o identificador é nome, não uso). */
type PosicaoDeNaoValor = (no: ts.Identifier) => boolean;

const POSICOES_DE_NAO_VALOR: readonly PosicaoDeNaoValor[] = [
  (no) => ts.isPropertyAccessExpression(no.parent) && no.parent.name === no,
  (no) => ts.isPropertyAssignment(no.parent) && no.parent.name === no,
  (no) => ts.isBindingElement(no.parent) && no.parent.propertyName === no,
  (no) => ts.isImportSpecifier(no.parent) || ts.isExportSpecifier(no.parent),
  (no) => ts.isParameter(no.parent) && no.parent.name === no,
  (no) => ts.isVariableDeclaration(no.parent) && no.parent.name === no,
  (no) => ts.isFunctionDeclaration(no.parent) && no.parent.name === no,
  (no) => ts.isClassDeclaration(no.parent) && no.parent.name === no,
  (no) => ts.isMethodDeclaration(no.parent) && no.parent.name === no,
  (no) => ts.isLabeledStatement(no.parent) && no.parent.label === no,
];

/** true quando o identificador está em posição de VALOR (e não de nome/rótulo). */
export function isEmPosicaoDeValor(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;
  return !POSICOES_DE_NAO_VALOR.some((emNaoValor) => emNaoValor(node));
}

/** Um extrator de nome declarado (variável, função, classe, parâmetro, …). */
type ExtratorDeNomeDeclarado = (n: ts.Node) => string | null;

const EXTRATORES_DE_NOME_DECLARADO: readonly ExtratorDeNomeDeclarado[] = [
  (n) => (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) ? n.name.text : null),
  (n) => (ts.isFunctionDeclaration(n) && n.name ? n.name.text : null),
  (n) => (ts.isClassDeclaration(n) && n.name ? n.name.text : null),
  (n) => (ts.isParameter(n) && ts.isIdentifier(n.name) ? n.name.text : null),
  (n) =>
    ts.isCatchClause(n) && n.variableDeclaration && ts.isIdentifier(n.variableDeclaration.name)
      ? n.variableDeclaration.name.text
      : null,
  (n) => (ts.isImportSpecifier(n) ? n.name.text : null),
];

/** O nome declarado POR UM nó (a ordem dos extratores é a da cadeia original). */
function nomeDeclaradoEm(n: ts.Node): string | null {
  for (const extrator of EXTRATORES_DE_NOME_DECLARADO) {
    const nome = extrator(n);
    if (nome !== null) return nome;
  }
  return null;
}

/** Nomes declarados no starter inteiro (params, locais, imports). */
function nomesDeclaradosNoArquivo(source: ts.SourceFile): Set<string> {
  const declarados = new Set<string>();
  const coletar = (node: ts.Node): void => {
    const nome = nomeDeclaradoEm(node);
    if (nome !== null) declarados.add(nome);
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
export function inferirIdentificadorLivre(fn: FuncaoNoStarter, fonte: ts.SourceFile, starter: string): string | null {
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
export function removerComentariosTopo(starter: string, fonte: ts.SourceFile): string {
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
export function candidatoExport(starter: string, fn: FuncaoNoStarter, fonte: ts.SourceFile): string | null {
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
export function acharGapDeBloco(starter: string, fn: FuncaoNoStarter): { start: number; end: number } | null {
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
export function candidatoEcho(
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
export function candidatoLiteral(
  starter: string,
  fn: FuncaoNoStarter,
  esperado: string,
): string | null {
  if (!fn.corpo) return null;
  const novoCorpo = `{\n  return ${esperado};\n}`;
  return starter.slice(0, fn.corpo.start) + novoCorpo + starter.slice(fn.corpo.end);
}

/** Candidato "do zero": starter sem a função-alvo → módulo mínimo do zero. */
export function candidatoDoZero(starter: string, fn: string, esperado: string): string {
  return `export function ${fn}() {\n  return ${esperado};\n}`;
}

/** Candidato "gap de bloco": substitui o comentário de bloco `/* … *​/` dentro da função pelo literal. */
export function candidatoGapDeBloco(starter: string, fn: FuncaoNoStarter, esperado: string): string | null {
  const gap = acharGapDeBloco(starter, fn);
  if (!gap) return null;
  return starter.slice(0, gap.start) + esperado + starter.slice(gap.end);
}

/** O statement declara alguma das funções-alvo (ou classe/variável com o nome)? */
function declaraAlvo(stmt: ts.Statement, alvo: ReadonlySet<string>): boolean {
  if (ts.isFunctionDeclaration(stmt) && stmt.name && alvo.has(stmt.name.text)) return true;
  if (ts.isClassDeclaration(stmt) && stmt.name && alvo.has(stmt.name.text)) return true;
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && alvo.has(d.name.text));
  }
  return false;
}

/**
 * Poda a solução de referência: mantém apenas imports e declarações cujo nome
 * está nas funções-alvo (heurística simples e determinística).
 */
export function podarSolucao(solution: string, funcoesAlvo: string[]): string | null {
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
    if (declaraAlvo(stmt, alvo)) pedacos.push(stmt.getText(source));
    else algumDescartado = true;
  }
  if (pedacos.length === 0) return null;
  const podado = pedacos.join('\n\n') + '\n';
  // se nada foi descartado, o candidato é a própria solução (ainda é o melhor
  // proxy determinístico disponível).
  return algumDescartado || podado.trim() !== solution.trim() ? podado : solution;
}

/** Os literais DISTINTOS do esperado da função-alvo, na ordem do teste (≤3). */
function literaisDistintos(fn: FuncaoNoStarter, dados: LiteraisDoTeste): string[] {
  const vistos = new Set<string>();
  for (const l of dados.literais) {
    if (l.funcao === fn.nome && ASSERTS_DE_COMPARACAO.has(l.assert) && l.esperado !== null && !vistos.has(l.esperado)) {
      vistos.add(l.esperado);
      if (vistos.size >= 3) break;
    }
  }
  return [...vistos];
}

/** Os candidatos de UM par função-alvo × literais, na ordem de minimalidade. */
function candidatosDaFuncao(
  starter: string,
  fn: FuncaoNoStarter,
  fonte: ts.SourceFile,
  dados: LiteraisDoTeste,
  adicionar: (c: string | null) => void,
): void {
  // 1. eco
  adicionar(candidatoEcho(starter, fn, fonte, dados));

  // 2. literal (até 3 literais distintos, ordem do código do teste)
  for (const esperado of literaisDistintos(fn, dados)) {
    adicionar(candidatoLiteral(starter, fn, esperado));
  }

  // 4. gap de bloco (o mais conservador: só preenche a lacuna existente)
  const primeiroLiteral = dados.literais.find((l) => ASSERTS_DE_COMPARACAO.has(l.assert) && l.esperado !== null);
  if (primeiroLiteral?.esperado) {
    adicionar(candidatoGapDeBloco(starter, fn, primeiroLiteral.esperado));
  }

  // 5. export (função não exportada + lacuna de topo)
  adicionar(candidatoExport(starter, fn, fonte));
}

/** A função-alvo: a MAIS referenciada pelos asserts de comparação do teste. */
function funcaoAlvoPrincipal(funcoes: FuncaoNoStarter[], dados: LiteraisDoTeste): FuncaoNoStarter {
  // Desempate determinístico: ordem de aparição no starter. Sem referência de
  // comparação → primeira função do starter.
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
  return fn;
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
export function gerarCandidatos(
  starter: string,
  solution: string,
  dados: LiteraisDoTeste,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): string[] {
  exigirJs('gerarCandidatos', language);
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
    candidatosDaFuncao(starter, funcaoAlvoPrincipal(funcoes, dados), fonte, dados, adicionar);
  }

  // 6. poda — SÓ quando nenhum candidato foi gerado (a poda carrega a solução
  // inteira; se houvesse candidato literal, a poda mascararia o sinal
  // SEM_SOLUCAO que o dono quer ver).
  if (candidatos.length === 0) {
    adicionar(podarSolucao(solution, dados.funcoesAlvo));
  }

  return candidatos.slice(0, 8);
}
