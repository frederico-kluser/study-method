# Parte 7 — Scripts, biblioteca e templates

> **Autoridade.** `docs/00-contratos.md` §5 (exit codes), §7 (contrato de `lib/`) e §8 (tabela
> canônica de CLI). Contrato de templates: `skills/study-method/assets/templates/MANIFEST.tsv` — se
> qualquer documento divergir dele sobre caminho, script consumidor ou placeholder, **o
> `MANIFEST.tsv` vence**. Algoritmos e degradações por script: `docs/build-spec/30-lib-setup.md`,
> `31-sessao-docs.md`, `40-memoria.md`, `41-progresso-readme.md`, `50-sandbox.md`,
> `51-challenge-new.md`, `52-challenge-verify.md`, `60-templates.md`, `70-render.md`.
>
> Onde este bloco divergir de `docs/00-contratos.md`, o contrato vence e este bloco é o errado.

## Sumário da Parte 7

1. Os **19** componentes de `SK/scripts/`: invocação, stdout, exit codes e o passo que chama cada um (§7.1–§7.3).
2. A tabela única de exit codes, as duas exceções nomeadas e os códigos **observados** do ambiente (§7.4).
3. As 6 regras de biblioteca e a interface função a função de `lib/common.sh`, `lib/json.sh` e `lib/sandbox.sh` (§7.5–§7.8).
4. Alocação sequencial atômica e escrita atômica obrigatória — os dois mecanismos que sustentam o resto (§7.9, §7.10).
5. O contrato dos templates: `MANIFEST.tsv`, sintaxe de placeholder, e a regra de que nenhum placeholder sobrevive ao artefato (§7.11).
6. ⭐ O contrato das marcas de corpo `SM_CORPO_INICIO`/`SM_CORPO_FIM`, e por que sem elas o gerador aborta (§7.12).

**Convenção:** `SK/` = `skills/study-method/`. `<setup_root>` = raiz do setup do aluno (nos scripts,
a variável é `SM_SETUP_ROOT`). ⏳ marca o que envelhece. ⭐ marca o que não se reinventa sem errar.

---

## 7.1 ⭐ A tabela canônica dos 19 scripts

**Os scripts do projeto são estes 19** — 16 executáveis + 3 arquivos de `lib/`. `challenge-run.sh` e
`render-html.sh` foram **removidos**: não tinham contrato, e suas funções pertencem ao `runner.sh`
gerado dentro do desafio e ao `render-plot.py`, respectivamente. **Nenhum documento pode citá-los** —
nem numa frase de negação: a invariante **I-05** é um grep que precisa sair **vazio**.

| # | Script | Invocação | stdout | Exit codes | Passo(s) que chama |
|---|---|---|---|---|---|
| 1 | `lib/common.sh` | `source` apenas | — | n/a (LIB-1) | — (base dos outros 16) |
| 2 | `lib/json.sh` | `source` apenas | — | n/a (LIB-1) | — |
| 3 | `lib/sandbox.sh` | `source` apenas | — | n/a (LIB-1) | — (usado pelo `runner.sh` do desafio, passo `challenge`) |
| 4 | `setup-init.sh` | `<path> --subject <s> --subject-slug <sl> --title <t> [--language <l>] [--skill-level <n>] [--session-minutes <n>] [--theory-source <ts>] [--defaults-used <csv>]` | O `setup_id` alocado (12 hex) | 0 · 1 · 2 · 4 (registry) · 5 | `setup_interview` |
| 5 | `setup-list.sh` | sem argumento = lista `active` · `--resolve <cwd>` · `--find <termo> --json` · `--archive <setup_id>` · `--forget <setup_id>` · `--all` · `--json` | Lista legível, ou JSON com `--json`; `--resolve` imprime o **caminho absoluto** do setup | 0 · 1 · 2 · 3 (`--resolve` sem achar nada) · 4 | `bootstrap` (`--resolve`) · `teach` (`--find`, leitura cruzada) |
| 6 | `session-new.sh` | `<setup_root> [--goal <texto>]` | O `NNNN` alocado | 0 · 1 · 2 · 3 · 4 (lock vivo) · 5 | `open_session` |
| 7 | `session-close.sh` | `<setup_root> [--session <NNNN>] [--recover <NNNN>] [--apply <resposta.json>]` | O `NNNN` fechado | 0 · 1 · 2 · 3 · 5 · **10** (`fill_session_fields`) | `close_session` |
| 8 | `research-new.sh` | `<setup_root> --topic <slug> [--sources <csv>] [--session <NNNN>]` | O caminho **relativo** de `researchs/NNNN.md` | 0 · 1 · 2 · 3 · 4 | `teach` |
| 9 | `docs-index.sh` | `<setup_root> [--topics t1,t2] [--budget-bytes N] [--force] [--select] [--apply <resposta.json>]` | JSON: `{mode, files, selected_sections, excluded, total_ingestible_bytes}` | 0 · 1 · 2 · 3 · 5 · **10** (`select_sections`) | `load_docs` |
| 10 | `memory-index.sh` | `<setup_root> [--verify] [--rebuild]` | Resumo JSON: `{sessions, orphans_closed, quarantined, rebuilt}` | 0 · 1 · 2 · 3 · 5 | `load_memory` (`--verify`) · `close_session` (sem flag) |
| 11 | `memory-digest.sh` | `<setup_root> [--topics t1,t2] [--budget-chars N] [--today AAAA-MM-DD]` | **O digest JSON**, ordem de chaves fixa, forma fixa (nenhuma chave desaparece) | **0 sempre que produzir um digest** — inclusive com `memory/` vazia, índice ausente, bruto corrompido ou orçamento estourado. `!= 0` só se não conseguir escrever em stdout | `load_memory` |
| 12 | `memory-compact.sh` | `<setup_root> [--if-due] [--force] [--apply <resposta.json>]` | Resumo JSON: `{sessions_compacted, facts_created, facts_superseded, facts_reconfirmed}` | 0 · 1 · 2 · 3 · 5 · **10** (`compact_facts`) | `close_session` (`--if-due`) |
| 13 | `progress-update.sh` | `<setup_root> [--event <evento.json>] [--due] [--recompute]` | `--due` imprime a lista de conceitos vencidos (JSON); `--recompute` imprime o diff | 0 · 1 · 2 · 3 · **4** · 5 | `plan_lesson` (`--due`) · `close_session` (`--event`) |
| 14 | `readme-sync.sh` | `<setup_root> [--init]` | O número de linhas geradas | 0 · 1 · 2 · 3 | `setup_interview` (`--init`) · `close_session` |
| 15 | `challenge-new.sh` | `<setup_root> --language <l> --slug <sl> --concept <concept_id> [--difficulty 1..5] [--skill-level <n>]` | O caminho **relativo** de `challenges/<NNNN>-<slug>/` | 0 · 1 · 2 · 3 · 4 · 5 | `challenge` |
| 16 | `challenge-verify.sh` | `<challenge_dir> [--sample-size N] [--n-rep N] [--apply <resposta.json>]` | Resumo JSON: `{verdict, mutation_score, killed, survived, rejections}` | 0 (`approved`) · 1 · 2 · 5 (schema do `meta.json`) · **10** (`classify_survivor`) | `challenge` |
| 17 | `detect-toolchains.sh` | `[--cached] [--setup <setup_root>] [--language <l>] [--json]` | JSON: por linguagem, `{available, version, command}` | 0 · 1 · 2 | `bootstrap` (`--cached`, se `language.detected_at` > 30 d) · `setup_interview` (filtra o menu de Q4) |
| 18 | `render-plot.py` | `[--spec CAMINHO\|-] [--out-dir DIR] [--basename NOME] [--width N] [--height N] [--ascii-width N] [--ascii-height N] [--formats svg,html,txt,md] [--png] [--quiet]` | JSON: `{ok, type, outputs, description_text, ascii_text, warnings, stats}` | **Exceção nomeada** (§1.5.2): 0 · 1 · 2 · 3 | `teach` |
| 19 | `decisions-ask.sh` | `<fase> --setup <setup_root> [--json] [--answer <id>=<valor>]`, com `fase ∈ {setup-init, first-challenge, session-15, on-demand}` | As decisões pendentes daquela fase, em JSON | 0 · 1 · 2 · 3 · 5 | `setup_interview` (`setup-init`) · `challenge` (`first-challenge`) |

⏳ **Estado medido no repositório:** `decisions-ask.sh` está declarado nesta tabela e **ainda não
existe em disco**. `tests/validate.sh` marca `I-06b` como **PEND** (vermelho, com o artefato faltante
nomeado) enquanto ele não for escrito — ver §8.9.3. Os outros 18 existem.

### 7.1.1 Três afirmações que o `SKILL.md` precisa carregar

Porque mudam a decisão do modelo em runtime:

| Script | Afirmação obrigatória |
|---|---|
| `memory-digest.sh` | **sempre exit 0** — falha de memória **nunca** impede a aula de começar |
| `challenge-verify.sh` | veredito `weak`/`rejected` sai **0**, com o veredito no stdout: **reprovar o desafio não é erro do script** |
| `readme-sync.sh` | **idempotente** — duas execuções seguidas produzem o mesmo arquivo, byte a byte |

### 7.1.2 Duas decisões de CLI que parecem redundantes e não são

- **`session-close.sh --recover <NNNN>` fica.** É o fechamento retroativo de uma sessão órfã **pedido
  à mão** (`status: "abandoned"`, `finalized_by: "auto_orphan_recovery"`), para o caso que o
  `--verify` não alcançou. **Não conflita com o dono único**: o fechamento **automático** de órfã
  continua sendo de `memory-index.sh --verify`, único; `--recover` é a porta **manual** da mesma
  operação, nunca um segundo caminho automático. ⚠ `SK/references/scripts.md` afirma
  "**Não tem `--recover`**" — divergência conhecida; o contrato vence (§7.15).
- **`docs-index.sh --select` é o gatilho do exit 10, e é o único.** Sem ele o script indexa e sai 0
  pela heurística determinística. `--select` e `--apply` são **mutuamente exclusivos**: combiná-los
  é **2**.

---

## 7.2 Convenção de invocação

**Todo script recebe `<setup_root>` como primeiro argumento posicional**, exceto:

| Script | Primeiro argumento |
|---|---|
| `setup-init.sh` | `<path>` — ainda não existe setup ali |
| `challenge-verify.sh` | `<challenge_dir>` |
| `detect-toolchains.sh` | nenhum posicional (`--setup <setup_root>` é opcional) |
| `render-plot.py` | nenhum posicional |
| `decisions-ask.sh` | `<fase>` (`--setup <setup_root>` como flag) |
| os três de `lib/` | nunca invocados — apenas `source` |

Isso revoga a forma `memory-digest.sh --memory-dir <caminho>` que circulava em `docs/03`.

Todos vivem em `scripts/`, relativo ao diretório da skill instalada
(`~/.claude/skills/study-method/` ou `<projeto>/.claude/skills/study-method/`).

---

## 7.3 O que nenhum dos 19 faz

| Proibição | Invariante que cobra |
|---|---|
| Chamar o modelo | §1.6 — a fronteira é o protocolo REQUEST/APPLY, sempre |
| Acessar a rede | **I-26**: zero `curl`/`wget`/`nc`/`ncat`/`ssh`/`scp`/`sftp`/`rsync`/`telnet` como palavra, zero `/dev/tcp`, zero `ftp://` em linha de código |
| Instalar qualquer coisa | `sm_require_cmd` **nomeia** o que falta e como instalar — **nunca instala** |
| Escrever fora do setup e do `STUDY_METHOD_HOME` | **I-25** |
| Escrever no `docs/` do setup fora de `generated/` | **I-24** |
| Gravar caminho absoluto dentro de arquivo do setup | **I-37** — o único absoluto do projeto é `registry.json` → `setups[].path` |
| Apagar dado do aluno | `SEG-8 †`: **move**, nunca apaga |

---

## 7.4 Exit codes

> **A tabela canônica (`0 1 2 3 4 5 10` + o que o tutor faz com cada um), as duas exceções nomeadas
> (`runner.sh` do desafio e `render-plot.py`), os exit codes **observados** que os scripts precisam
> interpretar (137, 124, 142, 152, 153, 66, 101, 134, 5, "0 com falha") e a unidade de `ulimit -f`
> estão em **§1.5**, e não são repetidos aqui.**

O que é específico dos scripts, e vale registrar neste ponto da construção:

| Fato | Consequência para quem escreve o script |
|---|---|
| `I-18` cobra o vocabulário | Todo executável fora de `lib/` usa **apenas** `0 1 2 3 4 5 10`; 6–9 e 11+ são reservados |
| `I-23` cobra o produtor do 10 | **`sm_request` é a única função de todo o projeto que produz exit 10** |
| `I-21` cobra a leitura | `!= 0` é falha, **jamais** `== 1`; e `set -o pipefail` (ou `${PIPESTATUS[0]}`) em todo pipe |
| `I-22` cobra o par `--apply` × 10 | Só os **quatro** scripts do protocolo aceitam `--apply` e podem sair com 10 |

---

## 7.5 ⭐ As 6 regras de biblioteca

Valem para os três arquivos de `SK/scripts/lib/`. Mudar a interface abaixo exige mudar
`docs/00-contratos.md` §7 **primeiro**.

| # | Regra |
|---|---|
| **LIB-1** | São **apenas `source`**, nunca executados. Sem shebang executável, sem bloco `main`, modo **`0644`**, e o gate falha se algum tiver bit de execução |
| **LIB-2** | Toda função tem prefixo **`sm_`**. Nenhuma variável global sem prefixo **`SM_`** |
| **LIB-3** | Nenhuma função escreve em stdout **além do valor documentado**. Log, aviso e diagnóstico vão **sempre** para stderr |
| **LIB-4** | Nenhuma função chama `exit` **exceto `sm_die`**. As demais devolvem via *return code*; quem decide abortar é o script chamador |
| **LIB-5** | `set -u` é assumido; `set -e` **não** é assumido (o chamador controla). Nenhuma função depende de `errexit` |
| **LIB-6** | Ferramentas permitidas: **bash 4+, coreutils, `jq`** (única ferramenta estruturada garantida), **`python3` da stdlib**. Nada mais é assumido sem `sm_require_cmd` |

Há **uma** exceção nomeada a LIB-4: `sm_request` (§7.7), que produz `exit 10`. É a única função de
todo o projeto que produz esse código (**I-23**).

Invariantes que cobram estas regras: **I-19** (modo, ausência de `main`/`"$@"` de topo),
**I-20** (toda função exportada está na tabela, e vice-versa — 26 funções entre `common.sh` e
`json.sh`), **I-23**.

---

## 7.6 `lib/common.sh` — 17 funções

Globais exportadas (prefixo `SM_`): `SM_LIB_DIR` (diretório da lib, resolvido de `BASH_SOURCE` no
`source`), `SM_REGISTRY_LOCK_DIR` (lock de registry em posse; vazio = nenhum), `SM_ASCII_FOLD`
(tabela `origem:destino` de dobra para ASCII), `SM_STOPWORDS`.
Variáveis de ambiente lidas: `HOME`, `PWD`, `HOSTNAME`, `STUDY_METHOD_HOME`, `XDG_DATA_HOME`,
`STUDY_METHOD_LOG`, `STUDY_METHOD_TODAY`, `STUDY_METHOD_NOW`, `SM_SESSION_ID`.

> **A tabela das 17 funções — argumento, stdout e exit code de cada uma — está em §1.7.1, e não é
> repetida aqui.** Esta seção transcreve o que a tabela não cabe: os **algoritmos** que precisam ser
> reproduzidos exatamente.

### 7.6.1 Os dois normalizadores — algoritmos determinísticos

São **namespaces distintos por design**: `concept_id` (snake_case) para conceito; `slug`
(kebab-case) para tópico, tag, nome de diretório e nome de arquivo. Nunca se converte um no outro.

`sm_normalize_concept_id`, passo a passo:

1. Rótulo vazio ⇒ **2**.
2. Dobra para ASCII por substituição de string em bash (`${s//á/a}` …), **byte-safe em UTF-8 e
   independente de locale**; a tabela é `SM_ASCII_FOLD` e cobre acentuação pt-BR + `º ª æ œ ß`.
3. Minúsculas (`${s,,}`).
4. `LC_ALL=C tr -c 'a-z0-9' '_'`: tudo que não é `[a-z0-9]` vira `_`.
5. Divide em tokens por `_`, descarta token vazio e descarta as **stopwords** `de da do em e a o por
   com`; junta de novo com `_` (o colapso de `_` repetido é consequência).
6. Remove `_` das pontas. Resultado vazio ⇒ **2**.
7. Não começa em `[a-z]` ⇒ prefixa `c_` (preserva informação; **nunca corta o começo**).
8. Trunca em **63**; remove `_` final; se sobrou 1 caractere, acrescenta `_` (o pattern exige ≥2).
9. Confere contra `^[a-z][a-z0-9_]{1,62}$`; não casou ⇒ **2**.

Exemplos verificados: `Derivadas: o conceito` → `derivadas_conceito` · `Análise de Complexidade` →
`analise_complexidade` · `funções de 1º grau` → `funcoes_1o_grau` · `1º grau` → `c_1o_grau`.

`sm_normalize_slug`: passos 2–4 iguais, com `-` no lugar de `_`; colapsa `--`, remove `-` das pontas,
trunca em **64**. **Não remove stopwords** — slug é nome de diretório e de arquivo.
`Análise de Complexidade` → `analise-de-complexidade`.

### 7.6.2 O furo do `sm_setup_lock`

Está transcrito em **§1.7.4**, junto da interface da função: as duas vias de validação (dono
declarado por `SM_SESSION_OWNER_PID`, e TTL de 8 h quando ela está ausente), a precedência do
`hostname`, e o defeito medido que obrigou as duas.

---

## 7.7 `lib/json.sh` — 9 funções

Globais: `SM_JSON_SCHEMA_CHECKER` (default `$SM_LIB_DIR/_jsonschema_min.py`), `SM_PROTOCOL`
(`study-method/request-apply`), `SM_PROTOCOL_VERSION` (`1.0`). Lê `SM_SETUP_ID`.
**Todo acesso a `jq` usa redirecionamento** (`jq FILTRO < "$arquivo"`), nunca o caminho como
argumento — caminho com espaço ou iniciado por `-` funciona.

> **A tabela das 9 funções está em §1.7.2, e não é repetida aqui.** O que segue são as três
> obrigações de implementação que a tabela não cabe, e cuja perda quebra o protocolo.

### 7.7.1 `sm_json_validate` — as duas obrigações que não são opcionais

Implementado pelo verificador mínimo em **Python stdlib** (`SK/scripts/lib/_jsonschema_min.py`) — não
há `jsonschema` nesta máquina e o PEP 668 impede instalar. Cobertura e recusas: §8.10.

Duas obrigações que vêm da regra "a fase de PEDIDO não escreve nada em disco":

1. **aceitar caminho de FIFO**;
2. **ler o arquivo uma única vez** — nada de `test -r` seguido de `open`, nada de duas passadas, nada
   de reabrir para contar linha.

Sem as duas, validar na fase de PEDIDO só seria possível gravando um temporário — **e temporário é
escrita**. FIFO ilegível ou vazia é **5**, nunca 0.

Regras de tipo do verificador: `boolean` **não** é `integer` (o `bool` do Python é excluído
explicitamente); `integer` casa `number`. Ponteiro em RFC 6901 (`~`→`~0`, `/`→`~1`; raiz = string
vazia), motivo em pt-BR, **teto de 200 erros**. A função devolve `5` para qualquer não-zero do
Python, e também quando falta `python3` ou o próprio verificador.

### 7.7.2 `sm_request` — como o `request_id` é calculado

1. Argumento faltando ou payload que não é JSON ⇒ `sm_die 1` (erro de programação do chamador).
2. `canon = sm_json_canon(payload)` (`jq -cS .`).
3. `request_id` = **12 primeiros hex do `sha256` de `canon` SEM newline final**
   (`printf '%s' "$canon" | sha256sum | cut -c1-12`). Invariante a ordem de chaves e a espaço.
4. Monta o envelope com `jq -n`; `setup_id` vem de `$SM_SETUP_ID` e é `null` se vazio.
5. Escreve o envelope em **stdout** e `exit 10`. **Nada em disco.**

**Normativo:** o `generated_at` que entra **no payload** é derivado do **disco** (o `mtime` do
artefato lido), **nunca `sm_now_iso`**. É essa escolha que dá reprodutibilidade (dois PEDIDOS sobre o
mesmo estado têm o mesmo `request_id`) e recusa de estado alterado (qualquer escrita entre as fases
move o `mtime`, muda o id e faz `--apply` sair **5**). O `generated_at` do **envelope** é o relógio de
emissão e **não entra** no cálculo — por isso pode honrar `STUDY_METHOD_NOW` sem afetar o id.

### 7.7.3 `sm_apply_read` — a ordem das validações

Valida, **antes** de devolver qualquer item: arquivo legível (senão **2**) · JSON parseável ·
`protocol == SM_PROTOCOL` · `protocol_version == SM_PROTOCOL_VERSION` · `kind` igual ao esperado ·
`request_id` igual ao esperado · `.items` do tipo `array`. Qualquer divergência ⇒ **5** com o motivo
em stderr. Só então imprime `jq -c '.items'`. A validação da RESPOSTA **contra o `response_schema`**
é do script chamador, via `sm_json_validate`.

---

## 7.8 `lib/sandbox.sh` — contrato mínimo

Dono do racional: `docs/11-seguranca-privacidade.md` §2 do repositório.

> **As quatro funções (`sm_sandbox_probe`, `sm_sandbox_report`, `sm_sandbox_run`,
> `sm_sandbox_classify_exit`) estão em §1.7.3; a pilha canônica camada a camada, os quatro
> parâmetros medidos, a degradação por plataforma e a linha de honestidade dita ao aluno estão em
> §3.12. Nada disso é repetido aqui** — o sandbox só existe por causa do desafio, e uma segunda
> descrição da pilha seria uma segunda verdade sobre o que está ligado.

A única regra que pertence a esta parte, porque é regra de **biblioteca**: `lib/sandbox.sh` obedece
`LIB-1`…`LIB-6` como os outros dois arquivos de `lib/`, e **é o único ponto do projeto que monta a
pilha**. O `runner.sh` gerado dentro do desafio a consome (`sm_sandbox_run "$CHALLENGE_DIR" -- …`) ou
declara o **piso** em voz alta; nunca monta uma segunda.

---

## 7.9 ⭐ Alocação sequencial atômica — `sm_next_seq`

Todo identificador numerado do projeto (`memory/NNNN.json`, `researchs/NNNN.md`,
`challenges/<NNNN>-<slug>/`) sai daqui. **Nunca reaproveita número purgado.**

O algoritmo, passo a passo:

1. `mkdir -p "$dir"`.
2. Até **5** tentativas. Em cada uma: `max` = maior `NNNN` visto em `"$dir"/NNNN<sufixo>` **e** em
   `"$dir"/*/NNNN<sufixo>` (**um nível**: cobre `memory/discarded/` e `memory/broken/`, e é o que
   garante que **número purgado nunca é reaproveitado**); com sufixo vazio, também `"$dir"/NNNN-*`
   (cobre `challenges/<NNNN>-<slug>/`).
3. `seq = max + 1`, zero-padded em 4 dígitos; `> 9999` ⇒ **1**.
4. Criação com `( set -o noclobber; : > "$dir/NNNN<sufixo>" )` — **falha se o arquivo já existe**.
   Sucesso ⇒ imprime `NNNN`, **0**. O arquivo criado é a **reserva**: quem chamou grava por cima com
   `sm_atomic_write`.
5. Colisão ⇒ recuo curto e aleatório (`sleep 0.0N`, `N < 10`) e nova tentativa. **5 colisões ⇒ 4**.

### 7.9.1 Por que o mecanismo funciona

O ponto que faz o esquema ser correto é o passo 4: `set -o noclobber` transforma o redirecionamento
`>` numa operação de criação **exclusiva** (`O_CREAT|O_EXCL`), que é atômica no sistema de arquivos.
Dois processos que calcularam o mesmo `max+1` disputam a criação; **exatamente um vence** e o outro
recebe erro do shell, recua e recalcula. Não há janela entre "decidir o número" e "reservar o número"
— a reserva **é** a decisão.

⏳ **Medido contra concorrência real:** 5 processos concorrentes × 20 alocações = **100 sucessos, 100
valores distintos, 0 duplicados, 0 exit 4**. E, após mover `0003.json` para `discarded/`, a alocação
seguinte é `max+1`, **não** `0003`.

### 7.9.2 O lock de `progress.json` é ortogonal

`progress-update.sh` **sai 4** porque tem lock próprio, `memory/.progress.lock` (diretório, `mkdir`
atômico, mesma disciplina de `sm_registry_lock`): duas escritas concorrentes em `progress.json`
corrompem o estado de proficiência. **O lock é do arquivo, não da sessão** — é ortogonal a
`memory/.session.lock`, e um não substitui o outro.

---

## 7.10 ⭐ Escrita atômica obrigatória — `sm_atomic_write`

Contrato: `mkdir -p` do `dirname`; temporário `"$dest.tmp.$$"` **no mesmo diretório**; conteúdo de
stdin via `cat`; `sync -- "$tmp"` (fallback `sync`); `mv -f`. Qualquer falha remove o temporário e
devolve **1** — **nunca deixa escrita parcial nem tmp órfão**.

O temporário fica no **mesmo diretório** do destino de propósito: `mv` só é atômico dentro do mesmo
sistema de arquivos. Um temporário em `/tmp` transformaria o `mv` numa cópia, e a cópia tem janela.

**Obrigatório para todos os derivados**, sem exceção (invariante **I-27**):

| Derivado | Onde |
|---|---|
| `INDEX.json` | `<setup_root>/memory/` |
| `profile.json` | `<setup_root>/memory/` |
| `progress.json` | `<setup_root>/memory/` |
| `docs-index.json` | `<setup_root>/memory/` |
| `setup.json` | `<setup_root>/` (o manifesto **do setup**) |
| `meta.json` | `<setup_root>/challenges/<NNNN>-<slug>/` (o manifesto **do desafio**) |
| `README.md` do setup | `<setup_root>/` |
| `registry.json` | `$STUDY_METHOD_HOME/` |

Toda aplicação do protocolo REQUEST/APPLY também passa por `sm_atomic_write` — nunca escrita parcial.

**Escopo declarado do gate:** `I-27` julga o **alvo** do `>`. O padrão canônico é montar em
`$SM_TMP/…` e publicar com `sm_atomic_write <final> < <temporário>`; um `>` cujo alvo é o temporário
não é violação, porque um temporário na origem não protege ninguém.

---

## 7.11 ⭐ O contrato dos templates

**Fonte de verdade: `SK/assets/templates/MANIFEST.tsv`.** Colunas separadas por TAB:
`caminho` · `script_consumidor` · `placeholders` · `obrigatorio`. Se este documento divergir dele,
**o `MANIFEST.tsv` vence**.

### 7.11.1 Sintaxe e regras gerais

| # | Regra |
|---|---|
| T-1 | Placeholder é `{{NOME_MAIUSCULO}}`, casando `^[A-Z0-9_]+$`. **Nenhum outro delimitador é aceito** |
| T-2 | Todo placeholder usado num template está na coluna 3 do `MANIFEST.tsv` **para aquele caminho**. O inverso não vale: um template pode deixar de usar um placeholder que o `MANIFEST` permite |
| T-3 | **Depois da substituição não pode sobrar `{{` nem `}}` no artefato.** É a checagem do gate (`G-09`, `L-03`) e o erro que os renderizadores levantam (`1`) |
| T-4 | `setup.json`, `session.json` e `meta.json` materializados **validam** contra `setup-manifest.schema.json`, `session.schema.json` e `challenge-manifest.schema.json`, com o verificador mínimo em Python stdlib |
| T-5 | Comentários dos templates em **pt-BR** (o aluno lê o artefato final); identificadores em inglês |
| T-6 | `runner.sh` é materializado com modo **`0755`**; os demais artefatos não precisam de bit de execução |
| T-7 | A substituição é um filtro em `python3` que troca `{{NOME}}` (`[A-Z][A-Z0-9_]*`) pelo valor do mapa. **Placeholder sem valor → erro nomeando o template.** O conteúdo entra **literal**: não passa por `sed`, então `/`, `&` e quebras de linha em blobs como `SCENARIOS_CODE` são seguros |
| T-8 | **Não há template embutido no gerador de desafios**: linha ausente no `MANIFEST` → **1**; arquivo ausente → **1**, nomeando o caminho. Um fallback interno significaria dois lugares dizendo o que é um desafio |

### 7.11.2 A lista completa — template × script consumidor × placeholders

| Template | Consumidor | Placeholders permitidos |
|---|---|---|
| `setup/README.md.tmpl` | `readme-sync.sh --init` | `SETUP_NAME, SUBJECT, SETUP_ID, CREATED_AT` |
| `setup/setup.json.tmpl` | `setup-init.sh` | `SETUP_ID, SETUP_NAME, SUBJECT, LANGUAGE, SESSION_MINUTES, THEORY_SOURCE, CREATED_AT, SCHEMA_VERSION` |
| `setup/gitignore.tmpl` | `setup-init.sh` | **nenhum** (`-` no MANIFEST) |
| `session/session.json.tmpl` | `session-new.sh` | `SESSION_ID, SETUP_ID, DATE, STARTED_AT, SCHEMA_VERSION` |
| `research/research.md.tmpl` | `research-new.sh` | `RESEARCH_ID, TOPIC, CREATED_IN_SESSION, CREATED_AT, SOURCES_JSON` |
| `challenge/README.md.tmpl` | `challenge-new.sh` | `CHALLENGE_ID, TITLE, STATEMENT, SCENARIOS_TABLE, LANGUAGE, RUN_CMD` |
| `challenge/meta.json.tmpl` | `challenge-new.sh` | `CHALLENGE_ID, TITLE, LANGUAGE, LAYOUT_PROFILE, CONCEPT_IDS, SCENARIOS_JSON, EXPECTED_TEST_COUNT, CREATED_AT, SCHEMA_VERSION` |
| `challenge/runner.sh.tmpl` | `challenge-new.sh` | `LANGUAGE, TEST_CMD, EXPECTED_TEST_COUNT, COUNT_PROBE` |
| `challenge/python/stub.py.tmpl` | `challenge-new.sh` | `FUNC_NAME, SIGNATURE, DOCSTRING` |
| `challenge/python/test_stub.py.tmpl` | `challenge-new.sh` | `FUNC_NAME, MODULE, SCENARIOS_CODE` |
| `challenge/node/stub.mjs.tmpl` | `challenge-new.sh` | `FUNC_NAME, SIGNATURE` |
| `challenge/node/stub.test.mjs.tmpl` | `challenge-new.sh` | `FUNC_NAME, MODULE, SCENARIOS_CODE` |
| `challenge/go/stub.go.tmpl` | `challenge-new.sh` | `FUNC_NAME, SIGNATURE, PKG` |
| `challenge/go/stub_test.go.tmpl` | `challenge-new.sh` | `FUNC_NAME, PKG, SCENARIOS_CODE` |
| `challenge/go/go.mod.tmpl` | `challenge-new.sh` | `PKG, GO_VERSION` |
| `challenge/rust/Cargo.toml.tmpl` | `challenge-new.sh` | `CRATE` |
| `challenge/rust/lib.rs.tmpl` | `challenge-new.sh` | `FUNC_NAME, SIGNATURE` |
| `challenge/rust/test_stub.rs.tmpl` | `challenge-new.sh` | `FUNC_NAME, CRATE, SCENARIOS_CODE` |
| `challenge/c/stub.c.tmpl` | `challenge-new.sh` | `FUNC_NAME, SIGNATURE` |
| `challenge/c/test_stub.c.tmpl` | `challenge-new.sh` | `FUNC_NAME, SCENARIOS_CODE` |

Dois arquivos **não têm template** e são escritos direto pelo gerador, porque são derivados
mecânicos: `stub.h` em C (o protótipo **é** a `SIGNATURE`) e `tests/__init__.py` em Python (é um
comentário).

### 7.11.3 O que os templates gravam sem placeholder — e por quê

O schema exige mais campos do que há placeholders. Os demais nascem **literais**, e a razão de cada
um é contratual (não é preguiça de template):

`setup.json.tmpl`: `title` reaproveita `{{SETUP_NAME}}` · `taxonomy` nasce `[]` · `updated_at`
reaproveita `{{CREATED_AT}}` (na criação os dois carimbos coincidem) · `session_count` nasce `0` ·
`decisions` nasce `{}` · `language` é objeto (`{"name": "{{LANGUAGE}}"}`).

`session.json.tmpl`: `status` nasce `"in_progress"` (**regra de negócio, não dado variável**) ·
`one_line_summary` nasce com o valor provisório literal "Sessão em andamento — resumo ainda não
escrito.", reescrito por `session-close.sh`.

`meta.json.tmpl` (19 campos de topo exigidos, 9 com placeholder) — os literais são todos coerentes
com `challenge_status: "draft"`, isto é, **nada foi validado ainda**:

| Campo | Valor | Razão |
|---|---|---|
| `slug` | `{{CHALLENGE_ID}}` | Sem placeholder próprio de slug; o slug legível do **diretório** é decidido por `challenge-new.sh`, fora do template |
| `updated_at` | `{{CREATED_AT}}` | Coincidem na criação |
| `skill_level` / `difficulty` | `"beginner"` / `1` | Defaults conservadores, refinados por `jq` depois |
| `artifacts.*` | nomes lógicos **sem extensão** (`stub`, `tests/test_stub`, `.solution/reference`, `README.md`, `runner.sh`, `.solution`) | Não há placeholder de extensão, e a extensão real depende só de `language`. Gravar `stub.py` fixo contradiria `layout_profile` para go/rust |
| `execution.test_command` | `["./runner.sh"]` | `runner.sh` é o **único** ponto de entrada; quem sabe invocar `python3`/`cargo`/`go test`/`gcc` é ele, não o `meta.json` |
| `execution.working_dir` | `"."` | `runner.sh` já fixa o próprio `cwd` |
| `execution.timeout_seconds` | `15` | Casa o default de `runner.sh.tmpl` |
| `execution.test_count_probe` | `"counter_protocol"` | `runner.sh` **sempre reemite** a contagem como `TESTS_RUN=<n>`, mesmo quando a sonda interna foi outra. Quem lê a saída de fora nunca precisa saber que por dentro havia `python_unittest_ran_line` ou `go_test_json_run_events` |
| `execution.failure_exit_codes` | `{"policy": "non_zero_is_failure"}` | Único campo obrigatório do subobjeto |
| `oracle.*` | `["reference_impl"]` / `"not_numeric"` | Scaffold neutro, refinado pelo gerador |
| `validation.*` | `verdict: "not_run"`, `generation_attempts: 0`, os 7 `steps.*.status: "skipped"` | "draft" honesto: **nunca inventa um veredito** |
| `integrity.policy` / `integrity.test_sha256` | `"warn"` / `null` | O SHA-256 é obrigatoriamente `null` até `challenge-verify.sh` aprovar — **o tutor nunca calcula SHA-256** |
| `student_progress.*` | `attempts: 0`, `last_result: "not_run"`, `hint_level_used: 0`, `solution_revealed: false` | Nenhum aluno tentou ainda |

`{{CONCEPT_IDS}}` e `{{SCENARIOS_JSON}}` são **blobs JSON inteiros pré-formatados**, inseridos crus
(`"target_concepts": {{CONCEPT_IDS}}`): não há como um template de substituição simples, sem laço,
gerar N objetos a partir de uma lista de IDs. `len(scenarios)` **deve** ser igual a
`{{EXPECTED_TEST_COUNT}}` — o schema não faz validação cruzada, então é responsabilidade de
`challenge-new.sh`.

### 7.11.4 `{{SIGNATURE}}` carrega semânticas diferentes por linguagem

Não há placeholder separado de tipo de retorno: cada `.tmpl` já decide a pontuação ao redor dele.

| Linguagem | Template usa | `{{SIGNATURE}}` contém |
|---|---|---|
| Python | `def {{FUNC_NAME}}({{SIGNATURE}}):` | só os parâmetros (`"n"`) |
| Node | `export function {{FUNC_NAME}}({{SIGNATURE}}) {` | só os parâmetros |
| Go | `func {{FUNC_NAME}}({{SIGNATURE}} {` | parâmetros + `) (retorno nomeado)` — ver §7.12.3 |
| Rust | `pub fn {{FUNC_NAME}}({{SIGNATURE}} {` | parâmetros + `) -> tipo` |
| C | `{{SIGNATURE}} {` | o **protótipo inteiro** (`"long fatorial(long n)"`) — em C o tipo de retorno vem antes do nome, então não dá para reaproveitar o padrão `NOME(SIGNATURE)` |

`{{MODULE}}` é o caminho de import visto **de dentro do arquivo de teste**: `"stub"` em Python (roda
de `tests/`, mas `unittest discover -s tests` mantém a raiz do desafio em `sys.path`) e `"../stub.mjs"`
em Node. `{{CRATE}}` (Rust) deve ser **snake_case**: é usado ao mesmo tempo como `package.name` do
`Cargo.toml` **e** como identificador em `use {{CRATE}}::{{FUNC_NAME}};`, e o template não tem como
replicar a conversão hífen→underscore que o `cargo` faz por baixo dos panos.

### 7.11.5 O `runner.sh` gerado

Ordem dos blocos **contratual**:

```bash
#!/usr/bin/env bash
set -u -o pipefail                       # -e FORA: o exit bruto do teste é dado, não acidente
CHALLENGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$CHALLENGE_DIR" || exit 66           # 66 = infraestrutura, nunca falha de teste
# argumentos: [--only <cenario>] [--help]
{{TEST_CMD}}                             # TIMEOUT_PADRAO · traduzir_cenario() · executar_testes()
```

Seis defesas, todas exercitadas na verificação:

1. **Piso declarado**: se `${STUDY_METHOD_SKILL_DIR}/scripts/lib/sandbox.sh` não é legível, o
   `runner.sh` **avisa em stderr** ("PISO DECLARADO… sem isolamento de rede, sem confinamento de
   escrita, sem limite de memória") e define um `sandbox_exec` local com `ulimit` + proxy inválido +
   `timeout -s KILL -k 5`.
2. **`timeout -s KILL -k 5 "$TIMEOUT_S"`** — sempre SIGKILL, nunca `timeout` simples (que trava
   dentro da pilha real em vez de matar).
3. **Timeout por tempo decorrido, nunca por exit code**: `T0`/`T1` via `date +%s%N`,
   `DECORRIDO_MS >= TIMEOUT_S*1000` decide, checado **antes** de olhar `EXIT_BRUTO`. Comprovado com
   um stub `while True: pass`: `EXIT_BRUTO=137`, nunca 124, e o veredito ainda assim é `timeout`
   (exit 3) porque veio do relógio.
4. **`cd "$DESAFIO_DIR" || exit 66`** — infraestrutura, nunca confundido com falha de teste (**I-38**).
5. **`set -u -o pipefail`**.
6. **Igualdade de contagem** (`[ "$TESTS_RUN" -ne "$ESPERADO" ]`), nunca `-eq 0` nem `> 0`.

⭐ **`{{TEST_CMD}}` é atribuído entre aspas SIMPLES** (`TEST_CMD='{{TEST_CMD}}'`), de propósito: com
aspas duplas, qualquer `$`/crase dentro do valor substituído seria expandido **na hora da
atribuição** — cedo demais, antes de `TEST_CMD` chegar ao `bash -c` que executa o comando.
Consequência para quem gera `TEST_CMD`: **nunca usar aspas simples dentro do valor** (use aspas
duplas quando precisar citar algo).

`{{COUNT_PROBE}}` seleciona, por `case`, qual sonda extrai `TESTS_RUN` de `$SAIDA`:
`python_unittest_ran_line` (`grep` de `Ran N tests`) · `node_test_tap_summary` (`grep` de
`# tests N`) · `go_test_json_run_events` (`jq` contando `Test` únicos com `Action:"run"`) ·
`cargo_test_running_lines` (soma de todas as linhas `running N tests`) · `counter_protocol` (`grep`
de `TESTS_RUN=N`). `jq` é ferramenta garantida (LIB-6), **sem fallback**.

---

## 7.12 ⭐⭐ O contrato das marcas de corpo — `SM_CORPO_INICIO` / `SM_CORPO_FIM`

**Este requisito não estava documentado em lugar nenhum e só foi descoberto quando o teste de
integração rodou.** É exatamente o tipo de armadilha que este documento existe para eliminar: um
template de stub sem as duas marcas produz um gerador que **aborta**, e a mensagem de erro só faz
sentido para quem já conhece o mecanismo.

### 7.12.1 O contrato

| # | Regra |
|---|---|
| **CM-1** | **Todo template de stub** (`challenge/<lang>/stub.*`, e `rust/lib.rs.tmpl`) carrega as linhas-marca `SM_CORPO_INICIO` e `SM_CORPO_FIM` **em volta do corpo vazio**, no comentário nativo da linguagem |
| **CM-2** | As marcas sobrevivem à substituição de placeholders: **não são placeholders**, são texto literal do template, e portanto aparecem **também no stub materializado** que o aluno recebe |
| **CM-3** | `challenge-new.sh` deriva `.solution/reference.<ext>`, `.solution/reference_alt_recursiva.<ext>` e `.solution/reference_alt_acumulador.<ext>` **do próprio stub materializado**, substituindo **tudo o que está entre as duas marcas** (marcas inclusive) pelo corpo real da variante |
| **CM-4** | `.solution/empty_stub.<ext>` é **cópia byte a byte** do stub recém-materializado — é o que permite reexecutar o passo 1 da validação depois que o aluno já editou o stub, **sem destruir o trabalho dele** |
| **CM-5** | **Sem as duas marcas, o gerador aborta com exit `1`** e **nomeia a marca ausente**. Não há fallback, não há heurística de "achar o corpo" |
| **CM-6** | A busca é por **substring** (`if marca_ini in linha`), não por igualdade de linha: o comentário pode trazer texto explicativo depois da marca, e traz |
| **CM-7** | A validação é tripla: `ini is None` **ou** `fim is None` **ou** `fim <= ini` → aborta. Marca de fim antes da de início é tão inválido quanto marca faltando |

### 7.12.2 Por que a derivação funciona — e a consequência contratual

A referência e as alternativas nascem do **mesmo arquivo** que o stub. Consequência: **qualquer uma
delas é copiada por cima do stub e compila no lugar dele** — que é exatamente como
`challenge-verify.sh` roda os passos 1, 2 e 3 (stub vazio deve falhar; referência deve passar;
alternativas devem passar). Se as soluções fossem escritas à parte, elas poderiam divergir da
assinatura, do pacote, do `use`/`import` ou do módulo, e o teste passaria a medir a diferença de
esqueleto em vez da diferença de lógica.

É também o que garante `≥2` implementações **corretas e estruturalmente diferentes**, requisito de
detecção de teste acoplado a **uma** implementação.

### 7.12.3 As cinco formas materializadas

O corpo vazio entre as marcas **falha sempre**, e falha do jeito certo para cada linguagem:

| Linguagem | Template | Corpo vazio entre as marcas |
|---|---|---|
| Python | `challenge/python/stub.py.tmpl` | `# SM_CORPO_INICIO — …` / `raise NotImplementedError("implemente {{FUNC_NAME}} para o teste passar")` / `# SM_CORPO_FIM` |
| Node | `challenge/node/stub.mjs.tmpl` | `// SM_CORPO_INICIO — …` / `throw new Error("implemente {{FUNC_NAME}} para o teste passar");` / `// SM_CORPO_FIM` |
| Rust | `challenge/rust/lib.rs.tmpl` | `// SM_CORPO_INICIO — …` / `unimplemented!("implemente {{FUNC_NAME}} para o teste passar")` / `// SM_CORPO_FIM` |
| C | `challenge/c/stub.c.tmpl` | `/* SM_CORPO_INICIO — … */` / `return 0; /* stub vazio: qualquer valor fixo aqui está errado por definição */` / `/* SM_CORPO_FIM */` |
| Go | `challenge/go/stub.go.tmpl` | `// SM_CORPO_INICIO — …` / `return` **nu** (retorno nomeado) / `// SM_CORPO_FIM` |

⭐ **Go é o caso que exige explicação, e a explicação vive no próprio template:** um `panic()` no stub
derrubaria o **binário de teste inteiro** no primeiro cenário que falha (`[recovered, repanicked]`) e
os testes seguintes **nunca rodariam** — o mesmo defeito do `assert.h` em C. A correção é `{{SIGNATURE}}`
com **retorno nomeado** (`"n int) (resultado int)"`) + `return` nu: devolve o zero-value do tipo, uma
resposta sempre errada, **sem abortar o processo**. Com a correção, os testes rodam e falham
independentemente (`TESTS_RUN=2 ESPERADO=2`).

### 7.12.4 A implementação, para referência

`SK/scripts/challenge-new.sh`, função `ch_gerar_solucao <variante> <destino-rel>`: um filtro
`python3` lê o stub materializado, localiza `ini` e `fim` por substring, aborta com mensagem nomeando
as duas marcas se `ini is None or fim is None or fim <= ini`, e emite
`linhas[:ini] + corpo + linhas[fim+1:]` para `sm_atomic_write`. A mensagem de erro é literal e cita as
duas marcas e os três artefatos que deixam de existir sem elas.

---

## 7.13 As outras cinco invariantes duras dos templates de desafio

O corpo dos templates é livre **exceto** nestes pontos. Quebrar qualquer um produz um desafio que não
compila, não roda, ou — pior — **passa sem testar**:

| # | Template | Invariante |
|---|---|---|
| 1 | todos os stubs | `SM_CORPO_INICIO` / `SM_CORPO_FIM` (§7.12) |
| 2 | `python/test_stub.py.tmpl` | `SCENARIOS_CODE` entra **dentro de** `class TesteDesafio(unittest.TestCase)`, e o arquivo insere o diretório-pai em `sys.path` **antes** de `from {{MODULE}} import {{FUNC_NAME}}` |
| 3 | `go/stub_test.go.tmpl` | `package {{PKG}}` — **o mesmo do stub**, no mesmo diretório, com **sufixo** `_test.go` (o prefixo `test_` não significa nada em Go). ⭐ Comprovado: uma árvore com o mesmo conteúdo salvo como `test_stub.go` dá `go test` → `"? fatorial [no test files]"` com **exit 0** — o falso positivo silencioso |
| 4 | `rust/test_stub.rs.tmpl` | `SCENARIOS_CODE` fica **dentro de `mod tests`**; é isso que faz o cargo reportar `tests::<id>` e casar com `scenarios[].test_name` |
| 5 | `c/test_stub.c.tmpl` | implementa o `counter_protocol` (`checa_long`, `TESTS_RUN=`, `TESTS_FAILED=`), inclui `"../stub.h"` e respeita `getenv("SM_ONLY")` |
| 6 | `runner.sh.tmpl` | `{{TEST_CMD}}` aparece **antes** do uso de `TIMEOUT_PADRAO`, e `{{COUNT_PROBE}}` **antes** da chamada de `contar_testes` / `mostrar_saida` |

E o `.solution/` começar com ponto **é funcional, não cosmético**: tanto o `go tool` quanto o `cargo`
ignoram diretórios iniciados por `.`, então as implementações de referência convivem dentro do
módulo/crate **sem entrar no build**. Verificado: com `.solution/reference.go` contendo erro de
sintaxe proposital, `go test ./...` nem o menciona.

⏳ **Árvore por linguagem, verificada por execução** (Python 3.14.7, Node 24.19.0, Go 1.26.5, Rust
1.98.0, gcc 16.2.1) — stub vazio materializado → `./runner.sh` → **falha real** (nunca erro de
sintaxe, nunca passa), com `TESTS_RUN == ESPERADO` nos cinco casos:

```
python (generic):     stub.py · tests/test_stub.py     TEST_CMD: python3 -B -m unittest discover -s tests -p "test_*.py"
node   (generic):     stub.mjs · tests/stub.test.mjs   TEST_CMD: node --test --test-reporter=tap tests/stub.test.mjs
go     (go_module):   go.mod · stub.go · stub_test.go (raiz, mesmo pacote)   TEST_CMD: go test -json ./...
rust   (cargo_crate): Cargo.toml · src/lib.rs · tests/test_stub.rs           TEST_CMD: cargo test
c      (generic):     stub.c · tests/test_stub.c (#include "../stub.c")      TEST_CMD: gcc … && ./bin
```

---

## 7.14 A fronteira script ↔ modelo

> **O protocolo REQUEST/APPLY inteiro — os quatro passos, os dois envelopes verbatim, as regras
> duras `RA-1`…`RA-7`, os dois vocabulários de `kind`, a forma de `items` e os quatro usuários com
> seus caminhos degradados — está em §1.6, e não é repetido aqui.**

O que esta parte acrescenta é a consequência para quem **escreve** os scripts:

| Obrigação de implementação | Onde ela mora |
|---|---|
| Nenhum script chama o modelo. A fronteira é sempre exit 10 + `--apply` | invariante `I-22` (§8.9.3) |
| `sm_request` é a **única** função que produz exit 10, e não escreve nada em disco | §7.7.2 |
| `sm_json_validate` precisa aceitar **FIFO** e ler o arquivo **uma vez só** — sem isso, validar na fase de PEDIDO exigiria gravar um temporário, e temporário é escrita | §7.7.1 |
| `sm_apply_read` valida envelope, `kind` e `request_id` **antes** de devolver qualquer item; a validação contra o `response_schema` é do script chamador | §7.7.3 |
| Toda aplicação passa por `sm_atomic_write` | §7.10 |

---

## 7.15 O que envelhece, e as divergências conhecidas

| Marca | Item | Estado |
|---|---|---|
| ⏳ | `decisions-ask.sh` declarado em §7.1 e **ausente do disco** | `I-06b` = **PEND** no gate hoje. Escrever o script fecha a pendência sem tocar no contrato |
| ⏳ | Versões da toolchain de §7.13 e os quatro parâmetros medidos da pilha de sandbox (§7.8) | medição de 2026-08-23 nesta máquina; revalidar ao trocar de máquina ou de versão |
| ⏳ | O número medido da concorrência de `sm_next_seq` (100/100/0/0) | vale para o algoritmo, não para a máquina; o **mecanismo** (`noclobber`) é o que é contratual |
| ⚠ | `SK/references/scripts.md` afirma que `session-close.sh` **não tem** `--recover`; o contrato §8 diz que **tem** | O contrato vence. A reference precisa de correção — ver §7.1.2 |
| ⚠ | `SK/SKILL.md` lista `docs-index.sh` **sem** `--select` na tabela de flags | `--select` é o **único** gatilho do exit 10 do script; omiti-lo esconde o caminho REQUEST/APPLY do `load_docs` |
| ⚠ | `docs/build-spec/51-challenge-new.md` §6 descreve `c/stub.c.tmpl` com `#include "stub.h"`; o template no disco não o tem | Divergência de documentação; o teste em C inclui `"../stub.h"` e a compilação funciona, mas os dois textos precisam concordar |
