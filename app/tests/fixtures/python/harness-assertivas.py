# FIXTURE — as OUTRAS assertivas que a trilha usa nos harnesses de módulos mais
# adiantados (`docs/17-trilha-python.md` §"Regra de harness declarada": antes de
# M11 o teste que espera erro usa a FORMA DE CHAMADA de `assertRaises`, e não
# `with`, porque `node:With` só é ensinado em M11).
#
# Existe para MEDIR que `api:.assertTrue`, `api:.assertIsNone`,
# `api:.assertRaises`, `api:.assertFalse` e `api:.assertNotEqual` continuam na
# semente porque um harness real os emite — e não "por precaução".
import unittest

from solucao import classificar


class TestClassificar(unittest.TestCase):
    def test_verdadeiro(self):
        """classificar(1) e verdadeiro"""
        self.assertTrue(classificar(1))

    def test_vazio_nao_devolve_nada(self):
        """classificar(0) nao devolve nada"""
        self.assertIsNone(classificar(0))

    def test_texto_e_erro(self):
        """classificar("x") levanta ValueError"""
        self.assertRaises(ValueError, classificar, "x")

    def test_zero_e_falso(self):
        """classificar(0) e falso"""
        self.assertFalse(classificar(0))

    def test_nao_e_o_outro(self):
        """classificar(1) nao devolve 2"""
        self.assertNotEqual(classificar(1), 2)
