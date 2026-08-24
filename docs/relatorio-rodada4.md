# Relatório da Rodada 4 — execução orquestrada (GUI Electron study-method)

Relatório da **quarta rodada** de desenvolvimento da GUI Electron do study-method (`app/`),
conduzida em ondas paralelas com revisão adversarial, integração por squash e gates verdes.
Foco: documentar **como** a rodada foi executada — ondas, squashs, commits, gates, revisões,
números, segurança, limitações e sugestões para a rodada 5.

O conteúdo técnico detalhado de cada entrega vive em [`docs/rodada4.md`](rodada4.md) e no
`app/README.md`.

---

## Como a execução rodou (onda a onda)

A rodada 4 saiu de `cd1fdfb` (fim da rodada 3 / `COMMIT-FINAL` da GUI, 3 rodadas) e terminou em
`4c686e0` (HEAD atual). Foram **13 squash commits**, organizados em 4 ondas — cada uma com
**construção + revisão adversarial**, e os achados da revisão fechados num `fixNx-review` no
fim da própria onda (subwaves de teste/validação rodando junto da onda seguinte).

| Onda | Squashs (hash curto) | O que entregou | Gate na onda |
|---|---|---|---|
| **W15** | `3a087a7` (fix15-deepseek-parse) · `73f749f` (fix15-list-challenges) → `838c307` (fix15c-review) | Bugs B2 e B1 da rodada 3 + 4 achados da revisão | tests verdes · lint ok |
| **W16** | `7459808` (onda16-tutorial) → `699737d` (fix16d-review) | Onboarding refeito fiel ao ondokai + 5 achados da revisão + E2E de dead-lock | tests verdes · lint ok |
| **W17** | `3a106e2` (onda17a-ux) · `27d8d1a` (onda17b-math) → `b13dda0` (fix17c-review) | Dark refinado + Home guiada (17a); KaTeX (17b) + 6 achados da revisão | tests verdes · lint ok |
| **W18** | `f801c30` (onda18-e2e-real) → `280c3df` (fix18a-review) | Suíte E2E REAL com as chaves do usuário + more-flows mock + 5 achados da revisão | tests verdes · lint ok · E2E mock |

### Onda 15 — fechamento dos bugs da rodada 3 (`fix15a`/`fix15b` → `fix15c-review`)

Dois bugs herdados, num squash cada + o fechamento da revisão:

1. **`3a087a7 fix15-deepseek-parse` (B2)** — causa-raiz real do "resposta sem
   `choices[0].message.content`": o id `deepseek-v4-flash-0731` **não existe** na API; o
   POST devolvia **HTTP 400** que caía no caminho de sucesso. Corrigido para
   `deepseek-v4-flash` (validado num `GET /models` real que devolve exatamente
   `{deepseek-v4-flash, deepseek-v4-pro, deepseek-v4-flash-vision-exp}`) + erros claros
   (`BAD_REQUEST`/`EMPTY_CONTENT`) + `parseChoiceResult` puro.
2. **`73f749f fix15-list-challenges` (B1)** — `setupRoot` flui do `generateLesson` para o
   `list-challenges` (progresso `materializing` + memória `lastSetupRoot` no handler +
   contexto `ChallengeNav`). Fecha o erro `list-challenges requer setupRoot`.
3. **`838c307 fix15c-review`** — fechou 4 achados da revisão adversarial: **juiz degrada
   `EMPTY_CONTENT`/`NETWORK`** com graça; **reset de `lastSetupRoot`** em novo generate;
   **effect de listagem com dependência** correta; **sanitização de chave reordenada**
   (corpo do erro nunca expõe a key).

### Onda 16 — tutorial refeito fiel ao ondokai

1. **`7459808 onda16-tutorial`** — refez o onboarding: overlay `z-14000`
   (máscara 4 segmentos + spotlight + **bloqueio de clique**), **8 `expectedAction`** por
   snapshot (`evaluateStepAction` puro) com **auto-avanço ~220ms**, **Tutorial Completo**
   (14 steps) + **Quick Start** (6), **modal com gate de chaves** + CTA Configurar chaves,
   **first-run latch síncrono** (StrictMode-safe), **hint pós-tutorial 1x** (aponta o campo de
   assunto), **narração TTS local** (Piper), skip de alvo ausente, persistência/retomada.
2. **`699737d fix16d-review`** — fechou 5 achados da revisão: **skip de alvo ausente** +
   fallback "Continuar" (não trava); **CTA Configurar chaves fora do `Button disabled`**;
   **`delta` opcional** em re-run (não obriga re-tipar valor); **largura efetiva do painel**;
   **keys-fill avalia via `status`**; + **E2E de dead-lock** no desafio sem aula.

### Onda 17 — UX + matemática (em paralelo: `17a`/`17b`)

1. **`3a106e2 onda17a-ux`** — dark refinado **por camadas de elevação** (background `#0f1115`,
   paper `#171c23`, `text.secondary` `#aeb6c2` AA, `divider`, `tertiary` M3) + **Home guiada**
   (copy programação+matemática, 3 passos, CTA único contextual, card de status real das
   chaves, chips de sugestão com pré-preenchimento).
2. **`27d8d1a onda17b-math`** — **KaTeX** (`katex@0.16` + `remark-math@6` + `rehype-katex@7`,
   CSS no bundle) para fórmulas em aulas/desafios via `lessonMarkdown.ts` + **consistência de
   altura input/botão** na `LessonView` + copy de matemática.
3. **`b13dda0 fix17c-review`** — fechou 6 achados: **wiring do pré-preenchimento da Home na
   LessonView** com consumo one-shot; **escape de `$` de moeda** antes do KaTeX; **e2e de
   render `.katex` live**; **asserts da paleta dark** no `theme.test`; removeu `PlaceholderCard`
   morto.

### Onda 18 — E2E real com as chaves do usuário

1. **`f801c30 onda18-e2e-real`** — suíte E2E **REAL** (`real-lesson`, `real-didactics`,
   `real-search`) com as chaves do usuário por env no shell: **aula real com B1 provado**
   (desafios listam/abrem), **didática certa/errada com feedback do juiz**, **Brave
   round-trip**; + `more-flows` mock (idioma+tema, **Quick Start completo**, persistência do
   tutorial); `helpers-real.ts` + `tools/run-e2e-real.sh` (falha se faltar env); `.gitignore`
   ignora `.env.local`.
2. **`280c3df fix18a-review`** — fechou 5 achados: **timeout 1.8M (30 min)** nos specs reais
   (cauda lenta da geração); **`braveValidated` assert**; **contagem de specs nos READMEs**
   (correta: 11 specs mock / 15 testes); **tempos realistas** (2 tentativas de `perAttemptMs`
   420s); **cleanup de TMP em launch falho** (limpeza mesmo se o app não abrir).

### Subwaves de teste/validação

Cada onda teve subwave de **testes/validação** correndo junto da seguinte: os specs novos
(unit e E2E) foram escritos na própria onda e re-validados na revisão; o gate completo (lint +
build + unit + E2E mock) foi confirmado no fim de cada onda e **verde no fechamento**
(medido nesta entrega: `npm run lint` ok, `bash tools/t.sh tests` → **721 testes / 720 pass /
0 fail** / 1 skipped).

---

## Revisões adversarial e achados corrigidos

| Revisão | Achados fechados |
|---|---|
| fix15c-review | juiz degrada EMPTY_CONTENT/NETWORK; reset de lastSetupRoot em novo generate; effect de listagem com dep; sanitização de chave reordenada |
| fix16d-review | skip de alvo ausente + fallback Continuar; CTA Configurar chaves fora do Button disabled; delta opcional em re-run; largura efetiva do painel; keys-fill via status |
| fix17c-review | wiring do pré-preenchimento (consumo one-shot); escape de `$` de moeda antes do KaTeX; e2e de render `.katex` live; asserts da paleta dark; remoção de PlaceholderCard morto |
| fix18a-review | timeout 1.8M nos reais; braveValidated assert; contagem de specs nos READMEs; tempos realistas; cleanup de TMP em launch falho |

---

## Números finais

| Métrica | fim Rodada 3 | fim Rodada 4 |
|---|---|---|
| Testes unitários (node:test) | **622** | **721** (720 pass / 0 fail / 1 skipped) |
| E2E **mock** | 11 testes | **15** testes (11 specs) |
| E2E **real** | — | **+3** specs (`real-lesson`, `real-didactics`, `real-search`) |
| Modelo DeepSeek | `deepseek-v4-flash-0731` (inválido) | **`deepseek-v4-flash`** (validado na API) |
| Gates (lint · build · unit · E2E) | verdes | **todos verdes** |

- Unit: `bash tools/t.sh tests` → 721 testes / 140 suites / **720 pass / 0 fail** / 1 skipped.
- E2E mock: `npm run build && npm run test:e2e` → 11 specs / **15 testes** verdes
  (`e2e-gate` 2, `e2e-onboarding` 2, `more-flows` 3, demais 1).
- E2E real: `npm run test:e2e:real` → 3 specs (chaves por env no shell).
- Lint: `npm run lint` → `tsc --noEmit` limpo nos dois tsconfigs.

---

## Segurança

- **Chaves usadas APENAS em execuções locais via env**, nunca versionadas.
- `.gitignore` ignora `.env.local` (`app/.gitignore`); `tools/run-e2e-real.sh` **falha com
  mensagem clara** se `DEEPSEEK_API_KEY`/`BRAVE_API_KEY` não estão exportadas.
- Nos specs reais, o `userData` vai para um **TMP** (com as chaves em claro sem keyring) que é
  **apagado ao fim — inclusive em falha de launch** (fix18a). As chaves entram pelo canal IPC
  real sem tocar as settings do dev.
- **Grep limpo no HEAD**: nenhuma chave real nos arquivos versionados — só strings genéricas
  `sk-…`/`BSAq-…` redigidas em prosa como *placeholders* lacônicos em docs/scripts e valores de
  teste fictícios (`sk-test…`).

---

## Limitações / pendências conhecidas

- **Geração real de aula é cauda pesada/flaky**: transientes da DeepSeek ("content vazio",
  só `reasoning_content`) e latência; a geração é repetida 1× nos specs reais, mas o E2E real
  pode exigir re-run (timeout de 30min nos specs absorve o pior caso).
- **KaTeX e TTS dependem do modelo gerar markdown bem-formado**: delimitadores `$`/`$$`
  corretos (KaTeX) e texto de voz legível (TTS); geração mal-formada degrada visualmente —
  é qualidade de geração, não bug de render.
- **Tutorial Completo exige as duas chaves** (DeepSeek + Brave): sem elas, o modal fica no
  gate de chaves; o Quick Start pode seguir.
- **Lock de sessão com TTL 8h** (herdado da rodada 3): uma sessão travada pode exigir re-run
  do fluxo/E2E real após expiração do TTL.

---

## Sugestões para a Próxima Rodada (R5)

- **Mais presets de assuntos/histórico**: ampliar as sugestões da Home (programação+matemática)
  e guardar histórico de assuntos gerados.
- **Avaliação dirigida por rubrica**: além do veredito certo/errado, feedback estruturado por
  critérios (corretude, estilo, complexidade) rubricados no juiz.
- **Editor colaborativo** (futuro): presença/comentários no editor de código.
- **Pipeline de CI com as chaves reais em secret**: rodar o E2E real (`npm run test:e2e:real`)
  num CI com as chaves como secret (em vez de só local), cobrindo a cauda flaky com retries.
- **Métricas de didática**: registrar (de forma auditável, sem EXPOR as respostas) se o aluno
  acerta de primeira, quantas dicas usa, e alimentar `what_didnt_work` da memória.

---

## Referência — commits da rodada 4

```
4c686e0 fix-seguranca                           (HEAD)
cb353d5 COMMIT-FINAL EXPLAINER
4a336ca onda19-closing docs
280c3df fix18a-review
f801c30 onda18-e2e-real
b13dda0 fix17c-review
27d8d1a onda17b-math
3a106e2 onda17a-ux
699737d fix16d-review
7459808 onda16-tutorial
838c307 fix15c-review
73f749f fix15-list-challenges
3a087a7 fix15-deepseek-parse
cd1fdfb COMMIT-FINAL (fim da rodada 3 — ponto de partida)
```