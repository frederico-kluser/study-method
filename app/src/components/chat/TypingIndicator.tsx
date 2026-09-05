/**
 * src/components/chat/TypingIndicator.tsx — "o tutor está digitando…", agora
 * como uma MENSAGEM CHEGANDO.
 *
 * ─── O DEFEITO ────────────────────────────────────────────────────────────
 * O indicador flutuava solto no fluxo do chat: sem avatar, sem balão, sem nome.
 * Não parecia uma mensagem a caminho — parecia um aviso do sistema, e a coluna
 * do tutor "pulava" quando a bolha de verdade chegava no lugar dele. Agora ele
 * é o MESMO objeto visual da bolha (`chatSurfaces.bubbleShellStyle` no tom
 * `tutor`, com o mesmo avatar e o mesmo nome), então a bolha real toma o lugar
 * dele sem nenhum salto de layout.
 *
 * ─── REGRA DE OURO (preservada) ───────────────────────────────────────────
 * MOUNT/UNMOUNT CONDICIONAL — o componente SÓ existe no DOM enquanto a
 * digitação está ativa. NUNCA fica montado oculto por CSS: o `getByText` dos
 * e2e nunca casa texto fora da tela.
 *
 * ─── ACESSIBILIDADE ───────────────────────────────────────────────────────
 *  - a região mantém `role="status"` com `aria-label` i18n; os pontinhos são
 *    decorativos (`aria-hidden`) — a animação não carrega informação;
 *  - `prefers-reduced-motion: reduce` DESLIGA o laço (SC 2.3.3, cujas técnicas
 *    suficientes são C39/SCR40). Isto é NOVO e não é enfeite: o §8.1 do
 *    redesign diz que rajada curta não exige controle, mas **"qualquer animação
 *    em laço exige"** — e este pulso é infinito. Sem movimento, os três pontos
 *    continuam visíveis e o texto continua dizendo o que está acontecendo: a
 *    informação nunca dependeu do movimento.
 *  - a curva do laço vem de `animationTokens.transitions.pulse` (1,6 s,
 *    easeInOut) em vez do 1.6 literal que estava aqui — quem quiser mudar o
 *    pulso muda no token.
 */
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import type { ReactElement } from 'react';

import { transitions } from '../../lib/animationTokens';
import { ChatAvatar, bubbleShellStyle } from './chatSurfaces';

/** Atraso de cada pontinho em relação ao anterior (stagger do PulseDot). */
const DOT_DELAYS = [0, 0.15, 0.3];

export function TypingIndicator(): ReactElement {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const tutorName = t('translation:lesson.tutorName');
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-end' }}>
      <ChatAvatar isUser={false} label={tutorName} />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Typography variant="caption" color="textSecondary" sx={{ px: 0.5 }}>
          {tutorName}
        </Typography>
        <Box
          role="status"
          aria-label={t('translation:lesson.typingDots')}
          style={bubbleShellStyle(theme, 'tutor', false)}
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
                animate={
                  reduceMotion === true
                    ? { opacity: 1, scale: 1 }
                    : { opacity: [1, 0.4, 1], scale: [1, 0.82, 1] }
                }
                transition={reduceMotion === true ? { duration: 0 } : { ...transitions.pulse, delay }}
              />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {t('translation:lesson.typingIndicator')}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
