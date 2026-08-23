#!/usr/bin/env bash
# =============================================================================
# memory-index.sh — mantém `memory/INDEX.json` (camada 2 da memória)
#
# Contratos: docs/00-contratos.md §5 (exit codes), §7 (lib/), §8 (CLI), §11.
# Especificação: docs/03-memoria.md §2.1 (tabela de derivação) e §7.3 (órfã).
#
# O índice é DERIVADO: todo campo sai mecanicamente do `memory/NNNN.json`
# correspondente. As duas únicas exceções — `digest_eligible` e `compacted_at` —
# não existem na sessão: são ESTADO DA COMPACTAÇÃO. Voltá-los ao default numa
# reconstrução faz o gatilho de compactação disparar de novo e re-consolidar
# fatos já consolidados, duplicando a cadeia bitemporal a cada reconstrução.
# Por isso são recuperados, nesta ordem de precedência:
#   (1) a entrada correspondente do índice atual (quando legível e sem --rebuild)
#   (2) `profile.compaction.last_compacted_session_id` / `last_compacted_at`
#   (3) os defaults (`true` / `null`)
# =============================================================================
set -euo pipefail
export LC_ALL=C

SM_HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh disable=SC1091
. "$SM_HERE/lib/common.sh"
# shellcheck source=lib/json.sh disable=SC1091
. "$SM_HERE/lib/json.sh"

SM_INDEX_SCHEMA_VERSION="1.0"
SM_TOP_ELIGIBLE=5          # as N sessões de maior session_id nunca perdem digest_eligible
SM_ORPHAN_SUMMARY="Sessão interrompida sem fechamento (recuperada automaticamente)."

usage() {
  cat <<'EOF'
uso: memory-index.sh <setup_root> [--verify] [--rebuild]

Mantém memory/INDEX.json em sincronia com os memory/NNNN.json.

  <setup_root>   raiz do setup (posicional; sem ele, resolve a partir de $PWD)
  --verify       além de sincronizar: detecta índice ausente/ilegível/defasado e
                 RECUPERA sessões órfãs (status in_progress sem lock vivo ->
                 abandoned + finalized_by auto_orphan_recovery, sem perder
                 conteúdo). É o dono ÚNICO da recuperação de órfã.
  --rebuild      descarta o índice atual e o reconstrói do zero a partir dos
                 brutos; o estado de compactação é recuperado do profile.json.
  -h, --help     esta ajuda

stdout: {"sessions":N,"orphans_closed":N,"quarantined":[NNNN...],"rebuilt":bool}
exit:   0 ok · 1 erro de execução · 2 uso incorreto · 3 setup não encontrado
        5 o índice produzido não valida contra index.schema.json
EOF
}

# --- argumentos --------------------------------------------------------------
SETUP_HINT=""
DO_VERIFY=0
DO_REBUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --verify)  DO_VERIFY=1 ;;
    --rebuild) DO_REBUILD=1 ;;
    --) shift; break ;;
    -*) usage >&2; sm_die 2 "flag desconhecida: $1" ;;
    *)
      if [ -z "$SETUP_HINT" ]; then SETUP_HINT="$1"
      else usage >&2; sm_die 2 "argumento posicional extra: $1"; fi ;;
  esac
  shift
done

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
LOCK="$MEM/.session.lock"
SCHEMA_DIR="$SM_HERE/../assets/schemas"

emit_summary() { # <sessions> <orphans> <quarantined-json> <rebuilt-bool>
  jq -n --argjson s "$1" --argjson o "$2" --argjson q "$3" --argjson r "$4" \
    '{sessions:$s, orphans_closed:$o, quarantined:$q, rebuilt:$r}'
}

if [ ! -d "$MEM" ]; then
  sm_log info "memory/ não existe em $SM_SETUP_ROOT — nada a indexar"
  emit_summary 0 0 '[]' false
  exit 0
fi

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

# --- 1. varredura dos brutos + quarentena de ilegível -------------------------
shopt -s nullglob
RAWS=( "$MEM"/[0-9][0-9][0-9][0-9].json )
shopt -u nullglob

QUARANTINED=()
VALID=()

quarantine() { # <arquivo> <session_id> <motivo>
  local f="$1" id="$2" motivo="$3" dest n
  mkdir -p -- "$MEM/broken" || sm_die 1 "não consegui criar $MEM/broken"
  dest="$MEM/broken/$id.json"
  n=1
  while [ -e "$dest" ]; do dest="$MEM/broken/$id.json.$n"; n=$((n + 1)); done
  mv -- "$f" "$dest" || sm_die 1 "não consegui mover $f para quarentena"
  sm_log warn "bruto em quarentena ($motivo): $id -> memory/broken/$(basename -- "$dest")"
  QUARANTINED+=("$id")
}

for f in "${RAWS[@]}"; do
  base="$(basename -- "$f")"
  id="${base%.json}"
  if ! jq -e 'type == "object"' -- "$f" >/dev/null 2>&1; then
    quarantine "$f" "$id" "não parseia"
    continue
  fi
  sid="$(jq -r '.session_id // ""' -- "$f")"
  if [ "$sid" != "$id" ]; then
    # Invariante de docs/03 §2: session_id == nome do arquivo. Sem ela o campo
    # `file` do índice apontaria para outro arquivo. Move, nunca apaga.
    quarantine "$f" "$id" "session_id '$sid' != nome do arquivo"
    continue
  fi
  VALID+=("$f")
done

# --- 2. recuperação de sessão órfã (§7.3) — só com --verify -------------------
ORPHANS_CLOSED=0
# O predicado do lock é UM só, em lib/common.sh (docs/00-contratos.md §7.1 e §7.4).
# Esta função era uma CÓPIA da regra antiga — exigia `pid` numérico e `kill -0` — e por
# isso lia como MORTO todo lock da via (b) (`pid: null`, o caso comum, validado por TTL).
# Consequência medida: `--verify` classificava a sessão EM ANDAMENTO como órfã e a
# fechava como `abandoned` com o aluno no meio da aula. Nunca reimplemente esta regra aqui.
lock_alive_for() { # <session_id> -> 0 se existe lock vivo desta sessão
  sm_session_lock_alive "$LOCK" "$1"
}

if [ "$DO_VERIFY" -eq 1 ]; then
  for f in "${VALID[@]}"; do
    base="$(basename -- "$f")"; id="${base%.json}"
    [ "$(jq -r '.status // ""' -- "$f")" = "in_progress" ] || continue
    if lock_alive_for "$id"; then
      sm_log info "sessão $id está viva (${SM_SESSION_LOCK_REASON}) — não toco"
      continue
    fi
    sm_log debug "sessão $id sem lock vivo (${SM_SESSION_LOCK_REASON}) — recuperando como órfã"
    fin_at="$(date -Iseconds -r "$f")" || sm_die 1 "não consegui ler o mtime de $f"
    novo="$(jq \
      --arg fa "$fin_at" \
      --arg fix "$SM_ORPHAN_SUMMARY" \
      '. as $s
       | .status = "abandoned"
       | .finalized_at = $fa
       | .finalized_by = "auto_orphan_recovery"
       | (if (($s.one_line_summary // "") == ""
              or (($s.one_line_summary // "") | startswith("Sessão em andamento:"))
              or ($s.one_line_summary // "") == "Sessão iniciada, ainda sem resumo.")
          then .one_line_summary = $fix else . end)' -- "$f")" \
      || sm_die 1 "falha ao recuperar a órfã $id"
    printf '%s\n' "$novo" | sm_atomic_write "$f" || sm_die 1 "falha ao gravar $f"
    ORPHANS_CLOSED=$((ORPHANS_CLOSED + 1))
    sm_log info "órfã recuperada: $id -> abandoned (auto_orphan_recovery)"
    if [ -f "$LOCK" ] && [ "$(jq -r '.session_id // ""' -- "$LOCK" 2>/dev/null)" = "$id" ]; then
      rm -f -- "$LOCK"
      sm_log info "lock morto removido: memory/.session.lock"
    fi
  done
fi

# --- 3. derivação mecânica de todas as entradas ------------------------------
if [ "${#VALID[@]}" -gt 0 ]; then
  DERIVED="$(jq -s "$SM_DERIVE_JQ"' map(sm_derive_entry) | sort_by(.session_id)' -- "${VALID[@]}")" \
    || sm_die 1 "falha ao derivar as entradas do índice"
else
  DERIVED='[]'
fi

# --- 4. estado do índice atual: ausente / ilegível / defasado ----------------
INDEX_PRIOR='null'
INDEX_STATE="ok"
if [ ! -f "$INDEX" ]; then
  INDEX_STATE="missing"
elif ! jq -e 'type == "object"' -- "$INDEX" >/dev/null 2>&1; then
  INDEX_STATE="unparseable"
else
  INDEX_PRIOR="$(jq -c '.' -- "$INDEX")"
  iup="$(jq -r '.updated_at // ""' -- "$INDEX")"
  if [ -z "$iup" ]; then
    INDEX_STATE="unparseable"
  else
    iep="$(date -d "$iup" +%s 2>/dev/null || echo "")"
    if [ -z "$iep" ]; then
      INDEX_STATE="unparseable"
    else
      for f in "${VALID[@]}"; do
        mep="$(date -r "$f" +%s)"
        if [ "$mep" -gt "$iep" ]; then INDEX_STATE="stale"; break; fi
      done
    fi
  fi
fi

REBUILT=false
case "$INDEX_STATE" in
  missing|unparseable|stale) REBUILT=true ;;
esac
if [ "$DO_REBUILD" -eq 1 ]; then REBUILT=true; fi

# `--rebuild` e índice ilegível descartam as entradas anteriores; "defasado" NÃO
# descarta: o estado de compactação continua sendo a melhor fonte disponível.
PRIOR_ENTRIES='[]'
if [ "$DO_REBUILD" -eq 0 ] && [ "$INDEX_PRIOR" != "null" ]; then
  PRIOR_ENTRIES="$(printf '%s' "$INDEX_PRIOR" | jq -c '[ (.sessions // [])[] | select(type == "object") ]')"
fi

# --- 5. recuperação do estado de compactação (o bug que a auditoria pegou) ---
PROFILE_JSON='null'
if [ -f "$PROFILE" ] && jq -e 'type == "object"' -- "$PROFILE" >/dev/null 2>&1; then
  PROFILE_JSON="$(jq -c '.' -- "$PROFILE")"
fi

ENTRIES="$(printf '%s' "$DERIVED" | jq -c \
  --argjson prior "$PRIOR_ENTRIES" \
  --argjson profile "$PROFILE_JSON" \
  --argjson topn "$SM_TOP_ELIGIBLE" \
  "$SM_OVERLAY_JQ"' sm_overlay_compaction($prior; $profile; $topn)')" \
  || sm_die 1 "falha ao recuperar o estado de compactação"

# --- 6. escrita atômica (só quando muda de fato) -----------------------------
NEED_WRITE=1
if [ "$INDEX_STATE" = "ok" ] && [ "$DO_REBUILD" -eq 0 ]; then
  OLD_SESSIONS="$(printf '%s' "$INDEX_PRIOR" | jq -cS '.sessions // []')"
  NEW_SESSIONS="$(printf '%s' "$ENTRIES" | jq -cS '.')"
  [ "$OLD_SESSIONS" = "$NEW_SESSIONS" ] && NEED_WRITE=0
fi

if [ "$NEED_WRITE" -eq 1 ]; then
  NOW="$(sm_now_iso)"
  NEW_INDEX="$(jq -n \
    --arg sv "$SM_INDEX_SCHEMA_VERSION" --arg now "$NOW" --argjson s "$ENTRIES" \
    '{schema_version: $sv, updated_at: $now, sessions: $s}')" \
    || sm_die 1 "falha ao montar o índice"
  # Validação antes de publicar. O temporário fica DENTRO do setup (I-25: nenhum
  # script escreve fora de <setup_root> e de $STUDY_METHOD_HOME).
  TMP_CHECK="$MEM/.INDEX.json.check.$$"
  printf '%s\n' "$NEW_INDEX" > "$TMP_CHECK" || sm_die 1 "falha ao escrever verificação temporária"
  if ! sm_json_validate "$TMP_CHECK" "$SCHEMA_DIR/index.schema.json"; then
    rm -f -- "$TMP_CHECK"
    sm_die 5 "o índice produzido não valida contra index.schema.json"
  fi
  rm -f -- "$TMP_CHECK"
  printf '%s\n' "$NEW_INDEX" | sm_atomic_write "$INDEX" || sm_die 1 "falha ao gravar $INDEX"
fi

QJSON="$(printf '%s\n' "${QUARANTINED[@]:-}" | jq -Rsc 'split("\n") | map(select(. != ""))')"
emit_summary "$(printf '%s' "$ENTRIES" | jq 'length')" "$ORPHANS_CLOSED" "$QJSON" "$REBUILT"
exit 0
