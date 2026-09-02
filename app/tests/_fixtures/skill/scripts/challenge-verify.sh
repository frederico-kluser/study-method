#!/usr/bin/env bash
# FIXTURE (teste) — imita o protocolo REQUEST/APPLY de challenge-verify.sh.
#
# Comportamento:
#   - se STUDY_METHOD_FIXTURE_NO_EXIT10=1 -> imprime o resumo {verdict,...} e sai 0
#     (não pede julgamento).
#   - senão, sem --apply: imprime o envelope de PEDIDO em stdout e sai 10.
#   - com --apply: valida request_id/kind/protocol idênticos; imprime o resumo e sai 0.
#
# O request_id é uma constante do fixture; o juiz injetável deve ecoá-lo na RESPOSTA.
set -u

REQUEST_ID="f1e2d3c4b5a6"
KIND="classify_survivor"
RESPONSE_SCHEMA="urn:study-method:schema:challenge-verify-response:1"

VERDICT="${STUDY_METHOD_FIXTURE_VERDICT:-approved}"

if [ "${STUDY_METHOD_FIXTURE_NO_EXIT10:-0}" = "1" ]; then
  printf '{"verdict":"%s","mutation_score":0.9000,"killed":3,"survived":1,"rejections":[]}\n' "$VERDICT"
  exit 0
fi

APPLY_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY_FILE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -n "$APPLY_FILE" ]; then
  [ -r "$APPLY_FILE" ] || { echo "challenge-verify(fake): resposta ilegível" >&2; exit 2; }
  # validação estrutural leve (idêntica ao protocolo real em essência)
  if ! grep -q "\"request_id\" *: *\"$REQUEST_ID\"" "$APPLY_FILE"; then
    echo "challenge-verify(fake): request_id divergente" >&2
    exit 5
  fi
  if ! grep -q "\"kind\" *: *\"$KIND\"" "$APPLY_FILE"; then
    echo "challenge-verify(fake): kind divergente" >&2
    exit 5
  fi
  printf '{"verdict":"%s","mutation_score":0.9000,"killed":3,"survived":1,"rejections":[]}\n' "$VERDICT"
  exit 0
fi

# --- fase de PEDIDO: imprime o envelope e sai 10 ---
printf '%s\n' '{"protocol":"study-method/request-apply","protocol_version":"1.0","request_id":"f1e2d3c4b5a6","script":"challenge-verify.sh","kind":"classify_survivor","setup_id":null,"generated_at":"2026-08-23T21:00:00-03:00","response_schema":"urn:study-method:schema:challenge-verify-response:1","instructions_pt_br":"Classifique cada mutante sobrevivente como equivalent ou not_equivalent, com justification.","payload":{"items":[]}}'
exit 10
