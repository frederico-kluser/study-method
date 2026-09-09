/**
 * src/components/chat/TypingIndicator.tsx — "o tutor está digitando…", agora
 * como uma MENSAGEM CHEGANDO.
 *
 * ─── O DEFEITO ORIGINAL ───────────────────────────────────────────────────
 * O indicador flutuava solto no fluxo do chat: sem avatar, sem balão, sem nome.
 * Não parecia uma mensagem a caminho — parecia um aviso do sistema, e a coluna
 * do tutor "pulava" quando a bolha de verdade chegava no lugar dele. Ele é o
 * MESMO objeto visual da bolha (`chatSurfaces.bubbleShellStyle` no tom
 * `tutor`), então a bolha real toma o lugar dele sem salto de layout.
 *
 * ─── ONDA11 (a referência de chat) ────────────────────────────────────────
 * O balão do chat perdeu a coluna de avatar ao lado (o avatar flutuava colado à
 * borda esquerda do painel — reclamação do dono) e ganhou uma LINHA DE
 * CABEÇALHO com avatar + nome. Este arquivo acompanha na mesma estrutura, e é
 * obrigatório que acompanhe: o indicador e a bolha ocupam o MESMO lugar em
 * momentos diferentes; qualquer diferença de geometria entre os dois volta a
 * ser o salto de layout que este componente veio matar.
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
 *    suficientes são C39/SCR40). Isto não é enfeite: o §8.1 do redesign diz que
 *    rajada curta não exige controle, mas **"qualquer animação em laço
 *    exige"** — e este pulso é infinito. Sem movimento, os três pontos
 *    continuam visíveis e o texto continua dizendo o que está acontecendo: a
 *    informação nunca dependeu do movimento.
 *  - a curva do laço vem de `animationTokens.transitions.pulse` (1,6 s,
 *    easeInOut) em vez de um literal — quem quiser mudar o pulso muda no token.
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
    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {/* O MESMO cabeçalho da bolha do tutor (avatar + nome), na mesma
            geometria — sem hora, porque a mensagem ainda não existe e um
            HH:MM aqui mentiria sobre o instante de criação dela.

            A TINTA do nome é `text.primary`, como na bolha. Ela ficou
            `text.secondary` por um tempo e ninguém viu a diferença pelo pior
            motivo possível: escrita como PROP do Typography, ela era descartada
            em silêncio pelo MUI 9.3 e o nome saía em tinta PRIMÁRIA de
            qualquer jeito — "igual à bolha" por acidente. Quando a onda 12
            converteu os 67 props da base para `sx` (que funciona), este nome
            teria passado a divergir do irmão. O invariante que o comentário
            acima afirma é travado por tests/inkPropReachesScreen.test.ts. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, px: 0.25 }}>
          <ChatAvatar isUser={false} label={tutorName} />
          <Typography variant="caption" sx={{ color: 'text.primary' }}>
            {tutorName}
          </Typography>
        </Box>
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
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('translation:lesson.typingIndicator')}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
