# 31 — Sessão e material: `session-new.sh` · `session-close.sh` · `research-new.sh` · `docs-index.sh`

Contrato dos quatro scripts que abrem e fecham a sessão, alocam o destilado e ingerem o
`docs/` do setup. Autoridade: `docs/00-contratos.md` §2 (passos), §5 (exit codes), §6
(REQUEST/APPLY), §7 (interface de `lib/`), §8 (CLI). O racional vive em `docs/01`, `docs/03`,
`docs/10` e `SK/references/docs-ingest.md`.

Regras dos quatro: `#!/usr/bin/env bash` + `set -euo pipefail`, modo `0755`, `--help` próprio,
tudo entre aspas (raiz com espaço e acento é caso testado), stdout só o valor documentado, zero
rede, escrita só dentro de `<setup_root>` e de `$STUDY_METHOD_HOME`, nunca na raiz do `docs/` do
setup.

---

## 1. `session-new.sh` — passo `open_session`

| | |
|---|---|
| **Invocação** | `session-new.sh <setup_root> [--goal <texto>]` |
| **stdout** | O `NNNN` alocado, uma linha |
| **Exit codes** | `0` · `1` I/O · `2` uso · `3` sem setup · `4` sessão viva · `5` o `NNNN.json` produzido não valida |
| **Escreve** | `memory/NNNN.json`, `memory/.session.lock` |

### Algoritmo

1. Parse de argumentos; `sm_require_cmd jq`; `sm_setup_root "<hint>"` → `3` se não achar.
2. `memory/` ausente → recria (diretório **estrutural**, não conteúdo) com `sm_chmod_private`
   e avisa em uma linha (BOOT-1).
3. **Sonda de lock, somente leitura**, antes de alocar qualquer número: chama
   **`sm_session_lock_alive <lock>`** (`lib/common.sh`), o predicado ÚNICO de `docs/00-contratos.md`
   §7.1/§7.4 — o mesmo que `sm_setup_lock` usa no passo 9. Vivo → **exit 4**, e nenhum arquivo é
   criado. É o que impede a sessão concorrente de deixar um `NNNN.json` vazio para trás.
   ⛑ **Não reimplemente a regra aqui.** `lock_vivo` tem **duas vias**: `pid` numérico → `kill -0`;
   `pid: null` (o caso comum, sem `SM_SESSION_OWNER_PID`) → `started_at` dentro do
   `SM_SESSION_LOCK_TTL` (default 8 h). `hostname` diferente é órfão antes das duas. A cópia que
   exigia `pid` + `kill -0` fazia a sonda discordar do lock real: ela dizia "morto", o script
   alocava o `NNNN`, e só então `sm_setup_lock` via a sessão viva e mandava desfazer tudo.
4. `sm_next_seq "<memory>" .json` → `NNNN` (mecanismo `noclobber`, 5 tentativas; `4` se esgotar).
5. Materializa `SK/assets/templates/session/session.json.tmpl` com os placeholders congelados
   em `MANIFEST.tsv`: `SESSION_ID`, `SETUP_ID`, `DATE`, `STARTED_AT`, `SCHEMA_VERSION`.
   Template ausente → esqueleto interno equivalente, com aviso em stderr.
   Sobrou `{{…}}` no artefato → **exit 1**.
6. Ajustes que não vêm do template: `goal` (de `--goal`, senão `null`), `one_line_summary`
   provisório e remoção de `setup_id` quando o manifesto não trouxe um.
   Provisório = `"Sessão em andamento: <goal>"`, ou `"Sessão iniciada, ainda sem resumo."`,
   truncado em 160 caracteres — o arquivo precisa ser **válido em todo instante**, inclusive
   `in_progress` (`docs/03-memoria.md` §2).
7. **Valida antes de gravar**, contra `session.schema.json`, por *process substitution* — nunca
   existe `NNNN.json` inválido em disco. Falhou → remove o placeholder e **exit 5**.
8. `sm_atomic_write` grava o arquivo.
9. `SM_SESSION_ID=<NNNN>` exportado e `sm_setup_lock <setup_root>`. Corrida perdida (`4`) →
   desfaz a alocação (`rm` do `NNNN.json` recém-criado) e sai **4** sem deixar rastro.
10. Imprime `NNNN`.

### Condição de erro que importa

Lock **órfão** — `hostname` diferente, ou `pid` numérico e morto, ou `pid: null` com `started_at`
além do TTL — `sm_setup_lock` remove, avisa em stderr e prossegue. Consequência para
`lib/common.sh`: **não existe** um `pid` que sirva sozinho. O `$$` do próprio `session-new.sh`
morre no fim da invocação e faria todo lock nascer órfão; por isso o `pid` gravado é o de
`SM_SESSION_OWNER_PID` — um processo que **sobrevive à sessão** — quando ela existe, e **`null`**
quando não existe, caso em que a validade é o TTL (`docs/00-contratos.md` §7.4). Ler o lock por um
critério que ignore a via (b) fecha como abandonada a sessão que está em andamento.

---

## 2. `session-close.sh` — passo `close_session`, com REQUEST/APPLY

| | |
|---|---|
| **Invocação** | `session-close.sh <setup_root> [--session <NNNN>] [--recover <NNNN>] [--apply <resposta.json>]` |
| **stdout** | O `NNNN` fechado (ou o **PEDIDO** quando sai 10) |
| **Exit codes** | `0` (inclusive fechamento degradado) · `1` · `2` · `3` · `5` · **`10`** |
| **Escreve** | `memory/NNNN.json` finalizado; `setup.json` (`updated_at`, `last_session_at`, `session_count`); entrada do registry; remove `memory/.session.lock` |

### Qual sessão, nesta ordem
`--recover` → `--session` → `session_id` do `.session.lock` → maior `NNNN` com
`status == "in_progress"`. Nenhuma → **exit 2**. Sessão já finalizada e sem `--apply` → **exit 2**
(um `NNNN.json` finalizado nunca é reescrito).

### Campos pendentes — o que o script decide sozinho
Lista determinística, com o vocabulário fechado de `requests/session-close.request.schema.json`:

| Classe | Campos | Problema detectado |
|---|---|---|
| **Bloqueante** | `one_line_summary` | `missing` · `empty` (vazio **ou ainda o provisório da abertura**) · `invalid_format` · `too_long` (>160) |
| **Bloqueante** | `topics` | `invalid_format` (tag fora de `^[a-z][a-z0-9_]{1,62}$`) |
| Oportunista | `topics`, `what_was_done`, `what_was_learned`, `what_worked`, `what_didnt_work`, `open_questions`, `next_steps` | `missing` · `empty` |

Só um campo **bloqueante** dispara o PEDIDO. Os oportunistas viajam junto no mesmo pedido — se o
modelo já vai escrever, escreve tudo de uma vez. Sessão completa fecha com **exit 0 e nenhum PEDIDO**.

Campos derivados de execução (`session_id`, `date`, `status`, `finalized_at`, `artifacts`,
`skills_observed`, `how_it_happened`, `cross_setup_refs`) **nunca** entram: pedi-los seria pedir
ao modelo que invente o que a sessão foi.

### O ciclo REQUEST/APPLY (docs/00-contratos.md §6)

```
session-close.sh <root>
   └─ falta bloqueante → PEDIDO em stdout + exit 10, NADA em disco (RA-1)
      envelope §6.1: protocol · protocol_version · request_id · script · kind
                     "fill_session_fields" · setup_id · generated_at ·
                     response_schema "urn:study-method:schema:session-close-response:1" ·
                     instructions_pt_br · payload
      payload = objeto conforme session-close.request.schema.json
                (request_kind "session_close", attempt, max_attempts 2, missing_fields[], context)

modelo grava a RESPOSTA (envelope §6.2, items[0] = objeto conforme
                         session-close.response.schema.json)

session-close.sh <root> --apply <resposta.json>
   ├─ protocol/protocol_version/kind divergentes → 5
   ├─ request_id que não bate nem com o pedido 1 nem com o 2 → 5 (RA-2), nada aplicado
   ├─ resposta não valida contra o response schema → 5 (RA-3), nada aplicado
   ├─ chave em `values` fora de missing_fields → 5 (RA-5), nada aplicado
   ├─ aplica em memória; sem bloqueante restante → fecha, exit 0
   ├─ bloqueante restante NÃO declarado em `unfilled` e attempt < 2
   │     → PEDIDO 2 + exit 10, ainda sem tocar em disco
   └─ senão → CAMINHO DEGRADADO
```

**`attempt` sem estado extra em disco.** `request_id` é o `sha256` do payload canônico, e
`attempt` está *dentro* do payload: os dois pedidos possíveis têm ids diferentes, então o
`--apply` descobre a qual deles a resposta responde apenas comparando. Para que o id seja
reprodutível a partir do disco — exigência de RA-2 —, o `generated_at` **do payload** é o
`mtime` de `memory/NNNN.json`, não "agora": qualquer alteração no arquivo entre as duas fases
invalida o id, que é exatamente o que RA-2 quer detectar. O `generated_at` do **envelope**
continua sendo o instante da emissão.

### Caminho degradado (§6.4, RA-6) — obrigatório

Esgotados os dois ciclos, ou com todo bloqueante declarado em `unfilled`, a sessão fecha assim
mesmo: `status: "completed"`, `finalized_at`, `finalized_by: "student"` e `validation_errors[]`
com uma linha `"<campo>: <motivo>"` por pendência (`unfilled` + problemas restantes, `unique`).
**Nenhuma sessão fica presa em `in_progress` por causa de validação.** Se ainda assim o arquivo
final não validar, o script **grava**, avisa em stderr e sai `0`: sessão fechada com erro
declarado vale mais que sessão travada.

### `--recover <NNNN>`
Fechamento retroativo de órfã: `status: "abandoned"`, `finalized_by: "auto_orphan_recovery"`,
`finalized_at` = `mtime` do arquivo, e `one_line_summary` ← `"Sessão interrompida sem fechamento
(recuperada automaticamente)."` **apenas** se ainda for o provisório. Nunca emite PEDIDO, nunca
inventa conteúdo, nunca apaga nada. Sessão que não está `in_progress` → **exit 2**.

### Encadeamento dos derivados (`docs/01-arquitetura.md` §3, passo 9)
Depois de gravar a sessão, nesta ordem: destrava o lock (só se ele for desta sessão) → `setup.json`
→ registry (sob `sm_registry_lock`; ocupado → avisa e segue) → `memory-index.sh` →
`progress-update.sh` → `readme-sync.sh` → `memory-compact.sh --if-due`.
**Elo que falha avisa e não aborta**: todo derivado é reconstruível e todo derivado é escrito por
`sm_atomic_write`. Elo que sai `10` vira aviso ("rode-o à parte e responda com `--apply`").
Falha ao gravar o próprio `NNNN.json` é o **único** erro declarado ao aluno como perda real.
`session-close.sh` **não escreve `memory/profile.json`** — o perfil tem um escritor só.

---

## 3. `research-new.sh`

| | |
|---|---|
| **Invocação** | `research-new.sh <setup_root> --topic <slug> [--sources <csv>] [--session <NNNN>]` |
| **stdout** | O caminho **relativo** criado (`researchs/NNNN.md`) |
| **Exit codes** | `0` · `1` · `2` · `3` · `4` |

1. `--topic` é normalizado por `sm_normalize_slug` para kebab-case
   (`^[a-z0-9]+(-[a-z0-9]+)*$`); rótulo que não produz slug → **exit 2**.
2. `--sources` é CSV de caminhos **relativos à raiz do setup**. Caminho absoluto é convertido por
   `sm_relpath`; fora da raiz → **exit 2**. Nenhum caminho absoluto entra em arquivo do setup.
3. `--session` ausente → lido de `memory/.session.lock`; sem lock, fica `null`.
4. `sm_next_seq "<researchs>" .md` → `NNNN` (`4` se esgotar as 5 tentativas).
5. Materializa `research/research.md.tmpl` com os placeholders congelados: `RESEARCH_ID`,
   `TOPIC`, `CREATED_IN_SESSION`, `CREATED_AT`, `SOURCES_JSON`. Sobrou `{{…}}` → **exit 1**.
6. **Normaliza o bloco de proveniência** (`docs/00-contratos.md` §3.4), que é a primeira linha e
   tem de ser legível por `jq`:

   ```
   <!-- study-method:meta {"schema_version":"1.0","kind":"research","id":"0001",
        "topic":"cancelamento-catastrofico","sources":["docs/stewart-cap3.md"],
        "provenance":"generated_researched","created_in_session":"0007","status":"active",
        "verified_by_student":false,"disputed":false} -->
   ```

   `provenance` **não** é placeholder do `MANIFEST.tsv` — quem decide é o script:
   `generated_researched` com `sources[]` não vazio, `generated_unsourced` sem fontes.
   Primeira linha sem bloco `study-method:meta` → **exit 1**.
   Frontmatter YAML é proibido em artefato gerado (não há PyYAML nesta máquina).
7. `sm_atomic_write`; imprime o caminho relativo.

---

## 4. `docs-index.sh` — passo `load_docs`, com REQUEST/APPLY

| | |
|---|---|
| **Invocação** | `docs-index.sh <setup_root> [--topics t1,t2] [--budget-bytes N] [--force] [--select] [--apply <resposta.json>]` |
| **stdout** | `{mode, files, selected_sections, excluded, total_ingestible_bytes}` (ou o PEDIDO, quando sai 10) |
| **Exit codes** | `0` · `1` · `2` · `3` · `5` · **`10`** |
| **Escreve** | `memory/docs-index.json`; `memory/.cache/docs-text/<sha256>.txt` |

Constantes (`SK/references/docs-ingest.md`): orçamento `80000` bytes (~20k tokens a 4 bytes/token),
**60%** para o material (`48000`), teto de `200` arquivos, `5 MB` de texto extraído num único
arquivo força `indexed`, `20 MB` num único arquivo o torna não ingerível.

### Varredura (determinística, exit 0)

1. `docs/` do setup ausente → avisa e produz índice com `files: []`. **A skill não cria conteúdo lá.**
2. Enumera `-type f`, ordem **material do aluno na raiz primeiro, `generated/` depois** (o começo
   do contexto é a posição forte da curva em U). Symlink que aponta para fora do setup nunca é
   seguido: entra em `not_ingested` com `symlink_outside_setup`.
3. Por arquivo: `bytes` (do disco), `sha256`, `mtime` ISO, `kind` do enum
   `markdown|text|pdf|html|binary|unknown`, `provenance` (`generated/` → `generated`).
4. Extração de texto por extensão: texto direto (`.md .markdown .txt .rst .org .tex`) ·
   `.csv/.tsv` cabeçalho + 5 linhas · `.ipynb` células markdown e código (python3 stdlib) ·
   `.html` sem tags · `.pdf` por `pdftotext -layout`. `.docx/.odt/.epub` sem `pandoc` →
   `not_ingested/no_extractor` **com o comando sugerido**. Nada é instalado, nunca.
5. **Seções, em `LC_ALL=C awk`** — sem isso `length()` conta caracteres e o offset erra em todo
   texto acentuado (medido no mesmo arquivo: `[0,91,267,380]` contra `[0,97,279,392]`, correto).
   Cabeçalho = `^#{1,6} ` sempre; em não-markdown também linha numerada
   (`^[0-9]+(\.[0-9]+)*\s+\S`), linha sublinhada por `===`/`---`, e linha curta toda em
   maiúsculas. `offset`/`bytes` **em bytes**; a primeira seção absorve o preâmbulo (offset 0), a
   última vai até o fim do arquivo. `section_id` derivado do heading (acento dobrado para ASCII,
   `^[a-z0-9][a-z0-9_]{0,79}$`, desambiguado por sufixo). Arquivo sem estrutura → `sections: []`
   e uma unidade `"(arquivo inteiro)"`.
6. **PDF**: a âncora é a **faixa de páginas**, não o heading. `pdftotext` emite **um form feed por
   página**: `pages` = número de form feeds, e cada seção ganha `page_from`/`page_to` de graça
   (`offset` fica `null`). O texto extraído vai para `memory/.cache/docs-text/<sha256>.txt`
   (derivado, descartável, `--force` reextrai). `extracted_text_bytes / pages < 100` com
   `pages ≥ 5` → aviso de **PDF escaneado**, nunca "PDF vazio".
7. `mode`: `full` se `total_ingestible_bytes ≤ budget` e nenhuma guarda dura disparou; senão `indexed`.
8. `loaded[]`/`left_out[]`:
   - `full` → uma entrada `full_mode` por arquivo legível; `left_out[]` traz os não ingeríveis
     com `not_ingestible`.
   - `indexed` → **o sumário de todos os cabeçalhos entra sempre** (`table_of_contents`, uma
     entrada por arquivo), depois as seções por score decrescente até 60% do orçamento
     (`topic_match`). O resto vai para `left_out[]` com `budget_exhausted` ou `low_relevance` e um
     `reopen_hint` já resolvido (`offset N bytes, B bytes` ou `páginas N-M`).
9. Valida o documento contra `docs-index.schema.json` **antes** de gravar (process substitution);
   inválido → **exit 5**. Grava por `sm_atomic_write`.

### Score — mecânico, e só isso

```
score = 3*heading_hits + min(body_hits, 10) + (provenance == student_provided ? 1 : 0) - bytes/20000
```

Termos vêm de `--topics` (normalizados por `sm_normalize_concept_id`) e depois do `subject` do
manifesto. A comparação dobra acentos para ASCII e trata `_` como separador, para que `erro_numerico`
case com "erro numérico". **Fora da conta, por serem incomputáveis** (nenhum existe em schema algum,
AR-28): `next_topic`, "seção usada nas últimas 3 sessões" e `disputed`.

### O ciclo REQUEST/APPLY

```
docs-index.sh <root> --select [--topics t1,t2]
   → PEDIDO em stdout + exit 10, SEM tocar em disco: nem índice, nem cache de PDF (RA-1)
     kind "select_sections"; response_schema "urn:study-method:schema:docs-index-response:1"
     payload conforme docs-index.request.schema.json: topic_terms, budget_bytes,
     remaining_bytes (= 60% do orçamento menos o sumário), candidates[] ordenadas por score
   → sem nenhuma candidata: NÃO sai 10 (RA-7). Avisa e sai 0.

docs-index.sh <root> --apply <resposta.json>
   → protocol/kind divergentes → 5
   → request_id divergente → 5 (o material mudou entre as fases; nada aplicado)
   → seção que não está entre as candidatas → 5, resposta inteira recusada
   → o script CONFERE o orçamento: ordena por `rank`, corta do fim quando a soma dos bytes
     passa de remaining_bytes, e grava mode "indexed" com loaded[]/left_out[]
```

`generated_at` do payload é o **maior `mtime`** do material varrido, pela mesma razão do
`session-close.sh`: `request_id` reprodutível a partir do disco (RA-2).

O `left_out_note` da resposta vai para o log da ingestão; a lista item a item é sempre montada
pelo script. `left_out[]` é campo **obrigatório** do schema porque é dele que sai a frase honesta
ao aluno: *"carreguei o capítulo 3 e a seção 4.1; ficaram de fora os capítulos 1-2 e 5 a 12, e se a
gente esbarrar em algum eu abro na hora"*. Nunca dizer "li seu material" tendo lido 4% dele.
