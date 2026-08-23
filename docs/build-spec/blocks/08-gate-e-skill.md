# 8 — `SKILL.md` e o gate

> **Autoridade.** `docs/00-contratos.md` §9 (as 88 regras permanentes e o orçamento de linhas) e §11
> (as 43 invariantes + as dívidas declaradas). Contrato do artefato: `docs/build-spec/20-skill-md.md`.
> Contrato do gate: `docs/build-spec/80-gate.md`. Implementação: `tests/gate-build.sh`,
> `tests/validate.sh`, `tests/gate-lint.sh`, `tests/smoke.sh`, `tests/lib/assert.sh`.
>
> Onde este bloco divergir de `docs/00-contratos.md`, o contrato vence e este bloco é o errado.
> O gate é a **tradução mecânica** daquele documento: quando um muda, o outro muda junto.

## Sumário

1. O `SKILL.md`: frontmatter com **só os campos portáveis**, `description` como único insumo de roteamento (§8.1–§8.3).
2. ⭐ A ordem interna do corpo, e o motivo mecânico dela: o que sobrevive a uma compactação são os primeiros tokens (§8.4).
3. Progressive disclosure de **um nível só**, as 88 regras permanentes e o orçamento de linhas (§8.5–§8.8).
4. ⭐ O gate: quatro scripts, o que cada um verifica, e o mapa completo das invariantes (§8.9–§8.11).
5. ⭐ O teste de integração ponta a ponta, e por que ele é o **critério de saída** (§8.12).
6. ⭐ As limitações declaradas — o gate as imprime na própria saída — e como rodar tudo do zero (§8.13–§8.15).

**Convenção:** `SK/` = `skills/study-method/`. ⏳ marca o que envelhece. ⭐ marca o que não se
reinventa sem errar.

---

## 8.1 O artefato `SKILL.md`

| Item | Valor |
|---|---|
| Caminho no repositório | `skills/study-method/SKILL.md` |
| Caminho instalado | `~/.claude/skills/study-method/SKILL.md` (pessoal) ou `<projeto>/.claude/skills/study-method/SKILL.md` |
| Formato | frontmatter YAML delimitado por `---` + corpo Markdown |
| Papel | **roteador**: nomeia os passos, aponta a `references/` de cada passo, e carrega as regras que valem em **todo turno** |
| Não é | manual, tutorial, catálogo de schemas, ou cópia de `references/` |
| Consumidor | o harness — **nível 1** = frontmatter, sempre carregado; **nível 2** = corpo, carregado ao disparar |

### 8.1.1 ⭐ As duas premissas que determinam tudo o mais

| # | Premissa | Consequência |
|---|---|---|
| P-1 | O campo **`description` é o único insumo de roteamento** | Toda a decisão de "esta skill se aplica?" acontece no frontmatter. Nada no corpo influencia o disparo |
| P-2 | **O corpo não é relido a cada turno** | O que não estiver nele **pode não estar valendo no turno em que importa**. É a razão de as 88 regras permanentes viverem no corpo, e não numa `reference/` |

P-2 é o argumento inteiro para o orçamento de linhas do §8.7: cada regra permanente cabe em **uma
linha** justamente porque todas precisam caber no corpo. Uma regra rebaixada para `reference/` só
vale se o modelo tiver aberto aquela referência naquele turno — e regra permanente, por definição,
vale mesmo nos turnos em que ninguém abriu nada.

---

## 8.2 Frontmatter — apenas os campos portáveis

Somente os **6 campos portáveis** do padrão aberto são permitidos. Os ~14 campos extras do Claude
Code (`when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`,
`disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`)
**não portam** e são erro rígido fora do Claude Code — **nenhum deles pode aparecer**.

| Campo | Estado neste artefato | Regra |
|---|---|---|
| `name` | **presente**, valor `study-method` | 1–64 chars, `^[a-z0-9-]+$`, sem hífen líder/final, sem `--`, **igual ao nome do diretório pai** |
| `description` | **presente** | 1–1024 chars, não vazia, terceira pessoa, diz **o quê + quando** (§8.3) |
| `license` | **ausente** | omitido: não há arquivo de licença no repositório e o campo não pode afirmar o que não existe |
| `compatibility` | **ausente** | omitido: a skill não exige ambiente além de bash 4+, coreutils, `jq` e `python3` da stdlib, já declarados no corpo e nas `references/` |
| `metadata` | **ausente** | omitido **por decisão de risco**: é um mapa aninhado, e frontmatter malformado faz a skill carregar com metadata vazia **em silêncio** — a `description` some da triagem e a skill **nunca dispara** |
| `allowed-tools` | **ausente** | omitido: marcado experimental, suporte varia, e a concessão vale só no turno da invocação |

**Resultado normativo:** o frontmatter tem **exatamente duas chaves**, `name` e `description`,
**nenhuma linha indentada, nenhum aninhamento YAML**.

---

## 8.3 O contrato da `description` — o único campo de roteamento

| Requisito | Verificação |
|---|---|
| ≤ 1024 caracteres | contagem de caracteres da linha após `description:` |
| Terceira pessoa | não contém `I can`, `You can`, `Eu posso`, `Você pode usar` |
| Diz **o quê** | a primeira oração descreve a função: tutor de estudo **com memória entre sessões**, que ensina programação **e a matemática que aparece nela** por **código executável**, com desafios validados por teste |
| Diz **quando** | a segunda parte enumera gatilhos em **pt-BR e en**, nas palavras que o usuário realmente diria |
| Gatilhos obrigatórios | `estudar` · `aprender` · `me ensina` · `tutor` · `aula` · `exercício` · `desafio` · `teach me` · `study session` · `challenge` |
| Diz **quando NÃO** | frase final que exclui trabalho normal de programação: escrever/depurar/revisar código de produção, dúvida pontual de sintaxe, explicar trecho sem estudo continuado |
| Caso de uso principal primeiro | a listagem trunca em 1536 chars e o orçamento global é ~1% da janela — **o que importa vem antes** |

⭐ **A cláusula de exclusão é obrigatória.** Sem ela a skill dispara em qualquer conversa sobre
programação, e **uma skill que dispara sempre é indistinguível de uma que nunca dispara**.

⏳ Estado medido: `description` com **907** caracteres.

---

## 8.4 ⭐ A estrutura do corpo — ordem normativa, com o motivo

| # | Seção | Conteúdo obrigatório |
|---|---|---|
| 1 | `# study-method — o tutor` + uma linha | declara que o arquivo é **roteador** e que o detalhe vive nas `references/`, lidas sob demanda |
| 2 | `## Quem você é` | tutor de bate-papo em pt-BR; ensina programação **e a matemática que aparece nela**, aprendida **através de código executável**; analogia do repertório do aluno; objeto rodando; verificação por desafio; turno curto, uma pergunta por vez, silêncio depois de perguntar; regra de idioma (identificador em inglês, prosa em pt-BR; chave/enum/id/slug em inglês ASCII sem acento) |
| 3 | `## A máquina de estados — 9 passos, dois deles CONDICIONAIS` | os 9 nomes literais; a linha do fluxo normal **sem** os condicionais; o aviso de que ler os nove como fila é o erro mais caro; a tabela dos dois ramos com a guarda na mesma linha |
| 4 | `## Roteamento — o que ler em cada passo` | tabela `passo → reference → scripts`; a frase de que `references/seguranca.md` também se lê **fora** de passo |
| 5 | `## Regras permanentes` | as **88** regras, uma linha cada, agrupadas (§8.6) |
| 6 | `## Os scripts` | convenção de invocação + tabela dos 16 executáveis + bloco de exit codes |
| 7 | `## REQUEST/APPLY — exit 10 é pedido de julgamento, não erro` | o protocolo em 3 passos + as regras duras + os 4 usuários |

### 8.4.1 O motivo mecânico da ordem

**A seção 5 (regras permanentes) vem antes das seções 6 e 7, e não depois.**

Em auto-compaction o harness reanexa a invocação mais recente da skill mantendo os **primeiros
~5.000 tokens**. **O que está no fim do corpo é o que se perde.** Portanto:

- um corte remove **tabela de comando** (recuperável: o modelo pode reler a `reference/`, ou pedir
  `--help`, ou errar a flag e receber exit `2`);
- um corte **nunca** pode remover **regra crítica** (irrecuperável: uma regra `†` que sumiu não
  produz erro visível, produz um comportamento errado que ninguém detecta no turno).

Pela mesma razão, **dentro** da seção 5 os grupos `SEG` e `MEM · PRIV` — que concentram as **11**
regras `†` — vêm **antes** dos demais.

A tabela de comando é dado recuperável; a regra de segurança é a única coisa que não é. A ordem
inteira do corpo deriva dessa assimetria.

### 8.4.2 Os dois passos condicionais — forma obrigatória

`setup_interview` e `load_docs` aparecem como **ramo em tabela**, nunca como item numerado de uma
lista linear. **Cada linha carrega a guarda e o comportamento quando a guarda é falsa.**

| Ramo | Guarda (roda **somente** se) | Guarda falsa |
|---|---|---|
| `setup_interview`, ramo de `bootstrap` | não há `setup.json` em `$PWD` nem em ancestral até `$HOME` **inclusive**, **e** não há entrada `active` utilizável no registry, **e** não veio caminho válido na invocação | pula direto para `load_memory`; numa retomada normal **nunca** roda e a pergunta "quer criar um setup?" **não** é feita |
| `load_docs`, ramo entre `load_memory` e `open_session` | existe `<setup_root>/docs/` com ≥1 arquivo ingerível, **e** (`memory/docs-index.json` ausente **ou** algum arquivo mudou de tamanho/mtime) | pula para `open_session`; pasta vazia grava `docs_coverage: "none"` e **não é erro**; cache válido reusa o índice |

A linha de fluxo normal impressa no corpo é, **literalmente**, sem os condicionais:

`bootstrap` → `load_memory` → `open_session` → `plan_lesson` → `teach` ⇄ `challenge` → `close_session`

---

## 8.5 ⭐ Progressive disclosure — um nível só

As `references/` custam **zero token até serem abertas**. O grafo é de **um nível**: o `SKILL.md`
linka as 8 referências **direto**, e **nenhuma referência linka outra**.

> **Referência aninhada causa leitura parcial.** Se `SKILL.md` → `a.md` → `b.md`, o modelo abre
> `a.md` no passo, age com o que leu, e `b.md` — que continha a metade que faltava — só é aberta se
> houver um segundo turno em que alguém se lembre dela. O contrato quebra sem erro visível.

Verificação: invariante **I-34** (grafo de links, um nível) e a invariante local "as 8 referências
citadas são exatamente as 8 existentes em `SK/references/` — nenhuma citada que não exista, nenhuma
existente que não seja citada".

Além disso, **I-35**: nenhuma `reference/` com mais de 100 linhas começa sem `## Sumário`.

### 8.5.1 A tabela de roteamento (conteúdo normativo)

| Passo | Reference a abrir antes de agir | Scripts do passo |
|---|---|---|
| `bootstrap` | `references/bootstrap.md` (+ `scripts.md`, `troubleshooting.md`) | `setup-list.sh --resolve "$PWD"`; `detect-toolchains.sh --cached` se `language.detected_at` > 30 d |
| `setup_interview` ⚠ CONDICIONAL | `references/bootstrap.md` | `setup-init.sh` → `readme-sync.sh --init`; `decisions-ask.sh setup-init` |
| `load_memory` | `references/bootstrap.md` | `memory-index.sh --verify` → `memory-digest.sh` |
| `load_docs` ⚠ CONDICIONAL | `references/docs-ingest.md` | `docs-index.sh` |
| `open_session` | `references/bootstrap.md` | `session-new.sh` |
| `plan_lesson` | `references/pedagogia.md` | `progress-update.sh --due` |
| `teach` | `references/pedagogia.md` · `analogy-bank.md` · `visualizacao.md` · `languages.md` · `researchs.md` | `research-new.sh`, `render-plot.py`, `setup-list.sh --find` |
| `challenge` | `references/challenge-protocol.md` · `languages.md` | `challenge-new.sh` → `challenge-verify.sh` |
| `close_session` | `references/seguranca.md` | `session-close.sh` → `memory-index.sh` → `progress-update.sh` → `readme-sync.sh` → `memory-compact.sh --if-due` |

**Fora de passo:** `references/seguranca.md` se lê **antes** de carregar qualquer material do aluno e
**antes** de executar qualquer coisa.

---

## 8.6 ⭐ As regras permanentes — 88, em 8 grupos, 11 intocáveis

Fonte literal: `docs/00-contratos.md` §9.1–§9.7. **88 regras, uma linha cada**, com o ID original
preservado em negrito no início da linha (`- **C-1** …`) **porque as evals referenciam os IDs**.

| Ordem no corpo | Grupo | IDs | Qtd |
|---|---|---|---|
| 1 | `### SEG — Segurança e execução` | `SEG-1`…`SEG-8` | 8 |
| 2 | `### MEM · PRIV — Memória e privacidade` | `MEM-1`…`MEM-7`, `PRIV-1`…`PRIV-7` | 14 |
| 3 | `### C — Como conversar` | `C-1`…`C-13` | 13 |
| 4 | `### AS — Anti-bajulação` | `AS-1`…`AS-12` | 12 |
| 5 | `### AN · ESC · ERR — Analogia, escada e resposta a erro` | `AN-1`…`AN-7`, `ESC-INICIAL`, `ESC-S`, `ESC-D`, `ESC-R`, `ERR-1`…`ERR-8` | 19 |
| 6 | `### DES — Desafios` | `DES-1`…`DES-9` | 9 |
| 7 | `### VIZ — Visualização` | `VIZ-1`…`VIZ-6` | 6 |
| 8 | `### BOOT — Bootstrap e arquivos` | `BOOT-1`…`BOOT-7` | 7 |
| | **Total** | | **88** |

O texto de cada regra dos grupos 3, 4, 5 e parte do 2 está transcrito no bloco 6 deste documento
(§6.2, §6.3, §6.4, §6.5, §6.6, §6.7, §6.10.6).

### 8.6.1 As 11 regras `†` — não rebaixáveis, em nenhuma hipótese

`PRIV-1` · `PRIV-2` · `PRIV-3` · `PRIV-4` · `SEG-1` · `SEG-2` · `SEG-3` · `SEG-4` · `SEG-5` ·
`SEG-6` · `SEG-8`.

São **críticas de segurança**. Ficam no corpo com o marcador `†` colado ao ID (`- **SEG-1 †** …`) e
**não podem** ser movidas para uma `reference/`, resumidas, fundidas com outra regra, ou colocadas
depois do grupo `BOOT`.

⚠ **`SEG-7` NÃO é `†`.** É a regra de leitura de exit code (`!= 0`, jamais `== 1`, e a desambiguação
do 137). É crítica de correção, não de segurança, e o marcador é literal: quem marcar `SEG-7` com `†`
faz a contagem de 11 virar 12 e quebra a verificação.

### 8.6.2 Redação das linhas de regra

Uma regra = **uma linha física**, imperativa, dirigida ao tutor, **sem justificativa e sem exemplo**.
Terminologia obrigatória: `docs/` **do setup** × `docs/` **do repositório** nunca na forma nua;
`setup.json` = manifesto do **setup**, `meta.json` = manifesto do **desafio**; `<setup_root>` em
prosa. **Regra permanente nunca é escrita como "passo N"** — ela vale em todo turno; passo é outra
coisa.

---

## 8.7 O orçamento de linhas

Teto de trabalho do corpo (fora do frontmatter): **~200 linhas**. Limite recomendado do padrão:
< 500 linhas / < 5.000 tokens. Contagem: linhas do arquivo **menos** as 4 do frontmatter, ignorando
brancos finais.

| Item | Linhas |
|---|---|
| 88 regras permanentes, uma por linha | 88 |
| 8 cabeçalhos de grupo + 1 branco antes de cada | 16 |
| Máquina de estados + tabela de roteamento | ~35 |
| Identidade, scripts, REQUEST/APPLY, títulos e brancos | ~55 |
| ⏳ **Total medido** | **194** — folga **6** |

**Ordem de corte, se apertar:** (1) `### VIZ` (6 regras) → `references/visualizacao.md`;
(2) `### AN · ESC · ERR` (19 regras) → `references/pedagogia.md`; (3) **nunca** `SEG`, **nunca**
`MEM · PRIV`, **nunca** nenhuma das 11 `†`. **Cortar prosa vem antes de cortar regra**: juntar
parágrafos quebrados em linhas físicas únicas reduz a contagem sem perder conteúdo, e foi o mecanismo
usado para caber.

**Nota honesta sobre tokens.** ⏳ O corpo mede ~21.500 caracteres, entre **6.000 e 6.500 tokens** —
**acima** do limite *recomendado* de 5.000. O teto **normativo** deste projeto é o de **linhas**
(invariante **I-33**): as 88 regras sozinhas custam ~4.200 tokens e foram orçadas assim de propósito.
A mitigação implementada é **de ordem, não de corte** (§8.4.1).

**Declaração de contagem, preservada de propósito:** um revisor contou **71** regras distintas em 164
linhas; a consolidação fecha em **88** — 17 a mais. A diferença **não é inflação**: são as 6 regras de
visualização e as 11 de `AN-*`/`ESC-*`/`ERR-*` que a contagem original não separou por ter tratado o
bloco pedagógico como um item só. Cada uma tem ID estável, é verificável por eval, e proíbe ou obriga
algo que nenhuma outra cobre — **fundi-las custaria testabilidade**.

---

## 8.8 Antipadrões proibidos neste artefato

| Antipadrão | Regra |
|---|---|
| Referência aninhada (`SKILL.md` → `a.md` → `b.md`) | grafo de **um nível**; nenhuma `reference/` cita outra |
| `description` vaga ou em 1ª/2ª pessoa | terceira pessoa, o quê + quando, com as palavras do usuário |
| `description` sem cláusula de exclusão | dispara em qualquer conversa sobre programação |
| Regra permanente escrita como "passo N" | ela vale em **todo** turno; passo é outra coisa |
| Os 9 passos como lista numerada contínua | os dois condicionais são **ramo**, com a guarda na mesma linha |
| Campo de frontmatter fora dos 6 portáveis | erro rígido fora do Claude Code |
| Detalhe operacional no corpo | vai para `references/`, que custa zero até ser aberta |
| Citar script que não existe na tabela canônica | **inclusive numa frase de negação** — `I-05` é um grep que precisa sair vazio. A frase correta é positiva: "são 19 arquivos ao todo; não invente script fora desta tabela" |
| Path estilo Windows | sempre `/` |

---

## 8.9 ⭐ O gate — quatro scripts

| Script | Pergunta que responde | Depende de |
|---|---|---|
| `tests/gate-build.sh` | O que está no disco é **sintaticamente válido** e tem a forma exigida? | `bash`, `python3`, `stat` |
| `tests/validate.sh` | O repositório **obedece aos contratos** (as 43 invariantes)? | `bash`, `python3`, `jq` |
| `tests/gate-lint.sh` | O texto e os arquivos têm **qualidade de leitura**? | `bash`, `python3`, `awk` |
| `tests/smoke.sh` | O fluxo **ponta a ponta** funciona de verdade? | os 12 executáveis do fluxo |

`tests/lib/assert.sh` é **biblioteca**: apenas `source`, modo `0644`, sem shebang, sem bloco `main` —
a mesma disciplina de LIB-1 aplicada ao gate. Os quatro executáveis são `0755`, abrem com
`#!/usr/bin/env bash` e `set -euo pipefail`.

### 8.9.1 Exit codes e os cinco estados de um check

| Código | Significado |
|---|---|
| `0` | Verde: nenhuma falha e nenhuma pendência |
| `1` | Vermelho: há violação de contrato **ou** artefato ainda inexistente |
| `2` | Uso incorreto (argumento desconhecido) |
| `3` | Só `smoke.sh`: **pré-requisito ausente** — o fluxo não pôde nem começar |

| Estado | Símbolo | Significado | Conta como vermelho? |
|---|---|---|---|
| PASS | `✔` | Passou | não |
| FAIL | `✘` | **Violação de contrato**: o repositório regrediu | **sim** |
| PEND | `◌` | O artefato verificado **ainda não existe** no disco | **sim** |
| SKIP | `–` | Não aplicável neste ambiente (ferramenta opcional ausente) | não |
| WARN | `!` | Divergência que não reprova (ex.: contradição entre dois documentos-fonte) | não |

⭐ **A distinção FAIL × PEND não afrouxa nada.** "Escrito errado" e "ainda não escrito" pedem ações
diferentes; **os dois deixam o gate vermelho**, só a mensagem muda. Reclassificar um check para PEND
mantém o bloqueio; o que muda é que a mensagem passa a **nomear o artefato que falta e o dono dele**,
em vez de acusar como regressão algo que ninguém escreveu ainda.

### 8.9.2 `tests/gate-build.sh` — sintaxe e forma

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
| `B-10` | Todo `*.sh.tmpl` parseia como bash **depois de substituir os placeholders** |
| `B-11` | `shellcheck -S error`, **se existir** nesta máquina — bônus opcional, **nunca dependência** |

### 8.9.3 `tests/validate.sh` — os contratos

Implementa as invariantes `I-01`…`I-43`, mais as verificações estruturais `G-01`…`G-13` que o
contrato exige sem terem sido numeradas.

| Bloco | IDs | O que cobre |
|---|---|---|
| **A — nomes e termos** | `I-01`, `I-01b`, `I-02`, `I-03`, `I-04`, `I-05`, `I-15b` | Os 9 nomes de passo literais no `SKILL.md`; as guardas dos dois passos condicionais; ausência de **todo** nome e campo revogado |
| **B — inventário** | `I-06a`, `I-06b`, `I-06c` | A tabela canônica declara **19** scripts; os 19 existem; nenhum script **sem prefixo `_`** fora da lista |
| **C — schemas** | `I-07`…`I-17`, `G-01`, `G-02`, `G-03`, `G-03b`, `G-11`, `G-13` | `$id` no namespace único e sem repetição; nenhuma construção proibida; cobertura do metaschema mínimo; `description` em toda propriedade; **assinatura única por vocabulário**; enums literais de sessão, fato, linguagem e leitura cruzada; patterns de identidade, conceito, slug e timestamp |
| **D — scripts** | `I-18`…`I-27` | Exit codes só `0 1 2 3 4 5 10`; `pipefail` presente; falha lida como `!= 0`; só os quatro scripts do protocolo aceitam `--apply` e saem com 10; `LIB-1`; as **26** funções de `lib/`; escrita confinada; **zero rede**; derivados por escrita atômica |
| **E — runtime** | `I-28`…`I-32` | O digest sai `0` nos **quatro** cenários de borda, mantém a ordem fixa de chaves (`I-29a`) e tem exatamente **18** chaves de topo, na tabela (`I-29b`) e no JSON produzido (`I-29c`); `readme-sync.sh` e `setup-init.sh` **idempotentes** |
| **F — `SKILL.md`** | `I-33`, `I-34`, `I-35`, `G-04`…`G-07` | Corpo com ≤200 linhas e os **88** IDs de regra, incluindo as **11** marcadas `†`; grafo de references de **um nível**; sumário nas references longas; frontmatter só com os campos portáveis; `name` igual ao nome do diretório; `description` ≤1024 caracteres |
| **G — templates** | `I-36`…`I-41`, `G-08`, `G-09` | Proveniência por **bloco de comentário e nunca por frontmatter**; caminho relativo dentro do setup; campos de sandbox no manifesto do desafio; `exit 66` e tratamento de 137 no executor gerado; a linha `memory/` no arquivo de exclusão do git; as **8** seções de marcador; todo placeholder declarado no `MANIFEST.tsv` e nenhum sobrando fora de template |
| **H — conteúdo** | `I-42`, `I-43` | Nenhuma promessa de cobertura exaustiva de cenários de erro; **nenhuma das afirmações derrubadas pela auditoria** (bloco 6, §6.8) |
| **I — terminologia** | `G-10` | O termo do diretório de documentação **sempre qualificado** ("do repositório" ou "do setup") |
| **J — decisões** | `G-12a`…`G-12d` | O id de cada decisão no pattern; todo `writes_to` resolvível no manifesto do setup; a camada humana e o marcador de BUILD_SPEC, **ambos PEND** enquanto o artefato-alvo não existir |

⏳ **Pendências reais hoje:** `I-06b` (o `decisions-ask.sh` declarado no contrato ainda não existe em
disco), `G-12c` (`docs/08-decisoes-abertas.md` é derivado de outra onda) e `G-12d` (nenhum fragmento
recebeu marcador `PERGUNTE AO USUÁRIO (D-…)` ainda). `G-12d` **vira FAIL assim que o primeiro
marcador aparecer**: aí a passada começou, e o que falta passa a ser omissão.

⭐ `G-12d` cobra marcador **só** de quem o contrato manda marcar — `audience ∈ {builder, both}`
**e** `status == open`, **48 das 114** entradas do catálogo. As `student` viram pergunta em
runtime e as arbitradas viram uma linha de citação; exigir marcador delas seria exigir o que o
próprio contrato dispensa. As **66** restantes ficam sob `EXCLUSÕES DE ESCOPO DECLARADAS`.

#### Escopo de busca de texto — declarado, nunca implícito

Os checks de termo (`I-01b`, `I-03`, `I-04`, `I-05`, `I-15b`, `I-42`, `I-43`, `G-09`, `G-10`) varrem
`docs/`, `skills/`, `examples/`, `evals/` e o `README.md` do repositório. **Ficam fora do escopo, de
propósito:**

| Fora do escopo | De quais checks | Por quê |
|---|---|---|
| `docs/00-contratos.md` | todos | É a autoridade: cita os termos revogados nas próprias invariantes |
| `docs/research/**` | todos | Registro histórico auditado, escrito antes das arbitragens |
| `tests/**` | todos | O gate precisa **conter** os termos que procura |
| `SK/assets/decisions.json` | `I-01b`, `I-03`, `I-04`, `I-05`, `I-15b` | Cada entrada do catálogo **nomeia a opção recusada**. Documentar a alternativa que perdeu é o contrato do arquivo |
| `docs/build-spec/**` | `G-09`, `L-03` | Os fragmentos **documentam** a sintaxe de placeholder. Falar do buraco não é deixar buraco. `G-10` continua valendo aqui |
| `*.tmpl` e `MANIFEST.tsv` | `G-09`, `L-03` | O template é o **dono** do placeholder; o manifesto o declara |
| valor `{{…}}` | `I-17` | `"challenge_id": "{{CHALLENGE_ID}}"` é o **buraco** do id, não um id. A exclusão é do **valor**, não do arquivo |
| `SK/scripts/**/_*` | `I-06c` | O prefixo `_` **é** a marca de "não é um dos 19". Script sem o prefixo e fora da tabela continua sendo FAIL |
| alvo temporário de `>` | `I-27` | O teste é sobre o **alvo**: um temporário na origem não protege ninguém |
| sufixo abaixo de objeto extensível | `G-12b` | `setup.json → decisions` é `additionalProperties: true` sem `properties`. Caminho que morre em objeto **fechado** continua sendo FAIL |
| comentário, here-document e string multilinha de shell | `I-19`, `I-23`, `I-26`, `I-27`, `G-09`, `L-03` | §8.11 |

**A lista acima é a mesma que o gate imprime em `EXCLUSÕES DE ESCOPO DECLARADAS` no fim da execução.
Se as duas divergirem, quem está errado é o documento.**

#### A regra do contexto revogatório

Um documento que **diz** que um termo morreu **não está usando** o termo. `validate.sh` aceita a
linha cujo texto — **ou o da linha anterior ou seguinte** — casa um marcador de revogação
(`não existe`, `removido`, `revogado`, `descartado`, `em vez de`, `versão anterior`, `nunca`,
`proibido`, entre outros; a lista literal está na variável `REVOKE_MARKERS` de `tests/validate.sh`).

A janela de **três linhas** existe porque a revogação costuma quebrar de linha: o termo fica numa
linha e o "estão **descartados**" na seguinte.

**Consequência prática: para o gate acusar, basta usar o termo sem dizer que ele morreu.**

#### Assinatura única de vocabulário (`G-03`)

Um mesmo nome de campo **não pode ter dois contratos diferentes** em schemas diferentes.

| Camada | Chaves comparadas | Divergência resulta em |
|---|---|---|
| **Dura** (`G-03`) | `pattern`, `enum` (descontando `null`), `minimum`, `maximum` | **FAIL** |
| **Acessória** (`G-03b`) | `type`, `minLength`, `maxLength` | **WARN** |

A nulidade é acessória porque o mesmo vocabulário aparece anulável num ponto opcional e não anulável
num obrigatório — e isso **não é divergência**.

#### Duas assimetrias arbitradas, que o gate imprime a cada execução

| Invariante | O contrato antigo dizia | O que o gate checa | Por quê |
|---|---|---|---|
| `I-29` | 19 chaves de topo no digest | **18** | `procedural_playbook` é **uma** chave; `do` e `avoid` vivem **aninhados** dentro dela e nunca aparecem no topo. Quem contou 19 contou um aninhado. **Esperar 19 reprova um digest correto** |
| `I-14` | 19 valores de `language` nos três schemas | **20** em `setup-manifest` e `registry`, **19** em `challenge-manifest` | `none` existe onde se descreve um **setup** — que pode legitimamente não ter código. Um **desafio** em linguagem nenhuma não existe. A assimetria é **deliberada**, e igualar os três **reprovaria schema correto** |

⏳ `docs/00-contratos.md` §4.1 e §11 ainda carregam os números antigos: é o texto do contrato que
precisa da correção. **O gate imprime uma nota em cada execução dizendo isso** — divergência
conhecida, não divergência escondida.

### 8.9.4 `tests/gate-lint.sh` — qualidade

| ID | Verifica |
|---|---|
| `L-01` | Frontmatter YAML lido por `awk` — **não há PyYAML nesta máquina**: forma `chave: valor`, sem tabulação, sem chave repetida, delimitador fechado |
| `L-02` | Link relativo quebrado em `.md` (ignora URL, âncora, bloco cercado e trecho em code span) |
| `L-03` | Abertura de placeholder sem fechamento na mesma linha, e placeholder **fora de `*.tmpl`**. Fora do escopo, declarado: `docs/build-spec/**`, comentário e here-document de script, e o literal de busca `'{{'` do guarda final de cada renderizador — que é o código que **implementa esta mesma regra** |
| `L-04` | Arquivo de texto sem newline final |
| `L-05` | Tabela markdown malformada: sem linha separadora, ou linhas com número de colunas diferente do cabeçalho |
| `L-06` | Espaço em branco no fim da linha — **aviso**, não reprova |

---

## 8.10 O verificador mínimo de JSON Schema

`gate_schema_validator` materializa, em `$GATE_TMPDIR/jsonschema_min.py`, um verificador escrito **só
com a stdlib do Python** — não há `jsonschema` nesta máquina e o PEP 668 impede instalar. O mesmo
verificador vive em `SK/scripts/lib/_jsonschema_min.py` para uso em runtime por `sm_json_validate`.

```
jsonschema_min.py <instancia.json> <schema.json>   # 0 válido · 5 inválido · 2 uso · 1 I/O
jsonschema_min.py --lint-schema <schema.json>      # só confere a cobertura
```

Erros saem em **stderr**, uma linha por erro, no formato `<json-pointer>: <motivo>`.

**Cobre:** `type` (string **ou array de strings**, ex. `["string","null"]`), `required`, `enum`,
`const`, `pattern`, `properties`, `items`, `additionalProperties` (`false`, `true` ou subschema),
`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `minLength`, `maxLength`, `minItems`,
`maxItems`, `uniqueItems`.

**Não cobre — e RECUSA o schema que use:** `$ref`, `allOf`, `anyOf`, `oneOf`, `not`,
`if`/`then`/`else`, `$defs`, `definitions`, `patternProperties`, `propertyNames`, `dependentSchemas`,
`dependentRequired`, `contains`, `unevaluatedProperties`, `items` como array (validação por tupla).
`format` é aceito como palavra-chave e **nunca validado**.

⭐ **Recusar em vez de ignorar é a decisão que importa:** um schema com `$ref` **não passa
despercebido**. É por isso que a invariante **I-08** proíbe essas construções nos schemas do projeto:
o verificador e o contrato dizem a mesma coisa por dois caminhos.

---

## 8.11 Escopo léxico de shell — usar um construto × falar dele

Cinco checks (`I-19`, `I-23`, `I-26`, `I-27`, `G-09`, e o `L-03` do lint) liam o fonte shell linha a
linha. **Um grep de linha não distingue quatro coisas que precisam ser distinguidas:**

| Forma | Exemplo real | O que é |
|---|---|---|
| Comentário | `# Substitui {{PLACEHOLDER}} pelo valor do mapa` | Documentação do renderizador |
| Corpo de here-document | o `<<'TMPL'` de `session-new.sh` e `research-new.sh` | O **template embutido**, usado quando o `*.tmpl` falta |
| String multilinha | um programa `jq` entre aspas simples que atravessa 12 linhas | **Dado**, não código |
| Linha de código | `exit 10` dentro de `sm_request` | Execução — e aqui **o escopo importa**: essa linha está dentro da única função autorizada a produzir 10 |

`gate_shell_scope_tool` (em `tests/lib/assert.sh`) materializa um **classificador léxico** que
percorre o fonte carregando estado de aspas **entre linhas**, reconhece here-document (com e sem
aspas no delimitador, com e sem `<<-`, sem confundir com a here-string `<<<`), e mantém a **pilha de
funções** por profundidade de chaves. Emite TSV:

```
rel <TAB> nº <TAB> kind <TAB> pilha-de-funções <TAB> profundidade <TAB> código
        kind ∈ code · comment · heredoc · string · blank · EOF
```

O que cada check passou a perguntar:

| Check | Pergunta |
|---|---|
| `I-23` | há `exit 10`/`return 10` numa linha de **código** cuja pilha de funções **não** contém `sm_request`? |
| `I-19` | há, no **nível de topo** (fora de toda função, fora de here-document), definição ou chamada de `main`, `"$@"` como **comando**, ou guarda de auto-execução? |
| `I-26` | há `curl`/`wget`/`nc`/`ncat`/`ssh`/`scp`/`sftp`/`rsync`/`telnet` **como palavra**, `/dev/tcp` ou `ftp://` numa linha de código? ⭐ **A fronteira de palavra é o que separa o comando `nc` do `nc` que vive dentro de `func `, `sync ` e `Async `** |
| `I-27` | o **alvo** de um `>` é um derivado no destino final (não um temporário) numa linha de código? |
| `G-09` / `L-03` | sobrou `{{…}}` numa linha de código de artefato materializado? |

⭐ **Não é um parser de shell, e o gate diz isso.** O classificador **se autoverifica** pela
profundidade de chaves: arquivo cuja profundidade não fecha em zero vira `WARN SCOPE`, e nele os
checks **caem para a leitura crua** — preferindo falso positivo a buraco de cobertura.

---

## 8.12 ⭐ `tests/smoke.sh` — o critério de saída

**É este script que decide se a implementação está pronta ou se precisa de mais uma rodada.** Os
outros três provam que o repositório está **bem escrito**; só o smoke prova que ele **funciona**.

Roda num diretório temporário, com `STUDY_METHOD_HOME` próprio e `STUDY_METHOD_TODAY` fixo. **Nada
toca o `$HOME` real e nada depende do relógio.**

| Passo | O que faz | Checks |
|---|---|---|
| `0` | Confere os **12 executáveis** do fluxo. Faltando algum, **sai com 3** nomeando cada ausente | `S-00` |
| `1` | Cria um setup do zero e sincroniza o `README.md` do setup | `S-01a`…`S-01g` |
| `2` | Abre e fecha **3 sessões**, exercitando o ciclo REQUEST/APPLY do fechamento | `S-02a`…`S-02g` |
| `3` | Gera **1 desafio Python** e o valida pelo protocolo completo, incluindo a classificação de sobreviventes | `S-03a`…`S-03f` |
| `4` | Renderiza **1 gráfico** e confere as quatro saídas obrigatórias e o HTML autocontido | `S-04a`…`S-04e` |
| `5` | Roda a sincronização do `README.md` do setup **duas vezes** e prova **idempotência byte a byte** | `S-05a`…`S-05c` |
| `6` | Valida **todo JSON produzido** contra o schema dono, e confere que **nada de placeholder** e **nenhum caminho absoluto** sobrou | `S-06a`…`S-06j` |

### 8.12.1 Por que ele é o critério de saída

| Razão | Detalhe |
|---|---|
| **Exercita a costura, não as peças** | `validate.sh` confere que `sm_atomic_write` é chamado; o smoke confere que o `INDEX.json` que sai do outro lado **valida contra o schema dono** |
| **Fecha o ciclo REQUEST/APPLY sem modelo** | O modelo **não está no laço**: quando um script sai com 10, o smoke lê o pedido, **sintetiza a resposta mecanicamente a partir do `response_schema` declarado**, e re-invoca com `--apply`. É o que o contrato promete — "o gate roda os 19 scripts com respostas fixas". No máximo **dois** ciclos por invocação; um terceiro é falha |
| **Pega o que a análise estática não pega** | ⭐ O requisito das marcas `SM_CORPO_INICIO`/`SM_CORPO_FIM` (bloco 7, §7.12) **não estava documentado em lugar nenhum** e só apareceu quando o passo 3 rodou de verdade. Nenhum grep encontraria isso |
| **Prova idempotência de fato** | `I-30` e `I-32` só são verificáveis executando duas vezes e comparando bytes |
| **Falha barata e cedo** | O passo 0 sai com **3** (não 1) quando falta executável: distingue "o fluxo quebrou" de "o fluxo nem pôde começar" |

**O que ele NÃO prova, e declara:** o smoke prova **o caminho**, não a qualidade do julgamento que o
modelo daria. Nenhuma execução do gate mede pedagogia.

---

## 8.13 ⭐ Limitações declaradas

**Limitação escondida é pior que limitação conhecida.** Cada script **imprime as suas no resumo da
própria execução** — não é uma nota de rodapé de documentação, é saída do programa.

| Script | Limitação |
|---|---|
| `gate-build.sh` | **Não verifica semântica nenhuma**: contratos, vocabulários e invariantes são de `validate.sh` |
| `gate-build.sh` | ⏳ **Sem `shellcheck` nesta máquina**, a análise estática de shell fica em `bash -n`: **sintaxe, não uso** |
| `validate.sh` | O verificador de schema é **parcial por design** (§8.10) |
| `validate.sh` | `I-24`, `I-25`, `I-26` e `I-27` são **análise estática de texto**: acusam o padrão declarado no fonte, **não provam ausência em todo caminho de execução** |
| `validate.sh` | A busca por termo revogado **tolera o contexto revogatório** e **ignora os caminhos declarados** (§8.9.3) |
| `validate.sh` | `I-19`, `I-23`, `I-26`, `I-27` e `G-09` leem o fonte shell por **classificador léxico, não por parser de shell completo**. Ele se autoverifica e **reporta o arquivo que não entendeu** |
| `validate.sh` | `G-09` **não vê o que um here-document produz em runtime**; quem cobre o material realmente renderizado é o smoke (`S-06`) |
| `validate.sh` | **`format` de JSON Schema nunca é validado**: o contrato usa `pattern`, e um schema que dependesse de `format` passaria aqui sem checagem real |
| `gate-lint.sh` | O frontmatter é lido por **`awk`**: cobre a **forma**, não a semântica YAML completa |
| `gate-lint.sh` | `L-02` resolve **só link relativo de arquivo**; URL e âncora não são verificadas |
| `gate-lint.sh` | `L-03` tem as mesmas exclusões de `G-09` |
| `smoke.sh` | Prova **o caminho**, não a qualidade do julgamento que o modelo daria |
| `smoke.sh` | A validação de JSON usa o verificador mínimo — cobertura parcial por design |

### 8.13.1 Exclusão de escopo é declarada, nunca implícita

Todo check que deixa um caminho, um nome de arquivo ou uma forma sintática de fora chama
`gate_scope_excl` dizendo **quais ids** afeta, **o que** some do escopo e **por quê** — e o resumo
imprime a lista sob `EXCLUSÕES DE ESCOPO DECLARADAS`.

> **Um gate que se cala sobre o que não olha vale menos que um que diz onde não olha.**

### 8.13.2 Dívidas conhecidas — declaradas, não escondidas

Não são invariantes: são pontos onde a especificação e a medição **ainda não fecham**.

| # | Dívida | Estado |
|---|---|---|
| **DEB-1** | ⏳ **O orçamento de 6000 caracteres do digest não cabe o playbook procedimental cheio.** Com 5 antipadrões + 8 procedimentos — **ambos protegidos do truncamento** — só esse bloco já passa dos 6000, e a escada de truncamento **não converge**: os campos que sobrariam para cortar são justamente os protegidos. O digest sai com `budget_exceeded: true`, `truncated: true` e acima do orçamento — que é **exatamente o que a especificação manda** (`memory-digest.sh` **sempre** produz digest e **sempre** sai 0). O comportamento está correto; o **limite** é que está apertado | **Aberta.** Nada a consertar no script. **O gate não pode tratar `budget_exceeded: true` como falha**: é saída conforme |
| **DEB-2** | `compaction.deferred_at` **não é gravável**: `profile.schema.json` fecha `compaction` com `additionalProperties: false` | **Aberta** |
| **DEB-3** | O teto de **2 ciclos** de RA-6 **não é verificável sem estado persistido** — cada `--apply` é processo novo | **Aberta.** Nenhuma invariante o cobra |

---

## 8.14 Determinismo

O gate **não pode depender do relógio nem do `$HOME` de quem roda**.

| Mecanismo | Onde entra |
|---|---|
| `STUDY_METHOD_TODAY` | Honrado por `sm_today`; `validate.sh` e `smoke.sh` o exportam com valor fixo (⏳ default `2026-08-23`) |
| Carimbo do digest via flag | `generated_at` fixado; sem isso, o mesmo estado em disco produz bytes diferentes |
| `STUDY_METHOD_HOME` | O smoke aponta para dentro do diretório temporário: **o registry real nunca é tocado** |
| `gate_find_into` | Listagem **ordenada e NUL-separada**: mesma ordem de arquivos em toda execução, e **caminho com espaço funciona** |

Variáveis de ambiente reconhecidas pelo gate:

| Variável | Efeito |
|---|---|
| `GATE_ONLY` | Lista separada por vírgula de **prefixos de id**; só os checks que casam rodam. Ex.: `GATE_ONLY=I-08,I-3` |
| `GATE_ROOT` | Raiz do repositório a auditar. Default: o diretório que contém `tests/`. Serve para rodar o gate **sobre uma cópia** |
| `STUDY_METHOD_TODAY` | Data fixa (`AAAA-MM-DD`) usada pelas invariantes de runtime e pelo smoke |
| `NO_COLOR` | Desliga a coloração ANSI |
| `GATE_TMPDIR` | Diretório de trabalho temporário. Apagado no fim, **exceto** com `smoke.sh --keep` |

---

## 8.15 ⭐ Como rodar tudo, do zero, na ordem certa

A ordem **importa**: cada script pressupõe que o anterior passou, e rodar fora de ordem produz ruído
em vez de diagnóstico.

```
# 1. sintaxe e forma — nada adianta verificar contrato de arquivo que não parseia
tests/gate-build.sh

# 2. contratos — as 43 invariantes + as verificações estruturais G-*
tests/validate.sh

# 3. qualidade de texto — link quebrado, tabela malformada, placeholder vazado
tests/gate-lint.sh

# 4. integração ponta a ponta — O CRITÉRIO DE SAÍDA
tests/smoke.sh
```

Variações úteis:

```
tests/smoke.sh --keep                 # preserva o diretório de trabalho para inspeção
GATE_ONLY=I-29 tests/validate.sh      # só as invariantes cujo id começa com I-29
GATE_ROOT=/caminho/copia tests/validate.sh   # audita uma cópia do repositório
NO_COLOR=1 tests/gate-build.sh        # saída sem ANSI, para log
```

**Critério de aceitação, em uma frase:** os quatro saem `0`, e o resumo do smoke não traz nenhum
`FAIL` nem `PEND`. `WARN` e `SKIP` **não** reprovam — mas cada `WARN` deve ter dono, e cada `SKIP`
deve ter motivo impresso.

### 8.15.1 A API de `tests/lib/assert.sh`

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
| `assert_file` | `<id> <caminho> <desc>` | Arquivo existe (senão **PEND**) |
| `assert_dir` | `<id> <caminho> <desc>` | Diretório existe (senão **PEND**) |
| `assert_exit` | `<id> <esperado> <desc> -- <cmd…>` | Exit code do comando |
| `assert_grep_empty` | `<id> <desc> <esperado> <achados>` | Falha se houve achado; imprime até 8 linhas |
| `gate_scope_excl` | `<ids> <o-que-fica-de-fora> <por-quê>` | Registra uma **exclusão de escopo declarada** |
| `gate_shell_scope_tool` | — | Materializa o classificador léxico de fonte shell e imprime o caminho (§8.11) |
| `gate_summary` | — | Resumo, limitações, exclusões, e retorna `1` se houve **FAIL ou PEND** |

Auxiliares: `gate_repo_root`, `gate_rel`, `gate_trunc`, `gate_find_into`, `gate_schema_validator`,
`gate_cleanup_tmp`.

⭐ **Toda falha imprime três linhas: onde (arquivo:linha ou comando), esperado e obtido. Nenhum
`FAIL` sem contexto.**

---

## 8.16 O que envelhece

| Marca | Item | Estado |
|---|---|---|
| ⏳ | As **194** linhas medidas do corpo e a folga de 6 | recontar a cada edição do `SKILL.md`; o teto normativo (**200**) é que é estável |
| ⏳ | Os **907** caracteres da `description` | idem; o teto (**1024**) é estável |
| ⏳ | A estimativa de **6.000–6.500 tokens** do corpo | depende do tokenizador; o teto normativo é o de **linhas** |
| ⏳ | `I-06b`, `G-12c`, `G-12d` em **PEND** | fecham quando `decisions-ask.sh`, `docs/08-decisoes-abertas.md` e o primeiro marcador de BUILD_SPEC existirem |
| ⏳ | Ausência de `shellcheck` na máquina | `B-11` vira PASS/FAIL assim que a ferramenta existir; hoje é SKIP |
| ⏳ | O default `2026-08-23` de `STUDY_METHOD_TODAY` | é fixação de determinismo, não data de validade |
| ⚠ | `docs/00-contratos.md` §4.1 e §11 ainda carregam **19** chaves no digest e **19** valores de `language` nos três schemas | O gate checa **18** e **20/20/19**, e **imprime a divergência a cada execução**. É o texto do contrato que precisa da correção — não o gate |
| — | `DEB-1`, `DEB-2`, `DEB-3` (§8.13.2) | dívidas abertas, declaradas |
