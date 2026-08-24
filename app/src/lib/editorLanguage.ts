/**
 * src/lib/editorLanguage.ts — mapa puro extensão de linguagem → CodeMirror.
 *
 * Vive em `src/lib` (alvo também do tsconfig.node.json) para que a API e o realce
 * sejam testáveis no gate `node:test` sem jsdom (o tsconfig.node é composite e
 * exige que toda importação esteja no include). O wrapper `src/components/cm/
 * language.ts` reexporta estes símbolos para a UI (componente do renderer).
 *
 * SEM dependência nova: usa apenas os pacotes de linguagem já presentes
 * (@codemirror/lang-*). Idiomas sem parser dedicado (go, rust, c, shell,
 * text…) caem num fallback documentado — `javascript` básico sem TS/JSX —
 * porque compartilham a sintaxe de chaves/identificadores, o que ainda dá
 * realce útil sob o tema Dracula sem adicionar pacote.
 */
import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
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
  json: { label: 'JSON', extensions: [json()] },
  md: { label: 'Markdown', extensions: [markdown()] },
  markdown: { label: 'Markdown', extensions: [markdown()] },
  // Fallback genérico (JS básico) para idiomas sem parser dedicado:
  go: { label: 'Go', extensions: JS_ONLY, fallback: true },
  rs: { label: 'Rust', extensions: JS_ONLY, fallback: true },
  rust: { label: 'Rust', extensions: JS_ONLY, fallback: true },
  c: { label: 'C', extensions: JS_ONLY, fallback: true },
  h: { label: 'C', extensions: JS_ONLY, fallback: true },
  cpp: { label: 'C++', extensions: JS_ONLY, fallback: true },
  hpp: { label: 'C++', extensions: JS_ONLY, fallback: true },
  cc: { label: 'C++', extensions: JS_ONLY, fallback: true },
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