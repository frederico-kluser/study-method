# 30 — `lib/common.sh`, `lib/json.sh`, `setup-init.sh`, `setup-list.sh`

Fragmento do BUILD_SPEC. Contrato, não racional. Autoridade: `docs/00-contratos.md` §5, §6, §7, §8;
registry e liveness: `docs/07-multi-setup.md` §1–§2.

Arquivos entregues:

| Caminho | Modo | Natureza |
|---|---|---|
| `SK/scripts/lib/common.sh` | 0644 | `source` apenas, sem shebang executável (LIB-1) |
| `SK/scripts/lib/json.sh` | 0644 | `source` apenas; exige `lib/common.sh` já carregado |
| `SK/scripts/lib/_jsonschema_min.py` | 0644 | auxiliar de `sm_json_validate`; **não** é um dos 19 scripts do §8 |
| `SK/scripts/setup-init.sh` | 0755 | `#!/usr/bin/env bash` + `set -euo pipefail` |
| `SK/scripts/setup-list.sh` | 0755 | idem |

---

## 1. `lib/common.sh` — 17 funções

Globais exportadas (todas com prefixo `SM_`): `SM_LIB_DIR` (diretório da lib, resolvido de
`BASH_SOURCE` no `source`), `SM_REGISTRY_LOCK_DIR` (lock de registry em posse; vazio = nenhum),
`SM_ASCII_FOLD` (tabela `origem:destino` de dobra para ASCII), `SM_STOPWORDS`.
Variáveis de ambiente lidas: `HOME`, `PWD`, `HOSTNAME`, `STUDY_METHOD_HOME`, `XDG_DATA_HOME`,
`STUDY_METHOD_LOG`, `STUDY_METHOD_TODAY`, `STUDY_METHOD_NOW`, `SM_SESSION_ID`.

As assinaturas e os códigos de saída são os de `docs/00-contratos.md` §7.1, sem desvio.
O que segue é o **algoritmo** de cada uma que tem algoritmo.

### 1.1 `sm_setup_root`
1. `<hint>` vazio ⇒ `$PWD`; alvo que não é diretório ⇒ parte do `dirname`. Resolve para absoluto
   físico (`cd -P` + `pwd -P`); inacessível ⇒ **3**.
2. Sobe por ancestrais; em cada um, `-f` **e** `-r` sobre `<dir>/setup.json` ⇒ imprime `<dir>`, **0**.
3. Para **depois** de examinar `$HOME` (nunca acima) e **depois** de examinar `/`; um `<hint>` fora
   de `$HOME` sobe até `/` inclusive, porque um setup pode viver em `/mnt/...`.
4. Nada encontrado ⇒ **3**, com uma linha `debug` em stderr.

### 1.2 `sm_normalize_concept_id` — algoritmo determinístico
1. Rótulo vazio ⇒ **2**.
2. Dobra para ASCII por substituição de string em bash (`${s//á/a}` …), **byte-safe em UTF-8 e
   independente de locale**; a tabela é `SM_ASCII_FOLD` e cobre acentuação pt-BR + `º ª æ œ ß`.
3. Minúsculas (`${s,,}`).
4. `LC_ALL=C tr -c 'a-z0-9' '_'`: tudo que não é `[a-z0-9]` vira `_`.
5. Divide em tokens por `_` (`IFS='_'`), descarta token vazio e descarta as stopwords
   `de da do em e a o por com`; junta de novo com `_` (colapso de `_` repetido é consequência).
6. Remove `_` das pontas. Resultado vazio ⇒ **2**.
7. Não começa em `[a-z]` ⇒ prefixa `c_` (preserva informação; nunca corta o começo).
8. Trunca em 63; remove `_` final; se sobrou 1 caractere, acrescenta `_` (o pattern exige ≥2).
9. Confere contra `^[a-z][a-z0-9_]{1,62}$`; não casou ⇒ **2**.

Exemplos verificados: `Derivadas: o conceito` → `derivadas_conceito` · `Análise de Complexidade` →
`analise_complexidade` · `funções de 1º grau` → `funcoes_1o_grau` · `1º grau` → `c_1o_grau`.

### 1.3 `sm_normalize_slug`
Passos 2–4 iguais, com `-` no lugar de `_`; colapsa `--`, remove `-` das pontas, trunca em 64.
**Não remove stopwords** — slug é nome de diretório e de arquivo, namespace distinto do de conceito
(§4.2). `Análise de Complexidade` → `analise-de-complexidade`.

### 1.4 `sm_atomic_write`
`mkdir -p` do `dirname`; tmp `"$dest.tmp.$$"` no **mesmo diretório**; conteúdo de stdin via `cat`;
`sync -- "$tmp"` (fallback `sync`); `mv -f`. Qualquer falha remove o tmp e devolve **1** — nunca
deixa escrita parcial nem tmp órfão. Obrigatório para todo derivado (I-27).

### 1.5 `sm_next_seq`
1. `mkdir -p "$dir"`.
2. Até **5** tentativas. Em cada uma: `max` = maior `NNNN` visto em
   `"$dir"/NNNN<sufixo>` **e** em `"$dir"/*/NNNN<sufixo>` (um nível: cobre `memory/discarded/` e
   `memory/broken/`, e é o que garante que **número purgado nunca é reaproveitado**); com sufixo
   vazio, também `"$dir"/NNNN-*` (cobre `challenges/<NNNN>-<slug>/`).
3. `seq = max + 1`, zero-padded em 4 dígitos; `> 9999` ⇒ **1**.
4. Criação com `( set -o noclobber; : > "$dir/NNNN<sufixo>" )` — falha se o arquivo já existe.
   Sucesso ⇒ imprime `NNNN`, **0**. O arquivo criado é a **reserva**: quem chamou grava por cima
   com `sm_atomic_write`.
5. Colisão ⇒ recuo curto e aleatório (`sleep 0.0N`, `N < 10`) e nova tentativa. 5 colisões ⇒ **4**.

Medido: 5 processos concorrentes × 20 alocações = 100 sucessos, 100 valores distintos, 0 duplicados,
0 exit 4; após mover `0003.json` para `discarded/`, a alocação seguinte é `max+1`, não `0003`.

### 1.6 Locks
`sm_registry_lock`: `mkdir` (atômico) de `$(dirname registry.json)/.registry.lock`. Ocupado ⇒ lê o
`mtime` do diretório (`stat -c %Y`, fallback `stat -f %m`); idade > **60 s** ⇒ avisa em stderr,
`rmdir` e **retenta uma vez**; senão **4**. Ao obter, grava `SM_REGISTRY_LOCK_DIR` e instala
`trap 'sm_registry_unlock' EXIT` — **o chamador não deve instalar outro trap EXIT depois**.
`$STUDY_METHOD_HOME` não criável ⇒ **4** com aviso.

`sm_setup_lock <setup_root> [<session_id>]`: grava `memory/.session.lock` com
`{pid, hostname, session_id, started_at}` por `sm_atomic_write`. Lock existente com `hostname`
igual **e** `kill -0 <pid>` bem-sucedido ⇒ **4**. Qualquer outro caso é órfão: avisa em stderr,
`rm -f` e prossegue. `session_id` cai para `$SM_SESSION_ID` e vira `null` quando ausente.

### 1.7 Tempo
`sm_now_iso`: `date +%Y-%m-%dT%H:%M:%S%z` com o offset convertido para `±HH:MM`; honra
`STUDY_METHOD_NOW` quando casa o pattern de §4.2. `sm_today`: honra `STUDY_METHOD_TODAY` quando casa
`^\d{4}-\d{2}-\d{2}$`; formato inválido ⇒ aviso e `date +%F`. Os dois env vars existem para o gate.

---

## 2. `lib/json.sh` — 9 funções

Globais: `SM_JSON_SCHEMA_CHECKER` (default `$SM_LIB_DIR/_jsonschema_min.py`), `SM_PROTOCOL`
(`study-method/request-apply`), `SM_PROTOCOL_VERSION` (`1.0`). Lê `SM_SETUP_ID`.
Todo acesso a `jq` usa **redirecionamento** (`jq FILTRO < "$arquivo"`), nunca o caminho como
argumento — caminho com espaço ou iniciado por `-` funciona.

Assinaturas e códigos: `docs/00-contratos.md` §7.2, sem desvio.

### 2.1 `sm_json_validate` — verificador mínimo em Python stdlib
Não há `jsonschema` nesta máquina e o PEP 668 impede instalar. `_jsonschema_min.py <instância>
<schema>` cobre, **por design parcialmente** (§4.3): `type` (string **ou array de strings**),
`required`, `enum`, `const`, `pattern`, `minLength`/`maxLength`, `minimum`/`maximum`,
`minItems`/`maxItems`, `properties`, `items` (schema único ou tupla), `additionalProperties`
(`false` ou subschema). Palavra-chave desconhecida é ignorada em silêncio. Sem `$ref`, `allOf`,
`anyOf`, `oneOf`, `if/then/else`, `$defs` — proibidos nos schemas por I-08.

Regras de tipo: `boolean` **não** é `integer` (o `bool` do Python é excluído explicitamente);
`integer` casa `number`. Saída: uma linha por erro em **stderr**, `<json-pointer>: <motivo>`,
com o ponteiro em RFC 6901 (`~`→`~0`, `/`→`~1`; raiz = string vazia) e o motivo em pt-BR.
Teto de 200 erros. Exit do Python: 0 · 5; a função devolve 5 para qualquer não-zero, e também
quando falta `python3` ou o verificador.

### 2.2 `sm_request` — fase de PEDIDO
1. Argumento faltando ou payload que não é JSON ⇒ `sm_die 1` (erro de programação do chamador).
2. `canon = sm_json_canon(payload)` (`jq -cS .`).
3. `request_id` = **12 primeiros hex do `sha256` de `canon` SEM newline final**
   (`printf '%s' "$canon" | sha256sum | cut -c1-12`). Invariante a ordem de chaves e a espaço.
4. Monta o envelope do §6.1 com `jq -n`; `setup_id` vem de `$SM_SETUP_ID` e é `null` se vazio.
5. Escreve o envelope em **stdout** e `exit 10`. **Nada em disco** (RA-1).

É a única função do projeto que produz exit 10 (I-23) e a única exceção a LIB-4 além de `sm_die`.

### 2.3 `sm_apply_read` — fase de APPLY
Valida, **antes** de devolver qualquer item: arquivo legível (senão **2**), JSON parseável,
`protocol == SM_PROTOCOL`, `protocol_version == SM_PROTOCOL_VERSION`, `kind` igual ao esperado,
`request_id` igual ao esperado (divergiu ⇒ o estado em disco mudou entre as duas fases, RA-2), e
`.items` do tipo `array`. Qualquer divergência ⇒ **5** com o motivo em stderr. Só então imprime
`jq -c '.items'`. A validação da RESPOSTA contra o `response_schema` é do script chamador, via
`sm_json_validate` (RA-3).

---

## 3. `setup-init.sh`

```
setup-init.sh <path> --subject <s> --subject-slug <sl> --title <t>
              [--language <l>] [--skill-level <n>] [--session-minutes <n>]
              [--theory-source <ts>] [--defaults-used <csv>] [-h|--help]
```

stdout: **o `setup_id`**, uma linha. Exit: 0 · 1 · 2 · 4 (registry) · 5.

Entrada: `--subject` → `sm_normalize_concept_id` → `subject`; `--subject-slug` →
`sm_normalize_slug` → `setup_name`; `--title` é texto livre pt-BR. `--language` default `none`
(com aviso), enum de 20 valores. `--skill-level`, `--theory-source` e `--session-minutes` são
validados **antes** de qualquer escrita; violação ⇒ **2**.

`--defaults-used <csv>`: tokens `<D-id>` ou `<D-id>=<valor>`, com `<D-id>` casando
`^D-[A-Z]{1,3}[0-9]{2,3}$` (senão **2**). Cada token vira
`decisions[<D-id>] = {value, answered_at, default_used: true}`; `<valor>` é lido como JSON quando
parseia (número, booleano) e como string caso contrário; ausente vira `null`. É a materialização
de BOOT-2 no manifesto — a **fala** ao aluno é do modelo, não do script.

### 3.1 Ordem de execução
0. **Já é setup?** `<path>/setup.json` existente e não parseável ⇒ **5**, nada é tocado (B-07).
   Parseável com `setup_id` fora de `^[0-9a-f]{12}$` ⇒ **5**. Parseável e válido ⇒ modo idempotente:
   nada de `setup.json`, nada de `.gitignore`, só recriação de diretório estrutural faltante,
   atualização do registry e reimpressão do `setup_id` (I-32, B-06).
1. `mkdir -p <path>` + `sm_chmod_private <path>` (700); depois os quatro diretórios internos do
   setup: o `docs/` do setup (nunca o `docs/` do repositório), `memory/`, `researchs/` e
   `challenges/`. Cada diretório recriado numa segunda execução emite uma linha `info`.
2. `.gitignore` — **só se não existir**. Fonte: `assets/templates/setup/gitignore.tmpl`; ausente ⇒
   conteúdo embutido, que contém a linha `memory/` (I-40, `docs/11` §1.4).
3. `setup.json`:
   - `setup_id` = `od -An -N6 -tx1 /dev/urandom | tr -d ' \n'`, até 5 sorteios, rejeitando
     colisão com `setup_id` já presente no registry;
   - base = `assets/templates/setup/setup.json.tmpl` com os 8 placeholders do `MANIFEST.tsv`
     (`SETUP_ID SETUP_NAME SUBJECT LANGUAGE SESSION_MINUTES THEORY_SOURCE CREATED_AT
     SCHEMA_VERSION`) substituídos; `SESSION_MINUTES` vazio é substituído por `null`.
     Sobrar `{{` no material renderizado ⇒ **1**. Template ausente, ou que não produz JSON válido
     ⇒ aviso em stderr e base `{}`;
   - overlay `jq` autoritativo por cima da base: `schema_version`, `setup_id`, `setup_name`,
     `title`, `subject`, `taxonomy = [subject]`, `language = {name, chosen_at}`, `created_at`,
     `updated_at`, `session_count = 0`, `decisions`, `privacy.cross_read` (preserva o da base,
     default `ask`); `skill_level`, `theory_source` e `session_minutes` são **removidos** quando
     não informados. Campos extras do template (ex.: `notes`) sobrevivem;
   - o candidato é validado contra `setup-manifest.schema.json` **antes** de existir como
     `setup.json`; inválido ⇒ **5** e nada é gravado;
   - grava por `sm_atomic_write`.
4. **Registry, por último** — nunca aponta para setup pela metade. Monta a entrada com os espelhos
   lidos do `setup.json` recém-gravado (`setup_name`, `title`, `subject`, `taxonomy`, `language`,
   `session_count`, `cross_read`) mais `path` absoluto, `setup_status: "active"`, `created_at`,
   `last_seen_at`, `checked_at`. Faz upsert **por `setup_id`, preservando a posição no array**,
   valida o registry inteiro contra `registry.schema.json` e grava por `sm_atomic_write` sob
   `sm_registry_lock`.

### 3.2 Degradações nomeadas
- `$STUDY_METHOD_HOME` não criável ou não gravável (B-25): aviso em stderr, **o setup é criado**,
  o registro é pulado, exit **0**.
- Registry ilegível (B-24): move para `registry.json.corrupt-<epoch>` **no momento da gravação**,
  recria vazio, avisa uma vez. Nenhum setup é perdido.
- Registry ocupado: **4**, com a mensagem dizendo que o setup foi criado mas não registrado.
- **Não** escreve o `README.md` do setup: isso é de `readme-sync.sh <setup_root> --init`.

---

## 4. `setup-list.sh`

```
setup-list.sh [--all] [--json]
setup-list.sh --resolve <cwd> | --find <termo> [--json] | --archive <id> | --forget <id>
```

Exit: 0 · 1 · 2 · 3 · 4. Subcomandos são mutuamente exclusivos (senão **2**).

### 4.1 Leitura e escrita do registry
`sl_registry_load`: registry ausente ⇒ registry vazio em memória (B-23, sem aviso); ilegível ⇒
aviso e registry vazio em memória, **sem tocar no arquivo** (B-24).
`sl_registry_save`: `$STUDY_METHOD_HOME` não gravável ⇒ aviso e no-op (0); toma `sm_registry_lock`
(ocupado ⇒ 4); só então move o arquivo ilegível para `registry.json.corrupt-<epoch>`; carimba
`updated_at`; valida contra `registry.schema.json` (inválido ⇒ 5, nada gravado);
grava por `sm_atomic_write`; libera o lock.

### 4.2 Liveness check (`docs/07-multi-setup.md` §2.1)
Para cada entrada, pulando `archived` e pulando quem tem `checked_at` de menos de **24 h**
(exceto a entrada forçada pelo `--resolve`):
1. `<path>/setup.json` ausente, ilegível ou não parseável ⇒ `id_no_disco` vazio.
2. `id_no_disco == setup_id` ⇒ `setup_status: "active"`, `last_seen_at` e `checked_at` agora,
   `missing_since` apagado.
3. Caso contrário ⇒ `setup_status: "missing"`, `missing_since` **só na primeira vez**,
   `checked_at` agora, aviso em stderr. A entrada **nunca é apagada**.
4. Se havia um `id_no_disco` diferente, garante que existe entrada para ele apontando para aquele
   `path`, construída a partir do `setup.json` de lá.

### 4.3 `--resolve <cwd>`
1. `sm_setup_root "<cwd>"`; nada ⇒ **3**. `setup.json` que não parseia ⇒ **5** (B-07).
   `setup_id` fora do pattern ⇒ **5**.
2. `setup_id` desconhecido no registry ⇒ cria a entrada a partir do manifesto.
3. `setup_id` conhecido com `path` diferente:
   - o `path` antigo **não tem** mais um `setup.json` com aquele `setup_id` ⇒ **mudança de lugar**:
     corrige `path`, volta a `active`, limpa `missing_since`, registra uma linha `info`. Não pergunta
     nada (D-A22). É o caso de **setup renomeado**: `setup_id` é a chave primária, `path` nunca é.
   - o `path` antigo **ainda tem** o mesmo `setup_id` ⇒ **clone** (D-A19): aviso em stderr, registry
     inalterado. Sortear `setup_id` novo é decisão do aluno, não do script.
4. Espelha do manifesto para o registry (`setup_name`, `title`, `subject`, `taxonomy`, `language`,
   `session_count`, `cross_read`, `last_session_at`) — o manifesto manda (`docs/07` §6 item 8) — e
   carimba `last_seen_at`/`checked_at`.
5. Roda o liveness sobre as demais entradas, salva, e imprime o **caminho absoluto** em stdout.
   Registry ocupado ⇒ **4**; qualquer outra falha de gravação vira aviso e a resolução vale assim mesmo.

### 4.4 `--find <termo> [--json]`
`termo` normalizado por `sm_normalize_concept_id` (⇒ **2** se não sobrar nada). Casa por
**substring** contra `subject`, `taxonomy[]` e `topics[]` das entradas `active`, excluindo
`cross_read == "never"` (que não aparece nem na listagem de nomes). Zero resultados **não** é erro.
`--json` emite `{term, query, matches:[...]}`; sem `--json`, a tabela legível.

### 4.5 `--archive` / `--forget`
`<setup_id>` fora de `^[0-9a-f]{12}$` ⇒ **2**; ausente do registry ⇒ **3**.
`--archive`: `setup_status: "archived"` + `archived_at` (escrito uma única vez). `--forget`: remove
a entrada — **nada é apagado em disco**, e o setup volta ao registry se for reaberto.
Ambos ecoam o `setup_id` em stdout.

### 4.6 Listagem
Sem argumento: só `active`; `--all`: todas, com a coluna `ESTADO`. Ordem: `last_seen_at`
decrescente. `--json`: `{"setups":[…]}`. A tabela legível alinha por **caracteres** (`${#s}`), não
por bytes, para não desalinhar com título acentuado em pt-BR.

---

## 5. Invariantes verificadas neste fragmento

| ID | Como fica satisfeito |
|---|---|
| I-19 | `lib/*.sh` em 0644, sem shebang executável, sem `main`/`"$@"` de topo |
| I-20 | 26 funções `sm_*` em `lib/common.sh`+`lib/json.sh`, exatamente as de §7.1 e §7.2 |
| I-21 | `set -euo pipefail` nos dois executáveis; nenhum teste `== 1` para falha |
| I-23 | `exit 10` aparece uma única vez, dentro de `sm_request` |
| I-18 | `setup-init.sh` e `setup-list.sh` usam apenas 0 1 2 3 4 5 |
| I-25 | Escrita só em `<setup_root>` e em `$STUDY_METHOD_HOME` |
| I-26 | Zero rede. **O grep publicado precisa de fronteira de palavra**: `nc ` casa dentro de `sync ` |
| I-27 | Todo derivado passa por `sm_atomic_write`; nenhum `>` direto sobre derivado |
| I-32 | `setup-init.sh` idempotente: 2ª execução deixa a árvore byte a byte igual |
| I-37 | O único caminho absoluto gravado é `registry.json` → `setups[].path` |
| I-40 | `.gitignore` gerado contém a linha `memory/` |
