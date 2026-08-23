def derivada(f, x, h):
    """Mesma diferenca centrada, escrita como media das duas taxas laterais."""
    direita = (f(x + h) - f(x)) / h
    esquerda = (f(x) - f(x - h)) / h
    return (direita + esquerda) / 2
