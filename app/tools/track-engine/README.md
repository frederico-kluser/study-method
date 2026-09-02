# Engine de trilhas

A ferramenta que produz e verifica o conteúdo didático. O contrato normativo — princípios, fases,
gates, prompts e proibições — vive em [`docs/16-engine-de-trilha.md`](../../../docs/16-engine-de-trilha.md).
Este arquivo é só o **o que é e como rodar**.

## O problema que ela resolve

Um desafio não pode cobrar o que nenhuma aula ensinou. Hoje o único gate do repositório prova
**forma** (schema válido, solução passa, starter falha) e passa verde numa trilha em que o desafio da
primeira aula exige `function`, parâmetro, `if`, `typeof`, `!==`, `throw`, `new Error`, `return` e
concatenação — numa aula chamada "O que é programação".

A engine transforma essa proibição numa **diferença de conjuntos sobre AST**: cada aula tem um
orçamento cumulativo de construções, e cada superfície de cada desafio é conferida contra ele. Roda
em milissegundos, sem rede e sem chave de API.

## Comandos

```bash
npm run engine -- audit <slug> [opções]
npm run engine -- coverage <slug> [--modo declared|inferred] [--limite N] [--json] [--dir DIR]
npm run engine -- requirements <slug> [--limite N] [--json] [--dir DIR]
npm run engine -- revise <slug> [--limite N] [--json] [--dir DIR]
npm run engine -- generate <slug> --assunto "..." [--from FASE] [--only slug] [--teto-tokens N]
npm run engine -- lint-schemas
```

| Opção | O que faz |
|---|---|
| `--modo declared\|inferred` | de onde vem o orçamento. Sem a flag: `declared` se alguma aula declara `introduces`, senão `inferred` |
| `--harness receptive-seed\|none` | se o harness de teste (`import`, `export`, `assert.*`) entra no orçamento receptivo da aula 1. Default `receptive-seed` |
| `--limite N` | no `audit`: quantas violações imprimir (`0` = nenhuma, só o placar). No `coverage`/`requirements`/`revise`: quantos desafios/aulas **processar e imprimir** (`0` = nenhum) — amostra rápida, já que o coverage e o revise spawnam `node --test` por candidato |
| `--so-lacunas` | mostra apenas as lacunas de currículo — construção que **nenhuma** aula ensina |
| `--json` | relatório completo em JSON, para outra ferramenta consumir |
| `--dir DIR` | (`audit`/`coverage`/`requirements`/`revise`/`repair`) carrega a trilha de outro diretório, ex.: `--dir content-src/<slug>/trilha` para auditar uma trilha ainda não publicada em `resources/tracks`. Com `--dir`, o slug é só o rótulo do relatório |

Exit codes, na convenção do repositório: **0** sem violação · **1** violações encontradas · **2** uso
incorreto.

## `coverage` — o ALGORITMO DO DONO (código mínimo que passa no teste)

O `audit` responde "o que a aula oferece". O `coverage` responde o lado do teste:
**qual é o MENOR código que passa no teste?** Para cada desafio da trilha
(aulas + desafio do módulo + proficiência), ele:

1. **Sintetiza** o código mínimo — determinístico, zero LLM
   (`engine/quality/minimal.ts`): lê os literais dos `assert.equal/…` do teste,
   gera candidatos na ordem de minimalidade (eco `return <param>;`, literal
   `return <literal>;`, do zero, preenchimento da lacuna, export) e roda cada
   um pelo **prover REAL** (`criarProverDeDesafio` — `node --test` de verdade)
   sob o semáforo SEM_EXEC; o primeiro que passa nas quatro provas vence;
2. **Extrai os átomos** do mínimo (`extractAtoms`) — *o que o teste
   REALMENTE cobra*;
3. **Compara com o orçamento da aula** (`budget.ts`):
   - **LACUNA** — átomo do mínimo fora do orçamento produtivo+receptivo da
     aula: *o teste cobra algo que a aula não oferece* (violação);
   - **EXCESSO** — construção que a aula introduz e o mínimo não usa: *a aula
     ensina mais do que o teste cobra* (informativo — insumo para a decisão
     "a aula precisa ser mais quebrada?").

Fail-closed: teste que não parseia → `parse-falhou`; prover com falha de
infra em todas as tentativas → `prover-falhou`; nenhum candidato passa →
`sem-solucao` (sinal de teste quebrado **ou** de solução que exige mais que
literais — computação real, loop, estado). Desafios multi-arquivo (`files`)
são ignorados nesta onda. Exit **1** quando há LACUNA ou desafio sem solução
acessível.

Medição de 2026-08 sobre a trilha micro `programacao-do-zero` (modo
`declared`), **apagada em 2026-09-02** junto com o resto do conteúdo gerado:
**14/14 desafios tinham solução mínima**, 0 lacunas e 8 excessos — os testes
quase todos exigiam só `function + return + literal`, e as aulas de
`let`/`const`/chamada ensinavam construção que o teste não exercitava. É
exatamente o tipo de sinal que decide a quebra de aula.

```bash
cd app && npm run engine -- coverage <slug> --dir content-src/<slug>/trilha
```

Na trilha grande da mesma época (`nodejs-do-zero`, modo `inferred`, 137
desafios): 23 com solução mínima, 96 sem-solução (os testes exigiam computação
real), 18 multi-arquivo ignorados, **10 lacunas** (o teste cobrando construção
fora do orçamento da aula).

## `requirements` — DERIVAÇÃO + BIJEÇÃO requirements × test('…')

Para cada desafio, `derivarRequirements` (`engine/quality/requirements.ts`)
gera UM requirement por `test('nome', …)`, com descrição em pt-BR derivada do
**texto real** do assert ("A função eco deve devolver 7 quando chamada com 7")
e o nome do teste mapeado; `validarRequirements` confere a **bijeção** com o
campo `requirements` declarado no `challenge.json`:

- requirement declarado **sem** `test('…')` correspondente → gap `semTeste`;
- `test('…')` **sem** requirement declarado → gap `testesSemRequirement`.

Exit **1** quando algum desafio tem gap. Na trilha legada de 2026-08 (sem o
campo `requirements`) eram 137 desafios com gap — 577 testes sem requirement
declarado.

## `revise` — a REVISÃO PROGRESSIVA (o núcleo do pedido do dono)

O `coverage` responde "o que o teste cobra × o que a aula oferece" desafio a
desafio. O `revise` sobe um nível: **percorre o curso da 1ª à última aula**,
acumulando o feedback de cada aula como **memória** para a seguinte, decide
aula a aula se ela **precisa ser mais quebrada** e repete a varredura até o
relatório **convergir** (hash estável — máximo 3 iterações, válvula anti-loop).

Para cada desafio de cada aula (na ordem pedagógica), o `revise`:

1. **Sintetiza o código mínimo** que passa no teste (`quality/minimal.ts`,
   zero LLM — a etapa de validação que confirma que o teste tem solução);
2. **Compara `atoms(minimal)` com o orçamento DECLARADO da aula**
   (`deriveTrackBudget(track, { mode: 'declared' })` — `introduces` do
   `lesson.json`, a mesma fonte do audit em modo declared):
   - **LACUNA** — átomo do mínimo fora de `productive ∪ receptive`: o teste
     cobra construção que a aula não oferece ⇒ **`precisaQuebrar = true`**
     (candidato a SPLIT);
   - **EXCESSO** — `introduces.productive` não usado pelo mínimo: a aula
     ensina mais que o teste cobra ⇒ candidato a remover do `introduces` ou
     cobrir com desafio (**ajuste**, nunca violação — excesso receptivo é
     by-design);
3. **Fail-closed** — veredito não-ok (`SEM_SOLUCAO_ACESSIVEL` /
   `PARSE_FALHOU` / `PROVER_FALHOU`) ⇒ aula **NÃO-REVISÁVEL**, documentada,
   nunca loopa;
4. **SPLIT** — quando `precisaQuebrar`, **nada se perde**: o `minimalCode` +
   `atoms` são gravados como artefato (`splits/<aula>--<desafio>.minimal.mjs`
   + `.seed.json`) e registrados como **pendência** no relatório — a aula nova
   sai de sub-agente LLM com o minimalCode como **semente** (sem LLM na
   execução, a pendência fica registrada com o código pronto);
5. **Memória** — o feedback da aula N vira contexto da N+1 (`memoriaDeRevisao`
   com `aulaAnterior`, `lacunasVistas` e `decisoes`); o relatório final
   registra o que foi aprendido e reavaliado (progressividade);
6. **Sinal secundário** — `validarRequirements` (bijeção requirements ×
   test('…')) é registado por desafio como feedback de **ajuste**, nunca como
   motivo de split.

O relatório é gravado em `content-src/<slug>/revisao-progressiva/`
(`relatorio-revisao.json` + `relatorio-revisao.md` em pt-BR + seeds de split).
Exit **1** quando há lacuna ou aula não-revisável; **0** quando converge sem
lacunas.

```bash
cd app && npm run engine -- revise <slug> --dir content-src/<slug>/trilha
```

`generate` executa F0 a F12 e produz uma trilha nova em `app/resources/tracks/<slug>`: o run (run.json +
ledger + telemetria + artefatos + drafts) vive em `app/content-src/<slug>` e é **retomável** — repita o
comando com `--from <fase pendente>` após interrupção. A F6 (piloto de 3 aulas) **para para revisão
humana**: escreva `app/content-src/<slug>/aprovacaoF6.json` com `{"aprovado": true}` e retome. Sem chave
de API, o run é criado mesmo assim e o erro declara a limitação (exit 2). `lint-schemas` roda o preflight
do build (INV-04/INV-05) sobre o registro real de schemas. `repair` — o modo que chama a LLM para corrigir
conteúdo existente — ainda não está implementado: a ordem de construção (§14 do documento normativo) põe
o gate determinístico primeiro de propósito.

## Os dois modos de orçamento

**`declared`** — a aula declara o campo aditivo `introduces` no `lesson.json`. É o modo da engine
geradora e o único à prova de fraude: colar a solução dentro da teoria **não** amplia o orçamento.

**`inferred`** — o orçamento é lido do código que a teoria mostra. É o único modo possível sobre
conteúdo legado, que não tem `introduces`, e é deliberadamente **permissivo**: tudo que a teoria
exibe conta como ensinado. Toda violação encontrada em modo inferido é, portanto, um **piso** — o
número real é maior, nunca menor.

## O estado do conteúdo hoje

**Não há conteúdo.** `app/resources/tracks/` está vazio desde 2026-09-02: as
duas trilhas geradas foram apagadas porque a grande era pedagogicamente
indefensável (a aula 1 introduzia 16 construções novas com teto 4, e o primeiro
desafio do curso já exigia `if`/`typeof`/`!==`/`throw new Error`). O registro
completo, com o placar medido, está em `docs/15-trilha-nodejs.md`.

O gate continua inteiro e é o que decide se a PRÓXIMA trilha entra. Sobre
qualquer trilha, publicada ou não:

```bash
cd app && npm run engine -- audit <slug> --limite 0
cd app && npm run engine -- audit <slug> --dir <dir> --limite 0   # ainda não publicada
```

Só as lacunas de currículo:

```bash
cd app && npm run engine -- audit <slug> --so-lacunas --limite 30
```

## O histograma

A saída humana termina com a distribuição de construções novas por aula. É o gráfico que denuncia o
defeito de **distribuição** — penhasco na primeira aula, platô no resto — que foi o defeito medido na
trilha apagada, e que nenhum contador de aulas mostra.

## Testes

```bash
cd app && bash tools/t.sh tests/engineBudgetGate.test.ts
cd app && bash tools/t.sh tests/engineMinimal.test.ts tests/engineRequirements.test.ts
cd app && bash tools/t.sh tests/engineRevision.test.ts
```

32 testes do gate de orçamento, sem rede e sem disco: fixtures de trilha em
memória. Os dois que mais importam são
`REPROVA o caso canônico` (a aula 1 cobrando `typeof` e `throw` sem ter ensinado) e
`APROVA uma trilha coerente` — um gate que só reprova é tão inútil quanto um que só aprova.

25 testes do algoritmo do dono: `engineMinimal` (sintetizador determinístico —
L1 → `return 7;`, echo → `return texto;`, soma impossível → `SEM_SOLUCAO_ACESSIVEL`,
fail-closed `PARSE_FALHOU`/`PROVER_FALHOU`, e integração com o prover REAL que
spawna `node --test`) e `engineRequirements` (derivação + bijeção requirements ×
testes). Os unit tests do sintetizador usam um prover FAKE que importa o
candidato via data URL e avalia os asserts com lógica real.

6 testes da revisão progressiva (`engineRevision`, prover FAKE + trilha em
memória): lacuna fora do orçamento ⇒ `precisaQuebrar=true` com motivo; aula
coberta ⇒ false; teste impossível ⇒ não-revisável (fail-closed, sem loop);
convergência em 2 iterações estáveis; memória da aula 1 no contexto da aula 2;
SPLIT com minimalCode persistido como artefato (pendência registrada mesmo sem
LLM).

## Onde o código vive

| Arquivo | Responsabilidade |
|---|---|
| `app/electron/main/engine/atomKeys.ts` | o vocabulário fechado de construções, em seis eixos |
| `app/electron/main/engine/extract.ts` | o extrator determinístico sobre o AST do TypeScript |
| `app/electron/main/engine/theoryCode.ts` | separar código de prosa dentro da teoria |
| `app/electron/main/engine/budget.ts` | derivação do orçamento cumulativo, nas duas faixas |
| `app/electron/main/engine/audit.ts` | a bateria de gates e o relatório de violações |
| `app/electron/main/engine/quality/minimal.ts` | o sintetizador determinístico do código mínimo que passa no teste (zero LLM) |
| `app/electron/main/engine/quality/requirements.ts` | derivação de requirements do teste + validação da bijeção requirements × test('…') |
| `app/electron/main/engine/revision/progressiva.ts` | a REVISÃO PROGRESSIVA: varredura 1ª → última aula com memória acumulada, decisão de SPLIT (fail-closed) e convergência por hash — zero LLM |
| `app/tools/track-engine/cli.ts` | a entrada de linha de comando (audit, coverage, requirements, revise, generate, lint-schemas) |

Nenhum deles chama LLM. A engine não escreve aula: quem escreve conteúdo é o autor-LLM, nos modos
`generate` e `repair`, recebendo o orçamento congelado como restrição dura. O código aqui produz o
orçamento, verifica o resultado e aponta o defeito — inclusive o defeito do lado do TESTE: o
`coverage` mostra o que cada teste realmente exige, e o `requirements` aponta requirement que não
tem teste e teste que não tem requirement.
