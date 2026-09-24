# Receita de UMA aula — a parte COMUM às três linguagens

Regras de execução dos passos `ler_contrato (módulo)`, `escrever_teoria`, `escrever_quiz` e
`escrever_desafio_e_testes` que **não dependem da linguagem da trilha**: o layout da aula, os dois
schemas, as fases do canal, a regra do par (`introduces.derived`) e o gate das demonstrações.

**O que depende da linguagem tem arquivo próprio** (§6): inventário de chaves, axioma de entrada,
semente receptiva do harness, forma do arquivo de teste, tetos medidos e armadilhas do adaptador.

> **POR QUE ESTE ARQUIVO FOI PARTIDO EM QUATRO** (decisão desta execução, 2026-09-22). A versão
> anterior era Python por dentro — mandava ler `docs/17-trilha-python.md` como se fosse *o*
> contrato (**14 ocorrências** — `git show HEAD:skills/aula-author/references/receita-da-aula.md |
> grep -c docs/17`), e §5–§8 eram o adaptador de Python. O produto tem **três** trilhas em
> autoria: `python-iniciante`, `rust-iniciante` e `c-iniciante` (`ls
> app/resources/tracks/`). Uma referência é aberta INTEIRA quando é aberta: juntar as três línguas
> num arquivo só faria o autor de C ler as regras de `runpy` do Python — e ler a regra da língua
> errada é exatamente a classe de defeito que o gate existe para impedir. Por isso: **comum aqui,
> língua em `receita-da-aula-<língua>.md`**, sem língua privilegiada.

## 0. A aula como unidade — o que vai no disco e o que o adaptador GERA

No disco a aula é **dois arquivos JSON**, e só:

```
modules/<mod>/lessons/<aula>/lesson.json
modules/<mod>/lessons/<aula>/challenges/<desafio>/challenge.json
```

Medido em 2026-09-22 na trilha de referência (112 aulas + 1 desafio de módulo = 113 desafios):

```bash
cd app/resources/tracks/python-iniciante
find . -name challenge.json | wc -l   # → 113
find . -name 'solucao.py' | wc -l     # → 0
find . -name '__init__.py' | wc -l    # → 0
```

**Fonte, starter, teste e solução moram DENTRO do `challenge.json`** (`starterCode`, `testsCode`,
`solutionCode`). A árvore que o runner compila/executa (`solucao.py` + `tests/__init__.py`;
`Cargo.toml` + `src/lib.rs` + `tests/desafio.rs`; `solucao.c` + `tests/sm_harness.h` +
`tests/sm_main.c` + `run.sh`) é **GERADA** pelo `layout()` do adaptador num diretório temporário, a
cada prova de execução. Nunca escreva esses arquivos no repositório: a tabela de cada um está no
arquivo da língua (§6).

- **A ORDEM PEDAGÓGICA é a ordem de `module.json`** — `lessons[]` é uma lista ORDENADA e o loader
  lê aula por aula nela (`electron/main/content/trackLoader.ts:186`); os módulos vêm por
  `module.json.order` (`engine/budget.ts:156`, `pedagogicalOrder`). Criar o diretório da aula **não**
  a coloca na trilha: o slug entra em `module.json.lessons[]`, na posição certa. É por aí que a
  quebra POSICIONA a aula nova (`quebra-da-aula.md` §4).
- `slug === basename(dir)` (I13) e o slug é único na trilha (I12).
- O desafio de **módulo** vive em `modules/<mod>/challenges/<slug>/challenge.json` e é declarado no
  `module.json` como `challenge`; ele compõe o que o módulo ensinou e **não introduz construção
  nova**.

## 1. `lesson.json` — o schema real

`schemaVersion: 1` (bumpar é **proibido** — docs/16 §10).

| Campo | O que vai | Exemplo vivo |
|---|---|---|
| `slug` | kebab-case ASCII; único na trilha (I12); `=== basename(dir)` (I13) | `a-primeira-linha` |
| `title` / `summary` | pt-BR; resumo de uma linha | `A primeira linha` |
| `difficulty` | 1..5 — **nenhum gate o lê** (docs/16 §10); use a rampa do grafo | `1`..`4` |
| `role` | `regular` (introduz) · `integration` (composição) — enum da engine; `consolidation` é o que o disco usa com o degrau nomeado (divergência ⚑ declarada em docs/16 §3.7) | `regular` |
| `targetAtom` | a chave que a aula distingue (o átomo-alvo da lacuna única) | `global:print`, `api:printf`, `node:FunctionItem` |
| `concepts[]` | `concept.id` (nunca slug de aula); `challenge.concept` ∈ `lesson.concepts` (I16) | `["imprimir"]` |
| `prerequisites[]` | `concept.id` — type check duro, **nunca** `lesson.slug` (docs/16 §3.4) | `["devolver-em-vez-de-mostrar"]` |
| `introduces` | `productive[]`, `receptive[]` e o aditivo `derived[]` (§4); invariante `productive ⊆ receptive` | ver §4 |
| `introducesTerms[]` | termos novos da prosa (`term:`) — não são átomos, não entram em `productive` | `["term:recuo"]` |
| `notionalMachineDelta?` | o que muda na máquina nocional | aula `se` |
| `theory[]` | seções `{id, title, markdown}` — ids únicos (I15), **âncoras do quiz** (`sectionId`); blocos cercados **com tag da língua** (§5) | `se`, `ordenar` |
| `assertions[]` | o quiz: `id`, `statement`, `question`, `options` (**exatamente 4**), `answerIndex`, `feedback`, `sectionId?`, `optionRationales?` | `imprimir-nao-e-devolver` |
| `sources[]` | **2–3 fontes oficiais** (P-FONTE): `title`, `url` verificável, `description` | `se` (3 fontes) |
| `challenges[]` | slugs dos desafios desta aula — **vazio reprova em A20** | `["escreva-oi"]` |

**Quiz — regras duras (medidas):**

- **Máx. 3 afirmações por aula** — `MAX_ASSERTIONS_PER_LESSON = 3` (`content/trackTypes.ts`, hoje na linha 602 — `grep -n MAX_ASSERTIONS_PER_LESSON`); o
  loader reprova 4+. Use 2–3.
- `options` com **exatamente 4** itens, não vazios, únicos; `answerIndex` aponta o certo.
- `feedback` diz por que a certa é certa (ou qual é o erro do distrator), em tom diagnóstico,
  **nunca** dirigido à pessoa.
- `optionRationales`: ausente = válido; `[]` = ausência explícita; não-vazio = comprimento
  **exatamente igual** ao de `options`, na MESMA ordem (docs/16 §10).
- `sectionId` aponta a seção que DEMONSTRA a afirmação — não renomeie id de seção sem revalidar.

**Teto de leitura (todas as línguas):** cada seção MONTADA (markdown + cercas + explanation) ≤ **560
chars**; o gate é `tests/lessonTypewriterReadingSpeed.test.ts`, que varre `resources/tracks`
INTEIRO (não só Python) e trava 7 tps = 28 chars/s com teto de 21 s ⇒ 588 chars. Medido nesta
execução: `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` → **15 pass · 0 fail**,
exit 0. Estourou? **Encurte a prosa — nunca remova a demonstração da construção nova** (A19).

## 2. `challenge.json` — o schema real

| Campo | O que vai |
|---|---|
| `slug` / `title` / `concept` | slug kebab único; `concept` ∈ `lesson.concepts` |
| `difficulty` | herda a rampa da aula (provisório, sem peso de gate) |
| `language` | o token da trilha: `"python"` · `"rust"` · `"c"` (o `track.json` declara `programmingLanguage`, `runtime` e `harnessLanguage`) |
| `outputChannel` | a fase do canal: `"impressao"` · `"ambos"` · `"retorno"` (§3) |
| `statement` | markdown pt-BR; o exemplo do enunciado **nunca** é caso de teste (J4) |
| `starterCode` | o esqueleto do aluno; **falha** nas provas (prova 2) |
| `testsCode` | o arquivo de teste na forma da língua (§6) |
| `solutionCode` | a solução de referência; **passa** e contém o átomo-alvo (A6/J2) |
| `expectedTestCount` | = número exato de testes (igualdade dupla: declarada == executada) |
| `requirements[]` | **objetos** `{id, teste, descricao}`, UM por teste (§2.1) |

Campos aditivos opcionais (docs/16 §10): `notRequired[]`, `subgoals[]`, `foraDeEscopo`.

- A função do desafio é derivada do slug, **na convenção da língua** (§6): `dobro-do-numero` →
  `dobro_do_numero` (Python, Rust) · `dobroDoNumero` (C, docs/20).
- **2–4 testes** por desafio de aula; **todo teste carrega um rótulo de uma linha em pt-BR** — é a
  legenda que o veredito mostra ao aluno (docstring em Python, nome + rótulo do `checa_*` em C,
  nome do `#[test]` em Rust).
- As **proibições globais** são por língua e valem em QUALQUER superfície (statement, starter,
  teoria, solução, teste) — lista e motivo em §6. Elas aparecem só em prosa com crase, nunca em
  bloco cercado.

### 2.1 `requirements[]` — bijeção 1:1 com os testes

Array de **objetos** `{id, teste, descricao}`; **string solta é ignorada e vira gap** (medido). Um
por teste, `teste` = o nome exato do teste no arquivo.

```json
"requirements": [
  { "id": "REQ-1",
    "teste": "testa_dobro_positivo",
    "descricao": "A função dobro deve devolver 4 quando chamada com 2." }
]
```

`derivarRequirements` lê os testes do **arquivo de teste** (não da solução nem do enunciado) e
`validarRequirements` confere a bijeção nos dois sentidos: gap `semTeste` (declarado sem teste) e
gap `testesSemRequirement` (teste sem declaração). Comando: `npm run engine -- requirements <slug>`
(**sem** `--limite` — ver `validacao.md` §3).

## 3. As TRÊS fases de canal — a progressão que não se inverte

`outputChannel` é o mesmo enum nas três línguas, e a progressão é pedagógica: **impressão →
`ambos` → retorno**. Inverter troca o modo de falha nº 1 de exercício gerado (solução imprime
enquanto o teste espera retorno — 30,9% medido, docs/16 §10) por uma concepção errada sobre
imprimir × devolver.

| Fase | `outputChannel` | O que o teste mede | Onde está a forma exata |
|---|---|---|---|
| SAÍDA | `"impressao"` | o que o programa IMPRIME (captura de `stdout`) | §6, arquivo da língua |
| A VIRADA | `"ambos"` | os TRÊS fatos: devolve · imprime · chamar sozinha não imprime | §6, arquivo da língua |
| VALOR | `"retorno"` | o que a função DEVOLVE | §6, arquivo da língua |

A virada é **uma aula própria** em cada trilha, e o desafio dela tem os três fatos no mesmo
arquivo (`expectedTestCount: 3`).

## 4. A regra do par — agora é um CAMPO, não uma interpretação

Uma construção quase nunca produz uma única chave. Medido com o extrator real (§5):

| Trecho | Chaves não-estruturais, na MESMA linha |
|---|---|
| `print("bom dia")` (python) | `global:print` · `node:Call` · `node:StrLiteral` |
| `printf("oi\n");` (c) | `api:printf` · `node:CallExpr` · `node:StringLiteral` |
| `x * 2` (rust) | `op:binary:*` · `node:BinaryExpression` · `node:IntegerLiteral` |

O contrato sempre disse que "a chave que DISTINGUE + as derivadas que a mesma construção produz
inevitavelmente contam como UM item". Até 2026-09-22 isso era **prosa**: quem colapsava era o
parágrafo. Agora o colapso se **declara** no campo aditivo `introduces.derived` e o gate **A23** o
confere no disco.

```json
"introduces": {
  "productive": ["global:print", "node:Call", "node:StrLiteral"],
  "receptive": [],
  "derived": [
    { "chave": "node:Call", "de": "global:print" },
    { "chave": "node:StrLiteral", "de": "global:print" }
  ]
}
```

As quatro regras do campo (`engine/quality/barra.ts`, regra A23 — cada uma reprova com `ERRO
[A23]`):

1. **Forma**: cada item é `{ "chave": "<atomo>", "de": "<atomo>" }`, as duas no formato de átomo.
   Entrada malformada não é ignorada em silêncio: é erro.
2. **Pai e filha declarados**: as DUAS têm de estar em `introduces.productive` desta aula — a regra
   do par colapsa itens do mesmo declarado, não importa chave de fora.
3. **Sem cadeia**: toda derivada aponta DIRETO para a chave que distingue. `A ← B ← C` é erro.
4. **Co-ocorrência de LINHA**: tem de existir, em algum bloco de código da teoria DESTA aula, uma
   linha em que a chave e o pai ocorrem juntas. É a medição de "a mesma construção produz
   inevitavelmente". Sem co-ocorrência a chave **conta cheia** em A17 e A21.

Efeito no teto: `A17` (≤2 produtivas novas) e `A21` (≤4 novas no total) contam **depois** do
colapso. Um grupo de 5 chaves que nasce de um gesto só (a assinatura `pub fn dobro(x: i32) -> i32`
emite `node:FunctionItem`, `node:Parameters`, `node:Parameter`, `node:PrimitiveType`,
`node:VisibilityModifier` na MESMA linha) cabe numa aula **se** for declarado como um item; sem o
campo, são 5 e a aula é penhasco.

Medido na trilha de referência: **5 aulas do `python-iniciante` declaram `derived`**
(`grep -rl '"derived"' app/resources/tracks/python-iniciante --include=lesson.json | wc -l` → 5) e
o curso fecha em **0 erros** na barra.

> Declarar `derived` para calar o gate é o mesmo defeito com outro nome: sem co-ocorrência, A23
> reprova; com co-ocorrência, o colapso é verdade medida. Nunca invente pai.

## 5. As demonstrações têm gate — A19 e A22

**Declarar não é demonstrar** (A19, erro): toda chave nova de `introduces` — produtiva **e**
receptiva — tem de aparecer em **bloco cercado com a tag da linguagem da trilha**, na teoria
**desta** aula. As tags aceitas são as do adaptador (`theoryFenceTags`): `py`/`python`/`python3`,
`rust`/`rs`, `c`. Bloco sem tag não é código para o extrator; crase inline é prosa.

**Duas formas** (A22, aviso com contagem): cada chave produtiva nova aparece em **≥2 ocorrências
sintaticamente distintas** nos blocos da aula (argumento literal *e* expressão composta; condição
comparada *e* booleano pronto). Uma forma só faz o aluno induzir regra restrita demais.

### 5.1 Como descobrir a chave EXATA que um trecho emite

Nunca invente chave: rode o extrator da engine sobre o trecho literal. Forma curta (o trecho vai
num *template literal* — escape `\n` como `\\n`, e use aspas duplas dentro):

```bash
cd /Volumes/Ext2TB/Projects/study-method/app && npx tsx -e 'import {extractAtoms} from "./electron/main/engine/extract"; const r = extractAtoms(`printf("oi\\n");`, {language:"c", surface:"theory"}); console.log(r.ok ? r.keys.join(" ") : "ERRO: " + r.error.message)'
# → api:printf node:CallExpr node:DeclRefExpr node:StringLiteral
```

Forma à prova de aspas (o trecho vai num arquivo — use esta quando ele tiver aspas simples, crase
ou várias linhas):

```bash
cat > "$TMPDIR/trecho.txt" <<'EOT'
printf("oi\n");
EOT
cd /Volumes/Ext2TB/Projects/study-method/app && TRECHO="$TMPDIR/trecho.txt" npx tsx -e 'import fs from "node:fs"; import {extractAtoms} from "./electron/main/engine/extract"; const r = extractAtoms(fs.readFileSync(process.env.TRECHO!,"utf8"), {language:"c", surface:"theory"}); console.log(r.ok ? r.keys.join(" ") : "ERRO: " + r.error.message)'
```

Para a regra do par você precisa da **linha** de cada ocorrência — troque `extractAtoms` por
`extractAllOccurrences`:

```bash
cd /Volumes/Ext2TB/Projects/study-method/app && npx tsx -e 'import {extractAllOccurrences} from "./electron/main/engine/extract"; const r = extractAllOccurrences(`print("bom dia")`, {language:"python", surface:"theory"}); if (r.ok) for (const o of r.occurrences) console.log(o.line, o.key);'
# → 1 node:Expr · 1 node:Call · 1 node:Name · 1 node:Load · 1 global:print · 1 node:StrLiteral
```

Armadilha de shell medida: **crase dentro de string com aspas duplas do shell é substituição de
comando**. O `npx tsx -e '...'` acima usa aspas SIMPLES por fora e crase por dentro de propósito.

### 5.2 `surface: 'theory'` não é decoração — é o ENVELOPE DE FRAGMENTO

Fato novo desta execução (`engine/extract.ts`, tabela `ENVELOPE_DE_FRAGMENTO`): em **C** e em
**Rust** a teoria demonstra em FRAGMENTO (a aula 1 de C não pode mostrar `main`; a de Rust não pode
mostrar a crate inteira), e fragmento **não parseia** sozinho. O extrator agora tenta o parse
VERBATIM primeiro e, falhando, embrulha o fragmento num TU sintético — mas **só quando
`surface: 'theory'`**. Sem isso o gate vê ZERO demonstração e A19 reprova a aula inteira:

```
extractAtoms('printf("oi\n");', {language:'c'})                     → ERRO clang (1:8): expected parameter declarator
extractAtoms('printf("oi\n");', {language:'c', surface:'theory'})   → api:printf node:CallExpr node:StringLiteral
extractAtoms('dobro(-3)', {language:'rust'})                        → ERRO erro de sintaxe: falta ;
extractAtoms('dobro(-3)', {language:'rust', surface:'theory'})      → node:CallExpression node:IntegerLiteral node:UnaryExpression op:unary:-
```

Consequência para quem escreve teoria de C: o fragmento é embrulhado num CORPO DE FUNÇÃO, então ele
precisa ser válido como corpo — um trecho que usa nome não declarado não parseia
(`x = x + 1;` sozinho → `ERRO clang (1:1): type specifier missing`), e o conserto é declarar no
mesmo bloco (`int x = 3;` + `x = x + 1;` → `decl:var node:BinaryOperator node:DeclStmt
node:IntegerLiteral node:VarDecl op:assign:= op:binary:+`).

## 6. O roteador da língua — leia o arquivo da SUA trilha

A língua sai do `track.json` da trilha (`programmingLanguage`), nunca da conversa:

```bash
python3 -c "import json;print(json.load(open('app/resources/tracks/<slug>/track.json'))['programmingLanguage'])"
```

| `programmingLanguage` | Trilha no disco | Leia | Contrato de conteúdo |
|---|---|---|---|
| `python` | `python-iniciante` | `receita-da-aula-python.md` | `docs/17-trilha-python.md` |
| `rust` | `rust-iniciante` | `receita-da-aula-rust.md` | `docs/20-trilha-rust.md` |
| `c` | `c-iniciante` | `receita-da-aula-c.md` | `docs/20-trilha-c.md` · `skills/trilha-author/references/prova-c.md` |

O número de aulas de cada trilha muda a cada onda de autoria — **meça, não cite de memória**
(medido em 2026-09-22: python 112, c 115):

```bash
cd /Volumes/Ext2TB/Projects/study-method && python3 -c "import json, os; b='app/resources/tracks/<slug>'; t=json.load(open(b+'/track.json')); print(sum(len(json.load(open(os.path.join(b,'modules',m,'module.json')))['lessons']) for m in t['modules']))"
```

Cada arquivo de língua traz, na mesma ordem: **inventário e vocabulário** (onde está e como
conferir pertença) · **axioma de entrada** · **semente receptiva do harness** · **forma do arquivo
de teste, por fase** · **tetos medidos** · **armadilhas conhecidas do adaptador**.

## 7. Antes de escrever — a cadeia de conferências (vale nas três línguas)

1. A língua veio do `track.json`; a receita aberta é a DELA (§6).
2. `introduces.productive` ≤ 2 depois do colapso, e o colapso está DECLARADO em `derived` (§4).
3. Toda chave existe no inventário da língua — em dúvida, rode o extrator (§5.1) e use a chave
   EXATA emitida.
4. Toda chave nova tem demonstração em bloco cercado com a tag da língua NESTA aula (A19), e a
   produtiva aparece em 2 formas distintas (A22).
5. `|productive ∪ receptive|` ≤ 4 e seções de teoria ≥ max(2, ⌈novas/2⌉) (A21).
6. A aula tem desafio (A20) e o teste **força** o átomo-alvo (P-CONTRA): ≥2 casos divergentes,
   esperados não-escalares, meta EXCESSO 0 no `coverage`.
7. O teste é legível com o orçamento de **ENTRADA** (A3) — o aluno lê o teste antes da aula.
8. 2–3 `sources[]` oficiais com URL verificada (`curl -sI` → 200), do domínio da língua.
9. Newline final em todo arquivo (gate-lint L-04).
10. Estourou algum teto de A17/A21 e não existe aula anterior que ensine o que sobrou? **Não
    amplie o `introduces`: quebre a aula** — `quebra-da-aula.md`, procedimento numerado.
