/**
 * app/electron/main/engine/report/reportSimilaridade.ts — o DETECTOR de cópia
 * exemplo-da-teoria × solução (Dice sobre tokens normalizados) do relatório
 * (`report.ts`). Extraído do módulo original na refatoração do lote L05 sem
 * NENHUMA mudança de comportamento — a fachada `report.ts` re-exporta tudo.
 */

/**
 * O limiar da acusação de cópia (REPLAN: Dice ≥ 0.70 sobre tokens
 * normalizados). Exportado para o teste A-P24-3 e para quem computa a seção
 * por aula fora deste relatório.
 */
export const LIMIAR_SIMILARIDADE_COPIA = 0.7;

// ---------------------------------------------------------------------------
// O detector de similaridade exemplo-da-teoria × solução (Dice, determinístico)
// ---------------------------------------------------------------------------

/**
 * Remove comentários e colapsa whitespace. HEURÍSTICA DOCUMENTADA: comentários
 * de linha (`//`) são removidos quando precedidos de espaço ou início de linha
 * — `//` DENTRO de string (ex.: `'http://x'`) não é tratado aqui; para o
 * detector de cópia isto é aceitável (o custo de um falso-positivo por string
 * com `://` é nulo num relatório, e a régua é a mesma para as duas entradas).
 */
export function normalizarCodigo(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\w'"])[/][/][^\n]*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenização por fronteira: identificadores, números e cada caractere de
 * pontuação isolado, tudo em minúsculas. Mesma entrada → mesma lista (puro).
 */
export function tokenizarPorFronteira(codigo: string): string[] {
  const limpo = normalizarCodigo(codigo);
  const tokens = limpo.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[^\sA-Za-z0-9_$]/g) ?? [];
  return tokens.map((t) => t.toLowerCase());
}

/**
 * Coeficiente de Dice sobre os CONJUNTOS de tokens:
 * 2·|A∩B| / (|A|+|B|). `0..1`. Dois códigos sem token algum → 0 (sem evidência
 * não é acusação). Determinístico e puro.
 */
export function similaridadeDice(a: string, b: string): number {
  const A = new Set(tokenizarPorFronteira(a));
  const B = new Set(tokenizarPorFronteira(b));
  if (A.size === 0 && B.size === 0) return 0;
  let intersecao = 0;
  for (const token of A) if (B.has(token)) intersecao += 1;
  return (2 * intersecao) / (A.size + B.size);
}

/** `similaridadeDice(a, b) >= LIMIAR_SIMILARIDADE_COPIA` — a acusação. */
export function acusarCopia(exemploDaTeoria: string, solucao: string): boolean {
  return similaridadeDice(exemploDaTeoria, solucao) >= LIMIAR_SIMILARIDADE_COPIA;
}

