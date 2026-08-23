#!/usr/bin/env bash
# FIXTURE (teste): imita o contrato de challenge-new.sh.
# challenge-new.sh <setup_root> --language <l> --slug <sl> --concept <c> [flags...]
# stdout: caminho relativo "challenges/<NNNN>-<slug>". NÃO cria diretório real.
set -u

RECORD="${STUDY_METHOD_FIXTURE_RECORD:-}"
if [ -n "$RECORD" ]; then
  mkdir -p "$(dirname "$RECORD")"
  printf 'challenge-new ARGS[%s]\n' "$*" >> "$RECORD"
fi
printf 'challenges/0001-factorial\n'
exit 0