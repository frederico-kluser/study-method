/**
 * app/electron/main/engine/research/surfEnvelope.ts — O ENVELOPE `--json` DO
 * SURF, tipado a partir de uma execução REAL, e a tradução dele para o formato
 * de fonte que o app JÁ tem.
 *
 * O QUE ESTE ARQUIVO FAZ
 *   1. Declara o formato do envelope que `surf-search-normal --json` /
 *      `surf-search-unlimit --json` escrevem em stdout.
 *   2. `parseEnvelopeDoSurf` — transforma stdout em envelope, FALHANDO FECHADO
 *      quando o texto não é o envelope (nunca devolve um objeto meio-vazio).
 *   3. `fontesDoEnvelope` — mapeia o envelope para `TrackSourceLink[]`, o tipo
 *      que a aula já carrega em `content/trackTypes.ts:217-221` e que a UI já
 *      exibe no botão "Fontes".
 *
 * O QUE ELE NÃO FAZ: não roda processo (isso é `surfRunner.ts`), não decide se
 * a colheita presta (isso é `qualityGate.ts`), não inventa campo nenhum.
 *
 * ─── MEDIDO, NÃO SUPOSTO ────────────────────────────────────────────────────
 * O comando que produziu a evidência (1 execução real, 2026-09-05):
 *
 *   surf-search-normal "what does Python's built-in print() function return" \
 *     --task "…" --goal "…" --insights "…" --deliverable "…" \
 *     --sub-agents=5 --json    →  exit 0, 5 queries, 21 fontes, 3481 ms
 *
 * Chaves de topo observadas, nesta ordem: `operation, mode, answer,
 * synthesized, rounds, waves, frontier, stop_reason, plan, analysis, sources,
 * ledger, diagnostics, elapsed_ms`.
 *
 * A DESCOBERTA QUE MUDA O DESENHO: **um item de `sources[]` tem exatamente
 * quatro campos — `n`, `url`, `title`, `date`. NÃO tem descrição nem trecho.**
 * Medido:
 *
 *   {"n":1,"url":"https://www.geeksforgeeks.org/python/difference-between-return-and-print-in-python",
 *    "title":"Difference between return and print in Python - GeeksforGeeks",
 *    "date":"2025-07-23T15:58:43"}
 *
 * O trecho de texto vive UM nível abaixo, em `ledger.rows[].results[].content`
 * (campos medidos do result: `n, url, title, date, content` — `score` aparece
 * na fonte do surf, `ledger.mjs:125`, mas veio ausente/`undefined` na Brave).
 * Como `TrackSourceLink` exige `description`, esta camada faz o JOIN por URL:
 * `sources[n]` dá a identidade citável, `ledger` dá o trecho. Sem esse join a
 * descrição seria inventada — e inventar é proibido.
 *
 * A SEGUNDA DESCOBERTA: a execução real veio com
 * `diagnostics.degraded = [{stage:'plan',…auth},{stage:'synthesize',…}]` e
 * `synthesized:false`, porque a chave de LLM do PRÓPRIO surf não está
 * configurada nesta máquina. Mesmo assim: exit 0 e 21 fontes. Isto é a
 * confirmação empírica da divisão de trabalho desta camada — **o surf colhe
 * EVIDÊNCIA com procedência; quem sintetiza é o GLM 5.3 Flash da engine, pelo
 * transporte único `runtime/callLlm.ts`.** A prosa de `answer` do surf é, por
 * contrato, descartável aqui: em modo degradado ela é um "evidence brief"
 * heurístico. `synthesized` e `degraded` viajam no resultado desta camada em
 * vez de serem escondidos (limitação declarada, nunca silenciosa).
 *
 * URL SEM HOST NÃO É FONTE: o surf já recusa numerar uma URL sem esquema+host
 * (`ledger.mjs:158-176`, entrada com `n === null`, filtrada fora de
 * `sourcesList()`). Este módulo NÃO confia nisso de graça — revalida com
 * `URL()` antes de emitir um `TrackSourceLink`, porque quem consome o resultado
 * é a aula do aluno.
 */

import { PESQUISA_CODES, PesquisaError } from './errors';
import type {
  SurfDiagnostics,
  SurfEnvelope,
  SurfLedger,
  SurfLedgerRow,
  SurfLedgerResult,
  SurfLedgerStats,
  SurfPlan,
  SurfSource,
} from './surfEnvelopeTipos';

// Os tipos e a tradução envelope → fontes vivem em `surfEnvelopeTipos.ts` e
// `surfEnvelopeFontes.ts` (refatoração L05) — re-exportados pelos MESMOS
// nomes de antes.
export type {
  SurfDiagnostics,
  SurfEnvelope,
  SurfLedger,
  SurfLedgerResult,
  SurfLedgerRow,
  SurfLedgerStats,
  SurfPlan,
  SurfPlanQuery,
  SurfSource,
} from './surfEnvelopeTipos';
export { TETO_DESCRICAO, fontesDoEnvelope, queriesExecutadas, trechosPorUrl, urlCitavel } from './surfEnvelopeFontes';
export type { FonteComProcedencia } from './surfEnvelopeFontes';

// ─── parsing FAIL-CLOSED ─────────────────────────────────────────────────────

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function texto(v: unknown, padrao = ''): string {
  return typeof v === 'string' ? v : padrao;
}

function inteiro(v: unknown, padrao = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : padrao;
}

/**
 * stdout → envelope. FALHA FECHADA: texto que não é JSON, JSON que não é
 * objeto, e objeto sem `ledger.rows`/`sources` viram `PesquisaError`
 * ENVELOPE_INVALIDO. Nunca devolve um envelope "mais ou menos".
 *
 * O que ele TOLERA de propósito: campos opcionais ausentes (`score`,
 * `provider`, `answer`) e `analysis: null` — os dois foram medidos assim numa
 * execução bem-sucedida. Tolerar o que a ferramenta realmente emite não é
 * afrouxar asserção; exigir um campo que ela não emite seria reprovar execução
 * boa.
 */
/** O stdout já parseado e validado como objeto de envelope. */
function lerJsonDeStdout(stdout: string): unknown {
  const bruto = (stdout ?? '').trim();
  if (bruto === '') {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'o surf não escreveu nada em stdout — sem envelope não há procedência, e sem procedência não há material',
    });
  }
  try {
    return JSON.parse(bruto);
  } catch (e) {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'o stdout do surf não é JSON — o comando foi montado sem --json, ou a saída veio misturada com log',
      details: { primeiros120: bruto.slice(0, 120) },
      cause: e,
    });
  }
}

/** O objeto de envelope, com `ledger.rows` e `sources` OBRIGATÓRIOS (fail-closed). */
function validarEstruturaDoEnvelope(cru0: unknown): Record<string, unknown> {
  if (!ehObjeto(cru0)) {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'o JSON do surf não é um objeto de envelope',
      details: { tipo: Array.isArray(cru0) ? 'array' : typeof cru0 },
    });
  }
  const cru = cru0;
  const ledgerCru = cru['ledger'];
  if (!ehObjeto(ledgerCru) || !Array.isArray(ledgerCru['rows'])) {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'envelope sem `ledger.rows` — é o ledger que prova de qual query cada fonte veio',
      details: { chaves: Object.keys(cru).slice(0, 20) },
    });
  }
  if (!Array.isArray(cru['sources'])) {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'envelope sem `sources` — a lista de fontes citáveis é obrigatória',
      details: { chaves: Object.keys(cru).slice(0, 20) },
    });
  }
  return cru;
}

export function parseEnvelopeDoSurf(stdout: string): SurfEnvelope {
  const cru = validarEstruturaDoEnvelope(lerJsonDeStdout(stdout));
  const ledgerCru = cru['ledger'] as Record<string, unknown>;
  const diagCru = ehObjeto(cru['diagnostics']) ? cru['diagnostics'] : {};

  return {
    operation: texto(cru['operation']),
    mode: texto(cru['mode']),
    answer: texto(cru['answer']),
    synthesized: cru['synthesized'] === true,
    rounds: inteiro(cru['rounds']),
    waves: inteiro(cru['waves'], inteiro(cru['rounds'])),
    stop_reason: texto(cru['stop_reason']),
    plan: montarPlano(cru['plan']),
    analysis: cru['analysis'] ?? null,
    sources: (cru['sources'] as unknown[]).filter(ehObjeto).map(montarFonte),
    ledger: montarLedger(ledgerCru),
    diagnostics: montarDiagnostics(diagCru),
    elapsed_ms: inteiro(cru['elapsed_ms']),
  };
}

/** Uma `SurfSource` a partir do item cru (date string ou null). */
function montarFonte(s: Record<string, unknown>): SurfSource {
  return {
    n: inteiro(s['n']),
    url: texto(s['url']),
    title: texto(s['title']),
    date: typeof s['date'] === 'string' ? s['date'] : null,
  };
}

/** O `plan` do envelope (tolerante a campo ausente — medido em execução real). */
function montarPlano(planCru0: unknown): SurfPlan {
  const planCru = ehObjeto(planCru0) ? planCru0 : {};
  return {
    restated_objective: texto(planCru['restated_objective']),
    sub_questions: (Array.isArray(planCru['sub_questions']) ? planCru['sub_questions'] : [])
      .filter(ehObjeto)
      .map((s, i) => ({
        id: texto(s['id'], `sq${i + 1}`),
        question: texto(s['question']),
        why: texto(s['why']),
      })),
    success_criteria: (Array.isArray(planCru['success_criteria']) ? planCru['success_criteria'] : []).filter(
      (x): x is string => typeof x === 'string',
    ),
    queries: (Array.isArray(planCru['queries']) ? planCru['queries'] : [])
      .filter(ehObjeto)
      .map((q, i) => ({
        id: texto(q['id'], `q${i + 1}`),
        q: texto(q['q']),
        sub: texto(q['sub']),
        category: typeof q['category'] === 'string' ? q['category'] : null,
        priority: inteiro(q['priority'], 0),
      })),
  };
}

/** O `ledger` do envelope — stats, sources e rows (a row traz o trecho). */
function montarLedger(ledgerCru: Record<string, unknown>): SurfLedger {
  return {
    stats: normalizarStats(ledgerCru['stats']),
    sources: (Array.isArray(ledgerCru['sources']) ? ledgerCru['sources'] : []).filter(ehObjeto).map(montarFonte),
    rows: (ledgerCru['rows'] as unknown[]).filter(ehObjeto).map(normalizarRow),
  };
}

/** Os `diagnostics` — as degradações DECLARAM-se, nunca escondidas. */
function montarDiagnostics(diagCru: Record<string, unknown>): SurfDiagnostics {
  const degradedCru = Array.isArray(diagCru['degraded']) ? diagCru['degraded'] : [];
  return {
    ...(typeof diagCru['mode'] === 'string' ? { mode: diagCru['mode'] } : {}),
    ...(typeof diagCru['harness'] === 'string' ? { harness: diagCru['harness'] } : {}),
    ...(typeof diagCru['subAgents'] === 'number' ? { subAgents: diagCru['subAgents'] } : {}),
    ...(typeof diagCru['maxDepth'] === 'number' ? { maxDepth: diagCru['maxDepth'] } : {}),
    ...(Array.isArray(diagCru['models'])
      ? { models: diagCru['models'].filter((m): m is string => typeof m === 'string') }
      : {}),
    degraded: degradedCru.filter(ehObjeto).map((d) => ({
      stage: texto(d['stage'], 'desconhecida'),
      reason: texto(d['reason'], 'sem motivo declarado'),
    })),
  };
}

function normalizarStats(v: unknown): SurfLedgerStats {
  const s = ehObjeto(v) ? v : {};
  return {
    queries: inteiro(s['queries']),
    succeeded: inteiro(s['succeeded']),
    failed: inteiro(s['failed']),
    sources: inteiro(s['sources']),
    credits: inteiro(s['credits']),
  };
}

/** Os campos OPCIONAIS da row, só quando presentes (medidos assim na Brave). */
function opcionaisDeRow(r: Record<string, unknown>): Partial<SurfLedgerRow> {
  const erroCru = ehObjeto(r['error']) ? r['error'] : null;
  return {
    ...(typeof r['provider'] === 'string' ? { provider: r['provider'] } : {}),
    ...(typeof r['latency_ms'] === 'number' ? { latency_ms: r['latency_ms'] } : {}),
    ...(typeof r['credits'] === 'number' ? { credits: r['credits'] } : {}),
    ...(typeof r['answer'] === 'string' ? { answer: r['answer'] } : {}),
    ...(erroCru
      ? { error: { code: texto(erroCru['code'], 'Error'), message: texto(erroCru['message']) } }
      : {}),
  };
}

/** Os `results` da row — é aqui que mora o trecho (`content`). */
function resultsDeRow(r: Record<string, unknown>): SurfLedgerResult[] {
  return (Array.isArray(r['results']) ? r['results'] : []).filter(ehObjeto).map((x) => ({
    n: typeof x['n'] === 'number' ? x['n'] : null,
    url: texto(x['url']),
    title: texto(x['title']),
    date: typeof x['date'] === 'string' ? x['date'] : null,
    ...(typeof x['score'] === 'number' ? { score: x['score'] } : {}),
    content: texto(x['content']),
  }));
}

function normalizarRow(r: Record<string, unknown>): SurfLedgerRow {
  return {
    round: inteiro(r['round']),
    id: texto(r['id']),
    sub: typeof r['sub'] === 'string' ? r['sub'] : null,
    category: typeof r['category'] === 'string' ? r['category'] : null,
    parent: typeof r['parent'] === 'string' ? r['parent'] : null,
    depth: inteiro(r['depth']),
    kind: texto(r['kind'], 'breadth'),
    query: texto(r['query']),
    ok: r['ok'] === true,
    ...opcionaisDeRow(r),
    results: resultsDeRow(r),
  };
}

