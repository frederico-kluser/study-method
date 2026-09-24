/**
 * src/fonts.ts — carga das famílias tipográficas do redesign "Apple".
 *
 * Módulo de EFEITO COLATERAL: não exporta nada. Existe só para que um único
 * `import './fonts'` no bootstrap (src/main.tsx) registre as @font-face antes do
 * primeiro paint. Origem do contrato: `src/lib/designTokens.ts`.
 *
 * ─── O QUE CARREGA, E O QUE NÃO ───────────────────────────────────────────
 * O design system deste app é o da Apple, e a Apple usa UMA família de sans
 * (SF Pro) em toda a escala, mais o SF Mono no código. Nenhuma das duas é
 * redistribuível fora da plataforma da Apple. A ordem das stacks de `FONT_STACK`
 * resolve isso sem fingir que temos o SF:
 *
 *     display  -apple-system, BlinkMacSystemFont, 'SF Pro Display',
 *                'SF Pro Text', 'Inter Variable', ...
 *     body     -apple-system, BlinkMacSystemFont, 'SF Pro Text',
 *                'Inter Variable', ...
 *     mono     'SF Mono', ui-monospace, 'JetBrains Mono Variable', ...
 *
 * Onde o sistema tem o SF (macOS, iOS), é ele quem desenha — inclusive com o
 * tamanho óptico certo, porque o `-apple-system` troca de SF Pro Display para
 * SF Pro Text conforme o corpo. Onde não tem, cai neste arquivo. As famílias
 * que este módulo registra são as de `FONT_BUNDLED` (em designTokens.ts):
 *
 *     'Inter Variable'          corpo e display
 *     'JetBrains Mono Variable' código, terminal e algarismos de contador
 *
 * O Inter é o substituto canônico do SF Pro na web (mesma classe de grotesca
 * neutra, mesmo papel) e é justamente por isso que ele é o fallback: onde o SF
 * não existe, a intenção do design continua sendo a mesma letra.
 *
 * ─── POR QUE ARQUIVO LOCAL E NÃO CDN ──────────────────────────────────────
 * Não é preferência, é requisito duro de duas frentes que se somam:
 *
 *   1. CSP. O renderer roda sob a Content-Security-Policy declarada no
 *      index.html: `font-src 'self'` e `style-src 'self' 'unsafe-inline'`. Um
 *      <link> para fonts.googleapis.com seria uma FOLHA de estilo externa
 *      (barrada por style-src) e os .woff2 que ela referencia viriam de
 *      fonts.gstatic.com (barrados por font-src). O resultado não seria um erro
 *      visível: seria a UI inteira caindo silenciosamente no fallback do
 *      sistema. Afrouxar a CSP para acomodar a CDN abriria o renderer a um host
 *      de terceiro — o oposto do que a política existe para garantir.
 *
 *   2. Offline. O app é um tutor de estudo desktop que precisa abrir e ensinar
 *      sem rede. Fonte que depende de rede é fonte que some no avião.
 *
 * Consequência verificável: depois de `npm run build`, um grep recursivo em
 * `out/` não pode achar NENHUMA ocorrência de fonts.googleapis.com nem de
 * fonts.gstatic.com.
 *
 * ─── QUAL ARQUIVO DE CADA PACOTE ──────────────────────────────────────────
 * Os pacotes `@fontsource-variable/*` são fontes VARIÁVEIS: um único .woff2 por
 * subset cobre o eixo `wght` inteiro. Por isso não existe import por peso — a
 * escala inteira que o tema usa já está dentro do mesmo arquivo:
 *     - corpo e display  400/500/600/700/800  ⊂  Inter          `100 900`
 *     - código           400/500              ⊂  JetBrains Mono `100 800`
 * O que se aperta é o EIXO e o ESTILO:
 *     - `wght.css` (e não `opsz.css`/`standard.css`): só o eixo de peso, que é
 *       o único que o tema pilota;
 *     - sem os `*-italic.css`: nenhum token do tema pede itálico real, e o par
 *       itálico dobraria o payload de fonte. Prosa com <em> cai no oblique
 *       sintético do Chromium.
 *
 * NOMES DE FAMÍLIA — casam EXATAMENTE com `FONT_BUNDLED` de designTokens.ts. Os
 * arquivos CSS abaixo registram, literalmente:
 *   'Inter Variable' · 'JetBrains Mono Variable'
 * Trocar um pacote por outra variante mudaria o nome registrado e faria a
 * entrada correspondente de `FONT_STACK` deixar de resolver, em silêncio, para
 * a seguinte. Não troque sem conferir o `font-family` dentro do .css do pacote.
 *
 * `font-display: swap` já vem declarado pelo Fontsource: o texto aparece na
 * fonte de fallback e é repintado quando a variável carrega — nunca há bloco de
 * renderização (FOIT) esperando o arquivo.
 */

/* CORPO E DISPLAY — Inter Variable (eixo wght 100–900).
 *
 * ONDA DO REDESSENHO APPLE: as papéis `display` e `body` passaram a ser a MESMA
 * família, porque a Apple usa UMA família de sans (SF Pro) em toda a escala. O
 * SF Pro não é redistribuível fora da plataforma da Apple, então a stack de
 * `FONT_STACK` (em src/lib/designTokens.ts) começa por `-apple-system` /
 * `'SF Pro Display'` / `'SF Pro Text'`: onde o sistema tem o SF (macOS, iOS) é
 * ele quem desenha, e este arquivo fica como o fallback empacotado que resolve
 * em Linux, Windows e offline.
 *
 * O Nunito saiu junto: ele era o display de uma referência anterior
 * (arredondado, humanista) e não pertence ao registro tipográfico da Apple. As
 * duas papéis agora se separam por tamanho, peso e entreletra, que é o que o
 * sistema da Apple faz.
 *
 * Mesma razão de sempre para arquivo local e não CDN: CSP (`font-src 'self'`) e
 * offline. Ver o cabeçalho deste arquivo. */
import '@fontsource-variable/inter/wght.css';

/* CÓDIGO, TERMINAL E ALGARISMOS — JetBrains Mono (wght 100–800; tema usa
   400/500). É o fallback empacotado do SF Mono, que é a fonte de código da
   Apple e também não é redistribuível. */
import '@fontsource-variable/jetbrains-mono/wght.css';