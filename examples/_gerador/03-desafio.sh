#!/usr/bin/env bash
# 03-desafio.sh — cria o desafio com challenge-new.sh e o AUTORA como manda o protocolo.
#
# docs/05-challenges-tdd.md: "O LLM AUTORA. ESTE SCRIPT JULGA." O README que o proprio
# challenge-new.sh materializa diz, em letras maiusculas, "[RASCUNHO gerado por
# challenge-new.sh — o tutor reescreve este enunciado antes da validacao]".
# Entao: o script materializa o esqueleto, o tutor escreve enunciado / stub / teste /
# referencia / alternativas, e challenge-verify.sh julga o resultado.
. "$(cd -- "$(dirname -- "$0")" && pwd -P)/00-env.sh"

CH_REL="$("$S/challenge-new.sh" "$SETUP" --language python --slug derivada-numerica \
          --concept derivada_numerica --difficulty 3 --skill-level beginner)"
CH="$SETUP/$CH_REL"
echo "desafio: $CH_REL"

# ⚠ ACHADO — guardo o RASCUNHO cru antes de tocar em qualquer coisa, para o relatorio.
cp "$CH/stub.py" "$WORK/rascunho-stub.py"
cp "$CH/meta.json" "$WORK/rascunho-meta.json"
echo "--- stub.py como challenge-new.sh o entregou (1a linha) ---"
head -1 "$WORK/rascunho-stub.py"
echo "--- scenarios[].test_name como challenge-new.sh os entregou ---"
jq -r '.scenarios[].test_name' "$WORK/rascunho-meta.json"

# ------------------------------------------------------------------ o tutor autora
cat > "$CH/stub.py" <<'PY'
def derivada(f, x, h):
    """Derivada numerica de f em x com passo h. Devolva o valor; nao imprima nada."""
    # SM_CORPO_INICIO — escreva a sua implementação entre estas duas marcas
    raise NotImplementedError("implemente derivada para o teste passar")
    # SM_CORPO_FIM
PY
cp "$CH/stub.py" "$CH/.solution/empty_stub.py"

cat > "$CH/.solution/reference.py" <<'PY'
def derivada(f, x, h):
    """Derivada numerica de f em x com passo h. Devolva o valor; nao imprima nada."""
    frente = f(x + h)
    tras = f(x - h)
    return (frente - tras) / (2 * h)
PY

rm -f "$CH/.solution/reference_alt_recursiva.py" "$CH/.solution/reference_alt_acumulador.py"
cat > "$CH/.solution/reference_alt_divisao_separada.py" <<'PY'
def derivada(f, x, h):
    """Mesma diferenca centrada, com a divisao por 2 fora da divisao por h."""
    return (f(x + h) - f(x - h)) / h / 2
PY
cat > "$CH/.solution/reference_alt_media_lateral.py" <<'PY'
def derivada(f, x, h):
    """Mesma diferenca centrada, escrita como media das duas taxas laterais."""
    direita = (f(x + h) - f(x)) / h
    esquerda = (f(x) - f(x - h)) / h
    return (direita + esquerda) / 2
PY

cat > "$CH/tests/test_stub.py" <<'PY'
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
PY

# ------------------------------------------------------- o tutor atualiza o manifesto
python3 - "$CH/meta.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p, encoding="utf-8"))
d["title"] = "Desafio 0001 — derivada numérica pela diferença centrada"
d["difficulty"] = 3
d["target_concepts"] = [
    {"concept_id": "derivada_numerica", "label": "Derivada numérica", "role": "primary",
     "proficiency_state_at_creation": "unknown"},
    {"concept_id": "derivada_como_taxa", "label": "Derivada como taxa de variação",
     "role": "supporting", "proficiency_state_at_creation": "unknown"},
    {"concept_id": "regra_da_potencia", "label": "Regra da potência", "role": "supporting",
     "proficiency_state_at_creation": "unknown"},
    {"concept_id": "erro_numerico", "label": "Erro numérico (truncamento e cancelamento)",
     "role": "supporting", "proficiency_state_at_creation": "unknown"},
]
d["artifacts"]["reference_alt_paths"] = [
    ".solution/reference_alt_divisao_separada.py",
    ".solution/reference_alt_media_lateral.py",
]
d["scenarios"] = [
    {"scenario_id": "afim_e_exata", "test_name": "test_afim_e_exata", "kind": "example",
     "description": "Para f(x) = 3x + 1 a diferenca centrada devolve 3 exatamente, para qualquer h."},
    {"scenario_id": "quadratica_e_exata", "test_name": "test_quadratica_e_exata", "kind": "example",
     "description": "Para f(x) = x**2 em x = 1 com h = 0.5 o resultado e 2.0 exato: os termos de erro de ordem par se cancelam."},
    {"scenario_id": "constante_da_zero", "test_name": "test_constante_da_zero", "kind": "boundary",
     "description": "Funcao constante tem derivada zero; o numerador precisa cancelar exatamente."},
    {"scenario_id": "ponto_negativo", "test_name": "test_ponto_negativo", "kind": "boundary",
     "description": "Em x = -4 a derivada de x**2 e -8: a formula nao pode assumir x positivo."},
    {"scenario_id": "cubica_tem_erro_de_ordem_h2", "test_name": "test_cubica_tem_erro_de_ordem_h2",
     "kind": "example",
     "description": "Em grau 3 sobra o erro de truncamento h**2: derivada(x**3, 2, 0.5) vale 12.25, e nao 12."},
    {"scenario_id": "passo_negativo_da_o_mesmo", "test_name": "test_passo_negativo_da_o_mesmo",
     "kind": "metamorphic",
     "description": "Trocar h por -h nao muda o resultado: numerador e denominador trocam de sinal juntos."},
]
d["execution"]["expected_test_count"] = len(d["scenarios"])
d["oracle"] = {
    "strategies": ["reference_impl", "metamorphic_relation", "anchor_cases_from_statement"],
    "numeric_mode": "float_tolerance",
    "rel_tol": 0.0,
    "abs_tol": 1e-09,
}
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(p, "a", encoding="utf-8").write("\n")
PY

# ---------------------------------------------------------------------- o enunciado
python3 - "$CH/README.md" <<'PY'
import sys
p = sys.argv[1]
texto = '''# Desafio 0001 — derivada numérica pela diferença centrada

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
'''
open(p, "w", encoding="utf-8").write(texto)
PY

echo "--- sanidade: a referencia passa (checagem do tutor, fora do desafio) ---"
SAN="$WORK/sanidade"; rm -rf "$SAN"; mkdir -p "$SAN"
cp -r "$CH/tests" "$SAN/tests"; cp "$CH/.solution/reference.py" "$SAN/stub.py"
( cd "$SAN" && PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -t . -p 'test_*.py' 2>&1 | tail -3 )
echo "--- sanidade: o stub vazio falha nos seis cenarios ---"
cp "$CH/.solution/empty_stub.py" "$SAN/stub.py"
( cd "$SAN" && PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -t . -p 'test_*.py' 2>&1 | tail -3 ) || true
rm -rf "$SAN"
