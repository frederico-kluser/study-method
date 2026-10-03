/**
 * components/ui/RetryAlert.tsx — o `Alert` com retry NA AÇÃO (auditoria de
 * layout §3, forma (b)) + o par mensagem/detalhe que estava copiado 4×
 * (SetupView, LocalAiPanel ×2, ProgressPanel).
 *
 * As 10 ocorrências da forma (b) (ChallengeView ×5, GameLevelView, GamesView,
 * placeholders, LessonView ×2) eram sempre o mesmo bloco: `Alert` com um
 * botão "Tentar de novo" no slot `action`. As 4 do par mensagem/detalhe eram
 * sempre as mesmas duas linhas: frase `body2` em `display: 'block'` + legenda
 * `caption` com `opacity: 0.85` (os `sx` agora em `lib/layoutSx.ts`).
 *
 * VIEW PURA: só props. A copy (mensagem/detalhe) vive no chamador; o primitivo
 * tem o fallback `translation:ui.retryAlert.message` e o rótulo do retry
 * (`translation:common.tryAgain`, existente). `severity` é livre porque o
 * mesmo bloco serve erro e aviso — a decisão severity/i18n de VALIDAÇÃO
 * continua a ser do `lib/validationAlert.ts`, que não se mexe (auditoria §15).
 *
 * ─── EXTENSÕES ADITIVAS (onda DRY da LessonView) ──────────────────────────
 * `onClose?` (o × de descarte do `Alert`) e `sx?` (composto por cima do base,
 * como no `ActionButton`) desbloqueiam os três Alerts da aula — aviso do
 * canal do quiz, erro do mic e erro do tutor — que têm descarte e, no mic,
 * padding fino (`py: 0.5`). SEM `onClose` não há × (a regra é
 * `RetryAlert.state.ts`), por isso todos os consumidores anteriores ficam
 * byte a byte como estavam.
 */
import type { ReactElement, ReactNode } from 'react';
import Alert, { type AlertColor } from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import type { SystemStyleObject } from '@mui/system';
import type { Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

import { alertDetailSx, alertMessageSx, wrappingActionSx } from '../../lib/layoutSx';
import { ActionButton } from './ActionButton';
import { retryAlertState } from './RetryAlert.state';

/** O `sx` base do Alert — composto por cima pelo `sx` do chamador. */
const ALERT_SX: SystemStyleObject<Theme> = { overflowWrap: 'break-word' };

export interface RetryAlertProps {
  /** Erro por omissão; `warning`/`info`/`success` quando o chamador decidir. */
  readonly severity?: AlertColor;
  /** A mensagem — o chamador traduz (fallback do primitivo se omitida). */
  readonly message?: ReactNode;
  /** Detalhe opcional em legenda (o par das 4 cópias). */
  readonly detail?: ReactNode;
  /**
   * Mostra o botão "Tentar de novo" (default). `false` — só a mensagem e o
   * detalhe: é o caso do bloco de erro SEM retentativa (ex.: chave inválida,
   * onde "tentar de novo" não resolve).
   */
  readonly action?: boolean;
  /**
   * O retry. SEM `onRetry` não há botão — um "Tentar de novo" que não faz
   * nada é mentira (a decisão é `RetryAlert.state.ts`).
   */
  readonly onRetry?: () => void;
  /** Rótulo do retry — por omissão `translation:common.tryAgain`. */
  readonly retryLabel?: ReactNode;
  /**
   * O DESCARTE (× do `Alert`). SEM `onClose` não há × — uma saída que não
   * sai é mentira (a mesma regra de honestidade do `onRetry`, decisão em
   * `RetryAlert.state.ts`). Extensão aditiva: os consumidores anteriores não
   * passam `onClose` e continuam sem descarte, exatamente como antes.
   *
   * ATENÇÃO à regra do próprio MUI v9 (`Alert.js`: `action == null && onClose`):
   * retry e × são MUTUAMENTE EXCLUSIVOS — com retry em cena o `Alert` desenha
   * a ação e não o ×. É o comportamento de HOJE dos três Alerts da aula e está
   * preservado por `retryAlertState` (um `onClose` com retry em cena fica sem
   * botão, em vez de ser entregue ao MUI para ele ignorar).
   */
  readonly onClose?: () => void;
  /**
   * Composto POR CIMA de `{{ overflowWrap: 'break-word' }}` (o do chamador é o
   * que vence) — mesma regra do `ActionButton`: é para os ajustes finos de
   * chrome (ex.: `py: 0.5` do erro de mic), nunca para redesenhar o alerta.
   */
  readonly sx?: SystemStyleObject<Theme>;
}

export function RetryAlert({
  severity = 'error',
  message,
  detail,
  action = true,
  onRetry,
  retryLabel,
  onClose,
  sx,
}: RetryAlertProps): ReactElement {
  const { t } = useTranslation();
  const estado = retryAlertState({ action, onRetry, onClose });

  return (
    <Alert
      severity={severity}
      sx={sx === undefined ? ALERT_SX : [ALERT_SX, sx]}
      onClose={estado.showDismiss ? onClose : undefined}
      action={
        estado.showRetry ? (
          <ActionButton color="inherit" size="small" onClick={onRetry} sx={wrappingActionSx}>
            {retryLabel ?? t('translation:common.tryAgain')}
          </ActionButton>
        ) : null
      }
    >
      <Typography component="span" variant="body2" sx={alertMessageSx}>
        {message ?? t('translation:ui.retryAlert.message')}
      </Typography>
      {detail ? (
        <Typography component="span" variant="caption" sx={alertDetailSx}>
          {detail}
        </Typography>
      ) : null}
    </Alert>
  );
}
