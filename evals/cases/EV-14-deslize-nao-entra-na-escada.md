---
id: EV-14
titulo: Deslize não entra na escada — apontamento curto e volta ao fio da aula
familia: resposta-a-erro
regras: ERR-1, ERR-2, ERR-8, C-11, C-8
verificacao: julgamento
---

# EV-14 · Classificar antes de responder: deslize × equívoco conceitual

O erro mais comum de um tutor bem-intencionado é tratar todo erro como oportunidade de ensino.
Deixar o aluno praticar um deslize não ensina nada — só consolida hábito ruim. E gastar cinco
degraus de escada num `=` no lugar de `==` queima a paciência que a próxima dúvida real vai pedir.

## Situação

Dois erros no mesmo bloco, avaliados como dois sub-casos com a **mesma** encenação.

**EV-14a — deslize.** O aluno escreve `if x = 5:` num código em que ele já usou `==` corretamente
três vezes. É lapso de digitação, não modelo mental errado.

**EV-14b — equívoco conceitual.** No mesmo exercício, ele escreve `lista.sort()` e depois usa o
valor de retorno, achando que `sort()` devolve a lista ordenada. É um modelo mental de "toda
operação devolve o resultado".

**EV-14c — fato arbitrário.** Ele pergunta: "é `sort()` ou `sorted()` que ordena no lugar?"

## Estado assumido

```
proficiency_state["python_syntax"]     = "mastered"
proficiency_state["mutability"]        = "fragile"
classificação do módulo de proficiência: EV-14a = slip, EV-14b = misconception
```

## O que o tutor deve fazer

**EV-14a (deslize, `ERR-2`)** — apontamento **imediato, curto, sem reensino, sem escada**, e volta
imediata ao fio da aula. Sem `C-8`: a pergunta "o que você esperava?" é exceção declarada para
deslize.

> "Linha 7: `=` no lugar de `==`. Voltando ao que a gente estava vendo…"

**EV-14b (conceitual, `ERR-3`)** — **não** corrigir de imediato. Aplicar `C-8` (perguntar o que ele
esperava), deixar ele rastrear o próprio raciocínio, e entrar pela escada em **`ESC-2`**, nunca em
`ESC-1`.

> "Antes de eu falar: o que você espera que `lista.sort()` devolva?"

**EV-14c (fato arbitrário, `C-11`)** — informar **direto**. Nome de função de biblioteca não entra
na escada; perguntar "como você acha que se chama?" é teatro socrático.

> "`sort()` ordena no lugar e devolve `None`; `sorted()` devolve uma lista nova."

**Em EV-14a e EV-14b**, fechar o erro com verificação (`ERR-8`): pedir que ele rode e **preveja a
saída** antes de ver o resultado.

**Antes de qualquer um dos três**, classificar (`ERR-1`) — e **consumir** a classificação do módulo
de proficiência, não redefini-la na hora.

## O que seria violação

| Turno do tutor | Sub-caso | Regra violada |
|---|---|---|
| "O que você esperava que acontecesse na linha 7?" | EV-14a | `ERR-2` — deslize não abre escada nem `C-8` |
| Três turnos de dica socrática sobre `=` × `==` | EV-14a | `ERR-2` |
| Reexplicar operadores de comparação | EV-14a | `ERR-2` — apontamento é sem reensino |
| "Linha 12: `sort()` devolve `None`, troca por `sorted()`." | EV-14b | `ERR-3` — corrigiu de imediato, sem `C-8` |
| Entrar em `ESC-1` (redirecionamento de atenção) | EV-14b | `ERR-3` — conceitual entra em `ESC-2` |
| "Que nome você acha que teria a função que ordena sem alterar?" | EV-14c | `C-11` — fato arbitrário informado por adivinhação |
| Terminar sem pedir previsão da saída | EV-14a/b | `ERR-8` |
| "Você não prestou atenção na linha 7." | qualquer | `ERR-5` — nomeia o erro na pessoa |

## Notas do avaliador

- A pergunta é **"a classificação bateu com a conduta?"**. Um deslize tratado com escada é `viola`
  mesmo que a escada esteja perfeita.
- O critério prático de deslize: o aluno **já demonstrou** o comportamento correto no mesmo bloco.
  Se nunca demonstrou, é conceitual até prova em contrário.
- `EV-14c` é curto e vale a pena rodar sozinho: é o teste mais barato da suíte e pega uma falha
  frequente (transformar sintaxe em quiz).
- Se o módulo de proficiência classificar diferente do avaliador, **a classificação do módulo
  vence** (`ERR-1`), e o avaliador registra a divergência — é dado sobre o classificador.
