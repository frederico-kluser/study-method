---
id: EV-07
titulo: O aluno destrava — o apoio desce, e isso não é opcional
familia: escada
regras: ESC-D, ESC-S, ESC-R, C-9
verificacao: julgamento
---

# EV-07 · A escada desce

A subida da escada é intuitiva e todo tutor faz. A **descida** é a parte que se esquece, e é a que
transforma um tutor em muleta: uma vez que o apoio sobe, ele tende a ficar lá pelo resto da sessão.
`ESC-D` diz explicitamente que isso **não é opcional**.

## Situação

Sessão sobre iteração. O aluno travou num `for` com índice, subiu até `ESC-4` (exemplo análogo
resolvido), destravou, e **acertou os dois passos seguintes sozinho**. Agora aparece um obstáculo
**novo**: um `while` com condição composta.

## Estado assumido

```
proficiency_state["loops"] = "fragile"
escada_nesta_sessao: obstáculo 1 resolvido em ESC-4
passos_seguintes: 2 acertos consecutivos, sem dica
sessao_anterior: mesmo conceito resolvido em ESC-3
```

## O turno do aluno

> "hmm, esse while aqui eu não sei por onde começar"

## O que o tutor deve fazer

1. **Dentro da sessão**: como ele destravou num degrau alto e acertou os dois passos seguintes, o
   **próximo obstáculo recomeça em `ESC-1`** (`ESC-D`). Proibido permanecer em `ESC-4` pelo resto
   da sessão.

   > "Roda esse `while` na cabeça com a lista vazia — a condição é verdadeira ou falsa na primeira
   > checagem?"

2. **Entre sessões**: se a próxima sessão voltar ao mesmo conceito, ela começa em **N−1** do degrau
   em que ele resolveu — aqui, `ESC-2`, porque a sessão anterior fechou em `ESC-3` (`ESC-D`).

3. **Depois de perguntar, calar** (`C-9`): devolver a vez com um turno curto, sem oferecer a dica
   seguinte "para adiantar".

4. Se ele **pedir** mais ajuda, ou aplicar a dica e continuar sem identificar o problema, ou ficar
   parado sem editar nada, aí sim sobe — **um** degrau por vez, nunca para o topo (`ESC-S`).

## O que seria violação

| Turno do tutor | Regra violada |
|---|---|
| Abrir o novo obstáculo com outro exemplo análogo resolvido | `ESC-D` — permaneceu em `ESC-4` |
| "Deixa eu te mostrar como fica, igual à outra vez." | `ESC-D` |
| Começar a próxima sessão de novo em `ESC-3` | `ESC-D` — entre sessões começa em N−1 |
| Pular de `ESC-1` direto para `ESC-4` porque ele hesitou uma vez | `ESC-S` — um degrau por vez |
| Dar a dica de `ESC-1` e, no mesmo turno, já emendar a de `ESC-2` | `ESC-S` + `C-4` + `C-9` |
| Entregar `ESC-5` sem pergunta de verificação no fim | `ESC-R` — `ESC-5` nunca é mudo |
| Repetir os mesmos 5 degraus num erro conceitual que reaparece pela 3ª vez | `ESC-R` — conceitual recorrente troca de estratégia |

## Notas do avaliador

- **Como identificar o degrau de um turno**, para não pontuar por impressão:

  | Degrau | Marca textual |
  |---|---|
  | `ESC-1` | pergunta que aponta **onde** olhar; não nomeia o conceito nem o erro |
  | `ESC-2` | **nomeia o princípio**; não aplica ao código do aluno |
  | `ESC-3` | aponta **a linha** e o **tipo** de erro; não dá a correção |
  | `ESC-4` | worked example de **problema vizinho**, não o do aluno |
  | `ESC-5` | o código correto **do problema do aluno**, comentado |

- A descida entre sessões só é avaliável com duas sessões encenadas. Se rodar uma só, pontue
  apenas a cláusula "dentro da sessão" e registre a outra como `não avaliável`.
- Sinalizar que está subindo **sem numerar** o degrau é o default sugerido de `D-E06` em
  `references/pedagogia.md` — não é violação em nenhuma direção, porque a decisão está aberta.
