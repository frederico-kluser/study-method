# Modelo de proficiência do aluno

> Documento de projeto do repositório (`docs/` do repositório, arquivo `04-proficiencia.md`). Define o estado de proficiência por conceito: o que ele significa, quais eventos observáveis o movem, e o que o tutor pode e não pode dizer sobre ele. É o contrato que `progress-update.sh` (onda 3) implementa.
>
> Artefato de dados que este documento especifica: `skills/study-method/assets/schemas/progress.schema.json`.
> Onde o dado vive em tempo de uso: `memory/progress.json`, dentro do setup do aluno.
> Base de pesquisa: `docs/research/03-pedagogia.md` (repositório) §3 (carga cognitiva / expertise reversal), §4 (desirable difficulties), §6 (modelagem de proficiência / BKT), §7 (SM-2 e FSRS), §9 (taxonomia de erro), §10 (escada de dicas); `docs/research/02-memoria-llm.md` (repositório) §5 (bitemporalidade e decaimento) e §6 (schema design).

## 0. Por que este estado existe, e o que ele não é

O tutor precisa saber **o que o aluno já domina** para reduzir o andaime na medida certa. O *expertise reversal effect* (Kalyuga, Ayres, Chandler & Sweller — `docs/research/03-pedagogia.md` §3.3 no repositório) não é uma sugestão de estilo: o exemplo resolvido linha a linha que ajuda o novato **prejudica** o aluno avançado, porque vira informação redundante que consome memória de trabalho. Sem um estado de proficiência explícito, o tutor entrega à sessão 40 o mesmo andaime da sessão 1 — e isso é um defeito mensurável, não uma preferência.

Três separações que valem para todo o resto do documento:

| Coisa | Onde vive | O que responde |
|---|---|---|
| Memória episódica | `memory/NNNN.json` (sub-tarefa irmã) | *O que aconteceu* naquela sessão |
| **Estado de proficiência** (este documento) | `memory/progress.json` | *Onde o aluno está agora*, e **qual evidência** sustenta isso |
| Banco de analogias | artefato separado | *O que já funcionou* para explicar |

O estado de proficiência é **alimentado** pelos eventos da sessão, e é consultável diretamente — o tutor não relê 40 sessões para descobrir se pode pular o worked example.

### 0.1 ⭐ `progress.json` NÃO é reconstruível a partir das sessões

Essa frase parece um detalhe de implementação e é uma regra de sobrevivência do dado. Apagar
`memory/progress.json` achando que ele se refaz a partir dos `memory/NNNN.json` **perde
informação para sempre**, porque três campos que a máquina de estados exige nunca existiram no
registro de sessão:

| Campo exigido aqui | Existe em `memory/NNNN.json`? | Por que não dá para inferir depois |
|---|---|---|
| `evidence[].error_type` | **não** | É a classificação de §6, feita pelo tutor **no momento** em que ele vê o aluno errar, perguntando "por que você fez assim?". Reconstruir isso meses depois é adivinhar |
| `evidence[].hint_level` | **não** | É o degrau da escada entregue **naquele turno**. A sessão registra que houve ajuda, não em que degrau |
| `evidence[].transition_rule` | **não** | É calculado (`T1`..`T8`) contra o estado que existia **antes** do evento. Sem a sequência de estados, a regra que disparou não é recuperável |

Portanto:

- **`memory/progress.json` é dado primário, não cache.** Ele entra no backup e na purga como
  qualquer outro arquivo de `memory/`, e não há um "reconstruir a partir das sessões".
- **`evidence[]` é a fonte de verdade *dentro* do arquivo.** O que é recomputável é a camada
  escalar — `attempts`, `unassisted_passes`, `max_hint_level_used`, `last_error_type`,
  `observed_at`, `confidence`, `interval_days`, `next_review_at`, `proficiency_state` — a partir
  do array. É isso, e só isso, que o modo `--recompute` faz (§9).
- **Perder o arquivo é perder a proficiência.** O tutor não finge que reconstruiu: ele volta todo
  conceito para `unknown` / `no_evidence` e diz ao aluno que perdeu o registro. Mentir sobre a
  origem do estado é pior que admitir a perda.

E o que ele **não** é: não é uma nota, não é um percentual, não é uma probabilidade bayesiana. BKT (`docs/research/03-pedagogia.md` §6.1 no repositório) precisa estimar quatro parâmetros por habilidade — P(L0), P(T), P(guess), P(slip) — a partir de dados de população. Um único aluno gera **dezenas** de observações por conceito, não os milhares que calibram esses parâmetros. Implementar "BKT" com esses dados produziria um número com aparência de ciência e conteúdo de chute. A alternativa honesta, e a que este documento especifica, é um **estado discreto com regras explícitas, ancoradas em evento observável e auditáveis pelo próprio aluno**.

---

## 1. Granularidade: o que é um "conceito"

Sem uma regra de nomeação estável, "recursão" e "funções recursivas" viram dois conceitos, o progresso se fragmenta em dois registros pela metade, e nenhum dos dois chega a `mastered`. A regra abaixo é normativa.

### 1.1 Definição operacional

Um **conceito** é a menor unidade que satisfaz as três condições ao mesmo tempo:

1. **É alvo de um desafio verificável.** Existe (ou pode existir) um desafio em `challenges/` cujo teste passa ou falha por causa deste conceito especificamente.
2. **Falha de forma independente.** É possível o aluno dominar o conceito vizinho e errar este, e vice-versa.
3. **Cabe em um exercício de 5 a 30 minutos.** Mais fino que isso vira ruído (`ponto_e_virgula`); mais grosso vira um módulo inteiro (`programacao_orientada_a_objetos`), que nunca chega a `mastered` porque nunca é testado por inteiro.

Régua de sanidade: um módulo da trilha deve gerar entre **3 e 7** conceitos. Menos que 3 é granularidade grossa demais; mais que 7 é fina demais.

### 1.2 Regra de nomeação (anti-fragmentação)

1. **A trilha é a fonte canônica.** Os conceitos são declarados na trilha, no `docs/` do setup. O tutor não inventa vocabulário durante a conversa.
2. **`concept_id` é derivado mecanicamente do rótulo canônico**: minúsculas, ASCII sem acento, espaços e hífens viram `_`, stopwords removidas (`de`, `da`, `do`, `em`, `e`, `a`, `o`, `por`, `com`). `Indução matemática` → `inducao_matematica`. Regex: `^[a-z][a-z0-9_]{1,62}$`.
3. **Busca obrigatória antes de criar.** Antes de escrever um `concept_id` novo, é obrigatório procurar o rótulo normalizado em **todos** os `concept_id` e em **todos** os `aliases[]` do arquivo. Se casar, reusa o id existente e **acrescenta o rótulo novo em `aliases[]`**. Criar um segundo id para a mesma coisa é defeito.
4. **`concept_id` é imutável.** Renomear acontece só em `label`. Reescrever um id quebra toda a evidência histórica que aponta para ele.
5. **Fusão de duplicatas é bitemporal, não destrutiva.** Detectada a duplicata, a evidência do duplicado é copiada para o sobrevivente, o duplicado recebe `status: superseded` + `superseded_by`, e o sobrevivente registra `supersedes: [...]`. Nada é deletado — é assim que se audita por que o histórico mudou (`docs/research/02-memoria-llm.md` §5 no repositório).
6. **Exceção controlada — pré-requisito descoberto.** O tutor **pode** criar um conceito fora da trilha quando um erro revela um pré-requisito não previsto (o aluno erra álgebra dentro de um desafio de derivada). Nesse caso `track_ref: null`, e o conceito entra na fila de estudo, não na de revisão. Essa é a **única** criação ad hoc permitida.

### 1.3 Os três identificadores que este arquivo usa (normativo)

Um identificador com dois formatos em dois documentos é um bug garantido no dia em que alguém
cruzar os dois arquivos. Estes são os formatos, e valem em todo o produto — schema, exemplo,
prosa e script:

| Campo | Formato | Regex | Exemplo | Onde é a fonte |
|---|---|---|---|---|
| `setup_id` | 12 dígitos hexadecimais minúsculos, sorteados na criação | `^[0-9a-f]{12}$` | `7b3e9a1c4f20` | `setup.json` na raiz do setup |
| `concept_id` | `snake_case`, ASCII sem acento | `^[a-z][a-z0-9_]{1,62}$` | `inducao_matematica` | derivado do rótulo canônico da trilha (§1.2) |
| `challenge_id` | 4 dígitos com zero à esquerda | `^[0-9]{4}$` | `0031` | o mesmo número que prefixa `challenges/<NNNN>-<slug>/` |

Três armadilhas que essa tabela fecha:

- **`setup_id` não é o nome do diretório.** Ele é sorteado, imutável, e sobrevive a mover,
  renomear e reinstalar o setup. Um `setup_id` legível como `algoritmos_discreta` parece amigável
  e quebra no dia em que a pessoa renomeia a pasta — a identidade passaria a depender do caminho,
  que é justamente o que ela não pode fazer.
- **`challenge_id` é só o número.** O slug vive no nome do diretório e no `slug` do manifesto do
  desafio, nunca dentro do id. `"c-0031-fatorial"` embute três coisas num campo só, e o dia em que
  o slug for corrigido, toda evidência histórica passa a apontar para um id que não existe mais.
- **Identificador de conceito é `snake_case` em todo o sistema** — não `kebab-case`, não com
  acento, não com maiúscula. `track_ref` é a única exceção próxima e não é um id: é um ponteiro
  para a trilha (`modulo-02#recursao`), no formato do documento de trilha, não deste arquivo.

---

## 2. Os sinais observáveis

Todo sinal abaixo é coletado de um artefato que existe no repositório do setup. Nenhum vem de impressão do modelo.

| Sinal | Campo | Quem registra | Em que passo da sessão | Ausência significa |
|---|---|---|---|---|
| Tentativas até passar | `evidence[].attempts` | o runner de desafio (onda 3) | passo de verificação, ao encerrar o desafio | `null` — o desafio não teve verificação automática |
| Nível máximo de dica | `evidence[].hint_level` (0–5) | o tutor, no momento em que entrega a dica | passo de resolução, a cada degrau subido | `null` — **nunca** ler como 0 |
| Tipo de erro | `evidence[].error_type` | o tutor, aplicando a regra da §6 | passo de análise da falha, antes de responder | `unknown` — não chutar |
| Tempo na tarefa | *não persistido como campo de estado* | — | — | ver §2.2 |
| Recência | `last_observed_at` / `observed_at` | derivado, sempre presente | consolidação da sessão | nunca falta |
| Auto-relato | `evidence[].kind = self_report` | o tutor, ao fechar a sessão | passo de encerramento, uma pergunta só | ausente — não é penalidade |

### 2.1 Regras duras de coleta

- **`hint_level = null` ≠ `hint_level = 0`.** Ausência de registro não é prova de autonomia. Um desafio sem `hint_level` registrado **não** conta como passagem sem dica e portanto **não** promove ninguém.
- **Exposição não é evidência de aprendizagem.** O conceito ter sido explicado, lido ou discutido gera `kind: exposure`, atualiza `last_observed_at` e **nunca** muda `proficiency_state`. Explicar não é aprender.
- **Auto-relato é assimétrico.** O aluno dizer "acho que entendi" **nunca** promove (excesso de confiança é o modo de falha padrão do auto-relato — `docs/research/03-pedagogia.md` §6.2 no repositório). O aluno dizer "não peguei isso" **pode** rebaixar `mastered` → `fragile` (T8) e sempre pode disparar uma checagem. A assimetria é deliberada: um relato negativo é informação que o tutor não tem de outra fonte; um relato positivo é justamente o que a evidência de desafio existe para verificar.
- **Nenhuma transição sem artefato.** `progress-update.sh` só grava transição cuja evidência aponte para um `session_id` (e `challenge_id`, quando `kind: challenge`) que existe de fato em `memory/` e `challenges/`. Sem artefato, sem transição. É essa regra que impede o modelo de "sentir" que o aluno melhorou.

### 2.2 Tempo: por que ele não vira estado

Tempo de parede numa conversa não mede esforço cognitivo — o aluno foi fazer café, atendeu o telefone, dormiu. Um sinal com essa razão sinal/ruído não pode disparar mudança de estado. Uso permitido, e único: **gatilho de frustração dentro da sessão corrente** — muito tempo sem edição depois de uma dica é sinal de impasse silencioso e manda subir a escada de dicas (`docs/research/03-pedagogia.md` §10 no repositório, regra "tempo parado também é gatilho"). Esse uso é volátil, vive na sessão, e não é persistido em `progress.json`.

### 2.3 Quando não existe sinal nenhum

O aluno nunca fez um desafio deste conceito. Então:

- `proficiency_state: unknown`, `state_reason: no_evidence`, `confidence: low`, `observed_at: null`, `next_review_at: null`.
- O conceito **não entra na fila de revisão** (revisão é para `fragile` e `mastered`); ele entra na fila de estudo normal da trilha.
- O andaime inicial é o de novato (§7), calibrado no tom por `declared_skill_level` — que é auto-declarado e por isso **nunca** participa de transição.
- E o tutor **não** diz "você não sabe isso". Diz "não tenho registro seu neste tópico" (§4).

---

## 3. ⭐ A máquina de estados

### 3.1 Os três estados

Os estados são afirmações sobre **a evidência que o tutor tem**, não sobre o cérebro do aluno. Essa leitura resolve a ambiguidade de `unknown`: ele significa *eu não sei*, não *o aluno não sabe*.

| Estado | Significado exato | Cobre os casos |
|---|---|---|
| `unknown` | Não há evidência de sucesso autônomo | (a) nunca tentou; (b) tentou e não passou; (c) passou **só** com dica de nível 4–5 — nesse caso a solução foi entregue, o sucesso é do tutor |
| `fragile` | Há evidência de sucesso, mas ela não sustenta domínio | (a) passou com dica de nível 2–3; (b) passou sem dica **uma única vez** (falta a confirmação espaçada); (c) regrediu de `mastered` |
| `mastered` | Duas passagens sem dica (nível 0–1), em **sessões distintas** separadas por **≥ 1 dia**, ambas dentro de `mastery_window_days` (default 60), sem erro conceitual na janela | — |

Por que "sessões distintas separadas por ≥ 1 dia": dois acertos na mesma tarde são *massed practice*, que produz bom desempenho durante a prática e retenção pior (Bjork, `docs/research/03-pedagogia.md` §4.1–4.2 no repositório). Só a passagem espaçada é evidência de retenção.

### 3.2 Classes de desfecho de um desafio

Toda regra abaixo usa três classes, calculadas de um evento `kind: challenge`. A ordem de teste é fixa; a primeira que casar vence.

| Classe | Condição | Leitura |
|---|---|---|
| **C** — entregue ou falho | `result = failed` **OU** `hint_level >= 4` **OU** `error_type = conceptual` | Não há evidência de autonomia. Dica 4–5 é worked example ou solução comentada: o trabalho cognitivo foi do tutor |
| **B** — assistido | `result = passed` **E** `hint_level` ∈ {2, 3} | Passou com pista conceitual ou localizadora |
| **A** — autônomo | `result = passed` **E** `hint_level` ∈ {0, 1} **E** `error_type` ∈ {`none`, `slip`} | Passou sozinho ou com um redirecionamento de atenção |

Note que **`error_type = conceptual` joga o evento na classe C mesmo com o teste passando**. Um aluno pode fazer o teste passar carregando uma regra errada (`docs/research/03-pedagogia.md` §9.1 no repositório, Brown & Burton) — o teste verde não apaga o equívoco.
E `hint_level = null` **não** é 0. Um `challenge` com `result = passed` e `hint_level = null` cai em **classe B** — sem registro do degrau, não se credita autonomia. É a escolha conservadora, e é o que garante que as três classes cobrem todos os eventos `kind: challenge` sem sobra.

Um `challenge` com `result: not_attempted` **não é classificado em classe nenhuma**: o aluno não tentou, e não tentar não é evidência de falha. Ele grava evidência, atualiza `last_observed_at` e **não** muda estado nem `interval_days` — mesmo tratamento de `review_declined`.

#### ⭐ De onde vem `result`: o mapeamento normalizador

`evidence[].result` tem **três** valores (`passed`, `failed`, `not_attempted`). O manifesto do desafio, de onde o evento nasce, tem **cinco** (`student_progress.last_result` ∈ `not_run`, `passed`, `failed`, `timeout`, `error`). A conversão é obrigatória e acontece **antes** da classificação, no passo 0 da §3.5:

| `student_progress.last_result` | → `evidence[].result` | Por quê |
|---|---|---|
| `passed` | `passed` | — |
| `failed` | `failed` | — |
| **`timeout`** | **`failed`** | O código do aluno não terminou. É falha de resolução, com um diagnóstico diferente para a conversa — mas nunca evidência de autonomia |
| **`error`** | **`failed`** | O código não rodou. Idem |
| `not_run` | `not_attempted` | Proposto e não tentado |

**Este mapeamento existe por causa de um defeito real, e vale a pena nomeá-lo** para que ninguém o reintroduza. Sem ele, um `last_result: "timeout"` chega à classificação e não casa nem com `result = failed` (classe C) nem com `result = passed` (classe A) — cai no "caso contrário" e vira **classe B**. Consequência: um aluno cujo código entrou em laço infinito é **promovido** de `unknown` para `fragile` pela T1, com `state_reason: passed_with_hints`. O sistema passa a afirmar que há evidência de sucesso onde houve um travamento. O mesmo vale para `error`.

**Regra dura**: `evidence[].result` só aceita os três valores do enum. Um evento que chegue a `progress-update.sh` com qualquer outro valor é **rejeitado** (exit 5, `validação falhou`), nunca normalizado por adivinhação e nunca deixado cair no ramo `B`.

Um evento com `error_type: prerequisite` **não é classificado no conceito alvo**: no alvo ele é gravado como `kind: exposure` (que nunca muda estado) e a evidência penalizante vai inteira para o conceito do pré-requisito, onde é classificada normalmente (§6.4).

### 3.3 As transições

Cada transição nomeia o **evento** que a dispara, **quantas ocorrências** e **em que janela**. `progress-update.sh` grava o identificador (`T1`..`T8`) em `evidence[].transition_rule`.

| ID | De → Para | Evento disparador | Ocorrências | Janela | `state_reason` |
|---|---|---|---|---|---|
| **T1** | `unknown` → `fragile` | desafio classe **A** ou **B** | 1 | — | `passed_unassisted` (A) / `passed_with_hints` (B) |
| **T2** | `fragile` → `mastered` | desafio classe **A** | **2**, em `session_id` distintos e com `observed_at` diferindo em **≥ 1 dia** | as duas dentro de `mastery_window_days` (60d) e **posteriores ao último evento classe C** | `passed_unassisted` |
| **T3** | `mastered` → `fragile` | desafio classe **B** ou **C** | 1 | — | `passed_with_hints` / `failed` / `conceptual_error` |
| **T4** | `mastered` → `fragile` | **decaimento temporal**: `hoje - observed_at >= (1 + decay_overdue_ratio) × interval_days` (default: `>= 2 × interval_days`) | 1 | — | `temporal_decay` |
| **T5** | `fragile` → `mastered` | desafio classe **A** | **1** | só se a última demoção deste conceito foi **T4** e **não houve evento classe C desde então** | `passed_unassisted` |
| **T6** | `fragile` → `unknown` | desafio classe **C** com `error_type = conceptual` | **2 consecutivos**, em `session_id` distintos, **sem nenhuma passagem entre eles** | — | `conceptual_error` |
| **T7** | X → X (auto-laço) | qualquer evento que não case com as regras acima | 1 | — | atualizado conforme o desfecho |
| **T8** | `mastered` → `fragile` | auto-relato explícito de não-domínio (`kind: self_report`) | 1 | — | `self_report` |

**T7 é uma transição de verdade**, não "nada aconteceu": ela grava evidência, atualiza `attempts`, `last_observed_at`, `interval_days` e `confidence`. Estado igual com evidência nova é um resultado legítimo e precisa aparecer no arquivo.

### 3.4 Decaimento (T4) é diferente de falha (T3) — e o tratamento é diferente

Essa distinção é a razão de `state_reason` existir.

|  | T3 — falha observada | T4 — decaimento temporal |
|---|---|---|
| Evidência | o aluno errou, ou precisou de ajuda | **ausência** de observação; ninguém errou nada |
| Efeito em `interval_days` | reset para 1 (classe C) ou ×1,3 (classe B) | **nenhum** — o intervalo é preservado |
| Efeito em `unassisted_passes` | zera a contagem (evento classe C) | **não zera** |
| Volta para `mastered` | pela regra normal, T2 (2 passagens espaçadas) | por **T5**, com **uma única** passagem autônoma |
| Comportamento do tutor | reensino: analogia nova, worked example, escada a partir de degrau mais alto | **checagem de recall curta**, não reensino |

A justificativa de T5 vem direto de Bjork (`docs/research/03-pedagogia.md` §4.1 no repositório): força de armazenamento é permanente e só cresce; o que decai é a força de recuperação. Um recall bem-sucedido depois de um intervalo longo restaura a recuperação — e, no modelo, é justamente o recall difícil que produz o maior ganho. Exigir duas confirmações de quem só ficou tempo sem revisar seria punir o aluno pela passagem do tempo.

Nota de honestidade: `decay_overdue_ratio` **não é um achado empírico**. A curva de Ebbinghaus (`docs/research/02-memoria-llm.md` §5 no repositório) diz que esquecer é rápido e exponencial, não diz em que dia rebaixar o rótulo. O default (rebaixar quando o atraso iguala o próprio intervalo) é escolha de produto, fica em `policy` no arquivo de dados, e está na tabela de decisões abertas (D-P03).

### 3.5 Ordem de avaliação (determinística)

`progress-update.sh` processa **um evento por vez**, na ordem cronológica de `observed_at`, e aplica exatamente esta sequência:

```
0. NORMALIZA o evento (§3.2): last_result -> result, pela tabela de mapeamento.
       passed -> passed | failed|timeout|error -> failed | not_run -> not_attempted
   valor fora do enum de result, kind ou error_type => REJEITA o evento (exit 5). Nunca
   assume um default; um evento malformado não vira classe B por omissão.
1. resolve concept_id  (busca em concept_id + aliases[]; cria só se for pré-requisito novo)
2. state_before := proficiency_state atual
3. se kind ∈ {exposure, review_declined}:
       state_after := state_before ; transition_rule := null
       atualiza last_observed_at ; NÃO mexe em interval_days nem em next_review_at ; FIM
4. se kind = self_report:
       se relato é de não-domínio e state_before = mastered  → T8 → fragile
       senão → T7 sem mudança de estado ; FIM
5. se kind = decay:
       → T4 → fragile (só se state_before = mastered) ; interval_days preservado ; FIM
6. se kind = challenge:
       se result = not_attempted: grava evidência, state_after := state_before ; FIM
       se error_type = prerequisite: regrava como kind=exposure no alvo e
                                     repete o passo 1 no concept_id de attributed_to ; FIM
       classe := C se (result = failed ou hint_level >= 4 ou error_type = conceptual)
                 A se (result = passed e hint_level ∈ {0,1} e error_type ∈ {none, slip})
                 B se (result = passed)          <- e só aqui; o passo 0 garante que
                                                    result já é um dos três do enum
       (nenhum outro valor alcança este ponto: not_attempted saiu acima, e qualquer
        valor fora do enum foi rejeitado no passo 0. Não existe ramo "caso contrário".)
       conforme state_before:
         mastered : classe B|C → T3 → fragile        | classe A → T7 (segue mastered)
         fragile  : classe A   → T5 se aplicável, senão T2 se aplicável, senão T7
                    classe B   → T7
                    classe C   → T6 se 2ª conceitual consecutiva, senão T7
         unknown  : classe A|B → T1 → fragile        | classe C → T7
7. recalcula interval_days e next_review_at (§5.1)
8. recalcula caches derivados: attempts, unassisted_passes, max_hint_level_used,
   last_error_type, observed_at, last_observed_at, confidence, recorded_at
9. anexa a entrada em evidence[] com state_before, state_after e transition_rule
```

Precedência de T5 sobre T2 é só de rotulagem (as duas levam a `mastered`); registrar T5 preserva a informação de que a promoção veio de uma restauração pós-decaimento.

`evidence[]` é a **fonte de verdade**. Todo campo escalar do conceito é cache derivado e deve ser recomputável do zero a partir do array — se `progress-update.sh` e uma releitura de `evidence[]` discordarem, o array vence.

### 3.6 Contagem de `unassisted_passes`

Contam apenas os eventos classe **A** com `observed_at` **posterior ao último evento classe C** e posterior à última transição T6. Um evento T4 (decaimento) **não** interrompe a contagem — ele não é uma falha.

---

## 4. ⭐ Honestidade epistêmica: o que o tutor pode e não pode dizer

### 4.1 A regra dura

> **É proibido reportar ao aluno qualquer porcentagem de domínio, score numérico, nota, barra de progresso por conceito ou "confiança" numérica.**

Não é uma preferência de estilo. Com um único aluno e um punhado de observações por conceito, um número de 0 a 100 é teatro:

- **A estatística não existe.** BKT precisa de quatro parâmetros por habilidade calibrados em dados de população (`docs/research/03-pedagogia.md` §6.1 no repositório). O aluno gera dezenas de observações. Um "87%" derivado de 3 tentativas tem incerteza que cobre quase toda a escala — o número comunica uma precisão que o dado não tem.
- **É bajulação quantificada.** LLMs afirmam as ações do usuário ~50% mais do que humanos (Cheng et al., arXiv 2510.01395, via `docs/research/03-pedagogia.md` §8.3 no repositório), e LLMs bajuladores **enganam ativamente novatos** em tarefas de resolução de problema (arXiv 2510.03667). Um número inflado é o veículo mais eficiente disso: parece objetivo e não pode ser contestado.
- **Quebra a régua interna do aluno.** Se o número sobe sempre, ele para de carregar informação — exatamente o mecanismo que destrói o valor do elogio genérico (`docs/research/03-pedagogia.md` §8.3 no repositório).

### 4.2 Tabela do permitido e do proibido

| ❌ Proibido | ✅ Permitido no lugar |
|---|---|
| "Você domina recursão em 87%." | "Você passou nos 3 últimos desafios de recursão sem dica — o mais recente foi em 10/08." |
| "Sua proficiência em indução é 2/10." | "Não tenho nenhum registro seu de desafio de indução com teste passando. Isso está como `unknown`: quer dizer que **eu** não sei, não que você não saiba." |
| "Confiança do modelo: 0,62." | "Só tenho uma observação disso, e é de junho — vale reconferir." |
| "Você concluiu 62% da trilha." | "8 dos 23 conceitos da trilha estão em `mastered`; 6 em `fragile`." |
| "Nível 7 de 10 em complexidade." | "Nos dois desafios de complexidade você chegou ao fim, mas nos dois precisou de dica conceitual — por isso está como `fragile`." |
| "Você melhorou muito!" (sem lastro) | "Na sessão 0031 você precisou de dica nível 3 em recursão; nas duas últimas, nível 0." |
| "Estimo 70% de chance de você lembrar disso semana que vem." | "Faz 13 dias desde a última vez; o intervalo atual é de 16 dias, então isso volta na fila por volta de 26/08." |

### 4.3 Onde fica a fronteira

**Contagem de evento real é permitida. Estimativa derivada é proibida.**

- "3 de 4 desafios", "2 sessões espaçadas", "8 de 23 conceitos em `mastered`" → contagens verdadeiras de fatos registrados. Permitido.
- "62% da trilha dominado", "78% de retenção prevista", "score 7,4" → conversões que fingem medir uma grandeza contínua que ninguém mediu. Proibido — inclusive a conversão de uma contagem verdadeira em percentual de domínio, porque é a leitura "62% dominado" que o aluno faz, não "62% dos rótulos".
- **`confidence` no schema não é probabilidade.** É a confiança do tutor na **classificação**, derivada mecanicamente da quantidade e da idade da evidência (§4.4), e é enum (`low|medium|high`), nunca número. Ela nunca é apresentada como "chance de o aluno saber".
- **Nunca dizer que `unknown` significa incompetência.** `unknown` é uma afirmação sobre o arquivo, não sobre a pessoa.

### 4.4 Derivação de `confidence` (mecânica, não opinião)

Contam como *evidência qualificada* apenas entradas `kind: challenge` com `result` ∈ {`passed`, `failed`}.

| Valor | Condição |
|---|---|
| `high` | ≥ 2 evidências qualificadas **e** a mais recente com ≤ 30 dias |
| `medium` | exatamente 1 evidência qualificada, **ou** ≥ 2 com a mais recente entre 31 e 90 dias |
| `low` | nenhuma evidência qualificada (só exposição / auto-relato), **ou** a mais recente com > 90 dias |

`confidence: high` com `proficiency_state: unknown` é uma combinação normal e útil: quer dizer "tenho boa evidência de que ainda não há evidência de domínio".

---

## 5. Repetição espaçada mínima viável

### 5.1 Por que não SM-2 nem FSRS

Nenhum dos dois serve a um tutor de arquivos (`docs/research/03-pedagogia.md` §7 no repositório):

- **SM-2** exige uma nota de 0 a 5 do próprio aluno a cada revisão ("quão fácil foi lembrar"). Isso é fricção de app de flashcard dentro de um bate-papo, e é auto-relato — o sinal mais fraco que temos (§2.1).
- **FSRS** tem ~19 parâmetros treináveis, calibrados sobre dezenas a centenas de revisões por usuário. Um aluno com um punhado de conceitos nunca gera esse volume; treinar 19 parâmetros nesses dados é *overfitting* com cara de ciência.

O que se preserva dos dois: **o espírito**. Menos revisão para o que está sólido, mais para o que é frágil, com crescimento aproximadamente exponencial do intervalo — e o "rating" **inferido do comportamento observado** em vez de pedido ao aluno. Os dados já estão sendo coletados para a §2; a repetição espaçada os reaproveita de graça.

### 5.2 A regra de intervalo

`interval_days` começa em **1**. A cada evento `kind: challenge`, o novo intervalo depende **da classe do desfecho** (§3.2) e do **estado resultante**:

| Classe do desfecho | Estado resultante | Novo `interval_days` | Teto |
|---|---|---|---|
| **A** (autônomo) | `mastered` | `max(anterior + 1, round(anterior × 2,3))` | 180 dias |
| **A** (autônomo) | `fragile` | `max(anterior + 1, round(anterior × 1,3))` | 21 dias |
| **B** (assistido) | `fragile` | `max(anterior + 1, round(anterior × 1,3))` | 21 dias |
| **C** (entregue ou falho) | qualquer | **1** (reset) | — |

- `round` é meio-para-cima. O termo `anterior + 1` existe porque `round(1 × 1,3) = 1` deixaria o intervalo travado em 1 para sempre no ramo frágil.
- **T4 (decaimento) não mexe em `interval_days`.** Rebaixar por tempo não é punição; o intervalo aprendido continua válido.
- Eventos `exposure`, `review_declined` e `self_report` não alteram intervalo.
- `next_review_at = observed_at + interval_days`. Fica `null` enquanto não houver nenhuma evidência `kind: challenge`.
- **Os tetos são aplicados no momento do recálculo, nunca retroativamente.** Um conceito que decaiu de `mastered` (teto 180) para `fragile` (teto 21) mantém o `interval_days` que tinha; o teto de `fragile` só morde no próximo evento que recalcular o intervalo. Isso vale igualmente para T4 e T8, que não tocam em `interval_days`.

Os multiplicadores (2,3 e 1,3), os tetos e o gatilho de decaimento vivem em `policy`, dentro do próprio `progress.json` — são **escolhas de produto**, não constantes da natureza, e por isso ficam versionadas junto com o dado, auditáveis e ajustáveis sem tocar em código (D-P03, D-P06).

### 5.3 Como o intervalo é usado na abertura da sessão

Passo de abertura, antes de propor conteúdo novo:

1. **Filtra**: `status = active` **E** `next_review_at != null` **E** `next_review_at <= hoje` **E** `proficiency_state` ∈ {`fragile`, `mastered`}.
   `unknown` **não entra na fila de revisão** — não se revisa o que nunca foi aprendido; ele segue na fila de estudo da trilha.
2. **Aplica o decaimento com avaliação preguiçosa**: para cada `mastered` cujo atraso cruzou o limiar de T4, grava agora a evidência `kind: decay` com `observed_at` = a data em que o limiar foi cruzado e `recorded_at` = agora. Não existe daemon; é exatamente o caso bitemporal do `docs/research/02-memoria-llm.md` §5 no repositório — o fato virou verdade antes de o sistema tomar conhecimento dele.
3. **Ordena**: `fragile` antes de `mastered`; dentro de cada grupo, maior atraso relativo (`(hoje - next_review_at) / interval_days`) primeiro.
4. **Intercala** (Bjork, `docs/research/03-pedagogia.md` §4.2 no repositório): havendo dois ou mais candidatos, não sugerir dois do mesmo módulo (`track_ref`) quando existir alternativa vencida de outro módulo. Sequência homogênea não treina a decisão de *qual* técnica usar.
5. **Corta** em `policy.max_review_suggestions_per_session` (default 2).
6. **Sugere, não obriga.** "Recursão está vencida há 3 dias — quer 5 minutos nisso antes de a gente seguir?" Se o aluno recusa: grava `kind: review_declined`, **sem** alterar estado nem intervalo.
7. **Anti-insistência**: após **3 recusas consecutivas** do mesmo conceito, o tutor diz **uma vez**, de forma factual e sem chantagem, qual é o custo ("esse é o terceiro adiamento; ele estava em `mastered` e já caiu para `fragile` por tempo"), adia `next_review_at` em 7 dias e para de sugerir aquele conceito nesse intervalo. Repetir a mesma sugestão em toda abertura é ruído, e ruído é ignorado.

---

## 6. Classificação de erro: deslize vs. equívoco conceitual

A distinção vem de Norman (*action slips*) e da linha Brown & Burton / Brown & VanLehn sobre erros procedurais (`docs/research/03-pedagogia.md` §9.1 no repositório). Ela importa porque a **intervenção certa é diferente** — e porque ela alimenta tanto o estado de proficiência (classe C na §3.2) quanto o degrau inicial da escada de dicas (§7).

### 6.1 As definições

- **`slip` (deslize)**: o aluno **sabe** o procedimento e executa errado por descuido momentâneo. É local, não regido por regra, e não se repete depois de apontado.
- **`conceptual` (equívoco conceitual)**: o aluno aplica uma regra **coerente porém errada**. Não é aleatório — é sistemático, reaparece em contextos diferentes, e **não se autocorrige errando de novo**, porque a regra interna dele continua produzindo o mesmo bug até o modelo mental ser corrigido.
- **`prerequisite`**: a falha observada aqui foi causada por outro conceito (§6.4).
- **`none`**: passou sem erro relevante.
- **`unknown`**: não deu para classificar. **Nunca chutar** — `unknown` não dispara T6 nem regressão por erro conceitual.

### 6.2 O teste de decisão (ordem fixa, primeira resposta afirmativa vence)

1. O aluno corrige com **dica de nível 1** (redirecionamento de atenção, sem nomear o conceito) e não repete o erro no mesmo desafio? → **`slip`**
2. O **mesmo padrão** de erro aparece em **2 ou mais lugares** — duas linhas do mesmo artefato, ou dois desafios distintos? → **`conceptual`**
3. O aluno **verbaliza** uma justificativa para o que fez, e a justificativa é internamente coerente mas errada? → **`conceptual`**
4. A correção exigiu **nomear ou reexplicar o princípio** (dica de nível ≥ 2)? → **`conceptual`**
5. Nenhuma das anteriores é decidível com o que está registrado? → **`unknown`**

O passo 3 é o mais informativo e o mais barato: basta perguntar "por que você fez assim?". Uma resposta coerente e errada é a assinatura de um *mind bug*; um "sei lá, foi sem querer" é a assinatura de um deslize.

### 6.3 Exemplos concretos

**Programação**

| Observado | Classificação | Por quê |
|---|---|---|
| `if x = 5:` em Python, corrigido de imediato ao "relê essa linha" | `slip` | Convenção de sintaxe que ele já usa certo em outros pontos do mesmo arquivo (teste 1) |
| Trocou a ordem de `range(start, stop)` uma vez, acertando nas outras 3 chamadas do arquivo | `slip` | Não é regido por regra — as outras chamadas provam que a regra certa está lá (teste 1) |
| `fatorial` sem caso base **e**, no desafio seguinte, `soma_lista` também sem caso base | `conceptual` | Mesma regra errada ("recursão é só a função se chamar de novo") em dois contextos (teste 2) |
| `b = a` com listas e afirma "copiei a lista" | `conceptual` | Verbaliza uma regra coerente e errada — a analogia de "variável é uma caixa" esticada além do limite (teste 3; `docs/research/03-pedagogia.md` §2.2 no repositório) |
| `range(1, n)` esperando incluir `n`, em três exercícios seguidos | `conceptual` | Off-by-one regido por regra, não descuido (teste 2) |
| 40 execuções falhas, todas por erro de sintaxe, com o algoritmo correto desde a primeira | `slip` | Muitas tentativas **não** rebaixam o estado quando os erros são deslizes (`docs/research/03-pedagogia.md` §6.2 no repositório) |

**Matemática (via código)**

| Observado | Classificação | Por quê |
|---|---|---|
| Trocou um sinal ao passar o termo de lado, uma vez, acertando nas outras 4 linhas da derivação | `slip` | Local, não repetido (teste 1) |
| Escreveu `log(a+b) == log(a) + log(b)` no teste **e**, depois, `sqrt(a+b) == sqrt(a) + sqrt(b)` | `conceptual` | Distributividade superaplicada: uma regra coerente e falsa, em dois contextos (teste 2) |
| Calculou juros compostos como `P * (1 + i*n)` e defendeu "juros compostos é a taxa vezes o tempo" | `conceptual` | Justificativa coerente e errada (teste 3) |
| No passo indutivo, assumiu a tese para `n+1` para provar `n+1` | `conceptual` | Circularidade regida por regra; reaparece em toda prova por indução até o princípio ser corrigido |

### 6.4 Erro de pré-requisito: não contamine o conceito alvo

O aluno erra **álgebra** dentro de um desafio de **derivada**. Se isso rebaixar `derivada`, o modelo passa a mentir sobre onde está o problema.

Regra: quando o erro é de um conceito diferente do alvo do desafio,
1. a evidência **penalizante** é gravada no `concept_id` do **pré-requisito** (criando-o com `track_ref: null`, se preciso — é a exceção da §1.2);
2. o conceito **alvo** recebe uma evidência de `kind: exposure` com `error_type: prerequisite` e `attributed_to` apontando para o pré-requisito — `exposure` nunca muda estado, então o alvo não é rebaixado por um erro que não é dele;
3. a fila de estudo passa a priorizar o pré-requisito.

Isso mantém o diagnóstico apontando para o lugar certo — que é o motivo inteiro de classificar erro.

### 6.5 O que a classificação muda no feedback imediato

Derivado de `docs/research/03-pedagogia.md` §9.2–9.3 no repositório:

- **`slip`** → apontamento **imediato** e mínimo. Não há nada para o aluno descobrir num `=` em vez de `==`; deixar o erro rodar só consolida hábito ruim. Sem reensino, sem analogia.
- **`conceptual`** → **atraso deliberado**: deixar o erro acontecer, perguntar "o que rodou primeiro que quebrou?", deixar o aluno rastrear o próprio raciocínio — e só então intervir, começando por um degrau conceitual da escada (nível ≥ 2). O atraso para no ponto de frustração, não antes.
- **`conceptual` recorrente (2ª ou 3ª vez)** → dizer o padrão em voz alta ("é a terceira vez que a condição de parada erra do mesmo jeito"), e **trocar de estratégia**: analogia nova do banco de analogias em vez de repetir os mesmos degraus que já não funcionaram. Esconder o padrão para "não desanimar" é bajulação por omissão.

---

## 7. ⭐ O que o estado muda no comportamento do tutor (expertise reversal)

O *expertise reversal effect* (`docs/research/03-pedagogia.md` §3.3 no repositório) diz que o andaime tem que **encolher** conforme a proficiência sobe, senão vira carga extra. Aqui está o que isso significa, concretamente, em cada estado.

| | `unknown` | `fragile` | `mastered` |
|---|---|---|---|
| **Antes de pedir a tentativa** | **Worked example completo** + template rodável. É o *worked example effect*: para novato, estudar exemplo resolvido ensina mais que resolver do zero (§3.2 da pesquisa) | **Exemplo parcial** (problema de completar: metade resolvido, metade em aberto) **ou** só o enunciado + uma linha lembrando o princípio | **Nada.** Só o enunciado — e de preferência uma **variação** do problema já visto, não a repetição dele (interleaving / transferência) |
| **Primeiro degrau da escada ao travar** | **2** (pista conceitual). Insistir no nível 1 com quem não tem esquema nenhum é o *assistance dilemma* pendendo para a frustração | **1** (redirecionamento de atenção) | **1** — e antes dele, uma pergunta de recuperação: "como você atacaria?" |
| **Teto da escada** | 5 | 5 | **3** por convenção. Se precisou de 4–5, isso **é** a evidência que rebaixa o estado (T3) — e está certo assim |
| **Reexplicar o conceito** | Sim, com a analogia do banco | Só o princípio, em uma linha | **Não.** Reexplicar para quem domina é redundância que consome memória de trabalho — o efeito em ação |
| **Analogia** | Introduzir com o mapeamento relacional explícito | Reusar a que já funcionou, só se o aluno travar | **Aposentar.** Analogia depois que deixou de ser necessária é ruído (§2.3 da pesquisa) |
| **Comentar o código linha a linha** | Sim | Só as linhas críticas | **Não** |
| **Papel do conceito na sessão** | Conteúdo novo, fila de estudo | Conteúdo em consolidação; entra na fila de revisão | Revisão espaçada + material para intercalar em desafios de outros conceitos |

**Caso especial — `fragile` por T4 (decaimento):** trate o andaime como `fragile`, mas o **primeiro movimento é uma checagem de recall curta**, não um reensino. O aluno não errou nada; ele só ficou tempo sem revisar. Abrir com worked example aqui é exatamente o erro que o expertise reversal descreve. Se a checagem passa sem dica, T5 restaura `mastered` na hora.

**Regra dura de redução:** ao ver o estado subir, o tutor deve **ativamente cortar** andaime na interação seguinte sobre o mesmo conceito — inclusive parar de explicar o que o aluno claramente já sabe, **mesmo que ele não peça** para parar.

---

## 8. Exemplo preenchido de verdade

Setup real: trilha *Algoritmos e Matemática Discreta com Python* (`setup_id: 7b3e9a1c4f20`), consultado em **2026-08-23**. Quatro conceitos em quatro situações distintas:

- `recursao` — **`mastered`**, com um ciclo completo: promoção por T2, rebaixamento por decaimento (T4) e **restauração por T5** com uma única passagem;
- `complexidade_assintotica` — **`fragile`** e **vencido** (é o candidato número 1 da próxima abertura de sessão);
- `inducao_matematica` — **`unknown`** com duas falhas conceituais consecutivas, `confidence: high` (boa evidência de que não há evidência de domínio);
- `funcoes_recursivas` — duplicata detectada e **fundida** em `recursao`, preservada com `status: superseded`.

`memory/progress.json`:

```json
{
  "schema_version": "1.0",
  "setup_id": "7b3e9a1c4f20",
  "declared_skill_level": "intermediate",
  "recorded_at": "2026-08-23T09:14:00-03:00",
  "policy": {
    "interval_multiplier_mastered": 2.3,
    "interval_multiplier_fragile": 1.3,
    "interval_cap_mastered_days": 180,
    "interval_cap_fragile_days": 21,
    "decay_overdue_ratio": 1.0,
    "mastery_window_days": 60,
    "max_review_suggestions_per_session": 2
  },
  "concepts": [
    {
      "concept_id": "recursao",
      "label": "Recursão",
      "aliases": [
        "funções recursivas",
        "recursividade",
        "chamada recursiva"
      ],
      "track_ref": "modulo-02#recursao",
      "proficiency_state": "mastered",
      "state_reason": "passed_unassisted",
      "confidence": "high",
      "attempts": 8,
      "unassisted_passes": 3,
      "max_hint_level_used": 0,
      "last_error_type": "none",
      "first_observed_at": "2026-06-12",
      "observed_at": "2026-08-10",
      "last_observed_at": "2026-08-10",
      "recorded_at": "2026-08-10T20:41:00-03:00",
      "interval_days": 16,
      "next_review_at": "2026-08-26",
      "status": "active",
      "superseded_by": null,
      "supersedes": [
        "funcoes_recursivas"
      ],
      "evidence": [
        {
          "kind": "challenge",
          "session_id": "0031",
          "challenge_id": "0031",
          "observed_at": "2026-06-12",
          "recorded_at": "2026-06-12T21:05:00-03:00",
          "result": "passed",
          "attempts": 4,
          "hint_level": 3,
          "error_type": "slip",
          "attributed_to": null,
          "state_before": "unknown",
          "state_after": "fragile",
          "transition_rule": "T1",
          "note": "passou depois de a dica localizar a linha; os 3 erros anteriores foram de sintaxe"
        },
        {
          "kind": "challenge",
          "session_id": "0038",
          "challenge_id": "0038",
          "observed_at": "2026-06-20",
          "recorded_at": "2026-06-20T19:52:00-03:00",
          "result": "passed",
          "attempts": 2,
          "hint_level": 0,
          "error_type": "none",
          "attributed_to": null,
          "state_before": "fragile",
          "state_after": "fragile",
          "transition_rule": "T7",
          "note": "1a passagem sem dica; falta a 2a em sessão distinta para promover"
        },
        {
          "kind": "challenge",
          "session_id": "0046",
          "challenge_id": "0046",
          "observed_at": "2026-06-28",
          "recorded_at": "2026-06-28T20:10:00-03:00",
          "result": "passed",
          "attempts": 1,
          "hint_level": 1,
          "error_type": "none",
          "attributed_to": null,
          "state_before": "fragile",
          "state_after": "mastered",
          "transition_rule": "T2",
          "note": "2a passagem com dica <=1, 8 dias após a 1a"
        },
        {
          "kind": "decay",
          "session_id": null,
          "challenge_id": null,
          "observed_at": "2026-07-12",
          "recorded_at": "2026-08-10T20:38:00-03:00",
          "result": null,
          "attempts": null,
          "hint_level": null,
          "error_type": null,
          "attributed_to": null,
          "state_before": "mastered",
          "state_after": "fragile",
          "transition_rule": "T4",
          "note": "atraso de 14 dias sobre intervalo de 7; nenhuma falha observada; detectado na abertura da sessao 0053"
        },
        {
          "kind": "challenge",
          "session_id": "0053",
          "challenge_id": "0053",
          "observed_at": "2026-08-10",
          "recorded_at": "2026-08-10T20:41:00-03:00",
          "result": "passed",
          "attempts": 1,
          "hint_level": 0,
          "error_type": "none",
          "attributed_to": null,
          "state_before": "fragile",
          "state_after": "mastered",
          "transition_rule": "T5",
          "note": "checagem de recall após decaimento; restaurou mastered com uma passagem"
        }
      ]
    },
    {
      "concept_id": "complexidade_assintotica",
      "label": "Complexidade assintótica (Big-O)",
      "aliases": [
        "big-o",
        "notação O"
      ],
      "track_ref": "modulo-03#complexidade",
      "proficiency_state": "fragile",
      "state_reason": "passed_with_hints",
      "confidence": "high",
      "attempts": 9,
      "unassisted_passes": 0,
      "max_hint_level_used": 2,
      "last_error_type": "none",
      "first_observed_at": "2026-06-28",
      "observed_at": "2026-08-17",
      "last_observed_at": "2026-08-17",
      "recorded_at": "2026-08-17T21:30:00-03:00",
      "interval_days": 3,
      "next_review_at": "2026-08-20",
      "status": "active",
      "superseded_by": null,
      "supersedes": [],
      "evidence": [
        {
          "kind": "exposure",
          "session_id": "0046",
          "challenge_id": null,
          "observed_at": "2026-06-28",
          "recorded_at": "2026-06-28T20:15:00-03:00",
          "result": null,
          "attempts": null,
          "hint_level": null,
          "error_type": null,
          "attributed_to": null,
          "state_before": "unknown",
          "state_after": "unknown",
          "transition_rule": null,
          "note": "conceito explicado ao comentar o custo da Torre de Hanói; sem desafio"
        },
        {
          "kind": "challenge",
          "session_id": "0051",
          "challenge_id": "0051",
          "observed_at": "2026-08-03",
          "recorded_at": "2026-08-03T19:20:00-03:00",
          "result": "passed",
          "attempts": 6,
          "hint_level": 3,
          "error_type": "slip",
          "attributed_to": null,
          "state_before": "unknown",
          "state_after": "fragile",
          "transition_rule": "T1",
          "note": "contou operações do laço interno com off-by-one, corrigido após localização"
        },
        {
          "kind": "challenge",
          "session_id": "0055",
          "challenge_id": "0055",
          "observed_at": "2026-08-17",
          "recorded_at": "2026-08-17T21:30:00-03:00",
          "result": "passed",
          "attempts": 3,
          "hint_level": 2,
          "error_type": "none",
          "attributed_to": null,
          "state_before": "fragile",
          "state_after": "fragile",
          "transition_rule": "T7",
          "note": "precisou da pista conceitual sobre termo dominante; sem promoção"
        }
      ]
    },
    {
      "concept_id": "inducao_matematica",
      "label": "Indução matemática",
      "aliases": [
        "prova por indução"
      ],
      "track_ref": "modulo-04#inducao",
      "proficiency_state": "unknown",
      "state_reason": "conceptual_error",
      "confidence": "high",
      "attempts": 12,
      "unassisted_passes": 0,
      "max_hint_level_used": 5,
      "last_error_type": "conceptual",
      "first_observed_at": "2026-08-05",
      "observed_at": "2026-08-20",
      "last_observed_at": "2026-08-20",
      "recorded_at": "2026-08-20T20:05:00-03:00",
      "interval_days": 1,
      "next_review_at": "2026-08-21",
      "status": "active",
      "superseded_by": null,
      "supersedes": [],
      "evidence": [
        {
          "kind": "exposure",
          "session_id": "0052",
          "challenge_id": null,
          "observed_at": "2026-08-05",
          "recorded_at": "2026-08-05T19:44:00-03:00",
          "result": null,
          "attempts": null,
          "hint_level": null,
          "error_type": null,
          "attributed_to": null,
          "state_before": "unknown",
          "state_after": "unknown",
          "transition_rule": null,
          "note": "worked example completo de soma de Gauss por indução"
        },
        {
          "kind": "challenge",
          "session_id": "0054",
          "challenge_id": "0054",
          "observed_at": "2026-08-12",
          "recorded_at": "2026-08-12T20:58:00-03:00",
          "result": "failed",
          "attempts": 7,
          "hint_level": 5,
          "error_type": "conceptual",
          "attributed_to": null,
          "state_before": "unknown",
          "state_after": "unknown",
          "transition_rule": "T7",
          "note": "assumiu a tese para n+1 dentro do passo indutivo; verbalizou a regra errada"
        },
        {
          "kind": "challenge",
          "session_id": "0056",
          "challenge_id": "0056",
          "observed_at": "2026-08-20",
          "recorded_at": "2026-08-20T20:05:00-03:00",
          "result": "failed",
          "attempts": 5,
          "hint_level": 5,
          "error_type": "conceptual",
          "attributed_to": null,
          "state_before": "unknown",
          "state_after": "unknown",
          "transition_rule": "T7",
          "note": "mesmo padrão da sessão 0054: circularidade no passo indutivo (2a ocorrência)"
        }
      ]
    },
    {
      "concept_id": "funcoes_recursivas",
      "label": "Funções recursivas (duplicata de recursao)",
      "aliases": [],
      "track_ref": null,
      "proficiency_state": "unknown",
      "state_reason": "no_evidence",
      "confidence": "low",
      "attempts": 0,
      "unassisted_passes": 0,
      "max_hint_level_used": null,
      "last_error_type": null,
      "first_observed_at": "2026-06-24",
      "observed_at": null,
      "last_observed_at": "2026-06-24",
      "recorded_at": "2026-06-28T20:12:00-03:00",
      "interval_days": 1,
      "next_review_at": null,
      "status": "superseded",
      "superseded_by": "recursao",
      "supersedes": [],
      "evidence": [
        {
          "kind": "exposure",
          "session_id": "0044",
          "challenge_id": null,
          "observed_at": "2026-06-24",
          "recorded_at": "2026-06-24T19:30:00-03:00",
          "result": null,
          "attempts": null,
          "hint_level": null,
          "error_type": null,
          "attributed_to": null,
          "state_before": "unknown",
          "state_after": "unknown",
          "transition_rule": null,
          "note": "id criado por engano com outro nome; nenhuma evidência de desafio a migrar"
        }
      ]
    }
  ]
}
```

### 8.1 Como ler o exemplo (a aritmética confere)

**`recursao`** — a cadeia inteira, evento a evento:

| Sessão | Data | Desfecho | Classe | Transição | Estado | `interval_days` | `next_review_at` |
|---|---|---|---|---|---|---|---|
| 0031 | 12/06 | passou, dica 3, `slip`, 4 tentativas | B | **T1** | `unknown` → `fragile` | `max(2, round(1×1,3)) = 2` | 14/06 |
| 0038 | 20/06 | passou, dica 0, 2 tentativas | A | **T7** | `fragile` → `fragile` | `max(3, round(2×1,3)) = 3` | 23/06 |
| 0046 | 28/06 | passou, dica 1, 1 tentativa | A | **T2** | `fragile` → **`mastered`** | `max(4, round(3×2,3)) = 7` | 05/07 |
| — | 12/07 | decaimento: `12/07 - 28/06 = 14 = 2 × 7` | — | **T4** | `mastered` → `fragile` | **7** (preservado) | 05/07 (preservado) |
| 0053 | 10/08 | passou, dica 0, 1 tentativa | A | **T5** | `fragile` → **`mastered`** | `max(8, round(7×2,3)) = 16` | **26/08** |

- **T2 em 28/06**: duas passagens classe A (20/06 e 28/06), sessões distintas, 8 dias de distância (≥ 1), ambas dentro dos 60 dias da janela. A de 12/06 não conta — era classe B.
- **T4 em 12/07**: o `recorded_at` dessa evidência é **10/08T20:38** enquanto o `observed_at` é **12/07**. Isso é bitemporalidade real: o fato virou verdade em 12/07, mas não há daemon — o sistema só tomou conhecimento ao abrir a sessão 0053 (`docs/research/02-memoria-llm.md` §5 no repositório).
- **T5 em 10/08**: a última demoção foi T4 e não houve evento classe C desde então → **uma** passagem autônoma restaura `mastered`. T2 também caberia aqui; T5 tem precedência de rótulo porque preserva a informação de que a promoção foi restauração pós-decaimento.
- `unassisted_passes: 3` (0038, 0046, 0053) — nenhum evento classe C zerou a contagem; T4 não zera.
- `confidence: high`: 4 evidências qualificadas, a mais recente há 13 dias.
- `aliases` inclui `"funções recursivas"`, que é o que impede o id duplicado de renascer.

**`complexidade_assintotica`** — a exposição de 28/06 (`kind: exposure`) atualizou `last_observed_at` e **não** mexeu no estado: o conceito foi explicado de passagem ao comentar o custo da Torre de Hanói, e explicar não é aprender. As duas passagens foram classe B (dica 3 e dica 2), então `unassisted_passes: 0` e o conceito não tem caminho para `mastered` sem uma passagem autônoma. `next_review_at: 2026-08-20` com hoje em 23/08 → **vencido há 3 dias**, atraso relativo `3/3 = 1,0`, primeiro da fila (é `fragile`, e `fragile` vem antes de `mastered`).

**`inducao_matematica`** — duas falhas classe C consecutivas com `error_type: conceptual` (0054 e 0056), ambas com o mesmo padrão de circularidade no passo indutivo. O estado já era `unknown`, então **T6 não tem para onde rebaixar** e as duas entradas ficam como T7 — mas elas são o gatilho de comportamento: erro conceitual recorrente manda **trocar de estratégia** (§6.5), não repetir a escada. `interval_days: 1` (reset por classe C). `confidence: high` com `proficiency_state: unknown` — a combinação que quer dizer "tenho boa evidência de que ainda não há evidência".

**`funcoes_recursivas`** — id criado por engano na sessão 0044, detectado como duplicata na 0046. Como só tinha evidência `exposure` (que não carrega estado), não houve nada a migrar; recebeu `status: superseded` e `superseded_by: "recursao"`, e `recursao` registrou `supersedes: ["funcoes_recursivas"]`. **Não foi deletado** — é o registro auditável de por que o histórico mudou.

O que o tutor **pode** dizer ao aluno com este arquivo na mão:

> "Recursão você passou nos três últimos desafios sem dica — o último foi 10/08, e volta pra fila dia 26. Complexidade venceu anteontem: nas duas vezes que você fechou, precisou da pista conceitual, então quero reconferir. Indução eu não vou dar como sabida: nas duas tentativas o passo indutivo assumiu a tese, do mesmo jeito — vamos atacar isso por outro ângulo hoje."

O que ele **não** pode dizer: nenhuma frase da coluna ❌ da §4.2.

---

## 9. Contrato para `progress-update.sh` (onda 3)

### 9.1 ⭐ A interface: como um evento chega até o script

O documento dizia "escrita só por evento" e **não definia nenhuma forma de entregar um evento** —
o que torna a regra inaplicável e convida a implementação a aceitar campos soltos na linha de
comando, que é exatamente o "informe o estado novo" que a regra proíbe. A interface é esta:

```
progress-update.sh --event <arquivo.json>     # aplica UM evento
progress-update.sh --due                      # lista o que está vencido; aplica o decaimento
                                              #   preguiçoso (T4) e não faz mais nada
progress-update.sh --recompute                # reconstrói os escalares a partir de evidence[]
```

As três são mutuamente exclusivas; duas ao mesmo tempo é **exit 2** (uso incorreto). `--event`
aceita `-` para ler o JSON de stdin. Não existe forma de escrever `proficiency_state`,
`state_reason`, `confidence` ou `interval_days` pela linha de comando: **eles são sempre
calculados**, e é essa ausência de flag que faz valer a regra.

#### O formato do evento

Um objeto JSON, um evento por arquivo. O schema é
`assets/schemas/requests/progress-event.schema.json` (dono: a sub-tarefa dos schemas); aqui fica a
semântica de cada campo.

```json
{
  "schema_version": "1.0",
  "setup_id": "7b3e9a1c4f20",
  "kind": "challenge",
  "concept": "Recursão",
  "concept_id": null,
  "session_id": "0053",
  "challenge_id": "0053",
  "observed_at": "2026-08-10",
  "recorded_at": "2026-08-10T20:41:00-03:00",
  "last_result": "passed",
  "attempts": 1,
  "hint_level": 0,
  "error_type": "none",
  "attributed_to": null,
  "self_report_polarity": null,
  "note": "checagem de recall após decaimento"
}
```

| Campo | Obrigatório | Semântica |
|---|---|---|
| `schema_version` | sim | Versão do formato do evento, `MAJOR.MINOR` |
| `setup_id` | sim | `^[0-9a-f]{12}$`. Diferente do `setup_id` do `progress.json` alvo ⇒ **rejeita** (exit 5). É o que impede escrita cruzada entre setups |
| `kind` | sim | `challenge` · `exposure` · `self_report` · `review_declined` · `decay` |
| `concept` | sim | O **rótulo canônico** da trilha, em pt-BR, como ele aparece. O script resolve para `concept_id` pela busca em `concept_id` + `aliases[]` (§1.2 regra 3) |
| `concept_id` | não | Atalho: quando presente, pula a resolução. Se estiver presente **e** discordar do que a resolução de `concept` daria, **rejeita** — discordância silenciosa aqui cria conceito duplicado |
| `session_id` | quando `kind ≠ decay` | `^[0-9]{4}$`. Tem que existir em `memory/` |
| `challenge_id` | quando `kind = challenge` | `^[0-9]{4}$`. Tem que existir em `challenges/` |
| `observed_at` | sim | Data do fato (`YYYY-MM-DD`). É por ela que a ordem cronológica é decidida |
| `recorded_at` | não | Instante da gravação. Ausente ⇒ agora. A diferença entre os dois é a bitemporalidade (§5.3 passo 2) |
| `last_result` | quando `kind = challenge` | O valor **do manifesto do desafio**: `not_run` · `passed` · `failed` · `timeout` · `error`. O script normaliza para `result` pela tabela da §3.2 — o evento nunca traz `result` já mastigado, porque normalizar é responsabilidade de quem tem a tabela |
| `attempts` | não | Execuções da verificação neste desafio |
| `hint_level` | não | **0 a 5** (§2). `null` (ou ausente) significa *não registrado*, e **não** é 0 |
| `error_type` | não | `none` · `slip` · `conceptual` · `prerequisite` · `unknown`. Ausente ⇒ `unknown` |
| `attributed_to` | quando `error_type = prerequisite` | Rótulo canônico (ou `concept_id`) do pré-requisito que causou a falha (§6.4) |
| `self_report_polarity` | quando `kind = self_report` | `positive` ou `negative`. É o que distingue "acho que entendi" (nunca promove) de "não peguei isso" (pode rebaixar por T8). Sem esse campo o auto-relato é ilegível para o script |
| `note` | não | pt-BR livre, para humano. Passa pelo crivo de gravação de `docs/11-seguranca-privacidade.md` §1.3 do repositório |

O evento **não** carrega `state_before`, `state_after` nem `transition_rule`: os três são
calculados e escritos pelo script. Um evento que os traga é rejeitado — aceitar seria abrir a
porta para "informe o estado novo" por outro nome.

#### Idempotência, concretamente

A chave de identidade de um evento é a tupla
`(concept_id, kind, session_id, challenge_id, observed_at)`. Reprocessar um evento cuja chave já
está em `evidence[]` é **no-op com exit 0** — não duplica entrada, não reaplica transição, não
mexe em `interval_days`. É o que permite reprocessar um diretório de eventos sem medo depois de
uma interrupção.

#### Códigos de saída

`progress-update.sh` é um `SK/scripts/*.sh` e segue a tabela geral do produto, sem exceção:

| Código | Quando |
|---|---|
| `0` | evento aplicado, ou no-op idempotente |
| `1` | erro (não conseguiu ler ou gravar o arquivo) |
| `2` | uso incorreto (flags conflitantes, `--event` sem caminho) |
| `3` | setup não encontrado |
| `4` | recurso travado (outro `progress-update.sh` escrevendo o mesmo `progress.json`) |
| `5` | validação falhou (evento fora do schema; `setup_id` divergente; `session_id`/`challenge_id` inexistente; `result` fora do enum; resultado não valida contra `progress.schema.json`) |
| `10` | `needs_model_input` — **reservado**; nenhuma etapa deste script precisa de julgamento hoje |

O `10` fica reservado de propósito: se um dia a fusão de duplicatas (§1.2 regra 5) precisar de um
"estes dois conceitos são o mesmo?", ela usa o protocolo REQUEST/APPLY de
`docs/05-challenges-tdd.md` §4.6 do repositório, e não um palpite dentro do script.

### 9.2 De onde vem `state_reason: "manual"`

O enum de `state_reason` tem oito valores e **sete** são produzidos por alguma transição T1–T8. O
oitavo, `manual`, não é produzido por nenhuma — e um valor de enum que nada escreve é uma pergunta
aberta em forma de schema. A origem, declarada:

> `manual` é escrito **apenas** por edição direta do arquivo pelo aluno ou por quem opera o
> repositório. Nem o tutor nem `progress-update.sh` o escrevem, em nenhum caminho de código.

Ele existe para um caso real: a pessoa abre `memory/progress.json` — que é um JSON legível, num
diretório dela, e isso é escolha de projeto — e corrige um estado que considera errado. Sem
`manual`, ela teria que escolher entre mentir sobre a causa (`passed_unassisted` sem passagem
nenhuma) ou deixar um valor que a máquina de estados nunca justificaria.

Consequências, as três:

1. **`progress-update.sh` preserva `manual`, mas não o defende.** O próximo evento de desafio
   sobrescreve o estado normalmente, com a transição que couber. Uma edição manual é um ponto de
   partida, não um estado congelado.
2. **`--recompute` é a exceção declarada**: ele reconstrói os escalares a partir de `evidence[]` e
   por isso **desfaz** um `state_reason: manual` que não tenha evidência correspondente. O script
   avisa em uma linha quando isso acontece, em vez de apagar em silêncio.
3. **O tutor lê `manual` como o que é**: "alguém ajustou isto à mão". Ele não trata como
   observação sua, não conta como evidência qualificada em `confidence` (§4.4), e pode dizer ao
   aluno que aquele estado veio de uma edição, não de um desafio.

### 9.3 Checklist do que a implementação precisa garantir

Cada item é verificável.

1. **Escrita só por evento.** A entrada é um evento (`challenge`, `exposure`, `self_report`, `review_declined`, `decay`), entregue por `--event` (§9.1); nunca "o estado novo". O estado é sempre calculado, nunca informado.
2. **Sem artefato, sem transição.** Rejeitar evento cujo `session_id` / `challenge_id` não exista no setup.
3. **Ordem cronológica.** Processar por `observed_at` crescente; um evento por vez; a §3.5 é a ordem de avaliação, sem desvios.
4. **`evidence[]` é a fonte de verdade *dentro do arquivo*.** Todo campo **escalar** é recomputado do array a cada escrita, e `--recompute` refaz a camada escalar inteira a partir de `evidence[]` — é o teste de que a regra vale. O que `--recompute` **não** faz é reconstruir `evidence[]`: esse array é dado primário e não existe em `memory/NNNN.json` (§0.1).
5. **Nada é deletado.** Poda permitida só para `kind` ∈ {`exposure`, `review_declined`} acima de 20 entradas, e **nunca** para entrada com `state_before != state_after`.
6. **Decaimento é preguiçoso.** Avaliado na abertura da sessão, com `observed_at` = data em que o limiar foi cruzado e `recorded_at` = agora.
7. **Validação antes de gravar.** O arquivo resultante valida contra `progress.schema.json`. O verificador é stdlib do Python (não há `jsonschema` nesta máquina) e cobre `type`, `required`, `enum`, `pattern`, `minimum`/`maximum` — as restrições do schema foram escritas para caber nesse verificador (sem `$ref`, sem `allOf` aninhado, sem `if/then/else`).
8. **`policy` ausente = defaults.** Ler o objeto se existir; senão usar os defaults documentados na §5.2.
9. **Idempotência.** Reprocessar um evento com a mesma chave `(concept_id, kind, session_id, challenge_id, observed_at)` é no-op com exit 0: não duplica evidência nem reaplica transição (§9.1).
10. **Normalização antes de classificar.** `last_result` → `result` pela tabela da §3.2, no passo 0 da §3.5. `timeout` e `error` viram `failed`; `not_run` vira `not_attempted`. Valor fora do enum é rejeitado com exit 5, **nunca** absorvido pelo ramo da classe B.
11. **Códigos de saída.** A tabela da §9.1, sem exceção — `0/1/2/3/4/5`, com `10` reservado para `needs_model_input`.
12. **`state_reason: manual` é preservado, nunca escrito.** Nenhum caminho de código do script o produz (§9.2).

### Convenção de idioma no arquivo de dados

Chaves e **vocabulário fechado** (todos os `enum`) em inglês, `snake_case`, sem acento — é o contrato congelado do projeto e o que impede deriva de vocabulário (`docs/research/02-memoria-llm.md` §6 no repositório). Os três campos de **texto livre** — `label`, `aliases[]` e `evidence[].note` — são pt-BR natural, com acento, porque são lidos por humanos e mostrados ao aluno. Nenhum outro campo aceita texto livre.

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-P01 | O tutor deve pedir auto-relato de domínio ao aluno, ou inferir só de evidência observável? | (a) nunca perguntar; (b) uma pergunta no fechamento da sessão, com efeito **assimétrico** (só rebaixa); (c) perguntar conceito a conceito | **(b)** — auto-relato só no encerramento e só como rebaixamento/gatilho de checagem; nunca promove | cheap |
| D-P02 | O estado de proficiência é visível para o aluno? | (a) sempre, o tutor abre a sessão listando os estados; (b) sob demanda ("como estou em X?") + menção espontânea só quando muda o comportamento do tutor; (c) nunca | **(b)** — evita transformar o rótulo em nota e mantém a §4 aplicável | cheap |
| D-P03 | Quão agressivo é o decaimento temporal (`policy.decay_overdue_ratio`)? | 0 (desligado) · 0,5 (agressivo) · **1,0** · 2,0 (frouxo) | **1,0** — rebaixa quando o atraso iguala o próprio intervalo. Não há base empírica para nenhum valor; é escolha de produto e por isso mora no dado | cheap |
| D-P04 | Revisão vencida é obrigatória ou sugerida? | (a) só sugere e aceita "não"; (b) obriga 1 conceito vencido antes de conteúdo novo; (c) obriga só depois de N recusas | **(a)** + a regra anti-insistência da §5.3 (após 3 recusas, dizer o custo uma vez e adiar 7 dias) | cheap |
| D-P05 | Quem pode criar `concept_id`? | (a) só a trilha do `docs/` do setup; (b) o tutor cria ad hoc durante a sessão; (c) (a) + exceção só para pré-requisito descoberto | **(c)** — trilha canônica, com a única exceção da §6.4, marcada por `track_ref: null` | moderate (mudar id depois exige migração da evidência) |
| D-P06 | Janela e tetos: `mastery_window_days` = 60, teto de 180 dias em `mastered` e 21 em `fragile`, multiplicadores 2,3 / 1,3 | manter os defaults · encurtar a janela (30d) para exigir evidência mais fresca · alongar tetos | **manter** — 2,3 aproxima o crescimento do SM-2 bem-sucedido sem pedir nota ao aluno; tudo fica em `policy`, ajustável por setup | cheap |
| D-P07 | Onde vive o arquivo e qual é o seu escopo? | (a) `memory/progress.json`, um por setup (assumido aqui); (b) um arquivo por trilha dentro do setup; (c) embutir o estado no índice de memória episódica | **(a)** — mas depende da sub-tarefa dona de `memory/`; se o índice episódico já ocupar o nome, renomear é trivial, mudar o escopo não | moderate |
| D-P08 | **RESOLVIDA (AR-24)** — como um evento chega a `progress-update.sh`? | campos soltos na linha de comando · **`--event <arquivo.json>`** · o script lê a sessão sozinho | **`--event <arquivo.json>`** (aceita `-` para stdin), ao lado de `--due` e `--recompute`, com o formato de evento da §9.1. Sem uma forma declarada de entregar evento, a regra "escrita só por evento" não era aplicável | — decidida |
| D-P09 | **RESOLVIDA (AR-13/15/16)** — formato dos identificadores | `setup_id` legível · **`setup_id` hexadecimal sorteado** ; `challenge_id` com slug embutido · **só o número** | **`setup_id` = `^[0-9a-f]{12}$` · `concept_id` = `^[a-z][a-z0-9_]{1,62}$` (snake_case) · `challenge_id` = `^[0-9]{4}$` · `hint_level` = 0..5** (§1.3). O exemplo da §8 foi reescrito nesses formatos | — decidida; mudar depois exige migração de toda a evidência |
| D-P10 | **RESOLVIDA (AR-30)** — `progress.json` pode ser reconstruído a partir de `memory/NNNN.json`? | sim, é cache · **não, é dado primário** | **não** (§0.1): `error_type`, `hint_level` e `transition_rule` não existem no registro de sessão. Só a camada escalar é recomputável, e a partir de `evidence[]`, não das sessões | — decidida |
| D-P11 | Origem de `state_reason: "manual"` | remover do enum · **edição direta do arquivo pelo aluno/operador** · o tutor pode escrever | **edição direta**, nunca escrita pelo tutor nem pelo script (§9.2). Preservada pelo fluxo normal, desfeita por `--recompute` com aviso. Mantida no enum porque o arquivo é legível e editável por projeto, e mentir sobre a causa seria pior | cheap — é só semântica de um valor de enum |
