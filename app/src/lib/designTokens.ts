/**
 * src/lib/designTokens.ts — CONTRATO CONGELADO do redesign "Cartucho".
 *
 * Este módulo é a ÚNICA fonte de verdade dos valores do design system. Ele não
 * importa nada do MUI e não cria tema: é só dado, para que o tema (src/theme.ts),
 * a paleta de código (src/lib/codeTheme.ts), o CSS de bootstrap (src/index.css)
 * e os testes de contraste leiam EXATAMENTE os mesmos números.
 *
 * A origem de cada valor está em `docs/ux-redesign.md`, e os scripts em
 * `docs/ux-redesign/` reproduzem os cálculos:
 *   - contraste WCAG 2.x: (L1 + 0.05) / (L2 + 0.05), sem arredondar para cima;
 *   - motion: portado das molas do M3 Expressive (massa unitária, ω0 = √k).
 *
 * REGRAS QUE ESTE ARQUIVO EXISTE PARA IMPOR:
 *   1. Ninguém inventa hex. Se um valor não está aqui, ele não entra no produto.
 *   2. `spatial` só anima transform/geometria; `effects` só cor/opacidade.
 *      Aplicar `spatial` a `color`/`background-color`/`opacity` é bug.
 *   3. Prosa longa e código só nas superfícies de nível 0 e 1 — do nível 3 em
 *      diante o texto secundário deixa de alcançar 7:1 (AAA).
 *   3b. ACENTO-COMO-TEXTO vale nos níveis 0, 1 e 2 — e só neles. Nos níveis 3 e
 *      4 (o chrome: rail, dock, estado selecionado) o texto é TINTA; ali o
 *      acento só aparece como preenchimento, ícone ou borda. A mesma fronteira
 *      vale para NONTEXT_*: >= 3:1 apenas nos níveis 0 e 1.
 *   4. Nenhuma cor que participe de animação pode ter R/(R+G+B) >= 0.8 — esse é
 *      o limiar de "red flash" do WCAG 2.2 SC 2.3.1 (o vermelho #E60012 da
 *      Nintendo é o caso-limite: [medido] red-flash(#e60012) = 0,927, e por
 *      isso NÃO é usado).
 *   5. TODO NÚMERO DE CONTRASTE OU DE RED FLASH ESCRITO NUM COMENTÁRIO DESTE
 *      ARQUIVO (e de src/theme.ts) É UMA AFIRMAÇÃO VERIFICADA, e a verificação
 *      é automática. A rodada de revisão desta onda encontrou QUATRO números
 *      medidos errados escritos à mão — divisor claro, red flash do pior caso,
 *      anel de foco escuro e a folga do onFill —, todos escritos por alguém que
 *      calculou uma vez, mudou a cor depois e não voltou no comentário. Um
 *      número que ninguém confere é mentira esperando acontecer, então a
 *      afirmação passou a ter FORMA FIXA e mecânica:
 *
 *        [medido] <A> x <B> = <razão com 2 casas>:1
 *        [medido] red-flash(<A>) = <razão com 3 casas>
 *
 *      onde <A>/<B> são caminhos de token deste arquivo (`SURFACE_DARK.level4`,
 *      `ACCENT_LIGHT.action.text`, `DIVIDER_LIGHT`, …) ou uma hex literal.
 *      `tests/theme.test.ts` varre os dois arquivos, RECALCULA cada afirmação
 *      com a mesma `contrastRatio()`/`redFlashRatio()` daqui e reprova a que
 *      divergir; e reprova também qualquer razão escrita FORA dessa forma — uma
 *      razão aproximada solta no meio da prosa não passa mais. Piso normativo
 *      (3:1, 4,5:1, 7:1) não é medida e continua livre.
 */

/* ─── Superfícies: rampa tonal por esquema (elevação por cor, não por sombra) ─
 * Hex EXPLÍCITO por esquema de propósito: a geração de superfícies tonais via
 * color-mix() derivado das variáveis do MUI v9 foi verificada e REFUTADA, então
 * não há matemática de cor em runtime nesta base.
 * Nível 0 = fundo do app · 1 = cartão/superfície de leitura · 2 = painel
 * afundado/well de código · 3 = chrome elevado (rail, dock, menu) · 4 = estado
 * selecionado/hover forte.
 */
export const SURFACE_LIGHT = {
  level0: '#faf7f2',
  level1: '#ffffff',
  level2: '#f3eee5',
  level3: '#e9e2d6',
  level4: '#ddd5c6',
} as const;

/* ONDA 11 (referência Nintendo Switch): a rampa ESCURA passou a ser CINZA
 * NEUTRO. A anterior (#12141a … #363c4c) tinha matiz azul em todos os cinco
 * níveis — o canal B ficava de 8 a 22 pontos acima do R —, e no app rodando ela
 * lia como "quase-preto azulado" em vez do cinza da referência (o cartão sobre
 * scrim do modal Switch é ~#3d3d3d, cinza puro). Agora R = G = B em TODOS os
 * níveis: matiz zero, saturação zero, e o único eixo que separa um nível do
 * vizinho é a LUMINÂNCIA — que é exatamente o que "elevação por cor" quer dizer.
 *
 * OS DOIS NÍVEIS QUE NÃO PODIAM SE MEXER, e por quê (medido, não estimado):
 *   - NÍVEL 2 é o well de código (`CODE_DARK.chrome.surface` em
 *     src/lib/codeTheme.ts). A tabela ANSI de lá foi gerada com cada `bright`
 *     levado A 7:1 CONTRA ESTE NÍVEL, e tests/codeTheme.test.ts trava a banda
 *     em [7 ; 7,25]. A janela de luminância que mantém os seis brights dentro
 *     da banda é Y ∈ [0,019408 ; 0,020820]; o cinza neutro #272727 dá
 *     Y = 0,020289 e cabe (o antigo #232733 dava 0,020474). Qualquer outro
 *     cinza de 8 bits nessa vizinhança (#262626 = 0,019382, #282828 = 0,021219)
 *     cai FORA e reprova a suíte de código.
 *   - NÍVEL 4 é a SELEÇÃO do editor, e o mesmo teste exige 4,5:1 de TODA cor de
 *     código sobre ela. A pior é `syntax.function` #23b2e7 (Y = 0,37968), que
 *     impõe o teto Y(nível 4) <= 0,045477. #3b3b3b dá 0,043735 — cabe:
 *     [medido] #23b2e7 x SURFACE_DARK.level4 = 4,58:1.
 *
 * Passos em L* (CIE): 3,97 · 9,77 · 15,64 · 20,33 · 24,87 — os dois primeiros
 * degraus ABRIRAM (5,80 e 5,87 contra os 5,10 e 4,39 da rampa antiga), que é o
 * par mais visto do app (fundo x cartão de leitura), e o topo continua preso ao
 * teto do editor.
 */
export const SURFACE_DARK = {
  level0: '#0e0e0e',
  level1: '#1b1b1b',
  level2: '#272727',
  level3: '#313131',
  level4: '#3b3b3b',
} as const;

/** Superfície de leitura permitida (níveis onde a tinta alcança 7:1 — AAA). */
export const READING_SURFACE_LEVELS = [0, 1] as const;

/* ─── Tinta ────────────────────────────────────────────────────────────────
 * Superfícies de LEITURA (níveis 0 e 1), piso AAA de 7:1:
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level0 = 16,75:1
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level1 = 17,90:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level0 = 7,70:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level1 = 8,23:1
 *   [medido] INK_DARK.primary x SURFACE_DARK.level0 = 16,94:1
 *   [medido] INK_DARK.primary x SURFACE_DARK.level1 = 15,11:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level0 = 8,60:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level1 = 7,68:1
 *
 * ONDA 11: a tinta escura também era AZULADA (#eceef4 / #a7adbd — B acima de R
 * em 8 e 22 pontos). Sobre uma rampa cinza neutra isso vira um véu azul em cima
 * de tudo que é texto, que é metade da tela. Agora ela é cinza puro, como a
 * rampa — e a secundária ainda GANHOU folga sobre o piso AAA no nível 1, porque
 * o nível 1 escureceu junto.
 *
 * No chrome (níveis 2–4) o piso cai para AA (4,5:1), e o nível 4 é o mais
 * apertado dos cinco — é ele que amarra o teto de luminância do topo da rampa
 * junto com a seleção do editor:
 *   [medido] INK_DARK.primary x SURFACE_DARK.level4 = 9,83:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level4 = 4,99:1
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level4 = 12,28:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level4 = 5,64:1
 *
 * A TINTA SECUNDÁRIA É O RÓTULO DE BOTÃO DESABILITADO (ver MuiButton em
 * src/theme.ts): as quatro medidas acima são o que garante que um "Próximo →"
 * bloqueado pelo quiz continue LEGÍVEL em cima de qualquer nível da rampa, nos
 * dois esquemas — o pior dos dez pares é a medida de `INK_DARK.secondary`
 * no nível 4, listada acima, e ela ainda fica sobre o piso AA.
 */
export const INK_LIGHT = {
  primary: '#191713',
  secondary: '#544e45',
} as const;

export const INK_DARK = {
  primary: '#f0f0f0',
  secondary: '#adadad',
} as const;

/* ─── Acentos ──────────────────────────────────────────────────────────────
 * Cada família tem DOIS valores por esquema, porque acento-como-texto e
 * acento-como-preenchimento são requisitos diferentes. Usar o `fill` como cor
 * de link é o erro clássico que reprova AA.
 *   `text` = >= 4,5:1 contra os níveis 0, 1 E 2 do esquema
 *   `fill` = fundo de botão cujo `onFill` alcança >= 4,5:1
 *
 * ONDE O ACENTO PODE SER TEXTO (regra de projeto, não só número): níveis 0, 1 e
 * 2 — fundo do app, cartão de leitura e painel afundado. Um <Link> dentro de um
 * <Paper> é caso REAL nesta base (LessonView, lista de fontes), então calibrar
 * `text` só contra o nível 0 era um furo esperando acontecer. Nos níveis 3 e 4
 * (chrome: rail, dock, estado selecionado) o texto é TINTA: ali o acento cai
 * ABAIXO do piso AA e só entra como preenchimento, ícone ou borda — papéis cujo
 * piso é 3:1.
 * (A conversa da aula NÃO é exceção a essa fronteira: desde esta onda o painel
 * de mensagens é TRANSPARENTE e as bolhas ficam direto sobre o nível 0, que é o
 * MENOS exigente dos três níveis calibrados. Quem passa no nível 2 passa lá.)
 *
 * Os seis `text` abaixo foram recalibrados contra o NÍVEL 2 (o mais exigente dos
 * três), e por isso passam nos três de uma vez. `tests/theme.test.ts` mede os
 * dezoito pares por esquema; nenhuma tabela de razões é copiada para cá, porque
 * tabela copiada é a forma mais comum do número mentiroso.
 *
 * RED FLASH (SC 2.3.1, teto 0,8): o pior caso das doze cores das seis famílias
 * é a `action` CLARA — [medido] red-flash(ACCENT_LIGHT.action.fill) = 0,661 —,
 * e não o `error`, como este comentário afirmou por uma onda inteira enquanto o
 * preenchimento `action` claro era o antigo #de351b, que media
 * [medido] red-flash(#de351b) = 0,735 — a menos de sete centésimos do teto, e
 * não na folga confortável que a prosa prometia. O teste assere o teto para as
 * doze cores E confere quem é o pior caso.
 */
export interface AccentPair {
  /** Acento legível como TEXTO sobre as superfícies de nível 0, 1 e 2. */
  readonly text: string;
  /** Acento como PREENCHIMENTO de botão/chip. */
  readonly fill: string;
  /** Tinta que vai EM CIMA do `fill`. */
  readonly onFill: string;
}

export type AccentFamily = 'action' | 'success' | 'info' | 'warn' | 'study' | 'error';

/**
 * light: `fill` chapado com tinta BRANCA por cima; `text` calibrado contra o
 * nível 2. As razões dos dezoito pares de texto e dos seis pares de botão são
 * medidas em `tests/theme.test.ts` — aqui só ficam as que explicam uma ESCOLHA.
 *
 * ONDA 12 — O VERMELHO CLARO FOI DESSATURADO UM DEGRAU (prova visual do dono).
 * O `action` claro passava em tudo, mas aparecia em QUATRO elementos ao mesmo
 * tempo na tela clara — barra de progresso, botão "Responder", contorno do campo
 * em foco e contorno do "Fontes" — e sobre o creme lia como vermelho Nintendo
 * puro. É a mesma queixa que a onda 11 resolveu no escuro (#e73f25 → #d9513c),
 * então recebe o mesmo remédio, com a mesma conta: MESMA MATIZ (8°, a da
 * família), saturação HSL de 78% para 66%, LUMINOSIDADE HSL INTACTA.
 *   text  #cc3119 → #be3b27   (h 8,04→7,95 · s 78,2→65,9 · L 44,90 nos dois)
 *   fill  #de351b → #cf402a   (h 8,00→8,00 · s 78,3→66,3 · L 48,82 nos dois)
 * Manter o L do HSL e baixar só o S é o que faz TODA razão MELHORAR em vez de
 * piorar: num vermelho, tirar saturação derruba o canal R (peso 0,2126) e sobe
 * G (peso 0,7152) menos do que a queda de R custa, então a luminância cai e o
 * contra-a-clara sobe.
 *   agora: [medido] ACCENT_LIGHT.action.text x SURFACE_LIGHT.level2 = 4,73:1
 *   antes: [medido] #cc3119 x SURFACE_LIGHT.level2 = 4,52:1
 *   agora: [medido] ACCENT_LIGHT.action.onFill x ACCENT_LIGHT.action.fill = 4,75:1
 *   antes: [medido] #ffffff x #de351b = 4,53:1
 *   agora: [medido] red-flash(ACCENT_LIGHT.action.fill) = 0,661
 *   antes: [medido] red-flash(#de351b) = 0,735
 * A matiz é PRESERVADA porque `CODE_LIGHT.chrome.cursor` (#af2a16, em
 * src/lib/codeTheme.ts) é comparado com `action.text` por matiz, com tolerância
 * de 1°, em tests/codeTheme.test.ts — dessaturar não pode virar trocar de
 * família.
 */
export const ACCENT_LIGHT: Readonly<Record<AccentFamily, AccentPair>> = {
  action: { text: '#be3b27', fill: '#cf402a', onFill: '#ffffff' },
  success: { text: '#1d7b4c', fill: '#1f8653', onFill: '#ffffff' },
  info: { text: '#0d759b', fill: '#0e7ea7', onFill: '#ffffff' },
  warn: { text: '#966106', fill: '#a46a07', onFill: '#ffffff' },
  study: { text: '#9146d3', fill: '#9a54d7', onFill: '#ffffff' },
  // ERRO É UMA FAMÍLIA PRÓPRIA, em carmim (matiz 338 — 30° do vermelho-laranja
  // da `action`, matiz 8). Sem isto "Apagar" e "Testar resposta" seriam o MESMO
  // vermelho, e esta base tem exclusão real (editor.confirmDelete /
  // challenge.confirmDelete).
  // [medido] red-flash(ACCENT_LIGHT.error.text) = 0,605
  error: { text: '#cd2462', fill: '#db306f', onFill: '#ffffff' },
} as const;

/**
 * dark: preenchimento VIVO com tinta quase-preta. Branco por cima NÃO serviria —
 * [medido] #ffffff x ACCENT_DARK.action.fill = 4,04:1, abaixo do piso AA. Aqui
 * `text` DEIXA de ser igual a `fill`: o preenchimento escuro o bastante para
 * carregar tinta quase-preta é escuro demais para ser lido como texto sobre o
 * nível 2, então cada família clareia o seu valor de texto.
 * (As dezoito razões de `text` e as seis de `onFill x fill` são medidas em
 * `tests/theme.test.ts` contra os pisos; nenhuma tabela delas é copiada para cá.)
 *
 * ONDA 11, DUAS MUDANÇAS:
 *   1. `onFill` passou de #12141a (o nível 0 azulado antigo) para o nível 0
 *      NEUTRO. Ele é a tinta que vai em cima de todo botão preenchido do escuro:
 *      deixá-lo azulado sobre uma rampa cinza é a mesma incoerência da tinta.
 *      Como o novo nível 0 é mais escuro, TODA razão onFill/fill subiu.
 *   2. `action.fill` foi SUAVIZADO de #e73f25 para #d9513c (pedido do dono: o
 *      vermelho como PREENCHIMENTO GRANDE — a barra de progresso do topo —
 *      estava estridente). Mesma matiz (8°, a da família), saturação de 80% →
 *      67%: a cor continua sendo `action` e o piso AA GANHOU folga em vez de
 *      perder, e o red flash caiu junto.
 *        agora: [medido] ACCENT_DARK.action.onFill x ACCENT_DARK.action.fill = 4,77:1
 *        antes: [medido] #12141a x #e73f25 = 4,50:1
 *        agora: [medido] red-flash(ACCENT_DARK.action.fill) = 0,606
 *        antes: [medido] red-flash(#e73f25) = 0,698
 *      `action.text` NÃO se mexeu: `CODE_DARK.chrome.cursor` é comparado com ele
 *      por MATIZ (tolerância de 1°) em tests/codeTheme.test.ts.
 */
export const ACCENT_DARK: Readonly<Record<AccentFamily, AccentPair>> = {
  action: { text: '#eb614c', fill: '#d9513c', onFill: '#0e0e0e' },
  success: { text: '#26a163', fill: '#218f58', onFill: '#0e0e0e' },
  info: { text: '#1698c7', fill: '#1489b3', onFill: '#0e0e0e' },
  warn: { text: '#c37f0a', fill: '#ae7209', onFill: '#0e0e0e' },
  study: { text: '#b171e8', fill: '#a45be4', onFill: '#0e0e0e' },
  // carmim escuro, par do `error` claro.
  // [medido] red-flash(ACCENT_DARK.error.text) = 0,489
  error: { text: '#e55f90', fill: '#e03e79', onFill: '#0e0e0e' },
} as const;

/* ─── Camada não-texto (>= 3:1) — borda de campo, ícone informativo, anel de foco
 * Divisor puramente decorativo NÃO usa esta camada (é isento por "Incidental");
 * borda de formulário e anel de foco USAM.
 *
 * MESMA FRONTEIRA DE NÍVEL, e ela é mais apertada que a do acento-como-texto:
 * estes três valores só alcançam 3:1 nos níveis 0 e 1. Os seis pares do PISO
 * (nível 0, o mais exposto) e os do nível 1:
 *   [medido] NONTEXT_LIGHT.neutral x SURFACE_LIGHT.level0 = 3,03:1
 *   [medido] NONTEXT_LIGHT.action x SURFACE_LIGHT.level0 = 3,11:1
 *   [medido] NONTEXT_LIGHT.focus x SURFACE_LIGHT.level0 = 3,02:1
 *   [medido] NONTEXT_DARK.neutral x SURFACE_DARK.level0 = 4,50:1
 *   [medido] NONTEXT_DARK.action x SURFACE_DARK.level0 = 3,97:1
 *   [medido] NONTEXT_DARK.focus x SURFACE_DARK.level0 = 3,51:1
 * Do nível 2 em diante os três caem abaixo do piso nos dois esquemas (o pior é
 * [medido] NONTEXT_DARK.focus x SURFACE_DARK.level4 = 2,04:1), então ali o
 * contorno de 3:1 tem que vir da TINTA — é exatamente por isso que o anel de
 * foco deste tema é de DUAS cores (traço em `focus` + halo em `text.primary`),
 * técnica do Understanding do SC 1.4.11.
 *
 * ONDA 11: o `neutral` escuro era #726856, um cinza QUENTE (marrom-oliva)
 * herdado do par claro. Ele é a borda de todo campo de formulário do app — sobre
 * a rampa neutra ele lia como sujeira amarelada. Agora é cinza puro #7a7a7a, e
 * de quebra ganhou contraste — [medido] #726856 x #12141a = 3,36:1 (o par
 * antigo: aquele cinza quente sobre o nível 0 AZULADO de então), contra a
 * medida de hoje, listada acima —, que é o que aproxima a borda de campo do
 * contorno claro e nítido da referência Switch. A varredura de afirmações desta
 * onda achou este número como QUINTO caso: ele estava escrito contra o nível 0
 * ATUAL, onde a mesma cor mede 3,52 — a rampa mudou embaixo do comentário.
 * O `action` escuro acompanhou o preenchimento suavizado da família (#c52f18 →
 * #c9432c, mesma matiz, menos saturação); o `focus` continua na cor de foco
 * (é um azul de PROPÓSITO — o anel não pode ser cinza como tudo o mais).
 *
 * ONDA 12: o `action` CLARO acompanha a dessaturação do preenchimento da
 * família, pelo mesmo motivo e com a mesma conta (#ea6551 → #dd6b5a: matiz 8°
 * mantida, saturação 78% → 66%). Aqui — e só aqui — a LUMINOSIDADE HSL desceu
 * um degrau junto (61,8 → 61,0), porque este valor vive colado no piso de 3:1:
 * a mesma dessaturação no L original daria #df6e5c, e
 * [medido] #df6e5c x SURFACE_LIGHT.level0 = 3,01:1 — um centésimo de folga não
 * é folga. Com o degrau a menos, a medida do nível 0 listada acima é MAIOR que
 * a da cor anterior: [medido] #ea6551 x SURFACE_LIGHT.level0 = 3,03:1.
 */
export const NONTEXT_LIGHT = {
  neutral: '#978e7f',
  action: '#dd6b5a',
  focus: '#109acb',
} as const;

export const NONTEXT_DARK = {
  neutral: '#7a7a7a',
  action: '#c9432c',
  focus: '#0c7196',
} as const;

/** Divisores decorativos (abaixo de 3:1 de propósito — nunca o único meio de
 *  identificar algo):
 *    [medido] DIVIDER_LIGHT x SURFACE_LIGHT.level0 = 1,36:1
 *    [medido] DIVIDER_LIGHT x SURFACE_LIGHT.level1 = 1,46:1
 *    [medido] DIVIDER_DARK x SURFACE_DARK.level0 = 2,28:1
 *  ONDA 12: a razão do CLARO estava escrita como 1,89 — número que não existe em
 *  superfície nenhuma desta rampa (a mais alta que #ddd5c6 alcança é a do nível
 *  1, medida acima). Só o escuro conferia. Foi um dos quatro números inventados
 *  que a revisão desta onda achou, e é a razão de existir a forma `[medido]`.
 *  ONDA 11: o divisor escuro era #2c313f, byte a byte o NÍVEL 3 da rampa antiga
 *  — ou seja, a borda de um `<Paper variant="raised">` era invisível, porque
 *  tinha exatamente a cor do próprio papel. O novo valor fica ACIMA do topo da
 *  rampa (nível 4 = #3b3b3b), então o traço aparece nos cinco níveis. */
export const DIVIDER_LIGHT = '#ddd5c6';
export const DIVIDER_DARK = '#4d4d4d';

/* ─── Scrim: o escurecimento que separa um modal do resto da tela ───────────
 * ONDA 12. Existe como TOKEN porque cada overlay desta base estava pintando o
 * seu próprio: o do quiz e o de geração de desafio usavam
 * `rgba(8, 10, 20, 0.66)` — cor CRUA e, pior, AZULADA (B 12 pontos acima de R).
 * Sob esse scrim o fundo neutro #0e0e0e vira #0a0b12 e a tela INTEIRA ganha
 * tinta azul, desfazendo a decisão "cinza neutro" da onda 11 no exato momento
 * em que o aluno abre o quiz.
 *
 * DUAS PROPRIEDADES, e as duas são a correção de um defeito visto:
 *   - `color` é ACROMÁTICO (R = G = B = 0): escurecer não pode tingir. Preto
 *     puro é o único valor que preserva a matiz do que está atrás dele em
 *     QUALQUER esquema, e é por isso que ele não sai da rampa de superfície —
 *     a rampa é opaca e tem matiz própria por esquema; o scrim não pode ter.
 *   - `opacityPercent` é 55, não 66: na referência (Nintendo Switch Online) o
 *     jogo continua visível atrás do cartão do convite. A 66% a conversa da
 *     aula sumia e o modal virava uma tela nova; a 55% ela continua lá, atrás.
 *     A separação entre o cartão e o fundo não depende desse degrau: o cartão
 *     do modal é o TOPO da rampa no escuro e a superfície de leitura no claro
 *     (ver `MuiDialog` em src/theme.ts), e sobre o nível 0 do escuro a
 *     diferença de luminância entre os dois scrims aparece só na quarta casa
 *     decimal (o nível 0 vira #060606, Y = 0,001821, contra #050505 e
 *     Y = 0,001518) — o degrau que o modal usa para se
 *     destacar é a RAMPA, não a opacidade do scrim.
 *
 * Consumo: `theme.vars.palette.scrim` (o tema publica o color-mix pronto).
 * Ninguém remonta esta conta na mão. */
export const SCRIM = {
  /** cor base do escurecimento — preto ACROMÁTICO, para não tingir o fundo */
  color: '#000000',
  /** opacidade do scrim, em % (o que fica atrás continua visível) */
  opacityPercent: 55,
} as const;

/* ─── Movimento: dois níveis, separados por PROPRIEDADE ────────────────────
 * spatial: transform/geometria. PODE ultrapassar (overshoot ~9,5%).
 *   derivado de playful ζ=0,6 · k=1400/700/300 → 105/148/227 ms
 * effects: cor e opacidade. NUNCA ultrapassa (criticamente amortecido ζ=1,0).
 *   derivado de k=3800/1600/800 → acomoda em 95/146/207 ms
 */
export const MOTION = {
  spatial: {
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    fast: 105,
    normal: 150,
    slow: 230,
  },
  effects: {
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    fast: 100,
    normal: 160,
    slow: 240,
  },
} as const;

/** Propriedades CSS que o nível `spatial` PODE animar. Qualquer outra é bug. */
export const SPATIAL_ALLOWED_PROPERTIES = [
  'transform',
  'translate',
  'rotate',
  'scale',
  'width',
  'height',
  'inset',
  'top',
  'left',
  'right',
  'bottom',
  'flex-basis',
] as const;

/** Propriedades que NUNCA podem receber easing `spatial` (é assim que texto cintila). */
export const SPATIAL_FORBIDDEN_PROPERTIES = [
  'color',
  'background-color',
  'background',
  'opacity',
  'border-color',
  'fill',
  'stroke',
] as const;

/* ─── Forma ────────────────────────────────────────────────────────────────
 * Arredondamento generoso (registro lúdico), sem gradiente em superfície.
 */
export const SHAPE = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
  /** valor de `theme.shape.borderRadius` */
  base: 14,
} as const;

/* ─── Tipografia ───────────────────────────────────────────────────────────
 * Fontes empacotadas via @fontsource (arquivos LOCAIS — CSP e offline).
 * O corpo a 16px fica preso ao piso cheio de 4,5:1: o alívio de "large scale
 * text" só começa em 24px regular ou 18,67px bold.
 */
export const FONT_STACK = {
  // ONDA 11: display Chakra Petch → NUNITO VARIABLE. Pedido do dono, textual:
  // "a fonte nao quero retro". Chakra Petch é uma sem-serifa QUADRADA de
  // terminais retos (registro techno/arcade), e a onda 1 a tinha trazido do
  // projeto irmão leet-code-rpg junto com um segundo acento PIXEL (Press Start
  // 2P). As duas saíram: a referência visual desta onda (Nintendo Switch Online)
  // é geométrica-humanista, arredondada e limpa, e é isso que o Nunito é.
  //
  // Nunito volta a ser o display que a spec (docs/ux-redesign.md §4.1) sempre
  // documentou — a onda 1 trocou a fonte e NUNCA atualizou a spec, então por
  // dez ondas o documento e o código discordaram.
  //
  // O pacote é VARIÁVEL (@fontsource-variable/nunito, eixo wght 200..1000), ao
  // contrário do Chakra Petch, que era estático e parava em 700 — por isso a
  // escala de título volta a poder usar 800 no topo (ver src/theme.ts).
  display: "'Nunito Variable', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif",
  body: "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
  // NÃO existe mais um papel `accent`. Ele era a stack do Press Start 2P, e um
  // quarto papel que aponta para a mesma família do `display` seria só uma porta
  // aberta para uma fonte retro voltar sem ninguém notar. A variante `pixel` do
  // tema (nome LEGADO, ver src/theme.ts) hoje é um rótulo de HUD em `display`.
} as const;

export const TYPE = {
  /** corpo do app e da prosa */
  bodySize: 16,
  /** entrelinha da prosa — dentro do intervalo de teste do C21 (1.5 a 2) */
  proseLineHeight: 1.6,
  /** espaço entre parágrafos: 1,5 x a caixa de linha de 1,5 */
  proseParagraphGap: '2.25em',
  /** medida-alvo da coluna de leitura */
  measureCh: 72,
  /** teto rígido da medida (SC 1.4.8) */
  measureMaxCh: 80,
  /** blocos de código */
  codeSize: 14,
  codeLineHeight: 1.5,
  /** limiar a partir do qual vale o alívio de 3:1 (bold) — use 18.67, não 18.5 */
  largeTextBoldPx: 18.67,
  /** limiar de large text regular */
  largeTextRegularPx: 24,
} as const;

/* ─── Contrato da camada de celebração (SC 2.3.1 / 2.2.2 / 2.3.3 / 4.1.3) ── */
export const CELEBRATION = {
  /** abaixo de 5 s o SC 2.2.2 não exige controle de pausa */
  maxDurationMs: 4000,
  /** teto de transições opostas por segundo, por partícula */
  maxOpposingTransitionsPerSecond: 3,
  /** orçamento de área de flash: 25% do campo de 10 graus (341 x 256 px) */
  maxFlashAreaPx2: 21824,
  /** limiar de "red flash": R/(R+G+B) */
  redFlashRatioThreshold: 0.8,
} as const;

/** R/(R+G+B) de uma cor hex — o teste de red flash do SC 2.3.1, Nota 3. */
export function redFlashRatio(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const sum = r + g + b;
  return sum === 0 ? 0 : r / sum;
}

/** True quando a cor dispara o limiar de red flash e portanto NÃO pode piscar. */
export function isRedFlashColor(hex: string): boolean {
  return redFlashRatio(hex) >= CELEBRATION.redFlashRatioThreshold;
}

/* ─── Contraste WCAG 2.x — a mesma fórmula normativa usada nos testes ─────── */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa de uma cor hex. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = channel(parseInt(h.slice(0, 2), 16));
  const g = channel(parseInt(h.slice(2, 4), 16));
  const b = channel(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Razão de contraste (L1 + 0.05) / (L2 + 0.05), como define o glossário do
 * WCAG 2.2. O Understanding de 1.4.3 é explícito que o valor NÃO arredonda para
 * cima: 4.499:1 não passa em 4.5:1 — então compare sempre com `>=` cru.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pisos normativos usados pelos testes de contraste. */
export const CONTRAST_FLOOR = {
  /** corpo de texto, SC 1.4.3 (AA) */
  bodyAA: 4.5,
  /** corpo de texto, SC 1.4.6 (AAA) — alvo das superfícies de leitura */
  bodyAAA: 7,
  /** large scale text, SC 1.4.3 (AA) */
  largeAA: 3,
  /** componentes de UI e objetos gráficos, SC 1.4.11 (AA) */
  nonText: 3,
} as const;
