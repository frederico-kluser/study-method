/**
 * src/views/ChallengeView/TrackChallengePanel.tsx — desafio de TRILHA (rodada 8).
 *
 * Fluxo completo do desafio da trilha, em 3 atos:
 *
 *   1. ENUNCIADO — o cronômetro NÃO roda até o aluno ler e clicar em "Começar"
 *      (requisito do dono do produto: só depois de começar é que o contador
 *      anda). As estrelas só podem sumir por DEMORA depois de `minFirstStarMs`
 *      (carência da 1ª estrela); perdas explícitas (blur/erro/timeout) seguem
 *      imediatas.
 *   2. RESOLUÇÃO — editor (autocomplete OFF) + "Testar resposta" →
 *      track:challenge-submit (o main roda o código contra os testes — os
 *      testes nunca aparecem na UI). ADITIVO (rodada 9): desafio MULTI-ARQUIVO
 *      → SELETOR DE ARQUIVOS (abas MUI), um editor CodeMirror por arquivo; o
 *      submit envia o código de TODOS os arquivos (files no request).
 *   3. VEREDITO — passou: confete + mark 'passed' (estrelas/duração) via
 *      study:mark-challenge-attempt; errou (target 'lesson', ONDA2): o painel
 *      FECHA e o chat da aula reabre com a bolha de erro + pergunta do tutor
 *      (markAttempt → reportChallengeError → navigateToLesson — o desafio
 *      NUNCA é repetido: a LLM vê os desafios que o aluno errou naquela aula);
 *      errou (proficiency/module): o ERRO é apresentado + botão "Gerar novo
 *      desafio" (proficiency) — comportamento atual preservado.
 *
 * A proficiência usa o MESMO painel (target 'proficiency'); ao passar, o main
 * grava o veredito e destrava a trilha inteira. ADITIVO (rodada 9): o desafio
 * do MÓDULO (target 'module' + moduleSlug) usa o mesmo painel — sem botão de
 * regeneração (conteúdo autoral).
 *
 * ─── AS DUAS INVARIANTES QUE A REVISÃO DO DIFF INTEGRADO FIXOU (onda3) ─────
 *   1. FATO ≠ TELA: o REGISTRO da tentativa (`markAttempt` →
 *      study:mark-challenge-attempt) acontece ANTES do guard de montagem do
 *      submit — ele não depende de o painel estar montado (o rail de abas segue
 *      clicável durante o submit). Só a UI (setResult/setConcluded/confete/
 *      report/navegação) fica depois do guard. O defeito medido: veredito
 *      descartado + 'abandoned' do unmount por cima → aula `done=true` na
 *      Trilha com "Concluir aula" bloqueado na própria aula (ACHADO 1).
 *   2. VEREDITO TERMINAL SALVO NÃO VIRA BECO: o rascunho persistido passa por
 *      `normalizeDraftForResume` — 'passed' fica como está; 'failed' volta
 *      retomável (código, saída do erro e relógio preservados, editor e submit
 *      LIBERADOS); 'timeout' preserva o código/evidência e reinicia só a
 *      tentativa morta. Sem isso, o desafio de MÓDULO reprovado (que não tem
 *      regeneração) travava o aluno pelo resto da sessão (ACHADO 2).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

import { getApi } from '../../lib/apiBridge';
import {
  ACTION_TIMEOUTS,
  IPC_TIMEOUT_MS,
  isTimeoutError,
  resolveChannelError,
  withTimeout,
} from '../../lib/ipcTimeout';
import { fireConfetti } from '../../lib/confetti';
import { createStarTracker, formatClock, type StarTracker } from '../../lib/challengeStars';
import { CodeMirrorField } from '../../components/cm/CodeMirrorField';
import { buildErrorReport } from '../../lib/trackLessonState';
import { setPendingTrackLesson } from '../../lib/pendingSubject';
import type { NavKey } from '../../lib/shellNav';
// ONDA3 (generate-flow): o processo de "Gerar novo desafio" é GLOBAL (store
// module-level + modal de etapas no shell) — o painel dispara via store + IPC
// e atualiza o spec local quando o invoke resolve (o modal mostra o progresso).
import {
  failChallengeGenerate,
  finishChallengeGenerate,
  peekChallengeGenerate,
  startChallengeGenerate,
  subscribeChallengeGenerate,
} from '../../lib/challengeGenerateStore';
// ONDA-RETOMAR (onda1-desafio-retomar): cache de SESSÃO do rascunho. O shell
// monta SÓ a view ativa (App.tsx) — trocar de aba DESMONTA este painel e o
// loadSpec reiniciava tudo dos starters (código, relógio, estrelas e veredito).
// Mesmo padrão do lessonChatCache/challengeGenerateStore: Map em memória de
// módulo, sem React/DOM, testável em node:test.
import {
  challengeDraftCacheKey,
  createChallengeDraftHolder,
  saveChallengeDraft,
  type ChallengeDraft,
  type ChallengeDraftKey,
} from '../../lib/challengeDraftCache';
import type {
  TrackChallengeSpec,
  TrackSubmitResult,
} from '../../../shared/ipc-contract';
import { useChallengeNav, type TrackChallengeNavSelection } from '../../lib/challengeNav';
import { MarkdownView } from '../../components/markdown';

/** Vereditos TERMINAIS de uma tentativa — o repo é append e a ÚLTIMA linha
 *  vira o `lastVerdict` que o gate da aula lê. */
export type ChallengeVerdict = 'passed' | 'failed' | 'timeout' | 'abandoned';

/**
 * "Este desmonte deve gravar 'abandoned'?" — DECISÃO PURA, extraída do efeito
 * de abandono para poder ser medida sem montar o React.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ELA MATA (medido, não deduzido)
 * ══════════════════════════════════════════════════════════════════════════
 * O guard era `marked !== 'failed'`, e o efeito tem `concluded` nas
 * DEPENDÊNCIAS. Quando o veredito chega (`setConcluded('passed')`) o React roda
 * o CLEANUP da passada anterior — com o closure ANTIGO, onde `started` é true e
 * `concluded` ainda é null. O guard só protegia o 'failed', então uma tentativa
 * 'abandoned' era gravada POR CIMA do 'passed' que tinha acabado de passar.
 * Como `summarizeAttempts` toma a ÚLTIMA tentativa, `lastVerdict` virava
 * 'abandoned', `lessonFinishBlock` devolvia 'challenges' e "Concluir aula"
 * NUNCA habilitava numa aula COM desafio — e, sem conclusão, o cadeado da aula
 * seguinte nunca abria (é a metade escondida do "bug grave" do dono).
 * Payload REAL do canal track:lesson logo após passar pela UI, antes do
 * conserto: [{"slug":"dobro-do-numero","lastVerdict":"abandoned","stars":3}].
 *
 * A REGRA CERTA é mais forte e mais simples: só marca abandono se NENHUM
 * terminal foi marcado para este desafio. Os quatro vereditos são terminais, e
 * `marked` volta a null exatamente onde um desafio NOVO entra em cena (carga da
 * spec e regeneração) — então "já tem terminal" nunca vaza de um desafio para o
 * seguinte.
 */
export function shouldMarkAbandon(input: {
  started: boolean;
  concluded: string | null;
  hasSpec: boolean;
  marked: ChallengeVerdict | string | null;
}): boolean {
  return input.started && !input.concluded && input.hasSpec && input.marked === null;
}

/**
 * ONDA-RETOMAR: chave de SESSÃO do rascunho do desafio em cena (o par do
 * `challengeDraftCache`). O `challengeId` é o SLUG da spec carregada
 * (`spec.slug`), não o da selection: o handler recusa um `challengeId` que não
 * bata com o slug do desafio resolvido, então numa carga normal os dois são
 * IGUAIS — e o slug da spec é o único correto quando a REGENERAÇÃO troca o
 * desafio em cena sem trocar a selection (o rascunho do desafio novo não pode
 * ser salvo sob a chave do antigo).
 */
function challengeDraftKeyFor(
  sel: TrackChallengeNavSelection,
  challengeId: string,
): ChallengeDraftKey {
  return {
    trackSlug: sel.trackSlug,
    target: sel.target,
    lessonId: sel.lessonId,
    moduleSlug: sel.moduleSlug,
    challengeId,
  };
}

/**
 * ONDA-RETOMAR: o rascunho está INTOCADO? (nem começou, sem teste rodado e sem
 * veredito gravado). Restaurá-lo daria exatamente o estado inicial, então ele
 * não entra no cache — o cache fica só com o que o aluno de fato produziu
 * (mesmo critério do "chat nunca iniciado" do lessonChatCache). Critério ÚNICO,
 * usado pelos DOIS saves (o do unmount e o da troca de desafio).
 */
function isUntouchedDraft(draft: ChallengeDraft): boolean {
  return !draft.started && draft.concluded === null && draft.result === null && draft.marked === null;
}

/**
 * ONDA-RETOMAR: o snapshot que o DESMONTE persiste — a chave capturada no MESMO
 * render + o rascunho que a tela mostrava.
 */
export interface ChallengeDraftSnapshot {
  key: ChallengeDraftKey;
  draft: ChallengeDraft;
}

/**
 * ONDA-RETOMAR: O QUE VALE A PENA PERSISTIR DE UM VEREDITO TERMINAL — DECISÃO
 * PURA, exportada e medida sem montar o React (mesmo padrão de
 * `shouldMarkAbandon`/`restoreStarTracker`). Roda na hora de SALVAR (os dois
 * saves: o do desmonte e o da troca de desafio), então a RESTAURAÇÃO continua
 * lendo `draft.concluded` como sempre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ELA MATA (medido pelo revisor adversarial, não deduzido)
 * ══════════════════════════════════════════════════════════════════════════
 * O rascunho guardava o `concluded` CRU — inclusive 'failed'/'timeout' — e o
 * `loadSpec` o restaurava verbatim (`setConcluded(draft.concluded)`). Ao voltar,
 * o editor ficava `readOnly={concluded !== null}` e o "Testar resposta" ficava
 * desabilitado (`!concluded` em `canSubmit`), e NÃO existe caminho que zere o
 * `concluded` a não ser a REGENERAÇÃO — que para `target === 'module'` sequer é
 * renderizada (o botão "Gerar novo desafio" exige `!== 'module'`). Antes desta
 * feature, sair e voltar RESETAVA tudo (`setConcluded(null)` incondicional no
 * `loadSpec`) e era o ÚNICO retry de um desafio de MÓDULO reprovado: com o
 * rascunho cru, o aluno ficava travado pelo resto da sessão (só recarregar o
 * app limpa o cache de memória). BECO SEM SAÍDA, determinístico.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A DECISÃO, POR VEREDITO
 * ══════════════════════════════════════════════════════════════════════════
 *   - 'passed'  → persiste COMO ESTÁ. Voltar mostra o estado de aprovado (com o
 *     "Avançar para a próxima aula"/"Passou com N estrelas") — que é o que o
 *     aluno de fato conquistou e o que a trilha já registrou;
 *   - 'failed'  → persiste RETOMÁVEL: mantém `code`/`filesCode`/`activeFile`/
 *     `elapsedMs`/`starsLeft`/`result` (o aluno REVÊ a saída do erro e o
 *     checklist que já está na tela) e o `marked`, com `concluded: null`. O
 *     editor volta EDITÁVEL e o "Testar resposta" volta HABILITADO: é uma
 *     tentativa que CONTINUA, e o relógio segue de onde parou (o comportamento
 *     do relógio pausado não muda — não é isto que esta função decide);
 *   - 'timeout' → o relógio DAQUELA tentativa MORREU: persiste o `code` (o
 *     pedido do dono: o código do aluno é PRESERVADO) e o `result` (evidência
 *     do que aconteceu), mas a tentativa RECOMEÇA — `concluded: null`,
 *     `elapsedMs: 0` e `starsLeft: 3`. Sem isso o primeiro tick reancorado no
 *     tempo estourado reconcluiria 'timeout' na hora e o beco voltaria, agora
 *     sem nem passar pela tela de erro.
 *   - null      → tentativa em curso (ou nem começada): nada a normalizar.
 *
 * POR QUE O `marked` FICA: ele é o "já tem terminal gravado" do painel
 * (`shouldMarkAbandon`) — mantê-lo impede que um desmonte seguinte grave um
 * 'abandoned' por cima do 'failed'/'timeout' que JÁ está no banco. E ele não
 * trava o retry: `markAttempt` só deduplica o MESMO veredito, e o retry que
 * interessa (o aluno corrigir e PASSAR) é outro veredito.
 */
export function normalizeDraftForResume(draft: ChallengeDraft): ChallengeDraft {
  if (draft.concluded === 'failed') return { ...draft, concluded: null };
  if (draft.concluded === 'timeout') {
    return { ...draft, concluded: null, elapsedMs: 0, starsLeft: 3 };
  }
  return draft;
}

/**
 * ONDA-RETOMAR: O SAVE DO DESMONTE — a decisão de persistir o rascunho,
 * EXTRAÍDA do cleanup para ser medida com o cache REAL (e não por presença de
 * string na fonte). O corpo do cleanup virou UMA chamada desta função: é ela
 * que roda quando o aluno sai da aba Desafio.
 *
 * O DEFEITO QUE A EXTRAÇÃO MATA (medido, não deduzido): a cerca antiga cobrava
 * só a PRESENÇA de `saveChallengeDraft(...)`/`isUntouchedDraft(...)` no efeito
 * de unmount, e um `return;` inserido ANTES do save — com todas as strings no
 * lugar — passava com a suíte inteira verde (34/34). Aqui a decisão é uma LISTA
 * DE COMANDOS fechada (o teste compara comando a comando) e um teste de
 * comportamento, com o cache de verdade, prova que um rascunho INICIADO entra
 * no cache; matar o save agora exige mudar esta lista E o comportamento medido.
 *
 * Sem snapshot (a spec nunca chegou: não há rascunho na tela) nada é gravado; o
 * rascunho INTOCADO (nem começou, sem teste rodado e sem veredito) também não
 * entra — restaurá-lo daria exatamente o estado inicial. O critério é o MESMO
 * da troca de desafio (`isUntouchedDraft`).
 *
 * O QUE ENTRA NO CACHE é o rascunho NORMALIZADO (`normalizeDraftForResume`): um
 * veredito terminal que não seja 'passed' vira tentativa retomável — sem isso o
 * desafio de MÓDULO reprovado volta num beco sem saída (a medição está na doc
 * daquela função).
 */
export function persistDraftOnUnmount(snapshot: ChallengeDraftSnapshot | null): void {
  if (snapshot === null) return;
  // Rascunho intocado não entra no cache (ver `isUntouchedDraft`).
  if (isUntouchedDraft(snapshot.draft)) return;
  saveChallengeDraft(snapshot.key, normalizeDraftForResume(snapshot.draft));
}

/**
 * ONDA-RETOMAR: reconstrói o tracker de estrelas de uma tentativa RESTAURADA
 * (DECISÃO PURA, exportada para ser medida sem montar o React — mesmo padrão de
 * `shouldMarkAbandon`).
 *
 * O tracker morre com o componente, então ao retomar o desafio ele é recriado
 * do zero (3 estrelas) com o MESMO tempo já decorrido. Só que um tracker novo
 * não sabe das perdas EXPLÍCITAS que o antigo já tinha sofrido:
 *
 *   - as perdas por DEMORA são reproduzidas por `onTick(elapsedMs)` (é função
 *     determinística do tempo — o mesmo tempo dá as mesmas perdas);
 *   - a diferença que sobra é a perda explícita que o painel pode ter sofrido
 *     FORA do tick, hoje só o blur (o painel nunca chama `onWrongAnswer`/
 *     `onTimeout` — ele marca o veredito por fora), e `onBlur` é idempotente:
 *     repô-la devolve ao tracker o estado EXATO do antigo, inclusive o fato de
 *     um novo blur não tirar outra estrela.
 *
 * Sem esta reconstrução o tick seguinte chamaria `setStarsLeft(tracker.stars())`
 * e DEVOLVERIA a estrela já perdida (o aluno veria a estrela voltar por trocar
 * de aba). Com ela, `tracker.stars()` é exatamente o `starsLeft` que o aluno
 * tinha — nem a mais (devolver) nem a menos (cobrar duas vezes).
 */
export function restoreStarTracker(input: {
  timeLimitMs: number;
  minFirstStarMs: number;
  elapsedMs: number;
  starsLeft: number;
}): StarTracker {
  const tracker = createStarTracker({
    timeLimitMs: input.timeLimitMs,
    minFirstStarMs: input.minFirstStarMs,
  });
  tracker.onTick(input.elapsedMs);
  if (tracker.stars() > input.starsLeft) tracker.onBlur();
  return tracker;
}

export function TrackChallengePanel({
  selection,
  onNavigate,
}: {
  selection: TrackChallengeNavSelection;
  /**
   * ONDA 4 (next-glow): navegação genérica do shell (NavKey) para o FALLBACK
   * "sem próxima aula" → trilha. No-op quando ausente (testes/uso sem shell).
   * A navegação para a próxima AULA usa o fluxo track (setPendingTrackLesson +
   * nav.navigateToLesson) — o mesmo padrão do RoadmapView.openLesson.
   */
  onNavigate?: (key: NavKey) => void;
}): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  // ONDA2 (error-flow): o painel fecha um desafio de AULA que falhou —
  // reporta o erro e navega de volta ao chat da aula (bolha de erro).
  const nav = useChallengeNav();

  const [spec, setSpec] = useState<TrackChallengeSpec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Ato 1: enunciado → "Começar".
  const [started, setStarted] = useState(false);
  const startTsRef = useRef(0);

  // Cronômetro + estrelas.
  const [elapsedMs, setElapsedMs] = useState(0);
  const [starsLeft, setStarsLeft] = useState(3);
  const trackerRef = useRef<StarTracker | null>(null);
  const [concluded, setConcluded] = useState<'passed' | 'failed' | 'timeout' | null>(null);

  // Editor + teste.
  const [code, setCode] = useState('');
  /** ADITIVO (rodada 9): desafio MULTI-ARQUIVO — código por caminho de arquivo. */
  const [filesCode, setFilesCode] = useState<Record<string, string>>({});
  /** arquivo ativo no seletor de abas (path; default = primeiro arquivo). */
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TrackSubmitResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Regeneração (nunca-repetir).
  const [regenerating, setRegenerating] = useState(false);
  // ONDA3 (generate-flow): processo GLOBAL em voo — gateia o botão mesmo se
  // este painel montou DEPOIS do disparo (ex.: voltou à aba Desafio no meio
  // da geração iniciada na bolha da aula).
  const generateState = useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate);
  const generateRunning = generateState.status === 'running';

  const markedRef = useRef<string | null>(null);

  // ─── ONDA-RETOMAR: rascunho de SESSÃO (cache em memória de módulo) ────────
  // O shell monta SÓ a view ativa: trocar de aba desmonta este painel. O
  // rascunho guardado no unmount é o ÚNICO jeito de o aluno voltar e encontrar
  // o código, o relógio, as estrelas e o veredito onde estavam.
  /** Snapshot MAIS RECENTE do rascunho — atualizado no corpo do render (mesmo
   *  padrão do `chatRef` da LessonView) porque o CLEANUP de unmount enxerga o
   *  closure da render em que o efeito nasceu: ler daqui é ler o último estado,
   *  nunca um estado velho — o painel re-renderiza a cada segundo do tick.
   *  A CHAVE viaja JUNTO do snapshot (par capturado no mesmo render): o
   *  rascunho nunca é salvo sob a chave de outro desafio. */
  const draftSnapshotRef = useRef<ChallengeDraftSnapshot | null>(null);
  /** Chave do desafio cujo estado está HOJE na tela (null antes da 1ª spec).
   *  É ela que detecta a TROCA DE DESAFIO com o painel montado (o efeito de
   *  montagem re-executa `loadSpec` sem desmontar). */
  const draftKeyRef = useRef<ChallengeDraftKey | null>(null);
  /** Retentor do drain (anti-StrictMode — ver `createChallengeDraftHolder`),
   *  retido entre as passadas do double-invoke do dev junto da chave a que
   *  pertence: chave diferente ⇒ holder novo (o take é one-shot, um holder
   *  velho devolveria o rascunho de OUTRO desafio). */
  const draftHolderRef = useRef<{ key: string; holder: ReturnType<typeof createChallengeDraftHolder> } | null>(
    null,
  );
  // Snapshot do render corrente. `markedRef.current` é lido AQUI (e não no
  // cleanup): o abandono do unmount muda o ref SEM re-renderizar, e o rascunho
  // salvo tem de ser o da TELA — um 'abandoned' gravado no desmonte não pode
  // voltar como "já marcado" numa tentativa que o aluno RETOMOU (senão o
  // abandono seguinte não seria gravado e um 'passed' posterior seria barrado).
  if (spec && draftKeyRef.current !== null) {
    draftSnapshotRef.current = {
      key: draftKeyRef.current,
      draft: {
        code,
        filesCode,
        activeFile,
        started,
        elapsedMs,
        starsLeft,
        concluded,
        result,
        marked: markedRef.current,
      },
    };
  }

  // Guard de montagem (MESMO padrão do loadSpec): durante `running` o rail de
  // abas segue clicável — se o painel desmontar no meio do submit (troca de
  // aba), o `await withTimeout(challengeSubmit)` ainda resolve depois e NADA DE
  // UI pode rodar: nem setResult/setConcluded/fireConfetti, nem
  // reportChallengeError/navigateToLesson, nem setSubmissionError/setRunning.
  // O REGISTRO DO VEREDITO é a exceção DELIBERADA e vem ANTES deste guard (ver
  // o ACHADO 1 em `handleSubmit`): o fato vai para o banco mesmo com o painel
  // desmontado — o que não pode é a tela desmontada tentar se atualizar.
  // O reset na montagem é OBRIGATÓRIO (StrictMode no dev double-invoca o
  // efeito: cleanup → re-mount; sem o reset o guard bloquearia tudo no dev).
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  /**
   * Carrega a spec do desafio e RESTAURA o rascunho da sessão (ONDA-RETOMAR).
   *
   * ══════════════════════════════════════════════════════════════════════════
   * O DEFEITO QUE O GUARD DE MONTAGEM MATA (medido, não deduzido)
   * ══════════════════════════════════════════════════════════════════════════
   * Aqui existia um `let cancelled = false;` que NUNCA virava `true`: a única
   * atribuição era a própria declaração, e o efeito de montagem que chama
   * `loadSpec(selection)` não tem cleanup. Como o `.then` TOMA o rascunho do
   * cache (`createChallengeDraftHolder(...).get()` → `takeChallengeDraft`, que é
   * DRAIN one-shot), um `loadSpec` em voo que resolvia DEPOIS do desmonte — o
   * aluno sai do desafio e volta antes do IPC `track:challenge` responder —
   * rodava no fiber morto: um holder NOVO era criado para a chave e o `get()`
   * DELETAVA a entrada do cache. Os `setState` eram no-op num componente
   * desmontado e ninguém regravava — o cleanup de unmount lê
   * `draftSnapshotRef.current`, que ainda é null porque a spec nunca chegou.
   * Resultado: o rascunho do aluno era DESTRUÍDO e, ao voltar de novo, o
   * desafio recomeçava do zero — exatamente o defeito que esta onda existe para
   * matar. (Antes desta onda o fantasma só fazia setState inócuo; consumir o
   * cache é NOVO.)
   *
   * POR QUE O GUARD É DO REF (e não de uma variável local): `cancelledRef` é o
   * guard de montagem do COMPONENTE — resetado no mount e setado no unmount —
   * então ele responde "este fiber ainda está vivo?" no INSTANTE em que o
   * callback roda. Uma variável local do `loadSpec` responderia à pergunta
   * errada ("esta chamada foi substituída por uma mais nova?") e, sem um
   * cleanup do efeito de montagem, morreria em `false` para sempre: um guard que
   * nunca dispara é PIOR que nenhum, porque documenta uma proteção que não
   * existe. Em dev o StrictMode double-invoca os efeitos (setup → cleanup →
   * setup) e o 2º setup RESETA o ref: as duas passadas legítimas continuam
   * rodando (é disso que o `createChallengeDraftHolder` depende) e o guard só
   * barra o fiber REALMENTE desmontado.
   */
  const loadSpec = useCallback(
    (sel: TrackChallengeNavSelection): void => {
      setLoading(true);
      setLoadError(null);
      const req =
        sel.target === 'proficiency'
          ? { trackSlug: sel.trackSlug, target: 'proficiency' as const, challengeId: sel.challengeId }
          : sel.target === 'module'
            ? { trackSlug: sel.trackSlug, target: 'module' as const, moduleSlug: sel.moduleSlug, challengeId: sel.challengeId }
            : { trackSlug: sel.trackSlug, target: 'lesson' as const, lessonId: sel.lessonId, challengeId: sel.challengeId };
      const call = sel.target === 'proficiency' ? getApi().track.proficiency : getApi().track.challenge;
      // Timeout: canal mudo (IPC nunca resolve) vira loadError com retry —
      // o CircularProgress do loading nunca fica eterno.
      withTimeout(call(req), IPC_TIMEOUT_MS, sel.target === 'proficiency' ? 'track.proficiency' : 'track.challenge')
        .then((res) => {
          // Guard de montagem (o DEFEITO medido está documentado acima, em
          // `loadSpec`): painel desmontado durante o IPC → o callback desiste
          // AQUI, antes de qualquer setState e — o que é novo e grave — antes
          // de criar o holder e chamar `get()`, que DRAINA o cache do rascunho.
          if (cancelledRef.current) return;
          if (res.ok === false) {
            // W3 (falsy-proof): '' é erro VÁLIDO — só null significa "sem erro".
            setLoadError(resolveChannelError(res, tI('challenge.trackLoadFailed')));
            return;
          }
          if (!res.challenge) {
            setLoadError(tI('challenge.trackNotFound'));
            return;
          }
          setSpec(res.challenge);
          // ─── ONDA-RETOMAR: restaura o rascunho ou reinicializa ────────────
          // Chave do desafio que ACABOU de chegar (spec.slug — ver
          // `challengeDraftKeyFor`).
          const novaChave = challengeDraftKeyFor(sel, res.challenge.slug);
          const novaChaveStr = challengeDraftCacheKey(novaChave);
          // TROCA DE DESAFIO COM O PAINEL MONTADO: quando a `selection` muda, o
          // efeito de montagem re-executa `loadSpec` SEM desmontar — o estado do
          // desafio ANTERIOR está prestes a ser sobrescrito, então ele é SALVO
          // sob a chave ANTERIOR antes do reset (sem isto, trocar de desafio
          // perderia o trabalho do aluno mesmo sem sair da aba). A comparação é
          // pela chave canônica: mesma chave (recarga do MESMO desafio) não
          // regrava nada.
          const chaveAnterior = draftKeyRef.current;
          if (chaveAnterior !== null && challengeDraftCacheKey(chaveAnterior) !== novaChaveStr) {
            const snapshot = draftSnapshotRef.current;
            // O snapshot só é salvo se ele for REALMENTE do desafio anterior —
            // é esta igualdade que impede a chave de vazar de um desafio para
            // outro (um rascunho nunca cai na chave errada).
            if (
              snapshot !== null &&
              challengeDraftCacheKey(snapshot.key) === challengeDraftCacheKey(chaveAnterior) &&
              !isUntouchedDraft(snapshot.draft)
            ) {
              // MESMA normalização do save do desmonte (a decisão inteira, com o
              // beco sem saída medido, está em `normalizeDraftForResume`): este
              // caminho também devolve o aluno ao desafio depois — trocar de
              // desafio com o painel montado e voltar não pode restaurar um
              // veredito terminal que trava editor e submit.
              saveChallengeDraft(snapshot.key, normalizeDraftForResume(snapshot.draft));
            }
          }
          draftKeyRef.current = novaChave;
          if (draftHolderRef.current === null || draftHolderRef.current.key !== novaChaveStr) {
            draftHolderRef.current = { key: novaChaveStr, holder: createChallengeDraftHolder(novaChave) };
          }
          const draft = draftHolderRef.current.holder.get();
          setSubmissionError(null);
          if (draft !== null) {
            // RASCUNHO DA SESSÃO: o aluno JÁ esteve neste desafio (saiu e
            // voltou, ou trocou de desafio e voltou) — o estado volta inteiro,
            // em vez de recomeçar do zero dos starters.
            if (res.challenge.files && res.challenge.files.length > 0) {
              setFilesCode(draft.filesCode);
              setActiveFile(draft.activeFile);
            } else {
              setFilesCode({});
              setActiveFile(null);
              setCode(draft.code);
            }
            setStarted(draft.started);
            setElapsedMs(draft.elapsedMs);
            setStarsLeft(draft.starsLeft);
            setConcluded(draft.concluded);
            setResult(draft.result);
            markedRef.current = draft.marked;
            // O RELÓGIO PAUSA ENQUANTO A ABA ESTÁ FORA: o pedido do dono é não
            // perder a tentativa — voltar depois de 10 minutos e encontrar
            // timeout (ou estrelas zeradas por demora) seria "recomeçar do
            // zero" de outro jeito. O instante inicial é REANCORADO no tempo já
            // decorrido, então o tick seguinte lê exatamente `draft.elapsedMs`
            // (+ o tempo desta volta) e o tempo de ausência não conta.
            startTsRef.current = draft.started ? Date.now() - draft.elapsedMs : 0;
            // O tracker é RECRIADO (o antigo morreu com o componente) e
            // SINCRONIZADO com o tempo decorrido — a regra inteira, com a
            // medição, está em `restoreStarTracker` (topo do arquivo): nada é
            // devolvido nem cobrado duas vezes, e o valor exibido é o
            // `starsLeft` que o aluno TINHA.
            trackerRef.current = restoreStarTracker({
              timeLimitMs: res.challenge.timeLimitMs,
              minFirstStarMs: res.challenge.minFirstStarMs,
              elapsedMs: draft.elapsedMs,
              starsLeft: draft.starsLeft,
            });
          } else {
            // Sem rascunho: comportamento de sempre — starters, cronômetro
            // parado, 3 estrelas, sem veredito e sem terminal marcado.
            // ADITIVO (rodada 9): multi-arquivo — um editor por arquivo,
            // starters de cada um; sem files, editor único com starterCode
            // (comportamento atual).
            if (res.challenge.files && res.challenge.files.length > 0) {
              setFilesCode(
                Object.fromEntries(res.challenge.files.map((f) => [f.path, f.starterCode])),
              );
              setActiveFile(res.challenge.files[0].path);
            } else {
              setFilesCode({});
              setActiveFile(null);
              setCode(res.challenge.starterCode);
            }
            setStarted(false);
            setElapsedMs(0);
            setStarsLeft(3);
            setConcluded(null);
            setResult(null);
            markedRef.current = null;
            startTsRef.current = 0;
            trackerRef.current = null;
          }
        })
        .catch((err: unknown) => {
          // Idem `.then`: o catch também só roda com o painel MONTADO (nenhum
          // caminho do loadSpec pode tocar em estado/cache de um fiber morto).
          if (cancelledRef.current) return;
          setLoadError(isTimeoutError(err) ? tI('challenge.trackLoadTimeout') : String(err));
        })
        .finally(() => {
          if (!cancelledRef.current) setLoading(false);
        });
    },
    [tI],
  );

  // Montagem: carrega a spec do desafio selecionado.
  useEffect(() => {
    loadSpec(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.trackSlug, selection.challengeId, selection.target, selection.lessonId, selection.moduleSlug]);

  /** Marca a tentativa (nunca-repetir) — idempotente por desafio+veredito.
   *
   *  EFEITO COLATERAL PURO DE IPC — e é isso que o autoriza a rodar num fiber
   *  JÁ DESMONTADO (ver o ACHADO 1 em `handleSubmit`): o corpo muta só o
   *  `markedRef` (o dedupe LOCAL, que é um ref — não estado) e dispara
   *  `study:mark-challenge-attempt`; NENHUM `setState`, nenhuma leitura de
   *  estado de render. O FATO "esta tentativa terminou com este veredito"
   *  pertence ao banco, não à tela que por acaso o mostrou.
   */
  const markAttempt = useCallback(
    (verdict: 'passed' | 'failed' | 'timeout' | 'abandoned', stars: number, durationMs: number): void => {
      if (!spec || !started || markedRef.current === verdict) return;
      markedRef.current = verdict;
      const payload = {
        subjectSlug: selection.trackSlug,
        lessonId: selection.target === 'lesson' ? selection.lessonId : undefined,
        challengeId: spec.slug,
        verdict,
        stars,
        durationMs,
      };
      getApi()
        .study.markChallengeAttempt(payload)
        .then((res) => {
          // ─── ACHADO 3 (revisão adversarial do diff integrado) ─────────────
          // O canal responde `{ok:false}` quando a PERSISTÊNCIA está
          // indisponível (repo ausente, subjectId não resolvido, repo sem
          // `markChallengeAttempt` — ver `study-handlers.ts`). Antes desta
          // correção só a REJEIÇÃO era tratada (o `.catch` abaixo) e um
          // `{ok:false}` passava EM BRANCO: o veredito não entrava no banco, o
          // `markedRef` ficava dizendo "já gravei" e o dedupe BARRava qualquer
          // tentativa seguinte de registrar o MESMO veredito — o Achado 1
          // (aula `done=true` com `lastVerdict` nulo) ganhava uma segunda
          // causa, silenciosa, só por falha de persistência.
          //
          // A DECISÃO (mínima, sem UI nova e sem retry agressivo): o aviso é
          // EXPLÍCITO no console (a falha deixa de ser invisível para quem lê
          // o log do renderer) e o dedupe local é DESFEITO — `{ok:false}`
          // significa que NADA foi gravado (todos os retornos do handler
          // acontecem ANTES do `repo.markChallengeAttempt`), então o painel
          // não pode se declarar marcado. Quem tenta de novo é o PRÓXIMO
          // veredito: o aluno que submeter outra vez volta a registrar. Sem
          // isso, uma persistência que voltasse a funcionar não teria como
          // recuperar o fato perdido.
          if (res.ok === false) {
            console.warn(
              `[desafio] study:mark-challenge-attempt recusou o veredito "${verdict}" de ` +
                `"${spec.slug}": ${res.error} — a tentativa NÃO foi registrada; o próximo ` +
                'veredito volta a tentar.',
            );
            if (markedRef.current === verdict) markedRef.current = null;
          }
        })
        .catch(() => {
          /* mark é otimista: falha transitória (canal mudo/exceção) perde o
             registro — limitação documentada. O `{ok:false}` acima é o caso
             OBSERVÁVEL: o canal respondeu e disse que não gravou. */
        });
    },
    [spec, started, selection.trackSlug, selection.lessonId, selection.target],
  );

  // Ato 1: "Começar" — o cronômetro SÓ começa aqui.
  const handleStart = useCallback((): void => {
    if (!spec || started) return;
    setStarted(true);
    startTsRef.current = Date.now();
    trackerRef.current = createStarTracker({
      timeLimitMs: spec.timeLimitMs,
      minFirstStarMs: spec.minFirstStarMs,
    });
    setElapsedMs(0);
    setStarsLeft(3);
  }, [spec, started]);

  // Tick de 1s: estrelas por demora + timeout.
  useEffect(() => {
    if (!started || concluded) return undefined;
    const tick = (): void => {
      const elapsed = Date.now() - startTsRef.current;
      setElapsedMs(elapsed);
      const tracker = trackerRef.current;
      if (tracker) {
        tracker.onTick(elapsed);
        setStarsLeft(tracker.stars());
        if (tracker.isTimedOut(elapsed)) {
          setConcluded('timeout');
          markAttempt('timeout', tracker.stars(), elapsed);
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [started, concluded, markAttempt]);

  // Blur (janela perdeu foco): -1 estrela imediata.
  useEffect(() => {
    if (!started || concluded) return undefined;
    const handleBlur = (): void => {
      const tracker = trackerRef.current;
      if (tracker) {
        tracker.onBlur();
        setStarsLeft(tracker.stars());
      }
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleBlur);
    };
  }, [started, concluded]);

  // Troca de desafio sem concluir → abandoned. ONDA2 (error-flow): o desafio
  // de AULA que falhou já foi marcado 'failed' ANTES de navegar (ordem:
  // markAttempt → report → navigate) — o setConcluded não chega a commitar
  // antes do unmount, então este cleanup veria `concluded` null e marcaria
  // 'abandoned' POR CIMA do 'failed' (o repo é append — a última linha vira o
  // lastVerdict). O guard lê o REF (sempre atual): terminal já marcado → o
  // unmount não sobrescreve.
  //
  // ONDA-INTEGRAÇÃO: o guard cobria SÓ o 'failed' e engolia o 'passed' — a
  // regra inteira, com a medição, está em `shouldMarkAbandon` (topo do
  // arquivo). Este cleanup não decide mais nada sozinho.
  useEffect(() => {
    return () => {
      if (shouldMarkAbandon({ started, concluded, hasSpec: Boolean(spec), marked: markedRef.current })) {
        const elapsed = startTsRef.current > 0 ? Date.now() - startTsRef.current : 0;
        markAttempt('abandoned', starsLeft, elapsed);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, concluded, spec, selection.challengeId]);

  // ─── ONDA-RETOMAR: SALVA o rascunho no UNMOUNT (troca de aba) ─────────────
  // O shell monta SÓ a view ativa: sair da aba Desafio desmonta este painel e
  // TODO o estado local morre (código, relógio, estrelas e veredito). Este
  // cleanup é a última chance de guardar a tentativa — ele lê o snapshot por
  // REF (nunca pelo closure, que é o da render em que o efeito nasceu).
  // A DECISÃO (sem snapshot nada a salvar; rascunho intocado não entra) mora em
  // `persistDraftOnUnmount`, exportada e medida com o cache REAL: o corpo deste
  // cleanup é UMA chamada, então não há como inserir aqui uma saída antecipada
  // sem que a lista de comandos do teste mude.
  useEffect(() => {
    return () => {
      persistDraftOnUnmount(draftSnapshotRef.current);
    };
  }, []);

  /** Roda o código do aluno contra os testes (o main nunca expõe os testes). */
  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!spec || !started || running || concluded) return;
    setRunning(true);
    setSubmissionError(null);
    try {
      // ADITIVO (rodada 9): multi-arquivo — o submit envia o código de TODOS
      // os arquivos (files); sem files, envia o code único (comportamento atual).
      const multiFile = spec.files && spec.files.length > 0;
      const payload = {
        trackSlug: selection.trackSlug,
        target: selection.target,
        lessonId: selection.target === 'lesson' ? selection.lessonId : undefined,
        moduleSlug: selection.target === 'module' ? selection.moduleSlug : undefined,
        challengeId: spec.slug,
        code: multiFile ? (filesCode[activeFile ?? ''] ?? '') : code,
        ...(multiFile
          ? { files: spec.files.map((f) => ({ path: f.path, code: filesCode[f.path] ?? '' })) }
          : {}),
        ...(selection.target === 'proficiency' ? { stars: starsLeft } : {}),
      };
      // FIX W1 (onda 4): timeout de 45s — > 30s do exec do código no main
      // (challengeExec.ts) + overhead de spawn/load; canal MUDO nunca trava o
      // botão "Testar resposta" para sempre (finally limpa o `running`).
      const res = await withTimeout(
        getApi().track.challengeSubmit(payload as never),
        ACTION_TIMEOUTS.challengeSubmit,
        'track.challengeSubmit',
      );
      // ══════════════════════════════════════════════════════════════════════
      // ACHADO 1 (revisão adversarial do diff integrado): O VEREDITO DO SUBMIT
      // É UM FATO — ELE NÃO DEPENDE DA TELA ESTAR MONTADA
      // ══════════════════════════════════════════════════════════════════════
      // O DEFEITO MEDIDO (não deduzido): aqui existia SÓ o guard de montagem, e
      // os `markAttempt('passed'|'failed')` ficavam DEPOIS dele. O rail de abas
      // segue clicável durante o submit (o próprio guard de montagem documenta
      // isso: o submit roda `node --test`, SEGUNDOS), então o aluno que troca de
      // aba no meio do submit fazia o renderer DESCARTAR o veredito; o unmount
      // ainda gravava 'abandoned' por cima. E o MAIN JÁ tinha marcado a aula
      // como concluída no submit aprovado (`completeLessonOnChallengePass` —
      // `lessonChallengesAllPassed` conta o desafio recém-aprovado PELO ID
      // justamente porque a tentativa quem persiste é o renderer, DEPOIS).
      // Estado final, determinístico e incoerente, medido pelo revisor com um
      // probe no handler real:
      //   trilha={aula-1 done:true, aula-2 locked:false} |
      //   aula={done:true, lastVerdict:null, finishBlock:'challenges'}
      // isto é: a Trilha mostra a aula concluída e a própria aula mostra badge
      // "1 pendente" e "Concluir aula" BLOQUEADO.
      //
      // A DECISÃO: o registro da tentativa sobe para ANTES do guard. Ele é
      // efeito colateral puro de IPC (`markAttempt` só muta o `markedRef` e
      // chama `study:mark-challenge-attempt` — ver a doc dele), então vale para
      // `passed` E para `failed`: o 'failed' de aula TAMBÉM é fato, e sem ele o
      // 'abandoned' do unmount sobrescreveria o veredito real (o repo é append
      // e a ÚLTIMA linha vira o `lastVerdict`). O que sobra depois do guard é
      // só UI: `setResult`/`setConcluded`/`fireConfetti`/
      // `reportChallengeError`/`navigateToLesson`/`setSubmissionError`.
      //
      // ORDEM NO BANCO: o 'abandoned' do unmount entra primeiro (ele roda no
      // desmonte, que acontece ANTES deste `await` resolver) e o veredito real
      // entra DEPOIS — a última linha é o veredito, que é o que o gate da aula
      // lê. Um submit que FALHA (res.ok === false) ou estoura não tem veredito
      // nenhum a registrar: nada é gravado aqui.
      if (res.ok) {
        markAttempt(res.passed ? 'passed' : 'failed', starsLeft, Date.now() - startTsRef.current);
      }
      // Guard de montagem: daqui para baixo é TELA — painel desmontado durante o
      // submit → descarta silenciosamente (nada de setResult, setConcluded,
      // fireConfetti, reportChallengeError ou navigateToLesson).
      if (cancelledRef.current) return;
      if (res.ok) {
        setResult(res);
        if (res.passed) {
          setConcluded('passed');
          fireConfetti();
        } else if (selection.target === 'lesson') {
          // ONDA2 (error-flow): desafio de AULA que FALHOU → o painel FECHA e o
          // chat da aula reabre com a bolha de erro + pergunta do tutor. Ordem
          // (contrato): markAttempt (nunca-repetir, já feito acima) →
          // reportChallengeError → navigateToLesson. O mark é otimista
          // (fire-and-forget) e o report é drenado pela LessonView na montagem
          // (seed anti-StrictMode com ref). proficiency/module e
          // submissionError/timeout NÃO chegam aqui — o painel permanece
          // (comportamento atual intacto).
          const files = multiFile
            ? spec.files.map((f) => ({ path: f.path, code: filesCode[f.path] ?? '' }))
            : [{ path: 'solution.mjs', code }];
          const errorReport = buildErrorReport({
            trackSlug: selection.trackSlug,
            lessonId: selection.lessonId ?? '',
            challengeId: spec.slug,
            challengeTitle: spec.title,
            files,
            result: res,
          });
          nav.reportChallengeError(errorReport);
          nav.navigateToLesson();
          return; // o painel fecha antes de renderizar a bolha determinística
        } else {
          setConcluded('failed');
        }
      } else {
        setSubmissionError(res.error?.message ?? 'erro ao testar');
      }
    } catch (err) {
      // Guard de montagem: idem — desmontado, nem o catch seta estado.
      if (cancelledRef.current) return;
      setSubmissionError(isTimeoutError(err) ? tI('challenge.submitTimeout') : String(err));
    } finally {
      // Idem loadSpec: o finally também só roda montado.
      if (!cancelledRef.current) setRunning(false);
    }
  }, [spec, started, running, concluded, selection, code, filesCode, activeFile, starsLeft, markAttempt, tI, nav]);

  /** Regenera o desafio: a LLM vê os erros do aluno nesta aula e não repete.
   *
   *  ONDA3 (generate-flow): o processo é GLOBAL — dispara via
   *  challengeGenerateStore + o IPC; o modal de etapas (no shell) mostra o
   *  progresso real (eventos do main). DECISÃO (documentada): o painel MANTÉM
   *  a atualização local do spec quando o invoke resolve (setSpec — fluxo
   *  atual intacto); se o painel desmontou durante a geração (troca de aba),
   *  o modal global mostra o done com "Ver desafio" (navega para o desafio
   *  novo) — o guard cancelledRef impede setState/navegação pós-await. */
  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!spec || regenerating || generateRunning) return;
    const generationId = startChallengeGenerate({
      trackSlug: selection.trackSlug,
      lessonId: selection.lessonId ?? selection.challengeId,
      // BAIXO-3: o painel de proficiência navega com target 'proficiency'
      // (nunca hardcode 'lesson' — o modal usa o target guardado no store).
      target: selection.target === 'proficiency' ? 'proficiency' : 'lesson',
    });
    if (generationId === null) {
      // Já existe um processo em voo (ex.: disparado pela bolha da aula) — o
      // modal global é o único processo; nada a fazer aqui.
      return;
    }
    setRegenerating(true);
    try {
      // FIX W1 (onda 4): timeout de 150s — o main faz ATÉ 2 tentativas de LLM
      // com 60s cada (challengeRegenerator.ts) = ~120s legítimos + verificação;
      // o timeout só desbloqueia o canal MUDO, nunca corta geração legítima.
      const res = await withTimeout(
        getApi().track.challengeRegenerate({
          trackSlug: selection.trackSlug,
          lessonId: selection.lessonId ?? selection.challengeId,
          // ALTO-2: o main ecoa o id nos eventos de progresso — o modal
          // descarta eventos de processos anteriores.
          generationId,
        }),
        ACTION_TIMEOUTS.challengeRegenerate,
        'track.challengeRegenerate',
      );
      // Guard de montagem: painel desmontado durante a geração → descarta
      // silenciosamente (o modal global conclui pelos eventos do main).
      if (cancelledRef.current) return;
      if (res.ok && res.challenge) {
        // O modal global (sempre montado) já recebeu o 'done' do main — este
        // finish é idempotente (estado terminal sticky + correlação no store).
        finishChallengeGenerate({ slug: res.challenge.slug, title: res.challenge.title }, generationId);
        setSpec(res.challenge);
        setCode(res.challenge.starterCode);
        setStarted(false);
        setElapsedMs(0);
        setStarsLeft(3);
        setConcluded(null);
        setResult(null);
        setSubmissionError(null);
        markedRef.current = null;
        // ONDA-RETOMAR: a REGENERAÇÃO troca o desafio em cena SEM trocar a
        // selection — a chave do rascunho passa a ser a do desafio NOVO (senão
        // o estado dele seria salvo sob a chave do antigo e voltaria na tela
        // errada numa remontagem) e o holder do drain é descartado: o take é
        // one-shot e um holder de OUTRA chave devolveria o rascunho errado. O
        // reset do estado acima continua sendo o de sempre (a regeneração
        // descarta a tentativa anterior — comportamento atual intacto).
        draftKeyRef.current = challengeDraftKeyFor(selection, res.challenge.slug);
        draftHolderRef.current = null;
      } else {
        const msg = res.error?.message ?? 'não foi possível gerar um novo desafio';
        failChallengeGenerate(msg, generationId);
        setSubmissionError(msg);
      }
    } catch (err) {
      // Guard de montagem: idem — desmontado, nem o catch seta estado.
      if (cancelledRef.current) return;
      const msg = isTimeoutError(err) ? tI('challenge.regenerateTimeout') : String(err);
      failChallengeGenerate(msg, generationId);
      setSubmissionError(msg);
    } finally {
      // Idem handleSubmit: o finally também só roda montado.
      if (!cancelledRef.current) setRegenerating(false);
    }
  }, [spec, regenerating, generateRunning, selection.target, selection.trackSlug, selection.lessonId, selection.challengeId, tI]);

  /**
   * ONDA 4 (next-glow): "Avançar para a próxima aula" pós-sucesso — navega para
   * a PRÓXIMA aula destravada e NÃO concluída da MESMA trilha (a aula do desafio
   * excluída), via setPendingTrackLesson + nav.navigateToLesson (padrão do
   * RoadmapView.openLesson). O spec do desafio não carrega a próxima aula
   * (quem carrega é o payload de track:lesson, `nextLesson`); aqui o painel
   * resolve pelo DETALHE da trilha (track.get): aulas na ordem dos módulos,
   * primeira com locked=false e done=false DEPOIS da aula deste desafio (a
   * mesma aula que o campo `current` do detalhe apontaria quando ela já está
   * concluída — e mais correta quando ainda não está). Fallback: erro do IPC,
   * trilha sem próxima (última aula / tudo concluído) ou lessonId ausente →
   * navega para a TRILHA (roadmap), onde o usuário vê o estado real.
   */
  const handleAdvanceToNextLesson = useCallback(async (): Promise<void> => {
    if (!spec || selection.target !== 'lesson' || !selection.lessonId) {
      onNavigate?.('roadmap');
      return;
    }
    let next: { slug: string; title: string } | null = null;
    try {
      const res = await withTimeout(
        getApi().track.get({ trackSlug: selection.trackSlug }),
        IPC_TIMEOUT_MS,
        'track.get',
      );
      if (res.ok && res.track) {
        const flat = res.track.modules.flatMap((m) => m.lessons);
        const idx = flat.findIndex((l) => l.slug === selection.lessonId);
        // Defensivo: aula deste desafio sumiu do detalhe → sem próxima (vai
        // para o fallback da trilha); NUNCA começa a varredura do índice 0
        // (idx=-1 → i=0 reapontaria para a PRÓPRIA aula).
        for (let i = idx >= 0 ? idx + 1 : flat.length; i < flat.length; i++) {
          const l = flat[i];
          if (!l.locked && !l.done) {
            next = { slug: l.slug, title: l.title };
            break;
          }
        }
      }
    } catch {
      next = null;
    }
    if (next) {
      setPendingTrackLesson(selection.trackSlug, next.slug);
      nav.navigateToLesson();
    } else {
      onNavigate?.('roadmap');
    }
  }, [spec, selection.trackSlug, selection.target, selection.lessonId, nav, onNavigate]);

  if (loading) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // W3 (falsy-proof): só `null` significa "sem erro" — '' é erro válido.
  if (loadError !== null || !spec) {
    return (
      <Box sx={{ p: 2, maxWidth: 720, mx: 'auto', pt: 4 }}>
        <Alert severity="error">{loadError ?? t('translation:challenge.trackNotFound')}</Alert>
        <Button variant="outlined" onClick={() => loadSpec(selection)} sx={{ mt: 1 }}>
          {t('translation:common.tryAgain')}
        </Button>
      </Box>
    );
  }

  const clock = formatClock(Math.max(0, spec.timeLimitMs - elapsedMs));
  // ADITIVO (rodada 9): multi-arquivo — TODOS os arquivos precisam de código.
  const multiFile = !!(spec.files && spec.files.length > 0);
  const canSubmit =
    started &&
    !concluded &&
    !running &&
    (multiFile
      ? spec.files!.every((f) => (filesCode[f.path] ?? '').trim().length > 0)
      : code.trim().length > 0);

  return (
    <Box sx={{ p: 2, maxWidth: 720, mx: 'auto' }}>
 <Stack spacing={2}>
        {/* Cabeçalho: título + dificuldade + cronômetro + estrelas. */}
 <Stack direction="row" spacing={1}  sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',  }}>
          <Box>
            <Typography variant="h5" component="h1">
              {spec.title}
            </Typography>
 <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }} >
              <Chip size="small" variant="outlined" label={tI('challenge.difficulty', { n: spec.difficulty })} />
              <Chip size="small" variant="outlined" label={tI('challenge.testsCount', { n: spec.expectedTestCount })} />
              {spec.source === 'generated' ? (
                <Chip size="small" color="secondary" label={t('translation:challenge.generatedBadge')} />
              ) : null}
            </Stack>
          </Box>
 <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box>
              {[0, 1, 2].map((i) =>
                i < starsLeft ? (
                  <StarIcon key={i} fontSize="small" sx={{ color: 'warning.main' }} />
                ) : (
                  <StarBorderIcon key={i} fontSize="small" sx={{ color: 'action.disabled' }} />
                ),
              )}
            </Box>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }} role="timer">
              {started ? clock : formatClock(spec.timeLimitMs)}
            </Typography>
          </Stack>
        </Stack>

        {/* Ato 1: enunciado + Começar (o contador só roda depois). */}
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: 2,
            '& p:first-of-type': { mt: 0 },
            '& p:last-of-type': { mb: 0 },
          }}
        >
          {/* ONDA "chat e código": a renderização de markdown deixou de ser
              uma cópia local (a MESMA função estava duplicada byte a byte aqui,
              na ChallengeView e no ChatBubble, descartando o `className` da
              cerca e pedindo uma pilha mono que não incluía a família REALMENTE
              instalada). Agora vem de src/components/markdown — com KaTeX,
              highlight de sintaxe e a distinção entrada x saída. */}
          <MarkdownView markdown={spec.statement} />
          {!started ? (
            <Button
              variant="contained"
              size="large"
              onClick={handleStart}
              startIcon={<PlayArrowIcon />}
              sx={{ mt: 2 }}
              fullWidth
            >
              {t('translation:challenge.startButton')}
            </Button>
          ) : null}
        </Box>

        {started ? (
          <>
            <Divider />

            {/* Ato 2: editor (autocomplete OFF) + testar. ADITIVO (rodada 9):
                multi-arquivo → SELETOR DE ARQUIVOS (abas MUI) com UM editor
                CodeMirror por arquivo; o submit envia o código de TODOS. */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {multiFile
                  ? t('translation:challenge.filesTitle')
                  : t('translation:challenge.editorLabel')}
              </Typography>
              {multiFile ? (
                <>
                  <Tabs
                    value={activeFile ?? spec.files![0].path}
                    onChange={(_e, v: unknown) => setActiveFile(String(v))}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ mb: 1, minHeight: 36 }}
                  >
                    {spec.files!.map((f) => (
                      <Tab
                        key={f.path}
                        value={f.path}
                        label={f.path}
                        sx={{ textTransform: 'none', minHeight: 36 }}
                        aria-label={tI('challenge.fileTabAria', { file: f.path })}
                      />
                    ))}
                  </Tabs>
                  <CodeMirrorField
                    value={filesCode[activeFile ?? ''] ?? ''}
                    onChange={(v) =>
                      setFilesCode((prev) => ({ ...prev, [activeFile ?? '']: v }))
                    }
                    filename={activeFile ?? 'solution.mjs'}
                    ariaLabel={tI('challenge.fileTabAria', { file: activeFile ?? '' })}
                    readOnly={concluded !== null}
                  />
                </>
              ) : (
                <CodeMirrorField
                  value={code}
                  onChange={setCode}
                  filename="solution.mjs"
                  ariaLabel={t('translation:challenge.editorLabel')}
                  readOnly={concluded !== null}
                />
              )}
              <Button
                variant="contained"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                sx={{ mt: 1 }}
                startIcon={running ? <CircularProgress size={16} /> : undefined}
              >
                {t('translation:challenge.testButton')}
              </Button>
            </Box>

            {/* Ato 3: veredito. */}
            {concluded === 'passed' ? (
              <Stack spacing={1}>
                <Alert severity="success">{tI('challenge.passedAnnounce', { stars: starsLeft })}</Alert>
                {/* ONDA 4 (next-glow): pós-sucesso de um desafio de AULA → o
                    aluno avança para a PRÓXIMA aula ou gera OUTRO desafio.
                    NÃO aparece para target 'module' (desafio autoral — não
                    regenera) nem 'proficiency' (fluxo próprio de
                    destravamento da trilha inteira). */}
                {selection.target === 'lesson' ? (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => void handleAdvanceToNextLesson()}
                      startIcon={<PlayCircleIcon />}
                    >
                      {t('translation:challenge.nextLessonButton')}
                    </Button>
                    <Button
                      variant="outlined"
                      color="secondary"
                      onClick={() => void handleRegenerate()}
                      disabled={regenerating || generateRunning}
                      startIcon={regenerating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
                    >
                      {t('translation:challenge.generateNewAfterPass')}
                    </Button>
                  </Stack>
                ) : null}
              </Stack>
            ) : null}

            {concluded === 'timeout' ? (
              <Alert severity="warning">{t('translation:challenge.timedOutAnnounce')}</Alert>
            ) : null}

            {result && !result.passed ? (
              <Alert severity="error" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {/* ONDA 1 (checks por teste): razão PARCIAL (N de M) + checklist
                    individual — o veredito não é tudo-ou-nada; o aluno vê o que
                    passou e o que falta antes da próxima tentativa. Sem checks
                    (erro de sintaxe etc.) a razão some — a saída fala por si. */}
                {result.checks.length > 0 ? (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'inherit' }}>
                      {tI('challenge.partialCount', { passed: result.passedCount, total: result.totalCount })}
                    </Typography>
                    <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>
                      {t('translation:challenge.checksTitle')}
                    </Typography>
                    <List dense disablePadding>
                      {result.checks.map((c, i) => (
                        <ListItem key={i} disableGutters dense sx={{ py: 0 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            {c.passed ? (
                              <CheckCircleIcon fontSize="small" color="success" />
                            ) : (
                              <CancelIcon fontSize="small" color="error" />
                            )}
                          </ListItemIcon>
                          <ListItemText
                            primary={c.name}
                            slotProps={{ primary: { variant: 'body2', sx: { fontFamily: 'inherit' } } }}
                          />
                        </ListItem>
                      ))}
                    </List>
                    </Box>
                  </Box>
                ) : null}
                <Box component="pre" sx={{ m: 0, mt: 1, maxHeight: 200, overflowY: 'auto' }}>
                  {result.output.slice(0, 4000)}
                </Box>
              </Alert>
            ) : null}

            {submissionError ? <Alert severity="error">{submissionError}</Alert> : null}

            {/* Nunca-repetir: qualquer NÃO-aprovação (falhou OU timeout) →
                erro + botão de NOVO desafio. Veredito parcial (passou alguns
                testes) também conta como não-aprovação: só passed=true aprova.
                ONDA2 (error-flow): para target 'lesson' este botão NÃO chega a
                renderizar — o painel FECHA no submit falho e a regeneração
                migrou para a bolha de erro no chat da aula. Aqui ele segue
                para a proficiência. ADITIVO (rodada 9): desafios de MÓDULO são
                autorais — a regeneração é por AULA, então não aparece para
                target 'module'. */}
            {selection.target !== 'module' && (concluded === 'failed' || concluded === 'timeout') ? (
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => void handleRegenerate()}
                // ONDA3 (generate-flow): o gating também cobre o processo
                // GLOBAL em voo (o modal pode estar rodando mesmo se este
                // painel montou depois do disparo).
                disabled={regenerating || generateRunning}
                startIcon={regenerating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
              >
                {t('translation:challenge.regenerateButton')}
              </Button>
            ) : null}

            {concluded === 'passed' && selection.target === 'proficiency' ? (
              <Alert severity="info">{t('translation:challenge.proficiencyPassed')}</Alert>
            ) : null}
          </>
        ) : null}
      </Stack>
    </Box>
  );
}
