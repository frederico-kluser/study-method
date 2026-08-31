# Protocolo de revisão — aula `let-e-atribuicao` (aula 1 da trilha)

> **Escopo.** Este protocolo é o instrumento da revisão adversarial da aula `let-e-atribuicao`
> (experimento aula_1). Ele transpõe as 18 regras duras do autor (`docs/16-engine-de-trilha.md` §7.1,
> fonte única `app/electron/main/engine/prompts/author.ts` → `REGRAS_DURAS_DO_AUTOR`), as invariantes
> de estrutura (§5.2 I5–I9), a ordem interna (§4.3), o teste de atomicidade (§3.6) e as réguas de
> tamanho (§3.6) em **critérios de verificação observáveis no artefato** — o que contar, o que ler,
> o que rodar para dizer "atendida" ou "quebrada".
>
> **Fontes normativas (nesta ordem de autoridade):** gate determinístico > este protocolo > `docs/16`
> > `contrato.json` > `dossie.json`. Onde este protocolo e um gate divergirem, o gate vence.
>
> **Como usar na fase 2.** A revisão roda na ordem do §6.1: (1) verificadores determinísticos
> (orçamento por faixas A1/A2/A3/A4/A6, prova de execução §5.4) antes de qualquer julgamento; (2) só
> então revisão de prosa com este protocolo; (3) apontamentos com **span + evidência literal** (o
> trecho citado precisa existir no artefato — §6.3/§6.4 R4). O revisor não reescreve: reporta.
>
> **Severidade (§6.5).** `R3`, `I6`, `C7` (teoria não ensina o que o desafio cobra) são
> **bloqueantes**. `R2`, `R4`–`R10`, `R12`, `R15`, `R17`, `I5` são **corrigir**. `R1`, `R13`, `R16`,
> `R18` e observações (`O1`–`O5` da Parte E) são **sugestão** ou N/A. Máximo 12 apontamentos por
> artefato, truncando por severidade (§6.4 R8).
>
> **Artefatos sob revisão (fase 2):** `theory.json`/draft de teoria (só existe depois que a a02
> entregar), draft do desafio (a03), `lesson.json` (a04) e o resultado de `auditTrack` (a05). Este
> arquivo cobre também os N/A estruturais de uma aula única.

---

## Parte A — As 18 regras duras (§7.1): critério de verificação por regra

Convenção de aplicabilidade: **Teoria** = drafts da F7 (seções `teoria|referencia|drill`); **Desafio**
= draft da F8 (`statement/starterCode/solutionCode/testsCode`); **Prosa** = texto em pt-BR de qualquer
superfície (inclui comentários em código, que não são parseados); **Engine** = verificado por máquina,
nada a ler no artefato.

| # | Aplicável a | Bloqueante? |
|---|---|---|
| R1 | Teoria | sugestão |
| R2 | Teoria | corrigir |
| R3 | Teoria+Desafio+Prosa | **bloqueante** |
| R4 | Teoria | corrigir |
| R5 | Teoria | corrigir |
| R6 | Prosa | corrigir |
| R7 | Teoria | corrigir |
| R8 | Teoria | corrigir |
| R9 | Teoria+Prosa | corrigir |
| R10 | Teoria+Desafio | corrigir |
| R11 | Teoria | N/A (documentado) |
| R12 | Teoria | corrigir |
| R13 | Prosa | sugestão |
| R14 | Prosa | corrigir (mesma severidade de R3) |
| R15 | Teoria+Desafio | corrigir |
| R16 | Desafio | sugestão |
| R17 | Prosa | corrigir |
| R18 | Engine | N/A na revisão |

---

### R1 — Ordem das habilidades (ler semântica → escrever sintaxe → ler template → escrever template)
*Transcrição:* "Ordem das habilidades, sem exceção: ler semântica → escrever sintaxe → ler template →
escrever template. Read before write; semantics before templates. O estágio de template é opcional por
construção."

**Critério de verificação (observável):** percorrer as seções da teoria na ordem em que aparecem no
draft e registrar a sequência de habilidades exercitadas: (1) **ler semântica** — primeiro contato com
`let`/atribuição: o aluno LÊ o que acontece (predição R2 / leitura de exemplo com explicação);
(2) **escrever sintaxe** — depois: o aluno escreve uma declaração (exercício/desafio de preenchimento,
que é a lacuna do starter); (3) **ler template** — o aluno lê a linha congelada do starter
(`contador = 5;`) com a justificativa de que ela é leitura (receptiva); (4) **escrever template** —
opcional por construção; espera-se ausente.

**Quebrada quando:** a aula começa fazendo o aluno ESCREVER código sem etapa de leitura anterior, ou
ensina a escrever o template (a linha congelada) antes de o aluno ler o harness. Marcar quebrada
somente com evidência de ordem invertida no fluxo do draft (não é bloqueante isolada).

---

### R2 — Prever antes de escrever (a primeira interação é PREVER a saída de um programa alheio)
*Transcrição:* "A primeira interação do aluno é sempre PREVER a saída de um programa que não é dele.
Ele nunca começa num editor em branco. A predição pergunta **o quê**, jamais **o como**, não conta
para nada, e é seguida da execução que a confronta. A posse é monotônica: não é meu → parcialmente meu
→ meu."

**Critério de verificação (observável):** a PRIMEIRA atividade interativa da teoria (antes de qualquer
pedido de escrita) é uma pergunta de predição sobre um programa dado, que pergunta **o quê** (qual
resultado/valor) e **não** o como (qual mecanismo); a resposta da predição é confrontada por execução
mostrada nos blocos (saída ou erro real). No orçamento desta aula **não existe `global:console`** — a
única execução mostrável é o resultado do teste/do retorno; a forma canônica contratada
(`contrato.json` → `regras_autor[10]`): mostrar `export function x() { return 1; }` e pedir para
prever "o que o teste veria" — **esta adaptação é a satisfação aceita** (assinalada no contrato).

**Quebrada quando:** a primeira atividade pede escrita de código, ou a predição pergunta "como" (ex.:
"como o JS guarda o valor?"), ou a predição não é seguida de confrontação com execução.

---

### R3 — Orçamento é lei (FORA das listas = proibido em qualquer superfície)
*Transcrição:* "Orçamento é lei. Qualquer construção, palavra-chave, operador ou API fora das listas é
proibida em qualquer lugar: prosa, exemplo, starter, solução, teste. Se você acha que precisa de algo
fora do orçamento, isso é defeito do grafo, não licença. Devolva `{"blocked": true, "missing": [...],
"motivo": "..."}` e pare. Não improvise, não ensine o pré-requisito de passagem, não 'explique
rapidinho'."

**Critério de verificação (observável):** conferir TODAS as superfícies contra as três listas
(`dossie.json` `budget_receptivo | budget_produtivo | budget_teste`, reproduzidas literalmente no
`contrato.json`):
- cada bloco cercado ```js da teoria/solução/desafio contra a faixa PRÓPRIA (§3.3: teoria⊆receptivo,
  starter⊆receptivo, solução⊆produtivo, testes⊆teste); o resultado do gate (`ofensasDeOrcamento…`)
  É a evidência — na fase 2, rodar/reportar o gate antes de opinar (P1: nada que possa ser decidido
  por código é decidido por LLM);
- **prosa também conta** (o eixo `term:` é aviso, D4, mas código nunca): varrer a prosa por
  construções de código fora das listas (ver lista de armadilhas abaixo);
- se o autor declarou necessidade de algo fora do orçamento sem devolver `blocked` → quebrada.

**Armadilhas específicas desta aula (fora das listas — cada ocorrência é R3 quebrada):**
`console.log` (não há `global:console`), `op:binary:+`/`-`/`*`/`/` (nenhum `op:binary:*`), `===`,
`typeof`, `const`/`var`, `template literal` (`` ` ``), `if`/`for`/`while`, `throw`, `new Error`,
`assert.throws`, `node:test` além da forma da seed, `import` diferente da do harness, objeto/array,
`.length`, função como valor, `++`/`+=`, `undefined`/`null` (não listados), identificadores globais
fora da seed.

**Informação verificada (auditoria, ver Parte E):** as três listas são IDÊNTICAS entre `dossie.json` e
`contrato.json`; `productive ⊆ receptive`; `introduces_productive ⊆ productive ∩ receptive`;
`node:BinaryExpression` e `op:assign:=` estão no receptivo; nenhum `op:binary:*` existe.

---

### R4 — Formato segue o tipo de conhecimento (regra → worked example + prática, evitar sobre-explicar)
*Transcrição:* "O formato segue o tipo de conhecimento. Fato → enunciado direto e drill, **não
explique** (não há o que explicar). Categoria ou conceito → exemplos contrastantes positivos **e**
negativos, deixe induzir. Regra ou habilidade → worked example e prática, **evite sobre-explicar**.
Princípio → explicação com rationale obrigatória. Integrativo → **explicação obrigatória**; exemplo
sozinho não basta."

**Critério de verificação (observável):** o dossiê fixa `kc_type=regra`, `ei_class=regra` (justificada
no contrato: regra de comportamento de `let` + habilidade de escrever a declaração). Sob essa classe:
- balanço: para cada bloco de exposição (≥2–3 parágrafos contínuos sem exemplo), deve existir um
  worked example antes do bloco seguinte; marcar "sobre-explicar" quando há mais prosa expositiva que
  exemplo/prática;
- **não** é formato de fato (não há "decorar e responder" sem mecanismo), **não** é formato de
  princípio (sem rationale filosófica exigida), **não** é integrativo (nada para explicar além da
  regra). Se a teoria tratar `let` como fato isolado (sem mostrar o mecanismo de troca de valor na
  máquina nocional) → desvio de R4.

**Quebrada quando:** ausência de worked example na seção de regra, ou prosa expositiva dominante sem
exemplo, ou explicação de `let` como "fato decorável" sem demonstrar o mecanismo (o `notional_machine_delta`
do dossiê exige: avaliar lado direito, substituir o valor guardado).

---

### R5 — Worked example obrigatório antes do primeiro desafio quando os elementos só fazem sentido juntos
*Transcrição:* "O formato segue também a interatividade dos elementos, e ela inverte a receita. Se os
elementos só fazem sentido juntos (`for` com condição, incremento e corpo), o worked example antes do
primeiro desafio é **obrigatório**. Se são aprendíveis isoladamente (nomes de tipos, métodos de array,
o que é `NaN`), worked example completo é **defeito**: deixe o aluno gerar a resposta e receber
feedback."

**Critério de verificação (observável):** declarar→atribuir→ler é uma cadeia interativa (o contrato
assim a classifica, `ei_class_justificativa`). Portanto: existe ≥1 worked example completo na teoria
**antes** do enunciado do primeiro desafio; esse WE demonstra a tríade — declara com valor inicial, a
atribuição seguinte troca o valor, a leitura (retorno/assert) devolve o valor mais recente. A inversa
(NÃO haver WE antes do desafio; ou o desafio vir antes de qualquer WE) é **quebrada**.

---

### R6 — Onda semântica completa (nomear → desempacotar → reempacotar DENTRO do código → onde quebra)
*Transcrição:* "Toda explicação percorre uma onda semântica completa: nomeie o termo técnico →
desempacote (troque o termo por palavra comum, dê uma analogia concreta) → **reempacote,
obrigatoriamente** (volte ao termo técnico **dentro do código**, mostrando a analogia aplicada linha a
linha) → diga **onde a analogia quebra**. Explicação que não sobe de volta é rejeitada."

**Critério de verificação (observável):** para cada termo novo explicado (mínimo: "variável",
"declaração", "atribuição", "valor"): localizar (1) o termo técnico nomeado; (2) a paráfrase comum ou
analogia concreta (ex.: etiqueta/prateleira que guarda um valor); (3) o reaparecimento do **termo
técnico** numa frase que cita código (ex.: "a atribuição `contador = 5;` **substitui** o valor
guardado"); (4) frase explícita de limite da analogia ("a diferença: a etiqueta não calcula nada; a
variável só guarda o que a atribuição põe"). Marcar quebrada quando a analogia aparece sem reempacote
ou sem limite declarado.

---

### R7 — Worked example orientado a processo (incrementos que rodam; instruções DENTRO do código; ≥2 WEs; subgoals fixos)
*Transcrição:* "O worked example é orientado a processo, não a produto. Mostre o código sendo
construído em incrementos que **rodam**: escreve poucas linhas → roda → mostra a saída ou o **erro
real** → lê a mensagem → corrige → roda de novo. […] As instruções ficam **dentro** do código como
comentários, nunca ao lado. Use os subgoal labels recebidos, sem inventar rótulo novo. Ao menos 2
worked examples por construção nova, variando o contexto e mantendo a estrutura."

**Critérios de verificação (contáveis, observáveis):**
1. **≥2 worked examples distintos** que contêm a declaração `let` como conteúdo novo (não a repetição
   exata de um mesmo bloco); os dois variam contexto (ex.: `contador` e `nome`, ou `saldo` e `total`)
   e mantêm a estrutura (declarar → atribuir → ler);
2. **processo**: em pelo menos um WE, o bloco mostra um incremento que roda + a saída **ou** o erro
   real (texto de saída/erro presente no bloco ou em crase logo após) + a correção; WE que entrega só
   o produto final sem nenhuma etapa de execução → quebrada;
3. **comentários**: as instruções explicativas do WE estão como comentários `//` **dentro** dos blocos
   ```js, não em parágrafo ao lado (parágrafo ao lado só para a pergunta de predição, se houver);
4. **rótulos**: as palavras-chave `declarar`, `atribuir`, `ler-valor` (os três subgoals do dossiê)
   ocorrem nos comentários/instruções; **nenhum** rótulo novo (ex.: "criar", "armazenar",
   "guardar o número") é usado como label de subgoal — rótulo novo = quebrada (R7.4).

---

### R8 — Duas formas sintaticamente distintas da construção nova (decl:let)
*Transcrição:* "Nunca introduza a construção nova só com o código mais simples imaginável. Ela deve
aparecer em pelo menos **duas formas sintaticamente distintas** (argumento como literal **e** como
expressão composta; condição como comparação **e** como booleano pronto). Mostrar um caso só faz o
aluno induzir uma regra restrita demais."

**Critério de verificação (observável, por AST):** contar, nos blocos de código da **teoria**
(submetidos a `budget_receptivo`), as **formas sintáticas** da declaração `let`:
- **Forma 1** — `VariableDeclaration` **com** inicializador: `let x = 1;` / `let nome = "Ana";`
  (AST: declaração com `initializer`);
- **Forma 2** — `VariableDeclaration` **sem** inicializador: `let x;` **seguida** de atribuição
  separada `x = 5;` (AST: `initializer` ausente — forma de nó distinta).

Qualquer par contendo as duas formas → **atendida**. Contendo apenas uma forma (ex.: só literais, ou
só com inicializador) → **quebrada**.

**Satisfazibilidade (auditoria — ler antes de julgar):** a leitura literal do exemplo do §7.1
("literal **e** expressão composta") exigiria `let total = a + b;`, o que dispararia `op:binary:+` —
**ausente de todas as listas** (verificado). A única forma 2 possível dentro do orçamento é a
declaração sem inicializador + atribuição separada (todas as chaves necessárias —
`node:ExpressionStatement`, `node:BinaryExpression`, `op:assign:=`, `node:Identifier`,
`node:NumericLiteral`, `decl:let` — estão no receptivo). O contrato já fixou exatamente este par
(`contrato.json` → `regras_autor[7]`: "declaração com valor inicial E declaração sem valor seguida de
atribuição"). **Fallacy a evitar na revisão:** `let x = 1;` + `let nome = "Ana";` (literal numérico +
literal string) **não** são duas formas sintáticas distintas — o AST das duas é idêntico (mesma
shape, muda só o tipo de literal); se o autor usar esse par como satisfação de R8, marcar como
satisfação FRACA (não quebrada, mas apontar que a forma 2 real fica em falta) — ver Parte E, item de
decisão D-R8.

---

### R9 — Refutação explícita das concepções (par errado/certo ancorado na spec)
*Transcrição:* "Refute explicitamente. Para cada concepção da lista, escreva o par errado/certo
ancorado na spec. Tocar num território sem refutar a concepção dele pode **reforçá-la**."

**Critério de verificação (observável, contável):** o dossiê declara 3 concepções
(`misconceptions_a_refutar`): (1) "caixa que acumula" (atribuição soma); (2) "redeclarar troca o
valor" (`let x = 1; let x = 2;`); (3) "atribuir sem declarar funciona" (`x = 1;`). Para **cada uma
das 3**: existe um par com o equívoco (errado) e o correto, e a refutação cita a âncora (ECMA-262/
MDN). Faltar par para qualquer uma das 3 → **quebrada** (R9 é "para cada concepção da lista").

**Restrição de verificabilidade (importante):** a concepção (2) é `SyntaxError` (redeclaração no mesmo
escopo) — **não parseia** como bloco ```js, e a teoria inteira reprova no gate de parse (§5.3: "bloco
com tag js que não parseia é erro de build"). Logo o par errado da (2) **deve** aparecer em crase
inline (prosa) ou dentro de comentário — nunca como bloco ```js. A (1) não envolve código inválido e
a (3) parseia (o erro é de runtime, não de parse) — podem usar blocos ```js. Marcar quebrada se a (2)
foi escrita como bloco ```js (o gate reprovaria) ou se alguma concepção foi "tocada" sem par errado/
certo.

---

### R10 — Pergunta de estado ("qual é o estado agora?")
*Transcrição:* "Inclua ao menos um item cuja pergunta seja 'qual é o estado agora?', não só 'qual é a
saída?'. Perguntas sobre estado têm taxa de erro dramaticamente mais alta, e é onde moram as
concepções erradas."

**Critério de verificação (observável):**
- **Teoria:** existe ≥1 pergunta dirigida ao aluno sobre o valor guardado **no meio ou no fim de uma
  sequência de atribuições** (ex.: "depois de `contador = 5;`, o que está guardado em `contador`?"),
  cuja resposta é o estado (valor da variável), não a "saída" de um comando de impressão;
- **Desafio:** o teste valida o valor **final** (o da última atribuição) e não um valor intermediário
  (`formas_benditas` item 6 — o enunciado é resolvível somente por leitura do estado final). O teste
  canônico `assert.equal(iniciar(), 5)` cumpre isso.

**Quebrada quando:** nenhuma pergunta de estado na teoria (só perguntas "qual é a saída?") ou teste
que valide valor intermediário.

---

### R11 — Retrieval (pergunta sobre aula ancestral) — N/A documentado
*Transcrição:* "Comece com retrieval — uma pergunta sobre uma aula ancestral declarada."

**Critério de verificação:** **N/A com justificativa registrada** — esta é a aula 1 da trilha
(`objetivo.contexto`: "o aluno ainda não conhece nenhuma construção de JavaScript"; `dossie.json` →
`fora_de_escopo`; `regras_autor[10]` do contrato declara o N/A e a substituição aprovada: a primeira
interação vira a **predição de leitura do próprio harness** (R2): mostrar `export function x() {
return 1; }` e prever o que o teste veria). O retriever da fase 2: a aula deve **começar** com a
predição descrita — se começar de outra forma (ex.: retomando contexto inexistente de "aula
anterior"), marcar como N/A violado apenas na forma (sugestão).

---

### R12 — Três slots (teoria / referência just-in-time / drill)
*Transcrição:* "Separe três slots: teoria (modelo mental, antes e apartada do desafio), referência
just-in-time (sintaxe e assinatura, colada ao desafio) e drill (opcional). Se uma construção foi
ensinada há mais de *k* aulas e não está visível, ela **entra** na referência just-in-time […]"

**Critério de verificação (observável):** o `theory[]` do draft tem seções distintas com tags
`teoria`, `referencia` e opcionalmente `drill`: (a) a seção de **teoria** constrói o modelo mental
(onda semântica) **antes e apartada** do desafio; (b) a seção de **referência** contém a sintaxe
resumida (ex.: `let <nome> = <valor>;`) e fica **colada ao desafio** (imediatamente antes do
enunciado, ou indicada como consulta durante o desafio); (c) `drill` é opcional e, se existir,
exercita só declarar/atribuir/ler (subgoals). O item "k aulas" (construção velha sem lembrete) é
latente nesta aula única — N/A, registrar se o draft improvisar um slot a mais.

---

### R13 — Carga germane (proibido "adicionar atividade para aumentar carga")
*Transcrição:* "Proibido 'adicionar atividade para aumentar a carga germane'. Carga germane
redistribui, não adiciona. Só existem dois botões: reduzir a carga extrínseca e gerenciar a intrínseca
por decomposição."

**Critério de verificação (observável):** nenhuma atividade/drill cuja única justificativa seja
"praticar mais" sem reduzir carga (ex.: repetir o mesmo desafio com outro nome, pedir para reescrever
o mesmo exemplo) e nenhuma seção que aumenta a complexidade sem relação com o átomo (ex.: adicionar
múltiplos `let` encadeados "para exercitar"). O drill, se existir, é variação mínima que isola o
átomo.

---

### R14 — Reversão de expertise (não re-explicar o consolidado do orçamento)
*Transcrição:* "Não re-explique com andaime de novato o que já está consolidado no orçamento. É
reversão de expertise, e tem a **mesma severidade** que cobrar fora do orçamento."

**Critério de verificação (observável):** a seed do harness (`export`, `import`, `function`, `return`,
`test`, `assert.equal`, arrow `() => {}`) está no orçamento receptivo da entrada mas **não é
conteúdo** — é `frozenRegion`/leitura (§3.2). Marcar **quebrada com severidade de bloqueante** se a
teoria dedicar parágrafos a "ensinar" o que é função/import/assert (ex.: seção explicando "o que é
`export function`"), ou se o desafio pedir que o aluno escreva algo do harness. A menção do harness
só pode ser "é assim que o teste nos vê" (leitura, R2/contrato).

---

### R15 — Entregue o escopo pedido e pare (nada de seção não solicitada)
*Transcrição:* "Entregue o escopo pedido e pare. Nada de seção não solicitada."

**Critério de verificação (observável):** o draft contém exatamente os 3 slots (R12) e nada além: nada
de seções sobre `const`/`var`/escopo/debug/boas práticas/`console.log`/operadores; nada de
curiosidade histórica; o desafio não adiciona requisitos fora do escopo do dossiê
(`objetivo` + `fora_de_escopo`). Um item do `fora_de_escopo` pode ser citado APENAS como "isso fica
para outra aula" (rente ao contrato `proibicoes_absolutas`).

---

### R16 — Sem `obj[expr]` com chave não-literal; sem alias de função
*Transcrição:* "Nada de `obj[expr]` com chave não-literal; nada de alias de função."

**Critério de verificação (observável):** procurar `ElementAccessExpression` com argumento não-literal
(`a[b]`) e atribuição de função a variável (`const f = g`). Nesta aula não há objetos nem funções como
valor no orçamento — trivially satisfeita; manter a varredura por cobertura (o extrator emitiria
`node:ComputedNonLiteralAccess` para a primeira forma).

---

### R17 — Português do Brasil (conceito traduzido; API e sintaxe em inglês)
*Transcrição:* "Português do Brasil: traduza o conceito, mantenha API e sintaxe em inglês. Termo novo
fora da lista é **lacuna de currículo, não licença**."

**Critério de verificação (observável):** prosa em pt-BR com acentuação correta; palavras da
linguagem (`let`, `function`, `return`, `export`) intactas em inglês; conceitos (variável,
declaração, atribuição, valor) em pt-BR. Termo técnico citado fora de `terms`/`introducesTerms` como
se já definido → lacuna (apontar, não passar). **Observação O1 (não é R17):** identificadores em
pt-BR (`contador`) são fixados pelo contrato nas formas benditas; a convenção da skill é
identificadores em inglês — decidir na fase 2 se renomeia (ver Parte E/O1).

---

### R18 — Checksum de cauda (repetir a lista de construções permitidas no final)
*Transcrição:* "Ao final, repita a lista de construções permitidas (checksum)."

**Critério de verificação:** **Engine/N-A na revisão de prosa** — a conferência é mecânica
(`compararChecksum` no `author.ts`, A-P11-5) sobre a saída da chamada LLM, não sobre o artefato
versionado. Nada a ler no draft; registrar que a divergência rejeita a saída na autoria (fail-closed),
não na revisão.

---

## Parte B — Invariantes de estrutura (§5.2): I5, I6, I7, I8, I9 — critérios e N/A

### I5 — Construção introduzida aparece em ≥1 exemplo da teoria da PRÓPRIA aula
**Critério (observável, contável):** `decl:let` (o único `introduces.productive`) ocorre em ≥1 bloco
```js da seção de **teoria** (não vale ocorrência só no starter do desafio, nem só no `solutionCode`).
Verificação manual: contar "let" em blocos cercados da teoria — ≥1. A camada automática equivalente é
A4+A5 (teoria ⊆ receptivo e átomo novo declarado em `introduces`); este protocolo pede a checagem
**positiva** (existência de exemplo), que o gate por faixas não garante por si.
**Bloqueio:** nenhum exemplo com `let` na teoria → **quebrada** (corrigir).

### I6 — Construção introduzida é EXIGIDA no desafio da própria aula
**Critério (observável):** (a) o enunciado/statement do desafio pede explicitamente declarar com
`let`; (b) o starter tem **uma** lacuna cujo span contém a declaração (comentário `// GAP` que
nomeia `let`); (c) o `solutionCode` contém `decl:let` — isto é garantido pelo gate A6
(`atomos(solutionCode) ∩ introduces.productive ≠ ∅`) e foi verificado empiricamente (Parte D, P1).
**Quebrada:** desafio resolvível sem declarar com `let` (ex.: se o aluno puder passar o teste sem
declaração — não é o caso aqui: starter falha com `ReferenceError`, verificado) ou enunciado que não
nomeie declarar.

### I7 — Construção introduzida reaparece em ≥3 artefatos POSTERIORES — N/A (documentado)
**Justificativa do N/A:** o invariante (e o aviso A10) só tem significado sobre uma trilha
materializada — "artefatos posteriores" são as aulas/seções que vêm depois da aula de origem na ordem
topológica. Este experimento produz **uma única aula** (`let-e-atribuicao`); não existem artefatos
posteriores neste snapshot, portanto a contagem é **vazia por construção** e o invariante é
**indecidível, não violado**. Registro obrigatório no relatório de revisão: "I7: N/A — aula única;
reaparecimento em ≥3 artefatos posteriores será verificado na trilha materializada (F9/F12 audit)".
O que NÃO se pode concluir daqui é "decl:let reaparece em 0 artefatos → violação" — essa leitura
seria um falso bloqueante.

### I8 — Não há 3 aulas consecutivas da mesma família sintática (interleaving) — N/A (documentado)
**Justificativa do N/A:** exige pelo menos 3 aulas consecutivas na trilha; existe 1 aula. Indecidível,
não violado. (Na trilha real, o interleaving será aplicado às 3 aulas do módulo — fora deste
protocolo.)

### I9 — A primeira aparição é a forma mais simples — aplicável, esperada trivial
**Critério (observável):** esta aula **é** a primeira aparição de `decl:let` na trilha (I3: unicidade
de origem). Dentro da própria aula, a PRIMEIRA ocorrência de `let` na teoria deve usar a forma mais
simples: inicializador literal (`let x = 1;`) ou sem inicializador (`let x;`) — nunca uma forma
composta. Como nenhum `op:binary:*` existe no orçamento, a forma "expressão composta" é impossível —
portanto I9 é **satisfeita por construção** salvo se o autor começar com uma forma exótica (ex.: usar
`let` dentro de algo que só o harness permitiria). Verificação: ordem das formas no fluxo da teoria
(literal antes de sem-inicializador, se ambas existirem).

---

## Parte C — Checklist da ordem interna (§4.3): objetivo → esqueleto → desafio/testes → fechamento

A ordem interna manda: **objetivo → esqueleto de teoria (F7) → desafio e testes (F8) → fechamento da
teoria sabendo o que precisa habilitar** — itens de avaliação ANTES dos materiais (Dick & Carey,
Biggs, backward design). Checklist de revisão do CONJUNTO (dossiê + drafts da a02/a03/a04):

| # | Passo | Como verificar no artefato | Estado esperado |
|---|---|---|---|
| C1 | Objetivo | `dossie.json.objetivo` (verbo/objeto/contexto/criterio) presente e estável em todos os drafts; o verbo do objetivo ("demonstrar") é o verbo da seção e do desafio (J7) | ✓ presente |
| C2 | Esqueleto de teoria | draft de teoria (a02) tem as seções `teoria`/`referencia` (e opcional `drill`) com os 3 subgoals | aguarda a02 |
| C3 | Desafio e testes ANTES do fechamento da teoria | order de produção: o desafio (a03) foi escrito contra o esqueleto/resumo da teoria e o fechamento da teoria (parte final da a02) reflete o que o desafio cobra — verificar que os requisitos do desafio (requisito→teste) são cobertos pela teoria efetiva (C7: teoria ensina tudo o que o desafio cobra; nenhum requisito órfão) | aguarda a03 |
| C4 | Fechamento habitado pelo desafio | se o desafio exigiu algo (ex.: string vs número, ou a predição do harness), o fechamento da teoria o habilitou explicitamente (não "por sorte") | aguarda a02/a03 |
| C5 | Provas de execução (§5.4) | ver Parte D/P1–P4 (verificadas empiricamente para a forma canônica) — na fase 2, o prover da F8/já rodou sobre o draft real | ✓ (canônica) |
| C6 | `desafios_ja_escritos` | no FREEZE era `[]` (contra-to: o desafio nasce depois); se o dossiê for re-gerado, o campo deve refletir o desafio real (I5/I6) | documentar |

**Observação de rastreabilidade:** `contrato.json` → `consumidores.autor_teoria` e
`consumidores.autor_desafio` detalham o que cada produtor recebe e valida; a fase 2 deve conferir o
`resumo_da_teoria` entregue ao desafio contra a teoria efetivamente escrita (a lista de construções
diz o que é permitido; o resumo diz como foi apresentado — §4.3).

---

## Parte D — Teste de atomicidade (§3.6) aplicado a esta aula + réguas

### Réguas de tamanho (§3.6) — valores desta aula
| Régua | Teto | Esta aula | Veredito |
|---|---|---|---|
| Construções produtivas novas | ≤ 2, nunca 3 | 1 (`decl:let`) | ✓ |
| Elementos novos que interagem | ≤ 4; ≤ 2 c/ orçamento quase vazio | 2 (`decl:let` + `op:assign:=`) — decisão a01 documentada em `contrato.json` → `introduces_nota` (com 2 produtivas a régua falharia: 2 do nó + 1 da carga mínima = 3 > 2, MEDIDO via `testarAtomicidade`) | ✓ |
| Elementos não interativos | ~7 sem teto | — (nenhum) | ✓ |
| Tempo de resolução | ≤ 120 s p/ quem tem o orçamento | função de 3 linhas | ✓ |

### Os quatro testes de atomicidade — resultado e critério de re-verificação na fase 2
1. **Demonstrável** — cabe num worked example completo sem estourar o teto de elementos
   (declarar→atribuir→ler num único exemplo de ~4 linhas). ✓ na forma canônica. **Re-verificar:** se o
   draft criar um WE com mais de 2 construções interativas (ex.: `let` + atribuição + `if`), o WE
   estoura → **quebrada**.
2. **Exercitável** — cabe num *completion problem* com **uma** lacuna cujo span contém o átomo-alvo.
   ✓ na forma canônica (starter com exatamente 1 `// GAP` cujo span é a declaração; a atribuição fica
   CONGELADA fora da lacuna). **Re-verificar:** contagem de lacunas = 1; o span da lacuna não contém a
   atribuição nem outra construção nova → **quebrada** se >1 lacuna ou span composto.
3. **Orçamentável** — `element_count` somado ao que já entra na aula cabe no teto. ✓ (1 produtiva ≤ 2;
   medição a01). **Re-verificar:** `introduces_productive` do draft = 1 item; nada além de `decl:let`
   marcado como novo produtivo.
4. **Cronometrável** — o desafio correspondente cabe em 120 s para quem tem o orçamento. ✓
   (função de 3 linhas; provas P1–P4 abaixo na ordem de 100 ms).

### Provas de execução (§5.4) — verificadas empiricamente (node v24, `/tmp/sm-prova-let`, 2026-08-30)
| Prova | Comando | Resultado |
|---|---|---|
| P1 solução passa | `node --test test.mjs` (solution canônica) | `tests 1, pass 1, fail 0` ✓ |
| P2 starter falha | starter com lacuna vazia → `contador = 5` sem declaração | `fail 1` — `ReferenceError: contador is not defined` ✓ |
| P3 contagem bate | `expectedTestCount=1`, contagem real | `tests 1` ✓ |
| P4 stub vazio falha | `export function iniciar() {}` | `pass 0, fail 1` ✓ |

Na fase 2, estes números são re-obtidos pelo prover da F8 sobre o draft REAL (o revisor não roda
execução por conta própria — o verificador roda antes; §6.1).

---

## Parte E — Auditoria do contrato (FASE 1)

### E1. Os 13 campos do dossiê (`CAMPOS_DO_DOSSIE` em `engine/prompts/dossier.ts`)
| # | Campo | Status | Nota |
|---|---|---|---|
| 1 | `objetivo` | ✓ | verbo/objeto/contexto/criterio preenchidos; verbo "demonstrar" alinhado ao critério (J7) |
| 2 | `introduces_productive` | ✓ | `["decl:let"]` — 1 item ≤ 2 (I2/A7) |
| 3 | `budget_produtivo` | ✓ | 15 chaves; contém o envelope congelado (ExportKeyword, FunctionDeclaration, Block, ReturnStatement, Identifier) E os nós-envelope da declaração (VariableStatement/VariableDeclaration/VariableDeclarationList) — importante: o `limite_conhecido_audit_derivado` do contrato previa que esses NÓS pudessem faltar; eles estão listados, então o código canônico é contido |
| 4 | `budget_receptivo` | ✓ | 35 chaves |
| 5 | `budget_teste` | ✓ | 22 chaves + seed harness |
| 6 | `kc_type` | ✓ | `regra` |
| 7 | `ei_class` | ✓ | `regra` (∈ enum) — justificada no contrato |
| 8 | `subgoals` | ✓ | `declarar, atribuir, ler-valor` |
| 9 | `terms` | ✓ | `[]` (aula 1) — coerente com `terms_nota` do contrato |
| 10 | `notional_machine_delta` | ✓ | máquina nocional: 1 valor por vez, substituição |
| 11 | `fora_de_escopo` | ✓ | 6 itens com motivo (inclui `const`/`var`/escopo/compostos/erros/múltiplos declaradores) |
| 12 | `misconceptions_a_refutar` | ✓ | 3 concepções com âncora ECMA-262/MDN |
| 13 | `desafios_ja_escritos` | ✓ (vazio) | esperado: desafio nasce depois do freeze (§4.3) |

**Veredito: os 13 campos do dossiê estão presentes e dentro do schema (`montarDossie` passaria).**

### E2. Coerência das listas de orçamento (verificada por script, 2026-08-30)
- As três listas são **byte-a-byte idênticas** entre `dossie.json` e `contrato.json` (0 diff em cada
  lista).
- `budget_produtivo ⊆ budget_receptivo` ✓ (invariante produtivo ⊆ receptivo, §3.2).
- `introduces_productive ⊆ budget_produtivo` e `⊆ budget_receptivo` ✓.
- **Resposta à pergunta do orquestrador: `node:BinaryExpression` ESTÁ no receptivo** ✓ (e no
  produtivo), assim como `op:assign:=` (receptivo + produtivo) e `node:ExpressionStatement`
  (receptivo) — o que torna a linha congelada `contador = 5;` e a forma "declaração sem inicializador
  + atribuição separada" **satisfazíveis no orçamento**.
- **`op:binary:*` NÃO existe em nenhuma lista** (0 chaves) — consequência na R8 (ver E4).

### E3. Satisfazibilidade das 18 regras dentro das listas — resultado por regra
| Regra | Satisfazível? | Evidência |
|---|---|---|
| R1 | ✓ | as 4 habilidades cabem nos slots da aula |
| R2 | ✓ | predição sobre o harness (retorno/assert) — sem `console` o "prever a saída" vira "prever o que o teste vê" (adaptação contratada) |
| R3 | ✓ | todas as superfícies canônicas contidas (verificado) |
| R4 | ✓ | classe regra + WE |
| R5 | ✓ | WE antes do desafio permitido e obrigatório |
| R6 | ✓ | prosa livre |
| R7 | ✓ | 2 WEs com decl:let cabem; comentários em bloco js não emitem átomos |
| R8 | **~ (parcial)** | forma "literal" ✓; forma "expressão composta" IMPOSSÍVEL (sem `op:binary:+`); forma "sem inicializador + atribuição" ✓ — a satisfação depende de usar ESTA forma 2 (contratada). Ver E4 |
| R9 | ✓ | 3 pares; a concepção (2) exige crase/comentário (redeclaração não parseia) |
| R10 | ✓ | pergunta de estado na teoria + teste do valor final |
| R11 | N/A | aula 1; substituição contratada |
| R12 | ✓ | 3 slots cabem |
| R13 | ✓ | sem atividade extra |
| R14 | ✓ | harness só como leitura |
| R15 | ✓ | escopo fechado no dossiê |
| R16 | ✓ | trivial (sem objetos/funções-valor) |
| R17 | ✓ | prosa pt-BR; identificadores em pt (O1) |
| R18 | ✓ | machine-checked |

### E4. **BUraco estrutural (não-bloqueante hoje) — D-R8: "formas sintaticamente distintas" sem operadores binários**
Regra 8 (e seu exemplo canônico "argumento como literal **e** como expressão composta") aponta para um
par que inclui **expressão composta**. Dentro das listas atuais, a única forma 2 disponível para a
declaração é **sem inicializador + atribuição separada** (`let x;` / `x = 5;`). Se a fase 2 adotar a
leitura literal do §7.1 (literal vs expressão composta), o contrato precisará de:
- **`op:binary:+` (e o `+` como leitura) em `budget_receptivo`** — sem isso, `let total = a + b;` na
  teoria dispara A4 e o draft é rejeitado pelo gate.
- uma decisão de produto: ensinar `+` como leitura na aula 1 (aula de let) ou aceitar a forma 2
  "sem inicializador" como satisfação (recomendação deste protocolo, alinhada ao contrato
  `regras_autor[7]`).
**Registro:** não é `issue_blocker` (a satisfação contratada existe e é verificável); é um item de
decisão com a consequência de contrato nomeada, PARA a fase 2 e para o orquestrador.

### E5. Observações (não bloqueantes)
- **O1 — identificadores em pt-BR fixados pelo contrato** (`contador`): a skill e a convenção de
  identificadores pedem inglês; R17 não cobre identificadores. Decidir uma vez na fase 2: manter
  (`contador`/`iniciar`) como forma bendita ou renomear (`counter`/`init`). Se renomear, o contrato
  `formas_benditas` precisa ser atualizado ANTES de a a04 materializar.
- **O2 — discriminação do teste (J5) limitada a 2 classes de erro:** o teste só distingue a
  declaração ausente (`ReferenceError`) e `const` (`TypeError`); `var contador = 0;` e
  `let contador;` (sem inicializador) **passam** no teste. Consequência prática para o draft do
  desafio: `wrongSolutions[]` **só pode catalogar soluções que de fato falham em ≥1 teste** (J5) —
  catalogar `var` ou "let sem inicializador" como erradas violaria J5 (não falham). A fraqueza de
  discriminação é inerente ao átomo (o teste valida o efeito da última atribuição, não o
  inicializador) e está documentada no `criterio` do dossiê; não é defeito do desafio.
- **O3 — a linha congelada `contador = 5;` torna o inicializador irrelevante para o teste** (qualquer
  literal passa). Aceito pelo desenho (objetivo: validar o valor final); NÃO pedir ao autor do
  desafio que "corrija" para distinguir inicializadores — o orçamento não tem como.
- **O4 — redeclaração não parseia:** qualquer tentativa de mostrar `let x = 1; let x = 2;` como bloco
  ```js reprova o gate de parse da teoria (A4) — o par errado da concepção (2) deve usar crase inline
  ou comentário. Observável na revisão: se o draft tiver esse bloco como ```js, é erro de R3/R9 por
  forma, não só de conteúdo.
- **O5 — sem `console.log` em lugar nenhum** (R3): nem para "mostrar a saída" do WE; a saída/erro do
  processo R7 deve ser mostrada como resultado do teste ou do `return`/erro real, nunca por impressão.

---

## Parte F — Critérios de aplicação na fase 2 (como operar o protocolo)

1. **Ordem fixa por artefato:** (i) rodar/fazer rodar os verificadores determinísticos do artefato
   (orçamento por faixas + provas) e anotar o resultado; (ii) ler o draft normalizado (§6.2) e aplicar
   R1–R18 + I5–I9 + checklists C e D; (iii) emitir apontamentos com: `alvo` (caminho, linha, span),
   `evidencia` (trecho literal + tipo da evidência), `regra_violada`, `categoria` (§6.5),
   `severidade`, `acao_sugerida`, `confianca` — sem campo de código (P4).
2. **Os 5 predicados por aula (§7.2)** — responder sim/não com justificativa, sem escrever código:
   1. contém elemento sintático **e** semântico novo? (`let` sintaxe + máquina nocional de
      substituição); 2. é adição mínima ao conhecimento prévio? 3. é explicitamente relacionada a um
      pré-requisito nomeado? (aula 1 → o harness/leitura, ou N/A declarado); 4. a construção nova
      aparece num exemplo relevante da teoria? (I5); 5. é exigida no desafio desta aula? (I6).
3. **Tratamento dos N/A:** I7/I8/R11 — registrar no relatório como "N/A (aula única), documento o
   porquê"; nunca transformar N/A em violação nem em "aprovado por omissão".
4. **Atenção às armadilhas desta aula:** proibição de `op:binary:+`/`console.log` em qualquer
   superfície (R3); par errado da concepção (2) em crase, não em ```js (R9/O4); duas formas reais de
   declaração e não "dois literais" (R8); `wrongSolutions` coerentes com a discriminação real do
   teste (J5/O2); harness nunca explicado como conteúdo (R14).
5. **Saída da fase 2:** lista de apontamentos aprovados/refutados + registro dos N/A + veredito por
   artefato (draft revisado), sem reescrita (o corretor/planejador decide ações do catálogo fechado —
   §6.7).

---

## Registro de verificação desta fase (FASE 1)
- [x] docs/16 §7.1 (18 regras), §3.6 (réguas + teste de atomicidade), §4.3 (ordem interna), §5.1
  (A1–A12), §5.2 (I5–I9) lidos.
- [x] `author.ts` → `REGRAS_DURAS_DO_AUTOR` (fontes da transcrição R1–R18) lido.
- [x] `f8Challenges.ts` (autor de desafio, gates por faixas A1/A2/A3/A6) lido.
- [x] `extract.ts` (eixos node/decl/op/global/api/form) e `form/rules.ts` (5 formas built-in) lidos —
  suportam todas as afirmações de emissão de chave acima.
- [x] Dossiê e contrato lidos e auditados (Parte E); listas comparadas por script (E2).
- [x] Provas P1–P4 da forma canônica executadas em `/tmp/sm-prova-let` (Parte D).
- [x] N/A estruturais (I7/I8/R11/R18) documentados com justificativa.
