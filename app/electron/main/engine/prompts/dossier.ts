/**
 * app/electron/main/engine/prompts/dossier.ts — O DOSSIE DO AUTOR DE AULA
 * (pacote P-11, onda 1 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §7.1.
 *
 * O dossiê é a ENTRADA do autor de aula: o estado de conhecimento exato do
 * aluno, congelado no FREEZE (F5) e reproduzido LITERALMENTE no prompt
 * (`prompts/author.ts`). O §7.1 fixa os campos e a regra do spawn:
 *
 *   "o spawn é recusado se faltar qualquer um" (A-P11-2).
 *
 * `montarDossie` É o portão do spawn: dossiê incompleto LANÇA
 * `ErroDossieIncompleto` nomeando o campo faltante — a recusa é estruturada,
 * nunca silenciosa, e o autor nunca chega a ser chamado.
 *
 * Os orçamentos (`budget_produtivo`, `budget_receptivo`, `budget_teste`) são
 * LISTAS LITERAIS E COMPLETAS — "nunca resumo nem trecho truncado" (§7.1,
 * A-P11-2b). O prompt as reproduz integralmente, item a item.
 *
 * Nota de contagem (premissa declarada): o §7.1 diz "12 campos" e enumera 13
 * itens — os 12 + "e os desafios já escritos". Implementamos TODOS os 13 como
 * campos obrigatórios (fail-closed): faltar qualquer um recusa o spawn,
 * incluindo os desafios. `CAMPOS_DO_DOSSIE` é a lista canônica, na ordem em
 * que a recusa corre.
 *
 * `desafios_ja_escritos` são os desafios (F8) já escritos para esta aula: o
 * autor escreve a aula de modo que a teoria ensine o que o desafio cobra
 * (§5.2, I5/I6). Reusa o `ChallengeDraftSchema` do pacote P-04 — zero schema
 * novo, zero dependência nova.
 */

import { z } from 'zod';
import { ChallengeDraftSchema } from '../schemas/artifacts';

// ---------------------------------------------------------------------------
// Tipos e schemas dos campos
// ---------------------------------------------------------------------------

/**
 * Os cinco tipos de conhecimento (§7.1 R4). Mesmo enum do `eiClass` do draft
 * de aula (P-04) — a correspondência é literal: o dossiê declara a classe e o
 * draft a repete.
 */
export const EI_CLASS_VALUES = ['fato', 'categoria', 'regra', 'principio', 'integrativo'] as const;
export type EiClass = (typeof EI_CLASS_VALUES)[number];

/** Objetivo da aula: um verbo, um objeto, contexto e critério (§7.1). */
export const ObjetivoDossieSchema = z.object({
  verbo: z.string().min(1),
  objeto: z.string().min(1),
  contexto: z.string().min(1),
  criterio: z.string().min(1),
});
export type ObjetivoDossie = z.infer<typeof ObjetivoDossieSchema>;

/** Item do fora_de_escopo — o motivo é OBRIGATÓRIO por item (§7.1, A-P11-2). */
export const ItemForaDeEscopoSchema = z.object({
  item: z.string().min(1),
  motivo: z.string().min(1),
});
export type ItemForaDeEscopo = z.infer<typeof ItemForaDeEscopoSchema>;

/** Concepção a refutar — ancorada na spec (ECMA-262/MDN), mesmo contrato do F2. */
export const ConcepcaoARefutarSchema = z.object({
  concepcao: z.string().min(1),
  ancora_na_spec: z.string().min(1),
});
export type ConcepcaoARefutar = z.infer<typeof ConcepcaoARefutarSchema>;

// ---------------------------------------------------------------------------
// O dossiê — os campos do §7.1, todos obrigatórios (INV-05: ausência válida é
// valor vazio EXPLÍCITO — arrays podem ser vazios, nunca opcionais).
// ---------------------------------------------------------------------------

export const DossierSchema = z.object({
  /** um verbo, um objeto, contexto, critério (§7.1). */
  objetivo: ObjetivoDossieSchema,
  /** `introduces.productive` — no máximo 2 itens (§7.1, I2). */
  introduces_productive: z.array(z.string()).max(2),
  /** lista LITERAL E COMPLETA do que se pode exigir que o aluno ESCREVA. */
  budget_produtivo: z.array(z.string()),
  /** lista LITERAL E COMPLETA do que se pode pedir que o aluno LEIA. */
  budget_receptivo: z.array(z.string()),
  /** lista LITERAL E COMPLETA do que o testesCode do desafio pode usar. */
  budget_teste: z.array(z.string()),
  /** tipo do componente de conhecimento da construção-alvo (ex.: `decl:let`). */
  kc_type: z.string().min(1),
  ei_class: z.enum(EI_CLASS_VALUES),
  /** subgoal labels que o worked example DEVE usar (§7.1 R7). */
  subgoals: z.array(z.string()),
  /** termos JÁ definidos em aulas anteriores — reutilizar, nunca redefinir. */
  terms: z.array(z.string()),
  /** como esta aula estende a máquina nocional (D3/§7.1). */
  notional_machine_delta: z.string().min(1),
  /** o que está FORA do escopo desta aula, com o motivo de cada item. */
  fora_de_escopo: z.array(ItemForaDeEscopoSchema),
  /** concepções a refutar EXPLICITAMENTE (§7.1 R9), com âncora na spec. */
  misconceptions_a_refutar: z.array(ConcepcaoARefutarSchema),
  /** os desafios (F8) já escritos para esta aula (I5/I6). */
  desafios_ja_escritos: z.array(ChallengeDraftSchema),
});
export type Dossier = z.infer<typeof DossierSchema>;

/** Um desafio já escrito, no schema do pacote P-04. */
export type DesafioJaEscrito = z.infer<typeof ChallengeDraftSchema>;

/**
 * A lista canônica dos campos do dossiê, NA ORDEM da enumeração do §7.1.
 * É a fonte da verificação de completude de `montarDossie` e a lista que o
 * teste fixa por nome (esquecer um campo quebra o teste, A-P11-2).
 */
export const CAMPOS_DO_DOSSIE: readonly string[] = [
  'objetivo',
  'introduces_productive',
  'budget_produtivo',
  'budget_receptivo',
  'budget_teste',
  'kc_type',
  'ei_class',
  'subgoals',
  'terms',
  'notional_machine_delta',
  'fora_de_escopo',
  'misconceptions_a_refutar',
  'desafios_ja_escritos',
];

// ---------------------------------------------------------------------------
// A recusa estruturada do spawn (A-P11-2)
// ---------------------------------------------------------------------------

/**
 * A recusa do spawn por dossiê incompleto — ESTRUTURADA: `campoFaltante`
 * nomeia exatamente o campo ausente (ou o primeiro campo com valor inválido),
 * e `mensagem` explica. Nunca um erro genérico "dossiê inválido".
 */
export class ErroDossieIncompleto extends Error {
  /** o campo ausente/inválido, ou `null` quando a entrada nem é objeto. */
  readonly campoFaltante: string | null;

  constructor(campoFaltante: string | null, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDossieIncompleto';
    this.campoFaltante = campoFaltante;
  }
}

/**
 * O PORTÃO do spawn do autor (A-P11-2): valida o dossiê completo e RECUSA
 * com `ErroDossieIncompleto` nomeando o campo quando qualquer um dos 13
 * campos obrigatórios falta. Depois da checagem de presença, valida TIPOS via
 * `DossierSchema` (fail-closed: presente mas com o tipo errado também recusa,
 * nomeando o campo).
 *
 * Função pura, sem IO e sem efeitos: mesmo dossiê → mesmo resultado.
 */
export function montarDossie(entrada: unknown): Dossier {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new ErroDossieIncompleto(null, 'entrada do dossiê não é um objeto — o spawn do autor é recusado (docs §7.1, A-P11-2)');
  }
  const bruto = entrada as Record<string, unknown>;

  // 1) PRESENÇA — na ordem canônica; o PRIMEIRO campo faltante é nomeado.
  for (const campo of CAMPOS_DO_DOSSIE) {
    if (!(campo in bruto) || bruto[campo] === undefined) {
      throw new ErroDossieIncompleto(
        campo,
        `dossiê incompleto: campo "${campo}" ausente — o spawn do autor de aula é recusado (docs §7.1, A-P11-2)`,
      );
    }
  }

  // 2) TIPO — valor presente mas com a forma errada também recusa (fail-closed).
  const parseado = DossierSchema.safeParse(bruto);
  if (!parseado.success) {
    const primeiro = parseado.error.issues[0];
    const campo = primeiro !== undefined && primeiro.path.length > 0 ? String(primeiro.path[0]) : '(raiz)';
    throw new ErroDossieIncompleto(
      campo,
      `dossiê inválido no campo "${campo}": ${primeiro?.message ?? 'valor fora do contrato'} — o spawn do autor de aula é recusado (docs §7.1, A-P11-2)`,
    );
  }
  return parseado.data;
}