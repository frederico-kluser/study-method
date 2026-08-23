/**
 * src/lib/homeSetup.ts — lógica PURO da tela inicial (onda 17A — Home guiada).
 *
 * Sem React/DOM: só computa o status do setup a partir dos booleans de chave
 * (`KeysStatus`) e a lista de assuntos sugeridos (programação + matemática).
 * Testável via node:test (tsconfig.node.json inclui `src/lib`).
 *
 * Cada sugestão expõe uma CHAVE i18n (`translation:home.suggestions.*`) — a
 * HomeView resolve o rótulo/chip e o texto a pré-preencher com `t()`, e o valor
 * resolvido vira o `subject` da aba Aula. Assim nenhum texto em pt vive numa
 * string do código (regra i18n).
 */
export type HomeDomain = 'programming' | 'math';

/** Status agregado do setup de chaves exibido no card da Home. */
export type HomeSetupStatus = 'ready' | 'missing';

/** Campos de chave que a Home precisa (subconjunto de KeysStatus). */
export interface HomeSetupInput {
  deepseekConfigured: boolean;
  braveConfigured: boolean;
}

/** Uma sugestão de assunto clicável da Home. */
export interface HomeSuggestion {
  /** Domínio do assunto (programação ou matemática). */
  domain: HomeDomain;
  /**
   * Chave i18n literal (`translation:home.suggestions.*`) que dá o rótulo do
   * chip E o texto pré-preenchido na aba Aula. Tipada como união literal para
   * o `t()` com strictKeyChecks aceitar (ver src/i18n/i18next.d.ts).
   */
  labelKey: HomeSuggestionLabelKey;
}

/** União literal das chaves i18n das sugestões (aceitas por `t()`). */
export type HomeSuggestionLabelKey =
  | 'translation:home.suggestions.invertBinaryTree'
  | 'translation:home.suggestions.mergeSort'
  | 'translation:home.suggestions.hashTables'
  | 'translation:home.suggestions.quadraticEquations'
  | 'translation:home.suggestions.pythagoreanTheorem';

/** Ordem canônica das sugestões da Home (2-3 programação + 1-2 matemática). */
export const HOME_SUGGESTIONS: ReadonlyArray<HomeSuggestion> = [
  { domain: 'programming', labelKey: 'translation:home.suggestions.invertBinaryTree' },
  { domain: 'programming', labelKey: 'translation:home.suggestions.mergeSort' },
  { domain: 'programming', labelKey: 'translation:home.suggestions.hashTables' },
  { domain: 'math', labelKey: 'translation:home.suggestions.quadraticEquations' },
  { domain: 'math', labelKey: 'translation:home.suggestions.pythagoreanTheorem' },
];

/**
 * Status do setup: `ready` apenas quando as DUAS chaves (DeepSeek + Brave)
 * estão configuradas; qualquer falta → `missing`. `null`/indefinido (status
 * ainda não carregado) também conta como `missing`.
 */
export function homeSetupStatus(status: HomeSetupInput | null | undefined): HomeSetupStatus {
  if (!status) return 'missing';
  return status.deepseekConfigured && status.braveConfigured ? 'ready' : 'missing';
}

/** Devolve as sugestões de assunto (programação + matemática) em ordem canônica. */
export function homeSuggestedSubjects(): ReadonlyArray<HomeSuggestion> {
  return HOME_SUGGESTIONS;
}

/** True quando há pelo menos uma sugestão de cada domínio (contrato de copy). */
export function homeSuggestionsBalanced(): boolean {
  const domains = new Set(HOME_SUGGESTIONS.map((s) => s.domain));
  return domains.has('programming') && domains.has('math');
}