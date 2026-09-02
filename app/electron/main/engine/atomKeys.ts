/**
 * app/electron/main/engine/atomKeys.ts — o VOCABULÁRIO FECHADO de construções.
 *
 * Problema real: a trilha `nodejs-do-zero` cobra, no desafio da aula 1, oito
 * construções que nenhuma aula ensinou (`function`, parâmetro, `if`, `typeof`,
 * `!==`, `throw`, `new Error`, `return`, concatenação com `+`). A proibição
 * "desafio só cobra o que já foi ensinado" só vira gate se "construção" for um
 * DADO — uma string estável, comparável por igualdade, que sai de um parser e
 * não de uma opinião. Este arquivo define essa string.
 *
 * A premissa que dita o formato: metade da didática de JavaScript não está no
 * TIPO do nó, está no ATRIBUTO. `let`, `const` e `var` são a mesma declaração;
 * `===`, `!==` e `+` são o mesmo operador binário. Um vocabulário só de tipos
 * de nó não distingue a aula "let" da aula "const" — que é exatamente o pedido
 * do dono do produto ("variáveis pode render mais aulas porque tem let, const,
 * var"). Por isso a chave tem SEIS EIXOS, e não um:
 *
 *   node:<Nome>            estrutura      node:IfStatement, node:ArrowFunction
 *   decl:<kind>            declaração     decl:let, decl:const, decl:var
 *   op:<familia>:<op>      operador       op:binary:!==, op:unary:typeof, op:assign:+=
 *   global:<nome>          global         global:Error, global:console
 *   api:<caminho>          API/membro     api:console.log, api:Array.prototype.push
 *   term:<termo>           prosa pt-BR    term:atribuicao
 *
 * E existe um SÉTIMO eixo, que este módulo NÃO CONSTRÓI mas RECONHECE:
 *
 *   form:<seletor>        forma de uso  form:IfStatement[alternate=null]
 *
 * Ele não tem construtor aqui porque a chave é a serialização de um SELETOR
 * compilado — quem a monta é `formKey` (`engine/form/selector.ts:360`), sobre
 * um seletor já parseado, e inventar um `formKey(string)` neste arquivo daria
 * uma segunda forma de escrever a mesma chave sem passar pela validação de
 * carga (A-P06-4). Mas ele É EMITIDO pelo extrator (`engine/extract.ts:435-437`
 * aplica a bateria de `form/rules.ts` sobre o mesmo AST), CASA o `ATOM_KEY_RE`
 * abaixo e É RECONHECIDO por `axisOf` — e a `HARNESS_RECEPTIVE_SEED` deste
 * arquivo já traz duas chaves `form:`.
 *
 * (Este parágrafo corrige um comentário que afirmava o contrário — "o eixo
 * `form:` NÃO é emitido por este módulo: ele entra junto com o gate de forma" —
 * escrito antes da rodada que ligou o eixo. Comentário que mente é pior que
 * comentário ausente: quem lesse o antigo concluiria que uma violação `form:`
 * é impossível, e é justamente uma das que o gate mais emite.)
 *
 * O que este arquivo NÃO faz: não parseia (é `extract.ts`), não decide o que é
 * permitido (é `budget.ts`) e não conhece trilha nenhuma. É só o alfabeto.
 *
 * Referência: `docs/16-engine-de-trilha.md` §3.1 e §5.3.
 */

import { DEFAULT_ADAPTER_ID, getAdapter, type LanguageId } from './lang/registry';

/** Os seis eixos de uma chave de átomo. `form` é reservado (ver cabeçalho). */
export type AtomAxis = 'node' | 'decl' | 'op' | 'global' | 'api' | 'term';

/** Uma chave de átomo já normalizada (ex.: `op:unary:typeof`). */
export type AtomKey = string;

/** Prefixo canônico de cada eixo — a ordem é a de leitura do documento. */
export const AXIS_PREFIX: Record<AtomAxis, string> = {
  node: 'node',
  decl: 'decl',
  op: 'op',
  global: 'global',
  api: 'api',
  term: 'term',
};

/** Famílias de operador. `assign` cobre `=` e os compostos (`+=`, `??=`, …). */
export type OperatorFamily = 'binary' | 'logical' | 'unary' | 'update' | 'assign' | 'other';

export const OPERATOR_FAMILIES: readonly OperatorFamily[] = [
  'binary',
  'logical',
  'unary',
  'update',
  'assign',
  'other',
] as const;

/** `let` | `const` | `var` — o que separa três aulas distintas. */
export type DeclarationKind = 'let' | 'const' | 'var';

export const DECLARATION_KINDS: readonly DeclarationKind[] = ['let', 'const', 'var'] as const;

// ─── construtores (a única forma legítima de criar uma chave) ────────────────
//
// São funções, e não template literal solta no meio do extrator, porque a chave
// é comparada por igualdade em três lugares (extrator, orçamento, relatório):
// um espaço a mais num deles faz o gate mentir em silêncio — que é o modo de
// falha que esta engine existe para eliminar.

export function nodeKey(name: string): AtomKey {
  return `node:${name}`;
}

export function declKey(kind: DeclarationKind): AtomKey {
  return `decl:${kind}`;
}

export function opKey(family: OperatorFamily, operator: string): AtomKey {
  return `op:${family}:${operator}`;
}

export function globalKey(name: string): AtomKey {
  return `global:${name}`;
}

export function apiKey(path: string): AtomKey {
  return `api:${path}`;
}

export function termKey(term: string): AtomKey {
  return `term:${term}`;
}

/** Regex de validação de chave — usada pelos testes e pelo carregador de orçamento. */
export const ATOM_KEY_RE = /^(node|decl|op|global|api|term|form):[^\s]+$/;

export function isAtomKey(value: unknown): value is AtomKey {
  return typeof value === 'string' && ATOM_KEY_RE.test(value);
}

/** Eixo de uma chave (`op:unary:typeof` → `op`). Retorna null se não for chave. */
export function axisOf(key: AtomKey): AtomAxis | 'form' | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const prefix = key.slice(0, i);
  if (
    prefix === 'node' ||
    prefix === 'decl' ||
    prefix === 'op' ||
    prefix === 'global' ||
    prefix === 'api' ||
    prefix === 'term' ||
    prefix === 'form'
  ) {
    return prefix;
  }
  return null;
}

/**
 * Rótulo humano de uma chave — é o que aparece na mensagem de erro que o autor
 * da trilha lê. Mensagem de gate que não diz o que a pessoa escreveu de errado
 * não conserta nada; por isso o rótulo cita o TOKEN, não o nome do nó.
 */
export function humanLabel(key: AtomKey): string {
  const axis = axisOf(key);
  const rest = key.slice(key.indexOf(':') + 1);
  switch (axis) {
    case 'decl':
      return `\`${rest}\``;
    case 'op': {
      const parts = rest.split(':');
      return `\`${parts.slice(1).join(':')}\``;
    }
    case 'global':
    case 'api':
      return `\`${rest}\``;
    case 'term':
      return `"${rest}"`;
    default:
      return `\`${rest}\``;
  }
}

/**
 * PROIBIÇÕES GLOBAIS — construções que quebram a decidibilidade da análise
 * estática. Se o código pode montar nomes em tempo de execução, nenhuma
 * promessa de orçamento se sustenta: `obj[expr]` com chave calculada, `eval` e
 * `new Function` tornam impossível saber o que está sendo usado.
 *
 * Não são "coisas difíceis" — são coisas que fazem o gate mentir. Por isso a
 * proibição vale em QUALQUER nível da trilha, e a única saída é exceção
 * declarada na própria aula.
 *
 * FONTE (onda 5): `adapter.forbiddenInvariants` — o membro 6 dos 15 do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md`. A lista literal que
 * vivia aqui foi apagada: cada linguagem tem o SEU veneno de decidibilidade
 * (`eval`/`new Function` em JavaScript; `eval`/`exec`/`getattr` dinâmico em
 * Python), e uma lista de JavaScript hospedada no alfabeto comum reprovaria
 * Python pelas construções erradas. Este símbolo é o do adaptador DEFAULT e
 * continua exportado porque `tests/engineLangRegistry.test.ts:172` e o
 * relatório o citam; quem tem uma linguagem na mão usa `isForbiddenAlways(key,
 * language)` ou pergunta ao registro.
 *
 * Referência: `docs/16-engine-de-trilha.md` §5.3.
 */
export const FORBIDDEN_ALWAYS: readonly AtomKey[] = getAdapter(DEFAULT_ADAPTER_ID)
  .forbiddenInvariants;

/** Memo por adaptador — a lista é imutável, o Set pode ser construído uma vez. */
const FORBIDDEN_SET_POR_ADAPTADOR = new Map<LanguageId, ReadonlySet<string>>();

function forbiddenSet(language: LanguageId): ReadonlySet<string> {
  const memo = FORBIDDEN_SET_POR_ADAPTADOR.get(language);
  if (memo !== undefined) return memo;
  const set = new Set<string>(getAdapter(language).forbiddenInvariants);
  FORBIDDEN_SET_POR_ADAPTADOR.set(language, set);
  return set;
}

/**
 * A chave quebra a decidibilidade NESTA linguagem? Default: o adaptador
 * default — os chamadores de JavaScript não mudam.
 */
export function isForbiddenAlways(key: AtomKey, language: LanguageId = DEFAULT_ADAPTER_ID): boolean {
  return forbiddenSet(language).has(key);
}

/**
 * HARNESS DE TESTE — as construções que o aluno LÊ em todo desafio e nunca
 * escreve: `export function …` no starter e `import … from './solution.mjs'`
 * mais `test('x', () => …)` no arquivo de teste.
 *
 * ATENÇÃO, MULTILÍNGUA: esta lista é de JAVASCRIPT — `node:ImportDeclaration`,
 * `api:node:test`, `api:assert.deepStrictEqual` e as duas chaves `form:` são
 * nomes de nó do AST do TypeScript e do runner `node:test`. Em Python o mesmo
 * papel seria `import unittest`/`def test_…`/`assertEqual`, chaves que não
 * existem aqui. Ela NÃO pôde virar membro do adaptador nesta onda porque a
 * interface dos 15 membros (`engine/lang/registry.ts:508`) não tem slot para
 * "semente receptiva do harness" nem para "estruturais sempre liberadas" — a
 * lacuna está registrada no handoff da onda. Enquanto o slot não existe, o
 * acesso correto é por `harnessReceptiveSeed(language)` (abaixo), que é
 * FAIL-CLOSED: pedir a semente de uma linguagem que não a tem LANÇA, em vez de
 * semear um orçamento de Python com o harness do Node.
 *
 * Medição que justifica esta lista existir: 45 das 60 violações dos módulos
 * 1–3 da trilha atual são exatamente estas construções. Sem separá-las, o gate
 * só tem duas saídas ruins — proibir o próprio runner de teste (inviável) ou
 * liberar tudo (inútil).
 *
 * Presente no orçamento RECEPTIVO desde a aula 1 (política `receptive-seed`,
 * `docs/16-engine-de-trilha.md` §3.2 e D1); NUNCA no produtivo, porque o aluno
 * jamais é cobrado por escrever isto.
 */
export const HARNESS_RECEPTIVE_SEED: readonly AtomKey[] = [
  'node:ExportKeyword',
  'node:ImportDeclaration',
  'node:ImportSpecifier',
  'node:ImportClause',
  'node:NamedImports',
  'node:ArrowFunction',
  'node:CallExpression',
  'node:Identifier',
  'node:StringLiteral',
  // `assert.equal(f(1), 1)` — a chamada de asserção é um acesso a propriedade e
  // quase todo caso de teste carrega um número. Não há arquivo de teste possível
  // sem os dois: se ficarem de fora da semente, TODO desafio da trilha nasce
  // violado por causa do runner, e o gate vira ruído que ninguém lê.
  'node:PropertyAccessExpression',
  'node:NumericLiteral',
  'node:Block',
  'node:SourceFile',
  'node:ExpressionStatement',
  'api:node:test',
  'api:node:assert',
  'api:node:assert/strict',
  'api:test',
  'api:assert.equal',
  'api:assert.strictEqual',
  'api:assert.deepEqual',
  'api:assert.deepStrictEqual',
  'api:assert.throws',
  'api:assert.ok',
  'global:assert',
  'global:test',
  // FORMAS que o PRÓPRIO harness/starter congela no corpus real (A-P06-2):
  //   - o runner de teste escreve `assert.throws(() => f(x))` no testsCode →
  //     `form:ArrowFunction[body!=Block]` — arrow de EXPRESSÃO que o aluno lê
  //     em todo desafio com cenário de erro (challenge.json:10 de `cumprimentar`);
  //   - o starter congela a assinatura com default (`export function f(nome,
  //     versao = '1.0.0')` em `npm-e-package-json`) →
  //     `form:Parameter[initializer!=null]` — leitura obrigatória que o aluno
  //     não edita.
  // São RELEITURA obrigatória sem aula nenhuma, como as demais chaves desta
  // semente; entram no orçamento RECEPTIVO pela política `receptive-seed`
  // (`docs/16-engine-de-trilha.md` §3.2/D1; `entryAxiom` em budget.ts as joga
  // no receptivo de ENTRADA da aula 1 e elas se acumulam daí em diante).
  // NUNCA no produtivo: uma AULA que ensine arrow de expressão — ou default de
  // parâmetro — como CONTEÚDO continua exigindo aula própria (A2/A3/A6 mantidos
  // para a forma como conteúdo ensinado; a isenção é só receptiva do harness).
  'form:ArrowFunction[body!=Block]',
  'form:Parameter[initializer!=null]',
] as const;

/**
 * Construções ESTRUTURAIS que todo programa tem e que não ensinam nada: exigir
 * que a trilha "introduza" `SourceFile` ou `ExpressionStatement` transformaria
 * o gate em ruído. Ficam sempre liberadas nas DUAS faixas.
 *
 * A lista é curta de propósito. Cada item aqui é uma construção que o gate
 * deixa de vigiar — a tentação de crescer esta lista para "fazer o gate passar"
 * é exatamente o modo de falha contra o qual a engine existe.
 */
export const STRUCTURAL_ALWAYS_ALLOWED: readonly AtomKey[] = [
  'node:SourceFile',
  'node:Identifier',
  'node:Block',
  'node:ExpressionStatement',
  'node:EndOfFileToken',
  'node:SyntaxList',
  'node:VariableStatement',
  'node:VariableDeclarationList',
  'node:VariableDeclaration',
] as const;

// ---------------------------------------------------------------------------
// As duas listas acima, ATRÁS DE UMA PORTA POR LINGUAGEM (fail-closed)
// ---------------------------------------------------------------------------
//
// Elas são de JavaScript (`node:SourceFile`, `node:SyntaxList` e
// `node:VariableDeclarationList` são nomes do enum `ts.SyntaxKind`; a semente é
// o harness do `node:test`), e a interface de 15 membros do §6 não tem slot
// para nenhuma das duas. Enquanto o slot não existir, estas funções são a
// fronteira: elas nomeiam a dependência de linguagem, e REPROVAM em vez de
// devolver a tabela errada. Quem chama sem argumento (todo chamador de hoje)
// recebe exatamente a lista de antes.

/** Erro estruturado: a linguagem não tem tabela declarada neste alfabeto. */
export class TabelaDeLinguagemAusenteError extends Error {
  readonly code = 'TABELA_DE_LINGUAGEM_AUSENTE' as const;
  constructor(
    readonly detalhes: { tabela: string; pedido: string; disponivel: LanguageId },
  ) {
    super(
      `engine/atomKeys.ts: a tabela "${detalhes.tabela}" só existe para ${detalhes.disponivel} ` +
        `(pedido: ${JSON.stringify(detalhes.pedido)}). Ela é conteúdo de LINGUAGEM (nomes de nó e ` +
        `API do runner de teste) e a interface LanguageAdapter ainda não tem membro para ela — ` +
        `ver o handoff da onda 5. Semear o orçamento com a tabela de outra linguagem faria o gate ` +
        `perdoar as construções erradas em silêncio.`,
    );
    this.name = 'TabelaDeLinguagemAusenteError';
  }
}

function exigirTabela(tabela: string, language: LanguageId): void {
  // `getAdapter` é fail-closed para id desconhecido; aqui a falha é o id
  // CONHECIDO cuja tabela não foi escrita.
  const adapter = getAdapter(language);
  if (adapter.id !== DEFAULT_ADAPTER_ID) {
    throw new TabelaDeLinguagemAusenteError({
      tabela,
      pedido: language,
      disponivel: DEFAULT_ADAPTER_ID,
    });
  }
}

/** A semente receptiva do harness DESTA linguagem (política `receptive-seed`). */
export function harnessReceptiveSeed(language: LanguageId = DEFAULT_ADAPTER_ID): readonly AtomKey[] {
  exigirTabela('HARNESS_RECEPTIVE_SEED', language);
  return HARNESS_RECEPTIVE_SEED;
}

/** As estruturais sempre liberadas DESTA linguagem (as duas faixas). */
export function structuralAlwaysAllowed(language: LanguageId = DEFAULT_ADAPTER_ID): readonly AtomKey[] {
  exigirTabela('STRUCTURAL_ALWAYS_ALLOWED', language);
  return STRUCTURAL_ALWAYS_ALLOWED;
}
