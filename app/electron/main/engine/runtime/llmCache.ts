/**
 * app/electron/main/engine/runtime/llmCache.ts — artefato em disco por chave
 * sha256 do transporte único de LLM (P-01, `docs/16-engine-de-trilha.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * temperature:0 NÃO é determinístico. O cache é o ÚNICO caminho para
 * reprodutibilidade: duas execuções com a mesma entrada podem devolver
 * conteúdo diferente do provedor; quem precisa do MESMO artefato de novo usa
 * o cache, não a temperatura. Por isso o cache é função PURA da entrada
 * (ver `cacheKeyFor` abaixo) e a invalidação é SÓ explícita — a chave nunca
 * expira por tempo, nunca é invalidada por schema, e o único jeito de forçar
 * nova ida ao provedor é bumpar `stageVersion`, chamar `delete`/`clear`, ou
 * trocar o store.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Chave = sha256(prompt + system + schema + params + model_id +
 * stage_version), como exige o plano. A serialização é CANÔNICA (chaves de
 * objeto ordenadas, JSON
 * compacto) para que a MESMA entrada em ordens diferentes de chave produza a
 * MESMA chave — caso contrário o cache erraria em silêncio por capricho de
 * inserção. `params` é o lugar do chamador para qualquer coisa que afete a
 * geração (temperatura, formato esperado…): tudo que entrar em `params`
 * entra na chave.
 *
 * Desligável por configuração: o transporte só consulta o cache se receber
 * um `CacheStore` — sem store, cache desligado (ver callLlm.ts). Testes usam
 * a implementação em memória; a engine em produção usa a de disco.
 */

import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

/** Artefato armazenado — o que uma ida bem-sucedida ao provedor produziu. */
export interface LlmCacheEntry {
  content: string;
  model: string;
  /** usage observado QUANDO o artefato foi produzido (não é gasto novo). */
  usage?: { promptTokens: number; completionTokens: number };
  /** ISO timestamp da produção do artefato. */
  createdAt: string;
}

/**
 * Store de cache injetável — em memória (testes) ou disco (produção).
 * Invariante: `get` de chave inexistente devolve `undefined`; falha de IO do
 * store NUNCA derruba o transporte (cache é otimização, não contrato).
 */
export interface CacheStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  /** Invalidação EXPLÍCITA de uma chave. */
  delete(key: string): Promise<void>;
  /** Invalidação EXPLÍCITA de tudo (ex.: de um run inteiro). */
  clear(): Promise<void>;
}

/** Entrada de chave canônica (ver `cacheKeyFor`). */
export interface LlmCacheKeyInput {
  prompt: string;
  /** Prompt de sistema — buildMessages o envia ao provedor, logo entra na chave. */
  system?: string;
  schema?: string;
  params?: Readonly<Record<string, unknown>>;
  modelId?: string;
  stageVersion: string;
}

/** Serializa JSON de forma canônica: chaves ordenadas, compacto, sem espaço. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value ?? '');
  }
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Chave sha256 da entrada. Componentes exatos do plano: prompt + system +
 * schema + params + model_id + stage_version. NÃO inclui `stage`/etapa de
 * propósito: o artefato é função só dos seis componentes, e duas etapas
 * distintas com a entrada idêntica compartilham o artefato correto.
 */
export function cacheKeyFor(input: LlmCacheKeyInput): string {
  const payload = canonicalJson({
    prompt: input.prompt,
    system: input.system ?? '',
    schema: input.schema ?? '',
    params: input.params ?? {},
    modelId: input.modelId ?? '',
    stageVersion: input.stageVersion,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** Stores em memória — testes e cache descartável por execução. */
export function createInMemoryCacheStore(): CacheStore {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
}

/**
 * Store em disco: um arquivo JSON por chave (`<key>.json`) sob `dir`.
 * Escrita atômica (temp + rename): um processo que morre no meio NUNCA deixa
 * arquivo pela metade — cache corrompido silenciaria erros. `envelope` junta
 * o artefato ao `createdAt` externo; `get` valida o envelope antes de
 * devolver (artefato malformado = chave inexistente, nunca exceção).
 */
export function createDiskCacheStore(dir: string): CacheStore {
  return {
    async get(key) {
      try {
        const raw = await fsp.readFile(path.join(dir, `${key}.json`), 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof (parsed as { entry?: unknown }).entry === 'object' &&
          (parsed as { entry?: { content?: unknown } }).entry !== null
        ) {
          const entry = (parsed as { entry: { content?: unknown } }).entry;
          if (typeof entry.content === 'string') return entry;
        }
        return undefined;
      } catch {
        return undefined; // inexistente OU ilegível ⇒ miss silencioso
      }
    },
    async set(key, value) {
      await fsp.mkdir(dir, { recursive: true });
      const envelope = { entry: value, writtenAt: new Date().toISOString() };
      const tmp = path.join(dir, `${key}.json.tmp`);
      await fsp.writeFile(tmp, JSON.stringify(envelope), 'utf8');
      await fsp.rename(tmp, path.join(dir, `${key}.json`));
    },
    async delete(key) {
      await fsp.rm(path.join(dir, `${key}.json`), { force: true });
    },
    async clear() {
      await fsp.rm(dir, { recursive: true, force: true });
    },
  };
}