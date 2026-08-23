# shellcheck shell=bash
# lib/json.sh — camada JSON do study-method.
# Contrato congelado em docs/00-contratos.md §7.2. NÃO altere assinaturas.
# Valem LIB-1..LIB-6 (ver lib/common.sh). Depende de lib/common.sh já estar `source`d
# (usa sm_log, sm_atomic_write, sm_now_iso, sm_die e SM_LIB_DIR).

# Verificador mínimo de JSON Schema em Python stdlib (§4.3). Prefixo `_` para não colidir
# com os scripts do §8 — não é um dos 19, é auxiliar de lib/json.sh.
SM_JSON_SCHEMA_CHECKER="${SM_JSON_SCHEMA_CHECKER:-${SM_LIB_DIR:-.}/_jsonschema_min.py}"

# Constantes do protocolo REQUEST/APPLY (§6).
SM_PROTOCOL='study-method/request-apply'
SM_PROTOCOL_VERSION='1.0'

# Onde vivem os quatro `*.response.schema.json` (§3.1). É por aqui que `sm_apply_read`
# cumpre RA-3 sem depender do envelope do PEDIDO, que ele não vê: o `kind` do envelope e o
# `response_schema` são 1:1 e de vocabulário FECHADO (§6.5), então o kind resolve o schema.
# Derivado de SM_LIB_DIR (que já segue o local real da instalação): NÃO é variável de
# ambiente, e por isso não entra no vocabulário fechado de §4.4.
SM_RESPONSE_SCHEMA_DIR="${SM_LIB_DIR:-.}/../../assets/schemas/requests"

# sm_json_get <arquivo> <filtro-jq> -> resultado raw (jq -r). 0 · 1 ilegível · 5 não parseia.
sm_json_get() {
    local file="${1:-}" filter="${2:-.}" out
    [ -n "$file" ] || { sm_log error "sm_json_get: arquivo nao informado"; return 1; }
    [ -r "$file" ] || { sm_log error "sm_json_get: arquivo ilegivel: $file"; return 1; }
    if ! out="$(jq -r "$filter" < "$file" 2>&1)"; then
        sm_log error "sm_json_get: $file: $out"
        return 5
    fi
    printf '%s\n' "$out"
    return 0
}

# sm_json_get_raw <arquivo> <filtro-jq> -> resultado como JSON (jq -c). 0 · 1 · 5.
sm_json_get_raw() {
    local file="${1:-}" filter="${2:-.}" out
    [ -n "$file" ] || { sm_log error "sm_json_get_raw: arquivo nao informado"; return 1; }
    [ -r "$file" ] || { sm_log error "sm_json_get_raw: arquivo ilegivel: $file"; return 1; }
    if ! out="$(jq -c "$filter" < "$file" 2>&1)"; then
        sm_log error "sm_json_get_raw: $file: $out"
        return 5
    fi
    printf '%s\n' "$out"
    return 0
}

# sm_json_set <arquivo> <filtro-jq que devolve o doc inteiro>
# Aplica o filtro e grava por sm_atomic_write. 0 · 1 I/O · 5 resultado não parseia.
sm_json_set() {
    local file="${1:-}" filter="${2:-.}" out
    [ -n "$file" ] || { sm_log error "sm_json_set: arquivo nao informado"; return 1; }
    [ -r "$file" ] || { sm_log error "sm_json_set: arquivo ilegivel: $file"; return 1; }
    if ! out="$(jq "$filter" < "$file" 2>&1)"; then
        sm_log error "sm_json_set: $file: $out"
        return 5
    fi
    if ! printf '%s' "$out" | jq -e . >/dev/null 2>&1; then
        sm_log error "sm_json_set: o filtro nao produziu JSON valido para $file"
        return 5
    fi
    printf '%s\n' "$out" | sm_atomic_write "$file" || return 1
    return 0
}

# sm_json_ok <arquivo> -> 0 parseia · 5 não parseia (inclui ausente/ilegível).
sm_json_ok() {
    local file="${1:-}"
    [ -n "$file" ] && [ -r "$file" ] || return 5
    jq -e . < "$file" >/dev/null 2>&1 || return 5
    return 0
}

# sm_json_validate <arquivo> <schema> -> 0 válido · 5 inválido.
# Uma linha por erro em stderr, no formato "<json-pointer>: <motivo>".
# Implementado pelo verificador mínimo em Python stdlib (§4.3): não há jsonschema aqui.
sm_json_validate() {
    local file="${1:-}" schema="${2:-}" rc
    if [ -z "$file" ] || [ -z "$schema" ]; then
        sm_log error "sm_json_validate: uso: sm_json_validate <arquivo> <schema>"
        return 5
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        sm_require_cmd python3 || true
        sm_log error "sm_json_validate: sem python3, nao ha como validar $file"
        return 5
    fi
    if [ ! -r "$SM_JSON_SCHEMA_CHECKER" ]; then
        sm_log error "sm_json_validate: verificador ausente: $SM_JSON_SCHEMA_CHECKER"
        return 5
    fi
    python3 "$SM_JSON_SCHEMA_CHECKER" "$file" "$schema"
    rc=$?
    [ "$rc" -eq 0 ] || return 5
    return 0
}

# sm_json_canon <arquivo|-> -> JSON canônico (jq -cS .). 0 · 5. Base do request_id.
sm_json_canon() {
    local src="${1:--}" out
    if [ "$src" = "-" ]; then
        if ! out="$(jq -cS . 2>&1)"; then
            sm_log error "sm_json_canon: entrada padrao nao e JSON valido: $out"
            return 5
        fi
    else
        if [ ! -r "$src" ]; then
            sm_log error "sm_json_canon: arquivo ilegivel: $src"
            return 5
        fi
        if ! out="$(jq -cS . < "$src" 2>&1)"; then
            sm_log error "sm_json_canon: $src: $out"
            return 5
        fi
    fi
    printf '%s\n' "$out"
    return 0
}

# sm_request <script> <kind> <response_schema> <instrucoes> <payload-json>
# Emite o envelope de PEDIDO do §6.1 em stdout e SEMPRE sai com exit 10.
# Única função de todo o projeto que produz exit 10 (I-23). NÃO escreve nada em disco (RA-1).
# request_id = 12 primeiros hex do sha256 do payload canonicalizado por sm_json_canon.
# setup_id vem de $SM_SETUP_ID (null quando não definido).
sm_request() {
    local script="${1:-}" kind="${2:-}" rschema="${3:-}" instr="${4:-}" payload="${5:-}"
    local canon rid
    if [ -z "$script" ] || [ -z "$kind" ] || [ -z "$rschema" ] || [ -z "$payload" ]; then
        sm_die 1 "sm_request: uso: sm_request <script> <kind> <response_schema> <instrucoes> <payload-json>"
    fi
    canon="$(printf '%s' "$payload" | sm_json_canon -)" \
        || sm_die 1 "sm_request: payload nao e JSON valido"
    rid="$(printf '%s' "$canon" | sha256sum | cut -c1-12)" \
        || sm_die 1 "sm_request: falha ao calcular o request_id"
    jq -n \
        --arg protocol "$SM_PROTOCOL" \
        --arg protocol_version "$SM_PROTOCOL_VERSION" \
        --arg request_id "$rid" \
        --arg script "$script" \
        --arg kind "$kind" \
        --arg setup_id "${SM_SETUP_ID:-}" \
        --arg generated_at "$(sm_now_iso)" \
        --arg response_schema "$rschema" \
        --arg instructions "$instr" \
        --argjson payload "$canon" \
        '{protocol:$protocol, protocol_version:$protocol_version, request_id:$request_id,
          script:$script, kind:$kind,
          setup_id:(if $setup_id == "" then null else $setup_id end),
          generated_at:$generated_at, response_schema:$response_schema,
          instructions_pt_br:$instructions, payload:$payload}' \
        || sm_die 1 "sm_request: falha ao montar o envelope de pedido"
    exit 10
}

# sm_apply_read <arquivo> <kind> <request_id_esperado> -> .items em JSON compacto.
# 0 · 2 ausente/ilegível · 5 protocol/protocol_version/kind/request_id divergente,
# resposta malformada, ou a RESPOSTA não valida contra o `response_schema` (RA-3).
# Valida o envelope ANTES de devolver qualquer item (RA-2).
#
# ⭐ A validação de schema mora AQUI, e não só em cada consumidor (§7.2). O `response_schema`
# viaja no envelope do PEDIDO, que esta função não vê — mas não precisa ver: `kind` e
# `response_schema` são 1:1 num vocabulário FECHADO de quatro valores (§6.5), então o kind
# do envelope da RESPOSTA resolve o schema sozinho. Kind fora do vocabulário: avisa em
# stderr e devolve os items sem validar — é o único caso em que a promessa não é cumprida.
#
# Forma dos items (§6.2): RESP-1 `items: [<objeto>]` é a canônica; RESP-2 aceita `items`
# como o objeto direto (devolvido aqui embrulhado em array, para o stdout ser sempre um
# array); RESP-3 mais de um elemento é 5 — não existe pedido com múltiplas respostas.
sm_apply_read() {
    local file="${1:-}" kind="${2:-}" want="${3:-}" got items
    local itype icount body schema
    if [ -z "$file" ] || [ -z "$kind" ] || [ -z "$want" ]; then
        sm_log error "sm_apply_read: uso: sm_apply_read <arquivo> <kind> <request_id_esperado>"
        return 2
    fi
    if [ ! -r "$file" ]; then
        sm_log error "sm_apply_read: resposta ausente ou ilegivel: $file"
        return 2
    fi
    if ! jq -e . < "$file" >/dev/null 2>&1; then
        sm_log error "sm_apply_read: resposta nao e JSON valido: $file"
        return 5
    fi
    got="$(jq -r '.protocol // ""' < "$file")"
    if [ "$got" != "$SM_PROTOCOL" ]; then
        sm_log error "sm_apply_read: protocol divergente: esperado $SM_PROTOCOL, recebido ${got:-<ausente>}"
        return 5
    fi
    got="$(jq -r '.protocol_version // ""' < "$file")"
    if [ "$got" != "$SM_PROTOCOL_VERSION" ]; then
        sm_log error "sm_apply_read: protocol_version divergente: esperado $SM_PROTOCOL_VERSION, recebido ${got:-<ausente>}"
        return 5
    fi
    got="$(jq -r '.kind // ""' < "$file")"
    if [ "$got" != "$kind" ]; then
        sm_log error "sm_apply_read: kind divergente: esperado $kind, recebido ${got:-<ausente>}"
        return 5
    fi
    got="$(jq -r '.request_id // ""' < "$file")"
    if [ "$got" != "$want" ]; then
        sm_log error "sm_apply_read: request_id divergente (o estado em disco mudou entre o pedido e a resposta): esperado $want, recebido ${got:-<ausente>}"
        return 5
    fi
    itype="$(jq -r '.items | type' < "$file" 2>/dev/null || printf 'null')"
    case "$itype" in
        array)
            icount="$(jq -r '.items | length' < "$file" 2>/dev/null || printf '0')"
            [[ "$icount" =~ ^[0-9]+$ ]] || icount=0
            if [ "$icount" -gt 1 ]; then
                sm_log error "sm_apply_read: items traz $icount elementos; nao existe pedido com multiplas respostas (RESP-3): $file"
                return 5
            fi
            items="$(jq -c '.items' < "$file")" || return 5
            body="$(jq -c '.items[0] // {}' < "$file")" || return 5
            ;;
        object)
            # RESP-2: `items` veio como o objeto direto. Equivalente, e nao e erro.
            items="$(jq -c '[.items]' < "$file")" || return 5
            body="$(jq -c '.items' < "$file")" || return 5
            ;;
        *)
            sm_log error "sm_apply_read: campo items ausente ou nao e array nem objeto: $file"
            return 5
            ;;
    esac
    # RA-3: a RESPOSTA valida contra o response_schema ANTES de qualquer escrita.
    # O mapa kind -> arquivo e o de §6.5 + §3.1; e fechado, e o gate o verifica.
    schema=""
    case "$kind" in
        fill_session_fields) schema="session-close.response.schema.json" ;;
        select_sections)     schema="docs-index.response.schema.json" ;;
        compact_facts)       schema="memory-compact.response.schema.json" ;;
        classify_survivor)   schema="challenge-verify.response.schema.json" ;;
    esac
    if [ -z "$schema" ]; then
        sm_log warn "sm_apply_read: kind '$kind' fora do vocabulario de envelope de §6.5; sem response_schema para validar"
    else
        schema="$SM_RESPONSE_SCHEMA_DIR/$schema"
        if [ ! -r "$schema" ]; then
            sm_log error "sm_apply_read: response_schema de '$kind' ilegivel: $schema"
            return 5
        fi
        if ! sm_json_validate <(printf '%s\n' "$body") "$schema"; then
            sm_log error "sm_apply_read: a RESPOSTA nao valida contra $(basename -- "$schema") (RA-3); nada pode ser aplicado"
            return 5
        fi
    fi
    printf '%s\n' "$items"
    return 0
}

# sm_json_merge_ts <arquivo> <campo> -> carimba <campo> com sm_now_iso em escrita atômica. 0 · 1.
sm_json_merge_ts() {
    local file="${1:-}" field="${2:-}" ts out
    if [ -z "$file" ] || [ -z "$field" ]; then
        sm_log error "sm_json_merge_ts: uso: sm_json_merge_ts <arquivo> <campo>"
        return 1
    fi
    [ -r "$file" ] || { sm_log error "sm_json_merge_ts: arquivo ilegivel: $file"; return 1; }
    ts="$(sm_now_iso)"
    if ! out="$(jq --arg f "$field" --arg t "$ts" '.[$f] = $t' < "$file" 2>&1)"; then
        sm_log error "sm_json_merge_ts: $file: $out"
        return 1
    fi
    printf '%s\n' "$out" | sm_atomic_write "$file" || return 1
    return 0
}
