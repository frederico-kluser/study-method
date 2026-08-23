/**
 * electron/main/ipc/index.ts — registro central de handlers IPC do main.
 *
 * Duas camadas, para testabilidade:
 *
 *  1. `buildIpcRegistry(deps)` — função PURA: devolve `Map<canal, handler>`
 *     sem tocar em electron. Canal→handler é construído a partir dos constantes
 *     do contrato congelado (shared/ipc-contract.ts) — sem strings soltas.
 *  2. `registerIpcHandlers()` — entry real: liga o map ao `ipcMain`.
 *
 * Onda 1 (scaffold): apenas os canais `settings:*` têm handler REAL (backed pelo
 * settingsStore compartilhado). Os canais `study:*`, `pi:*` e `localAi:*`
 * recebem PLACEHOLDER que lança "ainda não implementado" — cada onda futura
 * substitui esses placeholders pelos handlers reais. Os canais `keys:*` NÃO são
 * registrados aqui: são propriedade da onda1-pi (electron/main/ipc/keys-handlers.ts).
 */

import { ipcMain } from 'electron';

import type { AppSettings } from '@shared/ipc-contract';
import {
  LOCAL_AI_CHANNELS,
  PI_CHANNELS,
  SETTINGS_CHANNELS,
  STUDY_CHANNELS,
} from '@shared/ipc-contract';

import { getSettingsStore, type SettingsStore } from '../services/settingsStore';

/** Handler IPC (ignora o evento; args variam por canal). */
export type IpcHandler = (...args: unknown[]) => Promise<unknown> | unknown;

/** Registry canal→handler, devolvido por buildIpcRegistry. */
export type IpcRegistry = Map<string, IpcHandler>;

/** Dependências de buildIpcRegistry (injetadas pelo registro real). */
export interface IpcRegistryDeps {
  getSettings(): Promise<AppSettings>;
  setSettings(settings: AppSettings): Promise<void>;
  /** Onda a citar na mensagem de erro dos placeholders por grupo. */
  groupWave(group: 'study' | 'pi' | 'localAi'): string;
}

/** Cria o handler placeholder que LANÇA "ainda não implementado — chega na onda N". */
export function makeNotImplementedHandler(channel: string, wave: string): IpcHandler {
  return () => {
    throw new Error(`${channel} ainda não implementado — chega na ${wave}`);
  };
}

/**
 * Registra no registry um placeholder que lança. Usado para cobrir os canais
 * de grupos cuja onda ainda não chegou.
 */
export function registerNotYetImplemented(
  registry: IpcRegistry,
  channel: string,
  wave: string,
): void {
  registry.set(channel, makeNotImplementedHandler(channel, wave));
}

/** Lê o subconjunto AppSettings persistido no store (somente chaves presentes). */
export async function readAppSettings(store: Pick<SettingsStore, 'getValue'>): Promise<AppSettings> {
  const out: AppSettings = {};
  const key = await store.getValue<string>('setupsDir');
  if (key !== undefined) out.setupsDir = key;
  const subject = await store.getValue<string>('lastSubject');
  if (subject !== undefined) out.lastSubject = subject;
  const provider = await store.getValue<'deepseek' | 'local'>('defaultModelProvider');
  if (provider !== undefined) out.defaultModelProvider = provider;
  const modelId = await store.getValue<string>('defaultModelId');
  if (modelId !== undefined) out.defaultModelId = modelId;
  return out;
}

/** Persiste o subconjunto AppSettings (somente chaves definidas). */
export async function writeAppSettings(
  store: Pick<SettingsStore, 'setValue'>,
  settings: AppSettings,
): Promise<void> {
  if (settings.setupsDir !== undefined) await store.setValue('setupsDir', settings.setupsDir);
  if (settings.lastSubject !== undefined) await store.setValue('lastSubject', settings.lastSubject);
  if (settings.defaultModelProvider !== undefined) {
    await store.setValue('defaultModelProvider', settings.defaultModelProvider);
  }
  if (settings.defaultModelId !== undefined) {
    await store.setValue('defaultModelId', settings.defaultModelId);
  }
}

/** Grupos que ganham placeholder nesta onda (os demais são registrados por outras ondas). */
const PLACEHOLDER_GROUPS: ReadonlyArray<{ group: 'study' | 'pi' | 'localAi'; channels: Record<string, string> }> = [
  { group: 'pi', channels: PI_CHANNELS },
  { group: 'localAi', channels: LOCAL_AI_CHANNELS },
  { group: 'study', channels: STUDY_CHANNELS },
];

/** Monta o registry puro canal→handler. Só os canais settings:* são reais. */
export function buildIpcRegistry(deps: IpcRegistryDeps): IpcRegistry {
  const registry: IpcRegistry = new Map();

  // settings:* — reais (onda atual).
  registry.set(SETTINGS_CHANNELS.GET, async () => deps.getSettings());
  registry.set(SETTINGS_CHANNELS.SET, async (settings: unknown) => {
    await deps.setSettings(settings as AppSettings);
  });
  registry.set(SETTINGS_CHANNELS.GET_SETUPS_DIR, async () => {
    const s = await deps.getSettings();
    return s.setupsDir ?? '';
  });
  registry.set(SETTINGS_CHANNELS.SET_SETUPS_DIR, async (dir: unknown) => {
    await deps.setSettings({ setupsDir: dir as string });
  });

  // study:* / pi:* / localAi:* — placeholders que lançam (ondas futuras).
  for (const { group, channels } of PLACEHOLDER_GROUPS) {
    const wave = deps.groupWave(group);
    for (const channel of Object.values(channels)) {
      registerNotYetImplemented(registry, channel, wave);
    }
  }

  // keys:* NÃO entram aqui — quem registra é a onda1-pi (keys-handlers.ts).

  return registry;
}

function storeToSettingsDeps(store: SettingsStore): Pick<IpcRegistryDeps, 'getSettings' | 'setSettings'> {
  return {
    getSettings: () => readAppSettings(store),
    setSettings: (settings) => writeAppSettings(store, settings),
  };
}

/** Onda citada nos placeholders de cada grupo não-implementado. */
function defaultGroupWave(group: 'study' | 'pi' | 'localAi'): string {
  switch (group) {
    case 'pi':
      return 'onda 1 (pi)';
    case 'localAi':
      return 'onda de LLM local (local-ai)';
    case 'study':
      return 'onda de estudo (pesquisa/aulas/editor)';
  }
}

/**
 * Entry real: constrói o registry com o settingsStore (lazy, electron) e liga
 * cada canal ao ipcMain.handle. Chamado uma vez em app.whenReady() (e por isso
 * é async — o store carrega o módulo electron sob demanda).
 */
export async function registerIpcHandlers(): Promise<void> {
  const store = await getSettingsStore();
  const registry = buildIpcRegistry({
    ...storeToSettingsDeps(store),
    groupWave: defaultGroupWave,
  });
  for (const [channel, handler] of registry) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}