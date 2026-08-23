#!/usr/bin/env bash
# tests/validate.sh — O GATE DE CONTRATO. Implementa as 43 invariantes de
# `docs/00-contratos.md` §11 (I-01..I-43), mais as verificações estruturais que o §4, o §7,
# o §9 e o §10 exigem e que o §11 não numerou (G-01..G-13).
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
gate_limitation "A busca por termo revogado (I-01, I-03, I-04, I-05, I-15, I-43) aceita a linha em contexto explicitamente revogatório e ignora docs/00-contratos.md e docs/research/ — ambos citam os termos de propósito."
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

# _scope_into <nome-do-array> [glob-relativo...] — copia SCAN_FILES para o array, tirando
# os caminhos que casam um dos globs. Cada glob usado aqui TEM de ter sido declarado por
# `gate_scope_excl`: exclusão escondida é pior que exclusão conhecida.
_scope_into() {
  local -n _out="$1"; shift
  _out=()
  local f rel g skip
  for f in "${SCAN_FILES[@]}"; do
    rel="${f#"$GATE_ROOT"/}"
    skip=0
    for g in "$@"; do
      # shellcheck disable=SC2254  # o glob é deliberado
      case "$rel" in $g) skip=1; break ;; esac
    done
    [ "$skip" -eq 0 ] && _out+=("$f")
  done
}

# grep_scope <ERE> [glob-excluído...] — casa o padrão em SCAN_FILES descartando o contexto
# revogatório e os caminhos excluídos POR ESTE check (não globalmente).
grep_scope() {
  local pat="$1"; shift
  local -a _f=(); _scope_into _f "$@"
  [ "${#_f[@]}" -eq 0 ] && return 0
  python3 "$SCANNER" revoke "$pat" "$REVOKE_MARKERS" "$GATE_ROOT" "${_f[@]}"
}

# grep_scope_raw <ERE> [glob-excluído...] — igual, sem tolerância de contexto.
grep_scope_raw() {
  local pat="$1"; shift
  local -a _f=(); _scope_into _f "$@"
  [ "${#_f[@]}" -eq 0 ] && return 0
  python3 "$SCANNER" raw "$pat" "" "$GATE_ROOT" "${_f[@]}"
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
  I16  concept_id/scenario_id/target_topic ou slug de caminho com pattern diferente do canonico
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
    # target_topic e IDENTIFICADOR DE TOPICO, nao slug de caminho: casa P_CONCEPT, o
    # mesmo de session.topics. Tinha de ser: a recuperacao do playbook procedimental
    # compara target_topic com topics POR IGUALDADE DE STRING, e com kebab de um lado e
    # snake do outro nenhum procedimento jamais seria recuperado.
    "target_topic": P_CONCEPT,
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

hits="$(grep_scope 'resolve_target|verify_setup|bootstrap_or_ask|ingest_docs|teach_loop|challenge_cycle' "skills/study-method/assets/decisions.json")"
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

# O catálogo de decisões registra, em cada entrada, a opção que foi RECUSADA — pelo nome.
# `assets/decisions.json` é onde `session_status` aparece como o id da alternativa perdedora
# de D-A03/D-M08: citar o termo ali é o contrato do arquivo, não regressão. Mesma razão pela
# qual `docs/00-contratos.md` já está fora de escopo. A exclusão vale SÓ para a família de
# checks de termo revogado — G-09, I-17, I-42, I-43 e G-10 continuam varrendo o arquivo.
DECISIONS_REL="skills/study-method/assets/decisions.json"
gate_scope_excl "I-01b I-03 I-04 I-05 I-15b" "$DECISIONS_REL" \
  "catálogo de decisões: cada entrada nomeia a opção RECUSADA (ex.: o id \`session_status\` em D-A03). Documentar a alternativa perdedora é o contrato do arquivo — os demais checks continuam varrendo-o."

hits="$(grep_scope 'session_status' "$DECISIONS_REL")"
assert_grep_empty "I-03" "o nome revogado do estado da sessão não aparece" \
  "zero ocorrências (o campo é \`status\`, §4.1)" "$hits"

hits="$(grep_scope '\.study-method/|[^-a-z]manifest\.json|docs-manifest\.json|SETUP_CTL|PROFILE\.json' "$DECISIONS_REL")"
assert_grep_empty "I-04" "nenhum termo do diretório de controle revogado" \
  "zero ocorrências de .study-method/ · manifest.json · docs-manifest.json · SETUP_CTL · PROFILE.json" "$hits"

hits="$(grep_scope 'challenge-run\.sh|render-html\.sh' "$DECISIONS_REL")"
assert_grep_empty "I-05" "nenhuma citação aos 2 scripts removidos (§8, A-19)" \
  "zero ocorrências de challenge-run.sh e render-html.sh" "$hits"

hits="$(grep_scope 'allow_cross_read|last_used_at' "$DECISIONS_REL")"
assert_grep_empty "I-15b" "nenhum campo revogado de privacidade/registry" \
  "zero ocorrências de allow_cross_read (vencido por cross_read) e last_used_at (é last_seen_at)" "$hits"

# ═══════════════════════════════════════════════════ B · inventário de scripts (I-06)
gate_section "B · inventário dos 19 scripts (I-06)"

# Auxiliares de prefixo `_` (lib/_jsonschema_min.py, lib/_mutate.py) são módulos internos
# deliberados: o `_` É a marca de "não é entrada da tabela §8". Ficam fora da contagem dos 19
# — mas qualquer script SEM o prefixo que não esteja na tabela continua reprovando.
gate_scope_excl "I-06c" "SK/scripts/**/_*" \
  "auxiliar interno: o prefixo \`_\` declara que o arquivo não é um dos 19 executáveis de §8. Script sem o prefixo e fora da tabela continua sendo FAIL."

CANON_SCRIPTS="$(awk '/^## 8\./{f=1} /^## 9\./{f=0} f' "$CONTRACT" \
  | grep -oE '^\| `(lib/)?[a-z0-9-]+\.(sh|py)`' | sed 's/^| `//;s/`$//' | sort -u)"
n_canon="$(printf '%s\n' "$CANON_SCRIPTS" | grep -c . || true)"
assert_eq "I-06a" "a tabela §8 declara exatamente 19 scripts" "19" "$n_canon" "$(gate_rel "$CONTRACT") §8"

if [ -d "$SCRIPT_DIR" ]; then
  FOUND_SCRIPTS="$(cd "$SCRIPT_DIR" && find . -type f \( -name '*.sh' -o -name '*.py' \) \
    | sed 's|^\./||' | sort -u)"
  missing="$(comm -23 <(printf '%s\n' "$CANON_SCRIPTS") <(printf '%s\n' "$FOUND_SCRIPTS") || true)"
  extra="$(comm -13 <(printf '%s\n' "$CANON_SCRIPTS") <(printf '%s\n' "$FOUND_SCRIPTS") \
    | grep -vE '(^|/)_' || true)"
  if [ -n "$missing" ]; then
    gate_pend "I-06b" "os 19 scripts de §8 existem em SK/scripts/" \
      "faltam $(printf '%s\n' "$missing" | grep -c . || true): $(printf '%s' "$missing" | tr '\n' ' ')"
  else
    gate_pass "I-06b" "os 19 scripts de §8 existem em SK/scripts/"
  fi
  assert_grep_empty "I-06c" "nenhum script fora da tabela §8 (auxiliares \`_*\` à parte)" \
    "zero scripts não declarados no contrato, fora os auxiliares de prefixo \`_\`" "$extra"
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

# Regra desambiguada: identificador de CONCEITO ou TÓPICO (concept_id, scenario_id,
# target_topic) é snake_case; SLUG DE CAMINHO (subject_slug, setup_name, diretório de
# desafio, slug de research) é kebab-case.
assert_grep_empty "I-16" "concept_id/scenario_id/target_topic em snake_case e slug de caminho em kebab-case" \
  "^[a-z][a-z0-9_]{1,62}\$ para conceito/tópico e ^[a-z0-9]+(-[a-z0-9]+)*\$ para slug de caminho (§4.2, A-15)" \
  "$(audit_code I16)"
gate_note "I-16 · a regra arbitrada é snake: \`target_topic\` é comparado com \`session.topics\` por igualdade de string, e com padrões diferentes a recuperação do playbook procedimental nunca casaria. docs/00-contratos.md §4.2 já lista \`target_topic\` no namespace de conceito/tópico e a decisão A-35 registra a superseção de A-15 — contrato, schemas e gate dizem a mesma coisa."

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

# I-14 · enum language: 19 linguagens, na mesma ordem, nos 3 schemas — mais `none` nos DOIS
# que descrevem um SETUP. A assimetria é intencional e arbitrada: um setup pode não ter código
# nenhum (`language: none` é caso legítimo), um DESAFIO em linguagem nenhuma não existe.
# Portanto: setup-manifest 20 · registry 20 · challenge-manifest 19. Ordem idêntica nos 19
# primeiros; `none` sempre por último, onde existe.
LANG_BASE='"python","javascript","typescript","rust","go","java","csharp","ruby","elixir","kotlin","swift","c","cpp","php","lua","julia","r","haskell","bash"'
LANG_EXP="[$LANG_BASE]"
LANG_EXP_SETUP="[$LANG_BASE,\"none\"]"
lang_of() {
  [ -f "$1" ] || { printf '<arquivo ausente>'; return; }
  jq -c '[paths(objects) as $p | getpath($p) | select(type=="object" and (.enum? // empty | type=="array") and ((.enum|length)>=15) and (.enum|index("python")) != null) | .enum] | (.[0] // "<enum language ausente>")' "$1" 2>/dev/null || printf '<erro jq>'
}
for pair in "setup-manifest.schema.json:I-14a:20" "registry.schema.json:I-14b:20" "challenge-manifest.schema.json:I-14c:19"; do
  fn="${pair%%:*}"; rest="${pair#*:}"; iid="${rest%%:*}"; nexp="${rest##*:}"
  if [ ! -f "$SCHEMA_DIR/$fn" ]; then gate_pend "$iid" "enum language em $fn" "arquivo inexistente"; continue; fi
  if [ "$nexp" = 20 ]; then exp="$LANG_EXP_SETUP"; else exp="$LANG_EXP"; fi
  assert_eq "$iid" "enum language ($nexp, mesma ordem) em $fn" "$exp" "$(lang_of "$SCHEMA_DIR/$fn")" "$(gate_rel "$SCHEMA_DIR/$fn")"
done
gate_note "I-14 · a assimetria 20/20/19 é deliberada: \`none\` existe onde se descreve um SETUP (que pode não ter código), não onde se descreve um DESAFIO — igualar os três reprovaria schema correto. docs/00-contratos.md §4.1 e §11 já registram 20/20/19: contrato, schemas e gate concordam."

# I-15 · cross_read
CR_EXP='["ask","allow","never"]'
check_enum "I-15a" "$SCHEMA_DIR/registry.schema.json" \
  '(.properties.setups.items.properties.cross_read.enum // .properties.cross_read.enum)' \
  "$CR_EXP" "enum cross_read em registry.schema.json"
check_enum "I-15c" "$SCHEMA_DIR/setup-manifest.schema.json" \
  '.properties.privacy.properties.cross_read.enum' \
  "$CR_EXP" "enum cross_read em setup-manifest.schema.json → privacy"

# I-17 · challenge_id nunca no formato c-NNNN-<slug>
# `"challenge_id": "{{CHALLENGE_ID}}"` é o BURACO onde o id entra, não um id: o valor só
# existe depois da substituição, e G-09 é quem garante que nenhum placeholder sobrevive ao
# artefato. A exclusão é do PLACEHOLDER, não do arquivo: um *.tmpl que fixasse
# `"challenge_id": "c-0001-merge-sort"` continua sendo FAIL, como qualquer outro artefato.
gate_scope_excl "I-17" "valor que é placeholder \`{{…}}\`" \
  "\`\"challenge_id\": \"{{CHALLENGE_ID}}\"\` é o buraco do id, não um id — e quem garante que o placeholder não sobrevive à renderização é G-09. Todo arquivo, *.tmpl inclusive, continua em escopo para um id literal no formato revogado."
hits="$(grep_scope_raw '"challenge_id" *: *"(?!\{\{)[^0-9"]')"
assert_grep_empty "I-17" "nenhum challenge_id de exemplo no formato revogado c-NNNN-slug" \
  "challenge_id sempre ^[0-9]{4}\$ (A-10)" "$hits"

# ═══════════════════════════════════════════════════ D · scripts, análise estática
gate_section "D · scripts: exit codes, lib/, protocolo e escrita (I-18 .. I-27)"

declare -a EXEC_SH=()
declare -a LIB_SH=()
if [ -d "$SCRIPT_DIR" ]; then
  while IFS= read -r -d '' f; do
    case "$f" in "$LIB_DIR"/*) LIB_SH+=("$f"); continue ;; esac
    EXEC_SH+=("$f")
  done < <(find "$SCRIPT_DIR" -type f -name '*.sh' -print0 2>/dev/null | sort -z)
fi

# ── escopo léxico: a diferença entre USAR um construto e FALAR dele ──────────────────────
# `exit 10` dentro de `sm_request` é o contrato; a mesma linha noutra função é violação.
# `"$@"` dentro de uma função é repasse de argumento; no nível de topo é bloco main.
# `curl` num comentário é documentação; numa linha de código é rede. Um grep de linha não
# separa os três casos — o classificador de tests/lib/assert.sh separa.
SHELLSCOPE="$(gate_shell_scope_tool)"
SCOPE_TSV="$GATE_TMPDIR/shellscope.tsv"
: > "$SCOPE_TSV"
if [ "$(( ${#EXEC_SH[@]} + ${#LIB_SH[@]} ))" -gt 0 ]; then
  python3 "$SHELLSCOPE" classify "$GATE_ROOT" \
    ${EXEC_SH[0]+"${EXEC_SH[@]}"} ${LIB_SH[0]+"${LIB_SH[@]}"} > "$SCOPE_TSV" 2>/dev/null || : > "$SCOPE_TSV"
fi
gate_limitation "I-19, I-23, I-26, I-27 e G-09 leem o fonte shell por um classificador léxico (comentário · here-document · string multilinha · escopo de função), não por um parser de shell completo. Ele se autoverifica: arquivo cuja profundidade de chaves não fecha em zero é reportado, e o check cai para a leitura crua daquele arquivo."

# Autoverificação do classificador: se a profundidade não voltar a zero, ele não entendeu o
# arquivo — e isso precisa aparecer, não ser engolido.
SCOPE_BROKEN="$(awk -F'\t' '$3=="EOF" && $5!=0 {print $1}' "$SCOPE_TSV" 2>/dev/null || true)"
if [ -n "$SCOPE_BROKEN" ]; then
  gate_warn "SCOPE" "o classificador léxico não fechou as chaves em $(printf '%s' "$SCOPE_BROKEN" | grep -c .) arquivo(s)" \
    "$(gate_trunc "$(printf '%s' "$SCOPE_BROKEN" | tr '\n' ' ')" 200) — nesses arquivos I-19/I-23/I-26/I-27 caem para leitura crua (mais falso positivo, nunca menos cobertura)"
fi

# scope_code_lines <rel-do-arquivo> — nº das linhas que EXECUTAM (nem comentário, nem corpo
# de here-document, nem continuação de string multilinha). Arquivo que o classificador não
# entendeu devolve todas as linhas: prefere-se falso positivo a buraco de cobertura.
scope_code_lines() {
  local rel="$1"
  if printf '%s\n' "$SCOPE_BROKEN" | grep -qxF "$rel"; then
    awk -F'\t' -v f="$rel" '$1==f && $3!="EOF" {print $2}' "$SCOPE_TSV"
    return 0
  fi
  awk -F'\t' -v f="$rel" '$1==f && $3=="code" {print $2}' "$SCOPE_TSV"
}

# scope_filter_scan — filtra `rel:linha: texto` (saída de scan.py) deixando de fora as
# linhas de shell que não executam: comentário, corpo de here-document e string multilinha.
# Arquivo que não é shell classificado passa inteiro.
scope_filter_scan() {
  awk -F: -v tsv="$SCOPE_TSV" '
    BEGIN {
      while ((getline l < tsv) > 0) {
        n = split(l, a, "\t")
        if (n >= 3) { known[a[1]] = 1; if (a[3] == "code") ok[a[1] ":" a[2]] = 1 }
      }
    }
    { rel=$1; ln=$2 }
    !(rel in known) { print; next }
    (rel ":" ln) in ok { print }
  '
}

# scope_filter <rel> — filtra `nº:texto` (saída de grep -n) deixando só as linhas de código.
scope_filter() {
  local rel="$1" keep
  keep="$(scope_code_lines "$rel")"
  [ -z "$keep" ] && return 0
  awk -F: -v k="$keep" 'BEGIN{n=split(k,a,"\n"); for(i=1;i<=n;i++) ok[a[i]]=1} ok[$1]'
}

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
  # `nc ` sem fronteira de palavra casa dentro de `func `, `sync ` e `Async ` — três palavras
  # que aparecem em gerador de código Go/JS. A fronteira \b é o que separa o comando `nc` do
  # sufixo de outra palavra. E só linha de CÓDIGO conta: `# nunca use curl` é documentação.
  NET_RE='(^|[^A-Za-z0-9_.-])(curl|wget|nc|ncat|ssh|scp|sftp|rsync|telnet)([^A-Za-z0-9_-]|$)|/dev/(tcp|udp)/|ftp://'
  bad=""
  for f in "${EXEC_SH[@]}"; do
    rel="$(gate_rel "$f")"
    m="$(grep -nE "$NET_RE" "$f" 2>/dev/null | scope_filter "$rel" || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$rel:|")"$'\n'
  done
  assert_grep_empty "I-26" "zero rede nos scripts" \
    "nenhum curl/wget/nc/ncat/ssh/scp/sftp/rsync/telnet como PALAVRA, nenhum /dev/tcp e nenhum ftp://, em linha de código" "${bad%$'\n'}"

  # I-27 derivados só por sm_atomic_write
  # Três precisões, todas necessárias e nenhuma permissiva:
  #  1. o `>` tem de SER um redirecionamento — início de linha, ou precedido de espaço, `&`
  #     ou descritor. Sem isso, o `>` de `<path>/setup.json` num texto de uso já acusava;
  #  2. só linha de CÓDIGO — texto de uso vive em here-document, comentário é comentário;
  #  3. o alvo tem de ser o destino FINAL. O padrão correto de §7.1 é montar em temporário
  #     e publicar com `sm_atomic_write <final> < <temporário>`; escrever no temporário É o
  #     caminho certo, e acusá-lo é acusar o contrato.
  # A busca é feita em python porque o que importa é o ALVO do redirecionamento, não a linha:
  # `jq . "$SM_TMP/meta.json" > "$CH_DIR/meta.json"` tem um temporário na ORIGEM e o destino
  # final no ALVO — e é violação. Já `... > "$SM_TMP/meta.json"` seguido de
  # `sm_atomic_write "$CH_DIR/meta.json" < "$SM_TMP/meta.json"` é o padrão de §7.1.
  bad="$(python3 - "$SCOPE_TSV" <<'PYI27' 2>/dev/null || true
import re
import sys

DERIVED = re.compile(r"(INDEX\.json|profile\.json|progress\.json|docs-index\.json|"
                     r"setup\.json|meta\.json|registry\.json|README\.md)$")
# um redirecionamento de verdade: inicio de linha, ou precedido de espaco/`&`; nunca `2>`,
# nunca `>&N`, nunca `<`. O alvo vai ate o proximo separador de shell.
REDIR = re.compile(r"(?:^|[\s&|;(])(?<![0-9])>>?(?![&>])\s*(\S+)")
TEMP = re.compile(r"SM_TMP|TMPDIR|TEMPDIR|MKTEMP|mktemp|/tmp/|\.tmp\b|\.part\b|\.new\b|"
                  r"_tmp|_TMP|WORK|\$\$", re.IGNORECASE)

bad = []
for row in open(sys.argv[1], encoding="utf-8", errors="replace"):
    f = row.rstrip("\n").split("\t")
    if len(f) < 6 or f[2] != "code":
        continue
    code = f[5]
    if "sm_atomic_write" in code:
        continue
    for m in REDIR.finditer(code):
        target = m.group(1).strip().strip('"').strip("'")
        if not DERIVED.search(target):
            continue
        if TEMP.search(target):
            continue          # escrever no temporario E o contrato de §7.1
        bad.append("%s:%s: escreve direto no destino final -> %s   [%s]"
                   % (f[0], f[1], target, code.strip()[:120]))
sys.stdout.write("\n".join(bad) + ("\n" if bad else ""))
PYI27
)"
  assert_grep_empty "I-27" "todo derivado é escrito por sm_atomic_write, nunca por > direto no destino final" \
    "sm_atomic_write em INDEX/profile/progress/docs-index/setup/meta/registry/README (§7.1); escrita direta só em temporário" "${bad%$'\n'}"
  gate_scope_excl "I-27" "redirecionamento cujo ALVO é temporário" \
    "o padrão de §7.1 é montar em \$SM_TMP/… e publicar com \`sm_atomic_write <final> < <temporário>\`. Acusar a escrita no temporário é acusar o contrato; o teste é sobre o ALVO do \`>\`, então um temporário na ORIGEM não protege ninguém — a escrita no DESTINO FINAL continua sendo FAIL."
fi

# I-19/I-20/I-23 · lib/
if [ ! -d "$LIB_DIR" ] || [ -z "$(ls -A "$LIB_DIR" 2>/dev/null | grep '\.sh$' || true)" ]; then
  for iid in I-19 I-20 I-23; do gate_pend "$iid" "invariante sobre SK/scripts/lib/" "nenhum .sh em $(gate_rel "$LIB_DIR")"; done
else
  # I-19 · LIB-1: modo 0644 e NENHUMA execução de nível de topo.
  # A regra é sobre EXECUÇÃO NO TOPO, não sobre a string `"$@"`. Em lib/sandbox.sh o `"$@"`
  # aparece (a) num comentário, (b) como repasse de argumento DENTRO de função e (c) dentro
  # de um here-document que é o texto de um wrapper — nenhum dos três é bloco main. O que a
  # LIB-1 proíbe é a lib rodar sozinha ao ser executada: definição/chamada de `main`, o
  # repasse `"$@"` como COMANDO fora de função, e o guarda de auto-execução.
  bad=""
  for f in "$LIB_DIR"/*.sh; do
    rel="$(gate_rel "$f")"
    [ -x "$f" ] && bad="$bad$rel: tem bit de execução (modo $(stat -c '%a' "$f"))"$'\n'
    m="$(awk -F'\t' -v f="$rel" '
          $1==f && $3=="code" && $4=="" && $5==0 {
            line=$6
            sub(/^[[:space:]]+/, "", line)
            if (line ~ /^(main|_main)[[:space:]]*\(\)/)                       { print $2": define bloco main de topo -> "line }
            else if (line ~ /^(main|_main)([[:space:]]|$)/)                    { print $2": chama main no nível de topo -> "line }
            else if (line ~ /^(exec[[:space:]]+)?"\$@"/)                       { print $2": repassa \"$@\" como comando no nível de topo -> "line }
            else if (line ~ /BASH_SOURCE\[0\]/ && line ~ /\$0/)                { print $2": guarda de auto-execução no nível de topo -> "line }
          }' "$SCOPE_TSV" || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$rel:|")"$'\n'
  done
  assert_grep_empty "I-19" "lib/ sem bit de execução e sem execução de nível de topo (LIB-1)" \
    "modo 0644 e nenhuma linha executável fora de função: sem \`main\`, sem \`\"\$@\"\` como comando, sem guarda de auto-execução" "${bad%$'\n'}"
  gate_scope_excl "I-19" "\`\"\$@\"\` em comentário, dentro de função ou em here-document" \
    "LIB-1 proíbe a lib EXECUTAR ao ser rodada — não proíbe a string. Repasse de argumento dentro de função e texto de wrapper em here-document não são bloco main; \`\"\$@\"\` como comando no nível de topo continua sendo FAIL."

  CANON_FN="$(awk '/^### 7\.1/{f=1} /^### 7\.3/{f=0} f' "$CONTRACT" | grep -oE '^\| `sm_[a-z_]+' | sed 's/^| `//' | sort -u)"
  REAL_FN="$(grep -hoE '^[[:space:]]*(function[[:space:]]+)?sm_[a-z_]+[[:space:]]*\(\)' "$LIB_DIR/common.sh" "$LIB_DIR/json.sh" 2>/dev/null \
    | sed -E 's/^[[:space:]]*(function[[:space:]]+)?//; s/[[:space:]]*\(\)$//' | sort -u)"
  miss="$(comm -23 <(printf '%s\n' "$CANON_FN") <(printf '%s\n' "$REAL_FN") || true)"
  extra="$(comm -13 <(printf '%s\n' "$CANON_FN") <(printf '%s\n' "$REAL_FN") || true)"
  if [ -n "$miss" ] || [ -n "$extra" ]; then
    gate_fail "I-20" "as funções de lib/common.sh e lib/json.sh são exatamente as da tabela §7" \
      "as 27 funções de §7.1 e §7.2" \
      "faltando: $(printf '%s' "$miss" | tr '\n' ' ')| sobrando: $(printf '%s' "$extra" | tr '\n' ' ')" \
      "$(gate_rel "$LIB_DIR")/{common,json}.sh"
  else
    gate_pass "I-20" "as 27 funções de lib/ batem com a tabela §7"
  fi

  # I-23 · o `exit 10` é ESCOPO DE FUNÇÃO, não texto de linha. `json.sh:145` está DENTRO de
  # `sm_request` (a função fecha na 146) — acusá-lo é acusar a própria implementação do §7.2.
  # O que viola é `exit 10`/`return 10` em qualquer OUTRA função, ou no nível de topo.
  bad=""
  for f in "$LIB_DIR"/*.sh; do
    rel="$(gate_rel "$f")"
    m="$(awk -F'\t' -v f="$rel" '
          $1==f && $3=="code" && $6 ~ /(^|[^_a-zA-Z])(exit|return)[[:space:]]+10([^0-9]|$)/ {
            if ($4 != "sm_request" && $4 !~ /(^|>)sm_request(>|$)/) {
              line=$6; sub(/^[[:space:]]+/, "", line)
              print $2": `exit 10` fora de sm_request (função: " ($4==""?"<nível de topo>":$4) ") -> " line
            }
          }' "$SCOPE_TSV" || true)"
    [ -n "$m" ] && bad="$bad$(printf '%s\n' "$m" | sed "s|^|$rel:|")"$'\n'
  done
  bad="${bad%$'\n'}"
  ok10="$(awk -F'\t' '$1 ~ /lib\/json\.sh$/ && $3=="code" && $4=="sm_request" && $6 ~ /(exit|return)[[:space:]]+10([^0-9]|$)/' "$SCOPE_TSV" | grep -c . || true)"
  assert_grep_empty "I-23" "só sm_request produz exit 10 em todo o projeto" \
    "exit 10 apenas DENTRO do corpo de sm_request (§7.2)" "$bad"
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
  assert_grep_empty "I-29a" "o digest tem sempre as mesmas chaves de topo, na mesma ordem" \
    "$DIGEST_KEYS" "${badk%$'\n'}"

  # I-29b · a CONTAGEM. Arbitrado: são 18 chaves de topo, não 19. `procedural_playbook` é uma
  # chave só; `do` e `avoid` vivem ANINHADOS dentro dela e nunca aparecem no topo — quem conta
  # 19 contou um aninhado como se fosse de topo. O gate passa a checar 18.
  DIGEST_N_EXP=18
  n_keys="$(printf '%s' "$DIGEST_KEYS" | tr ',' '\n' | grep -c . || true)"
  assert_eq "I-29b" "o digest tem exatamente $DIGEST_N_EXP chaves de topo" "$DIGEST_N_EXP" "$n_keys" \
    "docs/03-memoria.md (ordem fixa do digest)"
  got_n="$("$SCRIPT_DIR/memory-digest.sh" "$FX/vazia" 2>/dev/null | jq -r 'keys_unsorted | length' 2>/dev/null || echo '<saída não é JSON>')"
  assert_eq "I-29c" "o digest produzido tem $DIGEST_N_EXP chaves de topo" "$DIGEST_N_EXP" "$got_n" \
    "SK/scripts/memory-digest.sh"
  gate_note "I-29 · são 18 chaves de topo e 19 blocos: \`procedural_playbook.do\` e \`.avoid\` são aninhados, não chaves de topo — esperar 19 reprovaria um digest correto. docs/00-contratos.md §11 já registra 18: contrato e gate concordam."
else
  gate_pend "I-29" "o digest tem sempre as mesmas 18 chaves de topo" "executável ausente: SK/scripts/memory-digest.sh"
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

# I-31 · evidence[] é a fonte de verdade; TODO escalar é cache reconstruível.
# A prova é destrutiva de propósito: apaga os 12 escalares de todo conceito do fixture
# canônico e exige que --recompute os traga de volta IDÊNTICOS. Comparar contra o
# fixture (e não contra o que o próprio script acabou de escrever) é o que impede o
# check de concordar consigo mesmo.
I31_FIXTURE="$GATE_ROOT/examples/setup-calculo-python"
I31_SCALARS='["proficiency_state","state_reason","confidence","attempts","unassisted_passes","max_hint_level_used","last_error_type","first_observed_at","observed_at","last_observed_at","interval_days","next_review_at"]'
if run_or_pend "I-31" "progress-update.sh --recompute reconstrói todo escalar de evidence[]" "progress-update.sh"; then
  if [ ! -f "$I31_FIXTURE/memory/progress.json" ]; then
    gate_pend "I-31" "progress-update.sh --recompute reconstrói todo escalar de evidence[]" \
      "fixture canônico ausente: $(gate_rel "$I31_FIXTURE/memory/progress.json")"
  else
    FX="$GATE_TMPDIR/fx31"; rm -rf "$FX"; mkdir -p "$FX"
    cp -a "$I31_FIXTURE/." "$FX/"
    cp "$FX/memory/progress.json" "$GATE_TMPDIR/progress-canon.json"
    export STUDY_METHOD_HOME="$GATE_TMPDIR/home31"; mkdir -p "$STUDY_METHOD_HOME"
    i31_ok=1; i31_det=""
    # (a) o fixture é auto-consistente: recompute sobre ele não muda NADA.
    i31_out="$("$SCRIPT_DIR/progress-update.sh" "$FX" --recompute 2>/dev/null || true)"
    i31_n="$(printf '%s' "$i31_out" | jq -r '.changed // "?"' 2>/dev/null || echo '?')"
    if [ "$i31_n" != "0" ]; then
      i31_ok=0
      i31_det+="o fixture canônico não é auto-consistente: --recompute sobre ele mudou $i31_n escalar(es). "
    fi
    # (b) apaga os 12 escalares de TODO conceito e manda reconstruir.
    if jq --argjson sc "$I31_SCALARS" '.concepts |= map(delpaths([$sc[] | [.]]))' \
         "$GATE_TMPDIR/progress-canon.json" > "$FX/memory/progress.json" 2>/dev/null; then
      if "$SCRIPT_DIR/progress-update.sh" "$FX" --recompute >/dev/null 2>"$GATE_TMPDIR/i31.err"; then
        i31_diff="$(diff <(jq -S '.concepts' "$GATE_TMPDIR/progress-canon.json") \
                        <(jq -S '.concepts' "$FX/memory/progress.json") 2>&1 || true)"
        if [ -n "$i31_diff" ]; then
          i31_ok=0
          i31_det+="depois de apagar os 12 escalares, --recompute NÃO os reconstruiu iguais: $(gate_trunc "$i31_diff"). "
        fi
      else
        i31_ok=0
        i31_det+="--recompute falhou sobre o fixture sem escalares: $(gate_trunc "$(cat "$GATE_TMPDIR/i31.err")"). "
      fi
    else
      i31_ok=0; i31_det+="não consegui montar o fixture sem escalares (jq). "
    fi
    if [ "$i31_ok" -eq 1 ]; then
      gate_pass "I-31" "--recompute reconstrói os 12 escalares de todo conceito a partir de evidence[] (fixture canônico, byte a byte)"
    else
      gate_fail "I-31" "progress-update.sh --recompute reconstrói todo escalar de evidence[]" \
        "evidence[] é a fonte de verdade: apagados, os 12 escalares voltam idênticos" \
        "$i31_det" "$(gate_rel "$I31_FIXTURE/memory/progress.json")"
    fi
    unset STUDY_METHOD_HOME
  fi
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
# 90 = as 88 originais + AS-13 e BOOT-8, acrescentadas na mesma leva. O número é
# LITERAL de propósito: derivá-lo da própria contagem faria o check concordar consigo
# mesmo e nunca acusar uma regra perdida. Quem acrescenta regra ao §9 mexe aqui também.
assert_eq "G-04a" "o §9 do contrato declara 90 regras permanentes" "90" "$RULE_N" "$(gate_rel "$CONTRACT") §9"
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
  assert_grep_empty "I-33b" "os 90 IDs de regra do §9 estão no corpo do SKILL.md" \
    "os 90 IDs (C-*, AS-*, AN-*, ESC-*, ERR-*, MEM-*, PRIV-*, SEG-*, DES-*, VIZ-*, BOOT-*)" \
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
    # Isto NÃO é falso positivo: uma reference que o SKILL.md não cita é uma reference que o
    # modelo nunca vai abrir — o grafo de um nível de §F só funciona se o nó de entrada
    # apontar para todos. A mensagem nomeia o arquivo que falta e onde a linha precisa entrar.
    bad=""
    for f in "${REFS[@]}"; do
      b="$(basename "$f")"
      grep -qF "$b" "$SKILL_MD" || \
        bad="$bad$(gate_rel "$SKILL_MD") não cita «references/$b» — a reference existe em $(gate_rel "$f") ($(grep -c '' "$f" || true) linhas) e ficaria inalcançável"$'\n'
    done
    assert_grep_empty "I-34b" "toda reference é linkada direto do SKILL.md" \
      "uma linha no corpo do SKILL.md citando cada references/*.md pelo nome de arquivo" "${bad%$'\n'}"
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
  gate_pend "I-39" "execution.sandbox.mode e execution.sandbox.timeout_source em todo meta.json com verdict != not_run" "nenhum fixture em examples/"
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
    # Os dois campos vivem em `.execution.sandbox` — é onde challenge-manifest.schema.json
    # os declara, e a raiz do manifesto é `additionalProperties: false`. Procurá-los na
    # RAIZ (`.sandbox.mode`) tornava a invariante impossível de satisfazer: nenhum
    # manifesto válido poderia passar, e todo desafio real reprovava aqui.
    jq -e '(.execution.sandbox.mode? // empty) and (.execution.sandbox.timeout_source? // empty)' \
      "$f" >/dev/null 2>&1 || \
      bad="$bad$(gate_rel "$f"): verdict=$v sem execution.sandbox.mode e/ou execution.sandbox.timeout_source"$'\n'
  done
  assert_grep_empty "I-39" "execution.sandbox.mode e execution.sandbox.timeout_source em todo meta.json com verdict != not_run" \
    "os dois campos gravados sob execution.sandbox, onde o schema os declara (§11 I-39)" "${bad%$'\n'}"
  gate_note "I-39 · os dois campos vivem sob \`execution.sandbox\`, que é onde challenge-manifest.schema.json os declara e o único lugar onde a raiz \`additionalProperties: false\` os aceita; o caminho não qualificado faria a verificação procurar onde o campo nunca esteve. docs/00-contratos.md §11 já os escreve qualificados: contrato, schema e gate concordam."
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

# G-09 · nenhum {{ }} sobrando em ARTEFATO MATERIALIZADO do repositório
# Artefato materializado é o que a construção PRODUZ. Não é artefato — e por isso fica fora:
#   *.tmpl e MANIFEST.tsv   o template é o dono do placeholder; o manifesto o declara;
#   docs/build-spec/**      contrato: os fragmentos DOCUMENTAM a sintaxe ("`{{PKG}}` — o mesmo
#                           do stub"). Documentar o buraco não é deixar buraco;
#   BUILD_SPEC.md           o documento montado a partir de docs/build-spec/**, MESMA
#                           justificativa: §0.7.5 dele documenta a sintaxe de placeholder e o
#                           corpo transcreve trechos de template. Escrevê-la de outro jeito
#                           para escapar deste check ensinaria a forma errada a quem copiar;
#   comentário e here-document de script   o `# Substitui {{PLACEHOLDER}}…` explica o
#                           renderizador, e o here-document `<<'TMPL'` de session-new.sh e
#                           research-new.sh É o template embutido (o mesmo conteúdo do *.tmpl,
#                           usado quando o arquivo falta) — os dois passam pela substituição.
# O que sobra é justamente o artefato: SKILL.md, references/, schemas, examples/, evals/,
# docs/ normativo. Aí um {{ }} é FAIL. Em runtime, quem prova que nada sobrevive à
# renderização é o smoke (S-06) sobre o material realmente produzido.
gate_scope_excl "G-09" "docs/build-spec/** · BUILD_SPEC.md · *.tmpl · MANIFEST.tsv · comentário e here-document de script" \
  "os fragmentos do BUILD_SPEC e o BUILD_SPEC.md montado a partir deles documentam a sintaxe de placeholder (§0.7.5), e os scripts carregam o template embutido; nenhum dos três é artefato materializado. Placeholder em SKILL.md, reference, schema, examples/ ou doc normativo continua sendo FAIL, e o smoke (S-06) cobre o material produzido em runtime."
bad="$(grep_scope_raw '\{\{[A-Za-z0-9_ ]*\}\}' '*.tmpl' 'docs/build-spec/*' 'BUILD_SPEC.md' '*MANIFEST.tsv' \
      | scope_filter_scan | grep -vE 'study-method:meta' || true)"
assert_grep_empty "G-09" "nenhum {{ }} órfão em artefato materializado" \
  "placeholder só em *.tmpl, no MANIFEST.tsv, no BUILD_SPEC que o documenta e no template embutido do renderizador" "$bad"

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

# `evals/run-evals.sh` procura a MESMA lista dentro de evals/, e para procurá-la precisa
# DECLARÁ-LA literalmente — o array `CLAIMS_PROIBIDAS=( … )` é a declaração. É a mesma situação
# de docs/02 §9: quem enuncia a proibição não está reincidindo nela. O que isenta cada uma
# daquelas linhas é o MARCADOR (`# afirmação proibida por I-43`), que REVOKE_MARKERS reconhece
# como contexto revogatório — e não uma exclusão de intervalo. A diferença importa: a isenção
# acompanha o marcador dentro da janela de ±1 linha do modo `revoke` do SCANNER, então linha de
# run-evals.sh fora dessa janela continua em escopo, e todo o resto de evals/ também. (O
# próprio run-evals.sh já se exclui da busca dele, pela mesma razão, e diz isso na saída.)
gate_scope_excl "I-43" "linha com o marcador \`# afirmação proibida por I-43\`" \
  "é a DECLARAÇÃO da lista proibida: evals/run-evals.sh precisa enunciar os literais para procurá-los dentro de evals/ — mesma natureza de docs/02 §9. A isenção vem do marcador, na janela de ±1 linha do modo revoke; linha fora dessa janela continua em escopo, e todo o resto de evals/ também."
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
    # G-12a · a camada que existe hoje: o id do catálogo.
    bad=""
    while IFS= read -r did; do
      [ -z "$did" ] && continue
      printf '%s' "$did" | grep -qE '^D-[A-Z]{1,3}[0-9]{2,3}$' || bad="${bad}$did: id fora do pattern ^D-[A-Z]{1,3}[0-9]{2,3}\$"$'\n'
    done <<< "$(jq -r '.decisions[].id // empty' "$DEC" 2>/dev/null)"
    assert_grep_empty "G-12a" "todo id do catálogo casa ^D-[A-Z]{1,3}[0-9]{2,3}\$ (camada JSON)" \
      "$n_dec ids no pattern de §4.2" "${bad%$'\n'}"

    # G-12c · camada HUMANA. O alvo tem nome e dono declarados em docs/build-spec/10-decisoes.md
    # §1: `docs/08-decisoes-abertas.md`, "Derivado (outra onda)". Enquanto o arquivo não existe,
    # isto é PENDÊNCIA — "ainda não escrito", não "escrito errado". O gate continua vermelho
    # (PEND conta como vermelho); só a mensagem muda, e ela diz o que falta e de quem é. No dia
    # em que o arquivo nascer, cada id não citado nele vira FAIL.
    HUMAN_DEC="$GATE_ROOT/docs/08-decisoes-abertas.md"
    if [ ! -f "$HUMAN_DEC" ]; then
      gate_pend "G-12c" "cada D-NNN tem a camada humana (render do catálogo)" \
        "docs/08-decisoes-abertas.md — declarado «Derivado (outra onda)» em docs/build-spec/10-decisoes.md §1, junto de SK/scripts/decisions-ask.sh. Dono: a onda que gera os derivados do catálogo. Os $n_dec ids do catálogo esperam por ele."
    else
      bad=""
      while IFS= read -r did; do
        [ -z "$did" ] && continue
        grep -qF "$did" "$HUMAN_DEC" 2>/dev/null || bad="${bad}$did: não aparece em docs/08-decisoes-abertas.md"$'\n'
      done <<< "$(jq -r '.decisions[].id // empty' "$DEC" 2>/dev/null)"
      assert_grep_empty "G-12c" "cada D-NNN tem a camada humana (docs/08-decisoes-abertas.md)" \
        "todo id do catálogo citado no render humano" "${bad%$'\n'}"
    fi

    # G-12d · camada BUILD_SPEC. Só uma FATIA do catálogo ganha marcador — docs/build-spec/
    # 10-decisoes.md §6.2: `audience ∈ {builder, both}` E `status == open`, 48 entradas. Exigir
    # marcador das 114 é exigir o que o próprio contrato dispensa: as `student` viram pergunta
    # em runtime (§6.4) e as 20 arbitradas viram uma linha de citação, não um marcador.
    MARKED_IDS="$(jq -r '.decisions[] | select((.audience=="builder" or .audience=="both") and .status=="open") | .id' "$DEC" 2>/dev/null || true)"
    n_marked="$(printf '%s\n' "$MARKED_IDS" | grep -c . || true)"
    # Marcador de verdade tem a forma de §6.1. `10-decisoes.md` é o fragmento que DEFINE essa
    # forma (o exemplo do §6.1, a tabela do §6.2, a contagem do §8): não conta como marcador.
    n_real_markers="$(grep -rlE '\*\*PERGUNTE AO USUÁRIO \(D-[A-Z]{1,3}[0-9]{2,3}\)\*\*' "$GATE_ROOT/docs/build-spec" 2>/dev/null \
      | grep -v '10-decisoes\.md' | grep -c . || true)"
    bad=""
    while IFS= read -r did; do
      [ -z "$did" ] && continue
      grep -rqE "\*\*PERGUNTE AO USUÁRIO \($did\)\*\*" "$GATE_ROOT/docs/build-spec" 2>/dev/null \
        || bad="${bad}$did: sem marcador «PERGUNTE AO USUÁRIO ($did)» em fragmento nenhum"$'\n'
    done <<< "$MARKED_IDS"
    bad="${bad%$'\n'}"
    if [ "${n_real_markers:-0}" -eq 0 ] && [ -n "$bad" ]; then
      gate_pend "G-12d" "cada D-NNN de build tem marcador no BUILD_SPEC (§6.2)" \
        "a passada de marcação ainda não começou: zero marcadores «PERGUNTE AO USUÁRIO (D-…)» em docs/build-spec/ fora do 10-decisoes.md, que só define a forma. Faltam os $n_marked de audience builder/both com status open; o dono de cada um é o fragmento da tabela de roteamento de docs/build-spec/10-decisoes.md §6.3."
    else
      assert_grep_empty "G-12d" "cada D-NNN de build tem marcador no BUILD_SPEC (§6.2)" \
        "marcador de §6.1 para os $n_marked ids de audience builder/both com status open" "$bad"
    fi
    gate_scope_excl "G-12d" "as $(( n_dec - n_marked )) entradas sem marcador de build" \
      "docs/build-spec/10-decisoes.md §6.2: só \`audience ∈ {builder, both}\` com \`status == open\` ganha marcador. As \`student\` viram pergunta em runtime (§6.4) e as arbitradas viram uma linha de citação — exigir marcador delas é exigir o que o contrato dispensa."

    # G-12b · todo writes_to resolve no schema do manifesto do setup.
    # A resolução PARA num objeto extensível. `setup.json → decisions` é declarado
    # `additionalProperties: true` SEM `properties` de propósito: é um MAPA de id de decisão
    # para resposta, e o schema diz literalmente "Deliberadamente extensivel: novos ids de
    # decisao entram sem mudanca de schema_version". Exigir que `decisions.D-A14` exista como
    # `properties.decisions.properties."D-A14"` é exigir o oposto do que o schema promete.
    # O que continua sendo FAIL: caminho que morre num objeto FECHADO.
    SM_SCHEMA="$SCHEMA_DIR/setup-manifest.schema.json"
    WT_RESOLVER="$GATE_TMPDIR/writes_to.py"
    cat > "$WT_RESOLVER" <<'PYWT'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Resolve cada `writes_to` do catalogo contra setup-manifest.schema.json."""
import json
import sys

try:
    schema = json.load(open(sys.argv[1], encoding="utf-8"))
except (OSError, ValueError) as exc:
    sys.stderr.write("setup-manifest.schema.json ilegivel: %s\n" % exc)
    sys.exit(0)


def resolve(path):
    node = schema
    walked = []
    for part in path.split("."):
        props = node.get("properties")
        addl = node.get("additionalProperties", True)
        if not isinstance(props, dict) or part not in props:
            if addl is True or isinstance(addl, dict):
                return None      # objeto extensivel: o schema aceita a chave nao enumerada
            return (u"writes_to \u00ab%s\u00bb morre em %s: objeto FECHADO "
                    u"(additionalProperties: false) que nao declara \u00ab%s\u00bb"
                    % (path, ".".join(walked) or "<raiz>", part))
        node = props[part]
        walked.append(part)
    return None


bad = []
for line in sys.stdin.read().split("\n"):
    wt = line.strip()
    if not wt or wt == "null":
        continue
    why = resolve(wt)
    if why:
        bad.append(why)
sys.stdout.write("\n".join(bad) + ("\n" if bad else ""))
PYWT
    bad="$(jq -r '.decisions[].writes_to // empty' "$DEC" 2>/dev/null \
           | python3 "$WT_RESOLVER" "$SM_SCHEMA" 2>/dev/null || true)"
    assert_grep_empty "G-12b" "todo writes_to aponta para caminho existente em setup-manifest.schema.json" \
      "cada writes_to resolvível em properties.<a>.properties.<b>…, parando em objeto extensível" "${bad%$'\n'}"
    gate_scope_excl "G-12b" "sufixo de caminho abaixo de um objeto extensível" \
      "\`setup.json → decisions\` é \`additionalProperties: true\` sem \`properties\`: um MAPA de id para resposta, que o próprio schema declara extensível. A resolução para ali. Caminho que morre em objeto FECHADO continua sendo FAIL."
  fi
fi

gate_summary
