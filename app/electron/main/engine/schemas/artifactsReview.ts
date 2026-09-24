/**
 * app/electron/main/engine/schemas/artifactsReview.ts — SCHEMAS ZOD DOS
 * ARTEFATOS DE REVISÃO/PLANEJAMENTO/RELATÓRIO da engine: F10/F11 (achados do
 * revisor, ações do planejador) e F12 (report.json).
 *
 * EXTRAÍDO de `schemas/artifacts.ts` na refatoração L06 (arquivo ≤500 linhas;
 * comportamento observável preservado). O caminho PÚBLICO continua
 * `schemas/artifacts.ts` (fachada fina).
 *
 * Regras da casa (docs §6.3 e §7): INV-04 (justificativa/evidência ANTES de
 * decisão/julgamento) e P4 (o schema de saída do revisor NÃO tem campo de
 * código — se o campo existir, o modelo usa).
 */

import { z } from 'zod';

import { FaixaSchema, SpanSchema } from './artifactsBase';

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
