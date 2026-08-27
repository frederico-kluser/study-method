/**
 * src/views/LessonView/ResearchChecklist.tsx — checklist de pesquisa AO VIVO
 * da geração de aula (onda3-pesquisa-checklist-ui, surf-research style).
 *
 * Renderiza o estado puro de `src/lib/researchProgress.ts`:
 *   - seções por sub-pergunta (título) com uma linha por query;
 *   - linha: spinner (running) → ✓ com hits (done) ou ✗ com código de erro
 *     mapeado para i18n (failed); pending fica como travessão discreto;
 *   - header "Rodada N/M · x/y concluídas · F fontes únicas";
 *   - ao fechar (terminal), o estado CONGELA: contagem final em vez de spinner.
 *
 * RETROCOMPAT: sem `research:plan` (backend antigo / modo E2E onde o emit do
 * stub é no-op) devolve null — o checklist é INVISÍVEL e a barra de fases
 * atual (stepper + LinearProgress da LessonView) permanece soberana.
 *
 * O componente é aditivo à fase research: NÃO toca no stepper de fases
 * existente (e2e-lesson.spec trava os rótulos atuais do stepper).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  getResearchChecklist,
  getResearchCounters,
  hasResearchPlan,
  isResearchTerminal,
  researchErrorKey,
  researchErrorKindKey,
  type ResearchChecklistState,
} from '../../lib/researchProgress';

/** ✓ do estado 'done' (tinta de sucesso do designTokens — sem hex inventado). */
const CHECK_ICON = '✓';
/** ✗ do estado 'failed' (tinta de erro do designTokens). */
const CROSS_ICON = '✗';
/** Travessão discreto do estado 'pending'. */
const PENDING_ICON = '–';

/**
 * Renderiza o checklist de pesquisa ao vivo; null quando não há plano
 * (retrocompat — nada de pesquisa ao vivo para mostrar).
 */
export default function ResearchChecklist({
  state,
}: {
  state: ResearchChecklistState;
}): ReactElement | null {
  const { t } = useTranslation();
  // Interpolação ({{var}}): mesmo escape aprovado do ChallengeView (cast tI).
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;

  if (!hasResearchPlan(state)) return null;

  const groups = getResearchChecklist(state);
  const counters = getResearchCounters(state);
  const terminal = isResearchTerminal(state);
  // Aborto de chave (research:done com errorKind) → mensagem específica junto
  // do "Pesquisa interrompida"; null quando não é aborto de chave.
  const errorKindKey = state.errorKind ? researchErrorKindKey(state.errorKind) : null;

  // Header: "Pesquisa ao vivo · Rodada N/M · x/y concluídas · F fontes únicas"
  const headerParts: string[] = [t('translation:lesson.research.title')];
  if (counters.currentRound != null) {
    headerParts.push(
      tI('translation:lesson.research.round', {
        current: counters.currentRound,
        total: counters.totalRounds ?? counters.currentRound,
      }),
    );
  }
  headerParts.push(
    tI('translation:lesson.research.concluded', {
      done: counters.concluded,
      total: counters.total,
    }),
    tI('translation:lesson.research.uniqueSources', { count: counters.uniqueSources }),
  );
  const header = headerParts.join(' · ');

  return (
    <Box
      component="section"
      sx={{
        mt: 2,
        p: { xs: 1.5, md: 2 },
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
      }}
      data-onboarding-target="lesson-research-checklist"
    >
      <Typography variant="subtitle2" component="h3" gutterBottom>
        {header}
      </Typography>
      {groups.map((group) => (
        <Box key={group.subQuestionId || '__orphan__'} sx={{ mb: 1 }}>
          {group.question ? (
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {group.question}
            </Typography>
          ) : null}
          <List dense disablePadding>
            {group.queries.map((q) => (
              <ListItem key={q.id} disableGutters sx={{ py: 0.25 }}>
                <Stack direction="row" spacing={1} sx={{ width: '100%', alignItems: 'flex-start' }}>
                  {/* Ícone decorativo (aria-hidden): o STATUS é anunciado pelo
                      texto visível do secondary do ListItemText (status.running/
                      pending + hits/erro) — aria-label aqui dentro seria morto,
                      e aria-label no ListItem esconderia o texto da query da AT. */}
                  <Box component="span" sx={{ minWidth: 20, textAlign: 'center', mt: '2px' }} aria-hidden="true">
                    {q.status === 'running' ? (
                      <CircularProgress size={16} thickness={5} />
                    ) : q.status === 'done' ? (
                      <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>
                        {CHECK_ICON}
                      </Box>
                    ) : q.status === 'failed' ? (
                      <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>
                        {CROSS_ICON}
                      </Box>
                    ) : (
                      <Box component="span" sx={{ color: 'text.disabled' }}>
                        {PENDING_ICON}
                      </Box>
                    )}
                  </Box>
                  <ListItemText
                    primary={q.q}
                    secondary={
                      q.status === 'done' && q.hits != null
                        ? tI('translation:lesson.research.hits', { count: q.hits })
                        : q.status === 'failed'
                          ? tI(researchErrorKey(q.errorCode))
                          : q.status === 'running'
                            ? t('translation:lesson.research.status.running')
                            : t('translation:lesson.research.status.pending')
                    }
                    slotProps={{
                      primary: { variant: 'body2' },
                      secondary: { variant: 'caption' },
                    }}
                  />
                </Stack>
              </ListItem>
            ))}
          </List>
        </Box>
      ))}
      {terminal ? (
        <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
          {state.terminalKind === 'errored' ? (
            <>
              {t('translation:lesson.research.stopped')}
              {errorKindKey ? ` — ${tI(errorKindKey)}` : null}
            </>
          ) : (
            tI('translation:lesson.research.summary', {
              ok: counters.ok,
              failed: counters.failed,
              unique: counters.uniqueSources,
            })
          )}
        </Typography>
      ) : null}
    </Box>
  );
}
