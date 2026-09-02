#!/usr/bin/env bash
# tests/gate-lint.sh — o gate de QUALIDADE do texto e dos arquivos.
#
# Não é contrato (isso é tests/validate.sh) nem sintaxe (isso é tests/gate-build.sh): é o
# conjunto de defeitos baratos que estragam a leitura e escapam do olho humano.
#
#   L-01  frontmatter YAML lido por `awk` (NÃO há PyYAML nesta máquina): forma `chave: valor`,
#         sem tabulação, sem chave repetida, delimitadores fechados
#   L-02  link relativo quebrado em .md (alvo inexistente no disco)
#   L-03  `{{` órfão: abertura de placeholder sem fechamento, ou placeholder fora de *.tmpl
#   L-04  arquivo de texto sem newline final
#   L-05  tabela markdown malformada (sem linha separadora, ou linhas com nº de colunas diferente)
#   L-06  linha com espaço em branco no fim (bônus, aviso)
#
# Uso:  tests/gate-lint.sh [-h]
# Exit: 0 tudo verde · 1 há falha
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/lib/assert.sh
. "$SELF_DIR/lib/assert.sh"

case "${1:-}" in
  -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) printf 'uso incorreto: argumento desconhecido «%s». Veja --help.\n' "$1" >&2; exit 2 ;;
esac

trap gate_cleanup_tmp EXIT
mkdir -p "$GATE_TMPDIR"

gate_init "gate-lint — qualidade de texto e de arquivo"
gate_limitation "O frontmatter é lido por \`awk\` (não há PyYAML nesta máquina): a checagem cobre a FORMA (chave: valor, sem tabulação, sem chave repetida, delimitador fechado), não a semântica YAML completa."
gate_limitation "L-02 resolve só link relativo de arquivo. URL http(s)/mailto e âncora (#secao) não são verificadas."
gate_scope_excl "L-ALL" "dependência de terceiro e saída de build" "$(gate_prune_note)"

declare -a MD=()
while IFS= read -r -d '' f; do MD+=("$f"); done < <(gate_find_into "$GATE_ROOT" -name '*.md')
declare -a TXT=()
while IFS= read -r -d '' f; do TXT+=("$f"); done < <(gate_find_into "$GATE_ROOT" \
  \( -name '*.md' -o -name '*.sh' -o -name '*.py' -o -name '*.json' -o -name '*.tsv' -o -name '*.tmpl' \))

# ─────────────────────────────────────────────────────────── L-01 frontmatter por awk
gate_section "L-01 · frontmatter YAML pela leitura de awk (sem PyYAML)"
bad=""
for f in "${MD[@]}"; do
  head -1 "$f" | grep -qx -- '---' || continue
  rel="$(gate_rel "$f")"
  report="$(awk -v FS=':' '
    NR==1 { next }
    /^---[[:space:]]*$/ && !closed { closed=1; endline=NR; next }
    !closed {
      line=$0
      if (line ~ /^[[:space:]]*$/) next
      if (line ~ /^[[:space:]]*#/) next
      if (line ~ /\t/) { print NR": tabulação no frontmatter (YAML proíbe TAB para indentar)"; next }
      if (line ~ /^[[:space:]]/) { next }              # continuação/lista: fora do escopo desta checagem
      if (line !~ /^[A-Za-z][A-Za-z0-9_-]*:/) { print NR": linha de frontmatter fora da forma `chave: valor` -> "line; next }
      k=line; sub(/:.*/,"",k)
      if (k in seen) { print NR": chave repetida no frontmatter: "k }
      seen[k]=1
    }
    END { if (!closed) print "EOF: frontmatter aberto na linha 1 e nunca fechado por ---" }
  ' "$f")"
  [ -n "$report" ] && bad="$bad$(printf '%s\n' "$report" | sed "s|^|$rel:|")"$'\n'
done
assert_grep_empty "L-01" "todo frontmatter tem forma válida" \
  "chave: valor, sem TAB, sem chave repetida, delimitador --- fechado" "${bad%$'\n'}"

# ─────────────────────────────────────────────────────────── L-02 links relativos
gate_section "L-02 · links relativos quebrados em .md"
if [ "${#MD[@]}" -eq 0 ]; then
  gate_skip "L-02" "links relativos" "nenhum .md no repositório"
else
  python3 - "$GATE_ROOT" "${MD[@]}" > "$GATE_TMPDIR/links.txt" <<'PYEOF'
import os
import re
import sys

root = sys.argv[1]
INLINE = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
REFDEF = re.compile(r"^\[[^\]]+\]:\s*(\S+)", re.M)
SKIP = re.compile(r"^(https?:|mailto:|ftp:|data:|#|<)")
out = []
for path in sys.argv[2:]:
    rel = os.path.relpath(path, root)
    base = os.path.dirname(path)
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        continue
    lines = text.split("\n")
    targets = []
    infence = False
    for i, line in enumerate(lines):
        if line.lstrip().startswith("```"):
            infence = not infence
            continue
        if infence:
            continue
        # um link dentro de `code span` nao e um link: e exemplo citado.
        line = re.sub(r"`[^`]*`", "", line)
        for m in INLINE.finditer(line):
            targets.append((i + 1, m.group(1)))
        m = REFDEF.match(line)
        if m:
            targets.append((i + 1, m.group(1)))
    for lineno, target in targets:
        if SKIP.match(target):
            continue
        target = target.split("#", 1)[0]
        if not target:
            continue
        cand = os.path.normpath(os.path.join(base, target))
        if not os.path.exists(cand):
            out.append("%s:%d: link relativo quebrado -> %s (procurado em %s)"
                       % (rel, lineno, target, os.path.relpath(cand, root)))
sys.stdout.write("\n".join(out) + ("\n" if out else ""))
PYEOF
  assert_grep_empty "L-02" "nenhum link relativo quebrado" \
    "todo [texto](caminho) relativo resolve para um arquivo existente" "$(cat "$GATE_TMPDIR/links.txt")"
fi

# ─────────────────────────────────────────────────────────── L-03 {{ órfão
gate_section "L-03 · {{ órfão e placeholder fora de template"
# Três fontes de placeholder NÃO são artefato e ficam fora, declaradas:
#   docs/build-spec/**   os fragmentos DOCUMENTAM a sintaxe ("`{{PKG}}` — o mesmo do stub",
#                        "Sobrar `{{` no material renderizado ⇒ 1"). Falar do buraco não é
#                        deixar buraco;
#   BUILD_SPEC.md        o documento montado a partir de docs/build-spec/** — MESMA justificativa:
#                        ele documenta a sintaxe de placeholder (§0.7.5) e transcreve trechos de
#                        template. Escrevê-la de outro jeito para escapar deste check ensinaria a
#                        forma errada a quem copiar um template de lá;
#   comentário e here-document de script  o comentário explica o renderizador e o
#                        here-document `<<'TMPL'` É o template embutido de session-new.sh e
#                        research-new.sh — o mesmo conteúdo do *.tmpl, usado quando o arquivo
#                        falta, e que passa pela mesma substituição.
# Em todo o resto (SKILL.md, references/, schemas, examples/, evals/, docs/ normativo) a
# regra continua dura, inclusive para `{{` sem fechamento.
gate_scope_excl "L-03" "docs/build-spec/** · BUILD_SPEC.md · *.tmpl · MANIFEST.tsv · comentário e here-document de script" \
  "documentação da sintaxe de placeholder (docs/build-spec/** e o BUILD_SPEC.md montado a partir dele, §0.7.5), template embutido no renderizador e o literal de busca \`'{{'\` do guarda final não são artefato materializado. Placeholder em SKILL.md, reference, schema, examples/ ou doc normativo continua sendo FAIL."
SHELLSCOPE="$(gate_shell_scope_tool)"
SCOPE_TSV="$GATE_TMPDIR/shellscope.tsv"
: > "$SCOPE_TSV"
declare -a SH_SRC=()
for f in "${TXT[@]}"; do case "$f" in *.sh) SH_SRC+=("$f") ;; esac; done
if [ "${#SH_SRC[@]}" -gt 0 ]; then
  python3 "$SHELLSCOPE" classify "$GATE_ROOT" "${SH_SRC[@]}" > "$SCOPE_TSV" 2>/dev/null || : > "$SCOPE_TSV"
fi
lint_is_code() { # <rel> <nº> — 0 se a linha EXECUTA (ou se o arquivo não é shell classificado)
  awk -F'\t' -v f="$1" -v n="$2" '
    $1==f && $3!="EOF" { known=1; if ($2==n) { print $3; exit } }
    END { if (!known) print "code" }' "$SCOPE_TSV" | grep -qx code
}
bad=""
for f in "${TXT[@]}"; do
  rel="$(gate_rel "$f")"
  case "$rel" in tests/*|docs/build-spec/*|BUILD_SPEC.md) continue ;; esac
  m="$(grep -nE '\{\{' "$f" 2>/dev/null || true)"
  [ -z "$m" ] && continue
  while IFS= read -r ln; do
    [ -z "$ln" ] && continue
    lno="${ln%%:*}"
    txt="${ln#*:}"
    case "$rel" in
      *.sh)
        lint_is_code "$rel" "$lno" || continue
        # `'{{'` e `"{{"` — abertura entre aspas, sozinha — é LITERAL DE BUSCA, e é
        # exatamente o que o guarda final de cada renderizador procura ("sobrou placeholder?").
        # Contar essa como órfã é acusar o código que implementa esta mesma regra.
        txt="${txt//\'\{\{\'/}"; txt="${txt//\"\{\{\"/}"
        txt="${txt//\'\}\}\'/}"; txt="${txt//\"\}\}\"/}"
        ;;
    esac
    op="$(printf '%s' "$txt" | grep -o '{{' | grep -c . || true)"
    cl="$(printf '%s' "$txt" | grep -o '}}' | grep -c . || true)"
    if [ "$op" != "$cl" ]; then
      bad="$bad$rel:$ln  ← $op abertura(s) {{ para $cl fechamento(s) }}"$'\n'
      continue
    fi
    case "$rel" in
      *.tmpl|*MANIFEST.tsv) ;;
      *) if printf '%s' "$txt" | grep -qE '\{\{[A-Z0-9_]+\}\}'; then
           bad="$bad$rel:$ln  ← placeholder {{NOME}} fora de um *.tmpl"$'\n'
         fi ;;
    esac
  done <<< "$m"
done
assert_grep_empty "L-03" "nenhum {{ órfão e nenhum placeholder fora de template" \
  "todo {{ tem }} na mesma linha, e {{NOME}} só existe em *.tmpl, no MANIFEST.tsv, na documentação da sintaxe (docs/build-spec/**, BUILD_SPEC.md) e no template embutido do renderizador" "${bad%$'\n'}"

# ─────────────────────────────────────────────────────────── L-04 newline final
gate_section "L-04 · arquivo de texto com newline final"
bad=""
for f in "${TXT[@]}"; do
  [ -s "$f" ] || continue
  if [ "$(tail -c 1 "$f" | od -An -c | tr -d ' ')" != '\n' ]; then
    bad="$bad$(gate_rel "$f"): último byte não é \\n"$'\n'
  fi
done
assert_grep_empty "L-04" "todo arquivo de texto termina com newline" \
  "último byte == \\n (POSIX: linha é terminada, não separada)" "${bad%$'\n'}"

# ─────────────────────────────────────────────────────────── L-05 tabelas markdown
gate_section "L-05 · tabela markdown bem formada"
if [ "${#MD[@]}" -eq 0 ]; then
  gate_skip "L-05" "tabelas markdown" "nenhum .md no repositório"
else
  python3 - "$GATE_ROOT" "${MD[@]}" > "$GATE_TMPDIR/tables.txt" <<'PYEOF'
import os
import re
import sys

root = sys.argv[1]
SEP = re.compile(r"^\|(\s*:?-{2,}:?\s*\|)+\s*$")


def ncols(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    parts, buf, esc = [], "", False
    for ch in s:
        if esc:
            buf += ch
            esc = False
        elif ch == "\\":
            esc = True
            buf += ch
        elif ch == "|":
            parts.append(buf)
            buf = ""
        else:
            buf += ch
    parts.append(buf)
    return len(parts)


out = []
for path in sys.argv[2:]:
    rel = os.path.relpath(path, root)
    try:
        lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
    except OSError:
        continue
    infence = False
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("```"):
            infence = not infence
            i += 1
            continue
        if infence or not line.lstrip().startswith("|"):
            i += 1
            continue
        start = i
        block = []
        while i < len(lines) and lines[i].lstrip().startswith("|"):
            block.append(lines[i])
            i += 1
        if len(block) < 2:
            out.append("%s:%d: linha de tabela solta (sem cabeçalho + separador)" % (rel, start + 1))
            continue
        if not SEP.match(block[1].strip()):
            out.append("%s:%d: tabela sem linha separadora |---|---| logo abaixo do cabeçalho"
                       % (rel, start + 2))
            continue
        want = ncols(block[0])
        for j, row in enumerate(block):
            got = ncols(row)
            if got != want:
                out.append("%s:%d: linha de tabela com %d coluna(s); o cabeçalho tem %d"
                           % (rel, start + 1 + j, got, want))
sys.stdout.write("\n".join(out) + ("\n" if out else ""))
PYEOF
  assert_grep_empty "L-05" "toda tabela markdown é bem formada" \
    "cabeçalho + separador |---|---| + todas as linhas com o mesmo nº de colunas" \
    "$(cat "$GATE_TMPDIR/tables.txt")"
fi

# ─────────────────────────────────────────────────────────── L-06 espaço no fim (aviso)
gate_section "L-06 · espaço em branco no fim da linha (aviso)"
n=0; sample=""
for f in "${TXT[@]}"; do
  m="$(grep -cE '[[:space:]]+$' "$f" 2>/dev/null || true)"
  if [ "${m:-0}" -gt 0 ]; then
    n=$((n + m))
    [ -z "$sample" ] && sample="$(gate_rel "$f") (+$m linha(s))"
  fi
done
if [ "$n" -eq 0 ]; then
  gate_pass "L-06" "nenhuma linha com espaço em branco no fim"
else
  gate_warn "L-06" "$n linha(s) com espaço em branco no fim" "primeiro caso: $sample — não reprova o gate"
fi

gate_summary
