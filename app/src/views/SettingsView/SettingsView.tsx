/**
 * src/views/SettingsView/SettingsView.tsx — tela de Configurações em Material UI.
 *
 * Compõe o painel de aparência (tema da interface — ThemeModeSelector), o painel
 * de chaves de API (KeysPanel) e o painel de LLM local (LocalAiPanel) num
 * Container com maxWidth="md", seções em Typography e separadores (Divider).
 * Responsivo, mobile-first, tema dark.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ThemeModeSelector from '../../components/theme/ThemeModeSelector';
import { SettingsSection } from '../../components/ui/SettingsSection';
import { KeysPanel } from './KeysPanel';
import { LocalAiPanel } from './LocalAiPanel';
import { OrphanTracksPanel } from './OrphanTracksPanel';
import { ProgressPanel } from './ProgressPanel';

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
            {/* ONDA-TEMA-SELETOR: o tema JÁ podia ser trocado no pé da coluna
                lateral — aqui fica o mesmo controlo com rótulos, o lugar que o
                utilizador procura quando quer "mudar o tema". SELEÇÃO direTA
                (claro/sistema/escuro), nunca ciclo. */}
            <SettingsSection
              id="settings-appearance"
              title={t('translation:settings.section.appearance')}
              description={t('translation:settings.appearanceDescription')}
            >
              <ThemeModeSelector variant="full" />
            </SettingsSection>

            <Divider />

            <SettingsSection
              id="settings-keys"
              onboardingTarget="settings-keys-section"
              title={t('translation:settings.keysTitle')}
              description={t('translation:settings.keysDescription')}
            >
              <KeysPanel />
            </SettingsSection>

            <Divider />

            <SettingsSection
              id="settings-localai"
              title={t('translation:settings.localAiTitle')}
              description={t('translation:settings.localAiDescription')}
            >
              <LocalAiPanel />
            </SettingsSection>

            <Divider />

            {/* ONDA9 (cache-reconcilia): RESQUÍCIOS — progresso guardado de
                trilhas que não estão mais no disco. Some do Início (para não
                virar link morto) mas nunca evapora: aqui ele é listado item a
                item e só sai com confirmação explícita do dono. */}
            <OrphanTracksPanel />

            <Divider />

            {/* ONDA1-NAV-UI (reset de progresso): apaga o AVANÇO do aluno com
                confirmação — o currículo/configurações nunca são tocados. */}
            <ProgressPanel />
          </Stack>
        </div>
      </Stack>
    </Container>
  );
}