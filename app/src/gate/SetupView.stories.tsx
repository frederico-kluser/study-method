/**
 * SetupView.stories.tsx — `Vistas/SetupView` (STORY-SPEC).
 *
 * As fases do formulário obrigatório de chaves: convite ("Valide as duas
 * chaves" — W1: `gate.invalidKeys` só depois de veredito negativo), chaves
 * carregadas já inválidas, validação falhada (frase i18n + detalhe técnico),
 * a validar (spinner com rótulo visível), pronto a salvar e falha ao salvar
 * (W: o gate obrigatório nunca responde com silêncio). Os casos que precisam
 * de canal são o CONTAINER semeados com `installMockApi`; os estados
 * determinísticos usam a view pura por args.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { installMockApi } from '../storybook/mockApi';
import {
  settingsStartupBlocked,
  settingsValidationInvalid,
} from '../storybook/fixtures.settings';
import { SetupView, SetupViewView, type SetupViewViewProps } from './SetupView';

const providerIdle = { value: '', visible: false, validating: false, valid: false, invalidMsg: '', detail: '' };

const base: SetupViewViewProps = {
  providers: {
    openrouter: { ...providerIdle },
    brave: { ...providerIdle },
  },
  saving: false,
  validationFailed: false,
  saveError: null,
  allValid: false,
  patch: () => {},
  handleValidate: async () => {},
  handleContinue: async () => {},
};

const meta = {
  title: 'Vistas/SetupView',
  component: SetupViewView,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: base,
} satisfies Meta<typeof SetupViewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Convite: Story = {};

export const SetupObrigatório: Story = {
  render: () => <SetupView onDone={() => {}} startupStatus={settingsStartupBlocked} />,
  beforeEach: () => {
    installMockApi({
      keys: {
        validateLlm: async () => ({ isValid: true, provider: 'openrouter', checkedAt: '2026-01-05T10:00:00.000Z' }),
        validateBrave: async () => ({ isValid: true, provider: 'brave', checkedAt: '2026-01-05T10:00:00.000Z' }),
      },
    });
  },
};

export const ComChavesInválidas: Story = {
  args: {
    ...base,
    validationFailed: true,
  },
};

export const ValidaçãoFalhada: Story = {
  args: {
    ...base,
    validationFailed: true,
    providers: {
      openrouter: {
        value: 'sk-or-v1-exemplo-de-chave-recusada',
        visible: true,
        validating: false,
        valid: false,
        // Espelha `translation:keys.error401` em pt-BR (conteúdo real).
        invalidMsg: settingsValidationInvalid.errorMessage ?? '',
        detail: '',
      },
      brave: { ...providerIdle },
    },
  },
};

export const AValidar: Story = {
  args: {
    ...base,
    providers: {
      openrouter: {
        value: 'sk-or-v1-exemplo',
        visible: true,
        validating: true,
        valid: false,
        invalidMsg: '',
        detail: '',
      },
      brave: { ...providerIdle, value: 'BSA-exemplo' },
    },
  },
};

export const ProntoParaSalvar: Story = {
  args: {
    ...base,
    allValid: true,
    providers: {
      openrouter: { value: 'sk-or-v1-exemplo', visible: false, validating: false, valid: true, invalidMsg: '', detail: '' },
      brave: { value: 'BSA-exemplo', visible: false, validating: false, valid: true, invalidMsg: '', detail: '' },
    },
  },
};

export const FalhaAoSalvar: Story = {
  args: {
    ...base,
    allValid: true,
    saving: false,
    // Espelha `translation:keys.saveError` em pt-BR (W19: detalhe em legenda).
    saveError: {
      message: 'Falha ao salvar a chave.',
      detail: 'Error: ipc: keys.setKey não respondeu',
    },
    providers: {
      openrouter: { value: 'sk-or-v1-exemplo', visible: false, validating: false, valid: true, invalidMsg: '', detail: '' },
      brave: { value: 'BSA-exemplo', visible: false, validating: false, valid: true, invalidMsg: '', detail: '' },
    },
  },
};
