# Relatório da Rodada 7 — respostas digitadas, nunca-repetir e trilha (GUI Electron study-method)

Relatório da **sétima rodada** de desenvolvimento da GUI Electron do study-method
(`app/`). Foco: fechar o ciclo pedagógico do produto — **avaliar a resposta do
aluno** (matemática por execução, interpretação por LLM), **nunca repetir
desafios tentados**, mostrar **progresso por matéria** (Home + Trilha) e
**persistir tudo** no SQLite (schema v3).

---

## O que foi feito (ondas 1–5)

| Onda | Feature | Onde vive |
|---|---|---|
| 1 | **Estrelas + cronômetro no desafio**: 3 estrelas iniciais, perda por blur/timeout/erro/decaimento por velocidade (`T = 90s + difficulty*60s`, fallback 300s); confete em PASS respeitando `prefers-reduced-motion` e anúncio `role="status"`; sem "Parabéns!" ritualizado | `src/lib/challengeStars.ts`, `src/lib/confetti.ts`, `ChallengeView` |
| 1 | **Schema v2** do banco: `subjects.domain` + `challenge_attempts`, com migração versionada crash-safe | `electron/main/db/schema.ts` + `migrate.ts` |
| 2 | **Pesquisa Brave ao vivo por query** durante a geração (canal `study:research-progress`; planner LLM com fallback heurístico; rodadas cap 2; chave ausente/inválida **aborta** a geração) | `researchPlanner.ts`, `study-handlers.ts`, `shared/ipc-contract.ts` |
| 2 | **Aba Trilha**: seções Iniciante (1–2) / Intermediário (3) / Avançado (4–5), estados done/current/pending, abre lição por id | `src/views/RoadmapView/`, `src/lib/roadmap.ts`, `src/lib/levels.ts` |
| 3 | **Resposta digitada — ramo matemática**: `study:check-math-answer` **sem LLM** (o main re-computa o esperado da mathLib; esperado exibido só após a 1ª tentativa errada; 4 famílias com seed determinístico — errou, o próximo problema é outro) | `mathLib.ts`, `study-handlers.ts`, `answerFlow.ts` |
| 3 | **Resposta digitada — ramo interpretação**: `study:judge-answer` (deepseek → modelo local; veredito `correct`/`partial`/`incorrect` + feedback; `ok:false` = erro de serviço) | `answerJudge.ts`, `study-handlers.ts` |
| 3 | **Checklist de pesquisa ao vivo na UI** (deltas por rodada, término garantido, retrocompat) | `src/lib/researchProgress.ts`, `ResearchChecklist.tsx` |
| 4 | **Persistência + nunca-repetir**: matérias/lições/tentativas no SQLite (schema **v3** com `exercise_json`); `study:mark-challenge-attempt` (verdict/stars/duração); `list-challenges` filtra desafios tentados (programação por slug; math por slug sintético `math:<subjectSlug>:<family>:<seed>`) | `electron/main/db/repo.ts`, `study-handlers.ts`, `lessonOrchestrator.ts` |
| 4 | **Home por domínio**: seções Matemática/Programação com matérias escolhidas + diálogo de aviso ao trocar de matéria com aula em andamento | `src/views/placeholders.tsx` (HomeView), `src/lib/homeSetup.ts`, `src/lib/pendingSubject.ts` |
| 5 | **Aula por id + sessão global**: `study:get-lesson-by-id` com `subjectSlug`/`challenge` (reabertura da Trilha); `publishSession` (LessonView publica a sessão ativa no shell/Home); guarda de identidade de geração (token por processo) | `study-handlers.ts`, `src/lib/sessionState.ts`, `src/lib/lessonGenerationGuard.ts`, `LessonView` |

## Decisões de produto (documentadas)

- **Esperado nunca de cabeça**: o valor esperado de matemática é sempre
  **computado pela execução da mathLib** no main (re-computado a cada
  `check-math-answer`); o LLM nunca inventa números — contrato completo em
  `docs/14-respostas-nunca-repetir.md`.
- **Trocar de desafio sem concluir = `abandoned`** (o desafio some da lista —
  design); o **mark é otimista** (registrado na UI antes do invoke) — falha
  transitória de IPC pode perder um registro na sessão (desafio reaparece 1×),
  limitação aceita e documentada.
- **Avanço por veredito terminal**: `correct` marca a aula concluída; `partial`/
  `incorrect` deixam veredito + feedback visíveis com o escape "Avançar mesmo
  assim"; o avanço é sempre do botão primário.
- **Sem gamificação extra**: as estrelas existem como requisito do dono, dentro
  do contrato de a11y do `docs/ux-redesign.md` §8 (confete < 5 s, sem strobe,
  reduz-movimento desliga animação, anúncio em `role="status"`, som opt-in).

## Validação

- Suíte unitária + integração: **1563 testes — 1562 pass / 0 fail / 1 skipped**
  (medido em `bash tools/t.sh tests`; ver `app/README.md` → gates).
- Cobertura nova das ondas: `challengeStars.test.ts`, `confetti.test.ts`,
  `researchProgress.test.ts`, `mathLib.test.ts`, `answerJudge.test.ts`,
  `answerFlow.test.ts`, `roadmap.test.ts`, `levels.test.ts`, `homeSetup.test.ts`,
  `pendingSubject.test.ts`, `lessonGenerationGuard.test.ts`, `sessionState.test.ts`,
  migração v1→v3 crash-safe (Caminhos A/B) e persistência em arquivo.
- `npm run lint` verde · `npm run build` verde · `npm run test:e2e` verde —
  **19 testes mock (13 specs) verdes**, 3 specs reais (`real-*`) `skipped` sem
  as chaves (rodam via `npm run test:e2e:real` com as chaves do usuário).

## Pendências

- **Geração real de aula é cauda pesada/flaky** (herdada): 3–6 min por aula
  real; pode falhar transitoriamente no DeepSeek — a geração é repetida 1× nos
  specs reais.
- **Persistência de seleção do Desafio** entre sessões continua fora (exigiria
  estender `AppSettings` do contrato congelado).
- Falha de persistência na geração não derruba a aula, mas a lição fica sem ids
  (não aparece na Trilha) — degradação aceita, documentada no orquestrador.

## Arquivos tocados (principais)

- `app/shared/ipc-contract.ts` — canais/DTOS novos (research-progress,
  check-math-answer, judge-answer, mark-challenge-attempt, get-lesson-by-id,
  generate-lesson com payload objeto).
- `app/electron/main/services/` — `mathLib.ts` (nova), `answerJudge.ts` (nova),
  `researchPlanner.ts`, `lessonOrchestrator.ts` (caminho math + persistência).
- `app/electron/main/db/` — `schema.ts` (v3), `migrate.ts`, `repo.ts`.
- `app/electron/main/ipc/study-handlers.ts` — handlers novos + nunca-repetir.
- `app/src/lib/` — `challengeStars.ts`, `confetti.ts`, `answerFlow.ts`,
  `researchProgress.ts`, `roadmap.ts`, `levels.ts`, `homeSetup.ts`,
  `pendingSubject.ts`, `sessionState.ts`, `lessonGenerationGuard.ts`.
- `app/src/views/` — `LessonView/` (resposta + checklist), `ChallengeView/`
  (estrelas/cronômetro/mark), `RoadmapView/` (nova), Home (domínios + diálogo).
- Docs: `docs/app-gui.md`, `docs/ux-redesign.md`,
  `docs/14-respostas-nunca-repetir.md` (novo), `app/README.md`.

Detalhes técnicos em [`app/README.md`](../app/README.md), contrato de resposta e
nunca-repetir em [`docs/14-respostas-nunca-repetir.md`](14-respostas-nunca-repetir.md)
e manual/arquitetura em [`docs/app-gui.md`](app-gui.md).
