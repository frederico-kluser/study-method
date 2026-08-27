/**
 * electron/main/db/schema.ts — fundação SQL do tutor (onda1-sql-schema).
 *
 * Define o schema relacional NORMALIZADO que é o CONTRATO CONGELADO para as
 * ondas seguintes (repo de aulas, autoria, progresso, hint/break). As tabelas
 * são exportadas como constantes SQL prontas para o migrator (`migrate.ts`)
 * executar de forma idempotente (CREATE TABLE IF NOT EXISTS + índices IF NOT
 * EXISTS). Este arquivo é PURO (sem melhor-sqlite3, sem electron) — apenas
 * declaração de SQL.
 *
 * Domínio:
 *   subjects      assuntos (disciplinas) raiz
 *   lessons       aulas — markdown curto (1–2 parágrafos); árvore pai→filha via
 *                 parent_lesson_id e, quando uma aula "quebra" de outra,
 *                 origin_lesson_id rastreia a origem (para a árvore de evolução)
 *   lesson_answers respostas do aluno à aula — encadeiam/avançam para a próxima
 *   challenges    desafio FUNDIDO dentro de uma aula (statement + testes + solução
 *                 em JSON)
 *   challenge_hints até 3 hints por desafio (position 0..2)
 *   hint_break_events gatilho de quebra: motivo "hint-4th" (4º clique = "estou
 *                 perdido") ou "lost-manual" (perdido manual), + o que o aluno disse
 *   progress      contagem agregada por (subject, lesson)
 *   challenge_attempts tentativas de desafio (v2): uma linha por execução, com
 *                 verdict/stars/duration; subject_id FK para subjects
 *
 * v2: subjects ganha `domain` ('programming' | 'math') e entra a tabela
 * challenge_attempts. Bancos NOVOS nascem em v2 via SCHEMA_SQL; bancos v1
 * existentes sobem via MIGRATIONS (ALTER ADD COLUMN + CREATE TABLE IF NOT
 * EXISTS) sem perder dados — ver migrate.ts.
 *
 * Colunas de id são TEXT com ids gerados pela aplicação (uuid), exceto
 * challenge_hints e hint_break_events que usam INTEGER AUTOINCREMENT.
 * Foreign keys são declaradas em SQL e pode-se exigir enforcement em runtime
 * via `PRAGMA foreign_keys = ON` (ver connection.ts).
 */

/** Pedido: a constante SQL das tabelas e a consulta de migração. */

/**
 * Versão do schema. Bancos NOVOS nascem direto nesta versão (o migrator aplica
 * o `SCHEMA_SQL` completo quando `user_version` é 0). Bancos ANTIGOS sobem
 * versão a versão pela lista `MIGRATIONS` (ver migrate.ts) — SEM perder dados.
 */
export const SCHEMA_VERSION = 2;

/**
 * Tabela de tentativas de desafio (v2): uma linha por execução de um desafio
 * pelo aluno. `subject_id` referencia subjects; `challenge_id`/`lesson_id` são
 * TEXT puros (o desafio pode ter sido gerado sem estar persistido em
 * `challenges`). Definida como constante ANTES de TABLES para o caminho de
 * CRIAÇÃO NOVA (TABLES) e o de MIGRAÇÃO v1→v2 (MIGRATIONS) compartilharem o
 * MESMO SQL.
 */
export const CHALLENGE_ATTEMPTS_TABLE: string = `-- challenge_attempts (tentativas de desafio)
CREATE TABLE IF NOT EXISTS challenge_attempts (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subjects(id),
  lesson_id    TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  verdict      TEXT NOT NULL CHECK (verdict IN ('passed','failed','timeout','abandoned')),
  stars        INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);`;

/** Índices da tabela de tentativas (mesma definição nos dois caminhos). */
export const CHALLENGE_ATTEMPTS_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_id ON challenge_attempts(challenge_id);`,
  `CREATE INDEX IF NOT EXISTS idx_challenge_attempts_subject_id   ON challenge_attempts(subject_id);`,
];

/**
 * Tabelas do schema, em ordem de criação (respecta dependências FK —
 * subjects antes de lessons, lessons antes de lesson_answers/challenges/etc.,
 * challenges antes de challenge_hints/hint_break_events).
 */
export const TABLES: string[] = [
  `-- subjects
CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  domain     TEXT NOT NULL DEFAULT 'programming' CHECK (domain IN ('programming','math')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  `-- lessons
CREATE TABLE IF NOT EXISTS lessons (
  id               TEXT PRIMARY KEY,
  subject_id       TEXT NOT NULL REFERENCES subjects(id),
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,           -- markdown curto (1–2 parágrafos)
  difficulty       INTEGER NOT NULL DEFAULT 1,
  parent_lesson_id TEXT REFERENCES lessons(id),   -- árvore pai→filha
  origin_lesson_id TEXT REFERENCES lessons(id),   -- quando quebrou de outra aula
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at     TEXT
);`,

  `-- lesson_answers (resposta do aluno que encadeia para a próxima aula)
CREATE TABLE IF NOT EXISTS lesson_answers (
  id          TEXT PRIMARY KEY,
  lesson_id   TEXT NOT NULL REFERENCES lessons(id),
  answer_text TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  `-- challenges (desafio fundido dentro da aula)
CREATE TABLE IF NOT EXISTS challenges (
  id               TEXT PRIMARY KEY,
  lesson_id        TEXT NOT NULL REFERENCES lessons(id),
  challenge_slug   TEXT,
  title            TEXT,
  language         TEXT,
  concept          TEXT,
  difficulty       INTEGER,
  statement        TEXT,
  test_cases_json  TEXT,
  solution_json    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  `-- challenge_hints (até 3 hints por desafio)
CREATE TABLE IF NOT EXISTS challenge_hints (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  position     INTEGER NOT NULL,
  hint_text    TEXT NOT NULL,
  used_at      TEXT
);`,

  `-- hint_break_events (gatilho de quebra: 4º clique ou perdido manual)
CREATE TABLE IF NOT EXISTS hint_break_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT REFERENCES challenges(id),
  lesson_id    TEXT REFERENCES lessons(id),
  reason       TEXT,               -- 'hint-4th' | 'lost-manual'
  note         TEXT,               -- o que o aluno disse
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  `-- progress (contagem agregada por assunto/aula)
CREATE TABLE IF NOT EXISTS progress (
  subject_id             TEXT NOT NULL REFERENCES subjects(id),
  lesson_id              TEXT NOT NULL REFERENCES lessons(id),
  answered               INTEGER NOT NULL DEFAULT 0,
  hint_consumed          INTEGER NOT NULL DEFAULT 0,
  became_lesson_children INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject_id, lesson_id)
);`,

  CHALLENGE_ATTEMPTS_TABLE,
];

/**
 * Índices do schema. Criados com IF NOT EXISTS para idempotência. Cobrem os
 * caminhos de leitura que as ondas seguintes usam: árvore de evolução por
 * origem/ pai, listagem por assunto, e posição de hint.
 */
export const INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_lessons_subject_id          ON lessons(subject_id);`,
  `CREATE INDEX IF NOT EXISTS idx_lessons_parent_lesson_id    ON lessons(parent_lesson_id);`,
  `CREATE INDEX IF NOT EXISTS idx_lessons_origin_lesson_id    ON lessons(origin_lesson_id);`,
  `CREATE INDEX IF NOT EXISTS idx_lesson_answers_lesson_id    ON lesson_answers(lesson_id);`,
  `CREATE INDEX IF NOT EXISTS idx_challenges_lesson_id        ON challenges(lesson_id);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_hints_pos  ON challenge_hints(challenge_id, position);`,
  `CREATE INDEX IF NOT EXISTS idx_challenge_hints_challenge   ON challenge_hints(challenge_id);`,
  `CREATE INDEX IF NOT EXISTS idx_hint_break_events_challenge ON hint_break_events(challenge_id);`,
  `CREATE INDEX IF NOT EXISTS idx_hint_break_events_lesson    ON hint_break_events(lesson_id);`,
  ...CHALLENGE_ATTEMPTS_INDEXES,
];

/** Nome de todas as tabelas criadas pelo schema (para verificação/teste). */
export const TABLE_NAMES: readonly string[] = [
  'subjects',
  'lessons',
  'lesson_answers',
  'challenges',
  'challenge_hints',
  'hint_break_events',
  'progress',
  'challenge_attempts',
];

/** Concatenação completa do schema: tabelas + índices, na ordem de dependência. */
export const SCHEMA_SQL: string = [...TABLES, ...INDEXES].join('\n');

/**
 * v2: ALTER que adiciona `domain` a subjects (bancos v1 -> v2). Executado por
 * migrate.ts SOMENTE quando a coluna ainda não existe (via `guardedAlter`) —
 * um boot anterior pode ter adicionado a coluna e crashado antes de gravar
 * `user_version = 2`; re-rodar o ALTER lançaria "duplicate column name:
 * domain". Limitação do SQLite: ALTER ADD COLUMN não pode carregar CHECK — o
 * CHECK do domain só existe no caminho de CRIAÇÃO NOVA (TABLES); bancos
 * migrados validam o domínio apenas pela aplicação (repo). O DEFAULT
 * 'programming' faz as linhas antigas ganharem o domínio default sem tocar
 * em dados.
 */
export const SUBJECTS_DOMAIN_ALTER: string = `ALTER TABLE subjects ADD COLUMN domain TEXT NOT NULL DEFAULT 'programming';`;

/** Um passo de migração versionada (ver MIGRATIONS). */
export interface MigrationStep {
  /** versão-alvo do passo (user_version após aplicá-lo) */
  version: number;
  /** SQL idempotente que leva de (version-1) até version e roda SEMPRE no
   * passo (CREATE TABLE/INDEX IF NOT EXISTS — re-rodar é no-op seguro) */
  sql: string;
  /** ALTER ADD COLUMN CONDICIONADO à existência da coluna (crash-safe): o
   * migrator só o executa quando `PRAGMA table_info(table)` não listar
   * `column`. Evita o "duplicate column name" de um boot anterior que
   * adicionou a coluna e crashou antes de gravar a versão. */
  guardedAlter?: { table: string; column: string; sql: string };
}

/**
 * Migrações VERSIONADAS para bancos criados por versões ANTERIORES do app.
 * Aplicadas por migrate.ts quando `user_version < version`, na ordem, sem
 * nunca recriar tabelas (dados do usuário preservados).
 *
 * v2 (SCHEMA_VERSION=2):
 *   - subjects ganha `domain` via `SUBJECTS_DOMAIN_ALTER`, guardado por
 *     `guardedAlter` (só roda com a coluna ausente — crash-safe);
 *   - challenge_attempts é criada NOVA (CREATE TABLE IF NOT EXISTS), então
 *     carrega todos os CHECKs normalmente.
 */
export const MIGRATIONS: readonly MigrationStep[] = [
  {
    version: 2,
    sql: [
      `-- v2: challenge_attempts (bancos v1 -> v2) — roda sempre, idempotente`,
      CHALLENGE_ATTEMPTS_TABLE,
      ...CHALLENGE_ATTEMPTS_INDEXES,
    ].join('\n'),
    guardedAlter: { table: 'subjects', column: 'domain', sql: SUBJECTS_DOMAIN_ALTER },
  },
];
