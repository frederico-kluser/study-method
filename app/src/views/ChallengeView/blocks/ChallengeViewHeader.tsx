/**
 * src/views/ChallengeView/blocks/ChallengeViewHeader.tsx — cabeçalho da tela
 * de Desafio: título da aba + seletor de desafios do setup (picker).
 *
 * VIEW PURA (docs/storybook/STORY-SPEC.md §5): só props, zero IPC, zero
 * estado. O picker só aparece quando o desafio NÃO veio do contexto de aula
 * (ChallengeNav) — aí a seleção é do contexto e o picker some.
 *
 * O TÍTULO é o `SectionHeader` de nível 1 (auditoria §8): cabeçalho de
 * PÁGINA é `<h1>` e o talhe sai do mapeamento do `SectionHeader.state.ts`
 * (`level={1}` → h4 como h1). A linha responsiva (título + picker) continua
 * aqui — o picker é `minWidth: 100%` em `xs`, que numa linha única o
 * espremeria; por isso ele fica como irmão do cabeçalho, não no slot de
 * ações.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { SectionHeader } from '../../../components/ui/SectionHeader';

export interface ChallengePickerOption {
  challengeId: string;
  title: string;
  language: string;
}

export interface ChallengePickerState {
  /** Desafio selecionado (vazio = nenhum). */
  value: string;
  /** A lista ainda está a carregar (mostra o item "Carregando…"). */
  loading: boolean;
  /** Desabilitado durante a lista E durante o teste em voo. */
  disabled: boolean;
  options: ChallengePickerOption[];
  onSelect: (challengeId: string) => void;
}

export interface ChallengeViewHeaderProps {
  /** Mostrar o seletor (escondido quando a seleção veio do contexto). */
  showPicker: boolean;
  picker: ChallengePickerState;
}

export function ChallengeViewHeader({ showPicker, picker }: ChallengeViewHeaderProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
    >
      <SectionHeader level={1} title={t('translation:nav.challenge')} />
      {showPicker ? (
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 } }}>
          <InputLabel id="challenge-picker-label">{t('translation:challenge.openChallenge')}</InputLabel>
          <Select
            labelId="challenge-picker-label"
            id="challenge-picker"
            label={t('translation:challenge.openChallenge')}
            value={picker.value}
            // Desabilitado durante a lista E durante o teste em voo (fase
            // determinística + pi): trocar de desafio no meio deixaria um
            // resultado de A caindo na tela de B (a guarda de identidade em
            // runTests cobre a troca por contexto de aula, que não passa
            // por aqui).
            disabled={picker.loading || picker.disabled}
            onChange={(e) => picker.onSelect(e.target.value)}
          >
            {picker.loading ? (
              <MenuItem value="" disabled>{t('translation:common.loading')}</MenuItem>
            ) : picker.options.length === 0 ? (
              <MenuItem value="">{t('translation:challenge.none')}</MenuItem>
            ) : (
              picker.options.map((c) => (
                <MenuItem key={c.challengeId} value={c.challengeId}>
                  {c.title} ({c.language})
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
      ) : null}
    </Stack>
  );
}
