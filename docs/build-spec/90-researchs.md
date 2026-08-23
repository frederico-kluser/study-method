# 90 — `researchs/`: formato do destilado e proveniência

Sub-tarefa 3.9. Contrato do arquivo `researchs/NNNN.md`, do bloco de proveniência, da derivação
da seção `destilados` do `README.md` do setup e da política de supersede. O racional — por que o
formato é este — vive em `docs/13-researchs.md` do repositório; aqui só o contrato.

## 1. Estrutura do arquivo

`researchs/NNNN.md`, onde `NNNN` = `research_id`, pattern `^[0-9]{4}$`, zero-padded, sequencial
dentro do setup (mesma disciplina de `session_id`/`challenge_id`).

```
<!-- study-method:meta {...} -->    linha 1 — física, única linha, obrigatória
                                     linha 2 — em branco
# <título>                          linha 3 — H1, título de verdade, nunca a slug crua

## <seção permitida>                0+ seções H2, ver §3
```

Regras duras:

- **Linha 1 é sempre e só o bloco de proveniência** — nada antes dele, nem BOM, nem linha em
  branco, nem frontmatter (frontmatter YAML é proibido em qualquer artefato gerado, I-36).
- **O bloco cabe em uma linha física.** Sem quebra de linha dentro do comentário HTML. É o que
  torna `head -1 arquivo.md | sed 's/^<!-- study-method:meta //; s/ -->$//' | jq .` uma extração
  correta e suficiente. Sem essa regra, isolar o bloco de um comentário HTML multilinha exigiria
  um parser que este projeto não tem (só `jq` está garantido; não há parser XML/HTML na esteira).
  A forma multilinha usada em `docs/00-contratos.md` §3.4 é só para caber na largura da página em
  markdown — o artefato materializado não a reproduz.

## 2. Bloco de proveniência — campos, nesta ordem

| # | Campo | Tipo | Origem | Regra |
|---|---|---|---|---|
| 1 | `schema_version` | string | literal | `"1.0"` |
| 2 | `kind` | string | literal | `"research"` — distingue do mesmo bloco usado em `docs/generated/NNNN-<slug>.md` (`kind:"generated"`, `docs/10-bootstrap.md` do repositório) |
| 3 | `research_id` | string | placeholder `RESEARCH_ID` | `^[0-9]{4}$` |
| 4 | `topic` | string | placeholder `TOPIC` | `^[a-z0-9]+(-[a-z0-9]+)*$` — kebab-case (A-15, `docs/00-contratos.md` §12). Idêntico ao `<slug>` de `researchs/assets/<NNNN>-<slug>/`: mesmo valor, sem transformação. |
| 5 | `sources` | array de string | placeholder `SOURCES_JSON` | caminho relativo à raiz do setup (aponta em geral para dentro do `docs/` do setup) **ou** URL `https://` consultada nesta sessão. `[]` é válido e comum — destilado sem fonte local é permitido. |
| 6 | `provenance` | enum | literal, corrigido depois pelo agente | `student_provided \| generated_researched \| generated_unsourced` (`docs/00-contratos.md` §4.1). O script sempre grava `"generated_unsourced"` — é o único valor que ele cravaria sem mentir, porque não sabe se houve busca. O agente corrige antes de escrever o corpo. |
| 7 | `created_in_session` | string | placeholder `CREATED_IN_SESSION` | `^[0-9]{4}$` |
| 8 | `created_at` | string | placeholder `CREATED_AT` | timestamp ISO-8601, pattern de `docs/00-contratos.md` §4.2 |
| 9 | `status` | enum | literal | `active \| superseded`. O script sempre grava `"active"`. |
| 10 | `supersedes` | array de string | literal `[]`, editado no supersede | `research_id` dos arquivos que este substitui — normalmente 0 ou 1 elemento |
| 11 | `superseded_by` | string ou `null` | literal `null`, editado no supersede | `research_id` do sucessor, ou `null` enquanto `status:"active"` |
| 12 | `verified_by_student` | boolean | literal `false` | vira `true` só com confirmação explícita do aluno |
| 13 | `disputed` | boolean | literal `false` | vira `true` quando o material do aluno contradiz o destilado e a skill decide manter os dois lados registrados |

⚑ Resolve uma divergência de nome entre `docs/00-contratos.md` §3.4 (usa `id`) e §4.2 (nomeia o
padrão `research_id`): este contrato usa **`research_id`** — é o nome já congelado pelo
placeholder `RESEARCH_ID` de `MANIFEST.tsv`, consumido por `research-new.sh`.

⚑ `topic` é **kebab-case**, não snake_case: A-15 (`docs/00-contratos.md` §12) arbitra
"tópico/tag/slug = kebab-case" contra "conceito = snake_case", e a assinatura de
`research-new.sh --topic <slug>` (§8 da mesma tabela) já tipa o argumento como slug. `topic`
**não é** `concept_id` — dois namespaces distintos, por design (mesmo §12).

`research-new.sh` não recebe `--provenance`: não está na assinatura de §8. A classificação de
proveniência depende de saber se uma busca web *aconteceu* nesta sessão — informação que só o
agente tem. O script nunca finge sabê-la.

## 3. Seções do corpo — vocabulário fechado

H2 permitidos, só os que se aplicam, nesta ordem quando presentes: `## Definição` ·
`## Fórmula` (matemática) ou `## Sintaxe` (programação) · `## Exemplo mínimo` · `## Armadilha` ·
`## Ver também`.

H2 proibidos — grep-áveis por substring case-insensitive: qualquer heading contendo `introdu`,
`resum`, `conclus`, `considera`, `contexto`, `motivaç`/`motivac`.

Regras de estilo de prosa (abertura, tamanho de parágrafo, adjetivo proibido): racional em
`docs/13-researchs.md` §2 do repositório — não duplicadas aqui porque são estilo, não forma de
arquivo.

## 4. Supersede

1. O novo arquivo aloca o próximo `NNNN` sequencial — mesmo contador de `research-new.sh`.
2. Novo arquivo: `supersedes: ["<antigo>"]`, `status: "active"`.
3. Arquivo antigo: só o bloco de proveniência muda — `status: "superseded"`,
   `superseded_by: "<novo>"`. **O corpo do arquivo antigo não é reescrito.**
4. O arquivo antigo ganha, logo após o H1 e antes da primeira seção, uma linha de aviso:
   `> Superseded por \`researchs/<novo>.md\`.`
5. Nada é apagado. `status: superseded` não remove o arquivo do disco nem o tira do índice do
   README (§5) — ele aparece, anotado.

## 5. Seção `destilados` do `README.md` do setup — derivação mecânica

`docs/07-multi-setup.md` §4.1 do repositório já define a seção (`tópico + 1 linha + status`);
este contrato define a extração linha a linha, para que `readme-sync.sh` não precise de
heurística nova nem de campo redundante.

Para cada `researchs/NNNN.md` — nunca descendo em `researchs/assets/` — ordenado por
`research_id` crescente:

```
meta  = head -1 <arquivo> | sed 's/^<!-- study-method:meta //; s/ -->$//' | jq .
title = primeira linha que casa '^# ' no arquivo (a linha do H1), sem o '# ', aparada
row   = "| researchs/{meta.research_id}.md | {meta.topic} | {title} | {status_col} |"
```

`status_col` é `active` quando `meta.status == "active"`; quando `superseded`, é
`superseded → researchs/{meta.superseded_by}.md`.

Nenhum campo de resumo é escrito duas vezes: `title` (o H1) já é obrigatório para o arquivo ser
válido (§1) e é a única fonte da coluna descritiva — não existe, e não deve ser criado, um campo
`one_line_summary` no bloco de proveniência de `researchs/`. Célula truncada em 80 caracteres com
`…` quando `title` for mais longo.

O teto de 200 linhas do `README.md` do setup e o comportamento de estouro (a seção vira
contagem + os 10 destilados mais recentes) são de `docs/07-multi-setup.md` §4.3 do repositório —
não redefinidos aqui.

## 6. Figuras

`researchs/assets/<NNNN>-<slug>/`, onde `<slug>` é o mesmo valor do campo `topic` (§2, campo 4)
— sem transformação. Formato dos quatro artefatos e ferramenta de geração:
`docs/06-visualizacao.md` do repositório. Contrato local, específico de `researchs/`:

- Toda referência de imagem em `researchs/NNNN.md` é
  `![<alt curto>](assets/<NNNN>-<slug>/<nome>.svg)`, caminho relativo à raiz de `researchs/`.
- Nunca uma imagem sozinha: a referência vem sempre acompanhada de 1–3 linhas de prosa
  descrevendo o que a figura mostra, e essa prosa **é** o `description_text` que `render-plot.py`
  devolveu no stdout (`docs/06-visualizacao.md` §3) — nunca inventada, porque o agente não
  enxerga o arquivo que gerou.

## 7. Condições de erro

| Condição | Por quê |
|---|---|
| Linha 1 não é o bloco `study-method:meta` completo numa única linha física | quebra a extração de §5 e o único parser disponível (`jq`) |
| `head -1 <arquivo> \| jq .` falha | bloco malformado — arquivo deixa de ser consultável por máquina |
| `provenance` fora dos 3 valores do enum | viola `docs/00-contratos.md` §4.1 |
| H2 fora do vocabulário fechado de §3, ou casando os termos proibidos | rodeio estrutural — ver `docs/13-researchs.md` §2 |
| `sources[]` contém caminho absoluto (`^/`) | viola `docs/00-contratos.md` §3.4 — o setup precisa poder ser movido de lugar |
| `status:"superseded"` sem `superseded_by` preenchido | cadeia de supersede quebrada, mesma disciplina de `profile.json` |
| `topic` não casa `^[a-z0-9]+(-[a-z0-9]+)*$` | quebra a igualdade com o `<slug>` do diretório de assets (§6) |
