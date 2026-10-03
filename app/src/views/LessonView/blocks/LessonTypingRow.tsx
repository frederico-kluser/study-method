/**
 * blocks/LessonTypingRow.tsx — a linha "tutor digitando…" do log (montada SÓ
 * enquanto há digitação — mount condicional: os e2e nunca casam texto oculto)
 * e a saída explícita e acessível da animação ("Mostrar tudo").
 *
 * Bloco de VIEW PURO extraído de LessonView.tsx (contrato STORY-SPEC §5): só
 * props. ONDA10 (bug 3) + ONDA-SKIP-1S: o clique no painel e qualquer tecla
 * fazem o mesmo, mas só um botão de verdade aparece para leitor de tela e
 * navegação por teclado — e o botão some quando a varredura de ~1 s TERMINA
 * (o container o mantém visível enquanto `showSkipButton`).
 *
 * W3 (auditoria de UX — "um botão, um significado"): com a seção em digitação
 * ('revelar') o botão do composer JÁ é o "Mostrar tudo" — aqui ele só existe
 * nos OUTROS estados de digitação (a duplicata que a auditoria apontou morreu).
 */
import { Button, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ReactElement } from 'react';
import { TypingIndicator } from '../../../components/chat/TypingIndicator';
import { touchTargetSx } from '../../../lib/layoutSx';

export interface LessonTypingRowProps {
  /** A linha existe enquanto há digitação (turno 'answer' ou bolha digitando). */
  show: boolean;
  /** Mostrar o "Mostrar tudo" (falso quando o composer já é o botão de revelar). */
  showSkipButton: boolean;
  /** Revela o restante em ~1 s (varredura — nunca estoura o texto). */
  onSkip: () => void;
}

export function LessonTypingRow({ show, showSkipButton, onSkip }: LessonTypingRowProps): ReactElement | null {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TypingIndicator />
      {showSkipButton ? (
        <Button
          size="small"
          variant="text"
          onClick={onSkip}
          // W10 (auditoria de UX — Fitts): piso de toque — o `size="small"`
          // nasce ~30px de alto. O piso vem do token partilhado
          // (`layoutSx.touchTargetSx` → `TARGET.minTouchTargetPx`), nunca de
          // um 44 solto (auditoria §1).
          sx={touchTargetSx}
        >
          {t('translation:lesson.skipTypingButton')}
        </Button>
      ) : null}
    </Stack>
  );
}
