/**
 * src/views/SettingsView/KeysPanel.tsx — painel de chaves de API em Material UI.
 *
 * Mesmo contrato IPC do KeysPanel antigo (onda 3/4), agora renderizado em MUI:
 *
 *  - TextField `type={visible ? 'text' : 'password'}` com toggle de
 *    mostrar/ocultar via InputAdornment + IconButton (Visibility/VisibilityOff).
 *  - Estado configurada/validada vindo de `keys.getStatus` na MONTAGEM (Chips).
 *  - Botão "Salvar" → `keys.setKey(provider, key)`; botão "Validar" →
 *    `keys.validateDeepseek(provider==='deepseek')` / `keys.validateBrave(...)`,
 *    passando a chave DIGITADA (ou a salva no store quando nada foi digitado).
 *    O feedback é renderizado em `<Alert>` via lógica pura `validationAlert`
 *    (src/lib/validationAlert.ts → chaves i18n keys.*).
 *  - loading nos botões durante salvar/validar (spinner + disabled).
 *
 * Nenhuma view acessa `window` diretamente — só `getApi()` (testável sem jsdom).
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import type { KeysStatus, ValidationResult } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { isNonEmpty } from '../../lib/validate';
import { validationAlert } from '../../lib/validationAlert';

type Provider = 'deepseek' | 'brave';

const PROVIDER_META: Record<
  Provider,
  {
    name: string;
    inputLabelKey: 'translation:keys.deepseek.label' | 'translation:keys.brave.label';
    placeholder: string;
  }
> = {
  deepseek: {
    name: 'DeepSeek',
    inputLabelKey: 'translation:keys.deepseek.label',
    placeholder: 'sk-…',
  },
  brave: {
    name: 'Brave Search',
    inputLabelKey: 'translation:keys.brave.label',
    placeholder: 'BSA…',
  },
};

interface ProviderState {
  value: string;
  visible: boolean;
  /** Estado visual do alert (APENAS para o fluxo antigo de mensagem hardcoded). */
  message: string;
  uiState: 'idle' | 'validating' | 'valid' | 'invalid';
  saving: boolean;
}

function idleState(): ProviderState {
  return {
    value: '',
    visible: false,
    message: '',
    uiState: 'idle',
    saving: false,
  };
}

export function KeysPanel(): ReactElement {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Record<Provider, ProviderState>>({
    deepseek: idleState(),
    brave: idleState(),
  });
  const [initialStatus, setInitialStatus] = useState<KeysStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .keys.getStatus()
      .then((status) => {
        if (!cancelled) setInitialStatus(status);
      })
      .catch(() => {
        if (!cancelled) {
          setInitialStatus({
            deepseekConfigured: false,
            braveConfigured: false,
            deepseekValidated: false,
            braveValidated: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = useCallback(
    (provider: Provider, fn: (s: ProviderState) => ProviderState) => {
      setProviders((prev) => ({ ...prev, [provider]: fn(prev[provider]) }));
    },
    [],
  );

  const handleSave = async (provider: Provider): Promise<void> => {
    const value = providers[provider].value;
    if (!isNonEmpty(value)) {
      patch(provider, (s) => ({
        ...s,
        uiState: 'invalid',
        message: t('translation:keys.invalid', 'Digite a chave antes de salvar.'),
      }));
      return;
    }
    patch(provider, (s) => ({ ...s, saving: true }));
    try {
      await getApi().keys.setKey(provider, value.trim());
      patch(provider, (s) => ({
        ...s,
        saving: false,
        uiState: 'valid',
        message: t('translation:keys.saved', 'Chave salva.'),
      }));
    } catch (err) {
      patch(provider, (s) => ({
        ...s,
        saving: false,
        uiState: 'invalid',
        message: t('translation:keys.errorNetwork', 'Falha ao salvar a chave.'),
      }));
      void err;
    }
  };

  const handleValidate = async (provider: Provider): Promise<void> => {
    const typed = providers[provider].value.trim();
    const validate =
      provider === 'deepseek'
        ? getApi().keys.validateDeepseek
        : getApi().keys.validateBrave;

    patch(provider, (s) => ({
      ...s,
      uiState: 'validating',
      message: t('translation:keys.validating', `Validando chave ${PROVIDER_META[provider].name}…`),
    }));

    let result: ValidationResult;
    try {
      result = await validate(typed.length > 0 ? typed : (undefined as unknown as string));
    } catch (err) {
      void err;
      patch(provider, (s) => ({
        ...s,
        uiState: 'invalid',
        message: t('translation:keys.errorNetwork', 'Erro de rede/requisição ao validar a chave.'),
      }));
      return;
    }

    // Feedback via lógica pura: decide i18nKey/severity do <Alert>.
    const alert = validationAlert(result);
    patch(provider, (s) => ({
      ...s,
      uiState: alert.i18nKey === 'translation:keys.valid' ? 'valid' : 'invalid',
      message: t(alert.i18nKey),
    }));
  };

  const renderProvider = (provider: Provider): ReactElement => {
    const meta = PROVIDER_META[provider];
    const st = providers[provider];
    const configured =
      initialStatus?.[provider === 'deepseek' ? 'deepseekConfigured' : 'braveConfigured'];
    const validated =
      initialStatus?.[provider === 'deepseek' ? 'deepseekValidated' : 'braveValidated'];
    const validating = st.uiState === 'validating';

    return (
      <Card key={provider} variant="outlined" sx={{ display: 'flex', flex: '1 1 280px' }}>
        <CardContent sx={{ width: '100%' }}>
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {meta.name}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Chip
                  size="small"
                  color={configured ? 'success' : 'default'}
                  label={configured ? t('translation:keys.configured') : t('translation:keys.notConfigured')}
                />
                {validated ? (
                  <Chip size="small" color="success" label={t('translation:keys.valid')} />
                ) : null}
              </Stack>
            </Box>

            <TextField
              label={t(meta.inputLabelKey)}
              placeholder={meta.placeholder}
              value={st.value}
              onChange={(e) =>
                patch(provider, (s) => ({
                  ...s,
                  value: e.target.value,
                  visible: s.visible,
                  uiState: 'idle',
                  message: '',
                }))
              }
              type={st.visible ? 'text' : 'password'}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={st.visible ? 'Ocultar chave' : 'Mostrar chave'}
                        onClick={() =>
                          patch(provider, (s) => ({ ...s, visible: !s.visible }))
                        }
                        edge="end"
                        size="small"
                      >
                        {st.visible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                disabled={st.saving}
                onClick={() => void handleSave(provider)}
              >
                {st.saving ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                {st.saving ? t('translation:common.loading', 'Salvando…') : t('translation:keys.save')}
              </Button>
              <Button
                variant="contained"
                disabled={validating}
                onClick={() => void handleValidate(provider)}
              >
                {validating ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                {validating ? t('translation:keys.validating') : t('translation:keys.validate')}
              </Button>
            </Stack>

            {st.message ? (
              <Alert severity={st.uiState === 'valid' ? 'success' : 'error'} sx={{ fontSize: 13 }}>
                {st.message}
              </Alert>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    );
  };

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap>
      {renderProvider('deepseek')}
      {renderProvider('brave')}
    </Stack>
  );
}