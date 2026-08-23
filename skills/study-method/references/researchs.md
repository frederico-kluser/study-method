# `researchs/` — quando e como destilar

`researchs/` é o fato que sobrevive à sessão; `memory/` é o que aconteceu nela. Se uma frase só
faz sentido sabendo *quando* foi dita, ela é `memory/`, não aqui. Racional completo e exemplo
trabalhado: `docs/13-researchs.md` do repositório (o aluno nunca vê esse arquivo).

## Sumário
Quando criar um destilado · O que entra / o que nunca entra · Como alocar o arquivo ·
Proveniência — o que você preenche · Estilo: checklist antes de considerar pronto · Figuras ·
Supersede · Decisões abertas geradas aqui

## Quando criar um destilado

Não é todo turno de aula. Crie `researchs/NNNN.md` quando existir um fato **destilável**:
definição, fórmula, snippet mínimo, contraexemplo, armadilha — algo que valeria reler numa
sessão futura, sem o contexto de hoje. Sinal prático: se o próximo tópico da taxonomia depende
deste fato, ele quase sempre merece um destilado.

Não crie um para: uma explicação que só fez sentido pela forma como o aluno perguntou; um
exemplo que só ilustrou, sem densidade nova; um fato que já existe em outro `researchs/NNNN.md`
sem mudar — nesse caso, referencie o existente na conversa, não duplique.

## O que entra / o que nunca entra

**Entra**: definição, axioma, teorema com condição de validade, fórmula, snippet mínimo
executável, contraexemplo, armadilha comum. Densidade máxima, zero verbosidade.

**Nunca entra**: narrativa de sessão ("hoje você travou em..."), estado afetivo, nota de
desempenho, data da aula, nome do aluno — qualquer coisa cuja origem de verdade é `memory/`.

## Como alocar o arquivo

`research-new.sh <setup_root> --topic <slug> [--sources <csv>] [--session <NNNN>]` aloca o
próximo `NNNN`, materializa o template com o bloco de proveniência preenchido, e imprime o
caminho. Você edita o arquivo depois: o script não escreve o corpo, não pesquisa, e não sabe se
você pesquisou.

`<slug>` é kebab-case (`inducao-matematica`, não `inducao_matematica`) — não confunda com
`concept_id` (`inducao_matematica`, snake_case), que é outro namespace. É o mesmo texto que vira
o `<slug>` de `researchs/assets/<NNNN>-<slug>/` se a figura existir, sem transformação.

## Proveniência — o que você preenche

O bloco nasce com `"provenance":"generated_unsourced"`. Antes de escrever o corpo, corrija:

- **`student_provided`** — o fato vem de um arquivo do `docs/` do setup, listado em `sources[]`
  (caminho relativo à raiz do setup).
- **`generated_researched`** — você chamou a ferramenta de busca **nesta sessão**, com consulta
  reformulada e mostrada ao aluno antes de sair (opt-in por sessão). `sources[]` recebe as URLs
  consultadas.
- **`generated_unsourced`** — conhecimento próprio, sem arquivo local nem busca. Fica assim
  mesmo, e o aluno é avisado com todas as letras: "não pesquisei isso, é o que eu sei".

Nunca marque `generated_researched` sem ter chamado a ferramenta de verdade nesta sessão — não
existe pesquisa "de memória".

Um destilado pode misturar fontes; quando isso acontece, `provenance` grava a mais arriscada
entre as usadas de fato — ordem crescente de risco: `student_provided` < `generated_researched`
< `generated_unsourced`. Se um trecho pontual veio de fonte diferente da dominante, marque com
uma nota curta entre parênteses, ex.: `(fonte: busca web)`.

## Estilo: checklist antes de considerar pronto

- [ ] Título é o conceito, não a slug crua nem uma pergunta.
- [ ] Primeira frase é o fato — nada de "neste documento", "vamos ver", saudação.
- [ ] Nenhuma seção "Resumo" / "Conclusão" / "Introdução" / "Contexto" / "Motivação".
- [ ] Nenhum parágrafo acima de 4 linhas; prefira definição, tabela ou snippet a prosa corrida.
- [ ] Nenhum adjetivo de opinião não técnica ("interessante", "poderoso", "elegante").
- [ ] `provenance` reflete o que realmente aconteceu nesta sessão (seção acima).
- [ ] Toda imagem vem com 1–3 linhas de descrição real ao lado — nunca inventada.

Lista completa de regras, com exemplos de abertura ruim e boa lado a lado:
`docs/13-researchs.md` §2 do repositório. Amostra rápida, mesmo tópico:

> **Ruim**: "Neste destilado vamos explorar o conceito de recursão, que é um dos temas mais
> importantes da programação. Antes de mais nada, é importante entender que..."
>
> **Boa**: "Recursão é uma função que se chama para resolver uma versão menor do mesmo
> problema, até um caso-base que não recorre."

Se a primeira frase do corpo não seria a primeira frase de um verbete de dicionário técnico,
reescreva.

## Figuras

`--out-dir researchs/assets/<NNNN>-<slug>/` sempre — nunca `/tmp` (some no reboot), nunca
`<sessão>/viz/` (sessão é arquivo `memory/NNNN.json`, não diretório). Se a figura ainda não
pertence a nenhum research, crie o research primeiro.

## Supersede

Fato envelheceu ou estava errado? Não se edita no lugar. Aloca-se `NNNN` novo com
`supersedes:["<antigo>"]`. No antigo, só o bloco de proveniência muda
(`status:"superseded"`, `superseded_by:"<novo>"`) e uma linha `> Superseded por
\`researchs/<novo>.md\`.` entra logo após o título. O corpo antigo não é reescrito — é o registro
do que se acreditava antes, preservado por auditoria, na mesma disciplina de `memory/profile.json`.

## Decisões abertas geradas aqui

Conjunto completo (D-R01 a D-R05) em `docs/13-researchs.md` (repositório). O que muda o
comportamento em aula, hoje, com os defaults sugeridos: arquivo é `NNNN.md`, sem slug (D-R01);
destilado só quando há fato novo, nunca um por interação (D-R02); tamanho não tem teto rígido
ainda — se passar de ~150 linhas, é sinal de que devia virar dois destilados (D-R04).
