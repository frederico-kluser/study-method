# Motor pedagógico — o racional

> **Para quem é este documento.** Para o humano que quer entender e auditar por que o tutor se comporta como se comporta. Ele não é lido em runtime e **não deve** ser lido em runtime. A instrução executável vive em `skills/study-method/references/pedagogia.md` (daqui em diante, "a reference"), que é imperativa, enxuta e sem bibliografia. Aqui está o *porquê*; lá está o *o quê fazer*.
>
> Fonte primária de tudo abaixo: `docs/research/03-pedagogia.md` do repositório (pesquisa auditada adversarialmente, com correções de autoria, de número e de atribuição). Onde a pesquisa marcou algo como inferência, este documento repete o rótulo.

**Convenção de rastreabilidade:** cada princípio termina com `> **Implicação operacional:**` apontando o identificador da regra correspondente na reference. Os identificadores são estáveis:

| Prefixo | Bloco na reference |
|---|---|
| `C-*` | Como conversar |
| `AS-*` | Anti-bajulação |
| `AN-*` | Protocolo de analogia |
| `ESC-*` | Escada de dicas |
| `ERR-*` | Resposta a erro |
| `MEM-*` | Uso da memória |

---

## 1. Construcionismo aplicado: por que traduzir matemática em código

### 1.1 O argumento forte (que não é "é mais divertido")

Papert cunhou **construcionismo** sobre o construtivismo piagetiano: conhecimento não é transmitido, é construído — e a construção é especialmente potente quando o aprendiz constrói junto um **artefato externo, compartilhável e testável** que materializa a ideia interna.

O ganho epistemológico específico de "matemática via código" é este: prosa e quadro-negro toleram vagueza; um interpretador não tolera. Um aluno pode recitar a fórmula de juros compostos e acreditar que entendeu. Escrever `montante(principal, taxa, periodos)` e testar com 100 a 10% por 2 períodos (tem que dar 121) separa "entendi o conceito" de "consigo operacionalizá-lo" — e é exatamente essa lacuna que o quadro-negro esconde. O interpretador é um crítico neutro: não julga a pessoa, só recusa o que está mal-formado.

Dois mecanismos complementares de Papert importam para o desenho do tutor:

- **O computador como *tutee***: a criança ensina a máquina, não o contrário. Bugs são o espelho fiel dos buracos no raciocínio do aluno, não uma nota de reprovação vinda de fora. Isso permite um reenquadramento emocional barato e honesto: um erro é "o programa ainda não entendeu o que você quis dizer".
- **Raciocínio *body-syntonic***: a Turtle se move como o corpo do aluno se move, então o aluno prevê o comportamento dela imaginando o que ele mesmo faria. Generaliza para qualquer conceito que possa ser primeiro simulado com o corpo, com objetos, ou com uma intuição espacial concreta, antes de virar abstração.
- **"Hard fun"**: a frase vem de uma criança que descreveu Logo como divertido **porque** era difícil, não apesar disso. Dificuldade escolhida e controlada pelo aluno é prazerosa; dificuldade arbitrária imposta não é. Isso é o oposto de gamificação colada por cima (pontos, emblemas).

> **Implicação operacional:** todo conceito ganha uma tradução executável e manipulável (`C-12` enquadra bug como "o programa não entendeu"; a reference proíbe explicar conceito matemático sem oferecer o objeto rodável correspondente). A intuição física vem antes do código quando existir uma (`AN-1` prefere domínio-base corporal/concreto).

### 1.2 A crítica honesta: guiado vs. descoberta pura

O contraponto mais citado é **Kirschner, Sweller & Clark (2006)**: instrução com pouca ou nenhuma orientação é sistematicamente inferior a instrução com forte orientação, porque ignora os limites severos da memória de trabalho quando o aluno precisa, ao mesmo tempo, resolver o problema **e** descobrir o método do zero. O achado mais relevante para um tutor adaptativo: a vantagem da orientação **só recua quando o aluno já tem conhecimento prévio suficiente para fornecer orientação interna** — ou seja, o efeito é moderado por expertise.

**Hmelo-Silver, Duncan & Chinn (2007)** responderam que Kirschner et al. confundiram aprendizagem por investigação bem implementada com "descoberta pura sem andaime": na prática, PBL bom usa andaimes pesados, e é o andaime — não a ausência dele — que faz a abordagem funcionar.

**A resolução da tensão, que este projeto adota literalmente:**

- Kirschner/Sweller/Clark têm razão empírica sobre **descoberta sem estrutura nenhuma** — jogar o aluno num problema aberto e torcer para que ele reinvente o conceito sobrecarrega o novato e mede mal.
- Papert nunca defendeu isso literalmente. Logo é uma linguagem *desenhada* para dar feedback imediato e concreto; a Turtle **já é** um andaime cognitivo; os microworlds são estruturados; o professor tem papel ativo.
- Portanto o eixo real de decisão **não é** "guiar × não guiar". É: **quanto** de estrutura, **quando** retirá-la, e se o andaime está **no material** (bom) ou só na cabeça do professor torcendo para emergir sozinho (ruim).

O construcionismo deste tutor é, então, "descoberta com andaime pesado embutido no material" — nunca "resolve aí, descobre sozinho".

> **Implicação operacional:** o tutor nunca entrega um problema aberto sem microworld mínimo (template rodável, exemplo vizinho resolvido, ou pergunta que restringe o espaço de busca). O andaime é material e explícito — é a escada `ESC-1..ESC-5` —, e a retirada é regida por `ESC-D` (gatilhos de descida), não por intuição.

### 1.3 Transferência não é automática

O otimismo dos anos 1980 (aprender Logo treinaria "pensamento" em geral) foi testado e **não confirmado**: Pea & Kurland (1984, Technical Report No. 16) rodaram dois estudos de um ano e concluíram que aprender a programar não diferenciou os grupos experimentais dos controles em habilidades de planejamento. O exemplo do `REPEAT` — a criança que usa `REPEAT` para repetir o próprio nome mas não reconhece o mesmo padrão para desenhar um quadrado — mostra que nem a transferência *dentro* da programação aconteceu sozinha.

A literatura moderna é mais matizada: Scherer, Siddiq & Viveros (2019), meta-análise de 105 estudos e 539 tamanhos de efeito, acharam transferência **moderada** (g ≈ 0,49), forte para transferência próxima e moderada para distante — com **matemática entre os domínios que mais se beneficiam**, junto de pensamento criativo e metacognição.

Leitura honesta: programar não é vacina geral contra o não-saber-pensar, mas também não é investimento fechado em si mesmo. A transferência é real e **precisa ser ensinada explicitamente** — apontando a ponte entre o padrão de código e o problema de matemática ao qual se aplica.

> **Implicação operacional:** o tutor fecha o ciclo explicitamente (`C-7`: depois do acerto, pedir uma previsão de variação ou a conexão com um caso vizinho, antes de qualquer comentário). Proibido prometer ao aluno que "programar desenvolve raciocínio lógico" sem construir a ponte na hora.

---

## 2. Analogia: por que funciona, quando atrapalha, por que registrar

### 2.1 Mapeamento relacional, não superficial

**Structure-mapping theory** (Gentner): uma analogia é um mapeamento *relacional* entre um domínio-base conhecido e um domínio-alvo novo. Três princípios:

- **Similaridade relacional > similaridade de objeto.** A analogia boa mapeia relações ("X restringe Y como A restringe B"), não aparências ("os dois são redondos").
- **Consistência estrutural.** O mapeamento é um-para-um e preserva as conexões entre relações.
- **Sistematicidade.** Mapeamentos que alinham *sistemas conectados* de relações pesam mais e generalizam melhor do que relações isoladas.

O exemplo canônico da diferença, em recursão: "recursão é tipo boneca russa" é analogia de **objeto** — ambos têm coisas dentro de coisas, mas matrioskas não *fazem* nada, só se encaixam; o aluno leva a imagem e não leva a mecânica. A versão relacional é: "você resolve delegando a mesma tarefa, menor, a alguém, e compõe a resposta dele com a sua — como descobrir quantos degraus faltam perguntando a quem está um degrau acima e somando 1". Essa segunda carrega a relação que vai transferir para o próximo problema recursivo.

Consequência de design: **a etiqueta da analogia nunca basta**. Dizer o nome do domínio-base sem enunciar o mapeamento entrega a imagem e retém a mecânica — que é justamente a parte que ensina.

> **Implicação operacional:** `AN-2` impõe formato obrigatório de introdução — "assim como \<relação na base\>, aqui \<relação no alvo\>" — e proíbe a analogia-etiqueta.

### 2.2 Quando a analogia atrapalha: transferência negativa

Toda analogia é uma mentira parcial por construção: vale até o ponto em que a estrutura-base para de corresponder à estrutura-alvo. O aluno que não sabe onde fica esse ponto estica a analogia e absorve uma concepção errada **que o próprio ensino implantou**.

O caso mais estudado é corrente elétrica como fluxo de água: funciona para "corrente é conservada" e "resistência restringe o fluxo", e leva alunos a concluir que **corrente é consumida** ao longo do circuito (a segunda lâmpada recebe menos porque a primeira já "gastou" água) — fisicamente errado, mas perfeitamente coerente *dentro* da analogia esticada.

O mecanismo geral chama-se **transferência negativa**: a mente aplica por default a estrutura que já domina, mesmo onde ela não encaixa, tipicamente nos estágios iniciais de um domínio novo.

Em programação o equivalente é rotineiro: "variável é uma caixa que guarda um valor" é útil no começo e produz, esticada, a conclusão de que `b = a` copia a caixa — falso para objetos mutáveis, e origem do clássico "editei uma lista e a outra mudou sozinha". A analogia de caixa não tem estrutura relacional para representar referência e *aliasing*; ela precisa ser **aposentada ou corrigida** (para "etiqueta colada num objeto", que é relacional) exatamente no momento em que o aluno encontra mutabilidade.

Daí a assimetria que o tutor precisa internalizar: **o custo de não declarar a fronteira é maior que o custo de declará-la cedo demais.** Uma analogia sem fronteira declarada é uma concepção errada agendada.

> **Implicação operacional:** `AN-4` torna a **aposentadoria** um passo obrigatório do protocolo, com duas formas (fronteira e domínio), e não um opcional educado no fim.

### 2.3 Por que registrar as analogias que funcionaram *para este aluno*

Duas razões, uma teórica e uma prática:

- **Teórica.** A SMT exige que o domínio-base seja algo que o aluno já domina *estruturalmente* — e isso é idiossincrático. Quem joga xadrez responde a analogias de xadrez; quem cozinha, a receitas; quem toca, a ritmo e harmonia. **Não existe "a melhor analogia para recursão"** — existe a melhor analogia para *aquele* aluno, dado o que ele já sabe bem.
- **Prática.** Uma analogia já testada e comprovadamente eficaz com um aluno é um ativo reutilizável de baixo custo: o domínio-base está validado como conhecido *e* estruturalmente rico para aquela pessoa, então ele tende a servir também para o próximo conceito vizinho. (**Inferência** derivada da SMT; não há estudo citando literalmente "banco de analogias por aluno".)

> **Implicação operacional:** `AN-1` manda buscar o domínio-base em `what_worked` do perfil **antes** de recorrer ao banco padrão; `AN-5` só registra "funcionou" mediante evidência observável (o aluno acertou uma previsão num caso novo), nunca por impressão.

---

## 3. Carga cognitiva, worked examples e expertise reversal

### 3.1 As três cargas

Cognitive Load Theory (Sweller) modela a memória de trabalho como recurso severamente limitado:

- **Intrínseca** — complexidade inerente ao material (quantos elementos interagem: ponteiro duplo exige segurar mais elementos simultâneos que uma variável simples).
- **Extrínseca** — carga desperdiçada por **como** o material é apresentado (exemplo mal formatado, redundância, interface confusa). É a que se corta quase a zero sem perder conteúdo.
- **Germânica** — na reformulação de Sweller (2010), não é uma terceira fonte independente: são os recursos de memória de trabalho **redirecionados** para lidar com a carga intrínseca. É o trabalho produtivo de construir esquema.

A consequência prática mais barata: turno longo, explicação redundante e três opções equivalentes oferecidas ao mesmo tempo são carga extrínseca pura. Cortá-los não custa conteúdo.

### 3.2 Worked example effect

Para **novatos**, estudar exemplos resolvidos passo a passo produz aprendizagem melhor do que resolver o mesmo número de problemas do zero: libera memória de trabalho da busca por tentativa e erro do método e a redireciona para o princípio.

### 3.3 Expertise reversal effect — a regra bidirecional

O mesmo andaime que ajuda o novato **perde eficácia e chega a atrapalhar** quem já tem esquema construído: a explicação detalhada vira informação redundante que precisa ser processada e reconciliada, consumindo memória de trabalho à toa (efeito de redundância). Sistematizado por Kalyuga, Ayres, Chandler & Sweller (revisão de 2003).

Isso não é um ajuste fino, é uma inversão de sinal: **o worked example completo, com toda linha comentada, entregue a quem já domina o padrão, não é neutro — é dano.** A implicação instrucional é que o design tem que se adaptar ao nível de experiência, e não ficar fixo pela dificuldade nominal do exercício.

Para um tutor conversacional isso vale também para a *conversa*: comentar um acerto que era trivial para o aluno é redundância; reexplicar o que ele demonstrou dominar na sessão passada é redundância; reintroduzir uma analogia já internalizada é redundância.

> **Implicação operacional:** `ESC-INICIAL` amarra o degrau de partida ao `proficiency_state` do conceito — e `ESC-D` obriga a **descida** do andaime, incluindo a proibição de worked example não solicitado e de comentário linha a linha para `mastered`. `C-7` manda não comentar acerto trivial. `AN-4b` aposenta a analogia por domínio.

---

## 4. Desirable difficulties: a luta produtiva e o seu limite

### 4.1 O paradoxo

O termo é de **Robert A. Bjork (1994)**, autoria única, no capítulo "Memory and metamemory considerations in the training of human beings" (em Metcalfe & Shimamura, *Metacognition*, MIT Press). O texto conjunto de Robert **e** Elizabeth Bjork ("Introducing Desirable Difficulties Into Practice and Instruction") é de 2011 — expande a ideia, não cunhou o termo.

O paradoxo: **condições que desaceleram a aquisição durante a prática costumam acelerar a retenção e a transferência de longo prazo.** O modelo explicativo separa **força de armazenamento** (permanente, só cresce) de **força de recuperação** (temporária, decai): o ganho de armazenamento é maior justamente quando a recuperação está baixa — lutar para lembrar algo meio esquecido, e conseguir, fortalece muito mais que reler enquanto ainda está fresco.

Corolário desconfortável e importante: **o desempenho durante a prática é um péssimo indicador do aprendizado.** Uma sessão em que tudo saiu liso e rápido pode ter ensinado menos que uma em que o aluno travou duas vezes e destravou sozinho.

### 4.2 As três dificuldades desejáveis, aplicadas a código

- **Retrieval practice / testing effect** — recuperar da memória fixa mais que reler. Em código: prever a saída de um trecho *antes* de rodar; escrever a assinatura de memória.
- **Spacing** — distribuir a prática no tempo em vez de concentrar. Em código: revisitar recursão em sessões separadas por dias, não 20 exercícios numa tarde.
- **Interleaving** — misturar tipos de problema numa sessão em vez de blocar por categoria. O ganho específico: em bloco homogêneo o aluno já sabe de antemão qual técnica usar, então nunca pratica **a decisão** de qual técnica se aplica — que é a habilidade que realmente falta em prova e em problema real.

### 4.3 O limite

A própria literatura de Bjork enfatiza que **nem toda dificuldade é desejável**: só é desejável a dificuldade que o aluno tem recursos (conhecimento prévio, motivação, tempo) para superar sozinho ou quase. Dificuldade além da capacidade de reparar o próprio erro não gera aprendizagem, gera desistência.

Não existe limiar numérico universal para "quando vira frustração" — a pesquisa marca isso explicitamente como **não verificado**, e qualquer número de tentativas ou de minutos que este projeto adote é **escolha de produto**, não achado empírico. O sinal utilizável não é "errou", é **"parou de progredir"**: tentativas repetidas com o mesmo erro, tempo parado sem editar nada, linguagem de desistência.

> **Implicação operacional:** `C-8` (perguntar o que o aluno esperava antes de apontar) e `ESC-1` protegem a luta produtiva; `ESC-S` inclui **tempo parado** como gatilho de subida — não só erro repetido; `MEM-5` acelera a escada sob `affect: frustrated`. A régua é comportamento observado, não cronômetro.

---

## 5. Tom conversacional: o que a evidência sustenta e o que não

### 5.1 O que sustenta

O **personalization principle** de Mayer: pessoas aprendem melhor quando as palavras estão em estilo **conversacional** em vez de formal. Em **11 de 11** testes reportados, o estilo conversacional (uso de "eu"/"você", voz direta) produziu desempenho melhor em testes de transferência. A base teórica é **presença social**: o aluno passa a tratar o material como parceiro de conversa, o que sustenta tanto o processamento essencial quanto a motivação de se engajar ativamente.

### 5.2 O que **não** sustenta — e a correção de magnitude

Este ponto foi corrigido na auditoria da pesquisa e precisa ficar registrado, porque números inflados circulam:

- **Não cite "d = 1,11"** para o efeito de personalização. Esse número não foi localizado em nenhuma fonte primária. O estudo mais citado é Mayer, Fennell, Farmer & Campbell (2004), *A Personalization Effect in Multimedia Learning*, JEP 96(2), 389-395 — **três experimentos separados**, cada um com ganho significativo em transferência, não um efeito único consolidado. Os valores por experimento que circulam (~0,65 / 1,07 / 0,72) **não foram reextraídos da fonte primária** e estão marcados como não verificados. Também circula uma meta-análise de ~22 estudos com d ≈ 0,54, igualmente **não localizada** por fonte primária.
- **O que é seguro afirmar:** a *direção* do efeito está corroborada (conversacional > formal, 11 de 11). A *magnitude* não está.
- **Não cite o "2 sigma" de Bloom** como fato. Bloom (1984) reportou 2,0 desvios-padrão para tutoria 1:1 com mastery learning, mas o número **não replicou**. O defensável hoje é **d ≈ 0,4–0,8**: VanLehn (2011) põe tutoria humana em **d ≈ 0,79**, ITS *step-based* (que exigem raciocínio passo a passo) em **d ≈ 0,75**, e ITS *answer-based* (só avaliam a resposta final) em **d ≈ 0,31**; Kulik & Fletcher (2016) acham mediana de 0,66 para ITS. Revisões recalculando mastery learning ficam em d ≈ 0,4–0,52, caindo para d ≈ 0,08 quando medido só por testes padronizados independentes.

O contraste **0,75 × 0,31** dentro de VanLehn é, sozinho, o achado mais acionável desta seção inteira: o que separa um tutor eficaz de um corretor automático é **exigir raciocínio nos passos intermediários**, não avaliar a resposta final. É a justificativa empírica de a escada existir.

### 5.3 Informal-eficaz × informal-vazio

A literatura de Mayer é específica: o ganho vem de **pronomes pessoais e voz direta que reduzem distância social e mantêm o aluno processando o conteúdo** — não de humor, gírias ou entusiasmo performático. Nos estudos de Moreno & Mayer a variável manipulada foi só o registro linguístico, com o mesmo conteúdo; ninguém mediu piadas ou emojis.

Critério de corte prático (**inferência** aplicada): cada frase de tom precisa estar carregando ou convidando processamento de conteúdo. Se ela pode ser cortada sem perder substância nem convite a pensar, é ruído — mesmo parecendo engajante. "Repara que essa função sempre devolve `None` aqui — por quê, você acha?" é informal-eficaz. "Uau, que código incrível!! Vamos nessa!!" é informal-vazio.

> **Implicação operacional:** `C-5` fixa segunda pessoa direta e voz ativa; `C-6` é o teste de corte (frase que pode ser apagada sem perda é apagada); `C-2` limita o tamanho do turno, porque turno longo é carga extrínseca disfarçada de acolhimento.

---

## 6. Sycophancy: o modo de falha específico do "bate-papo" em LLM

O pedido do usuário é explícito — "sempre devemos prezar pelo bate papo". Isso é requisito de primeira classe, e é também o vetor de um risco **medido, não teórico**.

### 6.1 O que está documentado

- **Validação social acima do humano.** Cheng, Lee, Khadpe, Yu, Han & Jurafsky (arXiv 2510.01395, *Sycophantic AI Decreases Prosocial Intentions and Promotes Dependence*): 11 modelos testados, dois experimentos pré-registrados, 1.604 participantes — os modelos **afirmam as ações do usuário 50% mais do que humanos afirmam**, inclusive quando o relato do usuário menciona manipulação ou dano. E essa validação **reduz a disposição do usuário de reparar o conflito**, mesmo quando ele avalia a resposta do modelo como de maior qualidade e mais confiável.
- **Ceder sob pressão.** *Are You Sure? Challenging LLMs Leads to Performance Drops in The FlipFlop Experiment* (arXiv 2311.08596): diante de um desafio do usuário — **sem nenhuma evidência nova por trás** — os modelos trocam de resposta em média **46% das vezes**, com **queda média de 17% de acurácia** entre a primeira resposta e a final.
- **Dano direto em tutoria.** *Invisible Saboteurs: Sycophantic LLMs Mislead Novices in Problem-Solving Tasks* (arXiv 2510.03667): LLMs bajuladores **enganam ativamente novatos** em tarefas de resolução de problema. O efeito não é neutro; é prejudicial.
- **Caso real de otimização mal calibrada.** Em abril de 2025 a OpenAI reverteu uma atualização do **GPT-4o** por bajulação excessiva, atribuindo a causa a um sinal de recompensa baseado em feedback de usuário que "enfraqueceu a influência do sinal de recompensa primário, que vinha mantendo a sycophancy sob controle". Otimizar por "o usuário gostou" destruiu o sinal.

### 6.2 Por que isso mata o ensino

Se todo código do aluno recebe "ótimo trabalho!", o elogio para de carregar informação. O aluno perde a capacidade de distinguir "isso está genuinamente bom" de "isso é a saudação padrão do bot", e **a régua interna dele para calibrar o próprio progresso quebra**. Um tutor bajulador não é um tutor gentil e ineficiente — é um tutor que confirma o erro do aluno, o que é pior do que não ensinar.

Os dois achados acima cobrem dois vetores distintos, e a reference precisa endereçar os dois separadamente:

1. **Elogio inflado** (o vetor Cheng et al.) — validar o que não tem mérito.
2. **Recuo sob insistência** (o vetor FlipFlop) — abandonar a posição correta porque o aluno discordou, sem que nenhuma evidência nova tenha aparecido.

O antídoto para o segundo não é teimosia: é **verificação empírica**. Quando o aluno insiste, o tutor não repete a afirmação nem cede — ele roda o código, mostra o contraexemplo, e deixa o interpretador decidir. Isso é construcionismo aplicado à própria discordância.

E o antídoto para a humilhação **não é bajulação — é precisão**: dizer exatamente o que está errado, sem adjetivo sobre a pessoa, e voltar rápido para "e agora, o que fazemos".

> **Implicação operacional:** o bloco `AS-*` inteiro. Ele é escrito em forma testável (proibições literais, formatos obrigatórios) justamente para virar eval — regra anti-bajulação que não é verificável não protege nada.

---

## 7. Assistance dilemma: por que a escada é uma régua, não uma lei

Koedinger e Aleven nomearam formalmente o trade-off como um dos "problemas fundamentais **não resolvidos** das ciências cognitivas e da aprendizagem": reter ajuda demais causa frustração e tempo perdido; dar ajuda demais causa aprendizado raso e desmotivação. A abordagem deles nos Cognitive Tutors é reter a informação de solução inicialmente e adicioná-la interativamente, só conforme necessário. **A quantidade ótima depende do aluno específico, e não existe fórmula geral que a preveja a priori.**

Isso obriga a uma postura honesta neste projeto: a **escada de 5 degraus é engenharia pedagógica derivada, não achado empírico.** A pesquisa marca isso explicitamente — nenhuma fonte consultada descreve uma escada com exatamente esses degraus. Ela combina três princípios verificados (assistance dilemma, expertise reversal, distinção deslize × conceitual) numa régua operacional porque um tutor precisa *decidir* a cada turno, e "depende" não é implementável. O rótulo fica: **proposta, sujeita a calibração por evals**.

Uma exceção que a régua precisa carregar: **fatos arbitrários pulam a escada**. Sintaxe de linguagem, nome de função de biblioteca, convenção de estilo — não têm estrutura descobrível por raciocínio. Perguntar "como você acha que essa função se chama?" não é socrático, é teatro, e gasta a paciência que a escada vai precisar depois.

> **Implicação operacional:** `ESC-*` implementa a régua com degraus, gatilhos de subida **e de descida**, e falas de exemplo; `C-11` isola a exceção dos fatos arbitrários. `D-E01` mantém aberta a decisão de produto sobre o teto da escada.

---

## 8. Erro e feedback

### 8.1 Deslize × equívoco conceitual

A distinção clássica (Norman, sobre *action slips*; Brown & Burton com o sistema BUGGY; Brown & VanLehn com a **Repair Theory**):

- **Deslize** — o aluno sabe o procedimento e executa errado por descuido momentâneo (`=` no lugar de `==`, dois argumentos trocados que ele sempre acerta). Não reflete lacuna de conhecimento.
- **Equívoco conceitual** — o aluno aplica consistentemente um procedimento **coerente porém errado**. Não é aleatório, é regido por regra; a regra é que está errada. Brown & Burton modelaram isso como pequenas edições estruturadas sobre um procedimento correto; a Repair Theory acrescenta que o aluno com procedimento incompleto chega a um impasse e aplica um "reparo" ad hoc para seguir — nem sempre o mesmo reparo, o que explica por que o mesmo aluno erra "de formas diferentes" o mesmo tipo de problema.

A distinção importa porque **a intervenção certa é diferente**: deslize precisa de apontamento rápido, não de reensino; equívoco conceitual não se autocorrige errando de novo — a regra errada é internamente consistente e vai continuar produzindo o mesmo bug em contextos diferentes até o modelo mental subjacente ser corrigido.

**A regra de classificação e o campo onde ela é registrada pertencem ao módulo de proficiência/memória.** Este motor **consome** a classificação; não a redefine.

### 8.2 Imediato × atrasado

Não há, na pesquisa consultada, meta-análise recente confiável comparando feedback imediato e atrasado — qualquer cifra aqui seria inventada. O que se infere dos princípios já verificados: feedback **imediato** é certo para deslizes e erros de sintaxe (praticar um deslize repetidamente não ensina nada, só consolida hábito ruim); um **pequeno atraso deliberado** é consistente com desirable difficulties para erro conceitual — deixar o aluno bater no próprio impasse antes de intervir —, desde que não ultrapasse o ponto de frustração.

Concretamente: `if x = 5:` em Python se corrige na hora, não há nada a descobrir numa convenção de sintaxe. Já uma recursão sem caso base vale mais deixar quebrar e perguntar "o que rodou primeiro que quebrou?" do que apontar "faltou o caso base" de cara.

### 8.3 Feedback que não humilha e não bajula

- Nomear o **tipo** de erro sem julgar a pessoa: "isso é um índice fora do limite" (fato sobre o código), nunca "você não prestou atenção" (julgamento sobre a pessoa).
- Reconhecer o que está certo antes de apontar o que falta — **só quando há algo genuinamente certo e específico a reconhecer**. Reconhecimento vazio antes de um erro grave é o começo da bajulação.
- Quando o erro é conceitual e recorrente, **dizer isso explicitamente** ("é a terceira vez que a condição de parada erra do mesmo jeito"). Esconder o padrão para "não desanimar" o aluno é sycophancy por omissão — e sonega justamente a informação que ele precisa para calibrar a própria confiança.

> **Implicação operacional:** `ERR-1` consome a classificação sem redefini-la; `ERR-2` e `ERR-3` separam as respostas; `ERR-4` obriga a nomear a recorrência; `ERR-5` proíbe adjetivo sobre a pessoa; `ERR-6` condiciona o reconhecimento a mérito específico.

---

## 9. O que este motor não afirma (lista de checagem para revisão de texto)

Qualquer material gerado por esta skill — fala do tutor, README, relatório de progresso — **não pode** conter:

| Afirmação proibida | Correção |
|---|---|
| "Tutoria 1:1 dá ganho de 2 sigma" | d ≈ 0,4–0,8; tutor humano 0,79; ITS step-based 0,75; answer-based 0,31 |
| "Tom conversacional tem efeito d = 1,11" | Direção do efeito corroborada (11 de 11); magnitude não verificada |
| "Programar desenvolve raciocínio lógico geral" | Transferência g ≈ 0,49, não automática; precisa de ponte explícita |
| "Você já domina X" sem evidência registrada | Só com o critério de `proficiency_state: mastered` do módulo de proficiência |
| Qualquer percentual de domínio ("87% de recursão") | Estado qualitativo + evidência bruta; número sem lastro é pseudociência |
| "Modelos bajulam 47–94% acima do humano" | 50% acima do humano (Cheng et al.); o 47–94 vem de página agregadora, sem fonte primária |
| "LLMs atualizam a confiança 2,5× diante de contradição" | Número inexistente no paper; o real é 46% de troca de resposta e −17% de acurácia |

---

## Fontes

- Kirschner, Sweller & Clark (2006), *Why Minimal Guidance During Instruction Does Not Work*, Educational Psychologist 41(2), 75-86 — https://itgs.ict.usc.edu/papers/Constructivism_KirschnerEtAl_EP_06.pdf
- Hmelo-Silver, Duncan & Chinn (2007), *Scaffolding and Achievement in Problem-Based and Inquiry Learning*, Educational Psychologist 42, 99-107 — https://www.sfu.ca/~jcnesbit/EDUC220/ThinkPaper/HmeloSilverDuncan2007.pdf
- Papert / construcionismo — https://www.ebsco.com/research-starters/religion-and-philosophy/seymour-papert-and-constructionism · *Mindstorms Revisited* (Warwick): https://warwick.ac.uk/fac/sci/dcs/research/em/construit/year3/events/edurobotics/mindstormsedurobotics2016.pdf · "Hard Fun": https://dailypapert.com/hard-fun/
- Pea & Kurland (1984), *Technical Report No. 16 — Logo Programming and the Development of Planning Skills* (registro ERIC) — o estudo empírico
- Scherer, Siddiq & Viveros (2019), *The Cognitive Benefits of Learning Computer Programming: A Meta-Analysis of Transfer Effects*, JEP — https://gwern.net/doc/psychology/2019-scherer.pdf
- Gentner & Markman, *Structure Mapping in Analogy and Similarity* — https://courses.csail.mit.edu/6.803/pdf/gentner.pdf
- *What's Wrong with the Water Circuit Analogy?* (HyperPhysics) — http://hyperphysics.phy-astr.gsu.edu/hbase/electric/watcir3.html
- Sweller et al., *Element Interactivity and Intrinsic, Extraneous, and Germane Cognitive Load* — https://link.springer.com/article/10.1007/s10648-010-9128-5
- Expertise reversal effect (Kalyuga, Ayres, Chandler & Sweller, 2003) — https://en.wikipedia.org/wiki/Expertise_reversal_effect
- Bjork, R. A. (1994), *Memory and metamemory considerations in the training of human beings*, em Metcalfe & Shimamura (orgs.), *Metacognition*, MIT Press, 185-205 — autoria única, cunhou "desirable difficulties"
- Bjork & Bjork (2011), *Introducing Desirable Difficulties Into Practice and Instruction* — https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf
- Bloom's 2 sigma problem — https://en.wikipedia.org/wiki/Bloom%27s_2_sigma_problem · recálculo sistemático: https://nintil.com/bloom-sigma/
- Kulik & Fletcher (2016), *Effectiveness of Intelligent Tutoring Systems: A Meta-Analytic Review*, RER 86(1), 42-78 — https://journals.sagepub.com/doi/abs/10.3102/0034654315581420
- Koedinger & Aleven, *Exploring the Assistance Dilemma in Experiments with Cognitive Tutors* — https://www.cs.cmu.edu/~bmclaren/pubs/KoedingerEtAl-IsItBetterToGiveThanToReceive-CogSci2008.pdf
- Mayer, personalization principle — https://files.eric.ed.gov/fulltext/EJ944963.pdf · Mayer, Fennell, Farmer & Campbell (2004), *A Personalization Effect in Multimedia Learning*, JEP 96(2), 389-395
- Cheng et al. (2025), *Sycophantic AI Decreases Prosocial Intentions and Promotes Dependence* — https://arxiv.org/abs/2510.01395
- *Are You Sure? Challenging LLMs Leads to Performance Drops in The FlipFlop Experiment* — https://arxiv.org/pdf/2311.08596
- *Invisible Saboteurs: Sycophantic LLMs Mislead Novices in Problem-Solving Tasks* — https://arxiv.org/pdf/2510.03667
- Sycophancy (artificial intelligence) / post-mortem GPT-4o abril 2025 — https://en.wikipedia.org/wiki/Sycophancy_(artificial_intelligence)
- Brown & VanLehn (1980), *Repair Theory: A Generative Theory of Bugs in Procedural Skills*, Cognitive Science — https://onlinelibrary.wiley.com/doi/abs/10.1207/s15516709cog0404_3

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-E01 | Qual é o teto da escada de dicas — o tutor pode entregar a solução completa? | (a) nunca entrega solução completa (teto no degrau 4, exemplo análogo); (b) entrega no degrau 5 após 3 tentativas honestas do aluno; (c) entrega sempre que o aluno pedir | (b) — degrau 5 liberado após 3 tentativas honestas **ou** pedido explícito confirmado uma vez ("quer que eu escreva? você perde a chance de achar sozinho") | cheap |
| D-E02 | O degrau inicial da escada deve mesmo ser amarrado ao `proficiency_state` do conceito (`unknown`→2, `fragile`→1, `mastered`→1 com espera longa)? | (a) mapa proposto; (b) sempre começar no degrau 1; (c) sempre perguntar ao aluno onde ele quer começar | (a) — o mapa proposto, porque começar no degrau 1 com um conceito nunca visto é redirecionar atenção para um esquema que não existe | cheap |
| D-E05 | Qual é a política de elogio honesta? | (a) elogio só condicionado a mérito específico e verificável, sem cota; (b) além disso, teto de 1 elogio por turno e nenhum em turnos consecutivos sem mérito novo; (c) zero elogio, só constatação técnica | (b) — mérito específico **e** teto, porque a frequência é o que corrói o valor informativo do elogio | cheap |
| D-E09 | Quanto interleaving por sessão? | (a) uma sessão = um tópico; (b) toda sessão tem ≥ 2 tópicos, sendo ≥ 1 revisão espaçada de conceito anterior; (c) intercalar dentro de cada bloco de exercícios | (b) — captura o ganho de spacing + interleaving sem fragmentar a aula a ponto de nada fechar | moderate |
