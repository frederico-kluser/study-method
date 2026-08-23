/**
 * electron/main/services/lessonOrchestrator.ts — o LESSON-ORCHESTRATOR (onda3).
 *
 * Orquestra a cadeia completa de geração de uma aula do tutor study-method:
 *
 *   ASSUNTO (subject)
 *     → PESQUISA   (research.plan — platéia: researchPlanner / surf-research)
 *     → AUTORIA    (author — LLM injetável → LessonDraft: aula markdown + desafios)
 *     → MATERIALIZAÇÃO (runner.createSetup + newSession + createChallenge; escreve
 *                       os artefatos do draft no layout EXATO dos scripts)
 *     → VALIDAÇÃO  (runner.verifyChallenge; só 'approved' entra em lesson.challenges)
 *     → done
 *
 * O LLM é INJETADO (AuthorFn + LlmJudge). Este arquivo NÃO importa nenhum client:
 * a fiação (onda3-ui-wiring) monta o autor (deepseek) e o runner JÁ configurado com
 * o juiz (llmJudge). Se o runner vier SEM juiz e a verify devolver `not_run`, o
 * desafio é registrado como rejeitado (nunca descartado em silêncio — DES-2).
 *
 * Contrato congelado em `shared/ipc-contract.ts`: `StudyLesson`, `ChallengeInfo`,
 * `StudyFinding`, `TestAnswerResult`. Tipos da onda em `lessonTypes.ts`.
 *
 * Layout dos artefatos por linguagem (lido dos templates da skill, docs/05 §2):
 *   python     generic      stub.py · tests/test_stub.py · .solution/reference.py
 *   javascript generic      stub.mjs · tests/stub.test.mjs · .solution/reference.mjs
 *   go         go_module    go.mod · stub.go · stub_test.go · .solution/reference.go
 *   rust       cargo_crate  Cargo.toml · src/lib.rs · tests/test_stub.rs · .solution/reference.rs
 *   c          generic      stub.c · tests/test_stub.c · .solution/reference.c (e stub.h)
 * O orquestrador usa os caminhos que o próprio challenge-new.sh gravou em
 * `meta.json.artifacts.*` — assim a materialização respeita o layout EXATO por
 * linguagem sem duplicar a tabela. `runner.sh` gerado pelo script é PRESERVADO.
 *
 * Premissa documentada: o `testCode` da autoria DEVE implementar casos cujos
 * nomes batem com `computeTestName(language, scenario.id)` — é o que o passo 6
 * da validação confere (docs/05 §4.2). CASO o desafio seja rejeitado por isso,
 * ele vai para `rejected` com o veredito, e a fiação pode regenerar o draft.
 */

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import type {
  ChallengeInfo,
  StudyFinding,
  StudyLesson,
  TestAnswerResult,
} from '@shared/ipc-contract';
import type { LlmJudge } from './studyMethodRunner';
import type {
  AuthorFn,
  ChallengeDraft,
  GenerateLessonResult,
  LessonProgress,
  RejectedChallenge,
} from './lessonTypes';

/** Caminho default de setups (aula a aula do aluno). Sobrescrevível por env/DI. */
export function defaultSetupsDir(): string {
  return process.env.STUDY_METHOD_SETUPS_DIR || path.join(os.homedir(), '.local/share/study-method/setups');
}

/** Slugs: intervalo máximo (chars) no diretório setups/<slug>. */
const SLUG_MAX_LENGTH = 40;

/**
 * kebab-case ASCII a partir de um texto livre (assunto). Acentos/como espaços.
 * Removemos caracteres de controle e reduzimos a ~SLUG_MAX_LENGTH mantendo o
 * kebab-case bem-formado (documenta como o setup do aluno é nomeado).
 */
export function slugify(subject: string): string {
  const clean = (subject || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // não-alfanumérico → '-'
    .replace(/^-+|-+$/g, '') // sem hífens nas pontas
    .replace(/-{2,}/g, '-'); // sem duplo hífen
  const slug = clean || 'aula';
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  // corta numa fronteira de hífen para não partir uma palavra
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  const base = lastDash > 0 ? cut.slice(0, lastDash) : cut;
  return base.replace(/-+$/g, '') || slug.slice(0, SLUG_MAX_LENGTH);
}

/**
 * Extensões de arquivo por linguagem (mapeamento quem lê/gera os artefatos).
 * Formato: `[extPrimária, ...extras]` (ex.: c → ['c','h']). A extensão PRIMÁRIA
 * é a da implementação de referência (`.solution/reference.<ext>`).
 */
export function mapLanguageExtension(language: string): string[] {
  switch ((language || '').toLowerCase()) {
    case 'python':
      return ['py'];
    case 'javascript':
    case 'node':
      return ['mjs'];
    case 'go':
      return ['go'];
    case 'rust':
      return ['rs'];
    case 'c':
    case 'c++':
    case 'cpp':
      return ['c', 'h'];
    default:
      return [];
  }
}

/**
 * Mesmo mapeamento de `ch_test_name` do challenge-new.sh: o nome EXATO do caso
 * como o runner o reporta — é esse o `scenarios[].test_name` do meta.json que o
 * passo 6 da validação confere contra a saída do runner (docs/05 §4.2).
 */
export function computeTestName(language: string, scenarioId: string): string {
  const lang = (language || '').toLowerCase();
  if (lang === 'python') return `test_${scenarioId}`;
  if (lang === 'go') {
    const camel = scenarioId
      .split('_')
      .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
      .join('');
    return `Test${camel}`;
  }
  // javascript / node / rust / c usam o nome curto do id diretamente.
  return scenarioId;
}

/** Lê e faz parse do meta.json de um desafio. Lança se ausente/JSON inválido. */
export async function readMetaJson(challengeDir: string): Promise<Record<string, unknown>> {
  const raw = await fsp.readFile(path.join(challengeDir, 'meta.json'), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`meta.json inválido (não é objeto): ${challengeDir}`);
  }
  return parsed;
}

/** Shape mínimo do meta.json que o orquestrador precisa (paths dos artefatos). */
export interface MetaShape {
  challenge_id?: unknown;
  title?: unknown;
  difficulty?: unknown;
  skill_level?: unknown;
  updated_at?: unknown;
  artifacts?: {
    statement_path?: unknown;
    stub_path?: unknown;
    test_path?: unknown;
    reference_path?: unknown;
  };
  target_concepts?: unknown;
  scenarios?: unknown;
  execution?: { expected_test_count?: unknown };
}

export interface LessonOrchestratorDeps {
  /** `plan` do researchPlanner (PESQUISA). */
  research: { plan(subject: string, opts?: unknown): Promise<{ subject: string; queries: string[]; findings: StudyFinding[]; createdAt: string }> };
  /** Subconjunto do StudyMethodRunner usado na materialização/validação. */
  runner: {
    resolveSkillDir(): Promise<string>;
    createSetup(spec: {
      path: string;
      subject: string;
      subjectSlug: string;
      title: string;
      language?: string;
      skillLevel?: string;
      sessionMinutes?: number;
      theorySource?: string;
    }): Promise<{ setupId: string; setupRoot: string }>;
    newSession(setupRoot: string, goal?: string): Promise<string>;
    createChallenge(
      setupRoot: string,
      c: { language: string; slug: string; concept: string; difficulty?: number; skillLevel?: string },
    ): Promise<{ challengeDirAbs: string; relativePath: string }>;
    verifyChallenge(challengeDir: string, opts?: { sampleSize?: number; nRep?: number; threshold?: number }): Promise<{
      verdict: string;
      mutationScore?: number;
      killed?: number;
      survived?: number;
      rejections: string[];
      stdout: string;
      applyExhausted?: boolean;
      /** exit code cru do script (infra 3/4 não lançam; ver studyMethodRunner.verifyChallenge). */
      exitCode?: number;
      /** discriminador honesto do not_run; ver HandleExit10Result.protocolIssue. */
      protocolIssue?: 'request_unparseable' | 'apply_exhausted' | 'exit_setup_not_found' | 'exit_resource_locked';
    }>;
    testStudentAnswer(challengeDir: string, opts?: { outputLimit?: number }): Promise<{
      success: boolean;
      exitCode: number;
      passed: boolean;
      testsRun: number | null;
      expectedTests: number | null;
      verdict?: string;
      output: string;
    }>;
  };
  /** Autor (LLM injetável) — nunca importa client aqui. */
  author: AuthorFn;
  /** declarado para a assinatura de pull (o juiz vai no runner.createStudyMethodRunner). */
  judge?: LlmJudge;
  /** Diretório onde os setups são criados (default: defaultSetupsDir()). */
  setupsDir?: string;
  /** Resolve o diretório generated/ dentro de um setup (default: <setupRoot>/docs/generated). */
  getGeneratedDir?: (setupRoot: string) => string;
}

export interface GenerateLessonOptions {
  onProgress?: (p: LessonProgress) => void;
  language?: string;
  difficulty?: number;
  concept?: string;
  goal?: string;
  memory?: { whatWorked?: string[]; whatDidntWork?: string[]; proficiency?: Record<string, string> };
}

export interface ListSetupsResult {
  rows: Array<{ setupId: string; setupRoot: string; subjectSlug?: string }>;
}

/** Resultado da materialização de UM desafio (exportado p/ os testes). */
export interface MaterializedChallenge {
  challengeDirAbs: string;
  relativePath: string;
  challengeId: string;
  meta: MetaShape;
}

/**
 * Factory do lesson-orchestrator. O runner passado já deve estar configurado com
 * o llmJudge quando se quiser que `verifyChallenge` classifique sobreviventes
 * (do contrário o veredito será `not_run` e o desafio irá para `rejected`).
 */
export function createLessonOrchestrator(deps: LessonOrchestratorDeps) {
  const setupsDir = deps.setupsDir ?? defaultSetupsDir();
  const getGeneratedDir = deps.getGeneratedDir ?? ((setupRoot: string) => path.join(setupRoot, 'docs', 'generated'));

  function emit(
    p: ((x: LessonProgress) => void) | undefined,
    next: LessonProgress,
  ): void {
    p?.(next);
  }

  function challengeIdFromDir(relativePath: string): string {
    const base = path.basename(relativePath);
    const id = base.split('-')[0] ?? '';
    return /^[0-9]{4}$/.test(id) ? id : '';
  }

  /**
   * Materializa UM desafio: chama createChallenge (gera o esqueleto com runner.sh
   * e meta.json coerentes por linguagem) e então SOBRESCREVE os artefatos da
   * autoria nos paths que o próprio script registrou em meta.json.artifacts.*.
   */
  async function materializeChallenge(
    setupRoot: string,
    draft: ChallengeDraft,
    difficulty: number | undefined,
    language: string | undefined,
  ): Promise<MaterializedChallenge> {
    const ch = await deps.runner.createChallenge(setupRoot, {
      language: language ?? draft.language,
      slug: slugifySafely(draft.slug),
      concept: draft.concept,
      difficulty: difficulty ?? draft.difficulty,
      skillLevel: draft.skillLevel,
    });

    const meta = (await readMetaJson(ch.challengeDirAbs)) as MetaShape;
    const artifacts = meta.artifacts ?? {};
    const stubPath = path.join(ch.challengeDirAbs, String(artifacts.stub_path ?? ''));
    const testPath = path.join(ch.challengeDirAbs, String(artifacts.test_path ?? ''));
    const referencePath = path.join(ch.challengeDirAbs, String(artifacts.reference_path ?? ''));
    const statementPath = path.join(ch.challengeDirAbs, String(artifacts.statement_path ?? 'README.md'));

    await fsp.mkdir(path.dirname(stubPath), { recursive: true });
    await fsp.mkdir(path.dirname(testPath), { recursive: true });
    await fsp.mkdir(path.dirname(referencePath), { recursive: true }); // cria .solution/ se preciso

    await fsp.writeFile(stubPath, draft.stubCode, 'utf8');
    await fsp.writeFile(testPath, draft.testCode, 'utf8');
    await fsp.writeFile(referencePath, draft.referenceCode, 'utf8');
    await fsp.writeFile(statementPath, draft.statement, 'utf8');

    await writeMeta(ch.challengeDirAbs, meta, draft, difficulty);
    return {
      challengeDirAbs: ch.challengeDirAbs,
      relativePath: ch.relativePath,
      challengeId: challengeIdFromDir(ch.relativePath) || String(meta['challenge_id'] ?? ''),
      meta,
    };
  }

  /** merge dos campos da AUTORIA no meta.json materializado (runner.sh é preservado). */
  async function writeMeta(
    challengeDir: string,
    existing: MetaShape,
    draft: ChallengeDraft,
    difficulty: number | undefined,
  ): Promise<void> {
    const now = new Date().toISOString();
    const lang = normalizeLanguage(languageOf(draft.language));
    const scenarios = draft.scenarios.map((s) => {
      // `description` tem minLength 5 no schema do meta.json (verificador mínimo).
      const description = normalizeDescription(s.description ?? s.name, s.id);
      return {
        scenario_id: s.id,
        test_name: computeTestName(lang, s.id),
        kind: s.type,
        description,
        ...(s.expected ? { failure_message_template: `${s.name}: esperado ${s.expected}` } : {}),
      };
    });
    const expected = draft.expectedTestCount ?? scenarios.length;

    const updated: Record<string, unknown> = {
      ...(existing as Record<string, unknown>),
      title: draft.title,
      difficulty: difficulty ?? draft.difficulty ?? (existing.difficulty ?? 2),
      skill_level: draft.skillLevel ?? (existing.skill_level ?? 'beginner'),
      updated_at: now,
      scenarios,
      target_concepts: existing.target_concepts ?? [
        { concept_id: draft.concept, label: draft.concept, role: 'primary' },
      ],
    };
    const execution = (existing.execution ?? {}) as Record<string, unknown>;
    updated.execution = { ...execution, expected_test_count: expected };

    await fsp.writeFile(
      path.join(challengeDir, 'meta.json'),
      JSON.stringify(updated, null, 2),
      'utf8',
    );
  }

  /**
   * Gera UMA aula completa. Emite progresso nas 5 fases; retorna a StudyLesson
   * (challenges = SÓ aprovados) + os rejeitados. Erros intermediários vão para
   * onProgress({phase:'error'}) e são re-thrown com mensagem clara.
   */
  async function generateLesson(
    subject: string,
    opts: GenerateLessonOptions = {},
  ): Promise<GenerateLessonResult> {
    const onProgress = opts.onProgress;
    try {
      // 1) PESQUISA
      emit(onProgress, { phase: 'research', message: `Pesquisando "${subject}"…`, fraction: 0.1 });
      const plan = await deps.research.plan(subject);
      const findings = plan.findings ?? [];

      // 2) AUTORIA
      emit(onProgress, { phase: 'authoring', message: 'Autorando a aula…', fraction: 0.35 });
      const draft = await deps.author({ subject, findings, memory: opts.memory });

      // 3) MATERIALIZAÇÃO
      const slug = slugify(subject);
      emit(onProgress, { phase: 'materializing', message: `Criando setup ${slug}…`, fraction: 0.55 });
      const setupPath = path.join(setupsDir, slug);
      const setup = await deps.runner.createSetup({
        path: setupPath,
        subject,
        subjectSlug: slug,
        title: draft.lessonTitle,
        language: opts.language,
        skillLevel: undefined,
      });
      const session = await deps.runner.newSession(setup.setupRoot, opts.goal ?? `Aula sobre ${subject}`);

      const challengeInfos: ChallengeInfo[] = [];
      const rejected: RejectedChallenge[] = [];
      const total = draft.challenges.length;
      for (let i = 0; i < total; i++) {
        const challengeDraft = draft.challenges[i];
        const label = `"${challengeDraft.title ?? challengeDraft.slug}"`;
        emit(onProgress, {
          phase: 'materializing',
          message: `Materializando desafio ${i + 1}/${total}: ${label}`,
          fraction: 0.55 + (0.2 * i) / Math.max(1, total),
        });
        const materialized = await materializeChallenge(
          setup.setupRoot,
          challengeDraft,
          opts.difficulty,
          opts.language,
        );

        // 4) VALIDAÇÃO
        emit(onProgress, {
          phase: 'validating',
          message: `Validando desafio ${i + 1}/${total}: ${label}`,
          fraction: 0.75 + (0.2 * i) / Math.max(1, total),
        });
        const v = await deps.runner.verifyChallenge(materialized.challengeDirAbs);

        if (v.verdict === 'approved') {
          challengeInfos.push({
            challengeId: materialized.challengeId,
            title: challengeDraft.title,
            language: languageOf(challengeDraft.language),
            concept: challengeDraft.concept,
            difficulty: opts.difficulty ?? challengeDraft.difficulty ?? 2,
            status: 'validated',
            verdict: v.verdict,
            workspaceDir: materialized.challengeDirAbs,
            statementPath: path.join(materialized.challengeDirAbs, 'README.md'),
          });
        } else {
          // `not_run` tem VÁRIAS origens distintas e não devemos confundi-las.
          // O runner expõe `protocolIssue` (studyMethodRunner.verifyChallenge) para
          // sermos factuais sobre POR QUE o veredito não aconteceu:
          //  - 'request_unparseable': exit 10 sem envelope REQUEST parseável.
          //  - 'apply_exhausted'     : juiz chamado, mas os 2 ciclos esgotaram/recusou.
          //  - 'exit_setup_not_found': exit 3 (setup não encontrado pelo script).
          //  - 'exit_resource_locked': exit 4 (recurso travado).
          //  - undefined: caminho normal (rejected/weak) OU runner sem llmJudge.
          const reason =
            v.verdict === 'not_run'
              ? v.protocolIssue === 'request_unparseable'
                ? 'protocolo REQUEST/APPLY malformado (exit 10 sem pedido parseável)'
                : v.protocolIssue === 'apply_exhausted'
                  ? 'apply/esgotado (juiz não decidiu em 2 ciclos ou resposta recusada)'
                  : v.protocolIssue === 'exit_setup_not_found'
                    ? 'setup não encontrado pelo script (exit 3)'
                    : v.protocolIssue === 'exit_resource_locked'
                      ? 'recurso travado (exit 4)'
                      : v.applyExhausted === true
                        ? 'apply/esgotado (juiz não decidiu em 2 ciclos)'
                        : 'juiz ausente (runner sem llmJudge); veredito not_run'
              : v.rejections?.join(', ') || 'rejeitado na validação';
          rejected.push({ slug: challengeDraft.slug, verdict: v.verdict, reason });
        }
      }

      const lesson: StudyLesson = {
        title: draft.lessonTitle,
        subject,
        markdown: draft.lessonMarkdown,
        findings,
        challenges: challengeInfos,
        createdAt: new Date().toISOString(),
      };

      emit(onProgress, { phase: 'done', message: 'Aula pronta.', fraction: 1 });
      return { lesson, rejected };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit(onProgress, { phase: 'error', message: msg });
      throw new Error(`generateLesson("${subject}") falhou: ${msg}`, { cause: err });
    }
  }

  async function testAnswer(challengeDir: string, opts?: { outputLimit?: number }): Promise<TestAnswerResult> {
    const r = await deps.runner.testStudentAnswer(challengeDir, opts);
    return {
      success: r.success,
      testsRun: r.testsRun ?? 0,
      expectedTests: r.expectedTests ?? 0,
      passed: r.passed,
      output: r.output,
      verdictFeedback: r.verdict,
    };
  }

  async function listSetups(): Promise<ListSetupsResult> {
    const items = await readSetupInstances(setupsDir);
    return { rows: items };
  }

  async function resolveSkillDirInfo(): Promise<{ skillDir: string }> {
    const dir = await deps.runner.resolveSkillDir();
    return { skillDir: dir };
  }

  return {
    generateLesson,
    testAnswer,
    listSetups,
    resolveSkillDirInfo,
    setupsDir,
    getGeneratedDir,
    // Expor `materializeChallenge` permite aos testes provar a materialização em
    // layouts NÃO-python (go/rust/c) com fakes (o gap da revisão), sem re-implementar.
    materializeChallenge,
  };
}

/** aceita 'node' → 'javascript' (o enum dos scripts não tem 'node'; docs/05 §2.3). */
function normalizeLanguage(lang: string): string {
  const l = (lang || '').toLowerCase();
  return l === 'node' ? 'javascript' : l;
}

/** Garante description >= 5 chars (minLength do schema de meta.json). */
function normalizeDescription(desc: string, scenarioId: string): string {
  const d = (desc || '').trim();
  if (d.length >= 5) return d;
  return `Cenário ${scenarioId}: ${d}`.trim() || `Cenário ${scenarioId}`;
}

/** linguagem efetiva usada para o test_name (draft.language ou o sub-ópção). */
function languageOf(raw: string | undefined): string {
  return normalizeLanguage((raw || 'python').toLowerCase());
}

/** slug de desafio: preserva o kebab-case do draft (fallback seguro se vazio). */
function slugifySafely(slug: string): string {
  const s = (slug || '').trim();
  return s || 'challenge';
}

/** Lê setups criados em <setupsDir> (subdiretórios com setup.json). */
async function readSetupInstances(setupsDir: string): Promise<Array<{ setupId: string; setupRoot: string; subjectSlug?: string }>> {
  let entries;
  try {
    entries = await fsp.readdir(setupsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const rows: Array<{ setupId: string; setupRoot: string; subjectSlug?: string }> = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const setupRoot = path.join(setupsDir, ent.name);
    const metaPath = path.join(setupRoot, 'setup.json');
    try {
      const raw = await fsp.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw) as { setup_id?: unknown; subject_slug?: unknown };
      rows.push({
        setupId: typeof meta.setup_id === 'string' ? meta.setup_id : '',
        setupRoot,
        subjectSlug: typeof meta.subject_slug === 'string' ? meta.subject_slug : ent.name,
      });
    } catch {
      // sem setup.json legível: ignora este diretório
    }
  }
  return rows;
}