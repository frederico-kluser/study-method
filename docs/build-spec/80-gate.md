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
diferentes. Os dois deixam o gate vermelho; só a mensagem muda.

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
| `gate_summary` | — | Resumo, limitações, e retorna `1` se houve FAIL ou PEND |

Auxiliares: `gate_repo_root`, `gate_rel`, `gate_trunc`, `gate_find_into` (listagem NUL-separada,
correta com caminho contendo espaço), `gate_schema_validator`, `gate_cleanup_tmp`.

Toda falha imprime três linhas: **onde** (arquivo:linha ou comando), **esperado** e **obtido**.
Nenhum `FAIL` sem contexto.

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
| B — inventário | `I-06a`, `I-06b`, `I-06c` | A tabela §8 declara 19 scripts; os 19 existem; nenhum script fora da lista |
| C — schemas | `I-07`..`I-17`, `G-01`, `G-02`, `G-03`, `G-03b`, `G-11`, `G-13` | `$id` no namespace único e sem repetição; nenhuma construção proibida; cobertura do metaschema mínimo; `description` em toda propriedade; assinatura única por vocabulário; enums literais de sessão, fato, linguagem e leitura cruzada; patterns de identidade, conceito, slug e timestamp |
| D — scripts | `I-18`..`I-27` | Exit codes só `0 1 2 3 4 5 10`; `pipefail` presente; falha lida como `!= 0`; só os quatro scripts do protocolo aceitam `--apply` e saem com 10; `LIB-1`; as 26 funções de `lib/`; escrita confinada; zero rede; derivados por escrita atômica |
| E — runtime | `I-28`..`I-32` | O digest sai `0` nos quatro cenários de borda e mantém a ordem fixa de chaves; `readme-sync.sh` e `setup-init.sh` idempotentes |
| F — `SKILL.md` | `I-33`, `I-34`, `I-35`, `G-04`..`G-07` | Corpo com no máximo 200 linhas e os 88 IDs de regra, incluindo as 11 marcadas `†`; grafo de references de **um nível**; sumário nas references longas; frontmatter só com os seis campos portáveis; `name` igual ao nome do diretório; `description` de no máximo 1024 caracteres |
| G — templates | `I-36`..`I-41`, `G-08`, `G-09` | Proveniência por bloco de comentário e nunca por frontmatter; caminho relativo dentro do setup; campos de sandbox no manifesto do desafio; `exit 66` e tratamento de 137 no executor gerado; a linha `memory/` no arquivo de exclusão do git; as 8 seções de marcador; todo placeholder declarado no `MANIFEST.tsv` e nenhum sobrando fora de template |
| H — conteúdo | `I-42`, `I-43` | Nenhuma promessa de cobertura exaustiva de cenários de erro; nenhuma das afirmações derrubadas pela auditoria de `../02-pedagogia.md` §9 |
| I — terminologia | `G-10` | O termo do diretório de documentação sempre qualificado ("do repositório" ou "do setup"), §10 |
| J — decisões | `G-12a`, `G-12b` | Cada `D-NNN` com as três camadas sincronizadas, e todo destino de escrita resolvível no manifesto do setup |

### 4.2 Escopo de busca de texto

Os checks de termo (`I-01b`, `I-03`, `I-04`, `I-05`, `I-15b`, `I-42`, `I-43`, `G-09`, `G-10`)
varrem `docs/`, `skills/`, `examples/`, `evals/` e o `README.md` do repositório. Ficam **fora do
escopo, de propósito**:

| Fora do escopo | Por quê |
|---|---|
| `docs/00-contratos.md` | É a autoridade: cita os termos revogados nas próprias invariantes e nas decisões |
| `docs/research/**` | Registro histórico auditado, escrito antes das arbitragens |
| `tests/**` | O gate precisa conter os termos que procura |

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

---

## 5. `tests/gate-lint.sh` — qualidade

| ID | Verifica |
|---|---|
| `L-01` | Frontmatter YAML lido por `awk` — **não há PyYAML nesta máquina**: forma `chave: valor`, sem tabulação, sem chave repetida, delimitador fechado |
| `L-02` | Link relativo quebrado em `.md` (ignora URL, âncora, bloco cercado e trecho em code span) |
| `L-03` | Abertura de placeholder sem fechamento na mesma linha, e placeholder fora de `*.tmpl` |
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
| `validate.sh` | A busca por termo revogado tolera o contexto revogatório e ignora dois caminhos (§4.2 e §4.3 acima) |
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
