# Arquitetura de memória do study-method

> Especificação de implementação da memória persistente da skill. Base factual: `docs/research/02-memoria-llm.md` (do repositório), auditado adversarialmente. O que está aqui é contrato: a onda 3 implementa exatamente isto, sem reinterpretar.
>
> Escopo deste documento: as três camadas de memória, o registro do **como** (memória procedimental), bitemporalidade, compactação e o algoritmo do digest. **Fora de escopo:** as regras de transição de `proficiency_state` e o agendamento de revisão espaçada — isso pertence ao documento de proficiência; aqui esses campos são apenas transportados e persistidos.

---

## 0. Convenções que valem em todo este documento

| Convenção | Regra |
|---|---|
| Raiz da skill | `skills/study-method/` (referida como **SK/**) |
| Setup do aluno | `docs/` do setup, `memory/`, `researchs/`, `challenges/` + `README.md` |
| Desambiguação de `docs/` | **`docs/` do repositório** = documentação do projeto (onde este arquivo vive). **`docs/` do setup** = pasta de material do aluno. Nunca escrever a forma solta. |
| Numeração | 4 dígitos zero-padded: `0001`, `0042`. `session_id` é sempre string, nunca inteiro (perde o zero à esquerda). |
| Idioma | Prosa e campos de texto livre em **pt-BR** com acentuação normal. **Chaves, enums, tags, `skill`, `claim_key` e ids**: ASCII sem acento. |
| Identificador de conceito | **`snake_case` em todo o sistema**, pattern `^[a-z][a-z0-9_]{1,62}$`. Vale para `concept_id`, `skills_observed[].skill`, `topics`, `taxonomy`, `claim_key` e `target_topic`. Não existe mais partição kebab × snake. A normalização é uma função só — `normalize_concept_id()` em `SK/scripts/lib/common.sh` — e nenhum script escreve a sua. Slug de **caminho** (`challenges/0007-derivada-numerica/`, `researchs/0003-cancelamento-catastrofico.md`) não é identificador de conceito e continua como está. |
| Escrita de derivado | Sempre **atômica**: grava em `<arquivo>.tmp.$$` no mesmo diretório e `mv -f` por cima. Vale para `INDEX.json`, `profile.json`, `progress.json`, `docs-index.json` e qualquer outro derivado — não só para o registry. |
| Caminhos em arquivo | Sempre relativos à raiz do setup do aluno. Nunca caminho absoluto: o setup pode ser movido. |

### O nome `status` aparece três vezes — são três coisas diferentes

Isto é a maior fonte de confusão possível neste desenho, então fica explícito:

| Onde | Campo | Valores | Significa |
|---|---|---|---|
| `memory/NNNN.json` e `memory/INDEX.json` | `status` | `in_progress` · `completed` · `abandoned` | ciclo de vida **da sessão** |
| `memory/profile.json` → `semantic_facts[]` e `procedural_facts[]` | `status` | `active` · `superseded` | vigência **de um fato** (enum congelado) |
| `memory/profile.json` → `pending_followups[]` | `state` | `open` · `done` · `dropped` | ciclo de vida **de uma pendência** |

O terceiro chama-se `state`, e não `status`, exatamente para não criar um terceiro significado do mesmo nome. E **não existe** um valor de `status` para "fato envelhecido": isso é `needs_reconfirmation`, um booleano **derivado** em tempo de leitura (§5.3).

---

## 1. O pedido do usuário e a tensão que ele carrega

O pedido literal foi:

> uma pasta `memory/` para salvar as sessões (o que foi feito, o que foi aprendido ou praticado e **como isso aconteceu**); sempre `0001.json`, `0002.json`...; sempre que a skill rodar é um arquivo novo, mas **sempre lemos os arquivos anteriores**.

Os três primeiros requisitos são implementados **ao pé da letra**. O quarto — "sempre lemos os arquivos anteriores" — colide com um resultado bem documentado: modelos degradam de forma não uniforme conforme o input cresce (*Lost in the Middle*, curva em U; *Context Rot* da Chroma, 18 modelos, todos piorando), e **JSON não protege contra isso** — a tarefa de recuperação chave-valor em JSON longo foi justamente um dos experimentos usados para demonstrar o efeito. Ver `docs/research/02-memoria-llm.md` (do repositório), §2.

O dano concreto não é "estourar a janela". É pior: **cabe e falha em silêncio**. Na sessão 60, o fato relevante ("a analogia do zoom foi o que destravou derivadas em agosto") está no arquivo `0042.json`, literalmente no meio do contexto — a zona de pior recuperação. O tutor não lança erro: ele apenas repete uma abordagem que já falhou, e parece ter memória fraca.

### A resolução adotada, e o que ela custa

| O requisito literal | O que este desenho faz | O que se ganha | O que se perde |
|---|---|---|---|
| "sempre lemos os arquivos anteriores" | Lê-se **sempre**: `INDEX.json` (uma linha por sessão — nenhuma sessão fica invisível), `profile.json` (o consolidado de tudo) e um **digest montado por código**. | O tutor sabe que **todas** as sessões existem, o que cada uma foi, e tem rota mecânica para abrir qualquer uma. Nada é ignorado. | Nenhuma sessão é lida **verbatim** por padrão. |
| | Lê-se **seletivamente**: os `memory/NNNN.json` brutos, abertos por tag, data, habilidade ou flag quando o assunto de hoje pede. | Detalhe integral disponível sob demanda, na hora em que é relevante — quando a similaridade semântica entre pergunta e alvo é alta, que é exatamente o regime em que a recuperação funciona bem. | Depende de o tutor **decidir abrir**. Se o `one_line_summary` da sessão 37 tiver perdido uma nuance, e a tag não bater, essa nuance não chega sozinha. |

Isso **satisfaz** o requisito ("o tutor tem acesso a tudo que aconteceu") sem incorrer no dano — mas não é literalmente "carregar 60 arquivos no prompt", e essa diferença é honesta e está registrada como **D-M01** para o usuário confirmar ou vetar. A mitigação do custo é o bloco `full_detail_available` do digest (§6, passo 11): o tutor recebe, em toda sessão, o inventário do que existe e a instrução mecânica de como abrir.

---

## 2. As três camadas

```
memory/                      (do setup do aluno)
├── 0001.json                camada 1 — episódica    (append-only, uma por sessão)
├── 0002.json
├── ...
├── 0042.json
├── INDEX.json               camada 2 — índice       (derivado, reconstruível)
└── profile.json             camada 3 — consolidado  (semântico + procedimental, bitemporal)
```

Nome confirmado da camada 3: **`memory/profile.json`** — singular, na mesma pasta, sem subdiretório. Motivo: o setup do aluno já tem quatro pastas; uma quinta (`memory/consolidated/`) não paga o custo cognitivo para um arquivo só.

### Camada 1 — episódica: `memory/NNNN.json`

Schema: `SK/assets/schemas/session.schema.json`.

| Propriedade | Contrato |
|---|---|
| Quem escreve | A skill, ao longo da sessão: esqueleto na abertura (`status: in_progress`, via `session-new.sh`), **reescrita completa a cada marco** da aula (checkpoint — `docs/01-arquitetura.md` do repositório §3, passo `teach`; é o que dá valor a uma sessão interrompida) e o preenchimento final no fechamento (`status: completed`, via `session-close.sh`). Fora esses caminhos, só a recuperação automática de órfã escreve aqui (§7). |
| Quem lê | O digest lê **no máximo** o que o índice já resume. O tutor abre o arquivo inteiro **sob demanda**. A compactação lê os brutos (e só eles). |
| Mutabilidade | Append-only entre sessões: um `NNNN.json` **nunca** é reescrito depois de finalizado. Correção de conteúdo é feita registrando o fato novo na sessão atual, não editando a antiga. |
| Deleção | Nunca no fluxo normal. Só por purga explícita de privacidade (§9). |
| Obrigatórios | 5 campos: `schema_version`, `session_id`, `date`, `status`, `one_line_summary`. Todo o resto é opcional e tolera `null`. |
| Invariante | `session_id` == nome do arquivo sem extensão. O caminho é **derivado**, nunca armazenado como fonte da verdade. Por isso nenhum arquivo é movido, jamais. |

Por que só 5 obrigatórios: cada campo obrigatório extra é uma chance de a LLM (a) pular, (b) preencher com placeholder plausível ou (c) inferir além do que a sessão sustenta. Um arquivo com 5 campos verdadeiros vale mais que um com 20 campos meio inventados.

Por que `one_line_summary` é obrigatório mesmo na criação: o arquivo precisa ser **válido em todo instante**, inclusive enquanto `in_progress` — um gate que valida `memory/*.json` não pode quebrar porque uma sessão está aberta. Na criação ele recebe um provisório (`"Sessão em andamento: <goal>"` ou `"Sessão iniciada, ainda sem resumo."`) e é **reescrito** no fechamento.

### Camada 2 — índice: `memory/INDEX.json`

Schema: `SK/assets/schemas/index.schema.json`.

| Propriedade | Contrato |
|---|---|
| Natureza | **Derivado**. Todo campo sai mecanicamente do `NNNN.json` correspondente (tabela em §2.1). Nenhum campo exige julgamento de LLM — se exigisse, o schema estaria errado. |
| Reconstruível | Pode ser apagado e regenerado do zero varrendo `memory/[0-9][0-9][0-9][0-9].json` em ordem. É cache, não fonte da verdade. Isso é a defesa contra corrupção. |
| Quem escreve | A skill, no fechamento de cada sessão (append de uma entrada) e a compactação (atualiza `compacted_at` e `digest_eligible`). |
| Quem lê | **Sempre lido por inteiro**, em toda sessão. É o "sempre lemos os arquivos anteriores" na prática: nenhuma sessão fica invisível. |
| Tamanho | ~200-300 bytes por entrada. 200 sessões ≈ 50 KB ≈ 15k tokens — ainda assim é o item que mais cresce, e por isso `digest_eligible` existe: o digest carrega só um recorte do índice, mas o arquivo inteiro continua disponível para filtro mecânico (`jq`, `grep`). |

#### 2.1 Tabela de derivação (índice ← sessão)

| Campo do índice | Regra determinística |
|---|---|
| `session_id` | `session.session_id` |
| `file` | `"memory/" + session_id + ".json"` |
| `date` | `session.date` |
| `status` | `session.status` |
| `topics` | `session.topics` (ausente → `[]`) |
| `skills_touched` | valores distintos de `session.skills_observed[].skill`, ordenados alfabeticamente |
| `one_line_summary` | `session.one_line_summary`, truncado em 160 chars |
| `affect` | `session.affect` |
| `flags` | regras fixas, emitidas nesta ordem: `has_unlock` se algum `how_it_happened[].outcome == "unlocked"`; `has_backfire` se algum `== "backfired"`; `has_open_questions` se `open_questions` não vazio; `has_next_steps` se `next_steps` não vazio; `orphan_recovered` se `finalized_by == "auto_orphan_recovery"` |
| `digest_eligible` | `true` na escrita; a compactação pode virar para `false` |
| `compacted_at` | `null` na escrita; a compactação preenche com a data |

### Camada 3 — consolidado: `memory/profile.json`

Schema: `SK/assets/schemas/profile.schema.json`.

| Propriedade | Contrato |
|---|---|
| Conteúdo | `semantic_facts[]` (o que é verdade sobre o aluno) + `procedural_facts[]` (o que funciona **com este aluno**) + `pending_followups[]` + política (`decay_policy`, `compaction`) + `student` (mínimo). |
| Quem escreve | **Só a compactação** (§4). Nenhuma sessão escreve direto no perfil — isso mantém uma única porta de entrada auditável para a memória de longo prazo. |
| Quem lê | Sempre lido por inteiro pelo digest, que filtra `status == "active"`. |
| Mutabilidade | Um fato **nunca** é sobrescrito. Mudou? O antigo vira `superseded` + `superseded_by`, e nasce um fato novo com o mesmo `claim_key` (§5). |
| Fonte | Cada fato carrega `source_sessions[]` — o perfil inteiro é re-derivável e auditável a partir dos brutos. |

---

## 3. ⭐ Memória procedimental: o "COMO isso aconteceu"

Este é o requisito mais fácil de perder, porque é o único que não tem um lugar óbvio num schema de "resumo de aula". Registrar *o que* foi estudado é trivial e quase inútil sozinho; o que faz um tutor parecer que conhece o aluno é lembrar **por qual caminho ele chegou lá**.

### 3.1 O que conta como "como"

Cinco coisas concretas, e nenhuma delas é "expliquei o assunto":

1. **Qual analogia destravou** — e, mais importante, qual era o **domínio-base** (o que o aluno já domina) e qual **relação** foi mapeada. "É tipo dar zoom" é uma etiqueta; "a curva vira reta quando você aproxima o suficiente, e a derivada é a inclinação dessa reta" é o mapeamento relacional. Sem o mapeamento registrado, a analogia é reintroduzida errada meses depois.
2. **Qual caminho de explicação funcionou** — a sequência de ideias, não o conteúdo delas.
3. **Qual ordem de apresentação falhou** — o dado mais barato e mais desprezado do sistema. Saber que abrir com o formalismo travou o aluno vale mais que saber que ele acertou 4 de 5.
4. **O que ele precisou fazer com as próprias mãos** — construcionismo: qual atividade prática produziu o entendimento, e se ele a fez sozinho ou copiando.
5. **Onde a analogia parou de valer** — o limite conhecido, para marcá-lo *antes* de o aluno esticar demais e absorver uma concepção errada implantada pelo próprio ensino (transferência negativa).

### 3.2 Onde isso vive: nas duas camadas, com papéis distintos

A resposta não é "perfil **ou** sessão" — é **os dois**, e a distinção é o que impede o resumo-do-resumo:

| Camada | Campo | Papel | Granularidade |
|---|---|---|---|
| Sessão (`NNNN.json`) | `how_it_happened[]` | **Registro bruto e datado** de cada movimento pedagógico da sessão, na ordem em que aconteceu, com o efeito observado e a evidência. É o que de fato aconteceu, sem interpretação. | Um item por movimento. Uma sessão típica tem 3 a 8. |
| Perfil (`profile.json`) | `procedural_facts[]` | **Playbook destilado e reutilizável**: o que já foi confirmado que funciona (ou prejudica) com este aluno, em nível de receita executável, com espinha bitemporal. | Um item por `claim_key`, sustentado por 1..N sessões. |

Campos de apoio: `what_worked` / `what_didnt_work` na sessão são a versão de uma frase do array — existem porque alimentam o digest sem obrigar a abrir o `how_it_happened[]` inteiro.

Vocabulários fechados (definidos nos schemas, novos deste documento — não são redefinição de enum congelado):

- `how_it_happened[].move_type`: `analogy` · `worked_example` · `hint_ladder` · `socratic_question` · `hands_on` · `explanation_order` · `visualization` · `reference_lookup` · `spaced_review` · `error_autopsy`
- `outcome` (na sessão e no perfil): `unlocked` · `partial` · `no_effect` · `backfired`
- `procedural_facts[].procedure_kind`: `analogy` · `explanation_path` · `presentation_order` · `hands_on_activity` · `hint_strategy` · `visualization` · `antipattern`

### 3.3 A regra que faz o campo valer alguma coisa

`description` (sessão) e `how` (perfil) precisam ser **reexecutáveis**. O teste é mecânico: *uma sessão futura consegue repetir isso lendo só este campo?*

| Inútil | Útil |
|---|---|
| "usei uma visualização" | "plotei `x**3` e dei zoom sucessivo (janela 2±1, 2±0.1, 2±0.01) até a curva ficar reta na tela, antes de qualquer fórmula" |
| "expliquei limites" | "abri com a definição epsilon-delta antes de qualquer gráfico — ele travou em 6 minutos e parou de perguntar" |
| "ele praticou" | "ele escreveu `derivada_numerica(f, x, h)` do zero, sem eu mostrar código antes" |

E `outcome` sem `evidence` é opinião: a compactação **não pode** promover a `confidence` acima de `low` um procedimento cujo item de origem tem `evidence: null`.

### 3.4 Como é recuperado numa sessão futura

Determinístico, no passo 7 do digest (§6):

1. **Sempre**, independente do assunto de hoje: até 5 `procedural_facts` com `outcome == "backfired"` e `status == "active"` → bloco `procedural_playbook.avoid`. Antipadrões são baratos (poucas linhas) e evitam repetir um dano já conhecido; **nunca são truncados** pelo orçamento.
2. **Por tópico**: `procedural_facts` com `status == "active"`, `retired != true`, `outcome ∈ {unlocked, partial}` e `target_topic` ∈ conjunto de tópicos em foco → bloco `procedural_playbook.do`, até 8, ordenados por `unlocked` antes de `partial` e depois por `last_observed_at` decrescente.
3. **Conjunto de tópicos em foco**: o argumento `--topics` quando a skill já sabe o assunto de hoje; senão, a união dos `topics` das 3 últimas sessões do índice com os tópicos citados em `pending_followups`.
4. Cada item carrega `read_as: "current" | "hypothesis"` (§5.3). Um procedimento com `needs_reconfirmation` entra como sugestão a testar, não como receita garantida.
5. Fora do digest: qualquer `how_it_happened[]` bruto é acessível filtrando `memory/INDEX.json` por `flags: has_unlock` / `has_backfire` ou por `topics`, e abrindo o `memory/NNNN.json` correspondente.

---

## 4. Política de escalonamento (compactação)

### 4.1 Gatilho

`count(entradas do índice com compacted_at == null e status != "in_progress") >= profile.compaction.trigger_uncompacted_sessions`, **default 15**.

A pesquisa aponta a faixa 15-20 sessões (ou ~8-10 mil tokens somados) como o ponto em que ler tudo direto deixa de ser seguro. Adota-se o **piso** da faixa por segurança, e o valor fica no `profile.json` para o usuário ajustar sem tocar em código. A 2-4 sessões por semana, isso é uma compactação a cada ~4 a 10 semanas.

A verificação roda no fechamento da sessão, nunca na abertura: compactar é uma operação de LLM que leva tempo, e o aluno não deve esperar por ela para começar a aula.

### 4.2 O algoritmo

**Quem faz o quê**: `memory-compact.sh` é determinístico até o ponto em que a consolidação vira
julgamento; ali ele usa **REQUEST/APPLY** (`docs/01-arquitetura.md` do repositório §3.1). O pedido
chama-se **`compact_facts`** (a grafia `profile_compaction` está **revogada** — `docs/01` §3.1, `docs/00` §6.5): o script emite em stdout os candidatos já agrupados e sai com
**exit 10**, sem escrever nada; o modelo devolve a resposta (a `claim`/`how` consolidada, e o
**apelido** de cada `claim_key` procedimental — o único campo que exige nomear algo); o script
re-roda com `--apply <resposta.json>`, valida contra
`SK/assets/schemas/requests/profile-compaction.response.schema.json` e só então escreve
`profile.json`, atomicamente. Resposta inválida → exit 5, `profile.json` intocado.

1. Selecionar `S` = sessões com `compacted_at == null` e `status ∈ {completed, abandoned}`, em ordem crescente de `session_id`. **Determinístico.**
2. Ler **os arquivos brutos** dessas sessões. **Regra dura: a compactação nunca lê uma consolidação anterior** — nem o `profile.json`, exceto para conhecer os `claim_key` já existentes e o `next_fact_seq`. Isso elimina a degradação por resumo-de-resumo-de-resumo, que é cumulativa e silenciosa. **Determinístico.**
3. **Semântico**: cada `skills_observed[]` vira candidato a fato com `claim_key = "skill_<skill>_level"`; observações repetidas de dificuldade viram `difficulty_<topic>`; pontos fortes, `strength_<skill>`. A chave é montada por junção com `_` — **determinístico**.
4. **Procedimental**: cada `how_it_happened[]` vira candidato com `claim_key = "<procedure_kind>_<target_topic>_<apelido>"`. Os dois primeiros segmentos são copiados do item; o `<apelido>` é a única parte que precisa de julgamento e vem da **resposta** do pedido `compact_facts`, normalizada por `normalize_concept_id()` (`^[a-z][a-z0-9_]{1,62}$`). Itens com `outcome == "backfired"` viram `procedure_kind: antipattern` além do tipo original. **Nenhum script inventa apelido sozinho.**
5. Para cada candidato, comparar com o fato **`active` de mesmo `claim_key`**:
   - **Não existe** → criar fato novo, `status: active`, `supersedes: null`, `confidence` pela regra do passo 6.
   - **Existe e a afirmação é a mesma** → **reconfirmação, não mudança**: atualizar `last_observed_at`, acrescentar o `session_id` a `source_sessions[]`, recalcular `confidence`. **Não** cria fato novo e **não** supersede. (Distinguir os dois casos é o que impede o `profile.json` de inchar com dezenas de cópias do mesmo fato.)
   - **Existe e a afirmação mudou** → o antigo recebe `status: superseded` + `superseded_by`; nasce um fato novo `active` com `supersedes` apontando para o antigo. O antigo **permanece no arquivo**.
6. `confidence` = `low` (1 sessão distinta) · `medium` (2) · `high` (3+). Tetos duros: um fato com `observation_type: "inferred"` **não pode** nascer `high`; um fato cujas `source_sessions` são **apenas** sessões `abandoned` fica em `low` (§7).
7. Marcar no índice, para cada sessão de `S`: `compacted_at = <hoje>` e `digest_eligible = false` — **exceto** as 5 sessões de maior `session_id`, que permanecem `digest_eligible: true` sempre, para o bloco `recent_sessions` nunca esvaziar logo após uma compactação.
8. Atualizar `compaction.last_compacted_at`, `last_compacted_session_id`, `compaction_count`, `next_fact_seq` e `updated_at`. Escrever `profile.json` e `INDEX.json` por `tmp` + `mv`; se a escrita do perfil falhar, o índice **não** é marcado como compactado — os dois passos são um só, ou nenhum.

### 4.3 O que é fundido, preservado, arquivado — e o que se perde

| | O que acontece |
|---|---|
| **Fundido** | Observações repetidas da mesma habilidade e do mesmo procedimento colapsam em **um** fato com `source_sessions[]` acumulado e `confidence` recalculada. |
| **Preservado para sempre** | (a) todo `memory/NNNN.json`, byte por byte — nenhum arquivo é editado, movido ou apagado; (b) toda entrada do `INDEX.json`; (c) todo fato `superseded`, com a cadeia `supersedes`/`superseded_by` intacta. |
| **"Arquivado"** | Nada muda de lugar. "Arquivar" aqui significa **exclusivamente** virar `digest_eligible: false`: a sessão deixa de ser carregada **por padrão** no digest, e continua acessível por tag, habilidade, data ou flag no índice. É uma mudança de política de leitura, não de armazenamento. |
| **Garantia de não-perda silenciosa** | Toda entrada do índice continua listada; o digest reporta `full_detail_available.sessions_not_in_recent` (quantas existem além das que ele mostrou) e `top_tags` (por onde procurá-las). O tutor sempre sabe que há mais, e por qual chave chegar lá. |

**O custo real, sem maquiagem:** o que se perde é a presença **automática** da nuance do episódio no contexto. Depois de compactada, a sessão 0042 só chega ao tutor por três rotas: o `one_line_summary` no índice, os fatos que ela sustenta no perfil, ou uma abertura deliberada do arquivo. Se a consolidação destilou mal — perdeu o detalhe de que a analogia do zoom **só** funcionou depois do gráfico, e não isolada —, o erro passa a ser o que o tutor acredita, e a correção depende de alguém reabrir o bruto. Três defesas parciais, nenhuma perfeita: `source_sessions[]` em todo fato (auditável e re-derivável), a proibição de resumir resumos (passo 2) e o `evidence` copiado do episódio de origem.

---

## 5. Bitemporalidade e decaimento

### 5.1 As duas linhas de tempo

| Campo | Linha do tempo | Significa |
|---|---|---|
| `observed_at` | **valid time** | a data da sessão em que o fato foi observado pela primeira vez no mundo real |
| `last_observed_at` | **valid time** | a data da reobservação mais recente |
| `recorded_at` | **transaction time** | quando o sistema gravou o fato (a compactação) — pode ser semanas depois |

Elas divergem de verdade neste desenho: a sessão 0042 é de 20/08 e o fato só é escrito na compactação de 12/09. Sem separar as duas, é impossível responder "o que o tutor sabia sobre o aluno no dia 25/08?" — e essa pergunta importa quando se investiga por que o tutor tomou uma decisão ruim.

### 5.2 Nunca sobrescrever

Um fato **nunca** muda de conteúdo. Mudou o mundo? Novo registro, com o mesmo `claim_key`, superseding o anterior:

```
f-0031  claim_key: skill_derivadas_conceito_level   status: superseded   superseded_by: f-0034
f-0034  claim_key: skill_derivadas_conceito_level   status: active       supersedes: f-0031
```

**Por quê**, em uma frase: para não ancorar o tutor num perfil velho do aluno sem apagar o histórico de como ele chegou até aqui. Sobrescrever perderia a trajetória (que é informação pedagógica de primeira ordem: *quando* e *depois de quê* ele superou aquilo). Deletar perderia a auditoria. Supersede preserva os dois e ainda mantém o digest limpo, porque o digest só olha `status == "active"`.

`claim_key` é o que torna isso implementável por código: **só supersede quem tem `claim_key` idêntico**. Dois fatos sobre o mesmo tópico com `claim_key` diferente coexistem sem conflito — "tem dificuldade com o caso base da recursão" e "escreve funções Python sem ajuda de sintaxe" são ambos verdadeiros ao mesmo tempo, e um sistema que os tratasse como contraditórios estaria errado.

### 5.3 `needs_reconfirmation` é derivado, não armazenado

```
bucket(fato) =
    decay_policy.skill_fact_days        se fato ∈ semantic_facts e kind ∈ {skill_level, difficulty, strength}   (default 60)
    decay_policy.preference_fact_days   se fato ∈ semantic_facts e kind ∈ {preference, context}                 (default 180)
    decay_policy.procedural_fact_days   se fato ∈ procedural_facts                                              (default 180)

needs_reconfirmation = (hoje − last_observed_at) em dias > bucket(fato)
read_as = "hypothesis" se needs_reconfirmation senão "current"
```

Calculado a cada digest, nunca persistido — persistir significaria que ele fica errado sozinho com a passagem do tempo. Não é um terceiro valor de `status`: um fato pode ser `active` e `needs_reconfirmation: true` ao mesmo tempo, e é exatamente esse o caso interessante.

Por que 60 dias para habilidade e 180 para procedimento: um nível de habilidade envelhece rápido (é justamente o que o estudo muda); uma analogia que pegou com aquela pessoa envelhece devagar, porque depende do repertório dela, que é estável. Ambos são configuráveis no `profile.json`.

**O consumidor do digest tem uma obrigação**, e ela precisa estar escrita no `SKILL.md`: item com `read_as: "hypothesis"` é tratado como **pergunta**, não como afirmação — "você ainda trava no caso base da recursão?" — nunca como "sei que você tem dificuldade com recursão". Essa é a diferença entre um tutor que acompanha e um que rotula.

---

## 6. ⭐ O digest: algoritmo determinístico

Implementado em `SK/scripts/memory-digest.sh` (onda 3). **Montado por código, nunca por "a LLM decide o que copiar"** — se a própria compactação do contexto exigisse ler 60 arquivos, ela sofreria do mesmo problema que existe para resolver.

### 6.1 Contrato de interface

| | |
|---|---|
| Invocação | `memory-digest.sh <setup_root> [--topics t1,t2] [--budget-chars N] [--today AAAA-MM-DD] [--now <ISO 8601>]` — a raiz do setup é **posicional**, como em todo script de `SK/scripts/`; a memória é sempre `<setup_root>/memory`. |
| `--now` | Carimbo usado em `generated_at`. Sem ele o script usa o relógio, e aí **o mesmo estado em disco produz bytes diferentes** — o que contradiz o determinismo que este documento promete. Toda comparação byte a byte (teste, gate, diff entre execuções) passa `--now`. |
| Momento | No passo `load_memory`, **depois** de `memory-index.sh <setup_root> --verify` (que é quem recupera órfãs) e **antes** de criar o `NNNN.json` da sessão de hoje. |
| Saída | **JSON em stdout**, uma linha por chave (pretty-print determinístico). Não persiste nada — um digest gravado em disco vira um digest velho lido como verdade. |
| Código de saída | `0` sempre que produzir um digest, inclusive com `memory/` vazia, índice ausente, arquivo corrompido ou orçamento estourado. Só retorna `!= 0` se não conseguir escrever em stdout. **Falha de memória nunca impede uma aula de começar.** |
| Forma da saída | **Fixa**. Nenhuma chave desaparece em nenhum cenário; ausência é `[]`, `{}` ou `null`. O consumidor nunca ramifica por formato — só por `memory_state`, que é enumerado logo abaixo. |
| Defaults | `BUDGET_CHARS=6000` · `RECENT_SESSIONS_K=5` · `AFFECT_WINDOW=3` · `TOPIC_WINDOW=3` · `SEMANTIC_FACTS_CAP=12` · `PROC_AVOID_CAP=5` · `PROC_DO_CAP=8` · `FOLLOWUP_CAP=6` · `TOP_TAGS=15` · `SUMMARY_TRUNC=160` |
| Posicionamento | O bloco vai no **fim** do contexto de abertura, colado ao primeiro turno — o começo e o fim são as posições de melhor recuperação; o meio, a pior. |

#### `memory_state` — vocabulário fechado

O consumidor **ramifica por este campo**, então ele precisa estar enumerado, e o cálculo é
mecânico. Avaliado nesta ordem, o primeiro que casar vence:

| Valor | Condição | O que o `SKILL.md` faz |
|---|---|---|
| `first_session` | nenhum `NNNN.json` e nenhum `INDEX.json` em `memory/` | Sessão de calibração: perguntar o que o aluno quer, o que já sabe, quais domínios servem de base de analogia. **Nunca** fingir que conhece alguém. |
| `degraded` | `errors[]` contém `index_missing`, `index_unparseable`, `index_stale`, `profile_unparseable` ou `session_unparseable`. **`profile_missing` não conta**: perfil ausente é o estado normal antes da 1ª compactação (§6.3), não avaria | Ensinar normalmente, mas **não afirmar** nada sobre histórico sem antes abrir o bruto. Dizer uma vez, em uma linha, o que ficou ilegível — nunca um relatório. |
| `warm` | ≥ 5 sessões finalizadas **ou** `profile.json` com ≥ 1 fato `active` | Caminho normal: usar `student_profile`, `procedural_playbook` e `recent_sessions`; `read_as: "hypothesis"` vira pergunta. |
| `warming_up` | 1 a 4 sessões finalizadas e sem perfil consolidado | Há histórico, mas nenhum fato consolidado ainda. Apoiar-se em `recent_sessions` e `pending_followups`; **não** generalizar o aluno a partir de duas aulas. |

`degraded` vem antes de `warm` de propósito: saber que a base está incompleta muda o que se pode
afirmar, e é mais importante do que saber que ela é grande.

### 6.2 Pseudocódigo

```
 1. MEM = <setup_root>/memory; TODAY = --today ou data local de hoje;
    NOW = --now ou o relógio (NOW só alimenta generated_at)
    se MEM não existe ou não contém nenhum NNNN.json nem INDEX.json:
        emitir digest com memory_state="first_session", todos os blocos vazios,
        for_session_id="0001"; ir para o passo 13.

 2. ler INDEX.json.
    se ausente ou não parseável:
        reconstruir o índice em memória varrendo MEM/[0-9][0-9][0-9][0-9].json em ordem
        de nome, aplicando a tabela de derivação de §2.1;
        registrar em errors[]: {"kind":"index_missing"|"index_unparseable"}.
    se updated_at do índice < mtime de algum NNNN.json:
        registrar errors[] {"kind":"index_stale"} e reconstruir em memória do mesmo jeito.
    ENTRADAS = entradas ordenadas por session_id crescente.

 3. ORPHANS = [e ∈ ENTRADAS onde e.status == "abandoned"
                e e.finalized_by == "auto_orphan_recovery"],
    ordenadas por session_id desc, cortadas nas 3 mais recentes.
    para cada uma: emitir em orphan_sessions[] {session_id, date, one_line_summary,
    topics, days_ago}.
    entradas ainda com status == "in_progress" NÃO entram aqui: ou memory-index.sh --verify
    (que roda antes, no mesmo passo load_memory) já as converteu em "abandoned", ou existe
    um lock vivo e a sessão está aberta em outro terminal — caso de open_session (exit 4),
    não do digest. O digest é somente-leitura: não fecha, não altera, não remove nada.

 4. for_session_id = zero-pad(4, max(session_id de ENTRADAS) + 1)

 5. ler profile.json. se ausente ou não parseável:
        PROFILE = {student:null, semantic_facts:[], procedural_facts:[],
                   pending_followups:[], decay_policy: defaults}
        registrar errors[] {"kind":"profile_missing"|"profile_unparseable"}.
    para cada fato com status=="active": calcular needs_reconfirmation e read_as (§5.3).

 6. TOPICS_IN_FOCUS, topics_source:
    se --topics veio:              lista do argumento          , source="argument"
    senão:                          união dos topics das últimas TOPIC_WINDOW entradas
                                    finalizadas (campo topics do índice, mecânico)
                                                               , source="inferred_from_recent"
    (normalizar com normalize_concept_id, ordenar alfabeticamente e deduplicar — a saída
     precisa ser reproduzível)
    NÃO se extrai tópico de pending_followups: aquele texto é prosa livre em pt-BR, e tirar
    tópico de prosa é julgamento, não fórmula. Quando a skill já sabe o assunto de hoje, ela
    passa --topics — esse é o canal por onde o julgamento do modelo entra neste script.

 7. procedural_playbook:
    .avoid = procedural_facts com status=="active" e outcome=="backfired",
             ordenados por last_observed_at desc, empate por fact_id asc,
             cortados em PROC_AVOID_CAP.
    .do    = procedural_facts com status=="active", retired != true,
             outcome ∈ {unlocked, partial} e target_topic ∈ TOPICS_IN_FOCUS,
             ordenados por (unlocked antes de partial), depois last_observed_at desc,
             empate por fact_id asc, cortados em PROC_DO_CAP.
    campos emitidos por item: fact_id, procedure_kind, target_topic, how, base_domain,
             mapping, known_limit, outcome, confidence, last_observed_at, read_as,
             source_sessions.

 8. student_profile.facts = semantic_facts com status=="active",
    ordenados por: (topic ∈ TOPICS_IN_FOCUS primeiro), depois last_observed_at desc,
    empate por fact_id asc; cortados em SEMANTIC_FACTS_CAP.
    campos emitidos: fact_id, kind, topic, claim, skill_level, proficiency_state,
    confidence, observation_type, last_observed_at, needs_reconfirmation, read_as,
    source_sessions.

 9. recent_sessions = últimas RECENT_SESSIONS_K entradas com digest_eligible != false,
    status != "in_progress" e que NÃO estejam em orphan_sessions[] (uma órfã recuperada já
    é reportada lá, com conteúdo parcial; entrar nos dois lugares é ruído duplicado),
    emitidas em ordem CRESCENTE (a mais recente por último, colada ao turno atual).
    por item: {session_id, date, topics, one_line_summary (truncado em SUMMARY_TRUNC),
    flags}.

10. recent_affect = affect das últimas AFFECT_WINDOW entradas finalizadas,
    em ordem crescente, ignorando null. Afeto é volátil: nada mais antigo entra,
    e afeto nunca vira fato do perfil.

11. pending_followups = pending_followups do perfil com state=="open"
    ∪ open_questions e next_steps das últimas TOPIC_WINDOW sessões finalizadas
      (lidos dos arquivos brutos dessas sessões — são no máximo 3 arquivos).
    deduplicar por texto exato; ordenar por session_id de origem crescente;
    cortar em FOLLOWUP_CAP.

12. full_detail_available = {
        session_count, date_range: [primeira, última],
        index_file: "memory/INDEX.json", raw_file_pattern: "memory/NNNN.json",
        sessions_not_in_recent: session_count − |recent_sessions|,
        top_tags: TOP_TAGS tags mais frequentes do índice, com contagem,
                  ordenadas por contagem desc e nome asc,
        how_to_open: "Filtre memory/INDEX.json por topics, skills_touched, flags ou
                      date e abra apenas os memory/NNNN.json correspondentes."
    }

13. calcular memory_state pela tabela de §6.1 e serializar na ORDEM FIXA de chaves
    (generated_at = NOW):
    schema_version, generated_at, for_session_id, memory_state, topics_in_focus,
    topics_source, full_detail_available, student, recent_sessions, recent_affect,
    student_profile, procedural_playbook.do, procedural_playbook.avoid,
    orphan_sessions, pending_followups, truncated, truncated_fields,
    budget_exceeded, errors.
    (o que o tutor não pode perder — antipadrões, órfãs e pendências — fica no fim,
     que é a segunda melhor posição de recuperação)

14. enquanto len(serializado) > BUDGET_CHARS, aplicar NESTA ordem, um passo por vez,
    reserializando a cada passo, e registrando o nome do bloco em truncated_fields[]:
      T1. remover recent_sessions da mais antiga, até restarem 2
      T2. remover de procedural_playbook.do os itens outcome=="partial",
          do last_observed_at mais antigo para o mais novo
      T3. remover de student_profile.facts os itens read_as=="hypothesis",
          do last_observed_at mais antigo para o mais novo
      T4. remover de student_profile.facts os itens confidence=="low",
          do mais antigo para o mais novo
      T5. truncar em 120 chars, com reticências, todo campo de texto livre
          (claim, how, mapping, known_limit, one_line_summary)
    NUNCA truncar: pending_followups, procedural_playbook.avoid, orphan_sessions,
    full_detail_available, cabeçalho.
    se ainda estourar após T5: emitir assim mesmo com budget_exceeded=true.

15. imprimir em stdout; sair 0.
```

### 6.3 Casos de borda, todos com comportamento definido

| Situação | Comportamento |
|---|---|
| `memory/` inexistente ou vazia (primeira sessão) | Passo 1: `memory_state: "first_session"`, `for_session_id: "0001"`, todos os blocos vazios, **mesma forma de saída**. O `SKILL.md` usa esse sinal para abrir uma sessão de calibração (o que o aluno quer, o que já sabe, quais domínios servem de base de analogia) em vez de fingir que conhece alguém. |
| `INDEX.json` ausente, corrompido ou defasado | Reconstruído em memória a partir dos brutos; `errors[]` registra; o digest sai normalmente. Índice é cache, não fonte da verdade. |
| Um `NNNN.json` não parseável | Pula o arquivo, registra `errors[] {"kind":"session_unparseable","session_id":"NNNN"}` e segue. **Nunca aborta.** |
| `profile.json` ausente (antes da 1ª compactação) | Blocos de perfil vazios; o digest vive de índice + últimas sessões. É o estado normal das primeiras ~15 sessões. |
| Sessão órfã | Já recuperada por `memory-index.sh --verify` antes do digest rodar (§7). Chega aqui como `status: "abandoned"` + `finalized_by: "auto_orphan_recovery"`, é reportada em `orphan_sessions[]` e **não** entra em `recent_sessions`. O digest não altera arquivo nenhum. |
| Entrada `in_progress` no índice na hora do digest | Sessão **viva** em outro terminal (lock vivo) — o `--verify` não a tocou de propósito. Fica fora de `recent_sessions` e fora de `orphan_sessions[]`. Quem reage é `open_session`, com exit 4. |
| `errors[]` não vazio | `memory_state: "degraded"` (§6.1). O digest sai completo; o consumidor é que muda de postura. |
| Orçamento estourado | Trunca pela ordem T1..T5, informa `truncated_fields[]`; em último caso emite com `budget_exceeded: true`. Nunca falha. |

---

## 7. Sessão órfã

Cenário real, não hipótese: o aluno fecha o terminal no meio da aula. `memory/0043.json` fica com
`status: in_progress` e conteúdo parcial. É o modo de falha **mais comum** do sistema em uso real.

### 7.1 Órfã é condição derivada, não valor de `status`

Não existe `status: "orphaned"`. O vocabulário é `in_progress | completed | abandoned` e nada mais.
Órfã é o resultado de uma conta feita em tempo de leitura:

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

O `.session.lock` é JSON com `{pid, hostname, session_id, started_at}` e **permanece** no desenho:
é ele que distingue "o terminal morreu" de "tem outra sessão aberta agora". Tratar toda sessão
`in_progress` como órfã por definição apagaria a detecção de concorrência, que é a razão de o lock
existir.

### 7.2 Decisão

| Pergunta | Decisão | Justificativa |
|---|---|---|
| Conta no índice? | **Sim.** A entrada existe, com `status: "abandoned"` após a recuperação. | A sessão aconteceu. Descartá-la apaga a informação de que houve uma tentativa — e "começou e parou no meio" é sinal pedagógico legítimo (frustração, cansaço, assunto pesado demais). |
| É fechada retroativamente? | **Sim**, automaticamente, na abertura da próxima sessão. | Deixar `in_progress` acumulando faz cada digest reportar as mesmas órfãs para sempre. |
| Pergunta-se ao aluno o que fazer? | **Não.** Zero perguntas. | É o caso de falha mais comum; um menu de três opções a cada retomada é atrito diário para uma pergunta cuja resposta certa é sempre a mesma. |
| É descartada? | **Não.** Nunca. | Regra geral do sistema: nada é apagado fora de purga explícita de privacidade. |

### 7.3 Procedimento de recuperação — dono único

`memory-index.sh <setup_root> --verify`, no passo `load_memory`, é o **único** componente que
finaliza uma órfã. `session-close.sh` **não tem** `--recover`; `memory-digest.sh` é somente-leitura.

1. Para cada `memory/NNNN.json` com `status: "in_progress"`, avaliar `lock_vivo` (§7.1).
   Lock vivo → **não toque**: é sessão concorrente, e quem reage é `open_session` (exit 4).
2. Sem lock vivo: `status = "abandoned"`; `finalized_at = mtime do arquivo`;
   `finalized_by = "auto_orphan_recovery"`.
3. **Nada de conteúdo é inventado.** Os campos preenchidos ficam como estão; os vazios ficam vazios.
   Se `one_line_summary` ainda for o provisório, é substituído pelo texto fixo
   `"Sessão interrompida sem fechamento (recuperada automaticamente)."`.
4. Escrever/atualizar a entrada no índice com `flags` incluindo `orphan_recovered`. `NNNN.json` e
   `INDEX.json` são reescritos por `tmp` + `mv`.
5. Remover o `.session.lock` morto correspondente.
6. O digest da sessão atual reporta a órfã em `orphan_sessions[]` com `days_ago` — bloco que nunca é
   truncado pelo orçamento. O `SKILL.md` instrui o tutor a **abrir com isso** quando `days_ago <= 7`:
   "a gente parou no meio de X da última vez — quer retomar dali?". Isso converte um acidente de UX
   em continuidade pedagógica, sem gastar uma pergunta de configuração.
7. Na compactação, sessões `abandoned` **entram** normalmente (nada se perde) e contam para o limiar
   (§4.1), mas qualquer fato cujas `source_sessions` sejam **exclusivamente** sessões `abandoned`
   fica travado em `confidence: "low"` — observação de sessão interrompida é observação incompleta.
   Esta é a única versão da regra; `docs/01-arquitetura.md` do repositório §4.2 diz o mesmo.

Alternativas descartadas e por quê: *deixar `in_progress` para sempre* (o digest vira um mural de
órfãs); *apagar o arquivo* (viola "nada é apagado" e destrói sinal); *perguntar ao aluno a cada
retomada* (atrito diário no caso mais frequente); *pedir para a LLM reconstruir o que teria
acontecido* (é fabricação de memória — exatamente a falha da §8.1). Registrado como **D-M06**.

## 8. Falhas conhecidas da pesquisa, e a defesa concreta deste desenho

### 8.1 Memória que polui (fato errado persistido)

O risco aqui não é adversário externo — é **autopoluição**: o tutor infere além do que a sessão sustenta ("ele odeia matemática") e grava; na sessão seguinte isso é lido como verdade estabelecida e passa a guiar decisões. Erros em memória evolutiva são cumulativos, não isolados como em RAG estático.

**Defesas:**
- `observation_type: observed | inferred` em `how_it_happened[]`, `skills_observed[]` e em todo fato do perfil — o observado e o inferido nunca se misturam no mesmo campo.
- Um fato `inferred` **não pode nascer `confidence: "high"`** (§4.2, passo 6). Só sobe com reobservação em outra sessão.
- `evidence` obrigatório na prática: sem ele, `confidence` fica travada em `low`, e no digest um fato `low` é o primeiro a ser cortado pelo orçamento (T4).
- `source_sessions[]` em todo fato: qualquer afirmação do perfil é rastreável até o episódio bruto que a originou. Poluição vira auditável em vez de invisível.
- A compactação lê **só os brutos** (§4.2, passo 2): um erro de destilação não se realimenta na destilação seguinte.
- O que **não** persistir também é defesa: afeto nunca vira fato de perfil (só as 3 últimas sessões, direto do índice), e nada de contexto pessoal, familiar ou de saúde entra (§9).

### 8.2 Contradição entre sessões

Duas falhas simétricas documentadas: o sistema **recusa substituir** um fato desatualizado, ou **recusa aceitar coexistência** de fatos que só parecem contraditórios.

**Defesas:**
- `claim_key` resolve as duas de uma vez, por código: mesma chave → o novo supersede o antigo (nunca "os dois valem"); chave diferente → coexistem sem que ninguém precise julgar se são contraditórios.
- O digest emite **apenas** `status == "active"`: a contradição histórica existe no arquivo, é auditável, e **não entra no contexto** como duas afirmações concorrentes que o modelo teria de arbitrar.
- Reconfirmação e mudança são operações distintas (§4.2, passo 5): mesma afirmação atualiza `last_observed_at`; afirmação diferente supersede. Confundir as duas é o que produz um perfil cheio de duplicatas ou um perfil que nunca muda.

### 8.3 Ancoragem excessiva no perfil antigo

Um rótulo de janeiro nunca reavaliado vira profecia autorrealizável: o tutor trata o aluno em julho como o aluno de janeiro.

**Defesas:**
- `needs_reconfirmation` derivado (§5.3) + `read_as: "hypothesis"` no digest, com obrigação explícita no `SKILL.md` de formular como pergunta.
- Teto de `SEMANTIC_FACTS_CAP=12` fatos no digest, priorizando os tópicos de hoje e os mais recentes: o perfil nunca ocupa o contexto inteiro, por maior que fique.
- `recent_affect` limitado a 3 sessões e afeto proibido de virar fato de perfil — "aluno ansioso" é o rótulo mais grudento e menos verificável de todos.
- `retired: true` em `procedural_facts`: um andaime que o aluno já não precisa sai do digest. Repetir a analogia depois que ela virou desnecessária é ruído, e no nível avançado atrapalha.
- Supersede preserva a **trajetória**, então o tutor pode dizer "em janeiro você travava no caso base e em março parou de travar" — o oposto de ancorar.

---

## 9. Privacidade e minimização

- **Não persistir**: identificadores além de um `display_name` opcional; contexto familiar, de saúde ou emocional trazido incidentalmente e não necessário para adaptar o ensino; citações literais de terceiros nomeados; metadado técnico sem função pedagógica (geolocalização, identificadores de dispositivo).
- **Teste por campo**: "isso torna a próxima aula melhor?" Se não, não entra. `affect_note` passa quando ancorado em comportamento observável ("parou de perguntar depois do formalismo"); não passa quando vira relato de vida.
- **Supersede ≠ apagamento.** Supersede é o ciclo de vida normal de um fato. Um pedido real de apagamento é uma operação **distinta, explícita e auditável**: remove fisicamente o `memory/NNNN.json`, as entradas do índice, os fatos e suas cadeias `superseded_by`, e grava um log da purga (o quê, quando, a pedido de quem) **sem reter o conteúdo apagado**. Como o índice é reconstruível e nenhum caminho é armazenado como fonte da verdade, a purga é implementável sem quebrar invariante nenhuma — exceto a contiguidade da numeração, que **não** é invariante deste desenho (`session_id` é monotônico, não contíguo; nunca reaproveitar um número purgado).
- **Versionar `memory/` no git**: default recomendado é **não** (`.gitignore`), tratando a pasta como dado de runtime. Git preserva o histórico mesmo depois de "corrigir" um dado sensível. Decisão do usuário — **D-M03**.

---

## 10. Exemplos reais e completos

Uma aula de derivadas em Python, de verdade — não um esqueleto com `"..."`. O teste do schema é este: **uma LLM consegue preencher isto ao fim de uma aula, sem inventar?**

### 10.1 `memory/0042.json` — sessão finalizada

```json
{
  "schema_version": "1.0",
  "session_id": "0042",
  "date": "2026-08-20",
  "started_at": "2026-08-20T19:12:00-03:00",
  "finalized_at": "2026-08-20T20:31:00-03:00",
  "finalized_by": "student",
  "status": "completed",
  "topics": ["derivadas", "limites", "python", "erro_numerico"],
  "goal": "Entender o que a derivada mede e calcular uma derivada numérica em Python.",
  "what_was_done": "Implementamos derivada_numerica(f, x, h) com diferença progressiva e depois central; varremos h de 1e-1 a 1e-16 sobre f(x)=x**3 em x=2 e plotamos o erro absoluto contra o valor analítico 12.",
  "what_was_learned": [
    "Derivada em um ponto é a inclinação da reta que a curva vira quando se dá zoom suficiente naquele ponto.",
    "Diferença central erra menos que a progressiva para o mesmo h.",
    "h muito pequeno piora o resultado: subtrair dois floats quase iguais destrói dígitos significativos."
  ],
  "how_it_happened": [
    {
      "move_type": "explanation_order",
      "description": "Abri pela definição formal de limite (epsilon-delta) antes de qualquer gráfico ou código.",
      "target_topic": "limites",
      "outcome": "backfired",
      "evidence": "Depois de ~6 minutos ele disse 'entendi as letras mas não entendi o que isso quer dizer' e parou de fazer perguntas.",
      "observation_type": "observed"
    },
    {
      "move_type": "visualization",
      "description": "Troquei a ordem: plotei x**3 e dei zoom sucessivo (janela 2±1, depois 2±0.1, depois 2±0.01) até a curva ficar visualmente reta na tela.",
      "target_topic": "derivadas",
      "outcome": "unlocked",
      "evidence": "Ele antecipou sozinho, antes de eu falar: 'então se eu der zoom infinito vira uma reta, e a derivada é a inclinação dessa reta'.",
      "observation_type": "observed"
    },
    {
      "move_type": "analogy",
      "description": "Velocímetro do carro como taxa instantânea: velocidade média é distância/tempo do trecho; o velocímetro é o que sobra quando o trecho encolhe até quase zero.",
      "target_topic": "derivadas",
      "outcome": "partial",
      "evidence": "Aceitou a ideia mas não a usou espontaneamente depois; ao explicar de volta, ele recorreu ao zoom, não ao velocímetro.",
      "observation_type": "observed"
    },
    {
      "move_type": "hands_on",
      "description": "Ele escreveu derivada_numerica(f, x, h) do zero, sem eu mostrar código antes; só apontei o erro depois que ele rodou.",
      "target_topic": "python",
      "outcome": "unlocked",
      "evidence": "Escreveu a função correta na segunda tentativa (na primeira faltou o return) e rodou sozinho no terminal.",
      "observation_type": "observed"
    },
    {
      "move_type": "hint_ladder",
      "description": "Na diferença central, dei dica de nível 2: apontei que ele estava usando f(x) onde deveria estar f(x-h), sem escrever a fórmula.",
      "target_topic": "derivadas",
      "outcome": "partial",
      "hint_level": 2,
      "evidence": "Corrigiu sozinho em cerca de 2 minutos depois da dica.",
      "observation_type": "observed"
    },
    {
      "move_type": "error_autopsy",
      "description": "Em vez de avisar do cancelamento catastrófico, deixei ele varrer h até 1e-16 e ver o erro voltar a subir; só depois explicamos por quê.",
      "target_topic": "erro_numerico",
      "outcome": "unlocked",
      "evidence": "Ele mesmo apontou a curva em U no gráfico do erro e perguntou 'por que piora se o h é menor?'.",
      "observation_type": "observed"
    }
  ],
  "skills_observed": [
    {
      "skill": "derivadas_conceito",
      "level": "beginner",
      "confidence": "medium",
      "last_observed_at": "2026-08-20",
      "evidence": "Explicou de volta a derivada como inclinação do zoom local, sem material à vista, mas não conectou com a definição de limite.",
      "observation_type": "observed",
      "proficiency_state": "fragile"
    },
    {
      "skill": "python_funcoes",
      "level": "intermediate",
      "confidence": "high",
      "last_observed_at": "2026-08-20",
      "evidence": "Escreveu duas funções do zero e rodou no terminal sem pedir ajuda de sintaxe.",
      "observation_type": "observed",
      "proficiency_state": "mastered"
    },
    {
      "skill": "erro_de_ponto_flutuante",
      "level": "beginner",
      "confidence": "low",
      "last_observed_at": "2026-08-20",
      "evidence": "Percebeu o efeito no gráfico mas não soube nomear a causa antes da explicação.",
      "observation_type": "observed",
      "proficiency_state": "unknown"
    }
  ],
  "affect": "engaged",
  "affect_note": "Ficou quieto e travado nos primeiros ~6 minutos (durante o formalismo); depois do zoom no gráfico voltou a perguntar por conta própria até o fim.",
  "what_worked": "Mostrar o objeto antes da definição: zoom no gráfico primeiro, formalismo depois.",
  "what_didnt_work": "Abrir com epsilon-delta. Ele ficou preso na notação e parou de perguntar.",
  "open_questions": [
    "Por que a diferença central erra menos que a progressiva para o mesmo h?"
  ],
  "next_steps": [
    "Refazer a varredura de h com diferença central e comparar as duas curvas de erro no mesmo gráfico.",
    "Aplicar derivada_numerica em f(x)=sin(x) e conferir contra cos(x)."
  ],
  "artifacts": [
    { "path": "challenges/0007-derivada-numerica/stub.py", "kind": "challenge" },
    { "path": "researchs/0003-cancelamento-catastrofico.md", "kind": "research" }
  ],
  "one_line_summary": "Derivada via zoom no gráfico destravou o conceito; implementou derivada numérica e descobriu sozinho a curva em U do erro.",
  "raw_notes": null
}
```

### 10.2 `memory/0042.json` no instante da criação (`in_progress`)

O mesmo arquivo, válido contra o mesmo schema, no começo da aula — os 5 obrigatórios e nada mais:

```json
{
  "schema_version": "1.0",
  "session_id": "0042",
  "date": "2026-08-20",
  "started_at": "2026-08-20T19:12:00-03:00",
  "status": "in_progress",
  "topics": ["derivadas"],
  "goal": "Entender o que a derivada mede e calcular uma derivada numérica em Python.",
  "one_line_summary": "Sessão em andamento: entender derivada e calcular derivada numérica em Python."
}
```

### 10.3 `memory/INDEX.json` — trecho (entradas 0041 a 0043)

Este é o índice **antes** do `memory-index.sh --verify` da sessão seguinte: a 0043 ainda está
`in_progress`, e a 0041 já foi compactada. Depois do `--verify` (§7.3), a entrada 0043 passa a
`"status": "abandoned"`, ganha `"flags": ["orphan_recovered"]` e o `one_line_summary` fixo de
sessão interrompida — que é como ela aparece no digest do §10.5.

```json
{
  "schema_version": "1.0",
  "updated_at": "2026-08-22T21:04:00-03:00",
  "sessions": [
    {
      "session_id": "0041",
      "file": "memory/0041.json",
      "date": "2026-08-13",
      "status": "completed",
      "topics": ["limites", "python"],
      "skills_touched": ["limites_conceito", "python_funcoes"],
      "one_line_summary": "Primeiro contato com limites; entendeu 'chegar perto' numericamente, travou na notação.",
      "affect": "neutral",
      "flags": ["has_open_questions", "has_next_steps"],
      "digest_eligible": true,
      "compacted_at": "2026-08-21"
    },
    {
      "session_id": "0042",
      "file": "memory/0042.json",
      "date": "2026-08-20",
      "status": "completed",
      "topics": ["derivadas", "limites", "python", "erro_numerico"],
      "skills_touched": ["derivadas_conceito", "erro_de_ponto_flutuante", "python_funcoes"],
      "one_line_summary": "Derivada via zoom no gráfico destravou o conceito; implementou derivada numérica e descobriu sozinho a curva em U do erro.",
      "affect": "engaged",
      "flags": ["has_unlock", "has_backfire", "has_open_questions", "has_next_steps"],
      "digest_eligible": true,
      "compacted_at": null
    },
    {
      "session_id": "0043",
      "file": "memory/0043.json",
      "date": "2026-08-22",
      "status": "in_progress",
      "topics": ["derivadas"],
      "skills_touched": [],
      "one_line_summary": "Sessão em andamento: comparar diferença progressiva e central.",
      "affect": null,
      "flags": [],
      "digest_eligible": true,
      "compacted_at": null
    }
  ]
}
```

### 10.4 `memory/profile.json` — com um par superseded/active real

```json
{
  "schema_version": "1.0",
  "updated_at": "2026-08-21T22:15:00-03:00",
  "student": {
    "display_name": "Rodrigo",
    "goals": [
      "Entender cálculo o suficiente para ler papers de machine learning sem pular as fórmulas."
    ],
    "known_base_domains": ["fotografia", "direção de carro", "planilhas"]
  },
  "decay_policy": {
    "skill_fact_days": 60,
    "procedural_fact_days": 180,
    "preference_fact_days": 180
  },
  "compaction": {
    "trigger_uncompacted_sessions": 15,
    "last_compacted_at": "2026-08-21T22:15:00-03:00",
    "last_compacted_session_id": "0041",
    "compaction_count": 2
  },
  "next_fact_seq": 39,
  "semantic_facts": [
    {
      "fact_id": "f-0031",
      "claim_key": "skill_derivadas_conceito_level",
      "kind": "skill_level",
      "topic": "derivadas",
      "claim": "Nunca viu derivada; conhece inclinação só como 'o m da reta' decorado do ensino médio.",
      "observation_type": "observed",
      "confidence": "medium",
      "observed_at": "2026-06-18",
      "recorded_at": "2026-07-30T21:40:00-03:00",
      "last_observed_at": "2026-08-13",
      "status": "superseded",
      "superseded_by": "f-0034",
      "supersedes": null,
      "source_sessions": ["0029", "0041"],
      "evidence": "Ao ser perguntado o que a derivada mede, respondeu 'é a fórmula que a gente aplica na função'.",
      "skill_level": "beginner",
      "proficiency_state": "unknown"
    },
    {
      "fact_id": "f-0034",
      "claim_key": "skill_derivadas_conceito_level",
      "kind": "skill_level",
      "topic": "derivadas",
      "claim": "Explica derivada como a inclinação do zoom local, mas ainda não conecta isso com a definição de limite.",
      "observation_type": "observed",
      "confidence": "low",
      "observed_at": "2026-08-20",
      "recorded_at": "2026-08-21T22:15:00-03:00",
      "last_observed_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": "f-0031",
      "source_sessions": ["0042"],
      "evidence": "Explicou de volta a derivada como inclinação do zoom local, sem material à vista, mas não conectou com a definição de limite.",
      "skill_level": "beginner",
      "proficiency_state": "fragile"
    },
    {
      "fact_id": "f-0035",
      "claim_key": "strength_python_funcoes",
      "kind": "strength",
      "topic": "python",
      "claim": "Escreve funções Python do zero sem ajuda de sintaxe; erra por esquecimento (return), não por conceito.",
      "observation_type": "observed",
      "confidence": "high",
      "observed_at": "2026-05-04",
      "recorded_at": "2026-07-30T21:40:00-03:00",
      "last_observed_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": null,
      "source_sessions": ["0022", "0029", "0041", "0042"],
      "evidence": "Escreveu duas funções do zero e rodou no terminal sem pedir ajuda de sintaxe.",
      "skill_level": "intermediate",
      "proficiency_state": "mastered"
    },
    {
      "fact_id": "f-0036",
      "claim_key": "preference_estudo_hora",
      "kind": "preference",
      "topic": null,
      "claim": "Estuda à noite, depois do trabalho, em blocos de ~1h; cansa visivelmente depois disso.",
      "observation_type": "inferred",
      "confidence": "low",
      "observed_at": "2026-08-20",
      "recorded_at": "2026-08-21T22:15:00-03:00",
      "last_observed_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": null,
      "source_sessions": ["0041", "0042"],
      "evidence": null,
      "skill_level": null,
      "proficiency_state": null
    }
  ],
  "procedural_facts": [
    {
      "fact_id": "f-0037",
      "claim_key": "visualization_derivadas_zoom_local",
      "procedure_kind": "visualization",
      "target_topic": "derivadas",
      "how": "Plotar a função e dar zoom sucessivo no ponto (janela ±1, ±0.1, ±0.01) até a curva ficar visualmente reta, ANTES de qualquer fórmula. Deixar ele nomear o que está vendo.",
      "base_domain": "fotografia",
      "mapping": "Aproximar o suficiente faz a curva virar reta, do mesmo jeito que aproximar a foto faz a borda virar um degrau de pixels; a derivada é a inclinação dessa reta que aparece no zoom.",
      "known_limit": "Para de valer em pontos não diferenciáveis: no bico do |x| em x=0 o zoom nunca vira reta. Marcar esse limite antes de ele generalizar 'toda curva vira reta'.",
      "validated": true,
      "retired": null,
      "outcome": "unlocked",
      "times_observed": 1,
      "observation_type": "observed",
      "confidence": "low",
      "observed_at": "2026-08-20",
      "recorded_at": "2026-08-21T22:15:00-03:00",
      "last_observed_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": null,
      "source_sessions": ["0042"],
      "evidence": "Ele antecipou sozinho: 'então se eu der zoom infinito vira uma reta, e a derivada é a inclinação dessa reta'."
    },
    {
      "fact_id": "f-0032",
      "claim_key": "presentation_order_limites_formalismo_primeiro",
      "procedure_kind": "antipattern",
      "target_topic": "limites",
      "how": "NÃO abrir com a definição formal (epsilon-delta, notação) antes de um objeto concreto na tela. Com ele, sempre gráfico ou código primeiro, formalismo depois — e só quando ele pedir o nome da coisa.",
      "base_domain": null,
      "mapping": null,
      "known_limit": null,
      "validated": null,
      "retired": null,
      "outcome": "backfired",
      "times_observed": 2,
      "observation_type": "observed",
      "confidence": "medium",
      "observed_at": "2026-08-13",
      "recorded_at": "2026-08-21T22:15:00-03:00",
      "last_observed_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": null,
      "source_sessions": ["0041", "0042"],
      "evidence": "Depois de ~6 minutos de epsilon-delta ele disse 'entendi as letras mas não entendi o que isso quer dizer' e parou de fazer perguntas."
    },
    {
      "fact_id": "f-0038",
      "claim_key": "hands_on_activity_erro_numerico_varredura_de_h",
      "procedure_kind": "hands_on_activity",
      "target_topic": "erro_numerico",
      "how": "Deixar ele varrer o parâmetro até o método quebrar (h de 1e-1 a 1e-16) e ver a curva de erro subir de novo, SEM avisar antes. Explicar a causa só depois que ele perguntar 'por quê'.",
      "base_domain": null,
      "mapping": null,
      "known_limit": "Só funciona quando a quebra é visível em um gráfico em poucos segundos; se o experimento demorar, ele desiste antes de ver.",
      "validated": true,
      "retired": null,
      "outcome": "unlocked",
      "times_observed": 1,
      "observation_type": "observed",
      "confidence": "low",
      "observed_at": "2026-08-20",
      "recorded_at": "2026-08-21T22:15:00-03:00",
      "last_observed_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": null,
      "source_sessions": ["0042"],
      "evidence": "Ele mesmo apontou a curva em U no gráfico do erro e perguntou 'por que piora se o h é menor?'."
    },
    {
      "fact_id": "f-0033",
      "claim_key": "analogy_derivadas_velocimetro",
      "procedure_kind": "analogy",
      "target_topic": "derivadas",
      "how": "Velocímetro do carro: velocidade média é distância/tempo do trecho; o velocímetro mostra o que sobra quando o trecho encolhe até quase zero. Usar como reforço DEPOIS do zoom, nunca no lugar dele.",
      "base_domain": "direção de carro",
      "mapping": "A taxa média sobre um intervalo vira taxa instantânea quando o intervalo encolhe — a mesma relação que o quociente de Newton formaliza.",
      "known_limit": "Ele não reusou a analogia espontaneamente; tratar como apoio secundário, não como a analogia principal deste aluno.",
      "validated": false,
      "retired": null,
      "outcome": "partial",
      "times_observed": 1,
      "observation_type": "observed",
      "confidence": "low",
      "observed_at": "2026-08-20",
      "recorded_at": "2026-08-21T22:15:00-03:00",
      "last_observed_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": null,
      "source_sessions": ["0042"],
      "evidence": "Aceitou a ideia mas ao explicar de volta recorreu ao zoom, não ao velocímetro."
    }
  ],
  "pending_followups": [
    {
      "text": "Explicar por que a diferença central erra menos que a progressiva para o mesmo h.",
      "created_in_session": "0042",
      "state": "open",
      "closed_in_session": null,
      "origin_field": "open_questions"
    },
    {
      "text": "Aplicar derivada_numerica em f(x)=sin(x) e conferir contra cos(x).",
      "created_in_session": "0042",
      "state": "open",
      "closed_in_session": null,
      "origin_field": "next_steps"
    }
  ]
}
```

### 10.5 Saída do digest para a sessão 0044

Montado por `memory-digest.sh <setup_root> --now 2026-08-24T19:03:00-03:00` a partir dos três
arquivos acima (já depois do `--verify`, que recuperou a 0043). Note a órfã reportada em
`orphan_sessions[]` e **fora** de `recent_sessions`, o `read_as` em cada item, e o
`full_detail_available` fechando a lacuna do "sempre lemos os arquivos anteriores". Com
`RECENT_SESSIONS_K = 5` e 43 sessões, `sessions_not_in_recent` é `43 − 5 = 38`.

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-24T19:03:00-03:00",
  "for_session_id": "0044",
  "memory_state": "warm",
  "topics_in_focus": ["derivadas", "erro_numerico", "limites", "python"],
  "topics_source": "inferred_from_recent",
  "full_detail_available": {
    "session_count": 43,
    "date_range": ["2026-03-02", "2026-08-22"],
    "index_file": "memory/INDEX.json",
    "raw_file_pattern": "memory/NNNN.json",
    "sessions_not_in_recent": 38,
    "top_tags": [
      { "tag": "python", "count": 27 },
      { "tag": "limites", "count": 6 },
      { "tag": "derivadas", "count": 3 },
      { "tag": "erro_numerico", "count": 2 }
    ],
    "how_to_open": "Filtre memory/INDEX.json por topics, skills_touched, flags ou date e abra apenas os memory/NNNN.json correspondentes."
  },
  "student": {
    "display_name": "Rodrigo",
    "goals": ["Entender cálculo o suficiente para ler papers de machine learning sem pular as fórmulas."],
    "known_base_domains": ["fotografia", "direção de carro", "planilhas"]
  },
  "recent_sessions": [
    { "session_id": "0038", "date": "2026-08-04", "topics": ["python"], "one_line_summary": "Ajustou o ambiente e revisou funções; sem conteúdo novo de matemática.", "flags": [] },
    { "session_id": "0039", "date": "2026-08-06", "topics": ["python"], "one_line_summary": "Refatorou o script de plotagem em funções; sem conteúdo novo de matemática.", "flags": [] },
    { "session_id": "0040", "date": "2026-08-11", "topics": ["limites"], "one_line_summary": "Tentativa de limites por tabela de valores; entendeu 'chegar perto', ficou incomodado com a falta de fórmula.", "flags": ["has_open_questions"] },
    { "session_id": "0041", "date": "2026-08-13", "topics": ["limites", "python"], "one_line_summary": "Primeiro contato com limites; entendeu 'chegar perto' numericamente, travou na notação.", "flags": ["has_open_questions", "has_next_steps"] },
    { "session_id": "0042", "date": "2026-08-20", "topics": ["derivadas", "limites", "python", "erro_numerico"], "one_line_summary": "Derivada via zoom no gráfico destravou o conceito; implementou derivada numérica e descobriu sozinho a curva em U do erro.", "flags": ["has_unlock", "has_backfire", "has_open_questions", "has_next_steps"] }
  ],
  "recent_affect": ["neutral", "neutral", "engaged"],
  "student_profile": {
    "facts": [
      { "fact_id": "f-0034", "kind": "skill_level", "topic": "derivadas", "claim": "Explica derivada como a inclinação do zoom local, mas ainda não conecta isso com a definição de limite.", "skill_level": "beginner", "proficiency_state": "fragile", "confidence": "low", "observation_type": "observed", "last_observed_at": "2026-08-20", "needs_reconfirmation": false, "read_as": "current", "source_sessions": ["0042"] },
      { "fact_id": "f-0035", "kind": "strength", "topic": "python", "claim": "Escreve funções Python do zero sem ajuda de sintaxe; erra por esquecimento (return), não por conceito.", "skill_level": "intermediate", "proficiency_state": "mastered", "confidence": "high", "observation_type": "observed", "last_observed_at": "2026-08-20", "needs_reconfirmation": false, "read_as": "current", "source_sessions": ["0022", "0029", "0041", "0042"] },
      { "fact_id": "f-0036", "kind": "preference", "topic": null, "claim": "Estuda à noite, depois do trabalho, em blocos de ~1h; cansa visivelmente depois disso.", "skill_level": null, "proficiency_state": null, "confidence": "low", "observation_type": "inferred", "last_observed_at": "2026-08-20", "needs_reconfirmation": false, "read_as": "current", "source_sessions": ["0041", "0042"] }
    ]
  },
  "procedural_playbook": {
    "do": [
      { "fact_id": "f-0037", "procedure_kind": "visualization", "target_topic": "derivadas", "how": "Plotar a função e dar zoom sucessivo no ponto (janela ±1, ±0.1, ±0.01) até a curva ficar visualmente reta, ANTES de qualquer fórmula. Deixar ele nomear o que está vendo.", "base_domain": "fotografia", "mapping": "Aproximar o suficiente faz a curva virar reta, do mesmo jeito que aproximar a foto faz a borda virar um degrau de pixels; a derivada é a inclinação dessa reta que aparece no zoom.", "known_limit": "Para de valer em pontos não diferenciáveis: no bico do |x| em x=0 o zoom nunca vira reta.", "outcome": "unlocked", "confidence": "low", "last_observed_at": "2026-08-20", "read_as": "current", "source_sessions": ["0042"] },
      { "fact_id": "f-0038", "procedure_kind": "hands_on_activity", "target_topic": "erro_numerico", "how": "Deixar ele varrer o parâmetro até o método quebrar (h de 1e-1 a 1e-16) e ver a curva de erro subir de novo, SEM avisar antes. Explicar a causa só depois que ele perguntar 'por quê'.", "base_domain": null, "mapping": null, "known_limit": "Só funciona quando a quebra é visível em um gráfico em poucos segundos.", "outcome": "unlocked", "confidence": "low", "last_observed_at": "2026-08-20", "read_as": "current", "source_sessions": ["0042"] },
      { "fact_id": "f-0033", "procedure_kind": "analogy", "target_topic": "derivadas", "how": "Velocímetro do carro: velocidade média é distância/tempo do trecho; o velocímetro mostra o que sobra quando o trecho encolhe até quase zero. Usar como reforço DEPOIS do zoom, nunca no lugar dele.", "base_domain": "direção de carro", "mapping": "A taxa média sobre um intervalo vira taxa instantânea quando o intervalo encolhe.", "known_limit": "Ele não reusou a analogia espontaneamente; tratar como apoio secundário.", "outcome": "partial", "confidence": "low", "last_observed_at": "2026-08-20", "read_as": "current", "source_sessions": ["0042"] }
    ],
    "avoid": [
      { "fact_id": "f-0032", "procedure_kind": "antipattern", "target_topic": "limites", "how": "NÃO abrir com a definição formal (epsilon-delta, notação) antes de um objeto concreto na tela. Com ele, sempre gráfico ou código primeiro, formalismo depois — e só quando ele pedir o nome da coisa.", "outcome": "backfired", "confidence": "medium", "last_observed_at": "2026-08-20", "read_as": "current", "source_sessions": ["0041", "0042"] }
    ]
  },
  "orphan_sessions": [
    { "session_id": "0043", "date": "2026-08-22", "one_line_summary": "Sessão interrompida sem fechamento (recuperada automaticamente).", "topics": ["derivadas"], "days_ago": 2 }
  ],
  "pending_followups": [
    { "text": "Explicar por que a diferença central erra menos que a progressiva para o mesmo h.", "created_in_session": "0042", "origin_field": "open_questions" },
    { "text": "Aplicar derivada_numerica em f(x)=sin(x) e conferir contra cos(x).", "created_in_session": "0042", "origin_field": "next_steps" }
  ],
  "truncated": false,
  "truncated_fields": [],
  "budget_exceeded": false,
  "errors": []
}
```

### 10.6 Digest da primeira sessão (`memory/` vazia) — mesma forma, tudo vazio

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-03-02T20:00:00-03:00",
  "for_session_id": "0001",
  "memory_state": "first_session",
  "topics_in_focus": [],
  "topics_source": "inferred_from_recent",
  "full_detail_available": {
    "session_count": 0,
    "date_range": [null, null],
    "index_file": "memory/INDEX.json",
    "raw_file_pattern": "memory/NNNN.json",
    "sessions_not_in_recent": 0,
    "top_tags": [],
    "how_to_open": "Filtre memory/INDEX.json por topics, skills_touched, flags ou date e abra apenas os memory/NNNN.json correspondentes."
  },
  "student": null,
  "recent_sessions": [],
  "recent_affect": [],
  "student_profile": { "facts": [] },
  "procedural_playbook": { "do": [], "avoid": [] },
  "orphan_sessions": [],
  "pending_followups": [],
  "truncated": false,
  "truncated_fields": [],
  "budget_exceeded": false,
  "errors": []
}
```

---

## 11. O que as ondas seguintes precisam implementar

| Artefato | Dono | Contrato resumido |
|---|---|---|
| `SK/scripts/memory-digest.sh` | onda 3 (sub-tarefa 3.4) | Exatamente §6. Raiz do setup posicional, `--now` obrigatório para saída reproduzível. Somente leitura, saída fixa, sempre exit 0. |
| `SK/scripts/memory-index.sh --verify` | onda 3 (sub-tarefa 3.4) | Sincronia do índice **e** recuperação automática de órfã (§7.3). É o **único** componente que finaliza uma órfã. |
| Abertura de sessão (`session-new.sh`) | onda 3 (sub-tarefa 3.3) | Depois de `--verify` e do digest: criar `NNNN.json` com os 5 obrigatórios e `status: in_progress`, mais o `.session.lock` JSON. Lock vivo → exit 4. |
| Fechamento (`session-close.sh`) | onda 3 (sub-tarefa 3.3) | Preencher a sessão → validar contra o schema (faltou campo → pedido `fill_session_fields`, exit 10, `--apply`) → reescrever `one_line_summary` → `status: completed` + `finalized_at` + `finalized_by` → append no índice (§2.1) → checar gatilho de compactação (§4.1). **Não escreve `profile.json`.** |
| Compactação (`memory-compact.sh`) | onda 3 (sub-tarefa 3.4) | Exatamente §4.2, com o pedido `compact_facts` (exit 10 / `--apply`). É o único escritor de `profile.json`, e o único ponto onde a LLM escreve memória de longo prazo. |
| Validador dos schemas | gate | Verificador mínimo em Python stdlib. Requisito: aceitar `type` como string **ou** array de strings (`["string","null"]`), e suportar `required`, `enum`, `pattern`, `properties`, `items`, `additionalProperties: false`. Sem `$ref`, sem `allOf` aninhado, sem `if/then/else` — os três schemas foram escritos para caber nisso. |
| `SKILL.md` | onda 3 | Três obrigações herdadas daqui: (i) `read_as: "hypothesis"` vira pergunta, nunca afirmação; (ii) assunto fora do digest → filtrar o índice e abrir o bruto antes de dizer "não me lembro"; (iii) `memory_state: "first_session"` → sessão de calibração, não fingir conhecer o aluno. |

Evolução de schema: adicionar campo opcional sobe MINOR; tornar obrigatório, renomear ou mudar tipo sobe MAJOR e exige migração dos arquivos já escritos. Campo novo ausente em arquivo antigo tem default sensato (`null` ou `[]`); nome de campo nunca é reaproveitado com outro significado.

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-M01 | "Sempre lemos os arquivos anteriores" será implementado como **índice + perfil + digest sempre**, com os `NNNN.json` brutos abertos **seletivamente** — e não como "carregar todos os arquivos no contexto". Confirma? | (a) índice+perfil+digest, brutos sob demanda; (b) carregar todos os brutos sempre; (c) carregar todos até N sessões e depois trocar para (a) | (a) | cheap — é política de leitura, nenhum dado muda de formato |
| D-M02 | Gatilho de compactação: quantas sessões não consolidadas disparam o processo? | 15 · 20 · nunca (manual) | 15 (piso da faixa da pesquisa), configurável em `profile.json` | cheap — é um número num arquivo |
| D-M03 | Versionar `memory/` no git? | (a) `.gitignore` (dado de runtime); (b) versionar; (c) versionar só `INDEX.json` e `profile.json` | (a) não versionar | moderate — se versionar e depois se arrepender, o histórico do git guarda o dado |
| D-M04 | **RESOLVIDA (reconciliação onda 29 — era o ponto em que `docs/01` e `docs/03` se contradiziam).** Sessões `abandoned` entram na compactação? | (a) entram, contam para o limiar e travam em `confidence: low` os fatos que só elas sustentam; (b) ignoradas na consolidação, preservadas no disco | **(a)** — nada se perde e nada é promovido além do que a evidência sustenta. Versão única, idêntica em `docs/01-arquitetura.md` do repositório §4.2 | cheap — regra da rotina de compactação |
| D-M05 | Persistir `raw_notes` (trechos brutos de diálogo)? Ajuda a auditar e a reabrir um episódio; é o campo com maior risco de privacidade e o que mais infla o arquivo. | (a) nunca; (b) sempre; (c) só quando o aluno pedir; (d) sempre, mas purgado automaticamente após N meses | (c) só a pedido | cheap para desligar; expensive para desfazer o que já foi gravado |
| D-M06 | **RESOLVIDA (AR-06).** Sessão órfã: fechar retroativamente como `abandoned`, contando no índice e sem inventar conteúdo. | (a) fechar como `abandoned`, **automaticamente, sem perguntar**; (b) perguntar ao aluno (menu de 3); (c) deixar `in_progress` para sempre; (d) apagar o arquivo; (e) pedir à LLM para completar o que faltou | **(a)**, em `memory-index.sh --verify`, dono único. No catálogo (3.0) a decisão fica com `ask_when: never`: é o caso de falha mais comum e perguntar a cada retomada é atrito diário | cheap — só o `--verify` muda |
| D-M07 | RAG local (`sqlite-vec` + embedding local) para busca por conteúdo livre: adotar agora ou deixar como upgrade futuro? | (a) só quando passar de ~150-200 sessões; (b) desde já; (c) nunca | (a) — o schema já guarda os campos de texto que seriam embedados, então a porta fica aberta sem custo | cheap para adicionar depois; adicionar agora é complexidade desproporcional |
| D-M08 | **RESOLVIDA (AR-01).** O nome `status` significa coisas diferentes na sessão (`in_progress\|completed\|abandoned`) e no fato (`active\|superseded`). Renomear para `session_status` / `fact_status`? | (a) manter `status` nos dois, com a tabela de desambiguação de §0; (b) renomear ambos | **(a) manter** — vence `session.schema.json`. `session_status`, `closed` e `orphaned` estão descartados em todo o projeto; a desambiguação é feita pela tabela de §0, não pelo nome do campo | moderate — renomear depois exige migrar os arquivos já escritos |
| D-M09 | Granularidade do que **não** persistir: `affect_note` pode registrar contexto emocional ancorado em comportamento observável, mas nada de contexto familiar, de saúde ou de terceiros nomeados. Esse limite está no lugar certo? | (a) limite proposto; (b) mais restritivo (só afeto categórico, sem nota); (c) mais permissivo | (a) | cheap para apertar; expensive para desfazer o que já foi gravado |
