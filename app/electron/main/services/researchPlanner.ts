/**
 * electron/main/services/researchPlanner.ts — planejador de pesquisa para o tutor,
 * estilo surf-research-agent-skill (onda2-research-live): dado um ASSUNTO, o
 * PLANEJADOR LLM (injetável) gera sub-perguntas + queries {id,q,sub,category} +
 * success_criteria; as queries rodam por RODADAS (cap 2) com eventos por query
 * via onProgress (`study:research-progress`); um ANALISTA LLM (injetável) pode
 * sugerir follow-ups para a rodada 2; a síntese final é findings deduplicados.
 *
 * Degradação honesta (resposta degradada > erro):
 *  - PLANNER LLM indisponível/falho → heurística determinística dos 6 subtópicos
 *    pt-BR (defaultQueriesFor), com categorias mapeadas — nunca pergunta "queries"
 *    à toa;
 *  - ANALISTA LLM indisponível/falho → sem rodada extra (a heurística NUNCA pede
 *    rodada extra); rodada 2 também é cancelada sob rate limit (429);
 *  - CHAVE BRAVE ausente → NÃO roda nenhuma query: emite research:done com
 *    errorKind 'brave-missing' e lança erro com code BRAVE_KEY_MISSING (o
 *    lesson-orchestrator aborta a geração com erro estruturado).
 *  - CHAVE BRAVE INVÁLIDA (401/403) → se TODAS as queries executadas de uma
 *    rodada falharem com BRAVE_KEY_INVALID E a pesquisa seguir sem NENHUMA
 *    fonte, a chave é rejeitada pela API em qualquer query — não há degradação
 *    honesta possível (pesquisa vazia por autenticação): emite research:done
 *    com errorKind 'brave-key-invalid' e lança erro com code BRAVE_KEY_INVALID
 *    (o lesson-orchestrator aborta a geração). Com fontes já coletadas, falhas
 *    de chave em rodada posterior apenas degradam (eventos de erro por query).
 *  - 429 (rate limit) → degradação documentada: erro por query nos eventos e
 *    rodada 2 cancelada (stopReason 'rate limit (429)…').
 *  - OUTROS erros por query (rede, 5xx, sem código) → degradação com eventos de
 *    erro (query-done {ok:false,error}) — a rodada segue com as queries ok.
 *
 * A geração de dúvidas→queries é INJETÁVEL (`generatePlan`/`generateQueries`):
 * a fiação (electron/main/index.ts) pluga a geração por LLM via llmClient
 * (helpers `planWithLlm`/`followUpsWithLlm` exportados aqui — prompts pt-BR no
 * estilo deep-orchestrator). Tudo é função pura / DI — nada toca rede fora do
 * `search` e do `generatePlan`/`generateFollowUps` injetados: 100% testável.
 */

import type {
  ResearchProgressEvent,
  ResearchQueryCategory,
  ResearchQuerySpec,
  ResearchSubQuestion,
  StudyFinding,
} from '@shared/ipc-contract';
import type { BraveSearchService, MultiSearchResult } from './braveSearchService';
import { resolveBraveApiKey, sortByScoreDesc } from './braveSearchService';

// Re-exporta os tipos do plano para os consumidores (fiação/testes) não
// dependerem do caminho shared diretamente.
export type { ResearchQueryCategory, ResearchQuerySpec, ResearchSubQuestion } from '@shared/ipc-contract';

/** Subtópicos fixos (pt-BR) usados pela heurística determinística. */
const DEFAULT_SUBTOPICS = [
  'conceito',
  'exemplos práticos',
  'como funciona',
  'erros comuns',
  'comparação',
  'exercícios',
] as const;

/** Categoria fixa de cada subtópico da heurística (mapa estável). */
const SUBTOPIC_CATEGORY: Record<(typeof DEFAULT_SUBTOPICS)[number], ResearchQueryCategory> = {
  'conceito': 'official-docs',
  'exemplos práticos': 'practice',
  'como funciona': 'official-docs',
  'erros comuns': 'common-errors',
  'comparação': 'comparison',
  'exercícios': 'exercises',
};

/** Comprimento máximo (chars) de uma query gerada; acima disso é filtrada. */
const MAX_QUERY_LENGTH = 120;

/** Cap TOTAL de rodadas (rodada 1 = plano; rodada 2 = follow-ups do analista). */
const MAX_ROUNDS_CAP = 2;

const RESEARCH_CATEGORIES: ReadonlySet<string> = new Set<ResearchQueryCategory>([
  'official-docs',
  'practice',
  'common-errors',
  'comparison',
  'exercises',
]);

/** Cliente LLM mínimo (llmClient é estruturalmente compatível). */
export interface LlmClientLike {
  chatCompletion(req: {
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<{ content: string }>;
}

/** Plano de pesquisa completo (shape emitido em research:plan). */
export interface ResearchPlanShape {
  subQuestions: ResearchSubQuestion[];
  queries: ResearchQuerySpec[];
  successCriteria: string[];
  /** Máximo de rodadas que este plano admite (1 = só a planejada; 2 = follow-up). */
  maxRounds: number;
}

/** Contexto passado ao ANALISTA (generateFollowUps) para a rodada 2. */
export interface FollowUpContext {
  subject: string;
  subQuestions: ResearchSubQuestion[];
  queries: ResearchQuerySpec[];
  /** Digest textual dos findings acumulados (para o ANALYZE LLM). */
  digest: string;
  /** Queries já executadas (todas as rodadas, na forma original). */
  alreadyRan: string[];
  round: number;
  maxRounds: number;
}

export interface ResearchPlannerDeps {
  /** Serviço de busca (Brave) que executa as queries. */
  search: Pick<BraveSearchService, 'multiSearch'>;
  /**
   * Gerador LEGADO de queries a partir do assunto (dúvidas fechadas → queries
   * de busca, sem categoria). Usado quando `generatePlan` não é injetado.
   * Deve retornar queries >= 1; vazias/longas demais são filtradas.
   */
  generateQueries?: (subject: string) => Promise<string[]>;
  /**
   * PLANEJADOR LLM (onda2-research-live): devolve o plano COMPLETO
   * (subQuestions + queries {id,q,sub,category} + successCriteria + maxRounds).
   * Quando falha/indisponível, plan() cai para a heurística determinística.
   */
  generatePlan?: (subject: string) => Promise<ResearchPlanShape>;
  /**
   * ANALISTA LLM (onda2-research-live): após a rodada 1, decide se há lacunas
   * que valem follow-ups. Devolve queries NOVAS (rodada 2). Ausente/falho ⇒
   * nenhuma rodada extra (heurística nunca pede rodada extra).
   */
  generateFollowUps?: (ctx: FollowUpContext) => Promise<ResearchQuerySpec[]>;
  /**
   * Provedor da chave Brave (mesmo caminho do braveSearchService). Default:
   * resolveBraveApiKey (settingsStore.getApiKey('brave') → env BRAVE_API_KEY).
   */
  resolveApiKey?: () => Promise<string>;
}

export interface PlanOptions {
  /** Máx. de resultados finais (após dedup). Default: 30. */
  maxResults?: number;
  concurrency?: number;
  delayMs?: number;
  count?: number;
  /**
   * Push de progresso da pesquisa (events `research:*` do contrato
   * `study:research-progress`). Ordem garantida por rodada:
   * plan → (round-start → (query-start → query-done)* → round-done)* → done.
   */
  onProgress?: (ev: ResearchProgressEvent) => void;
}

export interface ResearchPlan {
  subject: string;
  queries: string[];
  findings: StudyFinding[];
  createdAt: string;
  /** ADITIVO: rodadas executadas (1 ou 2; 0 no caminho brave-missing, que lança). */
  rounds?: number;
  stopReason?: string;
}

/** Normaliza uma query para dedup entre rodadas (lowercase + whitespace colapsado). */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Gera as queries pt-BR de forma DETERMINÍSTICA combinando o subject com os
 * subtópicos fixos. Filtra vazias/curtas demais e longas demais; deduplica e
 * limita a no máximo 6. (Heurística preservada da onda anterior.)
 */
export function defaultQueriesFor(subject: string): string[] {
  const base = subject.trim();
  if (!base) return [];
  const queries: string[] = [];
  for (const sub of DEFAULT_SUBTOPICS) {
    queries.push(`${base} ${sub}`);
  }
  const valid = queries
    .map((q) => q.trim())
    .filter((q) => q && (q.trim().length > 2) && q.trim().length <= MAX_QUERY_LENGTH);
  // Dedup preservando ordem, cap 6.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of valid) {
    if (seen.has(q)) continue;
    seen.add(q);
    out.push(q);
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Plano heurístico determinístico: sub-perguntas = subtópicos fixos, queries =
 * defaultQueriesFor com categorias mapeadas. maxRounds = 1 — a heurística NUNCA
 * pede rodada extra (a rodada 2 só existe quando um ANALISTA LLM sugere).
 */
export function heuristicPlanFor(subject: string): ResearchPlanShape {
  const base = subject.trim();
  const subQuestions: ResearchSubQuestion[] = DEFAULT_SUBTOPICS.map((sub, i) => ({
    id: `sq${i + 1}`,
    question: `${base}: ${sub}`,
  }));
  const queries: ResearchQuerySpec[] = defaultQueriesFor(base).map((q, i) => ({
    id: `q${i + 1}`,
    q,
    sub: subQuestions[i]?.id ?? 'sq1',
    category: DEFAULT_SUBTOPICS[i] ? (SUBTOPIC_CATEGORY[DEFAULT_SUBTOPICS[i]] ?? null) : null,
  }));
  return { subQuestions, queries, successCriteria: [], maxRounds: 1 };
}

/** true se `c` é uma categoria fixa do contrato. */
function isResearchCategory(c: unknown): c is ResearchQueryCategory {
  return typeof c === 'string' && RESEARCH_CATEGORIES.has(c);
}

/** Infere a categoria de uma query AVULSA (legado generateQueries) pelos subtópicos. */
function categoryForQueryString(q: string): ResearchQueryCategory | null {
  const lower = q.toLowerCase();
  for (const sub of DEFAULT_SUBTOPICS) {
    if (lower.includes(sub.toLowerCase())) return SUBTOPIC_CATEGORY[sub];
  }
  return null;
}

/** Coage um plano cru (LLM) para o shape esperado — entradas inválidas viram null/[]. */
export function normalizePlanShape(raw: unknown): ResearchPlanShape {
  const p = (raw ?? {}) as Record<string, unknown>;
  const subQuestions: ResearchSubQuestion[] = Array.isArray(p.subQuestions)
    ? (p.subQuestions as Array<Record<string, unknown>>)
        .filter((s) => s && typeof s.question === 'string' && s.question.trim().length > 0)
        .slice(0, 6)
        .map((s, i) => ({
          id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `sq${i + 1}`,
          question: String(s.question).trim().slice(0, 200),
        }))
    : [];
  const queries: ResearchQuerySpec[] = Array.isArray(p.queries)
    ? (p.queries as Array<Record<string, unknown>>)
        .filter((q) => q && typeof q.q === 'string' && q.q.trim().length > 0)
        .slice(0, 6)
        .map((q, i) => ({
          id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${i + 1}`,
          q: String(q.q).trim().slice(0, MAX_QUERY_LENGTH),
          sub: typeof q.sub === 'string' && q.sub.trim() ? q.sub.trim() : (subQuestions[0]?.id ?? 'sq1'),
          category: isResearchCategory(q.category) ? q.category : null,
        }))
    : [];
  const successCriteria: string[] = Array.isArray(p.successCriteria)
    ? (p.successCriteria as unknown[]).filter((s) => typeof s === 'string').map((s) => String(s).slice(0, 300))
    : [];
  const maxRounds =
    typeof p.maxRounds === 'number' && Number.isFinite(p.maxRounds)
      ? Math.min(MAX_ROUNDS_CAP, Math.max(1, Math.floor(p.maxRounds)))
      : MAX_ROUNDS_CAP;
  return { subQuestions, queries, successCriteria, maxRounds };
}

/** Coage follow-ups crus (ANALISTA LLM) para queries com id estável da rodada. */
export function normalizeFollowUps(raw: unknown, round: number): ResearchQuerySpec[] {
  const list = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  return list
    .filter((q) => q && typeof q.q === 'string' && q.q.trim().length > 0)
    .slice(0, 6)
    .map((q, i) => ({
      id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `r${round + 1}q${i + 1}`,
      q: String(q.q).trim().slice(0, MAX_QUERY_LENGTH),
      sub: typeof q.sub === 'string' && q.sub.trim() ? q.sub.trim() : 'follow-up',
      category: isResearchCategory(q.category) ? q.category : null,
    }));
}

/** Filtra queries já executadas (dedup por normalizeQuery) preservando ordem. */
export function dedupeQueries(pending: ResearchQuerySpec[], alreadyRan: string[]): ResearchQuerySpec[] {
  const seen = new Set<string>(alreadyRan.map(normalizeQuery));
  const out: ResearchQuerySpec[] = [];
  for (const q of pending) {
    if (!q || !q.q || !q.q.trim()) continue;
    const key = normalizeQuery(q.q);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/** Digest textual dos findings (para o ANALYZE LLM decidir follow-ups). */
export function buildDigest(findings: StudyFinding[], maxChars = 12_000): string {
  const lines: string[] = [];
  let total = 0;
  for (const f of findings.slice(0, 24)) {
    const line = `- [${f.query}] ${f.title} — ${f.url}${f.description ? ` — ${f.description.slice(0, 180)}` : ''}`;
    total += line.length + 1;
    if (total > maxChars) break;
    lines.push(line);
  }
  return lines.join('\n');
}

// ─── Prompts LLM (pt-BR, estilo deep-orchestrator) + helpers para a fiação ────

/** Prompt do PLANEJADOR: assinatura + regras + shape JSON EXATO. */
export function buildPlanPrompt(subject: string): { system: string; user: string } {
  const system = [
    'Você é o PLANEJADOR de pesquisa de um tutor de programação e matemática (study-method),',
    'no estilo surf-research: transforma um ASSUNTO de aula em um plano de pesquisa web.',
    'Responda SOMENTE com JSON válido — sem markdown, sem texto fora do JSON.',
  ].join(' ');
  const user = [
    `ASSUNTO DA AULA: "${subject}"`,
    '',
    'Monte o plano com:',
    '- 2 a 4 SUB-PERGUNTAS fechadas (id "sq1".."sqN", question em pt-BR) que a pesquisa deve responder;',
    '- 2 a 6 QUERIES de busca (id "q1".."qN", q em pt-BR), cada uma com "sub" = id da sub-pergunta',
    '  que ela investiga e "category" UMA de: official-docs, practice, common-errors, comparison, exercises;',
    '  varie as categorias entre as queries;',
    '- "success_criteria": critérios objetivos que indicam pesquisa concluída (pt-BR);',
    '- "maxRounds": 2 (máximo de rodadas de follow-up permitido).',
    '',
    'Regras: queries curtas e precisas, com termos técnicos exatos (nomes de API, funções, flags);',
    'inclua contexto de versão/ecossistema quando aplicável; prefira ângulos que um professor usaria.',
    '',
    'Shape JSON EXATO (não adicione campos):',
    '{"subQuestions":[{"id":"sq1","question":"..."}],"queries":[{"id":"q1","q":"...","sub":"sq1","category":"official-docs"}],"success_criteria":["..."],"maxRounds":2}',
  ].join('\n');
  return { system, user };
}

/** Prompt do ANALISTA: decide se vale uma rodada EXTRA de follow-up. */
export function buildFollowUpPrompt(ctx: FollowUpContext): { system: string; user: string } {
  const system = [
    'Você é o ANALISTA de uma pesquisa web já executada de um tutor de programação e matemática.',
    'Lê as fontes coletadas (digest) e decide se há lacunas que valem UMA rodada extra de follow-up.',
    'Responda SOMENTE com JSON válido — sem markdown, sem texto fora do JSON.',
  ].join(' ');
  const user = [
    `ASSUNTO DA AULA: "${ctx.subject}"`,
    `RODADA CONCLUÍDA: ${ctx.round}/${ctx.maxRounds}`,
    '',
    'SUB-PERGUNTAS DO PLANO:',
    ...ctx.subQuestions.map((s) => `- ${s.id}: ${s.question}`),
    '',
    'QUERIES JÁ EXECUTADAS (NÃO repita nenhuma, nem parafraseada):',
    ...ctx.alreadyRan.map((q) => `- "${q}"`),
    '',
    'RESUMO DAS FONTES COLETADAS:',
    ctx.digest.trim() || '(nenhuma fonte retornou resultados)',
    '',
    'Se houver lacuna acionável (fonte primária faltando, erro comum sem resposta, comparação aberta,',
    'exercícios sem exemplo resolvido), devolva follow-ups NOVOS, máx. 4, shape:',
    '{"next_queries":[{"id":"r2q1","q":"...","sub":"sq1","category":"official-docs"}]}',
    'Se o assunto estiver coberto ou nenhuma lacuna valer créditos, devolva {"next_queries":[]}.',
  ].join('\n');
  return { system, user };
}

/** Faz parse do JSON estrito da resposta LLM (aceita fences ```json). Lança se inválido. */
export function parseLlmJson(content: string): unknown {
  const trimmed = (content ?? '').trim();
  if (!trimmed) throw new Error('LLM devolveu resposta vazia.');
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const target = fenced ? fenced[1] : trimmed;
  return JSON.parse(target);
}

/**
 * PLANEJADOR LLM sobre o cliente de chat (temperatura baixa 0.3, JSON estrito).
 * Lança em qualquer falha — o planner cai para a heurística determinística.
 *
 * Sem override de esforço: o raciocínio vem do parâmetro `reasoning` que o
 * cliente aplica por default (`OPENROUTER_REASONING` em
 * `shared/llm/constants.ts`), nunca de imperativo textual no prompt.
 */
export async function planWithLlm(client: LlmClientLike, subject: string): Promise<ResearchPlanShape> {
  const { system, user } = buildPlanPrompt(subject);
  const res = await client.chatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    maxTokens: 1400,
    timeoutMs: 45_000,
  });
  const shape = normalizePlanShape(parseLlmJson(res.content));
  if (shape.queries.length === 0) throw new Error('planner LLM devolveu zero queries.');
  return shape;
}

/**
 * ANALISTA LLM sobre o cliente de chat (temperatura baixa 0.2). Devolve os
 * follow-ups já normalizados; lança em falha de parse/JSON — o planner então
 * NÃO roda rodada extra (degradação honesta). Esforço de raciocínio: default
 * do cliente (o máximo do contrato) — sem override e sem imperativo textual.
 */
export async function followUpsWithLlm(client: LlmClientLike, ctx: FollowUpContext): Promise<ResearchQuerySpec[]> {
  const { system, user } = buildFollowUpPrompt(ctx);
  const res = await client.chatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    maxTokens: 900,
    timeoutMs: 45_000,
  });
  const parsed = parseLlmJson(res.content) as Record<string, unknown> | null;
  const list = Array.isArray(parsed?.next_queries) ? parsed.next_queries : [];
  return normalizeFollowUps(list, ctx.round);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Factory do researchPlanner. `plan` monta o plano (LLM injetado ou heurística),
 * executa via `search.multiSearch` em até 2 rodadas com eventos por query e
 * normaliza o resultado.
 */
export function createResearchPlanner(deps: ResearchPlannerDeps): {
  plan(subject: string, opts?: PlanOptions): Promise<ResearchPlan>;
} {
  const resolveKeyProvider = deps.resolveApiKey ?? resolveBraveApiKey;

  /** Gera o shape do plano: generatePlan (LLM) → generateQueries (legado) → heurística. */
  async function generatePlanShape(subject: string): Promise<ResearchPlanShape> {
    if (deps.generatePlan) {
      // Falha do planner LLM ⇒ heurística determinística (resposta degradada > erro).
      const shape = await deps.generatePlan(subject);
      const normalized = normalizePlanShape(shape);
      if (normalized.queries.length === 0) throw new Error('planner devolveu zero queries');
      return normalized;
    }
    if (deps.generateQueries) {
      const strings = await deps.generateQueries(subject);
      const subQuestions: ResearchSubQuestion[] = DEFAULT_SUBTOPICS.map((sub, i) => ({
        id: `sq${i + 1}`,
        question: `${subject}: ${sub}`,
      }));
      const queries: ResearchQuerySpec[] = strings
        .map((q) => (typeof q === 'string' ? q.trim() : ''))
        .filter((q) => q && q.length > 2 && q.length <= MAX_QUERY_LENGTH)
        .slice(0, 6)
        .map((q, i) => {
          const subIdx = DEFAULT_SUBTOPICS.findIndex((sub) => q.toLowerCase().includes(sub.toLowerCase()));
          return {
            id: `q${i + 1}`,
            q,
            sub: subIdx >= 0 ? subQuestions[subIdx]?.id ?? 'sq1' : 'sq1',
            category: categoryForQueryString(q),
          };
        });
      if (queries.length === 0) throw new Error('gerador de queries devolveu zero queries');
      return { subQuestions, queries, successCriteria: [], maxRounds: 1 };
    }
    return heuristicPlanFor(subject);
  }

  async function plan(subject: string, opts: PlanOptions = {}): Promise<ResearchPlan> {
    const baseSubject = subject.trim();
    if (!baseSubject) {
      throw new Error('Assunto de pesquisa vazio.');
    }
    const onProgress = opts.onProgress;
    const maxResults = Math.max(1, opts.maxResults ?? 30);

    // (d) Brave SEMPRE obrigatória: sem chave resolvível NÃO roda queries — emite
    // research:done {errorKind:'brave-missing'} e lança erro estruturado (o
    // lesson-orchestrator aborta a geração com mensagem clara).
    let apiKey = '';
    try {
      apiKey = (await resolveKeyProvider()).trim();
    } catch {
      apiKey = '';
    }
    if (!apiKey) {
      onProgress?.({
        kind: 'research:done',
        sources: 0,
        rounds: 0,
        stopReason: 'brave-missing',
        errorKind: 'brave-missing',
      });
      const err = new Error(
        'Pesquisa cancelada: chave Brave não configurada. Configure a chave Brave nas configurações ou defina a variável de ambiente BRAVE_API_KEY.',
      );
      (err as Error & { code?: string }).code = 'BRAVE_KEY_MISSING';
      throw err;
    }

    // PLAN — LLM injetado com fallback heurístico.
    let planShape: ResearchPlanShape;
    try {
      planShape = await generatePlanShape(baseSubject);
    } catch {
      planShape = heuristicPlanFor(baseSubject);
    }

    // Cap total de rodadas: 2 quando existe ANALISTA LLM (a rodada 2 SÓ acontece
    // se ele sugerir follow-ups); 1 sem analista (heurística nunca pede rodada
    // extra). O maxRounds declarado pelo plano é informativo; quem decide é o
    // analista — por isso o cap não é reduzido pelo plano heurístico (maxRounds 1).
    const canFollowUp = typeof deps.generateFollowUps === 'function';
    const totalRounds = canFollowUp ? MAX_ROUNDS_CAP : 1;

    onProgress?.({
      kind: 'research:plan',
      subQuestions: planShape.subQuestions,
      queries: planShape.queries,
      maxRounds: totalRounds,
    });

    // ROUNDS — dedup entre rodadas (normalizeQuery) + dedup por url (multiSearch).
    const findings: StudyFinding[] = [];
    const seenUrls = new Set<string>();
    const alreadyRan: string[] = [];
    let round = 0;
    let pending: ResearchQuerySpec[] = planShape.queries;
    let stopReason = 'pesquisa planejada concluída';
    let rateLimited = false;

    while (round < totalRounds && pending.length > 0) {
      round += 1;
      const fresh = dedupeQueries(pending, alreadyRan);
      if (fresh.length === 0) {
        round -= 1; // rodada vazia não conta
        stopReason = 'as queries desta rodada já haviam sido executadas';
        break;
      }
      const idByQuery = new Map<string, string>(fresh.map((q) => [q.q, q.id]));

      onProgress?.({ kind: 'research:round-start', round, totalRounds });

      let multi: MultiSearchResult;
      try {
        multi = await deps.search.multiSearch(fresh.map((q) => q.q), {
          concurrency: opts.concurrency,
          delayMs: opts.delayMs,
          count: opts.count,
          onQueryStart: (q) => {
            onProgress?.({ kind: 'research:query-start', queryId: idByQuery.get(q) ?? q, q });
          },
          onQueryDone: (info) => {
            if (!info.ok && info.error?.code === 'BRAVE_RATE_LIMIT') rateLimited = true;
            onProgress?.({
              kind: 'research:query-done',
              queryId: idByQuery.get(info.query) ?? info.query,
              q: info.query,
              ok: info.ok,
              provider: 'brave',
              ...(info.hits !== undefined ? { hits: info.hits } : {}),
              ...(info.latencyMs !== undefined ? { latencyMs: info.latencyMs } : {}),
              ...(info.credits !== undefined ? { credits: info.credits } : {}),
              ...(info.error ? { error: info.error } : {}),
            });
          },
        });
      } catch (err) {
        // multiSearch nunca lança por query falha; um lançamento aqui é infra
        // (ex.: resolvedor de chave quebrado) — degrada a rodada inteira.
        multi = { results: [], errors: fresh.map((q) => ({ query: q.q, error: err instanceof Error ? err.message : String(err) })) };
      }

      let uniqueSources = 0;
      for (const f of multi.results) {
        if (!f.url || seenUrls.has(f.url)) continue;
        seenUrls.add(f.url);
        findings.push(f);
        uniqueSources += 1;
      }
      const failed = multi.errors.length;
      const ok = fresh.length - failed;

      onProgress?.({ kind: 'research:round-done', round, ok, failed, uniqueSources });

      // CHAVE INVÁLIDA — se TODAS as queries executadas desta rodada falharem
      // com BRAVE_KEY_INVALID E a pesquisa ainda não tem NENHUMA fonte, a chave
      // é rejeitada pela API em qualquer query: não há degradação honesta
      // possível (pesquisa vazia por autenticação) — aborta como o brave-missing,
      // com errorKind 'brave-key-invalid' e code BRAVE_KEY_INVALID (o
      // lesson-orchestrator aborta a geração). Com fontes já coletadas, falhas
      // de chave em rodada posterior apenas degradam (eventos de erro).
      const allKeyInvalid =
        fresh.length > 0 &&
        multi.errors.length === fresh.length &&
        multi.errors.every((e) => e.code === 'BRAVE_KEY_INVALID');
      if (allKeyInvalid && seenUrls.size === 0) {
        onProgress?.({
          kind: 'research:done',
          sources: 0,
          rounds: round,
          stopReason: 'brave-key-invalid',
          errorKind: 'brave-key-invalid',
        });
        const err = new Error(
          'Pesquisa cancelada: a chave da Brave Search foi rejeitada (401/403). Verifique a chave configurada nas configurações ou a variável de ambiente BRAVE_API_KEY.',
        );
        (err as Error & { code?: string }).code = 'BRAVE_KEY_INVALID';
        throw err;
      }

      for (const q of fresh) alreadyRan.push(q.q);
      pending = [];

      // ROUND 2 — só quando o ANALISTA LLM sugere follow-ups E não houve 429.
      if (round < totalRounds) {
        if (rateLimited) {
          stopReason = 'rate limit (429) — sem rodada de follow-up';
          break;
        }
        let followUps: ResearchQuerySpec[] = [];
        try {
          followUps = await deps.generateFollowUps!({
            subject: baseSubject,
            subQuestions: planShape.subQuestions,
            queries: planShape.queries,
            digest: buildDigest(findings),
            alreadyRan: [...alreadyRan],
            round,
            maxRounds: totalRounds,
          });
        } catch {
          stopReason = 'analista indisponível — sem rodada extra';
          break;
        }
        const next = dedupeQueries(normalizeFollowUps(followUps, round), alreadyRan);
        if (next.length === 0) {
          stopReason = 'analista não sugeriu follow-ups novos — pesquisa concluída';
          break;
        }
        pending = next;
        stopReason = 'pesquisa planejada concluída';
      } else if (round >= totalRounds) {
        stopReason = `limite de rodadas atingido (${totalRounds})`;
      }
    }

    const sources = seenUrls.size;
    onProgress?.({ kind: 'research:done', sources, rounds: round, stopReason });

    // Dedup final + limite + ordenação por score desc quando presente.
    let finalFindings = sortByScoreDesc(findings);
    // sortByScoreDesc é estável: itens sem score vão no fim e preservam ordem.
    if (finalFindings.length > maxResults) {
      finalFindings = finalFindings.slice(0, maxResults);
    }

    return {
      subject: baseSubject,
      queries: planShape.queries.map((q) => q.q),
      findings: finalFindings,
      createdAt: new Date().toISOString(),
      rounds: round,
      stopReason,
    };
  }

  return { plan };
}
