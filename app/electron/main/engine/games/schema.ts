/**
 * app/electron/main/engine/games/schema.ts — SCHEMAS ZOD do conteúdo de games
 * (`app/resources/games/<world>/`): `world.json` e os ficheiros de nível.
 *
 * ONDA-GAMES (motor). Este módulo é a fronteira de VALIDAÇÃO entre o conteúdo
 * autoria-outro-agente e o motor: nada entra no runner sem passar por aqui.
 * Segue o padrão zod do repositório (`engine/schemas/artifactsDrafts.ts`):
 * schema primeiro, tipo derivado depois, mensagem de erro que diz ao AUTOR do
 * conteúdo o que corrigir.
 *
 * CONTRATO DO NÍVEL (congelado com o orquestrador):
 *
 *   {
 *     id, title, enunciado, introduces: string[], boss?,
 *     contract: { mode: 'io', cases: [{ name, input, expectedOutput, hidden? }] },
 *     langs: { c|python|rust: { starter, reference } },
 *     optimize: { lines: { par }, timeMs: { parMs } }
 *   }
 *
 * O contrato é de I/O (stdin → stdout) por DECISÃO: a mesma mecânica corre em
 * C, Python ou Rust e o veredito sai por comparação de saída — a linguagem do
 * aluno nunca participa do julgamento.
 *
 * `mode` é literal `'io'` (enum fechado): hoje só existe o modo de I/O. Um
 * futuro modo (ex.: unit) estende o enum DE PROPÓSITO — aceitar string livre
 * hoje faria um conteúdo com typo cair num modo fantasma.
 *
 * O `reference` (solução de referência por linguagem) viaja no conteúdo porque
 * é ele que prova, na autoria, que o nível é solucionável — o payload do aluno
 * (`GameLevelPayload`) NUNCA o carrega (sem spoilers).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Caso de teste (contrato de I/O)
// ---------------------------------------------------------------------------

/**
 * UM caso do contrato io. `input` é o stdin exato; `expectedOutput` é o stdout
 * esperado ANTES da normalização (a comparação normaliza os dois lados:
 * CRLF→LF, whitespace final por linha — ver `runner.ts`).
 *
 * `hidden` marca o caso oculto: ele corre e julga igual, mas o resultado do
 * aluno não mostra `expected`/`actual` (`GameCaseResult` sem os dois campos).
 */
export const GameCaseSchema = z.object({
  name: z.string().min(1),
  input: z.string(),
  expectedOutput: z.string(),
  hidden: z.preprocess((v) => (v === undefined ? false : v), z.boolean()),
});

// ---------------------------------------------------------------------------
// Nível
// ---------------------------------------------------------------------------

/** A linguagem do aluno dentro de um nível: starter + solução de referência. */
export const GameLangCodeSchema = z.object({
  starter: z.string(),
  reference: z.string().min(1),
});

/**
 * As linguagens do nível. Todas as três chaves EXISTEM no objeto (podem vir
 * ausentes = não suportadas neste nível); pelo menos UMA tem de estar
 * preenchida — um nível sem linguagem nenhuma é conteúdo morto.
 */
export const GameLangsSchema = z
  .object({
    c: z.preprocess((v) => (v === undefined ? undefined : v), GameLangCodeSchema.optional()),
    python: z.preprocess((v) => (v === undefined ? undefined : v), GameLangCodeSchema.optional()),
    rust: z.preprocess((v) => (v === undefined ? undefined : v), GameLangCodeSchema.optional()),
  })
  .refine((langs) => langs.c !== undefined || langs.python !== undefined || langs.rust !== undefined, {
    message: 'langs precisa de pelo menos UMA linguagem (c, python ou rust) com starter+reference',
  });

/** Os alvos de otimização do nível (modo otimização: linhas e tempo). */
export const GameOptimizeSchema = z.object({
  lines: z.object({ par: z.number().int().positive() }),
  timeMs: z.object({ parMs: z.number().int().positive() }),
});

/**
 * O nível COMPLETO (ficheiro de nível). `boss` é o chefe de módulo
 * (avaliação cumulativa) — ausente = `false` (materializado por preprocess,
 * o idioma INV-05 do repositório: nada de `.optional()` solto no dado que o
 * motor consome, a ausência vira valor explícito).
 */
export const GameLevelSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  enunciado: z.string().min(1),
  introduces: z.array(z.string().min(1)),
  boss: z.preprocess((v) => (v === undefined ? false : v), z.boolean()),
  contract: z.object({
    mode: z.literal('io'),
    cases: z.array(GameCaseSchema).min(1),
  }),
  langs: GameLangsSchema,
  optimize: GameOptimizeSchema,
});

// ---------------------------------------------------------------------------
// Mundo
// ---------------------------------------------------------------------------

/**
 * O `world.json` — metadados do mundo. `levels` é a ORDEM canónica dos níveis
 * (ids); ausente ⇒ o loader ordena pelo caminho do ficheiro de cada nível.
 * Os níveis em si vivem em ficheiros à parte dentro da pasta do mundo (o
 * loader descobre `*.json` recursivamente — ver `worlds.ts`).
 */
export const GameWorldSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  levels: z.preprocess((v) => (v === undefined ? [] : v), z.array(z.string().min(1))),
});

// ---------------------------------------------------------------------------
// Tipos derivados (o conteúdo VALIDADO que o motor consome)
// ---------------------------------------------------------------------------

export type GameCaseContent = z.infer<typeof GameCaseSchema>;
export type GameLangCode = z.infer<typeof GameLangCodeSchema>;
export type GameLevelContent = z.infer<typeof GameLevelSchema>;
export type GameWorldContent = z.infer<typeof GameWorldSchema>;

/**
 * Erro ESTRUTURADO de conteúdo inválido (fail-closed para o julgamento: um
 * nível malformado nunca corre). `file` carrega o caminho para o autor do
 * conteúdo corrigir; `issues` é o resumo zod.
 */
export class GameContentError extends Error {
  readonly code = 'GAME_CONTENT_INVALID' as const;
  readonly file: string;
  readonly issues: string;

  constructor(file: string, issues: string) {
    super(`conteúdo de game inválido em ${file}: ${issues}`);
    this.name = 'GameContentError';
    this.file = file;
    this.issues = issues;
  }
}

/** Resumo legível dos issues zod (primeiros 3 — o resto é ruído para o autor). */
function resumirIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join(' · ');
}

/**
 * Faz o parse VALIDADO de um nível. LANÇA `GameContentError` (fail-closed) —
 * quem carrega conteúdo para JULGAR nunca aceita nível sem validação.
 */
export function parseGameLevel(raw: unknown, file: string): GameLevelContent {
  const result = GameLevelSchema.safeParse(raw);
  if (!result.success) throw new GameContentError(file, resumirIssues(result.error));
  return result.data;
}

/** Faz o parse VALIDADO de um mundo (mesma semântica fail-closed do nível). */
export function parseGameWorld(raw: unknown, file: string): GameWorldContent {
  const result = GameWorldSchema.safeParse(raw);
  if (!result.success) throw new GameContentError(file, resumirIssues(result.error));
  return result.data;
}
