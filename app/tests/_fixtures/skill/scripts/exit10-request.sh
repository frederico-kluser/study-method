#!/usr/bin/env bash
# FIXTURE (teste) — imita o contrato de exit 10 genérico, sem depender de veredito.
#
#   exit10-request.sh            -> imprime o envelope de PEDIDO em stdout, sai 10.
#   exit10-request.sh --apply F  -> valida request_id/kind/protocol idênticos,
#                                    imprime {"applied":"ok"} e sai 0.
#   exit10-request.sh --apply F --bad -> força request_id divergente -> sai 5.
set -u

REQUEST_ID="aabbccddee00"
KIND="some_judgment"
RESPONSE_SCHEMA="urn:study-method:schema:generic-response:1"

APPLY_FILE=""
FORCE_BAD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY_FILE="$2"; shift 2 ;;
    --bad) FORCE_BAD=1; shift ;;
    *) shift ;;
  esac
done

if [ -n "$APPLY_FILE" ]; then
  if [ "$FORCE_BAD" -eq 1 ] || ! grep -q "\"request_id\" *: *\"$REQUEST_ID\"" "$APPLY_FILE"; then
    echo "exit10-request(fake): request_id divergente" >&2
    exit 5
  fi
  printf '{"applied":"ok"}\n'
  exit 0
fi

printf '%s\n' '{"protocol":"study-method/request-apply","protocol_version":"1.0","request_id":"aabbccddee00","script":"exit10-request.sh","kind":"some_judgment","setup_id":null,"generated_at":"2026-08-23T21:00:00-03:00","response_schema":"urn:study-method:schema:generic-response:1","instructions_pt_br":"Julgue.","payload":{"items":[]}}'
exit 10