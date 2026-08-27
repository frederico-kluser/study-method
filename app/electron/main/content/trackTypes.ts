/**
 * electron/main/content/trackTypes.ts — modelo de dados das TRILHAS (rodada 8).
 *
 * As trilhas são o conteúdo didático do produto: um curso inteiro definido em
 * arquivos JSON versionados em git, criados APENAS pelo CLI de autoria
 * (tools/track-cli.ts) — o aluno não gera mais aula, ele abre a trilha e
 * escolhe a aula pronta. Este arquivo define o formato dos arquivos e a
 * validação que o loader aplica ao carregá-los.
 *
 * Layout em disco (resources/tracks/<slug>/):
 *   track.json                        — a trilha (ordem de módulos)
 *   modules/<slug>/module.json        — módulo (ordem de aulas)
 *   modules/<slug>/lessons/<slug>/lesson.json       — aula (teoria + fontes + desafios)
 *   modules/<slug>/lessons/<slug>/challenges/<slug>/challenge.json — desafio
 *   proficiency.json                  — desafio de proficiência (cobre TUDO)
 *
 * Regras do formato (normativas, validadas pelo loader):
 *   - schemaVersion === 1 em todo arquivo;
 *   - slug: kebab-case ASCII minúsculo, ^[a-z0-9]+(-[a-z0-9]+)*$;
 *   - desafios de aula usam language 'nodejs' (node:test, ESM) — o runner
 *     escreve starter+testes num dir temporário e roda `node --test`;
 *   - references (prerequisites, challenges[]) só apontam para slugs que
 *     EXISTEM na trilha (validação de integridade do loader);
 *   - minFirstStarMs: tempo mínimo (ms) antes de a 1ª estrela poder sumir por
 *     DEMORA (decaimento de velocidade); ausente usa o default do produto
 *     (DEFAULT_MIN_FIRST_STAR_MS em trackTypes — 60s; proficiência 120s).
 */

/** Slug canônico de trilha/módulo/aula/desafio. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Nome do arquivo raiz da trilha, do módulo e da aula (constantes do layout). */
export const TRACK_FILE = 'track.json';
export const MODULE_FILE = 'module.json';
export const LESSON_FILE = 'lesson.json';
export const CHALLENGE_FILE = 'challenge.json';
export const PROFICIENCY_FILE = 'proficiency.json';

export const TRACK_SCHEMA_VERSION = 1;

/**
 * Tempo mínimo antes de a 1ª estrela poder sumir por demora (decaimento de
 * velocidade) — requisito do dono do produto ("tem um número mínimo de tempo
 * pra sumir a primeira estrela"). Antes disso o tick de demora NÃO tira
 * estrela; perdas explícitas (blur/erro/timeout) seguem imediatas.
 */
export const DEFAULT_MIN_FIRST_STAR_MS = 60_000;
/** Proficiência é desafio mais longo: 2 min de carência da 1ª estrela. */
export const PROFICIENCY_MIN_FIRST_STAR_MS = 120_000;

export type TrackChallengeLanguage = 'nodejs';

export interface TrackChallengeSource {
  schemaVersion: number;
  slug: string;
  title: string;
  /** concept_id snake_case (granularidade do docs/04-proficiencia.md §1). */
  concept: string;
  difficulty: number; // 1..5
  language: TrackChallengeLanguage;
  /** enunciado em markdown (o aluno lê antes de clicar em "Começar"). */
  statement: string;
  /** código inicial que o aluno edita (arquivo unico, ESM). */
  starterCode: string;
  /** testes node:test que importam o código do aluno (especificação executável). */
  testsCode: string;
  /** solução de referência (o main roda contra para conferir o desafio). */
  solutionCode: string;
  /** nº de testes executáveis do arquivo de testes (gate de igualdade). */
  expectedTestCount: number;
  /** carência da 1ª estrela em ms (default: DEFAULT_MIN_FIRST_STAR_MS). */
  minFirstStarMs?: number;
}

export interface TrackTheorySection {
  id: string;
  title: string;
  /** conteúdo em markdown (linguagem simples, pt-BR). */
  markdown: string;
  /** trecho de código ilustrativo com explicação (opcional). */
  code?: { language: string; code: string; explanation?: string };
}

export interface TrackSourceLink {
  title: string;
  url: string;
  description: string;
}

export interface TrackLessonSource {
  schemaVersion: number;
  slug: string;
  title: string;
  /** 1 frase — o que esta aula entrega. */
  summary: string;
  difficulty: number; // 1..5
  /** concept_ids que a aula trabalha. */
  concepts: string[];
  /** slugs de aulas ANTERIORES desta trilha — revisão quando o aluno não entender. */
  prerequisites: string[];
  /** base teórica apresentada em modo chat, seção a seção. */
  theory: TrackTheorySection[];
  /** fontes do conteúdo — NUNCA exibidas no fluxo; botão "Fontes" na UI. */
  sources: TrackSourceLink[];
  /** slugs dos desafios da aula (challenges/<slug>/challenge.json). */
  challenges: string[];
}

export interface TrackModuleSource {
  schemaVersion: number;
  slug: string;
  title: string;
  order: number;
  /** slugs das aulas do módulo, na ordem da trilha. */
  lessons: string[];
}

export interface TrackSource {
  schemaVersion: number;
  slug: string;
  title: string;
  description: string;
  language: 'pt-BR' | 'en';
  domain: 'programming' | 'math';
  /** slugs dos módulos, na ordem da trilha. */
  modules: string[];
}

/** Erro de validação: mensagem + caminho do arquivo (para o CLI e o loader). */
export interface TrackValidationIssue {
  file: string;
  message: string;
}

export interface TrackValidationResult {
  ok: boolean;
  issues: TrackValidationIssue[];
}

/**
 * Valida um slug canônico. Retorna a lista de problemas (vazia = ok) — nunca
 * lança; o loader decide como tratar.
 */
export function validateSlug(slug: unknown, file: string): TrackValidationIssue[] {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return [{ file, message: `slug inválido: ${JSON.stringify(slug)} (esperado kebab-case ASCII, ex.: 'nodejs-do-zero')` }];
  }
  return [];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateNumber(v: unknown, file: string, label: string, min: number, max: number): TrackValidationIssue[] {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    return [{ file, message: `${label} inválido: ${JSON.stringify(v)} (esperado número ${min}..${max})` }];
  }
  return [];
}

/** Valida UM desafio (arquivo challenge.json ou proficiency.json). */
export function validateChallengeSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const c = raw as Partial<TrackChallengeSource>;
  const issues: TrackValidationIssue[] = [];
  if (c.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(c.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(c.slug, file));
  if (!isNonEmptyString(c.title)) issues.push({ file, message: 'title vazio' });
  if (!isNonEmptyString(c.concept) || !/^[a-z][a-z0-9_]{1,62}$/.test(c.concept)) {
    issues.push({ file, message: `concept inválido: ${JSON.stringify(c.concept)} (snake_case, ex.: 'variaveis')` });
  }
  issues.push(...validateNumber(c.difficulty, file, 'difficulty', 1, 5));
  if (c.language !== 'nodejs') issues.push({ file, message: `language inválido: ${JSON.stringify(c.language)} (somente 'nodejs')` });
  if (!isNonEmptyString(c.statement)) issues.push({ file, message: 'statement vazio' });
  if (typeof c.starterCode !== 'string') issues.push({ file, message: 'starterCode ausente' });
  if (typeof c.testsCode !== 'string' || c.testsCode.trim().length === 0) issues.push({ file, message: 'testsCode vazio' });
  if (typeof c.solutionCode !== 'string' || c.solutionCode.trim().length === 0) issues.push({ file, message: 'solutionCode vazio' });
  issues.push(...validateNumber(c.expectedTestCount, file, 'expectedTestCount', 1, 100));
  if (c.minFirstStarMs !== undefined) {
    issues.push(...validateNumber(c.minFirstStarMs, file, 'minFirstStarMs', 1, 3_600_000));
  }
  return issues;
}

/** Valida UMA seção de teoria. */
export function validateTheorySection(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'seção de teoria não é objeto' }];
  const s = raw as Partial<TrackTheorySection>;
  const issues: TrackValidationIssue[] = [];
  if (!isNonEmptyString(s.id)) issues.push({ file, message: 'seção sem id' });
  else if (!SLUG_RE.test(s.id)) issues.push({ file, message: `id de seção inválido: ${JSON.stringify(s.id)}` });
  if (!isNonEmptyString(s.title)) issues.push({ file, message: 'seção sem title' });
  if (!isNonEmptyString(s.markdown)) issues.push({ file, message: `seção ${JSON.stringify(s.id)} sem markdown` });
  if (s.code !== undefined) {
    const code = s.code as { language?: unknown; code?: unknown; explanation?: unknown };
    if (!isNonEmptyString(code.language) || !isNonEmptyString(code.code)) {
      issues.push({ file, message: `seção ${JSON.stringify(s.id)} com code malformado (language e code obrigatórios)` });
    }
  }
  return issues;
}

/** Valida UMA aula. `lessonDir` = dir da aula (resolução de challenges/). */
export function validateLessonSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const l = raw as Partial<TrackLessonSource>;
  const issues: TrackValidationIssue[] = [];
  if (l.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(l.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(l.slug, file));
  if (!isNonEmptyString(l.title)) issues.push({ file, message: 'title vazio' });
  if (!isNonEmptyString(l.summary)) issues.push({ file, message: 'summary vazio' });
  issues.push(...validateNumber(l.difficulty, file, 'difficulty', 1, 5));
  if (!Array.isArray(l.concepts)) issues.push({ file, message: 'concepts ausente (array)' });
  if (!Array.isArray(l.prerequisites)) issues.push({ file, message: 'prerequisites ausente (array)' });
  if (!Array.isArray(l.sources)) issues.push({ file, message: 'sources ausente (array)' });
  if (!Array.isArray(l.challenges)) issues.push({ file, message: 'challenges ausente (array)' });
  if (!Array.isArray(l.theory) || l.theory.length === 0) {
    issues.push({ file, message: 'theory ausente/vazia (a aula precisa de base teórica)' });
  } else {
    l.theory.forEach((s, i) => issues.push(...validateTheorySection(s, `${file}#theory[${i}]`)));
  }
  if (Array.isArray(l.sources)) {
    l.sources.forEach((s, i) => {
      if (typeof s !== 'object' || s === null || !isNonEmptyString((s as TrackSourceLink).url) || !isNonEmptyString((s as TrackSourceLink).title)) {
        issues.push({ file, message: `sources[${i}] malformada (title e url obrigatórios)` });
      }
    });
  }
  return issues;
}

/** Valida UM módulo. */
export function validateModuleSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const m = raw as Partial<TrackModuleSource>;
  const issues: TrackValidationIssue[] = [];
  if (m.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(m.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(m.slug, file));
  if (!isNonEmptyString(m.title)) issues.push({ file, message: 'title vazio' });
  issues.push(...validateNumber(m.order, file, 'order', 1, 999));
  if (!Array.isArray(m.lessons) || m.lessons.length === 0) {
    issues.push({ file, message: 'lessons ausente/vazio (o módulo precisa de aulas)' });
  }
  return issues;
}

/** Valida a raiz da trilha. */
export function validateTrackSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const t = raw as Partial<TrackSource>;
  const issues: TrackValidationIssue[] = [];
  if (t.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(t.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(t.slug, file));
  if (!isNonEmptyString(t.title)) issues.push({ file, message: 'title vazio' });
  if (!isNonEmptyString(t.description)) issues.push({ file, message: 'description vazio' });
  if (t.language !== 'pt-BR' && t.language !== 'en') issues.push({ file, message: `language inválido: ${JSON.stringify(t.language)}` });
  if (t.domain !== 'programming' && t.domain !== 'math') issues.push({ file, message: `domain inválido: ${JSON.stringify(t.domain)}` });
  if (!Array.isArray(t.modules) || t.modules.length === 0) {
    issues.push({ file, message: 'modules ausente/vazio (a trilha precisa de módulos)' });
  }
  return issues;
}
