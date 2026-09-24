/**
 * app/electron/main/engine/runtime/runState.ts — FACHADA do ESTADO DO RUN e da
 * máquina de fases da engine de trilhas (pacote P-03, onda 1 —
 * `docs/16-engine-de-trilha.md` §4 e §9.3).
 *
 * REFATORAÇÃO L06: este arquivo virou FACHADA FINA (re-export) — a implementação
 * foi dividida em quatro módulos irmãos e TODO o contrato público continua
 * exportado por ESTE caminho (nenhum consumidor mudou de import):
 *   - `runStateModel.ts`    — layout de disco, fases/ordem fixa, tipos e erros;
 *   - `runStateValidate.ts` — validação FAIL-CLOSED do `run.json`;
 *   - `runStateMachine.ts`  — transições puras e imutáveis F0..F12;
 *   - `runStateIo.ts`       — escrita atômica (D-WRITE), mutex (D-ESCRITOR-
 *                             UNICO) e o IO do `run.json`.
 *
 * Problema real: uma geração de trilha (F0..F12) é longa — horas de LLM, várias
 * ondas de autoria — e VAI ser interrompida: máquina dorme, processo morre,
 * cota acaba. Este pacote torna a interrupção barata: o punhado de bytes que
 * decide "de onde retomo" vive em `run.json`, é validado campo a campo, e uma
 * transição de fase só existe na ordem fixa do documento normativo (§4).
 *
 * O QUE VIVE AQUI (agora nos módulos irmãos):
 *   - o layout de disco da engine (constantes declaradas — nada além);
 *   - a máquina de fases F0..F12 (ordem fixa, `docs/16-engine-de-trilha.md` §4);
 *   - validação FAIL-CLOSED de `run.json` (A-P03-3): parse que falha OU campo
 *     inválido produz `RunStateError` estruturado (código + mensagem + campo),
 *     NUNCA um estado silenciosamente vazio. §9.3: a engine falha fechada;
 *   - a primitiva de escrita atômica compartilhada (tmp + fsync + rename) —
 *     ver decisão D-WRITE em `runStateIo.ts`.
 *
 * O QUE NÃO VIVE AQUI (ver `ledger.ts`): a cadeia de hash append-only e a
 * telemetria. `runState*` NÃO importa `ledger*` — a dependência é de uma via
 * só (`ledger*` → `runState*`), sem ciclos.
 *
 * DECISÕES (o texto integral está nos módulos que as implementam):
 *   D-WRITE (`runStateIo.ts`): toda persistência é REWRITE-ATÔMICO (tmp +
 *   fsync + rename + fsync de diretório best-effort) — interrupção no meio
 *   nunca deixa arquivo pela metade.
 *   D-ESCRITOR-UNICO (`runStateIo.ts`): seções críticas read-modify-write
 *   serializadas por `comMutex` in-process; PRÉ-CONDIÇÃO DECLARADA: escritor
 *   único POR PROCESSO e por diretório de run — escrita CROSS-PROCESS não é
 *   coberta.
 *   D-ETAPA (`runStateModel.ts`): ETAPA = FASE (mapa fase→modelo), preenchido
 *   LAZY; chave desconhecida ou valor vazio é ERRO.
 *
 * CONTRATO DE RETOMADA (para as ondas 2-4): ver `runStateMachine.ts`.
 */

// ─── layout, tipos, erros e predicados (runStateModel.ts) ───────────────────
export {
  RUN_FILENAME,
  LEDGER_FILENAME,
  TELEMETRY_FILENAME,
  CONTENT_SRC_DIR,
  TRACKS_OUTPUT_DIR,
  raizTrabalhoSlug,
  dirProdutoFinal,
  FASES_ORDEM,
  RunStateError,
  isSlugValido,
  isHashSha256,
  isFaseId,
  type FaseId,
  type EtapaId,
  type StatusFase,
  type RunStateErrorCode,
  type RunState,
  type CriarRunInput,
} from './runStateModel';

// ─── validação fail-closed do run.json (runStateValidate.ts) ─────────────────
export { validarRun } from './runStateValidate';

// ─── máquina de fases F0..F12 (runStateMachine.ts) ───────────────────────────
export {
  criarRun,
  fasesConcluidas,
  primeiraFasePendente,
  runConcluido,
  iniciarFase,
  concluirFase,
} from './runStateMachine';

// ─── escrita atômica + mutex + IO do run.json (runStateIo.ts) ────────────────
export {
  escreverArquivoPadrao,
  escreverAtomico,
  comMutex,
  lerArquivoOuVazio,
  temRun,
  lerRun,
  salvarRun,
  type EscreverArquivoFn,
  type OpcoesEscrita,
} from './runStateIo';
