/**
 * electron/main/services/embeddedLlm/recommend.ts — recomendação de modelo por hardware.
 *
 * Mapeia o HardwareInfo detectado para uma entrada do catálogo. `recommendDefault`
 * é pura e determinística (heurística por VRAM/RAM); `recommendWithFit` é uma
 * variação que, quando tem insights de "cabe ou não" (GgufInsights), desce de
 * quantização se o pick inicial não couber na máquina.
 */
import type { HardwareInfo, LocalModelInfo } from '@shared/ipc-contract';
import {
  LOCAL_MODEL_CATALOG,
  buildModelId,
  getDefaultLocalModel,
  getLocalModelById,
  getSmallFallbackModel,
  toLocalModelInfo,
} from '@shared/constants/localModels';

/** Insight opcional de "cabe ou não" (GgufInsights), injetável para testes. */
export interface FitInsight {
  /** Se o modelo (id) couber na máquina para o contexto desejado. */
  fits: (modelId: string) => boolean;
}

/**
 * Escolhe o modelo default para esta máquina (heurística pura):
 *  - VRAM ≥ 6 GB  → LFM2.5-8B-A1B Q5_K_M (melhor qualidade);
 *  - RAM ≥ 14 GB  → LFM2.5-8B-A1B Q4_K_M (default);
 *  - senão        → LFM2-1.2B Q4_K_M (fallback low-RAM).
 *
 * Devolve um LocalModelInfo (estado de download/ativo falso até o modelStore
 * mesclar o índice).
 */
export function recommendDefault(hw: HardwareInfo): LocalModelInfo {
  const vram = hw.vramGb ?? 0;
  let entry = getDefaultLocalModel();
  if (vram >= 6) {
    entry =
      getLocalModelById(buildModelId('LiquidAI/LFM2.5-8B-A1B-GGUF', 'Q5_K_M')) ?? getDefaultLocalModel();
  } else if (hw.ramGb < 14) {
    entry = getSmallFallbackModel();
  }
  return toLocalModelInfo(entry, { recommended: true });
}

/**
 * Variação com validação de "ﬁt": se `insights` estiver disponível E o pick
 * inicial não couber, desce de quantização (Q5_K_M → Q4_K_M → fallback 1.2B).
 * Sem `insights`, comporta-se igual a `recommendDefault`. O pick final é o de
 * menor peso que ainda couber; se nenhum couber, cai no fallback 1.2B.
 */
export function recommendWithFit(
  hw: HardwareInfo,
  catalog: LocalModelInfo[],
  insights?: FitInsight | null,
): LocalModelInfo {
  const base = recommendDefault(hw);
  if (!insights) return base;

  // Tenta o pick inicial; se couber, usa-o.
  if (insights.fits(base.id)) return base;

  // Senão, desce de quantização: dentre as entradas que couberem, escolhe a de
  // MAIOR peso (não cai qualidade desnecessariamente) que ainda caiba. Ordena
  // descendo por tamanho para devolver a mais "pesada" que encaixa.
  const descending = [...catalog].sort((a, b) => b.sizeBytes - a.sizeBytes);
  const fitting = descending.filter((m) => m.id !== base.id && insights.fits(m.id));
  if (fitting.length > 0) {
    return { ...fitting[0], recommended: true };
  }
  // Nada dos catálogo (além do pick) couber → fallback compacto.
  return toLocalModelInfo(getSmallFallbackModel(), { recommended: true });
}

/** Conveniência: catálogo completo convertido para LocalModelInfo (recomendação marcada). */
export function catalogAsInfo(hw: HardwareInfo | null): LocalModelInfo[] {
  return LOCAL_MODEL_CATALOG.map((entry) =>
    toLocalModelInfo(entry, { recommended: hw ? recommendDefault(hw).id === entry.id : false }),
  );
}