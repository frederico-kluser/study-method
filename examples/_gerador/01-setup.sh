#!/usr/bin/env bash
. "$(cd -- "$(dirname -- "$0")" && pwd -P)/00-env.sh"
rm -rf -- "$SETUP" "$STUDY_METHOD_HOME"
mkdir -p -- "$WORK" "$STUDY_METHOD_HOME"

export STUDY_METHOD_TODAY=2026-07-06
export STUDY_METHOD_NOW=2026-07-06T19:02:00-03:00

"$S/setup-init.sh" "$SETUP" \
  --subject "Cálculo Diferencial" \
  --subject-slug "calculo-python" \
  --title "Cálculo em Python" \
  --language python \
  --skill-level beginner \
  --session-minutes 50 \
  --theory-source student_provided \
  --defaults-used "D-B02=student_provided,D-M05" > "$WORK/setup_id.txt"
SETUP_ID="$(tr -d '[:space:]' < "$WORK/setup_id.txt")"
echo "setup_id=$SETUP_ID"

# --- material que O ALUNO trouxe (unico arquivo do exemplo escrito a mao: e o que
#     `theory_source: student_provided` significa — a teoria vem do aluno, nao de script)
cat > "$SETUP/docs/apostila-derivadas.md" <<'DOC'
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
DOC

# mtime FIXO no material do aluno. `docs-index.sh` grava o mtime real do arquivo em
# memory/docs-index.json (ele é a chave de invalidação do cache, e por isso NÃO honra
# STUDY_METHOD_NOW). Sem este `touch`, o único campo do exemplo inteiro que carrega a hora de
# relógio da máquina que gerou seria esse — e a saída deixaria de ser reproduzível byte a byte.
touch -d '2026-07-06T18:40:00-03:00' -- "$SETUP/docs/apostila-derivadas.md"

# taxonomia: `setup-init.sh` cria a lista com o assunto; quem a estende, por contrato,
# e o tutor no passo `setup_interview`/`teach` (nao ha script para isso).
python3 - "$SETUP/setup.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p, encoding="utf-8"))
d["taxonomy"] = ["calculo_diferencial", "limites", "derivadas",
                 "derivada_como_taxa", "regra_da_potencia", "regra_da_cadeia",
                 "derivada_numerica", "erro_numerico"]
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(p, "a", encoding="utf-8").write("\n")
PY

"$S/readme-sync.sh" "$SETUP" --init
echo "--- arvore ---"; find "$SETUP" -type f | sed "s|$SETUP|.|" | sort
