# Notas de arquitetura do study-method (para as propostas Games)

Factos verificados no código em 2026-10-03, para mapear as propostas de games
à arquitetura existente. Fonte: app/electron/main/engine/**, docs/TUTORIAL.md,
app/content-src/BARRA-DE-AUTORIA.md.

## Costura multi-linguagem (o encaixe dos games)
- `engine/lang/registry.ts` — registro de adaptadores de linguagem; separa
  `LanguageId` (linguagem: javascript, python, c, rust, typescript) de
  `ChallengeLanguageToken` (o que `challenge.language` aceita no disco,
  inclui alias de runtime `nodejs` — compatibilidade é requisito).
- 5 adaptadores: `lang/{c,javascript,python,rust,typescript}.ts` (parse,
  resolveScopes, inventory — assíncronos deliberadamente NÃO; falha fechada
  na resolução: id desconhecido lança LanguageRegistryError).
- Norma: `docs/research/08-multilingua-trava-deterministica.md` §6 (15
  responsabilidades por linguagem) e §7.

## Validação por teste (o loop de vitória reutilizável)
- `engine/exec/{adapter,harness,proofs}.ts` — execução e provas dos desafios.
- Desafio = enunciado + `requirements[]` em bijeção 1:1 com testes +
  `expectedTestCount` + `language` (schema Zod em `engine/schemas/artifactsDrafts.ts`).
- As 4 provas de execução por desafio (BARRA-DE-AUTORIA §12): solução de
  referência PASSA · starter FALHA · `expectedTestCount` == executado ·
  stub vazio FALHA; o teste FORÇA a construção-alvo (J5).
- Runner por linguagem vem do adaptador (registro), não de um runner único
  nodejs (lição já aprendida: challenge.language não propagado = aluno de
  Python executado como JS).

## Conteúdo
- Trilhas em `app/resources/tracks/<trilha>/modules/<módulo>/lessons/<aula>/lesson.json`
  (330 aulas no disco; 112 trilhas citadas no registry), autoradas por
  `tools/track-cli.ts` (`npm run track`), com gate de qualidade
  (`engine/research/qualityGate.ts` — inclui FONTE_TITULO_PADRAO_IA).
- Progresso do aluno: `completedAt` por aula, proficiência, desafios gerados
  (`challengeGenerateStore`), prova de domínio (mastery dispensa aulas).

## UI / navegação
- Shell: rail só-ícone 80px (desde a onda UX), sidebar com poço de estado
  (`role="status"`), painéis por `useState` (sem router) — painel novo = novo
  PanelKey em `lib/shellNav.ts` + view; e2e resolve por `getByRole('tab')`.
- Aula = chat com tutor (seções progressivas, quizzes com recuperação),
  desafio = editor CodeMirror + terminal de resposta + "Testar resposta".
- Testes: unit `node --test` (7159), e2e Playwright+Electron (`tests/e2e/*.spec.ts`).
