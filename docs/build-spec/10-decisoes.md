# BUILD_SPEC · 10 — Catálogo de decisões

**Dono**: sub-tarefa 3.0a. **Contrato, não racional** — o porquê de cada default vive no `source` da
própria entrada e nos documentos citados por ele.

## 1. Artefatos

| Artefato | Papel |
|---|---|
| `SK/assets/decisions.json` | **Origem de verdade.** Quais decisões existem, quais opções são válidas, para quem, quando, a que custo, e onde a resposta é gravada. |
| `SK/assets/schemas/decisions.schema.json` | Schema do arquivo acima. `$id: urn:study-method:schema:decisions:1`. |
| `docs/08-decisoes-abertas.md` | **Derivado** (outra onda). Renderização humana do catálogo. |
| `SK/scripts/decisions-ask.sh` | **Derivado** (outra onda). Lê o catálogo e conduz a entrevista. |

Regra: nenhum derivado inventa decisão, opção ou default. Divergência entre derivado e catálogo é
bug do derivado.

## 2. Schema do catálogo — campo a campo

### 2.1 Raiz

| Campo | Tipo | Obrigatório | Contrato |
|---|---|---|---|
| `schema_version` | string `^[0-9]+\.[0-9]+$` | sim | `1.0`. Acrescentar valor a um enum de `audience`, `ask_when`, `reversibility` ou `status` é MAJOR: o script de entrevista e o BUILD_SPEC despacham sobre esses enums. |
| `generated_by` | string ≤500 | sim | Procedência, para auditoria humana. Nenhum código despacha sobre ele. |
| `notes` | array de string ≤1200 | não | Notas de leitura em pt-BR. |
| `field_contract` | objeto aberto | sim | Glossário redundante, para quem lê o arquivo cru. Divergência com o schema é bug do catálogo. |
| `decisions` | array, `minItems: 1` | sim | As entradas. |

### 2.2 Uma entrada

| Campo | Tipo | Obrigatório | Contrato |
|---|---|---|---|
| `id` | string `^D-[A-Z]{1,3}[0-9]{2,3}$` | sim | Único no catálogo. Prefixos: `A` arquitetura · `M` memória · `P` proficiência · `E` ensino · `C` challenge · `V` visualização e linguagem · `B` bootstrap · `S` segurança. É a chave em `setup.json → decisions` e no marcador do BUILD_SPEC: renomear depois exige migrar setups. |
| `question_ptbr` | string 8..400 | sim | A pergunta em linguagem de gente. Nunca pede ao leitor que conheça nome de campo de schema. |
| `why_it_matters` | string 30..900 | sim | 1–3 linhas com analogia concreta, no tom do banco de analogias. **É o campo que cumpre o requisito "explicada para o usuário decidir".** Diz o que muda de cada lado; nunca repete a pergunta. |
| `audience` | `builder` \| `student` \| `both` | sim | §4. |
| `tier` | inteiro 1..4 | sim | §3. |
| `ask_when` | `setup-init` \| `first-challenge` \| `session-15` \| `on-demand` \| `never` | sim | §3. Governa o agendamento **em runtime**. |
| `reversibility` | `cheap` \| `moderate` \| `expensive` | sim | `cheap` = uma linha num arquivo · `moderate` = migrar dado já escrito · `expensive` = há efeito que não se desfaz. Toda `expensive` diz no `why_it_matters` **o que exatamente não volta atrás**. |
| `writes_to` | string ou `null` | sim | §5. |
| `options[]` | array, `minItems: 1` | sim | §2.3. |
| `default` | string snake_case | sim | Id de uma opção **desta** entrada. |
| `source` | string 3..500 | sim | `caminho#seção` que sustenta o default; vários separados por ` + `. Entradas sem tabela de origem começam com `novo em 3.0`. |
| `status` | `open` \| `resolved_by_arbitration` | sim | §6.2. |
| `resolved_by` | string `^AR-[0-9]{2}(/[0-9]{2})*$` ou `null` | não | Não nulo ⟺ `status == resolved_by_arbitration`. |
| `alt_ids[]` | array de `^D-[A-Z]{1,3}[0-9]{2,3}(@caminho)?$` | não | Ids absorvidos na deduplicação, e ids renumerados por colisão (forma `D-XXNN@arquivo`). Busca por id antigo tem de chegar na entrada viva. |
| `related_ids[]` | array | não | Vizinhas que **não** são duplicatas. O script pode oferecê-las; nunca as pergunta em cascata. |

### 2.3 Uma opção

| Campo | Tipo | Contrato |
|---|---|---|
| `id` | `^[a-z][a-z0-9_]{0,39}$` | Único entre as opções da mesma entrada. É o que `default` referencia. |
| `label` | string 1..240 | Rótulo em pt-BR, como aparece no menu. |
| `value` | string \| boolean \| number | **O dado de máquina gravado em `writes_to`** — nunca a prosa do `label`. Escalar por contrato. |
| `pros[]` | array, `minItems: 1` | Ganhos verificáveis. |
| `cons[]` | array, `minItems: 1` | Custos. **Obrigatoriamente não vazio, inclusive na opção recomendada**: opção sem custo declarado é anúncio, não escolha. |

Restrições de forma do schema (verificador mínimo, `docs/00-contratos.md` §4.3): sem `$ref`, `allOf`,
`anyOf`, `oneOf`, `if/then/else`, `$defs`, `patternProperties`. `type` pode ser array. Toda
propriedade tem `description`.

## 3. As quatro camadas — critério de admissão

| Camada | `tier` | `ask_when` admitido | Teto | Critério de admissão |
|---|---|---|---|---|
| Dia zero | 1 | `setup-init` | **≤ 6** | Passa nos **dois** testes: (a) sem a resposta a skill não dá a primeira aula, ou daria uma aula pior de um jeito que o aluno perceberia; (b) a resposta cabe numa palavra ou numa escolha de menu. Falhar em um dos dois rebaixa para outra camada. |
| No momento certo | 2 | `first-challenge`, `session-15` | — | O assunto **não existe** antes de um dos dois marcos: o primeiro desafio gerado ou tentado, ou o histórico ficar longo (limiar de compactação, revisão espaçada vencida, retomada após ausência). |
| Sob demanda | 3 | `on-demand` | — | Só quando o aluno pergunta, **ou** no instante exato em que a skill precisa da autorização para agir (instalar, ler outro setup, sair para a web, gravar texto livre). Consentimento pedido no ponto de coleta, nunca no dia zero. |
| Congelada | 4 | `never` | — | Documentada com o porquê e o custo de mudar. Nunca vira pergunta **ao aluno**. Pode ainda virar marcador de BUILD_SPEC se `audience` for `builder`/`both` e `status` for `open` (§6). |

Regras duras:

- `ask_when: setup-init` **só** em `tier: 1`. Nenhuma outra camada usa esse valor.
- `tier: 1` implica `audience: student`.
- `tier: 4` implica `ask_when: never`, e vice-versa.
- `tier: 2` implica `ask_when ∈ {first-challenge, session-15}`; `tier: 3` implica `on-demand`.

## 4. `audience` — a distinção que decide quem é perguntado

| Valor | Quem responde | Quando | `writes_to` |
|---|---|---|---|
| `student` | O aluno | Em runtime, no marco de `ask_when` | Não nulo |
| `builder` | Quem constrói a skill | Em build-time, no marcador do BUILD_SPEC | **Sempre `null`** — a resposta vira código do repositório, não dado do setup |
| `both` | Builder escolhe o default de fábrica; o aluno tem o interruptor | Build-time **e** runtime | Não nulo |

**Nenhuma decisão sobre forma de schema, exit code, namespace de `$id`, algoritmo interno, formato
de identificador ou operador de mutação pode ter `audience: student`.** "Namespace do `$id` dos
schemas" (`D-A10`) nunca é pergunta de aluno.

## 5. `writes_to` — resolução contra o manifesto

`writes_to` é um caminho pontilhado dentro de `setup.json`. Regra de resolução, aplicada pelo gate
contra `SK/assets/schemas/setup-manifest.schema.json`:

1. Cada segmento é procurado em `properties` do nó corrente.
2. Se não estiver lá, o segmento é aceito quando o nó corrente tem `additionalProperties: true` —
   caso de `decisions`, que é um mapa aberto reservado *por descrição* para as respostas deste
   catálogo.
3. Qualquer outro caso é erro.

Campos de primeira classe em uso hoje: `title` · `theory_source` · `language.name` ·
`session_minutes` · `skill_level` · `docs_ingest.token_budget` · `privacy.cross_read`. Todo o resto
grava em `decisions.<ID>`.

Forma do registro gravado (definida por `setup-manifest.schema.json`):
`{"value": <o value da opção escolhida>, "answered_at": <ISO 8601>, "default_used": <bool>,
"asked_in_session": "NNNN", "note": <opcional>}`. **`default_used: true` nunca é aplicado em
silêncio**: a skill avisa uma vez que assumiu o default e como mudar.

## 6. Os marcadores no BUILD_SPEC

### 6.1 Forma exata

O marcador é uma citação de bloco de **quatro linhas**, inserida no ponto da construção em que a
resposta muda o que vai ser escrito — nunca no começo do fragmento, nunca num apêndice:

```markdown
> **PERGUNTE AO USUÁRIO (D-A08)** — reversibilidade: `moderate`
> O objeto `decisions` do `setup.json` é um mapa livre `id → resposta` ou um array com schema estrito?
> É a diferença entre uma caixa de chaves com etiqueta e um formulário com campos fixos. […why_it_matters…]
> **Default se não responder:** `open_map` — objeto livre, a validação fica com `decisions.json`.
```

Contrato de cada linha:

1. `> **PERGUNTE AO USUÁRIO (<id>)** — reversibilidade: <reversibility>` — o custo de mudar de ideia
   aparece **antes** da pergunta, nunca depois.
2. `question_ptbr`, literal.
3. `why_it_matters`, literal. **Obrigatória**: um marcador sem explicação não cumpre o requisito.
4. `> **Default se não responder:** <default> — <label da opção default>`.

Quando a entrada tem mais de duas opções, as opções entram como lista imediatamente abaixo do bloco,
uma linha por opção, no formato `- **<label>** — prós: …; contras: …`.

### 6.2 Quem ganha marcador

| Condição | O que o fragmento faz |
|---|---|
| `audience ∈ {builder, both}` **e** `status == open` | **Insere o marcador** de §6.1. São **48** entradas. |
| `status == resolved_by_arbitration` | **Não insere marcador.** Cita a arbitragem em uma linha: `> Decidido por **AR-NN** (D-XXNN): <default label>.` São **20** entradas. |
| `audience == student` | **Não insere marcador de build.** Em vez disso, o fragmento especifica *o gatilho, o texto e a gravação*: em que passo a skill pergunta (`ask_when`), com que frase (`question_ptbr`), com que explicação (`why_it_matters`), e em que caminho grava (`writes_to`). |

### 6.3 Roteamento por fragmento

O dono do marcador é o fragmento que constrói o artefato que a decisão configura. Distribuição das
48 entradas com marcador, por prefixo:

| Prefixo | N | Fragmentos prováveis |
|---|---|---|
| `D-A` | 11 | `30-lib-setup.md`, `31-sessao-docs.md`, `80-gate.md` |
| `D-M` | 4 | `40-memoria.md` |
| `D-P` | 6 | `41-progresso-readme.md` |
| `D-E` | 7 | `20-skill-md.md` (regras permanentes) |
| `D-C` | 5 | `51-challenge-new.md`, `52-challenge-verify.md` |
| `D-V` | 7 | `70-render.md`, `50-sandbox.md` |
| `D-B` | 3 | `30-lib-setup.md`, `31-sessao-docs.md` |
| `D-S` | 5 | `50-sandbox.md`, `20-skill-md.md` |

Regra de unicidade: **cada id aparece como marcador em exatamente um fragmento.** Repetir o mesmo
id em dois fragmentos é erro do BUILD_SPEC, não do catálogo.

### 6.4 Marcadores de runtime (as perguntas ao aluno)

Os 46 `audience: student` mais os 7 `both` não geram marcador de build, mas o fragmento dono precisa
declarar o gatilho. Distribuição:

| `ask_when` | N | Onde o gatilho é implementado |
|---|---|---|
| `setup-init` | 6 | `30-lib-setup.md` — a entrevista de criação, na ordem `D-B13 · D-B04 · D-B14 · D-B17 · D-B15 · D-B16` |
| `first-challenge` | 10 | `51-challenge-new.md` — na primeira geração de desafio do setup |
| `session-15` | 4 | `40-memoria.md` — quando o limiar de sessões não consolidadas é atingido |
| `on-demand` | 33 | O fragmento dono do artefato; a pergunta sai no instante em que a skill precisaria agir |

## 7. Invariantes que o gate verifica

Nesta ordem, todas contra o par `decisions.json` + `decisions.schema.json`:

1. `decisions.json` parseia e valida contra `decisions.schema.json` pelo verificador mínimo.
2. Nenhum `id` duplicado; nenhum `alt_ids` sem `@` colide com um `id` vivo; todo `related_ids`
   aponta para um `id` existente.
3. `tier == 1` conta **≤ 6**, todas com `ask_when == setup-init` e `audience == student`; nenhuma
   entrada fora de `tier 1` usa `setup-init`.
4. Todo `writes_to` não nulo resolve pela regra de §5; toda entrada `audience == builder` tem
   `writes_to == null`.
5. Toda entrada `audience ∈ {student, both}` tem `question_ptbr` e `why_it_matters` não vazios.
6. Toda `status == resolved_by_arbitration` tem `ask_when == never` e `resolved_by` não nulo;
   nenhuma `status == open` tem `resolved_by` preenchido.
7. `default` é sempre id de uma opção da própria entrada; ids de opção não se repetem dentro de uma
   entrada; nenhuma opção tem `cons` vazio.
8. Coerência `tier` ↔ `ask_when` conforme a tabela de §3.

## 8. Contagem corrente (congelada — o gate compara)

```
total ......................... 114
tier      1 / 2 / 3 / 4 ....... 6 / 14 / 33 / 61
audience  student/both/builder  46 / 7 / 61
ask_when  setup-init ........... 6
          first-challenge ...... 10
          session-15 ........... 4
          on-demand ............ 33
          never ................ 61
status    open ................. 94
          resolved_by_arb ...... 20
reversib. cheap/moderate/exp ... 82 / 23 / 9
marcadores PERGUNTE AO USUÁRIO . 48
ids alternativos registrados ... 16
decisões levantadas em 3.0 ..... 7
```

## 9. Nota de numeração `AR-NN`

A tabela `docs/00-contratos.md` §12 numera as arbitragens **A-01..A-25**; os documentos que as citam
usam rótulos **AR-NN** de um registro maior, e a correspondência **não é 1:1** (ex.: `docs/01` cita
`AR-06` para a sessão órfã, que é a linha `A-12`; `docs/05` cita `AR-19` para `test_sha256`, enquanto
`A-19` trata da contagem de scripts). Convenção aplicada no catálogo:

- existe linha de §12 que cobre a decisão → `resolved_by` usa o número **dessa linha** em forma
  `AR-NN`, e `source` cita a linha explicitamente;
- não existe → `resolved_by` preserva o rótulo citado pelo documento de origem.

A divergência de numeração é um achado sobre os documentos, não um erro deste arquivo, e não é
resolvida aqui: quem consolidar o registro de arbitragens é quem a fecha.
