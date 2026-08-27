# Relatório da Rodada 9 — trilha expandida para especialista + UX de teoria pronta

Relatório da **nona rodada** de desenvolvimento da GUI Electron do study-method
(`app/`). A trilha `nodejs-do-zero` cresce de 8 para **18 módulos** (118 aulas)
— do zero absoluto até **especialista** — com um **desafio de MÓDULO
multi-arquivo e elaborado** no fim de cada módulo; no app, a aula em chat passa
a apresentar a **teoria de forma determinística** (direto do arquivo, sem LLM e
sem loading) e o veredito do desafio ganha **checks por teste** (lista ✓/✗ +
razão "N de M testes passaram").

---

## O que foi feito (ondas R9-1..R9-6)

| Onda | Feature | Onde vive |
|---|---|---|
| 1 | **UX: teoria pronta** — a aula em chat apresenta a TEORIA de forma DETERMINÍSTICA (markdown do `lesson.json`, seção por seção; sem LLM e sem loading); o LLM fica SÓ para dúvidas (`answer`) e para gerar novo desafio; sem chave, o `answer` falha RÁPIDO com erro estruturado `TUTOR_UNAVAILABLE` (nunca spinner infinito) | `services/tutorChat.ts` (nextSection/`next` determinístico), `LessonView` |
| 1 | **Checks por teste** — o veredito do desafio mostra a LISTA de checks individuais (✓/✗ por teste, com nome, parseado do relatório spec do `node:test`) + a razão parcial "N de M testes passaram"; aprovação não é tudo-ou-nada; confete só com `passed=true` | `services/challengeExec.ts` (`parseSpecChecks`), `TrackChallengePanel` |
| 2 | **Modelo multi-arquivo + desafio de MÓDULO** — schema ganha `files[]` (2–3 arquivos que se importam entre si, em subpastas `lib/`); CLI de autoria cria/scaffolda; UI: card **"Desafio do módulo"** na trilha, editor com **abas por arquivo**, submit envia o código de TODOS os arquivos; **regeneração oculta para target `module`** (desafio de módulo é autoral, não é regenerado por LLM) | `content/trackTypes.ts`, `tools/track-cli.ts`, `services/trackService.ts` (target `'module'`), `TrackChallengePanel`, `RoadmapView` |
| 2 | **Fix path traversal na autoria** — paths de `files[]` validados (`^[a-zA-Z0-9_\-/]+\.mjs$`, únicos, sem subir de diretório); subwave de testes: multi-arquivo com subdir aninhado, path traversal, checks nominais no parcial, regeneração oculta no módulo | `content/trackTypes.ts` (validação) |
| 3 | **Conteúdo A — 5 módulos de linguagem**: `arrays-profundas` (14), `objetos-profundos` (8), `poo` (11), `funcoes-avancadas` (8), `assincronismo-avancado` (6) — 47 aulas com teoria + desafio | `resources/tracks/nodejs-do-zero/modules/` |
| 3 | **CLI coberto por teste** — `challengePairFromSource` testável + smoke `track:validate` cobrindo multi-arquivo e módulo | `tools/track-cli.ts` |
| 4 | **Conteúdo B — 5 módulos de backend**: `nodejs-avancado` (8), `http-avancado` (6), `banco-de-dados-avancado` (5), `arquitetura-e-padroes` (8), `especialista` (8) — 35 aulas com teoria + desafio | `resources/tracks/nodejs-do-zero/modules/` |
| 5 | **Desafios de módulo dos 8 módulos ORIGINAIS** (1–8): multi-arquivo e elaborados, um por módulo (em 4 lotes: módulos 1–2, 3–4, 5–6, 7–8) | `resources/tracks/nodejs-do-zero/modules/` |
| 6 | **Integração e documentação** — relatório da rodada 9, especificação de conteúdo atualizada (18 módulos + desafios de módulo + UX) e resumo no README do app | `docs/15-trilha-nodejs.md`, este relatório, `app/README.md` |

## Decisões de produto

- **Teoria determinística no fluxo principal** — a aula nunca depende do LLM
  para ensinar: custo zero de latência/chave no caminho feliz e conteúdo
  idêntico para todo mundo. O LLM fica reservado para onde agrega: **dúvidas**
  (`answer`, ancorado no material) e **gerar novo desafio**.
- **Falha rápida sem chave** — sem chave, o `answer` devolve erro estruturado
  `TUTOR_UNAVAILABLE` em vez de spinner infinito: o aluno sabe exatamente o que
  falta e o que fazer.
- **Veredito parcial por teste** — aprovação não é tudo-ou-nada: o aluno vê a
  lista ✓/✗ de cada teste e a razão "N de M testes passaram", sabendo o que
  passou e o que falta antes da próxima tentativa. "Gerar novo desafio" aparece
  em qualquer não-aprovação total (falhou OU timeout, incluindo parcial);
  confete só com `passed=true`.
- **Desafio de módulo autoral** — no fim de cada módulo, um desafio
  MULTI-ARQUIVO (2–3 arquivos com imports entre si) e ELABORADO (statement
  longo, cenário do mundo real, 4–6 testes). Por ser autoral, a regeneração por
  LLM fica OCULTA para o target `module`.
- **Trilha até especialista** — depois do fundamento (módulos 1–8), a trilha
  leva o aluno a dominar a linguagem em profundidade (arrays, objetos, POO,
  funções, assincronismo), o Node/servidor em profundidade (Node avançado, HTTP
  avançado, banco avançado, arquitetura e padrões) e fecha com um módulo de
  excelência em produção (`especialista`).

## Validação

- `npm run track -- track:validate nodejs-do-zero` — **18 módulos, 118 aulas,
  118 desafios de aula + 18 desafios de módulo + 1 proficiência = 137 desafios**;
  **136/136 "verificado ✓"** por execução real (starter falha + solução passa +
  igualdade de contagem, incluindo os desafios multi-arquivo); proficiência ok.
- Suíte unitária + integração: **1688 testes — 1688 pass / 0 fail** (+54 vs a
  rodada 8). Cobertura nova: `parseSpecChecks` (7 testes), `next` determinístico
  e handler `answer` sem chave, multi-arquivo (subdir aninhado), path traversal
  na autoria, checks nominais no parcial, regeneração oculta no módulo, CLI
  (`challengePairFromSource`, smoke `track:validate`).
- `npm run lint` verde · `npm run build` verde · `npm run test:e2e` verde.

## Pendências

- A **regeneração de desafio de aula** continua exigindo chave DeepSeek (é LLM)
  — sem chave, devolve erro estruturado (nunca inventa desafio). Desafios de
  MÓDULO não dependem disso: são autorais e nunca regenerados.
- Gates bash da RAIZ (`tests/gate-*.sh`) continuam exigindo bash ≥ 4.3 (`local
  -n`) — não rodam no bash 3.2 do macOS (incompatibilidade pré-existente, alvo
  Linux).

## Arquivos tocados (principais)

- `app/electron/main/services/tutorChat.ts` — `next` DETERMINÍSTICO (teoria
  pronta); `answer` com falha rápida `TUTOR_UNAVAILABLE` sem chave.
- `app/electron/main/services/challengeExec.ts` — `parseSpecChecks`: checks
  individuais por teste (nome + passou) no veredito.
- `app/electron/main/services/trackService.ts` — `resolveChallengeSpec` com
  target `'module'` (desafio de módulo).
- `app/electron/main/content/trackTypes.ts` — `files[]` (multi-arquivo) +
  validação de paths (traversal) e de integridade de referências.
- `app/tools/track-cli.ts` — autoria multi-arquivo; `challengePairFromSource`
  testável; smoke `track:validate`.
- `app/src/views/ChallengeView/TrackChallengePanel.tsx` — editor com abas por
  arquivo; veredito com checklist de checks + razão N/M; "Gerar novo desafio"
  oculto para target `module`.
- `app/src/views/RoadmapView/RoadmapView.tsx` — card "Desafio do módulo" na
  trilha (pendente/concluído ✓/tentado).
- `app/src/i18n/locales/pt-BR|en/translation.json` — strings de checks
  (checksTitle/partialCount) e do desafio de módulo.
- `app/resources/tracks/nodejs-do-zero/` — 10 módulos novos (82 aulas) + 18
  desafios de módulo (10 novos + 8 dos originais).
- Docs: `docs/15-trilha-nodejs.md` (especificação de conteúdo, 18 módulos),
  este relatório, `app/README.md` (resumo da rodada 9).
