/**
 * ThemeModeSelector.stories.tsx — Componentes/Tema/ThemeModeSelector.
 *
 * O SELETOR DE TEMA da interface: seleção direta num segmentado
 * (claro · sistema · escuro), nunca um botão que cicla. Um componente, dois
 * tamanhos: `full` (Configurações → Aparência: ícone + rótulo) e `compact`
 * (pé da coluna lateral: só ícones, com tooltip).
 *
 * ─── ELE RESPONDE À TOOLBAR "Tema" DO STORYBOOK ─────────────────────────────
 * O componente NÃO tem estado próprio: lê `useColorScheme()` do MUI, a mesma
 * fonte que o toolbar global `Tema` do preview dirige (o `SchemeSync` chama
 * `setMode` — o MESMO caminho do app real, com persistência em
 * `localStorage['theme-mode']`). As histórias `ModoClaro/ModoSistema/
 * ModoEscuro` fixam o global `themeMode` — mudar o toolbar enquanto uma está
 * aberta move o segmento selecionado e o próprio tema (as variáveis CSS trocam
 * sozinhas; nenhuma cor é escolhida por ternário). É essa a demonstração de
 * que o seletor e o toolbar são o MESMO estado.
 *
 * Cobertura: os 3 modos (selecionado) · as 2 variantes · tooltips i18n REAIS
 * (`theme.mode.toggle` + `theme.mode.*`) · foco por teclado (roving tabindex
 * do grupo) · seleção seguindo o toolbar em tempo real.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import ThemeModeSelector from './ThemeModeSelector';

/** O segmento selecionado marca `aria-pressed="true"` (ToggleButton do MUI). */
function segmentoSelecionado(canvas: ReturnType<typeof within>, modo: string): HTMLElement {
  return canvas.getByRole('button', { name: modo, pressed: true });
}

const meta = {
  title: 'Componentes/Tema/ThemeModeSelector',
  component: ThemeModeSelector,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Seletor de tema por seleção direta (claro · sistema · escuro). Sem estado próprio: ' +
          'lê `useColorScheme()` e o toolbar global "Tema" do Storybook dirige o MESMO estado ' +
          '(como o `ThemeModeSelector` da app). Os nomes acessíveis vêm da i18n real ' +
          '(`theme.mode.*`).',
      },
    },
  },
  args: { variant: 'full' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['full', 'compact'],
      description: '`full` = Configurações (ícone + rótulo); `compact` = pé da sidebar (ícones + tooltip).',
    },
  },
} satisfies Meta<typeof ThemeModeSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Variante completa (default) — os três segmentos com rótulo; o selecionado
 * segue o modo atual (toolbar "Tema").
 */
export const VarianteCompleta: Story = {};

/**
 * Variante compacta — só ícones, com tooltip i18n real por segmento
 * (`Tema: Claro`, `Tema: Sistema`, `Tema: Escuro` — `theme.mode.toggle` +
 * `theme.mode.*`). `disableInteractive`: o tooltip nunca rouba o ponteiro.
 */
export const VarianteCompacta: Story = {
  args: { variant: 'compact' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole('button', { name: 'Claro' }));
    const tooltip = await within(document.body).findByRole('tooltip');
    await expect(tooltip).toHaveTextContent('Tema: Claro');
  },
};

/** Modo CLARO — o segmento "Claro" selecionado (global `themeMode: light`). */
export const ModoClaro: Story = {
  globals: { themeMode: 'light' },
  play: async ({ canvasElement }) => {
    await expect(segmentoSelecionado(within(canvasElement), 'Claro')).toBeInTheDocument();
  },
};

/** Modo SISTEMA — o segmento "Sistema" selecionado (global `themeMode: system`). */
export const ModoSistema: Story = {
  globals: { themeMode: 'system' },
  play: async ({ canvasElement }) => {
    await expect(segmentoSelecionado(within(canvasElement), 'Sistema')).toBeInTheDocument();
  },
};

/** Modo ESCURO — o segmento "Escuro" selecionado (global `themeMode: dark`). */
export const ModoEscuro: Story = {
  globals: { themeMode: 'dark' },
  play: async ({ canvasElement }) => {
    await expect(segmentoSelecionado(within(canvasElement), 'Escuro')).toBeInTheDocument();
  },
};

/**
 * Seleção segue o toolbar — sem global fixado: o segmento selecionado é SEMPRE
 * o modo do toolbar "Tema" neste momento (`globals.themeMode`). Trocar o
 * toolbar enquanto esta história está aberta move a seleção e o tema.
 */
export const SelecaoSegueToolbar: Story = {
  play: async ({ globals, canvasElement }) => {
    const modo = (globals.themeMode as string | undefined) ?? 'system';
    const nome = modo === 'light' ? 'Claro' : modo === 'dark' ? 'Escuro' : 'Sistema';
    await expect(segmentoSelecionado(within(canvasElement), nome)).toBeInTheDocument();
  },
};

/**
 * Foco por teclado — o grupo é `role="group"` com roving tabindex do MUI: o
 * Tab entra no segmento selecionado e as setas andam entre os três. O anel de
 * foco é o do tema (`*:focus-visible` do CssBaseline) — aqui vê-se o caminho de
 * tabulação em ação.
 */
export const Foco: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const ativo = document.activeElement as HTMLElement | null;
    await expect(ativo).toHaveAttribute('data-theme-mode');
  },
};
