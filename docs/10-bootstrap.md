# 10 — Bootstrap e ingestão do material teórico

O que acontece nos **primeiros segundos** depois que o aluno dispara a skill: como ela descobre
onde está, o que faz quando não encontra nada, como cria um setup novo sem transformar a primeira
interação num formulário, e como lê o material teórico do aluno sem se afogar nele.

## Convenção de terminologia (obrigatória em todo o projeto)

Há duas pastas chamadas `docs` neste universo e confundi-las é um bug de documentação:

- **`docs/` do repositório** — a pasta onde este arquivo mora. Documentação de projeto, para quem
  constrói a skill. O aluno nunca vê.
- **`docs/` do setup** — a pasta de material teórico dentro do setup de estudo do aluno. É dela que
  este documento fala quase o tempo todo.

Nunca escrever `docs/` sozinho. Nos trechos operacionais, usa-se a constante:

```
SETUP_ROOT   = raiz do setup de estudo do aluno
SETUP_DOCS   = $SETUP_ROOT/docs        # o `docs/` do setup
SETUP_MEM    = $SETUP_ROOT/memory
SETUP_RES    = $SETUP_ROOT/researchs
SETUP_CHAL   = $SETUP_ROOT/challenges
SETUP_CTL    = $SETUP_ROOT/.study-method     # controle e cache derivado
MANIFEST     = $SETUP_CTL/manifest.json      # marcador canônico do setup
REGISTRY     = ${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/registry.json
```

> `MANIFEST` e `SETUP_CTL` são **proposta** deste documento. A sub-tarefa 2.1
> (`01-arquitetura.md` + `setup-manifest.schema.json`) é a autoridade sobre o caminho e o schema do
> manifesto do setup. Toda a lógica abaixo depende só de "existe um marcador legível na raiz do
> setup" — se 2.1 escolher outro caminho, troca-se o valor da constante e nada mais muda.

---

## 1. Os três requisitos do aluno, e onde cada um é atendido

O pedido original tem três exigências distintas. Elas não são a mesma coisa e falham de formas
diferentes:

| # | Exigência literal | Onde é atendida | Modo de falha se ignorada |
|---|---|---|---|
| R1 | "verificar se tem uma pasta `docs/`" | §4, folhas B-17 a B-21 | a skill assume que existe material e alucina o conteúdo dele |
| R2 | "sempre ler o contexto de tudo que está lá" | §8 (ingestão com orçamento) | ou lê pouco e finge que leu tudo, ou lê demais e entende nada (§8.1) |
| R3 | "se os arquivos base não forem encontrados, perguntar se quer criar um novo setup" | §5 (a parada obrigatória) | a skill cria pasta no diretório errado sem consentimento, ou trava sem saída |

R3 é o **único ponto de parada obrigatória** de todo o bootstrap. Tudo o mais ou decide sozinho e
anuncia, ou apresenta um menu curto de desambiguação. Isso é deliberado: cada parada extra antes da
primeira aula é uma chance de o aluno desistir.

---

## 2. Princípios que governam esta fase

1. **Nada é criado em silêncio.** Nenhum diretório, nenhum arquivo, nenhuma entrada de registry
   antes de um "sim" explícito. A única exceção é recriar um subdiretório *estrutural* que sumiu de
   um setup já existente e já consentido (B-19) — e mesmo isso é anunciado em uma linha.
2. **Nunca ler pela metade em silêncio.** Se o material não coube, o aluno é informado do que ficou
   de fora, por nome. Um tutor que leu o que importa e declarou o que deixou de lado é melhor que um
   que leu tudo e não entendeu nada.
3. **Nenhum default aplicado sem aviso.** Quando a skill assume um valor, ela grava
   `default_used: true` naquele campo e diz uma vez, em uma linha, o que assumiu.
4. **O diretório atual não é consentimento.** Estar dentro de uma pasta não autoriza escrever nela.
5. **Anunciar em uma linha, não em um relatório.** O bootstrap bem-sucedido custa uma frase ao
   aluno, não uma tela de status.
6. **Diagnóstico antes de promessa.** Se o disco é somente-leitura, isso se descobre antes de
   prometer "vou registrar sua sessão", não no meio da aula.

---

## 3. Sinais coletados (determinísticos, antes de qualquer decisão)

Tudo abaixo é leitura barata (`test`, `ls`, `stat`, um `jq`), sem custo de contexto relevante e sem
nenhuma chamada de modelo. O resultado é um punhado de variáveis que a árvore da §4 consome.

| Sinal | Como obter | Valores |
|---|---|---|
| `arg_path` | argumento da invocação, se houver | caminho ou vazio |
| `cwd_state` | ver §3.1 | `valid` · `incomplete` · `corrupt` · `candidate` · `inside` · `none` |
| `setup_root` | primeiro ancestral de `$PWD` (até `$HOME`, inclusive) com `MANIFEST` legível | caminho ou vazio |
| `registry_state` | ver §3.2 | `ok` · `absent` · `corrupt` · `unwritable` |
| `registry_active` | entradas com `setup_status: active` e diretório existente | 0, 1 ou N |
| `writable` | `test -w $SETUP_ROOT` | booleano |
| `memory_count` | `ls $SETUP_MEM/[0-9][0-9][0-9][0-9].json \| wc -l` | inteiro |
| `orphan_session` | sessão mais recente com `status: in_progress` | id ou vazio |
| `docs_state` | ver §3.3 | `absent` · `empty` · `readable` · `partially_readable` · `unreadable` |
| `docs_bytes` | soma dos bytes **ingeríveis** (§8.3) | inteiro |

### 3.1 Classificação do diretório corrente

```
valid       MANIFEST existe, é JSON válido, tem schema_version, e os 4 diretórios
            (SETUP_DOCS, SETUP_MEM, SETUP_RES, SETUP_CHAL) + README.md existem
incomplete  MANIFEST válido, mas falta diretório ou README.md
corrupt     MANIFEST existe mas não parseia, ou falta campo obrigatório
candidate   MANIFEST ausente, mas >= 2 dos 4 diretórios canônicos existem
inside      $PWD não é raiz, mas um ancestral (até $HOME) é `valid`
none        nada disso
```

A subida por ancestrais para em `$HOME` **inclusive** e nunca passa dele. Motivo: um marcador
esquecido em `/` ou em `$HOME` sequestraria toda invocação futura da skill em qualquer pasta.

### 3.2 Estado do registry

`REGISTRY` é um índice **derivado e reconstruível** — ele acelera a descoberta, não é a fonte da
verdade. A fonte da verdade é o `MANIFEST` dentro de cada setup. Isso é o que permite tratar
registry corrompido sem parar o aluno (B-24).

### 3.3 Estado do `docs/` do setup

```
absent              SETUP_DOCS não existe
empty               existe, zero arquivos (ou só arquivos ocultos)
readable            >= 1 arquivo com ingestão possível (§8.3)
partially_readable  há arquivos ingeríveis E arquivos que não dá para ler (PDF sem extrator, binário)
unreadable          há arquivos, nenhum ingerível
```

---

## 4. ⭐ A árvore de decisão da invocação

### 4.1 A ordem (pseudocódigo determinístico)

```
BOOT:
  ler sinais (§3)

  # --- A. alvo explícito -------------------------------------------------
  se arg_path != "":
      se arg_path é setup valid            -> B-01
      se arg_path não existe               -> B-02   [PERGUNTA]
      se arg_path existe e é candidate     -> B-08   [PERGUNTA]
      se arg_path existe, não é setup      -> B-03   [PERGUNTA]

  # --- B. diretório corrente ---------------------------------------------
  senão, conforme cwd_state:
      valid                                -> B-04
      inside                               -> B-05 / B-09
      incomplete                           -> B-06   (repara e avisa; se irreparável -> B-07)
      corrupt                              -> B-07   [PERGUNTA]
      candidate                            -> B-08   [PERGUNTA]
      none                                 -> segue para C

  # --- C. registry --------------------------------------------------------
  conforme registry_state:
      corrupt                              -> B-24 (avisa, segue com registry vazio)
      unwritable                           -> B-25 (avisa, segue sem registry)
      absent                               -> registry_active = 0
  entradas apontando para diretório sumido -> B-12 (marca missing, avisa)
  conforme registry_active:
      1                                    -> B-10 (adota e anuncia, com escape na mesma frase)
      >= 2                                 -> B-11  [MENU CURTO]
      0                                    -> B-13  [PARADA OBRIGATÓRIA — §5]

  # --- D. com setup em mãos ----------------------------------------------
  se not writable                          -> B-22
  se orphan_session != ""                  -> B-16  [MENU CURTO]
  se memory_count == 0                     -> B-14
  senão                                    -> B-15
  conforme docs_state:
      absent                               -> B-19 -> B-18
      empty                                -> B-18  [MENU CURTO]
      unreadable                           -> B-20  [MENU CURTO]
      partially_readable                   -> B-20 para a parte ilegível + segue com o resto
      readable e docs_bytes <= orçamento   -> B-17
      readable e docs_bytes >  orçamento   -> B-21
```

**Regra de precedência**: um alvo explícito sempre ganha do diretório corrente, que sempre ganha do
registry. O registry nunca sobrepõe um setup que está debaixo dos pés do aluno.

**Paradas**: exatamente **uma** obrigatória (B-13). As demais marcadas `[PERGUNTA]`/`[MENU CURTO]`
só disparam em situação ambígua ou destrutiva — em uso normal, o aluno passa por zero delas.

### 4.2 Índice das folhas

| ID | Situação | Pergunta ao aluno? |
|---|---|---|
| B-01 | argumento aponta para setup válido | não |
| B-02 | argumento aponta para caminho inexistente | sim |
| B-03 | argumento aponta para diretório existente que não é setup | sim |
| B-04 | diretório corrente é setup válido | não |
| B-05 | diretório corrente está dentro de um setup | não |
| B-06 | setup incompleto (falta diretório / README) | não (avisa) |
| B-07 | manifesto do setup corrompido | sim |
| B-08 | diretório parece setup mas não tem manifesto | sim |
| B-09 | ancestral é setup, corrente não | não |
| B-10 | nenhum setup aqui, registry tem exatamente 1 | não (anuncia + escape) |
| B-11 | nenhum setup aqui, registry tem 2+ | menu curto |
| B-12 | registry aponta para diretório que sumiu | não (avisa + oferece religar) |
| B-13 | **nenhum setup em lugar nenhum** | **SIM — parada obrigatória** |
| B-14 | setup válido, `memory/` vazia (primeira aula) | não |
| B-15 | setup válido, `memory/` com histórico | não |
| B-16 | sessão órfã `in_progress` da vez anterior | menu curto |
| B-17 | `docs/` do setup legível e dentro do orçamento | não |
| B-18 | `docs/` do setup existe e está vazio | menu curto |
| B-19 | `docs/` do setup não existe | não (recria e avisa) |
| B-20 | `docs/` do setup só tem arquivo ilegível | menu curto |
| B-21 | `docs/` do setup acima do orçamento | não (modo manifesto + declara) |
| B-22 | setup em local sem permissão de escrita | não (avisa + modo efêmero) |
| B-23 | registry ainda não existe | não |
| B-24 | registry corrompido | não (avisa, preserva) |
| B-25 | `STUDY_METHOD_HOME` não gravável | não (avisa, degrada) |

### 4.3 As folhas, uma a uma

Para cada folha: **Faz** (ação em disco/memória), **Diz** (fala modelo ao aluno, pt-BR, tom de
conversa), **Grava** (efeito persistente). "Grava: nada" é uma resposta válida e frequente.

#### B-01 — argumento aponta para setup válido
- **Faz**: adota `SETUP_ROOT = arg_path`. Sem confirmação: o aluno acabou de nomear o caminho.
- **Diz**: "Abri o setup de *Cálculo I* em `~/estudos/calculo`. Última aula foi dia 09/08."
- **Grava**: `last_used_at` na entrada do registry (cria a entrada se o setup não estava registrado).

#### B-02 — argumento aponta para caminho inexistente
- **Faz**: **não cria nada.** Pergunta.
- **Diz**: "Não achei nada em `~/estudos/calculo` — a pasta não existe. Quer que eu crie um setup
  novo aí, ou você digitou outro caminho?"
- **Respostas**: "cria" → entrevista da §6 com `setup_path` já preenchido · caminho corrigido →
  reavalia do zero · "deixa" → volta ao passo C (registry).
- **Grava**: nada até o "sim".

#### B-03 — argumento aponta para diretório existente que não é setup
- **Faz**: pergunta antes de tocar. Se o diretório tem conteúdo não relacionado (ex.: `.git`,
  código-fonte), diz isso explicitamente — é o cenário em que espalhar `memory/` e `challenges/`
  causaria dano real.
- **Diz**: "Essa pasta já tem coisa dentro (parece um projeto com git). Se eu montar o setup aqui,
  vou criar `docs`, `memory`, `researchs`, `challenges` e um `README.md` no meio dele. Pode ser,
  ou prefere uma pasta separada?"
- **Grava**: nada até o "sim".

#### B-04 — diretório corrente é setup válido
- **Faz**: adota. É o caminho feliz da retomada (§9).
- **Diz**: uma linha só, já com o gancho da aula. "Voltamos ao *Cálculo I*. Da última vez a gente
  parou em limites laterais — sigo daí?"
- **Grava**: `last_used_at`.

#### B-05 / B-09 — o corrente está dentro de um setup (ou um ancestral é setup)
- **Faz**: sobe até a raiz, adota a raiz. Não trata o subdiretório como setup próprio.
- **Diz**: "Você está dentro de `challenges/derivadas/`; o setup mesmo é `~/estudos/calculo`, abri
  de lá."
- **Grava**: `last_used_at`.

#### B-06 — setup incompleto
- **Faz**: recria **só o que é estrutura vazia** (diretório canônico faltando) e regenera `README.md`
  a partir do template se ele sumiu. Nunca inventa conteúdo de `memory/` nem de `$SETUP_DOCS`.
  Se o que falta não é regenerável (ex.: `memory/INDEX.json` sumiu mas há brutos) → reconstrói pelo
  caminho de B-15. Se o manifesto não bate com a realidade de forma irreconciliável → B-07.
- **Diz**: "Faltava a pasta `researchs/` aqui, recriei. O resto está no lugar."
- **Grava**: diretórios recriados, `README.md`, `repaired_at` no manifesto do setup.

#### B-07 — manifesto do setup corrompido
- **Faz**: **não sobrescreve e não apaga.** Pergunta, com três saídas concretas.
- **Diz**: "O arquivo de controle desse setup (`.study-method/manifest.json`) está ilegível — não
  consigo saber de que matéria ele é. Suas anotações e sessões estão intactas, é só o índice que
  quebrou. Posso: (1) remontar o controle a partir do que está em disco, (2) abrir só para leitura,
  sem gravar nada hoje, ou (3) você me aponta outro setup. Qual?"
- **Respostas**: (1) reconstrói e move o quebrado para `manifest.json.corrupt-<timestamp>` — o
  arquivo antigo nunca é destruído · (2) segue em modo somente-leitura (nenhuma escrita na sessão
  inteira) · (3) volta ao passo A com o novo caminho.
- **Grava**: só na opção (1).

#### B-08 — parece setup, mas não tem manifesto
- **Faz**: oferece **adoção**, que é diferente de criação — nada de conteúdo é gerado, só o arquivo
  de controle.
- **Diz**: "Essa pasta tem `docs`, `memory` e `challenges`, mas não tem meu arquivo de controle.
  Parece um setup meu que perdeu o índice (ou um que você montou na mão). Quer que eu adote como
  setup e recrie só o controle? Não mexo em nada do que já está aí."
- **Respostas**: "sim" → cria `MANIFEST` inferindo o que der (assunto a partir do `README.md` ou do
  nome da pasta; confirma o assunto em uma pergunta) e registra · "não" → volta ao passo C.
- **Grava**: só o `MANIFEST` + entrada no registry, na resposta afirmativa.

#### B-10 — nenhum setup aqui, registry tem exatamente 1 ativo
- **Faz**: adota o registrado e **anuncia com escape embutido**. Não é parada: o custo de errar é
  baixo e reversível numa frase.
- **Diz**: "Você não está numa pasta de estudo, mas tenho seu setup de *Cálculo I* em
  `~/estudos/calculo` — abri ele. (Se você queria começar uma matéria nova, é só dizer *novo setup*.)"
- **Grava**: `last_used_at`.

#### B-11 — nenhum setup aqui, registry tem 2 ou mais
- **Faz**: menu curto, ordenado por `last_used_at` desc, com o mais recente em primeiro.
- **Diz**: "Tenho três setups seus: *Cálculo I* (usado ontem), *Rust* (há 3 semanas) e *Estatística*
  (há 2 meses). Continuo do Cálculo, ou é outro hoje?"
- **Por que aqui vale parar**: abrir o setup errado escreve memória do aluno no lugar errado, e isso
  é caro de desfazer — mais caro que uma pergunta de uma linha.
- **Grava**: `last_used_at` no escolhido.

#### B-12 — registry aponta para diretório que sumiu
- **Faz**: marca `setup_status: missing` (não apaga a entrada — o aluno pode ter só desmontado um
  disco externo), avisa, e continua a avaliação com os que sobraram. Se não sobrar nenhum → B-13.
- **Diz**: "O setup de *Rust* estava em `/mnt/dados/rust` e essa pasta não está acessível agora.
  Marquei como sumido. Se ele mudou de lugar, me diz o caminho novo que eu religo."
- **Grava**: `setup_status: missing` + `missing_since` na entrada.

#### B-13 — nenhum setup em lugar nenhum → **PARADA OBRIGATÓRIA**
Detalhada na §5.

#### B-14 — setup válido, `memory/` vazia (primeira aula de verdade)
- **Faz**: pula digest e índice de memória (não há o que ler). Roda a ingestão do `docs/` do setup
  normalmente (§8) — material teórico pode existir desde o dia zero. Abre a sessão `0001`.
- **Diz**: "Primeira aula nesse setup. Li seu material (3 arquivos, ~28 KB) e montei um roteiro:
  começo por *definição de limite* e a gente fecha com um exercício. Fechado?"
- **Grava**: `memory/0001.json` com `status: in_progress` (no passo `open_session`).

#### B-15 — setup válido, `memory/` com histórico
- **Faz**: lê `memory/INDEX.json` + `profile.json` e monta o digest **por código**, nunca "a LLM
  decide o que copiar de N arquivos" (`research/02-memoria-llm.md` §2 e §4). Se `INDEX.json` está ausente ou
  mais velho que o bruto mais novo, reconstrói antes. Bruto ilegível é **pulado e listado**, nunca
  motivo para abortar.
- **Diz**: nada sobre a mecânica; entra direto no gancho pedagógico. Só fala se algo deu errado:
  "Dois arquivos de sessão (`0012`, `0019`) estão ilegíveis — segui sem eles."
- **Grava**: `memory/INDEX.json` reconstruído, se foi o caso.

#### B-16 — sessão órfã da vez anterior
Detalhada na §10.

#### B-17 — `docs/` do setup legível e dentro do orçamento
- **Faz**: lê tudo (§8.4).
- **Diz**: "Li seu material: 4 arquivos, ~31 KB." Uma linha, sem lista de nomes.
- **Grava**: `SETUP_CTL/cache/docs-manifest.json` (índice derivado, para a próxima vez).

#### B-18 — `docs/` do setup existe e está vazio
- **Faz**: **não trata como erro.** Oferece três caminhos, todos válidos.
- **Diz**: "Sua pasta de material está vazia. Três jeitos de tocar: (a) você joga os PDFs/anotações
  lá agora e eu leio; (b) eu escrevo uma base teórica inicial do assunto — deixo marcada como
  *gerada por IA*, porque pode ter erro; (c) a gente vai sem base escrita, eu puxo pelo que você já
  sabe. Qual?"
- **Respostas**: (a) espera, relê e segue · (b) §7 · (c) segue, e não pergunta de novo nesta sessão.
- **Grava**: `theory_source` no manifesto do setup (`student_provided` · `generated` · `none`).

#### B-19 — `docs/` do setup não existe
- **Faz**: recria o diretório **vazio** — é estrutura de um setup já consentido, não conteúdo — e cai
  em B-18.
- **Diz**: "A pasta de material tinha sumido; recriei vazia." (uma linha, então o menu de B-18)
- **Grava**: o diretório.

#### B-20 — `docs/` do setup só tem arquivo que não dá para ler
- **Faz**: nomeia exatamente o que não conseguiu ler e por quê (§8.6). Nunca "não achei material"
  quando o problema é falta de extrator.
- **Diz**: "Tem um `calculo-stewart.pdf` de 40 MB aí, mas eu não tenho como extrair texto de PDF
  nesta máquina. Opções: instalar o poppler (`sudo pacman -S poppler`) e eu releio na hora;
  exportar o PDF para `.txt`/`.md` e jogar na pasta; ou eu escrevo a base teórica do assunto,
  marcada como gerada. Qual prefere?"
- **Grava**: no manifesto do setup, a lista de arquivos não ingeridos com o motivo — para não repetir
  o mesmo diagnóstico toda sessão.

#### B-21 — `docs/` do setup acima do orçamento
- **Faz**: modo manifesto (§8.5) — carrega só as seções relevantes ao tópico da aula e **declara o
  que ficou de fora**.
- **Diz**: "Seu material tem 340 páginas. Carreguei os capítulos 3 e 4 (limites e continuidade), que
  é onde a gente está. Ficaram de fora: séries, integrais, apêndice de trigonometria — se a aula
  esbarrar em algum, é só pedir que eu abro."
- **Grava**: `SETUP_CTL/cache/docs-manifest.json`.

#### B-22 — setup em local sem permissão de escrita
- **Faz**: detecta **antes** de prometer qualquer registro. Entra em modo somente-leitura explícito.
- **Diz**: "Consigo ler esse setup, mas não consigo escrever nele (sem permissão). Dá para dar a aula
  normalmente, só não vou conseguir guardar nada do que acontecer hoje. Quer seguir assim, ou
  prefere resolver a permissão antes?"
- **Grava**: nada (é justamente o ponto).

#### B-23 — registry ainda não existe
- **Faz**: trata como registry vazio. Cria o arquivo (e o diretório-pai) só na primeira gravação
  real. Não é erro, não gera aviso.
- **Diz**: nada.
- **Grava**: nada agora.

#### B-24 — registry corrompido
- **Faz**: **preserva o arquivo quebrado**. Segue com registry vazio em memória; se e quando houver
  algo a gravar, move o quebrado para `registry.json.corrupt-<timestamp>` e escreve um novo.
- **Diz**: "Meu índice de setups está corrompido. Não perdi nada — cada setup guarda seus próprios
  dados. Só não vou conseguir listar setups antigos até você me apontar o caminho de algum."
- **Grava**: só no momento da primeira gravação real.

#### B-25 — `STUDY_METHOD_HOME` aponta para caminho não gravável
- **Faz**: opera **sem** registry. O setup em si continua 100% funcional; só a descoberta
  multi-setup fica degradada.
- **Diz**: "Não consigo escrever em `$STUDY_METHOD_HOME`. A aula roda normal, mas da próxima vez vou
  precisar que você me diga onde está o setup."
- **Grava**: nada.

---

## 5. ⭐ O ramo "não encontrado → PERGUNTAR" (B-13)

É o único momento em que a skill **para e espera**. Vale a pena gastar precisão aqui: é a primeira
impressão do projeto inteiro.

### 5.1 Como ela pergunta

Tom de bate-papo, não interrogatório (`research/03-pedagogia.md` §8: estilo conversacional bate estilo formal
em 11 de 11 testes de transferência; e §8.2: informal precisa carregar conteúdo, não decoração).

Forma da pergunta, em três partes, uma frase cada:

1. **O diagnóstico**, sem drama e sem jargão — o aluno não fez nada errado.
2. **A oferta**, com o custo declarado ("são umas 5 perguntas rápidas") — porque a objeção real do
   aluno não é "não quero", é "vai demorar".
3. **A saída**, na mesma mensagem — sempre existe um jeito de dizer não e ainda assim conseguir algo.

Fala modelo:

> "Dei uma olhada por aqui e não achei nenhum setup de estudo — nem nesta pasta, nem no meu registro.
> Quer que eu monte um agora? São 5 perguntas rápidas e a gente já começa a aula.
> Se preferir, dá pra gente só conversar sobre a matéria hoje, sem eu gravar nada."

Variante quando o aluno já chegou com um assunto na primeira mensagem ("me ajuda com derivadas"):

> "Bora. Antes: eu não tenho setup nenhum montado ainda — se você deixar eu criar um, eu guardo o
> que a gente vier fazendo e na próxima já retomo de onde paramos. Monto agora (2 minutos) ou você
> prefere que eu responda direto sobre derivada e a gente vê isso depois?"

### 5.2 O que ela **não** faz

| Nunca | Por quê |
|---|---|
| criar diretório antes do "sim" | escrever na pasta de alguém sem permissão é o pior primeiro contato possível |
| assumir que `$PWD` é o lugar certo | o aluno pode ter rodado a skill de dentro de um repositório de trabalho |
| gravar entrada no registry "só para marcar" | registry apontando para setup inexistente é lixo que reaparece toda invocação |
| rodar `git init`, instalar pacote, baixar qualquer coisa | fora do escopo, e a skill não tem consentimento para efeito colateral no ambiente |
| repetir a pergunta depois de um "não" | perguntar duas vezes é insistência; ela reoferece **no máximo uma vez**, e só se houver contexto novo (§5.3, resposta D) |
| fazer a entrevista inteira antes de aceitar o "sim" | as perguntas vêm **depois** do consentimento, nunca antes |

### 5.3 Cada resposta possível

**A — "sim, cria"**
Vai para a entrevista (§6). O consentimento cobre *criar um setup*, não *criar onde eu quiser*: o
lugar ainda é perguntado (§6, Q2), com default proposto.

**B — "não"**
A skill **não cria nada** e não fica sem graça com isso. Ela diz o que ainda consegue fazer e como
o aluno reabre a porta depois:

> "Beleza, sem setup. Consigo te ajudar normal com a matéria hoje — só não vou lembrar disso na
> próxima conversa, e não vou montar desafio com teste, porque isso precisa de pasta pra viver.
> Quando quiser, é só falar *cria um setup* que eu monto em 2 minutos."

Depois disso ela entra em **modo efêmero** (§5.4) e não volta ao assunto nesta sessão.

**C — "já tenho um, está em `<caminho>`"**
Não é criação, é adoção. Reavalia o caminho pelo passo A da §4.1: se for `valid` → B-01; se for
`candidate` → B-08; se não existir → B-02; se existir e não for setup → B-03. Nenhum caminho novo é
inventado aqui — a árvore já cobre os quatro casos.

**D — resposta ambígua, ou o aluno simplesmente ignora e faz uma pergunta de conteúdo**
Este é o caso que mais acontece na vida real e o mais fácil de tratar mal. A regra: **a pergunta do
aluno vem primeiro.** A skill responde em modo efêmero, de verdade, e só ao final da resposta
reoferece **uma única vez**, em uma linha:

> "(A propósito: se eu tivesse um setup montado, eu guardaria essa explicação e a gente retomaria
> dela na próxima. Quer que eu monte?)"

Se for ignorada ou recusada de novo, ela não pergunta mais nesta sessão. Perguntar três vezes é o
comportamento que faz o aluno fechar o terminal.

**E — o aluno não responde nada / a sessão acaba ali**
Nada foi gravado, nada precisa ser limpo. É o caso mais fácil, e é fácil justamente porque a regra
"nada é criado antes do sim" foi respeitada. Nenhum arquivo órfão, nenhuma entrada de registry
apontando para o vazio.

**F — o aluno responde algo impossível** (ex.: "cria em `/etc/estudo`", sem permissão)
A skill testa a permissão **antes** de tentar, diz o que aconteceria, e propõe um caminho gravável:

> "Não tenho permissão de escrever em `/etc`. Que tal `~/estudos/calculo`? Se você quer mesmo em
> `/etc`, precisa rodar como root, e eu não recomendo pra pasta de estudo."

### 5.4 Modo efêmero (a saída do "não")

É um estado explícito, não um degradê acidental. Nele:
- a skill **ensina normalmente** — pedagogia, analogia, escada de dicas, tudo vale;
- **não escreve nada** em disco, em lugar nenhum;
- **não numera** nada (não há `0001`, porque não há onde);
- **não promete memória**: nunca diz "vou lembrar disso" quando não vai;
- desafio com teste executável fica **indisponível** e ela diz por quê, uma vez, se o assunto surgir.

Modo efêmero é também o destino de B-22 (setup somente-leitura) e da opção (2) de B-07.

---

## 6. ⭐ A entrevista de criação de setup

O aluno acabou de dizer "sim". A partir daqui, cada pergunta é um pedágio. O objetivo declarado:
**da resposta "sim" até a primeira frase de aula real, no máximo 7 trocas.**

### 6.1 A regra que decide o que entra

Existe um catálogo de decisões abertas (`08-decisoes-abertas.md`, sub-tarefa 3.0) em que cada decisão
tem um campo `ask_when`. Aqui entram **exclusivamente** as marcadas `ask_when: setup-init`. O teste
para uma decisão merecer esse selo é duplo, e ela precisa passar nos dois:

1. **Bloqueia a primeira aula?** Sem a resposta, a skill não consegue dar a aula, ou daria uma aula
   pior de um jeito que o aluno perceberia.
2. **A resposta cabe em uma palavra ou uma escolha de menu?** Se exige o aluno entender um trade-off
   de arquitetura, não é pergunta de dia zero — é `on-demand` ou `session-15`.

Tudo o mais espera. Perguntar 25 coisas antes da primeira aula mata o projeto: o aluno veio estudar,
não configurar.

### 6.2 As perguntas mínimas (6 + 1 confirmação)

| # | Pergunta (fala modelo) | Grava em | Por que ela passa nos dois testes |
|---|---|---|---|
| Q1 | "O que você quer estudar?" | `subject`, `subject_slug` | Sem isso não existe aula, não existe nome de pasta, não existe critério de relevância na ingestão (§8.5). É a única pergunta absolutamente insubstituível. |
| Q2 | "Crio a pasta em `~/estudos/calculo`? (ou me diz outro lugar)" | `setup_path` | Escrever no lugar errado é o único dano irreversível-na-prática do bootstrap. É pergunta de uma tecla: o default já vem montado (§6.4). |
| Q3 | "Você já tem material — PDF, slides, anotações — ou eu começo do zero?" | `theory_source` | É o requisito explícito do aluno (R3/§7). Decide se a próxima coisa que acontece é ingestão, geração ou nada. Resposta de uma palavra. |
| Q4 | "Vai ter exercício de código? Aqui na sua máquina tem Python, Node, Rust, Go e Java prontos." | `practice_language` (`none` é valor válido) | Decide se `challenges/` é usado e com qual toolchain. Errar aqui desperdiça o primeiro desafio inteiro. O menu já vem filtrado pelo que está instalado (`detect-toolchains.sh`) — o aluno não escolhe o que não roda. |
| Q5 | "Quanto tempo você tem por sessão? 30, 60, 90 minutos?" | `session_minutes` | Define o escopo da **primeira** aula: quanto cobrir, se cabe desafio. Sem isso o tutor erra o tamanho da aula justo na hora em que ainda não conhece o aluno. Resposta: um número. |
| Q6 | "Como você está nisso hoje: começando do zero, já vi mas está enferrujado, ou já manjo e quero aprofundar?" | `starting_level` (`beginner`/`intermediate`/`advanced`) | **Expertise reversal effect** (`research/03-pedagogia.md` §3.3): o andaime que ajuda o novato *atrapalha* o avançado. É o input pedagógico de maior alavancagem do setup inteiro, e custa uma palavra. Vira o valor inicial do perfil de proficiência, que se autocorrige nas sessões seguintes. |
| — | **Confirmação**: "Vou criar em `~/estudos/calculo`: `docs`, `memory`, `researchs`, `challenges` e um `README.md`. Pode?" | — | Não é pergunta, é o último ponto de arrependimento antes da primeira escrita em disco. Mostra exatamente o que vai aparecer. |

### 6.3 O que **NÃO** se pergunta agora (e quando se pergunta)

| Decisão | Por que não agora | `ask_when` |
|---|---|---|
| versionar `memory/` no git | pergunta de privacidade, e não há nada em `memory/` ainda para proteger | primeira escrita de sessão |
| orçamento de leitura do `docs/` do setup (D-B01) | só importa se o material passar do limite; até lá é ruído | quando estourar, uma vez |
| estratégia de compactação / RAG local / grafo | irrelevante antes de ~15 sessões (`research/02-memoria-llm.md`, Recomendação) | `session-15` |
| grafia `researchs` vs `research` | cosmético; o default é manter | `on-demand` |
| formato de visualização, sandbox, Docker | não existe desafio ainda | `first-challenge` |
| intervalos de repetição espaçada | não há o que revisar na aula 1 | `session-15` |
| idioma do setup (D-B05) | inferível: é o idioma em que o aluno está falando comigo | nunca (só corrige se pedirem) |
| preferências de analogia, notação, apelidos | o tutor **descobre** isso observando, e é melhor observado que declarado | nunca (emerge do perfil) |
| profundidade da entrevista de pesquisa, formato do README | detalhe de implementação sem consequência visível na aula 1 | `on-demand` |

### 6.4 A saída rápida (para quem só quer começar)

Logo depois de Q1 — e só depois, porque sem assunto não há default nenhum a propor — a skill oferece
o atalho, com o conteúdo dos defaults visível na própria frase:

> "Posso assumir o resto e a gente ajusta no caminho: pasta em `~/estudos/calculo`, sessão de 60
> minutos, exercícios em Python, e eu monto uma base teórica inicial já que você não tem material.
> Toco assim, ou prefere responder as 4 perguntas?"

Se o aluno topar, o caminho inteiro vira **2 trocas** (Q1 + este "pode"). O que acontece então:

- cada campo assumido é gravado com `default_used: true` — nunca vira "escolha do aluno" no
  histórico, porque não foi;
- o resumo do que foi assumido é dito **uma vez**, na frase acima, e nunca repetido;
- qualquer um deles muda depois em uma frase ("na verdade eu tenho só 30 minutos"), e a skill
  atualiza o manifesto do setup ali mesmo, sem cerimônia.

Defaults propostos (todos reversíveis em uma frase):

| Campo | Default | De onde sai |
|---|---|---|
| `setup_path` | `$PWD/<subject_slug>` se `$PWD` está vazio; senão `~/estudos/<subject_slug>` | evita sujar um diretório com conteúdo |
| `theory_source` | `generated` se o aluno disse que não tem material; `student_provided` se disse que tem | Q3 |
| `practice_language` | primeira linguagem *detectada na máquina* que faz sentido para o assunto; `none` se o assunto não é de código | `detect-toolchains.sh` (`research/06-toolchains.md` §3) |
| `session_minutes` | `60` | valor mais comum; erra pouco nos dois sentidos |
| `starting_level` | `beginner` | subestimar e subir é seguro; superestimar e frustrar não é (`research/03-pedagogia.md` §3.3) |
| `language` | idioma da conversa | zero atrito |

### 6.5 O que a criação escreve, em ordem

```
1. mkdir -p $SETUP_ROOT/{docs,memory,researchs,challenges} $SETUP_CTL/cache
2. escreve $SETUP_ROOT/README.md          (a partir do template de setup)
3. escreve $MANIFEST                      (schema da sub-tarefa 2.1)
4. escreve/atualiza $REGISTRY             (entrada nova, setup_status: active)
5. se theory_source == generated -> §7
6. se theory_source == student_provided -> §8, agora ou depois de o aluno copiar os arquivos
```

Regras de escrita, todas implementáveis em `setup-init.sh` (onda 3):
- **idempotente**: rodar duas vezes no mesmo caminho não duplica nem sobrescreve nada — vira B-04
  ou B-06;
- **nunca sobrescreve arquivo existente** sem dizer; se `README.md` já existe, não toca;
- **falha limpa**: se o passo 3 falhar (disco cheio, permissão), o que já foi criado é informado ao
  aluno com o caminho, não some silenciosamente;
- **um único ponto de escrita no registry**, depois do setup estar íntegro em disco — nunca antes,
  para não criar entrada apontando para setup pela metade.

---

## 7. ⭐ Quando o aluno NÃO provê material teórico

O aluno tem o direito de chegar sem nada. A skill **gera** a base teórica — e o aluno tem o direito
igualmente forte de saber que foi ela quem escreveu, porque material gerado por LLM pode estar
errado, e um erro na *base teórica* contamina todas as aulas seguintes.

### 7.1 Ordem de fontes (da mais forte para a mais fraca)

| # | Fonte | `provenance` | Quando |
|---|---|---|---|
| 1 | material do aluno em `$SETUP_DOCS` | `student_provided` | sempre que existir — **soberano** |
| 2 | pesquisa web pela ferramenta do harness | `generated_researched` | quando a ferramenta está disponível na sessão |
| 3 | conhecimento do próprio modelo, sem fonte | `generated_unsourced` | último recurso |

A skill **nunca acessa a rede por conta própria** (convenção do projeto: nada de rede em runtime
exceto pela ferramenta de busca do harness). Se não há ferramenta de busca, ela não finge que
pesquisou — o material sai como `generated_unsourced` e o aviso diz isso com todas as letras.

### 7.2 Regra de precedência em conflito

Material do aluno **sempre vence** material gerado. E o conflito não é resolvido em silêncio: se a
base gerada diz uma coisa e o PDF do professor diz outra, o tutor **aponta o conflito** e segue pelo
material do aluno.

> "Sua apostila define continuidade por vizinhança e a base que eu gerei usa épsilon-delta. São
> equivalentes, mas vou seguir a sua apostila — é ela que vai cair na sua prova."

### 7.3 Onde é gravado

```
$SETUP_DOCS/generated/0001-<slug>.md
$SETUP_DOCS/generated/0002-<slug>.md
```

Três razões para ficar **dentro** do `docs/` do setup, e não em `researchs/`:

1. a ingestão da §8 já varre essa pasta — o material gerado vira contexto das próximas aulas sem
   nenhum mecanismo novo;
2. `researchs/` tem outra função (destilado de pesquisa sob demanda durante a aula, numerado à
   parte) e misturar as duas coisas destrói as duas;
3. um subdiretório separado mantém a raiz do `docs/` do setup **exclusiva do aluno** — o que ele
   colocou lá continua sendo dele, sem arquivo da skill no meio.

### 7.4 Como é marcado (três camadas, nenhuma opcional)

**Camada 1 — o caminho.** `generated/` no meio do path. Quem olha `ls` já sabe.

**Camada 2 — frontmatter** (chaves e valores em inglês snake_case, conforme o contrato do projeto):

```yaml
---
provenance: generated_researched      # ou generated_unsourced
generated_by: study-method
generated_at: 2026-08-23
subject: calculo-i
topic: limites
sources:
  - https://exemplo.org/pagina-consultada
verified_by_student: false
---
```

**Camada 3 — aviso em pt-BR, primeira linha do corpo**, para quem abre o arquivo sem ler
frontmatter:

```markdown
> **Material gerado por IA.** Não foi escrito nem revisado por um professor e pode conter erro.
> Use como rascunho de estudo e confira o que for crítico (definição formal, enunciado de teorema,
> valor numérico). Fontes consultadas: <lista, ou "nenhuma — escrito a partir do conhecimento do
> próprio modelo">.
```

**E a quarta, que é conversa, não arquivo**: toda vez que o tutor apoia uma explicação num arquivo
gerado, ele diz de onde veio.

> "Isso vem da base que eu mesmo escrevi, não do seu material — se destoar do que o professor
> passou, o professor ganha."

### 7.5 `verified_by_student`

Campo barato com valor alto. Quando o aluno confere um trecho contra a fonte oficial dele e diz
"isso está certo", a skill vira `verified_by_student: true` com `verified_at`. Efeitos:

- material verificado deixa de vir com o disclaimer conversacional a cada uso;
- material **não** verificado que já foi contestado uma vez ganha `disputed: true` e é rebaixado na
  seleção de seções da §8.5 (empate perde para material do aluno; contestado perde de todo mundo).

### 7.6 O que a base gerada contém (e o que ela não contém)

Escopo deliberadamente pequeno — ela é um **piso**, não um livro:

- definições formais dos conceitos do tópico;
- os 3 a 6 fatos/teoremas que a aula vai usar;
- notação e vocabulário, para o tutor e o aluno falarem a mesma língua;
- os erros clássicos do tópico (útil para a escada de dicas);
- uma lista curta de "o que eu não cobri" — honestidade sobre o recorte.

Não contém: exercícios resolvidos em massa, prova de teorema que a aula não vai usar, história do
assunto. Isso infla o material sem melhorar a aula, e infla o custo da ingestão da §8.

**Limite de tamanho**: a base gerada por tópico fica em **até 8 KB**. Motivo: ela é lida junto com
tudo o mais a cada sessão, e o orçamento total (§8.2) é de 80 KB. Uma base gerada que sozinha come
metade do orçamento sabota a leitura do material real do aluno.

---

## 8. A ingestão do `docs/` do setup, com orçamento

### 8.1 A tensão

O aluno pediu: "sempre ler o contexto de tudo que está lá". Isso é trivialmente certo quando são
três arquivos de anotação, e vira sabotagem quando ele joga um PDF de cálculo de 400 páginas na
pasta.

`research/02-memoria-llm.md` §2 é a razão de esta seção existir. Dois achados, ambos verificados:

- **Lost in the Middle** (Liu et al., TACL 2024): o desempenho segue uma curva em **U** — o modelo
  recupera bem o que está no início e no fim do contexto, e degrada no meio. Um capítulo relevante
  no meio de 400 páginas está exatamente na pior posição possível.
- **Context Rot** (Chroma, 2025): **os 18 modelos de fronteira testados pioram conforme o input
  cresce**, de forma não uniforme, e distratores compostos (muito material relacionado porém
  irrelevante) degradam mais do que um distrator só — efeito amplificado em contexto maior. Um livro
  inteiro é a definição de distrator composto.

A conclusão que interessa: **o risco não é estourar a janela.** É caber e mesmo assim o modelo
processar o meio de forma pouco confiável — **silenciosamente**. Um tutor que "leu" as 400 páginas e
não lembra do capítulo 7 não lança erro nenhum; ele só parece burro.

Por isso a resolução é orçamento explícito, e não janela maior.

### 8.2 O limite

```
DOCS_BUDGET_TOKENS = 20000        # default
DOCS_BUDGET_BYTES  = 80000        # ~80 KB, derivado
```

Sobre a conversão: não há tokenizador garantido na máquina (`tiktoken` **ausente** nesta máquina,
verificado; e `pip install` falha sem venv por PEP 668 — `/usr/lib/python3.14/EXTERNALLY-MANAGED`
existe). Então a medida operacional é **bytes**, com a aproximação de trabalho **1 token ≈ 4 bytes**.

Ela é um proxy, não uma medida, e o documento diz isso em vez de fingir precisão: texto em pt-BR com
acento custa mais bytes por caractere (UTF-8 multibyte), código e tabela custam mais tokens por byte.
Erro esperado na faixa de ±30%. Consequência prática: 80 KB é tratado como **ponto de virada de
modo**, não como "exatamente 20k tokens". Errar para o lado conservador (entrar em modo manifesto
cedo demais) custa uma frase de declaração; errar para o outro lado custa a qualidade da aula.

### 8.3 O que conta como ingerível

| Extensão | Tratamento | Custo contado |
|---|---|---|
| `.md` `.markdown` `.txt` `.rst` `.org` `.tex` | texto direto | bytes do arquivo |
| `.pdf` | extração (§8.6) | bytes do **texto extraído**, não do PDF |
| `.ipynb` | JSON: extrai células markdown e código, descarta outputs | bytes extraídos |
| `.csv` `.tsv` | só o cabeçalho + 5 linhas de amostra entram; o arquivo inteiro nunca | bytes da amostra |
| `.docx` `.odt` `.epub` | via `pandoc` **se existir**; senão, não ingerível | bytes extraídos |
| `.png` `.jpg` `.svg` | não ingerível por este caminho — declarado ao aluno | 0 |
| binário / desconhecido | não ingerível — declarado | 0 |

**Nunca** se assume que um extrator existe (antipadrão documentado em `research/01-agent-skills.md` §7:
"assumir que uma ferramenta/pacote está instalado"). Tudo é `command -v` antes de usar.

Guardas duras, independentes do orçamento em bytes:
- arquivo único com mais de **5 MB de texto extraído** → modo manifesto, sempre;
- mais de **200 arquivos** em `$SETUP_DOCS` → modo manifesto, sempre (o custo de listar já pesa);
- symlink que aponta para fora de `$SETUP_ROOT` → não segue, e declara. (Superfície de segurança;
  a política completa é da sub-tarefa 2.8.)

### 8.4 Abaixo do limite → lê tudo

Sem sutileza: lê os arquivos inteiros, na ordem raiz do `docs/` do setup antes de
`generated/` (material do aluno primeiro — posição inicial é a posição forte da curva em U).
Anuncia em uma linha. Grava o manifesto derivado mesmo assim, porque na próxima sessão ele permite
detectar mudança sem reler nada.

### 8.5 Acima do limite → modo manifesto

**Passo 1 — manifesto.** `docs-index.sh` gera `$SETUP_CTL/cache/docs-manifest.json`:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-23T01:12:00-03:00",
  "budget_bytes": 80000,
  "docs_root": "$SETUP_DOCS",
  "total_ingestible_bytes": 1840233,
  "mode": "manifest",
  "files": [
    {
      "path": "stewart-cap3.md",
      "provenance": "student_provided",
      "bytes": 412884,
      "sha256": "9f2c1ab4d0e7...",
      "mtime": "2026-08-10T14:03:11-03:00",
      "kind": "text",
      "sections": [
        { "heading": "3.1 Definição informal de limite", "level": 2, "offset": 0,     "bytes": 18422 },
        { "heading": "3.2 Limites laterais",             "level": 2, "offset": 18422, "bytes": 22110 }
      ]
    },
    {
      "path": "calculo-stewart.pdf",
      "provenance": "student_provided",
      "bytes": 41203994,
      "sha256": "1cc90ff2...",
      "kind": "pdf",
      "pages": 1368,
      "extracted_text_bytes": 3980221,
      "extract_cache": "$SETUP_CTL/cache/docs-text/1cc90ff2.txt",
      "sections": [
        { "heading": "Capítulo 3 — Limites", "page_from": 121, "page_to": 190, "bytes": 210044 }
      ]
    }
  ],
  "not_ingested": [
    { "path": "slides-aula1.pptx", "reason": "formato sem extrator disponível" }
  ]
}
```

Todo `path` do manifesto é **relativo a `docs_root`** — o manifesto descreve uma pasta só, e
caminho relativo sobrevive ao aluno mover o setup de lugar.

**Passo 2 — como as seções são descobertas.**

- **Markdown / texto**: linhas que casam `^#{1,6} `. Para `.txt` sem markdown, também contam como
  cabeçalho: linha numerada (`^[0-9]+(\.[0-9]+)*\s+\S`), linha seguida de `===`/`---`, e linha curta
  toda em maiúsculas. Offsets são gravados em **bytes**, obtidos com `LC_ALL=C awk` — sem
  `LC_ALL=C`, o `length()` do awk conta caracteres e o offset erra em todo texto acentuado
  (verificado nesta máquina: mesmo arquivo, offset 21 com locale UTF-8 e 23 — correto — com
  `LC_ALL=C`). Isso importa porque o carregamento seletivo usa o offset para pular direto ao trecho.
- **PDF**: a unidade é o **intervalo de páginas**, não o heading — `pdftotext` não expõe a árvore de
  bookmarks, e `pdfinfo -struct` só funciona em PDF marcado. O mapa vem de duas fontes: o sumário do
  próprio livro, quando ele é texto (quase sempre nas primeiras páginas — extraídas primeiro
  justamente por isso), e a contagem de páginas via `pdfinfo`. Extração de faixa:
  `pdftotext -layout -f 121 -l 190 arquivo.pdf -` (verificado nesta máquina).

**Passo 3 — seleção por relevância ao tópico da aula.**

```
score(secao) = 3 * (termos do tópico no heading)
             + 1 * min(ocorrências dos termos no corpo, 10)
             + 2 se a seção foi usada em alguma das últimas 3 sessões (memory/INDEX.json)
             - 1 se provenance começa com "generated"     # material do aluno ganha empate
             - 5 se disputed == true                       # §7.5
```

Os "termos do tópico" saem de três lugares, nesta ordem: o que o aluno acabou de pedir nesta sessão,
`next_topic` da última sessão fechada, e `subject` do manifesto do setup.

**Passo 4 — o que entra.**

1. Sempre: o **sumário do `docs/` do setup inteiro** (todos os headings de todos os arquivos, sem
   corpo). Custa 1-3 KB e é o que impede o tutor de negar a existência de algo que está na pasta.
2. Seções por score decrescente, até consumir **60% do orçamento** (48 KB). Os 40% restantes ficam
   para a aula em si — memória, digest, conversa. Carregar material até encher o contexto é a mesma
   armadilha da §8.1, um nível acima.
3. Sempre em **seções inteiras**. Nunca uma janela de bytes cortando no meio da frase: melhor uma
   seção a menos e íntegra do que duas pela metade.

**Passo 5 — declarar.** Obrigatório, sempre, em uma frase:

> "Carreguei o capítulo 3 (limites) e a seção 4.1 do seu material. Ficaram de fora: capítulos 1-2,
> 5 a 12 e os apêndices — se a gente esbarrar em algum, é só pedir que eu abro na hora."

Regra explícita: **nunca dizer "li seu material" quando leu 4%.** A frase honesta é sempre mais
curta que a consequência de o aluno descobrir sozinho.

**Passo 6 — abrir sob demanda.** Se durante a aula o tópico virar para algo que ficou de fora, a
skill abre aquela seção na hora (o manifesto já tem offset ou faixa de páginas — é uma leitura
direta, sem reescanear nada) e avisa em quatro palavras: "abri a seção 7.2 aqui".

### 8.6 PDF: o caso que não pode ser ignorado

Não há garantia nenhuma de extrator instalado. A cadeia de detecção, em ordem:

```
1. command -v pdftotext        (poppler; presente nesta máquina, versão 26.07.0)
2. python3 -c "import pypdf"   (ausente nesta máquina)
3. python3 -c "import fitz"    (PyMuPDF; ausente nesta máquina)
4. nenhum -> não ingerível, e o aluno é avisado (B-20)
```

Detalhes verificados nesta máquina, que a implementação pode usar:
- `pdftotext` emite **um form feed (`\x0c`) por página** — testado com PDF de 1 página (1 FF) e de
  2 páginas (2 FFs, unidos com `pdfunite`), batendo com `pdfinfo | Pages:`. Isso dá o mapa
  offset → página de graça, e permite citar "página 143" em vez de "em algum lugar do PDF";
- `pdftotext -layout -f N -l M arquivo.pdf -` extrai só a faixa de páginas, para stdout;
- `pdfinfo arquivo.pdf` dá o número de páginas sem extrair nada — é a estimativa de custo barata,
  antes de decidir extrair.

**Cache de extração.** O texto extraído vai para
`$SETUP_CTL/cache/docs-text/<sha256-do-pdf>.txt`. Um livro de 1300 páginas é extraído **uma vez**;
nas sessões seguintes, se o sha256 bate, reusa. O cache é derivado: apagar não perde nada.

**Quando não há extrator**, a skill não engole o problema nem propõe magia. Três saídas concretas,
e ela **sugere** o comando sem nunca executá-lo (instalar pacote é decisão do dono da máquina):

1. "instala o poppler (`sudo pacman -S poppler` no Arch, `sudo apt install poppler-utils` no Debian)
   e me fala — eu releio na hora";
2. "exporta pra `.txt` ou `.md` e joga na pasta";
3. "me conta em três linhas o que tem nele e eu escrevo a base a partir disso — marcada como gerada".

**PDF que é imagem escaneada** (extração devolve ~0 byte de texto útil para um arquivo de muitas
páginas): a skill detecta pela razão `extracted_text_bytes / pages` absurdamente baixa (< 100 bytes
por página) e diz o que é, em vez de reportar "PDF vazio":

> "Esse PDF é escaneado — são imagens de página, não texto. Sem OCR eu não leio. Tem versão em texto
> dele?"

### 8.7 Invalidação de cache

Barato antes de caro: compara **tamanho + mtime** de cada arquivo com o manifesto; só calcula
`sha256` quando algum dos dois muda. Regenera **só as entradas afetadas**. Rebuild completo apenas
quando `schema_version` do manifesto muda. Arquivo novo na pasta entra; arquivo sumido sai e é
anunciado ("o `notas-aula2.md` não está mais aí").

---

## 9. Retomada: o aluno volta depois de duas semanas

Mesma árvore, folhas diferentes. O que muda em relação à primeira vez:

| Aspecto | Primeira vez | Retomada |
|---|---|---|
| Entrevista | 6 perguntas + confirmação | **nenhuma** — o manifesto do setup já tem tudo |
| Estrutura | criada e anunciada | assumida, silenciosa |
| Memória | `memory/` vazia (B-14) | `INDEX.json` + `profile.json` + digest por código (B-15) |
| `docs/` do setup | ingestão completa | **só o delta** — tamanho+mtime, hash só no que mudou (§8.7) |
| Abertura | roteiro proposto | gancho no que ficou pendente |
| Sessão órfã | impossível | provável (§10) |

**Detecção de material novo.** Se apareceram arquivos desde a última vez, isso é notícia boa e é
dita:

> "Vi que você jogou dois arquivos novos no material (`prova-2023.pdf`, `resumo-limites.md`). Li os
> dois."

**O gap importa pedagogicamente.** Duas semanas sem estudar não é o mesmo que dois dias, e a
abertura muda:

- **até ~7 dias**: retoma direto no ponto de parada;
- **8 a 30 dias**: abre com uma **pergunta de calibração**, nunca com uma afirmação sobre o aluno.
  Isso vem direto de `research/02-memoria-llm.md` §7 (ancoragem excessiva no perfil antigo: um rótulo nunca
  reavaliado vira profecia autorrealizável). O digest expõe `needs_reconfirmation: true` nos fatos
  cujo `last_observed_at` está velho, e o tutor pergunta em vez de assumir:

  > "Faz duas semanas. A gente parou em limites laterais, e da última vez a definição formal estava
  > meio escorregadia. Ainda está, ou você mexeu nisso nesse meio tempo?"

- **acima de ~30 dias**: oferece 3 minutos de recuperação ativa antes de conteúdo novo — não uma
  revisão expositiva, mas duas ou três perguntas de recall, que é o que a literatura de espaçamento
  sustenta (`research/03-pedagogia.md` §4 e §7). A escolha é do aluno: "quer 3 minutos de aquecimento ou
  prefere ir direto?"

**O que não muda**: a regra de declarar o que ficou de fora da ingestão (§8.5, passo 5) vale toda
sessão, não só na primeira. O aluno não precisa lembrar do que a skill disse duas semanas atrás.

---

## 10. Sessão órfã (B-16)

O modo de falha **mais provável** em uso real: o aluno fecha o terminal no meio da aula, e a última
sessão fica com `status: in_progress`.

Detecção: a sessão de maior número em `$SETUP_MEM` com `status: in_progress`. É determinística e
barata (o índice já carrega `status`).

Nunca resolvida em silêncio, porque as três saídas têm consequências pedagógicas diferentes e só o
aluno sabe qual aconteceu. Menu curto, com a informação que permite escolher:

> "A sessão de terça (0018) ficou aberta — a gente estava em derivada de função composta e parou no
> meio. Retomo dali, fecho ela como está e começo uma nova, ou jogo fora (não tinha muita coisa)?"

| Resposta | O que faz | O que grava |
|---|---|---|
| **retomar** | continua a `0018`, sem abrir sessão nova | `resumed_at` na `0018` |
| **fechar como está** | roda o fechamento normal sobre o que existe (resumo, índice, perfil) e abre `0019` | `0018` vira `status: closed` + `closed_by: recovery`; `0019` nova |
| **descartar** | move para `$SETUP_MEM/discarded/0018.json` — **nunca apaga** | arquivo movido + nota no índice |

Regra de "descartar": mover, não deletar. Apagar dado do aluno por engano é irreversível; mover é
reversível em um comando. (Apagamento **de verdade** existe, mas é operação distinta e explícita —
o pedido de exclusão do próprio aluno, domínio da sub-tarefa 2.8.)

Se a sessão órfã não tiver conteúdo nenhum (aberta e abandonada sem uma troca sequer), a skill não
pergunta: descarta sozinha e menciona em quatro palavras. Perguntar sobre um arquivo vazio é
burocracia.

> Coordenação: esta folha provavelmente colide com uma decisão `D-M` da sub-tarefa 2.2 (memória).
> Está registrada aqui como **D-B06** de qualquer forma; a sub-tarefa 3.0 deduplica.

---

## 11. Nomes de passo propostos (reconciliar com a sub-tarefa 2.1)

A máquina de estados da sessão em 9 passos é definida por `01-arquitetura.md` (sub-tarefa 2.1), que
roda em paralelo com este documento. **2.1 é a autoridade sobre os nomes.** Este documento é dono
dos primeiros passos e propõe o seguinte, para facilitar a reconciliação:

| # | Nome proposto | O que faz | Seção aqui |
|---|---|---|---|
| 1 | `resolve_target` | decide de qual setup estamos falando: argumento > corrente/ancestral > registry | §3, §4.1 A–C |
| 2 | `verify_setup` | valida, repara o reparável, diagnostica o resto; classifica em `valid`/`incomplete`/`corrupt`/`candidate`/`none` | §3.1, folhas B-04 a B-09 |
| 3 | `bootstrap_or_ask` | a parada obrigatória, a entrevista e a criação — **só executa quando não há setup** | §5, §6 |
| 4 | `load_memory` | `INDEX.json` + `profile.json` + digest determinístico + tratamento de sessão órfã | B-14, B-15, §10 |
| 5 | `ingest_docs` | ingestão do `docs/` do setup dentro do orçamento, com manifesto e declaração | §8 |
| 6 | `open_session` | cria `memory/NNNN.json` com `status: in_progress` e anuncia o plano da aula | §12 |

Os passos 7 a 9 (o ciclo de ensino, o ciclo de desafio e o fechamento) não são deste documento;
nomes plausíveis para eles, sem nenhuma pretensão de autoridade: `teach_loop`, `challenge_cycle`,
`close_session`.

Nota de projeto: os passos 3 e 5 são **condicionais**, não sequenciais-obrigatórios. Numa retomada
normal o passo 3 não roda de forma alguma. Se 2.1 modelar os 9 passos como sequência estrita, esse
detalhe precisa aparecer no diagrama — senão a implementação lê "sempre pergunte" e o requisito R3
vira uma pergunta em toda sessão, que é o oposto do que o aluno pediu.

---

## 12. O que o bootstrap grava, ao todo

| Arquivo | Quando | Quem escreve |
|---|---|---|
| `$SETUP_ROOT/{docs,memory,researchs,challenges}/` | criação (B-13a) e reparo (B-06, B-19) | `setup-init.sh` |
| `$SETUP_ROOT/README.md` | criação e reparo | `setup-init.sh` (template) |
| `$MANIFEST` | criação, adoção (B-08), reparo (B-07 opção 1) | `setup-init.sh` |
| `$REGISTRY` | depois de o setup estar íntegro; e `last_used_at` a cada abertura | `setup-init.sh` / `setup-list.sh` |
| `$SETUP_CTL/cache/docs-manifest.json` | toda ingestão | `docs-index.sh` |
| `$SETUP_CTL/cache/docs-text/<sha>.txt` | primeira extração de cada PDF | `docs-index.sh` |
| `$SETUP_DOCS/generated/NNNN-<slug>.md` | `theory_source: generated` | passo 5 da §6.5 |
| `memory/NNNN.json` | passo `open_session` | `session-new.sh` |

Tudo em `$SETUP_CTL/cache/` é **derivado e descartável**: apagar a pasta inteira custa uma
reingestão, nunca dado do aluno. Isso é o que torna seguro regenerar sem perguntar.

---

## 13. Contagem de folhas (verificação de completude)

25 folhas nomeadas (B-01 a B-25), mais 6 respostas da parada obrigatória (§5.3, A a F) e 3 respostas
do menu de sessão órfã (§10). Nenhuma delas termina sem: uma ação definida, uma fala ao aluno e uma
declaração explícita do que grava (inclusive "grava: nada").

Casos-limite conferidos, cada um com destino:

| Caso | Destino |
|---|---|
| primeira invocação absoluta, máquina limpa | B-23 → B-13 |
| aluno diz "não" à criação | B-13 resposta B → modo efêmero |
| aluno ignora a pergunta e pede conteúdo | B-13 resposta D → responde primeiro, reoferece uma vez |
| aluno some sem responder | B-13 resposta E → nada gravado, nada a limpar |
| setup existe, `docs/` do setup vazio | B-18 |
| setup existe, `docs/` do setup apagado | B-19 → B-18 |
| setup existe, `memory/` vazia | B-14 |
| setup existe, `INDEX.json` sumiu | B-15 (reconstrói) |
| sessão órfã | B-16 |
| PDF gigante, sem extrator | B-20 |
| PDF gigante, com extrator | B-21 |
| PDF escaneado (sem texto) | B-20 via §8.6 |
| manifesto do setup corrompido | B-07 |
| registry corrompido | B-24 |
| registry apontando para pasta que sumiu | B-12 |
| `STUDY_METHOD_HOME` não gravável | B-25 |
| setup em disco somente-leitura | B-22 |
| dois ou mais setups registrados | B-11 |
| aluno passa caminho que não existe | B-02 |
| aluno passa caminho de um projeto de trabalho | B-03 |
| pasta parece setup mas sem manifesto | B-08 |
| invocação de dentro de `challenges/x/` | B-05 |

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-B01 | Quanto material teórico eu leio por sessão antes de passar a carregar só as partes relevantes? | 10k tokens (~40 KB) · 20k (~80 KB) · 40k (~160 KB) · sempre tudo, sem limite | 20k tokens (~80 KB) | cheap |
| D-B02 | Quando você não tem material, eu escrevo uma base teórica inicial? | sim, pesquisando na web quando der · sim, só do meu conhecimento · me pergunte toda vez · nunca | me pergunte toda vez (menu de B-18) | cheap |
| D-B03 | Quantas perguntas na criação do setup? | as 6 mínimas + confirmação · só o assunto e o resto no default · entrevista longa com todas as decisões | 6 + confirmação, com atalho de 2 trocas | cheap |
| D-B04 | Onde eu crio o setup por padrão? | na pasta atual · em `~/estudos/<assunto>` · sempre perguntar | pasta atual se vazia, senão `~/estudos/<assunto>` | moderate |
| D-B05 | Em que idioma o setup é escrito? | pt-BR fixo · o idioma da nossa conversa · perguntar | idioma da conversa | cheap |
| D-B06 | O que fazer com uma sessão que ficou aberta da vez anterior? | perguntar · retomar automático · fechar automático · descartar automático | perguntar (menu de 3) | cheap |
| D-B07 | Quando você roda a skill fora de uma pasta de estudo e existe um setup só, eu abro ele direto? | abro e aviso · sempre pergunto | abro e aviso, com escape na mesma frase | cheap |
| D-B08 | Onde fica o material que eu gero? | em `generated/` dentro do `docs/` do setup · em `researchs/` · fora do setup | `generated/` dentro do `docs/` do setup | moderate |
| D-B09 | Se não houver extrator de PDF na máquina, o que eu faço? | sugiro o comando de instalação (sem rodar) · nunca menciono instalação · trato o PDF como inexistente | sugiro o comando, nunca executo | cheap |
| D-B10 | Onde fica o arquivo de controle do setup? | `.study-method/manifest.json` (oculto) · `setup.json` (visível na raiz) | `.study-method/manifest.json` — **autoridade: sub-tarefa 2.1** | moderate |
| D-B11 | Até que profundidade eu varro o `docs/` do setup? | só a raiz · 2 níveis · recursivo com teto de 200 arquivos | recursivo, teto de 200 arquivos | cheap |
| D-B12 | Que fatia do orçamento o material pode ocupar, deixando o resto para a aula? | 40% · 60% · 80% | 60% para o material, 40% para a aula | cheap |
