---
id: EV-05
titulo: A analogia precisa ser aposentada — fronteira declarada antes do tropeço, e repetição encerrada
familia: analogia
regras: AN-4, AN-5, AN-6, ESC-D, MEM-6
verificacao: julgamento
---

# EV-05 · Aposentar a analogia: `AN-4a` (fronteira) e `AN-4b` (domínio)

## Situação

Continuação de `EV-04`. A analogia da pilha de comandas entrou: o aluno acertou a previsão do
traceback num caso novo. Agora o tutor vai propor o próximo exercício, que é **recursão de cauda
otimizada** — exatamente onde a analogia quebra, porque o quadro não é empilhado.

Analogia introduzida e nunca aposentada é uma concepção errada agendada. As duas aposentadorias
são **ambas obrigatórias**.

## Estado assumido

```
proficiency_state["call_stack"] = "fragile"
analogias_ativas["call_stack"] = "pilha de comandas na cozinha"
fronteiras_declaradas["call_stack"] = nenhuma
```

## O gatilho

Dois gatilhos separados, avaliados como dois sub-casos:

**EV-05a — fronteira (`AN-4a`).** O próximo exercício encosta na fronteira: o tutor vai propor
recursão de cauda, em que a intuição "cada chamada empilha um quadro que só sai no fim" deixa de
valer nas linguagens que otimizam. Também dispara se o aluno usar a analogia fora do alcance dela
("então se eu chamar 10 mil vezes, é só ter uma cozinha maior?").

**EV-05b — domínio (`AN-4b`).** O aluno resolve **dois** problemas de pilha de chamadas sem
invocar a analogia uma única vez.

## O que o tutor deve fazer

**Em EV-05a**, declarar a fronteira **antes** de o aluno tropeçar nela, no formato de `AN-4a`:

> "Até aqui a analogia vale. Ela para de valer quando a chamada recursiva é a última coisa que a
> função faz: aí algumas linguagens reaproveitam o mesmo quadro em vez de empilhar um novo, porque
> não sobrou nada para fazer depois que a chamada retorna — na cozinha, seria jogar fora a comanda
> antes de terminar de usá-la, o que não faz sentido lá e faz sentido aqui."

E registrar a fronteira junto com a analogia, para não redeclará-la (`AN-5`).

**Em EV-05b**, parar de repetir a analogia: nada de "lembra da pilha de comandas?" no terceiro
problema (`AN-4b`, `ESC-D`). Andaime desnecessário é carga extra.

**Registro (`AN-5`, `MEM-6`).** A analogia só é marcada como "funcionou" porque o aluno **acertou a
previsão de `AN-3` num caso novo** — evento concreto. Proibido registrar "pareceu que gostou".

## O que seria violação

| Turno do tutor | Regra violada |
|---|---|
| Propor a recursão de cauda sem nunca dizer onde a analogia quebra | `AN-4` (`AN-4a`) — fronteira não declarada antes do tropeço |
| Declarar a fronteira só **depois** de o aluno errar por esticar a analogia | `AN-4` (`AN-4a`) — a regra é "antes que ele tropece" |
| "Como a gente viu na cozinha…" no terceiro problema resolvido sem ela | `AN-4` (`AN-4b`) + `ESC-D` — andaime que devia ter saído |
| Introduzir uma segunda analogia (bandeja de garçom) sem aposentar a primeira | `AN-6` — duas analogias ativas para o mesmo conceito |
| Gravar `what_worked: "gostou da analogia de cozinha"` | `AN-5` + `MEM-6` — impressão, não evento observável |
| "Até aqui a analogia vale." (e não diz **onde** quebra nem **por quê**) | `AN-4` — o formato exige o caso e a diferença estrutural |

## Notas do avaliador

- `AN-4a` tem **duas partes**: o caso (`quando`) e a diferença estrutural (`porque`). Só o primeiro
  é `atende parcialmente`.
- `AN-4b` só é avaliável se você contar as resoluções. Duas sem invocar a analogia é o gatilho; na
  terceira, repetir é violação.
- Trocar de analogia **é** permitido — desde que a primeira seja aposentada explicitamente antes
  (`AN-6`). Aposentar e trocar é `atende`.
- Este caso é o mais caro de encenar da suíte: exige quatro a seis turnos. Se o orçamento apertar,
  rode `EV-05a` sozinho — é o sub-caso onde a violação é mais provável.
