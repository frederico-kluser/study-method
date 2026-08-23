# LEARNINGS — project-router (study-method)

Aprendizados acumulados das ondas de trabalho neste repo.

## Onda 4 — editor/desafio
- **tsconfig.node.json é `composite: true`** e inclui `src/lib`: todo módulo puro
  importado por testes em `tests/` deve viver em `src/lib` (ou o tsc com
  `--noEmit composite` reclama que o arquivo não está no file-list do projeto).
  Por isso `language.ts` (realce do editor) tem a lógica em
  `src/lib/editorLanguage.ts` e `src/components/cm/language.ts` reexporta.
- **Contexto React com JSX não pode ficar em `src/lib`** (o tsconfig.node não
  define `jsx`). O provider com JSX (`ChallengeNavProvider`) vive em
  `src/components/challengeNav/`, e o contexto+reducer puro em
  `src/lib/challengeNav.ts`.
- **api-schema.ts**: os métodos `study.*` e `pi.abort` da `ApiSchema` ainda
  estão tipados SEM parâmetros (placeholders da onda); o runtime já espera o
  payload `{workspaceDir,...}`/`{challengeDir}`. Padrão aceito: cast local ao
  consumir (ex.: `getApi().study.readWorkspaceFile as (a: ReadArgs) => ...`) —
  mesmo padrão já usado na LessonView.