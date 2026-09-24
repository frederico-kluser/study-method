/**
 * app/electron/main/engine/schemas/artifacts.ts — FACHADA dos SCHEMAS ZOD DOS
 * ARTEFATOS DA ENGINE DE TRILHAS (pacote P-04, onda 1 do plano de execução v1).
 *
 * REFATORAÇÃO L06: este arquivo virou FACHADA FINA (re-export) — os schemas
 * foram divididos por fase e TODO o contrato público continua exportado por
 * ESTE caminho (nenhum consumidor mudou de import):
 *   - `artifactsBase.ts`     — compartilhados + F0/F1/F2/F3/F4;
 *   - `artifactsDrafts.ts`   — F5 (freeze), F7 (draft de aula), F8 (draft de
 *                              desafio — preprocess de `language`);
 *   - `artifactsReview.ts`   — F10/F11 (apontamentos, ações) e F12 (report);
 *   - `artifactsRegistro.ts` — `SCHEMA_REGISTRY` (A-P04-2) e
 *                              `NOMES_DOS_ARTEFATOS`.
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §3 (modelo de dados), §4
 * (fases F0–F12), §5.5 (formato da violação), §6.3 (schema do apontamento),
 * §9.2 (report.json) e §10 (campos aditivos dos artefatos de produto).
 *
 * Dois pontos conscientes sobre o que ESTE pacote é e o que não é:
 *   - Não reflete 1:1 os tipos do produto (`content/trackTypes.ts`) nem os
 *     tipos das implementações atuais da engine (`budget.ts`, `audit.ts`,
 *     `extract.ts`): estes schemas validam os ARTEFATOS DA ENGINE.
 *   - INV-08: `schemaVersion` NÃO é bumpado por este pacote e não entra nos
 *     schemas da engine — os artefatos da engine são internos e versionados
 *     por hash (`budgetHash`, `hash_orcamento`, snapshots), nunca pelo
 *     schemaVersion do produto.
 *
 * Regras que ESTE pacote é a casa (docs §6.3 e §7):
 *   - INV-04: a ORDEM dos campos não é estética — justificativa ANTES de
 *     decisão em todo schema. O lint de build que impõe isso está em
 *     `fieldOrder.ts` e varre a lista REAL do registro (A-P04-2).
 *   - INV-05: TODO campo de TODO schema é OBRIGATÓRIO. Ausência
 *     semanticamente válida usa valor vazio EXPLÍCITO (array vazio, string
 *     vazia, ou `null` declarado como união) — nunca `.optional()`. As
 *     ausências legítimas de `assertions`/`optionRationales`/`language` são
 *     materializadas por `z.preprocess` (NUNCA `.default()`), com os tetos e
 *     enums fechados preservados: ≤3 assertions, ≤2 produtivas, ≤12
 *     apontamentos, answerIndex 0..3, optionRationales 0 OU 4.
 *   - P4: o schema de saída do revisor (FindingsSchema) não tem campo de
 *     código — se o campo existir, o modelo usa (docs §2, P4).
 *
 * `SCHEMA_REGISTRY` é a ÚNICA lista de schemas da engine: quem registrar um
 * schema novo em `SCHEMA_REGISTRY` ganha o lint de graça; quem esquecer de
 * registrar é pego pelo teste que fixa os 14 nomes em
 * `tests/engineSchemas.test.ts`.
 */

// ─── compartilhados + F0/F1/F2/F3/F4 (artifactsBase.ts) ──────────────────────
export {
  FaixaSchema,
  SpanSchema,
  BriefSchema,
  NotionalMachineSchema,
  ConceitoAtomicoSchema,
  ConceptsSchema,
  GraphSchema,
  OrderSchema,
  MatrizEstadoSchema,
  FaixasSchema,
  BudgetSchema,
} from './artifactsBase';

// ─── F5/F7/F8 — autoria (artifactsDrafts.ts) ─────────────────────────────────
export {
  FreezeSchema,
  AssertionDraftSchema,
  LessonDraftSchema,
  ChallengeDraftSchema,
} from './artifactsDrafts';

// ─── F10/F11/F12 — revisão, ações e report (artifactsReview.ts) ──────────────
export {
  CategoriaSchema,
  SeveritySchema,
  ApontamentoSchema,
  FindingsSchema,
  ACAO_CATALOGO,
  ActionsSchema,
  ReportSchema,
} from './artifactsReview';

// ─── o registro A-P04-2 (artifactsRegistro.ts) ───────────────────────────────
export {
  SCHEMA_REGISTRY,
  NOMES_DOS_ARTEFATOS,
  type SchemaRegistrado,
} from './artifactsRegistro';
