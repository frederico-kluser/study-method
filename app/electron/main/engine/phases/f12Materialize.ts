/**
 * app/electron/main/engine/phases/f12Materialize.ts — F12 · MATERIALIZAÇÃO E
 * INTEGRAÇÃO — o INTEGRADOR ÚNICO da árvore final de produto + o gate G-FINAL
 * (pacote P-21 / plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §4 (F12 ▮ integrador único
 * · G-FINAL), §5.2 (I12–I17), §5.4 (as quatro provas), §10 (campos aditivos do
 * produto; `schemaVersion` NUNCA bumpado — comparado por igualdade estrita em 4
 * lugares; o loader faz cast, não pick) e §11 (proibições: os comandos de
 * scaffold do CLI fazem read-modify-write dos arquivos-pai e dezenas de agentes
 * em paralelo produzem corrida com perda SILENCIOSA — por isso a F12 NUNCA
 * chama o CLI).
 *
 * O QUE ESTE ARQUIVO É:
 *   - `materializarTrilha` — o ESCRITOR ÚNICO da árvore final
 *     (resources/tracks/<slug>/). Recebe o DOSSIÊ DE TRILHA (os drafts tipados
 *     LessonDraft/ChallengeDraft do pacote P-04 — a INTERFACE CONTRATADA da
 *     autoria F7/F8/P-17 — mais o orçamento F4 CONGELADO), deriva o produto
 *     pela TABELA DE DERIVAÇÃO declarada abaixo e escreve a árvore inteira de
 *     uma vez, serialmente, SEM nenhum paralelismo interno.
 *   - `escreverArvore` — a primitiva de escrita exposTA para o teste de
 *     concorrência: recebe a árvore inteira e grava arquivo a arquivo em
 *     laço ESTRITAMENTE SEQUENCIAL (`for … await` — nunca `Promise.all`),
 *     cada arquivo via `escreverAtomico` (D-WRITE). Duas chamadas
 *     concorrentes da MESMA função não perdem arquivo: o conteúdo é
 *     determinístico (mesmo dossiê → mesma árvore) e a escrita de cada
 *     arquivo é atômica — a integridade final é a da árvore completa.
 *   - `gFinal` — o GATE FINAL: (a) o loader (`loadTrack`) carrega a trilha
 *     materializada SEM nenhuma issue; (b) TODO desafio (aula, módulo e
 *     proficiência) passa nas QUATRO provas de execução (§5.4 — via o
 *     verificador injetável `verificarDesafio`, default = provas reais de
 *     `engine/exec/proofs.ts` + harness; os TESTES injetam fake — zero
 *     processos na suíte); (c) o audit (`auditTrack`) da trilha NOVA sai LIMPO
 *     (zero violações — a trilha gerada respeita o orçamento e I12–I17). Os
 *     gates de lint/teste/build do APP não são re-rodados aqui — são do
 *     orquestrador (A-P21).
 *
 * POR QUE EXISTE A TABELA DE DERIVAÇÃO (documentação normativa do mapeamento
 * draft → produto, determinística):
 *
 *   lesson.summary            ← draft.objective.enunciado
 *   theory[].title            ← primeira linha elegível do markdown (prosa) ou
 *                                o id humanizado (código); regra em
 *                                `tituloDaSecao`
 *   theory[].code             ← seção do draft com `tag` não-vazia: o MESMO
 *                                markdown vira `code {language: tag, code}`
 *                                (o audit A4 verifica; §5.3: bloco cercado com
 *                                tag é código)
 *   challenge.title           ← conceito humanizado (regra em
 *                                `tituloDeDesafio`; desafios de módulo e
 *                                proficiência ganham prefixo declarado)
 *   difficulty (lesson/challenge) ← PROVISÓRIO (declarado no código): rampa
 *                                linear 1..5 pela posição global da aula no
 *                                orçamento F4; desafio = dificuldade da aula;
 *                                desafio de módulo = dificuldade da última
 *                                aula do módulo; proficiência = 5. DÉBITO DE
 *                                PRODUTO: a medição por tempo resolvido (docs
 *                                §10) substitui isto — NENHUM gate lê
 *                                difficulty (proibido: docs §11).
 *   lesson.prerequisites      ← índice REVERSO introduces×aula derivado do
 *                                orçamento F4 (NÃO do grafo ao vivo): para
 *                                cada construção da ENTRADA da aula
 *                                (budget_entrada, receptive ∪ productive), a
 *                                aula que a introduziu (unicidade de origem,
 *                                I3); só aulas ANTERIORES existem por
 *                                construção (carry cumulativo). Axioma (sem
 *                                origem) não gera pré-requisito.
 *   lesson.concepts           ← conceitos dos desafios da aula, na ordem de
 *                                aparição, sem duplicatas (I16: todo
 *                                challenge.concept ∈ lesson.concepts por
 *                                construção).
 *   lesson.sources            ← draft.research[]: URL absoluta http(s) →
 *                                {title: último segmento do path humanizado
 *                                (hostname se o path for vazio), url,
 *                                description: a própria URL — perda zero de
 *                                informação}. Item que não é URL = ERRO
 *                                (fail-closed: nada é descartado em silêncio).
 *   campos §10                ← cópia VERBATIM do draft como EXTRAS do JSON
 *                                de produto (object, introduces,
 *                                introducesTerms, foraDeEscopo, eiClass, role,
 *                                targetAtom, notionalMachineDelta, budgetHash,
 *                                budgetVersion, status, research na aula;
 *                                outputChannel, requires, requirements,
 *                                notRequired, subgoals, scenarios, taskSkill,
 *                                supportLevel, surfaceDomain,
 *                                solutionAlternates, wrongSolutions no
 *                                desafio). O loader faz cast, não pick (docs
 *                                §10) — os extras sobrevivem ao round-trip.
 *
 * ÍNDICES reconstruídos dos DIRETÓRIOS (INV-07): track.json.modules,
 * module.json.lessons e lesson.json.challenges são DERIVADOS aqui da
 * associação draft→módulo/aula do dossiê — NENHUM draft carrega índice; nenhum
 * artefato da engine acumula a lista de filhos. A ordem canônica das aulas é o
 * ARRAY `orcamento.aulas` da F4 (ordem topológica materializada no freeze); a
 * ordem dos módulos é o campo `order` (I14).
 *
 * INV-08: `schemaVersion` de TODO arquivo é `TRACK_SCHEMA_VERSION` (1).
 * `DossieDeTrilha.schemaVersion` é a ÚNICA entrada: ausente → 1; qualquer
 * valor ≠ 1 → MaterializeError('SCHEMA_VERSION_BUMP') — o integrador NUNCA
 * escreve um schemaVersion diferente do trackTypes.
 *
 * ESCRITA SÓ EM DESTINO NOVO: `materializarTrilha` valida que (a) o slug não é
 * `nodejs-do-zero` (SLUG_PROIBIDO — trilha legada intocável), (b) o destino
 * não já é uma trilha (track.json presente → DESTINO_COLIDE), (c) quando
 * `deps.raizDeTrilhas` é declarada, o slug não colide com nenhuma trilha
 * existente ali (DESTINO_COLIDE).
 *
 * VALIDAÇÃO PRÉ-ESCRITA (fail-closed): a árvore completa é montada EM MEMÓRIA
 * e validada com os MESMOS validadores do produto (validateTrackSource/
 * ModuleSource/LessonSource/ChallengeSource de content/trackTypes) ANTES de
 * qualquer escrita — um problema de forma NÃO deixa NENHUM arquivo na árvore.
 *
 * IMPORTAÇÕES: este módulo é o único da engine que importa `content/*`
 * (trackTypes: formato e validadores de produto; trackLoader/audit: os gates
 * do G-FINAL) e `engine/exec/*` (as provas de §5.4). NÃO importa nenhuma outra
 * phase (o orçamento F4 entra como dado tipado; o hash da fatia usa as
 * PRIMITIVAS do ledger — uma cópia local da fórmula de `f5Freeze`, declarada
 * abaixo).
 */

import { spawn } from 'node:child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { z } from 'zod';

import { listTrackSlugs, loadTrack, TrackLoadError } from '../../content/trackLoader';
import {
  CHALLENGE_FILE,
  LESSON_FILE,
  MODULE_FILE,
  PROFICIENCY_FILE,
  SLUG_RE,
  TRACK_FILE,
  TRACK_SCHEMA_VERSION,
  type TrackChallengeSource,
  type TrackLessonSource,
  type TrackModuleSource,
  type TrackSource,
  type TrackSourceLink,
  type TrackValidationIssue,
  validateChallengeSource,
  validateLessonSource,
  validateModuleSource,
  validateTrackSource,
} from '../../content/trackTypes';
import { auditTrack } from '../audit';
import { cleanupDir, prepareIsolatedDir } from '../exec/harness';
import type { ExecFn } from '../exec/proofs';
import { verifyChallengeProofs } from '../exec/proofs';
import type { ProofEnv } from '../exec/proofs';
import { canonicalizarJson, sha256Hex } from '../runtime/ledger';
import { type EscreverArquivoFn, escreverArquivoPadrao, escreverAtomico } from '../runtime/runState';
import { ChallengeDraftSchema, LessonDraftSchema } from '../schemas/artifacts';

// ---------------------------------------------------------------------------
// Tipos do dossiê — a INTERFACE CONTRATADA da autoria (P-04/P-17)
// ---------------------------------------------------------------------------

/** Draft de aula — o schema do pacote P-04 (INTERFACE CONTRATADA da F7). */
export type LessonDraft = z.infer<typeof LessonDraftSchema>;

/** Draft de desafio — o schema do pacote P-04 (INTERFACE CONTRATADA da F8). */
export type ChallengeDraft = z.infer<typeof ChallengeDraftSchema>;

/** Um módulo do dossiê (a ordem vem do F3/OrderSchema; I14 valida unicidade). */
export interface ModuloDoDossie {
  slug: string;
  title: string;
  order: number;
}

/** Uma aula do dossiê: o draft + o módulo a que pertence (F7: 1 agente = 1 aula). */
export interface AulaDoDossie {
  modulo: string;
  draft: LessonDraft;
}

/**
 * Um desafio do dossiê (F8). `ref` é a chave canônica `<moduloSlug>/<aulaSlug>`
 * para desafio de AULA, `<moduloSlug>` sozinho para DESAFIO DO MÓDULO (rodada
 * 9 — modules/<slug>/challenges/<slug>/challenge.json) e 'proficiencia' para
 * o desafio de proficiência (raiz).
 */
export interface DesafioDoDossie {
  ref: string;
  draft: ChallengeDraft;
}

/** Shape estrutural do orçamento F4 congelado (sem importar a F4 — dado). */
export interface FaixasOrcamentoF12 {
  receptive: string[];
  productive: string[];
}

export interface AulaOrcamentoF12 {
  ref: string;
  entryConstructs: string[];
  budget_entrada: FaixasOrcamentoF12;
  budget_saida: FaixasOrcamentoF12;
  introduces: FaixasOrcamentoF12;
  matrix: Array<{ construcao: string; estado: string }>;
  element_count: number;
  tetos: {
    construcoes_produtivas_novas: number;
    elementos_interagindo: number;
    elementos_nao_interativos: number;
    tempo_resolucao_s: number;
  };
}

export interface OrcamentoF12 {
  aulas: AulaOrcamentoF12[];
  fonte: 'declared' | 'inferred';
  politica_de_harness: 'receptive-seed' | 'none';
  hash: string;
}

/**
 * O DOSSIÊ DE TRILHA — a entrada única do integrador. NENHUM campo aqui é um
 * índice agregado (INV-07): módulos/aulas/desafios carregam só a própria
 * identidade; as listas de filhos (`modules`/`lessons`/`challenges`) são
 * RECONSTRUÍDAS dos diretórios pelo integrador (ver cabeçalho).
 */
export interface DossieDeTrilha {
  /** INV-08: ausente → TRACK_SCHEMA_VERSION; qualquer valor ≠ 1 → erro. */
  schemaVersion?: number;
  slug: string;
  title: string;
  description: string;
  language: 'pt-BR' | 'en';
  domain: 'programming' | 'math';
  /** critérios de entrada (entryCriteria) — ausente = trilha de senso iniciante. */
  entryCriteria?: string[];
  modulos: ModuloDoDossie[];
  aulas: AulaDoDossie[];
  desafios: DesafioDoDossie[];
  /** desafio de proficiência (cobre TUDO — proficiency.json na raiz). */
  proficiencia?: ChallengeDraft;
  /** o orçamento F4 CONGELADO — fonte da ordem canônica, dos pré-requisitos e da dificuldade provisória. */
  orcamento: OrcamentoF12;
}

// ---------------------------------------------------------------------------
// Erros estruturados (fail-closed — INV-03)
// ---------------------------------------------------------------------------

export type MaterializeErrorCode =
  | 'SLUG_INVALIDO' // slug fora do SLUG_RE (kebab-case)
  | 'SLUG_PROIBIDO' // 'nodejs-do-zero' — trilha legada intocável
  | 'DESTINO_COLIDE' // o destino já é uma trilha (track.json) ou o slug já existe na raiz
  | 'SCHEMA_VERSION_BUMP' // INV-08: schemaVersion ≠ TRACK_SCHEMA_VERSION
  | 'ORCAMENTO_AUSENTE' // dossiê sem orçamento F4
  | 'ORCAMENTO_INVALIDO' // hash do orçamento não bate com o conteúdo (adultério)
  | 'AULA_SEM_ORCAMENTO' // aula do dossiê sem entrada no orçamento
  | 'ORCAMENTO_SEM_AULA' // entrada do orçamento sem draft de aula
  | 'BUDGET_HASH_DIVERGENTE' // draft.budgetHash ≠ hash da fatia da aula no orçamento
  | 'REF_INVALIDA' // ref de desafio não casa com módulo nem aula conhecidos
  | 'DUPLICADO' // slug de aula repetido, ordem de módulo repetida, desafio de módulo duplicado, slug de desafio repetido na aula
  | 'RESEARCH_NAO_URL' // research[] com item que não é URL absoluta http(s)
  | 'ARVORE_INVALIDA' // a árvore montada viola os validadores do produto (issues anexadas)
  | 'GFINAL_DESTINO_AUSENTE' // gFinal contra um diretório que não é trilha
  | 'IO_ERRO'; // falha de disco

export class MaterializeError extends Error {
  readonly code: MaterializeErrorCode;
  /** issues de validação de produto (presentes em ARVORE_INVALIDA). */
  readonly issues: TrackValidationIssue[];

  constructor(code: MaterializeErrorCode, mensagem: string, issues: TrackValidationIssue[] = []) {
    super(mensagem);
    this.name = 'MaterializeError';
    this.code = code;
    this.issues = issues;
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

// ---------------------------------------------------------------------------
// TABELA DE DERIVAÇÃO — regras determinísticas draft → produto (documentadas
// no cabeçalho; implementadas abaixo)
// ---------------------------------------------------------------------------

/** `id`/`conceito` snake_case/kebab → título humano (`funcoes-e-escopo` → `Funcoes e escopo`). */
function humanizarId(id: string): string {
  const palavra = id.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (palavra === '') return id;
  return palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

/** dificuldade PROVISÓRIA (1..5): rampa linear pela posição global no orçamento. */
function dificuldadeProvisoria(posicaoGlobal: number, totalAulas: number): number {
  const total = Math.max(totalAulas, 1);
  const d = Math.ceil(((posicaoGlobal + 1) * 5) / total);
  return Math.min(5, Math.max(1, d));
}

/**
 * Título da seção de teoria (TABELA DE DERIVAÇÃO): a PRIMEIRA LINHA não-vazia
 * do markdown quando ela é prosa legível (≤ 100 chars e sem marcador de
 * markdown), senão o id humanizado. Seções de CÓDIGO (tag não-vazia) usam
 * sempre o id humanizado — a primeira linha de código não é um bom título.
 */
function tituloDaSecao(secao: { id: string; markdown: string; tag: string }): string {
  if (secao.tag !== '') return humanizarId(secao.id);
  const primeiraLinha = secao.markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (
    primeiraLinha !== undefined &&
    primeiraLinha.length <= 100 &&
    !/^#{1,6}\s/.test(primeiraLinha) &&
    !/^(`{3,}|~{3,})/.test(primeiraLinha) &&
    !/^[-*+]\s/.test(primeiraLinha) &&
    !/^\d+[.)]\s/.test(primeiraLinha)
  ) {
    return primeiraLinha;
  }
  return humanizarId(secao.id);
}

/**
 * Uma fonte (TABELA DE DERIVAÇÃO): item de `research[]` vira
 * {title, url, description}. Fail-closed: item que não é URL absoluta
 * http(s) é ERRO — nada é descartado em silêncio.
 */
function fonteDePesquisa(item: string, indice: number): TrackSourceLink {
  let url: URL;
  try {
    url = new URL(item);
  } catch {
    throw new MaterializeError(
      'RESEARCH_NAO_URL',
      `research[${indice}] não é uma URL absoluta: ${JSON.stringify(item)} — ` +
        `sources[] exige title+url obrigatórios; o integrador não inventa fonte nem descarta item em silêncio`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MaterializeError(
      'RESEARCH_NAO_URL',
      `research[${indice}] não é uma URL http(s): ${JSON.stringify(item)} — o title é derivado do path; protocolo fora de http(s) não é fonte`,
    );
  }
  const ultimoSegmento = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const base = ultimoSegmento.replace(/\.(html?|md)$/i, '');
  const title = base !== '' ? humanizarId(base) : url.hostname;
  return { title, url: item, description: item };
}

/** Título de desafio (TABELA DE DERIVAÇÃO): conceito humanizado; módulo/proficiência ganham prefixo. */
function tituloDeDesafio(conceito: string, kind: 'aula' | 'modulo' | 'proficiencia'): string {
  const humano = humanizarId(conceito);
  if (kind === 'modulo') return `Desafio do módulo — ${humano}`;
  if (kind === 'proficiencia') return `Proficiência — ${humano}`;
  return humano;
}

// ---------------------------------------------------------------------------
// Árvore em memória — montagem (PURA, zero IO) + validação pré-escrita
// ---------------------------------------------------------------------------

/** Um arquivo da árvore final: caminho (absoluto OU relativo ao destino) + conteúdo serializado. */
export interface ArquivoArvore {
  caminho: string;
  conteudo: string;
}

/** fatia que carimba a aula (mesma fórmula de f5Freeze.derivarSnapshots — por isso os budgetHash batem). */
function fatiaDaAula(aula: AulaOrcamentoF12): Record<string, unknown> {
  return {
    ref: aula.ref,
    budget_entrada: aula.budget_entrada,
    budget_saida: aula.budget_saida,
    introduces: aula.introduces,
  };
}

/** sha256 do orçamento canonicalizado SEM o próprio campo hash (primitiva local do ledger — A-P10-2). */
function hashDoOrcamentoLocal(orcamento: OrcamentoF12): string {
  const semHash = { ...orcamento } as Record<string, unknown>;
  delete semHash['hash'];
  return sha256Hex(canonicalizarJson(semHash));
}

/**
 * uma aula de produto (lesson.json) — TABELA DE DERIVAÇÃO (ver cabeçalho).
 * O tipo de retorno é `TrackLessonSource & Record<string, unknown>` DE
 * PROPÓSITO: os campos §10 não existem nos tipos do produto — o loader faz
 * cast, não pick (docs §10), e os extras sobrevivem ao round-trip.
 */
function montarAulaDeProduto(
  entrada: {
    aula: AulaDoDossie;
    posicaoGlobal: number;
    totalAulas: number;
    conceitos: string[];
    prerequisitos: string[];
    desafios: DesafioDoDossie[];
  },
): TrackLessonSource & Record<string, unknown> {
  const { aula, posicaoGlobal, totalAulas, conceitos, prerequisitos, desafios } = entrada;
  const draftsSecoes = aula.draft.theory.map((s) => ({ ...s }));
  const theory: TrackLessonSource['theory'] = draftsSecoes.map((secao) => {
    const base = { id: secao.id, title: tituloDaSecao(secao), markdown: secao.markdown };
    if (secao.tag === '') return base;
    return { ...base, code: { language: secao.tag, code: secao.markdown } };
  });
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: aula.draft.slug,
    title: aula.draft.title,
    summary: aula.draft.objective.enunciado, // TABELA DE DERIVAÇÃO
    difficulty: dificuldadeProvisoria(posicaoGlobal, totalAulas), // PROVISÓRIO (ver cabeçalho)
    concepts: conceitos,
    prerequisites: prerequisitos,
    theory,
    sources: aula.draft.research.map(fonteDePesquisa),
    challenges: desafios.map((d) => d.draft.slug),
    // campos §10 como EXTRAS (o loader faz cast, não pick — docs §10)
    objective: aula.draft.objective,
    introduces: aula.draft.introduces,
    introducesTerms: aula.draft.introducesTerms,
    foraDeEscopo: aula.draft.foraDeEscopo,
    eiClass: aula.draft.eiClass,
    role: aula.draft.role,
    targetAtom: aula.draft.targetAtom,
    notionalMachineDelta: aula.draft.notionalMachineDelta,
    budgetHash: aula.draft.budgetHash,
    budgetVersion: aula.draft.budgetVersion,
    status: aula.draft.status,
    research: aula.draft.research,
  };
}

/** um desafio de produto (challenge.json / proficiency.json) — TABELA DE DERIVAÇÃO. */
function montarDesafioDeProduto(
  draft: ChallengeDraft,
  ctx: { kind: 'aula' | 'modulo' | 'proficiencia'; dificuldade: number },
): TrackChallengeSource & Record<string, unknown> {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: draft.slug,
    title: tituloDeDesafio(draft.conceito, ctx.kind),
    concept: draft.conceito,
    difficulty: ctx.dificuldade,
    language: 'nodejs',
    statement: draft.statement,
    starterCode: draft.starterCode,
    testsCode: draft.testsCode,
    solutionCode: draft.solutionCode,
    expectedTestCount: draft.expectedTestCount,
    // campos §10 como EXTRAS (o loader faz cast, não pick — docs §10)
    outputChannel: draft.outputChannel,
    requires: draft.requires,
    requirements: draft.requirements,
    notRequired: draft.notRequired,
    subgoals: draft.subgoals,
    scenarios: draft.scenarios,
    taskSkill: draft.taskSkill,
    supportLevel: draft.supportLevel,
    surfaceDomain: draft.surfaceDomain,
    solutionAlternates: draft.solutionAlternates,
    wrongSolutions: draft.wrongSolutions,
  };
}

/**
 * MONTA a árvore final inteira EM MEMÓRIA (função PURA, só lança
 * MaterializeError): arquivo por arquivo, caminho absoluto + conteúdo
 * `JSON.stringify(obj, null, 2) + '\n'` (2 espaços, newline final, UTF-8/LF —
 * o mesmo formato dos arquivos atuais de resources/tracks).
 *
 * Inclui TODAS as validações de integridade do dossiê (fail-closed, antes de
 * qualquer escrita): shape dos drafts (schemas P-04), bijection drafts ↔
 * orçamento, orders únicos, refs de desafio, budgetHash de cada aula, URLs de
 * pesquisa — e a validação FINAL da árvore com os validadores do produto.
 */
export function montarArvoreDeProduto(drafts: DossieDeTrilha, destino: string): ArquivoArvore[] {
  // ── INV-08: schemaVersion do dossiê (única entrada) ───────────────────────
  const schemaVersion = drafts.schemaVersion ?? TRACK_SCHEMA_VERSION;
  if (schemaVersion !== TRACK_SCHEMA_VERSION) {
    throw new MaterializeError(
      'SCHEMA_VERSION_BUMP',
      `INV-08: schemaVersion do dossiê é ${schemaVersion}, esperado ${TRACK_SCHEMA_VERSION} — ` +
        `o schemaVersion é comparado por igualdade estrita em 4 lugares (docs §10/§11) e o integrador NUNCA escreve outro valor`,
    );
  }

  // ── orçamento F4 congelado: presença + integridade de hash ────────────────
  if (!Array.isArray(drafts.orcamento.aulas) || drafts.orcamento.aulas.length === 0) {
    throw new MaterializeError('ORCAMENTO_AUSENTE', 'o dossiê precisa do orçamento F4 congelado (aulas ≥ 1) — pré-requisitos e ordem canônica derivam dele');
  }
  if (drafts.orcamento.hash !== hashDoOrcamentoLocal(drafts.orcamento)) {
    throw new MaterializeError(
      'ORCAMENTO_INVALIDO',
      `o campo hash do orçamento do dossiê não bate com o conteúdo — orçamento adulterado não materializa`,
    );
  }

  // ── drafts validados pelos schemas P-04 (INTERFACE CONTRATADA) ─────────────
  const issuesPre: TrackValidationIssue[] = [];
  drafts.aulas.forEach((aula, i) => {
    const check = LessonDraftSchema.safeParse(aula.draft);
    if (!check.success) {
      issuesPre.push({ file: 'aulas[]', message: `aula[${i}] viola o LessonDraftSchema (P-04): ${check.error.message}` });
    }
  });
  drafts.desafios.forEach((d, i) => {
    const check = ChallengeDraftSchema.safeParse(d.draft);
    if (!check.success) {
      issuesPre.push({ file: 'desafios[]', message: `desafio[${i}] (ref ${d.ref}) viola o ChallengeDraftSchema (P-04): ${check.error.message}` });
    }
  });
  if (drafts.proficiencia !== undefined) {
    const check = ChallengeDraftSchema.safeParse(drafts.proficiencia);
    if (!check.success) {
      issuesPre.push({ file: 'proficiencia', message: `proficiência viola o ChallengeDraftSchema (P-04): ${check.error.message}` });
    }
  }
  if (issuesPre.length > 0) throw new MaterializeError('ARVORE_INVALIDA', 'drafts fora do contrato P-04 — nada é escrito', issuesPre);

  // ── módulos: ordem única (I14) e slug válido ───────────────────────────────
  const modulosPorSlug = new Map<string, ModuloDoDossie>();
  const ordersVistos = new Set<number>();
  for (const mod of drafts.modulos) {
    if (!SLUG_RE.test(mod.slug)) {
      throw new MaterializeError('SLUG_INVALIDO', `slug de módulo inválido: ${JSON.stringify(mod.slug)} (kebab-case ASCII, ex.: 'modulo-1')`);
    }
    if (modulosPorSlug.has(mod.slug)) throw new MaterializeError('DUPLICADO', `módulo duplicado no dossiê: ${mod.slug}`);
    if (ordersVistos.has(mod.order)) {
      throw new MaterializeError('DUPLICADO', `order ${mod.order} repetido — a ordem pedagógica dos módulos fica indefinida (I14)`);
    }
    ordersVistos.add(mod.order);
    modulosPorSlug.set(mod.slug, mod);
  }

  // ── aulas: módulo conhecido, slug válido e GLOBALMENTE único (I12) ────────
  const refsDosDrafts = new Set<string>();
  const slugsDeAula = new Map<string, string>(); // slug → ref (I12)
  for (const aula of drafts.aulas) {
    if (!modulosPorSlug.has(aula.modulo)) {
      throw new MaterializeError('REF_INVALIDA', `aula '${aula.draft.slug}' aponta para módulo desconhecido: ${JSON.stringify(aula.modulo)}`);
    }
    if (!SLUG_RE.test(aula.draft.slug)) {
      throw new MaterializeError('SLUG_INVALIDO', `slug de aula inválido: ${JSON.stringify(aula.draft.slug)} (kebab-case ASCII)`);
    }
    const ref = `${aula.modulo}/${aula.draft.slug}`;
    if (refsDosDrafts.has(ref)) throw new MaterializeError('DUPLICADO', `aula duplicada no dossiê: ${ref}`);
    const anterior = slugsDeAula.get(aula.draft.slug);
    if (anterior !== undefined) {
      throw new MaterializeError('DUPLICADO', `slug de aula repetido (I12): '${aula.draft.slug}' em '${anterior}' e ${ref} — o slug é chave GLOBAL de progresso`);
    }
    slugsDeAula.set(aula.draft.slug, ref);
    refsDosDrafts.add(ref);
  }

  // ── bijection aulas ↔ orçamento (o freeze é a fonte da ordem — P3) ────────
  const ordemPorRef = new Map<string, number>();
  const orcamentoRefs = new Set<string>();
  drafts.orcamento.aulas.forEach((aula, i) => {
    ordemPorRef.set(aula.ref, i);
    orcamentoRefs.add(aula.ref);
  });
  for (const ref of orcamentoRefs) {
    if (!refsDosDrafts.has(ref)) throw new MaterializeError('ORCAMENTO_SEM_AULA', `orçamento tem aula sem draft: '${ref}' — o freeze congela AULAS que a autoria precisa entregar`);
  }
  for (const ref of refsDosDrafts) {
    const ordem = ordemPorRef.get(ref);
    if (ordem === undefined) {
      throw new MaterializeError('AULA_SEM_ORCAMENTO', `aula '${ref}' do dossiê não existe no orçamento F4 — toda aula precisa de entrada congelada`);
    }
  }

  // ── desafios: ref conhecida; ≤1 desafio de módulo por módulo; slug único dentro da aula ──
  const desafiosDeModulo = new Map<string, DesafioDoDossie>(); // modulo -> desafio
  const desafiosPorAula = new Map<string, DesafioDoDossie[]>(); // ref -> lista
  for (const d of drafts.desafios) {
    if (!SLUG_RE.test(d.draft.slug)) {
      throw new MaterializeError('SLUG_INVALIDO', `slug de desafio inválido: ${JSON.stringify(d.draft.slug)} (kebab-case ASCII)`);
    }
    if (modulosPorSlug.has(d.ref)) {
      const anterior = desafiosDeModulo.get(d.ref);
      if (anterior !== undefined) {
        throw new MaterializeError('DUPLICADO', `módulo ${JSON.stringify(d.ref)} tem dois desafios de módulo ('${anterior.draft.slug}' e '${d.draft.slug}') — no máximo 1`);
      }
      desafiosDeModulo.set(d.ref, d);
      continue;
    }
    if (refsDosDrafts.has(d.ref)) {
      const lista = desafiosPorAula.get(d.ref) ?? [];
      if (lista.some((x) => x.draft.slug === d.draft.slug)) {
        throw new MaterializeError('DUPLICADO', `slug de desafio repetido na aula '${d.ref}': '${d.draft.slug}' — o arquivo sobrescreveria a si mesmo`);
      }
      lista.push(d);
      desafiosPorAula.set(d.ref, lista);
      continue;
    }
    throw new MaterializeError('REF_INVALIDA', `desafio '${d.draft.slug}' com ref desconhecida: ${JSON.stringify(d.ref)} (esperado '<modulo>' ou '<modulo>/<aula>')`);
  }

  // ── índice REVERSO introduces×aula (aula que introduz cada construção) ─────
  const origemDosConceitos = new Map<string, string>();
  for (const aula of drafts.orcamento.aulas) {
    for (const construcao of [...aula.introduces.receptive, ...aula.introduces.productive]) {
      if (!origemDosConceitos.has(construcao)) origemDosConceitos.set(construcao, aula.ref); // I3: primeira origem vence
    }
  }
  const aulaOrcPorRef = new Map(drafts.orcamento.aulas.map((a) => [a.ref, a]));

  // ── aulas de produto, na ORDEM CANÔNICA do orçamento ───────────────────────
  const aulasOrdenadas = [...drafts.aulas].sort((a, b) => {
    const pa = ordemPorRef.get(`${a.modulo}/${a.draft.slug}`) ?? Number.MAX_SAFE_INTEGER;
    const pb = ordemPorRef.get(`${b.modulo}/${b.draft.slug}`) ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
  const totalAulas = drafts.orcamento.aulas.length;

  const aulasDeProduto = new Map<string, TrackLessonSource>(); // ref -> lesson.json
  const dificuldadeDasAulas = new Map<string, number>(); // ref -> difficulty provisória
  for (const aula of aulasOrdenadas) {
    const ref = `${aula.modulo}/${aula.draft.slug}`;
    const posicaoGlobal = ordemPorRef.get(ref) ?? 0;

    // TABELA DE DERIVAÇÃO — pré-requisitos via índice reverso sobre a ENTRADA.
    const aulaOrc = aulaOrcPorRef.get(ref);
    if (aulaOrc === undefined) {
      // inalcançável (bijective refs já validada), mas fail-closed nunca indexa cego.
      throw new MaterializeError('AULA_SEM_ORCAMENTO', `aula '${ref}' sem entrada no orçamento em tempo de montagem`);
    }
    const prereqRefs = new Set<string>();
    for (const faixa of [aulaOrc.budget_entrada.receptive, aulaOrc.budget_entrada.productive]) {
      for (const construcao of faixa) {
        const origem = origemDosConceitos.get(construcao);
        if (origem !== undefined && origem !== ref) prereqRefs.add(origem);
      }
    }
    const prerequisitos = [...prereqRefs]
      .sort((a, b) => (ordemPorRef.get(a) ?? Number.MAX_SAFE_INTEGER) - (ordemPorRef.get(b) ?? Number.MAX_SAFE_INTEGER))
      .map((r) => r.slice(r.indexOf('/') + 1));

    // TABELA DE DERIVAÇÃO — concepts = conceitos dos desafios da aula (I16 por construção).
    const desafiosDaAula = desafiosPorAula.get(ref) ?? [];
    const conceitos: string[] = [];
    for (const d of desafiosDaAula) {
      if (!conceitos.includes(d.draft.conceito)) conceitos.push(d.draft.conceito);
    }

    // TABELA DE DERIVAÇÃO — budgetHash do draft confere com a fatia congelada.
    const hashEsperado = sha256Hex(canonicalizarJson(fatiaDaAula(aulaOrc)));
    if (aula.draft.budgetHash !== hashEsperado) {
      throw new MaterializeError(
        'BUDGET_HASH_DIVERGENTE',
        `aula '${ref}': draft.budgetHash (${aula.draft.budgetHash}) não bate com a fatia do orçamento congelado (${hashEsperado}) — ` +
          `o autor recebeu o snapshot de outra versão do orçamento; re-congelar antes de materializar`,
      );
    }

    const dificuldade = dificuldadeProvisoria(posicaoGlobal, totalAulas);
    dificuldadeDasAulas.set(ref, dificuldade);
    aulasDeProduto.set(
      ref,
      montarAulaDeProduto({
        aula,
        posicaoGlobal,
        totalAulas,
        conceitos,
        prerequisitos,
        desafios: desafiosDaAula,
      }),
    );
  }

  // ── módulos de produto: ordem dos módulos por `order`; aulas na ordem do orçamento ──
  const modulosOrdenados = [...drafts.modulos].sort((a, b) => a.order - b.order);
  const desafiosDeModuloFinal = new Map<string, { draft: ChallengeDraft; dificuldade: number }>();
  const modulosDeProduto: TrackModuleSource[] = modulosOrdenados.map((mod) => {
    const lessons = drafts.orcamento.aulas
      .filter((a) => a.ref.startsWith(`${mod.slug}/`))
      .map((a) => a.ref.slice(mod.slug.length + 1));
    const produto: TrackModuleSource = {
      schemaVersion: TRACK_SCHEMA_VERSION,
      slug: mod.slug,
      title: mod.title,
      order: mod.order,
      lessons,
    };
    const desafioModulo = desafiosDeModulo.get(mod.slug);
    if (desafioModulo !== undefined) {
      produto.challenge = desafioModulo.draft.slug;
      // dificuldade do desafio do MÓDULO = dificuldade da ÚLTIMA aula do módulo (TABELA).
      const ultimaAula = lessons[lessons.length - 1] ?? '';
      const refUltima = `${mod.slug}/${ultimaAula}`;
      const dificuldadeModulo = refUltima !== undefined && dificuldadeDasAulas.has(refUltima)
        ? (dificuldadeDasAulas.get(refUltima) as number)
        : 1;
      desafiosDeModuloFinal.set(mod.slug, { draft: desafioModulo.draft, dificuldade: dificuldadeModulo });
    }
    return produto;
  });

  // ── desafios de produto (todos os kinds) — chave: caminho relativo ────────
  const desafiosDeProduto = new Map<string, TrackChallengeSource>();

  // ── montagem dos arquivos (caminho absoluto) ───────────────────────────────
  const arquivos: ArquivoArvore[] = [];
  const pushJson = (relativo: string, objeto: unknown): void => {
    arquivos.push({ caminho: path.join(destino, relativo), conteudo: `${JSON.stringify(objeto, null, 2)}\n` });
  };

  // track.json
  const track: TrackSource = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: drafts.slug,
    title: drafts.title,
    description: drafts.description,
    language: drafts.language,
    domain: drafts.domain,
    modules: modulosOrdenados.map((m) => m.slug),
    ...(drafts.entryCriteria !== undefined && drafts.entryCriteria.length > 0 ? { entryCriteria: drafts.entryCriteria } : {}),
  };
  pushJson(TRACK_FILE, track);

  // módulos + aulas + desafios
  for (const mod of modulosOrdenados) {
    const modulo = modulosDeProduto.find((m) => m.slug === mod.slug) as TrackModuleSource;
    pushJson(path.join('modules', mod.slug, MODULE_FILE), modulo);

    const desafioModulo = desafiosDeModuloFinal.get(mod.slug);
    if (desafioModulo !== undefined) {
      const ch = montarDesafioDeProduto(desafioModulo.draft, { kind: 'modulo', dificuldade: desafioModulo.dificuldade });
      desafiosDeProduto.set(path.join('modules', mod.slug, 'challenges', ch.slug, CHALLENGE_FILE), ch);
    }

    for (const lessonSlug of modulo.lessons) {
      const ref = `${mod.slug}/${lessonSlug}`;
      const aula = aulasDeProduto.get(ref) as TrackLessonSource;
      pushJson(path.join('modules', mod.slug, 'lessons', lessonSlug, LESSON_FILE), aula);

      for (const d of desafiosPorAula.get(ref) ?? []) {
        const ch = montarDesafioDeProduto(d.draft, {
          kind: 'aula',
          dificuldade: dificuldadeDasAulas.get(ref) ?? 1,
        });
        desafiosDeProduto.set(path.join('modules', mod.slug, 'lessons', lessonSlug, 'challenges', ch.slug, CHALLENGE_FILE), ch);
      }
    }
  }

  // proficiência (raiz)
  if (drafts.proficiencia !== undefined) {
    const ch = montarDesafioDeProduto(drafts.proficiencia, { kind: 'proficiencia', dificuldade: 5 });
    desafiosDeProduto.set(path.join(PROFICIENCY_FILE), ch);
  }

  // desafios por último (depois dos pais — ordem de escrita serial qualquer)
  for (const [relativo, objeto] of desafiosDeProduto) pushJson(relativo, objeto);

  // ── VALIDAÇÃO PRÉ-ESCRITA com os validadores do produto (fail-closed) ──────
  const issues: TrackValidationIssue[] = [];
  issues.push(...validateTrackSource(track, TRACK_FILE));
  for (const mod of modulosOrdenados) {
    const modulo = modulosDeProduto.find((m) => m.slug === mod.slug) as TrackModuleSource;
    issues.push(...validateModuleSource(modulo, path.join('modules', mod.slug, MODULE_FILE)));
    for (const lessonSlug of modulo.lessons) {
      const ref = `${mod.slug}/${lessonSlug}`;
      const aula = aulasDeProduto.get(ref) as TrackLessonSource;
      issues.push(...validateLessonSource(aula, path.join('modules', mod.slug, 'lessons', lessonSlug, LESSON_FILE)));
    }
  }
  for (const [relativo, objeto] of desafiosDeProduto) {
    issues.push(...validateChallengeSource(objeto, relativo));
  }
  if (issues.length > 0) {
    const detalhes = issues.map((i) => `${i.file}: ${i.message}`).join(' | ');
    throw new MaterializeError('ARVORE_INVALIDA', `a árvore montada viola o formato de produto (${issues.length} issue(s)): ${detalhes}`, issues);
  }

  return arquivos;
}

// ---------------------------------------------------------------------------
// ESCRITA SERIAL — o integrador é o ÚNICO escritor da árvore final (A-P21-2)
// ---------------------------------------------------------------------------

/**
 * A PRIMITIVA de escrita da árvore final: ESTRITAMENTE SEQUENCIAL (laço
 * `for … await` — a API NÃO expõe escrita paralela; nunca `Promise.all` aqui).
 * Recebe a árvore INTEIRA (caminho + conteúdo por arquivo) e grava arquivo a
 * arquivo via `escreverAtomico` (D-WRITE — tmp + fsync + rename). `caminho`
 * de cada arquivo pode ser ABSOLUTO ou RELATIVO a `destino` — ambos resolvem
 * para o mesmo alvo. Dois integradores chamando a MESMA função sobre o MESMO
 * destino não perdem arquivo: o conteúdo é determinístico (mesmo dossiê →
 * mesmos bytes) e cada arquivo termina com um dos dois conteúdos idênticos —
 * a integridade final é a da árvore completa.
 */
export async function escreverArvore(
  destino: string,
  arquivos: ArquivoArvore[],
  escreverArquivo: EscreverArquivoFn = escreverArquivoPadrao,
): Promise<void> {
  for (const arquivo of arquivos) {
    const alvo = path.isAbsolute(arquivo.caminho) ? arquivo.caminho : path.join(destino, arquivo.caminho);
    await fsp.mkdir(path.dirname(alvo), { recursive: true });
    await escreverAtomico(alvo, arquivo.conteudo, escreverArquivo);
  }
}

// ---------------------------------------------------------------------------
// O INTEGRADOR ÚNICO — valida e escreve a árvore final
// ---------------------------------------------------------------------------

export interface DepsMaterializar {
  /**
   * Raiz do diretório de trilhas (resources/tracks) — quando declarada, o
   * slug do dossiê é conferido contra as trilhas EXISTENTES ali (colisão =
   * erro, DESTINO_COLIDE). Ausente → só a checagem do próprio destino.
   */
  raizDeTrilhas?: string;
  /** escrita injetável — testes usam dirs temp e spy de concorrência. */
  escreverArquivo?: EscreverArquivoFn;
  /** loader injetável do G-FINAL — default: o real (loadTrack). */
  loader?: typeof loadTrack;
  /** verificador das QUATRO PROVAS do G-FINAL — default: provas reais; TESTES injetam fake. */
  verificarDesafio?: VerificarDesafioFn;
}

export interface ResultadoMaterializacao {
  slug: string;
  /** destino absoluto da trilha escrita. */
  destino: string;
  arquivos: number;
}

/**
 * F12 ▮ — o INTEGRADOR ÚNICO da árvore final. Valida o dossiê e a colisão de
 * destino, monta a árvore inteira em memória (validada com os validadores do
 * produto ANTES de qualquer escrita), e só então escreve arquivo a arquivo,
 * serialmente, sem nunca tocar nos comandos de scaffold do CLI (proibido —
 * docs §11: read-modify-write dos arquivos-pai com corrida e perda silenciosa).
 */
export async function materializarTrilha(
  deps: DepsMaterializar,
  drafts: DossieDeTrilha,
  destino: string,
): Promise<ResultadoMaterializacao> {
  const alvo = path.resolve(destino);

  // slug do dossiê: válido e NUNCA a trilha legada.
  if (!SLUG_RE.test(drafts.slug)) {
    throw new MaterializeError('SLUG_INVALIDO', `slug de trilha inválido: ${JSON.stringify(drafts.slug)} (kebab-case ASCII)`);
  }
  if (drafts.slug === 'nodejs-do-zero') {
    throw new MaterializeError(
      'SLUG_PROIBIDO',
      `'nodejs-do-zero' é a trilha legada intocável — o integrador só escreve slugs NOVOS em resources/tracks/`,
    );
  }

  // destino já é uma trilha?
  try {
    await fsp.access(path.join(alvo, TRACK_FILE));
    throw new MaterializeError('DESTINO_COLIDE', `o destino ${alvo} já é uma trilha (${TRACK_FILE} presente) — escrever por cima é proibido`);
  } catch (erro) {
    if (erro instanceof MaterializeError) throw erro;
    // ENOENT — segue (destino livre).
  }

  // colisão com trilhas EXISTENTES na raiz declarada.
  if (deps.raizDeTrilhas !== undefined) {
    const raiz = path.resolve(deps.raizDeTrilhas);
    try {
      const existentes = await listTrackSlugs(raiz);
      if (existentes.includes(drafts.slug)) {
        throw new MaterializeError(
          'DESTINO_COLIDE',
          `slug '${drafts.slug}' já existe em ${raiz} — o integrador escreve SOMENTE slugs novos (colisão com trilha existente)`,
        );
      }
    } catch (erro) {
      if (erro instanceof MaterializeError) throw erro;
      // SÓ raiz AUSENTE (ENOENT) = sem trilhas ainda — não é colisão. Qualquer
      // OUTRO erro de IO (EACCES/EIO/EMFILE…) é RELANÇADO (fail-closed): uma
      // falha transitória de leitura não pode desativar em silêncio a
      // verificação de colisão DESTINO_COLIDE.
      if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') throw erro;
    }
  }

  // monta (validações inclusas — fail-closed) e escreve TUDO de uma vez.
  const arquivos = montarArvoreDeProduto(drafts, alvo);
  await escreverArvore(alvo, arquivos, deps.escreverArquivo);
  return { slug: drafts.slug, destino: alvo, arquivos: arquivos.length };
}

// ---------------------------------------------------------------------------
// G-FINAL — o gate determinístico final (a árvore materializada é a verdade)
// ---------------------------------------------------------------------------

/** Um desafio a provar nas QUATRO provas (contrato do verificador injetável). */
export interface DesafioAProvar {
  /** `'<modulo>/<aula>'`, `'<modulo>'` (desafio do módulo) ou `'proficiencia'`. */
  ref: string;
  kind: 'aula' | 'modulo' | 'proficiencia';
  solutionCode: string;
  starterCode: string;
  testsCode: string;
  expectedTestCount: number;
  /** ADITIVO multi-arquivo (rodada 9): arquivos da solução e do starter; quando presentes, os codes de topo são ignorados pelas provas. */
  solutionFiles?: { path: string; code: string }[];
  starterFiles?: { path: string; code: string }[];
}

export interface VereditoProva {
  valid: boolean;
  falhas: string[];
}

/** O verificador das QUATRO PROVAS (§5.4) — injetável (TESTES: fake; produção: provas reais). */
export type VerificarDesafioFn = (desafio: DesafioAProvar) => Promise<VereditoProva>;

/** spawn mínimo de `node --test` (ExecFn do contrato A-P07-2) — o executor real das provas. */
function criarExecNodeTest(): ExecFn {
  return (dir, args, opts) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: dir,
        env: opts?.env ?? process.env,
        timeout: opts?.timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => {
        stdout += String(d);
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += String(d);
      });
      child.on('error', (erro) => resolve({ exitCode: 1, stdout, stderr: `spawn falhou: ${mensagemDe(erro)}` }));
      // signal ≠ null (timeout/spawn matou) → 137, a convenção timeout-ou-OOM das provas.
      child.on('close', (code, signal) => resolve({ exitCode: signal !== null ? 137 : (code ?? 1), stdout, stderr }));
    });
}

/**
 * O verificador REAL (default do G-FINAL): as QUATRO PROVAS de `exec/proofs.ts`
 * com o harness de `exec/harness.ts` + spawn mínimo de node. P-31 (F9) pode
 * re-apontar o default para a própria implementação — o contrato injetável
 * permanece o mesmo.
 */
export async function verificarDesafioReal(desafio: DesafioAProvar): Promise<VereditoProva> {
  const baseDir = path.join(os.tmpdir(), 'trilha-gfinal');
  const env: ProofEnv = {
    exec: criarExecNodeTest(),
    prepare: (side) => prepareIsolatedDir(baseDir, side),
    cleanup: cleanupDir,
  };
  const veredito = await verifyChallengeProofs(
    {
      solutionCode: desafio.solutionCode,
      starterCode: desafio.starterCode,
      testsCode: desafio.testsCode,
      expectedTestCount: desafio.expectedTestCount,
      solutionFiles: desafio.solutionFiles,
      starterFiles: desafio.starterFiles,
      timeoutMs: 30_000,
    },
    env,
  );
  return {
    valid: veredito.valid,
    falhas: veredito.failures.map((f) => `${f.proof}${f.reason !== undefined ? `: ${f.reason}` : ''}`),
  };
}

export interface ResultadoGFinal {
  ok: boolean;
  slug: string;
  /** (a) o loader carregou a trilha materializada sem NENHUMA issue. */
  load: { ok: boolean; issues: string[] };
  /** (c) o audit saiu LIMPO (zero violações; parseErrors também derrubam). */
  audit: { ok: boolean; violacoes: string[] };
  /** (b) todo desafio passou nas QUATRO provas. */
  provas: { ok: boolean; falhas: string[] };
  contagens: { aulas: number; desafios: number; temProficiencia: boolean };
}

/**
 * G-FINAL — o gate determinístico FINAL sobre a trilha MATERIALIZADA:
 *   (a) loadTrack SEM issues (TrackLoadError → falha nomeando cada issue);
 *   (b) TODO desafio (aula, módulo, proficiência) passa nas QUATRO provas via
 *       o verificador injetável (testes: fake — zero processos);
 *   (c) auditTrack LIMPO (zero violações — a trilha gerada respeita o
 *       orçamento e I12–I17). `parseErrors` da teoria também derrubam
 *       (fail-closed: bloco js que não parseia é erro — docs §5.3).
 * Os gates de lint/teste/build do APP são do orquestrador, não re-rodados
 * aqui (A-P21). Falha de USO (diretório que não é trilha) lança
 * MaterializeError; falha de GATE retorna `{ok:false}` estruturado.
 */
export async function gFinal(deps: DepsMaterializar, destino: string): Promise<ResultadoGFinal> {
  const alvo = path.resolve(destino);
  try {
    await fsp.access(path.join(alvo, TRACK_FILE));
  } catch {
    throw new MaterializeError('GFINAL_DESTINO_AUSENTE', `gFinal exige uma trilha materializada em ${alvo} (${TRACK_FILE} ausente)`);
  }

  const loader = deps.loader ?? loadTrack;
  const verificarDesafio = deps.verificarDesafio ?? verificarDesafioReal;

  // (a) o loader — a árvore final tem de carregar SEM nenhuma issue.
  let track;
  try {
    track = await loader(alvo);
  } catch (erro) {
    if (erro instanceof TrackLoadError) {
      return {
        ok: false,
        slug: '',
        load: { ok: false, issues: erro.issues.map((i) => `${i.file}: ${i.message}`) },
        audit: { ok: true, violacoes: [] },
        provas: { ok: true, falhas: [] },
        contagens: { aulas: 0, desafios: 0, temProficiencia: false },
      };
    }
    throw new MaterializeError('IO_ERRO', `falha ao carregar ${alvo}: ${mensagemDe(erro)}`);
  }

  // coleta todos os desafios (aula + módulo + proficiência). Para desafios
  // MULTI-ARQUIVO (files[] presente), as provas recebem os arquivos — os
  // starter/solution de topo são ignorados pelas provas (rodada 9).
  const desafios: DesafioAProvar[] = [];
  const arquivosDe = (ch: TrackChallengeSource, lado: 'solutionCode' | 'starterCode'): { path: string; code: string }[] | undefined => {
    if (!Array.isArray(ch.files) || ch.files.length === 0) return undefined;
    return ch.files.map((f) => ({ path: f.path, code: f[lado] ?? '' }));
  };
  const comoDesafioAProvar = (ch: TrackChallengeSource, ref: string, kind: 'aula' | 'modulo' | 'proficiencia'): DesafioAProvar => ({
    ref,
    kind,
    solutionCode: ch.solutionCode ?? '',
    starterCode: ch.starterCode ?? '',
    testsCode: ch.testsCode,
    expectedTestCount: ch.expectedTestCount,
    solutionFiles: arquivosDe(ch, 'solutionCode'),
    starterFiles: arquivosDe(ch, 'starterCode'),
  });
  for (const mod of track.modules) {
    if (mod.challenge !== null) {
      desafios.push(comoDesafioAProvar(mod.challenge, mod.meta.slug, 'modulo'));
    }
    for (const lesson of mod.lessons) {
      for (const ch of lesson.challenges) {
        desafios.push(comoDesafioAProvar(ch, `${mod.meta.slug}/${lesson.meta.slug}`, 'aula'));
      }
    }
  }
  if (track.proficiency !== null) {
    desafios.push(comoDesafioAProvar(track.proficiency, 'proficiencia', 'proficiencia'));
  }

  // (b) as QUATRO PROVAS de todo desafio.
  const falhasProvas: string[] = [];
  for (const desafio of desafios) {
    const veredito = await verificarDesafio(desafio);
    if (!veredito.valid) {
      falhasProvas.push(`desafio ${desafio.ref}: ${veredito.falhas.join('; ')}`);
    }
  }

  // (c) o audit — zero violações de ERRO + teoria parseável (fail-closed).
  // A bateria A13–A16 (rodada 12) roda aqui como no G-AUDIT; avisos (D4,
  // valores explicados em prosa; aula de revisão sem incremento no A14a) NÃO
  // reprovam a materialização — erro reprova.
  const report = auditTrack(track);
  const violacoes = report.violations
    .filter((v) => (v.severidade ?? 'erro') !== 'aviso')
    .map(
      (v) => `${v.regra} ${v.arquivo}${v.campo !== 'lesson' && v.campo !== 'module' && v.campo !== 'track' ? `#${v.campo}` : ''}: ${v.mensagem}`,
    );
  for (const parse of report.parseErrors) {
    violacoes.push(`PARSE teoria ${parse.ref} linha ${parse.line}: ${parse.message}`);
  }

  const loadOk = true;
  const auditOk = violacoes.length === 0;
  const provasOk = falhasProvas.length === 0;
  return {
    ok: loadOk && auditOk && provasOk,
    slug: track.root.slug,
    load: { ok: loadOk, issues: [] },
    audit: { ok: auditOk, violacoes },
    provas: { ok: provasOk, falhas: falhasProvas },
    contagens: { aulas: track.modules.reduce((n, m) => n + m.lessons.length, 0), desafios: desafios.length, temProficiencia: track.proficiency !== null },
  };
}