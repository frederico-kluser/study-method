/**
 * src/components/ui/RetryAlert.stories.tsx — Componentes/UI/RetryAlert.
 *
 * O `Alert` com retry NA AÇÃO (auditoria de layout §3, forma (b)) — 10
 * ocorrências aposentadas — mais o par mensagem/detalhe (as 4 cópias de
 * SetupView/LocalAiPanel/ProgressPanel). As histórias cobrem as severidades,
 * o detalhe em legenda, o conteúdo longo e as extensões aditivas da onda DRY
 * da LessonView (`onClose` = × de descarte; `sx` = chrome fino do chamador).
 */
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { RetryAlert } from './RetryAlert';

const meta = {
  title: 'Componentes/UI/RetryAlert',
  component: RetryAlert,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    severity: 'error',
    message: 'Não foi possível gerar um novo desafio.',
    detail: undefined,
    action: true,
    onRetry: fn(),
    // SEM descarte por omissão: sem `onClose` não há × (a regra é
    // `RetryAlert.state.ts`) — as histórias clássicas ficam como eram.
    onClose: undefined,
    sx: undefined,
  },
  argTypes: {
    severity: { control: 'select', options: ['error', 'warning', 'info', 'success'] },
    message: { control: 'text', description: 'a copy — vive no chamador (traduzida)' },
    detail: { control: 'text', description: 'legenda opcional (o par das 4 cópias)' },
    action: {
      control: 'boolean',
      description: 'false — só a mensagem/detalhe, sem botão (erros sem retentativa)',
    },
    onRetry: { action: 'retry' },
    onClose: {
      action: 'close',
      description: 'descarte (×) — SEM onClose não há × (extensão da onda da LessonView)',
    },
  },
} satisfies Meta<typeof RetryAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Erro: Story = {};

export const ComDetalhe: Story = {
  args: {
    message: 'Não foi possível consultar o estado das chaves de API.',
    detail: 'Verifique se o app iniciou corretamente e tente novamente.',
  },
};

export const Aviso: Story = {
  args: {
    severity: 'warning',
    message: 'O motor de voz está indisponível (muitas falhas).',
  },
};

export const SemAção: Story = {
  args: {
    action: false,
    message: 'A chave da OpenRouter é inválida.',
    detail: 'Corrige a chave em Configurações → Chaves de API.',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Erros SEM retentativa (o bloco de erro de chave): `action: false` mostra a mensagem e o detalhe, sem o botão "Tentar de novo".',
      },
    },
  },
};

export const SemMensagem: Story = {
  args: { message: undefined },
  parameters: {
    docs: {
      description: {
        story: 'Fallback traduzido do primitivo (`translation:ui.retryAlert.message`).',
      },
    },
  },
};

export const ConteúdoLongo: Story = {
  args: {
    message:
      'Não foi possível concluir a geração do desafio "Inverter uma árvore binária em C" porque o serviço de IA devolveu uma resposta que o validador do contrato não aceitou.',
    detail:
      'Tenta de novo em alguns segundos; se a falha continuar, as chaves de API podem estar sem quota.',
    retryLabel: 'Tentar de novo',
  },
};

export const ComDescarte: Story = {
  args: {
    severity: 'error',
    message: 'O motor de voz está indisponível.',
    onRetry: undefined,
    onClose: fn(),
    sx: { py: 0.5 },
  },
  parameters: {
    docs: {
      description: {
        story:
          'EXTENSÃO aditiva (onda DRY da LessonView): `onClose` põe o × de descarte do `Alert` e `sx` compõe o chrome fino (`py: 0.5`) por cima do `overflow-wrap` do base. O × só é desenhado quando NÃO há ação em cena — a regra do `Alert` do MUI (`action == null && onClose`), que `RetryAlert.state.ts` expõe.',
      },
    },
  },
};

export const ComDescarteERetry: Story = {
  args: {
    severity: 'error',
    message: 'O motor de voz está indisponível.',
    onRetry: fn(),
    onClose: fn(),
    sx: { py: 0.5 },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Os dois pedidos CHEGAM (`onRetry` + `onClose`) e o resultado é o MESMO de antes da migração: com retry em cena o `Alert` desenha a AÇÃO e não o × (regra do MUI v9, preservada por decisão em `RetryAlert.state.ts`). Os três alerts da aula ficam byte a byte como estavam — o descarte só existe onde não há retentativa (o aviso do canal do quiz) ou onde nunca houve ação.',
      },
    },
  },
};

export const SemRetryComDescarte: Story = {
  args: {
    severity: 'info',
    message:
      'A resposta foi registrada, mas o canal não confirmou. O aviso pode ser descartado.',
    onRetry: undefined,
    action: false,
    onClose: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'O aviso de canal do quiz da aula: SEM retentativa (não há o que repetir) mas COM descarte. Sem `onRetry` não há botão e com `onClose` há × — as duas regras de honestidade do `RetryAlert.state.ts`.',
      },
    },
  },
};
