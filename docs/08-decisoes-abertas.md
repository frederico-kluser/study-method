# 08 — Decisões abertas: o que a skill pergunta, quando, por quê, e a que custo

> Este documento é a **camada humana** de `skills/study-method/assets/decisions.json`.
> O catálogo é a fonte de verdade sobre quais decisões existem, quais opções valem e qual é
> o default; este arquivo é derivado dele. Divergência entre os dois é bug **deste** arquivo.
> A terceira camada é o script `skills/study-method/scripts/decisions-ask.sh`, que faz a
> pergunta em runtime, e a instrução de tom vive em `skills/study-method/references/decisoes.md`.

São **114 decisões**. Você não precisa ler 114 — e essa é justamente a ideia do documento:
elas estão organizadas por **quando aparecem na sua vida**, não por assunto. Se você só quer
começar a estudar, leia a §2 (seis perguntas) e feche o arquivo.

## Sumário

- [1. Como usar este documento](#1-como-usar-este-documento)
- [2. Camada 1 — o dia zero: as 6 perguntas](#2-camada-1--o-dia-zero-as-6-perguntas)
- [3. Camada 2 — no momento certo (14)](#3-camada-2--no-momento-certo-14)
- [4. Camada 3 — sob demanda (33)](#4-camada-3--sob-demanda-33)
- [5. Camada 4 — congeladas (61): decisões de quem constrói](#5-camada-4--congeladas-61-decisões-de-quem-constrói)
- [6. Índice completo dos 114 ids](#6-índice-completo-dos-114-ids)
- [7. Ids absorvidos (busca pelo nome antigo)](#7-ids-absorvidos-busca-pelo-nome-antigo)

---

## 1. Como usar este documento

### 1.1 As quatro camadas, e por que existem

A pergunta certa na hora errada é ruído. Um programa que abre com 114 perguntas não é
configurável: é intransponível. Por isso cada decisão tem uma **hora**.

| Camada | Quantas | Quando aparece | Quem responde |
|---|---|---|---|
| **1 · dia zero** | 6 | na criação do setup, antes da primeira aula | aluno |
| **2 · no momento certo** | 14 | no primeiro desafio (10) ou quando o histórico fica longo (4) | aluno |
| **3 · sob demanda** | 33 | só quando você pergunta, ou no instante em que a skill precisa da sua autorização para agir | aluno (26) e aluno+builder (7) |
| **4 · congelada** | 61 | nunca vira pergunta — fica documentada aqui | quem constrói a skill |

O teto da camada 1 é **duro: no máximo 6**. Para entrar ali uma decisão passa nos dois
testes: (a) sem a resposta a primeira aula não acontece, ou acontece pior de um jeito que
você perceberia; (b) a resposta cabe numa palavra ou numa escolha de menu. Falhar em um dos
dois rebaixa para outra camada.

### 1.2 ⭐ Aluno e builder são públicos diferentes

O campo `audience` separa dois mundos que nunca devem se misturar:

- **`student`** — perguntada a você, em runtime, pela skill. Fala do seu estudo: quanto tempo
  você tem, se quer ver o mutation score, se a skill pode ler o setup do lado.
- **`builder`** — perguntada a quem **constrói** a skill, em tempo de construção. Fala do
  interior da máquina: forma de schema, exit code, namespace de identificador, operador de
  mutação. **Nada disso é pergunta de aluno.** `D-A10` — o namespace do `$id` dos schemas —
  não chega ao aluno nem por acidente: `decisions-ask.sh` filtra por `audience` antes de
  imprimir qualquer coisa, e recusa gravar resposta de decisão `builder` com exit `2`.
- **`both`** — o builder escolhe o padrão de fábrica; você tem o interruptor.

As camadas 1, 2 e 3 (§2, §3, §4) são o mundo do aluno. A camada 4 (§5) é o mundo do builder,
e está aqui por auditoria, não por menu.

### 1.3 O custo de mudar de ideia

Toda decisão declara `reversibility`. É a informação que falta na maioria dos formulários e
é a que mais importa na hora de decidir depressa:

| Valor | Significa |
|---|---|
| `cheap` | muda numa linha de um arquivo; nenhum dado precisa migrar |
| `moderate` | mudar depois exige migrar dado já escrito, ou mover arquivo que já existe |
| `expensive` | há efeito que **não** se desfaz: histórico de git, dado já gravado, comparação de score invalidada |

Regra de conversa: quando a decisão é `expensive`, o tutor **diz isso na hora de perguntar**.
Quando é `cheap`, ele não faz cerimônia — sugere o default e segue.

### 1.4 ⭐ Se você discorda de um default

Nenhum default é lei. Todos vieram de um documento citado no campo **de onde vem** de cada
entrada — e um documento pode estar errado a respeito de você. Três caminhos:

1. **Na conversa.** Diga em voz alta: *"prefiro 90 minutos"*, *"não quero desafio em Rust,
   quero em Python"*. O tutor grava e não pergunta de novo.
2. **Pela linha de comando**, quando você quiser mudar fora de uma aula:

   ```
   decisions-ask.sh <setup_root> <fase>                    # o que ainda está em aberto
   decisions-ask.sh <setup_root> --record D-B15 m90        # sua resposta, gravada
   decisions-ask.sh <setup_root> --defaults setup-init     # assume os padrões, declarando cada um
   ```

3. **Mudando o catálogo**, se o default está errado para todo mundo e não só para você: a
   correção é em `assets/decisions.json`, e este documento é regerado a partir dele.

Se você **não** responder, a skill usa o default — e **avisa que usou**. Default aplicado em
silêncio é bug, não conveniência: a resposta fica gravada com `default_used: true` e o tutor
diz, uma vez, o que assumiu e como mudar.

### 1.5 Como ler uma entrada

Cada entrada traz: a **pergunta** (em citação, o texto exato que vai ao aluno), o **por que
importa** com a analogia, a tabela de **opções** com prós e contras — a opção marcada ⭐ é o
default —, **de onde vem** o default, o **custo de mudar depois** e **onde a resposta é
gravada** no `setup.json`.

Um detalhe de forma: chaves, ids e valores do catálogo são ASCII sem acento por contrato de
projeto, e é assim que aparecem aqui, literais. O tutor fala com acentuação normal.

---

## 2. Camada 1 — o dia zero: as 6 perguntas

**Público: aluno.** Fase `setup-init`. Teto duro de 6 — e são exatamente 6.

São elas que definem a primeira impressão do projeto: é a única vez em que a skill pergunta
mais de uma coisa seguida, e mesmo assim **uma de cada vez, esperando resposta**. A ordem
abaixo é a ordem em que elas são feitas, e ela não é arbitrária: a primeira dá contexto às
outras cinco.

Ordem: `D-B13` → `D-B04` → `D-B14` → `D-B17` → `D-B15` → `D-B16`.

O atalho existe desde a primeira pergunta: *"posso assumir os padrões e a gente ajusta no
caminho"*. Quem só quer começar, começa — e recebe a lista do que foi assumido.

Uma exceção honesta: **`D-B13` não tem default possível.** "O que você quer estudar" é texto
livre seu; não há padrão de fábrica para isso. `--defaults setup-init` aplica as outras cinco
e declara que essa continua pendente.

#### D-B13 — O que voce quer estudar?

> O que voce quer estudar?

**Por que importa.** E a unica pergunta sem a qual nada existe: nao ha aula, nao ha nome de pasta, nao ha criterio para saber se um trecho do seu material e relevante. E o endereco da viagem - sem ele nem da para escolher a estrada. Resposta de uma frase; o resto (a area, o nome da pasta, a lista de topicos) eu derivo dela e voce corrige quando quiser.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `free_text` ⭐ — Uma frase sua: 'Calculo I', 'Kubernetes', 'harmonia funcional' | + Uma pergunta, uma frase, e a partir dai tudo tem contexto<br>+ De `title` eu derivo `subject`, `setup_name` e a taxonomia inicial<br>+ Trocar o titulo depois nao muda a identidade do setup | − Um titulo muito vago ('programacao') da uma trilha inicial vaga |

- **Default (⭐):** `free_text` — Uma frase sua: 'Calculo I', 'Kubernetes', 'harmonia funcional'
- **De onde vem esse default:** docs/10-bootstrap.md#62-as-perguntas-minimas-6--1-confirmacao (Q1)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `title`
- **Quem responde:** aluno · **quando:** `setup-init` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B13 free_text --value "<o seu texto>"
```

#### D-B04 — Crio a pasta do estudo em `~/estudos/<assunto>`? Ou voce prefere outro lugar?

> Crio a pasta do estudo em `~/estudos/<assunto>`? Ou voce prefere outro lugar?

**Por que importa.** E o unico dano do dia zero que da trabalho de desfazer: criar quatro diretorios e um README no meio de um projeto que nao tinha nada a ver. Mover depois e possivel, mas alguem precisa perceber que aconteceu. E pergunta de uma tecla - o default ja vem montado na frase.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `cwd_or_home` ⭐ — Pasta atual se ela estiver vazia; senao `~/estudos/<assunto>` | + Respeita quem ja abriu o terminal no lugar certo<br>+ Nunca espalha pasta de estudo dentro de um projeto de codigo<br>+ O default aparece escrito na propria pergunta: e uma tecla para aceitar | − Quem queria a pasta atual nao-vazia precisa dizer |
| `always_home` — Sempre em `~/estudos/<assunto>` | + Todos os estudos num lugar so | − Ignora quem ja estava no diretorio certo |
| `always_ask` — Sempre perguntar sem propor nada | + Nenhuma suposicao | − Pergunta aberta onde uma tecla resolveria |

- **Default (⭐):** `cwd_or_home` — Pasta atual se ela estiver vazia; senao `~/estudos/<assunto>`
- **De onde vem esse default:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + docs/10-bootstrap.md#62-as-perguntas-minimas-6--1-confirmacao (Q2)
- **Custo de mudar depois:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Grava em:** `decisions.D-B04`
- **Quem responde:** aluno · **quando:** `setup-init` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B04 cwd_or_home
```

#### D-B14 — Voce ja tem material - PDF, slides, anotacoes - ou eu comeco do zero?

> Voce ja tem material - PDF, slides, anotacoes - ou eu comeco do zero?

**Por que importa.** Decide qual e a proxima coisa que acontece: ler o que voce trouxe, escrever uma base inicial, ou dar aula sem base local e dizer isso em voz alta. E a diferenca entre o professor que leu a ementa da sua faculdade e o que esta improvisando - e voce merece saber qual dos dois esta falando com voce.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `student_provided` — Tenho material e vou por na pasta | + A aula fica ancorada no que vai cair na sua prova<br>+ A ingestao comeca imediatamente | − Exige voce mover os arquivos para a pasta |
| `generated` ⭐ — Nao tenho - escreve uma base inicial para mim | + Sai do zero com uma trilha coerente<br>+ Fica em `docs/generated/`, sempre marcado como gerado | − Base gerada nao e a ementa do seu curso |
| `none` — Nem um nem outro - so da aula | + Comeco imediato | − O tutor declara em voz alta que nao ha base local, e a trilha nasce da conversa |

- **Default (⭐):** `generated` — Nao tenho - escreve uma base inicial para mim
- **De onde vem esse default:** docs/10-bootstrap.md#62-as-perguntas-minimas-6--1-confirmacao (Q3) + docs/10-bootstrap.md §7
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `theory_source`
- **Quem responde:** aluno · **quando:** `setup-init` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B14 generated
```

#### D-B17 — Vai ter exercicio de codigo? Se sim, em qual linguagem?

> Vai ter exercicio de codigo? Se sim, em qual linguagem?

**Por que importa.** Nesta maquina rodam sem instalar nada: Python, Node, Rust, Go, C e C++. Define se a pasta de desafios vai ser usada e com qual ferramenta - e errar aqui desperdica o primeiro desafio inteiro. O menu ja vem filtrado pelo que esta instalado: voce nao escolhe o que nao roda. `nenhuma` e resposta legitima, nao ausencia de resposta: assunto sem codigo simplesmente nao usa desafios.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `python` ⭐ — Python | + Roda sem instalar nada nesta maquina<br>+ Melhor cobertura para matematica e ciencia de dados | − Nao pratica tipagem estatica |
| `javascript` — JavaScript (node:test) | + Roda sem instalar nada; testes na propria stdlib | − Aritmetica de ponto flutuante surpreende em exercicio de matematica |
| `rust` — Rust | + Roda sem instalar nada; teste embutido na linguagem | − Build de cada mutante custa segundos - a validacao do desafio fica mais lenta |
| `go` — Go | + Roda sem instalar nada; `go test` embutido | − Menos bibliotecas matematicas na stdlib |
| `c` — C | + Roda sem instalar nada | − Muito atrito para exercicio de conceito |
| `cpp` — C++ | + Roda sem instalar nada | − Muito atrito para exercicio de conceito |
| `none` — Nenhuma - este assunto nao tem codigo | + Assunto sem codigo nao carrega maquinaria de desafio | − Sem desafio executavel, a evidencia de proficiencia vem so do dialogo |

- **Default (⭐):** `python` — Python
- **De onde vem esse default:** docs/10-bootstrap.md#62-as-perguntas-minimas-6--1-confirmacao (Q4) + docs/research/06-toolchains.md §2
- **Custo de mudar depois:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Grava em:** `language.name`
- **Quem responde:** aluno · **quando:** `setup-init` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B17 python
```

#### D-B15 — Quanto tempo voce tem por sessao: 30, 60 ou 90 minutos?

> Quanto tempo voce tem por sessao: 30, 60 ou 90 minutos?

**Por que importa.** Define o tamanho da aula: quanto cobrir e se cabe desafio. Sem isso eu erro o escopo justamente na aula em que ainda nao te conheco - ou sobra materia sem tempo, ou sobra tempo sem materia. Resposta: um numero, e muda depois numa frase sua.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `m30` — 30 minutos | + Cabe num intervalo de almoco<br>+ Forca foco em um conceito so | − Raramente cabe desafio completo |
| `m60` ⭐ — 60 minutos | + Cabe teoria, pratica e 2-3 desafios<br>+ E o tamanho para o qual as regras de escopo foram calibradas | − Exige uma hora livre de verdade |
| `m90` — 90 minutos | + Da para fechar um topico inteiro com pratica | − Atencao cai no ultimo terco para a maioria das pessoas |

- **Default (⭐):** `m60` — 60 minutos
- **De onde vem esse default:** docs/10-bootstrap.md#62-as-perguntas-minimas-6--1-confirmacao (Q5)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `session_minutes`
- **Quem responde:** aluno · **quando:** `setup-init` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B15 m60
```

#### D-B16 — Como voce esta nisso hoje: comecando do zero, ja viu mas esta enferrujado, ou ja manja e quer aprofundar?

> Como voce esta nisso hoje: comecando do zero, ja viu mas esta enferrujado, ou ja manja e quer aprofundar?

**Por que importa.** E o input pedagogico de maior alavancagem do setup inteiro, e custa uma palavra. O andaime que ajuda o novato atrapalha o avancado - explicar o obvio para quem ja sabe nao e so chato, mede-se que piora o desempenho. E ponto de partida declarado, nao nota: as aulas seguintes corrigem sozinhas.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `beginner` ⭐ — Comecando do zero | + Andaime completo, exemplo antes da regra<br>+ Escada de dicas comeca mais alto | − Quem subestimou o proprio nivel acha a primeira aula lenta |
| `intermediate` — Ja vi, mas esta enferrujado | + Revisao rapida antes de avancar<br>+ Menos andaime, mais pratica | − Meio-termo pode parecer raso para um lado e rapido para o outro |
| `advanced` — Ja manjo e quero aprofundar | + Vai direto ao ponto, sem reexplicar o basico<br>+ Evita o efeito de reversao de expertise | − Se voce superestimou, a primeira aula passa por cima de uma lacuna real |

- **Default (⭐):** `beginner` — Comecando do zero
- **De onde vem esse default:** docs/10-bootstrap.md#62-as-perguntas-minimas-6--1-confirmacao (Q6) + docs/research/03-pedagogia.md §3.3
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `skill_level`
- **Quem responde:** aluno · **quando:** `setup-init` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B16 beginner
```

---

## 3. Camada 2 — no momento certo (14)

**Público: aluno.** O assunto destas decisões **não existe** antes de um marco acontecer.
Perguntar antes seria pedir opinião sobre algo que a pessoa ainda não viu.

### 3.1 Fase `first-challenge` — a primeira vez que você enfrenta um desafio (10)

Disparadas na primeira geração de desafio do setup. Antes disso, nenhuma delas faz sentido:
ninguém tem opinião sobre mutation score antes de ver o primeiro teste rodar.

#### D-P12 — Quando voce erra o mesmo conceito tres vezes seguidas, eu mudo de abordagem, volto ao pre-requisito, ou paro o topico por hoje?

> Quando voce erra o mesmo conceito tres vezes seguidas, eu mudo de abordagem, volto ao pre-requisito, ou paro o topico por hoje?

**Por que importa.** Insistir na quarta tentativa com a mesma explicacao e falar mais alto com quem nao entende o idioma. Quase sempre o problema esta um degrau abaixo - e voltar um degrau custa dez minutos, enquanto insistir custa a aula. (Decisao nova, levantada em 3.0.)

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `prereq` ⭐ — Voltar ao pre-requisito e so depois retomar | + Ataca a causa em vez do sintoma<br>+ Casa com a excecao de `concept_id` para pre-requisito descoberto | − Sai do topico que o aluno queria estudar hoje |
| `reframe` — Mudar de abordagem no mesmo conceito (outra analogia, outra representacao) | + Fica no topico | − Se a lacuna for de pre-requisito, a terceira analogia falha igual |
| `stop_topic` — Parar o topico por hoje e marcar para a proxima | + Evita a espiral de frustracao | − Termina a aula com a sensacao de derrota |

- **Default (⭐):** `prereq` — Voltar ao pre-requisito e so depois retomar
- **De onde vem esse default:** novo em 3.0 — apoiado em docs/02-pedagogia.md §escada de dicas e docs/04-proficiencia.md §6.4
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-P12`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-P12 prereq
```

#### D-E01 — Quando voce travar, eu chego a escrever a solucao inteira ou paro antes disso?

> Quando voce travar, eu chego a escrever a solucao inteira ou paro antes disso?

**Por que importa.** Dar a resposta e carregar quem esta aprendendo a andar de bicicleta: e mais rapido hoje e nao ensina nada. Mas recusar para sempre transforma o tutor em enigma. O degrau 5 liberado depois de tres tentativas honestas, ou a pedido confirmado uma vez, mantem os dois lados.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `step5_after3` ⭐ — Libero a solucao no degrau 5, depois de 3 tentativas honestas ou pedido confirmado uma vez | + Preserva a chance de voce achar sozinho<br>+ Nao vira parede: existe uma saida declarada<br>+ O pedido explicito e confirmado com o custo dito em voz alta | − Quem so queria ver a resposta gasta tres tentativas antes |
| `never_full` — Nunca entrego a solucao completa (teto no degrau 4) | + Maximo de esforco produtivo | − Transforma o tutor em enigma, e o aluno vai buscar a resposta em outro lugar |
| `always` — Entrego sempre que voce pedir | + Zero atrito | − A escada de dicas deixa de existir na pratica |

- **Default (⭐):** `step5_after3` — Libero a solucao no degrau 5, depois de 3 tentativas honestas ou pedido confirmado uma vez
- **De onde vem esse default:** docs/02-pedagogia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-E01`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-E01 step5_after3
```

#### D-C01 — Se voce editar o arquivo de teste do desafio, eu ignoro, aviso, ou recuso contar como resolvido?

> Se voce editar o arquivo de teste do desafio, eu ignoro, aviso, ou recuso contar como resolvido?

**Por que importa.** O teste e o gabarito lacrado. Mexer nele para o codigo passar e apagar a pergunta em vez de responde-la - mas voce esta aqui por vontade propria, e o unico prejudicado seria voce. Avisar que o lacre foi rompido e honesto; bloquear e policiar quem pediu para aprender.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `warn` ⭐ — Aviso e continuo | + Diz a verdade sem virar guarda de prova<br>+ Detectado por SHA-256: o aviso e um fato, nao uma suspeita<br>+ Muda com uma linha no manifesto do desafio | − Um teste adulterado ainda entra no historico como resolvido |
| `off` — Ignoro | + Zero atrito | − A evidencia de proficiencia passa a valer menos e ninguem sabe disso |
| `block` — Recuso contabilizar como resolvido | + A evidencia fica limpa | − Trata o aluno como adversario, e quem edita o teste as vezes so estava explorando |

- **Default (⭐):** `warn` — Aviso e continuo
- **De onde vem esse default:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-C01`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C01 warn
```

#### D-C05 — Quantos desafios por aula?

> Quantos desafios por aula?

**Por que importa.** Dois ou tres e o que cabe numa aula de 60 minutos sem virar lista de exercicio. O primeiro num conceito que esta fragil (para firmar) e o ultimo num conceito novo (para esticar) e a ordem que aproveita a energia na sequencia certa.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `two_three` ⭐ — 2 a 3, o primeiro num conceito fragil e o ultimo num conceito novo | + Cabe numa sessao tipica sem espremer a explicacao<br>+ A ordem aproveita a energia: firma antes de esticar<br>+ Ilimitado continua disponivel sob pedido explicito | − Quem esta empolgado precisa pedir mais |
| `one` — 1 | + Sobra tempo para teoria | − Pouca pratica para fixar qualquer coisa |
| `unlimited` — Ilimitado - eu decido na hora | + Autonomia total | − A aula vira lista de exercicio e a teoria some |

- **Default (⭐):** `two_three` — 2 a 3, o primeiro num conceito fragil e o ultimo num conceito novo
- **De onde vem esse default:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-C05`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C05 two_three
```

#### D-C06 — Quando voce pode ver a solucao guardada do desafio?

> Quando voce pode ver a solucao guardada do desafio?

**Por que importa.** E o gabarito no fim do livro. Existe, e util, e olhar antes de tentar transforma o exercicio em leitura. A pedido, no ultimo degrau da escada, com o desafio contando como ensinado e nao como resolvido - a evidencia continua dizendo a verdade.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `on_request_last_step` ⭐ — A pedido, no ultimo degrau da escada, gravando `solution_revealed` | + Existe saida, e ela custa uma escolha consciente<br>+ O historico registra 'ensinado', nao 'resolvido' - a evidencia nao mente | − Quem so queria conferir precisa passar pela escada |
| `after_solving` — So depois de resolver | + Zero risco de spoiler | − Quem travou de verdade fica sem saida |
| `never` — Nunca | + Maximo esforco | − A resposta vai ser procurada em outro lugar, sem o registro |
| `anytime` — A qualquer momento | + Autonomia total | − O desafio vira leitura de gabarito |

- **Default (⭐):** `on_request_last_step` — A pedido, no ultimo degrau da escada, gravando `solution_revealed`
- **De onde vem esse default:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-C06`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C06 on_request_last_step
```

#### D-C11 — Voce quer ver o relatorio de qualidade do desafio (mutation score, sobreviventes) ou so o enunciado?

> Voce quer ver o relatorio de qualidade do desafio (mutation score, sobreviventes) ou so o enunciado?

**Por que importa.** E a ficha tecnica do exercicio: quao bem o teste que veio junto realmente testa. Interessante e honesto - e mostrada sempre desloca a sua atencao do problema para a metodologia.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `on_demand` ⭐ — Sob demanda | + A transparencia continua disponivel<br>+ A atencao fica no problema | − Quem gosta do dado precisa pedir |
| `always` — Sempre, no enunciado | + Transparencia maxima | − Comeca o exercicio falando de metodologia em vez do problema |
| `hide` — Esconder | + Enunciado limpo | − Some com a unica evidencia de que o desafio foi verificado |

- **Default (⭐):** `on_demand` — Sob demanda
- **De onde vem esse default:** skills/study-method/references/challenge-protocol.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-C11`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C11 on_demand
```

#### D-C13 — Quando voce resolve um desafio, eu ja emendo o proximo do mesmo conceito ou pergunto?

> Quando voce resolve um desafio, eu ja emendo o proximo do mesmo conceito ou pergunto?

**Por que importa.** Emendar automaticamente e o proximo episodio que comeca sozinho: funciona ate a hora em que voce queria ter parado. Perguntar devolve a voce a decisao de parar, que e a unica que a maquina nao tem como tomar.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `ask` ⭐ — Pergunto | + Respeita cansaco, que a maquina nao mede<br>+ A decisao de parar continua sendo sua | − Uma pergunta a mais por desafio resolvido |
| `auto` — Emendo automaticamente | + Fluxo continuo | − Ignora cansaco e tira do aluno a decisao de parar |
| `never` — Nunca - so se voce pedir outro | + Zero insistencia | − Perde o momento em que emendar era exatamente o certo |

- **Default (⭐):** `ask` — Pergunto
- **De onde vem esse default:** skills/study-method/references/challenge-protocol.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-C13`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C13 ask
```

#### D-C18 — Os desafios podem usar biblioteca externa (numpy, lodash) ou so o que vem com a linguagem?

> Os desafios podem usar biblioteca externa (numpy, lodash) ou so o que vem com a linguagem?

**Por que importa.** Biblioteca externa e a furadeira emprestada: resolve rapido e voce nao aprende a segurar a chave de fenda. Para exercicio de conceito, stdlib e quase sempre o certo; para quem ja domina o conceito e quer praticar a ferramenta real, o contrario. (Decisao nova, levantada em 3.0: nenhum documento dizia o que o desafio pode importar.)

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `stdlib_only` ⭐ — So o que vem com a linguagem | + O desafio roda em qualquer maquina, sem instalar nada<br>+ Forca o conceito a aparecer em vez de virar uma chamada de funcao<br>+ Casa com a promessa de rodar sem instalar nada | − Nao pratica a ferramenta que o aluno vai usar no trabalho |
| `allow_installed` — Pode usar o que ja estiver instalado nesta maquina | + Pratica realista | − O mesmo desafio nao roda na maquina do lado |
| `ask_per_challenge` — Pergunto a cada desafio | + Controle fino | − Uma pergunta a mais por desafio |

- **Default (⭐):** `stdlib_only` — So o que vem com a linguagem
- **De onde vem esse default:** novo em 3.0 — apoiado em docs/05-challenges-tdd.md §sandbox e docs/research/06-toolchains.md §2 (rodar sem instalar nada)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-C18`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C18 stdlib_only
```

#### D-V04 — A linguagem e uma so para o estudo inteiro, ou muda de aula para aula?

> A linguagem e uma so para o estudo inteiro, ou muda de aula para aula?

**Por que importa.** Trocar de linguagem toda aula e trocar de idioma toda conversa: voce nunca passa do basico em nenhuma. Uma por setup acumula fluencia; o override por sessao cobre o dia em que voce quer comparar como fica em outra.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `per_setup` ⭐ — Uma por setup, com override explicito por sessao | + A fluencia acumula<br>+ Os desafios formam um corpo coerente<br>+ O override cobre a excecao sem virar regra | − Desafios ja gerados ficam na linguagem antiga se voce trocar |
| `per_session` — Por sessao, sempre perguntada | + Flexibilidade total | − Uma pergunta por aula e nenhuma fluencia acumulada |
| `per_subject` — Por assunto (uma para matematica, outra para programacao) | + Casa com a natureza de cada topico | − Precisa classificar topico em categoria, o que ninguem quer fazer |

- **Default (⭐):** `per_setup` — Uma por setup, com override explicito por sessao
- **De onde vem esse default:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui + skills/study-method/references/languages.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Grava em:** `decisions.D-V04`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-V04 per_setup
```

#### D-V05 — Quando a linguagem que voce escolheu nao esta instalada, o que eu faco?

> Quando a linguagem que voce escolheu nao esta instalada, o que eu faco?

**Por que importa.** E chegar na oficina e faltar a chave certa. Nao adianta tentar com a errada (erro sem diagnostico) nem mandar voce embora ate comprar a chave. Mostro o comando exato de instalacao e, na mesma mensagem, ofereco fazer a aula de hoje numa linguagem que ja roda aqui.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `show_and_offer` ⭐ — Mostro o comando de instalacao E ofereco seguir hoje numa linguagem instalada | + A aula de hoje acontece<br>+ O caminho para a linguagem que voce queria fica documentado<br>+ Nunca executo instalacao por conta propria | − Duas informacoes numa mensagem so |
| `show_only` — So mostro o comando de instalacao | + Foco na escolha original | − A aula de hoje nao acontece |
| `try_anyway` — Tento assim mesmo | + Nenhuma pergunta | − Erro de toolchain sem diagnostico, que o aluno nao tem como interpretar |
| `block` — Bloqueio ate instalar | + Consistencia | − Trava a aula por causa de um pacote |

- **Default (⭐):** `show_and_offer` — Mostro o comando de instalacao E ofereco seguir hoje numa linguagem instalada
- **De onde vem esse default:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui + skills/study-method/references/languages.md#decisoes-abertas-geradas-aqui + docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui (era D-C07)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-V05`
- **Quem responde:** aluno · **quando:** `first-challenge` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos nesta entrada:** `D-C07`

```
decisions-ask.sh <setup_root> --record D-V05 show_and_offer
```

### 3.2 Fase `session-15` — quando o histórico fica longo (4)

Disparadas quando o limiar de sessões não consolidadas é atingido, a revisão espaçada vence,
ou você volta depois de sumir. São decisões sobre **o seu passado**, e só existem depois que
há passado.

#### D-M02 — A partir de quantas aulas eu junto o historico antigo num resumo consolidado?

> A partir de quantas aulas eu junto o historico antigo num resumo consolidado?

**Por que importa.** E arrumar a gaveta: quinze bilhetes soltos ainda dao para folhear, cinquenta nao. Consolidar cedo demais perde detalhe que ainda seria util; tarde demais faz cada abertura de aula custar mais leitura do que ensino. Quinze e o piso da faixa que a pesquisa sustenta.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `t15` ⭐ — A cada 15 sessoes nao consolidadas | + Piso da faixa recomendada pela pesquisa de memoria de agente<br>+ A consolidacao acontece antes de a leitura ficar cara | − Consolida enquanto o detalhe bruto ainda seria util em alguns casos |
| `t20` — A cada 20 | + Mais detalhe bruto disponivel por mais tempo | − Cada abertura de aula fica um pouco mais cara antes do corte |
| `manual` — Nunca automatico - so quando eu pedir | + Controle total do aluno | − Ninguem lembra de pedir, e o custo cresce em silencio |

- **Default (⭐):** `t15` — A cada 15 sessoes nao consolidadas
- **De onde vem esse default:** docs/03-memoria.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-M02`
- **Quem responde:** aluno · **quando:** `session-15` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-M02 t15
```

#### D-M10 — Se voce sumir por uns meses e voltar, eu retomo de onde parou, faco um resumo de reentrada, ou recomeco do zero?

> Se voce sumir por uns meses e voltar, eu retomo de onde parou, faco um resumo de reentrada, ou recomeco do zero?

**Por que importa.** E voltar a uma serie depois de um ano: dar play no episodio seguinte nao funciona, e recomecar a 1a temporada tambem nao. O 'previously on' de dois minutos e quase sempre o certo - e ele custa meia aula, nao uma aula inteira. (Decisao nova, levantada em 3.0: nenhum documento tratava a ausencia longa.)

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `recap` ⭐ — Resumo de reentrada: o que voce sabia, o que estava vencido, e so entao a aula | + Reancora sem apagar progresso<br>+ Deixa explicito o que a revisao espacada considera vencido | − Gasta o comeco da aula de volta com revisao |
| `continue` — Continuar de onde parou, sem cerimonia | + Aula cheia desde o primeiro minuto | − Assume dominio que provavelmente decaiu, e a aula desanda no meio |
| `restart` — Recomecar o assunto do zero | + Base solida garantida | − Joga fora meses de evidencia real de proficiencia |

- **Default (⭐):** `recap` — Resumo de reentrada: o que voce sabia, o que estava vencido, e so entao a aula
- **De onde vem esse default:** novo em 3.0 (nao havia decisao correspondente) — apoiado em docs/04-proficiencia.md §5 (decaimento) e docs/03-memoria.md §4
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-M10`
- **Quem responde:** aluno · **quando:** `session-15` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-M10 recap
```

#### D-P04 — Revisao vencida e obrigatoria antes de conteudo novo, ou eu so sugiro e aceito 'nao'?

> Revisao vencida e obrigatoria antes de conteudo novo, ou eu so sugiro e aceito 'nao'?

**Por que importa.** Obrigar revisao e o personal trainer que nao deixa voce sair da academia. Funciona duas vezes; na terceira, voce nao volta. Sugerir, dizer o custo uma vez e adiar por sete dias apos tres recusas mantem o aluno na sala.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `suggest` ⭐ — So sugerir e aceitar 'nao', com regra anti-insistencia | + O aluno continua vindo<br>+ O custo da recusa e dito uma vez, nao repetido | − Conceito vencido pode ficar vencido por muito tempo |
| `force_one` — Obrigar 1 conceito vencido antes de conteudo novo | + A revisao acontece | − Transforma a aula em pedagio e afasta quem estuda por vontade propria |
| `force_after_n` — Obrigar so depois de N recusas | + Meio-termo | − Ainda acaba em imposicao, so mais tarde |

- **Default (⭐):** `suggest` — So sugerir e aceitar 'nao', com regra anti-insistencia
- **De onde vem esse default:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-P04`
- **Quem responde:** aluno · **quando:** `session-15` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-P04 suggest
```

#### D-E09 — Cada aula fica num topico so, ou eu sempre misturo pelo menos uma revisao de algo anterior?

> Cada aula fica num topico so, ou eu sempre misturo pelo menos uma revisao de algo anterior?

**Por que importa.** Estudar um assunto por vez e treinar so o braco direito: parece eficiente e nao transfere. Misturar uma revisao espacada em toda aula custa uns dez minutos e e o que faz o conhecimento sobreviver a semana seguinte.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `two_topics` ⭐ — >= 2 topicos por aula, sendo >= 1 revisao espacada de conceito anterior | + Captura o ganho combinado de espacamento e intercalacao<br>+ Nao fragmenta a aula a ponto de nada fechar | − Menos tempo para o topico principal do dia |
| `one_topic` — Uma aula = um topico | + Profundidade maxima no dia | − Nenhuma revisao acontece a menos que alguem lembre |
| `within_block` — Intercalar dentro de cada bloco de exercicios | + Intercalacao maxima | − Fragmenta a ponto de nenhum raciocinio longo fechar |

- **Default (⭐):** `two_topics` — >= 2 topicos por aula, sendo >= 1 revisao espacada de conceito anterior
- **De onde vem esse default:** docs/02-pedagogia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Grava em:** `decisions.D-E09`
- **Quem responde:** aluno · **quando:** `session-15` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-E09 two_topics
```

---

## 4. Camada 3 — sob demanda (33)

**Público: aluno (26) e aluno+builder (7).** Fase `on-demand`. Nunca são feitas em bloco.
Cada uma sai em um de dois instantes: **você perguntou**, ou **a skill precisa da sua
autorização para agir agora** — instalar algo, ler outro setup, sair para a web, gravar texto
livre seu. Consentimento pedido no ponto de coleta, nunca no dia zero.

### 4.1 `audience: student` (26)

#### D-A14 — O que eu faco quando a agenda aponta para um estudo que nao existe mais no disco?

> O que eu faco quando a agenda aponta para um estudo que nao existe mais no disco?

**Por que importa.** E o contato antigo na agenda com o telefone desligado. Apagar a entrada some com a prova de que aquilo existiu (e a pasta pode estar so num HD externo desconectado). Marcar como sumida, manter para sempre e mencionar no maximo uma vez por sessao respeita as duas possibilidades.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `mark_missing` ⭐ — Marcar como sumida, manter a entrada e mencionar no maximo 1x por sessao | + O HD externo volta e o setup volta junto<br>+ Nao vira lembrete repetido | − A lista acumula entradas mortas com o tempo |
| `ask` — Perguntar ao aluno o que fazer | + Decisao explicita | − Pergunta sobre infraestrutura no comeco de uma aula |
| `auto_remove` — Remover a entrada automaticamente | + Lista sempre limpa | − Desconectar um HD externo apaga o registro do estudo |

- **Default (⭐):** `mark_missing` — Marcar como sumida, manter a entrada e mencionar no maximo 1x por sessao
- **De onde vem esse default:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-A14`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-A14 mark_missing
```

#### D-A15 — Quando eu posso puxar coisa de outro estudo seu: so quando voce mencionar, ou sozinho quando achar parecido?

> Quando eu posso puxar coisa de outro estudo seu: so quando voce mencionar, ou sozinho quando achar parecido?

**Por que importa.** E a diferenca entre um amigo que responde o que voce perguntou e um que interrompe a conversa toda hora com 'isso me lembra...'. Puxar por semelhanca de topico a cada turno enche o contexto e desvia a aula do que voce veio fazer.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `on_mention` ⭐ — So quando voce mencionar ou perguntar | + A aula nao muda de assunto sozinha<br>+ O contexto fica para a materia de hoje | − Uma ponte util entre dois assuntos pode passar batida |
| `auto_similarity` — Automatica por semelhanca de topico, a cada turno | + Nenhuma ponte se perde | − Enche o contexto e desvia o foco da aula |
| `auto_plan` — Automatica so no planejamento da aula | + Uma checagem por aula, no momento em que a agenda esta sendo montada | − Ainda decide sozinha abrir outro estudo |

- **Default (⭐):** `on_mention` — So quando voce mencionar ou perguntar
- **De onde vem esse default:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-A15`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-A15 on_mention
```

#### D-A17 — Quando eu rodo fora de qualquer pasta de estudo, eu adoto sempre o seu estudo principal?

> Quando eu rodo fora de qualquer pasta de estudo, eu adoto sempre o seu estudo principal?

**Por que importa.** E o carro que ja engata na marcha em que voce deixou. Economiza uma pergunta na maioria das sessoes; a confirmacao de uma linha e o cinto de seguranca que impede abrir o estudo errado em silencio.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `default_confirm` ⭐ — Sim, com confirmacao de uma linha | + Uma pergunta a menos quase sempre<br>+ Nunca abre o setup errado calado | − Ainda gasta uma linha de confirmacao |
| `default_silent` — Sim, aplicado em silencio | + Zero atrito | − Estudar 20 minutos no setup errado e descobrir depois |
| `always_ask` — Nao, sempre listar e perguntar | + Nunca ha duvida | − Pedagio em toda sessao, inclusive nas 9 em 10 em que a resposta e a mesma |

- **Default (⭐):** `default_confirm` — Sim, com confirmacao de uma linha
- **De onde vem esse default:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-A17`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-A17 default_confirm
```

#### D-A21 — Eu ponho a pasta do estudo no git? E a `memory/` junto?

> Eu ponho a pasta do estudo no git? E a `memory/` junto?

**Por que importa.** Git nao esquece. Um `rm` apaga o arquivo, nao o commit - e se houve `push`, nao apaga nem do servidor. `researchs/` e `challenges/` sao material de estudo e versionar ajuda; `memory/` guarda o seu perfil cognitivo, e esse e o unico diretorio em que o arrependimento nao tem desfazer.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `gitignore_memory` ⭐ — `memory/` no `.gitignore` por padrao; opt-in explicito para versionar | + O dado sensivel nao entra no historico por acidente<br>+ `researchs/` e `challenges/` continuam versionaveis livremente<br>+ Quem quiser versionar tudo faz isso de olhos abertos | − Perder a pasta perde a memoria - backup vira responsabilidade do aluno |
| `version_all` — Versionar tudo | + Backup e historico de graca | − Perfil cognitivo em repositorio - e se houve push, nao ha desfazer |
| `never` — Nunca versionar nada do setup | + Risco zero | − Perde o beneficio real de versionar desafio e destilado |

- **Default (⭐):** `gitignore_memory` — `memory/` no `.gitignore` por padrao; opt-in explicito para versionar
- **De onde vem esse default:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui + docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + docs/03-memoria.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Grava em:** `decisions.D-S01` — atenção: a chave no manifesto é `D-S01`, o id absorvido, não `D-A21`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos nesta entrada:** `D-M03`, `D-S01`

```
decisions-ask.sh <setup_root> --record D-A21 gitignore_memory
```

#### D-P02 — Voce quer ver o seu estado de dominio por conceito, ou prefere que eu so use isso por baixo do pano?

> Voce quer ver o seu estado de dominio por conceito, ou prefere que eu so use isso por baixo do pano?

**Por que importa.** Rotulo virado para fora vira nota, e nota vira o assunto da aula. Sob demanda, o numero continua existindo e continua guiando o que eu escolho ensinar - mas quem decide olhar e voce.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `on_demand` ⭐ — Sob demanda ('como estou em X?'), mais mencao espontanea so quando muda o meu comportamento | + Nao vira boletim<br>+ O aluno ainda entende por que a aula mudou de rumo | − Quem gosta de painel precisa pedir toda vez |
| `always` — Sempre: abrir a aula listando os estados | + Transparencia total | − Comeca toda aula com uma nota, e o aluno passa a estudar para o rotulo |
| `never` — Nunca mostrar | + Zero pressao | − O aluno nao entende por que voltamos a um assunto que ele achava resolvido |

- **Default (⭐):** `on_demand` — Sob demanda ('como estou em X?'), mais mencao espontanea so quando muda o meu comportamento
- **De onde vem esse default:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-P02`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-P02 on_demand
```

#### D-E03 — Eu pergunto o seu repertorio (profissao, hobbies, o que voce ja domina) para calibrar as analogias?

> Eu pergunto o seu repertorio (profissao, hobbies, o que voce ja domina) para calibrar as analogias?

**Por que importa.** A melhor analogia e a que usa algo que voce ja conhece bem: para um cozinheiro, receita; para um musico, compasso. Sem repertorio conhecido eu caio sempre no banco padrao e perco a maior parte do efeito. Perguntar na hora em que preciso da analogia custa uma pergunta e vem no contexto certo.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `on_need_plus_inference` ⭐ — Pergunto pontualmente, na hora em que preciso de uma analogia, e vou inferindo ao longo das aulas | + Nao gasta o dia zero, que ja tem 6 perguntas<br>+ A pergunta chega com contexto: 'voce trabalha com o que? quero comparar com algo seu'<br>+ A inferencia continua funcionando de graca | − A primeira analogia da primeira aula ainda sai do banco padrao |
| `three_at_setup` — 3 perguntas na criacao do setup, gravadas no perfil | + Repertorio disponivel desde a primeira analogia | − Sao 3 perguntas a mais no dia zero, e nenhuma passa no teste 'cabe numa palavra' |
| `infer_only` — So inferir ao longo das aulas, sem perguntar | + Zero atrito | − Leva varias aulas ate ter repertorio util |

- **Default (⭐):** `on_need_plus_inference` — Pergunto pontualmente, na hora em que preciso de uma analogia, e vou inferindo ao longo das aulas
- **De onde vem esse default:** skills/study-method/references/pedagogia.md#decisoes-abertas-geradas-aqui (default arbitrado em 3.0 contra docs/10-bootstrap.md §6.1: 3 perguntas nao passam no teste de dia zero)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-E03`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-E03 on_need_plus_inference
```

#### D-E04 — Aula em portugues e codigo em ingles, ou tudo em portugues?

> Aula em portugues e codigo em ingles, ou tudo em portugues?

**Por que importa.** Nome de variavel em ingles e como placa de aeroporto: nao e esnobismo, e o que todo mundo la fora usa. A explicacao e o comentario ficam em portugues, que e onde a compreensao mora; o identificador segue a convencao real do ecossistema.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `pt_en_ids` ⭐ — Aula em pt-BR, identificadores em ingles, comentarios em pt-BR | + Alinha com o codigo real que o aluno vai encontrar<br>+ Nao custa compreensao: o raciocinio continua em portugues | − Mistura dois idiomas no mesmo arquivo |
| `all_pt` — Tudo em pt-BR, identificadores incluidos | + Coerencia total | − O aluno se acostuma com um codigo que nao existe fora da aula |
| `all_en` — Tudo em ingles | + Imersao | − Custa compreensao justamente na parte que precisa ser entendida |

- **Default (⭐):** `pt_en_ids` — Aula em pt-BR, identificadores em ingles, comentarios em pt-BR
- **De onde vem esse default:** skills/study-method/references/pedagogia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-E04`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-E04 pt_en_ids
```

#### D-E12 — Se o seu material estiver errado ou desatualizado, eu falo ou sigo o que esta escrito?

> Se o seu material estiver errado ou desatualizado, eu falo ou sigo o que esta escrito?

**Por que importa.** O slide do professor tambem erra. Seguir calado e ensinar o erro; corrigir sem avisar e deixar voce chegar na prova com uma versao diferente da do professor. Apontar a divergencia, dizer qual e a correta e por que, e deixar voce decidir e o unico caminho que nao te prejudica.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `flag_and_explain` ⭐ — Aponto a divergencia, digo qual e a correta e por que, e voce decide | + Voce nao chega na prova com a versao errada<br>+ Nem estuda escondido uma versao que o professor vai reprovar<br>+ Preserva a regra de nunca afirmar com confianca que nao tem | − Interrompe a aula com uma discussao de fonte |
| `follow_material` — Sigo o material, mesmo errado | + Alinhado com o que vai cair na prova | − Ensina o erro de proposito |
| `silent_fix` — Corrijo em silencio | + Aula limpa | − Voce responde diferente do material e nao sabe por que |

- **Default (⭐):** `flag_and_explain` — Aponto a divergencia, digo qual e a correta e por que, e voce decide
- **De onde vem esse default:** novo em 3.0 — apoiado em docs/00-contratos.md §9.1 (anti-bajulacao) e docs/10-bootstrap.md §7 (ingestao de material do aluno)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-E12`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-E12 flag_and_explain
```

#### D-C12 — Voce pode pedir um desafio numa linguagem que nao roda nesta maquina, aceitando so poder ler?

> Voce pode pedir um desafio numa linguagem que nao roda nesta maquina, aceitando so poder ler?

**Por que importa.** Um desafio que nao roda e um exercicio sem gabarito: da para ler, nao da para saber se voce acertou. O valor inteiro do formato esta no teste que executa - sem ele, e um texto.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `refuse` ⭐ — Nao gerar; ofereco a instalacao ou a troca de linguagem | + Nao entrega um artefato que nao cumpre o que promete<br>+ As duas saidas reais (instalar ou trocar) sao oferecidas na mesma frase | − Quem so queria ler o enunciado leva um nao |
| `draft` — Gerar marcado como rascunho nao validavel | + Atende o pedido literalmente | − Gera desafio sem validacao de mutacao - qualidade desconhecida |
| `other_lang` — Gerar e validar em outra linguagem | + Roda de verdade | − Nao e o que foi pedido |

- **Default (⭐):** `refuse` — Nao gerar; ofereco a instalacao ou a troca de linguagem
- **De onde vem esse default:** skills/study-method/references/challenge-protocol.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-C12`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C12 refuse
```

#### D-V01 — Quando um grafico pedir mais do que eu consigo desenhar sem instalar nada, eu ofereco criar um ambiente Python com matplotlib?

> Quando um grafico pedir mais do que eu consigo desenhar sem instalar nada, eu ofereco criar um ambiente Python com matplotlib?

**Por que importa.** E a furadeira que voce so compra quando aparece a parede de concreto. Oferecer na hora, uma vez, com o custo dito (um diretorio de ~100 MB, apagavel), deixa voce escolher; criar sozinho seria instalar coisa na sua maquina sem perguntar, o que este projeto nao faz.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `offer_once` ⭐ — Ofereco na hora, uma vez, e guardo a sua resposta | + Custo explicito antes de qualquer instalacao<br>+ A aula continua normalmente se voce recusar<br>+ Apagar o diretorio desfaz tudo | − Uma interrupcao no meio da explicacao do grafico |
| `never_offer` — Nunca ofereco - so declaro a limitacao | + Zero instalacao, sempre | − Alguns graficos ficam permanentemente fora de alcance |
| `auto_create` — Crio sozinho no primeiro setup | + Nenhuma interrupcao | − Instala sem consentimento - proibido pelo contrato |

- **Default (⭐):** `offer_once` — Ofereco na hora, uma vez, e guardo a sua resposta
- **De onde vem esse default:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-V01`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-V01 offer_once
```

#### D-V02 — Depois de gerar um grafico em HTML, eu abro no navegador sozinho ou so te digo o caminho?

> Depois de gerar um grafico em HTML, eu abro no navegador sozinho ou so te digo o caminho?

**Por que importa.** Abrir janela sem pedir e o programa que assume o controle da sua tela. Em SSH ou tmux nao ha tela nenhuma, e o comando pode simplesmente travar esperando algo que nao existe.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `path_only` ⭐ — So informo o caminho | + Funciona igual em SSH, tmux e desktop<br>+ Nunca trava esperando uma GUI que nao existe | − Um copiar-e-colar a mais para ver a figura |
| `auto_open` — Abro sempre | + Figura na tela na hora | − Intrusivo no desktop e travado no terminal remoto |
| `first_only` — Abro na primeira vez da sessao e depois so informo | + Meio-termo | − Comportamento diferente na 1a e na 2a figura confunde |

- **Default (⭐):** `path_only` — So informo o caminho
- **De onde vem esse default:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-V02`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-V02 path_only
```

#### D-V03 — O grafico em texto (ASCII/braille) aparece no chat sempre, ou so quando faz sentido?

> O grafico em texto (ASCII/braille) aparece no chat sempre, ou so quando faz sentido?

**Por que importa.** Grafico de braille com tres series vira mancha - ninguem le. Com uma serie e poucos pontos, e feedback imediato sem sair do terminal. Automatico quando nao ha GUI, ou quando a figura e simples o bastante para caber em texto.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `auto_conditional` ⭐ — Automatico quando nao ha GUI, ou com 1 serie e <= 50 pontos | + Da feedback imediato onde ele e legivel<br>+ Nao polui o chat com mancha de braille | − A regra tem duas condicoes, e as vezes voce quer o texto fora delas |
| `always` — Sempre inline | + Nunca precisa abrir arquivo | − Figuras complexas viram ruido ilegivel no meio da aula |
| `on_demand` — So sob demanda | + Chat sempre limpo | − Perde o feedback imediato justamente no caso em que ele funcionaria |

- **Default (⭐):** `auto_conditional` — Automatico quando nao ha GUI, ou com 1 serie e <= 50 pontos
- **De onde vem esse default:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-V03`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-V03 auto_conditional
```

#### D-V09 — Quantos graficos por aula antes de virar ruido?

> Quantos graficos por aula antes de virar ruido?

**Por que importa.** Figura demais e slide cheio de figura: para de comunicar. Um teto de tres forca a pergunta certa antes de cada uma - 'esta figura ensina o que?'. E teto suave: se a quarta ensinar algo de verdade, ela vem com um aviso interno, nao com um bloqueio.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `cap3` ⭐ — Teto de 3, com aviso interno ao ultrapassar | + Forca a pergunta 'esta figura ensina o que?'<br>+ Teto suave: nao bloqueia a figura que vale a pena | − Um numero arbitrario |
| `unlimited` — Sem limite | + Nenhuma figura util e perdida | − A aula vira galeria e o texto some |
| `per_concept` — 1 por conceito novo | + Criterio semantico em vez de numerico | − Conceito que precisa de duas representacoes fica com uma |

- **Default (⭐):** `cap3` — Teto de 3, com aviso interno ao ultrapassar
- **De onde vem esse default:** skills/study-method/references/visualizacao.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-V09`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-V09 cap3
```

#### D-V18 — As cores dos graficos precisam funcionar para daltonismo, ou pode ser a paleta padrao?

> As cores dos graficos precisam funcionar para daltonismo, ou pode ser a paleta padrao?

**Por que importa.** Vermelho e verde lado a lado somem para cerca de 8% dos homens. Uma paleta segura custa nada e nunca piora a figura para quem enxerga as duas cores. (Decisao nova, levantada em 3.0: nenhum documento tratava acessibilidade de cor.)

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `safe_palette` ⭐ — Paleta segura para daltonismo por padrao, com forma e tracejado alem da cor | + Funciona para todo mundo sem custo nenhum<br>+ Forma e tracejado sobrevivem ate a impressao em preto e branco | − Menos liberdade estetica |
| `default_palette` — Paleta padrao | + Cores mais vivas | − Duas series podem virar uma so para parte dos leitores |

- **Default (⭐):** `safe_palette` — Paleta segura para daltonismo por padrao, com forma e tracejado alem da cor
- **De onde vem esse default:** novo em 3.0 — apoiado em docs/06-visualizacao.md §4.2 (series e legenda)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-V18`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-V18 safe_palette
```

#### D-B01 — Quanto do seu material eu leio inteiro por aula, antes de passar a carregar so as partes relevantes?

> Quanto do seu material eu leio inteiro por aula, antes de passar a carregar so as partes relevantes?

**Por que importa.** E o tamanho da mochila. Cabe o livro inteiro se ele for fino; se for grosso, cabe o capitulo de hoje mais o indice - e eu digo em voz alta o que ficou de fora. 20 mil tokens (~80 KB) e o ponto em que ainda sobra espaco de sobra para a aula em si.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `t20k` ⭐ — 20 mil tokens (~80 KB) | + Sobra contexto de sobra para a aula<br>+ Cobre inteiro o material da maioria dos assuntos | − Material grande passa para o modo indexado mais cedo |
| `t10k` — 10 mil tokens (~40 KB) | + Maximo de espaco para a aula | − Quase todo material vira indexado |
| `t40k` — 40 mil tokens (~160 KB) | + Quase todo material cabe inteiro | − A aula divide contexto com um material que talvez nem seja do topico de hoje |
| `unlimited` — Sempre tudo, sem limite | + Nada fica de fora | − Um PDF de 400 paginas nao deixa espaco para a aula |

- **Default (⭐):** `t20k` — 20 mil tokens (~80 KB)
- **De onde vem esse default:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + skills/study-method/references/docs-ingest.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `docs_ingest.token_budget`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B01 t20k
```

#### D-B02 — Quando voce nao tem material, eu escrevo uma base teorica inicial - e como?

> Quando voce nao tem material, eu escrevo uma base teorica inicial - e como?

**Por que importa.** Uma base escrita por mim e um resumo de quem leu muito sobre o assunto, nao a ementa do seu curso. Util para comecar, perigoso se voce esquecer de onde veio - por isso ela sempre nasce marcada como gerada, em tres lugares diferentes.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `ask_each_time` ⭐ — Me pergunte toda vez | + Voce decide caso a caso, com o custo na frente<br>+ Nunca aparece material gerado que voce nao pediu | − Uma pergunta a cada topico sem base |
| `web_when_possible` — Sim, pesquisando na web quando der | + Base mais atual e verificavel | − A consulta sai da maquina - vale a decisao de pesquisa web |
| `knowledge_only` — Sim, so do meu conhecimento | + Nao sai nada da maquina | − Sem fonte para conferir, e o assunto pode ter mudado |
| `never` — Nunca | + Nenhum material gerado no seu corpus | − Assunto sem material comeca sem trilha nenhuma |

- **Default (⭐):** `ask_each_time` — Me pergunte toda vez
- **De onde vem esse default:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + skills/study-method/references/docs-ingest.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-B02`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B02 ask_each_time
```

#### D-B05 — Em que idioma o seu material de estudo e escrito?

> Em que idioma o seu material de estudo e escrito?

**Por que importa.** Inferivel: e o idioma em que voce esta falando comigo. Perguntar seria pedir a alguem que acabou de falar portugues para confirmar que fala portugues. Se eu errar, uma frase sua corrige.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `conversation` ⭐ — O idioma da nossa conversa | + Acerta sem gastar pergunta nenhuma<br>+ Corrigivel numa frase se eu errar | − Quem fala portugues mas estuda em ingles precisa dizer uma vez |
| `pt_br` — pt-BR fixo | + Previsivel | − Errado para quem estuda em outro idioma |
| `ask` — Perguntar na criacao | + Explicito | − Uma 7a pergunta no dia zero para confirmar o obvio |

- **Default (⭐):** `conversation` — O idioma da nossa conversa
- **De onde vem esse default:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-B05`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B05 conversation
```

#### D-B07 — Quando eu rodo fora de uma pasta de estudo e existe um setup so, eu abro ele direto?

> Quando eu rodo fora de uma pasta de estudo e existe um setup so, eu abro ele direto?

**Por que importa.** Com um estudo so, perguntar 'qual deles?' e perguntar qual porta usar numa casa de uma porta. Abro, anuncio qual abri, e ofereco a saida na mesma frase - se for o errado, voce corrige antes de qualquer escrita.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `open_announce` ⭐ — Abro e anuncio, com escape na mesma frase | + Zero pergunta no caso em que so ha uma resposta<br>+ O anuncio impede estudar 20 minutos no lugar errado | − Uma linha de anuncio em toda abertura |
| `always_ask` — Sempre pergunto | + Nunca abre nada sem aval | − Pergunta com uma unica resposta possivel |

- **Default (⭐):** `open_announce` — Abro e anuncio, com escape na mesma frase
- **De onde vem esse default:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-B07`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Leia junto:** `D-A17`

```
decisions-ask.sh <setup_root> --record D-B07 open_announce
```

#### D-B09 — Se nao houver extrator de PDF nesta maquina, o que eu faco com os seus PDFs?

> Se nao houver extrator de PDF nesta maquina, o que eu faco com os seus PDFs?

**Por que importa.** Um PDF que eu nao consigo abrir e uma caixa lacrada na estante: existe, e nao adianta fingir que nao. Digo o comando exato que resolve, nunca executo - instalar coisa na sua maquina e decisao sua - e registro o arquivo como nao lido para nao repetir o aviso toda aula.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `suggest_never_run` ⭐ — Sugiro o comando de instalacao e nunca executo | + Voce fica sabendo que existe material que eu nao li<br>+ A instalacao continua sendo decisao sua<br>+ O aviso nao se repete: fica registrado no manifesto | − A aula de hoje segue sem aquele material |
| `silent` — Nunca menciono instalacao | + Nenhuma sugestao de instalar nada | − Voce nunca descobre por que aquele PDF nunca aparece na aula |
| `as_absent` — Trato o PDF como inexistente | + Simples | − Mente por omissao sobre o que esta na pasta |

- **Default (⭐):** `suggest_never_run` — Sugiro o comando de instalacao e nunca executo
- **De onde vem esse default:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + skills/study-method/references/docs-ingest.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-B09`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B09 suggest_never_run
```

#### D-B18 — Se voce quiser estudar dois assuntos na mesma sessao, eu abro os dois ou peco para escolher um?

> Se voce quiser estudar dois assuntos na mesma sessao, eu abro os dois ou peco para escolher um?

**Por que importa.** Dois cadernos abertos na mesma mesa: da para fazer, mas cada um tem a propria memoria, a propria trilha e o proprio historico - e a aula que vira metade de cada um nao fecha nenhum dos dois. (Decisao nova, levantada em 3.0: nenhum documento tratava o pedido de dois assuntos numa sessao.)

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `one_primary` ⭐ — Um assunto por sessao; menciono a ponte com o outro sem abrir uma 2a sessao | + Uma sessao, uma memoria, um historico coerente<br>+ A ponte entre assuntos continua possivel pela leitura cruzada | − Quem queria dividir a hora ao meio precisa fazer duas sessoes |
| `two_sessions` — Abro duas sessoes em paralelo | + Atende literalmente | − Duas sessoes vivas ao mesmo tempo e exatamente o que o travamento de sessao proibe |
| `ask` — Pergunto a cada vez | + Flexivel | − Pergunta repetida sobre algo que quase sempre tem a mesma resposta |

- **Default (⭐):** `one_primary` — Um assunto por sessao; menciono a ponte com o outro sem abrir uma 2a sessao
- **De onde vem esse default:** novo em 3.0 — apoiado em docs/01-arquitetura.md §sessao unica e docs/07-multi-setup.md §5
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-B18`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-B18 one_primary
```

#### D-S02 — Eu posso anotar como voce estava se sentindo na aula - cansado, travado, empolgado - e escrever uma nota em texto sobre isso?

> Eu posso anotar como voce estava se sentindo na aula - cansado, travado, empolgado - e escrever uma nota em texto sobre isso?

**Por que importa.** O rotulo ('cansado') calibra o ritmo da proxima aula e cabe numa palavra. A nota em texto livre e onde o vazamento acontece: e ali que 'estava mal' vira uma frase sobre a sua vida guardada num arquivo de estudo. Por isso o rotulo vem ligado e o texto so entra se voce autorizar - e eu pergunto na primeira vez em que fosse escrever um, nao no dia zero.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `enum_yes_note_consent` ⭐ — Rotulo sim; nota em texto so com a sua autorizacao | + Calibra o ritmo com pouquissimo texto guardado<br>+ A autorizacao chega no momento em que ha algo concreto para autorizar<br>+ Sem autorizacao, nao existe texto livre para vazar | − Sem a nota, o rotulo nao distingue 'cansado' de 'frustrado com a notacao' |
| `never` — Nao registrar nada de afeto | + Risco zero | − A aula seguinte nao sabe que a anterior terminou mal |
| `both_always` — Rotulo e nota, sempre | + Contexto maximo | − Texto livre sobre estado emocional gravado por padrao - o pior default possivel |

- **Default (⭐):** `enum_yes_note_consent` — Rotulo sim; nota em texto so com a sua autorizacao
- **De onde vem esse default:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + skills/study-method/references/seguranca.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Grava em:** `decisions.D-S02`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos nesta entrada:** `D-S09`
- **Leia junto:** `D-M09`

```
decisions-ask.sh <setup_root> --record D-S02 enum_yes_note_consent
```

#### D-S04 — Outro estudo seu pode abrir o `README.md` deste aqui: eu pergunto antes, deixo sempre, ou nunca?

> Outro estudo seu pode abrir o `README.md` deste aqui: eu pergunto antes, deixo sempre, ou nunca?

**Por que importa.** E o cartaz na porta da sala. `perguntar` e a postura padrao - o vizinho bate antes de ler. `sempre` e deixar a porta aberta entre assuntos que conversam (Calculo e Fisica). `nunca` e fechar a sala: este estudo nem aparece na lista dos outros. Vale so para o cartaz - a gaveta (`memory/`, `researchs/`, `challenges/`, `docs/`) nunca abre, nem com autorizacao.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `ask` ⭐ — Perguntar antes de abrir | + Voce decide caso a caso, sabendo qual estudo quer ler qual<br>+ Postura padrao: nada e lido sem voce saber | − Uma pergunta quando a ponte entre dois assuntos aparece |
| `allow` — Pode abrir sem perguntar - eu so anuncio de onde tirei | + Ponte automatica entre assuntos que conversam<br>+ A origem continua anunciada | − Um estudo pessoal fica legivel a partir de qualquer outro |
| `never` — Nunca - este estudo fica invisivel para os outros | + Isolamento total; nem aparece como candidato | − Nenhuma ponte com este assunto acontece, nem quando seria util |

- **Default (⭐):** `ask` — Perguntar antes de abrir
- **De onde vem esse default:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + skills/study-method/references/seguranca.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `privacy.cross_read`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Leia junto:** `D-A16`, `D-A15`

```
decisions-ask.sh <setup_root> --record D-S04 ask
```

#### D-S05 — Eu posso pesquisar na web durante a aula?

> Eu posso pesquisar na web durante a aula?

**Por que importa.** A pergunta que sai da maquina leva junto o enunciado - e o enunciado pode ser o problema da sua empresa ou o exercicio da sua prova. Opt-in por sessao, com a consulta mostrada antes de sair, deixa voce ver exatamente o que vai embora antes de ir.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `optin_show_query` ⭐ — Opt-in por sessao, com a consulta mostrada antes de sair | + Voce ve o texto exato que sairia daqui<br>+ A autorizacao vale para a sessao, nao para sempre | − Uma confirmacao por sessao em que a pesquisa for util |
| `off` — Desligada | + Nada sai da maquina, nunca | − Assunto que mudou recentemente fica com a informacao velha |
| `auto` — Automatica, quando eu julgar util | + Informacao sempre fresca | − Manda texto para fora sem voce ver |

- **Default (⭐):** `optin_show_query` — Opt-in por sessao, com a consulta mostrada antes de sair
- **De onde vem esse default:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + skills/study-method/references/seguranca.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-S05`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-S05 optin_show_query
```

#### D-S06 — Quando voce pedir para apagar algo, eu apago so aquele fato ou a cadeia inteira do topico?

> Quando voce pedir para apagar algo, eu apago so aquele fato ou a cadeia inteira do topico?

**Por que importa.** Os fatos formam uma corrente: 'voce domina limites' substituiu 'voce esta aprendendo limites'. Apagar so o elo mais novo faz o antigo ressuscitar - voce pede para esquecer e o sistema passa a afirmar uma versao ainda mais velha. Apagar a corrente inteira e a unica leitura fiel do pedido.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `whole_chain` ⭐ — A cadeia inteira do topico | + Nenhum rotulo antigo ressuscita como efeito colateral do apagamento<br>+ E a leitura fiel do que 'apaga isso' quer dizer | − Apaga tambem historico que voce talvez quisesse manter |
| `target_only` — So o fato apontado | + Apagamento cirurgico | − Ressuscita o fato anterior - inaceitavel num pedido de apagamento |
| `ask_each` — Pergunto a cada apagamento | + Controle maximo | − Transforma um pedido de privacidade num formulario |

- **Default (⭐):** `whole_chain` — A cadeia inteira do topico
- **De onde vem esse default:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + skills/study-method/references/seguranca.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Grava em:** `decisions.D-S06`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-S06 whole_chain
```

#### D-S12 — Eu guardo a transcricao literal da nossa conversa?

> Eu guardo a transcricao literal da nossa conversa?

**Por que importa.** E a diferenca entre a ata da reuniao e o gravador ligado o tempo todo. O resumo ja destila o que importa para a proxima aula; a transcricao literal guarda tudo - inclusive o que voce contou de passagem e nao queria em arquivo nenhum. Ligar depois e facil; desligar nao apaga o que ja foi gravado.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `never` ⭐ — Nao - so o resumo destilado | + Valor pedagogico marginal contra risco maximo<br>+ O resumo ja carrega o que a proxima aula precisa<br>+ Da para ligar depois; o inverso nao existe | − Nao da para reabrir um episodio exatamente como ele aconteceu |
| `optin` — Sim, se eu ligar explicitamente | + Auditoria completa para quem quiser | − E o campo com maior risco de privacidade e o que mais infla o arquivo |
| `always` — Sim, sempre | + Registro total | − Grava por padrao o dado mais sensivel do sistema |

- **Default (⭐):** `never` — Nao - so o resumo destilado
- **De onde vem esse default:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + docs/03-memoria.md#decisoes-abertas-geradas-aqui (era D-M05)
- **Custo de mudar depois:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Grava em:** `decisions.D-S12`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos nesta entrada:** `D-M05`
- **Leia junto:** `D-M09`

```
decisions-ask.sh <setup_root> --record D-S12 never
```

#### D-S15 — Existe um jeito de voce levar tudo embora - exportar o estudo inteiro e apagar o resto?

> Existe um jeito de voce levar tudo embora - exportar o estudo inteiro e apagar o resto?

**Por que importa.** Dado que voce nao consegue levar embora nao e seu, e emprestado. Como o estudo inteiro ja mora numa pasta de arquivos legiveis, 'exportar' e literalmente copiar a pasta - e 'apagar' e apagar a pasta mais uma linha no registro global. (Decisao nova, levantada em 3.0: nenhum documento tratava portabilidade e saida.)

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `copy_plus_purge` ⭐ — A pasta ja e o pacote: copiar leva tudo; apagar remove a pasta e a entrada no registro | + Nao exige formato de exportacao nenhum: o formato ja e aberto<br>+ Nada fica escondido fora da pasta do estudo, exceto uma linha no registro global<br>+ Verificavel: voce abre os arquivos e le | − Sem um comando unico, e preciso lembrar da linha do registro |
| `export_cmd` — Um comando de exportacao que empacota tudo num arquivo | + Um passo so | − Formato novo para manter, quando a pasta ja e portatil |
| `none` — Nao existe | + Nada a construir | − Dado que nao sai e dado emprestado |

- **Default (⭐):** `copy_plus_purge` — A pasta ja e o pacote: copiar leva tudo; apagar remove a pasta e a entrada no registro
- **De onde vem esse default:** novo em 3.0 — apoiado em docs/11-seguranca-privacidade.md §purga e docs/01-arquitetura.md §3 (arvore de arquivos legiveis)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-S15`
- **Quem responde:** aluno · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-S15 copy_plus_purge
```

### 4.2 `audience: both` — padrão de fábrica do builder, interruptor do aluno (7)

Estas têm dois donos. Quem constrói a skill escolhe o padrão de fábrica; você pode virar o
interruptor a qualquer momento, e a sua escolha vence.

#### D-M09 — Ate onde eu posso registrar contexto emocional: so o que der para observar no seu comportamento, ou tambem o que voce me contar sobre a sua vida?

> Ate onde eu posso registrar contexto emocional: so o que der para observar no seu comportamento, ou tambem o que voce me contar sobre a sua vida?

**Por que importa.** E a diferenca entre o professor anotar 'travou nos tres exercicios de limite' e anotar 'estava mal porque o pai esta doente'. A primeira anotacao calibra a proxima aula; a segunda e um dado de saude de terceiros num arquivo de estudo. Apertar depois e facil; desfazer o que ja foi gravado, nao.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `observable_only` ⭐ — So ancorado em comportamento observavel; nada de familia, saude ou terceiros nomeados | + Calibra ritmo sem virar prontuario<br>+ O limite e verificavel: 'isso apareceu no exercicio?' | − Perde nuance que as vezes explicaria uma aula ruim |
| `categorical_only` — So o afeto categorico, sem nota em texto livre | + Risco minimo: nao ha texto para vazar | − Um enum nao distingue 'cansado' de 'frustrado com a notacao' |
| `permissive` — Mais permissivo: qualquer contexto que o aluno mencionar | + Contexto rico | − Grava dado de saude e de terceiros num arquivo que nao foi feito para isso |

- **Default (⭐):** `observable_only` — So ancorado em comportamento observavel; nada de familia, saude ou terceiros nomeados
- **De onde vem esse default:** docs/03-memoria.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Grava em:** `decisions.D-M09`
- **Quem responde:** os dois (padrão de fábrica do builder + interruptor do aluno) · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Leia junto:** `D-S02`, `D-S12`

```
decisions-ask.sh <setup_root> --record D-M09 observable_only
```

#### D-P01 — Eu pergunto quanto voce acha que domina um assunto, ou julgo so pelo que vejo voce fazer?

> Eu pergunto quanto voce acha que domina um assunto, ou julgo so pelo que vejo voce fazer?

**Por que importa.** Auto-avaliacao e termometro na mao do proprio paciente: quem esta indo mal costuma achar que esta indo bem. Por isso o auto-relato entra so no fim da aula e so puxa para baixo - nunca promove ninguem a 'dominado' porque a pessoa disse que sim.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `closing_asymmetric` ⭐ — Uma pergunta no fechamento, com efeito assimetrico (so rebaixa) | + Captura a duvida do aluno sem transformar confianca em nota<br>+ Custa uma pergunta por aula, no momento em que ja nao atrapalha | − Quem se subestima puxa o proprio estado para baixo sem precisar |
| `never_ask` — Nunca perguntar - so evidencia observavel | + Zero ruido de autoavaliacao | − Ignora o aluno que sabe que decorou sem entender |
| `per_concept` — Perguntar conceito a conceito | + Granularidade maxima | − Transforma o fim de toda aula num formulario |

- **Default (⭐):** `closing_asymmetric` — Uma pergunta no fechamento, com efeito assimetrico (so rebaixa)
- **De onde vem esse default:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-P01`
- **Quem responde:** os dois (padrão de fábrica do builder + interruptor do aluno) · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-P01 closing_asymmetric
```

#### D-P03 — Quao rapido o dominio de um conceito 'esfria' quando voce fica sem pratica-lo?

> Quao rapido o dominio de um conceito 'esfria' quando voce fica sem pratica-lo?

**Por que importa.** E o prazo de validade do que voce aprendeu. Com 1,0 o conceito rebaixa quando o atraso iguala o proprio intervalo de revisao - dobrou o tempo previsto, cai um degrau. Nao ha base empirica para nenhum valor especifico; e escolha de produto, e por isso mora no dado e nao no codigo.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `r10` ⭐ — 1,0 - rebaixa quando o atraso iguala o intervalo previsto | + Meio-termo defensavel<br>+ Mora em `policy`: mudar e editar um numero | − Sem base empirica - e um chute calibrado, nao uma medida |
| `r05` — 0,5 - agressivo | + Revisa mais cedo; menos surpresa na prova | − Reabre conceito que o aluno ainda tinha na ponta da lingua |
| `r20` — 2,0 - frouxo | + Menos revisao imposta | − Descobre o esquecimento tarde demais |
| `off` — 0 - desligado, sem decaimento | + Aprendido e aprendido para sempre | − Contradiz tudo que se sabe sobre curva de esquecimento |

- **Default (⭐):** `r10` — 1,0 - rebaixa quando o atraso iguala o intervalo previsto
- **De onde vem esse default:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-P03`
- **Quem responde:** os dois (padrão de fábrica do builder + interruptor do aluno) · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-P03 r10
```

#### D-P06 — Os prazos do dominio (janela de 60 dias, teto de 180 em 'dominado' e 21 em 'fragil', multiplicadores 2,3 e 1,3) ficam como estao?

> Os prazos do dominio (janela de 60 dias, teto de 180 em 'dominado' e 21 em 'fragil', multiplicadores 2,3 e 1,3) ficam como estao?

**Por que importa.** Sao os intervalos entre revisoes, como as consultas de retorno do dentista: seis meses quando esta tudo bem, tres semanas quando algo apareceu. O multiplicador 2,3 aproxima o crescimento do SM-2 bem-sucedido sem precisar pedir nota ao aluno depois de cada exercicio.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `keep` ⭐ — Manter os defaults | + Aproxima uma curva de repeticao espacada consagrada sem pedir nota<br>+ Tudo vive em `policy`: ajustavel por setup | − Numero calibrado, nao medido nesta populacao |
| `shorter` — Encurtar a janela para 30 dias | + Exige evidencia mais fresca para chamar de dominado | − Rebaixa conceito que o aluno de fato domina |
| `longer` — Alongar os tetos | + Menos revisao | − Descobre o esquecimento perto da prova |

- **Default (⭐):** `keep` — Manter os defaults
- **De onde vem esse default:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-P06`
- **Quem responde:** os dois (padrão de fábrica do builder + interruptor do aluno) · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-P06 keep
```

#### D-E07 — Emoji e ponto de exclamacao: quanto voce aguenta?

> Emoji e ponto de exclamacao: quanto voce aguenta?

**Por que importa.** O problema nunca foi o caractere - foi a frequencia. Um reforco vazio a cada turno vira ruido com ou sem emoji. Teto de uma exclamacao por turno e zero emoji em feedback de erro mantem o tom sobrio onde ele importa.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `as12` ⭐ — Teto de 1 exclamacao por turno, zero emoji em feedback de erro | + Ataca a frequencia, que e a causa real<br>+ Deixa o feedback de erro completamente sobrio | − Regra com numero, que precisa ser contada |
| `no_emoji` — Zero emoji sempre | + Regra simples | − Nao resolve a bajulacao, que mora na frase e nao no icone |
| `free` — Livre | + Tom mais leve | − Reabre exatamente o comportamento que o projeto inteiro tenta evitar |

- **Default (⭐):** `as12` — Teto de 1 exclamacao por turno, zero emoji em feedback de erro
- **De onde vem esse default:** skills/study-method/references/pedagogia.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-E07`
- **Quem responde:** os dois (padrão de fábrica do builder + interruptor do aluno) · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-E07 as12
```

#### D-C04 — Testes baseados em propriedade (Hypothesis, fast-check, proptest) entram nos desafios?

> Testes baseados em propriedade (Hypothesis, fast-check, proptest) entram nos desafios?

**Por que importa.** E a diferenca entre 'testei com 2 e com 7' e 'testei com dez mil numeros que a maquina inventou'. Poderoso - e escrever um bom gerador e mais dificil que resolver o exercicio. Para quem esta comecando, um contra-exemplo encolhido confunde mais do que ensina.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `advanced_only` ⭐ — Opcional, so para nivel avancado e desafios de propriedade | + As invariantes com semente fixa dao quase o mesmo poder com zero dependencia<br>+ Quem tem repertorio ganha a ferramenta certa | − Exige instalar biblioteca e ensinar a API quando ligado |
| `never` — Nunca | + Zero dependencia sempre | − Fecha uma ferramenta legitima para quem ja sabe usa-la |
| `default_math` — Padrao para desafios de matematica | + Casa bem com invariantes matematicas | − Iniciante encontra contra-exemplo encolhido e nao entende o que aconteceu |

- **Default (⭐):** `advanced_only` — Opcional, so para nivel avancado e desafios de propriedade
- **De onde vem esse default:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Custo de mudar depois:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Grava em:** `decisions.D-C04`
- **Quem responde:** os dois (padrão de fábrica do builder + interruptor do aluno) · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário

```
decisions-ask.sh <setup_root> --record D-C04 advanced_only
```

#### D-S03 — Docker: requisito para rodar desafio, ou modo estrito opcional para quem ja tem?

> Docker: requisito para rodar desafio, ou modo estrito opcional para quem ja tem?

**Por que importa.** Docker e o cofre: se o seu codigo fizesse algo perigoso, ele segura. Exigir o cofre para estudar fatorial afasta exatamente o publico que este projeto quer. O piso POSIX (limite de tempo, de memoria, de escrita) ja cobre codigo de exercicio; o cofre fica disponivel para quem quiser ligar.

| Opção | O que você ganha | O que você paga |
|---|---|---|
| `posix_floor_optin` ⭐ — Piso POSIX sempre; modo estrito com Docker opt-in | + Nao bloqueia o produto atras de uma instalacao<br>+ Quem ja tem Docker liga por setup ou por desafio<br>+ Oferece ao macOS as garantias que o Linux da de graca | − O piso POSIX e mais fraco que um container de verdade |
| `required` — Obrigatorio | + Isolamento forte sempre | − Mata a adocao: instalar Docker para estudar calculo nao acontece |
| `macos_only` — Obrigatorio so no macOS | + Compensa o sandbox mais fraco do macOS | − Dois produtos diferentes em dois sistemas |

- **Default (⭐):** `posix_floor_optin` — Piso POSIX sempre; modo estrito com Docker opt-in
- **De onde vem esse default:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui (era D-C02)
- **Custo de mudar depois:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Grava em:** `decisions.D-S03`
- **Quem responde:** os dois (padrão de fábrica do builder + interruptor do aluno) · **quando:** `on-demand` · **status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos nesta entrada:** `D-C02`

```
decisions-ask.sh <setup_root> --record D-S03 posix_floor_optin
```

---

## 5. Camada 4 — congeladas (61): decisões de quem constrói

**Público: quem constrói a skill. Nenhuma destas é perguntada ao aluno — nunca.**

Elas estão aqui por um motivo só, e é o motivo que dá nome à seção: **transformar escolha
implícita em decisão auditável.** Um projeto que não escreve por que escolheu `setup.json` em
vez de `.study-method.json` não tem uma decisão — tem um hábito. Quem chegar depois não sabe
se pode mudar, nem quanto custa.

Cada entrada abaixo diz: o que foi escolhido, por quê, o que caiu junto, e **quanto custa
reverter**. Vinte delas já foram fechadas por arbitragem (`AR-NN`) e não voltam a ser
discutidas; as demais continuam `open`, com o default valendo e um marcador
`PERGUNTE AO USUÁRIO` no BUILD_SPEC, no ponto exato da construção em que a resposta muda o
que vai ser escrito.

Contagem: 61 congeladas · 20 fechadas por arbitragem · 41 em aberto com marcador de build.

### 5.1 `D-A` — arquitetura (19)

#### D-A01 — Como se chama o arquivo de manifesto na raiz de cada setup?

**Escolha congelada:** `setup_json` — `setup.json` visivel na raiz do setup

**Por quê.** E a plaquinha na porta da pasta. Sem ela o bootstrap sobe diretorio por diretorio procurando um marcador que nao existe e nunca descobre que ja esta dentro de um setup. Fica visivel de proposito: quem abre a pasta tem de entender o que aquilo e sem precisar ligar o `ls -a`.

**Alternativas descartadas.** `dot_hidden` (`.study-method.json` oculto) — cai por: Invisivel para quem esta tentando entender a propria pasta; `plain` (`study-method.json` visivel) — cai por: Nome mais longo sem ganho nenhum sobre `setup.json`

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-02)
- **Status:** decidida por arbitragem **AR-02** — não volta a ser pergunta
- **Ids absorvidos:** `D-B10`

#### D-A02 — Onde ficam os derivados de memoria (`INDEX.json`, `profile.json`, `progress.json`, `docs-index.json`, `.cache/`)?

**Escolha congelada:** `memory_dir` — Dentro de `memory/`

**Por quê.** Derivado e rascunho da maquina, nao caderno do aluno. Junta-los em `memory/` e ter uma gaveta so para as contas do mes: a mesa (a raiz do setup) fica com quatro pastas e dois arquivos, e mais nada. Se um derivado se perder, ele e recalculado; e por isso que ele nao mora junto do que e insubstituivel.

**Alternativas descartadas.** `setup_root` (Na raiz do setup) — cai por: Seis arquivos de maquina no meio do material de estudo; `hidden_ctrl` (Num diretorio oculto de controle) — cai por: Depende do `.study-method/` que a arbitragem A-02 eliminou do projeto inteiro

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-03)
- **Status:** decidida por arbitragem **AR-03** — não volta a ser pergunta

#### D-A03 — Qual e o campo e o vocabulario do estado da sessao?

**Escolha congelada:** `status_enum` — `status` com `in_progress\|completed\|abandoned`

**Por quê.** E o rotulo na capa da pasta da aula: 'em andamento', 'terminada' ou 'largada no meio'. Renomear esse campo depois e como trocar a etiqueta de todas as pastas de um arquivo ja cheio - da para fazer, mas alguem tem de abrir uma por uma.

**Alternativas descartadas.** `session_status` (`session_status` com `in_progress\|closed\|orphaned`) — cai por: Exige migrar todo arquivo de sessao ja escrito

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-01)
- **Status:** decidida por arbitragem **AR-01** — não volta a ser pergunta
- **Ids absorvidos:** `D-M08`

#### D-A04 — Em que momento a sessao nasce em disco?

**Escolha congelada:** `after_load_docs` — Depois de carregar memoria e teoria, antes da 1a fala

**Por quê.** E a hora de abrir o caderno. Cedo demais e o resumo da aula acaba lendo a si mesmo; tarde demais e uma queda de energia leva a aula inteira. Depois de carregar memoria e teoria e o ponto em que ja ha o que registrar e ainda nao ha o que se auto-contaminar.

**Alternativas descartadas.** `at_bootstrap` (Logo no `bootstrap`) — cai por: Cria sessao vazia toda vez que alguem so passou pela pasta; `at_close` (So no fim da aula) — cai por: Crash no meio da aula apaga a aula inteira - e crash no meio da aula e o modo de falha mais comum do sistema

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A05 — O que fazer ao encontrar uma sessao anterior interrompida (orfa)?

**Escolha congelada:** `auto_recover` — Recuperar automaticamente e oferecer a retomada na agenda

**Por quê.** E a aula que ficou com o caderno aberto porque o terminal fechou. Perguntar 'o que voce quer fazer com aquilo?' toda vez que isso acontece e cobrar pedagio diario pelo modo de falha mais comum do sistema. Fechar sozinho, preservando tudo, e oferecer a retomada como 1o item da agenda resolve sem gastar uma troca de mensagem.

**Alternativas descartadas.** `ask_student` (Perguntar ao aluno o que fazer) — cai por: Pergunta diaria sobre um evento que ja foi resolvido sem perda; `reopen` (Reabrir a mesma sessao e continuar nela) — cai por: Mistura duas aulas de dias diferentes num arquivo so

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-12)
- **Status:** decidida por arbitragem **AR-12** — não volta a ser pergunta
- **Ids absorvidos:** `D-M06`, `D-B06`

#### D-A06 — O que fazer se houver outra sessao viva no mesmo setup (dois terminais abertos)?

**Escolha congelada:** `abort` — Abortar o segundo (exit 4), dizendo qual pid/terminal segura a sessao

**Por quê.** Dois cadernos abertos na mesma pagina: quem escrever por ultimo apaga o outro. Abortar o segundo dizendo qual terminal esta com a sessao e o unico jeito de nao perder trabalho em silencio.

**Alternativas descartadas.** `readonly` (Abrir em modo somente-leitura, sem gravar) — cai por: Precisa de um modo a mais no codigo, e o aluno pode nao perceber que nada esta sendo salvo; `allow_both` (Abrir as duas e aceitar o risco) — cai por: Perda silenciosa de dado - o pior tipo

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A07 — Como `researchs/NNNN.md` carrega proveniencia (topico, fontes no `docs/` do setup, sessao de origem)?

**Escolha congelada:** `html_json` — Comentario HTML com JSON, legivel por `jq`

**Por quê.** E o carimbo de origem no verso da foto: de que aula saiu, de qual material. Sem parser de YAML nesta maquina, escolher YAML seria criar uma segunda lingua que so metade do sistema fala.

**Alternativas descartadas.** `yaml_front` (Frontmatter YAML) — cai por: Nao ha PyYAML nesta maquina; exigiria um segundo parser para a mesma informacao; `none` (Nenhum metadado) — cai por: Destilado sem origem e destilado que ninguem consegue auditar

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-20)
- **Status:** decidida por arbitragem **AR-20** — não volta a ser pergunta

#### D-A08 — O objeto `decisions` do `setup.json` e um mapa livre `id -> resposta` ou um array com schema estrito?

**Escolha congelada:** `open_map` — Objeto livre - a validacao fica com `decisions.json`

**Por quê.** E a diferenca entre uma caixa de chaves com etiqueta e um formulario com campos fixos. O mapa livre deixa uma decisao nova entrar sem virar a versao do schema; a validacao de valor fica com este catalogo, que e quem sabe quais opcoes existem.

**Alternativas descartadas.** `strict_array` (Array validado pelo schema do manifesto) — cai por: Toda decisao nova vira mudanca de schema

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A09 — O campo `language.name` do manifesto e um `enum` fechado de 19 linguagens ou string livre?

**Escolha congelada:** `closed_enum` — `enum` fechado, derivado da matriz de toolchains

**Por quê.** E a diferenca entre um menu e um campo em branco. O menu impede o aluno de escolher uma linguagem que a maquina nao roda; o campo em branco aceita `pyhton` e so quebra tres passos depois. Ampliar o menu depois custa uma virada de `schema_version` - por isso vale escolher com calma agora.

**Alternativas descartadas.** `free_pattern` (String com `pattern`) — cai por: `pyhton` passa na validacao e falha so na hora de rodar o desafio

- **Custo de reverter:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A10 — Qual namespace de `$id` para os schemas JSON do projeto?

**Escolha congelada:** `urn` — `urn:study-method:schema:<nome>:<major>`

**Por quê.** E o CEP dos schemas. Usar `https://` seria imprimir um endereco de uma rua que nao foi construida: ninguem consegue chegar la, e o verificador nem tenta. `urn:` diz 'isto e um nome, nao um lugar' e para de prometer.

**Alternativas descartadas.** `https` (URL `https://` de um dominio do projeto) — cai por: Promete um endereco que nao existe e ninguem pode buscar; `relative` (Caminho relativo) — cai por: Quebra assim que o arquivo e movido ou copiado

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-04)
- **Status:** decidida por arbitragem **AR-04** — não volta a ser pergunta

#### D-A11 — O `memory/NNNN.json` e reescrito a cada marco da aula (checkpoint) ou so no fechamento?

**Escolha congelada:** `per_milestone` — Checkpoint a cada marco da aula

**Por quê.** E salvar o documento a cada paragrafo em vez de so no fim. O arquivo e pequeno, a reescrita custa milissegundos, e o ganho aparece exatamente no dia em que o terminal fecha sozinho: a sessao orfa tem conteudo em vez de ter so um cabecalho.

**Alternativas descartadas.** `on_close` (So no `close_session`) — cai por: Queda no meio da aula deixa um arquivo vazio - e tira todo o sentido da recuperacao de orfa; `timed` (Checkpoint por tempo (ex.: a cada 10 min)) — cai por: Salva no meio de um raciocinio e nao salva no fim de um marco

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/01-arquitetura.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A12 — Onde fica o registry global de setups?

**Escolha congelada:** `xdg` — `${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/registry.json`

**Por quê.** E a agenda de enderecos dos seus estudos. Poe-la no lugar que o sistema reserva para dado de aplicativo (`XDG_DATA_HOME`) e guardar a agenda na gaveta da agenda; deixar um override por variavel e poder levar a gaveta inteira para outro lugar em um comando.

**Alternativas descartadas.** `dot_home` (`~/.study-method/registry.json`) — cai por: Mais um diretorio oculto na raiz do `$HOME`, contra a convencao XDG; `first_setup` (Dentro do primeiro setup criado) — cai por: Apagar o primeiro setup derruba a descoberta de todos os outros

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A13 — O setup se auto-registra no registry, ou registrar e um comando explicito do aluno?

**Escolha congelada:** `auto` — Auto-registro dentro de `setup-init.sh`

**Por quê.** Ninguem lembra de anotar o telefone novo na agenda. Um setup fora do registry e invisivel para a leitura cruzada e para o 'abre o meu estudo de calculo' - e o aluno so descobre isso semanas depois, quando ja esqueceu que existia um passo manual.

**Alternativas descartadas.** `explicit` (Comando `setup-list.sh --register <path>`) — cai por: Todo mundo esquece, e o sintoma aparece muito depois da causa; `auto_confirm` (Auto-registro com confirmacao de uma linha) — cai por: Uma pergunta a mais no unico momento em que o aluno so quer comecar a estudar

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A16 — Quanto de outro setup a leitura cruzada pode ler, e como isso e configurado?

**Escolha congelada:** `readme_only` — So o `README.md` do setup, com interruptor tri-estado `privacy.cross_read`

**Por quê.** E o vizinho que pode ler o cartaz na sua porta, nunca a gaveta da sua mesa. `README.md` e o cartaz; `memory/`, `researchs/`, `challenges/` e `docs/` sao a gaveta - e a gaveta nao abre nem com autorizacao, porque autorizacao dada uma vez vira permissao para sempre.

**Alternativas descartadas.** `readme_plus_research` (`README.md` + `researchs/` sob autorizacao) — cai por: Autorizacao concedida uma vez nunca e revista; `also_memory` (Tambem `memory/`) — cai por: `memory/` guarda perfil cognitivo - e o dado mais sensivel do sistema

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-14)
- **Status:** decidida por arbitragem **AR-14** — não volta a ser pergunta
- **Leia junto:** `D-S04`

#### D-A18 — Dois setups podem ter o mesmo `setup_name`?

**Escolha congelada:** `allow_dup` — Sim, desempatados por caminho e data da ultima sessao

**Por quê.** Dois arquivos chamados 'notas' em pastas diferentes nao sao um erro - sao duas pastas. Exigir nome unico no mundo dependeria do registry estar sempre certo, e o registry e justamente o componente que pode estar desatualizado.

**Alternativas descartadas.** `reject_dup` (Nao, `setup-init.sh` recusa nome repetido) — cai por: Unicidade global depende do registry - e o registry pode estar velho

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A19 — O aluno copiou a pasta de um setup; agora ha dois caminhos vivos com o mesmo `setup_id`. O que fazer?

**Escolha congelada:** `reissue_id` — Sortear `setup_id` novo para a copia recem-aberta e registrar as duas

**Por quê.** Copiar uma pasta e tirar uma foto: passa a haver duas, e nenhuma das duas e a falsa. Se as duas continuarem com a mesma identidade, o historico de uma sobrescreve o da outra. Sortear id novo para a copia recem-aberta preserva as duas.

**Alternativas descartadas.** `refuse` (Recusar abrir ate o aluno resolver) — cai por: Trava a aula por causa de um `cp -r`; `same_setup` (Tratar como o mesmo setup e usar o ultimo caminho) — cai por: As duas pastas passam a brigar pelo mesmo historico

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A20 — O `README.md` do setup e regenerado inteiro ou so entre marcadores?

**Escolha congelada:** `markers` — So entre marcadores, preservando a prosa do aluno

**Por quê.** E a diferenca entre um quadro de avisos e uma folha impressa. Entre marcadores, a maquina atualiza a parte dela e a sua anotacao a lapis continua ali. Regenerar inteiro apaga a anotacao uma vez - e uma vez basta para o aluno nunca mais escrever nada nesse arquivo.

**Alternativas descartadas.** `full_regen` (Regenerar o arquivo inteiro) — cai por: Apaga nota do aluno; destroi a confianca no arquivo de forma permanente; `separate_file` (Gerar em arquivo separado e deixar o `README.md` 100% do aluno) — cai por: Dois arquivos que dizem a mesma coisa, e o aluno le so um

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A22 — Setup que mudou de lugar: corrigir o `path` no registry automaticamente ou perguntar?

**Escolha congelada:** `auto_fix` — Corrigir automaticamente quando o caminho antigo nao existe mais

**Por quê.** O amigo mudou de casa e voce achou o endereco novo. Nao existe alternativa razoavel a anotar o endereco novo - perguntar 'posso atualizar?' e cerimonia sobre um fato ja verificado.

**Alternativas descartadas.** `always_ask` (Sempre perguntar) — cai por: Pergunta cuja unica resposta sensata e 'sim'; `flag_only` (So corrigir com `--fix` explicito) — cai por: A skill fica quebrada ate alguem lembrar da flag

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-A23 — A ponte entre dois assuntos e registrada nos dois setups ou so no atual?

**Escolha congelada:** `current_only` — So no setup atual (unilateral)

**Por quê.** E a nota de rodape que voce escreve no seu caderno, nao no caderno do colega. Reciprocidade exigiria escrever dentro do diretorio de outro assunto, e escrita cruzada entre setups e proibida sem excecao - nao existe campo `reciprocal`.

**Alternativas descartadas.** `both` (Nos dois (reciproca)) — cai por: Exige escrever no diretorio de outro assunto - proibido sem excecao

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/07-multi-setup.md#decisoes-abertas-geradas-aqui
- **Status:** decidida por arbitragem **AR-10** — não volta a ser pergunta

### 5.2 `D-M` — memória (3)

#### D-M01 — 'Sempre lemos os arquivos anteriores' vira indice + perfil + digest sempre, com os `NNNN.json` brutos abertos seletivamente - e nao 'carregar todos os arquivos no contexto'. Confirma?

**Escolha congelada:** `index_profile_digest` — Indice + perfil + digest sempre; brutos sob demanda

**Por quê.** E a diferenca entre reler o diario inteiro toda manha e ler o indice, o resumo e so a pagina que interessa hoje. Na sessao 40 a primeira opcao ja nao cabe na mesa; a segunda continua cabendo em qualquer numero de sessoes.

**Alternativas descartadas.** `load_all` (Carregar todos os brutos sempre) — cai por: Estoura o contexto em poucas dezenas de sessoes; `hybrid_n` (Carregar todos ate N sessoes, depois trocar) — cai por: Dois comportamentos diferentes e um degrau em que o aluno sente a skill 'piorar'

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/03-memoria.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-M04 — Sessoes `abandoned` entram na compactacao?

**Escolha congelada:** `include_low_conf` — Entram, contam para o limiar, e travam em `confidence: low` o que so elas sustentam

**Por quê.** A aula que acabou no meio ainda aconteceu. Joga-la fora e perder evidencia real; trata-la como aula completa e promover conclusao que ninguem terminou de tirar. Entra, conta para o limiar, e trava em `confidence: low` os fatos que so ela sustenta.

**Alternativas descartadas.** `ignore` (Ignoradas na consolidacao, preservadas no disco) — cai por: Uma aula interrompida no meio de um avanco real vira historia que nunca existiu

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/03-memoria.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-M07 — RAG local (`sqlite-vec` + embedding local) para busca por conteudo livre: adotar agora ou deixar como upgrade futuro?

**Escolha congelada:** `later_150` — So quando passar de ~150-200 sessoes

**Por quê.** E instalar um sistema de busca numa biblioteca de trinta livros: a estante ainda resolve. O schema ja guarda os campos de texto que seriam indexados, entao a porta fica aberta sem custo - e so se abre quando o acervo justificar.

**Alternativas descartadas.** `now` (Desde ja) — cai por: Dependencia binaria e modelo de embedding para um acervo de dezenas de arquivos; `never` (Nunca) — cai por: Fecha a porta antes de saber se o acervo vai crescer

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/03-memoria.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

### 5.3 `D-P` — proficiência (6)

#### D-P05 — Quem pode criar `concept_id`?

**Escolha congelada:** `track_plus_prereq` — So a trilha do `docs/` do setup, mais a excecao do pre-requisito descoberto (`track_ref: null`)

**Por quê.** E quem pode abrir gaveta nova no arquivo. Se o tutor abre gaveta a cada aula, em dois meses ha tres gavetas para 'derivada' e nenhuma delas tem o historico inteiro. A trilha do material e a dona; a unica excecao e o pre-requisito descoberto no meio do caminho, marcado como tal.

**Alternativas descartadas.** `track_only` (So a trilha) — cai por: Pre-requisito descoberto na aula nao tem onde ser registrado; `ad_hoc` (O tutor cria ad hoc durante a sessao) — cai por: Tres ids para o mesmo conceito em dois meses, e nenhum historico completo

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-P07 — Onde vive o arquivo de proficiencia e qual e o seu escopo?

**Escolha congelada:** `per_setup` — `memory/progress.json`, um por setup

**Por quê.** Um caderno de notas por materia, nao um por capitulo. `memory/progress.json`, um por setup: renomear depois e trivial, mudar o escopo (de um por setup para um por trilha) exige refazer toda a evidencia acumulada.

**Alternativas descartadas.** `per_track` (Um arquivo por trilha dentro do setup) — cai por: Conceito que aparece em duas trilhas passa a ter dois historicos; `in_index` (Embutir o estado no indice de memoria episodica) — cai por: Mistura 'o que aconteceu' com 'o que voce sabe' - duas coisas com ciclos de vida diferentes

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-P08 — Como um evento de proficiencia chega a `progress-update.sh`?

**Escolha congelada:** `event_file` — `--event <arquivo.json>` (aceita `-` para stdin)

**Por quê.** E o formulario de entrada do arquivo. Sem uma forma declarada de entregar o evento, a regra 'escrita so por evento' nao era aplicavel - era so uma boa intencao. Um arquivo JSON validado (ou `-` para stdin) e o unico jeito de o script recusar o que nao tem forma.

**Alternativas descartadas.** `cli_fields` (Campos soltos na linha de comando) — cai por: Nao ha como validar contra schema; a regra do evento vira sugestao; `read_session` (O script le a sessao sozinho) — cai por: `error_type` e `hint_level` nao existem no registro de sessao - ele leria o que nao esta la

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Status:** decidida por arbitragem **AR-24** — não volta a ser pergunta

#### D-P09 — Qual e o formato dos identificadores (`setup_id`, `concept_id`, `challenge_id`, `hint_level`)?

**Escolha congelada:** `canon` — `setup_id` = `^[0-9a-f]{12}$` · `concept_id` = snake_case · `challenge_id` = `^[0-9]{4}$` · `hint_level` = 0..5

**Por quê.** Sao os numeros de patrimonio do sistema. Trocar o formato depois nao e renomear: e reetiquetar cada evidencia ja registrada, uma por uma, sem poder errar nenhuma. Por isso este e o campo em que 'depois a gente ve' custa mais caro.

**Alternativas descartadas.** `readable` (Ids legiveis com slug embutido (ex.: `c-0031-fatorial`)) — cai por: O slug muda quando o titulo muda, e a identidade vai junto

- **Custo de reverter:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Origem:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linhas A-10, A-15, A-16)
- **Status:** decidida por arbitragem **AR-10/15/16** — não volta a ser pergunta

#### D-P10 — `progress.json` pode ser reconstruido a partir de `memory/NNNN.json`?

**Escolha congelada:** `primary` — Nao - e dado primario

**Por quê.** Se fosse cache, apagar seria inofensivo. Nao e: `error_type`, `hint_level` e `transition_rule` nunca existiram no registro de sessao. E dado primario - o equivalente ao caderno de notas do professor, nao ao resumo da aula.

**Alternativas descartadas.** `cache` (Sim - e cache das sessoes) — cai por: Falso: os campos que sustentam a transicao de estado nao estao nas sessoes

- **Custo de reverter:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Origem:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Status:** decidida por arbitragem **AR-30** — não volta a ser pergunta

#### D-P11 — De onde vem `state_reason: "manual"`?

**Escolha congelada:** `human_edit` — Edicao direta do arquivo pelo aluno ou operador

**Por quê.** E a rasura assinada no caderno. O arquivo e legivel e editavel de proposito; se alguem editar na mao, o campo tem de poder dizer isso. O que nao pode e o tutor escrever 'manual' para justificar uma decisao que foi dele - isso e mentir sobre a causa.

**Alternativas descartadas.** `remove` (Remover do enum) — cai por: Edicao humana passaria a se disfarcar de decisao automatica; `tutor_writes` (O tutor pode escrever) — cai por: Mente sobre a causa da transicao - e a causa e justamente o que o campo existe para dizer

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/04-proficiencia.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

### 5.4 `D-E` — ensino (6)

#### D-E02 — O degrau inicial da escada de dicas e amarrado ao estado de proficiencia do conceito?

**Escolha congelada:** `state_map` — Sim, pelo mapa proposto

**Por quê.** Comecar no degrau 1 ('o que voce ja tentou?') com um conceito que a pessoa nunca viu e mandar procurar no bolso uma chave que nunca esteve la. O mapa (desconhecido -> degrau 2, fragil -> 1, dominado -> 1 com espera longa) so calibra o ponto de partida.

**Alternativas descartadas.** `always_1` (Sempre comecar no degrau 1) — cai por: Frustra quem nunca viu o conceito antes de a aula comecar; `ask` (Sempre perguntar ao aluno onde ele quer comecar) — cai por: Uma pergunta de metodologia no meio de um travamento

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/02-pedagogia.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-E05 — Qual e a politica de elogio honesta?

**Escolha congelada:** `merit_plus_cap` — Merito especifico e verificavel, com teto de 1 por turno e nenhum em turnos consecutivos sem merito novo

**Por quê.** Elogio que vem sempre e como aplauso gravado: para de significar qualquer coisa. Merito especifico e verificavel, com teto de um por turno e nenhum em turnos consecutivos sem merito novo, mantem o elogio informativo - quando ele vem, ele quer dizer algo.

**Alternativas descartadas.** `merit_only` (So merito especifico, sem cota) — cai por: Uma aula boa vira dez elogios, e o decimo nao vale nada; `zero` (Zero elogio, so constatacao tecnica) — cai por: Retira reforco legitimo de quem de fato acertou algo dificil

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/02-pedagogia.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-E06 — O tutor anuncia que esta subindo a escada de dicas?

**Escolha congelada:** `signal_no_number` — Sinaliza sem numerar

**Por quê.** Sinalizar sem numerar e dizer 'deixa eu te dar uma pista maior' - o aluno entende que a ajuda aumentou e continua achando que resolveu. Numerar o degrau expoe o mecanismo e convida a pedir o degrau 5 direto, que e exatamente o que a escada existe para evitar.

**Alternativas descartadas.** `silent` (Sobe em silencio) — cai por: O aluno nao percebe que ja esta sendo carregado; `numbered` (Numera o degrau explicitamente) — cai por: Convida a pedir 'me da o degrau 5' na primeira dificuldade

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/pedagogia.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-E08 — Quando o tutor declara onde a analogia quebra?

**Escolha congelada:** `on_test_or_touch` — No teste de previsao, ou na primeira vez que o aluno encostar no limite

**Por quê.** Toda analogia tem uma fronteira - 'atomo e um sisteminha solar, so que nao'. Declarar a fronteira na introducao entrega a excecao antes de a pessoa ter a regra; esperar o aluno errar por causa dela e implantar a concepcao errada de proposito. No teste de previsao, ou na primeira vez que ele encostar no limite - o que vier antes.

**Alternativas descartadas.** `at_intro` (Junto com a introducao, sempre) — cai por: Sobrecarrega o novato com a excecao antes da regra; `after_error` (So quando o aluno erra por causa dela) — cai por: Implanta a concepcao errada de proposito e depois conserta

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** skills/study-method/references/analogy-bank.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-E10 — As analogias que funcionaram ficam so no perfil do aluno ou vao para o banco global?

**Escolha congelada:** `manual_promo` — Promocao manual, quando o usuario aprovar

**Por quê.** O banco global e o cardapio da casa; o perfil e o gosto do freguês. Promover automaticamente porque funcionou com uma pessoa incha o cardapio com pratos que so ela pede.

**Alternativas descartadas.** `profile_only` (So no perfil do aluno) — cai por: Uma analogia excelente nunca beneficia mais ninguem; `auto_promo` (Promocao automatica apos funcionar com 1 aluno) — cai por: Enche o banco de dominios idiossincraticos de uma pessoa so

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/analogy-bank.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-E11 — O tutor pode inventar analogia fora do banco na hora?

**Escolha congelada:** `invent_and_log` — Sim, e registra no perfil com a fronteira declarada

**Por quê.** A melhor analogia quase nunca esta no banco - ela vem do que o aluno acabou de contar sobre a propria vida. Deixar inventar e obvio; o que faz diferenca e registrar, com a fronteira declarada, para a mesma analogia voltar na aula seguinte em vez de nascer diferente toda vez.

**Alternativas descartadas.** `invent_free` (Sim, livremente, sem registrar) — cai por: A mesma ideia volta com outra roupa e o aluno reaprende do zero; `bank_only` (Nao, so usa o banco) — cai por: Descarta justamente a analogia mais eficaz que existe

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/analogy-bank.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

### 5.5 `D-C` — challenge (8)

#### D-C03 — Qual e o limiar de mutation score para aprovar um desafio gerado?

**Escolha congelada:** `t090` — 0,90, aplicado com os mutantes equivalentes fora do denominador

**Por quê.** E o controle de qualidade do gabarito: o motor estraga o codigo de proposito e ve se o teste percebe. Exigir 100% gera regeneracao infinita, porque alguns estragos nao mudam comportamento nenhum. 0,90 reprova uma suite que perdeu dois cenarios num catalogo de 17; 0,80 nao reprova.

**Alternativas descartadas.** `t080` (0,80 (permissivo)) — cai por: Nao reprova uma suite que perdeu dois cenarios; `t100` (1,00 (zero sobreviventes nao classificados)) — cai por: Regeneracao infinita em desafios com muitos mutantes equivalentes

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-C08 — Amostragem de mutantes em linguagens compiladas: quando parar de testar todos?

**Escolha congelada:** `over_120s` — Amostrar acima de 120 s de build total, com amostra deterministica

**Por quê.** Cada mutante compilado e um build inteiro. Um desafio Rust com 17 mutantes a 4 segundos de build passa de um minuto so nesse passo, e o aluno fica olhando o cursor. Acima de 120 segundos amostra-se - e a amostra e deterministica, nunca sorteada, senao o mesmo desafio da score diferente a cada rodada.

**Alternativas descartadas.** `never_sample` (Nunca amostrar) — cai por: Minutos de espera em qualquer desafio compilado; `always_k8` (Limitar sempre a k=8) — cai por: Amostra ate quando testar tudo custaria 3 segundos

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-C09 — Os mutantes sobreviventes ficam visiveis no manifesto que o aluno pode ler?

**Escolha congelada:** `omit_revealing` — Omitir `before`/`after` quando revelarem a solucao, mantendo o score

**Por quê.** O mutante sobrevivente e um bug que o seu teste nao pegou - e mostrar o codigo dele as vezes entrega a solucao de bandeja. Manter o score visivel e omitir o antes/depois quando ele revela da transparencia sobre a qualidade do teste sem entregar a resposta.

**Alternativas descartadas.** `always_visible` (Sempre visiveis) — cai por: Ler o manifesto vira atalho para a solucao; `hide_all` (Manifesto inteiro oculto) — cai por: O aluno nao consegue nem saber se o teste dele era bom

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-C10 — Quantas tentativas de regeneracao antes de desistir de um desafio ruim?

**Escolha congelada:** `three` — 3

**Por quê.** E quantas vezes vale reescrever a mesma prova antes de trocar de prova. A pesquisa em producao mostra aproveitamento perto de 1 em 20 nesse tipo de geracao; insistir alem de tres custa o tempo do aluno esperando, e propor outro desafio do mesmo conceito e mais barato que consertar um ruim.

**Alternativas descartadas.** `one` (1) — cai por: Descarta desafio que sairia bom na segunda; `five` (5) — cai por: O aluno espera olhando o cursor; `unlimited` (Sem limite) — cai por: Pode nao terminar nunca

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-C14 — Como um script de shell obtem do modelo um julgamento que ele nao pode computar sozinho?

**Escolha congelada:** `request_apply` — REQUEST/APPLY: pedido em stdout + exit 10, resposta por `--apply`

**Por quê.** Um script nao 'pergunta' nada a um modelo - ele so escreve e sai. O protocolo REQUEST/APPLY e o bilhete deixado na mesa: o script imprime o pedido, sai com um codigo combinado, e alguem volta com a resposta num arquivo que e validado contra schema antes de qualquer escrita.

**Alternativas descartadas.** `script_asks` (O script 'pergunta' ao modelo) — cai por: Impossivel: nao ha canal do processo para o modelo; `guess` (O script chuta) — cai por: Classificacao inventada contamina o score e mente para sempre

- **Custo de reverter:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#6
- **Status:** decidida por arbitragem **AR-00** — não volta a ser pergunta

#### D-C15 — Operadores compostos (`*=`, `+=`) sao mutaveis? Quantos mutantes RVR e SVR sao gerados?

**Escolha congelada:** `canon17` — Compostos NAO mutaveis; RVR = 1 por funcao que devolve valor; SVR = 1 por ocorrencia de leitura elegivel

**Por quê.** E o catalogo de estragos que o motor sabe fazer. Mexer nele depois nao 'melhora o teste': muda a versao dos operadores e invalida qualquer comparacao de score com desafios ja aprovados - como trocar a regua no meio da obra.

**Alternativas descartadas.** `compound14` (Compostos mutaveis (da 14)) — cai por: Contagem incompativel com a de referencia ja verificada; `compound_svr30` (Compostos mutaveis + SVR por par (da 30)) — cai por: Quase o dobro dos builds, e o tempo de validacao dobra junto

- **Custo de reverter:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Status:** decidida por arbitragem **AR-26** — não volta a ser pergunta

#### D-C16 — `integrity.test_sha256` e obrigatorio desde a criacao do manifesto do desafio?

**Escolha congelada:** `null_until_approved` — Aceita `null`; obrigatorio so com o desafio validado ou resolvido, e sempre calculado pelo harness

**Por quê.** E o lacre do envelope. Exigir o lacre antes de o envelope existir forcaria alguem a inventar um numero - e uma LLM nao computa SHA-256. Hash inventado faz a deteccao de adulteracao mentir para sempre, o que e pior que nao ter deteccao nenhuma.

**Alternativas descartadas.** `always` (Obrigatorio sempre) — cai por: Forca hash inventado na criacao - a deteccao passa a mentir; `remove` (Remover o campo) — cai por: Some com a deteccao de adulteracao inteira

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui
- **Status:** decidida por arbitragem **AR-19** — não volta a ser pergunta

#### D-C17 — Como o harness detecta que um teste estourou o tempo?

**Escolha congelada:** `elapsed` — Comparar o tempo decorrido com o teto

**Por quê.** Nao da para confiar no codigo de saida: com `timeout -s KILL -k 5` o codigo e 137, nunca 124, e `timeout` simples dentro da pilha real trava em vez de matar. Comparar o tempo decorrido com o teto e olhar o relogio em vez de acreditar no recado - verificado nesta maquina.

**Alternativas descartadas.** `exit124` (`exit == 124`) — cai por: Nunca acontece na pilha canonica: com `-s KILL` o codigo e 137; `exit137` (Confiar no 137) — cai por: 137 tambem aparece em morte por falta de memoria - confunde duas causas

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/05-challenges-tdd.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-06)
- **Status:** decidida por arbitragem **AR-06** — não volta a ser pergunta

### 5.6 `D-V` — visualização e linguagem (10)

#### D-V06 — O renderizador aceita `expr` (string avaliada com `eval` restrito) ou exige todos os pontos calculados?

**Escolha congelada:** `expr_tutor_only` — Aceita `expr` com namespace restrito, so quando vem do tutor

**Por quê.** `expr` e deixar o desenhista calcular a curva sozinho: economiza muito token para y=f(x). O risco e obvio - texto colado pelo aluno virando codigo executado. Aceitar `expr` so quando vem do tutor, nunca de texto colado, e a mitigacao honesta.

**Alternativas descartadas.** `expr_any` (Aceita `expr` de qualquer origem) — cai por: Texto colado pelo aluno vira codigo executado; `points_only` (So `points` / `x`,`y`) — cai por: Uma curva de 200 pontos vira 200 pares no payload

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-V07 — PNG e gerado sempre ou so sob pedido?

**Escolha congelada:** `on_flag` — So com `--png`

**Por quê.** SVG e HTML ja cobrem ver e imprimir. PNG e para colar a figura em outro lugar - o Word do trabalho, o slide. Gerar sempre custa um rasterizador e um arquivo a mais em toda figura, para um caso que aparece de vez em quando.

**Alternativas descartadas.** `when_available` (Sempre que houver rasterizador) — cai por: Arquivo a mais em toda figura, quase sempre inutil; `always_fail` (Sempre, e falhar se nao houver rasterizador) — cai por: Falha o grafico inteiro por causa de um formato opcional

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-V08 — Onde ficam os arquivos de grafico gerados?

**Escolha congelada:** `researchs_assets` — `researchs/assets/<NNNN>-<slug>/`

**Por quê.** A figura pertence ao material destilado, nao ao desafio que a produziu - ela sobrevive ao desafio ser refeito. E precisa de um diretorio de verdade, porque a sessao e um arquivo JSON e nao tem 'dentro'. Um subdiretorio por destilado evita `passo-01.svg` de aulas diferentes colidirem.

**Alternativas descartadas.** `session_viz` (`<sessao>/viz/`) — cai por: Impossivel: a sessao e um arquivo JSON, nao um diretorio; `tmp` (`/tmp`) — cai por: A figura some no proximo boot

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui + skills/study-method/references/visualizacao.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-18)
- **Status:** decidida por arbitragem **AR-18** — não volta a ser pergunta
- **Ids absorvidos:** `D-V12@docs/06-visualizacao.md`

#### D-V10 — Quando os dados do grafico vem do programa do aluno, exigir JSON ou parsear a saida de texto?

**Escolha congelada:** `json_or_csv` — JSON (ou CSV simples)

**Por quê.** Pedir para o programa gravar JSON e pedir a nota fiscal em vez de um bilhete escrito a mao. Gravar dado estruturado e parte do que se aprende; parsear texto livre falha em silencio no dia em que o aluno muda o `print`.

**Alternativas descartadas.** `parse_text` (Parsear texto livre) — cai por: Fragil e silencioso: muda o `print` e o grafico sai errado sem aviso

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/visualizacao.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-V11 — Onde fica o estado de setup (venv aceito, linguagem confirmada)?

**Escolha congelada:** `setup_json` — `setup.json`, o manifesto na raiz do setup

**Por quê.** Estado do estudo inteiro nao mora no manifesto de um exercicio. Gravar 'aceitei o venv' dentro de `challenges/<NNNN>-<slug>/meta.json` significa reperguntar a cada desafio novo - o aluno responde a mesma coisa dez vezes.

**Alternativas descartadas.** `meta_json` (`meta.json` do setup) — cai por: Nao existe: `meta.json` e o manifesto de um desafio; `registry` (Registry global) — cai por: Aceitar o venv num assunto nao deveria valer para os outros

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui
- **Status:** decidida por arbitragem **AR-23** — não volta a ser pergunta

#### D-V13 — Quais sao as chaves obrigatorias do `spec` do grafico, e o que `categories` e `force_legend` significam?

**Escolha congelada:** `closed_list` — Lista fechada

**Por quê.** Um codigo de erro chamado `spec_missing_key` que nao cobrava chave nenhuma e um alarme sem sensor. A lista fechada e o sensor: `type`, `title`, `x_label`, `y_label` e `series` sempre; `categories` so em barra, e obrigatoria la; `force_legend` so forca a legenda, nunca a esconde.

**Alternativas descartadas.** `undefined` (Indefinidas) — cai por: Alarme sem sensor: o codigo de erro existe e nunca dispara

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/06-visualizacao.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-V14 — O `runner.sh` normaliza o exit code (101/134/2/5 -> 1) ou repassa o bruto?

**Escolha congelada:** `normalize_echo` — Normalizar para 0/1/2/3 e ecoar o bruto e o tempo decorrido no stdout

**Por quê.** Cada linguagem inventa o proprio codigo para 'falhou': 101 no Rust, 134 num abort, 5 quando nenhum teste rodou. Normalizar para 0/1/2/3 e traduzir tudo para um idioma so; ecoar o bruto no stdout preserva o diagnostico, que e o que se perderia na traducao.

**Alternativas descartadas.** `normalize_only` (Normalizar para 0/1 e logar o bruto) — cai por: Nao distingue 'contagem errada' de 'timeout'; `raw` (Repassar o bruto) — cai por: Quem chama precisa conhecer o vocabulario de exit code de 19 linguagens

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/languages.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-05)
- **Status:** decidida por arbitragem **AR-05** — não volta a ser pergunta
- **Ids absorvidos:** `D-V11@references/languages.md`

#### D-V15 — O guard 'testes executados > 0' roda sempre, ou so quando o exit for 0?

**Escolha congelada:** `always` — Sempre, antes e depois

**Por quê.** E conferir se a prova tinha questoes antes de comemorar a nota. Uma suite que nao rodou nenhum teste sai com exit 0 em varias linguagens - e um `grep` custa nada e e a unica defesa contra isso.

**Alternativas descartadas.** `on_zero` (So quando o exit for 0) — cai por: Perde o caso do erro que mascarou uma suite vazia; `at_gen` (So na geracao do desafio) — cai por: Nao pega o dia em que o aluno quebrou a descoberta de testes

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/languages.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos:** `D-V12@references/languages.md`

#### D-V16 — Linguagem com toolchain parcial (Java sem Maven/Gradle, C++ sem cmake): caminho zero-install ou pedir o build system?

**Escolha congelada:** `zero_install` — Zero-install (`-ea`, `g++` direto); mencionar o build system so se o aluno pedir

**Por quê.** Para compilar uma funcao, `javac` e `g++` bastam. A primeira execucao de `mvn test` baixa meia internet para um exercicio de vinte linhas - e o aluno so queria testar um fatorial.

**Alternativas descartadas.** `require_build` (Pedir Maven/Gradle/cmake de saida) — cai por: Minutos de download antes do primeiro teste

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/languages.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos:** `D-V13@references/languages.md`

#### D-V17 — A deteccao de toolchains roda uma vez no setup ou a cada sessao?

**Escolha congelada:** `setup_plus_revalidate` — No setup, revalidando so a linguagem em uso a cada sessao

**Por quê.** Um `command -v` custa milissegundos e pega os dois casos que quebram a aula: 'instalei ontem' e 'desinstalei sem lembrar'. Redetectar tudo a cada sessao seria varrer 19 linguagens para confirmar uma.

**Alternativas descartadas.** `setup_only` (Uma vez no setup) — cai por: A aula quebra no dia em que a linguagem sumiu; `every_session` (A cada sessao, tudo) — cai por: Varre 19 linguagens para usar uma

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** skills/study-method/references/languages.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário
- **Ids absorvidos:** `D-V14@references/languages.md`

### 5.7 `D-B` — bootstrap (4)

#### D-B03 — Quantas perguntas na criacao do setup?

**Escolha congelada:** `six_plus_confirm` — As 6 minimas + confirmacao, com atalho de 2 trocas

**Por quê.** Cada pergunta antes da primeira aula e um pedagio. Perguntar 25 coisas mata o projeto: o aluno veio estudar, nao configurar. Seis mais uma confirmacao, com atalho para quem quer so comecar - e o teto que este catalogo inteiro existe para proteger.

**Alternativas descartadas.** `subject_only` (So o assunto, o resto no default) — cai por: Erra o nivel e o tempo justamente na aula em que ainda nao conhece o aluno; `long_interview` (Entrevista longa com todas as decisoes) — cai por: Mata o projeto: ninguem responde 25 perguntas para estudar

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + docs/10-bootstrap.md §6.1
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-B08 — Onde fica o material que a skill gera, e ela pode escrever no `docs/` do setup?

**Escolha congelada:** `docs_generated` — So em `<docs-do-setup>/generated/`, sempre marcado como gerado

**Por quê.** A raiz do `docs/` e territorio do aluno - material dele, do professor dele. Material gerado que se mistura com o material dele contamina o corpus de estudo, e daqui a tres meses ninguem sabe mais quem escreveu o que. `generated/` dentro do `docs/` do setup e a unica excecao, com tres camadas de marcacao.

**Alternativas descartadas.** `researchs` (Em `researchs/`) — cai por: `researchs/` e destilado de aula, nao base teorica - duas coisas diferentes na mesma pasta; `outside` (Fora do setup) — cai por: O material gerado nao seria lido pela ingestao - inutil; `free` (Livre no `docs/` do setup) — cai por: Impossivel distinguir depois o que era do aluno e o que a maquina escreveu

- **Custo de reverter:** `moderate` (médio) — mudar depois exige migrar dado já escrito, ou mover arquivo que já existe
- **Origem:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + skills/study-method/references/docs-ingest.md#decisoes-abertas-geradas-aqui + docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui + docs/00-contratos.md#12-registro-das-decisoes-arbitradas-aqui (linha A-25)
- **Status:** decidida por arbitragem **AR-25** — não volta a ser pergunta
- **Ids absorvidos:** `D-S13`

#### D-B11 — Ate que profundidade a skill varre o `docs/` do setup?

**Escolha congelada:** `recursive_200` — Recursivo, teto de 200 arquivos

**Por quê.** Quem organiza material cria subpasta - `provas/2024/`, `slides/cap3/`. Parar na raiz e ignorar metade do que a pessoa organizou com cuidado. Recursivo com teto de 200 arquivos varre a pasta de verdade e ainda protege contra o dia em que alguem aponta o setup para o `$HOME`.

**Alternativas descartadas.** `root_only` (So a raiz) — cai por: Ignora a organizacao que o aluno fez; `two_levels` (2 niveis) — cai por: Numero arbitrario que quebra na terceira subpasta

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + skills/study-method/references/docs-ingest.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-B12 — Que fatia do orcamento o material pode ocupar, deixando o resto para a aula?

**Escolha congelada:** `p60` — 60% material / 40% aula

**Por quê.** E dividir a mesa entre o livro e o caderno. Sessenta por cento para o material e quarenta para a aula deixa espaco para o dialogo, o codigo e o raciocinio - que e onde o aprendizado acontece. Oitenta por cento enche a mesa de livro e nao sobra onde escrever.

**Alternativas descartadas.** `p40` (40% material / 60% aula) — cai por: Quase todo material vira indexado; `p80` (80% material / 20% aula) — cai por: Sobra pouco para a conversa - e a conversa e a aula

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/10-bootstrap.md#decisoes-abertas-geradas-aqui + skills/study-method/references/docs-ingest.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

### 5.8 `D-S` — segurança (5)

#### D-S07 — Telemetria: zero, contagem anonima opt-in, ou relatorio de erro opt-in?

**Escolha congelada:** `zero` — Zero, sem excecao

**Por quê.** Um produto que guarda o perfil cognitivo de alguem nao tem margem para 'so metricas anonimas'. A promessa 'nada sai daqui' vale enquanto for absoluta; com uma excecao, ela vira 'quase nada sai daqui', e ninguem consegue verificar qual e a excecao. Manter e barato; reverter, nao: uma vez que se coleta, a promessa ja quebrou.

**Alternativas descartadas.** `anon_optin` (Contagem anonima opt-in) — cai por: 'Anonimo' num sistema com perfil cognitivo e uma palavra que ninguem consegue auditar; `error_optin` (Relatorio de erro opt-in) — cai por: Relatorio de erro carrega caminho, nome de arquivo e trecho de conteudo

- **Custo de reverter:** `expensive` (caro) — há efeito que **não** se desfaz — histórico de git, dado já gravado, comparação de score invalidada
- **Origem:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-S08 — Usar `bwrap` no Linux quando disponivel (confina a escrita, mas isola o `$HOME`)?

**Escolha congelada:** `safe_langs_first` — Usar so nas linguagens que nao dependem de cache no `$HOME` (Python, C, C++, Node sem dependencias), migrando conforme os binds forem validados

**Por quê.** `bwrap` e a sala com paredes: o codigo do exercicio nao alcanca o resto da maquina. O problema e que algumas linguagens guardam o cache delas no `$HOME`, e a sala tambem isola isso - o compilador some junto. Comecar pelas linguagens que nao dependem do cache e ir montando os binds uma a uma e o caminho que nao quebra nada em silencio.

**Alternativas descartadas.** `always` (Usar sempre, montando os caches read-only) — cai por: Cada linguagem precisa do bind certo, e errar quebra o desafio sem diagnostico claro; `never` (Nao usar) — cai por: Descarta a unica camada de isolamento disponivel sem instalar nada

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-S10 — `chmod 700` no diretorio do setup e no diretorio global?

**Escolha congelada:** `chmod700` — Sim, na criacao

**Por quê.** E trancar a porta do quarto numa casa compartilhada. Custa zero, nao muda nada para quem usa sozinho, e impede que outra conta do mesmo computador leia o seu perfil de estudo por acidente.

**Alternativas descartadas.** `umask` (Nao - herdar o umask do sistema) — cai por: Em maquina multiusuario, o padrao costuma ser legivel por todos

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-S11 — Como limitar a memoria do processo de teste no Linux?

**Escolha congelada:** `systemd_scope` — `systemd-run --user --scope -p MemoryMax=` quando disponivel, com `ulimit -v` so para C/C++/Python/Go

**Por quê.** E o disjuntor: um `while` que aloca sem parar nao pode derrubar a maquina inteira do aluno. `systemd-run --user` e o disjuntor certo; `ulimit -v` funciona para algumas linguagens e quebra outras - Node e JVM reservam espaco virtual enorme na largada e morrem antes de comecar. Verificado quebrando.

**Alternativas descartadas.** `ulimit_all` (`ulimit -v` para todos) — cai por: Node e JVM morrem na largada - verificado; `none` (Sem limite fora do Docker) — cai por: Um exercicio com vazamento de memoria trava a maquina do aluno

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui
- **Status:** em aberto — o default vale até alguém decidir o contrário

#### D-S14 — A sonda que testa se `bwrap` funciona usa quais binds?

**Escolha congelada:** `four_symlinks` — Os quatro `--symlink`, com `--ro-bind` do que existir em distro sem `/usr` unificado

**Por quê.** E o teste da tomada antes de ligar o aparelho. Com um `--symlink` so, a sonda falha com `execvp /bin/true: No such file` e o isolamento e desligado em silencio - a pior falha possivel, porque parece que esta tudo bem. Sao quatro: `/bin`, `/sbin`, `/lib` e `/lib64` - e o `/lib64` e quem carrega o interpretador ELF em x86-64.

**Alternativas descartadas.** `one_symlink` (So `--symlink usr/bin /bin`) — cai por: Quebrada: `execvp /bin/true: No such file`, e o isolamento some sem avisar; `ro_bind` (`--ro-bind` explicito por caminho) — cai por: Lista de caminhos diferente em cada distro

- **Custo de reverter:** `cheap` (barato) — muda numa linha de um arquivo; nenhum dado precisa migrar
- **Origem:** docs/11-seguranca-privacidade.md#decisoes-abertas-geradas-aqui
- **Status:** decidida por arbitragem **AR-27** — não volta a ser pergunta

---

## 6. Índice completo dos 114 ids

Uma linha por decisão, na ordem do catálogo. Serve para achar pelo id e para conferir que
este documento cobre o catálogo inteiro — as duas direções.

| Id | Camada | Quem responde | Quando | Custo de mudar | Grava em |
|---|---|---|---|---|---|
| `D-A01` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A02` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A03` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A04` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A05` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A06` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A07` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A08` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A09` | 4 | quem constrói a skill | `never` | `expensive` | — (vira código, não dado) |
| `D-A10` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A11` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A12` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A13` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A14` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-A14` |
| `D-A15` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-A15` |
| `D-A16` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A17` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-A17` |
| `D-A18` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A19` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-A20` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A21` | 3 | aluno | `on-demand` | `expensive` | `decisions.D-S01` |
| `D-A22` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-A23` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-M01` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-M02` | 2 | aluno | `session-15` | `cheap` | `decisions.D-M02` |
| `D-M04` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-M07` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-M09` | 3 | os dois | `on-demand` | `expensive` | `decisions.D-M09` |
| `D-M10` | 2 | aluno | `session-15` | `cheap` | `decisions.D-M10` |
| `D-P01` | 3 | os dois | `on-demand` | `cheap` | `decisions.D-P01` |
| `D-P02` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-P02` |
| `D-P03` | 3 | os dois | `on-demand` | `cheap` | `decisions.D-P03` |
| `D-P04` | 2 | aluno | `session-15` | `cheap` | `decisions.D-P04` |
| `D-P05` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-P06` | 3 | os dois | `on-demand` | `cheap` | `decisions.D-P06` |
| `D-P07` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-P08` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-P09` | 4 | quem constrói a skill | `never` | `expensive` | — (vira código, não dado) |
| `D-P10` | 4 | quem constrói a skill | `never` | `expensive` | — (vira código, não dado) |
| `D-P11` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-P12` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-P12` |
| `D-E01` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-E01` |
| `D-E02` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-E03` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-E03` |
| `D-E04` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-E04` |
| `D-E05` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-E06` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-E07` | 3 | os dois | `on-demand` | `cheap` | `decisions.D-E07` |
| `D-E08` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-E09` | 2 | aluno | `session-15` | `moderate` | `decisions.D-E09` |
| `D-E10` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-E11` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-E12` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-E12` |
| `D-C01` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-C01` |
| `D-C03` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-C04` | 3 | os dois | `on-demand` | `moderate` | `decisions.D-C04` |
| `D-C05` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-C05` |
| `D-C06` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-C06` |
| `D-C08` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-C09` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-C10` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-C11` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-C11` |
| `D-C12` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-C12` |
| `D-C13` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-C13` |
| `D-C14` | 4 | quem constrói a skill | `never` | `expensive` | — (vira código, não dado) |
| `D-C15` | 4 | quem constrói a skill | `never` | `expensive` | — (vira código, não dado) |
| `D-C16` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-C17` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-C18` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-C18` |
| `D-V01` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-V01` |
| `D-V02` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-V02` |
| `D-V03` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-V03` |
| `D-V04` | 2 | aluno | `first-challenge` | `moderate` | `decisions.D-V04` |
| `D-V05` | 2 | aluno | `first-challenge` | `cheap` | `decisions.D-V05` |
| `D-V06` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V07` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V08` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V09` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-V09` |
| `D-V10` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V11` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-V13` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V14` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V15` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V16` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V17` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-V18` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-V18` |
| `D-B13` | 1 | aluno | `setup-init` | `cheap` | `title` |
| `D-B04` | 1 | aluno | `setup-init` | `moderate` | `decisions.D-B04` |
| `D-B14` | 1 | aluno | `setup-init` | `cheap` | `theory_source` |
| `D-B17` | 1 | aluno | `setup-init` | `moderate` | `language.name` |
| `D-B15` | 1 | aluno | `setup-init` | `cheap` | `session_minutes` |
| `D-B16` | 1 | aluno | `setup-init` | `cheap` | `skill_level` |
| `D-B01` | 3 | aluno | `on-demand` | `cheap` | `docs_ingest.token_budget` |
| `D-B02` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-B02` |
| `D-B03` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-B05` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-B05` |
| `D-B07` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-B07` |
| `D-B08` | 4 | quem constrói a skill | `never` | `moderate` | — (vira código, não dado) |
| `D-B09` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-B09` |
| `D-B11` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-B12` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-B18` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-B18` |
| `D-S02` | 3 | aluno | `on-demand` | `moderate` | `decisions.D-S02` |
| `D-S03` | 3 | os dois | `on-demand` | `cheap` | `decisions.D-S03` |
| `D-S04` | 3 | aluno | `on-demand` | `cheap` | `privacy.cross_read` |
| `D-S05` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-S05` |
| `D-S06` | 3 | aluno | `on-demand` | `moderate` | `decisions.D-S06` |
| `D-S07` | 4 | quem constrói a skill | `never` | `expensive` | — (vira código, não dado) |
| `D-S08` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-S10` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-S11` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-S12` | 3 | aluno | `on-demand` | `expensive` | `decisions.D-S12` |
| `D-S14` | 4 | quem constrói a skill | `never` | `cheap` | — (vira código, não dado) |
| `D-S15` | 3 | aluno | `on-demand` | `cheap` | `decisions.D-S15` |

---

## 7. Ids absorvidos (busca pelo nome antigo)

A construção do catálogo deduplicou entradas que apareciam em mais de um documento e
renumerou colisões. Um id antigo continua sendo endereço válido: `decisions-ask.sh` resolve
para a entrada viva e avisa. A tabela existe para que uma busca pelo nome antigo chegue ao
lugar certo.

| Id antigo | Entrada viva hoje |
|---|---|
| `D-B06` | `D-A05` |
| `D-B10` | `D-A01` |
| `D-C02` | `D-S03` |
| `D-C07` | `D-V05` |
| `D-M03` | `D-A21` |
| `D-M05` | `D-S12` |
| `D-M06` | `D-A05` |
| `D-M08` | `D-A03` |
| `D-S01` | `D-A21` |
| `D-S09` | `D-S02` |
| `D-S13` | `D-B08` |
| `D-V11@references/languages.md` | `D-V14` |
| `D-V12@docs/06-visualizacao.md` | `D-V08` |
| `D-V12@references/languages.md` | `D-V15` |
| `D-V13@references/languages.md` | `D-V16` |
| `D-V14@references/languages.md` | `D-V17` |

Um caso vale nota, porque o script depende dele: **`D-A21` grava em `decisions.D-S01`**, o id
que ela absorveu. `writes_to` vence o `id` na hora de escolher a chave do manifesto — o
catálogo é a fonte de verdade também sobre *onde* a resposta mora.

---

## 8. Procedência

Catálogo: `skills/study-method/assets/decisions.json`, `schema_version` 1.0.
Este documento é **derivado** dele, entrada por entrada, e conferido nas duas direções: todo
id citado aqui existe no catálogo, e todo id do catálogo aparece aqui — é o que o gate
verifica em `G-12c`. Editar este arquivo à mão sem editar o catálogo cria uma divergência.

O mapa de derivação, para quem for refazê-lo: `question_ptbr` vira o título da entrada e a
citação logo abaixo · `why_it_matters` vira o parágrafo **Por que importa** · `options[]` vira
a tabela, com `pros` na coluna do que se ganha e `cons` na do que se paga · `default` marca a
linha com ⭐ · `source`, `reversibility` e `writes_to` viram as três linhas seguintes. As
camadas 1 a 3 usam essa forma longa; a camada 4 usa a forma curta (escolha, porquê,
alternativas descartadas com o motivo, custo de reverter, origem, status).

Uma única transformação é aplicada ao texto do catálogo na renderização, e é declarada aqui:
onde a prosa da entrada traz o termo `docs/` **nu**, este documento o qualifica como
`docs/` do setup, porque §10 do contrato proíbe a forma nua num documento normativo. Nenhuma
outra palavra do catálogo é alterada: pergunta, explicação, opções, prós, contras, default e
procedência aparecem literais.
