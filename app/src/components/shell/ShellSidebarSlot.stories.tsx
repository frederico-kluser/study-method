/**
 * src/components/shell/ShellSidebarSlot.stories.tsx —
 * Componentes/Shell/ShellSidebarSlot.
 *
 * O padrão SLOT (no shell) + PORTAL (na view) que leva o contexto da view
 * ativa para a coluna lateral: o `SessionFrame` nasce com um contêiner vazio
 * (`SHELL_SIDEBAR_SLOT_ID`), o shell publica o nó por contexto
 * (`ShellSidebarSlotContext`) e a view envolve o que quer mostrar em
 * `<ShellSidebarPortal>` — o DOM é teleportado para dentro do slot, a view
 * continua DONA do conteúdo (estado, handlers, contextos).
 *
 * ESTADOS DOCUMENTADOS:
 *   · `SlotVazio` — nada publicado: o portal não tem que mostrar e o slot
 *     fica vazio (no app, `:empty` tira-o do fluxo — ver SessionFrame).
 *   · `ComPortalPublicado` — a view publica: o conteúdo aparece DENTRO do
 *     slot (`#shell-sidebar-view-slot`), mesmo vindo de fora da coluna.
 *   · `SemSlot` — sem slot (primeiro render, SSR, view fora do shell): o
 *     portal devolve `null` e NADA é renderizado — nunca lança.
 *
 * O `withSidebarSlot` (decorators partilhados) é o que fornece o contêiner do
 * slot à direita da história: sem ele, um `ShellSidebarPortal` não tem para
 * onde teleportar — que é precisamente o estado `SemSlot`.
 */
import { useId, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';

import { SHELL_SIDEBAR_SLOT_ID, ShellSidebarPortal } from './ShellSidebarSlot';
import { shellDecorators, withSidebarSlot } from '../../storybook/decorators';

/**
 * O tipo de publicação que as views fazem no slot (o mesmo papel do
 * `LessonSidebarHeader`): uma `<section aria-labelledby>` — NUNCA um
 * `<header>`, porque o slot mora dentro do banner do app e um segundo
 * `header` viraria um segundo landmark `banner`.
 */
function Publicacao(): ReactElement {
  const titleId = useId();
  return (
    <Box
      component="section"
      aria-labelledby={titleId}
      sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Fundamentos de Rust
      </Typography>
      <Typography id={titleId} variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
        Ownership e empréstimos
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        3 de 8 seções
      </Typography>
    </Box>
  );
}

const meta = {
  title: 'Componentes/Shell/ShellSidebarSlot',
  component: ShellSidebarPortal,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  // O `withSidebarSlot` entra POR HISTÓRIA: a história `SemSlot` documenta
  // justamente o comportamento quando o contêiner não existe.
  decorators: shellDecorators({ sidebarSlot: false, canvas: false }),
  args: {
    children: <Publicacao />,
  },
} satisfies Meta<typeof ShellSidebarPortal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Slot vazio — nenhuma view publicou: o slot (à direita) fica vazio e, no app,
 * sai do fluxo (`'&:empty': { display: 'none' }`).
 */
export const SlotVazio: Story = {
  decorators: [withSidebarSlot],
  args: { children: null },
};

/**
 * Com portal publicado — o `children` da view aparece DENTRO do slot, com os
 * contextos dela (tema, i18n, sessão) intactos: o portal muda só ONDE o DOM é
 * pintado, nunca quem manda nele.
 */
export const ComPortalPublicado: Story = {
  decorators: [withSidebarSlot],
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const slot = doc.getElementById(SHELL_SIDEBAR_SLOT_ID);
    if (slot === null) throw new Error('o contêiner do slot não existe');
    // O conteúdo da view vive DENTRO do slot (o DOM foi teleportado).
    const title = within(slot).getByText('Ownership e empréstimos');
    expect(slot.contains(title)).toBe(true);
    // E a publicação segue o contrato do slot: `<section aria-labelledby>`
    // com a referência ARIA resolvida (nunca um segundo `<header>`/banner).
    const section = slot.querySelector('section');
    expect(section).not.toBeNull();
    const labelledBy = section?.getAttribute('aria-labelledby') ?? '';
    expect(labelledBy.length).toBeGreaterThan(0);
    expect(doc.getElementById(labelledBy)).not.toBeNull();
  },
};

/**
 * Sem slot — o contexto devolve `null` (SSR, primeiro render, view montada
 * fora do shell): o portal renderiza NADA e nada lança.
 */
export const SemSlot: Story = {
  render: (): ReactElement => (
    <ShellSidebarPortal>
      <Publicacao />
    </ShellSidebarPortal>
  ),
};