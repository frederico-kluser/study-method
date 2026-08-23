/**
 * src/lib/tSafe.ts — tradução SEGURA com fallback pt-BR.
 *
 * PONTO DE SEAM do i18n da onda 6 (startup gate). O `onda6-i18n-core` cria
 * `src/i18n` em OUTRA worktree que ainda não mergeou — portanto ESTA árvore
 * NÃO tem `src/i18n` e NÃO podemos importá-lo estaticamente. Enquanto isso,
 * todo texto do GATE usa `tSafe(key, fallback)`:
 *
 *   - tenta resolver a tradução via uma instância i18next global que o
 *     i18n-core pode expor (ver abaixo);
 *   - se a instância não existir (ainda não mergeado) OU a chave não existir,
 *     devolve o `fallback` pt-BR hardcoded.
 *
 * CONVENÇÃO DE CHAVES (handoff do i18n-core): `gate.*`, `keys.*`, `common.*`,
 * `nav.*`, `app.title`.
 *
 * FIX PÓS-MERGE (orquestrador): assim que o i18n-core mergear, este módulo é
 * trocado por um `t()` real (import de `src/i18n`) — ver handoff.
 */

interface I18nLike {
  /** i18next `t(key, ...)` — devolve a chave ou a tradução. */
  t(key: string): string;
}

interface GlobalWithI18n {
  /** Instância global que o i18n-core pode expor (globalThis.__I18N_INSTANCE). */
  __I18N_INSTANCE?: I18nLike;
  /** Fallback de resolução (alguns setups expõem `globalThis.i18n`). */
  i18n?: I18nLike;
}

/**
 * Devolve a tradução de `key` se uma instância i18next global existir E a
 * chave estiver definida; caso contrário devolve `fallback` (pt-BR).
 * NUNCA lança: o gate não pode quebrar por falta de i18n.
 */
export function tSafe(key: string, fallback: string): string {
  try {
    const g = globalThis as unknown as GlobalWithI18n;
    const instance = g.__I18N_INSTANCE ?? g.i18n;
    if (!instance || typeof instance.t !== 'function') return fallback;
    const translated = instance.t(key);
    // i18next devolve a própria chave quando ela não está nas traduções;
    // nesse caso o fallback é preferível ao key literal cru.
    if (typeof translated !== 'string' || translated === '' || translated === key) {
      return fallback;
    }
    return translated;
  } catch {
    return fallback;
  }
}