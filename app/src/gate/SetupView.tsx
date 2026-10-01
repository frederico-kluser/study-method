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
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import type { StartupStatus, ValidationResult } from '@shared/ipc-contract';
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
    /** Papel do provedor no app — helper POR CAMPO (C2 da auditoria de UX). */
    helpKey: 'keys.openrouter.help' | 'keys.brave.help';
    /** Rótulo do link "Onde obter" (i18n — nunca literal solto). */
    whereToGetKey: 'keys.openrouter.whereToGet' | 'keys.brave.whereToGet';
    /** Página oficial de emissão da chave (C2). */
    getKeysUrl: string;
  }
> = {
  openrouter: {
    labelKey: 'keys.openrouter.label',
    placeholderKey: 'keys.openrouter.placeholder',
    keyFormat: `${OPENROUTER_KEY_PREFIX}…`,
    helpKey: 'keys.openrouter.help',
    whereToGetKey: 'keys.openrouter.whereToGet',
    getKeysUrl: 'https://openrouter.ai/keys',
  },
  brave: {
    labelKey: 'keys.brave.label',
    placeholderKey: 'keys.brave.placeholder',
    helpKey: 'keys.brave.help',
    whereToGetKey: 'keys.brave.whereToGet',
    getKeysUrl: 'https://brave.com/search/api/',
  },
};

interface ProviderState {
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
 * W1 (onda-ux): as chaves CARREGADAS já chegam detetadas como inválidas pelo
 * gate (configured && !valid)? Se sim, a mensagem por estado começa em
 * `gate.invalidKeys` ("Algumas chaves são inválidas."); o convite "Valide as
 * duas chaves para continuar" é só quando nada foi validado ainda e nada de
 * inválido foi detetado (contrato da e2e-gate.spec.ts).
 */
function loadedKeysInvalid(status: StartupStatus | null | undefined): boolean {
  if (!status) return false;
  const invalid = (p: StartupStatus['llm']): boolean => p.configured && !p.valid;
  return invalid(status.llm) || invalid(status.brave);
}

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

export function SetupView({
  onDone,
  startupStatus,
}: {
  onDone: () => void | Promise<void>;
  /** Status do gate (AppGate) — diz se as chaves carregadas já são inválidas. */
  startupStatus?: StartupStatus | null;
}): ReactElement {
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

  const renderProvider = (provider: Provider): ReactElement => {
    const meta = PROVIDER_META[provider];
    const st = providers[provider];
    return (
      <Box key={provider}>
        <TextField
          fullWidth
          label={t(`translation:${meta.labelKey}`)}
          placeholder={t(`translation:${meta.placeholderKey}`)}
          // C2 (onda-ux): helper POR CAMPO — o papel do provedor no app + o
          // link "Onde obter" (página oficial de emissão da chave). O link é
          // o padrão da casa (LessonView): `<a target="_blank">` é apanhado
          // pelo setWindowOpenHandler do main e abre via shell.openExternal no
          // navegador do sistema — sem JS novo, compatível com a CSP
          // (default-src 'self' não governa window.open).
          helperText={
            <Box component="span" sx={{ display: 'block' }}>
              <Typography component="span" variant="caption" sx={{ display: 'block' }}>
                {t(`translation:${meta.helpKey}`)}
                {meta.keyFormat ? ` (${meta.keyFormat})` : ''}
              </Typography>
              <Link
                href={meta.getKeysUrl}
                target="_blank"
                rel="noreferrer"
                variant="caption"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
              >
                {t(`translation:${meta.whereToGetKey}`)}
              </Link>
            </Box>
          }
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
            // `*.accentText`, não `*.main`: `main` é o PREENCHIMENTO da família
            // e como texto sobre o Paper (nível 1) media 4,21:1 no escuro —
            // abaixo do piso AA. O valor de TEXTO calibrado entrega 5,22:1 no
            // escuro e 5,26:1 no claro (regra 3b: nível 1 é superfície de
            // leitura, o acento pode ser texto). W17: o veredito da validação
            // é ANUNCIADO (role="status"/aria-live) — antes era só visual.
            <Typography variant="body2" role="status" aria-live="polite" sx={{ color: 'success.accentText' }}>{t('translation:keys.valid')}</Typography>
          ) : st.invalidMsg ? (
            // Mesma receita da linha de cima para a família `error` (carmim):
            // `color="error"` como prop pintava `error.main` (fill) — 4,21:1
            // no escuro; `error.accentText` mede 5,23:1. E vai por `sx`, que é
            // o caminho que chega à tela (ver tests/inkPropReachesScreen).
            // W17: role="alert" — o fracasso da validação entra na leitura.
            // W19: o detalhe técnico (se houver) é legenda SEPARADA, nunca a
            // frase principal.
            <>
              <Typography variant="body2" role="alert" sx={{ color: 'error.accentText' }}>{st.invalidMsg}</Typography>
              {st.detail ? (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{st.detail}</Typography>
              ) : null}
            </>
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
          {/* W1 (onda-ux): mensagem por ESTADO. No início — e enquanto nada
              falhou — o texto é o CONVITE ("Valide as duas chaves para
              continuar"); `gate.invalidKeys` só aparece DEPOIS de uma
              validação falhada (o MUI dá role="alert" ao Alert — W17). */}
          {!allValid ? (
            <Alert severity={validationFailed ? 'warning' : 'info'}>
              {validationFailed
                ? t('translation:gate.invalidKeys')
                : t('translation:gate.validateBothKeys')}
            </Alert>
          ) : null}

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
          {/* A falha de save AGORA fala (onda-ux): antes o catch engolia o erro
              e o gate obrigatório respondia ao "Salvar" com silêncio. O Alert
              fica colado no botão que falhou, o MUI já lhe dá `role="alert"`
              (anunciado no ato), e o botão continua habilitado para retry.
              W19: frase i18n em cima, detalhe técnico (se houver) em legenda. */}
          {saveError !== null ? (
            <Alert severity="error">
              <Typography component="span" variant="body2" sx={{ display: 'block' }}>
                {saveError.message}
              </Typography>
              {saveError.detail ? (
                <Typography component="span" variant="caption" sx={{ display: 'block', opacity: 0.85 }}>
                  {saveError.detail}
                </Typography>
              ) : null}
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}