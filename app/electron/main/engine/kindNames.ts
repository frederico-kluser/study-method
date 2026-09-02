/**
 * app/electron/main/engine/kindNames.ts — a TABELA CANÔNICA de nomes de
 * `ts.SyntaxKind`, em UM lugar só.
 *
 * POR QUE ESTE ARQUIVO EXISTE (onda 5, dedup): a mesma tabela vivia COPIADA em
 * dois lugares — `engine/extract.ts:183` (a original) e
 * `engine/form/selector.ts:125` (a cópia, cujo comentário justificava a
 * duplicação com "não criar ciclo de import: extract → form/rules →
 * form/selector → extract"). O ciclo é real; a cópia não é a única saída. Um
 * módulo FOLHA — que importa só `typescript` e não importa nada da engine —
 * quebra o ciclo sem duplicar nada: `extract.ts` reexporta `kindName` daqui
 * (a API pública não muda: `vocab/generate.ts` e os testes continuam fazendo
 * `import { kindName } from '../extract'`) e `form/selector.ts` consome
 * `kindNameOf`.
 *
 * A ARMADILHA QUE A TABELA RESOLVE, e ela envenenaria o orçamento em silêncio:
 * o enum `ts.SyntaxKind` tem marcadores de faixa (`FirstLiteralToken`,
 * `FirstStatement`, `FirstBinaryOperator`, …) que compartilham o valor
 * numérico de um kind real. Como a busca reversa de um enum do TypeScript
 * devolve o ÚLTIMO nome atribuído ao valor,
 * `ts.SyntaxKind[ts.SyntaxKind.NumericLiteral]` devolve `"FirstLiteralToken"`.
 * Um orçamento escrito contra `node:NumericLiteral` nunca casaria com o que o
 * extrator emite.
 *
 * A tabela é construída UMA vez, preferindo o nome que NÃO é marcador de faixa.
 *
 * ── LIMITE DECLARADO (multilíngua) ────────────────────────────────────────
 * Esta tabela é do AST do TypeScript, logo é JAVASCRIPT-ONLY por natureza. A
 * pergunta multilíngua equivalente ("qual é o universo enumerável de tipos de
 * nó desta linguagem?") é o membro `inventory()` do `LanguageAdapter`
 * (`engine/lang/registry.ts`) — e `javascriptAdapter.inventory()` é EXATAMENTE
 * a varredura deste enum com este `kindName`. Quem precisa do universo de
 * NOMES deve pedir ao adaptador; quem tem um `ts.Node` na mão (o extrator e o
 * seletor de forma, que ainda são de JavaScript) usa este módulo.
 */

import * as ts from 'typescript';

/**
 * `SyntaxKind` → nome CANÔNICO. Construída uma vez na carga, preferindo o nome
 * que não é marcador de faixa (`First*`/`Last*`).
 */
export const CANONICAL_KIND_NAME: ReadonlyMap<ts.SyntaxKind, string> = (() => {
  const map = new Map<ts.SyntaxKind, string>();
  for (const name of Object.keys(ts.SyntaxKind)) {
    if (!Number.isNaN(Number(name))) continue;
    const value = (ts.SyntaxKind as unknown as Record<string, number>)[name];
    const isRangeMarker = name.startsWith('First') || name.startsWith('Last');
    const current = map.get(value);
    if (current === undefined || (isRangeMarker === false && (current.startsWith('First') || current.startsWith('Last')))) {
      map.set(value, name);
    }
  }
  return map;
})();

/** Nome canônico de um `SyntaxKind` (`ts.SyntaxKind.NumericLiteral` → `NumericLiteral`). */
export function kindName(kind: ts.SyntaxKind): string {
  return CANONICAL_KIND_NAME.get(kind) ?? String(kind);
}

/** Nome canônico do tipo de um nó (`IfStatement`, `Block`, …). */
export function kindNameOf(node: ts.Node): string {
  return CANONICAL_KIND_NAME.get(node.kind) ?? String(node.kind);
}
