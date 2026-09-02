#!/usr/bin/env bash
# FIXTURE (teste) — runner.sh fake: imita o contrato do runner.sql gerado.
# Exit: 0 passou · 1 falhou · 2 contagem divergente · 3 timeout · 66 cd falhou.
# Comportamento controlado por STUDY_METHOD_FIXTURE_RUNNER_EXIT (default 0).
#
# Escreve a saída no mesmo formato do template real (runner.sh.tmpl):
#   test output... | "---" | TESTS_RUN=.. ESPERADO=.. EXIT_BRUTO=.. VEREDITO=..
set -u

EXPECTED_EXIT="${STUDY_METHOD_FIXTURE_RUNNER_EXIT:-0}"
# sinaliza o floor declarado quando a skill não resolve (igual ao template real).
if [ -z "${STUDY_METHOD_SKILL_DIR:-}" ]; then
  echo "AVISO: STUDY_METHOD_SKILL_DIR não setado (fixture)" >&2
fi

echo "test1 ok"
echo "test2 ok"
echo "---"
echo "TESTS_RUN=2 ESPERADO=2 EXIT_BRUTO=$EXPECTED_EXIT DECORRIDO_MS=5 LINGUAGEM=fixture"
case "$EXPECTED_EXIT" in
  0)  echo "VEREDITO=passed";          exit 0 ;;
  1)  echo "VEREDITO=failed";          exit 1 ;;
  2)  echo "VEREDITO=count_mismatch";  exit 2 ;;
  3)  echo "VEREDITO=timeout";         exit 3 ;;
  66) echo "VEREDITO=infra";           exit 66 ;;
  *)  echo "VEREDITO=infra";           exit "$EXPECTED_EXIT" ;;
esac
