/**
 * electron/main/services/e2eStubs.ts — STUB MODE do harness E2E (Playwright).
 *
 * Ativado quando `process.env.STUDY_METHOD_E2E === '1'`. Substitui os handlers
 * IPC de CHAVES/GATE/PI/STUDY/LOCAL_AI/VOZ por fixtures DETERMINÍSTICAS — nada
 * de rede real (openrouter/brave), nada de inferência (node-llama-cpp/GGUF), nada
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
  ResearchProgressEvent,
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
  TRACK_CHANNELS,
  TTS_CHANNELS,
} from '@shared/ipc-contract';
import type {
  TrackChallengeGetRequest,
  TrackChallengeResult,
  TrackDetailResult,
  TrackLessonDoneResult,
  TrackLessonResult,
  TrackListResult,
  TrackRegenerateResult,
  TrackSubmitRequest,
  TrackSubmitResult,
  TutorChatRequest,
  TutorReply,
} from '@shared/ipc-contract';
import { OPENROUTER_KEY_PREFIX, OPENROUTER_PROVIDER_KEY } from '@shared/llm/constants';
import type { TrackRepoLike } from '../ipc/track-handlers';
import { buildPiHandlers, type PiAgentServiceLike } from '../ipc/pi-handlers';
import {
  buildStudyHandlers,
  type LessonServiceLike,
  type RunnerLike,
} from '../ipc/study-handlers';
import { safeHandleMap, type IpcMainHandleLike, type IpcHandlerFn } from '../ipc/safeHandle';
import type { LessonProgress } from './lessonTypes';
import { loadAllTracks, loadTrack, findLessonAnywhere } from '../content/trackLoader';
import { buildTrackList, buildTrackDetail, buildTrackLesson, resolveChallengeSpec } from '../services/trackService';
import { nextSection } from '../services/tutorChat';
import { runStudentCode } from '../services/challengeExec';

const E2E = process.env.STUDY_METHOD_E2E === '1';

/** Pequeno atraso para que as fases 'executando' sejam observáveis no teste. */
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Estado em memória das chaves (o stub NÃO toca o settingsStore real).
 *
 * MIGRAÇÃO OPENROUTER: o slot do LLM é `openrouter` — o E2E não afirma mais
 * `deepseek` em lugar nenhum. O nome legado sobrevive apenas como APELIDO de
 * ENTRADA do `keys:set-key` (o renderer de hoje ainda manda 'deepseek') e nos
 * campos do StartupStatus/KeysStatus, que são contrato congelado até a ONDA 2.
 */
interface KeyState {
  openrouter: string;
  brave: string;
}

const keys: KeyState = { openrouter: '', brave: '' };

/** Marca uma chave como INEVALIDÁVEL (prefixo reservado do teste). */
const INVALID_MARKER = 'invalid';

function workspaceRoot(): string {
  return process.env.E2E_WORKSPACE_ROOT ?? path.join(tmpdir(), 'study-method-e2e');
}

function seedKeys(): void {
  const gate = process.env.E2E_GATE ?? 'blocked';
  if (gate === 'ready' || gate === 'invalid' || gate === 'offline') {
    const invalid = gate === 'invalid' || process.env.E2E_KEYS === 'invalid';
    // Chave de teste no FORMATO do OpenRouter (sk-or-v1-…), do contrato.
    keys.openrouter = invalid
      ? `${INVALID_MARKER}-openrouter-seed`
      : `${OPENROUTER_KEY_PREFIX}e2e-openrouter-valid`;
    keys.brave = invalid ? `${INVALID_MARKER}-brave-seed` : 'bs-e2e-brave-valid';
  }
}

function bothConfigured(): boolean {
  return keys.openrouter.trim() !== '' && keys.brave.trim() !== '';
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
  const invalidD = keyIsInvalid(keys.openrouter);
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

function validResult(provider: 'openrouter' | 'brave', key: string): ValidationResult {
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

/**
 * Emite a sequência COMPLETA de events `research:*` do stub (determinístico,
 * sem rede): research:plan com 2 sub-perguntas e 2 queries → rodada 1 com
 * query-start/query-done por query → round-done → research:done. Usado pelo
 * lessonService stub para alimentar o canal study:research-progress no E2E.
 */
async function emitFakeResearch(
  subject: string,
  onResearchProgress?: (ev: ResearchProgressEvent) => void,
): Promise<void> {
  if (!onResearchProgress) return; // ninguém assinou o canal novo — no-op.
  const base = subject || 'assunto';
  const subQuestions = [
    { id: 'sq1', question: `${base}: conceito e fundamentos` },
    { id: 'sq2', question: `${base}: exemplos e erros comuns` },
  ];
  const queries = [
    { id: 'q1', q: `${base} conceito`, sub: 'sq1', category: 'official-docs' as const },
    { id: 'q2', q: `${base} erros comuns`, sub: 'sq2', category: 'common-errors' as const },
  ];
  onResearchProgress({ kind: 'research:plan', subQuestions, queries, maxRounds: 1 });
  onResearchProgress({ kind: 'research:round-start', round: 1, totalRounds: 1 });
  for (const q of queries) {
    onResearchProgress({ kind: 'research:query-start', queryId: q.id, q: q.q });
    await sleep(60); // deixa o progresso por query observável no teste.
    onResearchProgress({
      kind: 'research:query-done',
      queryId: q.id,
      q: q.q,
      ok: true,
      provider: 'brave',
      hits: 1,
      latencyMs: 12,
    });
  }
  onResearchProgress({ kind: 'research:round-done', round: 1, ok: 2, failed: 0, uniqueSources: 1 });
  onResearchProgress({ kind: 'research:done', sources: 1, rounds: 1, stopReason: 'pesquisa planejada concluída (E2E stub)' });
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

    // ADITIVO (onda2-research-live): o canal novo `study:research-progress`
    // precisa dos events `research:*` também no STUB (fake determinístico) —
    // os specs E2E que assinarem o canal novo os consomem. Ordem garantida:
    // plan → round-start → (query-start → query-done)* → round-done → done.
    // As fases lesson-progress acima permanecem EXATAMENTE como estavam.
    await emitFakeResearch(subject.trim(), opts?.onResearchProgress);

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

// ─── TRILHAS (rodada 8): fixture determinística em disco + repo fake ────────

/**
 * Escreve a FIXTURE da trilha em `workspaceRoot()/fixture-tracks/nodejs-do-zero`
 * — conteúdo REAL no formato do produto (o loader do main consome): 1 módulo,
 * 2 aulas, 1 desafio com código que roda (node:test REAL no submit), 1 teste
 * de proficiência e — ADITIVO (rodada 9) — 1 DESAFIO DE MÓDULO MULTI-ARQUIVO
 * (lib/soma.mjs + lib/multiplica.mjs, testes que importam dos dois). O spec
 * E2E navega: Home → Trilha → Aula → Desafio (e módulo → desafio do módulo).
 */
async function writeFixtureTrack(): Promise<void> {
  const root = path.join(workspaceRoot(), 'fixture-tracks', 'nodejs-do-zero');
  const moduleDir = path.join(root, 'modules', 'modulo-1');
  const lessonDir = path.join(moduleDir, 'lessons');
  const chalDir = path.join(lessonDir, 'aula-1', 'challenges', 'dobro-do-numero');
  await fsp.mkdir(chalDir, { recursive: true });
  await fsp.mkdir(path.join(lessonDir, 'aula-2'), { recursive: true });
  await fsp.mkdir(path.join(moduleDir, 'challenges', 'desafio-do-modulo'), { recursive: true });

  const track = {
    schemaVersion: 1,
    slug: 'nodejs-do-zero',
    title: 'Node.js do Zero',
    description: 'Trilha fixture do harness E2E (sem rede/LLM).',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['modulo-1'],
  };
  const moduleMeta = {
    schemaVersion: 1,
    slug: 'modulo-1',
    title: 'Módulo 1 (E2E)',
    order: 1,
    lessons: ['aula-1', 'aula-2'],
    // ADITIVO (rodada 9): desafio do MÓDULO (multi-arquivo).
    challenge: 'desafio-do-modulo',
  };
  const aula1 = {
    schemaVersion: 1,
    slug: 'aula-1',
    title: 'Aula E2E sobre funções',
    summary: 'Resumo da aula fixture (E2E).',
    difficulty: 1,
    concepts: ['funcoes'],
    prerequisites: [],
    theory: [
      { id: 'introducao', title: 'Introdução', markdown: 'Conteúdo mockado do harness E2E — sem LLM/DeepSeek.\n\n## Analogia\nImagine uma fila ordenada.' },
      { id: 'funcoes', title: 'Funções', markdown: 'Função recebe um número e devolve o dobro.', code: { language: 'js', code: 'const dobro = (n) => n * 2;', explanation: 'n * 2 é o dobro.' } },
    ],
    sources: [{ title: 'MDN', url: 'https://example.org', description: 'Fonte fixture E2E.' }],
    challenges: ['dobro-do-numero'],
  };
  const aula2 = {
    schemaVersion: 1,
    slug: 'aula-2',
    title: 'Aula E2E seguinte',
    summary: 'Segunda aula fixture (E2E).',
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: ['aula-1'],
    theory: [{ id: 'intro', title: 'Introdução', markdown: 'Conteúdo da segunda aula (E2E).' }],
    sources: [],
    challenges: [],
  };
  const desafio = {
    schemaVersion: 1,
    slug: 'dobro-do-numero',
    title: 'O dobro do número',
    concept: 'funcoes',
    difficulty: 1,
    language: 'nodejs',
    statement: '# O dobro do número\n\nEscreva uma função que devolve o dobro de um número.\n\nLeia o enunciado com calma e clique em Começar para iniciar o cronômetro.',
    starterCode: 'export function dobroDoNumero(n) {\n  // TODO: implemente\n  throw new Error(\'não implementado\');\n}\n',
    testsCode: [
      `import { test } from 'node:test';`,
      `import assert from 'node:assert/strict';`,
      `import { dobroDoNumero } from './solution.mjs';`,
      ``,
      `test('dobro de 2 é 4', () => {`,
      `  assert.equal(dobroDoNumero(2), 4);`,
      `});`,
      ``,
      `test('dobro de 0 é 0', () => {`,
      `  assert.equal(dobroDoNumero(0), 0);`,
      `});`,
      ``,
      `test('dobro de -3 é -6', () => {`,
      `  assert.equal(dobroDoNumero(-3), -6);`,
      `});`,
      ``,
    ].join('\n'),
    solutionCode: 'export function dobroDoNumero(n) {\n  return n * 2;\n}\n',
    expectedTestCount: 3,
  };
  const proficiencia = {
    ...desafio,
    slug: 'proficiencia',
    title: 'Proficiência E2E',
    concept: 'proficiencia_e2e',
    difficulty: 5,
    minFirstStarMs: 120_000,
    testsCode: [
      `import { test } from 'node:test';`,
      `import assert from 'node:assert/strict';`,
      `import { dobroDoNumero } from './solution.mjs';`,
      ``,
      `test('dobro de 5 é 10', () => {`,
      `  assert.equal(dobroDoNumero(5), 10);`,
      `});`,
      ``,
    ].join('\n'),
    expectedTestCount: 1,
  };

  // ADITIVO (rodada 9): desafio do MÓDULO multi-arquivo — o aluno edita
  // lib/soma.mjs E lib/multiplica.mjs; os testes importam dos dois.
  const desafioDoModulo = {
    schemaVersion: 1,
    slug: 'desafio-do-modulo',
    title: 'Desafio do módulo',
    concept: 'funcoes',
    difficulty: 2,
    language: 'nodejs',
    statement: '# Desafio do módulo\n\nImplemente as funções de soma e multiplicação nos DOIS arquivos do desafio.\n\nLeia o enunciado com calma e clique em Começar para iniciar o cronômetro.',
    files: [
      {
        path: 'lib/soma.mjs',
        starterCode: 'export function soma(a, b) {\n  // TODO: implemente\n  throw new Error(\'não implementado\');\n}\n',
        solutionCode: 'export function soma(a, b) {\n  return a + b;\n}\n',
      },
      {
        path: 'lib/multiplica.mjs',
        starterCode: 'export function multiplica(a, b) {\n  // TODO: implemente\n  throw new Error(\'não implementado\');\n}\n',
        solutionCode: 'export function multiplica(a, b) {\n  return a * b;\n}\n',
      },
    ],
    testsCode: [
      `import { test } from 'node:test';`,
      `import assert from 'node:assert/strict';`,
      `import { soma } from './lib/soma.mjs';`,
      `import { multiplica } from './lib/multiplica.mjs';`,
      ``,
      `test('soma 2 + 3 é 5', () => {`,
      `  assert.equal(soma(2, 3), 5);`,
      `});`,
      ``,
      `test('multiplica 2 * 3 é 6', () => {`,
      `  assert.equal(multiplica(2, 3), 6);`,
      `});`,
      ``,
      `test('soma e multiplica juntos', () => {`,
      `  assert.equal(multiplica(soma(1, 2), 2), 6);`,
      `});`,
      ``,
    ].join('\n'),
    expectedTestCount: 3,
  };

  await fsp.writeFile(path.join(root, 'track.json'), JSON.stringify(track, null, 2), 'utf8');
  await fsp.writeFile(path.join(moduleDir, 'module.json'), JSON.stringify(moduleMeta, null, 2), 'utf8');
  await fsp.writeFile(path.join(lessonDir, 'aula-1', 'lesson.json'), JSON.stringify(aula1, null, 2), 'utf8');
  await fsp.writeFile(path.join(lessonDir, 'aula-2', 'lesson.json'), JSON.stringify(aula2, null, 2), 'utf8');
  await fsp.writeFile(path.join(chalDir, 'challenge.json'), JSON.stringify(desafio, null, 2), 'utf8');
  await fsp.writeFile(path.join(root, 'proficiency.json'), JSON.stringify(proficiencia, null, 2), 'utf8');
  await fsp.writeFile(path.join(moduleDir, 'challenges', 'desafio-do-modulo', 'challenge.json'), JSON.stringify(desafioDoModulo, null, 2), 'utf8');
}

/** Repo fake em memória (TrackRepoLike) — progresso determinístico do E2E. */
function buildE2ETrackRepo(): TrackRepoLike {
  const attempts = new Map<string, Array<{ verdict: string; stars: number }>>();
  const done = new Set<string>();
  let prof: { verdict: 'passed' | 'failed'; stars: number } | null = null;
  const generated: Array<Record<string, unknown>> = [];
  return {
    listTrackLessonProgress: async () =>
      Array.from(done).map((lessonId) => ({ trackSlug: 'nodejs-do-zero', lessonId, completedAt: 'e2e' })),
    getTrackProficiency: async () =>
      prof ? { trackSlug: 'nodejs-do-zero', verdict: prof.verdict, stars: prof.stars, passedAt: 'e2e' } : null,
    listGeneratedChallenges: async () => generated as never,
    getAttemptsForChallenge: async (id: string) =>
      (attempts.get(id) ?? []).map((a, i) => ({
        id: `${id}#${i}`,
        subjectId: 'e2e-subject',
        lessonId: 'lesson:aula-1',
        challengeId: id,
        verdict: a.verdict as 'passed' | 'failed' | 'timeout' | 'abandoned',
        stars: a.stars,
        durationMs: 0,
        createdAt: String(i),
      })),
    markTrackLessonDone: async (_t, lessonId) => void done.add(lessonId),
    setTrackProficiency: async (_t, v, s) => void (prof = { verdict: v, stars: s }),
    insertGeneratedChallenge: async (input) => void generated.push(input as never),
    listFailedChallengeSlugs: async () => [],
  };
}

/** DeepSeek fake: o tutor responde texto determinístico (sem rede). */
const e2eDeepseek = {
  chatCompletion: async (req: unknown) => ({
    content: 'Seção apresentada pelo tutor E2E (stub determinístico, sem rede).\n\nO que você quer saber?',
    model: 'e2e-stub',
    ...(req as { messages?: unknown }).messages ? {} : {},
  }),
} as never;

export function buildTrackStubHandlers(): Map<string, IpcHandlerFn> {
  const map = new Map<string, IpcHandlerFn>();
  void writeFixtureTrack();
  map.set(TRACK_CHANNELS.LIST, async (): Promise<TrackListResult> => {
    await writeFixtureTrack();
    const { tracks } = await loadAllTracks(path.join(workspaceRoot(), 'fixture-tracks'));
    return { ok: true, tracks: await buildTrackList(tracks, buildE2ETrackRepo()) };
  });
  map.set(TRACK_CHANNELS.GET, async (_e, payload: unknown): Promise<TrackDetailResult> => {
    const p = (payload ?? {}) as { trackSlug?: string };
    await writeFixtureTrack();
    const track = await loadTrack(path.join(workspaceRoot(), 'fixture-tracks', p.trackSlug ?? ''));
    return { ok: true, track: await buildTrackDetail(track, buildE2ETrackRepo()) };
  });
  map.set(TRACK_CHANNELS.LESSON, async (_e, payload: unknown): Promise<TrackLessonResult> => {
    const p = (payload ?? {}) as { trackSlug?: string; lessonId?: string };
    await writeFixtureTrack();
    const track = await loadTrack(path.join(workspaceRoot(), 'fixture-tracks', p.trackSlug ?? ''));
    const found = findLessonAnywhere(track, p.lessonId ?? '');
    if (!found) return { ok: true, lesson: null };
    return { ok: true, lesson: await buildTrackLesson(track, found.moduleSlug, p.lessonId!, buildE2ETrackRepo()) };
  });
  map.set(TRACK_CHANNELS.LESSON_DONE, async (_e, payload: unknown): Promise<TrackLessonDoneResult> => {
    const p = (payload ?? {}) as { trackSlug?: string; lessonId?: string };
    await buildE2ETrackRepo().markTrackLessonDone(p.trackSlug ?? '', p.lessonId ?? '');
    return { ok: true };
  });
  map.set(TRACK_CHANNELS.TUTOR_CHAT, async (_e, payload: unknown): Promise<TutorReply> => {
    const p = (payload ?? {}) as TutorChatRequest;
    const track = await loadTrack(path.join(workspaceRoot(), 'fixture-tracks', p.trackSlug ?? ''));
    const found = findLessonAnywhere(track, p.lessonId ?? '');
    if (!found) return { ok: false, message: '', sectionId: null, done: false, error: { code: 'LESSON_NOT_FOUND', message: 'não encontrada' } };
    if (p.action === 'next') {
      const section = nextSection(found.lesson.meta, p.presentedSections ?? []);
      if (!section) return { ok: true, message: '', sectionId: null, done: true };
      const done = nextSection(found.lesson.meta, [...(p.presentedSections ?? []), section.id]) === null;
      return {
        ok: true,
        message: `Tutor E2E: ${section.title} — ${section.markdown.slice(0, 80)}`,
        sectionId: section.id,
        sectionTitle: section.title,
        done,
      };
    }
    const last = [...(p.history ?? [])].reverse().find((m) => m.role === 'user');
    return {
      ok: true,
      message: `Tutor E2E responde a dúvida: ${last?.content ?? '(sem pergunta)'}`,
      sectionId: null,
      done: false,
    };
  });
  map.set(TRACK_CHANNELS.CHALLENGE_GET, async (_e, payload: unknown): Promise<TrackChallengeResult> => {
    const p = (payload ?? {}) as TrackChallengeGetRequest;
    await writeFixtureTrack();
    const track = await loadTrack(path.join(workspaceRoot(), 'fixture-tracks', p.trackSlug ?? ''));
    // ADITIVO (rodada 9): p.moduleSlug resolve o desafio do MÓDULO.
    const spec = await resolveChallengeSpec(track, p.target, p.lessonId, p.challengeId, buildE2ETrackRepo(), p.moduleSlug);
    return { ok: true, challenge: spec };
  });
  map.set(TRACK_CHANNELS.PROFICIENCY_GET, async (_e, payload: unknown): Promise<TrackChallengeResult> => {
    const p = (payload ?? {}) as TrackChallengeGetRequest;
    await writeFixtureTrack();
    const track = await loadTrack(path.join(workspaceRoot(), 'fixture-tracks', p.trackSlug ?? ''));
    const spec = await resolveChallengeSpec(track, 'proficiency', undefined, p.challengeId, buildE2ETrackRepo());
    return { ok: true, challenge: spec };
  });
  map.set(TRACK_CHANNELS.CHALLENGE_SUBMIT, async (_e, payload: unknown): Promise<TrackSubmitResult> => {
    const p = (payload ?? {}) as TrackSubmitRequest;
    await writeFixtureTrack();
    const track = await loadTrack(path.join(workspaceRoot(), 'fixture-tracks', p.trackSlug ?? ''));
    const repo = buildE2ETrackRepo();
    // ADITIVO (rodada 9): target 'module' (desafio do módulo, com moduleSlug).
    const spec = p.target === 'proficiency'
      ? await resolveChallengeSpec(track, 'proficiency', undefined, p.challengeId, repo)
      : p.target === 'module'
        ? await resolveChallengeSpec(track, 'module', undefined, p.challengeId, repo, p.moduleSlug)
        : await resolveChallengeSpec(track, 'lesson', p.lessonId, p.challengeId, repo);
    if (!spec) {
      return {
        ok: false,
        error: { code: 'CHALLENGE_NOT_FOUND', message: 'não encontrado' },
        passed: false,
        testsRun: 0,
        expectedTests: 0,
        output: '',
        checks: [],
        passedCount: 0,
        totalCount: 0,
      };
    }
    // Execução REAL (node --test) sobre o código do aluno — determinístico.
    const testsCode = p.target === 'proficiency'
      ? track.proficiency!.testsCode
      : p.target === 'module'
        ? track.modules.find((m) => m.meta.slug === p.moduleSlug)?.challenge?.testsCode ?? ''
        : track.modules.flatMap((m) => m.lessons).find((l) => l.meta.slug === p.lessonId)?.challenges.find((c) => c.slug === p.challengeId)?.testsCode ?? '';
    // ADITIVO (rodada 9): multi-arquivo — o aluno envia TODOS os arquivos.
    const hasFiles = Array.isArray(p.files) && p.files.length > 0;
    const res = await runStudentCode({
      studentCode: typeof p.code === 'string' ? p.code : '',
      files: hasFiles ? p.files : undefined,
      testsCode,
      expectedTestCount: spec.expectedTestCount,
    });
    // ONDA 1 (checks por teste): propaga os checks do runStudentCode REAL —
    // o stub roda node --test de verdade; só repassa os campos novos.
    return {
      ok: true,
      passed: res.passed,
      testsRun: res.testsRun,
      expectedTests: spec.expectedTestCount,
      output: res.output,
      checks: res.checks,
      passedCount: res.passedCount,
      totalCount: res.totalCount,
    };
  });
  map.set(TRACK_CHANNELS.PROFICIENCY_SUBMIT, async (_e, payload: unknown): Promise<TrackSubmitResult> => {
    const p = (payload ?? {}) as TrackSubmitRequest & { stars?: number };
    const base = (await map.get(TRACK_CHANNELS.CHALLENGE_SUBMIT)!(_e, { ...p, target: 'proficiency' })) as TrackSubmitResult;
    if (base.ok && base.passed) {
      await buildE2ETrackRepo().setTrackProficiency(p.trackSlug, 'passed', typeof p.stars === 'number' ? p.stars : 0);
    }
    return base;
  });
  map.set(TRACK_CHANNELS.CHALLENGE_REGENERATE, async (): Promise<TrackRegenerateResult> => ({
    ok: false,
    error: { code: 'REGEN_UNAVAILABLE', message: 'regeneração desativada no modo E2E (sem LLM).' },
  }));
  return map;
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

/**
 * Handlers STUB dos canais keys:* — exportado para o teste unitário aferir a
 * migração do slot da chave (openrouter canônico, 'deepseek' como apelido de
 * entrada) sem subir o Electron.
 */
export function buildKeysStubHandlers(): Map<string, IpcHandlerFn> {
  const map = new Map<string, IpcHandlerFn>();
  map.set(KEYS_CHANNELS.STARTUP_STATUS, async (): Promise<StartupStatus> => buildStartupStatus());
  map.set(KEYS_CHANNELS.GET_STATUS, async (): Promise<KeysStatusLike> => ({
    // Campos legados do KeysStatus (contrato até a ONDA 2) alimentados pelo
    // slot 'openrouter'.
    deepseekConfigured: keys.openrouter !== '',
    braveConfigured: keys.brave !== '',
    deepseekValidated: !keyIsInvalid(keys.openrouter) && keys.openrouter !== '',
    braveValidated: !keyIsInvalid(keys.brave) && keys.brave !== '',
  }));
  map.set(KEYS_CHANNELS.SET_KEY, async (_e, provider: unknown, apiKey: unknown) => {
    const p = String(provider ?? '');
    const k = typeof apiKey === 'string' ? apiKey.trim() : '';
    // 'openrouter' é o nome canônico; 'deepseek' é aceito como APELIDO porque o
    // renderer só passa a mandar o nome novo na ONDA 2.
    if (p === OPENROUTER_PROVIDER_KEY || p === 'deepseek') keys.openrouter = k;
    else if (p === 'brave') keys.brave = k;
    return { ok: true };
  });
  map.set(KEYS_CHANNELS.VALIDATE_DEEPSEEK, async (_e, key?: unknown) =>
    validResult(OPENROUTER_PROVIDER_KEY, typeof key === 'string' ? key : keys.openrouter),
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
  safeHandleMap(resolved, buildTrackStubHandlers());

  void fsp.mkdir(workspaceRoot(), { recursive: true }).catch(() => undefined);
  return true;
}

/** Fase do gate (para log/diagnóstico do main em modo E2E). */
export function e2eGatePhase(): string {
  return buildStartupStatus().phase;
}

export { STUDY_CHANNELS, PI_CHANNELS };