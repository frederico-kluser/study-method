/**
 * app/electron/main/engine/runtime/ledger.ts — FACHADA do LEDGER append-only e
 * da TELEMETRIA da engine de trilhas (pacote P-03, onda 1).
 *
 * REFATORAÇÃO L06: este arquivo virou FACHADA FINA (re-export) — a
 * implementação foi dividida e TODO o contrato público continua exportado por
 * ESTE caminho (nenhum consumidor mudou de import):
 *   - `ledgerCore.ts`  — hash/canonização, tipos, validação fail-closed e a
 *                        construção/verificação da cadeia (funções PURAS);
 *   - `ledgerStore.ts` — as classes de IO `Ledger` e `TelemetriaFile`.
 *
 * O ledger é a memória de auditoria do run: cada evento de progresso vira UMA
 * linha em `ledger.jsonl` com `prev_hash` e `hash` — `hash = sha256(prev_hash +
 * "\n" + corpoCanônicoDaLinha)` — e com `runId` (ver D-ÂNCORA-RUNID).
 *
 * O QUE A CADEIA GARANTE (escopo PRECISO; ver também `verificarCadeia()`):
 *   - adulteração INGÊNUA: editar conteúdo/hash/prev_hash de uma linha SEM
 *     recalcular os hashes seguintes QUEBRA a cadeia exatamente na linha
 *     tocada (HASH_DIVERGENTE / PREV_HASH_DIVERGENTE / RAIZ_INVALIDA);
 *   - quebra de SEQUÊNCIA: remover, duplicar ou reordenar linhas QUEBRA a
 *     cadeia (SEQ_INCORRETA / RAIZ_INVALIDA);
 *   - injeção de linhas de OUTRO run: toda linha carrega `runId` e todas as
 *     linhas do arquivo precisam ter o MESMO runId (RUN_ID_DIVERGENTE, mesmo
 *     com recálculo completo dos hashes — D-ÂNCORA-RUNID).
 * `verificarCadeia()` reporta o ÍNDICE da primeira linha quebrada, e o `Ledger`
 * RECUSA anexar sobre cadeia quebrada (CADEIA_QUEBRADA, fail-closed,
 * `docs/16-engine-de-trilha.md` §9.3): adulteração nunca é absorvida.
 *
 * O QUE A CADEIA NÃO GARANTE (limite EXPLÍCITO — sem overclaim): recálculo
 * COMPLETO dos hashes e truncamento da CAUDA não são detectáveis pela cadeia
 * sozinha (ela é AUTORREFERENTE). A mitigação é o `runId` em toda linha ancorado
 * ao `run.json` (D-ÂNCORA-RUNID); o restante fica declarado como limite.
 *
 * DECISÕES (texto integral nos módulos que as implementam):
 *   D-ÂNCORA-RUNID (`ledgerCore.ts`): runId obrigatório em toda linha, coberto
 *   pelo hash; `verificarCadeia` exige o mesmo runId em todas.
 *   D-ESCRITOR-UNICO (`ledgerStore.ts` + `runStateIo.ts`): seções críticas
 *   read-modify-write serializadas por `comMutex` in-process; PRÉ-CONDIÇÃO:
 *   escritor único POR PROCESSO e por diretório de run (escrita cross-process
 *   NÃO é coberta).
 *   D-LEDGER (`ledgerStore.ts`): escrita REWRITE-ATÔMICO (tmp + fsync +
 *   rename) — interrupção nunca deixa arquivo pela metade.
 *   D-TELEMETRIA (`ledgerStore.ts`): `telemetry.jsonl` é append-only atômico,
 *   SEM cadeia de hash (linha falsa de diagnóstico não corrompe o run).
 *
 * HASH E CANONIZAÇÃO: `canonicalizarJson` ordena chaves O(s); `sha256Hex` e
 * `canonicalizarJson` são exportados para F5/P-10 derivarem os hashes com a
 * MESMA primitiva.
 *
 * DEPENDÊNCIA: `ledger*` importa de `runState*`; `runState*` NÃO importa daqui
 * — sem ciclos.
 */

// ─── hash, tipos, validação e cadeia — funções puras (ledgerCore.ts) ─────────
export {
  sha256Hex,
  canonicalizarJson,
  LedgerError,
  montarCadeia,
  verificarCadeia,
  type LedgerErrorCode,
  type TipoEvento,
  type EventoNovo,
  type LedgerLinha,
  type LedgerLinhaBase,
  type VerificacaoCadeiaOk,
  type VerificacaoCadeiaQuebrada,
  type VerificacaoCadeia,
} from './ledgerCore';

// ─── IO em disco: ledger.jsonl e telemetry.jsonl (ledgerStore.ts) ────────────
export {
  Ledger,
  TelemetriaFile,
  type OpcoesLedger,
  type Telemetria,
} from './ledgerStore';
