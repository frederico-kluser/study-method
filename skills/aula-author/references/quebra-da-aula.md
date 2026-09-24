# Quebra da aula — o procedimento SPLIT, em sete passos executáveis

Quando uma aula pede mais do que o aluno pode receber num passo, a aula **se quebra**: o conteúdo
vira duas ou mais aulas, na ordem "ler antes de escrever". Isto não é conselho — é o ramo (c) do
pedido do dono do produto, textual:

> "no caso de nem nele e nem nos cursos conectados a ele antes dele, ter o conteúdo, tem que quebrar
> o conteúdo da aula problemática em mais conteúdos"

**Por que este arquivo existe.** Até 2026-09-22 a quebra aparecia nesta skill só como conselho —
`git show HEAD:skills/aula-author/references/situacoes.md | grep -in quebr` devolve 4 linhas de
prescrição ("Decidir a **quebra da aula**", "**quebre a aula**", "**Quebre a aula** em duas") e
**zero** procedimento: nada dizia em quantas aulas quebrar, o que vai em cada uma, onde elas
entram, nem como provar que a quebra ficou certa. Aqui está o procedimento, e cada passo tem
comando.

**A regra de ouro, que vale nos sete passos:** ampliar `introduces` para calar o gate é o mesmo
defeito com outro nome. Se falta orçamento, o defeito é do currículo — **quebre a aula**, nunca
declare mais.

## 0. O gatilho — quando a quebra é a ação certa

A barra pedagógica prescreve a ação no próprio achado (campo `acao`, catálogo FECHADO):

| Achado | Regra | `acao` prescrita | O que fazer |
|---|---|---|---|
| produtivas novas colapsadas > 2 | A17 | `SPLIT_LESSON` | quebrar (este arquivo) |
| aula 1 da trilha com > 1 produtiva nova | A18 | `SPLIT_LESSON` | quebrar |
| chave lida na aula 1 sem demonstração própria | A18 | `SPLIT_LESSON` | quebrar ou tirar a chave da aula |
| novas totais > 4, ou seções < max(2, ⌈novas/2⌉) | A21 | `SPLIT_LESSON` | quebrar |
| chave nova sem demonstração em bloco | A19 | `REWRITE_IN_BUDGET` | **escrever a demonstração** — não é quebra |
| aula sem desafio, ou sem produtiva nova | A20 | `ADD_TEST` / `DECLARE_INTEGRATIVE` | autorar o desafio ou declarar consolidação |
| derivada sem co-ocorrência | A23 | `REWRITE_IN_BUDGET` | a chave não é derivada: ela conta cheia |

E antes de quebrar, a pergunta do dono, na ordem (a distinção que faz o laço convergir — docs/16
§5.5): a construção já é ensinada **ANTES nesta trilha**? → é violação de ORDEM (reescrever o
artefato ou mover a aula). É ensinada num **curso ANTERIOR da cadeia**? → a fronteira do curso é
que se move (`engine/graph/cadeia.ts`, `ensinadoAntesNaCadeia`). **Não é ensinada em lugar nenhum?**
→ é LACUNA, e a remediação é criar a aula que falta: **a quebra**.

> Medido em 2026-09-22 (`cd app && for t in python-iniciante rust-iniciante c-iniciante; do jq -c
> '{cadeia,nivel,cursoAnterior}' resources/tracks/$t/track.json; done` → `nivel 1` /
> `cursoAnterior null` nos três): **hoje os três cursos são o PRIMEIRO da sua cadeia**, então o ramo
> CADEIA sai vazio e toda chave que não é axioma/semente e não tem origem na trilha é LACUNA.

O laço que orquestra os sete passos tem comando próprio (sem teto de rodadas, dry-run por default):

```bash
cd app && npm run engine -- convergir <slug> --json          # PLANEJA, não escreve conteúdo
cd app && npm run engine -- convergir <slug> --aplicar       # cria os ESQUELETOS da quebra
```

O planejador entrega o plano; **o conteúdo é sempre autoria** (esta skill). `--aplicar` cria o
diretório da aula nova com `lesson.json` de esqueleto + campo `autoria` e insere o slug em
`module.json.lessons[]` na posição certa — e NUNCA escreve teoria, quiz, fonte nem desafio.

## 1. INVENTARIAR — toda chave que a aula usa, por superfície

Uma aula tem quatro superfícies de código: **teoria** (blocos cercados com a tag da língua),
**`starterCode`**, **`testsCode`** e **`solutionCode`**. A quebra começa listando TODAS as chaves de
todas elas e classificando cada uma. Comando (troque `SLUG` e `AULA`; em Rust,
`export PATH="/opt/homebrew/opt/rustup/bin:$PATH"` antes):

```bash
cd /Volumes/Ext2TB/Projects/study-method/app && SLUG=rust-iniciante AULA=a-tela/a-primeira-funcao npx tsx -e '
import { loadTrack } from "./electron/main/content/trackLoader";
import { deriveTrackBudget } from "./electron/main/engine/budget";
import { extractAtoms, type ExtractSurface } from "./electron/main/engine/extract";
import { collectLessonCode } from "./electron/main/engine/theoryCode";
void (async () => {
  const track = await loadTrack(`resources/tracks/${process.env.SLUG}`);
  const orc = deriveTrackBudget(track);
  const alvo = orc.byRef.get(process.env.AULA!)!;
  const [m, a] = process.env.AULA!.split("/");
  const aula = track.modules.find((x) => x.meta.slug === m)!.lessons.find((x) => x.meta.slug === a)!;
  const sups: Array<[ExtractSurface, string]> = [];
  for (const b of collectLessonCode(aula.meta.theory ?? []).blocks) if (b.adapterId === orc.adapterId) sups.push(["theory", b.code]);
  for (const ch of aula.challenges) sups.push(["starterCode", ch.starterCode], ["testsCode", ch.testsCode], ["solutionCode", ch.solutionCode]);
  const onde = new Map<string, Set<string>>();
  for (const [sup, code] of sups) {
    const r = extractAtoms(code, { language: orc.adapterId, surface: sup });
    if (!r.ok) { console.log(`PARSE FALHOU em ${sup}: ${r.error.message}`); continue; }
    for (const k of r.keys) { if (!onde.has(k)) onde.set(k, new Set()); onde.get(k)!.add(sup); }
  }
  for (const k of [...onde.keys()].sort()) {
    const origem = orc.firstTaughtIn.get(k as never);
    const naProd = alvo.entrada.productive.has(k as never);
    const naRec = alvo.entrada.receptive.has(k as never);
    const classe = origem === alvo.ref ? "NOVA NESTA AULA"
      : naProd ? (origem === undefined ? "AXIOMA (estrutural)" : `ANTES (${origem})`)
      : naRec ? (origem === undefined ? "SEMENTE DO HARNESS (so leitura)" : `ANTES so-leitura (${origem})`)
      : origem !== undefined ? `DEPOIS (${origem}) <- ORDEM`
      : "INEXISTENTE <- LACUNA (cadeia ou quebra)";
    console.log(`${k.padEnd(26)} ${[...onde.get(k)!].join("+").padEnd(34)} ${classe}`);
  }
})();
'
```

Saída: uma linha por chave, com as superfícies em que ela aparece e a classe. As cinco classes:

| Classe | Significa | Efeito na quebra |
|---|---|---|
| `AXIOMA (estrutural)` | está sempre liberada nas duas faixas | não entra na conta |
| `SEMENTE DO HARNESS (so leitura)` | o aluno LÊ em todo desafio e não escreve em nenhum | não entra na conta como produtiva; **escrevê-la é chave nova** |
| `ANTES (...)` | ensinada por uma aula anterior desta trilha | não entra na conta |
| `NOVA NESTA AULA` | é o material que a quebra distribui | **entra na conta** |
| `DEPOIS (...) <- ORDEM` / `INEXISTENTE <- LACUNA` | ordem errada, ou não existe em lugar nenhum | ORDEM: reescrever/mover. LACUNA: virar aula nova |

**PARSE FALHOU numa superfície não é "zero chave"**: é medição ausente (fail-closed). Conserte o
bloco (em C e Rust, quase sempre é o envelope de fragmento — `receita-da-aula.md` §5.2) e re-rode
antes de planejar.

## 2. AGRUPAR — por co-ocorrência de LINHA, e NUNCA partir um grupo

Três chaves que saem da MESMA LINHA são UMA construção para quem está aprendendo. A barra publica
esses grupos medidos no disco (componentes conexas de "ocorre na mesma linha de um bloco desta
aula"), no campo `grupos` de cada métrica:

```bash
cd app && npm run engine -- barra <slug> --aula MOD/AULA --json
# metricas[0].grupos → [["api:todo!"], ["node:BinaryExpression","node:IntegerLiteral", …], …]
```

Regras do agrupamento:

1. **Grupo não se parte.** Não existe aula que ensine `node:CallExpr` e `node:StringLiteral` e não
   ensine `api:printf`: as três saem de `printf("oi\n");`.
2. **Grupo grande NÃO vira aula grande**: um grupo que sozinho estoura o teto se **declara** em
   `introduces.derived` — a chave que DISTINGUE (o `targetAtom`) é a produtiva, as outras são
   derivadas dela, e A23 confere a co-ocorrência. Colapsado, o grupo conta **1**
   (`receita-da-aula.md` §4).
3. **O pai é escolhido pelo SENTIDO, não pela linha.** A co-ocorrência é condição NECESSÁRIA, não
   suficiente: declarar `op:binary:*` como derivada de `node:IntegerLiteral` passa em A23 e é
   mentira pedagógica. O pai é a chave que a aula ensina.
4. **A PONTE.** Um grupo pode juntar DUAS construções por uma chave que aparece nas duas linhas —
   tipicamente um literal. Exemplo medido: `x * 2` emite `op:binary:*` + `node:BinaryExpression` +
   `node:IntegerLiteral`, e `dobro(-3)` emite `op:unary:-` + `node:UnaryExpression` +
   `node:IntegerLiteral`; o `node:IntegerLiteral` é a PONTE e a união-find funde os cinco num grupo
   só. A quebra certa é **ensinar a ponte numa aula ANTERIOR**: na medição seguinte ela já está na
   entrada, sai de `novas`, e o grupo se desfaz em dois sozinho — a prova é re-rodar o `barra
   --json` e ver `grupos` com dois componentes.
5. **Chave sem demonstração nenhuma vira grupo unitário** (ela não tem linha para co-ocorrer). A19
   já a reprovou; o planejamento precisa dela na conta.

## 3. EMPACOTAR — as aulas que saem da quebra

Distribua os grupos em N aulas obedecendo aos tetos da barra (`quality/barra.ts`):

- **≤ 2 grupos PRODUTIVOS por aula** (A17, `TETO_PRODUTIVAS_NOVAS = 2`);
- **1 grupo produtivo se a aula for a PRIMEIRA da trilha** (A18,
  `TETO_PRODUTIVAS_NOVAS_AULA_1 = 1`);
- **≤ 4 chaves novas por aula** somando produtivas e receptivas, depois do colapso (A21,
  `TETO_NOVAS_TOTAL = 4`);
- **seções de teoria ≥ max(2, ⌈novas/2⌉)** (A21) — e cada seção ≤ 560 chars montados;
- **cada aula fica com ao menos 1 grupo produtivo** (A20: aula regular sem produtiva nova não é
  aula) **e com desafio próprio**.

A ordem é **"ler antes de escrever"**, e ela é medida, não opinada:

1. o que uma aula faz o aluno LER no `testsCode`/`starterCode` tem de estar na ENTRADA dela (A3) —
   semente do harness ou aula anterior;
2. a chave-PONTE (§2.4) vem antes das construções que ela ligava;
3. entre grupos independentes, vale a ordem em que a teoria original os apresentava.

## 4. POSICIONAR — cada aula antes de quem precisa do que ela ensina

A ordem pedagógica é a ordem do array: `module.json.lessons[]` é uma lista ORDENADA e o loader lê
aula por aula nela (`content/trackLoader.ts:186`); os módulos vêm por `module.json.order`
(`engine/budget.ts`, `pedagogicalOrder`). Portanto:

1. crie `modules/<mod>/lessons/<aula-nova>/lesson.json` (e `challenges/<desafio>/challenge.json`);
2. insira o slug em `module.json.lessons[]` **imediatamente antes da primeira aula que precisa do
   que ela ensina**. O caso comum é **antes da aula original** (a original continua usando o que
   saiu, e agora só o PRESSUPÕE). O caso inverso existe e é legítimo: quando a original fica com o
   passo que as novas pressupõem — foi o que aconteceu na aula 1 do Rust (§8), em que a assinatura
   da função ficou na original e o literal, a multiplicação e a negação viraram aulas DEPOIS dela.
   Quem decide é a dependência medida, nunca o hábito;
3. encadeie `prerequisites` por `concept.id` — nunca por `lesson.slug` (`prerequisites` é
   type-checado contra `concept.id`);
4. confira a posição pelo índice do histograma: `npm run engine -- barra <slug>` imprime as aulas
   numeradas na ordem pedagógica real. Posição errada aparece como violação de ORDEM no `audit`
   (`primeiraAulaQueEnsina != null`), não como opinião.

## 5. REESCREVER a original — teoria, quiz e desafio encolhem JUNTOS

A aula original fica com **o que sobrou**, e os quatro artefatos andam juntos:

- **`introduces`**: só os grupos que ficaram (com `derived` declarado para cada grupo colapsado).
- **teoria**: as seções do que saiu vão para a aula nova; as que ficam demonstram o que a aula
  ainda ensina (A19), em 2 formas (A22).
- **quiz**: `assertions[].sectionId` aponta seção que existe — afirmação órfã de seção que mudou de
  aula é defeito. 2–3 afirmações.
- **desafio**: **desafio que cobra o que saiu da aula é VIOLAÇÃO** (A1/A2 no `audit`: a solução usa
  construção fora do orçamento; e `coverage` acusa LACUNA). O desafio encolhe com a aula, e a
  solução de referência tem de conter o átomo-alvo do que SOBROU (A6).
- `targetAtom`, `concepts` e `sources` acompanham.

## 6. PROVAR — a quebra não existe sem verde

Rodar, na ordem (de `app/`; em Rust, com o PATH do rustup):

```bash
npm run engine -- barra <slug>                                  # 0 erros (A17-A21, A23-A24) · exit 0
npm run engine -- audit <slug> --limite 0                       # 0 violacoes (já inclui a barra)
npm run engine -- coverage <slug>                               # 0 lacunas · 0 sem-solucao · EXCESSO 0
npm run engine -- requirements <slug>                            # bijeção nos desafios novos
npm run track -- track:challenge:verify <slug> <mod> <aula> <desafio>   # as 4 provas de execução
npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts        # nenhuma seção > 21 s
```

E os **contadores de aula do curso** têm de bater depois da quebra:

```bash
python3 -c "import json, os; b='app/resources/tracks/<slug>'; t=json.load(open(b+'/track.json')); print(sum(len(json.load(open(os.path.join(b,'modules',m,'module.json')))['lessons']) for m in t['modules']))"
# o total tem de ser o mesmo `aulas N` que o placar da barra imprime, e N cresceu pelo nº de aulas novas
```

Checagem que não rodou **não é verde** (`checagensNaoExecutadas > 0` no `audit`, `PARSE FALHOU` no
inventário, `barra` com `blocos de teoria que nao parseiam > 0`): leia o campo antes de confiar em
qualquer zero.

## 7. REGISTRAR — o ledger de convergência

Toda rodada do laço grava uma linha JSON (append-only) em
`app/content-src/<slug>/convergencia/ledger.jsonl`, com iteração, commit, ambiente, medições
(comando + exit + placar), `limitacoesDeclaradas`, vetor de estado, achados por ramo, ações
planejadas, ações aplicadas, hash do vetor e veredito — e essa é a ÚNICA escrita do dry-run
(`npm run engine -- convergir <slug>`). Quebra feita à mão se registra na mesma linha de raciocínio:
qual aula foi quebrada, em quantas, quais grupos foram para cada uma, e os placares ANTES e DEPOIS
com o comando que os reproduz. O veredito do laço é um dos quatro, e nenhum deles é cansaço:
PONTO-FIXO (exit 0) · CICLO · SEM-PROGRESSO · TETO (só com `--max-iteracoes`).

## 8. EXEMPLO TRABALHADO — a aula 1 do `rust-iniciante`

O caso que o dono reclamou. **Medido em 2026-09-22 às 01:52**, com
`npm run engine -- barra rust-iniciante --aula a-tela/a-primeira-funcao --json` (a trilha estava
sendo consertada em paralelo nesta mesma execução — re-meça antes de reusar estes números).

### 8.1 O inventário (o que a aula declarava)

`role: regular`, `targetAtom: node:FunctionItem`, **1 seção** de teoria com **2 blocos** ` ```rust `,
1 desafio:

- `introduces.productive` (6): `node:FunctionItem` · `node:Parameters` · `node:Parameter` ·
  `node:IntegerLiteral` · `op:binary:*` · `node:BinaryExpression`
- `introduces.receptive` (5): `node:VisibilityModifier` · `node:PrimitiveType` ·
  `node:UnaryExpression` · `op:unary:-` · `api:todo!`

Métrica da barra: `produtivasNovas 6 · colapsadas 6 · novasTotais 11 · secoesDeTeoria 1 ·
blocosDeCodigo 2 · chavesSemDemonstracao 1 · chavesComUmaFormaSo 5 · desafios 1`. Achados: **5
erros** — A17 (6 > 2) · A18 (6 > 1 na aula 1) · A18 (`api:todo!` lida no starter sem demonstração) ·
A21 (11 > 4) · A21 (1 seção para o mínimo de 6) — e 5 avisos A22.

### 8.2 Os grupos (campo `grupos`, medido)

| Grupo | Chaves | De onde sai |
|---|---|---|
| G1 | `api:todo!` | de nenhum bloco: é lida no `starterCode` e **não** demonstrada — grupo unitário por ausência |
| G2 | `node:BinaryExpression` · `node:IntegerLiteral` · `node:UnaryExpression` · `op:binary:*` · `op:unary:-` | duas linhas (`x * 2` e `dobro(-3)`) fundidas pela PONTE `node:IntegerLiteral` |
| G3 | `node:FunctionItem` · `node:Parameter` · `node:Parameters` · `node:PrimitiveType` · `node:VisibilityModifier` | UMA linha: `pub fn dobro(x: i32) -> i32 {` |

### 8.3 O empacotamento (o plano — nenhuma prosa escrita aqui)

G3 é uma construção só (a assinatura) e colapsa por `derived`. G2 é PONTE e se desfaz assim que o
literal vira aula anterior. G1 precisa de demonstração própria na aula 1 (A18).

| # | Aula | Grupos | `introduces` planejado | Conta (prod colapsadas / novas) | Desafio |
|---|---|---|---|---|---|
| 1 | `a-primeira-funcao` (reescrita) | G3 + G1 | `productive: [node:FunctionItem, node:Parameters, node:Parameter, node:PrimitiveType, node:VisibilityModifier]` com as 4 últimas em `derived` de `node:FunctionItem`; `receptive: [api:todo!]` | 1 / 2 | devolver o que recebeu — o corpo é o nome do parâmetro (`node:Identifier` é estrutural: nenhum literal escrito) |
| 2 | `o-valor-que-entra` (nova) | a PONTE de G2 | `productive: [node:IntegerLiteral]` | 1 / 1 | devolver um número fixo |
| 3 | `multiplicar` (nova) | G2a | `productive: [op:binary:*, node:BinaryExpression]` com `node:BinaryExpression` em `derived` de `op:binary:*` (co-ocorrem em `x * 2`) | 1 / 2 | o dobro de um número positivo |
| 4 | `o-sinal-de-menos` (nova) | G2b | `productive: [op:unary:-, node:UnaryExpression]` com `node:UnaryExpression` em `derived` de `op:unary:-` (co-ocorrem em `-3`) | 1 / 2 | o dobro de um número negativo |

Ordem justificada: a aula 1 não pode fazer o aluno ESCREVER literal (seria a 2ª produtiva, A18), e
por isso o desafio dela devolve o parâmetro; o literal é a PONTE e vem na aula 2; multiplicação e
negação são independentes entre si e seguem a ordem em que a teoria original as mostrava.

### 8.4 A prova de que o plano fecha

Depois de posicionar as três aulas novas em `module.json.lessons[]` — aqui **depois** da original,
porque a original ficou com a assinatura que as três pressupõem (§4 item 2) — e reescrever a aula 1,
o mesmo comando do §8 tem de devolver **0 erros** para as quatro aulas, o `grupos` da aula 3
tem de ter **um** componente (`op:binary:*` + `node:BinaryExpression`) em vez do grupo de cinco — a
PONTE saiu de `novas` — e o total de aulas do curso tem de crescer, nos dois contadores do §6.

Foi o que aconteceu no disco: a quebra desta aula foi executada em paralelo nesta mesma execução, e
às **02:26** de 2026-09-22 `npm run engine -- barra rust-iniciante` devolvia **0 erros · 46 avisos ·
103 aulas · exit 0** — contra as 101 aulas e os 5 erros da aula 1 medidos às 01:52.
