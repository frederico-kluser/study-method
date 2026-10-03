/**
 * src/views/SettingsView/HardwareView.tsx — bloco do hardware detectado
 * (backend/RAM/VRAM/CPU) do painel de IA local.
 *
 * Bloco puro (só props) — documentado em `Componentes/Definições/HardwareView`.
 * Nomes de marca e strings do hardware (backend, CPU) NÃO se traduzem — vêm da
 * máquina; só o "n/d" (`localAi.notDetermined`) é i18n (W20).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import type { HardwareInfo } from '../../../shared/ipc-contract';

export function HardwareView({ info }: { info: HardwareInfo }): ReactElement {
  const { t } = useTranslation();
  const rows: Array<{ label: string; value: string }> = [
    { label: t('translation:localAi.backend'), value: info.backend },
    { label: t('translation:localAi.ram'), value: `${info.ramGb.toFixed(1)} GB` },
    {
      label: t('translation:localAi.vram'),
      // W20 (onda-ux): o literal 'n/d' era copy SOLTURA — no locale `en` o
      // utilizador via português. Agora é chave (`localAi.notDetermined`:
      // "n/d" / "n/a"). Nomes de marca e strings do hardware (backend, CPU)
      // NÃO se traduzem — vêm da máquina.
      value: info.vramGb == null ? t('translation:localAi.notDetermined') : `${info.vramGb.toFixed(1)} GB`,
    },
    { label: t('translation:localAi.cpu'), value: info.cpuModel },
  ];
  return (
    <Grid container spacing={1}>
      {rows.map((r) => (
        <Grid key={r.label} size={{ xs: 6, sm: 3 }}>
          <Box
            sx={{
              bgcolor: 'background.default',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {r.label}
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word', fontWeight: 600 }}>
              {r.value}
            </Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}
