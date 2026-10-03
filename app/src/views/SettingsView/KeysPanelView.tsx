/**
 * src/views/SettingsView/KeysPanelView.tsx — VIEW PURA do painel de chaves
 * de API em Material UI (state/view split — STORY-SPEC §5).
 *
 * `KeysPanelView` é a VIEW PURA (só props — o que as histórias e os testes SSR
 * renderizam); `KeysPanel` é o CONTAINER que liga o hook `useKeysPanel` e
 * mantém o export público usado pelo SettingsView.
 *
 * Contrato visual/IPC do painel (onda 3/4 + rodada 10) preservado:
 *  - TextField `type={visible ? 'text' : 'password'}` com toggle de
 *    mostrar/ocultar via InputAdornment + IconButton (Visibility/VisibilityOff);
 *  - Estado configurada/validada vindo de `keys.getStatus` na MONTAGEM (Chips);
 *  - Botão "Salvar" (ação PRIMÁRIA, W4) → `keys.setKey`; "Validar" →
 *    `keys.validateLlm`/`keys.validateBrave`; feedback em `<Alert>` via lógica
 *    pura `validationAlert` (src/lib/validationAlert.ts → chaves i18n keys.*);
 *  - loading nos botões durante salvar/validar (spinner + disabled) — nunca
 *    spinner eterno (guard de 10s, ver useKeysPanel.ts).
 *
 * Nenhuma view acessa `window` diretamente — só `getApi()` (testável sem jsdom).
 */
import type { ReactElement } from 'react';
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
import { OPENROUTER_KEY_PREFIX, OPENROUTER_MODEL } from '../../../shared/llm/constants';
import { isNonEmpty } from '../../lib/validate';
import type { KeysPanelViewProps, Provider } from './useKeysPanel';
// §1 (LAYOUT-DRY-AUDIT): o piso de alvo de toque são objetos de estilo
// partilhados (`touchTargetSx` = minHeight; `touchTargetBoxSx` = caixa 44×44
// do IconButton) — nunca `minHeight: 44` copiado.
import { touchTargetBoxSx, touchTargetSx } from '../../lib/layoutSx';
// §3: falha do canal + retentativa é o `RetryAlert` partilhado.
import { RetryAlert } from '../../components/ui/RetryAlert';

export type { KeysPanelViewProps, Provider, ProviderState } from './useKeysPanel';

// W21 (onda-ux): o piso de toque de 44 da casa estava a ser aplicado de forma
// desigual (o `size="small"` do IconButton nasce 30×30 e os botões default
// ~36px) — agora via `lib/layoutSx.ts` (`touchTargetSx` / `touchTargetBoxSx`),
// a MESMA receita de LocalAiPanel e placeholders.tsx.

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

export function KeysPanelView({
  providers,
  initialStatus,
  statusError,
  keysConfigured,
  patch,
  handleSave,
  handleValidate,
  setReloadToken,
}: KeysPanelViewProps): ReactElement {
  const { t } = useTranslation();

  const renderProvider = (provider: Provider): ReactElement => {
    const meta = PROVIDER_META[provider];
    const st = providers[provider];
    const configured =
      initialStatus?.[provider === 'openrouter' ? 'llmConfigured' : 'braveConfigured'];
    const validated =
      initialStatus?.[provider === 'openrouter' ? 'llmValidated' : 'braveValidated'];
    const validating = st.uiState === 'validating';

    return (
      // §10 (LAYOUT-DRY-AUDIT) — PENDENTE `InfoCard`: o cartão de provedor é
      // um CARTÃO DE FORMULÁRIO (campo + botões + alerta dentro), e o
      // `InfoCard` só tem slots de título/subtítulo/ícone/ações — não tem
      // corpo de conteúdo. Sem slot `children` no primitivo não há migração
      // honesta; fica registado como pendente de extensão do primitivo.
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
                        sx={touchTargetBoxSx}
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
                sx={touchTargetSx}
              >
                {st.saving ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                {st.saving ? t('translation:common.loading') : t('translation:keys.save')}
              </Button>
              <Button
                variant="outlined"
                disabled={validating}
                onClick={() => void handleValidate(provider)}
                sx={touchTargetSx}
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
                  sx={touchTargetSx}
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
          novo (nunca pintar "não configurada" por engano).
          §3 RetryAlert (LAYOUT-DRY-AUDIT): o "Tentar de novo" solto virou o
          bloco erro+retentativa partilhado, com o MOTIVO à vista — um botão
          sem contexto não diz o que falhou. `warning` como o chip
          `keys.statusUnknown` dos cartões acima (o terceiro estado honesto). */}
      {statusError ? (
        <RetryAlert
          severity="warning"
          message={t('translation:keys.statusUnknown')}
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      ) : null}
    </Stack>
  );
}
