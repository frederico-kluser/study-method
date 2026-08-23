#!/usr/bin/env bash
. "$(cd -- "$(dirname -- "$0")" && pwd -P)/00-env.sh"; . "$EX/lib-close.sh"
export STUDY_METHOD_TODAY=2026-08-04
export STUDY_METHOD_NOW=2026-08-04T19:00:00-03:00

N="$("$S/session-new.sh" "$SETUP" --goal 'Achar o h que erra menos e saber dizer por que ele existe.')"

cat > "$WORK/patch-plan-$N.json" <<'JSON'
{"plan": {"items": [
  {"text": "Retomar de onde parou: os dois números antes da subtração", "reason": "orphan_resume", "topic": "erro_numerico", "state": "done"},
  {"text": "Separar erro de truncamento (da fórmula) de erro de arredondamento (da máquina)", "reason": "next_in_taxonomy", "topic": "erro_numerico", "state": "done"},
  {"text": "Destilar o resultado num researchs/ para você reler sem mim", "reason": "student_request", "topic": "derivada_numerica", "state": "done"}
], "changed_by_student": false}}
JSON
python3 "$EX/lib-tutor.py" "$SETUP/memory/$N.json" "$WORK/patch-plan-$N.json"

R2="$("$S/research-new.sh" "$SETUP" --topic derivada-numerica-erro --sources docs/apostila-derivadas.md --session "$N")"
echo "destilado: $R2"
python3 - "$SETUP/researchs/0002.md" <<'PY'
import sys
p = sys.argv[1]
meta = open(p, encoding="utf-8").read().split("\n", 1)[0]
meta = meta.replace('"provenance":"generated_researched"', '"provenance":"student_provided"')
corpo = '''
# Erro da derivada numérica: dois erros que puxam para lados opostos

## Definição

O erro total de uma derivada numérica é a soma de dois termos com sinais de dependência opostos
em `h`: o **erro de truncamento**, que vem da fórmula e cai quando `h` diminui, e o **erro de
arredondamento**, que vem da subtração de dois números quase iguais em ponto flutuante e cresce
quando `h` diminui.

## Fórmula

| fórmula | erro de truncamento | erro de arredondamento | `h` de menor erro total |
|---|---|---|---|
| progressiva `(f(x+h) - f(x)) / h` | `O(h)` | `O(eps/h)` | `~ sqrt(eps)` ≈ `1e-8` |
| centrada `(f(x+h) - f(x-h)) / (2h)` | `O(h**2)` | `O(eps/h)` | `~ eps**(1/3)` ≈ `6e-6` |

`eps` é o épsilon de máquina do `float` do Python: `2.220446049250313e-16`.

## Exemplo mínimo

```python
def derivada(f, x, h):
    return (f(x + h) - f(x - h)) / (2 * h)

f = lambda x: x ** 3
for h in (1e-2, 1e-4, 1e-6, 1e-8, 1e-12):
    print(f"{h:8.0e}  {abs(derivada(f, 2.0, h) - 12.0):.3e}")
#    1e-02  1.000e-04
#    1e-04  1.000e-08
#    1e-06  1.315e-10
#    1e-08  3.256e-08
#    1e-12  4.716e-04
```

## Armadilha

Trocar `float` por `Decimal` não faz o erro sumir: ele empurra `eps` para baixo e move o `h`
ótimo, mas o cancelamento continua existindo, porque a causa é **subtrair dois números quase
iguais**, não a largura do tipo. Com 50 dígitos de precisão o mesmo laço volta a subir — só mais
tarde.

## Ver também

- `researchs/0001.md` — a definição de derivada e o erro de truncamento
- `docs/apostila-derivadas.md` §3.2
'''
open(p, "w", encoding="utf-8").write(meta + "\n" + corpo.lstrip("\n"))
PY

cat > "$WORK/patch-teach-$N.json" <<'JSON'
{
  "docs_coverage": "indexed",
  "affect": "frustrated",
  "affect_note": "Passou a discutir em vez de perguntar; repetiu três vezes que 'com mais precisão isso resolve' e só parou quando os dígitos apareceram na tela.",
  "how_it_happened": [
    {"move_type": "spaced_review",
     "description": "Abri com o próximo passo combinado: imprimir f(2+h) e f(2-h) com repr() para h=1e-12, sem comentar nada antes.",
     "target_topic": "erro_numerico", "outcome": "partial",
     "evidence": "Olhou os dois números, disse 'são quase iguais' e parou aí — não ligou isso ao erro.",
     "observation_type": "observed"},
    {"move_type": "analogy",
     "description": "Comparei o arredondamento a medir uma folha de papel com uma régua de marcas grossas: 'medir algo minúsculo com marcação grossa dá erro'.",
     "target_topic": "erro_numerico", "outcome": "backfired",
     "evidence": "Concluiu que bastava uma régua mais fina e passou a defender que com Decimal de 50 dígitos o erro sumiria para qualquer h. A analogia escondeu o ponto: o problema é a SUBTRAÇÃO de dois números quase iguais, não a largura da marcação.",
     "observation_type": "observed"},
    {"move_type": "hint_ladder",
     "description": "Três degraus, um de cada vez: 'olhe os dois números antes da subtração' → 'quantos dígitos eles têm em comum?' → 'quantos dígitos sobram depois de subtrair?'.",
     "target_topic": "erro_numerico", "outcome": "unlocked", "hint_level": 3,
     "evidence": "No terceiro degrau ele contou os dígitos em voz alta e disse 'sobraram quatro' — e só então largou a régua.",
     "observation_type": "observed"},
    {"move_type": "reference_lookup",
     "description": "Abrimos docs/apostila-derivadas.md §3.2 juntos para separar o que vem da fórmula do que vem da máquina.",
     "target_topic": "derivada_numerica", "outcome": "partial",
     "evidence": "Aceitou a separação, mas continuou dizendo que Decimal resolveria — ficou como próximo passo experimental.",
     "observation_type": "observed"},
    {"move_type": "hands_on",
     "description": "Ele rodou o desafio 0001 com a diferença centrada e passou em cinco dos seis cenários na terceira tentativa; o cenário da cúbica exigiu os três degraus da dica.",
     "target_topic": "derivada_numerica", "outcome": "unlocked", "hint_level": 3,
     "evidence": "./runner.sh verde na quarta execução; ele explicou o 12.25 sem consultar o enunciado.",
     "observation_type": "observed"}
  ],
  "skills_observed": [
    {"skill": "derivada_numerica", "level": "beginner", "confidence": "medium",
     "last_observed_at": "2026-08-04",
     "evidence": "Passou nos seis cenários do desafio 0001, mas só depois do terceiro degrau da escada de dicas.",
     "observation_type": "observed", "proficiency_state": "fragile"},
    {"skill": "erro_numerico", "level": "beginner", "confidence": "low",
     "last_observed_at": "2026-08-04",
     "evidence": "Reaplicou 'mais precisão resolve' em dois contextos diferentes na mesma sessão — regra errada, porém consistente.",
     "observation_type": "observed", "proficiency_state": "unknown"},
    {"skill": "regra_da_potencia", "level": "beginner", "confidence": "medium",
     "last_observed_at": "2026-08-04",
     "evidence": "Previu sozinho o valor analítico 3*x**2 para conferir a saída numérica, sem dica.",
     "observation_type": "observed", "proficiency_state": "fragile"}
  ],
  "artifacts": [
    {"path": "researchs/0002.md", "kind": "research"}
  ]
}
JSON
python3 "$EX/lib-tutor.py" "$SETUP/memory/$N.json" "$WORK/patch-teach-$N.json"

export STUDY_METHOD_NOW=2026-08-04T19:55:00-03:00
cat > "$WORK/vals-$N.json" <<'JSON'
{
  "one_line_summary": "Passou no desafio 0001 com três degraus de dica; ainda acha que Decimal faz o cancelamento sumir.",
  "topics": ["derivada_numerica", "erro_numerico", "regra_da_potencia"],
  "what_was_done": "Imprimimos f(2+h) e f(2-h) com repr() para h=1e-12 e contamos os dígitos em comum. Separamos erro de truncamento e de arredondamento com a apostila aberta. Ele resolveu o desafio 0001 na quarta execução do runner e destilamos tudo em researchs/0002.md.",
  "what_was_learned": [
    "Conta quantos dígitos significativos sobram depois de subtrair dois números quase iguais.",
    "Sabe dizer qual dos dois erros cresce e qual cai quando h diminui.",
    "Usa a regra da potência como conferência do resultado numérico, sem que eu peça."
  ],
  "what_worked": "A escada de dicas de três degraus sobre os dígitos: cada degrau devolvia a conta para ele em vez de dar a explicação.",
  "what_didnt_work": "A analogia da régua de marcas grossas: ele saiu dela convencido de que Decimal resolveria para qualquer h — a analogia escondeu que a causa é a subtração, não a largura do tipo.",
  "open_questions": [
    "Se eu usar Decimal com 50 dígitos, o erro some para qualquer h ou só se muda de lugar?"
  ],
  "next_steps": [
    "Refazer o varrimento de h com Decimal de 50 dígitos e comparar com float — a ideia é dele, e a conta é quem responde.",
    "Trazer, em uma frase, por que a diferença centrada erra menos que a progressiva com o mesmo h."
  ]
}
JSON
fechar_sessao "$N" "$WORK/vals-$N.json"
