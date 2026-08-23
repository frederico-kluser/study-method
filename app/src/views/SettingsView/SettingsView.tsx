/**
 * src/views/SettingsView/SettingsView.tsx — tela de Configurações em Material UI.
 *
 * Compõe o painel de chaves de API (KeysPanel) e o painel de LLM local
 * (LocalAiPanel) num Container com maxWidth="md", seções em Typography e
 * separadores (Divider). Responsivo, mobile-first, tema dark.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { KeysPanel } from './KeysPanel';
import { LocalAiPanel } from './LocalAiPanel';

export default function SettingsView(): ReactElement {
  const { t } = useTranslation();
  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack spacing={3}>
        <div>
          <Typography variant="h5" component="h1" gutterBottom>
            {t('translation:nav.settings')}
          </Typography>

          <Stack spacing={3}>
            <section aria-labelledby="settings-keys-title">
              <Typography variant="h6" id="settings-keys-title">
                Chaves de API
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Configure as chaves do DeepSeek (geração de aulas) e do Brave
                Search (pesquisa de fontes). Valide cada uma antes de usar.
              </Typography>
              <KeysPanel />
            </section>

            <Divider />

            <section aria-labelledby="settings-localai-title">
              <Typography variant="h6" id="settings-localai-title">
                LLM local
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Detecção de hardware e modelos locais. Baixe um modelo, ative-o e
                selecione &quot;Modelo local&quot; no provedor de feedback para avaliar
                desafios sem depender da nuvem.
              </Typography>
              <LocalAiPanel />
            </section>
          </Stack>
        </div>
      </Stack>
    </Container>
  );
}