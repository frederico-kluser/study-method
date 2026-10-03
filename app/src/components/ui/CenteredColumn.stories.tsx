/**
 * src/components/ui/CenteredColumn.stories.tsx — Componentes/UI/CenteredColumn.
 *
 * O molde "coluna centrada" `p: 2, maxWidth: N, mx: 'auto'` (auditoria de
 * layout §4) — 13 blocos com larguras escritas à mão aposentados. As
 * histórias mostram a coluna de leitura por omissão, a variante com respiro de
 * topo e as LARGURAS nomeadas de `LAYOUT.*` (as seis da auditoria: leitura,
 * seletor, larga, painel, página e a família de cartão de modal).
 */
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { CenteredColumn } from './CenteredColumn';
import { LAYOUT } from '../../lib/designTokens';

const meta = {
  title: 'Componentes/UI/CenteredColumn',
  component: CenteredColumn,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    children: (
      <Typography>
        Coluna de leitura: ~72 caracteres por linha (SC 1.4.8). É a medida em que
        a teoria da aula é escrita.
      </Typography>
    ),
  },
  argTypes: {
    width: { control: 'number', description: 'teto em px — usar LAYOUT.* (designTokens)' },
    topPad: { control: 'number', description: 'respiro de topo em unidades de spacing' },
    children: { control: false },
  },
} satisfies Meta<typeof CenteredColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const ComRespiroDeTopo: Story = {
  args: {
    topPad: 4,
    children: <Typography>Bloco de erro/estado com respiro extra no topo (pt: 4).</Typography>,
  },
};

export const ColunaDeLeitura: Story = {
  args: { width: LAYOUT.readingColumnPx },
};

export const LargurasDoLayout: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'As larguras nomeadas de `LAYOUT.*` — a fonte única dos `maxWidth` que estavam copiados à mão (§4/§6 da auditoria).',
      },
    },
  },
  render: () => (
    <>
      {(
        [
          ['readingColumnPx', LAYOUT.readingColumnPx],
          ['chooserColumnPx', LAYOUT.chooserColumnPx],
          ['wideColumnPx', LAYOUT.wideColumnPx],
          ['panelColumnPx', LAYOUT.panelColumnPx],
          ['pageMaxPx', LAYOUT.pageMaxPx],
        ] as const
      ).map(([nome, valor]) => (
        <Box key={nome} sx={{ width: '100%', mb: 1 }}>
          <CenteredColumn width={valor}>
            <Typography variant="body2">
              LAYOUT.{nome} — {valor}px
            </Typography>
          </CenteredColumn>
        </Box>
      ))}
    </>
  ),
};
