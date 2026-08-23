# 40 — Memória: `memory-index.sh`, `memory-digest.sh`, `memory-compact.sh`

> Fragmento do BUILD_SPEC (sub-tarefa 3.4a). **Contrato, não racional**: o que cada artefato
> recebe, o que produz, o algoritmo e as condições de erro. O porquê vive em
> `docs/03-memoria.md` do repositório; as fronteiras, em `docs/00-contratos.md`.

Os três scripts formam o ciclo da memória persistente:

| Passo da máquina de estados | Script | Papel |
|---|---|---|
| `load_memory` | `memory-index.sh <setup_root> --verify` | sincroniza o índice, quarentena bruto ilegível, **finaliza órfãs** (dono único) |
| `load_memory` | `memory-digest.sh <setup_root> --now <ISO>` | monta o working memory determinístico em stdout; **somente leitura** |
| `close_session` | `memory-index.sh <setup_root>` | reindexa a sessão recém-fechada |
| `close_session` | `memory-compact.sh <setup_root> --if-due` | consolida em `profile.json` via REQUEST/APPLY |

Regras que valem para os três: `#!/usr/bin/env bash` + `set -euo pipefail`, modo `0755`,
`LC_ALL=C`, caminhos com espaço, `jq` como única ferramenta estruturada, `python3` só stdlib,
todo derivado escrito por `sm_atomic_write`, exit codes de `docs/00-contratos.md` §5, `--help`.

---

## 1. `memory-index.sh` — o índice derivado

### 1.1 CLI

```
memory-index.sh <setup_root> [--verify] [--rebuild]
```

| Modo | O que faz |
|---|---|
| (sem flag) | Deriva todas as entradas dos brutos e grava se algo mudou. É o modo do `close_session`. |
| `--verify` | O anterior **mais**: detecta índice ausente/ilegível/defasado e executa a recuperação de sessão órfã (§1.4). |
| `--rebuild` | Descarta o índice atual por inteiro e o reconstrói; o estado de compactação vem do `profile.json` (§1.3). |

**stdout** (uma linha JSON): `{"sessions":N,"orphans_closed":N,"quarantined":["NNNN",…],"rebuilt":bool}`
**exit**: `0` ok · `1` I/O · `2` uso · `3` setup não encontrado · `5` o índice produzido não valida
contra `index.schema.json` (validado **antes** de publicar; nada é gravado).

### 1.2 Tabela de derivação (índice ← sessão) — mecânica, sem julgamento

| Campo do índice | Regra |
|---|---|
| `session_id` | `session.session_id` |
| `file` | `"memory/" + session_id + ".json"` |
| `date` | `session.date` |
| `status` | `session.status` |
| `topics` | `session.topics` (ausente → `[]`) |
| `skills_touched` | valores distintos de `session.skills_observed[].skill`, ordenados (`unique`) |
| `one_line_summary` | `session.one_line_summary`, cortado em 160 caracteres |
| `affect` | `session.affect` (ausente → `null`) |
| `flags` | nesta ordem fixa: `has_unlock` se algum `how_it_happened[].outcome == "unlocked"` · `has_backfire` se algum `== "backfired"` · `has_open_questions` se `open_questions` não vazio · `has_next_steps` se `next_steps` não vazio · `orphan_recovered` se `finalized_by == "auto_orphan_recovery"` |
| `cross_setup_refs` | `session.cross_setup_refs` (ausente → `[]`) — declarado no schema, ausente da tabela de `docs/03` §2.1; derivado aqui porque a seção `pontes` do `README.md` do setup é montada varrendo o índice |
| `digest_eligible` · `compacted_at` | **não derivam da sessão** — ver §1.3 |

O bloco `jq` que implementa esta tabela vive entre os marcadores
`# >>> DERIVACAO-INDICE` / `# <<< DERIVACAO-INDICE` e é **cópia literal** em `memory-index.sh` e
`memory-digest.sh`. Divergência entre as duas cópias é bug (o gate pode compará-las com `diff`).

### 1.3 ⭐ Estado da compactação: recuperado, nunca zerado

`digest_eligible` e `compacted_at` são estado da **compactação**, não da sessão. Reconstruir o
índice devolvendo-os ao default (`true` / `null`) faz o gatilho de `memory-compact.sh` disparar e
re-consolidar fatos já consolidados, duplicando a cadeia bitemporal a cada reconstrução.

Precedência de recuperação, aplicada entrada a entrada (bloco `# >>> OVERLAY-COMPACTACAO`, também
literal nos dois scripts):

1. a entrada de mesmo `session_id` no índice atual (pulada por `--rebuild` e quando o índice não parseia);
2. `profile.compaction`: se `session_id <= last_compacted_session_id` e `status != "in_progress"`,
   então `compacted_at = date(last_compacted_at)` (ou a `date` da própria sessão, se o perfil não
   tiver `last_compacted_at` — o que **não** pode voltar a `null`) e
   `digest_eligible = (session_id ∈ os 5 maiores session_id do índice)`;
3. defaults: `digest_eligible: true`, `compacted_at: null`.

A regra dos **5 maiores `session_id`** é a mesma usada por `memory-compact.sh` ao marcar o índice
(§3.6): as 5 sessões mais recentes nunca perdem `digest_eligible`, para o bloco `recent_sessions`
do digest não esvaziar logo após uma compactação.

Limite conhecido e aceito: o `compacted_at` recuperado é a data da **última** compactação, não a
data por lote. Só a distinção `null` × não-`null` é carregada de significado (é ela que move o
gatilho); a data exata por lote não é reconstruível e não é usada por nenhuma decisão.

### 1.4 Recuperação de sessão órfã (só em `--verify`) — dono único

```
órfã(S) ⇔ S.status == "in_progress" ∧ ¬lock_vivo(S)
lock_vivo(S) ⇔ existe memory/.session.lock ∧ lock.session_id == S.session_id
              ∧ lock.hostname == uname -n ∧ kill -0 lock.pid sucede
```

Com lock vivo: **não toca** (é sessão concorrente; quem reage é `open_session`, exit 4).
Sem lock vivo, na ordem:

1. `status = "abandoned"`; `finalized_at = mtime do arquivo` (ISO com offset); `finalized_by = "auto_orphan_recovery"`.
2. `one_line_summary` **só** é substituído se ainda for o provisório — vazio, `"Sessão iniciada, ainda sem resumo."` ou prefixo `"Sessão em andamento:"` — pelo texto fixo `"Sessão interrompida sem fechamento (recuperada automaticamente)."` Nenhum outro campo é escrito, nenhum conteúdo é inventado, nenhum campo preenchido é alterado.
3. O bruto é reescrito por `sm_atomic_write`, preservando a ordem das chaves existentes.
4. A entrada do índice ganha `orphan_recovered` em `flags` (deriva de `finalized_by`).
5. O `.session.lock` morto correspondente é removido.

A recuperação é **automática e silenciosa** — nunca pergunta ao aluno.

### 1.5 Quarentena

Bruto que não parseia, ou cujo `session_id` não bate com o nome do arquivo (invariante de
`docs/03` §2), é **movido** (nunca apagado) para `memory/broken/NNNN.json` — com sufixo `.1`, `.2`…
se o destino já existir —, listado em `quarantined[]` e ignorado pelo resto da execução. Um bruto
ilegível nunca derruba a sessão.

---

## 2. `memory-digest.sh` — o working memory

### 2.1 CLI e garantias

```
memory-digest.sh <setup_root> [--topics t1,t2] [--budget-chars N] [--today AAAA-MM-DD] [--now <ISO 8601>]
```

| Garantia | Como |
|---|---|
| **Somente leitura** | não cria, não altera e não remove arquivo nenhum — nem tmp |
| **Forma fixa** | 18 chaves de topo, sempre as mesmas, na mesma ordem; ausência é `[]`, `{}` ou `null` |
| **Exit 0 sempre** | qualquer falha interna cai num digest mínimo com `errors[{"kind":"internal_error"}]`; `!= 0` só em uso incorreto (2), setup não encontrado (3) ou impossibilidade de escrever em stdout (1) |
| **Determinístico byte a byte** | mesma entrada + mesmos `--now`/`--today` ⇒ bytes idênticos. Toda ordenação tem desempate explícito (`fact_id` asc, índice de origem); nenhuma ordem vem de iteração de diretório; o único relógio lido é o de `--now`/`--today` |
| **Montado por código** | nenhum campo depende de julgamento do modelo; o único canal de julgamento é `--topics` |

Defaults: `BUDGET_CHARS=6000` · `RECENT_SESSIONS_K=5` · `AFFECT_WINDOW=3` · `TOPIC_WINDOW=3` ·
`SEMANTIC_FACTS_CAP=12` · `PROC_AVOID_CAP=5` · `PROC_DO_CAP=8` · `FOLLOWUP_CAP=6` ·
`TOP_TAGS=15` · `SUMMARY_TRUNC=160` · `TEXT_TRUNC=120` (T5).

Comprimento é contado em **codepoints** (`jq -Rs length`) sobre a saída serializada final,
inclusive a quebra de linha — a mesma métrica em todos os passos da escada.

### 2.2 Os 15 passos, em forma executável

| # | Passo |
|---|---|
| 1 | `MEM = <setup_root>/memory`; `TODAY = --today` ou `sm_today`; `NOW = --now` ou `sm_now_iso` (só alimenta `generated_at`). `MEM` inexistente, **ou** sem nenhum `NNNN.json` e sem `INDEX.json` ⇒ `first_session` (blocos vazios, `for_session_id: "0001"`, `errors: []` — `profile_missing` não é registrado aqui: não falta nada). |
| 2 | Lê `INDEX.json`. Ausente → `errors[{"kind":"index_missing"}]`; não parseia (ou `updated_at` ilegível) → `index_unparseable`; `updated_at` < `mtime` de algum bruto → `index_stale`. Em qualquer um dos três, reconstrói **em memória** varrendo `MEM/[0-9][0-9][0-9][0-9].json` em ordem de nome, pela tabela de §1.2 + o overlay de §1.3 (prior = entradas do índice quando ele apenas estava defasado). Bruto que não parseia → `errors[{"kind":"session_unparseable","session_id":"NNNN"}]` e segue. `ENTRADAS` ordenadas por `session_id` asc. |
| 3 | `ORPHANS` = entradas com `status == "abandoned"` **e** `flags ∋ orphan_recovered` (o índice não guarda `finalized_by`), ordenadas por `session_id` desc, cortadas em 3. Emite `{session_id, date, one_line_summary, topics, days_ago}`. Entradas ainda `in_progress` não entram aqui nem em `recent_sessions`. |
| 4 | `for_session_id = zero-pad(4, max(session_id) + 1)`; sem entradas, `"0001"`. |
| 5 | Lê `profile.json`. Ausente → `errors[{"kind":"profile_missing"}]` (**não** conta para `degraded`); não parseia → `profile_unparseable`. Defaults de `decay_policy`: 60 / 180 / 180. Para todo fato `active`: `needs_reconfirmation = (TODAY − last_observed_at) em dias > bucket`, `read_as = "hypothesis"` se verdadeiro, senão `"current"`. `bucket` = `skill_fact_days` para `kind ∈ {skill_level, difficulty, strength}`, `preference_fact_days` para `{preference, context}`, `procedural_fact_days` para procedimentais. Data ilegível ⇒ `needs_reconfirmation: false`. |
| 6 | `TOPICS_IN_FOCUS`: de `--topics` (`topics_source: "argument"`) ou da união dos `topics` das últimas `TOPIC_WINDOW` entradas finalizadas (`status != "in_progress"`), com `topics_source: "inferred_from_recent"`. Cada rótulo passa por `sm_normalize_concept_id`; rótulo já canônico (`^[a-z][a-z0-9_]{1,62}$`) é mantido como está se o normalizador devolver vazio. Ordenado e deduplicado. **Nunca** se extrai tópico de `pending_followups`. |
| 7 | `procedural_playbook.avoid` = procedimentais `active` com `outcome == "backfired"`, ordem `last_observed_at` desc, desempate `fact_id` asc, corte em `PROC_AVOID_CAP`. `procedural_playbook.do` = `active`, `retired != true`, `outcome ∈ {unlocked, partial}`, `target_topic ∈ TOPICS_IN_FOCUS`; ordem `unlocked` antes de `partial`, depois `last_observed_at` desc, desempate `fact_id` asc, corte em `PROC_DO_CAP`. Ambos emitem os **13 campos**: `fact_id, procedure_kind, target_topic, how, base_domain, mapping, known_limit, outcome, confidence, last_observed_at, read_as, source_sessions`. |
| 8 | `student_profile.facts` = semânticos `active`, ordem: `topic ∈ TOPICS_IN_FOCUS` primeiro, depois `last_observed_at` desc, desempate `fact_id` asc; corte em `SEMANTIC_FACTS_CAP`. Campos: `fact_id, kind, topic, claim, skill_level, proficiency_state, confidence, observation_type, last_observed_at, needs_reconfirmation, read_as, source_sessions`. |
| 9 | `recent_sessions` = últimas `RECENT_SESSIONS_K` entradas com `digest_eligible != false`, `status != "in_progress"` e fora de `orphan_sessions`, em ordem **crescente**. Campos: `{session_id, date, topics, one_line_summary (≤160), flags}`. |
| 10 | `recent_affect` = `affect` das últimas `AFFECT_WINDOW` entradas finalizadas, em ordem crescente, descartando `null` **depois** da janela (nada mais antigo entra). |
| 11 | `pending_followups` = do perfil, os de `state == "open"`; mais `open_questions` e `next_steps` lidos dos **brutos** das últimas `TOPIC_WINDOW` sessões finalizadas (no máximo 3 arquivos; ilegível vira `session_unparseable`). Dedupe por texto exato mantendo a primeira ocorrência (ordem: perfil, depois por sessão asc, `open_questions` antes de `next_steps`); ordenação por `created_in_session` asc com desempate pelo índice de inserção; corte em `FOLLOWUP_CAP`. Campos: `{text, created_in_session, origin_field}`. |
| 12 | `full_detail_available = {session_count, date_range: [min, max], index_file, raw_file_pattern, sessions_not_in_recent, top_tags (contagem desc, nome asc, corte em TOP_TAGS), how_to_open}`. `sessions_not_in_recent` é **recalculado a cada passo da escada**, para continuar verdadeiro depois do truncamento. |
| 13 | `memory_state`, na ordem: `first_session` → `degraded` (se `errors` contém `index_missing`, `index_unparseable`, `index_stale`, `profile_unparseable`, `session_unparseable` ou `internal_error`) → `warm` (≥5 sessões finalizadas **ou** ≥1 fato `active` no perfil) → `warming_up` (fallback). Serializa na ordem fixa de chaves (`generated_at = NOW`). |
| 14 | Escada de truncamento (§2.3). |
| 15 | Imprime em stdout; sai 0. |

Ordem fixa das chaves de topo (18):
`schema_version, generated_at, for_session_id, memory_state, topics_in_focus, topics_source,
full_detail_available, student, recent_sessions, recent_affect, student_profile,
procedural_playbook, orphan_sessions, pending_followups, truncated, truncated_fields,
budget_exceeded, errors` — com `procedural_playbook = {do, avoid}`, exatamente como o exemplo de
`docs/03` §10.5/§10.6.

### 2.3 Escada de truncamento T1..T5

Enquanto o serializado passar de `BUDGET_CHARS`, aplica-se **um passo por vez, reserializando e
remedindo a cada passo**; o rótulo do bloco entra em `truncated_fields[]` (deduplicado, na ordem
de primeira ocorrência) e `truncated` vira `true`:

| Passo | Ação | Rótulo |
|---|---|---|
| T1 | remove `recent_sessions` da mais antiga, uma por vez, até restarem 2 | `recent_sessions` |
| T2 | remove de `procedural_playbook.do` os itens `outcome == "partial"`, do `last_observed_at` mais antigo para o mais novo (desempate `fact_id` asc) | `procedural_playbook.do` |
| T3 | remove de `student_profile.facts` os itens `read_as == "hypothesis"`, do mais antigo para o mais novo | `student_profile.facts` |
| T4 | remove de `student_profile.facts` os itens `confidence == "low"`, do mais antigo para o mais novo | `student_profile.facts` |
| T5 | corta em 120 caracteres, com `…`, os textos livres de `student_profile.facts[].claim`, `procedural_playbook.do[].how/mapping/known_limit` e `recent_sessions[].one_line_summary` | `text_fields` |

**Nunca truncados**: `pending_followups`, `procedural_playbook.avoid` (os antipadrões),
`orphan_sessions`, `full_detail_available` e o cabeçalho. Se, esgotados os cinco passos, o
orçamento continuar estourado, o digest é emitido assim mesmo com `budget_exceeded: true` — e
**nunca** falha. Isso acontece de verdade: com o playbook cheio (5 `avoid` + 8 `do` protegidos ou
só parcialmente cortáveis), o bloco procedimental sozinho passa de 6 000 caracteres.

---

## 3. `memory-compact.sh` — REQUEST/APPLY

### 3.1 CLI

```
memory-compact.sh <setup_root> [--if-due] [--force] [--apply <resposta.json>]
```

`--if-due` só age com o gatilho atingido · `--force` compacta abaixo do limiar · `--apply` aplica
a RESPOSTA. **stdout**: o envelope do PEDIDO (fase 1) ou
`{"sessions_compacted":N,"facts_created":N,"facts_superseded":N,"facts_reconfirmed":N}` (fase 2 e
"nada a fazer"). **exit**: `0` · `1` · `2` · `3` · `5` · **`10`** (`needs_model_input`).

### 3.2 Gatilho

`|S| >= profile.compaction.trigger_uncompacted_sessions` (default **15**), com
`S = { entradas do índice com compacted_at == null e status ∈ {completed, abandoned} }`, em ordem
crescente de `session_id`. Sessão `abandoned` **entra** em `S` e conta para o limiar.

Sem `INDEX.json` legível o script **se recusa** a compactar (com `--if-due`: avisa em stderr e sai
0; sem ela: exit 1). Assumir "nada foi compactado" duplicaria a cadeia de fatos.

### 3.3 Fase PEDIDO (exit 10)

Não escreve **nada** em disco (RA-1) — nem temporário: a validação do PEDIDO contra
`memory-compact.request.schema.json` usa substituição de processo (`/dev/fd/N`), então
`sm_json_validate` precisa aceitar caminho de FIFO e ler o arquivo uma vez só.

O script lê **apenas os brutos** de `S` (do perfil, só `claim_key` dos fatos `active` e
`next_fact_seq`) e monta o `payload`:

```json
{ "schema_version": "1.0", "request_kind": "memory_compact", "setup_id": "<12 hex>",
  "next_fact_seq": N, "existing_claim_keys": ["…"], "sessions": [ … ] }
```

Cada sessão é projetada para o subconjunto exato do request schema (`session_id, date, status,
topics, one_line_summary, affect, what_worked, what_didnt_work, skills_observed[],
how_it_happened[], open_questions, next_steps`); itens de `skills_observed`/`how_it_happened` sem
os campos obrigatórios são descartados. Bruto ausente ou ilegível fica de fora, com aviso.

O envelope é o de `docs/00` §6.1 (`protocol`, `protocol_version`, `request_id`, `script`,
`kind: "compact_facts"`, `setup_id`, `generated_at`, `response_schema`, `instructions_pt_br`,
`payload`), emitido por `sm_request`; se a lib devolver envelope vazio, o script monta o mesmo
envelope (RA-7: exit 10 nunca sai sem PEDIDO bem formado) e completa `setup_id`/`request_id`
quando a lib não os preencher.

`request_id` = primeiros 12 hex do `sha256` do payload canônico (`jq -cS`). **`generated_at` fica
fora do payload**, no envelope: é o que torna o `request_id` função pura do estado em disco e
permite ao `--apply` recalculá-lo (RA-2). O corpo validado contra o request schema é
`payload + {generated_at}`.

### 3.4 Fase APPLY

Aceita as duas formas: o envelope de `docs/00` §6.2 (`protocol`/`kind`/`request_id`/`items` com
**exatamente 1** item) — caminho preferido, que passa por `sm_apply_read` — ou o objeto nu do
`memory-compact.response.schema.json`. Ordem das checagens, todas antes de qualquer escrita:

1. arquivo ausente ou ilegível → **exit 2**;
2. `kind` do envelope != `compact_facts` → exit 5;
3. `request_id` presente e diferente do recalculado a partir do disco → **exit 5** (RA-2);
4. a resposta valida contra `memory-compact.response.schema.json` → senão **exit 5** (RA-3);
5. `request_kind` != `memory_compact` → exit 5;
6. **toda `claim_key` casa `^[a-z][a-z0-9_]{1,62}$`** (junção com `_`, sem dois-pontos) → senão exit 5. Esta checagem é feita pelo próprio script, não só pelo schema;
7. todo `source_sessions[]` e todo `pending_followups[].created_in_session` pertence a `S` → senão exit 5.

### 3.5 Consolidação

Para cada fato da resposta, comparado com o fato **`active` de mesma `claim_key`**:

| Caso | Efeito |
|---|---|
| não existe | cria fato novo `active`, `supersedes: null` → `facts_created++` |
| existe e a afirmação é **idêntica** (`claim` para semântico, `how` para procedimental) | **reconfirmação**: atualiza `last_observed_at` (máximo), une `source_sessions`, recalcula `confidence` e `times_observed`. **Não** cria fato novo e **não** supersede → `facts_reconfirmed++` |
| existe e a afirmação mudou | o antigo recebe `status: "superseded"` + `superseded_by`; nasce um fato novo `active` com `supersedes` apontando para ele. O antigo **permanece no arquivo** → `facts_created++`, `facts_superseded++` |

`fact_id` = `f-NNNN` a partir de `next_fact_seq`, atribuído pelo script (semânticos na ordem da
resposta, depois procedimentais); o modelo nunca numera fato.
`observed_at` = `min(datas das source_sessions)`, `last_observed_at` = `max(...)` quando a resposta
não os traz; `recorded_at` = agora (transaction time).

`confidence` é calculada **pelo script** — o valor da resposta é advisório e não entra na conta:

```
base = 1 sessão distinta → low · 2 → medium · 3+ → high
tetos: observation_type == "inferred"            → no máximo medium
       todas as source_sessions são "abandoned"  → low
       evidence null ou vazia                    → low
confidence = mínimo entre base e os tetos
```

`pending_followups` da resposta são anexados ao perfil com `state: "open"` quando o texto ainda
não existe lá.

### 3.6 Escrita

`profile.json` primeiro, validado contra `profile.schema.json` **antes** de publicar (falhou →
exit 5, nada é escrito); só depois o índice recebe, para cada sessão de `S`, `compacted_at = hoje`
e `digest_eligible = false` — **exceto** as 5 sessões de maior `session_id` do índice, que
permanecem `digest_eligible: true`. Os dois são um passo só: se o perfil falhar, o índice não é
marcado. Ambos por `sm_atomic_write`.

---

## 4. Invariantes verificáveis (insumo do gate)

| ID | Invariante | Como verificar |
|---|---|---|
| M-01 | O digest tem sempre as mesmas 18 chaves de topo, na mesma ordem, em todos os cenários | `jq -r 'keys_unsorted \| join(",")'` em memória vazia, normal, degradada e truncada |
| M-02 | O digest sai 0 com `memory/` vazia, índice ausente, bruto corrompido e orçamento estourado | 4 execuções com fixtures |
| M-03 | Duas execuções com `--now`/`--today` fixos produzem bytes idênticos | `diff` + `sha256sum` |
| M-04 | `procedural_playbook.avoid`, `orphan_sessions` e `pending_followups` são idênticos com e sem orçamento apertado | `jq -c` dos três blocos, `--budget-chars 200000` × `--budget-chars 2500` |
| M-05 | Reconstruir o índice de um setup já compactado não devolve nenhuma sessão a "não compactada" nem muda `compaction_count` | apagar `INDEX.json`, `--verify`, contar `compacted_at == null` e rodar `--if-due` |
| M-06 | `--verify` fecha órfã sem lock vivo preservando todo o conteúdo, e **não toca** em sessão com lock vivo | fixture com lock morto (pid inexistente) e com lock vivo |
| M-07 | A fase de PEDIDO não escreve nada em disco e sai 10 | `find -printf '%p %s %T@' \| sha256sum` antes e depois |
| M-08 | `claim_key` fora de `^[a-z][a-z0-9_]{1,62}$` é rejeitada com exit 5 e nada é gravado | resposta com `skill:derivadas-conceito:level` |
| M-09 | `--apply` sobre estado alterado sai 5 (RA-2) | acrescentar uma sessão entre PEDIDO e APPLY |
| M-10 | `INDEX.json`, `profile.json`, o corpo do PEDIDO e o da RESPOSTA validam contra os schemas | verificador mínimo em Python stdlib |
| M-11 | Os blocos `DERIVACAO-INDICE` e `OVERLAY-COMPACTACAO` são idênticos em `memory-index.sh` e `memory-digest.sh` | extrair entre os marcadores + `diff` |
| M-12 | Nenhum dos três scripts usa exit code fora de `0 1 2 3 5 10` | extração estática de `exit <n>` e `sm_die <n>` |

## 5. Divergências resolvidas neste fragmento

| # | Divergência | Resolução |
|---|---|---|
| D-1 | `docs/00` §11 I-29 fala em **19** chaves de topo do digest; os exemplos de `docs/03` §10.5/§10.6 têm **18** (com `procedural_playbook` aninhando `do` e `avoid`) | 18 chaves de topo, como nos exemplos. O 19 vem de contar `procedural_playbook.do` e `.avoid` separadamente na lista do passo 13. I-29 precisa ser corrigido para "18 chaves de topo / 19 blocos" |
| D-2 | `docs/00` §4.1 enumera `memory_state` como `first_session · warm`; `docs/03` §6.1 define quatro valores | Quatro valores (`first_session`, `degraded`, `warm`, `warming_up`), com `warming_up` como fallback. A linha de §4.1 é abreviada |
| D-3 | `claim_key`: `docs/00` §4.2 ainda traz a gramática com dois-pontos; `profile.schema.json`, `docs/03` §0 e os request/response schemas usam `^[a-z][a-z0-9_]{1,62}$` | snake_case com `_`. A linha de §4.2 é a que está errada |
| D-4 | `kind` do pedido: `compact_facts` (`docs/00` §6.1/§6.4) × `profile_compaction` (`docs/01`/`docs/03`) × `request_kind: memory_compact` (schemas) | `kind: "compact_facts"` no envelope (autoridade), `request_kind: "memory_compact"` no corpo (schema). São campos diferentes e coexistem |
| D-5 | O request schema exige `generated_at` **dentro** do corpo, mas o `request_id` do §6.1 precisa ser função pura do disco (RA-2) | `generated_at` fica no envelope; o corpo validado contra o schema é `payload + {generated_at}` |
| D-6 | `docs/00` §6.4 manda o caminho degradado gravar `compaction.deferred_at`; `profile.schema.json` fecha `compaction` com `additionalProperties: false` e não tem esse campo | O campo **não** é gravado (o schema vence sobre a nota do caminho degradado). Precisa entrar no schema antes de ser implementado |
| D-7 | `sm_request` (§7.2) não recebe `setup_id`, mas o envelope do §6.1 o exige | `memory-compact.sh` exporta `SM_SETUP_ROOT` e completa `setup_id` no envelope quando a lib o deixa vazio |
| D-8 | A tabela de derivação de `docs/03` §2.1 não lista `cross_setup_refs`, que existe em `index.schema.json` | Derivado de `session.cross_setup_refs`; a tabela é que está incompleta |
