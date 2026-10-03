/**
 * src/storybook/fixtures.settings.ts — fixtures DAS ÁREAS Settings/Roadmap/
 * Home/Gate (STORY-SPEC §7).
 *
 * O `fixtures.ts` partilhado é dono dos fixtures GLOBAIS (e é proibido de
 * editar); este ficheiro só cobre as VARIANTES que as stories destas vistas
 * precisam e os ajudas de seeding/isolação:
 *  - variantes de estado (chaves por validar/inválidas, gate blocked/offline,
 *    hardware sem VRAM, ticks de download, lista de trilhas vazia/quebrada);
 *  - re-export do que já existe partilhado (para as stories terem UM ponto de
 *    import);
 *  - `resetAreaStores()` — o estado de módulo destas áreas (panelCache,
 *    roadmapNav, pendingSubject, lastLesson) não vaza entre stories.
 */
import { getI18n } from 'react-i18next';
import { fixtureTrackOrphans } from './fixtures';
import type {
  DownloadProgress,
  TrackOrphanEntry,
  HardwareInfo,
  KeysStatus,
  StartupStatus,
  TrackListResult,
  ValidationResult,
} from '../../shared/ipc-contract';
import { __resetLastLessonForTests } from '../lib/lastLesson';
import { __resetRoadmapNavForTests } from '../lib/roadmapNav';
import { drainPendingTrackSlug } from '../lib/pendingSubject';
import { clearPanelCache } from '../views/SettingsView/panelCache';

/**
 * Tradutor para as props `tI` dos blocos puros (as stories não são views: não
 * chamam `useTranslation`, recebem a função). Usa a instância i18n global que o
 * preview inicializa (`initI18n('pt-BR')`); antes disso devolve a própria chave.
 */
export const fixtureT = (key: string, options?: Record<string, string | number>): string => {
  const instance = getI18n();
  if (!instance) return key;
  const t = instance.t as unknown as (
    k: string,
    o?: Record<string, string | number>,
  ) => string;
  return t(key, options);
};

// ─── Re-export do partilhado (um único ponto de import para as stories) ─────
export {
  fixtureDownloadProgress,
  fixtureHardwareInfo,
  fixtureKeysStatus,
  fixtureLocalModels,
  fixtureSettings,
  fixtureStartupStatus,
  fixtureSubjectTopics,
  fixtureTrackDetail,
  fixtureTrackEntries,
  fixtureTrackList,
  fixtureTrackModules,
  fixtureTrackOrphans,
  fixtureValidationBrave,
  fixtureValidationLlm,
} from './fixtures';

// ─── Chaves de API ──────────────────────────────────────────────────────────

/** Só a OpenRouter configurada (o setup ainda não terminou). */
export const settingsKeysStatusMissingBrave: KeysStatus = {
  llmConfigured: true,
  braveConfigured: false,
  llmValidated: true,
  braveValidated: false,
};

/** Nenhuma chave configurada (primeira instalação). */
export const settingsKeysStatusEmpty: KeysStatus = {
  llmConfigured: false,
  braveConfigured: false,
  llmValidated: false,
  braveValidated: false,
};

/** Veredito NEGATIVO da validação (401 — o provedor recusou a chave). */
export const settingsValidationInvalid: ValidationResult = {
  isValid: false,
  provider: 'openrouter',
  errorMessage: 'HTTP 401: chave recusada pelo provedor.',
  checkedAt: '2026-01-05T10:00:00.000Z',
};

/** Veredito negativo da validação do Brave (formato errado). */
export const settingsValidationInvalidBrave: ValidationResult = {
  isValid: false,
  provider: 'brave',
  errorMessage: 'Formato de chave inválido (esperado BSA…).',
  checkedAt: '2026-01-05T10:00:00.000Z',
};

// ─── Gate de arranque (fases reais de gate/startupState.ts) ─────────────────

export const settingsStartupChecking: StartupStatus = {
  phase: 'checking',
  llm: { configured: true, valid: true },
  brave: { configured: true, valid: true },
  offline: false,
  checkedAt: '2026-01-05T10:00:00.000Z',
};

/** Setup obrigatório: chave Brave sem configurar. */
export const settingsStartupBlocked: StartupStatus = {
  phase: 'blocked',
  llm: { configured: true, valid: true },
  brave: { configured: false, valid: false },
  offline: false,
  checkedAt: '2026-01-05T10:00:00.000Z',
};

/** Chaves configuradas mas INVÁLIDAS (W1: mensagem por estado). */
export const settingsStartupBlockedInvalidKeys: StartupStatus = {
  phase: 'blocked',
  llm: { configured: true, valid: false, error: 'HTTP 401: chave recusada pelo provedor.' },
  brave: { configured: true, valid: true },
  offline: false,
  checkedAt: '2026-01-05T10:00:00.000Z',
};

/** Offline: ambas configuradas, ambas falharam por rede. */
export const settingsStartupOffline: StartupStatus = {
  phase: 'offline',
  llm: { configured: true, valid: true },
  brave: { configured: true, valid: true },
  offline: true,
  checkedAt: '2026-01-05T10:00:00.000Z',
};

export const settingsStartupReady: StartupStatus = {
  phase: 'ready',
  llm: { configured: true, valid: true },
  brave: { configured: true, valid: true },
  offline: false,
  checkedAt: '2026-01-05T10:00:00.000Z',
};

// ─── IA local ───────────────────────────────────────────────────────────────

/** Hardware sem VRAM reportada (o campo mostra `localAi.notDetermined`). */
export const settingsHardwareNoVram: HardwareInfo = {
  backend: 'cpu',
  ramGb: 15.6,
  vramGb: null,
  cpuModel: 'AMD Ryzen 7 7840HS com gráficos Radeon 780M',
};

/** CPU com nome comprido (teste de overflow do cartão de hardware). */
export const settingsHardwareCpuLongo: HardwareInfo = {
  backend: 'cuda',
  ramGb: 63.6,
  vramGb: 23.9,
  cpuModel:
    'Intel(R) Xeon(R) Platinum 8480+ (56 cores, 112 threads, 2.00 GHz, 105 MB de cache L3, suporte a AVX-512)',
};

/**
 * Ticks do canal `localAi.onDownloadProgress` (o `emitMockEvent` das stories):
 * `iniciado` → `meio` → `feito`; `falhou` é o caminho de erro (W19).
 */
export const settingsDownloadTicks: Record<
  'iniciado' | 'meio' | 'feito' | 'falhou',
  DownloadProgress
> = {
  iniciado: {
    modelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q5_K_M',
    transferredBytes: 120_586_240,
    totalBytes: 4_672_532_874,
    percent: 3,
    speedBps: 24_000_000,
    done: false,
  },
  meio: {
    modelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q5_K_M',
    transferredBytes: 2_336_266_437,
    totalBytes: 4_672_532_874,
    percent: 50,
    speedBps: 31_500_000,
    done: false,
  },
  feito: {
    modelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q5_K_M',
    transferredBytes: 4_672_532_874,
    totalBytes: 4_672_532_874,
    percent: 100,
    speedBps: 0,
    done: true,
  },
  falhou: {
    modelId: 'LiquidAI/LFM2.5-8B-A1B-GGUF:Q5_K_M',
    transferredBytes: 2_336_266_437,
    totalBytes: 4_672_532_874,
    percent: 50,
    speedBps: 0,
    done: true,
    error: 'Ligação interrompida (ECONNRESET).',
  },
};

/** Lista de resquícios já estreitada (o envelope partilhado é uma união). */
export const settingsOrphansList: TrackOrphanEntry[] = fixtureTrackOrphans.ok
  ? fixtureTrackOrphans.orphans
  : [];

// ─── Trilhas (variantes do partilhado) ─────────────────────────────────────

/** `track:list` vazio — "nenhuma trilha instalada" (estado legítimo, ONDA9). */
export const settingsTrackListEmpty: TrackListResult = { ok: true, tracks: [] };

/** `track:list` com falha REAL do repositório (erro com retry). */
export const settingsTrackListFailed: TrackListResult = {
  ok: false,
  error: 'repositório de trilhas indisponível (resources/tracks ilegível).',
};

// ─── Isolação entre stories ─────────────────────────────────────────────────

/**
 * Zera o estado de MÓDULO destas áreas entre stories (panelCache SWR,
 * roadmapNav, pendingSubject, lastLesson) — uma história não herda o primeiro
 * paint nem a navegação da anterior.
 */
export function resetAreaStores(): void {
  clearPanelCache();
  __resetRoadmapNavForTests();
  drainPendingTrackSlug();
  __resetLastLessonForTests();
}
