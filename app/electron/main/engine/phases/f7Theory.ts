/**
 * app/electron/main/engine/phases/f7Theory.ts — F7 · AUTORIA DE TEORIA — O
 * FLUXO DE UMA AULA (pacote P-17, plano de execução v1 —
 * `docs/16-engine-de-trilha.md` §4.1, §4.3, §5.4, §6.1, §7.1).
 *
 * A ORDEM INTERNA DE UMA AULA (§4.3), em UMA função, SEMPRE sequencial
 * ("Não paralelize as seções da mesma aula" — §4.1):
 *
 *   (1) OBJETIVO — vem do dossiê (P-11), zero chamada LLM;
 *   (2) ESQUELETO DE TEORIA — 1ª chamada (etapa `f7-teoria-esqueleto`);
 *   (3) DESAFIO E TESTES — 2ª chamada (etapa `f8-desafio`, F8), que recebe,
 *       ALÉM do orçamento, o RESUMO GERADO da teoria efetivamente escrita
 *       (`resumoDaTeoria` — função PURA) e a lista de ANTI-REPETIÇÃO
 *       (títulos e requisitos dos desafios anteriores da mesma trilha);
 *   (4) FECHAMENTO DA TEORIA — 3ª chamada (etapa `f7-teoria-fechamento`),
 *       sabendo o que o desafio VALIDADO exige habilitar (o resumo do desafio
 *       entra via `system` da chamada — itens de avaliação antes dos
 *       materiais; backward design).
 *
 * VALIDAÇÃO DOS DRAFTS NA AUTORIA (pré-revisão — §6.1 "os drafts nascem
 * validados", determinística, zero LLM):
 *   - draft de AULA: (a) schema (LessonDraftSchema P-04); (c) orçamento POR
 *     FAIXA (§3.3/§5.1 A4) — `extractAtoms(teoria, blocos cercados) ⊆`
 *     **faixa RECEPTIVA** do orçamento do snapshot (`budget_receptivo` — a
 *     teoria é LIDA pelo aluno; a união das três listas NÃO se aplica à
 *     teoria), errando NOMEANDO a construção (§5.3 §5.5: bloco cercado com
 *     tag é código, crase inline é prosa; a violação nomeia a construção e o
 *     trecho); o `budgetHash` do SNAPSHOT (F5) é CARIMBADO no draft — o autor
 *     nunca escolhe o hash (A-P17-3).
 *   - draft de DESAFIO (F8): schema + as QUATRO PROVAS (§5.4) + orçamento —
 *     ver `f8Challenges.ts`.
 *
 * `blocked` (§7.1 R3) é resultado VÁLIDO de QUALQUER etapa e NÃO produz aula
 * parcial: a aula inteira fica marcada `blocked` e NENHUM arquivo de draft é
 * gravado. Defeito determinístico LANÇA `AutorError` (f8Challenges) — a onda
 * registra a aula como falha, fail-closed.
 *
 * ESCALONAMENTO REAL (porta de entrada do pacote): `runOndaDeAutoria` monta
 * UMA tarefa por aula (1 agente = 1 aula; outputs = os DOIS drafts exclusivos
 * da aula — posse validada GLOBALMENTE sobre a UNIÃO de todos os batches
 * ANTES de rodar qualquer aula, PAR-02 §4.1: colisão CRUZADA entre ondas
 * diferentes também rejeita o run inteiro, nada roda) e roda batches de
 * ≤ `TETO_ONDA_AUTORIA` (15) — ondas >15 DIVIDIDAS, nunca truncadas. O
 * executor das tarefas é `autorizarAula`; `limiters` vêm de pools SEPARADOS
 * do SEM_LLM do transporte (P-27: o executor chama o transporte DENTRO do
 * slot do pool — compartilhar o mesmo objeto semáforo entre os dois é
 * DEADLOCK). A validação POR ONDA do scheduler (`validateWave`) continua
 * rodando como defesa em profundidade.
 */

import * as path from 'node:path';

import type { EngineLlm, LlmCallRequest } from '../runtime/callLlm';
import {
  SchedulerError,
  collectOutputCollisions,
  runWave,
  validateWave,
  type Executor,
  type RateLimiters,
  type WaveConfig,
  type WaveResult,
} from '../runtime/scheduler';
import type { Task } from '../runtime/task';
import type { EscreverArquivoFn } from '../runtime/runState';
import { LessonDraftSchema } from '../schemas/artifacts';
import { extractAtoms } from '../extract';
import { formatarErroCampos } from '../schemas/fieldOrder';
import {
  AuthorOutputSchema,
  MAX_TOKENS_SAIDA_AUTOR,
  gerarPromptAutor,
  isBlocked,
  rejeitarAcimaDoTeto,
  type RespostaBlocked,
  type SaidaAutor,
} from '../prompts/author';
import type { Dossier } from '../prompts/dossier';
import type { SnapshotAula } from './f5Freeze';
import {
  ETAPA_DESAFIO,
  AutorError,
  autorizarDesafio,
  type DesafioAnteriorDaTrilha,
  type OfensaDeOrcamento,
  type ProverDeDesafio,
  type SaidaDesafio,
} from './f8Challenges';

// ---------------------------------------------------------------------------
// Constantes da autoria — teto e timeout EXPLÍCITOS por chamada (§7, item 5)
// ---------------------------------------------------------------------------

/** Teto de ondas de autoria (§4.1: ondas de ≤15; limite duro 20 é do scheduler). */
export const TETO_ONDA_AUTORIA = 15;

/** As QUATRO etapas LLM de uma aula, na ORDEM fixa da §4.3 (o código impõe). */
export const ETAPAS_AUTORIA = ['f7-teoria-esqueleto', 'f8-desafio', 'f7-teoria-fechamento'] as const;
export type EtapaAutoria = (typeof ETAPAS_AUTORIA)[number];

export const ETAPA_ESQUELETO = 'f7-teoria-esqueleto';
export const ETAPA_FECHAMENTO = 'f7-teoria-fechamento';

/** stageVersion — identidade de artefato no cache do transporte (bump = invalida). */
export const STAGE_VERSION_ESQUELETO = 'f7-teoria-esqueleto-v1';
export const STAGE_VERSION_FECHAMENTO = 'f7-teoria-fechamento-v1';

/** Teto de saída de cada chamada de teoria (o MESMO teto do autor, §7). */
export const MAX_TOKENS_AUTORIA = MAX_TOKENS_SAIDA_AUTOR;

/** Timeout declarado por chamada — uma etapa travada nunca segura a onda. */
export const TIMEOUT_AUTORIA_MS = 120_000;

// ---------------------------------------------------------------------------
// O dossiê de aula recebido pela autoria (F5 → F7) — o snapshot é a fonte
// ---------------------------------------------------------------------------

/**
 * A entrada da autoria de UMA aula: o snapshot imutável do freeze (F5 — o
 * `budgetHash` carimba os drafts), o dossiê de aula (P-11 — entrada literal
 * do prompt de teoria) e a lista de ANTI-REPETIÇÃO (desafios anteriores da
 * MESMA trilha; o desafio desta aula não repete enunciado nem requisitos).
 * Os caminhos de saída são DERIVADOS de `aula_slug` (posse única por aula).
 */
export interface DossieDeAula {
  /** `<moduleSlug>/<lessonSlug>` — a identidade da aula (chave do snapshot). */
  aula_slug: string;
  /** snapshot imutável do freeze (F5) — `budgetHash` carimba os drafts (A-P17-3). */
  snapshot: SnapshotAula;
  /** dossiê do autor de aula (P-11) — entrada LITERAL do prompt de teoria. */
  dossie: Dossier;
  /** anti-repetição: títulos e requisitos dos desafios anteriores da mesma trilha. */
  desafios_anteriores: DesafioAnteriorDaTrilha[];
}

/** Caminho relativo do draft de AULA (1 arquivo por aula — §4.1 F7). */
export function caminhoDraftAula(ref: string): string {
  return `drafts/${ref.replace(/\//g, '__')}.lesson-draft.json`;
}

/** Caminho relativo do draft de DESAFIO (1 arquivo por aula — v1 single-file). */
export function caminhoDraftDesafio(ref: string): string {
  return `drafts/${ref.replace(/\//g, '__')}.challenge-draft.json`;
}

// ---------------------------------------------------------------------------
// Dependências da autoria e resultado por aula
// ---------------------------------------------------------------------------

/** Dependências da autoria de UMA aula (a onda injeta as mesmas + os pools). */
export interface DepsAutoria {
  /** Transporte único de LLM (fake nos testes — sem rede, sem chave). */
  llm: EngineLlm;
  /** Provador das QUATRO provas (P-31; fake nos testes registrando chamadas). */
  prover: ProverDeDesafio;
  /**
   * Scheduler opcional: quando presente, o limite do pool `exec` É APLICADO
   * em volta da chamada do provador dentro da aula. P-27: pools SEPARADOS do
   * SEM_LLM do transporte — as tarefas da onda seguram o pool `llm` do
   * scheduler, o transporte usa o semáforo PRÓPRIO, e o provador usa o pool
   * `exec`: três objetos distintos, sem deadlock.
   */
  scheduler?: { limiters?: RateLimiters };
}

export type ResultadoAutoria =
  | {
      status: 'blocked';
      aula_slug: string;
      /** em qual etapa o autor devolveu blocked (a aula para na primeira). */
      etapa: EtapaAutoria;
      faltantes: string[];
      motivo: string;
      budgetHash: string;
    }
  | {
      status: 'validado';
      aula_slug: string;
      draftAula: SaidaAutor;
      desafio: SaidaDesafio;
      budgetHash: string;
    };

// ---------------------------------------------------------------------------
// `resumoDaTeoria` — função PURA (que construções/termos a teoria apresentou)
// ---------------------------------------------------------------------------

/** Uma seção da teoria escrita (shape estrutural — aceita o draft do autor). */
export interface SecaoDaTeoriaEscrita {
  id: string;
  secao: string;
  markdown: string;
  tag: string;
}

/** A teoria ESCREVÍVEL: seções + termos novos (shape estrutural, sem zod). */
export interface TeoriaEscrita {
  theory: readonly SecaoDaTeoriaEscrita[];
  introducesTerms?: readonly string[];
}

export interface BlocoDeCodigoDaTeoria {
  /** id da seção que contém o bloco (para mensagens de erro rastreáveis). */
  secao: string;
  /** o código efetivamente cercado (a tag é o marcador — §5.3). */
  codigo: string;
}

/**
 * Extrai OS BLOCOS DE CÓDIGO da teoria (§5.3): "bloco cercado com tag é
 * código; crase inline é prosa". Seção com `tag` não-vazia é código inteiro;
 * seção de prosa (`tag` vazia) só conta BLOCOS cercados com tag. Função PURA.
 * Sem essa higiene o extrator envenenaria o orçamento (spans de crase como
 * `total: 3` ou `arquivo:linha:coluna` parseiam como LabeledStatement).
 */
export function blocosDeCodigoDaTeoria(draft: TeoriaEscrita): BlocoDeCodigoDaTeoria[] {
  const blocos: BlocoDeCodigoDaTeoria[] = [];
  for (const secao of draft.theory) {
    if (secao.tag.trim() !== '') {
      blocos.push({ secao: secao.id, codigo: secao.markdown });
      continue;
    }
    const reFence = /```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = reFence.exec(secao.markdown)) !== null) {
      if (match[1].trim() !== '') {
        blocos.push({ secao: secao.id, codigo: match[2] });
      }
    }
  }
  return blocos;
}

/**
 * O RESUMO GERADO da teoria efetivamente escrita (§4.3) — função PURA: o
 * autor de desafio recebe, além do orçamento, este resumo ("a lista de
 * construções diz o que é PERMITIDO; o resumo diz COMO aquilo foi
 * apresentado"). Conteúdo determinístico: as seções, as CONSTRUÇÕES presentes
 * no código da teoria (via `extractAtoms` — o mesmo parser do gate) e os
 * termos novos. Bloco que não parseia é ignorado aqui (o resumo descreve; o
 * GATE de orçamento é quem banca o fail-closed).
 */
export function resumoDaTeoria(draftTeoria: TeoriaEscrita): string {
  const chaves = new Set<string>();
  for (const bloco of blocosDeCodigoDaTeoria(draftTeoria)) {
    const extraido = extractAtoms(bloco.codigo, { fileName: 'teoria.mjs' });
    if (extraido.ok) {
      for (const chave of extraido.keys) chaves.add(chave);
    }
  }
  const construcoes = [...chaves].sort();
  const termos = [...(draftTeoria.introducesTerms ?? [])].sort();

  const linhas: string[] = ['=== RESUMO DA TEORIA ESCRITA (esqueleto da aula) ==='];
  linhas.push('seções da teoria:');
  if (draftTeoria.theory.length === 0) {
    linhas.push('  (nenhuma seção no esqueleto)');
  } else {
    for (const secao of draftTeoria.theory) {
      linhas.push(`  - [${secao.secao}] ${secao.id}`);
    }
  }
  linhas.push('construções apresentadas no código da teoria:');
  if (construcoes.length === 0) {
    linhas.push('  (nenhuma construção em blocos de código)');
  } else {
    for (const construcao of construcoes) linhas.push(`  - ${construcao}`);
  }
  linhas.push('termos novos da aula:');
  if (termos.length === 0) {
    linhas.push('  (nenhum termo novo)');
  } else {
    for (const termo of termos) linhas.push(`  - ${termo}`);
  }
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Validação determinística do draft de AULA NA AUTORIA (pré-revisão, §6.1)
// ---------------------------------------------------------------------------

/**
 * GATE DE ORÇAMENTO da TEORIA — função PURA (c) da validação da autoria:
 * `extractAtoms(teoria, blocos cercados) ⊆` **faixa RECEPTIVA** do orçamento
 * do snapshot (docs §3.3/§5.1, A4): a teoria é LIDA pelo aluno, então só o
 * `budget_receptivo` se aplica (`atomos(theory, blocos cercados) ⊆
 * budget_saida.receptive`) — as faixas produtiva e `budget_teste` NÃO valem
 * para a teoria. Devolve as ofensas em ordem estável; bloco de código que não
 * parseia é falha declarada (fail-closed: prosa re-tagueada como código é
 * defeito de build, §5.3). Quem chama decide o erro; este módulo devolve
 * dados, nunca lança. (O desafio valida as faixas PRÓPRIAS de cada superfície
 * dele na F8 — `ofensasDeOrcamentoDoDesafio`.)
 */
export function ofensasDeOrcamentoDaTeoria(
  draft: TeoriaEscrita,
  permitidas: ReadonlySet<string>,
): { ofensas: OfensaDeOrcamento[]; falhaDeParse: { secao: string; mensagem: string } | null } {
  const ofensas: OfensaDeOrcamento[] = [];
  let falhaDeParse: { secao: string; mensagem: string } | null = null;
  for (const bloco of blocosDeCodigoDaTeoria(draft)) {
    const extraido = extractAtoms(bloco.codigo, { fileName: 'teoria.mjs' });
    if (!extraido.ok) {
      falhaDeParse = { secao: bloco.secao, mensagem: extraido.error.message };
      break;
    }
    for (const ocorrencia of extraido.occurrences) {
      if (!permitidas.has(ocorrencia.key)) {
        ofensas.push({ construcao: ocorrencia.key, snippet: ocorrencia.snippet });
      }
    }
  }
  if (ofensas.length > 0) {
    ofensas.sort((a, b) => (a.construcao < b.construcao ? -1 : a.construcao > b.construcao ? 1 : 0));
  }
  return { ofensas, falhaDeParse };
}

/**
 * A VALIDAÇÃO DETERMINÍSTICA do draft de aula NA AUTORIA (§6.1): (a) schema
 * (LessonDraftSchema P-04); (c) orçamento da teoria. LANÇA `AutorError`
 * estruturado (fail-closed) — a violação NOMEIA a construção (§5.5). O
 * desafio tem validação própria na F8 (schema + QUATRO PROVAS + orçamento).
 */
export function validarDraftDeAula(draft: SaidaAutor, aula_slug: string, dossie: Dossier): void {
  const checagem = LessonDraftSchema.safeParse(draft);
  if (!checagem.success) {
    throw new AutorError(
      'SCHEMA_INVALIDO',
      `draft de aula viola o LessonDraftSchema (P-04): ${formatarErroCampos(checagem.error)}`,
      aula_slug,
      { etapa: ETAPA_FECHAMENTO },
    );
  }
  // (c) orçamento POR FAIXA (§3.3/§5.1 A4): a teoria é LIDA pelo aluno — só a
  //     faixa RECEPTIVA do orçamento do snapshot se aplica (`atomos(theory,
  //     blocos cercados) ⊆ budget_saida.receptive`); a união das três listas
  //     NÃO vale aqui (ela deixaria a teoria ensinar construções que o aluno
  //     ainda não pode ler). O desafio valida as faixas PRÓPRIAS dele na F8.
  //     NOMEIA a construção (a ofensa de menor chave vira `construcao`; a
  //     mensagem lista todas).
  const permitidas = new Set<string>(dossie.budget_receptivo);
  const { ofensas, falhaDeParse } = ofensasDeOrcamentoDaTeoria(draft, permitidas);
  if (falhaDeParse !== null) {
    throw new AutorError(
      'CODIGO_NAO_PARSEIA',
      `bloco de código da teoria "${falhaDeParse.secao}" não parseia: ${falhaDeParse.mensagem} (docs §5.3: bloco cercado com tag é código — precisa parsear)`,
      aula_slug,
      { etapa: ETAPA_FECHAMENTO, detalhes: { secao: falhaDeParse.secao } },
    );
  }
  if (ofensas.length > 0) {
    const nomes = ofensas.map((o) => o.construcao);
    const primeira = ofensas[0];
    throw new AutorError(
      'CONSTRUCAO_FORA_DO_ORCAMENTO',
      `a teoria da aula usa construção fora do orçamento do snapshot: ${primeira.construcao}` +
        (ofensas.length > 1 ? ` (e também: ${nomes.slice(1).join(', ')})` : '') +
        ` — trecho: "${primeira.snippet}" (docs §5.5: a violação nomeia a construção; fora do orçamento é defeito do grafo, não licença)`,
      aula_slug,
      { etapa: ETAPA_FECHAMENTO, construcao: primeira.construcao, detalhes: { ofensas } },
    );
  }
}

// ---------------------------------------------------------------------------
// A chamada de UMA etapa de teoria (esqueleto ou fechamento)
// ---------------------------------------------------------------------------

type RespostaDaEtapaDeTeoria =
  | { status: 'ok'; draft: SaidaAutor }
  | { status: 'blocked'; faltantes: string[]; motivo: string };

/**
 * UMA chamada de teoria (etapa `esqueleto` ou `fechamento`) com todas as
 * regras de transporte: teto e timeout EXPLÍCITOS; saída acima do teto
 * REJEITADA (nunca truncada — §7); JSON inválido e schema violado viram
 * `AutorError` estruturado; `blocked` é resultado VÁLIDO (§7.1 R3).
 */
async function comAutorTeoria(
  deps: DepsAutoria,
  aula_slug: string,
  etapa: 'f7-teoria-esqueleto' | 'f7-teoria-fechamento',
  stageVersion: string,
  prompt: string,
  system: string | undefined,
): Promise<RespostaDaEtapaDeTeoria> {
  const req: LlmCallRequest = {
    prompt,
    ...(system !== undefined && system.trim().length > 0 ? { system } : {}),
    stageVersion,
    timeoutMs: TIMEOUT_AUTORIA_MS,
    maxTokens: MAX_TOKENS_AUTORIA,
  };
  const resposta = await deps.llm.callLlm(etapa, req); // LlmStageError propaga (estruturado)

  try {
    rejeitarAcimaDoTeto(resposta.content);
  } catch (erro) {
    throw new AutorError(
      'ACIMA_DO_TETO',
      erro instanceof Error ? erro.message : String(erro),
      aula_slug,
      { etapa, detalhes: { estimativaChars: resposta.content.length } },
    );
  }

  let cru: unknown;
  try {
    cru = JSON.parse(resposta.content);
  } catch (erro) {
    throw new AutorError(
      'SAIDA_NAO_JSON',
      `saída do autor de teoria não é JSON: ${erro instanceof Error ? erro.message : String(erro)}`,
      aula_slug,
      { etapa },
    );
  }

  if (isBlocked(cru)) {
    const bloco = cru as RespostaBlocked;
    return { status: 'blocked', faltantes: [...bloco.missing], motivo: bloco.motivo };
  }

  const parseado = AuthorOutputSchema.safeParse(cru);
  if (!parseado.success) {
    throw new AutorError(
      'SCHEMA_INVALIDO',
      `draft de aula viola o AuthorOutputSchema (P-11): ${formatarErroCampos(parseado.error)}`,
      aula_slug,
      { etapa },
    );
  }
  return { status: 'ok', draft: parseado.data };
}

// ---------------------------------------------------------------------------
// O resumo do desafio VALIDADO — o contexto do FECHAMENTO da teoria
// ---------------------------------------------------------------------------

/**
 * O resumo do desafio final (VALIDADO) que o fechamento da teoria precisa
 * habilitar — entra como `system` da 3ª chamada (§4.3: a teoria fecha
 * SABENDO o que o desafio exige). Função PURA.
 */
export function resumoDoDesafio(d: SaidaDesafio): string {
  const linhas = [
    `desafio.slug: ${d.slug}`,
    `desafio.conceito: ${d.conceito}`,
    `desafio.statement: ${d.statement}`,
    `desafio.expectedTestCount: ${d.expectedTestCount}`,
    `desafio.requires: ${d.requires.join(', ') || '(vazio)'}`,
    ...d.requirements.map((r) => `desafio.requirement [${r.id}]: ${r.descricao} — teste: ${r.teste}`),
  ];
  return ['=== DESAFIO FINAL DA AULA (validado — o fechamento da teoria precisa habilitá-lo) ===', ...linhas].join('\n');
}

// ---------------------------------------------------------------------------
// A AUTORIA DE UMA AULA — a ORDEM INTERNA da §4.3, SEMPRE sequencial
// ---------------------------------------------------------------------------

/**
 * AUTORIZA UMA AULA INTEIRA na ordem interna da §4.3 — SEQUENCIAL por
 * construção do código (nada de paralelizar seções da mesma aula, §4.1):
 *
 *   (1) objetivo (dossiê, zero LLM) → (2) esqueleto de teoria → (3) desafio e
 *   testes (F8 — com o resumo da teoria + anti-repetição) → (4) fechamento da
 *   teoria (com o resumo do desafio validado em `system`).
 *
 * Nos (2)-(4), `blocked` de QUALQUER etapa devolve `status: 'blocked'` — a
 * aula INTEIRA fica marcada blocked e NADA é gravado (sem aula parcial).
 * No final, o draft de aula é VALIDADO (schema + orçamento) e carimba o
 * `budgetHash` do SNAPSHOT (F5) — o hash que GEROU o draft, nunca o que o
 * autor escreveu (A-P17-3).
 */
export async function autorizarAula(deps: DepsAutoria, dossieDeAula: DossieDeAula): Promise<ResultadoAutoria> {
  const { aula_slug, snapshot, dossie } = dossieDeAula;
  const budgetHash = snapshot.budgetHash;

  // (1) OBJETIVO — vem do dossiê (P-11); nenhuma chamada LLM nesta etapa.

  // (2) ESQUELETO DE TEORIA.
  const esqueleto = await comAutorTeoria(
    deps,
    aula_slug,
    ETAPA_ESQUELETO,
    STAGE_VERSION_ESQUELETO,
    gerarPromptAutor(dossie),
    undefined,
  );
  if (esqueleto.status === 'blocked') {
    return { status: 'blocked', aula_slug, etapa: ETAPA_ESQUELETO, faltantes: esqueleto.faltantes, motivo: esqueleto.motivo, budgetHash };
  }

  // (3) DESAFIO E TESTES — com o RESUMO da teoria escrita + anti-repetição.
  const desafio = await autorizarDesafio(deps, {
    aula_slug,
    snapshot,
    dossie,
    resumo_da_teoria: resumoDaTeoria(esqueleto.draft),
    desafios_anteriores: dossieDeAula.desafios_anteriores,
  });
  if (desafio.status === 'blocked') {
    return { status: 'blocked', aula_slug, etapa: ETAPA_DESAFIO, faltantes: desafio.faltantes, motivo: desafio.motivo, budgetHash };
  }

  // (4) FECHAMENTO DA TEORIA — sabendo o que o desafio VALIDADO exige habilitar.
  const fechamento = await comAutorTeoria(
    deps,
    aula_slug,
    ETAPA_FECHAMENTO,
    STAGE_VERSION_FECHAMENTO,
    gerarPromptAutor(dossie),
    resumoDoDesafio(desafio.draft),
  );
  if (fechamento.status === 'blocked') {
    return { status: 'blocked', aula_slug, etapa: ETAPA_FECHAMENTO, faltantes: fechamento.faltantes, motivo: fechamento.motivo, budgetHash };
  }

  // A validação determinística do draft de aula (schema + orçamento) e o
  // carimbo de `budgetHash` do snapshot (o hash do orçamento que gerou o
  // draft) — o desafio já foi validado na F8 (schema + QUATRO PROVAS + orçamento).
  const draftAula: SaidaAutor = { ...fechamento.draft, budgetHash };
  validarDraftDeAula(draftAula, aula_slug, dossie);

  return { status: 'validado', aula_slug, draftAula, desafio: desafio.draft, budgetHash };
}

// ---------------------------------------------------------------------------
// ESCALONAMENTO REAL — ondas de ≤15, posse validada, batches sem truncar
// ---------------------------------------------------------------------------

/** Dependências da onda: transportes + pools do scheduler + escrita injetável. */
export interface DepsDaOndaAutoria {
  llm: EngineLlm;
  prover: ProverDeDesafio;
  /**
   * Pools do ESCALONADOR — SEPARADOS do SEM_LLM do transporte (P-27): o
   * executor da tarefa chama o transporte DENTRO do slot do pool; o MESMO
   * objeto semáforo nos dois lugares é deadlock. Quem costura a produção
   * injeta objetos de semáforo DISTINTOS.
   */
  limiters: RateLimiters;
  /** escrita injetável dos drafts (testes: memória; produção: primitiva D-WRITE). */
  escreverArquivo: EscreverArquivoFn;
  /** raiz onde os drafts são gravados (default: '' — outputs relativos). */
  baseDir?: string;
  /** teto de ondas (default 15 — §4.1). */
  tetoOnda?: number;
}

/** O estado de UMA aula ao fim da onda de autoria. */
export interface EstadoDeAulaNaOnda {
  aula_slug: string;
  status: 'validado' | 'blocked' | 'falhou';
  /** em que etapa da §4.3 a aula parou (blocked/falhou). */
  etapa?: EtapaAutoria;
  faltantes?: string[];
  motivo?: string;
  erro?: string;
  budgetHash?: string;
  caminhos?: { draftAula: string; draftDesafio: string };
}

export interface ResultadoOndaDeAutoria {
  /** estados na ORDEM das aulas de entrada. */
  estados: EstadoDeAulaNaOnda[];
  /** quantos runWave rodaram (batches de ≤ teto). */
  ondas: number;
  /** ids das aulas efetivamente autorizadas, em ordem de conclusão. */
  executadas: string[];
  waves: WaveResult[];
  warnings: string[];
}

/**
 * Divide a lista em batches de ≤ `teto` — PURO. Ondas > 15 são DIVIDIDAS,
 * nunca truncadas (§4.1). `teto` precisa ser inteiro ≥ 1.
 */
export function dividirEmBatches<T>(itens: readonly T[], teto: number): T[][] {
  if (!Number.isInteger(teto) || teto < 1) {
    throw new RangeError(`dividirEmBatches: teto precisa ser inteiro ≥ 1 (recebido ${teto}).`);
  }
  const batches: T[][] = [];
  for (let i = 0; i < itens.length; i += teto) {
    batches.push(itens.slice(i, i + teto));
  }
  return batches;
}

/** UMA tarefa por aula: 1 agente = 1 aula; outputs = os drafts exclusivos. */
function tarefasDaOnda(batch: readonly DossieDeAula[]): Task[] {
  return batch.map((aula, indice) => ({
    // O id inclui o índice do lote: com duas aulas de mesma aula_slug, quem
    // colide é a POSSE dos outputs, não o id — a rejeição vem do escalonador
    // como ownership-collision (PAR-02), não como duplicate-task-id.
    id: `f7:${indice}:${aula.aula_slug}`,
    fase: 'F7',
    deps: [],
    recurso: 'llm',
    cacheKey: `f7:${aula.aula_slug}:${aula.snapshot.budgetHash}`,
    outputs: [caminhoDraftAula(aula.aula_slug), caminhoDraftDesafio(aula.aula_slug)],
    writes: [],
    status: 'pending',
  }));
}

/**
 * O executor da onda: chama `autorizarAula` para a aula da tarefa, grava os
 * DOIS drafts (aula + desafio) quando validado, grava NADA quando blocked
 * (estado registrado, sem aula parcial), e registra falha estruturada quando
 * um defeito determinístico derruba a aula. O estado por aula é o canal de
 * resultado da tarefa (o WaveResult só expõe status/tasks — não expõe
 * TaskRunResult por tarefa; o mapa fechado aqui é a memória do run).
 */
function montarExecutor(
  deps: DepsDaOndaAutoria,
  baseDir: string,
  batch: readonly DossieDeAula[],
  estados: Map<string, EstadoDeAulaNaOnda>,
): Executor {
  const aulasPorId = new Map(batch.map((aula, indice) => [`f7:${indice}:${aula.aula_slug}`, aula]));

  return async (task: Task): Promise<{ ok: boolean; error?: string }> => {
    const aula = aulasPorId.get(task.id);
    if (!aula) {
      return { ok: false, error: `aula desconhecida para a tarefa "${task.id}" — configuração da onda quebrada` };
    }
    const ref = aula.aula_slug;
    try {
      const resultado = await autorizarAula(
        { llm: deps.llm, prover: deps.prover, scheduler: { limiters: deps.limiters } },
        aula,
      );
      if (resultado.status === 'blocked') {
        // §7.1 R3: blocked é RESULTADO VÁLIDO da chamada — a aula inteira fica
        // marcada blocked e NENHUM arquivo de draft é gravado (sem aula parcial).
        estados.set(ref, {
          aula_slug: ref,
          status: 'blocked',
          etapa: resultado.etapa,
          faltantes: resultado.faltantes,
          motivo: resultado.motivo,
          budgetHash: resultado.budgetHash,
        });
        return { ok: true };
      }
      const relAula = caminhoDraftAula(ref);
      const relDesafio = caminhoDraftDesafio(ref);
      await deps.escreverArquivo(path.join(baseDir, relAula), `${JSON.stringify(resultado.draftAula, null, 2)}\n`);
      await deps.escreverArquivo(path.join(baseDir, relDesafio), `${JSON.stringify(resultado.desafio, null, 2)}\n`);
      estados.set(ref, {
        aula_slug: ref,
        status: 'validado',
        caminhos: { draftAula: relAula, draftDesafio: relDesafio },
        budgetHash: resultado.budgetHash,
      });
      return { ok: true };
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      estados.set(ref, { aula_slug: ref, status: 'falhou', erro: mensagem });
      return { ok: false, error: mensagem };
    }
  };
}

/**
 * A PORTA DE ENTRADA do pacote de AUTORIA (F7+F8): roda a autoria de TODAS as
 * aulas dadas com escalonamento REAL (runWave do P-02). A posse é validada
 * GLOBALMENTE sobre a UNIÃO dos outputs de TODOS os batches ANTES de rodar
 * QUALQUER aula: colisão de draft entre ondas DIFERENTES também é erro
 * estruturado (`ownership-collision` nomeando o caminho e as duas aulas) e
 * nada roda — a validação por onda do scheduler (validateWave) só enxerga UMA
 * onda por vez e deixaria a 2ª onda SOBRESCREVER o draft da 1ª por escrita;
 * ela continua rodando como DEFESA EM PROFUNDIDADE. Ondas > teto DIVIDIDAS em
 * batches de ≤15 (nunca truncadas); limiters de pools separados (P-27). O
 * `execute` é construído AQUI a partir de `autorizarAula` — os testes de
 * estado interno injetam transportes fakes em vez de scheduler.
 */
export async function runOndaDeAutoria(
  deps: DepsDaOndaAutoria,
  aulas: readonly DossieDeAula[],
): Promise<ResultadoOndaDeAutoria> {
  if (aulas.length === 0) {
    return { estados: [], ondas: 0, executadas: [], waves: [], warnings: [] };
  }
  const teto = deps.tetoOnda ?? TETO_ONDA_AUTORIA;
  const baseDir = deps.baseDir ?? '';

  const batches = dividirEmBatches(aulas, teto);
  const configs: WaveConfig[] = batches.map((batch) => ({ tasks: tarefasDaOnda(batch), reducers: {} }));

  // POSSE GLOBAL — validada sobre a UNIÃO dos outputs de TODOS os batches,
  // ANTES de rodar qualquer aula (PAR-02, §4.1). O validateWave do scheduler
  // valida UMA onda por vez: uma colisão entre ondas DIFERENTES (a mesma
  // aula_slug no batch 1 e no batch 2) passaria por ele e a 2ª onda
  // SOBRESCREVERIA os drafts da 1ª por escrita — este passe cobre o run
  // INTEIRO: mesmo caminho em dois batches = erro estruturado nomeando o
  // caminho e as duas aulas; NADA roda.
  const tarefasDoRun = configs.flatMap((config) => config.tasks);
  const slugDaTarefa = new Map<string, string>();
  for (const batch of batches) {
    batch.forEach((aula, indice) => slugDaTarefa.set(`f7:${indice}:${aula.aula_slug}`, aula.aula_slug));
  }
  const colisoesGlobais = collectOutputCollisions(tarefasDoRun);
  for (const [caminho, tarefas] of colisoesGlobais) {
    const [a, b] = tarefas;
    const slugA = slugDaTarefa.get(a) ?? a;
    const slugB = slugDaTarefa.get(b) ?? b;
    throw new SchedulerError(
      'ownership-collision',
      `colisão de posse entre batches do run: o caminho "${caminho}" é declarado em outputs pelas aulas "${slugA}" (tarefa ${a}) e "${slugB}" (tarefa ${b}) — o run INTEIRO foi REJEITADO antes de rodar qualquer aula (PAR-02, §4.1: a validação por onda do scheduler não alcança colisões entre ondas diferentes)`,
      { caminho, tarefas, aulas: [slugA, slugB] },
    );
  }

  // DEFESA EM PROFUNDIDADE — a validação POR ONDA do scheduler (tamanho da
  // onda, ids duplicados, posse intra-onda, dependências, ciclos, reducers)
  // continua rodando batch a batch antes de qualquer execução.
  for (const config of configs) {
    const validacao = validateWave(config);
    if (validacao.errors.length > 0) throw validacao.errors[0];
  }

  const estadosPorAula = new Map<string, EstadoDeAulaNaOnda>();
  const waves: WaveResult[] = [];
  const warnings: string[] = [];

  // Batches SEQUENCIAIS: cada um é um runWave do P-02 (≤15 tarefas dentro do
  // limite recomendado), com o MESMO executor por aula.
  for (let i = 0; i < batches.length; i += 1) {
    const execute = montarExecutor(deps, baseDir, batches[i], estadosPorAula);
    const wave = await runWave(configs[i], { limiters: deps.limiters, execute });
    waves.push(wave);
    warnings.push(...wave.warnings);
  }

  // Estados na ORDEM das aulas de entrada; fallback defensivo (tarefa que
  // não executou seria defeito do run — registra falha em vez de silêncio).
  const estados = aulas.map(
    (aula) =>
      estadosPorAula.get(aula.aula_slug) ?? {
        aula_slug: aula.aula_slug,
        status: 'falhou' as const,
        erro: 'aula não executou na onda (defeito do run)',
      },
  );
  const executadas: string[] = [];
  for (const wave of waves) executadas.push(...wave.executed);

  return { estados, ondas: waves.length, executadas, waves, warnings };
}