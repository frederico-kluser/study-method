/**
 * src/components/chat/ChatBubble.tsx — bolha de mensagem do chat da aula,
 * estilo iMessage (ONDA2-imessage) + animações Nintendo (ONDA2-CHAT-NINTENDO).
 *
 * Cada bolha identifica o AUTOR: nome acima (caption) + avatar circular
 * pequeno ao lado (à esquerda para o Tutor, à direita para "Você"). ONDA2-
 * CHAT-NINTENDO (pedido do dono): a bolha 'reply' (resposta do tutor à
 * pergunta do aluno) TAMBÉM é do TUTOR — foi movida para a ESQUERDA com
 * avatar (AutoStoriesIcon 26px, cor secondary) e nome "Tutor" acima, raio
 * PADRÃO do tutor com o canto quebrado inferior-ESQUERDO ('16px 16px 16px
 * 4px' — a cauda aponta para o avatar, como todo balão do tutor). DECISÃO
 * documentada: o pedido citava '16px 16px 4px 16px' (canto inferior-DIREITO
 * quebrado — o raio do USUÁRIO), mas a intenção descrita é "espelhando o do
 * tutor" com o canto inferior-ESQUERDO; como o reply agora fica no MESMO
 * lado do tutor, o raio correto é o PRÓPRIO raio do tutor. A cor ROXA
 * (secondary.main/contrastText) é MANTIDA — é a identidade de resposta do
 * tutor; só a posição/avatar mudam. Mensagens do USUÁRIO continuam à direita.
 *
 * ONDA2-CHAT-NINTENDO (erro instantâneo): a bolha de ERRO de execução
 * (kind 'review' com `errorFor` — markdown do `formatErrorBubble`/seed) NÃO
 * passa pelo typewriter: TypewriterText com `instant` — o texto COMPLETO
 * aparece de uma vez (a 10 tps o erro levaria ~55s). A review de APROVAÇÃO
 * (kind 'review' SEM `errorFor` — hoje não existe no chat, mas o contrato a
 * suporta) CONTINUA digitando a 10 tps (tps passado pela LessonView). O
 * gating do "Gerar novo desafio" NÃO muda (é o turno em voo — `busy`), e o
 * auto-scroll não quebra (a mensagem inteira já está no DOM no mount).
 *
 * Cores (tokens EXISTENTES do tema — nenhum token novo; contraste ≥4,5:1
 * garantido pelos pares calibrados de src/theme.ts e designTokens.ts):
 *   - 'user'     → primary.main + primary.contrastText (o "azul" iMessage do
 *                  app é o acento action, calibrado 4,53:1 claro / 4,50:1
 *                  escuro);
 *   - 'message'  → background.paper + text.primary, borda divider (conversa
 *                  normal do tutor — como antes);
 *   - 'reply'    → secondary.main + secondary.contrastText (cor PRÓPRIA da
 *                  resposta a uma pergunta — acento study, calibrado 4,54:1
 *                  nos DOIS esquemas); AGORA à ESQUERDA com avatar/nome do
 *                  tutor (ONDA2-CHAT-NINTENDO), maxWidth 78% como os demais
 *                  balões do tutor;
 *   - 'review'   → ERRO: tom de ERRO suave: error.main a 10% sobre
 *                  background.paper composto com color-mix (o `alpha()` do
 *                  MUI v9 LANÇA erro com CSS var — MUI error #9; color-mix
 *                  resolve as referências var() por esquema), texto
 *                  text.primary — contraste: a tinta primária fica ≥ ~10:1
 *                  sobre o tint nos dois esquemas — DIFERENTE das conversas
 *                  de propósito; APROVAÇÃO (sem errorFor): mesmo padrão com
 *                  success.main (glow breve na entrada — micro-detalhe
 *                  Nintendo, sem confetti).
 *
 * A HORA (caption 13px — SC 1.4.3 exige 4,5:1) herda a cor de contraste do
 * par da bolha com opacidade 1 nas bolhas PREENCHIDAS (user/reply — FIX de
 * contraste: com 0,8 o composto media 3,38-3,69:1, o par cru passa 4,54/4,55
 * claro e 4,50/4,55 escuro; os pares claros estão no teto do branco — não há
 * margem além sem trocar tokens, fora de escopo) e opacidade 0,8 em
 * message/review (fundo claro — medido 8,69:1+, folga gigante).
 *
 * Streaming: mensagens NOVAS da sessão digitam via TypewriterText (o texto
 * COMPLETO fica no histórico; o corte é exibição). ONDA1-NAV-UI (ajuste
 * registrado): o "Gerar novo desafio" da review NÃO espera mais o fim da
 * digitação (a review a 10 tps levaria ~55s — pedido do dono); o gating é só
 * o turno em voo (`regenerateDisabled`). ONDA2-CHAT-NINTENDO: a review de
 * ERRO não digita mais (instantânea) — o texto inteiro já está no DOM no
 * mount; o botão fica imediatamente disponível.
 *
 * Animações (ONDA2-CHAT-NINTENDO — motion):
 *   - a ENTRADA da bolha (fadeInUp) é feita pelo WRAPPER da LessonView
 *     (AnimatePresence — a bolha em si é o conteúdo); aqui vivem os
 *     micro-detalhes: hover sutil na bolha de review (interativa — tem o
 *     botão "Gerar novo desafio"): y -2 com spring snappy; press feedback
 *     (scale 0.98) no botão; glow breve de sucesso na review de APROVAÇÃO.
 */
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Avatar, Box, Button, Typography } from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import PersonIcon from '@mui/icons-material/Person';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { motion, type Transition } from 'motion/react';
import type { ReactElement, ReactNode } from 'react';

import { formatChatTime, type TutorChatMessage } from '../../lib/trackLessonState';
import { springs } from '../../lib/animationTokens';
import { TypewriterText } from './TypewriterText';

/** Transição do glow de aprovação (uma passada, sem repetição). */
const GLOW_TRANSITION: Transition = { duration: 1.4, times: [0, 0.45, 1], ease: 'easeInOut' };

/** Placeholder dos componentes de código do react-markdown (monospace). */
function MarkdownComponents(): Record<string, (props: { children?: ReactNode }) => ReactNode> {
  return {
    pre: ({ children }: { children?: ReactNode }) => (
      <Box
        component="pre"
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          bgcolor: 'action.hover',
          borderRadius: 1,
          p: 1,
          overflowX: 'auto',
          fontSize: '0.8125rem',
          m: 0,
        }}
      >
        {children}
      </Box>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <Box
        component="code"
        sx={{
          fontFamily: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
          fontSize: '0.8125rem',
        }}
      >
        {children}
      </Box>
    ),
  };
}

/** Avatar circular do autor (ícones MUI — decisão documentada: AutoStories
 *  para o Tutor, Person para o aluno; aria-label i18n com o nome do autor).
 *  ONDA2-CHAT-NINTENDO: TODA bolha do tutor (message/review/reply) renderiza
 *  o avatar à esquerda — a reply voltou ao padrão de balão do tutor. */
function AuthorAvatar({ isUser, label }: { isUser: boolean; label: string }): ReactElement {
  return (
    <Avatar
      role="img"
      aria-label={label}
      sx={{
        width: 26,
        height: 26,
        fontSize: '1rem',
        // Tutor → acento study (secundário); aluno → acento action (primário).
        // Os ícones ficam em contrastText (≥4,5:1 sobre o fill — calibrado).
        bgcolor: isUser ? 'primary.main' : 'secondary.main',
        color: isUser ? 'primary.contrastText' : 'secondary.contrastText',
      }}
    >
      {isUser ? <PersonIcon fontSize="small" /> : <AutoStoriesIcon fontSize="small" />}
    </Avatar>
  );
}

export interface ChatBubbleProps {
  message: TutorChatMessage;
  /**
   * true quando a mensagem ENTROU nesta sessão (não veio do cache/seed
   * antigo) — o texto é DIGITADO no mount; false → completo instantâneo.
   */
  isNew: boolean;
  /** ONDA1-NAV-UI: tokens por segundo do typewriter desta bolha (undefined =
   *  default do TypewriterText, ~100 tps — respostas do tutor "livres"). A
   *  LessonView passa 10 para a review do desafio (pedido do dono). ONDA2-
   *  CHAT-NINTENDO: a review de ERRO (com errorFor) NÃO usa o tps — o erro é
   *  renderizado INSTANTÂNEO (prop `instant` do TypewriterText). */
  tps?: number;
  /**
   * ONDA10: repassa o "pular a digitação" para o TypewriterText — a LessonView
   * liga quando o aluno clica no painel, aperta uma tecla ou usa o botão
   * "Mostrar tudo". Não afeta bolhas restauradas (`isNew=false`) nem a de erro
   * (`instant`), que já aparecem inteiras.
   */
  skip?: boolean;
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
  onRegenerate,
  regenerateDisabled,
  onStreamStart,
  onStreamDone,
  onStreamTick,
}: ChatBubbleProps): ReactElement {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isUser = message.role === 'user';
  const isReply = message.kind === 'reply';
  const isReview = message.kind === 'review';
  // ONDA2-CHAT-NINTENDO (erro instantâneo): bolha de ERRO = review COM
  // `errorFor` (o seed do erro de execução — `formatErrorBubble`); review de
  // APROVAÇÃO = review SEM `errorFor` (continua digitando a 10 tps).
  const isErrorReview = isReview && message.errorFor !== undefined;
  const isApprovedReview = isReview && !isErrorReview;
  const lang = i18n.language ?? 'pt-BR';
  const authorName = isUser
    ? t('translation:lesson.youName')
    : t('translation:lesson.tutorName');
  const time = formatChatTime(message.ts, lang);

  // Cor da bolha por kind (documentado no cabeçalho — tokens existentes).
  // O motion.div recebe um STYLE PLAIN (sem processamento de sx do MUI), então
  // TODOS os tokens são resolvidos via theme.vars ANTES (o mesmo padrão dos
  // tints abaixo) e as chaves usam o vocabulário CSS REAL (`backgroundColor`,
  // não o açúcar `bgcolor` do sx — num style object do React uma chave
  // desconhecida é SILENCIOSAMENTE descartada, o que deixava o fundo do balão
  // transparente; FIX cor-baloes). O tint de review usa color-mix sobre as
  // referências var() do TEMA — o `alpha()` do MUI v9 LANÇA erro com CSS var
  // (MUI error #9), então o tint é composto direto em CSS (color-mix resolve
  // por esquema — sem ternário de cor no JS). A review de APROVAÇÃO usa o
  // MESMO padrão com success.main (ONDA2-CHAT-NINTENDO — hoje não existe no
  // chat; o contrato suporta).
  const primaryMain = theme.vars.palette.primary.main;
  const primaryContrast = theme.vars.palette.primary.contrastText;
  const secondaryMain = theme.vars.palette.secondary.main;
  const secondaryContrast = theme.vars.palette.secondary.contrastText;
  const errorMain = theme.vars.palette.error.main;
  const successMain = theme.vars.palette.success.main;
  const surfacePaper = theme.vars.palette.background.paper;
  const textPrimary = theme.vars.palette.text.primary;
  const divider = theme.vars.palette.divider;
  const bubbleStyle = isUser
    ? { backgroundColor: primaryMain, color: primaryContrast, border: 'none' }
    : isReply
      ? { backgroundColor: secondaryMain, color: secondaryContrast, border: 'none' }
      : isApprovedReview
        ? {
            backgroundColor: `color-mix(in srgb, ${successMain} 10%, ${surfacePaper})`,
            color: textPrimary,
            border: `1px solid color-mix(in srgb, ${successMain} 28%, ${surfacePaper})`,
          }
        : isReview
          ? {
              backgroundColor: `color-mix(in srgb, ${errorMain} 10%, ${surfacePaper})`,
              color: textPrimary,
              border: `1px solid color-mix(in srgb, ${errorMain} 28%, ${surfacePaper})`,
            }
          : {
              backgroundColor: surfacePaper,
              color: textPrimary,
              border: `1px solid ${divider}`,
            };

  // Raio "iMessage": o canto QUE APONTA PARA O AUTOR é pequeno (a cauda).
  // user → inferior-direito; TODAS as bolhas do tutor (message/review/reply)
  // → inferior-ESQUERDO (a cauda aponta para o avatar). ONDA2-CHAT-NINTENDO:
  // a reply ANTES conectava à bolha do usuário acima pelo raio superior-
  // direito; agora é um balão NORMAL do tutor à esquerda (decisão no
  // cabeçalho — o valor literal do pedido, '16px 16px 4px 16px', quebraria o
  // canto inferior-DIREITO, o raio do usuário; seguimos a intenção descrita:
  // "raio padrão do tutor com canto quebrado inferior-ESQUERDO").
  const radius = isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px';

  // Alinhamento ONDA2-CHAT-NINTENDO: só o USUÁRIO ancora à direita; TODAS as
  // bolhas do tutor (message, review, reply) ancoram à ESQUERDA com avatar.
  // O MESMO conjunto (user/reply) é o das bolhas PREENCHIDAS — usado também
  // no contraste da hora (opacidade 1 nas preenchidas, ver render).
  const isFilled = isUser || isReply;
  const alignRight = isUser;
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        alignItems: 'flex-end',
        justifyContent: alignRight ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Avatar do TUTOR em TODAS as bolhas dele (message/review/reply). */}
      {!isUser ? <AuthorAvatar isUser={false} label={authorName} /> : null}
      <Box
        sx={{
          maxWidth: '78%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: alignRight ? 'flex-end' : 'flex-start',
        }}
      >
        <Typography variant="caption" color="textSecondary" sx={{ px: 0.5 }}>
          {authorName}
        </Typography>
        <motion.div
          style={{
            ...bubbleStyle,
            borderRadius: radius,
            padding: '8px 12px',
            // FIX (overflow do balão — medido em e2e): a bolha é item de flex
            // COLUMN (o Box de maxWidth 78%) com align-self flex-start → sua
            // largura resolve por FIT-CONTENT = min(max-content, 78%) — e o
            // max-content do markdown é dirigido pelo bloco de SAÍDA do erro
            // (pre com overflowX auto): uma linha longa do output do runner
            // (ex.: diagnóstico do node:test) ESTOURA a bolha além do painel
            // (medido: 1226px num painel de 1000px). `maxWidth: '100%'`
            // clampa o fit-content à largura da coluna (a bolha curta
            // continua abraçando o conteúdo; o pre rola por dentro).
            maxWidth: '100%',
          }}
          // ONDA2-CHAT-NINTENDO: hover SUTIL na bolha interativa (a review —
          // tem o botão "Gerar novo desafio"): leve elevação com spring
          // snappy. As demais bolhas não têm interação → sem hover.
          whileHover={isReview ? { y: -2 } : undefined}
          // ONDA2-CHAT-NINTENDO (micro-detalhe): review de APROVAÇÃO entra
          // com um GLOW breve na cor de sucesso (boxShadow em keyframes —
          // uma vez, sem repetição; sem confetti). Hoje não existem reviews
          // de aprovação no chat — o caminho fica pronto para quando houver.
          animate={
            isApprovedReview
              ? {
                  boxShadow: [
                    `0 0 0 0 color-mix(in srgb, ${successMain} 0%, transparent)`,
                    `0 0 16px 2px color-mix(in srgb, ${successMain} 45%, transparent)`,
                    `0 0 0 0 color-mix(in srgb, ${successMain} 0%, transparent)`,
                  ],
                }
              : undefined
          }
          // FIX de tipagem motion 13 (ver animationTokens.ts): a transição
          // vai pelo PROP, nunca dentro do alvo. Na review de ERRO (o caso
          // REAL) o hover usa o spring snappy; na de APROVAÇÃO (hoje não
          // existe) o mesmo prop leva a transição do glow — o hover herdaria
          // a duração do keyframe (aceitável; cenário teórico documentado).
          transition={isApprovedReview ? GLOW_TRANSITION : springs.snappy}
        >
          {isUser ? (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {message.content}
            </Typography>
          ) : (
            <>
              <TypewriterText
                text={message.content}
                active={isNew}
                tps={tps}
                // ONDA2-CHAT-NINTENDO (pedido do dono): o ERRO de execução
                // escreve DIRETO de uma vez — `instant` renderiza o texto
                // completo no mount, sem interval e sem callbacks de stream.
                instant={isErrorReview}
                // ONDA10: clique/tecla completa a bolha na hora.
                skip={skip}
                onStart={onStreamStart}
                onDone={onStreamDone}
                onTick={onStreamTick}
              >
                {(partial) => (
                  <Box sx={{ '& p:first-of-type': { mt: 0 }, '& p:last-of-type': { mb: 0 } }}>
                    <ReactMarkdown components={MarkdownComponents()}>{partial}</ReactMarkdown>
                  </Box>
                )}
              </TypewriterText>
              {/* ONDA2 (error-flow, A4): "Gerar novo desafio" DENTRO da bolha
                  de erro. ONDA1-NAV-UI (ajuste REGISTRADO): o gating pelo FIM
                  da digitação da review caiu — com a review a 10 tps (pedido
                  do dono) o texto completo levaria ~55s e o botão ficaria
                  preso esse tempo todo. O gating que RESTA é o do turno em
                  voo (busy/regenerateDisabled). ONDA2-CHAT-NINTENDO: a review
                  de ERRO agora é INSTANTÂNEA — o botão fica disponível no
                  mount (a review de APROVAÇÃO não tem botão de regenerar). */}
              {isErrorReview ? (
                <motion.span
                  whileTap={{ scale: 0.98 }}
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
          {/* Hora DENTRO da bolha (decisão documentada no cabeçalho): o ts é o
              da CRIAÇÃO da mensagem — o cache preserva, horas originais. FIX
              de contraste (SC 1.4.3, caption 13px): nas bolhas PREENCHIDAS
              (user/reply) a hora usa a cor de contraste do par a opacidade 1
              — com 0,8 o composto caía a 3,38-3,69:1 (medido); mensagem e
              review mantêm 0,8 (medido 8,69:1+ — ver comentário no
              cabeçalho). */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'right',
              mt: 0.25,
              opacity: isFilled ? 1 : 0.8,
            }}
          >
            {time}
          </Typography>
        </motion.div>
      </Box>
      {isUser ? <AuthorAvatar isUser label={authorName} /> : null}
    </Box>
  );
}
