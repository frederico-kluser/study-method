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
 *     - display   700/800      ⊂  Nunito         `font-weight: 200 1000`
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
 *   O DISPLAY (títulos) voltou a ser VARIÁVEL na ONDA 11:
 *   `@fontsource-variable/nunito`, eixo `wght` 200..1000 num arquivo só por
 *   subset. Ele entra no lugar dos DOIS pacotes ESTÁTICOS que a onda 1 tinha
 *   trazido do projeto irmão leet-code-rpg — `@fontsource/chakra-petch`
 *   (400/600/700) e `@fontsource/press-start-2p` (400). Motivo, verbatim do
 *   dono: "a fonte nao quero retro". Chakra Petch é techno/quadrada e Press
 *   Start 2P é literalmente uma fonte de pixel; a referência desta onda
 *   (Nintendo Switch Online) é humanista arredondada.
 *
 *   Consequências mecânicas da volta ao VARIÁVEL, e não são cosméticas:
 *     - três imports de peso (400/600/700 do Chakra Petch) viram UM `wght.css`;
 *     - o `@font-face` do display passa a declarar `font-weight: 200 1000`, o
 *       que devolve ao tema o peso 800 no topo da escala (Chakra Petch parava
 *       em 700 e por isso h1 e h6 tinham o MESMO peso);
 *     - some o quarto papel de fonte: `FONT_STACK.accent` não existe mais.
 *
 * NOMES DE FAMÍLIA — casam EXATAMENTE com `FONT_STACK` de src/lib/designTokens.ts
 * (contrato congelado). Os arquivos CSS abaixo registram, literalmente:
 *   'Inter Variable' · 'Nunito Variable' · 'JetBrains Mono Variable'
 * Trocar um pacote por outra variante mudaria o nome registrado e faria o
 * primeiro item de cada stack deixar de resolver — silenciosamente, para o
 * segundo item. Não troque sem conferir o `font-family` dentro do .css do
 * pacote.
 *
 * ARMADILHA MEDIDA (não é hipótese — build de prova, ver handoff da onda 1):
 * o Vite embute em `url(data:font/woff2;base64,...)` todo asset abaixo de
 * `build.assetsInlineLimit` (default 4096 B). Dos 18 @font-face que estes três
 * CSS geram (7 Inter + 5 Nunito + 6 JetBrains Mono — a conta continua em 18
 * depois da troca da onda 11), exatamente UM cai nessa faixa: JetBrains Mono /
 * cyrillic-ext (2028 B); o menor arquivo do Nunito tem 13096 B, longe do
 * limite. E `data:` NÃO é coberto por `font-src 'self'` — esse @font-face
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

/* Display e títulos — Nunito VARIÁVEL (eixo wght 200–1000; o tema usa 700 e
   800). ONDA 11: entra no lugar do Chakra Petch (techno/quadrada) e do Press
   Start 2P (pixel) — "a fonte nao quero retro", pedido do dono. Um arquivo por
   subset cobre a escala inteira, então NÃO existe import por peso aqui. */
import '@fontsource-variable/nunito/wght.css';

/* Código, terminal e algarismos de contador — JetBrains Mono (wght 100–800;
   tema usa 400/500). */
import '@fontsource-variable/jetbrains-mono/wght.css';
