# 13 — `researchs/`: o destilado semântico

`researchs/` guarda o fato, não o processo. Este documento define a fronteira com `memory/`, as
regras de estilo — verificáveis — que fazem "direto ao ponto" ser mais que um pedido de bom
gosto, o formato do arquivo `NNNN.md`, e de onde sai cada linha derivada do `README.md` do setup.
O contrato de forma (campos, algoritmos, condições de erro) vive em
`docs/build-spec/90-researchs.md`; aqui está o porquê.

---

## 1. O que é e o que NÃO é — a fronteira com `memory/`

**`researchs/` é memória semântica destilada** (`docs/01-arquitetura.md` §2, taxonomia CoALA): o
fato, atemporal, consultável fora do contexto de quando foi aprendido. **`memory/` é memória
episódica**: o que aconteceu numa sessão específica, com quem, e como.

Teste de uma frase: apague a data e o nome do aluno. Ela ainda é verdadeira e ainda faz sentido?
Se sim, é `researchs/`. Se ela murcha sem o contexto de *quando* foi dita, é `memory/`.

| Frase | Vai para |
|---|---|
| "Recursão é uma função que se chama para resolver uma versão menor do mesmo problema, até um caso-base que não recorre." | `researchs/` — fato atemporal |
| "Hoje o aluno confundiu recursão com iteração pela segunda vez." | `memory/` — evento datado, vira evidência de `progress.json` |
| `def fatorial(n): return 1 if n <= 1 else n * fatorial(n - 1)` como exemplo mínimo | `researchs/` — snippet funcional, não muda com a sessão |
| "O aluno ficou frustrado na terceira tentativa do desafio de fatorial recursivo." | `memory/` — estado afetivo, com `session_id` de evidência |
| "O teorema de Bolzano exige `f` contínua em `[a,b]` com `f(a)` e `f(b)` de sinais opostos." | `researchs/` — condição de validade é parte do fato |
| "Sessão 0012 fechou com 2 pendências sobre limites laterais." | `memory/` — resumo de sessão, é `INDEX.json`/`one_line_summary` |

Um destilado nunca conta a história de uma aula ("hoje vimos...", "você teve dificuldade com...");
um registro de sessão nunca vira enciclopédia ("recursão é quando..."). Se um trecho de
`memory/NNNN.json` acabar parecendo um verbete técnico, ele vazou de camada — deveria ter virado
um `researchs/NNNN.md` e uma referência a ele na sessão, não o texto duplicado nos dois lugares.

`researchs/` também não é `docs/generated/` do setup (a base teórica que a skill gera quando o
aluno não trouxe material — `docs/10-bootstrap.md` §7 do repositório). `docs/generated/` é
capítulo substituto de livro-texto, ingerido de novo a cada aula pelo `docs-index.sh`.
`researchs/` é destilado pontual, sob demanda, numerado à parte, e nunca reingerido em bloco —
ele entra na aula quando o tópico casa, não como fatia do orçamento de leitura do `docs/` do
setup.

---

## 2. ⭐ O estilo "direto ao ponto" como regra verificável

"Seja conciso" não é regra, é gosto. As regras abaixo são checáveis por grep ou por leitura de 5
segundos — é assim que uma eval consegue apontar "isto viola R-ST3", não só "isto está prolixo".

| ID | Regra |
|---|---|
| R-ST1 | A primeira frase do corpo (depois do H1) é o fato central. Nunca uma frase que anuncia o documento. |
| R-ST2 | Proibidas, em qualquer lugar do corpo: "neste documento", "neste destilado", "vamos ver", "hoje vamos", "nesta seção", "é importante notar que", "cabe destacar", "vale ressaltar", "como veremos". |
| R-ST3 | Nenhuma seção final de resumo ou fechamento. O destilado **acaba no último fato** — não recapitula o que acabou de dizer. |
| R-ST4 | Nenhuma saudação, nenhuma segunda pessoa dirigida ao aluno ("você vai aprender", "convido você a", "vamos entender juntos"). O destilado não fala *com* ninguém — ele *descreve*. |
| R-ST5 | Nenhum meta-comentário sobre o próprio texto ("este destilado é curto porque...", "resumindo o que foi dito acima", "em outras palavras" repetindo a frase anterior). |
| R-ST6 | Ordem de preferência de forma: **definição/axioma > tabela > snippet mínimo executável > parágrafo**. Parágrafo só quando nenhum dos três resolve. |
| R-ST7 | Todo parágrafo (quando existir) tem no máximo 4 linhas. Rodeio se esconde dentro de parágrafo comprido. |
| R-ST8 | Nenhum adjetivo de opinião não técnica: "interessante", "poderoso", "elegante", "simples", "fascinante". Se algo é simples, mostre sendo simples — não anuncie que é. |
| R-ST9 | O título (H1) é o nome do conceito, nunca uma pergunta ("O que é recursão?") nem uma frase completa ("Entendendo recursão"). |
| R-ST10 | Nenhum heading de `## Introdução`, `## Resumo`, `## Conclusão`, `## Considerações finais`, `## Contexto` ou `## Motivação` — vocabulário fechado de seções em `docs/build-spec/90-researchs.md` §3. |

### Abertura ruim × boa, lado a lado

**Tópico: closures em JavaScript.**

> ❌ **Ruim**
>
> # Closures em JavaScript
>
> Neste documento vamos explorar o conceito de closures em JavaScript, que é um dos temas mais
> importantes e, ao mesmo tempo, mais confusos para quem está aprendendo a linguagem. Antes de
> mais nada, é importante entender o contexto: uma closure surge sempre que uma função é
> definida dentro de outra...

> ✅ **Boa**
>
> # Closures
>
> Uma closure é a combinação de uma função com o ambiente léxico em que ela foi criada — a
> função "lembra" as variáveis desse ambiente mesmo depois que ele, em tese, deixou de existir.
>
> ```js
> function contador() {
>   let n = 0;
>   return () => ++n;
> }
> const c = contador();
> c(); // 1
> c(); // 2
> ```
>
> `n` sobrevive porque a função retornada mantém referência viva ao escopo de `contador`, não
> uma cópia do valor.

**Tópico: limites laterais.**

> ❌ **Ruim**: "Vamos entender agora o conceito de limites laterais, que é fundamental para o
> estudo de continuidade e vai aparecer bastante daqui pra frente..."
>
> ✅ **Boa**: "O limite lateral à direita de `f` em `a`, `lim_{x→a+} f(x)`, considera só valores
> de `x > a` se aproximando de `a`. `f` tem limite em `a` se, e só se, os dois laterais existem
> e são iguais."

Teste rápido: a primeira frase do corpo serviria como primeira frase de um verbete de dicionário
técnico? Se não, reescreva.

---

## 3. A estrutura do arquivo `NNNN.md`

```
<!-- study-method:meta {...} -->     linha 1, física, única linha
                                      linha 2, em branco
# <título>                           H1 — o conceito, nunca a slug crua
## Definição                         quase sempre presente
## Fórmula | ## Sintaxe              se houver notação a fixar
## Exemplo mínimo                    snippet executável, se aplicável
## Armadilha                         contraexemplo/pegadinha, se houver uma que valha registrar
## Ver também                        links para outro research (NNNN) ou figura
```

O bloco de proveniência é um comentário HTML com JSON — **não YAML**: não há PyYAML nesta
máquina, e frontmatter YAML é proibido em qualquer artefato gerado do projeto
(`docs/00-contratos.md` §3.4, invariante I-36). Legível por `jq`, sempre:

```
<!-- study-method:meta {"schema_version":"1.0","kind":"research","research_id":"0001",
"topic":"cancelamento-catastrofico","sources":["docs/derivadas-cap2.md"],
"provenance":"student_provided","created_in_session":"0007",
"created_at":"2026-08-23T14:32:00-03:00","status":"active","supersedes":[],
"superseded_by":null,"verified_by_student":false,"disputed":false} -->
```

(quebrado em várias linhas aqui só para caber na largura desta página; no arquivo real é **uma
única linha física** — §3.4 abaixo explica por quê).

Campos, tipo e origem: tabela completa em `docs/build-spec/90-researchs.md` §2. Resumo das
decisões que valem explicação:

- **`research_id`**, não `id`. `docs/00-contratos.md` §3.4 usa `id` no exemplo solto e §4.2 nomeia
  o padrão `research_id` na tabela de patterns — divergência entre duas partes do mesmo
  documento. Fico com `research_id`: é o nome já congelado pelo placeholder `RESEARCH_ID` de
  `MANIFEST.tsv`, que `research-new.sh` já consome. ⚑
- **`topic` é kebab-case**, não snake_case. A-15 (`docs/00-contratos.md` §12) arbitra
  explicitamente "tópico/tag/slug = kebab-case" contra "conceito = snake_case", e a própria
  assinatura `research-new.sh --topic <slug>` (§8 da mesma tabela) já tipa o argumento como
  slug — não como `concept_id`. São dois namespaces por design: `topic` não precisa (e em geral
  não vai) casar caractere a caractere com o `concept_id` de `progress.json` para o mesmo
  assunto. ⚑
- **`provenance` nasce `generated_unsourced`**, sempre, porque é o único valor que
  `research-new.sh` — um script determinístico, sem julgamento — consegue cravar sem mentir. A
  assinatura do script não tem `--provenance` (`docs/00-contratos.md` §8): decidir se houve
  pesquisa é julgamento de sessão, não algo que um script sozinho calcula. O agente corrige o
  campo antes de escrever o corpo (§5 abaixo).

### 3.1 Por que o bloco cabe numa linha física

A forma multilinha do exemplo acima é só para não estourar a largura desta página em markdown.
No artefato real, o bloco **é uma única linha física**, sem quebra dentro do comentário HTML.
Testado nesta implementação: um range `sed -n '/<!-- study-method:meta/,/-->/p'` sobre um arquivo
com **outro** comentário HTML mais abaixo (por exemplo, um comentário instrucional do próprio
template) não fecha no primeiro `-->` — ele continua até o **último** `-->` do arquivo, porque a
checagem do padrão de fim começa na linha seguinte à do padrão de início, não na mesma linha.
Resultado: `jq` recebe um blob de várias linhas não relacionadas e falha com um parse error
obscuro ("Invalid numeric literal at line 3..."). Com o bloco preso a uma única linha física, a
extração vira `head -1 arquivo.md | sed 's/^<!-- study-method:meta //; s/ -->$//' | jq .` — sem
range, sem ambiguidade, sem depender de não haver outro comentário HTML no arquivo.

---

## 4. ⭐ A linha-resumo do `README.md` do setup

A seção `destilados` do `README.md` do setup lista "tópico + 1 linha + status" para cada research
(`docs/07-multi-setup.md` §4.1). Essa linha **nunca é escrita duas vezes**: não existe, e não
deve ser criado, um campo `one_line_summary` ou `title` redundante dentro do bloco de
proveniência.

A derivação é puramente mecânica, a partir de duas fontes que o arquivo já é obrigado a ter:

1. o bloco de proveniência (`research_id`, `topic`, `status`, `superseded_by`), via
   `head -1 | jq`;
2. o H1 do próprio arquivo (`^# `), que é obrigatório para o arquivo estar bem-formado (§3) —
   vira a coluna "1 linha".

```
meta  = head -1 researchs/NNNN.md | sed 's/^<!-- study-method:meta //; s/ -->$//' | jq .
title = primeira linha que casa '^# ' no arquivo, sem o prefixo
linha = "| researchs/NNNN.md | {meta.topic} | {title} | {status_col} |"
```

`status_col` é `active`, ou `superseded → researchs/{meta.superseded_by}.md` quando aplicável.
Isso é o que faz o índice sobreviver a `readme-sync.sh` sendo rodado do zero (o script é
reconstrutível por design, `docs/07-multi-setup.md` §4.2): nenhum dado que só existe "na cabeça
de quem escreveu" é necessário — tudo está no arquivo. Algoritmo completo, com truncamento de
célula e comportamento de estouro do teto de 200 linhas: `docs/build-spec/90-researchs.md` §5.

---

## 5. Proveniência e honestidade

Três origens possíveis, e cada uma tem um selo diferente (`provenance`,
`docs/00-contratos.md` §4.1):

| Origem | `provenance` | O que exige |
|---|---|---|
| Arquivo do `docs/` do setup (material do aluno) | `student_provided` | `sources[]` aponta para o caminho relativo à raiz do setup |
| Busca web **realizada nesta sessão** | `generated_researched` | opt-in explícito da sessão, consulta mostrada ao aluno antes de sair (`docs/11-seguranca-privacidade.md` §3.4); `sources[]` recebe as URLs consultadas |
| Conhecimento do próprio modelo, sem checagem externa | `generated_unsourced` | nenhuma condição — é o default seguro, e o aluno é avisado com todas as letras |

**Regra dura**: se a sessão não expôs nenhuma ferramenta de busca — depende do harness, nem toda
sessão tem uma — `generated_researched` está fora de cogitação **por construção**, não por
escolha de estilo. Marcar como pesquisado sem ter pesquisado é o tipo de mentira que este
documento existe para impedir. É por isso que o template nunca tenta adivinhar: nasce
`generated_unsourced` e só o agente, que sabe o que aconteceu na sessão, corrige.

Um destilado pode misturar as três. Quando mistura, `provenance` grava **a mais arriscada entre
as usadas de fato** — ordem crescente de risco: `student_provided` < `generated_researched` <
`generated_unsourced`. Um único trecho de conhecimento não verificado do modelo, mesmo que o
resto venha de fonte sólida, já muda o selo do documento inteiro para o valor mais conservador —
o leitor que só olha o bloco de proveniência não pode ser enganado por um trecho isolado. Quando
um trecho pontual vier de fonte diferente da dominante, uma nota curta entre parênteses no corpo
marca a exceção: `(fonte: busca web)`, `(fonte: conhecimento do modelo, não verificado)`.

---

## 6. Supersede

Um destilado errado ou superado **não é apagado, nem editado no lugar**. Mesma disciplina
bitemporal de `memory/profile.json` (`docs/03-memoria.md` §1, D-S06):

1. Novo arquivo aloca o próximo `NNNN` sequencial, com `supersedes: ["<antigo>"]`.
2. No arquivo antigo, só o **bloco de proveniência** muda: `status: "superseded"`,
   `superseded_by: "<novo>"`. O corpo não é reescrito.
3. Logo após o H1 do arquivo antigo, uma linha de aviso:
   `> Superseded por \`researchs/<novo>.md\`.`
4. O arquivo antigo continua no índice do `README.md` do setup (§4), anotado — nunca some.

O motivo de preservar o antigo é o mesmo de `profile.json`: um fato "corrigido" que simplesmente
desaparece apaga também o rastro de que o tutor um dia acreditou (e ensinou) a versão errada —
rastro que importa se o aluno voltar a um material antigo, ou se a correção precisar ser
questionada.

---

## 7. Onde ficam as figuras

`researchs/assets/<NNNN>-<slug>/` — contrato já congelado (A-18, `docs/00-contratos.md` §12;
detalhado em `docs/06-visualizacao.md` §4.7). `<slug>` é **o mesmo valor** do campo `topic` do
research a que a figura pertence — sem transformação, sem re-derivação: se `topic` é
`cancelamento-catastrofico`, o diretório é `researchs/assets/0003-cancelamento-catastrofico/`.

O markdown referencia a figura com caminho relativo à raiz de `researchs/` e **nunca sozinha**:

```
![Comparação entre tempo medido e a curva teórica O(n log n)](assets/0012-complexidade-merge-sort/comparacao.svg)

Os pontos medidos (dispersão laranja) acompanham a curva teórica n·log(n) escalada (linha azul)
com desvio abaixo de 8% até n = 100 000; a partir daí a dispersão medida se afasta por variação
de cache, dentro do esperado para medição fora de ambiente isolado.
```

A descrição textual junto da imagem não é ornamento — é o único canal por onde o próprio agente
sabe o que está referenciando: ele não enxerga o arquivo `.svg` que gerou
(`docs/06-visualizacao.md` §3, "Você não enxerga o arquivo que gerou"). Nem todo leitor futuro do
destilado vai abrir a figura antes de ler o texto, e um modelo relendo este arquivo numa sessão
futura também não "vê" a imagem — a prosa ao lado é o dado, a imagem é ilustração.

---

## 8. Nomeação: `NNNN.md`

O usuário pediu literalmente `0001.md`, `0002.md`, e é o que `docs/00-contratos.md` §3.1/§3.2 já
fixa como árvore canônica — sem slug no nome do arquivo (o slug mora só no diretório de assets,
§7). Mantido como está.

Nota de auditoria, não uma mudança: `docs/01-arquitetura.md` §1.2, `docs/03-memoria.md` §0/§9 e
`docs/06-visualizacao.md` §4.7 têm exemplos soltos escritos como
`researchs/0003-cancelamento-catastrofico.md` (com slug). São exemplos inconsistentes com a
árvore canônica — não uma segunda convenção válida — e valem correção onde aparecem, fora do
escopo deste documento.

---

## Exemplo completo de destilado

O arquivo abaixo é `researchs/0012.md` de um setup fictício de Algoritmos — mostra o estilo na
prática: sem introdução, definição primeiro, fórmula, snippet, armadilha, figura com descrição
real ao lado.

~~~markdown
<!-- study-method:meta {"schema_version":"1.0","kind":"research","research_id":"0012","topic":"complexidade-merge-sort","sources":["docs/algoritmos-cap4.md"],"provenance":"student_provided","created_in_session":"0009","created_at":"2026-08-23T15:10:00-03:00","status":"active","supersedes":[],"superseded_by":null,"verified_by_student":false,"disputed":false} -->

# Complexidade de tempo do merge sort

## Definição

Merge sort divide o vetor ao meio recursivamente até sobrarem elementos únicos, e depois
intercala (`merge`) os pares ordenados de volta, em `O(n)` por nível de intercalação.

## Fórmula

Recorrência: `T(n) = 2·T(n/2) + O(n)`, caso-base `T(1) = O(1)`.

Pelo teorema mestre (caso 2: `a = b^k`, aqui `a=2, b=2, k=1`): `T(n) = O(n log n)`, em todos os
casos — melhor, médio e pior. Diferente de quicksort, não há caso degenerado `O(n²)`.

## Exemplo mínimo

```python
def merge_sort(v):
    if len(v) <= 1:
        return v
    meio = len(v) // 2
    esq, dir = merge_sort(v[:meio]), merge_sort(v[meio:])
    r, i, j = [], 0, 0
    while i < len(esq) and j < len(dir):
        if esq[i] <= dir[j]:
            r.append(esq[i]); i += 1
        else:
            r.append(dir[j]); j += 1
    return r + esq[i:] + dir[j:]
```

## Armadilha

Merge sort **não é in-place** nesta forma: cada `merge` aloca listas novas, custando `O(n)` de
memória extra por nível — total `O(n)` (não `O(n log n)`, porque os níveis não coexistem na
pilha). Confundir "tempo `O(n log n)`" com "espaço `O(1)`" é o erro mais comum ao comparar com
heapsort, que é in-place.

![Comparação entre tempo medido e a curva teórica O(n log n)](assets/0012-complexidade-merge-sort/comparacao.svg)

Pontos medidos (dispersão) acompanham a curva teórica `n·log(n)` escalada (linha) com desvio
abaixo de 8% até `n = 100000`; a partir daí a dispersão se afasta por variação de cache, dentro
do esperado para medição fora de ambiente isolado.

## Ver também

`researchs/0007.md` — teorema mestre, forma geral.
~~~

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-R01 | `researchs/NNNN.md` × `researchs/NNNN-<slug>.md`? | (a) `NNNN.md`, sem slug — o que o usuário pediu e o que `docs/00-contratos.md` §3.1/§3.2 já fixa · (b) `NNNN-<slug>.md`, mais legível num `ls` bruto | **(a)** `NNNN.md` — pedido literal do usuário; o slug já existe, e basta, no diretório de assets (§7) | cheap — é `mv` em massa e atualizar os poucos exemplos divergentes citados em §8 |
| D-R02 | Destilar toda aula, ou só quando surge fato novo? | (a) todo turno de aula vira ≥1 research · (b) só quando há fato destilável novo · (c) 1 por sessão fechada, resumindo o que apareceu | **(b)** — já implícito em `docs/01-arquitetura.md` §2.3 ("destilado sob demanda"); evita que `researchs/` vire duplicata de `memory/INDEX.json` | cheap — é política de quando chamar `research-new.sh`, não muda schema |
| D-R03 | Versionar `researchs/` no git por padrão? | (a) livre, sem exclusão adicional no `.gitignore` gerado — já é o caso hoje, I-40 só exige a linha `memory/` · (b) excluir só `researchs/assets/*.png` (binário, regenerável a partir do `.svg`) · (c) tratar como `memory/`, opt-in | **(a) + (b)** — o texto (`.md`, `.svg`, `.html`, `.txt`) fica versionado por padrão, coerente com D-S01 (`docs/11-seguranca-privacidade.md`); só o `.png` opcional é candidato a exclusão, por ser puramente derivado | cheap — 1 linha a mais no template de `.gitignore`, se aprovado |
| D-R04 | Tamanho máximo de um `researchs/NNNN.md`? | (a) sem teto, confiar na densidade do estilo · (b) teto suave (~150 linhas), sinal para dividir em dois destilados · (c) teto rígido, script recusa acima disso | **(b)** — teto rígido penaliza um teorema legitimamente longo com muitas condições de borda; teto suave, cobrado no checklist do agente (`SK/references/researchs.md`), é fiel ao espírito "denso, nunca raso" | cheap — é regra de prosa, não de schema |
| D-R05 | Idioma do corpo do destilado? | (a) sempre pt-BR, termos técnicos como empréstimo do inglês — regra geral de `docs/00-contratos.md` §4 · (b) espelha o idioma de `sources[]` quando há fonte · (c) inglês sempre, por ser o idioma dominante da documentação técnica | **(a)** — é a regra de idioma já congelada para todo texto livre do projeto; criar uma exceção só para `researchs/` abriria uma terceira convenção sem necessidade | cheap — é só disciplina de prosa, sem impacto em schema ou script |
