/**
 * src/components/chat/ChatBubble.tsx — bolha de mensagem do chat da aula,
 * estilo iMessage (ONDA2-imessage).
 *
 * Cada bolha identifica o AUTOR: nome acima (caption) + avatar circular
 * pequeno ao lado (à esquerda para o Tutor, à direita para "Você"). A bolha
 * 'reply' (resposta do tutor à pergunta do aluno) NÃO tem avatar — decisão
 * REPLAN documentada: sem avatar, a caption "Tutor" fica à direita e a bolha
 * se CONECTA à do usuário acima (raio superior-direito pequeno), como a
 * segunda bolha de um fio no iMessage. O tempo (HH:MM — `formatChatTime`, ts
 * do MODELO, preservado pelo cache) vive DENTRO da bolha, alinhado à direita
 * — decisão de layout documentada: assim a bolha 'reply' pode se CONECTAR à
 * bolha do usuário acima sem sobrepor uma legenda de hora solta no meio do
 * caminho.
 *
 * Cores (tokens EXISTENTES do tema — nenhum token novo; contraste ≥4,5:1
 * garantido pelos pares calibrados de src/theme.ts e designTokens.ts):
 *   - 'user'     → primary.main + primary.contrastText (como antes — o "azul"
 *                  iMessage do app é o acento action, calibrado 4,53:1 claro
 *                  / 4,50:1 escuro);
 *   - 'message'  → background.paper + text.primary, borda divider (conversa
 *                  normal do tutor — como antes);
 *   - 'reply'    → secondary.main + secondary.contrastText (cor PRÓPRIA da
 *                  resposta a uma pergunta — o acento study, calibrado
 *                  4,54:1 nos DOIS esquemas); bolha MENOR (70% vs 78%),
 *                  alinhada à direita (REPLAN — a implementação anterior
 *                  caía no flex-start do Tutor) e conectada à bolha do
 *                  usuário acima pelo raio superior-direito pequeno (cauda
 *                  visual OPCIONAL do pedido — não implementada; documentado);
 *                  SEM avatar (decisão REPLAN — a caption "Tutor" à direita);
 *   - 'review'   → tom de ERRO suave: error.main a 10% sobre background.paper
 *                  composto com color-mix (o `alpha()` do MUI v9 LANÇA erro
 *                  com CSS var — MUI error #9; color-mix resolve as
 *                  referências var() por esquema), texto text.primary —
 *                  contraste: a tinta primária fica ≥ ~10:1 sobre o tint nos
 *                  dois esquemas (o error.main a 10% desloca a luminância da
 *                  superfície em <5%; o par calibrado do tema é ≥12:1 nos
 *                  níveis 0/1) — DIFERENTE das conversas de propósito.
 *
 * A HORA (caption 13px — SC 1.4.3 exige 4,5:1) herda a cor de contraste do
 * par da bolha com opacidade 1 nas bolhas PREENCHIDAS (user/reply — FIX de
 * contraste: com 0,8 o composto media 3,38-3,69:1, o par cru passa 4,54/4,55
 * claro e 4,50/4,55 escuro; os pares claros estão no teto do branco — não há
 * margem além sem trocar tokens, fora de escopo) e opacidade 0,8 em
 * message/review (fundo claro — medido 8,69:1+, folga gigante).
 *
 * Streaming: mensagens NOVAS da sessão digitam via TypewriterText (o texto
 * COMPLETO fica no histórico; o corte é exibição). A review só habilita o
 * "Gerar novo desafio" após o FIM da digitação (REPLAN) — o botão fica
 * desabilitado enquanto `streaming`.
 */
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Avatar, Box, Button, Typography } from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import PersonIcon from '@mui/icons-material/Person';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { ReactElement, ReactNode } from 'react';

import { formatChatTime, type TutorChatMessage } from '../../lib/trackLessonState';
import { TypewriterText } from './TypewriterText';

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
 *  A bolha 'reply' NÃO renderiza avatar (decisão REPLAN — a caption "Tutor"
 *  fica à direita, coerente com o raio superior-direito da conexão). */
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
  /** true ENQUANTO o typewriter desta bolha está em andamento. */
  streaming: boolean;
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
  streaming,
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
  const lang = i18n.language ?? 'pt-BR';
  const authorName = isUser
    ? t('translation:lesson.youName')
    : t('translation:lesson.tutorName');
  const time = formatChatTime(message.ts, lang);

  // Cor da bolha por kind (documentado no cabeçalho — tokens existentes).
  // A review usa color-mix sobre as referências var() do TEMA (error.main e
  // background.paper) — o `alpha()` do MUI v9 LANÇA erro com CSS var (MUI
  // error #9), então o tint é composto direto em CSS (color-mix resolve por
  // esquema — sem ternário de cor no JS).
  const errorMain = theme.vars.palette.error.main;
  const surfacePaper = theme.vars.palette.background.paper;
  const bubbleStyle = isUser
    ? { bgcolor: 'primary.main', color: 'primary.contrastText', border: 'none' }
    : isReply
      ? { bgcolor: 'secondary.main', color: 'secondary.contrastText', border: 'none' }
      : isReview
        ? {
            bgcolor: `color-mix(in srgb, ${errorMain} 10%, ${surfacePaper})`,
            color: 'text.primary',
            border: `1px solid color-mix(in srgb, ${errorMain} 28%, ${surfacePaper})`,
          }
        : {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
          };

  // Raio "iMessage": o canto QUE APONTA PARA O AUTOR é pequeno (a cauda).
  // user → inferior-direito; tutor → inferior-esquerdo; reply → superior-
  // direito (conecta à bolha do usuário ACIMA — o raio pequeno + a cor
  // própria + o alinhamento à direita fazem a "conexão" visual).
  const radius = isReply
    ? '16px 4px 16px 16px'
    : isUser
      ? '16px 16px 4px 16px'
      : '16px 16px 16px 4px';

  // Alinhamento REPLAN: a reply NÃO cai no flex-start do Tutor — ela se
  // CONECTA à bolha do usuário acima (a pergunta dele), então user E reply
  // ancoram à direita; tutor (message) e review (erro do desafio) à esquerda.
  // O MESMO conjunto (user/reply) é o das bolhas PREENCHIDAS — usado também
  // no contraste da hora (opacidade 1 nas preenchidas, ver render).
  const isFilled = isUser || isReply;
  const alignRight = isFilled;
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        alignItems: 'flex-end',
        justifyContent: alignRight ? 'flex-end' : 'flex-start',
      }}
    >
      {/* SEM avatar para a reply (decisão REPLAN documentada no cabeçalho). */}
      {!isUser && !isReply ? <AuthorAvatar isUser={false} label={authorName} /> : null}
      <Box
        sx={{
          maxWidth: isReply ? '70%' : '78%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: alignRight ? 'flex-end' : 'flex-start',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
          {authorName}
        </Typography>
        <Box
          sx={{
            ...bubbleStyle,
            borderRadius: radius,
            px: 1.5,
            py: 1,
          }}
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
                  de erro. REPLAN: SÓ habilitado após o FIM da digitação da
                  review (streaming=false) — além do turno em voo (busy). */}
              {isReview ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  onClick={onRegenerate}
                  disabled={regenerateDisabled || streaming}
                  startIcon={<AutoAwesomeIcon />}
                  sx={{ mt: 1 }}
                >
                  {t('translation:challenge.regenerateButton')}
                </Button>
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
        </Box>
      </Box>
      {isUser ? <AuthorAvatar isUser label={authorName} /> : null}
    </Box>
  );
}
