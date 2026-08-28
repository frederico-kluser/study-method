/**
 * src/lib/challengeGenerateStore.ts — PROCESSO GLOBAL de "Gerar novo desafio"
 * (ONDA 3 — generate-flow).
 *
 * O shell monta SÓ a view ativa (App.tsx — `const View = VIEWS[active]`):
 * trocar de aba DESMONTA a LessonView/TrackChallengePanel e zera o `useState`
 * local delas — mas o processo LLM/insert continua no main (150s de timeout).
 * Este store em MEMÓRIA (variável de módulo, sem React — mesmo padrão de
 * roadmapNav.ts/lastLesson.ts) é a ÚNICA fonte de verdade do processo: views
 * e modal leem/escrevem nele, e ele sobrevive à desmontagem porque o módulo
 * vive no processo do renderer, não no componente.
 *
 * QUEM ESCREVE:
 *   - as views (LessonView/TrackChallengePanel) chamam `startChallengeGenerate`
 *     ao disparar o IPC e `finishChallengeGenerate`/`failChallengeGenerate` no
 *     resolve/reject do invoke (belt-and-suspenders — idempotente);
 *   - o MODAL (sempre montado, no shell) escuta os eventos de progresso do
 *     main (track:challenge-regenerate-progress) e os aplica aqui via
 *     `applyChallengeGenerateProgress` — é ele que garante o desfecho quando
 *     a view que disparou já desmontou (navegação durante a geração).
 *
 * ESTADOS TERMINAIS SÃO STICKY: o primeiro 'done'/'error' que chega vence —
 * os writes posteriores viram no-op. Cobre a corrida evento-do-main ×
 * resolve-do-invoke (o main termina ~sempre antes do timeout de 150s; se o
 * canal ficar mudo, o timeout da view é quem escreve o 'error').
 *
 * CORRELAÇÃO POR generationId (revisão ALTO-2): o withTimeout de 150s NÃO
 * aborta o main — um terminal ATRASADO de um processo anterior pode chegar
 * depois de um `startChallengeGenerate` novo. Cada start gera um id novo
 * (incremento global) e TODO write (advance/finish/fail/applyProgress) só
 * aplica quando o id recebido bate com o id do estado em curso — terminal
 * atrasado de A é descartado, B segue intacto. O id viaja: view → request
 * IPC → main ecoa nos eventos de progresso → modal correlaciona.
 *
 * CANCELAMENTO (revisão MÉDIO-1): `resetChallengeGenerate` (botão "Cancelar",
 * Esc ou clique no backdrop) marca idle — NÃO aborta o main (o processo LLM/
 * insert continua e o desafio PODE ser persistido depois); os terminais
 * atrasados são descartados pelo generationId (id novo no reset → mismatch).
 *
 * INVALIDAÇÃO DA LISTA (revisão MÉDIO-2): `listVersion` incrementa ao concluir
 * com sucesso ('done') — a LessonView observa e re-busca a aula (a lista dos
 * desafios traz o novo no TOPO — pedido C) quando o token muda, mesmo que o
 * usuário feche o modal com X sem navegar.
 *
 * MAPEAMENTO EVENTOS → ETAPAS do modal (5 etapas, 4 marcos do main):
 *   'generating' → etapa 0 (Pensando no desafio) — pulsa durante TODO o draft;
 *   'validating' → etapa 2 (Conferindo a coerência com o que você aprendeu —
 *     rótulo honesto: o regenerador PODE pular a validação semântica quando o
 *     validador está indisponível, revisão BAIXO-2);
 *   'executing'  → etapa 3 (Verificando a execução);
 *   'inserting'  → etapa 4 (Adicionando ao topo dos desafios);
 *   'done'       → status done (todas as etapas concluídas);
 *   'error'      → status error (mensagem no modal).
 * A etapa 1 (Escrevendo os testes) não tem evento próprio: o draft da LLM já
 * contém os testes, então ela conclui junto da etapa 0 (regra: etapas < etapa
 * ativa estão concluídas). Quando NÃO há contexto pedagógico, 'validating'
 * não é emitido e a etapa 2 também conclui por salto (regra idêntica).
 *
 * SUBSCRIÇÃO: `subscribeChallengeGenerate` + `peekChallengeGenerate` formam o
 * par do useSyncExternalStore (React 19) — o modal re-renderiza a cada
 * mutação SEM estado React duplicado (o snapshot é o objeto do módulo,
 * substituído por um NOVO objeto a cada mutação: referência estável quando
 * nada muda).
 *
 * Módulo PURO (sem React/DOM — só o tipo do contrato importado): testável via
 * node:test, mesmo padrão de roadmapNav.ts/pendingSubject.ts.
 */
import type { TrackRegenerateProgressEvent } from '../../shared/ipc-contract';

export type ChallengeGenerateStatus = 'idle' | 'running' | 'done' | 'error';

/** Alvo real da navegação de conclusão ("Ver desafio" — revisão BAIXO-3:
 *  a proficiência navega com target 'proficiency', não 'lesson'). */
export type ChallengeGenerateTarget = 'lesson' | 'proficiency';

export interface ChallengeGenerateState {
  /** 'running' enquanto o processo está em voo; terminais sticky. */
  status: ChallengeGenerateStatus;
  /**
   * Índice da etapa ATIVA (0..4 — ver cabeçalho); etapas < stage estão
   * CONCLUÍDAS; -1 quando idle.
   */
  stage: number;
  /** Id da geração em curso (incremento global — correlação ALTO-2). */
  generationId: number | null;
  /** Contexto da geração (de onde o "Ver desafio" navega). */
  trackSlug: string | null;
  lessonId: string | null;
  /** Alvo real da navegação (BAIXO-3): 'lesson' (bolha da aula) ou
   *  'proficiency' (painel do teste de proficiência). */
  target: ChallengeGenerateTarget | null;
  /** Desafio NOVO (status 'done' — do evento terminal do main). */
  challengeId: string | null;
  challengeTitle: string | null;
  /** Mensagem do erro (status 'error'). */
  errorMessage: string | null;
  /** Token de invalidação da LISTA de desafios da aula (MÉDIO-2): incrementa
   *  a cada conclusão com sucesso — a LessonView re-busca ao observar a
   *  mudança (o novo desafio chega no TOPO). */
  listVersion: number;
}

const IDLE_STATE: ChallengeGenerateState = {
  status: 'idle',
  stage: -1,
  generationId: null,
  trackSlug: null,
  lessonId: null,
  target: null,
  challengeId: null,
  challengeTitle: null,
  errorMessage: null,
  listVersion: 0,
};

let state: ChallengeGenerateState = IDLE_STATE;
const listeners = new Set<() => void>();
let generationCounter = 0;

function setState(next: ChallengeGenerateState): void {
  state = next;
  for (const l of listeners) l();
}

/** Retorna true quando o id recebido bate com o processo em curso (ou quando
 *  o chamador não informa id — compat com chamadas legadas/testes). */
function matchesGeneration(generationId: number | undefined | null): boolean {
  if (generationId === undefined) return true;
  return generationId !== null && generationId === state.generationId;
}

/**
 * Inicia o processo global. Retorna o generationId novo (número), ou null
 * (e NÃO altera o estado) quando já existe uma geração em voo — o modal
 * global é o único processo; o gating dos botões cobre a view ativa, mas não
 * uma troca de aba durante a geração.
 */
export function startChallengeGenerate(ctx: {
  trackSlug: string;
  lessonId: string;
  target: ChallengeGenerateTarget;
}): number | null {
  if (state.status === 'running') return null;
  const id = ++generationCounter;
  setState({
    status: 'running',
    stage: 0,
    generationId: id,
    trackSlug: ctx.trackSlug,
    lessonId: ctx.lessonId,
    target: ctx.target,
    challengeId: null,
    challengeTitle: null,
    errorMessage: null,
    listVersion: state.listVersion,
  });
  return id;
}

/** Avança para a etapa dada (só PARA FRENTE — eventos idempotentes/atrasados
 *  são no-op). Etapa 1 (Escrevendo os testes) conclui por salto: etapas <
 *  ativa ficam concluídas (ver cabeçalho). */
export function advanceChallengeGenerateStage(stageIndex: number, generationId?: number): void {
  if (state.status !== 'running') return;
  if (!matchesGeneration(generationId)) return; // ALTO-2: processo anterior
  const next = Math.min(4, Math.max(0, stageIndex));
  if (next <= state.stage) return;
  setState({ ...state, stage: next });
}

/** Conclui com sucesso (estado terminal sticky — ver cabeçalho). */
export function finishChallengeGenerate(challenge: { slug: string; title: string }, generationId?: number): void {
  if (state.status === 'done' || state.status === 'error') return;
  if (!matchesGeneration(generationId)) return; // ALTO-2: processo anterior
  setState({
    ...state,
    status: 'done',
    stage: 4,
    challengeId: challenge.slug,
    challengeTitle: challenge.title,
    // MÉDIO-2: o token sobe SÓ no done — a LessonView re-busca a lista.
    listVersion: state.listVersion + 1,
  });
}

/** Falha com mensagem (estado terminal sticky — ver cabeçalho). */
export function failChallengeGenerate(message: string, generationId?: number): void {
  if (state.status === 'done' || state.status === 'error') return;
  if (!matchesGeneration(generationId)) return; // ALTO-2: processo anterior
  setState({ ...state, status: 'error', errorMessage: message });
}

/** Fecha o modal / CANCELA o processo (botão "Cancelar", Esc ou backdrop —
 *  revisão MÉDIO-1). NÃO aborta o main: a geração continua e o desafio PODE
 *  ser persistido depois; os terminais atrasados chegam com o generationId
 *  antigo (o reset gera um novo no próximo start) e são descartados. */
export function resetChallengeGenerate(): void {
  setState({ ...IDLE_STATE, listVersion: state.listVersion });
}

/** Aplica um evento de progresso do main (chamado pelo listener do modal). */
export function applyChallengeGenerateProgress(ev: TrackRegenerateProgressEvent): void {
  switch (ev.stage) {
    case 'generating':
      advanceChallengeGenerateStage(0, ev.generationId);
      break;
    case 'validating':
      advanceChallengeGenerateStage(2, ev.generationId);
      break;
    case 'executing':
      advanceChallengeGenerateStage(3, ev.generationId);
      break;
    case 'inserting':
      advanceChallengeGenerateStage(4, ev.generationId);
      break;
    case 'done':
      if (ev.challenge) finishChallengeGenerate(ev.challenge, ev.generationId);
      break;
    case 'error':
      failChallengeGenerate(ev.error ?? 'não foi possível gerar um novo desafio.', ev.generationId);
      break;
  }
}

/** Lê o estado SEM consumir (peek — o par de subscribe p/ useSyncExternalStore). */
export function peekChallengeGenerate(): ChallengeGenerateState {
  return state;
}

/** Assina mudanças do estado (devolve unsubscribe). */
export function subscribeChallengeGenerate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reseta o estado do módulo (só para testes — chamado no beforeEach). */
export function __resetChallengeGenerateForTests(): void {
  state = IDLE_STATE;
  listeners.clear();
  generationCounter = 0;
}
