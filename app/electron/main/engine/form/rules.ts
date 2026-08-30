/**
 * app/electron/main/engine/form/rules.ts — a BATERIA INICIAL de FORMAS de uso.
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
 * Referência: `docs/16-engine-de-trilha.md` §3.1, §3.5, I9/I11, §5.3.
 */

import { AtomKey, ATOM_KEY_RE } from '../atomKeys';
import { CompiledSelector, FormSelectorError, formKey, parseSelector } from './selector';

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
}

/** Definição declarativa de uma forma — o formato que `buildFormRules` consome. */
export interface FormRuleDefinition {
  selector: string;
  description: string;
}

/**
 * Compila uma lista de definições de forma em regras prontas.
 *
 * LANÇA `FormSelectorError` (código `FORM_SELECTOR_INVALID`) no PRIMEIRO
 * seletor malformado — a carga falha alto e estruturado (A-P06-4).
 */
export function buildFormRules(definitions: readonly FormRuleDefinition[]): FormRule[] {
  return definitions.map((def) => {
    const compiled = parseSelector(def.selector); // erro de carga, nunca silêncio
    const key = formKey(compiled);
    if (!ATOM_KEY_RE.test(key)) {
      // Inalcançável por construção (o canônico é compacto); é a rede de
      // segurança que torna o contrato com atomKeys.ts uma invariante, não um desejo.
      throw new FormSelectorError(`a forma "${def.selector}" gerou a chave "${key}", que não casa com o ATOM_KEY_RE`);
    }
    return { key, selector: def.selector, compiled, description: def.description };
  });
}

/**
 * AS CINCO FORMAS INICIAIS (onda 1). Cada uma é um par mínimo e TEM caso de
 * teste próprio em `app/tests/engineForm.test.ts`.
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
const BUILTIN_FORM_DEFINITIONS: readonly FormRuleDefinition[] = [
  {
    selector: 'VariableDeclaration > FunctionExpression',
    description:
      'função como valor de variável (const f = function () {}) — distinta da declaração function f() {}, que a aula de função costuma ensinar primeiro',
  },
  {
    selector: 'IfStatement[alternate=null]',
    description: 'if sem else — distinto de if/else, que é a forma com o ramo alternativo (o exemplo do documento, §3.1)',
  },
  {
    selector: 'ArrowFunction[body!=Block]',
    description: 'arrow com corpo de expressão (x => x + 1) — distinta de arrow com corpo de bloco (x => { return x + 1; })',
  },
  {
    selector: 'Parameter[initializer!=null]',
    description: 'parâmetro com valor default (function f(x = 1) {}) — assinatura com valor padrão é forma própria de assinatura',
  },
  {
    selector: 'ObjectLiteralExpression > MethodDeclaration',
    description: 'método declarado em objeto literal (const o = { m() {} }) — distinto de propriedade com arrow/função como valor e de método de classe',
  },
];

/**
 * A bateria FIXA do eixo. Compilada UMA vez na carga deste módulo: um seletor
 * malformado aqui quebra a inicialização da engine (A-P06-4). O extrator
 * (`extract.ts`) itera sobre ela em toda extração.
 */
export const FORM_RULES: readonly FormRule[] = buildFormRules(BUILTIN_FORM_DEFINITIONS);