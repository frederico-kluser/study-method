#!/usr/bin/env bash
# FIXTURE (teste): não roda sandbox real — imita o contrato de setup-init.sh.
# setup-init.sh <path> --subject <s> --subject-slug <sl> --title <t> [flags...]
# stdout: setup_id de 12 hex. Registra "$@" no arquivo em STUDY_METHOD_FIXTURE_RECORD.
set -u

RECORD="${STUDY_METHOD_FIXTURE_RECORD:-}"
if [ -n "$RECORD" ]; then
  mkdir -p "$(dirname "$RECORD")"
  printf 'setup-init ARGS[%s]\n' "$*" >> "$RECORD"
fi
printf 'a1b2c3d4e5f6\n'
exit 0
