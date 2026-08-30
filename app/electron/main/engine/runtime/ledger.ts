/**
 * app/electron/main/engine/runtime/ledger.ts — o LEDGER append-only e a
 * TELEMETRIA da engine de trilhas (pacote P-03, onda 1).
 *
 * O ledger é a memória de auditoria do run: cada evento de progresso vira UMA
 * linha em `ledger.jsonl` com `prev_hash` e `hash` — `hash = sha256(prev_hash +
 * "\n" + corpoCanônicoDaLinha)`. Uma linha adulterada (conteúdo, hash ou
 * retarget de cadeia) QUEBRA a cadeia; `verificarCadeia()` reporta o ÍNDICE da
 * primeira linha quebrada, e o `Ledger` RECUSA anexar sobre cadeia quebrada
 * (fail-closed, `docs/16-engine-de-trilha.md` §9.3): adulteração nunca é
 * silenciosamente absorvida.
 *
 * DECISÃO D-LEDGER (append "append-only"): a escrita é REWRITE-ATÔMICO via a
 * primitiva `escreverAtomico` de `runState.ts` (tmp + fsync + rename) — a
 * garantia "interrupção no meio NUNCA deixa arquivo pela metade" vale para
 * CUALQUER ponto da linha nova, não só para a cauda. Custo O(n) por anexo é
 * aceitável para as ordens de grandeza da engine (dezenas de milhares de
 * linhas) e compra atomicidade real sem depender de O_APPEND/fsync de cauda.
 *
 * DECISÃO D-TELEMETRIA: `telemetry.jsonl` vive NESTE arquivo (escopo P-03 =
 * só runState.ts + ledger.ts + o teste), é append-only com a MESMA escrita
 * atômica, mas NÃO é encadeado por hash: telemetria é diagnóstico (usage,
 * latência, contagem por tarefa/etapa) e uma linha falsa de telemetria não
 * compromete o estado do run — encadeá-la deixaria o ruído diagnóstico capaz
 * de corromper a integridade do run. Linha de telemetria inválida (shape errado
 * ou número negativo) é RECUSADA na escrita e ERRO na leitura.
 *
 * HASH E CANONIZAÇÃO: `canonicalizarJson` ordena chaves O(s) — mesma linha
 * serializada de dois jeitos produz o mesmo hash (necessário para F5/P-10 e
 * para a verificação ser determinística). `sha256Hex` e `canonicalizarJson`
 * são exportados de propósito: as ondas 2-4 (freeze de orçamento/grafo, P-10)
 * derivam os hashes com a MESMA primitiva.
 *
 * DEPENDÊNCIA: `ledger.ts` importa de `runState.ts` (tipos, FASES_ORDEM,
 * escreverAtomico); `runState.ts` NÃO importa daqui — sem ciclos.
 */

import { createHash } from 'node:crypto';
import * as path from 'node:path';

import {
  FASES_ORDEM,
  LEDGER_FILENAME,
  TELEMETRY_FILENAME,
  escreverArquivoPadrao,
  escreverAtomico,
  isFaseId,
  isHashSha256,
  isSlugValido,
  lerArquivoOuVazio,
  type EscreverArquivoFn,
  type FaseId,
} from './runState';

// ---------------------------------------------------------------------------
// Primitivas de hash (exportadas para F5/P-10)
// ---------------------------------------------------------------------------

/** sha256 em hex (64 chars). Nó stock — zero dependências novas (regra 2). */
export function sha256Hex(entrada: string): string {
  return createHash('sha256').update(entrada, 'utf8').digest('hex');
}

/** Códigos de erro estruturado do ledger/telemetria (INV-03). */
export type LedgerErrorCode =
  | 'EVENTO_INVALIDO' // evento passado para anexar viola o schema
  | 'LINHA_INVALIDA' // linha do arquivo não parseia ou viola o schema
  | 'CADEIA_QUEBRADA' // anexo recusado: cadeia existente está adulterada
  | 'IO_ERRO' // falha de disco
  | 'VALOR_NAO_SERIALIZAVEL'; // canonicalizarJson recebeu valor não-JSON

/** Erro estruturado do ledger. Todo caminho de falha passa por aqui. */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode;
  /** Campo do evento/linha que violou (quando aplicável). */
  readonly campo?: string;

  constructor(code: LedgerErrorCode, mensagem: string, campo?: string) {
    super(mensagem);
    this.name = 'LedgerError';
    this.code = code;
    this.campo = campo;
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** É data ISO-8601 parseável? (frouxo por design — não é gate de formato). */
function isDataISO(valor: unknown): valor is string {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

/**
 * JSON canônico: chaves de objetos ORDENADAS recursivamente, sem espaços.
 * Mesma estrutura → mesma string → mesmo hash, independente da ordem de chaves
 * do objeto em memória. Valores não-JSON (undefined, NaN, Infinity, função)
 * são ERRO estruturado (fail-closed), não silêncio.
 */
export function canonicalizarJson(valor: unknown): string {
  if (valor === null) return 'null';
  if (typeof valor === 'string') return JSON.stringify(valor);
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      throw new LedgerError('VALOR_NAO_SERIALIZAVEL', `número não-financeiro não serializa: ${valor}`);
    }
    return String(valor);
  }
  if (Array.isArray(valor)) return `[${valor.map((v) => canonicalizarJson(v)).join(',')}]`;
  if (typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    const chaves = Object.keys(obj).slice().sort();
    const partes = chaves.map((chave) => `${JSON.stringify(chave)}:${canonicalizarJson(obj[chave])}`);
    return `{${partes.join(',')}}`;
  }
  throw new LedgerError('VALOR_NAO_SERIALIZAVEL', `valor não serializável: ${typeof valor}`);
}

// ---------------------------------------------------------------------------
// Tipos do ledger
// ---------------------------------------------------------------------------

/** Tipos de evento aceitos pelo ledger. */
export type TipoEvento = 'run_criado' | 'fase_iniciada' | 'fase_concluida' | 'checkpoint';

const TIPOS_EVENTO = ['run_criado', 'fase_iniciada', 'fase_concluida', 'checkpoint'] as const;

/**
 * Evento NOVO (sem envelope): o chamador entrega um destes a `Ledger.anexar`.
 * Todo campo de todo tipo é obrigatório — validado em `validarEventoNovo`.
 */
export type EventoNovo =
  | { tipo: 'run_criado'; runId: string; slug: string }
  | { tipo: 'fase_iniciada'; fase: FaseId }
  | { tipo: 'fase_concluida'; fase: FaseId }
  | { tipo: 'checkpoint'; descricao: string };

/** Uma linha JÁ materializada do ledger (com envelope prev_hash/hash). */
export type LedgerLinha =
  | (LedgerLinhaBase & { tipo: 'run_criado'; runId: string; slug: string })
  | (LedgerLinhaBase & { tipo: 'fase_iniciada'; fase: FaseId })
  | (LedgerLinhaBase & { tipo: 'fase_concluida'; fase: FaseId })
  | (LedgerLinhaBase & { tipo: 'checkpoint'; descricao: string });

/** Envelope comum a toda linha: versão, sequência, tempo e a cadeia. */
export interface LedgerLinhaBase {
  /** Versão do formato de linha — 1, por igualdade estrita. */
  v: 1;
  /** Sequência monotônica estrita (1-based) — adulterar/duplicar/remover quebra aqui. */
  seq: number;
  /** Momento do evento, ISO-8601. */
  quando: string;
  /** Hash da linha ANTERIOR (null só na primeira linha). */
  prev_hash: string | null;
  /** sha256 hex de `prev_hash + "\n" + corpo` desta linha. */
  hash: string;
  tipo: TipoEvento;
}

/** Resultado da verificação de cadeia — sucesso... */
export interface VerificacaoCadeiaOk {
  ok: true;
  /** Quantidade de linhas íntegras verificadas. */
  linhas: number;
  primeiraQuebrada: null;
}

/** ...ou a PRIMEIRA linha quebrada, com o motivo. */
export interface VerificacaoCadeiaQuebrada {
  ok: false;
  linhas: number;
  /** Índice 0-based da primeira linha quebrada (aí está o erro). */
  primeiraQuebrada: number;
  /** Motivo da quebra: JSON_INVALIDO | LINHA_INVALIDA | SEQ_INCORRETA | RAIZ_INVALIDA | PREV_HASH_DIVERGENTE | HASH_DIVERGENTE | LINHA_VAZIA. */
  motivo: string;
}

export type VerificacaoCadeia = VerificacaoCadeiaOk | VerificacaoCadeiaQuebrada;

function quebrada(indice: number, linhas: number, motivo: string): VerificacaoCadeiaQuebrada {
  return { ok: false, linhas, primeiraQuebrada: indice, motivo };
}

// ---------------------------------------------------------------------------
// Validação de evento/linha (fail-closed: shape errado = erro estruturado)
// ---------------------------------------------------------------------------

function validarTipoEvento(valor: unknown, erro: LedgerErrorCode): TipoEvento {
  if (typeof valor !== 'string' || !(TIPOS_EVENTO as readonly string[]).includes(valor)) {
    throw new LedgerError(erro, `tipo de evento inválido: ${JSON.stringify(valor)} (esperado ${TIPOS_EVENTO.join(', ')})`, 'tipo');
  }
  return valor as TipoEvento;
}

/**
 * Valida o payload específico do tipo. Compartilhado entre `validarEventoNovo`
 * (evento para anexar) e `validarLinha` (linha do arquivo) — o erro usa o
 * código do contexto.
 */
function validarPayload(tipo: TipoEvento, o: Record<string, unknown>, erro: LedgerErrorCode): Record<string, unknown> {
  switch (tipo) {
    case 'run_criado': {
      if (typeof o['runId'] !== 'string' || o['runId'].trim() === '') {
        throw new LedgerError(erro, 'run_criado exige runId não vazia', 'runId');
      }
      if (!isSlugValido(o['slug'])) {
        throw new LedgerError(erro, `run_criado exige slug válido; recebido ${JSON.stringify(o['slug'])}`, 'slug');
      }
      return { runId: o['runId'], slug: o['slug'] as string };
    }
    case 'fase_iniciada':
    case 'fase_concluida': {
      if (!isFaseId(o['fase'])) {
        throw new LedgerError(
          erro,
          `${tipo} exige fase ∈ ${FASES_ORDEM.join(',')}; recebida ${JSON.stringify(o['fase'])}`,
          'fase',
        );
      }
      return { fase: o['fase'] as FaseId };
    }
    case 'checkpoint': {
      if (typeof o['descricao'] !== 'string' || o['descricao'].trim() === '') {
        throw new LedgerError(erro, 'checkpoint exige descricao não vazia', 'descricao');
      }
      return { descricao: o['descricao'] as string };
    }
  }
}

/** Valida um evento NOVO (o chamador de anexar). Lança LedgerError('EVENTO_INVALIDO'). */
function validarEventoNovo(evento: unknown): asserts evento is EventoNovo {
  if (typeof evento !== 'object' || evento === null || Array.isArray(evento)) {
    throw new LedgerError('EVENTO_INVALIDO', `evento não é objeto: ${JSON.stringify(evento)}`);
  }
  const o = evento as Record<string, unknown>;
  const tipo = validarTipoEvento(o['tipo'], 'EVENTO_INVALIDO');
  validarPayload(tipo, o, 'EVENTO_INVALIDO');
}

/** Valida uma linha LIDA do arquivo. Lança LedgerError('LINHA_INVALIDA'). */
function validarLinha(raw: unknown): LedgerLinha {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new LedgerError('LINHA_INVALIDA', 'linha do ledger não é um objeto JSON');
  }
  const o = raw as Record<string, unknown>;
  if (o['v'] !== 1) throw new LedgerError('LINHA_INVALIDA', `v inválido: ${JSON.stringify(o['v'])}`, 'v');
  if (!Number.isInteger(o['seq']) || (o['seq'] as number) < 1) {
    throw new LedgerError('LINHA_INVALIDA', `seq inválida: ${JSON.stringify(o['seq'])}`, 'seq');
  }
  if (!isDataISO(o['quando'])) throw new LedgerError('LINHA_INVALIDA', `quando inválido: ${JSON.stringify(o['quando'])}`, 'quando');
  if (o['prev_hash'] !== null && !isHashSha256(o['prev_hash'])) {
    throw new LedgerError('LINHA_INVALIDA', `prev_hash inválido: ${JSON.stringify(o['prev_hash'])}`, 'prev_hash');
  }
  if (!isHashSha256(o['hash'])) {
    throw new LedgerError('LINHA_INVALIDA', `hash inválido: ${JSON.stringify(o['hash'])}`, 'hash');
  }
  const tipo = validarTipoEvento(o['tipo'], 'LINHA_INVALIDA');
  const payload = validarPayload(tipo, o, 'LINHA_INVALIDA');
  const base: LedgerLinhaBase = {
    v: 1,
    seq: o['seq'] as number,
    quando: o['quando'] as string,
    prev_hash: o['prev_hash'] as string | null,
    hash: o['hash'] as string,
    tipo,
  };
  return { ...base, ...payload } as LedgerLinha;
}

// ---------------------------------------------------------------------------
// Construção e verificação da cadeia (PURAS — testáveis sem disco)
// ---------------------------------------------------------------------------

/** Corpo da linha sem o envelope de cadeia — o que o hash cobre. */
function corpoSemEnvelope(linha: Record<string, unknown>): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(linha)) {
    if (chave === 'prev_hash' || chave === 'hash') continue;
    corpo[chave] = valor;
  }
  return corpo;
}

/** Constrói uma linha da cadeia a partir de um evento novo + cadeia anterior. */
function montarLinha(seq: number, quando: string, evento: EventoNovo, prevHash: string | null): LedgerLinha {
  const corpo: Record<string, unknown> = { v: 1, seq, quando, ...evento };
  const corpoStr = canonicalizarJson(corpo);
  const hash = sha256Hex(`${prevHash ?? ''}\n${corpoStr}`);
  return validarLinha({ ...corpo, prev_hash: prevHash, hash });
}

function fatiarLinhas(conteudo: string): string[] {
  const linhas = conteudo.split('\n');
  if (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas;
}

/**
 * Monta uma cadeia COMPLETA a partir de eventos (puro, sem IO) — usado pelos
 * testes e pelas ondas 2-4 quando quiserem materializar um ledger em memória.
 * `quando` é opcional por conveniência (default: agora); eventos sem tempo
 * estampado usam o mesmo valor para todos.
 */
export function montarCadeia(eventos: EventoNovo[], quando?: string): string {
  const momento = quando ?? new Date().toISOString();
  let out = '';
  let prev: string | null = null;
  for (let i = 0; i < eventos.length; i += 1) {
    const linha = montarLinha(i + 1, momento, eventos[i], prev);
    const disco = canonicalizarJson(linha);
    out = out === '' ? disco : `${out}\n${disco}`;
    prev = linha.hash;
  }
  return out;
}

/**
 * VERIFICA a cadeia de um conteúdo de ledger (puro, sem IO). Reporta o índice
 * 0-based da PRIMEIRA linha quebrada. Integra cinco checagens por linha:
 *   JSON_INVALIDA → linha não parseia;
 *   LINHA_INVALIDA → parseia mas viola o schema (tipo, v, seq, tempos, hashes);
 *   SEQ_INCORRETA → seq não é i+1 (linha removida/duplicada/reordenada);
 *   RAIZ_INVALIDA / PREV_HASH_DIVERGENTE → a corrente está retargetada;
 *   HASH_DIVERGENTE → o hash gravado não bate com prev_hash+corpo (a adulteração).
 * Uma única linha adulterada no MEIO quebra a cadeia exatamente aí.
 */
export function verificarCadeia(conteudo: string): VerificacaoCadeia {
  const brutas = fatiarLinhas(conteudo);
  const hashes: string[] = [];
  for (let i = 0; i < brutas.length; i += 1) {
    const bruta = brutas[i];
    if (bruta === '') return quebrada(i, brutas.length, 'LINHA_VAZIA');

    let parsed: unknown;
    try {
      parsed = JSON.parse(bruta);
    } catch {
      return quebrada(i, brutas.length, 'JSON_INVALIDO');
    }
    let linha: LedgerLinha;
    try {
      linha = validarLinha(parsed);
    } catch (erro) {
      return quebrada(i, brutas.length, `LINHA_INVALIDA (${mensagemDe(erro)})`);
    }
    if (linha.seq !== i + 1) return quebrada(i, brutas.length, 'SEQ_INCORRETA');
    if (i === 0) {
      if (linha.prev_hash !== null) return quebrada(i, brutas.length, 'RAIZ_INVALIDA');
    } else if (linha.prev_hash !== hashes[i - 1]) {
      return quebrada(i, brutas.length, 'PREV_HASH_DIVERGENTE');
    }
    const corpoStr = canonicalizarJson(corpoSemEnvelope(linha as unknown as Record<string, unknown>));
    const esperado = sha256Hex(`${linha.prev_hash ?? ''}\n${corpoStr}`);
    if (esperado !== linha.hash) return quebrada(i, brutas.length, 'HASH_DIVERGENTE');
    hashes.push(linha.hash);
  }
  return { ok: true, linhas: hashes.length, primeiraQuebrada: null };
}

/** Hash da ÚLTIMA linha de um conteúdo (null se vazio). Pré-condição: cadeia íntegra. */
function ultimoHash(conteudo: string): string | null {
  const brutas = fatiarLinhas(conteudo);
  if (brutas.length === 0) return null;
  const ultima = validarLinha(JSON.parse(brutas[brutas.length - 1]));
  return ultima.hash;
}

// ---------------------------------------------------------------------------
// Ledger (IO): append-only, escrita atômica, recusa sobre cadeia quebrada
// ---------------------------------------------------------------------------

export interface OpcoesLedger {
  /** Escrita injetável — testes simulam falha no meio (teste 4). */
  escreverArquivo?: EscreverArquivoFn;
}

/**
 * O ledger em disco (`<dir>/ledger.jsonl`, nome declarado por LEDGER_FILENAME).
 * `anexar` lê o arquivo, VALIDA a cadeia existente e só então concatena a linha
 * nova e grava atomicamente (D-LEDGER). Sobre cadeia quebrada RECUSA com
 * LedgerError — uma adulteração nunca é absorvida por um anexo subsequente.
 */
export class Ledger {
  readonly dir: string;
  readonly nomeArquivo: string;
  private readonly opcoes: OpcoesLedger;

  constructor(dir: string, opcoes: OpcoesLedger = {}) {
    this.dir = dir;
    this.nomeArquivo = LEDGER_FILENAME;
    this.opcoes = opcoes;
  }

  private caminho(): string {
    return path.join(this.dir, this.nomeArquivo);
  }

  /** Lê todas as linhas do ledger (sem verificar a cadeia — use verificarCadeiaEmDisco). */
  async ler(): Promise<LedgerLinha[]> {
    const conteudo = await lerArquivoOuVazio(this.caminho());
    const brutas = fatiarLinhas(conteudo);
    const out: LedgerLinha[] = [];
    for (let i = 0; i < brutas.length; i += 1) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(brutas[i]);
      } catch (erro) {
        throw new LedgerError('LINHA_INVALIDA', `linha ${i} do ledger não é JSON: ${mensagemDe(erro)}`);
      }
      try {
        out.push(validarLinha(parsed));
      } catch (erro) {
        throw new LedgerError('LINHA_INVALIDA', `linha ${i} do ledger inválida: ${mensagemDe(erro)}`);
      }
    }
    return out;
  }

  /** Verifica a cadeia do arquivo em disco (delega a verificarCadeia, puro). */
  async verificarCadeiaEmDisco(): Promise<VerificacaoCadeia> {
    const conteudo = await lerArquivoOuVazio(this.caminho());
    return verificarCadeia(conteudo);
  }

  /**
   * Anexa um evento ao fim da cadeia. Recusa (CADEIA_QUEBRADA) se o arquivo
   * existente já estiver adulterado; recusa (EVENTO_INVALIDO) se o evento
   * violar o schema. A linha retornada é a materializada (com prev_hash/hash).
   */
  async anexar(evento: EventoNovo): Promise<LedgerLinha> {
    validarEventoNovo(evento);
    const conteudo = await lerArquivoOuVazio(this.caminho());
    const anteriores = fatiarLinhas(conteudo);
    if (anteriores.length > 0) {
      const verificacao = verificarCadeia(conteudo);
      if (!verificacao.ok) {
        throw new LedgerError(
          'CADEIA_QUEBRADA',
          `recusa anexar: cadeia existente quebrada na linha ${verificacao.primeiraQuebrada} (${verificacao.motivo})`,
        );
      }
    }
    const linha = montarLinha(anteriores.length + 1, new Date().toISOString(), evento, ultimoHash(conteudo));
    const disco = canonicalizarJson(linha as unknown as Record<string, unknown>);
    const novo = conteudo === '' ? disco : `${conteudo}\n${disco}`;
    try {
      await escreverAtomico(this.caminho(), novo, this.opcoes.escreverArquivo ?? escreverArquivoPadrao);
    } catch (erro) {
      if (erro instanceof LedgerError) throw erro;
      throw new LedgerError('IO_ERRO', `falha ao anexar ao ledger ${this.caminho()}: ${mensagemDe(erro)}`);
    }
    return linha;
  }
}

// ---------------------------------------------------------------------------
// Telemetria — telemetry.jsonl (D-TELEMETRIA: append-only atômico, SEM cadeia)
// ---------------------------------------------------------------------------

/**
 * Uma linha de telemetria: usage (tokens) e latência, com contagem, por tarefa
 * E por etapa. Todo campo é obrigatório (regra 3) — a validação recusa shape
 * errado e números negativos.
 */
export interface Telemetria {
  /** Momento da medição, ISO-8601. */
  quando: string;
  /** Tarefa medida (ex.: 'autoria', 'revisao', 'pesquisa'). */
  tarefa: string;
  /** Etapa medida (ex.: 'F7', 'F11'). */
  etapa: string;
  /** Tokens de entrada consumidos pela tarefa. */
  tokensEntrada: number;
  /** Tokens de saída produzidos pela tarefa. */
  tokensSaida: number;
  /** Latência total da tarefa, em milissegundos (float permitido). */
  latenciaMs: number;
  /** Quantas chamadas/execuções compõem esta linha (agregação). */
  contagem: number;
}

function validarTelemetria(valor: unknown): asserts valor is Telemetria {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new LedgerError('EVENTO_INVALIDO', `telemetria não é objeto: ${JSON.stringify(valor)}`);
  }
  const o = valor as Record<string, unknown>;
  const stringa = (campo: string): string => {
    if (typeof o[campo] !== 'string' || (o[campo] as string).trim() === '') {
      throw new LedgerError('EVENTO_INVALIDO', `telemetria exige '${campo}' não vazio`, campo);
    }
    return o[campo] as string;
  };
  const naoNegativo = (campo: string): number => {
    if (typeof o[campo] !== 'number' || !Number.isFinite(o[campo]) || (o[campo] as number) < 0) {
      throw new LedgerError('EVENTO_INVALIDO', `telemetria exige '${campo}' ≥ 0`, campo);
    }
    return o[campo] as number;
  };
  const inteiro = (campo: string): number => {
    const n = naoNegativo(campo);
    if (!Number.isInteger(n)) {
      throw new LedgerError('EVENTO_INVALIDO', `telemetria exige '${campo}' inteiro`, campo);
    }
    return n;
  };
  const quando = stringa('quando');
  if (!isDataISO(quando)) {
    throw new LedgerError('EVENTO_INVALIDO', `quando não é data ISO-8601: ${JSON.stringify(quando)}`, 'quando');
  }
  // Todos os campos são obrigatórios e já foram validados; o asserts garante o narrowing.
  void stringa('tarefa');
  void stringa('etapa');
  void inteiro('tokensEntrada');
  void inteiro('tokensSaida');
  void naoNegativo('latenciaMs');
  void inteiro('contagem');
}

/**
 * Telemetria em disco (`<dir>/telemetry.jsonl`). Append-only com a mesma
 * escrita atômica do ledger, mas SEM encadeamento por hash (D-TELEMETRIA).
 */
export class TelemetriaFile {
  readonly dir: string;
  readonly nomeArquivo: string;
  private readonly opcoes: OpcoesLedger;

  constructor(dir: string, opcoes: OpcoesLedger = {}) {
    this.dir = dir;
    this.nomeArquivo = TELEMETRY_FILENAME;
    this.opcoes = opcoes;
  }

  private caminho(): string {
    return path.join(this.dir, this.nomeArquivo);
  }

  /** Anexa uma linha de telemetria (recusa shape/número inválido). */
  async anexar(telemetria: Telemetria): Promise<void> {
    validarTelemetria(telemetria);
    const conteudo = await lerArquivoOuVazio(this.caminho());
    const disco = canonicalizarJson(telemetria as unknown as Record<string, unknown>);
    const novo = conteudo === '' ? disco : `${conteudo}\n${disco}`;
    try {
      await escreverAtomico(this.caminho(), novo, this.opcoes.escreverArquivo ?? escreverArquivoPadrao);
    } catch (erro) {
      if (erro instanceof LedgerError) throw erro;
      throw new LedgerError('IO_ERRO', `falha ao anexar telemetria em ${this.caminho()}: ${mensagemDe(erro)}`);
    }
  }

  /** Lê todas as linhas de telemetria; linha inválida = ERRO estruturado. */
  async ler(): Promise<Telemetria[]> {
    const conteudo = await lerArquivoOuVazio(this.caminho());
    const brutas = fatiarLinhas(conteudo);
    const out: Telemetria[] = [];
    for (let i = 0; i < brutas.length; i += 1) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(brutas[i]);
      } catch (erro) {
        throw new LedgerError('LINHA_INVALIDA', `linha ${i} de telemetria não é JSON: ${mensagemDe(erro)}`);
      }
      try {
        validarTelemetria(parsed);
        out.push(parsed);
      } catch (erro) {
        throw new LedgerError('LINHA_INVALIDA', `linha ${i} de telemetria inválida: ${mensagemDe(erro)}`);
      }
    }
    return out;
  }
}