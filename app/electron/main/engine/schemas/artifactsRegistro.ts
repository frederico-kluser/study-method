/**
 * app/electron/main/engine/schemas/artifactsRegistro.ts — O REGISTRO dos
 * schemas da engine (A-P04-2): a ÚNICA lista que o lint de ordem
 * (`fieldOrder.ts`) e a varredura de campos opcionais percorrem — nunca uma
 * lista curada derivada.
 *
 * EXTRAÍDO de `schemas/artifacts.ts` na refatoração L06. O caminho PÚBLICO
 * continua `schemas/artifacts.ts` (fachada fina).
 *
 * P-33 (modo generate): os DOIS schemas de SAÍDA do autor —
 * `AuthorOutputSchema` (prompts/author.ts) e `DesafioAuthorOutputSchema`
 * (phases/f8Challenges.ts) — entram no registro. Estático não dá: um
 * `import` de topo aqui criaria um CICLO de módulos (artifacts →
 * f8Challenges → artifacts — o f8Challenges importa `ChallengeDraftSchema`
 * do pacote) que quebra no boot sob tsx/CommonJS (exports viravam lazy
 * getters com TDZ). A resolução é POSTERGADA via `z.lazy` + `require`
 * tardio: o lint só acessa `schema` quando varre o registro, e nesse ponto
 * todos os módulos já foram carregados. O teste `engineSchemas.test.ts`
 * fixa os 14 nomes e o lint roda sobre os schemas REAIS (o getter é
 * exercitado pela varredura).
 *
 * NOTA L06: os caminhos do `require` tardio continuam RELATIVOS a ESTE
 * arquivo (mesma profundidade do antigo `schemas/artifacts.ts`) —
 * byte-idênticos.
 */

import { z } from 'zod';

import {
  ActionsSchema,
  FindingsSchema,
  ReportSchema,
} from './artifactsReview';
import {
  BudgetSchema,
  BriefSchema,
  ConceptsSchema,
  GraphSchema,
  NotionalMachineSchema,
  OrderSchema,
} from './artifactsBase';
import {
  ChallengeDraftSchema,
  FreezeSchema,
  LessonDraftSchema,
} from './artifactsDrafts';

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
