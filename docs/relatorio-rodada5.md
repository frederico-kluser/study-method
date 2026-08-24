# Relatório da Rodada 5 — execução orquestrada (GUI Electron study-method)

Relatório da **quinta rodada** de desenvolvimento da GUI Electron do study-method (`app/`),
conduzida em ondas paralelas com revisão adversarial, integração por squash e gates verdes.
Foco: documentar **como** a rodada foi executada — ondas, squashs, commits, gates, revisões,
números, segurança, limitações e sugestões para a rodada 6.

O conteúdo técnico detalhado de cada entrega vive em [`docs/rodada5.md`](rodada5.md) e no
`app/README.md`.

---

## Como a execução rodou (onda a onda)

A rodada 5 saiu de `2b3c221` (fim da rodada 4 — última consolidação dos docs da R4) e terminou
em `b448200` (HEAD atual). Foram **3 squash commits**, organizados em 2 ondas + 1 fix de revisão:

| Onda | Squashs (hash curto) | O que entregou | Gate na onda |
|---|---|---|---|
| **W20a** | `eb4422f` (onda20a-tutorial-modal) | Bug A: painel do onboarding sem spotlight **centralizado** (viés 8% para cima + clamp) — não cola mais no canto inferior-direito | tests verdes · lint ok |
| **W20b** | `bfe8a38` (onda20b-dracula-dark) | Bug B: **dark mode Dracula de verdade** (paleta da lib `draculaTheme.ts`), AppBar escuro via `color="default"`+`applyStyles`; light intacto; testes theme + e2e-theme | tests verdes · lint ok · E2E mock |
| **fix20c** | `b448200` (fix20c-clamp) | Achado da revisão adversarial: `top` do clamp no ramo `!spotlight` protegido (`Math.max(margin, …)`) — painel alto nunca gera `top` negativo | tests verdes · lint ok |

Os gates foram confirmados **verdes por squash** em cada etapa: `bash tools/t.sh tests` subiu
de **722 → 729 testes, 0 fail** (1 skipped) e `npm run lint` ok; o E2E mock seguiu **15 passed +
3 skipped** (as 3 specs reais `real-*` ficam skipped sem as chaves) em cada etapa.

### Onda 20a — Bug A: tutorial/modal centralizado

**`eb4422f onda20a-tutorial-modal`** — o `calculatePanelPosition`
(`app/src/features/onboarding/utils/onboardingPositioning.utils.ts`) no ramo **`!spotlight`**
deixava o painel do onboarding (steps informativos/conclusão, ou alvo ausente) no **canto
inferior-direito**. Agora vira um **card central** (`top = centro − 8% da altura`, `left = centro
horizontal`, clamp no viewport; `width` nominal preservada, `compact: false`). **3 casos novos**
em `tests/onboardingPositioning.test.ts` (centralização no Full HD, clamp num viewport 320×480),
com regressão do ramo **com** spotlight intacta.

### Onda 20b — Bug B: dark Dracula de verdade

**`bfe8a38 onda20b-dracula-dark`** — o dark importa a paleta **Dracula canônica** de
`src/lib/draculaTheme.ts` (`DRACULA`: bg `#282a36`, foreground `#f8f8f2`, purple `#bd93f9`,
cyan `#8be9fd`; a lib é o contrato do editor/terminal e **NÃO foi tocada**). Paper `#2f3142`
(elevação leve), divider `#44475a` (currentLine), contrastText `#1e1f29` (escuro legível sobre o
roxo). O `AppBar` trocou `color="primary"` (header azul `#4f8cff` no dark) por `color="default"`
+ `applyStyles`: light = primary `#1565c0` intacto; dark = `background.paper` + borda `divider` +
`text.primary`. Bootstrap da janela segue `#282a36`. **Contraste WCAG 2.2 ≥ 4.5:1 medido no
teste** (funs de contraste local): `text.primary` 13.4:1, `text.secondary` 6.96:1,
`primary.contrastText` 6.78:1, `tertiary` 10.3:1, `primary` 5.9:1. Testes: `tests/theme.test.ts`
(valores exatos + contraste + prova de que o comment `#6272a4` falha AA) e
`tests/e2e/e2e-theme.spec.ts` (asserts de cor reais dark/light no browser).

### fix20c — clamp do `top` protegido no ramo `!spotlight`

**`b448200 fix20c-clamp`** — fechou o **único achado** da revisão adversarial (2ª/3ª rodada, ver
abaixo): o `Math.min` do clamp vertical do ramo `!spotlight` tinha o max fixo
`viewport.height − panelHeight − margin`, que ficava **negativo** quando o painel é mais alto
que o viewport → `top` negativo (painel sumia para cima). Protecido com `Math.max(margin, …)` (a
mesma proteção do ramo **com** spotlight, linha ~170). **Teste novo** em
`tests/onboardingPositioning.test.ts` (painel de 500px num viewport de 400px → `top ≥ 0` e, no
limite, `top = margin`).

### Subwaves de teste/validação

Cada onda teve subwave de **testes/validação** correndo junto: os specs novos (unit e E2E) foram
escritos na própria onda e re-validados na revisão; o gate completo (lint + build + unit + E2E
mock) foi confirmado no fim de cada etapa e **verde no fechamento** (medido nesta entrega:
`npm run lint` ok, `bash tools/t.sh tests` → **729 testes / 728 pass / 0 fail / 1 skipped**; E2E
mock 15 passed / 3 skipped).

---

## Revisões adversarial e achados corrigidos

A R5 usou o mesmo ciclo da R4 (revisão adversarial sobre cada onda, achados fechados num fix).

| Revisão | Achados fechados |
|---|---|
| Revisão 1ª rodada | **Morreu por crash de máquina** (o harness travou no meio) — mas chegou a **confirmar os contrastes** da paleta Dracula antes do travamento; a rodada foi re-disparada |
| Revisão 2ª/3ª rodada | **Achado único: clamp `top` negativo** no ramo `!spotlight` (painel mais alto que o viewport → `top < 0`). Corrigido no **fix20c-clamp** (`Math.max(margin, …)` no max do clamp) + teste novo |

Observação de execução: a **máquina travou no meio** da rodada (crash intermediário) durante a
revisão adversarial. A recuperação do harness retomou do ponto — a 1ª rodada da revisão perdeu o
estado após confirmar os contrastes, e a 2ª/3ª rodada revalidou e achou o único defeito real
(clamp). Nenhum outro achado de revisão ficou aberto.

---

## Números finais

| Métrica | fim Rodada 4 | fim Rodada 5 |
|---|---|---|
| Testes unitários (node:test) | **721** (720 pass / 0 fail / 1 skipped) | **729** (**728 pass / 0 fail** / 1 skipped) |
| E2E **mock** | 15 testes (11 specs) | **15** testes (11 specs) — 15 passed / 3 skipped |
| E2E **real** | 3 specs | **3** specs (`real-lesson`, `real-didactics`, `real-search`) — skipped sem chaves |
| dark mode | camadas `#0f1115`/`#171c23`, primary `#4f8cff` (header azul) | **Dracula** (`#282a36`/`#2f3142`/`#bd93f9`/`#8be9fd`), header escuro, contraste AA medido |
| onboarding sem spotlight | canto inferior-direito | **card central** (viés 8% p/ cima, clamp, `top` nunca negativo) |
| Gates (lint · build · unit · E2E) | verdes | **todos verdes** |

- Unit: `bash tools/t.sh tests` → 729 testes / 140 suites / **728 pass / 0 fail** / 1 skipped.
- E2E mock: `npm run build && npm run test:e2e` → **15 passed + 3 skipped** (as 3 real-*).
- Lint: `npm run lint` → `tsc --noEmit` limpo nos dois tsconfigs.

---

## Segurança

- **Chaves usadas APENAS em execuções locais via env**, nunca versionadas (herdado da R4).
- `.gitignore` ignora `.env.local`; `tools/run-e2e-real.sh` falha com mensagem clara se
  `DEEPSEEK_API_KEY`/`BRAVE_API_KEY` não estão exportadas.
- **Grep limpo no HEAD**: nenhuma chave real (só os fragmentos genéricos redigidos
  `sk-…`/`BSAq-…` em prosa lá das rodadas anteriores). A R5 só tocou docs e tema — nada de chave.

---

## Limitações / pendências conhecidas

- As mesmas da R4 persistem: **geração real de aula é cauda pesada/flaky** (timeout 30min nos
  specs reais absorve o pior caso); **KaTeX/TTS dependem de markdown bem-formado** (qualidade de
  geração, não bug de render); **Tutorial Completo exige as duas chaves**; **lock de sessão com
  TTL 8h** herdado.
- **`text.secondary` escapa à paleta Dracula canônica** de propósito: o comment `#6272a4` da
  paleta falha AA (3.03:1) — usamos `#aeb6c2` (mantido da R4) para legibilidade. Documentado no
  código e no `tests/theme.test.ts`.
- **DOI do paper (ligado a MAT-05, exemplo original)** permanece um risco de regulatory —
  como nas rodadas anteriores (na R3 o paper se estivesse ligado a MAT-05 seria bloqueado).

---

## Sugestões para a Próxima Rodada (R6)

- Os **contrastes do light** não foram assertados em R5 (só os do dark são medidos no teste);
  conferir/proteger os do scheme claro (Regra 5 completa).
- **Mais presets de assuntos/histórico** (herdado da R4): ampliar as sugestões da Home e guardar
  histórico de assuntos gerados.
- **Avaliação dirigida por rubrica** (herdado da R4): feedback estruturado por critérios
  (corretude, estilo, complexidade) no juiz.
- **Pipeline de CI com as chaves reais em secret** (herdado da R4): rodar o `test:e2e:real` num
  CI cobrindo a cauda flaky com retries.
- **Métricas de didática** (herdado da R4): registrar de forma auditável (sem EXPOR respostas)
  se o aluno acerta de primeira e quantas dicas usa.
- **Editor colaborativo** (futuro, herdado da R4): presença/comentários no editor de código.
- **Resiliência do harness**: com o crash de máquina da R1, vale revisar checkpoints da revisão
  adversarial para retomada sem perda.

---

## Referência — commits da rodada 5

```
b448200 fix20c-clamp          (HEAD — achado da revisão: clamp top protegido)
bfe8a38 onda20b-dracula-dark  (Bug B: dark Dracula + AppBar escuro)
eb4422f onda20a-tutorial-modal (Bug A: painel sem spotlight centralizado)
2b3c221 (fim da rodada 4 — ponto de partida)
```