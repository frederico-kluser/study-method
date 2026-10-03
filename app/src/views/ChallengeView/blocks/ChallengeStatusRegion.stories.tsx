/**
 * blocks/ChallengeStatusRegion.stories.tsx — `Componentes/Desafio/
 * ChallengeStatusRegion` (STORY-SPEC): a região de status sr-only
 * (`role="status"` + `aria-live`) que o `announceStatus()` preenche.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { ChallengeStatusRegion } from './ChallengeStatusRegion';

const meta = {
  title: 'Componentes/Desafio/ChallengeStatusRegion',
  component: ChallengeStatusRegion,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Sempre no DOM, visualmente oculta (`SR_ONLY_SX` de `lib/a11yStyles` — medidas ' +
          'absolutas em px; a cópia local tinha o bug `width: 1` → 100%). As histórias ' +
          'mostram a marcação emitida (para o contrato de a11y ser visível no catálogo).',
      },
    },
  },
} satisfies Meta<typeof ChallengeStatusRegion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};
