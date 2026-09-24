/**
 * app/electron/main/engine/runtime/callLlm.ts — FACHADA do TRANSPORTE ÚNICO de
 * LLM da engine de trilhas (P-01, `docs/16-engine-de-trilha.md` §4.1, §11).
 *
 * REFATORAÇÃO L06: este arquivo virou FACHADA FINA (re-export + o wrapper
 * `createCallLlm`, que detém a referência do INV-01) — a implementação foi
 * dividida e TODO o contrato público continua exportado por ESTE caminho
 * (nenhum consumidor mudou de import):
 *   - `callLlmTypes.ts`      — tipos, códigos e o erro estruturado do
 *                              transporte (`LlmStageError`);
 *   - `callLlmRequest.ts`    — montagem pura da requisição e da chave;
 *   - `callLlmTransport.ts`  — o núcleo `createCallLlmTransport` (semáforo,
 *                              backoff, timeout, cache, usage, log sanitizado)
 *                              — a invocação do cliente chega INJETADA.
 *
 * Todo chamada de LLM da engine passa por `callLlm(etapa, req)`. Este pacote
 * concentra o que não existia em lugar nenhum:
 *
 *   1. SEMÁFORO de concorrência (SEM_LLM — rede; SEM_EXEC fica no semaphore.ts
 *      para os spawns de P-07). O slot é liberado no `finally` em TODO caminho.
 *   2. BACKOFF por código de erro (`backoff.ts`): 429/SERVER_ERROR/NETWORK
 *      retentam; EMPTY_CONTENT retenta UMA vez; KEY_MISSING/KEY_INVALID/
 *      BAD_REQUEST NUNCA retentam. **429 é backoff, nunca fallback de
 *      provedor (A-P01-4, §11)** — existe UM cliente, injetado, e nenhum
 *      caminho alternativo. Quando o erro traz `retryAfterMs` (header
 *      `Retry-After` de um 429), o atraso é o do SERVIDOR, não o exponencial
 *      — limitado pelo `maxDelayMs` da política (ver backoff.ts).
 *   3. TIMEOUT OBRIGATÓRIO por etapa (`req.timeoutMs`): uma etapa travada
 *      nunca segura a onda — o slot do semáforo é liberado no `finally` e a
 *      etapa travada é REJEITADA com erro estruturado (LLM_STAGE_TIMEOUT),
 *      sem retry (retentar uma etapa que pendurou é segurar o slot de novo).
 *   4. CACHE por chave sha256 (llmCache.ts), opcional por configuração
 *      (presença do store = ligado). A chave é função da ENTRADA — o effort
 *      EFETIVO entra nela (`'max'` explícito == omissão).
 *   5. USAGE agregado POR ETAPA: prompt/completion tokens acumulados por
 *      etapa e expostos no retorno de cada chamada e via getStageUsage.
 *   6. LOG sempre sanitizado por `renderSanitizedBodyFragment` (importado do
 *      llmClient) — a chave de API NUNCA aparece em log nem em erro.
 *
 * MODELO E RACIOCÍNIO: o default de modelo é `OPENROUTER_MODEL.id`
 * (`@shared/llm/constants` — contrato congelado do provedor). O esforço de
 * raciocínio é opcional por etapa (`reasoningEffort`): quando o chamador não
 * pede nada, o transporte NÃO envia o campo e o cliente aplica o máximo
 * (`'max'`, mandatório neste modelo).
 *
 * API key: resolvida UMA vez por execução e memoizada (primeira chamada
 * resolve e cacheia; resolução vazia/que lançou vira KEY_MISSING
 * determinístico nas chamadas seguintes). Keyless nunca chega à rede.
 *
 * Limite declarado: este pacote NÃO valida o tamanho da saída (a regra
 * "toda saída de agente cabe em 2.000 tokens; acima disso é REJEITADO, nunca
 * truncado" — §7/§4.1 — é dos consumidores de etapa, que conhecem o schema).
 * O transporte devolve o conteúdo INTACTO, sem truncar e sem reclamar.
 *
 * INV-01: `chatCompletion` só pode ser referenciado DENTRO deste arquivo em
 * todo `app/electron/main/engine/` — a engine inteira importa só `callLlm`
 * (grep gate do plano).
 */

import { createCallLlmTransport } from './callLlmTransport';
import type { CallLlmDeps, EngineLlm } from './callLlmTypes';

// ─── códigos, tipos e erro estruturado (callLlmTypes.ts) ─────────────────────
export {
  LLM_TRANSPORT_CODES,
  LlmStageError,
  type LlmTransportCode,
  type LlmStageErrorCode,
  type LlmStageErrorOptions,
  type LlmCallRequest,
  type StageUsage,
  type LlmCallResult,
  type EngineLlm,
  type CallLlmDeps,
} from './callLlmTypes';

/**
 * A fábrica do transporte único (P-01/A-P01-3 — fake nos testes, sem rede).
 * A invocação do cliente é ligada AQUI e injetada no núcleo
 * (`callLlmTransport.ts`): é ESTE o ponto do invariante INV-01 (literal
 * acima) — a referência real vive só neste arquivo, e o núcleo não nomeia o
 * método do cliente. Semântica preservada: mesma chamada de método, no mesmo
 * cliente injetado, no mesmo ponto do laço de tentativas.
 */
export function createCallLlm(deps: CallLlmDeps): EngineLlm {
  return createCallLlmTransport({
    ...deps,
    invocarChat: (req) => deps.client.chatCompletion(req),
  });
}
