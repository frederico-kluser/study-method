/**
 * src/lib/challengeDraftCache.ts — CACHE DE SESSÃO do rascunho do desafio de
 * TRILHA (onda1-desafio-retomar).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ELE MATA (medido, não deduzido)
 * ══════════════════════════════════════════════════════════════════════════
 * O shell do app monta SÓ a view ativa (`src/App.tsx`: `const View =
 * VIEWS[active]`). Trocar de aba DESMONTA o TrackChallengePanel e, ao voltar, o
 * `loadSpec` reinicializa tudo dos starters: o código que o aluno escreveu
 * volta ao `starterCode`, o cronômetro zera (`started=false`, `elapsedMs=0`),
 * as estrelas voltam a 3 e o veredito (`concluded`/`result`) some. O aluno
 * PERDE o trabalho — é o pedido literal do dono: *"quando eu saio de um desafio
 * e volto ele recomeça do zero, arrume isso também"*.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A DECISÃO
 * ══════════════════════════════════════════════════════════════════════════
 * Mesmo padrão da casa já usado no MESMO problema para o chat da aula
 * (`src/lib/lessonChatCache.ts`, onda3-chat-cache) e para o processo global de
 * "Gerar novo desafio" (`src/lib/challengeGenerateStore.ts`): cache EM MEMÓRIA
 * (variável de módulo), chaveado por desafio. O painel SALVA o rascunho no
 * UNMOUNT e RESTAURA quando `loadSpec` resolve com a mesma chave; `take` é
 * DRAIN one-shot (lê E limpa), então a restauração acontece UMA vez por
 * navegação e nunca "volta no tempo" numa remontagem posterior.
 *
 * POR QUE CACHE DE SESSÃO EM MEMÓRIA (e não localStorage/DB):
 *   - o dado é RASCUNHO DE UI (código ainda não submetido, cronômetro,
 *     estrelas da tentativa em curso), não progresso AUTORITATIVO — o
 *     progresso de verdade continua no banco via `challenge_attempts`
 *     (study:mark-challenge-attempt), que é o que o gate da aula lê;
 *   - é o MESMO padrão de `lessonChatCache`/`challengeGenerateStore`: o módulo
 *     vive no processo do renderer e sobrevive à desmontagem do componente,
 *     sem I/O, sem schema, sem migração e sem escrever no disco do aluno;
 *   - o alvo são rascunhos PEQUENOS (o código de um punhado de arquivos + um
 *     punhado de escalares), então um Map de módulo é suficiente — nada de
 *     limite de tamanho/expiração;
 *   - o cache morre com o processo: fechar o app descarta rascunhos não
 *     submetidos. Aceito e documentado — persistir rascunho em disco seria
 *     outra decisão de produto (não é esta).
 *
 * Módulo PURO (sem React, sem DOM — só o TIPO do contrato importado): testável
 * via node:test, mesmo padrão dos demais pendentes de src/lib.
 *
 * SEMÂNTICA DE REFERÊNCIA: `saveChallengeDraft` guarda o snapshot COMO ESTÁ;
 * `takeChallengeDraft` devolve um CLONE (raso nos escalares + cópia de
 * `filesCode`, que é o único campo aninhado mutável) para o chamador nunca
 * segurar a referência interna do cache. `result` é compartilhado por
 * referência — é o `TrackSubmitResult` do submit, que o painel só LÊ.
 */
import type { TrackSubmitResult } from '../../shared/ipc-contract';

/** Alvo do desafio (mesma união de `TrackChallengeNavSelection`). */
export type ChallengeDraftTarget = 'lesson' | 'proficiency' | 'module';

/** Veredito TERMINAL já mostrado na tela (o `concluded` do painel; null =
 *  tentativa em curso ou nem começada). 'abandoned' NÃO entra: o abandono é
 *  gravado no unmount e nunca vira estado de UI. */
export type ChallengeDraftConclusion = 'passed' | 'failed' | 'timeout' | null;

/**
 * Par chaveador do cache — o desafio cujo rascunho está sendo guardado.
 * `challengeId` é o SLUG do desafio que está na tela (`spec.slug`): o handler
 * recusa qualquer `challengeId` que não bata com o slug do desafio resolvido
 * (`electron/main/ipc/track-handlers.ts`), então numa carga normal ele é igual
 * ao `challengeId` da selection — e continua correto quando a REGENERAÇÃO
 * troca o desafio sem trocar a selection.
 */
export interface ChallengeDraftKey {
  trackSlug: string;
  target: ChallengeDraftTarget;
  /** aula (target 'lesson'). */
  lessonId?: string;
  /** módulo (target 'module'). */
  moduleSlug?: string;
  /** slug do desafio em cena. */
  challengeId: string;
}

/**
 * Snapshot COMPLETO do que o painel zera ao remontar: sem ele, "voltar para o
 * desafio" recomeça do zero em TODOS os eixos (código, relógio, estrelas e
 * veredito).
 */
export interface ChallengeDraft {
  /** código do editor único (desafio de arquivo único). */
  code: string;
  /** ADITIVO (rodada 9): código por caminho — desafio MULTI-ARQUIVO. */
  filesCode: Record<string, string>;
  /** arquivo ativo no seletor de abas (path; null no arquivo único). */
  activeFile: string | null;
  /** ato 1: o cronômetro já foi disparado? */
  started: boolean;
  /** tempo ACUMULADO de tentativa (o relógio PAUSA enquanto a aba está fora). */
  elapsedMs: number;
  /** estrelas que o aluno TINHA (valor exibido — nunca é "devolvido"). */
  starsLeft: number;
  /** veredito na tela (null = tentativa em curso). */
  concluded: ChallengeDraftConclusion;
  /** `TrackSubmitResult` do submit — a saída/checklist do erro voltam com ele. */
  result: TrackSubmitResult | null;
  /** veredito já GRAVADO no banco (o `markedRef` do painel — evita regravar
   *  o mesmo terminal depois de restaurar). */
  marked: string | null;
}

/** Escopo do desafio DENTRO do alvo: aula para 'lesson', módulo para 'module',
 *  vazio para 'proficiency'. É dirigido pelo `target` (e não por "lessonId ??
 *  moduleSlug") para que um campo trocado não colida com o campo do outro
 *  alvo. */
function scopeOf(key: ChallengeDraftKey): string {
  if (key.target === 'lesson') return key.lessonId ?? '';
  if (key.target === 'module') return key.moduleSlug ?? '';
  return '';
}

/**
 * Chave canônica (string) do rascunho: `trackSlug:target:escopo:challengeId`.
 * ':' não ocorre em slugs de trilha/aula/módulo/desafio (são slugs de arquivo)
 * e a chave tem SEMPRE 4 segmentos, então a concatenação é INJETIVA — o mesmo
 * racional do `toCacheKey` do lessonChatCache. Exportada para o teste provar a
 * injetividade sem depender do formato interno do Map.
 */
export function challengeDraftCacheKey(key: ChallengeDraftKey): string {
  return `${key.trackSlug}:${key.target}:${scopeOf(key)}:${key.challengeId}`;
}

const cache = new Map<string, ChallengeDraft>();

/**
 * Salva o rascunho ATUAL do desafio no cache de sessão — chamado pelo painel
 * no UNMOUNT (troca de aba) e na TROCA DE DESAFIO com o painel montado. O
 * snapshot é guardado POR REFERÊNCIA (ver cabeçalho).
 */
export function saveChallengeDraft(key: ChallengeDraftKey, draft: ChallengeDraft): void {
  cache.set(challengeDraftCacheKey(key), draft);
}

/**
 * Lê E CONSOME (drain one-shot) o rascunho cacheado — a restauração só acontece
 * UMA vez por navegação: a segunda chamada devolve null (nenhum rascunho
 * "fantasma" reaparece numa remontagem futura). Devolve um CLONE: escalares
 * copiados e `filesCode` copiado um nível (é o único objeto aninhado que um
 * chamador poderia mutar no lugar).
 */
export function takeChallengeDraft(key: ChallengeDraftKey): ChallengeDraft | null {
  const k = challengeDraftCacheKey(key);
  const stored = cache.get(k);
  if (stored === undefined) return null;
  cache.delete(k);
  return { ...stored, filesCode: { ...stored.filesCode } };
}

/** Remove o rascunho cacheado do desafio (limpeza pontual). */
export function clearChallengeDraft(key: ChallengeDraftKey): void {
  cache.delete(challengeDraftCacheKey(key));
}

/** Esvazia TODO o cache (só para testes — chamado no beforeEach). */
export function __resetChallengeDraftForTests(): void {
  cache.clear();
}

/**
 * Retentor do drain para a carga da spec no painel (mesmo padrão do
 * `createLessonChatHolder` do lessonChatCache). POR QUÊ: em dev o React
 * <StrictMode> executa os efeitos em double-invoke (setup → cleanup → setup) do
 * MESMO fiber, e o efeito de montagem do painel chama `loadSpec` DUAS vezes
 * (aquele efeito não tem cleanup; o guard de montagem do loadSpec é o
 * `cancelledRef` do componente, que o 2º setup RESETA para `false`, então
 * nenhuma das duas passadas é barrada e os dois `.then` rodam). Como
 * `takeChallengeDraft` é one-shot, a 1ª passada consumiria o cache e a 2ª veria
 * null, REINICIALIZANDO o desafio dos starters e jogando fora a restauração (o
 * último setState vence). Refs do MESMO fiber sobrevivem ao ciclo
 * setup→cleanup→setup, então o holder retém o resultado do take e cada passada
 * devolve o MESMO rascunho.
 *
 * Semântica: `get()` faz o take no PRIMEIRO acesso e RETÉM o valor dali em
 * diante — nunca re-drena (uma instância não rouba o cache de outra montagem
 * real) e nunca devolve null depois de ter retido um valor. Cache vazio no
 * primeiro acesso → retém null (retorna null sempre).
 */
export function createChallengeDraftHolder(key: ChallengeDraftKey): {
  get(): ChallengeDraft | null;
} {
  let held: ChallengeDraft | null = null;
  let drained = false;
  return {
    get(): ChallengeDraft | null {
      if (!drained) {
        held = takeChallengeDraft(key);
        drained = true;
      }
      return held;
    },
  };
}
