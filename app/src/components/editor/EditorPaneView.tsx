/**
 * src/components/editor/EditorPaneView.tsx — VIEW pura do painel do editor
 * (barra "Salvar" + abas + estado erro/ocupado + CodeMirrorField).
 *
 * Contrato state/view (STORY-SPEC §5): este componente SÓ apresenta — recebe
 * o estado das abas, o erro e o ocupado por props e devolve intenções por
 * callbacks. Não toca em `getApi()`, nem em disco, nem guarda estado: quem
 * amarra o reducer puro (`lib/editorTabs.ts`) e o IPC
 * (`study.readWorkspaceFile`/`writeWorkspaceFile`/`deleteWorkspaceFile`) ao
 * render é o container `EditorPane.tsx` (que mantém os exports públicos que a
 * ChallengeView usa). É esta a fronteira que o Storybook renderiza.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import SaveIcon from '@mui/icons-material/Save';
import { activeTab, type EditorTab } from '../../lib/editorTabs';
import { CodeMirrorField } from '../cm/CodeMirrorField';
import { EditorTabs } from './EditorTabs';

/** Props de {@link EditorPaneView} — estado por props, intenções por callbacks. */
export interface EditorPaneViewProps {
  /** Abas abertas (ordem de abertura). */
  tabs: EditorTab[];
  /** Path da aba ativa (null quando nenhuma). */
  activePath: string | null;
  /** Mensagem de erro atual (vazia/omitida = sem erro). */
  error?: string;
  /** Path com abertura em curso (null/omitido = nenhuma). */
  busyPath?: string | null;
  /** Salva a aba ativa (Ctrl/Cmd+S ou botão). */
  onSaveActive: () => void;
  /** Ativa uma aba (com autosave da atual se suja — decisão do container). */
  onActivate: (path: string) => void;
  /** Fecha uma aba (com autosave se suja — decisão do container). */
  onClose: (path: string) => void;
  /** Buffer do editor mudou. */
  onContentChange: (value: string) => void;
}

/**
 * Painel de edição com abas, sem estado próprio. O botão "Salvar" fica
 * DESABILITADO sem aba ativa (o estado "desabilitado" do componente).
 */
export function EditorPaneView({
  tabs,
  activePath,
  error,
  busyPath,
  onSaveActive,
  onActivate,
  onClose,
  onContentChange,
}: EditorPaneViewProps): ReactElement {
  const { t } = useTranslation();
  // t() com interpolação (cast documentado na ChallengeView): `saveAria` leva
  // {{shortcut}} — o atalho também chega a quem usa leitor de tela (S5).
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;

  const active = activeTab({ tabs, activePath });
  const empty = tabs.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: 0.25 }}>
        <Button
          size="small"
          variant="text"
          startIcon={<SaveIcon />}
          // S5 (auditoria de UX): o atalho vivia SÓ no `title` (hover) — para
          // quem usa leitor de tela ou chega por teclado, o botão dizia apenas
          // "Salvar". O `aria-label` passa a levar o atalho também (o title
          // continua, para o hover); o texto do atalho vem do i18n nos dois.
          title={`${t('translation:editor.save')} (${t('translation:editor.saveShortcut')})`}
          aria-label={tI('translation:editor.saveAria', {
            shortcut: t('translation:editor.saveShortcut'),
          })}
          onClick={onSaveActive}
          disabled={!active}
        >
          {t('translation:editor.save')}
        </Button>
      </Box>

      <EditorTabs
        tabs={tabs}
        activePath={activePath}
        onActivate={onActivate}
        onClose={onClose}
      />

      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        {error ? (
          <Alert severity="error" sx={{ m: 1 }}>
            {error}
          </Alert>
        ) : null}
        {busyPath ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 1 }}>
            {`${t('translation:editor.opening')} ${busyPath}…`}
          </Typography>
        ) : null}
        {empty ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 1 }}>
            {t('translation:editor.selectFilePrompt')}
          </Typography>
        ) : active ? (
          <CodeMirrorField
            value={active.content}
            onChange={onContentChange}
            filename={active.name}
            ariaLabel={`${t('translation:editor.editorAria')} — ${active.path}`}
            onSave={onSaveActive}
          />
        ) : null}
      </Box>
    </Box>
  );
}
