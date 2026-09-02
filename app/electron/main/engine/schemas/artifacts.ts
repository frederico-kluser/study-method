/**
 * app/electron/main/engine/schemas/artifacts.ts — SCHEMAS ZOD DOS ARTEFATOS
 * DA ENGINE DE TRILHAS (pacote P-04, onda 1 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §3 (modelo de dados), §4
 * (fases F0–F12), §5.5 (formato da violação), §6.3 (schema do apontamento),
 * §9.2 (report.json) e §10 (campos aditivos dos artefatos de produto).
 *
 * Dois pontos conscientes sobre o que ESTE arquivo é e o que não é:
 *   - Não reflete 1:1 os tipos do produto (`content/trackTypes.ts`) nem os
 *     tipos das implementações atuais da engine (`budget.ts`, `audit.ts`,
 *     `extract.ts`): estes schemas validam os ARTEFATOS DA ENGINE (brief,
 *     máquina nocional, conceitos, grafo, ordem, orçamento, freeze, drafts,
 *     achados do revisor, ações do planejador e o report.json). Os nomes de
 *     campo vêm do documento normativo (faixa `receptive`/`productive`,
 *     `introduces`, `desbloqueado_por`/`usa`, snapshot, `trechoOfensor`,
 *     `evidencia`, …).
 *   - INV-08: `schemaVersion` NÃO é bumpado por este pacote e não entra nos
 *     schemas da engine — os artefatos da engine são internos e versionados
 *     por hash (`budgetHash`, `hash_orcamento`, snapshots), nunca pelo
 *     schemaVersion do produto (comparado por igualdade estrita em 4 lugares,
 *     docs §10).
 *
 * Regras que ESTE arquivo é a casa (docs §6.3 e §7):
 *   - INV-04: a ORDEM dos campos não é estética — justificativa ANTES de
 *     decisão em todo schema. O lint de build que impõe isso está em
 *     `fieldOrder.ts` e varre a lista REAL abaixo (A-P04-2).
 *   - INV-05: TODO campo de TODO schema é OBRIGATÓRIO. Ausência
 *     semanticamente válida usa valor vazio EXPLÍCITO (array vazio, string
 *     vazia, ou `null` declarado como união) — nunca `.optional()`.
 *   - P4: o schema de saída do revisor (FindingsSchema) não tem campo de
 *     código — se o campo existir, o modelo usa (docs §2, P4).
 *
 * `SCHEMA_REGISTRY` é a ÚNICA lista de schemas da engine: o lint de ordem e
 * a varredura de campos opcionais percorrem ESTA lista real de objetos —
 * quem registrar um schema novo em `SCHEMA_REGISTRY` ganha o lint de graça;
 * quem esquecer de registrar é pego pelo teste que fixa os 14 nomes em
 * `tests/engineSchemas.test.ts`.
 */

import { z } from 'zod';

import { DEFAULT_CHALLENGE_LANGUAGE, KNOWN_CHALLENGE_LANGUAGES } from '../lang/registry';

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
const SnapshotSchema = z.object({
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
 * `assertions` (ADITIVO, onda 1 schema-quiz) é a EXCEÇÃO à regra acima: o
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
 * espera retorno), `requires`, `requirements` (bijeção enunciado ↔ teste,
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

// ---------------------------------------------------------------------------
// F10/F11 — achados do REVISOR (apontamentos)
// ---------------------------------------------------------------------------

/**
 * Categorias de apontamento (§6.5). A severidade é por TABELA FIXA, nunca
 * opinada — daí `categoria` e `severity` serem enums, não strings livres.
 */
export const CategoriaSchema = z.enum([
  'construcao_nao_ensinada',
  'api_nao_ensinada',
  'pre_requisito_violado',
  'teste_invalido',
  'gabarito_nao_passa',
  'cobertura_faltante',
  'teoria_desalinhada_do_desafio',
  'ambiguidade_de_enunciado',
  'granularidade',
  'estilo',
  'tom',
  'prosa',
]);

/** §6.5: bloqueante abre rodada; corrigir abre rodada; sugestão nunca abre. */
export const SeveritySchema = z.enum(['bloqueante', 'corrigir', 'sugestao']);

/**
 * O apontamento do revisor — o schema de §6.3, na ORDEM do documento:
 * evidência (verificável e citável) ANTES de qualquer julgamento. O revisor
 * não escreve código, não pontua e não aprova (P4): não há campo de patch
 * nem de veredito aqui. `evidencia.introduzido_em` é `null` declarado — a
 * distinção que faz o laço convergir em §5.5: `null` = LACUNA DE CURRÍCULO
 * (criar a aula que falta), não-null = violação de ORDEM (reescrever ou
 * reordenar).
 */
export const ApontamentoSchema = z.object({
  id: z.string().min(1),
  rodada: z.number().int().nonnegative(),
  artefato: z.string().min(1),
  alvo: z.object({
    caminho: z.string().min(1),
    linha: z.number().int().positive(),
    span: SpanSchema,
    no_ast: z.string().min(1),
    token: z.string().min(1),
  }),
  // INV-04: toda a evidência vem ANTES dos campos de julgamento.
  evidencia: z.object({
    tipo: z.enum(['orcamento', 'execucao', 'pin', 'estrutura']),
    prova: z.string().min(1),
    introduzido_em: z.union([z.string().min(1), z.null()]),
    reproduzivel_por: z.string().min(1),
  }),
  defeito: z.string().min(1),
  regra_violada: z.string().min(1),
  categoria: CategoriaSchema,
  severity: SeveritySchema,
  acao_sugerida: z.string().min(1),
  confianca: z.number().min(0).max(1),
});

/**
 * A saída do revisor por rodada. `apontamentos` tem teto de 12 (R8: trunca
 * por severidade — a triagem é etapa separada, §6.5). Sem campo de código
 * (P4) e sem veredito agregado: a aprovação nunca é condição de parada do
 * laço (§6.6).
 */
export const FindingsSchema = z.object({
  artefato: z.string().min(1),
  hash_artefato: z.string().min(1),
  rodada: z.number().int().nonnegative(),
  apontamentos: z.array(ApontamentoSchema).max(12),
  resumo: z.string().min(1),
});

// ---------------------------------------------------------------------------
// F11 — ações do PLANEJADOR (catálogo fechado)
// ---------------------------------------------------------------------------

/**
 * O catálogo FECHADO de ações do planejador (§6.7). Com ele "zero
 * apontamentos" existe: apontamento que não mapeia para nenhuma ação é
 * devolvido como defeito DO CATÁLOGO, nunca convertido em ação improvisada
 * (§7.3).
 */
export const ACAO_CATALOGO = [
  'SPLIT_NODE',
  'MERGE_NODES',
  'INSERT_INTERMEDIATE',
  'DECLARE_INTEGRATIVE',
  'ADD_EDGE',
  'REMOVE_EDGE',
  'BREAK_CYCLE_WITH_STUB',
  'BREAK_CYCLE_WITH_MINIMAL_INTRO',
  'DEFER_COMPLEXITY',
  'MARK_WIP',
  'MOVE_CONCEPT_TO_ENTRY_BUDGET',
  'REWRITE_IN_BUDGET',
  'ADD_TEST',
  'SPLIT_LESSON',
] as const;

/**
 * O planta de correção (F11). Toda ação nomeia arquivo, span e resultado
 * esperado (§7.3). INV-04 aqui é a regra no seu caso mais direto: `acao`
 * (decisão, do catálogo fechado) vem DEPOIS de `motivo` (justificativa).
 */
export const ActionsSchema = z.object({
  acoes: z.array(
    z.object({
      /** ações ORDENADAS (§7.3) — a ordem de aplicação. */
      posicao: z.number().int().nonnegative(),
      apontamento_id: z.string().min(1),
      alvo: z.object({ arquivo: z.string().min(1), span: SpanSchema }),
      motivo: z.string().min(1),
      acao: z.enum([...ACAO_CATALOGO]),
      resultado_esperado: z.string().min(1),
    }),
  ),
});

// ---------------------------------------------------------------------------
// F12 — report.json (o placar)
// ---------------------------------------------------------------------------

/**
 * O placar final (`report.json`, §9.2 e §9.4). Formato do repositório:
 * "N passou · N falhou · N pendente"; toda limitação (sem chave, sem rede,
 * checagem não executada) é DECLARADA em `limitacoes`, nunca omitida; e
 * nenhum número aparece sem o comando que o reproduz (`comando`).
 * `violacoes_orcamento` segue o formato da violação de §5.5
 * (`trechoOfensor`, `primeiraAulaQueEnsina` null = lacuna de currículo).
 * `veredito` (decisão) vem depois de `justificativa` (INV-04).
 */
export const ReportSchema = z.object({
  trilha: z.string().min(1),
  comando: z.string().min(1),
  gerado_em: z.string().min(1),
  placar: z.object({
    passou: z.number().int().nonnegative(),
    falhou: z.number().int().nonnegative(),
    pendente: z.number().int().nonnegative(),
  }),
  violacoes_orcamento: z.array(
    z.object({
      arquivo: z.string().min(1),
      campo: z.string().min(1),
      linha: z.number().int().positive(),
      coluna: z.number().int().positive(),
      eixo: z.union([z.string().min(1), z.null()]),
      construcao: z.union([z.string().min(1), z.null()]),
      faixa: z.union([FaixaSchema, z.null()]),
      trechoOfensor: z.string().min(1),
      primeiraAulaQueEnsina: z.union([z.string().min(1), z.null()]),
      mensagem: z.string().min(1),
    }),
  ),
  desafios_que_falham: z.array(
    z.object({
      desafio: z.string().min(1),
      prova: z.enum(['solucao_passa', 'starter_falha', 'contagem_testes', 'stub_vazio_falha']),
      motivo: z.string().min(1),
    }),
  ),
  cobertura: z.object({
    conceitos_sem_aula_dona: z.array(z.string()),
    aulas_sem_desafio: z.array(z.string()),
  }),
  distribuicao_construcoes_novas: z.array(
    z.object({ aula: z.string().min(1), quantidade: z.number().int().nonnegative() }),
  ),
  similaridade_exemplo_solucao: z.array(
    z.object({ aula: z.string().min(1), similaridade: z.number().min(0).max(1) }),
  ),
  taxa_falso_passe_revisor: z.object({
    amostras: z.number().int().nonnegative(),
    frente_a_mutantes: z.number().int().nonnegative(),
    taxa: z.number().min(0).max(1),
  }),
  tokens_por_fase: z.array(z.object({ fase: z.string().min(1), tokens: z.number().int().nonnegative() })),
  limitacoes: z.array(z.string()),
  justificativa: z.string().min(1),
  veredito: z.enum(['aprovado', 'reprovado']),
});

// ---------------------------------------------------------------------------
// O REGISTRO — a ÚNICA lista de schemas da engine (A-P04-2)
// ---------------------------------------------------------------------------

/** Um schema registrado: o nome do artefato + o objeto zod REAL. */
export interface SchemaRegistrado {
  nome: string;
  schema: z.ZodTypeAny;
}

/**
 * Todos os schemas dos artefatos da engine. O lint de ordem
 * (`fieldOrder.ts`) e a varredura de campos opcionais percorrem ESTA lista —
 * nunca uma lista curada derivada. Registre aqui todo schema novo
 * (ver "Para o próximo agente" no handoff da onda P-04).
 *
 * P-33 (modo generate): os DOIS schemas de SAÍDA do autor —
 * `AuthorOutputSchema` (prompts/author.ts) e `DesafioAuthorOutputSchema`
 * (phases/f8Challenges.ts) — entram no registro. Estático não dá: um
 * `import` de topo aqui criaria um CICLO de módulos (artifacts →
 * f8Challenges → artifacts — o f8Challenges importa `ChallengeDraftSchema`
 * DESTE arquivo) que quebra no boot sob tsx/CommonJS (exports viravam lazy
 * getters com TDZ). A resolução é POSTERGADA via `z.lazy` + `require`
 * tardio: o lint só acessa `schema` quando varre o registro, e nesse ponto
 * todos os módulos já foram carregados. O teste `engineSchemas.test.ts`
 * fixa os 14 nomes e o lint roda sobre os schemas REAIS (o getter é
 * exercitado pela varredura).
 */
export const SCHEMA_REGISTRY: SchemaRegistrado[] = [
  { nome: 'brief', schema: BriefSchema },
  { nome: 'notional-machine', schema: NotionalMachineSchema },
  { nome: 'concepts', schema: ConceptsSchema },
  { nome: 'graph', schema: GraphSchema },
  { nome: 'order', schema: OrderSchema },
  { nome: 'budget', schema: BudgetSchema },
  { nome: 'freeze', schema: FreezeSchema },
  { nome: 'lesson-draft', schema: LessonDraftSchema },
  { nome: 'challenge-draft', schema: ChallengeDraftSchema },
  { nome: 'findings', schema: FindingsSchema },
  { nome: 'actions', schema: ActionsSchema },
  { nome: 'report', schema: ReportSchema },
  // P-33 — saídas do AUTOR (raciocínio no índice 0; sem ciclo de import).
  { nome: 'author-output', schema: z.lazy(() => carregarSchemaLazy('../prompts/author', 'AuthorOutputSchema')) },
  {
    nome: 'desafio-author-output',
    schema: z.lazy(() => carregarSchemaLazy('../phases/f8Challenges', 'DesafioAuthorOutputSchema')),
  },
];

/**
 * Carrega UM schema exportado de OUTRO módulo da engine de forma POSTERGADA
 * (P-33). `require` relativo a ESTE arquivo; a leitura só acontece quando o
 * chamador acessa o schema — nunca durante a avaliação de `SCHEMA_REGISTRY`.
 * Usado com `z.lazy` para quebrar o ciclo artifacts → phases/prompts →
 * artifacts (ver comentário do registro).
 */
function carregarSchemaLazy(modulo: string, nomeDoExport: string): z.ZodTypeAny {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(modulo) as Record<string, unknown>;
  const schema = mod[nomeDoExport];
  if (!(schema instanceof z.ZodType)) {
    throw new Error(`registro lazy: ${modulo} não exporta um schema zod chamado "${nomeDoExport}"`);
  }
  return schema;
}

/** O nome de cada artefato esperado no registro (fixado por teste — A-P04-2). */
export const NOMES_DOS_ARTEFATOS: readonly string[] = SCHEMA_REGISTRY.map((s) => s.nome);