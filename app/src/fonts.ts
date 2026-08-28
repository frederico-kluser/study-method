/**
 * src/fonts.ts — carga das famílias tipográficas do redesign "Cartucho".
 *
 * Módulo de EFEITO COLATERAL: não exporta nada. Existe só para que um único
 * `import './fonts'` no bootstrap (src/main.tsx) registre as três @font-face
 * antes do primeiro paint. Origem do contrato: `docs/ux-redesign.md` §4.1.
 *
 * POR QUE ARQUIVOS LOCAIS E NÃO CDN (Google Fonts) — não é preferência, é
 * requisito duro de duas frentes que se somam:
 *
 *   1. CSP. O renderer roda sob a Content-Security-Policy declarada no
 *      index.html (e reforçada pelo `webSecurity` do BrowserWindow, sem
 *      exceção): `font-src 'self'` e `style-src 'self' 'unsafe-inline'`. Um
 *      <link> para fonts.googleapis.com seria uma FOLHA de estilo de origem
 *      externa (barrada por style-src) e os .woff2 que ela referencia viriam
 *      de fonts.gstatic.com (barrados por font-src). O resultado não seria um
 *      erro visível: seria a UI inteira caindo silenciosamente no fallback
 *      system-ui das stacks de FONT_STACK. Afrouxar a CSP para acomodar a CDN
 *      abriria o renderer a um host de terceiro — o oposto do que a política
 *      existe para garantir (todo tráfego de rede do app vive no processo
 *      MAIN; o renderer é `connect-src 'self'`).
 *
 *   2. Offline. O app é um tutor de estudo desktop que precisa abrir e ensinar
 *      sem rede (LLM local, material em disco). Fonte que depende de rede é
 *      fonte que some no avião. Empacotada em `out/renderer/assets/`, ela
 *      carrega por file:// como qualquer outro asset do bundle.
 *
 * Consequência verificável: depois de `npm run build`, um grep recursivo em
 * `out/` não pode achar NENHUMA ocorrência de fonts.googleapis.com nem de
 * fonts.gstatic.com. Se achar, alguém religou a CDN e a CSP vai matar a
 * tipografia em produção.
 *
 * QUAL ARQUIVO DE CADA PACOTE, E POR QUÊ ESTE E NÃO O `index`:
 *   Os pacotes `@fontsource-variable/*` são fontes VARIÁVEIS: um único .woff2
 *   por subset cobre o eixo `wght` inteiro, em vez de um arquivo por peso. Por
 *   isso não existe (nem faz sentido) importar "400.css"/"700.css" para eles —
 *   a escala inteira que o tema usa já está dentro do mesmo arquivo:
 *     - corpo/UI  400/500/600  ⊂  Inter          `font-weight: 100 900`
 *     - código    400/500      ⊂  JetBrains Mono `font-weight: 100 800`
 *   O que dá para apertar é o EIXO e o ESTILO, e é o que fazemos:
 *     - `wght.css` (e não `opsz.css`/`standard.css` do Inter): só o eixo de
 *       peso, que é o único que o tema pilota;
 *     - sem os `*-italic.css`: nenhum token do tema pede itálico real, e o
 *       par itálico dobraria o payload de fonte. Prosa com <em> cai no
 *       oblique sintético do Chromium, que é aceitável no Inter. Se algum dia
 *       o design pedir itálico DESENHADO, a troca é acrescentar os
 *       `*-italic.css` aqui — e só aqui.
 *
 *   O DISPLAY (títulos) é o pacote ESTÁTICO `@fontsource/chakra-petch`, um
 *   arquivo por peso (400/600/700). ONDA 1 (game-foundations): a família
 *   display do projeto irmão leet-code-rpg entra no lugar do Nunito. Não
 *   existe `@fontsource-variable/chakra-petch` no registry (verificado em
 *   2026-08-28 — npm view devolve 404), então a variante VARIÁVEL nem está em
 *   jogo. Chakra Petch para em 700 (não tem 800): por isso o tema usa 700 no
 *   topo da escala em vez dos 800 do Nunito. O `Press Start 2P` — acento
 *   "pixel" raro (labels de conquista/HUD, uppercase pequenos) — tem UM peso
 *   só (400) e entra pelo pacote estático `@fontsource/press-start-2p`.
 *
 * NOMES DE FAMÍLIA — casam EXATAMENTE com `FONT_STACK` de src/lib/designTokens.ts
 * (contrato congelado). Os arquivos CSS abaixo registram, literalmente:
 *   'Inter Variable' · 'Chakra Petch' · 'JetBrains Mono Variable' · 'Press Start 2P'
 * Trocar um pacote por outra variante mudaria o nome registrado e faria o
 * primeiro item de cada stack deixar de resolver — silenciosamente, para o
 * segundo item. Não troque sem conferir o `font-family` dentro do .css do
 * pacote.
 *
 * ARMADILHA MEDIDA (não é hipótese — build de prova, ver handoff da onda 1):
 * o Vite embute em `url(data:font/woff2;base64,...)` todo asset abaixo de
 * `build.assetsInlineLimit` (default 4096 B). Dos 18 @font-face que estes três
 * CSS geram, exatamente UM cai nessa faixa: JetBrains Mono / cyrillic-ext
 * (2028 B). E `data:` NÃO é coberto por `font-src 'self'` — esse @font-face
 * nasce bloqueado pela CSP, com erro no console, e cai no fallback. Não quebra
 * nada hoje (os locales do app são pt-BR e en; cirílico estendido em fonte mono
 * não aparece), mas é dívida real. Correção certa quando incomodar: NÃO afrouxar
 * a CSP para `font-src 'self' data:` — e sim proibir o inline de fonte no
 * `renderer.build.assetsInlineLimit` de electron.vite.config.ts, mantendo todo
 * .woff2 como arquivo de verdade sob `out/renderer/assets/`.
 *
 * `font-display: swap` já vem declarado pelo Fontsource: o texto aparece na
 * fonte de fallback e é repintado quando a variável carrega — nunca há bloco
 * de renderização (FOIT) esperando o arquivo.
 */

/* Corpo e UI — Inter (eixo wght 100–900; tema usa 400/500/600). */
import '@fontsource-variable/inter/wght.css';

/* Display e títulos — Chakra Petch ESTÁTICO (pesos 400/600/700; o tema usa
   700 no topo da escala — a família não tem 800). Substitui o Nunito na ONDA
   1 (game-foundations), herdando o display do projeto irmão leet-code-rpg.
   Não existe versão VARIÁVEL no registry (npm view = 404, 2026-08-28). */
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';

/* Acento "pixel" RARO — Press Start 2P (peso único 400): labels de
   conquista/HUD em uppercase pequeno, no espírito do leet-code-rpg. Não usar
   em corpo nem em título: é acento, não voz. */
import '@fontsource/press-start-2p/400.css';

/* Código, terminal e algarismos de contador — JetBrains Mono (wght 100–800;
   tema usa 400/500). */
import '@fontsource-variable/jetbrains-mono/wght.css';
