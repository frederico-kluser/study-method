# 09-fechar-estado.sh — o estado derivado, reconstruido pelos donos de cada arquivo.
. "$(cd -- "$(dirname -- "$0")" && pwd -P)/00-env.sh"
export STUDY_METHOD_TODAY=2026-08-23
export STUDY_METHOD_NOW=2026-08-23T09:00:00-03:00

echo "== memory-index.sh --verify"
"$S/memory-index.sh" "$SETUP" --verify

echo "== progress-update.sh --due   (avaliacao preguicosa do decaimento T4)"
"$S/progress-update.sh" "$SETUP" --due

echo "== progress-update.sh --recompute"
"$S/progress-update.sh" "$SETUP" --recompute

echo "== memory-compact.sh --force  (fase PEDIDO)"
set +e; "$S/memory-compact.sh" "$SETUP" --force > "$WORK/mc-req.json" 2>"$WORK/mc-req.err"; MCRC=$?; set -e
echo "exit=$MCRC"; cat "$WORK/mc-req.err"
[ "$MCRC" = 10 ] || { echo "esperava exit 10 (needs_model_input)"; exit 1; }
python3 - "$WORK/mc-req.json" "$EX/perfil-resposta.json" "$WORK/mc-resp.json" <<'PY'
import json, sys
req = json.load(open(sys.argv[1], encoding="utf-8"))
body = json.load(open(sys.argv[2], encoding="utf-8"))
env = {"protocol": req["protocol"], "protocol_version": req["protocol_version"],
       "request_id": req["request_id"], "kind": req["kind"], "items": [body]}
json.dump(env, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
echo "== memory-compact.sh --apply  (fase APPLY)"
"$S/memory-compact.sh" "$SETUP" --force --apply "$WORK/mc-resp.json"

echo "== readme-sync.sh"
"$S/readme-sync.sh" "$SETUP"
echo "== readme-sync.sh (2a vez: prova de idempotencia)"
cp "$SETUP/README.md" "$WORK/readme-1.md"
"$S/readme-sync.sh" "$SETUP"
diff -q "$WORK/readme-1.md" "$SETUP/README.md" && echo "IDEMPOTENTE (byte a byte)"
