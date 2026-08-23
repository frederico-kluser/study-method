# shellcheck shell=bash
# lib/json.sh — STUB DE CONTRATO (COMMIT PREP onda 3).
# Contrato congelado em docs/00-contratos.md §7.2. NÃO altere assinaturas: preencha corpos.
# Valem LIB-1..LIB-6 (ver lib/common.sh).

sm_json_get() { :; }        # <arquivo> <filtro-jq> -> raw (jq -r)  | 0 · 1 ilegível · 5 não parseia
sm_json_get_raw() { :; }    # <arquivo> <filtro-jq> -> JSON (jq -c) | 0 · 1 · 5
sm_json_set() { :; }        # <arquivo> <filtro-jq que devolve o doc inteiro> -> grava via sm_atomic_write | 0 · 1 · 5
sm_json_ok() { :; }         # <arquivo> -> 0 parseia · 5 não parseia (jq -e . >/dev/null)
sm_json_validate() { :; }   # <arquivo> <schema> -> 0 · 5 (uma linha por erro em stderr: "<json-pointer>: <motivo>")
                            #   implementado pelo verificador mínimo em Python stdlib (§4.3) — não há jsonschema aqui
sm_json_canon() { :; }      # <arquivo|-> -> JSON canônico (jq -cS .) | 0 · 5. Base do request_id.
sm_request() { :; }         # <script> <kind> <response_schema> <instrucoes> <payload-json> -> envelope de PEDIDO (§6.1)
                            #   SEMPRE exit 10. Única função do projeto que produz 10. NÃO escreve em disco.
sm_apply_read() { :; }      # <arquivo> <kind> <request_id_esperado> -> .items em JSON compacto
                            #   0 · 2 ausente/ilegível · 5 protocol/kind/request_id divergente ou resposta inválida
sm_json_merge_ts() { :; }   # <arquivo> <campo> -> carimba com sm_now_iso em escrita atômica | 0 · 1
