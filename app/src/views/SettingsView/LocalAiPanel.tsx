/**
 * src/views/SettingsView/LocalAiPanel.tsx — CONTAINER público do painel de LLM
 * local (state/view split — STORY-SPEC §5).
 *
 * Só liga o hook de estado (`useLocalAiPanel`) à view pura (`LocalAiPanelView`)
 * e mantém o export público do SettingsView. O contrato do painel está em
 * ./LocalAiPanelView.tsx; estado/IPC (incl. o fluxo de download com progresso)
 * em ./useLocalAiPanel.ts; blocos em ./HardwareView.tsx e ./LocalAiModelCard.tsx.
 */
import type { ReactElement } from 'react';
import { LocalAiPanelView } from './LocalAiPanelView';
import { useLocalAiPanel } from './useLocalAiPanel';

export { LocalAiPanelView } from './LocalAiPanelView';
export type { LocalAiPanelViewProps } from './useLocalAiPanel';

export function LocalAiPanel(): ReactElement {
  return <LocalAiPanelView {...useLocalAiPanel()} />;
}
