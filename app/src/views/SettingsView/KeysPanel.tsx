/**
 * src/views/SettingsView/KeysPanel.tsx — CONTAINER público do painel de chaves
 * de API (state/view split — STORY-SPEC §5).
 *
 * Só liga o hook de estado (`useKeysPanel`) à view pura (`KeysPanelView`) e
 * mantém o export público que o SettingsView usa. O contrato completo do
 * painel está documentado em ./KeysPanelView.tsx; as decisões de estado e o
 * IPC em ./useKeysPanel.ts.
 */
import type { ReactElement } from 'react';
import { KeysPanelView } from './KeysPanelView';
import { useKeysPanel } from './useKeysPanel';

export { KeysPanelView } from './KeysPanelView';
export type { KeysPanelViewProps, Provider, ProviderState } from './useKeysPanel';

/** Container: só liga o hook de estado à view pura (export público do app). */
export function KeysPanel(): ReactElement {
  return <KeysPanelView {...useKeysPanel()} />;
}
