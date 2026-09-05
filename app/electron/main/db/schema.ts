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
 * v3 (onda4-desafio-persistencia): lessons ganha `exercise_json` (TEXT nullable)
 * — o exercício de matemática (LessonExercise) da lição, serializado em JSON na
 * persistência do fluxo generate-lesson. Bancos NOVOS nascem em v3; bancos v2
 * sobem via MIGRATIONS (ALTER ADD COLUMN guardado — crash-safe), sem perder
 * dados.
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
 *
 * v4 (rodada8-trilhas): o conteúdo das trilhas vive em ARQUIVOS estáticos
 * (resources/tracks, criados pelo CLI); o banco guarda o PROGRESSO do aluno:
 *   track_progress          lições concluídas por trilha (progressão sequencial)
 *   track_proficiency       veredito do teste de proficiência da trilha
 *   generated_challenges    desafios REGENERADOS por aluno (nunca-repetir)
 *     (challenge_id NÃO é FK — o desafio pode ser gerado sem estar na tabela
 *     challenges; o slug é a chave estável do nunca-repetir, igual a
 *     challenge_attempts)
 *
 * v5 (onda1-contrato-quiz): o QUIZ ADAPTATIVO ganha memória. Até aqui a
 * resposta do quiz NUNCA chegava ao processo main — vivia em estado de
 * componente e morria quando o app fechava, o que torna impossível a regra
 * nova do produto ("o aluno só vai para o desafio depois de PROVAR que
 * entendeu"). Duas tabelas novas, ambas keyed por (track_slug, lesson_id) como
 * as tabelas de trilha da v4 e, como elas, SEM FK: o conteúdo das trilhas vive
 * em ARQUIVOS, não em linhas.
 *   quiz_attempts      uma linha por resposta do aluno a um quiz (autorado ou
 *                      remedial), com acerto/erro, o ordinal da tentativa na
 *                      seção e a origem do quiz. É a base do gate de maestria.
 *   quiz_remediations  a explicação do erro que o aluno leu MAIS o quiz gerado
 *                      na hora depois dela (RemedialQuizDto serializado em
 *                      quiz_json) — é o que faz a explicação FICAR no
 *                      histórico da aula entre sessões.
 */
export const SCHEMA_VERSION = 5;

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
 * v5 (onda1-contrato-quiz): UMA resposta do aluno a UM quiz. Declarada como
 * constante ANTES de TABLES para o caminho de CRIAÇÃO NOVA (TABLES) e o de
 * MIGRAÇÃO v4→v5 (MIGRATIONS) compartilharem o MESMO SQL — o padrão de
 * CHALLENGE_ATTEMPTS_TABLE.
 *
 * SEM FK, de propósito: `track_slug`/`lesson_id` apontam para conteúdo que
 * vive em ARQUIVOS (resources/tracks), não em linhas — exatamente como
 * track_progress e generated_challenges da v4. `correct` é 0/1 (SQLite não
 * tem boolean) e `quiz_origin` distingue o quiz DA TRILHA do quiz gerado na
 * hora: as tentativas dos dois convivem aqui, e sem essa coluna o histórico
 * não saberia dizer o que o aluno respondeu.
 */
export const QUIZ_ATTEMPTS_TABLE: string = `-- quiz_attempts (v5: respostas do aluno ao quiz da aula)
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id             TEXT PRIMARY KEY,
  track_slug     TEXT NOT NULL,
  lesson_id      TEXT NOT NULL,
  section_key    TEXT NOT NULL,
  assertion_id   TEXT NOT NULL,
  selected_index INTEGER NOT NULL,
  correct        INTEGER NOT NULL CHECK (correct IN (0,1)),
  attempt_no     INTEGER NOT NULL DEFAULT 1,
  quiz_origin    TEXT NOT NULL DEFAULT 'authored' CHECK (quiz_origin IN ('authored','remedial')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);`;

/**
 * v5 (onda1-contrato-quiz): a REMEDIAÇÃO — a explicação do erro que o aluno
 * leu e o quiz novo que veio depois dela (`quiz_json` = o RemedialQuizDto
 * serializado). É o que faz a explicação FICAR no histórico da aula depois de
 * o app fechar.
 */
export const QUIZ_REMEDIATIONS_TABLE: string = `-- quiz_remediations (v5: explicação do erro + quiz gerado na hora)
CREATE TABLE IF NOT EXISTS quiz_remediations (
  id                  TEXT PRIMARY KEY,
  track_slug          TEXT NOT NULL,
  lesson_id           TEXT NOT NULL,
  section_key         TEXT NOT NULL,
  origin_assertion_id TEXT NOT NULL,
  generation          INTEGER NOT NULL DEFAULT 1,
  explanation         TEXT NOT NULL,
  quiz_json           TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);`;

/**
 * Índices das duas tabelas do quiz (v5). A leitura REAL é sempre "o quiz DESTA
 * aula" — o histórico da aula e o gate de maestria filtram por
 * (track_slug, lesson_id), então é esse o índice que existe. Mesma definição
 * nos dois caminhos (criação nova e migração).
 */
export const QUIZ_INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_quiz_attempts_track_lesson     ON quiz_attempts(track_slug, lesson_id);`,
  `CREATE INDEX IF NOT EXISTS idx_quiz_remediations_track_lesson ON quiz_remediations(track_slug, lesson_id);`,
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
  completed_at     TEXT,
  exercise_json    TEXT                    -- v3: exercício de matemática serializado (LessonExercise)
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

  `-- track_progress (v4: lições concluídas por trilha — progressão sequencial)
CREATE TABLE IF NOT EXISTS track_progress (
  track_slug   TEXT NOT NULL,
  lesson_id    TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (track_slug, lesson_id)
);`,

  `-- track_proficiency (v4: veredito do teste de proficiência da trilha)
CREATE TABLE IF NOT EXISTS track_proficiency (
  track_slug TEXT PRIMARY KEY,
  verdict    TEXT NOT NULL CHECK (verdict IN ('passed','failed')),
  stars      INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  passed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  `-- generated_challenges (v4: desafios REGENERADOS para este aluno — a LLM
-- vê os desafios que ele errou na aula e não repete; challenge_id é o slug
-- estável usado no nunca-repetir de challenge_attempts)
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
);`,

  QUIZ_ATTEMPTS_TABLE,

  QUIZ_REMEDIATIONS_TABLE,
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
  ...QUIZ_INDEXES,
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
  'track_progress',
  'track_proficiency',
  'generated_challenges',
  'quiz_attempts',
  'quiz_remediations',
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

/**
 * v3: ALTER que adiciona `exercise_json` a lessons (bancos v2 -> v3).
 * Executado por migrate.ts SOMENTE quando a coluna ainda não existe (via
 * `guardedAlter`) — um boot anterior pode ter adicionado a coluna e crashado
 * antes de gravar `user_version = 3`; re-rodar o ALTER lançaria "duplicate
 * column name: exercise_json". Coluna nullable: lessons antigas ficam com NULL
 * (sem exercício), o que o repo parseia como `exercise: null`.
 */
export const LESSONS_EXERCISE_ALTER: string = `ALTER TABLE lessons ADD COLUMN exercise_json TEXT;`;

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
 *
 * v3 (SCHEMA_VERSION=3, onda4-desafio-persistencia):
 *   - lessons ganha `exercise_json` via `LESSONS_EXERCISE_ALTER`, guardado por
 *     `guardedAlter` (mesmo padrão crash-safe do v2). Sem tabela nova — o `sql`
 *     do passo é apenas um comentário (roda sempre, no-op idempotente).
 *
 * v5 (SCHEMA_VERSION=5, onda1-contrato-quiz):
 *   - quiz_attempts e quiz_remediations são criadas NOVAS (CREATE TABLE IF NOT
 *     EXISTS + índices), então carregam todos os CHECKs normalmente e o passo
 *     dispensa `guardedAlter` — não há ALTER nenhum. Nenhuma tabela antiga é
 *     tocada: um banco v4 sobe para v5 sem perder linha alguma.
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
  {
    version: 3,
    sql: [
      `-- v3: lessons.exercise_json (bancos v2 -> v3) — sem tabela nova; o ALTER é guardedAlter`,
    ].join('\n'),
    guardedAlter: { table: 'lessons', column: 'exercise_json', sql: LESSONS_EXERCISE_ALTER },
  },
  {
    version: 4,
    sql: [
      `-- v4: trilhas (rodada8) — tabelas novas, todas CREATE IF NOT EXISTS`,
      `CREATE TABLE IF NOT EXISTS track_progress (
  track_slug   TEXT NOT NULL,
  lesson_id    TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (track_slug, lesson_id)
);`,
      `CREATE TABLE IF NOT EXISTS track_proficiency (
  track_slug TEXT PRIMARY KEY,
  verdict    TEXT NOT NULL CHECK (verdict IN ('passed','failed')),
  stars      INTEGER NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  passed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);`,
      `CREATE TABLE IF NOT EXISTS generated_challenges (
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
);`,
    ].join('\n'),
  },
  {
    version: 5,
    sql: [
      `-- v5: quiz adaptativo (onda1-contrato-quiz) — tabelas novas, todas CREATE IF NOT EXISTS`,
      QUIZ_ATTEMPTS_TABLE,
      QUIZ_REMEDIATIONS_TABLE,
      ...QUIZ_INDEXES,
    ].join('\n'),
  },
];
