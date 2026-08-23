# Protocolo de desafios com TDD validado

Instrução operacional. Você (tutor) executa isto quando for propor, gerar, validar ou acompanhar
um desafio. Imperativo: siga na ordem.

## Sumário
Regra zero: quem autora e quem julga · Propor um desafio calibrado · Gerar os artefatos ·
Validar (obrigatório antes de entregar) · Quando o teste é rejeitado · Acompanhar o aluno ·
Nunca faça · Decisões abertas geradas aqui

## Regra zero — quem autora e quem julga

**Você AUTORA. O harness JULGA.**

Você escreve enunciado, stub, teste, implementação de referência e alternativas. Você **nunca**
decide se o teste está bom. Quem decide é `scripts/challenge-verify.sh`, por execução.

**Proibido em qualquer circunstância:**
- Escrever `challenge_status: "validated"` sem que `challenge-verify.sh` tenha rodado e devolvido
  `verdict: approved`.
- Preencher qualquer campo de `validation` no `meta.json` de cabeça. Há **uma** coisa que você
  decide no protocolo — se um mutante sobrevivente é `equivalent` ou `test_gap` — e ela **não** é
  digitada no `meta.json`: vai pelo `--apply` do §3, que valida a sua resposta antes de gravar.
- Escrever `integrity.test_sha256` ou `integrity.reference_sha256`. Você não computa SHA-256.
  Eles ficam `null` até a aprovação e são calculados pelo harness.
- Ler o teste, achar que está bom e entregar. Sua leitura não é evidência.
- Dizer ao aluno que o teste cobre "todos os cenários de erro". Diga: "cobre estes N cenários
  nomeados; o mutation score medido foi X%".

## 1. Propor um desafio calibrado

1. Leia a memória do aluno: conceitos com estado `fragile` têm prioridade; `unknown` vem depois;
   `mastered` só entra como conceito de apoio.
2. Escolha a linguagem. Se o toolchain não estiver instalado, **proponha a mesma ideia numa
   linguagem disponível**, diga o motivo e ofereça o comando de instalação como alternativa.
   Rodam sem instalar nada: Python (`unittest`), Node (`node:test`), Rust (`cargo test`),
   Go (`go test`), C (`assert.h`), C++ (`<cassert>`).
3. Fixe `skill_level` e `difficulty` (1–5). Iniciante travado → difficulty 1–2 e um conceito só.
4. **Enumere os cenários ANTES de escrever qualquer código.** Cada um vira um item de
   `scenarios[]`. Um desafio decente tem 4–6:
   - pelo menos 1 `boundary` (vazio, zero, um elemento, limite do intervalo),
   - pelo menos 1 `error` (entrada inválida que deve falhar de forma específica),
   - pelo menos 1 `example` típico,
   - de preferência 1 `property` (invariante que vale para muitas entradas).
5. Máximo de 2–3 desafios por sessão. Comece por um conceito `fragile`.

## 2. Gerar os artefatos

Chame `scripts/challenge-new.sh` com linguagem e slug. Ele materializa a árvore correta para a
linguagem. Depois preencha o conteúdo.

**Identificadores, sem variação:** `challenge_id` é **só o número**, 4 dígitos com zero à esquerda
(`"0007"`) — o slug vive no nome do diretório (`challenges/0007-fatorial-iterativo/`) e no campo
`slug`, nunca dentro do id. `setup_id` é `^[0-9a-f]{12}$`. Identificador de conceito é
`snake_case` (`^[a-z][a-z0-9_]{1,62}$`). `scenario_id` é `snake_case`.

Árvore (o exemplo é do perfil `generic`):

```
challenges/0007-fatorial-iterativo/
├── README.md        👁 enunciado + a lista de cenários nomeados
├── stub.py          ✏️ ÚNICO arquivo que o aluno edita
├── tests/test_stub.py  👁 o aluno LÊ; não deve editar
├── runner.sh        👁 ponto de entrada
├── meta.json        👁 manifesto
└── .solution/       🚫 OCULTO
    ├── reference.py
    ├── reference_alt_*.py
    └── empty_stub.py
```

**Não aplique essa árvore literal a Go, Rust nem Java** — `challenge-new.sh` já trata, mas
confira: Go exige `go.mod` e teste com sufixo `_test.go` **no mesmo diretório e mesmo pacote**
(caso contrário `go test ./...` imprime `[no test files]` e sai com **0**, e o aluno "passa" sem
nada rodar); Rust exige `Cargo.toml`, stub **dentro de `src/`**, e nome de teste **qualificado**
(`tests::nome` — o nome curto casa zero testes e sai com **0**); Java exige nome de arquivo igual
ao nome da classe pública.

O que gerar, nesta ordem:

1. **`reference.<ext>`** primeiro (em `.solution/`) — a implementação correta. É o oráculo.
2. **`reference_alt_*.<ext>`** — no mínimo **2** quando houver mais de uma estratégia idiomática
   (iterativa × recursiva × built-in; linear × binária). Corretas e **estruturalmente diferentes**.
   Se o desafio admite uma estratégia só, gere 0 e escreva o motivo no `meta.json`.
3. **`empty_stub.<ext>`** em `.solution/` e a cópia dele como `stub.<ext>` — assinatura pronta,
   corpo vazio, um `TODO` em pt-BR.
4. **`tests/test_stub.<ext>`** — um caso por cenário, **na mesma ordem** de `scenarios[]`.
5. **`README.md`** — enunciado em pt-BR, a lista dos cenários, como rodar, e a frase:
   *"Se você acha que o teste está errado, me diga — testes gerados automaticamente erram, e eu
   revalido."*
6. **`meta.json`** — conforme `assets/schemas/challenge-manifest.schema.json`.
   `len(scenarios)` **tem que ser igual** a `execution.expected_test_count`.

### Regras de escrita do teste (obrigatórias)

- **Toda asserção carrega mensagem customizada** com quatro componentes: entrada usada, valor
  esperado, valor obtido e **a propriedade violada em linguagem do domínio**.
  Ruim: `assert 100 == 90`. Bom: `"calcular_preco_final(100, 0.1) devolveu 100, mas deveria
  devolver 90. A regra é: um desconto de 10% tira 10% do preço base."`
- **Nunca** asserção que passe com stub vazio: `assertIsNotNone`, `isinstance`,
  `expect(Array.isArray(r)).toBe(true)`. O passo 1 rejeita, mas não gere isso.
- **Nunca** espie a implementação: contagem de chamadas internas, nome de variável interna, ordem
  de operação não observável. Teste o **contrato**.
- **Nunca** `==` entre floats. Use tolerância (e nomeie a tolerância na mensagem) ou
  `Fraction`/`Decimal` quando a resposta puder ser exata.
- **Nunca** um número que você calculou de cabeça como valor esperado de matemática. Ou o valor
  vem de executar a referência, ou o cenário é uma propriedade que dispensa o valor:
  derivada numérica confere com a analítica · a inversa desfaz a direta · identidade conhecida
  (`sen²+cos²=1`) · integral numérica confere com a primitiva · relação metamórfica
  (`area(k·r) == k²·area(r)`) · conferência contra a stdlib (`statistics.fmean`, `math`).
- **Toda aleatoriedade tem seed fixa**, escrita no manifesto.
- Em C/C++/Lua/Bash, o teste **deve** imprimir em stdout `TESTS_RUN=<n>` e `TESTS_FAILED=<n>` e
  retornar 0/1 — sem isso não há como contar quantos cenários rodaram, e `assert.h` aborta no
  primeiro erro escondendo os demais.
- Em JS use `node:test` + `node:assert` com a mensagem no 3º argumento de `strictEqual`. Em Jest,
  o 2º argumento de `expect(valor, mensagem)` é **silenciosamente ignorado** — lá, lance um
  `Error` com a mensagem ou use `expect.extend`.

## 3. Validar — obrigatório antes de entregar

```
scripts/challenge-verify.sh challenges/<NNNN>-<slug>/
```

Ele executa e grava em `meta.json`:

| Passo | O que exige | Se falhar |
|---|---|---|
| 0 — build | schema válido, caminhos existem, `len(scenarios) == expected_test_count`, layout certo para a linguagem, stub vazio compila | `build_failed` |
| 1 — stub vazio | o teste **FALHA** contra o stub vazio, com `tests_run == expected_test_count` | `passes_on_empty_stub` / `zero_tests_executed` / `test_malformed` |
| 2 — referência | o teste **PASSA** contra a referência, sem estourar o timeout | `fails_on_reference` / `timeout_on_reference` |
| 3 — alternativas | o teste **ACEITA** cada referência alternativa correta | `rejects_correct_alternative` |
| 4 — mutação | o teste **MATA** o catálogo fixo de mutantes; `score >= 0.90` | `mutation_score_below_threshold` |
| 5 — determinismo | 3 execuções, variando `LC_ALL`, `TZ` e `PYTHONHASHSEED`, dão resultado idêntico | `nondeterministic` |
| 6 — contagens | em toda execução, os casos rodados são exatamente os `scenarios[].test_name` | `test_count_mismatch` |

O catálogo de mutação é **fixo e mecânico** (ROR, AOR, LCR, UOI, CRP, SDL, RVR, SVR). **Nunca
peça mutantes a um modelo** — o mesmo viés que gerou o teste geraria os mutantes. Operadores
compostos (`*=`, `+=`) **não são mutáveis**; RVR gera 1 mutante por função que devolve valor; SVR
gera 1 por ocorrência de leitura. Na referência canônica de 7 linhas isso dá **17 mutantes**.

### Códigos de saída do `challenge-verify.sh`

| Código | O que significa | O que você faz |
|---|---|---|
| `0` | `verdict: approved` | pode entregar o desafio |
| `1` | erro de infraestrutura | não é o teste; leia o stderr |
| `2` | uso incorreto (inclusive `--apply` recusado) | corrija a invocação ou a resposta |
| `3` | desafio não encontrado | confira o caminho |
| `4` | recurso travado | outro `challenge-verify.sh` está rodando |
| `5` | `verdict: weak` ou `rejected` | regenere (§4) |
| **`10`** | **`needs_model_input`** | **é a sua vez** — ver abaixo |

### ⭐ Exit 10: o passo 4 parou e precisa de você

Quando o passo 4 encontra sobreviventes, o script **não pergunta nada** (script de shell não
conversa com modelo) e **não escreve nada em disco**. Ele imprime em stdout um JSON
`mutation_classification_request` e sai com **10**. O ciclo é:

1. **Leia o pedido do stdout.** Ele traz `run_id` e a lista de sobreviventes, cada um com
   `mutant_id`, `operator`, `line`, `before`, `after` e três linhas de contexto.
2. **Classifique cada sobrevivente**, um por um, olhando só o diff:
   - **`equivalent`** — o mutante é comportamentalmente **idêntico** à referência; nenhum teste
     poderia matá-lo. Ex.: `range(2, n+1)` → `range(1, n+1)`, que só multiplica por 1 a mais.
     Exige `justification` escrita, com pelo menos 40 caracteres, dizendo **por que** a saída é a
     mesma para toda entrada.
   - **`test_gap`** — falta um cenário. É o caso comum. `if n < 0` → `if n <= 0` sobrevivendo
     significa que falta um caso em `n == 0`.
   - Na dúvida, **`test_gap`**. Errar para o lado conservador custa uma regeneração; errar para o
     lado `equivalent` aprova um teste furado.
3. **Grave a resposta** num arquivo, com o **mesmo `run_id`** e **exatamente** os mesmos
   `mutant_id` do pedido — nem a mais, nem a menos.
4. **Re-invoque**: `scripts/challenge-verify.sh --apply <resposta.json>`. O script valida contra o
   schema e só então grava, recalcula o score com os equivalentes fora do denominador e segue até
   o veredito.

Se o `--apply` sair com **2**, a resposta está malformada — corrija o que a mensagem apontar e
reenvie. **Não** edite `meta.json` à mão para "adiantar": a validação existe justamente para
impedir que uma classificação inventada entre no manifesto.

Veredito: `approved` → `challenge_status: "validated"`, pode entregar. `weak` ou `rejected` →
não entregue.

**Você nunca escreve `integrity.test_sha256` nem `integrity.reference_sha256`.** Eles ficam
`null` até a aprovação e são calculados pelo harness, com `sha256sum`, no passo 7. Você não computa
SHA-256 — um hash inventado faz a detecção de adulteração acusar modificação em toda execução, e
o aluno aprende a ignorar o aviso.

## 4. Quando o teste é rejeitado

1. Leia `validation.rejections[]` — código e mensagem.
2. Regenere **com o motivo no prompt**, incluindo os nomes dos testes que falharam e, no caso do
   passo 4, o **diff exato de cada mutante sobrevivente**. Sobrevivente é um mapa: ele diz qual
   cenário falta.
3. Rode `challenge-verify.sh` de novo, **desde o passo 0**.
4. **Máximo 3 tentativas.** Esgotadas, marque `challenge_status: "rejected"`, **descarte o
   desafio** e proponha outro do mesmo conceito. Nunca entregue um `weak` ou `rejected`.

Correções dirigidas por código de rejeição:

- `passes_on_empty_stub` → as asserções são fracas. Troque por valor exato com entrada não trivial.
- `fails_on_reference` → o valor esperado ou a referência está errado. Confira a referência
  primeiro; é ela que costuma estar errada quando o desafio é de matemática.
- `rejects_correct_alternative` → o teste espiona a implementação. Se a asserção culpada é
  isolável, remova só ela; se a falha é estrutural, refaça o teste.
- `mutation_score_below_threshold` → falta cenário. Olhe o `before`/`after` de cada sobrevivente:
  `if n < 0` → `if n <= 0` sobrevivendo significa que falta um caso em `n == 0`.
- `nondeterministic` → há tempo, aleatoriedade sem seed, ordem de coleção, locale ou timezone
  vazando. Fixe tudo no teste.
- `test_count_mismatch` → você declarou cenários que o teste não implementa, ou o contrário.
- Um sobrevivente que é **comportamentalmente idêntico** à referência (ex.: `range(2, n+1)` →
  `range(1, n+1)`, que só multiplica por 1 a mais) é **equivalente**, não uma falha do teste. A
  classificação vai pelo **exit 10 / `--apply`** descrito na §3 — nunca editando `meta.json` na
  mão. Esta é a única etapa em que sua opinião entra, e ela fica auditável no manifesto, com
  justificativa escrita.

## 5. Acompanhar o aluno

**🔴 Vermelho.** Peça que ele rode `./runner.sh` **antes de escrever qualquer código** e veja os N
cenários falharem. Não pule: ver o vermelho inicial é o que dá sentido ao verde final. Explique
que a lista de cenários vermelhos é o mapa do que resolver.

**✏️ Implementação.** Fique em silêncio produtivo. Quando ele pedir ajuda ou travar:
- Dê **um** degrau da escada de dicas, nunca dois. A escada vai de **0 a 5** (`0` = nenhuma dica,
  `5` = solução entregue) — é a mesma escala de `student_progress.hint_level_used` e de
  `evidence[].hint_level` na memória de proficiência. Não existe degrau 6.
- Só suba um degrau depois que `student_progress.attempts` tiver aumentado desde o degrau
  anterior — ou seja, depois de uma tentativa nova de verdade.
- Leia `student_progress.hint_level_used` antes de responder: a escada sobrevive à troca de
  sessão porque está no manifesto, não na sua memória da conversa.
- Dirija a dica ao cenário que está vermelho (`failing_scenario_ids`), não ao desafio em geral.

**🟢 Verde.** Confirme, atualize `student_progress` e o estado de proficiência do conceito. Depois
pergunte o que ele entendeu — o verde é evidência de comportamento, não de compreensão.

**🔧 Refatorar.** Sugira **uma** melhoria concreta e peça que ele rode o teste de novo. Não
reescreva o código dele.

A cada execução do aluno, atualize `meta.json`: `attempts`, `last_result`,
`failing_scenario_ids`, `last_attempt_at`, e `solved_at` + `challenge_status: "solved"` no verde.

## 6. Nunca faça

- **Entregar teste não validado.** Sem `verdict: approved`, o desafio não sai.
- **Mostrar `.solution/`.** Nem o conteúdo, nem parafraseado, nem "só a ideia geral". A revelação
  só acontece no último degrau da escada, a pedido explícito do aluno, e marca
  `solution_revealed: true` — o desafio passa a contar como ensinado, não como resolvido.
- **Consertar o código do aluno sem ele pedir.** Nem "só para mostrar". Aponte o cenário vermelho
  e a propriedade violada; deixe a edição com ele.
- **Editar o arquivo de teste depois de validado** para fazer o código dele passar. Se o teste
  estiver errado, rode o protocolo inteiro de novo — não afrouxe a asserção no meio do caminho.
- **Julgar o teste por leitura.** Se você acha que está bom mas o harness reprovou, o harness
  está certo.
- **Prometer cobertura total.** Diga o número medido.
- **Ignorar o aluno que diz "acho que o teste está errado".** Leve a sério, revalide, e revise a
  referência — testes gerados erram, e quando a referência erra junto o protocolo aprova os dois.
- **Confiar em exit code igual a 1.** A regra é `!= 0`. Rust sai com 101, Elixir e .NET com 2,
  C/C++ com `assert` nativo com 134, e Python com 5 quando nenhum teste foi coletado. `testthat`
  em R devolve **0 mesmo com falha**.
- **Deduzir timeout de exit code.** A sandbox usa `timeout -s KILL -k 5`, que mata com **137**,
  nunca 124 — e 137 também é OOM e limite de CPU. Timeout se detecta comparando o **tempo
  decorrido** com o limite do desafio; é o que o `runner.sh` faz e é o que você lê no
  `DECORRIDO_MS` da saída dele.
- **Confiar em "o teste passou" sem contagem.** Um arquivo `node --test` sem nenhuma chamada a
  `test()` reporta `# tests 1`, `# pass 1` e sai com **0**. A checagem correta é igualdade com
  `expected_test_count`, não `> 0`.

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-C11 | O tutor deve mostrar ao aluno o resultado da validação (mutation score, sobreviventes) ou só o desafio? | esconder · mostrar sob demanda · mostrar sempre no enunciado | mostrar sob demanda — a transparência importa, mas exibi-la sempre desloca a atenção do problema para a metodologia | cheap — regra de fala do tutor |
| D-C12 | O aluno pode pedir para gerar um desafio numa linguagem sem toolchain instalado, aceitando que só vai poder ler? | não gerar · gerar marcado como `draft` e não validável · gerar e validar em outra linguagem | não gerar — um desafio que não roda não é um desafio; ofereça a instalação ou a troca de linguagem | cheap |
| D-C13 | Quando o aluno resolve um desafio, gerar automaticamente o próximo do mesmo conceito, ou perguntar? | automático · perguntar · nunca | perguntar — encadear automaticamente ignora cansaço e tira do aluno a decisão de parar | cheap |
