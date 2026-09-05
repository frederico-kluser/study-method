/**
 * app/electron/main/engine/phases/f8Challenges.ts — F8 · AUTORIA DE DESAFIOS
 * E TESTES (pacote P-17, plano de execução v1 — `docs/16-engine-de-trilha.md`
 * §4.3, §4.1, §5.4, §6.1 e §7).
 *
 * A F8 é o passo 3 da ORDEM INTERNA DE UMA AULA (§4.3): objetivo (dossiê) →
 * esqueleto de teoria (F7) → **desafio e testes** → fechamento da teoria (F7).
 * O desafio vem ANTES do fechamento da teoria porque os itens de avaliação
 * vêm antes dos materiais (Dick & Carey, Biggs, backward design).
 *
 * O QUE ESTE ARQUIVO É:
 *   - A VARIANTE DE DESAFIO da maquinaria do autor de aula (P-11): o mesmo
 *     esqueleto do prompt central — papel, orçamentos LITERAIS E COMPLETOS,
 *     saída com `raciocinio_de_projeto` PRIMEIRO (INV-04), saída de
 *     emergência `blocked` (§7.1 R3), teto de 2.000 tokens (§7) e checksum de
 *     cauda — mas com o DOSSIE DE DESAFIO no lugar do dossiê de aula.
 *     `prompts/author.ts` está CONGELADO (leitura ok, escrita proibida): a
 *     variante mora AQUI, reusando tudo o que pode ser importado
 *     (MAX_TOKENS_SAIDA_AUTOR, rejeitarAcimaDoTeto, isBlocked,
 *     RespostaBlockedSchema) e reconstruindo só o que é específico do desafio
 *     (`DesafioAuthorOutputSchema`, `gerarPromptAutorDeDesafio`).
 *   - O DOSSIE DE DESAFIO (montado com o resumo da teoria + anti-repetição):
 *     o autor de desafio recebe, ALÉM do orçamento, o resumo GERADO da teoria
 *     efetivamente escrita (`resumo_da_teoria` — §4.3: "a lista de construções
 *     diz o que é permitido, o resumo diz como aquilo foi apresentado") e a
 *     lista de ANTI-REPETIÇÃO: títulos e requisitos dos desafios anteriores da
 *     MESMA trilha (o dossiê declara o que já foi cobrado; o autor varia o
 *     cenário em vez de repetir o enunciado).
 *   - A VALIDAÇÃO DETERMINÍSTICA DO DRAFT, na AUTORIA, antes de existir
 *     revisão (§6.1: "os drafts nascem validados"): (a) schema — o ARTEFATO
 *     parseia pelo `DesafioAuthorOutputSchema` (que TEM como base o
 *     ChallengeDraftSchema); (b) as QUATRO PROVAS de execução (§5.4) via
 *     `ProverDeDesafio`; (c) orçamento POR FAIXAS (§3.3) — CADA superfície é
 *     validada contra a FAIXA PRÓPRIA do orçamento do snapshot: `testsCode ⊆
 *     budget_teste` (A3 — o aluno lê o teste ANTES da aula), `starterCode ⊆
 *     budget_receptivo` (A1), `solutionCode ⊆ budget_produtivo` (A2) + A6 (a
 *     solução exige ≥1 construção do `introduces.productive` — a direção
 *     puxada), sempre errando NOMEANDO a construção.
 *
 * CONTRATO DO PROVADOR (P-31, `phases/f9Verifier.ts` — mergeia ANTES deste
 * pacote): `criarProverDeDesafio({exec?, baseDir?, limiter?})` devolve uma
 * função `(input: ChallengeProofsInput) => Promise<ChallengeProofsVerdict>` —
 * exatamente o tipo `ProverDeDesafio` deste arquivo. Os DOIS tipos extremos
 * (`ChallengeProofsInput`/`ChallengeProofsVerdict`) são os de
 * `../exec/proofs.ts` (onda 0), o MESMO contrato que o P-31 importa.
 * ENQUANTO `phases/f9Verifier.ts` não existir no checkout, o import do P-31
 * fica DEIXADO PRONTO: quem costura a produção chama
 * `criarProverDeDesafio(...)` (P-31) e injeta o resultado em
 * `DepsDoDesafio.prover` — ver o handoff do P-17 para o mapeamento exato.
 *
 * Dependência: f8Challenges NÃO importa de f7Theory (a F7 importa daqui o
 * fluxo do desafio e os tipos compartilhados). Importa, sim,
 * `separarJsonECauda` de `modes/curriculumGap` — que por sua vez importa
 * `blocosDeCodigoDaTeoria` da F7: o grafo de módulos fecha um CICLO
 * (f8 → curriculumGap → f7 → f8). É deliberado e seguro: o separador é a
 * ÚNICA implementação do repositório (reimplementá-lo aqui seria a terceira
 * cópia da mesma regra), e nenhum dos três módulos usa o binding do outro em
 * tempo de AVALIAÇÃO — só dentro de funções, depois que todos carregaram.
 *
 * O CHECKSUM DE CAUDA (§7.1 R18, A-P11-5): `gerarPromptAutorDeDesafio`, como o
 * prompt canônico do autor de aula, TERMINA mandando o modelo repetir a lista
 * de construções permitidas DEPOIS do JSON — `JSON.parse` do conteúdo inteiro
 * quebraria contra todo modelo obediente. A leitura usa `separarJsonECauda`, e
 * a cauda é CONFERIDA (`compararChecksum` sobre `construcoesPermitidasDoDesafio`
 * — a MESMA lista que o prompt mandou repetir) e REPORTADA no envelope do
 * resultado, nunca bloqueante: o gate duro do desafio são as QUATRO PROVAS e o
 * orçamento POR FAIXAS, que leem o código executado em vez do eco do modelo.
 */

import { z } from 'zod';

import type { EngineLlm, LlmCallRequest } from '../runtime/callLlm';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../exec/proofs';
import type { RateLimiter, RateLimiters } from '../runtime/scheduler';
import { ChallengeDraftSchema } from '../schemas/artifacts';
import { formatarErroCampos } from '../schemas/fieldOrder';
import { extractAtoms } from '../extract';
import { separarJsonECauda } from '../modes/curriculumGap';
import {
  MAX_TOKENS_SAIDA_AUTOR,
  compararChecksum,
  isBlocked,
  rejeitarAcimaDoTeto,
  type RespostaBlocked,
  type ResultadoChecksum,
} from '../prompts/author';
import { EI_CLASS_VALUES, type Dossier, type EiClass, type ObjetivoDossie } from '../prompts/dossier';
import type { SnapshotAula } from './f5Freeze';

// ---------------------------------------------------------------------------
// A chamada LLM do desafio — teto e timeout EXPLÍCITOS por chamada (§7, item 5)
// ---------------------------------------------------------------------------

/** Etapa da chamada LLM do autor de desafio (identidade de telemetria/cache). */
export const ETAPA_DESAFIO = 'f8-desafio';

/** stageVersion — identidade de artefato no cache do transporte (bump = invalida). */
export const STAGE_VERSION_DESAFIO = 'f8-desafio-v1';

/** Teto de saída da chamada (o MESMO teto do autor de aula, §7). */
export const MAX_TOKENS_DESAFIO = MAX_TOKENS_SAIDA_AUTOR;

/** Timeout declarado por chamada — uma etapa travada nunca segura a onda. */
export const TIMEOUT_DESAFIO_MS = 120_000;

// ---------------------------------------------------------------------------
// Erro estruturado da AUTORIA (compartilhado com a F7 — fail-closed, INV-03)
// ---------------------------------------------------------------------------

export type AutoriaErrorCode =
  | 'SAIDA_NAO_JSON' // a saída da LLM não é JSON válido
  | 'SCHEMA_INVALIDO' // parseia, mas viola o schema de saída do autor
  | 'ACIMA_DO_TETO' // estimativa > 2000 tokens — REJEITADO, nunca truncado
  | 'CODIGO_NAO_PARSEIA' // superfície de código do draft não parseia (extractor)
  | 'CONSTRUCAO_FORA_DO_ORCAMENTO' // extractAtoms(superfície) ⊄ faixa PRÓPRIA dela (§3.3)
  | 'SOLUCAO_SEM_PRODUCAO' // A6: atomos(solutionCode) ∩ introduces.productive = ∅ — a direção puxada
  | 'PROVA_DO_DESAFIO_FALHOU'; // uma das QUATRO provas de execução (§5.4) falhou

/**
 * Erro ESTRUTURADO de qualquer etapa da autoria (F7/F8). `code` nomeia o
 * defeito, `aula_slug` a aula, `etapa` a chamada de autoria e `construcao` a
 * construção ofensora quando o defeito é de orçamento (§5.5: a violação
 * nomeia a construção e o trecho). Nunca um erro de texto solto.
 */
export class AutorError extends Error {
  readonly code: AutoriaErrorCode;
  readonly aula_slug: string;
  readonly etapa?: string;
  /** a construção fora do orçamento (CONSTRUCAO_FORA_DO_ORCAMENTO). */
  readonly construcao?: string;
  readonly detalhes?: Readonly<Record<string, unknown>>;

  constructor(
    code: AutoriaErrorCode,
    mensagem: string,
    aula_slug: string,
    opts: { etapa?: string; construcao?: string; detalhes?: Readonly<Record<string, unknown>> } = {},
  ) {
    super(mensagem);
    this.name = 'AutorError';
    this.code = code;
    this.aula_slug = aula_slug;
    if (opts.etapa !== undefined) this.etapa = opts.etapa;
    if (opts.construcao !== undefined) this.construcao = opts.construcao;
    if (opts.detalhes !== undefined) this.detalhes = opts.detalhes;
  }
}

// ---------------------------------------------------------------------------
// O contrato do provador (P-31) e as dependências da autoria do desafio
// ---------------------------------------------------------------------------

/**
 * O provador de desafios — a assinatura EXATA que
 * `criarProverDeDesafio({exec?, baseDir?, limiter?})` (P-31,
 * `phases/f9Verifier.ts`) devolve. Recebe os QUATRO campos do desafio v1
 * (single-file: `solutionCode`/`starterCode`/`testsCode`/`expectedTestCount`
 * — multi-arquivo é extensão futura, ver o RE-PLAN) e devolve o veredito das
 * QUATRO provas de §5.4, fail-closed (`valid: true` somente com as quatro
 * passando).
 */
export type ProverDeDesafio = (input: ChallengeProofsInput) => Promise<ChallengeProofsVerdict>;

/** Dependências da autoria de UM desafio (a F7 injeta as mesmas). */
export interface DepsDoDesafio {
  /** Transporte único de LLM (fake nos testes — sem rede, sem chave). */
  llm: EngineLlm;
  /** Provador das QUATRO provas (P-31; fake nos testes registrando chamadas). */
  prover: ProverDeDesafio;
  /**
   * Scheduler opcional — quando presente, o limite do pool `exec` É APLICADO
   * em volta da chamada do prover (spawns de processo respeitam o pool do
   * escalonador). P-27: pools SEPARADOS — o limiter aqui é o do scheduler,
   * NUNCA o mesmo objeto do SEM_LLM do transporte, e as tarefas da onda nunca
   * seguram o pool `exec` (são recurso `llm`), logo não há deadlock.
   */
  scheduler?: { limiters?: RateLimiters };
}

// ---------------------------------------------------------------------------
// Anti-repetição — os desafios anteriores da MESMA trilha
// ---------------------------------------------------------------------------

/**
 * Um desafio ANTERIOR da MESMA trilha, para ANTI-REPETIÇÃO: o autor recebe
 * tí­tulos e requisitos do que JÁ foi cobrado e varia o cenário — nunca repete
 * o enunciado nem os requisitos (docs §4.3: lista no dossiê/contexto).
 */
export interface DesafioAnteriorDaTrilha {
  slug: string;
  titulo: string;
  requisitos: string[];
}

// ---------------------------------------------------------------------------
// O dossiê DE DESAFIO — montado com o resumo da teoria + anti-repetição
// ---------------------------------------------------------------------------

/** O dossiê do autor de desafio (montado na F8, nunca recebido por fora). */
export interface DossieDeDesafio {
  aula_slug: string;
  /** objetivo da AULA (herdado do dossiê de aula — §7.1). */
  objetivo: ObjetivoDossie;
  kc_type: string;
  ei_class: EiClass;
  /** listas LITERAIS E COMPLETAS — nunca resumo nem trecho truncado (§7.1). */
  budget_produtivo: string[];
  budget_receptivo: string[];
  budget_teste: string[];
  subgoals: string[];
  terms: string[];
  /** O resumo GERADO da teoria efetivamente escrita — §4.3 (produzido pela F7). */
  resumo_da_teoria: string;
  /** ANTI-REPETIÇÃO: títulos e requisitos dos desafios anteriores da mesma trilha. */
  desafios_anteriores: DesafioAnteriorDaTrilha[];
}

/** Campos do dossiê de desafio, NA ORDEM em que a recusa do spawn corre. */
const CAMPOS_DO_DOSSIE_DE_DESAFIO: readonly string[] = [
  'aula_slug',
  'objetivo',
  'kc_type',
  'ei_class',
  'budget_produtivo',
  'budget_receptivo',
  'budget_teste',
  'subgoals',
  'terms',
  'resumo_da_teoria',
  'desafios_anteriores',
];

export const DossieDeDesafioSchema = z.object({
  aula_slug: z.string().min(1),
  objetivo: z.object({ verbo: z.string().min(1), objeto: z.string().min(1), contexto: z.string().min(1), criterio: z.string().min(1) }),
  kc_type: z.string().min(1),
  ei_class: z.enum(EI_CLASS_VALUES),
  budget_produtivo: z.array(z.string()),
  budget_receptivo: z.array(z.string()),
  budget_teste: z.array(z.string()),
  subgoals: z.array(z.string()),
  terms: z.array(z.string()),
  resumo_da_teoria: z.string().min(1),
  desafios_anteriores: z.array(
    z.object({ slug: z.string().min(1), titulo: z.string().min(1), requisitos: z.array(z.string()) }),
  ),
});

/** Recusa estruturada do spawn do autor de DESAFIO (mesmo espírito do A-P11-2). */
export class ErroDossieDeDesafioIncompleto extends Error {
  readonly campoFaltante: string | null;
  constructor(campoFaltante: string | null, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDossieDeDesafioIncompleto';
    this.campoFaltante = campoFaltante;
  }
}

/**
 * O PORTÃO do spawn do autor de desafio (função PURA): valida presença (em
 * `CAMPOS_DO_DOSSIE_DE_DESAFIO`) e TIPO (`DossieDeDesafioSchema`), recusando
 * com erro estruturado que nomeia o campo — a autor não chega a ser chamado
 * com um dossiê pela metade (A-P11-2, aplicado à variante de desafio).
 */
export function montarDossieDeDesafio(entrada: unknown): DossieDeDesafio {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new ErroDossieDeDesafioIncompleto(
      null,
      'entrada do dossiê de desafio não é um objeto — o spawn do autor de desafio é recusado (docs §7.1, A-P11-2)',
    );
  }
  const bruto = entrada as Record<string, unknown>;
  for (const campo of CAMPOS_DO_DOSSIE_DE_DESAFIO) {
    if (!(campo in bruto) || bruto[campo] === undefined) {
      throw new ErroDossieDeDesafioIncompleto(
        campo,
        `dossiê de desafio incompleto: campo "${campo}" ausente — o spawn do autor de desafio é recusado (docs §7.1, A-P11-2)`,
      );
    }
  }
  const parseado = DossieDeDesafioSchema.safeParse(bruto);
  if (!parseado.success) {
    const primeiro = parseado.error.issues[0];
    const campo = primeiro !== undefined && primeiro.path.length > 0 ? String(primeiro.path[0]) : '(raiz)';
    throw new ErroDossieDeDesafioIncompleto(
      campo,
      `dossiê de desafio inválido no campo "${campo}": ${primeiro?.message ?? 'valor fora do contrato'} — o spawn do autor de desafio é recusado (docs §7.1, A-P11-2)`,
    );
  }
  return parseado.data;
}

// ---------------------------------------------------------------------------
// Schema de saída do autor de DESAFIO — raciocínio ANTES de decisão (INV-04)
// ---------------------------------------------------------------------------

/**
 * A saída do autor de desafio: `ChallengeDraftSchema` (P-04 — o schema do
 * ARTEFATO, a base) estendido com `raciocinio_de_projeto` PRIMEIRO — o MESMO
 * padrão do `AuthorOutputSchema` do P-11 (o zod `.extend()` só anexa;
 * reconstruímos o object zod com o shape do draft preservado e o raciocínio
 * no índice 0). NÃO é registrado em `SCHEMA_REGISTRY` (o registro é casa do
 * P-04 — `schemas/artifacts.ts` está congelado); o lint de ordem roda sobre
 * ele no teste do pacote.
 */
export const DesafioAuthorOutputSchema = z.object({
  raciocinio_de_projeto: z.string().min(1),
  ...ChallengeDraftSchema.shape,
});
export type SaidaDesafio = z.infer<typeof DesafioAuthorOutputSchema>;

// ---------------------------------------------------------------------------
// O prompt do autor de desafio (função PURA do dossiê — A-P11-3, na variante)
// ---------------------------------------------------------------------------

/**
 * A lista de construções PERMITIDAS do desafio, PARA O PROMPT: a união dos
 * três orçamentos (o autor precisa conhecer o vocabulário inteiro para não
 * improvisar — a FAIXA de cada superfície é reforçada pela entrada literal
 * das três listas E pelo GATE determinístico de `ofensasDeOrcamentoDoDesafio`
 * (§3.3 — o prompt orienta, o gate banca o fail-closed).
 */
export function construcoesPermitidasDoDesafio(dossie: DossieDeDesafio): string[] {
  const uniao: string[] = [];
  for (const lista of [dossie.budget_receptivo, dossie.budget_produtivo, dossie.budget_teste]) {
    for (const item of lista) {
      if (!uniao.includes(item)) uniao.push(item);
    }
  }
  return uniao;
}

function renderItens(itens: readonly string[]): string {
  return itens.map((item) => `  - ${item}`).join('\n');
}

function renderObjetivo(dossie: DossieDeDesafio): string {
  const o = dossie.objetivo;
  return [
    `objetivo.verbo: ${o.verbo}`,
    `objetivo.objeto: ${o.objeto}`,
    `objetivo.contexto: ${o.contexto}`,
    `objetivo.criterio: ${o.criterio}`,
  ].join('\n');
}

function renderAntiRepeticao(dossie: DossieDeDesafio): string {
  if (dossie.desafios_anteriores.length === 0) {
    return '  (nenhum desafio anterior na trilha — este é o primeiro)';
  }
  return dossie.desafios_anteriores
    .map(
      (d) =>
        `  - desafio.slug: ${d.slug} — titulo: ${d.titulo}` +
        (d.requisitos.length > 0 ? `; requisitos: [${d.requisitos.join(', ')}]` : ''),
    )
    .join('\n');
}

/** O dossiê DE DESAFIO COMPLETO — literal e integral (nunca resumo). */
function renderDossieDeDesafio(dossie: DossieDeDesafio): string {
  const linhas: string[] = [];
  linhas.push(renderObjetivo(dossie));
  linhas.push('');
  linhas.push('resumo_da_teoria (o resumo GERADO da teoria efetivamente escrita — o desafio SÓ pode exigir o que a teoria apresentou):');
  linhas.push(dossie.resumo_da_teoria.split('\n').map((linha) => `  ${linha}`).join('\n'));
  linhas.push('');
  linhas.push('budget_produtivo (lista literal e completa, sem resumo, sem truncamento):');
  linhas.push(renderItens(dossie.budget_produtivo));
  linhas.push('');
  linhas.push('budget_receptivo (lista literal e completa, sem resumo, sem truncamento):');
  linhas.push(renderItens(dossie.budget_receptivo));
  linhas.push('');
  linhas.push('budget_teste (lista literal e completa, sem resumo, sem truncamento):');
  linhas.push(renderItens(dossie.budget_teste));
  linhas.push('');
  linhas.push(`kc_type: ${dossie.kc_type}`);
  linhas.push(`ei_class: ${dossie.ei_class}`);
  linhas.push('');
  linhas.push('subgoals (labels que o enunciado e o pré-teste DEVEM usar sem inventar rótulo novo):');
  linhas.push(renderItens(dossie.subgoals));
  linhas.push('');
  linhas.push('terms já definidos (reutilizar, nunca redefinir):');
  linhas.push(renderItens(dossie.terms));
  linhas.push('');
  linhas.push('ANTI-REPETICAO — desafios anteriores da MESMA trilha (não repita enunciado nem requisitos; varie o cenário):');
  linhas.push(renderAntiRepeticao(dossie));
  return linhas.join('\n');
}

const PAPEL_DO_AUTOR_DE_DESAFIO = [
  '=== PAPEL ===',
  'Você é o AUTOR DE DESAFIO da engine de trilhas. Escreve UM desafio com seus testes para UMA aula atômica. O desafio é o ITEM DE AVALIAÇÃO da aula: vem ANTES do fechamento da teoria (backward design), e precisa ser resolvível com o orçamento abaixo e EXIGIR exatamente o que a teoria apresenta.',
  '',
  '=== ESTADO DE CONHECIMENTO EXATO ===',
  'O dossiê abaixo é o estado de conhecimento exato do aluno neste ponto, congelado no FREEZE, MAIS o resumo da teoria efetivamente escrita (a lista de construções diz o que é PERMITIDO; o resumo diz COMO a teoria apresentou). Nenhuma construção fora das listas entra no enunciado, no starter, na solução ou nos testes.',
].join('\n');

const CONVENCOES_DO_DESAFIO = [
  '=== CONVENCOES (§7) ===',
  '- Raciocínio antes de decisão (INV-04): escreva a justificativa ANTES de qualquer campo de decisão do schema de saída.',
  '- Teto de saída: toda a sua resposta (draft ou blocked) cabe em 2000 tokens. O transporte não trunca: acima do teto a saída é REJEITADA pelo outro lado. Produza dentro do teto.',
  '- O controle de profundidade do raciocínio é parâmetro do sistema, não texto do prompt: não peça ao aluno raciocínio encenado em etapas.',
  '- Não improvise dentro da resposta: se o orçamento não permite o que o desafio pede, isso é defeito do grafo, não licença — responda blocked (seção SAÍDA) e pare.',
  '- Itens de avaliação vêm ANTES dos materiais (§4.3): o enunciado deve ser resolvível com o orçamento vigente e o starter deve dar ao aluno exatamente o que corrigir.',
].join('\n');

const SAIDA_DO_DESAFIO = [
  '=== SAIDA ===',
  'Duas formas de resposta, excludentes:',
  '',
  '1) DRAFT (o desafio inteiro) — um objeto JSON com EXATAMENTE estes campos, na ordem:',
  'raciocinio_de_projeto (a justificativa do desafio, escrita ANTES de qualquer decisão), slug, conceito, statement, starterCode, solutionCode, testsCode, expectedTestCount (inteiro positivo), outputChannel (retorno|impressao), requires[], notRequired[], subgoals[], scenarios[] (cada um com tipo exemplo|limite|erro|valido|invalido, derivado_de — a construção do orçamento que torna o cenário exigível — e descricao), taskSkill, supportLevel (com_andaime|sem_andaime), surfaceDomain, solutionAlternates[], wrongSolutions[] (cada solução errada falha em ≥1 teste), requirements[] (cada um com id, descricao e teste), justificativa, aprovado.',
  'Nenhum campo é opcional: ausência semanticamente válida é valor vazio EXPLÍCITO (array vazio).',
  '',
  '2) BLOCKED (emergência legítima e esperada quando o orçamento não permite o que o desafio pede) — um objeto JSON EXATO com estas chaves:',
  '{"blocked": true, "missing": ["<cada construção fora do orçamento>"], "motivo": "<por que o orçamento vigente não permite>"}',
  'blocked é resultado VÁLIDO da chamada, não falha; improvisar é que é defeito.',
].join('\n');

/** A cauda de checksum — o prompt TERMINA aqui (A-P11-5, na variante). */
function renderChecksumDeCaudaDoDesafio(dossie: DossieDeDesafio): string {
  return [
    '=== CHECKSUM DE CAUDA ===',
    'Ao final da sua resposta, repita a lista de construções permitidas, item a item, sem resumo e sem truncamento. A máquina confere a sua repetição contra esta lista e a divergência rejeita a saída. Repita mesmo quando a sua resposta for blocked, como seção final. A lista de construções permitidas é:',
    renderItens(construcoesPermitidasDoDesafio(dossie)),
  ].join('\n');
}

/**
 * O PROMPT do autor de DESAFIO — função PURA do dossiê de desafio (A-P11-3,
 * na variante): mesmo dossiê → mesmo texto byte a byte. Seções: papel/estado
 * → dossiê de desafio (objetivo, resumo da teoria, orçamentos literais,
 * anti-repetição) → convenções §7 → saída (draft com raciocínio primeiro, ou
 * blocked) → checksum de cauda.
 */
export function gerarPromptAutorDeDesafio(dossie: DossieDeDesafio): string {
  const partes = [
    PAPEL_DO_AUTOR_DE_DESAFIO,
    '=== DOSSIE DE DESAFIO (entrada congelada) ===',
    renderDossieDeDesafio(dossie),
    CONVENCOES_DO_DESAFIO,
    SAIDA_DO_DESAFIO,
    renderChecksumDeCaudaDoDesafio(dossie),
  ];
  return partes.join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// Validação determinística do draft NA AUTORIA (pré-revisão, §6.1)
// ---------------------------------------------------------------------------

/**
 * Mapeamento draft → provador (v1 single-file): o `ChallengeDraftSchema`
 * carrega `solutionCode`/`starterCode`/`testsCode` INLINE — o provador roda
 * numa MONTAGEM de arquivos derivados (solution.mjs + test.mjs etc. — a
 * `prepare` do ProofEnv faz isolamento; multi-arquivo é extensão futura).
 * Aqui o input das provas é literalmente os três campos do draft.
 */
export function montarInputDasProvas(draft: SaidaDesafio): ChallengeProofsInput {
  return {
    solutionCode: draft.solutionCode,
    starterCode: draft.starterCode,
    testsCode: draft.testsCode,
    expectedTestCount: draft.expectedTestCount,
  };
}

export interface OfensaDeOrcamento {
  construcao: string;
  snippet: string;
}

/** A FAIXA de orçamento (do dossiê da aula) que valida cada superfície (§3.3). */
type FaixaDaSuperficie = 'produtivo' | 'receptivo' | 'teste';

/**
 * As superfícies de código do desafio e a FAIXA PRÓPRIA de cada uma —
 * docs §3.3/§5.1: a assimetria das quatro superfícies é a regra mais fácil
 * de errar, e aplicar o MESMO orçamento (a união) às quatro deixa passar o
 * desafio que o aluno lê antes de saber a aula:
 *   - `solutionCode` → produtivo  (A2: o aluno ESCREVE — budget_saida.productive);
 *   - `starterCode`  → receptivo  (A1: o aluno LÊ — budget_saida.receptive);
 *   - `testsCode`    → teste      (A3: o aluno lê o teste ANTES da aula —
 *                                  budget_ENTRADA.receptive, o orçamento de
 *                                  entrada, NUNCA o da saída).
 */
const SUPERFICIES_DO_DESAFIO: readonly {
  campo: string;
  faixa: FaixaDaSuperficie;
  extrair: (d: SaidaDesafio) => string;
}[] = [
  {
    campo: 'solutionCode',
    faixa: 'produtivo',
    extrair: (d) => d.solutionCode,
  },
  {
    campo: 'starterCode',
    faixa: 'receptivo',
    extrair: (d) => d.starterCode,
  },
  {
    campo: 'testsCode',
    faixa: 'teste',
    extrair: (d) => d.testsCode,
  },
];

/** As três FAIXAS do orçamento do snapshot, para o gate do desafio (§3.3). */
export interface FaixasDeOrcamentoDoDesafio {
  /** `budget_receptivo` — o que o starterCode pode usar (A1). */
  receptivo: ReadonlySet<string>;
  /** `budget_produtivo` — o que o solutionCode pode usar (A2). */
  produtivo: ReadonlySet<string>;
  /** `budget_teste` — o que o testsCode pode usar (A3 — ENTRADA). */
  teste: ReadonlySet<string>;
}

/** O resultado do gate por faixas: ofensas + falha de parse + o veredito de A6. */
export interface ResultadoDeOfensasDoDesafio {
  /** construções fora da faixa PRÓPRIA da superfície, em ordem estável. */
  ofensas: OfensaDeOrcamento[];
  /** a primeira superfície que não parseia (fail-closed — quem chama decide). */
  falhaDeParse: { campo: string; mensagem: string } | null;
  /** A6 (§5.1): a solução NÃO usa nenhuma construção do `introduces.productive`. */
  solucaoSemProducao: boolean;
}

/**
 * GATE DE ORÇAMENTO POR FAIXAS do desafio — função PURA (c) da validação da
 * autoria (docs §3.3/§5.1): CADA superfície é validada contra a faixa PRÓPRIA
 * do orçamento do snapshot, NUNCA contra a união das três listas:
 *
 *   testsCode      ⊆ budget_teste     (A3 — o aluno lê o teste ANTES da aula;
 *                                      o orçamento é o de ENTRADA)
 *   starterCode    ⊆ budget_receptivo (A1 — o aluno lê o starter)
 *   solutionCode   ⊆ budget_produtivo (A2 — o aluno ESCREVE a solução)
 *
 * E o gate POSITIVO A6 (a direção puxada): `atomos(solutionCode) ∩
 * introduces.productive ≠ ∅` — sem isso o desafio só repete o que o aluno já
 * sabia e não exige o que a aula introduz.
 *
 * Devolve as ofensas em ordem estável; superfície que não parseia é falha
 * (CODIGO_NAO_PARSEIA — fail-closed). Quem chama decide o erro; este módulo
 * devolve dados, nunca lança.
 */
export function ofensasDeOrcamentoDoDesafio(
  draft: SaidaDesafio,
  faixas: FaixasDeOrcamentoDoDesafio,
  introduzidasProdutivas: ReadonlySet<string>,
): ResultadoDeOfensasDoDesafio {
  const ofensas: OfensaDeOrcamento[] = [];
  let falhaDeParse: { campo: string; mensagem: string } | null = null;
  let solucaoSemProducao = false;
  for (const superficie of SUPERFICIES_DO_DESAFIO) {
    const extraido = extractAtoms(superficie.extrair(draft), { fileName: 'desafio.mjs' });
    if (!extraido.ok) {
      falhaDeParse = { campo: superficie.campo, mensagem: extraido.error.message };
      break;
    }
    const permitidas = faixas[superficie.faixa];
    for (const ocorrencia of extraido.occurrences) {
      if (!permitidas.has(ocorrencia.key)) {
        ofensas.push({ construcao: ocorrencia.key, snippet: ocorrencia.snippet });
      }
    }
    // A6 — direção puxada (§5.1): a SOLUÇÃO precisa exigir ≥1 construção que a
    // aula INTRODUZ produtivamente; solução que só repete construções velhas
    // (mesmo dentro do produtivo) não cobra o que a aula ensinou.
    if (superficie.campo === 'solutionCode') {
      solucaoSemProducao = !extraido.keys.some((chave) => introduzidasProdutivas.has(chave));
    }
  }
  if (ofensas.length > 0) {
    ofensas.sort((a, b) => (a.construcao < b.construcao ? -1 : a.construcao > b.construcao ? 1 : 0));
  }
  return { ofensas, falhaDeParse, solucaoSemProducao };
}

// ---------------------------------------------------------------------------
// A autoria do desafio em si (etapa 3 da ordem interna §4.3)
// ---------------------------------------------------------------------------

export interface EntradaAutorizarDesafio {
  aula_slug: string;
  /** snapshot imutável do freeze (F5) — o `budgetHash` nasce no envelope. */
  snapshot: SnapshotAula;
  /** dossiê da AULA (P-11) — o desafio herda objetivo/kc_type/ei_class/subgoals/terms e orçamentos. */
  dossie: Dossier;
  /** resumo GERADO da teoria efetivamente escrita (§4.3) — produzido pela F7. */
  resumo_da_teoria: string;
  /** ANTI-REPETIÇÃO — desafios anteriores da MESMA trilha. */
  desafios_anteriores: DesafioAnteriorDaTrilha[];
}

export type ResultadoDesafio =
  | { status: 'blocked'; aula_slug: string; faltantes: string[]; motivo: string; budgetHash: string }
  | {
      status: 'validado';
      aula_slug: string;
      draft: SaidaDesafio;
      budgetHash: string;
      /**
       * a conferência da cauda de checksum (§7.1 R18) — `null` quando o modelo
       * não devolveu cauda. REPORTADA, nunca bloqueante.
       */
      checksum: ResultadoChecksum | null;
    };

/**
 * Aplica o limiter do pool (acquisition pattern do P-27) em volta de `fn`,
 * quando o limiter existe. `fn` roda direto sem o limiter → o provador injetado
 * (P-31) já governa a execução com o SEM_EXEC próprio.
 */
async function comLimiteDoPool<T>(limiter: RateLimiter | undefined, fn: () => Promise<T>): Promise<T> {
  if (limiter === undefined) return fn();
  const release = await limiter.acquire();
  try {
    return await fn();
  } finally {
    release(); // idempotente (P-01)
  }
}

/**
 * AUTORIZA UM DESAFIO (etapa 3 da ordem interna de §4.3): monta o dossiê de
 * desafio (resumo da teoria + anti-repetição), chama o autor de desafio com o
 * prompt da variante, e valida o draft NA AUTORIA, antes de existir revisão:
 * (a) schema, (b) as QUATRO PROVAS via `deps.prover`, (c) orçamento.
 *
 * `blocked` é resultado VÁLIDO da chamada (retornado como `status: 'blocked'`,
 * sem gravar NADA — a aula inteira fica marcada blocked, nenhum arquivo de
 * draft parcial). Defeito determinístico (schema, provas, orçamento) LANÇA
 * `AutorError` — fail-closed, o que a onda registra como falha.
 */
export async function autorizarDesafio(
  deps: DepsDoDesafio,
  entrada: EntradaAutorizarDesafio,
): Promise<ResultadoDesafio> {
  const { aula_slug, snapshot, dossie } = entrada;

  // O portão do spawn: o dossiê de desafio é montado AQUI (resumo + anti-) e
  // qualquer campo faltante RECUSA antes de tocar a LLM (A-P11-2, variante).
  const dossieDeDesafio = montarDossieDeDesafio({
    aula_slug,
    objetivo: dossie.objetivo,
    kc_type: dossie.kc_type,
    ei_class: dossie.ei_class,
    budget_produtivo: dossie.budget_produtivo,
    budget_receptivo: dossie.budget_receptivo,
    budget_teste: dossie.budget_teste,
    subgoals: dossie.subgoals,
    terms: dossie.terms,
    resumo_da_teoria: entrada.resumo_da_teoria,
    desafios_anteriores: entrada.desafios_anteriores,
  });

  const req: LlmCallRequest = {
    prompt: gerarPromptAutorDeDesafio(dossieDeDesafio),
    stageVersion: STAGE_VERSION_DESAFIO,
    timeoutMs: TIMEOUT_DESAFIO_MS,
    maxTokens: MAX_TOKENS_DESAFIO,
  };

  const resposta = await deps.llm.callLlm(ETAPA_DESAFIO, req); // LlmStageError propaga (estruturado)

  // Teto: REJEITADO, nunca truncado (§7 — o transporte devolve intacto).
  try {
    rejeitarAcimaDoTeto(resposta.content);
  } catch (erro) {
    throw new AutorError('ACIMA_DO_TETO', erro instanceof Error ? erro.message : String(erro), aula_slug, {
      etapa: ETAPA_DESAFIO,
      detalhes: { estimativaChars: resposta.content.length },
    });
  }

  // §7.1 R18: a lista de construções repetida vem DEPOIS do JSON — o conteúdo
  // inteiro nunca é JSON válido quando o modelo obedece. Separa o primeiro
  // objeto BALANCEADO da cauda, sem jamais "consertar" JSON (fail-closed).
  const partido = separarJsonECauda(resposta.content);
  if (partido === null) {
    throw new AutorError(
      'SAIDA_NAO_JSON',
      'saída do autor de desafio não contém nenhum objeto JSON balanceado (nem draft nem blocked)',
      aula_slug,
      { etapa: ETAPA_DESAFIO },
    );
  }
  let cru: unknown;
  try {
    cru = JSON.parse(partido.json);
  } catch (erro) {
    throw new AutorError('SAIDA_NAO_JSON', `saída do autor de desafio não é JSON: ${erro instanceof Error ? erro.message : String(erro)}`, aula_slug, { etapa: ETAPA_DESAFIO });
  }
  // A cauda é CONFERIDA contra a MESMA lista que o prompt mandou repetir —
  // reportada no envelope, nunca bloqueante (as QUATRO PROVAS é que decidem).
  const cauda = partido.cauda.trim();
  const checksum =
    cauda.length > 0 ? compararChecksum(construcoesPermitidasDoDesafio(dossieDeDesafio), cauda) : null;

  // §7.1 R3: blocked é RESULTADO VÁLIDO (não falha) — devolvido, nada gravado.
  if (isBlocked(cru)) {
    const bloco = cru as RespostaBlocked;
    return { status: 'blocked', aula_slug, faltantes: [...bloco.missing], motivo: bloco.motivo, budgetHash: snapshot.budgetHash };
  }

  // (a) schema — raciocínio primeiro (INV-04), todo campo obrigatório (INV-05).
  const parseado = DesafioAuthorOutputSchema.safeParse(cru);
  if (!parseado.success) {
    throw new AutorError(
      'SCHEMA_INVALIDO',
      `draft de desafio viola o DesafioAuthorOutputSchema: ${formatarErroCampos(parseado.error)}`,
      aula_slug,
      { etapa: ETAPA_DESAFIO },
    );
  }
  const draft = parseado.data;

  // (b) as QUATRO PROVAS de execução (§5.4) — solution passa, starter falha,
  //     contagem bate, stub vazio falha; veredito fail-closed do prover.
  const inputDasProvas = montarInputDasProvas(draft);
  const veredito = await comLimiteDoPool(deps.scheduler?.limiters?.exec, () => deps.prover(inputDasProvas));
  if (!veredito.valid) {
    const falhas = veredito.failures.map((f) => `${f.proof}: ${f.reason ?? 'sem motivo'}`).join('; ');
    throw new AutorError('PROVA_DO_DESAFIO_FALHOU', `as provas de execução do desafio falharam — ${falhas}`, aula_slug, {
      etapa: ETAPA_DESAFIO,
      detalhes: { falhas: veredito.failures, declaradas: veredito.declared, executadas: veredito.executed },
    });
  }

  // (c) orçamento POR FAIXAS (§3.3): CADA superfície contra a faixa PRÓPRIA do
  //     orçamento do snapshot (o dossiê da aula é a fatia congelada) — testsCode
  //     ⊆ budget_teste (o aluno lê o teste ANTES da aula, A3), starterCode ⊆
  //     budget_receptivo (A1), solutionCode ⊆ budget_produtivo (A2), e NUNCA a
  //     união das três listas (a união deixava passar, por exemplo, um teste com
  //     construção só-produtiva — o aluno lê o teste antes de saber a aula).
  //     NOMEIA a construção (a ofensa de menor chave vira `construcao`; a
  //     mensagem lista todas). A6 (direção puxada) fecha o gate positivo: a
  //     solução precisa exigir ≥1 construção do `introduces.productive`.
  const faixas: FaixasDeOrcamentoDoDesafio = {
    receptivo: new Set(dossie.budget_receptivo),
    produtivo: new Set(dossie.budget_produtivo),
    teste: new Set(dossie.budget_teste),
  };
  const { ofensas, falhaDeParse, solucaoSemProducao } = ofensasDeOrcamentoDoDesafio(
    draft,
    faixas,
    new Set(dossie.introduces_productive),
  );
  if (falhaDeParse !== null) {
    throw new AutorError(
      'CODIGO_NAO_PARSEIA',
      `código do desafio não parseia no campo "${falhaDeParse.campo}": ${falhaDeParse.mensagem}`,
      aula_slug,
      { etapa: ETAPA_DESAFIO, detalhes: { campo: falhaDeParse.campo } },
    );
  }
  if (ofensas.length > 0) {
    const nomes = ofensas.map((o) => o.construcao);
    const primeira = ofensas[0];
    throw new AutorError(
      'CONSTRUCAO_FORA_DO_ORCAMENTO',
      `o draft de desafio usa construção fora do orçamento do snapshot: ${primeira.construcao}` +
        (ofensas.length > 1 ? ` (e também: ${nomes.slice(1).join(', ')})` : '') +
        ` — trecho: "${primeira.snippet}" (docs §5.5: a violação nomeia a construção; fora do orçamento é defeito do grafo, não licença)`,
      aula_slug,
      { etapa: ETAPA_DESAFIO, construcao: primeira.construcao, detalhes: { ofensas } },
    );
  }
  // A6 — a direção puxada (§5.1): `atomos(solutionCode) ∩ introduces.productive
  // ≠ ∅`. Sem o gate positivo a trilha só repete o que o aluno já sabia (a aula
  // `funcoes` do repositório falha exatamente aí) — o desafio tem de EXIGIR o
  // que a aula introduz produtivamente.
  if (solucaoSemProducao) {
    throw new AutorError(
      'SOLUCAO_SEM_PRODUCAO',
      'a solução do desafio não usa nenhuma construção do introduces.productive (A6 — a direção puxada: atomos(solutionCode) ∩ introduces.productive ≠ ∅; a solução precisa exigir o que a aula introduz, não só repetir o que o aluno já lia)',
      aula_slug,
      {
        etapa: ETAPA_DESAFIO,
        detalhes: { introduzidasProdutivas: [...dossie.introduces_productive] },
      },
    );
  }

  // O challenge-draft do P-04 NÃO tem campo budgetHash (INV-08: schema do
  // artefato congelado, sem bump) — o hash nasce no ENVELOPE do resultado:
  // `status: 'validado'` carrega `budgetHash` ao lado do draft.
  return { status: 'validado', aula_slug, draft, budgetHash: snapshot.budgetHash, checksum };
}