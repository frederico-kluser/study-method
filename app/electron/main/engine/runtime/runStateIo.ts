/**
 * app/electron/main/engine/runtime/runStateIo.ts — ESCRITA ATÔMICA (D-WRITE),
 * MUTEX in-process (D-ESCRITOR-UNICO) e o IO fail-closed do `run.json`
 * (A-P03-3: três falhas estruturadas distintas — ausente, corrompido,
 * inválido — nunca estado vazio em silêncio).
 *
 * EXTRAÍDO de `runtime/runState.ts` na refatoração L06. As DECISÕES:
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
 */

import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import {
  RUN_FILENAME,
  RunStateError,
  mensagemDe,
  type RunState,
} from './runStateModel';
import { validarRun } from './runStateValidate';

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
 * (a cópia em disco; o objeto em memória não muda). O formato é
 * `JSON.stringify(..., null, 2)` + `\n` (pin do repositório).
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
