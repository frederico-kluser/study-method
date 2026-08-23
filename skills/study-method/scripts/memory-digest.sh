#!/usr/bin/env bash
# =============================================================================
# memory-digest.sh — o working memory da sessão (camada de leitura)
#
# Contratos: docs/00-contratos.md §5 (exit codes), §7 (lib/), §8 (CLI), §11.
# Especificação: docs/03-memoria.md §6.2 — os 15 passos, implementados na ordem.
#
# GARANTIAS
#   * SOMENTE LEITURA. Não cria, não altera e não remove arquivo nenhum.
#   * SAÍDA DE FORMA FIXA: as mesmas chaves de topo, na mesma ordem, em todos os
#     cenários. Ausência é [], {} ou null — nenhuma chave desaparece.
#   * EXIT 0 sempre que produzir um digest (memória vazia, índice ausente, bruto
#     corrompido, orçamento estourado). Falha de memória nunca impede uma aula.
#   * DETERMINÍSTICO BYTE A BYTE: mesma entrada + mesmos --now/--today = mesma
#     saída. Toda ordenação tem desempate explícito; nenhuma ordem é herdada de
#     iteração de diretório; o único relógio lido é o de --now/--today.
#   * MONTADO POR CÓDIGO. Nenhum campo depende de julgamento do modelo; o único
#     canal de julgamento é o argumento --topics.
# =============================================================================
set -euo pipefail
export LC_ALL=C

SM_HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh disable=SC1091
. "$SM_HERE/lib/common.sh"
# shellcheck source=lib/json.sh disable=SC1091
. "$SM_HERE/lib/json.sh"

SM_DIGEST_SCHEMA_VERSION="1.0"

# Defaults de docs/03-memoria.md §6.1
SM_BUDGET_CHARS=6000
SM_RECENT_SESSIONS_K=5
SM_AFFECT_WINDOW=3
SM_TOPIC_WINDOW=3
SM_SEMANTIC_FACTS_CAP=12
SM_PROC_AVOID_CAP=5
SM_PROC_DO_CAP=8
SM_FOLLOWUP_CAP=6
SM_TOP_TAGS=15
SM_SUMMARY_CUT=160
SM_TEXT_CUT=120          # T5
SM_TOP_ELIGIBLE=5          # as N sessões de maior session_id nunca perdem digest_eligible

usage() {
  cat <<'EOF'
uso: memory-digest.sh <setup_root> [--topics t1,t2] [--budget-chars N]
                      [--today AAAA-MM-DD] [--now <ISO 8601>]

Monta o digest determinístico da memória e o imprime em stdout. Não escreve nada.

  <setup_root>      raiz do setup (posicional; sem ele, resolve a partir de $PWD)
  --topics t1,t2    tópicos da aula de hoje (canal por onde o julgamento entra)
  --budget-chars N  orçamento de caracteres do digest (default 6000)
  --today AAAA-MM-DD  data de referência do decaimento (default: hoje)
  --now <ISO 8601>  carimbo de generated_at. SEM ELE a saída não é reproduzível
                    byte a byte: toda comparação de teste/gate passa --now.
  -h, --help        esta ajuda

exit: 0 sempre que produzir um digest · 2 uso incorreto · 3 setup não encontrado
EOF
}

TOPICS_ARG=""
TOPICS_GIVEN=0
TODAY_ARG=""
NOW_ARG=""
SETUP_HINT=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --topics)        [ $# -ge 2 ] || { usage >&2; sm_die 2 "--topics exige valor"; };        TOPICS_ARG="$2"; TOPICS_GIVEN=1; shift ;;
    --topics=*)      TOPICS_ARG="${1#*=}"; TOPICS_GIVEN=1 ;;
    --budget-chars)  [ $# -ge 2 ] || { usage >&2; sm_die 2 "--budget-chars exige valor"; };  SM_BUDGET_CHARS="$2"; shift ;;
    --budget-chars=*) SM_BUDGET_CHARS="${1#*=}" ;;
    --today)         [ $# -ge 2 ] || { usage >&2; sm_die 2 "--today exige valor"; };         TODAY_ARG="$2"; shift ;;
    --today=*)       TODAY_ARG="${1#*=}" ;;
    --now)           [ $# -ge 2 ] || { usage >&2; sm_die 2 "--now exige valor"; };           NOW_ARG="$2"; shift ;;
    --now=*)         NOW_ARG="${1#*=}" ;;
    --) shift; break ;;
    -*) usage >&2; sm_die 2 "flag desconhecida: $1" ;;
    *)
      if [ -z "$SETUP_HINT" ]; then SETUP_HINT="$1"
      else usage >&2; sm_die 2 "argumento posicional extra: $1"; fi ;;
  esac
  shift
done

case "$SM_BUDGET_CHARS" in
  ''|*[!0-9]*) usage >&2; sm_die 2 "--budget-chars precisa ser um inteiro" ;;
esac

sm_require_cmd jq date || sm_die 1 "dependência ausente (jq, coreutils)"

SM_SETUP_ROOT=""
rc=0
SM_SETUP_ROOT="$(sm_setup_root "$SETUP_HINT")" || rc=$?
if [ "$rc" -ne 0 ] || [ -z "$SM_SETUP_ROOT" ]; then
  sm_die 3 "nenhum setup.json legível a partir de '${SETUP_HINT:-$PWD}'"
fi

MEM="$SM_SETUP_ROOT/memory"
INDEX="$MEM/INDEX.json"
PROFILE="$MEM/profile.json"

TODAY="${TODAY_ARG:-$(sm_today)}"
NOW="${NOW_ARG:-$(sm_now_iso)}"
[ -n "$TODAY" ] || TODAY="$(date +%Y-%m-%d)"
[ -n "$NOW" ] || NOW="$(date -Iseconds)"

# =============================================================================
# >>> DERIVACAO-INDICE (cópia literal da tabela de docs/03-memoria.md §2.1;
#     o mesmo bloco vive no outro script — divergência entre os dois é bug)
SM_DERIVE_JQ='
def sm_derive_entry:
  . as $s
  | {
      session_id:       $s.session_id,
      file:             ("memory/" + $s.session_id + ".json"),
      date:             $s.date,
      status:           $s.status,
      topics:           ($s.topics // []),
      skills_touched:   ([ ($s.skills_observed // [])[] | .skill ] | unique),
      one_line_summary: (($s.one_line_summary // "") | .[0:160]),
      affect:           ($s.affect // null),
      flags: ([
          (if ([ ($s.how_it_happened // [])[] | select(.outcome == "unlocked")  ] | length) > 0 then "has_unlock"         else empty end),
          (if ([ ($s.how_it_happened // [])[] | select(.outcome == "backfired") ] | length) > 0 then "has_backfire"       else empty end),
          (if (($s.open_questions // []) | length) > 0                                          then "has_open_questions" else empty end),
          (if (($s.next_steps // [])     | length) > 0                                          then "has_next_steps"     else empty end),
          (if $s.finalized_by == "auto_orphan_recovery"                                          then "orphan_recovered"   else empty end)
        ]),
      digest_eligible:  true,
      compacted_at:     null,
      cross_setup_refs: ($s.cross_setup_refs // [])
    };
'
# <<< DERIVACAO-INDICE

# >>> OVERLAY-COMPACTACAO (cópia literal; o mesmo bloco vive no outro script)
#     digest_eligible e compacted_at NÃO existem na sessão: são estado da
#     compactação. Numa reconstrução eles vêm, nesta ordem: do índice atual, do
#     profile.compaction, e só então dos defaults. Voltá-los ao default faria o
#     gatilho da compactação disparar e re-consolidar fatos já consolidados.
SM_OVERLAY_JQ='
def sm_overlay_compaction($prior; $profile; $topn):
  ($prior | map({key: .session_id, value: {digest_eligible: (.digest_eligible // true), compacted_at: (.compacted_at // null)}}) | from_entries) as $pmap
  | (($profile.compaction.last_compacted_session_id) // null) as $lastid
  | (if (($profile.compaction.last_compacted_at) // null) == null then null else (($profile.compaction.last_compacted_at) | .[0:10]) end) as $lastdate
  | (map(.session_id) | sort | reverse | .[0:$topn]) as $top
  | map(
      . as $e
      | (if ($pmap | has($e.session_id)) then $pmap[$e.session_id]
         elif ($lastid != null and $e.session_id <= $lastid and $e.status != "in_progress")
         then {digest_eligible: (($top | index($e.session_id)) != null), compacted_at: ($lastdate // $e.date)}
         else {digest_eligible: true, compacted_at: null} end) as $c
      | .digest_eligible = $c.digest_eligible
      | .compacted_at = $c.compacted_at
    );
'
# <<< OVERLAY-COMPACTACAO
# =============================================================================

ERRORS='[]'
add_error() { # <json compacto>
  ERRORS="$(printf '%s' "$ERRORS" | jq -c --argjson e "$1" '. + [$e]')"
}

# --- passo 1: memória vazia? (avaliado antes de tudo) ------------------------
RAWS=()
if [ -d "$MEM" ]; then
  shopt -s nullglob
  RAWS=( "$MEM"/[0-9][0-9][0-9][0-9].json )
  shopt -u nullglob
fi

FIRST_SESSION=false
if [ ! -d "$MEM" ] || { [ "${#RAWS[@]}" -eq 0 ] && [ ! -f "$INDEX" ]; }; then
  FIRST_SESSION=true
fi

# --- passo 5 (leitura antecipada: o perfil alimenta a recuperação do estado
#     de compactação, necessária já no passo 2) ------------------------------
ENTRIES='[]'
PROFILE_JSON='null'
if [ -f "$PROFILE" ]; then
  if jq -e 'type == "object"' -- "$PROFILE" >/dev/null 2>&1; then
    PROFILE_JSON="$(jq -c '.' -- "$PROFILE")"
  else
    add_error '{"kind":"profile_unparseable"}'
  fi
elif [ "$FIRST_SESSION" = false ]; then
  # Perfil ausente é o estado NORMAL antes da 1ª compactação (§6.1: não conta
  # para `degraded`). Na primeira sessão nem isso se registra: não falta nada.
  add_error '{"kind":"profile_missing"}'
fi

# `rebuild_entries` escreve nas GLOBAIS ENTRIES/ERRORS de propósito: chamada em
# substituição de comando ela rodaria num subshell e os errors[] se perderiam.
rebuild_entries() { # <prior-entries-json>
  local prior="$1" derived='[]' f base id
  local -a ok=()
  for f in "${RAWS[@]}"; do
    base="$(basename -- "$f")"; id="${base%.json}"
    if ! jq -e 'type == "object"' -- "$f" >/dev/null 2>&1; then
      add_error "$(jq -n -c --arg id "$id" '{kind:"session_unparseable", session_id:$id}')"
      continue
    fi
    ok+=("$f")
  done
  if [ "${#ok[@]}" -gt 0 ]; then
    derived="$(jq -s "$SM_DERIVE_JQ"' map(sm_derive_entry) | sort_by(.session_id)' -- "${ok[@]}")"
  fi
  ENTRIES="$(printf '%s' "$derived" | jq -c \
    --argjson prior "$prior" --argjson profile "$PROFILE_JSON" --argjson topn "$SM_TOP_ELIGIBLE" \
    "$SM_OVERLAY_JQ"' sm_overlay_compaction($prior; $profile; $topn)')"
}

# --- passo 2: índice (ou reconstrução em memória) ---------------------------
if [ "$FIRST_SESSION" = true ]; then
  ENTRIES='[]'
else
  INDEX_OK=0
  INDEX_PRIOR='[]'
  if [ ! -f "$INDEX" ]; then
    add_error '{"kind":"index_missing"}'
  elif ! jq -e 'type == "object" and (.sessions | type) == "array"' -- "$INDEX" >/dev/null 2>&1; then
    add_error '{"kind":"index_unparseable"}'
  else
    INDEX_PRIOR="$(jq -c '[ .sessions[] | select(type == "object") ]' -- "$INDEX")"
    iup="$(jq -r '.updated_at // ""' -- "$INDEX")"
    iep="$( [ -n "$iup" ] && date -d "$iup" +%s 2>/dev/null || true )"
    if [ -z "$iep" ]; then
      add_error '{"kind":"index_unparseable"}'
    else
      stale=0
      for f in "${RAWS[@]}"; do
        if [ "$(date -r "$f" +%s)" -gt "$iep" ]; then stale=1; break; fi
      done
      if [ "$stale" -eq 1 ]; then add_error '{"kind":"index_stale"}'; else INDEX_OK=1; fi
    fi
  fi
  if [ "$INDEX_OK" -eq 1 ]; then
    ENTRIES="$INDEX_PRIOR"
  else
    rebuild_entries "$INDEX_PRIOR"
  fi
fi

# --- passo 6: tópicos em foco ------------------------------------------------
TOPICS_SOURCE="inferred_from_recent"
TOPIC_CANDS=()
if [ "$TOPICS_GIVEN" -eq 1 ]; then
  TOPICS_SOURCE="argument"
  IFS=',' read -r -a TOPIC_CANDS <<< "$TOPICS_ARG"
else
  while IFS= read -r t; do
    [ -n "$t" ] && TOPIC_CANDS+=("$t")
  done < <(printf '%s' "$ENTRIES" | jq -r --argjson w "$SM_TOPIC_WINDOW" \
    '[ .[] | select(.status != "in_progress") ] | .[(0-$w):] | [ .[] | (.topics // [])[] ] | .[]')
fi

TOPICS_NORM=()
for t in "${TOPIC_CANDS[@]:-}"; do
  t="${t#"${t%%[![:space:]]*}"}"; t="${t%"${t##*[![:space:]]}"}"
  [ -n "$t" ] || continue
  n="$(sm_normalize_concept_id "$t" 2>/dev/null || true)"
  # Guarda: rótulo já canônico continua valendo mesmo se o normalizador falhar.
  if [ -z "$n" ] && [[ "$t" =~ ^[a-z][a-z0-9_]{1,62}$ ]]; then n="$t"; fi
  [ -n "$n" ] && TOPICS_NORM+=("$n")
done
if [ "${#TOPICS_NORM[@]}" -gt 0 ]; then
  TOPICS_IN_FOCUS="$(printf '%s\n' "${TOPICS_NORM[@]}" | sort -u | jq -Rsc 'split("\n") | map(select(. != ""))')"
else
  TOPICS_IN_FOCUS='[]'
fi

# --- passo 11 (fonte bruta): open_questions e next_steps das últimas N --------
FOLLOWUPS_RAW='[]'
if [ "${#RAWS[@]}" -gt 0 ]; then
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    f="$MEM/$id.json"
    [ -f "$f" ] || continue
    if ! jq -e 'type == "object"' -- "$f" >/dev/null 2>&1; then
      add_error "$(jq -n -c --arg id "$id" '{kind:"session_unparseable", session_id:$id}')"
      continue
    fi
    novo="$(jq -c --arg id "$id" --argjson acc "$FOLLOWUPS_RAW" \
      '$acc
       + [ (.open_questions // [])[] | select(type == "string") | {text: ., created_in_session: $id, origin_field: "open_questions"} ]
       + [ (.next_steps // [])[]     | select(type == "string") | {text: ., created_in_session: $id, origin_field: "next_steps"} ]' -- "$f")"
    FOLLOWUPS_RAW="$novo"
  done < <(printf '%s' "$ENTRIES" | jq -r --argjson w "$SM_TOPIC_WINDOW" \
    '[ .[] | select(.status != "in_progress") ] | .[(0-$w):] | .[].session_id')
fi

# --- passos 3 a 13: montagem do digest ---------------------------------------
CAPS="$(jq -n -c \
  --argjson recent_k "$SM_RECENT_SESSIONS_K" \
  --argjson affect_w "$SM_AFFECT_WINDOW" \
  --argjson facts_cap "$SM_SEMANTIC_FACTS_CAP" \
  --argjson avoid_cap "$SM_PROC_AVOID_CAP" \
  --argjson do_cap "$SM_PROC_DO_CAP" \
  --argjson followup_cap "$SM_FOLLOWUP_CAP" \
  --argjson top_tags "$SM_TOP_TAGS" \
  --argjson summary_cut "$SM_SUMMARY_CUT" \
  '{recent_k:$recent_k, affect_w:$affect_w, facts_cap:$facts_cap, avoid_cap:$avoid_cap,
    do_cap:$do_cap, followup_cap:$followup_cap, top_tags:$top_tags, summary_cut:$summary_cut}')"

SM_BUILD_JQ='
def epoch_of($d): if ($d == null or $d == "") then null else (try (($d + "T00:00:00Z") | fromdateiso8601) catch null) end;
def days_since($d; $t): (epoch_of($d)) as $a | (epoch_of($t)) as $b
  | if ($a == null or $b == null) then null else ((($b - $a) / 86400) | floor) end;
def neg_epoch($d): (epoch_of($d)) as $a | if $a == null then 0 else (0 - $a) end;
def bucket_semantic($kind; $dp):
  if ($kind == "skill_level" or $kind == "difficulty" or $kind == "strength") then $dp.skill_fact_days
  elif ($kind == "preference" or $kind == "context") then $dp.preference_fact_days
  else $dp.skill_fact_days end;
def is_stale($last; $bucket; $t): (days_since($last; $t)) as $d
  | if $d == null then false else ($d > $bucket) end;
def has_val($lst; $v): (($lst // []) | index($v)) != null;
def proc_item: {
    fact_id, procedure_kind, target_topic: (.target_topic // null), how,
    base_domain: (.base_domain // null), mapping: (.mapping // null),
    known_limit: (.known_limit // null), outcome, confidence,
    last_observed_at: (.last_observed_at // null), read_as: ._ra,
    source_sessions: (.source_sessions // [])
  };

($profile // {}) as $P
| ($P.decay_policy // {}) as $DP0
| {skill_fact_days: ($DP0.skill_fact_days // 60),
   procedural_fact_days: ($DP0.procedural_fact_days // 180),
   preference_fact_days: ($DP0.preference_fact_days // 180)} as $DP
| ($entries | sort_by(.session_id)) as $E
| ([ $E[] | select(.status != "in_progress") ]) as $FIN
| ([ $E[] | select(.status == "abandoned" and (((.flags // []) | index("orphan_recovered")) != null)) ]
     | sort_by(.session_id) | reverse | .[0:3]) as $ORPH
| ($ORPH | map(.session_id)) as $ORPHIDS
| (if ($E | length) == 0 then "0001"
   else (("0000" + ((($E | map(.session_id | tonumber) | max) + 1) | tostring)) | .[-4:]) end) as $FOR
| ([ $FIN[] | select((.digest_eligible // true) != false)
            | select(has_val($ORPHIDS; .session_id) | not) ]
     | .[(0 - $caps.recent_k):]
     | map({session_id, date, topics: (.topics // []),
            one_line_summary: ((.one_line_summary // "") | .[0:$caps.summary_cut]),
            flags: (.flags // [])})) as $RECENT
| ($FIN | .[(0 - $caps.affect_w):] | map(.affect) | map(select(. != null))) as $AFFECT
| ([ ($P.semantic_facts // [])[] | select(.status == "active") ]
     | map(. + {_nr: is_stale(.last_observed_at; bucket_semantic(.kind; $DP); $today)})
     | map(. + {_ra: (if ._nr then "hypothesis" else "current" end)})
     | sort_by([ (if has_val($topics_in_focus; (.topic // "")) then 0 else 1 end),
                 neg_epoch(.last_observed_at), .fact_id ])
     | .[0:$caps.facts_cap]
     | map({fact_id, kind, topic: (.topic // null), claim,
            skill_level: (.skill_level // null), proficiency_state: (.proficiency_state // null),
            confidence, observation_type, last_observed_at: (.last_observed_at // null),
            needs_reconfirmation: ._nr, read_as: ._ra,
            source_sessions: (.source_sessions // [])})) as $FACTS
| ([ ($P.procedural_facts // [])[] | select(.status == "active") ]
     | map(. + {_ra: (if is_stale(.last_observed_at; $DP.procedural_fact_days; $today)
                      then "hypothesis" else "current" end)})) as $PF
| ([ $PF[] | select(.outcome == "backfired") ]
     | sort_by([ neg_epoch(.last_observed_at), .fact_id ])
     | .[0:$caps.avoid_cap] | map(proc_item)) as $AVOID
| ([ $PF[] | select((.retired // false) != true)
           | select(.outcome == "unlocked" or .outcome == "partial")
           | select(has_val($topics_in_focus; (.target_topic // ""))) ]
     | sort_by([ (if .outcome == "unlocked" then 0 else 1 end),
                 neg_epoch(.last_observed_at), .fact_id ])
     | .[0:$caps.do_cap] | map(proc_item)) as $DO
| (([ ($P.pending_followups // [])[] | select(.state == "open")
        | {text, created_in_session, origin_field: (.origin_field // null)} ] + $followups_raw)
     | to_entries | map(.value + {_o: .key})
     | group_by(.text) | map(sort_by(._o) | .[0])
     | sort_by([.created_in_session, ._o])
     | .[0:$caps.followup_cap]
     | map({text, created_in_session, origin_field})) as $FUP
| ([ $errors[] | .kind ]) as $EK
| (if $first_session then "first_session"
   elif (($EK | index("index_missing")) != null or ($EK | index("index_unparseable")) != null
         or ($EK | index("index_stale")) != null or ($EK | index("profile_unparseable")) != null
         or ($EK | index("session_unparseable")) != null or ($EK | index("internal_error")) != null)
     then "degraded"
   elif (($FIN | length) >= 5
         or ((($P.semantic_facts // []) + ($P.procedural_facts // []))
             | map(select(.status == "active")) | length) >= 1)
     then "warm"
   else "warming_up" end) as $MS
| {
    schema_version: $sv,
    generated_at: $now,
    for_session_id: $FOR,
    memory_state: $MS,
    topics_in_focus: $topics_in_focus,
    topics_source: $topics_source,
    full_detail_available: {
      session_count: ($E | length),
      date_range: [ (if ($E | length) == 0 then null else ($E | map(.date) | min) end),
                    (if ($E | length) == 0 then null else ($E | map(.date) | max) end) ],
      index_file: "memory/INDEX.json",
      raw_file_pattern: "memory/NNNN.json",
      sessions_not_in_recent: (($E | length) - ($RECENT | length)),
      top_tags: ([ $E[] | (.topics // [])[] ] | group_by(.)
                 | map({tag: .[0], count: length}) | sort_by([(0 - .count), .tag])
                 | .[0:$caps.top_tags]),
      how_to_open: "Filtre memory/INDEX.json por topics, skills_touched, flags ou date e abra apenas os memory/NNNN.json correspondentes."
    },
    student: ($P.student // null),
    recent_sessions: $RECENT,
    recent_affect: $AFFECT,
    student_profile: { facts: $FACTS },
    procedural_playbook: { do: $DO, avoid: $AVOID },
    orphan_sessions: ($ORPH | map({session_id, date,
                                   one_line_summary: (.one_line_summary // ""),
                                   topics: (.topics // []),
                                   days_ago: days_since(.date; $today)})),
    pending_followups: $FUP,
    truncated: false,
    truncated_fields: [],
    budget_exceeded: false,
    errors: $errors
  }
'

build_digest() {
  jq -n "$SM_BUILD_JQ" \
    --arg sv "$SM_DIGEST_SCHEMA_VERSION" \
    --arg now "$NOW" \
    --arg today "$TODAY" \
    --argjson entries "$ENTRIES" \
    --argjson profile "$PROFILE_JSON" \
    --argjson errors "$ERRORS" \
    --argjson topics_in_focus "$TOPICS_IN_FOCUS" \
    --arg topics_source "$TOPICS_SOURCE" \
    --argjson followups_raw "$FOLLOWUPS_RAW" \
    --argjson first_session "$FIRST_SESSION" \
    --argjson caps "$CAPS"
}

DIGEST=""
if ! DIGEST="$(build_digest 2>/dev/null)"; then
  # Falha interna nunca impede a aula: digest mínimo, de forma idêntica, exit 0.
  ENTRIES='[]'; TOPICS_IN_FOCUS='[]'; FOLLOWUPS_RAW='[]'; PROFILE_JSON='null'
  add_error '{"kind":"internal_error"}'
  DIGEST="$(build_digest)" || { sm_log error "falha irrecuperável ao montar o digest"; exit 1; }
fi

# --- passo 14: escada de truncamento T1..T5 ----------------------------------
# NUNCA truncados: pending_followups, procedural_playbook.avoid, orphan_sessions,
# full_detail_available e o cabeçalho. A escada corta o resto primeiro.
serialized_len() { printf '%s\n' "$1" | jq -Rs 'length'; }

TF_LIST=()
tf_json() {
  if [ "${#TF_LIST[@]}" -eq 0 ]; then printf '[]'
  else printf '%s\n' "${TF_LIST[@]}" | jq -Rsc \
    'split("\n") | map(select(. != ""))
     | reduce .[] as $x ([]; if (index($x) == null) then . + [$x] else . end)'
  fi
}

apply_step() { # <passo> ; lê $DIGEST e $(tf_json); escreve o novo digest em stdout
  local step="$1" tf; tf="$(tf_json)"
  printf '%s' "$DIGEST" | jq --argjson tf "$tf" --argjson cut_at "$SM_TEXT_CUT" "
    def cut(\$s): if (\$s | type) == \"string\" and ((\$s | length) > \$cut_at)
                  then ((\$s | .[0:(\$cut_at - 1)]) + \"…\") else \$s end;
    $(case "$step" in
        T1) printf '%s' 'if ((.recent_sessions | length) > 2) then .recent_sessions |= .[1:] else . end' ;;
        T2) printf '%s' '([ .procedural_playbook.do[] | select(.outcome == "partial") ]
                          | sort_by([ (if (.last_observed_at // "") == "" then "" else .last_observed_at end), .fact_id ])
                          | .[0:1] | map(.fact_id)) as $victim
                         | if ($victim | length) > 0
                           then .procedural_playbook.do |= map(select(.fact_id != $victim[0]))
                           else . end' ;;
        T3) printf '%s' '([ .student_profile.facts[] | select(.read_as == "hypothesis") ]
                          | sort_by([ (if (.last_observed_at // "") == "" then "" else .last_observed_at end), .fact_id ])
                          | .[0:1] | map(.fact_id)) as $victim
                         | if ($victim | length) > 0
                           then .student_profile.facts |= map(select(.fact_id != $victim[0]))
                           else . end' ;;
        T4) printf '%s' '([ .student_profile.facts[] | select(.confidence == "low") ]
                          | sort_by([ (if (.last_observed_at // "") == "" then "" else .last_observed_at end), .fact_id ])
                          | .[0:1] | map(.fact_id)) as $victim
                         | if ($victim | length) > 0
                           then .student_profile.facts |= map(select(.fact_id != $victim[0]))
                           else . end' ;;
        T5) printf '%s' '.student_profile.facts |= map(.claim = cut(.claim))
                         | .procedural_playbook.do |= map(.how = cut(.how) | .mapping = cut(.mapping) | .known_limit = cut(.known_limit))
                         | .recent_sessions |= map(.one_line_summary = cut(.one_line_summary))' ;;
      esac)
    | .truncated_fields = \$tf
    | .truncated = ((\$tf | length) > 0)
    | .full_detail_available.sessions_not_in_recent = (.full_detail_available.session_count - (.recent_sessions | length))
  "
}

step_label() {
  case "$1" in
    T1) printf 'recent_sessions' ;;
    T2) printf 'procedural_playbook.do' ;;
    T3|T4) printf 'student_profile.facts' ;;
    T5) printf 'text_fields' ;;
  esac
}

LEN="$(serialized_len "$DIGEST")"
if [ "$LEN" -gt "$SM_BUDGET_CHARS" ]; then
  for step in T1 T2 T3 T4 T5; do
    while [ "$LEN" -gt "$SM_BUDGET_CHARS" ]; do
      TF_LIST+=("$(step_label "$step")")
      NEW="$(apply_step "$step")" || { TF_LIST=("${TF_LIST[@]:0:$(( ${#TF_LIST[@]} - 1 ))}"); break; }
      if [ "$(printf '%s' "$NEW" | jq -cS 'del(.truncated, .truncated_fields)')" \
         = "$(printf '%s' "$DIGEST" | jq -cS 'del(.truncated, .truncated_fields)')" ]; then
        # passo esgotado: não mudou nada. Desfaz o rótulo e vai para o próximo.
        TF_LIST=("${TF_LIST[@]:0:$(( ${#TF_LIST[@]} - 1 ))}")
        break
      fi
      DIGEST="$NEW"
      LEN="$(serialized_len "$DIGEST")"
    done
    [ "$LEN" -gt "$SM_BUDGET_CHARS" ] || break
  done
  if [ "$LEN" -gt "$SM_BUDGET_CHARS" ]; then
    DIGEST="$(printf '%s' "$DIGEST" | jq '.budget_exceeded = true')"
  fi
fi

# --- passo 15 ----------------------------------------------------------------
printf '%s\n' "$DIGEST" || exit 1
exit 0
