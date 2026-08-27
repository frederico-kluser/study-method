/**
 * electron/main/db/repo.ts — REPOSITÓRIO de acesso a dados do tutor (onda1):
 * a camada CRUD que PERSISTE e LÊ aulas (1-2 parágrafos), assuntos, respostas do
 * aluno (que encadeiam para a próxima aula), desafios fundidos, hints, eventos
 * de quebra de hint, progresso/contagem por assunto e a árvore de evolução
 * (pai→filhos).
 *
 * DI-FRIENDLY: `createLessonRepo` recebe UMA FACTORY de conexão (`open`) e NUNCA
 * importa Electron — todo o estado vive nas tabelas, criadas idempotentemente
 * (`CREATE TABLE IF NOT EXISTS`) pela própria repo na primeira abertura. Isso
 * torna a camada 100% testável (sqlite `:memory:`) e reutilizável de qualquer
 * processo (main, worker, CLI).
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
}

/** Assunto com contagens (listSubjects). */
export interface SubjectSummary extends SubjectRow {
  lessonCount: number;
  answeredCount: number;
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
  upsertSubject(name: string): Promise<{ subject: SubjectRow; slug: string }>;
  listSubjects(): Promise<SubjectSummary[]>;
  createLesson(input: CreateLessonInput): Promise<string>;
  getLessonById(id: string): Promise<LessonRow | null>;
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
  completed_at TEXT NULL
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
    db.prepare('SELECT id, name, slug FROM subjects WHERE slug = ?').get(slug) as unknown as
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
    async upsertSubject(name) {
      const slug = slugify(name);
      const existing = findSubjectBySlug(slug);
      if (existing) {
        return { subject: existing, slug };
      }
      const subject: SubjectRow = { id: newId(), name, slug };
      db.prepare(
        'INSERT INTO subjects (id, name, slug, created_at) VALUES (?, ?, ?, ?)',
      ).run(subject.id, subject.name, subject.slug, now());
      return { subject, slug };
    },

    async listSubjects() {
      return db
        .prepare(
          `SELECT
             s.id, s.name, s.slug,
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
             (id, subject_id, title, body, difficulty, parent_lesson_id, origin_lesson_id, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        ).run(
          lessonId,
          subject.id,
          input.title,
          input.body,
          input.difficulty ?? 1,
          input.parentLessonId ?? null,
          input.originLessonId ?? null,
          now(),
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
      const row = db
        .prepare(
          `SELECT id, subject_id, title, body, difficulty, parent_lesson_id, origin_lesson_id,
                  created_at, completed_at
           FROM lessons WHERE id = ?`,
        )
        .get(id) as unknown as LessonRow | undefined;
      return row ?? null;
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
  };
}
