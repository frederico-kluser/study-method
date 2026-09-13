/**
 * src/components/quiz/QuizChatCard.tsx — o CONVITE do quiz, dentro da conversa.
 *
 * ─── ONDA11: ele deixou de ser um balão e virou o ANÚNCIO + o BOTÃO ───────
 * O pedido do dono, literal: *"tinha o texto sendo escrito, eu cliquei, e
 * depois renderizou o texto e já abriu o modal com o quiz, quero um botão de
 * abrir quiz pro usuário acionar o modal manualmente"*. O modal parou de subir
 * sozinho (`quizOverlayState.applyQuizOverlayStep`), então TODO o caminho para
 * o quiz passa por aqui: se este card não convidar com clareza, o quiz some.
 *
 * A referência que o dono mandou (chat do Nintendo Switch Online) resolve
 * exatamente este objeto: o anúncio do sistema é TEXTO CENTRALIZADO EM NEGRITO
 * seguido de um BOTÃO CTA GRANDE E PREENCHIDO ("JOIN GAME") — não é um balão
 * de conversa, porque não é fala de ninguém; é um evento com uma ação. Por
 * isso este card:
 *
 *   - NÃO usa mais `bubbleShellStyle(theme,'reply')`. Aquela casca é a do
 *     balão do TUTOR: borda de 2px no acento `study` (roxo) mais sombra
 *     colorida. Sobre um anúncio ela virava CHROME roxo, e o roxo grosso é o
 *     que o dono apontou como destoante;
 *   - NÃO tem acento de marca nenhum. A onda 11 tinha guardado um papel para o
 *     roxo `study` — o ícone que significa "quiz" —, e a prova visual desta
 *     onda mostrou por que nem esse sobrevive: era o ÚNICO roxo da tela,
 *     aparecia em todo card e brigava com o coral do CTA logo abaixo. O ícone
 *     virou TINTA (ver a medição no JSX). Cor, aqui, só a do VEREDITO;
 *   - dá ao aluno UM alvo óbvio: `contained`, alto (>= 44px de alvo, §8.1) e
 *     com nome acessível próprio (o rótulo genérico "Responder" repetido em
 *     três cards seria indistinguível no leitor de tela — o `aria-label`
 *     carrega a pergunta junto).
 *
 * ─── A REDAÇÃO (docs/ux-redesign.md §8 item 3 e §8.2) ─────────────────────
 * Errar aqui é DIAGNÓSTICO, nunca repreensão: "sem punição. Nada de vermelho
 * piscando, nada de som triste. O painel troca para estado de diagnóstico…
 * redação informativa". Por isso o estado de erro NÃO pinta o card de
 * `error.main`: ele descreve o que está acontecendo ("escrevendo onde essa
 * alternativa se separa do que a seção mostra") e o que vem a seguir. E não
 * existe "Parabéns!" no acerto (§8.2, d = −0,40): o card diz o que ficou
 * demonstrado, que é o feedback informacional específico (d = +0,43).
 *
 * ─── POR QUE ELE EXISTE MESMO QUANDO O QUIZ ESTÁ SOBRE A TELA ─────────────
 * O card ocupa o lugar nos DOIS estados ('sobre-a-tela' e
 * 'minimizado-no-chat'). Se ele só aparecesse ao minimizar, a conversa
 * GANHARIA um bloco de altura no momento exato em que o overlay sai — o texto
 * abaixo pularia, e o auto-scroll da LessonView (que só puxa quando o usuário
 * está no fim) leria isso como conteúdo novo. Com o lugar reservado desde o
 * começo, abrir e fechar o modal não mexe uma linha da conversa.
 *
 * ─── ONDA4-SAÍDA-DO-CICLO: o card TRAVADO ganha uma segunda saída ─────────
 * Com a IA fora do ar o ciclo PARA: sem quiz remediador não há o que
 * responder, e o gate de maestria só abre com acerto — o aluno ficava sem
 * saída nenhuma (medido em tests/e2e/e2e-quiz.spec.ts, teste 5). Agora o card
 * oferece DUAS coisas, e elas são diferentes:
 *
 *   - `onRetry`  ("Pedir de novo")  → repete o pedido à IA. Depende dela.
 *   - `onReopen` ("Responder esta pergunta de novo") → reabre a pergunta que
 *     já está ali para uma tentativa nova (`reopenStalledQuiz`). NÃO depende
 *     da IA, e NÃO dispensa o gate: continua sendo preciso ACERTAR, e a
 *     tentativa nova CONTA no histórico.
 *
 * Os dois só existem enquanto o ciclo está travado — `onReopen` chega `null`
 * em qualquer outro estado, porque um botão de reabrir sempre disponível seria
 * um botão de pular o quiz.
 *
 * a11y (§8.1, normativo): a linha de estado é `role="status"` (o veredito e o
 * andamento chegam ao leitor de tela sem depender de cor nem de movimento) e
 * todo botão é um `Button` de verdade, com rótulo próprio. O container raiz
 * carrega `QUIZ_CARD_ANCHOR_ATTR`: é ele — e não o CTA, que desmonta — o alvo
 * de volta do foco quando o modal sai (SC 2.4.3; ver o comentário no JSX).
 * `alpha()` do MUI continua PROIBIDO (lança com CSS var — MUI #9) e nenhuma cor
 * crua nasce aqui (nem hex, nem `rgb()`, nem `hsl()`).
 */
import { useTranslation } from 'react-i18next';
import { Button, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QuizIcon from '@mui/icons-material/Quiz';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { motion } from 'motion/react';
import { useMemo, type ReactElement } from 'react';

import { springs } from '../../lib/animationTokens';
import { QUIZ_CARD_ANCHOR_ATTR, type QuizOverlayStatus } from './quizOverlayContent';

export interface QuizChatCardProps {
  /**
   * A chave CANÔNICA do quiz — o valor da âncora de devolução de foco
   * (ONDA 13). Ela endereça ESTE card: com mais de um quiz pendente na
   * conversa, o host precisa achar o card que o aluno fechou, não o primeiro
   * da lista.
   */
  quizKey: string;
  /** ponto do ciclo, no vocabulário da tela (`overlayStatusFor`). */
  status: QuizOverlayStatus;
  /** true quando o card está AGORA sobre a tela (o overlay o está desenhando). */
  onScreen: boolean;
  /** a pergunta da geração corrente — a identidade visível do card. */
  question: string;
  /** geração corrente (0 = o quiz autoral da trilha). */
  generation: number;
  /** aviso informativo do canal (fail-closed), já traduzido. null = nada a dizer. */
  notice: string | null;
  /** abrir o quiz sobre a tela — o gesto que a ONDA11 tornou o ÚNICO caminho. */
  onOpen: () => void;
  /** repetir o pedido que falhou; null quando não há nada a repetir. */
  onRetry: (() => void) | null;
  /**
   * ONDA4-SAÍDA-DO-CICLO: responder de novo a MESMA pergunta. `null` quando o
   * ciclo NÃO está travado por indisponibilidade — ver o cabeçalho.
   */
  onReopen: (() => void) | null;
}

export function QuizChatCard({
  quizKey,
  status,
  onScreen,
  question,
  generation,
  notice,
  onOpen,
  onRetry,
  onReopen,
}: QuizChatCardProps): ReactElement {
  const { t } = useTranslation();
  // Cast de interpolação da casa (`t` tipado por chave literal não aceita
  // `options` sem ele) — mesmo padrão da LessonView e do LessonQuizCard.
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );

  // A linha de estado: o que está acontecendo com ESTE quiz, agora.
  // ONDA16-CICLO-CARGA: o estado 'aguardando-vez' é novo e HONESTO — o ciclo
  // quer rodar, mas um turno do tutor está em voo e o motor espera (a fila
  // FIFO do LLM local estourava o timeout do renderer). Dizer "explicando"/
  // "gerando" ali seria anunciar um trabalho que ainda nem foi pedido.
  const statusText = onScreen
    ? t('translation:lesson.quizChatOnScreen')
    : status === 'aguardando-vez'
      ? t('translation:lesson.quizChatQueued')
      : status === 'explicando'
      ? t('translation:lesson.quizChatExplaining')
      : status === 'gerando'
        ? t('translation:lesson.quizChatGenerating')
        : status === 'indisponivel'
          ? t('translation:lesson.quizChatUnavailable')
          : status === 'dominado'
            ? t('translation:lesson.quizChatMastered')
            : t('translation:lesson.quizChatWaiting');

  // O ciclo em ANDAMENTO (explicando/gerando) não tem botão: não há nada que o
  // clique do aluno adiante, e um botão morto é pior que nenhum botão. Um quiz
  // DOMINADO também não aparece aqui — a LessonView troca o card compacto pelo
  // card cheio (com o veredito) assim que a afirmação fecha.
  const canOpen = !onScreen && status === 'aguardando';

  // ONDA12-FOCO: a ÂNCORA de devolução de foco. O CTA lá embaixo é desmontado
  // enquanto o modal está na tela, então ele não pode ser o alvo do retorno;
  // este container fica, e o CTA renasce DENTRO dele. O host procura por
  // `closest(QUIZ_CARD_ANCHOR_SELECTOR)` e devolve o foco ao primeiro focável
  // daqui. Objeto separado (e não atributo literal no JSX) de propósito: assim
  // o nome do atributo vem da MESMA constante que o host consome.
  const anchorProp = { [QUIZ_CARD_ANCHOR_ATTR]: quizKey };

  return (
    <motion.div
      {...anchorProp}
      style={{
        width: '100%',
        marginTop: 16,
        marginBottom: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        {/* ONDA12-ROXO: este ícone era o ÚLTIMO roxo da tela. `secondary` é o
            slot que o tema aponta para a família `study` (src/theme.ts,
            `cartridgePalette`), e `secondary.main` é `study.fill` — #a45be4 no
            escuro, exatamente o rgb(164,91,228) que a varredura do DOM achou em
            7 nós. Ele aparecia em TODO card de quiz, ao lado do coral do CTA
            (`primary` = `action`), e essa era a única briga de matiz da tela.
            Agora o ícone é TINTA, como o rótulo que ele acompanha: os dois
            passam a ler como uma etiqueta só. Medido contra o nível 0 (o fundo
            do app, que é onde a conversa mora desde que o painel ficou
            transparente): escuro #adadad sobre #0e0e0e = 8,60:1 · claro #544e45
            sobre #faf7f2 = 7,70:1 — muito acima do piso de 3:1 do SC 1.4.11.
            O check do estado DOMINADO fica: verde ali não é decoração de marca,
            é o veredito, e ele é acompanhado do texto de `role="status"`
            (escuro #218f58 = 4,72:1 · claro #1f8653 = 4,28:1 sobre o nível 0). */}
        {status === 'dominado' ? (
          <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
        ) : (
          <QuizIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        )}
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1 }}>
          {t('translation:lesson.quizTitle')}
        </Typography>
        {generation > 0 ? (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {tI('lesson.quizAttemptLabel', { n: generation + 1 })}
          </Typography>
        ) : null}
      </Stack>

      {/* O ANÚNCIO: negrito, centralizado — o papel do "gamesdean started a
          race in Mario Kart 8!" da referência. */}
      <Typography variant="body1" sx={{ fontWeight: 700, textAlign: 'center', maxWidth: 560 }}>
        {question}
      </Typography>

      {/* SC 4.1.3: o andamento e o veredito chegam por texto, nunca só por
          cor ou por movimento. */}
      <Typography
        role="status"
        variant="caption"
       
        sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 560 }}
      >
        {statusText}
      </Typography>

      {notice ? (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start', maxWidth: 560 }}>
          <InfoOutlinedIcon fontSize="small" sx={{ color: 'info.main', flexShrink: 0, mt: 0.125 }} />
          <Typography role="status" variant="caption" sx={{ color: 'text.secondary' }}>
            {notice}
          </Typography>
        </Stack>
      ) : null}

      {canOpen ? (
        // O CTA. `whileTap`/`whileHover` são nível `spatial` (só transform) —
        // cor e opacidade nunca entram no overshoot (§5).
        <motion.span
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={springs.snappy}
          // O `motion` marca `tabIndex=0` em quem tem gesto — o que criaria uma
          // PARADA DE TAB extra na frente do próprio botão. O elemento animado
          // é uma casca: quem recebe foco é o Button.
          tabIndex={-1}
          style={{ display: 'inline-block' }}
        >
          <Button
            variant="contained"
            size="large"
            onClick={onOpen}
            // Três cards de quiz na mesma conversa teriam três botões de nome
            // "Responder": o leitor de tela não saberia qual é qual. A
            // pergunta entra no nome acessível (composta de textos que já
            // existem — nenhuma chave i18n nova).
            aria-label={`${t('translation:lesson.quizChatAnswer')}: ${question}`}
            sx={{ minHeight: 48, px: 4, mt: 0.5 }}
          >
            {t('translation:lesson.quizChatAnswer')}
          </Button>
        </motion.span>
      ) : null}

      {onRetry || onReopen ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, justifyContent: 'center' }}>
          {onRetry ? (
            <motion.span
              whileTap={{ scale: 0.98 }}
              transition={springs.snappy}
              tabIndex={-1}
              style={{ display: 'inline-block' }}
            >
              <Button size="small" variant="text" onClick={onRetry} startIcon={<ReplayIcon />}>
                {t('translation:lesson.quizChatRetry')}
              </Button>
            </motion.span>
          ) : null}
          {/* ONDA4-SAÍDA-DO-CICLO: a segunda saída, e a que não depende da
              IA — responder de novo a MESMA pergunta. `outlined` (e não
              `text`, como o "Pedir de novo") porque é ela que devolve o
              gesto ao aluno quando o pedido à IA não tem mais o que
              entregar. A redação é informacional: diz o que o clique faz,
              sem prometer nada e sem cobrar nada (§8 item 3 / §8.2). */}
          {onReopen ? (
            <motion.span
              whileTap={{ scale: 0.98 }}
              transition={springs.snappy}
              tabIndex={-1}
              style={{ display: 'inline-block' }}
            >
              <Button size="small" variant="outlined" onClick={onReopen} startIcon={<RestartAltIcon />}>
                {t('translation:lesson.quizChatReopen')}
              </Button>
            </motion.span>
          ) : null}
        </Stack>
      ) : null}
    </motion.div>
  );
}
