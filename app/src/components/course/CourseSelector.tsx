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
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import type { CourseItem } from '../../lib/lessonSelection';
import { LAYOUT } from '../../lib/designTokens';
import { effectsTransition, focusRingStyles } from '../../theme';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';
import { courseActionKind, courseProgressText } from './courseSelectionState';

export interface CourseSelectorProps {
  /** Lista de cursos pronta para render (saída de `buildCourseList`). */
  courses: CourseItem[];
  /** Navega para a aula do assunto (`slug`). */
  onContinue: (slug: string) => void;
  /** Rótulo de seção (opcional; default: `course.sectionLabel`, com o texto legado por omissão). */
  sectionLabel?: string;
  /** Mensagem quando não há cursos (opcional; default: `course.empty`, com o texto legado por omissão). */
  emptyLabel?: string;
}

/** Defaults LEGADOS em pt-BR — hoje o defaultValue das chaves `course.*`. */
const EMPTY = 'Nenhum assunto disponível ainda.';
const SECTION_LABEL = 'Escolha um assunto';

/** Ícone por tipo de botão: play (continua) vs add (gerar nova aula). */
function continueIcon(isNew: boolean): ReactElement {
  return isNew ? <AddRounded fontSize="small" /> : <PlayArrowRounded fontSize="small" />;
}

export default function CourseSelector({
  courses,
  onContinue,
  sectionLabel,
  emptyLabel,
}: CourseSelectorProps): ReactElement {
  const list = courses ?? [];
  // i18n da casa: os defaults são as chaves `course.sectionLabel`/`course.empty`
  // (chave tipada `translation:…`, strictKeyChecks) com o texto legado em pt-BR
  // como defaultValue — "mantém os defaults, aponta-os para as chaves".
  const { t } = useTranslation();
  const label = sectionLabel ?? t('translation:course.sectionLabel', SECTION_LABEL);
  const empty = emptyLabel ?? t('translation:course.empty', EMPTY);
  // Tema no corpo (view pura — `useTheme` é permitido): o `sx` do `ActionButton`
  // é um objeto puro (contrato do primitivo) e as transições/anel de foco vêm
  // dos helpers do tema, sem hex nem valores novos.
  const theme = useTheme();

  if (list.length === 0) {
    // Empty-state CANÓNICO do design system (`EmptyState` — PRIMITIVES.md §4):
    // título + descrição centrados, sem bloco de layout copiado. A largura é a
    // mesma coluna do seletor (`LAYOUT.chooserColumnPx`).
    return <EmptyState title={label} description={empty} width={LAYOUT.chooserColumnPx} />;
  }

  return (
    <Box component="section" sx={{ maxWidth: LAYOUT.chooserColumnPx, mx: 'auto' }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {label}
      </Typography>
      <Stack spacing={1}>
        {list.map((course) => {
          // Estado de SELEÇÃO/AÇÃO puro (courseSelectionState.ts): qual a
          // ação do curso — decidido no módulo testado, nunca por comparação
          // de texto de rótulo dentro da view.
          const isNew = courseActionKind(course) === 'generate';
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
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {courseProgressText(course.progressLabel)}
                    </Typography>
                  </Box>
                  <ActionButton
                    variant="contained"
                    startIcon={continueIcon(isNew)}
                    onClick={() => onContinue(course.slug)}
                    data-onboarding-target="course-continue"
                    sx={{
                      // Mobile: largura cheia; desktop: conteúdo próprio.
                      alignSelf: { xs: 'stretch', sm: 'flex-start' },
                      minWidth: { xs: '100%', sm: 180 },
                      // DRY (auditoria de layout §2): o press-feedback
                      // (`&:active` scale 0.98 + transition espacial +
                      // guarda de prefers-reduced-motion) vive na casca
                      // `Pressable` do `ActionButton` — bloco aposentado.
                      // `actionButtonSx` já traz o piso de toque + `nowrap`.
                      transition: effectsTransition(theme, ['background-color', 'color'], 'fast'),
                      '&.Mui-focusVisible': focusRingStyles(theme),
                      '&:focus-visible': focusRingStyles(theme),
                    }}
                  >
                    {course.continueLabel}
                  </ActionButton>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
