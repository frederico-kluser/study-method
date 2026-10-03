/**
 * src/components/ui/SectionHeader.stories.tsx — Componentes/UI/SectionHeader.
 *
 * A linha de cabeçalho de secção/painel (auditoria de layout §8): título +
 * slot de chips/ações, com descrição opcional. As histórias cobrem o default,
 * com ações/chips, com descrição, os três NÍVEIS semânticos (h2/h3/h4) e o
 * conteúdo longo (o título cresce sem empurrar o slot para fora).
 */
import type { Meta, StoryObj } from '@storybook/react';
import Chip from '@mui/material/Chip';

import { SectionHeader } from './SectionHeader';
import { ActionButton } from './ActionButton';

const meta = {
  title: 'Componentes/UI/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    title: 'Chaves de API',
    level: 2,
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    level: {
      control: 'select',
      options: [1, 2, 3, 4],
      description: 'nível semântico do título (1 = cabeçalho de página, <h1>)',
    },
    variant: {
      control: 'select',
      options: ['h4', 'h5', 'h6', 'subtitle1', 'subtitle2'],
      description: 'talhe explícito (escape hatch — nunca muda a semântica)',
    },
    actions: { control: false, description: 'chips/botões — o slot da direita' },
    titleId: { control: false },
  },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};

export const ComDescrição: Story = {
  args: {
    title: 'Progresso e dados',
    description: 'Acompanha o teu progresso ou limpa os dados guardados neste computador.',
  },
};

export const ComAções: Story = {
  args: {
    title: 'Desafios da aula',
    actions: (
      <>
        <Chip size="small" variant="outlined" label="2 pendentes" />
        <ActionButton size="small" variant="text">
          Gerar novo
        </ActionButton>
      </>
    ),
  },
};

export const CabeçalhoDePágina: Story = {
  args: {
    level: 1,
    title: 'Desafio: inverter uma árvore binária em C',
    actions: <Chip size="small" variant="outlined" label="2 de 5 testes" />,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Nível 1 = cabeçalho de PÁGINA (`<h1>`, talhe h4 — o do ChallengeViewHeader). O TrackChallengeHeader usa o mesmo nível com `variant: "h5"`.',
      },
    },
  },
};

export const TalheDePáginaH5: Story = {
  args: {
    level: 1,
    variant: 'h5',
    title: 'Trilha: fundamentos de C',
    description: '12 aulas · 4 concluídas',
  },
  parameters: {
    docs: {
      description: {
        story:
          'O par h5/h1 do TrackChallengeHeader: o override muda o TALHE, nunca a semântica (`SectionHeader.state.ts`).',
      },
    },
  },
};

export const Níveis: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Os quatro níveis (o `variant` vê o talhe; o `component` é a semântica que o leitor de tela lê) — a regra está em `SectionHeader.state.ts`.',
      },
    },
  },
  render: () => (
    <>
      <SectionHeader level={1} title='Nível 1 — h4 como h1 (cabeçalho de página)' />
      <SectionHeader level={2} title='Nível 2 — h6 como h2 (o default das cópias)' />
      <SectionHeader level={3} title='Nível 3 — subtitle1 como h3' />
      <SectionHeader level={4} title='Nível 4 — subtitle2 como h4' />
    </>
  ),
};

export const ConteúdoLongo: Story = {
  args: {
    title: 'Fundamentos de C: ponteiros, alocação dinâmica e aritmética de endereços',
    description:
      'Esta secção cobre tudo o que a aula exige antes do desafio, e a descrição também pode crescer sem quebrar o alinhamento com o slot de ações.',
    actions: <Chip size="small" variant="outlined" label="3 de 5 concluídas" />,
  },
};
