/**
 * src/components/course/CourseSelector.tsx — seleção de aulas por assunto.
 * (onda3-arvore-ui)
 *
 * Renderiza a lista de cursos vindos de `buildCourseList` (src/lib/lessonSelection)
 * com UM botão "Continuar" por assunto — cada botão carrega a contagem de aulas
 * feitas daquele assunto ("Continuar · 3 aulas feitas"; sem aulas → "Gerar nova
 * aula"). Clique chama `onContinue(slug)`.
 *
 * Acessível por teclado (buttons nativos), mobile-first (sx responsivo), CTA
 * único (um botão por card, contextual). NÃO é uma superfície gamificada: não
 * há XP/streak/placar — só a contagem pedida.
 *
 * A integração com a repo vem por props de um agente paralelo (onda 3.1) — aqui
 * a UI só RENDERIZA o que recebe. Nenhum `data-onboarding-target` novo foi
 * perdido; o alvo `course-continue` é NOVO (ainda não catalogado).
 */
import type { ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import type { CourseItem } from '../../lib/lessonSelection';
import { effectsTransition, FOCUS_RING, focusRingStyles, spatialTransition } from '../../theme';

export interface CourseSelectorProps {
  /** Lista de cursos pronta para render (saída de `buildCourseList`). */
  courses: CourseItem[];
  /** Navega para a aula do assunto (`slug`). */
  onContinue: (slug: string) => void;
  /** Rótulo de seção (opcional; default "Escolha um assunto"). */
  sectionLabel?: string;
  /** Mensagem quando não há cursos (opcional). */
  emptyLabel?: string;
}

const EMPTY = 'Nenhum assunto disponível ainda.';
const SECTION_LABEL = 'Escolha um assunto';

/** Ícone por tipo de botão: play (continua) vs add (gerar nova aula). */
function continueIcon(isNew: boolean): ReactElement {
  return isNew ? <AddRounded fontSize="small" /> : <PlayArrowRounded fontSize="small" />;
}

export default function CourseSelector({
  courses,
  onContinue,
  sectionLabel = SECTION_LABEL,
  emptyLabel = EMPTY,
}: CourseSelectorProps): ReactElement {
  const list = courses ?? [];

  if (list.length === 0) {
    return (
      <Box component="section" sx={{ maxWidth: 680, mx: 'auto' }}>
        <Typography variant="h6" component="h2" gutterBottom>
          {sectionLabel}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {emptyLabel}
        </Typography>
      </Box>
    );
  }

  return (
    <Box component="section" sx={{ maxWidth: 680, mx: 'auto' }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {sectionLabel}
      </Typography>
      <Stack spacing={1}>
        {list.map((course) => {
          const isFresh = course.continueLabel === 'Gerar nova aula';
          return (
            <Card
              key={course.slug}
              variant="outlined"
              sx={(theme) => ({
                // Chrome: radi nítido sobre a superfície — texto é TINTA.
                backgroundColor: theme.vars.palette.surface.level1,
              })}
            >
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" component="h3" noWrap>
                      {course.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {course.progressLabel ? `Progresso: ${course.progressLabel}` : 'Ainda sem aulas'}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    startIcon={continueIcon(isFresh)}
                    onClick={() => onContinue(course.slug)}
                    data-onboarding-target="course-continue"
                    sx={(theme) => ({
                      // Mobile: largura cheia; desktop: conteúdo próprio.
                      alignSelf: { xs: 'stretch', sm: 'flex-start' },
                      minWidth: { xs: '100%', sm: 180 },
                      whiteSpace: 'nowrap',
                      transition: [
                        effectsTransition(theme, ['background-color', 'color'], 'fast'),
                        spatialTransition(theme, ['transform'], 'fast'),
                      ].join(', '),
                      '&:active': { transform: 'scale(0.98)' },
                      '&.Mui-focusVisible': focusRingStyles(theme),
                      '&:focus-visible': focusRingStyles(theme),
                      '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
                    })}
                  >
                    {course.continueLabel}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
