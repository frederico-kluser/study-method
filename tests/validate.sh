#!/usr/bin/env bash
# tests/validate.sh — O GATE DE CONTRATO. Implementa as 43 invariantes de
# `docs/00-contratos.md` §11 (I-01..I-43), mais as verificações estruturais que o §4, o §7,
# o §9 e o §10 exigem e que o §11 não numerou (G-01..G-12).
#
# `docs/00-contratos.md` VENCE. Este script é a tradução mecânica daquele documento: quando
# um deles muda, o outro muda junto — e uma PR que muda vocabulário, caminho, exit code ou
# CLI sem tocar o contrato é rejeitada aqui.
#
# LIMITAÇÕES DECLARADAS (impressas no resumo — limitação escondida é pior que conhecida):
#   · o verificador de JSON Schema é MÍNIMO (stdlib pura, sem `jsonschema`): cobre type
#     (inclusive array), required, enum, const, pattern, properties, items,
#     additionalProperties, minimum/maximum, minLength/maxLength, minItems/maxItems,
#     uniqueItems — e NADA além disso;
#   · as invariantes sobre comportamento de script (I-24..I-32) são, em parte, ANÁLISE
#     ESTÁTICA de texto: pegam o padrão declarado, não todo caminho de execução possível;
#   · a busca por termo revogado aceita a linha que cita o termo em contexto explicitamente
#     revogatório (marcadores em REVOKE_MARKERS) — senão `docs/01` e `references/bootstrap.md`,
#     que DIZEM "isso não existe", seriam falsos positivos.
#
# Uso:  tests/validate.sh [-h] [--list]
# Env:  GATE_ONLY=I-08,I-3   roda só os checks cujo id começa por um desses prefixos
#       STUDY_METHOD_TODAY   data fixa; usada nas invariantes de runtime (determinismo)
# Exit: 0 tudo verde · 1 há falha (violação) ou pendência (artefato ainda inexistente)
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/lib/assert.sh
. "$SELF_DIR/lib/assert.sh"

case "${1:-}" in
  -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  --list) grep -oE '^# +(I-[0-9]{2}|G-[0-9]{2}) .*' "${BASH_SOURCE[0]}" | sed 's/^# *//'; exit 0 ;;
  "") ;;
  *) printf 'uso incorreto: argumento desconhecido «%s». Veja --help.\n' "$1" >&2; exit 2 ;;
esac

trap gate_cleanup_tmp EXIT
mkdir -p "$GATE_TMPDIR"

export STUDY_METHOD_TODAY="${STUDY_METHOD_TODAY:-2026-08-23}"

SK="$GATE_SK"
CONTRACT="$GATE_ROOT/docs/00-contratos.md"
SKILL_MD="$SK/SKILL.md"
SCHEMA_DIR="$SK/assets/schemas"
SCRIPT_DIR="$SK/scripts"
LIB_DIR="$SCRIPT_DIR/lib"
TPL_DIR="$SK/assets/templates"

gate_init "validate — as 43 invariantes de docs/00-contratos.md §11"
gate_limitation "Verificador de JSON Schema MÍNIMO (stdlib): type (inclusive array, ex. [\"string\",\"null\"]), required, enum, const, pattern, properties, items, additionalProperties, minimum/maximum, minLength/maxLength, minItems/maxItems, uniqueItems. Nada além disso — \$ref, allOf/anyOf/oneOf, if/then/else, \$defs, patternProperties, propertyNames e dependentSchemas são RECUSADOS, não interpretados."
gate_limitation "I-24, I-25, I-26 e I-27 são ANÁLISE ESTÁTICA de texto: acusam o padrão declarado no fonte, não provam ausência em todo caminho de execução."
gate_limitation "A busca por termo revogado (I-01, I-03, I-04, I-05, I-15) aceita a linha em contexto explicitamente revogatório e ignora docs/00-contratos.md e docs/research/ — ambos citam os termos de propósito."
gate_limitation "\`format\` de JSON Schema nunca é validado pelo verificador mínimo: o contrato usa \`pattern\`, e um schema que dependesse de \`format\` passaria aqui sem checagem real."

if [ ! -f "$CONTRACT" ]; then
  printf 'erro 1: docs/00-contratos.md ausente — sem a autoridade não há gate.\n' >&2
  exit 1
fi

# ═════════════════════════════════════════════════════════ helpers de escopo de busca

# Marcadores de contexto revogatório: uma linha (ou a sua vizinha) que cita um termo revogado
# JUNTO com um destes está DIZENDO que o termo morreu — é documentação correta, não regressão.
REVOKE_MARKERS='nao existe|não existe|inexistente|removid|revogad|descartad|resolvida|vence |era `|antig[oa]|deixou de|proibid|nunca|não aparece|não pode|n[ãa]o [ée]|não cite|em vez de|substitu|obsolet|legado|não tinham contrato|caiu junto|versão anterior|mentind|diga:|não use|não confundir|desambigua'

# SCAN_FILES — arquivos NORMATIVOS do repositório e da skill. Fora do escopo, de propósito:
#   docs/00-contratos.md  (é a autoridade: cita os termos revogados nas próprias invariantes)
#   docs/research/**      (registro histórico auditado, escrito antes das arbitragens)
#   tests/**              (o gate precisa conter os termos que procura)
declare -a SCAN_FILES=()
_build_scan() {
  local f
  while IFS= read -r -d '' f; do
    case "$f" in
      "$CONTRACT") continue ;;
      "$GATE_ROOT"/docs/research/*) continue ;;
      "$GATE_ROOT"/tests/*) continue ;;
    esac
    SCAN_FILES+=("$f")
  done < <(
    find "$GATE_ROOT/docs" "$SK" "$GATE_ROOT/examples" "$GATE_ROOT/evals" "$GATE_ROOT/README.md" \
      \( -name .git -o -name .deep-orchestrator -o -name __pycache__ \) -prune -o \
      -type f \( -name '*.md' -o -name '*.json' -o -name '*.sh' -o -name '*.py' \
                 -o -name '*.tsv' -o -name '*.tmpl' -o -name '*.txt' \) -print0 2>/dev/null | sort -z
  )
}
_build_scan

SCANNER="$GATE_TMPDIR/scan.py"
cat > "$SCANNER" <<'PYEOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca por termo em arquivos normativos, tolerante a CONTEXTO REVOGATORIO.

Uso: scan.py <modo> <regex> <markers-regex> <raiz> <arquivo...>
  modo `revoke`: descarta a linha cujo texto — ou o da linha anterior/seguinte — casa
                 <markers-regex> (case-insensitive). E a diferenca entre USAR o termo
                 revogado e DIZER que ele morreu.
  modo `raw`:    sem tolerancia nenhuma.
Saida: uma linha `rel:linha: texto` por achado.
"""
import os
import re
import sys


def main(argv):
    mode, pat, markers, root = argv[1], argv[2], argv[3], argv[4]
    rx = re.compile(pat)
    mk = re.compile(markers, re.IGNORECASE) if markers else None
    out = []
    for path in argv[5:]:
        rel = os.path.relpath(path, root)
        try:
            lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
        except OSError:
            continue
        for i, line in enumerate(lines):
            if not rx.search(line):
                continue
            if mode == "revoke" and mk is not None:
                window = "\n".join(lines[max(0, i - 1):i + 2])
                if mk.search(window):
                    continue
            out.append("%s:%d: %s" % (rel, i + 1, line.strip()[:200]))
    sys.stdout.write("\n".join(out) + ("\n" if out else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PYEOF

# grep_scope <ERE> — casa o padrão em SCAN_FILES descartando o contexto revogatório.
grep_scope() {
  [ "${#SCAN_FILES[@]}" -eq 0 ] && return 0
  python3 "$SCANNER" revoke "$1" "$REVOKE_MARKERS" "$GATE_ROOT" "${SCAN_FILES[@]}"
}

# grep_scope_raw <ERE> — igual, sem tolerância nenhuma.
grep_scope_raw() {
  [ "${#SCAN_FILES[@]}" -eq 0 ] && return 0
  python3 "$SCANNER" raw "$1" "" "$GATE_ROOT" "${SCAN_FILES[@]}"
}

declare -a SCHEMAS=()
gate_find_into SCHEMAS "$SCHEMA_DIR" -name '*.json'

# ════════════════════════════════════════════════ auditoria estrutural dos schemas (python)
AUDIT="$GATE_TMPDIR/schema_audit.py"
cat > "$AUDIT" <<'PYEOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Auditoria estrutural dos schemas — stdlib pura.

Emite uma linha TSV por achado:  CODIGO \t arquivo \t json-pointer \t detalhe
CODIGOS:
  I08  construcao proibida ($ref, allOf, anyOf, oneOf, not, if/then/else, $defs,
       patternProperties, propertyNames, dependentSchemas, contains, ...)
  I09  palavra-chave fora da cobertura do verificador minimo (seria ignorada em silencio)
  I12  campo setup_id com pattern diferente do canonico
  I13  campo *_at sem pattern, ou com pattern de timestamp sem a fracao opcional
  I16  concept_id/scenario_id ou slug/topic com pattern diferente do canonico
  G01  propriedade sem `description`
  G03  vocabulario com ASSINATURA DIVERGENTE entre schemas (mesmo nome, contratos diferentes)
  G11  campo hint_level* fora da faixa 0..5
"""
import json
import os
import sys

FORBIDDEN = {
    "$ref", "allOf", "anyOf", "oneOf", "not", "if", "then", "else", "$defs",
    "definitions", "patternProperties", "propertyNames", "dependentSchemas",
    "dependentRequired", "contains", "unevaluatedProperties", "unevaluatedItems",
    "$anchor", "$dynamicRef", "$dynamicAnchor",
}
SUPPORTED = {
    "$schema", "$id", "$comment", "title", "description", "default", "examples",
    "type", "required", "enum", "const", "pattern", "properties", "items",
    "additionalProperties", "minimum", "maximum", "exclusiveMinimum",
    "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems",
    "uniqueItems", "format", "deprecated", "readOnly", "writeOnly",
}

P_SETUP_ID = r"^[0-9a-f]{12}$"
P_SEQ4 = r"^[0-9]{4}$"
P_FACT = r"^f-[0-9]{4}$"
P_CONCEPT = r"^[a-z][a-z0-9_]{1,62}$"
P_SLUG = r"^[a-z0-9]+(-[a-z0-9]+)*$"
P_DATE = r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
P_TS = (r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
        r"([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$")
P_SHA = r"^[a-f0-9]{64}$"
P_SCHEMA_VERSION = r"^[0-9]+\.[0-9]+$"

# nome de propriedade -> pattern canonico do §4.2
CANON = {
    "setup_id": P_SETUP_ID,
    "session_id": P_SEQ4,
    "for_session_id": P_SEQ4,
    "created_in_session": P_SEQ4,
    "closed_in_session": P_SEQ4,
    "challenge_id": P_SEQ4,
    "research_id": P_SEQ4,
    "fact_id": P_FACT,
    "concept_id": P_CONCEPT,
    "scenario_id": P_CONCEPT,
    "subject_slug": P_SLUG,
    "setup_name": P_SLUG,
    "target_topic": P_SLUG,
    "schema_version": P_SCHEMA_VERSION,
    "date": P_DATE,
    "observed_at": P_DATE,
    "last_observed_at": P_DATE,
    "next_review_at": P_DATE,
}
CODE_OF = {
    "setup_id": "I12",
    "concept_id": "I16", "scenario_id": "I16",
    "subject_slug": "I16", "setup_name": "I16", "target_topic": "I16",
}

# vocabulario cuja ASSINATURA precisa ser unica em todos os schemas (§4.1/§4.2)
WATCH = [
    "setup_id", "session_id", "challenge_id", "research_id", "fact_id",
    "concept_id", "scenario_id", "hint_level", "schema_version",
    "proficiency_state", "confidence", "skill_level", "cross_read",
    "challenge_status", "setup_status", "error_type", "observation_type",
]
# Assinatura DURA: o que nao pode divergir entre schemas (o contrato do valor).
SIG_KEYS = ("pattern", "enum", "minimum", "maximum")
# Assinatura ACESSORIA: divergencia aqui e AVISO, nao falha — `["string","null"]` num ponto
# opcional e `"string"` num obrigatorio sao o MESMO vocabulario (§4.1 anota "(null onde opcional)").
SOFT_KEYS = ("type", "minLength", "maxLength")

out = []


def norm_pat(pat):
    """Normaliza `\\d` -> `[0-9]` para comparar patterns escritos em dialetos diferentes."""
    return pat.replace("\\d", "[0-9]")


def emit(code, path, ptr, detail):
    out.append("%s\t%s\t%s\t%s" % (code, path, ptr or "/", detail))


def sig_of(node, keys, drop_null_enum=False):
    sig = {}
    for k in keys:
        if k in node:
            v = node[k]
            if k == "type" and isinstance(v, list):
                v = sorted(v)
            if k == "enum" and drop_null_enum and isinstance(v, list):
                v = [x for x in v if x is not None]
            sig[k] = v
    return json.dumps(sig, sort_keys=True, ensure_ascii=False)


signatures = {}
soft_signatures = {}
timestamps = {}


def walk(node, ptr, rel, propname=None):
    if not isinstance(node, dict):
        return
    for key in node:
        if key in FORBIDDEN:
            emit("I08", rel, ptr + "/" + key,
                 "construcao proibida `%s` (docs/00-contratos.md §4.3 e I-08)" % key)
        elif key not in SUPPORTED:
            emit("I09", rel, ptr + "/" + key,
                 "palavra-chave `%s` fora da cobertura do verificador minimo" % key)

    if isinstance(node.get("items"), list):
        emit("I09", rel, ptr + "/items",
             "`items` como array (tuple validation) esta fora da cobertura")

    if propname is not None:
        if not node.get("description"):
            emit("G01", rel, ptr, "propriedade `%s` sem `description`" % propname)
        canon = CANON.get(propname)
        if canon is not None and "pattern" in node and node["pattern"] != canon:
            emit(CODE_OF.get(propname, "I16"), rel, ptr,
                 "pattern de `%s` divergente — esperado %s, obtido %s"
                 % (propname, canon, node["pattern"]))
        if propname.endswith("_at") and propname not in CANON:
            pat = node.get("pattern")
            types = node.get("type")
            types = types if isinstance(types, list) else [types]
            if "string" in types:
                if pat is None:
                    emit("I13", rel, ptr, "campo `%s` de timestamp sem `pattern`" % propname)
                elif "T" in pat:
                    # I-13 literal (§11): o pattern de timestamp CONTEM a fracao opcional.
                    if "([.][0-9]+)?" not in pat and "(\\.[0-9]+)?" not in pat and "(\\.\\d+)?" not in pat:
                        emit("I13", rel, ptr,
                             "pattern de timestamp de `%s` sem a fracao opcional ([.][0-9]+)? "
                             "— obtido %s" % (propname, pat))
                    timestamps.setdefault(norm_pat(pat), []).append("%s%s" % (rel, ptr))
                else:
                    if pat != P_DATE:
                        emit("I13", rel, ptr,
                             "pattern de data divergente em `%s` — esperado %s, obtido %s"
                             % (propname, P_DATE, pat))
        if propname.startswith("hint_level") or propname == "max_hint_level_used":
            if node.get("minimum") != 0 or node.get("maximum") != 5:
                emit("G11", rel, ptr,
                     "`%s` fora da faixa 0..5 — minimum=%r maximum=%r"
                     % (propname, node.get("minimum"), node.get("maximum")))
        if propname in WATCH:
            signatures.setdefault(propname, {}).setdefault(
                sig_of(node, SIG_KEYS, drop_null_enum=True), []).append("%s%s" % (rel, ptr))
            soft_signatures.setdefault(propname, {}).setdefault(
                sig_of(node, SOFT_KEYS), []).append("%s%s" % (rel, ptr))

    props = node.get("properties")
    if isinstance(props, dict):
        for name, sub in props.items():
            walk(sub, "%s/properties/%s" % (ptr, name), rel, name)
    items = node.get("items")
    if isinstance(items, dict):
        walk(items, ptr + "/items", rel, None)
    ap = node.get("additionalProperties")
    if isinstance(ap, dict):
        walk(ap, ptr + "/additionalProperties", rel, None)


def main(argv):
    root = argv[1]
    for path in argv[2:]:
        rel = os.path.relpath(path, root)
        try:
            with open(path, "r", encoding="utf-8") as fh:
                doc = json.load(fh)
        except Exception as exc:  # noqa: BLE001
            emit("I09", rel, "/", "nao parseia: %s" % exc)
            continue
        walk(doc, "", rel, None)

    def report(store, code, rotulo):
        for name, bysig in sorted(store.items()):
            if len(bysig) > 1:
                parts = []
                for sig, where in sorted(bysig.items()):
                    parts.append("%s em %s" % (sig, ", ".join(sorted(where)[:2])))
                emit(code, "(varios)", "/properties/" + name,
                     "`%s` tem %d %s diferentes :: %s"
                     % (name, len(bysig), rotulo, " || ".join(parts)))

    report(signatures, "G03", "assinaturas (pattern/enum/min/max)")
    report(soft_signatures, "G03b", "formas acessorias (type/minLength/maxLength)")

    if len(timestamps) > 1:
        parts = []
        for pat, where in sorted(timestamps.items()):
            parts.append("%s em %s" % (pat, ", ".join(sorted(where)[:2])))
        emit("G13", "(varios)", "/timestamp",
             "o pattern de timestamp tem %d formas diferentes :: %s"
             % (len(timestamps), " || ".join(parts)))
    elif len(timestamps) == 1:
        only = list(timestamps)[0]
        if only != P_TS:
            emit("G13w", "(varios)", "/timestamp",
                 "pattern de timestamp uniforme mas textualmente diferente do §4.2 — "
                 "canonico %s, em uso %s" % (P_TS, only))

    sys.stdout.write("\n".join(out) + ("\n" if out else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PYEOF

AUDIT_OUT="$GATE_TMPDIR/audit.tsv"
if [ "${#SCHEMAS[@]}" -gt 0 ]; then
  python3 "$AUDIT" "$GATE_ROOT" "${SCHEMAS[@]}" > "$AUDIT_OUT" 2>"$GATE_TMPDIR/audit.err" || {
    printf 'erro 1: a auditoria de schemas falhou:\n' >&2; cat "$GATE_TMPDIR/audit.err" >&2; exit 1; }
else
  : > "$AUDIT_OUT"
fi
audit_code() { grep -E "^$1\b" "$AUDIT_OUT" 2>/dev/null | awk -F'\t' '{printf "%s%s: %s\n", $2, $3, $4}' || true; }

# ═══════════════════════════════════════════════════ A · nomes, termos e vocabulário
gate_section "A · nomes de passo e termos revogados (I-01 .. I-05)"

STEPS='bootstrap setup_interview load_memory load_docs open_session plan_lesson teach challenge close_session'
if [ -f "$SKILL_MD" ]; then
  missing=""
  for s in $STEPS; do
    grep -qF "$s" "$SKILL_MD" || missing="$missing $s"
  done
  if [ -n "$missing" ]; then
    gate_fail "I-01" "os 9 nomes de passo aparecem literalmente no SKILL.md" \
      "os 9 nomes de §2 no corpo do SKILL.md" "faltam:$missing" "$(gate_rel "$SKILL_MD")"
  else
    gate_pass "I-01" "os 9 nomes de passo estão no SKILL.md"
  fi
else
  gate_pend "I-01" "os 9 nomes de passo aparecem no SKILL.md" "arquivo inexistente: $(gate_rel "$SKILL_MD")"
fi

hits="$(grep_scope 'resolve_target|verify_setup|bootstrap_or_ask|ingest_docs|teach_loop|challenge_cycle')"
assert_grep_empty "I-01b" "nenhum nome de passo revogado (§2.2) em doc ou schema" \
  "zero ocorrências de resolve_target/verify_setup/bootstrap_or_ask/ingest_docs/teach_loop/challenge_cycle" "$hits"

if [ -f "$SKILL_MD" ]; then
  n_ok=0
  for s in setup_interview load_docs; do
    if grep -nE "$s" "$SKILL_MD" | grep -qiE 'condicional|guarda|somente se|só roda|apenas se'; then
      n_ok=$((n_ok + 1))
    else
      gate_fail "I-02" "passo condicional sem a guarda na mesma linha" \
        "linha com \`$s\` contendo \"condicional\" ou a guarda (§2.1)" \
        "$(gate_trunc "$(grep -nE "$s" "$SKILL_MD" | head -3)")" "$(gate_rel "$SKILL_MD")"
    fi
  done
  [ "$n_ok" -eq 2 ] && gate_pass "I-02" "setup_interview e load_docs aparecem com a guarda"
else
  gate_pend "I-02" "setup_interview/load_docs marcados como condicionais" "arquivo inexistente: SKILL.md"
fi

hits="$(grep_scope 'session_status')"
assert_grep_empty "I-03" "o nome revogado do estado da sessão não aparece" \
  "zero ocorrências (o campo é \`status\`, §4.1)" "$hits"

hits="$(grep_scope '\.study-method/|[^-a-z]manifest\.json|docs-manifest\.json|SETUP_CTL|PROFILE\.json')"
assert_grep_empty "I-04" "nenhum termo do diretório de controle revogado" \
  "zero ocorrências de .study-method/ · manifest.json · docs-manifest.json · SETUP_CTL · PROFILE.json" "$hits"

hits="$(grep_scope 'challenge-run\.sh|render-html\.sh')"
assert_grep_empty "I-05" "nenhuma citação aos 2 scripts removidos (§8, A-19)" \
  "zero ocorrências de challenge-run.sh e render-html.sh" "$hits"

hits="$(grep_scope 'allow_cross_read|last_used_at')"
assert_grep_empty "I-15b" "nenhum campo revogado de privacidade/registry" \
  "zero ocorrências de allow_cross_read (vencido por cross_read) e last_used_at (é last_seen_at)" "$hits"

# ═══════════════════════════════════════════════════ B · inventário de scripts (I-06)
gate_section "B · inventário dos 19 scripts (I-06)"

CANON_SCRIPTS="$(awk '/^## 8\./{f=1} /^## 9\./{f=0} f' "$CONTRACT" \
  | grep -oE '^\| `(lib/)?[a-z0-9-]+\.(sh|py)`' | sed 's/^| `//;s/`$//' | sort -u)"
n_canon="$(printf '%s\n' "$CANON_SCRIPTS" | grep -c . || true)"
assert_eq "I-06a" "a tabela §8 declara exatamente 19 scripts" "19" "$n_canon" "$(gate_rel "$CONTRACT") §8"

if [ -d "$SCRIPT_DIR" ]; then
  FOUND_SCRIPTS="$(cd "$SCRIPT_DIR" && find . -type f \( -name '*.sh' -o -name '*.py' \) \
    | sed 's|^\./||' | sort -u)"
  missing="$(comm -23 <(printf '%s\n' "$CANON_SCRIPTS") <(printf '%s\n' "$FOUND_SCRIPTS") || true)"
  extra="$(comm -13 <(printf '%s\n' "$CANON_SCRIPTS") <(printf '%s\n' "$FOUND_SCRIPTS") || true)"
  if [ -n "$missing" ]; then
    gate_pend "I-06b" "os 19 scripts de §8 existem em SK/scripts/" \
      "faltam $(printf '%s\n' "$missing" | grep -c . || true): $(printf '%s' "$missing" | tr '\n' ' ')"
  else
    gate_pass "I-06b" "os 19 scripts de §8 existem em SK/scripts/"
  fi
  assert_grep_empty "I-06c" "nenhum script fora da tabela §8" \
    "zero scripts não declarados no contrato" "$extra"
else
  gate_pend "I-06b" "os 19 scripts de §8 existem" "diretório inexistente: $(gate_rel "$SCRIPT_DIR")"
fi

# ═══════════════════════════════════════════════════ C · schemas (I-07 .. I-17, G-01..G-03)
gate_section "C · schemas: forma, \$id e vocabulário (I-07 .. I-17 · G-01 .. G-03)"

if [ "${#SCHEMAS[@]}" -eq 0 ]; then
  gate_pend "I-07" "todo \$id casa urn:study-method:schema:<nome>:<major>" \
    "nenhum schema em $(gate_rel "$SCHEMA_DIR")"
else
  bad=""; ids=""
  for f in "${SCHEMAS[@]}"; do
    id="$(jq -r '."$id" // ""' "$f" 2>/dev/null || true)"
    if ! printf '%s' "$id" | grep -qE '^urn:study-method:schema:[a-z-]+:[0-9]+$'; then
      bad="$bad$(gate_rel "$f"): \"\$id\" = «${id:-<ausente>}»"$'\n'
    fi
    ids="$ids$id"$'\n'
  done
  assert_grep_empty "I-07" "todo \$id no namespace único urn:study-method:schema:<nome>:<major>" \
    "^urn:study-method:schema:[a-z-]+:[0-9]+\$ em todos os ${#SCHEMAS[@]} schemas" "${bad%$'\n'}"
  dup="$(printf '%s' "$ids" | grep -v '^$' | sort | uniq -d || true)"
  assert_grep_empty "G-02" "nenhum \$id repetido entre schemas" "cada schema com \$id próprio" "$dup"
fi

assert_grep_empty "I-08" "nenhum schema usa construção proibida" \
  "zero \$ref/allOf/anyOf/oneOf/if/then/else/\$defs/patternProperties/propertyNames/dependentSchemas" \
  "$(audit_code I08)"

assert_grep_empty "I-09" "todo schema cabe no metaschema mínimo (nenhuma palavra-chave ignorada em silêncio)" \
  "só as palavras-chave cobertas pelo verificador mínimo (§4.3)" \
  "$(audit_code I09)"

assert_grep_empty "G-01" "toda propriedade de schema tem \`description\`" \
  "description não vazia em cada entrada de \`properties\`" \
  "$(audit_code G01)"

assert_grep_empty "G-03" "cada vocabulário tem ASSINATURA ÚNICA em todos os schemas" \
  "uma única definição por campo (setup_id, session_id, challenge_id, concept_id, hint_level, enums de §4.1)" \
  "$(audit_code G03)"

g03b="$(audit_code G03b)"
if [ -n "$g03b" ]; then
  gate_warn "G-03b" "vocabulário com forma ACESSÓRIA divergente (type/minLength/maxLength)" \
    "não reprova — §4.1 anota \"(null onde opcional)\" — mas vale alinhar: $(gate_trunc "$g03b" 400)"
else
  gate_pass "G-03b" "nenhuma divergência acessória de forma entre schemas"
fi

assert_grep_empty "G-13" "o pattern de timestamp é o MESMO em todos os schemas" \
  "uma única forma textual de timestamp em todo o projeto (§4.2)" \
  "$(audit_code G13)"
g13w="$(audit_code G13w)"
[ -n "$g13w" ] && gate_warn "G-13w" "pattern de timestamp uniforme, porém diferente do texto de §4.2" "$g13w"

assert_grep_empty "I-12" "setup_id casa ^[0-9a-f]{12}\$ em todos os schemas" \
  "pattern ^[0-9a-f]{12}\$ (§4.2; vence o antigo de progress.schema.json)" \
  "$(audit_code I12)"

assert_grep_empty "I-13" "todo pattern de timestamp tem a fração opcional ([.][0-9]+)?" \
  "o pattern canônico de §4.2 em todo campo *_at" \
  "$(audit_code I13)"

assert_grep_empty "I-16" "concept_id/scenario_id em snake_case e slug/topic em kebab-case" \
  "^[a-z][a-z0-9_]{1,62}\$ para conceito e ^[a-z0-9]+(-[a-z0-9]+)*\$ para slug (§4.2, A-15)" \
  "$(audit_code I16)"

assert_grep_empty "G-11" "hint_level e derivados na faixa 0..5" \
  "minimum 0 e maximum 5 em hint_level, hint_level_used e max_hint_level_used" \
  "$(audit_code G11)"

# --- enums literais
enum_of() { jq -c --arg p "$2" '[paths(objects) as $q | getpath($q) | select(type=="object" and has("enum")) ] | .' "$1" >/dev/null 2>&1 || true; }
jq_enum() { jq -c "$2 // empty" "$1" 2>/dev/null || true; }

check_enum() { # <id> <arquivo> <filtro jq> <esperado json> <descrição>
  local id="$1" file="$2" filt="$3" exp="$4" desc="$5"
  if [ ! -f "$file" ]; then gate_pend "$id" "$desc" "arquivo inexistente: $(gate_rel "$file")"; return; fi
  local got; got="$(jq -c "$filt // empty" "$file" 2>/dev/null || true)"
  if [ -z "$got" ]; then
    gate_fail "$id" "$desc" "$exp" "<caminho não encontrado no schema: $filt>" "$(gate_rel "$file")"
  else
    assert_eq "$id" "$desc" "$exp" "$got" "$(gate_rel "$file") :: $filt"
  fi
}

check_enum "I-10a" "$SCHEMA_DIR/session.schema.json" '.properties.status.enum' \
  '["in_progress","completed","abandoned"]' "enum status da sessão em session.schema.json"
check_enum "I-10b" "$SCHEMA_DIR/index.schema.json" \
  '(.properties.sessions.items.properties.status.enum // .properties.status.enum)' \
  '["in_progress","completed","abandoned"]' "enum status da sessão em index.schema.json"

FACT_STATUS_EXP='["active","superseded"]'
got_pf="$(jq -c '[paths(objects) as $p | getpath($p) | select(type=="object" and (.enum? // empty) == ["active","superseded"])] | length' "$SCHEMA_DIR/profile.schema.json" 2>/dev/null || echo 0)"
if [ -f "$SCHEMA_DIR/profile.schema.json" ]; then
  if [ "${got_pf:-0}" -ge 1 ]; then gate_pass "I-11a" "enum status de fato em profile.schema.json"
  else gate_fail "I-11a" "enum status de fato em profile.schema.json" "$FACT_STATUS_EXP em algum ponto do schema" "nenhum enum igual encontrado" "$(gate_rel "$SCHEMA_DIR/profile.schema.json")"; fi
else gate_pend "I-11a" "enum status de fato em profile.schema.json" "arquivo inexistente"; fi
got_pg="$(jq -c '[paths(objects) as $p | getpath($p) | select(type=="object" and (.enum? // empty) == ["active","superseded"])] | length' "$SCHEMA_DIR/progress.schema.json" 2>/dev/null || echo 0)"
if [ -f "$SCHEMA_DIR/progress.schema.json" ]; then
  if [ "${got_pg:-0}" -ge 1 ]; then gate_pass "I-11b" "enum status de fato em progress.schema.json"
  else gate_fail "I-11b" "enum status de fato em progress.schema.json" "$FACT_STATUS_EXP em algum ponto do schema" "nenhum enum igual encontrado" "$(gate_rel "$SCHEMA_DIR/progress.schema.json")"; fi
else gate_pend "I-11b" "enum status de fato em progress.schema.json" "arquivo inexistente"; fi

# I-14 · enum language idêntico e na mesma ordem em 3 schemas
LANG_EXP='["python","javascript","typescript","rust","go","java","csharp","ruby","elixir","kotlin","swift","c","cpp","php","lua","julia","r","haskell","bash"]'
lang_of() {
  [ -f "$1" ] || { printf '<arquivo ausente>'; return; }
  jq -c '[paths(objects) as $p | getpath($p) | select(type=="object" and (.enum? // empty | type=="array") and ((.enum|length)>=15) and (.enum|index("python")) != null) | .enum] | (.[0] // "<enum language ausente>")' "$1" 2>/dev/null || printf '<erro jq>'
}
for pair in "setup-manifest.schema.json:I-14a" "registry.schema.json:I-14b" "challenge-manifest.schema.json:I-14c"; do
  fn="${pair%%:*}"; iid="${pair##*:}"
  if [ ! -f "$SCHEMA_DIR/$fn" ]; then gate_pend "$iid" "enum language em $fn" "arquivo inexistente"; continue; fi
  assert_eq "$iid" "enum language (19, mesma ordem) em $fn" "$LANG_EXP" "$(lang_of "$SCHEMA_DIR/$fn")" "$(gate_rel "$SCHEMA_DIR/$fn")"
done

# I-15 · cross_read
CR_EXP='["ask","allow","never"]'
check_enum "I-15a" "$SCHEMA_DIR/registry.schema.json" \
  '(.properties.setups.items.properties.cross_read.enum // .properties.cross_read.enum)' \
  "$CR_EXP" "enum cross_read em registry.schema.json"
check_enum "I-15c" "$SCHEMA_DIR/setup-manifest.schema.json" \
  '.properties.privacy.properties.cross_read.enum' \
  "$CR_EXP" "enum cross_read em setup-manifest.schema.json → privacy"

# I-17 · challenge_id nunca no formato c-NNNN-<slug>
hits="$(grep_scope_raw '"challenge_id" *: *"[^0-9"]')"
assert_grep_empty "I-17" "nenhum challenge_id de exemplo no formato revogado c-NNNN-slug" \
  "challenge_id sempre ^[0-9]{4}\$ (A-10)" "$hits"

# ═══════════════════════════════════════════════════ D · scripts, análise estática
gate_section "D · scripts: exit codes, lib/, protocolo e escrita (I-18 .. I-27)"

declare -a EXEC_SH=()
if [ -d "$SCRIPT_DIR" ]; then
  while IFS= read -r -d '' f; do
    case "$f" in "$LIB_DIR"/*) continue ;; esac
    EXEC_SH+=("$f")
  done < <(find "$SCRIPT_DIR" -type f -name '*.sh' -print0 2>/dev/null | sort -z)
fi

if [ "${#EXEC_SH[@]}" -eq 0 ]; then
  for iid in I-18 I-21 I-22 I-24 I-25 I-26 I-27; do
    gate_pend "$iid" "invariante sobre os executáveis de SK/scripts/" "nenhum .sh fora de lib/ em $(gate_rel "$SCRIPT_DIR")"
  done
else
  # I-18 exit codes permitidos
  bad=""
  for f in "${EXEC_SH[@]}"; do
    while IFS= read -r ln; do
      code="$(printf '%s' "$ln" | grep -oE '(exit|sm_die) +[0-9]+' | grep -oE '[0-9]+$' || true)"
      case "$code" in 0|1|2|3|4|5|10|"") ;; *) bad="$bad$(gate_rel "$f"):$ln"$'\n' ;; esac
    done < <(grep -nE '(^|[^_a-z])(exit|sm_die) +[0-9]+' "$f" 2>/dev/null || true)
  done
  assert_grep_empty "I-18" "todo script usa apenas os exit codes 0 1 2 3 4 5 10" \
    "a tabela única de §5.1 (6–9 e 11+ são reservados)" "${bad%$'\n'}"

  # I-21 pipefail + nunca == 1 como teste de falha
  bad=""
  for f in "${EXEC_SH[@]}"; do
    grep -qE 'set +-o +pipefail|set +-[a-z]*o?[a-z]* *pipefail|set +-euo +pipefail' "$f" || \
      bad="$bad$(gate_rel "$f"): sem set -o pipefail"$'\n'
  done
  assert_grep_empty "I-21a" "todo script tem set -o pipefail" "pipefail declarado (§5.3 regra de pipe)" "${bad%$'\n'}"
  bad=""
  for f in "${EXEC_SH[@]}"; do
    m="$(grep -nE '(\$\?|rc|status|ret) *(-eq|==) *1( |\)|\]|$)' "$f" 2>/dev/null || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"):|")"$'\n'
  done
  assert_grep_empty "I-21b" "nenhum script lê falha como == 1" \
    "falha é != 0, JAMAIS == 1 (§5.3, SEG-7)" "${bad%$'\n'}"

  # I-22 os 4 do REQUEST/APPLY
  RA_SCRIPTS="memory-compact.sh session-close.sh challenge-verify.sh docs-index.sh"
  bad=""
  for f in "${EXEC_SH[@]}"; do
    b="$(basename "$f")"
    has_apply=0; has_exit10=0
    grep -qF -- '--apply' "$f" && has_apply=1
    grep -qE '(exit|sm_die) +10|sm_request' "$f" && has_exit10=1
    case " $RA_SCRIPTS " in
      *" $b "*)
        [ "$has_apply" = 1 ] || bad="$bad$(gate_rel "$f"): script do protocolo sem --apply"$'\n'
        [ "$has_exit10" = 1 ] || bad="$bad$(gate_rel "$f"): script do protocolo sem exit 10 / sm_request"$'\n'
        ;;
      *)
        [ "$has_exit10" = 0 ] || bad="$bad$(gate_rel "$f"): script FORA do protocolo produzindo exit 10"$'\n'
        ;;
    esac
  done
  assert_grep_empty "I-22" "só os 4 scripts do REQUEST/APPLY aceitam --apply e saem com 10" \
    "memory-compact.sh · session-close.sh · challenge-verify.sh · docs-index.sh (§6.4)" "${bad%$'\n'}"

  # I-24 escrita no docs/ do setup só em generated/
  bad=""
  for f in "${EXEC_SH[@]}"; do
    m="$(grep -nE '(SM_SETUP_ROOT|setup_root|SETUP_ROOT)[^ ]*/docs/' "$f" 2>/dev/null | grep -vE '/docs/generated/' || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"):|")"$'\n'
  done
  assert_grep_empty "I-24" "nenhum script toca o docs/ do setup fora de generated/" \
    "só <setup_root>/docs/generated/ (§3.2, A-25)" "${bad%$'\n'}"

  # I-25 nenhuma escrita em caminho absoluto do sistema
  bad=""
  for f in "${EXEC_SH[@]}"; do
    m="$(grep -nE '>+ *"?/(etc|usr|bin|sbin|opt|var|boot|root)/' "$f" 2>/dev/null || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"):|")"$'\n'
  done
  assert_grep_empty "I-25" "nenhum script escreve fora do setup e do STUDY_METHOD_HOME" \
    "escrita só em <setup_root> e \$STUDY_METHOD_HOME (SEG-8)" "${bad%$'\n'}"

  # I-26 zero rede
  bad=""
  for f in "${EXEC_SH[@]}"; do
    m="$(grep -nE 'curl |wget |nc |/dev/tcp|ftp://|ssh |scp |rsync ' "$f" 2>/dev/null | grep -vE '^\s*[0-9]+:\s*#' || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"):|")"$'\n'
  done
  assert_grep_empty "I-26" "zero rede nos scripts" \
    "nenhum curl/wget/nc//dev/tcp/ssh/scp/rsync fora de comentário" "${bad%$'\n'}"

  # I-27 derivados só por sm_atomic_write
  DERIVED='INDEX\.json|profile\.json|progress\.json|docs-index\.json|setup\.json|meta\.json|registry\.json|README\.md'
  bad=""
  for f in "${EXEC_SH[@]}"; do
    m="$(grep -nE "> *\"?[^ ]*($DERIVED)\"?" "$f" 2>/dev/null | grep -v 'sm_atomic_write' | grep -vE '>&2|2>' || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"):|")"$'\n'
  done
  assert_grep_empty "I-27" "todo derivado é escrito por sm_atomic_write, nunca por > direto" \
    "sm_atomic_write em INDEX/profile/progress/docs-index/setup/meta/registry/README (§7.1)" "${bad%$'\n'}"
fi

# I-19/I-20/I-23 · lib/
if [ ! -d "$LIB_DIR" ] || [ -z "$(ls -A "$LIB_DIR" 2>/dev/null | grep '\.sh$' || true)" ]; then
  for iid in I-19 I-20 I-23; do gate_pend "$iid" "invariante sobre SK/scripts/lib/" "nenhum .sh em $(gate_rel "$LIB_DIR")"; done
else
  bad=""
  for f in "$LIB_DIR"/*.sh; do
    [ -x "$f" ] && bad="$bad$(gate_rel "$f"): tem bit de execução (modo $(stat -c '%a' "$f"))"$'\n'
    grep -qE '^[[:space:]]*(main|_main)[[:space:]]*\(\)|^[[:space:]]*(main|_main)[[:space:]]+"\$@"|^[[:space:]]*"\$@"' "$f" \
      && bad="$bad$(gate_rel "$f"): tem bloco main/\"\$@\" de topo"$'\n'
  done
  assert_grep_empty "I-19" "lib/ sem bit de execução e sem bloco main (LIB-1)" \
    "modo 0644, apenas \`source\`" "${bad%$'\n'}"

  CANON_FN="$(awk '/^### 7\.1/{f=1} /^### 7\.3/{f=0} f' "$CONTRACT" | grep -oE '^\| `sm_[a-z_]+' | sed 's/^| `//' | sort -u)"
  REAL_FN="$(grep -hoE '^[[:space:]]*(function[[:space:]]+)?sm_[a-z_]+[[:space:]]*\(\)' "$LIB_DIR/common.sh" "$LIB_DIR/json.sh" 2>/dev/null \
    | sed -E 's/^[[:space:]]*(function[[:space:]]+)?//; s/[[:space:]]*\(\)$//' | sort -u)"
  miss="$(comm -23 <(printf '%s\n' "$CANON_FN") <(printf '%s\n' "$REAL_FN") || true)"
  extra="$(comm -13 <(printf '%s\n' "$CANON_FN") <(printf '%s\n' "$REAL_FN") || true)"
  if [ -n "$miss" ] || [ -n "$extra" ]; then
    gate_fail "I-20" "as funções de lib/common.sh e lib/json.sh são exatamente as da tabela §7" \
      "as 26 funções de §7.1 e §7.2" \
      "faltando: $(printf '%s' "$miss" | tr '\n' ' ')| sobrando: $(printf '%s' "$extra" | tr '\n' ' ')" \
      "$(gate_rel "$LIB_DIR")/{common,json}.sh"
  else
    gate_pass "I-20" "as 26 funções de lib/ batem com a tabela §7"
  fi

  bad=""
  for f in "$LIB_DIR"/*.sh; do
    m="$(grep -nE '(^|[^_a-z])(exit|return) +10' "$f" 2>/dev/null \
         | grep -vE '^[0-9]+:[[:space:]]*#' | grep -v 'sm_request' || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"):|")"$'\n'
  done
  bad="${bad%$'\n'}"
  ok10="$(awk '/^sm_request\(\)/,/^}/' "$LIB_DIR/json.sh" 2>/dev/null | grep -cE '(exit|return) +10' || true)"
  assert_grep_empty "I-23" "só sm_request produz exit 10 em todo o projeto" \
    "exit 10 apenas dentro de sm_request (§7.2)" "$bad"
  [ "${ok10:-0}" -ge 1 ] || gate_warn "I-23" "sm_request não parece produzir exit 10" \
    "nenhum \`exit 10\`/\`return 10\` encontrado no corpo de sm_request em $(gate_rel "$LIB_DIR/json.sh")"
fi

# ═══════════════════════════════════════════════════ E · runtime (I-28 .. I-32)
gate_section "E · comportamento observável dos scripts (I-28 .. I-32)"

run_or_pend() { # <id> <descrição> <script relativo>
  local id="$1" desc="$2" rel="$3"
  if [ ! -x "$SCRIPT_DIR/$rel" ]; then
    gate_pend "$id" "$desc" "executável ausente: SK/scripts/$rel"
    return 1
  fi
  return 0
}

if run_or_pend "I-28" "memory-digest.sh sai 0 nos 4 cenários de borda" "memory-digest.sh"; then
  FX="$GATE_TMPDIR/fx28"; rm -rf "$FX"
  n=0; bad=""
  mk() { mkdir -p "$1/memory" "$1/researchs" "$1/challenges" "$1/docs"; printf '{"schema_version":"1.0","setup_id":"0123456789ab"}\n' > "$1/setup.json"; }
  mk "$FX/vazia"
  mk "$FX/sem-indice"; printf '{"schema_version":"1.0","session_id":"0001","status":"completed"}\n' > "$FX/sem-indice/memory/0001.json"
  mk "$FX/corrompido"; printf '{ isto nao e json\n' > "$FX/corrompido/memory/0001.json"
  mk "$FX/orcamento"; printf '{"schema_version":"1.0","session_id":"0001","status":"completed"}\n' > "$FX/orcamento/memory/0001.json"
  for cen in vazia sem-indice corrompido orcamento; do
    args=("$FX/$cen"); [ "$cen" = orcamento ] && args+=(--budget-chars 50)
    if out="$("$SCRIPT_DIR/memory-digest.sh" "${args[@]}" 2>&1)"; then n=$((n+1)); else
      bad="$bad$cen: exit $? — $(gate_trunc "$out" 120)"$'\n'; fi
  done
  assert_grep_empty "I-28" "memory-digest.sh sai 0 em memória vazia, índice ausente, bruto corrompido e orçamento estourado" \
    "exit 0 nos 4 cenários (§8: falha de memória nunca impede a aula)" "${bad%$'\n'}"

  DIGEST_KEYS='schema_version,generated_at,for_session_id,memory_state,topics_in_focus,topics_source,full_detail_available,student,recent_sessions,recent_affect,student_profile,procedural_playbook,orphan_sessions,pending_followups,truncated,truncated_fields,budget_exceeded,errors'
  badk=""
  for cen in vazia sem-indice corrompido; do
    got="$("$SCRIPT_DIR/memory-digest.sh" "$FX/$cen" 2>/dev/null | jq -r 'keys_unsorted | join(",")' 2>/dev/null || echo '<saída não é JSON>')"
    [ "$got" = "$DIGEST_KEYS" ] || badk="$badk$cen: $got"$'\n'
  done
  assert_grep_empty "I-29" "o digest tem sempre as mesmas chaves de topo, na mesma ordem" \
    "$DIGEST_KEYS" "${badk%$'\n'}"
  gate_warn "I-29" "§11 diz «19 chaves de topo»; a ordem fixa de docs/03-memoria.md §? passo 13 enumera 18" \
    "procedural_playbook.do e .avoid são aninhados, não chaves de topo — divergência a arbitrar no contrato"
else
  gate_pend "I-29" "o digest tem sempre as mesmas 18/19 chaves de topo" "executável ausente: SK/scripts/memory-digest.sh"
fi

if run_or_pend "I-30" "readme-sync.sh é idempotente" "readme-sync.sh"; then
  FX="$GATE_TMPDIR/fx30"; rm -rf "$FX"; mkdir -p "$FX/memory" "$FX/researchs" "$FX/challenges" "$FX/docs"
  printf '{"schema_version":"1.0","setup_id":"0123456789ab","setup_name":"teste","subject":"teste"}\n' > "$FX/setup.json"
  if "$SCRIPT_DIR/readme-sync.sh" "$FX" --init >/dev/null 2>&1 && cp "$FX/README.md" "$FX/../r1.md" 2>/dev/null \
     && "$SCRIPT_DIR/readme-sync.sh" "$FX" >/dev/null 2>&1; then
    if diff -q "$FX/../r1.md" "$FX/README.md" >/dev/null 2>&1; then
      gate_pass "I-30" "readme-sync.sh é idempotente (byte a byte)"
    else
      gate_fail "I-30" "readme-sync.sh não é idempotente" "duas execuções seguidas produzem arquivos iguais" \
        "$(gate_trunc "$(diff "$FX/../r1.md" "$FX/README.md" | head -6)")" "$FX/README.md"
    fi
  else
    gate_fail "I-30" "readme-sync.sh é idempotente" "duas execuções bem-sucedidas" "a execução falhou no fixture" "$FX"
  fi
fi

run_or_pend "I-31" "progress-update.sh --recompute reconstrói todo escalar de evidence[]" "progress-update.sh" || true
if [ -x "$SCRIPT_DIR/progress-update.sh" ]; then
  gate_pend "I-31" "progress-update.sh --recompute reconstrói todo escalar de evidence[]" \
    "fixture canônico de progress.json ainda não existe em examples/ — a sub-tarefa dona é a 3.4b"
fi

if run_or_pend "I-32" "setup-init.sh é idempotente" "setup-init.sh"; then
  FX="$GATE_TMPDIR/fx32"; rm -rf "$FX"; mkdir -p "$FX"
  export STUDY_METHOD_HOME="$GATE_TMPDIR/home32"; mkdir -p "$STUDY_METHOD_HOME"
  if "$SCRIPT_DIR/setup-init.sh" "$FX/s" --subject "Calculo" --subject-slug calculo --title "T" >/dev/null 2>&1; then
    cp -a "$FX/s" "$FX/s-antes"
    "$SCRIPT_DIR/setup-init.sh" "$FX/s" --subject "Calculo" --subject-slug calculo --title "T" >/dev/null 2>&1 || true
    d="$(diff -r "$FX/s-antes" "$FX/s" 2>&1 || true)"
    assert_grep_empty "I-32" "setup-init.sh é idempotente" "segunda execução não muda nada" "$d"
  else
    gate_fail "I-32" "setup-init.sh é idempotente" "primeira execução bem-sucedida" "a criação do setup falhou" "$FX/s"
  fi
  unset STUDY_METHOD_HOME
fi

# ═══════════════════════════════════════════════════ F · SKILL.md e references
gate_section "F · SKILL.md e references (I-33 .. I-35 · G-04 .. G-07)"

RULE_IDS="$(awk '/^## 9\./{f=1} /^## 10\./{f=0} f' "$CONTRACT" \
  | grep -oE '^\| [A-Z]+(-[A-Z0-9]+)+ ?†? \|' | sed 's/^| //; s/ *†* *|$//' | sort -u)"
RULE_N="$(printf '%s\n' "$RULE_IDS" | grep -c . || true)"
DAGGER_IDS="$(awk '/^## 9\./{f=1} /^## 10\./{f=0} f' "$CONTRACT" \
  | grep -oE '^\| [A-Z]+(-[A-Z0-9]+)+ †' | sed 's/^| //; s/ †$//' | sort -u)"
DAGGER_N="$(printf '%s\n' "$DAGGER_IDS" | grep -c . || true)"
assert_eq "G-04a" "o §9 do contrato declara 88 regras permanentes" "88" "$RULE_N" "$(gate_rel "$CONTRACT") §9"
assert_eq "G-04b" "o §9 marca 11 regras † (críticas de segurança)" "11" "$DAGGER_N" "$(gate_rel "$CONTRACT") §9"

if [ ! -f "$SKILL_MD" ]; then
  for iid in I-33 I-34 G-05 G-06 G-07; do gate_pend "$iid" "invariante sobre o SKILL.md" "arquivo inexistente: SK/SKILL.md"; done
else
  fm_end="$(awk 'NR==1 && $0=="---"{inside=1; next} inside && $0=="---"{print NR; exit}' "$SKILL_MD")"
  if [ -z "$fm_end" ]; then
    gate_fail "G-05" "SKILL.md tem frontmatter YAML delimitado por ---" "--- na 1ª linha e --- fechando" "nenhum frontmatter encontrado" "$(gate_rel "$SKILL_MD"):1"
    fm_end=0
  else
    keys="$(awk -v e="$fm_end" 'NR>1 && NR<e && /^[A-Za-z][A-Za-z0-9_-]*:/ {sub(/:.*/,""); print}' "$SKILL_MD" | sort -u)"
    bad=""
    while IFS= read -r k; do
      [ -z "$k" ] && continue
      case "$k" in name|description|license|compatibility|metadata|allowed-tools) ;;
        *) bad="$bad$(gate_rel "$SKILL_MD"): campo não portável no frontmatter: $k"$'\n' ;;
      esac
    done <<< "$keys"
    assert_grep_empty "G-05" "frontmatter do SKILL.md só com os 6 campos portáveis" \
      "name · description · license · compatibility · metadata · allowed-tools" "${bad%$'\n'}"

    fm_name="$(awk -v e="$fm_end" 'NR>1 && NR<e && /^name:/ {sub(/^name:[[:space:]]*/,""); gsub(/^["'"'"']|["'"'"']$/,""); print; exit}' "$SKILL_MD")"
    assert_eq "G-06" "o campo name é idêntico ao nome do diretório da skill" "$(basename "$SK")" "${fm_name:-<ausente>}" "$(gate_rel "$SKILL_MD")"

    desc="$(awk -v e="$fm_end" 'NR>1 && NR<e && /^description:/ {sub(/^description:[[:space:]]*/,""); print; exit}' "$SKILL_MD")"
    dlen="${#desc}"
    if [ "$dlen" -eq 0 ]; then
      gate_fail "G-07" "description do frontmatter presente e ≤1024 chars" "1..1024 caracteres" "vazia ou ausente" "$(gate_rel "$SKILL_MD")"
    elif [ "$dlen" -gt 1024 ]; then
      gate_fail "G-07" "description do frontmatter ≤1024 chars" "≤1024 caracteres (limite de validação do frontmatter)" "$dlen caracteres" "$(gate_rel "$SKILL_MD")"
    else
      gate_pass "G-07" "description do frontmatter com $dlen caracteres (≤1024)"
    fi
  fi

  body_lines="$(awk -v e="${fm_end:-0}" 'NR>e' "$SKILL_MD" | grep -c '' || true)"
  if [ "$body_lines" -le 200 ]; then
    gate_pass "I-33a" "corpo do SKILL.md com $body_lines linhas (teto 200)"
  else
    gate_fail "I-33a" "corpo do SKILL.md acima do teto" "≤200 linhas fora do frontmatter (§9.8)" "$body_lines linhas" "$(gate_rel "$SKILL_MD")"
  fi
  miss=""
  while IFS= read -r rid; do
    [ -z "$rid" ] && continue
    grep -qE "(^|[^A-Za-z0-9-])$rid([^A-Za-z0-9-]|$)" "$SKILL_MD" || miss="$miss$rid "
  done <<< "$RULE_IDS"
  assert_grep_empty "I-33b" "os 88 IDs de regra do §9 estão no corpo do SKILL.md" \
    "os 88 IDs (C-*, AS-*, AN-*, ESC-*, ERR-*, MEM-*, PRIV-*, SEG-*, DES-*, VIZ-*, BOOT-*)" \
    "$( [ -n "$miss" ] && printf 'faltam: %s' "$miss" )"
  miss=""
  while IFS= read -r rid; do
    [ -z "$rid" ] && continue
    grep -qE "(^|[^A-Za-z0-9-])$rid([^A-Za-z0-9-]|$)" "$SKILL_MD" || miss="$miss$rid "
  done <<< "$DAGGER_IDS"
  assert_grep_empty "I-33c" "as 11 regras † estão no corpo do SKILL.md (nunca rebaixadas para reference)" \
    "PRIV-1..4 e SEG-1..6, SEG-8 presentes" "$( [ -n "$miss" ] && printf 'faltam: %s' "$miss" )"
fi

declare -a REFS=()
gate_find_into REFS "$SK/references" -name '*.md'
if [ "${#REFS[@]}" -eq 0 ]; then
  gate_pend "I-34" "grafo de references de 1 nível" "nenhum .md em SK/references/"
  gate_pend "I-35" "reference longa começa com sumário" "nenhum .md em SK/references/"
else
  REF_NAMES=""
  for f in "${REFS[@]}"; do REF_NAMES="$REF_NAMES$(basename "$f" .md)|"; done
  REF_NAMES="${REF_NAMES%|}"
  bad=""
  for f in "${REFS[@]}"; do
    self="$(basename "$f" .md)"
    others="$(printf '%s' "$REF_NAMES" | tr '|' '\n' | grep -vxF "$self" | paste -sd'|' -)"
    [ -z "$others" ] && continue
    m="$(grep -nE "(^|[^0-9A-Za-z_-])(SK/)?(references/)?($others)\.md" "$f" 2>/dev/null || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"):|")"$'\n'
  done
  assert_grep_empty "I-34a" "nenhuma reference aponta para outra reference (grafo de 1 nível)" \
    "toda reference é linkada DIRETO do SKILL.md e não referencia outra" "${bad%$'\n'}"

  if [ -f "$SKILL_MD" ]; then
    bad=""
    for f in "${REFS[@]}"; do
      b="$(basename "$f")"
      grep -qF "$b" "$SKILL_MD" || bad="$bad$(gate_rel "$f"): não é citada pelo SKILL.md"$'\n'
    done
    assert_grep_empty "I-34b" "toda reference é linkada direto do SKILL.md" \
      "cada references/*.md citada no corpo do SKILL.md" "${bad%$'\n'}"
  else
    gate_pend "I-34b" "toda reference é linkada direto do SKILL.md" "arquivo inexistente: SK/SKILL.md"
  fi

  bad=""
  for f in "${REFS[@]}"; do
    n="$(grep -c '' "$f" || true)"
    if [ "$n" -gt 100 ] && ! head -30 "$f" | grep -qE '^#{1,3} *Sum[áa]rio'; then
      bad="$bad$(gate_rel "$f"): $n linhas, sem heading \"## Sumário\" nas 30 primeiras"$'\n'
    fi
  done
  assert_grep_empty "I-35" "toda reference com mais de 100 linhas começa com sumário" \
    "heading \`## Sumário\` no topo das references longas" "${bad%$'\n'}"
fi

# ═══════════════════════════════════════════════════ G · templates e artefatos
gate_section "G · templates, placeholders e artefatos gerados (I-36 .. I-41 · G-08)"

MANIFEST="$TPL_DIR/MANIFEST.tsv"
if [ ! -f "$MANIFEST" ]; then
  for iid in G-08a G-08b G-08c I-38 I-40; do gate_pend "$iid" "invariante sobre os templates" "arquivo inexistente: $(gate_rel "$MANIFEST")"; done
else
  DECL_PATHS="$(awk -F'\t' '!/^#/ && NF>=3 {print $1}' "$MANIFEST" | sort -u)"
  miss="";
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    [ -f "$TPL_DIR/$p" ] || [ -f "$TPL_DIR/$p.tmpl" ] || miss="$miss$p"$'\n'
  done <<< "$DECL_PATHS"
  if [ -n "$miss" ]; then
    gate_pend "G-08a" "todo template do MANIFEST.tsv existe" \
      "$(printf '%s\n' "$miss" | grep -c . || true) template(s) declarado(s) e ausente(s): $(printf '%s' "$miss" | tr '\n' ' ')"
  else
    gate_pass "G-08a" "todo template declarado no MANIFEST.tsv existe"
  fi

  declare -a TPLS=()
  gate_find_into TPLS "$TPL_DIR" -name '*.tmpl'
  if [ "${#TPLS[@]}" -eq 0 ]; then
    gate_pend "G-08b" "todo placeholder usado está no MANIFEST.tsv" "nenhum *.tmpl em $(gate_rel "$TPL_DIR")"
    gate_pend "G-08c" "nenhum template usa delimitador fora de {{NOME}}" "nenhum *.tmpl"
  else
    bad=""; badsyn=""
    for f in "${TPLS[@]}"; do
      rel="${f#"$TPL_DIR"/}"
      decl="$(awk -F'\t' -v p="$rel" '!/^#/ && ($1==p || $1"" == p) {print $3}' "$MANIFEST" | tr ',' '\n' | sed 's/ //g' | sort -u)"
      used="$(grep -oE '\{\{[A-Za-z0-9_]+\}\}' "$f" 2>/dev/null | sed 's/^{{//;s/}}$//' | sort -u || true)"
      while IFS= read -r ph; do
        [ -z "$ph" ] && continue
        printf '%s\n' "$decl" | grep -qxF "$ph" || bad="$bad$rel: placeholder {{$ph}} não declarado no MANIFEST.tsv"$'\n'
      done <<< "$used"
      m="$(grep -nE '\{\{[^}]*[^A-Z0-9_}][^}]*\}\}|\$\{[A-Z_]+\}|<%|%>' "$f" 2>/dev/null || true)"
      [ -n "$m" ] && badsyn="$badsyn$(printf '%s\n' "$m" | sed "s|^|$rel:|")"$'\n'
    done
    assert_grep_empty "G-08b" "todo placeholder usado está declarado no MANIFEST.tsv" \
      "cada {{NOME}} do template listado na coluna 3 do manifesto" "${bad%$'\n'}"
    assert_grep_empty "G-08c" "nenhum delimitador de placeholder fora de {{MAIUSCULA_COM_UNDERSCORE}}" \
      "só {{NOME}} — nada de \${VAR}, <% %> ou {{ minúscula }}" "${badsyn%$'\n'}"
  fi

  # I-38 · runner.sh gerado
  RUNNER="$TPL_DIR/challenge/runner.sh.tmpl"
  if [ ! -f "$RUNNER" ]; then
    gate_pend "I-38" "runner.sh gerado usa cd || exit 66 e trata 137" "arquivo inexistente: $(gate_rel "$RUNNER")"
  else
    bad=""
    grep -qE 'exit +66' "$RUNNER" || bad="${bad}sem \`cd … || exit 66\`"$'\n'
    grep -qE '\b137\b' "$RUNNER" || bad="${bad}não trata o exit code 137 (timeout com -s KILL)"$'\n'
    grep -qE 'exit +70' "$RUNNER" && bad="${bad}usa exit 70 (revogado por A-07)"$'\n'
    grep -qE '\b124\b' "$RUNNER" && ! grep -qE '\b137\b' "$RUNNER" && bad="${bad}depende de 124 sem tratar 137"$'\n'
    assert_grep_empty "I-38" "o runner.sh gerado usa exit 66 no cd e trata 137 como timeout" \
      "cd || exit 66 · 137 tratado · sem exit 70 · sem depender de 124 (§5.2, §5.3, A-06, A-07)" "${bad%$'\n'}"
  fi

  # I-40 · .gitignore gerado
  GI="$TPL_DIR/setup/gitignore.tmpl"
  if [ ! -f "$GI" ]; then
    gate_pend "I-40" ".gitignore gerado contém memory/" "arquivo inexistente: $(gate_rel "$GI")"
  else
    if grep -qxE 'memory/' "$GI"; then gate_pass "I-40" "o .gitignore gerado contém a linha memory/"
    else gate_fail "I-40" ".gitignore gerado contém memory/" "linha exata \`memory/\`" "$(gate_trunc "$(cat "$GI")")" "$(gate_rel "$GI")"; fi
  fi
fi

# I-36 · frontmatter YAML proibido em artefato gerado
bad=""
for d in "$TPL_DIR/research" "$TPL_DIR/setup" "$TPL_DIR/challenge" "$TPL_DIR/session"; do
  [ -d "$d" ] || continue
  while IFS= read -r -d '' f; do
    case "$f" in *README.md.tmpl) ;; esac
    if head -1 "$f" | grep -qx -- '---'; then
      bad="$bad$(gate_rel "$f"):1: começa com frontmatter YAML (proibido por A-20 — a proveniência é o bloco study-method:meta)"$'\n'
    fi
  done < <(find "$d" -type f -print0 2>/dev/null | sort -z)
done
assert_grep_empty "I-36" "nenhum artefato gerado usa frontmatter YAML" \
  "proveniência pelo bloco <!-- study-method:meta {…} --> (§3.4, A-20)" "${bad%$'\n'}"

# I-37 · nenhum caminho absoluto gravado dentro do setup
declare -a EXAMPLES=()
gate_find_into EXAMPLES "$GATE_ROOT/examples" -name '*.json'
if [ "${#EXAMPLES[@]}" -eq 0 ]; then
  gate_pend "I-37" "todo caminho gravado dentro do setup é relativo" "nenhum fixture em examples/"
  gate_pend "I-39" "sandbox.mode e sandbox.timeout_source em todo meta.json com verdict != not_run" "nenhum fixture em examples/"
else
  bad=""
  for f in "${EXAMPLES[@]}"; do
    case "$(basename "$f")" in registry.json) continue ;; esac
    m="$(jq -r '[paths(scalars) as $p | {p:($p|map(tostring)|join(".")), v:getpath($p)} | select(.v|type=="string") | select(.v|test("^/")) | "\(.p) = \(.v)"] | .[]' "$f" 2>/dev/null || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$(gate_rel "$f"): |")"$'\n'
  done
  assert_grep_empty "I-37" "todo caminho gravado dentro do setup é relativo" \
    "o único caminho absoluto do sistema é registry.json → setups[].path (§4.2)" "${bad%$'\n'}"

  bad=""
  for f in "${EXAMPLES[@]}"; do
    case "$(basename "$f")" in meta.json) ;; *) continue ;; esac
    v="$(jq -r '.validation.verdict // .verdict // "not_run"' "$f" 2>/dev/null || echo not_run)"
    [ "$v" = "not_run" ] && continue
    jq -e '(.sandbox.mode? // empty) and (.sandbox.timeout_source? // empty)' "$f" >/dev/null 2>&1 || \
      bad="$bad$(gate_rel "$f"): verdict=$v sem sandbox.mode e/ou sandbox.timeout_source"$'\n'
  done
  assert_grep_empty "I-39" "sandbox.mode e sandbox.timeout_source em todo meta.json com verdict != not_run" \
    "os dois campos gravados (§11 I-39)" "${bad%$'\n'}"
fi

# I-41 · as 8 seções do README.md do setup
SECTIONS="identidade taxonomia base-teorica destilados desafios linha-do-tempo pontes estado-atual"
RS="$SCRIPT_DIR/readme-sync.sh"
if [ ! -f "$RS" ]; then
  gate_pend "I-41" "as 8 seções de marcador batem com readme-sync.sh" "executável ausente: SK/scripts/readme-sync.sh"
else
  miss=""
  for s in $SECTIONS; do grep -qF "$s" "$RS" || miss="$miss$s "; done
  extra="$(grep -oE 'study-method:begin [a-z-]+' "$RS" 2>/dev/null | awk '{print $2}' | sort -u | while IFS= read -r s; do
    case " $SECTIONS " in *" $s "*) ;; *) printf '%s\n' "$s" ;; esac; done || true)"
  assert_grep_empty "I-41" "as 8 seções de marcador do README.md do setup batem com §3.5" \
    "identidade · taxonomia · base-teorica · destilados · desafios · linha-do-tempo · pontes · estado-atual" \
    "$( [ -n "$miss" ] && printf 'faltam: %s\n' "$miss"; printf '%s' "$extra" )"
fi

# G-09 · nenhum {{ }} sobrando em artefato materializado do repositório
bad="$(grep_scope_raw '\{\{[A-Za-z0-9_ ]*\}\}' | grep -vE '\.tmpl:|MANIFEST\.tsv:|study-method:meta' || true)"
assert_grep_empty "G-09" "nenhum {{ }} órfão em artefato materializado" \
  "placeholder só dentro de *.tmpl" "$bad"

# ═══════════════════════════════════════════════════ H · anti-regressão de conteúdo
gate_section "H · anti-regressão de conteúdo (I-42, I-43)"

hits="$(grep_scope 'todos os cen[áa]rios de erro')"
assert_grep_empty "I-42" "nenhum documento promete «todos os cenários de erro»" \
  "a promessa correta é «cobre estes N cenários nomeados; o mutation score medido foi X%» (DES-3)" "$hits"

# docs/02 §9 É a lista das afirmações proibidas: as linhas daquela seção são a fonte, não regressão.
D02="$GATE_ROOT/docs/02-pedagogia.md"
D02_RANGE=""
if [ -f "$D02" ]; then
  s="$(grep -n '^## 9\.' "$D02" | head -1 | cut -d: -f1 || true)"
  if [ -n "$s" ]; then
    e="$(awk -v s="$s" 'NR>s && /^## /{print NR; exit}' "$D02")"; e="${e:-$(grep -c '' "$D02")}"
    D02_RANGE="$s $e"
  fi
fi
raw="$(grep_scope '2 ?sigma|2 desvios-padr|d ?= ?1,11|d ?= ?1\.11|programar desenvolve raciocínio lógico|[0-9]+% de dom[íi]nio|[0-9]+% de recurs')"
filtered=""
while IFS= read -r ln; do
  [ -z "$ln" ] && continue
  file="${ln%%:*}"; rest="${ln#*:}"; lno="${rest%%:*}"
  if [ "$file" = "docs/02-pedagogia.md" ] && [ -n "$D02_RANGE" ]; then
    set -- $D02_RANGE
    if [ "$lno" -ge "$1" ] && [ "$lno" -le "$2" ]; then continue; fi
  fi
  case "$rest" in *"Bloom"*|*"nintil"*|*"wikipedia"*) continue ;; esac
  filtered="$filtered$ln"$'\n'
done <<< "$raw"
assert_grep_empty "I-43" "nenhuma afirmação derrubada pela auditoria de docs/02 §9 volta ao texto" \
  "sem «2 sigma» como fato, «d = 1,11», «programar desenvolve raciocínio lógico», percentual de domínio" \
  "${filtered%$'\n'}"

# ═══════════════════════════════════════════════════ I · terminologia (§10)
gate_section "I · terminologia obrigatória (§10 · G-10)"

python3 - "$GATE_ROOT" "${SCAN_FILES[@]}" > "$GATE_TMPDIR/termos.txt" <<'PYEOF'
import os
import re
import sys

root = sys.argv[1]
BARE = re.compile(r"`docs/`")
QUAL = re.compile(r"do (?:reposit[óo]rio|setup)|dele|deste setup|do aluno")
NEG = re.compile(r"n[ãa]o existe|nunca|proibid|sozinho|revogad|em vez de|desambigua|"
                 r"palavras do aluno|n[ãa]o confundir", re.IGNORECASE)
out = []
for path in sys.argv[2:]:
    if not path.endswith(".md"):
        continue
    rel = os.path.relpath(path, root)
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        continue
    # achata quebras de linha, marcadores de citacao e enfase: a qualificacao costuma
    # cair na linha seguinte ("o `docs/` do\nsetup") e isso NAO e violacao.
    flat = re.sub(r"[\s>*_]+", " ", text)
    offsets = []
    pos = 0
    for i, line in enumerate(text.split("\n")):
        offsets.append((pos, i + 1))
        pos += len(line) + 1
    for m in BARE.finditer(flat):
        after = flat[m.end():m.end() + 80]
        if QUAL.search(after):
            continue
        before = flat[max(0, m.start() - 100):m.start()]
        if NEG.search(before + after):
            continue
        out.append("%s: %s" % (rel, flat[max(0, m.start() - 70):m.end() + 70].strip()))
sys.stdout.write("\n".join(out) + ("\n" if out else ""))
PYEOF
assert_grep_empty "G-10" "o termo \`docs/\` aparece sempre qualificado nos normativos" \
  "\"o \`docs/\` do repositório\" ou \"o \`docs/\` do setup\" — nunca a forma nua (§10)" \
  "$(cat "$GATE_TMPDIR/termos.txt")"

# ═══════════════════════════════════════════════════ J · decisões em 3 camadas
gate_section "J · decisões: JSON + doc humano + marcador no BUILD_SPEC (G-12)"

DEC="$SK/assets/decisions.json"
if [ ! -f "$DEC" ]; then
  gate_pend "G-12" "cada D-NNN tem as 3 camadas sincronizadas" "arquivo inexistente: $(gate_rel "$DEC")"
else
  n_dec="$(jq -r '.decisions | length' "$DEC" 2>/dev/null || echo 0)"
  if [ "${n_dec:-0}" -eq 0 ]; then
    gate_pend "G-12" "cada D-NNN tem as 3 camadas sincronizadas" \
      "assets/decisions.json ainda é o esqueleto: .decisions == [] (dona: sub-tarefa 3.0a/b/c)"
  else
    bad=""
    while IFS= read -r did; do
      [ -z "$did" ] && continue
      printf '%s' "$did" | grep -qE '^D-[A-Z]{1,3}[0-9]{2,3}$' || bad="${bad}$did: id fora do pattern ^D-[A-Z]{1,3}[0-9]{2,3}\$"$'\n'
      grep -rqF "$did" "$GATE_ROOT/docs" 2>/dev/null || bad="${bad}$did: sem camada humana (nenhum doc do repositório o cita)"$'\n'
      grep -rqF "$did" "$GATE_ROOT/docs/build-spec" 2>/dev/null || bad="${bad}$did: sem marcador no BUILD_SPEC (docs/build-spec/)"$'\n'
    done <<< "$(jq -r '.decisions[].id // empty' "$DEC" 2>/dev/null)"
    assert_grep_empty "G-12a" "cada D-NNN tem as 3 camadas (JSON · doc humano · BUILD_SPEC)" \
      "id no pattern + citado em docs/ + marcado em docs/build-spec/" "${bad%$'\n'}"

    SM_SCHEMA="$SCHEMA_DIR/setup-manifest.schema.json"
    bad=""
    while IFS= read -r wt; do
      [ -z "$wt" ] && continue
      [ "$wt" = "null" ] && continue
      filt=".properties"; IFS='.' read -r -a parts <<< "$wt"
      for p in "${parts[@]}"; do filt="$filt.\"$p\".properties"; done
      filt="${filt%.properties}"
      jq -e "$filt" "$SM_SCHEMA" >/dev/null 2>&1 || bad="${bad}writes_to «$wt» não existe em setup-manifest.schema.json"$'\n'
    done <<< "$(jq -r '.decisions[].writes_to // empty' "$DEC" 2>/dev/null)"
    assert_grep_empty "G-12b" "todo writes_to aponta para caminho existente em setup-manifest.schema.json" \
      "cada writes_to resolvível como properties.<a>.properties.<b>…" "${bad%$'\n'}"
  fi
fi

gate_summary
