# Parte 4 — Proficiência: a máquina de estados do aluno

## Sumário da Parte 4

Sem estado de proficiência explícito, o tutor entrega à sessão 40 o mesmo andaime da sessão 1 — e
isso é um defeito mensurável (*expertise reversal effect*), não uma preferência. Este bloco
transcreve a máquina de estados que resolve isso: 3 estados, 8 transições nomeadas com gatilho e
janela, 3 classes de desfecho com ordem de avaliação fixa, e a normalização de `result` que precede
tudo. Fecha com a regra dura de coleta (**nenhuma transição sem artefato existente**), a proibição de
reportar qualquer número de domínio ao aluno, a classificação determinística de erro, a repetição
espaçada mínima, e o contrato completo do evento e do arquivo de estado.

---

## 4.0 Onde isso vive, e o que envelhece

| Item | Valor |
|---|---|
| Artefato de estado | `<setup_root>/memory/progress.json` |
| Schema do estado | `SK/assets/schemas/progress.schema.json` (`urn:study-method:schema:progress:1`) |
| Schema do evento | `SK/assets/schemas/progress-event.schema.json` (`urn:study-method:schema:progress-event:1`) |
| Script | `SK/scripts/progress-update.sh` |
| Autoridade | `docs/00-contratos.md` §3.5, §5, §7, §8, §11 · racional em `docs/04-proficiencia.md` |

Nada aqui depende de versão de toolchain: a máquina de estados é aritmética de datas e enums. O que
envelhece são os **defaults de `policy`** (§4.7), que são escolhas de produto e por isso moram **no
dado**, não no código.

> **PERGUNTE AO USUÁRIO (D-P07)** — Onde vive o arquivo de proficiência, e qual é o escopo dele?
> Um caderno de notas por matéria, não um por capítulo. Renomear depois é trivial; mudar o escopo — de um por setup para um por trilha — exige refazer toda a evidência acumulada.
> **Opções:** **(a)** `memory/progress.json`, um por setup — um lugar só para toda a evidência do assunto; setup muito grande concentra tudo num arquivo · **(b)** um arquivo por trilha dentro do setup — arquivos menores, e conceito que aparece em duas trilhas passa a ter dois históricos · **(c)** embutir o estado no índice de memória episódica — menos arquivos, e mistura "o que aconteceu" com "o que você sabe", que têm ciclos de vida diferentes
> **Default:** **(a)** · **Custo de mudar depois: moderate**

---

## 4.1 Por que este estado existe

### 4.1.1 O expertise reversal effect

O tutor precisa saber **o que o aluno já domina** para reduzir o andaime na medida certa. O
*expertise reversal effect* (Kalyuga, Ayres, Chandler & Sweller) não é sugestão de estilo: **o exemplo
resolvido linha a linha que ajuda o novato prejudica o aluno avançado**, porque vira informação
redundante que consome memória de trabalho. Sem estado explícito, o tutor entrega à sessão 40 o mesmo
andaime da sessão 1.

O que o estado muda, concretamente, em cada nível:

| | `unknown` | `fragile` | `mastered` |
|---|---|---|---|
| **Antes de pedir a tentativa** | **worked example completo** + template rodável | **exemplo parcial** (problema de completar) **ou** só o enunciado + uma linha lembrando o princípio | **nada.** Só o enunciado — e de preferência uma **variação**, não a repetição |
| **Primeiro degrau da escada ao travar** | **2** (pista conceitual) | **1** (redirecionamento de atenção) | **1** — e antes dele, uma pergunta de recuperação: "como você atacaria?" |
| **Teto da escada** | 5 | 5 | **3** por convenção. Se precisou de 4–5, isso **é** a evidência que rebaixa o estado (T3) |
| **Reexplicar o conceito** | sim, com a analogia do banco | só o princípio, em uma linha | **não** |
| **Analogia** | introduzir com o mapeamento relacional explícito | reusar a que já funcionou, só se travar | **aposentar** |
| **Comentar o código linha a linha** | sim | só as linhas críticas | **não** |
| **Papel do conceito na sessão** | conteúdo novo, fila de estudo | consolidação; entra na fila de revisão | revisão espaçada + material para intercalar |

**Regra dura de redução**: ao ver o estado subir, o tutor deve **ativamente cortar** andaime na
interação seguinte sobre o mesmo conceito — inclusive parar de explicar o que o aluno claramente já
sabe, **mesmo que ele não peça** para parar.

**Caso especial — `fragile` por decaimento (T4)**: trate o andaime como `fragile`, mas o **primeiro
movimento é uma checagem de recall curta**, não um reensino. O aluno não errou nada; só ficou tempo
sem revisar. Abrir com worked example aqui é exatamente o erro que o efeito descreve.

### 4.1.2 O que o estado NÃO é

Não é nota, não é percentual, não é probabilidade bayesiana. **BKT** precisa estimar quatro parâmetros
por habilidade — P(L0), P(T), P(guess), P(slip) — a partir de dados de **população**. Um único aluno
gera **dezenas** de observações por conceito, não os milhares que calibram esses parâmetros.
Implementar "BKT" com esses dados produziria um número com aparência de ciência e conteúdo de chute.
A alternativa honesta é um **estado discreto com regras explícitas, ancoradas em evento observável e
auditáveis pelo próprio aluno**.

### 4.1.3 ⭐ `progress.json` NÃO é reconstruível a partir das sessões

Apagar `memory/progress.json` achando que ele se refaz a partir dos `memory/NNNN.json` **perde
informação para sempre**: três campos que a máquina de estados exige nunca existiram no registro de
sessão.

| Campo exigido | Existe em `memory/NNNN.json`? | Por que não dá para inferir depois |
|---|---|---|
| `evidence[].error_type` | **não** | é a classificação de §4.6, feita **no momento** em que o tutor vê o aluno errar, perguntando "por que você fez assim?". Reconstruir meses depois é adivinhar |
| `evidence[].hint_level` | **não** | é o degrau entregue **naquele turno**. A sessão registra que houve ajuda, não em que degrau |
| `evidence[].transition_rule` | **não** | é calculado (`T1`..`T8`) contra o estado que existia **antes** do evento. Sem a sequência de estados, a regra que disparou não é recuperável |

Consequências:

- **`memory/progress.json` é dado primário, não cache.** Entra no backup e na purga como qualquer
  outro arquivo de `memory/`; não há "reconstruir a partir das sessões".
- **`evidence[]` é a fonte de verdade *dentro* do arquivo.** O que é recomputável é a **camada
  escalar** — e é isso, e só isso, que `--recompute` faz.
- **Perder o arquivo é perder a proficiência.** O tutor **não finge** que reconstruiu: volta todo
  conceito para `unknown` / `no_evidence` e diz ao aluno que perdeu o registro. Mentir sobre a origem
  do estado é pior que admitir a perda.

---

## 4.2 Granularidade e os três identificadores

### 4.2.1 O que é um "conceito"

A menor unidade que satisfaz as três condições **ao mesmo tempo**:

1. **É alvo de um desafio verificável** — existe (ou pode existir) um desafio cujo teste passa ou
   falha por causa deste conceito especificamente.
2. **Falha de forma independente** — é possível dominar o conceito vizinho e errar este, e vice-versa.
3. **Cabe em um exercício de 5 a 30 minutos** — mais fino vira ruído (`ponto_e_virgula`); mais grosso
   vira um módulo (`programacao_orientada_a_objetos`), que nunca chega a `mastered` porque nunca é
   testado por inteiro.

Régua de sanidade: um módulo da trilha gera entre **3 e 7** conceitos.

### 4.2.2 Nomeação anti-fragmentação (normativo)

| # | Regra |
|---|---|
| 1 | **A trilha é a fonte canônica.** O tutor não inventa vocabulário durante a conversa |
| 2 | `concept_id` é derivado **mecanicamente** do rótulo canônico: minúsculas, ASCII sem acento, espaços e hífens → `_`, stopwords removidas (`de`, `da`, `do`, `em`, `e`, `a`, `o`, `por`, `com`). `Indução matemática` → `inducao_matematica` |
| 3 | **Busca obrigatória antes de criar.** Procurar o rótulo normalizado em **todos** os `concept_id` e **todos** os `aliases[]`. Casou → reusa o id e **acrescenta o rótulo novo em `aliases[]`**. Criar um segundo id para a mesma coisa é **defeito**, não variação |
| 4 | `concept_id` é **imutável**. Renomear acontece só em `label` |
| 5 | **Fusão de duplicatas é bitemporal, não destrutiva**: a evidência do duplicado é copiada para o sobrevivente, o duplicado recebe `status: superseded` + `superseded_by`, e o sobrevivente registra `supersedes: [...]`. **Nada é deletado** |
| 6 | **Exceção controlada — pré-requisito descoberto.** O tutor **pode** criar conceito fora da trilha quando um erro revela um pré-requisito não previsto. `track_ref: null`, e o conceito entra na fila de **estudo**, não na de revisão. É a **única** criação ad hoc permitida |

> **PERGUNTE AO USUÁRIO (D-P05)** — Quem pode criar `concept_id`?
> É quem pode abrir gaveta nova no arquivo. Se o tutor abre gaveta a cada aula, em dois meses há três gavetas para "derivada" e nenhuma delas tem o histórico inteiro.
> **Opções:** **(a)** só a trilha do `docs/` do setup, mais a exceção do pré-requisito descoberto (`track_ref: null`) — vocabulário estável, e a exceção fica visível no dado em vez de escondida; um conceito legítimo fora da trilha depende da exceção · **(b)** só a trilha — máxima estabilidade, e o pré-requisito descoberto na aula não tem onde ser registrado · **(c)** o tutor cria ad hoc durante a sessão — flexibilidade total, e três ids para o mesmo conceito em dois meses
> **Default:** **(a)** · **Custo de mudar depois: moderate**

### 4.2.3 Os três identificadores

| Campo | Regex | Exemplo | Fonte |
|---|---|---|---|
| `setup_id` | `^[0-9a-f]{12}$` | `7b3e9a1c4f20` | `setup.json` na raiz do setup; **sorteado** na criação, imutável, sobrevive a mover/renomear — não é o nome do diretório |
| `concept_id` | `^[a-z][a-z0-9_]{1,62}$` | `inducao_matematica` | derivado do rótulo canônico (§4.2.2). **`snake_case` em todo o sistema** — não kebab, não com acento, não com maiúscula |
| `challenge_id` | `^[0-9]{4}$` | `0031` | o número que prefixa `challenges/<NNNN>-<slug>/`. **É só o número**: o slug vive no nome do diretório, nunca dentro do id |

`track_ref` é a única exceção próxima e **não é um id**: é um ponteiro para a trilha
(`modulo-02#recursao`), no formato do documento de trilha.

---

## 4.3 Os sinais observáveis

Todo sinal é coletado de um artefato que **existe** no repositório do setup. **Nenhum vem de
impressão do modelo.**

| Sinal | Campo | Quem registra | Ausência significa |
|---|---|---|---|
| Tentativas até passar | `evidence[].attempts` | o runner do desafio | `null` — não houve verificação automática |
| Nível máximo de dica | `evidence[].hint_level` (0–5) | o tutor, no momento em que entrega a dica | `null` — **nunca** ler como 0 |
| Tipo de erro | `evidence[].error_type` | o tutor, aplicando a regra de §4.6 | `unknown` — não chutar |
| Tempo na tarefa | *não persistido* | — | ver §4.3.2 |
| Recência | `last_observed_at` / `observed_at` | derivado | nunca falta |
| Auto-relato | `evidence[].kind = self_report` | o tutor, ao fechar a sessão | ausente — não é penalidade |

### 4.3.1 As quatro regras duras de coleta

| # | Regra |
|---|---|
| R1 | **`hint_level = null` ≠ `hint_level = 0`.** Ausência de registro não é prova de autonomia. Um desafio sem `hint_level` registrado **não** conta como passagem sem dica e portanto **não** promove ninguém |
| R2 | **Exposição não é evidência de aprendizagem.** O conceito ter sido explicado, lido ou discutido gera `kind: exposure`, atualiza `last_observed_at` e **nunca** muda `proficiency_state`. **Explicar não é aprender** |
| R3 | **Auto-relato é assimétrico.** "acho que entendi" **nunca** promove; "não peguei isso" **pode** rebaixar `mastered` → `fragile` (T8). A assimetria é deliberada: um relato negativo é informação que o tutor não tem de outra fonte; um relato positivo é justamente o que a evidência de desafio existe para verificar |
| R4 | ⭐ **Nenhuma transição sem artefato.** `progress-update.sh` só grava transição cuja evidência aponte para um `session_id` (e `challenge_id`, quando `kind: challenge`) que **existe de fato** em `memory/` e `challenges/`. Sem artefato, sem transição. **É essa regra que impede o modelo de "sentir" que o aluno melhorou** |

R4 é verificada mecanicamente: `memory/<session_id>.json` tem que existir; `challenges/<challenge_id>-*/`
tem que existir. Falha → **exit 5**. É também a razão de os dois campos terem formato fixo e não texto
livre: sem formato fixo não há o que procurar no disco.

> **PERGUNTE AO USUÁRIO (D-P01)** — O tutor pergunta quanto o aluno acha que domina um assunto, ou julga só pelo que vê ele fazer?
> Autoavaliação é termômetro na mão do próprio paciente: quem está indo mal costuma achar que está indo bem. Por isso o autorrelato entra só no fim da aula e só puxa para baixo.
> **Opções:** **(a)** uma pergunta no fechamento, com efeito assimétrico (só rebaixa) — captura a dúvida do aluno sem transformar confiança em nota; quem se subestima puxa o próprio estado para baixo sem precisar · **(b)** nunca perguntar, só evidência observável — zero ruído, e ignora o aluno que sabe que decorou sem entender · **(c)** perguntar conceito a conceito — granularidade máxima, e transforma o fim de toda aula num formulário
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 4.3.2 Tempo: por que ele não vira estado

Tempo de parede numa conversa **não mede esforço cognitivo** — o aluno foi fazer café, atendeu o
telefone, dormiu. Um sinal com essa razão sinal/ruído não pode disparar mudança de estado. Uso
permitido, e único: **gatilho de frustração dentro da sessão corrente** — muito tempo sem edição
depois de uma dica é sinal de impasse silencioso e manda subir a escada. Esse uso é **volátil**, vive
na sessão, e **não é persistido** em `progress.json`.

### 4.3.3 Quando não existe sinal nenhum

`proficiency_state: unknown`, `state_reason: no_evidence`, `confidence: low`, `observed_at: null`,
`next_review_at: null`. O conceito **não entra na fila de revisão** (revisão é para `fragile` e
`mastered`); entra na fila de estudo da trilha. O andaime é o de novato, calibrado no tom por
`declared_skill_level` — que é auto-declarado e por isso **nunca** participa de transição. E o tutor
**não** diz "você não sabe isso": diz **"não tenho registro seu neste tópico"**.

---

## 4.4 ⭐ A máquina de estados, transcrita

### 4.4.1 Os três estados

Os estados são afirmações sobre **a evidência que o tutor tem**, não sobre o cérebro do aluno. Essa
leitura resolve a ambiguidade de `unknown`: ele significa *eu não sei*, não *o aluno não sabe*.

| Estado | Significado exato | Cobre os casos |
|---|---|---|
| `unknown` | não há evidência de sucesso autônomo | (a) nunca tentou; (b) tentou e não passou; (c) passou **só** com dica 4–5 — a solução foi entregue, o sucesso é do tutor |
| `fragile` | há evidência de sucesso, mas ela não sustenta domínio | (a) passou com dica 2–3; (b) passou sem dica **uma única vez**; (c) regrediu de `mastered` |
| `mastered` | **duas** passagens sem dica (nível 0–1), em **sessões distintas** separadas por **≥ 1 dia**, ambas dentro de `mastery_window_days` (default 60), sem erro conceitual na janela | — |

Por que "sessões distintas separadas por ≥ 1 dia": dois acertos na mesma tarde são *massed practice*,
que produz bom desempenho durante a prática e **retenção pior** (Bjork). Só a passagem **espaçada** é
evidência de retenção.

### 4.4.2 Passo 0 — a normalização, antes de qualquer classificação

`evidence[].result` tem **três** valores. O manifesto do desafio, de onde o evento nasce, tem
**cinco** (`student_progress.last_result`). A conversão é obrigatória e acontece **antes** da
classificação.

| Entrada (`last_result` / `result`) | → `evidence[].result` | Por quê |
|---|---|---|
| `passed` | `passed` | — |
| `failed` | `failed` | — |
| **`timeout`** | **`failed`** | o código do aluno não terminou. É falha de resolução, com diagnóstico diferente para a conversa — mas **nunca** evidência de autonomia |
| **`error`** | **`failed`** | o código não rodou. Idem |
| `not_run` | `not_attempted` | proposto e não tentado |
| qualquer outro | **exit 5** | nunca normalizado por adivinhação, nunca absorvido pela classe B |

⭐ **Este mapeamento existe por causa de um defeito real, e vale nomeá-lo para que ninguém o
reintroduza.** Sem ele, um `last_result: "timeout"` chega à classificação e não casa nem com
`result = failed` (classe C) nem com `result = passed` (classe A) — **cai no "caso contrário" e vira
classe B**. Consequência: um aluno cujo código entrou em laço infinito é **promovido** de `unknown`
para `fragile` pela T1, com `state_reason: passed_with_hints`. O sistema passa a afirmar que há
evidência de sucesso onde houve um travamento. O mesmo vale para `error`.

### 4.4.3 As três classes de desfecho

Calculadas só para `kind = challenge` com `result ∈ {passed, failed}`. **A ordem de teste é fixa; a
primeira que casar vence.**

| Classe | Condição | Leitura |
|---|---|---|
| **C** — entregue ou falho | `result = failed` **OU** `hint_level >= 4` **OU** `error_type = conceptual` | não há evidência de autonomia. Dica 4–5 é worked example ou solução comentada: o trabalho cognitivo foi do tutor |
| **A** — autônomo | `result = passed` **E** `hint_level ∈ {0,1}` **E** `error_type ∈ {none, slip}` | passou sozinho ou com um redirecionamento de atenção |
| **B** — assistido | todo o resto | passou com pista conceitual ou localizadora |

Três consequências que a ordem fixa produz:

- **`error_type = conceptual` joga o evento na classe C mesmo com o teste passando.** O aluno pode
  fazer o teste passar carregando uma regra errada — **o verde não apaga o equívoco**.
- **`hint_level = null` não satisfaz A** e cai em **B**: sem registro do degrau, não se credita
  autonomia. É a escolha conservadora, e é o que garante que as três classes cobrem todos os eventos
  `kind: challenge` **sem sobra** — não existe ramo "caso contrário".
- **`result = not_attempted` não é classificado em classe nenhuma.** Grava evidência, atualiza
  `last_observed_at`, e **não** muda estado nem `interval_days` — mesmo tratamento de
  `review_declined`. Não tentar não é evidência de falha.

### 4.4.4 As 8 transições

`progress-update.sh` grava o identificador (`T1`..`T8`) em `evidence[].transition_rule`.

| ID | De → Para | Gatilho | Ocorrências | Janela | `state_reason` |
|---|---|---|---|---|---|
| **T1** | `unknown` → `fragile` | desafio classe **A** ou **B** | 1 | — | `passed_unassisted` (A) / `passed_with_hints` (B) |
| **T2** | `fragile` → `mastered` | desafio classe **A** | **2**, em `session_id` distintos e com `observed_at` diferindo **≥ 1 dia** | as duas dentro de `mastery_window_days` (60d) **e posteriores ao último evento classe C** | `passed_unassisted` |
| **T3** | `mastered` → `fragile` | desafio classe **B** ou **C** | 1 | — | `passed_with_hints` \| `failed` \| `conceptual_error` |
| **T4** | `mastered` → `fragile` | **decaimento temporal**: `kind = decay`, ou `hoje − observed_at >= (1 + decay_overdue_ratio) × interval_days` | 1 | — | `temporal_decay` |
| **T5** | `fragile` → `mastered` | desafio classe **A** | **1** | só se a última demoção foi **T4** e **não houve classe C desde então** | `passed_unassisted` |
| **T6** | `fragile` → `unknown` | desafio classe **C** com `error_type = conceptual` | **2 consecutivos**, em `session_id` distintos, **sem nenhuma passagem entre eles** | — | `conceptual_error` |
| **T7** | X → X (auto-laço) | qualquer evento classificado que não case com as regras acima | 1 | — | conforme o desfecho |
| **T8** | `mastered` → `fragile` | `kind = self_report` com `self_report_claim = no_mastery` | 1 | — | `self_report` |
| *(sem regra)* | X → X | `exposure`, `review_declined`, `challenge` com `not_attempted` | — | — | `transition_rule: null`; só `last_observed_at` |

**T7 é uma transição de verdade**, não "nada aconteceu": grava evidência, atualiza `attempts`,
`last_observed_at`, `interval_days` e `confidence`. Estado igual com evidência nova é resultado
legítimo e **precisa aparecer no arquivo**.

**T5 tem precedência de rótulo sobre T2** (as duas levam a `mastered`): registrar T5 preserva a
informação de que a promoção foi **restauração pós-decaimento**.

### 4.4.5 ⭐ Decair por tempo (T4) ≠ falhar (T3)

Esta distinção é a razão de `state_reason` existir.

| | **T3 — falha observada** | **T4 — decaimento temporal** |
|---|---|---|
| Evidência | o aluno errou, ou precisou de ajuda | **ausência** de observação; ninguém errou nada |
| Efeito em `interval_days` | reset para **1** (classe C) ou ×1,3 (classe B) | **nenhum** — o intervalo é **preservado** |
| Efeito em `unassisted_passes` | **zera** a contagem (evento classe C) | **não zera** |
| Efeito em `next_review_at` | recalculado | **preservado** |
| Volta para `mastered` | pela regra normal, **T2** (2 passagens espaçadas) | por **T5**, com **uma única** passagem autônoma |
| Comportamento do tutor | **reensino**: analogia nova, worked example, escada a partir de degrau mais alto | **checagem de recall curta**, não reensino |

> **Quem esqueceu volta com uma passagem; quem não entendeu recomeça.**

A justificativa de T5 vem de Bjork: **força de armazenamento é permanente e só cresce; o que decai é a
força de recuperação**. Um recall bem-sucedido depois de um intervalo longo restaura a recuperação —
e é justamente o recall difícil que produz o maior ganho. Exigir duas confirmações de quem só ficou
tempo sem revisar seria punir o aluno pela passagem do tempo.

**Nota de honestidade**: `decay_overdue_ratio` **não é achado empírico**. A curva de Ebbinghaus diz
que esquecer é rápido e exponencial; **não diz em que dia rebaixar o rótulo**. O default (rebaixar
quando o atraso iguala o próprio intervalo) é escolha de produto, mora em `policy`, e está em D-P03.

> **PERGUNTE AO USUÁRIO (D-P03)** — Quão rápido o domínio de um conceito "esfria" quando o aluno fica sem praticá-lo?
> É o prazo de validade do que foi aprendido. Com 1,0 o conceito rebaixa quando o atraso iguala o próprio intervalo de revisão — dobrou o tempo previsto, cai um degrau. Não há base empírica para nenhum valor específico; é escolha de produto, e por isso mora no dado, não no código.
> **Opções:** **(a)** 1,0 — meio-termo defensável, e muda editando um número em `policy`; é um chute calibrado, não uma medida · **(b)** 0,5, agressivo — revisa mais cedo, e reabre conceito que o aluno ainda tinha na ponta da língua · **(c)** 2,0, frouxo — menos revisão imposta, e descobre o esquecimento tarde demais · **(d)** 0, desligado — aprendido é aprendido para sempre, o que contradiz tudo que se sabe sobre curva de esquecimento
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 4.4.6 A ordem de avaliação, determinística

Um evento por vez, em ordem cronológica de `observed_at`, exatamente nesta sequência:

```
0. NORMALIZA o evento (§4.4.2): last_result -> result.
       passed -> passed | failed|timeout|error -> failed | not_run -> not_attempted
   valor fora do enum de result, kind ou error_type => REJEITA (exit 5). Nunca assume
   default; um evento malformado NÃO vira classe B por omissão.
1. resolve concept_id  (concept_id -> aliases[] -> sm_normalize_concept_id)
2. verifica artefato: memory/<session_id>.json e challenges/<challenge_id>-*/  => exit 5
3. idempotência: chave (concept_id, kind, session_id, challenge_id, observed_at)
                 já em evidence[]  => no-op, exit 0
4. state_before := proficiency_state atual
5. despacha por kind:
   5a. exposure | review_declined:
           state_after := state_before ; transition_rule := null
           atualiza last_observed_at ; NÃO mexe em interval_days nem next_review_at ; FIM
   5b. self_report:
           claim = no_mastery e state_before = mastered  -> T8 -> fragile
           senão                                         -> T7 sem mudança ; FIM
   5c. decay:
           -> T4 -> fragile (só se state_before = mastered) ; interval_days preservado ; FIM
   5d. challenge:
           result = not_attempted: grava evidência, state_after := state_before ; FIM
           error_type = prerequisite: regrava como kind=exposure no alvo e repete o
                                      passo 1 no concept_id de attributed_to ; FIM
           classe := C se (result = failed ou hint_level >= 4 ou error_type = conceptual)
                     A se (result = passed e hint_level in {0,1} e error_type in {none, slip})
                     B se (result = passed)     <- e só aqui
           conforme state_before:
             mastered : classe B|C -> T3 -> fragile     | classe A -> T7 (segue mastered)
             fragile  : classe A   -> T5 se aplicável, senão T2 se aplicável, senão T7
                        classe B   -> T7
                        classe C   -> T6 se 2ª conceitual consecutiva, senão T7
             unknown  : classe A|B -> T1 -> fragile     | classe C -> T7
6. anexa a entrada em evidence[], em posição cronológica, com state_before,
   state_after e transition_rule
7. recalcula interval_days e next_review_at (§4.7)
8. recomputa TODA a camada escalar a partir de evidence[] (§4.8.2)
```

**Erro de pré-requisito produz DUAS escritas** (§4.6.4): no conceito **alvo**, uma entrada
`kind: exposure` com `error_type: prerequisite` e `attributed_to` — e `exposure` nunca muda estado,
então o alvo **não é rebaixado por um erro que não é dele**; no conceito de `attributed_to`, a
evidência penalizante inteira, com `error_type: unknown` (nunca chutar) e classificada normalmente.

---

## 4.5 ⭐ Honestidade epistêmica: o que o tutor pode e não pode dizer

### 4.5.1 A regra dura

> **É proibido reportar ao aluno qualquer porcentagem de domínio, score numérico, nota, barra de
> progresso por conceito ou "confiança" numérica.**

Não é preferência de estilo. Com um único aluno e um punhado de observações por conceito, um número
de 0 a 100 é teatro:

| Motivo | Conteúdo |
|---|---|
| **A estatística não existe** | BKT precisa de quatro parâmetros por habilidade calibrados em dados de população. Um "87%" derivado de 3 tentativas tem incerteza que cobre quase toda a escala — o número comunica uma precisão que o dado não tem |
| **É bajulação quantificada** | LLMs afirmam as ações do usuário ~50% mais do que humanos (Cheng et al., arXiv 2510.01395), e LLMs bajuladores **enganam ativamente novatos** em tarefas de resolução de problema (arXiv 2510.03667). Um número inflado é o veículo mais eficiente disso: **parece objetivo e não pode ser contestado** |
| **Quebra a régua interna do aluno** | se o número sobe sempre, ele para de carregar informação — o mesmo mecanismo que destrói o valor do elogio genérico |

### 4.5.2 A tabela do permitido e do proibido

| ❌ Proibido | ✅ Permitido no lugar |
|---|---|
| "Você domina recursão em 87%." | "Você passou nos 3 últimos desafios de recursão sem dica — o mais recente foi em 10/08." |
| "Sua proficiência em indução é 2/10." | "Não tenho nenhum registro seu de desafio de indução com teste passando. Isso está como `unknown`: quer dizer que **eu** não sei, não que você não saiba." |
| "Confiança do modelo: 0,62." | "Só tenho uma observação disso, e é de junho — vale reconferir." |
| "Você concluiu 62% da trilha." | "8 dos 23 conceitos da trilha estão em `mastered`; 6 em `fragile`." |
| "Nível 7 de 10 em complexidade." | "Nos dois desafios de complexidade você chegou ao fim, mas nos dois precisou de dica conceitual — por isso está como `fragile`." |
| "Você melhorou muito!" (sem lastro) | "Na sessão 0031 você precisou de dica nível 3 em recursão; nas duas últimas, nível 0." |
| "Estimo 70% de chance de você lembrar disso semana que vem." | "Faz 13 dias desde a última vez; o intervalo atual é de 16 dias, então isso volta na fila por volta de 26/08." |

### 4.5.3 Onde fica a fronteira

> **Contagem de evento real é permitida. Estimativa derivada é proibida.**

| Forma | Veredito |
|---|---|
| "3 de 4 desafios", "2 sessões espaçadas", "8 de 23 conceitos em `mastered`" | **permitido** — contagens verdadeiras de fatos registrados |
| "62% da trilha dominado", "78% de retenção prevista", "score 7,4" | **proibido** — conversões que fingem medir uma grandeza contínua que ninguém mediu. **Inclusive a conversão de uma contagem verdadeira em percentual de domínio**, porque a leitura que o aluno faz é "62% dominado", não "62% dos rótulos" |
| `confidence` | **não é probabilidade.** É a confiança do tutor na **classificação**, derivada mecanicamente, e é **enum** (`low\|medium\|high`), nunca número. Nunca apresentada como "chance de o aluno saber" |
| `unknown` | **nunca** dizer que significa incompetência. É afirmação sobre o **arquivo**, não sobre a pessoa |

Uma frase exemplar do que **pode** ser dito com o arquivo na mão:

> "Recursão você passou nos três últimos desafios sem dica — o último foi 10/08, e volta pra fila dia
> 26. Complexidade venceu anteontem: nas duas vezes que você fechou, precisou da pista conceitual,
> então quero reconferir. Indução eu não vou dar como sabida: nas duas tentativas o passo indutivo
> assumiu a tese, do mesmo jeito — vamos atacar isso por outro ângulo hoje."

### 4.5.4 Derivação de `confidence` (mecânica, não opinião)

Contam como *evidência qualificada* apenas entradas `kind: challenge` com `result ∈ {passed, failed}`.

| Valor | Condição |
|---|---|
| `high` | ≥ 2 evidências qualificadas **e** a mais recente com ≤ 30 dias |
| `medium` | exatamente 1 evidência qualificada, **ou** ≥ 2 com a mais recente entre 31 e 90 dias |
| `low` | nenhuma evidência qualificada (só exposição / auto-relato), **ou** a mais recente com > 90 dias |

`confidence: high` com `proficiency_state: unknown` é combinação **normal e útil**: quer dizer "tenho
boa evidência de que ainda não há evidência de domínio".

---

## 4.6 Classificação de erro: deslize × equívoco conceitual

Importa porque **a intervenção certa é diferente** — e porque alimenta a classe C (§4.4.3) e o degrau
inicial da escada de dicas.

### 4.6.1 As definições

| Valor | Definição |
|---|---|
| `slip` | o aluno **sabe** o procedimento e executa errado por descuido momentâneo. Local, não regido por regra, não se repete depois de apontado |
| `conceptual` | o aluno aplica uma regra **coerente porém errada**. Sistemático, reaparece em contextos diferentes, e **não se autocorrige errando de novo**, porque a regra interna dele continua produzindo o mesmo bug até o modelo mental ser corrigido |
| `prerequisite` | a falha observada aqui foi causada por **outro** conceito (§4.6.4) |
| `none` | passou sem erro relevante |
| `unknown` | não deu para classificar. **Nunca chutar** — `unknown` não dispara T6 nem regressão por erro conceitual |

### 4.6.2 O teste de decisão — ordem fixa, primeira afirmativa vence

| # | Pergunta | Resposta afirmativa → |
|---|---|---|
| 1 | O aluno corrige com **dica de nível 1** (redirecionamento de atenção, sem nomear o conceito) e não repete o erro no mesmo desafio? | **`slip`** |
| 2 | O **mesmo padrão** de erro aparece em **2 ou mais lugares** — duas linhas do mesmo artefato, ou dois desafios distintos? | **`conceptual`** |
| 3 | O aluno **verbaliza** uma justificativa para o que fez, e ela é internamente coerente mas errada? | **`conceptual`** |
| 4 | A correção exigiu **nomear ou reexplicar o princípio** (dica de nível ≥ 2)? | **`conceptual`** |
| 5 | Nenhuma das anteriores é decidível com o que está registrado? | **`unknown`** |

O passo 3 é o mais informativo e o mais barato: basta perguntar **"por que você fez assim?"**. Uma
resposta coerente e errada é a assinatura de um *mind bug*; um "sei lá, foi sem querer" é a assinatura
de um deslize.

### 4.6.3 Exemplos de calibração

| Observado | Classificação | Teste que decidiu |
|---|---|---|
| `if x = 5:` em Python, corrigido de imediato ao "relê essa linha" | `slip` | 1 — usa certo em outros pontos do mesmo arquivo |
| Trocou a ordem de `range(start, stop)` uma vez, acertando nas outras 3 chamadas | `slip` | 1 — as outras chamadas provam que a regra certa está lá |
| `fatorial` sem caso base **e**, no desafio seguinte, `soma_lista` também sem caso base | `conceptual` | 2 — mesma regra errada em dois contextos |
| `b = a` com listas e afirma "copiei a lista" | `conceptual` | 3 — verbaliza regra coerente e errada |
| `range(1, n)` esperando incluir `n`, em três exercícios seguidos | `conceptual` | 2 — off-by-one regido por regra |
| 40 execuções falhas, todas por erro de sintaxe, com o algoritmo correto desde a primeira | `slip` | 1 — **muitas tentativas não rebaixam o estado quando os erros são deslizes** |
| `log(a+b) == log(a) + log(b)` **e**, depois, `sqrt(a+b) == sqrt(a) + sqrt(b)` | `conceptual` | 2 — distributividade superaplicada |
| Juros compostos como `P * (1 + i*n)`, defendido com "juros compostos é a taxa vezes o tempo" | `conceptual` | 3 |
| No passo indutivo, assumiu a tese para `n+1` para provar `n+1` | `conceptual` | circularidade regida por regra; reaparece em toda prova por indução |

### 4.6.4 Erro de pré-requisito: não contamine o conceito alvo

O aluno erra **álgebra** dentro de um desafio de **derivada**. Se isso rebaixar `derivada`, o modelo
passa a **mentir sobre onde está o problema**.

1. a evidência **penalizante** é gravada no `concept_id` do **pré-requisito** (criando-o com
   `track_ref: null` se preciso — é a exceção de §4.2.2 regra 6);
2. o conceito **alvo** recebe `kind: exposure` com `error_type: prerequisite` e `attributed_to`
   apontando para o pré-requisito — `exposure` nunca muda estado;
3. a fila de estudo passa a priorizar o pré-requisito.

### 4.6.5 O que a classificação muda no feedback imediato

| Classificação | Intervenção |
|---|---|
| `slip` | apontamento **imediato e mínimo**. Não há nada para o aluno descobrir num `=` em vez de `==`; deixar o erro rodar só consolida hábito ruim. **Sem reensino, sem analogia** |
| `conceptual` | **atraso deliberado**: deixar o erro acontecer, perguntar "o que rodou primeiro que quebrou?", deixar o aluno rastrear o próprio raciocínio — e só então intervir, começando por um degrau conceitual (nível ≥ 2). O atraso para no ponto de frustração, não antes |
| `conceptual` recorrente (2ª ou 3ª vez) | **dizer o padrão em voz alta** ("é a terceira vez que a condição de parada erra do mesmo jeito") e **trocar de estratégia**: analogia nova em vez de repetir os degraus que já não funcionaram. Esconder o padrão para "não desanimar" é **bajulação por omissão** |

---

## 4.7 Repetição espaçada mínima viável

### 4.7.1 Por que não SM-2 nem FSRS

| Algoritmo | Por que não serve |
|---|---|
| **SM-2** | exige uma nota de 0 a 5 **do próprio aluno** a cada revisão. É fricção de app de flashcard dentro de um bate-papo, e é auto-relato — o sinal mais fraco que temos |
| **FSRS** | ~19 parâmetros treináveis, calibrados sobre dezenas a centenas de revisões por usuário. Um aluno com um punhado de conceitos nunca gera esse volume; treinar 19 parâmetros nesses dados é *overfitting* com cara de ciência |

O que se preserva dos dois é **o espírito**: menos revisão para o que está sólido, mais para o que é
frágil, com crescimento aproximadamente exponencial — e o "rating" **inferido do comportamento
observado** em vez de pedido ao aluno.

### 4.7.2 A regra de intervalo

`interval_days` começa em **1**.

| Classe do desfecho | Estado resultante | Novo `interval_days` | Teto |
|---|---|---|---|
| **A** | `mastered` | `max(anterior + 1, round(anterior × interval_multiplier_mastered))` | `interval_cap_mastered_days` |
| **A** | `fragile` | `max(anterior + 1, round(anterior × interval_multiplier_fragile))` | `interval_cap_fragile_days` |
| **B** | `fragile` | idem | idem |
| **C** | qualquer | **1** (reset) | — |

| Regra | Conteúdo |
|---|---|
| `round` | **meio-para-cima** |
| Por que o termo `anterior + 1` | `round(1 × 1,3) = 1` deixaria o intervalo travado em 1 para sempre no ramo frágil |
| T4, T8, `exposure`, `review_declined` | **não** alteram `interval_days` |
| `next_review_at` | `observed_at + interval_days`; `null` enquanto não houver evidência `kind: challenge` |
| Tetos | aplicados **no momento do recálculo, nunca retroativamente**. Um conceito que decaiu de `mastered` (teto 180) para `fragile` (teto 21) **mantém** o `interval_days` que tinha; o teto de `fragile` só morde no próximo evento que recalcular |

**Defaults de `policy`** (moram no dado, versionados e auditáveis, ajustáveis sem tocar em código):

| Parâmetro | Default |
|---|---|
| `interval_multiplier_mastered` | `2.3` |
| `interval_multiplier_fragile` | `1.3` |
| `interval_cap_mastered_days` | `180` |
| `interval_cap_fragile_days` | `21` |
| `decay_overdue_ratio` | `1.0` (0 desliga o rebaixamento por tempo) |
| `mastery_window_days` | `60` |
| `max_review_suggestions_per_session` | `2` |

`policy` ausente = todos os defaults acima.

> **PERGUNTE AO USUÁRIO (D-P06)** — Os prazos do domínio (janela de 60 dias, teto de 180 em `mastered` e 21 em `fragile`, multiplicadores 2,3 e 1,3) ficam como estão?
> São os intervalos entre revisões, como as consultas de retorno do dentista: seis meses quando está tudo bem, três semanas quando algo apareceu. O multiplicador 2,3 aproxima o crescimento de uma curva de repetição espaçada consagrada sem precisar pedir nota ao aluno depois de cada exercício.
> **Opções:** **(a)** manter os defaults — tudo vive em `policy` e é ajustável por setup; são números calibrados, não medidos nesta população · **(b)** encurtar a janela para 30 dias — exige evidência mais fresca, e rebaixa conceito que o aluno de fato domina · **(c)** alongar os tetos — menos revisão, e descobre o esquecimento perto da prova
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 4.7.3 A fila de revisão na abertura da sessão (`--due`)

| # | Passo |
|---|---|
| 1 | **Decaimento preguiçoso**: para cada `active`+`mastered` com `hoje − observed_at >= ceil((1 + decay_overdue_ratio) × interval_days)`, grava `kind: decay` com `observed_at` = **a data em que o limiar foi cruzado** e `recorded_at` = agora. Não existe daemon — é bitemporalidade real: o fato virou verdade antes de o sistema saber |
| 2 | **Filtra**: `status = active` **E** `next_review_at != null` **E** `next_review_at <= hoje` **E** `proficiency_state ∈ {fragile, mastered}`. **`unknown` nunca entra na fila de revisão** — não se revisa o que nunca foi aprendido |
| 3 | **Ordena**: `fragile` antes de `mastered`; dentro do grupo, maior atraso relativo `(hoje − next_review_at) / interval_days` primeiro |
| 4 | **Intercala** (Bjork): não sugerir dois do mesmo `track_ref` havendo alternativa vencida de outro módulo. Sequência homogênea não treina a decisão de *qual* técnica usar |
| 5 | **Corta** em `policy.max_review_suggestions_per_session` — sai em `suggested[]`; `due[]` traz a lista completa |
| 6 | **Sugere, não obriga.** Recusa → grava `kind: review_declined`, **sem** alterar estado nem intervalo |
| 7 | **Anti-insistência**: após **3 recusas consecutivas** do mesmo conceito, o tutor diz **uma vez**, de forma factual e sem chantagem, qual é o custo ("esse é o terceiro adiamento; ele estava em `mastered` e já caiu para `fragile` por tempo"), adia `next_review_at` em **7 dias** e para de sugerir aquele conceito nesse intervalo |

---

## 4.8 O contrato de escrita: `progress-update.sh`

### 4.8.1 Interface

```
progress-update.sh [<setup_root>] --event <evento.json>|-   # aplica UM evento
progress-update.sh [<setup_root>] --due                     # vencidos + decaimento preguiçoso
progress-update.sh [<setup_root>] --recompute               # escalares a partir de evidence[]
progress-update.sh --help
```

As três são **mutuamente exclusivas** (duas juntas ⇒ **exit 2**). `<setup_root>` omitido é descoberto
por `sm_setup_root` a partir do `$PWD`.

> ⭐ **Não existe flag** para escrever `proficiency_state`, `state_reason`, `confidence` ou
> `interval_days`: os quatro são **sempre calculados**, e é essa ausência que torna aplicável a regra
> "escrita só por evento". Aceitar campos soltos na linha de comando seria o "informe o estado novo"
> por outro nome.

| Modo | stdout | Escreve em disco |
|---|---|---|
| `--event` | `{mode, applied, results:[{concept_id, transition_rule, state_before, state_after, class, applied}], warnings}` | `memory/progress.json`, só se algo mudou |
| `--due` | `{today, decayed[], due[], suggested[], warnings}` | idem, só se houve decaimento (T4) |
| `--recompute` | `{mode, changed, diff:[{concept_id, field, from, to}], warnings}` | idem, só se `changed > 0` |

Lock próprio: `memory/.progress.lock` (`mkdir`, atômico); lock com `mtime > 60 s` é morto — removido
com aviso e retomado **uma** vez. Escrita por `sm_atomic_write`, sempre **depois** de
`sm_json_validate` contra `progress.schema.json`.

| Código | Quando |
|---|---|
| `0` | evento aplicado, ou no-op idempotente |
| `1` | I/O, dependência ausente |
| `2` | uso incorreto (modos conflitantes, `--event` sem caminho, flag desconhecida) |
| `3` | setup não encontrado |
| `4` | `memory/.progress.lock` ocupado |
| `5` | evento fora do schema · `setup_id` divergente · `session_id`/`challenge_id` inexistente · `result` fora do enum · evento informando estado · resultado que não valida contra `progress.schema.json` |

**`10` não é produzido**: nenhuma etapa deste script precisa de julgamento do modelo. Fica
**reservado** — se um dia a fusão de duplicatas precisar de "estes dois conceitos são o mesmo?", ela
usa o protocolo REQUEST/APPLY, e não um palpite dentro do script.

### 4.8.2 A camada escalar é cache — toda ela derivada de `evidence[]`

| Campo | Derivação |
|---|---|
| `proficiency_state` | `state_after` da evidência cronologicamente mais recente |
| `state_reason` | do último evento com desfecho: classe A → `passed_unassisted`; B → `passed_with_hints`; C → `conceptual_error` se `error_type = conceptual`, senão `failed` se `result = failed`, senão `passed_with_hints`; T4 → `temporal_decay`; T8 → `self_report` |
| `confidence` | §4.5.4. **Enum, nunca número** |
| `attempts` | soma de `evidence[].attempts` das entradas `kind: challenge` |
| `unassisted_passes` | classe A com `observed_at` posterior ao último classe C **e** à última T6. **T4 não zera** |
| `max_hint_level_used` | `hint_level` da evidência de desafio mais recente (`null` se não houver) |
| `last_error_type` | `error_type` da evidência de desafio mais recente |
| `first_observed_at` / `last_observed_at` | menor / maior `observed_at` de **toda** a evidência |
| `observed_at` | `observed_at` da evidência de desafio mais recente com `result ∈ {passed, failed}` |
| `interval_days` | **replay** de §4.7.2 sobre a evidência em ordem cronológica |
| `next_review_at` | `observed_at + interval_days`; `null` sem evidência de desafio |

`recorded_at` (do conceito e do documento) é *transaction time* e **não** é derivado: `--recompute` só
o toca quando algum escalar mudou de fato.

### 4.8.3 Idempotência, proibições e `state_reason: manual`

**Idempotência**: a chave de identidade de um evento é a tupla
`(concept_id, kind, session_id, challenge_id, observed_at)`. Reprocessar um evento cuja chave já está
em `evidence[]` é **no-op com exit 0** — não duplica entrada, não reaplica transição, não mexe em
`interval_days`. É o que permite reprocessar um diretório de eventos sem medo depois de uma
interrupção.

| Proibição | Conteúdo |
|---|---|
| Número de domínio | **proibido** calcular, gravar ou emitir porcentagem, nota, score ou probabilidade de domínio |
| Deleção | **nada é deletado** de `evidence[]`. Poda permitida **só** para `kind ∈ {exposure, review_declined}` acima de **20** entradas, e **nunca** para entrada com `state_before != state_after` |
| `state_reason: manual` | **nunca é escrito por nenhum caminho de código** |

⭐ **De onde vem `manual`.** O enum de `state_reason` tem oito valores e **sete** são produzidos por
alguma transição T1–T8. O oitavo existe para um caso real: a pessoa abre `memory/progress.json` — que
é um JSON legível, num diretório dela, e isso é escolha de projeto — e **corrige à mão** um estado que
considera errado. Sem `manual`, ela teria que escolher entre mentir sobre a causa
(`passed_unassisted` sem passagem nenhuma) ou deixar um valor que a máquina de estados nunca
justificaria. Três consequências:

1. **`progress-update.sh` preserva `manual`, mas não o defende.** O próximo evento de desafio
   sobrescreve o estado normalmente. Edição manual é ponto de partida, não estado congelado.
2. **`--recompute` é a exceção declarada**: reconstrói os escalares a partir de `evidence[]` e por
   isso **desfaz** um `manual` sem evidência correspondente — **com um aviso de uma linha em
   stderr**, nunca em silêncio.
3. **O tutor lê `manual` como o que é**: "alguém ajustou isto à mão". Não trata como observação sua,
   não conta como evidência qualificada em `confidence`, e pode dizer ao aluno que aquele estado veio
   de uma edição, não de um desafio.

> **PERGUNTE AO USUÁRIO (D-P11)** — De onde vem `state_reason: "manual"`?
> É a rasura assinada no caderno. O arquivo é legível e editável de propósito; se alguém editar na mão, o campo tem de poder dizer isso. O que não pode é o tutor escrever "manual" para justificar uma decisão que foi dele.
> **Opções:** **(a)** edição direta do arquivo pelo aluno ou operador — o arquivo continua honesto sobre a origem de cada estado, preservado pelo fluxo normal e desfeito por `--recompute` com aviso; é um valor de enum que nenhum código escreve · **(b)** remover do enum — enum menor, e a edição humana passaria a se disfarçar de decisão automática · **(c)** o tutor pode escrever — um caminho a mais para o tutor, e mente sobre a causa da transição, que é justamente o que o campo existe para dizer
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 4.8.4 Invariantes que este artefato sustenta

**I-11** (o enum `status` de fato é exatamente `["active","superseded"]`) · **I-12** (`setup_id` casa
`^[0-9a-f]{12}$` em todos os schemas que o declaram, **inclusive** `progress.schema.json`) ·
**I-18** (só os exit codes 0–5) · **I-21** (`pipefail`, nenhum teste `== 1`) · **I-25** (nenhuma
escrita fora de `<setup_root>`) · **I-26** (zero rede) · **I-27** (derivados por `sm_atomic_write`) ·
**I-31** (`--recompute` reconstrói todo campo escalar a partir de `evidence[]` **sem diferença**) ·
**I-43** (nenhum documento contém percentual de domínio).

---

## 4.9 O formato do evento — `progress-event.schema.json`, verbatim

Um objeto JSON, **um evento por arquivo** (`-` lê de stdin). Valida **depois** da normalização do
passo 0. O evento **não** carrega `state_before`, `state_after` nem `transition_rule` — trazê-los é
**exit 5**, porque aceitá-los seria abrir a porta para "informe o estado novo".

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:study-method:schema:progress-event:1",
  "title": "Evento de proficiencia (entrada de progress-update.sh --event)",
  "description": "UM evento observavel sobre UM conceito, entregue a `progress-update.sh --event`. E a unica forma de escrever em memory/progress.json: a entrada e sempre o evento, NUNCA o estado novo - o estado e calculado pela maquina de transicoes T1-T8 a partir daqui e da evidencia ja gravada. Regra dura do projeto: sem artefato, sem transicao. O script recusa o evento cujo session_id nao exista em memory/ ou cujo challenge_id nao exista em challenges/; por isso os dois campos tem formato fixo, e nao texto livre. Idempotencia: reprocessar um evento com o mesmo session_id, challenge_id e observed_at nao duplica evidencia nem reaplica transicao. Textos livres em pt-BR; chaves e valores de enum em ingles snake_case sem acento. VERIFICADOR MINIMO: este schema so usa type, required, enum, pattern, items, properties, minimum, maximum e additionalProperties booleano; maxLength e documentacao e NAO e verificado.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "kind", "concept_id", "observed_at"],
  "properties": {
    "schema_version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+$" },
    "setup_id":       { "type": "string", "pattern": "^[0-9a-f]{12}$" },
    "kind":           { "enum": ["challenge", "exposure", "self_report", "review_declined", "decay"] },
    "concept_id":     { "type": "string", "pattern": "^[a-z][a-z0-9_]{1,62}$" },
    "session_id":     { "type": ["string", "null"], "pattern": "^[0-9]{4}$" },
    "challenge_id":   { "type": ["string", "null"], "pattern": "^[0-9]{4}$" },
    "result":         { "enum": ["passed", "failed", "not_attempted", null] },
    "hint_level":     { "type": ["integer", "null"], "minimum": 0, "maximum": 5 },
    "error_type":     { "enum": ["slip", "conceptual", "prerequisite", "none", "unknown", null] },
    "attributed_to":  { "type": ["string", "null"], "pattern": "^[a-z][a-z0-9_]{1,62}$" },
    "attempts":       { "type": ["integer", "null"], "minimum": 0 },
    "self_report_claim": { "enum": ["mastery", "no_mastery", null] },
    "observed_at":    { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    "recorded_at":    { "type": ["string", "null"],
                        "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}([.][0-9]+)?([+-]\\d{2}:\\d{2}|Z)$" },
    "note":           { "type": ["string", "null"], "maxLength": 240 }
  }
}
```

*(As `description` de cada campo estão no arquivo; a semântica normativa de todas elas está
transcrita na tabela abaixo e em §4.3–§4.6.)*

### 4.9.1 Semântica campo a campo

| Campo | Obrigatório | Semântica |
|---|---|---|
| `schema_version` | sim | `MAJOR.MINOR` do formato do evento. Independente da versão de `progress.json`: um evento antigo continua processável enquanto o MAJOR bater |
| `setup_id` | não¹ | Divergente do setup alvo ⇒ **exit 5** — é o que **impede escrita cruzada entre setups** |
| `kind` | sim | `challenge` (único que pode **promover** estado) · `exposure` (**nunca** muda estado) · `self_report` (só rebaixa) · `review_declined` (não altera estado nem intervalo) · `decay` (o único que acontece **fora** de uma sessão) |
| `concept_id` | sim | resolvido por igualdade de string, procurando primeiro em `concept_id` e depois em `aliases[]`. Se o evento trouxer também o rótulo `concept` e os dois discordarem ⇒ **exit 5** |
| `session_id` | quando `kind != decay` | `memory/<id>.json` **tem que existir** |
| `challenge_id` | quando `kind = challenge` | `challenges/<id>-*/` **tem que existir** |
| `result` / `last_result` | quando `kind = challenge` | vocabulário de entrada de 5 valores (`not_run`, `passed`, `failed`, `timeout`, `error`), normalizado no passo 0 (§4.4.2). **O evento nunca traz `result` já mastigado**, porque normalizar é responsabilidade de quem tem a tabela |
| `hint_level` | não | 0..5 ou `null`. **`null` nunca é 0** |
| `error_type` | não | ausente ⇒ `unknown` |
| `attributed_to` | quando `error_type = prerequisite` | `concept_id` do pré-requisito |
| `attempts` | não | inteiro ≥ 0. **Sinal de esforço, não de domínio** |
| `self_report_claim` | quando `kind = self_report` | `mastery` (**nunca promove**) · `no_mastery` (dispara T8). Aceita os apelidos `positive`/`negative` |
| `observed_at` | sim | **VALID TIME**, `AAAA-MM-DD`. É a chave de ordenação. Deliberadamente uma **data**, não um timestamp — a granularidade das regras é o **dia** |
| `recorded_at` | não | **TRANSACTION TIME**, ISO 8601 com offset. Ausente ⇒ `sm_now_iso` |
| `note` | não | pt-BR livre, truncado em 240. `null` é resposta válida e preferível a texto vago |

¹ Opcional quando o script já recebeu a raiz do setup por argumento.

---

## 4.10 O schema de estado — `progress.schema.json`

`$id: urn:study-method:schema:progress:1`. `additionalProperties: false` em **todos** os níveis.
Nenhum `$ref`, `allOf`, `anyOf`, `oneOf`, `if`, `then`, `else` ou `$defs` (**I-08**): o verificador é
stdlib do Python e cobre `type`, `required`, `enum`, `pattern`, `minimum`/`maximum`.

### 4.10.1 Raiz

`required`: `schema_version`, `setup_id`, `recorded_at`, `concepts`.

| Campo | Tipo | Restrição | Semântica |
|---|---|---|---|
| `schema_version` | string | `^[0-9]+\.[0-9]+$` | campo opcional novo = MINOR; campo obrigatório novo, rename ou mudança de tipo = **MAJOR** + migração. Valor corrente `1.0` |
| `setup_id` | string | `^[0-9a-f]{12}$` | um `progress.json` por setup; **conceitos nunca cruzam setups** |
| `declared_skill_level` | string \| null | enum `beginner`, `intermediate`, `advanced`, `null` | **NUNCA participa de transição** (auto-relato não é evidência observável). Calibra só o tom e o andaime inicial |
| `recorded_at` | string | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.][0-9]+)?([+-]\d{2}:\d{2}\|Z)$` | *transaction time* da última escrita |
| `policy` | objeto | `additionalProperties: false` | §4.7.2. Omitir o objeto inteiro = todos os defaults |
| `concepts` | array | — | um registro por conceito, **incluindo os `superseded`** (nunca deletar) |

`policy` — os 7 parâmetros, com tipo e default: `interval_multiplier_mastered` (number, 2.3) ·
`interval_multiplier_fragile` (number, 1.3) · `interval_cap_mastered_days` (integer, 180) ·
`interval_cap_fragile_days` (integer, 21) · `decay_overdue_ratio` (number, 1.0) ·
`mastery_window_days` (integer, 60) · `max_review_suggestions_per_session` (integer, 2).

### 4.10.2 `concepts[]`

`required`: `concept_id`, `label`, `proficiency_state`, `state_reason`, `confidence`,
`first_observed_at`, `observed_at`, `last_observed_at`, `recorded_at`, `status`, `evidence`.

| Campo | Tipo | Restrição | Semântica |
|---|---|---|---|
| `concept_id` | string | `^[a-z][a-z0-9_]{1,62}$` | estável e **IMUTÁVEL** |
| `label` | string | — | pt-BR; **único** campo de nome que pode mudar |
| `aliases` | array de string | — | outras formas pelas quais este conceito já foi chamado; alimenta a busca anti-fragmentação |
| `track_ref` | string \| null | — | `modulo-03#recursao`; `null` para conceito criado fora da trilha |
| `proficiency_state` | string | enum `unknown`, `fragile`, `mastered` | §4.4.1 |
| `state_reason` | string | enum `no_evidence`, `passed_unassisted`, `passed_with_hints`, `failed`, `conceptual_error`, `temporal_decay`, `self_report`, `manual` | §4.4.4 e §4.8.3 |
| `confidence` | string | enum `low`, `medium`, `high` | §4.5.4. **Não é probabilidade** |
| `attempts` | integer | `minimum: 0` | cache derivado |
| `unassisted_passes` | integer | `minimum: 0` | cache derivado; é o contador que dispara a promoção |
| `max_hint_level_used` | integer \| null | `0..5` | `null` **NUNCA** deve ser lido como 0 |
| `last_error_type` | string \| null | enum `slip`, `conceptual`, `prerequisite`, `none`, `unknown`, `null` | §4.6.1 |
| `first_observed_at` | string \| null | `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` | **regra condicional, verificada por asserção do gate e não pelo schema**: `null` só é permitido quando `state_reason = no_evidence` e `evidence[]` está vazio |
| `observed_at` | string \| null | data | *valid time* da evidência que **sustenta o estado atual**. `null` quando `state_reason = no_evidence` |
| `last_observed_at` | string \| null | `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` | *valid time* da evidência mais recente **de qualquer tipo**, inclusive exposição. Alimenta o decaimento. Conceito com `null` **nunca** entra na fila de revisão |
| `recorded_at` | string | pattern de timestamp | *transaction time* do registro |
| `interval_days` | integer | `minimum: 1` | §4.7.2 |
| `next_review_at` | string \| null | data | `observed_at + interval_days`; `null` sem evidência de desafio. **O tutor SUGERE, nunca obriga** |
| `evidence` | array | — | **fonte de verdade** do registro |
| `status` | string | enum `active`, `superseded` | `superseded` = fundido em outro; **permanece no arquivo para auditoria, nunca é deletado** |
| `superseded_by` | string \| null | `^[a-z][a-z0-9_]{1,62}$` | `concept_id` que substituiu este registro |
| `supersedes` | array de string | mesmo pattern | `concept_id`s fundidos **neste** registro |

### 4.10.3 `concepts[].evidence[]`

`required`: `kind`, `observed_at`, `recorded_at`, `state_before`, `state_after`.

| Campo | Tipo | Restrição | Semântica |
|---|---|---|---|
| `kind` | string | enum `challenge`, `exposure`, `self_report`, `review_declined`, `decay` | §4.9.1 |
| `session_id` | string \| null | `^[0-9]{4}$` | `null` **apenas** para `kind: decay`. **Regra condicional do gate**: `memory/<session_id>.json` tem de existir |
| `challenge_id` | string \| null | `^[0-9]{4}$` | obrigatório quando `kind = challenge`. **Regra condicional do gate**: `challenges/<challenge_id>-*/` tem de existir — e é o pattern fixo que **torna essa asserção possível** |
| `observed_at` | string | data | *valid time* |
| `recorded_at` | string | pattern de timestamp | *transaction time*; pode ser bem posterior |
| `result` | string \| null | enum `passed`, `failed`, `not_attempted`, `null` | `null` quando `kind != challenge` |
| `attempts` | integer \| null | `minimum: 0` | — |
| `hint_level` | integer \| null | `0..5` | `null` **NÃO** equivale a 0 |
| `error_type` | string \| null | enum `slip`, `conceptual`, `prerequisite`, `none`, `unknown`, `null` | — |
| `attributed_to` | string \| null | `^[a-z][a-z0-9_]{1,62}$` | onde a evidência penalizante foi gravada |
| `state_before` | string | enum `unknown`, `fragile`, `mastered` | estado imediatamente **antes** |
| `state_after` | string | enum `unknown`, `fragile`, `mastered` | **igual a `state_before` quando o evento registra observação sem mudar o estado — isso é resultado legítimo e deve ser gravado assim mesmo** |
| `transition_rule` | string \| null | enum `T1`..`T8`, `null` | `null` quando o evento não mudou o estado por regra alguma |
| `note` | string \| null | `maxLength: 240` (documentação, **não verificado**) | factual e verificável: o que o aluno fez, não o que o tutor achou |

### 4.10.4 Convenção de idioma no arquivo de dados

Chaves e **vocabulário fechado** (todos os `enum`) em **inglês, `snake_case`, sem acento** — é o
contrato congelado que impede deriva de vocabulário. Os **três** campos de texto livre — `label`,
`aliases[]` e `evidence[].note` — são **pt-BR natural, com acento**, porque são lidos por humanos e
mostrados ao aluno. **Nenhum outro campo aceita texto livre.**

---

## 4.11 Exemplo de leitura da máquina (a aritmética confere)

Cadeia completa de um conceito real (`recursao`, setup `7b3e9a1c4f20`, consultado em 2026-08-23) —
promoção, decaimento e restauração:

| Sessão | Data | Desfecho | Classe | Transição | Estado | `interval_days` | `next_review_at` |
|---|---|---|---|---|---|---|---|
| 0031 | 12/06 | passou, dica 3, `slip`, 4 tentativas | B | **T1** | `unknown` → `fragile` | `max(2, round(1×1,3)) = 2` | 14/06 |
| 0038 | 20/06 | passou, dica 0, 2 tentativas | A | **T7** | `fragile` → `fragile` | `max(3, round(2×1,3)) = 3` | 23/06 |
| 0046 | 28/06 | passou, dica 1, 1 tentativa | A | **T2** | `fragile` → **`mastered`** | `max(4, round(3×2,3)) = 7` | 05/07 |
| — | 12/07 | decaimento: `12/07 − 28/06 = 14 = 2 × 7` | — | **T4** | `mastered` → `fragile` | **7** (preservado) | 05/07 (preservado) |
| 0053 | 10/08 | passou, dica 0, 1 tentativa | A | **T5** | `fragile` → **`mastered`** | `max(8, round(7×2,3)) = 16` | **26/08** |

| Leitura | Conteúdo |
|---|---|
| **T2 em 28/06** | duas passagens classe A (20/06 e 28/06), sessões distintas, 8 dias de distância (≥ 1), ambas dentro dos 60 dias. A de 12/06 **não conta** — era classe B |
| **T4 em 12/07** | `recorded_at` = **10/08T20:38**, `observed_at` = **12/07**. Bitemporalidade real: o fato virou verdade em 12/07, mas **não há daemon** — o sistema só tomou conhecimento ao abrir a sessão 0053 |
| **T5 em 10/08** | a última demoção foi T4 e não houve classe C desde então → **uma** passagem restaura `mastered`. T2 também caberia; T5 tem precedência de rótulo |
| `unassisted_passes: 3` | 0038, 0046, 0053 — nenhum classe C zerou a contagem; **T4 não zera** |
| `confidence: high` | 4 evidências qualificadas, a mais recente há 13 dias |
| `aliases` | inclui `"funções recursivas"`, que é o que impede o id duplicado de renascer |
