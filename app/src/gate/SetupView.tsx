/**
 * src/gate/SetupView.tsx — formulário OBRIGATÓRIO de chaves do GATE DE INÍCIO.
 * CHROME MUI v9 + useTranslation real (removeu o tSafe).
 *
 * Renderizado pelo AppGate quando `keys:startup-status` devolve phase 'blocked'
 * (chave faltando ou inválida). O usuário NÃO pode entrar no app sem as DUAS
 * chaves validadas.
 *
 * Fluxo por provedor (mesmo padrão do SettingsView/KeysPanel, mas próprio aqui):
 *   - TextField password com toggle de visibilidade (Visibility/VisibilityOff);
 *   - "Validar" → keys.validateLlm(typed) / keys.validateBrave(typed),
 *     validando a chave DIGITADA SEM salvar;
 *   - "Salvar" → keys.setKey(provider, key) para as DUAS, e revalida (via
 *     onDone → AppGate re-executa o gate no main); só habilitado quando AMBAS
 *     validaram.
 *
 * O LanguageSwitcher (src/i18n) é montado no slot — o antigo
 * <div id="language-switcher-slot"> é substituído.
 *
 * RODADA 10 (onda 2b — sem spinner infinito): além do timeout do validador no
 * MAIN (apiKeyValidator, ~8s), o renderer tem uma GUARDA própria de 10s —
 * defesa em profundidade: se o IPC pendurar por qualquer motivo, o spinner
 * para com mensagem de erro clara e o botão volta a ficar habilitado. Nunca
 * spinner eterno.
 */
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { ValidationResult } from '@shared/ipc-contract';
import { OPENROUTER_KEY_PREFIX } from '@shared/llm/constants';
import { getApi } from '../lib/apiBridge';
import { humanizeValidationError } from '../lib/validationMessages';
import LanguageSwitcher from '../i18n/LanguageSwitcher';

type Provider = 'openrouter' | 'brave';

// O rótulo/placeholder vêm do i18n e o FORMATO da chave vem do contrato
// congelado (`shared/llm/constants.ts`), nunca de um literal escrito à mão aqui.
const PROVIDER_META: Record<
  Provider,
  {
    labelKey: 'keys.openrouter.label' | 'keys.brave.label';
    placeholderKey: 'keys.openrouter.placeholder' | 'keys.brave.placeholder';
    /** Formato real da chave, mostrado como helper text sob o campo. */
    keyFormat?: string;
  }
> = {
  openrouter: {
    labelKey: 'keys.openrouter.label',
    placeholderKey: 'keys.openrouter.placeholder',
    keyFormat: `${OPENROUTER_KEY_PREFIX}…`,
  },
  brave: { labelKey: 'keys.brave.label', placeholderKey: 'keys.brave.placeholder' },
};

interface ProviderState {
  value: string;
  visible: boolean;
  validating: boolean;
  valid: boolean;
  invalidMsg: string;
}

const IDLE: ProviderState = { value: '', visible: false, validating: false, valid: false, invalidMsg: '' };

/**
 * Guarda do renderer contra IPC/validação pendurada (10s — acima do timeout do
 * main, ~8s, para o erro vir do validador quando possível; bem abaixo dos 15s
 * do contrato e2e "spinner some"). Corrida com timeout: a resposta atrasada
 * que chegar DEPOIS do guard é ignorada (settled), evitando que um retorno
 * tardio sobrescreva a mensagem de erro.
 */
const VALIDATE_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const timer = setTimeout(() => finish(() => reject(new Error('timed out'))), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        finish(() => resolve(value));
      },
      (err) => {
        clearTimeout(timer);
        finish(() => reject(err));
      },
    );
  });
}

export function SetupView({ onDone }: { onDone: () => void }): ReactElement {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Record<Provider, ProviderState>>({
    openrouter: { ...IDLE },
    brave: { ...IDLE },
  });
  const [saving, setSaving] = useState(false);

  const patch = (provider: Provider, fn: (s: ProviderState) => ProviderState): void => {
    setProviders((prev) => ({ ...prev, [provider]: fn(prev[provider]) }));
  };

  const handleValidate = async (provider: Provider): Promise<void> => {
    const typed = providers[provider].value.trim();
    const validate =
      provider === 'openrouter' ? getApi().keys.validateLlm : getApi().keys.validateBrave;

    if (!typed) {
      patch(provider, (s) => ({
        ...s,
        valid: false,
        invalidMsg: t('translation:keys.needKeyBeforeValidate'),
      }));
      return;
    }

    patch(provider, (s) => ({ ...s, validating: true, valid: false, invalidMsg: '' }));
    let result: ValidationResult;
    try {
      result = await withTimeout(validate(typed), VALIDATE_TIMEOUT_MS);
    } catch (err) {
      // Timeout do guard (IPC/validação pendurada) → mensagem de rede clara;
      // qualquer outra rejeição do canal → erro bruto, também com retry.
      const isTimeout = err instanceof Error && /timed out/i.test(err.message);
      patch(provider, (s) => ({
        ...s,
        validating: false,
        valid: false,
        invalidMsg: isTimeout
          ? t('translation:keys.errorTimeout')
          : `${t('translation:keys.errorNetworkValidate')}: ${String(err)}`,
      }));
      return;
    }
    patch(provider, (s) =>
      result.isValid
        ? { ...s, validating: false, valid: true, invalidMsg: '' }
        : {
            ...s,
            validating: false,
            valid: false,
            invalidMsg: humanizeValidationError(result.errorMessage, result.provider),
          },
    );
  };

  const allValid =
    providers.openrouter.valid && providers.brave.valid && !providers.openrouter.validating && !providers.brave.validating;

  const handleContinue = async (): Promise<void> => {
    if (!allValid) return;
    setSaving(true);
    try {
      await getApi().keys.setKey('openrouter', providers.openrouter.value.trim());
      await getApi().keys.setKey('brave', providers.brave.value.trim());
      // onDone re-executa o gate no main (revalida as chaves guardadas).
      onDone();
    } catch (err) {
      setSaving(false);
      // Sem toast disponível: o gate re-executado (ou a próxima ação) revela o erro.
      void err;
    }
  };

  const renderProvider = (provider: Provider): ReactElement => {
    const meta = PROVIDER_META[provider];
    const st = providers[provider];
    return (
      <Box key={provider}>
        <TextField
          fullWidth
          label={t(`translation:${meta.labelKey}`)}
          placeholder={t(`translation:${meta.placeholderKey}`)}
          helperText={meta.keyFormat}
          type={st.visible ? 'text' : 'password'}
          value={st.value}
          autoComplete="off"
          disabled={st.validating || saving}
          onChange={(e) =>
            patch(provider, (s) => ({ ...s, value: e.target.value, valid: false, invalidMsg: '' }))
          }
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={st.visible ? t('translation:keys.hide') : t('translation:keys.show')}
                    edge="end"
                    onClick={() => patch(provider, (s) => ({ ...s, visible: !s.visible }))}
                  >
                    {st.visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
          <Button
            variant="outlined"
            disabled={st.validating || saving}
            // Onda 1 (botões com ícone): `loadingPosition="start"` mantém o
            // label visível durante a validação — sem ele o MUI v9 (default
            // 'center') deixa o texto transparente e mostra só o spinner.
            loading={st.validating}
            loadingPosition="start"
            onClick={() => void handleValidate(provider)}
          >
            {t('translation:keys.validate')}
          </Button>
          {st.valid ? (
            <Typography variant="body2" color="success.main">{t('translation:keys.valid')}</Typography>
          ) : st.invalidMsg ? (
            <Typography variant="body2" color="error">{st.invalidMsg}</Typography>
          ) : null}
        </Stack>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 520, width: '100%' }}>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <LanguageSwitcher />
          </Box>
          <Typography variant="h5" component="h1">
            {t('translation:gate.title')}
          </Typography>
          <Alert severity="info">{t('translation:gate.missingKeys')}</Alert>

          {renderProvider('openrouter')}
          {renderProvider('brave')}

          <Button
            variant="contained"
            disabled={!allValid || saving}
            // Onda 1 (botões com ícone): idem — spinner em linha, label
            // "Salvar" sempre visível durante o save.
            loading={saving}
            loadingPosition="start"
            onClick={() => void handleContinue()}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('translation:keys.save')}
          </Button>
          {!allValid ? (
            <Typography variant="body2" color="text.secondary">
              {t('translation:gate.invalidKeys')}
            </Typography>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}