/**
 * src/gate/SetupView.tsx — formulário OBRIGATÓRIO de chaves do GATE DE INÍCIO.
 *
 * Renderizado pelo AppGate quando `keys:startup-status` devolve phase 'blocked'
 * (chave faltando ou inválida). O usuário NÃO pode entrar no app sem as DUAS
 * chaves validadas.
 *
 * Fluxo por provedor (mesmo padrão do SettingsView/KeysPanel, mas próprio daqui
 * para não conflitar com o dono daquele arquivo):
 *   - input password com mostrar/ocultar;
 *   - "Validar" → keys.validateDeepseek(typed) / keys.validateBrave(typed),
 *     validando a chave DIGITADA SEM salvar;
 *   - "Salvar e continuar" → keys.setKey(provider, key) para as DUAS, revalida
 *     (via onDone → AppGate re-executa o gate no main) e só fica habilitado
 *     quando AMBAS validaram.
 *
 * SLOT DO SWITCHER DE IDIOMA: o componente `LanguageSwitcher` vive em src/i18n
 * (criado pelo onda6-i18n-core em OUTRA worktree, ainda não mergeado nesta
 * árvore). Aqui expomos um slot que o onda7/shell (ou o i18n-core) preenche —
 * quando `src/i18n/LanguageSwitcher` existir, montam-no dentro deste div.
 */
import { useState, type ReactElement } from 'react';
import type { ValidationResult } from '@shared/ipc-contract';
import { getApi } from '../lib/apiBridge';
import { tSafe } from '../lib/tSafe';
import { humanizeValidationError } from '../lib/validationMessages';
import { InlineSpinner } from '../views/SettingsView/FormControls';

type Provider = 'deepseek' | 'brave';

const PROVIDER_META: Record<Provider, { name: string; placeholder: string }> = {
  deepseek: { name: 'DeepSeek', placeholder: 'sk-…' },
  brave: { name: 'Brave Search', placeholder: 'BSA…' },
};

interface ProviderState {
  value: string;
  visible: boolean;
  validating: boolean;
  valid: boolean;
  invalidMsg: string;
}

const IDLE: ProviderState = { value: '', visible: false, validating: false, valid: false, invalidMsg: '' };

export function SetupView({ onDone }: { onDone: () => void }): ReactElement {
  const [providers, setProviders] = useState<Record<Provider, ProviderState>>({
    deepseek: { ...IDLE },
    brave: { ...IDLE },
  });
  const [saving, setSaving] = useState(false);

  const patch = (provider: Provider, fn: (s: ProviderState) => ProviderState): void => {
    setProviders((prev) => ({ ...prev, [provider]: fn(prev[provider]) }));
  };

  const handleValidate = async (provider: Provider): Promise<void> => {
    const typed = providers[provider].value.trim();
    const validate =
      provider === 'deepseek' ? getApi().keys.validateDeepseek : getApi().keys.validateBrave;

    if (!typed) {
      patch(provider, (s) => ({
        ...s,
        valid: false,
        invalidMsg: tSafe('keys.missingInput', 'Digite a chave antes de validar.'),
      }));
      return;
    }

    patch(provider, (s) => ({ ...s, validating: true, valid: false, invalidMsg: '' }));
    let result: ValidationResult;
    try {
      result = await validate(typed);
    } catch (err) {
      patch(provider, (s) => ({
        ...s,
        validating: false,
        valid: false,
        invalidMsg: tSafe('keys.networkError', `Erro de rede ao validar: ${String(err)}`),
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

  const canContinue =
    providers.deepseek.valid && providers.brave.valid && !providers.deepseek.validating && !providers.brave.validating;

  const handleContinue = async (): Promise<void> => {
    if (!canContinue) return;
    setSaving(true);
    try {
      await getApi().keys.setKey('deepseek', providers.deepseek.value.trim());
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
      <section className="panel keys-panel" key={provider}>
        <h3 className="panel__title">{meta.name}</h3>
        <label className="form-field">
          <span className="form-field__label">
            {tSafe(provider === 'deepseek' ? 'keys.deepseekLabel' : 'keys.braveLabel', `${meta.name} API key`)}
          </span>
          <div className="gate-password">
            <input
              type={st.visible ? 'text' : 'password'}
              className="form-field__input"
              value={st.value}
              placeholder={meta.placeholder}
              autoComplete="off"
              onChange={(e) =>
                patch(provider, (s) => ({ ...s, value: e.target.value, valid: false, invalidMsg: '' }))
              }
            />
            <button
              type="button"
              className="gate-password__toggle"
              aria-label={st.visible ? tSafe('keys.hide', 'Ocultar chave') : tSafe('keys.show', 'Mostrar chave')}
              onClick={() => patch(provider, (s) => ({ ...s, visible: !s.visible }))}
            >
              {st.visible ? tSafe('keys.hide', 'Ocultar') : tSafe('keys.show', 'Mostrar')}
            </button>
          </div>
        </label>
        <div className="keys-panel__actions">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={st.validating}
            onClick={() => void handleValidate(provider)}
          >
            {st.validating ? <InlineSpinner text={tSafe('keys.validating', 'Validando…')} /> : tSafe('keys.validate', 'Validar')}
          </button>
        </div>
        {st.valid ? (
          <p className="status-text status-text--success">{tSafe('keys.valid', 'Chave válida.')}</p>
        ) : st.invalidMsg ? (
          <p className="status-text status-text--danger">{st.invalidMsg}</p>
        ) : (
          <p className="status-text status-text--muted">
            {tSafe('keys.invalid', 'Chave ainda não validada.')}
          </p>
        )}
      </section>
    );
  };

  return (
    <div className="gate-blocked">
      <div className="panel gate-card">
        <h1 className="panel__title">{tSafe('gate.blocked', 'Configuração necessária')}</h1>
        <p className="status-text status-text--muted">
          {tSafe(
            'gate.missingKeys',
            'Para usar o tutor é preciso configurar as chaves de DeepSeek e Brave. Ambas são obrigatórias e precisam ser validadas para continuar.',
          )}
        </p>

        {/*
         * SLOT DO SWITCHER DE IDIOMA (onda 6 — i18n seam):
         * o component `LanguageSwitcher` vive em src/i18n (onda6-i18n-core, outra
         * worktree, ainda não mergeado AQUI). O onda7/shell (ou o i18n-core, após o
         * merge) monta seu switcher dentro deste div. Fora desta árvore o slot fica
         * vazio; o SetupView usa tSafe para TODOS os textos, então segue traduzível.
         */}
        <div
          id="language-switcher-slot"
          data-testid="language-switcher"
          className="gate-language-slot"
        />

        <div className="keys-panels gate-keys">
          {renderProvider('deepseek')}
          {renderProvider('brave')}
        </div>

        <div className="gate-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canContinue || saving}
            onClick={() => void handleContinue()}
          >
            {saving ? (
              <InlineSpinner text={tSafe('gate.saving', 'Salvando…')} />
            ) : (
              tSafe('gate.continue', 'Salvar e continuar')
            )}
          </button>
          {!canContinue && (
            <p className="status-text status-text--muted">
              {tSafe('gate.tryAgain', 'Valide as duas chaves para continuar.')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}