# 12 — Conformidade do BUILD_SPEC contra o repositório

O `BUILD_SPEC.md` promete uma coisa concreta: **uma LLM sem este repositório reconstrói a skill
só com ele** (`docs/build-spec/blocks/00-intro.md` M1). Um documento assim envelhece em silêncio —
o código muda, o documento fica, e ninguém percebe até alguém tentar seguir o documento e falhar
no meio da reconstrução. Este documento descreve `tests/spec-conformance.sh`: o gate que responde
mecanicamente à pergunta **"o BUILD_SPEC ainda descreve o repositório de verdade?"**, para que a
resposta pare de depender de alguém lembrar de reler os dois lado a lado.

A regra de precedência do projeto (`docs/00-contratos.md` §1) vale aqui sem exceção:
**`docs/00-contratos.md` é a autoridade; o BUILD_SPEC transcreve contrato, nunca inventa.** Este
gate é a tradução mecânica dessa regra para o único documento que fica fora do repositório em
espírito — ele é escrito *para alguém que não tem o repositório na frente*, então é o documento
que mais silenciosamente diverge do que ele descreve.

---

## 1. Onde este gate vive na família de gates

O projeto já tinha 4 gates (`CONTRIBUTING.md` §"Os 4 gates"): `gate-build.sh` (sintaxe e forma),
`gate-lint.sh` (qualidade de texto), `validate.sh` (as invariantes de `docs/00-contratos.md` §11)
e `smoke.sh` (integração ponta a ponta). `tests/spec-conformance.sh` é um quinto gate, com um
escopo que nenhum dos quatro cobre:

| Gate | Verifica | Contra o quê |
|---|---|---|
| `validate.sh` | O **repositório** obedece ao contrato | `docs/00-contratos.md` × o resto do repositório (schemas, scripts, `SKILL.md`, `references/`) |
| `validate.sh` → `G-12d` | Os **fragmentos** `docs/build-spec/*.md` marcam as decisões de build que lhes cabem | `skills/study-method/assets/decisions.json` × `docs/build-spec/**` (NUNCA o `BUILD_SPEC.md` final) |
| **`spec-conformance.sh`** | O **BUILD_SPEC.md costurado** (documento único, na raiz do repositório, produto da onda que junta os fragmentos — `docs/build-spec/README.md`) ainda bate com o repositório | `BUILD_SPEC.md` × o repositório inteiro (caminhos, scripts, funções, schemas, decisões, vocabulário, exit codes, termos revogados) |
| `smoke.sh` | O **fluxo executável** funciona ponta a ponta | Os scripts rodando de verdade, num diretório temporário |

`spec-conformance.sh` **não repete** `G-12d`: `G-12d` varre os fragmentos de `docs/build-spec/`
enquanto a onda de escrita ainda está em curso; `spec-conformance.sh` varre o **produto final**
depois de costurado. Os dois podem — e devem — estar verdes ao mesmo tempo sem se pisarem.

---

## 2. O que a verificação cobre — as 11 checagens

Onze checagens, respondendo a oito perguntas do briefing original. Cada uma tem um id `SC-NN`
(mais uma letra quando a pergunta tem duas direções), no mesmo estilo de `I-NN`/`G-NN` de
`validate.sh`.

| Id | Pergunta | Fonte de verdade | Direção |
|---|---|---|---|
| `SC-01` | Todo caminho de arquivo que o documento afirma existir, existe? | o disco, a partir da raiz do repositório | documento → disco |
| `SC-02a` | Todo script citado por caminho (`SK/scripts/…`) está na tabela §8? | `docs/00-contratos.md` §8 | documento → inventário |
| `SC-02b` | Todo script da tabela §8 é citado em algum lugar do documento? | `docs/00-contratos.md` §8 | inventário → documento |
| `SC-03` | Toda função `sm_*` citada existe com o mesmo nome em `SK/scripts/lib/`? | `skills/study-method/scripts/lib/*.sh` | documento → lib |
| `SC-04` | Todo schema transcrito (bloco &#96;&#96;&#96;json com `"$id"`) bate com o arquivo em disco? | `skills/study-method/assets/schemas/**/*.json` | documento ↔ disco (igualdade estrutural) |
| `SC-05a` ⭐ | Todo marcador `PERGUNTE AO USUÁRIO (D-NNN)` cita um id real do catálogo? | `skills/study-method/assets/decisions.json` | documento → catálogo |
| `SC-05b` ⭐ | Toda decisão elegível (`audience ∈ {builder, both}` e `status == open`) tem marcador? | idem | catálogo → documento |
| `SC-06a` | Todo pattern citado (&#96;^…$&#96;) existe em algum schema do disco? | todos os schemas | documento → disco |
| `SC-06b` | Todo enum citado (linha de tabela) bate com o enum do schema dono? | todos os schemas | documento ↔ disco |
| `SC-07` | A tabela de exit codes do documento bate com `docs/00-contratos.md` §5.1? | `docs/00-contratos.md` §5.1 | documento ↔ contrato |
| `SC-08` | Nenhum termo revogado aparece sem marcador de revogação na mesma janela de 3 linhas? | `docs/00-contratos.md` §2.2/§10 | documento (auto-consistência) |

`SC-05` (⭐ no briefing original) é a mais importante das onze: é a única que vai **nos dois
sentidos ao mesmo tempo** sobre o mesmo par de artefatos — nem o BUILD_SPEC pode inventar uma
pergunta que o catálogo não tem, nem pode esquecer uma que o catálogo manda fazer. As outras dez
checam uma direção (ou duas, mas contra fontes diferentes).

### 2.1 O padrão PEND → FAIL graduado

Duas checagens (`SC-02b` e `SC-05b`) verificam **cobertura completa** de um conjunto (os 19
scripts, as 48 decisões elegíveis). Um documento sendo escrito incrementalmente passa a maior
parte do tempo incompleto, e "incompleto" não é a mesma coisa que "está errado onde já chegou".
Por isso as duas usam o mesmo critério que `validate.sh` já usa em `G-12d`:

- **Zero itens da categoria apareceram ainda** (nenhum script citado / nenhum marcador de
  decisão em lugar nenhum) → **PEND**: "essa passada ainda não começou".
- **Pelo menos um item já apareceu** → cada item que falta vira **FAIL**: a passada começou, e o
  que falta é omissão, não ausência de tentativa.

As outras nove checagens não têm essa distinção: elas reprovam o que já está errado, não cobrança
de cobertura, então usam PEND só quando não há absolutamente nada da categoria para examinar
(nenhum caminho citado ainda, nenhum bloco de schema ainda, etc.) e PASS assim que tudo que existe
está correto — sem exigir que "tudo" já tenha sido escrito.

---

## 3. O que a verificação NÃO cobre — limitações declaradas

Limitação escondida é pior que limitação conhecida (mesma régua de `tests/lib/assert.sh`). O
gate imprime esta lista no próprio resumo (`GATE_LIMITS`), e ela está aqui por extenso:

1. **É verificação TEXTUAL, não semântica.** Ela pega caminho que sumiu, script fora do
   inventário, função sem definição, schema transcrito divergente, marcador de decisão sem par e
   termo revogado sem aviso. Ela **não** pega uma explicação que ficou errada, um racional
   desatualizado, ou uma decisão de arquitetura mal transcrita em prosa gramaticalmente correta.
   Nenhum grep prova que o texto ainda faz sentido — só que os fatos mecânicos citados nele ainda
   existem.
2. **A maioria dos checks lê só PROSA** — linhas fora de bloco cercado (&#96;&#96;&#96;…&#96;&#96;&#96;). Um
   bloco cercado é tratado como **ilustração** (diagrama de árvore, formato-modelo de um
   marcador), nunca como afirmação de caminho/função/enum real. `SC-04` é o único check que abre
   bloco &#96;&#96;&#96;json — é onde os schemas são de fato transcritos. Esse mesmo design blinda `SC-05`
   contra o próprio exemplo de FORMA que `docs/build-spec/10-decisoes.md` §6.1 cita **dentro de
   um bloco cercado** (`D-A08` como exemplo de sintaxe) — sem essa regra, aquele exemplo seria
   contado como um marcador de verdade e contaminaria a contagem.
3. **`SC-01` só reconhece caminho com um destes prefixos**:
   `SK/, skills/study-method/, docs/, tests/, examples/, evals/, .github/, README.md, CONTRIBUTING.md, install.sh, LICENSE`
   — e sem nenhum destes marcadores de placeholder: `<…>`, `{{…}}`, `*`,
   `NNNN`, `…`, `$`. Caminho de exemplo/fictício (`<setup_root>/memory/NNNN.json`,
   `challenges/<slug-fictício>/`) ou trecho de prosa sem esse prefixo fica **fora do escopo, de
   propósito** — senão toda árvore ilustrativa do documento viraria falso positivo.
4. **`SC-02` é análise léxica, não semântica.** Ela reconhece citação de script pela forma
   `SK/scripts/…`/`skills/study-method/scripts/…` (direção documento→inventário) e pelo nome nu
   em qualquer lugar do texto (direção inventário→documento). Ela não distingue "citou o script
   certo no contexto certo" de "o nome do script apareceu por acaso em outra frase".
5. **`SC-04` compara por igualdade ESTRUTURAL** após `json.load` de ambos os lados: ordem de
   chave e formatação/indentação não importam, só conteúdo. Um `"$id"` que não corresponde a
   nenhum schema em disco também é FAIL (schema renomeado/removido, documento não seguiu).
6. **`SC-06a` só reconhece pattern na forma exata `^…$`** dentro de um code span. **`SC-06b` só
   reconhece enum em linha de tabela** `` `campo` | `v1` · `v2` … `` — o mesmo formato que
   `docs/00-contratos.md` §4.1 usa — cujo `campo` seja uma propriedade com `enum` em **algum**
   schema; ignora o token `null` (é convenção de nulidade do tipo, não um membro do array
   `enum`); e quando dois schemas diferentes têm enums DIFERENTES para o mesmo nome de campo
   (ex.: dois campos `status`, um de sessão e um de fato), ela aceita bater com qualquer um dos
   dois — não pega troca cruzada entre eles.
7. **`SC-07` compara só a tabela §5.1** (códigos 0/1/2/3/4/5/10 → "Significado", texto
   normalizado por espaço). As exceções nomeadas de §5.2 (`runner.sh` gerado, `render-plot.py`) e
   os códigos observados de §5.3 (137, 124, 142, …) **não** são comparados mecanicamente — são
   texto multi-coluna heterogêneo demais para um diff confiável sem uma taxa alta de falso
   positivo.
8. **`SC-08` reimplementa** — não importa — a mesma lista de termos revogados e a mesma janela de
   contexto revogatório (3 linhas) que `I-01`/`I-03`/`I-04`/`I-05` de `validate.sh` usam. É uma
   cópia deliberada, não uma referência: os dois gates são independentes (nenhum lê variável do
   outro), e a lista muda tão raramente quanto o próprio §2.2/§10 do contrato.

Nenhuma destas limitações é motivo para reprovar um documento correto — são o preço de um
verificador que roda em segundos com `bash`+`python3` stdlib, sem depender de julgamento de
modelo. Onde a heurística deixa passar algo, é o revisor humano quem completa.

---

## 4. Como rodar

```
tests/spec-conformance.sh              # roda os 11 checks
tests/spec-conformance.sh --help       # a mesma tabela do §2, mais as limitações do §3
GATE_ONLY=SC-05 tests/spec-conformance.sh   # só os checks cujo id começa por SC-05 (herdado de tests/lib/assert.sh)
```

Sem argumento de rede, sem dependência além de `bash`, `python3` (stdlib) e os utilitários
padrão do POSIX. Sai **0** só quando não há nenhum FAIL nem PEND — ou seja, quando `BUILD_SPEC.md`
existe, está completo nas onze frentes acima, e nada nele divergiu do repositório.

---

## 5. Como interpretar cada estado

Os cinco estados são os de `tests/lib/assert.sh` (a mesma semântica dos outros quatro gates):

| Estado | Símbolo | Significa | Reprova o gate? |
|---|---|---|---|
| **PASS** | `✔` | O que esse check verifica está correto | não |
| **FAIL** | `✘` | Violação de contrato: o documento diverge do repositório | **sim** |
| **PEND** | `◌` | Pré-requisito ausente — o artefato (ou a fatia dele) ainda não existe | **sim**, mas com mensagem que diz "ainda não escrito", não "escrito errado" |
| **SKIP** | `–` | Não aplicável neste ambiente | não |
| **WARN** | `!` | Divergência que não reprova | não |

`spec-conformance.sh` hoje só emite PASS/FAIL/PEND (nenhum dos onze checks tem caminho de SKIP ou
WARN) — a tabela acima documenta os cinco porque é o contrato de `assert.sh` como um todo, não
porque este gate os usa todos.

**Toda linha de FAIL tem três partes, sempre** (contrato de `tests/lib/assert.sh`): **onde**
(`BUILD_SPEC.md:<linha>`, ou a seção quando não há linha única, como em `SC-07`), **esperado**
(o valor do repositório) e **obtido** (o que o documento realmente diz). Nunca um "FAIL" sem
contexto.

### 5.1 Como ler cada FAIL, por check

| Se falhou… | …quer dizer que | Onde olhar primeiro |
|---|---|---|
| `SC-01` | O documento cita um caminho que não existe (renomeado, movido, nunca existiu) | `git log --follow` no caminho citado, ou procurar o nome novo |
| `SC-02a` | O documento cita um script por caminho que não é um dos 19 de §8 | `docs/00-contratos.md` §8 — o script foi removido (ex.: `challenge-run.sh`/`render-html.sh`, A-19) ou o nome tem erro de digitação |
| `SC-02b` | Um dos 19 scripts nunca é citado no documento | falta uma seção inteira, ou o script foi descrito só por perífrase, sem o nome literal |
| `SC-03` | Uma função `sm_*` citada não existe em `lib/common.sh`/`lib/json.sh`/`lib/sandbox.sh` | `docs/00-contratos.md` §7 — nome errado, função renomeada, ou função que nunca existiu |
| `SC-04` | O schema transcrito diverge do arquivo em disco | o campo apontado em "obtido" (formato `$.propriedade.subpropriedade`) — o disco venceu (o BUILD_SPEC transcreve, §0 deste documento); copie o arquivo de novo |
| `SC-05a` | Um marcador cita um `D-NNN` que não existe em `decisions.json` | id inventado ou digitado errado — conferir contra `skills/study-method/assets/decisions.json` |
| `SC-05b` | Uma decisão elegível não tem marcador em lugar nenhum | falta escrever o marcador de §6.1 de `docs/build-spec/10-decisoes.md`, no fragmento dono (§6.3 da mesma seção) |
| `SC-06a` | Um pattern citado não existe em nenhum schema do disco | o pattern mudou no schema e o documento não acompanhou, ou foi digitado errado (barra invertida, âncora) |
| `SC-06b` | Um enum citado não bate com o do schema dono | um valor foi acrescentado/removido/renomeado no schema e a tabela do documento ficou para trás |
| `SC-07` | Um código de exit diverge da tabela §5.1 | comparar texto a texto — geralmente é reformulação que perdeu uma palavra que fazia diferença |
| `SC-08` | Um termo revogado aparece sem dizer que morreu | ou o texto ressuscitou um nome antigo por engano, ou é uso legítimo que precisa de uma frase de revogação por perto (ex.: "…, que **não existe mais**") |

---

## 6. O que fazer quando o gate acusa divergência

A regra é sempre a mesma, e vem de `docs/00-contratos.md` §1: **o repositório vence.**
`BUILD_SPEC.md` é um documento **derivado** — ele transcreve o que o repositório (código,
schemas, `docs/00-contratos.md`) já diz, nunca inventa um contrato novo por conta própria. Daí o
procedimento de correção é sempre na mesma direção:

1. **Confirme que o repositório está certo primeiro.** Rode `tests/validate.sh` — se ele também
   está vermelho no mesmo ponto (por exemplo, um schema com `pattern` diferente do que
   `docs/00-contratos.md` §4.2 documenta), o bug é do **repositório**, não do BUILD_SPEC: conserte
   lá, não aqui. `spec-conformance.sh` assume que o repositório já é a fonte de verdade —
   ele não arbitra contradição nenhuma, só verifica se o documento a *reflete*.
2. **Se o repositório está certo e só o BUILD_SPEC divergiu**, corrija o BUILD_SPEC para bater com
   o repositório — nunca o contrário. Em particular: **nunca edite `docs/00-contratos.md` ou um
   schema só para fazer o BUILD_SPEC passar.** Isso inverteria a precedência que o projeto inteiro
   depende dela (§1 deste documento).
3. **Se o FAIL é `SC-05` (marcador de decisão)**, a correção é sempre em
   `docs/build-spec/10-decisoes.md` §6 primeiro (a forma e o roteamento do marcador), refletida
   depois no fragmento dono, e só então recosturada no `BUILD_SPEC.md`. Nunca escreva o marcador
   direto no `BUILD_SPEC.md` sem ele existir no fragmento — a próxima recostura da onda 4
   sobrescreveria a correção.
4. **Se o FAIL parece um falso positivo**, releia §3 (as limitações declaradas) antes de mudar o
   verificador: é comum a heurística estar certa e a suposição sobre o formato do documento estar
   errada (por exemplo, um caminho de exemplo fora de bloco cercado, quando deveria estar dentro).
   Só mude `tests/spec-conformance.sh` depois de confirmar que o caso realmente está fora do que
   §3 já declara — e, quando mudar, declare a exclusão nova do mesmo jeito que as outras.
5. **PEND não é uma reprovação a corrigir às pressas.** Se `BUILD_SPEC.md` ainda não existe, ou
   uma fatia dele ainda não foi escrita, PEND é o estado esperado durante a construção. O gate
   fica vermelho (PEND conta como vermelho, mesma régua dos outros quatro), mas a ação correta é
   **continuar escrevendo**, não silenciar o check.

Nenhuma escrita deste gate toca o disco: ele só lê. Rodá-lo qualquer número de vezes, em qualquer
ordem, não muda nada — inclusive `BUILD_SPEC.md` em si.
