/**
 * src/components/shell/NavigationRail.stories.tsx — Componentes/Shell/NavigationRail.
 *
 * O rail de navegação à esquerda do shell: 4-5 destinos, SÓ-ÍCONE, na ordem
 * canónica de `lib/shellNav` (Início → Aula → Trilha → Games → Configurações).
 * Os nomes dos destinos vivem no `aria-label` de cada tab e no `<Tooltip>`
 * (hover e foco de teclado) — a largura NUNCA depende do rótulo.
 *
 * ESTADOS DOCUMENTADOS:
 *   · `Padrao` — a aba ativa do painel (`active: PanelKey`).
 *   · `TodasAsAbas` — as 5 abas, cada rail com o seu destino selecionado, com
 *     os rótulos reais do produto por cima (o que os ícones representam).
 *   · `PainelDesafio` — o painel Desafio NÃO tem tab: com ele ativo, nenhuma
 *     aba fica selecionada (estado "fantasma" alcançado por navegação
 *     programática, `navIndexOf('challenge') === -1`).
 *   · `Foco` — o anel de foco grande do app (`focusRingStyles`, duas cores).
 *   · `Teclado` — roving tabindex do MUI: as setas movem o foco entre as
 *     abas e Enter/Space seleciona (o `onChange` entrega o `NavKey`).
 *   · `LarguraFixa` — a largura do rail é CONSTANTE (`RAIL_WIDTH`): o
 *     comprimento de um rótulo futuro não pode mexer no orçamento horizontal
 *     do composer (é a conta de tests/composerMinWidth.test.ts).
 *
 * NOTA DE VALOR (contrato vivo, não lapso desta história): o rail era 104px
 * COM rótulo sob o ícone; a ONDA-UX-RAIL-ICON passou a 80px só-ícone — os
 * rótulos partiram-se ao meio em "Configuraç/ões" e o nome vive agora em
 * `aria-label` + Tooltip. O que se documenta é o valor ATUAL.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { expect, fn, userEvent, within } from 'storybook/test';

import { NAV_ITEMS, type NavKey, type PanelKey } from '../../lib/shellNav';
import NavigationRail from './NavigationRail';
import { shellDecorators } from '../../storybook/decorators';

/**
 * Largura do rail — espelho da constante `RAIL_WIDTH` de NavigationRail.tsx
 * (80px, ONDA-UX-RAIL-ICON). A história TRANCA o valor: mudar a largura do
 * rail muda o orçamento do composer (tests/composerMinWidth.test.ts).
 */
const RAIL_WIDTH_PX = 80;

const PANEL_OPTIONS: readonly PanelKey[] = [
  ...NAV_ITEMS.map((item) => item.key),
  'challenge',
];

const meta = {
  title: 'Componentes/Shell/NavigationRail',
  component: NavigationRail,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: shellDecorators({ canvas: false }),
  args: {
    active: 'home',
    onChange: fn(),
  },
  argTypes: {
    active: {
      control: 'select',
      options: PANEL_OPTIONS,
      description:
        "Painel ativo (PanelKey). `'challenge'` não tem tab: nenhuma aba fica selecionada.",
    },
  },
} satisfies Meta<typeof NavigationRail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Repouso — o destino de arranque do app (`active: 'home'`). */
export const Padrao: Story = {};

/**
 * Todas as abas — cada rail com o seu destino selecionado, com o rótulo real
 * do produto (`nav.*`) por cima: o mapa ícone ⟷ destino do rail inteiro.
 */
export const TodasAsAbas: Story = {
  render: (args) => <RailComparison onChange={args.onChange} />,
};

/**
 * Painel Desafio — sem tab no rail, a navegação programática deixa o rail
 * SEM nenhuma aba selecionada (`aria-selected="false"` em todas).
 */
export const PainelDesafio: Story = {
  args: { active: 'challenge' },
};

/** Foco de teclado — o anel grande do app no primeiro alvo de Tab. */
export const Foco: Story = {
  play: async ({ canvasElement }) => {
    const tabs = within(canvasElement).getAllByRole('tab');
    await userEvent.tab();
    expect(tabs).toContain(canvasElement.ownerDocument.activeElement);
  },
};

/**
 * Teclado — as setas movem o foco entre as abas (roving tabindex do
 * `orientation="vertical"`) e Enter seleciona o destino focado, entregando o
 * `NavKey` ao `onChange` — é assim que o shell troca de painel sem rato.
 */
export const Teclado: Story = {
  args: { onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const tabs = within(canvasElement).getAllByRole('tab');
    await userEvent.tab();
    expect(canvasElement.ownerDocument.activeElement).toBe(tabs[0]);

    await userEvent.keyboard('{ArrowDown}');
    expect(canvasElement.ownerDocument.activeElement).toBe(tabs[1]);

    await userEvent.keyboard('{Enter}');
    expect(args.onChange).toHaveBeenCalledWith(NAV_ITEMS[1].key);
  },
};

/**
 * Largura fixa — o rail ocupa `RAIL_WIDTH` (80px) em qualquer estado: com
 * rótulo curto, longo ou futuro, o orçamento horizontal do composer não muda.
 */
export const LarguraFixa: Story = {
  play: async ({ canvasElement }) => {
    const tablist = within(canvasElement).getByRole('tablist');
    const root = tablist.closest('.MuiTabs-root');
    expect(root).not.toBeNull();
    expect(root?.getBoundingClientRect().width).toBe(RAIL_WIDTH_PX);
  },
};

/** Comparação lado a lado dos destinos do rail (composição de catálogo). */
function RailComparison({
  onChange,
}: {
  onChange: (key: NavKey) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'flex-start' }}>
      {NAV_ITEMS.map((item) => (
        <Box
          key={item.key}
          sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center' }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t(item.i18nKey)}
          </Typography>
          <NavigationRail active={item.key} onChange={onChange} />
        </Box>
      ))}
    </Box>
  );
}