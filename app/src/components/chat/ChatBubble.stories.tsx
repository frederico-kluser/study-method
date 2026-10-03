/**
 * src/components/chat/ChatBubble.stories.tsx — Componentes/Chat/ChatBubble.
 *
 * A bolha de mensagem do chat da aula: a coluna ÚNICA da referência (ONDA11),
 * balão recebido à esquerda em superfície de leitura, balão enviado à direita
 * em acento lavado, cabeçalho de grupo (avatar + nome + hora) que some nas
 * continuações. As histórias cobrem os CINCO tons (`chatBubbleTone`:
 * user/tutor/reply/error/approved), o agrupamento, o typewriter da mensagem
 * nova, o pulo da digitação, o estado desabilitado das ações e o conteúdo que
 * pode quebrar o layout (prosa longa, código, tabela, KaTeX, estouro).
 *
 * CONTEÚDO: fixtures reais pt-BR de `src/storybook/fixtures.chat.ts` (a
 * teoria da aula mora dentro deste balão — nada de lorem ipsum). Interações
 * verificáveis (clique nas ações, foco do teclado, revelação typewriter)
 * levam `play` do `storybook/test`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ChatBubble } from './ChatBubble';
import { shellDecorators } from '../../storybook/decorators';
import {
  CHAT_MD_ESTOURO,
  CHAT_MD_REVIEW_ERRO,
  CHAT_TEXTO_TYPEWRITER,
  mensagemAluno,
  mensagemResposta,
  mensagemReviewAprovada,
  mensagemReviewComErro,
  mensagemTutor,
  CHAT_TS,
  CHAT_TS_SEGUINTE,
} from '../../storybook/fixtures.chat';

const meta = {
  title: 'Componentes/Chat/ChatBubble',
  component: ChatBubble,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // O balão tem teto de 78% da COLUNA (semântica de chat) — o canvas fixo é o
  // enquadramento partilhado (decorators.tsx), não layout decorativo.
  decorators: shellDecorators({ canvas: { width: 720, height: 'auto' } }),
  args: {
    message: mensagemTutor(),
    isNew: false,
  },
  argTypes: {
    message: { control: false, description: 'TutorChatMessage (fixtures.chat.ts)' },
    tps: { control: { type: 'number' }, description: 'tokens/s do typewriter (default 100)' },
    skip: { control: 'boolean', description: 'pula a digitação (varredura de ~1 s)' },
    isNew: { control: 'boolean', description: 'true → a mensagem é digitada no mount' },
    regenerateDisabled: { control: 'boolean', description: '"Gerar novo desafio" desabilitado' },
  },
} satisfies Meta<typeof ChatBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ─── Os cinco tons do balão (chatBubbleTone) ────────────────────────────── */

export const Padrão: Story = {
  name: 'Tutor (teoria)',
  args: { message: mensagemTutor() },
};

export const MensagemDoAluno: Story = {
  args: {
    message: mensagemAluno(
      'Entendi a parte da função. Mas e quando a lista chega vazia — devolvo 0 ou levanto erro? https://docs.python.org/pt-br/3/tutorial/errors.html#handling-exceptions',
    ),
  },
};

export const RespostaDoTutor: Story = {
  args: {
    message: mensagemResposta(
      'Boa pergunta: devolva 0. Quem chama a função decide o que fazer com o resultado; a função só cumpre a promessa do nome.',
    ),
  },
};

export const ReviewAprovada: Story = {
  args: {
    message: mensagemReviewAprovada(),
    tps: 10,
    onRegenerate: fn(),
    onViewLesson: fn(),
    onRetryChallenge: fn(),
  },
};

export const ReviewComErro: Story = {
  args: {
    message: mensagemReviewComErro(CHAT_MD_REVIEW_ERRO),
    onRetryChallenge: fn(),
    onRegenerate: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const retry = canvas.getByRole('button', { name: 'Refazer desafio' });
    const gerar = canvas.getByRole('button', { name: 'Gerar novo desafio' });
    // Foco: a casca animada (motion.span) tem tabIndex=-1 (W9) — quem entra no
    // tab é o botão, nunca a casca.
    await userEvent.tab();
    expect(document.activeElement).toBe(retry);
    // As ações convivem (o retry repete o MESMO desafio; gerar é a saída de
    // sempre) e o clique não navega — chama o callback que a LessonView liga.
    await userEvent.click(retry);
    expect(args.onRetryChallenge).toHaveBeenCalledTimes(1);
    await userEvent.click(gerar);
    expect(args.onRegenerate).toHaveBeenCalledTimes(1);
  },
};

export const ReviewComErroVerAula: Story = {
  args: {
    message: mensagemReviewComErro(CHAT_MD_REVIEW_ERRO),
    onRetryChallenge: fn(),
    onViewLesson: fn(),
  },
};

export const AçãoDesabilitada: Story = {
  args: {
    message: mensagemReviewComErro(CHAT_MD_REVIEW_ERRO),
    onRegenerate: fn(),
    regenerateDisabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gerar = canvas.getByRole('button', { name: 'Gerar novo desafio' });
    expect(gerar).toHaveProperty('disabled', true);
  },
};

/* ─── Agrupamento (groupsWithPrevious): o cabeçalho só diz o que é novo ──── */

export const AgrupamentoDeMensagens: Story = {
  render: () => (
    <>
      <ChatBubble message={mensagemTutor(CHAT_TEXTO_TYPEWRITER, CHAT_TS)} isNew={false} />
      <ChatBubble
        message={mensagemTutor(
          'Repare que as duas últimas mensagens minhas se agrupam: mesmo nome e mesma hora, sem cabeçalho repetido.',
          CHAT_TS,
        )}
        isNew={false}
        previous={mensagemTutor(CHAT_TEXTO_TYPEWRITER, CHAT_TS)}
      />
      <ChatBubble
        message={mensagemAluno('Ficou claro, obrigado!', CHAT_TS_SEGUINTE)}
        isNew={false}
        previous={mensagemTutor(
          'Repare que as duas últimas mensagens minhas se agrupam: mesmo nome e mesma hora, sem cabeçalho repetido.',
          CHAT_TS,
        )}
      />
    </>
  ),
};

/* ─── Ciclo de vida: digitação (typewriter) e pulo ──────────────────────── */

export const Digitando: Story = {
  args: {
    message: mensagemTutor(CHAT_TEXTO_TYPEWRITER),
    isNew: true,
    tps: 100,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A revelação é progressive: o texto COMPLETO tem de aparecer (o relógio
    // é o do app — 100 tps ≈ 400 chars/s; a fixture curta termina em <1 s).
    await canvas.findByText(CHAT_TEXTO_TYPEWRITER, undefined, { timeout: 5000 });
  },
};

export const PulandoADigitação: Story = {
  args: {
    message: mensagemTutor(CHAT_TEXTO_TYPEWRITER),
    isNew: true,
    skip: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // ONDA-SKIP-1S: o pulo NÃO estoura o texto na cara — varre o resto em ~1 s
    // e termina com o texto inteiro visível.
    await canvas.findByText(CHAT_TEXTO_TYPEWRITER, undefined, { timeout: 5000 });
  },
};

/* ─── Conteúdo que pode quebrar o layout (overflow) ─────────────────────── */

export const ConteúdoComEstouro: Story = {
  args: {
    message: mensagemTutor(CHAT_MD_ESTOURO),
    isNew: false,
  },
};
