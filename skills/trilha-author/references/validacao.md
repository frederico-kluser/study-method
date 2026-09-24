# Validação — os gates determinísticos e os comandos exatos

Regras de execução dos passos `validar_modulo`, `converger` e `publicar`. Todos os comandos rodam de
`app/`, sem rede e sem chave de API (P-PROVA: o veredito é do gate, nunca da leitura). Convenção de exit
code da engine: **0** sem violação · **1** violações encontradas · **2** uso incorreto.

**Para ler `--json`, redirecione para arquivo e leia o arquivo.** Duas razões medidas em 2026-09-22:
(i) `npm run` põe o banner de 3 linhas no **stdout** (o arquivo começa com `> study-method-gui@0.1.0
engine` e o `jq` recusa) — chame o CLI direto, `npx tsx tools/track-engine/cli.ts <cmd> … --json >
/tmp/x.json`; (ii) canalizar `--json` para outro processo **TRUNCA em 65536 bytes** quando o comando
sai ≠ 0 (medido no `barra rust-iniciante --json`: 65536 bytes no pipe × **78925** no arquivo).

## 0. Pré-requisito de ambiente — a prova ANTES do gate

Os seis gates spawnam toolchains reais (a engine parseia código e roda as provas de execução em
binários de verdade) e o fail-closed deles é honesto: sem toolchain o gate reprova por ambiente, e a
causa não é conteúdo — medido, o `track:validate` chegou a reprovar 109 desafios rust "corretamente"
só porque o env do cargo não estava exportado (docs/18 §8.3). Por isso o ambiente é PROVADO por
execução antes do primeiro gate (passo `preparar_ambiente`) e re-provado no início de
`validar_modulo`, de `converger` e de `publicar`. O veredito é do script, nunca por leitura:

Dois níveis de dependência, e a diferença importa no laço: `audit`, `barra`, `reorder` e `convergir`
precisam só do **PARSER** da linguagem (clang para C, `python3` para python e para o extrator de C,
`node` para o parser WASM de rust) e de nenhuma LLM nem chave; `coverage`, `requirements` e
`track:validate` precisam também do **RUNNER** (cargo, unittest, o binário compilado). É por isso que
o laço do `converger` roda em máquina sem runner — e por isso que ele **não** substitui os gates de
execução.

```bash
# da raiz do repositório (não de app/). A re-checagem NUNCA instala:
bash skills/study-method/scripts/_ensure-toolchain.sh --check --language <l>
# instala pela receita da distro e re-prova:
bash skills/study-method/scripts/_ensure-toolchain.sh --ensure --language <l> --json
```

O harness (node+npm+jq para a CLI via tsx e o JSON da engine) é pré-requisito dos gates em
qualquer trilha, e o `--ensure` o garante em TODO escopo: a invocação canônica
`bash skills/study-method/scripts/_ensure-toolchain.sh --ensure --language <l> --json` garante,
num único comando, a linguagem + os hosts cruzados + o harness, e a invocação SEM `--language`
(`bash skills/study-method/scripts/_ensure-toolchain.sh --ensure --json`, as 3 linguagens + o
harness) continua sendo a recomendada quando a trilha em autoria usa mais de uma linguagem ou
quando nenhuma foi passada. No `--check`, o harness ausente é REPORTADO — entra em
`ensure.missing` com aviso acionável no stderr, com o comando exato de instalação da família —
e o exit fica com a prova das linguagens pedidas (sai 0 se elas provam; garantir o harness é
trabalho do `--ensure`). A moral permanece: sem node+npm+jq a CLI dos gates não sobe.

Exit code do script: **0** toolchain provada por execução · **1** faltando, falha de prova,
falha de instalação ou sem privilégio — sempre com mensagem acionável · **2** uso incorreto. Sem
TTY o contrato é o mesmo: mensagem acionável e exit **1**, nunca travar esperando input.

Prova de prontidão = um comando que EXECUTA um teste de verdade — os comandos vêm da matriz de
execução da referência de linguagens da tutoria e da matriz de prontidão da referência de
ambiente da autoria, EXCETO o de rust: a prova abaixo é a variante ENDURECIDA do §1 da própria
referência de ambiente da autoria (o cargo REAL, com sysroot resolvido e `cargo test --offline`
— a prova que os gates exigem), não o `cargo test` simples dessas matrizes; `command -v` só
prova que o binário existe:

| Linguagem | Prova de prontidão (roda de verdade) | Status de falha |
|---|---|---|
| python | `python3 -m unittest discover -s tests -p "test_*.py" -v` com `Ran N tests`, N≥1 | **1** · zero testes **5** |
| rust | `cargo --version` + o sysroot resolve (`rustc --print sysroot`) mesmo com `RUSTUP_HOME`/`CARGO_HOME` removidos do env + `cargo test --offline` | **101** |
| c | runner `gcc -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner` (aceita `cc`→`gcc`→`clang`) + o parse `clang -std=c11 -fsyntax-only stub.c` | **134** (SIGABRT) |
| o harness da engine | `node --version && npm --version && jq --version` (a CLI roda via tsx e o JSON via jq) | sem node+npm+jq a CLI não sobe — nenhum gate roda |

Para C, compilar com gcc e passar **NÃO** prova prontidão de autoria C: o PARSE da engine é
clang-only (`-ast-dump=json` é extensão do clang) e, sem clang, `PARSE_ERROR` vira violação no
gate — a prova de C tem duas metades (runner e parse) e as duas precisam passar. E os hosts
cruzados valem tanto quanto o binário da linguagem: o parse de rust roda em `node` (host do
parser WASM) e o extrator de C roda em `python3`.

Três regras de ambiente medido (docs/18 §8.3) que o executor aplica ANTES de diagnosticar
conteúdo:

1. **Cold-start do prover** — a primeira bateria que spawna cargo em lote numa sessão/worktree
   nova sai com o lote inteiro reprovado por ambiente (medido: 109× SEM-SOLUCAO no 1º run,
   109/109 no 2º). Regra: **sempre 1 re-run antes de diagnosticar conteúdo**.
2. **Contenção de cargo** — gates de cargo em paralelo com outro agente no MESMO `CARGO_HOME`
   produzem 1–2 reprovados aleatórios (rustc concorrente). Protocolo: **serializar os gates**;
   reprovado que fecha em re-verificação isolada não é conteúdo.
3. **`npm ci` do app passa de 10 min** (postinstalls bloqueados é o estado normal) e um
   `node_modules` parcial fabrica violação fantasma (21 violações de orçamento com deps
   quebradas → 0 com deps íntegras) — o veredito dos gates vale só com `npm ci` íntegro.

A moral que amarra o pré-requisito ao resto deste arquivo: **ambiente provado ≠ conteúdo
aprovado** — os gates só julgam conteúdo sobre um ambiente que já passou na prova; reprovação
por ambiente não é sinal sobre o curso.

## 1. Os SEIS gates, um por pergunta

Eram quatro até 2026-09-22. São seis: a **barra** (a régua pedagógica que o orçamento não pergunta) e o
**laço** (que transforma "passou uma vez" em ponto fixo).

| Gate | Responde | O que reprova | Exit |
|---|---|---|---|
| `audit` | **o que a aula oferece** — o orçamento cumulativo × cada superfície (teoria, starter, testes, solução) | construção fora do orçamento, lacuna de currículo, A1–A6/DEC e I12/I14–I17 (A13–A16 **não rodam** fora de JavaScript — §3) | 0 · 1 · 2 |
| `barra` | **o TAMANHO DO PASSO e a EXISTÊNCIA DA DEMONSTRAÇÃO** — agnóstica de linguagem | A17 (>2 produtivas novas) · A18 (aula 1) · A19 (declarada sem demonstração) · A20 (aula sem desafio) · A21 (>4 novas / seções insuficientes) · A23 (`derived` sem co-ocorrência de linha) · **A24** (o quiz acertável pelo COMPRIMENTO: a correta é a mais longa, sozinha, em TODA afirmação da aula, com folga > 8 chars). A22 e o A24 por afirmação isolada são **aviso** e não derrubam o exit | 0 · 1 · 2 |
| `coverage` | **o que o teste REALMENTE cobra** — qual é o MENOR código que passa no teste? | **LACUNA**: átomo do mínimo fora do orçamento da aula (o teste cobra algo que a aula não oferece); e desafio **não medido** | 0 · 1 · 2 |
| `requirements` | a **bijeção** entre o enunciado e o teste — `requirements[]` declarados ↔ testes do desafio, nas duas direções | um dos lados sem par | 0 · 1 · 2 |
| `track:validate` | as **provas de execução** de TODOS os desafios (aulas + desafio de módulo + proficiência) | algum desafio reprovou em prova de execução | 0 · 1 · 2 |
| `convergir` | **a entrega é ponto fixo?** — medir → classificar → aplicar → medir, sem teto de rodadas | tudo o que sobrou: exit **0 só em PONTO-FIXO** (achados vazios **e** nada aplicado); CICLO, SEM-PROGRESSO, TETO, DRY-RUN com achado e achado fora dos seis ramos saem 1 | 0 · 1 · 2 |

## 2. Os comandos

```bash
cd app && npm run engine -- audit <slug> --limite 0
cd app && npm run engine -- barra <slug>
cd app && npm run engine -- coverage <slug>
cd app && npm run engine -- requirements <slug>
cd app && npm run track -- track:validate <slug>
cd app && npm run engine -- convergir <slug>          # dry-run: mede, classifica, planeja, registra
```

Medido em 2026-09-22 no curso de referência: `barra python-iniciante` → **112 aulas · 0 erros · 30 avisos
A22**, exit **0**; `requirements python-iniciante` → **113 desafios · bijeção completa 113 · 0 gaps**,
exit **0**; `audit python-iniciante --limite 0 --json` → `violacoes 0` e `checagensNaoExecutadas` **1**.
O `barra` aceita `--aula <mod>/<aula>` para restringir o RELATÓRIO (a trilha inteira continua sendo
medida — o orçamento é cumulativo).

Por desafio, o endereço exato (multi-arquivo OK):

```bash
cd app && npm run track -- track:challenge:verify <slug> <moduleSlug> <lessonSlug> <challengeSlug>
```

Flags que importam (docs/16 §8 e o `--help` da engine, `npx tsx tools/track-engine/cli.ts
--help`):

| Flag | Onde vale | O que faz |
|---|---|---|
| `--limite N` | `audit` | limita quantas **violações são impressas** — `0` = nenhuma, só o placar, e a trilha INTEIRA é auditada (modo recomendado) |
| `--limite N` | `coverage`/`requirements`/`revise` | limita quantos **desafios/aulas são processados** — aqui `--limite` fatia o que é MEDIDO, e `0` fatiaria para lista vazia |
| `--dir DIR` | `audit`/`coverage`/`requirements`/`revise`/`repair` | carrega a trilha de fora de `resources/tracks/` — ex.: o draft ainda não publicado; com `--dir`, o slug é só o rótulo do relatório |
| `--modo declared\|inferred` | `audit`/`coverage` | de onde vem o orçamento; sem a flag: `declared` se alguma aula declara `introduces`, senão `inferred` |
| `--harness receptive-seed\|none` | `audit` | se o harness entra no orçamento receptivo da aula 1 (default `receptive-seed`) |
| `--so-lacunas` | `audit` | só as lacunas de currículo (construção que NENHUMA aula ensina) |
| `--json` | todos | relatório completo em JSON |

## 3. A armadilha do `--limite 0` no `coverage`

No `audit`, `--limite 0` audita tudo e só esconde o detalhamento. No `coverage` (e nos irmãos
`requirements`/`revise`) o mesmo `--limite 0` **fatia o que é medido para a lista vazia**: o placar
sai todo zerado sem que nada tenha sido medido — a classe de erro do docs/16 §9.2
(zero-porque-não-rodou lido como zero-porque-está-certo); o contrato mediu o comando saindo 0 com
contadores zerados, e o README da engine trata o `0` como uso incorreto. De qualquer forma, nada é
medido:

```bash
cd app && npm run engine -- coverage python --limite 0     # placar: desafios ... 0  (armadilha)
cd app && npm run engine -- coverage python                # placar: desafios ... 21
```

**Regra: no `coverage`/`requirements`, rode SEM `--limite`.** E todo placar só é informação com
`totals.checagensNaoExecutadas == 0` — a bateria A13–A16 é javascript-only e, nas trilhas python/rust/C,
pula e **declara** a limitação (id `A13-A16-NAO-RODOU`) em vez de dar veredito errado silencioso.
Um `0` num contador de aviso com checagem não executada é aprovação por omissão, proibida.

### A limitação A13–A16 deixou de ser desculpa — e o que ainda falta

O substituto **agnóstico de linguagem** é a barra **A17–A24** (`quality/barra.ts`,
`npm run engine -- barra <slug>`): pura, offline, mede o teto do passo (A17/A18/A21), a existência da
demonstração (A19), a prova da aula (A20), as duas formas (A22, aviso), a regra do par (A23) e o vazamento do quiz pelo comprimento (A24). Antes
dela, a prova por mutação registrada no relatório do `audit` valia: *apagar TODOS os blocos de código da
teoria da aula 1 de uma trilha de Rust não mudava o placar — 0 violações, exit 0*. Hoje isso reprova em
A19 (`barra <slug>` → `chave declarada sem demonstração`).

O que a barra **NÃO** cobre da A13–A16, e por isso continua com `checagensNaoExecutadas` 1:

| Regra pulada | O que ela media | Substituto hoje |
|---|---|---|
| A13a/A13b/A13c | os átomos **escritos/lidos** no starter, na solução e no teste têm demonstração | **nenhum** — A19 só mede as chaves **declaradas**; o que resta é `audit` A1–A3 (orçamento, não demonstração) |
| A14b | ≤1 construção nova por **linha** da solução (a lacuna única) | **nenhum** — a régua de linha existe na barra só dentro de A23 (co-ocorrência), não sobre a solução |
| A15a/A15b | degrau entre desafios da mesma aula; reuso de átomo de aula anterior | **nenhum** — escrever já discriminando (`qualidade-aula.md` §6) |
| A16b | 1º desafio resolvível com a **1ª seção** da teoria | **nenhum** — A21 conta seções, não casa seção com desafio |

Regra de execução: **declarar a limitação em toda entrega** (`converger` registra
`limitacoesDeclaradas` no ledger) e nunca ler `0 violações` como "a pedagogia passou".

## 4. As quatro provas de execução (docs/16 §5.4)

Um desafio só é válido com as quatro passando:

1. a solução de referência **passa** em todos os testes;
2. o `starterCode` **falha**;
3. o número de testes executados **bate** com `expectedTestCount` (igualdade dupla: declarada ==
   executada; exit code sozinho não distingue "passou" de "nada rodou");
4. um **stub vazio falha** (protege contra teste tautológico — o teste que passa até sem código).

Armadilhas medidas que o executor trata e o autor deve conhecer: `node --test` com glob vazio sai
0; `NODE_TEST_CONTEXT` herdado faz o processo filho pular tudo e sair 0; códigos ANSI no relatório
quebram o regex de contagem; timeout devolve 137, que também é OOM. Em Python o runner é
`python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` com exit 0/1/5, e sem
`tests/__init__.py` nada roda (`ImportError: Start directory is not importable`). A **quinta**
prova (`typesCheck`) é opcional por linguagem e não existe para Python.

## 5. Leitura do relatório — violação de ORDEM × LACUNA

No `--json` do `audit`, toda violação carrega `primeiraAulaQueEnsina` (docs/16 §5.5) — e a ação
prescrita é diferente para cada caso (os três destinos de P-QUEBRA; o `convergir` faz esta triagem
sozinho e imprime o ramo de cada achado):

- `primeiraAulaQueEnsina !== null` → **violação de ORDEM**: reescrever o artefato, ou mover a aula que
  ensina — `npm run engine -- reorder <slug>` mostra o plano em dry-run, **sem LLM e sem chave**
  (medido: exit 0, "dry-run: NADA é gravado"), e `--aplicar` só grava depois de provar que o alvo sumiu
  e que nenhuma violação nova apareceu;
- `primeiraAulaQueEnsina === null` **e a chave é ensinada num curso ANTERIOR da cadeia** → **CADEIA**:
  aula própria no módulo porta-de-entrada (`MOVE_CONCEPT_TO_ENTRY_BUDGET`, `interligacao.md` §3);
- `primeiraAulaQueEnsina === null` **e ninguém na cadeia ensina** → **LACUNA DE CURRÍCULO**: criar a
  aula atômica que falta (`npm run engine -- gap <slug>` planeja em dry-run) — ou, quando o defeito é o
  tamanho do passo (A17/A18/A21), **QUEBRAR** a aula (`recursao.md` §6). **Nunca** reescrever o desafio
  para caber num currículo furado (isso não termina nunca).

## 6. O que o placar não conta — A22 (duas formas) e a discriminação (J5)

### 6.1 A22 — duas formas sintáticas: aviso COM CONTAGEM, e contagem não é verde

A barra classifica A22 como **aviso**: o exit não cai e o `convergir` chamaria a trilha de PONTO-FIXO com
avisos em aberto (`convergencia.ts`, `const semAchado` só olha `severidade === 'erro'`). Os números
medidos em 2026-09-22 (cada um com o comando ao lado):

| Trilha | Comando | Avisos A22 | Exit |
|---|---|---|---|
| `python-iniciante` | `npm run engine -- barra python-iniciante` | **30** (em 112 aulas, 0 erros) | 0 |
| `rust-iniciante` | `npm run engine -- barra rust-iniciante` | **64** na 1ª medição desta execução (e 60 vinte minutos depois — a trilha estava **em autoria**) | 1 |

Leitura operacional: **aviso com contagem não é verde**. A22 é a regra 8 do autor (docs/16 §7.1) — a
construção nova aparece em ≥2 ocorrências sintaticamente distintas, porque uma forma só faz o aluno
induzir regra restrita demais. O curso de referência tem 30 avisos abertos; isso é **dívida medida**, não
licença: em aula nova a meta é **0**, e a contagem da sua trilha só pode **descer** de uma entrega para a
seguinte (o ledger do `converger` guarda o número de cada iteração).

### 6.2 A outra metade — discriminação (J5)

`audit` 0 violações + `coverage` 0 lacunas provam que nenhum desafio cobra o que a aula não
ensinou. J5 responde a pergunta **inversa**: o teste DERRUBA quem não usou a construção da aula?
Medido na trilha `python` (docs/16 §9.1): 21 desafios avaliados, 20 medidos — **17 não
discriminam**. A explicação em uma linha do contrato: o código mínimo que passa em cada desafio é
um único `print("<saída esperada>")` — dos 34 alvos presentes nas soluções, **29 não são forçados
pelo teste**. Leitura operacional para o autor:

- o `EXCESSO` do `coverage` é o sinal vivo: a aula ensina mais do que o teste cobra (*insumo para
  decidir se a aula precisa ser mais quebrada*);
- a classificação de J5 é **aviso com contagem, nunca violação** (decisão do dono registrada em
  docs/16 §9.1 — um CLI dedicado `discrimination` estava marcado como provisório no contrato);
- mesmo como aviso, **P-CONTRA manda autorar já discriminando**: teste que falha sem a construção
  ensinada (ver `qualidade-aula.md` §6).

## 7. `publicar` — o passo final

1. Mova a trilha autorada para `app/resources/tracks/<slug>/` (arquivos: `track.json` com
   `entryCriteria`, `cadeia`, `nivel`, `cursoAnterior`, `modules/` com `module.json` + `lessons/` +
   `challenges/`).
   - **1.5.** Re-prove o ambiente (`_ensure-toolchain.sh --check --language <l>`) antes de
     re-rodar os seis gates.
2. Re-rode os **seis** gates **do local publicado** (sem `--dir`):
   `audit <slug> --limite 0` · `barra <slug>` · `coverage <slug>` · `requirements <slug>` ·
   `track:validate <slug>` · `convergir <slug>`.
3. O curso existe quando o `convergir` sai **0 (PONTO-FIXO)** — achados vazios **e** iteração que não
   aplicou mudança (`recursao.md` §1). Verde numa passada não é entrega. Nenhum veredito por leitura
   humana: o gate decide.

> Avisos de efeito colateral (medidos): `revise <slug>` **escreve em disco** —
> `app/content-src/<slug>/revisao-progressiva/` — e isso não está no `--help`; apague o diretório
> antes de commitar. O `repair` só grava com `--aplicar`. O `convergir` grava o **ledger** nos dois
> modos (`app/content-src/<slug>/convergencia/ledger.jsonl`, append-only, uma linha por iteração): é
> registro, não conteúdo, e é **para ficar**.
