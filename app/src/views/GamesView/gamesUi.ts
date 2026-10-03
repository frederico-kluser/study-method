/**
 * app/src/views/GamesView/gamesUi.ts — HELPERS PUROS da secção Games.
 *
 * ONDA-GAMES (vertical slice): aqui mora toda a aritmética de apresentação do
 * mapa e do painel de otimização — bins do histograma, formatação de métricas,
 * estado de cada nó do mapa e classificação de casos de teste. Sem React, sem
 * DOM, sem IPC: é o que os testes node:test conseguem morder diretamente e é o
 * que impede a matemática de se esconder dentro do JSX (padrão da casa: ver
 * `src/lib/splitRatio.ts`, `src/lib/shellNav.ts`).
 *
 * O contrato de tipos é `src/types/games.ts` (TRAVADO — este módulo não o
 * edita, só o consome).
 *
 * ─── CONVENÇÕES DOCUMENTADAS (onde o contrato é ambíguo) ───────────────────
 *
 * 1. HISTOGRAMA (`GameRunResult.histogram`): o contrato traz
 *    `{ bins, myIndex, par }` sem arestas de bin. Assumimos, e está TRAVADO
 *    aqui, que:
 *      - `bins[i]` conta tentativas com contagem de linhas CRESCENTE com `i`
 *        (eixo x = nº de linhas, da esquerda para a direita);
 *      - `myIndex` é o bin onde cai a solução ATUAL;
 *      - os bins têm LARGURA UNITÁRIA em linhas (1 bin = 1 linha): o bin `i`
 *        cobre `myLines + (i − myIndex)` linhas, ancorado no par conhecido
 *        (metrics.lines, myIndex). Com esta âncora o marcador do PAR cai em
 *        `myIndex + (par − myLines)` — posição determinística, mesmo que o
 *        motor mude a origem dos bins. Se o motor um dia enviar bins de largura
 *        ≠ 1, esta função é o ÚNICO lugar a corrigir.
 *
 * 2. MELHOR QUE N%: a distribuição é LOCAL (as tentativas do próprio — ver o
 *    comentário do contrato). "Melhor" = MENOS linhas. Então N% = fração das
 *    tentativas em bins À DIREITA do bin atual (mais linhas = pior), arredondada
 *    para o inteiro mais próximo. Sem tentativas → 0%.
 *
 * 3. CASOS ESCONDIDOS: `GameCaseResult` marca os hidden por AUSÊNCIA de
 *    `expected`/`actual` (o contrato: "Hidden: só ok, sem expected/actual").
 *    Um caso visível falhado traz sempre os dois campos; por isso a regra é
 *    determinística e não depende de convenção de nomes.
 */
import type {
  GameCaseResult,
  GameLang,
  GameLevelSummary,
} from '../../types/games';

/** Linguagens do contrato, na ordem do seletor (ToggleButtonGroup). */
export const GAME_LANGS: readonly GameLang[] = ['c', 'python', 'rust'];

/** É uma linguagem do contrato? (guarda de fronteira para o seletor). */
export function isGameLang(value: unknown): value is GameLang {
  return typeof value === 'string' && (GAME_LANGS as readonly string[]).includes(value);
}

/* ─── Mapa: estado dos nós ───────────────────────────────────────────────────
 * O contrato (`GameLevelSummary`) só traz `completed` — o "atual" é o PRIMEIRO
 * nível não concluído (o que o aluno pode jogar agora) e os posteriores ficam
 * bloqueados. É o mesmo desbloqueio linear das trilhas ("nós desbloqueados por
 * domínio, não por tempo" — mockup .recon/games-research/jogo-na-pratica.html).
 */

/** Estado visual/semântico de um nó do mapa. */
export type GameNodeState = 'done' | 'current' | 'locked';

/**
 * Índice do primeiro nível não concluído (o "atual"), ou -1 quando o mundo
 * está inteiramente concluído (não resta nível por abrir — só repetição).
 */
export function firstOpenLevelIndex(levels: ReadonlyArray<GameLevelSummary>): number {
  return levels.findIndex((l) => !l.completed);
}

/**
 * Estado de um nó. `openIndex` é o que `firstOpenLevelIndex` devolveu.
 * Um nível não concluído ATRÁS do atual (estado teoricamente impossível com
 * desbloqueio linear) conta como `locked`: o mapa nunca mente sobre o que está
 * aberto — só o nó do `openIndex` é que se pode jogar de novo com progresso.
 */
export function levelNodeState(
  level: GameLevelSummary,
  index: number,
  openIndex: number,
): GameNodeState {
  if (level.completed) return 'done';
  return index === openIndex ? 'current' : 'locked';
}

/** Contagem do cabeçalho do mundo: níveis normais e chefes. */
export function worldLevelCounts(levels: ReadonlyArray<GameLevelSummary>): {
  levelCount: number;
  bossCount: number;
} {
  const bossCount = levels.filter((l) => l.boss).length;
  return { levelCount: levels.length - bossCount, bossCount };
}

/**
 * id do nível seguinte (para "Avançar ›"), ou null no fim do mundo. O chefe é
 * o último nó; depois dele não há avanço — o botão some e o mapa é o destino.
 */
export function nextLevelId(
  levels: ReadonlyArray<GameLevelSummary>,
  index: number,
): string | null {
  return levels[index + 1]?.id ?? null;
}

/**
 * Chave do payload pré-carregado de um nível (o mapa pede o payload do nível
 * atual de cada mundo só para mostrar as introduções/tags — o "quase spoiler"
 * que o contrato permite: o payload não traz casos nem referência).
 */
export function previewKey(worldId: string, levelId: string): string {
  return `${worldId}::${levelId}`;
}

/* ─── Histograma (painel de otimização) ────────────────────────────────────── */

/** Piso de altura de uma barra não vazia (%): 1 tentativa tem de se VER. */
export const HISTOGRAM_MIN_BAR_PERCENT = 8;

/**
 * Altura de cada barra em % da barra mais alta (0-100). Bin vazio = 0 (sem
 * barra); bin não vazio nunca desce abaixo de `HISTOGRAM_MIN_BAR_PERCENT` para
 * não desaparecer quando a distribuição tem um pico dominante. Zero bins → [].
 */
export function histogramBarHeights(bins: ReadonlyArray<number>): number[] {
  const max = bins.reduce((m, b) => Math.max(m, b), 0);
  if (max <= 0) return bins.map(() => 0);
  return bins.map((b) => {
    if (b <= 0) return 0;
    const pct = (b / max) * 100;
    return Math.max(HISTOGRAM_MIN_BAR_PERCENT, pct);
  });
}

/**
 * "A tua solução: melhor que N%" — fração das tentativas com MAIS linhas que a
 * atual (bins à direita de `myIndex`), arredondada ao inteiro. Ver convenção 2
 * no topo. `myIndex` fora do intervalo é aparado (motor mal-comportado não
 * produz percentagens impossíveis).
 */
export function histogramBetterThanPercent(
  bins: ReadonlyArray<number>,
  myIndex: number,
): number {
  const total = bins.reduce((s, b) => s + Math.max(0, b), 0);
  if (total === 0) return 0;
  const idx = Math.min(Math.max(myIndex, 0), bins.length - 1);
  let worse = 0;
  for (let i = idx + 1; i < bins.length; i++) worse += Math.max(0, bins[i]);
  return Math.round((worse / total) * 100);
}

/**
 * Índice do bin onde cai o marcador do PAR, pela convenção de largura unitária
 * (ver convenção 1 no topo): `myIndex + (par − myLines)`, aparado ao intervalo
 * dos bins. Sem bins → -1 (nenhum marcador a desenhar).
 */
export function histogramParIndex(args: {
  par: number;
  myLines: number;
  myIndex: number;
  binCount: number;
}): number {
  const { par, myLines, myIndex, binCount } = args;
  if (binCount <= 0) return -1;
  const raw = myIndex + (par - myLines);
  return Math.min(Math.max(raw, 0), binCount - 1);
}

/**
 * Posição horizontal (0-100%) do CENTRO do bin `index` — onde o marcador do
 * par e a etiqueta se aninham. Sem bins → 0.
 */
export function histogramBarCenterPercent(index: number, binCount: number): number {
  if (binCount <= 0 || index < 0) return 0;
  return ((Math.min(index, binCount - 1) + 0.5) / binCount) * 100;
}

/* ─── Formatação de métricas ─────────────────────────────────────────────────
 * Unidades SI curtas ("ms", "s", "linhas" é rótulo i18n, não formato). O
 * separador decimal segue o locale (pt-BR "1,2 s" / en "1.2 s") — é o mesmo
 * `Intl.NumberFormat` que o resto do app usa quando formata números.
 */

/** Um inteiro com separador de milhar do locale (ex.: 1234 → "1.234" pt-BR). */
export function formatLines(lines: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Math.round(lines));
}

/**
 * Duração curta: < 1000 ms em milissegundos inteiros ("4 ms"), acima disso em
 * segundos com 1 casa decimal ("1,2 s"). É a escala do mockup canónico
 * (jogo-na-pratica.html §03: "4 ms" · "recorde: 1 ms").
 */
export function formatMs(ms: number, locale: string): string {
  const value = Math.max(0, ms);
  if (value < 1000) {
    return `${new Intl.NumberFormat(locale).format(Math.round(value))} ms`;
  }
  const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1000);
  return `${seconds} s`;
}

/* ─── Casos de teste ───────────────────────────────────────────────────────── */

/**
 * Caso ESCONDIDO: o contrato marca-o por ausência de `expected`/`actual`
 * (ver convenção 3 no topo). O resultado mostra só ✓/✗ — nunca valores.
 */
export function isHiddenCase(result: GameCaseResult): boolean {
  return result.expected === undefined && result.actual === undefined;
}
