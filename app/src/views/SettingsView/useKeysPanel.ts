/**
 * src/views/SettingsView/useKeysPanel.ts — ESTADO do painel de chaves de API
 * (state/view split — STORY-SPEC §5).
 *
 * A VIEW (`KeysPanel.tsx`, `KeysPanelView`) é só props: sem IPC, sem `getApi`.
 * Toda a lógica — SWR do `keys.getStatus`, salvar/validar com guarda de
 * timeout, o veredito `validationAlert`, a manutenção do cache do painel —
 * vive aqui e é testável por `node:test` sem jsdom.
 *
 * Comportamento preservado 1:1 (rodada 10 + W1/W2/W3/W5):
 *  - W2: falha do CANAL ≠ "não configurado" — `statusError` é o terceiro
 *    estado honesto ("Não foi possível verificar") com retentativa;
 *  - W3: os chips acompanham o save/validação NO MESMO commit (estado + cache);
 *  - W5: com o campo vazio nunca se valida às escondidas a chave guardada —
 *    "Validar chave salva" só por ação de rótulo explícito (`useSavedKey`);
 *  - guard de 10s (`ACTION_TIMEOUTS.keys*`): canal mudo nunca trava
 *    `saving`/`validating` e a resposta tardia é ignorada pelo race.
 */
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { KeysStatus, ValidationResult } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { ACTION_TIMEOUTS, isTimeoutError, withTimeout } from '../../lib/ipcTimeout';
import { isNonEmpty } from '../../lib/validate';
import { validationAlert } from '../../lib/validationAlert';
import { readCached, writeCached } from './panelCache';

export type Provider = 'openrouter' | 'brave';
export interface ProviderState {
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

/** Props da view pura (o hook devolve exatamente isto). */
export interface KeysPanelViewProps {
  providers: Record<Provider, ProviderState>;
  /** Último status conhecido (SWR — pode nascer já preenchido pelo cache). */
  initialStatus: KeysStatus | null;
  /** W2: o CANAL falhou — nada se pode dizer sobre as chaves. */
  statusError: boolean;
  /** Ambas as chaves já configuradas (sinal DOM do onboarding). */
  keysConfigured: boolean;
  patch(provider: Provider, fn: (s: ProviderState) => ProviderState): void;
  handleSave(provider: Provider): Promise<void>;
  handleValidate(provider: Provider, useSavedKey?: boolean): Promise<void>;
  /** W2: o "Tentar de novo" re-executa a leitura do status. */
  setReloadToken: Dispatch<SetStateAction<number>>;
}

/**
 * Guarda do renderer contra IPC/validação pendurada (10s — acima do timeout do
 * main, ~8s; bem abaixo dos 15s do contrato e2e "spinner some"). Usa o
 * withTimeout SHARED de lib/ipcTimeout (ACTION_TIMEOUTS.keysValidate, com
 * IpcTimeoutError identificável): a resposta atrasada que chegar DEPOIS do
 * guard é ignorada pelo race — o retorno tardio nunca sobrescreve a mensagem
 * de erro já mostrada.
 */
export function useKeysPanel(): KeysPanelViewProps {
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
  return {
    providers,
    initialStatus,
    statusError,
    keysConfigured,
    patch,
    handleSave,
    handleValidate,
    setReloadToken,
  };
}
