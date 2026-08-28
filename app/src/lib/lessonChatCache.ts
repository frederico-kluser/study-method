/**
 * src/lib/lessonChatCache.ts — CACHE DE SESSÃO do chat da aula (onda3-chat-cache).
 *
 * O shell do app monta SÓ a view ativa: sair da aba Aula (para o Desafio, a
 * Trilha etc.) DESMONTA a LessonView e zera o estado local dela
 * (trackLesson/chat/lesson). Sem este cache, "o chat que volta" após uma
 * falha de desafio (fluxo de erro da Onda 2) era um chat NOVO — o histórico
 * e as seções apresentadas da teoria se perdiam, e a teoria recomeçava da
 * seção 1. A Onda 3 preserva o estado do chat ENTRE desmontagens:
 *
 *   - a LessonView SALVA o estado do chat no UNMOUNT (`saveLessonChat`);
 *   - a LessonView RESTAURA na MONTAGEM (`takeLessonChat`) quando um alvo
 *     de aula chega (report de erro do desafio ou pendência da trilha) e a
 *     key bate com o alvo;
 *   - `takeLessonChat` é DRAIN one-shot (lê E limpa) e ZERA `lastError` no
 *     estado devolvido — um erro transiente do último turno não pode voltar
 *     como Alert na restauração.
 *
 * Cache EM MEMÓRIA (variável de módulo), chaveado por `trackSlug:lessonId`.
 * Módulo PURO (sem React/DOM, sem listeners — nada re-renderiza): testável
 * via node:test, como os demais pendentes de src/lib.
 *
 * SEMÂNTICA DE REFERÊNCIA: `saveLessonChat` guarda o objeto COMO ESTÁ (sem
 * clone). Isso é seguro porque `TrackLessonUiState` é IMUTÁVEL por contrato —
 * os helpers de trackLessonState devolvem um objeto NOVO a cada update e a
 * LessonView nunca muta o estado (setChat recebe sempre estados novos).
 * `takeLessonChat` devolve um CLONE RASO (`{ ...stored, lastError: null }`)
 * para o chamador nunca segurar a referência interna do cache.
 */
import type { TrackLessonUiState } from './trackLessonState';

/** Par chaveador do cache — a aula de trilha cujo chat está sendo guardado. */
export interface LessonChatKey {
  trackSlug: string;
  lessonId: string;
}

/** Chave composta: ':' não ocorre em slugs de trilha/aula (são slugs de
 *  arquivo), então a concatenação é injetiva. */
function toCacheKey(key: LessonChatKey): string {
  return `${key.trackSlug}:${key.lessonId}`;
}

const cache = new Map<string, TrackLessonUiState>();

/**
 * Salva o estado ATUAL do chat da aula no cache de sessão (chamado pela
 * LessonView no UNMOUNT). O objeto é guardado POR REFERÊNCIA (documentado no
 * cabeçalho: TrackLessonUiState é imutável por contrato — um chat nunca
 * iniciado não precisa ser salvo; quem decide o quê salvar é a view).
 */
export function saveLessonChat(key: LessonChatKey, state: TrackLessonUiState): void {
  cache.set(toCacheKey(key), state);
}

/**
 * Lê E CONSOME (drain one-shot) o chat cacheado da aula — a restauração só
 * acontece UMA vez por navegação: a segunda chamada devolve null. O estado
 * devolvido é um CLONE RASO com `lastError` zerado (um erro transiente do
 * último turno não pode reaparecer como Alert na aula restaurada); os demais
 * campos (history/presentedSections/theoryDone/challengeError) são o MESMO
 * objeto guardado (clone raso — as arrays são compartilhadas).
 */
export function takeLessonChat(key: LessonChatKey): TrackLessonUiState | null {
  const stored = cache.get(toCacheKey(key));
  if (stored === undefined) return null;
  cache.delete(toCacheKey(key));
  return { ...stored, lastError: null };
}

/** Remove o chat cacheado da aula (limpeza pontual). */
export function clearLessonChat(key: LessonChatKey): void {
  cache.delete(toCacheKey(key));
}

/** Esvazia TODO o cache (só para testes — chamado no beforeEach). */
export function __resetLessonChatForTests(): void {
  cache.clear();
}

/**
 * Retentor do drain do cache para a MONTAGEM da LessonView (padrão do
 * `createTrackLessonPendingHolder` de pendingSubject.ts — anti-StrictMode).
 *
 * POR QUÊ: em dev o React <StrictMode> executa os efeitos em double-invoke
 * (setup → cleanup → setup) do MESMO fiber. `takeLessonChat` é one-shot: o
 * setup da passada 1 consome o cache e a passada 2 veria null — e como a
 * passada 2 RE-executa o mesmo efeito, ela sobrescreveria a restauração da
 * passada 1 com um chat vazio (o último setChat vence). Refs do MESMO fiber
 * SOBREVIVEM ao ciclo setup→cleanup→setup, então o holder retém o resultado
 * do take e cada passada devolve o MESMO estado.
 *
 * Semântica: `get()` faz o take no PRIMEIRO acesso e RETÉM o valor dali em
 * diante — nunca re-drena (uma instância não rouba o cache de outra montagem
 * real) e nunca devolve null depois de ter retido um valor. Cache vazio no
 * primeiro acesso → retém null (retorna null sempre).
 */
export function createLessonChatHolder(key: LessonChatKey): {
  get(): TrackLessonUiState | null;
} {
  let held: TrackLessonUiState | null = null;
  let drained = false;
  return {
    get(): TrackLessonUiState | null {
      if (!drained) {
        held = takeLessonChat(key);
        drained = true;
      }
      return held;
    },
  };
}
