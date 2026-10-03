/**
 * src/components/quiz/QuizChatCard.stories.tsx — Componentes/Quiz/QuizChatCard.
 *
 * O CONVITE do quiz dentro da conversa: o anúncio (texto centralizado em
 * negrito), a linha de estado (`role="status"`) e as AÇÕES DE RESPOSTA. O que
 * estas histórias documentam, no vocabulário do produto:
 *
 *   - o ciclo tem 6 estados visíveis (`QuizOverlayStatus` + "sobre a tela") e
 *     cada um diz a sua verdade (inclusive o honesto 'aguardando-vez');
 *   - o CTA "Responder" só existe num deles (`aguardando`, fora da tela) — é
 *     o ÚNICO caminho para o quiz subir (ONDA11);
 *   - as saídas do ciclo travado ("Pedir de novo" / "Responder esta pergunta
 *     de novo") só aparecem quando há o que repetir/reabrir;
 *   - o veredito ('dominado') é verde e informativo — nunca elogio.
 *
 * A decisão de quais ações existem é do modelo PURO `quizChatCardState`
 * (coberto por tests/quizChatCardState.test.ts); estas histórias mostram o
 * desenho que essa decisão produz.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { QuizChatCard } from './QuizChatCard';
import { quizAssertion } from '../../storybook/fixtures.quiz';

const PERGUNTA = quizAssertion.question;

const meta = {
  title: 'Componentes/Quiz/QuizChatCard',
  component: QuizChatCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'O convite do quiz na conversa. `status`/`onScreen` vêm do ciclo (`overlayStatusFor`); `onRetry`/`onReopen` são `null` fora do ciclo travado.',
      },
    },
  },
  args: {
    quizKey: 'sec-variavel::assert-tipos',
    status: 'aguardando',
    onScreen: false,
    question: PERGUNTA,
    generation: 0,
    notice: null,
    onOpen: fn(),
    onRetry: null,
    onReopen: null,
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['aguardando', 'aguardando-vez', 'explicando', 'gerando', 'indisponivel', 'dominado'],
      description: 'ponto do ciclo, no vocabulário da tela (`overlayStatusFor`)',
    },
    onScreen: {
      control: 'boolean',
      description: 'true quando o overlay está a desenhar este quiz sobre a tela',
    },
    question: { control: 'text', description: 'a pergunta da geração corrente (identidade do card)' },
    generation: { control: 'number', description: 'geração corrente (0 = o quiz autoral)' },
    notice: { control: 'text', description: 'aviso informativo do canal (fail-closed); null = nada a dizer' },
    quizKey: { control: 'text', description: 'chave canônica do quiz (âncora de devolução de foco)' },
    onOpen: { control: false, description: 'abrir o quiz sobre a tela (o único caminho, ONDA11)' },
    onRetry: { control: false, description: 'repetir o pedido que falhou; null quando não há o que repetir' },
    onReopen: {
      control: false,
      description: 'responder de novo a MESMA pergunta; null fora do ciclo travado',
    },
  },
} satisfies Meta<typeof QuizChatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `onRetry`/`onReopen` presentes — o par de saídas do ciclo travado (ONDA4). */
const SAIDAS_CICLO_TRAVADO = {
  onRetry: fn(),
  onReopen: fn(),
} as const;

export const Padrão: Story = {
  name: 'Aguardando (com o CTA)',
  parameters: {
    docs: {
      description: {
        story:
          'O estado interativo: anúncio + linha de estado + o CTA "Responder" (nome acessível composto com a pergunta — três cards na mesma conversa não podem ter o mesmo nome).',
      },
    },
  },
};

export const SobreATela: Story = {
  args: { onScreen: true },
  parameters: {
    docs: {
      description: {
        story:
          'Com o quiz sobre a tela o card RESERVA o lugar (sem ele a conversa pulava ao minimizar) e o CTA some — ele é desmontado de propósito: é a âncora do card que recebe o foco quando o modal sai.',
      },
    },
  },
};

export const NaFila: Story = {
  args: { status: 'aguardando-vez' },
  parameters: {
    docs: {
      description: {
        story:
          'ONDA16-CICLO-CARGA: o ciclo quer rodar, mas um turno do tutor está em voo. O card diz "Na fila…" em vez de anunciar trabalho que ainda nem foi pedido.',
      },
    },
  },
};

export const Explicando: Story = {
  args: { status: 'explicando' },
  parameters: {
    docs: {
      description: {
        story:
          'Ciclo em andamento: NENHUM botão — não há nada que o clique do aluno adiante, e um botão morto é pior que nenhum.',
      },
    },
  },
};

export const Gerando: Story = {
  args: { status: 'gerando' },
};

export const CicloTravado: Story = {
  args: {
    status: 'indisponivel',
    notice: 'O ciclo parou aqui. Você pode pedir de novo.',
    ...SAIDAS_CICLO_TRAVADO,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Fail-closed do canal: o aviso descreve o que faltou (nunca repreensão) e as DUAS saídas aparecem — "Pedir de novo" (depende da IA) e "Responder esta pergunta de novo" (não depende, e continua exigindo acertar).',
      },
    },
  },
};

export const Dominado: Story = {
  args: { status: 'dominado' },
  parameters: {
    docs: {
      description: {
        story:
          'O veredito de maestria: check verde acompanhado do texto de `role="status"` (a informação nunca depende só da cor) e sem "Parabéns!" (§8.2 — o acerto é informacional).',
      },
    },
  },
};

export const SegundaGeracao: Story = {
  args: { status: 'aguardando', generation: 1 },
  parameters: {
    docs: {
      description: {
        story: 'A etiqueta "Quiz 2 desta afirmação" aparece quando a geração exibida é > 0.',
      },
    },
  },
};

export const PerguntaLonga: Story = {
  args: {
    question:
      'Considerando que a função `print` escreve na saída o texto que recebe entre parênteses e que esse texto pode conter interpolação de variáveis, o que aparece na tela ao executar `print(f"{temperatura} graus")` com `temperatura = 23`?',
    status: 'aguardando',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Teste de overflow: a pergunta é a identidade do card e pode ser longa — o anúncio tem teto de leitura (560px) e quebra sem estourar o card.',
      },
    },
  },
};

export const InteraçõesDoCta: Story = {
  name: 'Interação: o CTA chama onOpen',
  args: { status: 'aguardando' },
  play: async ({ canvasElement, args }) => {
    const tela = within(canvasElement);
    const cta = tela.getByRole('button', { name: new RegExp(`^Responder: ${escapeRegex(PERGUNTA)}$`) });
    await expect(cta).toBeVisible();
    await userEvent.click(cta);
    await expect(args.onOpen).toHaveBeenCalledOnce();
  },
};

function escapeRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
