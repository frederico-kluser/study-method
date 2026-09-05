# 19 — Auditoria da aula

> **O que este documento é.** Uma auditoria MEDIDA da aula do produto, nos seus dois lados: a aula
> como **artefato** (os 20 `lesson.json` de `app/resources/tracks/python/modules/a-tela/lessons/`)
> e a aula como **experiência** (o que o aluno vê e faz, do "Começar aula" ao "Concluir aula").
>
> **O que este documento não é.** Não é plano de refatoração. Descreve o defeito, a evidência e o
> impacto sobre o aluno; a correção é de outra onda. Onde a especificação já prescreve a solução,
> ela é citada — não reinventada.
>
> **Autoridade.** [`16-engine-de-trilha.md`](16-engine-de-trilha.md) é o contrato de **como uma
> trilha é produzida**; [`17-trilha-python.md`](17-trilha-python.md) é o contrato de **conteúdo**
> desta trilha. Onde a auditoria e um deles divergem, o documento normativo vence e o defeito é do
> disco. Onde os dois divergem entre si, isso está registrado aqui como divergência, não resolvido.
>
> **A regra que governa cada número abaixo.** `CONTRIBUTING.md`: *"Todo número que aparece em
> documento, README ou mensagem ao aluno tem que ser reproduzível por um comando."* Nenhum número
> deste documento aparece sem o comando ao lado. Onde a afirmação é julgamento e não medição, ela
> vem marcada `[INFERÊNCIA]` — a mesma convenção de [`ux-redesign.md`](ux-redesign.md).
>
> **Medido em** 2026-09-05, contra `main` em `26dbc19`, com `app/node_modules` instalado por
> `cd app && HUSKY=0 npm ci`. Nenhuma chave de API foi usada: nada aqui depende de LLM.

---

## 0. O veredito, antes dos detalhes

A aula desta trilha está **bem escrita e não roda**.

O conteúdo é o lado forte, e não por pouco: 20 aulas, orçamento cumulativo verde, 111 blocos de
código todos com tag de linguagem, 44 quizzes ancorados na seção que os demonstra, zero lacuna de
currículo. O `audit` sai **0 violações** contra o gate mais difícil do repositório — a mesma régua
que reprovou a trilha anterior com 717 violações.

Com uma ressalva que o placar não conta e esta auditoria mediu: **das 36 verificações numeradas que
[`16`](16-engine-de-trilha.md) §5.1 e §5.2 especificam, 18 estão implementadas e 10 rodam contra
esta trilha.** Sete das implementadas pulam em silêncio porque são JavaScript-only e a trilha é de
Python; uma nona é inatingível pelo mesmo motivo. O verde é real na parte que mede, e menor do que
parece (§2.2.1).

O lado quebrado é o resto. **Um único defeito** — o identificador de linguagem do desafio se perde
antes de chegar ao executor — derruba, ao mesmo tempo, as quatro provas de execução, o `coverage`,
o `requirements`, o `revise`, o `track:validate` e o **envio do aluno dentro do app**. A trilha é de
Python; tudo isso roda `node --test` sobre código Python. E dois dos comandos que reprovam **saem
com código 0**, o que é exatamente o fail-open que [`16`](16-engine-de-trilha.md) §9.3 proíbe.

Consequência para o aluno, reproduzida abaixo em §3.4: quem digita `print("oi")` — a solução de
referência da própria trilha — recebe `passed: false`. Como "Concluir aula" exige desafio passado e
a aula seguinte exige a anterior concluída, **nenhuma das 20 aulas pode ser terminada e o aluno não
sai da aula 1**.

---

## 1. O ambiente e os comandos

Todos os comandos deste documento rodam de `app/`, sem rede e sem chave:

```bash
cd app && HUSKY=0 npm ci                                   # uma vez
npx tsx tools/track-engine/cli.ts audit python              # orçamento cumulativo (AST)
npx tsx tools/track-engine/cli.ts coverage python           # código mínimo que passa no teste
npx tsx tools/track-engine/cli.ts requirements python       # bijeção enunciado ↔ teste
npx tsx tools/track-engine/cli.ts revise python             # revisão progressiva aula a aula
npx tsx tools/track-cli.ts track:validate python            # as quatro provas de execução
npx tsx tools/track-cli.ts track:challenge:verify python a-tela a-primeira-linha escreva-oi
```

> **Aviso de efeito colateral, medido.** `revise python` **escreve em disco**: cria
> `app/content-src/python/revisao-progressiva/` com `relatorio-revisao.json` e
> `relatorio-revisao.md`. Isso não está declarado no `--help` do comando. Quem rodar precisa apagar
> o diretório antes de commitar.

---

## 2. A aula como ARTEFATO

### 2.1 O inventário medido

```bash
cd app && python3 -c "
import json,glob
ps=sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json'))
Ls=[json.load(open(p)) for p in ps]
print('aulas', len(Ls))
print('secoes de teoria', sum(len(L['theory']) for L in Ls))
print('assertions', sum(len(L['assertions']) for L in Ls))
print('desafios de aula', sum(len(L['challenges']) for L in Ls))
"
```

| Medição | Valor | Régua |
|---|---|---|
| Aulas | 20 | `17` §"Estrutura da trilha" diz 20 para o M1 — **bate** |
| Seções de teoria | 60 | 3 por aula (uma aula tem 2, uma tem 4) |
| Assertions (quizzes) | **44** | a mensagem do commit `83a93f4` diz **52** — **não bate**, ver §2.6 |
| Assertions por aula | mín. 2, máx. 3 | o schema permite no máximo 3 — **respeitado nas 20** |
| Desafios de aula | 20 | 1 por aula |
| Desafio de módulo | 1 (`rachando-a-conta`) | **não é auditado**, ver §3.5 |
| Blocos cercados na teoria | 111 (55 `python`, 53 `text`, 3 `traceback`) | **100% com tag** — ver §2.7 |
| Testes por desafio | **1**, nos 21 | ver §2.5 |

### 2.2 O orçamento cumulativo está verde, e isso é real

```bash
cd app && npx tsx tools/track-engine/cli.ts audit python
```

```
PLACAR
  aulas ................................ 20
  aulas que nao introduzem construcao .. 0
  desafios ............................. 20
  desafios com violacao ................ 0 (0%)
  violacoes ............................ 0
  avisos (bateria A13-A16, D4/A14a-0) .. 0
  delas, lacunas de curriculo .......... 0

  20 passou · 0 falhou · 0 pendente
```

Isto não é um gate frouxo passando por acidente. O `audit` confere as **quatro** superfícies de
cada desafio (`theory`, `starterCode`, `solutionCode`, `testsCode` — `engine/audit.ts:134-147`)
contra os orçamentos assimétricos de §3.3, **com o adaptador de Python** (o único caminho do
produto que resolve a linguagem certa). O relatório em `--json` confirma que nada foi pulado em
silêncio:

```bash
cd app && npx tsx tools/track-engine/cli.ts audit python --json > /tmp/a.json
python3 -c "import json;d=json.load(open('/tmp/a.json'));print('parseErrors',d['parseErrors'],'hygiene',d['hygiene'])"
# -> parseErrors [] hygiene []
```

Comparado ao registro histórico de [`16`](16-engine-de-trilha.md) §1 (717 violações, 249 lacunas de
currículo, 68 blocos sem tag na trilha apagada — números do próprio documento, hoje já não
reproduzíveis porque aquela trilha foi apagada), esta trilha é de outra categoria. **O eixo do
orçamento está bem construído e merece ser dito com a mesma clareza dos defeitos.**

### 2.2.1 Mas metade da bateria não roda nesta trilha, e o placar não diz isso

O `audit` de uma trilha de **Python** pula, por desenho, toda a bateria A13–A16:

```ts
// app/electron/main/engine/audit.ts:220-222
function bateriaDeProgressaoValePara(adapterId: LanguageId): boolean {
  return adapterId === DEFAULT_ADAPTER_ID;   // DEFAULT_ADAPTER_ID === 'javascript'
}
```

A razão está escrita e é **boa**: `quality/progressao.ts:432` lança para qualquer adaptador que não
seja o default, com a mensagem literal de `:434` — *"H13/AX são chaves do AST do TypeScript e do
runner node:test, e os spans mecânicos S13 são calculados com ts.createSourceFile"* — e o comentário
de `:426-431` diz o resto: rodar a bateria numa trilha de outra linguagem *"não daria erro: daria um
veredito ERRADO E SILENCIOSO"*. Pular é melhor que mentir. O problema não é a decisão — é que **o
placar não declara a lacuna**.

Prova por mutação: apagando **todos** os blocos de código da teoria da aula 1 — nada mais fica
demonstrado, o que é a definição de violação A13 e A16 — o `audit` continua verde.

```bash
SC=$(mktemp -d); cp -r app/resources/tracks/python $SC/t
python3 - "$SC" <<'PY'
import json,re,sys
p=sys.argv[1]+'/t/modules/a-tela/lessons/a-primeira-linha/lesson.json'
d=json.load(open(p))
cerca=chr(96)*3   # a cerca de codigo, sem brigar com o shell
for s in d['theory']: s['markdown']=re.sub(cerca+'[a-z]*\n.*?'+cerca,'',s['markdown'],flags=re.S)
json.dump(d,open(p,'w'),ensure_ascii=False,indent=2)
PY
cd app && npx tsx tools/track-engine/cli.ts audit python --dir $SC/t --limite 10
```

```
PLACAR
  aulas ................................ 20
  desafios com violacao ................ 0 (0%)
  violacoes ............................ 0
  avisos (bateria A13-A16, D4/A14a-0) .. 0

  20 passou · 0 falhou · 0 pendente
```

Exit **0**, com a aula 1 sem demonstrar nada. Duas consequências que o leitor do placar não tem como
adivinhar:

1. **A linha `avisos (bateria A13-A16, D4/A14a-0) .. 0` significa "não rodou", não "passou".**
2. **A segunda coluna do histograma é falsa nesta trilha.** Ela é rotulada *"verdadeiramente novas
   (A14a, demo ∖ cumulativo ∖ boiler)"*, mas com a bateria desligada ela cai no valor da primeira
   coluna por default (`audit.ts:590`:
   `novosVerdadeiros: progressao.novosPorAula.get(ref) ?? introduces.productive.length`). É por isso
   que as duas colunas são **idênticas nas 20 aulas** — não é um achado, é o fallback.

**O que de fato roda contra esta trilha:**

| Grupo | Regras | Quantas | Situação |
|---|---|---|---|
| Rodam e estão verdes | A1, A2, A3, A4, A6, I12, I14, I15, I16, I17 (+ `DEC`, de §5.3) | 10 | agnósticas de linguagem |
| **Pulam em silêncio** | A13, A13d, A14a, A14b, A15a, A15b, A16 | 7 | JavaScript-only (`progressao.ts:432`) |
| **Implementada mas inatingível** | A11 | 1 | dispara só em `api:assert.throws` / `node:ThrowStatement` (`audit.ts:540`) — chaves de JavaScript |
| **Não existem no código** | A5, A7, A8, A9, A10, A12, I1–I11, I13 | 18 | §2.3 |

Contando §5.1 e §5.2 na granularidade em que a engine as implementa (A1–A16 com as subdivisões
A13d/A14a/A14b/A15a/A15b, mais I1–I17): **36 verificações numeradas, 18 implementadas, 10 rodando
contra esta trilha.** O placar diz `20 passou · 0 falhou · 0 pendente`, e §9.2 exige que *"toda
limitação (sem chave, sem rede, checagem não executada) é **declarada na saída**, nunca omitida"*.
Aqui a checagem não executada não aparece em lugar nenhum da saída.

### 2.3 §3.6 — o tamanho de uma aula

A régua de [`16`](16-engine-de-trilha.md) §3.6 é *"Construções produtivas novas por aula: ≤ 2, nunca
3"*, e I2/A7 a repetem como invariante dura: *"`introduces.productive` tem no máximo 2 itens em toda
aula"*.

```bash
cd app && python3 -c "
import json,glob
for p in sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json')):
    L=json.load(open(p)); n=len(L['introduces']['productive'])
    if n>2: print(L['slug'], n, L['introduces']['productive'])
"
```

```
a-primeira-linha 3 ['global:print', 'node:Call', 'node:StrLiteral']
o-sinal-do-numero 3 ['op:unary:-', 'op:unary:+', 'node:UnaryOp']
```

**Duas aulas em 20 violam o teto — e o `audit` não reclama.** A razão é que a regra **A7 não está
implementada**: das 16 regras da bateria de §5.1, o código emite apenas
`A2 A4 A6 A13 A13d A14a A14b A15a A15b A16 DEC I12 I14 I15 I16 I17`
(`engine/audit.ts`, `engine/quality/progressao.ts`), reproduzível por:

```bash
cd app && grep -rho "regra: '[A-Za-z0-9]*'" electron/main/engine/ | sort -u
```

O `grep` acima subestima: A1, A3 e A11 também existem, com a violação montada pelo caminho genérico
(`engine/audit.ts:51-56,158-162,540-542`) em vez de um literal `regra: 'Ax'`. A1 e A3 rodam; A11 só
dispara sobre `api:assert.throws` e `node:ThrowStatement`, que são chaves de JavaScript — numa trilha
de Python ela é inatingível. **A5, A7, A8, A9, A10, A12 e as invariantes I1–I11 e I13 não existem em
lugar nenhum do código.**

O teste de atomicidade em quatro cláusulas de §3.6 (demonstrável, exercitável, orçamentável,
cronometrável) tem uma implementação — `engine/phases/atomicity.ts` — que **nenhum ponto de entrada
alcança**, ver §7.1. A cláusula 4 (cronometrável, ≤ 120 s) não é medida em lugar nenhum, e
[`17`](17-trilha-python.md) declara isso ela mesma: *"Também não prova o teto de 120 s por desafio,
que só é mensurável depois de a solução de referência existir."*

**O histograma de §2.2, ainda assim, não tem penhasco**: o maior valor é 3 e a mediana é 2, contra
a mediana 3 e o pico 18 da trilha apagada. Isso é mérito da autoria, não do gate — A14a e A14b, que
seriam quem cobraria isso, não rodam nesta trilha (§2.2.1).

### 2.4 §3.7 — composição não é de graça

[`16`](16-engine-de-trilha.md) §3.7 é literal: *"Toda composição é um **nó próprio** do grafo, com
aula própria, marcada `role: "integration"`."* O gate correspondente é A9.

Medido na trilha:

```bash
cd app && python3 -c "
import json,glob,collections
c=collections.Counter(json.load(open(p)).get('role') for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json'))
print(dict(c))
"
# -> {'regular': 15, 'consolidation': 5}
```

Três achados encadeados:

1. **Nenhuma aula é `integration`.** O módulo inteiro é `regular` + `consolidation`.
2. **`consolidation` não existe no contrato da engine.** O schema de artefatos declara
   `role: z.enum(['regular', 'integration'])` (`engine/schemas/artifacts.ts:200` e `:387`); o vocabulário
   de nós é `['isolado', 'integration']` (`engine/phases/f2Decompose.ts:112`). O valor
   `consolidation` foi introduzido por [`17`](17-trilha-python.md) (§"Conteúdo por aula" e a nota do
   M4). **É uma divergência normativa entre `docs/16` e `docs/17` que nenhum dos dois documentos
   registra como tal.**
3. **O campo `role` não é lido por ninguém.** Ele não existe em `electron/main/content/trackTypes.ts`
   (o schema do produto), `engine/budget.ts` não o consulta, e `buildTrackLesson`
   (`electron/main/services/trackService.ts:294-330`) não o repassa ao renderer. É metadado inerte.

O preço disso é medível. A regra I3 diz *"nenhuma construção é introduzida por duas aulas (unicidade
de origem)"*, e [`17`](17-trilha-python.md) promete que a consolidação não é segunda origem
(*"nenhuma delas é segunda origem (I3)"*). No disco:

```bash
cd app && python3 -c "
import json,glob,collections
o=collections.defaultdict(list)
for p in sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json')):
    L=json.load(open(p))
    for a in L['introduces']['productive']: o[a].append((L['slug'],L.get('role')))
for k,v in sorted(o.items()):
    if len(v)>1: print(k,'->',v)
"
```

```
decl:assign   -> dar-nome-a-um-valor (regular), religar-o-mesmo-nome (cons.), quando-da-errado (cons.)
global:print  -> a-primeira-linha (regular), mais-de-uma-linha (cons.), a-linha-que-o-python-ignora (cons.)
node:JoinedStr-> texto-com-buraco (regular), quando-da-errado (cons.)
op:binary:+   -> somar (regular), juntar-textos (cons.)
```

**Quatro átomos têm duas ou três aulas de origem.** A promessa de `docs/17` é feita pelo campo
`role`, que a derivação do orçamento não lê; e I3, que pegaria isso, não está implementada. A
promessa não tem quem a cumpra.

E o conceito que a composição de fato exercita **não tem aula dona nenhuma**:

```bash
cd app && python3 -c "
import json,glob
c={x for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json') for x in json.load(open(p))['concepts']}
m=json.load(open('resources/tracks/python/modules/a-tela/challenges/rachando-a-conta/challenge.json'))
print(m['concept'],'tem aula dona?',m['concept'] in c)
"
# -> composicao_da_tela tem aula dona? False
```

`composicao_da_tela` é exatamente o "saber `if` dentro de função" de §3.7: o desafio de módulo cobra
composição, e não existe aula de integração que a ensine. É a única lacuna de conceito do módulo, e
ela está no lugar mais caro.

### 2.5 §4.3 — a ordem interna de uma aula, e os campos que faltam

§4.3 prescreve `objetivo → esqueleto de teoria (F7) → desafio e testes (F8) → fechamento da teoria`.
O artefato do primeiro passo é o campo `objective` (§10: *"`objective` (verbo, enunciado, contexto,
critério)"*). Medido:

```bash
cd app && python3 -c "
import json,glob
ps=glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json')
for f in ['objective','foraDeEscopo','eiClass','notionalMachineDelta','budgetHash','budgetVersion','status','research']:
    print(f'{f:22}', sum(1 for p in ps if f in json.load(open(p))), 'de 20 aulas')
"
```

| Campo de §10 (`lesson.json`) | Presente em | Observação |
|---|---|---|
| `introduces` | 20 de 20 | é o que sustenta o `audit` |
| `introducesTerms` | 20 de 20 | vazio em todas |
| `role` | 20 de 20 | valor fora do enum da engine, ninguém lê (§2.4) |
| `targetAtom` | 20 de 20 | ninguém lê — só `f12Materialize` escreve |
| `objective` | **0 de 20** | §4.3 não tem artefato |
| `foraDeEscopo` | **0 de 20** | §10 diz **"obrigatório, não vazio"** |
| `eiClass` | **0 de 20** | §7.1 regra 4 depende dele para escolher o formato |
| `notionalMachineDelta` | **0 de 20** | — |
| `budgetHash` / `budgetVersion` | **0 de 20** | sem eles o FREEZE de §F5 não é rastreável |
| `status` / `research` | **0 de 20** | — |

No `challenge.json` a situação é a mesma, e ela tem consequência direta em J4/J5/J9:

| Campo de §10 (`challenge.json`) | Presente em |
|---|---|
| `outputChannel` | 21 de 21 (`impressao`) |
| `requirements` (J4) | **0 de 21** |
| `notRequired` (J9) | **0 de 21** |
| `wrongSolutions` (J5) | **0 de 21** |
| `scenarios`, `subgoals`, `requires`, `taskSkill`, `supportLevel`, `surfaceDomain`, `solutionAlternates` | **0 de 21** |

E a contagem de testes, que é o que J5 precisa para discriminar:

```bash
cd app && python3 -c "
import json,glob
ps=sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/challenges/*/challenge.json'))+sorted(glob.glob('resources/tracks/python/modules/a-tela/challenges/*/challenge.json'))
print(len(ps),'desafios; expectedTestCount:',sorted({json.load(open(p))['expectedTestCount'] for p in ps}))
"
# -> 21 desafios; expectedTestCount: [1]
```

**Os 21 desafios da trilha têm exatamente 1 teste cada.** J5 ("Discriminação") exige que *"cada
solução errada catalogada falha em ≥1 teste; nenhum par falha no mesmo conjunto"*. Com um único
teste, **todo** par de soluções erradas falha no mesmo conjunto — o singleton. J5 é insatisfazível
por construção nos 21 desafios, e nenhum catálogo de `wrongSolutions` mudaria isso.

O desafio de módulo diverge da sua própria especificação: [`17`](17-trilha-python.md) §"Desafios de
módulo" exige *"statement longo com cenário do mundo real (2–4 mil caracteres) e **4–6 testes**"*.
`rachando-a-conta` tem statement de 2138 caracteres (dentro) e **1 teste** (fora).

### 2.6 A divergência entre o artefato, o `docs/17` e a mensagem de commit

A tabela do M1 em [`17`](17-trilha-python.md) §"Módulo 1 — `a-tela`" declara, aula por aula, o
"avanço produtivo NOVO", e fecha com *"Progressão produtiva do módulo 1 (**23 átomos**, na ordem)"*.
O disco tem outra coisa:

```bash
cd app && python3 -c "
import json,glob
u=set()
for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json'):
    u|=set(json.load(open(p))['introduces']['productive'])
print('atomos produtivos distintos no modulo:',len(u))
print('nao citados na tabela do docs/17:',sorted(u-{'global:print','node:IntLiteral','op:binary:+','op:binary:-','op:binary:*','op:binary:/','node:FloatLiteral','op:binary://','op:binary:%','op:binary:**','op:unary:-','op:unary:+','decl:assign','node:JoinedStr','node:FormattedValue','global:int','global:str','global:float','global:round','node:BoolLiteral','global:bool','node:NoneLiteral','global:type'}))
"
```

```
atomos produtivos distintos no modulo: 28
nao citados na tabela do docs/17: ['node:Assign', 'node:BinOp', 'node:Call', 'node:StrLiteral', 'node:UnaryOp']
```

**28 átomos contra os 23 declarados.** Aula a aula: reconstruindo a tabela do M1 mecanicamente — as
chaves entre crases da coluna "avanço produtivo NOVO", linha por linha — e comparando com o
`introduces.productive` do `lesson.json` de mesmo slug:

```bash
cd app && python3 -c "
import json,re
sec=open('../docs/17-trilha-python.md').read().split('### Módulo 1 — \`a-tela\`')[1].split('### Módulo 2')[0]
A=[];B=[]
for l in sec.splitlines():
    if not re.match(r'^\| *\d+ \| \`', l): continue
    c=[x.strip() for x in l.strip().strip('|').split('|')]
    slug=c[1].strip('\`')
    tab={k for k in re.findall(r'\`([^\`]+)\`', c[2]) if ':' in k and not k.startswith('term:')}
    disco=set(json.load(open('resources/tracks/python/modules/a-tela/lessons/%s/lesson.json'%slug))['introduces']['productive'])
    if disco!=tab: B.append((slug,sorted(disco-tab),sorted(tab-disco)))
    if disco!=(set() if c[2].startswith('cons.') else tab): A.append(slug)
print('aulas comparadas:',20)
print('divergentes, lendo cons. como re-declaracao do atomo:',len(B))
for s,mais,menos in B: print('  ',s,'| a mais no disco:',mais,'| faltando no disco:',menos)
print('divergentes, lendo cons. ao pe da letra (nenhum atomo novo):',len(A),A)
"
```

```
aulas comparadas: 20
divergentes, lendo cons. como re-declaracao do atomo: 5
   a-primeira-linha | a mais no disco: ['node:Call', 'node:StrLiteral'] | faltando no disco: []
   somar | a mais no disco: ['node:BinOp'] | faltando no disco: []
   o-sinal-do-numero | a mais no disco: ['node:UnaryOp'] | faltando no disco: []
   dar-nome-a-um-valor | a mais no disco: ['node:Assign'] | faltando no disco: []
   quando-da-errado | a mais no disco: ['decl:assign', 'node:JoinedStr'] | faltando no disco: []
divergentes, lendo cons. ao pe da letra (nenhum atomo novo): 9 ['a-primeira-linha', 'mais-de-uma-linha', 'somar', 'o-sinal-do-numero', 'dar-nome-a-um-valor', 'religar-o-mesmo-nome', 'juntar-textos', 'a-linha-que-o-python-ignora', 'quando-da-errado']
```

**5 das 20 aulas** — `a-primeira-linha`, `somar`, `o-sinal-do-numero`, `dar-nome-a-um-valor` e
`quando-da-errado` — têm `introduces.productive` diferente da linha correspondente da tabela, sempre
por excesso, nunca por falta. O número depende de como se lê a célula de uma aula de consolidação, e
por isso o script publica as duas leituras: **5** quando *"cons. — `global:print` em forma nova"*
conta como declaração de que a aula re-declara `global:print`, e **9** lendo a coluna ao pé da letra
(o "avanço produtivo NOVO" de uma consolidação é nenhum). As 4 aulas em que as leituras discordam
são justamente consolidações que re-declaram um átomo já introduzido — as origens duplicadas que
§2.4 já conta; o número citado aqui é o conservador, **5**, para não contar o mesmo defeito duas
vezes. As 5 chaves extras do módulo são as sintéticas que o adaptador de Python emite ao lado do
operador; é a mesma tensão que [`17`](17-trilha-python.md) §"A regra do par" declara, mas a tabela
do M1 **não foi atualizada com elas**, e é a tabela que o autor lê.

Sobre os quizzes, a mensagem do commit `83a93f4` afirma *"52 quizzes ancorados na secao que
demonstra a afirmacao"*. Medido: **44**.

```bash
cd app && python3 -c "
import json,glob
print(sum(len(json.load(open(p))['assertions']) for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json')))
"
# -> 44
```

**Divergência confirmada: 52 declarados, 44 no disco.** A mensagem de commit é imutável e não pode
ser corrigida; fica aqui o registro, que é o que `CONTRIBUTING.md` §"Número sem verificação" pede.

### 2.7 O que está bem construído no artefato

Não é uma lista de cortesia — são medições.

**Higiene de bloco de código: 111 de 111 com tag.** [`16`](16-engine-de-trilha.md) §5.3 exige
*"bloco cercado com tag é código; crase inline é prosa"* e mede 26% dos blocos sem tag na trilha
antiga (68 blocos, na tabela de §1). Aqui é zero:

```bash
cd app && python3 -c "
import json,glob,re,collections
c=collections.Counter()
for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json'):
    for s in json.load(open(p))['theory']:
        d=False
        for ln in s['markdown'].split('\n'):
            m=re.match(r'^\`\`\`(.*)$',ln)
            if m and not d: c[m.group(1).strip() or '(SEM TAG)']+=1; d=True
            elif m: d=False
print(dict(c),'| total',sum(c.values()))"
# -> {'python': 55, 'text': 53, 'traceback': 3} | total 111
```

**A docstring de teste está em 21 de 21.** [`17`](17-trilha-python.md) §"UX" exige que todo método
de teste carregue uma docstring de uma linha em pt-BR, porque é ela que vira o rótulo do check:

```bash
cd app && python3 -c "
import json,glob,re
ps=sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/challenges/*/challenge.json'))+sorted(glob.glob('resources/tracks/python/modules/a-tela/challenges/*/challenge.json'))
t=s=0
for p in ps:
    for m in re.finditer(r'def (test_\w+)\([^)]*\):\s*\n(\s*)(.*)', json.load(open(p))['testsCode']):
        t+=1
        if not m.group(3).lstrip().startswith(('\"\"\"',chr(39)*3)): s+=1
print('metodos de teste',t,'| sem docstring',s)"
# -> metodos de teste 21 | sem docstring 0
```

E o resto:

- **Zero aula sem construção nova** (a trilha antiga tinha 12), zero lacuna de currículo (a antiga
  tinha 249) — os dois no placar de §2.2.
- **A âncora do quiz é honesta.** Ver §4.
- **A velocidade de leitura da teoria é derivada, não escolhida.** `src/lib/trackLessonState.ts:270-310`
  mostra a conta inteira (seção mais longa da aula 1 = 564 chars → ≥ 28,2 chars/s → 7 tps) antes da
  constante. É o padrão que o resto do repositório deveria seguir.

---

## 3. As nove cláusulas J1–J9: o que roda de verdade

### 3.1 O quadro

| # | Cláusula (§9.1) | Existe código? | Roda contra a trilha real? | Resultado medido |
|---|---|---|---|---|
| **J1** | Contenção | sim — `engine/audit.ts` | **sim** | **0 violações em 20 desafios** (o 21º não é auditado, §3.5) |
| **J2** | Exercício (A6) | sim — `engine/audit.ts` | **sim** | **0 violações** |
| **J3** | Solubilidade (aluno simulado, pass^k) | sim — `engine/quality/solvable.ts`, 564 linhas | **não** — nenhum ponto de entrada alcança o módulo (§7.1) e ele exige LLM | **não medido** |
| **J4** | Especificação (bijeção enunciado ↔ teste) | sim — `engine/quality/requirements.ts` | roda e **reprova** | **0 de 21** com bijeção; 21 com gap; exit 1 |
| **J5** | Discriminação | parcial — `engine/quality/mutants.ts` mede o revisor, não o desafio | **não** | **insatisfazível**: 1 teste por desafio, `wrongSolutions` ausente nos 21 |
| **J6** | Carga | parcial — A14a/A14b existem mas **pulam em Python** (§2.2.1); `phases/atomicity.ts` órfão | **não** | 2 aulas acima do teto de §3.6 passam verdes; **teto de 120 s nunca medido** |
| **J7** | Alinhamento (verbo objetivo = seção = desafio) | **não** | não | `objective` ausente nas 20 aulas — não há o que alinhar |
| **J8** | Feedback | **não** (nenhum verificador) | não | 44 de 44 assertions têm `feedback` não vazio, mas **o aluno que acerta não o vê** (§6.3) |
| **J9** | Escopo declarado (`notRequired` não vazio) | **não** | não | `notRequired` ausente nos 21 desafios |

**Placar das cláusulas: 2 provadas · 1 reprovada · 6 não provadas.** E as duas provadas (J1, J2)
valem só pelas 10 regras numeradas que rodam — nunca pelas 7 que a linguagem faz pular (§2.2.1).

### 3.2 O `requirements` reprova os 21, e sai 1 (correto)

```bash
cd app && npx tsx tools/track-engine/cli.ts requirements python
```

```
PLACAR (requirements)
  desafios ..................... 21
  bijecao completa ............ 0
  com gaps .................... 21
  requirements sem teste ...... 0
  testes sem requirement ...... 0
```

Exit **1**. O `derivados: 0 · declarados: 0` de cada linha diz o que aconteceu: nenhum
`requirements` foi declarado (§2.5) **e** a derivação a partir do teste devolveu zero, porque a
derivação também é JavaScript-only (`engine/quality/requirements.ts:320,372` chamam `exigirJs`). J4
está reprovada por dois motivos independentes.

### 3.3 O `coverage` reprova os 21, e sai **0** — o fail-open

```bash
cd app && npx tsx tools/track-engine/cli.ts coverage python
```

```
PLACAR (coverage)
  desafios ..................... 21
  passou (solucao minima) ...... 0
  sem-solucao .................. 0
  parse-falhou ................. 21
  prover-falhou ................ 0
  ignorados (multi-arquivo) .... 0
  lacunas (fora do orcamento) .. 0
  excessos (aula ensina, teste nao cobra) .. 0
```

Exit **0**. Todos os 21 saem com `PARSE-FALHOU: testsCode não parseia como JavaScript`
(`engine/quality/minimal.ts:230`), e mesmo assim o comando declara sucesso. A linha responsável é
única:

```ts
// app/tools/track-engine/cli.ts:624
const violou = placar.lacunas > 0 || placar.semSolucao > 0 || placar.proverFalhou > 0;
```

`parseFalhou` não entra na conta. O comando cujo trabalho é dizer "o que o teste realmente cobra"
falha em 100% dos casos e reporta verde. É a definição de aprovação por omissão que
[`16`](16-engine-de-trilha.md) §9.3 proíbe: *"Trilha é conteúdo versionado e offline — **a engine
falha fechada**. Indisponibilidade produz erro estruturado, nunca veredito falso nem aprovação por
omissão."*

O `revise`, para crédito dele, **acerta o comportamento**: reporta as 20 aulas como
`NAO-REVISAVEL (fail-closed)` e sai 1.

```bash
cd app && npx tsx tools/track-engine/cli.ts revise python
# PLACAR: aulas 20 · cobertas 0 · nao-revisaveis 20   (exit 1)
```

### 3.4 A raiz única: o identificador de linguagem se perde no caminho

Os 21 `challenge.json` declaram `"language": "python"`:

```bash
cd app && python3 -c "
import json,glob,collections
ps=sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/challenges/*/challenge.json'))+sorted(glob.glob('resources/tracks/python/modules/a-tela/challenges/*/challenge.json'))
print(collections.Counter((json.load(open(p))['language'], json.load(open(p))['outputChannel']) for p in ps))
"
# -> Counter({('python', 'impressao'): 21})
```

E o registro de adaptadores conhece Python de verdade — `KNOWN_LANGUAGE_IDS` inclui `'python'`
(`engine/lang/registry.ts:91`) e o adaptador parseia por subprocesso `python3`. **O campo existe, o
adaptador existe, e três chamadores não os ligam:**

| Onde | Linha | O que faz |
|---|---|---|
| `app/tools/track-engine/cli.ts` | 515 | `sintetizarCodigoMinimo(prover, { starterCode, solutionCode, testsCode, expectedTestCount })` — **`ch.language` não é passado**; o default é `javascript` |
| `app/electron/main/services/challengeExec.ts` | 343-354 | `challengePairFromSource` monta o par **sem copiar `challenge.language`** |
| `app/electron/main/services/challengeExec.ts` | 361-365 | `verifyChallengePair(pair, exec, adapter = defaultAdapter())` — o default é `javascript` |
| `app/electron/main/services/challengeExec.ts` | 229-232 | `runStudentCode(input, exec, adapter = defaultAdapter())` — idem |
| `app/electron/main/ipc/track-handlers.ts` | 465-470 | chama `runStudentCode({...})` **sem adaptador** — é o caminho do aluno |
| `app/tools/track-cli.ts` | 568, 581 | `defaultAdapter().countDeclared(ch.testsCode)` — contagem de testes fixada em JS |

O resultado é o mesmo em todos: o teste Python é escrito num arquivo `test.mjs` e entregue ao
`node --test`.

**As quatro provas de execução de §5.4, medidas:**

```bash
cd app && npx tsx tools/track-cli.ts track:challenge:verify python a-tela a-primeira-linha escreva-oi
```

```
desafio 'escreva-oi' (Escreva oi)
  testes declarados:        1
  testes no arquivo:        0
  solução de referência:    FALHA ✗
  starter (aluno):          FALHA (ok) ✓

--- saída ---
file:///var/tmp/user-1000/track-verify-3sY3jp/test.mjs:2
import io
^^^^^^

SyntaxError: Unexpected token 'import'
```

Exit **1**. Prova 1 (a solução de referência passa) **falha**. Prova 3 (a contagem bate) **falha**:
0 ≠ 1. Prova 2 (o starter falha) passa **vacuamente** — tudo falha, inclusive o gabarito, que é
precisamente o modo de falha que §5.4 nomeia (*"exit code sozinho não distingue 'passou' de 'nada
rodou'"*).

**E o `track:validate` reporta os 21 assim e sai 0:**

```bash
cd app && npx tsx tools/track-cli.ts track:validate python
```

```
✓ trilha 'python' — Python, do primeiro print ao sênior
  ...
  [a-tela/a-primeira-linha] escreva-oi: NÃO VERIFICADO ✗
  ... (as 21 linhas, todas NÃO VERIFICADO ✗)
```

Exit **0**. A causa é estrutural: `cmdValidate` (`app/tools/track-cli.ts:548-596`) **imprime** o
veredito de cada desafio e nunca o acumula — o único `process.exit(1)` da função está no `catch` de
`TrackLoadError`. Um `✗` por desafio, 21 deles, e o comando declara a trilha válida.

**O impacto no aluno, reproduzido pelo caminho de produção:**

```bash
cd app && npx tsx -e '
import { readFileSync } from "node:fs";
import { runStudentCode } from "./electron/main/services/challengeExec";
const ch = JSON.parse(readFileSync("resources/tracks/python/modules/a-tela/lessons/a-primeira-linha/challenges/escreva-oi/challenge.json","utf8"));
runStudentCode({ studentCode: ch.solutionCode, testsCode: ch.testsCode, expectedTestCount: ch.expectedTestCount })
  .then(r => console.log("passed:", r.passed, "| checks:", JSON.stringify(r.checks), "| saida:", (r.output||"").split("\n")[1]));
'
```

```
passed: false | checks: [] | saida: import io
```

O aluno digitou `print("oi")` — a solução de referência da própria trilha — e recebeu reprovação
com uma lista de checks **vazia** e um `SyntaxError` de JavaScript na tela.

A cadeia que fecha o cerco:

1. `isLessonFinishBlocked` (`src/lib/trackLessonState.ts:419-424`) bloqueia "Concluir aula" enquanto
   algum desafio tiver `lastVerdict !== 'passed'`;
2. `computeUnlockStates` (`electron/main/services/trackService.ts:107-120`) tranca a aula N+1
   enquanto a aula N não estiver concluída;
3. nenhum desafio pode passar.

**Nenhuma das 20 aulas pode ser concluída. O aluno fica preso na aula 1.** Este é o achado que
subordina todos os outros.

### 3.5 O desafio de módulo escapa do gate

`audit.ts:429` itera apenas `lesson.challenges`. O desafio de módulo (`mod.challenge`) e o de
proficiência não entram — o `audit` diz "desafios: 20" enquanto o `coverage`, que os coleta
(`cli.ts:416-432`), diz 21.

Para medir o que o gate não vê, o desafio de módulo foi anexado à última aula numa **cópia** da
trilha, fora do repositório, e auditado com `--dir`:

```bash
SC=$(mktemp -d); cp -r app/resources/tracks/python $SC/t
cp -r $SC/t/modules/a-tela/challenges/rachando-a-conta $SC/t/modules/a-tela/lessons/quando-da-errado/challenges/
python3 - "$SC" <<'PY'
import json,sys
b=sys.argv[1]+'/t/modules/a-tela'
d=json.load(open(b+'/lessons/quando-da-errado/lesson.json')); d['challenges'].append('rachando-a-conta')
json.dump(d,open(b+'/lessons/quando-da-errado/lesson.json','w'),ensure_ascii=False,indent=2)
m=json.load(open(b+'/module.json')); del m['challenge']
json.dump(m,open(b+'/module.json','w'),ensure_ascii=False,indent=2)
PY
cd app && npx tsx tools/track-engine/cli.ts audit python --dir $SC/t --limite 30
```

Resultado: **21 desafios, 1 violação — `I16`**, `composicao_da_tela` sem aula dona (§2.4). Nenhuma
violação de orçamento (A1/A2/A3): o código de `rachando-a-conta` **cabe** no orçamento cumulativo.

> `[INFERÊNCIA]` A violação `I16` é em parte artefato da relocação — `I16` compara o conceito do
> desafio com o `concepts` da aula à qual ele foi anexado, e um desafio de módulo não tem aula. O
> que **não** é artefato é o fato subjacente: `composicao_da_tela` não é declarado por nenhuma das
> 20 aulas, verificado independentemente pelo comando de §2.4.

---

## 4. A teoria ensina o que o quiz cobra?

Este é o eixo mais bem construído da trilha, e a medição sustenta isso.

```bash
cd app && python3 -c "
import json,glob
tot=sem=inval=0
for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json'):
    L=json.load(open(p)); ids={s['id'] for s in L['theory']}
    for a in L['assertions']:
        tot+=1
        if 'sectionId' not in a: sem+=1
        elif a['sectionId'] not in ids: inval+=1
print('assertions',tot,'| sem ancora',sem,'| ancora inexistente',inval)
"
# -> assertions 44 | sem ancora 0 | ancora inexistente 0
```

- **44 de 44 têm âncora**, e **44 de 44 apontam para um `theory[].id` que existe**. Nenhuma cai no
  `FALLBACK_QUIZ_SECTION`.
- **Nenhuma aula passa de 3 assertions** (o máximo do schema): mín. 2, máx. 3.

A pergunta mais difícil — *a seção ancorada realmente demonstra a afirmação?* — foi atacada por um
proxy léxico: para cada assertion, qual seção da aula tem a maior sobreposição de palavras
significativas com `statement + question + opção correta`.

```bash
cd app && python3 -c "
import json,glob,re,unicodedata
ST=set('a o e de da do que em um uma para com por na no as os ao se sua seu ele ela isso nao sim ja so tambem quando como onde qual voce vai ser esta este essa esse ate entre sobre'.split())
def n(t):
    t=unicodedata.normalize('NFD',t.lower()); t=''.join(c for c in t if unicodedata.category(c)!='Mn')
    return {w for w in re.findall(r'[a-z0-9_]+',t) if len(w)>2 and w not in ST}
ok=tot=0
for p in sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json')):
    L=json.load(open(p)); S={s['id']:n(s['title']+' '+s['markdown']) for s in L['theory']}
    for a in L['assertions']:
        tot+=1; alvo=n(a['statement']+' '+a['question']+' '+a['options'][a['answerIndex']])
        sc={k:len(alvo&v) for k,v in S.items()}; mx=max(sc.values())
        if sc[a['sectionId']]==mx: ok+=1
        else: print('revisar:',L['slug']+'/'+a['id'],'ancora',a['sectionId'],sc[a['sectionId']],'vs',[k for k,v in sc.items() if v==mx],mx)
print(ok,'de',tot,'ancoras coincidem com a secao de maior sobreposicao')
"
```

```
revisar: mais-de-uma-linha/um-print-uma-linha ancora uma-ordem-por-linha 7 vs ['duas-linhas'] 8
revisar: numero-nao-tem-aspas/aspas-fazem-texto ancora com-aspas-e-sem-aspas 2 vs ['iguais-na-tela-diferentes-por-dentro'] 4
revisar: somar/o-que-sai-e-o-resultado ancora o-sinal-de-mais 3 vs ['a-conta-acontece-antes'] 5
revisar: a-linha-que-o-python-ignora/cerquilha-desliga-a-linha ancora desligar-uma-linha 4 vs ['comentario-no-fim-da-linha'] 6
40 de 44 ancoras coincidem com a secao de maior sobreposicao
```

> `[INFERÊNCIA]` **As 4 exceções foram lidas à mão e as 4 âncoras estão certas.** Exemplo:
> `somar/o-que-sai-e-o-resultado` afirma *"O que aparece na tela é o resultado da conta, não a
> conta"* e está ancorada em `o-sinal-de-mais`, cujo markdown é `print(2 + 3)` seguido da saída `5`
> — a demonstração literal da afirmação. A seção `a-conta-acontece-antes` *explica* o mecanismo e por
> isso compartilha mais palavras, mas quem **demonstra** é a primeira. **O proxy léxico é um
> instrumento fraco e neste caso ele errou nas 4; a autoria acertou nas 44.** Não há defeito de
> ancoragem medido nesta trilha.

**A lacuna real do quiz é de cobertura, não de âncora:**

```bash
cd app && python3 -c "
import json,glob
tot=sem=0
for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json'):
    L=json.load(open(p)); anc={a['sectionId'] for a in L['assertions']}
    for s in L['theory']:
        tot+=1
        if s['id'] not in anc: sem+=1
print(sem,'de',tot,'secoes de teoria sem quiz ancorado')
"
# -> 18 de 60 secoes de teoria sem quiz ancorado
```

**30% das seções não têm quiz.** Isso não é violação de contrato — **nem `docs/16` nem `docs/17`
mencionam a palavra `assertion` uma única vez**:

```bash
grep -c "assertion" docs/16-engine-de-trilha.md docs/17-trilha-python.md
# -> docs/16-engine-de-trilha.md:0
# -> docs/17-trilha-python.md:0
```

O quiz — hoje o instrumento pedagógico mais visível do app e **obrigatório** desde a onda 10 — não
tem contrato normativo em documento nenhum. Sua única especificação é o comentário do schema:
*"máx. 3 por aula — requisito do dono do produto"* (`electron/main/content/trackTypes.ts:191`).
O defeito de §5.1 é filho direto dessa ausência.

---

## 5. Defeitos estruturais que ninguém pegou

### 5.1 A colisão de chave de quiz: o app responde o quiz pelo aluno

`quizKeyFor` chaveia o estado do quiz pela seção, não pela assertion:

```ts
// app/src/lib/trackLessonState.ts:948-950
export function quizKeyFor(assertion: Pick<TrackAssertionDto, 'id' | 'sectionId'>): string {
  return assertion.sectionId ?? assertion.id;
}
```

Duas assertions na mesma seção compartilham a chave. Isso acontece em **2 das 20 aulas** — e uma
delas é a **aula 1 do curso**:

```bash
cd app && python3 -c "
import json,glob,collections
for p in sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json')):
    L=json.load(open(p)); c=collections.Counter(a.get('sectionId') or a['id'] for a in L['assertions'])
    for s,v in c.items():
        if v>1: print(L['slug'],'->',s,'com',v,'assertions')
"
```

```
a-primeira-linha -> as-tres-partes-da-linha com 2 assertions
dar-nome-a-um-valor -> guardar-num-nome com 2 assertions
```

O efeito não é apenas "uma resposta libera as duas". `optionVisualState`
(`src/lib/trackLessonState.ts:813-830`) decide a aparência de cada opção a partir do `QuizState`
compartilhado, e `QuizState` guarda `selected` e `correct` de **outra** pergunta. Rodando as funções
puras reais contra o `lesson.json` real:

```bash
cd app && npx tsx -e '
import { readFileSync } from "node:fs";
import { submitQuizAnswer, optionVisualState, quizKeyFor, createTrackLessonState } from "./src/lib/trackLessonState";
const L = JSON.parse(readFileSync("resources/tracks/python/modules/a-tela/lessons/a-primeira-linha/lesson.json","utf8"));
const [a1, a2] = L.assertions.filter((a: any) => a.sectionId === "as-tres-partes-da-linha");
let s = createTrackLessonState();
s = submitQuizAnswer(s, quizKeyFor(a1), a1.answerIndex, a1.answerIndex);  // o aluno responde SO a 1a
const q2 = s.quizBySection[quizKeyFor(a2)];
console.log("card da 2a assertion:", a2.id, "| answered:", q2?.answered, "| correct:", q2?.correct);
a2.options.forEach((o: string, i: number) => {
  const v = optionVisualState(i, a2, q2);
  console.log(" ", i, v.icon === "correct" ? "VERDE+CHECK" : "neutra     ", JSON.stringify(o.slice(0,44)));
});
'
```

```
card da 2a assertion: aspas-marcam-o-texto | answered: true | correct: true
  0 VERDE+CHECK "Marcam o começo e o fim do texto que vai ser"
  1 neutra      "Deixam a letra maiúscula."
  2 neutra      "Servem para o computador entender português."
  3 neutra      "São enfeite: pode tirar que funciona igual."
```

**O aluno nunca clicou nesse card, e o app já o marcou como respondido, correto, com a alternativa
certa em verde e o ícone de acerto.** Na segunda pergunta da primeira aula do curso.

Isto é a reintrodução, por outra porta, do defeito que a onda 10 anunciou ter consertado: *"o quiz
para de entregar a resposta (a decisão visual virou função pura que nem LÊ `answerIndex` antes de
responder)"* (commit `26dbc19`). A função pura de fato não lê `answerIndex` **antes de haver
resposta** — o problema é que existe uma resposta, só que de outra pergunta.

E o comportamento está **pinado como correto**:

```ts
// app/tests/lessonQuizGate.test.ts:190
it('duas assertions na MESMA seção compartilham a chave: uma resposta cobre as duas', () => {
```

O teste afirma o gate (`pendingQuizzes` cai para 0) e **não verifica a aparência do segundo card**.
O pin é verdadeiro sobre o que testa e cego sobre o que importa.

**Impacto sobre o aluno:** de 44 quizzes, 2 nunca são realmente respondidos; o aluno recebe um
"Correto! 🎉" que não conquistou; e a afirmação *"As aspas marcam onde o texto começa e onde ele
acaba"* — que a aula 1 existe para ensinar — nunca é verificada.

### 5.2 O gate do quiz depende da ordem de apresentação, não do conteúdo

`pendingQuizzesForCurrentSection` (`src/lib/trackLessonState.ts:975-987`) bloqueia "Próximo" apenas
pelos quizzes da **última seção apresentada**. Um quiz de uma seção anterior deixa de bloquear o
avanço (continua bloqueando o "Concluir aula", por `pendingQuizzes`). Isso é coerente e está
documentado. O que **não** está previsto é o efeito combinado com §5.1: na aula 1, uma resposta na
seção 2 zera o gate de duas perguntas ao mesmo tempo, e o aluno avança tendo pensado uma vez.

### 5.3 `TrackTheorySection.code` é um campo morto que ainda chega ao prompt do tutor

O schema declara o campo:

```ts
// app/electron/main/content/trackTypes.ts:184
code?: { language: TheoryCodeLanguage; code: string; explanation?: string };
```

Uso real:

```bash
cd app && python3 -c "
import json,glob
print(sum(1 for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json') for s in json.load(open(p))['theory'] if s.get('code')), 'de 60 secoes usam o campo code')
"
# -> 0 de 60 secoes usam o campo code
```

**Zero de 60.** Todo o código da trilha vive dentro do `markdown`. Mesmo assim o campo é lido em
quatro lugares do caminho quente: `trackService.ts:307` (payload), `tutorChat.ts:134` (montagem do
prompt do sistema), `tutorChat.ts:172-174` (montagem da bolha) e `LessonView`. Custo: quatro ramos
mortos num caminho que o `audit` **não** analisa — §5.3 de [`16`](16-engine-de-trilha.md) diz que a
teoria é parseada, e o extrator lê o `markdown`; se alguém começar a usar `code`, há um segundo
canal de código teórico cuja cobertura de gate não foi verificada por esta auditoria.

### 5.4 A metade pedagógica do `lesson.json` não atravessa o IPC

`buildTrackLesson` (`electron/main/services/trackService.ts:266-330`) monta o payload da aula campo
a campo. Ele repassa `theory`, `assertions`, `sources`, `challenges`, `prerequisites`, `concepts`,
`difficulty`. **Não repassa `role`, `introduces`, `introducesTerms` nem `targetAtom`.**

Ou seja: o orçamento — a peça que a engine inteira existe para produzir — **não existe do lado do
aluno**. Nada na experiência sabe o que a aula está autorizada a ensinar. Isso é o que torna o
defeito §6.2 possível.

---

## 6. A aula como EXPERIÊNCIA

O caminho real: `LessonView` monta → "Começar aula" → `track:tutorChat` action `'next'` →
`tutorChat.nextSection` (`electron/main/services/tutorChat.ts:82-88`) → a bolha é escrita a 7 tps →
quiz ancorado → repete → "Concluir aula" (bloqueado por quiz e por desafio) → desafio.

### 6.1 O que está bem construído

- **A teoria é determinística e instantânea.** `action: 'next'` **não chama a LLM**
  (`tutorChat.ts:163-179`): o markdown do arquivo vira a bolha. Sem chave de API, sem spinner, sem
  invenção. É a decisão certa e está implementada como prometida.
- **O gate do quiz diz o motivo.** `lessonFinishBlock` devolve `'quiz' | 'challenges' | null` e a UI
  imprime o texto em `role="status"` além do tooltip (`LessonView.tsx:1284-1303`), porque *"um botão
  morto sem explicação é pior que o bug"*. Correto e acessível.
- **Errar não trava.** O gate lê `answered`, nunca `correct` (`trackLessonState.ts:439-442`). O
  quiz é para pensar, não para punir.
- **A degradação do tutor é honesta.** `answer` sem LLM devolve `TUTOR_UNAVAILABLE` imediato, nunca
  uma resposta inventada.

### 6.2 O tutor recebe a aula inteira e o orçamento nenhum

`buildSystemPrompt` (`tutorChat.ts:131-154`) monta o prompt com **todas** as seções da aula:

```ts
const sections = lesson.theory.map((s, i) => `SEÇÃO ${i + 1} [id=${s.id}]: ...`).join('\n\n---\n\n');
```

e informa ao modelo, em prosa, que ele deve fingir que o aluno não viu o resto:

```
MATERIAL DA AULA (todo o conteúdo — o aluno só viu as seções já apresentadas):
```

Duas consequências:

1. **A restrição de escopo é uma frase, não uma estrutura.** É literalmente a proibição de §11 de
   [`16`](16-engine-de-trilha.md): *"Deixar a proibição dura como frase no prompt | restrição
   verificável declarada em prosa vaza em taxa de dois dígitos."* Nada impede o tutor de responder
   a dúvida da seção 1 com o conteúdo da seção 3.
2. **O orçamento não está no prompt.** O prompt do tutor não recebe `introduces`, nem o orçamento
   cumulativo, nem a lista de construções permitidas — porque o payload não os carrega (§5.4). A
   regra 3 do prompt (*"NUNCA invente conteúdo que não está no material abaixo"*) é a única barreira,
   e ela é prosa. **A superfície que gera texto em tempo de execução é a única do produto que o gate
   de orçamento não cobre**, e a engine inteira foi construída para impedir exatamente isso.

`[INFERÊNCIA]` Não medi a taxa com que o tutor de fato extrapola o orçamento: isso exigiria chave de
API, e o método honesto seria o aluno simulado de J3, que está órfão (§7.1). **O defeito de desenho
é certo; a magnitude não foi medida.**

Nota menor do mesmo arquivo: as regras 2 e 6 do prompt (*"NUNCA apresente mais de UMA seção por
vez"*, *"Termine a apresentação de cada seção com UMA pergunta curta"*) governam o `'next'`, que
desde a onda "teoria-pronta" **não passa mais pela LLM**. São instruções mortas dentro de um prompt
vivo.

### 6.3 O aluno que acerta o quiz não recebe informação nenhuma

`LessonQuiz.tsx:130-153`: respondido, o card mostra `quizCorrect` ou `quizWrong`; e o `feedback`
autorado sai **só quando o aluno erra**:

```tsx
// app/src/views/LessonView/LessonQuiz.tsx:146
{!correct && assertion.feedback ? (
```

Os textos fixos são:

```bash
grep -n "quizCorrect\|quizWrong" app/src/i18n/locales/pt-BR/translation.json
# 199:    "quizCorrect": "Correto! 🎉"
# 200:    "quizWrong": "Não foi dessa vez."
```

E o `feedback` existe e é substantivo nas 44:

```bash
cd app && python3 -c "
import json,glob
f=[a['feedback'] for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json') for a in json.load(open(p))['assertions']]
print(len(f),'assertions |',sum(1 for x in f if not x.strip()),'com feedback vazio | mediana',sorted(map(len,f))[len(f)//2],'chars')
"
# -> 44 assertions | 0 com feedback vazio | mediana 78 chars
```

Confronto com [`ux-redesign.md`](ux-redesign.md) §8.2, que é a parte do repositório com números:

| Mecanismo (§8.2) | Efeito medido | O que o quiz faz |
|---|---|---|
| Feedback verbal **informacional** vs. nenhum | **d = +0,66** | **retém** o feedback de quem acerta |
| Elogio **esperado / ritualizado** | **d = −0,40** | entrega `"Correto! 🎉"`, idêntico, em toda resposta certa |

O próprio §8.2 escreve a conclusão: *"Um 'Parabéns!' determinístico a cada suíte verde é o caso de
d = −0,40, não o caso de onde vem o d = +0,43."* O quiz está do lado errado das duas linhas ao mesmo
tempo: dá o elogio ritualizado e **esconde** a informação que o autor escreveu. Corrigir é mostrar o
`feedback` também no acerto — ele já está no payload, já está autorado, já está na tela do errante.

### 6.4 O desafio está a um clique da abertura da aula

O botão "Desafios" fica no cabeçalho e **não tem `disabled`** (`LessonView.tsx:1010-1024`); o item
da lista chama `openChallenge` direto (`LessonView.tsx:1531-1537`). O aluno pode abrir o editor do
desafio antes de ler a primeira seção.

Isso contradiz a regra 2 de §7.1: *"A primeira interação do aluno é sempre PREVER a saída de um
programa que não é dele. **Ele nunca começa num editor em branco.**"*

`[INFERÊNCIA]` Não é obviamente um defeito: §7.1 regra 14 proíbe re-explicar com andaime de novato o
que já está consolidado, e um atalho para quem já sabe é defensável. **O que é certo é que a escolha
não está declarada em lugar nenhum** — não há decisão registrada dizendo "o desafio é acessível
desde o início e isso é intencional", e a regra 2 do documento normativo diz o contrário.

### 6.5 O worked example de §7.1 não existe nesta trilha

§7.1 regra 7 define worked example como processo: *"código sendo construído em incrementos que
rodam: escreve poucas linhas → roda → mostra a saída ou o **erro real** → lê a mensagem → corrige →
roda de novo (...) As instruções ficam **dentro** do código como comentários, nunca ao lado. (...)
Ao menos 2 worked examples por construção nova."*

```bash
cd app && python3 -c "
import json,glob,re
tot=com=uma=0; tb=0
for p in glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json'):
    for s in json.load(open(p))['theory']:
        cur=None; buf=[]
        for ln in s['markdown'].split('\n'):
            m=re.match(r'^\`\`\`(.*)$',ln)
            if m and cur is None: cur=m.group(1).strip(); buf=[]
            elif m:
                if cur=='python':
                    tot+=1
                    if any(x.lstrip().startswith('#') for x in buf): com+=1
                    if len([x for x in buf if x.strip()])==1: uma+=1
                if cur=='traceback': tb+=1
                cur=None
            elif cur is not None: buf.append(ln)
print('blocos python',tot,'| com comentario',com,'| de uma linha so',uma,'| blocos traceback',tb)
"
# -> blocos python 55 | com comentario 2 | de uma linha so 27 | blocos traceback 3
```

55 blocos de código, **2 com comentário dentro**, **27 (49%) de uma linha só**, e **3 blocos de
`traceback` no módulo inteiro** — todos em `de-texto-para-numero` e `quando-da-errado`. Não há
nenhum exemplo que escreva, rode, erre, leia o erro e conserte.

Duas leituras da mesma medição, e as duas são honestas:

> `[INFERÊNCIA]` **Contra a trilha:** a regra 7 é incondicional e não está cumprida em nenhuma das 20
> aulas.
>
> `[INFERÊNCIA]` **A favor da trilha:** a regra 5 do mesmo §7.1 diz o oposto para material de
> elementos **não** interativos — *"Se são aprendíveis isoladamente (...), worked example completo é
> **defeito**"* — e o M1 é quase inteiramente disso (`print`, `+`, `-`, `*`, `/`). Um snippet de duas
> linhas pode ser exatamente a forma certa aqui.
>
> **A auditoria não consegue decidir entre as duas sem o campo `eiClass`, que está ausente nas 20
> aulas (§2.5).** É esse campo que diz, por aula, qual das duas regras vale. Ele existe no contrato
> e não existe no disco; enquanto isso, a escolha de formato é invisível e inauditável.

A regra 8 é incondicional e **medível**: *"Nunca introduza a construção nova só com o código mais
simples imaginável. Ela deve aparecer em pelo menos **duas formas sintaticamente distintas**."*
Normalizando literais (`"..."` → `S`, números → `N`) e comparando a forma dos blocos por aula:

```bash
cd app && python3 -c "
import json,glob,re
def forma(c):
    c=re.sub(r'\"[^\"]*\"','S',c); c=re.sub(r'\b\d+(\.\d+)?\b','N',c); return re.sub(r'\s+',' ',c).strip()
for p in sorted(glob.glob('resources/tracks/python/modules/a-tela/lessons/*/lesson.json')):
    L=json.load(open(p)); bl=[]
    for s in L['theory']:
        cur=None; buf=[]
        for ln in s['markdown'].split('\n'):
            m=re.match(r'^\`\`\`(.*)$',ln)
            if m and cur is None: cur=m.group(1).strip(); buf=[]
            elif m:
                if cur=='python': bl.append(forma('\n'.join(buf)))
                cur=None
            elif cur is not None: buf.append(ln)
    if len(set(bl))<2: print(L['slug'],'-> forma sintatica UNICA em',len(bl),'blocos')
"
```

```
a-primeira-linha -> forma sintatica UNICA em 3 blocos
somar -> forma sintatica UNICA em 2 blocos
quando-da-errado -> forma sintatica UNICA em 1 blocos
```

**3 aulas em 20 violam a regra 8.** Em `somar`, `+` aparece como `print(2 + 3)` e `print(1200 + 45)`
— literal com literal nas duas; a regra pede *"argumento como literal **e** como expressão
composta"*.

---

## 7. Código morto no caminho da aula

O método: alcançabilidade estática a partir dos pontos de entrada reais do produto
(`src/main.tsx`, `src/App.tsx`, `electron/main/index.ts`, `electron/preload/index.ts`) e das
ferramentas (`tools/**/*.ts`), resolvendo `.`/`@/`/`@shared/` e as extensões `.ts`/`.tsx`/`index`.

```bash
cd app && python3 - <<'PY'
import os,re,glob
def resolve(base,spec):
    if spec.startswith('@/'): c=os.path.join('src',spec[2:])
    elif spec.startswith('@shared/'): c=os.path.join('shared',spec[8:])
    elif spec.startswith('.'): c=os.path.normpath(os.path.join(os.path.dirname(base),spec))
    else: return None
    for s in ('.ts','.tsx','','/index.ts','/index.tsx'):
        if os.path.isfile(c+s): return os.path.abspath(c+s)
IMP=re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")
roots=[os.path.abspath(p) for p in ['src/main.tsx','src/App.tsx','electron/main/index.ts','electron/preload/index.ts']+glob.glob('tools/**/*.ts',recursive=True) if os.path.isfile(p)]
seen=set(); st=list(roots)
while st:
    f=st.pop()
    if f in seen: continue
    seen.add(f)
    st+= [r for r in (resolve(f,m.group(1)) for m in IMP.finditer(open(f,encoding='utf-8',errors='ignore').read())) if r]
todos={os.path.abspath(os.path.join(r,fn)) for d in ('src','electron','shared') for r,_,fs in os.walk(d) for fn in fs if fn.endswith(('.ts','.tsx')) and not fn.endswith('.d.ts')}
orf=sorted(todos-seen); tot=0
for f in orf:
    n=sum(1 for _ in open(f,encoding='utf-8',errors='ignore')); tot+=n
    print(f'{n:5} {os.path.relpath(f)}')
print(f'\n{len(orf)} arquivos orfaos, {tot} linhas')
PY
```

**27 arquivos, 8.198 linhas** não são alcançáveis por nenhum ponto de entrada.

### 7.1 O caro: as cláusulas J que ninguém pode rodar

| Arquivo | Linhas | O que morre junto |
|---|---|---|
| `electron/main/engine/phases/f6Pilot.ts` | 1.339 | o **portão humano do piloto de 3 aulas** (§F6) |
| `electron/main/engine/quality/solvable.ts` | 564 | **J3** — o aluno simulado, *"a peça que ninguém costuma implementar e é a que pega o defeito relatado"* |
| `electron/main/engine/quality/judgeCalibration.ts` | 528 | a taxa de falso-passe contra mutantes — **a métrica que §6.6 diz governar o laço** |
| `electron/main/engine/quality/mutants.ts` | 514 | o gerador de mutantes que alimenta a anterior |
| `electron/main/engine/report/report.ts` | 473 | o `report.json` de §9.2 |
| `electron/main/engine/vocab/generate.ts` + `catalog.ts` | 761 | a geração do vocabulário de átomos (§3.1: *"gerado por script, nunca escrito à mão"*) |
| `electron/main/domain/progressEngine.ts` + `hintEngine.ts` | 556 | escada de dicas e progressão do fluxo antigo |

**Custo de manter: 4.735 linhas.** Custo de não ter: J3, J5 e a calibração do juiz não têm como
rodar, e é por isso que §3.1 marca três cláusulas como "não medido" em vez de "reprovado".

### 7.2 O barato: máquinas puras completas que nenhuma view importa

| Arquivo | Linhas | Teste que o acompanha | Importadores em produção |
|---|---|---|---|
| `src/lib/dockState.ts` | 721 | `tests/dockState.test.ts` (871) | **nenhum** |
| `src/lib/splitRatio.ts` | 487 | `tests/splitRatio.test.ts` (586) | **nenhum** |
| `src/lib/researchProgress.ts` | 403 | — | **nenhum** |
| `src/lib/lessonParse.ts` | 170 | `tests/lessonParse.test.ts` (162) | **nenhum** |
| `src/lib/roadmap.ts`, `levels.ts`, `lessonSelection.ts`, `treeView.ts`, `lessonGenerationGuard.ts` | 533 | vários | **nenhum** |
| `src/components/` órfãos (`CourseSelector`, `EvolutionTree`, `MicButton`, `SpeakButton`) | 603 | — | **nenhum** |

```bash
cd app && grep -rlE "from '[^']*(dockState|splitRatio|lessonParse)'" src electron
# (nenhuma saída: só os próprios testes importam, e eles estão em tests/)
```

**2.984 linhas órfãs em `src/`, mais 1.619 linhas de teste que as cobrem.** O custo não é disco: é
que `dockState` (721) e `splitRatio` (487) são máquinas de estado **completas e testadas** que
descrevem um layout que a `LessonView` de hoje não usa — quem for mexer no layout da aula vai
encontrá-las, achar que são o contrato, e perder tempo. E os 1.619 testes rodam em todo CI dando a
impressão de cobertura que não protege nada em produção.

### 7.3 A correção do enunciado: `lessonOrchestrator.ts` **não** está órfão

O achado que me foi passado dizia "`lessonOrchestrator.ts` (1015 linhas) está órfão no renderer".
Medido, **as duas metades estão erradas**:

```bash
cd app
find . -name lessonOrchestrator.ts -not -path '*/node_modules/*' -exec wc -l {} \;
# -> 1015 ./electron/main/services/lessonOrchestrator.ts
grep -rn "from '.*lessonOrchestrator'" src electron
# -> electron/main/index.ts:44  · electron/main/ipc/study-handlers.ts:67
grep -n "createLessonOrchestrator" electron/main/index.ts
# -> 44 (import) e 153 (chamada)
```

Ele vive no **processo main**, não no renderer, e é **instanciado** em `electron/main/index.ts:153`,
atrás dos handlers `study:*`. Não é código morto: é o fluxo antigo de **geração** de aula, vivo em
paralelo ao fluxo de **trilha**. Isso é uma constatação diferente e provavelmente mais importante —
há dois caminhos de aula no produto ao mesmo tempo — mas está fora do escopo desta auditoria e não
foi investigado.

Os outros três do achado se confirmam com nuance: `lessonParse.ts` (170) é órfão; `lessonProgress.ts`
(162) e `lessonPhaseLabels.ts` (67) **não** são — chegam ao app por `src/lib/sessionState.ts`, que a
`LessonView` importa (`LessonView.tsx:109`).

---

## 8. Placar e prioridades

```
PLACAR DA AUDITORIA DA AULA

  Eixos avaliados ................................ 13
    1  orçamento cumulativo (A1–A6, DEC)          PASSOU
    2  higiene de bloco de código (§5.3)          PASSOU
    3  ancoragem teoria ↔ quiz                    PASSOU
    4  distribuição de construções novas (A14)    PASSOU
    5  teto de construções produtivas (§3.6/A7)   FALHOU   2 de 20 aulas
    6  composição declarada (§3.7/A9/I3)          FALHOU   0 integration, 4 origens duplicadas
    7  campos obrigatórios do schema (§10)        FALHOU   objective e foraDeEscopo em 0 de 20
    8  as quatro provas de execução (§5.4)        FALHOU   0 de 21
    9  fail-closed (§9.3)                         FALHOU   coverage e track:validate saem 0
   10  cláusulas J1-J9 (§9.1)                     PENDENTE 2 provadas · 1 reprovada · 6 nao provadas
   11  quiz como instrumento (colisao de chave)   FALHOU   2 de 20 aulas
   12  contrato do quiz em documento              PENDENTE nao existe
   13  checagem nao executada declarada (§9.2)    FALHOU   7 regras pulam em silencio

  4 passou · 7 falhou · 2 pendente
```

### As prioridades, por impacto sobre o aluno

| # | Defeito | Evidência | Impacto |
|---|---|---|---|
| **1** | O adaptador de linguagem não chega ao executor: os testes Python rodam em `node --test` | `challengeExec.ts:343-354,361-365,229-232`; `track-handlers.ts:465-470`; §3.4 reproduz `passed: false` para a solução de referência | **A trilha inteira é intransponível.** Nenhuma das 20 aulas pode ser concluída; o aluno não sai da aula 1 |
| **2** | `coverage` e `track:validate` reprovam tudo e saem 0 | `cli.ts:624`; `track-cli.ts:548-596`; §3.3 e §3.4 | O defeito nº 1 passou por dois gates que existem para pegá-lo. §9.3 já prescreve: **fail-closed** |
| **3** | Colisão de chave de quiz: o app responde o quiz pelo aluno e o marca correto | `trackLessonState.ts:948-950` + `optionVisualState`; reprodução em §5.1; pin cego em `tests/lessonQuizGate.test.ts:190` | 2 de 44 quizzes nunca são respondidos, um deles na **segunda pergunta da aula 1**; elogio não conquistado |
| **4** | 1 teste por desafio nos 21 | §2.5 | **J5 é insatisfazível por construção**; o checklist de ✓/✗ que [`17`](17-trilha-python.md) §"UX" promete tem uma linha; o aluno não sabe *o que* errou |
| **5** | O tutor recebe a aula inteira e nenhum orçamento | `tutorChat.ts:131-154`; §5.4 e §6.2 | A única superfície que gera texto em runtime é a única fora do gate que a engine existe para impor — a proibição dura é uma frase no prompt (§11 a proíbe) |
| **6** | O aluno que acerta o quiz não vê o `feedback` autorado | `LessonQuiz.tsx:146`; §6.3 | Retém d = +0,66 e entrega d = −0,40, contra os números do próprio [`ux-redesign.md`](ux-redesign.md) §8.2 |
| **7** | O `audit` verde roda **10 das 36** verificações numeradas de §5.1/§5.2 e não declara a lacuna | §2.2.1 — prova por mutação: a aula 1 sem nenhum bloco de código continua saindo 0 | A linha `avisos (bateria A13-A16) .. 0` lê-se como "passou" e significa "não rodou"; §9.2 exige a declaração e ela não existe |
| **7b** | A5, A7, A8, A9, A10, A12, I1–I11 e I13 não existem no código | §2.3 | 2 aulas acima do teto (A7) e 4 origens duplicadas (I3) passam verdes |
| **8** | `objective`, `foraDeEscopo`, `eiClass` ausentes nas 20 aulas | §2.5 | J7 é inauditável; §4.3 não tem artefato; **não dá para decidir se o formato de cada aula está certo** (§6.5) |
| **9** | O desafio de módulo não passa pelo `audit`, e o conceito dele não tem aula | `audit.ts:429`; §3.5 | O único desafio de composição do módulo é o menos verificado, e a aula `integration` que §3.7 exige não existe |
| **10** | 8.198 linhas órfãs, das quais 4.735 são a maquinaria de J3/J5/calibração | §7 | Três cláusulas de §9.1 ficam "não medidas" com o código pronto no repositório |
| **11** | `docs/17` §"Módulo 1" diverge do disco em 5 de 20 aulas e no total (23 vs 28) | §2.6 | O autor da próxima aula lê a tabela errada |
| **12** | O quiz não tem contrato normativo em documento nenhum | §4 | Nada define quantos quizzes por seção, nem proíbe dois na mesma âncora — a origem do defeito nº 3 |

---

## 9. Limitações declaradas

`CONTRIBUTING.md`: *"limitação conhecida é melhor que escondida."* O que **não** foi medido, e por quê:

1. **J3 (solubilidade) não foi medida.** Exige um aluno simulado por LLM e chave de API; além disso
   `solvable.ts` é órfão (§7.1) e nenhum comando o alcança. Sem isso, **não sei se algum desafio
   desta trilha é resolvível por quem só tem o orçamento** — a pergunta que §9.1 chama de a mais
   importante.
2. **A taxa de vazamento do tutor não foi medida** (§6.2). O defeito de desenho é certo; a
   frequência com que o tutor extrapola o orçamento ou antecipa seção não é.
3. **Não rodei o app.** Toda a análise da experiência vem de leitura de código e de execução das
   funções puras reais (`trackLessonState`) contra os `lesson.json` reais. Não houve sessão de
   estudo real, nem captura de tela, nem medição de tempo de um aluno de verdade.
4. **O proxy léxico de ancoragem (§4) é fraco** e errou nas 4 divergências que apontou. Ele serve
   para dirigir a atenção, não para julgar.
5. **A contagem de "worked example" (§6.5) conta blocos, não exemplos.** Um worked example de §7.1
   regra 7 é uma sequência de blocos; contei blocos `python`. A conclusão qualitativa (não há
   incremento com erro real) veio de leitura, não da contagem.
6. **Não avaliei o mérito pedagógico do texto.** Se a analogia é boa, se a onda semântica de §7.1
   regra 6 (nomear → desempacotar → reempacotar → dizer onde quebra) está completa, se o português
   está no nível certo — nada disso é medível por script e nada disso foi julgado aqui.
7. **A alcançabilidade de §7 é estática e ingênua.** Ela segue `import`/`from` literais; um módulo
   carregado por `import()` dinâmico com string montada apareceria como órfão sem ser. Não encontrei
   nenhum caso desses, mas não procurei exaustivamente.
8. **A auditoria cobre o módulo 1.** [`17`](17-trilha-python.md) especifica 26 módulos e 337 aulas;
   só 20 aulas existem no disco. Nada aqui autoriza extrapolar para os outros 25 módulos.
9. **Não medi o que a bateria A13–A16 diria se rodasse.** Ela é JavaScript-only por razão declarada
   (§2.2.1) e não existe versão Python dela. Portanto **não sei** se as 20 aulas passariam em
   ensino-efetivo, micro-avanço, progressividade e primeira-atividade — sei apenas que ninguém
   perguntou.
10. **Não conferi se o `audit` verde é *suficiente*.** Ele prova que nada fora do orçamento aparece.
   Não prova que o que aparece é bem ensinado — essa é justamente a função de J3, J5, J7 e do laço de
   revisão, e todos estão fora do ar.
