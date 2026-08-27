# Relatório da Rodada 8 — trilhas com aulas pré-definidas, chat com tutor e CLI de autoria

Relatório da **oitava rodada** de desenvolvimento da GUI Electron do study-method
(`app/`). Pivô de produto: **o aluno NÃO GERA mais aula**. As trilhas (cursos
inteiros) são criadas pelos AUTORES da ferramenta via **CLI** e chegam prontas —
o aluno abre a trilha, escolhe a aula e estuda num **chat direto com a IA**.

---

## O que foi feito (ondas R8-1..R8-6)

| Onda | Feature | Onde vive |
|---|---|---|
| 1 | **Modelo de conteúdo + loader**: trilhas/módulos/aulas/desafios em JSON versionado (schemaVersion 1), validação de schema + integridade de referências | `electron/main/content/trackTypes.ts`, `trackLoader.ts` |
| 1 | **CLI de autoria (admin)**: `npm run track -- track:new/module:new/lesson:new/challenge:new/proficiency:new/challenge:verify/validate/list` — o scaffold nasce válido e `track:validate` verifica TODOS os desafios **por execução** (solução passa + starter falha + igualdade de contagem) | `app/tools/track-cli.ts` |
| 2 | **Runner único de desafios nodejs**: `node --test` em dir temporário, gate de IGUALDADE (exit 0 sozinho mente), parse de contagens imune a ANSI, binário do node correto DENTRO do Electron | `electron/main/services/challengeExec.ts` |
| 3 | **Aula em modo CHAT**: o tutor apresenta a base teórica uma SEÇÃO por vez (linguagem simples), responde dúvidas ancorado no material, recomenda aulas anteriores da trilha (pré-requisitos); fallback verbatim quando a LLM falha (conteúdo nunca trava); **FONTES atrás do botão** (nunca no fluxo) | `services/tutorChat.ts`, `src/views/LessonView/` (reescrita), `src/lib/trackLessonState.ts` |
| 4 | **Trilha com itens prontos**: Home mostra as trilhas; a aba Trilha abre módulos/aulas pré-carregados com estados done/current/pending e **travamento sequencial**; clicar numa aula abre o chat | `src/views/RoadmapView/` (reescrita), `src/views/placeholders.tsx`, `services/trackService.ts` |
| 4 | **Teste de proficiência**: desafio que cobre TODOS os módulos (proficiency.json); **só começa depois de ler o enunciado e clicar em "Começar"** — o cronômetro NÃO roda antes; passar destrava a trilha inteira | `TrackChallengePanel` (target proficiency), `trackService.resolveChallengeSpec` |
| 5 | **Desafio com cronômetro/estrelas do fluxo track**: botão "Começar" inicia o contador; **carência da 1ª estrela** (`minFirstStarMs` — a demora não tira estrela antes do tempo mínimo; perdas explícitas continuam imediatas) | `src/lib/challengeStars.ts` (carência), `ChallengeView/TrackChallengePanel.tsx` |
| 5 | **Nunca-repetir na regeneração**: ao ERRAR, o erro aparece + botão **"Gerar novo desafio"** — a LLM recebe TODOS os desafios que o aluno errou naquela aula e não repete; o novo desafio é validado por execução ANTES de chegar (2 tentativas, nunca desafio ruim) | `services/challengeRegenerator.ts`, `ipc/track-handlers.ts`, schema v4 `generated_challenges` |
| 6 | **Schema v4**: `track_progress` (lições concluídas), `track_proficiency` (veredito), `generated_challenges` (regenerados) — migração crash-safe | `db/schema.ts`, `db/repo.ts` |
| 6 | **Trilha completa "Node.js do Zero"**: 8 módulos, 36 aulas, 36 desafios + proficiência — **todos verificados por execução** (`track:validate` 36/36 ✓) | `app/resources/tracks/nodejs-do-zero/` |

## Pesquisa profunda (deep-research, 106 agentes)

A estrutura do curso veio de um relatório verificado adversariamente (7 findings
de alta confiança; Odin Project, Full Stack Open, Gray et al. ICER'07, Chen ACM
TOCE 2025, Jung et al. 2025, Nebraska/PSIv1, efeito de pressão de tempo d=0,35):

- **JS antes de Node** mesmo num curso "do absoluto zero" com objetivo backend;
- **pre-training → worked example → fading → prática**: cada aula entrega a base
  teórica primeiro, depois um exemplo COMPLETO com sub-objetivos rotulados e
  auto-explicação, e só então o desafio;
- **proficiência sem pressupor programação** (modelo Nebraska): enunciados em
  linguagem simples cobrindo o núcleo de todos os módulos;
- **tempo generoso**: a 1ª estrela tem carência de 120s na proficiência (60s nas
  aulas) porque pressão de tempo degrada a acurácia.

Relatório completo no resultado do workflow; especificação de conteúdo em
`docs/15-trilha-nodejs.md`.

## Contrato IPC (aditivo ao congelado)

Grupo novo `TRACK_CHANNELS` (→ `window.api.track.*`): `list`, `get`, `lesson`,
`lesson-done`, `tutor-chat`, `challenge`, `challenge-submit`,
`challenge-regenerate`, `proficiency`, `proficiency-submit`. Aditivo a
`study:mark-challenge-attempt`: `lessonId` opcional (nunca-repetir por aula).

## Validação

- Suíte unitária + integração: **1634 testes — 1633 pass / 0 fail / 1 skipped**
  (+71 vs a rodada 7). Cobertura nova: trackTypes/trackLoader, trackService,
  trackServices (runner/tutor/regenerador), track-handlers, trackLessonState,
  carência de estrelas, ANSI no parse.
- `npm run lint` verde · `npm run build` verde · `npm run test:e2e` verde —
  **19 testes mock verdes** (specs de trilha/chat/editor reescritas para o fluxo
  novo), 3 specs reais `skipped` sem as chaves.
- `npm run track -- track:validate nodejs-do-zero` — **8 módulos, 36 aulas, 36
  desafios + proficiência: 36/36 "verificado ✓"** por execução real.

## Pendências

- **Regeneração de desafio exige chave DeepSeek** (é LLM) — sem chave, o botão
  "Gerar novo desafio" devolve erro estruturado (nunca inventa desafio).
- O **tutorial de onboarding** ganhou o capítulo Aula simplificado (steps de
  geração removidos); o hint pós-tutorial aponta o input do chat.
- Gates bash da RAIZ (`tests/gate-*.sh`) exigem bash ≥ 4.3 (`local -n`) — não
  rodam no bash 3.2 do macOS (incompatibilidade pré-existente, alvo Linux).

## Arquivos tocados (principais)

- `app/shared/ipc-contract.ts` — TRACK_CHANNELS + DTOs (aditivo).
- `app/electron/main/content/` — trackTypes.ts, trackLoader.ts (NOVOS).
- `app/electron/main/services/` — trackService.ts, tutorChat.ts,
  challengeExec.ts, challengeRegenerator.ts (NOVOS); e2eStubs.ts (fixture track).
- `app/electron/main/ipc/track-handlers.ts` (NOVO); study-handlers.ts (lessonId).
- `app/electron/main/db/` — schema.ts (v4), repo.ts (métodos de trilha).
- `app/tools/track-cli.ts` (NOVO) — `npm run track`.
- `app/src/views/` — LessonView (chat), RoadmapView (trilha),
  ChallengeView/TrackChallengePanel (NOVO), placeholders (trilhas na Home).
- `app/src/lib/` — trackLessonState.ts (NOVO), challengeStars.ts (carência),
  challengeNav.ts (trackChallenge), pendingSubject.ts (pendentes de trilha).
- `app/resources/tracks/nodejs-do-zero/` — a trilha completa (36 aulas + proficiência).
- Docs: `docs/15-trilha-nodejs.md` (especificação de conteúdo), este relatório.
