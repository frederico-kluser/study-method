/**
 * src/components/cm/CodeMirrorField.tsx — editor de código da GUI Study Method.
 *
 * Adaptado do atom `CodeMirrorField` do leet-code-rpg. Requisitos desta onda:
 *
 *  - AUTOCON **DESLIGADO** (`autocompletion:false` + `completionKeymap:false`
 *    via BASIC_SETUP). A GUI ensina a escrever código de memória — sem popup de
 *    IntelliSense.
 *  - Tema **Dracula** (`@uiw/codemirror-theme-dracula`), fonte monospace 16px
 *    explícita no conteúdo (CodeMirror renderiza a canvas e não herda rem). As
 *    cores canónicas do tema (#282a36 / #f8f8f2) são as MESMAS usadas no
 *    terminal xterm via `lib/draculaTheme` (coerência editor ⇄ terminal).
 *  - **Ctrl/Cmd+S** (Mod-s) dispara `onSave` — via `Prec.high` keymap que
 *    também engole o diálogo de salvar do navegador. O `onSaveRef` mantém a
 *    lista de extensões estável entre renders.
 *  - Realce por linguagem selecionado via tabela `language.ts` (função pura)
 *    a partir da extensão do arquivo ativo.
 */
import type React from 'react';
import { useMemo, useRef } from 'react';
import ReactCodeMirror from '@uiw/react-codemirror';
import { dracula } from '@uiw/codemirror-theme-dracula';
import { Prec, type Extension } from '@codemirror/state';
import { keymap, EditorView } from '@codemirror/view';
import { extensionsForFilename } from './language';

/**
 * Overrides do basicSetup. Autocompletar + seu keymap são os ÚNICOS defaults
 * desligados; o resto (números de linha, bracket matching, history) fica.
 */
const BASIC_SETUP = { autocompletion: false, completionKeymap: false } as const;

/** Tamanho de fonte do editor em px (não herda rem — é canvas). */
const EDITOR_FONT_SIZE_PX = 16;

/** Altura mínima do editor, igual ao painel circundante. */
const EDITOR_HEIGHT = '100%';

/** Props de {@link CodeMirrorField}. */
export interface CodeMirrorFieldProps {
  /** Texto-fonte atual (controlado). */
  value: string;
  /** Chamado com o novo texto a cada mudança de documento. */
  onChange: (value: string) => void;
  /** Nome do arquivo ativo — usado para escolher o realce por extensão. */
  filename?: string;
  /** Rótulo acessível. */
  ariaLabel?: string;
  /** Classes de layout aplicadas ao wrapper do editor. */
  className?: string;
  /** Quando true o conteúdo é somente-leitura. */
  readOnly?: boolean;
  /**
   * Invocado em Ctrl/Cmd+S dentro do editor (keymap de alta precedência que
   * também engole o diálogo de salvar). Omita editores sem conceito de salvar.
   */
  onSave?: () => void;
}

/**
 * Renderiza um editor CodeMirror 6 controlado (tema Dracula, autocomplete OFF).
 *
 * @param props - {@link CodeMirrorFieldProps}.
 * @returns O elemento do editor.
 */
export function CodeMirrorField({
  value,
  onChange,
  filename,
  ariaLabel,
  className,
  readOnly,
  onSave,
}: CodeMirrorFieldProps): React.JSX.Element {
  // Último onSave legível do keymap (estável); a lista de extensões não pode
  // ser reconstruída a cada render do parent.
  const onSaveRef = useRef<(() => void) | undefined>(onSave);
  onSaveRef.current = onSave;

  const hasSave = onSave !== undefined;

  // Reconstruir as extensões apenas quando o arquivo/idioma ou a salvabilidade
  // mudam. `Memo` de `extensionsForFilename` evita recriação em todo keystroke.
  const langExtensions = useMemo(
    () => extensionsForFilename(filename ?? ''),
    [filename],
  );

  const extensions = useMemo<Extension[]>(() => {
    // `langExtensions` mora num useMemo próprio e é estável por filename.
    const list: Extension[] = [
      ...langExtensions,
      EditorView.theme({ '.cm-content': { fontSize: `${EDITOR_FONT_SIZE_PX}px` } }),
    ];
    if (hasSave) {
      list.push(
        Prec.high(
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                onSaveRef.current?.();
                return true;
              },
            },
          ]),
        ),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langExtensions, hasSave]);

  return (
    <ReactCodeMirror
      value={value}
      onChange={onChange}
      theme={dracula}
      extensions={extensions}
      basicSetup={BASIC_SETUP}
      readOnly={readOnly}
      height={EDITOR_HEIGHT}
      className={className}
      aria-label={ariaLabel}
    />
  );
}