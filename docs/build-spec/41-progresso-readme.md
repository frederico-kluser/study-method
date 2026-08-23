# `progress-update.sh` e `readme-sync.sh`

> Fragmento do BUILD_SPEC. **Contrato, não racional**: o que os dois artefatos recebem, o que
> produzem, o algoritmo e as condições de erro. O porquê vive em `docs/04-proficiencia.md`
> (máquina de proficiência) e `docs/07-multi-setup.md` §4 (o `README.md` do setup).
>
> Autoridade sobre fronteiras: `docs/00-contratos.md` §3.5, §5, §7, §8, §11.

## 1. `progress-update.sh` — a máquina de proficiência

### 1.1 Interface

```
progress-update.sh [<setup_root>] --event <evento.json>|-   # aplica UM evento
progress-update.sh [<setup_root>] --due                     # vencidos + decaimento preguiçoso
progress-update.sh [<setup_root>] --recompute               # escalares a partir de evidence[]
progress-update.sh --help
```

As três são mutuamente exclusivas (duas juntas ⇒ **exit 2**). `<setup_root>` omitido é descoberto
por `sm_setup_root` a partir do `$PWD`. **Não existe flag** para escrever `proficiency_state`,
`state_reason`, `confidence` ou `interval_days`: os quatro são sempre calculados, e é essa ausência
que torna aplicável a regra "escrita só por evento".

| Modo | stdout | Escreve em disco |
|---|---|---|
| `--event` | JSON de uma linha: `{mode, applied, results:[{concept_id, transition_rule, state_before, state_after, class, applied}], warnings}` | `memory/progress.json`, só se algo mudou |
| `--due` | JSON: `{today, decayed[], due[], suggested[], warnings}` | idem, só se houve decaimento (T4) |
| `--recompute` | JSON: `{mode, changed, diff:[{concept_id, field, from, to}], warnings}` | idem, só se `changed > 0` |

Arquivo alvo: `<setup_root>/memory/progress.json`. Ausente, é criado com `policy` default e
`concepts: []`. Lock próprio: `memory/.progress.lock` (`mkdir`, atômico); lock com `mtime > 60 s` é
morto — removido com aviso e retomado uma vez. Escrita por `sm_atomic_write`, sempre depois de
`sm_json_validate` contra `progress.schema.json`.

### 1.2 Formato do evento

Objeto JSON, **um evento por arquivo** (`-` lê de stdin). Valida contra
`assets/schemas/progress-event.schema.json` **depois** da normalização do passo 0.

| Campo | Obrigatório | Semântica |
|---|---|---|
| `schema_version` | sim | `^[0-9]+\.[0-9]+$` |
| `setup_id` | não | `^[0-9a-f]{12}$`. Divergente do setup alvo ⇒ **exit 5** — é o que impede escrita cruzada |
| `kind` | sim | `challenge` · `exposure` · `self_report` · `review_declined` · `decay` |
| `concept_id` | sim¹ | `^[a-z][a-z0-9_]{1,62}$` |
| `concept` | sim¹ | Rótulo canônico pt-BR; resolvido por `concept_id` → `aliases[]` → `sm_normalize_concept_id` |
| `session_id` | `kind != decay` | `^[0-9]{4}$`; `memory/<id>.json` **tem que existir** |
| `challenge_id` | `kind = challenge` | `^[0-9]{4}$`; `challenges/<id>-*/` **tem que existir** |
| `observed_at` | sim | `AAAA-MM-DD`, *valid time*; é a chave de ordenação |
| `recorded_at` | não | ISO 8601 com offset, *transaction time*. Ausente ⇒ `sm_now_iso` |
| `result` / `last_result` | `kind = challenge` | Vocabulário de entrada de 6 valores; normalizado no passo 0 |
| `hint_level` | não | Inteiro 0..5 ou `null`. **`null` nunca é 0** |
| `error_type` | não | `slip` · `conceptual` · `prerequisite` · `none` · `unknown`. Ausente ⇒ `unknown` |
| `attributed_to` | `error_type = prerequisite` | `concept_id` do pré-requisito |
| `attempts` | não | Inteiro ≥ 0 |
| `self_report_claim` | `kind = self_report` | `mastery` · `no_mastery` (aceita `positive`/`negative`) |
| `note` | não | pt-BR livre, truncado em 240 |

¹ pelo menos um dos dois. Presentes os dois e discordantes ⇒ **exit 5**.

O evento **não** carrega `state_before`, `state_after` nem `transition_rule`. Trazê-los ⇒ **exit 5**.

### 1.3 Passo 0 — a normalização, antes de qualquer classificação

| Entrada (`last_result` / `result`) | → `evidence[].result` |
|---|---|
| `passed` | `passed` |
| `failed` | `failed` |
| **`timeout`** | **`failed`** |
| **`error`** | **`failed`** |
| `not_run` | `not_attempted` |
| `not_attempted` | `not_attempted` |
| qualquer outro | **exit 5** — nunca normalizado por adivinhação, nunca absorvido pela classe B |

Sem esta tabela, `timeout` e `error` caem no ramo "caso contrário" e **promovem** `unknown → fragile`
pela T1. A conversão é obrigatória e acontece antes da classificação.

### 1.4 As três classes de desfecho

Calculadas só para `kind = challenge` com `result ∈ {passed, failed}`. **Ordem de teste fixa; a
primeira que casar vence.**

| Classe | Condição |
|---|---|
| **C** | `result = failed` **OU** `hint_level >= 4` **OU** `error_type = conceptual` |
| **A** | `result = passed` **E** `hint_level ∈ {0,1}` **E** `error_type ∈ {none, slip}` |
| **B** | todo o resto |

`hint_level = null` não satisfaz A (ausência de registro não é prova de autonomia) e cai em B.
`result = not_attempted` **não é classificado em classe nenhuma**.

### 1.5 As transições

| ID | De → Para | Gatilho | Efeito |
|---|---|---|---|
| **T1** | `unknown` → `fragile` | desafio classe A ou B | `state_reason` = `passed_unassisted` (A) / `passed_with_hints` (B) |
| **T2** | `fragile` → `mastered` | 2ª classe A, `session_id` distinto, `observed_at` diferindo ≥ 1 dia, ambas dentro de `mastery_window_days` e posteriores ao último classe C | `passed_unassisted` |
| **T3** | `mastered` → `fragile` | desafio classe B ou C | `conceptual_error` \| `failed` \| `passed_with_hints`; **classe C zera `interval_days` (→1) e `unassisted_passes`** |
| **T4** | `mastered` → `fragile` | `kind = decay`, ou `hoje − observed_at >= (1 + decay_overdue_ratio) × interval_days` | `temporal_decay`; **`interval_days`, `next_review_at` e `unassisted_passes` PRESERVADOS** |
| **T5** | `fragile` → `mastered` | **1** classe A, se a última demoção foi T4 e não houve classe C desde então | `passed_unassisted` |
| **T6** | `fragile` → `unknown` | 2ª classe C conceitual consecutiva, em `session_id` distintos, sem passagem entre elas | `conceptual_error` |
| **T7** | X → X | evento classificado que não casa com nenhuma acima | `state_reason` conforme o desfecho |
| **T8** | `mastered` → `fragile` | `kind = self_report` com `self_report_claim = no_mastery` | `self_report`; não toca `interval_days` |
| *(sem regra)* | X → X | `exposure`, `review_declined`, `challenge` com `not_attempted` | `transition_rule: null`; só `last_observed_at` |

T5 tem precedência de rótulo sobre T2 (as duas levam a `mastered`; T5 preserva a informação de que
a promoção foi restauração pós-decaimento).

**T3 ≠ T4 é a distinção que `state_reason` existe para carregar**: quem errou reaprende do zero
(intervalo 1, contagem zerada, volta pela T2 com duas passagens); quem só ficou tempo sem revisar
mantém o intervalo aprendido e volta pela T5 com **uma** passagem.

### 1.6 Ordem de avaliação

```
0. normaliza (§1.3); valor fora do enum de result/kind/error_type  => exit 5
1. resolve concept_id (concept_id -> aliases[] -> sm_normalize_concept_id)
2. verifica artefato: memory/<session_id>.json e challenges/<challenge_id>-*/  => exit 5
3. idempotência: chave (concept_id, kind, session_id, challenge_id, observed_at)
                 já em evidence[]  => no-op, exit 0
4. state_before := proficiency_state atual
5. despacha por kind (exposure|review_declined -> sem regra; self_report -> T8|T7;
   decay -> T4|T7; challenge -> classifica e aplica a tabela da §1.5)
6. anexa a entrada em evidence[], em posição cronológica, com state_before,
   state_after e transition_rule
7. recomputa TODA a camada escalar a partir de evidence[] (§1.7)
```

`error_type = prerequisite` (§6.4 de `docs/04`) produz **duas** escritas: no conceito alvo uma
entrada `kind: exposure` com `error_type: prerequisite` e `attributed_to` (exposure nunca muda
estado), e no conceito de `attributed_to` a evidência penalizante inteira, com
`error_type: unknown` (nunca chutar) e classificada normalmente.

### 1.7 A camada escalar é cache — toda ela derivada de `evidence[]`

| Campo | Derivação |
|---|---|
| `proficiency_state` | `state_after` da evidência cronologicamente mais recente |
| `state_reason` | do último evento com desfecho: classe A → `passed_unassisted`; B → `passed_with_hints`; C → `conceptual_error` se `error_type = conceptual`, senão `failed` se `result = failed`, senão `passed_with_hints`; T4 → `temporal_decay`; T8 → `self_report` |
| `confidence` | `high` ≥ 2 evidências qualificadas com a mais recente ≤ 30 dias · `medium` exatamente 1, ou ≥ 2 com a mais recente entre 31 e 90 · `low` nenhuma, ou a mais recente > 90. Qualificada = `kind: challenge` com `result ∈ {passed, failed}`. **Enum, nunca número** |
| `attempts` | soma de `evidence[].attempts` das entradas `kind: challenge` |
| `unassisted_passes` | classe A com `observed_at` posterior ao último classe C e à última T6. **T4 não zera** |
| `max_hint_level_used` | `hint_level` da evidência de desafio mais recente (`null` se não houver) |
| `last_error_type` | `error_type` da evidência de desafio mais recente |
| `first_observed_at` / `last_observed_at` | menor / maior `observed_at` de toda a evidência |
| `observed_at` | `observed_at` da evidência de desafio mais recente com `result ∈ {passed, failed}` |
| `interval_days` | replay do §1.8 sobre a evidência em ordem cronológica |
| `next_review_at` | `observed_at + interval_days`; `null` sem evidência de desafio |

`recorded_at` (do conceito e do documento) é *transaction time* e **não** é derivado: `--recompute`
só o toca quando algum escalar mudou de fato.

### 1.8 Intervalo (`policy` mora no dado, não no código)

| Classe | Estado resultante | Novo `interval_days` | Teto |
|---|---|---|---|
| A | `mastered` | `max(anterior + 1, round(anterior × interval_multiplier_mastered))` | `interval_cap_mastered_days` |
| A | `fragile` | `max(anterior + 1, round(anterior × interval_multiplier_fragile))` | `interval_cap_fragile_days` |
| B | `fragile` | idem | idem |
| C | qualquer | **1** (reset) | — |

`round` é meio-para-cima. `decay`, `self_report`, `exposure` e `review_declined` **não** alteram o
intervalo. Tetos aplicados no momento do recálculo, nunca retroativamente. Defaults quando `policy`
está ausente: `2.3 · 1.3 · 180 · 21 · 1.0 · 60 · 2`.

### 1.9 `--due`

1. Decaimento preguiçoso: para cada `active`+`mastered` com
   `hoje − observed_at >= ceil((1 + decay_overdue_ratio) × interval_days)`, grava
   `kind: decay` com `observed_at` = **a data em que o limiar foi cruzado** e `recorded_at` = agora
   (bitemporalidade: o fato virou verdade antes de o sistema saber). `decay_overdue_ratio = 0`
   desliga.
2. Filtra: `status = active` **E** `next_review_at != null` **E** `next_review_at <= hoje` **E**
   `proficiency_state ∈ {fragile, mastered}`. `unknown` nunca entra na fila de revisão.
3. Ordena: `fragile` antes de `mastered`; dentro do grupo, maior atraso relativo primeiro.
4. Intercala: não sugere dois do mesmo `track_ref` havendo alternativa vencida de outro.
5. Corta em `policy.max_review_suggestions_per_session` — sai em `suggested[]`; `due[]` traz a lista
   completa.

### 1.10 Proibições e códigos de saída

- **Proibido** calcular, gravar ou emitir porcentagem, nota, score ou probabilidade de domínio.
  `confidence` é enum e mede a **classificação**, não a chance de o aluno saber.
- **`state_reason: manual` nunca é escrito por nenhum caminho de código.** É preservado pelo fluxo
  de evento e **desfeito** por `--recompute`, com um aviso de uma linha em stderr.
- **Nada é deletado** de `evidence[]`.

| Código | Quando |
|---|---|
| `0` | evento aplicado, ou no-op idempotente |
| `1` | I/O, dependência ausente |
| `2` | uso incorreto (modos conflitantes, `--event` sem caminho, flag desconhecida) |
| `3` | setup não encontrado |
| `4` | `memory/.progress.lock` ocupado |
| `5` | evento fora do schema · `setup_id` divergente · `session_id`/`challenge_id` inexistente · `result` fora do enum · evento informando estado · resultado que não valida contra `progress.schema.json` |

`10` não é produzido: nenhuma etapa deste script precisa de julgamento do modelo.

## 2. `readme-sync.sh` — o `README.md` do setup

### 2.1 Interface

```
readme-sync.sh [<setup_root>] [--init]
readme-sync.sh --help
```

stdout: **o número de linhas geradas**. Exit: `0` (inclusive com avisos) · `1` · `2` · `3`.

- **sem `--init`**: regenera o interior dos marcadores. `README.md` ausente é recriado inteiro
  (o arquivo é reconstruível, menos a prosa do aluno).
- **`--init`**: cria o esqueleto com as 8 seções. **Arquivo existente não é sobrescrito** — avisa em
  stderr, imprime `0` e sai `0`.

Escrita por `sm_atomic_write`, e só quando o conteúdo mudou de fato.

### 2.2 O contrato dos marcadores

```
<!-- study-method:begin <secao> -->
...regenerado...
<!-- study-method:end <secao> -->
```

As 8 seções, nesta ordem: `identidade` · `taxonomia` · `base-teorica` · `destilados` · `desafios`
· `linha-do-tempo` · `pontes` · `estado-atual`.

**Garantia de preservação:** o script substitui **exclusivamente** as linhas *entre* um par
`begin`/`end` bem formado. Tudo o mais — títulos, prosa antes, entre e depois das seções, o rodapé,
o que estiver colado logo após um `end` — é copiado byte a byte. Perder essa prosa uma vez destrói a
confiança no arquivo (D-A20).

| Defeito no arquivo | Comportamento |
|---|---|
| Seção sem marcador | avisa e **acrescenta o bloco ao final**, sem tocar no que já estava escrito |
| Marcador duplicado | avisa e **não toca** naquela seção; as demais são atualizadas |
| `begin` sem `end` (ou `end` órfão) | avisa e **não toca** naquela seção; as demais são atualizadas |
| Marcador com nome desconhecido | avisa e preserva como está |
| `README.md` sem marcador nenhum | avisa e acrescenta as 8 seções ao final, preservando o texto |

Nenhum defeito de marcador leva a reescrita do arquivo inteiro. O script degrada; nunca corrompe.

### 2.3 Fontes de cada seção

| Seção | Conteúdo | Fonte |
|---|---|---|
| `identidade` | `setup_id`, `setup_name`, `title`, `subject`, linguagem, criação, nº de sessões | `setup.json` |
| `taxonomia` | lista aninhada por prefixo `_`, cada tópico com seu `proficiency_state` | `setup.json.taxonomy` × `memory/progress.json` — **ambos em `snake_case`**, casados por igualdade de string |
| `base-teorica` | tabela arquivo \| tópicos \| resumo | `memory/docs-index.json` |
| `destilados` | tabela arquivo \| tópico \| status | bloco `<!-- study-method:meta {…} -->` de cada `researchs/NNNN.md` |
| `desafios` | tabela desafio \| conceito \| `challenge_status` | `challenges/*/meta.json` |
| `linha-do-tempo` | total, período e o `one_line_summary` das últimas 10 | `memory/INDEX.json` |
| `pontes` | `setup_id`, `setup_name`, por que a ponte existe, sessões | `cross_setup_refs` do `INDEX.json` **deste** setup |
| `estado-atual` | contagens por estado, próxima revisão, fios em aberto | `memory/progress.json` + `memory/profile.json` |

Fonte ausente ou ilegível não é erro: a seção sai com uma linha dizendo que ainda não há dado, e o
aviso vai para stderr.

### 2.4 Pontes: unilaterais, sempre

A seção `pontes` registra **apenas** as pontes que este setup criou. O setup de destino **não recebe
byte nenhum** — nem no `README.md`, nem em `memory/`, nem em lugar algum. Escrita cruzada entre
setups é proibida sem exceção; não existe campo `reciprocal` porque a ponte só tem um lado.
`readme-sync.sh` escreve exatamente um caminho: `<setup_root>/README.md`.

### 2.5 Idempotência e orçamento

- **Idempotente**: duas execuções seguidas sem dado novo produzem arquivos byte a byte iguais
  (I-30). Nenhum carimbo de tempo entra na parte gerada — é o que garante a propriedade.
- **Teto de 200 linhas geradas** (interior + linhas de marcador). Acima disso, encolhe nesta ordem:
  `linha-do-tempo` (10 → 5 → 3 → só o resumo de topo), depois `destilados` e `desafios` (contagem +
  os 10 mais recentes, depois só a contagem). O encolhimento é anunciado em stderr.

## 3. Dependências e invariantes cobertas

Consomem de `lib/`: `sm_setup_root`, `sm_die`, `sm_log`, `sm_require_cmd`,
`sm_normalize_concept_id`, `sm_atomic_write`, `sm_now_iso`, `sm_today`, `sm_json_get`,
`sm_json_ok`, `sm_json_validate`. Ferramentas: `bash` 4+, coreutils, `jq`, `python3` da stdlib.
`sm_today` honra `STUDY_METHOD_TODAY`, o que torna o gate determinístico.

Invariantes do `docs/00-contratos.md` §11 que estes dois artefatos sustentam: **I-18** (só os exit
codes 0–5), **I-21** (`pipefail`, nenhum teste `== 1`), **I-25** (nenhuma escrita fora de
`<setup_root>`), **I-26** (zero rede), **I-27** (derivados por `sm_atomic_write`), **I-30**
(`readme-sync.sh` idempotente), **I-31** (`--recompute` sem diferença), **I-41** (os 8 nomes de
seção).
