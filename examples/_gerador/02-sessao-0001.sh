#!/usr/bin/env bash
. "$(cd -- "$(dirname -- "$0")" && pwd -P)/00-env.sh"; . "$EX/lib-close.sh"

export STUDY_METHOD_TODAY=2026-07-06
export STUDY_METHOD_NOW=2026-07-06T19:05:00-03:00

# passo `load_docs` (condicional: docs/ do setup tem material ingerivel)
"$S/docs-index.sh" "$SETUP" --topics derivadas,limites

# passo `open_session`
N="$("$S/session-new.sh" "$SETUP" --goal 'Entender o que é derivada sem decorar fórmula.')"

# passo `plan_lesson` — o objeto `plan` e escrito pelo TUTOR (docs/00 §2 passo 6)
cat > "$WORK/patch-plan-$N.json" <<'JSON'
{
  "plan": {
    "items": [
      {"text": "Partir do gráfico: o que acontece com uma curva quando a gente chega muito perto de um ponto",
       "reason": "student_request", "topic": "derivadas", "state": "done"},
      {"text": "Só depois de ele prever o resultado, escrever a definição com limite",
       "reason": "next_in_taxonomy", "topic": "limites", "state": "done"},
      {"text": "Fechar calculando a derivada de x**2 em três pontos diferentes",
       "reason": "next_in_taxonomy", "topic": "derivadas", "state": "skipped"}
    ],
    "changed_by_student": true
  }
}
JSON
python3 "$EX/lib-tutor.py" "$SETUP/memory/$N.json" "$WORK/patch-plan-$N.json"

# ------------------------------------------------------------------ passo `teach`
R1="$("$S/research-new.sh" "$SETUP" --topic derivada-definicao --sources docs/apostila-derivadas.md --session "$N")"
echo "destilado: $R1"

mkdir -p "$SETUP/researchs/assets/0001-derivada-definicao"
cat > "$WORK/plot-0001.json" <<'JSON'
{
  "type": "function",
  "title": "x² e a sua derivada 2x",
  "takeaway": "A derivada cruza o zero exatamente onde a parábola tem o fundo: em x = 0 a inclinação de x² é nula.",
  "x_label": "x",
  "y_label": "valor",
  "x_limits": [-3, 3],
  "series": [
    { "label": "f(x) = x²",  "expr": "x**2", "domain": [-3, 3], "samples": 121 },
    { "label": "f'(x) = 2x", "expr": "2*x",  "domain": [-3, 3], "samples": 121 }
  ]
}
JSON
"$S/render-plot.py" --spec "$WORK/plot-0001.json" \
  --out-dir "$SETUP/researchs/assets/0001-derivada-definicao" \
  --basename x2-e-sua-derivada --formats svg,html,txt,md > "$WORK/plot-0001.out.json"

# corpo do destilado — escrito pelo TUTOR (research-new.sh aloca o arquivo, nunca o corpo)
python3 - "$SETUP/researchs/0001.md" <<'PY'
import re, sys
p = sys.argv[1]
meta = open(p, encoding="utf-8").read().split("\n", 1)[0]
# proveniencia: o fato vem de docs/apostila-derivadas.md, entao e `student_provided`
# (SK/references/researchs.md: "generated_researched" exige busca web NESTA sessao).
meta = meta.replace('"provenance":"generated_researched"', '"provenance":"student_provided"')
corpo = '''
# Derivada: a inclinação que sobra quando o intervalo encolhe

## Definição

A derivada de `f` em `x` é a inclinação da reta tangente ao gráfico de `f` no ponto `x`. Ela é o
valor para o qual a inclinação da reta secante entre `x` e `x + h` converge quando `h` encolhe.

## Fórmula

    f'(x) = lim (h -> 0) (f(x + h) - f(x)) / h

| `f(x)` | `f'(x)` | condição |
|---|---|---|
| `c` | `0` | `c` constante |
| `x` | `1` | — |
| `x**2` | `2*x` | — |
| `x**n` | `n * x**(n-1)` | `n` real |

## Exemplo mínimo

```python
def taxa_media(f, x, h):
    return (f(x + h) - f(x)) / h

for h in (0.1, 0.01, 0.001):
    print(h, taxa_media(lambda x: x**2, 1.0, h))
# 0.1   2.100000000000002
# 0.01  2.009999999999996
# 0.001 2.0009999999999195
```

## Armadilha

`h` nunca vale zero. Em `h = 0` a expressão vira `0/0` e o Python levanta `ZeroDivisionError`.
O limite diz para onde os valores caminham quando `h` encolhe, não quanto vale em `h = 0`.

![x² e a sua derivada 2x](assets/0001-derivada-definicao/x2-e-sua-derivada.svg)

Duas curvas em `[-3, 3]`: `x**2` (laranja, sólida) tem mínimo 0 em `x = 0` e máximo 9 em
`x = -3`; `2*x` (azul, tracejada) é monotônica crescente, de `-6` a `6`. A reta cruza o zero
exatamente na abscissa do fundo da parábola.

## Ver também

- `docs/apostila-derivadas.md` §3.1 e §3.2
'''
open(p, "w", encoding="utf-8").write(meta + "\n" + corpo.lstrip("\n"))
PY

# ------------------------------------------- checkpoint do `teach` (docs/00 §2 passo 7)
cat > "$WORK/patch-teach-$N.json" <<'JSON'
{
  "docs_coverage": "full",
  "affect": "engaged",
  "affect_note": "Riu quando o sexto zoom achatou a curva; ficou calado durante a definição formal e só voltou a perguntar quando trocamos para a conta numérica.",
  "how_it_happened": [
    {"move_type": "visualization",
     "description": "Plotei x**2 e dei zoom sucessivo em torno de x=1, seis vezes, até a parábola ficar visualmente reta na tela; perguntei qual era a inclinação daquela reta ANTES de escrever qualquer fórmula.",
     "target_topic": "derivadas", "outcome": "unlocked",
     "evidence": "Ele contou quadradinhos, respondeu 'uns 2' e disse sozinho: 'então derivada é a inclinação quando eu chego perto o bastante'.",
     "observation_type": "observed"},
    {"move_type": "analogy",
     "description": "Ofereci o velocímetro do carro: a posição é a função, o velocímetro é a derivada.",
     "target_topic": "derivadas", "outcome": "partial",
     "evidence": "Repetiu a analogia certa para posição/tempo, mas travou em f(x)=x**2: 'aqui não tem tempo, então não tem velocidade'.",
     "observation_type": "observed"},
    {"move_type": "explanation_order",
     "description": "Escrevi a definição formal lim h->0 (f(x+h)-f(x))/h antes de fazer uma única conta numérica, achando que o zoom no gráfico já tinha preparado o terreno.",
     "target_topic": "derivadas", "outcome": "backfired",
     "evidence": "Ficou seis minutos sem perguntar nada e depois disse: 'eu tinha entendido no gráfico, agora não sei mais se entendi'.",
     "observation_type": "observed"},
    {"move_type": "hands_on",
     "description": "Larguei a fórmula e pedi que ele calculasse (f(1+h)-f(1))/h na mão para h=0,1, depois 0,01, depois 0,001.",
     "target_topic": "derivadas", "outcome": "unlocked", "hint_level": 1,
     "evidence": "Antes de fazer a conta de h=0,001 ele previu em voz alta 'vai dar 2,001' — e deu.",
     "observation_type": "observed"}
  ],
  "skills_observed": [
    {"skill": "derivada_como_taxa", "level": "beginner", "confidence": "medium",
     "last_observed_at": "2026-07-06",
     "evidence": "Previu o valor de (f(1+h)-f(1))/h para h=0,001 antes de calcular.",
     "observation_type": "observed", "proficiency_state": "unknown"}
  ],
  "artifacts": [
    {"path": "researchs/0001.md", "kind": "research"},
    {"path": "researchs/assets/0001-derivada-definicao/x2-e-sua-derivada.svg", "kind": "viz"}
  ]
}
JSON
python3 "$EX/lib-tutor.py" "$SETUP/memory/$N.json" "$WORK/patch-teach-$N.json"

# ------------------------------------------------------------- passo `close_session`
export STUDY_METHOD_NOW=2026-07-06T19:58:00-03:00
cat > "$WORK/vals-$N.json" <<'JSON'
{
  "one_line_summary": "Chegou à derivada como inclinação pelo zoom no gráfico; a definição formal veio cedo demais e atrapalhou.",
  "topics": ["derivadas", "limites"],
  "what_was_done": "Plotamos x**2 e demos zoom sucessivo em x=1 até a curva ficar reta na tela. Testamos a analogia do velocímetro e calculamos (f(1+h)-f(1))/h à mão para h = 0,1, 0,01 e 0,001. Destilamos o resultado em researchs/0001.md.",
  "what_was_learned": [
    "Explica derivada como a inclinação da reta que a curva vira quando você chega perto o bastante do ponto.",
    "Prevê para onde (f(1+h)-f(1))/h caminha quando h diminui, sem refazer a conta inteira."
  ],
  "what_worked": "Zoom sucessivo no gráfico antes de qualquer fórmula: ele mesmo enunciou a ideia de inclinação.",
  "what_didnt_work": "Escrever a definição formal com limite antes da conta numérica: ele desaprendeu o que já tinha entendido no gráfico.",
  "open_questions": [
    "Por que h não pode ser exatamente zero na definição?",
    "A analogia do velocímetro serve para uma função que não depende de tempo?"
  ],
  "next_steps": [
    "Refazer (f(1+h)-f(1))/h para f(x) = x**3 em x = 2, à mão, antes da próxima sessão.",
    "Trazer a dúvida sobre h = 0 por escrito para a gente atacar na abertura."
  ]
}
JSON
fechar_sessao "$N" "$WORK/vals-$N.json"
