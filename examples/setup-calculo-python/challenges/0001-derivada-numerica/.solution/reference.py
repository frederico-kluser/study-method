def derivada(f, x, h):
    """Derivada numerica de f em x com passo h. Devolva o valor; nao imprima nada."""
    frente = f(x + h)
    tras = f(x - h)
    return (frente - tras) / (2 * h)
