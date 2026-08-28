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
 * ONDA2-CHAT-NINTENDO (PulseDot em espírito — leet-code-rpg): os 3 pontinhos
 * agora pulsam com MOTION (opacity [1, 0.4, 1] em 1.6s, stagger de 0.15s —
 * delay 0/0.15/0.3 — com um micro-scale de "sopro"), substituindo o bounce
 * CSS da Onda 2. Acessível: a região mantém role="status" com aria-label i18n
 * (`lesson.typingDots` — o nome acessível da região); os pontinhos continuam
 * decorativos (aria-hidden — a animação não carrega informação).
 */
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Box, Typography } from '@mui/material';
import type { ReactElement } from 'react';

/** Duração de UM ciclo do pulso (opacity 1 → 0.4 → 1). */
const PULSE_SECONDS = 1.6;
/** Atraso de cada pontinho em relação ao anterior (stagger do PulseDot). */
const DOT_DELAYS = [0, 0.15, 0.3];

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
          },
        }}
      >
        {DOT_DELAYS.map((delay, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: [1, 0.4, 1], scale: [1, 0.82, 1] }}
            transition={{
              duration: PULSE_SECONDS,
              delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('translation:lesson.typingIndicator')}
      </Typography>
    </Box>
  );
}
