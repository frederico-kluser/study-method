/**
 * shared/constants/localModels.ts — catálogo de modelos GGUF embarcados.
 *
 * Fonte única de verdade entre o main (download/load/recomendação) e o
 * renderer (painel Local AI). Cada entrada é um (modelo, quantização) concreto
 * com id estável "<hfRepo>:<quant>", o mesmo usado como chave no índice em
 * disco do modelStore e no node-llama-cpp model URI (`hf:<repo>:<quant>`).
 *
 * Estrutura espelhada de localModels.constants.ts do electron-huu (compatível
 * com o contrato congelado LocalModelInfo de shared/ipc-contract.ts), mantida
 * MÍNIMA para o motor embarcado do study-method.
 */
import type { HardwareInfo, LocalModelInfo } from '../ipc-contract';

export type LocalModelQuant = 'Q4_K_M' | 'Q5_K_M';

/** Entrada do catálogo — modelo + quantização concretos. */
export interface LocalModelEntry {
  /** Id estável "<hfRepo>:<quant>" (também a chave no índice em disco). */
  id: string;
  /** Repositório Hugging Face (org/repo) que hospeda os GGUFs. */
  hfRepo: string;
  /** Quantização GGUF. */
  quant: LocalModelQuant;
  /** Rótulo curto para a UI (ex.: "LFM2.5-8B-A1B (Q4_K_M)"). */
  label: string;
  /** Quantização GGUF (compatível com LocalModelInfo.quant). */
  name: LocalModelQuant;
  /** Nome do arquivo GGUF no repo (ex.: "LFM2.5-8B-A1B-Q4_K_M.gguf"). */
  filename: string;
  /** Tamanho aproximado em disco, GB. */
  approxSizeGB: number;
  /** Contexto nativo (treinado) em tokens. */
  nativeContextTokens: number;
  /** Contexto default ao carregar (limito a 16K — bug LFM2 MoE llama.cpp#16491). */
  defaultContextSize: number;
  /** RAM mínima usável (GB). */
  minRamGB: number;
  /** RAM confortável (GB). */
  recommendedRamGB: number;
  /** node-llama-cpp model URI (offline quando o arquivo já está em disco). */
  modelUri: string;
  /** Total de parâmetros (bilhões). */
  paramsB: number;
  /** Se passou no barramento de agente (tool-calling). */
  agentReady: boolean;
  /** Default de primeira execução (uma entrada total). */
  isDefault?: boolean;
  /** Fallback low-RAM (uma entrada total). */
  isSmallFallback?: boolean;
  /** Default do grupo (quantização pré-selecionada do modelo). */
  isGroupDefault?: boolean;
}

/** Quantização default do grupo para cada modelo da tabela abaixo. */
const DEFAULT_QUANT: Record<string, LocalModelQuant> = {
  'LiquidAI/LFM2.5-8B-A1B-GGUF': 'Q4_K_M',
  'LiquidAI/LFM2-1.2B-GGUF': 'Q4_K_M',
};

const PARAMS_B: Record<string, number> = {
  'LiquidAI/LFM2.5-8B-A1B-GGUF': 8.3,
  'LiquidAI/LFM2-1.2B-GGUF': 1.2,
};

const NATIVE_CONTEXT: Record<string, number> = {
  'LiquidAI/LFM2.5-8B-A1B-GGUF': 131072,
  'LiquidAI/LFM2-1.2B-GGUF': 131072,
};

/** Agent-ready: modelos que o barramento de agente pode usar com tool-calling. */
const AGENT_READY_REPO: Record<string, boolean> = {
  'LiquidAI/LFM2.5-8B-A1B-GGUF': true,
  'LiquidAI/LFM2-1.2B-GGUF': true,
};

/** Nome-base do arquivo GGUF por repo (o quant é sufixado). */
const FILE_BASE: Record<string, string> = {
  'LiquidAI/LFM2.5-8B-A1B-GGUF': 'LFM2.5-8B-A1B',
  'LiquidAI/LFM2-1.2B-GGUF': 'LFM2-1.2B',
};

/** Rótulo-base por repo. */
const LABEL_BASE: Record<string, string> = {
  'LiquidAI/LFM2.5-8B-A1B-GGUF': 'LFM2.5-8B-A1B',
  'LiquidAI/LFM2-1.2B-GGUF': 'LFM2-1.2B',
};

/** Build um node-llama-cpp `hf:` URI a partir de repo + quant. */
export function buildModelUri(hfRepo: string, quant: LocalModelQuant): string {
  return `hf:${hfRepo}:${quant}`;
}

/** Build o id estável do catálogo a partir de repo + quant. */
export function buildModelId(hfRepo: string, quant: LocalModelQuant): string {
  return `${hfRepo}:${quant}`;
}

/** Desenha a entrada de catálogo de um (repo, quant) a partir das tabelas-base. */
function makeEntry(hfRepo: string, quant: LocalModelQuant, sizeGB: number, ram: [number, number]): LocalModelEntry {
  const isGroupDefault = DEFAULT_QUANT[hfRepo] === quant;
  return {
    id: buildModelId(hfRepo, quant),
    hfRepo,
    quant,
    label: `${LABEL_BASE[hfRepo]} (${quant})`,
    name: quant,
    filename: `${FILE_BASE[hfRepo]}-${quant}.gguf`,
    approxSizeGB: sizeGB,
    nativeContextTokens: NATIVE_CONTEXT[hfRepo],
    defaultContextSize: 16384,
    minRamGB: ram[0],
    recommendedRamGB: ram[1],
    modelUri: buildModelUri(hfRepo, quant),
    paramsB: PARAMS_B[hfRepo],
    agentReady: AGENT_READY_REPO[hfRepo],
    isGroupDefault,
  };
}

/**
 * Catálogo curado — 3 entradas (2 quantizações do LFM2.5-8B-A1B + o fallback
 * LFM2-1.2B Q4_K_M):
 *  - LFM2.5-8B-A1B Q4_K_M  → isDefault + agentReady (~5.2 GB)
 *  - LFM2.5-8B-A1B Q5_K_M  → mais uma quantização (~5.8 GB)
 *  - LFM2-1.2B Q4_K_M      → isSmallFallback + agentReady (~1 GB)
 */
export const LOCAL_MODEL_CATALOG: LocalModelEntry[] = [
  makeEntry('LiquidAI/LFM2.5-8B-A1B-GGUF', 'Q4_K_M', 5.2, [6, 10]),
  makeEntry('LiquidAI/LFM2.5-8B-A1B-GGUF', 'Q5_K_M', 5.8, [8, 12]),
  makeEntry('LiquidAI/LFM2-1.2B-GGUF', 'Q4_K_M', 1.0, [2, 4]),
];

// Marcação de default/fallback às entradas certas (uma de cada).
LOCAL_MODEL_CATALOG[0].isDefault = true;
LOCAL_MODEL_CATALOG[2].isSmallFallback = true;

/** A entrada default de primeira execução (LFM2.5-8B-A1B Q4_K_M). */
export const DEFAULT_LOCAL_MODEL: LocalModelEntry =
  LOCAL_MODEL_CATALOG.find((m) => m.isDefault) ?? LOCAL_MODEL_CATALOG[0];

/** A entrada de fallback low-RAM (LFM2-1.2B Q4_K_M). */
export const SMALL_FALLBACK_LOCAL_MODEL: LocalModelEntry =
  LOCAL_MODEL_CATALOG.find((m) => m.isSmallFallback) ?? LOCAL_MODEL_CATALOG[0];

/** Retorna a entrada do catálogo pelo id ("<repo>:<quant>"); undefined se ausente. */
export function getLocalModelById(id: string | undefined): LocalModelEntry | undefined {
  if (!id) return undefined;
  return LOCAL_MODEL_CATALOG.find((m) => m.id === id);
}

/** Retorna a entrada default de primeira execução. */
export function getDefaultLocalModel(): LocalModelEntry {
  return DEFAULT_LOCAL_MODEL;
}

/** Retorna a entrada de fallback low-RAM. */
export function getSmallFallbackModel(): LocalModelEntry {
  return SMALL_FALLBACK_LOCAL_MODEL;
}

/**
 * Seleciona o catálogo mais adequado ao hardware detectado (heurística simples
 * e determinística, compartilhada com o renderer):
 *  - VRAM ≥ 6 GB  → melhor qualidade disponível (Q5_K_M do LFM2.5-8B);
 *  - RAM ≥ 14 GB  → LFM2.5-8B-A1B Q4_K_M (default);
 *  - senão        → fallback LFM2-1.2B Q4_K_M.
 *
 * Sempre devolve entradas do catálogo; nunca lança.
 */
export function catalogFor(hw: HardwareInfo): LocalModelEntry[] {
  const vram = hw.vramGb ?? 0;
  if (vram >= 6) {
    const high = getLocalModelById(buildModelId('LiquidAI/LFM2.5-8B-A1B-GGUF', 'Q5_K_M'));
    return high ? [high, ...LOCAL_MODEL_CATALOG.filter((m) => m.id !== high.id)] : LOCAL_MODEL_CATALOG;
  }
  if (hw.ramGb >= 14) {
    const def = getDefaultLocalModel();
    return [def, ...LOCAL_MODEL_CATALOG.filter((m) => m.id !== def.id)];
  }
  const small = getSmallFallbackModel();
  return [small, ...LOCAL_MODEL_CATALOG.filter((m) => m.id !== small.id)];
}

/**
 * Converte uma entrada do catálogo para o tipo exposto ao renderer
 * (LocalModelInfo), mesclando estado de download/ativação quando informado.
 * convenience para o modelStore list().
 */
export function toLocalModelInfo(
  entry: LocalModelEntry,
  state?: { downloaded?: boolean; active?: boolean; recommended?: boolean; sizeBytes?: number },
): LocalModelInfo {
  return {
    id: entry.id,
    label: entry.label,
    hfRepo: entry.hfRepo,
    filename: entry.filename,
    quant: entry.quant,
    sizeBytes: state?.sizeBytes ?? Math.round(entry.approxSizeGB * 1024 ** 3),
    recommended: state?.recommended ?? false,
    active: state?.active ?? false,
    downloaded: state?.downloaded ?? false,
    agentReady: entry.agentReady,
  };
}