/**
 * src/components/shell/SessionFrame.stories.tsx — Componentes/Shell/SessionFrame.
 *
 * A COLUNA lateral do shell (o antigo quadro de sessão, virado 90°): título do
 * app → SLOT da view ativa → poço de estado (assunto/fase) → controles no pé
 * (tema + idioma + ajuda, na MESMA linha). A largura é a que a divisória manda
 * (`basisPx`, em px já clampado por `splitRatio`).
 *
 * ESTADOS DOCUMENTADOS:
 *   · `Padrao` — sessão com assunto e fase publicados; slot vazio (é assim que
 *     fica fora da aula: o slot `:empty` sai do fluxo e NÃO abre espaço).
 *   · `SemSessao` — nada publicado: os campos mostram os placeholders em tinta
 *     secundária ("Em repouso"), nunca uma fase inventada.
 *   · `ComConteudoDoSlot` — a view ativa publica no slot (a MESMA publicação da
 *     LessonView: o `LessonSidebarHeader` real, com curso, aula, progresso e
 *     ações — fixture `fixtureSidebarHeader`) — é a resposta ao "a informação
 *     dele nunca muda".
 *   · `ConteudoLongo` — o título/resumo LONGOS da fixture: QUEBRAM linha (SC
 *     1.4.12), nunca truncam — o caso de estouro da coluna estreita.
 *   · `ColunaEstreita` — no PISO da divisória (180px): os campos crescem em
 *     altura e a linha de controles quebra para a segunda linha em vez de
 *     estourar a coluna.
 *
 * O cabeçalho (título do app — alvo `app-title` do onboarding) e o rodapé
 * (controles — alvos `theme-toggle`/`language-switcher`) estão em todas as
 * histórias: são fixos da coluna, tal como no app.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { LessonSidebarHeader } from '../course/LessonSidebarHeader';
import {
  fixtureSidebarHeader,
  fixtureSidebarHeaderTituloLongo,
  type LessonSidebarHeaderData,
} from '../../storybook/fixtures.course';
import { SessionSeed, shellDecorators, withFixedCanvas } from '../../storybook/decorators';
import SessionFrame from './SessionFrame';
import { SessionFrameDemo } from './SessionFrame.stories.helpers';

/**
 * O que a view ativa publica no slot: o cabeçalho REAL da aula (a mesma
 * publicação da LessonView), com os callbacks de navegação ligados a nada —
 * a história documenta a coluna, não o popover de Desafios.
 */
function lessonSlotContent(data: LessonSidebarHeaderData): ReactElement {
  return (
    <LessonSidebarHeader
      {...data}
      onChallengesClick={() => {
        // A view ancora o popover de Desafios no botão.
      }}
      onSourcesClick={() => {
        // A view abre o diálogo de Fontes.
      }}
      onPrerequisiteClick={() => {
        // A view navega para a aula anterior.
      }}
    />
  );
}

const meta = {
  title: 'Componentes/Shell/SessionFrame',
  component: SessionFrame,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: shellDecorators({ canvas: { width: 320, height: 560 } }),
  args: {
    basisPx: 240,
    animateBasis: true,
    // O callback ref de VERDADE é ligado pelo `SessionFrameDemo` (é ele que
    // sobe o nó do slot para o `ShellSidebarSlotContext`, como no App.tsx);
    // este argumento documenta a prop — não é o caminho do slot nas histórias.
    slotRef: () => {},
  },
  argTypes: {
    basisPx: {
      control: { type: 'range', min: 180, max: 320, step: 4 },
      description: 'Largura da coluna em px (o que a divisória manda; piso efetivo = 180).',
    },
    animateBasis: {
      control: 'boolean',
      description: 'Anima o flex-basis (passo de teclado). Desligado durante o arraste.',
    },
  },
  render: (args) => <SessionFrameDemo basisPx={args.basisPx} animateBasis={args.animateBasis} />,
} satisfies Meta<typeof SessionFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Padrao — a coluna com uma sessão viva (assunto e fase publicados pela
 * LessonView) e o slot vazio: cabeçalho, poço de estado e controles no pé.
 */
export const Padrao: Story = {
  render: (args) => (
    <SessionSeed
      patch={{
        subject: 'Funções em Python',
        phase: 'autorando',
        status: 'running',
        fraction: 0.4,
      }}
    >
      <SessionFrameDemo basisPx={args.basisPx} animateBasis={args.animateBasis} />
    </SessionSeed>
  ),
};

/**
 * SemSessao — nada publicado: o poço mostra os placeholders ("Sem assunto" /
 * "Em repouso") em tinta secundária. É o estado de Home/Settings/Roadmap.
 */
export const SemSessao: Story = {};

/**
 * ComConteudoDoSlot — a view ativa publicou o cabeçalho da aula no slot (o
 * mesmo `LessonSidebarHeader` que a LessonView teleporta para a coluna): o
 * contexto do que está aberto ao lado, dentro do banner, fora do poço vivo.
 */
export const ComConteudoDoSlot: Story = {
  render: (args) => (
    <SessionSeed
      patch={{
        subject: 'Funções em Python',
        phase: 'materializando',
        status: 'running',
        fraction: 0.65,
      }}
    >
      <SessionFrameDemo
        basisPx={args.basisPx}
        animateBasis={args.animateBasis}
        slotContent={lessonSlotContent(fixtureSidebarHeader)}
      />
    </SessionSeed>
  ),
};

/**
 * ConteudoLongo — título e resumo longos (a fixture de estouro): o texto
 * QUEBRA de linha e a coluna cresce em altura; nada é truncado com reticências
 * (SC 1.4.12 — a política do sidebar é "quebra, nunca recorta").
 */
export const ConteudoLongo: Story = {
  render: (args) => (
    <SessionSeed
      patch={{
        subject: 'Funções de ordem superior',
        phase: 'validando',
        status: 'running',
        fraction: 0.8,
      }}
    >
      <SessionFrameDemo
        basisPx={args.basisPx}
        animateBasis={args.animateBasis}
        slotContent={lessonSlotContent(fixtureSidebarHeaderTituloLongo)}
      />
    </SessionSeed>
  ),
};

/**
 * ColunaEstreita — no piso da divisória (180px) o contrato continua "quebra,
 * nunca recorta": o título do app quebra e a linha de controles quebra para a
 * linha de baixo em vez de estourar (é o `flexWrap` do pé da coluna).
 */
export const ColunaEstreita: Story = {
  decorators: [withFixedCanvas(240, 420)],
  args: { basisPx: 180, animateBasis: false },
};