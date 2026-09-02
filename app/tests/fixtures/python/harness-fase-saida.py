# FIXTURE — o arquivo `tests/test_solucao.py` da FASE SAÍDA (M1 a M3).
#
# Copiado VERBATIM de `docs/17-trilha-python.md` §"O formato exato do arquivo de
# teste — FASE SAÍDA". É `frozenRegion` inteira: o aluno lê, nunca edita — e é
# por isso que toda chave que ele emite tem de estar na semente RECEPTIVA
# (`PYTHON_HARNESS_RECEPTIVE_SEED`), sob pena de a aula 1 reprovar em A3 por
# causa do próprio harness.
#
# NÃO tem `if __name__ == "__main__": unittest.main()` de propósito: o runner é
# `unittest discover`, que nunca executa esse bloco, e ele custaria seis chaves
# receptivas na aula 1 por zero efeito.
import contextlib
import io
import runpy
import unittest


def rodar():
    """Roda solucao.py do zero e devolve tudo o que ele imprimiu."""
    saida = io.StringIO()
    with contextlib.redirect_stdout(saida):
        runpy.run_path("solucao.py")
    return saida.getvalue()


class TestAPrimeiraLinha(unittest.TestCase):
    def test_imprime_oi(self):
        """o programa imprime oi"""
        self.assertEqual(rodar(), "oi\n")
