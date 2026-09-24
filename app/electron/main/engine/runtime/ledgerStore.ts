/**
 * app/electron/main/engine/runtime/ledgerStore.ts — O LEDGER EM DISCO e a
 * TELEMETRIA (classes de IO): `Ledger` (`<dir>/ledger.jsonl`, append-only com
 * cadeia de hash) e `TelemetriaFile` (`<dir>/telemetry.jsonl`, append-only SEM
 * cadeia — D-TELEMETRIA).
 *
 * EXTRAÍDO de `runtime/ledger.ts` na refatoração L06. O caminho PÚBLICO
 * continua `runtime/ledger.ts` (fachada fina) — os consumidores não mudaram.
 * O núcleo puro (hash, tipos, validação, cadeia) vive em `ledgerCore.ts`.
 *
 * DECISÃO D-ESCRITOR-UNICO (mutex in-process — compartilhada com `salvarRun`):
 * a escrita é READ-MODIFY-WRITE do arquivo inteiro (`anexar` relê a cauda, monta
 * a linha nova e `escreverAtomico` reescreve tudo) — dois anexos CONCORRENTES
 * lendo a mesma cauda N gravariam ambos N+1 e o último rename venceria, PERDENDO
 * uma linha em silêncio (proibido, `docs/16-engine-de-trilha.md` §11). O mutex
 * `comMutex` (runStateIo.ts, cadeia de promessas por caminho, zero dependência
 * nova) serializa `anexar` do ledger E da telemetria no MESMO processo.
 * PRÉ-CONDIÇÃO DECLARADA: escritor único POR PROCESSO e por diretório de run —
 * a engine roda UM gerador por run; escrita CROSS-PROCESS NÃO é coberta.
 *
 * DECISÃO D-LEDGER (append "append-only"): a escrita é REWRITE-ATÔMICO via a
 * primitiva `escreverAtomico` de `runStateIo.ts` (tmp + fsync + rename) — a
 * garantia "interrupção no meio NUNCA deixa arquivo pela metade" vale para
 * CUALQUER ponto da linha nova, não só para a cauda. Custo O(n) por anexo é
 * aceitável para as ordens de grandeza da engine (dezenas de milhares de
 * linhas) e compra atomicidade real sem depender de O_APPEND/fsync de cauda.
 *
 * DECISÃO D-TELEMETRIA: `telemetry.jsonl` vive NESTE arquivo, é append-only
 * com a MESMA escrita atômica, mas NÃO é encadeado por hash: telemetria é
 * diagnóstico (usage, latência, contagem por tarefa/etapa) e uma linha falsa
 * de telemetria não compromete o estado do run — encadeá-la deixaria o ruído
 * diagnóstico capaz de corromper a integridade do run. Linha de telemetria
 * inválida (shape errado ou número negativo) é RECUSADA na escrita e ERRO na
 * leitura.
 */

import * as path from 'node:path';

import {
  LEDGER_FILENAME,
  TELEMETRY_FILENAME,
} from './runStateModel';
import {
  comMutex,
  escreverArquivoPadrao,
  escreverAtomico,
  lerArquivoOuVazio,
  type EscreverArquivoFn,
} from './runStateIo';
import {
  LedgerError,
  canonicalizarJson,
  fatiarLinhas,
  isDataISO,
  mensagemDe,
  montarLinha,
  ultimoHash,
  validarEventoNovo,
  validarLinha,
  verificarCadeia,
  type EventoNovo,
  type LedgerLinha,
  type VerificacaoCadeia,
} from './ledgerCore';

// ---------------------------------------------------------------------------
// Telemetria — o SHAPE e a validação (D-TELEMETRIA: SEM cadeia de hash)
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

/** Valida o shape de uma linha de telemetria (fail-closed — INV-03). */
export function validarTelemetria(valor: unknown): asserts valor is Telemetria {
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
 * A seção crítica inteira (leitura → montagem → escrita) roda sob o mutex
 * in-process `comMutex` (D-ESCRITOR-UNICO): dois anexos concorrentes no MESMO
 * processo não leem a mesma cauda — nenhuma linha é perdida em silêncio (§11).
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
   * violar o schema (incluindo runId ausente — D-ÂNCORA-RUNID). A linha
   * retornada é a materializada (com prev_hash/hash).
   * Serializada por `comMutex` no caminho do arquivo (D-ESCRITOR-UNICO).
   */
  async anexar(evento: EventoNovo): Promise<LedgerLinha> {
    // Mutex in-process POR CAMINHO: sem ele, dois anexos concorrentes leem a
    // mesma cauda N e gravam N+1 — o último rename vence e UMA LINHA SE PERDE
    // em silêncio (§11). O mutex é por processo; escritor único por processo e
    // por diretório de run é pré-condição declarada (ver cabeçalho do módulo).
    return comMutex(this.caminho(), async () => {
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
    });
  }
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

  /**
   * Anexa uma linha de telemetria (recusa shape/número inválido). Mesma seção
   * crítica read-modify-write do ledger, então passa pelo MESMO mutex
   * in-process (D-ESCRITOR-UNICO): anexos concorrentes não se perdem (§11).
   */
  async anexar(telemetria: Telemetria): Promise<void> {
    return comMutex(this.caminho(), async () => {
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
    });
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
