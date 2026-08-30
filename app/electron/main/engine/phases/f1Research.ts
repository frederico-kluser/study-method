/**
 * app/electron/main/engine/phases/f1Research.ts — pacote P-14, FASE F1 da engine
 * de trilhas: PESQUISA PROFUNDA PARALELA do assunto (⇉ largo, 1 arquivo por
 * agente, docs/16-engine-de-trilha.md §4.2).
 *
 * Contrato normativo:
 *   - §4.2 — F1 produz, ALÉM da prosa: (a) inventário de construções e APIs
 *     candidatas; (b) inventário de concepções alternativas (misconceptions)
 *     com âncora na especificação. E assume o risco NÃO mitigável a jusante:
 *     "pesquisa errada produz trilha errada e nenhuma fase posterior detecta —
 *     ponto único onde revisão humana é insubstituível" — a nota literal
 *     (A-P14-3) viaja DENTRO do artefato de saída.
 *   - §4.1 — tutela do paralelismo (chave multi-escritor exige reducer — aqui
 *     cada sub-pesquisa é um agente com posse exclusiva do próprio relatório),
 *     handoff por referência e INV-06: todo retorno de agente cabe em 2.000
 *     tokens; retorno acima do teto é REJEITADO, nunca truncado.
 *   - §9.3 — fail-closed: indisponibilidade produz erro estruturado, nunca
 *     veredito falso nem aprovação por omissão.
 *
 * Por que existe DEPOIS do researchPlanner (onda 0+): o planner existente é
 * dimensionado para UMA aula (plano único, ≤6 queries, 2 rodadas). Uma TRILHA
 * tem muitos sub-assuntos. O F1 paraleliza POR SUB-ASSUNTO:
 *   - UMA chamada de plano por sub-assunto (não paralelizar queries dentro de
 *     um assunto: o limitador da busca é 2 e o 429 cancela a rodada seguinte);
 *   - DECLARA concorrência, atraso entre lotes e atraso sob rate limit como
 *     PARÂMETROS OBRIGATÓRIOS do config (`F1Config`). O atraso sob rate limit
 *     NUNCA era passado hoje — isso torna o retry de 429 da Brave
 *     (`delayMsOnRateLimit`, RATE_LIMIT_MAX_RETRIES=1) código morto. Aqui ele é
 *     repassado à busca em TODA chamada (A-P14-3).
 *
 * Responsabilidades desta fase:
 *   - A-P14-1 — SEM chave de busca → a fase ABORTA com erro estruturado
 *     (F1Error), nunca degrada em silêncio, nunca usa busca keyless como
 *     default. O mesmo vale para KEY_INVALID e para o bug de prompt
 *     (BAD_REQUEST = defeito da etapa, erro nomeando a etapa).
 *   - A-P14-3 — 429 numa sub-pesquisa não derruba as outras: cada sub-pesquisa
 *     é isolada; a falha é REGISTRADA no relatório da sub-pesquisa e o run
 *     continua.
 *   - INV-06 — retorno de agente acima do teto é REJEITADO (função pura
 *     `rejeitarAcimaDoTeto`), nunca truncado.
 *   - G-COVER-PESQ — função PURA: todo subtópico tem ≥1 achado; todo achado tem
 *     id, URL e data de coleta.
 *   - Busca INJETADA (A-P14-2): a suíte usa um FAKE — roda offline, sem rede,
 *     sem chave, sem processo.
 *
 * Estrutura:
 *   - `criarF1Research({busca, config, agora?})` → a fase (`executar(entrada)`),
 *     com semáforo PRÓPRIO de sub-pesquisas (não é o SEM_LLM — o transporte
 *     tem o dele).
 *   - `criarBuscaPlanejada({llm, multi, ...})` → implementação de PRODUÇÃO da
 *     `Busca`: planejador LLM por sub-assunto via transporte único (callLlm,
 *     REUSANDO os helpers puros do researchPlanner — buildPlanPrompt,
 *     parseLlmJson, normalizePlanShape, heuristicPlanFor — sem reescrevê-los)
 *     + execução de queries repassando SEMPRE `delayMsOnRateLimit`.
 *
 * FAIL-CLOSED: configuração fora do contrato e entrada vazia são F1Error ANTES
 * de qualquer trabalho; nenhum parâmetro obrigatório tem default sorrateiro.
 */

import { DEEPSEEK_ERROR_CODES } from '../../services/deepseekClient';
import {
  buildPlanPrompt,
  heuristicPlanFor,
  normalizePlanShape,
  parseLlmJson,
} from '../../services/researchPlanner';
import type { ResearchPlanShape } from '../../services/researchPlanner';
import { LlmStageError } from '../runtime/callLlm';
import type { EngineLlm } from '../runtime/callLlm';
import { createSemaphore } from '../runtime/semaphore';

// ---------------------------------------------------------------------------
// A declaração obrigatória (A-P14-3) e a identidade do artefato
// ---------------------------------------------------------------------------

/**
 * Nota LITERAL exigida no artefato de saída (docs §4.2 / A-P14-3). O risco de
 * F1 é o único não mitigável a jusante: nenhuma fase posterior detecta pesquisa
 * errada — daí o portão humano de F6 e esta declaração viajar no artefato.
 */
export const DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA =
  'pesquisa errada produz trilha errada e nenhuma fase posterior detecta — ponto único onde revisão humana é insubstituível';

/** Identidade do schema do artefato F1 (o "schema" de `ArtefatoF1`). */
export const SCHEMA_F1 = 'f1-pesquisa' as const;

/** Teto de tokens do retorno de UM agente de sub-pesquisa (§4.1/§7: 2.000). */
export const TETO_PADRAO_TOKENS_POR_RETORNO = 2000;

/**
 * Estimativa DECLARADA de tokens de um texto (≈ 4 caracteres/token — heurística
 * de contagem, não um tokenizador; o contrato INV-06 é sobre o TETO do retorno
 * e a REJEIÇÃO, não sobre a exatidão da contagem).
 */
export function estimarTokens(texto: string): number {
  return Math.ceil((texto ?? '').length / 4);
}

/**
 * INV-06 (§4.1/§7): retorno acima do teto é REJEITADO (`true`), nunca truncado.
 * O chamador substitui o conteúdo por uma falha declarada — um prefixo do
 * conteúdo NUNCA é aceito como retorno.
 */
export function rejeitarAcimaDoTeto(texto: string, tetoTokens: number): boolean {
  return estimarTokens(texto) > tetoTokens;
}

// ---------------------------------------------------------------------------
// Entrada e configuração (parâmetros OBRIGATÓRIOS — fail-closed, sem default)
// ---------------------------------------------------------------------------

/** Entrada da fase F1: o assunto da trilha e seus SUB-ASSUNTOS a pesquisar. */
export interface F1Entrada {
  tema: string;
  /** Sub-assuntos da pesquisa (≥1). Um relatório/arquivo por sub-assunto. */
  subtopicos: string[];
}

/**
 * Configuração da fase F1 — TODOS os campos são OBRIGATÓRIOS (falta/inválido =
 * F1Error F1_CONFIG_INVALIDO antes de qualquer trabalho; zero default
 * sorrateiro). Os três primeiros são os parâmetros declarados do paralelismo:
 */
export interface F1Config {
  /**
   * Concorrência de SUB-PESQUISAS em voo (semáforo próprio da fase, ≥1).
   * O limitador da busca é 2 — não paralelize queries dentro de um assunto
   * (elas rodam sequenciais); o paralelismo é ENTRE sub-assuntos.
   */
  concorrenciaDeAssuntos: number;
  /** Atraso (ms) entre lotes de queries — repassado à busca em toda chamada (≥0). */
  atrasoEntreLotesMs: number;
  /**
   * Atraso (ms) de espera antes de REPETIR uma query sob 429 (rate limit) —
   * repassado à busca em TODA chamada (≥0). Sem este parâmetro o retry de 429
   * da busca é código morto; na produção ele vira `delayMsOnRateLimit` da
   * multiSearch da Brave (A-P14-3).
   */
  atrasoSobRateLimitMs: number;
  /** INV-06: teto de tokens do retorno de UMA sub-pesquisa (inteiro ≥1). */
  tetoTokensPorRetorno: number;
  /** Teto de achados normalizados por sub-assunto (inteiro ≥1). */
  tetoAchadosPorSubTopico: number;
  /** Teto de queries executadas por sub-assunto (inteiro ≥1). */
  tetoQueriesPorSubTopico: number;
  /** stageVersion — identidade de artefato no cache do transporte (não vazio). */
  stageVersion: string;
  /** Deadline de cada chamada LLM de etapa (inteiro ≥1). */
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Busca INJETADA (A-P14-2) — a suíte usa FAKE, roda offline
// ---------------------------------------------------------------------------

/** Parâmetros de execução repassados à busca em toda chamada (A-P14-3). */
export interface OpcoesDeBusca {
  atrasoEntreLotesMs: number;
  atrasoSobRateLimitMs: number;
}

/** Um achado CRU devolvido pela busca (ainda sem id/data de coleta). */
export interface AchadoCandidato {
  titulo: string;
  url: string;
  descricao?: string;
}

/** Sub-pergunta do plano de UM sub-assunto. */
export interface SubPergunta {
  id: string;
  pergunta: string;
}

/** Uma query planejada de UM sub-assunto. */
export interface QueryPlanejada {
  id: string;
  texto: string;
  /** id da sub-pergunta à qual a query pertence. */
  subPerguntaId: string;
}

/** Construção/API candidata vinda do PLANO (ainda sem subTopicoId). */
export interface ConstrucaoPlanejada {
  id: string;
  nome: string;
  tipo: 'construcao' | 'api';
  /** Referência que sustenta a candidatura (URL ou spec: ECMA-262/MDN/…). */
  fonte: string;
}

/** Concepção alternativa vinda do PLANO — âncora na spec é OBRIGATÓRIA (§4.2). */
export interface ConcepcaoPlanejada {
  id: string;
  descricao: string;
  /**
   * Âncora na especificação (ECMA-262 §…, MDN:…, WHATWG…, W3C… ou URL). Sem
   * âncora a concepção é REJEITADA mecanicamente — nunca aceita em silêncio.
   */
  ancoraNaSpec: string;
}

/** Plano de pesquisa de UM sub-assunto — UMA chamada por sub-assunto. */
export interface PlanoDeSubtopicos {
  subPerguntas: SubPergunta[];
  queries: QueryPlanejada[];
  construcoesCandidatas: ConstrucaoPlanejada[];
  concepcoesAlternativas: ConcepcaoPlanejada[];
}

/**
 * A busca INJETADA da fase F1. Produção: `criarBuscaPlanejada`. Testes: FAKE
 * offline (A-P14-2). `buscarPlano` recebe o sub-assunto e devolve o plano (com
 * os inventários candidatos); `buscarAchados` executa UMA query — as queries de
 * um mesmo assunto NUNCA são paralelizadas por esta fase (o limitador da busca
 * é 2).
 */
export interface Busca {
  buscarPlano(subtopico: string, opt: OpcoesDeBusca): Promise<PlanoDeSubtopicos>;
  buscarAchados(query: string, opt: OpcoesDeBusca): Promise<AchadoCandidato[]>;
}

// ---------------------------------------------------------------------------
// Inventários obrigatórios (§4.2) — FORMATO TIPADO (exports de tipos)
// ---------------------------------------------------------------------------

/** Inventário (a): construção ou API candidata com citação (URL de achado/spec). */
export interface ConstrucaoCandidata {
  id: string;
  nome: string;
  tipo: 'construcao' | 'api';
  /** Referência que sustenta a candidatura (URL ou spec). Obrigatória — sem citação a candidatura não entra no inventário. */
  fonte: string;
  subTopicoId: string;
}

/** Inventário (b): concepção alternativa com ÂNCORA na especificação (§4.2). */
export interface ConcepcaoAlternativa {
  id: string;
  descricao: string;
  /** Âncora obrigatória: referência de spec (ECMA-262/MDN/WHATWG/W3C/…) ou URL. */
  ancoraNaSpec: string;
  subTopicoId: string;
}

// ---------------------------------------------------------------------------
// Relatório por sub-pesquisa e o artefato de saída
// ---------------------------------------------------------------------------

/** Um achado NORMALIZADO (G-COVER-PESQ exige id, URL e data de coleta). */
export interface Achado {
  id: string;
  url: string;
  /** Data de coleta (ISO 8601) — carimbo no momento da normalização. */
  dataDeColeta: string;
  titulo: string;
  descricao?: string;
  subTopicoId: string;
  query: string;
}

/** Achado rejeitado na normalização — rejeição SEMPRE registrada, nunca silenciosa. */
export interface AchadoRejeitado {
  motivo: string;
  url: string;
  titulo: string;
}

/** Item (construção/concepção) rejeitado na validação de aceitação. */
export interface ItemRejeitado {
  id: string;
  nome: string;
  motivo: string;
}

/** Falha declarada de uma sub-pesquisa (a sub-pesquisa é isolada — A-P14-3). */
export interface FalhaDeSubPesquisa {
  codigo: string;
  mensagem: string;
  /** INV-06: true quando a sub-pesquisa foi REJEITADA por retorno acima do teto (nunca truncado). */
  retornoSobTeto?: boolean;
}

/** O relatório de UMA sub-pesquisa — "1 arquivo por agente" (§4.2 ⇉ largo). */
export interface RelatorioSubPesquisa {
  subTopicoId: string;
  subTopico: string;
  status: 'ok' | 'falhou';
  achados: Achado[];
  achadosRejeitados: AchadoRejeitado[];
  construcoes: ConstrucaoCandidata[];
  construcoesRejeitadas: ItemRejeitado[];
  concepcoes: ConcepcaoAlternativa[];
  concepcoesRejeitadas: ItemRejeitado[];
  /** Queries efetivamente executadas do plano do sub-assunto (teto aplicado). */
  consultasExecutadas: string[];
  falha?: FalhaDeSubPesquisa;
}

/** O artefato de saída da fase F1 (o que a materialização grava por agente/arquivo). */
export interface ArtefatoF1 {
  schema: typeof SCHEMA_F1;
  tema: string;
  /** Um relatório por sub-assunto — SÃO os artefatos por agente (§4.2). */
  relatorios: RelatorioSubPesquisa[];
  /** Inventário (a) consolidado da trilha — deduplicado, com citação. */
  inventarioConstrucoes: ConstrucaoCandidata[];
  /** Inventário (b) consolidado da trilha — toda concepção COM âncora na spec. */
  inventarioConcepcoes: ConcepcaoAlternativa[];
  /** G-COVER-PESQ materializado: todo subtópico tem ≥1 achado? */
  cobertura: Array<{ subTopicoId: string; comFonte: boolean }>;
  gCoverPesqAprovado: boolean;
  /** A-P14-3: a nota literal da insubstituibilidade da revisão humana. */
  declaracaoInsubstituivel: string;
  /** Limitações DECLARADAS (sub-pesquisas falhas, rejeições) — nunca omitidas (§9.2). */
  limitacoes: string[];
  geradoEm: string;
}

// ---------------------------------------------------------------------------
// Erros estruturados (FAIL-CLOSED — §9.3)
// ---------------------------------------------------------------------------

export type F1ErrorCode =
  /** Configuração fora do contrato (parâmetro obrigatório ausente/inválido). */
  | 'F1_CONFIG_INVALIDO'
  /** Entrada sem sub-assuntos (ou tema vazio). */
  | 'F1_ENTRADA_VAZIA'
  /** A-P14-1: busca sem chave de API — ABORTA a fase (não degrada). */
  | 'F1_BUSCA_SEM_CHAVE'
  /** Chave de busca rejeitada pela API (401/403) — ABORTA a fase. */
  | 'F1_BUSCA_CHAVE_INVALIDA'
  /** LLM sem chave de API (transporte) — ABORTA o run inteiro. */
  | 'F1_LLM_SEM_CHAVE'
  /** Chave de LLM rejeitada (transporte) — ABORTA o run inteiro. */
  | 'F1_LLM_CHAVE_INVALIDA'
  /** BAD_REQUEST — bug de prompt da etapa; erro estruturado NOMEANDO a etapa. */
  | 'F1_LLM_PROMPT_INVALIDO'
  /** Plano de um sub-assunto sem nenhuma query utilizável. */
  | 'F1_PLANO_INVALIDO';

export interface F1ErrorOptions {
  code: F1ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  etapa?: string;
  cause?: unknown;
}

/** Erro estruturado da fase F1 — nunca um veredito falso nem silêncio. */
export class F1Error extends Error {
  readonly code: F1ErrorCode;
  readonly details: Record<string, unknown>;
  readonly etapa?: string;
  readonly cause?: unknown;

  constructor(opts: F1ErrorOptions) {
    super(opts.message);
    this.name = 'F1Error';
    this.code = opts.code;
    this.details = opts.details ?? {};
    if (opts.etapa !== undefined) this.etapa = opts.etapa;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

// ---------------------------------------------------------------------------
// Helpers PURAS — validação de referência, aceitação e gates
// ---------------------------------------------------------------------------

/** URL com esquema http/https e hostname — "resolvível". */
export function eReferenciaURL(valor: string): boolean {
  if (typeof valor !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(valor.trim());
  } catch {
    return false;
  }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
}

/** Padrões de referência de especificação aceitos como âncora (além de URL). */
const PADROES_DE_REFERENCIA_DE_SPEC = /^(ECMA-262|MDN|WHATWG|W3C|TC39|Node\.js)\b/i;

/**
 * Âncora na spec VÁLIDA: URL resolvível OU referência de especificação
 * (ECMA-262/MDN/WHATWG/W3C/TC39/Node.js). 'apenas texto' é INVÁLIDO.
 */
export function ancoraNaSpecValida(ancora: string): boolean {
  const s = (ancora ?? '').trim();
  if (!s) return false;
  return eReferenciaURL(s) || PADROES_DE_REFERENCIA_DE_SPEC.test(s);
}

/** Referência que sustenta uma candidatura: URL ou spec (mesma régua da âncora). */
export function eReferenciaValida(ref: string): boolean {
  return ancoraNaSpecValida(ref);
}

/** URL de achado válida — vazia, não parseável ("apenas texto") ou esquema não-http são inválidas. */
export function validarUrlAchado(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim().length === 0) return 'URL vazia';
  if (!eReferenciaURL(url)) return 'URL não resolvível (inválida ou apenas texto)';
  return null;
}

/** Valida UMA construção planejada; devolve o motivo quando inválida. */
export function validarConstrucaoPlanejada(c: ConstrucaoPlanejada): string | null {
  if (!c || typeof c.id !== 'string' || c.id.trim().length === 0) return 'id ausente';
  if (typeof c.nome !== 'string' || c.nome.trim().length === 0) return 'nome ausente';
  if (c.tipo !== 'construcao' && c.tipo !== 'api') return `tipo inválido (${String(c.tipo)})`;
  if (typeof c.fonte !== 'string' || !eReferenciaValida(c.fonte)) {
    return 'fonte ausente ou sem referência (URL/spec) — sem citação a candidatura não entra no inventário';
  }
  return null;
}

/** Valida UMA concepção planejada; devolve o motivo quando inválida. */
export function validarConcepcaoPlanejada(c: ConcepcaoPlanejada): string | null {
  if (!c || typeof c.id !== 'string' || c.id.trim().length === 0) return 'id ausente';
  if (typeof c.descricao !== 'string' || c.descricao.trim().length === 0) return 'descrição ausente';
  if (typeof c.ancoraNaSpec !== 'string' || !ancoraNaSpecValida(c.ancoraNaSpec)) {
    return 'ancoraNaSpec ausente ou sem referência (ECMA-262/MDN/WHATWG/W3C/URL) — âncora na spec é OBRIGATÓRIA (§4.2)';
  }
  return null;
}

/**
 * Coage o campo `construcoesCandidatas` cru (LLM) para o shape tipado —
 * entradas fora do shape são descartadas; teto de 12 por plano. PURO.
 */
export function normalizarConstrucoesPlanejadas(raw: unknown): ConstrucaoPlanejada[] {
  if (!Array.isArray(raw)) return [];
  const out: ConstrucaoPlanejada[] = [];
  for (const item of raw) {
    if (out.length >= 12) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.nome !== 'string') continue;
    const tipo = o.tipo === 'api' ? 'api' : o.tipo === 'construcao' ? 'construcao' : null;
    if (tipo === null) continue;
    // fonte é validada depois (validação de aceitação na fase); aqui só o shape.
    if (typeof o.fonte !== 'string' || o.fonte.trim().length === 0) continue;
    out.push({
      id: o.id.trim().slice(0, 64),
      nome: o.nome.trim().slice(0, 120),
      tipo,
      fonte: o.fonte.trim().slice(0, 400),
    });
  }
  return out;
}

/**
 * Coage o campo `concepcoesAlternativas` cru (LLM) para o shape tipado —
 * entradas fora do shape são descartadas; a ÂNCORA é validada depois na
 * aceitação (aqui só o shape). Tetos de 12 por plano. PURO.
 */
export function normalizarConcepcoesPlanejadas(raw: unknown): ConcepcaoPlanejada[] {
  if (!Array.isArray(raw)) return [];
  const out: ConcepcaoPlanejada[] = [];
  for (const item of raw) {
    if (out.length >= 12) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.descricao !== 'string') continue;
    if (typeof o.ancoraNaSpec !== 'string' || o.ancoraNaSpec.trim().length === 0) continue;
    out.push({
      id: o.id.trim().slice(0, 64),
      descricao: o.descricao.trim().slice(0, 400),
      ancoraNaSpec: o.ancoraNaSpec.trim().slice(0, 400),
    });
  }
  return out;
}

/**
 * G-COVER-PESQ — gate PURA da fase F1 (§4.2): todo subtópico tem ao menos um
 * arquivo/achado e todo achado tem id, URL e data de coleta. `aprovado` só com
 * as duas condições; subtópicos sem fonte e achados sem identidade são
 * declarados, nunca silenciados.
 */
export interface VereditoDeCobertura {
  aprovado: boolean;
  subtopicosSemFonte: string[];
  achadosSemIdentidade: Array<{ subTopicoId: string; achadoId?: string; faltam: string[] }>;
}

export function gCoverPesq(relatorios: RelatorioSubPesquisa[]): VereditoDeCobertura {
  const subtopicosSemFonte: string[] = [];
  const achadosSemIdentidade: VereditoDeCobertura['achadosSemIdentidade'] = [];
  for (const r of relatorios) {
    if (r.achados.length === 0) {
      subtopicosSemFonte.push(r.subTopicoId);
      continue;
    }
    for (const a of r.achados) {
      const faltam: string[] = [];
      if (!a.id || a.id.trim().length === 0) faltam.push('id');
      if (!a.url || a.url.trim().length === 0) faltam.push('url');
      if (!a.dataDeColeta || a.dataDeColeta.trim().length === 0) faltam.push('dataDeColeta');
      if (faltam.length > 0) {
        achadosSemIdentidade.push({ subTopicoId: r.subTopicoId, achadoId: a.id, faltam });
      }
    }
  }
  return {
    aprovado: subtopicosSemFonte.length === 0 && achadosSemIdentidade.length === 0,
    subtopicosSemFonte,
    achadosSemIdentidade,
  };
}

/**
 * Valida a configuração — TODOS os parâmetros são obrigatórios (fail-closed).
 * Devolve a lista de problemas `campo: motivo` (vazia = config válida).
 */
export function validarConfig(config: F1Config): string[] {
  const problemas: string[] = [];
  if (!config || typeof config !== 'object') return ['config ausente'];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const inteiroPositivo = (v: unknown, campo: string, min: number): void => {
    if (!num(v) || !Number.isInteger(v) || v < min) {
      problemas.push(`"${campo}": precisa ser inteiro ≥ ${min} (recebido ${String(v)})`);
    }
  };
  inteiroPositivo(config.concorrenciaDeAssuntos, 'concorrenciaDeAssuntos', 1);
  if (!num(config.atrasoEntreLotesMs) || config.atrasoEntreLotesMs < 0) {
    problemas.push(`"atrasoEntreLotesMs": precisa ser número ≥ 0 (recebido ${String(config.atrasoEntreLotesMs)})`);
  }
  if (!num(config.atrasoSobRateLimitMs) || config.atrasoSobRateLimitMs < 0) {
    problemas.push(`"atrasoSobRateLimitMs": precisa ser número ≥ 0 (recebido ${String(config.atrasoSobRateLimitMs)})`);
  }
  inteiroPositivo(config.tetoTokensPorRetorno, 'tetoTokensPorRetorno', 1);
  inteiroPositivo(config.tetoAchadosPorSubTopico, 'tetoAchadosPorSubTopico', 1);
  inteiroPositivo(config.tetoQueriesPorSubTopico, 'tetoQueriesPorSubTopico', 1);
  if (typeof config.stageVersion !== 'string' || config.stageVersion.trim().length === 0) {
    problemas.push('"stageVersion": não pode ser vazio');
  }
  inteiroPositivo(config.timeoutMs, 'timeoutMs', 1);
  return problemas;
}

/** Valida a entrada da fase — tema e sub-assuntos não vazios. */
export function validarEntrada(entrada: F1Entrada): string[] {
  const problemas: string[] = [];
  if (!entrada || typeof entrada !== 'object') return ['entrada ausente'];
  if (typeof entrada.tema !== 'string' || entrada.tema.trim().length === 0) {
    problemas.push('"tema": não pode ser vazio');
  }
  if (!Array.isArray(entrada.subtopicos) || entrada.subtopicos.length === 0) {
    problemas.push('"subtopicos": precisa ter ao menos 1 sub-assunto');
  } else {
    for (const s of entrada.subtopicos) {
      if (typeof s !== 'string' || s.trim().length === 0) {
        problemas.push('"subtopicos": contém item vazio');
        break;
      }
    }
  }
  return problemas;
}

/** Dedup por (tipo+nome) do inventário consolidado de construções (primeiro vence). */
function dedupeConstrucoes(lista: ConstrucaoCandidata[]): ConstrucaoCandidata[] {
  const vistos = new Set<string>();
  const out: ConstrucaoCandidata[] = [];
  for (const c of lista) {
    const chave = `${c.tipo}:${c.nome.trim().toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(c);
  }
  return out;
}

/** Dedup por descrição do inventário consolidado de concepções (primeiro vence). */
function dedupeConcepcoes(lista: ConcepcaoAlternativa[]): ConcepcaoAlternativa[] {
  const vistos = new Set<string>();
  const out: ConcepcaoAlternativa[] = [];
  for (const c of lista) {
    const chave = c.descricao.trim().toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Busca de PRODUÇÃO — `criarBuscaPlanejada`
// ---------------------------------------------------------------------------

/** Executor de multi-busca de baixo nível (produção: braveSearchService.multiSearch). */
export interface ExecutorDeMultiBusca {
  multiSearch(
    queries: string[],
    opts: { concurrency: number; delayMs: number; delayMsOnRateLimit: number; count?: number },
  ): Promise<{
    results: Array<{ title: string; url: string; description?: string }>;
    errors: Array<{ query: string; error: string; code?: string }>;
  }>;
}

export interface DepsDaBuscaPlanejada {
  /** Transporte único de LLM (runtime/callLlm) — o planejador por sub-assunto. */
  llm: EngineLlm;
  /** Executor de multi-busca (em produção, o Brave com `delayMsOnRateLimit`). */
  multi: ExecutorDeMultiBusca;
  /** stageVersion do plano (identidade de artefato no cache do transporte). */
  stageVersion: string;
  /** Deadline de cada chamada de plano. */
  timeoutMs: number;
  /** Teto de saída do planejador (default 1200). */
  maxTokensPlano?: number;
  /** Temperatura do planejador (default 0.3 — baixa, JSON estrito). */
  temperaturaPlano?: number;
  /**
   * Fallback heurístico quando o PLANEJADOR LLM falha (política "resposta
   * degradada > erro" do researchPlanner). Default true. KEY_MISSING/
   * KEY_INVALID/BAD_REQUEST NUNCA degradam — sobem para a fase ABORTAR.
   */
  usarHeuristica?: boolean;
}

/** Prompt do plano F1: shape base do researchPlanner + inventários (extensão). */
export function f1PromptDePlano(subtopico: string): { system: string; user: string } {
  const base = buildPlanPrompt(subtopico); // REUSO: helper puro do researchPlanner
  return {
    system: base.system,
    user: [
      base.user,
      '',
      'EXTENSÃO F1 (pesquisa de TRILHA) — além do shape acima, devolva OPCIONALMENTE:',
      '- "construcoesCandidatas": [{id:"c1",nome:"...",tipo:"construcao"|"api",fonte:"URL ou ECMA-262/MDN que sustenta"}]',
      '- "concepcoesAlternativas": [{id:"m1",descricao:"...",ancoraNaSpec:"ECMA-262 §... / MDN / URL EXATA da spec"}]',
      'REGRAS: toda concepção DEVE ter ancoraNaSpec (sem âncora ela é rejeitada mecanicamente);',
      'toda construção/API candidata DEVE ter fonte citável (URL ou spec).',
    ].join('\n'),
  };
}

/** Coage o shape do researchPlanner + os inventários crus para o PlanoDeSubtopicos. */
function planoDeSubtopicos(shape: ResearchPlanShape, raw: unknown): PlanoDeSubtopicos {
  const cru =
    raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  return {
    subPerguntas: shape.subQuestions.map((sq) => ({ id: sq.id, pergunta: sq.question })),
    queries: shape.queries.map((q) => ({ id: q.id, texto: q.q, subPerguntaId: q.sub })),
    construcoesCandidatas: cru ? normalizarConstrucoesPlanejadas(cru.construcoesCandidatas) : [],
    concepcoesAlternativas: cru ? normalizarConcepcoesPlanejadas(cru.concepcoesAlternativas) : [],
  };
}

/**
 * Falha de planejador que NUNCA degrada (aborta a fase — A-P14-1 e transporte).
 * Reconhece DOIS shapes do MESMO contrato de códigos: (a) o `LlmStageError` do
 * transporte da onda 1; (b) o erro CRU com o mesmo `code` — um EngineLlm
 * injetado pode lançar o erro do cliente DeepSeek/Brave sem embrulhar no
 * transporte. Inclui BAD_REQUEST (bug de prompt, simétrico ao classificador de
 * fase): a heurística NUNCA substitui um prompt quebrado — aborta.
 */
function falhaInaveitavelDoPlanejador(err: unknown): boolean {
  if (err instanceof F1Error) return true;
  if (err instanceof LlmStageError) {
    return (
      err.code === DEEPSEEK_ERROR_CODES.KEY_MISSING ||
      err.code === DEEPSEEK_ERROR_CODES.KEY_INVALID ||
      err.code === DEEPSEEK_ERROR_CODES.BAD_REQUEST
    );
  }
  const code = (err as { code?: unknown } | null)?.code;
  return (
    code === 'BRAVE_KEY_MISSING' ||
    code === 'BRAVE_KEY_INVALID' ||
    code === 'DEEPSEEK_KEY_MISSING' ||
    code === 'DEEPSEEK_KEY_INVALID' ||
    code === DEEPSEEK_ERROR_CODES.BAD_REQUEST
  );
}

/**
 * Implementação de PRODUÇÃO da `Busca` (A-P14-2):
 *   - `buscarPlano(subtopico)`: UMA chamada de plano por sub-assunto via
 *     transporte único (callLlm) REUSANDO os helpers puros do researchPlanner
 *     (buildPlanPrompt/parseLlmJson/normalizePlanShape/heuristicPlanFor — nada
 *     é reescrito). LLM indisponível (não-chave) ⇒ heurística determinística
 *     ("resposta degradada > erro", política do planner); KEY_MISSING/
 *     KEY_INVALID/BAD_REQUEST sobem para a fase ABORTAR — no shape do
 *     `LlmStageError` do transporte OU como erro CRU com o mesmo `code`
 *     (BAD_REQUEST nunca degrada, nem cru nem tipado).
 *   - `buscarAchados(query)`: UMA query no executor de multi-busca passando
 *     SEMPRE `delayMsOnRateLimit: opt.atrasoSobRateLimitMs` (A-P14-3 — o retry
 *     de 429 da busca é código vivo só quando passado) e o atraso entre lotes.
 */
export function criarBuscaPlanejada(deps: DepsDaBuscaPlanejada): Busca {
  const usarHeuristica = deps.usarHeuristica !== false;
  const maxTokensPlano = deps.maxTokensPlano ?? 1200;
  const temperaturaPlano = deps.temperaturaPlano ?? 0.3;

  async function chamarPlanejadorLlm(subtopico: string): Promise<unknown> {
    const { system, user } = f1PromptDePlano(subtopico);
    const res = await deps.llm.callLlm(`f1:plano:${subtopico}`, {
      prompt: user,
      system,
      schema: 'f1-plano-de-pesquisa',
      stageVersion: deps.stageVersion,
      timeoutMs: deps.timeoutMs,
      maxTokens: maxTokensPlano,
      temperature: temperaturaPlano,
    });
    return parseLlmJson(res.content);
  }

  async function buscarPlano(subtopico: string, _opt: OpcoesDeBusca): Promise<PlanoDeSubtopicos> {
    let raw: unknown = null;
    try {
      raw = await chamarPlanejadorLlm(subtopico);
      const shape = normalizePlanShape(raw);
      if (shape.queries.length > 0) return planoDeSubtopicos(shape, raw);
      // Plano vazio: mesma política do planner — resposta degradada > erro.
      if (!usarHeuristica) return planoDeSubtopicos(shape, raw);
    } catch (err) {
      if (falhaInaveitavelDoPlanejador(err)) throw err; // chave/bug de prompt: a fase ABORTA
      if (!usarHeuristica) throw err; // sem fallback declarado: fail-closed
    }
    return planoDeSubtopicos(heuristicPlanFor(subtopico), null);
  }

  async function buscarAchados(query: string, opt: OpcoesDeBusca): Promise<AchadoCandidato[]> {
    const res = await deps.multi.multiSearch([query], {
      concurrency: 1, // esta fase NUNCA paraleliza queries dentro de um assunto
      delayMs: opt.atrasoEntreLotesMs,
      // A-P14-3 — passado em TODA chamada: sem ele, o retry de 429 da busca
      // (RATE_LIMIT_MAX_RETRIES=1 do Brave) é código morto.
      delayMsOnRateLimit: opt.atrasoSobRateLimitMs,
    });
    const primeiroErro = res.errors[0];
    if (primeiroErro) {
      const err = new Error(primeiroErro.error || 'falha na busca');
      (err as Error & { code?: string }).code = primeiroErro.code ?? 'BRAVE_ERROR';
      throw err;
    }
    return res.results.map((r) => ({ titulo: r.title, url: r.url, descricao: r.description }));
  }

  return { buscarPlano, buscarAchados };
}

// ---------------------------------------------------------------------------
// A fase F1 — `criarF1Research`
// ---------------------------------------------------------------------------

export interface F1Deps {
  /** Busca INJETADA (A-P14-2) — FAKE nos testes, `criarBuscaPlanejada` na produção. */
  busca: Busca;
  /** Configuração OBRIGATÓRIA (fail-closed). */
  config: F1Config;
  /** Relógio injetável para dataDeColeta/geradoEm (testes). Default: ISO agora. */
  agora?: () => string;
}

export interface F1Phase {
  executar(entrada: F1Entrada): Promise<ArtefatoF1>;
}

/**
 * Cria a fase F1. `executar`:
 *   1. valida config e entrada (F1Error ANTES de qualquer trabalho);
 *   2. dispara as sub-pesquisas em paralelo com o semáforo PRÓPRIO
 *      (`concorrenciaDeAssuntos`); queries DENTRO de um assunto rodam
 *      SEQUENCIAIS (o limitador da busca é 2);
 *   3. isola falhas por sub-pesquisa — 429 e demais falhas não-chave são
 *      REGISTRADAS no relatório da sub-pesquisa e o run continua (A-P14-3);
 *      KEY_MISSING/KEY_INVALID/BAD_REQUEST ABORTAM a fase com F1Error (A-P14-1);
 *   4. aplica INV-06 (retorno acima do teto REJEITADO, nunca truncado),
 *      normaliza achados (URL resolvível obrigatória; rejeição sempre
 *      registrada) e valida os inventários (fonte/âncora obrigatórias);
 *   5. roda G-COVER-PESQ (função pura) e monta o artefato com a declaração
 *      literal da insubstituibilidade da revisão humana (A-P14-3).
 */
export function criarF1Research(deps: F1Deps): F1Phase {
  const { busca, config } = deps;
  const relogio: () => string = deps.agora ?? (() => new Date().toISOString());

  /** Classifica QUALQUER erro vindo da busca/transporte. Chave/bug de prompt → aborta. */
  function classificarErroDeFase(
    err: unknown,
  ): { abortar: true; erro: F1Error } | { abortar: false; falha: { codigo: string; mensagem: string } } {
    if (err instanceof F1Error) return { abortar: true, erro: err };
    if (err instanceof LlmStageError) {
      switch (err.code) {
        case DEEPSEEK_ERROR_CODES.KEY_MISSING:
          return {
            abortar: true,
            erro: new F1Error({
              code: 'F1_LLM_SEM_CHAVE',
              message: 'LLM sem chave de API — o run ABORTA (o transporte nunca degrada em silêncio).',
              etapa: err.etapa,
              cause: err,
            }),
          };
        case DEEPSEEK_ERROR_CODES.KEY_INVALID:
          return {
            abortar: true,
            erro: new F1Error({
              code: 'F1_LLM_CHAVE_INVALIDA',
              message: 'chave de API do LLM rejeitada (401/403) — o run ABORTA.',
              etapa: err.etapa,
              cause: err,
            }),
          };
        case DEEPSEEK_ERROR_CODES.BAD_REQUEST:
          return {
            abortar: true,
            erro: new F1Error({
              code: 'F1_LLM_PROMPT_INVALIDO',
              message: `bug de prompt da etapa "${err.etapa}" (BAD_REQUEST) — erro estruturado, nunca silêncio.`,
              etapa: err.etapa,
              cause: err,
            }),
          };
        case DEEPSEEK_ERROR_CODES.RATE_LIMIT:
          return {
            abortar: false,
            falha: {
              codigo: err.code,
              mensagem: `429 da LLM na etapa "${err.etapa}" — a sub-pesquisa falha isolada (A-P14-3).`,
            },
          };
        default:
          return { abortar: false, falha: { codigo: err.code, mensagem: err.message } };
      }
    }
    const codigo = (err as { code?: unknown } | null)?.code;
    if (codigo === 'BRAVE_KEY_MISSING' || codigo === 'DEEPSEEK_KEY_MISSING') {
      return {
        abortar: true,
        erro: new F1Error({
          code: 'F1_BUSCA_SEM_CHAVE',
          message:
            'busca sem chave de API — a fase ABORTA (A-P14-1: não degrada em silêncio; nunca usa busca keyless como default).',
          cause: err,
        }),
      };
    }
    if (codigo === 'BRAVE_KEY_INVALID' || codigo === 'DEEPSEEK_KEY_INVALID') {
      return {
        abortar: true,
        erro: new F1Error({
          code: 'F1_BUSCA_CHAVE_INVALIDA',
          message: 'chave da busca rejeitada pela API (401/403) — a fase ABORTA (A-P14-1).',
          cause: err,
        }),
      };
    }
    if (codigo === 'DEEPSEEK_BAD_REQUEST') {
      return {
        abortar: true,
        erro: new F1Error({
          code: 'F1_LLM_PROMPT_INVALIDO',
          message: 'bug de prompt da etapa F1 (BAD_REQUEST) — erro estruturado nomeando a etapa.',
          cause: err,
        }),
      };
    }
    // 429 e demais (NETWORK/SERVER_ERROR/STAGE_TIMEOUT/…) → falha ISOLADA.
    return {
      abortar: false,
      falha: {
        codigo: typeof codigo === 'string' && codigo.length > 0 ? codigo : 'F1_ERRO_NAO_CLASSIFICADO',
        mensagem: err instanceof Error ? err.message : String(err),
      },
    };
  }

  /** Relatório de rejeição INV-06: retorno acima do teto — conteúdo DESCARTADO, nunca truncado. */
  function relatorioRejeitadoPorTeto(subTopico: string, subTopicoId: string): RelatorioSubPesquisa {
    return {
      subTopicoId,
      subTopico,
      status: 'falhou',
      achados: [],
      achadosRejeitados: [],
      construcoes: [],
      construcoesRejeitadas: [],
      concepcoes: [],
      concepcoesRejeitadas: [],
      consultasExecutadas: [],
      falha: {
        codigo: 'F1_RETORNO_ACIMA_DO_TETO',
        mensagem: `retorno da sub-pesquisa excede ${config.tetoTokensPorRetorno} tokens estimados — REJEITADO (INV-06), nunca truncado.`,
        retornoSobTeto: true,
      },
    };
  }

  /** Executa UMA sub-pesquisa de forma ISOLADA (nunca lança — exceto aborte de fase). */
  async function pesquisarSubTopico(subTopico: string, index: number): Promise<RelatorioSubPesquisa> {
    const subTopicoId = `st${index + 1}`;
    const base: RelatorioSubPesquisa = {
      subTopicoId,
      subTopico,
      status: 'falhou',
      achados: [],
      achadosRejeitados: [],
      construcoes: [],
      construcoesRejeitadas: [],
      concepcoes: [],
      concepcoesRejeitadas: [],
      consultasExecutadas: [],
    };
    try {
      const opt: OpcoesDeBusca = {
        atrasoEntreLotesMs: config.atrasoEntreLotesMs,
        atrasoSobRateLimitMs: config.atrasoSobRateLimitMs,
      };

      // UMA chamada de plano por sub-assunto.
      const plano = await busca.buscarPlano(subTopico, opt);
      if (!plano || !Array.isArray(plano.queries) || plano.queries.length === 0) {
        base.falha = {
          codigo: 'F1_PLANO_INVALIDO',
          mensagem: `plano do sub-assunto "${subTopico}" sem nenhuma query utilizável`,
        };
        return base;
      }

      // Inventários candidatos — aceitação com validação (fonte/âncora OBRIGATÓRIAS).
      const construcoes: ConstrucaoCandidata[] = [];
      const construcoesRejeitadas: ItemRejeitado[] = [];
      for (const c of Array.isArray(plano.construcoesCandidatas) ? plano.construcoesCandidatas : []) {
        const motivo = validarConstrucaoPlanejada(c);
        if (motivo) {
          construcoesRejeitadas.push({ id: c?.id ?? '', nome: c?.nome ?? '', motivo });
          continue;
        }
        construcoes.push({ ...c, subTopicoId });
      }
      const concepcoes: ConcepcaoAlternativa[] = [];
      const concepcoesRejeitadas: ItemRejeitado[] = [];
      for (const c of Array.isArray(plano.concepcoesAlternativas) ? plano.concepcoesAlternativas : []) {
        const motivo = validarConcepcaoPlanejada(c);
        if (motivo) {
          concepcoesRejeitadas.push({ id: c?.id ?? '', nome: c?.descricao ?? '', motivo });
          continue;
        }
        concepcoes.push({ ...c, subTopicoId });
      }
      base.construcoes = construcoes;
      base.construcoesRejeitadas = construcoesRejeitadas;
      base.concepcoes = concepcoes;
      base.concepcoesRejeitadas = concepcoesRejeitadas;

      // Queries do assunto: SEQUENCIAIS (nunca em paralelo dentro do assunto).
      const queries = plano.queries.slice(0, config.tetoQueriesPorSubTopico);
      // Dedup por URL DENTRO da sub-pesquisa: a mesma fonte repetida em
      // queries diferentes do MESMO assunto não entra duas vezes (nem é
      // rejeitada duas vezes) — registra-se o primeiro evento.
      const urlsVistas = new Set<string>();
      for (const q of queries) {
        let crus: AchadoCandidato[];
        try {
          crus = await busca.buscarAchados(q.texto, opt);
        } catch (err) {
          const c = classificarErroDeFase(err);
          if (c.abortar) throw c.erro; // chave/bug de prompt: ABORTA a fase inteira
          base.falha = { codigo: c.falha.codigo, mensagem: c.falha.mensagem };
          break; // 429/outras: a sub-pesquisa falha AQUI, as demais seguem (A-P14-3)
        }
        base.consultasExecutadas.push(q.texto);
        const dataDeColeta = relogio();
        for (const candidato of crus) {
          if (!candidato || typeof candidato !== 'object') continue;
          const urlCrua = typeof candidato.url === 'string' ? candidato.url : '';
          const chaveDaUrl = urlCrua.trim().toLowerCase();
          if (urlsVistas.has(chaveDaUrl)) continue;
          urlsVistas.add(chaveDaUrl);
          const problema = validarUrlAchado(urlCrua);
          if (problema) {
            base.achadosRejeitados.push({
              motivo: problema,
              url: urlCrua,
              titulo: candidato.titulo ?? '',
            });
            continue; // achado sem URL resolvível é REJEITADO — rejeição sempre registrada
          }
          base.achados.push({
            id: `${subTopicoId}:a${base.achados.length + 1}`,
            url: urlCrua.trim(),
            dataDeColeta,
            titulo: candidato.titulo,
            ...(candidato.descricao !== undefined ? { descricao: candidato.descricao } : {}),
            subTopicoId,
            query: q.texto,
          });
          if (base.achados.length >= config.tetoAchadosPorSubTopico) break;
        }
        if (base.achados.length >= config.tetoAchadosPorSubTopico) break;
      }

      if (!base.falha) base.status = 'ok';

      // INV-06: retorno de agente acima do teto é REJEITADO, nunca truncado.
      if (rejeitarAcimaDoTeto(JSON.stringify(base), config.tetoTokensPorRetorno)) {
        return relatorioRejeitadoPorTeto(subTopico, subTopicoId);
      }
      return base;
    } catch (err) {
      // Só chega aqui erro ABORTIVO de fase (chave/bug de prompt) — propaga
      // estruturado; qualquer outro erro não-classificado vira falha isolada.
      if (err instanceof F1Error) throw err;
      const c = classificarErroDeFase(err);
      if (c.abortar) throw c.erro;
      base.falha = { codigo: c.falha.codigo, mensagem: c.falha.mensagem };
      return base;
    }
  }

  /** Monta o artefato (PURA): G-COVER-PESQ + inventários dedup + declaração A-P14-3. */
  function montarArtefatoF1(tema: string, relatorios: RelatorioSubPesquisa[]): ArtefatoF1 {
    const gate = gCoverPesq(relatorios);
    const limitacoes: string[] = [];
    for (const r of relatorios) {
      if (r.falha) {
        limitacoes.push(
          `sub-pesquisa "${r.subTopicoId}" ("${r.subTopico}") falhou: ${r.falha.codigo} — ${r.falha.mensagem}`,
        );
      }
      if (r.achadosRejeitados.length > 0) {
        limitacoes.push(
          `sub-pesquisa "${r.subTopicoId}": ${r.achadosRejeitados.length} achado(s) rejeitado(s) por URL irresolvível (registrados, nunca silenciados).`,
        );
      }
      if (r.construcoesRejeitadas.length > 0) {
        limitacoes.push(
          `sub-pesquisa "${r.subTopicoId}": ${r.construcoesRejeitadas.length} construção/API candidata rejeitada sem citação (fonte).`,
        );
      }
      if (r.concepcoesRejeitadas.length > 0) {
        limitacoes.push(
          `sub-pesquisa "${r.subTopicoId}": ${r.concepcoesRejeitadas.length} concepção rejeitada sem âncora na spec (§4.2).`,
        );
      }
    }
    if (!gate.aprovado) {
      limitacoes.push(
        `G-COVER-PESQ reprovado: ${gate.subtopicosSemFonte.length} subtópico(s) sem nenhuma fonte (${gate.subtopicosSemFonte.join(
          ', ',
        )}) — revisão humana obrigatória antes de prosseguir.`,
      );
    }
    return {
      schema: SCHEMA_F1,
      tema,
      relatorios,
      inventarioConstrucoes: dedupeConstrucoes(relatorios.flatMap((r) => r.construcoes)),
      inventarioConcepcoes: dedupeConcepcoes(relatorios.flatMap((r) => r.concepcoes)),
      cobertura: relatorios.map((r) => ({ subTopicoId: r.subTopicoId, comFonte: r.achados.length > 0 })),
      gCoverPesqAprovado: gate.aprovado,
      declaracaoInsubstituivel: DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA,
      limitacoes,
      geradoEm: relogio(),
    };
  }

  return {
    async executar(entrada: F1Entrada): Promise<ArtefatoF1> {
      const problemasConfig = validarConfig(config);
      if (problemasConfig.length > 0) {
        throw new F1Error({
          code: 'F1_CONFIG_INVALIDO',
          message: `configuração da fase F1 fora do contrato: ${problemasConfig.join('; ')}`,
          details: { problemas: problemasConfig },
        });
      }
      const problemasEntrada = validarEntrada(entrada);
      if (problemasEntrada.length > 0) {
        throw new F1Error({
          code: 'F1_ENTRADA_VAZIA',
          message: `entrada da fase F1 inválida: ${problemasEntrada.join('; ')}`,
          details: { problemas: problemasEntrada },
        });
      }

      // Semáforo PRÓPRIO da fase (sub-pesquisas em voo). NÃO é o SEM_LLM — o
      // transporte tem o dele; aqui limitamos o paralelismo entre sub-assuntos.
      const semaforoDeAssuntos = createSemaphore(config.concorrenciaDeAssuntos);
      const subtopicos = entrada.subtopicos.map((s) => s.trim());
      const relatorios: RelatorioSubPesquisa[] = new Array(subtopicos.length);

      await Promise.all(
        subtopicos.map(async (sub, index) => {
          const liberar = await semaforoDeAssuntos.acquire();
          try {
            relatorios[index] = await pesquisarSubTopico(sub, index);
          } finally {
            liberar();
          }
        }),
      );

      return montarArtefatoF1(entrada.tema, relatorios);
    },
  };
}