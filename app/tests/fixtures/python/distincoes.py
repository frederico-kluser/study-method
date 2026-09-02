# tests/fixtures/python/distincoes.py — AS DOZE DISTINÇÕES QUE O `ast` ESCONDE.
#
# Fonte NORMATIVA: `docs/17-trilha-python.md`, §"O que o `ast` esconde".
# Cada bloco aqui é o caso MÍNIMO de uma distinção que o `ast` do CPython
# colapsa e que o adaptador tem de refinar por CHAVE SINTÉTICA. Sem o
# refinamento, uma aula inteira introduziria ZERO construção nova (violação da
# regra A6) ou cobraria algo que nenhuma aula anterior ensinou.
#
# Este arquivo NÃO é executado — é entrada do parser. Ele parseia, e isso é
# tudo o que se pede dele.

import math

# 1. número · texto · booleano · None · decimal — TUDO é `ast.Constant`.
inteiro = 7
texto = "olá, ação"
booleano = True
nada = None
decimal = 3.5

# 10. `a, b = 1, 2` tem a MESMA AST de `x = 1` no eixo de nós.
primeiro, segundo = 1, 2

# formas de ligação restantes do eixo `decl:`
anotado: int = 0
anotado += 1
if (achado := math.floor(decimal)) > 0:
    pass


def classifica(valor, limite=10, *extras, **opcoes):
    """2/3/4/5/6/7/8/12 — as distinções que dependem de campo, não de tipo."""
    global inteiro
    # 2. `elif` × 3. `if` com `else` — a AST do `elif` é IDÊNTICA à de
    #    `else:` seguido de `if`; só o `col_offset` do `If` interno difere.
    if valor > limite:
        resultado = "acima"
    elif valor == limite:
        resultado = "igual"
    else:
        resultado = "abaixo"

    # 4. `for` com `else` (e o `while` com `else` logo abaixo).
    for extra in extras:
        if extra is None:
            break
    else:
        resultado = resultado + "!"

    contador = 0
    while contador < 1:
        contador += 1
    else:
        contador = 0

    # 5. `try` com `finally` · 6. `except ... as e`.
    try:
        conversao: int | None = int(valor)
    except ValueError as erro:
        conversao = None
        print(erro)
    finally:
        opcoes.clear()

    return resultado, conversao, achado


def dobro(valor):
    return valor * 2


class Conta:
    """9. decorador · 11. método × função (e os dunders da trilha)."""

    def __init__(self, saldo):
        self.saldo = saldo

    @property
    def dobrado(self):
        return dobro(self.saldo)

    def __str__(self):
        return "Conta(" + str(self.saldo) + ")"

    def sacar(self, quanto):
        self.saldo -= quanto
        return self.saldo


# 12. `int | None` em ANOTAÇÃO × `|` bit a bit — os dois são `BinOp(BitOr)`.
mascara = 0b1010 | 0b0101


def anotada(x: int | None) -> str | None:
    return None if x is None else str(x)


def contador_externo():
    """`nonlocal` — a 11ª forma de ligação do eixo `decl:`."""
    total = 0

    def somar(quanto):
        nonlocal total
        total += quanto
        return total

    return somar
