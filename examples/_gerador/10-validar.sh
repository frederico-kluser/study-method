#!/usr/bin/env bash
# 10-validar.sh — prova que TODO JSON do setup valida contra o schema dono.
. "$(cd -- "$(dirname -- "$0")" && pwd -P)/00-env.sh"
V="$S/lib/_jsonschema_min.py"
SCH="$SK/assets/schemas"
falhas=0
val() { # <arquivo> <schema>
  local rel="${1#$SETUP/}"
  if python3 "$V" "$1" "$2" 2>"$WORK/val.err"; then
    printf '  OK    %-44s  <- %s\n' "$rel" "$(basename "$2")"
  else
    printf '  FALHA %-44s  <- %s\n' "$rel" "$(basename "$2")"; sed 's/^/          /' "$WORK/val.err"; falhas=$((falhas+1))
  fi
}
val "$SETUP/setup.json"              "$SCH/setup-manifest.schema.json"
for f in "$SETUP"/memory/[0-9][0-9][0-9][0-9].json; do val "$f" "$SCH/session.schema.json"; done
val "$SETUP/memory/INDEX.json"       "$SCH/index.schema.json"
val "$SETUP/memory/profile.json"     "$SCH/profile.schema.json"
val "$SETUP/memory/progress.json"    "$SCH/progress.schema.json"
val "$SETUP/memory/docs-index.json"  "$SCH/docs-index.schema.json"
val "$SETUP/challenges/0001-derivada-numerica/meta.json" "$SCH/challenge-manifest.schema.json"
for f in "$WORK"/eventos/*.json; do
  if python3 "$V" "$f" "$SCH/progress-event.schema.json" 2>"$WORK/val.err"; then
    printf '  OK    %-44s  <- %s\n' "eventos/$(basename "$f")" "progress-event.schema.json"
  else
    printf '  FALHA %-44s\n' "eventos/$(basename "$f")"; sed 's/^/          /' "$WORK/val.err"; falhas=$((falhas+1))
  fi
done
val "$STUDY_METHOD_HOME/registry.json" "$SCH/registry.schema.json"
echo
echo "falhas de schema: $falhas"
[ "$falhas" = 0 ]
