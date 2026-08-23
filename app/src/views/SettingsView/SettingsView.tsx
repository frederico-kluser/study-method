/**
 * src/views/SettingsView/SettingsView.tsx — tela de Configurações.
 *
 * Compõe o painel de chaves de API (DeepSeek/Brave) e o painel de LLM local.
 * Nenhuma view acessa `window` diretamente: toda API passa por `getApi()`.
 */
import type { ReactElement } from 'react';
import { KeysPanel } from './KeysPanel';
import { LocalAiPanel } from './LocalAiPanel';

export default function SettingsView(): ReactElement {
  return (
    <section className="view settings">
      <h1 className="settings__title">Configurações</h1>

      <section className="settings__section">
        <h2 className="settings__section-title">Chaves de API</h2>
        <p className="settings__hint">
          Configure as chaves do DeepSeek (geração de aulas) e do Brave Search
          (pesquisa de fontes). Valide cada uma antes de usar.
        </p>
        <KeysPanel />
      </section>

      <section className="settings__section">
        <h2 className="settings__section-title">LLM local</h2>
        <p className="settings__hint">
          Detecção de hardware e modelos locais (node-llama-cpp). Baixe um modelo, ative-o e
          selecione "Modelo local" no provedor de feedback abaixo para que o modelo avalie os
          desafios sem depender da nuvem.
        </p>
        <LocalAiPanel />
      </section>
    </section>
  );
}