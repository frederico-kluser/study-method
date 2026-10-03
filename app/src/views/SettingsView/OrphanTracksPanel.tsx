/**
 * src/views/SettingsView/OrphanTracksPanel.tsx — CONTAINER público do painel de
 * RESQUÍCIOS (state/view split — STORY-SPEC §5).
 *
 * Só liga o hook de estado (`useOrphanTracksPanel`) à view pura
 * (`OrphanTracksPanelView`) e mantém o export público do SettingsView. O
 * contrato do painel está em ./OrphanTracksPanelView.tsx; estado/IPC em
 * ./useOrphanTracksPanel.ts; a linha de resquício em ./OrphanRow.tsx.
 */
import type { ReactElement } from 'react';
import { OrphanTracksPanelView } from './OrphanTracksPanelView';
import { useOrphanTracksPanel } from './useOrphanTracksPanel';

export { OrphanTracksPanelView } from './OrphanTracksPanelView';
export type { OrphanTracksPanelViewProps } from './useOrphanTracksPanel';

export function OrphanTracksPanel(): ReactElement {
  return <OrphanTracksPanelView {...useOrphanTracksPanel()} />;
}
