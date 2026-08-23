#!/usr/bin/env bash
# tests/gate-build.sh — o gate de SINTAXE E FORMA do repositório.
#
# Não olha semântica nenhuma (isso é tests/validate.sh). Responde a uma pergunta só:
# **o que está no disco é sintaticamente válido e tem a forma que o contrato exige?**
#
# Verifica (docs/00-contratos.md §7 LIB-1, §5, §8):
#   B-01  `bash -n` em todo *.sh do repositório
#   B-02  `python3 -m py_compile` em todo *.py
#   B-03  todo *.json parseia com json.load da stdlib
#   B-04  LIB-1: SK/scripts/lib/*.sh tem modo 0644 e NENHUM bit de execução
#   B-05  todo executável de SK/scripts/ tem modo 0755
#   B-06  todo executável tem shebang na 1ª linha
#   B-07  todo executável .sh tem `set -euo pipefail` (ou set -e/-u/-o pipefail separados)
#   B-08  os scripts de tests/ obedecem às mesmas regras; tests/lib/ é 0644 como lib
#   B-09  nenhum arquivo com CRLF
#   B-10  todo *.sh.tmpl parseia como bash depois de substituir os placeholders
#   B-11  shellcheck, se existir nesta máquina (bônus opcional — não é dependência)
#
# Uso:  tests/gate-build.sh [-h]
# Exit: 0 tudo verde · 1 há falha ou pendência
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/lib/assert.sh
. "$SELF_DIR/lib/assert.sh"

case "${1:-}" in
  -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) printf 'uso incorreto: argumento desconhecido «%s». Veja --help.\n' "$1" >&2; exit 2 ;;
esac

trap gate_cleanup_tmp EXIT

gate_init "gate-build — sintaxe e forma"
gate_limitation "gate-build NÃO verifica semântica: contratos, vocabulários e invariantes são de tests/validate.sh."
command -v shellcheck >/dev/null 2>&1 || \
  gate_limitation "shellcheck ausente nesta máquina — a análise estática de shell fica limitada a \`bash -n\` (só sintaxe, não uso)."

SK="$GATE_SK"
LIBDIR="$SK/scripts/lib"

# ───────────────────────────────────────────────────────────── B-01 sintaxe bash
gate_section "B-01 · sintaxe de shell (bash -n)"
declare -a SH_FILES=()
gate_find_into SH_FILES "$GATE_ROOT" -name '*.sh'
if [ "${#SH_FILES[@]}" -eq 0 ]; then
  gate_pend "B-01" "há pelo menos um .sh no repositório" "nenhum *.sh encontrado sob $GATE_ROOT"
else
  n_bad=0
  for f in "${SH_FILES[@]}"; do
    if ! err="$(bash -n "$f" 2>&1)"; then
      n_bad=$((n_bad + 1))
      gate_fail "B-01" "erro de sintaxe de shell" "bash -n sem erro" "$(gate_trunc "$err")" "$(gate_rel "$f")"
    fi
  done
  [ "$n_bad" -eq 0 ] && gate_pass "B-01" "${#SH_FILES[@]} arquivo(s) .sh passam em bash -n"
fi

# ───────────────────────────────────────────────────────────── B-02 sintaxe python
gate_section "B-02 · sintaxe de Python (py_compile)"
declare -a PY_FILES=()
gate_find_into PY_FILES "$GATE_ROOT" -name '*.py'
if [ "${#PY_FILES[@]}" -eq 0 ]; then
  gate_pend "B-02" "SK/scripts/render-plot.py existe e compila" "nenhum *.py encontrado sob $GATE_ROOT"
else
  n_bad=0
  for f in "${PY_FILES[@]}"; do
    if ! err="$(python3 -m py_compile "$f" 2>&1)"; then
      n_bad=$((n_bad + 1))
      gate_fail "B-02" "erro de sintaxe de Python" "py_compile sem erro" "$(gate_trunc "$err")" "$(gate_rel "$f")"
    fi
  done
  find "$GATE_ROOT" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
  [ "$n_bad" -eq 0 ] && gate_pass "B-02" "${#PY_FILES[@]} arquivo(s) .py compilam"
fi

# ───────────────────────────────────────────────────────────── B-03 JSON parseia
gate_section "B-03 · todo JSON parseia (json.load da stdlib)"
declare -a JSON_FILES=()
gate_find_into JSON_FILES "$GATE_ROOT" -name '*.json'
if [ "${#JSON_FILES[@]}" -eq 0 ]; then
  gate_pend "B-03" "há JSON no repositório" "nenhum *.json encontrado"
else
  n_bad=0
  for f in "${JSON_FILES[@]}"; do
    if ! err="$(python3 -c 'import json,sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$f" 2>&1)"; then
      n_bad=$((n_bad + 1))
      gate_fail "B-03" "JSON não parseia" "json.load sem exceção" "$(gate_trunc "$err")" "$(gate_rel "$f")"
    fi
  done
  [ "$n_bad" -eq 0 ] && gate_pass "B-03" "${#JSON_FILES[@]} arquivo(s) .json parseiam"
fi

# ───────────────────────────────────────────────────── B-04 LIB-1: lib/ sem execução
gate_section "B-04 · LIB-1 · SK/scripts/lib/ é 0644 e nunca executável"
if [ ! -d "$LIBDIR" ]; then
  gate_pend "B-04" "LIB-1 sobre SK/scripts/lib/" "diretório inexistente: $(gate_rel "$LIBDIR")"
else
  declare -a LIB_FILES=()
  gate_find_into LIB_FILES "$LIBDIR" -name '*.sh'
  if [ "${#LIB_FILES[@]}" -eq 0 ]; then
    gate_pend "B-04" "LIB-1 sobre lib/common.sh, lib/json.sh, lib/sandbox.sh" "nenhum .sh em $(gate_rel "$LIBDIR")"
  else
    n_bad=0
    for f in "${LIB_FILES[@]}"; do
      mode="$(stat -c '%a' "$f")"
      if [ -x "$f" ]; then
        n_bad=$((n_bad + 1))
        gate_fail "B-04" "LIB-1 violada: arquivo de lib/ com bit de execução" \
          "modo 0644, sem bit de execução (arquivo de lib/ é apenas \`source\`)" \
          "modo $mode" "$(gate_rel "$f")"
      elif [ "$mode" != "644" ]; then
        n_bad=$((n_bad + 1))
        gate_fail "B-04" "LIB-1: modo diferente de 0644 em lib/" "modo 644" "modo $mode" "$(gate_rel "$f")"
      fi
      if head -1 "$f" | grep -q '^#!'; then
        n_bad=$((n_bad + 1))
        gate_fail "B-04" "LIB-1: arquivo de lib/ tem shebang" \
          "sem shebang (não é executável, é \`source\`)" "$(head -1 "$f")" "$(gate_rel "$f"):1"
      fi
    done
    [ "$n_bad" -eq 0 ] && gate_pass "B-04" "${#LIB_FILES[@]} arquivo(s) de lib/ em 0644, sem shebang, sem bit de execução"
  fi
fi

# ─────────────────────────────────────────────── B-05/B-06/B-07 executáveis de SK/scripts/
gate_section "B-05/06/07 · executáveis de SK/scripts/: modo 0755, shebang, set -euo pipefail"
if [ ! -d "$SK/scripts" ]; then
  gate_pend "B-05" "executáveis de SK/scripts/" "diretório inexistente: $(gate_rel "$SK/scripts")"
else
  declare -a EXEC_FILES=()
  gate_find_into EXEC_FILES "$SK/scripts" \( -name '*.sh' -o -name '*.py' \)
  declare -a REAL_EXEC=()
  for f in "${EXEC_FILES[@]}"; do
    case "$f" in "$LIBDIR"/*) continue ;; esac
    REAL_EXEC+=("$f")
  done
  if [ "${#REAL_EXEC[@]}" -eq 0 ]; then
    gate_pend "B-05" "os 16 executáveis de SK/scripts/ (§8, fora de lib/)" \
      "nenhum executável em $(gate_rel "$SK/scripts") — só lib/ está presente"
  else
    n5=0; n6=0; n7=0
    for f in "${REAL_EXEC[@]}"; do
      rel="$(gate_rel "$f")"
      mode="$(stat -c '%a' "$f")"
      if [ "$mode" != "755" ]; then
        n5=$((n5 + 1))
        gate_fail "B-05" "executável fora do modo 0755" "modo 755" "modo $mode" "$rel"
      fi
      first="$(head -1 "$f")"
      case "$f" in
        *.sh)
          if [ "$first" != '#!/usr/bin/env bash' ]; then
            n6=$((n6 + 1))
            gate_fail "B-06" "shebang ausente ou fora do padrão" \
              "#!/usr/bin/env bash na 1ª linha" "${first:-<arquivo vazio>}" "$rel:1"
          fi
          if ! grep -qE '^[[:space:]]*set[[:space:]]+-euo[[:space:]]+pipefail' "$f" &&
             ! { grep -qE '^[[:space:]]*set[[:space:]]+-o[[:space:]]+pipefail' "$f" &&
                 grep -qE '^[[:space:]]*set[[:space:]]+-[eu]' "$f"; }; then
            n7=$((n7 + 1))
            gate_fail "B-07" "sem \`set -euo pipefail\`" \
              "linha \`set -euo pipefail\` (§5.3: regra de pipe)" "nenhuma" "$rel"
          fi
          ;;
        *.py)
          case "$first" in
            '#!/usr/bin/env python3') ;;
            *) n6=$((n6 + 1))
               gate_fail "B-06" "shebang ausente ou fora do padrão" \
                 "#!/usr/bin/env python3 na 1ª linha" "${first:-<arquivo vazio>}" "$rel:1" ;;
          esac
          ;;
      esac
    done
    [ "$n5" -eq 0 ] && gate_pass "B-05" "${#REAL_EXEC[@]} executável(is) em modo 0755"
    [ "$n6" -eq 0 ] && gate_pass "B-06" "${#REAL_EXEC[@]} executável(is) com shebang canônico"
    [ "$n7" -eq 0 ] && gate_pass "B-07" "todo executável .sh tem set -euo pipefail"
  fi
fi

# ───────────────────────────────────────────────────────────── B-08 os próprios tests/
gate_section "B-08 · os scripts do gate obedecem às mesmas regras"
n8=0
for name in gate-build.sh validate.sh gate-lint.sh smoke.sh; do
  f="$GATE_ROOT/tests/$name"
  if [ ! -f "$f" ]; then
    n8=$((n8 + 1)); gate_pend "B-08" "tests/$name existe" "arquivo inexistente: tests/$name"; continue
  fi
  mode="$(stat -c '%a' "$f")"
  [ "$mode" = "755" ] || { n8=$((n8 + 1)); gate_fail "B-08" "script do gate fora do modo 0755" "755" "$mode" "tests/$name"; }
  [ "$(head -1 "$f")" = '#!/usr/bin/env bash' ] || { n8=$((n8 + 1)); gate_fail "B-08" "shebang do script do gate" "#!/usr/bin/env bash" "$(head -1 "$f")" "tests/$name:1"; }
  grep -qE '^set -euo pipefail' "$f" || { n8=$((n8 + 1)); gate_fail "B-08" "set -euo pipefail no script do gate" "presente" "ausente" "tests/$name"; }
done
f="$GATE_ROOT/tests/lib/assert.sh"
if [ -f "$f" ]; then
  mode="$(stat -c '%a' "$f")"
  [ "$mode" = "644" ] || { n8=$((n8 + 1)); gate_fail "B-08" "tests/lib/assert.sh é lib: modo 0644" "644" "$mode" "tests/lib/assert.sh"; }
  [ ! -x "$f" ] || { n8=$((n8 + 1)); gate_fail "B-08" "tests/lib/assert.sh com bit de execução" "sem bit de execução" "executável" "tests/lib/assert.sh"; }
else
  n8=$((n8 + 1)); gate_pend "B-08" "tests/lib/assert.sh existe" "arquivo inexistente"
fi
[ "$n8" -eq 0 ] && gate_pass "B-08" "os 4 scripts do gate + tests/lib/assert.sh estão na forma"

# ───────────────────────────────────────────────────────────── B-09 CRLF
gate_section "B-09 · nenhum arquivo com fim de linha CRLF"
crlf=""
while IFS= read -r -d '' f; do
  if head -c 65536 "$f" | grep -qU $'\r' 2>/dev/null; then
    crlf="$crlf$(gate_rel "$f")"$'\n'
  fi
done < <(find "$GATE_ROOT" \( -name .git -o -name .deep-orchestrator \) -prune -o \
           -type f \( -name '*.sh' -o -name '*.py' -o -name '*.json' -o -name '*.md' -o -name '*.tsv' -o -name '*.tmpl' \) -print0 2>/dev/null | sort -z)
assert_grep_empty "B-09" "nenhum arquivo de texto com CRLF" "todos os arquivos com LF puro" "${crlf%$'\n'}"

# ───────────────────────────────────────────────────────────── B-10 templates de shell
gate_section "B-10 · *.sh.tmpl parseia como bash depois de substituir placeholders"
declare -a TMPL_SH=()
gate_find_into TMPL_SH "$SK/assets/templates" -name '*.sh.tmpl'
if [ "${#TMPL_SH[@]}" -eq 0 ]; then
  gate_pend "B-10" "challenge/runner.sh.tmpl existe e é bash válido" \
    "nenhum *.sh.tmpl em $(gate_rel "$SK/assets/templates")"
else
  n10=0
  for f in "${TMPL_SH[@]}"; do
    tmp="$GATE_TMPDIR/$(basename "$f").sh"
    mkdir -p "$GATE_TMPDIR"
    sed -E 's/\{\{[A-Z0-9_]+\}\}/PLACEHOLDER/g' "$f" > "$tmp"
    if ! err="$(bash -n "$tmp" 2>&1)"; then
      n10=$((n10 + 1))
      gate_fail "B-10" "template de shell não parseia depois da substituição" \
        "bash -n sem erro com todo {{X}} → PLACEHOLDER" "$(gate_trunc "$err")" "$(gate_rel "$f")"
    fi
  done
  [ "$n10" -eq 0 ] && gate_pass "B-10" "${#TMPL_SH[@]} template(s) de shell parseiam"
fi

# ───────────────────────────────────────────────────────────── B-11 shellcheck (bônus)
gate_section "B-11 · shellcheck (bônus opcional)"
if ! command -v shellcheck >/dev/null 2>&1; then
  gate_skip "B-11" "análise estática com shellcheck" "shellcheck não instalado nesta máquina"
else
  n11=0
  for f in "${SH_FILES[@]}"; do
    if ! err="$(shellcheck -S error -f gcc "$f" 2>&1)"; then
      n11=$((n11 + 1))
      gate_fail "B-11" "shellcheck acusou erro" "nenhum achado de severidade error" "$(gate_trunc "$err")" "$(gate_rel "$f")"
    fi
  done
  [ "$n11" -eq 0 ] && gate_pass "B-11" "shellcheck sem achados de severidade error"
fi

gate_summary
