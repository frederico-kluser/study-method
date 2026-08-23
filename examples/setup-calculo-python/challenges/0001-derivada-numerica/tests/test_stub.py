# tests/test_stub.py — a especificação executável deste desafio. Leia; não edite.
import unittest

from stub import derivada

TOL = 1e-9


class TestStub(unittest.TestCase):
    def test_afim_e_exata(self):
        """Para f(x) = 3x + 1 a diferença centrada devolve 3 sem erro nenhum."""
        obtido = derivada(lambda x: 3 * x + 1, 10.0, 0.25)
        self.assertAlmostEqual(
            obtido, 3.0, delta=TOL,
            msg=f"cenario afim_e_exata: derivada(3x+1, x=10, h=0.25) devolveu {obtido!r}, "
                f"esperado 3.0. Numa reta a inclinação é a mesma em todo ponto, e a "
                f"diferença centrada acerta em cheio para qualquer h.",
        )

    def test_quadratica_e_exata(self):
        """Para f(x) = x**2 a diferença centrada devolve 2x mesmo com h grande."""
        obtido = derivada(lambda x: x ** 2, 1.0, 0.5)
        self.assertAlmostEqual(
            obtido, 2.0, delta=TOL,
            msg=f"cenario quadratica_e_exata: derivada(x**2, x=1, h=0.5) devolveu {obtido!r}, "
                f"esperado 2.0. Os termos de erro de ordem par se cancelam na diferença "
                f"centrada, então em grau 2 ela é exata para qualquer h.",
        )

    def test_constante_da_zero(self):
        """Função constante tem derivada zero: o numerador cancela exatamente."""
        obtido = derivada(lambda x: 7.0, 5.0, 0.25)
        self.assertAlmostEqual(
            obtido, 0.0, delta=TOL,
            msg=f"cenario constante_da_zero: derivada(7, x=5, h=0.25) devolveu {obtido!r}, "
                f"esperado 0.0. Se o numerador não zera aqui, os dois pontos não estão "
                f"sendo subtraídos um do outro.",
        )

    def test_ponto_negativo(self):
        """A fórmula não pode assumir x positivo: em x = -4 a derivada de x**2 é -8."""
        obtido = derivada(lambda x: x ** 2, -4.0, 0.5)
        self.assertAlmostEqual(
            obtido, -8.0, delta=TOL,
            msg=f"cenario ponto_negativo: derivada(x**2, x=-4, h=0.5) devolveu {obtido!r}, "
                f"esperado -8.0.",
        )

    def test_cubica_tem_erro_de_ordem_h2(self):
        """Em grau 3 sobra erro h**2: em x=2, h=0.5 o valor exato é 12.25, não 12."""
        obtido = derivada(lambda x: x ** 3, 2.0, 0.5)
        self.assertAlmostEqual(
            obtido, 12.25, delta=TOL,
            msg=f"cenario cubica_tem_erro_de_ordem_h2: derivada(x**3, x=2, h=0.5) devolveu "
                f"{obtido!r}, esperado 12.25 = 3*2**2 + 0.5**2. A derivada analítica é 12; "
                f"o 0.25 de sobra é o erro de truncamento h**2, e ele é parte da resposta "
                f"certa desta fórmula.",
        )

    def test_passo_negativo_da_o_mesmo(self):
        """Trocar h por -h não muda nada: a diferença centrada é ímpar em h dos dois lados."""
        f = lambda x: x ** 3
        positivo = derivada(f, 2.0, 0.5)
        negativo = derivada(f, 2.0, -0.5)
        self.assertAlmostEqual(
            positivo, negativo, delta=TOL,
            msg=f"cenario passo_negativo_da_o_mesmo: h=+0.5 devolveu {positivo!r} e h=-0.5 "
                f"devolveu {negativo!r}. Trocar o sinal de h troca o sinal do numerador E do "
                f"denominador; se os dois não mudam juntos, um dos dois lados está errado.",
        )


if __name__ == "__main__":
    unittest.main()
