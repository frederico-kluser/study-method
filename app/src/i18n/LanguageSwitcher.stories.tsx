/**
 * Funcionalidades/Onboarding/LanguageSwitcher — o trocador de idioma do shell.
 *
 * O que estas histórias documentam:
 *   - os DOIS idiomas selecionados (pt-BR e en — os únicos suportados, com as
 *     bandeiras/nomes de `SUPPORTED_LANGUAGES`);
 *   - o MENU aberto (a variante `menu` da AppBar: botão compacto + dropdown com
 *     o item ativo selecionado);
 *   - a variante `select` (um MUI `Select` para contextos de formulário);
 *   - o FOCO visível do botão (a ordem de Tab do shell).
 *
 * A persistência NÃO vive no componente (é efeito do evento `languageChanged`
 * do `src/i18n`), então as histórias só trocam a instância i18n real — o mesmo
 * caminho do produto: `initI18n('en')` / `initI18n('pt-BR')` sobre a instância
 * default que o preview inicializa.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import LanguageSwitcher from './LanguageSwitcher';
import { initI18n } from './index';

const meta = {
  title: 'Funcionalidades/Onboarding/LanguageSwitcher',
  component: LanguageSwitcher,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { variant: 'menu' },
  argTypes: {
    variant: { control: 'select', options: ['menu', 'select'] },
  },
} satisfies Meta<typeof LanguageSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

/** pt-BR selecionado (o default do app): bandeira 🇧🇷 no botão. */
export const PortuguesSelecionado: Story = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('group', { name: 'Idioma / Language' })).toBeTruthy();
    await userEvent.click(tela.getByRole('button', { name: 'Select language' }));
    const menu = await within(document.body).findByRole('menu');
    const itens = within(menu).getAllByRole('menuitem');
    expect(itens.length).toBe(2);
    expect(itens[0]?.getAttribute('aria-selected')).toBe('true');
    expect(itens[0]?.textContent).toBe('🇧🇷 Português (Brasil)');
  },
};

/** en selecionado (a instância i18n real muda — o componente só a lê). */
export const InglesSelecionado: Story = {
  beforeEach: async () => {
    await initI18n('en');
    return () => {
      void initI18n('pt-BR');
    };
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Select language' }));
    const menu = await within(document.body).findByRole('menu');
    const itens = within(menu).getAllByRole('menuitem');
    expect(itens[1]?.getAttribute('aria-selected')).toBe('true');
    expect(itens[1]?.textContent).toBe('🇺🇸 English');
  },
};

/** Menu aberto: as duas opções, com o ativo marcado (troca por clique). */
export const MenuAberto: Story = {
  beforeEach: () => () => {
    void initI18n('pt-BR');
  },
  play: async ({ canvasElement, args }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Select language' }));
    const menu = await within(document.body).findByRole('menu');
    const itens = within(menu).getAllByRole('menuitem');
    // Escolher "English" troca o idioma da instância real (e persiste por ela).
    await userEvent.click(itens[1]!);
    const i18n = await initI18n();
    expect(i18n.language).toBe('en');
    expect(args.variant).toBe('menu');
  },
};

/** Variante `select`: um MuiSelect com os dois idiomas (para formulários). */
export const VarianteSelect: Story = {
  args: { variant: 'select' },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('button', { name: /Português|English|🇺🇸|🇧🇷/ })).toBeTruthy();
  },
};

/** Foco visível: o botão entra na ordem de Tab do shell. */
export const Focado: Story = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const botao = tela.getByRole('button', { name: 'Select language' });
    botao.focus();
    expect(document.activeElement === botao).toBe(true);
  },
};
