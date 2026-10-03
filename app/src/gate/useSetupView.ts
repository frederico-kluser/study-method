/**
 * src/gate/useSetupView.ts — ESTADO do formulário obrigatório de chaves do
 * gate de início (state/view split — STORY-SPEC §5).
 *
 * A VIEW (`SetupView.tsx`) é só props; aqui vive o stash S5 (as chaves
 * digitadas sobrevivem ao re-check do gate), a validação por provedor com
 * guarda de 10s (`VALIDATE_TIMEOUT_MS` — resposta tardia ignorada pelo race),
 * a mensagem por ESTADO (W1: `gate.invalidKeys` só depois de veredito
 * negativo) e a falha de SAVE que nunca mais é silenciosa (W19: frase i18n +
 * detalhe técnico opcional).
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { StartupStatus, ValidationResult } from '@shared/ipc-contract';
import { getApi } from '../lib/apiBridge';
import { humanizeValidationError } from '../lib/validationMessages';
import { loadedKeysInvalid } from './startupState';

export type Provider = 'openrouter' | 'brave';
export interface ProviderState {
  value: string;
  visible: boolean;
  validating: boolean;
  valid: boolean;
  invalidMsg: string;
  /** W19: detalhe técnico OPCIONAL — nunca é a frase principal da UI. */
  detail: string;
}

const IDLE: ProviderState = { value: '', visible: false, validating: false, valid: false, invalidMsg: '', detail: '' };

/**
 * S5 (onda-ux): o re-check do gate que volta 'blocked' NÃO pode cuspir fora as
 * chaves digitadas. O AppGate mantém o SetupView MONTADO durante o re-check
 * (o estado vive na mesma instância); este stash de módulo cobre os caminhos
 * em que ele chega a desmontar (ex.: falha de canal → GateError) — valores e
 * estado de validação são restaurados na próxima montagem.
 */
let savedDraft: Record<Provider, ProviderState> | null = null;


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

/** Props da view pura (o hook devolve exatamente isto). */
export interface SetupViewViewProps {
  providers: Record<Provider, ProviderState>;
  saving: boolean;
  /** W1+W17: `gate.invalidKeys` quando houve validação falhada OU chaves inválidas. */
  validationFailed: boolean;
  /** FALHA ao salvar (o gate é obrigatório: o utilizador tem de saber). */
  saveError: { message: string; detail?: string } | null;
  /** As duas chaves validaram e nada está a validar — pronto a salvar. */
  allValid: boolean;
  patch(provider: Provider, fn: (s: ProviderState) => ProviderState): void;
  handleValidate(provider: Provider): Promise<void>;
  handleContinue(): Promise<void>;
}

export interface UseSetupViewOptions {
  onDone: () => void | Promise<void>;
  /** Status do gate (AppGate) — diz se as chaves carregadas já são inválidas. */
  startupStatus?: StartupStatus | null;
}

export function useSetupView({
  onDone,
  startupStatus,
}: UseSetupViewOptions): SetupViewViewProps {
  const { t } = useTranslation();
  // S5: nasce do stash (valores/estado preservados entre montagens) ou virgem.
  const [providers, setProviders] = useState<Record<Provider, ProviderState>>(() =>
    savedDraft
      ? { openrouter: { ...savedDraft.openrouter }, brave: { ...savedDraft.brave } }
      : { openrouter: { ...IDLE }, brave: { ...IDLE } },
  );
  const [saving, setSaving] = useState(false);
  // W1+W17 (onda-ux): a mensagem do topo é por ESTADO. `gate.invalidKeys`
  // aparece quando houve validação falhada OU quando o gate já trouxe as
  // chaves carregadas como inválidas; caso contrário o texto é o convite
  // ("Valide as duas chaves para continuar").
  const [validationFailed, setValidationFailed] = useState(() => loadedKeysInvalid(startupStatus));
  // FALHA AO SALVAR as chaves (onda-ux). O catch do `handleContinue` engolia o
  // erro (`void err`) e o gate obrigatório ficava sem resposta nenhuma: o
  // utilizador clicava em "Salvar" e nada acontecia. O erro agora tem estado
  // próprio e vira um <Alert severity="error"> ao lado do botão — que continua
  // HABILITADO para retry, e o estado limpa a cada nova tentativa. W19: a
  // frase principal é i18n; o `String(err)` é só detalhe técnico opcional.
  const [saveError, setSaveError] = useState<{ message: string; detail?: string } | null>(null);

  // S5: mantém o stash sempre igual ao estado vivo (última tecla digitada).
  useEffect(() => {
    savedDraft = { openrouter: { ...providers.openrouter }, brave: { ...providers.brave } };
  }, [providers]);

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
        detail: '',
      }));
      return;
    }

    patch(provider, (s) => ({ ...s, validating: true, valid: false, invalidMsg: '', detail: '' }));
    let result: ValidationResult;
    try {
      result = await withTimeout(validate(typed), VALIDATE_TIMEOUT_MS);
    } catch (err) {
      // Timeout do guard (IPC/validação pendurada) → mensagem de rede clara;
      // qualquer outra rejeição do canal → erro de rede genérico, com retry.
      // W19: a FRASE PRINCIPAL é sempre i18n; o `String(err)` vira detalhe
      // técnico opcional (legenda), nunca a frase da UI.
      const isTimeout = err instanceof Error && /timed out/i.test(err.message);
      setValidationFailed(true);
      patch(provider, (s) => ({
        ...s,
        validating: false,
        valid: false,
        invalidMsg: isTimeout
          ? t('translation:keys.errorTimeout')
          : t('translation:keys.errorNetworkValidate'),
        detail: isTimeout ? '' : String(err),
      }));
      return;
    }
    patch(provider, (s) =>
      result.isValid
        ? { ...s, validating: false, valid: true, invalidMsg: '', detail: '' }
        : {
            ...s,
            validating: false,
            valid: false,
            invalidMsg: humanizeValidationError(result.errorMessage, result.provider),
            detail: '',
          },
    );
    // W1: o veredito NEGATIVO é o que muda a mensagem do topo para
    // `gate.invalidKeys` — antes ela aparecia desde o primeiro frame.
    if (!result.isValid) setValidationFailed(true);
  };

  const allValid =
    providers.openrouter.valid && providers.brave.valid && !providers.openrouter.validating && !providers.brave.validating;

  const handleContinue = async (): Promise<void> => {
    if (!allValid) return;
    // Nova tentativa → o erro da anterior some (o Alert só mostra a falha da
    // tentativa em curso, nunca uma morta).
    setSaveError(null);
    setSaving(true);
    try {
      await getApi().keys.setKey('openrouter', providers.openrouter.value.trim());
      await getApi().keys.setKey('brave', providers.brave.value.trim());
      // onDone re-executa o gate no main (revalida as chaves guardadas). S5:
      // aguardamos o re-check — se ele voltar 'blocked', este mesmo SetupView
      // (montado, com os valores intactos) volta a ficar utilizável no finally.
      await onDone();
    } catch (err) {
      // A FALHA DEIXA DE SER SILINCIOSA (onda-ux): o gate é obrigatório e o
      // utilizador precisa de saber que o save não aconteceu. W19: a frase é
      // `keys.saveError` (i18n, existente nos dois locales) e o erro bruto vira
      // detalhe técnico opcional — nunca a frase principal.
      setSaveError({ message: t('translation:keys.saveError'), detail: String(err) });
    } finally {
      // SEMPRE limpo: o botão volta a ficar habilitado para retry (o
      // `allValid` continua true e os valores continuam no formulário).
      setSaving(false);
    }
  };
  return {
    providers,
    saving,
    validationFailed,
    saveError,
    allValid,
    patch,
    handleValidate,
    handleContinue,
  };
}
