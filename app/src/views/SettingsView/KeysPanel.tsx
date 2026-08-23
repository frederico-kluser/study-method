/**
 * src/views/SettingsView/KeysPanel.tsx — painel de chaves de API
 * (DeepSeek + Brave) com persistência e validação.
 *
 * Fluxo por provedor:
 *  - O usuário digita a chave (type password, com mostrar/ocultar).
 *  - "Salvar" persiste via `keys.setKey(provider, key)`.
 *  - "Validar" chama `keys.validateDeepseek(key)` / `keys.validateBrave(key)`
 *    passando a chave DIGITADA (assinatura confirmada no api-schema: ambas
 *    recebem `key: string` como primeiro argumento). Se nada foi digitado, usa
 *    a chave já salva no store.
 *  - O status inicial (keysConfigured/validated) vem de `keys.getStatus` na
 *    montagem.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { KeysStatus, ValidationResult } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { validationUiFromResult, type ValidationUi } from '../../lib/validationMessages';
import { isNonEmpty } from '../../lib/validate';
import { PasswordField, StatusText, InlineSpinner } from './FormControls';

type Provider = 'deepseek' | 'brave';

const PROVIDER_META: Record<
  Provider,
  { name: string; placeholder: string; inputLabel: string }
> = {
  deepseek: {
    name: 'DeepSeek',
    placeholder: 'sk-…',
    inputLabel: 'DeepSeek API key',
  },
  brave: {
    name: 'Brave Search',
    placeholder: 'BSA…',
    inputLabel: 'Brave Search API key',
  },
};

interface ProviderState {
  value: string;
  visible: boolean;
  ui: ValidationUi;
  saving: boolean;
}

function idleState(): ProviderState {
  return { value: '', visible: false, ui: { state: 'idle', message: '' }, saving: false };
}

export function KeysPanel(): ReactElement {
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
        if (!cancelled) setInitialStatus({ deepseekConfigured:false, braveConfigured:false, deepseekValidated:false, braveValidated:false });
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
        ui: { state: 'invalid', message: 'Digite a chave antes de salvar.' },
      }));
      return;
    }
    patch(provider, (s) => ({ ...s, saving: true }));
    try {
      await getApi().keys.setKey(provider, value.trim());
      patch(provider, (s) => ({
        ...s,
        saving: false,
        ui: { state: 'valid', message: 'Chave salva.' },
      }));
    } catch (err) {
      patch(provider, (s) => ({
        ...s,
        saving: false,
        ui: {
          state: 'invalid',
          message: `Falha ao salvar a chave: ${String(err)}`,
        },
      }));
    }
  };

  const handleValidate = async (provider: Provider): Promise<void> => {
    // Valida a chave digitada; se nada foi digitado, usa a salva no store.
    const typed = providers[provider].value.trim();
    const validate =
      provider === 'deepseek'
        ? getApi().keys.validateDeepseek
        : getApi().keys.validateBrave;

    patch(provider, (s) => ({
      ...s,
      ui: { state: 'validating', message: `Validando chave ${PROVIDER_META[provider].name}…` },
    }));

    let result: ValidationResult;
    try {
      result = await validate(typed.length > 0 ? typed : undefined as unknown as string);
    } catch (err) {
      patch(provider, (s) => ({
        ...s,
        ui: {
          state: 'invalid',
          message: `Erro de rede/requisição ao validar: ${String(err)}`,
        },
      }));
      return;
    }

    const ui = validationUiFromResult(result);
    patch(provider, (s) => ({ ...s, ui }));
  };

  const renderProvider = (provider: Provider): ReactElement => {
    const meta = PROVIDER_META[provider];
    const st = providers[provider];
    const configured =
      initialStatus?.[provider === 'deepseek' ? 'deepseekConfigured' : 'braveConfigured'];
    const validated =
      initialStatus?.[provider === 'deepseek' ? 'deepseekValidated' : 'braveValidated'];
    return (
      <section className="panel keys-panel" key={provider}>
        <h3 className="panel__title">{meta.name}</h3>
        <div className="keys-panel__badges">
          {configured ? <span className="badge badge--ok">configurada</span> : null}
          {validated ? <span className="badge badge--ok">validada</span> : null}
        </div>
        <PasswordField
          label={meta.inputLabel}
          placeholder={meta.placeholder}
          value={st.value}
          onChange={(next) =>
            patch(provider, (s) => ({
              ...s,
              value: next,
              visible: s.visible,
              ui: { state: 'idle', message: '' },
            }))
          }
        />
        <div className="keys-panel__actions">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={st.saving}
            onClick={() => handleSave(provider)}
          >
            {st.saving ? <InlineSpinner text="Salvando…" /> : 'Salvar'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={st.ui.state === 'validating'}
            onClick={() => handleValidate(provider)}
          >
            {st.ui.state === 'validating' ? (
              <InlineSpinner text="Validando…" />
            ) : (
              'Validar'
            )}
          </button>
        </div>
        {st.ui.message ? (
          <StatusText
            tone={
              st.ui.state === 'valid'
                ? 'success'
                : st.ui.state === 'invalid'
                  ? 'danger'
                  : 'muted'
            }
          >
            {st.ui.message}
          </StatusText>
        ) : null}
      </section>
    );
  };

  return (
    <div className="keys-panels">
      {renderProvider('deepseek')}
      {renderProvider('brave')}
    </div>
  );
}