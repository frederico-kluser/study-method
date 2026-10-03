/**
 * src/storybook/decorators.tsx — decorators de CONTEXTO partilhados pelas
 * histórias (propriedade do catálogo; as histórias consomem, não duplicam).
 *
 * O app tem quatro "arredores" que uma árvore React precisa para renderizar
 * como em produção, e todos moram aqui para que NENHUMA história os reimite:
 *
 *   1. `withShellContexts` — `SessionStateProvider` + `ChallengeNavProvider`
 *      (o mesmo arranjo de src/App.tsx; os callbacks de navegação são ligados
 *      a `console.debug` para não lançarem em browser).
 *   2. `withSidebarSlot` — o contêiner do `ShellSidebarSlotContext` (o slot da
 *      coluna lateral). Sem ele, qualquer `<ShellSidebarPortal>` de uma view
 *      não tem para onde teleportar e o cabeçalho desaparece da história.
 *   3. `withFixedCanvas` — envelope de largura/altura fixas para componentes
 *      que precisam de dimensões de verdade (xterm, divisórias arrastáveis,
 *      overlay): medir em percentagem de um contentor vazio dá 0 e o
 *      componente renderiza vazio.
 *   4. `withResettableStores` — reset dos stores de módulo que vivem FORA do
 *      React (quizOverlayState, etc.) entre histórias, para o estado de uma
 *      história não vazar para a seguinte.
 *
 * Contrato state/view destes ficheiros: só composição de providers e helpers
 * de render — zero lógica de produto (a lógica vive nos `src/lib/*` que as
 * histórias também ilustram).
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { Decorator } from '@storybook/react';
import Box from '@mui/material/Box';
import { SessionStateProvider } from '../components/sessionState/SessionStateProvider';
import { ChallengeNavProvider } from '../components/challengeNav/ChallengeNavProvider';
import {
  SHELL_SIDEBAR_SLOT_ID,
  ShellSidebarSlotContext,
} from '../components/shell/ShellSidebarSlot';
import { __resetQuizOverlayForTests } from '../lib/quizOverlayState';
import { useSessionState, type SessionPatch } from '../lib/sessionState';

/**
 * Providers do shell (o arranjo de src/App.tsx). Envolve o Story ANTES de tudo
 * o resto para que os contextos existam onde quer que a história toque.
 */
export const withShellContexts: Decorator = (Story): ReactElement => (
  <SessionStateProvider>
    <ChallengeNavProvider
      onNavigateChallenge={() => {
        console.debug('[storybook] onNavigateChallenge');
      }}
      onNavigateLesson={() => {
        console.debug('[storybook] onNavigateLesson');
      }}
    >
      <Story />
    </ChallengeNavProvider>
  </SessionStateProvider>
);

/**
 * Slot da coluna lateral do shell. Renderiza o contêiner real
 * (`SHELL_SIDEBAR_SLOT_ID`) numa coluna à direita da história, para que o
 * `ShellSidebarPortal` de views (LessonView, etc.) tenha alvo e o conteúdo
 * publicado fique VISÍVEL na história — é assim que se documenta o que a
 * coluna mostra.
 */
export const withSidebarSlot: Decorator = (Story): ReactElement => {
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'stretch' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <ShellSidebarSlotContext.Provider value={slotEl}>
          <Story />
        </ShellSidebarSlotContext.Provider>
      </Box>
      <Box
        id={SHELL_SIDEBAR_SLOT_ID}
        ref={setSlotEl}
        aria-label="Slot da coluna lateral do shell (storybook)"
        sx={{
          width: 280,
          flexShrink: 0,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          p: 1,
          minHeight: 240,
        }}
      />
    </Box>
  );
};

/** Dimensões FIXAS para componentes que medem o próprio contentor (xterm, split). */
export function withFixedCanvas(
  width: number | string = 960,
  height: number | string = 560,
): Decorator {
  return (Story): ReactElement => (
    <Box sx={{ width, height, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Story />
    </Box>
  );
}

/**
 * Reset dos stores de módulo entre histórias. O quiz overlay vive em
 * `src/lib/quizOverlayState.ts` (useSyncExternalStore, fora do React) — sem
 * reset, a história A deixa a fase "minimizada" para a história B.
 */
export const withResettableStores: Decorator = (Story): ReactElement => {
  useEffect(() => {
    __resetQuizOverlayForTests();
    return () => {
      __resetQuizOverlayForTests();
    };
  }, []);
  return <Story />;
};

/**
 * Junta os decorators de contexto numa ordem estável: stores resetados →
 * providers do shell → slot lateral → canvas fixo (quando pedido).
 */
export function shellDecorators(options?: {
  sidebarSlot?: boolean;
  canvas?: { width?: number | string; height?: number | string } | false;
}): Decorator[] {
  const decorators: Decorator[] = [withResettableStores, withShellContexts];
  if (options?.sidebarSlot) decorators.push(withSidebarSlot);
  if (options?.canvas !== false) {
    decorators.push(
      withFixedCanvas(options?.canvas?.width ?? 960, options?.canvas?.height ?? 560),
    );
  }
  return decorators;
}

/**
 * Helper para histórias que precisam de SEMEAR o estado de sessão (o quadro da
 * coluna lateral, por exemplo). Publica o patch uma vez por montagem — é view
 * de story, sem lógica de produto (a máquina de estado é a do app,
 * `src/lib/sessionState.ts`).
 */
export function SessionSeed({
  patch,
  children,
}: {
  patch: SessionPatch;
  children?: ReactNode;
}): ReactElement {
  const { publishSession } = useSessionState();
  // O patch entra por ref: o efeito publica UMA vez por montagem (publicar em
  // loop a cada render do objeto-literal da história causaria re-render eterno
  // — `publishSession` é estável, a identidade do `patch` não).
  const patchRef = useRef(patch);
  patchRef.current = patch;
  useEffect(() => {
    publishSession(patchRef.current);
  }, [publishSession]);
  return <>{children ?? null}</>;
}