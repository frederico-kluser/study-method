def derivada(f, x, h):
    """Mesma diferenca centrada, com a divisao por 2 fora da divisao por h."""
    return (f(x + h) - f(x - h)) / h / 2
