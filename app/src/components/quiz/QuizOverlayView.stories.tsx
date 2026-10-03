/**
 * src/components/quiz/QuizOverlayView.stories.tsx — Componentes/Quiz/QuizOverlayView.
 *
 * A VIEW PURA do quiz sobre a tela (extração state/view): tudo o que ela
 * desenha vem dos PROPS — a fase (`QuizOverlayState`) e o conteúdo publicado
 * (`QuizOverlayContent`). Não há loja, não há seed: é esta a fronteira que
 * permite documentar cada fase do produto com argumentos diretos.
 *
 * As histórias percorrem as TRÊS fases do ciclo (fechado → sobre-a-tela →
 * minimizado-no-chat), os estados de RESPOSTA das alternativas (por responder,
 * revelada certa, revelada errada — as opções nascem iguais antes do clique;
 * o veredito usa `optionVisualState`, função pura do app) e o ciclo travado
 * com as duas saídas. Para o mesmo desenho montado no container real (loja de
 * módulo + `openQuizOverlay`), ver `QuizOverlayHost.stories.tsx`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { QuizOverlayView, type QuizOverlayViewProps } from './QuizOverlayHost';
import {
  quizAssertion,
  quizOverlayContentFixture,
  quizOverlayStateFixture,
  quizStateCerta,
  quizStateErrada,
} from '../../storybook/fixtures.quiz';

const meta = {
  title: 'Componentes/Quiz/QuizOverlayView',
  component: QuizOverlayView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O quiz SOBRE A TELA (a metade do overlay). Os dois snapshots (`overlay`, `content`) chegam por props; `minimize` é a ÚNICA saída — Esc, backdrop e botão fazem todos o mesmo: descer para a conversa, nunca fechar o ciclo.',
      },
    },
  },
  args: {
    overlay: quizOverlayStateFixture(),
    content: quizOverlayContentFixture(),
    minimize: fn(),
    getReturnAnchor: () => null,
  },
  argTypes: {
    overlay: {
      control: false,
      description: 'snapshot da fase (`quizOverlayState`): fechado / sobre-a-tela / minimizado-no-chat',
    },
    content: {
      control: false,
      description: 'conteúdo publicado pela view da aula (null = nada a desenhar)',
    },
    minimize: { control: false, description: 'minimizar para a conversa — a única saída' },
    getReturnAnchor: {
      control: false,
      description:
        'âncora de devolução de foco (o card da conversa) — o container resolve-a no fechamento; o laço de foco vive no `ModalScrim`',
    },
  },
} satisfies Meta<typeof QuizOverlayView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SobreATela: Story = {
  name: 'Sobre a tela (por responder)',
  parameters: {
    docs: {
      description: {
        story:
          'A fase do meio: o diálogo modal com a pergunta e as 4 alternativas VISUALMENTE IDÊNTICAS — a resposta não vaza antes do clique (quem decide a aparência é `optionVisualState`, que nem lê `answerIndex` antes da resposta).',
      },
    },
  },
};

export const Fechado: Story = {
  args: {
    overlay: quizOverlayStateFixture({ phase: 'fechado', quizKey: null }),
  },
  parameters: {
    docs: {
      description: {
        story: 'Fechado — nada é desenhado (o fim do ciclo é a maestria; a view não tem o que mostrar).',
      },
    },
  },
};

export const MinimizadoNoChat: Story = {
  args: {
    overlay: quizOverlayStateFixture({ phase: 'minimizado-no-chat', minimizeCount: 1 }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Respondendo, o card desce para a conversa (`QuizChatCard` desenha o convite lá) — o overlay sai da tela, mas a fase e as respostas continuam no store/cache.',
      },
    },
  },
};

export const ConteudoAusente: Story = {
  args: {
    overlay: quizOverlayStateFixture(),
    content: null,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Conteúdo `null` (a LessonView desmontou numa troca de aba): o overlay NÃO desenha card órfão — a fase fica guardada e o quiz reaparece quando a aula volta.',
      },
    },
  },
};

export const ReveladaCerta: Story = {
  args: {
    content: quizOverlayContentFixture({ quiz: quizStateCerta, status: 'dominado' }),
    overlay: quizOverlayStateFixture({ phase: 'sobre-a-tela' }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Resposta CERTA revelada: a opção correta em verde com check, as demais travadas (`disabled`), e o feedback informativo ("Você acertou: é isso que a seção mostra.") — sem elogio ritualizado.',
      },
    },
  },
};

export const ReveladaErrada: Story = {
  args: {
    content: quizOverlayContentFixture({ quiz: quizStateErrada, status: 'explicando' }),
    overlay: quizOverlayStateFixture({ phase: 'sobre-a-tela' }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Resposta ERRADA revelada: vermelho só na alternativa escolhida, verde na certa, as outras `disabled`, e o veredito é DIAGNÓSTICO ("Ainda não: essa alternativa se separa do que a seção mostra.") — nada de repreensão.',
      },
    },
  },
};

export const CicloTravado: Story = {
  args: {
    overlay: quizOverlayStateFixture({ phase: 'sobre-a-tela' }),
    content: quizOverlayContentFixture({
      status: 'indisponivel',
      notice: 'O ciclo parou aqui. Você pode pedir de novo.',
      onRetry: fn(),
      onReopen: fn(),
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Fail-closed do canal: o aviso descreve o que faltou e o overlay oferece as DUAS saídas do ciclo travado — "Pedir de novo" (depende da IA) e "Responder esta pergunta de novo" (não depende). Os rótulos pintam em TINTA: o `accentText` do tema reprova o piso de 4,5:1 sobre o cartão (nível 4) no escuro.',
      },
    },
  },
};

export const SegundaGeracao: Story = {
  args: {
    overlay: quizOverlayStateFixture({ generation: 2 }),
    content: quizOverlayContentFixture({ generation: 2, status: 'aguardando' }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Geração 2 (quiz remediador): a etiqueta "Quiz 3 desta afirmação" — a geração exibida é N+1, e cada geração recebe ordem de alternativas própria (`quizOptionOrder`), para "clicar no mesmo lugar" não ser atalho.',
      },
    },
  },
};

export const PerguntaELongas: Story = {
  args: {
    content: quizOverlayContentFixture({
      assertion: {
        ...quizAssertion,
        question:
          'Considerando que a função `print` escreve na saída o texto que recebe entre parênteses e que esse texto pode conter interpolação de variáveis, o que aparece na tela ao executar `print(f"{temperatura} graus")` com `temperatura = 23`?',
        options: [
          'O texto `23 graus`, com o valor da variável já substituído no lugar da expressão entre chaves',
          'O texto literal `f"{temperatura} graus"`, sem substituição nenhuma',
          'Um erro de sintaxe, porque f-strings não aceitam nomes de variáveis',
          'Nada — a função só escreve quando recebe um número',
        ],
      },
      notice:
        'A explicação diagnóstica não foi possível: o canal de IA ficou sem resposta dentro do tempo. O ciclo continua a partir daqui quando você pedir de novo.',
      status: 'indisponivel',
      onRetry: fn(),
      onReopen: fn(),
    }),
    overlay: quizOverlayStateFixture(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Teste de overflow: pergunta e alternativas longas + aviso longo. O centrado é SEGURO (`alignItems: flex-start` + `margin: auto`): com card mais alto que a janela, ele encosta ao topo e o wrapper rola — nada fica inalcançável.',
      },
    },
  },
};

export const InteraçõesMinimizar: Story = {
  name: 'Interação: o botão chama minimize',
  play: async ({ canvasElement, args }) => {
    const tela = within(canvasElement);
    const botao = tela.getByRole('button', { name: 'Minimizar para a conversa' });
    await expect(botao).toBeVisible();
    await userEvent.click(botao);
    await expect(args.minimize).toHaveBeenCalledOnce();
  },
};
