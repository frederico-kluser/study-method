/**
 * electron/main/services/deepseekLlmJudge.ts — juiz LLM do protocolo REQUEST/APPLY
 * (docs/00-contratos.md §6) sobre o cliente DeepSeek one-shot.
 *
 * Assinatura EXATA de LlmJudge do StudyMethodRunner:
 *   `type LlmJudge = (pedido: StudyRequestEnvelope) => Promise<unknown>`
 * Ele devolve o OBJETO de `items[0]` da RESPOSTA — NUNCA a string nem o envelope.
 * Quem monta o envelope da RESPOSTA {protocol, protocol_version, request_id, kind,
 * items:[<objeto>]} é o PRÓPRIO runner (buildApplyFile), repetindo esses campos
 * IDÊNTICOS ao pedido. O juiz, portanto, NÃO monta envelope: devolve só o corpo.
 *
 * UMA chamada inline one-shot, temperature 0 (determinístico), contrato compatível
 * com o response_schema do pedido. NÃO usa PiAgentService (streamado) nem
 * apiKeyValidator (que só valida) — este é o transporte de julgamento.
 */

import {
  DEEPSEEK_ERROR_CODES,
  DeepSeekError,
  createDeepSeekClient,
  type DeepSeekClient,
} from './deepseekClient';
import type { StudyRequestEnvelope } from './studyMethodRunner';

export interface DeepSeekLlmJudgeDeps {
  /** Resolve a chave DeepSeek sob demanda. Default: '' (⇒ degrada sem rede). */
  getApiKey?: () => Promise<string>;
  /** Cliente injetável (testes isolam o judge do transporte). Default: novo cliente. */
  client?: DeepSeekClient;
  /** Sobrescreve o model (default: DEEPSEEK_MODEL.id no cliente). */
  model?: string;
}

/** Juiz LLM injetável de um pedido REQUEST/APPLY. Devolve o objeto de items[0]. */
export type DeepSeekLlmJudge = (pedido: StudyRequestEnvelope) => Promise<unknown>;

const SYSTEM_PROMPT_PT_BR =
  'Você é o juiz automatizado do tutor study-method. Você recebe um PEDIDO de ' +
  'julgamento estruturado (instruções, schema da resposta e o payload) e deve ' +
  'respondir APENAS com o JSON da resposta, exatamente na forma exigida pelo ' +
  'schema fornecido. Não adicione o envelope do protocolo, não explique fora do ' +
  'JSON, não use markdown: a saída deve ser somente o objeto JSON válido do ' +
  'response_schema. Respostas dentro do vocabulário e dos tipos determinados pelo ' +
  'schema. Textos livres em pt-BR; chaves e valores de enum em inglês snake_case ' +
  'sem acento.';

/** Serrilha a instrução de prompt: resposta apenas com o JSON do schema. */
function buildUserPrompt(pedido: StudyRequestEnvelope): string {
  const parts: string[] = [];

  if (pedido.instructions_pt_br) {
    parts.push(`INSTRUÇÕES:\n${pedido.instructions_pt_br}`);
  }
  if (pedido.response_schema) {
    parts.push(`SCHEMA DA RESPOSTA (produza SÓ o JSON deste schema, sem envelope):\n${pedido.response_schema}`);
  }
  if (pedido.payload !== undefined) {
    parts.push(
      `PAYLOAD DO PEDIDO:\n${typeof pedido.payload === 'string' ? pedido.payload : JSON.stringify(pedido.payload)}`
    );
  }
  parts.push(
    'RESPOSTA: 1) um único objeto JSON válido,  2) aderente ao schema da resposta,  3) sem texto ao redor.'
  );

  return parts.join('\n\n');
}

/**
 * Extrai o primeiro bloco JSON balanceado do content do modelo.
 * Tolera crases (```json ... ```) e texto antes/depois: para cada '{' candidato,
 * varre adiante contando chaves até fechar num objeto balanceado e tenta parsear.
 */
export function extractFirstJsonObject(text: string): unknown {
  const s = (text ?? '').trim();
  if (!s) return undefined;

  // 1) Tenta o texto inteiro (caso já seja JSON puro).
  try {
    const parsed = JSON.parse(s);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // segue.
  }

  // 2) Para cada '{', varre adiante encontrando o bloco { } balanceado e parseia
  //    o trecho — tolera texto/markdown tanto antes quanto depois do JSON.
  for (let start = 0; start < s.length; start++) {
    if (s[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(s.slice(start, i + 1));
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            // trecho entre { } não é JSON válido — tenta o próximo salto.
          }
          break; // encerra a varredura deste '{'
        }
      }
    }
  }
  return undefined;
}

/**
 * Fabrica o juiz LLM DeepSeek.
 *
 * Degradação (sem chave): NÃO lança exceção crua. `handleExit10` do runner NÃO
 * captura throw do juiz, e `buildApplyFile` converte um retorno não-objeto (ex.:
 * `null`) no caminho degradado `applyExhausted: true` sem fabricar dado nenhum —
 * retornamos `null` nesse caso. Demais erros do cliente (chave inválida, rate
 * limit, servidor, rede quando há chave) são re-lançados como DeepSeekError
 * documentado para o chamador decidir, NUNCA expondo a chave.
 */
export function createDeepSeekLlmJudge(deps: DeepSeekLlmJudgeDeps = {}): DeepSeekLlmJudge {
  const client = deps.client ?? createDeepSeekClient({ apiKey: deps.getApiKey });
  const model = deps.model;

  return async function judge(pedido: StudyRequestEnvelope): Promise<unknown> {
    // Sem chave configurada ⇒ degradar sem iris de exceção crua (ver doc acima).
    if (deps.getApiKey) {
      const key = (await deps.getApiKey()).trim();
      if (!key) return null;
    } else if (!deps.client) {
      // Sem getApiKey E sem cliente injetado: não há como alcançar a API.
      return null;
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT_PT_BR },
      { role: 'user', content: buildUserPrompt(pedido) },
    ];

    let raw: { content: string; model: string } | null = null;
    try {
      raw = await client.chatCompletion({ messages, temperature: 0, ...(model ? { model } : {}) });
    } catch (error) {
      // KEY_MISSING é tratável como degradação (sem chave): mesmo com client
      // injetado, se o transporte reclamar de chave ausente, degrada em vez de
      // estourar. Demais erros sobem como estão (runtime real).
      if (error instanceof DeepSeekError && error.code === DEEPSEEK_ERROR_CODES.KEY_MISSING) {
        return null;
      }
      throw error;
    }

    if (!raw || !raw.content) {
      // Transporte devolveu vazio: degradação segura (não inventa resposta).
      return null;
    }

    const parsed = extractFirstJsonObject(raw.content);
    // O runner exige um OBJETO para items[0]. Se o modelo não devolveu JSON
    // objetual, degrada em vez de entregar algo que o buildApplyFile rejeitaria.
    if (parsed === undefined || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  };
}