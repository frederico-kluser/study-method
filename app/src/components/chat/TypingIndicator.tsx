/**
 * src/components/chat/TypingIndicator.tsx — indicador "tutor digitando…"
 * (ONDA2-imessage) no lugar do texto simples da Onda 1.
 *
 * REGRA DE OURO (REPLAN): MOUNT/UNMOUNT CONDICIONAL — o componente SÓ existe
 * no DOM enquanto a digitação está ativa (a LessonView o renderiza quando
 * `busy && pendingAction === 'answer'` — o turno 'answer' aguardando a LLM —
 * OU quando alguma bolha está digitando). NUNCA fica montado oculto por CSS:
 * o `getByText` dos e2e nunca casa texto fora da tela.
 *
 * Animação: 3 pontinhos com bounce/fade SEQUENCIAL (CSS keyframes via
 * @emotion/react) + o texto i18n (`lesson.typingIndicator`). Acessível: a
 * região tem role="status" com aria-label i18n (`lesson.typingDots` — o nome
 * acessível da região); os pontinhos são decorativos (aria-hidden — a
 * animação não carrega informação).
 */
import { keyframes } from '@emotion/react';
import { useTranslation } from 'react-i18next';
import { Box, Typography } from '@mui/material';
import type { ReactElement } from 'react';

/** Bounce suave + fade — os pontinhos "digitam" em sequência. */
const dotBounce = keyframes({
  '0%, 60%, 100%': { transform: 'translateY(0)', opacity: 0.4 },
  '30%': { transform: 'translateY(-3px)', opacity: 1 },
});

export function TypingIndicator(): ReactElement {
  const { t } = useTranslation();
  return (
    <Box
      role="status"
      aria-label={t('translation:lesson.typingDots')}
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
    >
      <Box
        aria-hidden="true"
        sx={{
          display: 'flex',
          gap: 0.5,
          '& > span': {
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'text.secondary',
            animation: `${dotBounce} 1.2s ease-in-out infinite`,
            '&:nth-of-type(2)': { animationDelay: '0.15s' },
            '&:nth-of-type(3)': { animationDelay: '0.3s' },
          },
        }}
      >
        <span />
        <span />
        <span />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('translation:lesson.typingIndicator')}
      </Typography>
    </Box>
  );
}
