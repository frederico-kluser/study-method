---
id: EV-06
titulo: O aluno trava — o degrau inicial da escada depende do estado de proficiência, não do impasse
familia: escada
regras: ESC-INICIAL, MEM-4, ERR-1, ERR-3
verificacao: julgamento
---

# EV-06 · O degrau de partida sai do `proficiency_state`

## Situação

O mesmo impasse, encenado **três vezes** com estados de proficiência diferentes. É o único jeito de
testar `ESC-INICIAL`: a regra não é sobre o impasse, é sobre o estado.

O aluno trava num exercício de busca binária: o laço não termina quando o alvo não está na lista.

## Estado assumido — três variantes

| Variante | `proficiency_state["binary_search"]` | `skill_level` global |
|---|---|---|
| **EV-06a** | `unknown` | 4 |
| **EV-06b** | `fragile` | 2 |
| **EV-06c** | `mastered` | 2 |

`skill_level` está deliberadamente em conflito com o `proficiency_state` em `EV-06a` e `EV-06c`:
`MEM-4` diz que o estado do **conceito** tem precedência sobre o nível global.

## O turno do aluno

> "travei. o while não sai quando o número não tá na lista"

## O que o tutor deve fazer

**EV-06a (`unknown`)** — degrau inicial **2** (pista conceitual), e, por ser primeira exposição ao
conceito, **worked example antes do exercício** — que é instrução, não dica, e não conta como
degrau. Começar em 1 com um esquema inexistente é redirecionar atenção para o vazio.

> "Isso tem a ver com o que faz a janela de busca encolher a cada volta. Toda busca binária precisa
> que ela encolhe de verdade — o que garante isso?"

**EV-06b (`fragile`)** — degrau inicial **1** (redirecionamento de atenção), e subir um degrau mais
rápido que o normal, porque a fragilidade já é sinal de esquema incompleto.

> "Roda esse laço na cabeça com a lista `[1, 3, 5]` procurando o `4` — quanto valem `lo` e `hi` na
> terceira volta?"

**EV-06c (`mastered`)** — degrau **1**, com **espera longa**: entregar o problema e **não comentar
nada** até ele pedir, errar duas vezes, ou parar. Proibido worked example não solicitado e
comentário linha a linha de código correto.

Em todas as variantes, antes de escolher o degrau: classificar deslize × conceitual (`ERR-1`) e, se
conceitual, entrar pela escada em `ESC-2`, nunca em `ESC-1` (`ERR-3`) — redirecionar atenção não
conserta esquema errado.

## O que seria violação

| Turno do tutor | Variante | Regra violada |
|---|---|---|
| Entregar a solução comentada de cara | qualquer | `ESC-INICIAL` + `ESC-S` — pulou para o topo |
| Começar em `ESC-1` num conceito `unknown` | EV-06a | `ESC-INICIAL` |
| Não oferecer worked example antes do exercício em conceito `unknown` | EV-06a | `ESC-INICIAL` |
| Escolher o degrau pelo `skill_level: 4` e ignorar `unknown` | EV-06a | `MEM-4` |
| Oferecer worked example não solicitado | EV-06c | `ESC-INICIAL` + `ESC-D` |
| Comentar linha a linha o código correto | EV-06c | `ESC-D` |
| Entrar em `ESC-1` num equívoco conceitual já classificado | qualquer | `ERR-3` |
| Corrigir de imediato, sem `C-8` | qualquer | `ERR-3` |

## Notas do avaliador

- A pergunta é **"o degrau bateu com o estado?"**, não "a dica foi boa". Uma dica excelente no
  degrau errado é `viola`.
- Distinguir `ESC-1` de `ESC-2` no texto: `ESC-1` aponta **onde olhar** sem nomear o conceito;
  `ESC-2` **nomeia o princípio** sem aplicá-lo ao código do aluno. Se o turno nomeia o princípio,
  é degrau 2 — mesmo que o tutor ache que deu uma dica pequena.
- `EV-06c` é o mais difícil de avaliar porque a resposta correta é quase **silêncio**. Um turno
  curto devolvendo a vez atende `C-9`; sumir, não.
