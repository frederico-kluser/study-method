/**
 * src/storybook/foundations/Icons.stories.tsx — Fundamentos/Ícones.
 *
 * A POLÍTICA de ícones do contrato (regra 6 de src/lib/designTokens.ts) e a
 * galeria dos glifos REALMENTE usados no app — inventário colhido por grep de
 * `@mui/icons-material` e `lucide-react` em app/src/**, com o nome do glifo e
 * os ficheiros onde ele aparece. É a referência que um redesign usa para
 * decidir o que renomear, unificar ou aposentar sem perder o significado.
 *
 * DECISÕES:
 *   - A galeria mostra o COMPONENTE real importado pelo app (o mesmo
 *     `@mui/icons-material/<Glifo>`), não um desenho parecido: o que se
 *     documenta é o glifo exato em produção.
 *   - O exemplo «reprovado» da política renderiza de propósito o que a regra
 *     proíbe (emoji em controlo interativo) — documentar a violação é a única
 *     forma de a tornar reconhecível. No produto isto não aparece.
 *   - `lucide-react` está nas dependências mas tem 0 usos em src/** (verificado
 *     por grep): a política atual é glifos MUI funcionais, uma metáfora por
 *     significado. Se um dia entrar um glifo lucide, esta história é o sítio
 *     onde ele tem de ser registado.
 */
import type { ComponentType, ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import BlockIcon from '@mui/icons-material/Block';
import CalculateIcon from '@mui/icons-material/Calculate';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CloseIcon from '@mui/icons-material/Close';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DescriptionIcon from '@mui/icons-material/Description';
import EditNoteIcon from '@mui/icons-material/EditNote';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import LockIcon from '@mui/icons-material/Lock';
import MemoryIcon from '@mui/icons-material/Memory';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import MicOffIcon from '@mui/icons-material/MicOff';
import MicIcon from '@mui/icons-material/Mic';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PersonIcon from '@mui/icons-material/Person';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import PsychologyIcon from '@mui/icons-material/Psychology';
import QuizIcon from '@mui/icons-material/Quiz';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import SaveIcon from '@mui/icons-material/Save';
import SchoolIcon from '@mui/icons-material/School';
import SendIcon from '@mui/icons-material/Send';
import SettingsBrightnessRoundedIcon from '@mui/icons-material/SettingsBrightnessRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import TerminalIcon from '@mui/icons-material/Terminal';
import TimerIcon from '@mui/icons-material/Timer';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { DocSection } from './parts';

const meta = {
  title: 'Fundamentos/Ícones',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface IconUsado {
  /** Nome do glifo (o que se importa de @mui/icons-material/<glyph>). */
  glyph: string;
  /** O componente REAL usado pelo app. */
  comp: ComponentType<SvgIconProps>;
  /** Onde é usado (caminhos de app/src/). */
  usos: readonly string[];
}

/** Inventário colhido por grep de `@mui/icons-material` em app/src/**. */
const ICONS_USADOS: readonly IconUsado[] = [
  { glyph: 'AddRounded', comp: AddRoundedIcon, usos: ['src/components/course/CourseSelector.tsx'] },
  { glyph: 'ArrowBack', comp: ArrowBackIcon, usos: ['src/views/ChallengeView/TrackChallengePanel.tsx', 'src/views/RoadmapView/RoadmapView.tsx'] },
  { glyph: 'ArrowForwardRounded', comp: ArrowForwardRoundedIcon, usos: ['src/features/onboarding/components/TutorialSelectionModal.tsx'] },
  { glyph: 'ArrowForward', comp: ArrowForwardIcon, usos: ['src/views/GamesView/GameLevelView.tsx', 'src/views/LessonView/LessonView.tsx'] },
  { glyph: 'AssignmentOutlined', comp: AssignmentOutlinedIcon, usos: ['src/components/course/LessonSidebarHeader.tsx', 'src/views/LessonView/LessonView.tsx', 'src/views/RoadmapView/RoadmapView.tsx'] },
  { glyph: 'AutoAwesome', comp: AutoAwesomeIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx', 'src/components/chat/ChatBubble.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx'] },
  { glyph: 'AutoStories', comp: AutoStoriesIcon, usos: ['src/components/chat/chatSurfaces.tsx', 'src/views/LessonView/LessonView.tsx'] },
  { glyph: 'Block', comp: BlockIcon, usos: ['src/views/ChallengeView/ChallengeView.tsx'] },
  { glyph: 'Calculate', comp: CalculateIcon, usos: ['src/views/placeholders.tsx'] },
  { glyph: 'Cancel', comp: CancelIcon, usos: ['src/views/ChallengeView/TrackChallengePanel.tsx', 'src/views/LessonView/LessonQuiz.tsx'] },
  { glyph: 'CheckCircleOutlined', comp: CheckCircleOutlinedIcon, usos: ['src/views/placeholders.tsx'] },
  { glyph: 'CheckCircle', comp: CheckCircleIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx', 'src/components/quiz/QuizChatCard.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx', 'src/views/LessonView/LessonQuiz.tsx', 'src/views/RoadmapView/RoadmapView.tsx'] },
  { glyph: 'CheckRounded', comp: CheckRoundedIcon, usos: ['src/components/tree/EvolutionTree.tsx'] },
  { glyph: 'Check', comp: CheckIcon, usos: ['src/components/markdown/CodeBlock.tsx'] },
  { glyph: 'ChevronRightRounded', comp: ChevronRightRoundedIcon, usos: ['src/components/tree/EvolutionTree.tsx', 'src/views/LessonView/LessonView.tsx'] },
  { glyph: 'ChevronRight', comp: ChevronRightIcon, usos: ['src/components/editor/FileExplorer.tsx'] },
  { glyph: 'CloseRounded', comp: CloseRoundedIcon, usos: ['src/features/onboarding/components/TutorialSelectionModal.tsx'] },
  { glyph: 'Close', comp: CloseIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx', 'src/components/editor/EditorTabs.tsx', 'src/views/LessonView/LessonView.tsx'] },
  { glyph: 'CodeRounded', comp: CodeRoundedIcon, usos: ['src/components/markdown/CodeBlock.tsx'] },
  { glyph: 'Code', comp: CodeIcon, usos: ['src/views/placeholders.tsx'] },
  { glyph: 'ContentCopy', comp: ContentCopyIcon, usos: ['src/components/markdown/CodeBlock.tsx'] },
  { glyph: 'DarkModeRounded', comp: DarkModeRoundedIcon, usos: ['src/components/theme/ThemeModeSelector.tsx'] },
  { glyph: 'DeleteForever', comp: DeleteForeverIcon, usos: ['src/views/SettingsView/OrphanTracksPanel.tsx'] },
  { glyph: 'Delete', comp: DeleteIcon, usos: ['src/components/editor/FileExplorer.tsx', 'src/views/SettingsView/LocalAiPanel.tsx'] },
  { glyph: 'DeleteSweep', comp: DeleteSweepIcon, usos: ['src/views/SettingsView/ProgressPanel.tsx'] },
  { glyph: 'Description', comp: DescriptionIcon, usos: ['src/components/editor/FileExplorer.tsx'] },
  { glyph: 'EditNote', comp: EditNoteIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx'] },
  { glyph: 'ErrorOutlined', comp: ErrorOutlinedIcon, usos: ['src/views/placeholders.tsx'] },
  { glyph: 'Error', comp: ErrorIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx'] },
  { glyph: 'ExpandLess', comp: ExpandLessIcon, usos: ['src/views/ChallengeView/ChallengeView.tsx'] },
  { glyph: 'ExpandMore', comp: ExpandMoreIcon, usos: ['src/components/editor/FileExplorer.tsx', 'src/views/ChallengeView/ChallengeView.tsx', 'src/views/RoadmapView/RoadmapView.tsx'] },
  { glyph: 'Folder', comp: FolderIcon, usos: ['src/components/editor/FileExplorer.tsx'] },
  { glyph: 'HelpRounded', comp: HelpRoundedIcon, usos: ['src/features/onboarding/components/TutorialHelpButton.tsx'] },
  { glyph: 'HistoryEdu', comp: HistoryEduIcon, usos: ['src/components/course/LessonSidebarHeader.tsx'] },
  { glyph: 'HomeRounded', comp: HomeRoundedIcon, usos: ['src/components/shell/NavigationRail.tsx'] },
  { glyph: 'InfoOutlined', comp: InfoOutlinedIcon, usos: ['src/components/quiz/QuizChatCard.tsx', 'src/components/quiz/QuizOverlayHost.tsx', 'src/features/onboarding/components/TutorialSelectionModal.tsx'] },
  { glyph: 'LightModeRounded', comp: LightModeRoundedIcon, usos: ['src/components/theme/ThemeModeSelector.tsx'] },
  { glyph: 'Lock', comp: LockIcon, usos: ['src/views/LessonView/LessonView.tsx', 'src/views/placeholders.tsx', 'src/views/RoadmapView/RoadmapView.tsx'] },
  { glyph: 'Memory', comp: MemoryIcon, usos: ['src/views/ChallengeView/ChallengeView.tsx'] },
  { glyph: 'MenuBookRounded', comp: MenuBookRoundedIcon, usos: ['src/components/shell/NavigationRail.tsx'] },
  { glyph: 'MenuBook', comp: MenuBookIcon, usos: ['src/components/chat/ChatBubble.tsx', 'src/components/course/LessonSidebarHeader.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx'] },
  { glyph: 'MicOff', comp: MicOffIcon, usos: ['src/views/LessonView/LessonView.tsx'] },
  { glyph: 'Mic', comp: MicIcon, usos: ['src/views/LessonView/LessonView.tsx'] },
  { glyph: 'NoteAdd', comp: NoteAddIcon, usos: ['src/components/editor/FileExplorer.tsx'] },
  { glyph: 'OpenInNew', comp: OpenInNewIcon, usos: ['src/views/LessonView/LessonView.tsx'] },
  { glyph: 'Person', comp: PersonIcon, usos: ['src/components/chat/chatSurfaces.tsx'] },
  { glyph: 'PlayArrowRounded', comp: PlayArrowRoundedIcon, usos: ['src/components/course/CourseSelector.tsx'] },
  { glyph: 'PlayArrow', comp: PlayArrowIcon, usos: ['src/views/ChallengeView/ChallengeView.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx', 'src/views/GamesView/GameLevelView.tsx'] },
  { glyph: 'PlayCircleOutlined', comp: PlayCircleOutlinedIcon, usos: ['src/views/RoadmapView/RoadmapView.tsx'] },
  { glyph: 'PlayCircle', comp: PlayCircleIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx', 'src/views/RoadmapView/RoadmapView.tsx'] },
  { glyph: 'Psychology', comp: PsychologyIcon, usos: ['src/views/placeholders.tsx'] },
  { glyph: 'Quiz', comp: QuizIcon, usos: ['src/components/quiz/QuizChatCard.tsx'] },
  { glyph: 'Refresh', comp: RefreshIcon, usos: ['src/components/editor/FileExplorer.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx'] },
  { glyph: 'Replay', comp: ReplayIcon, usos: ['src/components/chat/ChatBubble.tsx', 'src/components/quiz/QuizChatCard.tsx', 'src/components/quiz/QuizOverlayHost.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx', 'src/views/GamesView/GameLevelView.tsx'] },
  { glyph: 'RestartAlt', comp: RestartAltIcon, usos: ['src/components/quiz/QuizChatCard.tsx', 'src/components/quiz/QuizOverlayHost.tsx'] },
  { glyph: 'RouteRounded', comp: RouteRoundedIcon, usos: ['src/components/shell/NavigationRail.tsx'] },
  { glyph: 'Save', comp: SaveIcon, usos: ['src/components/editor/EditorPane.tsx'] },
  { glyph: 'School', comp: SchoolIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx'] },
  { glyph: 'Send', comp: SendIcon, usos: ['src/views/LessonView/LessonView.tsx'] },
  { glyph: 'SettingsBrightnessRounded', comp: SettingsBrightnessRoundedIcon, usos: ['src/components/theme/ThemeModeSelector.tsx'] },
  { glyph: 'SettingsRounded', comp: SettingsRoundedIcon, usos: ['src/components/shell/NavigationRail.tsx'] },
  { glyph: 'SportsEsportsRounded', comp: SportsEsportsRoundedIcon, usos: ['src/components/shell/NavigationRail.tsx'] },
  { glyph: 'StarBorder', comp: StarBorderIcon, usos: ['src/views/ChallengeView/ChallengeView.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx'] },
  { glyph: 'Star', comp: StarIcon, usos: ['src/views/ChallengeView/ChallengeView.tsx', 'src/views/ChallengeView/TrackChallengePanel.tsx'] },
  { glyph: 'TerminalRounded', comp: TerminalRoundedIcon, usos: ['src/components/markdown/CodeBlock.tsx'] },
  { glyph: 'Terminal', comp: TerminalIcon, usos: ['src/views/placeholders.tsx'] },
  { glyph: 'Timer', comp: TimerIcon, usos: ['src/views/ChallengeView/ChallengeView.tsx'] },
  { glyph: 'VerticalAlignTop', comp: VerticalAlignTopIcon, usos: ['src/components/challenge/ChallengeGenerateModal.tsx'] },
  { glyph: 'VisibilityOff', comp: VisibilityOffIcon, usos: ['src/gate/SetupView.tsx', 'src/views/SettingsView/KeysPanel.tsx'] },
  { glyph: 'Visibility', comp: VisibilityIcon, usos: ['src/gate/SetupView.tsx', 'src/views/SettingsView/KeysPanel.tsx'] },
  { glyph: 'WorkspacePremium', comp: WorkspacePremiumIcon, usos: ['src/views/RoadmapView/RoadmapView.tsx'] },
];

/* ─── Vistas puras ────────────────────────────────────────────────────────── */

function IconTile({ icono }: { icono: IconUsado }): ReactElement {
  return (
    <Paper variant="sunken" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <icono.comp fontSize="medium" />
        <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily, overflowWrap: 'anywhere' }}>
          {icono.glyph}
        </Typography>
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 2 }}>
        {icono.usos.map((uso) => (
          <Box component="li" key={uso}>
            <Typography component="code" variant="caption" sx={{ color: 'text.secondary', fontFamily: (t) => t.typography.code.fontFamily, overflowWrap: 'anywhere' }}>
              {uso}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/* ─── 1. A política (regra 6 de designTokens.ts) ──────────────────────────── */

export const Política: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Política de ícones e emoji (regra 6 do contrato)"
        lead="«NENHUM emoji em controle interativo; emoji de celebração só em copy de status de uso único. Glifo de controle é MUI funcional, uma metáfora por significado. E UMA regra de tinta por nível de ação: a ação destacada leva o acento e as irmãs ficam em tinta neutra — nunca duas linguagens de tinta na mesma fileira.» (designTokens.ts, ONDA-UX-AUDIT-2-AULA, finding-3)"
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 2 }}>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
            <Typography variant="overline">Reprovado — emoji em controlo</Typography>
            {/* O emoji abaixo documenta a VIOLAÇÃO (regra 6); nunca no produto. */}
            <Button variant="outlined">🎉 Concluir</Button>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Emoji lê como gamificação e não é acessível como significado de ação.
            </Typography>
          </Paper>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
            <Typography variant="overline">Correto — glifo MUI funcional</Typography>
            <Button variant="outlined" startIcon={<CheckCircleIcon />}>
              Concluir
            </Button>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Glifo funcional + rótulo; o ícone reforça, nunca substitui o texto da ação.
            </Typography>
          </Paper>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
            <Typography variant="overline">Permitido — copy de status de uso único</Typography>
            <Typography variant="body2">Aula concluída! 🎉</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Celebração vive na copy do momento, não em controlo nem em estado permanente.
            </Typography>
          </Paper>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">Uma metáfora por significado</Typography>
          <Typography variant="body2" sx={{ maxWidth: '80ch' }}>
            Cada glifo significa UMA coisa no app inteiro: <strong>AutoStories</strong> é a
            persona Tutor e de mais ninguém; <strong>EmojiEvents</strong> (troféu) foi
            aposentado por ler como gamificação. Quando dois sítios precisam do mesmo
            significado, recebem o mesmo glifo; quando um glifo aparece com dois
            significados, um deles está errado.
          </Typography>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">Uma regra de tinta por nível de ação</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1 }}>
            <Button variant="contained">Avançar</Button>
            <Button variant="text" color="inherit">
              Rever
            </Button>
            <Button variant="text" color="inherit">
              Anotar
            </Button>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, maxWidth: '80ch' }}>
            A ação destacada leva o acento (preenchimento/`primary.fill`); as irmãs ficam em
            tinta neutra (`inherit` → `text.primary`). Duas linguagens de tinta na mesma
            fileira competem com o único acento que deve estar vivo na tela.
          </Typography>
        </Box>
      </DocSection>
    </Box>
  ),
};

/* ─── 2. A galeria (o que o app realmente usa) ────────────────────────────── */

export const Galeria: Story = {
  render: () => (
    <Box>
      <DocSection
        title={`Galeria — ${ICONS_USADOS.length} glifos em uso (varrimento de app/src/**)`}
        lead="Inventário por grep de `@mui/icons-material` e `lucide-react`. Cada entrada mostra o glifo exato importado pelo app e os ficheiros onde vive. `lucide-react` está nas dependências mas tem 0 usos hoje."
      >
        <Box
          sx={(t) => ({
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${t.spacing(34)}, 1fr))`,
            gap: 1.5,
          })}
        >
          {ICONS_USADOS.map((icono) => (
            <IconTile key={icono.glyph} icono={icono} />
          ))}
        </Box>
      </DocSection>
    </Box>
  ),
};
