# 07 — Multi-setup: registry global, identidade, o `README.md` do setup como nó de grafo e a leitura cruzada

Documento normativo, par de `docs/01-arquitetura.md` do repositório. Aqui está como a skill conhece
**todos** os setups do aluno, como sobrevive a um setup movido/renomeado/apagado, e como o aluno
que está estudando Cálculo consegue puxar o que viu de matrizes em outro setup — sem que a skill
leia a memória inteira do outro assunto.

Terminologia congelada: sempre **`docs/` do setup** ou **`docs/` do repositório**; sempre
**`README.md` do setup** ou **`README.md` do repositório**. Nunca a forma nua.

---

## 1. O registry global

```
${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/registry.json
```

Nesta máquina, sem nenhuma variável definida, isso resolve para
`/home/ondokai/.local/share/study-method/registry.json`.

Schema: `skills/study-method/assets/schemas/registry.schema.json`.

**O registry é cache de descoberta, nunca origem da verdade.** Todo dado de um setup vive dentro do
próprio setup (`setup.json` + os quatro diretórios). Se o registry for apagado, nenhum setup é
perdido: basta abrir cada um uma vez e ele se re-registra. Essa propriedade é o que permite tratar
qualquer inconsistência de registry como aviso, nunca como erro fatal.

### 1.1 Quando é escrito

| Momento | Passo da máquina de estados | O que muda |
|---|---|---|
| Criação de um setup | `setup_interview` (via `setup-init.sh`) | Nova entrada completa; `setup_status: "active"`; `created_at`; `last_seen_at` |
| Abertura de qualquer sessão | `bootstrap` (via `setup-list.sh --resolve`) | `last_seen_at` da entrada resolvida; correção de `path` se o setup mudou de lugar; `setup_status` conforme o liveness check do §2 |
| Fechamento da sessão | `close_session` (via `session-close.sh`) | `last_session_at`, `session_count`, `topics[]` (espelhados do `README.md` do setup), `language` se mudou |
| Arquivamento explícito | comando do aluno → `setup-list.sh --archive <setup_id>` | `setup_status: "archived"`, `archived_at` |
| Varredura de saúde | `bootstrap`, uma vez por dia (compara `checked_at` do registry) | `setup_status` de **todas** as entradas, `missing_since` |

### 1.2 Quando é lido

- `bootstrap`, para resolver o setup quando o `$PWD` não está dentro de nenhum
  (`default_setup_id` → confirmação em uma linha → lista interativa).
- `teach`, no caminho de leitura cruzada (§4): é o único índice que sabe que os outros setups existem.
- Qualquer comando do aluno do tipo "quais setups eu tenho?" (`setup-list.sh`).

### 1.3 Escrita segura

O registry é o único estado compartilhado entre setups e entre terminais. Contrato para a
sub-tarefa 3.3:

```bash
lock="$(dirname "$REGISTRY")/.registry.lock"
mkdir "$lock" 2>/dev/null || { echo "registry ocupado" >&2; exit 4; }   # mkdir é atômico
trap 'rmdir "$lock" 2>/dev/null' EXIT
tmp="$REGISTRY.tmp.$$"
jq '...' "$REGISTRY" > "$tmp" && mv -f "$tmp" "$REGISTRY"                # mv no mesmo FS é atômico
```

- `jq` está presente nesta máquina e é a única ferramenta de manipulação estruturada garantida.
- Lock preso por mais de 60 s (comparar `mtime` do diretório de lock) é considerado morto e removido
  com aviso — o registry não pode travar uma aula.
- Registry ausente na primeira execução não é erro: `setup-init.sh`/`setup-list.sh` criam o
  diretório (`mkdir -p`) e um registry vazio válido.
- Registry com JSON inválido → renomeia para `registry.json.corrupt-<epoch>`, recria vazio, avisa uma
  vez. Os setups continuam intactos; eles voltam ao registry conforme forem abertos.

---

## 2. Ciclo de vida de uma entrada e o setup que sumiu

Campo de estado: **`setup_status`**, vocabulário fechado.

| Valor | Significado | Efeito |
|---|---|---|
| `active` | O `path` existe, tem `setup.json` legível e o `setup_id` bate | Aparece na lista, é candidato à leitura cruzada |
| `missing` | O `path` não existe mais, ou não tem `setup.json`, ou o `setup_id` de lá é outro | Some da lista padrão, é excluído da leitura cruzada, **a entrada nunca é apagada** |
| `archived` | O aluno arquivou de propósito | Some da lista padrão, excluído da leitura cruzada por padrão; volta com `--all` |

### 2.1 Liveness check (o algoritmo, implementável como está)

Roda em `bootstrap`, no máximo uma vez por dia por entrada (campo `checked_at`), para não pagar I/O
a cada invocação:

```
para cada entrada E do registry:
    se E.setup_status == "archived": pular
    se ! [ -f "E.path/setup.json" ]:
        E.setup_status = "missing"
        E.missing_since = agora        (só na primeira vez; não sobrescrever)
        continuar
    id_no_disco = jq -r .setup_id "E.path/setup.json"   # falha de parse conta como ausente
    se id_no_disco == E.setup_id:
        E.setup_status = "active"; E.last_seen_at = agora; apagar E.missing_since
    senão:
        # outro setup mudou-se para esse caminho
        E.setup_status = "missing"; E.missing_since = agora (se ausente)
        garantir que existe uma entrada para id_no_disco apontando para E.path
    E.checked_at = agora
```

### 2.2 Setup **movido** — reconciliação automática, sem perguntar

Quando `bootstrap` resolve um `setup.json` por caminho de arquivo (`$PWD` ou pai) e o `setup_id` de
lá já existe no registry apontando para outro `path`:

- Se o `path` antigo **não existe mais** → é uma mudança de lugar. Atualiza `path`, `setup_status`
  volta a `active`, `missing_since` é limpo, e o fato é registrado como uma linha no `NNNN.json`
  (`registry_path_fixed`). **Não pergunta nada** (D-A22): corrigir um caminho morto não tem
  alternativa razoável.
- Se o `path` antigo **ainda existe e tem um `setup.json` com o mesmo `setup_id`** → é um **clone**
  (o aluno copiou a pasta), não um movimento. Ver §2.4.

### 2.3 Setup **renomeado**

Renomear o diretório é um caso particular de mover: o `setup_id` é a identidade, o caminho não é
(§3). Renomear o **campo** `setup_name` dentro do `setup.json` também é livre: o registry é
atualizado por `setup_id` no próximo `bootstrap`/`close_session`. Nada quebra, nenhum histórico é
perdido, nenhum arquivo precisa ser reescrito.

### 2.4 Setup **apagado** (ou clonado)

- **Apagado**: a entrada vira `missing` com `missing_since`. Ela **permanece** no registry para
  sempre, por dois motivos: (1) sessões antigas de outros setups podem ter `cross_setup_refs`
  apontando para esse `setup_id`, e uma referência pendurada precisa ter nome; (2) se o aluno
  restaurar de um backup, a entrada volta sozinha a `active`.
  A skill menciona um setup `missing` **no máximo uma vez por sessão**, e só se for relevante ao que
  se está estudando. Nunca abre a sessão com um relatório de erros de manutenção.
- **Purga**: remover a entrada de vez é operação explícita (`setup-list.sh --forget <setup_id>`),
  nunca automática — mesma disciplina do apagamento de dado pessoal da sub-tarefa 2.8.
- **Clone** (dois caminhos vivos com o mesmo `setup_id`): a skill **pergunta**, porque as duas
  respostas são plausíveis. Default: tratar o caminho recém-aberto como um setup novo — sorteia um
  `setup_id` novo, grava no `setup.json` dele, registra como entrada nova e mantém a original
  intacta (D-A19). A alternativa é o aluno dizer "não, esse é o mesmo, quero abandonar o antigo".

### 2.5 O que **nunca** acontece

- O registry nunca apaga arquivo de setup nenhum.
- Uma entrada `missing` nunca bloqueia a sessão corrente, nem gera pergunta na abertura.
- A skill nunca varre o disco inteiro procurando setups perdidos. Se o registry não sabe onde está,
  o aluno diz onde está (`cd` para lá, ou informa o caminho) e a reconciliação do §2.2 resolve.

---

## 3. Identidade e nome de um setup

| Campo | Papel | Muda? |
|---|---|---|
| `setup_id` | **A identidade.** 12 dígitos hexadecimais, sorteados na criação (`od -An -N6 -tx1 /dev/urandom \| tr -d ' \n'`) | Nunca |
| `setup_name` | Handle legível, slug `^[a-z0-9]+(-[a-z0-9]+)*$` (ex.: `calculo-1`) | Livre |
| `title` | Título em pt-BR mostrado ao aluno (ex.: "Cálculo I") | Livre |
| `path` | Onde está agora. **Não** é identidade — é atributo volátil, reconciliado pelo §2.2 | Livre |

**Dois setups com o mesmo `setup_name` são permitidos** (D-A18). Motivo: proibir exigiria unicidade
global forçada no registry, que é justamente o componente que pode estar desatualizado ou corrompido
— uma restrição que depende de um cache não é uma restrição. O que a skill faz quando o aluno diz
"abre o setup de cálculo" e dois casam:

```
Achei dois setups com esse nome:
  1) Cálculo I        ~/estudos/calculo          última sessão 2026-08-19  (42 sessões)
  2) Cálculo I        ~/backup/estudos/calculo   última sessão 2026-03-02  (11 sessões)
Qual deles?
```

Desempate é sempre por `path` + `last_session_at` + `session_count`, e **nunca** por adivinhação.
`setup_id` é o que a skill usa internamente e o que aparece em `cross_setup_refs`.

---

## 4. O `README.md` do setup como nó de grafo de conhecimento

Cada setup tem um `README.md` do setup na sua raiz. Ele não é decoração: é a **única superfície que
outro setup tem permissão de ler**. Tudo que precisa ser referenciável de fora precisa estar ali.

### 4.1 Conteúdo — seções fixas

`readme-sync.sh` (sub-tarefa 3.4) regenera **apenas** o interior dos marcadores. Prosa que o aluno
escreveu fora dos marcadores é preservada intacta (D-A20):

```markdown
<!-- study-method:begin identidade -->
...gerado...
<!-- study-method:end identidade -->
```

| Seção (nome do marcador) | O que contém | Fonte |
|---|---|---|
| `identidade` | `setup_id`, `setup_name`, `title`, `subject`, linguagem escolhida, data de criação, nº de sessões | `setup.json` |
| `taxonomia` | A árvore de tópicos do assunto, em lista aninhada; cada folha com `proficiency_state` (`unknown\|fragile\|mastered`) | `setup.json.taxonomy` + `memory/progress.json` |
| `base-teorica` | Tabela `arquivo do docs/ do setup \| tópicos que sustenta \| resumo de 1 linha` | `memory/docs-index.json` |
| `destilados` | Índice de `researchs/NNNN.md` → tópico + 1 linha + `status` | bloco de proveniência de cada `researchs/NNNN.md` |
| `desafios` | Índice de `challenges/<slug>/` → tópico + `challenge_status` | `challenges/*/meta.json` |
| `linha-do-tempo` | Resumo de topo das sessões: total, período, e o `one_line_summary` das últimas 10 | `memory/INDEX.json` |
| `pontes` | Links explícitos para outros setups: `setup_id`, `title`, e **por que** a ponte existe | `cross_setup_refs` acumulados de `memory/INDEX.json` |
| `estado-atual` | 3–5 linhas: o que está sólido, o que está frágil, o que ficou pendente | `memory/profile.json` + `memory/progress.json` |

A seção `pontes` é o que transforma um conjunto de pastas em grafo: cada vez que uma sessão de
Cálculo puxa algo de Álgebra Linear, `close_session` acrescenta a ponte **nos dois** setups
(no setup de origem como "usei", no setup de destino como "foi usado por") — desde que o setup de
destino esteja `active` e gravável. Se não estiver, a ponte fica registrada só de um lado, com
`reciprocal: false`.

### 4.2 Quem atualiza e quando

- `readme-sync.sh <setup_root>` roda em `close_session`, sempre, depois de `memory-index.sh` e
  `progress-update.sh` (ele lê os derivados que aqueles produzem).
- `readme-sync.sh <setup_root> --init` roda em `setup_interview`, gerando o esqueleto com todas as
  seções vazias, para que o setup já seja referenciável desde a sessão zero.
- É **idempotente**: rodar duas vezes seguidas sem sessão nova no meio produz o mesmo arquivo.
- É **reconstruível**: apagar o `README.md` do setup e rodar `readme-sync.sh` devolve tudo, exceto a
  prosa que o aluno tinha escrito fora dos marcadores. Por isso o script nunca reescreve o arquivo
  inteiro quando os marcadores existem.

### 4.3 Orçamento

O `README.md` do setup tem teto de **200 linhas** na parte gerada. Acima disso, `linha-do-tempo`
encolhe primeiro (menos sessões listadas), depois `destilados` e `desafios` viram contagem +
os 10 mais recentes. Motivo: ele é lido inteiro pela leitura cruzada, e um nó de grafo que custa
5k tokens deixa de ser barato o suficiente para ser consultado.

---

## 5. ⭐ O caminho de leitura cruzada

**Cenário**: o aluno está no setup de Cálculo, chega em mudança de variável, e diz "isso não é a
mesma matriz de mudança de base que eu vi em Álgebra Linear?".

### 5.1 O mecanismo, passo a passo

Acontece dentro do passo `teach` (`docs/01-arquitetura.md` do repositório §3).

1. **Gatilho.** O aluno menciona um assunto que não está na taxonomia do setup corrente, ou cita
   outro setup pelo nome, ou pergunta explicitamente pela ligação. A leitura cruzada **não** é
   disparada por similaridade automática de tema a cada turno (D-A15) — isso encheria o contexto e
   quebraria a promessa de foco.
2. **Localização.** `setup-list.sh --find <termo> --json` (3.3) lê o registry e casa `<termo>`,
   por `grep -i` simples via `jq`, contra `subject`, `taxonomy[]` e `topics[]` de cada entrada com
   `setup_status == "active"`. Sem embeddings, sem índice invertido: o registry tem dezenas de
   entradas, não milhares.
3. **Desambiguação.** Zero resultados → o tutor diz que não achou e ensina do zero. Um resultado →
   segue. Mais de um → mostra a lista (`title` + `path` + `last_session_at`) e pergunta.
4. **Leitura.** Lê **apenas** `"<path>/README.md"` — o `README.md` do setup do outro assunto. Nunca
   `memory/`, nunca `NNNN.json`, nunca `challenges/`. Teto: **1 setup por turno** e **200 linhas**.
5. **Extração.** Do que foi lido, entram no contexto da aula corrente somente as seções
   `taxonomia`, `base-teorica` e `estado-atual`. `linha-do-tempo` e `pontes` são lidas mas **não**
   entram — a primeira é episódica, a segunda é navegação.
6. **Aprofundamento sob autorização.** Se o `README.md` do setup de destino apontar um destilado
   relevante (`researchs/0012.md`), o tutor **pergunta** antes de abrir:
   "Tem um resumo de mudança de base lá no setup de Álgebra Linear. Quer que eu puxe?".
   Só então lê aquele arquivo específico — nunca o diretório todo.
7. **Anúncio.** O tutor sempre diz de onde tirou: *"isso você já viu no seu setup de Álgebra
   Linear — lá você chegou a `mastered` em mudança de base."* Referência cruzada silenciosa é
   indistinguível de alucinação.
8. **Registro.** `close_session` grava em `memory/NNNN.json`:

   ```json
   "cross_setup_refs": [
     { "setup_id": "9f2c41ab77e0", "setup_name": "algebra-linear",
       "sections_read": ["taxonomia", "base-teorica"],
       "reason": "mudanca de variavel <-> mudanca de base" }
   ]
   ```

   E `readme-sync.sh` promove isso para a seção `pontes` dos dois `README.md` do setup envolvidos.

### 5.2 O que a leitura cruzada nunca faz

- Nunca lê `memory/` de outro setup. O que o aluno errou em Álgebra Linear em março não é assunto da
  aula de Cálculo de hoje, e trazer isso é ancoragem (`docs/research/02-memoria-llm.md` do
  repositório §7) com o agravante de cruzar contextos.
- Nunca escreve em outro setup, exceto a linha da seção `pontes` via `readme-sync.sh`, e só se o
  setup de destino estiver `active`.
- Nunca abre mais de um setup por turno. Se o assunto puxa três setups, o tutor escolhe um e diz
  quais ficaram de fora.
- Nunca lê setup com `setup_status` `missing` ou `archived`.
- Nunca lê setup cujo manifesto tenha `privacy.allow_cross_read: false` (chave reservada no
  `setup-manifest.schema.json`, default `true`).

### 5.3 O limite de privacidade

Ler o `README.md` do setup de outro assunto **é** mover informação pedagógica sobre o aluno de um
contexto para outro: o estado de proficiência dele, o que ele domina e o que é frágil. Numa máquina
pessoal de um único aluno, isso é o comportamento desejado — é literalmente o que o usuário pediu.
O risco aparece quando um setup deixa de ser só dele: sincronizado numa nuvem, versionado num
repositório público, ou compartilhado com um colega.

Por isso a arquitetura já reserva o interruptor (`privacy.allow_cross_read`), limita a superfície de
leitura ao `README.md` do setup e exige anúncio explícito. **O tratamento completo — o que é dado
pessoal, o que nunca se persiste, apagamento sob pedido, e se o setup vai ou não para o git — é da
sub-tarefa 2.8** (`docs/11-seguranca-privacidade.md` do repositório). Este documento apenas garante
que os pontos de controle existam e sejam implementáveis.

---

## 6. Contratos que outras sub-tarefas devem respeitar

1. `setup_status: active | missing | archived` — vocabulário fechado, dono desta sub-tarefa.
2. `setup_id` é a identidade; `path` e `setup_name` são atributos. Nenhum script pode usar caminho
   como chave primária.
3. O `README.md` do setup usa marcadores `<!-- study-method:begin <secao> -->` /
   `<!-- study-method:end <secao> -->` com os 8 nomes de seção do §4.1. `readme-sync.sh` (3.4) é o
   único escritor dentro dos marcadores.
4. `memory/NNNN.json` carrega `cross_setup_refs: []` com a forma do §5.1 item 8 (2.2).
5. Toda escrita no registry passa por lock (`mkdir`) + `mv` atômico (3.3).
6. A chave reservada `privacy` do `setup.json` é extensível e pertence à sub-tarefa 2.8; esta
   sub-tarefa só define `privacy.allow_cross_read` (booleano, default `true`).
7. `setup-list.sh` (3.3) precisa dos subcomandos `--resolve <cwd>`, `--find <termo> --json`,
   `--archive <setup_id>`, `--forget <setup_id>` e `--all`, além da listagem sem argumento.
   A tabela completa de interfaces de linha de comando está em `docs/01-arquitetura.md` do
   repositório §6.1.
8. Todo campo do registry marcado como "espelho" no schema tem o `setup.json` como origem de
   verdade. Em divergência, o manifesto ganha e o registry é corrigido — nunca o contrário.

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-A12 | Onde fica o registry global de setups? | `${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/registry.json` · `~/.study-method/registry.json` · dentro do primeiro setup criado | O caminho XDG com override por `STUDY_METHOD_HOME` — respeita a convenção do sistema e continua sobrescrevível em um comando | moderate |
| D-A13 | O setup se auto-registra no registry, ou registrar é um comando explícito do aluno? | Auto-registro dentro de `setup-init.sh` · Comando `setup-list.sh --register <path>` · Auto-registro com confirmação de uma linha | Auto-registro em `setup-init.sh` — um setup que não está no registry é invisível para a leitura cruzada, e ninguém lembra de registrar depois | cheap |
| D-A14 | O que fazer quando o registry aponta para um setup que não existe mais? | Marcar `missing` e seguir calado · Perguntar ao aluno o que fazer · Remover a entrada automaticamente | Marcar `missing`, manter a entrada para sempre, mencionar no máximo uma vez por sessão e só se for relevante | cheap |
| D-A15 | A leitura cruzada é automática (a skill decide sozinha quando puxar outro setup) ou só quando o aluno menciona? | Só quando o aluno menciona/pergunta · Automática por similaridade de tópico a cada turno · Automática só no `plan_lesson` | Só quando o aluno menciona — automática por similaridade enche o contexto e desvia o foco da aula | cheap |
| D-A16 | Quanto de outro setup a leitura cruzada pode ler? | Só o `README.md` do setup · `README.md` do setup + `researchs/` sob autorização · Também `memory/` | `README.md` do setup, com `researchs/NNNN.md` específico só sob autorização explícita; `memory/` nunca | moderate |
| D-A17 | O registry guarda um `default_setup_id` (o setup usado quando a skill roda fora de qualquer setup)? | Sim, com confirmação de uma linha · Sim, aplicado em silêncio · Não, sempre listar e perguntar | Sim, com confirmação de uma linha — economiza uma pergunta na maioria das sessões sem nunca abrir o setup errado calado | cheap |
| D-A18 | Dois setups podem ter o mesmo `setup_name`? | Sim, desempatados por `path`/`last_session_at` · Não, `setup-init.sh` recusa nome repetido | Sim — unicidade global dependeria do registry, que é justamente o componente que pode estar desatualizado | moderate |
| D-A19 | O aluno copiou a pasta de um setup; agora há dois caminhos vivos com o mesmo `setup_id`. O que fazer? | Sortear `setup_id` novo para a cópia recém-aberta · Recusar abrir até o aluno resolver · Tratar como o mesmo setup e usar o último caminho | Sortear `setup_id` novo para a cópia e registrar as duas — copiar pasta é backup ou fork, e nenhum dos dois deve corromper o histórico do original | moderate |
| D-A20 | O `README.md` do setup é regenerado inteiro ou só entre marcadores? | Só entre marcadores, preservando a prosa do aluno · Regenerar o arquivo inteiro · Gerar em arquivo separado e deixar o `README.md` do setup 100% do aluno | Só entre marcadores — o aluno vai querer escrever notas ali, e perdê-las uma vez destrói a confiança no arquivo | cheap |
| D-A21 | O diretório do setup (incluindo `memory/`) entra em controle de versão? | Não versionar (`.gitignore` gerado no `setup_interview`) · Versionar tudo · Versionar o `docs/` do setup, `researchs/` e `challenges/`, mas não `memory/` | Não versionar por padrão e dizer isso uma vez ao aluno; ver sub-tarefa 2.8 para o tratamento completo de dado pessoal | moderate |
| D-A22 | Setup que mudou de lugar: corrigir o `path` no registry automaticamente ou perguntar? | Corrigir automaticamente quando o caminho antigo não existe mais · Sempre perguntar · Só corrigir com `--fix` explícito | Corrigir automaticamente e registrar na sessão — não há alternativa razoável a corrigir um caminho morto | cheap |
