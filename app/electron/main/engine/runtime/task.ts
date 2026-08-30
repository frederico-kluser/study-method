/**
 * app/electron/main/engine/runtime/task.ts — modelo de dados do escalonador
 * de tarefas da engine de trilhas (pacote P-02).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §4.1 (regras de
 * paralelismo) e §3.4.
 *
 * A `Task` é a unidade atômica do DAG da engine — a engine é um DAG de
 * tarefas idempotentes, não um script sequencial. Cada tarefa declara:
 *
 *   - o que consome: `deps` (DAG) e `recurso` (semáforo próprio);
 *   - a própria idempotência: `cacheKey` + `doneCacheKey` (retomada);
 *   - o que possui em EXCLUSIVIDADE: `outputs` (caminhos de arquivo — duas
 *     tarefas da mesma onda com o mesmo caminho REJEITAM a onda antes de
 *     rodar, §4.1);
 *   - o que escreve em COMPARTILHAMENTO: `writes` (chaves lógicas
 *     multi-escritor — exigem reducer declarado na onda, §4.1).
 *
 * Este módulo é PURO: só tipos e sem IO.
 */

/** Id de tarefa — único dentro da onda. */
export type TaskId = string;

/** Fase da engine a que a tarefa pertence (F1…F12, `docs/16-engine-de-trilha.md` §4). */
export type TaskPhase = string;

/**
 * Recurso de execução da tarefa. Cada recurso tem o SEU limitador próprio
 * (§4.1: "dois semáforos independentes" — aqui, três): `llm` é gargalo de
 * rede, `exec` de spawn de processo, `cpu` de computação local. Tarefas de
 * recursos diferentes NÃO competem pelo mesmo semáforo.
 */
export type TaskResource = 'llm' | 'exec' | 'cpu';

/** Estados de ciclo de vida da tarefa. */
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

export interface Task {
  /** Id único dentro da onda. */
  id: TaskId;
  /** Fase da engine (F7/F8/F9…) a que a tarefa pertence. */
  fase: TaskPhase;
  /** Ids das tarefas que precisam concluir ANTES desta (arestas do DAG, §4.1). */
  deps: TaskId[];
  /** Semáforo ao qual esta tarefa será despachada (despacho por recurso). */
  recurso: TaskResource;
  /**
   * Chave de idempotência. A tarefa com `status: 'done'` e
   * `doneCacheKey === cacheKey` NÃO roda de novo (retomada). Se a fonte do
   * conteúdo mudou, o chamador deriva um `cacheKey` novo e a tarefa reexecuta.
   */
  cacheKey: string;
  /**
   * Caminhos de posse exclusiva de arquivo (relativos à raiz da engine). Duas
   * tarefas da mesma onda declarando o mesmo caminho aqui REJEITAM a onda
   * ANTES de rodar (§4.1: "posse exclusiva de arquivo é validada pelo
   * escalonador, não confiada ao prompt") — nenhum caminho de código permite
   * onda com colisão rodar (A-P02-3).
   */
  outputs: string[];
  /**
   * Chaves lógicas multi-escritor. Toda chave presente no `writes` de MAIS DE
   * UMA tarefa da onda exige reducer declarado em `WaveConfig.reducers` —
   * sem reducer é erro de CONFIGURAÇÃO lançado antes de rodar, nunca silêncio
   * (§4.1: "sem reducer, doze autores gravando `trilha.aulas` deixam uma aula
   * viva, sem erro e sem log").
   */
  writes: string[];
  /** Estado vigente. O chamador persiste `status` entre ondas (retomada). */
  status: TaskStatus;
  /**
   * cacheKey sob o qual a tarefa foi marcada `done` (persistido junto com o
   * status). A retomada compara `doneCacheKey` com o `cacheKey` atual:
   * iguais → não reexecuta; diferentes → o conteúdo mudou e roda de novo.
   */
  doneCacheKey?: string;
}