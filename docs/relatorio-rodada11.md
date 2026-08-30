# Relatório da Rodada 11 — a engine de trilhas: ondas 1–4 do plano de execução v1 (P-01..P-26)

Relatório da **décima primeira rodada** de desenvolvimento do study-method. Esta rodada construiu a
**engine de trilhas** descrita em `docs/16-engine-de-trilha.md`: a máquina que transforma a
proibição "um desafio só pode cobrar o que já foi ensinado" numa **diferença de conjuntos sobre
AST**, que roda em milissegundos, sem rede e sem chave de API, com poder de veto. O plano de
execução v1 dividiu a construção em 4 ondas (P-01..P-26), sobre a base determinística pré-plano
("onda 0": `atomKeys`/`extract`/`theoryCode`/`budget`/`audit` + CLI `audit`). Este relatório
consolida as ondas 1–3 **integradas em `main`** e o estado da onda 4 (P-22..P-26: `generate`,
`repair`, relatório, piloto e docs — este pacote é o P-26).

---

## O que foi feito (ondas 0–4 da engine de trilhas)

| Onda | Pacotes | Feature | Onde vive |
|---|---|---|---|
| 0 (base, já existia) | — | engine determinística: `atomKeys`, `extract`, `theoryCode`, `budget`, `audit` + CLI `audit` | `app/electron/main/engine/`, `app/tools/track-engine/cli.ts` |
| 1 (8) | P-01..P-08 | transporte LLM (semáforos/backoff/cache); escalonador de ondas com posse; ledger encadeado por hash; 12 schemas zod + lint de ordem de campos; vocabulário gerado por máquina; eixo `form:` (DSL própria); 4 provas de execução; grafo de conceitos com invariantes I1–I11 | `engine/runtime/`, `engine/schemas/`, `engine/vocab/`, `engine/form/`, `engine/exec/`, `engine/graph/`, `engine/extract.ts` |
| 2 (7+4) | P-09..P-15 + P-27..P-30 | F0 brief + máquina nocional; F4 orçamento cumulativo + F5 FREEZE; prompts do autor (dossiê 13 campos), revisor, planejador e corretor; F1 pesquisa com busca injetada; F2 decomposição atômica; + limitador unificado, adapter `ExecFn`, 30 módulos built-in do vocabulário, **pin mecânico do placar** | `engine/phases/f0Brief.ts`, `f4Budget.ts`, `f5Freeze.ts`, `f1Research.ts`, `f2Decompose.ts`, `engine/prompts/*`, `engine/exec/adapter.ts`, `app/tests/engineAuditPlacar.test.ts` |
| 3 (7) | P-31, P-16..P-21 | F9 provador oficial; F3 julgamento paralelo de arestas; F7/F8 autoria (1 agente = 1 aula, 3 chamadas sequenciais); F11 laço de revisão completo (cascata §6.6); solubilidade com aluno simulado `pass^k`; mutantes e calibração do revisor; F12 materialização serial com G-FINAL | `engine/phases/f9Verifier.ts`, `f3Graph.ts`, `f7Theory.ts`, `f8Challenges.ts`, `f12Materialize.ts`, `engine/review/*`, `engine/quality/*` |
| 4 (5, em andamento) | P-22..P-26 | `generate` (máquina de estados, `--from`/`--only`), `repair` (laço sobre conteúdo existente), relatório do placar completo, F6 piloto com portão humano, **docs** (este pacote: `docs/16-engine-de-trilha.md` re-medido, `docs/research/07-engine-de-trilha.md`, este relatório, README, teste de coerência) | branches `p22-modo-generate`…`p25-piloto` (worktrees, **não integradas**); P-26 nesta branch |

---

## O problema (a razão da rodada)

O conteúdo da trilha `nodejs-do-zero` estava quebrado por construção: o desafio da **primeira aula**
("o que é programação") exigia `function`, parâmetro, `if`, `typeof`, `!==`, `throw`, `new Error`,
`return` e concatenação — nada disso ensinado na aula. O único gate que existia provava *forma*
(schema válido, solução passa, starter falha), nunca *conhecimento*. A engine existe para fechar esse
buraco com um gate determinístico, sem LLM e sem chave.

## Diagnóstico — números reproduzíveis

Todos os números abaixo vêm de comandos; nenhum é afirmado sem reprodutor.

**O placar do defeito, re-medido em 2026-08-30 (exatamente o comando do `GATE_AUDIT`):**

```bash
cd app && npm run engine -- audit nodejs-do-zero --limite 0
```

| Medição | Valor |
|---|---|
| Aulas | 118 · desafios 118 · com violação **96 (81%)** |
| Violações | **285** (exit 1 = violações encontradas, convenção do repo) |
| Lacunas de currículo (construção que nenhuma aula ensina) | **102** |
| Aulas que não introduzem construção nenhuma | 12 |
| Blocos de código teórico sem tag de linguagem | 68 · blocos `js` que não parseiam 4 |
| Placar | `22 passou · 96 falhou · 0 pendente` |

O mesmo relatório em `--json` reproduz as derivadas (aula 1 com 18 construções novas — o penhasco —
mediana 3, 45 aulas acima do teto de 4, 100 de 118 aulas com exatamente 1 conceito declarado); a
distribuição de violações por gate da bateria §5 é `A3 167 · A2 52 · A6 45 · DEC 17 · A1 2 · I16 2`.

**O pin que impede regressão do diagnóstico (P-30) — violações ≤ 285, desafios com violação ≤ 96,
lacunas ≤ 102:**

```bash
cd app && bash tools/t.sh tests/engineAuditPlacar.test.ts
```

**A suíte da engine — 26 arquivos de teste no momento (contagem):**

```bash
cd app && ls tests/engine*.test.ts | wc -l
```

**Suíte unitária do app (gate final desta rodada, medido 2026-08-30):**

```bash
cd app && bash tools/t.sh tests
```

**Lint (tsc nos dois tsconfigs):**

```bash
cd app && npm run lint
```

Histórico de contagem por onda (registro do `TASK_PLAN`): baseline de onda 1 ~1968 → integrada
~2193 (2192 pass) → onda 2 ~2445 → onda 3 ~2485; o gate final desta rodada mediu **2568 testes · 2567 pass · 0 fail · 1 skipped** (suíte completa, ver Gates abaixo).

---

## Correções — o que cada onda entregou (resumo)

- **Onda 1 — a fundação verificável.** Um único transporte de LLM com semáforos, backoff por código,
  cache opcional e telemetria por etapa (P-01); escalonador de ondas com posse exclusiva de
  arquivo, reducers declarados e retomada por `cacheKey` (P-02); ledger de execução encadeado por
  hash com escrita atômica (P-03); 12 schemas zod com **todo campo obrigatório** e lint de ordem de
  campos (decisão antes do raciocínio é reprovada) + `TestVerdict` corrigido (P-04); vocabulário
  `atoms.json` (1312 chaves) e catálogo de API gerados por máquina, determinísticos byte a byte
  (P-05); eixo `form:` com DSL própria de seletor, sem dependência nova (P-06); as 4 provas de
  execução com parse do **último** bloco spec + consistência estrita e exit-guard (P-07); grafo de
  conceitos com duas arestas, topo-sort estável e invariantes I1–I11 (P-08).
- **Onda 2 — orçamento, freeze e os prompts canônicos.** F0 brief com os 9 aspectos mínimos da
  máquina nocional e política de harness obrigatória (P-09); F4 deriva o orçamento cumulativo com
  matriz de 3 estados e G-MONO, F5 congela com snapshots imutáveis por aula e hash canônico (P-10);
  dossiê do autor com **13 campos obrigatórios** (recusa nomeia o campo faltante) e prompt do autor
  como **função pura** com checksum de cauda (P-11); revisor com schema **sem campo de código**,
  artefato normalizado e roteamento `model(autor) ≠ model(revisor)` (P-12); planejador de catálogo
  fechado (lacuna → `CREATE` de aula, nunca `REWRITE`) e corretor verify-first com gate de diff
  (P-13); F1 pesquisa com busca injetada e aborto estruturado por falta de chave (P-14); F2
  decomposição atômica com teste de atomicidade puro (P-15). Batch B: limitador unificado (P-27),
  adapter `ExecFn` (P-28), 30 receptores de módulo built-in (P-29) e o pin mecânico do placar
  (P-30).
- **Onda 3 — o laço e a materialização.** F9 provador oficial compondo isolamento + exit-guard +
  env endurecido (P-31); F3 julga arestas por voto paralelo com poda transitiva reportada (P-16);
  autoria F7/F8 com 3 chamadas sequenciais, bloqueio sem arquivo parcial e faixas por superfície
  (§3.3) após revisão adversarial (P-17); **F11 o laço completo** — ordem §6.1, cascata §6.6 exata
  (parada 0 mecânica, ping-pong, rollback, proxy de estagnação, failsafe), pins de regressão, ledger
  de rejeições com `excecao_intencional` (P-18); solubilidade com aluno simulado `pass^k` estrita
  (P-19); mutantes em 4 classes + calibração do revisor com desligamento por limiar (P-20); F12
  materialização **serial** com tabela de derivação e G-FINAL (P-21).
- **Onda 4 (estado).** `generate` (P-22), `repair` (P-23), relatório do placar (P-24), piloto F6
  (P-25) vivem em worktrees **não integradas** — dependem de fiação com LLM; P-26 (docs) é este
  pacote, com o `docs/16-engine-de-trilha.md` re-medido, a rastreabilidade em `docs/research/07-engine-de-trilha.md`, este relatório, a
  primeira menção da engine no README raiz e o teste de coerência
  `app/tests/engineDocsCoerencia.test.ts`.

---

## Decisões abertas D1–D5 revisitadas (AF-11) — o que a execução mediu

| # | Decisão | Veredito AF-11 | O que a execução mediu |
|---|---|---|---|
| D1 | Política de harness `receptive-seed` | **CONFIRMADA** | Implementada com a semente receptiva do harness. O P-06 da onda 1 travou o baseline (11 formas novas = ruído do harness/starter → re-pin 296) e o fix-onda1-p06-formas-harness restaurou o alvo **285/96/102 com 0 violações `form:`** (defer explícito: a seed desta versão não carrega formas do eixo `form:`, fail-closed). |
| D2 | Teto de aulas não existe; contagem é saída com portão humano em F6 | **CONFIRMADA** | Nenhum teto global foi necessário; o portão humano segue no F6 (P-25, worktree). A distribuição medida (penhasco 18 vs mediana 3) reforça o teto **por aula** (A12 = 4). |
| D3 | Máquina nocional de JS/Node sem fonte pública; ~15 aulas exigirão concepções autoradas | **CONFIRMADA** | O F0 materializa 9 aspectos mínimos obrigatórios da máquina nocional; o custo real das concepções autoradas será medido no piloto F6 (P-25) — sem medição nova, mantém-se o planejamento declarado. |
| D4 | Orçamento da **prosa** em pt-BR: severidade aviso, nunca bloqueante | **CONFIRMADA** | O eixo `term:` entrou no vocabulário gerado; a calibração de severidade continua aviso (nenhuma medição pedagógica da prosa foi feita nesta rodada — é débito declarado). |
| D5 | Distinção receptivo/produtivo: necessidade medida, correção sem precedente | **CONFIRMADA** | A necessidade está na própria bateria: `A3 167` violações ocorrem no `testsCode` contra o orçamento de **entrada** (o aluno lê o teste antes de aprender). A correção foi implementada nas superfícies §3.3 (fix-onda3-p17-faixas-posse: starter/teoria ⊆ receptivo, solution ⊆ produtivo, tests ⊆ entrada) com fixtures de regressão em `engineBudgetGate.test.ts`; a revisão humana do piloto (P-25) segue pendente. |

---

## Gates e verificação

- **Gates intermediários (registro do `TASK_PLAN`)**: todas as ondas 1–3 fecharam lint/test/build por
  pacote; a subwave `VAL-ONDA1` fechou 4/5 (lint/test/build/INV-01) com o audit no baseline de
  conteúdo; `TEST-ONDA1-INTEGRACAO` adicionou 11 testes de integração
  (`engineOnda1Integracao.test.ts`); `PIN INT-02` (violações ≤ 285 · com violação ≤ 96 · lacunas
  ≤ 102) foi verificado nas integrações das ondas 2 e 3.
- **Revisão adversarial**: cada onda teve vereditos com fixes nomeados (ex.: P-06 `BLOCK: CRITICAL`
  → fix-onda1-p06-formas-harness; P-07 `BLOCK: CRITICAL` → fix-onda1-p07-provas-confiança; P-16
  `BLOCK: HIGH` → fix-onda3-p16-arestas-rejulgar; P-18 → fix-onda3-p18-teto-sugestao), e os fixes
  correspondentes entraram em `main`.
- **Gate final desta rodada (rodado em 2026-08-30, na worktree do P-26 — base `a1baa54`, o estado
  integrado da onda 3; os fixes pós-integração de `main` não alteram o placar, o pin mecânico
  `engineAuditPlacar` está verde nos dois estados)**:

  ```bash
  cd app && npm run engine -- audit nodejs-do-zero --limite 0   # audit: 285/96/102, placar 22 passou · 96 falhou
  cd app && npm run lint                                        # tsc --noEmit nos dois tsconfigs — verde
  cd app && bash tools/t.sh tests                               # 2568 testes · 2567 pass · 0 fail · 1 skipped
  cd app && bash tools/t.sh tests/engineDocsCoerencia.test.ts   # o teste novo deste pacote — verde
  ```

  Progresso da suíte por onda (registro do `TASK_PLAN`): 1968 → 2193 → ~2445 → ~2485 → 2568.

---

## Limitações declaradas

- **INV-02 — gates sem chave.** `audit`, lint, build e a suíte rodam **sem chave de API** (por
  design; o transporte P-01 trata `KEY_MISSING` como erro estruturado). Os modos que chamam a LLM
  (`generate`/`repair`, P-22/P-23) não estão integrados: exigem chave e ficam nas worktrees.
- **O audit é métrica de conteúdo, não prova de aprendizado.** O placar mede contenção de orçamento,
  prova de execução e distribuição de construções — não a eficácia pedagógica (nenhuma medição de
  efeito pedagógico é afirmada). Similaridade de cópia (P-24) e o piloto humano (P-25) cobrem a
  parte que o placar não enxerga.
- **Gate-lint e validate não rodam no bash 3.2 do macOS** (`local -n` em `tests/lib/assert.sh` e
  `tests/validate.sh` — P-32/P-36 pendentes, worktrees `p32-bash32`/`p36-anti-regressao` não
  integradas). A verificação L-02..L-05 dos arquivos **novos** deste pacote foi feita por uma porta
  mínima embutida no teste `app/tests/engineDocsCoerencia.test.ts` (links relativos, newline final,
  tabelas markdown, placeholder órfão) + conferência manual; o gate completo integra no merge.
- **`--from`/`--only` não implementados** (D7): dependem do P-22; o `audit` já expõe `--limite`,
  `--so-lacunas` e `--json`.
- **`difficulty` é provisório** (D5): rampa linear 1..5 pela posição global preenchida no F12;
  nenhum gate o lê; a derivação por tempo medido é débito de produto.
- **Flake do confetti CORRIGIDO** — o teste de animação de confete era intermitente sob carga
  (corrida de `requestAnimationFrame`); o fix (`ebb3360`, mock timers + tick, sem sleep real)
  tornou-o determinístico.
- **Baseline de conteúdo com débito declarado**: 68 blocos de teoria sem tag de linguagem e 4
  blocos `js` que não parseiam não são violações de orçamento — são dívida de conteúdo da trilha
  (entra no escopo do `repair`/onda de conteúdo, P-23). Reprodução dos números de débito (68
  blocos, 4 parse errors, 12 aulas sem introdução):

  ```bash
  cd app && npm run engine -- audit nodejs-do-zero --limite 0
  ```
- **Escopos declarados fora do laço**: R5 do filtro herda o escopo do harness (socket cru fora do
  alcance); o laço F11 é fail-closed (revisor indisponível = erro estruturado, nunca aprovação por
  omissão).
- **P-19/P-24**: a solubilidade (`pass^k`) usa aluno simulado via LLM (exige chave e custa tokens —
  é gate de conteúdo gerado, não do conteúdo legado); o placar completo com tokens por fase e
  similaridade é do P-24 (não integrado).

---

## Pendências

- Integrar P-22 (`generate`), P-23 (`repair`), P-24 (relatório do placar), P-25 (piloto F6) —
  worktrees criadas, fiação com LLM pendente.
- Integrar P-32/P-36 (bash 3.2): remover `local -n` e reprovar `local -n`/`${var,,}` como
  anti-regressão — destrava `gate-lint`/`validate` no macOS.
- Dívida de conteúdo da trilha (68 blocos sem tag, 4 parse errors, 12 aulas sem introdução) — escopo
  do `repair`. Reprodução:

  ```bash
  cd app && npm run engine -- audit nodejs-do-zero --limite 0
  ```
- `difficulty` por tempo medido (débito de produto, D5).
- Consumidores do provador migram para o re-export de `phases/f9Verifier.ts` (recomendação P-31);
  `challengeExec.ts` segue intocado (só ganhou `opts.env?` aditivo).

## Arquivos tocados (principais)

- **Engine (ondas 1–3, integradas)**: `app/electron/main/engine/` — `runtime/` (P-01/P-02/P-03),
  `schemas/` (P-04), `vocab/` (P-05/P-29), `form/` (P-06), `exec/` (P-07/P-28/P-31),
  `graph/` (P-08/P-16), `phases/` (P-09/P-10/P-14/P-15/P-31/P-16/P-17/P-21),
  `prompts/` (P-11/P-12/P-13), `review/` (P-18), `quality/` (P-19/P-20), `extract.ts`,
  `theoryCode.ts`, `budget.ts`, `audit.ts`, `atomKeys.ts`.
- **CLI**: `app/tools/track-engine/cli.ts` (audit com `--limite`/`--so-lacunas`/`--json`);
  `app/tools/track-engine/README.md`.
- **Extensão de posse declarada**: `app/electron/main/services/challengeContextValidator.ts`
  (P-04 — ordem do `TestVerdict` corrigida).
- **Testes**: 26 arquivos `app/tests/engine*.test.ts` (destaque:
  `app/tests/engineAuditPlacar.test.ts` pin 285/96/102; `app/tests/engineReviewLoop.test.ts` ~970
  linhas; `app/tests/engineOnda1Integracao.test.ts`). Contagem:

  ```bash
  cd app && ls tests/engine*.test.ts | wc -l   # 26
  ```
- **Docs (P-26, este pacote)**: `docs/16-engine-de-trilha.md` (re-medido §1 + divergências D1–D9
  corrigidas), `docs/research/07-engine-de-trilha.md` (novo, rastreabilidade),
  `docs/relatorio-rodada11.md` (este), `README.md` (1ª menção da engine),
  `app/tests/engineDocsCoerencia.test.ts` (novo).
