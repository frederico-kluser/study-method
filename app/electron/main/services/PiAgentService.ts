/**
 * electron/main/services/PiAgentService.ts — núcleo da integração com o
 * Pi Coding Agent (instalação PRÓPRIA deste projeto).
 *
 * Adaptado do padrão de /home/ondokai/Projects/ondokai/monorepo/poc/electron-huu
 * (PiAgentService.ts), com as diferenças obrigatórias desta onda:
 *
 * 1. Devolve uma INSTÂNCIA via `createPiAgentService(deps?)` — os loaders do
 *    SDK (`loadPiAi`/`loadPiCodingAgent`) e o auth bridge são INJETÁVEIS para
 *    teste. O default usa os imports dinâmicos reais e o singleton do bridge.
 * 2. Para provider 'deepseek' SEMPRE resolve o Model explícito
 *    (buildDeepSeekModelObject) — o SDK NUNCA escolhe um default.
 * 3. setRuntimeApiKey('deepseek', key) ANTES de createAgentSession.
 * 4. Temperatura 0 forçada via wrap do `agentSession.agent.streamFn`
 *    (critério piModelSupportsTemperature).
 * 5. Streaming via subscribe (message_update/text_delta|thinking_delta,
 *    tool_execution_start/update/end, turn_start/end, agent_end) → PiStreamEvent.
 * 6. Promise.race com timeout (PI_DEFAULTS.timeout 300000).
 * 7. activeSessions + abort(sessionId)/abortAll()/dispose().
 *
 * O 'electron' não é importado aqui; os handlers IPC chamam este serviço.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  PiExecuteRequest,
  PiExecuteResult,
  PiStreamEvent,
} from '@shared/ipc-contract';
import { PI_DEFAULTS } from '@shared/piAgent/constants';
import {
  buildDeepSeekModelObject,
  mapWorkflowProviderToPi,
  piModelSupportsTemperature,
  type PiModelObject,
} from './piProviderMapper';
import { getPiAuthBridge, type PiAuthBridge } from './piAuthBridge';

/** Tipos que usamos do SDK pi (cast para evitar acoplar aos .d.ts nos testes). */
type PiCodingAgentModule = {
  createAgentSession: any;
  SessionManager: any;
  createCodingTools: any;
  createReadTool: any;
  AuthStorage: any;
  ModelRegistry: any;
};
type PiAiModule = { getModel: any };

export interface PiAgentServiceDeps {
  /** Lazy loader do @mariozechner/pi-ai (testável). Default: dynamic import real. */
  loadPiAi?: () => Promise<PiAiModule>;
  /** Lazy loader do @mariozechner/pi-coding-agent (testável). Default: dynamic import real. */
  loadPiCodingAgent?: () => Promise<PiCodingAgentModule>;
  /** Auth bridge (testável). Default: getPiAuthBridge(). */
  getAuthBridge?: () => Promise<PiAuthBridge>;
}

export interface PiAgentService {
  execute(
    request: PiExecuteRequest,
    onEvent?: (event: PiStreamEvent) => void
  ): Promise<PiExecuteResult>;
  abort(sessionId: string): void;
  abortAll(): void;
  dispose(): Promise<void>;
}

function defaultLoadPiAi(): Promise<PiAiModule> {
  return import('@mariozechner/pi-ai');
}
function defaultLoadPiCodingAgent(): Promise<PiCodingAgentModule> {
  return import('@mariozechner/pi-coding-agent');
}

/** Cria a instância do serviço. Toda mutação de estado fica na closure. */
export function createPiAgentService(deps: PiAgentServiceDeps = {}): PiAgentService {
  const loadPiAi = deps.loadPiAi ?? defaultLoadPiAi;
  const loadPiCodingAgent = deps.loadPiCodingAgent ?? defaultLoadPiCodingAgent;
  const getAuthBridge = deps.getAuthBridge ?? getPiAuthBridge;

  // Módulos lazy (SDK).
  let piSdkLoaded = false;
  let createAgentSession: any;
  let SessionManager: any;
  let createCodingTools: any;
  let createReadTool: any;
  let AuthStorage: any;
  let ModelRegistry: any;
  let getModel: any;

  // Sessões ativas (para abort).
  const activeSessions = new Map<string, { session: any; aborted: boolean }>();

  function generateSessionId(): string {
    return `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createTempWorkspace(): string {
    const dir = path.join(os.tmpdir(), PI_DEFAULTS.tempDirPrefix, `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function emitEvent(
    callback: ((event: PiStreamEvent) => void) | undefined,
    event: { type: string; [key: string]: unknown }
  ): void {
    if (!callback) return;
    callback({ ...event, timestamp: Date.now() } as unknown as PiStreamEvent);
  }

  async function ensurePiSdk(): Promise<boolean> {
    if (piSdkLoaded) return true;
    try {
      const piCodingAgent = await loadPiCodingAgent();
      createAgentSession = piCodingAgent.createAgentSession;
      SessionManager = piCodingAgent.SessionManager;
      createCodingTools = piCodingAgent.createCodingTools;
      createReadTool = piCodingAgent.createReadTool;
      AuthStorage = piCodingAgent.AuthStorage;
      ModelRegistry = piCodingAgent.ModelRegistry;

      const piAi = await loadPiAi();
      getModel = piAi.getModel;

      piSdkLoaded = true;
      console.log('[PiAgentService] Pi SDK loaded successfully');
      return true;
    } catch (error) {
      console.error('[PiAgentService] Failed to load Pi SDK — dependencies may not be installed:', error);
      return false;
    }
  }

  async function execute(
    request: PiExecuteRequest,
    onEvent?: (event: PiStreamEvent) => void
  ): Promise<PiExecuteResult> {
    const startTime = Date.now();
    const sessionId = generateSessionId();

    emitEvent(onEvent, { type: 'status_change', data: sessionId, status: 'starting' });

    // SDK availability.
    const sdkAvailable = await ensurePiSdk();
    if (!sdkAvailable) {
      return {
        success: false,
        output: '',
        error: 'Pi SDK not available. Install dependencies: @mariozechner/pi-coding-agent',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const workflowProvider = request.modelConfig.provider;
    const piProvider = mapWorkflowProviderToPi(workflowProvider);

    // Auth: apenas 'deepseek' é provider remoto com chave. Desnecessário para
    // providers sem chave (não há local/ollama nesta app hoje).
    const authBridge = await getAuthBridge();
    const apiKey = await authBridge.getApiKey(piProvider);
    if (!apiKey) {
      return {
        success: false,
        output: '',
        error: `No API key configured for provider: ${workflowProvider}. Configure it in Settings.`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Working directory.
    const workDir = request.workingDirectory || createTempWorkspace();
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    let agentSession: any = null;
    let output = '';

    try {
      // AuthStorage — o SDK usa para resolver chaves. Prioridade: runtime override.
      const authStorage = AuthStorage.create();
      authStorage.setRuntimeApiKey(piProvider, apiKey);

      // Env vars de fallback.
      const envVars = await authBridge.getEnvVars(piProvider);
      for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
      }

      // Model EXPLÍCITO. Para 'deepseek' SEMPRE o objeto da app (buildDeepSeekModelObject)
      // — nunca deixamos o SDK escolher um default, senão o modelo errado roda.
      let model: PiModelObject | unknown;
      const modelRegistry = ModelRegistry.inMemory(authStorage);
      if (piProvider === 'deepseek') {
        model = buildDeepSeekModelObject(apiKey);
      } else {
        model = getModel(piProvider, request.modelConfig.model)
          || modelRegistry.find(piProvider, request.modelConfig.model);
        if (!model) {
          console.warn(`[PiAgentService] Model not found in catalog: ${piProvider}/${request.modelConfig.model}; SDK will use defaults`);
        }
      }

      // Skill system prompt (injetado no prompt, se presente).
      const skillPrompt = request.skillSystemPrompt || '';

      // Configuração da sessão. Usamos o toolset de coding completo.
      const sessionConfig: any = {
        model: model || undefined,
        cwd: workDir,
        tools: createCodingTools(workDir),
        sessionManager: SessionManager.inMemory(),
        authStorage,
        modelRegistry,
      };

      if (request.modelConfig.thinkingLevel && request.modelConfig.thinkingLevel !== 'off') {
        sessionConfig.thinkingLevel = request.modelConfig.thinkingLevel;
      }

      // createAgentSession retorna { session } — desestruturar.
      const created = await createAgentSession(sessionConfig);
      agentSession = created.session;
      activeSessions.set(sessionId, { session: agentSession, aborted: false });

      // Força temperatura 0 em execuções determinísticas (implementação do electron-huu).
      try {
        const baseStreamFn = agentSession.agent?.streamFn;
        if (typeof baseStreamFn === 'function') {
          agentSession.agent.streamFn = (
            streamModel: { provider?: unknown; reasoning?: unknown } | null | undefined,
            streamContext: unknown,
            streamOptions?: Record<string, unknown>
          ) =>
            baseStreamFn(
              streamModel,
              streamContext,
              piModelSupportsTemperature(streamModel)
                ? { ...streamOptions, temperature: 0 }
                : streamOptions
            );
        }
      } catch (streamFnError) {
        console.warn('[PiAgentService] Could not enforce temperature 0:', streamFnError);
      }

      // 'running' carrega o sessionId nos data (ASSIM como o 'starting'). A UI
      // guarda `ev.data` em TODO status_change para usar no abort; antes o data
      // era a string 'running' e SOBRESCREVIA o sessionId → abort('running')
      // não achava a sessão (BLOCK 2). Nenhum consumidor lê data === 'running'.
      emitEvent(onEvent, { type: 'status_change', data: sessionId, status: 'running' });

      // Streaming.
      agentSession.subscribe((event: any) => {
        if (!onEvent) return;
        switch (event.type) {
          case 'message_update':
            if (event.assistantMessageEvent?.type === 'text_delta') {
              const delta = event.assistantMessageEvent.delta || '';
              output += delta;
              emitEvent(onEvent, { type: 'text_delta', data: delta });
            } else if (event.assistantMessageEvent?.type === 'thinking_delta') {
              emitEvent(onEvent, { type: 'thinking_delta', data: event.assistantMessageEvent.delta || '' });
            }
            break;
          case 'tool_execution_start':
            emitEvent(onEvent, { type: 'tool_start', data: event.toolName || '', toolName: event.toolName });
            break;
          case 'tool_execution_update':
            // v0.64.0 carrega o progresso em `partialResult`; manter fallback `content`.
            emitEvent(onEvent, {
              type: 'text_delta',
              data: event.partialResult?.content?.[0]?.text
                || event.content
                || '',
              toolName: event.toolName,
            });
            break;
          case 'tool_execution_end':
            emitEvent(onEvent, { type: 'tool_end', data: event.toolName || '', toolName: event.toolName });
            break;
          case 'turn_start':
            emitEvent(onEvent, { type: 'turn_start' });
            break;
          case 'turn_end':
            emitEvent(onEvent, { type: 'turn_end' });
            break;
          case 'agent_end':
            emitEvent(onEvent, { type: 'agent_end' });
            break;
        }
      });

      // Prompt completo: skill prefix + prompt do usuário.
      let fullPrompt = request.prompt;
      if (skillPrompt) {
        fullPrompt = `${skillPrompt}\n\n---\n\n${fullPrompt}`;
      }
      if (request.additionalContext) {
        fullPrompt = `${request.additionalContext}\n\n${fullPrompt}`;
      }

      // Execute com timeout (prompt() retorna Promise<void>; output acumulado no subscribe).
      const timeout = request.timeout || PI_DEFAULTS.timeout;
      let timeoutHandle: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          agentSession.prompt(fullPrompt),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
          }),
        ]);
      } finally {
        // Crucial: cancela o timer do timeout para não vazar um handle que
        // mantém o processo vivo (ex.: 5 min quando o prompt terminou antes).
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }

      const sessionState = activeSessions.get(sessionId);
      if (sessionState?.aborted) {
        return {
          success: false,
          output: '',
          error: 'Execution aborted by user',
          executionTimeMs: Date.now() - startTime,
        };
      }

      emitEvent(onEvent, { type: 'status_change', data: 'completed', status: 'completed' });

      return {
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      emitEvent(onEvent, { type: 'error', data: errorMsg });
      emitEvent(onEvent, { type: 'status_change', data: 'error', status: 'error' });
      return {
        success: false,
        output,
        error: errorMsg,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      if (agentSession) {
        try {
          agentSession.dispose();
        } catch (disposeError) {
          console.error('[PiAgentService] Error disposing session:', disposeError);
        }
      }
      activeSessions.delete(sessionId);
    }
  }

  function abort(sessionId: string): void {
    const sessionState = activeSessions.get(sessionId);
    if (sessionState) {
      sessionState.aborted = true;
      sessionState.session.abort?.().catch((error: any) => {
        console.error('[PiAgentService] Error aborting session:', error);
      });
    }
  }

  function abortAll(): void {
    for (const [sessionId, sessionState] of activeSessions) {
      if (!sessionState.aborted) {
        sessionState.aborted = true;
        sessionState.session.abort?.().catch((error: any) => {
          console.error(`[PiAgentService] Error aborting session ${sessionId}:`, error);
        });
      }
    }
  }

  async function dispose(): Promise<void> {
    for (const [id, state] of activeSessions) {
      try {
        state.session.dispose?.();
      } catch (error) {
        console.error(`[PiAgentService] Error disposing session ${id}:`, error);
      }
    }
    activeSessions.clear();
  }

  return { execute, abort, abortAll, dispose };
}