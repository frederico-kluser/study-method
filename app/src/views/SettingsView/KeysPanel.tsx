/**
 * src/views/SettingsView/KeysPanel.tsx — painel de chaves de API em Material UI.
 *
 * Mesmo contrato IPC do KeysPanel antigo (onda 3/4), agora renderizado em MUI:
 *
 *  - TextField `type={visible ? 'text' : 'password'}` com toggle de
 *    mostrar/ocultar via InputAdornment + IconButton (Visibility/VisibilityOff).
 *  - Estado configurada/validada vindo de `keys.getStatus` na MONTAGEM (Chips).
 *  - Botão "Salvar" → `keys.setKey(provider, key)`; botão "Validar" →
 *    `keys.validateLlm(provider==='openrouter')` / `keys.validateBrave(...)`,
 *    passando a chave DIGITADA (ou a salva no store quando nada foi digitado).
 *    O feedback é renderizado em `<Alert>` via lógica pura `validationAlert`
 *    (src/lib/validationAlert.ts → chaves i18n keys.*).
 *  - loading nos botões durante salvar/validar (spinner + disabled).
 *
 * RODADA 10 (onda 2b/onda 4 — sem spinner infinito): guarda de 10s no renderer
 * além do timeout do validador no main (apiKeyValidator, ~8s) — se o IPC
 * pendurar, o spinner para com mensagem de erro clara e o botão volta a ficar
 * habilitado. ONDA 4 (fix W1): salvar e validar usam o withTimeout SHARED
 * (lib/ipcTimeout, ACTION_TIMEOUTS) — canal mudo nunca trava `saving`/
 * `validating` para sempre; o finally garante o estado limpo.
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
import { OPENROUTER_KEY_PREFIX, OPENROUTER_MODEL } from '../../../shared/llm/constants';
import { getApi } from '../../lib/apiBridge';
import { ACTION_TIMEOUTS, isTimeoutError, withTimeout } from '../../lib/ipcTimeout';
import { isNonEmpty } from '../../lib/validate';
import { validationAlert } from '../../lib/validationAlert';
import { readCached, writeCached } from './panelCache';

type Provider = 'openrouter' | 'brave';

/**
 * Piso de alvo de toque (px) — W21 (onda-ux): o piso de 44 da casa estava a ser
 * aplicado de forma desigual (o `size="small"` do IconButton nasce 30×30 e os
 * botões default ~36px). Mesmo valor/constante de LocalAiPanel e
 * placeholders.tsx.
 */
const TOUCH_TARGET_PX = 44;

const PROVIDER_META: Record<
  Provider,
  {
    name: string;
    /** Modelo servido pelo provedor (só quem serve um LLM tem um). */
    modelName?: string;
    inputLabelKey: 'translation:keys.openrouter.label' | 'translation:keys.brave.label';
    placeholder: string;
  }
> = {
  // Nome, modelo e formato da chave vêm do contrato congelado — nada de
  // literal solto: `shared/llm/constants.ts` é a única fonte.
  openrouter: {
    name: 'OpenRouter',
    modelName: OPENROUTER_MODEL.name,
    inputLabelKey: 'translation:keys.openrouter.label',
    placeholder: `${OPENROUTER_KEY_PREFIX}…`,
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

/**
 * Guarda do renderer contra IPC/validação pendurada (10s — acima do timeout do
 * main, ~8s; bem abaixo dos 15s do contrato e2e "spinner some"). Usa o
 * withTimeout SHARED de lib/ipcTimeout (ACTION_TIMEOUTS.keysValidate, com
 * IpcTimeoutError identificável): a resposta atrasada que chegar DEPOIS do
 * guard é ignorada pelo race — o retorno tardio nunca sobrescreve a mensagem
 * de erro já mostrada.
 */

export function KeysPanel(): ReactElement {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Record<Provider, ProviderState>>({
    openrouter: idleState(),
    brave: idleState(),
  });
  // SWR: nasce com o último status conhecido (se houver) — o IPC abaixo
  // revalida em toda montagem e só muda a UI se o valor real divergiu. Sem
  // cache (1ª abertura da sessão), começa null como antes.
  const [initialStatus, setInitialStatus] = useState<KeysStatus | null>(
    () => readCached<KeysStatus>('keys.status') ?? null,
  );
  // W2 (onda-ux): falha do CANAL ≠ "não configurado". Quando `keys.getStatus()`
  // rejeita, ninguém pode inferir o estado das chaves — o terceiro estado
  // ("Não foi possível verificar") é o único honesto, e o "Tentar de novo"
  // re-executa a leitura (reloadToken re-dispara o efeito abaixo).
  const [statusError, setStatusError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // ACHADO-5: chaves ALREADY configuradas no store (status/gate do KeysPanel) —
  // exposto como sinal DOM p/ o onboarding considerar o passo `settings-keys-filled`
  // satisfeito sem obrigar a redigitar. Lê apenas os booleans (não o valor).
  const keysConfigured =
    (initialStatus?.llmConfigured ?? false) &&
    (initialStatus?.braveConfigured ?? false);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .keys.getStatus()
      .then((status) => {
        if (!cancelled) {
          setInitialStatus(status);
          writeCached('keys.status', status);
          setStatusError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // W2: rejeição do canal — NÃO se escreve "não configurada" no lugar
          // do que não foi possível verificar (e o cache antigo, se existir,
          // também não é apagado).
          setStatusError(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // W2: o "Tentar de novo" incrementa `reloadToken` e re-executa a leitura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

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
        message: t('translation:keys.needKeyBeforeSave'),
      }));
      return;
    }
    patch(provider, (s) => ({ ...s, saving: true }));
    try {
      // FIX W1 (onda 4): timeout no SALVAR também (canal mudo nunca trava o
      // botão para sempre) — persistência local, 10s é folga enorme.
      await withTimeout(
        getApi().keys.setKey(provider, value.trim()),
        ACTION_TIMEOUTS.keysSet,
        `keys.setKey:${provider}`,
      );
      patch(provider, (s) => ({
        ...s,
        uiState: 'valid',
        message: t('translation:keys.saved'),
      }));
      // W3 (onda-ux): os chips acompanham o save NO MESMO commit — antes o
      // "Configurada" só aparecia na próxima montagem, quando a revalidação
      // do getStatus chegava.
      setInitialStatus((previous) => ({
        ...(previous ?? {
          llmConfigured: false,
          braveConfigured: false,
          llmValidated: false,
          braveValidated: false,
        }),
        [provider === 'openrouter' ? 'llmConfigured' : 'braveConfigured']: true,
      }));
      // Cache acompanha a escrita real: a próxima visita não mostra o chip
      // "não configurada" por um instante antes da revalidação.
      const prev = readCached<KeysStatus>('keys.status');
      if (prev) {
        writeCached('keys.status', {
          ...prev,
          [provider === 'openrouter' ? 'llmConfigured' : 'braveConfigured']: true,
        });
      }
    } catch (err) {
      void err;
      patch(provider, (s) => ({
        ...s,
        uiState: 'invalid',
        message: isTimeoutError(err)
          ? t('translation:keys.saveTimeout')
          : t('translation:keys.saveError'),
      }));
    } finally {
      // SEMPRE limpo — nenhum caminho deixa `saving` preso em true.
      patch(provider, (s) => ({ ...s, saving: false }));
    }
  };

  /**
   * W5 (onda-ux): com o campo VAZIO o guard diz "Digite a chave antes de
   * validar" — nunca se valida às escondidas a chave guardada. Validar a chave
   * JÁ GUARDADA continua possível, mas só pela ação de rótulo explícito
   * ("Validar chave salva" → useSavedKey=true).
   */
  const handleValidate = async (provider: Provider, useSavedKey = false): Promise<void> => {
    const typed = providers[provider].value.trim();
    const validate =
      provider === 'openrouter'
        ? getApi().keys.validateLlm
        : getApi().keys.validateBrave;

    if (!useSavedKey && !isNonEmpty(typed)) {
      patch(provider, (s) => ({
        ...s,
        uiState: 'invalid',
        message: t('translation:keys.needKeyBeforeValidate'),
      }));
      return;
    }

    patch(provider, (s) => ({
      ...s,
      uiState: 'validating',
      message: t('translation:keys.validating'),
    }));

    let result: ValidationResult;
    try {
      result = await withTimeout(
        // Sem chave digitada (useSavedKey) o main valida a chave guardada.
        validate(useSavedKey ? (undefined as unknown as string) : typed),
        ACTION_TIMEOUTS.keysValidate,
        `keys.validate:${provider}`,
      );
    } catch (err) {
      // Timeout do guard (IPC/validação pendurada) → mensagem de rede clara;
      // qualquer outra rejeição do canal → erro de rede genérico, com retry.
      void err;
      patch(provider, (s) => ({
        ...s,
        uiState: 'invalid',
        message: isTimeoutError(err)
          ? t('translation:keys.errorTimeout')
          : t('translation:keys.errorNetwork'),
      }));
      return;
    }

    // Feedback via lógica pura: o helper já devolve severity + i18nKey do <Alert>.
    const alert = validationAlert(result);
    patch(provider, (s) => ({
      ...s,
      uiState: alert.severity === 'success' ? 'valid' : 'invalid',
      message: t(alert.i18nKey),
    }));
    // Cache acompanha o veredito de validação (mesmo raciocínio do salvar).
    const prev = readCached<KeysStatus>('keys.status');
    if (prev) {
      writeCached('keys.status', {
        ...prev,
        [provider === 'openrouter' ? 'llmValidated' : 'braveValidated']:
          result.isValid === true,
      });
    }
  };

  const renderProvider = (provider: Provider): ReactElement => {
    const meta = PROVIDER_META[provider];
    const st = providers[provider];
    const configured =
      initialStatus?.[provider === 'openrouter' ? 'llmConfigured' : 'braveConfigured'];
    const validated =
      initialStatus?.[provider === 'openrouter' ? 'llmValidated' : 'braveValidated'];
    const validating = st.uiState === 'validating';

    return (
      <Card key={provider} variant="outlined" sx={{ display: 'flex', flex: '1 1 280px' }}>
        <CardContent sx={{ width: '100%' }}>
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {meta.name}
                </Typography>
                {meta.modelName ? (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                    {meta.modelName}
                  </Typography>
                ) : null}
              </Box>
              <Stack direction="row" spacing={0.5}>
                {statusError ? (
                  // W2 (onda-ux): terceiro estado — o CANAL falhou e nada se
                  // pode dizer sobre as chaves ("Não foi possível verificar").
                  <Chip size="small" color="warning" label={t('translation:keys.statusUnknown')} />
                ) : (
                  <Chip
                    size="small"
                    color={configured ? 'success' : 'default'}
                    label={configured ? t('translation:keys.configured') : t('translation:keys.notConfigured')}
                  />
                )}
                {!statusError && validated ? (
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
                        aria-label={st.visible ? t('translation:keys.hide') : t('translation:keys.show')}
                        onClick={() =>
                          patch(provider, (s) => ({ ...s, visible: !s.visible }))
                        }
                        edge="end"
                        size="small"
                        // W21 (onda-ux): piso de alvo de toque — caixa 44×44,
                        // ícone intacto (mesmo padrão do LocalAiPanel).
                        sx={{ width: TOUCH_TARGET_PX, height: TOUCH_TARGET_PX }}
                      >
                        {st.visible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {/* W4 (onda-ux): "Salvar" é a AÇÃO PRIMÁRIA (contained) — antes
                  "Validar" levava o contained e o salvar ficava secundário.
                  W21: minHeight = piso de alvo de toque nos três. */}
              <Button
                variant="contained"
                disabled={st.saving}
                onClick={() => void handleSave(provider)}
                sx={{ minHeight: TOUCH_TARGET_PX }}
              >
                {st.saving ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                {st.saving ? t('translation:common.loading') : t('translation:keys.save')}
              </Button>
              <Button
                variant="outlined"
                disabled={validating}
                onClick={() => void handleValidate(provider)}
                sx={{ minHeight: TOUCH_TARGET_PX }}
              >
                {validating ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                {validating ? t('translation:keys.validating') : t('translation:keys.validate')}
              </Button>
              {/* W5 (onda-ux): validar a chave JÁ GUARDADA só por ação de
                  rótulo explícito — nunca por engano ao deixar o campo vazio. */}
              {!isNonEmpty(st.value) && configured ? (
                <Button
                  variant="text"
                  disabled={validating || st.saving}
                  onClick={() => void handleValidate(provider, true)}
                  sx={{ minHeight: TOUCH_TARGET_PX }}
                >
                  {t('translation:keys.validateSaved')}
                </Button>
              ) : null}
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
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        useFlexGap
        data-onboarding-signal={`keys-configured:${keysConfigured}`}
      >
        {renderProvider('openrouter')}
        {renderProvider('brave')}
      </Stack>
      {/* W2 (onda-ux): falha do canal — única saída honesta é tentar ler de
          novo (nunca pintar "não configurada" por engano). */}
      {statusError ? (
        <Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setReloadToken((n) => n + 1)}
            sx={{ minHeight: TOUCH_TARGET_PX }}
          >
            {t('translation:common.tryAgain')}
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
}