/**
 * src/views/LessonView/LessonView.tsx — AULA em modo CHAT (rodada 8).
 *
 * A partir da rodada 8 o aluno NÃO GERA mais aula: o conteúdo vem pronto das
 * TRILHAS (resources/tracks, criadas pelo CLI de autoria tools/track-cli.ts).
 * Esta view é um chat direto com o tutor:
 *
 *   - o tutor APRESENTA a base teórica em linguagem simples, uma SEÇÃO por
 *     vez (botão "Próximo" → track:tutor-chat action 'next');
 *   - o aluno pergunta qualquer dúvida no chat (action 'answer');
 *   - as FONTES nunca aparecem no fluxo: botão "Fontes" abre um diálogo;
 *   - PRÉ-REQUISITOS: chips de aulas anteriores da trilha para revisar quando
 *     o aluno não entender (abrem a aula como um novo chat);
 *   - terminada a teoria, "Concluir aula" destrava a próxima aula (track:
 *     lesson-done) e os DESAFIOS da aula ficam disponíveis (abrem na
 *     ChallengeView com o fluxo track).
 *
 * ONDA2 (error-flow): quando um desafio de AULA FALHA, o painel fecha e o
 * chat da aula REABRE em tela cheia com a bolha de erro (checklist + saída)
 * + a pergunta do tutor ("o que você acha que errou?"). A resposta do aluno
 * (texto OU voz — mic no input) vai ao tutor com `challengeError` no payload
 * ('answer'): a IA valida a hipótese ou analisa o erro sozinha ("não sei").
 * O seed da bolha é feito NA MONTAGEM (guard anti-StrictMode com ref) e o
 * "Gerar novo desafio" migrou para DENTRO da bolha (nunca-repetir intacto).
 *
 * ONDA2-IMESSAGE (chat estilo iMessage + streaming + gating): as bolhas
 * agora vivem em src/components/chat (ChatBubble com autor/nome/hora/avatar,
 * TypewriterText e TypingIndicator). O streaming é SÓ EXIBIÇÃO: o texto
 * COMPLETO fica no histórico (trackLessonState) e o corte é visual. O
 * "Concluir aula" é BLOQUEADO enquanto houver desafio pendente
 * (isLessonFinishBlocked — lê lastVerdict do payload track.lesson).
 *
 * ONDA2-CHAT-NINTENDO (pedidos do dono): coluna em min(1920px, 100%) com o
 * painel de mensagens capado em 1000px centrado (SUPERADO pela ONDA11 — uma
 * coluna só, de 960px — cujo teto a ONDA-LARGURA-LIVRE REVOGOU: hoje a coluna
 * preenche o main, ver LESSON_COLUMN_SX); balões entram com
 * AnimatePresence + fadeInUp (só os NOVOS da sessão); auto-scroll (o "SÓ
 * quando o usuário está no fim" desta onda foi REVOGADO pela ONDA15 — hoje o
 * painel acompanha o fim SEMPRE, ver pinLogToBottom/nudgeLogToBottom) com
 * SMOOTH nos nudges (o tick do typewriter segue INSTANTÂNEO — smooth a cada
 * ~2.5ms pularia o streaming);
 * press feedback (scale 0.98) nos botões do chat; o reply do tutor ficou à
 * ESQUERDA com avatar (detalhes na ChatBubble) e o erro de execução é
 * INSTANTÂNEO (TypewriterText `instant` — a review de APROVAÇÃO continua a
 * 10 tps).
 *
 * ONDA10 (três bugs do dono, todos na experiência de estudar):
 *   1. o quiz ENTREGAVA a resposta antes do clique — conserto no LessonQuiz
 *      (função PURA `optionVisualState`, ver o cabeçalho de lá);
 *   2. o quiz PODIA SER IGNORADO — agora é GATE: "Próximo" trava enquanto a
 *      seção ATUAL tiver quiz sem resposta, e "Concluir aula" trava enquanto
 *      QUALQUER quiz já visível estiver sem resposta. As duas travas leem
 *      `answered` e NUNCA `correct` (errar não trava o aluno) e a UI DIZ o
 *      motivo — texto visível role="status" ao lado do botão, além do
 *      tooltip (Button desabilitado não dispara hover);
 *   3. a teoria era DESPEJADA a ~400 chars/s — agora é escrita em velocidade
 *      de LEITURA (7 tps = 28 chars/s, `chatBubbleTps`), com saída: clique no
 *      painel, qualquer tecla ou "Mostrar tudo" completam a bolha na hora.
 *      A review (10 tps) e as respostas do tutor (100 tps) NÃO mudaram.
 *
 * ONDA11 (o dono, olhando a tela buildada — três queixas de layout):
 *   1. "o input e o enviar do input no chat ficou todo pra esquerda e só
 *      ocupando metade da tela". A causa NÃO era largura: o composer declarava
 *      a mesma coluna do painel, mas era filho DIRETO de um <Stack spacing>,
 *      e a regra de espaçamento do Stack (`> :not(style):not(style) {
 *      margin: 0 }`, especificidade 0,1,2) apagava o `mx: 'auto'` do filho
 *      (0,1,0). Conserto estrutural: o EIXO passou para o container RAIZ
 *      (`LESSON_COLUMN_SX`, uma declaração só) e o Stack ganhou `useFlexGap`
 *      (espaçamento por `gap` do container, não por margem do filho). Toda a
 *      aula ativa — cabeçalho, progresso, painel, avisos, ação e entrada —
 *      divide UMA coluna (de 960px nesta onda; o teto foi REVOGADO pela
 *      ONDA-LARGURA-LIVRE: a coluna preenche o main e quem dita a largura é a
 *      divisória do sidebar, ver LESSON_COLUMN_SX; e o cabeçalho, com o
 *      progresso, SAIU da coluna na ONDA-AULA-NO-SIDEBAR — mora no sidebar);
 *   2. a BARRA DE ENTRADA passou ao molde da referência de chat: microfone
 *      como botão circular FORA do campo à esquerda, campo pílula ocupando
 *      todo o resto com o convite no placeholder, enviar DENTRO na borda
 *      direita (`LessonComposer`, exportado para ser renderizável em teste);
 *   3. "Próximo"/"Concluir aula" saíram da linha do input — eles viraram o
 *      CTA centralizado logo acima (o padrão anúncio+botão da referência),
 *      junto do texto role="status" que já dizia por que o botão está travado.
 *      Ali também mora o botão de ABRIR O QUIZ na mão (pedido do dono: o
 *      overlay não sobe mais sozinho), que reusa `handleQuizReopen`.
 * Coberto por tests/lessonChatLayout.test.ts (o CSS que o MUI emite, lido; a
 * barra de entrada renderizada de verdade).
 *
 * ONDA12 (a prova visual e a sonda de teclado, DEPOIS da onda 11):
 *   1. a CAIXA da conversa morreu — o painel de mensagens era um retângulo
 *      (nível 2, raio, padding) e com uma bolha só sobravam ~350px de cinza
 *      vazio. Agora ele é o NÍVEL 0 (o fundo do app), sem raio e sem padding,
 *      com a conversa ancorada EMBAIXO. O estilo virou `lessonLogSx`, função
 *      exportada — fora do JSX ele é renderizável e o teste LÊ o CSS emitido
 *      em vez de procurar texto no fonte; a conta de contraste recalculada do
 *      nível 2 para o nível 0 está no cabeçalho dela;
 *   2. o CTA DUPLICADO morreu — havia DOIS "Responder" a ~60px um do outro (o
 *      do QuizChatCard e um segundo na linha de ação). Ficou o do CARD, que é
 *      quem nomeia a pergunta no `aria-label`; o card ganhou um efeito que o
 *      traz à vista, porque virou o único convite;
 *   3. PARADAS DE TAB FANTASMA — todo `<motion.span whileTap>` desta view
 *      ganhou `tabIndex={-1}`. Sem ele o framer marca `tabIndex=0` na casca
 *      animada e o teclado para num <span> mudo antes de cada botão (o
 *      microfone era regressão da onda 11).
 *
 * ONDA15 (auto-scroll — pedido do dono, ao pé da letra: "durante a aula quero
 * auto scroll do conteúdo sempre pro final da tela"): a decisão da
 * ONDA2-CHAT-NINTENDO de só puxar o painel quando o aluno JÁ estava no fim
 * está REVOGADA. O guard de posição (`NEAR_BOTTOM_PX` + `isNearBottom`) morreu
 * inteiro: o tick da digitação e o nudge de fim puxam o painel ao fim SEMPRE.
 * As duas decisões viraram funções PURAS exportadas (`pinLogToBottom` /
 * `nudgeLogToBottom`) — é o que permite prová-las com um elemento FAKE, sem
 * jsdom (tests/lessonAutoScroll.test.ts). O gatilho continua sendo CONTEÚDO
 * NOVO: nenhum listener de `scroll` foi acrescentado, justamente para não
 * brigar com o aluno a cada evento de rolagem — o efeito pedido é o painel
 * SEMPRE no fim durante a aula.
 *
 * ONDA2-QUIZ-OVERLAY (o dono, textualmente: "o layout do quiz deve ser sobre a
 * tela e respondendo ele minimiza para ficar no chat" + "só vamos para o
 * desafio depois que o aluno provar que entendeu"):
 *
 *   - o quiz da seção deixou de ser um card no meio da conversa e passou a
 *     SUBIR SOBRE A TELA num overlay montado no SHELL (App.tsx, o molde do
 *     ChallengeGenerateModal). Responder MINIMIZA: o card desce e vira o
 *     `QuizChatCard`, ancorado na bolha da seção que o demonstra;
 *   - ERRAR abre o ciclo de remediação, e é esta view que o executa contra o
 *     main: `track.quizExplain` → `registerQuizExplanation` (a explicação vira
 *     BOLHA da conversa) → `track.quizRemedial` → `injectRemediationQuiz` (o
 *     quiz novo sobe de volta). Repete até o ACERTO, que é o único fim;
 *   - toda resposta é registrada com `track.quizAttempt` — uma vez, porque ele
 *     já devolve a maestria recalculada;
 *   - FAIL-CLOSED em toda a linha: `{ok:false}` (ou canal mudo) NUNCA vira
 *     conteúdo inventado. Sem explicação o ciclo SEGUE mesmo assim (caminho de
 *     degradação de `injectRemediationQuiz`); sem quiz novo o ciclo PARA e a
 *     tela oferece pedir de novo. O aluno nunca fica preso sem saber por quê
 *     — e, desde a ONDA4-SAÍDA-DO-CICLO, também não fica preso SEM SAÍDA (ver
 *     abaixo);
 *   - LARGURAS: painel de mensagens e linha de entrada passam a dividir a
 *     MESMA coluna (`LESSON_COLUMN_SX` — sem teto desde a ONDA-LARGURA-LIVRE)
 *     — o eixo de leitura e o de escrita não batiam —, e o painel saiu de
 *     `action.hover` (overlay alfa, a única superfície do app fora da rampa
 *     `surface.level0..4`) para o nível 2.
 *
 * ONDA4-SAÍDA-DO-CICLO (o defeito que a cobertura e2e desta base declarou como
 * OBSERVADO, tests/e2e/e2e-quiz.spec.ts teste 5): "pedir de novo" só serve
 * enquanto a IA pode responder. Com ela FORA, errar deixava a afirmação em
 * 'explicando'/'novo-quiz-pendente' PARA SEMPRE — sem quiz remediador não há o
 * que responder, e o gate de maestria só abre com ACERTO: o "Próximo" ficava
 * desabilitado e não havia um único clique que mudasse isso. A saída é
 * `handleQuizReopenGeneration`: com o ciclo TRAVADO (e só nesse caso), o aluno
 * reabre a MESMA pergunta numa geração nova (`reopenStalledQuiz`) e responde de
 * novo. O gate NÃO é dispensado — o estado volta a 'aguardando-resposta' e só
 * o acerto fecha a chave — e a tentativa nova CONTA (`attempts` preservado,
 * `track.quizAttempt` gravado, recorrência ERR-4 somando).
 *
 * ONDA3-PERSISTENCIA (o buraco que a onda do overlay deixou declarado): o
 * ciclo inteiro era GRAVADO no banco e NUNCA lido de volta — `track:quiz-
 * history` não tinha chamador. A maestria sobrevivia à troca de aba (o
 * `lessonChatCache` é um Map em memória de módulo) e MORRIA no fechamento do
 * app: o aluno que dominou três quizzes voltava e encontrava tudo por
 * responder, travado de novo em algo que já tinha provado. Agora `loadLesson`
 * faz DUAS leituras — o conteúdo e o HISTÓRICO — e o histórico entra no estado
 * pelo redutor PURO `hydrateQuizFromHistory`. A PRECEDÊNCIA é: o estado desta
 * SESSÃO vence chave a chave, e o banco só PREENCHE as chaves que a sessão não
 * tem (toda resposta é escrita primeiro no estado e só depois no banco, cuja
 * gravação é best-effort — para uma chave já tocada o banco só pode estar
 * atrasado). FAIL-CLOSED como o resto: `{ok:false}` ou canal mudo abrem a aula
 * SEM histórico, com aviso `info` — nunca travando o aluno, nunca inventando
 * maestria que ele não conquistou.
 *
 * ONDA-AULA-NO-SIDEBAR (o dono, sobre o sidebar estilo VSCode: "ele foi feito
 * errado porque a informação dele nunca muda, seu objetivo era pegar o header
 * tag content de cada aula e mover para essa região"): o cabeçalho da aula —
 * título, resumo, progresso da teoria, Desafios/Fontes e pré-requisitos —
 * SAIU da coluna (era o `<header>` do CollapsibleLessonHeader, aposentado) e é
 * publicado no slot do sidebar do shell por `<ShellSidebarPortal>`, como o
 * LessonSidebarHeader. O portal muda só ONDE o DOM é pintado: estado, handlers,
 * a âncora do popover de Desafios e o diálogo de Fontes continuam desta view.
 * Cada aula publica o SEU cabeçalho; fora da aula ativa (outra aba, aula
 * vazia/carregando/erro) nada é publicado e o slot fica vazio. O porquê de
 * cada peça está no portal, no fim do `return` da aula ativa.
 *
 * Entrada (precedência na MONTAGEM — onda1-nav-ui):
 *   1. `nav.challengeErrorReport` (Desafio → Aula, erro) — define o alvo;
 *   2. `pendingTrackLesson` (Trilha → Aula) drenado na MONTAGEM
 *      (src/lib/pendingSubject.ts);
 *   3. `peekLastLesson()` (src/lib/lastLesson.ts) — a ÚLTIMA aula aberta na
 *      sessão (pedido do dono: "quando eu clico em aula eu veja a última aula
 *      aberta ou nenhum"), com o chat RESTAURADO do cache de sessão;
 *   4. sem nenhum dos três, a view mostra o seletor de trilhas (estado
 *      vazio) — nunca gera.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  List,
  ListItem,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme, type SxProps, type Theme } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LockIcon from '@mui/icons-material/Lock';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';

import { getApi } from '../../lib/apiBridge';
import {
  ACTION_TIMEOUTS,
  IPC_TIMEOUT_MS,
  isTimeoutError,
  resolveChannelError,
  withTimeout,
} from '../../lib/ipcTimeout';
import {
  lessonBusyReasonFor,
  useSessionState,
} from '../../lib/sessionState';
import { useChallengeNav } from '../../lib/challengeNav';
import { useMicSTT } from '../../hooks/useMicSTT';
import {
  applyTutorReply,
  chatBubbleTps,
  chatDaySeparator,
  chatHistory,
  clearChallengeError,
  createTrackLessonState,
  hydrateQuizFromHistory,
  injectRemediationQuiz,
  isQuizMastered,
  isTheoryPresentationBubble,
  lessonFinishBlock,
  pendingQuizzes,
  pendingQuizzesForCurrentSection,
  pushUserMessage,
  quizzesByMessageIndex,
  registerQuizExplanation,
  reopenStalledQuiz,
  seedChallengeError,
  submitQuizAnswer,
  visibleQuizFor,
  type LessonFinishBlockReason,
  type TrackLessonUiState,
  type VisibleQuiz,
} from '../../lib/trackLessonState';
// ONDA2-QUIZ-OVERLAY: a FASE do overlay (sobre-a-tela / minimizado-no-chat /
// fechado) é de outra máquina, module-level, que sobrevive à desmontagem da
// view. Esta view CONSOME — nunca escreve `setState` cru de fase.
import {
  applyQuizOverlayStep,
  closeQuizOverlay,
  minimizeQuizOverlay,
  openQuizOverlay,
  peekQuizOverlay,
  reopenQuizOverlay,
  subscribeQuizOverlay,
} from '../../lib/quizOverlayState';
import { overlayContextFor, overlayStatusFor, quizCycleTag } from '../../components/quiz/quizOverlayBridge';
import {
  publishQuizOverlayContent,
  type QuizOverlayStatus,
} from '../../components/quiz/quizOverlayContent';
import { QuizChatCard } from '../../components/quiz/QuizChatCard';
import {
  createTrackLessonPendingHolder,
  drainPendingDomain,
  drainPendingLessonId,
  drainPendingSubject,
} from '../../lib/pendingSubject';
import {
  createLessonChatHolder,
  saveLessonChat,
} from '../../lib/lessonChatCache';
import { peekLastLesson, saveLastLesson } from '../../lib/lastLesson';
// ONDA2-PREFETCH: pré-carga da próxima aula no cache do main (warm-up
// best-effort, fire-and-forget — nunca afeta o caminho crítico).
import { prefetchLesson } from '../../lib/lessonPrefetch';
// ONDA3 (generate-flow): o processo de "Gerar novo desafio" é GLOBAL (store
// module-level + modal no shell) — a view dispara e o modal mostra as etapas.
import {
  failChallengeGenerate,
  finishChallengeGenerate,
  peekChallengeGenerate,
  startChallengeGenerate,
  subscribeChallengeGenerate,
} from '../../lib/challengeGenerateStore';
import { AnimatePresence, motion } from 'motion/react';
import { fadeInUp, springs } from '../../lib/animationTokens';
// ONDA-AULA-NO-SIDEBAR: o cabeçalho da aula (título, resumo, progresso,
// Desafios/Fontes, pré-requisitos) mora no SIDEBAR do shell. Esta view o
// PUBLICA no slot da coluna por portal (`ShellSidebarPortal`) e continua dona
// do estado e dos handlers; o componente é o LessonSidebarHeader (vertical, sem
// colapso). O colapsável da ONDA2-LAYOUT (CollapsibleLessonHeader), que vivia
// DENTRO da coluna da aula como `<header>`, foi aposentado.
import { ShellSidebarPortal } from '../../components/shell/ShellSidebarSlot';
import { LessonSidebarHeader } from '../../components/course/LessonSidebarHeader';
// ONDA11: o raio de PÍLULA da barra de entrada sai do token de forma do design
// system (SHAPE.pill) — cor e forma são CONSUMIDAS, nunca redefinidas aqui.
import { SHAPE } from '../../lib/designTokens';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { TypingIndicator } from '../../components/chat/TypingIndicator';
// ONDA4 (quiz): confete + anúncio acessível ao CONCLUIR a aula (brilho/celebração).
import { announceStatus, fireConfetti } from '../../lib/confetti';
import { LessonQuizCard } from './LessonQuiz';
import type {
  TrackAssertionDto,
  TrackChallengeSummaryDto,
  TrackLessonPayload,
} from '../../../shared/ipc-contract';
import type { ViewProps } from '../placeholders';

/**
 * ONDA4 (quiz, contrato com a sub-tarefa irmã onda4-next-glow): a irmã
 * entrega `nextLesson` (próxima aula da trilha) no TrackLessonPayload — o
 * merge dela vem ANTES desta onda no main. ENQUANTO o campo não existir no
 * contrato (ipc-contract.ts é da irmã — NÃO edito), este tipo local +
 * cast defensivo mantém o app compilando; após o merge, o campo passa a
 * existir no payload e o cast vira redundância inofensiva.
 */
type LessonPayloadWithNext = TrackLessonPayload & {
  nextLesson?: { slug: string; title: string } | null;
};

/**
 * ONDA11 (o dono, olhando a tela: "o input e o enviar do input no chat ficou
 * todo pra esquerda e só ocupando metade da tela") + ONDA-LARGURA-LIVRE (o
 * dono, sobre a aula: "o texto da aula, que está dentro de uma limitação de
 * width, não deve ter mais essa limitação — o sidebar define o limite da área
 * de texto simplesmente pelo seu tamanho"): a COLUNA da aula — UM eixo só,
 * declarado UMA vez, e SEM TETO.
 *
 * ─── ONDA-LARGURA-LIVRE: QUEM DITA A LARGURA DO TEXTO É A DIVISÓRIA ────────
 * Até aqui a coluna era `maxWidth: CHAT_COLUMN_MAX_PX` (960) + `mx: 'auto'`,
 * e o balão tinha um SEGUNDO teto, `min(78%, 80ch)`. Em janela larga os dois
 * venciam o sidebar: arrastar a divisória só mudava a MARGEM vazia dos lados
 * — o texto ficava preso em 960 centralizado. O dono pediu o contrário: a
 * divisória É o controle da largura do texto. Então:
 *   - `CHAT_COLUMN_MAX_PX` MORREU (era exatamente a limitação) e o eixo virou
 *     `{ width: '100%', minWidth: 0 }`: a coluna PREENCHE o main, sem
 *     `maxWidth` e sem `mx: 'auto'` — não há o que centralizar quando a coluna
 *     é do tamanho do lugar onde mora;
 *   - a cadeia inteira ficou RELATIVA: main = contêiner do split − sidebar −
 *     divisória (App.tsx, com os pisos de SHELL_SPLIT_CONSTRAINTS em
 *     src/lib/splitRatio.ts); coluna = main − os paddings; balão = 78% da
 *     coluna (ChatBubble — só o 78%, o `ch` saiu). Não sobrou número absoluto
 *     entre a divisória e a linha de texto, então a largura do texto
 *     acompanha a divisória em QUALQUER tamanho de janela;
 *   - `minWidth: 0` é o piso DECLARADO: a coluna nunca reivindica largura pelo
 *     CONTEÚDO (uma linha longa de código, uma URL sem quebra) — quem manda é
 *     o main, e o main é o que a divisória deixa. Hoje o main é flex COLUMN e
 *     a largura é o eixo cruzado, onde o `min-width: auto` já resolve a 0; o
 *     `minWidth: 0` torna isso contrato desta coluna em vez de depender da
 *     direção do flex do shell;
 *   - SC 1.4.8 (linha de até 80 caracteres) é critério de MECANISMO: pede que
 *     o aluno CONSIGA estreitar a linha, não um teto fixo imposto a todos. O
 *     mecanismo agora é a própria divisória (e a janela) — que é o que o dono
 *     escolheu. Os tokens `TYPE.measureCh`/`measureMaxCh` seguem no design
 *     system; só deixaram de ser aplicados como teto aqui e no balão.
 *
 * ─── O QUE FOI MANTIDO (ONDA11), e continua valendo sem o teto ─────────────
 * O defeito da ONDA11 NÃO era de largura: o painel de mensagens e a linha de
 * entrada declaravam a MESMA largura e o MESMO `mx: 'auto'`, e mesmo assim o
 * painel saía centrado e a entrada encostada na esquerda. A causa é
 * ESPECIFICIDADE: `<Stack spacing={1.5}>` sem `useFlexGap` emite, para os
 * PRÓPRIOS FILHOS,
 *
 *     .css-STACK > :not(style):not(style) { margin: 0; }
 *
 * — especificidade (0,1,2), contra os (0,1,0) da classe que o `sx` do filho
 * gera. A regra do PAI vence e apaga o `margin-left/right: auto` do filho: os
 * eixos de LEITURA e de ESCRITA deixavam de bater. O CSS que prova isso está
 * LIDO (não deduzido) em tests/lessonChatLayout.test.ts, bloco 1. O conserto,
 * que não depende de sorte de especificidade, fica inteiro:
 *   1. o EIXO é do CONTAINER RAIZ (`LESSON_COLUMN_SX`), aplicado uma única
 *      vez. Nenhum filho declara largura nem centralização própria — todos só
 *      PREENCHEM. Painel, avisos, ação e entrada dividem ESTA coluna (o
 *      cabeçalho e o progresso saíram dela para o sidebar do shell na
 *      ONDA-AULA-NO-SIDEBAR): leitura e escrita são, literalmente, o mesmo
 *      container;
 *   2. o Stack da coluna mantém `useFlexGap`: o espaçamento é `gap` (do
 *      CONTAINER) em vez de margem (do FILHO). A armadilha segue fora de campo
 *      até para um filho FUTURO que volte a querer eixo próprio.
 * Sem teto não há mais centralização — mas "um eixo, na raiz" continua sendo
 * o que impede um filho de voltar a declarar o seu.
 */
export const LESSON_COLUMN_SX = { width: '100%', minWidth: 0 } as const;

/**
 * ONDA12 (o dono, comparando a tela com a referência de chat que ele mandou):
 * A CAIXA DA CONVERSA MORREU.
 *
 * ─── O DEFEITO ────────────────────────────────────────────────────────────
 * O painel de mensagens era um RETÂNGULO desenhado (`surface.level2`,
 * `borderRadius: 2`, `p: 1.5`). Com uma bolha só na conversa — que é como TODA
 * aula começa — sobravam ~350px de cinza vazio até a borda de baixo: a caixa
 * anunciava um conteúdo que não existia. A referência não desenha caixa
 * nenhuma; as mensagens ficam direto no fundo da tela, ancoradas EMBAIXO,
 * junto de quem escreve.
 *
 * ─── O CONSERTO, e o que ele NÃO pode levar junto ─────────────────────────
 * O painel passa ao NÍVEL 0 — o fundo do app (`background.default` é
 * `surface.level0`, ver theme.ts). Não é `transparent` escrito à mão: é a
 * rampa, explícita, do jeito que o guarda-corpo de superfície cobra, e é o que
 * o teste consegue LER no CSS emitido. Some o raio, some o padding, e entra
 * `justifyContent: 'flex-end'`: a conversa cresce de BAIXO para cima, então o
 * vazio de uma aula recém-aberta é fundo do app, não retângulo.
 * `justify-content` aqui é seguro porque quem ROLA é o Box de fora — este
 * cresce com o conteúdo e nunca chega a ter sobra para cortar o topo.
 * O scroll interno, o `role="log"`, o `aria-live` e o clique-para-pular-
 * digitação continuam no MESMO elemento.
 *
 * ─── OS NÚMEROS, RECALCULADOS (nível 2 → nível 0) ─────────────────────────
 * Tudo que era "sobre o painel" passou a ser contra o nível 0. O texto que
 * mora DIRETO no painel (o convite da aula vazia, o separador de dia, a linha
 * do "digitando") melhorou nos dois esquemas — e no escuro ele saiu de uma
 * violação real do AAA que este arquivo prometia:
 *   claro  #191713 (primária)   15,49:1 → 16,75:1   ·  #544e45 (secundária) 7,12:1 → 7,70:1
 *   escuro #f0f0f0 (primária)   13,11:1 → 16,94:1   ·  #adadad (secundária) 6,66:1 → 8,60:1
 * — a secundária no escuro estava ABAIXO de 7:1 sobre o nível 2, que é
 * exatamente por que `READING_SURFACE_LEVELS` (designTokens.ts) só admite os
 * níveis 0 e 1 como superfície de leitura. Agora o painel É nível 0.
 * O que PIOROU, dito sem maquiagem: o degrau balão-contra-fundo. O balão é
 * nível 1 e media 1,16:1 (claro) / 1,15:1 (escuro) contra o nível 2; contra o
 * nível 0 mede 1,07:1 / 1,12:1. Nenhum dos dois pares alcança 3:1 — nem antes,
 * nem depois — e nenhum precisa: o balão não é controle, e quem identifica o
 * autor é o cabeçalho com nome e avatar (SC 1.4.11 cobre o que é PRECISO para
 * identificar componente e estado, e aqui isso é texto). A separação virou
 * decisão de composição, não de contraste — é o que a referência faz.
 */
export function lessonLogSx(theme: Theme): SxProps<Theme> {
  return {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    // A conversa ancora EMBAIXO: sem isso, uma bolha só deixa o resto da
    // altura como vazio no TOPO — o retângulo que esta onda matou.
    justifyContent: 'flex-end',
    gap: 1,
    // Nível 0 = o fundo do app. O painel deixa de ser caixa e vira tela.
    bgcolor: theme.vars.palette.surface.level0,
  };
}

/**
 * Alvo de toque mínimo (px) — o piso de 44 que o design system cobra para
 * qualquer controle apontável. O IconButton do MUI nasce com 40.
 */
const TOUCH_TARGET_PX = 44;

/**
 * ONDA11 — a BARRA DE ENTRADA no molde da referência de chat que o dono
 * mandou: botão CIRCULAR de ícone FORA do campo, à esquerda (o microfone);
 * campo PÍLULA ocupando toda a largura restante, com o convite no PLACEHOLDER
 * (o label flutuante saiu); ícone de enviar DENTRO, na borda direita. O
 * "Próximo"/"Concluir aula" saíram desta linha — eles viraram a AÇÃO
 * centralizada logo acima (o CTA da referência) e não roubam mais largura do
 * campo.
 *
 * Componente de APRESENTAÇÃO exportado DE PROPÓSITO: sem jsdom nesta base, um
 * pedaço de tela só é testável se puder ser montado sozinho. É ele que
 * tests/lessonChatLayout.test.ts (bloco 3) renderiza de verdade, com o tema
 * real, para medir ordem do DOM, raio, alvo de toque e nomes acessíveis. A
 * view usa ESTE componente — não existe cópia para teste.
 *
 * O que NÃO pode regredir (herdado de ondas anteriores): aria-label do mic e
 * do enviar, `data-onboarding-target` (alvo do tutorial e do sinal de
 * onboarding), o Tooltip, Enter sem Shift para enviar, o enviar desabilitado
 * com rascunho vazio e o alvo de toque de 44px.
 */
export interface LessonComposerProps {
  /** Texto em edição (a view é dona do estado — aqui é controlado). */
  draft: string;
  onDraftChange: (value: string) => void;
  /** Enter (sem Shift) e o botão de enviar chamam o MESMO caminho. */
  onSend: () => void;
  /** Liga/desliga a transcrição por voz (o hook vive na view). */
  onMicToggle: () => void;
  micTranscribing: boolean;
  /** Aula ocupada: trava mic, campo e enviar (nada de pergunta em voo dupla). */
  disabled: boolean;
}

export function LessonComposer({
  draft,
  onDraftChange,
  onSend,
  onMicToggle,
  micTranscribing,
  disabled,
}: LessonComposerProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const theme = useTheme();
  // Sem label flutuante, o campo PRECISA de nome acessível próprio: o mesmo
  // texto do placeholder vai para o aria-label do <input>. Placeholder não é
  // rótulo (SC 3.3.2) — ele some ao digitar.
  const askLabel = tI('lesson.askInput');
  const micLabel = micTranscribing ? tI('lesson.micStop') : tI('lesson.micStart');

  return (
    <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
      <Tooltip title={micTranscribing ? t('translation:lesson.micStop') : t('translation:lesson.micStart')}>
        {/* <span>: o Tooltip escuta eventos que um controle DESABILITADO não
            dispara — sem o wrapper a dica some justamente quando explicaria o
            porquê. */}
        <span>
          <motion.span
            whileTap={{ scale: 0.98 }}
            transition={springs.snappy}
            // ONDA12 (sonda de teclado no Electron real): o `motion` marca
            // `tabIndex=0` em TODO elemento com gesto quando o autor não declara um
            // (framer-motion, render/html/use-props.mjs). A sonda leu, nesta linha,
            // `{"tag":"span","tabindex":"0","role":null,"nome":""}` ANTES do botão:
            // uma parada de tab que não anuncia nada e não faz nada. A casca animada
            // nunca recebe foco — quem recebe é o controle dentro dela. Mesmo
            // conserto (e mesmo motivo) do irmão components/quiz/QuizChatCard.tsx.
            tabIndex={-1}
            style={{ display: 'inline-block' }}
          >
            <IconButton
              onClick={onMicToggle}
              disabled={disabled}
              aria-label={micLabel}
              sx={{
                width: TOUCH_TARGET_PX,
                height: TOUCH_TARGET_PX,
                border: '1px solid',
                borderColor: 'divider',
                // Superfície da rampa (nunca `action.hover`, que é ESTADO).
                bgcolor: theme.vars.palette.surface.level1,
              }}
            >
              {micTranscribing ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
            </IconButton>
          </motion.span>
        </span>
      </Tooltip>
      <TextField
        fullWidth
        size="small"
        data-onboarding-target="lesson-chat-input"
        placeholder={askLabel}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) onSend();
        }}
        disabled={disabled}
        slotProps={{
          htmlInput: { 'aria-label': askLabel },
          input: {
            sx: {
              // String com unidade de propósito: `borderRadius` numérico no
              // `sx` é MULTIPLICADO por theme.shape.borderRadius (14) — 999
              // viraria 13986px.
              borderRadius: `${SHAPE.pill}px`,
              minHeight: TOUCH_TARGET_PX,
              pr: 0.5,
              bgcolor: theme.vars.palette.surface.level1,
            },
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title={t('translation:lesson.askSend')}>
                  <motion.span
                    whileTap={{ scale: 0.98 }}
                    transition={springs.snappy}
                    // Casca animada: nunca parada de tab (o porquê está no microfone).
                    tabIndex={-1}
                    style={{ display: 'inline-block' }}
                  >
                    {/* O Tooltip é dica VISUAL; o aria-label é o NOME
                        acessível (nada duplicado na tela). */}
                    <IconButton
                      onClick={onSend}
                      disabled={disabled || !draft.trim()}
                      aria-label={tI('lesson.sendMessage')}
                      sx={{ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX }}
                    >
                      <SendIcon fontSize="small" />
                    </IconButton>
                  </motion.span>
                </Tooltip>
              </InputAdornment>
            ),
          },
        }}
      />
    </Stack>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA14 — A LINHA DE AÇÃO É UM LUGAR SÓ, E ELE MOSTRA O PRÓXIMO PASSO
 *
 * Dois pedidos do dono, na mesma frase, sobre o MESMO pedaço de tela:
 *
 *   1. *"quando clico em proximo ja tem que mostrar tudo da digitaçao
 *      anterio"* — o clique no "Próximo" durante a escrita da seção REVELA a
 *      seção inteira, em vez de avançar por cima de um texto pela metade;
 *   2. *"quero esse botao [de desafio] embaixo tambem porque o ultimo
 *      'proximo' eh o desafio"* — quando a teoria acabou e o que falta é o
 *      DESAFIO, é ele que a linha de ação tem de oferecer.
 *
 * ─── POR QUE UM PASSO, e não uma pilha de booleanos no JSX ─────────────────
 * A linha de ação nunca foi uma coleção de botões: ela é UM lugar que diz o
 * que fazer AGORA, e o nome do botão muda com o estado (mostrar tudo → avançar
 * a teoria → responder o quiz → fazer o desafio → concluir → próxima aula). A
 * onda 12 removeu dali um "Responder" duplicado exatamente por isso — dois
 * convites para a mesma ação a 60px um do outro. Escrever essa decisão como
 * uma FUNÇÃO PURA (e não como três ternários aninhados no meio do JSX) é o que
 * permite prová-la sem DOM: esta base não tem jsdom, então o que não for puro
 * ou renderizável sozinho não é testável de verdade.
 *
 * ─── O CASO DE BORDA QUE O PEDIDO 1 ESCONDIA, e a escolha feita ────────────
 * Hoje o "Próximo" fica DESABILITADO enquanto o quiz da seção não tem acerto,
 * e o card do quiz só nasce quando a bolha TERMINA de ser escrita. Ou seja:
 * durante a digitação o botão está travado e o clique do dono nem acontece.
 * Havia duas leituras:
 *   (a) o botão continua travado durante a digitação (o "revelar" só valeria
 *       quando ele já estivesse clicável — que é justamente quando não há mais
 *       nada a revelar: o caso do pedido nunca seria atendido);
 *   (b) durante a DIGITAÇÃO o botão fica clicável e o clique REVELA — sem
 *       avançar —, voltando a travar pelo quiz assim que o texto termina.
 * Escolhida a (b), que é o que o dono descreveu (ele CLICA e espera ver tudo).
 * Ela NÃO afrouxa o gate, e isso é o ponto: no passo 'revelar' o clique chama
 * `requestSkipTyping`, NUNCA `sendNext` — `nextClickAction` abaixo é a prova
 * dessa separação, e `sendNext` mantém o guard `if (nextBlockedByQuiz) return`
 * para o caso de o texto terminar entre o mousedown e o clique. Em hipótese
 * nenhuma o aluno avança de seção sem responder o quiz.
 *
 * ─── E A MENSAGEM role="status" CONTINUA DIZENDO A VERDADE ────────────────
 * `lessonActionStatusKey` amarra cada passo à frase correspondente: durante a
 * escrita ela diz que o "Próximo" mostra tudo (e não pede um quiz que ainda
 * não está na tela — a mentira que a onda 13 já tinha consertado); com o card
 * em cena ela pede a resposta; na conclusão ela conta quantos quizzes faltam;
 * e com o desafio pendente ela diz que é ELE que falta — nunca um botão morto
 * e mudo.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** O passo que a linha de ação oferece AGORA (um só, sempre). */
export type LessonActionStep =
  /** a seção está sendo escrita — o clique MOSTRA TUDO (não avança). */
  | 'revelar'
  /** o quiz da seção ainda não foi acertado — "Próximo" travado. */
  | 'quiz-secao'
  /** teoria em curso, nada travando — "Próximo" avança. */
  | 'proximo'
  /** teoria acabou, mas há quiz sem acerto — "Concluir aula" travado. */
  | 'quiz-aula'
  /** teoria acabou e o que falta é o DESAFIO — ele vira o CTA de baixo. */
  | 'desafio'
  /** nada travando — "Concluir aula". */
  | 'concluir'
  /** aula já concluída — "Avançar para a próxima aula". */
  | 'proxima-aula';

export interface LessonActionStepInput {
  /** `chat.theoryDone` — não há mais seção a apresentar. */
  theoryDone: boolean;
  /** `track:lesson-done` já voltou ok nesta sessão. */
  doneMarked: boolean;
  /**
   * uma SEÇÃO DE TEORIA está sendo escrita agora.
   *
   * É deliberadamente mais estreito que "alguma bolha digitando": a explicação
   * do ciclo de remediação também digita (na velocidade de leitura, kind
   * 'quiz-explanation'), e ali o passo NÃO pode virar 'revelar' — o quiz está
   * aberto esperando resposta, e um "Próximo" vivo no meio disso diria a coisa
   * errada. Quem separa é `isTheoryPresentationBubble` (trackLessonState),
   * o mesmo critério que escolhe a velocidade da digitação.
   */
  typingTheory: boolean;
  /** `pendingQuizzesForCurrentSection` > 0. */
  nextBlockedByQuiz: boolean;
  /** `lessonFinishBlock(...)` — o motivo do bloqueio da conclusão. */
  finishBlock: LessonFinishBlockReason | null;
}

/**
 * O PRÓXIMO PASSO da aula, do estado inteiro. PURA.
 *
 * A ORDEM das cláusulas é a decisão de produto, e cada uma tem motivo:
 *   - `doneMarked` primeiro: concluída é concluída, nada mais bloqueia;
 *   - 'revelar' ANTES de 'quiz-secao': é o que destrava o pedido do dono — com
 *     a seção em escrita o botão fica vivo para MOSTRAR TUDO. O gate não some,
 *     ele volta no render seguinte (a bolha termina → o card do quiz nasce →
 *     o passo vira 'quiz-secao'), e revelar nunca avança;
 *   - 'quiz-aula' ANTES de 'desafio': é a precedência que `lessonFinishBlock`
 *     já estabelece (o quiz está na tela, a um clique — desbloqueio mais
 *     barato que abrir o painel do desafio).
 */
export function lessonActionStep(input: LessonActionStepInput): LessonActionStep {
  if (input.doneMarked) return 'proxima-aula';
  if (!input.theoryDone) {
    if (input.typingTheory) return 'revelar';
    if (input.nextBlockedByQuiz) return 'quiz-secao';
    return 'proximo';
  }
  if (input.finishBlock === 'quiz') return 'quiz-aula';
  if (input.finishBlock === 'challenges') return 'desafio';
  return 'concluir';
}

/**
 * O que o clique no botão de AVANÇO faz, por passo. PURA — e existe para que
 * "revelar não avança" seja uma afirmação verificável, não uma promessa de
 * comentário:
 *   - 'revelar' → completa a digitação (`requestSkipTyping`);
 *   - 'avancar' → pede a próxima seção (`sendNext`);
 *   - 'nada'    → o botão está travado (quiz sem acerto) — nenhum caminho,
 *                 nem por atalho, chama `sendNext` a partir daqui.
 */
/**
 * O DESAFIO ESTÁ ABERTO PARA ESTE ALUNO AGORA? PURA.
 *
 * A regra é do dono, e é anterior a esta onda: *"só vamos para o desafio depois
 * que o aluno provar que entendeu"*. A onda 14 pôs o desafio na linha de ação
 * de baixo e o gateou corretamente (ele só nasce no passo 'desafio', ou seja,
 * com todo quiz VISÍVEL acertado) — mas a revisão adversarial mediu que a
 * OUTRA rota, o botão "Desafios" do cabeçalho, que já existia antes, abria o
 * desafio sem guard nenhum. Duas portas para o mesmo lugar, uma trancada e
 * outra escancarada: a regra valia só para quem entrasse pela primeira.
 *
 * O critério aqui é o MESMO de `lessonFinishBlock` — quiz pendente é
 * `finishBlock === 'quiz'` —, de propósito: uma segunda régua para a mesma
 * pergunta é como um gate volta a divergir do outro na onda seguinte.
 *
 * O que isto NÃO faz: esconder o botão. O dono pediu, literalmente, que ele
 * *"continue em cima"*. Ele continua (desde a ONDA-AULA-NO-SIDEBAR, no alto do
 * sidebar do shell, com o resto do cabeçalho da aula), a lista continua
 * abrindo, e o que o bloqueio faz é DIZER o motivo (nada de botão morto e
 * mudo) — a mesma decisão que o "Próximo" travado já segue.
 */
export function challengeOpenBlockedByQuiz(finishBlock: LessonFinishBlockReason | null): boolean {
  return finishBlock === 'quiz';
}

/**
 * ONDA16-PIN (o dono, textualmente: "fica um pin de item em Desafios mas ele
 * só libera no fim da aula então não deveria ter esse pin").
 *
 * O QUE O BADGE DIZIA E O QUE O APP FAZIA eram coisas diferentes: o badge do
 * botão "Desafios" do cabeçalho contava `lastVerdict !== 'passed'` desde a
 * PRIMEIRA seção da teoria — o pin acendia na abertura da aula —, mas o
 * desafio só LIBERA no fim dela. Um pin que anuncia algo que o clique não
 * pode entregar é a mesma mentira que a onda 10 caçou nos gates.
 *
 * A LIBERAÇÃO é o MESMO gate que produz o passo 'desafio' da linha de ação:
 *   - a teoria acabou (`chat.theoryDone`) — é o que a precedência de
 *     `lessonActionStep` cobra antes de chegar a 'desafio';
 *   - e todo quiz VISÍVEL já foi dominado (`pendingQuizCount === 0` — o mesmo
 *     `quizPendingAll.length` que `lessonFinishBlock` lê).
 * Enquanto isso, o badge vale ZERO (e o MUI esconde o badge com 0 —
 * `showZero: false` é o default), sem tocar no GATING de abertura: o botão
 * continua aí, o popover continua abrindo, e quem decide se o desafio PODE
 * abrir segue sendo `challengeOpenBlockedByQuiz`/`openChallenge`, intactos.
 *
 * PURA e exportada — o padrão de `lessonActionStep`/`lessonActionStatusKey`:
 * é o que permite prová-la em node:test sem jsdom.
 */
export interface ChallengeBadgeInput {
  /** `chat.theoryDone` — a apresentação da teoria acabou. */
  theoryDone: boolean;
  /** `quizPendingAll.length` — quizzes VISÍVEIS ainda sem acerto. */
  pendingQuizCount: number;
  /** Os desafios da aula, como o payload `track.lesson` os traz. */
  challenges: ReadonlyArray<{ lastVerdict: TrackChallengeSummaryDto['lastVerdict'] }>;
}

export function challengeBadgeCount(input: ChallengeBadgeInput): number {
  // O desafio não liberou: o pin não anuncia o que ainda não existe.
  if (!input.theoryDone || input.pendingQuizCount > 0) return 0;
  // Liberou: aí sim, MESMO critério de sempre (null = nunca tentado,
  // failed/timeout/abandoned = não passou).
  return input.challenges.filter((ch) => ch.lastVerdict !== 'passed').length;
}

export function nextClickAction(step: LessonActionStep): 'revelar' | 'avancar' | 'nada' {
  if (step === 'revelar') return 'revelar';
  if (step === 'proximo') return 'avancar';
  return 'nada';
}

/**
 * A frase `role="status"` de cada passo (chave i18n) — ou null quando não há
 * nada a explicar (o botão está vivo e o nome dele já diz tudo).
 *
 * `quizCardOnScreen` separa os dois estados do gate do quiz: com o card na
 * tela a frase PEDE a resposta; sem ele (a bolha terminou mas o card ainda não
 * entrou em cena) ela explica que o quiz aparece na conversa — a distinção que
 * a onda 13 mediu e consertou, preservada aqui.
 */
export function lessonActionStatusKey(
  step: LessonActionStep,
  quizCardOnScreen: boolean,
): string | null {
  switch (step) {
    case 'revelar':
      return 'lesson.revealGateTyping';
    case 'quiz-secao':
      return quizCardOnScreen ? 'lesson.quizGateNext' : 'lesson.quizGateTyping';
    case 'quiz-aula':
      return 'lesson.quizGateFinish';
    case 'desafio':
      return 'lesson.challengeGateFinish';
    default:
      return null;
  }
}

export interface LessonActionRowProps {
  step: LessonActionStep;
  /** turno em voo (IPC) — trava qualquer disparo. */
  busy: boolean;
  /** geração de desafio GLOBAL em voo (trava só o "gerar novo"). */
  generateRunning: boolean;
  /** o card do quiz já está em cena? (escolhe a frase do gate da seção) */
  quizCardOnScreen: boolean;
  /** quizzes já visíveis ainda sem acerto (interpola a frase da conclusão). */
  pendingQuizCount: number;
  /** desafios que não passaram (nome acessível do CTA de desafio). */
  pendingChallengeCount: number;
  /** o clique no botão de avanço. QUEM decide o que ele faz é
   *  `nextClickAction` (puro), na view: no passo 'revelar' este mesmo clique
   *  COMPLETA a digitação em vez de avançar. Uma decisão só, num lugar só. */
  onNext: () => void;
  /** conclui a aula (destrava a próxima). */
  onFinish: () => void;
  /** MESMO destino do botão do cabeçalho: recebe o próprio botão como âncora
   *  do popover (com um desafio só, a view vai direto para ele). */
  onChallenge: (anchor: HTMLButtonElement) => void;
  onNextLesson: () => void;
  onRegenerate: () => void;
}

/**
 * A LINHA DE AÇÃO — anúncio centralizado + o botão do passo atual.
 *
 * Componente de APRESENTAÇÃO exportado DE PROPÓSITO, pelo mesmo motivo do
 * `LessonComposer`: sem jsdom nesta base, um pedaço de tela só é testável se
 * puder ser montado sozinho. É ele que tests/lessonActionRow.test.ts renderiza
 * com o tema e o i18n REAIS para medir nome acessível, estado desabilitado,
 * alvo de toque e a frase role="status" de cada passo. A view usa ESTE
 * componente — não existe cópia para teste.
 */
export function LessonActionRow(props: LessonActionRowProps): ReactElement {
  const { t } = useTranslation();
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  const { step, busy } = props;
  const statusKey = lessonActionStatusKey(step, props.quizCardOnScreen);
  const showNext = step === 'revelar' || step === 'quiz-secao' || step === 'proximo';
  const showFinish = step === 'quiz-aula' || step === 'desafio' || step === 'concluir';
  const finishBlocked = step === 'quiz-aula' || step === 'desafio';

  return (
    <Stack useFlexGap spacing={1} sx={{ alignItems: 'center' }}>
      {/* ONDA 13 (intacta) — A MENSAGEM DIZ A VERDADE DO MOMENTO. O gate
          (`pendingQuizzesForCurrentSection`) conta o quiz assim que a seção
          entra em `presentedSections`, sem olhar `streamingIds`; o CARD, por
          decisão deliberada, só nasce quando a bolha TERMINA de ser escrita —
          um quiz nunca interrompe a leitura da seção que o demonstra. A frase
          acompanha esses estados em vez de pedir uma resposta impossível, e
          `aria-live="polite"` faz a troca ser ANUNCIADA: quem usa leitor de
          tela acompanha a mudança em vez de ouvir uma instrução que não pode
          cumprir. ONDA14: 'revelar' e 'desafio' entraram na mesma tabela
          (`lessonActionStatusKey`) — nenhum passo bloqueado fica mudo. */}
      {statusKey !== null ? (
        <Typography
          role="status"
          aria-live="polite"
          variant="caption"
          sx={{ color: 'text.secondary', display: 'block', textAlign: 'center' }}
        >
          {tI(statusKey, { n: props.pendingQuizCount, pending: props.pendingChallengeCount })}
        </Typography>
      ) : null}
      <Stack
        direction="row"
        useFlexGap
        spacing={1}
        sx={{ justifyContent: 'center', flexWrap: 'wrap' }}
      >
        {/* ONDA14 — O DESAFIO TAMBÉM EMBAIXO ("o ultimo 'proximo' eh o
            desafio"). Ele é o CTA PRIMÁRIO deste passo: a teoria acabou, os
            quizzes estão acertados, e a única coisa entre o aluno e a
            conclusão é o desafio. Não é um terceiro convite competindo — no
            passo 'desafio' o único botão preenchido da linha é este; o
            "Concluir aula" fica ao lado TRAVADO, dizendo o que ele destrava
            (e é o mesmo elemento que tests/e2e/e2e-lesson.spec.ts mede
            desabilitado, com o tooltip 'Conclua os desafios desta aula
            primeiro' — removê-lo daqui quebraria aquele contrato).
            O DESTINO é o MESMO do botão do cabeçalho: a view decide entre ir
            direto (um desafio só) ou abrir O MESMO popover, ancorado neste
            botão. Nenhum segundo fluxo foi inventado. */}
        {step === 'desafio' ? (
          <motion.span
            whileTap={{ scale: 0.98 }}
            transition={springs.snappy}
            // Casca animada: nunca parada de tab (o porquê está no microfone).
            tabIndex={-1}
            style={{ display: 'inline-block' }}
          >
            <Button
              variant="contained"
              onClick={(e) => props.onChallenge(e.currentTarget)}
              disabled={busy}
              startIcon={<EmojiEventsIcon />}
              aria-haspopup="true"
              /* Nome acessível PRÓPRIO (o do cabeçalho diz "Desafios da aula";
                 este diz o que ESTE clique faz) e que CONTÉM o rótulo visível
                 — SC 2.5.3 Label in Name: quem comanda por voz fala o que lê. */
              aria-label={tI('lesson.challengeStepButtonAria', {
                pending: props.pendingChallengeCount,
              })}
              sx={{ whiteSpace: 'nowrap', minHeight: TOUCH_TARGET_PX, px: 3 }}
            >
              {t('translation:lesson.challengeStepButton')}
            </Button>
          </motion.span>
        ) : null}

        {showNext ? (
          /* ONDA2-CHAT-NINTENDO: press feedback (scale 0.98) no "Próximo".
             ONDA10 (bug 2): o avanço da teoria trava enquanto o quiz da seção
             ATUAL não for acertado. O <span> é obrigatório: Button
             DESABILITADO não dispara os eventos que o Tooltip escuta.
             ONDA14: com a seção AINDA SENDO ESCRITA o botão fica VIVO e o
             clique MOSTRA TUDO (`onReveal`) — nunca avança. */
          <Tooltip
            /* ONDA11-INTEGRAÇÃO — `disableInteractive`: o popper do Tooltip do
               MUI nasce INTERATIVO (captura o ponteiro para o usuário poder
               selecionar o texto da dica) e, nesta posição, ele abre para CIMA
               sobre a última bolha do chat: o e2e mediu o "Responder" do card
               do quiz ficando 13 tentativas sem receber o clique ("subtree
               intercepts pointer events"). Um tooltip é DICA: não pode engolir
               o clique do conteúdo atrás dele. Nada se perde — o motivo do
               bloqueio está escrito, visível e em role="status", logo acima. */
            disableInteractive
            title={
              step === 'quiz-secao'
                ? t('translation:lesson.quizGateNext')
                : step === 'revelar'
                  ? t('translation:lesson.revealTypingTooltip')
                  : ''
            }
          >
            <span>
              <motion.span
                whileTap={{ scale: 0.98 }}
                transition={springs.snappy}
                // Casca animada: nunca parada de tab (o porquê está no microfone).
                tabIndex={-1}
                style={{ display: 'inline-block' }}
              >
                <Button
                  /* ONDA11: com o quiz esperando, o CTA primário é RESPONDER —
                     o "Próximo" recua para secundário em vez de continuar
                     competindo, preenchido e morto, ao lado. */
                  variant={step === 'quiz-secao' ? 'outlined' : 'contained'}
                  onClick={props.onNext}
                  disabled={busy || step === 'quiz-secao'}
                  startIcon={step === 'quiz-secao' ? <LockIcon /> : undefined}
                  sx={{ whiteSpace: 'nowrap', minHeight: TOUCH_TARGET_PX, px: 3 }}
                >
                  {t('translation:lesson.nextButton')}
                </Button>
              </motion.span>
            </span>
          </Tooltip>
        ) : null}

        {showFinish ? (
          <Tooltip
            /* `disableInteractive` pelo mesmo motivo do tooltip do "Próximo". */
            disableInteractive
            /* ONDA10: o motivo do bloqueio vem de `lessonFinishBlock` — 'quiz'
               (responda os quizzes) tem PRECEDÊNCIA sobre 'challenges' porque
               o desbloqueio é mais barato: o card está na tela, a um clique. */
            title={
              step === 'quiz-aula'
                ? tI('lesson.quizGateFinish', { n: props.pendingQuizCount })
                : step === 'desafio'
                  ? t('translation:lesson.finishBlockedTooltip')
                  : ''
            }
          >
            <span>
              {/* ONDA2-CHAT-NINTENDO: mesmo press feedback no "Concluir aula". */}
              <motion.span
                whileTap={{ scale: 0.98 }}
                transition={springs.snappy}
                // Casca animada: nunca parada de tab (o porquê está no microfone).
                tabIndex={-1}
                style={{ display: 'inline-block' }}
              >
                <Button
                  variant={finishBlocked ? 'outlined' : 'contained'}
                  onClick={props.onFinish}
                  // ONDA2-IMESSAGE (gating): DESABILITADO com desafio pendente;
                  // ONDA10: quiz sem acerto bloqueia igual — a explicação
                  // visível está acima, porque hover não existe em botão morto.
                  disabled={busy || finishBlocked}
                  startIcon={<LockIcon />}
                  sx={{ whiteSpace: 'nowrap', minHeight: TOUCH_TARGET_PX, px: 3 }}
                >
                  {t('translation:lesson.finishButton')}
                </Button>
              </motion.span>
            </span>
          </Tooltip>
        ) : null}

        {step === 'proxima-aula' ? (
          /* ONDA4 (pós-conclusão — pedido do dono: "ao terminar o usuário pode
             avançar para a próxima aula ou gerar um novo desafio"): no lugar
             do "Concluída ✓" desabilitado, DOIS botões — avançar (nextLesson
             do payload; sem nextLesson → roadmap, a trilha reflete a
             conclusão) e gerar novo desafio (fluxo GLOBAL
             challengeGenerateStore + IPC — o MESMO da bolha de erro). */
          <>
            <motion.span
              whileTap={{ scale: 0.98 }}
              transition={springs.snappy}
              // Casca animada: nunca parada de tab (o porquê está no microfone).
              tabIndex={-1}
              style={{ display: 'inline-block' }}
            >
              <Button
                variant="contained"
                onClick={props.onNextLesson}
                startIcon={<ArrowForwardIcon />}
                sx={{ whiteSpace: 'nowrap', minHeight: TOUCH_TARGET_PX, px: 3 }}
              >
                {t('translation:lesson.nextLessonButton')}
              </Button>
            </motion.span>
            <motion.span
              whileTap={{ scale: 0.98 }}
              transition={springs.snappy}
              // Casca animada: nunca parada de tab (o porquê está no microfone).
              tabIndex={-1}
              style={{ display: 'inline-block' }}
            >
              <Button
                variant="outlined"
                onClick={props.onRegenerate}
                disabled={busy || props.generateRunning}
                sx={{ whiteSpace: 'nowrap', minHeight: TOUCH_TARGET_PX, px: 3 }}
              >
                {t('translation:lesson.generateNewChallenge')}
              </Button>
            </motion.span>
          </>
        ) : null}
      </Stack>
    </Stack>
  );
}

/**
 * ONDA2-QUIZ-OVERLAY: um quiz RENDERIZÁVEL — a assertion AUTORAL (a que ancora
 * a chave e a seção), o que `visibleQuizFor` devolve para ela (chave canônica,
 * assertion da geração corrente, estado e passo do ciclo) e o índice da bolha
 * do histórico onde ele mora. É o objeto que circula entre a lista, o overlay
 * e o card da conversa — para que nenhum dos três recalcule nada.
 */
interface QuizCardEntry {
  original: TrackAssertionDto;
  visible: VisibleQuiz;
  anchorIndex: number;
}

/** Chave i18n do aviso de canal (fail-closed) por tipo de falha. */
const QUIZ_NOTICE_KEY = {
  'explicacao-indisponivel': 'lesson.quizExplainUnavailable',
  'quiz-indisponivel': 'lesson.quizRemedialUnavailable',
  'registro-nao-gravado': 'lesson.quizAttemptNotSaved',
  // ONDA3-PERSISTENCIA: o histórico do banco não pôde ser lido. A aula ABRE
  // assim mesmo, sem histórico (o comportamento anterior a esta onda) — o que
  // NUNCA acontece é inventar maestria que o aluno não conquistou.
  'historico-indisponivel': 'lesson.quizHistoryUnavailable',
} as const;

type QuizNoticeKind = keyof typeof QUIZ_NOTICE_KEY;

/**
 * ONDA3-PERSISTENCIA: etiqueta do aviso do HISTÓRICO. Ele não pertence a
 * nenhuma volta do ciclo — `quizCycleTag` sempre produz `<chave>#<geração>`,
 * então esta etiqueta jamais casa com a do card em cena e o aviso aparece na
 * faixa própria do chat, que é o certo: a falha é da AULA inteira, não de um
 * quiz.
 */
const QUIZ_HISTORY_NOTICE_TAG = 'historico-da-aula';

/**
 * ONDA16-VEREDITO (o dono: "quando respondo um quiz quero antes dele sumir ver
 * se acertei ou errei e efeito"): a JANELA DO VEREDITO, em ms. Respondida uma
 * alternativa, o card SOBRE A TELA fica aberto mostrando o veredito (verde/
 * vermelho + feedback do LessonQuizCard) por ESTE tempo ANTES de minimizar.
 * 1600ms é a leitura de um veredito de uma linha — perceptível, sem virar
 * espera. Esc/minimizar continuam funcionando DURANTE a janela: quem quiser
 * sair antes, sai; quem não fizer nada, lê o resultado.
 */
export const QUIZ_VERDICT_MS = 1600;

/**
 * ONDA15 — AS DUAS PORTAS DO AUTO-SCROLL, e por que elas não têm guarda.
 *
 * ─── O PEDIDO, AO PÉ DA LETRA ─────────────────────────────────────────────
 * "durante a aula quero auto scroll do conteúdo sempre pro final da tela".
 *
 * ─── A DECISÃO QUE ISSO REVOGA ────────────────────────────────────────────
 * A ONDA2-CHAT-NINTENDO havia decidido o contrário: o painel só era puxado
 * para o fim quando o usuário ESTAVA no fim (a menos de `NEAR_BOTTOM_PX` da
 * borda), e quem tivesse rolado para cima para reler ficava onde estava —
 * "NADA o puxa de volta". Essa decisão está REVOGADA pelo dono. O guard de
 * posição morreu inteiro (`NEAR_BOTTOM_PX` e `isNearBottom` não existem mais):
 * nenhuma destas funções lê `scrollTop` ou `clientHeight`, então não há mais
 * posição de onde "estar longe do fim" possa impedir o puxão. O estado
 * esperado durante a aula passou a ser: o painel está SEMPRE no fim.
 *
 * ─── QUEM DISPARA (e quem NÃO dispara) ────────────────────────────────────
 * O gatilho é CONTEÚDO NOVO: o step da digitação (`onStreamTick` → o tick) e a
 * mudança de histórico/digitação (o nudge). Não existe listener de `scroll`
 * nesta view de propósito: um listener reagiria à ROLAGEM do aluno e brigaria
 * com ele a cada evento — o que o dono pediu é o painel acompanhando o fim,
 * não uma disputa com quem está lendo.
 *
 * ─── AS DUAS FÍSICAS, INALTERADAS (só o guard saiu) ───────────────────────
 *   instantâneo (`pinLogToBottom`) — o tick do typewriter, um por step: a
 *     ~2.5ms por step a 100 tps o `smooth` não completaria entre dois steps e
 *     o streaming "pularia" na tela;
 *   suave (`nudgeLogToBottom`) — o nudge de fim (mensagem nova entra, a
 *     digitação começa ou termina).
 *
 * Exportadas para serem provadas com um elemento FAKE — objeto com
 * `scrollTop`/`scrollHeight`, sem DOM nenhum — em tests/
 * lessonAutoScroll.test.ts: o alvo é o fim MESMO com o aluno rolado para cima
 * e longe dele, e é isso que a asserção MORDER.
 */
export function pinLogToBottom(el: Pick<HTMLElement, 'scrollTop' | 'scrollHeight'>): void {
  el.scrollTop = el.scrollHeight;
}

/** O irmão suave — ver o bloco acima: fim SEMPRE, com `behavior: 'smooth'`. */
export function nudgeLogToBottom(el: Pick<HTMLElement, 'scrollHeight' | 'scrollTo'>): void {
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

export function LessonView(props: ViewProps): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  // Ref de tradução SEMPRE atualizado: `t` (e `tI`) muda de identidade em
  // `changeLanguage` (react-i18next v16) — um callback com deps [tI] seria
  // re-criado a cada troca de idioma e re-executaria o efeito de montagem.
  const tIRef = useRef(tI);
  tIRef.current = tI;
  const navigate = props.onNavigate ?? (() => {});
  const { publishSession } = useSessionState();
  const nav = useChallengeNav();

  // ONDA3 (generate-flow): estado GLOBAL do processo de regeneração — a view
  // lê para GATEAR o botão da bolha (uma geração em voo desabilita o disparo
  // mesmo após remontar a view no meio do processo).
  const theme = useTheme();
  const generateState = useSyncExternalStore(subscribeChallengeGenerate, peekChallengeGenerate);
  // ONDA2-QUIZ-OVERLAY: a FASE do overlay do quiz. Módulo (não useState): o
  // shell monta só a view ativa, e um quiz minimizado precisa sobreviver à
  // troca de aba. A view LÊ para decidir o que desenhar na conversa; quem
  // TRANSICIONA são as funções nomeadas do store.
  const quizOverlay = useSyncExternalStore(subscribeQuizOverlay, peekQuizOverlay);
  const generateRunning = generateState.status === 'running';
  // ONDA3 (revisão MÉDIO-2): token de invalidação da LISTA — incrementa quando
  // uma geração conclui (done no store); a view re-busca a aula (a lista traz
  // o novo no TOPO — pedido C) mesmo se o usuário fechar o modal com X sem
  // navegar. O ref do último token visto evita re-busca no mount (o token
  // inicial é o baseline); o refetch é BEST-EFFORT: falha mantém a lista atual
  // (não derruba o chat em andamento — sem spinner, o payload só é trocado
  // quando chega).
  const listVersion = generateState.listVersion;
  const seenListVersionRef = useRef(listVersion);
  useEffect(() => {
    if (listVersion === seenListVersionRef.current) return;
    seenListVersionRef.current = listVersion;
    const key = trackLessonRef.current;
    if (!key || mountedRef.current === false) return;
    withTimeout(
      getApi().track.lesson({ trackSlug: key.trackSlug, lessonId: key.lessonId }),
      IPC_TIMEOUT_MS,
      'track.lesson',
    )
      .then((res) => {
        if (mountedRef.current === false) return;
        if (res.ok === true && res.lesson) setLesson(res.lesson);
      })
      .catch(() => {
        // refetch silencioso: a lista atual continua válida
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listVersion]);

  // ONDA3 (generate-flow, D): guard de montagem — o processo pode TERMINAR
  // depois que a view desmontou (troca de aba durante a geração): nenhum
  // setState/navegação pós-await com a view desmontada (o desfecho do modal
  // global vem dos eventos do main — o store é quem conclui).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Aula de trilha selecionada (Trilha → Aula). null = nenhuma (estado vazio).
  const [trackLesson, setTrackLesson] = useState<{ trackSlug: string; lessonId: string } | null>(null);
  const [lesson, setLesson] = useState<TrackLessonPayload | null>(null);
  const [chat, setChat] = useState<TrackLessonUiState>(createTrackLessonState);
  const [busy, setBusy] = useState(false);
  // ONDA 1 (teoria-pronta): a ação em voo — 'next' é DETERMINÍSTICO (instantâneo,
  // sem LLM) e NUNCA mostra "digitando…"; o indicador só aparece em 'answer'
  // (dúvida do aluno, que chama a LLM e pode demorar).
  const [pendingAction, setPendingAction] = useState<'next' | 'answer' | null>(null);
  const [draft, setDraft] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // ONDA1-UX (pedido do dono — "não quero aqueles desafios ali"): a lista de
  // desafios saiu do fluxo do chat; o botão "Desafios" do cabeçalho da aula
  // abre um POPOVER ancorado no próprio botão (`challengesAnchorEl`). Fecha ao
  // clicar fora/Esc (padrão MUI). ONDA-AULA-NO-SIDEBAR: esse botão mora no
  // SIDEBAR do shell (LessonSidebarHeader, publicado por portal) e continua
  // sendo âncora válida — o Popover posiciona pelo `getBoundingClientRect` do
  // elemento, onde quer que ele esteja no DOM.
  const [challengesAnchorEl, setChallengesAnchorEl] = useState<HTMLButtonElement | null>(null);
  // ONDA14: DE ONDE o popover foi aberto — cada disparador pede uma direção de
  // crescimento. O botão do CABEÇALHO vive no alto da coluna ESQUERDA do shell
  // (o sidebar, desde a ONDA-AULA-NO-SIDEBAR): a lista cresce para a DIREITA,
  // sobre o main — para a esquerda, como quando o botão morava no canto
  // direito da coluna da aula, ela cairia sobre o rail e o próprio sidebar. O
  // botão da LINHA DE AÇÃO vive no rodapé, e ali a lista crescendo para baixo
  // nasceria fora da janela (o MUI a grudaria de volta POR CIMA do botão que a
  // abriu): ela abre para CIMA. Mesma lista, mesmo destino — só a direção muda.
  const [challengesFrom, setChallengesFrom] = useState<'cabecalho' | 'acao'>('cabecalho');
  const challengesOpen = Boolean(challengesAnchorEl);
  const [doneMarked, setDoneMarked] = useState(false);
  /**
   * ONDA2-QUIZ-OVERLAY — o aviso de CANAL do ciclo do quiz (fail-closed).
   *
   * Ele é do CANAL, nunca do ciclo: a máquina pura (`trackLessonState`) não
   * pode ficar sabendo de rede, então quando `track.quizExplain`/
   * `track.quizRemedial`/`track.quizAttempt` devolvem `{ok:false}` — ou nem
   * chegam a responder — o estágio do ciclo continua exatamente onde estava e
   * é AQUI que a tela guarda o que dizer. A `tag` (`quizCycleTag`) amarra o
   * aviso à volta do ciclo que o produziu: uma geração nova o torna obsoleto
   * sozinha, sem limpeza manual.
   */
  const [quizNotice, setQuizNotice] = useState<{ tag: string; kind: QuizNoticeKind } | null>(null);

  /**
   * ONDA16-VEREDITO: a JANELA DO VEREDITO. Enquanto não-null, o overlay fica
   * CONGELADO no card RESPONDIDO — o estado `answered` do LessonQuizCard
   * desenha o verde/vermelho + feedback — e o efeito de fase não aplica passo
   * nenhum (`applyQuizOverlayStep` desceria o card na hora). O minimize
   * acontece quando o timer da janela dispara (ou no cleanup de unmount).
   *
   * Estado (e não ref) porque a FASE e a PUBLICAÇÃO de conteúdo são efeitos:
   * quando a janela termina, os dois efeitos PRECISAM re-executar para
   * retomar o desenho normal — um ref não dispararia nada.
   */
  const [verdictHold, setVerdictHold] = useState<{ key: string; card: QuizCardEntry } | null>(null);
  // Espelho em ref do hold: lido pelo cleanup de unmount e por
  // `handleQuizReopen` (deps [] — padrão tIRef/chatRef/activeRef da view).
  const verdictHoldRef = useRef(verdictHold);
  verdictHoldRef.current = verdictHold;
  // O timer da janela. UM só: responder outro quiz durante a janela cancela o
  // anterior (o gesto mais recente vence); o cleanup de unmount o drena.
  const verdictTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── ONDA2-IMESSAGE: streaming (efeito "digitação" ~100 tokens/s) ─────────
  // O streaming é SÓ EXIBIÇÃO: o histórico guarda o texto COMPLETO (o modelo
  // da Onda 1 é o contrato) e o TypewriterText corta visualmente. Só digitam
  // as mensagens NOVAS desta sessão — `newMessageIndicesRef` marca (por
  // índice no histórico) o que entrou DEPOIS da montagem/restauração: o par
  // do seed NOVO (review + pergunta — reconhecido pelo ts do seed, pois o
  // seedChallengeError recebe `now` injetado) e as respostas de 'next'/
  // 'answer'. Mensagens RESTAURADAS do cache (ou de seed antigo) NÃO são
  // marcadas → renderizam completas e instantâneas.
  const newMessageIndicesRef = useRef<Set<number>>(new Set());
  const markNew = useCallback((i: number): void => {
    newMessageIndicesRef.current.add(i);
  }, []);
  // Índices das mensagens ATUALMENTE digitando (estado — vira o indicador
  // "digitando" e o gating do "Gerar novo desafio" da review).
  const [streamingIds, setStreamingIds] = useState<ReadonlySet<number>>(() => new Set());
  const handleStreamStart = useCallback((i: number): void => {
    setStreamingIds((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }, []);
  const handleStreamDone = useCallback((i: number): void => {
    setStreamingIds((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }, []);
  // FIX (HIGH, revisor adversarial): PODA de streamingIds contra o histórico —
  // um id ÓRFÃO nasce quando uma bolha digitando é DESMONTADA sem onDone:
  // o cleanup do TypewriterText limpa o timer SEM chamar onDone, e o
  // openPrerequisite (chip de pré-requisito — sempre habilitado, o busy não
  // trava) SUBSTITUI o histórico no MEIO da digitação (createTrackLessonState
  // → chat novo). Sem esta poda, o id morto ficaria no Set e `streamingIds.size
  // > 0` renderizaria "tutor digitando…" PARA SEMPRE após a 1ª mensagem da
  // nova aula. Os ids SÃO índices do histórico: histórico trocado/encolhido →
  // ids fora de alcance → podados aqui. Fluxo normal intacto: o append só
  // CRESCE o length — ids < length continuam válidos (e o efeito devolve
  // `prev` sem re-render quando nada mudou).
  useEffect(() => {
    setStreamingIds((prev) => {
      const valid = new Set([...prev].filter((id) => id < chat.history.length));
      return valid.size === prev.size ? prev : valid;
    });
  }, [chat.history.length]);

  // ─── ONDA10 (bug 3, parte 2): PULAR a digitação ───────────────────────────
  // Com a teoria em velocidade de LEITURA (7 tps), quem lê rápido não pode
  // ficar esperando: um CLIQUE no painel, QUALQUER tecla ou o botão "Mostrar
  // tudo" completam as bolhas que estão digitando AGORA.
  //
  // O pedido é guardado como o TAMANHO do histórico no momento do pedido, e
  // não como um booleano: assim ele EXPIRA sozinho, no RENDER, quando uma
  // mensagem nova entra (`skipAtLen !== history.length`). Um booleano com
  // reset por efeito não serviria — os efeitos do FILHO (TypewriterText)
  // rodam ANTES dos do pai, então a bolha nova nasceria já pulada.
  const [skipAtLen, setSkipAtLen] = useState<number | null>(null);
  const skipTyping = skipAtLen !== null && skipAtLen === chat.history.length;
  const requestSkipTyping = useCallback((): void => {
    setSkipAtLen(chat.history.length);
  }, [chat.history.length]);
  // Tecla: só escuta ENQUANTO alguma bolha digita (nenhum listener global
  // pendurado no resto do tempo) e em CAPTURE, para valer mesmo com o foco no
  // campo de pergunta — quem já está fazendo outra coisa não deve esperar a
  // animação. `keydown` cobre teclado; o clique vem do onClick do painel.
  const typingNow = streamingIds.size > 0;
  /**
   * ONDA14: uma SEÇÃO DE TEORIA está sendo escrita agora?
   *
   * `typingNow` (qualquer bolha) é largo demais para decidir o passo da linha
   * de ação: a EXPLICAÇÃO do ciclo de remediação também digita na velocidade
   * de leitura ('quiz-explanation', `chatBubbleTps`), e durante ela o quiz
   * continua aberto esperando a resposta — um "Próximo" vivo ali diria ao
   * aluno que há para onde ir. `isTheoryPresentationBubble` é o MESMO critério
   * que escolhe a velocidade da digitação, então "o que o aluno está lendo
   * devagar por ser teoria" e "o que o clique revela" são a mesma coisa.
   */
  const typingTheory = useMemo(
    () => [...streamingIds].some((i) => isTheoryPresentationBubble(chat.history, i)),
    [streamingIds, chat.history],
  );
  useEffect(() => {
    if (!typingNow) return;
    const onKey = (): void => requestSkipTyping();
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [typingNow, requestSkipTyping]);

  // Região com scroll do chat (a Box com overflowY do render).
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  // ONDA15 (auto-scroll SEMPRE — pedido do dono: "durante a aula quero auto
  // scroll do conteúdo sempre pro final da tela"): o guard de posição da
  // ONDA2-CHAT-NINTENDO ("só puxa se o usuário está no fim; se ele rolou para
  // cima para reler, NADA o puxa de volta") está REVOGADO. O tick abaixo não
  // consulta posição nenhuma — detalhe e porquê em `pinLogToBottom`/
  // `nudgeLogToBottom` (módulo, exportadas para teste).
  //
  // Auto-scroll DURANTE a digitação: a cada step do typewriter
  // (onStreamTick) o painel acompanha o fim, SEMPRE. A física não mudou: o
  // tick usa scroll INSTANTÂNEO (scrollTop = scrollHeight), NUNCA smooth — a
  // ~2.5ms por step a 100 tps o smooth não completaria e o streaming
  // "pularia" (o tick é o que mantém a digitação visível).
  const handleStreamTick = useCallback((): void => {
    const el = logScrollRef.current;
    if (el) pinLogToBottom(el);
  }, []);
  // Nudge de fim: quando o conjunto de mensagens digitando muda (início/fim)
  // ou o histórico cresce (mensagem nova entra), leva o fim à vista com
  // SMOOTH — SEMPRE, sem consultar posição (ONDA15). O antigo `fresh`
  // (scrollTop 0 + histórico presente, o caso "abrir a aula no topo") morreu
  // junto com o guard: ele só existia para furar a condição que não existe
  // mais.
  //
  // ONDA2-AULA-ABRE-NO-FIM — o caso de MONTAGEM que o puxão incondicional
  // sozinho NÃO cobria (defeito medido pela revisão adversarial). Abrir uma
  // aula cujo chat foi RESTAURADO do cache de sessão caía no TOPO: a view
  // remonta com histórico (`chat.history.length > 0`) e `lesson` ainda `null`,
  // e o early-return de loading (if (!lesson)) NÃO monta a Box do log — a
  // primeira passada deste efeito roda com `logScrollRef.current === null` e
  // sai pelo `if (!el) return`. Quando o payload chega (`setLesson`, dentro de
  // `loadLesson`), a Box MONTA com `scrollTop = 0`; este efeito NÃO
  // re-executava, porque as deps eram só `[chat.history.length, streamingIds]`
  // e nenhuma das duas muda nesse commit (quem muda é `lesson`) — o `fresh`
  // que existia para esse caso já tinha morrido junto com o guard. A
  // IDENTIDADE DA AULA entra nas deps para o nudge rodar quando o container do
  // log MONTA (aula carregada, inclusive A → B); o gatilho segue sendo
  // CONTEÚDO NOVO + montagem, nunca rolagem do aluno.
  //
  // A dep é `lesson?.slug`, não o objeto `lesson`: o objeto troca de
  // identidade a CADA `setLesson` — inclusive no refetch silencioso da MESMA
  // aula (`listVersion`, quando uma geração conclui), que não monta nem mexe
  // no log; com o objeto, o gatilho viraria "qualquer aplicação de payload",
  // mais largo que o fato que importa. O slug muda exatamente quando a Box
  // (re)monta: `undefined` (aula fora da tela: null, loading, erro, vazio) →
  // `<slug>` (aula na tela), e A → B na troca de aula.
  useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    nudgeLogToBottom(el);
  }, [chat.history.length, streamingIds, lesson?.slug]);

  // ONDA2-IMESSAGE (gating do "Concluir aula"): bloqueado quando há desafios
  // E algum NÃO passou (lastVerdict !== 'passed' — null = nunca tentado). O
  // payload track.lesson é RE-BUSCADO na abertura da aula — um desafio
  // passado na ChallengeView reflete aqui na volta. Sem desafios → liberado.
  // Guard de null ANTES do lesson carregar (os early returns de loading/erro
  // usam o estado abaixo sem renderizar o botão).
  //
  // ONDA10 (bug 2 — "o quiz pode ser ignorado; quero que o usuario tenha que
  // responder"): o QUIZ entrou no gate. Duas travas, ambas por `answered`
  // (NUNCA por `correct` — errar não trava o aluno):
  //   - `quizPendingAll`  → "Concluir aula": todo quiz já VISÍVEL respondido;
  //   - `quizPendingHere` → "Próximo": o quiz da seção ATUAL respondido.
  // A decisão de travar TAMBÉM o "Próximo" (mais intrusivo) é deliberada: sem
  // ela o aluno atropela o "Próximo" até o fim e encontra uma PILHA de quizzes
  // na linha de chegada — o quiz deixaria de ser formativo (respondido fora do
  // contexto da seção) e viraria pedágio. Travando por seção, o desbloqueio
  // está SEMPRE a um clique de distância, com a teoria fresca na tela.
  const lessonAssertions = useMemo(() => lesson?.assertions ?? [], [lesson]);
  const quizPendingAll = useMemo(
    () => pendingQuizzes(chat, lessonAssertions),
    [chat, lessonAssertions],
  );
  const quizPendingHere = useMemo(
    () => pendingQuizzesForCurrentSection(chat, lessonAssertions),
    [chat, lessonAssertions],
  );
  const nextBlockedByQuiz = quizPendingHere.length > 0;
  // Motivo do bloqueio do "Concluir aula" ('quiz' | 'challenges' | null) — a
  // UI DIZ qual é (nada de botão morto e mudo).
  const finishBlock = lesson ? lessonFinishBlock(lesson.challenges, quizPendingAll.length) : null;
  const finishBlocked = finishBlock !== null;

  // ONDA2 (error-flow, A5): mic no input do chat — o aluno pode responder à
  // pergunta do erro por VOZ (ou tirar qualquer dúvida falando). DECISÃO:
  // useMicSTT DIRETO (hook NÃO modificado — ele já expõe transcribing/
  // partial/error/start/stop/cancel), montado num IconButton MUI no start
  // adornment do TextField (o end já tem o Send). A transcrição FINAL
  // preenche o draft — NUNCA envia automático. As strings de erro do hook
  // são as dele (pt-BR fixo — fora de escopo alterá-las).
  const mic = useMicSTT(i18n.language?.startsWith('en') ? 'en' : 'pt-BR');
  const handleMicToggle = useCallback(async (): Promise<void> => {
    if (mic.transcribing) {
      const text = await mic.stop();
      if (text.trim()) {
        setDraft((prev) => (prev.trim() ? `${prev} ${text}` : text));
      }
    } else {
      await mic.start();
    }
  }, [mic.transcribing, mic.start, mic.stop]);

  /**
   * ONDA3-PERSISTENCIA: a aula que o ÚLTIMO `loadLesson` pediu. Escrito de
   * forma SÍNCRONA no começo de cada carregamento e lido quando o histórico
   * volta, ele responde a uma pergunta só: "o histórico que chegou ainda é o
   * da aula que está sendo carregada?". O caminho que torna a pergunta real é
   * o chip de PRÉ-REQUISITO — ele troca de aula sem cancelar o carregamento
   * anterior (`openPrerequisite` descarta o cancelador), e sem esta guarda o
   * histórico da aula ANTIGA poderia hidratar o chat da aula NOVA. Um ref, e
   * não estado, porque nada nesta comparação re-renderiza.
   */
  const loadTargetRef = useRef<{ trackSlug: string; lessonId: string } | null>(null);

  /** Carrega uma aula da trilha via IPC — SEMPRE com timeout: se o canal não
   * responder em `IPC_TIMEOUT_MS`, cai no loadError com mensagem própria
   * (nenhum spinner eterno) e o usuário tem o botão de tentar de novo.
   *
   * ONDA3-PERSISTENCIA: carregar a aula passou a ser DUAS leituras — o
   * conteúdo (`track.lesson`) e o HISTÓRICO do quiz (`track.quizHistory`), que
   * é o que faz a maestria sobreviver ao FECHAMENTO do app. O cache de sessão
   * já a fazia sobreviver à troca de aba; ele morre com o processo, e o aluno
   * que dominou três quizzes voltava e encontrava tudo por responder. As duas
   * leituras são independentes e falham independentemente: sem histórico a
   * aula ABRE (com aviso), porque travar o aluno seria pior que perder a
   * memória de uma sessão.
   *
   * Deps [] de propósito (não [tI]): `loadLesson` entra nas deps do efeito de
   * montagem; se dependesse de `t`, a troca de idioma (changeLanguage → `t`
   * novo) re-criaria o callback e RE-EXECUTARIA o efeito — com o holder
   * retido, a aula JÁ CARREGADA voltaria a `null` (flash de <LinearProgress/>),
   * com refetch do IPC e reset do status de sessão. O `tIRef` lê a tradução
   * ATUAL sem re-criar o callback: identidade estável, texto sempre novo. */
  const loadLesson = useCallback(
    (trackSlug: string, lessonId: string): (() => void) => {
      let cancelled = false;
      loadTargetRef.current = { trackSlug, lessonId };
      setLesson(null);
      setLoadError(null);
      withTimeout(getApi().track.lesson({ trackSlug, lessonId }), IPC_TIMEOUT_MS, 'track.lesson')
        .then((res) => {
          if (cancelled) return;
          if (res.ok === false) {
            // W3 (falsy-proof): '' é erro VÁLIDO — só null significa "sem erro".
            setLoadError(resolveChannelError(res, tIRef.current('lesson.trackLoadFailed')));
            return;
          }
          if (!res.lesson) {
            setLoadError(tIRef.current('lesson.trackNotFound'));
            return;
          }
          setLesson(res.lesson);
          // ONDA2-PREFETCH: o payload já conhece a próxima aula — aquece o
          // cache do main agora (best-effort, sem await) para o clique em
          // "Avançar" virar cache hit.
          const next = res.lesson?.nextLesson;
          if (next) void prefetchLesson(trackSlug, next.slug);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setLoadError(
            isTimeoutError(err)
              ? tIRef.current('lesson.trackLoadTimeout')
              : tIRef.current('lesson.trackLoadFailed'),
          );
        });
      // ONDA3-PERSISTENCIA: o HISTÓRICO do quiz desta aula, lido AQUI e só
      // aqui. Pedido INDEPENDENTE (não encadeado no track.lesson): o conteúdo
      // da aula e o que o aluno já respondeu não dependem um do outro, e
      // serializá-los só somaria latência ao spinner. A hidratação usa a forma
      // FUNCIONAL do setChat de propósito — ela precisa enxergar o estado
      // MAIS RECENTE, que pode ter acabado de ser restaurado do cache de
      // sessão (o efeito de montagem faz setChat(cached) e chama loadLesson na
      // sequência); é `hydrateQuizFromHistory` quem decide a precedência, e
      // ela é: a sessão vence, o banco só preenche o que falta.
      withTimeout(
        getApi().track.quizHistory({ trackSlug, lessonId }),
        IPC_TIMEOUT_MS,
        'track.quizHistory',
      )
        .then((res) => {
          if (cancelled || mountedRef.current === false) return;
          // Outra aula já entrou (chip de pré-requisito): este histórico é de
          // uma aula que não está mais na tela — nem hidrata, nem avisa.
          const alvo = loadTargetRef.current;
          if (alvo === null || alvo.trackSlug !== trackSlug || alvo.lessonId !== lessonId) return;
          if (res.ok === false) {
            setQuizNotice({ tag: QUIZ_HISTORY_NOTICE_TAG, kind: 'historico-indisponivel' });
            return;
          }
          setChat((st) => hydrateQuizFromHistory(st, res.attempts, res.remediations));
          // O aviso de histórico é do CARREGAMENTO: uma leitura que deu certo
          // aposenta o dele (inclusive o de OUTRA aula, no caminho do chip de
          // pré-requisito), e nunca o do ciclo do quiz, que é de outra falha.
          setQuizNotice((prev) => (prev !== null && prev.kind === 'historico-indisponivel' ? null : prev));
        })
        .catch(() => {
          // FAIL-CLOSED: canal mudo ou estourado é a MESMA coisa que {ok:false}
          // — a aula abre SEM histórico (o comportamento anterior a esta onda).
          // O aluno responde de novo o que já tinha dominado; ele nunca fica
          // preso, e maestria nenhuma é inventada.
          if (cancelled || mountedRef.current === false) return;
          const alvo = loadTargetRef.current;
          if (alvo === null || alvo.trackSlug !== trackSlug || alvo.lessonId !== lessonId) return;
          setQuizNotice({ tag: QUIZ_HISTORY_NOTICE_TAG, kind: 'historico-indisponivel' });
        });
      return () => {
        cancelled = true;
      };
    },
    [],
  );

  // FIX rodada 11 (anti-StrictMode — loading infinito no dev/run.sh): em dev o
  // React roda os efeitos em setup → cleanup → setup (double-invoke). Um drain
  // one-shot dentro do setup seria consumido na passada 1 e a passada 2 veria
  // null — e o cleanup da passada 1 já cancelou o IPC da passada 1 → nenhum
  // load novo, spinner eterno. O holder RETIDO num ref sobrevive entre as
  // passadas do MESMO fiber (refs não são resetados pelo StrictMode), então
  // cada setup re-dispara o load com a mesma pendência.
  const pendingLessonHolderRef = useRef<ReturnType<typeof createTrackLessonPendingHolder> | null>(null);
  if (pendingLessonHolderRef.current === null) {
    pendingLessonHolderRef.current = createTrackLessonPendingHolder();
  }
  const pendingLessonHolder = pendingLessonHolderRef.current;

  // ONDA2 (error-flow): a bolha de erro do desafio que FALHOU é seedada NA
  // MONTAGEM — UMA única vez (guard anti-StrictMode no ref: as passadas do
  // double-invoke do dev compartilham o MESMO fiber e refs sobrevivem, então
  // a 2ª passada NÃO re-semeia). O relatório é lido por REF (não entra nas
  // deps): a identidade do contexto muda quando o report é setado/limpo, e
  // depender dela re-executaria o efeito a cada mudança de navegação.
  const challengeErrorSeededRef = useRef(false);
  // Aula do erro em seed (StrictMode: a 2ª passada encontra o report já
  // drenado — este ref RE-DISPARA o load da MESMA aula que o cleanup da 1ª
  // passada cancelou; o seed NÃO é repetido).
  const challengeErrorLessonRef = useRef<{ trackSlug: string; lessonId: string } | null>(null);
  const navReportRef = useRef(nav.challengeErrorReport);
  navReportRef.current = nav.challengeErrorReport;

  // ONDA3 (chat-cache): refs do estado MAIS RECENTE para o SAVE no unmount —
  // o cleanup do efeito de montagem precisa ler o ÚLTIMO chat/trackLesson sem
  // re-registrar o efeito (mesmo padrão do tIRef/activeRef já usados na view).
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const trackLessonRef = useRef(trackLesson);
  trackLessonRef.current = trackLesson;

  // ONDA3 (chat-cache): holder do drain do cache de chat — criado LAZY no
  // efeito de montagem (a key depende do alvo, conhecido só lá) e RETIDO no
  // ref entre as passadas do double-invoke do dev (mesmo padrão do
  // pendingLessonHolderRef): o take do cache é one-shot e, sem o holder, a 2ª
  // passada veria null e sobrescreveria a restauração da 1ª com chat vazio.
  const cacheHolderRef = useRef<ReturnType<typeof createLessonChatHolder> | null>(null);

  // ONDA3 (chat-cache): SAVE no UNMOUNT — o shell monta SÓ a view ativa; sair
  // da aba Aula (Desafio, Trilha etc.) desmonta a LessonView e zera o estado
  // local. Este cleanup guarda o estado ATUAL do chat no cache de sessão
  // (chaveado trackSlug:lessonId) para a próxima montagem da MESMA aula
  // restaurar histórico/presentedSections (ex.: o chat do fluxo de erro da
  // Onda 2 volta com a teoria em curso, não vazio). Lê por REF o último
  // estado (sem re-registrar o efeito). Skip: sem aula carregada (trackLesson
  // null) ou chat nunca iniciado (nada a restaurar — um cache com estado
  // vazio faria a restauração devolver um chat vazio à toa).
  useEffect(() => {
    return () => {
      const key = trackLessonRef.current;
      if (!key) return;
      const c = chatRef.current;
      if (c.history.length === 0 && c.presentedSections.length === 0) return;
      saveLessonChat({ trackSlug: key.trackSlug, lessonId: key.lessonId }, c);
    };
  }, []);

  // Drena a pendência da trilha NA MONTAGEM (one-shot). Pendências legadas
  // (subject/domain/lessonId) são descartadas — rodada 8: não se gera aula.
  useEffect(() => {
    drainPendingSubject();
    drainPendingDomain();
    drainPendingLessonId();
    // get() retém a pendência entre as passadas do double-invoke — o drain
    // direto aqui veria null na 2ª passada e nenhum load novo seria disparado.
    const pending = pendingLessonHolder.get();
    const report = navReportRef.current;
    // ONDA3 (chat-cache, REPLAN 2): o alvo de restauração — o report do erro
    // DEFINE o alvo; o pending da trilha é o FALLBACK; nunca os dois juntos
    // (report presente → a aula do erro vence). Sem alvo → comportamento
    // atual (estado vazio; nada a restaurar).
    const alvo = report ?? pending ?? null;
    if (alvo) {
      // Drain do cache com holder retido em ref (padrão pendingLessonHolder):
      // o take é one-shot e, sem o holder, a 2ª passada do double-invoke do
      // dev veria null e sobrescreveria a restauração da 1ª passada.
      if (cacheHolderRef.current === null) {
        cacheHolderRef.current = createLessonChatHolder({
          trackSlug: alvo.trackSlug,
          lessonId: alvo.lessonId,
        });
      }
      const cached = cacheHolderRef.current.get();
      if (report) {
        if (!challengeErrorSeededRef.current) {
          // ONDA2 (error-flow): o desafio de AULA falhou e o painel fechou — o
          // chat da aula reabre com a bolha de erro + a pergunta do tutor. O
          // seed NÃO depende do lesson carregado (a bolha é UI
          // determinística); o report traz trackSlug/lessonId do próprio erro.
          // Ordem: setTrackLesson → loadLesson → seedChallengeError →
          // nav.clearChallengeError().
          challengeErrorSeededRef.current = true;
          challengeErrorLessonRef.current = { trackSlug: report.trackSlug, lessonId: report.lessonId };
          setTrackLesson({ trackSlug: report.trackSlug, lessonId: report.lessonId });
          // ONDA1-NAV-UI: a aula do erro também vira a "última aula aberta" —
          // voltar à aba Aula depois (sem report/pendência) a restaura.
          saveLastLesson(report.trackSlug, report.lessonId);
          publishSession({ subject: report.lessonId, status: 'idle' });
          // ONDA3 (chat-cache): o seed é APPEND-ONLY sobre o estado
          // RESTAURADO do cache — a teoria em curso permanece no histórico e
          // as bolhas do erro entram depois (dedupe por challengeId do seed:
          // falha repetida do MESMO desafio não re-semeia). Sem cache, cai no
          // comportamento atual (seed sobre o estado vazio).
          //
          // ONDA2-IMESSAGE (streaming): o seed é computado SINCRONAMENTE (a
          // lib é pura) para MARCAR o par NOVO como digitável — a review
          // seedada DIGITA (pedido explícito do dono) e a pergunta idem. O
          // histórico RESTAURADO do cache NÃO digita (não marcado). O `now`
          // do seed é INJETADO: as duas mensagens do par carregam o seedNow
          // (a review com errorFor + a pergunta 'message'), então são
          // reconhecidas pelo ts — inclusive quando o retry REPÕE o par no
          // MEIO do histórico (índice menor que o do fim do cache).
          const base = cached ?? createTrackLessonState();
          const seedNow = Date.now();
          const seeded = seedChallengeError(
            base,
            report,
            tIRef.current('lesson.errorQuestion'),
            {
              title: tIRef.current('lesson.errorBubbleTitle'),
              partialCount: tIRef.current('challenge.partialCount', {
                passed: report.passedCount,
                total: report.totalCount,
              }),
              // FIX (REPLAN, débito Onda 1): filesTitle faltava — sem ele o
              // default pt-BR ('Código submetido') vazava para o locale en.
              filesTitle: tIRef.current('lesson.errorBubbleFilesTitle'),
              checksTitle: tIRef.current('challenge.checksTitle'),
              outputTitle: tIRef.current('challenge.output'),
            },
            seedNow,
          );
          setChat(seeded);
          for (let i = 0; i < seeded.history.length; i++) {
            if (seeded.history[i].ts === seedNow) markNew(i);
          }
          nav.clearChallengeError();
          return loadLesson(report.trackSlug, report.lessonId);
        }
      } else if (pending) {
        setTrackLesson(pending);
        // ONDA1-NAV-UI: abre uma aula → grava como "última aberta" (a próxima
        // montagem sem alvo a restaura — pedido do dono).
        saveLastLesson(pending.trackSlug, pending.lessonId);
        publishSession({ subject: pending.lessonId, status: 'idle' });
        // ONDA3 (chat-cache): o chat volta EXATAMENTE onde estava — o restore
        // devolve history/presentedSections completos (theoryDone incluso), e
        // o 'next' segue da seção seguinte sem código extra. Sem cache →
        // comportamento atual (chat novo, teoria da seção 1).
        setChat(cached ?? createTrackLessonState());
        return loadLesson(pending.trackSlug, pending.lessonId);
      }
    } else {
      // ONDA1-NAV-UI (3ª precedência): sem report e sem pendência → restaura
      // a ÚLTIMA aula aberta na sessão (peek NÃO é one-shot: no double-invoke
      // do StrictMode cada passada re-restaura a MESMA aula — setTrackLesson
      // idempotente + loadLesson re-disparado, exatamente como o galho do
      // report; o chat vem do cacheHolder retido (padrão anti-StrictMode da
      // casa — o take one-shot não é repetido na 2ª passada)). Nunca abriu
      // aula → estado vazio (comportamento atual).
      const last = peekLastLesson();
      if (last) {
        if (cacheHolderRef.current === null) {
          cacheHolderRef.current = createLessonChatHolder({
            trackSlug: last.trackSlug,
            lessonId: last.lessonId,
          });
        }
        const cached = cacheHolderRef.current.get();
        setTrackLesson({ trackSlug: last.trackSlug, lessonId: last.lessonId });
        // Re-save idempotente: mantém o store consistente (a restauração É
        // uma "abertura" — a próxima montagem restaura a mesma aula).
        saveLastLesson(last.trackSlug, last.lessonId);
        publishSession({ subject: last.lessonId, status: 'idle' });
        setChat(cached ?? createTrackLessonState());
        return loadLesson(last.trackSlug, last.lessonId);
      }
    }
    // StrictMode (dev): a 2ª passada vê o report já drenado — re-dispara o
    // load da aula do erro (o cleanup da 1ª passada cancelou o IPC). Sem
    // isto, o spinner da aula ficaria eterno (bug da rodada 11, mesma forma).
    if (challengeErrorLessonRef.current) {
      const ctx = challengeErrorLessonRef.current;
      return loadLesson(ctx.trackSlug, ctx.lessonId);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLesson, publishSession, markNew]);

  // FIX W1 (onda 4): canais de AÇÃO com withTimeout — se o IPC ficar MUDO
  // (main preso, resposta perdida), o `busy`/`pendingAction` SEMPRE limpam no
  // finally e o usuário vê mensagem clara, em vez de botões desabilitados para
  // sempre. Timeout por ação documentado em ACTION_TIMEOUTS (lib/ipcTimeout):
  // 'next' é determinístico (10s); 'answer' > abort de 45s da LLM no main (70s).
  const sendNext = useCallback(async (): Promise<void> => {
    if (!trackLesson || busy) return;
    // ONDA10 (bug 2): a seção ATUAL tem quiz sem resposta → o avanço da teoria
    // não sai daqui. Defensivo: o botão já vem desabilitado (com a explicação
    // VISÍVEL ao lado), mas um atalho/estado antigo também esbarra no guard.
    if (nextBlockedByQuiz) return;
    setBusy(true);
    setPendingAction('next');
    // ONDA2-IMESSAGE: a resposta do 'next' entra no FIM do histórico — marca
    // o índice ANTES do append para o TypewriterText DIGITAR (se a resposta
    // for vazia — teoria concluída — o índice não existe e o mark é no-op).
    const nextIndex = chat.history.length;
    try {
      const res = await withTimeout(
        getApi().track.tutorChat({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
          presentedSections: chat.presentedSections,
          history: chatHistory(chat),
          action: 'next',
        }),
        ACTION_TIMEOUTS.next,
        'track.tutorChat:next',
      );
      // ONDA2 (error-flow): 'next' LIMPA o contexto de erro — a teoria
      // retoma e a discussão do erro encerra (as bolhas continuam na
      // conversa; só o challengeError deixa de acompanhar os turnos).
      setChat((s) => clearChallengeError(applyTutorReply(s, res)));
      markNew(nextIndex);
    } catch (err) {
      setChat((s) => ({
        ...s,
        lastError: isTimeoutError(err) ? tI('lesson.nextTimeout') : String(err),
      }));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [trackLesson, busy, nextBlockedByQuiz, chat.presentedSections, chat.history, tI, markNew]);

  const sendAnswer = useCallback(async (): Promise<void> => {
    const text = draft.trim();
    if (!trackLesson || !text || busy) return;
    // ONDA2 (error-flow, A5): gravação em andamento + envio → CANCELA o mic
    // (o turno em voo desabilita o botão; sem o cancel, a gravação ficaria
    // presa sem como parar — a transcrição parcial não vira segundo envio).
    if (mic.transcribing) void mic.cancel();
    // ONDA2-IMESSAGE: a pergunta entra no índice `nextIndex` e a resposta do
    // tutor logo em seguida (`nextIndex + 1`) — marca a RESPOSTA para
    // DIGITAR (a pergunta do aluno é instantânea — ele mesmo digitou).
    const nextIndex = chat.history.length;
    setDraft('');
    setChat((s) => pushUserMessage(s, text));
    setBusy(true);
    setPendingAction('answer');
    try {
      const res = await withTimeout(
        getApi().track.tutorChat({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
          presentedSections: chat.presentedSections,
          // chatHistory STRIPA o kind das bolhas (texto puro ao main); o
          // challengeError (se em discussão) acompanha o turno — o main o usa
          // na análise da hipótese do aluno em 'answer'.
          history: [...chatHistory(chat), { role: 'user', content: text }],
          action: 'answer',
          ...(chat.challengeError ? { challengeError: chat.challengeError } : {}),
        }),
        ACTION_TIMEOUTS.answer,
        'track.tutorChat:answer',
      );
      setChat((s) => applyTutorReply(s, res));
      markNew(nextIndex + 1);
    } catch (err) {
      // Timeout → mensagem clara; o "digitando…" (pendingAction) desliga no finally.
      setChat((s) => ({
        ...s,
        lastError: isTimeoutError(err) ? tI('lesson.answerTimeout') : String(err),
      }));
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [trackLesson, draft, busy, chat.presentedSections, chat.history, chat.challengeError, mic.transcribing, mic.cancel, tI, markNew]);

  /** Conclui a aula (destrava a próxima) e publica a sessão. */
  const finishLesson = useCallback(async (): Promise<void> => {
    // ONDA2-IMESSAGE (gating): a aula SÓ termina com todos os desafios
    // concluídos — defensivo (o botão já vem desabilitado, mas o guard
    // também protege um possível disparo por atalho/estado antigo).
    // ONDA10: `finishBlocked` cobre desafios pendentes E quiz sem resposta.
    if (!trackLesson || busy || !chat.theoryDone || doneMarked || finishBlocked) return;
    setBusy(true);
    try {
      // ── A GRAVAÇÃO PRECISA TER DADO CERTO (ONDA 15) ────────────────────
      // O defeito que isto mata é o SINTOMA VERBATIM do dono ("clico e o
      // cadeado não abre"), por uma causa que a onda 14 não tocou: a resposta
      // do canal era DESCARTADA. `withTimeout` é um `Promise.race`, então um
      // `{ ok: false }` RESOLVE — não rejeita, não cai no `catch` — e o código
      // seguia direto para `setDoneMarked(true)`, confete, anúncio "aula
      // concluída" e o botão "Avançar para a próxima aula". A aula NÃO tinha
      // sido gravada, a seguinte continuava trancada, e a tela dizia o
      // contrário em quatro sinais ao mesmo tempo.
      // E `{ ok: false }` não é hipótese: `electron/main/index.ts` deixa
      // `repo` indefinido quando o SQLite não abre, e o handler
      // `track:lesson-done` responde 'persistência indisponível.' — um estado
      // de produção PROJETADO, que a tela tratava como sucesso.
      // Falhar aqui é FAIL-CLOSED de propósito: melhor o aluno ver que não
      // gravou e tentar de novo do que receber confete por um progresso que
      // não existe. O `catch` abaixo já mostra o erro e libera o botão.
      const res = await withTimeout(
        getApi().track.lessonDone({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
        }),
        ACTION_TIMEOUTS.lessonDone,
        'track.lessonDone',
      );
      if (res.ok === false) throw new Error(res.error);
      setDoneMarked(true);
      // ONDA4 (brilho ao concluir — pedido do dono): rajada de confete +
      // anúncio acessível role="status" (a LessonView reusa confetti.ts; o
      // anúncio acontece MESMO com prefers-reduced-motion — o movimento é
      // que é suprimido, nunca a informação).
      fireConfetti();
      announceStatus(tI('lesson.lessonCompleted'));
      publishSession({
        subject: lesson?.title ?? trackLesson.lessonId,
        status: 'done',
        phase: 'concluindo',
        fraction: 1,
      });
    } catch (err) {
      // Timeout do canal MUDO → aviso visível; falha de persistência comum
      // continua silenciosa (o botão permanece disponível — retry honesto).
      if (isTimeoutError(err)) {
        setChat((s) => ({ ...s, lastError: tI('lesson.doneTimeout') }));
      }
    } finally {
      setBusy(false);
    }
  }, [trackLesson, busy, chat.theoryDone, doneMarked, finishBlocked, lesson?.title, publishSession, tI]);

  /** Abre UM desafio da aula na ChallengeView (fluxo track). */
  const openChallenge = useCallback(
    (ch: TrackChallengeSummaryDto): void => {
      if (!trackLesson) return;
      // ONDA 15: a MESMA regra da linha de ação de baixo, aplicada à rota do
      // cabeçalho (ver `challengeOpenBlockedByQuiz`). Sem isto o popover era
      // um atalho que pulava a prova de entendimento.
      if (challengeOpenBlockedByQuiz(finishBlock)) return;
      nav.selectTrackChallenge({
        trackSlug: trackLesson.trackSlug,
        target: 'lesson',
        lessonId: trackLesson.lessonId,
        challengeId: ch.slug,
        title: ch.title,
      });
      nav.navigateToChallenge();
    },
    [trackLesson, nav, finishBlock],
  );

  /** ONDA2 (error-flow, A4): "Gerar novo desafio" NA BOLHA de erro — a LLM vê
   *  os desafios que o aluno errou nesta aula (nunca-repetir da rodada 8
   *  preservado).
   *
   *  ONDA3 (generate-flow): o processo agora é GLOBAL — dispara via
   *  challengeGenerateStore + o IPC; o modal de etapas (no shell) mostra o
   *  progresso real (eventos do main) e a CONCLUSÃO navega pelo botão "Ver
   *  desafio" do próprio modal (decisão documentada: a navegação automática
   *  da view caiu — o modal cobre os dois fluxos e o caso "navegou durante a
   *  geração"; o chat.lastError permanece por compat, mas o modal é quem
   *  mostra o erro). `busy` + `generateRunning` gateiam o botão. */
  const handleRegenerateFromBubble = useCallback(async (): Promise<void> => {
    if (!trackLesson || busy || generateRunning) return;
    const generationId = startChallengeGenerate({
      trackSlug: trackLesson.trackSlug,
      lessonId: trackLesson.lessonId,
      // BAIXO-3: a bolha da aula navega com target 'lesson'.
      target: 'lesson',
    });
    if (generationId === null) {
      // Já existe um processo em voo (ex.: disparado por outra view) — o modal
      // global é o único processo; nada a fazer aqui.
      return;
    }
    setBusy(true);
    try {
      const res = await withTimeout(
        getApi().track.challengeRegenerate({
          trackSlug: trackLesson.trackSlug,
          lessonId: trackLesson.lessonId,
          // ALTO-2: o main ecoa o id nos eventos de progresso — o modal
          // descarta eventos de processos anteriores.
          generationId,
        }),
        ACTION_TIMEOUTS.challengeRegenerate,
        'track.challengeRegenerate',
      );
      if (mountedRef.current === false) return;
      if (res.ok && res.challenge) {
        // O modal global (sempre montado) já recebeu o 'done' do main — este
        // finish é idempotente (estado terminal sticky + correlação no store).
        finishChallengeGenerate({ slug: res.challenge.slug, title: res.challenge.title }, generationId);
      } else {
        const msg = res.error?.message ?? tI('lesson.regenerateFailed');
        failChallengeGenerate(msg, generationId);
        setChat((s) => ({ ...s, lastError: msg }));
      }
    } catch (err) {
      if (mountedRef.current === false) return;
      const msg = isTimeoutError(err) ? tI('challenge.regenerateTimeout') : String(err);
      failChallengeGenerate(msg, generationId);
      setChat((s) => ({ ...s, lastError: msg }));
    } finally {
      if (mountedRef.current !== false) setBusy(false);
    }
  }, [trackLesson, busy, generateRunning, tI]);

  /** Revisão de uma aula ANTERIOR da trilha (aluno não entendeu). */
  const openPrerequisite = useCallback(
    (slug: string): void => {
      if (!trackLesson) return;
      setTrackLesson({ trackSlug: trackLesson.trackSlug, lessonId: slug });
      // ONDA1-NAV-UI: abrir uma aula anterior (pré-requisito) também atualiza
      // a "última aula aberta" — voltar à aba Aula restaura ESTA aula.
      saveLastLesson(trackLesson.trackSlug, slug);
      // ONDA2-QUIZ-OVERLAY: trocar de AULA é o único caminho que abandona um
      // quiz sem dominá-lo. O overlay fecha explicitamente aqui — o efeito de
      // fase só fecha por maestria, e sem isto o card da aula anterior ficaria
      // sobre a tela da aula nova.
      closeQuizOverlay();
      setChat(createTrackLessonState);
      setDoneMarked(false);
      setLoadError(null);
      publishSession({ subject: slug, status: 'idle' });
      loadLesson(trackLesson.trackSlug, slug);
    },
    [trackLesson, loadLesson, publishSession],
  );

  // ─── ONDA4 (quiz): múltipla escolha por afirmação DURANTE a aula ──────────
  // Quizzes por índice da bolha do histórico (REPLAN A1): assertion com
  // sectionId → bolha da seção que a demonstra ('next'); assertion SEM
  // sectionId (trilhas antigas) → bolha da ÚLTIMA seção apresentada (fallback
  // determinístico).
  //
  // A CHAVE do estado do quiz (quizBySection) é assunto de trackLessonState,
  // NÃO desta view: quem a produz é `quizKeyFor` (`sectionId::assertionId`),
  // e a view a recebe pronta em `visibleQuizFor(...).key` no render do card.
  // ONDA1-MAESTRIA: a view calculava a chave INLINE pela fórmula ANTIGA (a
  // sectionId sozinha, com a id como fallback) e escrevia numa chave que o gate
  // (`pendingQuizzes`, que chama `quizKeyFor`) nunca lia. Nenhum cálculo de
  // chave sobrevive aqui; `handleQuizSelect` só repassa a chave recebida.
  const quizzesByIndex = useMemo(
    () => quizzesByMessageIndex(chat, lessonAssertions),
    [chat, lessonAssertions],
  );

  /** Payload da aula lido por REF pelos callbacks do ciclo do quiz (o pedido é
   *  disparado por efeito e não pode re-registrar a cada re-render). */
  const lessonRef = useRef(lesson);
  lessonRef.current = lesson;

  // ─── ONDA2-QUIZ-OVERLAY: o quiz sobe SOBRE A TELA e desce PARA O CHAT ─────
  // O dono, textualmente: "o layout do quiz deve ser sobre a tela e respondendo
  // ele minimiza para ficar no chat" e "só vamos para o desafio depois que o
  // aluno provar que entendeu".
  //
  // Esta view NÃO implementa o ciclo — ele já existe, puro e testado, em
  // `trackLessonState` (submitQuizAnswer → registerQuizExplanation →
  // injectRemediationQuiz → dominado) e em `quizOverlayState` (a fase do
  // overlay). O que mora aqui são as TRÊS ligações que só a tela pode fazer:
  //
  //   (1) QUAL quiz está em cena  — `activeQuizCard`;
  //   (2) QUANDO cada passo vira pedido IPC — o efeito "motor" abaixo;
  //   (3) O QUE o overlay do shell desenha — `publishQuizOverlayContent`.
  //
  // A lista completa dos quizzes RENDERIZÁVEIS, na ordem das bolhas (a mesma
  // ordem determinística de `pendingQuizzes`): a chave, a assertion da geração
  // corrente e o passo do ciclo saem TODOS de `visibleQuizFor` — nenhuma conta
  // de chave sobrevive nesta view.
  const quizCards = useMemo((): QuizCardEntry[] => {
    const out: QuizCardEntry[] = [];
    for (const idx of [...quizzesByIndex.keys()].sort((a, b) => a - b)) {
      for (const original of quizzesByIndex.get(idx) ?? []) {
        out.push({ original, visible: visibleQuizFor(chat, original), anchorIndex: idx });
      }
    }
    return out;
  }, [chat, quizzesByIndex]);

  // Os que ainda pedem alguma coisa do aluno (não dominados) e cuja bolha JÁ
  // terminou de ser escrita — um quiz nunca interrompe a leitura da seção que
  // o demonstra.
  const pendingQuizCards = useMemo(
    () => quizCards.filter((c) => c.visible.step.kind !== 'dominado' && !streamingIds.has(c.anchorIndex)),
    [quizCards, streamingIds],
  );

  /**
   * O quiz EM CENA. Precedência deliberada: se o store já está aberto numa
   * chave que continua pendente, é ELA — assim um quiz que o aluno abriu (ou
   * minimizou) na mão não é trocado por baixo dele no próximo render. Só
   * quando o store não aponta para nada pendente é que entra o PRIMEIRO da
   * ordem determinística.
   */
  const activeQuizCard = useMemo((): QuizCardEntry | null => {
    const openKey = quizOverlay.quizKey;
    const held = openKey === null ? undefined : pendingQuizCards.find((c) => c.visible.key === openKey);
    return held ?? pendingQuizCards[0] ?? null;
  }, [pendingQuizCards, quizOverlay.quizKey]);

  const activeQuizCardRef = useRef(activeQuizCard);
  activeQuizCardRef.current = activeQuizCard;
  const quizCardsRef = useRef(quizCards);
  quizCardsRef.current = quizCards;

  /** Etiqueta da volta do ciclo em cena (null = nenhum quiz em cena). */
  const activeQuizTag = activeQuizCard
    ? quizCycleTag(activeQuizCard.visible.key, activeQuizCard.visible.generation)
    : null;
  /** O aviso pertence à volta em cena? (uma geração nova o aposenta sozinha) */
  const activeNotice = quizNotice !== null && quizNotice.tag === activeQuizTag ? quizNotice.kind : null;
  const quizNoticeText = quizNotice === null ? null : tI(QUIZ_NOTICE_KEY[quizNotice.kind]);
  const activeNoticeText = activeNotice === null ? null : tI(QUIZ_NOTICE_KEY[activeNotice]);

  /**
   * ONDA12 — o card do quiz PRECISA ESTAR À VISTA. Com o CTA duplicado da
   * linha de ação removido (ver o comentário lá embaixo), o card do
   * `QuizChatCard` virou o ÚNICO convite para responder — e ele mora DENTRO
   * da região de scroll da conversa. Se o aluno rolou para reler, ou se o
   * overlay desceu (minimizar) enquanto ele estava em outro ponto da
   * conversa, o único botão que destrava o "Próximo" ficaria fora da tela e o
   * gate viraria beco sem saída — exatamente o defeito que a remoção do
   * segundo botão poderia ter criado.
   *
   * `block: 'nearest'` é deliberado: ele rola o MÍNIMO necessário e não faz
   * nada quando o card já está visível — nada de puxar a leitura do aluno.
   * O optional call cobre plataforma sem `scrollIntoView` (SSR/teste).
   */
  const quizCardElRef = useRef<HTMLDivElement | null>(null);
  const activeQuizKey = activeQuizCard?.visible.key ?? null;
  useEffect(() => {
    if (activeQuizKey === null || quizOverlay.phase === 'sobre-a-tela') return;
    quizCardElRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeQuizKey, quizOverlay.phase]);
  // ONDA4-SAÍDA-DO-CICLO: o aviso da volta EM CENA lido por ref — é ele que a
  // reabertura passa como `channelFailed` para a máquina pura. Por REF, e não
  // por closure, porque `handleQuizReopenGeneration` tem deps [] (a identidade
  // estável é o que impede o registro de conteúdo do overlay de notificar o
  // shell a cada render — o mesmo motivo de `handleQuizAnswer`).
  const activeNoticeRef = useRef(activeNotice);
  activeNoticeRef.current = activeNotice;

  // ONDA16-CICLO-CARGA: os pedidos do ciclo em voo — declarado ANTES de
  // `activeQuizStatus` (que o lê: é ele que separa "pedido do ciclo em voo" de
  // "ciclo esperando a vez", para o card não mentir durante a espera).
  const quizInFlightRef = useRef<Set<string>>(new Set());

  /**
   * O que a tela DIZ sobre o quiz em cena. A tradução do passo é da função
   * pura `overlayStatusFor`; os três ajustes abaixo são do CANAL (ou da
   * ORQUESTRAÇÃO, no caso do terceiro):
   *   - 'quiz-indisponivel' → o ciclo PAROU e espera o "tentar de novo";
   *   - 'explicacao-indisponivel' → a explicação não pôde ser escrita, mas o
   *     ciclo SEGUE (`injectRemediationQuiz` aceita o estágio 'explicando' —
   *     caminho de degradação documentado lá). O card já diz "preparando um
   *     quiz novo", porque é isso que está acontecendo.
   *   - ONDA16-CICLO-CARGA: com um turno do tutor em voo (`busy`), o motor do
   *     ciclo ESPERA A VEZ em vez de enfileirar atrás do turno — dizer
   *     "explicando"/"gerando" seria mentir, porque o pedido AINDA NÃO SAIU.
   *     O estado 'aguardando-vez' diz a verdade (e o gate
   *     'quiz-indisponivel' não é burlado: com aviso de canal, ele vence).
   *     A distinção "pedido em voo × ainda esperando" é o `quizInFlightRef`:
   *     se o gate da volta já está marcado, o pedido realmente saiu — aí o
   *     status honesto é o do passo ('explicando'/'gerando').
   */
  const activeQuizStatus = useMemo((): QuizOverlayStatus => {
    if (activeQuizCard === null) return 'aguardando';
    const step = activeQuizCard.visible.step;
    if (activeNotice === 'explicacao-indisponivel' && step.kind === 'explicar-erro') return 'gerando';
    if (
      busy &&
      activeNotice === null &&
      (step.kind === 'explicar-erro' || step.kind === 'gerar-novo-quiz')
    ) {
      const tag = quizCycleTag(activeQuizCard.visible.key, activeQuizCard.visible.generation);
      const pedidoEmVoo =
        quizInFlightRef.current.has(`${tag}#explicar`) ||
        quizInFlightRef.current.has(`${tag}#remediar`);
      if (!pedidoEmVoo) return 'aguardando-vez';
    }
    return overlayStatusFor(step, activeNotice === 'quiz-indisponivel');
  }, [activeQuizCard, activeNotice, busy]);

  // ─── ONDA2-LOADER-GLOBAL: publicação do canal GLOBAL de ocupação ──────────
  // A LessonView sabe TUDO (busy, pendingAction, streaming, status do quiz em
  // cena) e é a ÚNICA fonte honesta — então é ela quem publica no contexto de
  // sessão acima das views (src/lib/sessionState.ts). O loader global do
  // shell (GlobalBusyIndicator, montado no App) consome; esta view nunca
  // desenha a pílula. A derivação é a função PURA `lessonBusyReasonFor` (a
  // tabela de prioridade vive lá, testada em node:test — não duplicar).
  const sessionBusyReason = useMemo(
    () =>
      lessonBusyReasonFor({
        quizStatus: activeQuizCard === null ? null : activeQuizStatus,
        busy,
        pendingAction,
        streaming: streamingIds.size > 0,
        // ONDA2-LOADER-GLOBAL (fix do revisor): a regeneração de desafio na
        // bolha também é busy sem pendingAction — sem este input a derivação
        // devolvia 'concluindo' e o loader global dizia "Concluindo a aula"
        // durante toda a geração. Com `generateRunning` ela vira 'gerando'.
        regenerating: generateRunning,
      }),
    [activeQuizCard, activeQuizStatus, busy, pendingAction, streamingIds, generateRunning],
  );
  // Publicação espelhando a razão derivada. `publishSession` é estável; o
  // reducer é no-op por identidade quando nada muda (e `busy` nunca carimba
  // lastActivityAt). O CLEANUP publica `null` na desmontagem (troca de aba):
  // a ocupação morre COM a view que a publicou — nenhum fantasma de ocupação
  // sobrevivendo à aba que a produziu.
  useEffect(() => {
    publishSession({ busy: sessionBusyReason === null ? null : { reason: sessionBusyReason } });
  }, [sessionBusyReason, publishSession]);
  useEffect(() => {
    return () => {
      publishSession({ busy: null });
    };
  }, [publishSession]);

  /**
   * RESPOSTA do aluno — o gesto que o dono pediu: registrar e MINIMIZAR.
   *
   * Ordem: a máquina pura primeiro (`submitQuizAnswer` — idempotente, a
   * primeira resposta da geração vence), a fase depois. O canal
   * `track.quizAttempt` é disparado aqui e SÓ AQUI: ele devolve a maestria já
   * recalculada, então não existe um segundo invoke (nada de `quizHistory`
   * atrás dele) — e falhar a gravação NÃO desfaz a resposta, só acende o aviso
   * de que ela vale nesta sessão.
   *
   * Deps [] de propósito: todo insumo mutável entra por ref, para que a
   * identidade do callback fique estável — é ela que o registro de conteúdo do
   * overlay compara para não notificar o shell a cada render.
   */
  const handleQuizAnswer = useCallback((card: QuizCardEntry, answerIndex: number): void => {
    const { visible } = card;
    // Dominado ou já respondido nesta geração: `submitQuizAnswer` seria no-op,
    // e o canal não pode gravar uma tentativa que o estado recusa. A MESMA
    // guarda cobre a resposta dupla DURANTE a janela do veredito — e, na
    // prática, o segundo clique nem existe: com `answered === true` o
    // `optionVisualState` desabilita as quatro opções (o overlay congelado
    // desenha exatamente esse estado).
    if (visible.step.kind === 'dominado' || visible.quiz?.answered === true) return;
    const correctIndex = visible.assertion.answerIndex;
    const correct = answerIndex === correctIndex;
    // ONDA16-VEREDITO: o estado NOVO é calculado FORA do updater (padrão de
    // `handleQuizReopenGeneration`) porque o card congelado precisa da
    // resposta JÁ gravada (`visibleQuizFor(proximo, ...)`).
    const proximo = submitQuizAnswer(chatRef.current, visible.key, answerIndex, correctIndex);
    setChat(proximo);
    // A JANELA DO VEREDITO — o conserto do pedido do dono. Antes, o minimize
    // acontecia NO MESMO gesto do submit e o aluno nunca via acerto/erro.
    // Agora o card SOBRE A TELA congela no estado respondido por
    // QUIZ_VERDICT_MS e SÓ ENTÃO desce para a conversa. O minimize morre num
    // timer, e o cleanup de unmount (abaixo) garante que ele acontece MESMO
    // se o aluno trocar de aba no meio da janela — nenhum timer vaza estado
    // depois que a view desmonta.
    if (verdictTimerRef.current !== null) clearTimeout(verdictTimerRef.current);
    verdictTimerRef.current = setTimeout(() => {
      verdictTimerRef.current = null;
      setVerdictHold(null);
      minimizeQuizOverlay(visible.key);
    }, QUIZ_VERDICT_MS);
    // Congela o overlay no card RESPONDIDO (a publicação e a fase leem este
    // estado — ver os dois efeitos abaixo).
    setVerdictHold({
      key: visible.key,
      card: { ...card, visible: visibleQuizFor(proximo, card.original) },
    });
    setQuizNotice(null);
    const ctx = trackLessonRef.current;
    if (!ctx) return;
    const tag = quizCycleTag(visible.key, visible.generation);
    withTimeout(
      getApi().track.quizAttempt({
        trackSlug: ctx.trackSlug,
        lessonId: ctx.lessonId,
        // A unidade do gate DESTA base é a afirmação, não a seção — e o
        // contrato declara `sectionKey` como string livre justamente por isso.
        // Gravar a chave canônica mantém a maestria do banco alinhada com a
        // maestria que o "Próximo"/"Concluir aula" lê em memória.
        sectionKey: visible.key,
        assertionId: visible.assertion.id,
        selectedIndex: answerIndex,
        correct,
        quizOrigin: visible.generation === 0 ? 'authored' : 'remedial',
      }),
      IPC_TIMEOUT_MS,
      'track.quizAttempt',
    )
      .then((res) => {
        if (mountedRef.current === false) return;
        if (res.ok === false) setQuizNotice({ tag, kind: 'registro-nao-gravado' });
      })
      .catch(() => {
        if (mountedRef.current !== false) setQuizNotice({ tag, kind: 'registro-nao-gravado' });
      });
  }, []);

  /** O overlay do shell responde por aqui (identidade estável — lê o ref). */
  const handleOverlaySelect = useCallback((answerIndex: number): void => {
    const card = activeQuizCardRef.current;
    if (card) handleQuizAnswer(card, answerIndex);
  }, [handleQuizAnswer]);

  /** Minimizar (Esc, backdrop, botão do cabeçalho do overlay). */
  const handleQuizMinimize = useCallback((): void => {
    minimizeQuizOverlay();
  }, []);

  /** Trazer um quiz de volta para cima da tela (botão do card da conversa). */
  const handleQuizReopen = useCallback((quizKey: string): void => {
    // ONDA16-VEREDITO: abrir OUTRO quiz durante a janela do veredito encerra a
    // janela — o gesto do aluno vence e o overlay passa a desenhar o quiz
    // pedido (o conteúdo congelado de outra chave esconderia o card aberto:
    // `showing` exige quizKey igual). O gesto do aluno vence sempre.
    const hold = verdictHoldRef.current;
    if (hold !== null && hold.key !== quizKey) {
      if (verdictTimerRef.current !== null) {
        clearTimeout(verdictTimerRef.current);
        verdictTimerRef.current = null;
      }
      setVerdictHold(null);
    }
    const snapshot = peekQuizOverlay();
    if (snapshot.quizKey === quizKey && snapshot.phase === 'minimizado-no-chat') {
      reopenQuizOverlay(quizKey);
      return;
    }
    const card = quizCardsRef.current.find((c) => c.visible.key === quizKey);
    if (card) openQuizOverlay(overlayContextFor(card.original, card.visible, card.anchorIndex));
  }, []);

  /** "Tentar de novo" depois de um canal fora do ar — limpa o aviso e o efeito
   *  motor abaixo volta a disparar o passo que estava parado. */
  const handleQuizRetry = useCallback((): void => {
    setQuizNotice(null);
  }, []);

  /**
   * ONDA4-SAÍDA-DO-CICLO — "Responder esta pergunta de novo".
   *
   * O DEFEITO que isto mata (medido em tests/e2e/e2e-quiz.spec.ts, teste 5):
   * com a IA fora do ar, errar deixava a afirmação em 'explicando' /
   * 'novo-quiz-pendente' PARA SEMPRE. "Pedir de novo" só serve enquanto houver
   * esperança de a IA responder; quando não há, o aluno ficava com o "Próximo"
   * desabilitado e nada para clicar.
   *
   * A saída é reabrir a GERAÇÃO CORRENTE — a mesma pergunta, numa geração
   * nova. TRÊS coisas que ela NÃO faz, e são o ponto:
   *   - não dispensa o gate: o estado volta a 'aguardando-resposta', e só o
   *     ACERTO fecha a chave (`submitQuizAnswer`);
   *   - não apaga o rastro: `attempts` é preservado e a tentativa nova conta
   *     no histórico e na recorrência ERR-4 (a id da geração carrega o número);
   *   - não fica disponível sempre: `channelFailed` sai do aviso REAL da volta
   *     em cena, então com a IA de pé a transição é no-op por referência.
   *
   * Deps [] pelo mesmo motivo de `handleQuizAnswer`: todo insumo mutável entra
   * por ref, e a identidade estável do callback é o que mantém o registro de
   * conteúdo do overlay silencioso entre renders.
   */
  const handleQuizReopenGeneration = useCallback((): void => {
    const card = activeQuizCardRef.current;
    if (card === null) return;
    const { visible } = card;
    // A GUARDA REAL, não um `true` literal: só o aviso do canal desta volta
    // autoriza a reabertura. Na PRÁTICA quem chega aqui é 'quiz-indisponivel'
    // — é o único que `overlayStatusFor` traduz para 'indisponivel', e por isso
    // o único que faz o botão nascer. 'explicacao-indisponivel' entra na conta
    // por COMPLETUDE: é o outro aviso do MESMO ciclo travado, e deixá-lo de
    // fora faria a guarda mais estreita que o defeito que ela cobre.
    const travado =
      activeNoticeRef.current === 'quiz-indisponivel' ||
      activeNoticeRef.current === 'explicacao-indisponivel';
    // ONDA11-INTEGRAÇÃO — o estado NOVO é calculado ANTES do setChat, e não
    // dentro de um updater, por uma razão só: este clique precisa SUBIR o
    // modal, e para isso é preciso conhecer a geração que acabou de nascer.
    // `chatRef` é atribuído no corpo do render (nunca num efeito), então ele é
    // o estado corrente no instante do clique. Reducer PURO: recalcular aqui e
    // publicar o resultado é a mesma transição, uma vez só.
    const atual = chatRef.current;
    const proximo = reopenStalledQuiz(atual, visible.key, visible.assertion, travado);
    // No-op POR REFERÊNCIA (o ciclo não estava travado): nada muda, e nada
    // sobe — a saída não é uma segunda porta para o gate.
    if (proximo === atual) return;
    setChat(proximo);
    // O aviso morre com a volta antiga: a geração nova muda a etiqueta
    // (`quizCycleTag`) e o aviso já não pertenceria a ela.
    setQuizNotice(null);
    // O DEFEITO QUE ESTA LINHA MATA (medido na integração das quatro entregas
    // paralelas da ONDA11): o botão diz "Responder esta pergunta de novo" e é
    // um GESTO do aluno, mas o handler terminava no setChat. Como a geração
    // nova é OUTRA geração, o guard de `applyQuizOverlayStep` — que protege
    // só o MESMO quiz/geração já sobre a tela — não a alcançava, e o efeito do
    // ciclo empurrava o card recém-nascido para 'minimizado-no-chat': o modal
    // SUMIA no clique. `tests/e2e/e2e-quiz.spec.ts` (teste 5, bloco a) sempre
    // exigiu o contrário. Medido em tests/quizOverlayCycle.test.ts ("a SAÍDA
    // do ciclo travado é um gesto") e travado por fonte em
    // tests/quizOverlayWiring.test.ts.
    openQuizOverlay(overlayContextFor(card.original, visibleQuizFor(proximo, card.original), card.anchorIndex));
  }, []);

  // ─── (2) O MOTOR: cada passo do ciclo vira um pedido ao main ──────────────
  // Um pedido por vez e por volta do ciclo (`inFlightRef`, chaveado por
  // etiqueta + passo): o efeito re-executa a cada mudança do chat, e sem o
  // guarda o StrictMode do dev dispararia a explicação duas vezes.

  const driveQuizCycle = useCallback(async (card: QuizCardEntry): Promise<void> => {
    const ctx = trackLessonRef.current;
    const payload = lessonRef.current;
    if (!ctx || !payload) return;
    const { original, visible } = card;
    const step = visible.step;
    const tag = quizCycleTag(visible.key, visible.generation);
    const found = payload.theory.find((sec) => sec.id === original.sectionId);
    const theorySection = found === undefined ? null : found;
    // O material da aula ANCORA a explicação e o quiz novo (o main decide o
    // orçamento de contexto; a view não inventa corte).
    const lessonExcerpt = [payload.title, payload.summary, ...payload.theory.map((sec) => sec.markdown)].join('\n\n');
    const quizOrigin = visible.generation === 0 ? 'authored' : 'remedial';

    if (step.kind === 'explicar-erro') {
      const gate = `${tag}#explicar`;
      if (quizInFlightRef.current.has(gate)) return;
      quizInFlightRef.current.add(gate);
      try {
        const res = await withTimeout(
          getApi().track.quizExplain({
            trackSlug: ctx.trackSlug,
            lessonId: ctx.lessonId,
            sectionKey: visible.key,
            assertion: visible.assertion,
            selectedIndex: step.selected,
            quizOrigin,
            theorySection,
            lessonExcerpt,
          }),
          // Mesmo orçamento do turno 'answer': os dois são chamada de LLM, e
          // 70s já é o teto calibrado acima do abort de 45s do main.
          ACTION_TIMEOUTS.answer,
          'track.quizExplain',
        );
        if (mountedRef.current === false) return;
        if (res.ok === true && res.explanation.trim() !== '') {
          // A explicação vira BOLHA da conversa (kind 'quiz-explanation') e o
          // ciclo avança para 'novo-quiz-pendente'. O índice é marcado ANTES
          // do append (mesmo padrão do 'next'/'answer'): a bolha da explicação
          // é mensagem NOVA da sessão e por isso DIGITA, em vez de aparecer
          // pronta como as restauradas do cache.
          const explanationIndex = chatRef.current.history.length;
          setChat((st) =>
            registerQuizExplanation(
              st,
              visible.key,
              {
                question: visible.assertion.question,
                chosenOption: visible.assertion.options[step.selected] ?? '',
                explanation: res.explanation,
              },
              {
                title: tIRef.current('lesson.quizExplanationTitle'),
                chosen: tIRef.current('lesson.quizExplanationChosen'),
              },
            ),
          );
          markNew(explanationIndex);
          setQuizNotice(null);
        } else {
          // FAIL-CLOSED: nada de explicação inventada. O aluno NÃO trava — o
          // ciclo segue para o quiz novo pelo caminho de degradação que
          // `injectRemediationQuiz` documenta (ele aceita 'explicando').
          setQuizNotice({ tag, kind: 'explicacao-indisponivel' });
        }
      } catch {
        if (mountedRef.current !== false) setQuizNotice({ tag, kind: 'explicacao-indisponivel' });
      } finally {
        quizInFlightRef.current.delete(gate);
      }
      return;
    }

    // 'gerar-novo-quiz' — o quiz REMEDIADOR sobre o mesmo conteúdo.
    const gate = `${tag}#remediar`;
    if (quizInFlightRef.current.has(gate)) return;
    quizInFlightRef.current.add(gate);
    try {
      // Nunca-repetir: as perguntas que este aluno já viu nesta afirmação.
      const asked = [...new Set([original.question, visible.assertion.question])];
      const explanation = visible.quiz?.explanation;
      const res = await withTimeout(
        getApi().track.quizRemedial({
          trackSlug: ctx.trackSlug,
          lessonId: ctx.lessonId,
          sectionKey: visible.key,
          originAssertionId: original.id,
          generation: visible.generation + 1,
          assertion: original,
          ...(typeof explanation === 'string' && explanation !== '' ? { explanation } : {}),
          askedQuestions: asked,
          theorySection,
          lessonExcerpt,
        }),
        ACTION_TIMEOUTS.answer,
        'track.quizRemedial',
      );
      if (mountedRef.current === false) return;
      if (res.ok === true) {
        // Geração N+1, card zerado, ciclo de volta a 'aguardar-resposta' — e o
        // ONDA11: ele ESPERA NA CONVERSA (o card volta com o CTA), porque
        // nenhum passo do ciclo sobe o modal — nem um quiz novo chegando por
        // cima da explicação que o aluno está lendo.
        setChat((st) => injectRemediationQuiz(st, visible.key, res.quiz));
        setQuizNotice(null);
      } else {
        // FAIL-CLOSED: nenhum quiz inventado. O ciclo PARA e a tela oferece
        // repetir — travar em silêncio seria pior que falhar.
        setQuizNotice({ tag, kind: 'quiz-indisponivel' });
      }
    } catch {
      if (mountedRef.current !== false) setQuizNotice({ tag, kind: 'quiz-indisponivel' });
    } finally {
      quizInFlightRef.current.delete(gate);
    }
  }, [markNew]);

  useEffect(() => {
    // ONDA16-CICLO-CARGA (causa raiz diagnosticada): o LLM local serializa
    // TODAS as chamadas numa fila FIFO (LlmProxyService, main) — disparar
    // 'explicar-erro'/'gerar-novo-quiz' com um turno do tutor em voo
    // enfileirava o pedido ATRÁS dele; o renderer matava no
    // ACTION_TIMEOUTS.answer (70s) e o ciclo morria em 'quiz-indisponivel',
    // com a aula travada e nenhum quiz remediador nascendo. O conserto é
    // NÃO DISPARAR enquanto `busy`: quando o turno termina, ESTA dep muda e o
    // efeito re-executa — o passo não se perde, porque ele continua sendo o
    // passo do card em cena. O guard de 'quiz-indisponivel' (o freio do laço
    // de retentativa contra uma IA fora do ar) vem DEPOIS e fica intacto:
    // durante a espera, o card diz 'aguardando-vez' (ver `activeQuizStatus`),
    // nunca "explicando".
    if (busy) return;
    if (activeQuizCard === null) return;
    const step = activeQuizCard.visible.step;
    if (step.kind !== 'explicar-erro' && step.kind !== 'gerar-novo-quiz') return;
    // O canal caiu nesta volta: espera o "tentar de novo" do aluno (nada de
    // laço de retentativa contra uma IA que está fora).
    if (activeNotice === 'quiz-indisponivel') return;
    // A explicação não pôde ser escrita: o passo continua 'explicar-erro' na
    // máquina pura, mas o pedido que falta é o do QUIZ NOVO.
    if (activeNotice === 'explicacao-indisponivel' && step.kind === 'explicar-erro') {
      void driveQuizCycle({
        ...activeQuizCard,
        visible: { ...activeQuizCard.visible, step: { kind: 'gerar-novo-quiz', generation: step.generation } },
      });
      return;
    }
    void driveQuizCycle(activeQuizCard);
  }, [activeQuizCard, activeNotice, driveQuizCycle, busy]);

  // ─── (1) A FASE do overlay acompanha o passo do ciclo ─────────────────────
  // `applyQuizOverlayStep` é o atalho declarado do store. ONDA11: NENHUM passo
  // sobe o modal — 'aguardar-resposta' ESTACIONA o quiz na conversa (é onde o
  // QuizChatCard desenha o convite), 'explicar-erro'/'gerar-novo-quiz' o
  // mantêm lá (é lá que a explicação e o quiz novo chegam) e 'dominado' FECHA.
  // Ele é idempotente por referência e guarda o que o aluno abriu na mão, então
  // re-executar não derruba o modal nem ressuscita um card minimizado. Quem
  // sobe é sempre um clique: `handleQuizReopen` (o CTA) e
  // `handleQuizReopenGeneration` (a saída do ciclo travado).
  useEffect(() => {
    // ONDA16-VEREDITO: durante a janela, a FASE fica CONGELADA. Sem este
    // guard, o MESMO commit da resposta já aplicaria o passo novo:
    // 'explicar-erro'/'gerar-novo-quiz' desceriam o card NA HORA (o defeito
    // que o dono relatou — o veredito nunca era visto) e o 'dominado' fecharia
    // o overlay por inteiro. Quando a janela termina, esta dep (verdictHold)
    // muda e o efeito retoma o desenho normal do passo corrente.
    if (verdictHold !== null) return;
    if (activeQuizCard !== null) {
      applyQuizOverlayStep(
        overlayContextFor(activeQuizCard.original, activeQuizCard.visible, activeQuizCard.anchorIndex),
        activeQuizCard.visible.step,
      );
      return;
    }
    // Sem quiz em cena o overlay só FECHA quando a chave aberta foi mesmo
    // DOMINADA. O guard não é zelo: a view remonta a cada volta para a aba
    // Aula, e no primeiro render `lesson` ainda é null — fechar aqui apagaria,
    // toda vez, exatamente a fase que o store existe para preservar.
    const openKey = quizOverlay.quizKey;
    if (lesson !== null && openKey !== null && isQuizMastered(chat, openKey)) {
      closeQuizOverlay(openKey);
    }
  }, [activeQuizCard, quizOverlay.quizKey, lesson, chat, verdictHold]);

  // ─── (3) O que o overlay do SHELL desenha ─────────────────────────────────
  // O overlay é montado em App.tsx (o molde do ChallengeGenerateModal) e o
  // conteúdo do quiz vive aqui: esta é a publicação. Sair da aba Aula desmonta
  // a view e o cleanup publica null — o overlay sai da tela, mas a FASE segue
  // no store e as respostas seguem no cache do chat: voltar reabre no mesmo
  // ponto, na mesma geração.
  useEffect(() => {
    // ONDA16-VEREDITO: durante a janela, o CONTEÚDO fica CONGELADO no card
    // RESPONDIDO — é o que o overlay desenha (o veredito). O congelamento é
    // INCONDICIONAL, e não "só quando activeQuizCard é null", por uma corrida
    // REAL: com a IA fixture respondendo em milissegundos, o ciclo completo
    // (explicação + quiz remediador) pode correr POR TRÁS da janela e trocar
    // `activeQuizCard` pela geração nova — sem o congelamento, o overlay
    // mostraria o quiz SEGUINTE no lugar do veredito.
    if (verdictHold !== null) {
      publishQuizOverlayContent({
        quizKey: verdictHold.card.visible.key,
        assertion: verdictHold.card.visible.assertion,
        quiz: verdictHold.card.visible.quiz,
        generation: verdictHold.card.visible.generation,
        // O overlay não desenha status; o valor é o neutro da casa.
        status: 'aguardando',
        notice: null,
        onSelect: handleOverlaySelect,
        onMinimize: handleQuizMinimize,
        // Durante a janela não há retry/reopen: as opções estão travadas pelo
        // estado respondido, e o minimize vem no fim da janela.
        onRetry: null,
        onReopen: null,
      });
      return;
    }
    if (activeQuizCard === null) {
      publishQuizOverlayContent(null);
      return;
    }
    publishQuizOverlayContent({
      quizKey: activeQuizCard.visible.key,
      assertion: activeQuizCard.visible.assertion,
      quiz: activeQuizCard.visible.quiz,
      generation: activeQuizCard.visible.generation,
      status: activeQuizStatus,
      notice: activeNoticeText,
      onSelect: handleOverlaySelect,
      onMinimize: handleQuizMinimize,
      onRetry: activeQuizStatus === 'indisponivel' ? handleQuizRetry : null,
      // ONDA4-SAÍDA-DO-CICLO: a reabertura só aparece com o ciclo TRAVADO — a
      // MESMA condição do "Pedir de novo", e nunca em 'aguardando'/'dominado'.
      onReopen: activeQuizStatus === 'indisponivel' ? handleQuizReopenGeneration : null,
    });
  }, [
    verdictHold,
    activeQuizCard,
    activeQuizStatus,
    activeNoticeText,
    handleOverlaySelect,
    handleQuizMinimize,
    handleQuizRetry,
    handleQuizReopenGeneration,
  ]);

  useEffect(() => {
    return () => {
      publishQuizOverlayContent(null);
      // ONDA16-VEREDITO: veredito em voo no momento da desmontagem (o aluno
      // trocou de aba no meio da janela) — o minimize NÃO se perde: o timer é
      // cancelado e a transição acontece JÁ, sincronamente no cleanup. Nada
      // de timer sobrevivendo à view, nada de estado vazando: o store é de
      // módulo e a transição nele é segura pós-unmount (guard mountedRef
      // desnecessário aqui — o cleanup É o fim da montagem).
      if (verdictTimerRef.current !== null) {
        clearTimeout(verdictTimerRef.current);
        verdictTimerRef.current = null;
        const hold = verdictHoldRef.current;
        verdictHoldRef.current = null;
        if (hold !== null) minimizeQuizOverlay(hold.key);
      }
    };
  }, []);

  // ─── ONDA4 (pós-conclusão): próxima aula da trilha ────────────────────────
  // `nextLesson` é entrega da sub-tarefa irmã (onda4-next-glow) — merge dela
  // vem ANTES no main (ver LessonPayloadWithNext no topo: cast defensivo
  // enquanto o campo não existe no contrato). Sem nextLesson → o botão cai no
  // roadmap (a trilha reflete a aula recém-concluída).
  const nextLesson = useMemo(
    () => (lesson as LessonPayloadWithNext | null)?.nextLesson ?? null,
    [lesson],
  );
  /**
   * "Avançar para a próxima aula" — ONDA-INTEGRAÇÃO, o BUG GRAVE do dono:
   * *"quando clico em proxima aula NAO LIBERA o cadeado da proxima aula"*.
   *
   * O QUE ESTE CÓDIGO FAZIA, e por que o clique não fazia NADA: ele gravava a
   * pendência (`setPendingTrackLesson`) e chamava `navigate('lesson')`. Só que
   * este botão só existe DENTRO da aba Aula, `navigate` é o `setActive` do
   * shell (src/App.tsx: `<View onNavigate={setActive} />`) e o shell monta só a
   * view ativa (`const View = VIEWS[active]`). `setActive('lesson')` com
   * 'lesson' JÁ ativo é no-op do React: a LessonView não remonta, e a pendência
   * só é lida no efeito de MONTAGEM (via `createTrackLessonPendingHolder`).
   * Resultado medido na tela: a aula 2 nunca abria — e, como ela nunca era
   * aberta nem concluída, o cadeado seguinte nunca se movia.
   *
   * O CONSERTO é trocar de aula NO LUGAR, exatamente como `openPrerequisite`
   * (acima) já fazia — o caminho que sempre funcionou. `saveLastLesson` deixa a
   * aula nova como "última aberta", então uma remontagem futura (troca de aba)
   * restaura ELA pela 3ª precedência do efeito de montagem: nenhuma pendência
   * pendurada, nenhum drain fantasma. O `navigate('lesson')` fica por último e
   * só cobre o caso de a view não estar montada (hoje impossível — o botão é
   * dela); sem `nextLesson`, o fallback continua sendo a Trilha.
   */
  const handleGoToNextLesson = useCallback((): void => {
    if (!trackLesson) return;
    const proxima = nextLesson?.slug;
    if (!proxima) {
      navigate('roadmap');
      return;
    }
    setTrackLesson({ trackSlug: trackLesson.trackSlug, lessonId: proxima });
    saveLastLesson(trackLesson.trackSlug, proxima);
    // Trocar de AULA abandona qualquer quiz não dominado da aula anterior: o
    // overlay fecha explicitamente aqui (o efeito de fase só fecha por
    // maestria), senão o card da aula velha ficaria sobre a aula nova.
    closeQuizOverlay();
    setChat(createTrackLessonState);
    setDoneMarked(false);
    setLoadError(null);
    publishSession({ subject: proxima, status: 'idle' });
    // ONDA2-PREFETCH: aquece a aula de destino já no clique (best-effort —
    // normalmente o payload desta aula já a pré-carregou; aqui é o reforço do
    // caminho direto, com o anti-burst do módulo decidindo).
    prefetchLesson(trackLesson.trackSlug, proxima);
    loadLesson(trackLesson.trackSlug, proxima);
    navigate('lesson');
  }, [trackLesson, nextLesson, navigate, loadLesson, publishSession]);

  // ─── ONDA14: O PRÓXIMO PASSO, e o que o clique faz ────────────────────────
  // Todo o estado que a linha de ação precisa desemboca numa função PURA
  // (`lessonActionStep`, cabeçalho da seção lá em cima). Nada de ternário
  // aninhado no JSX: o passo é UM valor, testável sozinho, e o JSX só desenha.
  const actionStep = lessonActionStep({
    theoryDone: chat.theoryDone,
    doneMarked,
    typingTheory,
    nextBlockedByQuiz,
    finishBlock,
  });
  /**
   * O clique no botão de avanço — pedido do dono: *"quando clico em proximo já
   * tem que mostrar tudo da digitação anterior"*.
   *
   * A decisão é do `nextClickAction` (pura): com a seção sendo escrita o
   * clique COMPLETA a digitação (`requestSkipTyping`) e NÃO avança; só o passo
   * 'proximo' chama `sendNext`. O gate do quiz não é afrouxado em lugar
   * nenhum — 'quiz-secao' devolve 'nada', e o próprio `sendNext` mantém o
   * guard `if (nextBlockedByQuiz) return` para a corrida em que a bolha termina
   * de ser escrita entre o mousedown e o clique.
   */
  const handleNextClick = useCallback((): void => {
    const action = nextClickAction(actionStep);
    if (action === 'revelar') {
      requestSkipTyping();
      return;
    }
    if (action === 'avancar') void sendNext();
  }, [actionStep, requestSkipTyping, sendNext]);

  /**
   * ONDA14 — o DESAFIO na linha de baixo, com o MESMO destino do botão
   * "Desafios" do cabeçalho da aula (no sidebar do shell desde a
   * ONDA-AULA-NO-SIDEBAR; nada de segundo fluxo): com UM desafio pendente vai
   * direto para ele (`openChallenge`, a mesma navegação da lista); com mais de
   * um, abre O MESMO popover — só que ancorado NESTE botão, e por isso o `from`
   * guarda de onde ele foi aberto (a lista abre para CIMA quando nasce aqui
   * embaixo, e para a DIREITA quando nasce no botão do sidebar).
   */
  const handleChallengeStep = useCallback(
    (anchor: HTMLButtonElement): void => {
      const pending = (lesson?.challenges ?? []).filter((ch) => ch.lastVerdict !== 'passed');
      if (pending.length === 1) {
        openChallenge(pending[0]);
        return;
      }
      setChallengesFrom('acao');
      setChallengesAnchorEl(anchor);
    },
    [lesson, openChallenge],
  );

  // ─── estado vazio: nenhuma aula de trilha selecionada ─────────────────────
  if (!trackLesson) {
    return (
 <Stack spacing={2} sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 6, alignItems: 'center' }} >
        <AutoStoriesIcon color="primary" sx={{ fontSize: 56 }} />
        <Typography variant="h6" align="center">
          {t('translation:lesson.emptyTitle')}
        </Typography>
        <Typography variant="body2" align="center" sx={{ color: 'text.secondary', maxWidth: 480 }}>
          {t('translation:lesson.emptyDescription')}
        </Typography>
        <Button variant="contained" onClick={() => navigate('roadmap')}>
          {t('translation:lesson.emptyCta')}
        </Button>
      </Stack>
    );
  }

  // W3 (falsy-proof): só `null` significa "sem erro" — '' é erro válido.
  if (loadError !== null) {
    return (
      <Box sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 4 }}>
        <Alert severity="error">{loadError}</Alert>
        <Button
          variant="outlined"
          onClick={() => loadLesson(trackLesson.trackSlug, trackLesson.lessonId)}
          sx={{ mt: 1 }}
        >
          {t('translation:common.tryAgain')}
        </Button>
      </Box>
    );
  }

  if (!lesson) {
    return (
      <Box sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  const theoryProgress = Math.min(100, Math.round((chat.presentedSections.length / Math.max(1, lesson.theory.length)) * 100));

  // ONDA1-UX + ONDA16-PIN (o dono: "fica um pin de item em Desafios mas ele só
  // libera no fim da aula então não deveria ter esse pin"): o badge do botão
  // "Desafios" e o aria-label da linha de ação SÓ contam quando o desafio
  // está LIBERADO — teoria concluída E todo quiz visível dominado (o MESMO
  // gate que produz o passo 'desafio'). Antes da liberação, vale 0 (badge
  // oculto — showZero=false é o default do MUI). A regra é a função PURA
  // challengeBadgeCount (acima, testada); o GATING de abertura
  // (challengeOpenBlockedByQuiz / openChallenge / lessonFinishBlock) NÃO
  // mudou — isto é só o PIN.
  const pendingChallengeCount = challengeBadgeCount({
    theoryDone: chat.theoryDone,
    pendingQuizCount: quizPendingAll.length,
    challenges: lesson.challenges,
  });

  // ONDA 1 (layout+a11y): a aula ATIVA ocupa TODA a altura do painel main —
  // região do chat com scroll INTERNO (flexGrow) e entrada fixa embaixo. O
  // cabeçalho que ficava fixo no topo foi para o SIDEBAR na
  // ONDA-AULA-NO-SIDEBAR (o portal no fim deste return): a coluna começa
  // direto na conversa, e a altura que ele ocupava virou área do chat.
  // `flexGrow: 1, minHeight: 0, height: '100%'` resolvem porque o `main` do
  // shell virou flex column com altura definida (stretch). Os estados
  // vazio/erro/loading acima seguem com altura de conteúdo — e não publicam
  // nada no sidebar (o slot fica vazio).
  //
  // ONDA11 (a coluna, ver o cabeçalho de LESSON_COLUMN_SX): tudo o que a aula
  // ativa pinta no main — painel de mensagens, avisos, ação e entrada — vive
  // numa coluna SÓ. Este Box é o ÚNICO lugar que declara largura; os filhos
  // apenas preenchem. Antes eram dois eixos concorrentes
  // (a view em min(1920px, 100%) e o painel capado em 1000 com `mx: 'auto'`),
  // e o segundo eixo era APAGADO nos filhos diretos do Stack pela regra de
  // espaçamento dele — o input encostava na esquerda. `useFlexGap` tira essa
  // regra de campo: o espaçamento vira `gap` do container, e nenhuma margem
  // de filho é reescrita.
  // ONDA-LARGURA-LIVRE: a largura declarada aqui é "preencher o main" — sem
  // teto e sem centralização. A largura do texto da aula é ditada SÓ pela
  // divisória do sidebar (main = contêiner − sidebar − divisória).
  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 2,
        ...LESSON_COLUMN_SX,
      }}
    >
      <Stack useFlexGap spacing={1.5} sx={{ flexGrow: 1, minHeight: 0 }}>
        {/* Região do chat: ÚNICO scroll interno da aula ativa (janela pequena
            ou grande — o main do shell nunca rola). `flexGrow` faz o chat
            ocupar TODA a altura disponível do painel main; `minHeight: 0`
            permite encolher até caber a entrada fixa embaixo.
            ONDA-AULA-NO-SIDEBAR: ela é o PRIMEIRO filho da coluna — o
            cabeçalho da aula e o Divider que vinham antes dela foram para o
            sidebar do shell (o portal no fim deste return). */}
        <Box
          ref={logScrollRef}
          sx={{
            flexGrow: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            // ONDA12: os 12px de `p: 1.5` que o painel tinha morreram junto
            // com a caixa — mas o CLIPE do scroll não morreu com eles. Um
            // container com `overflow-y: auto` recorta no PADDING BOX, e o
            // anel de foco desta base sai 5px do controle (FOCUS_RING:
            // offset 2 + width 3, theme.ts): com inset zero, o anel do
            // "Mostrar tudo" — que nasce colado na borda esquerda — seria
            // cortado. 0.75 = 6px, a folga MÍNIMA que cabe o anel inteiro.
            // Fica aqui, no ROLADOR, e não no painel: assim o painel segue
            // sem padding nenhum (ele não desenha caixa) e o respiro é
            // função do recorte, que é o que ele realmente é.
            px: 0.75,
          }}
        >
          {/* Painel das mensagens (rola junto com a região). ONDA11: ele NÃO
              declara mais eixo próprio — a coluna já é a do container raiz, e
              o balão ocupa no máximo 78% dela (ChatBubble; desde a
              ONDA-LARGURA-LIVRE sem o teto de 80ch — a linha acompanha a
              divisória do sidebar). Era justamente o eixo duplicado aqui que
              fazia painel e entrada discordarem. ONDA1-UX: a lista de
              desafios não vive mais aqui (popover do botão "Desafios" do
              cabeçalho da aula — no sidebar, desde a ONDA-AULA-NO-SIDEBAR).

              ONDA12: ele também não é mais uma CAIXA — nível 0 (o fundo do
              app), sem raio e sem padding, com a conversa ancorada embaixo. A
              conta de contraste do "nível 2 → nível 0" está no cabeçalho de
              `lessonLogSx`, que é onde este estilo mora agora: fora do JSX ele
              é RENDERIZÁVEL sozinho, e o teste lê o CSS que o emotion emite em
              vez de procurar texto no fonte. */}
          <Box
            sx={lessonLogSx(theme)}
            role="log"
            aria-live="polite"
            // ONDA10 (bug 3): clicar em QUALQUER lugar do painel completa a
            // digitação em curso. É atalho REDUNDANTE (há o botão "Mostrar
            // tudo", acessível, e qualquer tecla) — por isso o div não vira
            // widget nem ganha foco; sem digitação em curso, é no-op.
            onClick={typingNow ? requestSkipTyping : undefined}
          >
          {chat.history.length === 0 ? (
            <Box sx={{ m: 'auto', textAlign: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">{t('translation:lesson.chatStart')}</Typography>
              {/* ONDA2-CHAT-NINTENDO: press feedback (scale 0.98, spring
                  snappy) nos botões do chat — pedido do dono. */}
              <motion.span
                whileTap={{ scale: 0.98 }}
                transition={springs.snappy}
                // Casca animada: nunca parada de tab (o porquê está no microfone).
                tabIndex={-1}
                style={{ display: 'inline-block' }}
              >
                <Button
                  variant="contained"
                  size="small"
                  onClick={sendNext}
                  disabled={busy}
                  startIcon={<ArrowForwardIcon />}
                  sx={{ mt: 1 }}
                >
                  {t('translation:lesson.startButton')}
                </Button>
              </motion.span>
            </Box>
          ) : (
            <>
              {/* ONDA2-CHAT-NINTENDO: balões ENTRAM animados — AnimatePresence
                  + fadeInUp (opacity 0, y 10 → 0, spring gentle). Só os
                  balões NOVOS da sessão animam (`initial={false}` nas
                  restauradas do cache/seed antigo — elas montam completas e
                  estáticas); o exit é o mesmo fadeInUp (remontagem por
                  pré-requisito / re-place do seed). O separador de dia anima
                  JUNTO com a bolha (mesmo wrapper — decisão visual: o dia
                  novo "entra" com a primeira mensagem dele). */}
              <AnimatePresence initial={false}>
                {chat.history.map((m, i) => {
                  // Separador de dia centralizado quando a data MUDOU em
                  // relação à bolha anterior ("Hoje"/"Ontem"/data completa —
                  // decisões documentadas em chatDaySeparator).
                  const prev = i > 0 ? chat.history[i - 1] : undefined;
                  const daySep = chatDaySeparator(m.ts, prev?.ts, i18n.language ?? 'pt-BR');
                  // Só mensagens NOVAS da sessão digitam E animam (cache/seed
                  // antigo → completas e instantâneas).
                  const isNew = newMessageIndicesRef.current.has(i);
                  return (
                    <motion.div
                      key={i}
                      variants={fadeInUp}
                      initial={isNew ? 'hidden' : false}
                      animate="visible"
                      exit="hidden"
                      // FIX de tipagem motion 13: a transição NUNCA vai dentro
                      // do alvo/variante (quebra o tipo sob TS strict) — o
                      // spring entra pelo PROP (ver animationTokens.ts).
                      transition={springs.gentle}
                    >
                      {daySep ? (
                        <Box sx={{ textAlign: 'center', mt: 0.5 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {daySep.kind === 'today'
                              ? t('translation:lesson.dayToday')
                              : daySep.kind === 'yesterday'
                                ? t('translation:lesson.dayYesterday')
                                : daySep.label}
                          </Typography>
                        </Box>
                      ) : null}
                      <ChatBubble
                        message={m}
                        isNew={isNew}
                        // ONDA2-QUIZ-OVERLAY: a bolha anterior. Sem ela o
                        // agrupamento de mensagens consecutivas que a onda do
                        // chat entregou fica INERTE (o prop é opcional e, sem
                        // ele, `groupsWithPrevious` devolve false sempre) — e
                        // a mesma variável já alimenta o separador de dia.
                        previous={prev}
                        // ONDA1-NAV-UI (tps): a REVIEW do desafio DIGITA a 10
                        // tokens/s (~40 chars/s — pedido do dono: "velocidade
                        // de tokens por segundo seja de 10 ao escrever em IA
                        // online (os desafios que já fizemos)"). ONDA2-CHAT-
                        // NINTENDO: a review de ERRO (com errorFor) é
                        // INSTANTÂNEA na ChatBubble (prop `instant` do
                        // TypewriterText) — o tps nem chega a ser usado; a de
                        // APROVAÇÃO (sem errorFor) continua a 10 tps.
                        //
                        // ONDA10 (bug 3): a escolha do tps saiu do JSX para
                        // `chatBubbleTps` (PURA, testada): TEORIA da aula →
                        // 7 tps = 28 chars/s (velocidade de LEITURA — a conta
                        // está em TYPEWRITER_TPS); review → 10; resposta do
                        // tutor a uma dúvida ('reply') e demais bolhas → 100,
                        // o "livre" de sempre. Nada mudou em bloco: o default
                        // GLOBAL do TypewriterText continua 100.
                        tps={chatBubbleTps(chat.history, i)}
                        // ONDA10: clique/tecla/"Mostrar tudo" completam a
                        // bolha que está digitando AGORA.
                        skip={skipTyping}
                        onRegenerate={m.kind === 'review' ? handleRegenerateFromBubble : undefined}
                        // ONDA3 (generate-flow): o gating agora também cobre o
                        // processo GLOBAL em voo (o modal pode estar rodando
                        // mesmo se esta view montou depois do disparo).
                        regenerateDisabled={busy || generateRunning}
                        onStreamStart={() => handleStreamStart(i)}
                        onStreamDone={() => handleStreamDone(i)}
                        onStreamTick={handleStreamTick}
                      />
                      {/* ONDA4 (quiz): o card do quiz da(s) assertion(s) que
                          esta bolha APRESENTOU (sectionId == seção da bolha) —
                          aparece DEPOIS da bolha e só quando a digitação
                          terminou (a bolha "apresentada" = texto completo).
                          Respondido → o card FICA preenchido (feedback
                          verde/vermelho, opções travadas — reforço, não
                          gate).

                          ONDA1-MAESTRIA (fix): a chave do estado NÃO é mais
                          calculada aqui. Ela vem de `visibleQuizFor` (que a
                          deriva por `quizKeyFor`) — a MESMA fonte que
                          `pendingQuizzes`/`pendingQuizzesForCurrentSection`
                          usam no gate. Quando a view calculava a chave inline
                          (`sectionId` sozinha) ela ESCREVIA numa chave e o
                          gate LIA de outra: responder certo não liberava nada
                          e o "Próximo" travava para sempre. Além da chave,
                          `visibleQuizFor` devolve a assertion da GERAÇÃO
                          corrente (a remediadora, quando existe) e o estado
                          do quiz — o card renderiza e submete sempre o mesmo
                          par (chave, assertion). */}
                      {streamingIds.has(i)
                        ? null
                        : (quizzesByIndex.get(i) ?? []).map((assertion) => {
                            const visible = visibleQuizFor(chat, assertion);
                            const inScene =
                              activeQuizCard !== null && activeQuizCard.visible.key === visible.key;
                            // DOMINADO: o card CHEIO fica na conversa, com o
                            // veredito e as opções travadas — é o registro do
                            // que o aluno demonstrou, e o único card inline
                            // que ainda desenha alternativas.
                            if (visible.step.kind === 'dominado') {
                              return (
                                <LessonQuizCard
                                  key={visible.assertion.id}
                                  assertion={visible.assertion}
                                  quiz={visible.quiz}
                                  onSelect={(answerIndex) =>
                                    handleQuizAnswer(
                                      { original: assertion, visible, anchorIndex: i },
                                      answerIndex,
                                    )
                                  }
                                />
                              );
                            }
                            // PENDENTE: o lugar do quiz na conversa. Ele é o
                            // destino do "minimizar" e a porta de volta para o
                            // overlay — responder acontece SOBRE A TELA, num
                            // card só, nunca em dois ao mesmo tempo.
                            return (
                              // <div> cru (e não Box): ele não pinta nada, só
                              // carrega o ref do card EM CENA para o efeito
                              // que o traz à vista. Bloco simples preserva a
                              // largura que o card já resolvia sozinho.
                              <div
                                key={visible.assertion.id}
                                ref={inScene ? quizCardElRef : null}
                              >
                                <QuizChatCard
                                  quizKey={visible.key}
                                  status={inScene ? activeQuizStatus : 'aguardando'}
                                  onScreen={inScene && quizOverlay.phase === 'sobre-a-tela'}
                                  question={visible.assertion.question}
                                  generation={visible.generation}
                                  notice={inScene ? activeNoticeText : null}
                                  onOpen={() => handleQuizReopen(visible.key)}
                                  onRetry={
                                    inScene && activeQuizStatus === 'indisponivel'
                                      ? handleQuizRetry
                                      : null
                                  }
                                  onReopen={
                                    inScene && activeQuizStatus === 'indisponivel'
                                      ? handleQuizReopenGeneration
                                      : null
                                  }
                                />
                              </div>
                            );
                          })}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {/* ONDA2-IMESSAGE: indicador "digitando" ANIMADO — montado SÓ
                  enquanto a digitação está ativa (turno 'answer' aguardando a
                  LLM OU alguma bolha digitando); sai do DOM ao terminar
                  (mount condicional — os e2e nunca casam texto oculto). */}
              {busy && pendingAction === 'answer' || streamingIds.size > 0 ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TypingIndicator />
                  {/* ONDA10 (bug 3): saída EXPLÍCITA e acessível da animação
                      — o clique no painel e qualquer tecla fazem o mesmo, mas
                      só um botão de verdade aparece para leitor de tela e
                      navegação por teclado. Some junto com o indicador. */}
                  {typingNow ? (
                    <Button size="small" variant="text" onClick={requestSkipTyping}>
                      {t('translation:lesson.skipTypingButton')}
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </>
          )}
          </Box>

          {/* ONDA1-UX (pedido do dono — "não quero aqueles desafios ali"): a
              lista de desafios SAIU da região de scroll (ficava entre a
              última bolha e o input, empurrando o fluxo e ficando recortada
              com conteúdo alto). Agora vive no POPOVER do botão "Desafios"
              do cabeçalho da aula (no sidebar do shell desde a
              ONDA-AULA-NO-SIDEBAR); entre o chat e o input NÃO há nenhum
              elemento de lista de desafios. */}
        </Box>

        {/* ONDA11: os avisos NÃO declaram mais largura própria — eles são
            filhos da coluna e a preenchem. Declarar `mx: 'auto'` aqui seria
            escrever CSS que o Stack apaga (ver LESSON_COLUMN_SX). */}
        {chat.lastError ? (
          <Alert severity="warning" onClose={() => setChat((s) => ({ ...s, lastError: null }))}>
            {chat.lastError}
          </Alert>
        ) : null}

        {/* ONDA2-QUIZ-OVERLAY: o aviso de CANAL do quiz quando não há mais card
            em cena para carregá-lo (o caso típico é a resposta CERTA que fechou
            a afirmação e o registro que não chegou ao banco). `info`, não
            `warning`: §8 item 3 — falhar é estado de DIAGNÓSTICO, com redação
            informativa, nunca repreensão. */}
        {quizNoticeText !== null && activeNotice === null ? (
          <Alert severity="info" onClose={() => setQuizNotice(null)}>
            {quizNoticeText}
          </Alert>
        ) : null}

        {/* ONDA2 (error-flow, A5): mic — o indicador de transcrição é
            acessível (aria-live) e o erro do engine (hook, sem dismiss)
            aparece como Alert pequeno; o botão permanece reabilitado. */}
        {mic.transcribing ? (
          <Typography
            variant="caption"
           
            aria-live="polite"
            sx={{ color: 'text.secondary', fontStyle: 'italic' }}
          >
            {tI('lesson.micRecording')} — {mic.partial || '…'}
          </Typography>
        ) : null}
        {mic.error ? (
          <Alert severity="error" sx={{ py: 0.5 }}>{mic.error}</Alert>
        ) : null}

        {/* ONDA11 — a LINHA DE AÇÃO, no molde da referência de chat: o
            anúncio CENTRALIZADO seguido do botão CTA. Ela saiu de dentro da
            barra de entrada por dois motivos: (a) na referência a entrada é só
            mic + campo + enviar, e (b) "Próximo"/"Concluir aula" roubavam
            largura do campo, que era metade da queixa do dono.

            ONDA14: o corpo dela virou `LessonActionRow` — componente de
            APRESENTAÇÃO exportado, dirigido pelo passo PURO `lessonActionStep`
            (o porquê está no cabeçalho daquela seção). O que a VIEW decide
            aqui é só o que depende de estado e de IPC: revelar a digitação,
            avançar a teoria, concluir, ir ao desafio (MESMO destino do botão
            "Desafios" do cabeçalho da aula, no sidebar) e seguir para a
            próxima aula. */}
        <LessonActionRow
          step={actionStep}
          busy={busy}
          generateRunning={generateRunning}
          quizCardOnScreen={pendingQuizCards.length > 0}
          pendingQuizCount={quizPendingAll.length}
          pendingChallengeCount={pendingChallengeCount}
          onNext={handleNextClick}
          onFinish={() => void finishLesson()}
          onChallenge={handleChallengeStep}
          onNextLesson={() => void handleGoToNextLesson()}
          onRegenerate={() => void handleRegenerateFromBubble()}
        />

        {/* ONDA11 — a BARRA DE ENTRADA no molde da referência: mic FORA à
            esquerda, campo pílula ocupando o resto da linha, enviar DENTRO na
            borda direita. Ela é o último filho da coluna e a preenche inteira:
            o eixo de ESCRITA é, agora, literalmente o mesmo objeto de estilo
            do eixo de LEITURA (o container). */}
        <LessonComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={() => void sendAnswer()}
          onMicToggle={() => void handleMicToggle()}
          micTranscribing={mic.transcribing}
          disabled={busy}
        />
      </Stack>

      {/* ONDA-AULA-NO-SIDEBAR — O CABEÇALHO DE CADA AULA MORA NO SIDEBAR.
          O dono, sobre o sidebar estilo VSCode, verbatim: "ele foi feito
          errado porque a informação dele nunca muda, seu objetivo era
          pegar o header tag content de cada aula e mover para essa região".
          Título, resumo, progresso da teoria, Desafios/Fontes e
          pré-requisitos saíram da coluna (onde eram o `<header>` do
          CollapsibleLessonHeader, aposentado) e são PUBLICADOS no slot do
          sidebar do shell por `<ShellSidebarPortal>`
          (src/components/shell/ShellSidebarSlot.tsx), como o
          LessonSidebarHeader. O que isso garante, peça por peça:
            · a view continua DONA — o portal muda só ONDE o DOM é pintado.
              Estado e handlers seguem daqui: o popover de Desafios (abaixo)
              ancora no botão que está no sidebar, o diálogo de Fontes abre
              daqui, os chips de pré-requisito chamam `openPrerequisite`, e
              os eventos sintéticos borbulham pela árvore REACT desta view,
              não pela DOM do sidebar;
            · cada aula publica o SEU cabeçalho: trocar de aula (chip de
              pré-requisito, "Avançar para a próxima aula") passa pelo estado
              de carregando — que retorna ANTES deste return e não publica
              nada — e a aula nova publica o dela. Sem `key`: o componente
              não tem estado (o colapso morreu com o componente antigo);
            · a limpeza é de graça: o shell monta SÓ a view ativa, então sair
              da aba Aula desmonta a view e o React tira o conteúdo do slot
              sozinho (o `:empty` do SessionFrame o tira do layout). Aula
              vazia, carregando ou com erro → slot vazio, nunca conteúdo
              velho;
            · POSIÇÃO: irmão DEPOIS do Stack da coluna, junto do Dialog e do
              Popover (as superfícies fora do fluxo) — nunca o 1º filho da
              raiz (é o Stack da coluna, o do useFlexGap) nem dentro dela (a
              coluna é só a conversa: log, avisos, ação e entrada);
            · `<section aria-labelledby>`, nunca `<header>`: o slot mora
              dentro do AppBar, fora do `main`, e ali um `<header>` viraria um
              SEGUNDO landmark banner. */}
      <ShellSidebarPortal>
        <LessonSidebarHeader
          title={lesson.title}
          summary={lesson.summary}
          challengeCount={lesson.challenges.length}
          pendingChallengeCount={pendingChallengeCount}
          challengesExpanded={challengesOpen && challengesFrom === 'cabecalho'}
          onChallengesClick={(anchor) => {
            /* ONDA14: o popover tem DOIS disparadores (este e o CTA da linha
               de ação) — `challengesFrom` guarda de onde veio para o
               aria-expanded de cada botão descrever SÓ o que ele abriu e para
               a lista crescer na direção certa (ver o Popover abaixo). */
            setChallengesFrom('cabecalho');
            setChallengesAnchorEl(anchor);
          }}
          onSourcesClick={() => setSourcesOpen(true)}
          theoryProgress={theoryProgress}
          sectionCurrent={chat.presentedSections.length}
          sectionTotal={lesson.theory.length}
          prerequisites={lesson.prerequisites}
          onPrerequisiteClick={openPrerequisite}
        />
      </ShellSidebarPortal>

      {/* Fontes: NUNCA no fluxo — botão "Fontes" abre este diálogo. */}
      <Dialog open={sourcesOpen} onClose={() => setSourcesOpen(false)} aria-labelledby="lesson-sources-title" maxWidth="sm" fullWidth>
        <DialogTitle id="lesson-sources-title">{t('translation:lesson.sourcesTitle')}</DialogTitle>
        <DialogContent dividers>
          {lesson.sources.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('translation:lesson.sourcesEmpty')}
            </Typography>
          ) : (
            <List dense>
              {lesson.sources.map((s, i) => (
                <ListItem key={i} disableGutters>
                  <ListItemText
                    primary={
                      <Link href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </Link>
                    }
                    secondary={s.description}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>

      {/* ONDA1-UX (pedido do dono): DESAFIOS fora do fluxo — o botão
          "Desafios" do cabeçalho da aula (no sidebar, publicado pelo portal
          acima) abre este POPOVER com a lista completa (anchor no botão;
          fecha ao clicar fora/Esc — padrão MUI). Item clicável → MESMO
          openChallenge do fluxo track (nav intacta).
          ONDA-AULA-NO-SIDEBAR — A DIREÇÃO DO RAMO 'cabecalho'. Com o botão no
          canto direito da coluna da aula, a lista crescia para a ESQUERDA
          (âncora bottom/right + transform top/right) e caía sobre a
          conversa. Com o botão na coluna ESQUERDA do shell, a mesma origem
          jogaria a lista sobre o rail (104px) e o próprio sidebar, grudada na
          borda da janela. Agora ela se prende pelo canto superior ESQUERDO ao
          canto superior DIREITO do botão (âncora top/right + transform
          top/left): cresce para a direita e para baixo, sobre o main, colada
          em quem a chamou. O ramo 'acao' (o CTA da linha de ação, no rodapé)
          não mudou: abre para CIMA, centrado no botão. */}
      <Popover
        open={challengesOpen}
        anchorEl={challengesAnchorEl}
        onClose={() => setChallengesAnchorEl(null)}
        anchorOrigin={
          challengesFrom === 'acao'
            ? { vertical: 'top', horizontal: 'center' }
            : { vertical: 'top', horizontal: 'right' }
        }
        transformOrigin={
          challengesFrom === 'acao'
            ? { vertical: 'bottom', horizontal: 'center' }
            : { vertical: 'top', horizontal: 'left' }
        }
        slotProps={{
          paper: {
            // ONDA3-UX-FIX (revisor): o papel CLIPA no raio do tema (14px) —
            // sem `overflow: hidden` aqui, o scroll do Box interno pintaria o
            // conteúdo por cima da curva da borda (o Paper não clipa por
            // padrão). O scroll em si vive no Box (maxHeight + overflowY).
            sx: { overflow: 'hidden' },
          },
        }}
      >
        {/* maxHeight/overflowY: a lista cresce sem limite (novos desafios
            no topo) — em janela baixa o conteúdo rolável impede cards
            inacessíveis fora da viewport. min(60vh, 420px) evita cobrir a
            tela toda em monitores pequenos. */}
        <Box sx={{ p: 1.5, minWidth: 300, maxWidth: 420, maxHeight: 'min(60vh, 420px)', overflowY: 'auto' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {t('translation:lesson.challengesTitle')}
          </Typography>
          {/* ONDA 15 — O BLOQUEIO DIZ O MOTIVO.
              `openChallenge` recusa enquanto houver quiz sem acerto
              (`challengeOpenBlockedByQuiz`), e um card que não faz nada quando
              clicado é o "botão morto e mudo" que esta base proíbe desde a
              onda 10. A explicação vem ANTES da lista, visível, com
              `role="status"` + `aria-live` — o mesmo desenho da linha de ação,
              porque o `disabled` mata o hover e portanto mata o Tooltip. */}
          {challengeOpenBlockedByQuiz(finishBlock) ? (
            <Typography
              role="status"
              aria-live="polite"
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
            >
              {tI('lesson.challengeGateQuiz', { n: quizPendingAll.length })}
            </Typography>
          ) : null}
          <List dense role="list" aria-label={tI('lesson.challengesListAria')}>
            {lesson.challenges.map((ch) => (
              <ListItem
                key={ch.slug}
                component="button"
                disabled={challengeOpenBlockedByQuiz(finishBlock)}
                onClick={() => {
                  setChallengesAnchorEl(null);
                  openChallenge(ch);
                }}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 0.5,
                  cursor: challengeOpenBlockedByQuiz(finishBlock) ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {ch.title}
                      </Typography>
                      <Chip size="small" variant="outlined" label={tI('lesson.difficulty', { n: ch.difficulty })} />
                      {ch.generated ? <Chip size="small" color="secondary" label={t('translation:lesson.generatedBadge')} /> : null}
                    </Stack>
                  }
                  secondary={
                    ch.lastVerdict === 'passed' ? (
                      tI('lesson.challengePassed', { stars: ch.stars })
                    ) : ch.failedCount > 0 ? (
                      tI('lesson.challengeFailedCount', { n: ch.failedCount })
                    ) : (
                      t('translation:lesson.challengeUntried')
                    )
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </Popover>
    </Box>
  );
}
