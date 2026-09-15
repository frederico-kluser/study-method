/**
 * src/views/SettingsView/panelCache.ts — cache POR SESSÃO dos dados que os
 * painéis de Settings leem no mount (stale-while-revalidate).
 *
 * POR QUÊ ISTO EXISTE (medição onda1-settings-perf, handoff): o App desmonta a
 * view ativa a cada troca de aba — sem cache, TODA visita a Settings remonta os
 * 4 painéis e refaz as 4 cadeias de IPC do zero, e a tela "pisca" de
 * vazio→carregado a cada visita (medido: painéis carregados só ~90-104ms após
 * o clique, contra ~27ms do primeiro paint). Com o cache, o painel nasce com o
 * último valor conhecido e o IPC de revalidação continua rolando no mount — a
 * UI só muda se o valor REAL mudou.
 *
 * GARANTIAS:
 *  - Nenhum dado deixa de ser lido ou salvo: os IPCs do mount continuam
 *    disparando em TODA montagem (a revalidação é incondicional); o cache só
 *    muda a ORIGEM do primeiro paint.
 *  - ALCANCE: mapa em memória do módulo — morre com o renderer; nada vai a
 *    disco. Chaves são literais locais a SettingsView.
 *  - Escritas (setKey/validate/setActive/purge) continuam pelas MESMAS funções
 *    de antes; os painéis atualizam o cache junto com o estado para a próxima
 *    visita não exibir valor velho por um instante.
 */

/** Armazenamento interno: chave → último valor conhecido. */
const cache = new Map<string, unknown>();

/** Lê o último valor conhecido de `key` (undefined = nunca carregado). */
export function readCached<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

/** Grava o último valor conhecido de `key` (chamado junto com cada setState). */
export function writeCached<T>(key: string, value: T): void {
  cache.set(key, value);
}
