/**
 * src/lib/shellNav.ts — mapa puro de navegação do shell (lógica, sem React/DOM).
 *
 * Extraído da App.tsx (onda 7 — MUI shell) para ser testável via node:test sem
 * jsdom, e para que a ordem das abas e a associação aba→chave i18n (`nav.*`)
 * vivam num único lugar de verdade. As chaves `nav.*` são literais (strictKeyChecks).
 *
 * ONDA 2 DO REDESIGN (rail): as abas horizontais viraram um NAVIGATION RAIL
 * vertical à esquerda (`src/components/shell/NavigationRail.tsx`), construído
 * sobre `<Tabs orientation="vertical">`. O mapa NÃO mudou de forma: continua
 * sendo a mesma lista ordenada, e a invariante de PERMUTAÇÃO CONTÍGUA continua
 * valendo porque o `value` do MUI Tabs continua sendo o índice.
 *
 * ONDA-SEM-DESAFIO-NO-RAIL (pedido do dono, verbatim: "temos que tirar o botão
 * de desafio do left bar"): 'challenge' SAIU de NAV_ITEMS — não renderiza tab
 * no rail. MAS o painel Desafio CONTINUA EXISTINDO no shell: a LessonView e a
 * RoadmapView navegam para ele via `useChallengeNav().navigateToChallenge()`
 * (contexto ChallengeNavProvider → setActive). Por isso os DOIS tipos:
 *
 *   - `NavKey`   — os destinos do RAIL (o que tem tab);
 *   - `PanelKey` — os PAINÉIS do shell (rail + Desafio, que é "painel fantasma":
 *     monta no main, tem `sm-panel-challenge`, mas não tem tab nem ícone).
 *
 * Este módulo permanece SEM React e SEM JSX de propósito — o ícone de cada
 * destino mora no componente do rail, não aqui.
 */

/** Destinos do RAIL (itens que renderizam tab no `NavigationRail`). */
export type NavKey = 'home' | 'settings' | 'lesson' | 'roadmap';

/**
 * Painéis do shell: os destinos do rail + o Desafio (fora do rail — painel
 * acessível só por navegação programática via challengeNav).
 */
export type PanelKey = NavKey | 'challenge';

/**
 * Chaves i18n dos rótulos das abas. Usam o namespace explícito `translation:`
 * porque o `strictKeyChecks` (i18next v25) só aceita a forma
 * `translation:<key>` — ver src/i18n/i18next.d.ts. Em runtime resolve via
 * `defaultNS: 'translation'` + `nsSeparator: ':'`.
 */
export type NavI18nKey =
  | 'translation:nav.home'
  | 'translation:nav.settings'
  | 'translation:nav.lesson'
  | 'translation:nav.roadmap';

export interface NavItem {
  key: NavKey;
  /** Chave i18n do rótulo da aba (nav.*). */
  i18nKey: NavI18nKey;
}

/** Ordem canônica das abas do rail (Início → Settings → Aula → Trilha). */
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: 'home', i18nKey: 'translation:nav.home' },
  { key: 'settings', i18nKey: 'translation:nav.settings' },
  { key: 'lesson', i18nKey: 'translation:nav.lesson' },
  { key: 'roadmap', i18nKey: 'translation:nav.roadmap' },
];

/**
 * Índice de um painel na ordem canônica do rail (para o Tabs value). Painéis
 * FORA do rail (ex.: 'challenge') devolvem -1 — com o MUI Tabs isso significa
 * "nenhuma tab selecionada", que é exatamente o estado visual correto quando o
 * painel ativo foi alcançado por navegação programática.
 */
export function navIndexOf(key: PanelKey): number {
  return NAV_ITEMS.findIndex((n) => n.key === key);
}

/** Retorna o NavItem de um índice válido da ordem canônica. */
export function navItemAt(index: number): NavItem | undefined {
  return NAV_ITEMS[index];
}

/** Validada que o mapa é uma permutação contígua de 0..n-1 (para o Tabs). */
export function navIsContiguous(): boolean {
  return NAV_ITEMS.every((_, i) => navItemAt(i) !== undefined);
}

/**
 * id do elemento `role="tab"` de um destino. Vive aqui, e não no componente,
 * porque o VÍNCULO de a11y tem dois lados que moram em arquivos diferentes: o
 * rail escreve `id` no tab, e o shell escreve `aria-labelledby` no painel. Com
 * a fórmula em dois lugares, um renomear silencioso quebraria o vínculo sem
 * quebrar nenhum teste. Só destinos do RAIL têm tab — o painel Desafio não
 * (ver PanelKey acima).
 */
export function navTabId(key: NavKey): string {
  return `sm-tab-${key}`;
}

/** id do `role="tabpanel"` de um painel (o outro lado do mesmo vínculo). */
export function navPanelId(key: PanelKey): string {
  return `sm-panel-${key}`;
}
