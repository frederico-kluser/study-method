/**
 * src/views/ChallengeView/blocks/TrackChallengeResult.tsx — o RESULTADO da
 * tentativa reprovada do desafio de trilha: razão PARCIAL ("N de M testes
 * passaram") + checklist individual (ONDA 1) + saída do runner (capada em
 * 4000 chars com aviso de truncagem — ONDA-UX-FEEDBACK).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. S10 (auditoria de UX): severidade 'warning' quando PARCIAL (alguns
 * checks passaram), 'error' só quando NADA passa; corpo da saída a 13px PELO
 * TOKEN da casa (`typography.pixel.fontSize`).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import type { TrackSubmitResult } from '../../../../shared/ipc-contract';

export interface TrackChallengeResultProps {
  /** Resultado da submissão (com checks individuais). */
  result: TrackSubmitResult;
}

export function TrackChallengeResult({ result }: TrackChallengeResultProps): ReactElement {
  const { t } = useTranslation();
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  return (
    <Alert
      severity={result.passedCount > 0 ? 'warning' : 'error'}
      sx={(theme) => ({
        fontFamily: 'monospace',
        // S10: o corpo da saída sobe de 12px para 13px — PELO TOKEN da casa
        // (`typography.pixel.fontSize` = 13, escala pinada em theme.ts) e não
        // pelo literal `0.8125rem`, que a guarda do design system proíbe.
        fontSize: theme.typography.pixel.fontSize,
      })}
    >
      {/* ONDA 1 (checks por teste): razão PARCIAL (N de M) + checklist
          individual — o veredito não é tudo-ou-nada. Sem checks (erro de
          sintaxe etc.) a razão some — a saída fala por si. */}
      {result.checks.length > 0 ? (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'inherit' }}>
            {tI('challenge.partialCount', { passed: result.passedCount, total: result.totalCount })}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ fontFamily: 'inherit' }}>
              {t('translation:challenge.checksTitle')}
            </Typography>
            <List dense disablePadding>
              {result.checks.map((c, i) => (
                <ListItem key={i} disableGutters dense sx={{ py: 0 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    {c.passed ? (
                      <CheckCircleIcon fontSize="small" color="success" />
                    ) : (
                      <CancelIcon fontSize="small" color="error" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={c.name}
                    slotProps={{ primary: { variant: 'body2', sx: { fontFamily: 'inherit' } } }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </Box>
      ) : null}
      {/* ONDA-UX-FEEDBACK: a saída continua capada (4000 chars — o runner pode
          vomitar milhares de linhas), mas AGORA o corte é avisado: truncar em
          silêncio escondia diagnóstico de falha que o aluno precisa de ler. */}
      <Box component="pre" sx={{ m: 0, mt: 1, maxHeight: 200, overflowY: 'auto' }}>
        {result.output.slice(0, 4000)}
        {result.output.length > 4000
          ? `\n${tI('challenge.outputTruncated', { n: 4000 })}`
          : ''}
      </Box>
    </Alert>
  );
}
