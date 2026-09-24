---
titulo: 21 — Inventário de refatoração — arquivos >500 linhas e funções CC>8
data: 2026-09-24
escopo: codigo de producao e de teste do repositorio study-method
medio: linhas por wc -l e complexidade ciclomatica por AST (regra propria declarada)
status: inventario pronto — nenhuma refatoracao executada nesta onda
---

# 21 — Inventário de refatoração: arquivos >500 linhas e funções CC>8

> **O que este documento é.** O inventário MEDIDO que delimita a onda de refatoração do
> repositório: quais arquivos de produção passam de 500 linhas, quais funções/métodos passam
> de complexidade ciclomática (CC) 8, com o método de medição reproduzível e os lotes de
> refatoração propostos. É a base de escopo de quem for refatorar — COMPLETO por construção
> (as tabelas das §2, §3 e §4 são geradas por script, não por amostragem) e REPRODUZÍVEL
> (cada número tem o comando ao lado, regra de `CONTRIBUTING.md`: *«Todo número que aparece
> em documento, README ou mensagem ao aluno tem que ser reproduzível por um comando.»*).
>
> **O que este documento não é.** Não é plano de refatoração passo-a-passo, não muda contrato
> e não executa refatoração nenhuma: a onda de execução escreve os testes ANTES e refatora
> lote a lote. Onde há julgamento e não medição, a linha vem marcada `[INFERÊNCIA]` — a
> mesma convenção de [`19-auditoria-da-aula.md`](19-auditoria-da-aula.md).
>
> **Autoridade.** [`00-contratos.md`](00-contratos.md) é o contrato VENCEDOR do repositório e
> nada aqui o contradiz: este documento não declara nome de passo, caminho de setup, exit code
> nem vocabulário novo — ele MEDE o que já existe. Onde uma refatoração futura precisar tocar
> fronteira do §2/§3/§5 de
> [`00-contratos.md`](00-contratos.md), a mudança de contrato acontece lá primeiro.
>
> **Medido em** 2026-09-24, na worktree desta onda, com `app/node_modules` instalado por
> `HUSKY=0 npm --prefix app ci` (para o pacote `typescript` da análise de AST). Nenhuma chave
> de API foi usada, nenhuma rede foi tocada, nenhum LLM participou da medição: os três
> medidores são determinísticos (AST/regex), e o mesmo insumo produz sempre a mesma saída.
>
> **Project-router não encontrado — prossegui sem.** (`.claude/skills/project-router/SKILL.md`
> e `.agents/skills/project-router/SKILL.md` não existem nesta worktree.)

---

## 0. Visão — o escopo em números

Todos os números da linha abaixo saem dos comandos §1 (M1–M4) e dos filtros §6:

| Medida | Valor | Comando |
|---|---|---|
| Arquivos de código de produção medidos | 341 | M1a |
| Linhas de produção (soma) | 145387 | M1b |
| Arquivos de produção com >500 linhas | 96 | M1c |
| Linhas só nos >500 | 95623 | M1d |
| Funções/métodos medidos (produção) | 5445 | M2/M3/M4 |
| Funções com CC>8 | 475 | M5a |
| Arquivos de código de teste medidos (`app/tests`) | 316 | M1e |
| Arquivos de teste com >500 linhas | 85 | M1f |
| Alvos de refatoração (união: >500 linhas ∪ ≥1 função CC>8) | 178 | M5b |
| Lotes propostos | 17 | §5 |

### 0.1 As 20 maiores complexidades medidas

| path:linha | Função | CC | Linguagem |
|---|---|---|---|
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:331` | `Emissor.visitar` | 111 | MJS |
| `app/electron/main/engine/audit.ts:651` | `auditTrack` | 90 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:1437` | `sm_self_test` | 71 | Shell |
| `app/electron/main/engine/modes/repair.ts:1171` | `repararTrilhaInterno` | 69 | TypeScript |
| `app/electron/main/engine/vocab/py/extract_ast.py:478` | `_Emissor._sinteticos` | 62 | Python |
| `app/electron/main/engine/phases/f12Materialize.ts:538` | `montarArvoreDeProduto` | 57 | TypeScript |
| `skills/study-method/scripts/lib/sandbox.sh:386` | `sm_sandbox_run` | 57 | Shell |
| `app/electron/main/engine/quality/progressao.ts:458` | `<callback de aulas.forEach>` | 54 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:972` | `sm_ensure_flow` | 54 | Shell |
| `skills/study-method/scripts/lib/_jsonschema_min.py:79` | `validate` | 53 | Python |
| `skills/study-method/scripts/render-plot.py:397` | `build_series` | 53 | Python |
| `app/electron/main/engine/review/loop.ts:821` | `rodarRodadaInterna` | 52 | TypeScript |
| `app/electron/main/services/lessonOrchestrator.ts:531` | `generateLesson` | 48 | TypeScript |
| `skills/study-method/scripts/render-plot.py:823` | `build_svg` | 46 | Python |
| `skills/study-method/scripts/docs-index.sh:317` | `di_scan` | 45 | Shell |
| `app/src/views/LessonView/LessonView.tsx:1466` | `LessonView` | 44 | TSX |
| `app/electron/main/engine/quality/barra.ts:498` | `auditarBarra` | 43 | TypeScript |
| `app/electron/main/services/llmClient.ts:362` | `chatCompletion` | 43 | TypeScript |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx:396` | `TrackChallengePanel` | 42 | TSX |
| `app/electron/main/engine/modes/curriculumGap.ts:772` | `planejarAulasDeLacuna` | 41 | TypeScript |

[INFERÊNCIA] Os extremos do topo não são ruído de contagem: `Emissor.visitar` (CC 111) é o
visitante de nós da Porta 1 de Rust (`app/electron/main/engine/vocab/rs/extract_ast.mjs`) — uma
cadeia de desvio por tipo de nó da árvore — e `auditTrack` (CC 90) é o roteiro que aplica as
baterias de regra da auditoria por aula. Nos dois casos o padrão de refatoração é o mesmo:
tabela/dispatch, não extração de laço.

---

## 1. Método de medição (reproduzível)

### 1.1 Escopo — o que entra e o que não entra

| Decisão | Detalhe |
|---|---|
| Linguagens | `.ts` · `.tsx` · `.js` · `.mjs` · `.py` · `.sh` (o conjunto nomeado na missão). Nada mais é medido. |
| Produção | `app/src`, `app/electron`, `app/shared`, `app/tools`, `skills/study-method/scripts`, `tools/`, `tests/`, `evals/` + `install.sh` + `run.sh`. |
| Por que `tests/` é produção aqui | `tests/` são os gates do repositório — código de ferramenta que o projeto mantém, e a missão o listou no escopo de produção. Os arquivos de TESTE em sentido estrito vivem em `app/tests` e vão para a seção própria (§4). |
| Exclusões | `node_modules`, `app/dist`, `app/out`, `__pycache__` e artefato de build; `app/tests` sai do CC (é teste) e entra só na §4. |
| Fora do escopo declarado, existente no disco | `app/electron.vite.config.ts`, `app/playwright.config.ts`, `app/run-dev.sh` — código de suporte na raiz de `app/`, fora das pastas nomeadas pela missão. Ficam registrados aqui para o inventário não perder nada; não foram medidos. |
| Contagem de funções | Toda função/método/arrow/getter/setter/lambda: em TS/TSX/JS/MJS cada nó function-like do AST; em Python `def`/`async def`/`lambda` (inclusive aninhados e comprehension — a comprehension conta pontos mas não é função); em Shell cada `nome() {`/`function nome {`. Código de topo de módulo/script NÃO é função e não entra (declarado em §1.7). |

### 1.2 Linhas (M1)

`linhas` = saída de `wc -l` (contagem de caracteres `\n`; arquivo sem newline final conta um
a menos — a regra é fixa, então o número é sempre comparável). Comandos exatos:

```bash
# M1a — universo de produção + contagem de linhas por arquivo
find app/src app/electron app/shared app/tools skills/study-method/scripts tools tests evals \
  install.sh run.sh \
  -type d \( -name node_modules -o -name dist -o -name out -o -name __pycache__ \) -prune -o \
  -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \
           -o -name '*.py' -o -name '*.sh' \) -print | sort > prod-files.txt
while read -r f; do wc -l < "$f" | tr -d ' ' | awk -v f="$f" '{print $1"\t"f}'; done \
  < prod-files.txt | sort -k1,1nr > prod-lines.tsv
wc -l < prod-files.txt                       # M1a: nº de arquivos
awk -F'\t' '{s+=$1} END{print s}' prod-lines.tsv   # M1b: soma de linhas
awk -F'\t' '$1>500' prod-lines.tsv          # M1c: a tabela §2 (path, linhas)
awk -F'\t' '$1>500 {s+=$1} END{print s}' prod-lines.tsv   # M1d

# M1e/M1f — o mesmo para o código de teste (app/tests)
find app/tests -type d \( -name node_modules -o -name __pycache__ \) -prune -o \
  -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \
           -o -name '*.py' -o -name '*.sh' \) -print | sort > test-files.txt
# ...mesma contagem de wc -l sobre test-files.txt → test-lines.tsv (tabela §4)
```

### 1.3 CC de TS/TSX/JS/MJS (M2) — AST do pacote `typescript`

Medidor: [`ts-cc.mjs`](#apêndice-a--ts-ccmjs), executado com o `typescript` de `app/node_modules`
(instalado por `HUSKY=0 npm --prefix app ci` — nunca global; a versão sai de
`node -e "console.log(require('typescript').version)"`, `5.8.3` nesta medição).
Cada nó function-like (`function`, arrow, method, `get`/`set`, `constructor`) vira uma linha;
o CC dele é **1 + os pontos de decisão do corpo dele**, sem o corpo de função aninhada:

| Construto | Pontos |
|---|---|
| `if` (cada `IfStatement`; `else if` é um `IfStatement` próprio) | +1 |
| `for` · `for-in` · `for-of` · `while` · `do-while` | +1 cada |
| braço de `switch` (cada `case` e cada `default` — cada braço é um caminho) | +1 |
| `catch` | +1 |
| expressão condicional `cond ? a : b` | +1 |
| operador binário `&&` · `\|\|` · `??` (cada ocorrência) | +1 |
| NÃO soma | atribuição lógica (`&&=`, `\|\|=`, `??=`), `!`, `else` puro, default de parâmetro, comentário |

Nome da função na saída: nome declarado (`Classe.método`); arrow/function anônima recebe o
alvo da atribuição/declaração, ou `<callback de …>` quando é argumento de chamada, ou
`<anônima em …>` com a função que a envolve. O texto é achatado (espaços colapsados) e
truncado em 48 caracteres.

```bash
# M2 — CC de todo arquivo TS/TSX/JS/MJS do universo de produção
grep -E '\.(ts|tsx|js|mjs)$' prod-files.txt > prod-ts.txt
node ts-cc.mjs . $(cat prod-ts.txt) > cc-ts.tsv    # TSV: path, linha, nome, CC, linguagem
```

### 1.4 CC de Python (M3) — módulo `ast` da stdlib

Medidor: [`py-cc.py`](#apêndice-b--py-ccpy). Mesma base 1, mesmo critério de corpo próprio
(função aninhada conta para ela), com os equivalentes Python:

| Construto | Pontos |
|---|---|
| `if` (cada `ast.If`; `elif` é `If` aninhado) | +1 |
| `for` · `async for` · `while` | +1 cada |
| `except` (cada handler) | +1 |
| `and`/`or` (cada operador booleano; `BoolOp` com N valores soma N−1) | +1 |
| `x if c else y` | +1 |
| compreensão: cada `for` e cada `if` de gerador | +1 |
| `match`/`case`: cada `case` | +1 |
| NÃO soma | `assert`, `with`, `not`, `else` puro, `try` sem `except` |

```bash
# M3 — CC de todo .py do universo de produção
grep -E '\.py$' prod-files.txt > prod-py.txt
python3 py-cc.py $(cat prod-py.txt) > cc-py.tsv
```

### 1.5 CC de Shell (M4) — pontos de decisão por função

Shell não tem AST na stdlib, e linha-de-grep mente (um `&&` dentro de comentário ou de string
não é decisão). O medidor [`sh-cc.py`](#apêndice-c--sh-ccpy) se apoia no **classificador léxico
do próprio repositório** — `shellscope.py`, embutido em [`tests/lib/assert.sh`](../tests/lib/assert.sh)
(é ele que separa `code` de `comment`/`heredoc`/string e nomeia a pilha de funções) — extraído
sem rede e sem dependência:

```bash
# M4 — extração do shellscope.py do gate + CC de todo .sh do universo de produção
awk "/<<'PYSHELLSCOPE'/{f=1;next} /^PYSHELLSCOPE\$/{f=0} f" tests/lib/assert.sh > shellscope.py
grep -E '\.sh$' prod-files.txt > prod-sh.txt
python3 sh-cc.py shellscope.py . $(cat prod-sh.txt) > cc-sh.tsv
```

Regra de contagem — só linhas classificadas `code` (comentário, aqui-document e conteúdo de
string não contam), atribuídas à função mais interna que as envolve (função aninhada conta
para a aninhada); cada função nasce com 1:

| Construto | Pontos |
|---|---|
| palavra-chave `if` · `elif` · `while` · `until` · `for` | +1 cada ocorrência |
| `&&` e `\|\|` | +1 cada |
| `\|` (pipe de comando) que não seja `\|\|`, `\|&` ou `>\|` | +1 cada |
| braço de `case` (linha de código que abre com padrão seguido de `)`); o `case` em si não soma | +1 cada braço |
| ternário aritmético `$(( c ? a : b ))` — cada `?` dentro de `$(( ))` (só `?`, `&&` e `\|\|` internos somam) | +1 |
| NÃO soma | `${parâmetro:-default}` (é expansão, não desvio), `!`, `then`/`do`/`fi`/`esac`, código de topo fora de função |

### 1.6 Validação dos medidores — casos conhecidos + conferência manual

Os três medidores passaram pelos DOIS casos conhecidos exigidos — função trivial (CC=1) e
função com 3 `if` e 1 `&&` (CC=5) — com o mesmo par de funções traduzido nas três linguagens
(fixtures integrais no [Apêndice D](#apêndice-d--fixtures-de-validação)):

```text
$ node ts-cc.mjs . fixture/casos.ts
fixture/casos.ts  1   trivial              1  ts
fixture/casos.ts  4   tresIfsEUmEComercial  5  ts
$ python3 py-cc.py fixture/casos.py
fixture/casos.py  1   trivial              1  py
fixture/casos.py  4   tres_ifs_e_um_e      5  py
$ python3 sh-cc.py shellscope.py . fixture/casos.sh
fixture/casos.sh  2   trivial                    1  sh
fixture/casos.sh  5   tres_ifs_e_um_e_comercial  5  sh
```

Além dos fixtures, houve **conferência manual em função real**: `applyResearchEvent`
([`app/src/lib/researchProgress.ts:192`](../app/src/lib/researchProgress.ts)) foi contada à
mão — 7 `case`/`default` + 4 `if` + 1 `for` + 7 ternários + 17 `??` + 3 `\|\|` = 39 pontos de
decisão → CC 40 — e o medidor devolveu exatamente **40**.

### 1.7 Limitações declaradas

- **Código de topo não é função.** Script shell cujo roteiro vive no corpo principal (boa parte
  de `tests/validate.sh`, por exemplo: 9 funções medidas, máx CC 4) aparece com pouca
  complexidade de função. A refatoração desses arquivos é guiada pela coluna de linhas (§2),
  não pela §3. Vale para `.mjs`/`.ts` com código de módulo solto na mesma medida.
- **Shell: escopo léxico, não parser.** `shellscope.py` declara em seu cabeçalho o que não
  cobre (continuação por barra invertida dentro de comentário; `$( )` com chave desbalanceada).
  Padrão de `case` detectado por forma (`padrão)` no início da linha); um comando cuja linha
  comece com palavra seguida de `)` dentro de um `case` seria contado como braço — nenhum
  caso assim foi observado no corpus (conferido por amostragem na §5).
- **Nomes anônimos são aproximados.** Duas arrow functions no mesmo argumento encadeado
  podem colidir no nome truncado (ex.: duas linhas `835` em `content/trackTypes.ts` com o
  mesmo rótulo `<callback de (['cadeia', …`); são funções DIFERENTES, ambas contadas — a
  identidade fina é `path:linha`.
- **CC aqui é McCabe por regra própria declarada**, não a de nenhuma ferramenta de terceiro
  (não há `eslint-plugin-complexity` nem `radon` no projeto, e instalar não é permitido).
  Comparações externas de CC podem diferir em ±1 por causa de `default`, `??` e comprehension;
  o que importa para o escopo é a ORDENAÇÃO, e ela é estável entre as três regras.

---

## 2. Arquivos de produção com mais de 500 linhas

96 arquivos (comando M1c). Ordenados por linhas, decrescente.

| path | linhas |
|---|---|
| `app/src/views/LessonView/LessonView.tsx` | 4071 |
| `app/tools/track-engine/cli.ts` | 2466 |
| `app/electron/main/engine/modes/curriculumGap.ts` | 2111 |
| `app/electron/main/engine/fiacao/geraTrilha.ts` | 1950 |
| `app/src/lib/trackLessonState.ts` | 1931 |
| `skills/study-method/scripts/_ensure-toolchain.sh` | 1839 |
| `app/electron/main/engine/modes/convergencia.ts` | 1711 |
| `app/electron/main/engine/modes/reorder.ts` | 1703 |
| `app/electron/main/engine/modes/repair.ts` | 1645 |
| `app/electron/main/db/repo.ts` | 1626 |
| `app/electron/main/engine/lang/c.ts` | 1615 |
| `tests/validate.sh` | 1553 |
| `app/shared/ipc-contract.ts` | 1449 |
| `app/electron/main/engine/audit.ts` | 1397 |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx` | 1395 |
| `app/electron/main/services/e2eStubs.ts` | 1393 |
| `app/electron/main/engine/review/loop.ts` | 1378 |
| `skills/study-method/scripts/render-plot.py` | 1351 |
| `app/electron/main/engine/quality/requirements.ts` | 1347 |
| `app/src/theme.ts` | 1343 |
| `app/electron/main/engine/phases/f6Pilot.ts` | 1341 |
| `app/electron/main/engine/lang/rust.ts` | 1305 |
| `app/electron/main/ipc/track-handlers.ts` | 1248 |
| `tests/spec-conformance.sh` | 1242 |
| `app/electron/main/engine/phases/f2Decompose.ts` | 1219 |
| `app/electron/main/engine/lang/python.ts` | 1217 |
| `app/electron/main/engine/phases/f12Materialize.ts` | 1186 |
| `app/electron/main/engine/extract.ts` | 1147 |
| `app/src/views/ChallengeView/ChallengeView.tsx` | 1143 |
| `skills/study-method/scripts/challenge-verify.sh` | 1127 |
| `skills/study-method/scripts/challenge-new.sh` | 1114 |
| `app/electron/main/engine/phases/f1Research.ts` | 1106 |
| `app/electron/main/engine/phases/f3Graph.ts` | 1106 |
| `skills/study-method/scripts/progress-update.sh` | 1092 |
| `app/electron/main/engine/atomKeys.ts` | 1074 |
| `app/electron/main/engine/lang/javascript.ts` | 1045 |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs` | 1027 |
| `app/electron/main/services/lessonOrchestrator.ts` | 1015 |
| `app/electron/main/engine/lang/registry.ts` | 982 |
| `app/electron/main/services/studyMethodRunner.ts` | 945 |
| `app/electron/main/ipc/study-handlers.ts` | 907 |
| `app/electron/main/engine/quality/progressao.ts` | 902 |
| `app/electron/main/content/trackTypes.ts` | 882 |
| `app/electron/main/engine/quality/minimal.ts` | 849 |
| `app/electron/main/engine/quality/barra.ts` | 842 |
| `app/electron/main/engine/phases/f7Theory.ts` | 840 |
| `app/electron/main/engine/lang/typescript.ts` | 806 |
| `app/tools/track-cli.ts` | 802 |
| `app/electron/main/engine/phases/f8Challenges.ts` | 800 |
| `skills/study-method/scripts/lib/sandbox.sh` | 800 |
| `app/electron/main/engine/phases/f4Budget.ts` | 795 |
| `app/electron/main/engine/vocab/py/extract_ast.py` | 793 |
| `app/electron/main/engine/vocab/c/extract_ast.py` | 787 |
| `app/electron/main/engine/phases/f0Brief.ts` | 763 |
| `tests/lib/assert.sh` | 742 |
| `app/electron/main/engine/revision/progressiva.ts` | 739 |
| `app/electron/main/engine/schemas/artifacts.ts` | 735 |
| `app/electron/main/engine/runtime/runState.ts` | 725 |
| `app/src/lib/dockState.ts` | 721 |
| `tools/emulador-ambiente.sh` | 716 |
| `tests/smoke.sh` | 714 |
| `app/src/views/RoadmapView/RoadmapView.tsx` | 711 |
| `skills/study-method/scripts/docs-index.sh` | 709 |
| `app/src/views/placeholders.tsx` | 702 |
| `app/electron/main/services/quizRemediation.ts` | 688 |
| `app/electron/main/engine/phases/f5Freeze.ts` | 686 |
| `app/electron/main/services/researchPlanner.ts` | 667 |
| `app/electron/main/engine/runtime/ledger.ts` | 663 |
| `app/electron/main/engine/exec/proofs.ts` | 660 |
| `app/electron/main/engine/review/audit2Laco.ts` | 651 |
| `app/src/lib/codeTheme.ts` | 650 |
| `app/electron/main/services/trackService.ts` | 647 |
| `skills/study-method/scripts/lib/_mutate.py` | 638 |
| `app/electron/main/engine/research/camadas.ts` | 636 |
| `app/electron/main/engine/quality/minimalPython.ts` | 632 |
| `app/src/components/quiz/QuizOverlayHost.tsx` | 630 |
| `app/src/features/onboarding/components/OnboardingOverlay.tsx` | 628 |
| `app/electron/main/engine/runtime/callLlm.ts` | 617 |
| `app/src/lib/splitRatio.ts` | 612 |
| `skills/study-method/scripts/readme-sync.sh` | 606 |
| `app/electron/main/engine/runtime/scheduler.ts` | 600 |
| `app/electron/main/services/llmClient.ts` | 573 |
| `app/electron/main/engine/quality/solvable.ts` | 563 |
| `evals/run-evals.sh` | 560 |
| `app/src/lib/designTokens.ts` | 542 |
| `skills/study-method/scripts/lib/common.sh` | 535 |
| `skills/study-method/scripts/memory-compact.sh` | 535 |
| `skills/study-method/scripts/decisions-ask.sh` | 532 |
| `skills/study-method/scripts/memory-digest.sh` | 532 |
| `app/electron/main/engine/quality/judgeCalibration.ts` | 527 |
| `app/electron/main/engine/report/report.ts` | 517 |
| `app/electron/main/engine/quality/minimalRust.ts` | 516 |
| `app/electron/main/engine/quality/minimalC.ts` | 514 |
| `app/electron/main/engine/quality/mutants.ts` | 513 |
| `app/electron/main/engine/review/filter.ts` | 512 |
| `app/electron/main/services/challengeExec.ts` | 504 |

---

## 3. Funções com CC>8 — lista completa

475 funções/métodos (comando M5a sobre `cc-*.tsv`), de 5445 medidos no total. Ordenados por CC,
decrescente. Nenhuma função foi omitida: a lista é gerada por script sobre a medição inteira.

| path:linha | Função | CC | Linguagem |
|---|---|---|---|
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:331` | `Emissor.visitar` | 111 | MJS |
| `app/electron/main/engine/audit.ts:651` | `auditTrack` | 90 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:1437` | `sm_self_test` | 71 | Shell |
| `app/electron/main/engine/modes/repair.ts:1171` | `repararTrilhaInterno` | 69 | TypeScript |
| `app/electron/main/engine/vocab/py/extract_ast.py:478` | `_Emissor._sinteticos` | 62 | Python |
| `app/electron/main/engine/phases/f12Materialize.ts:538` | `montarArvoreDeProduto` | 57 | TypeScript |
| `skills/study-method/scripts/lib/sandbox.sh:386` | `sm_sandbox_run` | 57 | Shell |
| `app/electron/main/engine/quality/progressao.ts:458` | `<callback de aulas.forEach>` | 54 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:972` | `sm_ensure_flow` | 54 | Shell |
| `skills/study-method/scripts/lib/_jsonschema_min.py:79` | `validate` | 53 | Python |
| `skills/study-method/scripts/render-plot.py:397` | `build_series` | 53 | Python |
| `app/electron/main/engine/review/loop.ts:821` | `rodarRodadaInterna` | 52 | TypeScript |
| `app/electron/main/services/lessonOrchestrator.ts:531` | `generateLesson` | 48 | TypeScript |
| `skills/study-method/scripts/render-plot.py:823` | `build_svg` | 46 | Python |
| `skills/study-method/scripts/docs-index.sh:317` | `di_scan` | 45 | Shell |
| `app/src/views/LessonView/LessonView.tsx:1466` | `LessonView` | 44 | TSX |
| `app/electron/main/engine/quality/barra.ts:498` | `auditarBarra` | 43 | TypeScript |
| `app/electron/main/services/llmClient.ts:362` | `chatCompletion` | 43 | TypeScript |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx:396` | `TrackChallengePanel` | 42 | TSX |
| `app/electron/main/engine/modes/curriculumGap.ts:772` | `planejarAulasDeLacuna` | 41 | TypeScript |
| `app/electron/main/engine/modes/curriculumGap.ts:1872` | `fecharLacunasDeCurriculo` | 41 | TypeScript |
| `app/src/lib/researchProgress.ts:192` | `applyResearchEvent` | 40 | TypeScript |
| `app/electron/main/engine/quality/progressao.ts:555` | `<callback de aula.challenges.forEach>` | 38 | TypeScript |
| `skills/study-method/scripts/render-plot.py:562` | `compute_scale` | 38 | Python |
| `app/electron/main/engine/runtime/callLlm.ts:364` | `callLlm` | 35 | TypeScript |
| `app/electron/main/engine/phases/f2Decompose.ts:275` | `validarNoAtomico` | 34 | TypeScript |
| `app/electron/main/engine/phases/f6Pilot.ts:546` | `validarAprovacaoF6` | 34 | TypeScript |
| `app/electron/main/engine/modes/curriculumGap.ts:1448` | `verificarAulaNova` | 33 | TypeScript |
| `app/electron/main/ipc/study-handlers.ts:300` | `listChallengesFrom` | 33 | TypeScript |
| `app/electron/main/ipc/study-handlers.ts:745` | `<callback de map.set>` | 33 | TypeScript |
| `app/electron/main/engine/extract.ts:635` | `visit` | 32 | TypeScript |
| `app/electron/main/engine/modes/convergencia.ts:1529` | `convergirTrilha` | 32 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:900` | `pesquisarSubTopico` | 32 | TypeScript |
| `app/electron/main/engine/vocab/c/extract_ast.py:420` | `_attrs_do_no` | 30 | Python |
| `app/electron/main/engine/vocab/py/extract_ast.py:619` | `_Emissor.visitar` | 30 | Python |
| `app/tools/track-engine/cli.ts:555` | `printHuman` | 30 | TypeScript |
| `evals/run-evals.sh:283` | `check_routing_set` | 30 | Shell |
| `app/electron/main/engine/modes/reorder.ts:703` | `planejarReordenacao` | 29 | TypeScript |
| `app/src/views/ChallengeView/ChallengeView.tsx:112` | `ChallengeView` | 29 | TSX |
| `app/electron/main/content/trackLoader.ts:142` | `loadTrack` | 28 | TypeScript |
| `app/electron/main/engine/quality/minimal.ts:240` | `visit` | 28 | TypeScript |
| `app/electron/main/engine/quality/minimalPython.ts:123` | `decodificarReprDeStringPython` | 28 | TypeScript |
| `app/electron/main/services/challengeRegenerator.ts:276` | `parseDraft` | 28 | TypeScript |
| `app/src/features/onboarding/components/OnboardingOverlay.tsx:137` | `OnboardingOverlay` | 28 | TSX |
| `skills/study-method/scripts/_ensure-toolchain.sh:713` | `sm_detect_family` | 28 | Shell |
| `skills/study-method/scripts/render-plot.py:1219` | `main` | 28 | Python |
| `app/electron/main/engine/phases/f6Pilot.ts:500` | `validarDadosDaAprovacao` | 27 | TypeScript |
| `app/electron/main/engine/vocab/c/extract_ast.py:512` | `_converter` | 27 | Python |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx:854` | `<callback de useCallback>` | 27 | TSX |
| `app/tools/track-engine/cli.ts:1552` | `cmdGenerate` | 27 | TypeScript |
| `skills/study-method/scripts/challenge-verify.sh:684` | `cv_apply_response` | 27 | Shell |
| `app/electron/main/db/repo.ts:676` | `parseRemedialQuiz` | 26 | TypeScript |
| `app/electron/main/engine/graph/dag.ts:131` | `toposort` | 26 | TypeScript |
| `app/electron/main/engine/quality/requirements.ts:243` | `descreverAssert` | 26 | TypeScript |
| `app/electron/main/services/lessonAuthor.ts:282` | `validateChallenge` | 26 | TypeScript |
| `app/src/lib/confetti.ts:178` | `fireConfetti` | 26 | TypeScript |
| `app/tools/track-engine/cli.ts:2212` | `printConvergencia` | 26 | TypeScript |
| `skills/study-method/scripts/lib/json.sh:185` | `sm_apply_read` | 26 | Shell |
| `app/electron/main/content/trackTypes.ts:624` | `<callback de raw.forEach>` | 25 | TypeScript |
| `app/electron/main/engine/quality/minimalPython.ts:287` | `<callback de caminhar>` | 25 | TypeScript |
| `app/electron/main/services/researchPlanner.ts:467` | `plan` | 25 | TypeScript |
| `skills/study-method/scripts/detect-toolchains.sh:228` | `main` | 25 | Shell |
| `skills/study-method/scripts/render-plot.py:323` | `validate` | 25 | Python |
| `app/electron/main/engine/phases/f2Decompose.ts:347` | `<callback de eventos.forEach>` | 24 | TypeScript |
| `app/electron/main/engine/quality/minimalRust.ts:306` | `gerarCandidatosRust` | 24 | TypeScript |
| `app/electron/main/engine/research/qualityGate.ts:102` | `portaoDeQualidade` | 24 | TypeScript |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:939` | `preItens` | 24 | MJS |
| `app/electron/main/services/lessonOrchestrator.ts:926` | `extractCPrototype` | 24 | TypeScript |
| `app/electron/main/services/trackService.ts:559` | `resolveChallengeSpec` | 24 | TypeScript |
| `app/src/views/RoadmapView/RoadmapView.tsx:306` | `RoadmapView` | 24 | TSX |
| `app/tools/track-engine/cli.ts:751` | `cmdBarra` | 24 | TypeScript |
| `app/tools/track-engine/cli.ts:968` | `cmdCoverage` | 24 | TypeScript |
| `app/electron/main/engine/lang/c.ts:567` | `cParseSemCache` | 23 | TypeScript |
| `app/electron/main/services/PiAgentService.ts:139` | `execute` | 23 | TypeScript |
| `app/electron/main/services/quizRemediation.ts:515` | `parseRemedialQuiz` | 23 | TypeScript |
| `app/src/lib/lessonProgress.ts:78` | `parseLessonProgressEvent` | 23 | TypeScript |
| `app/src/lib/trackLessonState.ts:1513` | `hydrateQuizFromHistory` | 23 | TypeScript |
| `skills/study-method/scripts/lib/_mutate.py:350` | `_zero_value` | 23 | Python |
| `skills/study-method/scripts/lib/_mutate.py:459` | `gen_svr` | 23 | Python |
| `skills/study-method/scripts/lib/sandbox.sh:300` | `sm_sandbox_report` | 23 | Shell |
| `app/electron/main/engine/extract.ts:349` | `isValueReference` | 22 | TypeScript |
| `app/electron/main/engine/lang/javascript.ts:769` | `ehReferenciaDeValor` | 22 | TypeScript |
| `app/electron/main/engine/modes/convergencia.ts:853` | `planejarQuebra` | 22 | TypeScript |
| `app/electron/main/engine/quality/minimal.ts:381` | `isEmPosicaoDeValor` | 22 | TypeScript |
| `app/electron/main/engine/research/surfEnvelope.ts:212` | `parseEnvelopeDoSurf` | 22 | TypeScript |
| `app/electron/main/engine/revision/progressiva.ts:404` | `revisarCurso` | 22 | TypeScript |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:792` | `Emissor.nomesImportadosDe` | 22 | MJS |
| `app/electron/main/services/llmJudge.ts:80` | `extractFirstJsonObject` | 22 | TypeScript |
| `app/electron/main/engine/modes/reorder.ts:1393` | `verificarReordenacao` | 21 | TypeScript |
| `app/electron/main/engine/quality/mutants.ts:387` | `validarMutante` | 21 | TypeScript |
| `app/electron/main/engine/research/surfBrief.ts:306` | `montarArgv` | 21 | TypeScript |
| `app/electron/main/services/braveSearchService.ts:124` | `normalizeBraveResults` | 21 | TypeScript |
| `app/electron/main/services/challengeRegenerator.ts:331` | `regenerateChallenge` | 21 | TypeScript |
| `app/electron/main/services/lessonOrchestrator.ts:384` | `materializeChallenge` | 21 | TypeScript |
| `app/electron/main/services/localStt/sttModelStore.ts:258` | `downloadAsset` | 21 | TypeScript |
| `app/src/lib/typewriterSegments.ts:177` | `splitTypewriterSegments` | 21 | TypeScript |
| `app/src/views/ChallengeView/ChallengeView.tsx:617` | `<callback de useCallback>` | 21 | TSX |
| `app/tools/track-cli.ts:466` | `cmdChallengeContext` | 21 | TypeScript |
| `app/tools/track-engine/cli.ts:2315` | `cmdConvergir` | 21 | TypeScript |
| `skills/study-method/scripts/lib/_mutate.py:136` | `mask_source` | 21 | Python |
| `skills/study-method/scripts/render-plot.py:650` | `shape_text` | 21 | Python |
| `app/electron/main/content/trackTypes.ts:823` | `validateTrackChain` | 20 | TypeScript |
| `app/electron/main/engine/lang/rust.ts:902` | `resumoIntegro` | 20 | TypeScript |
| `app/electron/main/engine/modes/convergencia.ts:1434` | `planejarAcoes` | 20 | TypeScript |
| `app/electron/main/engine/phases/f0Brief.ts:524` | `validarBrief` | 20 | TypeScript |
| `app/electron/main/engine/quality/minimalPython.ts:436` | `gerarCandidatosPython` | 20 | TypeScript |
| `app/electron/main/services/braveSearchService.ts:245` | `doSearch` | 20 | TypeScript |
| `app/src/lib/dockState.ts:298` | `dockReducer` | 20 | TypeScript |
| `app/tools/track-engine/cli.ts:1910` | `printReordenacao` | 20 | TypeScript |
| `app/tools/track-engine/cli.ts:2125` | `cmdGap` | 20 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:1350` | `sm_main_run` | 20 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:104` | `cv_parse_args` | 20 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:129` | `cv_step_0_build` | 20 | Shell |
| `skills/study-method/scripts/render-plot.py:1033` | `build_ascii` | 20 | Python |
| `app/electron/main/content/trackTypes.ts:760` | `validateTrackSource` | 19 | TypeScript |
| `app/electron/main/domain/progressEngine.ts:320` | `treeToView` | 19 | TypeScript |
| `app/electron/main/engine/revision/progressiva.ts:657` | `gerarMarkdown` | 19 | TypeScript |
| `app/electron/main/engine/runtime/scheduler.ts:197` | `validateWave` | 19 | TypeScript |
| `app/src/lib/editorFiles.ts:33` | `buildTreeFromFiles` | 19 | TypeScript |
| `app/src/views/LessonView/LessonView.tsx:2847` | `<callback de useCallback>` | 19 | TSX |
| `app/tools/track-engine/cli.ts:687` | `cmdAudit` | 19 | TypeScript |
| `skills/study-method/scripts/challenge-verify.sh:382` | `cv_probe_names` | 19 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:514` | `cv_failing_names` | 19 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:862` | `cv_step_6_counts` | 19 | Shell |
| `app/electron/main/content/trackTypes.ts:519` | `validateChallengeSource` | 18 | TypeScript |
| `app/electron/main/engine/form/selector.ts:375` | `stepMatches` | 18 | TypeScript |
| `app/electron/main/engine/lang/rust.ts:253` | `rsDetect` | 18 | TypeScript |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:155` | `familiaDeTokenEmArvore` | 18 | MJS |
| `app/electron/main/services/localTts/ttsModelStore.ts:201` | `downloadAsset` | 18 | TypeScript |
| `app/src/components/chat/ChatBubble.tsx:140` | `ChatBubble` | 18 | TSX |
| `app/src/lib/sessionState.ts:299` | `sessionReducer` | 18 | TypeScript |
| `app/tools/track-cli.ts:593` | `cmdValidate` | 18 | TypeScript |
| `app/tools/track-engine/cli.ts:1837` | `cmdRepair` | 18 | TypeScript |
| `app/tools/track-engine/cli.ts:2414` | `main` | 18 | TypeScript |
| `app/electron/main/engine/extract.ts:994` | `coletarOcorrencias` | 17 | TypeScript |
| `app/electron/main/engine/lang/python.ts:186` | `pyDetect` | 17 | TypeScript |
| `app/electron/main/engine/modes/reorder.ts:1313` | `verificarComposicaoDosMovimentos` | 17 | TypeScript |
| `app/electron/main/engine/phases/f2Decompose.ts:189` | `carregarVocabulario` | 17 | TypeScript |
| `app/electron/main/engine/quality/minimalC.ts:229` | `<callback de caminharC>` | 17 | TypeScript |
| `app/electron/main/engine/quality/progressao.ts:268` | `visit` | 17 | TypeScript |
| `app/electron/main/engine/quality/requirements.ts:591` | `descreverAssertPy` | 17 | TypeScript |
| `app/electron/main/engine/report/report.ts:448` | `gerarRelatorio` | 17 | TypeScript |
| `app/electron/main/engine/review/filter.ts:413` | `filtrarApontamentos` | 17 | TypeScript |
| `app/electron/main/engine/runtime/runState.ts:267` | `validarFases` | 17 | TypeScript |
| `app/electron/main/engine/vocab/catalog.ts:289` | `montarCatalogo` | 17 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:1185` | `<callback de map.set>` | 17 | TypeScript |
| `app/electron/main/services/PiAgentService.ts:267` | `<callback de agentSession.subscribe>` | 17 | TypeScript |
| `app/electron/main/services/braveSearchService.ts:379` | `worker` | 17 | TypeScript |
| `app/electron/main/services/llmClient.ts:181` | `parseChoiceResult` | 17 | TypeScript |
| `app/electron/main/services/studyMethodRunner.ts:675` | `parseVerifySummary` | 17 | TypeScript |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx:566` | `<callback de withTimeout(call(req), IPC_TIMEOUT_MS, sel.ta…>` | 17 | TSX |
| `app/src/views/LessonView/LessonView.tsx:3529` | `<callback de chat.history.map>` | 17 | TSX |
| `app/tools/track-engine/cli.ts:2054` | `printLacunas` | 17 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:1777` | `main` | 17 | Shell |
| `skills/study-method/scripts/lib/common.sh:374` | `sm_session_lock_alive` | 17 | Shell |
| `skills/study-method/scripts/lib/sandbox.sh:233` | `sm_sandbox_probe` | 17 | Shell |
| `skills/study-method/scripts/lib/sandbox.sh:644` | `sm_sandbox__bwrap_args` | 17 | Shell |
| `app/electron/main/engine/lang/python.ts:807` | `pyCountDeclared` | 16 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:788` | `classificarErroDeFase` | 16 | TypeScript |
| `app/electron/main/engine/phases/f6Pilot.ts:1153` | `rodarRegimeDoExperimento` | 16 | TypeScript |
| `app/electron/main/engine/phases/f7Theory.ts:760` | `runOndaDeAutoria` | 16 | TypeScript |
| `app/electron/main/engine/quality/minimal.ts:336` | `visit` | 16 | TypeScript |
| `app/electron/main/engine/quality/minimal.ts:598` | `gerarCandidatos` | 16 | TypeScript |
| `app/electron/main/engine/schemas/fieldOrder.ts:113` | `caminhar` | 16 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:809` | `<callback de map.set>` | 16 | TypeScript |
| `app/electron/main/services/challengeContextValidator.ts:333` | `parseVerdict` | 16 | TypeScript |
| `app/electron/main/services/lessonAuthor.ts:332` | `validateLessonDraft` | 16 | TypeScript |
| `app/electron/main/services/llmJudge.ts:147` | `judge` | 16 | TypeScript |
| `app/src/components/quiz/QuizChatCard.tsx:114` | `QuizChatCard` | 16 | TSX |
| `app/src/lib/roadmap.ts:102` | `buildRoadmapSections` | 16 | TypeScript |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx:981` | `<callback de useCallback>` | 16 | TSX |
| `app/src/views/LessonView/LessonView.tsx:2019` | `<callback de useEffect>` | 16 | TSX |
| `app/src/views/SettingsView/KeysPanel.tsx:256` | `renderProvider` | 16 | TSX |
| `app/tools/track-cli.ts:751` | `main` | 16 | TypeScript |
| `app/tools/track-engine/cli.ts:1655` | `printPlanoDeReparo` | 16 | TypeScript |
| `app/tools/track-engine/cli.ts:1997` | `cmdReorder` | 16 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:507` | `sm_proof_rust` | 16 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:534` | `cv_step_4_mutation` | 16 | Shell |
| `skills/study-method/scripts/lib/common.sh:263` | `sm_next_seq` | 16 | Shell |
| `app/electron/main/content/trackTypes.ts:698` | `validateLessonSource` | 15 | TypeScript |
| `app/electron/main/engine/fiacao/geraTrilha.ts:906` | `GeradorDeTrilha.executarFaseReal` | 15 | TypeScript |
| `app/electron/main/engine/lang/javascript.ts:746` | `walk` | 15 | TypeScript |
| `app/electron/main/engine/phases/f0Brief.ts:380` | `validarEstruturaAtomos` | 15 | TypeScript |
| `app/electron/main/engine/phases/f3Graph.ts:289` | `expandirDistanciaCurta` | 15 | TypeScript |
| `app/electron/main/engine/quality/minimal.ts:557` | `podarSolucao` | 15 | TypeScript |
| `app/electron/main/engine/quality/minimalRust.ts:154` | `<callback de caminhar>` | 15 | TypeScript |
| `app/electron/main/engine/runtime/runState.ts:340` | `validarRun` | 15 | TypeScript |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:266` | `caminhar` | 15 | MJS |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:808` | `coletarLista` | 15 | MJS |
| `app/electron/main/ipc/track-handlers.ts:597` | `resolveTestsCode` | 15 | TypeScript |
| `app/electron/main/services/answerJudge.ts:207` | `judgeAnswer` | 15 | TypeScript |
| `app/electron/main/services/lessonAuthor.ts:199` | `buildUserPrompt` | 15 | TypeScript |
| `app/electron/main/services/lessonAuthor.ts:414` | `author` | 15 | TypeScript |
| `app/src/components/tree/EvolutionTree.tsx:105` | `TreeNode` | 15 | TSX |
| `app/src/features/onboarding/hooks/useOnboarding.ts:108` | `useOnboarding` | 15 | TypeScript |
| `app/src/main.tsx:87` | `resolveEffectiveScheme` | 15 | TSX |
| `app/src/views/SettingsView/LocalAiPanel.tsx:299` | `<callback de models.map>` | 15 | TSX |
| `app/tools/track-engine/cli.ts:1214` | `cmdRequirements` | 15 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:231` | `sm_snip` | 15 | Shell |
| `skills/study-method/scripts/setup-list.sh:126` | `sl_liveness` | 15 | Shell |
| `tools/emulador-ambiente.sh:562` | `em_scenario` | 15 | Shell |
| `app/electron/main/engine/lang/python.ts:886` | `pyCountRun` | 14 | TypeScript |
| `app/electron/main/engine/lang/rust.ts:195` | `resolverToolchainReal` | 14 | TypeScript |
| `app/electron/main/engine/modes/reorder.ts:1596` | `reordenarTrilha` | 14 | TypeScript |
| `app/electron/main/engine/phases/f12Materialize.ts:1074` | `gFinal` | 14 | TypeScript |
| `app/electron/main/engine/phases/f2Decompose.ts:913` | `decomporAssunto` | 14 | TypeScript |
| `app/electron/main/engine/phases/f8Challenges.ts:647` | `autorizarDesafio` | 14 | TypeScript |
| `app/electron/main/engine/quality/barra.ts:361` | `medirVazamentoDoQuiz` | 14 | TypeScript |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:745` | `Emissor.raizDoUse` | 14 | MJS |
| `app/electron/main/services/apiKeyValidator.ts:290` | `validateLlmKey` | 14 | TypeScript |
| `app/electron/main/services/challengeExec.ts:314` | `runStudentCode` | 14 | TypeScript |
| `app/electron/main/services/e2eStubs.ts:788` | `e2eMarkChallengeAttempt` | 14 | TypeScript |
| `app/electron/main/services/embeddedLlm/hardware.ts:48` | `detectHardware` | 14 | TypeScript |
| `app/electron/main/services/studyMethodRunner.ts:621` | `verifyChallenge` | 14 | TypeScript |
| `app/src/components/challenge/ChallengeGenerateModal.tsx:244` | `<callback de STAGES.map>` | 14 | TSX |
| `app/src/lib/lessonParse.ts:119` | `parseLessonResult` | 14 | TypeScript |
| `app/src/views/RoadmapView/RoadmapView.tsx:82` | `LessonRow` | 14 | TSX |
| `skills/study-method/scripts/challenge-verify.sh:1066` | `main` | 14 | Shell |
| `skills/study-method/scripts/lib/_mutate.py:579` | `main` | 14 | Python |
| `skills/study-method/scripts/lib/common.sh:128` | `sm_setup_root` | 14 | Shell |
| `skills/study-method/scripts/setup-list.sh:75` | `sl_registry_save` | 14 | Shell |
| `tools/emulador-ambiente.sh:646` | `em_main` | 14 | Shell |
| `app/electron/main/db/repo.ts:617` | `parseLessonExercise` | 13 | TypeScript |
| `app/electron/main/engine/fiacao/geraTrilha.ts:815` | `GeradorDeTrilha.executarFase` | 13 | TypeScript |
| `app/electron/main/engine/lang/python.ts:430` | `pyParseSemCache` | 13 | TypeScript |
| `app/electron/main/engine/modes/curriculumGap.ts:1344` | `autorarAulaDeLacuna` | 13 | TypeScript |
| `app/electron/main/engine/modes/repair.ts:806` | `resolverArquivoNaTrilha` | 13 | TypeScript |
| `app/electron/main/engine/modes/repair.ts:1035` | `conteudosFinaisPorArquivo` | 13 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:433` | `normalizarConstrucoesPlanejadas` | 13 | TypeScript |
| `app/electron/main/engine/phases/f3Graph.ts:501` | `caminhoMaisCurtoConfirmado` | 13 | TypeScript |
| `app/electron/main/engine/quality/minimal.ts:400` | `coletar` | 13 | TypeScript |
| `app/electron/main/engine/quality/requirements.ts:209` | `visit` | 13 | TypeScript |
| `app/electron/main/engine/report/report.ts:326` | `montarJustificativa` | 13 | TypeScript |
| `app/electron/main/engine/research/camadas.ts:268` | `umaCamada` | 13 | TypeScript |
| `app/electron/main/engine/research/surfEnvelope.ts:409` | `fontesDoEnvelope` | 13 | TypeScript |
| `app/electron/main/engine/review/loop.ts:1313` | `rodarLacoDeRevisao` | 13 | TypeScript |
| `app/electron/main/engine/review/prover.ts:347` | `extrairProvasDoArtefato` | 13 | TypeScript |
| `app/electron/main/engine/runtime/ledger.ts:395` | `verificarCadeia` | 13 | TypeScript |
| `app/electron/main/engine/vocab/py/extract_ast.py:288` | `_resolver_escopos` | 13 | Python |
| `app/electron/main/ipc/study-handlers.ts:569` | `<callback de map.set>` | 13 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:502` | `isValidChallengeError` | 13 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:653` | `submitter` | 13 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:1052` | `<callback de map.set>` | 13 | TypeScript |
| `app/electron/main/services/studyMethodRunner.ts:824` | `mapRunnerOutput` | 13 | TypeScript |
| `app/src/components/quiz/QuizOverlayHost.tsx:204` | `QuizOverlayHost` | 13 | TSX |
| `app/src/lib/dockState.ts:639` | `readDockPersistedState` | 13 | TypeScript |
| `app/src/lib/splitRatio.ts:455` | `readRatioFrom` | 13 | TypeScript |
| `app/src/views/ChallengeView/ChallengeView.tsx:470` | `<callback de useCallback>` | 13 | TSX |
| `app/src/views/LessonView/LessonView.tsx:1051` | `LessonActionRow` | 13 | TSX |
| `app/src/views/LessonView/LessonView.tsx:2360` | `<callback de useCallback>` | 13 | TSX |
| `skills/study-method/scripts/_ensure-toolchain.sh:1172` | `sm_stderr_summary` | 13 | Shell |
| `skills/study-method/scripts/detect-toolchains.sh:177` | `sm_build_json` | 13 | Shell |
| `skills/study-method/scripts/lib/_mutate.py:389` | `_functions` | 13 | Python |
| `skills/study-method/scripts/lib/sandbox.sh:756` | `sm_sandbox_classify_exit` | 13 | Shell |
| `skills/study-method/scripts/render-plot.py:712` | `build_description` | 13 | Python |
| `tools/check-trilha-c.mjs:184` | `parseDoc` | 13 | MJS |
| `app/electron/main/domain/hintEngine.ts:100` | `buildBreakPlan` | 12 | TypeScript |
| `app/electron/main/engine/budget.ts:234` | `<callback de ordered.forEach>` | 12 | TypeScript |
| `app/electron/main/engine/fiacao/geraTrilha.ts:465` | `<callback de opts.freeze.snapshots.map>` | 12 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:490` | `gCoverPesq` | 12 | TypeScript |
| `app/electron/main/engine/phases/f3Graph.ts:583` | `reconciliarRedundantes` | 12 | TypeScript |
| `app/electron/main/engine/phases/f3Graph.ts:699` | `escreverGrafo` | 12 | TypeScript |
| `app/electron/main/engine/phases/f3Graph.ts:1026` | `rodarF3` | 12 | TypeScript |
| `app/electron/main/engine/phases/f4Budget.ts:445` | `deriveBudgetDoGrafo` | 12 | TypeScript |
| `app/electron/main/engine/phases/f6Pilot.ts:301` | `selecionarAulasDoPiloto` | 12 | TypeScript |
| `app/electron/main/engine/phases/f6Pilot.ts:888` | `resumoParaOndasSeguintes` | 12 | TypeScript |
| `app/electron/main/engine/quality/barra.ts:235` | `lerDerivadas` | 12 | TypeScript |
| `app/electron/main/engine/quality/minimalC.ts:428` | `sintetizarCodigoMinimoC` | 12 | TypeScript |
| `app/electron/main/engine/quality/minimalPython.ts:547` | `sintetizarCodigoMinimoPython` | 12 | TypeScript |
| `app/electron/main/engine/quality/minimalRust.ts:258` | `partirArgumentos` | 12 | TypeScript |
| `app/electron/main/engine/quality/minimalRust.ts:433` | `sintetizarCodigoMinimoRust` | 12 | TypeScript |
| `app/electron/main/engine/research/surfBrief.ts:202` | `montarBrief` | 12 | TypeScript |
| `app/electron/main/engine/review/audit2Laco.ts:217` | `localizarValoresDeStringNoJson` | 12 | TypeScript |
| `app/electron/main/engine/runtime/scheduler.ts:446` | `applyReducer` | 12 | TypeScript |
| `app/electron/main/ipc/study-handlers.ts:839` | `<callback de map.set>` | 12 | TypeScript |
| `app/electron/main/services/embeddedLlm/llmEngine.process.ts:193` | `EngineRuntime.handle` | 12 | TypeScript |
| `app/electron/main/services/mathLib.ts:117` | `parseMathAnswer` | 12 | TypeScript |
| `app/src/components/quiz/quizOverlayContent.ts:150` | `isSameContent` | 12 | TypeScript |
| `app/src/features/onboarding/logic/evaluateStepAction.ts:49` | `evaluateStepAction` | 12 | TypeScript |
| `app/src/features/onboarding/utils/onboardingPositioning.utils.ts:342` | `scrollTargetIntoView` | 12 | TypeScript |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx:1066` | `<callback de useCallback>` | 12 | TSX |
| `skills/study-method/scripts/_ensure-toolchain.sh:595` | `sm_proof_c` | 12 | Shell |
| `skills/study-method/scripts/session-close.sh:96` | `sc_pick_session` | 12 | Shell |
| `skills/study-method/scripts/setup-init.sh:101` | `si_registry_upsert` | 12 | Shell |
| `app/electron/main/domain/lessonEngine.ts:71` | `splitParagraphs` | 11 | TypeScript |
| `app/electron/main/domain/progressEngine.ts:217` | `breakIntoChildren` | 11 | TypeScript |
| `app/electron/main/engine/lang/c.ts:269` | `cDetect` | 11 | TypeScript |
| `app/electron/main/engine/lang/javascript.ts:429` | `atributosDoNo` | 11 | TypeScript |
| `app/electron/main/engine/lang/rust.ts:504` | `rsParseSemCache` | 11 | TypeScript |
| `app/electron/main/engine/modes/convergencia.ts:496` | `classificarAchados` | 11 | TypeScript |
| `app/electron/main/engine/modes/reorder.ts:912` | `aplicarMovimentos` | 11 | TypeScript |
| `app/electron/main/engine/modes/repair.ts:244` | `projetarArtefatosNaVistaDoP35` | 11 | TypeScript |
| `app/electron/main/engine/modes/repair.ts:857` | `montarArtefatos` | 11 | TypeScript |
| `app/electron/main/engine/phases/f4Budget.ts:358` | `validarPlano` | 11 | TypeScript |
| `app/electron/main/engine/phases/f6Pilot.ts:1283` | `medir10x10` | 11 | TypeScript |
| `app/electron/main/engine/phases/f7Theory.ts:298` | `resumoDaTeoria` | 11 | TypeScript |
| `app/electron/main/engine/phases/f7Theory.ts:439` | `comAutorTeoria` | 11 | TypeScript |
| `app/electron/main/engine/phases/f8Challenges.ts:275` | `montarDossieDeDesafio` | 11 | TypeScript |
| `app/electron/main/engine/prompts/dossier.ts:158` | `montarDossie` | 11 | TypeScript |
| `app/electron/main/engine/quality/discriminacao.ts:252` | `avaliarDiscriminacaoDeDesafio` | 11 | TypeScript |
| `app/electron/main/engine/quality/minimal.ts:700` | `sintetizarCodigoMinimo` | 11 | TypeScript |
| `app/electron/main/engine/quality/minimalC.ts:326` | `gerarCandidatosC` | 11 | TypeScript |
| `app/electron/main/engine/quality/progressao.ts:324` | `blocosDaSecao` | 11 | TypeScript |
| `app/electron/main/engine/quality/requirements.ts:298` | `visit` | 11 | TypeScript |
| `app/electron/main/engine/quality/requirements.ts:325` | `visit` | 11 | TypeScript |
| `app/electron/main/engine/quality/requirements.ts:1095` | `descreverAssertRust` | 11 | TypeScript |
| `app/electron/main/engine/quality/solvable.ts:391` | `simularAluno` | 11 | TypeScript |
| `app/electron/main/engine/research/surfEnvelope.ts:333` | `normalizarRow` | 11 | TypeScript |
| `app/electron/main/engine/runtime/jsonTail.ts:64` | `separarJsonECauda` | 11 | TypeScript |
| `app/electron/main/engine/runtime/ledger.ts:259` | `validarPayload` | 11 | TypeScript |
| `app/electron/main/engine/runtime/ledger.ts:301` | `validarLinha` | 11 | TypeScript |
| `app/electron/main/engine/vocab/c/extract_ast.py:300` | `_offset_inicio` | 11 | Python |
| `app/electron/main/engine/vocab/py/extract_ast.py:715` | `analisar` | 11 | Python |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:773` | `coletar` | 11 | MJS |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:900` | `analisar` | 11 | MJS |
| `app/electron/main/ipc/pi-handlers.ts:51` | `validatePiExecuteRequest` | 11 | TypeScript |
| `app/electron/main/ipc/study-handlers.ts:236` | `languageForFile` | 11 | TypeScript |
| `app/electron/main/ipc/study-handlers.ts:427` | `normalizeGenerateLessonPayload` | 11 | TypeScript |
| `app/electron/main/ipc/study-handlers.ts:464` | `<callback de map.set>` | 11 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:738` | `<callback de map.set>` | 11 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:1169` | `quizRemedialValido` | 11 | TypeScript |
| `app/electron/main/services/e2eStubs.ts:963` | `<callback de map.set>` | 11 | TypeScript |
| `app/electron/main/services/lessonAuthor.ts:269` | `validateScenario` | 11 | TypeScript |
| `app/electron/main/services/lessonOrchestrator.ts:108` | `mapLanguageExtension` | 11 | TypeScript |
| `app/electron/main/services/llmClient.ts:322` | `renderSanitizedBodyFragment` | 11 | TypeScript |
| `app/electron/main/services/localStt/asrEngine.process.ts:41` | `handle` | 11 | TypeScript |
| `app/electron/main/services/localStt/sttModelStore.ts:339` | `downloadModel` | 11 | TypeScript |
| `app/electron/main/services/localTts/ttsModelStore.ts:268` | `downloadModel` | 11 | TypeScript |
| `app/electron/main/services/studyMethodRunner.ts:409` | `extractRequest` | 11 | TypeScript |
| `app/electron/main/services/studyMethodRunner.ts:488` | `handleExit10` | 11 | TypeScript |
| `app/src/lib/dockState.ts:455` | `dockActionForKey` | 11 | TypeScript |
| `app/src/lib/trackLessonState.ts:493` | `chatDaySeparator` | 11 | TypeScript |
| `app/src/lib/trackLessonState.ts:946` | `quizCycleOf` | 11 | TypeScript |
| `app/src/lib/typewriterSegments.ts:294` | `codeSpans` | 11 | TypeScript |
| `app/src/views/LessonView/LessonView.tsx:3645` | `<callback de (quizzesByIndex.get(i) ?? []).map>` | 11 | TSX |
| `app/src/views/SettingsView/OrphanTracksPanel.tsx:79` | `OrphanTracksPanel` | 11 | TSX |
| `skills/study-method/scripts/challenge-new.sh:370` | `ch_alocar_id` | 11 | Shell |
| `skills/study-method/scripts/decisions-ask.sh:178` | `da_print_block` | 11 | Shell |
| `skills/study-method/scripts/decisions-ask.sh:251` | `da_write_answer` | 11 | Shell |
| `skills/study-method/scripts/lib/_mutate.py:312` | `gen_sdl` | 11 | Python |
| `skills/study-method/scripts/lib/common.sh:451` | `sm_setup_lock` | 11 | Shell |
| `skills/study-method/scripts/lib/sandbox.sh:186` | `sm_sandbox__probe_all` | 11 | Shell |
| `skills/study-method/scripts/render-plot.py:767` | `marker_svg` | 11 | Python |
| `tests/lib/assert.sh:536` | `gate_summary` | 11 | Shell |
| `app/electron/main/content/trackTypes.ts:584` | `validateTheorySection` | 10 | TypeScript |
| `app/electron/main/db/migrate.ts:95` | `migrate` | 10 | TypeScript |
| `app/electron/main/db/repo.ts:890` | `<callback de withTransaction>` | 10 | TypeScript |
| `app/electron/main/domain/progressEngine.ts:137` | `nextStep` | 10 | TypeScript |
| `app/electron/main/engine/fiacao/geraTrilha.ts:1387` | `GeradorDeTrilha.faseF12` | 10 | TypeScript |
| `app/electron/main/engine/fiacao/geraTrilha.ts:1847` | `<anônima em criarVerificadorDeOrcamentoDosDrafts>` | 10 | TypeScript |
| `app/electron/main/engine/form/selector.ts:197` | `tokenize` | 10 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:409` | `validarConstrucaoPlanejada` | 10 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:460` | `normalizarConcepcoesPlanejadas` | 10 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:546` | `validarEntrada` | 10 | TypeScript |
| `app/electron/main/engine/phases/f3Graph.ts:915` | `derivarOrcamentoPorPar` | 10 | TypeScript |
| `app/electron/main/engine/phases/f4Budget.ts:302` | `validarOrdem` | 10 | TypeScript |
| `app/electron/main/engine/phases/f4Budget.ts:576` | `checarGMonotonicidade` | 10 | TypeScript |
| `app/electron/main/engine/phases/f5Freeze.ts:488` | `congelar` | 10 | TypeScript |
| `app/electron/main/engine/phases/f5Freeze.ts:563` | `reverificarConteudoFreeze` | 10 | TypeScript |
| `app/electron/main/engine/phases/f6Pilot.ts:796` | `rodarPiloto` | 10 | TypeScript |
| `app/electron/main/engine/quality/barra.ts:427` | `agruparPorLinha` | 10 | TypeScript |
| `app/electron/main/engine/quality/minimalPython.ts:177` | `literalPythonDeString` | 10 | TypeScript |
| `app/electron/main/engine/quality/progressao.ts:353` | `<callback de secoes.forEach>` | 10 | TypeScript |
| `app/electron/main/engine/review/audit2Laco.ts:536` | `<anônima em criarVerificadorDeOrcamentoDaTrilha>` | 10 | TypeScript |
| `app/electron/main/engine/review/prover.ts:239` | `PinsDeRegressao.aferir` | 10 | TypeScript |
| `app/electron/main/engine/runtime/scheduler.ts:501` | `runWave` | 10 | TypeScript |
| `app/electron/main/engine/theoryCode.ts:127` | `extractFencedBlocks` | 10 | TypeScript |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:296` | `Emissor.tipoDeLiteral` | 10 | MJS |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:317` | `Emissor.chaveApi` | 10 | MJS |
| `app/electron/main/engine/vocab/rs/gerar_inventario.mjs:81` | `caminhar` | 10 | MJS |
| `app/electron/main/ipc/localAi-handlers.ts:171` | `<callback de map.set>` | 10 | TypeScript |
| `app/electron/main/ipc/localTts-handlers.ts:229` | `<callback de map.set>` | 10 | TypeScript |
| `app/electron/main/ipc/study-handlers.ts:806` | `<callback de map.set>` | 10 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:376` | `<callback de map.set>` | 10 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:521` | `<callback de map.set>` | 10 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:1133` | `<callback de map.set>` | 10 | TypeScript |
| `app/electron/main/services/answerJudge.ts:142` | `attemptLlm` | 10 | TypeScript |
| `app/electron/main/services/e2eStubs.ts:921` | `<callback de fixtureCriticalSection>` | 10 | TypeScript |
| `app/electron/main/services/e2eStubs.ts:971` | `<callback de withFixtureTrack>` | 10 | TypeScript |
| `app/electron/main/services/embeddedLlm/modelStore.ts:192` | `download` | 10 | TypeScript |
| `app/electron/main/services/localTts/PocketTtsService.ts:156` | `<callback de this.run>` | 10 | TypeScript |
| `app/electron/main/services/piProviderMapper.ts:77` | `mapThinkingLevelToPiSdk` | 10 | TypeScript |
| `app/electron/main/services/quizRemediation.ts:313` | `assertionIsUsable` | 10 | TypeScript |
| `app/src/components/challenge/ChallengeGenerateModal.tsx:95` | `ChallengeGenerateModal` | 10 | TSX |
| `app/src/components/quiz/QuizOverlayHost.tsx:287` | `onKeyDown` | 10 | TSX |
| `app/src/features/onboarding/services/onboardingAudio.service.ts:67` | `speakOnboardingText` | 10 | TypeScript |
| `app/src/features/onboarding/utils/onboardingPositioning.utils.ts:212` | `calculatePanelPosition` | 10 | TypeScript |
| `app/src/lib/answerFlow.ts:155` | `shouldMarkAttempt` | 10 | TypeScript |
| `app/src/lib/editorTabs.ts:56` | `editorTabsReducer` | 10 | TypeScript |
| `app/src/lib/lessonMarkdown.ts:61` | `escapeDollarSignsInLine` | 10 | TypeScript |
| `app/src/lib/lessonParse.ts:75` | `normalizeLesson` | 10 | TypeScript |
| `app/src/lib/validationMessages.ts:26` | `humanizeValidationError` | 10 | TypeScript |
| `app/src/views/ChallengeView/ChallengeView.tsx:586` | `<callback de useCallback>` | 10 | TSX |
| `app/src/views/LessonView/LessonQuiz.tsx:78` | `LessonQuizCard` | 10 | TSX |
| `app/src/views/LessonView/LessonView.tsx:992` | `lessonActionStatusKey` | 10 | TSX |
| `app/src/views/LessonView/LessonView.tsx:2240` | `<callback de useCallback>` | 10 | TSX |
| `app/src/views/LessonView/LessonView.tsx:2606` | `<callback de useMemo>` | 10 | TSX |
| `app/tools/track-engine/cli.ts:923` | `auditarDesafioCoverage` | 10 | TypeScript |
| `skills/study-method/scripts/challenge-verify.sh:215` | `cv_layout_for_language` | 10 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:924` | `cv_step_7_verdict` | 10 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:957` | `cv_write_meta` | 10 | Shell |
| `skills/study-method/scripts/lib/_jsonschema_min.py:61` | `type_matches` | 10 | Python |
| `skills/study-method/scripts/lib/common.sh:94` | `sm_require_cmd` | 10 | Shell |
| `skills/study-method/scripts/render-plot.py:1002` | `bres` | 10 | Python |
| `app/electron/main/content/trackTypes.ts:553` | `<callback de c.files.forEach>` | 9 | TypeScript |
| `app/electron/main/engine/atomKeys.ts:127` | `axisOf` | 9 | TypeScript |
| `app/electron/main/engine/audit.ts:361` | `challengeSurfaces` | 9 | TypeScript |
| `app/electron/main/engine/fiacao/geraTrilha.ts:696` | `GeradorDeTrilha.prepararRun` | 9 | TypeScript |
| `app/electron/main/engine/fiacao/geraTrilha.ts:960` | `GeradorDeTrilha.faseF1` | 9 | TypeScript |
| `app/electron/main/engine/form/selector.ts:251` | `parseFilter` | 9 | TypeScript |
| `app/electron/main/engine/graph/invariants.ts:419` | `<callback de visao.aulas.forEach>` | 9 | TypeScript |
| `app/electron/main/engine/lang/javascript.ts:398` | `tabelaDeNomesDeKind` | 9 | TypeScript |
| `app/electron/main/engine/lang/typescript.ts:285` | `tsChaveSintetica` | 9 | TypeScript |
| `app/electron/main/engine/modes/repair.ts:553` | `agregarLacunas` | 9 | TypeScript |
| `app/electron/main/engine/phases/f0Brief.ts:321` | `noZodParaLlm` | 9 | TypeScript |
| `app/electron/main/engine/phases/f12Materialize.ts:901` | `materializarTrilha` | 9 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:519` | `validarConfig` | 9 | TypeScript |
| `app/electron/main/engine/phases/f1Research.ts:664` | `falhaInaveitavelDoPlanejador` | 9 | TypeScript |
| `app/electron/main/engine/phases/f4Budget.ts:640` | `<callback de budget.aulas.forEach>` | 9 | TypeScript |
| `app/electron/main/engine/phases/f6Pilot.ts:1000` | `auditarTrilhaDeBrinquedo` | 9 | TypeScript |
| `app/electron/main/engine/quality/discriminacao.ts:432` | `linhasDeDiscriminacao` | 9 | TypeScript |
| `app/electron/main/engine/quality/judgeCalibration.ts:136` | `apontamentoDetectaDefeito` | 9 | TypeScript |
| `app/electron/main/engine/quality/solvable.ts:357` | `parseRespostaDoAluno` | 9 | TypeScript |
| `app/electron/main/engine/research/surfBrief.ts:145` | `validarContexto` | 9 | TypeScript |
| `app/electron/main/engine/review/filter.ts:279` | `r5ExigeReproducao` | 9 | TypeScript |
| `app/electron/main/engine/review/loop.ts:781` | `chamarSeguro` | 9 | TypeScript |
| `app/electron/main/engine/review/prover.ts:375` | `trechoOfensorDoAchado` | 9 | TypeScript |
| `app/electron/main/engine/runtime/backoff.ts:128` | `backoffDelayMs` | 9 | TypeScript |
| `app/electron/main/engine/runtime/ledger.ts:147` | `canonicalizarJson` | 9 | TypeScript |
| `app/electron/main/engine/theoryCode.ts:214` | `collectLessonCode` | 9 | TypeScript |
| `app/electron/main/engine/vocab/c/extract_ast.py:638` | `_coletar_declarados.passe` | 9 | Python |
| `app/electron/main/engine/vocab/rs/extract_ast.mjs:708` | `Emissor.marcadoTeste` | 9 | MJS |
| `app/electron/main/ipc/startup-handlers.ts:70` | `classifyStartup` | 9 | TypeScript |
| `app/electron/main/ipc/stt-model-handlers.ts:106` | `downloadLocalSttModel` | 9 | TypeScript |
| `app/electron/main/ipc/track-handlers.ts:446` | `<callback de map.set>` | 9 | TypeScript |
| `app/electron/main/services/answerJudge.ts:123` | `parseVerdictOutcome` | 9 | TypeScript |
| `app/electron/main/services/answerJudge.ts:179` | `attemptEmbedded` | 9 | TypeScript |
| `app/electron/main/services/apiKeyValidator.ts:320` | `<callback de withFetchTimeout>` | 9 | TypeScript |
| `app/electron/main/services/challengeContextValidator.ts:157` | `buildChallengeContext` | 9 | TypeScript |
| `app/electron/main/services/challengeExec.ts:460` | `verifyChallengePair` | 9 | TypeScript |
| `app/electron/main/services/e2eStubs.ts:900` | `<callback de withFixtureTrack>` | 9 | TypeScript |
| `app/electron/main/services/e2eStubs.ts:1193` | `<callback de map.set>` | 9 | TypeScript |
| `app/electron/main/services/embeddedLlm/LlmProxyService.ts:240` | `LlmProxyService.onMessage` | 9 | TypeScript |
| `app/electron/main/services/lessonOrchestrator.ts:484` | `writeMeta` | 9 | TypeScript |
| `app/electron/main/services/llmClient.ts:151` | `extractReasoningDetailsText` | 9 | TypeScript |
| `app/electron/main/services/llmClient.ts:222` | `extractErrorText` | 9 | TypeScript |
| `app/electron/main/services/localStt/sttModelStore.ts:201` | `listInstalled` | 9 | TypeScript |
| `app/electron/main/services/localTts/PocketTtsService.ts:70` | `readWavInfo` | 9 | TypeScript |
| `app/electron/main/services/quizRemediation.ts:266` | `rotateOptions` | 9 | TypeScript |
| `app/electron/main/services/quizRemediation.ts:651` | `remedial` | 9 | TypeScript |
| `app/electron/main/services/studyMethodRunner.ts:444` | `isRequestEnvelope` | 9 | TypeScript |
| `app/electron/main/services/tutorChat.ts:187` | `tutorChat` | 9 | TypeScript |
| `app/src/components/markdown/MarkdownView.tsx:57` | `flattenText` | 9 | TSX |
| `app/src/features/onboarding/components/OnboardingOverlay.tsx:229` | `blockInteraction` | 9 | TSX |
| `app/src/features/onboarding/services/onboardingStorage.service.ts:72` | `isValidPayload` | 9 | TypeScript |
| `app/src/lib/challengeGenerateStore.ts:202` | `applyChallengeGenerateProgress` | 9 | TypeScript |
| `app/src/lib/quizOverlayState.ts:123` | `commit` | 9 | TypeScript |
| `app/src/lib/sessionState.ts:93` | `isSessionBusySignal` | 9 | TypeScript |
| `app/src/lib/sessionState.ts:163` | `lessonBusyReasonFor` | 9 | TypeScript |
| `app/src/lib/splitRatio.ts:335` | `nextRatioForKey` | 9 | TypeScript |
| `app/src/lib/trackLessonState.ts:277` | `applyTutorReply` | 9 | TypeScript |
| `app/src/views/LessonView/LessonView.tsx:544` | `LessonComposer` | 9 | TSX |
| `app/tools/track-cli.ts:177` | `cmdTrackNew` | 9 | TypeScript |
| `app/tools/track-engine/cli.ts:1129` | `cmdDiscrimination` | 9 | TypeScript |
| `app/tools/track-engine/cli.ts:1318` | `cmdRevise` | 9 | TypeScript |
| `skills/study-method/scripts/_ensure-toolchain.sh:809` | `sm_install_cmdline` | 9 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:278` | `cv_harden_argv` | 9 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:302` | `cv_execute` | 9 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:340` | `cv_probe_counts` | 9 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:483` | `cv_step_3_alternatives` | 9 | Shell |
| `skills/study-method/scripts/challenge-verify.sh:777` | `cv_close_mutation_score` | 9 | Shell |
| `skills/study-method/scripts/lib/common.sh:166` | `sm_normalize_concept_id` | 9 | Shell |
| `skills/study-method/scripts/lib/common.sh:235` | `sm_atomic_write` | 9 | Shell |
| `skills/study-method/scripts/lib/common.sh:318` | `sm_registry_lock` | 9 | Shell |
| `tests/smoke.sh:277` | `run_protocol` | 9 | Shell |

---

## 4. Arquivos de teste com mais de 500 linhas

Testes não são alvo de refatoração de CC (§1.1) — mas arquivo de teste >500 linhas pesa no
mesmo orçamento de manutenção e está listado aqui. 85 arquivos sob `app/tests` (comando M1f).
A base da suíte (§7) avisa quais falhas já existiam ANTES desta onda: refatorar com testes
verdes é o alvo; estas três falhas não são culpa da refatoração nem desta medição.

| path | linhas |
|---|---|
| `app/tests/theme.test.ts` | 1872 |
| `app/tests/track-handlers.test.ts` | 1436 |
| `app/tests/challengeDraftCache.test.ts` | 1359 |
| `app/tests/engineCurriculumGap.test.ts` | 1338 |
| `app/tests/study-handlers.test.ts` | 1295 |
| `app/tests/engineLangRust.test.ts` | 1289 |
| `app/tests/engineReorder.test.ts` | 1255 |
| `app/tests/engineRepair.test.ts` | 1182 |
| `app/tests/engineReviewLoop.test.ts` | 1177 |
| `app/tests/engineExecProofs.test.ts` | 1167 |
| `app/tests/engineLangC.test.ts` | 1162 |
| `app/tests/engineLangPython.test.ts` | 1130 |
| `app/tests/engineFreeze.test.ts` | 1120 |
| `app/tests/engineResearchCamadas.test.ts` | 1043 |
| `app/tests/e2e/e2e-desafio-retomar.spec.ts` | 1041 |
| `app/tests/engineOnda1Integracao.test.ts` | 1041 |
| `app/tests/lessonOrchestrator.test.ts` | 1023 |
| `app/tests/engineLangTypescript.test.ts` | 976 |
| `app/tests/lessonChatLayout.test.ts` | 967 |
| `app/tests/engineAuthoring.test.ts` | 943 |
| `app/tests/enginePilot.test.ts` | 921 |
| `app/tests/quizOverlayWiring.test.ts` | 918 |
| `app/tests/trackServices.test.ts` | 874 |
| `app/tests/dockState.test.ts` | 871 |
| `app/tests/engineFiacaoCli.test.ts` | 866 |
| `app/tests/engineGenerate.test.ts` | 865 |
| `app/tests/engineAuditC.test.ts` | 862 |
| `app/tests/engineReviewer.test.ts` | 858 |
| `app/tests/lessonActionRow.test.ts` | 855 |
| `app/tests/engineF1Research.test.ts` | 842 |
| `app/tests/quizVerdictCycle.test.ts` | 836 |
| `app/tests/engineF2Decompose.test.ts` | 817 |
| `app/tests/quizRemediation.test.ts` | 814 |
| `app/tests/engineGatesC.test.ts` | 811 |
| `app/tests/engineForm.test.ts` | 793 |
| `app/tests/engineBarra.test.ts` | 777 |
| `app/tests/engineVocab.test.ts` | 777 |
| `app/tests/engineLangCDetalhes.test.ts` | 770 |
| `app/tests/quizOverlayRender.test.ts` | 770 |
| `app/tests/engineParalelismo.test.ts` | 765 |
| `app/tests/splitRatio.test.ts` | 760 |
| `app/tests/e2e/e2e-quiz.spec.ts` | 751 |
| `app/tests/engineMaterialize.test.ts` | 748 |
| `app/tests/engineScheduler.test.ts` | 740 |
| `app/tests/engineLangRegistry.test.ts` | 733 |
| `app/tests/codeTheme.test.ts` | 710 |
| `app/tests/engineConvergencia.test.ts` | 710 |
| `app/tests/trilhaCIntegrada.test.ts` | 709 |
| `app/tests/engineMutants.test.ts` | 707 |
| `app/tests/engineExtractMultilingua.test.ts` | 705 |
| `app/tests/engineBudgetGate.test.ts` | 664 |
| `app/tests/trackLoader.test.ts` | 662 |
| `app/tests/e2e/e2e-sidebar-aula-spacing.spec.ts` | 660 |
| `app/tests/llmClient.test.ts` | 657 |
| `app/tests/engineCallLlm.test.ts` | 654 |
| `app/tests/engineLedger.test.ts` | 648 |
| `app/tests/trackService.test.ts` | 644 |
| `app/tests/quizHistoryHydration.test.ts` | 641 |
| `app/tests/quizStalledExit.test.ts` | 636 |
| `app/tests/engineF0.test.ts` | 634 |
| `app/tests/engineGraph.test.ts` | 630 |
| `app/tests/studyMethodRunner.test.ts` | 630 |
| `app/tests/enginePlanner.test.ts` | 605 |
| `app/tests/PiAgentService.test.ts` | 603 |
| `app/tests/engineRevision.test.ts` | 603 |
| `app/tests/db/repo.test.ts` | 599 |
| `app/tests/lessonWidthCoverage.test.ts` | 598 |
| `app/tests/engineProgressao.test.ts` | 593 |
| `app/tests/chatBubbleSurface.test.ts` | 589 |
| `app/tests/study-wiring.test.ts` | 589 |
| `app/tests/trackLessonState.test.ts` | 587 |
| `app/tests/quizOverlayCycle.test.ts` | 586 |
| `app/tests/e2e/e2e-autoscroll-fim.spec.ts` | 581 |
| `app/tests/challengeContextValidator.test.ts` | 579 |
| `app/tests/enginePromptAuthor.test.ts` | 578 |
| `app/tests/lessonAutoScroll.test.ts` | 576 |
| `app/tests/shellSplitMath.test.ts` | 570 |
| `app/tests/engineF3Graph.test.ts` | 568 |
| `app/tests/quizHandlers.test.ts` | 566 |
| `app/tests/researchPlanner.test.ts` | 561 |
| `app/tests/engineAudit2Laco.test.ts` | 554 |
| `app/tests/typewriterSegments.test.ts` | 537 |
| `app/tests/engineF9Verifier.test.ts` | 524 |
| `app/tests/panelCacheSwr.test.ts` | 518 |
| `app/tests/engineRepairCli.test.ts` | 508 |

---

## 5. Lotes de refatoração propostos

### 5.1 Critério

- **Alvo de um lote** = união dos dois gatilhos da missão: arquivo >500 linhas **ou** arquivo
  com pelo menos uma função CC>8. São 178 arquivos (M5b), distribuídos em 17 lotes.
- **Coesão primeiro, tamanho depois**: um lote é um módulo que se refatora e se testa como
  unidade (mesma pasta/tema, acoplamento alto entre si). O alvo é 10–14 arquivos por lote;
  três lotes ficaram com 7–9 porque o módulo coeso é menor que o intervalo — melhor um lote
  pequeno e coeso que um lote de 12 arquivos de três domínios. [INFERÊNCIA]
- **Cada lote é refatorado com testes ANTES**: escrever/ampliar a suíte do módulo, garantir
  verde (exceto as 3 falhas pré-existentes da §7), e só então refatorar — o contrato
  [`00-contratos.md`](00-contratos.md) e os 5 gates continuam valendo em cada lote.
- A tabela de cada lote mostra, por arquivo: linhas (M1), nº de funções CC>8 (M5a) e o maior
  CC medido — é a ordem natural de ataque dentro do lote.

### 5.2 Ordem sugerida de execução

| Ordem | Lote | Por quê |
|---|---|---|
| 1 | L05 | começar por aqui: núcleo de revisão/auditoria, módulos médios e com testes granulares já existentes (engineReviewLoop, engineAudit2Laco, engineResearchCamadas) |
| 2 | L04 | qualidade: quase tudo é função pura sobre JSON — refatoração barata e testes baratos |
| 3 | L06 | runtime/exec/schemas: casos de borda de retry/prova já testados (engineExecProofs, engineLedger) |
| 4 | L02 | fases: uma fase por vez, na ordem f0→f12 (o contrato de artefato entre fases não muda) |
| 5 | L03 | modos e fiacao: os CC altos (repair 69, curriculumGap 41) exigem teste de caracterização antes |
| 6 | L01 | linguagens/vocabulário: extratores (extract_ast) são os CC mais altos do lote — testes de corpus primeiro |
| 7 | L09 | serviços de lição/track e domínio |
| 8 | L08 | LLM/juízes: mockar fronteira de rede nos testes (I-26 proíbe rede nos scripts; teste não toca rede) |
| 9 | L10 | desafio/quiz/áudio local |
| 10 | L07 | IPC e persistência: toca fronteira — se alguma refatoração exigir mudança de contrato, docs/00-contratos.md primeiro |
| 11 | L13 | estado de lição/sessão (front-end puro, redutor) |
| 12 | L14 | tema/dock/suporte visual |
| 13 | L12 | componentes e onboarding |
| 14 | L11 | views: LessonView (4071 linhas, CC 44) é o maior arquivo do repositório — testes de componente antes, e fatiar por seção |
| 15 | L15 | skill: núcleo e libs (shell puro; os gates B-04/B-05/06/07 do gate-build valem) |
| 16 | L16 | skill: sessão/memória/desafios |
| 17 | L17 | gates e ferramentas do repositório — POR ÚLTIMO: são a garantia dos lotes anteriores; refatorá-los exige o mesmo cuidado de afrouxar nada (CONTRIBUTING: teste afrouxado não entra) |

### 5.3 L01 — Linguagens, vocabulário e atomKeys da engine (12 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/engine/vocab/rs/extract_ast.mjs` | 1027 | 12 | 111 |
| `app/electron/main/engine/vocab/py/extract_ast.py` | 793 | 4 | 62 |
| `app/electron/main/engine/vocab/c/extract_ast.py` | 787 | 4 | 30 |
| `app/electron/main/engine/lang/javascript.ts` | 1045 | 4 | 22 |
| `app/electron/main/engine/lang/rust.ts` | 1305 | 4 | 20 |
| `app/electron/main/engine/lang/python.ts` | 1217 | 4 | 17 |
| `app/electron/main/engine/lang/c.ts` | 1615 | 2 | 23 |
| `app/electron/main/engine/vocab/catalog.ts` | 366 | 1 | 17 |
| `app/electron/main/engine/vocab/rs/gerar_inventario.mjs` | 134 | 1 | 10 |
| `app/electron/main/engine/atomKeys.ts` | 1074 | 1 | 9 |
| `app/electron/main/engine/lang/typescript.ts` | 806 | 1 | 9 |
| `app/electron/main/engine/lang/registry.ts` | 982 | 0 | 6 |
| **Total** | **11151** | **38** | — |

### 5.3 L02 — Fases da engine e orçamento (11 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/engine/phases/f1Research.ts` | 1106 | 9 | 32 |
| `app/electron/main/engine/phases/f6Pilot.ts` | 1341 | 8 | 34 |
| `app/electron/main/engine/phases/f3Graph.ts` | 1106 | 6 | 15 |
| `app/electron/main/engine/phases/f4Budget.ts` | 795 | 5 | 12 |
| `app/electron/main/engine/phases/f2Decompose.ts` | 1219 | 4 | 34 |
| `app/electron/main/engine/phases/f12Materialize.ts` | 1186 | 3 | 57 |
| `app/electron/main/engine/phases/f0Brief.ts` | 763 | 3 | 20 |
| `app/electron/main/engine/phases/f7Theory.ts` | 840 | 3 | 16 |
| `app/electron/main/engine/phases/f8Challenges.ts` | 800 | 2 | 14 |
| `app/electron/main/engine/phases/f5Freeze.ts` | 686 | 2 | 10 |
| `app/electron/main/engine/budget.ts` | 312 | 1 | 12 |
| **Total** | **10154** | **46** | — |

### 5.3 L03 — Modos de trilha, fiacao, extração e CLIs do track-engine (12 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/tools/track-engine/cli.ts` | 2466 | 18 | 30 |
| `app/electron/main/engine/fiacao/geraTrilha.ts` | 1950 | 7 | 15 |
| `app/electron/main/engine/modes/repair.ts` | 1645 | 6 | 69 |
| `app/electron/main/engine/modes/reorder.ts` | 1703 | 5 | 29 |
| `app/electron/main/engine/modes/curriculumGap.ts` | 2111 | 4 | 41 |
| `app/electron/main/engine/modes/convergencia.ts` | 1711 | 4 | 32 |
| `app/tools/track-cli.ts` | 802 | 4 | 21 |
| `app/electron/main/engine/extract.ts` | 1147 | 3 | 32 |
| `app/electron/main/engine/form/selector.ts` | 477 | 3 | 18 |
| `app/electron/main/engine/theoryCode.ts` | 261 | 2 | 10 |
| `app/electron/main/engine/graph/dag.ts` | 367 | 1 | 26 |
| `app/electron/main/engine/graph/invariants.ts` | 461 | 1 | 9 |
| **Total** | **15101** | **58** | — |

### 5.3 L04 — Qualidade da engine (11 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/engine/quality/minimal.ts` | 849 | 7 | 28 |
| `app/electron/main/engine/quality/requirements.ts` | 1347 | 6 | 26 |
| `app/electron/main/engine/quality/progressao.ts` | 902 | 5 | 54 |
| `app/electron/main/engine/quality/minimalPython.ts` | 632 | 5 | 28 |
| `app/electron/main/engine/quality/barra.ts` | 842 | 4 | 43 |
| `app/electron/main/engine/quality/minimalRust.ts` | 516 | 4 | 24 |
| `app/electron/main/engine/quality/minimalC.ts` | 514 | 3 | 17 |
| `app/electron/main/engine/quality/discriminacao.ts` | 478 | 2 | 11 |
| `app/electron/main/engine/quality/solvable.ts` | 563 | 2 | 11 |
| `app/electron/main/engine/quality/mutants.ts` | 513 | 1 | 21 |
| `app/electron/main/engine/quality/judgeCalibration.ts` | 527 | 1 | 9 |
| **Total** | **7683** | **40** | — |

### 5.3 L05 — Revisão, auditoria e pesquisa da engine (11 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/engine/review/loop.ts` | 1378 | 3 | 52 |
| `app/electron/main/engine/research/surfEnvelope.ts` | 453 | 3 | 22 |
| `app/electron/main/engine/research/surfBrief.ts` | 412 | 3 | 21 |
| `app/electron/main/engine/review/prover.ts` | 442 | 3 | 13 |
| `app/electron/main/engine/audit.ts` | 1397 | 2 | 90 |
| `app/electron/main/engine/revision/progressiva.ts` | 739 | 2 | 22 |
| `app/electron/main/engine/report/report.ts` | 517 | 2 | 17 |
| `app/electron/main/engine/review/filter.ts` | 512 | 2 | 17 |
| `app/electron/main/engine/review/audit2Laco.ts` | 651 | 2 | 12 |
| `app/electron/main/engine/research/qualityGate.ts` | 231 | 1 | 24 |
| `app/electron/main/engine/research/camadas.ts` | 636 | 1 | 13 |
| **Total** | **7368** | **24** | — |

### 5.3 L06 — Runtime, execução e schemas da engine (10 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/engine/runtime/ledger.ts` | 663 | 4 | 13 |
| `app/electron/main/engine/runtime/scheduler.ts` | 600 | 3 | 19 |
| `app/electron/main/engine/runtime/runState.ts` | 725 | 2 | 17 |
| `app/electron/main/engine/runtime/callLlm.ts` | 617 | 1 | 35 |
| `app/electron/main/engine/schemas/fieldOrder.ts` | 289 | 1 | 16 |
| `app/electron/main/engine/prompts/dossier.ts` | 184 | 1 | 11 |
| `app/electron/main/engine/runtime/jsonTail.ts` | 88 | 1 | 11 |
| `app/electron/main/engine/runtime/backoff.ts` | 196 | 1 | 9 |
| `app/electron/main/engine/exec/proofs.ts` | 660 | 0 | 7 |
| `app/electron/main/engine/schemas/artifacts.ts` | 735 | 0 | 2 |
| **Total** | **4757** | **14** | — |

### 5.3 L07 — Fronteira IPC, contrato e persistência (10 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/ipc/track-handlers.ts` | 1248 | 12 | 17 |
| `app/electron/main/ipc/study-handlers.ts` | 907 | 8 | 33 |
| `app/electron/main/db/repo.ts` | 1626 | 3 | 26 |
| `app/electron/main/ipc/pi-handlers.ts` | 146 | 1 | 11 |
| `app/electron/main/db/migrate.ts` | 143 | 1 | 10 |
| `app/electron/main/ipc/localAi-handlers.ts` | 231 | 1 | 10 |
| `app/electron/main/ipc/localTts-handlers.ts` | 268 | 1 | 10 |
| `app/electron/main/ipc/startup-handlers.ts` | 227 | 1 | 9 |
| `app/electron/main/ipc/stt-model-handlers.ts` | 285 | 1 | 9 |
| `app/shared/ipc-contract.ts` | 1449 | 0 | 0 |
| **Total** | **6530** | **29** | — |

### 5.3 L08 — LLM, juízes e mídia embutida (12 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/services/llmClient.ts` | 573 | 5 | 43 |
| `app/electron/main/services/answerJudge.ts` | 257 | 4 | 15 |
| `app/electron/main/services/braveSearchService.ts` | 439 | 3 | 21 |
| `app/electron/main/services/PiAgentService.ts` | 403 | 2 | 23 |
| `app/electron/main/services/llmJudge.ts` | 198 | 2 | 22 |
| `app/electron/main/services/apiKeyValidator.ts` | 479 | 2 | 14 |
| `app/electron/main/services/embeddedLlm/hardware.ts` | 94 | 1 | 14 |
| `app/electron/main/services/embeddedLlm/llmEngine.process.ts` | 334 | 1 | 12 |
| `app/electron/main/services/embeddedLlm/modelStore.ts` | 358 | 1 | 10 |
| `app/electron/main/services/piProviderMapper.ts` | 262 | 1 | 10 |
| `app/electron/main/services/embeddedLlm/LlmProxyService.ts` | 320 | 1 | 9 |
| `app/electron/main/services/tutorChat.ts` | 239 | 1 | 9 |
| **Total** | **3956** | **24** | — |

### 5.3 L09 — Autoria e orquestração de lição, domínio e conteúdo (12 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/content/trackTypes.ts` | 882 | 7 | 25 |
| `app/electron/main/services/studyMethodRunner.ts` | 945 | 6 | 17 |
| `app/electron/main/services/e2eStubs.ts` | 1393 | 6 | 14 |
| `app/electron/main/services/lessonOrchestrator.ts` | 1015 | 5 | 48 |
| `app/electron/main/services/lessonAuthor.ts` | 473 | 5 | 26 |
| `app/electron/main/domain/progressEngine.ts` | 390 | 3 | 19 |
| `app/electron/main/content/trackLoader.ts` | 364 | 1 | 28 |
| `app/electron/main/services/researchPlanner.ts` | 667 | 1 | 25 |
| `app/electron/main/services/trackService.ts` | 647 | 1 | 24 |
| `app/electron/main/domain/hintEngine.ts` | 166 | 1 | 12 |
| `app/electron/main/services/mathLib.ts` | 382 | 1 | 12 |
| `app/electron/main/domain/lessonEngine.ts` | 262 | 1 | 11 |
| **Total** | **7586** | **38** | — |

### 5.3 L10 — Desafio, quiz e áudio local (8 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/electron/main/services/quizRemediation.ts` | 688 | 4 | 23 |
| `app/electron/main/services/localStt/sttModelStore.ts` | 457 | 3 | 21 |
| `app/electron/main/services/challengeRegenerator.ts` | 475 | 2 | 28 |
| `app/electron/main/services/localTts/ttsModelStore.ts` | 374 | 2 | 18 |
| `app/electron/main/services/challengeContextValidator.ts` | 448 | 2 | 16 |
| `app/electron/main/services/challengeExec.ts` | 504 | 2 | 14 |
| `app/electron/main/services/localTts/PocketTtsService.ts` | 225 | 2 | 10 |
| `app/electron/main/services/localStt/asrEngine.process.ts` | 126 | 1 | 11 |
| **Total** | **3297** | **18** | — |

### 5.3 L11 — Views e entrada da aplicação (10 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/src/views/LessonView/LessonView.tsx` | 4071 | 11 | 44 |
| `app/src/views/ChallengeView/TrackChallengePanel.tsx` | 1395 | 5 | 42 |
| `app/src/views/ChallengeView/ChallengeView.tsx` | 1143 | 4 | 29 |
| `app/src/views/RoadmapView/RoadmapView.tsx` | 711 | 2 | 24 |
| `app/src/views/SettingsView/KeysPanel.tsx` | 366 | 1 | 16 |
| `app/src/main.tsx` | 157 | 1 | 15 |
| `app/src/views/SettingsView/LocalAiPanel.tsx` | 401 | 1 | 15 |
| `app/src/views/SettingsView/OrphanTracksPanel.tsx` | 276 | 1 | 11 |
| `app/src/views/LessonView/LessonQuiz.tsx` | 295 | 1 | 10 |
| `app/src/views/placeholders.tsx` | 702 | 0 | 7 |
| **Total** | **9517** | **27** | — |

### 5.3 L12 — Componentes e onboarding (13 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/src/features/onboarding/components/OnboardingOverlay.tsx` | 628 | 2 | 28 |
| `app/src/components/challenge/ChallengeGenerateModal.tsx` | 362 | 2 | 14 |
| `app/src/components/quiz/QuizOverlayHost.tsx` | 630 | 2 | 13 |
| `app/src/features/onboarding/utils/onboardingPositioning.utils.ts` | 363 | 2 | 12 |
| `app/src/components/chat/ChatBubble.tsx` | 327 | 1 | 18 |
| `app/src/components/quiz/QuizChatCard.tsx` | 300 | 1 | 16 |
| `app/src/components/tree/EvolutionTree.tsx` | 283 | 1 | 15 |
| `app/src/features/onboarding/hooks/useOnboarding.ts` | 493 | 1 | 15 |
| `app/src/components/quiz/quizOverlayContent.ts` | 195 | 1 | 12 |
| `app/src/features/onboarding/logic/evaluateStepAction.ts` | 89 | 1 | 12 |
| `app/src/features/onboarding/services/onboardingAudio.service.ts` | 98 | 1 | 10 |
| `app/src/components/markdown/MarkdownView.tsx` | 156 | 1 | 9 |
| `app/src/features/onboarding/services/onboardingStorage.service.ts` | 205 | 1 | 9 |
| **Total** | **4129** | **17** | — |

### 5.3 L13 — Estado de lição, sessão e pesquisa (núcleo de app/src/lib) (10 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/src/lib/trackLessonState.ts` | 1931 | 4 | 23 |
| `app/src/lib/sessionState.ts` | 480 | 3 | 18 |
| `app/src/lib/typewriterSegments.ts` | 435 | 2 | 21 |
| `app/src/lib/lessonParse.ts` | 169 | 2 | 14 |
| `app/src/lib/researchProgress.ts` | 403 | 1 | 40 |
| `app/src/lib/lessonProgress.ts` | 162 | 1 | 23 |
| `app/src/lib/roadmap.ts` | 160 | 1 | 16 |
| `app/src/lib/answerFlow.ts` | 216 | 1 | 10 |
| `app/src/lib/lessonMarkdown.ts` | 136 | 1 | 10 |
| `app/src/lib/validationMessages.ts` | 75 | 1 | 10 |
| **Total** | **4167** | **17** | — |

### 5.3 L14 — Tema, dock e suporte visual (10 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `app/src/lib/dockState.ts` | 721 | 3 | 20 |
| `app/src/lib/splitRatio.ts` | 612 | 2 | 13 |
| `app/src/lib/confetti.ts` | 349 | 1 | 26 |
| `app/src/lib/editorFiles.ts` | 125 | 1 | 19 |
| `app/src/lib/editorTabs.ts` | 135 | 1 | 10 |
| `app/src/lib/challengeGenerateStore.ts` | 243 | 1 | 9 |
| `app/src/lib/quizOverlayState.ts` | 290 | 1 | 9 |
| `app/src/lib/codeTheme.ts` | 650 | 0 | 4 |
| `app/src/theme.ts` | 1343 | 0 | 3 |
| `app/src/lib/designTokens.ts` | 542 | 0 | 2 |
| **Total** | **5010** | **10** | — |

### 5.3 L15 — Skill: núcleo, libs e ferramentas (SK/scripts e SK/scripts/lib) (9 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `skills/study-method/scripts/_ensure-toolchain.sh` | 1839 | 10 | 71 |
| `skills/study-method/scripts/render-plot.py` | 1351 | 10 | 53 |
| `skills/study-method/scripts/lib/common.sh` | 535 | 8 | 17 |
| `skills/study-method/scripts/lib/sandbox.sh` | 800 | 6 | 57 |
| `skills/study-method/scripts/lib/_mutate.py` | 638 | 6 | 23 |
| `skills/study-method/scripts/lib/_jsonschema_min.py` | 202 | 2 | 53 |
| `skills/study-method/scripts/detect-toolchains.sh` | 292 | 2 | 25 |
| `skills/study-method/scripts/decisions-ask.sh` | 532 | 2 | 11 |
| `skills/study-method/scripts/lib/json.sh` | 283 | 1 | 26 |
| **Total** | **6472** | **47** | — |

### 5.3 L16 — Skill: sessão, memória, setup e desafios (10 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `skills/study-method/scripts/challenge-verify.sh` | 1127 | 16 | 27 |
| `skills/study-method/scripts/setup-list.sh` | 391 | 2 | 15 |
| `skills/study-method/scripts/docs-index.sh` | 709 | 1 | 45 |
| `skills/study-method/scripts/session-close.sh` | 457 | 1 | 12 |
| `skills/study-method/scripts/setup-init.sh` | 404 | 1 | 12 |
| `skills/study-method/scripts/challenge-new.sh` | 1114 | 1 | 11 |
| `skills/study-method/scripts/memory-compact.sh` | 535 | 0 | 8 |
| `skills/study-method/scripts/memory-digest.sh` | 532 | 0 | 5 |
| `skills/study-method/scripts/progress-update.sh` | 1092 | 0 | 4 |
| `skills/study-method/scripts/readme-sync.sh` | 606 | 0 | 1 |
| **Total** | **6967** | **22** | — |

### 5.3 L17 — Gates e ferramentas de verificação do repositório (7 arquivos)

| path | linhas | funções CC>8 | CC máx |
|---|---|---|---|
| `tools/emulador-ambiente.sh` | 716 | 2 | 15 |
| `evals/run-evals.sh` | 560 | 1 | 30 |
| `tools/check-trilha-c.mjs` | 450 | 1 | 13 |
| `tests/lib/assert.sh` | 742 | 1 | 11 |
| `tests/smoke.sh` | 714 | 1 | 9 |
| `tests/spec-conformance.sh` | 1242 | 0 | 7 |
| `tests/validate.sh` | 1553 | 0 | 4 |
| **Total** | **5977** | **6** | — |

---

## 6. Totalizadores e os comandos que os reproduzem

```bash
# M5a — funções CC>8 (total e por linguagem)
cat cc-ts.tsv cc-py.tsv cc-sh.tsv | sort > prod-cc.tsv
awk -F'\t' '$4>8' prod-cc.tsv | wc -l
awk -F'\t' '$4>8 {print $5}' prod-cc.tsv | sort | uniq -c

# M5b — alvos de refatoração: união dos dois gatilhos
awk -F'\t' '$1>500 {print $2}' prod-lines.tsv > alvos-a.txt
awk -F'\t' '$4>8 {print $1}' prod-cc.tsv | sort -u > alvos-b.txt
cat alvos-a.txt alvos-b.txt | sort -u | wc -l

# distribuição de CC (faixas)
awk -F'\t' '{if($4<=1)a++; else if($4<=5)b++; else if($4<=8)c++; else if($4<=15)d++; else e++}
  END{print a, b, c, d, e}' prod-cc.tsv
```

| Totalizador | Valor |
|---|---|
| Arquivos de produção medidos | 341 |
| Linhas de produção (soma) | 145387 |
| Arquivos de produção >500 linhas | 96 |
| Linhas somadas só nos >500 | 95623 |
| Funções/métodos medidos | 5445 |
| — TypeScript (`.ts`) | 4180 funções · 342 com CC>8 |
| — TSX (`.tsx`) | 766 funções · 37 com CC>8 |
| — MJS (`.mjs`) | 60 funções · 14 com CC>8 |
| — Python (`.py`) | 128 funções · 26 com CC>8 |
| — Shell (`.sh`) | 311 funções · 56 com CC>8 |
| Total de funções com CC>8 | 475 |
| Distribuição de CC | 2502 com CC=1 · 2054 com CC 2–5 · 414 com CC 6–8 · 296 com CC 9–15 · 179 com CC>15 |
| Arquivos de teste (`app/tests`) medidos | 316 arquivos · 116792 linhas |
| Arquivos de teste >500 linhas | 85 |
| Alvos de refatoração (união) | 178 |
| Lotes propostos | 17 lotes · 178 arquivos no total |

---

## 7. Baseline da suíte — 3 falhas PRÉ-EXISTENTES (copiar, não reprovar)

Medida pelo orquestrador ANTES desta onda, para qualquer «antes e depois» de refatoração:
`app-test` tem **3 falhas pré-existentes**, que estão sendo consertadas EM PARALELO por outro
agente. Quem refatorar **não deve reproduzi-las nem «consertá-las» de passagem** — escopo de
outro dono:

| Teste | Falha |
|---|---|
| `engineLangC.test.ts:131` | `detect()` |
| `engineLangRust.test.ts` | `detect()` |
| `trilhaCIntegrada.test.ts:639` | autoria × [`20-trilha-c.md`](20-trilha-c.md) |

Fora estas três, o placar esperado em cada lote é: os 5 gates verdes (`tests/gate-build.sh`,
`tests/gate-lint.sh`, `tests/gate-bash32.sh`, `tests/validate.sh`, `tests/spec-conformance.sh`)
e a suíte `app-test` sem falha nova. Tabela §7 citada como está: é a baseline, não uma medição
própria desta onda (a suíte não roda nesta subtarefa; nada de comportamento foi modificado).

---

## Apêndice A — ts-cc.mjs

Fonte literal usada na medição (§1). Para reproduzir, salve o bloco abaixo com o nome
indicado e rode os comandos §1.

```javascript
#!/usr/bin/env node
// ts-cc.mjs — complexidade ciclomática de TS/TSX/JS/MJS via AST do pacote `typescript`.
//
// Uso:  node ts-cc.mjs <raiz> <arquivo...>
// Saída: TSV por função — path <TAB> linha <TAB> nome <TAB> CC <TAB> linguagem
//
// Regra de contagem (1 + pontos de decisão do CORPO da função, sem o corpo de
// função aninhada):
//   +1  if (cada IfStatement — else-if é um IfStatement e também soma)
//   +1  for / for-in / for-of / while / do-while
//   +1  cada braço de switch (case e default)
//   +1  catch
//   +1  expressão condicional (?: )
//   +1  cada operador binário &&, || e ??
// NÃO somam: atribuição lógica (&&=, ||=, ??=), operador !, default de parâmetro,
// laço sem corpo, caminho `else` puro.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.resolve(process.argv[2] ?? ".", "app", "package.json"));
const ts = require("typescript");

const [, , root, ...files] = process.argv;

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isSetAccessorDeclaration(n) ||
  ts.isConstructorDeclaration(n);

const clean = (s) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 45) + "…" : t;
};

function nameOf(fn, sf, enclosing) {
  const n = fn;
  const p = n.parent;
  const classOf = (node) => {
    let cur = node.parent;
    while (cur) {
      if ((ts.isClassDeclaration(cur) || ts.isClassExpression(cur)) && cur.name) {
        return cur.name.getText(sf);
      }
      if (isFunctionLike(cur)) return null;
      cur = cur.parent;
    }
    return null;
  };
  let base = null;
  if (ts.isConstructorDeclaration(n)) base = "constructor";
  else if (n.name && n.name.getText) base = n.name.getText(sf);
  if (base) {
    const c = classOf(n);
    return clean(c ? c + "." + base : base);
  }
  if (p) {
    if (ts.isVariableDeclaration(p) && p.name.getText) return clean(p.name.getText(sf));
    if (ts.isPropertyAssignment(p) && p.name.getText) return clean(p.name.getText(sf));
    if (ts.isPropertyDeclaration(p) && p.name.getText) return clean(p.name.getText(sf));
    if (ts.isAssignmentExpression(p) && p.left.getText) return clean(p.left.getText(sf));
    if (ts.isExportAssignment(p)) return "export default";
    if (ts.isPropertyAccessExpression(p)) return clean(p.getText(sf)) + " = …";
    if (ts.isCallExpression(p)) {
      const callee = p.expression.getText(sf);
      return "<callback de " + clean(callee) + ">";
    }
  }
  return enclosing ? "<anônima em " + clean(enclosing) + ">" : "<anônima>";
}

function ownDecisions(fn) {
  let n = 0;
  const visit = (node) => {
    if (node !== fn && isFunctionLike(node)) return;
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.DefaultClause:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        n += 1;
        break;
      case ts.SyntaxKind.BinaryExpression:
        if (
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
          node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          n += 1;
        }
        break;
      default:
        break;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return n;
}

const langOf = (p) => (p.endsWith(".tsx") ? "tsx" : p.endsWith(".ts") ? "ts" : p.endsWith(".mjs") ? "mjs" : "js");

for (const rel of files) {
  const text = readFileSync(rel, "utf8");
  const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const walk = (node, stack) => {
    if (isFunctionLike(node)) {
      const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      const cc = 1 + ownDecisions(node);
      const nome = nameOf(node, sf, stack[stack.length - 1]);
      process.stdout.write(
        [rel, pos.line + 1, nome, cc, langOf(rel)].join("\t") + "\n"
      );
      ts.forEachChild(node, (c) => walk(c, stack.concat(nome)));
      return;
    }
    ts.forEachChild(node, (c) => walk(c, stack));
  };
  walk(sf, []);
}
```

---

## Apêndice B — py-cc.py

Fonte literal usada na medição (§1). Para reproduzir, salve o bloco abaixo com o nome
indicado e rode os comandos §1.

```python
#!/usr/bin/env python3
# py-cc.py — complexidade ciclomática de Python via módulo `ast` (stdlib).
#
# Uso:  python3 py-cc.py <arquivo...>
# Saída: TSV por função — path <TAB> linha <TAB> nome <TAB> CC <TAB> linguagem
#
# Regra de contagem (1 + pontos de decisão do CORPO da função, sem o corpo de
# função/método/lambda aninhado):
#   +1  if (cada ast.If — elif é If aninhado e também soma)
#   +1  for / async for / while
#   +1  except (cada handler)
#   +1  cada operador booleano and/or (BoolOp com N valores soma N-1)
#   +1  expressão condicional (x if c else y)
#   +1  cada gerador de compreensão (for) e cada filtro (if) de compreensão
#   +1  cada braço de match/case (ast.match_case)
# NÃO somam: assert, with, operador unário not, else puro, try sem except.
import ast
import sys

FUNC = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


def own_cc(fn):
    class V(ast.NodeVisitor):
        def __init__(self):
            self.n = 0

        def visit(self, node):
            if node is not fn and isinstance(node, FUNC):
                return
            if isinstance(node, ast.If):
                self.n += 1
            elif isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
                self.n += 1
            elif isinstance(node, ast.ExceptHandler):
                self.n += 1
            elif isinstance(node, ast.BoolOp):
                self.n += len(node.values) - 1
            elif isinstance(node, ast.IfExp):
                self.n += 1
            elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                for gen in node.generators:
                    self.n += 1 + len(gen.ifs)
            elif isinstance(node, ast.match_case):
                self.n += 1
            self.generic_visit(node)

    v = V()
    for child in ast.iter_child_nodes(fn):
        if isinstance(child, ast.arguments):
            for default in child.defaults + [d for d in child.kw_defaults if d]:
                v.visit(default)
            continue
        if isinstance(child, ast.stmt) or isinstance(child, ast.expr):
            v.visit(child)
    return 1 + v.n


def scan(node, stack, out):
    for child in ast.iter_child_nodes(node):
        if isinstance(child, FUNC):
            nome = getattr(child, "name", None) or "<lambda>"
            out.append((child.lineno, ".".join(stack + [nome]), own_cc(child)))
            scan(child, stack + [nome], out)
        elif isinstance(child, ast.ClassDef):
            scan(child, stack + [child.name], out)
        else:
            scan(child, stack, out)


for path in sys.argv[1:]:
    try:
        tree = ast.parse(open(path, encoding="utf-8").read(), filename=path)
    except SyntaxError as exc:
        sys.stderr.write("%s: ERRO DE SINTAXE: %s\n" % (path, exc))
        continue
    out = []
    scan(tree, [], out)
    for lineno, nome, cc in out:
        print("%s\t%d\t%s\t%d\tpy" % (path, lineno, nome, cc))
```

---

## Apêndice C — sh-cc.py

Fonte literal usada na medição (§1). Para reproduzir, salve o bloco abaixo com o nome
indicado e rode os comandos §1.

```python
#!/usr/bin/env python3
# sh-cc.py — complexidade ciclomática de Shell por função, sobre o classificador
# léxico do PRÓPRIO repositório (shellscope.py, embutido em tests/lib/assert.sh).
#
# Uso:  python3 sh-cc.py <shellscope.py> <raiz> <arquivo.sh...>
# Saída: TSV por função — path <TAB> linha <TAB> nome <TAB> CC <TAB> linguagem
#
# Regra de contagem (1 + pontos de decisão das linhas de CÓDIGO do corpo da função;
# comentário, aqui-document e conteúdo de string não contam; função aninhada conta
# para a aninhada, não para a que a envolve):
#   +1  if · +1  elif · +1  while · +1  until · +1  for (cada palavra-chave)
#   +1  cada && e cada ||
#   +1  cada | (pipe) que não seja de ||, |& ou >|
#   +1  cada braço de case (linha de código que abre com padrão seguido de ")")
#   +1  cada ? de ternário aritmético dentro de $(( )) — o conteúdo de $(( )) só
#       soma ? (ternário) e os &&/|| que estiverem lá dentro
# Código de topo (fora de função) não é função: não entra na saída.
import importlib.util
import re
import sys

spec = importlib.util.spec_from_file_location("shellscope", sys.argv[1])
ss = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ss)

root = sys.argv[2]
ARM = re.compile(r"^[A-Za-z0-9_*.?|\[\]{}$'\"~+-]+\)")
KW = re.compile(r"\b(elif|if|while|until|for)\b")
PARAM = re.compile(r"\$\{[^}]*\}")
ARITH_OPEN = re.compile(r"\$\(\(")


def count_line(bare, code):
    """Pontos de decisão de UMA linha de código (bare: aspas em branco, comentário fora)."""
    n = 0
    # 1. braço de case: o prefixo `padrão)` é removido antes de contar operadores
    if ARM.match(bare.strip()) or ARM.match(code.strip()):
        n += 1
        cut = bare.find(")") + 1
        bare = bare[cut:] if cut > 0 else ""
    # 2. $(( ... )): só ternário e &&/|| internos
    while True:
        m = ARITH_OPEN.search(bare)
        if not m:
            break
        seg = bare[m.end():]
        depth, end = 2, 0
        while end < len(seg) and depth:
            if seg[end] == "(":
                depth += 1
            elif seg[end] == ")":
                depth -= 1
            end += 1
        inner = PARAM.sub(lambda mm: " " * len(mm.group(0)), seg[:end])
        n += inner.count("?") + inner.count("&&") + inner.count("||")
        bare = bare[: m.start()] + " " * (m.end() - m.start() + end) + seg[end:]
    # 3. expansão de parâmetro ${...} não é condição
    bare = PARAM.sub(lambda mm: " " * len(mm.group(0)), bare)
    # 4. palavras-chave de laço/condição
    n += len(KW.findall(bare))
    # 5. && e ||
    n += bare.count("&&") + bare.count("||")
    # 6. pipes isolados (||, |& e >| já são tratados acima/não são pipe de comando)
    pipes = bare.replace("||", "  ").replace("|&", "  ").replace(">|", "  ")
    n += pipes.count("|")
    return n


def analyze(path):
    try:
        lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
    except OSError as exc:
        sys.stderr.write("%s: %s\n" % (path, exc))
        return
    out = {}   # chave `a>b` -> [linha_declaracao, nome, pontos]
    stack = []  # [(nome, linha_de_declaracao)] — nome "" = grupo { } anônimo
    pending = None
    heredocs = []
    quote = None
    for idx, raw in enumerate(lines):
        lineno = idx + 1
        if heredocs:
            if raw.strip() == heredocs[0]:
                heredocs.pop(0)
            continue
        started_in_string = quote is not None
        code, bare, toks, quote = ss.walk(raw, quote)
        for m in ss.HEREDOC.finditer(code):
            if m.start() < len(bare) and bare[m.start()] == "<":
                heredocs.append(m.group(1) or m.group(2) or m.group(3))
        named = [x for x in stack if x[0]]
        if named and not started_in_string:
            key = ">".join(x[0] for x in named)
            rec = out.get(key)
            if rec is None:
                rec = [named[-1][1], named[-1][0], 0]
                out[key] = rec
            if code.strip():
                rec[2] += count_line(bare, code)
        for tok, _pos in toks:
            if tok == "{":
                seg = bare[:_pos]
                m = ss.FN_DEF.search(seg) or ss.FN_DEF_KW.search(seg)
                if m:
                    stack.append((m.group(1), lineno))
                elif pending is not None and not seg.strip():
                    stack.append(pending)
                else:
                    stack.append(("", lineno))
                pending = None
            elif stack:
                stack.pop()
        if not toks:
            m = ss.FN_DEF.search(bare.rstrip()) or ss.FN_DEF_KW.search(bare.rstrip())
            pending = (m.group(1), lineno) if m else None
    for _key, (start, nome, pontos) in sorted(out.items(), key=lambda kv: (kv[1][0], kv[1][1])):
        yield start, nome, 1 + pontos


for path in sys.argv[3:]:
    for start, nome, cc in analyze(path):
        print("%s\t%d\t%s\t%d\tsh" % (path, start, nome, cc))
```

---

## Apêndice D — fixtures de validação

Os três arquivos abaixo são os casos conhecidos do §1.6 (`trivial` = CC 1; segunda função =
3 `if` + 1 `&&`/`and` = CC 5). Salve como `fixture/casos.ts`, `fixture/casos.py` e
`fixture/casos.sh` e compare com a saída do §1.6.

```typescript
export function trivial(x: number): number {
  return x;
}
export function tresIfsEUmEComercial(a: boolean, b: boolean): number {
  if (a) { console.log(a); }
  if (b) { console.log(b); }
  if (a && b) { console.log("ambos"); }
  return 0;
}
```

```python
def trivial(x):
    return x

def tres_ifs_e_um_e(a, b):
    if a:
        print(a)
    if b:
        print(b)
    if a and b:
        print("ambos")
    return 0
```

```bash
#!/usr/bin/env bash
trivial() {
  printf '%s\n' "$1"
}
tres_ifs_e_um_e_comercial() {
  if [ -n "$1" ]; then printf a; fi
  if [ -n "$2" ]; then printf b; fi
  if [ -n "$1" ] && [ -n "$2" ]; then printf c; fi
}
```

