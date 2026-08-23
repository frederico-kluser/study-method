#!/usr/bin/env python3
"""Monta a RESPOSTA do protocolo REQUEST/APPLY de session-close.sh.

Uso: lib-close.py <pedido.json> <valores.json> > <resposta.json>

Os VALORES vem de um arquivo escrito pelo tutor (o modelo). Só os campos que o
PEDIDO listou em missing_fields entram na resposta — o schema recusa chave extra.
"""
import json
import sys

req = json.load(open(sys.argv[1], encoding="utf-8"))
vals = json.load(open(sys.argv[2], encoding="utf-8"))
payload = req.get("payload") or {}
missing = [m["field"] for m in payload.get("missing_fields", [])]
body = {
    "schema_version": "1.0",
    "request_kind": payload.get("request_kind", "session_close"),
    "session_id": payload["session_id"],
    "values": {k: v for k, v in vals.items() if k in missing},
}
extra = sorted(set(vals) - set(missing))
if extra:
    sys.stderr.write("campos do tutor que o pedido NAO pediu (descartados): %s\n" % ", ".join(extra))
faltou = sorted(set(missing) - set(vals))
if faltou:
    sys.stderr.write("campos pedidos que o tutor NAO preencheu: %s\n" % ", ".join(faltou))
env = {
    "protocol": req.get("protocol", "study-method/request-apply"),
    "protocol_version": req.get("protocol_version", "1.0"),
    "request_id": req.get("request_id"),
    "kind": req.get("kind"),
    "items": [body],
}
json.dump(env, sys.stdout, ensure_ascii=False, indent=2)
sys.stdout.write("\n")
