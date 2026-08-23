# Parte 2 — Memória: as três camadas, o "como", o digest e a compactação

## Sumário da Parte 2

- **§2.1–§2.2** as três camadas (episódica · índice · perfil consolidado), o que **nunca** vai em cada uma, e a tabela de derivação do índice.
- **§2.3** ⭐ a **memória procedimental** — o "como isso aconteceu" pedido explicitamente —, com `backfired` e a regra de que o que deu errado nunca é truncado.
- **§2.4** bitemporalidade: fato nunca sobrescrito, sempre superado, e por que isso impede a ancoragem num perfil velho.
- **§2.5** ⭐ o **algoritmo do digest**, transcrito: 15 passos, escada de truncamento, defaults e determinismo byte a byte.
- **§2.6–§2.7** compactação, e ⭐ a **armadilha da reconstrução** — o defeito real que duplicava fatos a cada rebuild do índice.
- **§2.8–§2.10** sessão órfã, os três schemas **verbatim**, e privacidade.

---

## 2.1 As três camadas

```
memory/                      (do setup do aluno)
├── 0001.json                camada 1 — episódica    (append-only, uma por sessão)
├── 0002.json
├── ...
├── 0042.json
├── INDEX.json               camada 2 — índice       (derivado, reconstruível)
└── profile.json             camada 3 — consolidado  (semântico + procedimental, bitemporal)
```

⚑ A camada 3 é **`memory/profile.json`** — singular, minúsculo, na mesma pasta, sem subdiretório. `PROFILE.json` e `memory/consolidated/` não existem.

### 2.1.1 Camada 1 — episódica: `memory/NNNN.json`

Schema: `SK/assets/schemas/session.schema.json` (§2.9.1).

| Propriedade | Contrato |
|---|---|
| Quem escreve | A skill, ao longo da sessão: esqueleto na abertura (`status: in_progress`, via `session-new.sh`), **reescrita completa a cada marco** da aula (checkpoint), e o preenchimento final no fechamento (`status: completed`, via `session-close.sh`). Fora esses caminhos, só a recuperação automática de órfã escreve aqui. |
| Quem lê | O digest lê **no máximo** o que o índice já resume. O tutor abre o arquivo inteiro **sob demanda**. A compactação lê os brutos (e só eles). |
| Mutabilidade | Append-only entre sessões: um `NNNN.json` **nunca** é reescrito depois de finalizado. Correção de conteúdo é feita registrando o fato novo na sessão atual, não editando a antiga. |
| Deleção | Nunca no fluxo normal. Só por purga explícita de privacidade (§2.10). |
| Obrigatórios | **5 campos**: `schema_version`, `session_id`, `date`, `status`, `one_line_summary`. Todo o resto é opcional e tolera `null`. |
| Invariante | `session_id` == nome do arquivo sem extensão. O caminho é **derivado**, nunca armazenado como fonte da verdade. Por isso nenhum arquivo é movido, jamais. |

**Por que só 5 obrigatórios:** cada campo obrigatório extra é uma chance de a LLM (a) pular, (b) preencher com placeholder plausível, ou (c) inferir além do que a sessão sustenta. Um arquivo com 5 campos verdadeiros vale mais que um com 20 campos meio inventados.

**Por que `one_line_summary` é obrigatório mesmo na criação:** o arquivo precisa ser **válido em todo instante**, inclusive enquanto `in_progress` — um gate que valida `memory/*.json` não pode quebrar porque uma sessão está aberta. Na criação recebe um provisório (`"Sessão em andamento: <goal>"` ou `"Sessão iniciada, ainda sem resumo."`, truncado em 160) e é **reescrito** no fechamento.

**O que NUNCA vai em `memory/`:** transcrição literal da conversa; conteúdo teórico (isso é `researchs/`); enunciado de desafio (isso é `challenges/`); dado pessoal sem função pedagógica — contexto familiar, saúde, nome de terceiros, geolocalização, identificador de dispositivo.

> **PERGUNTE AO USUÁRIO (D-A11)** — O `memory/NNNN.json` é reescrito a cada marco da aula (checkpoint) ou só no fechamento?
> É salvar o documento a cada parágrafo em vez de só no fim. O arquivo é pequeno, a reescrita custa milissegundos, e o ganho aparece exatamente no dia em que o terminal fecha sozinho: a sessão órfã tem conteúdo em vez de só um cabeçalho.
> **Opções:** **(a)** checkpoint a cada marco da aula — a sessão órfã sobra com conteúdo útil e o custo de escrita é desprezível; mais escritas em disco por aula · **(b)** só no `close_session` — uma escrita por aula, e uma queda no meio deixa um arquivo vazio, tirando todo o sentido da recuperação de órfã · **(c)** checkpoint por tempo (a cada 10 min) — custo previsível, e salva no meio de um raciocínio em vez de no fim de um marco
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 2.1.2 Camada 2 — índice: `memory/INDEX.json`

Schema: `SK/assets/schemas/index.schema.json` (§2.9.2).

| Propriedade | Contrato |
|---|---|
| Natureza | **Derivado.** Todo campo sai mecanicamente do `NNNN.json` correspondente. Nenhum campo exige julgamento de LLM — se exigisse, o schema estaria errado. |
| Reconstruível | Pode ser apagado e regenerado do zero varrendo `memory/[0-9][0-9][0-9][0-9].json` em ordem. É cache, não fonte da verdade. **Com uma ressalva séria: §2.7.** |
| Quem escreve | `memory-index.sh` no fechamento de cada sessão; e `memory-compact.sh`, que atualiza `compacted_at` e `digest_eligible`. |
| Quem lê | **Sempre lido por inteiro**, em toda sessão. É o "sempre lemos os arquivos anteriores" na prática: nenhuma sessão fica invisível. |
| Tamanho | ~200-300 bytes por entrada. 200 sessões ≈ 50 KB ≈ 15k tokens — é o item que mais cresce, e por isso `digest_eligible` existe: o digest carrega só um recorte, mas o arquivo inteiro continua disponível para filtro mecânico (`jq`, `grep`). |

**O que NUNCA vai no índice:** qualquer campo que exija julgamento. Se um campo não pode ser derivado por `jq` a partir do bruto, ele não pertence a esta camada.

> **PERGUNTE AO USUÁRIO (D-M07)** — Adotar busca semântica local (`sqlite-vec` + embedding local) sobre o conteúdo livre agora, ou deixar como upgrade futuro?
> É instalar um sistema de busca numa biblioteca de trinta livros: a estante ainda resolve. Os campos de texto que seriam indexados já estão no schema, então a porta fica aberta sem custo e só se abre quando o acervo justificar.
> **Opções:** **(a)** só quando passar de ~150-200 sessões — complexidade só quando há problema para resolver, e adicionar depois não exige migração; até lá a busca por conteúdo livre fica por conta do índice e do digest · **(b)** desde já — busca semântica desde a primeira aula, ao custo de uma dependência binária e um modelo de embedding para dezenas de arquivos · **(c)** nunca — zero dependência para sempre, e fecha a porta antes de saber se o acervo vai crescer
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 2.1.3 Camada 3 — consolidado: `memory/profile.json`

Schema: `SK/assets/schemas/profile.schema.json` (§2.9.3).

| Propriedade | Contrato |
|---|---|
| Conteúdo | `semantic_facts[]` (o que é verdade sobre o aluno) + `procedural_facts[]` (o que funciona **com este aluno**) + `pending_followups[]` + política (`decay_policy`, `compaction`) + `student` (mínimo). |
| Quem escreve | **Só a compactação.** Nenhuma sessão escreve direto no perfil — isso mantém **uma única porta de entrada auditável** para a memória de longo prazo. `session-close.sh` **não escreve `profile.json`**. |
| Quem lê | Sempre lido por inteiro pelo digest, que filtra `status == "active"`. |
| Mutabilidade | Um fato **nunca** é sobrescrito. Mudou? O antigo vira `superseded` + `superseded_by`, e nasce um fato novo com o mesmo `claim_key` (§2.4). |
| Fonte | Cada fato carrega `source_sessions[]` — o perfil inteiro é re-derivável e auditável a partir dos brutos. |

**O que NUNCA vai no perfil:** afeto (é volátil, vive 3 sessões no índice e nunca vira fato); qualquer coisa sem `evidence` com `confidence` acima de `low`; qualquer fato inferido a partir de outro fato `inferred`.

### 2.1.4 O nome `status` aparece três vezes — são três coisas diferentes

Esta é a maior fonte de confusão possível no desenho, então fica explícito:

| Onde | Campo | Valores | Significa |
|---|---|---|---|
| `memory/NNNN.json` e `memory/INDEX.json` | `status` | `in_progress` · `completed` · `abandoned` | ciclo de vida **da sessão** |
| `memory/profile.json` → `semantic_facts[]` e `procedural_facts[]` | `status` | `active` · `superseded` | vigência **de um fato** (enum congelado) |
| `memory/profile.json` → `pending_followups[]` | `state` | `open` · `done` · `dropped` | ciclo de vida **de uma pendência** |

O terceiro chama-se `state`, e não `status`, exatamente para não criar um terceiro significado do mesmo nome. E **não existe** valor de `status` para "fato envelhecido": isso é `needs_reconfirmation`, um booleano **derivado** em tempo de leitura (§2.4.3).

---

## 2.2 A tabela de derivação (índice ← sessão) — mecânica, sem julgamento

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
| `cross_setup_refs` | `session.cross_setup_refs` (ausente → `[]`) — derivado porque a seção `pontes` do `README.md` do setup é montada varrendo o índice; sem ele, a ponte exigiria abrir todos os `memory/NNNN.json` |
| `digest_eligible` · `compacted_at` | **não derivam da sessão** — ver §2.7 |

O bloco `jq` que implementa esta tabela vive entre os marcadores `# >>> DERIVACAO-INDICE` / `# <<< DERIVACAO-INDICE` e é **cópia literal** em `memory-index.sh` e `memory-digest.sh`. Divergência entre as duas cópias é bug, e o gate pode compará-las com `diff` (invariante M-11).

**Quarentena.** Bruto que não parseia, ou cujo `session_id` não bate com o nome do arquivo, é **movido** (nunca apagado) para `memory/broken/NNNN.json` — com sufixo `.1`, `.2`… se o destino já existir —, listado em `quarantined[]` e ignorado pelo resto da execução. Um bruto ilegível **nunca derruba a sessão**.

⚑ `memory/broken/` e `memory/discarded/` **coexistem sem sobreposição**: `broken/` é quarentena automática do que não parseia; `discarded/` é descarte **pedido pelo aluno**. São dois eventos diferentes com auditorias diferentes; fundi-los perderia a distinção entre "corrompeu" e "ele não quis".

---

## 2.3 ⭐ Memória procedimental: o "COMO isso aconteceu"

Este é o requisito mais fácil de perder, porque é o único que não tem um lugar óbvio num schema de "resumo de aula". Registrar *o que* foi estudado é trivial e quase inútil sozinho; **o que faz um tutor parecer que conhece o aluno é lembrar por qual caminho ele chegou lá.**

### 2.3.1 O que conta como "como"

Cinco coisas concretas, e nenhuma delas é "expliquei o assunto":

1. **Qual analogia destravou** — e, mais importante, qual era o **domínio-base** (o que o aluno já domina) e qual **relação** foi mapeada. "É tipo dar zoom" é uma etiqueta; "a curva vira reta quando você aproxima o suficiente, e a derivada é a inclinação dessa reta" é o mapeamento relacional. Sem o mapeamento registrado, a analogia é reintroduzida errada meses depois.
2. **Qual caminho de explicação funcionou** — a sequência de ideias, não o conteúdo delas.
3. **Qual ordem de apresentação falhou** — o dado mais barato e mais desprezado do sistema. Saber que abrir com o formalismo travou o aluno vale mais que saber que ele acertou 4 de 5.
4. **O que ele precisou fazer com as próprias mãos** — qual atividade prática produziu o entendimento, e se ele a fez sozinho ou copiando.
5. **Onde a analogia parou de valer** — o limite conhecido, para marcá-lo *antes* de o aluno esticar demais e absorver uma concepção errada implantada pelo próprio ensino (transferência negativa).

### 2.3.2 Onde isso vive: nas duas camadas, com papéis distintos

A resposta não é "perfil **ou** sessão" — é **os dois**, e a distinção é o que impede o resumo-do-resumo:

| Camada | Campo | Papel | Granularidade |
|---|---|---|---|
| Sessão (`NNNN.json`) | `how_it_happened[]` | **Registro bruto e datado** de cada movimento pedagógico da sessão, na ordem em que aconteceu, com o efeito observado e a evidência. É o que de fato aconteceu, sem interpretação. | Um item por movimento. Uma sessão típica tem 3 a 8. |
| Perfil (`profile.json`) | `procedural_facts[]` | **Playbook destilado e reutilizável**: o que já foi confirmado que funciona (ou prejudica) com este aluno, em nível de receita executável, com espinha bitemporal. | Um item por `claim_key`, sustentado por 1..N sessões. |

Campos de apoio: `what_worked` / `what_didnt_work` na sessão são a versão de uma frase do array — existem porque alimentam o digest **sem obrigar a abrir o `how_it_happened[]` inteiro**.

**Os três vocabulários fechados desta camada:**

| Campo | Valores |
|---|---|
| `how_it_happened[].move_type` | `analogy` · `worked_example` · `hint_ladder` · `socratic_question` · `hands_on` · `explanation_order` · `visualization` · `reference_lookup` · `spaced_review` · `error_autopsy` |
| `outcome` (na sessão **e** no perfil) | `unlocked` · `partial` · `no_effect` · **`backfired`** |
| `procedural_facts[].procedure_kind` | `analogy` · `explanation_path` · `presentation_order` · `hands_on_activity` · `hint_strategy` · `visualization` · `antipattern` |

**`backfired` é o valor mais importante do enum.** Ele registra o movimento que **piorou**: confundiu, travou, frustrou, ou implantou uma concepção errada. Item com `outcome == "backfired"` na compactação vira `procedure_kind: antipattern` **além** do tipo original.

### 2.3.3 A regra que faz o campo valer alguma coisa

`description` (sessão) e `how` (perfil) precisam ser **reexecutáveis**. O teste é mecânico: *uma sessão futura consegue repetir isso lendo só este campo?*

| Inútil | Útil |
|---|---|
| "usei uma visualização" | "plotei `x**3` e dei zoom sucessivo (janela 2±1, 2±0.1, 2±0.01) até a curva ficar reta na tela, antes de qualquer fórmula" |
| "expliquei limites" | "abri com a definição epsilon-delta antes de qualquer gráfico — ele travou em 6 minutos e parou de perguntar" |
| "ele praticou" | "ele escreveu `derivada_numerica(f, x, h)` do zero, sem eu mostrar código antes" |

E **`outcome` sem `evidence` é opinião**: a compactação **não pode** promover a `confidence` acima de `low` um procedimento cujo item de origem tem `evidence: null`.

Dois campos existem só para o antipadrão do andaime esquecido:

- **`validated`** é `true` **apenas** quando o aluno USOU o procedimento para prever ou resolver um caso **NOVO** — não quando apenas repetiu de volta o que ouviu.
- **`retired`** é `true` quando o aluno passou a resolver o assunto sem precisar do procedimento. **O digest não carrega procedimentos aposentados.** Um andaime mantido depois de desnecessário vira ruído, e no nível avançado atrapalha.

### 2.3.4 Como é recuperado numa sessão futura — e a regra do que nunca é truncado

Determinístico, no passo 7 do digest (§2.5.2):

1. **Sempre, independente do assunto de hoje:** até 5 `procedural_facts` com `outcome == "backfired"` e `status == "active"` → bloco **`procedural_playbook.avoid`**. Ordem: `last_observed_at` desc, desempate `fact_id` asc.
2. **Por tópico:** `procedural_facts` com `status == "active"`, `retired != true`, `outcome ∈ {unlocked, partial}` e `target_topic ∈ TOPICS_IN_FOCUS` → bloco **`procedural_playbook.do`**, até 8, ordenados por `unlocked` antes de `partial`, depois `last_observed_at` desc, desempate `fact_id` asc.
3. Cada item carrega `read_as: "current" | "hypothesis"` (§2.4.3). Um procedimento com `needs_reconfirmation` entra como **sugestão a testar**, não como receita garantida.
4. Fora do digest: qualquer `how_it_happened[]` bruto é acessível filtrando `memory/INDEX.json` por `flags: has_unlock` / `has_backfire` ou por `topics`, e abrindo o `memory/NNNN.json` correspondente.

**A regra dura, e é a que dá sentido ao registro do fracasso:**

> **`procedural_playbook.avoid` NUNCA é truncado pelo orçamento do digest.** Os antipadrões são baratos (poucas linhas) e evitam repetir um dano já conhecido. Estão declarados no schema como "as entradas mais valiosas do arquivo", e a escada de truncamento (§2.5.3) não tem passo nenhum que os toque.

O consumidor tem uma obrigação correspondente, escrita no `SKILL.md` como **MEM-3**: *`what_didnt_work` é **proibição**, não sugestão — não repita a abordagem na mesma forma; se for inevitável, mude a forma e diga por quê.*

O tutor lembra o que **não** funcionou. É a assimetria deliberada do desenho: o que deu certo pode ser cortado por orçamento; o que deu errado, não.

Os **13 campos** que cada item de `procedural_playbook` emite: `fact_id`, `procedure_kind`, `target_topic`, `how`, `base_domain`, `mapping`, `known_limit`, `outcome`, `confidence`, `last_observed_at`, `read_as`, `source_sessions` (12 campos em cada item; o 13º é o rótulo do bloco de origem, `do` ou `avoid`).

---

## 2.4 Bitemporalidade e decaimento

### 2.4.1 As duas linhas de tempo

| Campo | Linha do tempo | Significa |
|---|---|---|
| `observed_at` | **valid time** | a data da sessão em que o fato foi observado pela primeira vez no mundo real |
| `last_observed_at` | **valid time** | a data da reobservação mais recente |
| `recorded_at` | **transaction time** | quando o sistema gravou o fato (a compactação) — pode ser semanas depois |

Elas divergem de verdade neste desenho: a sessão 0042 é de 20/08 e o fato só é escrito na compactação de 12/09. Sem separar as duas, é impossível responder **"o que o tutor sabia sobre o aluno no dia 25/08?"** — e essa pergunta importa quando se investiga por que o tutor tomou uma decisão ruim.

### 2.4.2 Nunca sobrescrever

Um fato **nunca** muda de conteúdo. Mudou o mundo? Novo registro, com o mesmo `claim_key`, superseding o anterior:

```
f-0031  claim_key: skill_derivadas_conceito_level   status: superseded   superseded_by: f-0034
f-0034  claim_key: skill_derivadas_conceito_level   status: active       supersedes: f-0031
```

**Por quê, em uma frase:** para **não ancorar o tutor num perfil velho do aluno** sem apagar o histórico de como ele chegou até aqui.

- **Sobrescrever** perderia a trajetória — que é informação pedagógica de primeira ordem: *quando* e *depois de quê* ele superou aquilo.
- **Deletar** perderia a auditoria.
- **Supersede** preserva os dois e ainda mantém o digest limpo, porque o digest só olha `status == "active"`.

`claim_key` é o que torna isso implementável por código: **só supersede quem tem `claim_key` idêntico** — comparação por igualdade de string, nada mais. Dois fatos sobre o mesmo tópico com `claim_key` diferente **coexistem sem conflito**: "tem dificuldade com o caso base da recursão" e "escreve funções Python sem ajuda de sintaxe" são ambos verdadeiros ao mesmo tempo, e um sistema que os tratasse como contraditórios estaria errado.

### 2.4.3 `needs_reconfirmation` é derivado, não armazenado

```
bucket(fato) =
    decay_policy.skill_fact_days        se fato ∈ semantic_facts e kind ∈ {skill_level, difficulty, strength}   (default 60)
    decay_policy.preference_fact_days   se fato ∈ semantic_facts e kind ∈ {preference, context}                 (default 180)
    decay_policy.procedural_fact_days   se fato ∈ procedural_facts                                              (default 180)

needs_reconfirmation = (hoje − last_observed_at) em dias > bucket(fato)
read_as = "hypothesis" se needs_reconfirmation senão "current"
```

Calculado a cada digest, **nunca persistido** — persistir significaria que ele fica errado sozinho com a passagem do tempo. Não é um terceiro valor de `status`: um fato pode ser `active` **e** `needs_reconfirmation: true` ao mesmo tempo, e é exatamente esse o caso interessante. Data ilegível ⇒ `needs_reconfirmation: false`.

**Por que 60 dias para habilidade e 180 para procedimento:** um nível de habilidade envelhece rápido (é justamente o que o estudo muda); uma analogia que pegou com aquela pessoa envelhece devagar, porque depende do repertório dela, que é estável. Ambos configuráveis em `profile.json`.

**A obrigação do consumidor, e ela vive no `SKILL.md` como MEM-7:** item com `read_as: "hypothesis"` é tratado como **pergunta**, nunca como afirmação — *"você ainda trava no caso base da recursão?"*, jamais *"sei que você tem dificuldade com recursão"*. Essa é a diferença entre um tutor que acompanha e um que rotula.

### 2.4.4 As três defesas contra a ancoragem

| Falha | Defesa concreta |
|---|---|
| **Memória que polui** (o tutor infere além do que a sessão sustenta e grava) | `observation_type: observed \| inferred` em `how_it_happened[]`, `skills_observed[]` e em todo fato; um fato `inferred` **não pode nascer `high`**; `evidence` obrigatório na prática (sem ele, `confidence` trava em `low`, e no digest um `low` é o primeiro a ser cortado por T4); `source_sessions[]` em todo fato; e a compactação lê **só os brutos** — um erro de destilação não se realimenta na destilação seguinte. |
| **Contradição entre sessões** | `claim_key` resolve as duas falhas simétricas de uma vez: mesma chave → o novo supersede (nunca "os dois valem"); chave diferente → coexistem. O digest emite **apenas** `active`: a contradição histórica existe no arquivo, é auditável, e **não entra no contexto** como duas afirmações concorrentes. |
| **Ancoragem no perfil antigo** | `needs_reconfirmation` + `read_as: hypothesis`; teto de `SEMANTIC_FACTS_CAP=12` fatos no digest; `recent_affect` limitado a 3 sessões e afeto **proibido** de virar fato ("aluno ansioso" é o rótulo mais grudento e menos verificável de todos); `retired: true` tira do digest o andaime desnecessário; e supersede preserva a trajetória, então o tutor pode dizer *"em janeiro você travava no caso base e em março parou de travar"* — o oposto de ancorar. |

---

## 2.5 ⭐ O algoritmo do digest

Implementado em `SK/scripts/memory-digest.sh`. **Montado por código, nunca por "a LLM decide o que copiar"** — se a própria compactação do contexto exigisse ler 60 arquivos, ela sofreria do mesmo problema que existe para resolver.

### 2.5.1 Interface e garantias

```
memory-digest.sh <setup_root> [--topics t1,t2] [--budget-chars N] [--today AAAA-MM-DD] [--now <ISO 8601>]
```

| Garantia | Como |
|---|---|
| **Somente leitura** | não cria, não altera e não remove arquivo nenhum — **nem tmp**. Não fecha órfã, não reconstrói o índice em disco. |
| **Forma fixa** | **18 chaves de topo**, sempre as mesmas, na mesma ordem; ausência é `[]`, `{}` ou `null`. O consumidor **nunca ramifica por formato** — só por `memory_state`. |
| **Exit 0 sempre** | qualquer falha interna cai num digest mínimo com `errors[{"kind":"internal_error"}]`; `!= 0` só em uso incorreto (2), setup não encontrado (3) ou impossibilidade de escrever em stdout (1). **Falha de memória nunca impede uma aula de começar.** |
| **Determinístico byte a byte** | mesma entrada + mesmos `--now`/`--today` ⇒ **bytes idênticos**. Toda ordenação tem desempate explícito (`fact_id` asc, índice de origem); nenhuma ordem vem de iteração de diretório; **o único relógio lido é o de `--now`/`--today`**. |
| **Montado por código** | nenhum campo depende de julgamento do modelo; o **único** canal de julgamento é `--topics`. |
| Posicionamento | O bloco vai no **fim** do contexto de abertura, colado ao primeiro turno — o começo e o fim são as posições de melhor recuperação; o meio, a pior. |

**Por que existe a variável de instante fixo.** `--now` (e o par `STUDY_METHOD_NOW` / `STUDY_METHOD_TODAY`) existe por um motivo só: **sem ele, o mesmo estado em disco produz bytes diferentes**, porque `generated_at` carrega o relógio. Aí o determinismo que este contrato promete não é verificável — não dá para comparar duas execuções com `diff` nem com `sha256sum`, e a invariante M-03 ("duas execuções produzem bytes idênticos") não teria como ser escrita. **Toda comparação byte a byte de teste ou de gate passa `--now`.**

**Defaults:**

```
BUDGET_CHARS=6000 · RECENT_SESSIONS_K=5 · AFFECT_WINDOW=3 · TOPIC_WINDOW=3 ·
SEMANTIC_FACTS_CAP=12 · PROC_AVOID_CAP=5 · PROC_DO_CAP=8 · FOLLOWUP_CAP=6 ·
TOP_TAGS=15 · SUMMARY_TRUNC=160 · TEXT_TRUNC=120 (T5)
```

Comprimento é contado em **codepoints** (`jq -Rs length`) sobre a saída serializada final, **inclusive a quebra de linha** — a mesma métrica em todos os passos da escada.

### 2.5.2 Os 15 passos, em forma executável

| # | Passo |
|---|---|
| 1 | `MEM = <setup_root>/memory`; `TODAY = --today` ou `sm_today`; `NOW = --now` ou `sm_now_iso` (só alimenta `generated_at`). `MEM` inexistente, **ou** sem nenhum `NNNN.json` e sem `INDEX.json` ⇒ `first_session` (blocos vazios, `for_session_id: "0001"`, `errors: []` — `profile_missing` **não** é registrado aqui: não falta nada). |
| 2 | Lê `INDEX.json`. Ausente → `errors[{"kind":"index_missing"}]`; não parseia (ou `updated_at` ilegível) → `index_unparseable`; `updated_at` < `mtime` de algum bruto → `index_stale`. Em qualquer um dos três, **reconstrói em memória** varrendo `MEM/[0-9][0-9][0-9][0-9].json` em ordem de nome, pela tabela de §2.2 + o overlay de §2.7 (prior = entradas do índice quando ele apenas estava defasado). Bruto que não parseia → `errors[{"kind":"session_unparseable","session_id":"NNNN"}]` e segue. `ENTRADAS` ordenadas por `session_id` asc. |
| 3 | `ORPHANS` = entradas com `status == "abandoned"` **e** `flags ∋ orphan_recovered` (o índice não guarda `finalized_by`), ordenadas por `session_id` **desc**, cortadas em **3**. Emite `{session_id, date, one_line_summary, topics, days_ago}`. Entradas ainda `in_progress` **não entram** aqui nem em `recent_sessions`. |
| 4 | `for_session_id = zero-pad(4, max(session_id) + 1)`; sem entradas, `"0001"`. |
| 5 | Lê `profile.json`. Ausente → `errors[{"kind":"profile_missing"}]` (**não** conta para `degraded`); não parseia → `profile_unparseable`. Defaults de `decay_policy`: 60 / 180 / 180. Para todo fato `active`: calcula `needs_reconfirmation` e `read_as` (§2.4.3). |
| 6 | `TOPICS_IN_FOCUS`: de `--topics` (`topics_source: "argument"`) ou da união dos `topics` das últimas `TOPIC_WINDOW` entradas **finalizadas** (`status != "in_progress"`), com `topics_source: "inferred_from_recent"`. Cada rótulo passa por `sm_normalize_concept_id`; rótulo já canônico é mantido como está se o normalizador devolver vazio. Ordenado e deduplicado. **Nunca se extrai tópico de `pending_followups`** — aquele texto é prosa livre, e tirar tópico de prosa é julgamento, não fórmula. |
| 7 | `procedural_playbook.avoid` = procedimentais `active` com `outcome == "backfired"`, ordem `last_observed_at` desc, desempate `fact_id` asc, corte em `PROC_AVOID_CAP`. `procedural_playbook.do` = `active`, `retired != true`, `outcome ∈ {unlocked, partial}`, `target_topic ∈ TOPICS_IN_FOCUS`; ordem `unlocked` antes de `partial`, depois `last_observed_at` desc, desempate `fact_id` asc, corte em `PROC_DO_CAP`. Ambos emitem: `fact_id, procedure_kind, target_topic, how, base_domain, mapping, known_limit, outcome, confidence, last_observed_at, read_as, source_sessions`. |
| 8 | `student_profile.facts` = semânticos `active`, ordem: `topic ∈ TOPICS_IN_FOCUS` primeiro, depois `last_observed_at` desc, desempate `fact_id` asc; corte em `SEMANTIC_FACTS_CAP`. Campos: `fact_id, kind, topic, claim, skill_level, proficiency_state, confidence, observation_type, last_observed_at, needs_reconfirmation, read_as, source_sessions`. |
| 9 | `recent_sessions` = últimas `RECENT_SESSIONS_K` entradas com `digest_eligible != false`, `status != "in_progress"` e **fora de `orphan_sessions`** (uma órfã já é reportada lá, com conteúdo parcial; entrar nos dois lugares é ruído duplicado), em ordem **crescente** (a mais recente por último, colada ao turno atual). Campos: `{session_id, date, topics, one_line_summary (≤160), flags}`. |
| 10 | `recent_affect` = `affect` das últimas `AFFECT_WINDOW` entradas finalizadas, em ordem crescente, descartando `null` **depois** da janela (nada mais antigo entra). |
| 11 | `pending_followups` = do perfil, os de `state == "open"`; mais `open_questions` e `next_steps` lidos dos **brutos** das últimas `TOPIC_WINDOW` sessões finalizadas (no máximo 3 arquivos; ilegível vira `session_unparseable`). Dedupe por texto exato mantendo a primeira ocorrência (ordem: perfil, depois por sessão asc, `open_questions` antes de `next_steps`); ordenação por `created_in_session` asc com desempate pelo índice de inserção; corte em `FOLLOWUP_CAP`. Campos: `{text, created_in_session, origin_field}`. |
| 12 | `full_detail_available = {session_count, date_range: [min, max], index_file, raw_file_pattern, sessions_not_in_recent, top_tags (contagem desc, nome asc, corte em TOP_TAGS), how_to_open}`. `sessions_not_in_recent` é **recalculado a cada passo da escada**, para continuar verdadeiro depois do truncamento. |
| 13 | `memory_state`, nesta ordem de precedência (o primeiro que casar vence): `first_session` → `degraded` (se `errors` contém `index_missing`, `index_unparseable`, `index_stale`, `profile_unparseable`, `session_unparseable` ou `internal_error`) → `warm` (≥5 sessões finalizadas **ou** ≥1 fato `active` no perfil) → `warming_up` (fallback). Serializa na ordem fixa de chaves (`generated_at = NOW`). |
| 14 | Escada de truncamento (§2.5.3). |
| 15 | Imprime em stdout; **sai 0**. |

**`degraded` vem antes de `warm` de propósito:** saber que a base está incompleta muda o que se pode afirmar, e é mais importante do que saber que ela é grande.

**O que o consumidor faz com cada `memory_state`:**

| Valor | O que o `SKILL.md` faz |
|---|---|
| `first_session` | Sessão de **calibração**: perguntar o que o aluno quer, o que já sabe, quais domínios servem de base de analogia. **Nunca** fingir que conhece alguém. |
| `degraded` | Ensinar normalmente, mas **não afirmar** nada sobre histórico sem antes abrir o bruto. Dizer uma vez, em uma linha, o que ficou ilegível — nunca um relatório. |
| `warm` | Caminho normal: usar `student_profile`, `procedural_playbook` e `recent_sessions`; `read_as: "hypothesis"` vira pergunta. |
| `warming_up` | Há histórico, nenhum fato consolidado. Apoiar-se em `recent_sessions` e `pending_followups`; **não** generalizar o aluno a partir de duas aulas. |

**Ordem fixa das 18 chaves de topo:**

```
schema_version, generated_at, for_session_id, memory_state, topics_in_focus, topics_source,
full_detail_available, student, recent_sessions, recent_affect, student_profile,
procedural_playbook, orphan_sessions, pending_followups, truncated, truncated_fields,
budget_exceeded, errors
```

⚑ **São 18 chaves de topo e 19 blocos**: `procedural_playbook` aninha `do` e `avoid`, que são conteúdo dela, não chaves de topo. Esperar 19 **reprova um digest correto** — este era o defeito da invariante I-29 quando escrita.

> **Verificado por execução neste repositório, revisão `df040b5`:** com `memory/` vazia, `memory-digest.sh <root> --now 2026-08-23T10:00:00-03:00 --today 2026-08-23` sai **0** e produz exatamente estas 18 chaves, nesta ordem, com `memory_state: "first_session"`, `for_session_id: "0001"` e todos os blocos vazios.

O que o tutor não pode perder — antipadrões, órfãs e pendências — fica no **fim**, que é a segunda melhor posição de recuperação.

### 2.5.3 A escada de truncamento T1..T5

Enquanto o serializado passar de `BUDGET_CHARS`, aplica-se **um passo por vez, reserializando e remedindo a cada passo**; o rótulo do bloco entra em `truncated_fields[]` (deduplicado, na ordem de primeira ocorrência) e `truncated` vira `true`:

| Passo | Ação | Rótulo em `truncated_fields[]` |
|---|---|---|
| **T1** | remove `recent_sessions` da mais antiga, uma por vez, **até restarem 2** | `recent_sessions` |
| **T2** | remove de `procedural_playbook.do` os itens `outcome == "partial"`, do `last_observed_at` mais antigo para o mais novo (desempate `fact_id` asc) | `procedural_playbook.do` |
| **T3** | remove de `student_profile.facts` os itens `read_as == "hypothesis"`, do mais antigo para o mais novo | `student_profile.facts` |
| **T4** | remove de `student_profile.facts` os itens `confidence == "low"`, do mais antigo para o mais novo | `student_profile.facts` |
| **T5** | corta em **120** caracteres, com `…`, os textos livres de `student_profile.facts[].claim`, `procedural_playbook.do[].how/mapping/known_limit` e `recent_sessions[].one_line_summary` | `text_fields` |

**NUNCA truncados**, em nenhuma circunstância:

- `pending_followups` — promessa feita ao aluno não some por orçamento;
- **`procedural_playbook.avoid`** — os antipadrões (§2.3.4);
- `orphan_sessions` — a sessão interrompida precisa ser oferecida de volta;
- `full_detail_available` — é o inventário que torna honesta a leitura seletiva (§0.3.1);
- o cabeçalho.

Se, esgotados os cinco passos, o orçamento continuar estourado, **o digest é emitido assim mesmo com `budget_exceeded: true`** — e **nunca** falha.

> **DEB-1, dívida declarada.** Isso acontece de verdade: com o playbook cheio (5 `avoid` + 8 `do`, ambos protegidos ou só parcialmente cortáveis), o bloco procedimental sozinho passa de 6 000 caracteres, e a escada **não converge** — os campos que sobrariam para cortar são justamente os protegidos. O comportamento está **correto** (o contrato manda sempre produzir e sempre sair 0); o que está apertado é o **limite**. O que merece revisão é o par (orçamento default, conjunto de campos protegidos) — p. ex. subir `SM_BUDGET_CHARS` ou permitir truncar `procedural_playbook.avoid` a partir de N itens. **Enquanto não for revisto, o gate não pode tratar `budget_exceeded: true` como falha: é saída conforme.**

### 2.5.4 Casos de borda, todos com comportamento definido

| Situação | Comportamento |
|---|---|
| `memory/` inexistente ou vazia (primeira sessão) | `memory_state: "first_session"`, `for_session_id: "0001"`, todos os blocos vazios, **mesma forma de saída**. |
| `INDEX.json` ausente, corrompido ou defasado | Reconstruído **em memória** a partir dos brutos; `errors[]` registra; o digest sai normalmente. Índice é cache, não fonte da verdade. |
| Um `NNNN.json` não parseável | Pula o arquivo, registra `session_unparseable` e segue. **Nunca aborta.** |
| `profile.json` ausente (antes da 1ª compactação) | Blocos de perfil vazios; o digest vive de índice + últimas sessões. É o estado **normal** das primeiras ~15 sessões, e por isso `profile_missing` **não** produz `degraded`. |
| Sessão órfã | Já recuperada por `memory-index.sh --verify` **antes** de o digest rodar. Chega como `abandoned` + `orphan_recovered`, é reportada em `orphan_sessions[]` e **não** entra em `recent_sessions`. |
| Entrada `in_progress` no índice na hora do digest | Sessão **viva** em outro terminal (lock vivo) — o `--verify` não a tocou de propósito. Fica fora dos dois blocos. Quem reage é `open_session`, com exit 4. |
| `errors[]` não vazio | `memory_state: "degraded"`. O digest sai completo; o **consumidor** é que muda de postura. |
| Orçamento estourado | Trunca por T1..T5, informa `truncated_fields[]`; em último caso emite com `budget_exceeded: true`. **Nunca falha.** |

**Exemplo verificado de saída mínima** (`memory/` vazia, revisão `df040b5`):

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-23T10:00:00-03:00",
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

## 2.6 Compactação

### 2.6.1 Gatilho

```
|S| >= profile.compaction.trigger_uncompacted_sessions          (default 15)
S = { entradas do índice com compacted_at == null e status ∈ {completed, abandoned} },
    em ordem crescente de session_id
```

Sessão `abandoned` **entra** em `S` e conta para o limiar — nada se perde, e nada é promovido além do que a evidência sustenta (o teto de `confidence` cuida disso).

> **PERGUNTE AO USUÁRIO (D-M04)** — Sessões `abandoned` entram na compactação?
> A aula que acabou no meio ainda aconteceu. Jogá-la fora é perder evidência real; tratá-la como aula completa é promover conclusão que ninguém terminou de tirar.
> **Opções:** **(a)** entram, contam para o limiar, e travam em `confidence: low` os fatos que só elas sustentam — nada se perde e nada é promovido além do que a evidência sustenta; é uma regra a mais na rotina de compactação · **(b)** ignoradas na consolidação, preservadas no disco — consolidação mais simples, e uma aula interrompida no meio de um avanço real vira história que nunca existiu
> **Default:** **(a)** · **Custo de mudar depois: cheap**

A faixa da pesquisa é 15-20 sessões (ou ~8-10 mil tokens somados); adota-se o **piso** por segurança, e o valor fica em `profile.json` para o usuário ajustar sem tocar em código. A 2-4 sessões por semana, isso é uma compactação a cada ~4 a 10 semanas.

**A verificação roda no fechamento, nunca na abertura** — compactar é operação de modelo e leva tempo; o aluno não deve esperar por ela para começar a aula.

**Sem `INDEX.json` legível o script se recusa a compactar** (com `--if-due`: avisa em stderr e sai 0; sem ela: exit 1). Assumir "nada foi compactado" **duplicaria a cadeia de fatos** — é a mesma armadilha de §2.7, por outra porta.

### 2.6.2 O que a compactação lê — a regra dura

**A compactação nunca lê uma consolidação anterior.** Ela lê **apenas os brutos** de `S`; do perfil, só `claim_key` dos fatos `active` e `next_fact_seq`. Isso elimina a degradação por resumo-de-resumo-de-resumo, que é cumulativa e silenciosa.

### 2.6.3 O ciclo de pedido e resposta

Fase **PEDIDO** (exit 10, `kind: "compact_facts"`, `request_kind: "memory_compact"`) — não escreve **nada** em disco, nem temporário: a validação do PEDIDO contra o request schema usa substituição de processo (`/dev/fd/N`), e por isso `sm_json_validate` precisa aceitar FIFO e ler o arquivo uma vez só (§1.6.3).

```json
{ "schema_version": "1.0", "request_kind": "memory_compact", "setup_id": "<12 hex>",
  "next_fact_seq": N, "existing_claim_keys": ["…"], "sessions": [ … ] }
```

Cada sessão é projetada para o subconjunto exato do request schema (`session_id, date, status, topics, one_line_summary, affect, what_worked, what_didnt_work, skills_observed[], how_it_happened[], open_questions, next_steps`); itens sem os campos obrigatórios são descartados. Bruto ausente ou ilegível fica de fora, **com aviso**.

`request_id` = primeiros 12 hex do `sha256` do payload canônico (`jq -cS`). **`generated_at` fica fora do payload**, no envelope: é o que torna o `request_id` função pura do estado em disco e permite ao `--apply` recalculá-lo (RA-2).

Fase **APPLY** — aceita as duas formas (envelope com `items` de exatamente 1 elemento, ou o objeto nu do response schema). Ordem das checagens, **todas antes de qualquer escrita**:

1. arquivo ausente ou ilegível → **exit 2**;
2. `kind` do envelope != `compact_facts` → exit 5;
3. `request_id` presente e diferente do recalculado a partir do disco → **exit 5** (RA-2);
4. a resposta não valida contra `memory-compact.response.schema.json` → **exit 5** (RA-3);
5. `request_kind` != `memory_compact` → exit 5;
6. **toda `claim_key` casa `^[a-z][a-z0-9_]{1,62}$`** (junção com `_`, sem dois-pontos) → senão exit 5. Esta checagem é feita **pelo próprio script**, não só pelo schema;
7. todo `source_sessions[]` e todo `pending_followups[].created_in_session` pertence a `S` → senão exit 5.

**Caminho degradado** (2 ciclos esgotados): não compacta, não marca nada, e o gatilho reavalia sozinho no próximo fechamento — o que já é correto, porque a condição que adiou continua verdadeira. **Nenhum bruto é perdido.** (Ver L-1 em §1.6.5 sobre `compaction.deferred_at`.)

### 2.6.4 Consolidação — os três casos, e nada mais

Para cada fato da resposta, comparado com o fato **`active` de mesma `claim_key`**:

| Caso | Efeito |
|---|---|
| **não existe** | cria fato novo `active`, `supersedes: null` → `facts_created++` |
| **existe e a afirmação é idêntica** (`claim` para semântico, `how` para procedimental) | **reconfirmação**: atualiza `last_observed_at` (máximo), une `source_sessions`, recalcula `confidence` e `times_observed`. **Não** cria fato novo e **não** supersede → `facts_reconfirmed++` |
| **existe e a afirmação mudou** | o antigo recebe `status: "superseded"` + `superseded_by`; nasce um fato novo `active` com `supersedes` apontando para ele. **O antigo permanece no arquivo** → `facts_created++`, `facts_superseded++` |

Distinguir reconfirmação de mudança é o que impede o `profile.json` de inchar com dezenas de cópias do mesmo fato — ou de nunca mudar.

**A chave de cada candidato é montada por junção com `_`, e é determinística:**

- **semântico**: cada `skills_observed[]` vira `claim_key = "skill_<skill>_level"`; dificuldade repetida vira `difficulty_<topic>`; ponto forte vira `strength_<skill>`;
- **procedimental**: cada `how_it_happened[]` vira `"<procedure_kind>_<target_topic>_<apelido>"`. Os dois primeiros segmentos são **copiados do item**; o `<apelido>` é a **única** parte que precisa de julgamento e vem da RESPOSTA, normalizado por `sm_normalize_concept_id`. **Nenhum script inventa apelido sozinho.**

`fact_id` = `f-NNNN` a partir de `next_fact_seq`, atribuído **pelo script** (semânticos na ordem da resposta, depois procedimentais); **o modelo nunca numera fato**. `observed_at` = `min(datas das source_sessions)`, `last_observed_at` = `max(...)` quando a resposta não os traz; `recorded_at` = agora (transaction time).

**`confidence` é calculada pelo script** — o valor da resposta é advisório e **não entra na conta**:

```
base = 1 sessão distinta → low · 2 → medium · 3+ → high
tetos: observation_type == "inferred"            → no máximo medium
       todas as source_sessions são "abandoned"  → low
       evidence null ou vazia                    → low
confidence = mínimo entre base e os tetos
```

**Por que não aceitar do modelo:** `confidence` é função do **número de sessões que sustentam o fato**, um dado que o script já tem em mãos e o modelo não tem como conferir. Aceitá-lo do modelo transformaria uma contagem em opinião — e é a contagem que AS-9 e MEM-7 consomem.

`pending_followups` da resposta são anexados ao perfil com `state: "open"` quando o texto ainda não existe lá.

### 2.6.5 Escrita — os dois passos são um só

`profile.json` **primeiro**, validado contra `profile.schema.json` **antes** de publicar (falhou → exit 5, nada é escrito); só depois o índice recebe, para cada sessão de `S`, `compacted_at = hoje` e `digest_eligible = false` — **exceto** as **5 sessões de maior `session_id`** do índice, que permanecem `digest_eligible: true`. **Se o perfil falhar, o índice não é marcado.** Ambos por `sm_atomic_write`.

A exceção das 5 mais recentes existe para o bloco `recent_sessions` do digest **não esvaziar logo após uma compactação**.

### 2.6.6 O que é fundido, preservado, arquivado — e o que se perde

| | O que acontece |
|---|---|
| **Fundido** | Observações repetidas da mesma habilidade e do mesmo procedimento colapsam em **um** fato com `source_sessions[]` acumulado e `confidence` recalculada. |
| **Preservado para sempre** | (a) todo `memory/NNNN.json`, byte por byte — nenhum arquivo é editado, movido ou apagado; (b) toda entrada do `INDEX.json`; (c) todo fato `superseded`, com a cadeia `supersedes`/`superseded_by` intacta. |
| **"Arquivado"** | **Nada muda de lugar.** "Arquivar" aqui significa **exclusivamente** virar `digest_eligible: false`: a sessão deixa de ser carregada **por padrão** no digest, e continua acessível por tag, habilidade, data ou flag no índice. É mudança de **política de leitura**, não de armazenamento. |
| **Garantia de não-perda silenciosa** | Toda entrada do índice continua listada; o digest reporta `full_detail_available.sessions_not_in_recent` e `top_tags`. **O tutor sempre sabe que há mais, e por qual chave chegar lá.** |

**O custo real, sem maquiagem:** o que se perde é a presença **automática** da nuance do episódio no contexto. Depois de compactada, a sessão 0042 só chega ao tutor por três rotas: o `one_line_summary` no índice, os fatos que ela sustenta no perfil, ou uma abertura deliberada do arquivo. Se a consolidação destilou mal — perdeu o detalhe de que a analogia do zoom **só** funcionou depois do gráfico, e não isolada —, o erro passa a ser o que o tutor acredita, e a correção depende de alguém reabrir o bruto. Três defesas parciais, nenhuma perfeita: `source_sessions[]` em todo fato, a proibição de resumir resumos, e o `evidence` copiado do episódio de origem.

---

## 2.7 ⭐ A armadilha da reconstrução

**Foi um defeito real, pego em auditoria.** Está aqui porque é reintroduzido por qualquer implementação ingênua de "o índice é reconstruível".

**O problema.** `digest_eligible` e `compacted_at` são estado **da compactação**, não da sessão. **Eles não existem em `session.schema.json`** — nenhum `memory/NNNN.json` os carrega. Reconstruir o índice devolvendo-os ao default (`true` / `null`) faz cada sessão já consolidada parecer não consolidada. Consequências, em cadeia:

1. o gatilho de `memory-compact.sh` (`compacted_at == null`) dispara de novo;
2. a compactação re-consolida fatos que já estavam no perfil;
3. como a `claim` re-destilada raramente sai idêntica à anterior, o caminho seguido é o de **mudança**, não o de reconfirmação;
4. o fato antigo vira `superseded` e nasce um novo — **a cadeia bitemporal duplica a cada reconstrução**.

O resultado é um perfil que cresce sem que nada tenha sido aprendido, e um histórico de supersede que conta uma trajetória que nunca aconteceu.

**A defesa: precedência de recuperação, aplicada entrada a entrada.** Vive no bloco `# >>> OVERLAY-COMPACTACAO`, também **literal nos dois scripts** (`memory-index.sh` e `memory-digest.sh`):

1. **a entrada de mesmo `session_id` no índice atual** — pulada por `--rebuild` e quando o índice não parseia;
2. **`profile.compaction`**: se `session_id <= last_compacted_session_id` **e** `status != "in_progress"`, então
   - `compacted_at = date(last_compacted_at)` — ou a `date` da própria sessão, se o perfil não tiver `last_compacted_at`; **o que não pode é voltar a `null`**;
   - `digest_eligible = (session_id ∈ os 5 maiores session_id do índice)`;
3. **defaults**: `digest_eligible: true`, `compacted_at: null`.

A regra dos **5 maiores `session_id`** é exatamente a mesma que `memory-compact.sh` usa ao marcar o índice (§2.6.5): as 5 sessões mais recentes nunca perdem `digest_eligible`.

**A fonte de verdade da recuperação é o `profile.json`**, não o índice — e é o único lugar onde ela poderia estar, porque é o perfil que sabe até onde a consolidação chegou (`last_compacted_session_id`).

**Limite conhecido e aceito:** o `compacted_at` recuperado é a data da **última** compactação, não a data por lote. Só a distinção `null` × não-`null` carrega significado (é ela que move o gatilho); a data exata por lote não é reconstruível e **não é usada por nenhuma decisão**.

**A invariante que cobra isso (M-05):** *reconstruir o índice de um setup já compactado não devolve nenhuma sessão a "não compactada" nem muda `compaction_count`.* Verificação: apagar `INDEX.json`, rodar `memory-index.sh <root> --verify`, contar quantas entradas ficaram com `compacted_at == null`, e rodar `memory-compact.sh --if-due` — que deve dizer "nada a fazer".

---

## 2.8 Sessão órfã — condição derivada, dono único

**Não existe `status: "orphaned"`.** O vocabulário é `in_progress | completed | abandoned` e nada mais. Órfã é o resultado de uma conta feita em tempo de leitura:

```
órfã(S)  ⇔  S.status == "in_progress"  ∧  ¬lock_vivo(S)

lock_vivo(S) ⇔ existe memory/.session.lock
             ∧ lock.session_id == S.session_id
             ∧ lock.hostname   == hostname desta máquina
             ∧ a validação de dono de §1.7.4 sucede
```

**A segunda metade da conjunção não é detalhe:** sem ela, **toda** sessão `in_progress` seria classificada como órfã e a detecção de sessão concorrente desapareceria — que é exatamente o que o `.session.lock` existe para fazer (exit 4).

**Dono único:** `memory-index.sh <setup_root> --verify` é o **único** componente que finaliza uma órfã automaticamente. `memory-digest.sh` é somente-leitura. `session-close.sh --recover <NNNN>` é a porta **manual** da mesma operação — nunca um segundo caminho automático.

Com lock vivo: **não toca** (é sessão concorrente). Sem lock vivo, na ordem:

1. `status = "abandoned"`; `finalized_at = mtime do arquivo` (ISO com offset); `finalized_by = "auto_orphan_recovery"`;
2. `one_line_summary` **só** é substituído se ainda for o provisório — vazio, `"Sessão iniciada, ainda sem resumo."` ou prefixo `"Sessão em andamento:"` — pelo texto fixo `"Sessão interrompida sem fechamento (recuperada automaticamente)."` **Nenhum outro campo é escrito, nenhum conteúdo é inventado, nenhum campo preenchido é alterado.**
3. O bruto é reescrito por `sm_atomic_write`, preservando a ordem das chaves existentes;
4. A entrada do índice ganha `orphan_recovered` em `flags` (deriva de `finalized_by`);
5. O `.session.lock` morto correspondente é removido.

**A recuperação é automática e silenciosa — nunca pergunta ao aluno.** Sessão interrompida é o modo de falha **mais comum** do sistema em uso real (o aluno fecha o terminal); perguntar "retomar / fechar / descartar" a cada retomada é atrito diário para um caso cuja resposta certa é sempre a mesma: preservar tudo e **oferecer a retomada como primeiro item da agenda** (`plan_lesson`, razão `orphan_resume`).

Três consequências: uma órfã **conta** como sessão para numeração e para o índice, e o `NNNN` dela não é reutilizado; uma órfã **entra** na compactação e conta para o limiar, com o teto de `confidence: low` para fatos que só ela sustenta; e órfãs **nunca** são apagadas nem mescladas na sessão nova.

O valor prático da órfã depende inteiramente do **checkpoint incremental** do passo `teach`: se o `NNNN.json` só fosse escrito no fim, toda órfã seria um arquivo vazio. Por isso o checkpoint é **regra, não otimização**.

---

## 2.9 Os três schemas — verbatim

Transcritos byte a byte do repositório. São a autoridade sobre a forma do dado; as `description` fazem parte do contrato e não devem ser encurtadas ao copiar.

### 2.9.1 `SK/assets/schemas/session.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:study-method:schema:session:1",
  "title": "Registro episodico de uma sessao de estudo (memory/NNNN.json)",
  "description": "Um arquivo por sessao no diretorio memory/ do setup do aluno. E a camada episodica: o que aconteceu, o que foi praticado e COMO isso aconteceu. Criado no inicio da sessao com status in_progress e finalizado no fim. Texto em pt-BR; chaves e valores de enum em ingles snake_case.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "session_id", "date", "status", "one_line_summary"],
  "properties": {
    "schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+$",
      "description": "Versao do schema deste registro, no formato MAJOR.MINOR. Adicionar campo opcional sobe MINOR; tornar campo obrigatorio, renomear ou mudar tipo sobe MAJOR e exige migracao dos arquivos ja escritos."
    },
    "session_id": {
      "type": "string",
      "pattern": "^[0-9]{4}$",
      "description": "Identificador da sessao com 4 digitos zero-padded. E igual ao nome do arquivo sem extensao: session_id 0042 vive em memory/0042.json. Monotonico, nunca reaproveitado."
    },
    "setup_id": {
      "type": "string",
      "pattern": "^[0-9a-f]{12}$",
      "description": "setup_id do setup em que esta sessao aconteceu, copiado de setup.json. Doze digitos hexadecimais minusculos. Redundante de proposito: um memory/NNNN.json copiado ou recuperado de backup continua sabendo a que setup pertence, e cross_setup_refs de outras sessoes podem ser resolvidos sem abrir o manifesto."
    },
    "date": {
      "type": "string",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
      "description": "Data local da sessao (AAAA-MM-DD). E o valid time da observacao: a data em que o fato foi observado no mundo, nao a data em que foi gravado."
    },
    "started_at": {
      "type": ["string", "null"],
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
      "description": "Timestamp ISO 8601 com offset de fuso de quando a sessao comecou. Fracao de segundo opcional. Opcional; null enquanto nao registrado."
    },
    "resumed_at": {
      "type": ["string", "null"],
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
      "description": "Timestamp ISO 8601 da ultima retomada DESTA sessao (o aluno voltou e continuou a mesma sessao em vez de abrir uma nova). Null quando a sessao nunca foi retomada. Retomar nao cria session_id novo: por isso a retomada precisa de carimbo proprio, separado de started_at."
    },
    "finalized_at": {
      "type": ["string", "null"],
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
      "description": "Timestamp ISO 8601 com offset de fuso de quando a sessao foi finalizada. E o transaction time do registro. Null enquanto status for in_progress. Numa sessao fechada por auto_orphan_recovery, este e o carimbo da recuperacao."
    },
    "finalized_by": {
      "enum": ["student", "auto_orphan_recovery", null],
      "description": "Quem fechou a sessao. student: fechamento normal no fim da aula. auto_orphan_recovery: a sessao ficou orfa (aluno fechou o terminal) e foi fechada retroativamente pela sessao seguinte, sem inventar conteudo. Null enquanto in_progress."
    },
    "orphan_recovered_by": {
      "type": ["string", "null"],
      "pattern": "^[0-9]{4}$",
      "description": "session_id da sessao que encontrou esta sessao orfa e a fechou retroativamente. Preenchido junto com status abandoned e finalized_by auto_orphan_recovery; null em qualquer outro caso. Torna a recuperacao auditavel: da para abrir a sessao que fez o fechamento e ver o que ela sabia."
    },
    "status": {
      "enum": ["in_progress", "completed", "abandoned"],
      "description": "Ciclo de vida DESTA SESSAO (nao confundir com o campo status de profile.json, que vale active|superseded e se refere a fatos). in_progress: aberta agora. completed: finalizada normalmente. abandoned: ficou orfa e foi fechada retroativamente pela sessao seguinte."
    },
    "topics": {
      "type": "array",
      "items": {
        "description": "Uma tag de topico em snake_case ASCII sem acento.",
        "type": "string",
        "pattern": "^[a-z][a-z0-9_]{1,62}$"
      },
      "description": "Tags de topico em snake_case ASCII sem acento (ex.: derivadas, erro_numerico, python). Mesmo vocabulario de concept_id, taxonomy e skills_observed[].skill em todo o sistema - identificador so casa por igualdade de string, e duas grafias do mesmo topico sao dois topicos. Sao a chave de busca seletiva: o digest e a recuperacao por tag dependem delas. Omitir equivale a lista vazia."
    },
    "docs_coverage": {
      "enum": ["full", "indexed", "none", null],
      "description": "Quanto do docs/ do setup entrou nesta sessao, decidido no passo load_docs. full: o material coube no orcamento e foi lido inteiro. indexed: acima do orcamento, so as secoes mapeadas ao topico da aula foram carregadas - e o que ficou de fora foi declarado ao aluno. none: nao ha material legivel no docs/ do setup, estado legitimo e nao erro. Null equivale a nao registrado. Mesmo vocabulario de docs-index.json e de setup.json docs_ingest.mode."
    },
    "goal": {
      "type": ["string", "null"],
      "description": "O que o aluno queria conseguir nesta sessao, em uma frase, escrito no inicio da sessao. Serve para o fechamento comparar intencao com resultado."
    },
    "plan": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "description": "Agenda da aula montada no passo plan_lesson e anunciada ao aluno. Persistida porque o estado da sessao nao pode viver so na conversa: depois de uma auto-compactacao do contexto, e daqui que o tutor reconstroi em que ponto da aula estava. Null enquanto a agenda nao foi montada.",
      "properties": {
        "items": {
          "type": "array",
          "description": "Itens da agenda na ordem em que serao atacados. A prioridade que gerou a ordem esta em cada reason.",
          "items": {
            "description": "Um item da agenda da aula, com a razao que o colocou ali.",
            "type": "object",
            "additionalProperties": false,
            "required": ["text", "reason"],
            "properties": {
              "text": {
                "type": "string",
                "description": "O item da agenda em uma frase, em pt-BR, como foi dito ao aluno."
              },
              "reason": {
                "enum": ["orphan_resume", "spaced_review", "student_request", "next_in_taxonomy"],
                "description": "Por que este item entrou na agenda, na ordem de prioridade do passo plan_lesson. orphan_resume: retomada de sessao orfa ou pendencia. spaced_review: conceito com revisao vencida. student_request: o aluno pediu. next_in_taxonomy: proximo no da taxonomia do setup."
              },
              "topic": {
                "type": ["string", "null"],
                "pattern": "^[a-z][a-z0-9_]{1,62}$",
                "description": "Tag de topico em snake_case a que este item se refere, quando ha uma. Deve estar em topics. Null para item sem topico definido."
              },
              "state": {
                "enum": ["planned", "done", "skipped", null],
                "description": "O que aconteceu com o item ate o fechamento. planned: ainda nao atacado. done: cumprido. skipped: deixado de fora por decisao na aula. Null equivale a planned."
              }
            }
          }
        },
        "changed_by_student": {
          "type": ["boolean", "null"],
          "description": "True quando o aluno alterou a agenda proposta. E o registro de que a agenda foi negociada, nao imposta."
        }
      }
    },
    "what_was_done": {
      "type": ["string", "null"],
      "description": "O que foi feito concretamente na sessao (exercicios, codigo escrito, leitura), em 1-3 frases. Fatos observaveis, nao avaliacao."
    },
    "what_was_learned": {
      "type": ["array", "null"],
      "items": {"description": "Uma afirmacao curta, em pt-BR, do que o aluno passou a conseguir fazer ou explicar.",  "type": "string" },
      "description": "O que foi aprendido ou praticado, uma afirmacao curta por item, na voz do que o aluno passou a conseguir fazer ou explicar. Nao repetir o conteudo da aula, so o que mudou nele."
    },
    "how_it_happened": {
      "type": ["array", "null"],
      "items": {
        "description": "Um movimento pedagogico executado na sessao, com o efeito observado.",
        "type": "object",
        "additionalProperties": false,
        "required": ["move_type", "description", "outcome"],
        "properties": {
          "move_type": {
            "enum": ["analogy", "worked_example", "hint_ladder", "socratic_question", "hands_on", "explanation_order", "visualization", "reference_lookup", "spaced_review", "error_autopsy"],
            "description": "Tipo do movimento pedagogico executado. analogy: analogia oferecida. worked_example: exemplo resolvido mostrado. hint_ladder: dica em um nivel da escada de dicas. socratic_question: pergunta que devolve o problema ao aluno. hands_on: o aluno fez com as proprias maos. explanation_order: a ordem escolhida para apresentar as ideias. visualization: grafico, desenho ou diagrama. reference_lookup: consulta a documentacao ou fonte. spaced_review: retomada espacada de conceito antigo. error_autopsy: analise do erro cometido pelo aluno."
          },
          "description": {
            "type": "string",
            "description": "O movimento em 1-2 frases concretas: o que foi feito, nessa ordem, com essas palavras. Este e o COMO. Nao escrever 'expliquei derivadas'; escrever 'plotei x**3 e dei zoom sucessivo ate a curva ficar reta na tela'."
          },
          "target_topic": {
            "type": ["string", "null"],
            "pattern": "^[a-z][a-z0-9_]{1,62}$",
            "description": "Tag do topico que este movimento atacou, em snake_case ASCII sem acento. Deve estar em topics, e o pattern e o MESMO de topics de proposito. REGRA DESAMBIGUADA: identificador de conceito ou topico e snake_case (^[a-z][a-z0-9_]{1,62}$); kebab-case fica so para SLUG DE CAMINHO (setup_name, diretorio de desafio, slug de research). target_topic e identificador de topico, entao e snake_case - e tem de ser, porque a recuperacao compara target_topic com session.topics POR IGUALDADE DE STRING, e com padroes diferentes os dois nunca casariam.  E a chave pela qual o movimento e recuperado numa sessao futura sobre o mesmo assunto, e a mesma que sobrevive ao ser promovida para procedural_facts[].target_topic no perfil."
          },
          "outcome": {
            "enum": ["unlocked", "partial", "no_effect", "backfired"],
            "description": "Efeito observado do movimento. unlocked: destravou (o aluno passou a resolver ou prever sozinho). partial: ajudou mas nao bastou. no_effect: nao mudou nada. backfired: piorou (confundiu, travou, frustrou, ou implantou uma concepcao errada)."
          },
          "evidence": {
            "type": ["string", "null"],
            "description": "O observavel concreto que sustenta o outcome: o que o aluno disse, escreveu ou fez. Sem evidencia, o outcome e opiniao e nunca deve ser promovido a fato procedimental no perfil com confidence acima de low."
          },
          "hint_level": {
            "type": ["integer", "null"],
            "minimum": 0,
            "maximum": 5,
            "description": "Nivel da escada de dicas usado, de 0 (nenhuma dica) a 5 (resposta pronta). Preencher apenas quando move_type for hint_ladder."
          },
          "observation_type": {
            "enum": ["observed", "inferred", null],
            "description": "observed: o efeito foi visto diretamente nesta sessao. inferred: e generalizacao do tutor a partir do que viu. Ausente equivale a observed. Separar os dois evita que inferencia vire fato estabelecido na proxima sessao."
          }
        }
      },
      "description": "MEMORIA PROCEDIMENTAL BRUTA: a sequencia de movimentos pedagogicos desta sessao, na ordem em que aconteceram, cada um com o efeito observado. E o COMO isso aconteceu pedido explicitamente pelo usuario. Registrar tambem os movimentos que falharam: o que nao funcionar e mais barato de reusar do que o que funcionou."
    },
    "skills_observed": {
      "type": ["array", "null"],
      "items": {
        "description": "Uma habilidade observada nesta sessao, com o nivel visto e a evidencia.",
        "type": "object",
        "additionalProperties": false,
        "required": ["skill"],
        "properties": {
          "skill": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]{1,62}$",
            "description": "Nome da habilidade em snake_case ASCII sem acento (ex.: derivadas_conceito, python_funcoes). Mesmo vocabulario de concept_id em progress.json: e por igualdade de string que a habilidade observada aqui encontra o conceito la. Mais granular que topics: um topico pode conter varias habilidades."
          },
          "level": {
            "enum": ["beginner", "intermediate", "advanced", null],
            "description": "Nivel observado da habilidade nesta sessao."
          },
          "confidence": {
            "enum": ["low", "medium", "high", null],
            "description": "Confianca do tutor nesta observacao especifica (nao a confianca do aluno). Uma unica observacao sem evidencia direta nao passa de low."
          },
          "last_observed_at": {
            "type": ["string", "null"],
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            "description": "Data da observacao mais recente desta habilidade. Numa sessao e sempre igual a date; existe aqui para o campo sobreviver identico ao ser promovido para profile.json."
          },
          "evidence": {
            "type": ["string", "null"],
            "description": "O observavel que sustenta o nivel atribuido: o que o aluno resolveu, com quanta dica, com que tipo de erro."
          },
          "observation_type": {
            "enum": ["observed", "inferred", null],
            "description": "observed: visto diretamente nesta sessao. inferred: deduzido de outra coisa. Ausente equivale a observed."
          },
          "proficiency_state": {
            "enum": ["unknown", "fragile", "mastered", null],
            "description": "Estado de proficiencia do conceito. As REGRAS de transicao entre estes valores nao pertencem a este documento: sao definidas pelo documento de proficiencia e repeticao espacada. Aqui o campo e apenas transportado e persistido."
          }
        }
      },
      "description": "Habilidades observadas nesta sessao, com o nivel visto e a evidencia. E a materia-prima da memoria semantica: a compactacao promove estas observacoes a fatos em profile.json."
    },
    "affect": {
      "enum": ["engaged", "frustrated", "confident", "anxious", "unmotivated", "neutral", null],
      "description": "Estado afetivo predominante do aluno nesta sessao. Vocabulario fechado de proposito: texto livre aqui deriva ('chateado', 'desanimado', 'meio pra baixo') e vira irrecuperavel por igualdade de string."
    },
    "affect_note": {
      "type": ["string", "null"],
      "description": "Uma frase sobre o afeto observado, ancorada em comportamento (ficou quieto, parou de perguntar, riu quando funcionou). Nao registrar contexto pessoal, familiar ou de saude alem do necessario para adaptar o ensino."
    },
    "what_worked": {
      "type": ["string", "null"],
      "description": "Resumo em uma frase do que funcionou pedagogicamente nesta sessao. E a versao curta de how_it_happened; existe porque alimenta o digest sem obrigar a abrir o array inteiro."
    },
    "what_didnt_work": {
      "type": ["string", "null"],
      "description": "Resumo em uma frase do que nao funcionou. Campo de alto valor: evita repetir na proxima sessao a abordagem que ja travou o aluno."
    },
    "open_questions": {
      "type": ["array", "null"],
      "items": {"description": "Uma pergunta que ficou em aberto, em pt-BR.",  "type": "string" },
      "description": "Perguntas que ficaram em aberto ao fim da sessao, uma por item. Entram no digest da sessao seguinte como pendencia, nunca truncadas pelo orcamento."
    },
    "next_steps": {
      "type": ["array", "null"],
      "items": {"description": "Um proximo passo combinado com o aluno, uma acao concreta.",  "type": "string" },
      "description": "Proximos passos combinados com o aluno, uma acao concreta por item. Tambem entram no digest da sessao seguinte como pendencia."
    },
    "artifacts": {
      "type": ["array", "null"],
      "items": {
        "description": "Um arquivo criado ou alterado nesta sessao dentro do setup do aluno.",
        "type": "object",
        "additionalProperties": false,
        "required": ["path", "kind"],
        "properties": {
          "path": {
            "type": "string",
            "description": "Caminho relativo a raiz do setup do aluno (ex.: challenges/0007-derivada-numerica.py). Nunca caminho absoluto: o setup pode ser movido."
          },
          "kind": {
            "enum": ["challenge", "research", "doc", "viz", "other"],
            "description": "Tipo do artefato produzido. challenge: arquivo em challenges/. research: arquivo em researchs/. doc: arquivo no docs/ do setup do aluno. viz: visualizacao gerada. other: qualquer outro."
          }
        }
      },
      "description": "Arquivos criados ou alterados nesta sessao dentro do setup do aluno. Permite que uma sessao futura reabra o que foi feito sem depender de memoria textual."
    },
    "cross_setup_refs": {
      "type": ["array", "null"],
      "description": "Leituras cruzadas feitas nesta sessao: outros setups do aluno cujo README.md foi aberto para sustentar a aula de hoje. Preenchido no passo teach e gravado no fechamento. Omitir ou null equivale a lista vazia. E a origem da secao pontes do README.md dos dois setups envolvidos: sem esta lista, a ponte nao existe. Referencia cruzada silenciosa e indistinguivel de alucinacao - por isso ela e registrada aqui e anunciada ao aluno.",
      "items": {
        "description": "Uma leitura cruzada: outro setup do aluno cujo README.md foi aberto para sustentar esta aula.",
        "type": "object",
        "additionalProperties": false,
        "required": ["setup_id", "setup_name", "sections_read", "reason"],
        "properties": {
          "setup_id": {
            "type": "string",
            "pattern": "^[0-9a-f]{12}$",
            "description": "setup_id do setup lido. E a identidade estavel: o caminho no disco pode mudar, este campo nao."
          },
          "setup_name": {
            "type": "string",
            "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
            "description": "Handle legivel do setup lido no momento da leitura, em kebab-case, copiado do manifesto daquele setup. Cache humano: se o setup for renomeado depois, este campo guarda como ele se chamava aqui."
          },
          "sections_read": {
            "type": "array",
            "description": "Secoes do README.md do outro setup que foram efetivamente lidas. Nomes das secoes do template de README do setup: taxonomia, base-teorica, estado-atual, linha-do-tempo, pontes. So taxonomia, base-teorica e estado-atual entram no contexto da aula.",
            "items": {
              "type": "string",
              "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
              "description": "Nome da secao lida, em slug kebab-case sem acento."
            }
          },
          "reason": {
            "type": "string",
            "description": "Por que a ponte existe, em uma frase curta em pt-BR (ex.: 'mudanca de variavel <-> mudanca de base'). E o texto que readme-sync.sh promove para a secao pontes dos dois README.md."
          }
        }
      }
    },
    "one_line_summary": {
      "type": "string",
      "maxLength": 160,
      "description": "OBRIGATORIO. Uma unica frase, ate 160 caracteres, que responde 'o que aconteceu nesta sessao'. E o campo que alimenta o INDEX.json e o unico texto desta sessao que o digest carrega por padrao nas sessoes seguintes. No momento da criacao (status in_progress) recebe um valor provisorio e e reescrito na finalizacao."
    },
    "raw_notes": {
      "type": ["string", "null"],
      "description": "Anotacoes brutas da sessao (trechos de dialogo, transcricao parcial de exercicio). Nunca entra no digest; so e lido quando o arquivo e aberto sob demanda. Persistir ou nao e decisao aberta de privacidade (D-M05)."
    },
    "validation_errors": {
      "type": ["array", "null"],
      "description": "Erros que sobraram quando a sessao foi fechada mesmo sem validar contra este schema. O fechamento tenta no maximo duas vezes pedir os campos faltantes; depois disso fecha assim mesmo e registra aqui o que ficou errado - nenhuma sessao pode ficar presa em in_progress por causa de validacao. Lista vazia ou null significa que o arquivo validou. Uma sessao com esta lista nao vazia e material bruto degradado: a compactacao pode consolida-la, mas nao deve promover fato a confidence alta a partir dela.",
      "items": {
        "type": "string",
        "description": "Um erro por item, no formato '<campo>: <motivo>' (ex.: 'one_line_summary: ausente'). Texto curto e factual, produzido pelo verificador, nunca julgamento do tutor."
      }
    }
  }
}
```

### 2.9.2 `SK/assets/schemas/index.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:study-method:schema:index:1",
  "title": "Indice incremental das sessoes (memory/INDEX.json)",
  "description": "Arquivo derivado, pequeno e append-only, com UMA entrada por sessao. Lido por inteiro no inicio de toda sessao, no lugar dos arquivos brutos. Todo campo aqui e derivavel mecanicamente do memory/NNNN.json correspondente: se um campo exigir julgamento de LLM para ser preenchido, ele nao pertence a este arquivo. Pode ser reconstruido do zero varrendo memory/*.json.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "updated_at", "sessions"],
  "properties": {
    "schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+$",
      "description": "Versao do schema do indice, formato MAJOR.MINOR. Independente da versao do schema de sessao."
    },
    "updated_at": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
      "description": "Timestamp ISO 8601 com offset de fuso da ultima escrita no indice, com fracao de segundo opcional. Mesmo pattern de todo campo *_at do sistema. Se for anterior ao mtime de algum memory/NNNN.json, o indice esta defasado e deve ser reconstruido - e por isso este campo precisa ser comparavel, nao so legivel."
    },
    "sessions": {
      "type": "array",
      "description": "Entradas ordenadas por session_id crescente. A ordem e o contrato: o digest le desta lista de tras para frente para pegar as sessoes mais recentes.",
      "items": {
        "description": "Uma entrada de indice, derivada mecanicamente de um memory/NNNN.json.",
        "type": "object",
        "additionalProperties": false,
        "required": ["session_id", "file", "date", "status", "one_line_summary"],
        "properties": {
          "session_id": {
            "type": "string",
            "pattern": "^[0-9]{4}$",
            "description": "Derivado de session.session_id. Chave primaria da entrada; unico em toda a lista."
          },
          "file": {
            "type": "string",
            "pattern": "^memory/[0-9]{4}\\.json$",
            "description": "Derivado: 'memory/' + session_id + '.json'. Caminho relativo a raiz do setup do aluno. Redundante de proposito, para que a entrada seja auto-suficiente quando lida sozinha."
          },
          "date": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            "description": "Derivado de session.date. Chave de busca por periodo."
          },
          "status": {
            "enum": ["in_progress", "completed", "abandoned"],
            "description": "Derivado de session.status. Uma entrada in_progress encontrada no inicio de uma nova sessao caracteriza sessao orfa."
          },
          "topics": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_]{1,62}$",
              "description": "Tag de topico em snake_case ASCII sem acento, copiada sem transformacao de session.topics."
            },
            "description": "Derivado de session.topics (lista vazia se ausente). Chave de busca seletiva por assunto. Mesmo vocabulario snake_case de session.topics: o indice e derivado, nunca renormaliza."
          },
          "skills_touched": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9_]{1,62}$",
              "description": "Nome de habilidade em snake_case ASCII sem acento, copiado sem transformacao de session.skills_observed[].skill."
            },
            "description": "Derivado: valores distintos de session.skills_observed[].skill, ordenados alfabeticamente. Permite achar todas as sessoes que tocaram uma habilidade sem abrir arquivo nenhum."
          },
          "one_line_summary": {
            "type": "string",
            "maxLength": 160,
            "description": "Derivado de session.one_line_summary, truncado em 160 caracteres. E o unico texto livre do indice."
          },
          "affect": {
            "enum": ["engaged", "frustrated", "confident", "anxious", "unmotivated", "neutral", null],
            "description": "Derivado de session.affect. Presente no indice porque afeto e volatil e so as ultimas sessoes importam: o digest le daqui, sem abrir arquivo bruto."
          },
          "flags": {
            "type": "array",
            "items": {
              "description": "Uma flag do vocabulario fechado, emitida por regra fixa sobre o conteudo da sessao.",
              "enum": ["has_unlock", "has_backfire", "has_open_questions", "has_next_steps", "orphan_recovered"]
            },
            "description": "Vocabulario fechado, derivado por regra fixa e emitido nesta ordem. has_unlock: algum how_it_happened[].outcome == unlocked. has_backfire: algum outcome == backfired. has_open_questions: open_questions nao vazio. has_next_steps: next_steps nao vazio. orphan_recovered: finalized_by == auto_orphan_recovery."
          },
          "digest_eligible": {
            "type": "boolean",
            "description": "Se true, o one_line_summary desta sessao pode entrar no bloco recent_sessions do digest. A compactacao marca false nas sessoes ja consolidadas no perfil: o arquivo continua no disco e continua acessivel por tag ou data, so deixa de ser carregado por padrao. Ausente equivale a true."
          },
          "compacted_at": {
            "type": ["string", "null"],
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            "description": "Data em que esta sessao foi consolidada no profile.json. Null significa ainda nao compactada; a contagem de nao compactadas e o gatilho da compactacao."
          },
          "cross_setup_refs": {
            "type": "array",
            "description": "Derivado de session.cross_setup_refs (lista vazia se ausente). Existe aqui porque a secao pontes do README.md do setup e montada varrendo o indice: sem este campo, a ponte exigiria abrir todos os memory/NNNN.json. Ordem preservada da sessao de origem.",
            "items": {
              "description": "Uma leitura cruzada feita naquela sessao, copiada de session.cross_setup_refs.",
              "type": "object",
              "additionalProperties": false,
              "required": ["setup_id", "setup_name", "sections_read", "reason"],
              "properties": {
                "setup_id": {
                  "type": "string",
                  "pattern": "^[0-9a-f]{12}$",
                  "description": "Derivado: setup_id do setup lido. Chave estavel da ponte, imune a renomeacao e a mudanca de caminho."
                },
                "setup_name": {
                  "type": "string",
                  "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
                  "description": "Derivado: handle kebab-case do setup lido, como ele se chamava no momento da leitura."
                },
                "sections_read": {
                  "type": "array",
                  "description": "Derivado: secoes do README.md do outro setup que foram lidas.",
                  "items": {
                    "type": "string",
                    "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
                    "description": "Nome da secao lida, em slug kebab-case sem acento."
                  }
                },
                "reason": {
                  "type": "string",
                  "description": "Derivado: por que a ponte existe, em uma frase. E o texto que aparece na secao pontes dos dois README.md."
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### 2.9.3 `SK/assets/schemas/profile.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:study-method:schema:profile:1",
  "title": "Perfil consolidado do aluno (memory/profile.json)",
  "description": "Camada consolidada e bitemporal: memoria SEMANTICA (o que e verdade sobre o aluno) e memoria PROCEDIMENTAL (o que funciona com ESTE aluno). Escrito apenas pela compactacao, a partir dos memory/NNNN.json brutos. Um fato NUNCA e sobrescrito: quando muda, o antigo recebe status superseded e superseded_by, e um fato novo com o mesmo claim_key nasce active.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "updated_at", "next_fact_seq", "semantic_facts", "procedural_facts"],
  "properties": {
    "schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+$",
      "description": "Versao do schema do perfil, formato MAJOR.MINOR. Independente das versoes de sessao e indice."
    },
    "updated_at": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
      "description": "Timestamp ISO 8601 com offset de fuso da ultima escrita no perfil (ou seja, da ultima compactacao). Fracao de segundo opcional. Mesmo pattern de todo campo *_at do sistema."
    },
    "student": {
      "type": "object",
      "additionalProperties": false,
      "description": "Dados minimos do aluno. Principio de minimizacao: se um campo nao torna a proxima aula melhor, ele nao entra aqui.",
      "properties": {
        "display_name": {
          "type": ["string", "null"],
          "description": "Como o aluno quer ser chamado. Opcional e removivel a qualquer momento; nao registrar nome completo, escola, idade ou qualquer identificador que nao sirva a pedagogia."
        },
        "goals": {
          "type": "array",
          "items": {"description": "Um objetivo declarado pelo aluno, em pt-BR, em uma frase.",  "type": "string" },
          "description": "Objetivos declarados pelo aluno, um por item (ex.: 'entender calculo o suficiente para ler papers de ML')."
        },
        "known_base_domains": {
          "type": "array",
          "items": {"description": "Um dominio que o aluno ja domina estruturalmente e que pode servir de base para analogias.",  "type": "string" },
          "description": "Dominios que o aluno ja domina estruturalmente e que servem de base para analogias (ex.: xadrez, cozinha, musica, futebol). Uma analogia so funciona se a base for algo que ele conhece de verdade; este campo evita chutar a base a cada sessao."
        }
      }
    },
    "decay_policy": {
      "type": "object",
      "additionalProperties": false,
      "description": "Limiares em dias para o calculo DERIVADO de needs_reconfirmation. needs_reconfirmation nao e persistido e nao e um terceiro valor de status: e calculado a cada digest como (hoje - last_observed_at) > limiar do tipo do fato.",
      "properties": {
        "skill_fact_days": {
          "type": "integer",
          "minimum": 1,
          "description": "Dias sem reobservacao a partir dos quais um fato semantico de habilidade vira hipotese a reconfirmar. Default 60."
        },
        "procedural_fact_days": {
          "type": "integer",
          "minimum": 1,
          "description": "Dias sem reobservacao a partir dos quais um fato procedimental vira hipotese a reconfirmar. Default 180: uma analogia que pegou envelhece mais devagar que um nivel de habilidade."
        },
        "preference_fact_days": {
          "type": "integer",
          "minimum": 1,
          "description": "Dias sem reobservacao a partir dos quais uma preferencia declarada vira hipotese a reconfirmar. Default 180."
        }
      }
    },
    "compaction": {
      "type": "object",
      "additionalProperties": false,
      "description": "Estado e politica da compactacao ciclica.",
      "properties": {
        "trigger_uncompacted_sessions": {
          "type": "integer",
          "minimum": 1,
          "description": "Numero de sessoes com compacted_at null que dispara uma compactacao. Default 15 (faixa 15-20 da pesquisa; o menor valor da faixa e o default por seguranca)."
        },
        "last_compacted_at": {
          "type": ["string", "null"],
          "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
          "description": "Timestamp ISO 8601 da ultima compactacao, com fracao de segundo opcional. Null se nunca rodou."
        },
        "last_compacted_session_id": {
          "type": ["string", "null"],
          "pattern": "^[0-9]{4}$",
          "description": "session_id mais alto ja consolidado no perfil. Todas as sessoes acima deste id ainda estao apenas na camada episodica."
        },
        "compaction_count": {
          "type": "integer",
          "minimum": 0,
          "description": "Quantas compactacoes ja rodaram. Serve so para auditoria."
        },
        "deferred_at": {
          "type": ["string", "null"],
          "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
          "description": "Timestamp ISO 8601 de quando memory-compact.sh entrou no caminho degradado (docs/00-contratos.md SS6.4: os 2 ciclos PEDIDO/RESPOSTA se esgotaram e o script nao compactou). Nenhum bruto e perdido - as sessoes continuam com compacted_at null e o gatilho reavalia no proximo fechamento. Null quando nao ha adiamento pendente; gravado de novo a cada vez que o caminho degradado se repete, e limpo (volta a null) na proxima compactacao bem-sucedida."
        }
      }
    },
    "next_fact_seq": {
      "type": "integer",
      "minimum": 1,
      "description": "Proximo numero sequencial a usar ao criar um fact_id (semantico ou procedimental compartilham o mesmo contador). Incrementado a cada fato criado; nunca reaproveitado, nem para fatos superseded."
    },
    "semantic_facts": {
      "type": "array",
      "description": "MEMORIA SEMANTICA: o que e verdade sobre o aluno, derivado de multiplas sessoes. Inclui os fatos active e todo o historico superseded (nunca apagar; auditoria e 'quando isso mudou' sao informacao pedagogica).",
      "items": {
        "description": "Um fato semantico sobre o aluno, com a espinha bitemporal completa e as sessoes que o sustentam.",
        "type": "object",
        "additionalProperties": false,
        "required": ["fact_id", "claim_key", "kind", "claim", "observation_type", "confidence", "observed_at", "recorded_at", "last_observed_at", "status", "source_sessions"],
        "properties": {
          "fact_id": {
            "type": "string",
            "pattern": "^f-[0-9]{4}$",
            "description": "Identificador unico do fato, 4 digitos zero-padded a partir de next_fact_seq. Nunca reaproveitado."
          },
          "claim_key": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]{1,62}$",
            "description": "Chave estavel do que esta sendo afirmado, em snake_case ASCII sem acento, formada juntando dominio, alvo e (quando houver) aspecto com underscore: skill_derivadas_conceito_level, difficulty_recursao, strength_python_funcoes. Um unico identificador snake_case, sem dois-pontos: e o mesmo vocabulario de concept_id, topics e skill em todo o sistema, e chave que atravessa arquivos nao pode ter duas gramaticas. REGRA DE SUPERSEDE: um fato novo supersede o fato active de MESMO claim_key, e apenas esse - a comparacao e igualdade de string, nada mais. Dois fatos sobre o mesmo topico com claim_key diferente coexistem sem conflito."
          },
          "kind": {
            "enum": ["strength", "difficulty", "preference", "skill_level", "context"],
            "description": "Natureza do fato. strength: ponto forte. difficulty: dificuldade recorrente. preference: preferencia declarada de como estudar. skill_level: nivel em uma habilidade. context: circunstancia relevante e nao sensivel (ex.: 'estuda de madrugada, cansado')."
          },
          "topic": {
            "type": ["string", "null"],
            "pattern": "^[a-z][a-z0-9_]{1,62}$",
            "description": "Tag do topico ou habilidade a que o fato se refere, em snake_case ASCII sem acento. E a chave pela qual o digest seleciona fatos relevantes para a sessao de hoje, casando com session.topics por igualdade de string - por isso a grafia tem de ser a mesma dos dois lados."
          },
          "claim": {
            "type": "string",
            "maxLength": 240,
            "description": "A afirmacao em pt-BR, uma frase, ate 240 caracteres. Deve ser falsificavel: 'erra o caso base em recursao' e util; 'tem dificuldade com programacao' nao."
          },
          "observation_type": {
            "enum": ["observed", "inferred"],
            "description": "observed: sustentado por evidencia direta em pelo menos uma sessao. inferred: generalizacao do tutor. Um fato inferred NAO pode nascer com confidence high; so sobe apos reconfirmacao em outra sessao."
          },
          "confidence": {
            "enum": ["low", "medium", "high"],
            "description": "Confianca no fato. low: uma observacao unica ou inferida. medium: observado em duas sessoes distintas. high: observado em tres ou mais sessoes distintas, com evidencia."
          },
          "observed_at": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            "description": "VALID TIME inicial: a data da sessao em que o fato foi observado pela primeira vez."
          },
          "recorded_at": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
            "description": "TRANSACTION TIME: timestamp ISO 8601 de quando o fato foi gravado no arquivo (isto e, da compactacao que o criou), com fracao de segundo opcional. Pode ser muito posterior a observed_at - e essa distancia e justamente o que torna a pergunta 'o que o tutor sabia no dia X?' respondivel."
          },
          "last_observed_at": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            "description": "Data da reobservacao mais recente do fato. E o que faz o decaimento funcionar: um fato nunca reconfirmado envelhece e vira hipotese, em vez de virar rotulo permanente do aluno."
          },
          "status": {
            "enum": ["active", "superseded"],
            "description": "active: e o que vale hoje sobre este claim_key. superseded: foi substituido por um fato mais novo, e permanece no arquivo como historico. Nao existe um terceiro valor para 'envelhecido': isso e derivado de last_observed_at."
          },
          "superseded_by": {
            "type": ["string", "null"],
            "pattern": "^f-[0-9]{4}$",
            "description": "fact_id do fato que substituiu este. Obrigatoriamente preenchido quando status for superseded, e null quando active."
          },
          "supersedes": {
            "type": ["string", "null"],
            "pattern": "^f-[0-9]{4}$",
            "description": "fact_id do fato que este substituiu. Null quando o fato e a primeira afirmacao sobre o claim_key."
          },
          "source_sessions": {
            "type": "array",
            "minItems": 1,
            "items": {
              "description": "session_id de uma sessao que sustenta o fato, quatro digitos zero-padded.",
              "type": "string",
              "pattern": "^[0-9]{4}$"
            },
            "description": "session_id de todas as sessoes que sustentam este fato, ordenados. E o que torna o perfil auditavel e re-derivavel: a partir daqui sempre da para abrir o episodio bruto e conferir se a consolidacao foi honesta."
          },
          "evidence": {
            "type": ["string", "null"],
            "description": "O observavel mais forte que sustenta o fato, copiado da sessao de origem. Um fato sem evidencia nao pode passar de confidence low."
          },
          "skill_level": {
            "enum": ["beginner", "intermediate", "advanced", null],
            "description": "Nivel consolidado, preenchido apenas quando kind for skill_level."
          },
          "proficiency_state": {
            "enum": ["unknown", "fragile", "mastered", null],
            "description": "Estado de proficiencia consolidado. As regras de transicao e de regressao por tempo pertencem ao documento de proficiencia e repeticao espacada; aqui o valor e apenas persistido e transportado para o digest."
          }
        }
      }
    },
    "procedural_facts": {
      "type": "array",
      "description": "MEMORIA PROCEDIMENTAL: o COMO. O que funciona (e o que nunca mais deve ser tentado) com ESTE aluno especifico. Cada entrada e destilada de um ou mais how_it_happened[] das sessoes brutas e segue a mesma espinha bitemporal dos fatos semanticos.",
      "items": {
        "description": "Um procedimento consolidado: o que funciona (ou o que prejudica) com este aluno, em nivel de receita executavel.",
        "type": "object",
        "additionalProperties": false,
        "required": ["fact_id", "claim_key", "procedure_kind", "how", "outcome", "observation_type", "confidence", "observed_at", "recorded_at", "last_observed_at", "status", "source_sessions"],
        "properties": {
          "fact_id": {
            "type": "string",
            "pattern": "^f-[0-9]{4}$",
            "description": "Identificador unico, do mesmo contador next_fact_seq dos fatos semanticos."
          },
          "claim_key": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]{1,62}$",
            "description": "Chave estavel em snake_case ASCII sem acento, formada juntando procedure_kind, topico e apelido com underscore: analogy_derivadas_zoom_local, presentation_order_limites_formalismo_primeiro. Mesmo vocabulario e mesmo pattern do claim_key semantico. Mesma regra de supersede: so substitui o fato active de claim_key identico, por igualdade de string."
          },
          "procedure_kind": {
            "enum": ["analogy", "explanation_path", "presentation_order", "hands_on_activity", "hint_strategy", "visualization", "antipattern"],
            "description": "Tipo de procedimento consolidado. analogy: analogia com dominio-base validado. explanation_path: caminho de explicacao que funcionou. presentation_order: ordem de apresentacao das ideias. hands_on_activity: atividade que o aluno precisou fazer com as proprias maos. hint_strategy: forma de dar dica que funciona com ele. visualization: recurso visual que destravou. antipattern: procedimento que comprovadamente prejudica (sempre com outcome backfired)."
          },
          "target_topic": {
            "type": ["string", "null"],
            "pattern": "^[a-z][a-z0-9_]{1,62}$",
            "description": "Topico ao qual o procedimento se aplica, em snake_case ASCII sem acento. REGRA DESAMBIGUADA: identificador de conceito ou topico e snake_case (^[a-z][a-z0-9_]{1,62}$); kebab-case fica so para SLUG DE CAMINHO (setup_name, diretorio de desafio, slug de research). target_topic e identificador de topico, entao e snake_case - e tem de ser, porque a recuperacao compara target_topic com session.topics POR IGUALDADE DE STRING, e com padroes diferentes os dois nunca casariam. Chave de recuperacao: o digest seleciona os procedimentos cujo target_topic bate com os topicos da sessao de hoje, por igualdade de string com session.topics e com how_it_happened[].target_topic da sessao de origem."
          },
          "how": {
            "type": "string",
            "maxLength": 400,
            "description": "O COMO, em ate 400 caracteres e em nivel de receita executavel: o que fazer, em que ordem, com que palavras. Deve ser reexecutavel numa proxima sessao sem consultar o episodio bruto. 'Plotar a funcao e dar zoom sucessivo ate a curva ficar reta antes de qualquer formula' e executavel; 'usar visualizacao' nao e."
          },
          "base_domain": {
            "type": ["string", "null"],
            "description": "Para analogias: o dominio que o aluno ja domina e que serve de base do mapeamento (ex.: velocimetro do carro, receita de cozinha). Null para os demais procedure_kind."
          },
          "mapping": {
            "type": ["string", "null"],
            "description": "Para analogias: o mapeamento RELACIONAL explicito, nao a etiqueta. O que importa e a relacao preservada ('a taxa media vira instantanea quando o trecho encolhe'), nao a semelhanca de aparencia. Analogia sem mapeamento relacional registrado tende a ser reintroduzida errada."
          },
          "known_limit": {
            "type": ["string", "null"],
            "description": "Onde a analogia ou o procedimento para de valer e passa a implantar concepcao errada (transferencia negativa). Registrar isto e o que permite marcar o limite ANTES do aluno esticar a analogia longe demais."
          },
          "validated": {
            "type": ["boolean", "null"],
            "description": "True apenas quando o aluno USOU o procedimento para prever ou resolver um caso NOVO, nao quando apenas repetiu de volta o que ouviu. Null quando ainda nao foi testado dessa forma."
          },
          "retired": {
            "type": ["boolean", "null"],
            "description": "True quando o aluno passou a resolver o assunto sem precisar do procedimento. Um andaime mantido depois de desnecessario vira ruido; o digest nao carrega procedimentos aposentados."
          },
          "outcome": {
            "enum": ["unlocked", "partial", "no_effect", "backfired"],
            "description": "Efeito consolidado do procedimento, com a mesma semantica de how_it_happened[].outcome na sessao. Entradas backfired sao as mais valiosas do arquivo e nunca sao truncadas pelo orcamento do digest."
          },
          "times_observed": {
            "type": "integer",
            "minimum": 1,
            "description": "Em quantas sessoes distintas este procedimento foi observado com o mesmo outcome. E o que sustenta o valor de confidence."
          },
          "observation_type": {
            "enum": ["observed", "inferred"],
            "description": "observed: o efeito foi visto diretamente. inferred: generalizacao do tutor. Um procedimento inferred nao pode nascer com confidence high."
          },
          "confidence": {
            "enum": ["low", "medium", "high"],
            "description": "low: observado em uma sessao. medium: duas sessoes distintas. high: tres ou mais, com evidencia."
          },
          "observed_at": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            "description": "VALID TIME inicial: data da sessao em que o procedimento foi observado pela primeira vez."
          },
          "recorded_at": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$",
            "description": "TRANSACTION TIME: timestamp ISO 8601 de quando o registro foi gravado pela compactacao, com fracao de segundo opcional."
          },
          "last_observed_at": {
            "type": "string",
            "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
            "description": "Data da ultima vez que o procedimento foi usado e teve o efeito observado. Base do calculo derivado de needs_reconfirmation."
          },
          "status": {
            "enum": ["active", "superseded"],
            "description": "active: vale hoje. superseded: substituido por registro mais novo de mesmo claim_key, preservado como historico."
          },
          "superseded_by": {
            "type": ["string", "null"],
            "pattern": "^f-[0-9]{4}$",
            "description": "fact_id do registro que substituiu este. Preenchido quando status for superseded."
          },
          "supersedes": {
            "type": ["string", "null"],
            "pattern": "^f-[0-9]{4}$",
            "description": "fact_id do registro substituido por este. Null na primeira versao."
          },
          "source_sessions": {
            "type": "array",
            "minItems": 1,
            "items": {
              "description": "session_id de uma sessao que sustenta o procedimento, quatro digitos zero-padded.",
              "type": "string",
              "pattern": "^[0-9]{4}$"
            },
            "description": "session_id de todas as sessoes que sustentam este procedimento. Torna a consolidacao auditavel e re-derivavel a partir do bruto."
          },
          "evidence": {
            "type": ["string", "null"],
            "description": "O observavel mais forte copiado da sessao de origem: o que o aluno disse, escreveu ou previu que comprova o outcome."
          }
        }
      }
    },
    "pending_followups": {
      "type": "array",
      "description": "Pendencias explicitas que atravessam sessoes (promessas feitas ao aluno, perguntas nao respondidas). Sao carregadas integralmente no digest e nunca truncadas pelo orcamento.",
      "items": {
        "description": "Uma pendencia que atravessa sessoes, com a sessao em que nasceu e o estado atual.",
        "type": "object",
        "additionalProperties": false,
        "required": ["text", "created_in_session", "state"],
        "properties": {
          "text": {
            "type": "string",
            "maxLength": 240,
            "description": "A pendencia em uma frase acionavel."
          },
          "created_in_session": {
            "type": "string",
            "pattern": "^[0-9]{4}$",
            "description": "session_id em que a pendencia nasceu."
          },
          "state": {
            "enum": ["open", "done", "dropped"],
            "description": "Estado da pendencia. Chama-se state, e nao status, para nao criar um terceiro significado do nome status neste projeto. open: ainda pendente. done: cumprida. dropped: descartada por decisao explicita."
          },
          "closed_in_session": {
            "type": ["string", "null"],
            "pattern": "^[0-9]{4}$",
            "description": "session_id em que a pendencia foi cumprida ou descartada. Null enquanto open."
          },
          "origin_field": {
            "enum": ["open_questions", "next_steps", "manual", null],
            "description": "De qual campo da sessao a pendencia veio, para auditoria da derivacao."
          }
        }
      }
    }
  }
}
```

---

## 2.10 Privacidade

### 2.10.1 O que nunca persistir

| Regra | Texto |
|---|---|
| **PRIV-1** † | `memory/` só recebe o que veio (a) da conversa com o aluno ou (b) de resultado de execução de teste — **nunca de conteúdo de arquivo**. |
| **PRIV-2** † | Nunca persista saúde, diagnóstico, família, finanças, trabalho, jurídico, religião, orientação, nome de terceiro, credencial, metadado de máquina, ou juízo de valor sobre a pessoa — grave a **adaptação**, nunca a causa. |
| **PRIV-3** † | `raw_notes` é sempre `null`; `affect`/`affect_note` só com consentimento na criação do setup, e `affect_note` descreve o **gatilho pedagógico**, nunca a circunstância de vida. |
| **PRIV-4** † | Desabafo: acolha em 1–2 frases e adapte a aula · **não persista a causa em campo nenhum** · persista no máximo a consequência acionável em `pending_followups`, datada e genérica · não puxe o assunto na sessão seguinte. |
| **PRIV-5** | **Crivo de 4 perguntas** por campo de texto livre (uso · efeito sem causa · leitura em voz alta daqui a um ano · terceiros); reprovou em uma → o campo vai `null`, **nunca numa versão suavizada**. |
| **PRIV-6** | Fato nunca é sobrescrito: novo registro com o mesmo `claim_key` + `superseded_by` no antigo. Purga é operação **separada** (§2.10.2). |
| **PRIV-7** | Teto de **~3 fatos semânticos novos por sessão**; todo fato carrega `evidence`; **nunca inferir a partir de um `inferred`**. |

> **PERGUNTE AO USUÁRIO (D-M09)** — Até onde o tutor pode registrar contexto emocional: só o que dá para observar no comportamento, ou também o que o aluno contar sobre a própria vida?
> É a diferença entre o professor anotar "travou nos três exercícios de limite" e anotar "estava mal porque o pai está doente". A primeira anotação calibra a próxima aula; a segunda é dado de saúde de terceiros num arquivo de estudo. Apertar depois é fácil; desfazer o que já foi gravado, não.
> **Opções:** **(a)** só ancorado em comportamento observável, sem família, saúde ou terceiros nomeados — calibra ritmo sem virar prontuário, e o limite é verificável ("isso apareceu no exercício?"); perde nuance que às vezes explicaria uma aula ruim · **(b)** só o afeto categórico, sem nota em texto livre — risco mínimo, e um enum não distingue "cansado" de "frustrado com a notação" · **(c)** qualquer contexto que o aluno mencionar — contexto rico, e grava dado de saúde e de terceiros num arquivo que não foi feito para isso
> **Default:** **(a)** · **Custo de mudar depois: expensive**

Teste de uma frase para qualquer campo: *"isso torna a próxima aula melhor?"* Se não, não entra. `affect_note` passa quando ancorado em comportamento observável ("parou de perguntar depois do formalismo"); **não passa** quando vira relato de vida.

### 2.10.2 Supersede ≠ apagamento

São operações **diferentes**, e confundi-las é o erro:

- **Supersede** é o ciclo de vida normal de um fato (§2.4.2). Não apaga nada.
- **Purga** é um pedido real de "apaga isso": operação **distinta, explícita e auditável**, feita **a pedido do aluno**, sobre a **cadeia inteira** do tópico. Remove fisicamente o `memory/NNNN.json`, as entradas do índice, os fatos e suas cadeias `superseded_by`, e grava em `memory/PURGE_LOG.jsonl` **o quê, quando e a pedido de quem — sem reter o conteúdo apagado**.

Como o índice é reconstruível e nenhum caminho é armazenado como fonte da verdade, a purga é implementável **sem quebrar invariante nenhuma** — exceto a contiguidade da numeração, que **não é** invariante deste desenho: `session_id` é monotônico, não contíguo, e um número purgado **nunca é reaproveitado** (§1.7.1, `sm_next_seq`).

E a regra permanente **SEG-8**: a skill **nunca apaga dado do aluno — ela move**. `broken/` para o que não parseia, `discarded/` para o que o aluno não quis.

### 2.10.3 `memory/` fora do git por padrão

**Decisão: `memory/` fica FORA do git por padrão.** O `.gitignore` gerado na criação do setup traz:

```gitignore
# Perfil cognitivo do aluno — dado pessoal, não código-fonte.
# Ver docs/11-seguranca-privacidade.md (repositório) §1.4 antes de remover esta linha.
memory/
```

Invariante **I-40** do gate: *o `.gitignore` gerado pelo template de setup contém a linha `memory/`.*

**Por quê, honestamente.** O argumento não é "git é inseguro" — é que **git é bom demais em lembrar**. Três consequências concretas:

- **Apagar um dado depois não apaga o histórico.** Um `git rm` remove do working tree; o conteúdo continua em **todo commit anterior**. Corrigir isso exige reescrita de histórico (`git filter-repo --path memory --invert-paths`), que reescreve todos os hashes e quebra qualquer clone existente.
- Se o repositório já foi enviado a um remoto, a reescrita local **não basta**: é preciso force-push **e** ainda pode haver objetos alcançáveis por SHA no servidor até a coleta de lixo — em plataformas hospedadas isso tipicamente exige abrir um chamado com o suporte. **O custo de errar é assimétrico e a reversibilidade é ruim.**
- Repositório privado hoje não é repositório privado para sempre. A pessoa torna público para mostrar o projeto no portfólio e leva junto seis meses de `affect: anxious`.

**O que se perde não versionando** — e isso é real, não é concessão retórica: backup automático, sincronia entre duas máquinas, e o diff entre duas versões do perfil ("quando foi que ele deixou de ser iniciante em recursão?"). Para quem estuda em duas máquinas, não versionar é um incômodo genuíno.

**Meio-termo recomendado:** versionar o **trabalho** e não o **perfil**. `researchs/`, `challenges/`, o `README.md` do setup e o `docs/` do setup podem ser versionados à vontade; o backup de `memory/` fica por conta de uma cópia simples (`cp -a`, rsync, backup do SO), **que apaga de verdade quando se apaga**.

Se o aluno decidir versionar `memory/` mesmo assim, isso é **decisão explícita dele**, registrada no `README.md` do setup, e a skill passa a avisar em duas situações: antes de rodar uma purga, e se detectar que o remoto do repositório é público.

> Decisão aberta de alta importância sobre versionar `memory/`: **D-S01** / **D-M03** — perguntadas ao **aluno** em runtime, não a quem constrói.

Uma decisão vizinha, essa sim de quem constrói, fecha a parte de privacidade — e é a única do catálogo cujo custo de mudar depois é
irreversível por natureza:

> **PERGUNTE AO USUÁRIO (D-S07)** — Telemetria: zero, contagem anônima opt-in, ou relatório de erro opt-in?
> Um produto que guarda o perfil cognitivo de alguém não tem margem para "só métricas anônimas". A promessa "nada sai daqui" vale enquanto for absoluta; com uma exceção, ela vira "quase nada sai daqui", e ninguém consegue verificar qual é a exceção.
> **Opções:** **(a)** zero, sem exceção — a promessa é verificável porque não há código de rede; nenhum sinal sobre o que funciona ou quebra na prática · **(b)** contagem anônima opt-in — dado agregado de uso, e "anônimo" num sistema com perfil cognitivo é palavra que ninguém consegue auditar · **(c)** relatório de erro opt-in — ajuda a corrigir falhas, e carrega caminho, nome de arquivo e trecho de conteúdo junto
> **Default:** **(a)** · **Custo de mudar depois: expensive**
