/**
 * app/electron/main/engine/research/surfEnvelopeTipos.ts — os TIPOS do envelope
 * `--json` do surf (`surfEnvelope.ts`). Extraídos do módulo original na
 * refatoração do lote L05 (para que `surfEnvelopeFontes.ts` os use sem ciclo de
 * import) sem NENHUMA mudança de comportamento — a fachada `surfEnvelope.ts`
 * re-exporta tudo isto pelos MESMOS nomes.
 */

// ─── o envelope, campo a campo (o que a execução real trouxe) ────────────────

/** Uma fonte CITÁVEL do surf: identidade numerada, sem trecho. */
export interface SurfSource {
  /** número de citação `[n]`; `sourcesList()` só emite entradas com n != null. */
  n: number;
  url: string;
  title: string;
  /** data de publicação relatada pelo provedor; `null` quando não há. */
  date: string | null;
}

/** Um resultado DENTRO de uma linha do ledger — é aqui que mora o trecho. */
export interface SurfLedgerResult {
  n: number | null;
  url: string;
  title: string;
  date: string | null;
  /** `score` existe no código do surf; veio ausente na Brave (medido). */
  score?: number;
  /** o trecho devolvido pelo provedor — NUNCA o corpo da página. */
  content: string;
}

/** Uma linha do ledger = UMA query executada (sucesso OU falha; falha é linha também). */
export interface SurfLedgerRow {
  round: number;
  id: string;
  sub: string | null;
  category: string | null;
  parent: string | null;
  depth: number;
  kind: string;
  query: string;
  ok: boolean;
  provider?: string;
  latency_ms?: number;
  credits?: number;
  answer?: string | null;
  error?: { code: string; message: string };
  results: SurfLedgerResult[];
}

export interface SurfLedgerStats {
  queries: number;
  succeeded: number;
  failed: number;
  sources: number;
  credits: number;
}

export interface SurfLedger {
  stats: SurfLedgerStats;
  sources: SurfSource[];
  rows: SurfLedgerRow[];
}

export interface SurfPlanQuery {
  id: string;
  q: string;
  sub: string;
  category: string | null;
  priority: number;
}

export interface SurfPlan {
  restated_objective: string;
  sub_questions: { id: string; question: string; why: string }[];
  success_criteria: string[];
  queries: SurfPlanQuery[];
}

export interface SurfDiagnostics {
  mode?: string;
  harness?: string;
  subAgents?: number;
  maxRounds?: number;
  maxQueries?: number;
  maxDepth?: number;
  effective_parallelism?: number | null;
  models?: string[];
  llm_calls?: unknown[];
  /** etapas do surf que caíram para heurística — DECLARADAS, nunca escondidas. */
  degraded: { stage: string; reason: string }[];
  budget_ms?: number | null;
}

/** O envelope inteiro (`renderJson`, `src/lib/ai/render.mjs:186-203`). */
export interface SurfEnvelope {
  operation: string;
  mode: string;
  answer: string;
  /** false = a prosa de `answer` é o brief heurístico, não síntese de LLM. */
  synthesized: boolean;
  rounds: number;
  waves: number;
  stop_reason: string;
  plan: SurfPlan;
  analysis: unknown;
  sources: SurfSource[];
  ledger: SurfLedger;
  diagnostics: SurfDiagnostics;
  elapsed_ms: number;
}

