/**
 * electron/main/services/studyMethodRunner.ts — a ponte entre a GUI Electron do
 * tutor study-method e OS SCRIPTS REAIS da skill (bash).
 *
 * Em vez de reinventar o protocolo, este serviço invoca `skills/study-method/scripts/*.sh`
 * e implementa em TypeScript as regras determinísticas que o chamador (o app) precisa:
 *
 *  1. `resolveSkillDir()` — localiza a skill a partir da env `STUDY_METHOD_SKILL_DIR`
 *     ou do caminho do app; valida a presença de `scripts/setup-init.sh`.
 *  2. `runScript()` — spawn seguro de `bash <skill>/scripts/<name> <args>` com
 *     timeouts e captura de stdout/stderr.
 *  3. `handleExit10()` — protocolo REQUEST/APPLY do docs/00 §6: quando o script sai
 *     com exit 10 e imprime um PEDIDO JSON em stdout, chama o juiz injetável
 *     (`llmJudge`), valida a RESPOSTA contra o envelope (request_id/kind/protocol),
 *     grava num tmp e re-invoca com `--apply <arquivo>`. Máximo 2 ciclos.
 *  4. `createSetup()` / `newSession()` / `createChallenge()` / `verifyChallenge()` —
 *     wrappers com parsing do stdout de cada script.
 *  5. `testStudentAnswer()` — execução DETERMINÍSTICA da resposta do aluno: copia o
 *     workspace do desafio (SEM `.solution/`) para tmp e roda `runner.sh` com
 *     `STUDY_METHOD_SKILL_DIR` e `CHALLENGE_TIMEOUT` setados, mapeando o contrato de
 *     exit code do runner (0 passou · 1 falhou · 2 contagem divergente · 3 timeout ·
 *     66 infra). O timeout usa `execution.timeout_seconds` do `meta.json` do desafio
 *     (mínimo 5s) como primário; backstop de `defaultTimeoutMs` (60s) sem meta válido.
 *
 * Segurança: `runScript` (e o wrapper de exit 10) rejeita qualquer nome de script que
 * não seja um basename simples e re-verifica a contenção em `<skillDir>/scripts/` —
 * nomes com `/`, `\`, `..`, `.` ou vazio retornam `{exitCode:-1, stderr:'...inválido...'}`
 * sem executar nada (anti path traversal).
 *
 * O módulo 'electron' NÃO é importado aqui; `getAppPath` é injetável para que os
 * testes usem um caminho fake. Tudo roda em tmp — nunca se escreve setups reais.
 */

import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

/** Exit codes que os scripts da skill reportam (docs/00-contratos.md §5.1). */
export const SKILL_EXIT_CODES = {
  OK: 0,
  EXEC_ERROR: 1,
  USAGE: 2,
  SETUP_NOT_FOUND: 3,
  RESOURCE_LOCKED: 4,
  SCHEMA_FAILED: 5,
  NEEDS_MODEL_INPUT: 10,
} as const;

/** exit codes do runner.sh gerado no desafio (docs/00 §5.2 exceção nomeada 1). */
export const RUNNER_EXIT_CODES = {
  PASSED: 0,
  FAILED: 1,
  COUNT_MISMATCH: 2,
  TIMEOUT: 3,
  CD_FAILED: 66,
} as const;

/** Limite padrão de bytes de stdout capturado (best-effort, evita memória). */
export const DEFAULT_OUTPUT_LIMIT = 50 * 1024;

/** Tetos do protocolo REQUEST/APPLY (docs/00 §6.3 RA-6). */
export const REQUEST_APPLY_MAX_CYCLES = 2;

export const REQUEST_APPLY_PROTOCOL = 'study-method/request-apply';
export const REQUEST_APPLY_PROTOCOL_VERSION = '1.0';

/** Envelope de PEDIDO emitido pelos scripts no exit 10 (docs/00 §6.1). */
export interface StudyRequestEnvelope {
  protocol: string;
  protocol_version: string;
  request_id: string;
  script: string;
  kind: string;
  setup_id: string | null;
  generated_at: string;
  response_schema: string;
  instructions_pt_br: string;
  payload: unknown;
}

/** Envelope de RESPOSTA a que o juiz (--apply) precisa aderir (docs/00 §6.2). */
export interface StudyResponseEnvelope {
  protocol: string;
  protocol_version: string;
  request_id: string;
  kind: string;
  items: unknown[];
}

export interface RunScriptResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunScriptOptions {
  /** cwd do processo (default: um tmp novo por chamada). */
  cwd?: string;
  /** millis; 0 desliga o timeout (default 60_000). */
  timeoutMs?: number;
  /** variáveis de ambiente adicionais (além de process.env + STUDY_METHOD_SKILL_DIR). */
  env?: Record<string, string>;
}

export interface HandleExit10Options {
  /** nome do script invocado (ex.: 'challenge-verify.sh'). */
  scriptName: string;
  /** args base a re-invocar; o runner anexa `--apply <arquivo>` a cada ciclo. */
  args: string[];
  opts?: RunScriptOptions;
}

export interface HandleExit10Result {
  result: RunScriptResult;
  /** quantos PEDIDO/RESPOSTA foram gastos (0 se o script nunca pediu julgamento). */
  cyclesUsed: number;
  /** true quando os 2 ciclos se esgotaram sem o script decidir (caminho degradado). */
  applyExhausted: boolean;
  /**
   * Discriminador honesto de POR QUE o script saiu no caminho degradado/not_run,
   * para o lessonOrchestrator não mentir no `rejected.reason`:
   *  - 'request_unparseable': exit 10 veio sem envelope JSON parseável no stdout;
   *    não é "apply esgotado" nem "juiz ausente" (o juiz pode até estar configurado,
   *    mas não há PEDIDO ao qual responder) — protocolo REQUEST/APPLY malformado.
   *  - 'apply_exhausted': havia juiz E pedido parseável, mas os 2 ciclos se esgotaram
   *    (ou a RESPOSTA do juiz foi recusada) sem o script decidir.
   *  - undefined: caminho normal (OK/rejected/approved/weak) OU sem juiz configurado.
   */
  protocolIssue?: 'request_unparseable' | 'apply_exhausted';
}

/** Juiz injetável: recebe o PEDIDO e devolve o objeto da RESPOSTA (o corpo de items[0]). */
export type LlmJudge = (pedido: StudyRequestEnvelope) => Promise<unknown>;

export interface CreateSetupSpec {
  path: string;
  subject: string;
  subjectSlug: string;
  title: string;
  language?: string;
  skillLevel?: string;
  sessionMinutes?: number;
  theorySource?: string;
}

export interface VerifyChallengeResult {
  /** veredito real do stdout do script: 'approved' | 'weak' | 'rejected' | 'not_run'. */
  verdict: string;
  mutationScore?: number;
  killed?: number;
  survived?: number;
  /** lista de rejection codes ([] quando nenhuma). */
  rejections: string[];
  stdout: string;
  /** true quando o exit-10 esgotou os 2 ciclos (script seguiu pelo caminho degradado). */
  applyExhausted?: boolean;
  /** exit code cru do script (exposto para o orchestrator distinguir infra 3/4). */
  exitCode?: number;
  /**
   * Discriminador honesto de POR QUE o veredito ficou 'not_run' (mesmo semântica
   * do HandleExit10Result.protocolIssue, estendida com os exits de infra):
   *  - 'request_unparseable' | 'apply_exhausted' | 'exit_setup_not_found' (exit 3)
   *    | 'exit_resource_locked' (exit 4).
   *  - undefined: caminho normal OU 'juiz ausente' (runner sem llmJudge).
   */
  protocolIssue?:
    | 'request_unparseable'
    | 'apply_exhausted'
    | 'exit_setup_not_found'
    | 'exit_resource_locked';
}

export interface TestStudentAnswerResult {
  success: boolean;
  /** exit code do runner.sh. */
  exitCode: number;
  passed: boolean;
  /** contagem de testes executada/lida do output; null quando indisponível. */
  testsRun: number | null;
  expectedTests: number | null;
  /** veredito textual derivado do `VEREDITO=` do output, quando presente. */
  verdict?: string;
  /** stdout limitado (últimos `outputLimit` bytes). */
  output: string;
}

export interface StudyMethodRunnerDeps {
  /** diretório da skill; se ausente, resolveSkillDir() percorre env/.. da app. */
  skillDir?: string;
  /** juiz injetável do protocolo REQUEST/APPLY (exit 10). */
  llmJudge?: LlmJudge;
  /** implementação de spawn() injetável (testável). */
  exec?: typeof spawn;
  /** filesystem promises (testável). */
  fs?: typeof fsp;
  /** raiz de um diretório tmp (default tmpdir()). */
  tmpDir?: string;
  /** resolve o raiz do app para localizar a skill empacotada (testável). */
  getAppPath?: () => string;
  /** timeout padrão em ms do runScript (default 60_000). */
  defaultTimeoutMs?: number;
  /** limite de bytes do stdout capturado (default DEFAULT_OUTPUT_LIMIT). */
  outputLimit?: number;
}

export interface StudyMethodRunner {
  resolveSkillDir(): Promise<string>;
  runScript(name: string, args: string[], opts?: RunScriptOptions): Promise<RunScriptResult>;
  handleExit10(name: string, args: string[], opts?: RunScriptOptions): Promise<HandleExit10Result>;
  createSetup(spec: CreateSetupSpec): Promise<{ setupId: string; setupRoot: string }>;
  newSession(setupRoot: string, goal?: string): Promise<string>;
  createChallenge(
    setupRoot: string,
    c: { language: string; slug: string; concept: string; difficulty?: number; skillLevel?: string },
  ): Promise<{ challengeDirAbs: string; relativePath: string }>;
  verifyChallenge(
    challengeDir: string,
    opts?: { sampleSize?: number; nRep?: number; threshold?: number },
  ): Promise<VerifyChallengeResult>;
  testStudentAnswer(
    challengeDir: string,
    opts?: { outputLimit?: number },
  ): Promise<TestStudentAnswerResult>;
}

/**
 * raiz do app derivada do módulo (default de getAppPath).
 * Na árvore fonte `app/electron/main/services` -> 3 níveis acima = o diretório `app/`;
 * aí `<app>/../skills/study-method` resolve a skill no repo. Em build o bundle vive em
 * `out/main`, e 3 níveis acima também caem numa posição de onde a skill empacotada é
 * alcançável; em produção recomenda-se definir STUDY_METHOD_SKILL_DIR explicitamente.
 */
function moduleAppRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

export function createStudyMethodRunner(deps: StudyMethodRunnerDeps = {}): StudyMethodRunner {
  const fspImp = deps.fs ?? fsp;
  const spawnImp = deps.exec ?? spawn;
  const tmpBase = deps.tmpDir ?? tmpdir();
  const defaultTimeoutMs = deps.defaultTimeoutMs ?? 60_000;
  const outputLimit = deps.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  const getAppPath = deps.getAppPath ?? (() => moduleAppRoot());

  let skillDirResolved: string | null = deps.skillDir ?? null;

  function pickTmpCwd(): Promise<string> {
    return fspImp.mkdtemp(path.join(tmpBase, 'study-runner-'));
  }

  /**
   * Localiza a skill na ordem: env STUDY_METHOD_SKILL_DIR ->
   * path.join(appPath(),'../skills/study-method') -> path.join(appPath(),'skills/study-method').
   * Valida a existência de scripts/setup-init.sh; erro claro se ausente.
   */
  async function resolveSkillDir(): Promise<string> {
    if (skillDirResolved) return skillDirResolved;
    const candidates = new Set<string>();
    const fromEnv = process.env['STUDY_METHOD_SKILL_DIR'];
    if (fromEnv) candidates.add(fromEnv);
    const app = getAppPath();
    candidates.add(path.join(app, '../skills/study-method'));
    candidates.add(path.join(app, 'skills/study-method'));

    for (const cand of candidates) {
      try {
        await fspImp.access(path.join(cand, 'scripts', 'setup-init.sh'));
        skillDirResolved = cand;
        return cand;
      } catch {
        // tenta o próximo candidato
      }
    }
    const tried = [...candidates].join(', ');
    throw new Error(
      `StudyMethodRunner: não encontrei a skill study-method com scripts/setup-init.sh. ` +
        `Defina STUDY_METHOD_SKILL_DIR ou aponte o app para a árvore que contém skills/. ` +
        `Tentei: ${tried}`,
    );
  }

  /**
   * Valida que `name` é um basename simples de script — sem separador de caminho,
   * sem `..`, sem `.`/vazio. NÃO executa nada se inválido (anti path traversal).
   * Retorna a mensagem de erro, ou null quando válido.
   */
  function validateScriptName(name: string): string | null {
    if (name.length === 0) {
      return 'StudyMethodRunner: nome de script vazio';
    }
    if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
      return `StudyMethodRunner: nome de script inválido (path traversal): ${name}`;
    }
    return null;
  }

  /** true quando `target` está ESTRITAMENTE dentro de `baseDir` (bate-se o `.`). */
  function containedIn(baseDir: string, target: string): boolean {
    const rel = path.relative(baseDir, target);
    return rel !== '' && rel !== '.' && !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  async function runScript(
    name: string,
    args: string[],
    opts: RunScriptOptions = {},
  ): Promise<RunScriptResult> {
    // P1: rejeita names que não sejam um basename simples — nada é executado aqui.
    const nameError = validateScriptName(name);
    if (nameError) {
      return { exitCode: -1, stdout: '', stderr: nameError };
    }
    const skillDir = await resolveSkillDir();
    const scriptsDir = path.resolve(skillDir, 'scripts');
    const scriptPath = path.resolve(scriptsDir, name);
    // P1 (dupla checagem): o path FINAL deve estar contido em <skillDir>/scripts/.
    if (!containedIn(scriptsDir, scriptPath)) {
      return {
        exitCode: -1,
        stdout: '',
        stderr: `StudyMethodRunner: nome de script inválido (fora de scripts/): ${name}`,
      };
    }
    try {
      await fspImp.access(scriptPath);
    } catch {
      return {
        exitCode: SKILL_EXIT_CODES.EXEC_ERROR,
        stdout: '',
        stderr: `StudyMethodRunner: script não encontrado: ${scriptPath}`,
      };
    }

    const cwd = opts.cwd ?? (await pickTmpCwd());
    const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      STUDY_METHOD_SKILL_DIR: skillDir,
      ...opts.env,
    };

    return new Promise<RunScriptResult>((resolve) => {
      const child = spawnImp('bash', [scriptPath, ...args], {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const killTimer = timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill('SIGKILL');
            // timeout é reportado como erro de execução, com sinal no stderr.
            resolve({
              exitCode: SKILL_EXIT_CODES.EXEC_ERROR,
              stdout,
              stderr: `${stderr}\nStudyMethodRunner: timeout após ${timeoutMs}ms matando ${name}`.trim(),
            });
          }, timeoutMs)
        : null;

      const finish = (code: number): void => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        resolve({ exitCode: code, stdout: stdout.slice(-outputLimit), stderr });
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (stdout.length > outputLimit) stdout = stdout.slice(-outputLimit);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        resolve({ exitCode: SKILL_EXIT_CODES.EXEC_ERROR, stdout, stderr: `${err.message}` });
      });
      child.on('close', (code) => {
        finish(code ?? SKILL_EXIT_CODES.EXEC_ERROR);
      });
    });
  }

  /**
   * Extrai o PEDIDO JSON de exit 10 do stdout. O protocolo escreve UM JSON na última
   * linha/bloco; a estratégia robusta é procurar a maior substring que parseia como o
   * envelope de PEDIDO (último bloco entre { } a partir do fim).
   */
  function extractRequest(stdout: string): StudyRequestEnvelope | null {
    // tenta a linha inteira por linha, depois o JSON do último bloco balanceado.
    const trimmed = stdout.trim();
    // 1) Se a última linha é um JSON completo, usa-a.
    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{') || !line.endsWith('}')) continue;
      try {
        const parsed = JSON.parse(line);
        if (isRequestEnvelope(parsed)) return parsed;
      } catch {
        // ignora
      }
    }
    // 2) Procura o último bloco balanceado de chaves no stdout inteiro.
    try {
      const parsed = JSON.parse(trimmed);
      if (isRequestEnvelope(parsed)) return parsed;
    } catch {
      // ignora
    }
    // 3) Varre de trás para frente achando o último '{' que fecha num objeto.
    const lastOpen = trimmed.lastIndexOf('{');
    if (lastOpen >= 0) {
      try {
        const parsed = JSON.parse(trimmed.slice(lastOpen));
        if (isRequestEnvelope(parsed)) return parsed;
      } catch {
        // ignora
      }
    }
    return null;
  }

  function isRequestEnvelope(v: unknown): v is StudyRequestEnvelope {
    if (typeof v !== 'object' || v === null) return false;
    const o = v as Record<string, unknown>;
    return (
      typeof o.protocol === 'string' &&
      typeof o.protocol_version === 'string' &&
      typeof o.request_id === 'string' &&
      typeof o.kind === 'string' &&
      typeof o.response_schema === 'string' &&
      typeof o.instructions_pt_br === 'string' &&
      'payload' in o
    );
  }

  /** Validação estrutural leve da RESPOSTA do juiz contra o PEDIDO (docs/00 §6.2/§6.3). */
  function buildApplyFile(
    request: StudyRequestEnvelope,
    judgeItems: unknown,
  ): string | { error: string } {
    // items pode vir como objeto (RESP-2) ou array de 1 (RESP-1). Embrulha.
    let itemsArray: unknown[];
    if (Array.isArray(judgeItems)) {
      if (judgeItems.length === 0) {
        return { error: 'REQUISITOS: a RESPOSTA do juiz não trouxe itens.' };
      }
      if (judgeItems.length > 1) {
        return { error: 'REQUISITOS: items com mais de 1 elemento (RESP-3).' };
      }
      itemsArray = judgeItems;
    } else if (typeof judgeItems === 'object' && judgeItems !== null) {
      itemsArray = [judgeItems];
    } else {
      return { error: 'REQUISITOS: items inválido (não é objeto nem array).' };
    }
    // envelope da RESPOSTA repete protocol/protocol_version/request_id/kind idênticos.
    return JSON.stringify({
      protocol: request.protocol,
      protocol_version: request.protocol_version,
      request_id: request.request_id,
      kind: request.kind,
      items: itemsArray,
    });
  }

  async function handleExit10(
    scriptName: string,
    args: string[],
    opts: RunScriptOptions = {},
  ): Promise<HandleExit10Result> {
    // primeiro ciclo sempre SEM --apply
    let result = await runScript(scriptName, args, opts);
    let cyclesUsed = 0;
    let pendingRequest: StudyRequestEnvelope | null = null;

    for (let cycle = 1; cycle <= REQUEST_APPLY_MAX_CYCLES; cycle++) {
      if (result.exitCode !== SKILL_EXIT_CODES.NEEDS_MODEL_INPUT) break;
      pendingRequest = extractRequest(result.stdout);
      if (!pendingRequest) {
        // exit 10 sem PEDIDO parseável: não podemos responder; retorna degradado.
        // NOTA (não é "apply esgotado" nem "juiz ausente"): o protocolo REQUEST/APPLY
        // está malformado — o script pediu julgamento mas não expôs um envelope
        // JSON parseável, então mesmo com juiz configurado não há o que responder.
        return {
          result,
          cyclesUsed,
          applyExhausted: false,
          protocolIssue: 'request_unparseable',
        };
      }
      if (!deps.llmJudge) {
        // sem juiz em loop de exit 10, não há como responder — degradado.
        // Este é o único caso "juiz ausente" real: executor não configurou llmJudge.
        return {
          result,
          cyclesUsed,
          applyExhausted: false,
        };
      }
      const applyBody = await deps.llmJudge(pendingRequest);
      const applyFile = buildApplyFile(pendingRequest, applyBody);
      if (typeof applyFile === 'object' || typeof applyFile !== 'string') {
        const errMsg = typeof applyFile === 'string' ? applyFile : JSON.stringify(applyFile);
        return {
          result: { ...result, stderr: `${result.stderr}\n${errMsg}`.trim() },
          cyclesUsed,
          applyExhausted: true,
          protocolIssue: 'apply_exhausted',
        };
      }
      const tmpDir = await pickTmpCwd();
      const applyPath = path.join(tmpDir, 'apply-response.json');
      await fspImp.writeFile(applyPath, applyFile, 'utf8');
      cyclesUsed = cycle;
      result = await runScript(scriptName, [...args, '--apply', applyPath], opts);
    }

    return {
      result,
      cyclesUsed,
      applyExhausted: cyclesUsed >= REQUEST_APPLY_MAX_CYCLES && result.exitCode === SKILL_EXIT_CODES.NEEDS_MODEL_INPUT,
      protocolIssue:
        cyclesUsed >= REQUEST_APPLY_MAX_CYCLES && result.exitCode === SKILL_EXIT_CODES.NEEDS_MODEL_INPUT
          ? 'apply_exhausted'
          : undefined,
    };
  }

  async function createSetup(spec: CreateSetupSpec): Promise<{ setupId: string; setupRoot: string }> {
    const args = [
      spec.path,
      '--subject', spec.subject,
      '--subject-slug', spec.subjectSlug,
      '--title', spec.title,
    ];
    if (spec.language) args.push('--language', spec.language);
    if (spec.skillLevel) args.push('--skill-level', spec.skillLevel);
    if (spec.sessionMinutes !== undefined) args.push('--session-minutes', String(spec.sessionMinutes));
    if (spec.theorySource) args.push('--theory-source', spec.theorySource);

    const res = await runScript('setup-init.sh', args);
    if (res.exitCode !== SKILL_EXIT_CODES.OK) {
      throw new Error(`setup-init.sh falhou (exit ${res.exitCode}): ${res.stderr}`);
    }
    const setupId = res.stdout.trim().split('\n').pop() ?? '';
    if (!/^[0-9a-f]{12}$/.test(setupId)) {
      throw new Error(`setup-init.sh não devolveu um setup_id válido: '${res.stdout.trim()}'`);
    }
    return { setupId, setupRoot: spec.path };
  }

  async function newSession(setupRoot: string, goal?: string): Promise<string> {
    const args = [setupRoot];
    if (goal) args.push('--goal', goal);
    const res = await runScript('session-new.sh', args);
    if (res.exitCode !== SKILL_EXIT_CODES.OK) {
      throw new Error(`session-new.sh falhou (exit ${res.exitCode}): ${res.stderr}`);
    }
    const nnnn = res.stdout.trim().split('\n').pop() ?? '';
    if (!/^[0-9]{4}$/.test(nnnn)) {
      throw new Error(`session-new.sh não devolveu um NNNN válido: '${res.stdout.trim()}'`);
    }
    return nnnn;
  }

  async function createChallenge(
    setupRoot: string,
    c: { language: string; slug: string; concept: string; difficulty?: number; skillLevel?: string },
  ): Promise<{ challengeDirAbs: string; relativePath: string }> {
    const args = [setupRoot, '--language', c.language, '--slug', c.slug, '--concept', c.concept];
    if (c.difficulty !== undefined) args.push('--difficulty', String(c.difficulty));
    if (c.skillLevel) args.push('--skill-level', c.skillLevel);

    const res = await runScript('challenge-new.sh', args);
    if (res.exitCode !== SKILL_EXIT_CODES.OK) {
      throw new Error(`challenge-new.sh falhou (exit ${res.exitCode}): ${res.stderr}`);
    }
    const relativePath = res.stdout.trim().split('\n').pop() ?? '';
    if (!/^challenges\/[0-9]{4}-[^/]+$/.test(relativePath)) {
      throw new Error(`challenge-new.sh não devolveu um caminho de desafio válido: '${res.stdout.trim()}'`);
    }
    return { challengeDirAbs: path.resolve(setupRoot, relativePath), relativePath };
  }

  /**
   * challenge-verify.sh — com o fluxo de exit 10 (juiz injetável). Veredito weak/rejected
   * sai exit 0 com o veredito no stdout; approved também. parse do JSON de resumo.
   */
  async function verifyChallenge(
    challengeDir: string,
    opts: { sampleSize?: number; nRep?: number; threshold?: number } = {},
  ): Promise<VerifyChallengeResult> {
    const args = [challengeDir];
    if (opts.sampleSize !== undefined) args.push('--sample-size', String(opts.sampleSize));
    if (opts.nRep !== undefined) args.push('--n-rep', String(opts.nRep));
    if (opts.threshold !== undefined) args.push('--threshold', String(opts.threshold));

    const handled = await handleExit10('challenge-verify.sh', args);
    const res = handled.result;
    if (res.exitCode === SKILL_EXIT_CODES.EXEC_ERROR || res.exitCode === SKILL_EXIT_CODES.USAGE ||
        res.exitCode === SKILL_EXIT_CODES.SCHEMA_FAILED) {
      throw new Error(`challenge-verify.sh falhou (exit ${res.exitCode}): ${res.stderr}`);
    }
    // exit 0: veredito no stdout; exit 10 sem juiz → degradado;
    // exits 3 (setup não encontrado) e 4 (recurso travado) seguem sem throw — o
    // veredito fica 'not_run' e expomos protocolIssue para o orchestrator não mentir.
    const summary = parseVerifySummary(res.stdout);
    const exitIssue =
      res.exitCode === SKILL_EXIT_CODES.SETUP_NOT_FOUND
        ? 'exit_setup_not_found'
        : res.exitCode === SKILL_EXIT_CODES.RESOURCE_LOCKED
          ? 'exit_resource_locked'
          : undefined;
    return {
      verdict: summary?.verdict ?? 'not_run',
      mutationScore: summary?.mutation_score,
      killed: summary?.killed,
      survived: summary?.survived,
      rejections: summary?.rejections ?? [],
      stdout: res.stdout,
      exitCode: res.exitCode,
      applyExhausted: handled.applyExhausted,
      protocolIssue: exitIssue ?? handled.protocolIssue,
    };
  }

  function parseVerifySummary(stdout: string): {
    verdict: string;
    mutation_score?: number;
    killed?: number;
    survived?: number;
    rejections?: string[];
  } | null {
    const trimmed = stdout.trim();
    // o resumo é o último objeto JSON em stdout (pode haver pedidos/logs antes).
    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed.verdict === 'string') {
          const rejections = Array.isArray(parsed.rejections) ? parsed.rejections.map(String) : [];
          return {
            verdict: parsed.verdict,
            mutation_score: typeof parsed.mutation_score === 'number' ? parsed.mutation_score : undefined,
            killed: typeof parsed.killed === 'number' ? parsed.killed : undefined,
            survived: typeof parsed.survived === 'number' ? parsed.survived : undefined,
            rejections,
          };
        }
      } catch {
        // ignora linhas anteriores
      }
    }
    // fallback: a linha `{"verdict":...}` pode não ser a única; tenta parsear o bloco todo
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.verdict === 'string') {
        return {
          verdict: parsed.verdict,
          mutation_score: typeof parsed.mutation_score === 'number' ? parsed.mutation_score : undefined,
          killed: typeof parsed.killed === 'number' ? parsed.killed : undefined,
          survived: typeof parsed.survived === 'number' ? parsed.survived : undefined,
          rejections: Array.isArray(parsed.rejections) ? parsed.rejections.map(String) : [],
        };
      }
    } catch {
      // ignora
    }
    return null;
  }

  /**
   * Resolve o timeout do runner (P2/fidelidade do contrato): lê `meta.json` do
   * workspace copiado e usa `execution.timeout_seconds` (mínimo 5s) como primário;
   * backstop de `defaultMs` (default 60s) quando o meta não existe/é inválido.
   * Devolve o timeout em ms e o mesmo valor em segundos (para o env CHALLENGE_TIMEOUT).
   */
  async function resolveRunnerTimeout(workspace: string, defaultMs: number): Promise<{ timeoutMs: number; timeoutSeconds: number }> {
    const backstopMs = defaultMs > 0 ? defaultMs : 60_000;
    let seconds: number | null = null;
    try {
      const metaPath = path.join(workspace, 'meta.json');
      const raw = await fspImp.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as { execution?: { timeout_seconds?: unknown } };
      const v = meta?.execution?.timeout_seconds;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) seconds = v;
    } catch {
      // meta ausente ou inválido -> cai no backstop.
    }
    if (seconds === null) {
      return { timeoutMs: backstopMs, timeoutSeconds: backstopMs / 1000 };
    }
    const clamped = Math.max(5, seconds);
    return { timeoutMs: Math.round(clamped * 1000), timeoutSeconds: clamped };
  }

  /**
   * Execução determinística da resposta do aluno: copia o workspace do desafio SEM
   * `.solution/` (e `.git`) para tmp e roda `<tmp>/runner.sh` com STUDY_METHOD_SKILL_DIR.
   */
  async function testStudentAnswer(
    challengeDir: string,
    opts: { outputLimit?: number } = {},
  ): Promise<TestStudentAnswerResult> {
    const limit = opts.outputLimit ?? outputLimit;
    const skillDir = await resolveSkillDir();

    // 1) copia o workspace sem .solution/ e .git.
    const tmpWork = await pickTmpCwd();
    await copyWorkspace(challengeDir, tmpWork, fspImp);

    // 2) runner.sh precisa existir no tmp.
    const runnerPath = path.join(tmpWork, 'runner.sh');
    try {
      await fspImp.access(runnerPath);
    } catch {
      return {
        success: false,
        exitCode: RUNNER_EXIT_CODES.CD_FAILED,
        passed: false,
        testsRun: null,
        expectedTests: null,
        verdict: 'missing_runner',
        output: `StudyMethodRunner: runner.sh não encontrado no workspace copiado (${challengeDir}).`,
      };
    }

    // 3) timeout do runner: usa execution.timeout_seconds do meta.json (mín 5s)
    //    como primário; backstop de defaultTimeoutMs (default 60s) quando o meta
    //    não existe ou é inválido. O env CHALLENGE_TIMEOUT (lido pelo runner.sh
    //    do template real) recebe o MESMO valor em segundos para ficar coerente.
    const { timeoutMs, timeoutSeconds } = await resolveRunnerTimeout(tmpWork, defaultTimeoutMs);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      STUDY_METHOD_SKILL_DIR: skillDir,
      CHALLENGE_TIMEOUT: String(timeoutSeconds),
    };
    const res = await new Promise<RunScriptResult>((resolve) => {
      const child = spawnImp('bash', [runnerPath], { cwd: tmpWork, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        resolve({ exitCode: RUNNER_EXIT_CODES.TIMEOUT, stdout, stderr: 'timeout' });
      }, timeoutMs);
      child.stdout?.on('data', (c: Buffer) => {
        stdout += c.toString('utf8');
        if (stdout.length > limit) stdout = stdout.slice(-limit);
      });
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString('utf8');
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: RUNNER_EXIT_CODES.CD_FAILED, stdout, stderr: err.message });
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: code ?? RUNNER_EXIT_CODES.CD_FAILED, stdout, stderr });
      });
    });

    return mapRunnerOutput(res, limit);
  }

  function mapRunnerOutput(res: RunScriptResult, limit: number): TestStudentAnswerResult {
    const stderrNote = res.stderr ? `\n[stderr]\n${res.stderr}` : '';
    const output = `${res.stdout}${stderrNote}`.slice(-limit);
    const parsed = parseRunnerMeta(res.stdout);
    const exitCode = res.exitCode;

    if (exitCode === RUNNER_EXIT_CODES.PASSED) {
      return {
        success: true,
        exitCode,
        passed: true,
        testsRun: parsed.testsRun,
        expectedTests: parsed.expectedTests,
        verdict: parsed.verdict ?? 'passed',
        output,
      };
    }
    if (exitCode === RUNNER_EXIT_CODES.FAILED) {
      return {
        success: true,
        exitCode,
        passed: false,
        testsRun: parsed.testsRun,
        expectedTests: parsed.expectedTests,
        verdict: parsed.verdict ?? 'failed',
        output,
      };
    }
    if (exitCode === RUNNER_EXIT_CODES.COUNT_MISMATCH) {
      return {
        success: true,
        exitCode,
        passed: false,
        testsRun: parsed.testsRun,
        expectedTests: parsed.expectedTests,
        verdict: parsed.verdict ?? 'count_mismatch',
        output,
      };
    }
    if (exitCode === RUNNER_EXIT_CODES.TIMEOUT) {
      return {
        success: true,
        exitCode,
        passed: false,
        testsRun: parsed.testsRun,
        expectedTests: parsed.expectedTests,
        verdict: parsed.verdict ?? 'timeout',
        output,
      };
    }
    if (exitCode === RUNNER_EXIT_CODES.CD_FAILED) {
      return {
        success: false,
        exitCode,
        passed: false,
        testsRun: parsed.testsRun,
        expectedTests: parsed.expectedTests,
        verdict: parsed.verdict ?? 'infra',
        output,
      };
    }
    // exit code desconhecido: trata como falha de infraestrutura (não do aluno).
    return {
      success: false,
      exitCode,
      passed: false,
      testsRun: parsed.testsRun,
      expectedTests: parsed.expectedTests,
      verdict: parsed.verdict ?? 'infra',
      output,
    };
  }

  /** parse das linhas finais do runner.sh: `TESTS_RUN=.. ESPERADO=.. … VEREDITO=..`. */
  function parseRunnerMeta(stdout: string): {
    testsRun: number | null;
    expectedTests: number | null;
    verdict?: string;
  } {
    let testsRun: number | null = null;
    let expectedTests: number | null = null;
    let verdict: string | undefined;
    for (const line of stdout.split('\n')) {
      const tr = /TESTS_RUN=([0-9]+)/.exec(line);
      if (tr) testsRun = Number(tr[1]);
      const ex = /ESPERADO=([0-9]+)/.exec(line);
      if (ex) expectedTests = Number(ex[1]);
      const v = /VEREDITO=(\S+)/.exec(line);
      if (v) verdict = v[1];
    }
    return { testsRun, expectedTests, verdict };
  }

  return {
    resolveSkillDir,
    runScript,
    handleExit10,
    createSetup,
    newSession,
    createChallenge,
    verifyChallenge,
    testStudentAnswer,
  };
}

/** copia recursiva de diretório excluindo `.solution/` e `.git` (e lixo de build). */
async function copyWorkspace(src: string, dest: string, fspImp: typeof fsp): Promise<void> {
  const entries = await fspImp.readdir(src, { withFileTypes: true });
  await fspImp.mkdir(dest, { recursive: true });
  for (const entry of entries) {
    if (entry.name === '.solution' || entry.name === '.git') continue;
    if (entry.name === '__pycache__' || entry.name === '.pytest_cache') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyWorkspace(srcPath, destPath, fspImp);
    } else if (entry.isSymbolicLink()) {
      // não copia symlinks (medida de segurança); falha aberto seria pior.
    } else {
      await fspImp.copyFile(srcPath, destPath);
    }
  }
}