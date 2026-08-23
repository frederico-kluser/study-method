# Parte 0 — O projeto, o pedido original e como verificar que está certo

## Sumário da Parte 0

- **§0.1** o que o `study-method` é em uma frase, e as seis coisas que ele **não** é.
- **§0.2** o pedido original do usuário, preservado literalmente, convertido em critérios de aceitação verificáveis.
- **§0.3** ⭐ as **três contradições** entre o pedido e a realidade medida, e o que foi entregue no lugar da forma literal.
- **§0.4** a ordem de construção: o que bloqueia o quê, e por quê.
- **§0.5** os quatro gates e o que cada um cobre.
- **§0.6/§0.7** o que este documento não cobre (e onde está), a precedência entre fontes e a terminologia obrigatória.

---

## 0.1 O que é — e o que não é

**O `study-method` é uma Agent Skill que ensina programação e a matemática que aparece nela através de código executável, com memória persistente em disco entre sessões, e desafios cujo teste é validado por execução antes de chegar ao aluno.**

O que ele **não** é, item a item — cada linha existe porque a confusão correspondente muda o desenho:

| Não é | Por quê importa |
|---|---|
| Um chatbot que "lembra" pela janela de contexto | O estado vive em **disco**, no setup do aluno. Depois de uma auto-compactação do contexto, o tutor reconstrói onde está lendo `memory/NNNN.json`, não relendo a conversa. |
| Um gerador de exercícios | Nada chega ao aluno sem `challenge_status: "validated"`, e a validação é **execução determinística**, nunca uma segunda opinião de LLM. |
| Um assistente de programação | A `description` do frontmatter **exclui** explicitamente trabalho de produção: escrever, depurar ou revisar código real, dúvida pontual de sintaxe, explicação avulsa sem intenção de estudo continuado. |
| Um serviço | Zero rede em runtime nos scripts (invariante I-26). Nenhum script chama modelo, nenhum script baixa nada, nenhum script instala nada. |
| Um sistema com banco de dados | Arquivos JSON planos, `jq` como única ferramenta estruturada garantida, `python3` só stdlib. Um setup é 100% reconstruível a partir do próprio `setup.json` + os quatro diretórios. |
| Um repositório de conteúdo | A teoria é **do aluno** (`docs/` do setup). A skill é read-only ali, com uma exceção nomeada (`docs/generated/`), marcada em três camadas. |

**Como o produto se apresenta.** É um repositório do GitHub instalável por cópia ou symlink em `~/.claude/skills/study-method/` (pessoal) ou `<projeto>/.claude/skills/study-method/`. O nome do diretório **deve** ser idêntico ao campo `name` do frontmatter do `SKILL.md` — no padrão aberto o `name` casa com o diretório-pai, e no Claude Code é o nome do diretório que vira o comando `/study-method`.

**Três entidades com nomes parecidos, que este documento nunca confunde:**

| Entidade | O que é | Onde vive | Quem escreve |
|---|---|---|---|
| **Repositório** | O projeto de engenharia: pesquisa, documentos normativos, código da skill, testes, exemplos. | o clone do usuário | desenvolvedores |
| **Skill instalada** | O artefato que o harness carrega: `SKILL.md` + `references/` + `scripts/` + `assets/`. É código + instrução, **nunca** dado de aluno. | `~/.claude/skills/study-method/`; no repositório, `skills/study-method/` — doravante **`SK/`** | desenvolvedores; instalada por cópia/symlink |
| **Setup** | O diretório de estudo de **um assunto** (ex.: Cálculo I). É o dado do aluno. | qualquer lugar do disco escolhido pelo aluno | a skill (em runtime) e o aluno |

Um aluno tem **N setups** e **uma** skill instalada. A ponte entre eles é o registry global (§1.8).

---

## 0.2 O pedido original, preservado, como critérios de aceitação

O pedido é a autoridade sobre **o que** construir. Está preservado aqui literalmente, em blocos de citação, e traduzido em critérios que ou passam ou falham — nunca em "atendido parcialmente".

### 0.2.1 O pedido de meta-nível (por que este documento existe)

> "quero que pesquise profundamente e crie toda a base para ela **e um documento completo explicando como ela deve ser feita em muitos detalhes**, pensando que esse documento vai instruir uma LLM para construí-la, e que ela será um repo do GitHub para incentivar isso"

| # | Critério de aceitação | Como se verifica |
|---|---|---|
| M1 | Uma LLM **sem este repositório** reconstrói a skill só com este documento. | Todo contrato que atravessa fronteira está **transcrito**, não resumido: schemas completos, máquina de estados, vocabulários, exit codes, envelopes de protocolo, interfaces de `lib/`. |
| M2 | O documento nunca resume um contrato. | Onde não coube, há o **caminho exato** do arquivo, nunca uma paráfrase. Paráfrase de contrato passa a mentir sobre ele. |
| M3 | O documento distingue **contrato** de **racional**. | Contrato aqui; o porquê no `docs/` do repositório, citado por caminho (§0.6). |
| M4 | O documento é auditável contra o repositório. | Toda afirmação que envelhece está marcada com o que foi verificado (§0.7.3). ⚠ O verificador mecânico documento×disco (`tests/spec-conformance.sh`, previsto em `docs/build-spec/README.md`) **ainda não existe**; até ele existir, a auditoria é a leitura contra os caminhos citados. |

### 0.2.2 Os requisitos de produto, um a um

| # | Requisito literal (palavras do usuário) | Critério de aceitação verificável | Onde é atendido |
|---|---|---|---|
| R1 | "verificar se tem uma pasta `docs/`" *(palavras do aluno; aqui é o `docs/` do setup)* | `bootstrap` classifica o diretório corrente antes de qualquer pergunta; o `docs/` do setup ausente **não é erro** e vira `docs_coverage: "none"`. | §1.3, passo 4 · `docs/10-bootstrap.md` §3, §4 |
| R2 | "sempre ler o contexto de tudo que está lá" | Metadados de **todos** os arquivos entram sempre; conteúdo entra sob orçamento; o que ficou de fora é **declarado por nome** ao aluno (BOOT-3). | §0.3.2 · `docs/10-bootstrap.md` §8 |
| R3 | "se os arquivos base não forem encontrados, perguntar se quer criar um novo setup" | `setup_interview` é o **único ponto de parada obrigatória** do bootstrap, e é **condicional**: numa retomada normal não roda. | §1.3 · `docs/10-bootstrap.md` §5 |
| R4 | "uma pasta `memory/` para salvar as sessões (o que foi feito, o que foi aprendido ou praticado e **como isso aconteceu**)" | `session.schema.json` tem `what_was_done`, `what_was_learned` **e** `how_it_happened[]` — o terceiro é a memória procedimental, com `outcome` de 4 valores incluindo `backfired`. | §2.3 |
| R5 | "sempre `0001.json`, `0002.json`…" | `session_id` é **string** `^[0-9]{4}$`, alocado por `sm_next_seq` com `noclobber`, monotônico e **não contíguo**; número purgado nunca é reaproveitado. | §1.7.1 (`sm_next_seq`) · §2.9.1 |
| R6 | "sempre que a skill rodar é um arquivo novo" | `open_session` aloca `NNNN` e grava `status: "in_progress"` antes da primeira fala pedagógica. | §1.3, passo 5 |
| R7 | "mas **sempre lemos os arquivos anteriores**" | **Contradição (a)** — ver §0.3.1. Entregue como índice + perfil + digest sempre, brutos abertos seletivamente. | §0.3.1 · §2.5 |
| R8 | "a skill deve propor desafios, que o usuário completa e testa… ficará em `challenges/`… terá um TDD do desafio" | `challenges/<NNNN>-<slug>/` com `meta.json`, enunciado, `stub`, `tests/`, `runner.sh` e `.solution/` oculta. | **Parte 3** (§3.3) |
| R9 | "cujo teste é a validação que devolve **todos os possíveis cenários de erro**" | **Contradição (c)** — ver §0.3.3. Entregue como cenários nomeados + mensagem didática + mutation score medido. | §0.3.3 |
| R10 | "assim o usuário só roda o teste pra saber se passou" | Atendido integralmente: um `runner.sh` por desafio, exit `0/1/2/3`, e mensagem de falha com entrada, esperado, obtido e a propriedade violada em linguagem do domínio. | **Parte 3**, §3.9 |
| R11 | "todo teste criado é validado primeiro pelo agente de código pra saber se não tem bugs" | Reformulado: **você autora, o harness julga** (DES-1). A validação é execução (`challenge-verify.sh`), não leitura por um segundo modelo. | §0.3.3 · `docs/05-challenges-tdd.md` §1.2 |
| R12 | "tudo que for ensinado, tanto programação quanto matemática, pode ser feito com código de programação… iremos utilizar renderizador de gráficos; o usuário poderá escolher a linguagem que ele queira para a aula" | Três exigências independentes: matemática via código rodável; renderizador como peça de arquitetura com contrato próprio; e o renderizador é **independente da linguagem da aula** (`render-plot.py`, Python stdlib), senão "escolher a linguagem" viraria "escolher entre as que têm biblioteca de plot". | **Parte 5** · `docs/06-visualizacao.md` §1 do repositório |
| R13 | "sempre devemos prezar pelo bate papo" | Requisito de primeira classe **e** vetor de risco: bate-papo puxa bajulação. Daí as 12 regras `AS-*` de anti-bajulação, verificáveis por eval. | **Parte 6**, §6.3 · `docs/02-pedagogia.md` §5 do repositório |
| R14 | `researchs/0001.md`, `0002.md` (sem slug no nome) | `research_id` é `^[0-9]{4}$`; o slug existe apenas no diretório de assets (`researchs/assets/<NNNN>-<slug>/`). | §1.4.2 · `docs/13-researchs.md` §D-R01 |

**Nada nesta tabela foi silenciosamente reinterpretado.** Onde a forma literal não sobrevive ao contato com a realidade — R7, R2 e R9 —, a reformulação está na seção seguinte, com a medição que a obrigou.

### 0.2.3 O requisito de forma: "será um repo do GitHub para incentivar isso"

Ser um repositório público que pessoas clonam e instalam **é um requisito**, e ele tem consequências verificáveis. Instalar uma Agent Skill é copiar arquivos para o diretório de skills do agente e dar a ele permissão de **rodar scripts do repositório na máquina do usuário, com as permissões dele**. Isso merece um aviso honesto no `README.md` do repositório, nunca um selo de "seguro".

| # | Critério de aceitação | Verificação |
|---|---|---|
| G1 | **Instalação sem `curl \| bash`.** `git clone` + copiar/symlink o diretório da skill para `~/.claude/skills/study-method`. O usuário vê o conteúdo **antes** de qualquer coisa executar. | leitura do `README.md` do repositório |
| G2 | **Sem download em tempo de instalação.** Nenhuma dependência é baixada. Se não roda com o que já está na máquina, o script diz **o que falta** e para — não instala nada por conta própria (`sm_require_cmd` **nunca instala**). | I-26 + revisão de `sm_require_cmd` |
| G3 | **Scripts curtos, em texto legível**: sem minificação, sem base64, sem binário, sem gerador de código. Um script que precisa de explicação para ser lido é um script que ninguém vai auditar. | `gate-lint.sh` |
| G4 | **Zero rede nos scripts**, auditável pelo mesmo `grep` publicado no `README.md` — oferecido justamente para poder ser rodado **contra nós**. | `grep -rnE 'curl\|wget\|nc \|/dev/tcp\|https?://\|ftp://\|ssh \|scp \|rsync ' skills/study-method/scripts/` (I-26) |
| G5 | **Zero telemetria**, sem exceção e sem "modo anônimo". | I-26 + revisão |
| G6 | **Caminhos de escrita declarados e restritos a dois** — o setup atual e o `STUDY_METHOD_HOME`. | I-24, I-25 |
| G7 | **Aviso sobre precedência de instalação**: uma skill pessoal (`~/.claude/skills/`) **sobrepõe** uma de projeto de mesmo nome. Quem clonar o repo dentro de um projeto pode achar que roda a versão que acabou de auditar e estar rodando outra. O `README.md` diz como conferir de onde a skill está carregando. | leitura do `README.md` |
| G8 | **O parágrafo que é o mais fácil de omitir por conveniência**, e sem o qual "o study-method é local" é meia verdade: *o modelo não é local — tudo que o usuário digitar vai para o provedor do LLM. A memória em `memory/` fica na máquina dele; a conversa que a gera, não.* | leitura do `README.md` |

⚠ Um controle que o projeto **não finge ter**: assinatura. Não há verificação criptográfica de que o clonado é o publicado, além do que o Git e a plataforma oferecem. Publicar checksum de release é possível e barato, mas **não substitui ler o código**.

**A ordem em que o usuário deveria inspecionar:** (1) `SKILL.md` — frontmatter e corpo, é o que o modelo vai seguir; (2) `SK/scripts/**`, todo `.sh` — procurar rede, `eval`, `sudo`, escrita fora dos dois caminhos declarados, `rm -rf` com variável não citada; (3) o comando de instalação — se o README pedir `curl … | bash`, isso por si só é motivo para desconfiar; (4) `SK/references/*.md`, as regras que o modelo carrega em runtime.

---

## 0.3 ⭐ As três contradições do pedido com a realidade

Esta é a seção que separa este documento de um manual genérico. Cada contradição tem a mesma forma: **o que foi pedido** · **por que a forma literal não funciona** (com a medição, não com opinião) · **o que foi entregue no lugar** · **o que se perde**.

A regra que as três compartilham: *reformular é obrigação, não licença para entregar menos.* Em nenhuma delas a entrega é "fazer menos"; nas três, a entrega é **fazer o que o pedido queria por um caminho que sobrevive à física do sistema**, e **dizer em voz alta** onde o caminho difere.

### 0.3.1 (a) "sempre lemos os arquivos anteriores" × degradação de atenção

> **Pedido literal:** "sempre que a skill rodar é um arquivo novo, mas sempre lemos os arquivos anteriores."

**Por que a forma literal não funciona.** Modelos degradam de forma **não uniforme** conforme o input cresce. Dois achados, ambos verificados na pesquisa auditada (`docs/research/02-memoria-llm.md` §2):

- **Lost in the Middle** (Liu et al., TACL 2024): o desempenho segue uma curva em **U** — recupera-se bem o início e o fim do contexto, e degrada-se no meio.
- **Context Rot** (Chroma, 2025): os **18 modelos de fronteira testados pioram** conforme o input cresce; distratores compostos (muito material relacionado porém irrelevante) degradam mais que um distrator só.

E **JSON não protege contra isso**: recuperação chave-valor em JSON longo foi justamente um dos experimentos usados para demonstrar o efeito.

O dano concreto **não é estourar a janela**. É pior: **cabe e falha em silêncio.** Na sessão 60, o fato relevante ("a analogia do zoom foi o que destravou derivadas em agosto") está em `0042.json`, literalmente no meio do contexto — a zona de pior recuperação. O tutor não lança erro: ele apenas repete uma abordagem que já falhou, e parece ter memória fraca.

**O que foi entregue.** Três camadas, e a leitura é sempre completa **em cobertura**, seletiva **em profundidade**:

| Sempre lido, em toda sessão | O que garante |
|---|---|
| `memory/INDEX.json` — **uma linha por sessão**, todas as sessões | Nenhuma sessão fica invisível. É o "sempre lemos os anteriores" na prática. |
| `memory/profile.json` — o consolidado bitemporal de tudo | O que se sabe do aluno não depende de reler episódio. |
| O **digest montado por código** (`memory-digest.sh`) | Um único bloco determinístico, de forma fixa, no fim do contexto de abertura. |

| Lido seletivamente | O que custa |
|---|---|
| Os `memory/NNNN.json` brutos, abertos por tag, data, habilidade ou flag quando o assunto de hoje pede | Depende de o tutor **decidir abrir**. Se o `one_line_summary` da sessão 37 perdeu uma nuance e a tag não bate, essa nuance não chega sozinha. |

**A mitigação do custo é explícita**, não retórica: o bloco `full_detail_available` do digest entrega, em toda sessão, o inventário do que existe (`session_count`, `date_range`, `sessions_not_in_recent`, `top_tags`) e a instrução mecânica de como abrir (`how_to_open`). O tutor **sempre sabe que há mais**, e por qual chave chegar lá.

**Por que o digest é montado por código e não pelo modelo:** se a própria compactação do contexto exigisse ler 60 arquivos, ela sofreria do mesmo problema que existe para resolver.

> **PERGUNTE AO USUÁRIO (D-M01)** — "Sempre lemos os arquivos anteriores" vira **índice + perfil + digest sempre**, com os `memory/NNNN.json` brutos abertos seletivamente — e não "carregar todos os arquivos no contexto". Confirma?
> É a diferença entre reler o diário inteiro toda manhã e ler o índice, o resumo e só a página que interessa hoje. Na sessão 40 a primeira opção já não cabe na mesa; a segunda continua cabendo em qualquer número de sessões.
> **Opções:** **(a)** índice + perfil + digest sempre, brutos sob demanda — custo de leitura constante, nada é jogado fora, e mudar depois não muda formato de arquivo nenhum · **(b)** carregar todos os brutos sempre — nada escapa, e estoura o contexto em poucas dezenas de sessões · **(c)** carregar todos até N sessões e depois trocar — simples no começo, e cria um degrau em que o aluno sente a skill "piorar"
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 0.3.2 (b) "ler todo o `docs/` do setup" × material que não cabe

> **Pedido literal:** "verificar se tem uma pasta `docs/`" e "sempre ler o contexto de tudo que está lá". *(palavras do aluno; aqui é o `docs/` do setup)*

**Por que a forma literal não funciona.** É trivialmente certo com três arquivos de anotação e vira sabotagem quando o aluno joga um PDF de cálculo de 400 páginas na pasta. É a mesma física de (a), agravada: um livro inteiro é a **definição** de distrator composto. Um tutor que "leu" as 400 páginas e não lembra do capítulo 7 não lança erro nenhum — ele só parece burro.

Agrava-se ainda por um detalhe de ambiente: **não há tokenizador garantido na máquina** (`tiktoken` ausente, verificado; `pip install` falha sem venv por PEP 668). A medida operacional é **bytes**, com a aproximação de trabalho de **1 token ≈ 4 bytes**, erro esperado na faixa de ±30%. O documento diz isso em vez de fingir precisão.

**O que foi entregue** — três peças, e a terceira é a que honra o pedido:

1. **Orçamento explícito, não janela maior.**
   ```
   DOCS_BUDGET_TOKENS = 20000        # default
   DOCS_BUDGET_BYTES  = 80000        # ~80 KB, derivado
   ```
   80 KB é **ponto de virada de modo**, não "exatamente 20k tokens". Errar para o lado conservador custa uma frase de declaração; errar para o outro lado custa a qualidade da aula.

2. **Modo indexado.** Abaixo do teto, lê tudo (raiz do `docs/` do setup antes de `generated/` — material do aluno primeiro, porque o início é a posição forte da curva em U). Acima, entra em modo manifesto: **o sumário de todos os cabeçalhos entra sempre**, e as seções entram por score decrescente até **60%** do orçamento. Guardas duras independentes do orçamento: >5 MB de texto extraído num único arquivo, >200 arquivos, symlink apontando para fora do setup.

> **PERGUNTE AO USUÁRIO (D-B12)** — Que fatia do orçamento de leitura o material do aluno pode ocupar, deixando o resto para a aula?
> É dividir a mesa entre o livro e o caderno. Sessenta por cento para o material e quarenta para a aula deixa espaço para o diálogo, o código e o raciocínio — que é onde o aprendizado acontece.
> **Opções:** **(a)** 60% material / 40% aula — espaço garantido para diálogo e código; material que não couber vira indexado, não vira silêncio · **(b)** 40/60 — máximo de espaço para a aula, e quase todo material vira indexado · **(c)** 80/20 — quase todo material cabe inteiro, e sobra pouco para a conversa, que é a aula
> **Default:** **(a)** · **Custo de mudar depois: cheap**

> **PERGUNTE AO USUÁRIO (D-B11)** — Até que profundidade a skill varre o `docs/` do setup?
> Quem organiza material cria subpasta — `provas/2024/`, `slides/cap3/`. Parar na raiz é ignorar metade do que a pessoa organizou com cuidado.
> **Opções:** **(a)** recursivo, com teto de 200 arquivos — respeita quem organizou em subpastas e protege contra apontar o setup para uma árvore gigante por engano; material com 300 arquivos fica truncado, e o corte precisa ser anunciado · **(b)** só a raiz — rápido e previsível, e ignora a organização que o aluno fez · **(c)** 2 níveis — meio-termo que quebra na terceira subpasta
> **Default:** **(a)** · **Custo de mudar depois: cheap**

3. **A obrigação de declarar por nome o que ficou de fora.** Esta é a parte não negociável, e é a regra permanente **BOOT-3**: *nunca leia material pela metade sem declarar por nome o que ficou de fora; nunca diga "li seu material" quando leu uma fração dele.* O campo `left_out[]` é **obrigatório** no `docs-index.schema.json` justamente porque é dele que sai a frase honesta:

   > "Carreguei o capítulo 3 (limites) e a seção 4.1 do seu material. Ficaram de fora: capítulos 1-2 e 5 a 12 — e se a gente esbarrar em algum, eu abro na hora."

   Cada item de `left_out[]` carrega um `reopen_hint` **já resolvido** (`offset N bytes, B bytes`, ou `páginas N-M`): declarar o que ficou de fora só vale se reabrir for barato.

**O que se perde:** o aluno precisa aceitar que o tutor leu uma fração — e a única defesa contra isso virar mentira é o `left_out[]` ser um campo de schema, verificado pelo gate (I-42: nenhum documento promete o que não mede), e não uma boa intenção do modelo.

### 0.3.3 (c) "o teste devolve todos os possíveis cenários de erro" × *oracle problem*

> **Pedido literal:** "para cada desafio… terá um TDD do desafio, cujo teste é a validação que devolve **todos os possíveis cenários de erro** — assim o usuário só roda o teste pra saber se passou. Todo teste criado é validado primeiro pelo agente de código pra saber se não tem bugs."

**Por que a forma literal não funciona.** É **literalmente impossível**. É o *test oracle problem* (Barr et al., IEEE TSE 2015): decidir o resultado esperado de todo caso de teste possível, e decidir se a saída observada bate com ele, é **indecidível no caso geral**. Para uma função `f(n: int) -> int` o espaço de entrada já é infinito. **Qualquer sistema que prometa "todos os cenários de erro" está mentindo ou redefinindo "todos".**

A segunda metade do pedido tem um problema diferente: "um agente de código valida o teste" lido como "um segundo LLM lê o teste e diz se está bom" é **sinal fraco** — LLM não autocorrige raciocínio sem sinal externo (`docs/research/04-tdd-actor-critic.md` §3).

**O que foi entregue** — três coisas concretas, cada uma verificável:

1. **Enumeração fechada e nomeada.** `meta.json` → `scenarios[]`, cada item com `scenario_id`, `test_name`, `kind` e `description` em pt-BR. Não é "todos os cenários": é *estes cenários, nomeados, e nenhum outro é cobrado* — e o aluno pode ler a lista.
2. **Mensagem de falha didática por cenário.** Entrada, esperado, obtido e a propriedade violada em linguagem do domínio. A parte do pedido que diz "só roda o teste pra saber se passou" é atendida **integralmente**, e mais: quando não passou, ele sabe *o que* e *por quê*.
3. **Cobertura medida, não prometida.** O **mutation score**, que sai de execução sobre um catálogo de mutação **fixo e mecânico**, com limiar de aprovação **0,90**.

As três estão transcritas com o detalhe do contrato em **§3.1.2** (o que é entregue) e **§3.5** (o catálogo).

Uma classe inteira fica coberta melhor que por enumeração: as **propriedades invariantes** (`kind: property`). `fatorial(n) == fatorial(n-1) * n` para todo `n` de 1 a 7 é um caso de teste que cobre uma *família* de entradas. É o mais perto que se chega de "todos os cenários" sem mentir.

E "validado pelo agente de código" foi reformulado em **DES-1: você autora, o harness julga** — nunca decida por leitura se o teste está bom, nunca preencha campo de `validation` de cabeça.

**Duas regras permanentes saem daqui, e o gate as verifica:**

| Regra | Texto |
|---|---|
| **DES-3** | Nunca prometa "todos os cenários de erro": diga *"cobre estes N cenários nomeados; o mutation score medido foi X%"*. |
| **I-42** | Nenhum documento cita "todos os cenários de erro" como promessa ao aluno. Verificado por `grep`. |

### 0.3.4 O padrão comum às três

| | (a) memória | (b) material teórico | (c) cobertura de teste |
|---|---|---|---|
| Pedido literal | ler tudo, sempre | ler tudo, sempre | cobrir tudo |
| O que quebra | atenção degrada em silêncio | atenção degrada em silêncio | indecidibilidade |
| Entrega | cobertura total + profundidade seletiva | cobertura total de metadados + conteúdo sob orçamento | enumeração nomeada + medição |
| Honestidade obrigatória | `full_detail_available` no digest | `left_out[]` declarado por nome | `scenarios[]` + `mutation_score` |
| Regra permanente | MEM-1 · MEM-3 | BOOT-3 | DES-3 |

**A honestidade é sempre um campo de schema, nunca uma boa intenção.** É a única forma de o gate verificá-la.

---

## 0.4 A ordem de construção

A ordem abaixo não é uma sugestão de conforto: cada etapa **bloqueia** as seguintes porque produz um nome, um caminho ou uma interface que as seguintes consomem literalmente. Construir fora de ordem produz retrabalho de renomeação, que é o custo mais alto neste projeto (renomear um campo já escrito em disco é MAJOR + migração).

| # | Etapa | Bloqueia | Por quê |
|---|---|---|---|
| **1** | **Congelar os contratos**: os 9 nomes de passo, a árvore canônica, os vocabulários e patterns, a tabela de exit codes, o envelope REQUEST/APPLY, a terminologia obrigatória. | tudo | Nome de passo, exit code e nome de campo são **a interface** entre `SKILL.md`, `references/` e scripts. Trocar depois exige tocar em todos os três ao mesmo tempo. |
| **2** | **Schemas** (`SK/assets/schemas/*.json` + `requests/*.json`) | todo script que valida, o gate | O schema é a autoridade sobre a forma do dado. Restrição de forma obrigatória: **sem `$ref`, `allOf` aninhado, `if/then/else` ou `$defs`** — o verificador é mínimo, em Python stdlib. |
| **3** | **`lib/common.sh` + `lib/json.sh` + `_jsonschema_min.py`** | os 16 scripts restantes | Nenhum script implementa a sua própria normalização, escrita atômica, alocação de sequência, lock ou validação. `sm_request` é a **única** função do projeto que produz exit 10. |
| **4** | **Templates** (`SK/assets/templates/**` + `MANIFEST.tsv`) e **`decisions.json`** | `setup-init`, `session-new`, `research-new`, `challenge-new`, `decisions-ask` | Os placeholders são congelados no `MANIFEST.tsv`; um script que materializa template e deixa placeholder por substituir sai **1**. |
| **5** | **`setup-init.sh` · `setup-list.sh`** | todo script que recebe `<setup_root>`; `bootstrap` | Sem resolução de setup e sem registry, nenhum outro script tem raiz sobre a qual operar. |
| **6** | **`session-new.sh` · `research-new.sh` · `docs-index.sh`** | `open_session`, `teach`, `load_docs` | `docs-index.sh` é o primeiro usuário do REQUEST/APPLY: é onde o protocolo prova que funciona antes de virar dependência de outros três. |
| **7** | **`memory-index.sh` · `memory-digest.sh` · `memory-compact.sh`** | `load_memory`, `close_session` | O digest depende do bloco de derivação do índice — os dois scripts compartilham **cópia literal** do bloco `DERIVACAO-INDICE`. |
| **8** | **`progress-update.sh` · `readme-sync.sh`** | `plan_lesson`, `close_session` | `readme-sync.sh` lê os derivados que `memory-index.sh` e `progress-update.sh` produzem. |
| **9** | **`session-close.sh`** | — | Vem **depois** de 7 e 8 porque é ele quem os encadeia: `memory-index` → `progress-update` → `readme-sync` → `memory-compact --if-due`. |
| **10** | **`lib/sandbox.sh` · `detect-toolchains.sh`** | `challenge-new`, `challenge-verify` | A pilha de sandbox é sondada camada a camada e a ordem **não** pode ser invertida; verificar desafio sem sandbox é executar código do aluno no host. |
| **11** | **`challenge-new.sh`** → **`challenge-verify.sh`** | o passo `challenge` | Nesta ordem: não há o que verificar antes de existir o que gerar. |
| **12** | **`render-plot.py`** | o passo `teach` | **Independente de tudo o mais** — pode ser construído em paralelo desde a etapa 1. É Python stdlib puro e não depende de `lib/`. |
| **13** | **`SKILL.md` + `references/*.md`** | o produto | Só depois de as 19 CLIs estarem congeladas: o `SKILL.md` é **roteador**, e um roteador que aponta para uma flag que mudou é pior que nenhum roteador. |
| **14** | **`tests/`** (os quatro gates) | — | Roda por último, mas a **lista de invariantes nasce na etapa 1**: o gate é a tradução mecânica dos contratos, não uma inspeção posterior. |

### 0.4.1 O que precisa estar congelado antes da etapa 2

Checklist de fechamento da etapa 1. Enquanto qualquer linha estiver aberta, **não se escreve schema nem script** — cada uma delas é um nome que aparece literalmente em dezenas de arquivos:

| Congelado | Onde está neste documento |
|---|---|
| Os **9 nomes de passo** e quais dois são condicionais | §1.3 |
| A **árvore canônica** do setup, e o fato de que `.study-method/` não existe | §1.2.2 |
| Os **vocabulários** (todos os enums) e os **patterns** dos identificadores | §1.4.1, §1.4.2 |
| A convenção de **`$id`** dos schemas e as restrições de forma do verificador mínimo | §1.4.3 |
| A **tabela de exit codes** (0–5 + 10), as duas exceções nomeadas e os códigos observados | §1.5 |
| O **envelope REQUEST/APPLY**, as regras `RA-1`…`RA-7` e `RESP-1`…`RESP-4` | §1.6 |
| A **interface de `lib/`**, função a função | §1.7 |
| As **variáveis de ambiente** (vocabulário fechado) | §1.10 |
| A **terminologia obrigatória** e a regra de precedência | §0.7 |
| As **90 regras permanentes** com seus IDs (`C-*`, `AS-*`, `AN-*`, `ESC-*`, `ERR-*`, `MEM-*`, `PRIV-*`, `SEG-*`, `DES-*`, `VIZ-*`, `BOOT-*`) | **Parte 8**, §8.6 (a lista) · **Parte 6** (o texto transcrito) |
| As **43 invariantes** `I-01`…`I-43` que o gate cobra | **Parte 8**, §8.9 |

Dois pontos de ordem que costumam ser invertidos, e não podem ser:

- **O `SKILL.md` vem depois dos scripts, não antes.** Ele nomeia flags e caminhos; escrevê-lo primeiro produz um roteador que descreve uma CLI que ninguém implementou.
- **O gate é escrito a partir dos contratos, não a partir do código.** Um gate derivado do código só verifica que o código concorda consigo mesmo.

---

## 0.5 Como verificar que está certo — os quatro gates

Quatro scripts em `tests/`, cada um respondendo uma pergunta diferente. `tests/lib/assert.sh` é **biblioteca**: apenas `source`, modo `0644`, sem shebang, sem bloco `main` — a mesma disciplina de LIB-1 aplicada ao gate. Os quatro executáveis são `0755`, abrem com `#!/usr/bin/env bash` e `set -euo pipefail`.

| Script | Pergunta que responde | Cobre | Depende de |
|---|---|---|---|
| `tests/gate-build.sh` | O que está no disco é **sintaticamente válido e tem a forma exigida**? | `bash -n` em todo script; `json.load` em todo schema e asset; modo de arquivo (0644 em `lib/`, 0755 nos executáveis); ausência de shebang executável em `lib/`. | `bash`, `python3`, `stat` |
| `tests/validate.sh` | O repositório **obedece aos contratos**? | As **43 invariantes** `I-01`…`I-43` — nomes de passo, termos revogados, `$id` dos schemas, enums congelados, patterns, exit codes usados, escrita atômica, zero rede, teto de linhas do `SKILL.md`, grafo de `references/`, ausência de frontmatter YAML em artefato gerado — mais os checks estruturais `G-*` (auditoria dos schemas, terminologia, decisões em 3 camadas). Medido na revisão `df040b5`: **77 checks**. | `bash`, `python3`, `jq` |
| `tests/gate-lint.sh` | O texto e os arquivos têm **qualidade de leitura**? | `L-01` forma do frontmatter YAML (lido por `awk`); `L-02` link relativo quebrado; `L-03` placeholder órfão ou fora de template; `L-04` arquivo sem newline final; `L-05` tabela markdown malformada; `L-06` espaço no fim da linha (aviso). | `bash`, `python3`, `awk` |
| `tests/smoke.sh` | O fluxo **ponta a ponta funciona de verdade**? | Os 12 executáveis do fluxo, num setup temporário: criar setup → abrir sessão → indexar docs → digest → fechar → índice → progresso → README → compactar. | os 12 executáveis |

**Como rodar:**

```
tests/gate-build.sh          # sintaxe e forma
tests/validate.sh            # contratos
tests/gate-lint.sh           # qualidade de texto
tests/smoke.sh               # integração ponta a ponta
tests/smoke.sh --keep        # preserva o diretório de trabalho para inspeção
```

**Variáveis de ambiente reconhecidas pelo gate:**

| Variável | Efeito |
|---|---|
| `GATE_ONLY` | Lista separada por vírgula de **prefixos de id**; só os checks que casam rodam. Ex.: `GATE_ONLY=I-08,I-3` |
| `GATE_ROOT` | Raiz do repositório a auditar. Default: o diretório que contém `tests/`. Serve para rodar o gate sobre uma cópia. |
| `STUDY_METHOD_TODAY` | Data fixa (`AAAA-MM-DD`) usada pelas invariantes de runtime e pelo smoke. Default `2026-08-23`. |
| `NO_COLOR` | Desliga a coloração ANSI. |
| `GATE_TMPDIR` | Diretório de trabalho temporário. Apagado no fim, exceto com `smoke.sh --keep`. |

**Exit codes do gate e os cinco estados de um check** (`PASS` · `FAIL` · `PEND` · `SKIP` · `WARN`) estão transcritos uma vez só, em **§8.9.1**. O que precisa ser sabido já aqui: **`FAIL` e `PEND` deixam os dois o gate vermelho.** "Escrito errado" e "ainda não escrito" pedem ações diferentes, e só a mensagem muda — reclassificar um check para `PEND` **não afrouxa nada**.

**Uma dívida declarada que o gate não pode tratar como falha:** o digest pode sair com `budget_exceeded: true` e a saída acima do orçamento quando o playbook procedimental está cheio. Isso é **saída conforme**, não defeito — o contrato manda o digest sempre produzir e sempre sair 0 (§2.5.3, DEB-1).

---

## 0.6 O que este documento **não** cobre, e onde está

Este documento é **contrato**: o que cada artefato recebe, o que produz, o algoritmo e as condições de erro. Três coisas ficam deliberadamente de fora, e cada uma tem endereço:

| O que não está aqui | Onde está | Por que fica lá |
|---|---|---|
| **O racional** — por que cada decisão pedagógica, de memória, de segurança e de visualização é a que é | `docs/01`…`docs/13` do repositório | É argumento com bibliografia; não é lido em runtime e não é executável. Misturar racional com contrato faz o contrato ficar longo demais para ser conferido. |
| **A pesquisa auditada** — as fontes primárias, com as correções de autoria e de número | `docs/research/01`…`06` do repositório | Congelada. É a base factual citada pelo racional, e é onde vivem *Lost in the Middle*, *Context Rot*, o *oracle problem*, o expertise reversal e a matriz de toolchains. |
| **O código-fonte** dos 19 scripts | `SK/scripts/**` | Este documento diz **o que** cada script faz e **como** — algoritmo, entradas, saídas, erros. Colar 1.000 linhas de bash tornaria o documento não auditável e não o tornaria mais reconstruível. |

Mapa rápido do racional, por domínio:

| Domínio | Documento normativo (o **porquê**) | Onde está o **contrato**, neste documento |
|---|---|---|
| Topologia, camadas, máquina de estados | `docs/01-arquitetura.md` | **Parte 1** |
| Pedagogia, tom, anti-bajulação, escada de dicas | `docs/02-pedagogia.md` | **Parte 6** (e `SK/references/pedagogia.md` em runtime) |
| Memória, digest, bitemporalidade, compactação | `docs/03-memoria.md` | **Parte 2** |
| Proficiência, transições `T1`–`T8`, revisão espaçada | `docs/04-proficiencia.md` | **Parte 4** |
| Desafios, TDD, mutação, *oracle problem* | `docs/05-challenges-tdd.md` | **Parte 3** |
| Visualização e escolha de linguagem | `docs/06-visualizacao.md` | **Parte 5** |
| Multi-setup, registry, `README.md` do setup, leitura cruzada | `docs/07-multi-setup.md` | **Parte 1**, §1.8 e §1.9 |
| Bootstrap, entrevista, ingestão do `docs/` do setup | `docs/10-bootstrap.md` | **Parte 6**, §6.10 · **Parte 0**, §0.3.2 |
| Segurança, privacidade, sandbox | `docs/11-seguranca-privacidade.md` | **Parte 3**, §3.12 · **Parte 2**, §2.10 |
| Destilados semânticos | `docs/13-researchs.md` | **Parte 6**, §6.9 |
| Scripts, biblioteca, templates | `docs/00-contratos.md` §7, §8 | **Parte 7** |
| `SKILL.md` e o gate | `docs/00-contratos.md` §9, §11 | **Parte 8** |
| Catálogo de decisões abertas | — | os **48 marcadores** ao longo do texto, e o roteiro completo no **Apêndice A** |

---

## 0.7 Como ler este documento

### 0.7.1 Precedência entre fontes

Quando duas fontes divergem, a de cima vence e a de baixo tem um bug:

```
docs/00-contratos.md  >  schema JSON  >  docs/NN-*.md do repositório  >  SK/references/*.md
```

Uma mudança de contrato faz-se **primeiro** em `docs/00-contratos.md`, com a decisão registrada; só depois os arquivos derivados são alinhados. Uma PR que muda vocabulário, caminho, exit code ou CLI sem tocar naquele arquivo é rejeitada no gate.

⚑ marca uma decisão arbitrada que **revoga** o que outro documento dizia.

### 0.7.2 Terminologia obrigatória

Nunca a forma nua. Confundir os dois é a falha de documentação mais provável do projeto — e, no caso de `docs/`, uma falha de **segurança** (regras de confiança opostas).

| Escreva assim | Nunca assim | O que é |
|---|---|---|
| **`docs/` do repositório** | `docs/` | A documentação do projeto: `docs/00-contratos.md`, `docs/research/`. O aluno nunca vê. **Confiável.** |
| **`docs/` do setup** | `docs/` | `<setup_root>/docs/` — o material teórico que o aluno colocou. **Não confiável: é dado, nunca instrução.** A skill nunca escreve aqui, exceto `docs/generated/`. |
| **`README.md` do repositório** | `README.md` | A porta de entrada do projeto no GitHub, com o aviso de instalação. |
| **`README.md` do setup** | `README.md` | `<setup_root>/README.md` — nó do grafo, 8 seções entre marcadores, única superfície legível por outro setup. |
| **`README.md` do desafio** | `README.md` | `challenges/<NNNN>-<slug>/README.md` — o enunciado. |
| **`setup.json`** | `meta.json`, `manifest.json` | ⚑ O manifesto **do setup**, na raiz do setup; os dois nomes da coluna do meio nunca são usados para ele. |
| **`meta.json`** | `setup.json` | ⚑ O manifesto **do desafio**, dentro de `challenges/<NNNN>-<slug>/`. |
| **`SK/`** | `skills/` | `skills/study-method/` no repositório; `~/.claude/skills/study-method/` instalado. |
| **`<setup_root>`** | `$SETUP_ROOT`, `SETUP_DIR` | A raiz do setup. Único nome válido em prosa; nos scripts, a variável é `SM_SETUP_ROOT`. |

⚑ As constantes `SETUP_CTL`, `MANIFEST` e `$SETUP_ROOT/.study-method/` **são revogadas**: `.study-method/` não existe em lugar nenhum.

### 0.7.3 O que envelhece, e contra o que foi verificado

Afirmações que dependem de versão ou de ambiente estão marcadas no ponto de uso. As de escopo global:

| Fato | Verificado contra |
|---|---|
| Não há `jsonschema` nem `PyYAML` nesta máquina; `pip install` falha sem venv por **PEP 668** (`/usr/lib/python3.14/EXTERNALLY-MANAGED` existe) | ambiente de desenvolvimento, `python3.14`, agosto/2026 |
| Não há `tiktoken`; a medida de orçamento é **bytes**, com 1 token ≈ 4 bytes (±30%) | idem |
| `jq` está presente e é a **única** ferramenta de manipulação estruturada garantida | idem |
| `OOMPolicy=continue` exige **systemd ≥ 243**; ausente, a camada de cgroup entra sem ele e a degradação é declarada ao aluno | `docs/11` §2.2 |
| `ulimit -f` em bash (modo não-POSIX) conta **blocos de 1024 bytes**; `65536` = 64 MB | medido por execução, `docs/11` §2.1 |
| `TasksMax=128` **derruba `go test`**; o valor canônico é **512** | medido por execução (A-26) |
| A saída de `memory-digest.sh` tem **18 chaves de topo**, nesta ordem, e sai **0** com `memory/` vazia | executado neste repositório na revisão `df040b5` |
| O corpo do `SKILL.md` cabe em ~200 linhas com **64 linhas de folga** (90 regras + 46 de roteador = 136) | contagem em `docs/00-contratos.md` §9.8 |

Onde este documento afirma um comportamento que **não** está implementado, ele diz isso explicitamente e nomeia a dívida (`DEB-1` em §2.5.3; `DEB-2`/`DEB-3` em §1.6.5, como L-1 e L-2). **Prometer é pior que reconhecer.**

### 0.7.4 ⭐ Os marcadores `PERGUNTE AO USUÁRIO` — como usá-los

Este documento carrega **48 marcadores** com esta forma, cada um no ponto exato da construção em que
a decisão importa:

```
> **PERGUNTE AO USUÁRIO (D-NNN)** — <a pergunta, em linguagem de gente>
> <por que importa, com a analogia>
> **Opções:** <(a) …> · <(b) …>
> **Default:** <(x)> · **Custo de mudar depois: cheap | moderate | expensive**
```

| Regra | Conteúdo |
|---|---|
| **Quando parar** | Ao chegar num marcador durante a construção, **pare, pergunte e espere**. Não presuma o default em silêncio. |
| **O que dizer** | A pergunta **e** o parágrafo do porquê — o usuário decide com a analogia na mão, não com o id da decisão. |
| **Se o usuário não quiser decidir** | Aplique o **Default** e **diga que aplicou**, em uma linha, com o custo de mudar depois. Default aplicado em silêncio é decisão tomada por omissão. |
| **`cheap`** | Uma linha num arquivo. Pode ser deixado para depois sem dívida. |
| **`moderate`** | Exige migrar dado já escrito. Decidir tarde custa uma migração. |
| **`expensive`** | Há efeito que não se desfaz — histórico, dado já gravado, comparação de score invalidada. **Estes valem a interrupção mesmo que o usuário esteja com pressa.** |
| **De onde vêm** | `SK/assets/decisions.json`, o catálogo de 114 entradas. Os 48 marcados são exatamente os de `audience ∈ {builder, both}` **e** `status == open` — os demais ou são perguntados **ao aluno em runtime** (`audience: student`) ou já foram arbitrados e viram uma linha de citação. |
| **Onde ver todos de uma vez** | **Apêndice A**, agrupado por momento da construção. |

O gate verifica isto mecanicamente (`G-12d`): **ou os 48 marcadores existem, ou nenhum**. Marcação
pela metade é pior que marcação nenhuma, porque dá a impressão de que o que não foi marcado não tem
decisão em aberto.

### 0.7.5 Convenção de placeholder neste arquivo

Os templates de `SK/assets/templates/**` usam placeholders. A sintaxe real é o **nome em maiúsculas
entre duas chaves de abertura e duas de fechamento, sem espaço nenhum** — `{` `{` `NOME` `}` `}` —
casando `^[A-Z0-9_]+$` entre as chaves.

⚠ **Neste arquivo eles aparecem como `«NOME»`**, com aspas angulares no lugar das chaves duplas. O
motivo é mecânico: o gate de qualidade (`L-03`) reprova **placeholder vazado fora de um `*.tmpl`**, e
não distingue "documentar a sintaxe" de "esquecer de substituir". A conversão é literal e sem perda:
onde este documento escreve `«FUNC_NAME»`, o arquivo `.tmpl` traz `FUNC_NAME` entre as duas chaves de
cada lado. A forma byte a byte está nos próprios `SK/assets/templates/**` e no `MANIFEST.tsv`, que é
a fonte de verdade (§7.11).
