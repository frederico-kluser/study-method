/**
 * src/lib/editorLanguage.ts — mapa puro extensão de linguagem → CodeMirror.
 *
 * Vive em `src/lib` (alvo também do tsconfig.node.json) para que a API e o realce
 * sejam testáveis no gate `node:test` sem jsdom (o tsconfig.node é composite e
 * exige que toda importação esteja no include). O wrapper `src/components/cm/
 * language.ts` reexporta estes símbolos para a UI (componente do renderer).
 *
 * Uma dependência nova, declarada: `@codemirror/lang-rust` entrou como
 * dependência nova na onda 2.2 (onda2-editor-rust) e é usada aqui, junto dos
 * pacotes de linguagem que JÁ estavam na base (@codemirror/lang-javascript,
 * lang-python, lang-json, lang-markdown). ONDA-CODIGO-EDITOR:
 * `@codemirror/lang-cpp` entrou como dependência nova (a trilha `c-iniciante`
 * edita ficheiros `.c`/`.h` e eles caíam no fallback — pedido do dono "nosso
 * editor que deve ser highlight de codigos"): a gramática Lezer dele cobre C e
 * C++ e é a MESMA que o `codeHighlight.ts` usa para pintar os blocos do chat —
 * editor e display falam a mesma língua. Idiomas sem parser dedicado (go,
 * shell, text…) continuam num fallback documentado — `javascript` básico sem
 * TS/JSX — porque compartilham a sintaxe de chaves/identificadores, o que
 * ainda dá realce útil sob o tema Dracula sem adicionar pacote.
 */
import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

/** Identificador normalizado de extensão de arquivo (sem o ponto, lowercase). */
export type FileExt = string;

/** Langue de realce que o editor expõe, com label pt-BR de exibição. */
export interface EditorLanguageInfo {
  /** Nome de exibição amigável. */
  label: string;
  /** Extensão(ões) CodeMirror para realce de sintaxe. */
  extensions: readonly Extension[];
  /** True quando caiu no fallback genérico (sem parser dedicado). */
  fallback?: boolean;
}

const NONE: readonly Extension[] = [];

const JS_ONLY: readonly Extension[] = [javascript()];
const TSX: readonly Extension[] = [javascript({ typescript: true, jsx: true })];
const RUST: readonly Extension[] = [rust()];

/**
 * Tabela ext → linguagem. Normalizamos a ext (sem `.`, lowercase). Extensões
 * ausentes caem no fallback JS básico (documentado acima).
 */
const LANGUAGE_BY_EXT: Readonly<Record<string, EditorLanguageInfo>> = {
  js: { label: 'JavaScript', extensions: JS_ONLY },
  mjs: { label: 'JavaScript', extensions: JS_ONLY },
  cjs: { label: 'JavaScript', extensions: JS_ONLY },
  jsx: { label: 'JavaScript (JSX)', extensions: JS_ONLY },
  ts: { label: 'TypeScript', extensions: TSX },
  tsx: { label: 'TypeScript (TSX)', extensions: TSX },
  py: { label: 'Python', extensions: [python()] },
  rust: { label: 'Rust', extensions: RUST },
  rs: { label: 'Rust', extensions: RUST },
  json: { label: 'JSON', extensions: [json()] },
  md: { label: 'Markdown', extensions: [markdown()] },
  markdown: { label: 'Markdown', extensions: [markdown()] },
  // ONDA-CODIGO-EDITOR: C/C++ com gramática DEDICADA (a mesma do display).
  c: { label: 'C', extensions: [cpp()] },
  h: { label: 'C', extensions: [cpp()] },
  cpp: { label: 'C++', extensions: [cpp()] },
  hpp: { label: 'C++', extensions: [cpp()] },
  cc: { label: 'C++', extensions: [cpp()] },
  cxx: { label: 'C++', extensions: [cpp()] },
  hxx: { label: 'C++', extensions: [cpp()] },
  'c++': { label: 'C++', extensions: [cpp()] },
  // Fallback genérico (JS básico) para idiomas sem parser dedicado:
  go: { label: 'Go', extensions: JS_ONLY, fallback: true },
  sh: { label: 'Shell', extensions: JS_ONLY, fallback: true },
  bash: { label: 'Shell', extensions: JS_ONLY, fallback: true },
  zsh: { label: 'Shell', extensions: JS_ONLY, fallback: true },
  txt: { label: 'Texto', extensions: NONE, fallback: true },
  text: { label: 'Texto', extensions: NONE, fallback: true },
  log: { label: 'Log', extensions: NONE, fallback: true },
};

/** Fallback default quando a extensão é desconhecida. */
const FALLBACK_INFO: EditorLanguageInfo = {
  label: 'Texto puro',
  extensions: NONE,
  fallback: true,
};

/** Remove pontos/flags e normalize para lowercase. */
export function normalizeExt(ext: string): string {
  return ext
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
}

/**
 * Devolve a info de linguagem para uma extensão de arquivo. Extensões fora da
 * tabela (ex.: `readme`, `env`, sem extensão) caem no fallback de texto puro.
 */
export function languageForExt(ext: string): EditorLanguageInfo {
  const key = normalizeExt(ext);
  return LANGUAGE_BY_EXT[key] ?? FALLBACK_INFO;
}

/**
 * Devolve as extensões CodeMirror para um caminho/arquivo. O `ext` é extraído
 * da base do nome após o último ponto (ex.: "foo.ts" → "ts"). Base sem ponto
 * (ex.: "Dockerfile", ".gitignore") reverte para texto puro.
 */
export function extensionsForFilename(filename: string): readonly Extension[] {
  const base = filename.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && dot < base.length - 1 ? base.slice(dot + 1) : '';
  return languageForExt(ext).extensions;
}

/**
 * Família de ÍCONE por ficheiro — vocabulário decorativo da UI (abas do
 * EditorPane, árvore do FileExplorer). É dado PURO: quem escolhe o componente
 * de ícone é a view; aqui só se decide a família, testável sem DOM.
 */
export type EditorIconKind = 'code' | 'data' | 'doc' | 'file';

const ICON_KIND_BY_EXT: Readonly<Record<string, EditorIconKind>> = {
  js: 'code',
  mjs: 'code',
  cjs: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  rust: 'code',
  rs: 'code',
  c: 'code',
  h: 'code',
  cpp: 'code',
  hpp: 'code',
  cc: 'code',
  cxx: 'code',
  hxx: 'code',
  'c++': 'code',
  go: 'code',
  sh: 'code',
  bash: 'code',
  zsh: 'code',
  json: 'data',
  md: 'doc',
  markdown: 'doc',
  txt: 'file',
  text: 'file',
  log: 'file',
};

/**
 * Família de ícone para um caminho/arquivo (mesma extração de extensão de
 * {@link extensionsForFilename}); desconhecidos caem em `file`.
 */
export function iconKindForFilename(filename: string): EditorIconKind {
  const base = filename.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && dot < base.length - 1 ? normalizeExt(base.slice(dot + 1)) : '';
  return ICON_KIND_BY_EXT[ext] ?? 'file';
}