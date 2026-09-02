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
 * a fiação (onda3-ui-wiring) monta o autor (LLM remoto) e o runner JÁ configurado com
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
  LessonExercise,
  ResearchProgressEvent,
  StudyFinding,
  StudyLesson,
  TestAnswerResult,
} from '@shared/ipc-contract';
import type { LlmJudge } from './studyMethodRunner';
import type {
  AuthorFn,
  ChallengeDraft,
  GenerateLessonResult,
  LessonDomain,
  LessonProgress,
  RejectedChallenge,
} from './lessonTypes';
import { generateMathProblem, pickMathExercise, type MathFamily } from './mathLib';

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
 * ONDA4 (nunca-repetir): slug ESTÁVEL de um desafio — basename do workspaceDir
 * SEM o prefixo NNNN ('challenges/0007-fatorial-recursivo' → 'fatorial-recursivo').
 * Exportada porque o handler list-challenges (study-handlers) usa EXATAMENTE a
 * mesma string no ChallengeInfo.slug; a UI grava a MESMA string nas tentativas
 * (mark-challenge-attempt) — o nunca-repetir compara slug vs slugs tentados.
 */
export function stableChallengeSlug(workspaceDir: string): string {
  const base = path.basename(workspaceDir || '');
  return base.replace(/^[0-9]{4}-/, '') || base;
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
    /** Cópia canônica do stub (.solution/empty_stub.<ext>) — passo 1 do harness. */
    empty_stub_path?: unknown;
    /** Implementações alternativas corretas (.solution/reference_alt_*.<ext>) — passo 3. */
    reference_alt_paths?: unknown;
    /** Arquivos de suporte por linguagem — para C o seed lista `stub.h` (fix-c-stubh). */
    support_paths?: unknown;
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
    newSession(setupRoot: string, goal?: string, opts?: { reuseLive?: boolean }): Promise<string>;
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
  /**
   * ADITIVO (onda2-research-live): resolve o subject_id de um desafio na camada
   * SQL quando PERSISTIDO (challenges→lessons→subject_id / challenge_attempts).
   * null/ausente ⇒ ChallengeInfo.subjectId fica undefined (aula recém-gerada
   * normalmente ainda não tem linha persistida). Ausente ⇒ subjectId undefined.
   */
  resolveSubjectId?: (challengeId: string) => Promise<string | null>;
  /**
   * ONDA4 (desafio-persistencia): repo de persistência (subconjunto estrutural
   * do LessonRepo real). Presente ⇒ a geração persiste o subject (upsert ANTES
   * de gerar o exercício — para o seed por tentativa da math) e a lição
   * (createLesson DEPOIS da validação), e devolve lessonId/subjectId reais.
   * Ausente ⇒ nada é persistido e os ids ficam undefined (comportamento das
   * ondas anteriores, retrocompat com os testes sem repo).
   */
  repo?: LessonPersistRepoLike;
}

/**
 * ONDA4: subconjunto do repo (db/repo.ts) usado pelo orquestrador — estrutural,
 * DI-friendly (o LessonRepo real satisfaz; fakes de teste implementam só isto).
 */
export interface LessonPersistRepoLike {
  upsertSubject(
    name: string,
    domain?: LessonDomain,
  ): Promise<{ subject: { id: string; name: string; slug: string; domain: LessonDomain }; slug: string }>;
  listAttemptedChallengeSlugs(subjectId?: string): Promise<string[]>;
  createLesson(input: {
    subjectSlug: string;
    title: string;
    body: string;
    difficulty?: number;
    exercise?: LessonExercise;
    challenge?: {
      slug: string;
      title: string;
      language: string;
      concept: string;
      difficulty?: number;
      statement: string;
      testCasesJson: string;
      solutionJson: string;
    };
  }): Promise<string>;
}

export interface GenerateLessonOptions {
  onProgress?: (p: LessonProgress) => void;
  /**
   * ADITIVO (onda2-research-live): push dos eventos `research:*` da pesquisa
   * Brave (canal study:research-progress) — repassado ao researchPlanner.plan.
   */
  onResearchProgress?: (ev: ResearchProgressEvent) => void;
  language?: string;
  difficulty?: number;
  concept?: string;
  goal?: string;
  memory?: { whatWorked?: string[]; whatDidntWork?: string[]; proficiency?: Record<string, string> };
  /**
   * ADITIVO (onda3-respostas): domínio da aula vindo da UI. Ausente ⇒
   * `resolveLessonDomain(subject)` (heurística por palavra-chave no assunto,
   * default 'programming'). 'math' ativa o caminho de matemática: exercício
   * gerado/conferido pela mathLib ANTES da autoria, sem desafio de código TDD.
   */
  domain?: LessonDomain;
  /**
   * ONDA4 (nunca-repetir): salt EXPLÍCITO do exercício de matemática
   * (pickMathExercise(subject, salt)). Quando o repo está presente, o
   * orquestrador calcula sozinho `${subject}#<n>` (n = tentativas registradas
   * do subject) ANTES de gerar o exercício — `mathSeed` é o OVERRIDE para
   * testes/UI. Ausente + sem repo = comportamento atual (sem salt).
   */
  mathSeed?: string;
}

/**
 * Resolução de domínio da aula (onda3-respostas): `opts.domain` explícito da UI
 * tem precedência; senão heurística por palavra-chave no assunto (normalizado
 * sem acentos, lowercase). Palavras-chave de matemática: matematica, algebra,
 * geometria, aritmetica, porcentagem, fracao, equacao (e plurais).
 * Default: 'programming'. Função pura — testada em tests/lessonOrchestrator.test.ts.
 */
const MATH_KEYWORDS = [
  'matematica',
  'matematicas',
  'algebra',
  'geometria',
  'aritmetica',
  'porcentagem',
  'porcentagens',
  'fracao',
  'fracoes',
  'equacao',
  'equacoes',
] as const;

export function resolveLessonDomain(subject: string, explicit?: LessonDomain): LessonDomain {
  if (explicit === 'math' || explicit === 'programming') return explicit;
  const normalized = String(subject ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (MATH_KEYWORDS.some((kw) => normalized.includes(kw))) return 'math';
  return 'programming';
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

  /** ONDA4: slug estável do desafio (mesma função exportada no módulo). */
  function stableSlugFromDir(dir: string): string {
    return stableChallengeSlug(dir);
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

    // -- ocultos de .solution/ que o harness VALIDA (challenge-verify.sh) --------
    // empty_stub é a CÓPIA CANÔNICA do stub recem-materializado (semântica de
    // challenge-new.sh §12: "empty_stub e a COPIA CANONICA do stub recem-materializado",
    // o que permite reexecutar o passo 1 depois que o aluno edita o stub). Como a
    // autoria substitui o stub, ela também substitui a cópia canônica — senão a
    // assinatura placeholder da semente quebra a compilação do teste contra o stub
    // vazio (zero_tests_executed) e o desafio é rejeitado no passo 1.
    const rawEmptyStub = artifacts.empty_stub_path;
    if (typeof rawEmptyStub === 'string' && rawEmptyStub.length > 0) {
      const emptyStubPath = path.join(ch.challengeDirAbs, rawEmptyStub);
      await fsp.mkdir(path.dirname(emptyStubPath), { recursive: true });
      await fsp.writeFile(emptyStubPath, draft.stubCode, 'utf8');
    }
    // reference_alt_*: implementações alternativas CORRETAS, com a MESMA assinatura
    // (passo 3 do harness — o teste DEVE aceitá-las; senão rejects_correct_alternative).
    // Fallback para a referenceCode em paths além das alternativas autoradas, para
    // nunca deixar um path declarado no meta sem conteúdo compilável.
    if (Array.isArray(artifacts.reference_alt_paths)) {
      const altPaths = artifacts.reference_alt_paths.map((p) =>
        path.join(ch.challengeDirAbs, String(p)),
      );
      for (let i = 0; i < altPaths.length; i++) {
        await fsp.mkdir(path.dirname(altPaths[i]), { recursive: true });
        await fsp.writeFile(altPaths[i], draft.referenceAlternates?.[i] ?? draft.referenceCode, 'utf8');
      }
    }

    // -- stub.h (C): regrava o header do seed com a assinatura AUTORADA ------------
    // O seed (challenge-new.sh §11) grava `stub.h` na RAIZ do desafio com o
    // protótipo TOY (`long <funcao>(long n)`) — SUPPORT_PATHS '["stub.h",".build/"]'
    // — e o build_command compila `gcc stub.c tests/test_stub.c`, onde
    // tests/test_stub.c faz `#include "../stub.h"` (NUNCA o ../stub.c: incluir o
    // .c daria dupla definição no link). Para uma assinatura autorada NÃO-toy
    // (multi-arg, arrays, retorno não-long), o protótipo da semente CONFLITA com
    // a definição do stub.c autorado → gcc rejeita o teste e o passo 0 do harness
    // vira build_failed/zero_tests_executed — MESMO com stub/test/reference/
    // alternates consistentes (fix-c-stubh; mesma classe do Rust que a onda
    // eliminou). Aqui derivamos o protótipo do stubCode AUTORADO (até o primeiro
    // '{' com parênteses fechados) e regravamos o stub.h no MESMO formato do seed
    // (`#ifndef STUB_H / #define STUB_H / <protótipo>; / #endif`). Se a extração
    // falhar (sem '{' — stubCode é só um protótipo) ou o stub.h não existir, o
    // header do seed é PRESERVADO — comportamento atual, nunca pior que hoje.
    if (normalizeLanguage(languageOf(language ?? draft.language)) === 'c') {
      const supportPaths = Array.isArray(artifacts.support_paths)
        ? artifacts.support_paths.map((p) => String(p))
        : [];
      const headerRel = supportPaths.find((p) => /stub\.h$/.test(p));
      if (headerRel !== undefined) {
        const stubHeaderPath = path.join(ch.challengeDirAbs, headerRel);
        const proto = extractCPrototype(draft.stubCode);
        if (proto !== null && (await fileExists(stubHeaderPath))) {
          await fsp.writeFile(
            stubHeaderPath,
            `#ifndef STUB_H\n#define STUB_H\n\n${proto};\n\n#endif\n`,
            'utf8',
          );
        }
      }
    }

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
      // O planner emite os events `research:*` (plan/query-start/query-done/
      // round-start/round-done/done) via onResearchProgress — o handler os
      // repassa ao canal study:research-progress. Sem callback, só o progresso
      // por fases (study:lesson-progress) é emitido (retrocompat).
      const plan = await deps.research.plan(subject, { onProgress: opts.onResearchProgress });
      const findings = plan.findings ?? [];

      // ADITIVO (onda3-respostas): resolução de domínio + exercício de
      // matemática. O esperado é COMPUTADO pela mathLib AGORA (= conferido
      // ANTES de gerar — regra do produto, DES-6): o LLM NUNCA inventa números
      // para matemática; ele só recebe o prompt do exercício no contexto.
      const domain = resolveLessonDomain(subject, opts.domain);

      // ONDA4 (nunca-repetir): persistência do subject + seed por tentativa.
      // A ORDEM IMPORTA: upsertSubject + contagem de tentativas acontecem ANTES
      // de gerar o exercício (pickMathExercise) — cada tentativa nova (certa ou
      // errada) incrementa n e o salt `${subject}#${n}` muda o problema
      // ("errou → outro problema"). Sem repo (ou com `mathSeed` explícito da
      // UI/teste), o seed fica o atual (determinístico por assunto).
      let subjectId: string | undefined;
      let lessonId: string | undefined;
      let mathSeed: string | undefined;
      if (deps.repo) {
        try {
          const upserted = await deps.repo.upsertSubject(subject, domain);
          subjectId = upserted.subject.id;
          const attempts = await deps.repo.listAttemptedChallengeSlugs(subjectId);
          mathSeed = `${subject}#${attempts.length}`;
        } catch (err) {
          // Persistência falhou: NÃO derruba a geração — segue sem ids (o
          // assunto/lição simplesmente não fica na Trilha; a UI ainda recebe a
          // aula, como nas ondas anteriores). Loga no stderr do main.
          console.error(
            '[lessonOrchestrator] persistência do subject falhou (aula seguirá sem ids):',
            err instanceof Error ? err.message : err,
          );
          subjectId = undefined;
          mathSeed = undefined;
        }
      }
      const exerciseSalt = opts.mathSeed ?? mathSeed;
      const mathExercise: LessonExercise | undefined =
        domain === 'math'
          ? (() => {
              const { family, seed } = pickMathExercise(subject, exerciseSalt);
              const problem = generateMathProblem(family, seed);
              return {
                kind: 'math',
                family,
                seed,
                prompt: problem.prompt,
                expectedNormalized: problem.normalized,
              };
            })()
          : undefined;

      // 2) AUTORIA
      emit(onProgress, {
        phase: 'authoring',
        message: domain === 'math' ? 'Autorando a aula de matemática…' : 'Autorando a aula…',
        fraction: 0.35,
      });
      const draft = await deps.author({
        subject,
        findings,
        memory: opts.memory,
        domain,
        // O autor recebe o exercício SEM o esperado (não revela a resposta).
        mathExercise: mathExercise
          ? {
              kind: mathExercise.kind,
              family: mathExercise.family,
              seed: mathExercise.seed,
              prompt: mathExercise.prompt,
            }
          : undefined,
      });

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
      // Fix15-list-challenges: expõe o setup materializado no progresso (aditivo,
      // sem refatorar o ensaio). O handler grava memory.lastSetupRoot/setupId a
      // partir daqui — permitindo list-challenges sem a UI repassar setupRoot.
      emit(onProgress, {
        phase: 'materializing',
        message: `Setup criado: ${setup.setupRoot}`,
        fraction: 0.575,
        setupRoot: setup.setupRoot,
        setupId: setup.setupId,
      });
      // fix-session-reuse: geração pode reusar a sessão viva do setup (exit 4 da skill);
      // o retorno é ignorado — só precisa que EXISTA uma sessão para registrar os desafios.
      const session = await deps.runner.newSession(setup.setupRoot, opts.goal ?? `Aula sobre ${subject}`, { reuseLive: true });

      const challengeInfos: ChallengeInfo[] = [];
      const rejected: RejectedChallenge[] = [];
      // ONDA4: drafts APROVADOS (com slug estável) — o 1º alimenta o challenge
      // do createLesson persistido (a tabela challenges tem UMA linha por
      // lesson; os demais aprovados vivem só no setup/workspace e na UI).
      const approvedChallenges: Array<{ draft: ChallengeDraft; slug: string; dir: string }> = [];

      if (domain === 'math') {
        // 4) VALIDAÇÃO DE MATEMÁTICA (onda3-respostas): não há código TDD para
        // matemática pura — a verificação É a mathLib (DES-6). O exercício foi
        // computado pela biblioteca ANTES da autoria (conferido antes de gerar);
        // aqui RE-verificamos re-computando (family, seed): se a biblioteca não
        // reproduzir o prompt/esperado anexado à aula, a aula é ABORTADA — um
        // problema de matemática nunca chega ao aluno sem estar conferido.
        emit(onProgress, {
          phase: 'validating',
          message: 'Conferindo o exercício de matemática…',
          fraction: 0.75,
        });
        if (!mathExercise) {
          const msg = `generateLesson("${subject}") [math] falhou: aula de matemática sem exercício gerado pela mathLib.`;
          emit(onProgress, { phase: 'error', message: msg });
          throw new Error(msg);
        }
        // family vem do contrato (string); a mathLib valida o enum em runtime.
        const recheck = generateMathProblem(mathExercise.family as MathFamily, mathExercise.seed);
        if (recheck.prompt !== mathExercise.prompt || recheck.normalized !== mathExercise.expectedNormalized) {
          const msg =
            `generateLesson("${subject}") [math] falhou: exercício não conferido pela mathLib ` +
            `(re-computação divergente do esperado "${mathExercise.expectedNormalized}").`;
          emit(onProgress, { phase: 'error', message: msg });
          throw new Error(msg);
        }
        // PULA verifyChallenge (sem TDD); desafios de código não existem para 'math'
        // (o draft é validado com challenges: [] pelo autor) — challengeInfos fica [].
      } else {
        // 3/4) MATERIALIZAÇÃO + VALIDAÇÃO TDD — fluxo 'programming' INTACTO.
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
            // ADITIVO (onda2-research-live): subjectId quando o desafio JÁ está
            // persistido na camada SQL (challenges→lessons→subject_id, via
            // challenge_attempts.subject_id) — recém-materializado ainda não tem
            // linha, então é undefined na montagem (o list-challenges resolve).
            let resolvedSubjectId: string | undefined;
            if (deps.resolveSubjectId) {
              try {
                const resolved = await deps.resolveSubjectId(materialized.challengeId);
                if (resolved) resolvedSubjectId = resolved;
              } catch {
                resolvedSubjectId = undefined; // resolução falhou ⇒ omite (nunca derruba a geração)
              }
            }
            // ONDA4: slug ESTÁVEL (basename sem o prefixo NNNN) — mesma string
            // que o list-challenges expõe e que a UI grava nas tentativas
            // (mark-challenge-attempt) para o nunca-repetir.
            const stableSlug = stableSlugFromDir(materialized.challengeDirAbs);
            approvedChallenges.push({ draft: challengeDraft, slug: stableSlug, dir: materialized.challengeDirAbs });
            challengeInfos.push({
              challengeId: materialized.challengeId,
              slug: stableSlug,
              title: challengeDraft.title,
              language: languageOf(challengeDraft.language),
              concept: challengeDraft.concept,
              difficulty: opts.difficulty ?? challengeDraft.difficulty ?? 2,
              status: 'validated',
              verdict: v.verdict,
              workspaceDir: materialized.challengeDirAbs,
              statementPath: path.join(materialized.challengeDirAbs, 'README.md'),
              ...(resolvedSubjectId ? { subjectId: resolvedSubjectId } : {}),
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
      }

      // ONDA4 (desafio-persistencia): PERSISTE a lição gerada — subject
      // (idempotente; garante o slug/domain atuais) + createLesson com o
      // exercício (math) ou o 1º desafio aprovado (programming, slug estável
      // SEM o prefixo NNNN). Falha de persistência NÃO derruba a geração: a
      // aula segue sem ids (o resultado da UI é o mesmo das ondas anteriores).
      if (deps.repo) {
        try {
          const upserted = await deps.repo.upsertSubject(subject, domain);
          subjectId = upserted.subject.id;
          const firstApproved = approvedChallenges[0];
          lessonId = await deps.repo.createLesson({
            subjectSlug: upserted.slug,
            title: draft.lessonTitle,
            body: draft.lessonMarkdown,
            difficulty: opts.difficulty ?? 1,
            ...(mathExercise ? { exercise: mathExercise } : {}),
            ...(firstApproved
              ? {
                  challenge: {
                    slug: firstApproved.slug,
                    title: firstApproved.draft.title,
                    language: languageOf(firstApproved.draft.language),
                    concept: firstApproved.draft.concept,
                    difficulty: opts.difficulty ?? firstApproved.draft.difficulty ?? 2,
                    statement: firstApproved.draft.statement,
                    // O teste executável (especificação) e a referência da autoria,
                    // serializados — as colunas test_cases_json/solution_json do
                    // contrato de challenges.
                    testCasesJson: JSON.stringify({
                      language: languageOf(firstApproved.draft.language),
                      testCode: firstApproved.draft.testCode,
                    }),
                    solutionJson: JSON.stringify({
                      referenceCode: firstApproved.draft.referenceCode,
                      referenceAlternates: firstApproved.draft.referenceAlternates ?? [],
                    }),
                  },
                }
              : {}),
          });
        } catch (err) {
          console.error(
            '[lessonOrchestrator] persistência da lição falhou (aula seguirá sem ids):',
            err instanceof Error ? err.message : err,
          );
          lessonId = undefined;
        }
      }

      const lesson: StudyLesson = {
        title: draft.lessonTitle,
        subject,
        markdown: draft.lessonMarkdown,
        findings,
        challenges: challengeInfos,
        createdAt: new Date().toISOString(),
        // ADITIVO (onda3-respostas): exercício de matemática conferido pela
        // mathLib (esperado computado na geração — DES-6). Só para 'math'.
        ...(mathExercise ? { exercise: mathExercise } : {}),
        // ONDA4: ids reais persistidos (presentes quando o repo foi injetado e
        // a persistência funcionou) — a onda 5 usa para recordAnswer/
        // markLessonCompleted/judge-answer com ids reais.
        ...(lessonId ? { lessonId } : {}),
        ...(subjectId ? { subjectId } : {}),
      };

      emit(onProgress, {
        phase: 'done',
        message: domain === 'math' ? 'Aula de matemática pronta.' : 'Aula pronta.',
        fraction: 1,
      });
      return {
        lesson,
        rejected,
        ...(lessonId ? { lessonId } : {}),
        ...(subjectId ? { subjectId } : {}),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // ADITIVO (onda2-research-live): erro ESTRUTURADO da fase research — o
      // planner lança com code (ex.: BRAVE_KEY_MISSING) e o progresso carrega
      // o código para a UI tratar o aborto com mensagem clara.
      const code = (err as Error & { code?: string }).code;
      emit(onProgress, { phase: 'error', message: msg, ...(code ? { code } : {}) });
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

/**
 * Deriva o protótipo C de UMA definição de função no stubCode autorado
 * (fix-c-stubh). O seed do template `challenge/c/stub.c.tmpl` começa com a
 * assinatura (`{{SIGNATURE}} {` na PRIMEIRA linha) — aqui:
 *  1. acha o PRIMEIRO '{' com profundidade de parênteses 0 (conta '(' e ')';
 *     quando parenDepth volta a 0 e aparece '{', o corpo da função começou);
 *  2. recua até o início da declaração: logo após o último ';' ou '}' de nível
 *     topo anterior (fim da declaração/definição anterior), ou começo do código;
 *  3. pula o que NÃO é parte da assinatura entre o terminator e a declaração:
 *     espaços, linhas de preprocessador (`#include ...`) e comentários (linha
 *     `//` ou bloco iniciado por `/` + `*`).
 * Devolve a assinatura colapsada para uma linha (ex.: `long maior(const int*
 * vetor, int tamanho)`), ou `null` quando não há '{' (ex.: stubCode é só um
 * protótipo) — nesse caso o caller PRESERVA o stub.h do seed.
 */
export function extractCPrototype(stubCode: string): string | null {
  const code = stubCode ?? '';
  let parenDepth = 0;
  let braceIdx = -1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '{' && parenDepth === 0) {
      braceIdx = i;
      break;
    }
  }
  if (braceIdx === -1) return null;

  // início da declaração: logo após o último ';' ou '}' ANTES da assinatura
  // (fim da declaração/definição anterior). Sem terminator anterior → começo.
  let declStart = 0;
  for (let i = braceIdx - 1; i >= 0; i--) {
    const ch = code[i];
    if (ch === ';' || ch === '}') {
      declStart = i + 1;
      break;
    }
  }

  // pula o que separa o terminator anterior da declaração: espaços, linhas de
  // preprocessador e comentários (// e /* */). Para no início da assinatura.
  let i = declStart;
  for (;;) {
    while (i < braceIdx && /\s/.test(code[i])) i += 1;
    if (i >= braceIdx) break;
    if (code[i] === '#') {
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? braceIdx : nl + 1;
      continue;
    }
    if (code[i] === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? braceIdx : nl + 1;
      continue;
    }
    if (code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? braceIdx : end + 2;
      continue;
    }
    break;
  }

  const signature = code.slice(i, braceIdx).replace(/\s+/g, ' ').trim();
  return signature.length > 0 ? signature : null;
}

/** true se o arquivo existe (fakes podem não criar o stub.h do seed). */
async function fileExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
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