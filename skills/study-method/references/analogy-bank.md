# Banco de analogias

**Ponto de partida, não camisa de força.** A analogia certa depende do repertório do aluno: o domínio-base precisa ser algo que ele **já domina estruturalmente**. Se o aluno cozinha, é mecânico, joga xadrez, toca um instrumento ou treina um esporte, **prefira o domínio dele** e escreva a analogia na hora — este banco é o fallback para quando não há repertório conhecido, não a lista autorizada.

Este arquivo é autossuficiente e não encadeia leitura de nenhum outro. O protocolo de uso (escolher → introduzir → testar → aposentar) é regra do tutor e vale integralmente aqui: **nenhuma entrada deste banco pode ser usada sem enunciar o mapeamento e sem declarar a fronteira**.

## Sumário

- [Estrutura de uma entrada](#estrutura-de-uma-entrada)
- [Índice rápido](#índice-rápido)
- [Programação](#programação)
- [Matemática](#matemática)
- [Como o banco cresce](#como-o-banco-cresce)
- [Decisões abertas geradas aqui](#decisões-abertas-geradas-aqui)

---

## Estrutura de uma entrada

Toda entrada tem cinco campos. Os quatro primeiros são estáticos (vivem aqui); o quinto é por aluno e vive no perfil, em `memory/` do setup.

| Campo | O que é | Por que é obrigatório |
|---|---|---|
| **Conceito-alvo** | O que se quer ensinar. | Indexa a busca. |
| **Domínio-base** | O que o aluno já conhece. | Se ele não conhece, a analogia não funciona — verifique antes. |
| **Mapeamento relacional** | Tabela explícita: o que corresponde a o quê. **Relações, não aparências.** | A etiqueta ("é tipo uma boneca russa") entrega a imagem e retém a mecânica, que é a parte que ensina. |
| **Onde quebra** | O ponto em que a estrutura-base para de corresponder à estrutura-alvo. | Analogia sem fronteira declarada é concepção errada agendada. Declare **antes** que o aluno tropece. |
| **Registro por aluno** | `funcionou` / `não funcionou` / `fronteira já declarada`, gravado em `what_worked` / `what_didnt_work`. | Só com evidência: o aluno acertou uma **previsão num caso novo**. Impressão não conta. |

Cada entrada traz também uma **pergunta de teste** — é a previsão de caso novo que verifica se a analogia pegou. Não peça ao aluno para repetir a analogia; peça para usá-la.

---

## Índice rápido

| Conceito-alvo | Domínio-base |
|---|---|
| Variável | Etiqueta adesiva colada num objeto |
| Referência / aliasing | Endereço anotado num papel |
| Recursão | Perguntar a quem está um degrau acima |
| Pilha de chamadas | Pilha de pratos na pia |
| Complexidade (Big-O) | O que acontece quando a turma dobra |
| Função | Máquina de café com botões |
| Lista e índice | Corredor de armários numerados |
| Dicionário / hash | Guarda-volumes com número calculado pelo nome |
| Tipos | Formato do plugue |
| Módulo (`%`) | Relógio de ponteiros |
| Derivada | Velocímetro |
| Integral | Banheira enchendo com vazão variável |
| Matriz / transformação linear | Lençol quadriculado esticado |
| Probabilidade | 1.000 pessoas numa praça |
| Logaritmo | Quantas vezes dá para dividir ao meio |
| Exponencial / juros compostos | Bactérias que se dividem |

---

## Programação

### Variável

**Domínio-base:** etiqueta adesiva colada num objeto (**não** uma caixa que guarda o valor).

| Etiqueta | Variável |
|---|---|
| O papelzinho com o nome escrito | O nome da variável |
| O objeto em que a etiqueta está colada | O valor |
| Descolar a etiqueta e colar em outro objeto | Atribuir outro valor |
| Duas etiquetas no mesmo objeto | Dois nomes, um valor só |

**Onde quebra:** em linguagens com semântica de valor para tipos primitivos (`int` em C, Java, Go), atribuir realmente **copia** — ali a velha "caixa" descreve melhor. E a etiqueta não modela escopo: ela não deixa de existir sozinha ao sair de um bloco.

**Pergunta de teste:** "Se eu colo duas etiquetas no mesmo objeto e depois pinto o objeto de vermelho, o que a segunda etiqueta enxerga?"

---

### Referência / aliasing

**Domínio-base:** um endereço anotado num papel — o papel não é a casa.

| Papel com endereço | Referência |
|---|---|
| A casa | O objeto na memória |
| Copiar o papel para outra pessoa | Passar a referência (`b = a`, argumento de função) |
| Reformar a casa | Mutar o objeto — **todo mundo que tem o endereço vê** |
| Rasurar o papel e escrever outro endereço | Reatribuir a variável — os outros papéis continuam apontando para a casa antiga |
| Papel em branco | `None` / `null` |

**Onde quebra:** aritmética de ponteiro ("endereço + 1 é a casa vizinha") só vale em C/C++ e pressupõe rua contígua. Em linguagens com coletor de lixo o endereço nunca fica pendurado apontando para uma casa demolida — em C, fica. E o modelo de *ownership*/*borrow* do Rust não cabe aqui.

**Pergunta de teste:** "Você me deu o endereço da sua casa e eu pintei a fachada. Você chega em casa: qual cor você vê? E se, em vez disso, eu tivesse rasurado o meu papel e escrito outro endereço?"

---

### Recursão

**Domínio-base:** descobrir quantos degraus faltam perguntando a quem está um degrau acima.

| Escada | Recursão |
|---|---|
| Perguntar a quem está um degrau acima | A chamada recursiva com entrada menor |
| Somar 1 à resposta dele | Compor o resultado da subchamada |
| Quem já está no topo responde "zero" sem perguntar a ninguém | O caso base |
| Confiar na resposta do vizinho sem conferir | O salto de fé: assumir que a subchamada resolve o subproblema |

**Onde quebra:** as pessoas da escada trabalham em paralelo e se lembram umas das outras; a recursão real é serial e cada nível tem estado próprio isolado. A analogia também não mostra o **custo de memória** (cada pergunta pendurada ocupa espaço — daí `stack overflow`) nem a recursão múltipla, em que cada pessoa pergunta a **duas** (Fibonacci, travessia de árvore).

**Pergunta de teste:** "Se ninguém no topo souber responder sem perguntar — se o topo também perguntar para cima — o que acontece?"

---

### Pilha de chamadas

**Domínio-base:** pilha de pratos na pia: só dá para mexer no de cima.

| Pilha de pratos | Call stack |
|---|---|
| Colocar um prato | Chamar uma função |
| Tirar o prato de cima | Retornar |
| O que está escrito no prato | Variáveis locais e ponto de retorno daquele frame |
| Só o prato de cima está acessível | Só o frame atual executa |
| A pilha encostar no teto | `stack overflow` |

**Onde quebra:** pratos são iguais, frames não (cada um tem tamanho e conteúdo distintos). E objetos criados dentro de uma função **não** somem quando o prato é retirado, se houver referência viva para eles — isso é o *heap*, e não é pilha. `async`/`await`, geradores e corrotinas também quebram a disciplina estritamente LIFO.

**Pergunta de teste:** "Se uma função cria uma lista e devolve essa lista, a lista sai da pia junto com o prato?"

---

### Complexidade (Big-O)

**Domínio-base:** o que acontece com o trabalho quando a turma **dobra** de tamanho.

| Turma | Complexidade |
|---|---|
| Pegar o primeiro da fila — dá igual com 10 ou 10.000 | O(1) |
| Fazer chamada nome por nome | O(n) |
| Cada aluno cumprimentar cada outro aluno | O(n²) |
| Achar um nome na lista impressa abrindo no meio e jogando metade fora | O(log n) |
| Chamada + um cumprimento geral por aluno | O(n log n) |

**Onde quebra:** Big-O ignora constantes e só descreve **crescimento assintótico**. Um O(n²) com constante minúscula ganha de um O(n log n) para n pequeno — é exatamente por isso que implementações reais de *quicksort* trocam para *insertion sort* embaixo de ~16 elementos. Também ignora memória, cache e a diferença entre pior caso e caso médio.

**Pergunta de teste:** "Se a turma dobra, o segundo caso demora o dobro. E o terceiro, quanto demora?"

---

### Função

**Domínio-base:** máquina de café com botões.

| Máquina de café | Função |
|---|---|
| O botão apertado | O argumento |
| A bebida que sai | O retorno |
| Mesmo botão, mesma bebida, sempre | Determinismo |
| Os botões que existem no painel | O domínio |
| Não precisar saber o que acontece lá dentro | Abstração |

**Onde quebra:** função de programação **não** é função matemática. Ela pode ter efeito colateral (gravar arquivo, mudar variável global) e pode depender de estado externo — `random()` e `now()` devolvem coisas diferentes com o mesmo botão. A máquina também não modela funções de várias variáveis nem funções que **retornam outra função**.

**Pergunta de teste:** "Se eu aperto o mesmo botão duas vezes e sai bebida diferente, o que isso me diz sobre essa função?"

---

### Lista e índice

**Domínio-base:** corredor de armários numerados.

| Corredor | Lista / array |
|---|---|
| Ir direto ao armário 27 sem passar pelos 26 anteriores | Acesso por índice, O(1) |
| Todos os armários têm o mesmo tamanho e ficam lado a lado | Memória contígua |
| Enfiar um armário novo no meio obriga a renumerar todos os seguintes | Inserção no meio é O(n) |

**Onde quebra:** lista ligada não tem numeração — é uma caça ao tesouro em que cada bilhete diz onde está o próximo; ali não existe "ir direto ao 27". E a numeração começa em **0**, não em 1.

**Pergunta de teste:** "Se eu preciso inserir alguém entre o armário 3 e o 4, o que acontece com o armário 900?"

---

### Dicionário / hash map

**Domínio-base:** guarda-volumes em que o número do armário é **calculado a partir do seu nome**.

| Guarda-volumes | Dicionário |
|---|---|
| Seu nome | A chave |
| A regra que transforma o nome em número de armário | A função hash |
| Ir direto ao armário calculado | Busca O(1) média |
| Duas pessoas caírem no mesmo armário | Colisão — guardam-se os dois lá dentro e confere-se o nome |

**Onde quebra:** o armário calculado **não** preserva ordem alfabética — por isso a ordem das chaves não é a ordem que você espera. E se você mudar de nome depois de guardar, o cálculo dá outro armário e o objeto some: por isso chaves precisam ser imutáveis/hasháveis (uma lista não pode ser chave).

**Pergunta de teste:** "Se você guardou algo usando o nome 'Ana' e depois mudou seu nome para 'Ana Paula', em que armário eu procuro?"

---

### Tipos

**Domínio-base:** formato do plugue e da tomada.

| Tomada | Tipo |
|---|---|
| O formato do pino | O tipo do valor |
| O plugue não entrar | Erro de tipo |
| Adaptador | Conversão / cast |
| Conferir o plugue antes de sair de casa | Tipagem estática |
| Descobrir só na hora de plugar | Tipagem dinâmica |

**Onde quebra:** um adaptador que faz o plugue entrar **não garante a voltagem certa**. `int("3")` funciona, `int("três")` explode; um cast que compila pode falhar em runtime. Tipos também carregam mais que formato (invariantes, unidades, `NonEmptyList`) — a tomada só modela encaixe.

**Pergunta de teste:** "Você achou um adaptador e o plugue entrou. Isso garante que o aparelho vai funcionar?"

---

### Módulo (`%`)

**Domínio-base:** relógio de ponteiros.

| Relógio | Aritmética modular |
|---|---|
| Dar a volta completa no mostrador | O módulo |
| 14h vira 2h | `14 % 12 == 2` |
| Contar de 12 em 12 sem mudar a posição do ponteiro | Congruência |
| Voltar ao início da fila quando passa do fim | Índice circular (`(i + 1) % n`) |

**Onde quebra:** o resto de número **negativo** difere entre linguagens (`-1 % 12` dá `11` em Python e `-1` em C/Java) — a intuição do relógio favorece a versão do Python. E o mostrador sugere 1..12, mas o módulo produz 0..11.

**Pergunta de teste:** "São 22h. Que horas serão daqui a 5 horas? Como você calculou isso sem contar hora a hora?"

---

## Matemática

### Derivada

**Domínio-base:** velocímetro do carro.

| Carro | Derivada |
|---|---|
| A posição na estrada | `f(x)` |
| O velocímetro | `f'(x)` |
| Velocímetro em zero | Ponto crítico (topo ou vale) |
| Pisar no acelerador vs. no freio | Segunda derivada (concavidade) |
| O hodômetro somando o percurso | A integral (relação inversa) |

**Onde quebra:** o velocímetro do carro é sempre positivo — a derivada tem **sinal** (a ré é derivada negativa). E ele sugere que sempre existe uma velocidade instantânea: há funções não deriváveis, como `|x|` em zero, que corresponderia a um carro invertendo o sentido instantaneamente, sem desacelerar — o que não acontece fisicamente. Derivada parcial em várias variáveis também não cabe no painel.

**Pergunta de teste:** "O velocímetro marca zero por um instante. O carro chegou no fim da estrada, ou pode ser outra coisa?"

---

### Integral

**Domínio-base:** banheira enchendo com uma torneira de vazão variável.

| Banheira | Integral |
|---|---|
| A vazão em cada instante | `f(t)` |
| O volume acumulado até agora | `∫ f(t) dt` |
| Abrir mais a torneira num trecho | Área maior naquele intervalo |
| O nível que já havia antes de você começar | A constante de integração |
| Abrir o ralo | Vazão negativa — o acumulado **diminui** |

**Onde quebra:** banheira real não tem volume negativo, e "área embaixo da curva" engana quando a curva está abaixo do eixo — ali a contribuição é negativa e pode cancelar a positiva (a integral de um seno num período completo é zero, apesar de haver muita "área"). A constante de integração é a parte que todo mundo esquece justamente porque ninguém pensa na banheira já com água.

**Pergunta de teste:** "Se eu abro o ralo na metade do tempo, a integral no fim pode dar zero? Como?"

---

### Matriz / transformação linear

**Domínio-base:** um lençol quadriculado (o plano) sendo esticado, girado ou espelhado — sem rasgar, e com o centro pregado no lugar.

| Lençol | Matriz |
|---|---|
| Para onde vai o quadradinho da direita e o de cima | As **colunas** da matriz (imagens dos vetores da base) |
| Puxar o lençol e ver para onde um ponto foi parar | Multiplicar matriz por vetor |
| Quanto a área de um quadradinho mudou | O determinante |
| O lençol ter sido virado do avesso | Determinante negativo |
| O lençol achatado numa única linha | Determinante zero — informação perdida, não há inversa |
| Esticar e depois girar ≠ girar e depois esticar | Multiplicação de matrizes não comuta |

**Onde quebra:** só vale para transformações **lineares** — o centro fica pregado, e as linhas da grade continuam paralelas e igualmente espaçadas. Translação **não** é uma matriz nesse sentido (precisa de coordenadas homogêneas). E matriz não quadrada muda a dimensão: o lençol vira outra coisa, não um lençol esticado.

**Pergunta de teste:** "Se depois de esticar o lençol dois pontos diferentes foram parar no mesmo lugar, o que isso diz sobre desfazer a transformação?"

---

### Probabilidade

**Domínio-base:** 1.000 pessoas numa praça (frequências naturais, não porcentagens).

| Praça | Probabilidade |
|---|---|
| Quantas das 1.000 pessoas têm a característica | `P(A)` |
| Contar só dentro do grupo que já tem B | `P(A\|B)` — probabilidade condicional |
| A proporção dentro do grupo B ser igual à do total | Independência |
| Confundir "dos doentes, quantos testaram positivo" com "dos positivos, quantos estão doentes" | A confusão de taxa-base |

**Onde quebra:** evento único e não repetível (chover amanhã, esta startup vingar) não tem 1.000 repetições reais — ali a leitura é de crença (bayesiana), não de frequência. E a praça sugere sorteio independente: não vale para amostragem sem reposição nem para eventos correlacionados.

**Pergunta de teste:** "De 1.000 pessoas, 10 têm a doença. O teste acerta 99% das vezes. Entre os que testaram positivo, quantos você espera que realmente estejam doentes?"

---

### Logaritmo

**Domínio-base:** quantas vezes dá para dividir ao meio (ou por 10) até sobrar 1.

| Divisões | Logaritmo |
|---|---|
| Quantas vezes dividir por 2 até sobrar 1 | `log₂ n` |
| Quantos dígitos o número tem, menos 1 | `log₁₀ n` |
| Cada divisão ao meio na busca binária | Por que a busca binária é O(log n) |
| Somar contagens em vez de multiplicar números | `log(ab) = log a + log b` — a régua de cálculo, o decibel, o pH |

**Onde quebra:** "quantas divisões ao meio" só é exato para potências de 2 — para o resto o valor é fracionário, e a contagem inteira é o *teto* ou o *piso*. Números entre 0 e 1 dão logaritmo **negativo**, o que a intuição de contagem não cobre, e `log 0` não existe.

**Pergunta de teste:** "Uma lista tem 1.000.000 de itens. Quantas vezes a busca binária divide ao meio antes de sobrar um só? Por que não é 500.000?"

---

### Exponencial / juros compostos

**Domínio-base:** bactérias que se dividem — cada filha também se divide.

| Bactérias | Exponencial |
|---|---|
| Cada uma vira duas no mesmo intervalo | Base 2, tempo de duplicação |
| O crescimento ser proporcional ao tamanho atual | A propriedade que define a exponencial |
| As filhas passarem a se dividir também | Os juros passarem a render juros |
| Nada acontecer por muito tempo e então explodir | A ilusão de "começou agora" |

**Onde quebra:** crescimento exponencial real sempre bate num limite (comida, espaço, mercado) e vira curva logística — a colônia não cobre o planeta. E a analogia de "somar" engana no financeiro: 12% ao ano **não** é 1% ao mês, porque a composição não é soma.

**Pergunta de teste:** "A colônia dobra a cada hora e enche o pote em 24 horas. Em que hora ele estava pela metade?"

---

## Como o banco cresce

**Quando adicionar uma entrada nova aqui:**
1. A analogia **passou no teste de previsão** com pelo menos um aluno (ele usou a analogia para acertar um caso novo, não para repeti-la de volta);
2. O conceito-alvo ainda não tem entrada, **ou** o domínio-base novo cobre um registro genuinamente diferente (corporal, esportivo, culinário, musical) que amplia o alcance;
3. A entrada só entra **com a fronteira já escrita**. Analogia sem "onde quebra" não é adicionada — o campo é obrigatório, não opcional.

**O que fica no perfil do aluno, não aqui:** quais analogias funcionaram para ele (`what_worked`), quais confundiram (`what_didnt_work`) e quais fronteiras já foram declaradas para ele. Esse registro volta ao ensino na escolha do domínio-base: **antes de abrir este banco, o tutor consulta o repertório já validado daquele aluno**, e só cai aqui quando não há repertório conhecido para o conceito.

**Quando uma analogia falha:** registre em `what_didnt_work` com o motivo observado (o aluno não conhecia o domínio-base? esticou a analogia? o mapeamento tinha duas relações demais?) e **troque de domínio-base**, não de redação. Repetir a mesma analogia com outras palavras é a forma mais comum de perder uma sessão inteira.

**Limite de uso:** uma analogia ativa por conceito por sessão. Para trocar, aposente a primeira explicitamente antes de introduzir a segunda.

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-E08 | Quando o tutor declara a fronteira ("onde a analogia quebra")? | (a) junto com a introdução, sempre; (b) no momento do teste de previsão, ou na primeira vez que o aluno encostar no limite — o que vier antes; (c) só quando o aluno erra por causa dela | (b) — declarar tudo na introdução sobrecarrega o novato com uma exceção antes de ele ter a regra; esperar o erro é implantar a concepção errada de propósito | moderate |
| D-E10 | As analogias que funcionaram ficam por aluno ou promovem para o banco global? | (a) só no perfil do aluno; (b) promoção manual, quando o usuário aprovar; (c) promoção automática após funcionar com 1 aluno | (b) — o banco global é fallback compartilhado e não deve inchar com domínios idiossincráticos de uma pessoa | cheap |
| D-E11 | O tutor pode inventar analogia fora do banco na hora? | (a) sim, livremente, sem registrar; (b) sim, e registra no perfil com a fronteira declarada; (c) não, só usa o banco | (b) — a analogia do repertório do aluno é a mais eficaz e quase nunca está no banco; o registro é o que a torna reutilizável | cheap |
