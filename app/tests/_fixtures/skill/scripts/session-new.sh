#!/usr/bin/env bash
# FIXTURE (teste): imita o contrato de session-new.sh.
# session-new.sh <setup_root> [--goal <texto>]  -> stdout NNNN (4 dígitos).
set -u

RECORD="${STUDY_METHOD_FIXTURE_RECORD:-}"
if [ -n "$RECORD" ]; then
  mkdir -p "$(dirname "$RECORD")"
  printf 'session-new ARGS[%s]\n' "$*" >> "$RECORD"
fi
printf '0042\n'
exit 0
