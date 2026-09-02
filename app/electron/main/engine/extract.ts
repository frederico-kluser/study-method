/**
 * app/electron/main/engine/extract.ts — o EXTRATOR DETERMINÍSTICO de construções.
 *
 * Problema real: hoje o único gate de uma trilha prova FORMA (schema válido,
 * solução passa, starter falha) e nunca prova CONHECIMENTO. Resultado medido:
 * 43 dos 136 desafios cobram construção que nenhuma aula anterior ensinou, e
 * os módulos 1 a 6 violam em 100% dos desafios. Perguntar isso a uma LLM não
 * resolve — juiz de LLM julgando corretude de código sem executar concorda com
 * o resultado real a Cohen's κ ≈ 0,21 e aceita metade do código errado.
 *
 * Premissa deste arquivo: "quais construções este código exige" é uma pergunta
 * de PARSER, não de julgamento. Entra código, sai um conjunto de chaves de
 * átomo (`atomKeys.ts`) com linha, coluna e trecho ofensor. Roda em
 * milissegundos, sem rede, sem chave de API, e tem poder de veto.
 *
 * Por que TypeScript e não acorn: o repositório NÃO tem acorn, nem
 * eslint-visitor-keys, nem esquery, nem eslint-scope — nem transitivamente
 * (medido em `app/node_modules`). Tem `typescript@5.8.3` como dependência
 * direta. Além de custar zero dependência nova, o AST do TypeScript modela
 * como NÓ o que o ESTree esconde em atributo: `typeof` é `TypeOfExpression` e
 * `!==` é `ExclamationEqualsEqualsToken`, em vez de `UnaryExpression[operator]`
 * e `BinaryExpression[operator]`. E a versão fica presa em 5.8.3, longe da
 * armadilha do `typescript@7`, que moveu a API de AST de lugar.
 *
 * PARSEIE TUDO, REPROVE NO ORÇAMENTO. O extrator nunca restringe a gramática:
 * restringir no parser produz "unexpected token", que não ensina nada a quem
 * escreve a trilha. Ele aceita a linguagem inteira e devolve o que encontrou;
 * quem reprova é `budget.ts`.
 *
 * Além dos seis eixos de `atomKeys.ts`, este módulo emite o eixo `form:`
 * previsto em §3.1: FORMAS de uso (pares construção × restrição de forma),
 * casadas por um seletor mínimo sobre o MESMO AST. A bateria de formas é fixa
 * e vive em `form/rules.ts` (compilada na carga — seletor malformado é erro de
 * inicialização, nunca silêncio); este arquivo só aplica as regras compiladas.
 * É mudança ADITIVA: liberar `FunctionDeclaration` não libera função como valor
 * de variável, e liberar `if` não libera `if` sem `else` (I9/I11).
 *
 * LIMITE CONHECIDO E DECLARADO: a resolução de escopo é PLANA — o extrator
 * junta todos os nomes declarados no arquivo e trata como global o identificador
 * que sobrou. Para trecho de aula (dezenas de linhas) isso acerta; um shadowing
 * deliberado de nome global (`const console = …`) faria o extrator deixar de
 * reportar `global:console`. Está documentado aqui porque um gate com limite
 * escondido é pior que gate nenhum.
 *
 * ─── O QUE VEM DO ADAPTADOR DE LINGUAGEM (onda 5) ─────────────────────────
 *
 * Três responsabilidades deste arquivo passaram a ser PEDIDAS ao adaptador
 * (`engine/lang/registry.ts`, os 15 membros do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md`) em vez de
 * implementadas aqui:
 *
 *   - a ÁRVORE            → `adapter.parse(code, {fileName, dialect})`
 *                           (era `ts.createSourceFile` + `syntaxDiagnostics`);
 *   - a RESOLUÇÃO DE ESCOPO → `adapter.resolveScopes(parsed)`
 *                           (era `collectDeclaredNames`, apagada);
 *   - os GLOBAIS DE RUNTIME → `adapter.globals()`
 *                           (era a lista literal de `RUNTIME_GLOBALS`).
 *
 * ─── ONDA 7: DUAS CAMINHADAS, E POR QUE NÃO DÁ PARA SER UMA SÓ ────────────
 *
 * Até a onda 6 este módulo era JAVASCRIPT-ONLY por guarda explícita, e o
 * comentário que ficava aqui dizia o motivo certo: a caminhada depende de
 * `ts.isPropertyAccessExpression`, `ts.isElementAccessExpression`, do eixo
 * `form:` (seletores casados contra o AST do TypeScript) e das posições
 * absolutas de cada nó — nada disso existe no `LangNode` normalizado. A
 * conclusão de lá ("porta um extrator novo quem porta a caminhada inteira") é
 * exatamente o que esta onda fez: o módulo passou a ter DUAS caminhadas.
 *
 *   - `caminharTsNode`   — a NATIVA, sobre `ts.Node`. Vale para `javascript` e
 *     para `typescript`, que compartilham o parser inteiro (o adaptador de TS é
 *     `jsParse` com `ScriptKind.TS`). Emite os seis eixos, `form:` incluso.
 *   - `caminharLangNode` — a GENÉRICA, sobre o `LangNode` do §6. Vale para
 *     `python`, cuja árvore vem de um SUBPROCESSO (`python3` + `ast` +
 *     `symtable`) e NÃO é um `ts.Node`: sem `kind`, sem `parent`, sem `ts.isX`.
 *     Escrita só contra a interface `LanguageAdapter`.
 *
 * A guarda continua FAIL-CLOSED — `exigirAdaptadorComCaminhada` REPROVA com
 * `EngineLinguagemError` toda linguagem sem caminhada, em vez de auditar Ruby
 * com o parser de JavaScript e aprovar qualquer coisa. O que mudou é que
 * `typescript` e `python` deixaram de cair nela.
 *
 * As DUAS caminhadas consomem `adapter.constructKey` (o membro 2 dos 15 do §6),
 * que até a onda 6 não tinha consumidor nenhum. Cada nó rende DUAS chaves — a
 * genérica (`node:<tipo>`) e a específica do adaptador —, como este arquivo já
 * fazia com `node:ComputedNonLiteralAccess`. É isso que leva ao gate as chaves
 * SINTÉTICAS que os adaptadores criaram: `node:IntLiteral`/`node:StrLiteral`/
 * `node:Elif`/`node:MethodDef` (Python) e `node:KeyOfType`/
 * `node:ReadonlyArrayType`/`node:TypeOnlyImport`/`node:DoubleAssertionViaUnknown`
 * (TypeScript). Sem elas, uma aula de Python que ensina TEXTO introduziria ZERO
 * construção nova — `7` e `"oi"` são o MESMO `ast.Constant` — e o gate A6 a
 * reprovaria.
 *
 * O que este arquivo NÃO faz: não sabe o que é permitido (é `budget.ts`), não
 * lê trilha (é `audit.ts`) e não chama LLM nenhuma — nunca.
 *
 * Referência: `docs/16-engine-de-trilha.md` §5.3.
 */

import * as ts from 'typescript';
import {
  AtomKey,
  DeclarationKind,
  OperatorFamily,
  apiKey,
  declKey,
  globalKey,
  nodeKey,
  opKey,
} from './atomKeys';
import { FORM_RULES } from './form/rules';
import { selectorMatches } from './form/selector';
import { kindName } from './kindNames';
import { jsViewNode } from './lang/javascript';
import { tsScanSuppressionDirectives } from './lang/typescript';
import {
  DEFAULT_ADAPTER_ID,
  getAdapter,
  type LangNode,
  type LanguageAdapter,
  type LanguageId,
  type ParseOk,
} from './lang/registry';

// A tabela canônica de nomes de SyntaxKind mudou de casa para o módulo folha
// `engine/kindNames.ts` (ela era COPIADA em `form/selector.ts`; ver o cabeçalho
// de lá). A API pública deste módulo não muda: quem fazia
// `import { kindName } from '../extract'` continua fazendo.
export { kindName };

/** Tamanho máximo do trecho ofensor citado na violação (uma linha legível). */
export const SNIPPET_MAX_CHARS = 72;

/** Uma ocorrência de uma construção: onde ela apareceu e com que texto. */
export interface AtomOccurrence {
  key: AtomKey;
  /** 1-based, como todo editor mostra. */
  line: number;
  /** 1-based. */
  column: number;
  snippet: string;
  /**
   * posição absoluta (offset 0-based) do INÍCIO da ocorrência no código —
   * ADITIVO (rodada 12): é o que a bateria A13–A16 usa para classificar a
   * ocorrência dentro/fora dos spans mecânicos S13 e para a contagem por
   * linha do A14b.
   */
  start: number;
  /** posição absoluta do fim (exclusivo) — ADITIVO. */
  end: number;
}

export interface ExtractOk {
  ok: true;
  /** chaves únicas, em ordem estável (ordem alfabética). */
  keys: AtomKey[];
  /** PRIMEIRA ocorrência de cada chave — é o que a violação cita. */
  occurrences: AtomOccurrence[];
}

export interface ExtractAllOk {
  ok: true;
  /**
   * TODAS as ocorrências, na ordem de visita do AST (≈ ordem do código) —
   * o `extractAtoms` deduplica para a primeira por chave; esta variante
   * expõe cada ocorrência individual. ADITIVA (rodada 12).
   */
  occurrences: AtomOccurrence[];
  /** chaves únicas, em ordem alfabética — igual ao `extractAtoms`. */
  keys: AtomKey[];
}

export interface ExtractError {
  ok: false;
  error: { code: 'PARSE_ERROR'; message: string; line: number; column: number };
}

export type ExtractResult = ExtractOk | ExtractError;
export type ExtractAllResult = ExtractAllOk | ExtractError;

/**
 * Globais do runtime — o eixo `global:` do vocabulário.
 *
 * FONTE: `adapter.globals()` (`engine/lang/javascript.ts`, membro 4 dos 15 do
 * §6). A lista literal que vivia AQUI foi apagada na onda 5: ela era a cópia
 * de origem do `jsGlobals()` do adaptador, e duas cópias da mesma expressão
 * são duas oportunidades de divergir. O adaptador continua LENDO DA MÁQUINA e
 * nunca digitando à mão — uma lista escrita à mão erra nos dois sentidos:
 * esquecer um nome faz o gate deixar passar, e inventar um nome (19,7% dos
 * pacotes citados por LLM não existem) faz o gate reprovar código correto.
 * `globalThis` é a fonte que não mente.
 *
 * O símbolo continua exportado com o mesmo nome porque
 * `engine/quality/minimal.ts:391` e `tests/engineVocab.test.ts:48` o importam.
 * É o conjunto do adaptador DEFAULT; quem tem uma linguagem na mão deve pedir
 * `getAdapter(id).globals()` ao registro.
 */
export const RUNTIME_GLOBALS: ReadonlySet<string> = getAdapter(DEFAULT_ADAPTER_ID).globals();

/** Operadores de atribuição — família própria porque `=` e `+=` são aulas distintas. */
const ASSIGNMENT_TOKENS: ReadonlySet<ts.SyntaxKind> = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** Operadores lógicos — separados dos binários porque curto-circuito é outra aula. */
const LOGICAL_TOKENS: ReadonlySet<ts.SyntaxKind> = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function familyOfBinary(kind: ts.SyntaxKind): OperatorFamily {
  if (ASSIGNMENT_TOKENS.has(kind)) return 'assign';
  if (LOGICAL_TOKENS.has(kind)) return 'logical';
  return 'binary';
}

/** Nome legível de um token de operador (`!==`, `+=`, `??`). */
function operatorText(kind: ts.SyntaxKind): string {
  return ts.tokenToString(kind) ?? ts.SyntaxKind[kind];
}

/**
 * Pontuação (`+`, `{`, `=>`, `!==`) não vira chave do eixo `node:`. O operador
 * já é reportado pelo eixo `op:`, com família e texto; emitir também
 * `node:PlusToken` duplicaria a mesma construção em dois eixos e obrigaria todo
 * orçamento a listar as duas formas — dobrando a chance de esquecer uma.
 * Palavras-chave (`export`, `async`, `static`) CONTINUAM valendo: elas não têm
 * eixo próprio e são conteúdo de aula.
 */
function isPunctuationKind(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstPunctuation && kind <= ts.SyntaxKind.LastPunctuation;
}

/** `let` / `const` / `var` a partir das flags do TypeScript. */
function declarationKindOf(list: ts.VariableDeclarationList): DeclarationKind {
  if ((list.flags & ts.NodeFlags.Let) !== 0) return 'let';
  if ((list.flags & ts.NodeFlags.Const) !== 0) return 'const';
  return 'var';
}

/**
 * Caminho de um acesso a propriedade, quando ele é uma cadeia de identificadores
 * (`console.log`, `assert.deepEqual`, `Array.isArray`). Devolve null quando o
 * receptor não é identificável — nesse caso o extrator emite a forma `.<prop>`,
 * que ainda é suficiente para vigiar `.push` ou `.length` antes de serem
 * ensinados, sem fingir que resolveu o tipo do receptor.
 */
function identifierChain(node: ts.PropertyAccessExpression): string | null {
  const parts: string[] = [node.name.getText()];
  let cur: ts.Expression = node.expression;
  while (ts.isPropertyAccessExpression(cur)) {
    parts.unshift(cur.name.getText());
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) {
    parts.unshift(cur.text);
    return parts.join('.');
  }
  return null;
}

/**
 * true quando o identificador está em posição de VALOR (e não de nome/rótulo).
 *
 * POR QUE ELA É EXPORTADA (onda 5): esta é a ÚNICA peça de resolução de escopo
 * que sobrou neste arquivo, e ela sobrou por um motivo de contrato, não por
 * esquecimento. `ScopeResolution` (`engine/lang/registry.ts:281`) devolve
 * CONJUNTOS DE NOMES (`declared`/`imported`/`free`/`globals`) — e o extrator
 * precisa de POSIÇÃO: ele emite uma `AtomOccurrence` por OCORRÊNCIA de
 * `global:<nome>`, com linha, coluna e offsets. Saber que `Error` é global no
 * arquivo não diz QUAL dos três `Error` do texto é a referência de valor.
 *
 * A cópia gêmea desta função é a closure `ehReferenciaDeValor`, privada dentro
 * de `jsResolveScopes` (`engine/lang/javascript.ts:542`). Ela some no momento
 * em que a interface expuser a posição das ocorrências livres (ver o handoff
 * desta onda: `ScopeResolution.freeOccurrences`, ou um membro
 * `isValueReference(node)` no adaptador) — e esta função exportada é o alvo da
 * delegação. Enquanto isso, esta é a que o extrator usa.
 */
export function isValueReference(node: ts.Identifier): boolean {
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

// ---------------------------------------------------------------------------
// As guardas de linguagem (fail-closed) — uma para o extrator, uma para as
// baterias de qualidade que continuam sendo javascript-only
// ---------------------------------------------------------------------------

/** Código do erro estruturado de linguagem sem extrator determinístico. */
export const LINGUAGEM_SEM_EXTRATOR = 'LINGUAGEM_SEM_EXTRATOR' as const;

/**
 * Erro ESTRUTURADO de "esta peça da engine não existe para esta linguagem".
 *
 * Existe porque a alternativa é pior de um jeito específico: sem a guarda, um
 * `challenge.language: 'python'` seria parseado pelo compilador TypeScript, e
 * um gate que analisa Python com o parser de JavaScript não reprova nada — ele
 * APROVA em silêncio. A mesma decisão do registro (`getAdapter` LANÇA em vez de
 * cair no default, `engine/lang/registry.ts:39-45`): um resultado errado e
 * silencioso é o modo de falha que esta engine existe para eliminar.
 */
export class EngineLinguagemError extends Error {
  readonly code: typeof LINGUAGEM_SEM_EXTRATOR = LINGUAGEM_SEM_EXTRATOR;
  constructor(
    readonly detalhes: {
      modulo: string;
      pedido: string;
      /**
       * O que ESTE chamador suporta. Era sempre `DEFAULT_ADAPTER_ID`, porque só
       * havia um caso; na onda 7 o extrator passou a suportar TRÊS linguagens e
       * o campo virou uma LISTA — dizer "(só javascript)" a quem pediu Python
       * num módulo que já sabe Python seria mentir na mensagem de erro.
       */
      suportado: LanguageId | readonly LanguageId[];
      motivo: string;
    },
  ) {
    const suportadas = Array.isArray(detalhes.suportado)
      ? detalhes.suportado.join(', ')
      : String(detalhes.suportado);
    super(
      `${detalhes.modulo}: sem implementação para a linguagem ${JSON.stringify(detalhes.pedido)} ` +
        `(só ${suportadas}) — ${detalhes.motivo}`,
    );
    this.name = 'EngineLinguagemError';
  }
}

/**
 * Resolve o adaptador e REPROVA o que o MÓDULO CHAMADOR não sabe fazer.
 *
 * `getAdapter` já é fail-closed para id desconhecido; esta guarda cobre o caso
 * seguinte — id CONHECIDO (Python registrado, por exemplo) cuja implementação
 * no chamador não existe. As duas falhas são estruturadas e dizem o que falta.
 *
 * ONDA 7 — QUEM AINDA A USA, E POR QUÊ ELA NÃO FOI AFROUXADA. O extrator
 * DEIXOU de chamá-la (ele agora tem duas caminhadas; ver
 * `exigirAdaptadorComCaminhada` logo abaixo). Quem continua chamando são as
 * cinco baterias de qualidade — `quality/{minimal,mutants,solvable,
 * requirements,progressao}.ts` —, e para elas o javascript-only continua sendo
 * a resposta CERTA: as tabelas delas (`H13`, `AX`, a lista de mutantes, os
 * globais de runtime) são chaves do `ts.SyntaxKind` e do runner `node:test`, e
 * os spans mecânicos S13 saem de `ts.createSourceFile`. Rodá-las numa trilha de
 * Python não daria erro: daria um veredito ERRADO E SILENCIOSO — tudo "não
 * demonstrado", todo desafio reprovado. Alargar ESTA função para destravar o
 * extrator teria arrastado as cinco junto; por isso o extrator ganhou guarda
 * própria em vez de esta perder a dela.
 */
export function exigirAdaptadorJavascript(
  modulo: string,
  motivo: string,
  language: string = DEFAULT_ADAPTER_ID,
): LanguageAdapter {
  const adapter = getAdapter(language);
  if (adapter.id !== DEFAULT_ADAPTER_ID) {
    throw new EngineLinguagemError({
      modulo,
      pedido: language,
      suportado: DEFAULT_ADAPTER_ID,
      motivo,
    });
  }
  return adapter;
}

// ---------------------------------------------------------------------------
// AS DUAS CAMINHADAS — e a guarda que continua fail-closed (onda 7)
// ---------------------------------------------------------------------------

/**
 * Como o extrator caminha a árvore de cada linguagem.
 *
 *   - `ts-node`     → a caminhada NATIVA sobre `ts.Node`. É a de sempre: ela
 *                     depende de `ts.isPropertyAccessExpression`, do eixo
 *                     `form:` (seletores casados contra o AST do TypeScript) e
 *                     das posições absolutas de cada nó.
 *   - `lang-node`   → a caminhada GENÉRICA sobre o `LangNode` normalizado do
 *                     §6, escrita SÓ contra a interface `LanguageAdapter`
 *                     (`parse` + `constructKey` + `resolveScopes`).
 *
 * POR QUE SÃO DUAS, E NÃO UMA. Não é preguiça de unificar: são árvores
 * diferentes por CONSTRUÇÃO. O `LangNode` do adaptador Python vem de um
 * SUBPROCESSO (`python3 -I -S vocab/py/extract_ast.py`, JSON pelo stdout) e
 * NÃO é um `ts.Node` — não tem `kind`, não tem `parent`, não responde a
 * `ts.isElementAccessExpression`. Forçar Python pelo caminho nativo exigiria
 * fabricar um `ts.Node` falso a partir de um `dict` do `ast` do CPython, que é
 * exatamente o trabalho que o `LangNode` existe para evitar. E o contrário —
 * mandar JavaScript pela genérica — custaria os dois eixos que só a nativa
 * entrega hoje (`form:`, e o `api:` de cadeia de acesso com escopo) e moveria
 * a POSIÇÃO reportada de toda ocorrência de operador.
 */
export const CAMINHADA_POR_LINGUAGEM: Readonly<Record<string, 'ts-node' | 'lang-node'>> = {
  javascript: 'ts-node',
  typescript: 'ts-node',
  python: 'lang-node',
};

/** As linguagens que ESTE módulo sabe caminhar, em ordem estável. */
export const LINGUAGENS_COM_CAMINHADA: readonly LanguageId[] = Object.keys(
  CAMINHADA_POR_LINGUAGEM,
).sort() as LanguageId[];

/**
 * Resolve o adaptador do extrator e REPROVA a linguagem sem caminhada.
 *
 * A guarda continua FAIL-CLOSED, e continua pelo mesmo motivo de sempre: sem
 * ela, um `challenge.language` sem implementação seria parseado com o parser da
 * linguagem errada, e um gate que analisa Ruby com o parser de JavaScript não
 * reprova nada — ele APROVA em silêncio. O que mudou na onda 7 é QUEM cai nela:
 * `typescript` e `python` deixaram de cair, porque agora existe caminhada para
 * os dois. Porta uma linguagem nova quem acrescenta a linha em
 * `CAMINHADA_POR_LINGUAGEM` — e quem escolhe 'lang-node' está declarando que o
 * adaptador entrega tudo pela interface do §6.
 */
export function exigirAdaptadorComCaminhada(language: string = DEFAULT_ADAPTER_ID): LanguageAdapter {
  const adapter = getAdapter(language);
  if (CAMINHADA_POR_LINGUAGEM[adapter.id] === undefined) {
    throw new EngineLinguagemError({
      modulo: 'engine/extract.ts',
      pedido: language,
      suportado: LINGUAGENS_COM_CAMINHADA,
      motivo:
        'acrescente a linguagem a CAMINHADA_POR_LINGUAGEM depois de conferir que o adaptador dela ' +
        'entrega parse/constructKey/resolveScopes pela interface do §6',
    });
  }
  return adapter;
}

export interface ExtractOptions {
  /** Nome usado nas mensagens (não abre arquivo — o conteúdo vem em `code`). */
  fileName?: string;
  /** `js` (default) ou `ts`. O extrator é o mesmo; muda só o ScriptKind. */
  dialect?: 'js' | 'ts';
  /**
   * Qual ADAPTADOR parseia, resolve escopo e mapeia nó→chave. Default: o
   * adaptador default (`javascript`).
   *
   * ONDA 7: `typescript` e `python` passaram a valer. Um id sem caminhada neste
   * módulo continua LANÇANDO `EngineLinguagemError` — ver
   * `exigirAdaptadorComCaminhada` e o cabeçalho deste arquivo.
   */
  language?: LanguageId;
}

/**
 * VARREDURAS DE TRIVIA — o que a caminhada do AST NÃO PODE ver.
 *
 * `@ts-ignore` e `@ts-expect-error` são COMENTÁRIOS, e este arquivo depende
 * explicitamente de "comentário não é nó" (é o que faz um `// test(` comentado
 * não contar em `countTestDeclarations`). As duas estão em
 * `TS_FORBIDDEN_INVARIANTS` desde a onda 6 e, até a onda 7, eram proibição SEM
 * EMISSOR: a lista existia no papel e o gate passava em silêncio. O emissor é
 * `tsScanSuppressionDirectives`, que varre a trivia POR TOKEN (`forEachChild`
 * pula a pontuação, e um comentário colado num `}` é trivia de um token que a
 * caminhada nunca visita) e não acha falso positivo dentro de string nem de
 * template — literal é NÓ, e nó não é trivia.
 *
 * A tabela é por LINGUAGEM porque a pergunta é por linguagem: em JavaScript
 * não existe diretiva de supressão de tipo para procurar.
 */
const VARREDURAS_DE_TRIVIA: Readonly<
  Record<
    string,
    (parsed: ParseOk) => readonly {
      key: string;
      line: number;
      column: number;
      start: number;
      end: number;
      snippet: string;
    }[]
  >
> = {
  typescript: tsScanSuppressionDirectives,
};

/**
 * A CAMINHADA NATIVA (`ts.Node`) — JavaScript e TypeScript.
 *
 * É a caminhada de sempre, byte a byte: ela emite os eixos `node:`, `decl:`,
 * `op:`, `api:`, `global:` e `form:` sobre o AST do compilador TypeScript.
 * O que a onda 7 acrescentou está em DOIS pontos, os dois marcados abaixo:
 * a chave ESPECÍFICA do adaptador (`constructKey`) ao lado da genérica, e o
 * fato de que o adaptador agora pode ser o de TypeScript.
 */
function caminharTsNode(
  code: string,
  adapter: LanguageAdapter,
  parsed: ParseOk,
  todas: AtomOccurrence[],
): void {
  const source = parsed.native as ts.SourceFile;

  // (5) A RESOLUÇÃO DE ESCOPO vem do adaptador. `scopes.declared` é o antigo
  // `collectDeclaredNames(...).all`, `scopes.imported` o `.imported`, e
  // `scopes.globals` é exatamente `¬declared ∧ RUNTIME_GLOBALS` — o cruzamento
  // que ficava inline no eixo `global:` logo abaixo. Com o adaptador de
  // TypeScript esse cruzamento é contra `tsGlobals()`, e é por isso que
  // `Partial<T>` em posição de TIPO passa a sair como `global:Partial`: o passe
  // que EMITE `global:` é este, e ele deixou de ser javascript-only.
  const scopes = adapter.resolveScopes(parsed);

  const record = (key: AtomKey, node: ts.Node): void => {
    const start = node.getStart(source);
    const end = node.getEnd();
    const pos = source.getLineAndCharacterOfPosition(start);
    const raw = code.slice(start, Math.min(start + SNIPPET_MAX_CHARS, code.length));
    todas.push({
      key,
      line: pos.line + 1,
      column: pos.character + 1,
      snippet: raw.split('\n')[0].trim(),
      start,
      end,
    });
  };

  const visit = (node: ts.Node): void => {
    // ── eixo `node:` — a estrutura (pontuação fica fora; ver isPunctuationKind)
    if (!isPunctuationKind(node.kind)) {
      const generica = nodeKey(kindName(node.kind));
      record(generica, node);

      // ── AS DUAS CHAVES (onda 7) — a genérica acima e a ESPECÍFICA do
      // adaptador (membro 2 dos 15 do §6). É o mesmo padrão que este arquivo já
      // usa com `node:ComputedNonLiteralAccess` ao lado de
      // `node:ElementAccessExpression`: o orçamento escrito contra a genérica
      // continua casando, e quem quiser a distinção ganha uma chave própria.
      //
      // Sem isto, TODA chave sintética do adaptador de TypeScript
      // (`node:KeyOfType`, `node:ReadonlyArrayType`, `node:TypeOnlyImport`,
      // `node:TypeOnlyExport`, `node:DoubleAssertionViaUnknown`) existiria,
      // seria testada e NUNCA chegaria ao gate — `keyof T` e `readonly T[]`
      // produzem o MESMO `node:TypeOperator`, e `as unknown as` é proibição
      // global sem emissor.
      //
      // SÓ O EIXO `node:` É PEDIDO AO ADAPTADOR AQUI, e não é arbitrário: os
      // outros eixos desta caminhada são emitidos com uma POSIÇÃO que o
      // `LangNode` do §6 não sabe expressar — `op:` aponta para o TOKEN do
      // operador, `api:` para o NOME da propriedade ou para o especificador do
      // import, e `global:` para a ocorrência do identificador. Aceitar a chave
      // do adaptador nesses eixos moveria a linha:coluna que a violação cita.
      const especifica = adapter.constructKey(jsViewNode(node, source));
      if (especifica !== null && especifica !== generica && especifica.startsWith('node:')) {
        record(especifica, node);
      }
    }

    if (ts.isVariableDeclarationList(node)) {
      record(declKey(declarationKindOf(node)), node);
    }

    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      record(opKey(familyOfBinary(kind), operatorText(kind)), node.operatorToken);
    } else if (ts.isPrefixUnaryExpression(node)) {
      const op = node.operator;
      const isUpdate = op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken;
      record(opKey(isUpdate ? 'update' : 'unary', operatorText(op)), node);
    } else if (ts.isPostfixUnaryExpression(node)) {
      record(opKey('update', operatorText(node.operator)), node);
    } else if (ts.isTypeOfExpression(node)) {
      record(opKey('unary', 'typeof'), node);
    } else if (ts.isDeleteExpression(node)) {
      record(opKey('unary', 'delete'), node);
    } else if (ts.isVoidExpression(node)) {
      record(opKey('unary', 'void'), node);
    }

    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression;
      const literal = ts.isStringLiteral(arg) || ts.isNumericLiteral(arg);
      if (!literal) record(nodeKey('ComputedNonLiteralAccess'), node);
    }

    if (ts.isPropertyAccessExpression(node)) {
      const chain = identifierChain(node);
      const root = chain ? chain.split('.')[0] : '';
      const rootIsApi = chain !== null && (!scopes.declared.has(root) || scopes.imported.has(root));
      if (chain && rootIsApi) {
        record(apiKey(chain), node);
      } else {
        record(apiKey(`.${node.name.getText()}`), node.name);
      }
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      if (!spec.startsWith('.') && !spec.startsWith('/')) {
        record(apiKey(spec), node.moduleSpecifier);
      }
    }

    // Eixo `global:`. `scopes.globals` já É `free ∩ adapter.globals()`, ou
    // seja `¬declarado ∧ global-de-runtime` — a mesma conjunção de antes, agora
    // calculada pelo adaptador. `isValueReference` continua aqui porque a
    // decisão é POR OCORRÊNCIA e `ScopeResolution` só carrega nomes (ver o
    // comentário da função).
    if (ts.isIdentifier(node) && isValueReference(node) && scopes.globals.has(node.text)) {
      record(globalKey(node.text), node);
    }

    for (const rule of FORM_RULES) {
      if (selectorMatches(rule.compiled, node)) record(rule.key, node);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
}

/**
 * A CAMINHADA GENÉRICA (`LangNode`) — o caminho de Python, e de toda linguagem
 * cujo adaptador entrega a árvore pela interface do §6.
 *
 * ELA NÃO É A NATIVA COM OUTRO NOME. A árvore aqui vem de um SUBPROCESSO: o
 * adaptador de Python roda `python3 -I -S vocab/py/extract_ast.py` com o fonte
 * no stdin e lê JSON do stdout. Cada nó já chega com `type`, `line`, `column`,
 * `start`, `end`, `text` e `attributes` — e sem `kind`, sem `parent` e sem
 * nenhum dos predicados `ts.isX` de que a caminhada nativa vive. Por isso aqui
 * NÃO existe eixo `form:` (`form/selector.ts` é tipado sobre `ts.Node`;
 * `PY_FORM_AXIS_SUPPORTED` é `false` e está declarado) e não existe passe
 * separado de `api:`/`global:`: quem produz esses dois é o próprio
 * `constructKey` do adaptador, a partir dos nós PORTADORES que o subprocesso
 * emite (`ApiRef`, `GlobalRef`) — cada um com linha e coluna próprias, que é o
 * que o relatório `arquivo:linha:coluna` exige. `resolveScopes` já foi
 * consumido lá dentro (o `symtable` do CPython resolve POR ESCOPO, e não de
 * forma plana como o lado JavaScript).
 *
 * AS DUAS CHAVES, e a exceção. Como na nativa, cada nó rende a ESPECÍFICA
 * (`constructKey`) e a GENÉRICA (`node:<type>`) — `x + 1` sai como
 * `node:BinOp` E `op:binary:+`, igual a `node:BinaryExpression` E `op:binary:+`
 * do lado JavaScript. A exceção é o nó PORTADOR (`LangNode.synthetic`): ele não
 * existe na árvore do `ast`, o adaptador o criou para carregar uma distinção
 * que o parser colapsa, e a genérica dele seria lixo — `node:Binding` não está
 * em `inventory()` e nenhum orçamento poderia declará-lo. Um portador rende SÓ
 * a chave de `constructKey` (`decl:unpack`, `global:len`, `api:math.sqrt`,
 * `op:compare:<` — ou `node:Elif`/`node:MethodDef`/`node:IntLiteral`, que são
 * portadores cuja chave JÁ é do eixo `node:`).
 *
 * A RAIZ NÃO ENTRA, pela mesma razão que `node:SourceFile` não entra na nativa:
 * `ts.forEachChild(source, visit)` começa nos FILHOS. Aqui também.
 */
function caminharLangNode(
  code: string,
  adapter: LanguageAdapter,
  parsed: ParseOk,
  todas: AtomOccurrence[],
): void {
  const record = (key: AtomKey, node: LangNode): void => {
    const raw = code.slice(node.start, Math.min(node.start + SNIPPET_MAX_CHARS, code.length));
    todas.push({
      key,
      line: node.line,
      column: node.column,
      snippet: raw.split('\n')[0].trim(),
      start: node.start,
      end: node.end,
    });
  };

  const visit = (node: LangNode): void => {
    const especifica = adapter.constructKey(node);
    if (especifica !== null) record(especifica, node);
    if (node.synthetic !== true) {
      const generica = nodeKey(node.type);
      if (generica !== especifica) record(generica, node);
    }
    for (const filho of node.children) visit(filho);
  };

  for (const filho of parsed.root.children) visit(filho);
}

/**
 * Caminhada comum do extrator: EXPOE TODA ocorrência de cada construção, na
 * ordem de visita do AST. O `extractAtoms` deduplica a partir daqui; o
 * `extractAllOccurrences` devolve a caminhada crua — é o que A13c (spans
 * mecânicos S13) e A14b (combo de novas por linha) exigem, e a POSIÇÃO
 * ABSOLUTA de cada ocorrência é o que permite decidir dentro/fora de um span
 * sem conversão de linha:coluna.
 *
 * PURO: mesma entrada, mesma saída. Sem IO, sem rede, sem estado. (O adaptador
 * de Python roda um subprocesso, e ele é determinístico e memoizado por fonte:
 * mesma entrada, mesma árvore.)
 */
function coletarOcorrencias(code: string, options: ExtractOptions): ExtractAllResult {
  const language = options.language ?? DEFAULT_ADAPTER_ID;
  const adapter = exigirAdaptadorComCaminhada(language);
  const caminhada = CAMINHADA_POR_LINGUAGEM[adapter.id];

  // (1) A ÁRVORE vem do adaptador. No caminho nativo é o mesmo
  // `createSourceFile` de sempre (com `setParentNodes`, que `isValueReference`
  // exige), mesmo `ScriptTarget`, mesmo `ScriptKind` por dialeto e MESMO erro
  // estruturado com linha/coluna 1-based do primeiro diagnóstico de sintaxe. No
  // caminho genérico é o subprocesso — que devolve exatamente o mesmo
  // `PARSE_ERROR` estruturado, por contrato de `ParseResult`.
  //
  // O `fileName` default só existe para o caminho nativo: em Python o nome vai
  // para o módulo analisado e aparece na mensagem de erro, e chamar um trecho
  // de Python de `trecho.mjs` seria mentir no relatório.
  const parsed = adapter.parse(code, {
    fileName: options.fileName ?? (caminhada === 'ts-node' ? 'trecho.mjs' : undefined),
    dialect: options.dialect,
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const todas: AtomOccurrence[] = [];
  if (caminhada === 'ts-node') caminharTsNode(code, adapter, parsed, todas);
  else caminharLangNode(code, adapter, parsed, todas);

  // A VARREDURA DE TRIVIA vem DEPOIS da caminhada e no FIM da lista, de
  // propósito: uma diretiva de comentário não tem lugar numa ordem de visita de
  // árvore — ela não é nó. O contrato de `extractAtoms` (dedup para a PRIMEIRA
  // ocorrência por chave) não se altera, porque as chaves da varredura
  // (`node:TsIgnoreDirective`, `node:TsExpectErrorDirective`) não são emitidas
  // por nó nenhum.
  const varredura = VARREDURAS_DE_TRIVIA[adapter.id];
  if (varredura !== undefined) {
    for (const achado of varredura(parsed)) {
      todas.push({
        key: achado.key,
        line: achado.line,
        column: achado.column,
        snippet: achado.snippet.slice(0, SNIPPET_MAX_CHARS),
        start: achado.start,
        end: achado.end,
      });
    }
  }

  return { ok: true, occurrences: todas, keys: [...new Set(todas.map((o) => o.key))].sort() };
}

/**
 * Extrai TODAS as ocorrências de cada construção, com posição absoluta.
 *
 * ADITIVA (rodada 12): a bateria A13–A16 (`engine/quality/progressao.ts`)
 * precisa classificar CADA ocorrência dentro/fora dos spans mecânicos S13
 * (testes) e por linha (A14b) — o `extractAtoms`, que deduplica para a
 * primeira ocorrência por chave, não entrega isso. A API canônica não muda.
 *
 * PURO: mesma entrada, mesma saída. Sem IO, sem rede, sem estado.
 */
export function extractAllOccurrences(code: string, options: ExtractOptions = {}): ExtractAllResult {
  return coletarOcorrencias(code, options);
}

/**
 * Extrai o conjunto de construções exigidas por um trecho de código.
 *
 * PURO: mesma entrada, mesma saída. Sem IO, sem rede, sem estado.
 */
export function extractAtoms(code: string, options: ExtractOptions = {}): ExtractResult {
  const todas = coletarOcorrencias(code, options);
  if (!todas.ok) return todas;

  // deduplicação para a PRIMEIRA ocorrência por chave — o contrato histórico
  // do extrator ("a violação cita a primeira ocorrência"), preservado byte a
  // byte: a caminhada é a MESMA, só a projeção muda.
  const firstSeen = new Map<AtomKey, AtomOccurrence>();
  for (const occ of todas.occurrences) {
    if (!firstSeen.has(occ.key)) firstSeen.set(occ.key, occ);
  }

  const occurrences = [...firstSeen.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  return { ok: true, keys: occurrences.map((o) => o.key), occurrences };
}

/**
 * Conta declarações de teste (`test('…', …)`) por AST — o lado DECLARADO da
 * dupla-igualdade (`declarado == executado == expectedTestCount`).
 *
 * Existe UMA função para isso na engine, e é esta. O repositório tem hoje TRÊS
 * implementações com DUAS semânticas — uma tira comentários antes de contar,
 * as outras não — e a consequência medida é concreta: um `// test(` comentado
 * faz o validador semântico entrar em retry e devolver erro de JSON inválido
 * para sempre. Contagem por AST não tem esse problema: comentário não é nó.
 *
 * MULTILÍNGUA (onda 5): o membro do §6 é `adapter.countDeclared`.
 *
 * ONDA 6 — O CORPO MUDOU DE CASA e esta função virou o DESPACHANTE PURO. Até a
 * onda 5 a implementação de JavaScript morava aqui e `lang/javascript.ts`
 * (`jsCountDeclared`) a alcançava por `require('../extract')`: um caminho
 * RELATIVO, invisível ao Rollup, que sobrevivia literal ao bundle do main e
 * apontava para `out/extract` — inexistente. Efeito medido: no app EMPACOTADO,
 * `runStudentCode` (a submissão do aluno) e `verifyChallengePair` lançavam
 * MODULE_NOT_FOUND ao pedir a contagem declarada. Além disso o `require`
 * arrastava o EXTRATOR INTEIRO (com as regras de forma e o seletor) para dentro
 * de uma contagem de `test(`.
 *
 * Agora a seta aponta para o adaptador em TODA linguagem, inclusive a default —
 * sem o `if` por exclusão, porque não há mais corpo local para o qual desviar e
 * `jsCountDeclared` é auto-contido (usa o `ts()` postergado do adaptador).
 * Uma implementação, um lugar — o que muda é quem pergunta.
 */
export function countTestDeclarations(
  testsCode: string,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): number {
  return getAdapter(language).countDeclared(testsCode);
}
