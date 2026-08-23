# `examples/` — o setup navegável

Um setup de estudo real, com histórico de seis semanas, para você abrir no GitHub e entender o
projeto **sem instalar nada**. Um único exemplo: [`setup-calculo-python/`](setup-calculo-python/)
— um aluno fictício aprendendo derivadas em Python entre 6 de julho e 22 de agosto de 2026.

---

## ⭐ Este exemplo foi GERADO pelos scripts, não escrito à mão

Todo arquivo dentro de `setup-calculo-python/` saiu de um script de
`skills/study-method/scripts/`. Reproduza:

```bash
examples/_gerador/gerar.sh /tmp/meu-exemplo
```

O gerador roda nove fases, na ordem, e a última valida todo JSON produzido contra o schema dono.
Ele **não** é parte da skill: é o roteiro de aula do aluno fictício, e vive em
[`_gerador/`](_gerador/) exatamente para que a afirmação acima seja verificável.

Três diferenças entre o que você gera e o que está commitado:

| o quê | por quê |
|---|---|
| `setup_id` (12 hex) | `setup-init.sh` sorteia um novo a cada execução, e ele aparece em `setup.json`, `memory/*.json` e no `README.md` do setup. |
| `runtime_version` em `meta.json` | `challenge-new.sh` grava a versão do Python da máquina que gerou. No commit está `Python 3.14.7`. |
| o bloco `validation` de `meta.json` | O commit guarda a saída de **antes** da correção de `lib/json.sh` — `verdict: rejected`, `challenge_status: draft`. Uma geração de hoje sai `approved` / `validated`. É de propósito: é essa saída que documenta o defeito #1 de "O que este exemplo denuncia". |

Duas gerações seguidas, com o `setup_id` normalizado, dão `diff -r` vazio — inclusive nos quatro
formatos do gráfico. Isso custou um `touch -d` na fase 01: `docs-index.sh` grava em
`memory/docs-index.json` o **mtime real** do arquivo do `docs/` do setup (é a chave de invalidação
do cache dele, e por isso o campo não honra `STUDY_METHOD_NOW`). Sem fixar o mtime do material do
aluno, esse seria o único campo do exemplo inteiro carregando a hora de relógio da máquina que
gerou — e o único vazamento de ambiente que sobraria.

Tudo o mais é byte a byte igual: as datas vêm de `STUDY_METHOD_TODAY` / `STUDY_METHOD_NOW`
exportados por fase — é por isso que a trajetória ocupa seis semanas de calendário em vez de um
segundo de relógio de parede.

### O que NÃO foi gerado por script (e por que não podia ser)

Três coisas, todas previstas em contrato:

1. **`docs/apostila-derivadas.md`** — é o material que o **aluno trouxe**. `theory_source` do setup
   é `student_provided`: essa teoria vem de fora, por definição.
2. **Os campos do tutor em `memory/NNNN.json`** — `plan`, `how_it_happened`, `skills_observed`,
   `artifacts`, `affect`, `affect_note`, `docs_coverage`. `docs/00-contratos.md` §2 diz que o passo
   `plan_lesson` escreve `plan` e que `teach` escreve o resto "em checkpoint a cada marco". Não há
   script para eles porque não pode haver: é julgamento do tutor. No gerador eles entram por
   `lib-tutor.py`, que só faz merge — não inventa campo.
3. **As RESPOSTAS do protocolo REQUEST/APPLY** — `session-close.sh` e `memory-compact.sh` saem com
   `exit 10` e um PEDIDO em stdout; quem responde é o modelo. As respostas estão em
   `_gerador/perfil-resposta.json` e nos blocos `vals-NNNN.json` de cada fase de sessão. **Os
   scripts validam a resposta contra o schema antes de escrever** — nada entra em disco sem passar.

O corpo dos destilados de `researchs/` também é do tutor: `research-new.sh` aloca o arquivo e o
bloco de proveniência, e o próprio `--help` dele diz que "o script não escreve o corpo".

---

## ⚠️ `memory/` está commitado aqui **de propósito** — a política não mudou

Num setup de verdade `memory/` **fica fora do git**. Isso não é descuido de configuração: é uma
decisão de privacidade, e ela está escrita no `.gitignore` que o próprio `setup-init.sh` gera —
abra [`setup-calculo-python/.gitignore`](setup-calculo-python/.gitignore) e leia o comentário. O
resumo: o git guarda **todas** as versões de um arquivo rastreado para sempre, e `memory/` contém
fatos sobre a pessoa (o que funcionou, o que não funcionou, o estado afetivo dela). A única forma
honesta de um "esquece isso" funcionar é `memory/` nunca ter entrado no git.

Aqui ele está versionado porque **o aluno é fictício e o diretório é o produto que este exemplo
existe para mostrar**. Ele foi adicionado com `git add -f`, contra o `.gitignore` que continua
válido e continua no lugar. Não copie esse gesto para um setup seu.

---

## Por onde começar

Nesta ordem — cada passo depende do anterior fazer sentido:

| # | Abra | E olhe para |
|---|---|---|
| 1 | [`setup-calculo-python/README.md`](setup-calculo-python/README.md) | As 8 seções entre marcadores. É a **ponte**: o que outra aula lê para saber quem é este aluno sem abrir mais nada. |
| 2 | [`memory/INDEX.json`](setup-calculo-python/memory/INDEX.json) | Cinco linhas, uma por sessão, com `flags`. Duas trazem `has_backfire`. |
| 3 | [`memory/0001.json`](setup-calculo-python/memory/0001.json) | O campo `how_it_happened[]`. É o coração do projeto. |
| 4 | [`memory/progress.json`](setup-calculo-python/memory/progress.json) | Cinco conceitos em quatro estados diferentes, cada um com a regra que o levou lá. |
| 5 | [`memory/profile.json`](setup-calculo-python/memory/profile.json) | `procedural_facts[]` — o que o tutor vai evitar na próxima aula. |
| 6 | [`challenges/0001-derivada-numerica/`](setup-calculo-python/challenges/0001-derivada-numerica/) | O que o aluno vê × o que fica oculto — e um veredito **reprovado** que é um defeito real (§ "O que este exemplo denuncia"). |

---

## O que cada diretório prova

### `memory/` — a trajetória, legível de cima a baixo

| arquivo | o que prova |
|---|---|
| `0001.json` … `0005.json` | Que o registro episódico guarda **o COMO**, não só o quê. Cada sessão tem `how_it_happened[]` com `move_type`, a descrição concreta do movimento, o `outcome` e a **evidência observável** que sustenta o outcome. |
| `INDEX.json` | Que dá para achar a sessão certa **sem abrir nenhum bruto**: `topics`, `skills_touched`, `flags`. É derivado — `memory-index.sh --rebuild` o reconstrói inteiro. |
| `progress.json` | Que estado de proficiência é **calculado**, nunca informado. Cada `evidence[]` carrega `state_before`, `state_after` e `transition_rule` (`T1`…`T8`). |
| `profile.json` | Que a memória de longo prazo é **consolidada por evidência**, com `source_sessions[]` em cada fato e `confidence` derivada, não opinada. |
| `docs-index.json` | Que o `docs/` do aluno entra sob orçamento e o que ficou de fora é declarado. A sessão `0001` gravou `docs_coverage: "full"`; as demais, `"indexed"`. |

**⭐ A memória procedimental é o diferencial. Comece por aqui.**

`memory/0001.json` → `how_it_happened[2]`:

```json
{
  "move_type": "explanation_order",
  "description": "Escrevi a definição formal lim h->0 (f(x+h)-f(x))/h antes de fazer uma única
                  conta numérica, achando que o zoom no gráfico já tinha preparado o terreno.",
  "target_topic": "derivadas",
  "outcome": "backfired",
  "evidence": "Ficou seis minutos sem perguntar nada e depois disse: 'eu tinha entendido no
               gráfico, agora não sei mais se entendi'.",
  "observation_type": "observed"
}
```

`outcome: "backfired"` não é "não funcionou". É **piorou**: o aluno tinha entendido e desentendeu.
Um movimento com `unlocked` é bom de repetir; um com `backfired` é caro de repetir, e é
justamente por isso que ele é registrado com a mesma seriedade.

A sessão `0004` traz o segundo, e ele é pior: uma analogia minha (a régua de marcas grossas)
implantou no aluno a ideia de que "mais precisão elimina o erro". Ela sobreviveu a **duas
sessões** e ao experimento que o próprio aluno rodou em casa. Está em `progress.json` como
`erro_numerico` com `state_reason: "conceptual_error"`, e em `profile.json` como:

```
f-0008  antipattern  erro-numerico  backfired
        known_limit: "A analogia mapeia o erro para a FERRAMENTA e esconde que a causa é a
        subtração de dois números quase iguais. A concepção errada que ela implantou sobreviveu
        a duas sessões e a um experimento do próprio aluno."
```

Oito `procedural_facts` foram consolidados; **três** deles registram um movimento que não
funcionou (`antipattern` ×2, `no_effect` ×1). É isso que o produto promete: o tutor lembra o que
**não** funcionou com você.

### `progress.json` — quatro estados, e um deles decaiu sem ter falhado

| conceito | estado | `state_reason` | o que isso quer dizer |
|---|---|---|---|
| `regra_da_potencia` | `mastered` | `passed_unassisted` | Duas passagens autônomas em sessões distintas (T1 → T2). Revisão só em 2026-08-27. |
| `derivada_como_taxa` | `fragile` | **`temporal_decay`** | Chegou a `mastered` em 21/07 e **caiu por tempo** (T4) em 23/08 — 28 dias vencido, `overdue_ratio` 5,6. |
| `derivada_numerica` | `fragile` | `passed_unassisted` | Passou, mas a primeira passagem exigiu 3 degraus de dica (classe B → T1). |
| `erro_numerico` | `unknown` | `conceptual_error` | **Tentou e errou.** Há evidência: um desafio classe C com `error_type: "conceptual"`. |
| `regra_da_cadeia` | `unknown` | `no_evidence` | Só `exposure`: apareceu na aula, nunca foi testado. |

**⭐ Decair (T4) é diferente de falhar (T3), e o exemplo mostra os dois lados.** `derivada_como_taxa`
não errou nada — só ficou 33 dias sem revisão. A consequência prática, em `docs/04-proficiencia.md`
§3.4 e §7: o próximo encontro abre com uma **checagem de recall curta**, não com um reensino, e
**uma única** passagem autônoma (T5) restaura `mastered`. Já `erro_numerico`, que falhou de
verdade, precisa de reensino.

E `unknown` aqui vem em dois sabores que o arquivo distingue: "tentou e errou"
(`conceptual_error`) e "nunca foi testado" (`no_evidence`). O `README.md` do setup fecha com a
frase que resume a disciplina inteira: *"`unknown` quer dizer que não há registro de desafio, não
que o aluno não sabe."*

### `challenges/` — o que o aluno vê e o que fica oculto

```
0001-derivada-numerica/
├── README.md      ← o enunciado + a LISTA FECHADA dos 6 cenários cobertos
├── stub.py        ← o ÚNICO arquivo que o aluno edita
├── tests/         ← a especificação executável: ele lê, não edita
├── runner.sh      ← o comando único
├── meta.json      ← o manifesto: cenários, oráculo, sandbox, VEREDITO da validação
└── .solution/     ← OCULTO: referência + 2 alternativas corretas + stub vazio
```

O enunciado nunca diz "todos os cenários de erro". Diz **estes seis, nomeados**, e explica que a
cobertura real é um número medido (o *mutation score*), não uma promessa. `.solution/` guarda a
referência e **duas implementações alternativas corretas e estruturalmente diferentes** — elas
existem para o passo 3 do protocolo provar que o teste não está cobrando um jeito específico de
escrever, só a resposta certa.

### `researchs/` — o destilado, no estilo "direto ao ponto"

Dois arquivos, ambos obedecendo às regras de `SK/references/researchs.md`: título é o conceito
(não a slug crua), primeira frase é o fato, vocabulário de seções **fechado** (`Definição`,
`Fórmula`, `Exemplo mínimo`, `Armadilha`, `Ver também`) e nenhuma seção proibida — sem
Introdução, sem Resumo, sem Conclusão, sem Contexto.

Compare a primeira linha de [`0002.md`](setup-calculo-python/researchs/0002.md) com o que um
documento comum faria:

> **Aqui:** "O erro total de uma derivada numérica é a soma de dois termos com sinais de
> dependência opostos em `h`: …"
>
> **Proibido:** "Neste destilado vamos explorar o conceito de erro numérico, que é um dos temas
> mais importantes…"

O bloco de proveniência da primeira linha (comentário HTML com JSON, legível por `jq`) declara
`"provenance":"student_provided"` e aponta `sources[]` para `docs/apostila-derivadas.md`: dá para
auditar de onde cada fato veio.

`researchs/assets/0001-derivada-definicao/` traz o gráfico nas **quatro** saídas obrigatórias do
mesmo `render-plot.py`:

| saída | para quem |
|---|---|
| `.svg` | o aluno, no navegador |
| `.html` | o aluno, autocontido — sem CDN, sem `<script src>`, sem `<link>` |
| `.txt` | o terminal (braille Unicode) |
| `.md` | **o modelo** — a descrição textual do que foi desenhado, porque quem gerou o gráfico não o enxerga |

### `docs/` do setup — o material do aluno

Um arquivo, o único escrito à mão, porque representa exatamente o que o aluno traz de fora.
`memory/docs-index.json` registra que ele coube inteiro no orçamento (`mode: "full"`), e as cinco
sessões gravam `docs_coverage`.

---

## ⚠️ O que este exemplo denuncia

Gerar o exemplo **é** um teste de integração. **Seis** defeitos maiores e **três** menores
apareceram só de rodar os scripts de ponta a ponta, e nenhum foi maquiado: o que está commitado é a
saída real.

⚑ **Todos os nove já foram corrigidos.** Cada achado fica aqui com o diagnóstico original — é o
valor deste documento — e termina com o que mudou. O que continua commitado em
`setup-calculo-python/` é a saída gerada **antes** das correções: é ela que prova o defeito. Os
achados citam o **símbolo** (função, check, template), não o número de linha: linha envelhece.

### 1. [CORRIGIDO] Nenhum desafio Python podia ser aprovado — `lib/json.sh`, `sm_json_get`

`meta.json` do desafio diz `"verdict": "rejected"`, `"challenge_status": "draft"`, com uma única
rejeição: `build_failed — "o stub vazio nao compila (build_command saiu 127)"`. Um desafio em
Python **não tem etapa de build**, e `meta.json` corretamente não declara `build_command`.

A causa era: `sm_json_get` terminava com `printf '%s\n' "$out"` mesmo quando `jq` não produziu nada.
`mapfile -t` recebia uma linha vazia e montava um array de **um** elemento vazio, em vez de zero
elementos.

```bash
$ mapfile -t B < <(sm_json_get meta.json '.execution.build_command[]? // empty'); echo ${#B[@]}
1
$ mapfile -t B < <(jq -r '.execution.build_command[]? // empty' meta.json); echo ${#B[@]}
0
```

Em `challenge-verify.sh` isso tornava `CV_BUILD_CMD` "não vazio"; o passo 0.5 então executava a
string vazia como comando, recebia 127, e reprovava. Como só `approved` libera
`challenge_status: validated` (DES-2), **nenhum desafio em Python ou JavaScript chegava ao aluno**.

Verificado numa cópia isolada em que **essa linha, e só ela, foi corrigida** — `[ -n "$out" ] &&
printf ...`: **este mesmo desafio**, byte a byte o que está commitado, percorre o protocolo inteiro
e passa nos sete passos. 17 mutantes gerados, 17 válidos, **17 mortos, 0 sobreviventes**,
`mutation_score` 1.0000 contra um limiar de 0,90, determinismo estável em 3 execuções variando
`LC_ALL`/`TZ`/`PYTHONHASHSEED`, as 2 alternativas corretas aceitas — **`verdict: approved`**,
`challenge_status: validated`. O desafio está certo; o harness é que não consegue dizer isso.

**Corrigido:** `sm_json_get` passou a usar um sentinel `x<status>` e devolve **zero** linha onde o
`jq` devolve zero — a saída é a do `jq` byte a byte, e isso virou contrato declarado no próprio
`lib/json.sh`. Confere assim, da raiz do repositório:

```bash
$ export SM_LIB_DIR=skills/study-method/scripts/lib
$ source skills/study-method/scripts/lib/json.sh
$ mapfile -t B < <(sm_json_get examples/setup-calculo-python/challenges/0001-derivada-numerica/meta.json \
    '.execution.build_command[]? // empty'); echo ${#B[@]}
0
```

**Consequência para a leitura deste exemplo:** `progress.json` registra o aluno resolvendo um
desafio que `meta.json` diz estar reprovado. Num build correto isso não coexistiria. Os dois
arquivos estão certos cada um por si — a incoerência entre eles é o defeito, não a ficção.
`memory/0002.json` registra a decisão do tutor de entregar mesmo assim, e a pergunta em aberto
chega até a seção "Estado atual" do `README.md` do setup. O `meta.json` commitado ainda carrega o
`verdict: rejected` produzido **antes** da correção: regerar o exemplo hoje sai `approved`.

### 2. [CORRIGIDO] O stub gerado não era código válido em 4 das 5 linguagens — `challenge-new.sh`

O que `challenge-new.sh` entregou, literalmente, antes de o tutor reescrever:

```python
def derivada_numerica(def derivada_numerica(n):):
```

`SIGNATURE` era setado com a **declaração inteira** (`"def $FUNC_NAME(n):"`), mas
`templates/challenge/python/stub.py.tmpl` a interpolava **dentro** da declaração que ele mesmo montava:
a linha do template é `def`, o placeholder de `FUNC_NAME`, abre-parêntese, o placeholder de
`SIGNATURE`, fecha-parêntese e dois-pontos — ou seja, `SIGNATURE` ali significa *lista de
parâmetros*, e o script manda a assinatura toda. O mesmo desencontro estava em `node/stub.mjs.tmpl`,
`go/stub.go.tmpl` e `rust/lib.rs.tmpl`. Só `c/stub.c.tmpl`, que usa o placeholder de `SIGNATURE`
sozinho no início da linha, casava com a convenção do script.

**Corrigido:** os cinco `stub.*.tmpl` passaram a usar o placeholder de `SIGNATURE` sozinho na
linha — a convenção que só o de C seguia. `head -1` de `challenge/python/stub.py.tmpl` é hoje o
placeholder e nada mais.

(O `README.md` que você está lendo não reproduz os placeholders com as chaves duplas de propósito:
`tests/gate-lint.sh` L-03 reprova qualquer `{`+`{NOME}`+`}` fora de um `*.tmpl`.)

### 3. [CORRIGIDO] `test_name` apontava para uma classe que não existia — `challenge-new.sh`

O script gravava `tests.test_stub.TesteDesafio.test_<cenario>`; o template
`python/test_stub.py.tmpl` declara `class TestStub`. O nome declarado no manifesto não resolvia.

**Corrigido:** `TesteDesafio` não existe mais em lugar nenhum do script
(`grep -c TesteDesafio skills/study-method/scripts/challenge-new.sh` → `0`); o nome gravado é
`TestStub`, o que o template declara.

### 4. [CORRIGIDO] E, mesmo corrigido o nome da classe, o passo 6 nunca casava — `challenge-verify.sh`

`cv_probe_names` extrai do `unittest -v` o nome **curto** (`test_afim_e_exata`), enquanto
`challenge-new.sh` declarava o **qualificado**. Comparação de igualdade de string entre as duas
formas nunca dava verdadeiro, e o passo 6 reprovava com "cenário declarado … não foi executado" **e**
"caso executado … não está declarado". O próprio `challenge-manifest.schema.json` resolve a
ambiguidade: `test_name` é o nome *"como o runner o reporta"* — o curto, em Python. É a forma
usada neste exemplo.

**Corrigido:** `ch_test_name` grava o nome **curto** em `scenarios[].test_name`, e a forma
qualificada sobrou só como filtro de execução única dentro do `runner.sh` — está dito em comentário
nos dois scripts.

### 5. [CORRIGIDO] O `progress-update.sh` do fechamento nunca rodava — `session-close.sh`

`session-close.sh` chamava `progress-update.sh "$SM_SETUP_ROOT"` sem modo. `progress-update.sh`
exige exatamente um de `--event`, `--due` ou `--recompute`, e sai 2. O erro era engolido como aviso
("o derivado é reconstruível"), então **toda** sessão fechava com essa mensagem e o passo
simplesmente não acontecia.

**Corrigido:** a chamada é `progress-update.sh "$SM_SETUP_ROOT" --recompute`, com um comentário no
próprio `session-close.sh` nomeando o bug antigo. Neste exemplo os eventos de proficiência são aplicados por fora, em
`_gerador/08-progresso.sh`, um `--event` de cada vez.

### 6. [CORRIGIDO] A invariante I-39 do gate lia o caminho errado — `tests/validate.sh`, check `I-39`

Este é o primeiro fixture que `examples/` já teve, e ele acendeu um check que nunca tinha rodado.
`tests/validate.sh` procurava `.sandbox.mode` e `.sandbox.timeout_source` na **raiz** do `meta.json`.
O `challenge-manifest.schema.json` põe os dois em `.execution.sandbox`, e a raiz é
`additionalProperties: false` — um `sandbox` na raiz **não passa no schema**. O `meta.json` deste
exemplo tem os dois campos, no lugar certo:

```json
"execution": { "…": "…", "sandbox": { "mode": "posix_floor",
  "network_isolated": false, "timeout_source": "coreutils_timeout" } }
```

Enquanto o `jq` do check não subisse um nível, **I-39 era impossível de satisfazer** para qualquer
`meta.json` válido. O §11 do `docs/00-contratos.md` também escrevia `sandbox.timeout_source` sem
qualificar o caminho, e era de lá que a leitura literal vinha.

**Corrigido dos dois lados:** o contrato escreve `execution.sandbox.mode` e
`execution.sandbox.timeout_source` qualificados (§11, `I-39`), e o `jq` do check subiu um nível.
`GATE_ONLY=I-39 tests/validate.sh` fecha verde.

### Menores, mas reais

- **[CORRIGIDO] `research-new.sh`** gravava `provenance: "generated_researched"` sempre que havia `--sources`.
  `docs/13-researchs.md` §205 mapeia arquivo do `docs/` do setup para `student_provided`, e
  `SK/references/researchs.md:54` proíbe explicitamente marcar `generated_researched` sem ter
  chamado a busca web. O script afirmava uma pesquisa que não houve; o tutor corrigia, e é o que o
  gerador faz. **Corrigido:** com fontes grava `student_provided`, sem fontes `generated_unsourced`,
  e `generated_researched` deixou de ser gravável pela flag — está dito no `--help` do script.
- **[CORRIGIDO] `research-new.sh`** acrescentava uma chave `"id"` ao bloco de proveniência **além**
  do `"research_id"` que o template já traz. O exemplo canônico de `docs/13-researchs.md` tem só
  `research_id`. **Corrigido:** o normalizador escreve apenas `.research_id`.
- **[CORRIGIDO] `session.schema.json`** — `how_it_happened[].target_topic` casava
  `^[a-z0-9]+(-[a-z0-9]+)*$` (kebab) enquanto a descrição dele mandava estar em `topics`, cujos
  itens casam `^[a-z][a-z0-9_]{1,62}$` (snake). Nenhuma tag de duas palavras satisfazia as duas ao
  mesmo tempo. **Corrigido:** `target_topic` é identificador de tópico, então é **snake_case**, o
  mesmo pattern de `topics[]` — a decisão `A-35` do contrato registra a superseção da `A-15`, e a
  razão é que a recuperação do playbook compara os dois por **igualdade de string**. Este exemplo
  usa snake nos dois (`erro_numerico`, `regra_da_cadeia`).

---

## Prova de que está tudo válido

`_gerador/10-validar.sh` roda no fim de `gerar.sh` e valida **20 arquivos JSON** contra o schema
dono de cada um, com o verificador mínimo de `skills/study-method/scripts/lib/_jsonschema_min.py`:
`setup.json`, as 5 sessões, `INDEX.json`, `profile.json`, `progress.json`, `docs-index.json`, o
`meta.json` do desafio, os 8 eventos de proficiência e o `registry.json` global. **Zero falhas.**

`readme-sync.sh` é rodado duas vezes seguidas e o `diff` das duas saídas é vazio — idempotência
byte a byte.

## Privacidade

O setup foi varrido, arquivo por arquivo, atrás de nome de usuário, `/home/`, `/tmp/`, hostname,
e-mail e caminho absoluto: **nada**. Todas as datas caem na janela fictícia 2026-07-06 → 2026-08-23.
O único valor derivado da máquina que sobreviveu ao commit é `"runtime_version": "Python 3.14.7"`
em `meta.json` — um campo funcional do manifesto do desafio (a sandbox precisa dele), sem
informação sobre pessoa, usuário ou host.

O aluno é fictício. Nada em `memory/` descreve uma pessoa real.
