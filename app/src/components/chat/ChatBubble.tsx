/**
 * src/components/chat/ChatBubble.tsx — a bolha de mensagem do chat da aula.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ONDA11 — o chat na REFERÊNCIA que o dono mandou
 * ════════════════════════════════════════════════════════════════════════════
 * A referência (`~/Imagens/…Switch Online Mock 2.png`) é uma COLUNA ÚNICA:
 * balão recebido à esquerda em cinza neutro, balão enviado à direita em acento
 * lavado, raio uniforme, nada de avatar boiando ao lado das bolhas e um
 * carimbo de hora pequeno FORA do peso visual. O que estava na tela tinha três
 * defeitos contra isso — os três fotografados pelo dono:
 *
 *  1. O AVATAR flutuava colado à borda esquerda do painel, numa coluna própria
 *     ao lado do balão (e um espaçador invisível da mesma largura nas bolhas
 *     agrupadas). Agora ele vive na LINHA DE CABEÇALHO do grupo, ao lado do
 *     nome e da hora, e o balão começa na borda da coluna como na referência.
 *     A cauda do raio morreu junto (ela apontava para esse avatar) — ver
 *     `bubbleRadius` em chatSurfaces.tsx.
 *  2. A HORA morava DENTRO do balão, alinhada à direita, empurrando o texto e
 *     obrigando a truques de opacidade para não reprovar contraste sobre o
 *     acento cheio. Ela subiu para o cabeçalho.
 *
 * ─── ONDA12: A OPACIDADE 0,8 DA HORA MORREU (era a mentira do cabeçalho) ───
 * A hora era `text.secondary` COM `opacity: 0.8`, e este cabeçalho afirmava
 * duas vezes "7,12:1 no claro / 6,63:1 no escuro". Os dois números eram do
 * token PURO, sobre um painel (nível 2) que também deixou de existir — a
 * revisão mediu o que a tela DE FATO emitia, `text.secondary` a 80% sobre o
 * nível 2 do claro: #746e65 = 4,37:1, ABAIXO do piso AA de 4,5:1. Um caption
 * de 14px (a escala desta base) reprovando SC 1.4.3 enquanto o comentário
 * jurava AAA.
 *
 * O conserto não foi calibrar a opacidade: foi TIRÁ-LA. Opacidade sobre texto
 * cria uma cor que nenhum token nomeia, que nenhum teste consegue ler do tema e
 * que muda sozinha quando o fundo muda — foi exatamente assim que este defeito
 * atravessou uma onda inteira. A hierarquia do cabeçalho passa a vir dos DOIS
 * tokens de tinta que o tema já tem: o NOME (a atribuição, o que carrega
 * sentido) em `text.primary`, a HORA em `text.secondary`. Contra o nível 0 — o
 * fundo do app, agora que a caixa da conversa é transparente:
 *   nome  16,75:1 no claro · 16,94:1 no escuro
 *   hora   7,70:1 no claro ·  8,60:1 no escuro   (AAA nos quatro)
 * Medido dos tokens em tests/chatBubbleSurface.test.ts, que mistura a cor
 * COMPOSTA em vez de reler a constante.
 *  3. A COR. Balão do aluno era o acento CHEIO; balão da `reply` (e o card do
 *     quiz, que usa a mesma casca) tinha borda e sombra ROXAS. Virou tint
 *     medido na referência e superfície de leitura pura — a conta está no
 *     cabeçalho de chatSurfaces.tsx.
 *
 * ─── MOVIMENTO: CAMINHO SEM OVERSHOOT ─────────────────────────────────────
 * `prefers-reduced-motion: reduce` desliga o deslocamento do hover da review
 * (`springs.snappy` tem ζ ≈ 0,77, ou seja ~2% de overshoot) e o brilho de
 * aprovação. Sob redução de movimento o balão não translada nada: o estado
 * continua legível pela cor de fundo/borda do tom, que não depende de animação.
 *
 * ─── ONDA-LARGURA-LIVRE: O TETO DE 80ch DO BALÃO MORREU ────────────────────
 * O dono, sobre a aula: "o texto da aula, que está dentro de uma limitação de
 * width, não deve ter mais essa limitação — o sidebar define o limite da área
 * de texto simplesmente pelo seu tamanho". O balão era `min(78%, 80ch)`: em
 * janela larga o `ch` vencia, e arrastar a divisória do sidebar não mudava a
 * linha de texto — a teoria da aula, que mora AQUI, ficava presa em 80ch. Agora
 * é `78%` puro, RELATIVO à coluna da aula, que por sua vez preenche o main
 * (LessonView, `LESSON_COLUMN_SX`). Os 22% de folga ficam: são SEMÂNTICA de
 * chat, não medida — é a folga que põe o tutor à esquerda e o aluno à direita.
 * Nada abaixo do balão (TypewriterText → SegmentedMarkdown → MarkdownView /
 * CodeBlock) declara teto absoluto: tudo ali é `max-width: 100%` do próprio
 * contêiner (medido em tests/chatBubbleWidth.test.ts, no CSS que o SSR emite).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FOI PRESERVADO DAS ONDAS ANTERIORES (não regride)
 * ════════════════════════════════════════════════════════════════════════════
 *  - a PROSA é escrita em velocidade de LEITURA (7 tps = 28 chars/s) e o
 *    CÓDIGO é revelado já formatado, linha a linha: `TypewriterText` continua
 *    dono do relógio e `SegmentedMarkdown` do desenho — nenhum dos dois foi
 *    tocado nesta onda;
 *  - PULAR a digitação continua valendo por clique no painel, por qualquer
 *    tecla e pelo botão "Mostrar tudo" (o prop `skip`);
 *  - `instant` na bolha de ERRO de execução (a 10 tps o erro levaria ~55 s);
 *  - o gating do "Gerar novo desafio" é só o turno em voo (`regenerateDisabled`);
 *  - AGRUPAMENTO de mensagens consecutivas (`groupsWithPrevious`): o cabeçalho
 *    só reaparece quando diria algo novo — agora ele é o cabeçalho INTEIRO
 *    (avatar + nome + hora), o que torna o agrupamento ainda mais visível;
 *  - a FOLGA de lado: o balão ocupa no máximo 78% da coluna, como sempre (o
 *    teto de 80ch — `TYPE.measureMaxCh` — que se somava a ele saiu na
 *    ONDA-LARGURA-LIVRE, acima);
 *  - entrada da bolha (fadeInUp) continua no wrapper da LessonView.
 */
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Box, Button, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import type { ReactElement } from 'react';

import { formatChatTime, type TutorChatMessage } from '../../lib/trackLessonState';
import { chatBubbleTone, groupsWithPrevious, isUserTone } from '../../lib/chatBubbleStyle';
import { springs } from '../../lib/animationTokens';
import { TypewriterText } from './TypewriterText';
import { SegmentedMarkdown } from './SegmentedMarkdown';
import { ChatAvatar, bubbleRestShadow, bubbleShellStyle } from './chatSurfaces';

/** Transição do glow de aprovação (uma passada, sem repetição). */
const GLOW_TRANSITION: Transition = { duration: 1.4, times: [0, 0.45, 1], ease: 'easeInOut' };

export interface ChatBubbleProps {
  message: TutorChatMessage;
  /**
   * true quando a mensagem ENTROU nesta sessão (não veio do cache/seed
   * antigo) — o texto é DIGITADO no mount; false → completo instantâneo.
   */
  isNew: boolean;
  /** tokens por segundo do typewriter desta bolha (ver `chatBubbleTps`). */
  tps?: number;
  /** ONDA10: "pular a digitação" (clique no painel, tecla, "Mostrar tudo"). */
  skip?: boolean;
  /**
   * A mensagem ANTERIOR do histórico. Presente → bolhas consecutivas do mesmo
   * autor/tom/minuto se AGRUPAM (sem avatar, nome nem hora repetidos).
   * Ausente → nada agrupa (o comportamento anterior).
   */
  previous?: TutorChatMessage;
  /** ONDA2 (error-flow): "Gerar novo desafio" DENTRO da bolha de review. */
  onRegenerate?: () => void;
  regenerateDisabled?: boolean;
  onStreamStart?: () => void;
  onStreamDone?: () => void;
  onStreamTick?: () => void;
}

export function ChatBubble({
  message,
  isNew,
  tps,
  skip,
  previous,
  onRegenerate,
  regenerateDisabled,
  onStreamStart,
  onStreamDone,
  onStreamTick,
}: ChatBubbleProps): ReactElement {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const lang = i18n.language ?? 'pt-BR';
  const tone = chatBubbleTone(message);
  const isUser = isUserTone(tone);
  const isReview = tone === 'error' || tone === 'approved';
  // Bolha de ERRO = review COM `errorFor` (o seed do `formatErrorBubble`):
  // NUNCA passa pelo typewriter. Review de APROVAÇÃO continua digitando.
  const isErrorReview = tone === 'error';
  const isApprovedReview = tone === 'approved';
  const grouped = groupsWithPrevious(message, previous, lang);
  const authorName = isUser
    ? t('translation:lesson.youName')
    : t('translation:lesson.tutorName');
  const time = formatChatTime(message.ts, lang);

  const shell = bubbleShellStyle(theme, tone, grouped);
  const restShadow = bubbleRestShadow();
  const successFill = theme.vars.palette.success.fill;
  // Sob redução de movimento nada translada nem pulsa (SC 2.3.3): o hover da
  // review perde o deslocamento com overshoot e o brilho de aprovação some.
  const wantsMotion = reduceMotion !== true;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        // Continuação do mesmo autor: metade do respiro do `gap: 1` da lista —
        // o grupo se lê como UM bloco, não como cinco avisos.
        ...(grouped ? { mt: -0.5 } : null),
      }}
    >
      <Box
        sx={{
          // ONDA-LARGURA-LIVRE: 78% da COLUNA e nada mais. O teto de 80ch
          // (`TYPE.measureMaxCh`, que entrava aqui num `min()`) morreu: em
          // janela larga ele vencia e a divisória do sidebar parava de mudar
          // a linha de texto — o contrário do que o dono pediu. Os 78% ficam
          // porque são semântica de chat (a folga distingue os lados), e por
          // serem RELATIVOS escalam com o sidebar. SC 1.4.8 pede um MECANISMO
          // para estreitar a linha: é a própria divisória.
          maxWidth: '78%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        {/* CABEÇALHO DO GRUPO: avatar + quem falou + quando. Some na
            continuação — ele diria o MESMO nome e o MESMO HH:MM da bolha de
            cima, e é exatamente por isso que o grupo existe. Espelhado nas
            bolhas do aluno (`row-reverse`), para o avatar ficar sempre do lado
            de fora da coluna, como na referência.

            AS DUAS TINTAS DO CABEÇALHO, contra o NÍVEL 0 (a caixa da conversa
            morreu: o fundo destas duas linhas é o fundo do app, não mais o
            painel do nível 2): nome em `text.primary` = 16,75:1 no claro e
            16,94:1 no escuro; hora em `text.secondary` = 7,70:1 e 8,60:1. Sem
            `opacity` em nenhuma das duas — a de 0,8 que a hora carregava
            derrubava o composto real para 4,37:1 no claro (abaixo de AA) e
            nenhum teste conseguia enxergá-la. */}
        {grouped ? null : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: isUser ? 'row-reverse' : 'row',
              alignItems: 'center',
              gap: 0.75,
              mb: 0.5,
              px: 0.25,
            }}
          >
            <ChatAvatar isUser={isUser} label={authorName} />
            <Typography variant="caption" sx={{ color: 'text.primary' }}>
              {authorName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {time}
            </Typography>
          </Box>
        )}
        <motion.div
          style={shell}
          // Hover SUTIL só na bolha INTERATIVA (a review tem o botão "Gerar
          // novo desafio"): elevação com spring snappy. `transform` é o nível
          // `spatial` — a cor nunca participa do overshoot (§5). Sob redução
          // de movimento, nenhum deslocamento.
          whileHover={isReview && wantsMotion ? { y: -2 } : undefined}
          // Glow breve na review de APROVAÇÃO — causado por estado REAL
          // (guarda-corpo #1), uma passada, sem repetição e sem confetti. Os
          // keyframes começam e terminam na sombra de REPOUSO (hoje `0 0 0 0
          // transparent`: o balão é chapado), para o balão não ficar com uma
          // sombra pendurada no fim da animação.
          animate={
            isApprovedReview && wantsMotion
              ? {
                  boxShadow: [
                    restShadow,
                    `0 0 16px 2px color-mix(in srgb, ${successFill} 45%, transparent)`,
                    restShadow,
                  ],
                }
              : undefined
          }
          // FIX de tipagem motion 13: a transição vai pelo PROP, nunca dentro
          // do alvo.
          transition={isApprovedReview ? GLOW_TRANSITION : springs.snappy}
        >
          {isUser ? (
            // A mensagem do ALUNO não é markdown — é o que ele digitou, e
            // renderizá-la como markdown transformaria um `*` dele em itálico.
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          ) : (
            <>
              <TypewriterText
                text={message.content}
                active={isNew}
                tps={tps}
                instant={isErrorReview}
                skip={skip}
                onStart={onStreamStart}
                onDone={onStreamDone}
                onTick={onStreamTick}
              >
                {(_partial, cut) => (
                  <SegmentedMarkdown markdown={message.content} cut={cut} />
                )}
              </TypewriterText>
              {isErrorReview ? (
                <motion.span
                  whileTap={wantsMotion ? { scale: 0.98 } : undefined}
                  transition={springs.snappy}
                  style={{ display: 'inline-block' }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    onClick={onRegenerate}
                    disabled={regenerateDisabled}
                    startIcon={<AutoAwesomeIcon />}
                    sx={{ mt: 1 }}
                  >
                    {t('translation:challenge.regenerateButton')}
                  </Button>
                </motion.span>
              ) : null}
            </>
          )}
        </motion.div>
      </Box>
    </Box>
  );
}
