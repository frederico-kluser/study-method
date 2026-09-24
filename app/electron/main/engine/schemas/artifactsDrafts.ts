/**
 * app/electron/main/engine/schemas/artifactsDrafts.ts — SCHEMAS ZOD DOS
 * ARTEFATOS DE AUTORIA da engine: F5 (FREEZE), F7 (draft de aula) e F8 (draft
 * de desafio).
 *
 * EXTRAÍDO de `schemas/artifacts.ts` na refatoração L06 (arquivo ≤500 linhas;
 * comportamento observável preservado). O caminho PÚBLICO continua
 * `schemas/artifacts.ts` (fachada fina).
 */

import { z } from 'zod';

import { DEFAULT_CHALLENGE_LANGUAGE, KNOWN_CHALLENGE_LANGUAGES } from '../lang/registry';
import { SnapshotSchema } from './artifactsBase';

// ---------------------------------------------------------------------------
// F5 — FREEZE (ponto de não retorno)
// ---------------------------------------------------------------------------

/**
 * O FREEZE (F5; docs §2, P3). Congela o hash do orçamento e do grafo ANTES
 * do fan-out da autoria: converte "saída do agente anterior" em "arquivo
 * versionado" e cada autor recebe um snapshot imutável carimbado com hash,
 * nunca o estado global ao vivo.
 */
export const FreezeSchema = z.object({
  hash_orcamento: z.string().min(1),
  hash_grafo: z.string().min(1),
  carimbo: z.string().min(1),
  dossies: z.array(SnapshotSchema),
  snapshots: z.array(SnapshotSchema),
});

// ---------------------------------------------------------------------------
// F7 — draft de aula (teoria)
// ---------------------------------------------------------------------------

/**
 * O draft de uma aula (F7), um agente = uma aula = um arquivo. Os campos
 * aditivos do produto (§10) entram como campos obrigatórios do artifact da
 * engine: `objective` (verbo, enunciado, contexto, critério), `introduces`
 * nas duas faixas (no máximo 2 produtivas — A7/I2), `foraDeEscopo`
 * OBRIGATÓRIO e NÃO-vazio, `eiClass`, `role`, `targetAtom`,
 * `notionalMachineDelta`, `budgetHash`/`budgetVersion` (o autor recebe o
 * orçamento CONGELADO — nunca o estado vivo), `status` (inclui `bloqueado`
 * devolutivo: "se você acha que precisa de algo fora do orçamento, isso é
 * defeito do grafo, não licença", §7.1 regra 3) e `research`.
 *
 * `assertions` (ADITIVO, onda 1 schema-quiz) e o `optionRationales` de cada
 * afirmação (ADITIVO, onda1-contrato-quiz) são a EXCEÇÃO à regra acima: o
 * produto aceita aula SEM quiz (ausência válida no lesson.json), então o
 * draft TAMBÉM aceita ausência — nunca `.optional()` (INV-05): `z.preprocess`
 * materializa a ausência como valor vazio EXPLÍCITO (`[]`), e quando o campo
 * vem presente o shape é validado estritamente (malformado ou > 3 REPROVA o
 * draft).
 *
 * `theory[]` segue o §7.1 regra 12 (três slots: teoria/referência/drill) e o
 * §5.3 (bloco cercado com tag é código; crase inline é prosa; a `tag` vazia
 * é o valor explícito para prosa — a exigência de tag real que parseia é do
 * gate G-SCHEMA/A4, não do schema).
 */
export const AssertionDraftSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  // REPLAN A2: fail-fast no DRAFT — answerIndex fora de 0..3 (as 4 opções)
  // REPROVA o draft aqui, antes do validador de produto no load.
  answerIndex: z.number().int().nonnegative().max(3),
  feedback: z.string().min(1),
  // REPLAN A1: âncora da afirmação à seção de teoria que a demonstra
  // (`theory[].id`). INV-05: nada opcional — ausência vira valor vazio
  // EXPLÍCITO (`''`), mesmo idioma do campo `assertions` no LessonDraftSchema
  // (z.preprocess → typeName ZodEffects, não flagrado pelo lint); presente,
  // precisa ser string não vazia. A EXISTÊNCIA do id em theory[] é conferida
  // pelo validador de produto no load (validateAssertions com theoryIds).
  sectionId: z.preprocess((v) => (v === undefined ? '' : v), z.string().min(1)),
  // ADITIVO (onda1-contrato-quiz): UM RACIONAL POR OPÇÃO — a explicação de
  // POR QUE aquele distrator está errado, que é o material do quiz ADAPTATIVO
  // (errou ⇒ a IA explica AQUELE erro, não o feedback genérico da afirmação).
  //
  // INV-05: nada `.optional()` — a ausência vira o valor vazio EXPLÍCITO
  // (`[]`) via `z.preprocess`, o mesmo idioma de `assertions` no
  // `LessonDraftSchema`. O `.refine` (e não `.length(4)`) é o que exprime
  // "0 OU 4": zero é a ausência legítima (o autor não declarou racionais e a
  // aula continua válida no produto — ver `TrackAssertion.optionRationales`),
  // quatro é o campo preenchido de verdade, um racional por opção na MESMA
  // ordem. Qualquer comprimento entre 1 e 3 é meia-declaração e REPROVA o
  // draft aqui, antes do validador de produto no load.
  optionRationales: z.preprocess(
    (v) => (v === undefined ? [] : v),
    z.array(z.string().min(1)).refine((r) => r.length === 0 || r.length === 4, {
      message: 'optionRationales deve ter 0 itens (ausente) ou EXATAMENTE 4 (um por opção)',
    }),
  ),
});

export const LessonDraftSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  objective: z.object({
    verbo: z.string().min(1),
    enunciado: z.string().min(1),
    contexto: z.string().min(1),
    criterio: z.string().min(1),
  }),
  introduces: z.object({
    receptive: z.array(z.string()),
    productive: z.array(z.string()).max(2),
  }),
  introducesTerms: z.array(z.string()),
  foraDeEscopo: z.array(z.string()).min(1),
  eiClass: z.enum(['fato', 'categoria', 'regra', 'principio', 'integrativo']),
  targetAtom: z.string().min(1),
  notionalMachineDelta: z.string().min(1),
  budgetHash: z.string().min(1),
  budgetVersion: z.string().min(1),
  research: z.array(z.string()),
  theory: z.array(
    z.object({
      id: z.string().min(1),
      secao: z.enum(['teoria', 'referencia', 'drill']),
      markdown: z.string().min(1),
      tag: z.string(),
    }),
  ),
  // ADITIVO (onda 1 schema-quiz, §10 do docs/16-engine-de-trilha.md):
  // AFIRMAÇÕES da aula — frases que a aula ensina, cada uma com quiz de
  // múltipla escolha (máx. 3; shape = AssertionDraftSchema, espelha
  // TrackAssertion do produto). INV-05: nada opcional — ausência vira valor
  // vazio EXPLÍCITO (`z.preprocess` mapeia undefined → `[]`); presente,
  // shape inválido ou > 3 REPROVA o draft. Invariantes cruzadas (opções
  // ÚNICAS, `answerIndex` na faixa das opções) são do validador de produto
  // `validateAssertions` no load (aqui: constraints por campo).
  assertions: z.preprocess(
    (v) => (v === undefined ? [] : v),
    z.array(AssertionDraftSchema).max(3),
  ),
  // INV-04: justificativa ANTES da decisão. `role` (classificação da aula,
  // §3.7) e `status` (estado de ciclo de vida, inclui `bloqueado` devolutivo
  // — §7.1 regra 3) são decisões que vêm DEPOIS do motivo.
  justificativa: z.string().min(1),
  role: z.enum(['regular', 'integration']),
  status: z.enum(['rascunho', 'pronto_para_revisao', 'bloqueado', 'aprovado']),
  aprovado: z.boolean(),
});

// ---------------------------------------------------------------------------
// F8 — draft de desafio (challenge e testes)
// ---------------------------------------------------------------------------

/**
 * O draft de um desafio (F8). Itens de avaliação vêm ANTES dos materiais
 * (§4.3). Campos aditivos do §10 como campos obrigatórios:
 * `outputChannel` (o modo de falha nº 1: a solução imprime enquanto o teste
 * espera retorno), `requires`, `requirements` (bijection enunciado ↔ teste,
 * J4), `notRequired` (escopo declarado, J9), `subgoals`, `surfaceDomain`,
 * `solutionAlternates`, `wrongSolutions` (J5: cada solução errada catalogada
 * falha em ≥1 teste) e `scenarios` com tipo DERIVADO do orçamento (A11 —
 * nunca a cobertura fixa example+boundary+error).
 *
 * `expectedTestCount` sustenta a prova de execução 3 do §5.4; o `concept`
 * pertence a `lesson.concepts` (I16).
 */
export const ChallengeDraftSchema = z.object({
  slug: z.string().min(1),
  conceito: z.string().min(1),
  /**
   * A LINGUAGEM DE PROGRAMAÇÃO do desafio — o id/token do registro
   * (`engine/lang/registry.ts`), o mesmo vocabulário de
   * `TrackChallengeSource.language`.
   *
   * POR QUE O CAMPO PRECISAVA EXISTIR: o draft de desafio (F8) é o artefato
   * que atravessa F8 → F9 (provas por execução) → F12 (materialização), e até
   * aqui ele NÃO carregava linguagem nenhuma — `f12Materialize.ts:463` a
   * inventava com o literal `language: 'nodejs'` na saída. Num mundo de mais
   * de uma linguagem, um draft sem linguagem é um draft que o provador não
   * sabe executar e o auditor não sabe parsear.
   *
   * INV-05 (nada opcional nos schemas da engine): a ausência vira valor
   * EXPLÍCITO via `z.preprocess` — o MESMO padrão de `assertions` no
   * `LessonDraftSchema` acima, e não `.default()`, que o lint de
   * `fieldOrder.encontrarCamposOpcionais` reprova. Draft antigo/sem o campo
   * continua parseando, com `DEFAULT_CHALLENGE_LANGUAGE` (`'nodejs'`) — que é
   * exatamente o literal que a F12 escrevia.
   */
  language: z.preprocess(
    (v) => (v === undefined ? DEFAULT_CHALLENGE_LANGUAGE : v),
    z.enum(KNOWN_CHALLENGE_LANGUAGES as unknown as [string, ...string[]]),
  ),
  statement: z.string().min(1),
  starterCode: z.string().min(1),
  solutionCode: z.string().min(1),
  testsCode: z.string().min(1),
  expectedTestCount: z.number().int().positive(),
  outputChannel: z.enum(['retorno', 'impressao']),
  requires: z.array(z.string()),
  notRequired: z.array(z.string()),
  subgoals: z.array(z.string()),
  scenarios: z.array(
    z.object({
      tipo: z.enum(['exemplo', 'limite', 'erro', 'valido', 'invalido']),
      /** a construção/orçamento que torna o cenário exigível (A11). */
      derivado_de: z.string().min(1),
      descricao: z.string().min(1),
    }),
  ),
  taskSkill: z.string().min(1),
  supportLevel: z.enum(['com_andaime', 'sem_andaime']),
  surfaceDomain: z.string().min(1),
  solutionAlternates: z.array(z.string()),
  wrongSolutions: z.array(z.string()),
  requirements: z.array(
    z.object({ id: z.string().min(1), descricao: z.string().min(1), teste: z.string().min(1) }),
  ),
  // INV-04: justificativa ANTES da decisão.
  justificativa: z.string().min(1),
  aprovado: z.boolean(),
});
