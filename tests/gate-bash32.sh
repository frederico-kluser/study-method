#!/usr/bin/env bash
# tests/gate-bash32.sh — o gate de ANTI-REGRESSÃO do contrato bash 3.2 (P-36).
#
# Fecha o P-32 com uma rede: se alguém reintroduzir em tests/ ou em
# skills/study-method/scripts um construto de bash 4+ que falha EM SILÊNCIO no
# bash 3.2 (sem erro nenhum, devolvendo vazio), o gate fica vermelho antes de o
# defeito voltar a correr.
#
#   B-01  `local -n <var>` — nameref (bash 4.3+). No bash 3.2 vira
#         "local: -n: invalid option" em funções — ou pior, a variável chega
#         VAZIA sem erro aparente.
#   B-02  `${var,}` / `${var,,}` / `${var^}` / `${var^^}` — expansão de caixa
#         (bash 4.0+). No bash 3.2 a substituição devolve vazio, em silêncio.
#
# A varredura é TEXTO (grep): não executa nada e não depende de haver um bash
# 3.2 instalado — roda igual em qualquer versão de bash. O defeito caçado é por
# definição o que "funciona" num bash 4+ e quebra num 3.2.
#
# Uso:  tests/gate-bash32.sh [arquivo|dir ...]
#         sem argumentos: varre $GATE_ROOT/tests e $GATE_ROOT/skills/study-method/scripts
#         com argumentos: varre EXATAMENTE os caminhos dados (auto-teste do gate)
# Exit: 0 tudo verde · 1 achou construto proibido · 2 uso incorreto
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/lib/assert.sh
. "$SELF_DIR/lib/assert.sh"

case "${1:-}" in
  -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

gate_init "gate-bash32 — anti-regressão bash 3.2 (fecha o P-32)"
gate_limitation "A varredura é TEXTUAL (grep), por design: não distingue código de comentário/here-doc — uma MENÇÃO do padrão proibido também reprova. Rigor a favor da rede: o defeito só 'não aparece' se ninguém escrever a forma proibida."
gate_scope_excl "B-ALL" "o próprio gate (tests/gate-bash32.sh)" "o gate exclui a si mesmo da varredura para poder documentar — e caçar — os padrões que proíbe"

gate_section "B-01/B-02 · nameref e expansão de caixa (bash 4+)"

PATTERN='local[[:space:]]+-n|\$\{[A-Za-z_][A-Za-z0-9_]*[,^][,^]?\}'

if [ "$#" -gt 0 ]; then
  # escopo explícito (auto-teste do gate): os argumentos são os alvos
  hits="$(grep -nHE -- "$PATTERN" "$@" 2>/dev/null || true)"
else
  hits="$(find "$GATE_ROOT/tests" "$GATE_ROOT/skills/study-method/scripts" \
      \( -name .git -o -name node_modules -o -name __pycache__ \) -prune -o \
      -type f ! -name 'gate-bash32.sh' \
      -exec grep -nHE -- "$PATTERN" {} + 2>/dev/null || true)"
fi

if [ -z "$hits" ]; then
  gate_pass "B-ALL" "nenhum nameref nem expansão de caixa em tests/ e skills/study-method/scripts"
else
  list="$(printf '%s\n' "$hits" | sed "s|$GATE_ROOT/||g" | sed 's/^/            /')"
  gate_fail "B-ALL" "construto de bash 4+ presente (falha em silêncio no bash 3.2)" \
    "zero ocorrências de /$PATTERN/" "$list"
fi

gate_summary