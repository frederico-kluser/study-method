#!/usr/bin/env bash
# session-close.sh — passo `close_session` (docs/00-contratos.md §2, passo 9).
#
# Fecha a sessão e propaga para os derivados. É o único ponto em que `status` deixa
# de ser "in_progress" no fluxo normal.
#
# REQUEST/APPLY (docs/00-contratos.md §6): faltando campo obrigatório que só o modelo
# pode preencher, o script emite o PEDIDO `fill_session_fields` em stdout e sai 10,
# SEM tocar em disco. O modelo grava a RESPOSTA num arquivo e re-invoca com --apply.
#
# CAMINHO DEGRADADO (§6.4, RA-6): esgotados os 2 ciclos, fecha assim mesmo com
# `validation_errors[]` preenchido. NENHUMA sessão fica presa em "in_progress".
#
# Exit codes (docs/00-contratos.md §5.1): 0 · 1 · 2 · 3 · 5 · 10
set -euo pipefail

SM_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/json.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/json.sh"

SM_SK_ROOT="$(cd -- "$SM_SCRIPT_DIR/.." && pwd -P)"
SM_SCHEMA_DIR="$SM_SK_ROOT/assets/schemas"
SM_REQUEST_KIND="fill_session_fields"                       # §6.4
SM_RESPONSE_SCHEMA="urn:study-method:schema:session-close-response:1"
SM_RESPONSE_SCHEMA_FILE="$SM_SCHEMA_DIR/requests/session-close.response.schema.json"
SM_REQUEST_SCHEMA_FILE="$SM_SCHEMA_DIR/requests/session-close.request.schema.json"
SM_MAX_ATTEMPTS=2                                            # RA-6
SM_PAYLOAD_SCHEMA_VERSION="1.0"

sc_usage() {
  cat <<'EOF'
uso: session-close.sh <setup_root> [--session <NNNN>] [--recover <NNNN>] [--apply <resposta.json>]

Passo `close_session`: finaliza memory/NNNN.json (status "completed", finalized_at,
finalized_by), valida contra session.schema.json e encadeia os derivados. Imprime o
NNNN fechado em stdout.

argumentos
  <setup_root>            raiz do setup do aluno (ou um caminho dentro dele)
  --session <NNNN>        qual sessão fechar. Sem a flag: a do memory/.session.lock,
                          ou a maior NNNN com status "in_progress".
  --recover <NNNN>        fechamento retroativo de sessão órfã: status "abandoned",
                          finalized_by "auto_orphan_recovery", finalized_at = mtime do
                          arquivo. NUNCA pede nada ao modelo e nunca inventa conteúdo.
  --apply <resposta.json> aplica a RESPOSTA do modelo ao PEDIDO fill_session_fields.
  -h, --help              esta ajuda

protocolo REQUEST/APPLY (docs/00-contratos.md §6)
  faltando one_line_summary (ou topics em formato inválido), o script escreve o PEDIDO
  em stdout e sai 10 sem alterar disco. No máximo 2 ciclos; depois disso a sessão fecha
  com validation_errors[] preenchido.

exit codes
  0 ok (inclusive fechamento degradado) · 1 erro de execução · 2 uso incorreto
  3 setup não encontrado · 5 validação de schema falhou · 10 needs_model_input
EOF
}

# --------------------------------------------------------------------------- args
sc_hint=""
sc_session=""
sc_recover=""
sc_apply=""
while (($#)); do
  case "$1" in
    -h|--help)   sc_usage; exit 0 ;;
    --session)   [[ $# -ge 2 ]] || sm_die 2 "--session exige um valor."; sc_session="$2"; shift 2 ;;
    --session=*) sc_session="${1#--session=}"; shift ;;
    --recover)   [[ $# -ge 2 ]] || sm_die 2 "--recover exige um valor."; sc_recover="$2"; shift 2 ;;
    --recover=*) sc_recover="${1#--recover=}"; shift ;;
    --apply)     [[ $# -ge 2 ]] || sm_die 2 "--apply exige um caminho."; sc_apply="$2"; shift 2 ;;
    --apply=*)   sc_apply="${1#--apply=}"; shift ;;
    --)          shift; break ;;
    -*)          sm_die 2 "flag desconhecida: $1 (veja --help)." ;;
    *)           if [[ -z "$sc_hint" ]]; then sc_hint="$1"; shift
                 else sm_die 2 "argumento posicional extra: $1"; fi ;;
  esac
done
[[ $# -eq 0 ]] || sm_die 2 "argumento posicional extra: $1"
[[ -z "$sc_recover" || -z "$sc_apply" ]] || sm_die 2 "--recover e --apply são mutuamente exclusivos."
[[ -z "$sc_session" || "$sc_session" =~ ^[0-9]{4}$ ]] || sm_die 2 "--session precisa ser NNNN: '$sc_session'."
[[ -z "$sc_recover" || "$sc_recover" =~ ^[0-9]{4}$ ]] || sm_die 2 "--recover precisa ser NNNN: '$sc_recover'."

sm_require_cmd jq || sm_die 1 "jq é obrigatório para session-close.sh."

if ! SM_SETUP_ROOT="$(sm_setup_root "$sc_hint")"; then
  sm_die 3 "nenhum setup.json legível em '${sc_hint:-$PWD}' nem em nenhum ancestral até \$HOME."
fi
SM_MEMORY_DIR="$SM_SETUP_ROOT/memory"
SM_LOCK_FILE="$SM_MEMORY_DIR/.session.lock"
[[ -d "$SM_MEMORY_DIR" ]] || sm_die 1 "não há memory/ em '$SM_SETUP_ROOT': não existe sessão para fechar."

# ------------------------------------------------------------ qual sessão fechar
sc_pick_session() {
  local sid=""
  if [[ -n "$sc_recover" ]]; then printf '%s' "$sc_recover"; return 0; fi
  if [[ -n "$sc_session" ]]; then printf '%s' "$sc_session"; return 0; fi
  if [[ -f "$SM_LOCK_FILE" ]] && sm_json_ok "$SM_LOCK_FILE"; then
    sid="$(sm_json_get "$SM_LOCK_FILE" '.session_id // empty' || printf '')"
    if [[ "$sid" =~ ^[0-9]{4}$ && -f "$SM_MEMORY_DIR/$sid.json" ]]; then printf '%s' "$sid"; return 0; fi
  fi
  local f st
  local -a files=()
  while IFS= read -r -d '' f; do files+=("$f"); done \
    < <(find "$SM_MEMORY_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9].json' -print0 2>/dev/null | sort -zr)
  for f in "${files[@]}"; do
    sm_json_ok "$f" || continue
    st="$(sm_json_get "$f" '.status // empty' || printf '')"
    if [[ "$st" == "in_progress" ]]; then
      sid="$(basename -- "$f" .json)"; printf '%s' "$sid"; return 0
    fi
  done
  return 1
}

if ! SC_SID="$(sc_pick_session)" || [[ -z "$SC_SID" ]]; then
  sm_die 2 "nenhuma sessão in_progress em memory/. Informe --session <NNNN> se quiser fechar uma específica."
fi
SC_FILE="$SM_MEMORY_DIR/$SC_SID.json"
[[ -f "$SC_FILE" ]] || sm_die 2 "sessão $SC_SID não existe ($(sm_relpath "$SC_FILE" "$SM_SETUP_ROOT"))."
sm_json_ok "$SC_FILE" || sm_die 5 "memory/$SC_SID.json não parseia como JSON; quarentena é assunto de memory-index.sh."

SC_SETUP_ID="$(sm_json_get "$SM_SETUP_ROOT/setup.json" '.setup_id // empty' 2>/dev/null || printf '')"

# =============================================================== campos pendentes
# Vocabulário fechado de missing_fields[].field vem de
# requests/session-close.request.schema.json. Bloqueante = o que torna o arquivo
# inválido contra session.schema.json e só o modelo pode escrever.
sc_missing() {   # stdin: documento da sessão -> stdout: array JSON de missing_fields
  jq -c '
    . as $s
    | def cut($v): if ($v|type) == "string" then $v[0:400] else ($v|tojson)[0:400] end;
    def softstr($k):
        ($s[$k]) as $v
        | if $v == null then {field:$k, problem:"missing", detail:"não foi registrado até o fechamento.", current_value:null}
          elif ($v|type) != "string" then {field:$k, problem:"invalid_format", detail:"o valor não é uma string.", current_value:cut($v)}
          elif ($v|test("^[[:space:]]*$")) then {field:$k, problem:"empty", detail:"foi registrado vazio.", current_value:null}
          else empty end;
    def softarr($k):
        ($s[$k]) as $v
        | if $v == null then {field:$k, problem:"missing", detail:"não foi registrado até o fechamento.", current_value:null}
          elif ($v|type) != "array" then {field:$k, problem:"invalid_format", detail:"o valor não é uma lista.", current_value:cut($v)}
          elif ($v|length) == 0 then {field:$k, problem:"empty", detail:"lista vazia no fechamento.", current_value:null}
          else empty end;
    [
      ( ($s.one_line_summary) as $v
        | if $v == null then {field:"one_line_summary", problem:"missing", detail:"a chave não existe; é obrigatória em session.schema.json.", current_value:null}
          elif ($v|type) != "string" then {field:"one_line_summary", problem:"invalid_format", detail:"o valor não é uma string.", current_value:cut($v)}
          elif ($v|test("^[[:space:]]*$")) then {field:"one_line_summary", problem:"empty", detail:"resumo vazio.", current_value:null}
          elif ($v == "Sessão iniciada, ainda sem resumo.") or ($v|startswith("Sessão em andamento:"))
            then {field:"one_line_summary", problem:"empty", detail:"o resumo ainda é o provisório da abertura; o fechamento tem de reescrevê-lo.", current_value:cut($v)}
          elif ($v|length) > 160 then {field:"one_line_summary", problem:"too_long", detail:"passou de 160 caracteres.", current_value:cut($v)}
          else empty end ),
      ( ($s.topics) as $v
        | if ($v|type) == "array" and (($v|length) > 0) and (($v|map(select((type != "string") or (test("^[a-z][a-z0-9_]{1,62}$")|not)))|length) > 0)
            then {field:"topics", problem:"invalid_format", detail:"há tag fora de ^[a-z][a-z0-9_]{1,62}$ (snake_case ASCII sem acento).", current_value:cut($v)}
          else softarr("topics") end ),
      softstr("what_was_done"),
      softarr("what_was_learned"),
      softstr("what_worked"),
      softstr("what_didnt_work"),
      softarr("open_questions"),
      softarr("next_steps")
    ]'
}

# Bloqueante: one_line_summary (obrigatório no schema) e topics em formato inválido.
sc_blocking() {  # stdin: array de missing_fields -> stdout: array bloqueante
  jq -c '[ .[] | select(.field == "one_line_summary" or (.field == "topics" and .problem == "invalid_format")) ]'
}

# ================================================================ o PEDIDO (§6.1)
sc_mtime_iso() { date -d "@$(stat -c %Y -- "$1")" +%Y-%m-%dT%H:%M:%S%:z; }

# `generated_at` do payload é o carimbo do ESTADO que originou o pedido (mtime do
# memory/NNNN.json), não "agora": RA-2 exige que --apply recalcule o mesmo request_id
# a partir do disco, e qualquer alteração no arquivo tem de invalidá-lo.
sc_payload() {   # $1 = attempt, $2 = documento da sessão, $3 = missing_fields JSON
  local attempt="$1" doc="$2" missing="$3"
  printf '%s' "$doc" | jq -c \
    --arg ver "$SM_PAYLOAD_SCHEMA_VERSION" \
    --arg gen "$(sc_mtime_iso "$SC_FILE")" \
    --arg sid "$SC_SID" \
    --arg setup_id "$SC_SETUP_ID" \
    --arg path "memory/$SC_SID.json" \
    --arg resp "${TMPDIR:-/tmp}/study-method-session-close-$SC_SID.json" \
    --argjson attempt "$attempt" \
    --argjson maxatt "$SM_MAX_ATTEMPTS" \
    --argjson missing "$missing" \
    '{
       schema_version: $ver,
       request_kind: "session_close",
       generated_at: $gen,
       setup_id: (if $setup_id == "" then null else $setup_id end),
       session_id: $sid,
       session_path: $path,
       response_path: $resp,
       attempt: $attempt,
       max_attempts: $maxatt,
       missing_fields: $missing,
       context: {
         date: .date,
         status: .status,
         topics: (.topics // []),
         goal: .goal,
         plan_items: [ (.plan.items // [])[] | .text ],
         artifact_paths: [ (.artifacts // [])[] | .path ]
       }
     }'
}

sc_request_id() { local canon
  # ATENÇÃO: tem de reproduzir BYTE A BYTE o que `sm_request` (lib/json.sh) faz, e ela
  # captura o canônico em `$(...)` — o que COME a quebra de linha final antes do sha256.
  # Sem o mesmo corte, o hash difere de um único byte e o --apply nunca reconhece o
  # próprio PEDIDO: exit 5 em 100% das respostas.
  canon="$(printf '%s' "$1" | sm_json_canon -)" || return 5
  printf '%s' "$canon" | sha256sum | cut -c1-12
}

sc_emit_request() {   # $1 = payload JSON — sai 10, sem tocar em disco (RA-1)
  local payload="$1"
  if ! sm_json_validate <(printf '%s\n' "$payload") "$SM_REQUEST_SCHEMA_FILE"; then
    sm_die 5 "o PEDIDO montado não valida contra session-close.request.schema.json (bug do script)."
  fi
  sm_request "session-close.sh" "$SM_REQUEST_KIND" "$SM_RESPONSE_SCHEMA" \
    "Preencha SÓ os campos listados em missing_fields, em pt-BR, com o que a sessão sustenta. Não invente o que não aconteceu: campo sem base vai para unfilled[] com o motivo." \
    "$payload" || exit "$?"
  exit 10
}

# =========================================================== escrita do fechamento
sc_chain_one() {   # $1 = script, resto = argumentos. Elo que falha avisa e não aborta.
  local script="$1"; shift
  local path="$SM_SCRIPT_DIR/$script" rc=0
  if [[ ! -f "$path" ]]; then
    sm_log warn "derivado não encadeado: $script ainda não existe em scripts/."
    return 0
  fi
  bash -- "$path" "$@" >/dev/null 2>&1 || rc=$?
  if ((rc == 10)); then
    sm_log warn "$script pediu julgamento do modelo (exit 10); rode-o à parte e responda com --apply."
  elif ((rc != 0)); then
    sm_log warn "$script falhou (exit $rc); o derivado é reconstruível, a sessão já está fechada."
  fi
  return 0
}

sc_update_setup_json() {   # updated_at, last_session_at, session_count (docs/01 §3 passo 9)
  local manifest="$SM_SETUP_ROOT/setup.json" count
  [[ -f "$manifest" ]] || return 0
  sm_json_ok "$manifest" || { sm_log warn "setup.json não parseia; não atualizei o manifesto."; return 0; }
  count="$(find "$SM_MEMORY_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9].json' -printf x 2>/dev/null | wc -c)"
  sm_json_set "$manifest" \
    ".updated_at = \"$(sm_now_iso)\" | .last_session_at = \"$SC_FINALIZED_AT\" | .session_count = ${count:-0}" \
    || sm_log warn "não consegui atualizar setup.json (updated_at/last_session_at/session_count)."
  return 0
}

sc_update_registry() {     # cache de descoberta; nunca origem da verdade
  local reg count
  [[ -n "$SC_SETUP_ID" ]] || return 0
  reg="$(sm_registry_path)" || return 0
  [[ -f "$reg" ]] || return 0
  sm_json_ok "$reg" || { sm_log warn "registry.json não parseia; não o atualizei."; return 0; }
  if ! sm_registry_lock; then
    sm_log warn "registry ocupado; a entrada deste setup será atualizada na próxima descoberta."
    return 0
  fi
  count="$(find "$SM_MEMORY_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9].json' -printf x 2>/dev/null | wc -c)"
  sm_json_set "$reg" \
    "(.setups[]? | select(.setup_id == \"$SC_SETUP_ID\")) |= (
        .last_seen_at = \"$(sm_now_iso)\"
      | .checked_at = \"$(sm_now_iso)\"
      | .last_session_at = \"$SC_FINALIZED_AT\"
      | .session_count = ${count:-0}
     ) | .updated_at = \"$(sm_now_iso)\"" \
    || sm_log warn "não consegui atualizar a entrada do registry."
  sm_registry_unlock || true
  return 0
}

sc_unlock_if_mine() {
  local sid=""
  [[ -f "$SM_LOCK_FILE" ]] || return 0
  if sm_json_ok "$SM_LOCK_FILE"; then
    sid="$(sm_json_get "$SM_LOCK_FILE" '.session_id // empty' || printf '')"
  fi
  if [[ -z "$sid" || "$sid" == "$SC_SID" ]]; then
    sm_setup_unlock "$SM_SETUP_ROOT" || sm_log warn "não consegui remover memory/.session.lock."
  else
    sm_log warn "memory/.session.lock pertence à sessão $sid; não o removi."
  fi
  return 0
}

sc_finalize() {   # $1 doc, $2 status, $3 finalized_by, $4 finalized_at, $5 validation_errors JSON
  local doc="$1" status="$2" by="$3" at="$4" errors="$5" out
  SC_FINALIZED_AT="$at"

  out="$(printf '%s' "$doc" | jq -c \
        --arg status "$status" --arg by "$by" --arg at "$at" --argjson errors "$errors" \
        --arg fallback "Sessão fechada sem resumo do modelo." \
        --arg orphan "Sessão interrompida sem fechamento (recuperada automaticamente)." \
        '.status = $status
         | .finalized_at = $at
         | .finalized_by = $by
         | .validation_errors = $errors
         | (if (.one_line_summary | type) != "string" or (.one_line_summary | test("^[[:space:]]*$"))
              then .one_line_summary = (if $status == "abandoned" then $orphan else $fallback end)
              else . end)
         | (if $status == "abandoned"
              and ((.one_line_summary == "Sessão iniciada, ainda sem resumo.") or (.one_line_summary | startswith("Sessão em andamento:")))
              then .one_line_summary = $orphan else . end)
         | .one_line_summary = (.one_line_summary[0:160])')" \
    || sm_die 1 "não consegui montar o documento final da sessão $SC_SID."

  if ! printf '%s\n' "$out" | sm_atomic_write "$SC_FILE"; then
    # Único erro que o tutor deve declarar como PERDA REAL ao aluno (docs/01 §3 passo 9).
    sm_die 1 "FALHA AO GRAVAR a sessão em '$SC_FILE'. O conteúdo desta aula não foi persistido."
  fi

  if ! sm_json_validate "$SC_FILE" "$SM_SCHEMA_DIR/session.schema.json"; then
    # A sessão já está fechada: nunca fica presa em in_progress por causa de validação.
    sm_log warn "memory/$SC_SID.json fechou mas não valida contra session.schema.json; os erros ficaram em validation_errors[]."
  fi

  sc_unlock_if_mine
  sc_update_setup_json
  sc_update_registry

  sc_chain_one memory-index.sh   "$SM_SETUP_ROOT"
  sc_chain_one progress-update.sh "$SM_SETUP_ROOT"
  sc_chain_one readme-sync.sh    "$SM_SETUP_ROOT"
  sc_chain_one memory-compact.sh "$SM_SETUP_ROOT" --if-due

  sm_log info "sessão $SC_SID fechada com status $status."
  printf '%s\n' "$SC_SID"
  exit 0
}

# ============================================================ --recover (órfã)
if [[ -n "$sc_recover" ]]; then
  sc_doc="$(cat -- "$SC_FILE")"
  sc_status_now="$(printf '%s' "$sc_doc" | jq -r '.status // ""')"
  [[ "$sc_status_now" == "in_progress" ]] || sm_die 2 "a sessão $SC_SID não está in_progress (status: ${sc_status_now:-ausente}); não há órfã para recuperar."
  # docs/01 §4.1: nada é inventado. Sem PEDIDO, sem modelo, conteúdo preservado.
  sc_finalize "$sc_doc" "abandoned" "auto_orphan_recovery" "$(sc_mtime_iso "$SC_FILE")" '[]'
fi

# ============================================================ fluxo normal / apply
SC_DOC="$(cat -- "$SC_FILE")"
SC_STATUS_NOW="$(printf '%s' "$SC_DOC" | jq -r '.status // ""')"
if [[ "$SC_STATUS_NOW" != "in_progress" && -z "$sc_apply" ]]; then
  sm_die 2 "a sessão $SC_SID já está '$SC_STATUS_NOW'; um NNNN.json finalizado nunca é reescrito (docs/03-memoria.md §2)."
fi

SC_MISSING="$(printf '%s' "$SC_DOC" | sc_missing)"
SC_BLOCKING="$(printf '%s' "$SC_MISSING" | sc_blocking)"

# --------------------------------------------------------------------- sem --apply
if [[ -z "$sc_apply" ]]; then
  if [[ "$(printf '%s' "$SC_BLOCKING" | jq 'length')" -gt 0 ]]; then
    sc_emit_request "$(sc_payload 1 "$SC_DOC" "$SC_MISSING")"
  fi
  sc_finalize "$SC_DOC" "completed" "student" "$(sm_now_iso)" '[]'
fi

# ------------------------------------------------------------------------ --apply
[[ -r "$sc_apply" ]] || sm_die 2 "não consigo ler o arquivo de resposta '$sc_apply'."
sm_json_ok "$sc_apply" || sm_die 5 "a RESPOSTA '$sc_apply' não parseia como JSON."

SC_PAYLOAD_1="$(sc_payload 1 "$SC_DOC" "$SC_MISSING")"
SC_PAYLOAD_2="$(sc_payload 2 "$SC_DOC" "$SC_MISSING")"
SC_RID_1="$(sc_request_id "$SC_PAYLOAD_1")"
SC_RID_2="$(sc_request_id "$SC_PAYLOAD_2")"

SC_RESP_PROTOCOL="$(sm_json_get "$sc_apply" '.protocol // ""')"
SC_RESP_VERSION="$(sm_json_get "$sc_apply" '.protocol_version // ""')"
SC_RESP_KIND="$(sm_json_get "$sc_apply" '.kind // ""')"
SC_RESP_RID="$(sm_json_get "$sc_apply" '.request_id // ""')"

[[ "$SC_RESP_PROTOCOL" == "study-method/request-apply" ]] \
  || sm_die 5 "protocol divergente na RESPOSTA: '$SC_RESP_PROTOCOL' (esperado study-method/request-apply)."
[[ "${SC_RESP_VERSION%%.*}" == "1" ]] \
  || sm_die 5 "protocol_version divergente na RESPOSTA: '$SC_RESP_VERSION' (esperado MAJOR 1)."
[[ "$SC_RESP_KIND" == "$SM_REQUEST_KIND" ]] \
  || sm_die 5 "kind divergente na RESPOSTA: '$SC_RESP_KIND' (esperado $SM_REQUEST_KIND)."

# RA-2: o request_id amarra a RESPOSTA ao estado em disco. O attempt vem de qual dos
# dois pedidos possíveis ela responde — sem estado extra em disco na fase de PEDIDO.
if [[ "$SC_RESP_RID" == "$SC_RID_1" ]]; then
  SC_ATTEMPT=1
elif [[ "$SC_RESP_RID" == "$SC_RID_2" ]]; then
  SC_ATTEMPT=2
else
  sm_die 5 "request_id divergente: a RESPOSTA traz '$SC_RESP_RID' e o estado atual de memory/$SC_SID.json produz '$SC_RID_1'. O arquivo mudou entre o PEDIDO e o --apply; nada foi aplicado."
fi

SC_ITEMS="$(sm_apply_read "$sc_apply" "$SM_REQUEST_KIND" "$SC_RESP_RID")" \
  || sm_die "$?" "sm_apply_read recusou a RESPOSTA '$sc_apply'."

# §6.2: o envelope carrega `items`. A RESPOSTA desta fronteira é UM objeto conforme
# session-close.response.schema.json — aceito tanto como items[0] quanto como items.
SC_RESP="$(printf '%s' "$SC_ITEMS" | jq -c 'if type == "array" then (.[0] // {}) else . end')"
sm_json_validate <(printf '%s\n' "$SC_RESP") "$SM_RESPONSE_SCHEMA_FILE" \
  || sm_die 5 "a RESPOSTA não valida contra session-close.response.schema.json; nada foi aplicado (RA-3)."

[[ "$(printf '%s' "$SC_RESP" | jq -r '.request_kind // ""')" == "session_close" ]] \
  || sm_die 5 "request_kind divergente dentro da RESPOSTA."
[[ "$(printf '%s' "$SC_RESP" | jq -r '.session_id // ""')" == "$SC_SID" ]] \
  || sm_die 5 "session_id divergente na RESPOSTA: o fechamento não é aplicado em outra sessão."

# RA-5: chave em `values` que não estava em missing_fields faz o script recusar tudo.
SC_EXTRA="$(printf '%s' "$SC_RESP" | jq -r --argjson missing "$SC_MISSING" \
  '[(.values // {} | keys_unsorted[]) as $k | select([$missing[].field] | index($k) | not) | $k] | join(", ")')"
[[ -z "$SC_EXTRA" ]] \
  || sm_die 5 "a RESPOSTA traz campos que não foram pedidos: $SC_EXTRA. O fechamento não reescreve o que a sessão já registrou."

# ---- aplica os valores em memória; só grava se for para fechar de fato (RA-1/RA-4)
SC_MERGED="$(printf '%s' "$SC_DOC" | jq -c --argjson values "$(printf '%s' "$SC_RESP" | jq -c '.values // {}')" \
  'reduce ($values | to_entries[]) as $e (.; .[$e.key] = $e.value)')" \
  || sm_die 5 "não consegui aplicar os valores da RESPOSTA ao documento da sessão."

SC_MISSING_AFTER="$(printf '%s' "$SC_MERGED" | sc_missing)"
SC_BLOCKING_AFTER="$(printf '%s' "$SC_MISSING_AFTER" | sc_blocking)"
SC_UNFILLED="$(printf '%s' "$SC_RESP" | jq -c '.unfilled // []')"

if [[ "$(printf '%s' "$SC_BLOCKING_AFTER" | jq 'length')" -eq 0 ]]; then
  SC_ERRORS="$(printf '%s' "$SC_UNFILLED" | jq -c '[ .[] | "\(.field): \(.reason)" ]')"
  sc_finalize "$SC_MERGED" "completed" "student" "$(sm_now_iso)" "$SC_ERRORS"
fi

# Ainda falta campo bloqueante. Um segundo (e último) ciclo só se o modelo não o
# declarou como impossível — declarar é resposta legítima e encerra a negociação.
SC_DECLARED="$(printf '%s' "$SC_BLOCKING_AFTER" | jq -r --argjson unf "$SC_UNFILLED" \
  '([$unf[].field]) as $declared
   | [ .[] | .field as $f | select(($declared | index($f)) | not) ] | length')"

if ((SC_ATTEMPT < SM_MAX_ATTEMPTS)) && ((SC_DECLARED > 0)); then
  # Nada foi gravado até aqui: o disco continua exatamente como estava (RA-1).
  sc_emit_request "$(sc_payload 2 "$SC_DOC" "$SC_MISSING")"
fi

# ------------------------------------------------- caminho degradado (§6.4, RA-6)
SC_ERRORS="$(jq -cn --argjson miss "$SC_MISSING_AFTER" --argjson unf "$SC_UNFILLED" \
  '[ $unf[] | "\(.field): \(.reason)" ] + [ $miss[] | "\(.field): \(.problem)" ] | unique')"
sm_log warn "ciclos de PEDIDO esgotados; fechando a sessão $SC_SID assim mesmo, com validation_errors[] preenchido."
sc_finalize "$SC_MERGED" "completed" "student" "$(sm_now_iso)" "$SC_ERRORS"
