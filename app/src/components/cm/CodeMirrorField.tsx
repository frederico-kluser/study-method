/**
 * src/components/cm/CodeMirrorField.tsx — editor de código da GUI Study Method.
 *
 * ─── O DEFEITO QUE ESTE ARQUIVO DEIXOU DE TER ──────────────────────────────
 * Até a onda 1 o editor era `theme={dracula}` — Dracula escuro FIXO nos DOIS
 * esquemas do app. No tema claro isso era um retângulo preto (#282a36) dentro
 * de uma superfície de papel (#faf7f2): não é preferência, é o item 8 do escopo
 * do redesign (`docs/ux-redesign.md` §7.4). Agora o tema do editor é CONSTRUÍDO
 * por polaridade a partir de `lib/codeTheme.ts`, a mesma fonte de verdade que o
 * terminal xterm (`components/terminal/AnswerTerminal.tsx`) usa — a propriedade
 * boa que o Dracula tinha (editor ⇄ terminal coerentes) foi preservada; o que
 * saiu foi a polaridade única.
 *
 * ─── COMO A POLARIDADE CHEGA AQUI ─────────────────────────────────────────
 * Por `useColorScheme()` do MUI, NUNCA por `theme.palette.mode`: sob
 * `cssVariables` o MUI copia o palette do `defaultColorScheme` para o topo do
 * tema, então um ternário sobre `palette.mode` resolve UMA vez e nunca reage ao
 * toggle (ver a "MECÂNICA OBRIGATÓRIA DO MUI v9", item 2, em `src/theme.ts`).
 * `useColorScheme()` é estado de React de verdade: muda, re-renderiza, e o
 * `useMemo` abaixo reconstrói a extensão de tema.
 *
 * ─── DECISÃO: 14px, e o override de 16px FOI EMBORA ───────────────────────
 * O componente forçava `EditorView.theme({'.cm-content': {fontSize:'16px'}})`
 * enquanto `codeMirrorSettings()` traz 14px de `TYPE.codeSize`. Manter os dois
 * fazia o override do componente ganhar EM SILÊNCIO — o token do contrato
 * congelado ficava decorativo. Vence o token: 14px, o default de editor de
 * código, e o mesmo corpo contra o qual a paleta foi calibrada (a §"O PISO É
 * MEDIDO CONTRA A SELEÇÃO" de `codeTheme.ts` prende TODO token ao piso cheio de
 * 4,5:1 justamente porque 14px não alcança o alívio de "large scale text").
 * Cuidado de mecânica: o `createTheme` do `@uiw/codemirror-themes` aplica
 * `settings.fontSize` no seletor `&` (a raiz `.cm-editor`), não em
 * `.cm-content` — o conteúdo HERDA. Um override em `.cm-content` teria
 * especificidade maior e continuaria vencendo; por isso ele foi REMOVIDO, não
 * ajustado para 14.
 *
 * ─── E POR QUE AINDA EXISTE UM AJUSTE DE FONT-SIZE AQUI ───────────────────
 * Porque só `settings.fontSize` NÃO CHEGA À TELA. O CodeMirror expande o
 * seletor `&` para UMA classe gerada (`.ͼN`, ver `buildTheme` em
 * `@codemirror/view`) e o style-mod injeta a folha dele em
 * `head.insertBefore(style, head.firstChild)` — ou seja, ANTES do `index.css`.
 * Contra a regra global `.cm-editor { font-size: 13px }` do `index.css` isso é
 * um EMPATE de especificidade (0,0,1,0 dos dois lados) resolvido por ordem de
 * fonte: vence o `index.css`, e o editor renderiza 13px. Medido, não deduzido —
 * a asserção de 14px em `tests/e2e/e2e-code-theme.spec.ts` falhava exatamente
 * assim. O `fontSizeGuard` reancora a MESMA `settings.fontSize` (não um número
 * novo: continua havendo um único valor no sistema, `TYPE.codeSize`) num
 * seletor de especificidade 0,0,2,0 — `&.cm-editor` → `.ͼN.cm-editor` — que
 * nenhuma regra global de uma classe alcança. É guarda de CASCATA, não uma
 * segunda opinião sobre o tamanho.
 *
 * ─── O RESTO DO CONTRATO (inalterado desde a onda original) ───────────────
 *  - AUTOCOMPLETE **DESLIGADO** (`autocompletion:false` + `completionKeymap:
 *    false` via BASIC_SETUP). A GUI ensina a escrever código de memória — sem
 *    popup de IntelliSense.
 *  - **Ctrl/Cmd+S** (Mod-s) dispara `onSave` — via `Prec.high` keymap que
 *    também engole o diálogo de salvar do navegador. O `onSaveRef` mantém a
 *    lista de extensões estável entre renders.
 *  - Realce por linguagem selecionado via tabela `language.ts` (função pura) a
 *    partir da extensão do arquivo ativo.
 */
import type React from 'react';
import { useMemo, useRef } from 'react';
import ReactCodeMirror from '@uiw/react-codemirror';
import { createTheme as createCodeMirrorTheme } from '@uiw/codemirror-themes';
import { tags } from '@lezer/highlight';
import { useColorScheme } from '@mui/material/styles';
import { Prec, type Extension } from '@codemirror/state';
import { keymap, EditorView } from '@codemirror/view';
import {
  codeMirrorSettings,
  codeMirrorSyntax,
  type CodeScheme,
} from '../../lib/codeTheme';
import { extensionsForFilename } from './language';

/**
 * Overrides do basicSetup. Autocompletar + seu keymap são os ÚNICOS defaults
 * desligados; o resto (números de linha, bracket matching, history) fica.
 */
const BASIC_SETUP = { autocompletion: false, completionKeymap: false } as const;

/** Altura mínima do editor, igual ao painel circundante. */
const EDITOR_HEIGHT = '100%';

/**
 * Polaridade lida do <html> — o fallback do PRIMEIRO render.
 *
 * `useColorScheme().colorScheme` é `undefined` até o efeito de montagem do
 * provider (`useCurrentColorScheme` do `@mui/system` inicia `isClient` em
 * `false` quando há mais de um scheme suportado). Cair em `'light'` nesse frame
 * pintaria um editor claro dentro de um app escuro. O `primeColorSchemeClass()`
 * do `src/main.tsx` já grava a classe `.light`/`.dark` no <html> ANTES do
 * primeiro paint — então ela é a resposta certa, e não uma adivinhação.
 * (A mesma função existe, de propósito, em `AnswerTerminal.tsx`: os dois
 * componentes vivem em árvores diferentes e `src/lib` é compilado pelo
 * `tsconfig.node.json`, que não tem DOM — não há onde compartilhar sem criar
 * um módulo fora do escopo desta onda.)
 */
function domColorScheme(): CodeScheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Constrói a extensão de tema do CodeMirror para uma polaridade.
 *
 * A ponte papel-de-sintaxe → tag do `@lezer/highlight` é decisão DESTE módulo
 * (`codeTheme.ts` não importa CodeMirror de propósito). Cada linha agrupa as
 * tags que devem receber a mesma tinta:
 *  - `variable` é a tinta PRIMÁRIA e `operator` a SECUNDÁRIA — o token mais
 *    frequente e a pontuação densa ficam NEUTROS; código não é arco-íris;
 *  - `constant` (rosa, matiz 330) é magenta de verdade, separado de `type`
 *    (roxo `study`, matiz 272), senão bool/null e typeName colapsam numa cor só.
 */
function buildCodeMirrorTheme(scheme: CodeScheme): Extension {
  const c = codeMirrorSyntax(scheme);
  const settings = codeMirrorSettings(scheme);
  // Guarda de cascata — ver "E POR QUE AINDA EXISTE UM AJUSTE" no topo.
  // `&.cm-editor` vira `.ͼN.cm-editor` (0,0,2,0) e reancora o MESMO valor de
  // `settings.fontSize`; um `.cm-editor { font-size }` global não alcança.
  const fontSizeGuard = EditorView.theme({
    '&.cm-editor': { fontSize: settings.fontSize },
  });
  return [
    createCodeMirrorTheme({
      theme: scheme,
      settings,
      styles: [
        { tag: tags.comment, color: c.comment },
        { tag: [tags.keyword, tags.moduleKeyword, tags.controlKeyword], color: c.keyword },
        { tag: [tags.string, tags.special(tags.string)], color: c.string },
        { tag: [tags.number, tags.integer, tags.float], color: c.number },
        {
          tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
          color: c.function,
        },
        { tag: [tags.typeName, tags.className, tags.tagName], color: c.type },
        { tag: [tags.variableName, tags.propertyName, tags.attributeName], color: c.variable },
        {
          tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket],
          color: c.operator,
        },
        {
          tag: [tags.bool, tags.null, tags.atom, tags.constant(tags.variableName)],
          color: c.constant,
        },
      ],
    }),
    fontSizeGuard,
  ];
}

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
 * Renderiza um editor CodeMirror 6 controlado, com a paleta de código do tema
 * ATUAL do app (clara ou escura) e autocomplete OFF.
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

  const { colorScheme } = useColorScheme();
  const scheme: CodeScheme = (colorScheme ?? domColorScheme()) === 'dark' ? 'dark' : 'light';

  // O tema só é reconstruído quando a POLARIDADE muda — não a cada keystroke.
  const codeTheme = useMemo(() => buildCodeMirrorTheme(scheme), [scheme]);

  // Reconstruir as extensões apenas quando o arquivo/idioma ou a salvabilidade
  // mudam. `Memo` de `extensionsForFilename` evita recriação em todo keystroke.
  const langExtensions = useMemo(
    () => extensionsForFilename(filename ?? ''),
    [filename],
  );

  const extensions = useMemo<Extension[]>(() => {
    // `langExtensions` mora num useMemo próprio e é estável por filename.
    const list: Extension[] = [...langExtensions];
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
      theme={codeTheme}
      extensions={extensions}
      basicSetup={BASIC_SETUP}
      readOnly={readOnly}
      height={EDITOR_HEIGHT}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
