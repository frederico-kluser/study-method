# FIXTURE — o arquivo `tests/test_solucao.py` da FASE VALOR (M4 em diante).
#
# Copiado VERBATIM de `docs/17-trilha-python.md` §"O formato exato do arquivo de
# teste — FASE VALOR". É a forma para a qual a semente da onda 7 tinha sido
# escrita; a da fase SAÍDA (acima) é a que faltava.
import unittest

from solucao import dobro


class TestDobro(unittest.TestCase):
    def test_dobro_de_2(self):
        """o dobro de 2 e 4"""
        self.assertEqual(dobro(2), 4)
