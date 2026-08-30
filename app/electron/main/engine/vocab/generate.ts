/**
 * app/electron/main/engine/vocab/generate.ts — o GERADOR do vocabulário fechado
 * (pacote P-05, `docs/16-engine-de-trilha.md` §3.1 e §5.3).
 *
 * PROBLEMA QUE ESTE PACOTE RESOLVE: `vocab/atoms.json` e
 * `vocab/api-catalog.json` são GERADOS POR SCRIPT e nunca digitados à mão.
 * Lista escrita à mão erra nos dois sentidos: esquecer um nome faz o gate
 * deixar passar, e inventar um nome (19,7% dos pacotes que um LLM cita não
 * existem) faz o gate reprovar código correto. O vocabulário sem carimbo de
 * origem é vocabulário que ninguém sabe reproduzir — por isso cada artefato
 * carrega `node_version` e `typescript_version`.
 *
 * UNIVERSOS (todos derivados, nenhum digitado no JSON):
 *   a. NÓS (`node:<Nome>`) — de `ts.SyntaxKind`, usando a tabela CANÔNICA de
 *      nomes do extrator (`extract.ts` exporta `kindName`, REUSADA aqui, nunca
 *      duplicada). A tabela contorna os marcadores de faixa do enum
 *      (`FirstLiteralToken`, `LastToken`, …) que sequestram a busca reversa —
 *      `ts.SyntaxKind[ts.SyntaxKind.NumericLiteral]` devolve
 *      `"FirstLiteralToken"`. Excluídos: marcadores de faixa, JSX e
 *      Experimental (o contrato de §3.1: "de eslint-visitor-keys (menos JSX e
 *      Experimental)"), trivia de comentário (não são nós do AST visitado),
 *      pontuação (vira eixo `op:`, nunca `node:` — §5.3) e os nomes de
 *      bookkeeping do enum (`Unknown`, `Count`).
 *   b. GLOBAIS (`global:<nome>`) — `Object.getOwnPropertyNames(globalThis)`
 *      em tempo de geração, mais as palavras da língua que não aparecem como
 *      propriedade própria em todos os runtimes (`undefined`, `NaN`,
 *      `Infinity`, `arguments`) — espelhando o `RUNTIME_GLOBALS` do extrator.
 *   c. MÓDULOS (`api:node:<mod>` / `api:<mod>`) — `require('module')
 *      .builtinModules`. Cada módulo entra nas DUAS grafias que o extrator
 *      aceita (`import 'assert'` → `api:assert`; a forma canônica
 *      `api:node:assert` — e `import 'node:test'` → `api:node:test`);
 *      `HARNESS_RECEPTIVE_SEED` cita as duas formas do harness.
 *   d. CATÁLOGO DE API — `Object.getOwnPropertyNames` dos protótipos/
 *      construtores built-in escolhidos (lista documentada em `catalog.ts`),
 *      montando caminhos tipo `Array.prototype.push`. Sem esse filtro o eixo
 *      `api:` vira ruído — o catálogo distingue API de linguagem de nome de
 *      domínio da trilha.
 *   e. OPERADORES (`op:<família>:<op>`) — derivados do próprio enum via
 *      `ts.tokenToString`: os textos de operador que o extrator pode emitir
 *      (verificação empírica em `tests/engineVocab.test.ts`), com
 *      `op:binary:,` confirmado (vírgula é `BinaryExpression` no AST do TS).
 *   f. DECLARAÇÕES (`decl:let|const|var`) — as três forms da língua, REUSANDO
 *      `DECLARATION_KINDS` de `atomKeys.ts`.
 *   Os eixos `term:` (prosa pt-BR, por trilha) e `form:` (seletor esquery,
 *      reservado) NÃO têm fonte de máquina — não são gerados aqui.
 *
 * DETERMINISMO: o mesmo runtime produz os mesmos bytes — todos os arrays são
 * ordenados (sort canônico), as chaves de objeto seguem ordem literal fixa e
 * não há timestamp. Uma execução em runtime DIFERENTE produz um vocabulário
 * DIFERENTE e honesto, porque o artefato carrega as versões que o produziram.
 *
 * USO:
 *   npx tsx app/electron/main/engine/vocab/generate.ts   # regrava os JSONs
 * A engine consome os artefatos em runtime; o gerador exporta funções puras
 * (`gerarAtomos`, `gerarCatalogoApi`) testáveis com um `VocabRuntime`
 * injetável (ver `catalog.ts`).
 */

import * as ts from 'typescript';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { kindName } from '../extract';
import {
  ATOM_KEY_RE,
  DECLARATION_KINDS,
  declKey,
  nodeKey,
  globalKey,
  opKey,
  apiKey,
} from '../atomKeys';
import {
  montarCatalogo,
  VocabRuntime,
} from './catalog';

// ─── texto canônico dos operadores que o EXTRATOR pode emitir ───────────────
// Conjuntos fixos da GRAMÁTICA (a mesma superfície que `extract.ts` usa nos
// seus conjuntos privados ASSIGNMENT_TOKENS/LOGICAL_TOKENS e nos pontos de
// emissão unário/binário). Não são vocabulário digitado: são TEXTO de token,
// e o JSON só recebe as chaves finais derivadas do enum via tokenToString.

/** `op:assign:` — o conjunto exato de `extract.ts` (16 atribuições). */
const TEXTOS_ASSIGN = new Set<string>([
  '=', '+=', '-=', '*=', '**=', '/=', '%=', '<<=', '>>=', '>>>=',
  '&=', '|=', '^=', '&&=', '||=', '??=',
]);
/** `op:logical:` — curto-circuito (família própria em `extract.ts`). */
const TEXTOS_LOGICAL = new Set<string>(['&&', '||', '??']);
/** `op:update:` — pré/pós-incremento e decremento. */
const TEXTOS_UPDATE = new Set<string>(['++', '--']);
/** `op:binary:` — os textos que um `BinaryExpression.operatorToken` pode ter
 *  (inclui `,` — vírgula é BinaryExpression no AST do TS; `in`/`instanceof`
 *  são keywords usadas como operador binário). */
const TEXTOS_BINARY = new Set<string>([
  ',', '<', '>', '<=', '>=', '==', '!=', '===', '!==',
  '+', '-', '*', '/', '%', '**', '&', '|', '^', '<<', '>>', '>>>',
  'in', 'instanceof',
]);
/** `op:unary:` — prefixos unários (`typeof`/`void`/`delete` são keywords). */
const TEXTOS_UNARY = new Set<string>(['+', '-', '~', '!', 'typeof', 'void', 'delete']);

/**
 * Nomes do enum que NÃO são kinds de nó: `Unknown` (valor 0 — nenhum
 * parse bem-sucedido produz esse nó; o extrator rejeita erro de sintaxe
 * antes) e `Count` (tamanho do enum).
 */
const NOMES_RESERVADOS_ENUM = new Set<string>(['Unknown', 'Count']);

/** Palavras da língua adicionadas aos globais — ver cabeçalho (b). */
const PALAVRAS_LINGUAGEM = ['undefined', 'NaN', 'Infinity', 'arguments'] as const;

/** Versão do layout dos artefatos gerados. */
export const SCHEMA_ARTEFATO = 1 as const;

/**
 * Reúne as observações cruas do runtime REAL (process/globalThis/ts/module).
 * As funções puras (`gerarAtomos`, `gerarCatalogoApi`) só tocam o runtime
 * injetado — é isto que torna a geração testável e a prova de determinismo
 * possível.
 */
export function runtimeDoProcesso(): VocabRuntime {
  const require = createRequire(import.meta.url);
  return {
    nodeVersion: process.version,
    typescriptVersion: ts.version,
    globalNames: Object.getOwnPropertyNames(globalThis),
    builtinModules: require('node:module').builtinModules,
    // ts.SyntaxKind é enum → objeto com chaves numéricas e nominais.
    syntaxKindEnum: ts.SyntaxKind as unknown as Record<string, number>,
    kindNameOf: (kind: number) => kindName(kind),
    tokenToStringOf: (kind: number) => ts.tokenToString(kind),
    globalObject: globalThis,
    ownPropertyNames: (obj: unknown) => Object.getOwnPropertyNames(obj as object),
    requireModule: (specifier: string) => require(specifier),
  };
}

/**
 * Nomes CANÔNICOS do enum de SyntaxKind — os nomes que a tabela canônica do
 * extrator reconhece como oficiais (REUSE de `extract.kindName`): um nome é
 * canônico se, e somente se, `kindName(valor) === nome`. Isso elimina os
 * marcadores de faixa (`First*`/`Last*`) e os aliases sombreados, sem duplicar
 * a tabela. Ordenado (sort canônico) e livre de ordem de iteração.
 */
export function nomesCanonicosSyntaxKind(runtime: VocabRuntime): string[] {
  const canonicos: string[] = [];
  for (const [name, value] of Object.entries(runtime.syntaxKindEnum)) {
    if (/^\d+$/.test(name)) continue; // chaves numéricas do enum (busca reversa)
    if (name.startsWith('First') || name.startsWith('Last')) continue; // marcador de faixa
    if (runtime.kindNameOf(value) !== name) continue; // alias sombreado — não canônico
    canonicos.push(name);
  }
  canonicos.sort();
  return canonicos;
}

/**
 * UNIVERSO DE NÓS (`node:<Nome>`). Derivado do enum com a tabela canônica;
 * excluídos marcadores de faixa, JSX, Experimental, trivia de comentário
 * (nunca visitadas pelo `forEachChild` do extrator), pontuação (eixo `op:`) e
 * bookkeeping. Mais de 100 chaves no TS 5.8 (aceite A-P05-2).
 */
export function gerarUniversoNos(runtime: VocabRuntime): string[] {
  const primeiraPontuacao = runtime.syntaxKindEnum.FirstPunctuation;
  const ultimaPontuacao = runtime.syntaxKindEnum.LastPunctuation;
  const nos: string[] = [];
  for (const name of nomesCanonicosSyntaxKind(runtime)) {
    if (NOMES_RESERVADOS_ENUM.has(name)) continue;
    if (name.endsWith('Trivia')) continue; // SingleLineCommentTrivia etc. não são nós
    if (/jsx/i.test(name)) continue; // JsxElement, JsxAttribute, … — fora do contrato §3.1
    if (/experimental/i.test(name)) continue; // por paridade com §3.1 (sem correspondente no TS hoje)
    const valor = runtime.syntaxKindEnum[name];
    if (valor >= primeiraPontuacao && valor <= ultimaPontuacao) continue; // vira op:, nunca node:
    nos.push(nodeKey(name));
  }
  nos.sort();
  return nos;
}

/** UNIVERSO DE GLOBAIS (`global:<nome>`) — da máquina, nunca à mão. */
export function gerarUniversoGlobais(runtime: VocabRuntime): string[] {
  const globais = new Set<string>(runtime.globalNames);
  for (const palavra of PALAVRAS_LINGUAGEM) globais.add(palavra);
  return [...globais].map((nome) => globalKey(nome)).sort();
}

/**
 * UNIVERSO DE MÓDULOS (`api:<mod>` e `api:node:<mod>`). Cada módulo built-in
 * entra nas duas grafias que o extrator aceita — `import 'assert'` emite
 * `api:assert`; a forma canônica `node:` é a do `HARNESS_RECEPTIVE_SEED`
 * (`api:node:assert`, `api:node:test`).
 */
export function gerarUniversoModulos(runtime: VocabRuntime): string[] {
  const modulos = new Set<string>();
  for (const m of runtime.builtinModules) {
    const semPrefixo = m.replace(/^node:/, '');
    modulos.add(apiKey(semPrefixo));
    modulos.add(apiKey(`node:${semPrefixo}`));
  }
  return [...modulos].sort();
}

/**
 * UNIVERSO DE OPERADORES (`op:<família>:<op>`). Derivado do enum via
 * `ts.tokenToString`: para cada nome canônico cujo token tem texto, a chave é
 * emitida em TODAS as famílias cujo conjunto de textos a contém (`+` e `-`
 * são binários E unários; `++`/`--` são update). O resultado é exatamente o
 * que `extract.ts` pode emitir (verificação empírica nos testes).
 */
export function gerarUniversoOps(runtime: VocabRuntime): string[] {
  const ops = new Set<string>();
  for (const name of nomesCanonicosSyntaxKind(runtime)) {
    const valor = runtime.syntaxKindEnum[name];
    const texto = runtime.tokenToStringOf(valor);
    if (texto === undefined) continue;
    if (TEXTOS_ASSIGN.has(texto)) ops.add(opKey('assign', texto));
    if (TEXTOS_LOGICAL.has(texto)) ops.add(opKey('logical', texto));
    if (TEXTOS_UPDATE.has(texto)) ops.add(opKey('update', texto));
    if (TEXTOS_BINARY.has(texto)) ops.add(opKey('binary', texto));
    if (TEXTOS_UNARY.has(texto)) ops.add(opKey('unary', texto));
  }
  return [...ops].sort();
}

/** UNIVERSO DE DECLARAÇÕES (`decl:let|const|var`) — REUSO de atomKeys.ts. */
export function gerarUniversoDecl(): string[] {
  return DECLARATION_KINDS.map((kind) => declKey(kind)).sort();
}

/** Eixo `api:` de atoms.json = módulos ∪ catálogo de API de linguagem. */
function gerarEixoApi(runtime: VocabRuntime): string[] {
  const catalogo = montarCatalogo(runtime);
  return [...new Set<string>([...gerarUniversoModulos(runtime), ...catalogo.api_paths])].sort();
}

/** Estrutura serializada de `atoms.json` (layout `schema: 1`). */
export interface AtomosJson {
  schema: 1;
  node_version: string;
  typescript_version: string;
  axes: {
    node: string[];
    op: string[];
    decl: string[];
    global: string[];
    api: string[];
  };
  total: number;
}

/**
 * FAIL-CLOSED na geração: nenhuma chave pode nascer inválida. Um vocabulário
 * cuja própria chave não casa com `ATOM_KEY_RE` seria consumido em silêncio
 * por um gate — por isso a geração LANGAR erro em vez de produzir.
 */
function validarChaves(rotulo: string, chaves: readonly string[]): void {
  for (const chave of chaves) {
    if (!ATOM_KEY_RE.test(chave)) {
      throw new Error(`gerador de vocabulário: chave inválida em ${rotulo}: "${chave}"`);
    }
  }
}

function montarAtomos(runtime: VocabRuntime): AtomosJson {
  const node = gerarUniversoNos(runtime);
  const op = gerarUniversoOps(runtime);
  const decl = gerarUniversoDecl();
  const global = gerarUniversoGlobais(runtime);
  const api = gerarEixoApi(runtime);

  if (node.length === 0) {
    throw new Error('gerador de vocabulário: universo de nós vazio — enum não reconhecido');
  }
  validarChaves('node', node);
  validarChaves('op', op);
  validarChaves('decl', decl);
  validarChaves('global', global);
  validarChaves('api', api);

  const total = new Set([...node, ...op, ...decl, ...global, ...api]).size;
  return {
    schema: SCHEMA_ARTEFATO,
    node_version: runtime.nodeVersion,
    typescript_version: runtime.typescriptVersion,
    axes: { node, op, decl, global, api },
    total,
  };
}

/**
 * Gera `atoms.json` como STRING (o conteúdo exato do arquivo commitado).
 * PURO e determinístico: mesma entrada, mesmos bytes.
 */
export function gerarAtomos(runtime: VocabRuntime): string {
  return JSON.stringify(montarAtomos(runtime), null, 2);
}

/**
 * Gera `api-catalog.json` como STRING (o conteúdo exato do arquivo
 * commitado). O catálogo é validado antes: vazio é erro, chave inválida é erro.
 */
export function gerarCatalogoApi(runtime: VocabRuntime): string {
  const catalogo = montarCatalogo(runtime);
  if (catalogo.receivers.length === 0) {
    throw new Error('gerador de vocabulário: catálogo de API vazio');
  }
  validarChaves('api-catalog.api_paths', catalogo.api_paths);
  return JSON.stringify(catalogo, null, 2);
}

/**
 * Regrava os DOIS artefatos em `dir` e devolve os caminhos escritos. O
 * conteúdo do arquivo é EXATAMENTE o que `gerarAtomos`/`gerarCatalogoApi`
 * devolvem (sem newline final) — é o que permite a prova byte a byte.
 */
export function escreverArtefatos(runtime: VocabRuntime, dir: string): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const atomsPath = path.join(dir, 'atoms.json');
  const catalogPath = path.join(dir, 'api-catalog.json');
  fs.writeFileSync(atomsPath, gerarAtomos(runtime), 'utf8');
  fs.writeFileSync(catalogPath, gerarCatalogoApi(runtime), 'utf8');
  return [atomsPath, catalogPath];
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// CLI: `npx tsx <caminho>/generate.ts` regrava os artefatos na própria pasta.
function ePontoDeEntrada(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return pathToFileURL(path.resolve(argv1)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (ePontoDeEntrada()) {
  const runtime = runtimeDoProcesso();
  const [atomsPath, catalogPath] = escreverArtefatos(runtime, MODULE_DIR);
  const atomos = montarAtomos(runtime);
  const catalogo = montarCatalogo(runtime);
  // eslint-disable-next-line no-console
  console.log(
    `vocabulário gerado (node ${runtime.nodeVersion}, typescript ${runtime.typescriptVersion})\n` +
      `  node: ${atomos.axes.node.length}  op: ${atomos.axes.op.length}  decl: ${atomos.axes.decl.length}  ` +
      `global: ${atomos.axes.global.length}  api: ${atomos.axes.api.length}  (total ${atomos.total})\n` +
      `  catálogo: ${catalogo.receivers.length} receptores, ${catalogo.api_paths.length} caminhos\n` +
      `  ${atomsPath}\n  ${catalogPath}`,
  );
}