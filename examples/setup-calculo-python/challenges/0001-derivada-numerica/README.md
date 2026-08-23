# Desafio 0001 — derivada numérica pela diferença centrada

`challenges/0001-derivada-numerica/` · linguagem: **python**

## O problema

Implemente `derivada(f, x, h)`: a derivada numérica de `f` no ponto `x` com passo `h`, pela
**diferença centrada**

    (f(x + h) - f(x - h)) / (2 * h)

Ela olha um passo para cada lado do ponto, em vez de só para a frente. Isso custa uma avaliação
a mais de `f` e paga: o erro cai com `h**2` em vez de `h`, e para polinômios de grau até 2 o
resultado é exato mesmo com `h` grande.

Edite **somente** o arquivo `stub.py`. O arquivo `tests/test_stub.py` é a especificação: leia à
vontade, não precisa alterar.

Se você acha que o teste está errado, me diga — testes gerados automaticamente erram, e eu revalido.

## O que este teste cobre — e o que ele não cobre

Nenhum teste consegue prometer cobertura de toda entrada possível: decidir a resposta certa para
qualquer entrada imaginável de uma função não é computável em geral (é o *problema do oráculo*).
O que este teste cobre é esta lista **fechada e nomeada** de cenários. Leia antes de começar: é
exatamente o que está sendo cobrado, nem mais nem menos.

| Cenário | Tipo | O que ele cobra |
|---|---|---|
| `afim_e_exata` | example | Para `f(x) = 3x + 1` a diferença centrada devolve 3 exatamente, para qualquer `h`. |
| `quadratica_e_exata` | example | `derivada(x**2, 1, 0.5)` vale 2.0 exato: os termos de erro de ordem par se cancelam. |
| `constante_da_zero` | boundary | Função constante tem derivada zero; o numerador precisa cancelar exatamente. |
| `ponto_negativo` | boundary | Em `x = -4` a derivada de `x**2` é `-8`: a fórmula não pode assumir `x` positivo. |
| `cubica_tem_erro_de_ordem_h2` | example | `derivada(x**3, 2, 0.5)` vale **12.25**, e não 12 — o `0.25` é o erro de truncamento `h**2`. |
| `passo_negativo_da_o_mesmo` | metamorphic | Trocar `h` por `-h` não muda o resultado. |

O quanto esses cenários realmente discriminam uma solução certa de uma errada não é uma promessa
— é um número medido por execução (o *mutation score*, em `meta.json`). Um score alto não é
"completo"; é "o teste distingue a referência de N variações mecânicas dela".

## Como rodar

```
./runner.sh
```

O **único** arquivo que você edita é `stub.py`. O arquivo em `tests/` você lê — é a especificação
executável — mas não deve editar; e tudo dentro de `.solution/` é oculto de propósito e não deve
ser aberto antes da hora.

## Se você acha que o teste está errado

Se você acha que o teste está errado, me diga — testes gerados automaticamente erram, e eu
revalido. Isso não é cortesia: um teste que nasceu do mesmo raciocínio que a implementação de
referência pode ter herdado o mesmo engano, e quem primeiro percebe isso costuma ser quem está
tentando resolver o problema, não quem o escreveu.
