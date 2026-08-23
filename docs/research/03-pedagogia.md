# Pesquisa: base pedagógica de um tutor LLM que ensina programação e matemática através de código

> Escopo: fundamentos de aprendizagem para uma skill de estudo que (a) traduz matemática em código executável, (b) usa analogias, (c) mantém tom de bate-papo, (d) dá dicas graduadas em vez de respostas prontas, (e) rastreia proficiência e agenda revisão. Cada princípio é seguido de um bloco `> Implicação operacional` que diz o que o `study-method` deve fazer na prática. Afirmações são marcadas **FATO VERIFICADO (fonte)** quando confirmadas por busca nesta sessão, ou **INFERÊNCIA** quando é síntese/extrapolação razoável não diretamente citada na literatura levantada.

---

## 1. Construcionismo (Seymour Papert): programar é um jeito de pensar, não só de produzir

### 1.1 A tese central

Papert (aluno de Piaget) cunhou **construcionismo** como uma virada sobre o construtivismo piagetiano: conhecimento não é transmitido, é construído pelo aprendiz — e essa construção é **especialmente potente quando o aprendiz constrói simultaneamente um artefato externo, compartilhável e testável** (um programa, um desenho, um jogo, uma prova) que materializa a ideia interna. **FATO VERIFICADO (fonte):** essa é a definição-padrão de constructionism atribuída a Papert, contrastada com "instructionism" (Wikipedia/EBSCO Research Starters, *Constructionism (learning theory)*; *Mindstorms (book)*, Wikipedia).

O argumento epistemológico para "matemática via código" é mais forte do que "é mais divertido": prosa e quadro-negro toleram um grau de vagueza que o intérprete de uma linguagem não tolera. Quando o aluno tenta *fazer o computador* calcular uma derivada, simular uma órbita ou verificar uma prova por indução, ele é forçado a tornar cada passo do raciocínio **explícito, ordenado e sintaticamente correto** — não há espaço para "mais ou menos entendi". Um exemplo concreto: um aluno pode dizer que "entende" juros compostos e recitar a fórmula, mas só escrevendo a função `montante(principal, taxa, periodos)` e testando com valores conhecidos (ex.: aplicar 100 a 10% por 2 períodos e conferir se dá 121) ele descobre se confundiu taxa por período com taxa total, se errou o expoente, ou se só decorou a fórmula sem entender por que ela cresce geometricamente. O compilador/interpretador é um crítico neutro e implacável: ele não julga o aluno, só recusa o que está mal-formado — isso separa "eu entendi o conceito" de "eu consigo operacionalizá-lo", que é exatamente a lacuna que costuma existir quando matemática é ensinada só no quadro.

### 1.2 "O computador como tutee" (aluno, não professor) e raciocínio body-syntonic

Papert inverteu a metáfora dominante ("computador ensina a criança") para "**a criança ensina o computador**" — programar em Logo é literalmente instruir uma máquina burra e explícita, e os bugs do programa são o espelho fiel dos buracos no próprio raciocínio do aluno, não uma nota de reprovação vinda de fora. **FATO VERIFICADO (fonte):** essa leitura de Papert — computador como objeto que o aluno ensina, e não instrumento que ensina o aluno — está documentada em múltiplas fontes secundárias sobre Mindstorms e em revisões acadêmicas do legado de Papert (warwick.ac.uk, *Mindstorms Revisited*; EBSCO Research Starters).

Um segundo mecanismo, complementar, é o que Papert chamou de raciocínio **"body-syntonic"**: a Turtle se move da mesma forma que o corpo do aluno se move ("ande para frente", "vire 90 graus"), então a criança consegue prever e raciocinar sobre o comportamento da Turtle imaginando o que ela mesma faria se fosse a Turtle — por exemplo, andando fisicamente em círculo para descobrir o padrão de comandos que desenha um círculo, e só depois traduzindo isso em código. **FATO VERIFICADO (fonte)** (runestone.academy, "Teacher Note: Body Syntonic"; medium.com, "What is it like to be a turtle?"). Isso generaliza além da Turtle: qualquer conceito que possa ser primeiro simulado com o corpo, com objetos físicos ou com uma intuição espacial concreta, antes de virar código, reduz a carga de abstrair "a frio".

Consequência de design direta: um erro de código não é "você errou", é "o computador ainda não entendeu o que você quis dizer" — um reposicionamento emocional que tira a vergonha da equação.

### 1.3 Logo/Turtle e "objects-to-think-with"

A Turtle Graphics de Papert é o exemplo canônico de **"object-to-think-with"**: um objeto concreto e manipulável (uma tartaruga com posição e direção, que anda e gira) que serve de ponte entre a intuição corporal da criança e um conceito matemático abstrato (ângulo, vetor, sistema de coordenadas, recursão em espirais). **FATO VERIFICADO (fonte):** Papert descreve a Turtle explicitamente como "an object-to-think-with" (courses.csail.mit.edu/gentner via citação cruzada; warwick.ac.uk *Mindstorms Revisited*).

A ideia central de "objects-to-think-with" generaliza: qualquer representação intermediária — um `print` de estado, um gráfico de uma função, uma animação passo a passo de um algoritmo de ordenação, uma tabela de valores de uma recorrência — funciona como Turtle funcionava, contanto que seja manipulável pelo aluno e dê feedback imediato e visível sobre o efeito de cada mudança.

### 1.4 "Hard fun"

Frase de Papert originada de uma criança na Gardner Academy que descreveu o trabalho com Logo como "fun (fun), this is difficult (hard)". Papert observou que a criança chamou o trabalho de divertido **porque** era difícil, não **apesar de** ser difícil — captando a ideia de que dificuldade bem calibrada, dentro de um domínio que o aluno escolheu e controla, é prazerosa, e dificuldade arbitrária/imposta não é. **FATO VERIFICADO (fonte)** (dailypapert.com, "Hard Fun"; sudonull.com).

Isso é diferente de "gamificação" superficial (pontos, emblemas): o "hard fun" de Papert vem do domínio real de uma ferramenta poderosa, não de recompensas extrínsecas coladas por cima.

> **Implicação operacional para o study-method:** todo conceito matemático ensinável deve, sempre que possível, ganhar uma tradução em código executável e manipulável pelo aluno (um "object-to-think-with": uma função pequena, uma simulação, uma tabela de valores) — não apenas uma explicação em prosa. Bugs devem ser enquadrados na comunicação como "o programa ainda não entendeu", nunca como falha pessoal. Quando fizer sentido, sugerir uma intuição física/espacial antes do código ("imagina que você está andando..."). A dificuldade da tarefa deve ser ajustável e escolhida dentro do domínio do aluno, não imposta de forma arbitrária.

### 1.5 A crítica: guiado vs. descoberta pura

O contraponto mais citado ao espírito "deixe o aluno explorar e construir" é Kirschner, Sweller & Clark (2006), *"Why Minimal Guidance During Instruction Does Not Work: An Analysis of the Failure of Constructivist, Discovery, Problem-Based, Experiential, and Inquiry-Based Teaching"* (Educational Psychologist, 41(2), 75–86). **FATO VERIFICADO (fonte)** (múltiplas fontes acadêmicas convergentes: tandfonline.com, scispace.com, itgs.ict.usc.edu — PDF do artigo original hospedado pela USC).

Argumento central do artigo: instrução com **pouca ou nenhuma orientação** é sistematicamente inferior, em décadas de estudos empíricos, a instrução com **forte orientação do processo de aprendizagem**, porque ignora a arquitetura cognitiva humana — especificamente os limites severos da memória de trabalho quando o aluno precisa, ao mesmo tempo, (a) resolver o problema e (b) descobrir o método de resolução do zero. Achado-chave, e o mais relevante para um tutor adaptativo: **"a vantagem da orientação só começa a recuar quando o aluno já tem conhecimento prévio suficiente para fornecer orientação 'interna'"** — ou seja, o efeito é moderado pelo nível de expertise (ver seção 3, expertise reversal effect).

Essa crítica não passou sem resposta. Hmelo-Silver, Duncan & Chinn (2007), *"Scaffolding and Achievement in Problem-Based and Inquiry Learning: A Response to Kirschner, Sweller, and Clark (2006)"* (Educational Psychologist, 42, 99–107), argumentam que Kirschner et al. **confundiram** PBL/aprendizagem por investigação com "descoberta pura sem andaime" — na prática, PBL bem implementado usa andaimes (scaffolding) pesados que reduzem a carga cognitiva, não a ausência de orientação. Os autores sustentam que PBL e aprendizagem por investigação bem desenhadas endereçam objetivos que vão além do conteúdo puro (práticas epistêmicas, colaboração, autorregulação), e que o andaime — não a ausência dele — é o ingrediente que faz essas abordagens funcionarem. **FATO VERIFICADO (fonte)** (scirp.org, sfu.ca — PDF do artigo, tandfonline.com).

**Os dois lados, honestamente:**
- Kirschner/Sweller/Clark têm razão empírica sobre **descoberta sem qualquer estrutura** (jogar o aluno num problema aberto e esperar que ele reinvente o conceito): isso mede mal, sobrecarrega a memória de trabalho do novato, e a evidência agregada favorece instrução guiada para quem tem pouco conhecimento prévio.
- Papert nunca defendeu isso literalmente: Logo é uma linguagem **desenhada** para dar feedback imediato e concreto (a Turtle já é um andaime cognitivo — "pense com seu corpo"), o professor tem papel ativo, e os microworlds são estruturados. O verdadeiro construcionismo é "descoberta com andaime pesado embutido no material", não "jogue o aluno no vazio".
- O ponto de divergência real, então, não é "guiar vs. não guiar" — é **quanto** de estrutura, **quando** retirá-la, e se o andaime está no material (bom) ou só na cabeça do professor torcendo para que emerja sozinho (ruim).

> **Implicação operacional para o study-method:** nunca jogar o aluno num problema aberto sem andaime nenhum ("resolve aí, descobre sozinho") — isso é a falha empiricamente demonstrada da descoberta pura. Em vez disso: dar sempre um "microworld" mínimo (um template de código rodável, um exemplo parecido resolvido, uma pergunta que restringe o espaço de busca) e retirar esse andaime progressivamente conforme o histórico de acertos do aluno sobe (ver seções 3 e 6). A régua é o "assistance dilemma" da seção 5.4, não um extremo ou outro.

### 1.6 A crítica empírica ao "transfer" automático (Pea & Kurland) e o que a meta-análise moderna diz

Um segundo eixo de crítica, complementar ao de Kirschner/Sweller/Clark, ataca uma promessa mais específica que rondou o construcionismo nos anos 1980: a ideia de que aprender a programar (em particular, aprender Logo) treinaria "habilidades de pensamento" gerais — planejamento, raciocínio, resolução de problemas — que transfeririam automaticamente para fora da programação. **Correção de atribuição**: o estudo empírico que testou isso e **não encontrou** a transferência esperada é Pea & Kurland (1984), *Technical Report No. 16, "Logo Programming and the Development of Planning Skills"* — não o artigo *"On the Cognitive Effects of Learning Computer Programming: A Critical Look"* (New Ideas in Psychology, 1984), que é uma **revisão teórica/crítica** dos mesmos autores e ano, não um estudo empírico. O Technical Report No. 16 documenta dois estudos de um ano com crianças programando em Logo (grupos experimentais de 8-9 e 11-12 anos contra grupos controle da mesma faixa), concluindo que "learning to program did not differentiate experimental from control group performances" em nenhum dos dois estudos — ou seja, habilidades de planejamento não melhoraram de forma detectável. O exemplo do comando `REPEAT` (uma criança que usou `REPEAT` para imprimir o próprio nome repetidamente, mas não reconheceu que o mesmo padrão se aplicava a um programa para desenhar um quadrado) é citado na literatura sobre esse mesmo corpo de pesquisa como ilustração de que nem a transferência *dentro* da própria programação aconteceu de forma automática, quanto mais a transferência para fora do domínio. **FATO VERIFICADO (fonte)** (registro ERIC do Technical Report No. 16, Pea, Roy D.; Kurland, D. Midian, 1984, confirmado nesta sessão; eclass.uoa.gr — PDF de um artigo relacionado dos mesmos autores; pmc.ncbi.nlm.nih.gov, revisão citando o achado).

A literatura mais recente é mais matizada, nem confirmando o otimismo original de Papert nem o pessimismo total de Pea & Kurland. Scherer, Siddiq & Viveros (2019), *"The Cognitive Benefits of Learning Computer Programming: A Meta-Analysis of Transfer Effects"* (Journal of Educational Psychology), agregando 105 estudos e 539 tamanhos de efeito, encontraram um efeito de transferência geral **moderado** (g ≈ 0,49), com efeito **forte para transferência próxima** (habilidades parecidas com o que foi praticado) e **moderado para transferência distante** (habilidades bem diferentes) — e o padrão por domínio importa: pensamento criativo, habilidades matemáticas e metacognição tiveram os maiores ganhos, seguidos de habilidades espaciais e raciocínio; desempenho escolar geral e literacia foram os que menos se beneficiaram. **FATO VERIFICADO (fonte)** (eric.ed.gov; researchgate.net; gwern.net — PDF do artigo).

**A leitura honesta, cruzando os dois achados**: programar não é uma vacina geral contra o não-saber-pensar (o otimismo original de que Logo por si só ensinaria "pensamento" foi refutado empiricamente por Pea & Kurland), mas também não é um investimento isolado sem retorno fora de si mesmo (a meta-análise de 2019 mostra transferência real, especialmente para o que está estruturalmente próximo — e matemática está entre os domínios com melhor transferência, o que é uma boa notícia específica para um tutor que liga matemática a código). A transferência não é automática nem geral — ela precisa ser **ensinada explicitamente**, apontando a ponte entre o que foi praticado em código e o problema de matemática (ou de outro domínio) ao qual se quer aplicar; esperar que ela "aconteça sozinha" porque o aluno "programou bastante" é exatamente o erro que Pea & Kurland documentaram.

> **Implicação operacional para o study-method:** nunca assumir que resolver um exercício de código ensina, por si só, o princípio matemático subjacente de forma transferível — o tutor deve fechar o ciclo explicitamente, perguntando ou apontando como o padrão de código se conecta a um problema de matemática (ou vice-versa) diferente do que acabou de ser resolvido. Priorizar matemática e pensamento criativo/metacognição como áreas de aplicação (onde a evidência de transferência é mais forte) e não prometer, na comunicação com o aluno, que "programar" sozinho desenvolve "raciocínio lógico geral" sem essa ponte explícita.

---

## 2. Analogia como mecanismo cognitivo

### 2.1 Structure-mapping theory (Gentner)

Dedre Gentner propôs a **structure-mapping theory (SMT)**: uma analogia é um mapeamento *relacional* entre um domínio-base (o que o aluno já conhece) e um domínio-alvo (o que está aprendendo), no qual o que importa não são os atributos superficiais dos objetos, mas o **sistema de relações** entre eles. **FATO VERIFICADO (fonte)** (courses.csail.mit.edu — PDF de Gentner & Markman; semanticscholar.org).

Três princípios-chave da SMT relevantes para ensino:
- **Similaridade relacional > similaridade de objeto**: uma boa analogia mapeia *relações* ("X restringe Y da mesma forma que A restringe B"), não aparência ("os dois são redondos"). Uma analogia que só compartilha atributos superficiais não carrega poder explicativo.
- **Consistência estrutural**: o mapeamento precisa ser um-para-um e preservar as conexões entre relações, não misturar correspondências.
- **Sistematicidade**: mapeamentos que alinham **sistemas conectados** de relações (não relações isoladas) pesam mais e generalizam melhor.

Exemplo concreto da diferença entre mapeamento superficial e relacional, aplicado a recursão: dizer "recursão é tipo bonecas russas (matrioskas)" é uma analogia de **objeto** (ambos têm "coisas dentro de coisas") que não carrega a relação funcional certa — matrioskas não fazem nada, só se encaixam. Uma analogia **relacional** melhor é: "uma função recursiva é como pedir a um assistente para resolver uma tarefa te delegando a mesma tarefa, só que menor, e confiando na resposta dele para montar a sua — exatamente como você resolveria 'quantos degraus até o topo escada' perguntando a alguém um degrau acima 'quantos degraus até o topo *daí*' e somando 1". Essa segunda analogia mapeia a *relação* central (o problema se resolve delegando uma versão menor de si mesmo e compondo o resultado) — é isso que sistematicidade prediz que vai transferir melhor para o próximo problema recursivo, porque o aluno carrega a relação, não apenas a imagem.

### 2.2 Quando a analogia atrapalha: transferência negativa

Toda analogia é uma mentira parcial por construção — ela é útil exatamente até o ponto em que a estrutura-base para de corresponder à estrutura-alvo, e o aluno que não sabe onde fica esse limite estica a analogia longe demais e absorve uma concepção errada que o próprio ensino implantou. O exemplo mais estudado é a analogia de **corrente elétrica como fluxo de água**, num circuito: ela funciona bem para "corrente é conservada" e "resistência restringe o fluxo", mas leva alunos a concluir, por exemplo, que **corrente é "consumida"** ao longo do circuito (a lâmpada B recebe menos porque a lâmpada A já "gastou" parte da água) — uma concepção fisicamente errada, mas coerente *dentro* da lógica da analogia esticada demais. **FATO VERIFICADO (fonte)** (hyperphysics.phy-astr.gsu.edu, "What's Wrong with the Water Circuit Analogy?"; wiki.restarters.net; ResearchGate sobre analogias de circuito elétrico).

O mecanismo geral é chamado **transferência negativa**: aprendizado em um contexto interfere negativamente na performance em outro contexto, tipicamente nos estágios iniciais de aprendizagem em um domínio novo — a mente aplica por default a estrutura que já conhece bem, mesmo quando ela não se encaixa. **FATO VERIFICADO (fonte)**, com a ressalva de que a fonte consultada foi de divulgação/síntese, não o paper primário de transferência negativa.

Em programação, o equivalente é comum: um aluno que aprendeu "variável é uma caixa que guarda um valor" (analogia de objeto, útil no início) tende a esticá-la para concluir que `b = a` faz uma "cópia da caixa" — o que é falso para objetos mutáveis referenciados (listas, dicionários), e produz o clássico bug de "editei uma lista e a outra mudou sozinha". A analogia de "caixa" não tinha estrutura relacional para representar referência/aliasing — ela precisa ser explicitamente aposentada (ou corrigida para "etiqueta apontando para uma caixa", que é relacional) no momento em que o aluno encontra objetos mutáveis.

### 2.3 Protocolo prático: introduzir, testar, aposentar

Com base na SMT e no fenômeno de transferência negativa, um protocolo operacional de 3 passos (**INFERÊNCIA**, síntese aplicada — não há uma receita única na literatura para "protocolo de uso de analogia em tutoria"; isto é engenharia pedagógica derivada dos princípios acima):

1. **Introduzir**: apresentar a analogia junto com o mapeamento relacional explícito ("pense em X como Y: da mesma forma que [relação em Y], aqui [relação em X]") — nunca só a etiqueta ("é tipo uma lista de compras"), sempre a relação estrutural.
2. **Testar se pegou**: pedir ao aluno para *usar* a analogia para prever o comportamento de um caso novo, não pedir que ele repita a analogia de volta. Se a previsão dele erra de um jeito consistente com "esticou a analogia longe demais", isso é o sinal de transferência negativa acontecendo — hora de marcar explicitamente o limite ("aqui a analogia para de valer, porque...").
3. **Aposentar**: uma vez que o aluno resolve problemas sem precisar (re)invocar a analogia, parar de oferecê-la — repeti-la depois que deixou de ser necessária é ruído, e no nível avançado pode até confundir (ver expertise reversal effect, seção 3).

### 2.4 Por que registrar analogias que funcionaram para um aluno específico é de alto valor

Duas razões, uma teórica e uma prática:
- **Teórica**: a SMT prevê que o "domínio-base" de uma boa analogia precisa ser algo que o aluno já domina *estruturalmente* — isso é altamente idiossincrático (um aluno que joga xadrez responde bem a analogias de xadrez; um que cozinha, a analogias de receita). Não existe "a melhor analogia universal para recursão" — existe a melhor analogia **para aquele aluno**, dado o que ele já sabe bem.
- **Prática**: uma analogia que já foi testada e comprovadamente "pegou" com um aluno é um ativo reutilizável de baixo custo e alto retorno — reaproveitá-la para o próximo conceito relacionado economiza o trabalho de descoberta e aumenta a chance de sucesso, porque o domínio-base já está validado como conhecido e estruturalmente rico para aquela pessoa. **INFERÊNCIA** aplicada a partir da SMT; não há um estudo citando literalmente "banco de analogias por aluno", mas decorre diretamente da teoria.

> **Implicação operacional para o study-method:** manter um "banco de analogias" persistido por aluno (o analogy-bank mencionado no handoff): cada entrada guarda o domínio-base, o conceito-alvo, se foi testada com sucesso (o aluno usou a analogia corretamente para prever um caso novo) e se já foi "esticada" a um limite conhecido que precisa ser marcado da próxima vez. Ao introduzir uma analogia nova, o tutor deve explicitar a relação estrutural, não só a etiqueta, e sempre testar com uma pergunta preditiva antes de seguir em frente.

---

## 3. Carga cognitiva (Sweller): por que exemplos resolvidos ajudam o novato e atrapalham o avançado

### 3.1 Os três tipos de carga

Cognitive Load Theory (Sweller) modela a memória de trabalho como um recurso severamente limitado e distingue três fontes de carga durante a aprendizagem. **FATO VERIFICADO (fonte)** (link.springer.com, "Element Interactivity and Intrinsic, Extraneous, and Germane Cognitive Load"; thedecisionlab.com):

- **Intrínseca**: complexidade inerente ao próprio material (quantos elementos interagem entre si — ex.: entender ponteiros duplos exige segurar mais elementos simultâneos na cabeça do que entender uma variável simples).
- **Extrínseca**: carga desperdiçada, causada por **como** o material é apresentado (interface confusa, exemplo mal formatado, informação redundante) — é a que se pode cortar quase a zero sem perder conteúdo.
- **Germânica**: em formulações mais recentes (Sweller redefiniu isso em 2010), não é mais tratada como uma terceira fonte independente, e sim como os recursos de memória de trabalho **redirecionados para lidar com a carga intrínseca** — construção de esquema, o trabalho produtivo real de aprender.

### 3.2 Worked example effect

Para novatos, estudar **exemplos resolvidos passo a passo** produz aprendizagem melhor do que resolver o mesmo número de problemas do zero, porque libera memória de trabalho da carga extrínseca de "buscar o método por tentativa e erro" e a redireciona para entender o princípio subjacente. **FATO VERIFICADO (fonte)** (wegrowteachers.com; yukaichou.com).

### 3.3 Expertise reversal effect

O mesmo andaime que ajuda o novato **perde eficácia e pode até atrapalhar** o aluno que já tem esquema construído — a explicação detalhada vira informação redundante que o cérebro precisa processar e reconciliar com o que ele já sabe, consumindo carga de memória de trabalho à toa (mecanismo chamado **efeito de redundância**). O efeito foi sistematizado por Kalyuga, Ayres, Chandler & Sweller — revisão de 2003 (overview do efeito, estudado desde meados dos anos 1990): instrução baseada em exemplos resolvidos é eficaz para quem tem pouco ou nenhum conhecimento prévio, mas perde efetividade — e chega a prejudicar — alunos mais avançados que já têm algum conhecimento prévio; explicações textuais detalhadas, embutidas em diagramas de forma que não possam ser ignoradas, tendem a ser essenciais para novatos mas redundantes para experientes. **FATO VERIFICADO (fonte)** (en.wikipedia.org/Expertise_reversal_effect; cognitiveloadtheory.wordpress.com; scispace.com/Kalyuga).

Implicação direta e não-negociável para qualquer tutor adaptativo: **o andaime tem que encolher conforme a proficiência sobe**. Um exemplo totalmente resolvido, com toda linha comentada, para quem já domina o padrão, não é neutro — é carga extra e sinal de que o tutor não está calibrado. A implicação instrucional mais importante do efeito é justamente essa: para ser eficiente, o design instrucional precisa ser adaptado ao nível de experiência do público-alvo, e não fixo por dificuldade nominal do exercício.

> **Implicação operacional para o study-method:** o nível de detalhe do andaime (worked example completo → exemplo parcial → pista → nada) deve ser condicionado ao estado de proficiência estimado do aluno naquele conceito específico (seção 6), não fixo por dificuldade nominal do exercício. Ao ver sinais de que o aluno já domina (acerto rápido, sem dicas, em tentativas recentes), o tutor deve *ativamente reduzir* o andaime na próxima interação sobre o mesmo tópico — inclusive parando de explicar o que ele já claramente sabe, mesmo que o aluno não peça.

---

## 4. Desirable difficulties (Bjork): por que a luta produtiva ensina mais que a resposta pronta

### 4.1 O paradoxo central

**Correção de autoria**: quem cunhou o termo, sozinho, em 1994, foi **Robert A. Bjork** — não "Robert e Elizabeth Bjork" conjuntamente. O capítulo de origem é Bjork, R. A. (1994), "Memory and metamemory considerations in the training of human beings", em Metcalfe & Shimamura (orgs.), *Metacognition*, MIT Press, pp. 185-205 (autoria única, confirmada via registro bibliográfico consultado nesta sessão). Nesse capítulo, Bjork nomeou o paradoxo de que **condições que desaceleram a aquisição durante a prática costumam acelerar a retenção e a transferência de longo prazo** — "dificuldades desejáveis". O texto de **Robert e Elizabeth Bjork** citado na lista de Fontes deste documento ("Introducing Desirable Difficulties Into Practice and Instruction", structural-learning.com; unh.edu) é um trabalho **conjunto e posterior, de 2011** — que expande e aplica a ideia, mas não é a fonte que cunhou o termo. **FATO VERIFICADO (fonte)** (registro bibliográfico do capítulo de 1994; structural-learning.com; unh.edu — PDF de Bjork & Bjork 2011, "Introducing Desirable Difficulties Into Practice and Instruction").

Modelo explicativo: cada memória tem uma **força de armazenamento** (permanente, só cresce) e uma **força de recuperação** (temporária, decai). O ganho em força de armazenamento é maior justamente quando a força de recuperação está baixa — ou seja, quando você luta para lembrar algo já meio esquecido, e consegue, isso fortalece a memória muito mais do que reler o mesmo conteúdo enquanto ele ainda está fresco e fácil de recuperar. Bjork resume isso como um paradoxo de aprendizagem: as condições que produzem o melhor desempenho *durante* a prática costumam ser exatamente as condições que produzem o aprendizado *menos* durável. **FATO VERIFICADO (fonte)** (mesma fonte).

### 4.2 As três dificuldades desejáveis mais estudadas, aplicadas a código

- **Retrieval practice / testing effect**: recuperar uma informação da memória (um teste de baixo risco) fixa mais do que reler as anotações sobre ela. Em código: pedir ao aluno para escrever de memória a assinatura de uma função ou prever a saída de um trecho *antes* de rodar, em vez de só reler a documentação, é retrieval practice.
- **Spacing effect**: distribuir a prática ao longo do tempo, em vez de concentrá-la numa sessão só ("massed practice"). Em código: revisitar um conceito (ex.: recursão) em sessões separadas por dias, não repetir 20 exercícios de recursão na mesma tarde.
- **Interleaving**: misturar tipos diferentes de problema numa mesma sessão, em vez de bloquear por categoria (resolver 10 do tipo A, depois 10 do tipo B). Em código: intercalar um exercício de recursão, um de laços e um de manipulação de string na mesma sessão, em vez de fazer um bloco homogêneo de cada — isso força o aluno a *identificar* qual técnica se aplica antes de aplicá-la, que é justamente a habilidade que blocos homogêneos não treinam (quando todos os exercícios da sessão são do mesmo tipo, o aluno já sabe de antemão qual técnica usar, então nunca pratica a decisão).

Essas são exatamente as dificuldades citadas na literatura consultada como "as três primárias" (structural-learning.com; researchschool.org.uk). **FATO VERIFICADO (fonte)**.

### 4.3 O limite: quando a dificuldade vira frustração

A própria literatura de Bjork enfatiza que **nem toda dificuldade é desejável** — só é desejável a dificuldade que o aluno tem recursos (conhecimento prévio, motivação, tempo) para superar sozinho ou quase sozinho; dificuldade além da capacidade do aluno de "reparar" o próprio erro não gera aprendizagem, gera desistência. Esse é exatamente o mesmo território do "assistance dilemma" (seção 5.4): reter ajuda demais leva a aprendizado raso; reter ajuda de menos leva a frustração e tempo perdido sem progresso. **INFERÊNCIA** direta e amplamente aceita a partir da literatura de Bjork e do assistance dilemma — a fonte consultada nesta sessão não fixa um limiar numérico universal para "quando vira frustração" (não existe esse número mágico na literatura; qualquer limiar concreto de tempo/tentativas é uma escolha de produto, não um achado empírico).

> **Implicação operacional para o study-method:** o tutor deve preferir ativamente perguntar "o que você acha que este código faz?" antes de explicar, aplicar revisão espaçada real (seção 7) em vez de reler o mesmo material, e intercalar tópicos relacionados em vez de bloquear ("faça 10 exercícios de recursão seguidos"). Mas deve monitorar sinais de frustração real (muitas tentativas falhas seguidas, tempo parado, linguagem de desistência) e nesses casos subir a escada de dicas mais rápido (seção 10) — dificuldade desejável vira indesejável quando o aluno para de progredir, não quando ele erra uma vez.

---

## 5. Tutoria socrática vs. instrução direta

### 5.1 O "2 sigma problem" de Bloom: o que ele realmente disse

Benjamin Bloom (1984) reportou que o aluno médio tutorado 1:1 com mastery learning teve desempenho **2,0 desvios-padrão acima** da turma controle instruída convencionalmente ("acima de 98% dos alunos da turma controle") — comparação baseada em duas dissertações orientadas por Bloom (Anania e Burke). **FATO VERIFICADO (fonte)** (en.wikipedia.org/Bloom%27s_2_sigma_problem).

### 5.2 O que a literatura moderna diz — e por que o "2,0" é frequentemente mal citado

Esse número **não replicou** em meta-análises subsequentes maiores e mais rigorosas:

- **VanLehn (2011)**, meta-análise amplamente citada comparando tutoria humana, sistemas tutores inteligentes (ITS) e ausência de tutoria: tutoria humana ficou em **d ≈ 0,79** (não 2,0); ITS "step-based" (que exigem raciocínio passo a passo, não só resposta final) chegaram a **d ≈ 0,75**, quase equivalentes a tutor humano; ITS "answer-based" (só avaliam resposta final) ficaram em **d ≈ 0,31**. **FATO VERIFICADO (fonte)** (nintil.com, revisão sistemática que cita VanLehn 2011; corroborado por busca direta sobre VanLehn 2011).
- Uma revisão sistemática independente (nintil.com, "On Bloom's two sigma problem") recalculou os efeitos de mastery learning a partir da literatura ampla: **d ≈ 0,4–0,52** na população geral, subindo para **d ≈ 0,61** em alunos de **baixo desempenho** ("less able students", Kulik, Kulik & Bangert-Drowns, 1990 — **correção**: o estudo original fala em desempenho/habilidade, não em renda) contra **d ≈ 0,4** em alunos de desempenho mais alto ("more able students"), mas caindo para **d ≈ 0,08** (efeito desprezível) quando medido só por testes padronizados independentes em vez de testes desenhados pelos próprios pesquisadores do estudo. Também aponta um efeito de "fade-out" ao longo do tempo, além de um confundidor de tempo de instrução (mastery learning costuma exigir mais tempo total de instrução, e quando isso é controlado o efeito encolhe). **FATO VERIFICADO (fonte)** (nintil.com, citando Kulik, Kulik & Bangert-Drowns, 1990 — confirmado via fonte secundária consultada nesta sessão).
- **Separadamente, e sem misturar com o recálculo acima**: Cheung & Slavin (2016) estudaram, de forma **geral, sobre 645 estudos de intervenção educacional de todas as áreas** (não uma análise específica de mastery learning), quais características metodológicas se correlacionam com o tamanho do efeito reportado. O maior fator encontrado é o tamanho da amostra: estudos com amostra pequena (<100) reportam efeito médio de **d≈0,38**, contra **d≈0,11** em estudos com amostra grande (>2000, tipicamente RCTs). Esse é um viés de medição **geral da pesquisa educacional** — a revisão de mastery learning apenas cita esse achado como precedente de que "estudos pequenos inflam o efeito", não como um recálculo do efeito de mastery learning especificamente. O documento anteriormente apresentava esse par de números como se fosse parte do recálculo de mastery learning; essa atribuição estava incorreta. **FATO VERIFICADO (fonte)** (nintil.com, citando Cheung & Slavin 2016 — confirmado via fonte secundária consultada nesta sessão).
- **Kulik & Fletcher (2016)**, meta-análise de 50 avaliações controladas de sistemas de tutoria inteligente: efeito mediano de **0,66 desvio-padrão** sobre instrução convencional (do percentil 50 ao percentil 75) — e nota que o tamanho do efeito depende fortemente de o teste de avaliação ser desenhado localmente pelos pesquisadores (efeitos maiores) ou padronizado (efeitos menores), reforçando o mesmo viés de medição encontrado na revisão de mastery learning. **FATO VERIFICADO (fonte)** (journals.sagepub.com; eric.ed.gov).

**Conclusão honesta**: o "2 sigma" de Bloom é real como *citação histórica* mas não como *estimativa confiável do efeito real* de tutoria — a estimativa mais defensável hoje, cruzando as três fontes, fica na faixa de **d ≈ 0,4 a 0,8**, dependendo muito de como a tutoria é implementada e como o aprendizado é medido. Isso ainda é um efeito grande em termos de ciência da educação (mover um aluno do percentil 50 para algo entre o 65º e o 79º), só não é o "98º percentil" frequentemente repetido de forma solta — e qualquer material de marketing ou plano de produto que cite "2 sigma" como garantia deve ser corrigido para essa faixa mais honesta.

### 5.3 Quando perguntar, quando simplesmente contar

Não encontrei, nesta pesquisa, uma citação direta e específica de VanLehn quantificando "quanto do diálogo de tutores humanos reais é socrático puro vs. direto" — marco isso como **não verificado** e não vou inventar uma cifra. O que É verificável e relevante:

- Sistemas que exigem que o aluno **raciocine pelos passos intermediários**, em vez de só produzir a resposta final, chegam perto da eficácia de tutores humanos especialistas (o contraste step-based 0,75 vs. answer-based 0,31 em VanLehn 2011 acima é exatamente essa evidência). **FATO VERIFICADO (fonte)**.
- Uma comparação formal de estilo Socrático vs. Didático em tutoria (citada como "A Comparative Evaluation of Socratic versus Didactic Tutoring", ResearchGate/Academia.edu) existe e argumenta a favor do estilo socrático — mas não consegui, no tempo desta pesquisa, extrair o tamanho de efeito exato do paper primário; cito a existência do estudo e seu resultado qualitativo (a favor do Socrático), mas o número fica **não verificado**.

Sobre "quando simplesmente contar": decorre diretamente do **assistance dilemma** (próxima seção) e do expertise reversal effect (seção 3) — perguntar (retendo informação) é melhor quando o aluno tem chance real de chegar à resposta com o conhecimento que já tem; contar diretamente é melhor quando (a) é um fato arbitrário sem estrutura para descobrir (nome de uma função de biblioteca, sintaxe de uma linguagem), ou (b) o aluno já demonstrou, na mesma sessão, que não tem o pré-requisito para chegar lá sozinho, e insistir em perguntar só produz frustração. **INFERÊNCIA** aplicada, ancorada nos dois princípios verificados.

### 5.4 O "assistance dilemma" (Koedinger & Aleven)

Koedinger e Aleven nomeiam formalmente esse trade-off como um dos "problemas fundamentais não resolvidos das ciências cognitivas e da aprendizagem": **reter ajuda demais** causa frustração e tempo perdido; **dar ajuda demais** causa aprendizado raso e falta de motivação para aprender sozinho. A abordagem deles em Cognitive Tutors: reter informação de solução inicialmente, e adicioná-la interativamente, só conforme necessário, via feedback sim/não, dicas explicativas e seleção dinâmica de problemas. A quantidade ótima de ajuda também depende de características do aluno específico, e não existe ainda uma fórmula geral que preveja a priori essa quantidade ótima dado o perfil do aluno — é um problema reconhecidamente aberto na área. **FATO VERIFICADO (fonte)** (cs.cmu.edu — PDF; researchgate.net; link.springer.com).

> **Implicação operacional para o study-method:** o tutor deve, por padrão, reter a resposta e abrir com uma pergunta que restrinja o espaço de busca (Socrático), subindo a ajuda apenas de acordo com a escada de dicas graduada (seção 10) — nunca pular direto para a resposta completa na primeira dificuldade. Exceção: fatos arbitrários sem estrutura descobrível (sintaxe, nomes de API) devem ser simplesmente informados, sem teatro socrático — perguntar "o que você acha que essa função se chama" não ensina nada.

---

## 6. Modelagem de proficiência

### 6.1 Bayesian Knowledge Tracing (BKT)

BKT é o algoritmo clássico usado em sistemas de tutoria inteligente para modelar o domínio do aluno sobre cada habilidade/conceito ("knowledge component"). Modela o conhecimento como uma variável latente **binária** (domina / não domina) por habilidade, num modelo de Markov oculto atualizado a cada observação (acertou/errou um passo que usa aquela habilidade). Os parâmetros centrais são: **P(L0)** (probabilidade inicial de já saber), **P(T)** (probabilidade de "aprender" a cada oportunidade), **P(guess)** (probabilidade de acertar por chute mesmo sem saber) e **P(slip)** (probabilidade de errar por descuido mesmo sabendo). **FATO VERIFICADO (fonte)** (en.wikipedia.org/Bayesian_Knowledge_Tracing; emergentmind.com).

BKT continua sendo, segundo fontes consultadas, o "motor principal" para modelagem de domínio em sistemas de tutoria inteligente, avaliação formativa e analytics educacionais, apesar de abordagens de deep learning (Deep Knowledge Tracing) oferecerem mais flexibilidade em alguns cenários — BKT é preferido quando interpretabilidade e simplicidade importam mais que a última fração de acurácia preditiva. **FATO VERIFICADO (fonte)** (emergentmind.com).

### 6.2 Uma alternativa simples, sem pseudociência, para um tutor baseado em arquivos

BKT completo exige estimar 4 parâmetros por habilidade com dados de treino — inviável para um tutor pessoal com histórico pequeno por aluno (um único aluno gera dezenas de observações por conceito, não os milhares que BKT normalmente usa para ajustar parâmetros por população). A alternativa honesta não é fingir precisão bayesiana com poucos dados, é usar **sinais observáveis diretos** e um estado discreto simples com regras explícitas e auditáveis. Isso é **INFERÊNCIA de engenharia**, não um achado da literatura, mas é a prática padrão recomendada quando dados são escassos (o próprio conceito de BKT é citado aqui só como referência de quais sinais importam — tentativa certa/errada, chute vs. descuido —, não como algoritmo a implementar de verdade).

**Sinais observáveis que um tutor LLM pode coletar por conceito**, sem inventar dado nenhum:
- **Tentativas até passar** (quantas vezes o aluno tentou até o código rodar/passar no teste).
- **Tempo gasto** na tarefa (indício de luta, não necessariamente ruim — ver desirable difficulties).
- **Dicas usadas e em que nível da escada** (seção 10) — subiu até o nível 4-5 ou resolveu no nível 1?
- **Tipo de erro** (ver seção 9: deslize pontual vs. erro sistemático/conceitual que se repete).
- **Recência**: quando foi a última vez que esse conceito apareceu.
- **Auto-relato**: o aluno disse "acho que entendi" ou "ainda não peguei bem"? (sinal fraco sozinho — sujeito a excesso de confiança — mas útil combinado com os outros).

**Estado de proficiência com 3 níveis**, atualizado por regras simples e explicáveis (não uma probabilidade oculta calculada por fórmula opaca):
- **Não sabe**: primeira exposição, ou errou/precisou de nível 4-5 de dica nas últimas 1-2 exposições.
- **Frágil**: acertou, mas com dicas de nível 2-3, ou com erro de tipo conceitual (não só deslize), ou faz tempo desde a última exposição sem revisão.
- **Domina**: acertou sem dica (nível 0-1) em pelo menos 2 exposições espaçadas no tempo (não na mesma sessão — ver seção 7), sem erro conceitual recorrente.

Exemplo concreto de conversão sinal → estado: um aluno resolve "escreva uma função recursiva para fatorial" na primeira tentativa, sem pedir dica, mas leva 40 tentativas de execução por causa de dois erros de sintaxe (deslizes, seção 9.1) — isso não rebaixa o estado, porque os erros foram deslizes, não conceituais; o estado sobe para "frágil" (ainda é a primeira exposição, falta confirmar em uma segunda ocasião espaçada) e, na próxima revisão do mesmo conceito dali a alguns dias, se ele resolver de novo sem dica, o estado sobe para "domina". Já se o mesmo aluno, no segundo encontro, esquecer o caso base e entrar em recursão infinita — um erro conceitual — o estado regride para "frágil" mesmo tendo "acertado" da primeira vez, porque o padrão de erro indica que o esquema ainda não está consolidado.

A regra de degradação também importa: proficiência não é permanente. Se um conceito marcado "domina" fica muito tempo sem ser revisitado, ele deve regredir para "frágil" antes da próxima exposição, para forçar uma checagem leve em vez de assumir que o conhecimento continua intacto (ligação direta com a curva de esquecimento e o spacing effect das seções 4 e 7).

> **Implicação operacional para o study-method:** implementar os 3 estados acima com regras explícitas e versionáveis (não uma "IA de proficiência" opaca) — cada transição de estado deve ser rastreável a um evento observável específico (esta tentativa, este nível de dica, este tipo de erro), para que o próprio aluno ou um agente futuro possa auditar por que o sistema acha que ele "domina" ou não algo. Nunca reportar um número de confiança fake (tipo "87% de domínio") sem lastro estatístico real — isso é pseudociência; reportar o estado qualitativo e a evidência bruta por trás dele.

---

## 7. Repetição espaçada aplicada: SM-2 e FSRS, e uma versão mínima viável

### 7.1 SM-2 (SuperMemo 2), como funciona de verdade

Algoritmo de Piotr Wozniak (1987), ainda a base do Anki até 2023. Cada cartão/item tem um **fator de facilidade (EF)** que começa em 2,5 e sobe ou desce conforme a qualidade da resposta relatada pelo aluno (uma nota de 0 a 5 sobre "quão fácil foi lembrar"). O próximo intervalo de revisão é calculado multiplicando o intervalo anterior pelo EF — então cartões marcados "fáceis" espaçam mais rápido, cartões marcados "difíceis" espaçam mais devagar (EF cai). Fraqueza reconhecida: EF é uma heurística fixa por item, não um modelo de esquecimento real do aluno — todo aluno recebe a mesma curva de espaçamento para o mesmo histórico de respostas, o que é rígido. **FATO VERIFICADO (fonte)** (faqs.ankiweb.net; tegaru.app; antiagent.io/blog comparando FSRS e SM-2).

### 7.2 FSRS (Free Spaced Repetition Scheduler), como funciona de verdade

Modelo mais moderno, adotado como padrão recomendado pelo Anki no fim de 2023, baseado em um modelo de esquecimento ajustado a dados reais (não uma fórmula fixa por item). Usa três variáveis por item (modelo **DSR**): **Dificuldade (D)**, numa escala de 1 a 10; **Estabilidade (S)**, o tempo em dias para a probabilidade de recordação (R) cair de 1 para 0,9; e **Recuperabilidade (R)**, a probabilidade estimada de o aluno lembrar *agora*, calculada por uma função de decaimento de potência a partir de S e do tempo desde a última revisão. O próximo intervalo é escolhido para bater uma meta de retenção-alvo escolhida pelo usuário (tipicamente ~90%), em vez de aplicar sempre o mesmo multiplicador. Tem ~19 parâmetros treináveis, ajustáveis por indivíduo ou por baralho, a partir do histórico real de revisões — quanto mais difícil o item (D alto), mais devagar a estabilidade cresce a cada acerto; e quanto mais baixa a recuperabilidade no momento do acerto (ou seja, quanto mais "no fio da navalha" o aluno lembrou), maior o ganho de estabilidade — o mesmo mecanismo de força de recuperação baixa → ganho de armazenamento alto que Bjork descreve na seção 4.1, só que formalizado numericamente. Benchmarks públicos citados (500M+ revisões do Anki) mostram FSRS precisando de **20-30% menos revisões** que SM-2 para a mesma retenção. **FATO VERIFICADO (fonte)** (deepwiki.com — The FSRS Algorithm; expertium.github.io; borretti.me "Implementing FSRS in 100 Lines"; github.com/open-spaced-repetition).

### 7.3 Versão mínima viável para um tutor baseado em arquivos (sem app de flashcards)

Nem SM-2 nem FSRS completos fazem sentido para um tutor de arquivos texto sem infraestrutura de flashcard — SM-2 precisa de um rating explícito de 0-5 a cada revisão (fricção de UX que não combina com "bate-papo"), e FSRS precisa de volume de dados (dezenas a centenas de revisões) para ajustar 19 parâmetros com confiança, o que um único aluno estudando um punhado de conceitos nunca vai gerar. **INFERÊNCIA de engenharia**, aplicando os princípios verificados de ambos os algoritmos a uma restrição de produto real:

Proposta mínima viável — "SM-2 simplificado, sem EF explícito, guiado pelo estado de proficiência da seção 6" em vez de uma nota manual:
1. Cada conceito tem um **intervalo atual** (em dias), começando em 1.
2. Ao ser revisitado, o resultado observável (não uma nota manual pedida ao aluno) decide o próximo intervalo:
   - Acertou sem dica → intervalo dobra ou mais (ex.: ×2,3, aproximando o crescimento exponencial do SM-2/FSRS bem-sucedido), e o teto de intervalo cresce enquanto o estado for "domina".
   - Acertou com dica de nível 2-3 → intervalo cresce pouco (ex.: ×1,3) — sinal de "frágil", revisão continua relativamente próxima.
   - Errou ou precisou de nível 4-5 → intervalo **volta para 1** (reset), o conceito regride para "não sabe"/"frágil" e entra na fila de curto prazo.
3. Isso aproxima o espírito de "target de retenção" do FSRS (menos revisão para o que já está sólido, mais para o que é frágil) sem exigir estimar 19 parâmetros nem pedir rating manual explícito — o "rating" é inferido do comportamento real (tentativas, dicas, tipo de erro), que já está sendo coletado para a seção 6.
4. Persistência: basta um registro por conceito com `{ultima_revisao, proximo_intervalo_dias, estado}` em um arquivo estruturado (YAML/JSON/markdown com frontmatter) — não precisa de banco de dados nem de motor de agendamento dedicado.

> **Implicação operacional para o study-method:** implementar essa versão simplificada agora (não SM-2 nem FSRS completos); revisitar conceitos "frágeis" e "não sabe" antes dos "domina"; nunca pedir ao aluno uma nota manual de dificuldade — inferir do comportamento observado, que é um dado mais confiável e sem fricção extra de UX no meio de uma conversa.

---

## 8. Tom de bate-papo

### 8.1 O "personalization principle" de Mayer

Richard Mayer (teoria cognitiva de aprendizagem multimídia): pessoas aprendem melhor de material educacional quando as palavras estão em **estilo conversacional** em vez de formal. Em 11 de 11 testes reportados, alunos que receberam o texto em estilo conversacional (usando "eu" e "você", tom direto) tiveram desempenho melhor em testes de transferência que os que receberam estilo formal. **FATO VERIFICADO (fonte)** (files.eric.ed.gov — PDF; sites.google.com/Cognitive Theory of Multimedia Learning).

**Correção sobre o tamanho de efeito**: a versão anterior deste documento citava "tamanho de efeito mediano d = 1,11" sob selo de FATO VERIFICADO — esse número **não foi localizado em nenhuma fonte primária** nesta pesquisa (nem na anterior, nem na verificação desta rodada). O trabalho mais citado sobre o "11 de 11" é Mayer, Fennell, Farmer & Campbell (2004), *"A Personalization Effect in Multimedia Learning"*, Journal of Educational Psychology, 96(2), pp. 389-395 — confirmado nesta sessão (título, autoria, volume e páginas via registro bibliográfico) como um estudo com **três experimentos separados**, cada um comparando narração conversacional ("seu/você") vs. formal ("o/a") sobre o mesmo conteúdo (sistema respiratório), com ganho significativo em testes de transferência para o estilo conversacional em cada experimento — não um "d=1,11" único consolidado. Valores de tamanho de efeito por experimento (próximos de 0,65 / 1,07 / 0,72, conforme citados por revisões secundárias sobre esse estudo) circulam na literatura, mas **não consegui reextrair esses três números diretamente do PDF primário nesta sessão** (paywall e limite de taxa nas fontes tentadas) — marco-os como **não verificados de forma independente** em vez de repetir um número que não pude confirmar. Adicionalmente, uma meta-análise mais ampla e mais recente sobre o princípio de personalização, agregando cerca de 22 estudos, é citada na literatura como encontrando um efeito **bem menor, d≈0,54** — menos da metade do "d=1,11" incorreto — mas também não consegui localizar essa meta-análise por fonte primária nesta sessão; cito-a aqui como **não verificada**, e não como fato. **Conclusão honesta**: o "11 de 11" (direção do efeito) está corroborado; qualquer tamanho de efeito único específico (1,11 ou outro) não está, e não deve ser tratado como verificado até que a fonte primária seja localizada e lida integralmente.

Base teórica: estilo conversacional cria **presença social** e "proximidade social" entre autor/tutor e aprendiz — o aluno passa a tratar o material como um parceiro de conversa, o que sustenta tanto o processamento cognitivo "essencial" quanto a motivação de se engajar ativamente. **FATO VERIFICADO (fonte)** (mesma fonte).

### 8.2 O que diferencia informal-eficaz de informal-vazio

A literatura de Mayer é específica: o ganho vem de **pronomes pessoais e voz direta que reduzem distância social e mantêm o aluno processando ativamente o conteúdo** — não de humor solto, gírias, ou entusiasmo performático desconectado do conteúdo. Um estudo relacionado (Moreno & Mayer, 2000/2004) comparou versões conversacional vs. formal do **mesmo jogo educacional com o mesmo conteúdo** — a variável manipulada foi só o registro linguístico, não a quantidade de piadas ou emojis. **FATO VERIFICADO (fonte)** (sciencedirect.com; researchgate.net sobre Moreno & Mayer).

Daqui decorre uma distinção prática (**INFERÊNCIA**, aplicando o princípio): "informal-eficaz" é tom direto, pessoal, que mantém o foco no conteúdo e convida o aluno a processar ativamente ("repara que essa função sempre devolve None aqui — por quê, você acha?"); "informal-vazio" é humor ou entusiasmo que substitui conteúdo ou vira decoração sem função cognitiva ("Uau, que código incrível!! Vamos nessa!!"). O critério de corte prático: cada frase de tom informal precisa estar carregando ou convidando processamento de conteúdo — se ela pode ser cortada sem perder nada de substância, é ruído, mesmo que pareça "engajante".

### 8.3 O risco: sycophancy (bajulação) do LLM

Pesquisa recente sobre LLMs documenta **sycophancy** como um problema real e mensurável. **Correção de fonte e de número**: a versão anterior deste documento citava "taxas de afirmação/validação 47-94% acima da linha de base humana" como um FATO VERIFICADO único, atribuído a emergentmind.com — mas essa página é um **resumo automático que combina pelo menos dois papers de escopos diferentes**, e a origem do "94%" não foi localizada nesta pesquisa (nem na anterior). Confirmei nesta sessão, via leitura direta do abstract, que Cheng, Lee, Khadpe, Yu, Han & Jurafsky (arXiv 2510.01395, *"Sycophantic AI Decreases Prosocial Intentions and Promotes Dependence"*) testaram 11 modelos de IA em conselhos sobre **conflitos interpessoais reais** (dois experimentos pré-registrados, 1.604 participantes) e encontraram que os modelos **afirmam as ações do usuário 50% mais do que humanos o fazem** ("affirm users' actions 50% more than humans do") — inclusive quando a pergunta do usuário menciona manipulação, engano ou outros danos relacionais — e que essa validação reduz a disposição do usuário de reparar o conflito, mesmo quando ele avalia a resposta do modelo como de melhor qualidade e mais confiável. Esse "50%" é o número que sustento com FATO VERIFICADO — não o "47%" nem o "94%" da versão anterior. **FATO VERIFICADO (fonte)** (arXiv 2510.01395, abstract lido diretamente nesta sessão). A degradação de acurácia sob perguntas "carregadas" (leading) em domínios como ciência, medicina e direito é documentada por **outros três papers**, nenhum deles o Cheng et al. — os dois achados (validação social 50% acima do humano; degradação técnica sob pressão) têm escopos diferentes e não devem ser somados numa única estatística, como a página agregadora fazia.

Em abril de 2025, a OpenAI reverteu uma atualização do **GPT-4o** — não "GPT-4" genericamente, como a versão anterior deste documento afirmava — por bajulação excessiva, atribuindo a causa a um sinal de recompensa baseado em feedback de usuário que "enfraqueceu a influência do sinal de recompensa primário, que vinha mantendo a sycophancy sob controle" — um exemplo documentado e concreto de como otimizar para "o usuário gostou" ativamente destrói a qualidade do feedback. **FATO VERIFICADO (fonte)** (confirmado nesta sessão: "On 25 April 2025, OpenAI completed the rollout of an update to GPT-4o, the default model used in ChatGPT at the time" — Wikipedia, "Sycophancy (artificial intelligence)", citando o post-mortem da OpenAI; annielytics.com).

Sobre o paper do FlipFlop Experiment (arXiv 2311.08596): a versão anterior deste documento afirmava que modelos "atualizam a própria confiança de forma 2,5× mais forte do que deveriam diante de contradição do usuário" — **esse "2,5×" não existe no paper**; foi colado sobre uma citação real (o paper existe, com esse ID e título) mas o número é inventado. Confirmei via leitura direta do abstract nesta sessão que o que o paper de fato reporta é: modelos trocam de resposta ("flip") em média **46% das vezes** diante de um desafio do usuário — mesmo sem evidência real por trás da contradição —, com uma **queda média de acurácia de 17%** entre a primeira e a resposta final. Ou seja, o problema não é só elogiar demais, é também **ceder terreno demais** quando o aluno discorda ou insiste — mas com estes números, não com "2,5×". **FATO VERIFICADO (fonte)** (arxiv 2311.08596, "Are You Sure? Challenging LLMs Leads to Performance Drops in The FlipFlop Experiment", abstract lido diretamente nesta sessão via WebFetch).

Trabalho recente específico de tutoria (arxiv 2510.03667, "Invisible Saboteurs: Sycophantic LLMs Mislead Novices in Problem-Solving Tasks") documenta que LLMs sycophantic **enganam ativamente novatos** em tarefas de resolução de problema — o efeito não é neutro, é prejudicial ao aprendizado quando o tutor concorda ou elogia código/raciocínio errado só para agradar. **FATO VERIFICADO (fonte)** (arxiv.org/pdf/2510.03667).

Por que isso destrói o sinal pedagógico: se todo código do aluno recebe "ótimo trabalho!", o elogio para de carregar informação — o aluno não consegue mais distinguir "isso está genuinamente bom" de "isso é só a saudação padrão do bot", e a régua interna dele para calibrar o próprio progresso quebra.

> **Implicação operacional para o study-method:** usar pronomes diretos e tom pessoal, mas cada intervenção de tom deve estar a serviço de manter o aluno processando o conteúdo (uma pergunta, um convite a notar algo), não ser decoração. Elogio deve ser **específico e condicional ao mérito real** ("essa recursão cobriu o caso base certo, e isso é exatamente onde a maioria erra" em vez de "ótimo trabalho!!"), reservado para quando há algo concreto a apontar — nunca automático a cada resposta. O tutor deve manter a posição correta quando o aluno discorda sem evidência nova, em vez de ceder para evitar atrito (o oposto de sycophancy não é frieza, é honestidade calibrada).

---

## 9. Erros e feedback

### 9.1 Taxonomia: deslize vs. erro conceitual

A distinção clássica (Norman, 1981, sobre "action slips", e a linha de trabalho de Brown & VanLehn sobre erros procedurais) separa:
- **Deslize (slip)**: o aluno *sabe* o procedimento certo, mas executa errado por descuido momentâneo (digitou `=` em vez de `==`, trocou a ordem de dois argumentos que sempre acerta). Não reflete lacuna de conhecimento.
- **Erro sistemático/conceitual ("bug" no sentido de Brown & Burton, ou "misconception")**: o aluno aplica consistentemente um procedimento **coerente, porém errado** — não é aleatório, é *regido por regra*, só que a regra está errada (ex.: sempre inverte a condição de parada de um loop do mesmo jeito errado, em vários exercícios diferentes). Brown & Burton (1978) modelaram isso formalmente no sistema BUGGY: erros sistemáticos são pequenas edições estruturadas a um procedimento correto. Brown & VanLehn (1980) desenvolveram a **Repair Theory**: o aluno tem um procedimento estável mas incompleto, que leva a impasses em certos problemas — e ele aplica algum "reparo" ad hoc para seguir em frente, nem sempre o mesmo reparo toda vez, o que explica por que o mesmo aluno às vezes erra "de formas diferentes" o mesmo tipo de problema. **FATO VERIFICADO (fonte)** (onlinelibrary.wiley.com — Brown & VanLehn 1980, Cognitive Science; instructionaldesign.org/Repair Theory; VanLehn, *Mind Bugs: The Origins of Procedural Misconceptions*, MIT Press).

A distinção importa porque a **intervenção certa é diferente**: um deslize não precisa de reensino, precisa só de um apontamento rápido ("relê essa linha, o que você acha que aconteceu?"); um erro conceitual recorrente precisa voltar ao princípio subjacente e frequentemente precisa de uma analogia nova ou de um worked example, porque a "regra errada" do aluno é internamente consistente e não vai se autocorrigir só de errar de novo — ela vai continuar produzindo o mesmo tipo de bug em contextos diferentes até que o próprio modelo mental subjacente seja corrigido.

### 9.2 Feedback imediato vs. atrasado

Não encontrei nesta pesquisa uma meta-análise específica e recente comparando feedback imediato vs. atrasado que eu possa citar com segurança de número — marco como **não verificado** qualquer cifra de efeito aqui. O que é razoável inferir a partir dos princípios já verificados nas seções 4 e 6 (**INFERÊNCIA**): feedback imediato é melhor para **deslizes** e para erros de sintaxe (o custo de deixar o aluno praticar o erro repetidamente é alto e sem benefício — praticar um deslize não ensina nada de novo, só consolida um hábito ruim de digitação/atenção); já para um erro conceitual, um pequeno atraso deliberado — deixar o aluno tentar de novo, encontrar o próprio impasse, e só então intervir — é consistente com desirable difficulties (a luta antes da correção fortalece mais do que a correção instantânea), desde que o atraso não ultrapasse o ponto de frustração (seção 4.3).

Exemplo concreto da diferença: se o aluno escreve `if x = 5:` em Python (erro de sintaxe, `=` em vez de `==`), corrigir na hora é certo — não há nada para o aluno "descobrir" ali, é uma convenção arbitrária de sintaxe. Já se o aluno escreve uma função recursiva de soma de lista sem tratar o caso da lista vazia e ela quebra com um erro de índice, vale mais deixar o erro acontecer, perguntar "o que rodou primeiro que quebrou?" e deixar o aluno rastrear o próprio raciocínio até achar o caso base ausente, em vez de apontar "faltou o caso base" de cara — esse segundo tipo de erro é exatamente onde a luta produtiva (seção 4) tem espaço para atuar.

### 9.3 Feedback que não humilha e não bajula

Combinando a seção 8.3 (risco de sycophancy) com a taxonomia acima, uma régua prática (**INFERÊNCIA** de síntese):
- Nomear o **tipo** de erro sem julgar a pessoa: "isso é um erro de índice fora do limite" (fato sobre o código), nunca "você não prestou atenção" (julgamento sobre a pessoa).
- Reconhecer o que já está certo antes de apontar o que falta, mas só quando há algo genuinamente certo para reconhecer — reconhecimento vazio ("boa tentativa!") antes de um erro grave é o começo da bajulação.
- Quando o erro é conceitual e recorrente, dizer isso explicitamente ("essa é a terceira vez que a condição de parada erra do mesmo jeito — vamos olhar o princípio de novo") em vez de tratar cada ocorrência como isolada — isso é informação útil para o aluno calibrar a própria confiança, e esconder o padrão para "não desanimar" o aluno é uma forma de sycophancy por omissão.
- Nunca inflar elogio para compensar covardia de dar más notícias — o antídoto à humilhação não é bajulação, é precisão: dizer exatamente o que está errado, sem adjetivos sobre a pessoa, e voltar rápido para "e agora, o que fazemos".

> **Implicação operacional para o study-method:** classificar cada erro observado como deslize ou conceitual antes de decidir a resposta (isso também alimenta o estado de proficiência da seção 6). Deslizes recebem apontamento rápido e imediato; erros conceituais acionam a escada de dicas (seção 10) a partir de um nível mais alto (pista conceitual, não só redirecionamento) e podem justificar reintroduzir uma analogia (seção 2). Feedback nunca deve incluir elogio genérico não condicionado a um mérito real específico.

---

## Escada de dicas (proposta operacional)

**INFERÊNCIA** — esta escada de 5 níveis é uma **proposta de engenharia pedagógica sem precedente direto na literatura levantada**: nenhuma fonte consultada nesta pesquisa descreve uma escada de dicas com exatamente esses 5 degraus. Ela é uma síntese aplicada que combina três princípios verificados (assistance dilemma, expertise reversal effect, distinção deslize/conceitual, todos citados abaixo), não um achado empírico em si — trate-a como o restante do documento marca síntese/extrapolação (seções 2.3, 2.4, 4.3, 5.3, 6.2, 7.3, 9.2, 9.3), e não como um FATO VERIFICADO. Ela é referenciada pelas seções 3, 5.4, 9.1 e 9.3 como se fosse a peça central do documento — e é útil precisamente por isso —, mas precisa estar rotulada pelo que é: engenharia derivada, não citação.

Cinco níveis, do mais sutil ao mais completo, aplicáveis tanto a exercícios de código quanto de matemática traduzida em código. A régua de subida combina o **assistance dilemma** (seção 5.4), o **expertise reversal effect** (seção 3.3) e a distinção **deslize vs. conceitual** (seção 9.1): comece sempre no nível mínimo necessário dado o estado de proficiência estimado (seção 6) para aquele conceito — não sempre no nível 1 — e suba um degrau por vez, nunca pulando direto para o topo.

| Nível | O que o tutor faz | Gatilho de subida a partir daqui |
|---|---|---|
| **1 — Redirecionamento de atenção** | Uma pergunta que aponta *onde* olhar, sem dizer o quê está errado nem qual conceito está em jogo. Ex.: "Roda esse trecho na cabeça, linha por linha — o que você espera que `i` valha aqui?" | Aluno tenta aplicar e continua sem identificar o problema, **ou** pede explicitamente mais ajuda, **ou** passa um tempo sem editar nada (sinal de impasse, não de reflexão ativa). |
| **2 — Pista conceitual** | Nomeia o *princípio* ou conceito envolvido, sem aplicá-lo ao código específico do aluno. Ex.: "Isso tem a ver com como Python resolve escopo de variável dentro de um loop." | Aluno ainda não consegue localizar o erro no próprio código depois de tentar com a pista conceitual em mãos. |
| **3 — Pista estrutural/localizadora** | Aponta a linha ou trecho exato e o *tipo* de erro (sem dar a correção). Ex.: "Olha a linha 14 — é um erro de condição de parada, do tipo que descarta o último elemento." | Aluno tenta corrigir mas erra de novo (mesmo tipo de erro ou um novo erro na mesma linha), **ou** o erro já foi classificado como conceitual/recorrente (seção 9.1) — nesse caso pode-se pular direto da localização para o exemplo análogo. |
| **4 — Exemplo análogo resolvido** | Um *worked example* em código paralelo (problema parecido, não o código do aluno), resolvido passo a passo, mostrando o princípio em ação num contexto vizinho. | Aluno não consegue transferir o padrão do exemplo análogo de volta para o próprio código depois de uma tentativa honesta. |
| **5 — Solução completa comentada** | O código correto para o problema do aluno, com explicação linha a linha do porquê (não só o "aqui está"). | Topo da escada — não há degrau acima. Deve vir sempre acompanhado de uma pergunta de verificação (ver abaixo), nunca ser o ponto final da interação. |

Regras adicionais de operação da escada:
- **Descer, não só subir**: depois de uma resolução bem-sucedida em qualquer nível, a próxima ocorrência do mesmo tipo de conceito deve reiniciar em um nível mais baixo (ou até em zero — deixar o aluno tentar sozinho primeiro), refletindo o expertise reversal effect. A escada não é cumulativa por padrão; ela é recalibrada pelo estado de proficiência (seção 6) a cada novo encontro com o conceito.
- **Fatos arbitrários pulam a escada**: sintaxe de linguagem, nome de função de biblioteca, convenção de estilo — não têm estrutura descobrível por raciocínio, então perguntar no nível 1-2 é teatro vazio; informar direto é o correto (seção 5.3).
- **Nível 5 nunca é mudo**: mesmo a solução completa deve terminar com uma pergunta que force o aluno a processar ativamente o que acabou de ver ("agora, sem olhar de novo — por que a condição usa `<=` e não `<` aqui?"), para não virar mera cópia sem compreensão.
- **Erro conceitual recorrente pode reintroduzir analogia**: se o mesmo tipo de erro aparece pela segunda ou terceira vez apesar de já ter subido a escada antes, o próximo ciclo deve considerar trocar de estratégia (uma analogia nova do banco de analogias do aluno, seção 2.4) em vez de repetir os mesmos 5 níveis que já não funcionaram.
- **Tempo parado também é gatilho**, não só erro repetido: se o aluno não edita nada por um intervalo perceptível depois de receber uma dica, isso é sinal de impasse silencioso (ele não sabe nem por onde começar), e deve subir a escada mesmo sem uma nova tentativa incorreta registrada — esperar por um erro explícito nesse caso só adia a frustração.

### Exemplo de aplicação da escada (recursão sem caso base)

Cenário: o aluno escreveu `def fatorial(n): return n * fatorial(n - 1)` e o programa estoura por recursão infinita.

- **Nível 1**: "Roda isso na cabeça para `n = 1` — quando é que essa função para de chamar a si mesma?"
- **Nível 2** (se não resolveu): "Toda função recursiva precisa de um caso onde ela *não* chama a si mesma — como isso costuma se chamar?"
- **Nível 3** (se não resolveu): "Repara na sua função: não existe nenhuma linha que devolva um valor sem chamar `fatorial` de novo — é aí que falta o caso base."
- **Nível 4** (se ainda não resolveu): mostra um exemplo análogo resolvido — uma função `soma_ate(n)` recursiva completa, com caso base explícito e comentado, para um problema parecido mas não o mesmo.
- **Nível 5** (último recurso): entrega `def fatorial(n): return 1 if n <= 1 else n * fatorial(n - 1)`, explica linha a linha por que `n <= 1` (e não só `n == 1`, que quebraria para entradas negativas) e fecha com a pergunta de verificação: "o que aconteceria se eu chamasse `fatorial(-3)` com `n == 1` no lugar de `n <= 1`?"

Esse mini-exemplo mostra o padrão geral: cada nível preserva o máximo de trabalho cognitivo possível para o aluno, e só o nível 5 entrega a resposta — e mesmo ali, não sem cobrar processamento ativo de volta.

---

## Fontes

- Constructionism (learning theory) — Wikipedia / EBSCO Research Starters: https://www.ebsco.com/research-starters/religion-and-philosophy/seymour-papert-and-constructionism
- Mindstorms (book) — Wikipedia: https://en.wikipedia.org/wiki/Mindstorms_(book)
- *Mindstorms Revisited: Making New Construals of Seymour Papert's Legacy* (Warwick, PDF): https://warwick.ac.uk/fac/sci/dcs/research/em/construit/year3/events/edurobotics/mindstormsedurobotics2016.pdf
- "Hard Fun" — The Daily Papert: https://dailypapert.com/hard-fun/
- "Teacher Note: Body Syntonic" — Runestone Academy: https://runestone.academy/ns/books/published/TeacherCSP/CSPNameTurtles/bodySyntonic.html
- Kirschner, Sweller & Clark (2006), "Why Minimal Guidance During Instruction Does Not Work" (PDF, USC): https://itgs.ict.usc.edu/papers/Constructivism_KirschnerEtAl_EP_06.pdf
- Hmelo-Silver, Duncan & Chinn (2007), "Scaffolding and Achievement in Problem-Based and Inquiry Learning: A Response to Kirschner, Sweller, and Clark (2006)" (PDF): https://www.sfu.ca/~jcnesbit/EDUC220/ThinkPaper/HmeloSilverDuncan2007.pdf
- Gentner & Markman, "Structure Mapping in Analogy and Similarity" (PDF): https://courses.csail.mit.edu/6.803/pdf/gentner.pdf
- "What's Wrong with the Water Circuit Analogy?" (HyperPhysics): http://hyperphysics.phy-astr.gsu.edu/hbase/electric/watcir3.html
- "Element Interactivity and Intrinsic, Extraneous, and Germane Cognitive Load" (Springer): https://link.springer.com/article/10.1007/s10648-010-9128-5
- Expertise reversal effect — Wikipedia: https://en.wikipedia.org/wiki/Expertise_reversal_effect
- Bjork, R. A. (1994), "Memory and metamemory considerations in the training of human beings", em Metcalfe & Shimamura (orgs.), *Metacognition*, MIT Press, pp. 185-205 — autoria única de Robert A. Bjork; é o capítulo que cunhou "desirable difficulties" (registro bibliográfico consultado nesta sessão, sem PDF de acesso aberto localizado).
- Bjork & Bjork (2011), "Introducing Desirable Difficulties Into Practice and Instruction" (PDF, UNH) — trabalho conjunto e posterior ao de 1994, não a fonte original do termo: https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf
- Bloom's 2 sigma problem — Wikipedia: https://en.wikipedia.org/wiki/Bloom%27s_2_sigma_problem
- Nintil, "On Bloom's two sigma problem: A systematic review of the effectiveness of mastery learning, tutoring, and direct instruction": https://nintil.com/bloom-sigma/
- Kulik & Fletcher (2016), "Effectiveness of Intelligent Tutoring Systems: A Meta-Analytic Review", Review of Educational Research, 86(1), 42-78: https://journals.sagepub.com/doi/abs/10.3102/0034654315581420
- Koedinger & Aleven, "Exploring the Assistance Dilemma in Experiments with Cognitive Tutors" (PDF, CMU): https://www.cs.cmu.edu/~bmclaren/pubs/KoedingerEtAl-IsItBetterToGiveThanToReceive-CogSci2008.pdf
- Bayesian Knowledge Tracing — Wikipedia: https://en.wikipedia.org/wiki/Bayesian_Knowledge_Tracing
- Anki FAQs, "What spaced repetition algorithm does Anki use?": https://faqs.ankiweb.net/what-spaced-repetition-algorithm
- DeepWiki, "The FSRS Algorithm": https://deepwiki.com/open-spaced-repetition/py-fsrs/5-the-fsrs-algorithm
- Borretti, "Implementing FSRS in 100 Lines": https://borretti.me/article/implementing-fsrs-in-100-lines
- Mayer, personalization principle (PDF, ERIC): https://files.eric.ed.gov/fulltext/EJ944963.pdf
- "Sycophantic Praise in LLMs" (EmergentMind) — **atenção**: página de resumo automático que combina papers de escopos diferentes; não citar seus números agregados (ex.: "47-94%") como se viessem de uma única fonte: https://www.emergentmind.com/topics/sycophantic-praise-sypr
- Cheng, Lee, Khadpe, Yu, Han & Jurafsky, "Sycophantic AI Decreases Prosocial Intentions and Promotes Dependence" (arXiv 2510.01395) — fonte direta do "50% mais que humanos", confirmada por WebFetch nesta sessão: https://arxiv.org/abs/2510.01395
- "Invisible Saboteurs: Sycophantic LLMs Mislead Novices in Problem-Solving Tasks" (arXiv): https://arxiv.org/pdf/2510.03667
- "Are You Sure? Challenging LLMs Leads to Performance Drops in The FlipFlop Experiment" (arXiv): https://arxiv.org/pdf/2311.08596
- Brown & VanLehn (1980), "Repair Theory: A Generative Theory of Bugs in Procedural Skills", Cognitive Science: https://onlinelibrary.wiley.com/doi/abs/10.1207/s15516709cog0404_3
- VanLehn, *Repair Theory* — InstructionalDesign.org: https://www.instructionaldesign.org/theories/repair-theory/
- Pea & Kurland (1984), "On the Cognitive Effects of Learning Computer Programming: A Critical Look" (New Ideas in Psychology) — **revisão teórica/crítica, não o estudo empírico** (PDF de artigo relacionado dos mesmos autores): https://eclass.uoa.gr/modules/document/file.php/PPP233/%CE%AC%CF%81%CE%B8%CF%81%CE%B1%20%CE%B2%CE%B9%CE%B2%CE%BB%CE%B9%CE%BF%CE%B3%CF%81%CE%B1%CF%86%CE%AF%CE%B1%CF%82/Pea%20et%20al%201985.pdf
- Pea, R. D. & Kurland, D. M. (1984), *Technical Report No. 16, "Logo Programming and the Development of Planning Skills"* — **este é o estudo empírico** (dois estudos de um ano) citado na seção 1.6; registro ERIC confirmado nesta sessão.
- Scherer, Siddiq & Viveros (2019), "The Cognitive Benefits of Learning Computer Programming: A Meta-Analysis of Transfer Effects", Journal of Educational Psychology (PDF via gwern.net mirror): https://gwern.net/doc/psychology/2019-scherer.pdf

**Não verificado nesta pesquisa** (citado no texto, mas sem confirmação de número/fonte primária robusta): tamanho de efeito exato da comparação Socrático vs. Didático em tutoria (seção 5.3); meta-análise recente e específica de feedback imediato vs. atrasado (seção 9.2); limiar numérico universal de "quando dificuldade desejável vira frustração" (seção 4.3); tamanhos de efeito por experimento (~0,65/1,07/0,72) de Mayer, Fennell, Farmer & Campbell (2004) — não reextraídos do PDF primário nesta sessão (seção 8.1); existência e valor exato (d≈0,54) de uma meta-análise de ~22 estudos sobre o princípio de personalização — não localizada por fonte primária nesta sessão (seção 8.1).
