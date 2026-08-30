/**
 * app/electron/main/engine/runtime/runState.ts — o ESTADO DO RUN e a máquina de
 * fases da engine de trilhas (pacote P-03, onda 1 — `docs/16-engine-de-trilha.md`
 * §4 e §9.3).
 *
 * Problema real: uma geração de trilha (F0..F12) é longa — horas de LLM, várias
 * ondas de autoria — e VAI ser interrompida: máquina dorme, processo morre,
 * cota acaba. Este módulo torna a interrupção barata: o punhado de bytes que
 * decide "de onde retomo" vive em `run.json`, é validado campo a campo, e uma
 * transição de fase só existe na ordem fixa do documento normativo (§4).
 *
 * O QUE VIVE AQUI:
 *   - o layout de disco da engine (constantes declaradas — nada além);
 *   - a máquina de fases F0..F12 (ordem fixa, `docs/16-engine-de-trilha.md` §4);
 *   - validação FAIL-CLOSED de `run.json` (A-P03-3): parse que falha OU campo
 *     inválido produz `RunStateError` estruturado (código + mensagem + campo),
 *     NUNCA um estado silenciosamente vazio. §9.3: a engine falha fechada.
 *   - a primitiva de escrita atômica compartilhada (tmp + fsync + rename) —
 *     ver decisão D-WRITE abaixo.
 *
 * O QUE NÃO VIVE AQUI (ver `ledger.ts`): a cadeia de hash append-only e a
 * telemetria. `runState.ts` NÃO importa `ledger.ts` — a dependência é de uma
 * via só (`ledger.ts` → `runState.ts`), sem ciclos.
 *
 * DECISÃO D-WRITE (escrita atômica — declarada, `ledger.ts` a reutiliza):
 *   toda persistência é REWRITE-ATÔMICO: escrever `.<nome>.tmp.<pid>.<rand>`,
 *   fsync do tmp, `rename()` por cima do alvo, depois fsync do diretório
 *   (best-effort: plataformas sem suporte a fsync de diretório retornam
 *   EINVAL/ENOTSUP/EBADF e são ignorados; qualquer outro erro propaga, pois a
 *   engine falha fechada). `rename()` é atômico no POSIX (APFS/ext4): uma
 *   interrupção no meio deixa OU o arquivo antigo íntegro OU o novo completo —
 *   nunca um arquivo pela metade. O custo O(n) por gravação é aceitável para
 *   as ordens de grandeza da engine (dezenas de milhares de linhas por run).
 *
 * DECISÃO D-ESCRITOR-UNICO (mutex in-process — compartilhada com o ledger):
 *   a escrita é READ-MODIFY-WRITE do arquivo inteiro (`salvarRun` reescreve
 *   run.json; `Ledger.anexar` relê a cauda e reescreve ledger.jsonl) — dois
 *   escritores CONCORRENTES no mesmo arquivo leem o mesmo estado N, ambos
 *   gravam N+1 e o último rename vence: a gravação anterior é PERDIDA EM
 *   SILÊNCIO (proibido, `docs/16-engine-de-trilha.md` §11). `escreverAtomico`
 *   sozinho não resolve isso — ele só garante que CADA gravação individual
 *   seja atômica, não que as gravações sejam serializadas. O mutex
 *   `comMutex(chave, fn)` (cadeia de promessas por caminho, zero dependência
 *   nova) serializa as seções críticas DENTRO do mesmo processo. PRÉ-CONDIÇÃO
 *   DECLARADA: escritor único POR PROCESSO e por diretório de run — a engine
 *   roda UM gerador por run. Escrita CROSS-PROCESS (dois processos gravando o
 *   mesmo diretório de run) NÃO é coberta e é proibida pela arquitetura.
 *
 * DECISÃO D-ETAPA (`modelosPorEtapa`): nesta onda, ETAPA = FASE (mapa
 * fase→modelo). As ondas 2-4 podem refinar `EtapaId` (ex.: por aula) — a
 * validação passa a aceitar o superconjunto; a decisão é consciente e registrada.
 * O mapa é preenchido LAZY (uma fase só ganha modelo quando o roteador decide)
 * — por isso chaves ausentes são válidas, mas chave desconhecida ou valor vazio
 * é ERRO (A-P03-3, INV-03).
 *
 * CONTRATO DE RETOMADA (para as ondas 2-4): o executor pergunta
 * `primeiraFasePendente(run)`; se o status dessa fase é `pendente`, chama
 * `iniciarFase`; se já é `em_andamento` (interrompido NO MEIO da fase), executa
 * direto. Nunca re-chamar `iniciarFase` numa fase que já começou — é erro
 * estruturado (TRANSICAO_INVALIDA), não um no-op silencioso.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Layout de disco (declarado, não tocado)
// ---------------------------------------------------------------------------

/** Nome do arquivo de estado do run. */
export const RUN_FILENAME = 'run.json';
/** Nome do ledger append-only encadeado por hash. */
export const LEDGER_FILENAME = 'ledger.jsonl';
/** Nome do arquivo de telemetria (usage/latência/contagem). */
export const TELEMETRY_FILENAME = 'telemetry.jsonl';

/**
 * Raiz de trabalho da engine — onde run.json/ledger.jsonl/telemetry.jsonl e os
 * artefatos intermediários de F0..F12 ficam. É INJETÁVEL: o chamador passa o
 * diretório (nos testes, sempre um diretório temporário criado e limpo pelo
 * próprio teste). Esta constante declara o layout em relação à raiz do app.
 */
export const CONTENT_SRC_DIR = 'app/content-src';

/**
 * Produto final da engine — onde F12 materializa a trilha pronta. NINGUÉM
 * escreve aqui fora do integrador de F12; este pacote só declara a constante.
 */
export const TRACKS_OUTPUT_DIR = 'app/resources/tracks';

/** Raiz de trabalho de uma trilha: `app/content-src/<slug>/`. */
export function raizTrabalhoSlug(slug: string): string {
  return path.join(CONTENT_SRC_DIR, slug);
}

/** Diretório do produto final: `app/resources/tracks/<slug>/`. */
export function dirProdutoFinal(slug: string): string {
  return path.join(TRACKS_OUTPUT_DIR, slug);
}

// ---------------------------------------------------------------------------
// Fases (docs/16-engine-de-trilha.md §4) e erros estruturados
// ---------------------------------------------------------------------------

/**
 * Ordem FIXA das fases — a tabela de §4, na ordem da coluna "Fase". É a única
 * ordem aceita pela máquina: uma transição aponta sempre da fase N para N+1.
 */
export const FASES_ORDEM = [
  'F0',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
] as const;

/** Identidade de fase (união literal derivada de FASES_ORDEM). */
export type FaseId = (typeof FASES_ORDEM)[number];

/**
 * Identidade de ETAPA no mapa `modelosPorEtapa`. Nesta onda, etapa = fase
 * (D-ETAPA); ondas 2-4 podem refinar. A validação de `modelosPorEtapa` aceita
 * exatamente chaves de `FASES_ORDEM`.
 */
export type EtapaId = FaseId;

/** Status de uma fase na máquina. */
export type StatusFase = 'pendente' | 'em_andamento' | 'done';

/** Códigos de erro estruturado do runState (INV-03, A-P03-3). */
export type RunStateErrorCode =
  | 'RUN_JSON_AUSENTE' // run.json não existe — explícito, nunca null silencioso
  | 'RUN_JSON_CORROMPIDO' // arquivo não parseia como JSON
  | 'RUN_JSON_INVALIDO' // parseia, mas algum campo viola o schema
  | 'IO_ERRO' // falha de disco ao ler/gravar
  | 'SLUG_INVALIDO' // slug fora do padrão seguro (defesa de caminho)
  | 'FASE_INVALIDA' // valor que não é uma FaseId
  | 'TRANSICAO_INVALIDA'; // transição fora da ordem fixa ou do status atual

/**
 * Erro estruturado do estado do run. TODO caminho de falha do runState passa
 * por aqui — com código, mensagem e (quando aplicável) o campo ofensor.
 * Nunca um `null` retornado em silêncio (A-P03-3).
 */
export class RunStateError extends Error {
  readonly code: RunStateErrorCode;
  /** Campo do schema que violou (quando o erro é de shape). */
  readonly campo?: string;

  constructor(code: RunStateErrorCode, mensagem: string, campo?: string) {
    super(mensagem);
    this.name = 'RunStateError';
    this.code = code;
    this.campo = campo;
  }
}

// ---------------------------------------------------------------------------
// Schema do run.json — TODO campo obrigatório (regra dura 3 do plano)
// ---------------------------------------------------------------------------

export interface RunState {
  /** Versão do schema de run.json — comparada por igualdade estrita. */
  schemaVersion: 1;
  /** Identificador do run (UUID v4, gerado em criarRun). */
  runId: string;
  /** Slug da trilha em geração (padrão seguro — defesa de caminho). */
  slug: string;
  /** Momento de criação, ISO-8601. */
  criadoEm: string;
  /** Momento da ÚLTIMA PERSISTÊNCIA, ISO-8601 (estampado por salvarRun). */
  atualizadoEm: string;
  /**
   * Fase atual da máquina: a primeira fase NÃO concluída (pendente ou
   * em_andamento) durante o run; 'F12' num run concluído.
   */
  faseAtual: FaseId;
  /** Status de cada fase da ordem fixa. */
  fases: Record<FaseId, StatusFase>;
  /** Hash sha256 (hex, 64) do orçamento congelado — derivado em F5 (P-10). */
  budgetHash: string;
  /** Hash sha256 (hex, 64) do grafo congelado — derivado em F5 (P-10). */
  graphHash: string;
  /**
   * Mapa etapa→modelo (D-ETAPA). Chaves válidas: FASES_ORDEM. O mapa é
   * PREENCHIDO LAZY — uma fase só ganha modelo quando o roteador decide — por
   * isso o tipo é PARCIAL (subset de chaves ok); chave desconhecida ou valor
   * vazio continua sendo ERRO na validação.
   */
  modelosPorEtapa: Partial<Record<EtapaId, string>>;
  /** Versão dos prompts canônicos usados no run (docs/16 §7). */
  promptVersao: string;
  /** Versão do catálogo de ações/construções usado no run. */
  catalogoVersao: string;
}

/** Entrada de criarRun — todos os campos externos obrigatórios. */
export interface CriarRunInput {
  slug: string;
  budgetHash: string;
  graphHash: string;
  modelosPorEtapa: Partial<Record<EtapaId, string>>;
  promptVersao: string;
  catalogoVersao: string;
}

/** Padrão seguro de slug de trilha — sem `.` nem `/`: impossível escapar do diretório. */
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** sha256 em hex — 64 caracteres [0-9a-f]. */
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** É um slug seguro de trilha? (exportado: F5 e o CLI revalidam a mesma regra). */
export function isSlugValido(valor: unknown): valor is string {
  return typeof valor === 'string' && SLUG_RE.test(valor);
}

/** É um hash sha256 em hex (64 chars)? (exportado: F5 e o CLI revalidam). */
export function isHashSha256(valor: unknown): valor is string {
  return typeof valor === 'string' && SHA256_HEX_RE.test(valor);
}

/** É uma FaseId da ordem fixa? */
export function isFaseId(valor: unknown): valor is FaseId {
  return typeof valor === 'string' && (FASES_ORDEM as readonly string[]).includes(valor);
}

/** É um status de fase válido? */
function isStatusFase(valor: unknown): valor is StatusFase {
  return valor === 'pendente' || valor === 'em_andamento' || valor === 'done';
}

/** É data ISO-8601 parseável? (frouxo por design — ver cabeçalho do ledger). */
function isDataISO(valor: unknown): valor is string {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function invalido(campo: string, motivo: string): RunStateError {
  return new RunStateError('RUN_JSON_INVALIDO', `run.json inválido em '${campo}': ${motivo}`, campo);
}

// ---------------------------------------------------------------------------
// Validação do schema (use em lerRun E em salvarRun — nunca grava inválido)
// ---------------------------------------------------------------------------

function validarStringObrigatoria(o: Record<string, unknown>, campo: string): string {
  const v = o[campo];
  if (typeof v !== 'string' || v.trim() === '') {
    throw invalido(campo, `esperado string não vazia; recebido ${JSON.stringify(v)}`);
  }
  return v;
}

function validarFases(raw: unknown): Record<FaseId, StatusFase> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalido('fases', 'esperado objeto com uma chave por fase');
  }
  const obj = raw as Record<string, unknown>;
  const chaves = Object.keys(obj);
  // Igualdade de CONJUNTO (ordenação lexicográfica de 'F10' < 'F2' tornaria uma
  // comparação por string.join enganosa): mesmas 13 chaves, sem sobra e sem falta.
  if (chaves.length !== FASES_ORDEM.length || !FASES_ORDEM.every((f) => chaves.includes(f))) {
    throw invalido(
      'fases',
      `chaves esperadas (${FASES_ORDEM.join(',')}); recebidas ${chaves.join(',') || '(vazio)'}`,
    );
  }
  const out = {} as Record<FaseId, StatusFase>;
  for (const fase of FASES_ORDEM) {
    const status = obj[fase];
    if (!isStatusFase(status)) {
      throw invalido('fases', `status inválido para ${fase}: ${JSON.stringify(status)}`);
    }
    out[fase] = status;
  }

  // Invariantes da máquina: (1) o conjunto `done` é um PREFIXO da ordem fixa —
  // fase concluída com fase anterior não concluída é estado inconsistente;
  // (2) no máximo uma fase `em_andamento`, e ela é a primeira não concluída.
  let fimDoPrefixoDone = 0;
  while (fimDoPrefixoDone < FASES_ORDEM.length && out[FASES_ORDEM[fimDoPrefixoDone]] === 'done') {
    fimDoPrefixoDone += 1;
  }
  for (let i = fimDoPrefixoDone; i < FASES_ORDEM.length; i += 1) {
    if (out[FASES_ORDEM[i]] === 'done') {
      throw invalido(
        'fases',
        `fase ${FASES_ORDEM[i]} concluída sem a fase anterior ${FASES_ORDEM[i - 1]} concluída — o conjunto done não é um prefixo`,
      );
    }
  }
  const pendente = fimDoPrefixoDone < FASES_ORDEM.length ? FASES_ORDEM[fimDoPrefixoDone] : null;
  for (let i = fimDoPrefixoDone; i < FASES_ORDEM.length; i += 1) {
    const status = out[FASES_ORDEM[i]];
    if (status === 'em_andamento' && FASES_ORDEM[i] !== pendente) {
      throw invalido(
        'fases',
        `fase ${FASES_ORDEM[i]} em_andamento sem ser a primeira não concluída (${pendente})`,
      );
    }
  }
  return out;
}

function validarModelos(raw: unknown): Partial<Record<EtapaId, string>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalido('modelosPorEtapa', 'esperado objeto etapa→modelo');
  }
  const out: Partial<Record<EtapaId, string>> = {};
  for (const [etapa, modelo] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFaseId(etapa)) {
      throw invalido('modelosPorEtapa', `etapa desconhecida: ${JSON.stringify(etapa)} (esperado ∈ FASES_ORDEM)`);
    }
    if (typeof modelo !== 'string' || modelo.trim() === '') {
      throw invalido('modelosPorEtapa', `modelo vazio/inválido para ${etapa}: ${JSON.stringify(modelo)}`);
    }
    out[etapa] = modelo;
  }
  return out;
}

/**
 * Valida uma `unknown` (resultado de JSON.parse ou um objeto em memória) como
 * `RunState` COMPLETO. Falha = `RunStateError` estruturado. Retorna o estado
 * HIGIENIZADO (fases na ordem canônica de FASES_ORDEM), nunca o objeto cru.
 */
export function validarRun(raw: unknown): RunState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalido('run', 'raiz não é um objeto');
  }
  const o = raw as Record<string, unknown>;

  if (o['schemaVersion'] !== 1) {
    throw invalido('schemaVersion', `esperado 1; recebido ${JSON.stringify(o['schemaVersion'])}`);
  }
  const runId = validarStringObrigatoria(o, 'runId');
  const slug = validarStringObrigatoria(o, 'slug');
  if (!isSlugValido(slug)) {
    throw invalido('slug', `padrão seguro violado: ${JSON.stringify(slug)} (sem '.', '..', '/' ou espaço)`);
  }
  const criadoEm = validarStringObrigatoria(o, 'criadoEm');
  if (!isDataISO(criadoEm)) throw invalido('criadoEm', `não é data ISO-8601: ${JSON.stringify(criadoEm)}`);
  const atualizadoEm = validarStringObrigatoria(o, 'atualizadoEm');
  if (!isDataISO(atualizadoEm)) throw invalido('atualizadoEm', `não é data ISO-8601: ${JSON.stringify(atualizadoEm)}`);

  const fases = validarFases(o['fases']);

  // faseAtual deve ser a primeira fase não concluída (ou F12 num run concluído).
  const primeiraPendente = FASES_ORDEM.find((f) => fases[f] !== 'done') ?? null;
  const faseAtual = o['faseAtual'];
  if (!isFaseId(faseAtual)) throw invalido('faseAtual', `não é uma fase: ${JSON.stringify(faseAtual)}`);
  if (primeiraPendente !== null) {
    if (faseAtual !== primeiraPendente) {
      throw invalido(
        'faseAtual',
        `primeira fase não concluída é ${primeiraPendente}, mas faseAtual é ${faseAtual}`,
      );
    }
  } else if (faseAtual !== 'F12') {
    throw invalido('faseAtual', 'run concluído deve ter faseAtual F12');
  }

  const budgetHash = validarStringObrigatoria(o, 'budgetHash');
  if (!isHashSha256(budgetHash)) throw invalido('budgetHash', `não é sha256 em hex (64): ${JSON.stringify(budgetHash)}`);
  const graphHash = validarStringObrigatoria(o, 'graphHash');
  if (!isHashSha256(graphHash)) throw invalido('graphHash', `não é sha256 em hex (64): ${JSON.stringify(graphHash)}`);

  const modelosPorEtapa = validarModelos(o['modelosPorEtapa']);
  const promptVersao = validarStringObrigatoria(o, 'promptVersao');
  const catalogoVersao = validarStringObrigatoria(o, 'catalogoVersao');

  return {
    schemaVersion: 1,
    runId,
    slug,
    criadoEm,
    atualizadoEm,
    faseAtual,
    fases,
    budgetHash,
    graphHash,
    modelosPorEtapa,
    promptVersao,
    catalogoVersao,
  };
}

// ---------------------------------------------------------------------------
// Máquina de estados — transições PURAS (sem IO), ordem fixa
// ---------------------------------------------------------------------------

/**
 * Cria um run novo: todas as fases `pendente`, faseAtual F0. Valida cada campo
 * de entrada (fail-closed: entrada inválida = RunStateError, nunca run vazio).
 */
export function criarRun(input: CriarRunInput): RunState {
  if (!isSlugValido(input.slug)) {
    throw new RunStateError('SLUG_INVALIDO', `slug inválido: ${JSON.stringify(input.slug)}`, 'slug');
  }
  if (!isHashSha256(input.budgetHash)) {
    throw new RunStateError('RUN_JSON_INVALIDO', `budgetHash inválido: ${JSON.stringify(input.budgetHash)}`, 'budgetHash');
  }
  if (!isHashSha256(input.graphHash)) {
    throw new RunStateError('RUN_JSON_INVALIDO', `graphHash inválido: ${JSON.stringify(input.graphHash)}`, 'graphHash');
  }
  if (typeof input.promptVersao !== 'string' || input.promptVersao.trim() === '') {
    throw new RunStateError('RUN_JSON_INVALIDO', 'promptVersao obrigatória e não vazia', 'promptVersao');
  }
  if (typeof input.catalogoVersao !== 'string' || input.catalogoVersao.trim() === '') {
    throw new RunStateError('RUN_JSON_INVALIDO', 'catalogoVersao obrigatória e não vazia', 'catalogoVersao');
  }
  const modelosPorEtapa = validarModelos(input.modelosPorEtapa); // lança se inválido

  const agora = new Date().toISOString();
  const fases = Object.fromEntries(FASES_ORDEM.map((f) => [f, 'pendente'])) as Record<FaseId, StatusFase>;
  const run: RunState = {
    schemaVersion: 1,
    runId: randomUUID(),
    slug: input.slug,
    criadoEm: agora,
    atualizadoEm: agora,
    faseAtual: 'F0',
    fases,
    budgetHash: input.budgetHash,
    graphHash: input.graphHash,
    modelosPorEtapa,
    promptVersao: input.promptVersao,
    catalogoVersao: input.catalogoVersao,
  };
  return validarRun(run); // invariante: criarRun só devolve estado válido
}

/** Fases já concluídas, na ordem fixa (interface de retomada — contrato P-03). */
export function fasesConcluidas(run: RunState): FaseId[] {
  return FASES_ORDEM.filter((f) => run.fases[f] === 'done');
}

/**
 * A PRIMEIRA fase não concluída — o ponto de retomada. `null` quando o run está
 * concluído (chame `runConcluido(run)` para distinguir do estado corrupto:
 * corrupção LANÇA RunStateError na carga, nunca devolve null).
 */
export function primeiraFasePendente(run: RunState): FaseId | null {
  return FASES_ORDEM.find((f) => run.fases[f] !== 'done') ?? null;
}

/** O run chegou ao fim (todas as fases done)? */
export function runConcluido(run: RunState): boolean {
  return primeiraFasePendente(run) === null;
}

function validarFaseIdOuLancar(fase: string): FaseId {
  if (!isFaseId(fase)) {
    throw new RunStateError(
      'FASE_INVALIDA',
      `fase desconhecida: ${JSON.stringify(fase)} (esperado uma de ${FASES_ORDEM.join(', ')})`,
      'fase',
    );
  }
  return fase;
}

/**
 * MARCA uma fase como `em_andamento`. Só a próxima fase da ordem fixa pode ser
 * iniciada, e só se ainda estiver `pendente` — re-iniciar uma fase que já
 * começou é erro estruturado (o executor de retomada chama isto apenas quando
 * o status é `pendente`; ver CONTRATO DE RETOMADA no cabeçalho).
 */
export function iniciarFase(run: RunState, fase: string): RunState {
  const id = validarFaseIdOuLancar(fase);
  const pendente = primeiraFasePendente(run);
  if (pendente === null) {
    throw new RunStateError('TRANSICAO_INVALIDA', `run já concluído — nenhuma fase pendente para iniciar`, 'fase');
  }
  if (id !== pendente) {
    throw new RunStateError(
      'TRANSICAO_INVALIDA',
      `ordem fixa: para iniciar ${id} é preciso concluir as anteriores (próxima pendente: ${pendente})`,
      'fase',
    );
  }
  const statusAtual = run.fases[id];
  if (statusAtual !== 'pendente') {
    throw new RunStateError(
      'TRANSICAO_INVALIDA',
      `fase ${id} não está pendente (está ${statusAtual}) — re-iniciar fase já iniciada é proibido`,
      'fase',
    );
  }
  return { ...run, fases: { ...run.fases, [id]: 'em_andamento' }, faseAtual: id };
}

/**
 * MARCA a fase atual como `done` e avança `faseAtual` para a próxima fase da
 * ordem fixa (que fica `pendente`, pronta para `iniciarFase`). Na F12 o run é
 * concluído e faseAtual permanece F12. Só a fase ATUAL e `em_andamento` pode
 * ser concluída; concluir duas vezes é erro estruturado.
 */
export function concluirFase(run: RunState, fase: string): RunState {
  const id = validarFaseIdOuLancar(fase);
  if (run.fases[id] !== 'em_andamento') {
    throw new RunStateError(
      'TRANSICAO_INVALIDA',
      `fase ${id} não está em_andamento (está ${run.fases[id]}) — conclua apenas a fase atual iniciada`,
      'fase',
    );
  }
  if (id !== run.faseAtual) {
    throw new RunStateError('TRANSICAO_INVALIDA', `fase atual é ${run.faseAtual}, não ${id}`, 'fase');
  }
  const fases: Record<FaseId, StatusFase> = { ...run.fases, [id]: 'done' };
  const indice = FASES_ORDEM.indexOf(id);
  const proxima = indice + 1 < FASES_ORDEM.length ? FASES_ORDEM[indice + 1] : id;
  return { ...run, fases, faseAtual: proxima };
}

// ---------------------------------------------------------------------------
// Escrita atômica — primitiva compartilhada com o ledger (D-WRITE)
// ---------------------------------------------------------------------------

/** Interface de escrita injetável — os testes simulam falha no meio com um fake. */
export type EscreverArquivoFn = (caminho: string, conteudo: string) => Promise<void>;

/** Implementação padrão: writeFile simples (o tmp é fsyncado depois, no escreverAtomico). */
export async function escreverArquivoPadrao(caminho: string, conteudo: string): Promise<void> {
  await fsp.writeFile(caminho, conteudo, 'utf8');
}

/**
 * Escreve `conteudo` em `caminho` ATOMICAMENTE (D-WRITE). O conteúdo vai para
 * um tmp único no MESMO diretório, é fsyncado, renomeado por cima do alvo e o
 * diretório é fsyncado (best-effort). Se qualquer passo falhar, o tmp é
 * removido e o erro propaga — o arquivo alvo fica EXATAMENTE como estava:
 * interrupção no meio nunca deixa arquivo pela metade.
 *
 * `escreverArquivo` é injetável: o teste 4 (atomicidade) passa um fake que
 * grava metade do conteúdo e lança, provando que só o TMP é corrompido.
 */
export async function escreverAtomico(
  caminho: string,
  conteudo: string,
  escreverArquivo: EscreverArquivoFn = escreverArquivoPadrao,
): Promise<void> {
  const dir = path.dirname(caminho);
  const tmp = path.join(dir, `.${path.basename(caminho)}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`);
  try {
    await escreverArquivo(tmp, conteudo); // se falhar no MEIO, só o tmp sofre
    let fd: fsp.FileHandle | null = null;
    try {
      fd = await fsp.open(tmp, 'r');
      await fd.sync(); // conteúdo no disco ANTES do rename
    } finally {
      if (fd !== null) {
        await fd.close().catch(() => {});
      }
    }
    await fsp.rename(tmp, caminho); // rename atômico (POSIX)
    await fsyncDiretorio(dir); // durabilidade do rename (best-effort)
  } catch (erro) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Mutex in-process — serializa as seções críticas read-modify-write (D-ESCRITOR-UNICO)
// ---------------------------------------------------------------------------

/**
 * Cadeia de promessas por CHAVE (normalmente o caminho do arquivo). Só entra
 * aqui quem passa por `comMutex`; entradas órfãs (crítico que terminou sem
 * ninguém na fila) são removidas no `finally` — o mapa não acumula lixo.
 */
const cadeiasPorChave = new Map<string, Promise<void>>();

/**
 * Serializa execução assíncrona por chave (D-ESCRITOR-UNICO): chamadas
 * concorrentes a `comMutex(chave, fn)` rodam em fila FIFO — cada uma espera a
 * anterior terminar ANTES de começar. É o mutex IN-PROCESS do run: `salvarRun`
 * e `Ledger.anexar` (que relê a cauda e reescreve o arquivo inteiro) só são
 * seguros se forem serializados por caminho — sem isso, dois anexos concorrentes
 * leem a mesma cauda e o último rename vence, PERDENDO uma linha em silêncio
 * (proibido, `docs/16-engine-de-trilha.md` §11).
 *
 * ESCOPO DECLARADO: mutex vale POR PROCESSO. Escritor único por PROCESSO e por
 * diretório de run é pré-condição (a engine roda um gerador por run); escrita
 * CROSS-PROCESS não é coberta. Rejeições: `comMutex` nunca rejeita por si — o
 * erro de `fn` é propagado SÓ ao chamador daquela execução e não trava a fila.
 */
export async function comMutex<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const anterior = cadeiasPorChave.get(chave) ?? Promise.resolve();
  let liberar!: () => void;
  const porta = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  // A promessa guardada NUNCA rejeita (anterior.catch + porta que só resolve):
  // o erro de um crítico é entregue ao dono daquela execução, não à fila.
  const fila = anterior.then(
    () => porta,
    () => porta,
  );
  cadeiasPorChave.set(chave, fila);
  await anterior.catch(() => {});
  try {
    return await fn();
  } finally {
    liberar();
    // Se ninguém enfileirou depois de nós, esta entrada já cumpriu seu papel.
    if (cadeiasPorChave.get(chave) === fila) cadeiasPorChave.delete(chave);
  }
}

/**
 * fsync de diretório — garante que o rename sobreviva a uma queda de energia.
 * Plataformas/filesystems sem suporte (EINVAL/ENOTSUP/EBADF/EISDIR) são
 * ignorados por decisão documentada (D-WRITE); QUALQUER outro erro propaga —
 * fail-closed.
 */
async function fsyncDiretorio(dir: string): Promise<void> {
  let dh: fsp.FileHandle | null = null;
  try {
    dh = await fsp.open(dir, 'r');
    await dh.sync();
  } catch (erro) {
    const code = (erro as NodeJS.ErrnoException).code;
    if (code === 'EINVAL' || code === 'ENOTSUP' || code === 'EBADF' || code === 'EISDIR') return;
    throw erro;
  } finally {
    if (dh !== null) {
      await dh.close().catch(() => {});
    }
  }
}

/** Lê um arquivo como texto; ausência retorna '' (a distinção ENOENT é preservada). */
export async function lerArquivoOuVazio(caminho: string): Promise<string> {
  try {
    return await fsp.readFile(caminho, 'utf8');
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// IO do run.json (fail-closed — A-P03-3)
// ---------------------------------------------------------------------------

/** Existe um run.json no diretório? (falha de acesso ≠ ausência — propaga). */
export async function temRun(dir: string): Promise<boolean> {
  const caminho = path.join(dir, RUN_FILENAME);
  try {
    await fsp.access(caminho, fs.constants.F_OK);
    return true;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new RunStateError('IO_ERRO', `falha ao inspecionar ${caminho}: ${mensagemDe(erro)}`);
  }
}

/**
 * Lê e valida o run.json do diretório. Três falhas possíveis, todas
 * ESTRUTURADAS (nunca estado vazio em silêncio):
 *   - arquivo ausente → RUN_JSON_AUSENTE;
 *   - JSON inválido → RUN_JSON_CORROMPIDO;
 *   - JSON válido com campo inválido → RUN_JSON_INVALIDO (+ `campo`).
 */
export async function lerRun(dir: string): Promise<RunState> {
  const caminho = path.join(dir, RUN_FILENAME);
  let texto: string;
  try {
    texto = await fsp.readFile(caminho, 'utf8');
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RunStateError('RUN_JSON_AUSENTE', `run.json não existe em ${dir}`, 'run');
    }
    throw new RunStateError('IO_ERRO', `falha ao ler ${caminho}: ${mensagemDe(erro)}`);
  }
  let cru: unknown;
  try {
    cru = JSON.parse(texto);
  } catch (erro) {
    throw new RunStateError('RUN_JSON_CORROMPIDO', `run.json não é JSON válido: ${mensagemDe(erro)}`, 'run');
  }
  return validarRun(cru);
}

/** Opções de gravação — `escreverArquivo` injetável por simetria com o ledger. */
export interface OpcoesEscrita {
  escreverArquivo?: EscreverArquivoFn;
}

/**
 * Persiste o run.json (escrita atômica, D-WRITE, serializada por comMutex —
 * D-ESCRITOR-UNICO). GRAVA O MESMO VALIDADOR QUE A LEITURA: estado inválido
 * NUNCA chega ao disco. `atualizadoEm` é estampado no momento da persistência
 * (a cópia em disco; o objeto em memória não muda).
 */
export async function salvarRun(dir: string, run: RunState, opcoes: OpcoesEscrita = {}): Promise<void> {
  const valido = validarRun(run); // lança RunStateError se inválido — nunca grava lixo
  const agora = new Date().toISOString();
  const conteudo = `${JSON.stringify({ ...valido, atualizadoEm: agora }, null, 2)}\n`;
  const caminho = path.join(dir, RUN_FILENAME);
  try {
    // Mutex in-process por caminho: dois `salvarRun` concorrentes no mesmo
    // diretório não se atropelam (o último rename não engole o anterior).
    await comMutex(caminho, async () => {
      await escreverAtomico(caminho, conteudo, opcoes.escreverArquivo);
    });
  } catch (erro) {
    throw new RunStateError('IO_ERRO', `falha ao gravar ${caminho}: ${mensagemDe(erro)}`);
  }
}