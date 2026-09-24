/**
 * app/electron/main/engine/schemas/artifactsBase.ts — SCHEMAS ZOD DOS ARTEFATOS
 * DA ENGINE: compartilhados (faixa/span/snapshot) + F0 (brief, máquina
 * nocional) + F1/F2 (conceitos) + F3 (grafo, ordem) + F4 (orçamento).
 *
 * EXTRAÍDO de `schemas/artifacts.ts` na refatoração L06 (arquivo ≤500 linhas;
 * comportamento observável preservado — mesmos shapes, mesmas ordens de
 * campo, mesmos enums). O caminho PÚBLICO continua `schemas/artifacts.ts` —
 * fachada fina que reexporta daqui e dos irmãos (`artifactsDrafts.ts`,
 * `artifactsReview.ts`, `artifactsRegistro.ts`).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §3 (modelo de dados), §4
 * (fases F0–F12), §5.5 (formato da violação), §6.3 (schema do apontamento),
 * §9.2 (report.json) e §10 (campos aditivos dos artefatos de produto).
 *
 * Regras que ESTE pacote é a casa (docs §6.3 e §7):
 *   - INV-04: a ORDEM dos campos não é estética — justificativa ANTES de
 *     decisão em todo schema. O lint de build que impõe isso está em
 *     `fieldOrder.ts` e varre a lista REAL do registro (`artifactsRegistro.ts`).
 *   - INV-05: TODO campo de TODO schema é OBRIGATÓRIO. Ausência
 *     semanticamente válida usa valor vazio EXPLÍCITO (array vazio, string
 *     vazia, ou `null` declarado como união) — nunca `.optional()`.
 *   - INV-08: `schemaVersion` NÃO é bumpado por este pacote e não entra nos
 *     schemas da engine — os artefatos da engine são internos e versionados
 *     por hash (`budgetHash`, `hash_orcamento`, snapshots), nunca pelo
 *     schemaVersion do produto.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Compartilhados
// ---------------------------------------------------------------------------

/**
 * As duas faixas do orçamento (`docs/16-engine-de-trilha.md` §3.2):
 * `receptive` — o aluno pode LER; `productive` — pode ser EXIGIDO dele.
 * Invariante: `productive ⊆ receptive` (verificada por gate, não por schema).
 */
export const FaixaSchema = z.enum(['receptive', 'productive']);

/**
 * Span de um trecho ofensor — `[inicio, fim]`, como no apontamento de §6.3
 * (`"span": [122, 149]`). Obrigatório sempre (filtro R1 descarta span
 * ausente/irresolvível).
 */
export const SpanSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);

/** Um snapshot imutável carimbado com hash (docs §2, P3 e §4 F5). */
export const SnapshotSchema = z.object({
  aula_slug: z.string().min(1),
  hash: z.string().min(1),
  caminho: z.string().min(1),
});

// ---------------------------------------------------------------------------
// F0 — brief
// ---------------------------------------------------------------------------

/**
 * O brief da trilha (F0). Portão humano de F0: só sai aprovado com
 * justificativa. A política de harness é a decisão de produto D1 (§3.2),
 * incluindo as alternativas consideradas e rejeitadas no documento.
 */
export const BriefSchema = z.object({
  tema: z.string().min(1),
  objetivo_geral: z.string().min(1),
  publico_alvo: z.string().min(1),
  /** critérios de entrada (entryCriteria) — vazio = trilha de senso iniciante. */
  criterios_de_entrada: z.array(z.string()),
  /** inventário de construções e APIs candidatas (F1 alimenta). */
  construcoes_alvo: z.array(z.string()),
  politica_de_harness: z.enum(['receptive-seed', 'aula-zero', 'wrapper-gerado']),
  restricoes: z.array(z.string()),
  // INV-04: justificativa ANTES da decisão.
  justificativa: z.string().min(1),
  aprovado: z.boolean(),
});

// ---------------------------------------------------------------------------
// F0 — máquina nocional
// ---------------------------------------------------------------------------

/**
 * A máquina nocional (F0; D3 em §12). `limites` é onde a analogia quebra —
 * a onda semântica obrigatória do §7.1 regra 6 termina declarando o ponto de
 * ruptura; `fonte` ancora cada concepção na ECMA-262/MDN quando não há fonte
 * pública pedagógica.
 */
export const NotionalMachineSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().min(1),
  componentes: z.array(z.object({ nome: z.string().min(1), funcao: z.string().min(1) })),
  estados: z.array(z.object({ nome: z.string().min(1), descricao: z.string().min(1) })),
  transicoes: z.array(
    z.object({ de: z.string().min(1), para: z.string().min(1), condicao: z.string().min(1) }),
  ),
  limites: z.array(z.string()),
  analogia: z.string().min(1),
  fonte: z.string().min(1),
});

// ---------------------------------------------------------------------------
// F1/F2 — conceitos (decomposição atômica)
// ---------------------------------------------------------------------------

/**
 * Um conceito candidato a átomo (F2). O teste de atomicidade do §3.6 tem os
 * QUATRO critérios como campos obrigatórios; `raciocinio_de_projeto` vem
 * antes de `atomico` (INV-04): o modelo decide se é átomo depois de ter
 * pensado.
 */
export const ConceitoAtomicoSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  familia_sintatica: z.string().min(1),
  /** um dos seis eixos da chave de átomo (§3.1). */
  eixo: z.enum(['node', 'decl', 'op', 'global', 'api', 'form', 'term']),
  /** a chave estável, ex.: `op:binary:+`, `decl:let`, `form:IfStatement[alternate=null]`. */
  chave_atomo: z.string().min(1),
  /** I9: a primeira aparição é a forma mais simples (FunctionDeclaration antes de arrow). */
  forma_mais_simples: z.boolean(),
  demonstravel: z.boolean(),
  exercitavel: z.boolean(),
  orcamentavel: z.boolean(),
  cronometravel: z.boolean(),
  raciocinio_de_projeto: z.string().min(1),
  atomico: z.boolean(),
});

/**
 * O inventário de conceitos + concepções alternativas (F1/F2). O §4.2 exige
 * misconceptions com âncora na especificação — é o campo `ancora_na_spec`.
 */
export const ConceptsSchema = z.object({
  conceitos: z.array(ConceitoAtomicoSchema),
  concepcoes_alternativas: z.array(
    z.object({
      id: z.string().min(1),
      descricao: z.string().min(1),
      ancora_na_spec: z.string().min(1),
    }),
  ),
});

// ---------------------------------------------------------------------------
// F3 — grafo de pré-requisitos
// ---------------------------------------------------------------------------

/**
 * O grafo (F3): DAG com DUAS arestas semanticamente distintas (§3.4).
 * `desbloqueado_por` é dura (ordenação topológica, detecção de salto);
 * `usa` é a linha da Q-matrix (orçamento cumulativo). A pergunta canônica
 * tem resposta obrigatória (`justificativa`/`evidencia`) antes da decisão
 * `aprovado` — empate resulta em NENHUMA aresta, e precisão vale mais que
 * cobertura. Todo item de `de`/`para` é `concept.id`, jamais `lesson.slug`
 * (type check duro do §3.4).
 */
export const GraphSchema = z.object({
  conceitos: z.array(z.object({ id: z.string().min(1), nome: z.string().min(1) })),
  arestas_duras: z.array(
    z.object({
      de: z.string().min(1),
      para: z.string().min(1),
      justificativa: z.string().min(1),
      aprovado: z.boolean(),
    }),
  ),
  arestas_de_uso: z.array(
    z.object({
      de: z.string().min(1),
      para: z.string().min(1),
      evidencia: z.string().min(1),
      aprovado: z.boolean(),
    }),
  ),
  aulas: z.array(
    z.object({
      slug: z.string().min(1),
      /** concept.ids que esta aula introduz (origem de construção, I4). */
      introduz: z.array(z.string()),
      // INV-04: justificativa ANTES da decisão — `role` é classificação-decisão
      // (§3.7) e só vem depois do motivo.
      justificativa: z.string().min(1),
      /** §3.7: toda composição é um nó próprio, marcado `integration`. */
      role: z.enum(['regular', 'integration']),
      aprovado: z.boolean(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// F3 — ordem topológica
// ---------------------------------------------------------------------------

/**
 * A ordem pedagógica (F3/F4). `order` de módulo é inteiro e único (I14);
 * `posicao` dá a ordem global das aulas — a derivação que `budget.ts` já faz
 * em memória (`pedagogicalOrder`), materializada como artefato.
 */
export const OrderSchema = z.object({
  modulos: z.array(
    z.object({
      slug: z.string().min(1),
      order: z.number().int().nonnegative(),
      justificativa: z.string().min(1),
      aprovado: z.boolean(),
    }),
  ),
  aulas: z.array(
    z.object({
      slug: z.string().min(1),
      posicao: z.number().int().nonnegative(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// F4 — orçamento cumulativo
// ---------------------------------------------------------------------------

/** A matriz construção × aula do §3.5: `—` / `x` / `new`. */
export const MatrizEstadoSchema = z.enum(['nao_disponivel', 'disponivel', 'nova']);

/** As duas faixas com seus conjuntos (chaves de átomo, ex.: `node:IfStatement`). */
export const FaixasSchema = z.object({
  receptive: z.array(z.string()),
  productive: z.array(z.string()),
});

/**
 * O orçamento cumulativo (F4), derivado por código, zero LLM. Sempre
 * materializado em disco (`budget.generated.json` — §3.5, para o revisor ler
 * sem executar nada e o git mostrar o diff). `budget_entrada` é o orçamento
 * do testsCode (assimetria das quatro superfícies, §3.3); `budget_saida` o
 * do solutionCode; `introduces` é o que ESTA aula acrescenta, por faixa;
 * `matrix` traz o terceiro estado (`nova`) — mudar a FORMA de algo ensinado
 * é evento de currículo que exige aula própria; `tetos` são as quatro réguas
 * do §3.6 como parâmetros configuráveis.
 */
export const BudgetSchema = z.object({
  aulas: z.array(
    z.object({
      /** `<moduleSlug>/<lessonSlug>` — a chave usada nos relatórios. */
      ref: z.string().min(1),
      entryConstructs: z.array(z.string()),
      budget_entrada: FaixasSchema,
      budget_saida: FaixasSchema,
      introduces: FaixasSchema,
      matrix: z.array(z.object({ construcao: z.string().min(1), estado: MatrizEstadoSchema })),
      element_count: z.number().int().nonnegative(),
      tetos: z.object({
        construcoes_produtivas_novas: z.number().int().nonnegative(),
        elementos_interagindo: z.number().int().nonnegative(),
        elementos_nao_interativos: z.number().int().nonnegative(),
        tempo_resolucao_s: z.number().nonnegative(),
      }),
    }),
  ),
  fonte: z.enum(['declared', 'inferred']),
  politica_de_harness: z.enum(['receptive-seed', 'none']),
  hash: z.string().min(1),
});
