# Recursão até o ponto fixo — o passo `converger`

Regras de execução do passo `converger` (entre `validar_modulo` e `publicar`). O pedido do dono,
textual: *"quero recursão sem fim na validação ao entregar o curso até ele estar ideal e ter nele
tudo que o aluno precisa para aprender"*. **Sem fim = sem teto de rodadas**, nunca "sem prova de
terminação": laço sem medida que decresce é promessa de laço infinito. O executor é determinístico e
offline — `engine/modes/convergencia.ts`, ZERO LLM, ZERO rede, sem chave de API:

```bash
cd app && npm run engine -- convergir <slug>          # DRY-RUN (default): mede, classifica, planeja
cd app && npm run engine -- convergir <slug> --aplicar # grava SÓ o determinístico (ordem + esqueleto)
```

Exit **0 só em PONTO-FIXO** · **1** em CICLO, SEM-PROGRESSO, TETO ou achado remanescente · **2** uso
incorreto. Medido em 2026-09-22 02:03 (`convergir rust-iniciante`, dry-run): `ITERACAO 1 · mu 34 ·
VETOR orcamento 13 · lacunas 0 · barra 13 · excesso-de-passo 18 · sem-demo 3 · sem-desafio 0 ·
secoes-insuficientes 1`, `RAMOS ORDEM 3 · CADEIA 0 · LACUNA 0 · QUEBRA 10 · DEMONSTRACAO 3 · PROVA
0`, `VEREDITO: DRY-RUN`, exit 1. (As trilhas `rust-iniciante` e `c-iniciante` estavam **em autoria**
nesta execução: os números mudam a cada hora — rode o comando, não cite estes.)

## 1. O laço, em seis linhas

```
1. MEDIR       audit (A1–A6, DEC, I12/I14–I17 + a distinção §5.5) e barra (A17–A24), em memória
2. CLASSIFICAR cada achado em UM dos SEIS ramos (§2) — ramo decide a ação do catálogo FECHADO
3. PLANEJAR    ação com arquivo + alvo + resultado esperado; a QUEBRA ganha plano de aulas novas
4. APLICAR     só o que é decidível por código (ordem provada + esqueleto da aula nova)
5. REGISTRAR   uma linha no ledger (§5) — nos DOIS modos, sempre
6. MEDIR DE NOVO e repetir; PARA por PONTO-FIXO, CICLO, SEM-PROGRESSO ou TETO (§4)
```

**Verde numa passada não é entrega.** O ponto fixo exige as duas condições ao mesmo tempo: conjunto
de achados VAZIO **e** iteração que não aplicou mudança. Uma iteração que conserta algo e fica verde
ainda não terminou — a seguinte é que prova.

## 2. Os seis ramos — o catálogo é FECHADO

Quem escolhe o ramo é o gate, nunca a leitura. `primeiraAulaQueEnsina` (docs/16 §5.5) separa (a) de
(b)/(c); `engine/graph/cadeia.ts::ensinadoAntesNaCadeia` separa (b) de (c).

| Ramo | Sinal que o produz | Ação do catálogo | Quem executa |
|---|---|---|---|
| ORDEM | `primeiraAulaQueEnsina !== null` | `REWRITE_IN_BUDGET` ou mover | `npm run engine -- reorder <slug>` (dry-run, zero LLM) |
| CADEIA | não ensinada aqui, ensinada em curso ANTERIOR | `MOVE_CONCEPT_TO_ENTRY_BUDGET` | aula própria no módulo porta-de-entrada (`interligacao.md` §3) |
| LACUNA | não ensinada em lugar nenhum da cadeia | `INSERT_INTERMEDIATE` | `npm run engine -- gap <slug>` (plano em dry-run) |
| QUEBRA | A17 · A18 · A21 (o passo é grande demais) | `SPLIT_LESSON` | o procedimento do §6 |
| DEMONSTRACAO | A19 · A22 · A23 (declarar não é demonstrar: a chave não aparece em bloco de código desta aula) | `REWRITE_IN_BUDGET` | autoria (`aula-author`) |
| PROVA | A20 (aula sem desafio / sem produtiva nova) · A24 (o quiz se acerta pelo comprimento das opções) | `ADD_TEST` · `DECLARE_INTEGRATIVE` · `REWRITE_IN_BUDGET` | autoria (`aula-author`) |

Achado que não cai em nenhum ramo sai em **ACHADOS FORA DOS SEIS RAMOS**, declarado, nunca
improvisado (medido na mesma execução: 10 pendentes, todos invariante de ESTRUTURA sem chave de
átomo). Fora-do-ramo **bloqueia** o ponto fixo: é trabalho para o humano, não licença para seguir.

## 3. A prova de terminação

A medida é um inteiro não-negativo (`convergencia.ts::muDoVetor`):

```
mu = excessoDePasso + chavesSemDemonstracao + aulasSemDesafio + violacoesDeOrcamento + lacunasDeCurriculo
```

- **movimento de ORDEM** só é gravado depois de `reorder` provar, sobre a trilha re-derivada em
  memória, que o alvo sumiu e que NENHUMA violação nova apareceu (verificação DIFERENCIAL) — logo
  cada movimento aplicado desce `violacoesDeOrcamento` em ≥1 e não sobe nenhuma componente;
- **`SPLIT_LESSON` reduz `excessoDePasso` ESTRITAMENTE** porque o excesso é `Σ max(0,
  produtivasColapsadas − 2) + max(0, novasTotais − 4)` **por aula**: distribuir os grupos de uma
  aula por N aulas em que cada pacote respeita os dois tetos zera as duas parcelas daquela aula e
  não cria parcela nova (cada pacote nasce dentro do teto). O passo só desce a medida se as chaves
  **saírem** do `introduces` da aula original **junto com a demonstração**;
- **a quebra é idempotente**: o slug da aula nova é `passo-<construção>-<sha256(grupo)[0..8]>` e o
  planejador marca `jaExiste: true` quando ele já está no `module.json` — cada aula nova é criada no
  máximo uma vez, e o número de quebras possíveis é finito (≤ aulas × grupos).

⚑ **Divergência declarada, e ela é do executor, não da regra** (`convergencia.ts`, seção "ONDE A
PROMESSA OTIMISTA NÃO SE SUSTENTA"): o `--aplicar` **não** mexe no `introduces` de aula existente,
porque mover a declaração sem mover a demonstração criaria A19 (chave sem bloco que a demonstre) e
A20 (aula sem desafio) — μ **subiria**. Consequência medida: o `--aplicar` cria o esqueleto,
`excessoDePasso` da aula original **não cai**, a iteração seguinte reprova a aula nova por A20 e o
laço para em SEM-PROGRESSO com exit 1. Isso é o desfecho **correto**: a descida até o ponto fixo
exige a etapa de AUTORIA (`aula-author`), que é de quem tem LLM. O laço determinístico não finge ter
convergido.

## 4. As paradas, na ordem em que disparam

| Parada | Condição | O que fazer |
|---|---|---|
| PONTO-FIXO | achados == ∅ **e** nada aplicado nesta iteração | entregar: seguir para `publicar` (exit 0) |
| CICLO | `hashDoVetor` repete um hash já visto | PARE e ESCALE ao humano: o vetor voltou, alguma ação desfaz a outra — não re-aplique |
| SEM-PROGRESSO | nenhuma componente do vetor desceu **e** nada foi aplicado | PARE e ESCALE: o que sobra exige AUTORIA ou decisão de currículo |
| TETO | só com `--max-iteracoes N` | use apenas para amostrar; teto não é veredito |
| DRY-RUN | o modo default fecha depois de UMA iteração | é o modo, não defeito: sem aplicar nada o vetor não muda. Exit 1 — e sem achado nenhum o veredito já sai PONTO-FIXO |

Não existe teto de rodadas por default — `--max-iteracoes` ausente = sem teto. O que tem teto é o
**trabalho sem sinal**: mudança que não está ancorada em achado com `arquivo`:`alvo` é PROIBIDA. E
"aceitar por cansaço" é proibido (docs/16 §6.6): as três paradas que não são ponto fixo **escalam**.

⚑ **Duas coisas que o PONTO-FIXO do comando NÃO confere — e que o autor confere na mão** (medido no
código da cascata, `convergencia.ts`, `const semAchado`):

1. **A22 é aviso e não bloqueia** o ponto fixo (`achados.every(a => a.severidade === 'aviso')`). O
   `python-iniciante` sai com 0 erros e **30** avisos A22 e o laço chamaria isso de PONTO-FIXO (`npm
   run engine -- barra python-iniciante` → exit 0). P-MICRO/A22 continua sendo dever do autor: aviso
   com contagem não é verde.
2. **`checagensNaoExecutadas` não entra na cascata.** O ledger REGISTRA `limitacoesDeclaradas:
   ["A13-A16-NAO-RODOU"]` em toda trilha python/rust/c (`npm run engine -- audit <slug> --limite 0
   --json` → `totals.checagensNaoExecutadas` **1**), e nenhuma parada olha esse campo. P-NAO-MEDIDO
   é a regra que fecha o buraco: enquanto o contador for > 0, a trilha está PENDENTE DE MEDIÇÃO e
   cada limitação precisa de substituto rodado e registrado (`validacao.md` §3).

## 5. O ledger — toda iteração é registrada

Caminho: `app/content-src/<slug>/convergencia/ledger.jsonl`. **Append-only**, uma linha JSON por
iteração, nos DOIS modos (é a única escrita do dry-run, e é de REGISTRO, não de conteúdo). Os
catorze campos, na ordem do arquivo — evidência antes do veredito (§6.3):

```
iteracao · commit · ambiente · medicoes[] (comando + exit + placar) · limitacoesDeclaradas[] ·
vetor (7 componentes) · mu · achadosPorRamo · achadosForaDosRamos · acoesPlanejadas[] ·
acoesAplicadas[] · planosDeQuebra[] · hashDoVetor · veredito
```

```bash
cd app && jq -c '[.iteracao,.mu,.hashDoVetor,.veredito]' content-src/<slug>/convergencia/ledger.jsonl
# 2026-09-22 02:03, rust-iniciante: [1,34,"bd713558d0e74980","DRY-RUN"]
```

Regra: **iteração sem linha no ledger não aconteceu**. Se você rodar o laço à mão (editando entre as
medições), acrescente a linha você mesmo, com os mesmos campos — o `commit` e o `ambiente` são o que
permite alguém reproduzir o número um mês depois.

## 6. O procedimento da QUEBRA — passos numerados

O ramo (c) do dono ("quebrar o conteúdo da aula problemática em mais conteúdos") era conselho em 4
lugares e procedimento em nenhum. É este:

1. **Inventarie as chaves da aula, por superfície** — o declarado e o usado (no `--json` do `audit`,
   o campo `campo` de cada violação diz a superfície: `theory`, `starterCode`, `testsCode`,
   `solutionCode`).

   ```bash
   cd app && jq -c '.introduces' resources/tracks/<slug>/modules/<mod>/lessons/<aula>/lesson.json
   cd app && npm run engine -- audit <slug> --limite 0 --json > /tmp/audit.json
   ```

2. **Agrupe por co-ocorrência de LINHA e NUNCA parta um grupo.** Os grupos são publicados pelo gate
   (`barra.agruparPorLinha`): se três chaves saem da MESMA linha de um bloco desta aula, não existe
   aula que ensine duas e não a terceira.

   ```bash
   cd app && npx tsx tools/track-engine/cli.ts barra <slug> --json > /tmp/barra.json
   jq '.metricas[] | select(.ref=="<mod>/<aula>") | .grupos' /tmp/barra.json
   ```

3. **Empacote em aulas de ≤2 grupos produtivos e ≤4 chaves novas** (A17 e A21), na ordem da primeira
   ocorrência na teoria — grupo que aparece antes vem antes. Na aula 1 da trilha o teto do primeiro
   pacote é **1 grupo produtivo** (A18/P-ZERO). Grupo que SOZINHO estoura o teto de chaves **não se
   parte**: declare `introduces.derived` com a chave que distingue como pai, e A23 colapsa o grupo
   em 1 item.
4. **Posicione cada aula nova imediatamente antes da aula original**, no array `lessons` do
   `module.json`, com `prerequisites` = a aula anterior na ordem nova. O plano dá slug, título,
   índice e ficha de `autoria`: `npm run engine -- convergir <slug>` imprime `PLANOS DE QUEBRA` com
   `AULA NOVA … entra antes de … (indice N do module.json)`; `--aplicar` grava o esqueleto e o
   `module.json`.
5. **Reescreva a aula original com o que sobrou.** O plano diz literalmente `a aula original FICA
   com:` e `a aula original PERDE:` — tirar do `introduces` o que foi para as aulas novas é trabalho
   de AUTORIA (mover a declaração sem mover a demonstração cria A19; §3).
6. **Re-rode o laço.** `npm run engine -- convergir <slug>` de novo, e depois os seis gates de
   `validacao.md`. A aula nova nasce reprovando por A20 (sem desafio) — isso é correto: o trabalho
   fica VISÍVEL no gate até alguém autorar.

Exemplo medido (2026-09-22 02:03, `convergir rust-iniciante`): a aula 1 do Rust
(`a-tela/a-primeira-funcao`) tinha **3 grupos** — dois produtivos, cada um com 5 chaves da mesma
linha, e um receptivo (`api:todo!`) —, teto de 1 grupo produtivo no primeiro pacote, e o plano
prescreveu **1 aula nova** (`passo-node-functionitem-15c0fd88`, índice 0 do `module.json`), a
original perdendo 5 chaves e ficando com 6, mais duas prescrições de `introduces.derived` (4
derivadas cada).

## 7. Armadilhas medidas ao rodar o laço

- **Ler `--json` pelo pipe TRUNCA.** Medido: `barra rust-iniciante --json` canalizado para outro
  processo sai com **65536** bytes; redirecionado para arquivo, **78925** — o corte só acontece
  quando o comando sai ≠ 0. Regra: `npx tsx tools/track-engine/cli.ts <cmd> --json > arquivo` e leia
  o arquivo.
- **`npm run` põe o banner no STDOUT** (3 linhas `> study-method-gui@0.1.0 engine …`): o arquivo
  começa com `>` e o `jq` recusa. Para JSON, chame o CLI direto (`npx tsx tools/track-engine/cli.ts
  …`).
- **Reescrever o desafio para caber num currículo furado é PROIBIDO** (docs/16 §5.5): é o laço que
  nunca termina. Lacuna vira aula; passo grande vira quebra.
