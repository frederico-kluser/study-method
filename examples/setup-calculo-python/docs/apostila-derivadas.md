# Anotações da apostila — capítulo 3: derivadas

## 3.1 Taxa de variação média

Para uma função `f` e dois pontos `x` e `x + h`, a taxa de variação média no intervalo é

    (f(x + h) - f(x)) / h

Ela é a inclinação da reta secante que passa pelos dois pontos.

## 3.2 Derivada

A derivada de `f` em `x` é o limite da taxa de variação média quando `h` tende a zero:

    f'(x) = lim (h -> 0) (f(x + h) - f(x)) / h

Quando o limite existe, `f` é derivável em `x`, e `f'(x)` é a inclinação da reta
tangente ao gráfico de `f` no ponto `x`.

## 3.3 Regra da potência

    d/dx (x^n) = n * x^(n-1)     para todo n real

## 3.4 Regra da cadeia

    d/dx f(g(x)) = f'(g(x)) * g'(x)

## 3.5 Exercícios do capítulo

1. Calcule `f'(1)` para `f(x) = x^2` pela definição.
2. Calcule `f'(2)` para `f(x) = x^3` pela definição.
3. Derive `h(x) = (3x + 1)^4` pela regra da cadeia.
