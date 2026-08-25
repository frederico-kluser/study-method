/**
 * electron/main/services/e2eStubs.ts — STUB MODE do harness E2E (Playwright).
 *
 * Ativado quando `process.env.STUDY_METHOD_E2E === '1'`. Substitui os handlers
 * IPC de CHAVES/GATE/PI/STUDY/LOCAL_AI/VOZ por fixtures DETERMINÍSTICAS — nada
 * de rede real (deepseek/brave), nada de inferência (node-llama-cpp/GGUF), nada
 * de voz (STT/TTS). O renderer é EXATAMENTE o de produção (mesmo bundle); só o
 * main responde com stubs controláveis por envars.
 *
 * Fora do modo E2E (env ausente/≠'1') nenhuma função deste módulo age: o
 * comportamento normal do app é preservado intacto.
 *
 * ENVARS DE CONTROLE (lidas UMA vez na montagem do stub):
 *   - E2E_GATE             : 'blocked' (default) | 'invalid' | 'offline' | 'ready'
 *   - E2E_KEYS=invalid    : garante claves seeds inválidas (alerta no SetupView).
 *   - E2E_NETWORK=offline : obriga o gate a reportar phase 'offline' (com chaves).
 *   - E2E_WORKSPACE_ROOT  : raiz onde o stub materializa os workspaces dos
 *                           desafios (o teste lê em disco p/ aferir persistência).
 *
 * O stub reusa buildStudyHandlers/buildPiHandlers (DAVI de DI real), então a
 * lógica de segurança de workspace (contenção de path, escrita real em disco)
 * é a MESMA de produção — apenas runner/lesson/serviço são fakes.
 */
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

import type {
  ChallengeInfo,
  LocalModelInfo,
  PiExecuteResult,
  PiExecuteRequest,
  PiStreamEvent,
  StartupStatus,
  StudyFinding,
  StudyLesson,
  TestAnswerResult,
  ValidationResult,
} from '@shared/ipc-contract';
import {
  KEYS_CHANNELS,
  LOCAL_AI_CHANNELS,
  PI_CHANNELS,
  STT_CHANNELS,
  STUDY_CHANNELS,
  TTS_CHANNELS,
} from '@shared/ipc-contract';
import { buildPiHandlers, type PiAgentServiceLike } from '../ipc/pi-handlers';
import {
  buildStudyHandlers,
  type LessonServiceLike,
  type RunnerLike,
} from '../ipc/study-handlers';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from '../ipc/safeHandle';
import type { LessonProgress } from './lessonTypes';

const E2E = process.env.STUDY_METHOD_E2E === '1';

/** Pequeno atraso para que as fases 'executando' sejam observáveis no teste. */
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Estado em memória das chaves (o stub NÃO toca o settingsStore real). */
interface KeyState {
  deepseek: string;
  brave: string;
}

const keys: KeyState = { deepseek: '', brave: '' };

/** Marca uma chave como INEVALIDÁVEL (prefixo reservado do teste). */
const INVALID_MARKER = 'invalid';

function workspaceRoot(): string {
  return process.env.E2E_WORKSPACE_ROOT ?? path.join(tmpdir(), 'study-method-e2e');
}

function seedKeys(): void {
  const gate = process.env.E2E_GATE ?? 'blocked';
  if (gate === 'ready' || gate === 'invalid' || gate === 'offline') {
    const invalid = gate === 'invalid' || process.env.E2E_KEYS === 'invalid';
    keys.deepseek = invalid ? `${INVALID_MARKER}-deepseek-seed` : 'sk-e2e-deepseek-valid';
    keys.brave = invalid ? `${INVALID_MARKER}-brave-seed` : 'bs-e2e-brave-valid';
  }
}

function bothConfigured(): boolean {
  return keys.deepseek.trim() !== '' && keys.brave.trim() !== '';
}

function keyIsInvalid(value: string): boolean {
  if (!value) return false;
  const v = value.trim();
  return v === INVALID_MARKER || v.toLowerCase().startsWith(`${INVALID_MARKER}-`) || v.toLowerCase().includes(`${INVALID_MARKER}-`);
}

/** Decide o StartupStatus do gate a partir do estado das chaves + envars. */
function buildStartupStatus(): StartupStatus {
  const checkedAt = new Date().toISOString();
  if (!bothConfigured()) {
    return {
      phase: 'blocked',
      deepseek: { configured: false, valid: false },
      brave: { configured: false, valid: false },
      offline: false,
      checkedAt,
    };
  }
  if (process.env.E2E_NETWORK === 'offline') {
    return {
      phase: 'offline',
      deepseek: { configured: true, valid: false, error: 'Network error: offline (E2E stub)' },
      brave: { configured: true, valid: false, error: 'Network error: offline (E2E stub)' },
      offline: true,
      checkedAt,
    };
  }
  const invalidD = keyIsInvalid(keys.deepseek);
  const invalidB = keyIsInvalid(keys.brave);
  if (invalidD || invalidB) {
    return {
      phase: 'blocked',
      deepseek: {
        configured: true,
        valid: !invalidD,
        error: invalidD ? 'Invalid API key' : undefined,
      },
      brave: { configured: true, valid: !invalidB, error: invalidB ? 'Invalid API key' : undefined },
      offline: false,
      checkedAt,
    };
  }
  return {
    phase: 'ready',
    deepseek: { configured: true, valid: true },
    brave: { configured: true, valid: true },
    offline: false,
    checkedAt,
  };
}

function validResult(provider: 'deepseek' | 'brave', key: string): ValidationResult {
  const checkedAt = new Date().toISOString();
  if (keyIsInvalid(key)) {
    return { isValid: false, provider, errorMessage: 'Invalid API key', checkedAt };
  }
  return { isValid: true, provider, checkedAt };
}

// ─── Domínio study (runner/lesson) ────────────────────────────────────────────

/** Cria um workspace de desafio determinístico em disco (editor/editor-e2e). */
async function materializeChallengeWorkspace(subjectSlug: string, root: string): Promise<ChallengeInfo> {
  const dir = await fsp.mkdtemp(path.join(root, `challenge-${subjectSlug || 'lesson'}-`));
  await fsp.writeFile(
    path.join(dir, 'README.md'),
    `# Desafio E2E: ordenação\n\nImplemente \`ordenar\` para ordenar uma lista de inteiros.\n\n(statement E2E determinístico)\n`,
    'utf8',
  );
  await fsp.writeFile(
    path.join(dir, 'solution.py'),
    '# Implemente sua solução aqui (E2E stub)\n\ndef ordenar(nums):\n    return sorted(nums)\n',
    'utf8',
  );
  await fsp.writeFile(
    path.join(dir, 'test_solution.py'),
    'def test_ordena():\n    assert ordenar([3, 1, 2]) == [1, 2, 3]\n',
    'utf8',
  );
  return {
    challengeId: 'e2e-challenge-0001',
    title: 'Ordenação (E2E)',
    language: 'python',
    concept: 'sorting',
    difficulty: 1,
    status: 'validated',
    verdict: 'approved',
    workspaceDir: dir,
    statementPath: path.join(dir, 'README.md'),
  };
}

function lessonFindings(subject: string): StudyFinding[] {
  return [
    {
      query: subject,
      title: 'Exemplo Página E2E',
      url: 'https://example.com/e2e',
      description: 'Fonte mockada do harness E2E (sem rede).',
      score: 0.9,
    },
  ];
}

function buildLesson(subject: string, challenge: ChallengeInfo): StudyLesson {
  return {
    title: `Aula E2E sobre ${subject.trim()}`,
    subject: subject.trim(),
    markdown: `# Aula E2E: ${subject.trim()}\n\n> Conteúdo mockado do harness E2E — sem LLM/DeepSeek.\n\n## Analogia\n\nImagine uma fila ordenada.\n\n## Fórmula (KaTeX)\n\nPitágoras: $a^2 + b^2 = c^2$.\n\n\`\`\`python\nprint("olá")\n\`\`\`\n`,
    findings: lessonFindings(subject.trim()),
    challenges: [challenge],
    createdAt: new Date().toISOString(),
  };
}

const lessonService: LessonServiceLike = {
  async generateLesson(subject, opts) {
    const emit = (phase: LessonProgress['phase'], fraction: number, message: string): void => {
      if (phase === 'done') return;
      opts?.onProgress?.({ phase, message, fraction });
    };
    emit('research', 0.25, 'Pesquisando fontes E2E…');
    emit('authoring', 0.5, 'Escrevendo a aula E2E…');
    emit('materializing', 0.75, 'Materializando exemplos E2E…');
    emit('validating', 1, 'Validando conclusões E2E…');
    opts?.onProgress?.({ phase: 'done', message: 'Concluído.', fraction: 1 });

    await fsp.mkdir(workspaceRoot(), { recursive: true });
    const subjectSlug =
      subject.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assunto';
    const challenge = await materializeChallengeWorkspace(subjectSlug, workspaceRoot());
    return { lesson: buildLesson(subject, challenge), rejected: [] };
  },
  async testAnswer(_challengeDir, _opts) {
    await sleep(250); // deixa a fase 'rodando…' observar o determinístico.
    return {
      success: true,
      testsRun: 2,
      expectedTests: 2,
      passed: true,
      output: '2 passed in 0.01s (E2E determinístico)\nsorted([3, 1, 2]) == [1, 2, 3]',
      verdictFeedback: 'Solução correta (E2E).',
    } satisfies TestAnswerResult;
  },
  async listSetups() {
    return { rows: [] };
  },
  async resolveSkillDirInfo() {
    return { skillDir: workspaceRoot() };
  },
};

function assertSlug(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'setup';
}

const runner: RunnerLike = {
  async resolveSkillDir() {
    return workspaceRoot();
  },
  async createSetup(spec) {
    const root = path.join(workspaceRoot(), assertSlug(spec.subjectSlug));
    await fsp.mkdir(root, { recursive: true });
    return { setupId: 'e2e-setup', setupRoot: root };
  },
  // fix-session-reuse: o runner real ganhou o 3º param (opts.reuseLive), mas a
  // interface RunnerLike (study-handlers.ts) declara só 2; args extras são
  // ignorados aqui por semântica do JS — o stub nunca recebe o reuseLive via IPC.
  async newSession(_setupRoot, _goal) {
    return 'e2e-session';
  },
  async createChallenge(_setupRoot, c) {
    const dir = path.join(_setupRoot, c.slug);
    return { challengeDirAbs: dir, relativePath: c.slug };
  },
  async verifyChallenge(_challengeDir) {
    return { verdict: 'approved', rejections: [], stdout: '' };
  },
  async testStudentAnswer(_challengeDir) {
    return {
      success: true,
      exitCode: 0,
      passed: true,
      testsRun: 2,
      expectedTests: 2,
      verdict: 'approved',
      output: '2 passed (E2E)',
    };
  },
};

// ─── Domínio Pi (sem SDK real) ────────────────────────────────────────────────

const piService: PiAgentServiceLike = {
  async execute(
    _request: PiExecuteRequest,
    onEvent?: (ev: PiStreamEvent) => void,
  ): Promise<PiExecuteResult> {
    const t = Date.now();
    onEvent?.({ type: 'status_change', status: 'starting', data: 'e2e-session', timestamp: t });
    onEvent?.({ type: 'tool_start', toolName: 'run-tests', timestamp: t + 1 });
    await sleep(120);
    onEvent?.({ type: 'text_delta', data: 'Avaliando resposta (E2E stub).\n', timestamp: t + 2 });
    onEvent?.({ type: 'tool_end', toolName: 'run-tests', timestamp: t + 3 });
    onEvent?.({ type: 'turn_end', timestamp: t + 4 });
    onEvent?.({ type: 'agent_end', timestamp: t + 5 });
    return { success: true, output: '[E2E] avaliação concluída — score: 87/100', executionTimeMs: 6 };
  },
  abort(_sessionId): void {
    // no-op no stub.
  },
};

async function checkPiSdk(): Promise<boolean> {
  return true;
}

// ─── LLM local + voz: OFF no modo E2E ────────────────────────────────────────

function buildLocalAiStubHandlers(): Map<string, IpcHandlerFn> {
  const map = new Map<string, IpcHandlerFn>();
  const hw = { backend: 'e2e-stub', ramGb: 16, vramGb: null, cpuModel: 'E2E CPU' };
  const noModels: LocalModelInfo[] = [];
  map.set(LOCAL_AI_CHANNELS.DETECT_HARDWARE, () => hw);
  map.set(LOCAL_AI_CHANNELS.RECOMMEND, () => null);
  map.set(LOCAL_AI_CHANNELS.LIST, () => noModels);
  map.set(LOCAL_AI_CHANNELS.GET_ACTIVE, () => null);
  map.set(LOCAL_AI_CHANNELS.SET_ACTIVE, () => ({ ok: true }));
  map.set(LOCAL_AI_CHANNELS.DOWNLOAD, () => ({ ok: false, error: 'E2E: download desativado' }));
  map.set(LOCAL_AI_CHANNELS.DELETE, () => ({ ok: true }));
  map.set(LOCAL_AI_CHANNELS.CHAT, () => ({ text: 'texto E2E stub' }));
  return map;
}

function buildVoiceStubHandlers(): Map<string, IpcHandlerFn> {
  const map = new Map<string, IpcHandlerFn>();
  const sttOk = { success: true, data: null };
  const ttsOk = { success: true, data: [] };
  for (const ch of Object.values(STT_CHANNELS)) {
    // Canais de EVENTO (push) não têm handler invoke — pular.
    if (
      ch === STT_CHANNELS.MODEL_DOWNLOAD_PROGRESS ||
      ch === STT_CHANNELS.STREAM_PARTIAL ||
      ch === STT_CHANNELS.ENGINE_STATUS
    ) {
      continue;
    }
    map.set(ch, () => sttOk);
  }
  for (const ch of Object.values(TTS_CHANNELS)) {
    if (ch === TTS_CHANNELS.DOWNLOAD_PROGRESS) continue; // evento push.
    map.set(ch, () => ttsOk);
  }
  return map;
}

// ─── Registration fechada (input) ─────────────────────────────────────────────

function buildKeysStubHandlers(): Map<string, IpcHandlerFn> {
  const map = new Map<string, IpcHandlerFn>();
  map.set(KEYS_CHANNELS.STARTUP_STATUS, async (): Promise<StartupStatus> => buildStartupStatus());
  map.set(KEYS_CHANNELS.GET_STATUS, async (): Promise<KeysStatusLike> => ({
    deepseekConfigured: keys.deepseek !== '',
    braveConfigured: keys.brave !== '',
    deepseekValidated: !keyIsInvalid(keys.deepseek) && keys.deepseek !== '',
    braveValidated: !keyIsInvalid(keys.brave) && keys.brave !== '',
  }));
  map.set(KEYS_CHANNELS.SET_KEY, async (_e, provider: unknown, apiKey: unknown) => {
    const p = String(provider ?? '');
    const k = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (p === 'deepseek') keys.deepseek = k;
    else if (p === 'brave') keys.brave = k;
    return { ok: true };
  });
  map.set(KEYS_CHANNELS.VALIDATE_DEEPSEEK, async (_e, key?: unknown) =>
    validResult('deepseek', typeof key === 'string' ? key : keys.deepseek),
  );
  map.set(KEYS_CHANNELS.VALIDATE_BRAVE, async (_e, key?: unknown) =>
    validResult('brave', typeof key === 'string' ? key : keys.brave),
  );
  return map;
}

interface KeysStatusLike {
  deepseekConfigured: boolean;
  braveConfigured: boolean;
  deepseekValidated: boolean;
  braveValidated: boolean;
}

/**
 * Registra (via safeHandle) os handlers STUB de todos os grupos que fariam
 * rede/LLM no modo normal. Idempotente com placeholders/re-registros. Sem o
 * estudo, E2E, é um no-op (guarda de segurança).
 */
export function registerE2EStubs(ipc?: IpcMainHandleLike): boolean {
  if (!E2E) return false;
  seedKeys();

  // Sempre resolve o objeto de registro: injetável (testes) ou electron real.
  const ipcImpl = ipc;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const resolved: IpcMainHandleLike = ipcImpl ?? (require('electron') as { ipcMain: IpcMainHandleLike }).ipcMain;

  safeHandleMap(resolved, buildKeysStubHandlers());

  safeHandleMap(
    resolved,
    buildStudyHandlers({ runner, lesson: lessonService, emit: () => {} }),
  );

  safeHandleMap(
    resolved,
    buildPiHandlers({ getService: async () => piService, emit: () => {}, checkPiSdk }),
  );

  safeHandleMap(resolved, buildLocalAiStubHandlers());
  safeHandleMap(resolved, buildVoiceStubHandlers());

  void fsp.mkdir(workspaceRoot(), { recursive: true }).catch(() => undefined);
  return true;
}

/** Fase do gate (para log/diagnóstico do main em modo E2E). */
export function e2eGatePhase(): string {
  return buildStartupStatus().phase;
}

export { STUDY_CHANNELS, PI_CHANNELS };