/**
 * src/types/i18n-seam.d.ts — declaração do módulo `./i18n` (SEAM da onda 6).
 *
 * O onda6-i18n-core cria `src/i18n` em OUTRA worktree, ainda NÃO mergeado nesta
 * árvore. src/main.tsx importa `./i18n` DINAMICAMENTE (import() com catch) — o
 * SEAM — para o typecheck aceitar o specifier ANTES do merge, declaramos o
 * módulo aqui com a superfície mínima consumida. APÓS o merge do i18n-core, a
 * declaração real de `src/i18n` assume e este arquivo pode ser removido.
 *
 * Declaração AMBIENTE válida para import relativo num arquivo .d.ts sem
 * top-level import/export habilitado pelo include "src" do tsconfig.json.
 */
declare module './i18n' {
  /** Inicializa o i18n (carrega recursos de idioma). */
  export function initI18n(): Promise<void>;
}