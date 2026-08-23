#!/usr/bin/env bash
# setup-list.sh — lista, resolve, busca, arquiva e esquece setups no registry global.
# Contrato: docs/00-contratos.md §8. Registry e liveness: docs/07-multi-setup.md §1–§2.
set -euo pipefail

SM_SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SM_SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/json.sh
. "$SM_SCRIPT_DIR/lib/json.sh"

SM_SK_DIR="$(cd -P -- "$SM_SCRIPT_DIR/.." && pwd -P)"
SM_SCHEMAS_DIR="$SM_SK_DIR/assets/schemas"
SM_EMPTY_REGISTRY='{"schema_version":"1.0","setups":[]}'
SM_STALE_SECONDS=86400          # 24 h: teto de revarredura por entrada (registry.checked_at)

sl_usage() {
    cat <<'HELP'
setup-list.sh — o indice de setups do aluno: listar, resolver, buscar, arquivar, esquecer.

USO
  setup-list.sh [--all] [--json]
  setup-list.sh --resolve <cwd>
  setup-list.sh --find <termo> [--json]
  setup-list.sh --archive <setup_id>
  setup-list.sh --forget <setup_id>
  setup-list.sh -h | --help

SUBCOMANDOS
  (sem argumento)     Lista os setups `active`, do mais recentemente visto para o mais antigo.
  --all               Inclui tambem os `missing` e os `archived`.
  --json              Emite JSON em vez da lista legivel: {"setups":[...]}.
  --resolve <cwd>     Sobe de <cwd> por ancestrais ate $HOME (inclusive) procurando setup.json.
                      Imprime o caminho ABSOLUTO da raiz do setup. E a resolucao do passo
                      `bootstrap`. Atualiza no registry: last_seen_at, checked_at, setup_status
                      e o `path` de um setup que mudou de lugar. Sai 3 se nao achar nada.
  --find <termo>      Casa <termo> (normalizado para snake_case) contra `subject`, `taxonomy[]`
                      e `topics[]` das entradas `active`, por substring. Entradas com
                      cross_read "never" ficam de fora ate da listagem de nomes.
                      Com --json: {"term":..,"query":..,"matches":[...]}.
  --archive <id>      Marca setup_status "archived" + archived_at. Some da lista padrao.
  --forget <id>       Remove a entrada do registry (operacao explicita, nunca automatica).
                      Nao apaga nada em disco: o setup continua la e volta ao ser reaberto.

LIVENESS CHECK (docs/07-multi-setup.md §2.1)
  Entrada cujo `path` sumiu, ou cujo setup.json de la tem outro setup_id, vira
  setup_status "missing" com missing_since — e NUNCA e apagada: ela ainda da nome a
  cross_setup_refs antigas e volta sozinha a "active" se o setup for restaurado.
  `setup_id` e a chave primaria; `path` e atributo volatil, corrigido automaticamente
  quando o caminho antigo nao existe mais.

EXIT CODES (docs/00-contratos.md §5.1)
  0 ok · 1 erro de execucao · 2 uso incorreto · 3 nao encontrado (--resolve/--archive/--forget)
  · 4 registry ocupado
HELP
}

# ---------------------------------------------------------------------------
sl_registry_load() {
    # Ecoa o registry como JSON. Ausente ou ilegivel -> registry vazio em memoria (B-23/B-24):
    # o arquivo quebrado so e movido no momento de uma gravacao real (sl_registry_save).
    local reg
    reg="$(sm_registry_path)"
    if [ -f "$reg" ] && sm_json_ok "$reg"; then
        cat -- "$reg"
        return 0
    fi
    if [ -f "$reg" ]; then
        sm_log warn "registry ilegivel ($reg): seguindo com um registry vazio; nenhum setup foi perdido"
    fi
    printf '%s\n' "$SM_EMPTY_REGISTRY"
    return 0
}

sl_registry_save() {
    # sl_registry_save <json> -> 0 ok · 1 I/O · 4 ocupado · 5 nao valida
    local doc="${1:-}" reg home check rc corrupt
    reg="$(sm_registry_path)"
    home="$(dirname -- "$reg")"
    if ! mkdir -p -- "$home" 2>/dev/null || [ ! -w "$home" ]; then
        sm_log warn "\$STUDY_METHOD_HOME nao e gravavel ($home): o registry nao foi atualizado"
        return 0
    fi
    chmod 700 -- "$home" 2>/dev/null || true
    sm_registry_lock || return 4
    if [ -f "$reg" ] && ! sm_json_ok "$reg"; then
        corrupt="$reg.corrupt-$(date +%s)"
        mv -f -- "$reg" "$corrupt" 2>/dev/null || true
        sm_log warn "registry ilegivel: preservado como $corrupt e recriado"
    fi
    doc="$(printf '%s' "$doc" | jq --arg now "$(sm_now_iso)" '.updated_at = $now')" \
        || { sm_registry_unlock; return 1; }
    check="$home/.registry.check.$$"
    printf '%s\n' "$doc" > "$check" || { sm_registry_unlock; return 1; }
    rc=0
    sm_json_validate "$check" "$SM_SCHEMAS_DIR/registry.schema.json" || rc=$?
    rm -f -- "$check"
    if [ "$rc" -ne 0 ]; then
        sm_registry_unlock
        sm_log error "o registry resultante nao valida contra registry.schema.json: nada foi gravado"
        return 5
    fi
    printf '%s\n' "$doc" | sm_atomic_write "$reg" || { sm_registry_unlock; return 1; }
    sm_registry_unlock
    return 0
}

sl_entry_from_manifest() {
    # sl_entry_from_manifest <root> -> entrada de registry completa a partir do setup.json de la.
    local root="${1:-}" now
    now="$(sm_now_iso)"
    jq -n \
        --slurpfile m "$root/setup.json" \
        --arg path "$root" \
        --arg now "$now" '
        ($m[0]) as $s
        | {setup_id: $s.setup_id, setup_name: $s.setup_name, title: $s.title,
           subject: $s.subject, taxonomy: ($s.taxonomy // []), path: $path,
           language: ($s.language.name // "none"), setup_status: "active",
           created_at: ($s.created_at // $now), last_seen_at: $now, checked_at: $now,
           session_count: ($s.session_count // 0),
           cross_read: ($s.privacy.cross_read // "ask")}
        | (if $s.last_session_at then .last_session_at = $s.last_session_at else . end)'
}

sl_liveness() {
    # sl_liveness <registry-json> [<forcar-setup_id>] -> registry-json atualizado.
    # Implementa docs/07-multi-setup.md §2.1. Entradas `archived` sao puladas; entradas
    # verificadas ha menos de 24 h sao puladas, salvo a de <forcar-setup_id>.
    local doc="${1:-}" force="${2:-}" now n i id path status checked disk_id age epoch_now epoch_chk
    now="$(sm_now_iso)"
    epoch_now="$(date +%s)"
    n="$(printf '%s' "$doc" | jq '.setups | length')"
    i=0
    while [ "$i" -lt "$n" ]; do
        id="$(printf '%s' "$doc"     | jq -r --argjson i "$i" '.setups[$i].setup_id')"
        path="$(printf '%s' "$doc"   | jq -r --argjson i "$i" '.setups[$i].path')"
        status="$(printf '%s' "$doc" | jq -r --argjson i "$i" '.setups[$i].setup_status')"
        checked="$(printf '%s' "$doc" | jq -r --argjson i "$i" '.setups[$i].checked_at // ""')"
        if [ "$status" = "archived" ] && [ "$id" != "$force" ]; then
            i=$(( i + 1 )); continue
        fi
        if [ -n "$checked" ] && [ "$id" != "$force" ]; then
            epoch_chk="$(date -d "$checked" +%s 2>/dev/null || printf '0')"
            age=$(( epoch_now - epoch_chk ))
            if [ "$epoch_chk" -gt 0 ] && [ "$age" -lt "$SM_STALE_SECONDS" ]; then
                i=$(( i + 1 )); continue
            fi
        fi
        disk_id=""
        if [ -f "$path/setup.json" ] && [ -r "$path/setup.json" ] && sm_json_ok "$path/setup.json"; then
            disk_id="$(jq -r '.setup_id // ""' < "$path/setup.json" 2>/dev/null || printf '')"
        fi
        if [ "$disk_id" = "$id" ] && [ -n "$disk_id" ]; then
            doc="$(printf '%s' "$doc" | jq --argjson i "$i" --arg now "$now" '
                .setups[$i].setup_status = (if .setups[$i].setup_status == "archived"
                                            then "archived" else "active" end)
                | .setups[$i].last_seen_at = $now
                | .setups[$i].checked_at   = $now
                | del(.setups[$i].missing_since)')"
        else
            doc="$(printf '%s' "$doc" | jq --argjson i "$i" --arg now "$now" '
                .setups[$i].setup_status = "missing"
                | .setups[$i].missing_since = (.setups[$i].missing_since // $now)
                | .setups[$i].checked_at = $now')"
            sm_log warn "setup $id sumiu de $path: marcado como missing (a entrada nunca e apagada)"
            if [ -n "$disk_id" ]; then
                # Outro setup mudou-se para esse caminho: garante entrada para o id de la.
                if [ "$(printf '%s' "$doc" | jq -r --arg d "$disk_id" '[.setups[] | select(.setup_id == $d)] | length')" = "0" ]; then
                    doc="$(printf '%s' "$doc" | jq --argjson e "$(sl_entry_from_manifest "$path")" '.setups += [$e]')"
                    n=$(( n + 1 ))
                    sm_log warn "outro setup ($disk_id) ocupa $path: entrada nova criada para ele"
                fi
            fi
        fi
        i=$(( i + 1 ))
    done
    printf '%s\n' "$doc"
}

sl_pad() {
    # sl_pad <texto> <largura> -> texto preenchido a direita (conta caracteres, nao bytes).
    local s="${1:-}" w="${2:-0}" spaces='                                                                '
    if [ "${#s}" -ge "$w" ]; then
        printf '%s' "$s"
    else
        printf '%s%s' "$s" "${spaces:0:$(( w - ${#s} ))}"
    fi
}

sl_print_human() {
    # sl_print_human <registry-json> <com-estado 0|1>
    local doc="${1:-}" with_status="${2:-0}" n i name title last count status path
    n="$(printf '%s' "$doc" | jq '.setups | length')"
    if [ "$n" -eq 0 ]; then
        printf 'Nenhum setup registrado.\n'
        return 0
    fi
    sl_pad 'NOME' 20; sl_pad 'TITULO' 26; sl_pad 'ULTIMA SESSAO' 15; sl_pad 'SESSOES' 9
    if [ "$with_status" = "1" ]; then sl_pad 'ESTADO' 10; fi
    printf 'CAMINHO\n'
    i=0
    while [ "$i" -lt "$n" ]; do
        name="$(printf '%s' "$doc"   | jq -r --argjson i "$i" '.setups[$i].setup_name')"
        title="$(printf '%s' "$doc"  | jq -r --argjson i "$i" '.setups[$i].title')"
        last="$(printf '%s' "$doc"   | jq -r --argjson i "$i" '.setups[$i].last_session_at // "-"')"
        count="$(printf '%s' "$doc"  | jq -r --argjson i "$i" '.setups[$i].session_count // 0')"
        status="$(printf '%s' "$doc" | jq -r --argjson i "$i" '.setups[$i].setup_status')"
        path="$(printf '%s' "$doc"   | jq -r --argjson i "$i" '.setups[$i].path')"
        sl_pad "$name" 20; sl_pad "$title" 26; sl_pad "${last:0:10}" 15; sl_pad "$count" 9
        if [ "$with_status" = "1" ]; then sl_pad "$status" 10; fi
        printf '%s\n' "$path"
        i=$(( i + 1 ))
    done
    return 0
}

# ---------------------------------------------------------------------------
mode="list"
opt_all=0
opt_json=0
arg=""

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) sl_usage; exit 0 ;;
        --all)     opt_all=1; shift ;;
        --json)    opt_json=1; shift ;;
        --resolve) [ $# -ge 2 ] || sm_die 2 "--resolve exige <cwd>"
                   [ "$mode" = "list" ] || sm_die 2 "subcomandos sao mutuamente exclusivos"
                   mode="resolve"; arg="$2"; shift 2 ;;
        --find)    [ $# -ge 2 ] || sm_die 2 "--find exige <termo>"
                   [ "$mode" = "list" ] || sm_die 2 "subcomandos sao mutuamente exclusivos"
                   mode="find"; arg="$2"; shift 2 ;;
        --archive) [ $# -ge 2 ] || sm_die 2 "--archive exige <setup_id>"
                   [ "$mode" = "list" ] || sm_die 2 "subcomandos sao mutuamente exclusivos"
                   mode="archive"; arg="$2"; shift 2 ;;
        --forget)  [ $# -ge 2 ] || sm_die 2 "--forget exige <setup_id>"
                   [ "$mode" = "list" ] || sm_die 2 "subcomandos sao mutuamente exclusivos"
                   mode="forget"; arg="$2"; shift 2 ;;
        -*)        sm_die 2 "flag desconhecida: $1 (use --help)" ;;
        *)         sm_die 2 "argumento posicional inesperado: $1 (use --help)" ;;
    esac
done

sm_require_cmd jq || sm_die 1 "jq e a unica ferramenta estruturada garantida do projeto"

registry="$(sl_registry_load)"

case "$mode" in
# ---------------------------------------------------------------------------
resolve)
    root="$(sm_setup_root "$arg")" || sm_die 3 "nenhum setup.json legivel em $arg nem em ancestral ate \$HOME"
    if ! sm_json_ok "$root/setup.json"; then
        sm_die 5 "o setup.json de $root nao parseia — nada foi tocado (B-07)"
    fi
    disk_id="$(jq -r '.setup_id // ""' < "$root/setup.json")"
    [[ "$disk_id" =~ ^[0-9a-f]{12}$ ]] || sm_die 5 "setup_id invalido em $root/setup.json: ${disk_id:-<ausente>}"

    known="$(printf '%s' "$registry" | jq -r --arg id "$disk_id" '[.setups[] | select(.setup_id == $id)] | length')"
    if [ "$known" = "0" ]; then
        registry="$(printf '%s' "$registry" | jq --argjson e "$(sl_entry_from_manifest "$root")" '.setups += [$e]')"
        sm_log info "setup $disk_id registrado a partir de $root"
    else
        old_path="$(printf '%s' "$registry" | jq -r --arg id "$disk_id" '[.setups[] | select(.setup_id == $id) | .path][0] // ""')"
        if [ "$old_path" != "$root" ]; then
            old_disk=""
            if [ -f "$old_path/setup.json" ] && sm_json_ok "$old_path/setup.json"; then
                old_disk="$(jq -r '.setup_id // ""' < "$old_path/setup.json")"
            fi
            if [ "$old_disk" = "$disk_id" ]; then
                # Dois caminhos vivos com o mesmo setup_id: e clone, nao movimento (D-A19).
                # Sortear um id novo e decisao do aluno; o script nao adivinha.
                sm_log warn "clone detectado: $disk_id existe em $old_path e em $root; o registry continua apontando para $old_path"
            else
                registry="$(printf '%s' "$registry" | jq --arg id "$disk_id" --arg p "$root" '
                    .setups |= map(if .setup_id == $id
                                   then .path = $p | .setup_status = "active" | del(.missing_since)
                                   else . end)')"
                sm_log info "setup $disk_id mudou de lugar: $old_path -> $root (registry corrigido)"
            fi
        fi
        # Espelhos: o manifesto manda, o registry e corrigido (docs/07 §6, item 8).
        registry="$(printf '%s' "$registry" | jq \
            --arg id "$disk_id" \
            --slurpfile m "$root/setup.json" \
            --arg now "$(sm_now_iso)" '
            ($m[0]) as $s
            | .setups |= map(if .setup_id == $id then
                  .setup_name = $s.setup_name
                | .title = $s.title
                | .subject = $s.subject
                | .taxonomy = ($s.taxonomy // [])
                | .language = ($s.language.name // "none")
                | .session_count = ($s.session_count // 0)
                | .cross_read = ($s.privacy.cross_read // "ask")
                | (if $s.last_session_at then .last_session_at = $s.last_session_at else . end)
                | .last_seen_at = $now
                | .checked_at = $now
                | .setup_status = (if .setup_status == "archived" then "archived" else "active" end)
                | del(.missing_since)
              else . end)')"
    fi
    registry="$(sl_liveness "$registry" "$disk_id")"
    rc=0
    sl_registry_save "$registry" || rc=$?
    [ "$rc" -ne 4 ] || sm_die 4 "registry ocupado por outro processo"
    [ "$rc" -eq 0 ] || sm_log warn "o registry nao pode ser atualizado agora (codigo $rc); a resolucao vale assim mesmo"
    printf '%s\n' "$root"
    ;;

# ---------------------------------------------------------------------------
find)
    query="$(sm_normalize_concept_id "$arg")" || sm_die 2 "--find: termo sem nenhum caractere aproveitavel: $arg"
    registry="$(sl_liveness "$registry")"
    rc=0
    sl_registry_save "$registry" || rc=$?
    [ "$rc" -ne 4 ] || sm_log warn "registry ocupado: a busca segue com o estado em memoria"
    matches="$(printf '%s' "$registry" | jq -c --arg q "$query" '
        [ .setups[]
          | select(.setup_status == "active")
          | select((.cross_read // "ask") != "never")
          | select( (.subject // "" | contains($q))
                    or ((.taxonomy // []) | map(contains($q)) | any)
                    or ((.topics   // []) | map(contains($q)) | any) ) ]')"
    if [ "$opt_json" -eq 1 ]; then
        printf '%s' "$registry" | jq --arg term "$arg" --arg q "$query" --argjson m "$matches" \
            '{term:$term, query:$q, matches:$m}'
    else
        sl_print_human "$(jq -n --argjson m "$matches" '{setups:$m}')" 0
    fi
    ;;

# ---------------------------------------------------------------------------
archive)
    [[ "$arg" =~ ^[0-9a-f]{12}$ ]] || sm_die 2 "--archive: setup_id invalido: $arg (esperado 12 hex)"
    found="$(printf '%s' "$registry" | jq -r --arg id "$arg" '[.setups[] | select(.setup_id == $id)] | length')"
    [ "$found" != "0" ] || sm_die 3 "setup_id nao esta no registry: $arg"
    registry="$(printf '%s' "$registry" | jq --arg id "$arg" --arg now "$(sm_now_iso)" '
        .setups |= map(if .setup_id == $id
                       then .setup_status = "archived" | .archived_at = (.archived_at // $now)
                       else . end)')"
    rc=0
    sl_registry_save "$registry" || rc=$?
    case "$rc" in
        0) ;;
        4) sm_die 4 "registry ocupado por outro processo" ;;
        5) sm_die 5 "o registry resultante nao valida: nada foi gravado" ;;
        *) sm_die 1 "falha ao gravar o registry" ;;
    esac
    printf '%s\n' "$arg"
    ;;

# ---------------------------------------------------------------------------
forget)
    [[ "$arg" =~ ^[0-9a-f]{12}$ ]] || sm_die 2 "--forget: setup_id invalido: $arg (esperado 12 hex)"
    found="$(printf '%s' "$registry" | jq -r --arg id "$arg" '[.setups[] | select(.setup_id == $id)] | length')"
    [ "$found" != "0" ] || sm_die 3 "setup_id nao esta no registry: $arg"
    registry="$(printf '%s' "$registry" | jq --arg id "$arg" '.setups |= map(select(.setup_id != $id))')"
    rc=0
    sl_registry_save "$registry" || rc=$?
    case "$rc" in
        0) ;;
        4) sm_die 4 "registry ocupado por outro processo" ;;
        5) sm_die 5 "o registry resultante nao valida: nada foi gravado" ;;
        *) sm_die 1 "falha ao gravar o registry" ;;
    esac
    sm_log info "entrada removida do registry: $arg (nada foi apagado em disco)"
    printf '%s\n' "$arg"
    ;;

# ---------------------------------------------------------------------------
list)
    registry="$(sl_liveness "$registry")"
    rc=0
    sl_registry_save "$registry" || rc=$?
    [ "$rc" -ne 4 ] || sm_log warn "registry ocupado: a listagem segue com o estado em memoria"
    if [ "$opt_all" -eq 1 ]; then
        view="$(printf '%s' "$registry" | jq '{setups: (.setups | sort_by(.last_seen_at) | reverse)}')"
    else
        view="$(printf '%s' "$registry" | jq '{setups: ([.setups[] | select(.setup_status == "active")] | sort_by(.last_seen_at) | reverse)}')"
    fi
    if [ "$opt_json" -eq 1 ]; then
        printf '%s\n' "$view" | jq .
    else
        sl_print_human "$view" "$opt_all"
    fi
    ;;
esac

exit 0
