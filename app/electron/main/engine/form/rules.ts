/**
 * app/electron/main/engine/form/rules.ts — a BATERIA de FORMAS de uso: CINCO de
 * JavaScript (onda 1) e CATORZE de TypeScript (onda 7).
 *
 * Cada forma é um PAR (construção, restrição de forma de uso): a chave do eixo
 * `node:` já libera a construção (`node:IfStatement`, `node:FunctionExpression`,
 * `node:ArrowFunction`), e a chave do eixo `form:` libera SÓ a forma específica
 * que a aula ensinou. A distinção é o que materializa I9/I11
 * (`docs/16-engine-de-trilha.md` §3.5 e §5.2): mudar a FORMA de uma construção
 * já ensinada é um evento de currículo que exige aula própria — "liberar `if`
 * não libera `if` sem `else`" (§3.1).
 *
 * As regras são DECLARATIVAS: um seletor (a DSL de `form/selector.ts`) mais uma
 * descrição didática do que a forma distingue. Não existe função de checagem à
 * parte — o seletor É a checagem, e a bateria inteira roda em `extract.ts`
 * sobre o MESMO AST já parseado (mesma config fixa de `ts.createSourceFile`).
 *
 * ── ERRO DE SELETOR É ERRO DE CARGA (A-P06-4) ────────────────────────────────
 * `buildFormRules` compila cada seletor na carga — um seletor malformado LANÇA
 * `FormSelectorError` aqui, na inicialização do módulo, e a engine não nasce.
 * Em tempo de verificação (`extractAtoms`) só existem regras já compiladas:
 * não existe "não entendi o seletor, sigo sem emitir". `buildFormRules` é
 * exportado de propósito — é a mesma validação que as ondas 2-4 devem
 * reutilizar ao carregar `form:` declarado no orçamento das aulas.
 *
 * ── CADA REGRA DECLARA SEU DIALETO (onda 7) ──────────────────────────────────
 * `docs/18-trilha-typescript.md` §"As formas novas que a bateria precisa
 * registrar" acrescentou CATORZE formas de TypeScript à bateria. Três delas
 * casam JAVASCRIPT PURO — `Parameter[dotDotDotToken!=null]` é `f(...xs)`,
 * `IfStatement[expression=BinaryExpression]` é `if (a === 1)`,
 * `IfStatement[expression=TypeOfExpression]` é `if (typeof x)` — e avaliá-las
 * num arquivo `.mjs` emitiria chave `form:` que a trilha de JavaScript não
 * declara, movendo o placar de `nodejs-do-zero`. Por isso toda definição
 * carrega `dialects`, e o gate é do SELETOR (ver `form/selector.ts`
 * §"O GATE DE DIALETO"), não do chamador: `extract.ts` continua com um laço só.
 *
 *   - as CINCO formas de JavaScript da onda 1: `['js', 'ts']` — a trilha de
 *     TypeScript PRESSUPÕE o axioma de JavaScript (`docs/18` §"A decisão"), e
 *     a semente receptiva de TypeScript já herda `form:ArrowFunction[body!=Block]`
 *     e `form:Parameter[initializer!=null]` de `HARNESS_RECEPTIVE_SEED`;
 *   - as CATORZE formas de TypeScript: `['ts']` — nenhuma é avaliada em `.mjs`.
 *
 * Referência: `docs/16-engine-de-trilha.md` §3.1, §3.5, I9/I11, §5.3;
 * `docs/18-trilha-typescript.md` §"As formas novas que a bateria precisa registrar".
 */

import { AtomKey, ATOM_KEY_RE } from '../atomKeys';
import {
  ALL_FORM_DIALECTS,
  CompiledSelector,
  FormDialect,
  FormSelectorError,
  formKey,
  parseSelector,
} from './selector';

export type { FormDialect };

/** Uma forma compilada e pronta para casar contra o AST. */
export interface FormRule {
  /** chave de átomo: `form:<seletor compacto>` — casa com o ATOM_KEY_RE. */
  key: AtomKey;
  /** o seletor exatamente como escrito na declaração (legível nos relatórios). */
  selector: string;
  /** o seletor compilado — é com ele que o extrator casa os nós. */
  compiled: CompiledSelector;
  /** por que esta forma é evento de currículo (a justificativa I9/I11). */
  description: string;
  /**
   * A(s) LINGUAGEM(NS) em que esta forma é avaliada — o eixo de
   * `ExtractOptions.dialect`. Espelha `compiled.dialects`, que é quem manda:
   * está aqui para o relatório e para o teste poderem ler a marcação sem
   * abrir o seletor compilado.
   */
  dialects: readonly FormDialect[];
}

/** Definição declarativa de uma forma — o formato que `buildFormRules` consome. */
export interface FormRuleDefinition {
  selector: string;
  description: string;
  /** default: os DOIS dialetos (a forma vale em toda fonte). */
  dialects?: readonly FormDialect[];
}

/**
 * Compila uma lista de definições de forma em regras prontas.
 *
 * LANÇA `FormSelectorError` (código `FORM_SELECTOR_INVALID`) no PRIMEIRO
 * seletor malformado — ou no primeiro dialeto inválido — a carga falha alto e
 * estruturado (A-P06-4).
 */
export function buildFormRules(definitions: readonly FormRuleDefinition[]): FormRule[] {
  return definitions.map((def) => {
    // erro de carga, nunca silêncio — vale para a sintaxe E para o dialeto
    const compiled = parseSelector(def.selector, def.dialects ?? ALL_FORM_DIALECTS);
    const key = formKey(compiled);
    if (!ATOM_KEY_RE.test(key)) {
      // Inalcançável por construção (o canônico é compacto); é a rede de
      // segurança que torna o contrato com atomKeys.ts uma invariante, não um desejo.
      throw new FormSelectorError(`a forma "${def.selector}" gerou a chave "${key}", que não casa com o ATOM_KEY_RE`);
    }
    return { key, selector: def.selector, compiled, description: def.description, dialects: compiled.dialects };
  });
}

/**
 * AS CINCO FORMAS DE JAVASCRIPT (onda 1). Cada uma é um par mínimo e TEM caso
 * de teste próprio em `app/tests/engineForm.test.ts`. Valem nos DOIS dialetos:
 * a trilha de TypeScript pressupõe o axioma de JavaScript, e a semente
 * receptiva de TypeScript herda duas delas de `HARNESS_RECEPTIVE_SEED`.
 *
 * 1. `VariableDeclaration > FunctionExpression` — função como VALOR de
 *    variável (`const f = function () {}`). A aula de "função" costuma ensinar
 *    DECLARAÇÃO (`function f() {}`); atribuir função a nome é uma forma nova.
 * 2. `IfStatement[alternate=null]` — `if` SEM `else` — o exemplo de §3.1.
 * 3. `ArrowFunction[body!=Block]` — arrow com corpo de EXPRESSÃO (`x => x + 1`),
 *    distinta de arrow com corpo de BLOCO (`x => { return x + 1; }`).
 * 4. `Parameter[initializer!=null]` — parâmetro com valor DEFAULT
 *    (`function f(x = 1) {}`) — assinatura com default é forma própria.
 * 5. `ObjectLiteralExpression > MethodDeclaration` — MÉTODO em objeto literal
 *    (`const o = { m() {} }`), distinto de arrow/função como valor de
 *    propriedade e de método de classe.
 */
export const JAVASCRIPT_FORM_DEFINITIONS: readonly FormRuleDefinition[] = [
  {
    selector: 'VariableDeclaration > FunctionExpression',
    description:
      'função como valor de variável (const f = function () {}) — distinta da declaração function f() {}, que a aula de função costuma ensinar primeiro',
    dialects: ALL_FORM_DIALECTS,
  },
  {
    selector: 'IfStatement[alternate=null]',
    description: 'if sem else — distinto de if/else, que é a forma com o ramo alternativo (o exemplo do documento, §3.1)',
    dialects: ALL_FORM_DIALECTS,
  },
  {
    selector: 'ArrowFunction[body!=Block]',
    description: 'arrow com corpo de expressão (x => x + 1) — distinta de arrow com corpo de bloco (x => { return x + 1; })',
    dialects: ALL_FORM_DIALECTS,
  },
  {
    selector: 'Parameter[initializer!=null]',
    description: 'parâmetro com valor default (function f(x = 1) {}) — assinatura com valor padrão é forma própria de assinatura',
    dialects: ALL_FORM_DIALECTS,
  },
  {
    selector: 'ObjectLiteralExpression > MethodDeclaration',
    description: 'método declarado em objeto literal (const o = { m() {} }) — distinto de propriedade com arrow/função como valor e de método de classe',
    dialects: ALL_FORM_DIALECTS,
  },
];

/** Só `ts` — nenhuma destas é avaliada num arquivo JavaScript. */
const TS: readonly FormDialect[] = ['ts'];

/**
 * AS CATORZE FORMAS DE TYPESCRIPT (onda 7).
 *
 * Fonte NORMATIVA, seletor por seletor: `docs/18-trilha-typescript.md`
 * §"As formas novas que a bateria precisa registrar". A tabela de lá é a lista
 * FECHADA — nada foi acrescentado, nada foi reescrito, e o par mínimo de cada
 * linha virou um caso de teste (um trecho que CASA, um que NÃO casa) em
 * `app/tests/engineForm.test.ts`.
 *
 * O problema que elas resolvem, na própria palavra do documento: **a anotação
 * não é um nó, é um atributo**. `function f(x: string): number` emite
 * `node:Parameter`, `node:FunctionDeclaration`, `node:StringKeyword` e
 * `node:NumberKeyword` — mas "anotar o parâmetro" e "anotar o retorno" são
 * DUAS aulas (`anotar-o-parametro` e `anotar-o-retorno`, módulo 1), e no eixo
 * `node:` elas são indistinguíveis. No eixo `form:` são triviais.
 *
 * DIVERGÊNCIA MEDIDA, e registrada aqui porque o silêncio custaria caro:
 * `IfStatement[expression=TypeOfExpression]` é escrita EXATAMENTE como o
 * documento a escreve, e por isso casa `if (typeof x) { … }` — mas NÃO casa o
 * par mínimo que a própria tabela dá para ela, `if (typeof x === 'string')`.
 * Medido: nesse trecho `IfStatement.expression` é o `BinaryExpression` do
 * `===`, e o `TypeOfExpression` é o operando ESQUERDO dele, dois níveis abaixo.
 * A DSL compara o atributo com o TIPO DO NÓ NAQUELA POSIÇÃO (`form/selector.ts`
 * §"SINTAXE MÍNIMA", item 3) — não tem caminho (`expression.left`) nem
 * descendente. Cobrir o exemplo do documento exigiria estender a DSL E MUDAR A
 * CHAVE (`form:IfStatement[expression.left=TypeOfExpression]`), e a chave é o
 * que o módulo 3 declara — então a forma entra literal, e a decisão de estender
 * fica com quem escrever a trilha. Ver o teste homônimo em `engineForm.test.ts`.
 */
export const TYPESCRIPT_FORM_DEFINITIONS: readonly FormRuleDefinition[] = [
  {
    selector: 'VariableDeclaration[type!=null]',
    description: 'variável com anotação de tipo (const a: number = 1) — distinta de const a = 1, onde o tipo vem por inferência (módulo 1: dois-conferidores, inferencia)',
    dialects: TS,
  },
  {
    selector: 'Parameter[type!=null]',
    description: 'parâmetro ANOTADO (f(x: string)) — distinto de f(x); é a aula anotar-o-parametro, e está na semente receptiva do harness TypeScript',
    dialects: TS,
  },
  {
    selector: 'FunctionDeclaration[type!=null]',
    description: 'retorno ANOTADO (function f(): number) — distinto de function f(); anotar o retorno é aula própria (anotar-o-retorno), e está na semente receptiva do harness TypeScript',
    dialects: TS,
  },
  {
    selector: 'ArrowFunction[type!=null]',
    description: 'arrow com retorno anotado ((x): number => x) — distinta de (x) => x; anotar arrow é a aula arrow-tipada, não é a mesma forma que anotar função declarada',
    dialects: TS,
  },
  {
    selector: 'Parameter[questionToken!=null]',
    description: 'parâmetro OPCIONAL (f(x?: string)) — distinto de f(x: string); o `?` é pontuação e o extrator descarta pontuação (§5.3 passe 1), logo a forma só sai por este eixo (aula pode-faltar)',
    dialects: TS,
  },
  {
    selector: 'PropertySignature[questionToken!=null]',
    description: 'propriedade OPCIONAL em tipo de objeto ({ a?: string }) — distinta de { a: string }; mesma razão do `?` do parâmetro, aula própria (propriedade-opcional)',
    dialects: TS,
  },
  {
    selector: 'PropertyDeclaration[type!=null]',
    description: 'campo de classe ANOTADO (class A { x: number }) — distinto de class A { x }; anotar campo é a aula campo-tipado, distinta de anotar parâmetro',
    dialects: TS,
  },
  {
    selector: 'Parameter[modifiers!=null]',
    description: 'parameter property (constructor(private x: number)) — o parâmetro que VIRA campo; é sintaxe exclusiva de TypeScript e aula própria (parametro-que-vira-campo)',
    dialects: TS,
  },
  {
    selector: 'Parameter[dotDotDotToken!=null]',
    description: 'parâmetro REST tipado (f(...xs: number[])) — distinto de f(xs: number[]); rest é axioma de JavaScript, e tipá-lo é a aula rest-tipado (por isso a forma é avaliada SÓ em ts: em .mjs ela casaria todo `f(...xs)`)',
    dialects: TS,
  },
  {
    selector: 'FunctionDeclaration[body=null]',
    description: 'assinatura de SOBRECARGA (function f(a: string): void; sem corpo) — distinta da declaração com corpo; é a aula sobrecarga',
    dialects: TS,
  },
  {
    selector: 'TypeParameter[constraint!=null]',
    description: 'parâmetro de tipo RESTRINGIDO (<T extends object>) — distinto de <T>; restringir o genérico é aula própria (restringir-o-generico)',
    dialects: TS,
  },
  {
    selector: 'TypeParameter[default!=null]',
    description: 'parâmetro de tipo com valor PADRÃO (<T = string>) — distinto de <T>; é a aula valor-padrao-de-tipo',
    dialects: TS,
  },
  {
    selector: 'IfStatement[expression=TypeOfExpression]',
    description: 'if cuja condição É um typeof (if (typeof x) {}) — o estreitamento por typeof do módulo 3; ATENÇÃO: o par mínimo `if (typeof x === "string")` do documento NÃO casa aqui (a condição de lá é o BinaryExpression do ===), ver o cabeçalho de TYPESCRIPT_FORM_DEFINITIONS',
    dialects: TS,
  },
  {
    selector: 'IfStatement[expression=BinaryExpression]',
    description: 'if cuja condição é uma comparação (if (forma.tipo === "circulo")) — o estreitamento por igualdade do módulo 3 (avaliada SÓ em ts: em .mjs ela casaria todo `if (a === 1)` da trilha de JavaScript)',
    dialects: TS,
  },
];

/**
 * A bateria completa: as CINCO de JavaScript (onda 1) mais as CATORZE de
 * TypeScript (onda 7). Dezenove definições, dezenove chaves distintas.
 */
const BUILTIN_FORM_DEFINITIONS: readonly FormRuleDefinition[] = [
  ...JAVASCRIPT_FORM_DEFINITIONS,
  ...TYPESCRIPT_FORM_DEFINITIONS,
];

/**
 * A bateria FIXA do eixo. Compilada UMA vez na carga deste módulo: um seletor
 * malformado aqui quebra a inicialização da engine (A-P06-4). O extrator
 * (`extract.ts`) itera sobre ela em toda extração — e cada regra recusa
 * sozinha o dialeto que não é o dela, então o laço de lá não muda.
 */
export const FORM_RULES: readonly FormRule[] = buildFormRules(BUILTIN_FORM_DEFINITIONS);