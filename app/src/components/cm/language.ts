/**
 * src/components/cm/language.ts — API de realce por linguagem do editor.
 *
 * Reexporta o mapa puro (que vive em src/lib/editorLanguage.ts, testável no
 * gate node:test). A UI importa daqui para manter o caminho previsto; a lógica
 * tem uma única fonte de verdade em `src/lib`.
 */
export {
  normalizeExt,
  languageForExt,
  extensionsForFilename,
  type FileExt,
  type EditorLanguageInfo,
} from '../../lib/editorLanguage';