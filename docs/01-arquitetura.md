# 01 — Arquitetura: topologia, camadas de memória e a máquina de estados da sessão

Documento normativo. Quem lê isto na onda 3 escreve shell script — então cada afirmação aqui
nomeia arquivo, campo, comando ou condição. Onde uma escolha foi minha e o usuário deveria
opinar, ela está registrada na tabela final (`D-A**`).

Terminologia congelada usada em todo o repositório: escreve-se sempre **`docs/` do repositório**
(este diretório, onde vivem os documentos de projeto) ou **`docs/` do setup** (a teoria que o
aluno colocou dentro do diretório de estudo). Idem para **`README.md` do repositório** e
**`README.md` do setup**. Nunca a forma nua.

---

## 1. Três coisas diferentes com nomes parecidos

| Entidade | O que é | Onde vive | Quem escreve |
|---|---|---|---|
| **Repositório** | O projeto de engenharia: pesquisa, documentos de arquitetura, código da skill, testes, exemplos. | `/home/ondokai/Projects/study-method` (ou o clone do usuário) | Desenvolvedores do projeto |
| **Skill instalada** | O artefato que o harness carrega: `SKILL.md` + `references/` + `scripts/` + `assets/`. É código + instrução, **nunca** dado de aluno. | `~/.claude/skills/study-method/` (pessoal) ou `<projeto>/.claude/skills/study-method/`. No repositório ela mora em `skills/study-method/`, doravante **SK/**. | Desenvolvedores; instalada por cópia/symlink |
| **Setup** | O diretório de estudo de **um assunto** (ex.: Cálculo I). É o dado do aluno: teoria, memória, destilados, desafios. | Qualquer lugar do disco escolhido pelo aluno. Não precisa estar dentro do repositório nem perto da skill. | A skill (em runtime) e o aluno |

O nome do diretório `skills/study-method/` **deve** ser idêntico ao campo `name` do frontmatter
do `SKILL.md` — no padrão aberto o `name` tem que bater com o diretório-pai, e no Claude Code é o
nome do diretório que vira o comando `/study-method`
(`docs/research/01-agent-skills.md` do repositório, §1.1 e §5.2).

Um aluno tem **N setups** e **uma** skill instalada. A ponte entre eles é o registry global —
detalhado em `docs/07-multi-setup.md` do repositório.

### 1.1 Topologia

```mermaid
graph TD
  subgraph HARNESS["Harness (Claude Code / outro cliente do padrão)"]
    SK["Skill instalada: study-method/<br/>SKILL.md · references/ · scripts/ · assets/"]
  end

  REG["Registry global<br/>${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/registry.json"]

  subgraph S1["Setup A — ~/estudos/calculo"]
    A0["setup.json (manifesto)"]
    A1["README.md do setup (nó de grafo)"]
    A2["docs/ do setup — teoria do aluno"]
    A3["memory/ — episódico + derivados"]
    A4["researchs/ — semântico destilado"]
    A5["challenges/ — procedimental"]
  end

  subgraph S2["Setup B — ~/estudos/algebra-linear"]
    B1["README.md do setup"]
    B2["... mesma estrutura"]
  end

  SK -->|lê e escreve| REG
  REG -->|path + setup_id| S1
  REG -->|path + setup_id| S2
  SK -->|abre 1 por sessão| S1
  A1 -.->|leitura cruzada: só o README.md do setup| B1
```

### 1.2 Árvore de um setup (contrato fixo — nomes ditados pelo usuário, preservados)

```
<setup_root>/
├── setup.json              # manifesto: identidade, assunto, linguagem, decisions (schema desta sub-tarefa)
├── README.md               # o README.md do setup — nó do grafo de conhecimento (docs/07-multi-setup.md do repositório)
├── docs/                   # o docs/ do setup: teoria que O ALUNO forneceu. A skill só escreve em docs/generated/
├── memory/
│   ├── 0001.json           # sessão episódica, 4 dígitos zero-padded
│   ├── 0002.json
│   ├── INDEX.json          # índice incremental (schema: sub-tarefa 2.2)
│   ├── profile.json        # perfil semântico consolidado, bitemporal (sub-tarefa 2.2)
│   ├── progress.json       # proficiência por conceito + agenda de revisão (sub-tarefa 2.3)
│   ├── docs-index.json     # índice do docs/ do setup, cache derivado (sub-tarefa 2.7)
│   ├── .session.lock       # lock da sessão viva: JSON {pid, hostname, session_id, started_at}
│   ├── .cache/             # derivados descartáveis (ex.: docs-text/<sha>.txt do PDF extraído)
│   └── broken/             # quarentena de arquivos que não parseiam — nunca apagar
├── researchs/
│   ├── 0001.md             # destilado semântico
│   └── assets/             # SVG/HTML gerados pelas visualizações (sub-tarefa 2.6)
└── challenges/
    └── <NNNN>-<slug>/      # numerado como as sessões: 0007-derivada-numerica/
        ├── meta.json       # metadados do desafio (NÃO yaml — sub-tarefa 2.5)
        ├── README.md       # enunciado (é o README.md do desafio, não o README.md do setup)
        ├── stub.<ext>      # o que o aluno preenche
        ├── tests/          # teste validado — o aluno não edita
        ├── .solution/      # referência oculta — com ponto, para sumir do `ls` do aluno
        └── runner.sh       # normaliza exit code (regra != 0, docs/research/06-toolchains.md do repositório §5)
```

**A árvore de `challenges/<NNNN>-<slug>/` acima é conceitual.** Rust, Go e Java a quebram por regra de
linguagem (`docs/research/06-toolchains.md` do repositório §6.1/§6.2, verificado por execução);
`challenge-new.sh` materializa uma árvore adaptada por linguagem. Isso é contrato da sub-tarefa 2.5/3.5.

---

## 2. As quatro camadas de memória

A separação não é organizacional, é funcional: cada camada tem uma **origem de verdade**, um
**ciclo de escrita** e um **modo de falha** diferentes. Misturá-las é o que produz o tutor que
"esqueceu" — a taxonomia é a de CoALA (`docs/research/02-memoria-llm.md` do repositório §1).

| Camada | Tipo (CoALA) | Origem da verdade | Quem escreve | Quando é lida |
|---|---|---|---|---|
| `docs/` do setup | Conhecimento apriorístico | **O aluno** | O aluno. A skill é read-only aqui, com **uma** exceção nomeada: `<docs-do-setup>/generated/` (§2.1) | Passo `load_docs`, sob orçamento de tokens |
| `memory/` | Episódica + derivados | A sessão que aconteceu | `session-new.sh`, `session-close.sh`, `memory-*.sh`, `progress-update.sh` | Passo `load_memory`, via digest determinístico |
| `researchs/` | Semântica destilada | O fato, independente de quem o aprendeu | `research-new.sh` + o agente | Passos `teach` e `plan_lesson`, por tópico |
| `challenges/` | Procedimental | A prática validada por execução | `challenge-new.sh`, `challenge-verify.sh` | Passo `challenge` |

### 2.1 `docs/` do setup — o que vai e o que nunca vai

- **Vai**: PDF convertido, notas de aula, capítulo de livro, lista de exercícios, ementa — qualquer
  material teórico que o aluno trouxe. Formato livre (`.md`, `.txt`, `.pdf`, `.html`).
- **NUNCA vai na raiz**: nada gerado pela skill. Nem destilado, nem resumo de sessão, nem gráfico.
  A raiz do `docs/` do setup é do aluno; se a skill escrever ali, ela passa a "aprender de si mesma"
  e o material do aluno deixa de ser o chão firme da aula.
- **Regra permanente, com uma exceção nomeada e única**: a skill trata o `docs/` do setup como
  read-only, **exceto** o subdiretório `<docs-do-setup>/generated/`, único caminho em que ela pode
  escrever — e só teoria gerada, sempre marcada como tal em três camadas (o próprio caminho
  `generated/`, `provenance: generated_researched|generated_unsourced` no frontmatter e o aviso em
  pt-BR na primeira linha do corpo; `docs/10-bootstrap.md` do repositório §7). Qualquer script da
  onda 3 que abra para escrita um caminho do `docs/` do setup **fora** de `generated/` é bug de
  gate. Material do aluno vence material gerado em qualquer conflito, e o conflito é dito em voz
  alta, nunca resolvido em silêncio.
- Vazio é estado legítimo, não erro: o tutor declara em voz alta que vai ensinar sem base local
  e grava `docs_coverage: "none"` na sessão.

### 2.2 `memory/` — o que vai e o que nunca vai

- **Vai**: `NNNN.json` (o que aconteceu na sessão: tópicos, tentativas, nível de dica, tipo de erro,
  afeto, o que funcionou, pendências) e os **derivados mantidos por máquina** (`INDEX.json`,
  `profile.json`, `progress.json`, `docs-index.json`).
- **NUNCA vai**: transcrição literal da conversa; conteúdo teórico (isso é `researchs/`); enunciado de
  desafio (isso é `challenges/`); dado pessoal sem função pedagógica — contexto familiar, saúde,
  nome de terceiros, geolocalização, identificador de dispositivo
  (`docs/research/02-memoria-llm.md` do repositório §8; a política completa é da sub-tarefa 2.8).
- **Fato semântico nunca é sobrescrito**: em `profile.json`, um fato que mudou vira um registro novo
  com `supersedes`, e o antigo recebe `status: "superseded"` + `superseded_by`. Isso é o que impede
  a ancoragem no perfil velho do aluno (`docs/research/02-memoria-llm.md` do repositório §5 e §7).
- Apagamento físico (pedido explícito de esquecimento) é operação **separada e auditável**, nunca o
  caminho de supersede — sub-tarefa 2.8.

### 2.3 `researchs/` — o que vai e o que nunca vai

- **Vai**: o fato destilado e atemporal — definição, axioma, teorema com condição de validade,
  fórmula, snippet mínimo executável, contraexemplo, armadilha. Densidade máxima, zero verbosidade.
- **NUNCA vai**: narrativa de sessão ("hoje o aluno travou em..."), estado afetivo, nota de
  desempenho, data da aula. Se um parágrafo só faz sentido sabendo *quando* foi escrito, ele é
  episódico e pertence a `memory/`.
- **Proveniência obrigatória**: `researchs/NNNN.md` começa com um bloco de metadados legível por
  `jq` (não YAML — não há PyYAML nesta máquina, `TASK_PLAN` C7):

  ```
  <!-- study-method:meta {"schema_version":"1.0","research_id":"0001","topic":"limites",
       "sources":["docs/derivadas-cap2.md"],"created_in_session":"0007","status":"active"} -->
  ```

  `sources[]` aponta para caminhos **relativos à raiz do setup**, dentro do `docs/` do setup.
  Destilado sem fonte local é permitido (o tutor pode ensinar do próprio conhecimento), mas então
  `sources` é `[]` e isso é dito ao aluno.
- Um destilado que envelheceu não é editado no lugar: novo `NNNN.md` com `supersedes`, o antigo
  vira `status: "superseded"` — mesma disciplina bitemporal de `profile.json`.

### 2.4 `challenges/` — o que vai e o que nunca vai

- **Vai**: `meta.json`, enunciado, stub, testes validados, solução de referência oculta, `runner.sh`.
- **NUNCA vai**: o histórico de tentativas do aluno (isso é evidência episódica → `memory/NNNN.json`
  e `memory/progress.json`); nem um teste que não passou pelo gate de execução.
- **Regra dura, permanente**: desafio com `challenge_status != "validated"` **não chega ao aluno**.
  O gate é execução determinística (`challenge-verify.sh`), nunca uma segunda opinião de LLM
  (`docs/research/04-tdd-actor-critic.md` do repositório §3; `TASK_PLAN` C5).

---

## 3. ⭐ A máquina de estados normativa da sessão

Nove passos nomeados. **Os nomes são estáveis e são a interface entre esta sub-tarefa e todas as
outras**: o `SKILL.md`, as `references/` e os scripts referenciam estes identificadores.

**Dois passos são CONDICIONAIS e estão marcados no diagrama com `(cond.)`:** `setup_interview` só
roda quando não há setup em lugar nenhum, e `load_docs` só roda quando há `docs/` do setup a ler.
Isto não é detalhe de implementação: ler os nove como fila obrigatória faz a skill perguntar "quer
criar um setup?" em toda sessão — o oposto do que o usuário pediu. No caso mais comum do sistema (a
retomada), `setup_interview` não roda de forma alguma.

```
bootstrap ──(setup ok)──────────────► load_memory ──► load_docs ──► open_session ──► plan_lesson ──┐
    │                                                  (cond.)                                      │
    │                                       ▲                                                       │
    └──(setup ausente)──► setup_interview ──┘                                                       │
                             (cond.)                                                                │
                                │                                                     ┌─────────────┘
                                └──(aluno recusa)──► FIM (nada gravado)               ▼
                                                                          teach ◄──────► challenge
                                                                            │              │
                                                                            └──────┬───────┘
                                                                                   ▼
                                                                            close_session ──► FIM
```

Convenção de código de saída para **todos** os scripts de `SK/scripts/` (contrato para a onda 3):

| Código | Significado |
|---|---|
| 0 | sucesso |
| 1 | erro de execução (I/O, permissão, dependência ausente) |
| 2 | uso incorreto (argumento faltando/ inválido) |
| 3 | setup não encontrado / manifesto ausente ou ilegível |
| 4 | recurso travado (lock vivo: sessão concorrente, registry ocupado) |
| 5 | validação de schema falhou |
| 10 | `needs_model_input` — o script precisa de julgamento do modelo (§3.1) |

Duas exceções **nomeadas**, e são as únicas: o `runner.sh` gerado dentro de
`challenges/<NNNN>-<slug>/` e o `render-plot.py` (3.7) não são scripts de `SK/scripts/` e usam a
convenção reduzida `0/1/2/3`.

Nenhum passo aborta a sessão inteira por erro de camada derivada — mas "derivado" não quer dizer
"gratuitamente reconstruível":

| Derivado | Reconstruível a partir dos `NNNN.json`? |
|---|---|
| `memory/INDEX.json` | **Sim**, integralmente (tabela de derivação em `docs/03-memoria.md` do repositório §2.1). |
| `README.md` do setup | **Sim**, o interior dos marcadores; a prosa do aluno fora deles não é derivada. |
| `memory/docs-index.json` | **Sim**, reescaneando o `docs/` do setup. |
| `memory/progress.json` | **NÃO.** Ele carrega `error_type`, `hint_level` e `transition_rule`, que **não existem** em `session.schema.json`. Perder este arquivo é perda real de estado. |
| `memory/profile.json` | **Não byte a byte.** Só re-derivável rodando a compactação de novo sobre todos os brutos — operação de modelo, não determinística. |

Consequência direta, e é contrato: **toda escrita de derivado é atômica** — grava em
`<arquivo>.tmp.$$` no mesmo diretório e `mv -f` por cima. Vale para `INDEX.json`, `profile.json`,
`progress.json`, `docs-index.json`, o `README.md` do setup, o `setup.json` e o registry. Sem
exceção: um `progress.json` truncado por queda de energia no meio de um `>` não tem de onde voltar.

### 3.1 Protocolo REQUEST/APPLY — como um script pede julgamento ao modelo

Shell script não conversa com modelo. Sempre que um passo precisar de uma decisão que só o modelo
pode tomar — revalidar um campo que faltou, escolher quais seções do `docs/` do setup entram no
orçamento, nomear um conceito consolidado —, o caminho é **um só**, e nenhum documento deste
projeto pode dizer "o script pergunta ao modelo" fora dele:

1. o script roda **até onde é determinístico**;
2. ao esbarrar no julgamento, escreve um **JSON de PEDIDO em stdout** e sai com **exit 10**
   (`needs_model_input`), **sem alterar nada em disco**;
3. o **modelo** lê o pedido, produz o **JSON de RESPOSTA** e o grava em um arquivo temporário;
4. o modelo **re-invoca o mesmo script** com `--apply <resposta.json>`;
5. o script **valida** a resposta contra o schema daquele pedido e só então aplica, atomicamente.
   Resposta inválida → **exit 5**, nada aplicado, nada corrompido.

⚑ **Os quatro `kind` são estes, e os nomes de arquivo são derivados do script, não do pedido.**
As grafias `session_close_fields`, `docs_section_pick` e `profile_compaction` — e os arquivos
`session-close-fields.*`, `docs-section-pick.*`, `profile-compaction.*` — **estão revogadas e
nunca existiram em disco**. A autoridade é `docs/00-contratos.md` §6.4/§6.5.

| `kind` (envelope) | Emitido por | Schemas (`SK/assets/schemas/requests/`) | Para quê |
|---|---|---|---|
| `fill_session_fields` | `session-close.sh` | `session-close.request.schema.json` · `session-close.response.schema.json` | preencher os campos obrigatórios que faltaram na validação do `NNNN.json` |
| `select_sections` | `docs-index.sh --select` | `docs-index.request.schema.json` · `docs-index.response.schema.json` | escolher quais seções do `docs/` do setup entram no orçamento (§ passo `load_docs`) |
| `compact_facts` | `memory-compact.sh` | `memory-compact.request.schema.json` · `memory-compact.response.schema.json` | consolidar os candidatos brutos em fatos de `profile.json` (`docs/03-memoria.md` do repositório §4.2) |
| `classify_survivor` | `challenge-verify.sh` | `challenge-verify.request.schema.json` · `challenge-verify.response.schema.json` | classificar cada mutante sobrevivente como `equivalent` ou `not_equivalent` (§ passo `challenge`) |

O `kind` acima é o do **envelope**; dentro do `payload` viaja o `request_kind`
(`session_close` · `docs_index` · `memory_compact` · `challenge_verify`), que é outro campo e
coexiste com ele — trocar um pelo outro é **exit 5** (`docs/00-contratos.md` §6.5).

Regras invariantes:

- **Exit 10 não é erro.** É "falta um julgamento". O passo continua depois do `--apply`.
- **Nenhuma escrita antes do `--apply`.** Script que já escreveu e depois pede não é
  REQUEST/APPLY — é efeito colateral não confirmado.
- **Sem `--apply`, sem julgamento.** Nenhum script infere a resposta por conta própria nem cai em
  um default silencioso no lugar dela.
- **Idempotência**: aplicar a mesma resposta duas vezes produz o mesmo estado.
- **Teto de tentativas** onde couber (ex.: `fill_session_fields`, no máximo 2 pedidos por sessão);
  esgotado o teto, o script segue pelo caminho degradado definido no seu passo, e o registra.

---

### Passo 1 — `bootstrap`

| | |
|---|---|
| **O que acontece** | Descobre em qual setup a sessão vai rodar e confere a saúde do registry. Não fala com o aluno se a resolução for inequívoca. |
| **Script** | `setup-list.sh --resolve "$PWD"` (3.3); `detect-toolchains.sh --cached` (3.5) apenas se `setup.json.language.runtime_version` estiver ausente ou com `detected_at` mais velho que 30 dias |
| **Lê** | `$PWD` e diretórios-pai até `$HOME` (procura `setup.json`); o registry global; `$STUDY_METHOD_HOME`, `$XDG_DATA_HOME` |
| **Escreve** | Apenas o registry: `last_seen_at`, correção de `path` de setup movido, `setup_status`. Nada dentro do setup. |
| **Erros** | Registry com JSON inválido → renomeia para `registry.json.corrupt-<epoch>`, recria vazio, avisa **uma vez**, continua (nunca bloqueia). `setup.json` presente mas ilegível → não conserta sozinho: reporta o caminho e o erro do parser e vai para `setup_interview` no ramo "reparar". Mais de um candidato (ex.: setup aninhado dentro de outro) → lista os candidatos com path e `last_session_at` e **pergunta**; nunca adivinha. |
| **Saída** | Manifesto válido → `load_memory`. Nenhum manifesto encontrado → `setup_interview`. |

Resolução, em ordem: (1) `setup.json` em `$PWD` ou em algum diretório-pai; (2) `default_setup_id`
do registry, **confirmado** com o aluno em uma linha; (3) lista interativa dos setups `active`;
(4) nada → `setup_interview`.

### Passo 2 — `setup_interview` (ramo "setup não encontrado → perguntar")

| | |
|---|---|
| **O que acontece** | Pergunta ao aluno se ele quer criar um setup novo aqui, e conduz a entrevista mínima (assunto, título, linguagem, onde está a teoria). |
| **Delega para** | **Sub-tarefa 2.7** — `docs/10-bootstrap.md` do repositório e `SK/references/bootstrap.md` são donos do roteiro, da ordem das perguntas, do texto em pt-BR e da ingestão inicial do `docs/` do setup. **Sub-tarefa 3.0** — `decisions-ask.sh setup-init` é dono das decisões abertas perguntadas neste momento. Este documento define apenas o contorno: entrada, saída e falhas. |
| **Script** | `setup-init.sh <path>` (3.3) → `readme-sync.sh <setup_root> --init` (3.4) → escrita da entrada no registry (dentro de `setup-init.sh`, ver D-A13 em `docs/07-multi-setup.md` do repositório) |
| **Lê** | Respostas do aluno; `SK/assets/decisions.json`; `SK/assets/templates/setup/**` |
| **Escreve** | `<setup_root>/setup.json`, o `README.md` do setup, os quatro diretórios (o `docs/` do setup, `memory/`, `researchs/`, `challenges/`) e a entrada no registry |
| **Erros** | Diretório-alvo já existe e não está vazio e não tem manifesto → mostra o conteúdo e **pergunta** antes de escrever; nunca sobrescreve arquivo existente. Sem permissão de escrita → exit 1 com o caminho exato. `setup_id` sorteado colidindo com um do registry → sorteia de novo (até 5 tentativas). |
| **Saída** | Setup criado → `load_memory`. Aluno recusa criar → **FIM**: nenhum `NNNN.json` é gravado, nenhuma entrada de registry é criada, a conversa segue como conversa comum. |

### Passo 3 — `load_memory`

| | |
|---|---|
| **O que acontece** | Reconstrói o estado do aluno sem reler os brutos: verifica o índice, resolve sessões órfãs e monta o **digest determinístico**. |
| **Script** | `memory-index.sh <setup_root> --verify` (3.4) → `memory-digest.sh <setup_root>` (3.4) |
| **Lê** | `memory/INDEX.json`, `memory/profile.json`, `memory/progress.json`, os 1–2 `NNNN.json` mais recentes, e o conteúdo mínimo de qualquer `NNNN.json` com `status: "in_progress"` |
| **Escreve** | `memory/INDEX.json` (rebuild se dessincronizado), finalização automática de órfã (§4), `memory/broken/` em caso de quarentena. Tudo por `tmp` + `mv`. |
| **Erros** | `memory/` vazio → primeira sessão, digest esqueleto, **não é erro**. `INDEX.json` fora de sincronia com a listagem de arquivos → reconstrói a partir dos arquivos (o bruto manda). `NNNN.json` que não parseia → move para `memory/broken/NNNN.json`, registra no digest como lacuna conhecida, continua. |
| **Saída** | → `load_docs`. Sempre; este passo nunca aborta. |

O digest é montado **por código**, não por decisão do modelo sobre o que copiar de N arquivos —
é essa montagem mecânica que evita que a própria compactação sofra do "lost in the middle"
(`docs/research/02-memoria-llm.md` do repositório §4). Formato e campos são da sub-tarefa 2.2.

### Passo 4 — `load_docs`

| | |
|---|---|
| **O que acontece** | Carrega a teoria do aluno sob orçamento de tokens. |
| **Script** | `docs-index.sh <setup_root>` (3.3) |
| **Lê** | O `docs/` do setup inteiro (metadados sempre; conteúdo conforme o orçamento) |
| **Escreve** | `memory/docs-index.json` — índice derivado: arquivo, tamanho, títulos de seção, offsets, hash. Escrita atômica. Cache de texto extraído de PDF em `memory/.cache/docs-text/<sha>.txt`. |
| **Regra de orçamento** | Abaixo do teto (default de partida: ~20k tokens, `TASK_PLAN` C4) lê tudo; acima, entra em modo manifesto, em duas invocações: `docs-index.sh <setup_root>` mede e escreve o índice (determinístico, exit 0), e `docs-index.sh <setup_root> --select` **emite o pedido `select_sections` em stdout e sai 10, sem tocar em disco** (§3.1) — a escolha das seções relevantes é julgamento, não fórmula. O modelo responde, `--apply` valida e grava a seleção, e a skill **declara em voz alta o que ficou de fora**. Detalhe em `docs/10-bootstrap.md` do repositório §8 e `SK/references/docs-ingest.md`. |
| **Erros** | `docs/` do setup vazio ou só com formatos que a skill não lê → não é erro: o tutor diz isso e segue com `docs_coverage: "none"`. Arquivo binário/ilegível → ignora com aviso único, registra em `docs-index.json` como `readable: false`. |
| **Saída** | → `open_session` |

### Passo 5 — `open_session`

| | |
|---|---|
| **O que acontece** | Aloca o número sequencial e nasce a sessão, já persistida em disco, com `status: "in_progress"`. |
| **Script** | `session-new.sh <setup_root>` (3.3) |
| **Lê** | Listagem de `memory/[0-9][0-9][0-9][0-9].json` para calcular `max+1`; `SK/assets/templates/session/` |
| **Escreve** | `memory/NNNN.json` com `schema_version`, `session_id`, `setup_id`, `date`, `started_at`, `status: "in_progress"` e um `one_line_summary` provisório; e `memory/.session.lock`, **JSON** com `{pid, hostname, session_id, started_at}` |
| **Atomicidade** | A alocação do número usa `set -o noclobber` com `> memory/NNNN.json` (falha se o arquivo já existe) e reetenta com `max+1` até 5 vezes. Sem isso, duas sessões simultâneas colidem no mesmo `NNNN`. |
| **Erros** | Lock presente, `hostname` igual e **lock vivo** — `kill -0 <pid>` quando o `pid` é numérico, ou `started_at` dentro do `SM_SESSION_LOCK_TTL` quando o `pid` é `null`, que é o caso comum (§7.4 de `docs/00-contratos.md`) → **sessão concorrente**: exit 4 e pergunta ao aluno (D-A06). É para isso que o `.session.lock` existe. Lock presente e morto pela via que valer — pid morto, TTL vencido, ou host diferente → lock órfão: remove, registra no digest e segue. Disco cheio / FS read-only → exit 1; a aula só continua em "modo sem memória" se o aluno aceitar explicitamente, e o tutor repete esse aviso ao final. |
| **Saída** | → `plan_lesson` |

A sessão nasce **depois** de `load_memory`, para que o digest nunca leia o arquivo vazio da própria
sessão corrente como se fosse histórico (D-A04).

### Passo 6 — `plan_lesson`

| | |
|---|---|
| **O que acontece** | Monta e anuncia a agenda da aula, em no máximo 5 linhas, e deixa o aluno mudá-la. |
| **Script** | Nenhum obrigatório; consome o digest do passo 3 e `progress-update.sh <setup_root> --due` (3.4) para a lista de conceitos vencidos |
| **Lê** | Digest, `memory/progress.json`, a nota de sessão órfã (se houver), o que o aluno pediu agora |
| **Escreve** | `memory/NNNN.json` → objeto `plan`: itens da agenda, cada um com a razão (`orphan_resume`, `spaced_review`, `student_request`, `next_in_taxonomy`) |
| **Prioridade** | (1) retomar pendência ou sessão órfã; (2) revisão vencida de conceito `unknown`/`fragile` (`docs/research/03-pedagogia.md` do repositório §6.2 e §7.3); (3) o que o aluno pediu; (4) próximo nó da taxonomia do setup |
| **Erros** | Nenhum bloqueante. Sem histórico → agenda é "o que você quer estudar hoje?". |
| **Saída** | → `teach` |

### Passo 7 — `teach`

| | |
|---|---|
| **O que acontece** | O laço da aula: explica com analogia, mostra em código na linguagem escolhida, visualiza, checa entendimento pela escada de dicas, destila o que virou fato. |
| **Script** | `research-new.sh <setup_root> --topic <concept_id>` (3.3) aloca `researchs/NNNN.md`; `render-plot.py` (3.7) para gráficos; `setup-list.sh --find <termo> --json` (3.3) para leitura cruzada (`docs/07-multi-setup.md` do repositório) |
| **Lê** | Fatias do `docs/` do setup selecionadas no passo 4; `researchs/*.md` já destilados; o `README.md` do setup **de outro setup**, no caminho de leitura cruzada |
| **Escreve** | `researchs/NNNN.md` (destilado + bloco de proveniência); `researchs/assets/*` (gráficos, sub-tarefa 2.6); `memory/NNNN.json` **incrementalmente** |
| **Checkpoint** | O agente reescreve `memory/NNNN.json` inteiro a cada marco (tópico encerrado, desafio validado, mudança de afeto relevante). O arquivo é plano o bastante para reescrita completa ser segura. Isso é o que faz uma sessão órfã ter valor (D-A11). |
| **Erros** | Setup-alvo da leitura cruzada `missing` → pula, avisa uma vez, segue. Falha ao escrever `researchs/` → avisa e segue; o destilado perdido é recuperável na próxima sessão pelo `NNNN.json`. Falha de renderização de gráfico → cai para descrição textual + ASCII, nunca aborta a explicação (`docs/research/05-visualizacao.md` do repositório §4 e §8). |
| **Saída** | Tópico explicado e o aluno quer praticar → `challenge`. Aluno quer parar, ou o tempo acabou → `close_session`. |

### Passo 8 — `challenge`

| | |
|---|---|
| **O que acontece** | Gera o desafio, valida por execução **antes** de mostrar qualquer coisa ao aluno, e acompanha a tentativa. |
| **Script** | `challenge-new.sh` → `challenge-verify.sh`, ambos com `lib/sandbox.sh` (3.5). A execução em si é do `runner.sh` gerado dentro de `challenges/<NNNN>-<slug>/` — `challenge-run.sh` **não existe** (AR-25). |
| **Lê** | `SK/assets/templates/challenge/**`; `setup.json` → `language`; cache de `detect-toolchains.sh` |
| **Escreve** | `challenges/<NNNN>-<slug>/**` (com a solução de referência em `.solution/`); `meta.json.challenge_status` transitando `draft → validated \| rejected → solved`; evidência da tentativa em `memory/NNNN.json` e `memory/progress.json` |
| **Gate** | `challenge-verify.sh` roda o protocolo `validar_teste(T, R, E)` (`docs/research/04-tdd-actor-critic.md` do repositório §4) e **também** assere "N testes executados > 0" — exit code sozinho mente em Go, Rust e `unittest` (`docs/research/06-toolchains.md` do repositório §6.1). Regra de leitura de exit code: sempre `!= 0`, nunca `== 1`. |
| **Erros** | `rejected` três vezes seguidas → **abandona o desafio** e ensina com exemplo resolvido; nunca entregar teste não validado. Toolchain da linguagem ausente → oferece outra linguagem ou desafio em papel; **não instala nada sem perguntar**. Timeout no sandbox → conta como `rejected`, com o motivo registrado em `meta.json`. |
| **Saída** | → `teach` (mais tópicos) ou → `close_session` |

### Passo 9 — `close_session`

| | |
|---|---|
| **O que acontece** | Fecha a sessão, grava o `NNNN.json` final e propaga para os derivados. É o caminho normal de saída de `in_progress`; o outro é a recuperação automática de órfã (§4.1). |
| **Script**, nesta ordem | `session-close.sh <setup_root>` (3.3) → `memory-index.sh <setup_root>` (3.4) → `progress-update.sh <setup_root> --recompute` (3.4) → `readme-sync.sh <setup_root>` (3.4) → `memory-compact.sh <setup_root> --if-due` (3.4). O `--recompute` **não é opcional**: `progress-update.sh` sai **2** quando invocado sem modo, e a chamada nua fazia `memory/progress.json` nunca nascer. |
| **Lê** | `memory/NNNN.json` em progresso, `memory/INDEX.json`, `memory/profile.json`, `memory/progress.json`, `challenges/*/meta.json`, listagem de `researchs/` |
| **Escreve** | `memory/NNNN.json` finalizado (`status: "completed"`, `finalized_at`, `finalized_by`, `one_line_summary` **obrigatório**, `topics`, `skills_observed`, `what_worked`, `what_didnt_work`, `open_questions`, `next_steps`, `cross_setup_refs`); `memory/INDEX.json` (append); `memory/progress.json`; `README.md` do setup (regeneração entre marcadores); `setup.json` (`updated_at`, `last_session_at`, `session_count`); entrada do registry; remove `memory/.session.lock`. **Não escreve `memory/profile.json`** — o perfil tem um escritor só, a compactação (`docs/03-memoria.md` do repositório §2, camada 3). Toda escrita por `tmp` + `mv`. |
| **Validação** | `session-close.sh` valida o `NNNN.json` contra `session.schema.json` (2.2). Faltou campo obrigatório → emite o pedido **`fill_session_fields`** em stdout e sai **10** (§3.1), **sem escrever**; o modelo responde e re-invoca com `--apply`. No máximo **2** pedidos por sessão; esgotado o teto, **fecha assim mesmo** com `status: "completed"` e `validation_errors[]` preenchido. **Nunca** deixar uma sessão presa em `in_progress` por causa de validação. |
| **Compactação** | Se o número de sessões não consolidadas (`compacted_at == null` e `status ∈ {completed, abandoned}`) ≥ 15, `memory-compact.sh --if-due` roda (limiar de `docs/research/02-memoria-llm.md` do repositório, "Recomendação") e usa o pedido `compact_facts` (§3.1). Brutos nunca são apagados — apenas deixam de ser lidos por padrão. |
| **Erros** | Falha ao escrever um derivado → avisa e continua; o derivado é reconstruível. Falha ao escrever o próprio `NNNN.json` → é o único erro que o tutor deve declarar como perda real ao aluno, com o caminho exato. |
| **Saída** | **FIM** |

---

## 4. Ciclo de vida da sessão e o caso da sessão órfã

Campo de estado: **`status`**, com vocabulário fechado `in_progress | completed | abandoned`, mais
`finalized_at` e `finalized_by`. Quem manda é `session.schema.json` (2.2). Os termos
`session_status`, `closed` e `orphaned` estão **descartados** — não existem em schema nenhum, script
nenhum nem documento nenhum deste projeto.

Este `status` de sessão é **distinto** do `status` de fato semântico (`active | superseded`, em
`profile.json`) e do `state` de pendência (`open | done | dropped`). A tabela de desambiguação dos
três está em `docs/03-memoria.md` do repositório §0.

**Sessão órfã não é um valor de `status`** — é uma **condição derivada**, calculada em tempo de
leitura:

```
órfã(S)  ⇔  S.status == "in_progress"  ∧  ¬lock_vivo(S)

lock_vivo(S) ⇔ existe memory/.session.lock
             ∧ lock.session_id == S.session_id
             ∧ lock.hostname   == hostname desta máquina
             ∧ (lock.pid numérico  ->  kill -0 lock.pid sucede            # via (a)
                lock.pid == null   ->  agora - lock.started_at ≤ TTL)     # via (b)
```

⛑ A última conjunção tem **duas vias** (`docs/00-contratos.md` §7.4), e a via (b) é a **comum**:
sem `SM_SESSION_OWNER_PID` o lock nasce com `pid: null` e a validade passa a ser o TTL
`SM_SESSION_LOCK_TTL` (default **28800 s = 8 h**) sobre `started_at`, com *fallback* para o `mtime`
do lock. `hostname` diferente é órfão **antes** de pid e de TTL. Exigir `pid` não-vazio + `kill -0`
como critério **único** declara morto todo lock da via (b) e fecha como abandonada a sessão que
está **em andamento**. O predicado é um só, `sm_session_lock_alive` (§7.1): nenhum script o
reimplementa.

A segunda metade da conjunção não é detalhe: sem ela, **toda** sessão `in_progress` seria classificada
como órfã e a detecção de sessão concorrente desapareceria — que é exatamente o que o
`.session.lock` existe para fazer (exit 4).

```
open_session ──► in_progress ──(close_session)──► completed
                      │
                      └──(processo morre: terminal fechado, crash, kill)
                             │
                             ▼
              in_progress sem lock vivo ──(próxima sessão, load_memory)──► abandoned
```

### 4.1 Detecção e recuperação — dono único, automática

`memory-index.sh <setup_root> --verify`, no passo `load_memory`, é o **único** componente que
finaliza uma órfã **automaticamente**, e `memory-digest.sh` é somente-leitura: não fecha, não
altera, não remove nada.

⚑ **`session-close.sh --recover <NNNN>` existe** (`docs/00-contratos.md` §8) e **não** é um segundo
caminho automático: é a **porta manual** da mesma operação — fechamento retroativo pedido à mão,
para a órfã que o `--verify` não alcançou (setup movido, arquivo fora da varredura). Ela grava
exatamente o mesmo resultado: `status: "abandoned"`, `finalized_by: "auto_orphan_recovery"`,
`finalized_at` = `mtime` do arquivo. O texto anterior — "`session-close.sh` **não tem**
`--recover`" — está **revogado**; o que continua valendo é que **ninguém além do `--verify` fecha
órfã sem alguém pedir**.

O script varre `memory/[0-9][0-9][0-9][0-9].json` procurando `status == "in_progress"`. Para cada um:

1. **`lock_vivo` verdadeiro** → não é órfã, é uma sessão **viva** em outro terminal. `--verify` não
   toca no arquivo; quem reage é `open_session`, com exit 4 e a pergunta ao aluno (D-A06): abortar
   (default) ou abrir em modo somente-leitura, sem gravar `NNNN.json`.
2. **Caso contrário** → é órfã, e a recuperação é **automática, sem perguntar**:
   - `status` ← `"abandoned"`;
   - `finalized_at` ← o `mtime` do arquivo (melhor carimbo disponível de "última coisa escrita");
   - `finalized_by` ← `"auto_orphan_recovery"`;
   - `one_line_summary` ← se ainda for o provisório, vira
     `"Sessão interrompida sem fechamento (recuperada automaticamente)."`. **Nada mais é inventado**:
     campo vazio continua vazio;
   - o conteúdo já escrito é **preservado integralmente**; nada é apagado, nada é movido;
   - a entrada entra em `INDEX.json` com `status: "abandoned"` e a flag `orphan_recovered`.
3. O lock morto correspondente é removido.
4. `NNNN.json` e `INDEX.json` são reescritos atomicamente (`tmp` + `mv`).

**Por que automático, e não um menu de três opções**: sessão interrompida é o modo de falha mais
comum do sistema em uso real — o aluno fecha o terminal. Perguntar "retomar / fechar / descartar"
a cada retomada é atrito diário para um caso cuja resposta certa é sempre a mesma: preservar tudo e
oferecer a retomada como primeiro item da agenda. A decisão correspondente do catálogo (3.0) fica
com `ask_when: never`.

### 4.2 O que a próxima sessão faz com a órfã

- `memory-digest.sh` reporta as recuperadas em `orphan_sessions[]` (com `days_ago`), bloco que
  **nunca é truncado** pelo orçamento.
- `plan_lesson` **coloca a retomada como primeiro item da agenda**, com razão `orphan_resume`, e o
  tutor abre a aula dizendo o que ficou pela metade — em uma linha, sem drama. Regra de fala: quando
  `days_ago <= 7`, abrir por aí.
- Uma órfã **conta** como sessão para numeração e para o índice. O `NNNN` dela não é reutilizado.
- Uma órfã recuperada (`abandoned`) **entra** na compactação e conta para o limiar dela; o que muda é
  o teto: todo fato cujas `source_sessions` sejam **exclusivamente** sessões `abandoned` fica travado
  em `confidence: "low"` (`docs/03-memoria.md` do repositório §4.2, passo 6). Observação de sessão
  interrompida é observação incompleta, não observação inválida.
- Órfãs nunca são apagadas nem mescladas na sessão nova.

O valor prático da órfã depende inteiramente do checkpoint incremental do passo `teach`: se o
`NNNN.json` só fosse escrito no fim, toda órfã seria um arquivo vazio. Por isso o checkpoint é
regra, não otimização.

---

## 5. Limites conhecidos (e o que a arquitetura faz por causa deles)

| Limite | Fonte | Consequência arquitetural |
|---|---|---|
| Corpo do `SKILL.md` deve ficar em ~**200 linhas** (limite recomendado: **< 500 linhas / < 5k tokens**) | `docs/research/01-agent-skills.md` do repositório §1.4; `TASK_PLAN` C6 | O `SKILL.md` é **roteador**, não manual: nomeia os 9 passos, aponta a `reference/` certa de cada um e carrega só as regras permanentes. Todo detalhe vive em `SK/references/*.md`. |
| O harness **não relê** o `SKILL.md` a cada turno; ele entra uma vez como mensagem e fica | `docs/research/01-agent-skills.md` do repositório §1.6 | Regras que valem o tempo todo (tom, anti-bajulação, "nunca entregar teste não validado", "nunca escrever no `docs/` do setup") vão no **corpo** como regra permanente. Nada crítico pode depender de "lembrar do passo 7". |
| Referência aninhada (`SKILL.md` → a.md → b.md) causa leitura parcial (`head -100`) | `docs/research/01-agent-skills.md` do repositório §2.3 | Toda `reference/` é linkada **direto** do `SKILL.md`, um nível só. Referências com mais de 100 linhas começam com sumário. |
| Nível 3 custa **zero** token até ser lido | `docs/research/01-agent-skills.md` do repositório §2.1 | Schemas, templates e a matriz de linguagens podem ser volumosos sem penalidade — desde que o `SKILL.md` diga quando abrir cada um. |
| Auto-compactação reanexa só os primeiros ~5k tokens de cada skill, com teto combinado de 25k | `docs/research/01-agent-skills.md` do repositório §1.6 | O estado da sessão **não pode viver só na conversa**. Depois de uma compactação, o agente reconstrói onde está lendo `memory/NNNN.json` (`status: "in_progress"` + `plan`) — o disco é a origem da verdade do passo corrente. |
| `allowed-tools` vale só no turno da invocação | `docs/research/01-agent-skills.md` do repositório §1.6 | Nenhum passo pode assumir permissão concedida em turno anterior; scripts falham com mensagem explícita, não com silêncio. |
| Degradação de atenção com contexto longo ("lost in the middle", context rot) — atinge JSON tanto quanto prosa | `docs/research/02-memoria-llm.md` do repositório §2 | Nunca colar N sessões brutas no contexto. `load_memory` entrega **um** digest montado por código; brutos são abertos seletivamente por `session_id`. |
| LLM não autocorrige raciocínio sem sinal externo | `docs/research/04-tdd-actor-critic.md` do repositório §3 | O gate do desafio é execução, não uma segunda chamada de modelo. |
| Exit code de test runner não é uniforme (101 em Rust, 2 em Elixir/MTP, 134 em C, **0 com falha** em R) | `docs/research/06-toolchains.md` do repositório §5 | `runner.sh` (dentro do desafio, exit 0/1/2/3) normaliza; o orquestrador só checa `!= 0` e a contagem de testes executados. |
| Não há `jsonschema` nesta máquina; o gate valida com verificador mínimo (tipos, `required`, `enum`, `pattern`) | `TASK_PLAN`, verificações do revisor de plano | Os schemas desta sub-tarefa são planos e sem `$ref` remoto, `allOf` aninhado ou `if/then/else`. A cobertura de validação é parcial **por design** e isso é declarado, não escondido. |
| O registry é estado global **fora** do repositório e fora de qualquer setup | Decisão desta sub-tarefa | Ele nunca é a origem da verdade sobre um setup: é cache de descoberta. Qualquer setup é 100% reconstruível a partir do seu próprio `setup.json`. |

---

## 6. Contratos que outras sub-tarefas devem respeitar

1. **Nomes dos 9 passos** (`bootstrap`, `setup_interview`, `load_memory`, `load_docs`,
   `open_session`, `plan_lesson`, `teach`, `challenge`, `close_session`) são identificadores
   estáveis. Use-os literalmente no `SKILL.md`, nas `references/` e nos comentários dos scripts.
   **Dois deles são CONDICIONAIS, não etapas obrigatórias da sequência**: `setup_interview` só roda
   quando não há setup em lugar nenhum, e `load_docs` só roda quando há `docs/` do setup para ler.
   Ler os nove como sequência estrita faria a skill perguntar em toda sessão — o oposto do que o
   usuário pediu.
2. **`status: in_progress | completed | abandoned`** em `session.schema.json` (2.2), mais
   `finalized_at` e `finalized_by`; separado do `status: active | superseded` de fato semântico.
   Sessão órfã é **condição derivada** (§4), nunca valor persistido.
3. **`memory/NNNN.json` carrega `cross_setup_refs: []`** — array de `{setup_id, setup_name,
   sections_read[], reason}` (2.2), preenchido no passo `teach`.
4. **Derivados de memória vivem dentro de `memory/`**: `INDEX.json`, `profile.json`, `progress.json`,
   `docs-index.json`, `broken/`, `.session.lock` (2.2, 2.3, 2.7).
5. **Convenção de exit code** da tabela do §3 — incluindo **`10 = needs_model_input`** — para todo
   script de `SK/scripts/`. Exceções nomeadas: o `runner.sh` gerado dentro do desafio e o
   `render-plot.py` usam `0/1/2/3`.
6. **A skill nunca escreve na raiz do `docs/` do setup.** Exceção única e nomeada:
   `<docs-do-setup>/generated/`, só para teoria gerada e sempre marcada como tal (§2.1).
7. **Nada chega ao aluno sem `challenge_status: "validated"`** (2.5, 3.5).
8. **O manifesto do setup é `setup.json` na raiz do setup**, com o schema
   `SK/assets/schemas/setup-manifest.schema.json`. Não existe `.study-method/`. A sub-tarefa 3.0
   grava as respostas do aluno no objeto `decisions` desse arquivo (campo `writes_to` de
   `decisions.json`).
9. **Protocolo REQUEST/APPLY** (§3.1) é o **único** caminho por onde um script obtém julgamento do
   modelo: pedido em stdout + exit 10, resposta por `--apply <arquivo.json>`, validação contra o
   schema do pedido antes de aplicar.
10. **Escrita atômica (`tmp` + `mv`) obrigatória para todo derivado**, não só para o registry.
11. **Identificador de conceito em `snake_case` em todo o sistema**, pattern
    `^[a-z][a-z0-9_]{1,62}$`. Vale para `concept_id`, `skills_observed[].skill`, `topics`,
    `taxonomy`, `claim_key` (cada segmento) e `target_topic`. A normalização é uma função só,
    `normalize_concept_id()`, em `SK/scripts/lib/common.sh`; nenhum script implementa a sua.
12. **Leitura cruzada é tri-estado**: `privacy.cross_read: ask | allow | never` (default `ask`) no
    `setup.json`, espelhado no registry. **Escrita cruzada entre setups: nunca**
    (`docs/07-multi-setup.md` do repositório §5).

### 6.1 Interface de linha de comando exigida pela máquina de estados

Lista consolidada do que a onda 3 precisa implementar para que os 9 passos funcionem. Todo script
aceita a raiz do setup como primeiro argumento posicional (exceto onde indicado) e obedece à
convenção de exit code do §3.

| Script (dono) | Invocação exigida | Passo |
|---|---|---|
| `setup-list.sh` (3.3) | `--resolve <cwd>` · `--find <termo> --json` · `--archive <setup_id>` · `--forget <setup_id>` · `--all` · sem argumento = listar `active` | `bootstrap`, `teach` |
| `setup-init.sh` (3.3) | `<path>` + opções da entrevista (2.7); cria os quatro diretórios, `setup.json`, o `README.md` do setup e a entrada no registry | `setup_interview` |
| `docs-index.sh` (3.3) | `<setup_root>` (mede e escreve `memory/docs-index.json`, exit 0) · `--select [--topics t1,t2]` (emite o pedido `select_sections` e sai **10**, sem escrever) · `--apply <resposta.json>` | `load_docs` |
| `session-new.sh` (3.3) | `<setup_root>`; imprime o `NNNN` alocado em stdout e cria o `.session.lock` | `open_session` |
| `session-close.sh` (3.3) | `<setup_root>` · `[--session <NNNN>]` · `[--recover <NNNN>]` · `--apply <resposta.json>`; pode sair **10** com o pedido `fill_session_fields`. `--recover` é a porta **manual** de fechamento de órfã; o dono do fechamento **automático** continua sendo `memory-index.sh --verify` (§4.1) | `close_session` |
| `research-new.sh` (3.3) | `<setup_root> --topic <concept_id>`; imprime o caminho de `researchs/NNNN.md` | `teach` |
| `memory-index.sh` (3.4) | `<setup_root>` · `--verify` (checa sincronia, detecta e **finaliza** órfãs) | `load_memory`, `close_session` |
| `memory-digest.sh` (3.4) | `<setup_root>` [`--topics t1,t2`] [`--budget-chars N`] [`--today AAAA-MM-DD`] [`--now <ISO 8601>`]; imprime o digest JSON em stdout, somente leitura | `load_memory` |
| `memory-compact.sh` (3.4) | `<setup_root> --if-due` (não faz nada abaixo do limiar) · `--apply <resposta.json>`; pode sair **10** com o pedido `compact_facts` | `close_session` |
| `progress-update.sh` (3.4) | `<setup_root> --due` (imprime conceitos vencidos, em `plan_lesson`) · `<setup_root> --recompute` (reconstrói os escalares e cria o arquivo se ausente, em `close_session`). Um dos modos é **obrigatório**: sem modo é exit 2 | `plan_lesson`, `close_session` |
| `readme-sync.sh` (3.4) | `<setup_root>` · `--init` | `setup_interview`, `close_session` |
| `challenge-new.sh` / `challenge-verify.sh` (3.5) | contrato da sub-tarefa 2.5 | `challenge` |
| `detect-toolchains.sh` (3.5) | `--cached` (usa o carimbo de `setup.json.language.detected_at`) | `bootstrap`, `challenge` |
| `decisions-ask.sh` (3.0) | `<fase>` com `fase ∈ {setup-init, first-challenge, session-15, on-demand}` | `setup_interview`, `challenge` |

**Removidos do projeto (AR-25)**: `challenge-run.sh` e `render-html.sh`. Nenhum dos dois tinha
contrato próprio, e as funções deles já pertenciam a outros donos — a execução do desafio é do
`runner.sh` gerado dentro de `challenges/<NNNN>-<slug>/`, e a renderização é do `render-plot.py`
(3.7). Nenhum documento, script ou tabela deste projeto deve voltar a citá-los.

Todo script de `SK/scripts/` que pode precisar de julgamento aceita `--apply <arquivo.json>` e o par
"exit 10 + pedido em stdout" do §3.1. Os três pedidos existentes hoje estão na tabela daquela seção.

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-A01 | **RESOLVIDA (AR-02).** Como se chama o arquivo de manifesto na raiz de cada setup? | `setup.json` visível · `.study-method.json` oculto · `study-method.json` | **`setup.json` na raiz do setup** — visível, óbvio para quem abre a pasta, e é o marcador que `bootstrap` procura subindo diretórios. `.study-method/` **não existe** em lugar nenhum do projeto | cheap |
| D-A02 | **RESOLVIDA (AR-02).** Onde ficam os derivados de memória (`INDEX.json`, `profile.json`, `progress.json`, `docs-index.json`, `.cache/`)? | Dentro de `memory/` · Na raiz do setup · Em um diretório oculto de controle | **Dentro de `memory/`** — a raiz do setup fica com 4 diretórios + 2 arquivos, e "tudo que a máquina mantém" fica num lugar só. A opção do diretório oculto de controle caiu junto com `.study-method/` | moderate |
| D-A03 | **RESOLVIDA (AR-01).** Qual é o campo e o vocabulário do estado da sessão? | `status` com `in_progress\|completed\|abandoned` · `session_status` com `in_progress\|closed\|orphaned` | **`status: in_progress \| completed \| abandoned`**, mais `finalized_at` e `finalized_by` — vence `session.schema.json`. `session_status`, `closed` e `orphaned` estão descartados; a desambiguação com o `status` de fato semântico é feita pela tabela de `docs/03-memoria.md` do repositório §0 | moderate |
| D-A04 | Em que momento a sessão nasce em disco? | Depois de carregar memória e teoria (antes da 1ª fala) · Logo no `bootstrap` · Só no fim da aula | Depois de `load_docs` — cedo o bastante para sobreviver a um crash, tarde o bastante para o digest não ler a si mesmo | cheap |
| D-A05 | **RESOLVIDA (AR-06).** O que fazer ao encontrar uma sessão anterior interrompida (órfã)? | Recuperar automaticamente · Perguntar ao aluno o que fazer · Reabrir a mesma sessão e continuar nela | **Recuperar automaticamente** (`status: abandoned`, `finalized_by: auto_orphan_recovery`) em `memory-index.sh --verify`, e oferecer a retomada como 1º item da agenda. É o modo de falha mais comum do sistema; perguntar a cada retomada é atrito diário. No catálogo (3.0) a decisão fica com `ask_when: never` | cheap |
| D-A06 | O que fazer se houver outra sessão viva no mesmo setup (dois terminais)? | Abortar a segunda (exit 4) · Abrir em modo somente-leitura sem gravar · Abrir as duas e aceitar o risco de colisão | Abortar, explicando qual pid/terminal está com a sessão; oferecer o modo somente-leitura como saída | cheap |
| D-A07 | Como `researchs/NNNN.md` carrega proveniência (tópico, fontes no `docs/` do setup, sessão de origem)? | Comentário HTML com JSON (legível por `jq`) · Frontmatter YAML · Nenhum metadado | Comentário HTML com JSON — não há PyYAML nesta máquina e o gate valida JSON com stdlib | moderate |
| D-A08 | O objeto `decisions` do `setup.json` é um mapa livre `id → resposta` ou um array com schema estrito? | Objeto livre (validação fica com `decisions.json`) · Array validado pelo schema do manifesto | Objeto livre — o verificador mínimo do gate não valida schema de valor de propriedade dinâmica sem risco de falso negativo | moderate |
| D-A09 | O campo `language.name` do manifesto é um `enum` fechado de 19 linguagens ou string livre? | `enum` fechado (derivado de `docs/research/06-toolchains.md` do repositório §2) · string com `pattern` | `enum` fechado — congela o vocabulário que 2.6 e 3.5 também usam; ampliar exige bump de `schema_version` | expensive |
| D-A10 | Qual namespace de `$id` para os schemas JSON do projeto? | `urn:study-method:schema:<nome>:<major>` · URL `https://` de um domínio do projeto · caminho relativo | `urn:...` — não promete um host que não existe, e o gate não resolve `$ref` remoto de qualquer forma | cheap |
| D-A11 | O `memory/NNNN.json` é reescrito a cada marco da aula (checkpoint) ou só no fechamento? | Checkpoint a cada marco · Só no `close_session` · Checkpoint por tempo (ex.: a cada 10 min) | Checkpoint a cada marco — é o que dá valor a uma sessão órfã; o custo é uma reescrita de arquivo pequeno | cheap |
