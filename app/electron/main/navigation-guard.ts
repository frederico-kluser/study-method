/**
 * electron/main/navigation-guard.ts — decisão PURA do guard de navegação de topo.
 *
 * Camada 2 do fix do embed de Fontes (a camada 1 é o `sandbox` do iframe em
 * LessonView.tsx): o main NÃO deixa a janela navegar para fora das origens
 * PRÓPRIAS do app. Se um conteúdo hostil tentar `top.location = 'https://…'`,
 * o `will-navigate` (registrado em electron/main/index.ts) consulta ESTA função
 * e, para origem estranha, faz `preventDefault` + delega a URL ao navegador do
 * sistema — evitando que a janela inteira recarregue o documento (e re-execute
 * o preload, re-expondo window.api) sob controle do conteúdo hostil.
 *
 * Função PURA e sem import do electron — testável em node:test
 * (app/tests/navigationGuard.test.ts).
 */

/**
 * Decide se `url` aponta para uma origem PRÓPRIA do app.
 *
 * @param url URL candidata à navegação de topo (pode vir com whitespace, casing
 *   variado ou ser garbage/relativa — nesse caso o resultado é deny-safe/false).
 * @param ownOrigins URLs cuja ORIGEM define o que é próprio: em dev, a URL do
 *   dev server (ELECTRON_RENDERER_URL, ex. http://localhost:5173); em prod, uma
 *   URL file:/// (o bundle é carregado via loadFile).
 * @returns true SÓ para navegação própria (http/https comparados por origin;
 *   file: comparado por protocolo, pois origin de file: é o opaco 'null').
 */
export function isAppOwnNavigation(url: string, ownOrigins: readonly string[]): boolean {
  let target: URL;
  try {
    target = new URL(url.trim());
  } catch {
    // Garbage/relativa/vazia: deny-safe (o handler fará preventDefault).
    return false;
  }

  for (const raw of ownOrigins) {
    let own: URL;
    try {
      own = new URL(raw.trim());
    } catch {
      continue; // Origem própria malformada: ignora (não libera nada).
    }

    if (own.protocol === 'file:') {
      // `origin` de file: é o opaco 'null' — não comparável. Quando o app roda
      // do bundle, qualquer file: interno é próprio (é o próprio documento);
      // esquemas estranhos (data:, about:, javascript:) NÃO entram aqui.
      if (target.protocol === 'file:') return true;
      continue;
    }

    if (own.origin !== 'null' && target.origin === own.origin) return true;
  }
  return false;
}
