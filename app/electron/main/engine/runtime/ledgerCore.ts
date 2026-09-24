/**
 * app/electron/main/engine/runtime/ledgerCore.ts — NÚCLEO do ledger
 * append-only: primitivas de hash/canonização, tipos de linha, validação
 * fail-closed de evento/linha e a CONSTRUÇÃO/VERIFICAÇÃO da cadeia de hash
 * (funções PURAS — testáveis sem disco).
 *
 * EXTRAÍDO de `runtime/ledger.ts` na refatoração L06 (arquivo ≤500 linhas,
 * CC≤8; comportamento observável preservado). O caminho PÚBLICO continua
 * `runtime/ledger.ts` — fachada fina que reexporta daqui e de
 * `ledgerStore.ts` (as classes `Ledger`/`TelemetriaFile`, com IO).
 *
 * O QUE A CADEIA GARANTE (escopo PRECISO; ver também `verificarCadeia()`):
 *   - adulteração INGÊNUA: editar conteúdo/hash/prev_hash de uma linha SEM
 *     recalcular os hashes seguintes QUEBRA a cadeia exatamente na linha
 *     tocada (HASH_DIVERGENTE / PREV_HASH_DIVERGENTE / RAIZ_INVALIDA);
 *   - quebra de SEQUÊNCIA: remover, duplicar ou reordenar linhas QUEBRA a
 *     cadeia (SEQ_INCORRETA / RAIZ_INVALIDA — a primeira linha é a raiz,
 *     prev_hash null);
 *   - injeção de linhas de OUTRO run: toda linha carrega `runId` e todas as
 *     linhas do arquivo precisam ter o MESMO runId — uma linha de outro run
 *     QUEBRA a cadeia (RUN_ID_DIVERGENTE) MESMO com recálculo completo dos
 *     hashes (D-ÂNCORA-RUNID).
 * `verificarCadeia()` reporta o ÍNDICE da primeira linha quebrada, e o `Ledger`
 * RECUSA anexar sobre cadeia quebrada (fail-closed, `docs/16-engine-de-trilha.md`
 * §9.3): adulteração nunca é silenciosamente absorvida.
 *
 * O QUE A CADEIA NÃO GARANTE (limite EXPLÍCITO — sem overclaim):
 *   - recálculo completo dos hashes: um atacante que reescreve o arquivo
 *     INTEIRO (conteúdo + seq + prev_hash + hash) produz uma cadeia
 *     internamente consistente que esta verificação não distingue de uma
 *     autêntica — a cadeia é AUTORREFERENTE (só prev_hash do próprio arquivo),
 *     não há âncora externa do hash final;
 *   - truncamento da cauda: remover a(s) ÚLTIMA(s) linha(s) deixa um PREFIXO
 *     da cadeia que continua íntegro — também não detectável pela cadeia
 *     sozinha.
 * MITIGAÇÃO IMPLEMENTADA: o `runId` em TODA linha ancora o ledger ao run.json,
 * que é reescrito ATOMICAMENTE a cada persistência (D-ÂNCORA-RUNID). Fechar
 * o buraco de vez (hash final ancorado FORA do próprio arquivo — ex. carimbo
 * de confiança persistido por quem tem a chave — e cobertura cross-process)
 * fica declarado como limite restante para as ondas 2-4.
 *
 * DECISÃO D-ÂNCORA-RUNID: `runId` é OBRIGATÓRIO em toda linha (validado em
 * `validarPayload` para TODOS os tipos, não só em `run_criado`) e faz parte do
 * corpo coberto pelo hash. `verificarCadeia` exige o MESMO runId em todas as
 * linhas. Isso ancora a cadeia ao `run.json` (sua escrita é atômica via
 * `salvarRun` + D-ESCRITOR-UNICO): a comparação ledger↔run.json é a âncora
 * EXTERNA disponível sem dependência nova — truncamento de cauda vira
 * divergência observável de eventos vs. estado, e injeção de linha de outro
 * run quebra mesmo com hashes recalculados.
 *
 * HASH E CANONIZAÇÃO: `canonicalizarJson` ordena chaves O(s) — mesma linha
 * serializada de dois jeitos produz o mesmo hash (necessário para F5/P-10 e
 * para a verificação ser determinística). `sha256Hex` e `canonicalizarJson`
 * são exportados de propósito: as ondas 2-4 (freeze de orçamento/grafo, P-10)
 * derivam os hashes com a MESMA primitiva.
 *
 * DEPENDÊNCIA: `ledger*` importa de `runState*` (tipos, FASES_ORDEM,
 * escreverAtomico, comMutex); `runState*` NÃO importa daqui — sem ciclos.
 */

import { createHash } from 'node:crypto';

import { FASES_ORDEM, isFaseId, isHashSha256, isSlugValido, type FaseId } from './runStateModel';

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

/** Mensagem legível de um erro desconhecido (uso interno do pacote ledger). */
export function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** É data ISO-8601 parseável? (frouxo por design — não é gate de formato). */
export function isDataISO(valor: unknown): valor is string {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

/** O número finito, na forma canônica — finitude é pré-condição (fail-closed). */
function canonicalizarNumero(valor: number): string {
  if (!Number.isFinite(valor)) {
    throw new LedgerError('VALOR_NAO_SERIALIZAVEL', `número não-financeiro não serializa: ${valor}`);
  }
  return String(valor);
}

/** O objeto com chaves ORDENADAS recursivamente — a forma canônica O(s). */
function canonicalizarObjeto(valor: object): string {
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj).slice().sort();
  const partes = chaves.map((chave) => `${JSON.stringify(chave)}:${canonicalizarJson(obj[chave])}`);
  return `{${partes.join(',')}}`;
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
  if (typeof valor === 'number') return canonicalizarNumero(valor);
  if (Array.isArray(valor)) return `[${valor.map((v) => canonicalizarJson(v)).join(',')}]`;
  if (typeof valor === 'object') return canonicalizarObjeto(valor);
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
 * `runId` é obrigatório em TODOS os tipos (D-ÂNCORA-RUNID): o chamador passa a
 * identidade do run dono em toda linha, não só em `run_criado`.
 */
export type EventoNovo =
  | { tipo: 'run_criado'; runId: string; slug: string }
  | { tipo: 'fase_iniciada'; runId: string; fase: FaseId }
  | { tipo: 'fase_concluida'; runId: string; fase: FaseId }
  | { tipo: 'checkpoint'; runId: string; descricao: string };

/** Uma linha JÁ materializada do ledger (com envelope prev_hash/hash e runId). */
export type LedgerLinha =
  | (LedgerLinhaBase & { tipo: 'run_criado'; slug: string })
  | (LedgerLinhaBase & { tipo: 'fase_iniciada'; fase: FaseId })
  | (LedgerLinhaBase & { tipo: 'fase_concluida'; fase: FaseId })
  | (LedgerLinhaBase & { tipo: 'checkpoint'; descricao: string });

/** Envelope comum a toda linha: versão, sequência, run, tempo e a cadeia. */
export interface LedgerLinhaBase {
  /** Versão do formato de linha — 1, por igualdade estrita. */
  v: 1;
  /** Sequência monotônica estrita (1-based) — adulterar/duplicar/remover quebra aqui. */
  seq: number;
  /**
   * Identidade do run dono da linha (D-ÂNCORA-RUNID). TODAS as linhas do
   * arquivo compartilham o MESMO runId — `verificarCadeia` exige a igualdade,
   * e o hash cobre o runId (ele faz parte do corpo).
   */
  runId: string;
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
  /** Motivo da quebra: JSON_INVALIDO | LINHA_INVALIDA | SEQ_INCORRETA | RAIZ_INVALIDA | PREV_HASH_DIVERGENTE | RUN_ID_DIVERGENTE | HASH_DIVERGENTE | LINHA_VAZIA. */
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

type ValidadorDePayload = (o: Record<string, unknown>, erro: LedgerErrorCode) => Record<string, unknown>;

/** O payload específico de UM tipo — uma função por tipo (refatoração L06, CC≤8). */
const VALIDADORES_DE_PAYLOAD: Readonly<Record<TipoEvento, ValidadorDePayload>> = {
  run_criado: (o, erro) => {
    if (!isSlugValido(o['slug'])) {
      throw new LedgerError(erro, `run_criado exige slug válido; recebido ${JSON.stringify(o['slug'])}`, 'slug');
    }
    return { slug: o['slug'] as string };
  },
  fase_iniciada: (o, erro) => validarPayloadDeFase('fase_iniciada', o, erro),
  fase_concluida: (o, erro) => validarPayloadDeFase('fase_concluida', o, erro),
  checkpoint: (o, erro) => {
    if (typeof o['descricao'] !== 'string' || o['descricao'].trim() === '') {
      throw new LedgerError(erro, 'checkpoint exige descricao não vazia', 'descricao');
    }
    return { descricao: o['descricao'] as string };
  },
};

function validarPayloadDeFase(
  tipo: 'fase_iniciada' | 'fase_concluida',
  o: Record<string, unknown>,
  erro: LedgerErrorCode,
): Record<string, unknown> {
  if (!isFaseId(o['fase'])) {
    throw new LedgerError(
      erro,
      `${tipo} exige fase ∈ ${FASES_ORDEM.join(',')}; recebida ${JSON.stringify(o['fase'])}`,
      'fase',
    );
  }
  return { fase: o['fase'] as FaseId };
}

/**
 * Valida o payload específico do tipo. Compartilhado entre `validarEventoNovo`
 * (evento para anexar) e `validarLinha` (linha do arquivo) — o erro usa o
 * código do contexto.
 * `runId` é obrigatório em TODOS os tipos (D-ÂNCORA-RUNID): a âncora externa
 * (run.json) só fecha o laço se TODA linha carregar a identidade do run — não
 * só a primeira.
 */
function validarPayload(tipo: TipoEvento, o: Record<string, unknown>, erro: LedgerErrorCode): Record<string, unknown> {
  if (typeof o['runId'] !== 'string' || o['runId'].trim() === '') {
    throw new LedgerError(erro, `${tipo} exige runId não vazia (D-ÂNCORA-RUNID)`, 'runId');
  }
  return VALIDADORES_DE_PAYLOAD[tipo](o, erro);
}

/** Valida um evento NOVO (o chamador de anexar). Lança LedgerError('EVENTO_INVALIDO'). */
export function validarEventoNovo(evento: unknown): asserts evento is EventoNovo {
  if (typeof evento !== 'object' || evento === null || Array.isArray(evento)) {
    throw new LedgerError('EVENTO_INVALIDO', `evento não é objeto: ${JSON.stringify(evento)}`);
  }
  const o = evento as Record<string, unknown>;
  const tipo = validarTipoEvento(o['tipo'], 'EVENTO_INVALIDO');
  validarPayload(tipo, o, 'EVENTO_INVALIDO');
}

/** O envelope da linha (v/seq/quando/prev_hash/hash) já validado campo a campo. */
function validarEnvelopeLinha(o: Record<string, unknown>): Omit<LedgerLinhaBase, 'tipo'> {
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
  return {
    v: 1,
    seq: o['seq'] as number,
    runId: o['runId'] as string,
    quando: o['quando'] as string,
    prev_hash: o['prev_hash'] as string | null,
    hash: o['hash'] as string,
  };
}

/** Valida uma linha LIDA do arquivo. Lança LedgerError('LINHA_INVALIDA'). */
export function validarLinha(raw: unknown): LedgerLinha {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new LedgerError('LINHA_INVALIDA', 'linha do ledger não é um objeto JSON');
  }
  const o = raw as Record<string, unknown>;
  const envelope = validarEnvelopeLinha(o);
  const tipo = validarTipoEvento(o['tipo'], 'LINHA_INVALIDA');
  const payload = validarPayload(tipo, o, 'LINHA_INVALIDA'); // valida (e exige) o runId aqui
  const base: LedgerLinhaBase = { ...envelope, tipo };
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
export function montarLinha(seq: number, quando: string, evento: EventoNovo, prevHash: string | null): LedgerLinha {
  const corpo: Record<string, unknown> = { v: 1, seq, quando, ...evento };
  const corpoStr = canonicalizarJson(corpo);
  const hash = sha256Hex(`${prevHash ?? ''}\n${corpoStr}`);
  return validarLinha({ ...corpo, prev_hash: prevHash, hash });
}

export function fatiarLinhas(conteudo: string): string[] {
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

/** Uma linha parseada e validada, ou o MOTIVO da quebra (JSON_INVALIDO/LINHA_INVALIDA). */
function parsearLinha(bruta: string): { linha: LedgerLinha } | { motivo: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bruta);
  } catch {
    return { motivo: 'JSON_INVALIDO' };
  }
  try {
    return { linha: validarLinha(parsed) };
  } catch (erro) {
    return { motivo: `LINHA_INVALIDA (${mensagemDe(erro)})` };
  }
}

/**
 * A corrente retargetada quebra AQUI: a raiz exige `prev_hash` null e as
 * seguintes exigem o hash exato da linha anterior.
 */
function conferirCorrente(linha: LedgerLinha, i: number, hashes: string[]): string | null {
  if (i === 0) {
    return linha.prev_hash !== null ? 'RAIZ_INVALIDA' : null;
  }
  return linha.prev_hash !== hashes[i - 1] ? 'PREV_HASH_DIVERGENTE' : null;
}

/** O hash gravado bate com `prev_hash + "\n" + corpo canônico` da própria linha? */
function conferirHash(linha: LedgerLinha): boolean {
  const corpoStr = canonicalizarJson(corpoSemEnvelope(linha as unknown as Record<string, unknown>));
  const esperado = sha256Hex(`${linha.prev_hash ?? ''}\n${corpoStr}`);
  return esperado === linha.hash;
}

type ConferenciaDeLinha =
  | { ok: true; hash: string; runId: string }
  | { ok: false; motivo: string };

/**
 * Uma linha da cadeia, na ordem EXATA das checagens de sempre: vazio → JSON →
 * schema → seq → corrente → runId → hash.
 */
function conferirLinha(brutas: string[], i: number, hashes: string[], runIdEsperado: string | null): ConferenciaDeLinha {
  const bruta = brutas[i];
  if (bruta === '') return { ok: false, motivo: 'LINHA_VAZIA' };
  const parseada = parsearLinha(bruta);
  if ('motivo' in parseada) return { ok: false, motivo: parseada.motivo };
  const linha = parseada.linha;
  if (linha.seq !== i + 1) return { ok: false, motivo: 'SEQ_INCORRETA' };
  const quebraDeCorrente = conferirCorrente(linha, i, hashes);
  if (quebraDeCorrente !== null) return { ok: false, motivo: quebraDeCorrente };
  // D-ÂNCORA-RUNID: a PRIMEIRA linha define o run dono; qualquer linha de
  // outro run quebra AQUI (injeção entre runs é detectável mesmo com os
  // hashes recalculados — o runId faz parte do corpo coberto pelo hash).
  if (runIdEsperado !== null && linha.runId !== runIdEsperado) {
    return { ok: false, motivo: 'RUN_ID_DIVERGENTE' };
  }
  if (!conferirHash(linha)) return { ok: false, motivo: 'HASH_DIVERGENTE' };
  return { ok: true, hash: linha.hash, runId: linha.runId };
}

/**
 * VERIFICA a cadeia de um conteúdo de ledger (puro, sem IO). Reporta o índice
 * 0-based da PRIMEIRA linha quebrada. Checagens por linha:
 *   JSON_INVALIDO → linha não parseia;
 *   LINHA_INVALIDA → parseia mas viola o schema (tipo, v, seq, tempos, hashes);
 *   SEQ_INCORRETA → seq não é i+1 (linha removida/duplicada/reordenada);
 *   RAIZ_INVALIDA / PREV_HASH_DIVERGENTE → a corrente está retargetada;
 *   RUN_ID_DIVERGENTE → linha com runId de OUTRO run (D-ÂNCORA-RUNID — quebra
 *     MESMO que os hashes tenham sido recalculados);
 *   HASH_DIVERGENTE → o hash gravado não bate com prev_hash+corpo (adulteração
 *     INGÊNUA: edição sem recálculo dos hashes seguintes).
 * UMA ÚNICA linha adulterada NO MEIO quebra a cadeia exatamente aí.
 * NÃO DETECTA (declarado, sem overclaim — ver cabeçalho do módulo): recálculo
 * COMPLETO dos hashes de todas as linhas e truncamento da CAUDA — a verificação
 * é autorreferente (só prev_hash do próprio arquivo); truncamento/injeção
 * total só fecham com a âncora externa (run.json, via runId — D-ÂNCORA-RUNID).
 */
export function verificarCadeia(conteudo: string): VerificacaoCadeia {
  const brutas = fatiarLinhas(conteudo);
  const hashes: string[] = [];
  let runIdEsperado: string | null = null;
  for (let i = 0; i < brutas.length; i += 1) {
    const resultado = conferirLinha(brutas, i, hashes, runIdEsperado);
    if (!resultado.ok) return quebrada(i, brutas.length, resultado.motivo);
    hashes.push(resultado.hash);
    if (runIdEsperado === null) runIdEsperado = resultado.runId;
  }
  return { ok: true, linhas: hashes.length, primeiraQuebrada: null };
}

/** Hash da ÚLTIMA linha de um conteúdo (null se vazio). Pré-condição: cadeia íntegra. */
export function ultimoHash(conteudo: string): string | null {
  const brutas = fatiarLinhas(conteudo);
  if (brutas.length === 0) return null;
  const ultima = validarLinha(JSON.parse(brutas[brutas.length - 1]));
  return ultima.hash;
}
