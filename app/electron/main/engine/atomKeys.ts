/**
 * app/electron/main/engine/atomKeys.ts — o VOCABULÁRIO FECHADO de construções.
 *
 * Problema real, medido na trilha que motivou esta engine (`nodejs-do-zero`,
 * apagada em 2026-09-02 — ver `docs/15-trilha-nodejs.md`): o desafio da aula 1
 * cobrava oito construções que nenhuma aula ensinou (`function`, parâmetro,
 * `if`, `typeof`, `!==`, `throw`, `new Error`, `return`, concatenação com
 * `+`). O conteúdo sumiu; o defeito que ele exemplifica é de gênero, e é
 * contra ele que este arquivo existe. A proibição
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
 * ONDA 6: TypeScript usa esta lista INTEIRA e acrescenta sete chaves de tipo —
 * ver `TYPESCRIPT_TYPE_HARNESS_SEED` e `TYPESCRIPT_HARNESS_RECEPTIVE_SEED`
 * logo abaixo. O acréscimo mora numa lista SEPARADA de propósito: crescer ESTA
 * lista liberaria as sete construções em toda trilha de JavaScript.
 *
 * Medição que justifica esta lista existir (na trilha de referência de 2026-08,
 * hoje apagada): 45 das 60 violações dos módulos 1–3 eram exatamente estas
 * construções. Sem separá-las, o gate só tem duas saídas ruins — proibir o
 * próprio runner de teste (inviável) ou liberar tudo (inútil).
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
 * O QUE O HARNESS DE TYPESCRIPT ACRESCENTA — as chaves de TIPO que todo
 * desafio da trilha carrega POR CONSTRUÇÃO, e que o aluno lê sem escrever.
 *
 * Estas sete vieram da spec de trilha de TypeScript da onda 6, apagada em
 * 2026-09-02 (o produto passou a ter UMA trilha, de Python — ver o cabeçalho de
 * `engine/lang/typescript.ts`). O motivo continua sendo o dela, e continua
 * valendo: o `test.ts` de qualquer desafio importa uma função TIPADA e a chama;
 * sem essas chaves na faixa receptiva, todo desafio de uma trilha de TypeScript
 * nasceria violando A3 por causa do próprio harness — que é exatamente o
 * defeito que a política `receptive-seed` existe para evitar. A lista é FECHADA
 * e o teste que a fecha é `tests/engineLangTypescript.test.ts` §8.
 *
 * O mecanismo, concretamente. Um `test.ts` mínimo é
 *
 *     import { dobro } from './solution.ts';
 *     test('dobro de 2', () => { assert.equal(dobro(2), 4); });
 *
 * e o `solution.ts` que ele importa é, por contrato da trilha,
 * `export function dobro(x: number): number`. Só aí já entram
 * `form:Parameter[type!=null]` (anotar o parâmetro),
 * `form:FunctionDeclaration[type!=null]` (anotar o retorno) e
 * `node:NumberKeyword`. `node:StringKeyword` e `node:BooleanKeyword`
 * acompanham porque são as outras duas keyword-types que a assinatura de um
 * desafio qualquer usa; `node:TypeReference` porque toda assinatura que
 * devolve um tipo BATIZADO (`Pessoa`, `Resultado`) passa por ele; e
 * `node:ArrayType` porque a função que recebe ou devolve lista é o caso mais
 * comum de desafio do produto. NENHUMA delas entra na faixa PRODUTIVA:
 * escrever a anotação continua sendo o conteúdo das aulas 1 a 4 do módulo 1 da
 * trilha, e uma aula que ENSINE a anotação continua exigindo aula própria.
 *
 * As duas chaves `form:` são exceção justificada pelo mesmo motivo das duas de
 * JavaScript acima: o eixo `form:` não existe em `vocab/atoms.json` (ele é a
 * serialização de um seletor compilado, não um item do vocabulário), e a
 * semente é o único lugar em que uma forma entra sem aula.
 */
export const TYPESCRIPT_TYPE_HARNESS_SEED: readonly AtomKey[] = [
  'form:Parameter[type!=null]',
  'form:FunctionDeclaration[type!=null]',
  'node:StringKeyword',
  'node:NumberKeyword',
  'node:BooleanKeyword',
  'node:TypeReference',
  'node:ArrayType',
] as const;

/**
 * A semente receptiva do harness de TYPESCRIPT: a de JavaScript INTEIRA (o
 * runner é o mesmo — `node:test` + `node:assert/strict`, mesmos nomes de nó do
 * mesmo `ts.SyntaxKind`) mais as sete chaves de tipo acima.
 *
 * Ela é uma lista SEPARADA, e não um acréscimo à de JavaScript, por uma razão
 * que se mede: `HARNESS_RECEPTIVE_SEED` semeia o orçamento RECEPTIVO da aula 1
 * de toda trilha da linguagem dela. Empurrar `node:TypeReference` para dentro
 * da lista de JavaScript liberaria, em silêncio, sete construções em TODA
 * trilha de JavaScript — o mesmo afrouxamento que este arquivo chama de "a
 * tentação de crescer a lista para fazer o gate passar". Conferido na época
 * (onda 6) contra a trilha de referência: o placar da auditoria de
 * `nodejs-do-zero` (717 violações · 112 desafios · 249 lacunas) não se movia
 * com esta mudança. A trilha foi apagada depois (2026-09-02); a separação das
 * listas continua sendo o que impede o afrouxamento.
 */
export const TYPESCRIPT_HARNESS_RECEPTIVE_SEED: readonly AtomKey[] = [
  ...HARNESS_RECEPTIVE_SEED,
  ...TYPESCRIPT_TYPE_HARNESS_SEED,
];

/**
 * A SEMENTE RECEPTIVA DO HARNESS DE PYTHON (ONDA 7; MEDIDA E CORRIGIDA NA 9).
 *
 * Fonte NORMATIVA: `docs/17-trilha-python.md` §"A semente receptiva do harness
 * Python", §"O formato exato do arquivo de teste — FASE SAÍDA" e §"A progressão
 * de canal". O harness de Python NÃO é o de JavaScript com outros nomes — é
 * outro runner (`unittest`, por descoberta) e outro invólucro. E ele tem DUAS
 * formas, porque a trilha tem duas fases de canal de saída.
 *
 * FASE VALOR (M4 em diante, `outputChannel: 'retorno'`) — o teste importa a
 * função do aluno e assevera o VALOR que ela devolve:
 *
 *     import unittest
 *
 *     from solucao import dobro
 *
 *     class TestDobro(unittest.TestCase):
 *         def test_dobro_de_2(self):
 *             """o dobro de 2 e 4"""
 *             self.assertEqual(dobro(2), 4)
 *
 * FASE SAÍDA (M1 a M3, `outputChannel: 'impressao'`) — a aula 1 é
 * `print("oi")`, e nessa altura o aluno ainda não tem função nem `return`. O
 * teste roda o ARQUIVO e assevera o que ele IMPRIMIU:
 *
 *     import contextlib
 *     import io
 *     import runpy
 *     import unittest
 *
 *     def rodar():
 *         """Roda solucao.py do zero e devolve tudo o que ele imprimiu."""
 *         saida = io.StringIO()
 *         with contextlib.redirect_stdout(saida):
 *             runpy.run_path("solucao.py")
 *         return saida.getvalue()
 *
 *     class TestAPrimeiraLinha(unittest.TestCase):
 *         def test_imprime_oi(self):
 *             """o programa imprime oi"""
 *             self.assertEqual(rodar(), "oi\n")
 *
 * O aluno LÊ isso em todo desafio e não escreve nada disso em nenhum: a classe,
 * o método `test_*`, o `self.assertEqual`, o `import unittest`, e — na fase
 * SAÍDA — o `with` da captura de `stdout`. Por isso a semente traz
 * `node:ClassDef` e `node:MethodDef` — que na trilha de JavaScript não teriam a
 * menor razão de existir — e NÃO traz uma linha sequer do `node:test`/`assert`
 * do Node.
 *
 * `node:IntLiteral` e `node:StrLiteral` entram pelo mesmo motivo que
 * `node:NumericLiteral`/`node:StringLiteral` entram na de JavaScript: não
 * existe caso de teste sem um número e um texto. A diferença é que em Python
 * essas duas chaves são SINTÉTICAS (`7` e `"oi"` são o MESMO `ast.Constant`;
 * ver `vocab/py/extract_ast.py`) — e é justamente por elas chegarem ao gate que
 * uma aula de TEXTO passa a introduzir construção nova em vez de ZERO.
 *
 * ── AS DOZE CHAVES DA FASE SAÍDA (onda 9) ────────────────────────────────────
 *
 * A lista da onda 7 tinha sido escrita contra a fase VALOR só, e um desafio da
 * fase SAÍDA reprovava em A3 (`testsCode ⊆ budget_ENTRADA.receptive`) por doze
 * chaves que a spec AUTORIZA — falso vermelho no harness, que é exatamente o
 * defeito que a política `receptive-seed` existe para evitar. As doze, medidas
 * (não copiadas) rodando o adaptador Python sobre o arquivo acima:
 *
 *   - `node:With` + `node:withitem` + `api:contextlib.redirect_stdout` — a
 *     captura de `stdout`. O `with` é conteúdo de M11; aqui ele é RELEITURA.
 *   - `node:Assign` + `decl:assign` — o `saida = io.StringIO()`. O par é
 *     obrigatório (§"A regra do par": `decl:assign` pressupõe `node:Assign`).
 *   - `api:io.StringIO` + `api:.getvalue` — o buffer e a leitura dele.
 *   - `api:runpy.run_path` — rodar o arquivo do aluno DO ZERO a cada chamada.
 *     Não é `importlib.import_module`: esse está em `PY_FORBIDDEN_INVARIANTS`
 *     (proibição GLOBAL) e além disso só executaria o arquivo na 1ª chamada, o
 *     que faria o 2º teste da mesma classe ler saída vazia.
 *   - `api:io`, `api:contextlib`, `api:runpy` e `api:unittest` — as chaves de
 *     MÓDULO. O extrator emite uma `ApiRef` por `alias` de cada `import`
 *     (`extract_ast.py`, ramo `ast.Import`), então `import io` sozinho já
 *     produz `api:io` — separado e além de `api:io.StringIO`, que vem do
 *     `ast.Attribute`. Estas quatro não estavam no delta declarado pela spec;
 *     saíram da MEDIÇÃO, e sem elas a fase SAÍDA continuaria vermelha.
 *
 * ── AS DUAS QUE SAÍRAM ───────────────────────────────────────────────────────
 *
 *   - `global:unittest` era impossível: o eixo `global:` só recebe BUILTIN livre
 *     no escopo (`extract_ast.py`, ramo `ast.Name`/`Load`), e `unittest` é
 *     IMPORTADO — `atoms.python.json` não o tem em `builtins`. Depois do
 *     `import` o nome está declarado, e o que o extrator emite é `api:unittest`.
 *   - `api:unittest.main` só apareceria dentro de `if __name__ == "__main__":`,
 *     que a trilha REMOVE de propósito: o runner é `unittest discover`, que
 *     nunca roda esse bloco. Medido, o bloco custaria seis chaves receptivas na
 *     aula 1 (`api:unittest.main`, `global:__name__`, `node:If`,
 *     `node:Compare`, `node:StrLiteral`, `op:compare:==`) por zero efeito.
 *
 * Semente é PERDÃO: cada chave aqui perdoa, para sempre, algo que o aluno não
 * aprendeu. Só entra o que o harness REALMENTE emite — e `engineLangPython`
 * §"o harness da fase SAÍDA cabe na semente" mede isso a cada `npm test`, para
 * que a defasagem não volte em silêncio.
 */
export const PYTHON_HARNESS_RECEPTIVE_SEED: readonly AtomKey[] = [
  'node:Module',
  'node:FunctionDef',
  'node:arguments',
  'node:arg',
  'node:Return',
  'node:Name',
  'node:Expr',
  'node:Call',
  'node:Attribute',
  'node:Import',
  'node:ImportFrom',
  'node:alias',
  'node:ClassDef',
  'node:MethodDef',
  'node:IntLiteral',
  'node:StrLiteral',
  // fase SAÍDA — a captura de `stdout` (`with contextlib.redirect_stdout(...)`)
  'node:With',
  'node:withitem',
  'node:Assign',
  'decl:assign',
  // os MÓDULOS que o `import` do harness declara, um por `alias`
  'api:unittest',
  'api:io',
  'api:contextlib',
  'api:runpy',
  // os MEMBROS que o harness chama
  'api:unittest.TestCase',
  'api:io.StringIO',
  'api:contextlib.redirect_stdout',
  'api:runpy.run_path',
  'api:.getvalue',
  'api:.assertEqual',
  'api:.assertTrue',
  'api:.assertIsNone',
  'api:.assertRaises',
] as const;

/**
 * As ESTRUTURAIS de Python — o análogo de `STRUCTURAL_ALWAYS_ALLOWED`, também
 * copiado de `docs/17-trilha-python.md` §"A semente receptiva do harness
 * Python": "São contexto de expressão e container — não carregam didática
 * nenhuma e listá-los em toda aula só aumentaria a chance de esquecer um."
 *
 * `node:Load`/`node:Store`/`node:Del` são o `expr_context` do `ast`: eles dizem
 * se um nome está sendo LIDO, ESCRITO ou APAGADO e aparecem em toda expressão —
 * são o caso mais puro de "nó que todo programa tem e que não ensina nada". A
 * lista NÃO é a de JavaScript: `node:SourceFile` e `node:VariableDeclarationList`
 * são nomes de `ts.SyntaxKind` e não existem no `ast` do Python.
 */
export const PYTHON_STRUCTURAL_ALWAYS_ALLOWED: readonly AtomKey[] = [
  'node:Module',
  'node:Name',
  'node:Load',
  'node:Store',
  'node:Del',
  'node:arguments',
  'node:Expr',
  'node:alias',
  'node:keyword',
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
// Elas são nomes do enum `ts.SyntaxKind` (`node:SourceFile`, `node:SyntaxList`,
// `node:VariableDeclarationList`) mais o harness do `node:test`, e a interface
// de 15 membros do §6 não tem slot para nenhuma das duas. Enquanto o slot não
// existir, estas funções são a fronteira: elas nomeiam a dependência de
// linguagem, e REPROVAM em vez de devolver a tabela errada. Quem chama sem
// argumento (todo chamador de hoje) recebe exatamente a lista de antes.
//
// ONDA 6 — `typescript` entra na porta, e ela continua fechada para o resto.
// As duas tabelas valem para ele por um motivo VERIFICÁVEL, não por parecença:
// é o MESMO compilador e o MESMO enum `ts.SyntaxKind` (o adaptador de
// TypeScript é composição sobre o de JavaScript — `lang/typescript.ts`), e é o
// MESMO runner (`node --test --test-reporter=spec test.ts`, sem flag no Node
// 24). O que muda é o ACRÉSCIMO: a semente ganha as sete chaves de tipo de
// `TYPESCRIPT_TYPE_HARNESS_SEED`; as estruturais não mudam nem uma linha,
// porque `SourceFile`/`Block`/`Identifier` são os mesmos nós nos dois
// dialetos.
//
// ONDA 7 — `python` entra, e entra pelo caminho OPOSTO ao de TypeScript: com
// DUAS TABELAS PRÓPRIAS, nenhuma linha compartilhada. Era isto que a versão
// anterior deste comentário dizia ("semear um orçamento de Python com
// `api:node:test` seria exatamente o erro que esta porta impede") e continua
// valendo palavra por palavra — o que mudou é que agora existem as tabelas
// CERTAS para copiar, e elas vêm de `docs/17-trilha-python.md`
// §"A semente receptiva do harness Python", não de uma tradução das de
// JavaScript. Sem elas `deriveTrackBudget` de uma trilha de Python nem começa:
// `entryAxiom` (`budget.ts:201`) pede `structuralAlwaysAllowed(language)` na
// primeira linha e a porta LANÇAVA. A porta continua fechada para o resto.

/** As linguagens cujas tabelas ESTE arquivo declara. */
export const LINGUAGENS_COM_TABELA: readonly LanguageId[] = [
  'javascript',
  'typescript',
  'python',
];

/** Erro estruturado: a linguagem não tem tabela declarada neste alfabeto. */
export class TabelaDeLinguagemAusenteError extends Error {
  readonly code = 'TABELA_DE_LINGUAGEM_AUSENTE' as const;
  constructor(
    readonly detalhes: { tabela: string; pedido: string; disponivel: readonly LanguageId[] },
  ) {
    super(
      `engine/atomKeys.ts: a tabela "${detalhes.tabela}" só existe para ${detalhes.disponivel.join(', ')} ` +
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
  if (!LINGUAGENS_COM_TABELA.includes(adapter.id)) {
    throw new TabelaDeLinguagemAusenteError({
      tabela,
      pedido: language,
      disponivel: LINGUAGENS_COM_TABELA,
    });
  }
}

/**
 * A semente receptiva do harness DESTA linguagem (política `receptive-seed`).
 *
 * TypeScript recebe a de JavaScript MAIS as sete chaves de tipo
 * (`TYPESCRIPT_TYPE_HARNESS_SEED`); Python tem lista PRÓPRIA, medida contra o
 * arquivo de teste que a trilha de fato escreve
 * (`PYTHON_HARNESS_RECEPTIVE_SEED`, e `tests/engineLangPython.test.ts` §"a
 * semente receptiva cobre o harness REAL"). Sem elas, TODO desafio nasceria
 * violando A3 por causa do próprio harness — o modo de falha que esta política
 * existe para evitar.
 */
export function harnessReceptiveSeed(language: LanguageId = DEFAULT_ADAPTER_ID): readonly AtomKey[] {
  exigirTabela('HARNESS_RECEPTIVE_SEED', language);
  if (language === 'typescript') return TYPESCRIPT_HARNESS_RECEPTIVE_SEED;
  if (language === 'python') return PYTHON_HARNESS_RECEPTIVE_SEED;
  return HARNESS_RECEPTIVE_SEED;
}

/**
 * As estruturais sempre liberadas DESTA linguagem (as duas faixas).
 *
 * JavaScript e TypeScript compartilham a MESMA lista: os nós que todo programa
 * tem (`SourceFile`, `Block`, `Identifier`, `VariableDeclaration`…) são do
 * mesmo `ts.SyntaxKind` nos dois dialetos. Nenhuma construção de TIPO entra
 * aqui — anotar não é estrutural, é conteúdo de aula.
 *
 * Python tem lista PRÓPRIA (`PYTHON_STRUCTURAL_ALWAYS_ALLOWED`), e não podia
 * ser de outro jeito: `node:SourceFile` e `node:VariableDeclarationList` são
 * nomes de `ts.SyntaxKind` e não existem no `ast`; o que ocupa esse papel lá é
 * `node:Module` e o `expr_context` (`Load`/`Store`/`Del`).
 */
export function structuralAlwaysAllowed(language: LanguageId = DEFAULT_ADAPTER_ID): readonly AtomKey[] {
  exigirTabela('STRUCTURAL_ALWAYS_ALLOWED', language);
  return language === 'python' ? PYTHON_STRUCTURAL_ALWAYS_ALLOWED : STRUCTURAL_ALWAYS_ALLOWED;
}
