/**
 * src/lib/researchProgress.ts — máquina de estado PURA do checklist de pesquisa
 * ao vivo (onda3-pesquisa-checklist-ui, surf-research style).
 *
 * O canal `study:research-progress` (aditivo ao contrato congelado — NÃO toca
 * em `study:lesson-progress`) entrega eventos `ResearchProgressEvent` durante
 * `study:generateLesson`. Este módulo reduz qualquer sequência desses eventos a
 * um estado tipado para a UI (checklist agrupado por sub-pergunta), tolerando:
 *
 *   - payloads malformados / kinds desconhecidos (ignorados — defensivo);
 *   - eventos fora de ordem (query-done sem query-start é aceito);
 *   - o modo E2E, onde NENHUM evento chega ao renderer (emit do stub é no-op):
 *     a máquina só fecha em `research:done` OU quando o chamador sinaliza
 *     `markResearchResolved()`/`markResearchErrored()` no resolve/rejeição da
 *     generateLesson — SEM essa regra o spinner de geração travaria.
 *
 * REGRA DE TÉRMINO: `terminal` é cola. Depois de terminal, `applyResearchEvent`
 * ignora eventos novos (estado congelado = contagem final). `research:done` COM
 * `errorKind` de chave fecha como 'errored' (interrompido) — não 'done'.
 * Retrocompat: se
 * `research:plan` nunca chegou (backend antigo/stub sem o canal novo), o
 * checklist fica invisível (`hasResearchPlan` false) e a barra de fases atual
 * permanece soberana.
 *
 * Tudo aqui é puro e testável com node:test (sem DOM, sem i18n em runtime — as
 * chaves de erro são DEVOLVIDAS como path i18n para a view traduzir).
 */
import type { ResearchProgressEvent } from '../../shared/ipc-contract';

/** Status de UMA query no checklist. */
export type ResearchQueryStatus = 'pending' | 'running' | 'done' | 'failed';

/** Estado observável de uma query planejada/executada. */
export interface ResearchQueryState {
  id: string;
  q: string;
  /** id da sub-pergunta à qual a query pertence ('' quando desconhecido). */
  sub: string;
  category: string | null;
  status: ResearchQueryStatus;
  provider?: string;
  /** nº de resultados devolvidos pela API para esta query (research:query-done). */
  hits?: number;
  latencyMs?: number;
  /** código de erro estruturado da query (BRAVE_*); presente quando status='failed'. */
  errorCode?: string;
  errorMessage?: string;
}

/** Sub-pergunta do plano de pesquisa (título de seção do checklist). */
export interface ResearchSubQuestionState {
  id: string;
  question: string;
}

export type ResearchTerminalKind = 'done' | 'resolved' | 'errored';

/**
 * Estado completo do checklist de pesquisa ao vivo. Imutável por convenção:
 * `applyResearchEvent`/`markResearchResolved`/`markResearchErrored` devolvem
 * um NOVO estado (novo Map de queries) — o chamador usa setState com o retorno.
 */
export interface ResearchChecklistState {
  /** true quando `research:plan` chegou → checklist visível. */
  planned: boolean;
  subQuestions: ResearchSubQuestionState[];
  queries: Map<string, ResearchQueryState>;
  currentRound: number | null;
  totalRounds: number | null;
  /**
   * Contadores ACUMULADOS por soma de deltas: o emissor (researchPlanner)
   * manda em `research:round-done` apenas os valores DA RODADA (ok/failed
   * desta rodada; uniqueSources = URLs NOVAS desta rodada) — esta máquina
   * soma cada evento ao acumulado. Em `research:done`, `sources` (total de
   * fontes únicas do emissor, autoritativo) substitui o acumulado de
   * uniqueSources.
   */
  ok: number;
  failed: number;
  uniqueSources: number;
  /** true quando a máquina fechou (research:done | mark*). Cola. */
  terminal: boolean;
  terminalKind: ResearchTerminalKind | null;
  /** research:done — fontes coletadas (totais finais para o resumo). */
  sources?: number;
  rounds?: number;
  stopReason?: string;
  /** research:done — aborto por chave Brave ausente/inválida. */
  errorKind?: 'brave-missing' | 'brave-key-invalid';
}

/** Códigos de erro estruturados conhecidos por query (braveSearchService). */
export const RESEARCH_ERROR_CODES = [
  'BRAVE_KEY_MISSING',
  'BRAVE_KEY_INVALID',
  'BRAVE_RATE_LIMIT',
  'BRAVE_SERVER_ERROR',
] as const;

export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number];

/** Um grupo do checklist: uma sub-pergunta + as queries dela (ordem do plano). */
export interface ResearchChecklistGroup {
  subQuestionId: string;
  question: string;
  queries: ResearchQueryState[];
}

/** Contadores derivados para o header da UI (dumb view, lógica testável aqui). */
export interface ResearchCounters {
  /** queries em status final (done|failed). */
  concluded: number;
  total: number;
  running: number;
  ok: number;
  failed: number;
  uniqueSources: number;
  currentRound: number | null;
  totalRounds: number | null;
}

/** Estado inicial: nada planejado, nada executado, aberta. */
export function createResearchChecklist(): ResearchChecklistState {
  return {
    planned: false,
    subQuestions: [],
    queries: new Map(),
    currentRound: null,
    totalRounds: null,
    ok: 0,
    failed: 0,
    uniqueSources: 0,
    terminal: false,
    terminalKind: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** true quando um valor parece o kind `research:*` (defensivo: o payload vem
 *  `unknown` do bridge e o discriminador pode vir em posição inesperada). */
function kindOf(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.kind === 'string' ? raw.kind : undefined;
}

function toSubQuestions(raw: unknown): ResearchSubQuestionState[] {
  if (!Array.isArray(raw)) return [];
  const out: ResearchSubQuestionState[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const question = asString(item.question);
    if (id && question) out.push({ id, question });
  }
  return out;
}

function toQuerySpecs(raw: unknown): Array<{ id: string; q: string; sub: string; category: string | null }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; q: string; sub: string; category: string | null }> = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const q = asString(item.q);
    if (!id || !q) continue;
    out.push({
      id,
      q,
      sub: asString(item.sub) ?? '',
      category: asString(item.category) ?? null,
    });
  }
  return out;
}

/**
 * Aplica UM evento de `research-progress` ao estado e devolve o novo estado.
 * Defensivo: payload não-objeto, kind desconhecido ou estado já terminal →
 * devolve o MESMO estado (nenhuma mudança; React pode pular o re-render).
 */
export function applyResearchEvent(
  state: ResearchChecklistState,
  event: unknown,
): ResearchChecklistState {
  const kind = kindOf(event);
  if (!kind || state.terminal || !isRecord(event)) return state;

  switch (kind) {
    case 'research:plan': {
      const subQuestions = toSubQuestions(event.subQuestions);
      const specs = toQuerySpecs(event.queries);
      const queries = new Map<string, ResearchQueryState>();
      for (const spec of specs) {
        queries.set(spec.id, { ...spec, status: 'pending' });
      }
      const totalRounds = asNumber(event.maxRounds) ?? null;
      return {
        ...state,
        planned: true,
        subQuestions,
        queries,
        totalRounds,
        currentRound: null,
        terminal: false,
        terminalKind: null,
      };
    }
    case 'research:round-start': {
      const round = asNumber(event.round);
      const total = asNumber(event.totalRounds);
      return {
        ...state,
        currentRound: round ?? state.currentRound,
        totalRounds: total ?? state.totalRounds,
      };
    }
    case 'research:query-start': {
      const id = asString(event.queryId);
      if (!id) return state;
      const q = asString(event.q) ?? '';
      const existing = state.queries.get(id);
      // Defensivo: query-start sem plan prévio cria a query órfã (sub '') em
      // vez de quebrar o checklist — o agrupamento a coloca em grupo implícito.
      const next: ResearchQueryState = existing
        ? { ...existing, status: 'running' }
        : { id, q, sub: '', category: null, status: 'running' };
      const queries = new Map(state.queries);
      queries.set(id, next);
      return { ...state, queries };
    }
    case 'research:query-done': {
      const id = asString(event.queryId);
      if (!id) return state;
      const existing = state.queries.get(id);
      if (!existing) return state; // query desconhecida (sem plan/start) → ignora.
      const ok = event.ok === true;
      const error = isRecord(event.error) ? event.error : undefined;
      const next: ResearchQueryState = {
        ...existing,
        q: asString(event.q) ?? existing.q,
        status: ok ? 'done' : 'failed',
        provider: asString(event.provider) ?? existing.provider,
        hits: asNumber(event.hits) ?? existing.hits,
        latencyMs: asNumber(event.latencyMs) ?? existing.latencyMs,
        errorCode: ok ? undefined : (asString(error?.code) ?? existing.errorCode),
        errorMessage: ok ? undefined : (asString(error?.message) ?? existing.errorMessage),
      };
      const queries = new Map(state.queries);
      queries.set(id, next);
      return { ...state, queries };
    }
    case 'research:round-done': {
      // O emissor (researchPlanner) emite DELTAS da rodada (ok = queries ok
      // desta rodada; failed = erros desta rodada; uniqueSources = URLs NOVAS
      // desta rodada) — SOMA ao acumulado. Campo ausente/não-numérico soma 0
      // (defensivo; nunca regride o contador).
      return {
        ...state,
        ok: state.ok + (asNumber(event.ok) ?? 0),
        failed: state.failed + (asNumber(event.failed) ?? 0),
        uniqueSources: state.uniqueSources + (asNumber(event.uniqueSources) ?? 0),
      };
    }
    case 'research:done': {
      const errorKind = event.errorKind;
      const isKeyAbort = errorKind === 'brave-missing' || errorKind === 'brave-key-invalid';
      // done.sources é o TOTAL de fontes únicas do emissor (seenUrls.size —
      // autoritativo): substitui o acumulado. Ausente mantém o acumulado;
      // 0 é 0 (aborto de chave antes de qualquer fonte).
      const sources = asNumber(event.sources);
      return {
        ...state,
        terminal: true,
        // done COM errorKind de chave → aborto: terminal 'errored' (a view
        // mostra "Pesquisa interrompida" + mensagem da chave); SEM errorKind
        // → 'done' feliz (resumo com os contadores finais).
        terminalKind: isKeyAbort ? 'errored' : 'done',
        sources: sources ?? state.sources,
        uniqueSources: sources ?? state.uniqueSources,
        rounds: asNumber(event.rounds) ?? state.rounds,
        stopReason: asString(event.stopReason) ?? state.stopReason,
        errorKind: isKeyAbort ? errorKind : state.errorKind,
      };
    }
    default:
      return state;
  }
}

/** Fecha a máquina como RESOLVIDA (a view chama no resolve da generateLesson).
 *  Idempotente: se já terminal, devolve o mesmo estado. */
export function markResearchResolved(state: ResearchChecklistState): ResearchChecklistState {
  if (state.terminal) return state;
  return { ...state, terminal: true, terminalKind: 'resolved' };
}

/** Fecha a máquina como ERRORED (a view chama na rejeição da generateLesson).
 *  Idempotente: se já terminal, devolve o mesmo estado. */
export function markResearchErrored(state: ResearchChecklistState): ResearchChecklistState {
  if (state.terminal) return state;
  return { ...state, terminal: true, terminalKind: 'errored' };
}

/** true quando a máquina fechou (research:done | markResolved | markErrored). */
export function isResearchTerminal(state: ResearchChecklistState): boolean {
  return state.terminal;
}

/** true quando `research:plan` chegou → o checklist pode ser renderizado. */
export function hasResearchPlan(state: ResearchChecklistState): boolean {
  return state.planned;
}

/** Contadores derivados para o header do checklist (rodada · concluídas · fontes). */
export function getResearchCounters(state: ResearchChecklistState): ResearchCounters {
  let concluded = 0;
  let running = 0;
  for (const q of state.queries.values()) {
    if (q.status === 'done' || q.status === 'failed') concluded += 1;
    else if (q.status === 'running') running += 1;
  }
  return {
    concluded,
    total: state.queries.size,
    running,
    ok: state.ok,
    failed: state.failed,
    uniqueSources: state.uniqueSources,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
  };
}

/**
 * Checklist agrupado por sub-pergunta (ordem do plan). Queries órfãs (sub não
 * encontrado — plan parcial/ausente) vão para um grupo implícito final com
 * question ''. Sem plan → [] (checklist invisível, retrocompat).
 */
export function getResearchChecklist(state: ResearchChecklistState): ResearchChecklistGroup[] {
  if (!state.planned) return [];
  const groups: ResearchChecklistGroup[] = state.subQuestions.map((sq) => ({
    subQuestionId: sq.id,
    question: sq.question,
    queries: [],
  }));
  const orphan: ResearchQueryState[] = [];
  for (const q of state.queries.values()) {
    const group = groups.find((g) => g.subQuestionId === q.sub);
    if (group) group.queries.push(q);
    else orphan.push(q);
  }
  if (orphan.length > 0) {
    groups.push({ subQuestionId: '', question: '', queries: orphan });
  }
  return groups;
}

/**
 * i18n-key de erro de UMA query (query-done ok:false) a partir do código.
 * Codes conhecidos → `translation:lesson.research.errorCodes.<CODE>`; código
 * ausente/desconhecido → `translation:lesson.research.queryFailed` (genérico).
 */
export function researchErrorKey(code?: string): string {
  if (code && (RESEARCH_ERROR_CODES as readonly string[]).includes(code)) {
    return `translation:lesson.research.errorCodes.${code}`;
  }
  return 'translation:lesson.research.queryFailed';
}

/**
 * i18n-key da mensagem de ERRO DE FASE (lesson-progress phase:'error' com
 * code) — as chaves claras "a chave Brave é obrigatória". Só cobre os códigos
 * de aborto de chave; qualquer outro → null (a view mantém a mensagem crua).
 */
export function researchPhaseErrorKey(code?: string): string | null {
  if (code === 'BRAVE_KEY_MISSING' || code === 'BRAVE_KEY_INVALID') {
    return `translation:lesson.research.phaseError.${code}`;
  }
  return null;
}

/**
 * i18n-key da mensagem de ABORTO da pesquisa (`research:done` com errorKind)
 * a partir do errorKind kebab-case do contrato — delega a researchPhaseErrorKey
 * com o code snake_case equivalente. errorKind desconhecido/ausente → null (a
 * view mostra só o "Pesquisa interrompida").
 */
export function researchErrorKindKey(errorKind?: string): string | null {
  if (errorKind === 'brave-missing') return researchPhaseErrorKey('BRAVE_KEY_MISSING');
  if (errorKind === 'brave-key-invalid') return researchPhaseErrorKey('BRAVE_KEY_INVALID');
  return null;
}
