#!/usr/bin/env bash
# =============================================================================
# memory-compact.sh — consolidação da memória de longo prazo (profile.json)
#
# Contratos: docs/00-contratos.md §5 (exit codes), §6 (REQUEST/APPLY), §7 (lib/),
# §8 (CLI). Especificação: docs/03-memoria.md §4 (gatilho e algoritmo).
#
# O bookkeeping é determinístico; consolidar fatos em prosa e nomear a claim_key
# é julgamento. Por isso o script roda até onde é determinístico, emite o PEDIDO
# em stdout e sai com **exit 10 sem tocar em disco** (RA-1). O modelo devolve a
# RESPOSTA e re-invoca com `--apply <resposta.json>`: aí sim o script valida
# contra schema e escreve, atomicamente.
#
# Regras duras implementadas aqui:
#   * a compactação lê SÓ os brutos — do perfil, apenas claim_key e next_fact_seq
#   * fato nunca é sobrescrito: o antigo vira superseded + superseded_by
#   * mesma afirmação = reconfirmação (nem cria fato novo, nem supersede)
#   * sessões `abandoned` entram, mas fato sustentado só por elas trava em `low`
#   * claim_key da resposta tem de casar ^[a-z][a-z0-9_]{1,62}$ — senão, rejeita
# =============================================================================
set -euo pipefail
export LC_ALL=C

SM_HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh disable=SC1091
. "$SM_HERE/lib/common.sh"
# shellcheck source=lib/json.sh disable=SC1091
. "$SM_HERE/lib/json.sh"

SM_PROFILE_SCHEMA_VERSION="1.0"
SM_REQUEST_SCHEMA_VERSION="1.0"
SM_KIND="compact_facts"                 # `kind` do envelope (docs/00 §6.1/§6.4)
SM_REQUEST_KIND="memory_compact"        # `request_kind` do corpo (schema)
SM_RESPONSE_SCHEMA_URN="urn:study-method:schema:memory-compact-response:1"
SM_TRIGGER_DEFAULT=15
SM_TOP_ELIGIBLE=5
SM_CLAIM_KEY_RE='^[a-z][a-z0-9_]{1,62}$'
SM_INSTRUCTIONS="Consolide cada grupo em UMA afirmacao falsificavel, em prosa pt-BR, sem inventar alem da evidencia das sessoes brutas. Reuse a claim_key exata de existing_claim_keys quando a afirmacao for sobre a mesma coisa; chave nova para a mesma coisa faz os dois fatos coexistirem. claim_key em snake_case ASCII: ^[a-z][a-z0-9_]{1,62}$. Copie a evidencia da sessao de origem, nao a reescreva. Listas vazias sao resposta legitima."

usage() {
  cat <<'EOF'
uso: memory-compact.sh <setup_root> [--if-due] [--force] [--apply <resposta.json>]

Consolida as sessões não compactadas em memory/profile.json, via REQUEST/APPLY.

  <setup_root>        raiz do setup (posicional; sem ele, resolve a partir de $PWD)
  --if-due            só age se o gatilho estiver atingido (default 15 sessões
                      não compactadas, configurável em profile.compaction)
  --force             compacta mesmo abaixo do limiar
  --apply <arquivo>   aplica a RESPOSTA do modelo (valida antes de escrever)
  -h, --help          esta ajuda

stdout: fase PEDIDO  -> o envelope JSON do pedido (exit 10, nada escrito em disco)
        fase APPLY   -> {"sessions_compacted":N,"facts_created":N,
                         "facts_superseded":N,"facts_reconfirmed":N}
exit:   0 ok (inclusive "nada a fazer") · 1 erro de execução · 2 uso incorreto
        3 setup não encontrado · 5 validação de schema falhou · 10 needs_model_input
EOF
}

SETUP_HINT=""
IF_DUE=0
FORCE=0
APPLY_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --if-due) IF_DUE=1 ;;
    --force)  FORCE=1 ;;
    --apply)  [ $# -ge 2 ] || { usage >&2; sm_die 2 "--apply exige um arquivo"; }; APPLY_FILE="$2"; shift ;;
    --apply=*) APPLY_FILE="${1#*=}" ;;
    --) shift; break ;;
    -*) usage >&2; sm_die 2 "flag desconhecida: $1" ;;
    *)
      if [ -z "$SETUP_HINT" ]; then SETUP_HINT="$1"
      else usage >&2; sm_die 2 "argumento posicional extra: $1"; fi ;;
  esac
  shift
done

sm_require_cmd jq sha256sum || sm_die 1 "dependência ausente (jq, coreutils)"

SM_SETUP_ROOT=""
rc=0
SM_SETUP_ROOT="$(sm_setup_root "$SETUP_HINT")" || rc=$?
if [ "$rc" -ne 0 ] || [ -z "$SM_SETUP_ROOT" ]; then
  sm_die 3 "nenhum setup.json legível a partir de '${SETUP_HINT:-$PWD}'"
fi

MEM="$SM_SETUP_ROOT/memory"
INDEX="$MEM/INDEX.json"
PROFILE="$MEM/profile.json"
SCHEMA_DIR="$SM_HERE/../assets/schemas"
REQ_SCHEMA="$SCHEMA_DIR/requests/memory-compact.request.schema.json"
RESP_SCHEMA="$SCHEMA_DIR/requests/memory-compact.response.schema.json"

emit_summary() { # <compacted> <created> <superseded> <reconfirmed>
  jq -n --argjson a "$1" --argjson b "$2" --argjson c "$3" --argjson d "$4" \
    '{sessions_compacted:$a, facts_created:$b, facts_superseded:$c, facts_reconfirmed:$d}'
}

# =============================================================================
# Fase determinística: tudo abaixo é função pura do que está em disco.
# =============================================================================
[ -d "$MEM" ] || { sm_log info "memory/ não existe — nada a compactar"; emit_summary 0 0 0 0; exit 0; }

if [ ! -f "$INDEX" ] || ! jq -e 'type == "object" and (.sessions | type) == "array"' -- "$INDEX" >/dev/null 2>&1; then
  # Sem índice não há como saber o que já foi compactado — e assumir "nada foi"
  # re-consolidaria fatos já consolidados. Recusa em vez de duplicar a cadeia.
  if [ "$IF_DUE" -eq 1 ]; then
    sm_log warn "memory/INDEX.json ausente ou ilegível — compactação adiada; rode memory-index.sh --verify"
    emit_summary 0 0 0 0
    exit 0
  fi
  sm_die 1 "memory/INDEX.json ausente ou ilegível — rode memory-index.sh --verify antes de compactar"
fi

INDEX_JSON="$(jq -c '.' -- "$INDEX")"
PROFILE_JSON='null'
if [ -f "$PROFILE" ]; then
  jq -e 'type == "object"' -- "$PROFILE" >/dev/null 2>&1 \
    || sm_die 5 "memory/profile.json não parseia — recuse-se a sobrescrever memória de longo prazo"
  PROFILE_JSON="$(jq -c '.' -- "$PROFILE")"
fi

SETUP_ID="$(jq -r '.setup_id // ""' -- "$SM_SETUP_ROOT/setup.json" 2>/dev/null || true)"
case "$SETUP_ID" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) : ;;
  *) sm_die 5 "setup.json sem setup_id válido (^[0-9a-f]{12}$)" ;;
esac

TRIGGER="$(printf '%s' "$PROFILE_JSON" | jq -r --argjson d "$SM_TRIGGER_DEFAULT" \
  '(.compaction.trigger_uncompacted_sessions // $d) | tostring')"
case "$TRIGGER" in ''|*[!0-9]*) TRIGGER="$SM_TRIGGER_DEFAULT" ;; esac

# --- passo 1: S = sessões não compactadas, completed|abandoned, asc ----------
S_IDS_JSON="$(printf '%s' "$INDEX_JSON" | jq -c \
  '[ .sessions[]
     | select((.compacted_at // null) == null)
     | select(.status == "completed" or .status == "abandoned")
     | .session_id ] | sort')"
S_COUNT="$(printf '%s' "$S_IDS_JSON" | jq 'length')"

# mapa session_id -> {date, status} de TODAS as entradas (datas e teto de confiança)
SMAP="$(printf '%s' "$INDEX_JSON" | jq -c \
  '[ .sessions[] | {key: .session_id, value: {date: .date, status: .status}} ] | from_entries')"

# --- passo 2: ler SÓ os brutos das sessões de S ------------------------------
build_sessions_payload() {
  local ids=() id f
  while IFS= read -r id; do [ -n "$id" ] && ids+=("$id"); done < <(printf '%s' "$S_IDS_JSON" | jq -r '.[]')
  local acc='[]'
  for id in "${ids[@]:-}"; do
    [ -n "$id" ] || continue
    f="$MEM/$id.json"
    if [ ! -f "$f" ] || ! jq -e 'type == "object"' -- "$f" >/dev/null 2>&1; then
      sm_log warn "bruto de $id ausente ou ilegível — sessão fora desta compactação"
      continue
    fi
    acc="$(jq -c --argjson acc "$acc" '
      $acc + [ {
        session_id: .session_id,
        date: .date,
        status: .status,
        topics: (.topics // []),
        one_line_summary: (.one_line_summary // null),
        affect: (.affect // null),
        what_worked: (.what_worked // null),
        what_didnt_work: (.what_didnt_work // null),
        skills_observed: [ (.skills_observed // [])[]
          | select(type == "object" and (.skill | type) == "string")
          | {skill, level: (.level // null), confidence: (.confidence // null),
             evidence: (.evidence // null), observation_type: (.observation_type // null),
             proficiency_state: (.proficiency_state // null)} ],
        how_it_happened: [ (.how_it_happened // [])[]
          | select(type == "object" and (.move_type | type) == "string"
                   and (.description | type) == "string" and (.outcome | type) == "string")
          | {move_type, description, target_topic: (.target_topic // null), outcome,
             evidence: (.evidence // null), hint_level: (.hint_level // null),
             observation_type: (.observation_type // null)} ],
        open_questions: [ (.open_questions // [])[] | select(type == "string") ],
        next_steps: [ (.next_steps // [])[] | select(type == "string") ]
      } ]' -- "$f")"
  done
  printf '%s' "$acc"
}

build_payload() { # -> corpo do PEDIDO (sem generated_at: função pura do disco)
  local sessions="$1"
  jq -n \
    --arg sv "$SM_REQUEST_SCHEMA_VERSION" \
    --arg rk "$SM_REQUEST_KIND" \
    --arg sid "$SETUP_ID" \
    --argjson profile "$PROFILE_JSON" \
    --argjson sessions "$sessions" \
    '{
       schema_version: $sv,
       request_kind: $rk,
       setup_id: $sid,
       next_fact_seq: (($profile.next_fact_seq // 1)),
       existing_claim_keys: ([ (($profile.semantic_facts // []) + ($profile.procedural_facts // []))[]
                               | select(.status == "active") | .claim_key ] | unique),
       sessions: $sessions
     }'
}

request_id_of() { # <payload-json> -> 12 hex do sha256 do payload canônico
  printf '%s' "$1" | jq -cS '.' | tr -d '\n' | sha256sum | cut -c1-12
}
request_id_of_nl() { # idem, com a quebra de linha final (variante tolerada)
  printf '%s' "$1" | jq -cS '.' | sha256sum | cut -c1-12
}

# =============================================================================
# Fase APPLY
# =============================================================================
if [ -n "$APPLY_FILE" ]; then
  [ -f "$APPLY_FILE" ] || sm_die 2 "arquivo de resposta não encontrado: $APPLY_FILE"
  jq -e 'type == "object"' -- "$APPLY_FILE" >/dev/null 2>&1 \
    || sm_die 2 "arquivo de resposta ilegível (não é um objeto JSON): $APPLY_FILE"

  SESSIONS_PAYLOAD="$(build_sessions_payload)"
  PAYLOAD="$(build_payload "$SESSIONS_PAYLOAD")"
  EXPECTED_RID="$(request_id_of "$PAYLOAD")"
  EXPECTED_RID_NL="$(request_id_of_nl "$PAYLOAD")"

  RESPONSE=""
  if jq -e '.protocol == "study-method/request-apply"' -- "$APPLY_FILE" >/dev/null 2>&1; then
    # RA-2: a resposta veio no envelope do §6.2 — confere kind e request_id.
    got_kind="$(jq -r '.kind // ""' -- "$APPLY_FILE")"
    [ "$got_kind" = "$SM_KIND" ] || sm_die 5 "kind da resposta ('$got_kind') != '$SM_KIND'"
    got_rid="$(jq -r '.request_id // ""' -- "$APPLY_FILE")"
    if [ -n "$got_rid" ] && [ "$got_rid" != "$EXPECTED_RID" ] && [ "$got_rid" != "$EXPECTED_RID_NL" ]; then
      sm_die 5 "request_id divergente (resposta=$got_rid, estado atual=$EXPECTED_RID): o estado em disco mudou entre o PEDIDO e o --apply"
    fi
    items=""
    set +e
    items="$(sm_apply_read "$APPLY_FILE" "$SM_KIND" "$EXPECTED_RID")"
    ar=$?
    set -e
    [ "$ar" -eq 0 ] || sm_die 5 "sm_apply_read recusou a resposta (código $ar)"
    if [ -z "$items" ] || ! printf '%s' "$items" | jq -e 'type == "array"' >/dev/null 2>&1; then
      items="$(jq -c '.items // []' -- "$APPLY_FILE")"
    fi
    n="$(printf '%s' "$items" | jq 'length')"
    [ "$n" = "1" ] || sm_die 5 "a resposta precisa ter exatamente 1 item conforme o response_schema (veio $n)"
    RESPONSE="$(printf '%s' "$items" | jq -c '.[0]')"
  else
    # Forma nua: o arquivo é o próprio objeto do memory-compact.response.schema.
    RESPONSE="$(jq -c '.' -- "$APPLY_FILE")"
  fi

  # --- RA-3: valida a RESPOSTA contra o response_schema antes de escrever ----
  CHECK="$MEM/.compact-response.check.$$"
  printf '%s\n' "$RESPONSE" > "$CHECK" || sm_die 1 "falha ao escrever verificação temporária"
  if ! sm_json_validate "$CHECK" "$RESP_SCHEMA"; then
    rm -f -- "$CHECK"
    sm_die 5 "a resposta não valida contra memory-compact.response.schema.json"
  fi
  rm -f -- "$CHECK"

  got_rk="$(printf '%s' "$RESPONSE" | jq -r '.request_kind // ""')"
  [ "$got_rk" = "$SM_REQUEST_KIND" ] || sm_die 5 "request_kind da resposta ('$got_rk') != '$SM_REQUEST_KIND'"

  # --- claim_key: gramática nova, junção com _, sem dois-pontos -------------
  while IFS= read -r ck; do
    [ -n "$ck" ] || continue
    [[ "$ck" =~ $SM_CLAIM_KEY_RE ]] || sm_die 5 "claim_key inválida: '$ck' (esperado $SM_CLAIM_KEY_RE)"
  done < <(printf '%s' "$RESPONSE" | jq -r '[ (.semantic_facts // [])[], (.procedural_facts // [])[] ] | .[].claim_key // empty')

  # --- source_sessions ⊆ S (o schema exige; e é a checagem de estado real) --
  BAD_SRC="$(jq -rn --argjson r "$RESPONSE" --argjson s "$S_IDS_JSON" \
    '[ ((($r.semantic_facts // []) + ($r.procedural_facts // []))[] | (.source_sessions // [])[]),
       (($r.pending_followups // [])[] | .created_in_session) ]
     | unique | map(select((. as $x | $s | index($x)) == null)) | join(",")')"
  [ -z "$BAD_SRC" ] || sm_die 5 "a resposta cita sessões que não estavam no pedido: $BAD_SRC"

  [ "$S_COUNT" -gt 0 ] || { sm_log warn "nenhuma sessão a compactar — nada aplicado"; emit_summary 0 0 0 0; exit 0; }

  NOW="$(sm_now_iso)"
  TODAY="$(sm_today)"

  RESULT="$(jq -n \
    --argjson profile "$PROFILE_JSON" \
    --argjson response "$RESPONSE" \
    --argjson smap "$SMAP" \
    --argjson srcs "$S_IDS_JSON" \
    --arg now "$NOW" \
    --arg today "$TODAY" \
    --arg sv "$SM_PROFILE_SCHEMA_VERSION" \
    --argjson trigger "$TRIGGER" \
    --argjson topn "$SM_TOP_ELIGIBLE" \
    '
    def has_val($lst; $v): (($lst // []) | index($v)) != null;
    def rank_of: if . == "high" then 2 elif . == "medium" then 1 else 0 end;
    def of_rank: if . >= 2 then "high" elif . >= 1 then "medium" else "low" end;
    def newid($n): "f-" + (("0000" + ($n | tostring)) | .[-4:]);
    def dates_of($ss; $m): [ $ss[] | ($m[.].date // null) ] | map(select(. != null)) | sort;
    # docs/03 §4.2 passo 6 + §7.3 item 7: 1 sessão distinta=low, 2=medium, 3+=high;
    # `inferred` não nasce high; só-abandoned trava em low; sem evidência, low.
    # Quem calcula é o SCRIPT (docs/00 §6.4): o `confidence` da resposta é
    # advisório e NÃO entra na conta — senão a memória herdaria a cautela ou o
    # otimismo do modelo do dia, e a regra deixaria de ser determinística.
    def conf($ss; $obs; $ev; $m):
      ( ($ss | unique | length) as $n
      | (if $n >= 3 then 2 elif $n == 2 then 1 else 0 end) as $base
      | (if $obs == "inferred" then 1 else 2 end) as $c1
      | (if ([ $ss[] | select(($m[.].status // "completed") != "abandoned") ] | length) == 0 then 0 else 2 end) as $c2
      | (if ($ev == null or $ev == "") then 0 else 2 end) as $c3
      | ([$base, $c1, $c2, $c3] | min)
      | of_rank );

    ($profile // {}) as $P
    | ($P.semantic_facts // []) as $SEM0
    | ($P.procedural_facts // []) as $PROC0
    | ($P.next_fact_seq // 1) as $SEQ0
    | reduce ($response.semantic_facts // [])[] as $f
        ({sem: $SEM0, proc: $PROC0, seq: $SEQ0, created: 0, superseded: 0, reconfirmed: 0};
         . as $acc
         | ($f.source_sessions | unique) as $ss
         | (dates_of($ss; $smap)) as $ds
         | (($f.observed_at // ($ds | first)) // $today) as $oat
         | (($f.last_observed_at // ($ds | last)) // $today) as $loat
         | ([ $acc.sem[] | select(.status == "active" and .claim_key == $f.claim_key) ] | first) as $old
         | if $old == null then
             (newid($acc.seq)) as $id
             | $acc
             | .sem = (.sem + [{
                 fact_id: $id, claim_key: $f.claim_key, kind: $f.kind, topic: ($f.topic // null),
                 claim: $f.claim, observation_type: $f.observation_type,
                 confidence: conf($ss; $f.observation_type; ($f.evidence // null); $smap),
                 observed_at: $oat, recorded_at: $now, last_observed_at: $loat,
                 status: "active", superseded_by: null, supersedes: null,
                 source_sessions: $ss, evidence: ($f.evidence // null),
                 skill_level: ($f.skill_level // null), proficiency_state: ($f.proficiency_state // null)}])
             | .seq = (.seq + 1) | .created = (.created + 1)
           elif ($old.claim == $f.claim) then
             (($old.source_sessions // []) + $ss | unique) as $merged
             | $acc
             | .sem = (.sem | map(if .fact_id == $old.fact_id
                 then .last_observed_at = ([.last_observed_at, $loat] | max)
                    | .source_sessions = $merged
                    | .confidence = conf($merged; .observation_type; (.evidence // null); $smap)
                 else . end))
             | .reconfirmed = (.reconfirmed + 1)
           else
             (newid($acc.seq)) as $id
             | $acc
             | .sem = (.sem | map(if .fact_id == $old.fact_id
                 then .status = "superseded" | .superseded_by = $id else . end))
             | .sem = (.sem + [{
                 fact_id: $id, claim_key: $f.claim_key, kind: $f.kind, topic: ($f.topic // null),
                 claim: $f.claim, observation_type: $f.observation_type,
                 confidence: conf($ss; $f.observation_type; ($f.evidence // null); $smap),
                 observed_at: $oat, recorded_at: $now, last_observed_at: $loat,
                 status: "active", superseded_by: null, supersedes: $old.fact_id,
                 source_sessions: $ss, evidence: ($f.evidence // null),
                 skill_level: ($f.skill_level // null), proficiency_state: ($f.proficiency_state // null)}])
             | .seq = (.seq + 1) | .created = (.created + 1) | .superseded = (.superseded + 1)
           end)
    | reduce ($response.procedural_facts // [])[] as $f
        (.;
         . as $acc
         | ($f.source_sessions | unique) as $ss
         | (dates_of($ss; $smap)) as $ds
         | (($f.observed_at // ($ds | first)) // $today) as $oat
         | (($f.last_observed_at // ($ds | last)) // $today) as $loat
         | ([ $acc.proc[] | select(.status == "active" and .claim_key == $f.claim_key) ] | first) as $old
         | if $old == null then
             (newid($acc.seq)) as $id
             | $acc
             | .proc = (.proc + [{
                 fact_id: $id, claim_key: $f.claim_key, procedure_kind: $f.procedure_kind,
                 target_topic: ($f.target_topic // null), how: $f.how,
                 base_domain: ($f.base_domain // null), mapping: ($f.mapping // null),
                 known_limit: ($f.known_limit // null), validated: null, retired: null,
                 outcome: $f.outcome, times_observed: (($f.times_observed // ($ss | length))),
                 observation_type: $f.observation_type,
                 confidence: conf($ss; $f.observation_type; ($f.evidence // null); $smap),
                 observed_at: $oat, recorded_at: $now, last_observed_at: $loat,
                 status: "active", superseded_by: null, supersedes: null,
                 source_sessions: $ss, evidence: ($f.evidence // null)}])
             | .seq = (.seq + 1) | .created = (.created + 1)
           elif ($old.how == $f.how) then
             (($old.source_sessions // []) + $ss | unique) as $merged
             | $acc
             | .proc = (.proc | map(if .fact_id == $old.fact_id
                 then .last_observed_at = ([.last_observed_at, $loat] | max)
                    | .source_sessions = $merged
                    | .times_observed = ($merged | length)
                    | .confidence = conf($merged; .observation_type; (.evidence // null); $smap)
                 else . end))
             | .reconfirmed = (.reconfirmed + 1)
           else
             (newid($acc.seq)) as $id
             | $acc
             | .proc = (.proc | map(if .fact_id == $old.fact_id
                 then .status = "superseded" | .superseded_by = $id else . end))
             | .proc = (.proc + [{
                 fact_id: $id, claim_key: $f.claim_key, procedure_kind: $f.procedure_kind,
                 target_topic: ($f.target_topic // null), how: $f.how,
                 base_domain: ($f.base_domain // null), mapping: ($f.mapping // null),
                 known_limit: ($f.known_limit // null), validated: null, retired: null,
                 outcome: $f.outcome, times_observed: (($f.times_observed // ($ss | length))),
                 observation_type: $f.observation_type,
                 confidence: conf($ss; $f.observation_type; ($f.evidence // null); $smap),
                 observed_at: $oat, recorded_at: $now, last_observed_at: $loat,
                 status: "active", superseded_by: null, supersedes: $old.fact_id,
                 source_sessions: $ss, evidence: ($f.evidence // null)}])
             | .seq = (.seq + 1) | .created = (.created + 1) | .superseded = (.superseded + 1)
           end)
    | . as $A
    | ($P.pending_followups // []) as $FU0
    | ([ $FU0[] | .text ]) as $seen
    | ($FU0 + [ ($response.pending_followups // [])[]
                | select(has_val($seen; .text) | not)
                | {text: .text, created_in_session: .created_in_session, state: "open",
                   closed_in_session: null, origin_field: (.origin_field // null)} ]) as $FU
    | {
        profile: ({
          schema_version: $sv,
          updated_at: $now
        }
        + (if ($P.student | type) == "object" then {student: $P.student} else {} end)
        + {
          decay_policy: {
            skill_fact_days: (($P.decay_policy.skill_fact_days) // 60),
            procedural_fact_days: (($P.decay_policy.procedural_fact_days) // 180),
            preference_fact_days: (($P.decay_policy.preference_fact_days) // 180)
          },
          compaction: {
            trigger_uncompacted_sessions: $trigger,
            last_compacted_at: $now,
            last_compacted_session_id: ($srcs | max),
            compaction_count: ((($P.compaction.compaction_count) // 0) + 1)
          },
          next_fact_seq: $A.seq,
          semantic_facts: $A.sem,
          procedural_facts: $A.proc,
          pending_followups: $FU
        }),
        stats: {sessions_compacted: ($srcs | length), facts_created: $A.created,
                facts_superseded: $A.superseded, facts_reconfirmed: $A.reconfirmed}
      }
    ')" || sm_die 1 "falha ao consolidar o perfil"

  NEW_PROFILE="$(printf '%s' "$RESULT" | jq '.profile')"
  CHECK="$MEM/.profile.json.check.$$"
  printf '%s\n' "$NEW_PROFILE" > "$CHECK" || sm_die 1 "falha ao escrever verificação temporária"
  if ! sm_json_validate "$CHECK" "$SCHEMA_DIR/profile.schema.json"; then
    rm -f -- "$CHECK"
    sm_die 5 "o profile.json produzido não valida contra profile.schema.json"
  fi
  rm -f -- "$CHECK"

  # §4.2 passo 8: perfil e índice são um só passo, ou nenhum. O perfil primeiro:
  # se ele falhar, o índice NÃO é marcado como compactado.
  printf '%s\n' "$NEW_PROFILE" | sm_atomic_write "$PROFILE" || sm_die 1 "falha ao gravar $PROFILE"

  TODAY_MARK="$TODAY"
  NEW_INDEX="$(printf '%s' "$INDEX_JSON" | jq \
    --argjson s "$S_IDS_JSON" --arg d "$TODAY_MARK" --arg now "$(sm_now_iso)" --argjson topn "$SM_TOP_ELIGIBLE" \
    '(.sessions | map(.session_id) | sort | reverse | .[0:$topn]) as $top
     | .updated_at = $now
     | .sessions |= map(
         . as $e
         | if (($s | index($e.session_id)) != null)
           then .compacted_at = $d
              | .digest_eligible = (($top | index($e.session_id)) != null)
           else . end)')" || sm_die 1 "falha ao marcar o índice"
  printf '%s\n' "$NEW_INDEX" | sm_atomic_write "$INDEX" || sm_die 1 "falha ao gravar $INDEX"

  printf '%s' "$RESULT" | jq '.stats'
  exit 0
fi

# =============================================================================
# Fase PEDIDO — RA-1: nada é escrito em disco daqui até o exit 10.
# =============================================================================
if [ "$S_COUNT" -eq 0 ]; then
  sm_log info "nenhuma sessão não compactada — nada a fazer"
  emit_summary 0 0 0 0
  exit 0
fi
if [ "$FORCE" -eq 0 ] && [ "$IF_DUE" -eq 1 ] && [ "$S_COUNT" -lt "$TRIGGER" ]; then
  sm_log info "gatilho não atingido ($S_COUNT < $TRIGGER) — nada a fazer"
  emit_summary 0 0 0 0
  exit 0
fi

SESSIONS_PAYLOAD="$(build_sessions_payload)"
if [ "$(printf '%s' "$SESSIONS_PAYLOAD" | jq 'length')" -eq 0 ]; then
  sm_log warn "nenhum bruto legível entre as sessões não compactadas — nada a pedir"
  emit_summary 0 0 0 0
  exit 0
fi

PAYLOAD="$(build_payload "$SESSIONS_PAYLOAD")"
RID="$(request_id_of "$PAYLOAD")"
NOW="$(sm_now_iso)"

# O corpo do pedido validado contra o request_schema é o payload MAIS o
# generated_at do envelope (§6.1): `generated_at` não entra no payload porque o
# request_id precisa ser função pura do estado em disco, para o --apply poder
# recalculá-lo (RA-2).
#
# RA-1: a fase de PEDIDO não escreve NADA em disco — nem tmp. A validação usa
# substituição de processo (/dev/fd/N, um pipe), então `sm_json_validate` tem de
# aceitar um caminho de FIFO e ler o arquivo uma única vez.
CHECK_REQ="$(printf '%s' "$PAYLOAD" | jq -c --arg g "$NOW" '. + {generated_at: $g}')"
sm_json_validate <(printf '%s\n' "$CHECK_REQ") "$REQ_SCHEMA" \
  || sm_die 5 "o PEDIDO produzido não valida contra memory-compact.request.schema.json"

ENVELOPE=""
export SM_SETUP_ROOT   # a assinatura congelada de sm_request não recebe setup_id
set +e
ENVELOPE="$(sm_request "memory-compact.sh" "$SM_KIND" "$SM_RESPONSE_SCHEMA_URN" "$SM_INSTRUCTIONS" "$PAYLOAD")"
set -e
if [ -z "$ENVELOPE" ] || ! printf '%s' "$ENVELOPE" | jq -e 'type == "object"' >/dev/null 2>&1; then
  ENVELOPE="$(jq -n \
    --arg rid "$RID" --arg kind "$SM_KIND" --arg sid "$SETUP_ID" --arg now "$NOW" \
    --arg rs "$SM_RESPONSE_SCHEMA_URN" --arg instr "$SM_INSTRUCTIONS" --argjson payload "$PAYLOAD" \
    '{protocol: "study-method/request-apply", protocol_version: "1.0", request_id: $rid,
      script: "memory-compact.sh", kind: $kind, setup_id: $sid, generated_at: $now,
      response_schema: $rs, instructions_pt_br: $instr, payload: $payload}')"
fi

# RA-7: o exit 10 é sempre acompanhado de um PEDIDO BEM FORMADO. `setup_id` não
# é parâmetro de sm_request (§7.2) e o envelope do §6.1 o exige: completa aqui.
ENVELOPE="$(printf '%s' "$ENVELOPE" | jq --arg sid "$SETUP_ID" --arg rid "$RID" \
  'if ((.setup_id // "") == "") then .setup_id = $sid else . end
   | if ((.request_id // "") == "") then .request_id = $rid else . end')"

printf '%s\n' "$ENVELOPE"
exit 10
