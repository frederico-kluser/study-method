# shellcheck shell=bash
# tests/lib/assert.sh — helpers de asserção do gate do repositório.
#
# APENAS `source`, nunca executado (mesma disciplina de LIB-1 de docs/00-contratos.md §7:
# modo 0644, sem shebang executável, sem bloco main). Consumido por tests/gate-build.sh,
# tests/validate.sh, tests/gate-lint.sh e tests/smoke.sh.
#
# Contrato de saída: toda falha diz O QUE falhou (id + descrição), ONDE (arquivo:linha ou
# comando) e O QUE ERA ESPERADO contra o que foi obtido. Nunca um "FAIL" sem contexto.
#
# Estados de um check:
#   PASS  passou
#   FAIL  violação de contrato — o repositório regrediu
#   PEND  pré-requisito ausente (o artefato verificado ainda não existe) — o gate fica
#         vermelho, mas a mensagem distingue "ainda não escrito" de "escrito errado"
#   SKIP  não aplicável neste ambiente (ferramenta opcional ausente)
#   WARN  divergência que não reprova (ex.: contradição entre dois documentos-fonte)
#
# Prefixos permitidos: `gate_` para controle, `assert_` para asserções, `GATE_` para globais.

if [ -n "${_SM_ASSERT_LOADED:-}" ]; then return 0; fi
_SM_ASSERT_LOADED=1

GATE_PASS=0
GATE_FAIL=0
GATE_PEND=0
GATE_SKIP=0
GATE_WARN=0
GATE_TOTAL=0
GATE_NAME="gate"
GATE_ONLY="${GATE_ONLY:-}"
GATE_VERBOSE="${GATE_VERBOSE:-0}"
GATE_FAILLOG=()
GATE_PENDLOG=()
GATE_WARNLOG=()
GATE_LIMITS=()
GATE_EXCLUSIONS=()

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'
  C_CYA=$'\033[36m'; C_DIM=$'\033[2m';  C_BLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_YEL=''; C_CYA=''; C_DIM=''; C_BLD=''; C_OFF=''
fi

# ---------------------------------------------------------------- raiz e caminhos

# gate_repo_root — imprime a raiz do repositório (o diretório que contém tests/).
gate_repo_root() {
  local here
  here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s\n' "$here"
}

GATE_ROOT="${GATE_ROOT:-$(gate_repo_root)}"
GATE_SK="$GATE_ROOT/skills/study-method"

# gate_rel <caminho> — caminho relativo à raiz do repositório (para mensagens legíveis).
gate_rel() {
  local p="$1"
  case "$p" in
    "$GATE_ROOT"/*) printf '%s\n' "${p#"$GATE_ROOT"/}" ;;
    *) printf '%s\n' "$p" ;;
  esac
}

# ---------------------------------------------------------------- cabeçalho / seções

gate_init() {
  GATE_NAME="$1"
  printf '%s\n' "${C_BLD}══ ${GATE_NAME} ══${C_OFF}"
  printf '%s\n' "${C_DIM}raiz: $GATE_ROOT${C_OFF}"
  if [ -n "$GATE_ONLY" ]; then
    printf '%s\n' "${C_DIM}filtro GATE_ONLY=$GATE_ONLY${C_OFF}"
  fi
  printf '\n'
}

gate_section() {
  printf '\n%s\n' "${C_CYA}${C_BLD}── $* ${C_OFF}"
}

gate_note() {
  printf '   %s\n' "${C_DIM}$*${C_OFF}"
}

# gate_limitation <texto> — registra uma limitação DECLARADA do gate. Sai no resumo final.
# Limitação escondida é pior que limitação conhecida.
gate_limitation() {
  GATE_LIMITS+=("$1")
}

# gate_scope_excl <ids> <o-que-fica-de-fora> <por-quê> — registra uma EXCLUSÃO DE ESCOPO
# declarada: um caminho, um padrão de nome ou uma forma sintática que um check NÃO varre.
# Sai num bloco próprio do resumo. Exclusão escondida é pior que exclusão conhecida: cada
# uma precisa dizer QUAIS checks afeta, O QUE some do escopo e POR QUÊ.
gate_scope_excl() {
  GATE_EXCLUSIONS+=("$1|$2|$3")
}

# ---------------------------------------------------------------- resultados

# gate_should_run <id> — respeita GATE_ONLY (lista separada por vírgula de prefixos de id).
gate_should_run() {
  [ -z "$GATE_ONLY" ] && return 0
  local id="$1" pat
  local IFS=','
  for pat in $GATE_ONLY; do
    case "$id" in "$pat"*) return 0 ;; esac
  done
  return 1
}

gate_pass() {
  local id="$1" desc="$2"
  gate_should_run "$id" || return 0
  GATE_PASS=$((GATE_PASS + 1)); GATE_TOTAL=$((GATE_TOTAL + 1))
  printf '  %s %-6s %s\n' "${C_GRN}✔${C_OFF}" "$id" "$desc"
}

# gate_fail <id> <desc> <esperado> <obtido> [onde]
gate_fail() {
  local id="$1" desc="$2" exp="$3" got="$4" where="${5:-}"
  gate_should_run "$id" || return 0
  GATE_FAIL=$((GATE_FAIL + 1)); GATE_TOTAL=$((GATE_TOTAL + 1))
  printf '  %s %-6s %s\n' "${C_RED}✘${C_OFF}" "$id" "${C_BLD}$desc${C_OFF}"
  [ -n "$where" ] && printf '          %s %s\n' "${C_DIM}onde:    ${C_OFF}" "$where"
  printf '          %s %s\n' "${C_DIM}esperado:${C_OFF}" "$exp"
  printf '          %s %s\n' "${C_DIM}obtido:  ${C_OFF}" "$got"
  GATE_FAILLOG+=("$id | $desc | onde: ${where:-—} | esperado: $exp | obtido: $got")
}

# gate_pend <id> <desc> <pré-requisito ausente>
gate_pend() {
  local id="$1" desc="$2" missing="$3"
  gate_should_run "$id" || return 0
  GATE_PEND=$((GATE_PEND + 1)); GATE_TOTAL=$((GATE_TOTAL + 1))
  printf '  %s %-6s %s\n' "${C_YEL}◌${C_OFF}" "$id" "$desc"
  printf '          %s %s\n' "${C_DIM}pendente:${C_OFF}" "pré-requisito ausente — $missing"
  GATE_PENDLOG+=("$id | $desc | ausente: $missing")
}

gate_skip() {
  local id="$1" desc="$2" why="$3"
  gate_should_run "$id" || return 0
  GATE_SKIP=$((GATE_SKIP + 1)); GATE_TOTAL=$((GATE_TOTAL + 1))
  printf '  %s %-6s %s %s\n' "${C_DIM}–${C_OFF}" "$id" "$desc" "${C_DIM}($why)${C_OFF}"
}

gate_warn() {
  local id="$1" desc="$2" detail="$3"
  gate_should_run "$id" || return 0
  GATE_WARN=$((GATE_WARN + 1))
  printf '  %s %-6s %s\n' "${C_YEL}!${C_OFF}" "$id" "$desc"
  printf '          %s %s\n' "${C_DIM}detalhe: ${C_OFF}" "$detail"
  GATE_WARNLOG+=("$id | $desc | $detail")
}

# ---------------------------------------------------------------- asserções

# assert_eq <id> <desc> <esperado> <obtido> [onde]
assert_eq() {
  local id="$1" desc="$2" exp="$3" got="$4" where="${5:-}"
  if [ "$exp" = "$got" ]; then
    gate_pass "$id" "$desc"
  else
    gate_fail "$id" "$desc" "$exp" "$got" "$where"
  fi
}

# assert_ne <id> <desc> <proibido> <obtido> [onde]
assert_ne() {
  local id="$1" desc="$2" bad="$3" got="$4" where="${5:-}"
  if [ "$bad" != "$got" ]; then
    gate_pass "$id" "$desc"
  else
    gate_fail "$id" "$desc" "qualquer valor diferente de «$bad»" "$got" "$where"
  fi
}

# assert_match <id> <desc> <texto> <regex ERE> [onde]
assert_match() {
  local id="$1" desc="$2" text="$3" re="$4" where="${5:-}"
  if printf '%s' "$text" | grep -qE -- "$re"; then
    gate_pass "$id" "$desc"
  else
    gate_fail "$id" "$desc" "texto casando /$re/" "$(gate_trunc "$text")" "$where"
  fi
}

# assert_nomatch <id> <desc> <texto> <regex ERE proibida> [onde]
assert_nomatch() {
  local id="$1" desc="$2" text="$3" re="$4" where="${5:-}"
  if printf '%s' "$text" | grep -qE -- "$re"; then
    gate_fail "$id" "$desc" "nenhuma ocorrência de /$re/" "$(gate_trunc "$text")" "$where"
  else
    gate_pass "$id" "$desc"
  fi
}

# assert_file <id> <caminho> <desc>
assert_file() {
  local id="$1" path="$2" desc="$3"
  if [ -f "$path" ]; then
    gate_pass "$id" "$desc"
  else
    gate_pend "$id" "$desc" "arquivo inexistente: $(gate_rel "$path")"
  fi
}

# assert_dir <id> <caminho> <desc>
assert_dir() {
  local id="$1" path="$2" desc="$3"
  if [ -d "$path" ]; then
    gate_pass "$id" "$desc"
  else
    gate_pend "$id" "$desc" "diretório inexistente: $(gate_rel "$path")"
  fi
}

# assert_exit <id> <esperado> <desc> -- <comando...>
# Roda o comando com stdout+stderr capturados; compara o exit code.
assert_exit() {
  local id="$1" exp="$2" desc="$3"; shift 3
  [ "${1:-}" = "--" ] && shift
  local out rc
  out="$("$@" 2>&1)" && rc=0 || rc=$?
  if [ "$rc" = "$exp" ]; then
    gate_pass "$id" "$desc"
  else
    gate_fail "$id" "$desc" "exit $exp" "exit $rc — saída: $(gate_trunc "$out")" "$*"
  fi
}

# assert_grep_empty <id> <desc> <esperado-em-pt-BR> <resultado-do-grep>
# O chamador roda o grep (assim ele controla escopo/exclusões) e passa as linhas casadas.
assert_grep_empty() {
  local id="$1" desc="$2" exp="$3" hits="$4"
  if [ -z "$hits" ]; then
    gate_pass "$id" "$desc"
  else
    local n; n="$(printf '%s\n' "$hits" | grep -c . || true)"
    gate_fail "$id" "$desc" "$exp" "$n ocorrência(s):
$(printf '%s\n' "$hits" | head -8 | sed 's/^/            /')" ""
  fi
}

# gate_trunc <texto> [n] — corta texto longo para caber numa linha de diagnóstico.
gate_trunc() {
  local t="$1" n="${2:-220}"
  t="${t//$'\n'/ ⏎ }"
  if [ "${#t}" -gt "$n" ]; then
    printf '%s…\n' "${t:0:$n}"
  else
    printf '%s\n' "$t"
  fi
}

# ---------------------------------------------------------------- listagem de arquivos

# GATE_PRUNE_DIRS — os diretórios que NENHUM gate varre, casados POR NOME em qualquer
# profundidade. É a MESMA fronteira que o `.gitignore` do repositório já declara: nada
# aqui é versionado, nada aqui é código do pacote.
#
#   por que existe: `app/node_modules` traz 576 pacotes de terceiro. Varrê-los faz o gate
#   reprovar o repositório por CRLF do `bignumber.js` e por `{{ }}` do README de um
#   `@emotion/react` — defeitos de quem não somos nós, que ninguém aqui pode consertar e
#   que treinam todo mundo a ignorar o vermelho. Saída de build (`out/`, `dist/`,
#   `test-results/`, `playwright-report/`, `coverage/`) é derivada: consertá-la é
#   consertar o gerador, não o arquivo.
#
#   o que NÃO é: um afrouxamento. Todo arquivo VERSIONADO continua no escopo — inclusive
#   `app/content-src/**`, `app/tsconfig*.json` e os fixtures de teste. Tirar um arquivo do
#   pacote deste escopo continua sendo um afrouxamento proibido (CONTRIBUTING.md).
GATE_PRUNE_DIRS=(
  .git .deep-orchestrator .deep-orchestrator-preferences
  node_modules
  __pycache__ .pytest_cache .venv venv
  target out dist test-results playwright-report coverage
  .idea .vscode
)

# GATE_PRUNE — os argumentos de poda do find, montados UMA vez a partir de GATE_PRUNE_DIRS.
# Uso:  find "$dir" "${GATE_PRUNE[@]}" -type f ... -print0
# (o array já termina em `-prune -o`; array em vez de string porque `set -f` não está
# ligado e word splitting de nome de diretório é como se perde um caminho com espaço).
GATE_PRUNE=( '(' )
for _gate_prune_d in "${GATE_PRUNE_DIRS[@]}"; do
  [ "${#GATE_PRUNE[@]}" -eq 1 ] || GATE_PRUNE+=( -o )
  GATE_PRUNE+=( -name "$_gate_prune_d" )
done
GATE_PRUNE+=( ')' -prune -o )
unset _gate_prune_d

# gate_prune_note — a frase única que descreve a poda, para o `gate_scope_excl` de cada
# gate (a exclusão é DECLARADA no resumo, nunca silenciosa).
gate_prune_note() {
  printf '%s\n' "diretório de dependência de terceiro ou de saída de build (${GATE_PRUNE_DIRS[*]}), casado por NOME em qualquer profundidade — a mesma fronteira do .gitignore. Todo arquivo VERSIONADO continua no escopo do check."
}

# gate_find_into <subdir> <padrão...> — imprime NUL-separado no STDOUT, respeitando
# caminhos com espaço. O chamador monta o array:
#     while IFS= read -r -d '' f; do ARR+=("$f"); done < <(gate_find_into ...)
# (nameref — a forma 'local' com sufixo '-n' — é bash 4.3+; no bash 3.2 do macOS o contrato é saída NUL).
# Exclui GATE_PRUNE_DIRS (ver acima).
gate_find_into() {
  local dir="$1"; shift
  [ -d "$dir" ] || return 0
  find "$dir" "${GATE_PRUNE[@]}" -type f "$@" -print0 2>/dev/null | sort -z
}

# ---------------------------------------------------------------- verificador mínimo de schema

# gate_schema_validator — materializa (uma vez) o verificador mínimo de JSON Schema em
# Python stdlib e imprime o caminho. Não há `jsonschema` nesta máquina e o PEP 668 impede
# instalar; a cobertura é PARCIAL POR DESIGN (docs/00-contratos.md §4.3).
GATE_TMPDIR="${GATE_TMPDIR:-${TMPDIR:-/tmp}/sm-gate-$$}"
gate_schema_validator() {
  local dest="$GATE_TMPDIR/jsonschema_min.py"
  if [ -f "$dest" ]; then printf '%s\n' "$dest"; return 0; fi
  mkdir -p "$GATE_TMPDIR"
  cat > "$dest" <<'PYEOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verificador MINIMO de JSON Schema — stdlib pura, sem `jsonschema`.

COBERTURA (parcial POR DESIGN, docs/00-contratos.md §4.3):
    type (string OU array de strings, ex. ["string","null"]), required, enum, const,
    pattern, properties, items, additionalProperties (false | true | subschema),
    minimum, maximum, exclusiveMinimum, exclusiveMaximum,
    minLength, maxLength, minItems, maxItems, uniqueItems

NAO SUPORTA (e recusa o schema se encontrar):
    $ref, allOf, anyOf, oneOf, not, if/then/else, $defs, definitions,
    patternProperties, propertyNames, dependentSchemas, dependentRequired,
    contains, unevaluatedProperties, format (ignorado, nunca validado)

Uso:
    jsonschema_min.py <instancia.json> <schema.json>        valida a instancia
    jsonschema_min.py --lint-schema <schema.json>           so confere a cobertura

Saida: uma linha por erro em stderr, no formato "<json-pointer>: <motivo>".
Exit:  0 valido · 5 invalido · 2 uso incorreto · 1 I/O
"""
import json
import re
import sys

SUPPORTED = {
    "$schema", "$id", "$comment", "title", "description", "default", "examples",
    "type", "required", "enum", "const", "pattern", "properties", "items",
    "additionalProperties", "minimum", "maximum", "exclusiveMinimum",
    "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems",
    "uniqueItems", "format", "deprecated", "readOnly", "writeOnly",
}
FORBIDDEN = {
    "$ref", "allOf", "anyOf", "oneOf", "not", "if", "then", "else", "$defs",
    "definitions", "patternProperties", "propertyNames", "dependentSchemas",
    "dependentRequired", "contains", "unevaluatedProperties", "unevaluatedItems",
    "$anchor", "$dynamicRef",
}

TYPEMAP = {
    "string": str, "object": dict, "array": list, "boolean": bool, "null": type(None),
}


def is_type(value, name):
    if name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if name == "boolean":
        return isinstance(value, bool)
    py = TYPEMAP.get(name)
    if py is None:
        return False
    return isinstance(value, py)


def lint_schema(node, ptr, errs):
    """Recusa construcoes fora da cobertura. `node` em posicao de schema."""
    if not isinstance(node, dict):
        return
    for key in node:
        if key in FORBIDDEN:
            errs.append("%s/%s: construcao proibida no schema (fora da cobertura do "
                        "verificador minimo)" % (ptr, key))
        elif key not in SUPPORTED:
            errs.append("%s/%s: palavra-chave desconhecida (o verificador minimo a "
                        "ignoraria em silencio)" % (ptr, key))
    props = node.get("properties")
    if isinstance(props, dict):
        for name, sub in props.items():
            lint_schema(sub, "%s/properties/%s" % (ptr, name), errs)
    items = node.get("items")
    if isinstance(items, dict):
        lint_schema(items, ptr + "/items", errs)
    ap = node.get("additionalProperties")
    if isinstance(ap, dict):
        lint_schema(ap, ptr + "/additionalProperties", errs)


def validate(inst, schema, ptr, errs):
    if not isinstance(schema, dict):
        return

    if "type" in schema:
        t = schema["type"]
        names = t if isinstance(t, list) else [t]
        if not any(is_type(inst, n) for n in names):
            errs.append("%s: tipo invalido — esperado %s, obtido %s"
                        % (ptr or "/", "|".join(names), type(inst).__name__))
            return

    if "enum" in schema and inst not in schema["enum"]:
        errs.append("%s: valor fora do enum — esperado um de %s, obtido %r"
                    % (ptr or "/", json.dumps(schema["enum"], ensure_ascii=False), inst))

    if "const" in schema and inst != schema["const"]:
        errs.append("%s: const violado — esperado %r, obtido %r"
                    % (ptr or "/", schema["const"], inst))

    if isinstance(inst, str):
        pat = schema.get("pattern")
        if pat is not None and re.search(pat, inst) is None:
            errs.append("%s: nao casa o pattern %s — obtido %r" % (ptr or "/", pat, inst))
        if "minLength" in schema and len(inst) < schema["minLength"]:
            errs.append("%s: string curta demais — minimo %d, obtido %d"
                        % (ptr or "/", schema["minLength"], len(inst)))
        if "maxLength" in schema and len(inst) > schema["maxLength"]:
            errs.append("%s: string longa demais — maximo %d, obtido %d"
                        % (ptr or "/", schema["maxLength"], len(inst)))

    if isinstance(inst, (int, float)) and not isinstance(inst, bool):
        if "minimum" in schema and inst < schema["minimum"]:
            errs.append("%s: menor que o minimo %s — obtido %s"
                        % (ptr or "/", schema["minimum"], inst))
        if "maximum" in schema and inst > schema["maximum"]:
            errs.append("%s: maior que o maximo %s — obtido %s"
                        % (ptr or "/", schema["maximum"], inst))
        if "exclusiveMinimum" in schema and inst <= schema["exclusiveMinimum"]:
            errs.append("%s: nao respeita exclusiveMinimum %s — obtido %s"
                        % (ptr or "/", schema["exclusiveMinimum"], inst))
        if "exclusiveMaximum" in schema and inst >= schema["exclusiveMaximum"]:
            errs.append("%s: nao respeita exclusiveMaximum %s — obtido %s"
                        % (ptr or "/", schema["exclusiveMaximum"], inst))

    if isinstance(inst, list):
        if "minItems" in schema and len(inst) < schema["minItems"]:
            errs.append("%s: array curto demais — minimo %d, obtido %d"
                        % (ptr or "/", schema["minItems"], len(inst)))
        if "maxItems" in schema and len(inst) > schema["maxItems"]:
            errs.append("%s: array longo demais — maximo %d, obtido %d"
                        % (ptr or "/", schema["maxItems"], len(inst)))
        if schema.get("uniqueItems") is True:
            seen = [json.dumps(x, sort_keys=True, ensure_ascii=False) for x in inst]
            if len(set(seen)) != len(seen):
                errs.append("%s: array com itens repetidos (uniqueItems)" % (ptr or "/"))
        sub = schema.get("items")
        if isinstance(sub, dict):
            for i, item in enumerate(inst):
                validate(item, sub, "%s/%d" % (ptr, i), errs)

    if isinstance(inst, dict):
        for name in schema.get("required", []):
            if name not in inst:
                errs.append("%s: propriedade obrigatoria ausente — %r" % (ptr or "/", name))
        props = schema.get("properties", {})
        if isinstance(props, dict):
            for name, sub in props.items():
                if name in inst:
                    validate(inst[name], sub, "%s/%s" % (ptr, name), errs)
        ap = schema.get("additionalProperties", True)
        if ap is False:
            extra = sorted(k for k in inst if k not in props)
            for name in extra:
                errs.append("%s/%s: propriedade nao declarada e additionalProperties e "
                            "false" % (ptr or "", name))
        elif isinstance(ap, dict):
            for name in sorted(k for k in inst if k not in props):
                validate(inst[name], ap, "%s/%s" % (ptr, name), errs)


def load(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, IOError) as exc:
        sys.stderr.write("erro de I/O: %s\n" % exc)
        sys.exit(1)
    except ValueError as exc:
        sys.stderr.write("%s: JSON invalido — %s\n" % (path, exc))
        sys.exit(5)


def main(argv):
    if len(argv) == 3 and argv[1] == "--lint-schema":
        schema = load(argv[2])
        errs = []
        lint_schema(schema, "", errs)
        for e in errs:
            sys.stderr.write(e + "\n")
        return 5 if errs else 0
    if len(argv) != 3:
        sys.stderr.write(__doc__)
        return 2
    inst = load(argv[1])
    schema = load(argv[2])
    errs = []
    lint_schema(schema, "", errs)
    if errs:
        for e in errs:
            sys.stderr.write("SCHEMA " + e + "\n")
        return 5
    validate(inst, schema, "", errs)
    for e in errs:
        sys.stderr.write(e + "\n")
    return 5 if errs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PYEOF
  printf '%s\n' "$dest"
}

gate_cleanup_tmp() {
  [ -n "${GATE_TMPDIR:-}" ] && [ -d "$GATE_TMPDIR" ] && rm -rf -- "$GATE_TMPDIR"
  return 0
}

# ---------------------------------------------------------------- resumo

# gate_summary — imprime o resumo e devolve 0 se tudo passou, 1 caso contrário.
gate_summary() {
  printf '\n%s\n' "${C_BLD}── resumo: $GATE_NAME ──${C_OFF}"
  if [ "${#GATE_LIMITS[@]}" -gt 0 ]; then
    printf '\n  %s\n' "${C_YEL}LIMITAÇÕES DECLARADAS deste gate${C_OFF}"
    local l
    for l in "${GATE_LIMITS[@]}"; do
      printf '    · %s\n' "$l"
    done
  fi
  if [ "${#GATE_EXCLUSIONS[@]}" -gt 0 ]; then
    printf '\n  %s\n' "${C_YEL}EXCLUSÕES DE ESCOPO DECLARADAS (o que estes checks NÃO varrem)${C_OFF}"
    local e ids what why
    for e in "${GATE_EXCLUSIONS[@]}"; do
      ids="${e%%|*}"; what="${e#*|}"; why="${what#*|}"; what="${what%%|*}"
      printf '    · %-28s %s\n' "$ids" "$what"
      printf '      %s%s%s\n' "$C_DIM" "$why" "$C_OFF"
    done
  fi
  if [ "$GATE_FAIL" -gt 0 ]; then
    printf '\n  %s\n' "${C_RED}${C_BLD}FALHAS (violação de contrato)${C_OFF}"
    local f
    for f in "${GATE_FAILLOG[@]}"; do printf '    ✘ %s\n' "$f"; done
  fi
  if [ "$GATE_PEND" -gt 0 ]; then
    printf '\n  %s\n' "${C_YEL}${C_BLD}PENDENTES (artefato ainda não existe)${C_OFF}"
    local p
    for p in "${GATE_PENDLOG[@]}"; do printf '    ◌ %s\n' "$p"; done
  fi
  printf '\n  %s%d passou%s · %s%d falhou%s · %s%d pendente%s · %d ignorado · %d aviso  (total %d)\n' \
    "$C_GRN" "$GATE_PASS" "$C_OFF" \
    "$C_RED" "$GATE_FAIL" "$C_OFF" \
    "$C_YEL" "$GATE_PEND" "$C_OFF" \
    "$GATE_SKIP" "$GATE_WARN" "$GATE_TOTAL"
  if [ "$GATE_FAIL" -gt 0 ] || [ "$GATE_PEND" -gt 0 ]; then
    printf '  %s\n\n' "${C_RED}${C_BLD}GATE VERMELHO${C_OFF}"
    return 1
  fi
  printf '  %s\n\n' "${C_GRN}${C_BLD}GATE VERDE${C_OFF}"
  return 0
}

# ---------------------------------------------------------------- escopo léxico de shell

# gate_shell_scope_tool — materializa (uma vez) em $GATE_TMPDIR o classificador léxico de
# fonte shell e imprime o caminho. Existe porque a diferença entre USAR um construto e
# FALAR dele é a diferença entre um defeito e um falso positivo: `exit 10` dentro de
# `sm_request` é o contrato; a mesma linha noutra função é violação. Um grep de linha não
# distingue os dois — este classificador distingue.
#
#   shellscope.py classify <raiz> <arquivo...>
#
# Emite TSV, uma linha por linha de arquivo:
#   rel <TAB> nº <TAB> kind <TAB> fn <TAB> depth <TAB> código
#     kind   `code` (executa) · `comment` (comentário) · `heredoc` (corpo de here-document)
#     fn     pilha de funções que envolvem a linha, separada por `>`; vazio no nível de topo
#     depth  profundidade de chaves `{ }`
#     código a linha SEM o comentário de fim de linha, com TAB trocado por espaço
gate_shell_scope_tool() {
  local dest="$GATE_TMPDIR/shellscope.py"
  if [ -f "$dest" ]; then printf '%s\n' "$dest"; return 0; fi
  mkdir -p "$GATE_TMPDIR"
  cat > "$dest" <<'PYSHELLSCOPE'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Classificador lexico de fonte shell: comentario, here-document e escopo de funcao.

Nao e um parser de shell completo e nao pretende ser. Cobre, deterministicamente:
  · aspas simples e duplas, INCLUSIVE quando a string atravessa varias linhas
    (um programa `jq` multilinha entre aspas simples nao muda profundidade);
  · comentario de fim de linha (`#` no inicio de palavra, fora de aspas);
  · here-document, com e sem aspas no delimitador, com e sem `<<-`;
  · abertura/fechamento de funcao `nome() {` e `function nome {`, aninhadas, com o `{`
    na mesma linha ou na seguinte;
  · grupo de comandos `{ ...; }`, que conta profundidade mas nao nomeia funcao.
Fora da cobertura, DECLARADO: continuacao de linha por barra invertida dentro de um
comentario, e substituicao `$( ... )` com chave desbalanceada dentro. O gate valida a si
mesmo: se a profundidade nao voltar a zero no fim de um arquivo, o proprio check acusa.
"""
import os
import re
import sys

FN_DEF = re.compile(r"(?:^|[\s;&|(])(?:function\s+)?([A-Za-z_][A-Za-z0-9_:.\-]*)\s*\(\)\s*$")
FN_DEF_KW = re.compile(r"(?:^|[\s;&|(])function\s+([A-Za-z_][A-Za-z0-9_:.\-]*)\s*$")
HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*(?:'([^']+)'|\"([^\"]+)\"|([A-Za-z_][A-Za-z0-9_]*))")

WORD_BEFORE = set(" \t;&|(){}")


def walk(line, quote):
    """Percorre uma linha carregando o estado de aspas entre linhas.

    Devolve (codigo, nu, tokens, quote_no_fim):
      codigo  a linha sem o comentario de fim de linha;
      nu      o mesmo texto com TODO trecho entre aspas trocado por espaco (as posicoes
              sao preservadas) — e nele que se procura here-document e definicao de funcao,
              para que uma dessas formas DENTRO de uma string nao conte;
      tokens  lista de ('{'|'}', posicao) fora de aspas.
    """
    toks = []
    bare = []
    i = 0
    n = len(line)
    while i < n:
        ch = line[i]
        if ch == "\\" and quote != "'":
            bare.append(" " if quote else ch)
            if i + 1 < n:
                bare.append(" " if quote else line[i + 1])
            i += 2
            continue
        if quote is None:
            if ch in "'\"":
                quote = ch
                bare.append(" ")
            elif ch == "#" and (line[i - 1] if i else " ") in WORD_BEFORE:
                return line[:i], "".join(bare), toks, None
            else:
                bare.append(ch)
                if ch in "{}":
                    prev = line[i - 1] if i else " "
                    nxt = line[i + 1] if i + 1 < n else " "
                    if ch == "{":
                        if prev != "$" and prev in WORD_BEFORE and nxt in " \t":
                            toks.append(("{", i))
                    elif prev in WORD_BEFORE or prev == ";":
                        toks.append(("}", i))
        else:
            bare.append(" ")
            if ch == quote:
                quote = None
        i += 1
    return line, "".join(bare), toks, quote


def classify(path, root):
    rel = os.path.relpath(path, root)
    try:
        lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
    except OSError:
        return []
    out = []
    stack = []
    pending_fn = None
    heredocs = []
    quote = None
    for idx, raw in enumerate(lines):
        lineno = idx + 1
        fnstack = ">".join(x for x in stack if x)
        if heredocs:
            if raw.strip() == heredocs[0]:
                heredocs.pop(0)
            out.append((rel, lineno, "heredoc", fnstack, len(stack), raw.replace("\t", " ")))
            continue
        in_string = quote is not None
        code, bare, toks, quote = walk(raw, quote)
        if in_string:
            kind = "string"
        elif not code.strip():
            kind = "blank" if code == raw else "comment"
        else:
            kind = "code"
        out.append((rel, lineno, kind, fnstack, len(stack), code.replace("\t", " ")))
        if kind in ("comment", "blank") or in_string:
            continue
        for m in HEREDOC.finditer(code):
            # o `<<` precisa estar FORA de aspas; o delimitador pode vir entre aspas
            # (`<<'"'"'EOF'"'"'`), e por isso a busca roda no texto original e nao no nu.
            if m.start() < len(bare) and bare[m.start()] == "<":
                heredocs.append(m.group(1) or m.group(2) or m.group(3))
        for tok, pos in toks:
            if tok == "{":
                seg = bare[:pos]
                m = FN_DEF.search(seg) or FN_DEF_KW.search(seg)
                if m:
                    stack.append(m.group(1))
                elif pending_fn is not None and not seg.strip():
                    stack.append(pending_fn)
                else:
                    stack.append("")
                pending_fn = None
            elif stack:
                stack.pop()
        if not toks:
            m = FN_DEF.search(bare.rstrip()) or FN_DEF_KW.search(bare.rstrip())
            pending_fn = m.group(1) if m else None
    out.append((rel, 0, "EOF", "", len(stack), ""))
    return out


def main(argv):
    if len(argv) < 3 or argv[1] != "classify":
        sys.stderr.write("uso: shellscope.py classify <raiz> <arquivo...>\n")
        return 2
    root = argv[2]
    rows = []
    for path in argv[3:]:
        rows.extend(classify(path, root))
    sys.stdout.write("".join("%s\t%d\t%s\t%s\t%d\t%s\n" % r for r in rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PYSHELLSCOPE
  printf '%s\n' "$dest"
}
