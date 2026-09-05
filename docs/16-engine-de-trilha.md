# 16 — A engine de trilhas

> **Escopo.** Este documento é o contrato normativo de **como uma trilha é produzida**. Ele
> complementa [`docs/17-trilha-python.md`](17-trilha-python.md), que é o contrato de **conteúdo** da
> única trilha do produto. ⚑ Este parágrafo apontava para `docs/15-trilha-nodejs.md`, que descreve
> uma trilha **apagada em 2026-09-02** e hoje é **registro histórico**, não contrato vigente.
> A fonte de verdade dos tipos do produto final continua sendo
> `app/electron/main/content/trackTypes.ts`; a engine não inventa formato, ela preenche o que já
> existe e acrescenta campos aditivos (§10).
>
> **Autoridade.** Onde este documento e um prompt divergirem, este documento vence. Onde este
> documento e um gate determinístico divergirem, **o gate vence** — e o documento está errado.
>
> **Linguagens.** A trava descrita aqui é implementável em mais de uma linguagem. O critério e o
> estado de cada uma estão em [research/08-multilingua-trava-deterministica.md](research/08-multilingua-trava-deterministica.md).

---

## 0. Por que este documento existe

A regra "um desafio só pode cobrar o que já foi ensinado" **já existia** neste repositório em duas
formas antes desta engine:

- como documento: `docs/15-trilha-nodejs.md` declara que a aula 1 "presume: nada";
- como código TypeScript: `app/electron/main/services/challengeContextValidator.ts`, cujo cabeçalho
  descreve o defeito exato que hoje está no disco.

E o conteúdo entrou quebrado assim mesmo. A causa não é falta de intenção nem falta de qualidade de
prompt: é que **nada no caminho de autoria era obrigatório e verificável**. O único gate que existia
prova *forma* (schema válido, slug íntegro, solução passa, starter falha) e nunca prova
*conhecimento*.

Este documento existe para transformar aquela frase em uma **diferença de conjuntos sobre AST**, que
roda em milissegundos, não depende de nenhuma chave de API e tem poder de veto.

---

## 1. O defeito, medido (registro histórico — o conteúdo já não existe)

> **Leia isto antes da tabela.** Os números abaixo **não são mais reproduzíveis**: em 2026-09-02,
> depois desta medição, a trilha `nodejs-do-zero` foi **APAGADA** do repositório junto com
> `programacao-do-zero` (ver [`docs/15-trilha-nodejs.md`](15-trilha-nodejs.md), nota do topo). O
> comando `npm run engine -- audit nodejs-do-zero` não tem mais o que carregar, e o pin mecânico que
> vivia em `app/tests/engineAuditPlacar.test.ts` saiu com ela — um pin sem objeto não pina nada. A
> tabela fica como **registro do defeito que motivou esta engine**, no passado.
>
> ⚑ **`app/resources/tracks/` NÃO está mais vazio.** Esta nota dizia que estava, e isso deixou de
> ser verdade quando a trilha `python` entrou (`83a93f4`, onda 9). Medido:
>
> ```bash
> cd app && ls resources/tracks/            # python  (mais o .gitkeep, oculto)
> cd app && find resources/tracks -name lesson.json | wc -l      # 20
> cd app && find resources/tracks -name challenge.json | wc -l   # 21
> ```

Os números foram medidos em 2026-09-02 com `cd app && npm run engine -- audit nodejs-do-zero
--limite 0` (para a tabela) e o mesmo comando com `--json` (para as três linhas derivadas dos
campos `metrics[]`), sobre `app/resources/tracks/nodejs-do-zero`, sem chave de API (orçamento
`inferred` — leitura permissiva: o número real de violações era maior, nunca menor). Eles foram o
**caso de teste de aceitação da engine**: se a engine não reprovasse o que sabidamente estava
quebrado, ela não funcionaria. Ela reprovou — e o conteúdo foi descartado por causa disso, que é o
desfecho que a engine existia para produzir.

| Medição | Valor |
|---|---|
| Aulas | 118 |
| Desafios | 118 |
| Desafios com ao menos uma violação | 112 (95%) |
| Violações (erros) | 717 |
| Avisos (bateria A13–A16: D4 e A14a-zero — não entram no placar de erros) | 92 |
| Delas, lacunas de currículo (construção que **nenhuma** aula ensina) | 249 |
| Aulas que **não introduzem construção nenhuma** | 12 |
| Construções novas na aula 1 (`o-que-e-programacao`) | 18 — o maior do histograma (mediana: 3) |
| Aulas acima do teto de 4 construções novas (§3.6/A12) | 45 |
| Blocos de código teórico sem tag de linguagem | 68 |
| Blocos marcados `js` que não parseiam | 4 |
| Aulas que declaram exatamente 1 `concept` | 100 de 118 |

As linhas com "mediana", "45" (acima do teto) e "100 de 118" eram derivadas do mesmo relatório em
`--json` (`metrics[].novas` e `metrics[].conceitosDeclarados`); as demais saíam do placar humano.

**Rastreabilidade do placar: 285 → 841 → 717.** Este documento anunciou por muito tempo
**285 violações / 96 desafios / 102 lacunas**. Aquele número não era falso — era o placar da
bateria ANTERIOR (A1/A2/A3/A6/DEC/I16), antes de A13–A16 existirem. A ligação entre os dois é
mecânica e reproduzível: no `--json` de hoje, as violações das regras antigas (as que saem sem o
campo `severidade`) ainda somam **exatamente 285**:

```bash
# O comando que produzia esta conferência (não roda mais: a trilha foi apagada).
cd app
# redirecione para ARQUIVO: o audit sai com exit 1 quando reprova, e um pipe direto
# pode truncar o JSON antes do fim.
npm run engine --silent -- audit nodejs-do-zero --limite 0 --json > /tmp/audit.json
python3 -c "import json; v=json.load(open('/tmp/audit.json'))['violations']; \
  print(sum(1 for x in v if 'severidade' not in x), 'de', len(v))"   # -> 285 de 809
```

Sobre qualquer trilha nova a mesma conferência vale trocando o slug — e, para uma trilha ainda não
publicada, apontando `--dir` para o diretório dela.

A bateria A13–A16 levou o placar a **841**, e o fix do A13c (a teoria da PRÓPRIA aula conta como
demonstração, §3.2) removeu 124 falsos positivos, fechando em **717** (§5.1, "Bump do pin"). O
que mudou foi a régua, não a trilha.

Três leituras que decidiram o desenho:

1. **A trilha foi escrita de trás para frente.** Primeiro o desafio, depois uma seção "Exemplo
   completo" contendo a solução literal. O encaixe nunca foi verificado.
2. **O problema não é falta de aulas.** São 118 aulas e a mediana de construções novas por aula é 3
   — folgado. O defeito é **distribuição**: penhasco na aula 1 (18 construções novas, o maior valor
   do histograma e 6× a mediana), 45 aulas acima do teto de 4 construções novas por aula (§3.6/A12)
   e 12 aulas que não introduzem nada. Multiplicar aulas sem teto **por aula** reproduz o mesmo
   penhasco.
3. **A causa-raiz está no protocolo, não no modelo.**
   `skills/study-method/references/challenge-protocol.md` §1 item 4 exige incondicionalmente "pelo
   menos 1 error (entrada inválida que deve falhar de forma específica)", e
   `app/electron/main/services/lessonAuthor.ts` valida essa exigência
   (`required = ['example','boundary','error']`). Para uma aula 1 de iniciante absoluto em
   JavaScript isso tem uma única implementação possível: `typeof` + `throw new Error`. **O modelo
   obedeceu a regra.** A correção é de uma linha e vale mais que qualquer revisor: os cenários
   obrigatórios passam a ser **derivados do orçamento** (§5.1, A11).

---

## 2. Os cinco princípios normativos

**P1 — Nada que possa ser decidido por código é decidido por LLM.**
Um juiz LLM avaliando corretude de código sem executar o teste concorda com o resultado real a
Cohen's κ = 0,21 no melhor modelo (maioria abaixo de 0,10) e aceita 50% das implementações erradas.
Em raciocínio sobre pré-requisito de currículo — exatamente esta tarefa — o melhor modelo
proprietário faz 57% de *exact match*. Portanto "o revisor aprovou" não é critério de parada. O
oráculo é `AST ⊆ orçamento` ∧ `node --test` verde ∧ pins verdes.

**P2 — Onde investir está medido.** Melhorar prompt e papel rendeu +9,4%; mudar a *topologia* para
incluir verificação multinível rendeu +15,6% absolutos. Prompt bonito vale metade de um gate
verificável.

**P3 — O FREEZE do orçamento é o que legaliza a paralelização.** Escrever N aulas cujo vocabulário
depende das anteriores é o caso em que a concorrência é proibida. Congelar o orçamento **antes** do
fan-out converte "saída do agente anterior" em "arquivo versionado", e só então a autoria vira
map-reduce legítimo. Depois do freeze, cada autor recebe um **snapshot imutável carimbado com hash**,
nunca o estado global ao vivo.

**P4 — O revisor não escreve, não pontua e não decide sozinho.** A proibição é **estrutural**: o
schema de saída do revisor não tem campo de código. Se o campo existir, ele usa — e a direção do erro
é assimétrica (o modelo tem mais chance de estragar uma resposta certa do que de consertar uma
errada).

**P5 — O laço tem teto duro.** Auto-correção sem sinal externo degrada monotonicamente
(GPT-4/GSM8K 95,5 → 91,5 → 89,0). Nenhum trabalho primário usa laço aberto: Self-Refine 4, CRITIC
3–4, Constitutional AI 4, Reflexion 1–3. **`while (revisor.temApontamento())` é anti-padrão proibido
no código do orquestrador.**

---

## 3. Modelo de dados

### 3.1 O átomo tem seis eixos

O ESTree modela metade da didática como **atributo, não como tipo de nó**: `let`/`const`/`var` são o
mesmo `VariableDeclaration`; `===`, `!==` e `+` são o mesmo `BinaryExpression`; `typeof` é
`UnaryExpression[operator='typeof']`. Um orçamento só de `nodeTypes` deixa passar 28 das 92
construções medidas na trilha atual.

A chave de átomo é uma string estável, e o conjunto delas é o vocabulário fechado da trilha:

| Eixo | Forma da chave | Exemplo |
|---|---|---|
| nós | `node:<NodeType>` | `node:FunctionDeclaration` |
| declarações | `decl:<kind>` | `decl:let`, `decl:const`, `decl:var` |
| operadores | `op:<familia>:<op>` | `op:binary:!==`, `op:unary:typeof`, `op:logical:??`, `op:update:++` |
| globais | `global:<nome>` | `global:Error`, `global:console` |
| API | `api:<caminho>` | `api:Array.prototype.push`, `api:node:test` |
| forma de uso | `form:<seletor da DSL própria>` | `form:IfStatement[alternate=null]` |
| termos da prosa | `term:<termo pt-BR>` | `term:atribuição` |

O eixo `form:` existe porque **o orçamento não é uma lista de construções permitidas, é uma lista de
pares (construção, restrição de forma de uso)**. Liberar `FunctionDeclaration` não libera função como
valor de variável; liberar `if` não libera `if` sem `else`.

**O seletor é uma DSL mínima própria, não `esquery`** — implementada em
`app/electron/main/engine/form/selector.ts` (sintaxe `Passo('>' Passo)*` com
`[atributo=valor]`/`[atributo!=valor]`, onde `valor` é `null` ou um tipo de nó; o atributo só casa
se **existe** no nó). É compatível com o exemplo acima (`form:IfStatement[alternate=null]`) e não
acrescenta dependência nenhuma — `esquery` não existe em `app/node_modules` (§5.3).

`vocab/atoms.json` é **gerado por script, nunca escrito à mão** — de `eslint-visitor-keys` (menos JSX
e Experimental), das famílias de operador, de `globals.nodeBuiltin` e do catálogo de API built-in.
Escrever à mão produz falso-negativo silencioso: basta esquecer um nó estrutural inevitável e a
allowlist vira ruído.

### 3.2 Duas faixas: receptivo e produtivo

| Faixa | Significado | Onde se aplica |
|---|---|---|
| `receptive` | o aluno pode **ler** sem precisar escrever | prosa, `theory[].code`, `starterCode`, `testsCode` |
| `productive` | pode ser **exigido** dele | `solutionCode` e o que os testes cobram |

Invariante: `productive ⊆ receptive`.

Sem essa distinção o gate tem só duas saídas ruins: proibir o próprio harness `node:test` (inviável)
ou liberar geral (inútil). A necessidade está medida (reproduzível no `--json` do audit, campo
`regra`): 167 das 717 violações são **A3** — `testsCode` cobrando construções fora do orçamento de
**entrada** (o aluno lê o teste antes de aprender a aula). A política `receptive-seed` (§3.2) já
absorve as formas mais comuns do runner (`import`/`export`, arrow de expressão, `assert.equal`/
`assert.throws`/`assert.ok`, `test`); restam em A3 12 ocorrências de métodos de asserção fora da
semente (`assert.notEqual`, `assert.rejects`, `assert.match`) e mais 155 de **conteúdo real** dos
testes exigindo construções que a trilha ainda não ensinou. Só as duas faixas permitem tratar assim:
`testsCode` entra no orçamento receptivo da entrada (§3.3), e apenas o que o aluno é obrigado a
escrever cai na faixa produtiva.

**Decisão de produto (reversível por flag `--harness-policy`).** O default é `receptive-seed`: o
harness entra no orçamento **receptivo** da aula 1, e a linha `export function …` do `starterCode`
é uma `frozenRegion` que o aluno não edita. As alternativas consideradas e rejeitadas: uma aula-zero
que ensine módulos antes de variáveis (absurdo pedagógico) e um wrapper gerado pelo runner (correto,
mas exige mexer em `challengeExec.ts` — fica para depois).

### 3.3 A assimetria das quatro superfícies

Esta é a regra mais fácil de errar, e aplicar o mesmo orçamento às quatro deixa passar exatamente o
desafio `cumprimentar`:

```
atomos(testsCode)                          ⊆ budget_ENTRADA(N).receptive
atomos(starterCode | theory | statement)   ⊆ budget_SAIDA(N).receptive
atomos(solutionCode)                       ⊆ budget_SAIDA(N).productive
```

O arquivo de teste usa o orçamento de **entrada** porque **o aluno lê o teste antes de aprender a
aula**. É a mesma regra que a Exercism escreve três vezes com escopos deliberadamente diferentes:
stub e exemplar podem usar recursos introduzidos pelo exercício ou por seus pré-requisitos; os testes
só pelos **pré-requisitos**.

### 3.4 Conceito, aula e as duas arestas do grafo

Um **conceito** é o nó do grafo; uma **aula** é a unidade de entrega. Não são a mesma coisa e não
podem compartilhar campo.

O grafo tem **duas arestas semanticamente distintas**, e conflatá-las é a correção nº 1 em relação ao
estado atual do repositório:

| Aresta | Significado | Alimenta |
|---|---|---|
| `desbloqueado_por[]` | dura: não dá para aprender B sem A | ordenação topológica, detecção de salto |
| `usa[]` | linha da Q-matrix: B exercita A | orçamento cumulativo |

A pergunta canônica para julgar uma aresta dura é: *"se o aluno acabou de errar B, é praticamente
certo que também erraria A, excluindo erro de digitação e acerto por sorte?"*, com **"não sei"
permitido**. Empate resulta em **nenhuma aresta** — precisão vale mais que cobertura, porque uma
aresta errada corrompe o orçamento de todos os descendentes, em silêncio.

**Type check duro:** todo item de `desbloqueado_por` e de `usa` é um `concept.id`, jamais um
`lesson.slug`. Hoje 105 de 134 referências de `prerequisites` violam isso, o que torna o grafo
inválido por construção.

A poda por fecho transitivo é **visão de renderização, nunca armazenamento**: no track JavaScript da
Exercism, 44 de 90 arestas declaradas são transitivamente redundantes e cada uma tem justificativa
própria.

### 3.5 O orçamento cumulativo

Derivação determinística, **zero LLM**:

```
budget_entrada(N) = entryConstructs ∪ fecho-para-baixo( desbloqueado_por(N) )
budget_saida(N)   = budget_entrada(N) ∪ atomos( introduces(N) )
```

Materializado como a **matriz construção × aula** com três estados: `—` (não disponível), `x`
(disponível) e `new` (introduzida aqui). O terceiro estado não é enfeite: `if` contra `else if`
contra ternário, ou `FunctionDeclaration` contra `ArrowFunctionExpression`, são a mesma ideia em
**forma nova** — e mudar a forma de algo já ensinado é um evento de currículo que exige aula própria.
No corpus do Hedy, 82% dos erros de "código no nível errado" são o aluno usando algo antigo cuja
forma mudou.

`budget.generated.json` é **sempre materializado em disco**, nunca só calculado em memória: é o que
permite ao revisor lê-lo sem executar nada e ao git mostrar o diff.

### 3.6 O tamanho de uma aula

A literatura não entrega um número pronto. Entrega quatro réguas que convergem, e a engine adota as
quatro como **parâmetros configuráveis**, não como achados:

| Régua | Valor | Confiança |
|---|---|---|
| Construções produtivas novas por aula | ≤ 2, nunca 3 | alta — é contagem direta do Exercism JS: 21 exercícios ensinam 1, 8 ensinam 2, zero ensinam 3+ |
| Elementos novos que **interagem** entre si | ≤ 4; ≤ 2 enquanto o orçamento está quase vazio | média — o 3–5 de Cowan é sobre *chunks* em memória de trabalho; converter em "por aula" é derivação |
| Elementos **não** interativos | até ~7, sem o teto acima | alta — processamento sucessivo não impõe carga simultânea |
| Tempo de resolução do desafio | ≤ 120 s para quem fez tudo que vem antes | alta para o critério, média para transferir ao nosso público |

**O teste de atomicidade — os quatro, todos obrigatórios:**

1. **Demonstrável** — cabe num worked example completo sem estourar o teto de elementos.
2. **Exercitável** — cabe num *completion problem* com **uma** lacuna cujo span contém o átomo-alvo.
3. **Orçamentável** — o `element_count` somado ao que já entra na aula cabe no teto.
4. **Cronometrável** — o desafio correspondente cabe em 120 s para quem tem o orçamento.

Aplicado: **"variáveis" falha nos quatro** e não é átomo. Vira `let` + atribuição, reatribuição,
`const`, `const` + erro de reatribuição, escopo de bloco, nomenclatura. **"função" falha** e vira a
sequência isolada (declaração; chamada; parâmetro; argumento; corpo; `return`) **mais uma** aula de
integração para parâmetro *interagindo com* `return`.

**Número de aulas é saída, não entrada.** Não há teto global. A engine projeta a contagem depois do
grafo (F3) e abre portão humano antes de escrever prosa. Ordem de grandeza esperada para o módulo 1
atual: 40 a 110 aulas atômicas.

### 3.7 Composição não é de graça

Saber `if` e saber `função` **não** implica saber "`if` dentro de função com `return` em cada ramo".
Alunos vão significativamente pior em problemas de dois passos do que em dois problemas de um passo.
É o erro mais invisível de trilha gerada, porque **passa em toda validação de orçamento** — todas as
construções estão lá — e mesmo assim quebra o aluno.

Toda composição é um **nó próprio** do grafo, com aula própria, marcada `role: "integration"`.

**O vocabulário de `role` é FECHADO em dois valores**, e o dono dele é o schema da engine:

```bash
cd app && grep -n "role: z.enum" electron/main/engine/schemas/artifacts.ts
# 200:      role: z.enum(['regular', 'integration']),
# 406:  role: z.enum(['regular', 'integration']),
```

⚑ **Divergência normativa aberta, registrada aqui e em `docs/17-trilha-python.md`.** A trilha
`python` no disco usa um terceiro valor — `role: "consolidation"` — em **5 das 20 aulas** do módulo
1, e [`docs/17-trilha-python.md`](17-trilha-python.md) o descreve como "aula de consolidação
declarada". Ele **não pertence a este enum**.
Medido:

```bash
cd app && python3 -c "
import json,glob,collections
c=collections.Counter(json.load(open(f))['role'] for f in glob.glob('resources/tracks/python/modules/*/lessons/*/lesson.json'))
print(dict(c))"
# -> {'consolidation': 5, 'regular': 15}
```

Por que ninguém percebeu: o loader do produto (`app/electron/main/content/trackTypes.ts`) **não
conhece o campo `role`** — ele não valida nem lê — e o schema da engine só julga o **draft** que a
F7/F12 produz. Uma trilha escrita à mão passa; a mesma trilha regerada pela engine seria rejeitada.
**A decisão é do dono e não é deste documento**: ou `consolidation` entra no enum da engine, ou a
trilha muda os 5 valores. Enquanto não se decide, o defeito fica declarado nos dois documentos em
vez de esperar alguém tropeçar nele.

---

## 4. As fases

Notação: **⇉** fan-out paralelo · **▮** escritor único serial · **▬▬** barreira com gate
determinístico.

| Fase | O que faz | Paralelismo | Barreira |
|---|---|---|---|
| **F0** | brief, máquina nocional, vocabulário gerado, política de harness | ▮ | G-SCHEMA |
| **F1** | pesquisa profunda do assunto | ⇉ largo, 1 arquivo por agente | G-COVER-PESQ |
| **F2** | decomposição atômica (um decompositor por família de assunto) | ⇉ → ▮ merge | G-ATOM |
| **F3** | grafo de pré-requisitos; escrita serial, julgamento de aresta paralelo | ▮ + ⇉ | G-DAG · G-TYPE · G-COVER |
| **F4** | orçamento cumulativo (derivação, zero LLM) | ▮ | G-MONO |
| **F5** | **FREEZE** — hash do orçamento e do grafo; snapshots imutáveis por aula | ▮ | ponto de não retorno |
| **F6** | piloto de 3 aulas (a raiz, a mais armadilhada, uma tardia) | ⇉ 3 | **portão humano** |
| **F7** | autoria de teoria — 1 agente = 1 aula = 1 arquivo | ⇉ ondas de ≤15 | por onda |
| **F8** | autoria de desafios e testes | ⇉ ondas de ≤15 | por onda |
| **F9** | verificação determinística (zero LLM) | ⇉ MAP PARALELO por ref com SEM_EXEC, ordem estável | G-BUDGET · G-TEST |
| **F10** | ~~fase própria~~ — **não é um módulo**: a revisão (um revisor por instrumento, read-only) roda **dentro do laço F11** (§6). **Fiado (onda 5):** com `deps.revisao` presente, o laço REAL `rodarLacoDeRevisao` roda sobre os drafts recém-autorados (bridge `criarRevisaoDaFiacao`); ausente → limitação declarada | — (integrada ao F11) | §6 |
| **F11** | laço revisor → provador → planejador → corretor; re-verificação = MESMO map paralelo da F9 | ▮ / ⇉ (SEM_EXEC) | §6 |
| **F12** | materialização e integração | ▮ integrador único | G-FINAL |

### 4.1 Regras de paralelismo

> **Se dois agentes podem tocar a mesma chave, um deles não roda em paralelo.**

- **Toda chave escrita por mais de um agente precisa de reducer declarado.** Sem reducer, doze
  autores gravando `trilha.aulas` deixam **uma aula viva, sem erro e sem log**.
- **Posse exclusiva de arquivo é validada pelo escalonador**, não confiada ao prompt: se duas tarefas
  da mesma onda declaram o mesmo caminho em `outputs`, a onda é rejeitada antes de rodar.
- **Ondas de ≤15** (limite duro 20). Três colaboradores focados batem cinco espalhados.
- **Não paralelize as seções da mesma aula.** Etapas posteriores dependem do resultado das
  anteriores; gerar em paralelo tem ganho de velocidade e perda de coerência.
- **Não paralelize o design do sílabo.** O grafo é escrito por um agente só; o que paraleliza é o
  *julgamento de arestas candidatas* e a *validação*.
- **Handoff por referência, nunca por conteúdo.** Nenhum agente devolve o corpo da aula: devolve
  `{id, path, status, hash, constructs_used, violations, tokens}`, com teto de 2.000 tokens. Retorno
  acima do teto é **rejeitado, não truncado**.
- **Dois semáforos independentes**, porque os gargalos são de natureza diferente: `SEM_LLM` (rede,
  default 8, subir medindo 429) e `SEM_EXEC` (`spawn node --test`, default `availableParallelism()-1`).
  Um limitador global serializaria a verificação por causa da rede.
- **A verificação F9/F11 é MAP PARALELO por ref com `SEM_EXEC` (onda 5).** Cada ref (aula) é
  verificado independentemente — `prover` (quatro provas) + orçamento por AST — num
  `Promise.all` limitado pelo semáforo (`verificarRefsEmParalelo` em `fiacao/geraTrilha.ts`). O
  relatório sai na **ordem estável dos refs** (índice após o `Promise.all`, nunca a ordem de
  conclusão) — resultado byte-idêntico ao serial. A verificação é **read-only sobre os drafts**
  (o laço de revisão escreve nos próprios artefatos em memória; os drafts em disco só são lidos) —
  sem corrida de escrita.
- **O laço F10/F11 é fiado quando `deps.revisao` está presente (onda 5).** O bridge
  `criarRevisaoDaFiacao` monta o `ContextoDoLaco` com as deps padrão da fiação — artefatos = os
  drafts recém-autorados da onda, snapshot de orçamento por ref a partir do F2 + harness (a MESMA
  base da F8/F9), verificadores JSON-aware dos drafts, provas via o `prover` da fiação — e roda o
  laço REAL `rodarLacoDeRevisao`. SEM o dep, a limitação é **declarada na saída** (§9.2 — nunca
  omitida) e a máquina segue: o fluxo atual permanece byte-idêntico (regressão protegida por
  teste).
- **Coverage/revise (`quality/minimal.ts`, onda 5):** `sintetizarEmLote(prover, ctxs, {concorrencia})`
  é o map-reduce por desafio com semáforo (mesmo padrão do coverage do CLI): resultados na MESMA
  ordem dos `ctxs`, concorrência limitada (default `availableParallelism()-1`) e **fail-closed por
  item** — uma falha de um desafio vira o veredito daquele item, o lote nunca derruba.
- **G-FINAL (F12, onda 5):** as quatro provas de TODO desafio materializado rodam em map paralelo
  com `SEM_EXEC` (as quatro provas de um desafio já rodam em `Promise.all` dentro de
  `verifyChallengeProofs`); o relatório de falhas sai na ordem estável dos desafios.

### 4.2 O que a fase F1 tem de produzir além de prosa

- inventário de **construções e APIs candidatas**;
- inventário de **concepções alternativas** (misconceptions) com âncora na especificação.

**Risco assumido e não mitigável a jusante:** pesquisa errada produz trilha errada, e nenhuma fase
posterior detecta. É o único ponto onde a revisão humana é insubstituível — daí o portão de F6.

### 4.3 A ordem interna de uma aula

Objetivo → esqueleto de teoria (F7) → **desafio e testes** (F8) → fechamento da teoria sabendo o que
precisa habilitar. Itens de avaliação vêm **antes** dos materiais; é o ponto em que Dick & Carey,
Biggs e *backward design* convergem.

O autor de desafio recebe, além do orçamento, um **resumo gerado da teoria efetivamente escrita**: a
lista de construções diz o que é *permitido*, o resumo diz *como aquilo foi apresentado*.

---

## 5. Os gates determinísticos

### 5.1 Bateria de orçamento

| # | Verificação | Severidade |
|---|---|---|
| A1 | `atomos(starterCode) ⊆ budget_saida.receptive`, exceto `frozenRegions` declaradas | erro |
| A2 | `atomos(solutionCode) ⊆ budget_saida.productive` | erro |
| A3 | `atomos(testsCode) ⊆ budget_ENTRADA.receptive` | erro |
| A4 | `atomos(theory, blocos cercados) ⊆ budget_saida.receptive` | erro |
| A5 | todo átomo novo presente está **declarado** em `introduces` — exibir não é ensinar | erro |
| A6 | `atomos(solutionCode) ∩ introduces.productive ≠ ∅` — a **direção puxada** | erro |
| A7 | `introduces.productive` tem no máximo 2 itens, e `productive ⊆ receptive` | erro |
| A8 | `atomos(solutionCode)` tem no máximo 25 itens | aviso |
| A9 | profundidade de composição maior que 1 exige nó `integrative` declarado | erro |
| A10 | cada construção introduzida reaparece em ≥3 artefatos posteriores | aviso |
| A11 | cenário de tipo `error` só é exigível se `op:throw` e `api:assert.throws` estiverem no orçamento | erro |
| A12 | `1 ≤ elementos_novos ≤ 4`, e `≤ 2` enquanto o orçamento ainda é pequeno | erro |
| A13 | **ENSINO-EFETIVO** — o que a atividade usa/expõe (escrito, lido no starter, lido no teste) precisa estar **demonstrado** em bloco js (teoria desta aula ou anterior) ∪ A13d (declared): declarar `introduces` não é demonstrar | erro (+ aviso D4) |
| A14 | **MICRO-AVANÇO** — A14a: ≤4 construções **verdadeiramente novas** por aula (0 → aviso; declared: ≤2 produtivas); A14b: ≤1 construção nova por linha do solutionCode (a lacuna única) | erro (+ aviso A14a-0) |
| A15 | **PROGRESSIVIDADE** — A15a (2+ desafios): o degrau reusa algo do anterior e adiciona ≤1 não demonstrado; A15b: a aula N reutiliza ≥1 átomo demonstrado antes | erro |
| A16 | **PRIMEIRA-ATIVIDADE** — o 1º desafio é resolvível com a 1ª seção da teoria + material anterior (DemoSec1 ∪ Cum ∪ AX ∪ H13) | erro (+ aviso D4) |

**A6 é o gate positivo e não pode ser esquecido.** Sem ele o checker aceita trilhas que só repetem o
que o aluno já sabia — e a aula `funcoes` da trilha apagada falhava exatamente aí.

**A11 mata a causa-raiz.** É a substituição da cobertura fixa `example + boundary + error` por
cenários **derivados do orçamento**.

**A13–A16 (rodada 12) fecham os quatro furos do orçamento** que o feedback do usuário apontou:
usado-sem-demonstração (A13), avanço micro (A14), progressividade (A15) e primeira interação (A16).
Especificação formal, H13/AVISO13/S13 e mensagens pt-BR em
`app/content-src/analise-verificadores.md` §3–§6; implementação pura em
`app/electron/main/engine/quality/progressao.ts` (mesclada no `auditTrack` — o placar da trilha de
então era 717 violações / 112 desafios / 249 lacunas / 92 avisos, modo inferred).

**O pin do placar (rodada 12) — e por que ele não existe mais.** O pin mecânico viveu em
`app/tests/engineAuditPlacar.test.ts` até 2026-09-02. Com a bateria A13–A16 ativa no audit, ele
passou de **841 violações / 112 desafios / 249 lacunas / 96 avisos** para
**717 violações / 112 desafios / 249 lacunas / 92 avisos** (modo inferred): o fix do A13c
(mesma-aula) removeu **124 falsos positivos** (841 → 717) e 4 avisos D4 a menos (96 → 92); desafios
com violação (112) e lacunas (249) permaneceram os mesmos. Em 2026-09-02 a trilha medida foi
apagada e o arquivo de pin saiu com ela — **não há trilha publicada, logo não há placar a pinar**.

**O protocolo INT-02/P-30 continua valendo** e é o que a próxima trilha herda: o placar do audit
nunca piora sem declaração; toda mudança de bateria de verificadores re-bumpa e re-verifica; cada
bump acompanha o commit que o causou, com a justificativa no próprio teste de pin. Quem publicar a
próxima trilha **recria o teste de pin** — o protocolo descreve como, e o relatório
(`engine/report/report.ts`) já o cita na justificativa sem redigitar número nenhum.

### 5.2 Invariantes de estrutura

Rodam **antes de existir uma linha de prosa**:

| # | Invariante |
|---|---|
| I1 | o grafo é um DAG e todo `desbloqueado_por` referenciado existe |
| I2 | `introduces.productive` tem no máximo 2 itens em toda aula |
| I3 | nenhuma construção é introduzida por duas aulas (unicidade de origem) |
| I4 | toda construção usada tem aula de origem, e ela vem antes na ordem topológica |
| I5 | construção introduzida aparece em ≥1 exemplo da teoria da própria aula |
| I6 | construção introduzida é exigida no desafio da própria aula |
| I7 | construção introduzida reaparece em ≥3 artefatos posteriores |
| I8 | não há 3 aulas consecutivas da mesma família sintática (interleaving) |
| I9 | a primeira aparição é a **forma mais simples** (`FunctionDeclaration` antes de arrow; `if/else` antes de ternário) |
| I10 | toda aula tem ≥1 desafio resolvível apenas com o orçamento vigente |
| I11 | mudar a **forma** de construção já ensinada exige aula dedicada |
| I12 | slug de aula é **globalmente único** na trilha |
| I13 | `slug === basename(dir)` nos quatro níveis |
| I14 | `order` de módulo é inteiro e único |
| I15 | `theory[].id` é único dentro da aula |
| I16 | `challenge.concept` pertence a `lesson.concepts` |
| I17 | `files[].path` nunca é `test.mjs` nem `package.json` |

I12 a I17 são buracos **do loader atual**, todos com consequência silenciosa. Slug de aula duplicado
entre módulos carrega sem erro e **compartilha o registro de conclusão do aluno**; `theory[].id`
duplicado faz a segunda seção nunca ser exibida e a aula "terminar" cedo; um `files[].path` chamado
`test.mjs` é sobrescrito pelo `testsCode` sem aviso.

A bateria A13–A16 (rodada 12) roda no MESMO gate (o audit passou a exigir **demonstração**, não só
orçamento):

- **A13 (ensino-efetivo)** — `usado ⊆ demonstrado ∪ boilerplate-estreito (H13)`: a semente receptiva
  do harness perdoa no orçamento, não na demonstração — o 1º desafio da trilha real viola exatamente
  com `node:CallExpression` (o "pecado nº 1" do feedback).
- **A13d (declarar não é demonstrar)** — `introduces` declarado sem bloco js que o mostre é erro
  (só modo `declared` — a rede de arrasto da geração).
- **A14a (micro-avanço)** — teto de 4 construções verdadeiramente novas por aula (0 → aviso);
  `introduces.productive > 2` → erro no modo declared.
- **A14b (combo por linha)** — a lacuna única do completion problem contém no máximo 1 construção
  nova; `throw new Error(…)` numa linha = 3, `let x = 1;` = 1 (a régua dos exemplos medidos).
- **A15a (degrau intra-aula)** — com 2+ desafios, o degrau reusa algo do anterior e adiciona ≤1
  átomo não demonstrado; **A15b (arco inter-aula)** — a aula N reutiliza ≥1 átomo demonstrado antes
  (recuperação espaçada, I7 em versão de conteúdo).
- **A16 (primeira-atividade)** — o 1º desafio é resolvível com a 1ª seção da teoria (mesmo sem
  código nela) + cumulativo + boilerplate; "demonstrado só na 3ª seção" viola.

### 5.3 O extrator

Implementado em `app/electron/main/engine/extract.ts`, sobre o **compilador do TypeScript**.

A escolha é medida, não estética: `acorn`, `eslint-visitor-keys`, `esquery`, `eslint-scope` e
`globals` **não existem** em `app/node_modules`, nem transitivamente; `typescript@5.8.3` existe como
dependência direta. Custa zero dependência nova. E o AST do TypeScript modela como **nó** o que o
ESTree esconde em atributo — `typeof` é `TypeOfExpression`, `!==` é `ExclamationEqualsEqualsToken` —
o que aproxima o extrator do vocabulário de seis eixos em vez de afastá-lo. A versão fica presa em
5.8.3, longe da armadilha do `typescript@7`, que moveu a API de AST de lugar (ver
[research/08-multilingua-trava-deterministica.md](research/08-multilingua-trava-deterministica.md)).

Configuração fixa num **único módulo** — se dois estágios parseiam com opções diferentes, o gate vira
loteria:

```ts
ts.createSourceFile(nome, codigo, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.JS)
```

**Parseie tudo; reprove no orçamento pós-parse.** Restringir no parser produz `unexpected token`, que
é uma mensagem inútil para quem está aprendendo. O precedente é unânime entre as linguagens
didáticas que resolveram este problema.

Os passes:

1. **nós** — `ts.forEachChild`, emitindo `node:<Nome canônico>`. **Pontuação fica de fora**: o
   operador já é reportado pelo eixo `op:`, e emitir também `node:PlusToken` obrigaria todo orçamento
   a listar as duas formas, dobrando a chance de esquecer uma.
2. **declarações** — as flags de `VariableDeclarationList` separam `let`, `const` e `var`.
3. **operadores** — por família: `assign`, `logical`, `binary`, `unary`, `update`.
4. **globais** — identificador usado e não declarado no arquivo, conferido contra o conjunto lido de
   `globalThis` em tempo de execução. Lista de globais **nunca é digitada à mão**: esquecer um nome
   faz o gate deixar passar, e inventar um faz o gate reprovar código correto.
5. **membros e módulos** — cadeia de identificadores cuja raiz é global ou **importada** vira caminho
   completo (`assert.throws`); raiz que é variável local vira `.prop`, porque sem tipo não se afirma
   o receptor.

**Armadilha do enum, e ela envenenaria tudo em silêncio.** `ts.SyntaxKind` tem marcadores de faixa
(`FirstLiteralToken`, `FirstStatement`, …) que compartilham valor numérico com kinds reais, e a busca
reversa devolve o **último** nome atribuído: `ts.SyntaxKind[ts.SyntaxKind.NumericLiteral]` retorna
`"FirstLiteralToken"`. Um orçamento escrito contra `node:NumericLiteral` nunca casaria. O extrator
constrói uma tabela canônica e o teste `engineBudgetGate.test.ts` fixa esse comportamento.

**Limite declarado:** a resolução de escopo é **plana** — o extrator junta os nomes declarados no
arquivo e trata como global o que sobrou. Para trecho de aula isso acerta; um shadowing deliberado
de nome global (`const console = …`) passaria. Está escrito aqui porque gate com limite escondido é
pior que gate nenhum.

**O que o aluno escreve é o DIFF.** A contenção produtiva é medida sobre
`atomos(solutionCode) \ atomos(starterCode)`: a assinatura já vem pronta no starter e cobrar do aluno
o `export` que ele nunca digita seria violação inventada. Nada se perde — o que o starter mostra
continua sendo checado pela regra A1, contra o orçamento receptivo.

**A teoria também é parseada**, e a higiene de formato é obrigatória: **bloco cercado com tag é
código; crase inline é prosa**; bloco com tag `js` que não parseia é erro de build. Sem essa regra o
extrator envenena o próprio orçamento — hoje 26% dos blocos cercados não têm tag de linguagem, e
spans de crase como `total: 3` ou `arquivo:linha:coluna` parseiam como `LabeledStatement`.

**Proibições globais em qualquer nível** (sem elas nenhuma promessa estática se sustenta): `eval`,
`new Function`, `with`, `arguments`, `WithStatement`, `DebuggerStatement`, `SequenceExpression`,
`LabeledStatement`, alias de função (`const f = console.log`) e
`MemberExpression[computed=true][property.type!='Literal']`. A proibição admite exceção declarada por
aula: medido, há apenas 29 acessos computados não-literais em 354 arquivos, concentrados em aulas que
legitimamente ensinam chave dinâmica.

**Uma única função de contagem de testes, por AST.** Hoje existem três implementações com duas
semânticas — um `// test(` comentado faz o validador semântico entrar em retry e devolver erro de
JSON inválido para sempre.

### 5.4 As provas de execução

Um desafio só é válido se as quatro passarem (mais a quinta, quando a linguagem a exige — ver o fim
desta seção):

1. a solução de referência **passa** em todos os testes;
2. o `starterCode` **falha**;
3. o número de testes executados **bate** com `expectedTestCount`;
4. um stub vazio **falha** (protege contra teste tautológico).

Armadilhas já medidas neste repositório, que o executor tem de tratar: exit code sozinho não
distingue "passou" de "nada rodou"; `node --test` com glob vazio sai 0; `NODE_TEST_CONTEXT` herdado
faz o processo filho pular tudo e sair 0; códigos ANSI no relatório quebram o regex de contagem;
timeout devolve 137, que também é OOM.

**A QUINTA PROVA, opcional por linguagem: `typesCheck`.** Uma trilha de linguagem TIPADA precisa de
verificação de TIPO, porque **Node apaga os tipos, não os confere** — `node --test` sobre um `.ts`
transpilado nunca reprova `const n: number = 'texto'`. A verificação é uma prova **separada**,
aplicada **só ao lado da solução**, com o próprio julgador e o próprio spawn
(`app/electron/main/engine/exec/typesCheck.ts`).

Ela **não** foi dobrada dentro das provas 2 e 4, e o motivo é o mesmo nas duas: falha de
**compilação** é gratuita, e uma prova que se satisfaz de graça deixa de provar.

- **Prova 2 (starter falha)** continua *runtime-only*. Um starter de linguagem tipada quase sempre
  tem erro de tipo por construção (o corpo é um `TODO`, logo o retorno declarado não é satisfeito).
  Se falha de `tsc` contasse como "o starter falhou", a prova valeria para todo starter — inclusive
  o que já resolve o exercício — e pararia de provar que o aluno tem o que fazer.
- **Prova 4 (stub vazio falha)** continua *runtime-only*. O stub é `export {};`, e o `import` do
  arquivo de teste vira erro de **compilação** ("has no exported member"); se isso contasse aqui, a
  prova passaria sempre e o teste **tautológico** — que roda verde contra o stub — nunca seria pego.

Três invariantes da quinta prova: o compilador roda em **spawn separado** (nunca uma flag do runner)
e sob o **mesmo semáforo `SEM_EXEC`** das rodadas de teste, porque ele custa da ordem de 1–2 s contra
~290 ms de uma rodada e fora do teto dominaria a F9 inteira; a linguagem que **exige** a prova e não
tem o compilador na máquina **reprova** o desafio (fail-closed, nunca verde silencioso); e a
**dupla-igualdade** (contagem declarada == contagem executada == `expectedTestCount`) continua
obrigatória em toda linguagem — `failureExitCodes.successRequiresCountMatch` é `true` literal no tipo
do registro de adaptadores e nenhum adaptador pode declará-la `false`.

### 5.5 Formato da violação

```jsonc
{
  "arquivo": ".../challenges/cumprimentar/challenge.json",
  "campo": "solutionCode",
  "linha": 2, "coluna": 6,
  "eixo": "operators.unary",
  "construcao": "op:unary:typeof",
  "faixa": "productive",
  "trechoOfensor": "typeof nome !== 'string'",
  "primeiraAulaQueEnsina": null,
  "mensagem": "você usou `typeof`, que esta trilha não ensina em lugar nenhum"
}
```

**A distinção que faz o laço convergir:**

- `primeiraAulaQueEnsina !== null` → **violação de ORDEM**. Ação: reescrever o artefato ou reordenar
  o grafo.
- `primeiraAulaQueEnsina === null` → **LACUNA DE CURRÍCULO**. Ação: **criar a aula atômica que
  falta**.

Sem essa separação o laço reescreve desafios eternamente para caber num currículo furado e **nunca
termina**.

---

## 6. O laço de revisão

### 6.1 A ordem é contra-intuitiva, e é o que torna o laço barato

```
1. VERIFICADORES DETERMINÍSTICOS (orçamento AST · node:test · pins)
     ↓  havendo violação mecânica, o LLM caro NÃO é chamado — o defeito já está localizado e provado
2. REVISOR LLM (só com os três verdes) — achados semânticos que o script não expressa
     ↓
3. FILTRO ESTRUTURAL (função pura, R1–R8) — descarta antes de chegar ao planejador
     ↓
4. PROVADOR (script) — transforma candidato em pin executável que falha hoje
     ↓  candidato sem pin morre em silêncio
5. PLANEJADOR (catálogo FECHADO de ações) → CORRETOR (verify-first, span restrito)
     ↓
6. RE-VERIFICAÇÃO: só os itens tocados + TODOS os pins
```

**O revisor LLM só é chamado quando os três verificadores estão verdes.** Consultar o juiz caro toda
rodada custou +129% de tokens sem ganho de qualidade medido; parar por sinal barato economizou 38%
com qualidade estatisticamente indistinguível.

### 6.2 Papéis

| Papel | Escreve? | Entrada | Saída |
|---|---|---|---|
| **AUTOR** | sim — único dono do arquivo | dossiê + orçamento **literal** | draft |
| **VERIFICADOR** | não (é script) | artefato + orçamento + pins | violações tipadas |
| **REVISOR** | **não — proibido** | artefato **normalizado** + catálogo de regras + saída do verificador | apontamentos |
| **PROVADOR** | pins, nunca o artefato | candidato | pin que falha hoje, ou descarte |
| **PLANEJADOR** | não | apontamentos válidos + ledger | ações do catálogo fechado |
| **CORRETOR** | sim, só o delta prescrito | ação + evidência | patch |

Três restrições de roteamento, verificáveis em código:

- `model(AUTOR) !== model(REVISOR)`;
- `family(REVISOR) ∉ families(produtores)` — a autopreferência sobrevive a rubrica binária objetiva
  (mais de 50% mais provável de marcar como satisfeito um critério que a própria saída falhou) e se
  estende à **família** do modelo;
- o revisor **nunca** recebe o raciocínio, o plano ou o rascunho do autor. Verificar no mesmo contexto
  repete a alucinação; a variante fatorada dobra a precisão.

**Normalizador obrigatório entre autor e juiz**, determinístico e testável: remove comentários,
autoria, nome de modelo, changelog e auto-avaliação; neutraliza tom. Sem ele o autor **compra o
veredito** — auto-declaração de corretude vale de +5,3 a +34,3 pontos.

### 6.3 O schema do apontamento — evidência antes do veredito

**A ordem dos campos não é estética.** Propriedades obrigatórias aparecem antes das opcionais na saída
estruturada, o que empurra um campo de raciocínio opcional para *depois* da decisão. O dano é medido:
100% das respostas em modo JSON puseram a resposta antes da justificativa, e um modelo caiu de 86,99
para 23,44 em GSM8K ao ganhar restrição de schema. Portanto: **todo campo de todo schema da engine é
obrigatório**, e um lint de build falha quando o índice do campo de decisão é menor que o do campo de
justificativa.

```jsonc
{
  "id": "APT-0042", "rodada": 1, "artefato": "desafio",
  "alvo": { "caminho": "…", "linha": 7, "span": [122, 149], "no_ast": "ThrowStatement", "token": "throw" },
  "evidencia": {
    "tipo": "orcamento",
    "prova": "token `throw` não pertence ao orçamento de m01/a03",
    "introduzido_em": "m02/a05",
    "reproduzivel_por": "npm run engine -- audit m01/a03"
  },
  "defeito": "O desafio usa `throw` na linha 7.",
  "regra_violada": "C1",
  "categoria": "construcao_nao_ensinada",
  "severity": "bloqueante",
  "acao_sugerida": "…",
  "confianca": 0.95
}
```

**O bug que esta seção nomeava — CORRIGIDO (registro histórico).** ⚑ Até o commit `ff190f4`
(`p04-schemas`), `TestVerdict { nome; aprovado; motivo }` em `challengeContextValidator.ts` punha a
decisão antes do raciocínio, no único componente cuja função é reprovar desafio que cobra o que não
foi ensinado. A ordem prescrita aqui — `nome → construcoes_encontradas → motivo → aprovado` — **é a
que está no disco**. O comando que confere:

```bash
cd app && sed -n '98,104p' electron/main/services/challengeContextValidator.ts
# export interface TestVerdict {
#   nome: string;
#   /** construções que o teste exige (ex.: `typeof`, `assert.throws`, loop). */
#   construcoes_encontradas: string[];
#   motivo: string;
#   aprovado: boolean;
# }
```

A regra deixou de depender de alguém lembrar dela: `lint-schemas` roda o preflight de **INV-04**
(índice do campo de justificativa menor que o do campo de decisão) sobre o `SCHEMA_REGISTRY` real,
e sai **2** em qualquer violação.

```bash
cd app && npm run engine -- lint-schemas
```

### 6.4 Filtro estrutural

| Regra | Descarta quando |
|---|---|
| R1 | span ausente ou irresolvível |
| R2 | o defeito não é frase declarativa |
| R3 | não pede mudança (é pergunta ou elogio) |
| R4 | a prova cita algo fora do span e fora do orçamento |
| R5 | `reproduzivel_por` roda e **não** reproduz |
| R6 | `regra_violada` não existe no catálogo |
| R7 | categoria `estilo` com correção aberta |
| R8 | mais de 12 apontamentos no mesmo artefato — trunca por severidade |

**R5 é mecânico de propósito.** Filtrar acusação falsa com outro LLM não funciona: F1 = 0,000 na
classe "incorreto". E `evidencia.trecho ∈ artefato` é uma checagem de substring, barata e
determinística — é a mitigação nomeada para o revisor que alucina, já que 33% dos falsos negativos de
juiz de código são comentários sobre statements que **nem aparecem** no artefato.

### 6.5 Severidade por tabela fixa, nunca opinada

| Categoria | Severidade |
|---|---|
| `construcao_nao_ensinada`, `api_nao_ensinada`, `pre_requisito_violado`, `teste_invalido`, `gabarito_nao_passa` | **bloqueante** — abre rodada |
| `cobertura_faltante`, `teoria_desalinhada_do_desafio`, `ambiguidade_de_enunciado` | **corrigir** — abre rodada |
| `granularidade` | corrigir na fase de estrutura; sugestão depois |
| `estilo`, `tom`, `prosa` | **sugestão** — nunca abre rodada; quota de 3 por aula |

O revisor **não calibra**: instruções como "reporte só o que for grave" ou "seja conservador" fazem o
modelo reportar menos, literalmente. Ele reporta tudo; a triagem é etapa separada.

Também **não se pede nota de 1 a 5**: avaliadores LLM de material didático agrupam tudo entre 2,9 e
3,1. Checklist binário sobe a concordância em 0,45.

### 6.6 Cascata de parada, na ordem em que dispara

```
0. PARE("mecanico")   0 violações de orçamento ∧ node:test verde ∧ todos os pins verdes
                      ∧ 0 apontamentos bloqueante/corrigir sobreviventes ao PROVADOR   ← o oráculo
1. PARE("pingpong")   hash(y_t) == hash(y_t-2) != hash(y_t-1) → devolve o de menor score no buffer
2. ROLLBACK           score_erro_t > score_erro_t-1 + 0,10 → volta para y_t-1
3. PARE("estagnou")   distância de embedding < 0,06 por 2 rodadas E o número de bloqueantes não caiu
4. PARE("failsafe")   rodada 3 → emite quality_warning e ESCALA. Nunca aceitar por cansaço.
```

`score_erro = 3×violações_orçamento + 3×testes_falhando + 2×pins_falhando + 1×apontamentos_corrigir`

**ajuste declarado na implementação** (`review/loop.ts`): os termos `pins_falhando` e
`apontamentos_corrigir` são medidos com **LAG** — o estado *anterior* da rodada. Sem o lag, uma
rodada que apenas **descobre** um bloqueador novo se auto-castigaria com rollback; com ele, o
rollback reage à piora do estado provável (orçamento/provas) e das regressões prévias. Pins criados
na própria rodada ficam fora do score.

**A aprovação do revisor nunca é a condição 0.**

**Orçamento default: 1 rodada de refino por artefato.** O ganho é concentrado na primeira; a quarta
compra cerca de 0,9 de 6,8 pontos. A segunda e a terceira só existem se a primeira deixou bloqueante
em aberto.

**Escopo da re-revisão — implementado (`review/loop.ts`):** o laço roda sobre o **conjunto de
artefatos da unidade em revisão**, não sobre a trilha inteira. Cada rodada começa re-executando os
verificadores mecânicos sobre o conjunto da sessão e re-apresenta ao revisor LLM o conjunto
normalizado **inteiro** (`visaoNormalizada(sessao.artefatos)`); o que fica restrito aos itens
**tocados** é apenas a re-verificação pós-correção, junto de **todos** os pins (§6.1 passo 6). Ou
seja: a unidade é re-revista como conjunto, não só o achado — o que a regra do parágrafo anterior
proíbe é refinar a trilha inteira uniformemente, porque refinar tudo super-corrige e piora o
conjunto.

**O limiar que governa o laço.** Um revisor que marca falha como passe a uma taxa ≥ `(1−τ)/2` — com
τ = 0,10, isto é **0,45** — **nunca remove nada**, com qualquer número de rodadas ou amostras. Mais
rodadas não salvam, mais amostras não salvam, e a nota agregada não denuncia. A métrica que governa o
laço é a **taxa de falso-passe medida contra mutantes injetados**. Se ela cruzar o limiar, **pare o
laço e conserte o juiz**.

### 6.7 Anti-oscilação e memória

- **Version buffer** — toda versão de cada artefato é guardada; rollback e ping-pong escolhem dali.
- **Pins de regressão** — todo defeito confirmado e corrigido vira **imediatamente** um teste
  executável, e nenhuma correção posterior é aceita se quebrar um pin já verde. O conjunto inteiro
  roda a cada rodada. Ordem de aquisição: pins baratos (token proibido na AST) antes de caros
  (execução).
- **Ledger de rejeições** — chave `regra | alvo_normalizado | conceito`, justificativa obrigatória de
  ao menos 40 caracteres, importância nascendo em 2, +1 quando a rejeição se confirma, −1 quando um
  pin a contradiz, removida em 0. O estado `excecao_intencional` é **obrigatório**: 55% dos
  apontamentos não resolvidos em produção são decisão de projeto intencional, e sem esse canal o mesmo
  apontamento volta toda rodada e o laço nunca converge.
- **Catálogo FECHADO de ações do planejador** — sem ele o espaço de apontamentos é infinito e "zero
  apontamentos" não existe: `SPLIT_NODE`, `MERGE_NODES`, `INSERT_INTERMEDIATE`, `DECLARE_INTEGRATIVE`,
  `ADD_EDGE`, `REMOVE_EDGE`, `BREAK_CYCLE_WITH_STUB`, `BREAK_CYCLE_WITH_MINIMAL_INTRO`,
  `DEFER_COMPLEXITY`, `MARK_WIP`, `MOVE_CONCEPT_TO_ENTRY_BUDGET`, `REWRITE_IN_BUDGET`, `ADD_TEST`,
  `SPLIT_LESSON`.
- **Constituição com as duas polaridades na mesma rodada.** Eixo restritivo: C1 nada fora do
  orçamento · C2 desafio resolvível só com o ensinado · C3 testes legíveis com o orçamento de entrada
  · C4 uma unidade nova por aula. Eixo construtivo: C5 o desafio exercita o conceito **novo** · C6 não
  é resolvível por `return` constante · C7 a teoria ensina tudo o que o desafio cobra · C8 nenhum
  conceito órfão. Sem o eixo construtivo o laço produz aulas triviais — é o mesmo efeito medido em
  Constitutional AI, onde a inocuidade sobe monotonicamente enquanto a utilidade cai.

---

## 7. Os prompts canônicos

Convenções válidas para todos:

- **Nada de "pense profundamente, passo a passo"** em modelo com raciocínio nativo — é anti-padrão
  declarado. O controle de profundidade é parâmetro, não texto. (A frase existe hoje, literal, em
  `challengeContextValidator.ts`.)
- **Nunca schema rígido e sequência de passos na mesma chamada.** Etapa criativa produz texto livre;
  a extração estruturada é uma **segunda chamada barata**.
- **Raciocínio antes de decisão** em todo schema (§6.3).
- **Proibido "recomece do zero"** em qualquer estágio — apagaria exatamente as restrições que
  garantem a proibição dura.
- **Checksum de cauda:** o prompt de autoria termina pedindo que o modelo repita a lista de
  construções permitidas, e a máquina compara.
- **Toda saída cabe em 2.000 tokens**; o artefato vai para disco.

### 7.1 Autor de aula — o prompt central

É aqui que mora o estudo de como se ensina uma matéria quebrada em partes simples.

**Papel.** Escreve **uma** aula atômica. Não vê as outras aulas, não decide o que vem antes ou depois.
Recebe um estado de conhecimento exato e escreve o **menor incremento demonstrável** sobre ele.

**Entrada** — o dossiê congelado, **13 campos** (o texto original dizia 12, mas enumera 13; a
implementação conta 13 e a lista canônica `CAMPOS_DO_DOSSIE` vive em
`app/electron/main/engine/prompts/dossier.ts`); o spawn é **recusado** se faltar qualquer um:
objetivo (um verbo, um objeto, contexto, critério); `introduces.productive` (no máximo 2 itens);
`budget_produtivo`, `budget_receptivo` e `budget_teste` como **listas literais e completas**, nunca
resumo nem trecho truncado; `kc_type`; `ei_class`; `subgoals[]`; `terms` já definidos;
`notional_machine_delta`; `fora_de_escopo[]` com motivo; `misconceptions_a_refutar[]` com âncora na
spec; e os desafios já escritos.

**As dezoito regras duras:**

1. **Ordem das habilidades, sem exceção:** ler semântica → escrever sintaxe → ler template → escrever
   template. *Read before write; semantics before templates.* O estágio de template é opcional por
   construção.
2. **A primeira interação do aluno é sempre PREVER a saída de um programa que não é dele.** Ele nunca
   começa num editor em branco. A predição pergunta **o quê**, jamais **o como**, não conta para nada,
   e é seguida da execução que a confronta. A posse é monotônica: não é meu → parcialmente meu → meu.
3. **Orçamento é lei.** Qualquer construção, palavra-chave, operador ou API fora das listas é
   proibida em **qualquer lugar**: prosa, exemplo, starter, solução, teste. **Se você acha que precisa
   de algo fora do orçamento, isso é defeito do grafo, não licença.** Devolva
   `{"blocked": true, "missing": [...], "motivo": "..."}` e **pare**. Não improvise, não ensine o
   pré-requisito de passagem, não "explique rapidinho".
4. **O formato segue o tipo de conhecimento.** Fato → enunciado direto e drill, **não explique** (não
   há o que explicar). Categoria ou conceito → exemplos contrastantes positivos **e** negativos, deixe
   induzir. Regra ou habilidade → worked example e prática, **evite sobre-explicar**. Princípio →
   explicação com rationale obrigatória. Integrativo → **explicação obrigatória**; exemplo sozinho não
   basta.
5. **O formato segue também a interatividade dos elementos, e ela inverte a receita.** Se os elementos
   só fazem sentido juntos (`for` com condição, incremento e corpo), o worked example antes do primeiro
   desafio é **obrigatório**. Se são aprendíveis isoladamente (nomes de tipos, métodos de array, o que
   é `NaN`), worked example completo é **defeito**: deixe o aluno gerar a resposta e receber feedback,
   porque nesse material quem gera aprende mais.
6. **Toda explicação percorre uma onda semântica completa:** nomeie o termo técnico → desempacote
   (troque o termo por palavra comum, dê uma analogia concreta) → **reempacote, obrigatoriamente**
   (volte ao termo técnico **dentro do código**, mostrando a analogia aplicada linha a linha) → diga
   **onde a analogia quebra**. Explicação que não sobe de volta é rejeitada. Só termo técnico é
   *flatlining* alto; só analogia é *flatlining* baixo.
7. **O worked example é orientado a processo, não a produto.** Mostre o código sendo construído em
   incrementos que **rodam**: escreve poucas linhas → roda → mostra a saída ou o **erro real** → lê a
   mensagem → corrige → roda de novo. O aluno precisa ver que programas não são escritos de cima a
   baixo sem erro numa passada só. As instruções ficam **dentro** do código como comentários, nunca ao
   lado. Use os subgoal labels recebidos, sem inventar rótulo novo. Ao menos 2 worked examples por
   construção nova, variando o contexto e mantendo a estrutura.
8. **Nunca introduza a construção nova só com o código mais simples imaginável.** Ela deve aparecer em
   pelo menos **duas formas sintaticamente distintas** (argumento como literal **e** como expressão
   composta; condição como comparação **e** como booleano pronto). Mostrar um caso só faz o aluno
   induzir uma regra restrita demais.
9. **Refute explicitamente.** Para cada concepção da lista, escreva o par errado/certo ancorado na
   spec. Tocar num território sem refutar a concepção dele pode **reforçá-la**.
10. **Inclua ao menos um item cuja pergunta seja "qual é o estado agora?"**, não só "qual é a saída?".
    Perguntas sobre estado têm taxa de erro dramaticamente mais alta, e é onde moram as concepções
    erradas.
11. **Comece com retrieval** — uma pergunta sobre uma aula ancestral declarada.
12. **Separe três slots:** teoria (modelo mental, antes e apartada do desafio), referência
    just-in-time (sintaxe e assinatura, colada ao desafio) e drill (opcional). Se uma construção foi
    ensinada há mais de *k* aulas e não está visível, ela **entra** na referência just-in-time — exigir
    na aula 14 algo da aula 6 sem lembrete é atenção dividida no tempo.
13. **Proibido "adicionar atividade para aumentar a carga germane".** Carga germane redistribui, não
    adiciona. Só existem dois botões: reduzir a carga extrínseca e gerenciar a intrínseca por
    decomposição.
14. **Não re-explique com andaime de novato o que já está consolidado no orçamento.** É reversão de
    expertise, e tem a **mesma severidade** que cobrar fora do orçamento.
15. **Entregue o escopo pedido e pare.** Nada de seção não solicitada.
16. **Nada de `obj[expr]` com chave não-literal; nada de alias de função.**
17. **Português do Brasil:** traduza o conceito, mantenha API e sintaxe em inglês. Termo novo fora da
    lista é **lacuna de currículo, não licença**.
18. **Ao final, repita a lista de construções permitidas** (checksum).

### 7.2 Revisor

**Papel.** Aponta defeitos. **Não escreve código, não pontua, não aprova.** O schema de saída não tem
campo de código — a proibição é estrutural, não exortativa.

**Entrada.** Artefato **normalizado** (§6.2), o catálogo **fechado** de regras, e a saída dos
verificadores determinísticos. Nunca o raciocínio nem o rascunho do autor.

**Regras duras.** Todo apontamento carrega evidência **citável e verificável**: caminho, linha, span,
nó de AST e um trecho que precisa existir literalmente no artefato. Apontamento sem span é descartado
antes de chegar ao planejador. Reporte tudo o que encontrar — a triagem por severidade é etapa
separada e não é sua.

Um bloco de cinco predicados por aula, respondidos com sim ou não e justificativa, **sem escrever
código**: (1) contém elemento sintático **e** semântico novo? (2) é adição mínima ao conhecimento
prévio? (3) é explicitamente relacionada a um pré-requisito nomeado? (4) a construção nova aparece num
exemplo relevante da teoria? (5) a construção nova é exigida no desafio desta aula?

### 7.3 Planejador

**Papel.** Transforma apontamentos sobreviventes em **ações do catálogo fechado** (§6.7), ordenadas.
Não escreve conteúdo.

**Regra dura.** Toda ação nomeia o arquivo, o span e o resultado esperado. Apontamento que não mapeia
para nenhuma ação do catálogo é devolvido como defeito **do catálogo**, não convertido em ação
improvisada.

### 7.4 Corretor

**Papel.** Aplica **uma** ação prescrita, no span prescrito.

**Regras duras.** *Verify-first*: antes de mudar qualquer coisa, confirme que o defeito existe — e
**tenha o direito de rejeitar o apontamento** com justificativa. Diff fora do span é rejeitado pelo
gate. Todos os pins rodam depois; quebrar um pin verde invalida a correção.

---

## 8. Os três modos

| Comando | O que faz |
|---|---|
| `generate` | executa F0 a F12 e produz uma trilha nova |
| `audit` | monta o orçamento cumulativo de uma trilha **existente** e reporta toda violação com arquivo, linha e coluna. **Não usa LLM e não precisa de chave** |
| `repair` | aplica o laço revisor → plano → correção sobre conteúdo existente, respeitando os pins |

`audit` é o modo mais importante no curto prazo: ele é o gate que não existe, é barato, é
determinístico e produz imediatamente o relatório das violações da trilha atual. **É também o teste
de aceitação da engine inteira.**

**Estado da implementação — os TRÊS modos existem.** ⚑ Esta seção afirmou, até 2026-09-05, que
`generate` e `repair` "ainda não" existiam e que `--from`/`--only` "ainda não" estavam
implementados. As três afirmações eram **falsas**, e o comando que as derruba é o próprio `--help`
da engine:

```bash
cd app && npx tsx tools/track-engine/cli.ts --help
# lista: audit · coverage · requirements · revise · generate · repair · lint-schemas
# e, no bloco do generate:  generate <slug> --assunto "..." [--from FASE] [--only slug]
```

O texto revogado ficava como registro do momento em que a ordem de construção do §14 tinha
entregado só o gate determinístico. Ele deixou de descrever o disco quando `generate` (P-22) e
`repair` entraram, e ninguém o atualizou — é o defeito que o `CONTRIBUTING.md` chama de PR que
muda contrato sem tocar no contrato.

**Superfície de comandos, medida.** Os sete comandos abaixo saem literalmente do `--help` citado
acima. Os três modos do §8 são `audit`, `generate` e `repair`; os outros quatro são ferramentas de
leitura que o gate determinístico ganhou depois e que não chamam LLM nenhuma.

| Comando | LLM? | O que faz | Exit |
|---|---|---|---|
| `audit <slug>` | não | o orçamento cumulativo × as violações, com arquivo, linha e coluna | 0 · 1 · 2 |
| `coverage <slug>` | não | sintetiza o código MÍNIMO que passa em cada teste e compara com o orçamento (LACUNA × EXCESSO) | 0 · 1 · 2 |
| `requirements <slug>` | não | bijeção `requirements[]` declarados ↔ `test('...')` do desafio | 0 · 1 · 2 |
| `revise <slug>` | não | a revisão progressiva: varre da 1ª à última aula até o hash do relatório estabilizar | 0 · 1 · 2 |
| `generate <slug> --assunto` | **sim** | F0 a F12; retomável por `--from <fase>`, depurável por `--only <slug>` | 0 · 1 · 2 |
| `repair <slug>` | dry-run **não**, `--aplicar` **sim** | o laço revisor → plano → correção sobre trilha existente | 0 · 1 · 2 |
| `lint-schemas` | não | preflight de INV-04 (ordem de campo) e INV-05 (nada opcional) sobre o `SCHEMA_REGISTRY` real | 0 · 2 |

Flags comuns de leitura: `--dir DIR` (carrega a trilha de fora de `resources/tracks/`), `--limite N`,
`--json`; `audit` acrescenta `--modo declared|inferred`, `--harness receptive-seed|none` e
`--so-lacunas`.

⚑ **`--limite` conta coisas DIFERENTES conforme o comando**, e a armadilha é `0`. No `audit` ele
limita quantas **violações são impressas** (`0` = nenhuma, só o placar — a trilha inteira é
auditada). No `coverage`/`requirements`/`revise` ele limita quantos **desafios/aulas são
processados** (`0` = nenhum, e o placar sai todo zerado sem que nada tenha sido medido). Medido:

```bash
cd app && npm run engine -- audit python --limite 0     # placar sobre as 20 aulas
cd app && npm run engine -- coverage python --limite 0  # placar:  desafios ... 0
cd app && npm run engine -- coverage python             # placar:  desafios ... 21
```

Um `coverage <slug> --limite 0` sai **0** com todos os contadores em zero. É a mesma classe de
armadilha que o §9.2 documenta em `checagensNaoExecutadas`: zero-porque-não-rodou lido como
zero-porque-está-certo.

O manual de uso e os números que cada comando reproduz estão em `app/tools/track-engine/README.md`.

**Comandos novos desta onda — ESTRUTURA RESERVADA, valores PENDENTES.** ⚑ O `CONTRIBUTING.md` exige
que interface de CLI se decida no contrato **antes** do código. A onda que liga ao CLI os módulos de
qualidade já escritos e nunca expostos (`engine/quality/discriminacao.ts`, `engine/modes/reorder.ts`,
`engine/modes/curriculumGap.ts`) está em execução **em paralelo a este documento**. O que se lê
abaixo foi `[INFERÊNCIA — lido de trabalho em andamento]`: veio do `--help` da árvore de
trabalho daquela onda, ainda não integrada, e **pode mudar antes de virar `main`**. Nenhum número
desta tabela é medida deste documento; a onda seguinte fecha a lacuna com o handoff daquele agente.

| Comando (provisório) | Módulo que expõe | Classificação declarada | Exit (provisório) |
|---|---|---|---|
| `discrimination <slug>` | `quality/discriminacao.ts` (cláusula J5, §9.1) | **AVISO com contagem, nunca violação** — sai 0 mesmo com achado | 0 sempre que mediu · 2 uso incorreto |
| `reorder <slug>` | `modes/reorder.ts` — "mova a aula que a ensina para antes" | dry-run por default; `--aplicar` só grava depois de re-derivar o orçamento e provar que a violação alvo sumiu e nenhuma nova apareceu | 0 · 1 · 2 |
| `gap <slug>` | `modes/curriculumGap.ts` — a lacuna de currículo vira aula | dry-run por default; `--aplicar` autora a prosa com LLM e só grava a aula que a verificação aceita | 0 · 1 · 2 |

Enquanto esses comandos não estiverem em `main`, os módulos continuam **medíveis só por script**, e
este documento diz onde (§9.1, J5).

**A engine nunca escreve aula por conta própria.** Nos modos `generate` e `repair`, quem produz e
reescreve conteúdo é o autor-LLM, recebendo o orçamento congelado como restrição dura e podendo
devolver `blocked` em vez de improvisar. O código determinístico produz o orçamento, verifica o
resultado e aponta o defeito — nada além disso. Um gate que também escreve o conteúdo que julga
perde a independência que o torna confiável.

---

## 9. Qualidade e o placar

### 9.1 A prova de que um desafio é justo

| # | Cláusula | Como se prova |
|---|---|---|
| J1 | **Contenção** | AST de todas as superfícies contra as três allowlists, com regiões congeladas isentas |
| J2 | **Exercício** | `constructs(solution) ∩ introduces.productive ≠ ∅` |
| J3 | **Solubilidade** | aluno simulado cujo contexto é **exatamente** o orçamento, k=3, veredito por `node --test` de verdade. Métrica `pass^k`, não `pass@k`. Ele reporta **a primeira construção que faltou** |
| J4 | **Especificação** | bijeção enunciado ↔ teste nas duas direções; exemplo do enunciado nunca é caso de teste; cobertura de linha e de ramo |
| J5 | **Discriminação** | a solução passa em 100%; cada solução errada catalogada falha em ≥1 teste; nenhum par falha no mesmo conjunto |
| J6 | **Carga** | tetos de §3.6; o passo apagado **é** o átomo-alvo; o primeiro desafio do módulo não é sem andaime |
| J7 | **Alinhamento** | o verbo do objetivo é o verbo da seção e o verbo do desafio |
| J8 | **Feedback** | toda asserção diz para onde vai, o que deu, e o próximo passo **escrito dentro do orçamento**; zero mensagens dirigidas à pessoa em vez da tarefa |
| J9 | **Escopo declarado** | `notRequired[]` não vazio; nenhum teste cobra algo listado ali; cenários obrigatórios **derivados** do orçamento |

J3 é a peça que ninguém costuma implementar e é a que pega o defeito relatado: **uma taxa de acerto
de 0% em muitas tentativas é sinal de tarefa quebrada, não de aluno incapaz.**

#### J5, implementada — e o que ela MEDIU na trilha `python`

A cláusula J5 estava especificada desde a primeira versão deste documento e **nenhum código a
executava**. Ela agora existe em `app/electron/main/engine/quality/discriminacao.ts`, e a parte que
ela cobre é a **estática**:

```
alvos            = introduces.productive da aula
alvosNaSolucao   = alvos ∩ atoms(solutionCode)
discriminados    = alvosNaSolucao ∩ atoms(minimalCode)
naoDiscriminados = alvosNaSolucao ∖ atoms(minimalCode)
```

`naoDiscriminados ≠ ∅` significa que a construção-alvo está na solução de referência **e ausente do
menor código que o teste aceita** — um aluno que nunca a escreva passa mesmo assim. A parte
executável da J5 ("cada solução errada catalogada falha em ≥1 teste; nenhum par falha no mesmo
conjunto") continua sendo de `quality/mutants.ts` e **não roda aqui**; a limitação sai declarada na
saída do módulo.

**DECISÃO DE PROJETO: AVISO com contagem, nunca violação.** A classificação é literal no tipo
(`classificacao: 'aviso'`), não parâmetro. O motivo é o número medido: transformar falta de
discriminação em reprovação pintaria de vermelho **17 das 20 aulas** da única trilha do produto — e
essa é decisão do dono, não do gate. O módulo **mede e declara**; não existe função `reprovar()` nem
exit code nele.

**O placar medido (2026-09-05, `resources/tracks/python`):**

| Medição | Valor |
|---|---|
| Desafios avaliados | 21 |
| Medidos | 20 |
| Não medidos (fail-closed, §9.3) | 0 |
| Sem alvo (desafio de módulo, sem aula dona) | 1 |
| Discriminam (o teste força a construção) | 3 |
| **AVISO: não discriminam** | **17** |
| Alvos presentes na solução | 34 |
| Alvos forçados pelo teste | 5 |
| **AVISO: alvos não forçados pelo teste** | **29** |
| Aulas com alvo não forçado | **17 de 20 medidas** |

**A explicação em uma linha:** o código mínimo que passa em cada um dos 21 desafios é um único
`print("<saída esperada>")`. A aula de potência não exige `**`; a de f-string não exige f-string; a
de variável não exige atribuição. O `audit` fica verde porque a **solução** usa a construção — e usa
mesmo. O que falha é o teste, não a solução.

**Como reproduzir.** `avaliarDiscriminacao` ainda **não está ligada ao CLI** em `main` (ver §8, a
tabela de comandos provisórios). Até estar, a medição é por script, na raiz de `app/`:

```bash
cd app && cat > .j5.mts <<'EOF'
import { loadTrack } from './electron/main/content/trackLoader';
import { deriveTrackBudget } from './electron/main/engine/budget';
import { sintetizarCodigoMinimoDaLinguagem } from './electron/main/engine/quality/minimalPorLinguagem';
import { criarProverDeDesafio } from './electron/main/engine/phases/f9Verifier';
import { createExecSemaphore } from './electron/main/engine/runtime/semaphore';
import { avaliarDiscriminacao, linhasDeDiscriminacao } from './electron/main/engine/quality/discriminacao';
const track = await loadTrack('resources/tracks/python');
const budget = deriveTrackBudget(track);
const prover = criarProverDeDesafio();
const sem = createExecSemaphore();
const brutos: { ref: string; lessonRef: string | null; ch: any }[] = [];
for (const mod of track.modules) {
  for (const lesson of mod.lessons) {
    for (const ch of lesson.challenges) {
      brutos.push({ ref: `${mod.meta.slug}/${lesson.meta.slug}/${ch.slug}`, lessonRef: `${mod.meta.slug}/${lesson.meta.slug}`, ch });
    }
  }
  if (mod.challenge) brutos.push({ ref: `${mod.meta.slug}/challenges/${mod.challenge.slug}`, lessonRef: null, ch: mod.challenge });
}
const avaliados = await Promise.all(brutos.map(async (d) => {
  const release = await sem.acquire();
  try {
    const minimal = await sintetizarCodigoMinimoDaLinguagem(prover, {
      starterCode: d.ch.starterCode ?? '', solutionCode: d.ch.solutionCode ?? '',
      testsCode: d.ch.testsCode, expectedTestCount: d.ch.expectedTestCount, language: budget.adapterId,
    });
    const orc = d.lessonRef ? budget.byRef.get(d.lessonRef) : undefined;
    return { ref: d.ref, lessonRef: d.lessonRef, alvos: orc ? [...orc.introduces.productive] : [], solutionCode: d.ch.solutionCode ?? '', minimal };
  } finally { release(); }
}));
console.log(linhasDeDiscriminacao(avaliarDiscriminacao('python', avaliados as any, { language: budget.adapterId })).join('\n'));
EOF
npx tsx .j5.mts; rm -f .j5.mts
```

**Este é um fato novo sobre a trilha, não só sobre a engine.** O `audit` de `python` fecha em
**0 violações** e o `coverage` em **0 lacunas** — nenhum desafio cobra o que a aula não ensinou, que
é a garantia pedida. J5 mostra a outra metade, que aquelas duas medidas não enxergam: o teste não
**cobra** o que a aula ensinou.

### 9.2 O placar

`report.json` fecha com, no mínimo: violações de orçamento por faixa e por superfície; desafios que
falham em cada prova de execução; cobertura de conceitos sem aula dona e de aulas sem desafio;
distribuição de construções novas por aula (o histograma que denuncia penhasco e platô); similaridade
entre exemplo da teoria e solução; taxa de falso-passe do revisor contra mutantes; e tokens por fase.

Formato do placar, seguindo a convenção do repositório: `N passou · N falhou · N pendente`. Toda
limitação (sem chave, sem rede, checagem não executada) é **declarada na saída**, nunca omitida.

#### O placar DECLARA o que não rodou — `checagensNaoExecutadas` e `limitacoes[]`

"Declarada na saída" era, até 2026-09-05, uma frase sem mecanismo. O `audit` imprimia
`avisos ... 0` sobre a trilha `python` e um leitor razoável lia **"está tudo certo"** quando o
significado era **"a bateria não rodou"**: A13–A16 é javascript-only, porque `H13`/`AX` são tabelas
de chaves do `ts.SyntaxKind` e os spans mecânicos S13 saem de `ts.createSourceFile`.

O `AuditReport` passou a carregar dois campos obrigatórios de honestidade:

| Campo | O que é |
|---|---|
| `totals.checagensNaoExecutadas` | quantas checagens desta auditoria **não rodaram** (= `limitacoes.length`). Só com ele em **0** é que `avisos: 0` quer dizer "nenhum aviso" |
| `limitacoes[]` | uma entrada por checagem pulada, com `id`, `checagem`, `motivo` e `consequencia` |

Medido:

```bash
cd app && npm run engine -- audit python --limite 0 --json > /tmp/audit.json
python3 -c "import json;d=json.load(open('/tmp/audit.json'));print(d['totals']['checagensNaoExecutadas'], [l['id'] for l in d['limitacoes']])"
# -> 1 ['A13-A16-NAO-RODOU']
```

A entrada `A13-A16-NAO-RODOU` declara a consequência exata: `metrics[].novosVerdadeiros` (a 2ª
coluna do histograma, "verdadeiramente novas") fica **ausente** em todas as aulas, e ela traz a
própria prova por mutação — apagar TODOS os blocos de código da teoria da aula 1 desta trilha **não
muda o placar**. Rodar a bateria assim mesmo não daria erro: daria **veredito errado e silencioso**
(tudo "não demonstrado", todo desafio reprovado). Por isso a saída pula e declara, em vez de
adivinhar.

⚑ **Corolário para quem lê placar desta engine:** um `0` num contador de aviso só é informação
quando `checagensNaoExecutadas == 0`. Ler o contador sem ler o campo é a mesma classe de erro que o
§9.3 proíbe — aprovação por omissão.

### 9.3 Fail-closed

Hoje o gate semântico faz o contrário: se o revisor está fora do ar, o desafio é entregue assim mesmo.
Trilha é conteúdo versionado e offline — **a engine falha fechada**. Indisponibilidade produz erro
estruturado, nunca veredito falso nem aprovação por omissão.

### 9.4 Reprodução dos números

Os números de §1 saíram de `audit` sobre a trilha que existia até 2026-09-02, sem chave de API. Ela
foi apagada e eles **não são mais reproduzíveis** — ficam como registro histórico, e o §1 diz isso
na primeira linha. A regra do repositório continua valendo para todo número NOVO: o comando exato
fica no `README.md` da engine, e o `CONTRIBUTING.md` exige que **nenhum número apareça sem o
comando que o reproduz**.

---

## 10. Campos aditivos no schema

O schema do produto é **aberto**: nenhum validador rejeita chave extra e o loader faz cast, não pick.
Campos aditivos passam hoje, verificado por round-trip. **Bumpar `schemaVersion` está proibido na
prática** — ele é comparado por igualdade estrita em quatro lugares e o app inteiro quebraria.

Em `lesson.json`: `objective` (verbo, enunciado, contexto, critério); `introduces` com as duas faixas
nos seis eixos; `introducesTerms`; `foraDeEscopo` (obrigatório, não vazio); `eiClass`; `role`;
`targetAtom`; `notionalMachineDelta`; `budgetHash`; `budgetVersion`; `status`; `research`.

Em `challenge.json`: `taskSkill`; `supportLevel`; **`outputChannel`**; `requires` (com a aula que
ensina cada construção); `requirements` (bijeção com os testes); `notRequired`; `subgoals`;
`surfaceDomain`; `solutionAlternates`; `wrongSolutions`; `scenarios` com o tipo **derivado** do
orçamento.

`outputChannel` é o modo de falha número um medido em exercícios gerados por LLM: a solução imprime
enquanto o teste espera retorno. De 165 exercícios com solução **e** testes, apenas 51 (30,9%) tinham
solução que passava nos próprios testes.

**`assertions[]` e o campo aditivo `optionRationales` (o quiz da aula).** Em `lesson.json`,
`assertions[]` é o quiz de múltipla escolha que o aluno responde **durante** a aula, e cada
afirmação carrega `id`, `statement`, `question`, `options` (exatamente 4, não vazias e únicas),
`answerIndex`, `feedback`, `sectionId?` (a âncora para a seção de teoria que demonstra a afirmação)
e — aditivo desta onda — **`optionRationales?: string[]`**.

| Regra de `optionRationales` | Valor |
|---|---|
| Ausente | aula sem racionais declarados — **válido** (é o estado das 20 aulas de `python` hoje) |
| `[]` | **ausência EXPLÍCITA**, nunca defeito: é o que o `AssertionDraftSchema` materializa por INV-05 (nada `.optional()` nos schemas da engine) e o que a F12 copia verbatim |
| Não vazio | comprimento **exatamente igual** ao de `options`, um racional por alternativa, na MESMA ordem, cada item texto não vazio |

Reprovar `[]` reprovaria toda aula que a engine gera — por isso a regra tem os três ramos e não
dois. A validação vive em `app/electron/main/content/trackTypes.ts`; o campo é o material ancorado
que o tutor usa quando o aluno erra (a explicação do **distrator escolhido**, e não o `feedback`
único da afirmação, que continua existindo e continua sendo o texto pós-resposta).

⚑ **O que o prompt do autor NÃO pedia.** Até `af1f152` (`onda2-autor-racionais`) o prompt do autor
de aula nunca pedia `assertions[]`: o schema aceitava por herança e nenhum outro caminho populava o
campo, então **qualquer trilha gerada nasceria sem quiz nenhum**. O prompt agora pede as afirmações
e os quatro racionais, ancorados na seção que demonstra a afirmação, com o erro nomeado na
alternativa e nunca no aluno.

`difficulty` continua existindo mas **nenhum gate pode lê-lo**. Na implementação atual ele é
**PROVISÓRIO** (`app/electron/main/engine/phases/f12Materialize.ts`, `dificuldadeProvisoria`): rampa
**linear 1..5 pela posição global da aula** no orçamento F4 — o desafio herda a dificuldade da aula,
o desafio de módulo a da última aula do módulo e a proficiência fica fixa em 5. O débito de produto
declarado: derivar `difficulty` do **tempo medido** para resolver a referência substitui a rampa —
até lá, o campo não é sinal de nada (§11: usar `difficulty` como sinal de gate é proibido).

---

## 11. Proibições da engine

| Proibido | Por quê |
|---|---|
| Gerar em massa pelos comandos de scaffold do CLI | fazem read-modify-write dos arquivos-pai; dezenas de agentes em paralelo produzem corrida com perda **silenciosa** |
| Bumpar `schemaVersion` | comparado por igualdade estrita em 4 lugares |
| Deixar a proibição dura como frase no prompt | restrição verificável declarada em prosa vaza em taxa de dois dígitos |
| Usar "o revisor aprovou" como critério de parada | κ = 0,21; 50% do código errado aceito |
| "Repetir até o revisor não achar mais nada" | auto-correção sem sinal externo degrada |
| Painel de N revisores votando "esta aula está boa?" | nove juízes de fronteira valem cerca de dois votos independentes, e o melhor juiz único bate o painel |
| Debate entre revisores | perde para *self-consistency* com o mesmo orçamento |
| Pedir nota de 1 a 5 | tudo colapsa entre 2,9 e 3,1 |
| Rodar a engine no processo main do Electron | decrypt síncrono e parse de dezenas de respostas travam a UI; o IPC tem teto de 150 s |
| Usar o LLM local como worker de fan-out | serializa tudo em um slot |
| Cair para outro provedor em 429 | 429 é backoff, nunca fallback |
| Manter o fail-open do gate semântico | conteúdo versionado exige fail-closed |
| Manter a cobertura fixa `example + boundary + error` | é a causa estrutural do desafio impossível da aula 1 |
| Restringir pelo `ecmaVersion` do parser | produz `unexpected token`; parseie tudo e reprove no orçamento |
| Truncar o orçamento no prompt | descarta o código ensinado; comprimir é trocar prosa por identificadores |
| Gerar a trilha inteira numa conversa ou numa chamada | teto físico de 8.192 tokens de saída |
| Paralelizar as seções de uma mesma aula | etapas posteriores dependem das anteriores |
| Usar `difficulty` como sinal de gate | é rótulo vazio, e no produto ele é o cronômetro |
| Dar ao revisor um campo de patch | se o campo existe, ele usa |
| Deixar o mesmo agente escrever e revisar | autopreferência sobrevive a rubrica objetiva e se estende à família do modelo |
| Confiar em voto majoritário para filtrar alucinação de API | 43% das alucinações se repetem em 10 de 10 amostras — a votação **ratifica** |
| Tolerar 2 a 5% de construções fora do orçamento | prosa é redundante, código não é. Em código o limiar é **100%**, e é isso que permite o gate ser binário |
| Delegar a um LLM o descarte de apontamento falso | F1 = 0,000 na classe "incorreto" |

---

## 12. Decisões de produto abertas

| # | Decisão | Default adotado |
|---|---|---|
| D1 | Política de harness de teste | `receptive-seed` — harness no orçamento receptivo da aula 1 + região congelada no starter (§3.2) |
| D2 | Teto de aulas | não existe; o teto é por aula, e a contagem é saída com portão humano em F6 |
| D3 | Máquina nocional de JS/Node | não existe descrita pedagogicamente em fonte pública; cerca de 15 aulas exigirão concepções autoradas do zero, ancoradas na ECMA-262 e no MDN. **Planejar esse esforço** |
| D4 | Orçamento da **prosa** em português | é o elo mais fraco: flexão, sinônimo e a mesma palavra em sentido comum e técnico. Determinístico só sobre termo canônico em negrito, título ou crase; severidade **aviso**, nunca bloqueante, até calibrar |
| D5 | Distinção receptivo/produtivo | a **necessidade** está medida; a **correção** não tem precedente na literatura de currículo de programação. Fixtures de regressão e revisão humana no piloto |

⚑ **D3 é registro histórico.** Ela foi escrita quando a trilha do produto era de JavaScript/Node —
a trilha apagada em 2026-09-02. A única trilha do produto hoje é `python`
([`17-trilha-python.md`](17-trilha-python.md)), e a máquina nocional dela está descrita lá, aula por
aula. D3 volta a valer se e quando uma trilha de JS for autorada de novo.

---

## 13. Rastreabilidade

Toda afirmação pedagógica deste documento tem origem na pesquisa auditada. O `CONTRIBUTING.md`
proíbe promessa de ganho pedagógico sem fonte, e o gate cobra isso mecanicamente — logo, a pesquisa
que sustenta este documento precisa existir em `docs/research/` antes de qualquer aula gerada por
esta engine entrar no repositório.

As dezesseis dimensões pesquisadas: padrões de prompt; saída estruturada; decomposição e raciocínio;
laços actor-critic; LLM como juiz; orquestração multi-agente; objetivos e alinhamento construtivo;
carga cognitiva; grafos de pré-requisito; domínio e prática espaçada; pedagogia de programação;
concepções erradas em JavaScript; decomposição atômica de JavaScript; vocabulário controlado e
verificação estática; design de exercício; e geração automática de currículo.

---

## 14. Ordem de construção

1. **Extrator de átomos e o gate de orçamento rodando sobre a trilha atual.** Não depende de LLM
   nenhuma e produz imediatamente o relatório de violações. É o teste de aceitação de tudo.
2. **Grafo e conceitos da trilha atual por extração**, não por geração — corrige a confusão de tipo
   das 105 referências e revela que o grafo hoje é uma corrente, não um DAG.
3. **Orçamento derivado e os fixtures de regressão.**
4. **A camada de transporte** — semáforos, backoff, telemetria — e o conserto dos furos do executor,
   mais a função única de contagem de testes por AST.
5. **Decomposição, grafo, orçamento e freeze para um módulo**, com portão humano.
6. **Autoria e verificação no piloto de 3 aulas**, medindo a taxa de ruído do revisor **antes** de
   ligar o laço.
7. Só então a onda cheia.

Cada passo tem um número que o justifica e um teste que o prova.
