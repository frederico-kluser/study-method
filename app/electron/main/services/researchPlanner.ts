/**
 * electron/main/services/researchPlanner.ts — planejador de pesquisa para o tutor,
 * estilo surf-research-agent-skill: dado um ASSUNTO, planeja N dúvidas fechadas,
 * converte em queries de busca e executa (via BraveSearchService.multiSearch)
 * retornando FINDINGS estruturados com fontes.
 *
 * A geração de dúvidas→queries é INJETÁVEL (`generateQueries`): a onda3-vai plugar
 * a geração por LLM. Sem injeção, cai para heurística determinística
 * (`defaultQueriesFor`). Tudo é função pura / DI — nada toca rede fora do
 * `search` injetado, então é 100% testável.
 */

import type { StudyFinding } from '@shared/ipc-contract';
import type { BraveSearchService, MultiSearchResult } from './braveSearchService';
import { sortByScoreDesc } from './braveSearchService';

/** Subtópicos fixos (pt-BR) usados pela heurística determinística. */
const DEFAULT_SUBTOPICS = [
  'conceito',
  'exemplos práticos',
  'como funciona',
  'erros comuns',
  'comparação',
  'exercícios',
] as const;

/** Comprimento máximo (chars) de uma query gerada; acima disso é filtrada. */
const MAX_QUERY_LENGTH = 120;

export interface ResearchPlannerDeps {
  /** Serviço de busca (Brave) que executa as queries. */
  search: Pick<BraveSearchService, 'multiSearch'>;
  /**
   * Gerador de queries a partir do assunto (dúvidas fechadas → queries de
   * busca). Default: heurística determinística. A onda3 pluga a geração por
   * LLM aqui. Deve retornar queries >= 1; vazias/longas demais são filtradas.
   */
  generateQueries?: (subject: string) => Promise<string[]>;
}

export interface PlanOptions {
  /** Máx. de resultados finais (após dedup). Default: 30. */
  maxResults?: number;
  concurrency?: number;
  delayMs?: number;
  count?: number;
}

export interface ResearchPlan {
  subject: string;
  queries: string[];
  findings: StudyFinding[];
  createdAt: string;
}

/**
 * Gera as queries pt-BR de forma DETERMINÍSTICA combinando o subject com os
 * subtópicos fixos. Filtra vazias/curtas demais e longas demais; deduplica e
 * limita a no máximo 6.
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
 * Factory do researchPlanner. `plan` monta as queries (injeta ou heurística),
 * executa via `search.multiSearch` e normaliza o resultado.
 */
export function createResearchPlanner(deps: ResearchPlannerDeps): {
  plan(subject: string, opts?: PlanOptions): Promise<ResearchPlan>;
} {
  const doGenerate =
    deps.generateQueries ??
    (async (subject: string): Promise<string[]> => defaultQueriesFor(subject));

  async function plan(subject: string, opts: PlanOptions = {}): Promise<ResearchPlan> {
    const baseSubject = subject.trim();
    if (!baseSubject) {
      throw new Error('Assunto de pesquisa vazio.');
    }
    const maxResults = Math.max(1, opts.maxResults ?? 30);

    const generated = await doGenerate(baseSubject);
    const queries = generated
      .map((q) => q)
      .filter((q) => q && q.trim())
      .filter((q) => q.length <= MAX_QUERY_LENGTH)
      .slice(0, 6);

    let multi: MultiSearchResult;
    if (queries.length === 0) {
      multi = { results: [], errors: [] };
    } else {
      multi = await deps.search.multiSearch(queries, {
        concurrency: opts.concurrency,
        delayMs: opts.delayMs,
        count: opts.count,
      });
    }

    // Dedup final + limite + ordenação por score desc quando presente.
    let findings = sortByScoreDesc(multi.results);
    // sortByScoreDesc é estável: itens sem score vão no fim e preservam ordem.
    if (findings.length > maxResults) {
      findings = findings.slice(0, maxResults);
    }

    return {
      subject: baseSubject,
      queries,
      findings,
      createdAt: new Date().toISOString(),
    };
  }

  return { plan };
}