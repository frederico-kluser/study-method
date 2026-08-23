# Scripts — como o tutor invoca cada um

Instrução operacional. Referência de primeiro nível: carregada direto do `SKILL.md`. Racional
completo em `docs/00-contratos.md` §5–§8 do repositório — documento para humanos, não carregue em
runtime.

## Sumário
Convenção geral · Exit codes e o que fazer com cada um · ⭐ Protocolo REQUEST/APPLY (com exemplo
completo) · Os 19 componentes de `SK/scripts/`, agrupados pelos 9 passos.

---

## 0. Convenção geral

Todo script recebe **`<setup_root>` como primeiro argumento posicional**, exceto:
`setup-init.sh` (recebe `<path>`, ainda sem setup), `challenge-verify.sh` (recebe
`<challenge_dir>`), `detect-toolchains.sh`, `render-plot.py`, e os três de `lib/` (nunca são
invocados — só `source`, e nunca por você diretamente).

## 1. Exit codes — o que fazer com cada um

| Código | Significado | O que o tutor faz |
|---|---|---|
| **0** | ok | Segue. Leia o stdout — mesmo com `warnings`, o passo está completo. |
| **1** | erro de execução (I/O, permissão, dependência ausente) | Mostre ao aluno o caminho exato e o que faltou, em uma linha; não invente a causa; não repita a chamada sem mudar algo. |
| **2** | uso incorreto (argumento faltando/inválido) | É bug da sua invocação, nunca do aluno. Corrija os argumentos e tente de novo; não exponha isso ao aluno. |
| **3** | setup não encontrado | O `<setup_root>` que você passou não tem `setup.json` legível. Volte para `bootstrap`; não insista no mesmo caminho. |
| **4** | recurso travado | `.session.lock` vivo → outra sessão está aberta; pergunte ao aluno (abortar é o default) — não force. `.registry.lock` ocupado → é sempre transitório (morre em 60 s); a própria `lib/common.sh` já retenta uma vez. Colisão de `NNNN` → o próprio script já tentou 5 vezes; se ainda assim vier 4, é sinal de algo mais grave — avise e não insista sozinho. |
| **5** | validação de schema falhou | **Nunca** cole o JSON de stderr para o aluno. Se veio de um `--apply`, o motivo mais comum é `request_id` divergente (§2.2) — refaça o pedido, não force. Fora do protocolo REQUEST/APPLY, é sinal de dado corrompido: siga o caminho degradado do passo (quarentena, `unclassified`, etc.), nunca trave a aula por causa disso. |
| **10** | `needs_model_input` | Não é erro. É um PEDIDO em stdout esperando julgamento seu. Protocolo completo na §2. |

**Regra de leitura, sem exceção**: `!= 0` é falha, nunca teste `== 1`. Rust, Node, `unittest` sem
teste coletado e outros ambientes usam códigos fora do 0/1 — a tabela acima já é a normalizada da
skill, mas o hábito de checar por igualdade a 1 é o erro mais comum de quem lê exit code.

---

## 2. ⭐ O protocolo REQUEST/APPLY

Quatro scripts podem sair com **exit 10**: `session-close.sh`, `docs-index.sh --select`,
`memory-compact.sh`, `challenge-verify.sh`. Nenhum outro script deste projeto produz esse código.

**A ideia em uma frase: você nunca escreve direto no estado.** Um script roda até onde é mecânico,
pede sua opinião só onde é opinião de verdade, e só grava depois de validar sua resposta contra um
schema. Não existe atalho — mesmo tendo certeza da resposta, o ciclo completo é obrigatório.

### 2.1 O ciclo, passo a passo

1. Você invoca o script normalmente. Ele imprime um **JSON de PEDIDO** em stdout e sai **10**.
   **Nada foi gravado em disco** — nem lock, nem arquivo temporário, nem log.
2. Você lê o pedido. Ele traz um `request_id`, o que já foi calculado deterministicamente, e um
   payload com o que falta decidir.
3. Você produz o JSON de **RESPOSTA** — no formato exigido pelo `response_schema` do pedido — e
   grava num arquivo (ex.: no seu diretório de trabalho da sessão).
4. Você re-invoca o **mesmo** script, agora com `--apply <arquivo-da-resposta.json>`.
5. O script **recalcula** o `request_id` a partir do estado atual em disco, confere que bate com o
   da sua resposta, valida a resposta inteira contra o schema, e só então grava — atomicamente.

Se o `request_id` não bater (o estado mudou em disco entre o passo 1 e o passo 4 — por exemplo
outra escrita aconteceu no meio), o script recusa com **exit 5**. **O certo é refazer o pedido do
zero (voltar ao passo 1), nunca insistir com a mesma resposta.**

### 2.2 Exemplo concreto — `memory-compact.sh`

```
$ memory-compact.sh /home/aluno/estudos/calculo --if-due
```

Se há ≥15 sessões não consolidadas, o script agrupa os candidatos, calcula `confidence` e sai:

```json
{
  "protocol": "study-method/request-apply",
  "protocol_version": "1.0",
  "request_id": "a1b2c3d4e5f6",
  "script": "memory-compact.sh",
  "kind": "compact_facts",
  "setup_id": "9f2c41ab77e0",
  "generated_at": "2026-08-23T21:04:00-03:00",
  "response_schema": "urn:study-method:schema:apply-compact-facts:1",
  "instructions_pt_br": "Uma frase por item, em prosa, sem inventar além da evidência.",
  "payload": { "items": [ { "candidate_group": "…", "evidence": ["…"] } ] }
}
```

Exit code é **10**. Nada em `memory/profile.json` mudou ainda. Você lê `payload.items`, escreve a
`claim`/`how`/`claim_key` de cada grupo em prosa curta, salva a resposta em arquivo com o mesmo
`request_id` e `kind`, e roda:

```
$ memory-compact.sh /home/aluno/estudos/calculo --apply /caminho/resposta.json
```

Só agora `profile.json` é atualizado — por escrita atômica, com os fatos novos e os supersedidos.

### 2.3 Os quatro usuários do protocolo

| Script | `kind` do pedido | O que pede a você | Caminho degradado (2 ciclos esgotados) |
|---|---|---|---|
| `memory-compact.sh` | `compact_facts` | Consolidar cada grupo de sessões brutas em prosa (`claim`/`how`) e nomear o `claim_key` | Não compacta nada; marca `compaction.deferred_at`. Nenhum bruto se perde — só não vira fato consolidado ainda. |
| `session-close.sh` | `fill_session_fields` | Preencher os campos que faltaram na sessão (`one_line_summary`, `topics`, `what_worked`, `what_didnt_work`, `open_questions`, `next_steps`), só com o que ela sustenta | Fecha do mesmo jeito: `status: "completed"` + `validation_errors[]`. **Nunca** deixa a sessão presa em `in_progress` por isso. |
| `challenge-verify.sh` | `classify_survivor` | Classificar cada mutante sobrevivente como `equivalent` ou `test_gap` (`not_equivalent` na resposta), com justificativa auditável de uma linha | Todo sobrevivente vira `unclassified` → tratado como `test_gap`, o lado conservador. O score cai, o veredito tende a `weak`. |
| `docs-index.sh --select` | `select_sections` | Escolher, entre as seções empatadas no score, quais entram no orçamento da aula | Usa a ordem de score pura e corta no teto — e você **declara em voz alta** que a seleção foi automática. |

### 2.4 Regras duras — nunca violar

- A fase de PEDIDO nunca escreve nada, nem para diagnóstico.
- Você nunca infere a resposta sozinho e grava por fora do `--apply`; não há atalho de escrita direta.
- Aplicar a mesma resposta duas vezes produz o mesmo estado (idempotente) — não tenha medo de
  re-invocar `--apply` se a conexão caiu no meio.
- Teto de **2** pedidos por invocação lógica; esgotado, o script segue sozinho pelo caminho
  degradado da tabela acima e registra o fato — você não fica tentando pela terceira vez.

---

## 3. Os 19 componentes de `SK/scripts/`, por passo

`lib/common.sh`, `lib/json.sh`, `lib/sandbox.sh` completam os 19, mas são só `source` — nenhum
script chamado por você diretamente. O que segue é o que você de fato invoca.

### Passo `bootstrap`

**`setup-list.sh --resolve <cwd>`** — resolve em qual setup a sessão roda.
Stdout: caminho absoluto do setup, se achar.
Exit: `0` achou · `1` erro de leitura · `2` uso incorreto · `3` `--resolve` não achou nada
(candidato a `setup_interview`) · `4` registry travado.
Outras formas: sem argumento lista os setups `active`; `--all` inclui `missing`/`archived`;
`--json` para saída estruturada; `--archive <setup_id>` / `--forget <setup_id>` são administrativas.

**`detect-toolchains.sh --cached [--setup <setup_root>]`** — só quando
`language.detected_at` do `setup.json` tem mais de 30 dias.
Stdout: JSON por linguagem, `{available, version, command}`.
Exit: `0` · `1` erro de execução · `2` uso incorreto. Sem exit 10: é puramente determinístico.

### Passo `setup_interview` (CONDICIONAL)

**`setup-init.sh <path> --subject <s> --subject-slug <sl> --title <t> [--language <l>] [--skill-level <n>] [--session-minutes <n>] [--theory-source <ts>] [--defaults-used <csv>]`**
Stdout: o `setup_id` recém-alocado (12 hex).
Exit: `0` · `1` sem permissão de escrita no `<path>` · `2` faltou `--subject`/`--subject-slug`/`--title`
· `4` colisão de `setup_id` no registry (o próprio script já resorteia até 5 vezes; 4 persistente é
grave) · `5` dados não validam contra `setup-manifest.schema.json`.
**Idempotente**: rodar duas vezes no mesmo `<path>` não duplica nem sobrescreve.

**`readme-sync.sh <setup_root> --init`** — chamado logo depois, para gerar o `README.md` do setup.
Ver detalhe abaixo, em `close_session` (é o mesmo script, outra flag).

**`decisions-ask.sh setup-init --setup <setup_root> [--json] [--answer <id>=<valor>]`**
Stdout: as decisões em aberto daquela fase, em JSON.
Exit: `0` · `1` · `2` · `3` setup ainda não existe (fase incompatível) · `5` resposta não valida.

### Passo `load_memory`

**`memory-index.sh <setup_root> --verify`** — confere sincronia do índice e **finaliza órfãs
automaticamente**: sessão `in_progress` sem lock vivo vira `abandoned`, `finalized_by:
"auto_orphan_recovery"`, conteúdo intacto. Nunca pergunta — a retomada entra como 1º item da
agenda em `plan_lesson`, razão `orphan_resume`.
Stdout: resumo JSON `{sessions, orphans_closed, quarantined, rebuilt}`.
Exit: `0` · `1` · `2` · `3` · `5` `NNNN.json` que não parseia é isolado em `memory/broken/`, não
gera exit 5 — só entra na contagem de `quarantined`.

**`memory-digest.sh <setup_root> [--topics t1,t2] [--budget-chars N] [--today AAAA-MM-DD]`**
Stdout: **o digest**, JSON de forma fixa (chaves sempre presentes, nunca somem).
Exit: **sempre 0** quando consegue escrever em stdout — inclusive com `memory/` vazia, índice
ausente, bruto corrompido ou orçamento estourado. Só falha (`!= 0`) se não conseguir nem imprimir.
Isso é proposital: falha de memória **nunca** pode impedir uma aula de começar.

### Passo `load_docs` (CONDICIONAL)

**`docs-index.sh <setup_root> [--topics t1,t2] [--budget-bytes N] [--force]`** — primeira
invocação, sempre determinística.
Stdout: JSON `{mode, files, selected_sections, excluded, total_ingestible_bytes}`.
Exit: `0` · `1` · `2` · `3` · `5`. **Nunca 10** nesta forma.

**`docs-index.sh <setup_root> --select [--topics t1,t2]`** — só quando o `docs/` do setup passou do
teto de orçamento e sobrou empate de score entre seções. Emite o pedido `select_sections` (§2.3).
Exit: `0` (nada empatado, resolvido sozinho) · `10` (precisa da sua escolha).

**`docs-index.sh <setup_root> --apply <resposta.json>`** — segunda metade do ciclo REQUEST/APPLY.
Exit: `0` · `5` (`request_id` divergente ou resposta malformada — refaça o `--select`).

### Passo `open_session`

**`session-new.sh <setup_root> [--goal <texto>]`**
Stdout: o `NNNN` alocado (4 dígitos).
Exit: `0` · `1` disco cheio/FS somente-leitura · `2` · `3` · `4` **sessão concorrente** (lock vivo:
mesmo host, pid respondendo) · `5` template de sessão não valida.
Sempre cria `memory/.session.lock` junto — é o script dono do lock.

### Passo `plan_lesson`

**`progress-update.sh <setup_root> --due`**
Stdout: lista de conceitos vencidos para revisão, em JSON.
Exit: `0` · `1` · `2` · `3` · `5`. Nenhum script é obrigatório neste passo — pode não haver nada
vencido, e a agenda vira "o que você quer estudar hoje?".

### Passo `teach`

**`research-new.sh <setup_root> --topic <slug> [--sources <csv>] [--session <NNNN>]`**
Stdout: o caminho relativo do `researchs/NNNN.md` recém-alocado.
Exit: `0` · `1` · `2` · `3` · `4` colisão de `NNNN` (5 tentativas esgotadas).

**`render-plot.py [--spec CAMINHO|-] [--out-dir DIR] [--basename NOME] [--width N] [--height N] [--ascii-width N] [--ascii-height N] [--formats svg,html,txt,md] [--png] [--quiet]`**
**Exceção nomeada** — não usa a tabela 0–5/10, usa a sua própria:
Exit: `0` ok (inclusive quando o PNG falha — isso vira `warning`, não erro) · `1` spec JSON inválida
· `2` dados inválidos (série vazia, não numérica) · `3` falha ao escrever arquivo de saída.
Stdout: JSON `{ok, type, outputs, description_text, ascii_text, warnings, stats}`. **Você não
enxerga o gráfico gerado** — narre só a partir de `description_text`, `stats` e `warnings`, nunca
invente o que não está lá.

**`setup-list.sh --find <termo> --json`** — leitura cruzada com outro setup do aluno.
Stdout: candidatos que casam o termo, com `path` e `setup_id`.
Exit: `0` · `1` · `2` · `3` nada encontrado (não é erro, é resultado vazio) · `4`.

### Passo `challenge`

**`challenge-new.sh <setup_root> --language <l> --slug <sl> --concept <concept_id> [--difficulty 1..5] [--skill-level <n>]`**
Stdout: o caminho relativo de `challenges/<NNNN>-<slug>/`.
Exit: `0` · `1` · `2` · `3` · `4` colisão de `NNNN` · `5` layout de linguagem sem template.

**`challenge-verify.sh <challenge_dir> [--sample-size N] [--n-rep N]`** — roda **antes** de
qualquer coisa chegar ao aluno.
Stdout: resumo JSON `{verdict, mutation_score, killed, survived, rejections}`.
Exit: `0` **mesmo com `verdict: weak` ou `rejected`** — reprovar o desafio não é erro do script, é
o resultado dele · `1` erro de execução real (sandbox não montou, toolchain sumiu) · `2` uso
incorreto · `5` `meta.json` não valida contra o schema · `10` pedido `classify_survivor` (§2.3).
Regra dura: só `verdict: approved` vira `challenge_status: "validated"` — o único que chega ao
aluno.

**`decisions-ask.sh first-challenge --setup <setup_root>`** — decisões da primeira vez que o aluno
enfrenta um desafio (ex.: quer ver o mutation score, quer Docker se disponível).
Mesma forma de stdout/exit de `setup-init` acima, outra fase.

### Passo `close_session`, nesta ordem

**`session-close.sh <setup_root> [--session <NNNN>]`**
Stdout: o `NNNN` fechado.
Exit: `0` · `1` · `2` · `3` · `5` · `10` pedido `fill_session_fields` (§2.3).
**Não tem `--recover`**: recuperar sessão órfã é trabalho exclusivo de `memory-index.sh --verify`,
que já rodou em `load_memory`. `session-close.sh` só fecha a sessão corrente, viva agora.

**`memory-index.sh <setup_root>`** — mesma chamada de `load_memory`, sem `--verify` aqui (a sessão
que acabou de fechar já está com `status` final; isto é o *append* ao índice).

**`progress-update.sh <setup_root> [--event <evento.json>] [--recompute]`**
Stdout: com `--recompute`, o diff do que mudou.
Exit: `5` também quando um `--event` aponta para artefato que não existe (challenge/research
inexistente) — não é só schema malformado.

**`readme-sync.sh <setup_root>`** (sem `--init` — já existe) — regenera as 8 seções entre
marcadores do `README.md` do setup.
Stdout: número de linhas geradas.
Exit: `0` · `1` · `2` · `3`. **Idempotente**: sem sessão nova entre duas chamadas, o arquivo sai
byte a byte igual.

**`memory-compact.sh <setup_root> --if-due`** — só age se ≥15 sessões não consolidadas.
Stdout: resumo JSON `{sessions_compacted, facts_created, facts_superseded, facts_reconfirmed}`.
Exit: `0` (inclusive abaixo do limiar — não faz nada, e é sucesso) · `1` · `2` · `3` · `5` ·
`10` pedido `compact_facts` (§2.3).

---

Nenhum destes 19 chama rede, instala nada, ou decide sozinho algo que devesse vir do aluno — onde
falta julgamento, o único caminho é a §2. Onde faltar toolchain, disco ou permissão, o script
devolve o exit code certo e você fala com o aluno em pt-BR simples — nunca despeje stderr cru.
