/**
 * electron/main/db/repo.ts — REPOSITÓRIO de acesso a dados do tutor (onda1):
 * a camada CRUD que PERSISTE e LÊ aulas (1-2 parágrafos), assuntos, respostas do
 * aluno (que encadeiam para a próxima aula), desafios fundidos, hints, eventos
 * de quebra de hint, progresso/contagem por assunto e a árvore de evolução
 * (pai→filhos). v2: subjects carrega `domain` e a repo persiste tentativas de
 * desafio (markChallengeAttempt / listAttemptedChallengeSlugs /
 * getAttemptsForChallenge).
 *
 * DI-FRIENDLY: `createLessonRepo` recebe UMA FACTORY de conexão (`open`) e NUNCA
 * importa Electron — todo o estado vive nas tabelas, criadas idempotentemente
 * (`CREATE TABLE IF NOT EXISTS`) pela própria repo na primeira abertura. Isso
 * torna a camada 100% testável (sqlite `:memory:`) e reutilizável de qualquer
 * processo (main, worker, CLI).
 *
 * v3 (onda4-desafio-persistencia): lessons ganha `exercise_json` (TEXT nullable)
 * — o exercício de matemática (LessonExercise) serializado em JSON na criação.
 * `LessonRow` expõe `exercise` PARSEADO (defensivo: JSON inválido/ausente ⇒
 * null — nunca lança) e `getLessonById` devolve `{ lesson, exercise, domain }`
 * (o domínio do subject da lição). `upsertSubject` passou a ATUALIZAR o domain
 * quando o subject já existe e o domínio é fornecido explicitamente (antes
 * mantinha o antigo em silêncio).
 *
 * v4 (onda5-reabrir-lição): `getLessonById` também devolve `subjectSlug`
 * (subjects.slug — mesmo JOIN do domain) e `challenge` (`{ slug, title }` do
 * desafio fundido da lição via LEFT JOIN challenges por lesson_id; null para
 * lições math/sem desafio) — a UI reabre a lição persistida por esses campos.
 *
 * O CONTRATO das tabelas é definido pelo ORQUESTRADOR (fonte de verdade). Este
 * módulo assume exatamente essas colunas; quando a onda1-sql-schema mergear o
 * `schema.ts` com as MESMAS tabelas, a cola continua funcionando — `IF NOT
 * EXISTS` é idempotente diante das duas fontes.
 */
import { randomUUID } from 'node:crypto';
import type { SqliteDbLike } from './connection';

/** Factory de conexão injetável (DI): quem chama decide como abrir o sqlite
 * (caminho de usuário do app, `:memory:`, etc.). NUNCA importa Electron.
 * Tipo ESTRUTURAL (`SqliteDbLike`): vale para o `DatabaseSync` do node:sqlite
 * (Node do sistema) e para o wrapper sql.js (Electron) — evita importar os
 * backends aqui. */
export type OpenFn = () => SqliteDbLike;

export interface SubjectRow {
  id: string;
  name: string;
  slug: string;
  /** domínio do assunto ('programming' | 'math') — v2, default 'programming'. */
  domain: 'programming' | 'math';
}

/** Verdict de uma tentativa de desafio (CHECK da coluna challenge_attempts.verdict). */
export type ChallengeAttemptVerdict = 'passed' | 'failed' | 'timeout' | 'abandoned';

/** Linha de tentativa de desafio (challenge_attempts), em camelCase. */
export interface ChallengeAttemptRow {
  id: string;
  subjectId: string;
  lessonId: string;
  challengeId: string;
  verdict: ChallengeAttemptVerdict;
  stars: number;
  durationMs: number;
  createdAt: string;
}

/** Input de markChallengeAttempt — stars/durationMs opcionais (default 0). */
export interface MarkChallengeAttemptInput {
  subjectId: string;
  lessonId: string;
  challengeId: string;
  verdict: ChallengeAttemptVerdict;
  stars?: number;
  durationMs?: number;
}

/** v4 (rodada8-trilhas): desafio REGENERADO para um aluno (generated_challenges). */
export interface GeneratedChallengeRow {
  id: string;
  trackSlug: string;
  lessonId: string;
  challengeId: string;
  statement: string;
  starterCode: string;
  testsCode: string;
  solutionCode: string;
  expectedTestCount: number;
  createdAt: string;
}

/** v4: linha de progresso de lição de trilha (track_progress). */
export interface TrackLessonProgressRow {
  trackSlug: string;
  lessonId: string;
  completedAt: string;
}

/** v4: veredito de proficiência da trilha (track_proficiency). */
export interface TrackProficiencyRow {
  trackSlug: string;
  verdict: 'passed' | 'failed';
  stars: number;
  passedAt: string;
}

/** Assunto com contagens (listSubjects). */
export interface SubjectSummary extends SubjectRow {
  lessonCount: number;
  answeredCount: number;
}

/** Exercício de matemática persistido (v3) — espelho do LessonExercise do
 * contrato (shared/ipc-contract.ts), definido aqui para a repo não importar
 * shared (é estruturalmente idêntico). */
export interface LessonExercise {
  kind: 'math';
  family: string;
  seed: number;
  prompt: string;
  expectedNormalized: string;
}

export interface LessonRow {
  id: string;
  subject_id: string;
  title: string;
  body: string;
  difficulty: number;
  parent_lesson_id: string | null;
  origin_lesson_id: string | null;
  created_at: string;
  completed_at: string | null;
  /** v3: exercício de matemática PARSEADO de exercise_json. Parse DEFENSIVO:
   * JSON inválido/ausente ⇒ null (nunca lança). */
  exercise: LessonExercise | null;
}

/** getLessonById — a lição + o exercício parseado + o domínio do subject. */
export interface LessonWithMeta {
  lesson: LessonRow;
  exercise: LessonExercise | null;
  /** domínio do subject da lição (subjects.domain). */
  domain: 'programming' | 'math';
  /** ONDA5: slug do subject da lição (subjects.slug) — usado para reabrir a
   *  lição persistida (a UI resolve o setupRoot pelo slug). null quando a
   *  lição não existe. */
  subjectSlug: string | null;
  /** ONDA5: desafio fundido da lição (challenges por lesson_id — createLesson
   *  persiste no máximo 1 por lição). null para lições math / sem desafio. */
  challenge: { slug: string; title: string } | null;
}

/** Aula resumida por assunto (listLessonsBySubject). */
export interface LessonSummary {
  id: string;
  title: string;
  body: string;
  difficulty: number;
  completedAt: string | null;
}

export interface AnswerRow {
  id: string;
  lesson_id: string;
  answer_text: string;
  created_at: string;
}

export interface HintRow {
  id: number;
  challenge_id: string;
  position: number;
  hint_text: string;
  used_at: string | null;
}

export interface ProgressTotals {
  answered: number;
  hintConsumed: number;
  becameChildren: number;
}

/** Um hint a ser criado junto do desafio fundido. */
export interface HintInput {
  position: number;
  hintText: string;
}

/** Desafio fundido, opcional em `createLesson`. */
export interface ChallengeInput {
  slug: string;
  title: string;
  language: string;
  concept: string;
  /** dificuldade 1..5 (default 2). */
  difficulty?: number;
  statement: string;
  /** JSON serializado (test_cases_json), string já no formato de persistência. */
  testCasesJson: string;
  /** JSON serializado (solution_json). */
  solutionJson: string;
  /** Hints fornecidos pelo autor; são criados na ordem dada. */
  hints?: HintInput[];
}

export interface CreateLessonInput {
  subjectSlug: string;
  title: string;
  body: string;
  difficulty?: number;
  parentLessonId?: string | null;
  originLessonId?: string | null;
  challenge?: ChallengeInput;
  /** v3: exercício de matemática — serializado para lessons.exercise_json. */
  exercise?: LessonExercise;
}

/** Nó da árvore de evolução (getTree). */
export interface TreeNode {
  lessonId: string;
  title: string;
  parentLessonId: string | null;
  originLessonId: string | null;
  completedAt: string | null;
}

export interface LessonTree {
  root: TreeNode | null;
  nodes: TreeNode[];
}

/** Instância da repo: todos os métodos retornam Promise. */
export interface LessonRepo {
  upsertSubject(
    name: string,
    domain?: 'programming' | 'math',
  ): Promise<{ subject: SubjectRow; slug: string }>;
  listSubjects(): Promise<SubjectSummary[]>;
  /** v3/onda4: devolve um subject pelo slug (undefined se não persistido). */
  findSubjectBySlug(slug: string): Promise<SubjectRow | null>;
  createLesson(input: CreateLessonInput): Promise<string>;
  /** v3/onda4+5: devolve { lesson, exercise (parse de exercise_json), domain,
   * subjectSlug, challenge } — null quando a lição não existe. */
  getLessonById(id: string): Promise<LessonWithMeta | null>;
  listLessonsBySubject(subjectSlug: string): Promise<LessonSummary[]>;
  markLessonCompleted(id: string): Promise<void>;
  recordAnswer(lessonId: string, answerText: string): Promise<void>;
  getAnswerForLesson(lessonId: string): Promise<AnswerRow | null>;
  addHint(lessonId: string, position: number, hintText: string): Promise<void>;
  consumeHint(challengeId: string, hintText: string): Promise<void>;
  recordHintBreak(
    lessonId: string,
    challengeId: string,
    reason: string,
    note?: string | null,
  ): Promise<void>;
  getHintsForChallenge(challengeId: string): Promise<HintRow[]>;
  lessonCountForSubject(subjectSlug: string): Promise<number>;
  answeredTopicCount(subjectSlug: string): Promise<ProgressTotals>;
  getTree(subjectSlug: string): Promise<LessonTree>;
  /** Grava UMA tentativa de desafio; devolve a linha criada (com id/created_at). */
  markChallengeAttempt(input: MarkChallengeAttemptInput): Promise<ChallengeAttemptRow>;
  /**
   * Slugs (challenge_slug) distintos já tentados — de um subject específico
   * (subjectId) ou de todos quando omitido. Tentativas cujo desafio não está
   * persistido em `challenges` caem no challenge_id (COALESCE). Ordena pela
   * tentativa mais recente.
   */
  listAttemptedChallengeSlugs(subjectId?: string): Promise<string[]>;
  /** Histórico de tentativas de um desafio, da mais antiga para a mais recente. */
  getAttemptsForChallenge(challengeId: string): Promise<ChallengeAttemptRow[]>;
  // ─── v4 (rodada8-trilhas): progresso de trilha + desafios regenerados ───
  /** Marca uma lição de trilha como concluída (upsert idempotente). */
  markTrackLessonDone(trackSlug: string, lessonId: string): Promise<void>;
  /** Lições concluídas de uma trilha (para derivar locked/done/current). */
  listTrackLessonProgress(trackSlug: string): Promise<TrackLessonProgressRow[]>;
  /** Grava/atualiza o veredito do teste de proficiência da trilha. */
  setTrackProficiency(trackSlug: string, verdict: 'passed' | 'failed', stars: number): Promise<void>;
  /** Veredito de proficiência da trilha (null = nunca feito). */
  getTrackProficiency(trackSlug: string): Promise<TrackProficiencyRow | null>;
  /** Persiste um desafio REGENERADO para o aluno (nunca-repetir). */
  insertGeneratedChallenge(input: GeneratedChallengeRow): Promise<void>;
  /** Desafios regenerados de uma aula (na ordem de criação). */
  listGeneratedChallenges(trackSlug: string, lessonId: string): Promise<GeneratedChallengeRow[]>;
  /**
   * Slugs de desafios que o aluno FALHOU numa aula da trilha (verdict
   * failed|timeout, lesson_id = 'lesson:<lessonId>') — o contexto do
   * nunca-repetir da regeneração. Único por slug, mais recente primeiro.
   */
  listFailedChallengeSlugs(trackSlug: string, lessonId: string): Promise<string[]>;
}

/**
 * DDL do contrato — criado idempotentemente quando a repo abre uma conexão nova.
 * Espelha o contrato do orquestrador (fonte de verdade); se `schema.ts` da
 * onda1-sql-schema também o criar, `IF NOT EXISTS` torna a coexistência segura.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL DEFAULT 'programming' CHECK (domain IN ('programming','math')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1,
  parent_lesson_id TEXT NULL REFERENCES lessons(id),
  origin_lesson_id TEXT NULL REFERENCES lessons(id),
  created_at TEXT NOT NULL,
  completed_at TEXT NULL,
  exercise_json TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_lessons_subject ON lessons(subject_id);
CREATE TABLE IF NOT EXISTS lesson_answers (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  answer_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lesson_answers_lesson ON lesson_answers(lesson_id);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  challenge_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  concept TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  statement TEXT NOT NULL,
  test_cases_json TEXT NOT NULL,
  solution_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS challenge_hints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  position INTEGER NOT NULL,
  hint_text TEXT NOT NULL,
  used_at TEXT NULL
);
CREATE TABLE IF NOT EXISTS hint_break_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  reason TEXT NOT NULL,
  note TEXT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  answered INTEGER NOT NULL DEFAULT 0,
  hint_consumed INTEGER NOT NULL DEFAULT 0,
  became_lesson_children INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject_id, lesson_id)
);
CREATE TABLE IF NOT EXISTS challenge_attempts (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  lesson_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('passed','failed','timeout','abandoned')),
  stars INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_id ON challenge_attempts(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_attempts_subject_id ON challenge_attempts(subject_id);
CREATE TABLE IF NOT EXISTS track_progress (
  track_slug   TEXT NOT NULL,
  lesson_id    TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (track_slug, lesson_id)
);
CREATE TABLE IF NOT EXISTS track_proficiency (
  track_slug TEXT PRIMARY KEY,
  verdict    TEXT NOT NULL CHECK (verdict IN ('passed','failed')),
  stars      INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  passed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS generated_challenges (
  id                  TEXT PRIMARY KEY,
  track_slug          TEXT NOT NULL,
  lesson_id           TEXT NOT NULL,
  challenge_id        TEXT NOT NULL,
  statement           TEXT NOT NULL,
  starter_code        TEXT NOT NULL,
  tests_code          TEXT NOT NULL,
  solution_code       TEXT NOT NULL,
  expected_test_count INTEGER NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Deriva um slug kebab-case (sem acento) a partir de um nome humano. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const now = () => new Date().toISOString();
const newId = () => randomUUID();

/**
 * Parse DEFENSIVO do exercise_json de uma lesson (v3): devolve null para
 * ausente/vazio/JSON inválido/forma fora do contrato — NUNCA lança. A repo
 * nunca derruba uma leitura por causa de um JSON corrompido.
 */
export function parseLessonExercise(raw: unknown): LessonExercise | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (
      o.kind !== 'math' ||
      typeof o.family !== 'string' ||
      typeof o.seed !== 'number' ||
      !Number.isInteger(o.seed) ||
      typeof o.prompt !== 'string' ||
      typeof o.expectedNormalized !== 'string'
    ) {
      return null;
    }
    return {
      kind: 'math',
      family: o.family,
      seed: o.seed,
      prompt: o.prompt,
      expectedNormalized: o.expectedNormalized,
    };
  } catch {
    return null; // JSON inválido ⇒ null (nunca lança)
  }
}

/**
 * Roda `fn` dentro de uma transação BEGIN/COMMIT, com ROLLBACK em erro.
 *
 * Nenhum dos backends (node:sqlite, sql.js) tem helper `db.transaction(fn)` —
 * aqui o equivalente é explícito. Os usos nesta repo NÃO se aninham (cada
 * método público abre e fecha a própria transação), então BEGIN/COMMIT simples
 * basta (sem SAVEPOINT por nível).
 */
function withTransaction<T>(db: SqliteDbLike, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function createLessonRepo(open: OpenFn): LessonRepo {
  const db = open();
  db.exec(SCHEMA);

  const findSubjectBySlug = (slug: string): SubjectRow | undefined =>
    db.prepare('SELECT id, name, slug, domain FROM subjects WHERE slug = ?').get(slug) as unknown as
      | SubjectRow
      | undefined;

  /** Garante a linha de progresso (subject_id, lesson_id) com contadores zerados. */
  const ensureProgress = (subjectId: string, lessonId: string): void => {
    db.prepare(
      `INSERT OR IGNORE INTO progress (subject_id, lesson_id, answered, hint_consumed, became_lesson_children)
       VALUES (?, ?, 0, 0, 0)`,
    ).run(subjectId, lessonId);
  };

  /** A subject de uma lesson (null se a lesson não existe). */
  const subjectOfLesson = (lessonId: string): string | null => {
    const row = db
      .prepare('SELECT subject_id FROM lessons WHERE id = ?')
      .get(lessonId) as unknown as { subject_id: string } | undefined;
    return row ? row.subject_id : null;
  };

  /** O id do desafio fundido de uma lesson; null se não há. */
  const challengeOfLesson = (lessonId: string): string | null => {
    const row = db
      .prepare('SELECT id FROM challenges WHERE lesson_id = ?')
      .get(lessonId) as unknown as { id: string } | undefined;
    return row ? row.id : null;
  };

  return {
    async upsertSubject(name, domain) {
      const slug = slugify(name);
      const existing = findSubjectBySlug(slug);
      if (existing) {
        // ONDA4: quando o domínio é fornecido EXPLICITAMENTE e difere do atual,
        // ATUALIZA a linha (antes mantinha o antigo em silêncio — a Trilha veria
        // o domínio errado). `domain === undefined` preserva a linha (cria com
        // default 'programming').
        if (domain !== undefined && domain !== existing.domain) {
          db.prepare('UPDATE subjects SET domain = ? WHERE id = ?').run(domain, existing.id);
          return { subject: { ...existing, domain }, slug };
        }
        return { subject: existing, slug };
      }
      const subject: SubjectRow = { id: newId(), name, slug, domain: domain ?? 'programming' };
      db.prepare(
        'INSERT INTO subjects (id, name, slug, domain, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(subject.id, subject.name, subject.slug, subject.domain, now());
      return { subject, slug };
    },

    async findSubjectBySlug(slug) {
      return findSubjectBySlug(slug) ?? null;
    },

    async listSubjects() {
      return db
        .prepare(
          `SELECT
             s.id, s.name, s.slug, s.domain,
             (SELECT COUNT(*) FROM lessons l WHERE l.subject_id = s.id) AS lessonCount,
             (SELECT COALESCE(SUM(p.answered), 0) FROM progress p WHERE p.subject_id = s.id) AS answeredCount
           FROM subjects s`,
        )
        .all() as unknown as SubjectSummary[];
    },

    async createLesson(input) {
      return withTransaction(db, (): string => {
        const subject = findSubjectBySlug(input.subjectSlug);
        if (!subject) {
          throw new Error(`assunto desconhecido: ${input.subjectSlug}`);
        }
        const lessonId = newId();
        db.prepare(
          `INSERT INTO lessons
             (id, subject_id, title, body, difficulty, parent_lesson_id, origin_lesson_id, created_at, completed_at, exercise_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        ).run(
          lessonId,
          subject.id,
          input.title,
          input.body,
          input.difficulty ?? 1,
          input.parentLessonId ?? null,
          input.originLessonId ?? null,
          now(),
          input.exercise ? JSON.stringify(input.exercise) : null,
        );
        ensureProgress(subject.id, lessonId);

        if (input.challenge) {
          const c = input.challenge;
          const challengeId = newId();
          db.prepare(
            `INSERT INTO challenges
               (id, lesson_id, challenge_slug, title, language, concept, difficulty, statement, test_cases_json, solution_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            challengeId,
            lessonId,
            c.slug,
            c.title,
            c.language,
            c.concept,
            c.difficulty ?? 2,
            c.statement,
            c.testCasesJson,
            c.solutionJson,
            now(),
          );
          const insertHint = db.prepare(
            `INSERT INTO challenge_hints (challenge_id, position, hint_text, used_at)
             VALUES (?, ?, ?, NULL)`,
          );
          for (const h of c.hints ?? []) {
            insertHint.run(challengeId, h.position, h.hintText);
          }
        }
        return lessonId;
      });
    },

    async getLessonById(id) {
      // v3: JOIN com subjects para o domínio + exercise_json para o exercício
      // parseado (defensivo — JSON inválido ⇒ exercise null, nunca lança).
      // ONDA5: o MESMO JOIN com subjects também traz o slug (subjectSlug) e um
      // LEFT JOIN com challenges traz o desafio fundido da lição (challenge) —
      // createLesson persiste no máximo 1 desafio por lição, então o join
      // devolve no máximo 1 linha (`.get()` pega a primeira de qualquer forma).
      const row = db
        .prepare(
          `SELECT l.id, l.subject_id, l.title, l.body, l.difficulty, l.parent_lesson_id,
                  l.origin_lesson_id, l.created_at, l.completed_at, l.exercise_json,
                  COALESCE(s.domain, 'programming') AS domain,
                  s.slug AS subject_slug,
                  ch.challenge_slug AS challenge_slug, ch.title AS challenge_title
           FROM lessons l
           LEFT JOIN subjects s ON s.id = l.subject_id
           LEFT JOIN challenges ch ON ch.lesson_id = l.id
           WHERE l.id = ?`,
        )
        .get(id) as unknown as
        | (Omit<LessonRow, 'exercise'> & {
            exercise_json: string | null;
            domain: string;
            subject_slug: string | null;
            challenge_slug: string | null;
            challenge_title: string | null;
          })
        | undefined;
      if (!row) return null;
      const lesson: LessonRow = {
        id: row.id,
        subject_id: row.subject_id,
        title: row.title,
        body: row.body,
        difficulty: row.difficulty,
        parent_lesson_id: row.parent_lesson_id,
        origin_lesson_id: row.origin_lesson_id,
        created_at: row.created_at,
        completed_at: row.completed_at,
        exercise: parseLessonExercise(row.exercise_json),
      };
      const domain = row.domain === 'math' ? ('math' as const) : ('programming' as const);
      const subjectSlug =
        typeof row.subject_slug === 'string' && row.subject_slug.trim() !== ''
          ? row.subject_slug
          : null;
      // Defensivo (padrão parseLessonExercise): desafio parcial/fora do shape ⇒
      // null — nunca quebra a leitura da lição.
      const challenge =
        typeof row.challenge_slug === 'string' && row.challenge_slug.trim() !== ''
          ? {
              slug: row.challenge_slug,
              title: typeof row.challenge_title === 'string' ? row.challenge_title : '',
            }
          : null;
      return { lesson, exercise: lesson.exercise, domain, subjectSlug, challenge };
    },

    async listLessonsBySubject(subjectSlug) {
      const subject = findSubjectBySlug(subjectSlug);
      if (!subject) return [];
      const rows = db
        .prepare(
          `SELECT id, title, body, difficulty, completed_at
           FROM lessons WHERE subject_id = ? ORDER BY created_at ASC`,
        )
        .all(subject.id) as unknown as Array<{
        id: string;
        title: string;
        body: string;
        difficulty: number;
        completed_at: string | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        difficulty: r.difficulty,
        completedAt: r.completed_at,
      }));
    },

    async markLessonCompleted(id) {
      db.prepare('UPDATE lessons SET completed_at = ? WHERE id = ?').run(now(), id);
    },

    async recordAnswer(lessonId, answerText) {
      withTransaction(db, () => {
        const subjectId = subjectOfLesson(lessonId);
        if (!subjectId) return; // lesson inexistente -> no-op seguro (sem FK throw)
        db.prepare(
          'INSERT INTO lesson_answers (id, lesson_id, answer_text, created_at) VALUES (?, ?, ?, ?)',
        ).run(newId(), lessonId, answerText, now());
        ensureProgress(subjectId, lessonId);
        db.prepare(
          'UPDATE progress SET answered = answered + 1 WHERE subject_id = ? AND lesson_id = ?',
        ).run(subjectId, lessonId);
      });
    },

    async getAnswerForLesson(lessonId) {
      const row = db
        .prepare(
          `SELECT id, lesson_id, answer_text, created_at FROM lesson_answers
           WHERE lesson_id = ? ORDER BY rowid DESC LIMIT 1`,
        )
        .get(lessonId) as unknown as AnswerRow | undefined;
      return row ?? null;
    },

    async addHint(lessonId, position, hintText) {
      const challengeId = challengeOfLesson(lessonId);
      if (!challengeId) {
        throw new Error(`nenhum desafio fundido para a lesson: ${lessonId}`);
      }
      db.prepare(
        'INSERT INTO challenge_hints (challenge_id, position, hint_text, used_at) VALUES (?, ?, ?, NULL)',
      ).run(challengeId, position, hintText);
    },

    async consumeHint(challengeId, hintText) {
      withTransaction(db, () => {
        const challenge = db
          .prepare('SELECT id, lesson_id FROM challenges WHERE id = ?')
          .get(challengeId) as unknown as { id: string; lesson_id: string } | undefined;
        if (!challenge) {
          throw new Error(`challenge desconhecido: ${challengeId}`);
        }
        db.prepare(
          `UPDATE challenge_hints SET used_at = ?
           WHERE challenge_id = ? AND hint_text = ? AND used_at IS NULL`,
        ).run(now(), challengeId, hintText);
        const subjectId = subjectOfLesson(challenge.lesson_id);
        if (subjectId) {
          ensureProgress(subjectId, challenge.lesson_id);
          db.prepare(
            'UPDATE progress SET hint_consumed = hint_consumed + 1 WHERE subject_id = ? AND lesson_id = ?',
          ).run(subjectId, challenge.lesson_id);
        }
      });
    },

    async recordHintBreak(lessonId, challengeId, reason, note = null) {
      withTransaction(db, () => {
        const subjectId = subjectOfLesson(lessonId);
        if (!subjectId) return; // lesson inexistente -> no-op seguro (sem FK throw)
        db.prepare(
          `INSERT INTO hint_break_events (challenge_id, lesson_id, reason, note, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(challengeId, lessonId, reason, note ?? null, now());
        ensureProgress(subjectId, lessonId);
        db.prepare(
          'UPDATE progress SET became_lesson_children = became_lesson_children + 1 WHERE subject_id = ? AND lesson_id = ?',
        ).run(subjectId, lessonId);
      });
    },

    async getHintsForChallenge(challengeId) {
      return db
        .prepare(
          `SELECT id, challenge_id, position, hint_text, used_at
           FROM challenge_hints WHERE challenge_id = ? ORDER BY position ASC`,
        )
        .all(challengeId) as unknown as HintRow[];
    },

    async lessonCountForSubject(subjectSlug) {
      const subject = findSubjectBySlug(subjectSlug);
      if (!subject) return 0;
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM lessons WHERE subject_id = ?')
        .get(subject.id) as unknown as { n: number };
      return row.n;
    },

    async answeredTopicCount(subjectSlug) {
      const subject = findSubjectBySlug(subjectSlug);
      if (!subject) {
        return { answered: 0, hintConsumed: 0, becameChildren: 0 };
      }
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(answered), 0) AS answered,
                  COALESCE(SUM(hint_consumed), 0) AS hintConsumed,
                  COALESCE(SUM(became_lesson_children), 0) AS becameChildren
           FROM progress WHERE subject_id = ?`,
        )
        .get(subject.id) as unknown as { answered: number; hintConsumed: number; becameChildren: number };
      // node:sqlite devolve a linha com protótipo `null`; normaliza para um objeto
      // plano (Object.prototype) — preserva o contrato público da repo.
      return { ...row };
    },

    async getTree(subjectSlug) {
      const subject = findSubjectBySlug(subjectSlug);
      if (!subject) {
        return { root: null, nodes: [] };
      }
      const rows = db
        .prepare(
          `SELECT id, title, parent_lesson_id, origin_lesson_id, completed_at
           FROM lessons WHERE subject_id = ?`,
        )
        .all(subject.id) as unknown as Array<{
        id: string;
        title: string;
        parent_lesson_id: string | null;
        origin_lesson_id: string | null;
        completed_at: string | null;
      }>;
      const nodes: TreeNode[] = rows.map((r) => ({
        lessonId: r.id,
        title: r.title,
        parentLessonId: r.parent_lesson_id,
        originLessonId: r.origin_lesson_id,
        completedAt: r.completed_at,
      }));
      // Raiz = a primeira aula sem pai (por created_at, já que a query preserva a
      // ordem de inserção na maioria dos casos; usamos a primeira encontrada).
      const root =
        nodes.find((n) => n.parentLessonId === null && n.originLessonId === null) ?? null;
      return { root, nodes };
    },

    async markChallengeAttempt(input) {
      const attempt: ChallengeAttemptRow = {
        id: newId(),
        subjectId: input.subjectId,
        lessonId: input.lessonId,
        challengeId: input.challengeId,
        verdict: input.verdict,
        stars: input.stars ?? 0,
        durationMs: input.durationMs ?? 0,
        createdAt: now(),
      };
      db.prepare(
        `INSERT INTO challenge_attempts
           (id, subject_id, lesson_id, challenge_id, verdict, stars, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        attempt.id,
        attempt.subjectId,
        attempt.lessonId,
        attempt.challengeId,
        attempt.verdict,
        attempt.stars,
        attempt.durationMs,
        attempt.createdAt,
      );
      return attempt;
    },

    async listAttemptedChallengeSlugs(subjectId) {
      const rows = db
        .prepare(
          `SELECT COALESCE(c.challenge_slug, ca.challenge_id) AS slug
           FROM challenge_attempts ca
           LEFT JOIN challenges c ON c.id = ca.challenge_id
           WHERE (? IS NULL OR ca.subject_id = ?)
           GROUP BY COALESCE(c.challenge_slug, ca.challenge_id)
           ORDER BY MAX(ca.created_at) DESC`,
        )
        .all(subjectId ?? null, subjectId ?? null) as unknown as Array<{ slug: string }>;
      return rows.map((r) => r.slug);
    },

    async getAttemptsForChallenge(challengeId) {
      const rows = db
        .prepare(
          `SELECT id, subject_id, lesson_id, challenge_id, verdict, stars, duration_ms, created_at
           FROM challenge_attempts
           WHERE challenge_id = ?
           ORDER BY created_at ASC, id ASC`,
        )
        .all(challengeId) as unknown as Array<{
        id: string;
        subject_id: string;
        lesson_id: string;
        challenge_id: string;
        verdict: ChallengeAttemptVerdict;
        stars: number;
        duration_ms: number;
        created_at: string;
      }>;
      // snake_case do banco -> camelCase do contrato (padrão listLessonsBySubject).
      return rows.map((r) => ({
        id: r.id,
        subjectId: r.subject_id,
        lessonId: r.lesson_id,
        challengeId: r.challenge_id,
        verdict: r.verdict,
        stars: r.stars,
        durationMs: r.duration_ms,
        createdAt: r.created_at,
      }));
    },

    // ─── v4 (rodada8-trilhas) ────────────────────────────────────────────────

    async markTrackLessonDone(trackSlug, lessonId) {
      db.prepare(
        `INSERT OR IGNORE INTO track_progress (track_slug, lesson_id, completed_at)
         VALUES (?, ?, ?)`,
      ).run(trackSlug, lessonId, now());
    },

    async listTrackLessonProgress(trackSlug) {
      const rows = db
        .prepare(
          `SELECT track_slug, lesson_id, completed_at
           FROM track_progress
           WHERE track_slug = ?
           ORDER BY completed_at ASC`,
        )
        .all(trackSlug) as unknown as Array<{
        track_slug: string;
        lesson_id: string;
        completed_at: string;
      }>;
      return rows.map((r) => ({
        trackSlug: r.track_slug,
        lessonId: r.lesson_id,
        completedAt: r.completed_at,
      }));
    },

    async setTrackProficiency(trackSlug, verdict, stars) {
      db.prepare(
        `INSERT INTO track_proficiency (track_slug, verdict, stars, passed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(track_slug) DO UPDATE SET
           verdict = excluded.verdict,
           stars = excluded.stars,
           passed_at = excluded.passed_at`,
      ).run(trackSlug, verdict, stars, now());
    },

    async getTrackProficiency(trackSlug) {
      const r = db
        .prepare(
          `SELECT track_slug, verdict, stars, passed_at
           FROM track_proficiency
           WHERE track_slug = ?`,
        )
        .get(trackSlug) as
        | { track_slug: string; verdict: 'passed' | 'failed'; stars: number; passed_at: string }
        | undefined;
      if (!r) return null;
      return { trackSlug: r.track_slug, verdict: r.verdict, stars: r.stars, passedAt: r.passed_at };
    },

    async insertGeneratedChallenge(input) {
      db.prepare(
        `INSERT INTO generated_challenges
           (id, track_slug, lesson_id, challenge_id, statement, starter_code, tests_code,
            solution_code, expected_test_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.id,
        input.trackSlug,
        input.lessonId,
        input.challengeId,
        input.statement,
        input.starterCode,
        input.testsCode,
        input.solutionCode,
        input.expectedTestCount,
        now(),
      );
    },

    async listGeneratedChallenges(trackSlug, lessonId) {
      const rows = db
        .prepare(
          `SELECT id, track_slug, lesson_id, challenge_id, statement, starter_code,
                  tests_code, solution_code, expected_test_count, created_at
           FROM generated_challenges
           WHERE track_slug = ? AND lesson_id = ?
           ORDER BY created_at ASC, id ASC`,
        )
        .all(trackSlug, lessonId) as unknown as Array<{
        id: string;
        track_slug: string;
        lesson_id: string;
        challenge_id: string;
        statement: string;
        starter_code: string;
        tests_code: string;
        solution_code: string;
        expected_test_count: number;
        created_at: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        trackSlug: r.track_slug,
        lessonId: r.lesson_id,
        challengeId: r.challenge_id,
        statement: r.statement,
        starterCode: r.starter_code,
        testsCode: r.tests_code,
        solutionCode: r.solution_code,
        expectedTestCount: r.expected_test_count,
        createdAt: r.created_at,
      }));
    },

    async listFailedChallengeSlugs(trackSlug, lessonId) {
      const subject = db
        .prepare(`SELECT id FROM subjects WHERE slug = ?`)
        .get(trackSlug) as { id: string } | undefined;
      if (!subject) return [];
      const rows = db
        .prepare(
          `SELECT challenge_id AS slug
           FROM challenge_attempts
           WHERE subject_id = ? AND lesson_id = ? AND verdict IN ('failed','timeout')
           GROUP BY challenge_id
           ORDER BY MAX(created_at) DESC`,
        )
        .all(subject.id, `lesson:${lessonId}`) as unknown as Array<{ slug: string }>;
      return rows.map((r) => r.slug);
    },
  };
}
