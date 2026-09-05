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

import type { TrackSourceLink } from '../../content/trackTypes';
import { PESQUISA_CODES, PesquisaError } from './errors';

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
 * URL citável: esquema http/https E hostname. Mesma régua do
 * `eReferenciaURL` de F1 e do `isCitableUrl` do surf — repetida aqui porque
 * este módulo não pode importar de `phases/**` (dono diferente) e porque a
 * checagem é a última linha antes da aula do aluno.
 */
export function urlCitavel(valor: unknown): boolean {
  if (typeof valor !== 'string' || valor.trim() === '') return false;
  let u: URL;
  try {
    u = new URL(valor.trim());
  } catch {
    return false;
  }
  return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
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
export function parseEnvelopeDoSurf(stdout: string): SurfEnvelope {
  const bruto = (stdout ?? '').trim();
  if (bruto === '') {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'o surf não escreveu nada em stdout — sem envelope não há procedência, e sem procedência não há material',
    });
  }
  let cru: unknown;
  try {
    cru = JSON.parse(bruto);
  } catch (e) {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'o stdout do surf não é JSON — o comando foi montado sem --json, ou a saída veio misturada com log',
      details: { primeiros120: bruto.slice(0, 120) },
      cause: e,
    });
  }
  if (!ehObjeto(cru)) {
    throw new PesquisaError({
      code: PESQUISA_CODES.ENVELOPE_INVALIDO,
      message: 'o JSON do surf não é um objeto de envelope',
      details: { tipo: Array.isArray(cru) ? 'array' : typeof cru },
    });
  }
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

  const diagCru = ehObjeto(cru['diagnostics']) ? cru['diagnostics'] : {};
  const degradedCru = Array.isArray(diagCru['degraded']) ? diagCru['degraded'] : [];
  const planCru = ehObjeto(cru['plan']) ? cru['plan'] : {};

  return {
    operation: texto(cru['operation']),
    mode: texto(cru['mode']),
    answer: texto(cru['answer']),
    synthesized: cru['synthesized'] === true,
    rounds: inteiro(cru['rounds']),
    waves: inteiro(cru['waves'], inteiro(cru['rounds'])),
    stop_reason: texto(cru['stop_reason']),
    plan: {
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
    },
    analysis: cru['analysis'] ?? null,
    sources: (cru['sources'] as unknown[]).filter(ehObjeto).map((s) => ({
      n: inteiro(s['n']),
      url: texto(s['url']),
      title: texto(s['title']),
      date: typeof s['date'] === 'string' ? s['date'] : null,
    })),
    ledger: {
      stats: normalizarStats(ledgerCru['stats']),
      sources: (Array.isArray(ledgerCru['sources']) ? ledgerCru['sources'] : []).filter(ehObjeto).map((s) => ({
        n: inteiro(s['n']),
        url: texto(s['url']),
        title: texto(s['title']),
        date: typeof s['date'] === 'string' ? s['date'] : null,
      })),
      rows: (ledgerCru['rows'] as unknown[]).filter(ehObjeto).map(normalizarRow),
    },
    diagnostics: {
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
    },
    elapsed_ms: inteiro(cru['elapsed_ms']),
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

function normalizarRow(r: Record<string, unknown>): SurfLedgerRow {
  const erroCru = ehObjeto(r['error']) ? r['error'] : null;
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
    ...(typeof r['provider'] === 'string' ? { provider: r['provider'] } : {}),
    ...(typeof r['latency_ms'] === 'number' ? { latency_ms: r['latency_ms'] } : {}),
    ...(typeof r['credits'] === 'number' ? { credits: r['credits'] } : {}),
    ...(typeof r['answer'] === 'string' ? { answer: r['answer'] } : {}),
    ...(erroCru
      ? { error: { code: texto(erroCru['code'], 'Error'), message: texto(erroCru['message']) } }
      : {}),
    results: (Array.isArray(r['results']) ? r['results'] : []).filter(ehObjeto).map((x) => ({
      n: typeof x['n'] === 'number' ? x['n'] : null,
      url: texto(x['url']),
      title: texto(x['title']),
      date: typeof x['date'] === 'string' ? x['date'] : null,
      ...(typeof x['score'] === 'number' ? { score: x['score'] } : {}),
      content: texto(x['content']),
    })),
  };
}

// ─── envelope → TrackSourceLink (o formato que o app JÁ tem) ─────────────────

/** Teto de caracteres da descrição de uma fonte (o trecho da Brave é curto). */
export const TETO_DESCRICAO = 500;

/**
 * Índice URL → melhor trecho disponível no ledger. "Melhor" = o mais longo
 * entre os resultados que apontam para a MESMA url: o mesmo domínio aparece em
 * várias queries e os trechos variam de tamanho; o mais longo é o que carrega
 * mais evidência. Determinístico (empate resolvido pelo primeiro visto).
 */
export function trechosPorUrl(envelope: SurfEnvelope): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const row of envelope.ledger.rows) {
    for (const r of row.results) {
      const trecho = (r.content ?? '').trim();
      if (!r.url || trecho === '') continue;
      const atual = mapa.get(r.url);
      if (atual === undefined || trecho.length > atual.length) mapa.set(r.url, trecho);
    }
  }
  return mapa;
}

/** Uma fonte pronta para a aula, com de onde veio e por que query. */
export interface FonteComProcedencia {
  /** o que vai para `TrackLessonSource.sources` sem tradução nenhuma. */
  link: TrackSourceLink;
  /** número de citação `[n]` do surf — a ponte entre afirmação e fonte. */
  citacao: number;
  /** ids das linhas do ledger que trouxeram esta URL (auditoria). */
  queries: string[];
  /** data de publicação relatada pelo provedor (pode ser null). */
  publicadaEm: string | null;
}

/**
 * Mapeia o envelope para fontes com procedência. REGRAS, todas fail-closed:
 *   - URL não citável (sem esquema/host) → DESCARTADA e registrada em
 *     `rejeitadas`, nunca emitida;
 *   - título vazio → a URL vira o título (é o que o próprio surf faz em
 *     `ledger.mjs:123`, `title: r.title || url`), porque `TrackSourceLink`
 *     exige título não-vazio (`trackTypes.ts:583` reprova sem ele);
 *   - descrição = trecho do ledger, truncado em `TETO_DESCRICAO`. SEM trecho a
 *     descrição fica VAZIA — nunca preenchida com prosa inventada.
 */
export function fontesDoEnvelope(envelope: SurfEnvelope): {
  fontes: FonteComProcedencia[];
  rejeitadas: { url: string; motivo: string }[];
} {
  const trechos = trechosPorUrl(envelope);
  const queriesPorUrl = new Map<string, string[]>();
  for (const row of envelope.ledger.rows) {
    for (const r of row.results) {
      if (!r.url) continue;
      const lista = queriesPorUrl.get(r.url) ?? [];
      if (!lista.includes(row.id)) lista.push(row.id);
      queriesPorUrl.set(r.url, lista);
    }
  }

  const fontes: FonteComProcedencia[] = [];
  const rejeitadas: { url: string; motivo: string }[] = [];
  const vistas = new Set<string>();

  for (const s of envelope.sources) {
    if (!urlCitavel(s.url)) {
      rejeitadas.push({ url: s.url, motivo: 'url sem esquema http(s) ou sem host — não é citável' });
      continue;
    }
    if (vistas.has(s.url)) continue;
    vistas.add(s.url);
    const trecho = (trechos.get(s.url) ?? '').trim();
    fontes.push({
      link: {
        title: s.title.trim() === '' ? s.url : s.title.trim(),
        url: s.url,
        description: trecho.length > TETO_DESCRICAO ? `${trecho.slice(0, TETO_DESCRICAO - 1)}…` : trecho,
      },
      citacao: s.n,
      queries: queriesPorUrl.get(s.url) ?? [],
      publicadaEm: s.date,
    });
  }
  return { fontes, rejeitadas };
}

/** As queries que o envelope REALMENTE executou (base do anti-repetição). */
export function queriesExecutadas(envelope: SurfEnvelope): string[] {
  return envelope.ledger.rows.map((r) => r.query).filter((q) => q.trim() !== '');
}
