/**
 * src/components/shell/SessionFrame.stories.helpers.tsx — apoio das histórias
 * da SessionFrame (NÃO é história: o glob do catálogo só apanha
 * `*.stories.tsx`; NADA daqui é importado pelo app).
 *
 * `SessionFrameDemo` reproduz a FIAÇÃO real do slot (App.tsx, onda1-sidebar-
 * slot): o nó do contêiner-slot sobe por callback ref (`slotRef`), vira o
 * valor do `ShellSidebarSlotContext` e a "view ativa" publica nele por
 * `<ShellSidebarPortal>` — que é exatamente como a LessonView mostra o
 * cabeçalho da aula na coluna. A coluna fica na linha de split do shell (flex
 * row à altura do canvas), com a largura que a divisória manda (`basisPx`).
 */
import { useState, type ReactElement, type ReactNode } from 'react';
import Box from '@mui/material/Box';

import SessionFrame from './SessionFrame';
import { ShellSidebarPortal, ShellSidebarSlotContext } from './ShellSidebarSlot';

export interface SessionFrameDemoProps {
  /** Largura da coluna (flex-basis) em px — já clampada pela divisória. */
  basisPx?: number;
  /** Anima o flex-basis (passo de TECLADO; `false` durante o arraste). */
  animateBasis?: boolean;
  /** O que a view ativa publica no slot; `undefined` = slot vazio. */
  slotContent?: ReactNode;
}

/** A coluna lateral do shell, com o slot ligado como no App. */
export function SessionFrameDemo({
  basisPx = 240,
  animateBasis = true,
  slotContent,
}: SessionFrameDemoProps): ReactElement {
  // MESMO padrão do App.tsx: o nó sobe por callback ref num ESTADO (o
  // Provider precisa re-renderizar quando o slot nasce); `null` no primeiro
  // render e no SSR — o portal então não publica nada.
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        minWidth: 0,
      }}
    >
      <ShellSidebarSlotContext.Provider value={slotEl}>
        <SessionFrame basisPx={basisPx} animateBasis={animateBasis} slotRef={setSlotEl} />
        {slotContent === undefined ? null : <ShellSidebarPortal>{slotContent}</ShellSidebarPortal>}
      </ShellSidebarSlotContext.Provider>
    </Box>
  );
}