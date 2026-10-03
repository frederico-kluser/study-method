/**
 * src/gate/SetupView.tsx — formulário OBRIGATÓRIO de chaves do GATE DE INÍCIO:
 * VIEW PURA + container (state/view split — STORY-SPEC §5).
 *
 * `SetupViewView` é a view pura (só props — histórias/testes SSR); `SetupView`
 * é o container que liga `useSetupView` e mantém o export público do AppGate.
 *
 * Fluxo por provedor (mesmo padrão do SettingsView/KeysPanel, mas próprio):
 *  - TextField password com toggle de visibilidade (Visibility/VisibilityOff);
 *  - "Validar" → `keys.validateLlm`/`keys.validateBrave` (a chave DIGITADA,
 *    sem salvar); "Salvar" → `keys.setKey` para as DUAS e revalida via
 *    `onDone` (o AppGate re-executa o gate); só habilitado quando AMBAS
 *    validaram;
 *  - C2: helper POR CAMPO (papel do provedor + link "Onde obter");
 *  - W17: o veredito da validação é ANUNCIADO (role="status"/role="alert").
 *
 * O LanguageSwitcher (src/i18n) é montado no slot.
 */
import type { ReactElement } from 'react';
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
import type { StartupStatus } from '@shared/ipc-contract';
import { OPENROUTER_KEY_PREFIX } from '@shared/llm/constants';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import type { Provider, SetupViewViewProps } from './useSetupView';
import { useSetupView } from './useSetupView';

export type { Provider, ProviderState, SetupViewViewProps } from './useSetupView';

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

export function SetupViewView({
  providers,
  saving,
  validationFailed,
  saveError,
  allValid,
  patch,
  handleValidate,
  handleContinue,
}: SetupViewViewProps): ReactElement {
  const { t } = useTranslation();

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
/** Container: só liga o hook de estado à view pura (export público do gate). */
export function SetupView({
  onDone,
  startupStatus,
}: {
  onDone: () => void | Promise<void>;
  startupStatus?: StartupStatus | null;
}): ReactElement {
  return <SetupViewView {...useSetupView({ onDone, startupStatus })} />;
}
