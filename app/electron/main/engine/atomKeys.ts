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
 * O eixo `form:` previsto em `docs/16-engine-de-trilha.md` §3.1 (restrição de
 * FORMA de uso, ex.: `if` sem `else`) NÃO é emitido por este módulo: ele exige
 * seletor sobre a árvore e entra junto com o gate de forma. As chaves aqui são
 * as que o extrator determinístico (`extract.ts`) sabe produzir hoje.
 *
 * O que este arquivo NÃO faz: não parseia (é `extract.ts`), não decide o que é
 * permitido (é `budget.ts`) e não conhece trilha nenhuma. É só o alfabeto.
 *
 * Referência: `docs/16-engine-de-trilha.md` §3.1 e §5.3.
 */

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
 * Referência: `docs/16-engine-de-trilha.md` §5.3.
 */
export const FORBIDDEN_ALWAYS: readonly AtomKey[] = [
  'global:eval',
  'global:Function',
  'node:WithStatement',
  'node:DebuggerStatement',
  'node:LabeledStatement',
  'node:CommaListExpression',
  'global:arguments',
  'node:ComputedNonLiteralAccess',
] as const;

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_ALWAYS);

export function isForbiddenAlways(key: AtomKey): boolean {
  return FORBIDDEN_SET.has(key);
}

/**
 * HARNESS DE TESTE — as construções que o aluno LÊ em todo desafio e nunca
 * escreve: `export function …` no starter e `import … from './solution.mjs'`
 * mais `test('x', () => …)` no arquivo de teste.
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
