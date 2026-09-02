/**
 * src/lib/homeSetup.ts — lógica PURO da tela inicial (onda 17A — Home guiada;
 * onda 4 — matérias escolhidas por domínio).
 *
 * Sem React/DOM: computa o status do setup a partir dos booleans de chave
 * (`KeysStatus`), a lista de assuntos sugeridos (programação + matemática) e —
 * ONDA 4 — o agrupamento das matérias PERSISTIDAS por domínio (`SubjectSummary`
 * de `study:list-topics`) e a regra de aviso de troca de matéria no meio da
 * aula. Testável via node:test (tsconfig.node.json inclui `src/lib`).
 *
 * Cada sugestão expõe uma CHAVE i18n (`translation:home.suggestions.*`) — a
 * HomeView resolve o rótulo/chip e o texto a pré-preencher com `t()`, e o valor
 * resolvido vira o `subject` da aba Aula. Assim nenhum texto em pt vive numa
 * string do código (regra i18n).
 */
import type { SubjectSummary } from '../../shared/ipc-contract';

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
 * Status do setup: `ready` apenas quando as DUAS chaves (OpenRouter + Brave)
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

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 4 — matérias escolhidas (persistidas) por domínio
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Matérias agrupadas por domínio — as DUAS chaves sempre presentes ([] vazio). */
export interface SubjectDomainGroups {
  programming: SubjectSummary[];
  math: SubjectSummary[];
}

/** Ordem canônica das seções da Home (programação primeiro, depois matemática). */
export const HOME_DOMAIN_ORDER: ReadonlyArray<HomeDomain> = ['programming', 'math'];

/** Uma seção da Home: um domínio + as matérias dele (já em ordem canônica). */
export interface HomeDomainSection {
  domain: HomeDomain;
  subjects: SubjectSummary[];
}

/**
 * Agrupa as matérias persistidas por domínio. `null`/`undefined`/`[]` (estado
 * vazio — nada persistido ainda) devolvem os dois grupos vazios: a Home cai no
 * fluxo de onboarding atual (chips de sugestão).
 */
export function groupSubjectsByDomain(
  subjects: SubjectSummary[] | null | undefined,
): SubjectDomainGroups {
  const groups: SubjectDomainGroups = { programming: [], math: [] };
  for (const subject of subjects ?? []) {
    const domain = subject.domain === 'math' ? 'math' : 'programming';
    groups[domain].push(subject);
  }
  return groups;
}

/**
 * Seções de matérias NA ORDEM CANÔNICA (`HOME_DOMAIN_ORDER`), só com os
 * domínios que têm matéria — uma seção vazia não rende heading nenhum.
 */
export function homeDomainSections(groups: SubjectDomainGroups): HomeDomainSection[] {
  return HOME_DOMAIN_ORDER.map((domain) => ({ domain, subjects: groups[domain] })).filter(
    (section) => section.subjects.length > 0,
  );
}

/**
 * Contagens de progresso sanitizadas para o rótulo do cartão ("x de y aulas"):
 * não-número vira 0 e negativo é preso em 0 (mesma guarda do lessonSelection).
 */
export function subjectProgressCounts(subject: {
  answeredCount: number;
  lessonCount: number;
}): { answered: number; total: number } {
  const sanitize = (value: number): number =>
    Number.isFinite(value) ? Math.max(0, value) : 0;
  return { answered: sanitize(subject.answeredCount), total: sanitize(subject.lessonCount) };
}

/**
 * Regra do aviso de troca de matéria: há sessão ativa (assunto publicado no
 * SessionStateProvider) E o cartão clicado é de OUTRA matéria. Mesma matéria →
 * sem aviso (continua a sessão); sem sessão (assunto null/vazio) → sem aviso
 * (o usuário só começa matéria nova quando não há aula em andamento).
 * Comparação por trim + lowercase: o assunto da sessão é o que o usuário
 * digitou e o do cartão é o nome persistido pelo backend — "grafos" e "Grafos"
 * são a MESMA matéria, e um falso aviso aqui seria pior que qualquer risco de
 * o contrário (uma troca em caixa diferente ainda é a mesma matéria).
 */
export function shouldWarnOnSubjectSwitch(
  activeSubject: string | null | undefined,
  clickedSubject: string | null | undefined,
): boolean {
  const active = typeof activeSubject === 'string' ? activeSubject.trim().toLowerCase() : '';
  const clicked = typeof clickedSubject === 'string' ? clickedSubject.trim().toLowerCase() : '';
  if (active === '' || clicked === '') return false;
  return active !== clicked;
}