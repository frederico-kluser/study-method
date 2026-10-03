/**
 * src/lib/designTokens.ts — CONTRATO do design system "Apple" (redesign).
 *
 * Este módulo é a ÚNICA fonte de verdade dos valores do design system. Ele não
 * importa nada do MUI e não cria tema: é só dado, para que o tema (src/theme.ts),
 * a paleta de código (src/lib/codeTheme.ts), o CSS de bootstrap (src/index.css)
 * e os testes de contraste leiam EXATAMENTE os mesmos números.
 *
 * A referência deste redesenho é o design system da Apple: a rampa de cinzas
 * neutros do sistema (systemGray), as cores de sistema (systemBlue, systemRed,
 * ...), a tipografia SF, os raios contínuos e o movimento contido. Onde a Apple
 * publica um valor nomeado, este contrato usa esse valor literal. Onde ela não
 * publica, o valor é interpolado DENTRO da mesma família e a razão está escrita.
 *
 * REGRAS QUE ESTE ARQUIVO EXISTE PARA IMPOR:
 *   1. Ninguém inventa hex. Se um valor não está aqui, ele não entra no produto.
 *   2. `spatial` só anima transform/geometria; `effects` só cor/opacidade.
 *      Aplicar `spatial` a `color`/`background-color`/`opacity` é bug.
 *   3. Prosa longa e código só nas superfícies de nível 0 e 1, que são as
 *      superfícies de LEITURA: ali a tinta alcança o piso AAA.
 *   3b. ACENTO-COMO-TEXTO vale nos níveis 0, 1 e 2 — e só neles. Nos níveis 3 e
 *      4 (o chrome: rail, dock, estado selecionado) o texto é TINTA; ali o
 *      acento só aparece como preenchimento, ícone ou borda. A mesma fronteira
 *      vale para NONTEXT_*: >= 3:1 apenas nos níveis 0 e 1.
 *   4. Nenhuma cor que participe de animação pode ter R/(R+G+B) >= 0.8 — esse é
 *      o limiar de "red flash" do WCAG 2.2 SC 2.3.1. A família `error` é a que
 *      mais se aproxima do teto e ainda assim fica com folga:
 *      [medido] red-flash(#e60012) = 0,927 (o vermelho que a regra reprova, e
 *      que por isso NÃO é usado).
 *   5. TODO NÚMERO DE CONTRASTE OU DE RED FLASH ESCRITO NUM COMENTÁRIO DESTE
 *      ARQUIVO (e de src/theme.ts) É UMA AFIRMAÇÃO VERIFICADA, e a verificação
 *      é automática. Ela tem FORMA FIXA:
 *
 *        [medido] <A> x <B> = <razão com 2 casas>:1
 *        [medido] red-flash(<A>) = <razão com 3 casas>
 *
 *      onde <A>/<B> são caminhos de token deste arquivo (`SURFACE_DARK.level4`,
 *      `ACCENT_LIGHT.action.text`, `DIVIDER_LIGHT`, ...) ou uma hex literal.
 *      tests/theme.test.ts varre os dois arquivos, RECALCULA cada afirmação com
 *      a mesma `contrastRatio()`/`redFlashRatio()` daqui e reprova a que
 *      divergir; e reprova também qualquer razão escrita FORA dessa forma. Piso
 *      normativo (3:1, 4,5:1, 7:1) não é medida e continua livre.
 *
 *      Um número que ninguém confere é mentira esperando acontecer. A
 *      calibração inteira deste contrato sai de `tools/design/palette.ts`, que
 *      chama as MESMAS funções que os testes, e por isso nenhum número aqui é
 *      lembrança.
 *   6. POLÍTICA DE ÍCONES E EMOJI (ONDA-UX-AUDIT-2-AULA, finding-3):
 *      NENHUM emoji em controle interativo; emoji de celebração só em copy
 *      de status de uso único (ex.: "Aula concluída! 🎉"). Glifo de controle
 *      é MUI funcional, uma metáfora por significado (`AutoStories` é a
 *      persona Tutor e de mais ninguém; `EmojiEvents`/troféu foi aposentado
 *      por ler como gamificação). E UMA regra de tinta por nível de ação: a
 *      ação destacada leva o acento (borda/ícone/preenchimento) e as
 *      irmãs ficam em tinta neutra — nunca duas linguagens de tinta na
 *      mesma fileira.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DECISÃO 1 — ONDE A APPLE DIZ UMA COISA E A ACESSIBILIDADE EXIGE OUTRA
 * ══════════════════════════════════════════════════════════════════════════
 * O design system da Apple foi calibrado para o hardware e o tamanho de texto
 * dele. Duas exigências deste projeto ficam ACIMA dele, e as duas aparecem como
 * cor deliberadamente mais escura (ou mais clara) que a da Apple:
 *
 *   1. TEXTO SECUNDÁRIO COM PISO AAA. `INK_LIGHT.secondary` é mais escuro que o
 *      `secondaryLabel` da Apple. Esse valor da Apple não alcança o piso de
 *      leitura deste projeto nas superfícies de nível 0 e 1, então a mesma
 *      família de cinza (R = G, B dois pontos acima) foi levada a um L mais
 *      baixo. A hierarquia deixa de vir do tom e passa a vir de tamanho e peso,
 *      que é o que a Apple faz de qualquer forma.
 *
 *   2. RÓTULO DE PREENCHIMENTO COM PISO AA. A Apple assina botões preenchidos
 *      com rótulo branco sobre cor de sistema, e o par fica abaixo do piso de
 *      AA. Aqui o par `fill`/`onFill` tem que alcançar o piso cheio, e por isso
 *      os preenchimentos claros são as cores de MARCA da Apple (o azul do
 *      apple.com, não o systemBlue do iOS) e os preenchimentos escuros carregam
 *      tinta quase-preta: é o registro que a Apple também usa quando o
 *      preenchimento é vivo demais para rótulo claro (o botão de Baixo Consumo,
 *      os selos de foco, os filtros da Tela em Uso).
 *
 * Ambas as escolhas são do projeto, não da Apple, e estão escritas aqui porque
 * um próximo leitor vai comparar com o picker da Apple e achar um erro.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DECISÃO 2 — A RAMPA ESCURA USA OS systemGray LITERAIS
 * ══════════════════════════════════════════════════════════════════════════
 * `#1c1c1e` e `#2c2c2e` são os systemGray escuros publicados pela Apple
 * (systemGray6 e systemGray5) e aparecem NA RAIZ da rampa, sem reinterpretação.
 * Os demais degraus são interpolados dentro da mesma família (B dois pontos
 * acima do R), e o porquê de cada um está escrito junto da rampa.
 * O primeiro degrau, o canvas, a Apple define como preto puro e aqui é
 * `#0a0a0c`: o mesmo
 * passo (B dois pontos acima do R), um degrau acima do zero absoluto, para que
 * o canvas tenha corpo sobre qualquer painel e para que o preto puro fique
 * reservado ao scrim, que é a única cor deste contrato que precisa escurecer
 * sem tingir (ver SCRIM abaixo).
 *
 * Os PASSOS de L* entre níveis vizinhos são todos maiores que quatro, a mesma
 * regra da rampa anterior: dois planos que quase empatam não são dois planos.
 * O teto de luminância do topo da rampa subiu com a rampa nova. O que prende
 * esse topo hoje é a seleção do editor, e ela é medida diretamente:
 * tests/codeTheme.test.ts exige que TODA cor de código alcance o piso cheio de
 * texto sobre a seleção, nos dois esquemas. O teto de L* virou o espelho dessa
 * exigência, e não a sua substituta.
 */

/* ─── Superfícies: rampa tonal por esquema (elevação por cor, não por sombra) ─
 * Hex EXPLÍCITO por esquema. Nível 0 = fundo do app · 1 = cartão/superfície de
 * leitura · 2 = painel afundado/well de código · 3 = chrome elevado (rail, dock,
 * linha atual) · 4 = estado selecionado/hover forte.
 *
 * CLARO: os cinzas são os systemGray claros da Apple deslocados para o papel.
 * O nível 0 é o `#f5f5f7` que a Apple usa como fundo de página; o nível 1 é o
 * branco do cartão; o nível 2 é o well de código, na família do bloco de código
 * da documentação da Apple (cinza um degrau abaixo da página, texto escuro).
 * Os níveis 3 e 4 continuam a escala.
 */
export const SURFACE_LIGHT = {
  level0: '#f5f5f7',
  level1: '#ffffff',
  level2: '#ececf2',
  level3: '#e0e0e8',
  level4: '#d9d9e3',
} as const;

/* ESCURO: o canvas `#0a0a0c` como primeiro degrau (DECISÃO 2), e depois os
 * systemGray escuros publicados pela Apple. Os níveis 1 e 2 são os valores
 * LITERAIS (`#1c1c1e` = systemGray6, `#2c2c2e` = systemGray5). Os níveis 3 e 4
 * são interpolados DENTRO da mesma família (B dois pontos acima do R), e não
 * são os systemGray4/systemGray3 publicados, por uma razão medida:
 *
 * O terminal precisa de DOIS níveis de ênfase dentro da mesma faixa de
 * contraste. O `bright` da tabela ANSI é levado a 7:1 contra o well (nível 2) e
 * o `normal` tem que ficar ABAIXO disso para o par não empatar, mas ainda acima
 * do piso de texto sobre a SELEÇÃO (nível 4). Essa janela existe se, e somente
 * se, a distância em luminância entre o nível 2 e o nível 4 não for grande
 * demais: com o topo da rampa no systemGray3 publicado a janela encolhia para
 * menos de um passo de canal de 8 bits e nenhum par normal/bright cabia. Os
 * valores de hoje abrem a janela que o terminal precisa sem tirar nenhum nível
 * do passo mínimo de L* de quatro.
 *
 * A prova de que todos os passos de L* passam de quatro vive em
 * tests/theme.test.ts, que calcula o passo direto da luminância de cada hex.
 */
export const SURFACE_DARK = {
  level0: '#0a0a0c',
  level1: '#1c1c1e',
  level2: '#2c2c2e',
  level3: '#363638',
  level4: '#404042',
} as const;

/** Superfície de leitura permitida (níveis onde a tinta alcança o piso AAA). */
export const READING_SURFACE_LEVELS = [0, 1] as const;

/* ─── Tinta ────────────────────────────────────────────────────────────────
 * Primária: o near-black da Apple (o texto do apple.com) no claro, e o rótulo
 * de sistema da Apple no escuro. Ambos são valores publicados; nenhuma correção
 * foi necessária.
 *
 * Secundária: DECISÃO 1.1. No claro, `#525255` é a família de cinza da Apple
 * levada a um L que alcança o piso AAA sobre o canvas. No escuro, `#b8b8bd` é
 * o mesmo movimento para cima, e ele precisa subir mais porque o topo da rampa
 * escura é mais alto do que o chão da clara é baixo: a tinta secundária tem que
 * atravessar os cinco níveis.
 *
 * As medidas de superfície de LEITURA (níveis 0 e 1, piso AAA) e de chrome
 * (níveis 2 a 4, piso AA):
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level0 = 15,46:1
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level1 = 16,83:1
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level2 = 14,30:1
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level3 = 12,82:1
 *   [medido] INK_LIGHT.primary x SURFACE_LIGHT.level4 = 12,01:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level0 = 7,15:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level1 = 7,79:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level2 = 6,62:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level3 = 5,93:1
 *   [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level4 = 5,56:1
 *   [medido] INK_DARK.primary x SURFACE_DARK.level0 = 18,17:1
 *   [medido] INK_DARK.primary x SURFACE_DARK.level1 = 15,63:1
 *   [medido] INK_DARK.primary x SURFACE_DARK.level2 = 12,80:1
 *   [medido] INK_DARK.primary x SURFACE_DARK.level3 = 11,07:1
 *   [medido] INK_DARK.primary x SURFACE_DARK.level4 = 9,50:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level0 = 10,01:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level1 = 8,61:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level2 = 7,05:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level3 = 6,10:1
 *   [medido] INK_DARK.secondary x SURFACE_DARK.level4 = 5,24:1
 *
 * A TINTA SECUNDÁRIA É O RÓTULO DE BOTÃO DESABILITADO (ver MuiButton em
 * src/theme.ts): a medida mais apertada das vinte acima é a de
 * `INK_DARK.secondary` sobre o nível 4, e ela ainda fica sobre o piso AA. É o
 * que garante que um "Avançar" bloqueado pelo quiz continue legível em cima de
 * qualquer nível da rampa, nos dois esquemas.
 */
export const INK_LIGHT = {
  primary: '#1d1d1f',
  secondary: '#525255',
} as const;

export const INK_DARK = {
  primary: '#f5f5f7',
  secondary: '#b8b8bd',
} as const;

/* ─── Acentos ──────────────────────────────────────────────────────────────
 * As seis famílias são as cores de SISTEMA da Apple, cada uma com DOIS valores
 * por esquema, porque acento-como-texto e acento-como-preenchimento são
 * requisitos diferentes. Usar o `fill` como cor de link é o erro clássico que
 * reprova AA.
 *   `text` = >= 4,5:1 contra os níveis 0, 1 E 2 do esquema
 *   `fill` = fundo de botão cujo `onFill` alcança >= 4,5:1
 *
 * O MAPEAMENTO nas famílias (a Apple tem nove cores de sistema; o contrato tem
 * seis papéis):
 *   action  -> systemBlue   (a cor de marca do apple.com, que é a única que
 *                           carrega rótulo branco no piso AA)
 *   success -> systemGreen
 *   info    -> systemTeal
 *   warn    -> systemOrange
 *   study   -> systemPurple (o segundo acento de fato do app, herdado do
 *                           contrato anterior e realocado na família Apple)
 *   error   -> systemRed
 *
 * ONDE O ACENTO PODE SER TEXTO (regra de projeto): níveis 0, 1 e 2. Um <Link>
 * dentro de um <Paper> é caso REAL nesta base (LessonView, lista de fontes), e
 * por isso os `text` foram calibrados contra o nível 2, o mais exigente dos
 * três. Nos níveis 3 e 4 (chrome) o texto é TINTA: ali o acento só entra como
 * preenchimento, ícone ou borda, papéis cujo piso é 3:1.
 *
 * As razões dos doze `text` e dos seis pares de botão são medidas em
 * tests/theme.test.ts; nenhuma tabela delas é copiada para cá, porque tabela
 * copiada é a forma mais comum do número mentiroso.
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
 * nível 2. DECISÃO 1.2: os `fill` são as cores de MARCA da Apple, que são um
 * degrau mais escuras que as cores de sistema do iOS justamente porque elas
 * existem para carregar rótulo branco.
 *
 * Cada família mantém a MATIZ da cor de sistema da Apple e desce o L até o
 * rótulo branco passar no piso. A matiz é preservada porque as famílias se
 * reconhecem pela matiz (o `study` é o roxo, o `warn` é o laranja, o `error` é
 * o vermelho) e porque o `action` é comparado com o cursor do editor por matiz
 * em tests/codeTheme.test.ts.
 *
 * O `error` é família PRÓPRIA em relação ao `action`: um é systemBlue e o outro
 * systemRed, e esta base tem exclusão real (editor.confirmDelete /
 * challenge.confirmDelete) que depende dos dois não empatarem.
 */
export const ACCENT_LIGHT: Readonly<Record<AccentFamily, AccentPair>> = {
  action: { text: '#0066cc', fill: '#0071e3', onFill: '#ffffff' },
  success: { text: '#127029', fill: '#188032', onFill: '#ffffff' },
  info: { text: '#0b698f', fill: '#0a739e', onFill: '#ffffff' },
  warn: { text: '#8a5400', fill: '#a26300', onFill: '#ffffff' },
  study: { text: '#7c2fa3', fill: '#8e2fbe', onFill: '#ffffff' },
  error: { text: '#b3241c', fill: '#c2281f', onFill: '#ffffff' },
} as const;

/**
 * dark: as cores de SISTEMA da Apple, no valor publicado para o modo escuro.
 * Elas são vivas de propósito (é o que faz o modo escuro não virar cinza
 * lavado) e por isso `onFill` é a tinta quase-preta do canvas: sobre o azul de
 * sistema o rótulo branco não alcança o piso AA, e a tinta do canvas alcança
 * com folga.
 *
 * Aqui `text` DEIXA de ser igual a `fill`: o preenchimento vivo o bastante para
 * carregar tinta quase-preta é claro demais para ser lido como texto sobre o
 * nível 2, então cada família tem um valor de texto próprio, mais claro.
 */
export const ACCENT_DARK: Readonly<Record<AccentFamily, AccentPair>> = {
  action: { text: '#4aa4ff', fill: '#0a84ff', onFill: '#0a0a0c' },
  success: { text: '#3ddc65', fill: '#30d158', onFill: '#0a0a0c' },
  info: { text: '#7fdaff', fill: '#64d2ff', onFill: '#0a0a0c' },
  warn: { text: '#ffb94d', fill: '#ff9f0a', onFill: '#0a0a0c' },
  study: { text: '#d88cff', fill: '#bf5af2', onFill: '#0a0a0c' },
  error: { text: '#ff7870', fill: '#ff453a', onFill: '#0a0a0c' },
} as const;

/* Os doze pares de botão e o red flash dos doze preenchimentos, medidos. É esta
 * tabela que sustenta a afirmação de que o rótulo de todo botão preenchido
 * alcança AA e de que nenhuma cor animável da paleta dispara o limiar do
 * SC 2.3.1. O pior caso do red flash é o `error` CLARO, e ele ainda tem folga:
 *   [medido] ACCENT_LIGHT.action.onFill x ACCENT_LIGHT.action.fill = 4,70:1
 *   [medido] red-flash(ACCENT_LIGHT.action.fill) = 0,000
 *   [medido] ACCENT_LIGHT.success.onFill x ACCENT_LIGHT.success.fill = 5,03:1
 *   [medido] red-flash(ACCENT_LIGHT.success.fill) = 0,119
 *   [medido] ACCENT_LIGHT.info.onFill x ACCENT_LIGHT.info.fill = 5,30:1
 *   [medido] red-flash(ACCENT_LIGHT.info.fill) = 0,035
 *   [medido] ACCENT_LIGHT.warn.onFill x ACCENT_LIGHT.warn.fill = 4,86:1
 *   [medido] red-flash(ACCENT_LIGHT.warn.fill) = 0,621
 *   [medido] ACCENT_LIGHT.study.onFill x ACCENT_LIGHT.study.fill = 6,36:1
 *   [medido] red-flash(ACCENT_LIGHT.study.fill) = 0,375
 *   [medido] ACCENT_LIGHT.error.onFill x ACCENT_LIGHT.error.fill = 5,81:1
 *   [medido] red-flash(ACCENT_LIGHT.error.fill) = 0,732
 *   [medido] ACCENT_DARK.action.onFill x ACCENT_DARK.action.fill = 5,42:1
 *   [medido] red-flash(ACCENT_DARK.action.fill) = 0,025
 *   [medido] ACCENT_DARK.success.onFill x ACCENT_DARK.success.fill = 9,78:1
 *   [medido] red-flash(ACCENT_DARK.success.fill) = 0,139
 *   [medido] ACCENT_DARK.info.onFill x ACCENT_DARK.info.fill = 11,50:1
 *   [medido] red-flash(ACCENT_DARK.info.fill) = 0,177
 *   [medido] ACCENT_DARK.warn.onFill x ACCENT_DARK.warn.fill = 9,62:1
 *   [medido] red-flash(ACCENT_DARK.warn.fill) = 0,601
 *   [medido] ACCENT_DARK.study.onFill x ACCENT_DARK.study.fill = 5,61:1
 *   [medido] red-flash(ACCENT_DARK.study.fill) = 0,365
 *   [medido] ACCENT_DARK.error.onFill x ACCENT_DARK.error.fill = 5,81:1
 *   [medido] red-flash(ACCENT_DARK.error.fill) = 0,668
 *
 * E o red flash dos doze valores de TEXTO, que são as outras doze cores
 * animáveis da base:
 *   [medido] red-flash(ACCENT_LIGHT.action.text) = 0,000
 *   [medido] red-flash(ACCENT_LIGHT.success.text) = 0,105
 *   [medido] red-flash(ACCENT_LIGHT.info.text) = 0,042
 *   [medido] red-flash(ACCENT_LIGHT.warn.text) = 0,622
 *   [medido] red-flash(ACCENT_LIGHT.study.text) = 0,371
 *   [medido] red-flash(ACCENT_LIGHT.error.text) = 0,737
 *   [medido] red-flash(ACCENT_DARK.action.text) = 0,150
 *   [medido] red-flash(ACCENT_DARK.success.text) = 0,160
 *   [medido] red-flash(ACCENT_DARK.info.text) = 0,212
 *   [medido] red-flash(ACCENT_DARK.warn.text) = 0,493
 *   [medido] red-flash(ACCENT_DARK.study.text) = 0,354
 *   [medido] red-flash(ACCENT_DARK.error.text) = 0,524 */

/* ─── Camada não-texto (>= 3:1) — borda de campo, ícone informativo, anel de foco
 * Divisor puramente decorativo NÃO usa esta camada (é isento por "Incidental");
 * borda de formulário e anel de foco USAM.
 *
 * Esta camada só alcança 3:1 nos níveis 0 e 1 nos dois esquemas. Do nível 2 em
 * diante o contorno de 3:1 tem que vir da TINTA, e é exatamente por isso que o
 * anel de foco deste tema é de DUAS cores (traço em `focus` + halo em
 * `text.primary`), técnica do Understanding do SC 1.4.11.
 *
 *   [medido] NONTEXT_LIGHT.neutral x SURFACE_LIGHT.level0 = 3,20:1
 *   [medido] NONTEXT_LIGHT.neutral x SURFACE_LIGHT.level1 = 3,48:1
 *   [medido] NONTEXT_LIGHT.action x SURFACE_LIGHT.level0 = 4,31:1
 *   [medido] NONTEXT_LIGHT.action x SURFACE_LIGHT.level1 = 4,70:1
 *   [medido] NONTEXT_LIGHT.focus x SURFACE_LIGHT.level0 = 4,70:1
 *   [medido] NONTEXT_LIGHT.focus x SURFACE_LIGHT.level1 = 5,12:1
 *   [medido] NONTEXT_DARK.neutral x SURFACE_DARK.level0 = 6,07:1
 *   [medido] NONTEXT_DARK.neutral x SURFACE_DARK.level1 = 5,22:1
 *   [medido] NONTEXT_DARK.action x SURFACE_DARK.level0 = 7,18:1
 *   [medido] NONTEXT_DARK.action x SURFACE_DARK.level1 = 6,18:1
 *   [medido] NONTEXT_DARK.focus x SURFACE_DARK.level0 = 5,42:1
 *   [medido] NONTEXT_DARK.focus x SURFACE_DARK.level1 = 4,66:1
 *
 * O `neutral` claro é o systemGray da Apple um degrau mais escuro: o valor
 * publicado pela Apple fica um centésimo abaixo do piso de 3:1 sobre o canvas,
 * e o piso não se negocia (é a borda de todo campo de formulário do app). O
 * `neutral` escuro é o systemGray publicado, que passa com folga.
 *
 * `action` e `focus` são o mesmo azul da família `action`, em dois L: o
 * indicador não-texto e o traço de foco. O traço não é livre: ele tem que
 * alcançar 3:1 contra as superfícies Onde pisa E contra o halo de tinta do anel
 * (que é `text.primary`, o near-black no claro e o quase-branco no escuro).
 * Essa dupla exigência fecha a faixa de luminância do traço em duas pontas, e
 * é por isso que ele não é o mesmo valor nos dois esquemas.
 */
export const NONTEXT_LIGHT = {
  neutral: '#89898e',
  action: '#0071e3',
  focus: '#006bd9',
} as const;

export const NONTEXT_DARK = {
  neutral: '#8e8e93',
  action: '#4a9eff',
  focus: '#0a84ff',
} as const;

/**
 * Divisores decorativos (abaixo de 3:1 de propósito, nunca o único meio de
 * identificar algo). São o separador do sistema da Apple, com a opacidade já
 * composta. Os dois ficam fora da rampa, um para baixo e outro para cima, para
 * que a aresta apareça nos cinco níveis.
 *   [medido] DIVIDER_LIGHT x SURFACE_LIGHT.level0 = 1,57:1
 *   [medido] DIVIDER_LIGHT x SURFACE_LIGHT.level1 = 1,71:1
 *   [medido] DIVIDER_DARK x SURFACE_DARK.level0 = 2,70:1
 *   [medido] DIVIDER_DARK x SURFACE_DARK.level1 = 2,33:1
 */
export const DIVIDER_LIGHT = '#c6c6c8';
export const DIVIDER_DARK = '#565659';

/* ─── Scrim: o escurecimento que separa um modal do resto da tela ───────────
 * Duas propriedades, e as duas são correção de defeito:
 *   - `color` é ACROMÁTICO (R = G = B = 0): escurecer não pode tingir. Preto
 *     puro é o único valor que preserva a matiz do que está atrás dele em
 *     QUALQUER esquema, e é por isso que ele não sai da rampa de superfície,
 *     que é opaca e tem matiz própria por esquema.
 *   - `opacityPercent` é 40, o degrau do sheet do iOS: o que está atrás continua
 *     legível como contexto. Mais alto que isso e a conversa da aula some, e o
 *     modal vira uma tela nova. A separação entre o cartão e o fundo não depende
 *     desse degrau: o cartão do modal é o TOPO da rampa no escuro e a superfície
 *     de leitura no claro (ver `MuiDialog` em src/theme.ts).
 *
 * Consumo: `theme.vars.palette.scrim` (o tema publica o color-mix pronto).
 * Ninguém remonta esta conta na mão. */
export const SCRIM = {
  /** cor base do escurecimento — preto ACROMÁTICO, para não tingir o fundo */
  color: '#000000',
  /** opacidade do scrim, em % (o que fica atrás continua visível) */
  opacityPercent: 40,
} as const;

/* ─── Movimento: dois níveis, separados por PROPRIEDADE ────────────────────
 * A referência é o movimento do SwiftUI e das transições de plataforma da
 * Apple: curto, com desaceleração longa na entrada e um ressalto discreto.
 *
 * spatial: transform/geometria. PODE ultrapassar. O easing é a aproximação em
 *   CSS da mola `.snappy` do SwiftUI (resposta curta, amortecimento alto), com
 *   ressalto de uns 2,6% do valor final: o suficiente para o gesto parecer
 *   físico, curto demais para parecer brincadeira.
 * effects: cor e opacidade. NUNCA ultrapassa (criticamente amortecido), e usa
 *   a curva `ease` da plataforma, que é o que a Apple emprega em toda troca de
 *   cor de controle.
 */
export const MOTION = {
  spatial: {
    easing: 'cubic-bezier(0.34, 1.28, 0.64, 1)',
    fast: 140,
    normal: 220,
    slow: 340,
  },
  effects: {
    easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    fast: 110,
    normal: 180,
    slow: 280,
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
 * Os raios são os do sistema da Apple: cartão pequeno em 8, superfície de
 * conteúdo em 12 e contêiner grande em 18. O `pill` é a cápsula, que é o
 * formato do botão de ação da Apple em toda plataforma (o apple.com usa 980px
 * para o mesmo efeito: o número não importa, importa que o raio alcance a
 * metade da altura e o alvo vire pílula). A REGRA DE FORMA é
 * fixa e vale para a página inteira: contêiner arredondado, ação em cápsula,
 * campo de formulário no mesmo raio do cartão que o abriga.
 */
export const SHAPE = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
  /** valor de `theme.shape.borderRadius` */
  base: 12,
} as const;

/* ─── Tipografia ───────────────────────────────────────────────────────────
 * Fontes empacotadas via @fontsource (arquivos LOCAIS — CSP e offline), com a
 * fonte de SISTEMA da Apple na frente de cada stack. É o que "fiel à Apple"
 * significa de verdade: onde o SF Pro existe (macOS, iOS), ele é quem desenha;
 * onde não existe, a variável empacotada faz o papel.
 *
 * A Apple usa UMA família de sans em toda a escala (SF Pro), separando display
 * de texto pelo tamanho óptico, não por família. Este contrato faz o mesmo:
 * `display` e `body` são a mesma família com nomes ópticos diferentes na
 * frente, e a hierarquia vem de tamanho, peso e entreletra. `mono` é o SF Mono
 * na frente e o JetBrains Mono empacotado atrás.
 *
 * `FONT_BUNDLED` registra qual família de cada papel é a que o @fontsource
 * REALMENTE carrega. É ela que os testes de fonte conferem: as demais entradas
 * da stack são nomes de sistema, que só resolvem quando o SO os tem.
 */
export const FONT_STACK = {
  display:
    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter Variable', 'Inter', system-ui, 'Segoe UI', Roboto, sans-serif",
  body: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', 'Inter', system-ui, 'Segoe UI', Roboto, sans-serif",
  mono: "'SF Mono', ui-monospace, 'JetBrains Mono Variable', 'JetBrains Mono', Menlo, Consolas, monospace",
} as const;

export const FONT_BUNDLED = {
  display: 'Inter Variable',
  body: 'Inter Variable',
  mono: 'JetBrains Mono Variable',
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
  /** entreletra de display, em em. É o tracking da Apple nos títulos grandes. */
  displayTracking: -0.022,
  /** entreletra de rótulo pequeno, em em (o small caps largo do sistema). */
  labelTracking: 0.06,
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

/* ─── Parsing de hex comum às medições de cor ─────────────────────────────── */

/**
 * Canais 0–255 de uma cor hex CSS — o parser comum de `redFlashRatio`,
 * `relativeLuminance` e `contrastRatio` (que mede por `relativeLuminance`).
 * Aceita as DUAS grafias de cor opaca — `#rgb` e `#rrggbb`, com `#` opcional e
 * qualquer caixa; `#rgb` expande cada dígito para o par (`#f00` é `#ff0000`),
 * então a MESMA cor tem a MESMA medição nas duas grafias. Fora do contrato
 * LANÇA erro claro, o mesmo contrato de rejeição do `hexToRgb()` de
 * `codeTheme.ts`: entrada malformada não pode virar NaN numa fórmula normativa
 * — NaN propagado é falha silenciosa, e NaN comparado com um teto é `false`,
 * falha ABERTA numa guarda de acessibilidade (bugs K e L; testemunhas em
 * `tests/cx-views-theme-design.test.ts`).
 */
function parseHexChannels(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`hex inválida (esperado #rgb ou #rrggbb): "${hex}"`);
  const digits = m[1]!;
  const h = digits.length === 3 ? digits.split('').map((d) => d + d).join('') : digits;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * R/(R+G+B) de uma cor hex — o teste de red flash do SC 2.3.1, Nota 3.
 * Parsing e rejeição vêm do parser comum acima. História (BUG K): antes dele,
 * esta função fatiava a hex sem validar e a grafia curta `#f00` virava NaN;
 * `NaN >= 0.8` é `false`, ou seja, a guarda de acessibilidade falhava ABERTO,
 * aprovando cor red flash para piscar.
 */
export function redFlashRatio(hex: string): number {
  const { r, g, b } = parseHexChannels(hex);
  const sum = r + g + b;
  return sum === 0 ? 0 : r / sum;
}

/**
 * True quando a cor dispara o limiar de red flash e portanto NÃO pode piscar.
 * O teto é `CELEBRATION.redFlashRatioThreshold` INCLUSIVO (`>=` já reprova).
 * Entrada fora do contrato propaga o erro de `redFlashRatio` — engolir o erro e
 * devolver `false` seria falhar ABERTO de novo.
 */
export function isRedFlashColor(hex: string): boolean {
  return redFlashRatio(hex) >= CELEBRATION.redFlashRatioThreshold;
}

/* ─── Contraste WCAG 2.x — a mesma fórmula normativa usada nos testes ─────── */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Luminância relativa de uma cor hex. Parsing e rejeição vêm do parser comum
 * (BUG L: antes dele, a grafia curta `#f00` devolvia NaN aqui e contaminava a
 * razão de contraste inteira).
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexChannels(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Razão de contraste (L1 + 0.05) / (L2 + 0.05), como define o glossário do
 * WCAG 2.2. O Understanding de 1.4.3 é explícito que o valor NÃO arredonda para
 * cima: 4.499:1 não passa em 4.5:1 — então compare sempre com `>=` cru.
 * As duas cores passam pelo parser comum via `relativeLuminance`: as DUAS
 * grafias CSS medem igual e entrada fora do contrato lança (BUG L).
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
