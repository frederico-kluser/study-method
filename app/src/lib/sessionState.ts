/**
 * src/lib/sessionState.ts — estado de SESSÃO do app (assunto, fase, atividade).
 *
 * ─── POR QUE ESTE MÓDULO EXISTE ────────────────────────────────────────────
 * O redesign (docs/ux-redesign.md §1 e §7.2) importa o padrão do HOME Menu do
 * 3DS: *"in a separate frame from those normal icons, up above, we lined up
 * Notifications, friend list and Game Notes"* — o estado transitório e GLOBAL
 * mora num quadro à parte ACIMA do conteúdo, chamável a qualquer momento sem
 * derrubar o trabalho de baixo.
 *
 * Só que o quadro não tinha o que mostrar. Até esta onda, `subject`, `status` e
 * `phase` viviam em `useState` LOCAL da `LessonView` (LessonView.tsx:233-243) e
 * o shell monta SÓ a view ativa (App.tsx) — sair da aba Aula desmontava a view
 * e apagava o assunto e a fase. Um quadro de estado alimentado por estado local
 * de uma view desmontável nasce vazio. Por isso o estado sobe para um contexto
 * ACIMA das views: o quadro lê daqui, e a view PUBLICA aqui.
 *
 * ─── ONDE ESTE ARQUIVO MORA E POR QUÊ ──────────────────────────────────────
 * Mesma forma de `src/lib/challengeNav.ts`, que é o precedente desta base:
 *   - LÓGICA PURA (contexto + reducer + hooks) aqui em `src/lib/` — sem JSX,
 *     então o `tsconfig.node.json` (que já inclui `src/lib`) compila e o
 *     `tests/sessionState.test.ts` roda em node:test SEM jsdom;
 *   - o PROVIDER com JSX fica em `src/components/sessionState/`.
 *
 * ─── DECISÃO: O REDUCER NÃO LÊ O RELÓGIO ───────────────────────────────────
 * O carimbo de "última atividade" é DADO DA AÇÃO (`at`), não `Date.now()` lido
 * dentro do reducer. Assim o reducer continua puro e o teste consegue afirmar
 * exatamente quando a atividade é (e quando NÃO é) carimbada. Quem lê o relógio
 * é o hook `useSessionStateMachine`, na borda.
 *
 * ─── DECISÃO: PUBLICAR O MESMO VALOR NÃO É ATIVIDADE ───────────────────────
 * `sessionReducer` devolve o MESMO objeto de estado quando nada mudou de fato.
 * Isso não é micro-otimização: a `LessonView` recebe eventos de progresso em
 * rajada (`study:lesson-progress`), e repetir a mesma fase 20x não pode nem
 * re-renderizar o quadro nem mover o carimbo de atividade — senão "última
 * atividade" viraria "último evento recebido", que é outra coisa.
 */
import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import type { LessonPhaseKey } from './lessonProgress';
import { lessonPhaseKey, type LessonPhaseLabelKey } from './lessonPhaseLabels';

/**
 * Estado da geração de aula, espelhando o `GenerateStatus` da LessonView
 * ('idle' | 'running' | 'done' | 'error'). Duplicado aqui de propósito: este
 * módulo é PURO e não pode importar de `src/views` (que é React/DOM e está fora
 * do tsconfig.node.json). A onda 3, ao ligar a LessonView, deve importar ESTE
 * tipo e apagar o local.
 */
export type SessionLessonStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * ONDA2-LOADER-GLOBAL — o vocabulário do canal de ocupação. É o QUE está em
 * voo agora, no vocabulário da AULA (e do desafio), NÃO o texto da tela: o
 * texto mora no i18n (`lesson.busy.*`) e a tradução é feita pelo consumidor
 * (GlobalBusyIndicator) — aqui só trafega a chave canônica, como
 * `LessonPhaseKey` faz para `lesson.phase.*`.
 *
 * Valores camelCase de propósito: cada um É a última parte da chave i18n
 * (`lesson.busy.<reason>`), então acrescentar um motivo novo é acrescentar a
 * chave nos DOIS locales + um valor aqui — nada mais.
 *
 *   - `responder`      — turno do tutor respondendo a dúvida (pendingAction 'answer');
 *   - `proximaSecao`   — turno determinístico do "Próximo" (pendingAction 'next');
 *   - `digitando`      — bolha em digitação (streamingIds) — seção ou explicação;
 *   - `explicando`     — ciclo do quiz escrevendo a explicação do erro;
 *   - `gerando`        — ciclo do quiz gerando o quiz remediador;
 *   - `aguardandoVez`  — ciclo do quiz QUER rodar mas espera o turno do tutor
 *                        (a fila FIFO do LLM local — a causa do "travou" do
 *                        dono; o card do quiz já dizia, o app inteiro não);
 *   - `concluindo`     — "Concluir aula" gravando (busy sem pendingAction e
 *                        SEM regeneração de desafio em voo — essa é `gerando`).
 *                        Fix do revisor adversarial: a regeneração de desafio
 *                        (`handleRegenerateFromBubble`) também é busy sem
 *                        pendingAction — sem o `regenerating` abaixo, o loader
 *                        global diria "Concluindo a aula" durante MINUTOS de
 *                        geração de desafio, mentira.
 */
export type SessionBusyReason =
  | 'responder'
  | 'proximaSecao'
  | 'digitando'
  | 'explicando'
  | 'gerando'
  | 'aguardandoVez'
  | 'concluindo';

/** Sinal de ocupação publicado no snapshot — só a razão, de propósito. */
export interface SessionBusySignal {
  reason: SessionBusyReason;
}

/** true quando o valor é um sinal de ocupação bem-formado (não é null). */
function isSessionBusySignal(value: unknown): value is SessionBusySignal {
  if (value === null || typeof value !== 'object') return false;
  const reason = (value as { reason?: unknown }).reason;
  return (
    reason === 'responder' ||
    reason === 'proximaSecao' ||
    reason === 'digitando' ||
    reason === 'explicando' ||
    reason === 'gerando' ||
    reason === 'aguardandoVez' ||
    reason === 'concluindo'
  );
}

/**
 * Chave i18n do rótulo do loader global para uma razão de ocupação. PURA e
 * trivial de propósito — o par `reason` ⟷ chave vive NUM lugar só (o camelCase
 * dos valores É o sufixo da chave), então o consumidor nunca traduz na mão.
 */
export function sessionBusyLabelKey(reason: SessionBusyReason): `lesson.busy.${SessionBusyReason}` {
  return `lesson.busy.${reason}`;
}

/**
 * ONDA2-LOADER-GLOBAL — a DERIVAÇÃO PURA do canal: os estados que a
 * LessonView já sabe (busy, pendingAction, streaming, status do quiz em cena)
 * viram UM motivo de ocupação, ou null quando NADA está em voo (o indicador
 * global some).
 *
 * ─── POR QUE AQUI (e não dentro da LessonView) ─────────────────────────────
 * Mesmo motivo do `sessionPhaseLabelKey`: a regra "o que o app está fazendo
 * agora" é de negócio, não de desenho — testável em node:test sem jsdom, e o
 * componente só desenha. NÃO DUPLIQUE esta prioridade no JSX.
 *
 * ─── A PRIORIDADE É A VERDADE DO MOMENTO ───────────────────────────────────
 *   1. Estados de TRABALHO do ciclo do quiz vencem: 'aguardandoVez' é a causa
 *      raiz do congelamento sentido pelo dono (fila FIFO do LLM local) — se o
 *      ciclo está esperando a vez, é ISSO que o app inteiro tem de dizer, mesmo
 *      com um turno do tutor em voo atrás do qual ele espera;
 *   2. 'explicando'/'gerando' — o ciclo tem um pedido REAL em voo;
 *   3. turno do tutor: 'answer' (LLM, pode demorar) → 'next' (determinístico)
 *      → busy SEM pendingAction: com regeneração de desafio em voo é 'gerando'
 *      (a geração REAL que está aí); sem, o único caminho que sobra é o
 *      "Concluir aula" gravando;
 *   4. digitação (streaming) — só EXIBIÇÃO, então perde para qualquer trabalho
 *      de verdade;
 *   5. nada → null (oculto).
 *
 * ATENÇÃO (risco 2 do revisor): `challengeBadgeCount` NÃO é entrada — é GATING
 * DE BADGE, nunca sinal de ocupação. Esta função o menciona só para proibir.
 */
export interface LessonBusyInput {
  /** O status do quiz em cena (QuizOverlayStatus) ou null sem card. */
  quizStatus: string | null;
  /** Turno do tutor em voo. */
  busy: boolean;
  /** A ação do turno em voo ('answer' | 'next' | null). */
  pendingAction: 'next' | 'answer' | null;
  /** Há bolha digitando (streamingIds não vazio). */
  streaming: boolean;
  /**
   * ONDA2-LOADER-GLOBAL (fix do revisor adversarial): regeneração de desafio
   * em voo (a LessonView tem o estado: `generateRunning`). Só é consultada
   * quando busy vem SEM pendingAction — um turno 'answer'/'next' do tutor
   * vence (o tutor é o turno em curso; a geração roda ao lado, com o modal
   * próprio mostrando o progresso).
   */
  regenerating: boolean;
}

export function lessonBusyReasonFor(input: LessonBusyInput): SessionBusyReason | null {
  if (input.quizStatus === 'aguardando-vez') return 'aguardandoVez';
  if (input.quizStatus === 'explicando') return 'explicando';
  if (input.quizStatus === 'gerando') return 'gerando';
  if (input.busy) {
    if (input.pendingAction === 'answer') return 'responder';
    if (input.pendingAction === 'next') return 'proximaSecao';
    // Fix do revisor: regeneração de desafio também é busy sem pendingAction —
    // sem esta verificação o loader diria "Concluindo a aula" durante TODA a
    // geração (minutos). 'gerando' já existe na união e nos dois locales.
    if (input.regenerating) return 'gerando';
    return 'concluindo';
  }
  if (input.streaming) return 'digitando';
  return null;
}

/** Instantâneo do estado de sessão — é isto que o quadro superior lê. */
export interface SessionSnapshot {
  /** Assunto atual da aula (já normalizado: trim; vazio vira null). */
  subject: string | null;
  /** Fase da aula em curso, no vocabulário do parser `lessonProgress`. */
  phase: LessonPhaseKey | null;
  /** Estado da geração. */
  status: SessionLessonStatus;
  /** Fração 0..1 do progresso da fase (0 quando desconhecida). */
  fraction: number;
  /**
   * ONDA2-LOADER-GLOBAL — o que está em voo AGORA, ou null quando nada está
   * (o loader global do shell some). Transiente por desenho: sobrevive a
   * re-render, morre com a view que o publicou (o cleanup publica null).
   */
  busy: SessionBusySignal | null;
  /** Carimbo (epoch ms) da última mudança REAL de estado; null antes da 1ª. */
  lastActivityAt: number | null;
}

/** Sessão zerada — nada publicado ainda. */
export const INITIAL_SESSION: SessionSnapshot = {
  subject: null,
  phase: null,
  status: 'idle',
  fraction: 0,
  busy: null,
  lastActivityAt: null,
};

/**
 * O que se pode publicar. É um PATCH parcial de propósito: quem publica manda
 * só o que sabe (a LessonView sabe o assunto no submit e a fase no progresso —
 * em momentos diferentes) e nunca precisa reconstruir o snapshot inteiro.
 *
 * ─── CONTRATO DE `undefined` / `null` — VALE PARA OS CINCO CAMPOS ──────────
 * (os quatro originais + o canal de ocupação `busy`, ONDA2-LOADER-GLOBAL)
 * A regra é UMA SÓ, sem exceção por campo:
 *
 *   • campo AUSENTE **ou presente com `undefined`** ⇒ "NÃO MEXA". Preserva o
 *     valor anterior e NÃO carimba `lastActivityAt` (se nada mais mudar, o
 *     reducer devolve o mesmo objeto por identidade);
 *   • `subject: null`  ⇒ limpa o assunto (volta a `null`);
 *   • `phase: null`    ⇒ limpa a fase (volta a `null`);
 *   • `fraction: null` ⇒ ZERA a fração. `0` é o vazio dela — o snapshot não tem
 *     "fração desconhecida" separada de zero (ver `INITIAL_SESSION.fraction`),
 *     então `null` é aceito e significa exatamente "volte ao vazio", simétrico
 *     com os dois de cima;
 *   • `status` NÃO tem forma de limpeza: o vazio dele é o literal `'idle'`, que
 *     se publica explicitamente. Qualquer valor fora da união (incluindo `null`)
 *     é IGNORADO, como se o campo não tivesse vindo;
 *   • ONDA2-LOADER-GLOBAL — `busy: null` LIMPA a ocupação (o "nada em voo");
 *     objeto com `reason` da união publica; qualquer outra forma é IGNORADA.
 *     E o canal NUNCA carimba `lastActivityAt` — ver a decisão no reducer.
 *
 * POR QUE `undefined` PRECISA SER INERTE, e não é preciosismo: o `tsconfig.json`
 * do renderer (quem chama `publishSession`) não liga `strict` nem
 * `exactOptionalPropertyTypes`. Então `publishSession({ subject: talvezUndefined })`
 * COMPILA — e uma regra em que `undefined` limpa apagaria o quadro de estado em
 * silêncio, no meio de uma aula, só porque a origem do dado é um campo opcional.
 * Limpar continua possível, mas tem de ser DITO: passa-se `null`.
 */
export interface SessionPatch {
  subject?: string | null;
  phase?: LessonPhaseKey | null;
  status?: SessionLessonStatus;
  fraction?: number | null;
  /** Sinal de ocupação; `null` limpa (nada em voo). Ver o contrato acima. */
  busy?: SessionBusySignal | null;
}

/** Ações do reducer. `at` é o relógio INJETADO (o reducer não lê Date.now). */
export type SessionAction =
  | { type: 'publish'; patch: SessionPatch; at: number }
  | { type: 'reset'; at: number };

/** Normaliza o assunto: trim, e string vazia vira null (nunca `''` no estado). */
export function normalizeSubject(subject: string | null | undefined): string | null {
  if (typeof subject !== 'string') return null;
  const trimmed = subject.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Prende a fração no intervalo 0..1 (o parser já normaliza, mas o contexto é
 * público). Não-números — `null`, `undefined`, `NaN` — viram 0, que é o VAZIO
 * da fração. Atenção: quem decide se o campo deve ser tocado é o reducer, não
 * este normalizador; aqui `undefined` só descreve "sem número", nunca
 * "não mexa" (ver o contrato em `SessionPatch`).
 */
export function clampFraction(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * True quando o valor pertence à união `SessionLessonStatus`.
 *
 * Existe porque o patch chega de código compilado SEM `strict` (o
 * `tsconfig.json` do renderer): ali `status: null` ou `status: algumaString`
 * passa pelo compilador. Sem esta trava, um valor de fora da união entraria no
 * snapshot e o `sessionPhaseLabelKey` passaria a mostrar fase em sessão morta.
 */
function isSessionStatus(value: unknown): value is SessionLessonStatus {
  return value === 'idle' || value === 'running' || value === 'done' || value === 'error';
}

/**
 * Reducer PURO do estado de sessão.
 *
 * Devolve `state` POR IDENTIDADE quando o patch não muda nada — ver a decisão
 * no cabeçalho: rajada de progresso repetindo a mesma fase não é atividade.
 *
 * A guarda de cada campo é `!== undefined`, e é a MESMA nos cinco — nunca
 * `'campo' in patch`. A diferença não é cosmética: `{ subject: undefined }` tem
 * a chave presente, então `in` deixaria passar um `undefined` que a
 * normalização converteria em "limpe". Como o renderer compila sem `strict`
 * (ver o contrato em `SessionPatch`), esse caminho é alcançável de verdade.
 */
export function sessionReducer(state: SessionSnapshot, action: SessionAction): SessionSnapshot {
  if (action.type === 'reset') {
    return { ...INITIAL_SESSION, lastActivityAt: action.at };
  }

  const { patch } = action;
  const next: SessionSnapshot = { ...state };
  let changed = false;
  // ONDA2-LOADER-GLOBAL: separa "mudou algo de PROGRESSO" de "mudou só o
  // canal transiente" — só o primeiro carimba lastActivityAt (ver a decisão
  // no bloco do busy abaixo).
  let changedOutsideBusy = false;

  if (patch.subject !== undefined) {
    // Só chega aqui com string ou null: `null` (e string em branco) limpa.
    const subject = normalizeSubject(patch.subject);
    if (subject !== state.subject) {
      next.subject = subject;
      changed = true;
      changedOutsideBusy = true;
    }
  }
  if (patch.phase !== undefined) {
    // `null` limpa a fase; qualquer LessonPhaseKey a troca.
    const phase = patch.phase;
    if (phase !== state.phase) {
      next.phase = phase;
      changed = true;
      changedOutsideBusy = true;
    }
  }
  if (patch.status !== undefined && isSessionStatus(patch.status) && patch.status !== state.status) {
    next.status = patch.status;
    changed = true;
    changedOutsideBusy = true;
  }
  if (patch.fraction !== undefined) {
    // `null` zera (0 é o vazio da fração — não há "desconhecida" separada).
    const fraction = clampFraction(patch.fraction);
    if (fraction !== state.fraction) {
      next.fraction = fraction;
      changed = true;
      changedOutsideBusy = true;
    }
  }
  // ─── ONDA2-LOADER-GLOBAL: o canal de ocupação ──────────────────────────────
  // MESMA guarda `!== undefined` dos outros campos (o compilador do renderer
  // não é `strict` — ver o contrato em SessionPatch: `busy: undefined` tem de
  // ser inerte, não limpar). `null` limpa; só um sinal bem-formado entra.
  //
  // ─── DECISÃO: O CANAL DE OCUPAÇÃO NÃO É "ATIVIDADE" ────────────────────────
  // Mudanças de `busy` NÃO carimbam `lastActivityAt` — de propósito, e mesmo
  // na limpeza. O carimbo alimenta "última atividade" do quadro de sessão: uma
  // métrica de PROGRESSO DE AULA (assunto, fase, fração). A ocupação é estado
  // TRANSIENTE de UI que muda várias vezes por turno (e a digitação muda a
  // cada bolha): carimbaria o carimbo sem progresso nenhum e o tornaria
  // "último pulso do loader" — que é exatamente a confusão que a decisão do
  // cabeçalho existe para evitar. Quem precisa de recência de ocupação é o
  // próprio indicador, que some quando o canal volta a null.
  if (patch.busy !== undefined) {
    if (patch.busy === null) {
      if (state.busy !== null) {
        next.busy = null;
        changed = true;
      }
    } else if (isSessionBusySignal(patch.busy) && patch.busy.reason !== state.busy?.reason) {
      next.busy = { reason: patch.busy.reason };
      changed = true;
    }
  }

  if (!changed) return state;
  // O canal de ocupação NÃO carimba: ocupação é transiente de UI (ver a
  // decisão acima). Carimbo só quando a mudança REAL foi de progresso de
  // aula (assunto, fase, fração, status).
  if (changedOutsideBusy) next.lastActivityAt = action.at;
  return next;
}

/**
 * Chave i18n do rótulo da fase para o quadro superior, ou null quando não há
 * fase a mostrar (sessão ociosa). PURA — é aqui que mora a regra "o quadro
 * mostra a fase" para que o componente não decida nada.
 *
 * Regra: sem fase publicada, ou sessão em `idle`, o quadro mostra o texto de
 * ociosidade (`shell.session.idle`), não uma fase inventada.
 */
export function sessionPhaseLabelKey(snapshot: SessionSnapshot): LessonPhaseLabelKey | null {
  if (snapshot.phase === null || snapshot.status === 'idle') return null;
  return lessonPhaseKey(snapshot.phase);
}

/**
 * ONDA2-LOADER-GLOBAL — true quando HÁ trabalho em voo publicado. É o único
 * critério do indicador global do shell para aparecer/some — nunca a fase, o
 * status de geração ou o badge de desafios (risco 2 do revisor).
 */
export function isSessionBusy(snapshot: SessionSnapshot): boolean {
  return snapshot.busy !== null;
}

/** True quando a sessão ainda não tem NADA para mostrar (quadro em repouso). */
export function isSessionIdle(snapshot: SessionSnapshot): boolean {
  return snapshot.subject === null && sessionPhaseLabelKey(snapshot) === null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CONTEXTO — o que a árvore consome
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Valor do contexto: o snapshot + as DUAS portas de escrita. */
export interface SessionStateValue extends SessionSnapshot {
  /**
   * ÚNICA porta de publicação. Chame com o que mudou; o que não vier no patch —
   * ou vier como `undefined` — fica EXATAMENTE como está (contrato completo em
   * `SessionPatch`). Callback ESTÁVEL (useCallback sem deps), então pode entrar
   * em array de dependência de efeito sem laço.
   *
   * @example
   *   const { publishSession } = useSessionState();
   *   publishSession({ subject: 'Ownership em Rust', status: 'running' });
   *   publishSession({ phase: 'autorando', fraction: 0.4 });
   *   // seguro mesmo vindo de estado opcional: undefined não apaga nada
   *   publishSession({ subject: form.subject });
   *   publishSession({ subject: null }); // ← limpar é explícito
   */
  publishSession: (patch: SessionPatch) => void;
  /** Zera a sessão (assunto novo do zero). Callback estável. */
  resetSession: () => void;
}

/** Valor default SEM provider: snapshot vazio e escritas no-op (nunca quebra). */
export const DEFAULT_SESSION_STATE: SessionStateValue = {
  ...INITIAL_SESSION,
  publishSession: () => {
    /* no-op sem provider */
  },
  resetSession: () => {
    /* no-op sem provider */
  },
};

export const SessionStateCtx = createContext<SessionStateValue>(DEFAULT_SESSION_STATE);

/** Relógio injetável — o default é o de verdade; o teste passa o seu. */
export type SessionClock = () => number;

/**
 * Máquina de estado da sessão (o provider a usa). Recebe o relógio por
 * parâmetro para manter a leitura de tempo na BORDA, nunca no reducer.
 */
export function useSessionStateMachine(
  clock: SessionClock = () => Date.now(),
  initial: SessionSnapshot = INITIAL_SESSION,
): SessionStateValue {
  const [state, dispatch] = useReducer(sessionReducer, initial);

  // O relógio vai para uma REF, não para as deps: o provider passa uma seta nova
  // a cada render, e depender dela recriaria `publishSession` em todo render —
  // que é exatamente o que faria a LessonView re-assinar o progresso em laço.
  // A ref mantém os callbacks estáveis E sempre lendo o relógio atual.
  const clockRef = useRef<SessionClock>(clock);
  clockRef.current = clock;

  const publishSession = useCallback((patch: SessionPatch): void => {
    dispatch({ type: 'publish', patch, at: clockRef.current() });
  }, []);

  const resetSession = useCallback((): void => {
    dispatch({ type: 'reset', at: clockRef.current() });
  }, []);

  return useMemo(
    () => ({ ...state, publishSession, resetSession }),
    [state, publishSession, resetSession],
  );
}

/** Hook de consumo: o valor do contexto (o default no-op quando sem provider). */
export function useSessionState(): SessionStateValue {
  return useContext(SessionStateCtx);
}
