# 80 — O gate do repositório

Contrato dos quatro scripts de `tests/`. O porquê de cada invariante vive em
[`../00-contratos.md`](../00-contratos.md); aqui está **o que cada script verifica, como
verifica, o que ele declara não verificar, e como rodar**.

`docs/00-contratos.md` do repositório **vence**. O gate é a tradução mecânica daquele
documento: quando um muda, o outro muda junto.

---

## 1. Os quatro scripts

| Script | Pergunta que responde | Depende de |
|---|---|---|
| `tests/gate-build.sh` | O que está no disco é sintaticamente válido e tem a forma exigida? | `bash`, `python3`, `stat` |
| `tests/validate.sh` | O repositório obedece aos contratos (as 43 invariantes do §11)? | `bash`, `python3`, `jq` |
| `tests/gate-lint.sh` | O texto e os arquivos têm qualidade de leitura? | `bash`, `python3`, `awk` |
| `tests/smoke.sh` | O fluxo ponta a ponta funciona de verdade? | os 12 executáveis do fluxo |

`tests/lib/assert.sh` é **biblioteca**: apenas `source`, modo `0644`, sem shebang, sem bloco
`main` — a mesma disciplina de LIB-1 aplicada ao gate. Os quatro executáveis são `0755`, abrem
com `#!/usr/bin/env bash` e `set -euo pipefail`.

### 1.1 Como rodar

```
tests/gate-build.sh          # sintaxe e forma
tests/validate.sh            # contratos
tests/gate-lint.sh           # qualidade de texto
tests/smoke.sh               # integração ponta a ponta
tests/smoke.sh --keep        # preserva o diretório de trabalho para inspeção
```

Variáveis de ambiente reconhecidas:

| Variável | Efeito |
|---|---|
| `GATE_ONLY` | Lista separada por vírgula de **prefixos de id**; só os checks que casam rodam. Ex.: `GATE_ONLY=I-08,I-3` |
| `GATE_ROOT` | Raiz do repositório a auditar. Default: o diretório que contém `tests/`. Serve para rodar o gate sobre uma cópia. |
| `STUDY_METHOD_TODAY` | Data fixa (`AAAA-MM-DD`) usada pelas invariantes de runtime e pelo smoke. Default `2026-08-23`. |
| `NO_COLOR` | Desliga a coloração ANSI. |
| `GATE_TMPDIR` | Diretório de trabalho temporário. Apagado no fim, exceto com `smoke.sh --keep`. |

### 1.2 Exit codes do gate

| Código | Significado |
|---|---|
| `0` | Verde: nenhuma falha e nenhuma pendência |
| `1` | Vermelho: há violação de contrato **ou** artefato ainda inexistente |
| `2` | Uso incorreto (argumento desconhecido) |
| `3` | Só `smoke.sh`: pré-requisito ausente — o fluxo não pôde nem começar |

### 1.3 Os cinco estados de um check

| Estado | Símbolo | Significado | Conta como vermelho? |
|---|---|---|---|
| PASS | `✔` | Passou | não |
| FAIL | `✘` | Violação de contrato: o repositório regrediu | **sim** |
| PEND | `◌` | O artefato verificado ainda não existe no disco | **sim** |
| SKIP | `–` | Não aplicável neste ambiente (ferramenta opcional ausente) | não |
| WARN | `!` | Divergência que não reprova (ex.: contradição entre dois documentos-fonte) | não |

A distinção **FAIL × PEND** existe porque "escrito errado" e "ainda não escrito" pedem ações
diferentes. Os dois deixam o gate vermelho; só a mensagem muda. Por isso reclassificar um check
para PEND **não afrouxa nada** — continua vermelho, continua bloqueando; o que muda é que a
mensagem passa a nomear o artefato que falta e o dono dele, em vez de acusar como regressão algo
que ninguém escreveu ainda. `G-12c` e `G-12d` são exatamente isso: os derivados do catálogo de
decisões pertencem a outra onda, e o gate diz isso em vez de fingir que o repositório regrediu.

---

## 2. `tests/lib/assert.sh` — a API

| Função | Assinatura | O que faz |
|---|---|---|
| `gate_init` | `<nome>` | Cabeçalho e raiz auditada |
| `gate_section` | `<título>` | Separador de bloco |
| `gate_limitation` | `<texto>` | Registra uma **limitação declarada**, impressa no resumo |
| `gate_pass` | `<id> <desc>` | Registra sucesso |
| `gate_fail` | `<id> <desc> <esperado> <obtido> [onde]` | Registra violação com contexto completo |
| `gate_pend` | `<id> <desc> <pré-requisito>` | Registra pendência |
| `gate_skip` | `<id> <desc> <motivo>` | Registra ignorado |
| `gate_warn` | `<id> <desc> <detalhe>` | Registra aviso |
| `assert_eq` | `<id> <desc> <esperado> <obtido> [onde]` | Igualdade literal |
| `assert_ne` | `<id> <desc> <proibido> <obtido> [onde]` | Desigualdade |
| `assert_match` | `<id> <desc> <texto> <ERE> [onde]` | Casamento de regex |
| `assert_nomatch` | `<id> <desc> <texto> <ERE> [onde]` | Ausência de casamento |
| `assert_file` | `<id> <caminho> <desc>` | Arquivo existe (senão PEND) |
| `assert_dir` | `<id> <caminho> <desc>` | Diretório existe (senão PEND) |
| `assert_exit` | `<id> <esperado> <desc> -- <cmd…>` | Exit code do comando |
| `assert_grep_empty` | `<id> <desc> <esperado> <achados>` | Falha se houve achado; imprime até 8 linhas |
| `gate_scope_excl` | `<ids> <o-que-fica-de-fora> <por-quê>` | Registra uma **exclusão de escopo declarada**, impressa em bloco próprio do resumo |
| `gate_shell_scope_tool` | — | Materializa o classificador léxico de fonte shell e imprime o caminho (§4.5) |
| `gate_summary` | — | Resumo, limitações, exclusões, e retorna `1` se houve FAIL ou PEND |

Auxiliares: `gate_repo_root`, `gate_rel`, `gate_trunc`, `gate_find_into` (listagem NUL-separada,
correta com caminho contendo espaço), `gate_schema_validator`, `gate_cleanup_tmp`.

Toda falha imprime três linhas: **onde** (arquivo:linha ou comando), **esperado** e **obtido**.
Nenhum `FAIL` sem contexto.

**Exclusão de escopo é declarada, nunca implícita.** Todo check que deixa um caminho, um nome de
arquivo ou uma forma sintática de fora chama `gate_scope_excl` dizendo **quais ids** afeta, **o
que** some do escopo e **por quê** — e o resumo imprime a lista sob `EXCLUSÕES DE ESCOPO
DECLARADAS`. Exclusão escondida é pior que exclusão conhecida: um gate que se cala sobre o que
não olha vale menos que um que diz onde não olha.

### 2.1 O verificador mínimo de JSON Schema

`gate_schema_validator` materializa, em `$GATE_TMPDIR/jsonschema_min.py`, um verificador escrito
só com a stdlib do Python — não há `jsonschema` nesta máquina e o PEP 668 impede instalar.

```
jsonschema_min.py <instancia.json> <schema.json>   # 0 válido · 5 inválido · 2 uso · 1 I/O
jsonschema_min.py --lint-schema <schema.json>      # só confere a cobertura
```

Erros saem em stderr, uma linha por erro, no formato `<json-pointer>: <motivo>`.

**Cobre:** `type` (string **ou array de strings**, ex. `["string","null"]`), `required`, `enum`,
`const`, `pattern`, `properties`, `items`, `additionalProperties` (`false`, `true` ou subschema),
`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `minLength`, `maxLength`,
`minItems`, `maxItems`, `uniqueItems`.

**Não cobre — e RECUSA o schema que use:** `$ref`, `allOf`, `anyOf`, `oneOf`, `not`,
`if`/`then`/`else`, `$defs`, `definitions`, `patternProperties`, `propertyNames`,
`dependentSchemas`, `dependentRequired`, `contains`, `unevaluatedProperties`, `items` como array
(validação por tupla). `format` é aceito como palavra-chave e **nunca validado**.

Recusar em vez de ignorar é a decisão que importa: um schema com `$ref` não passa despercebido.

---

## 3. `tests/gate-build.sh` — sintaxe e forma

| ID | Verifica |
|---|---|
| `B-01` | `bash -n` em todo `*.sh` do repositório |
| `B-02` | `python3 -m py_compile` em todo `*.py` |
| `B-03` | Todo `*.json` parseia com `json.load` da stdlib |
| `B-04` | **LIB-1**: `SK/scripts/lib/*.sh` em modo `0644`, sem shebang e **sem bit de execução** |
| `B-05` | Todo executável de `SK/scripts/` em modo `0755` |
| `B-06` | Shebang canônico: `#!/usr/bin/env bash` ou `#!/usr/bin/env python3` |
| `B-07` | Todo executável `.sh` declara `set -euo pipefail` |
| `B-08` | Os quatro scripts do gate seguem as mesmas regras; `tests/lib/assert.sh` é `0644` |
| `B-09` | Nenhum arquivo de texto com fim de linha CRLF |
| `B-10` | Todo `*.sh.tmpl` parseia como bash depois de substituir os placeholders |
| `B-11` | `shellcheck -S error`, **se existir** nesta máquina — bônus opcional, nunca dependência |

Limitação declarada: `gate-build.sh` não olha semântica nenhuma.

---

## 4. `tests/validate.sh` — os contratos

Implementa as invariantes `I-01`..`I-43` de `../00-contratos.md` §11, mais as verificações
estruturais `G-01`..`G-13` que o §4, o §7, o §9 e o §10 exigem sem terem sido numeradas no §11.

### 4.1 Mapa das invariantes

| Bloco | IDs | O que cobre |
|---|---|---|
| A — nomes e termos | `I-01`, `I-01b`, `I-02`, `I-03`, `I-04`, `I-05`, `I-15b` | Os 9 nomes de passo no `SKILL.md`; as guardas dos dois passos condicionais; ausência de todo nome e campo revogado |
| B — inventário | `I-06a`, `I-06b`, `I-06c` | A tabela §8 declara 19 scripts; os 19 existem; nenhum script **sem prefixo `_`** fora da lista |
| C — schemas | `I-07`..`I-17`, `G-01`, `G-02`, `G-03`, `G-03b`, `G-11`, `G-13` | `$id` no namespace único e sem repetição; nenhuma construção proibida; cobertura do metaschema mínimo; `description` em toda propriedade; assinatura única por vocabulário; enums literais de sessão, fato, linguagem e leitura cruzada; patterns de identidade, conceito, slug e timestamp |
| D — scripts | `I-18`..`I-27` | Exit codes só `0 1 2 3 4 5 10`; `pipefail` presente; falha lida como `!= 0`; só os quatro scripts do protocolo aceitam `--apply` e saem com 10; `LIB-1`; as 26 funções de `lib/`; escrita confinada; zero rede; derivados por escrita atômica |
| E — runtime | `I-28`..`I-32` | O digest sai `0` nos quatro cenários de borda, mantém a ordem fixa de chaves (`I-29a`) e tem exatamente **18** chaves de topo, na tabela (`I-29b`) e no JSON produzido (`I-29c`); `readme-sync.sh` e `setup-init.sh` idempotentes |
| F — `SKILL.md` | `I-33`, `I-34`, `I-35`, `G-04`..`G-07` | Corpo com no máximo 200 linhas e os 90 IDs de regra, incluindo as 11 marcadas `†`; grafo de references de **um nível**; sumário nas references longas; frontmatter só com os seis campos portáveis; `name` igual ao nome do diretório; `description` de no máximo 1024 caracteres |
| G — templates | `I-36`..`I-41`, `G-08`, `G-09` | Proveniência por bloco de comentário e nunca por frontmatter; caminho relativo dentro do setup; campos de sandbox no manifesto do desafio; `exit 66` e tratamento de 137 no executor gerado; a linha `memory/` no arquivo de exclusão do git; as 8 seções de marcador; todo placeholder declarado no `MANIFEST.tsv` e nenhum sobrando fora de template |
| H — conteúdo | `I-42`, `I-43` | Nenhuma promessa de cobertura exaustiva de cenários de erro; nenhuma das afirmações derrubadas pela auditoria de `../02-pedagogia.md` §9 |
| I — terminologia | `G-10` | O termo do diretório de documentação sempre qualificado ("do repositório" ou "do setup"), §10 |
| J — decisões | `G-12a`, `G-12b`, `G-12c`, `G-12d` | O id de cada decisão no pattern (`G-12a`); todo `writes_to` resolvível no manifesto do setup (`G-12b`); a camada humana (`G-12c`) e o marcador de BUILD_SPEC (`G-12d`), ambos **PEND** enquanto o artefato-alvo não existir |

#### As três camadas de uma decisão (`G-12`)

`docs/build-spec/10-decisoes.md` §1 declara `SK/assets/decisions.json` como **origem de verdade**
e os outros dois como **derivados de outra onda**. O gate segue essa divisão:

| Check | Camada | Estado hoje | Por quê |
|---|---|---|---|
| `G-12a` | JSON — o id de cada entrada | roda | O catálogo existe |
| `G-12c` | humana — `docs/08-decisoes-abertas.md` | **PEND** | O arquivo é derivado e ainda não existe; a mensagem o nomeia e nomeia o dono |
| `G-12d` | BUILD_SPEC — o marcador `PERGUNTE AO USUÁRIO (D-…)` | **PEND** | Nenhum fragmento recebeu marcador ainda. Vira FAIL assim que o primeiro aparecer: aí a passada começou, e o que falta é omissão |

`G-12d` cobra marcador **só** de quem o §6.2 daquele fragmento manda marcar — `audience ∈
{builder, both}` **e** `status == open`, 48 das 114 entradas. As `student` viram pergunta em
runtime (§6.4) e as arbitradas viram uma linha de citação; exigir marcador delas seria exigir o
que o próprio contrato dispensa.

### 4.2 Escopo de busca de texto

Os checks de termo (`I-01b`, `I-03`, `I-04`, `I-05`, `I-15b`, `I-42`, `I-43`, `G-09`, `G-10`)
varrem `docs/`, `skills/`, `examples/`, `evals/` e o `README.md` do repositório. Ficam **fora do
escopo, de propósito**:

| Fora do escopo | De quais checks | Por quê |
|---|---|---|
| `docs/00-contratos.md` | todos | É a autoridade: cita os termos revogados nas próprias invariantes e nas decisões |
| `docs/research/**` | todos | Registro histórico auditado, escrito antes das arbitragens |
| `tests/**` | todos | O gate precisa conter os termos que procura |
| `SK/assets/decisions.json` | `I-01b`, `I-03`, `I-04`, `I-05`, `I-15b` | Cada entrada do catálogo **nomeia a opção recusada** (`session_status` é o id da alternativa perdedora de D-A03; `~/.study-method/` é o da de D-S02). Documentar a alternativa que perdeu é o contrato do arquivo. Os demais checks continuam varrendo-o |
| `docs/build-spec/**` | `G-09`, `L-03` | Os fragmentos **documentam** a sintaxe de placeholder ("`{{PKG}}` — o mesmo do stub", "Sobrar `{{` no material renderizado ⇒ 1"). Falar do buraco não é deixar buraco. `G-10` continua valendo aqui |
| `*.tmpl` e `MANIFEST.tsv` | `G-09`, `L-03` | O template é o dono do placeholder; o manifesto o declara |
| valor `{{…}}` | `I-17` | `"challenge_id": "{{CHALLENGE_ID}}"` é o buraco do id, não um id. A exclusão é do **valor**, não do arquivo: um `*.tmpl` que fixe `c-0001-slug` continua sendo FAIL |
| `SK/scripts/**/_*` | `I-06c` | O prefixo `_` **é** a marca de "não é um dos 19 de §8" (`lib/_jsonschema_min.py`, `lib/_mutate.py`). Script sem o prefixo e fora da tabela continua sendo FAIL |
| alvo temporário de `>` | `I-27` | O padrão de §7.1 é montar em `$SM_TMP/…` e publicar com `sm_atomic_write <final> < <temporário>`. O teste é sobre o **alvo** do `>`: um temporário na origem não protege ninguém |
| sufixo abaixo de objeto extensível | `G-12b` | `setup.json → decisions` é `additionalProperties: true` sem `properties` — um mapa de id para resposta que o schema declara extensível. A resolução para ali; caminho que morre em objeto **fechado** continua sendo FAIL |
| comentário, here-document e string multilinha de shell | `I-19`, `I-23`, `I-26`, `I-27`, `G-09`, `L-03` | §4.5 |

A lista acima é a mesma que o gate imprime em `EXCLUSÕES DE ESCOPO DECLARADAS` no fim da
execução. Se as duas divergirem, quem está errado é este documento.

### 4.3 A regra do contexto revogatório

Um documento que **diz** que um termo morreu não está usando o termo. `validate.sh` aceita a
linha cujo texto — ou o da linha anterior ou seguinte — casa um marcador de revogação
(`não existe`, `removido`, `revogado`, `descartado`, `em vez de`, `versão anterior`, `nunca`,
`proibido`, entre outros; a lista literal está na variável `REVOKE_MARKERS` de
[`../../tests/validate.sh`](../../tests/validate.sh)).

A janela de três linhas existe porque a revogação costuma quebrar de linha: o termo fica numa
linha e o "estão **descartados**" na seguinte.

Consequência prática: para o gate acusar, basta **usar** o termo sem dizer que ele morreu.

### 4.4 Assinatura única de vocabulário (`G-03`)

Um mesmo nome de campo não pode ter dois contratos diferentes em schemas diferentes. A
comparação é feita em duas camadas:

| Camada | Chaves comparadas | Divergência resulta em |
|---|---|---|
| Dura (`G-03`) | `pattern`, `enum` (descontando `null`), `minimum`, `maximum` | **FAIL** |
| Acessória (`G-03b`) | `type`, `minLength`, `maxLength` | **WARN** |

A nulidade é acessória porque o §4.1 já anota "(`null` onde opcional)": o mesmo vocabulário
aparece anulável num ponto opcional e não anulável num obrigatório, e isso não é divergência.

### 4.5 Escopo léxico de shell — usar um construto × falar dele

Cinco checks (`I-19`, `I-23`, `I-26`, `I-27`, `G-09`, e o `L-03` do lint) liam o fonte shell
linha a linha. Um grep de linha não distingue três coisas que precisam ser distinguidas:

| Forma | Exemplo real | O que é |
|---|---|---|
| Comentário | `# Substitui {{PLACEHOLDER}} pelo valor do mapa` | Documentação do renderizador |
| Corpo de here-document | o `<<'TMPL'` de `session-new.sh` e `research-new.sh` | O **template embutido**, usado quando o `*.tmpl` falta — passa pela mesma substituição |
| String multilinha | um programa `jq` entre aspas simples que atravessa 12 linhas | Dado, não código |
| Linha de código | `exit 10` na linha 145 de `lib/json.sh` | Execução — e aqui **o escopo importa**: essa linha está dentro de `sm_request`, que é justamente quem o §7.2 autoriza |

`gate_shell_scope_tool` (em `tests/lib/assert.sh`) materializa um classificador léxico que
percorre o fonte carregando estado de aspas **entre linhas**, reconhece here-document (com e sem
aspas no delimitador, com e sem `<<-`, sem confundir com a here-string `<<<`), e mantém a pilha
de funções por profundidade de chaves. Emite TSV:

```
rel <TAB> nº <TAB> kind <TAB> pilha-de-funções <TAB> profundidade <TAB> código
        kind ∈ code · comment · heredoc · string · blank · EOF
```

O que cada check passou a perguntar:

| Check | Pergunta |
|---|---|
| `I-23` | há `exit 10`/`return 10` numa linha de código cuja pilha de funções **não** contém `sm_request`? |
| `I-19` | há, no **nível de topo** (fora de toda função, fora de here-document), definição ou chamada de `main`, `"$@"` como **comando**, ou guarda de auto-execução? |
| `I-26` | há `curl`/`wget`/`nc`/`ncat`/`ssh`/`scp`/`sftp`/`rsync`/`telnet` **como palavra**, `/dev/tcp` ou `ftp://` numa linha de código? A fronteira de palavra é o que separa o comando `nc` do `nc` que vive dentro de `func `, `sync ` e `Async ` |
| `I-27` | o **alvo** de um `>` é um derivado no destino final (não um temporário) numa linha de código? |
| `G-09` / `L-03` | sobrou `{{…}}` numa linha de código de artefato materializado? |

**Não é um parser de shell** e o gate diz isso: o classificador se autoverifica pela profundidade
de chaves, e arquivo cuja profundidade não fecha em zero vira `WARN SCOPE` — nele os checks caem
para a leitura crua, preferindo falso positivo a buraco de cobertura.

### 4.6 Duas assimetrias arbitradas

| Invariante | O contrato antigo dizia | O que o gate checa | Por quê |
|---|---|---|---|
| `I-29` | 19 chaves de topo no digest | **18** | `procedural_playbook` é uma chave só; `do` e `avoid` vivem **aninhados** dentro dela e nunca aparecem no topo. Quem contou 19 contou um aninhado |
| `I-14` | 19 valores de `language` nos três schemas | **20** em `setup-manifest` e `registry`, **19** em `challenge-manifest` | `none` existe onde se descreve um **setup** — que pode legitimamente não ter código. Um **desafio** em linguagem nenhuma não existe. A assimetria é deliberada |

`docs/00-contratos.md` §4.1 e §11 ainda carregam os números antigos: é o texto do contrato que
precisa da correção. O gate imprime uma nota em cada execução dizendo isso — divergência
conhecida, não divergência escondida.

---

## 5. `tests/gate-lint.sh` — qualidade

| ID | Verifica |
|---|---|
| `L-01` | Frontmatter YAML lido por `awk` — **não há PyYAML nesta máquina**: forma `chave: valor`, sem tabulação, sem chave repetida, delimitador fechado |
| `L-02` | Link relativo quebrado em `.md` (ignora URL, âncora, bloco cercado e trecho em code span) |
| `L-03` | Abertura de placeholder sem fechamento na mesma linha, e placeholder fora de `*.tmpl`. Fora do escopo, declarado: `docs/build-spec/**` (documenta a sintaxe), comentário e here-document de script (§4.5), e o literal de busca `'{{'` do guarda final de cada renderizador — que é o código que implementa esta mesma regra |
| `L-04` | Arquivo de texto sem newline final |
| `L-05` | Tabela markdown malformada: sem linha separadora, ou linhas com número de colunas diferente do cabeçalho |
| `L-06` | Espaço em branco no fim da linha — **aviso**, não reprova |

---

## 6. `tests/smoke.sh` — o critério de saída

Roda num diretório temporário, com `STUDY_METHOD_HOME` próprio e `STUDY_METHOD_TODAY` fixo.
Nada toca o `$HOME` real e nada depende do relógio.

| Passo | O que faz | Checks |
|---|---|---|
| `0` | Confere os 12 executáveis do fluxo. Faltando algum, **sai com 3** nomeando cada ausente | `S-00` |
| `1` | Cria um setup do zero e sincroniza o `README.md` do setup | `S-01a`..`S-01g` |
| `2` | Abre e fecha **3 sessões**, exercitando o ciclo REQUEST/APPLY do fechamento | `S-02a`..`S-02g` |
| `3` | Gera **1 desafio Python** e o valida pelo protocolo completo, incluindo a classificação de sobreviventes | `S-03a`..`S-03f` |
| `4` | Renderiza **1 gráfico** e confere as quatro saídas obrigatórias e o HTML autocontido | `S-04a`..`S-04e` |
| `5` | Roda a sincronização do `README.md` do setup duas vezes e prova **idempotência byte a byte** | `S-05a`..`S-05c` |
| `6` | Valida **todo JSON produzido** contra o schema dono, e confere que nada de placeholder e nenhum caminho absoluto sobrou | `S-06a`..`S-06j` |

O modelo **não está no laço**: quando um script sai com 10, o smoke lê o pedido, sintetiza a
resposta mecanicamente a partir do `response_schema` declarado, e re-invoca com `--apply`.
É o que o §6 promete — "o gate roda os 19 scripts com respostas fixas". No máximo dois ciclos
por invocação (RA-6); um terceiro é falha.

---

## 7. Limitações declaradas

Limitação escondida é pior que limitação conhecida. Cada script imprime as suas no resumo.

| Script | Limitação |
|---|---|
| `gate-build.sh` | Não verifica semântica nenhuma |
| `gate-build.sh` | Sem `shellcheck` nesta máquina, a análise estática de shell fica em `bash -n`: sintaxe, não uso |
| `validate.sh` | O verificador de schema é **parcial por design** (§2.1 acima) |
| `validate.sh` | `I-24`, `I-25`, `I-26` e `I-27` são **análise estática de texto**: acusam o padrão declarado no fonte, não provam ausência em todo caminho de execução |
| `validate.sh` | A busca por termo revogado tolera o contexto revogatório e ignora os caminhos declarados (§4.2 e §4.3 acima) |
| `validate.sh` | `I-19`, `I-23`, `I-26`, `I-27` e `G-09` leem o fonte shell por **classificador léxico**, não por parser de shell completo (§4.5). Ele se autoverifica e reporta o arquivo que não entendeu |
| `validate.sh` | `G-09` não vê o que um here-document produz em runtime; quem cobre o material realmente renderizado é o smoke (`S-06`) |
| `gate-lint.sh` | `L-03` tem as mesmas exclusões de `G-09` (§4.2) |
| `validate.sh` | `format` de JSON Schema nunca é validado |
| `gate-lint.sh` | O frontmatter é lido por `awk`: cobre a forma, não a semântica YAML completa |
| `gate-lint.sh` | `L-02` resolve só link relativo de arquivo; URL e âncora não são verificadas |
| `smoke.sh` | Prova o **caminho**, não a qualidade do julgamento que o modelo daria |

---

## 8. Determinismo

O gate não pode depender do relógio nem do `$HOME` de quem roda.

| Mecanismo | Onde entra |
|---|---|
| `STUDY_METHOD_TODAY` | Honrado por `sm_today` (§7.1); `validate.sh` e `smoke.sh` o exportam com valor fixo |
| `--now` do digest | Carimbo de `generated_at`; sem ele, o mesmo estado em disco produz bytes diferentes |
| `STUDY_METHOD_HOME` | O smoke aponta para dentro do diretório temporário: o registry real nunca é tocado |
| `gate_find_into` | Listagem ordenada e NUL-separada: mesma ordem de arquivos em toda execução, e caminho com espaço funciona |
