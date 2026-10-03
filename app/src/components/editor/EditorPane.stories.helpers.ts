/**
 * EditorPane.stories.helpers.ts — apoio das histórias do EditorPane (sem JSX:
 * o ficheiro NÃO casa o glob `*.stories.ts(x)` — STORY-SPEC §1).
 *
 * O EditorPane é CONTAINER: o disco entra por `getApi()` e as operações saem
 * por um handle imperativo (`openFile`/`createFile`/`deleteFile`/`save`) — é
 * assim que a ChallengeView (via FileExplorer) o usa. Para o catálogo mostrar
 * "com ficheiro aberto" sem inventar props que o produto não tem, esta casca
 * monta o painel e abre um path no arranque pelo MESMO handle do app. O disco
 * é o `installMockApi` do Storybook (o mesmo `study.*` que o preview instala).
 */
import { createElement, useEffect, useRef, type ReactElement } from 'react';
import { EditorPane, type EditorPaneHandle, type EditorPaneProps } from './EditorPane';

export interface EditorPaneDemoProps extends EditorPaneProps {
  /** Path a abrir no arranque (simula o clique do FileExplorer). */
  openOnMount?: string;
}

/** Painel do editor com um ficheiro aberto via handle, como o app faz. */
export function EditorPaneDemo({
  openOnMount,
  ...paneProps
}: EditorPaneDemoProps): ReactElement {
  const ref = useRef<EditorPaneHandle | null>(null);
  useEffect(() => {
    if (openOnMount) ref.current?.openFile(openOnMount);
  }, [openOnMount]);
  return createElement(EditorPane, { ...paneProps, ref });
}
