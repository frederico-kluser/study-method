#!/usr/bin/env bash
# progress-update.sh — estado de proficiencia do aluno (memory/progress.json).
#
# Implementa a maquina de transicoes T1..T8 de docs/04-proficiencia.md.
# A entrada e SEMPRE um evento observavel; nunca "o estado novo". O estado e
# calculado, e e essa ausencia de flag que faz valer a regra.
#
# Contratos: docs/00-contratos.md §5 (exit codes), §7 (lib/), §8 (CLI), §11.
set -euo pipefail

SM_PU_SELF="${BASH_SOURCE[0]}"
SM_PU_DIR="$(cd -- "$(dirname -- "$SM_PU_SELF")" && pwd)"
SM_PU_SCHEMAS="$(cd -- "$SM_PU_DIR/../assets/schemas" 2>/dev/null && pwd || true)"

# shellcheck source=lib/common.sh
. "$SM_PU_DIR/lib/common.sh"
# shellcheck source=lib/json.sh
. "$SM_PU_DIR/lib/json.sh"

sm_pu_usage() {
  cat <<'SM_USAGE_EOF'
uso: progress-update.sh [<setup_root>] (--event <evento.json>|- | --due | --recompute)

  Escreve memory/progress.json a partir de EVENTOS observaveis. Nao existe forma
  de informar proficiency_state, state_reason, confidence ou interval_days pela
  linha de comando: os quatro sao sempre calculados.

  <setup_root>      raiz do setup. Omitido, e descoberto a partir do diretorio
                    corrente subindo ate $HOME (exit 3 se nao achar).

  --event <arq>     aplica UM evento (JSON) e dispara as transicoes T1..T8.
                    "-" le o evento de stdin. Idempotente pela chave
                    (concept_id, kind, session_id, challenge_id, observed_at).
  --due             imprime em JSON os conceitos com revisao vencida e aplica o
                    decaimento preguicoso (T4). Nao faz mais nada.
  --recompute       reconstroi a camada escalar a partir de evidence[] e imprime
                    o diff. evidence[] e a fonte de verdade; todo escalar e cache.
  --help, -h        esta ajuda.

  As tres sao mutuamente exclusivas.

exit: 0 ok (inclusive no-op idempotente) · 1 erro de execucao · 2 uso incorreto
      · 3 setup nao encontrado · 4 progress.json travado · 5 validacao falhou
      (evento fora do schema, setup_id divergente, session_id/challenge_id
      inexistente, result fora do enum, resultado que nao valida contra
      progress.schema.json)
SM_USAGE_EOF
}

sm_pu_mode=""
sm_pu_event=""
sm_pu_root_arg=""
sm_pu_tmpdir=""

sm_pu_set_mode() {
  if [ -n "$sm_pu_mode" ]; then
    sm_pu_usage >&2
    sm_die 2 "modos mutuamente exclusivos: --$sm_pu_mode e --$1 na mesma invocacao"
  fi
  sm_pu_mode="$1"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) sm_pu_usage; exit 0 ;;
    --event)
      sm_pu_set_mode event
      [ "$#" -ge 2 ] || { sm_pu_usage >&2; sm_die 2 "--event exige o caminho do arquivo de evento (ou '-')"; }
      sm_pu_event="$2"; shift 2 ;;
    --event=*)
      sm_pu_set_mode event
      sm_pu_event="${1#--event=}"
      [ -n "$sm_pu_event" ] || { sm_pu_usage >&2; sm_die 2 "--event exige o caminho do arquivo de evento (ou '-')"; }
      shift ;;
    --due) sm_pu_set_mode due; shift ;;
    --recompute) sm_pu_set_mode recompute; shift ;;
    --) shift; break ;;
    -*) sm_pu_usage >&2; sm_die 2 "flag desconhecida: $1" ;;
    *)
      [ -z "$sm_pu_root_arg" ] || { sm_pu_usage >&2; sm_die 2 "argumento posicional em excesso: $1"; }
      sm_pu_root_arg="$1"; shift ;;
  esac
done
if [ "$#" -gt 0 ]; then
  [ -z "$sm_pu_root_arg" ] || { sm_pu_usage >&2; sm_die 2 "argumento posicional em excesso: $1"; }
  sm_pu_root_arg="$1"
fi

[ -n "$sm_pu_mode" ] || { sm_pu_usage >&2; sm_die 2 "informe exatamente um modo: --event, --due ou --recompute"; }

sm_require_cmd jq python3 || sm_die 1 "dependencia ausente"

if ! sm_pu_root="$(sm_setup_root "$sm_pu_root_arg")"; then
  sm_die 3 "setup nao encontrado a partir de '${sm_pu_root_arg:-$PWD}'"
fi
[ -n "$sm_pu_root" ] || sm_die 3 "setup nao encontrado a partir de '${sm_pu_root_arg:-$PWD}'"

sm_pu_memory="$sm_pu_root/memory"
sm_pu_progress="$sm_pu_memory/progress.json"
sm_pu_lock="$sm_pu_memory/.progress.lock"

sm_pu_cleanup() {
  local rc=$?
  [ -n "$sm_pu_tmpdir" ] && [ -d "$sm_pu_tmpdir" ] && rm -rf -- "$sm_pu_tmpdir"
  [ -n "${sm_pu_locked:-}" ] && rmdir -- "$sm_pu_lock" 2>/dev/null
  return $rc
}
trap sm_pu_cleanup EXIT

mkdir -p -- "$sm_pu_memory" || sm_die 1 "nao consegui criar $sm_pu_memory"

# --- lock proprio do progress.json (mkdir e atomico) ------------------------
sm_pu_locked=""
if ! mkdir -- "$sm_pu_lock" 2>/dev/null; then
  sm_pu_age=""
  if [ -d "$sm_pu_lock" ]; then
    sm_pu_now_s="$(date +%s)"
    sm_pu_mt="$(date -r "$sm_pu_lock" +%s 2>/dev/null || echo "$sm_pu_now_s")"
    sm_pu_age=$(( sm_pu_now_s - sm_pu_mt ))
  fi
  if [ -n "$sm_pu_age" ] && [ "$sm_pu_age" -gt 60 ]; then
    sm_log warn "lock morto em $sm_pu_lock (${sm_pu_age}s); removendo e tentando uma vez"
    rmdir -- "$sm_pu_lock" 2>/dev/null || true
    mkdir -- "$sm_pu_lock" 2>/dev/null || sm_die 4 "progress.json travado por outro processo"
  else
    sm_die 4 "progress.json travado por outro processo"
  fi
fi
sm_pu_locked=1

sm_pu_tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/sm-progress.XXXXXX")" || sm_die 1 "nao consegui criar diretorio temporario"

# --- evento de stdin --------------------------------------------------------
if [ "$sm_pu_mode" = "event" ]; then
  if [ "$sm_pu_event" = "-" ]; then
    sm_pu_event="$sm_pu_tmpdir/event.json"
    cat > "$sm_pu_event" || sm_die 1 "nao consegui ler o evento de stdin"
  fi
  [ -f "$sm_pu_event" ] || sm_die 5 "arquivo de evento inexistente: $sm_pu_event"
  sm_json_ok "$sm_pu_event" || sm_die 5 "evento nao e JSON valido: $sm_pu_event"
fi

# --- setup_id do manifesto e rotulo -> concept_id pela lib ------------------
sm_pu_setup_id=""
if [ -f "$sm_pu_root/setup.json" ]; then
  sm_pu_setup_id="$(sm_json_get "$sm_pu_root/setup.json" '.setup_id // empty' 2>/dev/null || true)"
fi
[ "$sm_pu_setup_id" = "null" ] && sm_pu_setup_id=""

sm_pu_derived_id=""
if [ "$sm_pu_mode" = "event" ]; then
  sm_pu_label="$(jq -r '(.concept // .label // "") | tostring' "$sm_pu_event" 2>/dev/null || true)"
  if [ -n "$sm_pu_label" ] && [ "$sm_pu_label" != "null" ]; then
    sm_pu_derived_id="$(sm_normalize_concept_id "$sm_pu_label" 2>/dev/null || true)"
  fi
fi

sm_pu_today="$(sm_today)"
sm_pu_now="$(sm_now_iso)"
sm_pu_out="$sm_pu_tmpdir/progress.new.json"

sm_pu_ctl="$(jq -n \
  --arg mode "$sm_pu_mode" \
  --arg root "$sm_pu_root" \
  --arg progress "$sm_pu_progress" \
  --arg event "$sm_pu_event" \
  --arg out "$sm_pu_out" \
  --arg today "$sm_pu_today" \
  --arg now "$sm_pu_now" \
  --arg setup_id "$sm_pu_setup_id" \
  --arg derived_id "$sm_pu_derived_id" \
  '{mode:$mode, root:$root, progress:$progress, event:$event, out:$out,
    today:$today, now:$now, setup_id:$setup_id, derived_concept_id:$derived_id}')"

SM_PU_ENGINE=$(cat <<'SM_ENGINE_EOF'
# -*- coding: utf-8 -*-
"""Motor determinista da maquina de proficiencia T1..T8 (docs/04 §3)."""
import datetime
import glob
import json
import math
import os
import re
import sys

CTL = json.loads(sys.argv[1])
MODE = CTL["mode"]
ROOT = CTL["root"]
TODAY = CTL["today"]
NOW = CTL["now"]

DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.][0-9]+)?([+-]\d{2}:\d{2}|Z)$")
CID_RE = re.compile(r"^[a-z][a-z0-9_]{1,62}$")
SID_RE = re.compile(r"^[0-9]{4}$")

KINDS = ("challenge", "exposure", "self_report", "review_declined", "decay")
RESULTS = ("passed", "failed", "not_attempted")
# §3.2: normalizacao OBRIGATORIA antes de classificar. timeout/error nunca sao
# evidencia de autonomia; sem esta tabela os dois caiam no ramo da classe B e
# PROMOVIAM unknown -> fragile.
RESULT_MAP = {
    "passed": "passed",
    "failed": "failed",
    "timeout": "failed",
    "error": "failed",
    "not_run": "not_attempted",
    "not_attempted": "not_attempted",
}
ERROR_TYPES = ("slip", "conceptual", "prerequisite", "none", "unknown")
CLAIM_MAP = {"mastery": "mastery", "no_mastery": "no_mastery",
             "positive": "mastery", "negative": "no_mastery"}
STATES = ("unknown", "fragile", "mastered")
REASONS = ("no_evidence", "passed_unassisted", "passed_with_hints", "failed",
           "conceptual_error", "temporal_decay", "self_report", "manual")

DEFAULT_POLICY = {
    "interval_multiplier_mastered": 2.3,
    "interval_multiplier_fragile": 1.3,
    "interval_cap_mastered_days": 180,
    "interval_cap_fragile_days": 21,
    "decay_overdue_ratio": 1.0,
    "mastery_window_days": 60,
    "max_review_suggestions_per_session": 2,
}

WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)
    sys.stderr.write("progress-update: aviso: %s\n" % msg)


def die(code, msg):
    sys.stderr.write("progress-update: %s\n" % msg)
    sys.exit(code)


def dt(s):
    return datetime.date(int(s[0:4]), int(s[5:7]), int(s[8:10]))


def dist(a, b):
    return (dt(a) - dt(b)).days


def shift(s, n):
    return (dt(s) + datetime.timedelta(days=n)).isoformat()


def rhu(x):
    """round meio-para-cima (§5.2)."""
    return int(math.floor(float(x) + 0.5))


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


# --------------------------------------------------------------------------
# leitura do arquivo de estado
# --------------------------------------------------------------------------
def load_progress():
    path = CTL["progress"]
    if not os.path.exists(path):
        return {
            "schema_version": "1.0",
            "setup_id": CTL.get("setup_id") or "",
            "recorded_at": NOW,
            "policy": dict(DEFAULT_POLICY),
            "concepts": [],
        }, True
    try:
        with open(path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, IOError) as exc:
        die(1, "nao consegui ler %s: %s" % (path, exc))
    except ValueError as exc:
        die(5, "%s nao parseia como JSON: %s" % (path, exc))
    if not isinstance(doc, dict) or not isinstance(doc.get("concepts"), list):
        die(5, "%s nao tem a forma de progress.schema.json (concepts[] ausente)" % path)
    return doc, False


def policy_of(doc):
    pol = dict(DEFAULT_POLICY)
    given = doc.get("policy")
    if isinstance(given, dict):
        for k, v in given.items():
            if k in pol and isinstance(v, (int, float)) and not isinstance(v, bool):
                pol[k] = v
    return pol


def find_concept(doc, cid):
    for c in doc["concepts"]:
        if c.get("concept_id") == cid:
            return c
    return None


def resolve_concept_id(doc, cid, label, derived):
    """§1.2 regra 3: procurar em concept_id E em aliases[] antes de criar."""
    if cid and find_concept(doc, cid) is not None:
        return cid, None
    by_alias = None
    if label:
        low = label.strip().lower()
        for c in doc["concepts"]:
            for a in (c.get("aliases") or []):
                if isinstance(a, str) and a.strip().lower() == low:
                    by_alias = c.get("concept_id")
                    break
            if by_alias:
                break
        if by_alias is None and derived:
            hit = find_concept(doc, derived)
            if hit is not None:
                by_alias = derived
    if cid and by_alias and by_alias != cid:
        die(5, "concept_id '%s' do evento discorda da resolucao de '%s' -> '%s'; "
               "discordancia silenciosa cria conceito duplicado" % (cid, label, by_alias))
    if cid:
        return cid, None
    if by_alias:
        return by_alias, None
    if derived:
        return derived, "new"
    die(5, "evento sem concept_id e sem rotulo resolvivel em concept_id/aliases[]")


def new_concept(cid, label):
    return {
        "concept_id": cid,
        "label": label or cid,
        "aliases": [],
        "track_ref": None,
        "proficiency_state": "unknown",
        "state_reason": "no_evidence",
        "confidence": "low",
        "attempts": 0,
        "unassisted_passes": 0,
        "max_hint_level_used": None,
        "last_error_type": None,
        "first_observed_at": None,
        "observed_at": None,
        "last_observed_at": None,
        "recorded_at": NOW,
        "interval_days": 1,
        "next_review_at": None,
        "status": "active",
        "superseded_by": None,
        "supersedes": [],
        "evidence": [],
    }


# --------------------------------------------------------------------------
# classificacao (§3.2) — ordem de teste fixa, a primeira que casar vence
# --------------------------------------------------------------------------
def ev_class(ev):
    if ev.get("kind") != "challenge":
        return None
    r = ev.get("result")
    if r not in ("passed", "failed"):
        return None                       # not_attempted nao e classificado
    h = ev.get("hint_level")
    e = ev.get("error_type")
    if r == "failed" or (is_int(h) and h >= 4) or e == "conceptual":
        return "C"
    if r == "passed" and is_int(h) and h in (0, 1) and e in ("none", "slip"):
        return "A"                        # hint_level null NUNCA vale 0
    return "B"


def reason_for(cls, ev):
    if cls == "A":
        return "passed_unassisted"
    if cls == "B":
        return "passed_with_hints"
    if ev.get("error_type") == "conceptual":
        return "conceptual_error"
    if ev.get("result") == "failed":
        return "failed"
    return "passed_with_hints"            # passou, mas com dica 4-5


def chrono(concept):
    ev = concept.get("evidence") or []
    idx = list(range(len(ev)))
    idx.sort(key=lambda i: (ev[i].get("observed_at") or "",
                            ev[i].get("recorded_at") or "", i))
    return [ev[i] for i in idx]


# --------------------------------------------------------------------------
# camada escalar: TODA derivada de evidence[] (§3.5 passo 8, §9.3 item 4)
# --------------------------------------------------------------------------
SCALARS = ("proficiency_state", "state_reason", "confidence", "attempts",
           "unassisted_passes", "max_hint_level_used", "last_error_type",
           "first_observed_at", "observed_at", "last_observed_at",
           "interval_days", "next_review_at")


def derive_scalars(concept, pol):
    seq = chrono(concept)
    out = {
        "proficiency_state": "unknown",
        "state_reason": "no_evidence",
        "confidence": "low",
        "attempts": 0,
        "unassisted_passes": 0,
        "max_hint_level_used": None,
        "last_error_type": None,
        "first_observed_at": None,
        "observed_at": None,
        "last_observed_at": None,
        "interval_days": 1,
        "next_review_at": None,
    }
    if not seq:
        return out

    interval = 1
    reason = "no_evidence"
    unassisted = 0
    for ev in seq:
        cls = ev_class(ev)
        rule = ev.get("transition_rule")
        if ev.get("kind") == "challenge" and is_int(ev.get("attempts")):
            out["attempts"] += ev["attempts"]
        # §3.6: classe A posterior ao ultimo classe C e a ultima T6
        if cls == "C":
            unassisted = 0
        elif cls == "A":
            unassisted += 1
        if rule == "T6":
            unassisted = 0
        # razao do estado corrente
        if cls is not None:
            reason = reason_for(cls, ev)
        elif rule == "T4":
            reason = "temporal_decay"
        elif rule == "T8":
            reason = "self_report"
        # intervalo (§5.2): so evento de desafio classificado mexe
        if cls == "C":
            interval = 1
        elif cls in ("A", "B"):
            st = ev.get("state_after")
            if st == "mastered":
                mult = pol["interval_multiplier_mastered"]
                cap = pol["interval_cap_mastered_days"]
            else:
                mult = pol["interval_multiplier_fragile"]
                cap = pol["interval_cap_fragile_days"]
            interval = max(interval + 1, rhu(interval * mult))
            if interval > cap:
                interval = cap
        # datas
        o = ev.get("observed_at")
        if o:
            if out["first_observed_at"] is None or o < out["first_observed_at"]:
                out["first_observed_at"] = o
            if out["last_observed_at"] is None or o > out["last_observed_at"]:
                out["last_observed_at"] = o
        if ev.get("kind") == "challenge" and ev.get("result") in ("passed", "failed"):
            out["observed_at"] = o
            out["max_hint_level_used"] = ev.get("hint_level")
            out["last_error_type"] = ev.get("error_type")

    last = seq[-1]
    out["proficiency_state"] = last.get("state_after") or "unknown"
    out["state_reason"] = reason
    out["unassisted_passes"] = unassisted
    out["interval_days"] = interval
    if out["observed_at"]:
        out["next_review_at"] = shift(out["observed_at"], interval)

    # confidence (§4.4): so kind challenge com result passed|failed conta
    qual = [e for e in seq
            if e.get("kind") == "challenge" and e.get("result") in ("passed", "failed")]
    if not qual:
        out["confidence"] = "low"
    else:
        age = dist(TODAY, qual[-1].get("observed_at"))
        if age > 90:
            out["confidence"] = "low"
        elif len(qual) >= 2 and age <= 30:
            out["confidence"] = "high"
        else:
            out["confidence"] = "medium"
    return out


def apply_scalars(concept, pol, keep_manual=False):
    derived = derive_scalars(concept, pol)
    changes = []
    for k in SCALARS:
        old = concept.get(k, None)
        new = derived[k]
        if k == "state_reason" and old == "manual":
            if keep_manual:
                continue
            if new != "manual":
                warn("conceito '%s': state_reason 'manual' desfeito por --recompute "
                     "(sem evidencia correspondente); passa a '%s'"
                     % (concept.get("concept_id"), new))
        if old != new:
            changes.append({"concept_id": concept.get("concept_id"),
                            "field": k, "from": old, "to": new})
            concept[k] = new
    return changes


# --------------------------------------------------------------------------
# leitura e normalizacao do evento (§3.5 passo 0)
# --------------------------------------------------------------------------
def read_event():
    try:
        with open(CTL["event"], "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except (OSError, IOError) as exc:
        die(1, "nao consegui ler o evento: %s" % exc)
    except ValueError as exc:
        die(5, "evento nao parseia como JSON: %s" % exc)
    if not isinstance(raw, dict):
        die(5, "evento precisa ser um objeto JSON")
    return raw


def normalize_event(raw, doc):
    for forbidden in ("state_before", "state_after", "transition_rule"):
        if forbidden in raw:
            die(5, "evento traz '%s'; os tres sao calculados pelo script, nunca informados"
                   % forbidden)

    ev = {}
    sv = raw.get("schema_version")
    if not isinstance(sv, str) or not re.match(r"^[0-9]+\.[0-9]+$", sv):
        die(5, "schema_version ausente ou fora do formato MAJOR.MINOR")
    ev["schema_version"] = sv

    setup_id = raw.get("setup_id")
    if setup_id not in (None, ""):
        if not isinstance(setup_id, str) or not re.match(r"^[0-9a-f]{12}$", setup_id):
            die(5, "setup_id do evento fora do pattern ^[0-9a-f]{12}$")
        alvo = doc.get("setup_id") or CTL.get("setup_id") or ""
        if alvo and setup_id != alvo:
            die(5, "setup_id do evento (%s) diverge do setup alvo (%s); "
                   "conceito nunca cruza setup" % (setup_id, alvo))
    ev["setup_id"] = setup_id

    kind = raw.get("kind")
    if kind not in KINDS:
        die(5, "kind invalido: %r (esperado um de %s)" % (kind, ", ".join(KINDS)))
    ev["kind"] = kind

    observed = raw.get("observed_at")
    if not isinstance(observed, str) or not DATE_RE.match(observed):
        die(5, "observed_at ausente ou fora do formato AAAA-MM-DD")
    try:
        dt(observed)
    except ValueError:
        die(5, "observed_at nao e uma data valida: %s" % observed)
    ev["observed_at"] = observed

    rec = raw.get("recorded_at")
    if rec in (None, ""):
        rec = NOW
    if not isinstance(rec, str) or not TS_RE.match(rec):
        die(5, "recorded_at fora do formato ISO 8601 com offset")
    ev["recorded_at"] = rec

    sid = raw.get("session_id")
    if sid in ("", None):
        sid = None
    if sid is not None and (not isinstance(sid, str) or not SID_RE.match(sid)):
        die(5, "session_id fora do pattern ^[0-9]{4}$: %r" % (sid,))
    if kind != "decay" and sid is None:
        die(5, "session_id e obrigatorio quando kind != decay")
    if kind == "decay" and sid is not None:
        die(5, "kind 'decay' nao acontece dentro de sessao: session_id tem de ser null")
    ev["session_id"] = sid

    cid_ch = raw.get("challenge_id")
    if cid_ch in ("", None):
        cid_ch = None
    if cid_ch is not None and (not isinstance(cid_ch, str) or not SID_RE.match(cid_ch)):
        die(5, "challenge_id fora do pattern ^[0-9]{4}$: %r" % (cid_ch,))
    if kind == "challenge" and cid_ch is None:
        die(5, "challenge_id e obrigatorio quando kind = challenge")
    if kind != "challenge" and cid_ch is not None:
        die(5, "challenge_id so existe quando kind = challenge")
    ev["challenge_id"] = cid_ch

    # ---- NENHUMA TRANSICAO SEM ARTEFATO (§2.1, §9.3 item 2) ----------------
    if sid is not None:
        if not os.path.isfile(os.path.join(ROOT, "memory", sid + ".json")):
            die(5, "sem artefato, sem transicao: memory/%s.json nao existe" % sid)
    if cid_ch is not None:
        hits = [p for p in glob.glob(os.path.join(ROOT, "challenges", cid_ch + "-*"))
                if os.path.isdir(p)]
        if not hits:
            die(5, "sem artefato, sem transicao: challenges/%s-*/ nao existe" % cid_ch)

    # ---- passo 0: last_result -> result, pela tabela da §3.2 ---------------
    rawres = raw.get("last_result", None)
    src = "last_result"
    if rawres is None:
        rawres = raw.get("result", None)
        src = "result"
    if kind == "challenge":
        if rawres is None:
            die(5, "kind 'challenge' exige last_result (ou result)")
        if not isinstance(rawres, str) or rawres not in RESULT_MAP:
            die(5, "%s fora do vocabulario aceito (%s): %r"
                   % (src, ", ".join(sorted(RESULT_MAP)), rawres))
        res = RESULT_MAP[rawres]
        if rawres in ("timeout", "error"):
            warn("%s '%s' normalizado para result 'failed' (§3.2): o codigo do aluno "
                 "nao terminou, e isso nunca e evidencia de autonomia" % (src, rawres))
        ev["result"] = res
    else:
        if rawres not in (None, ""):
            die(5, "result/last_result so existe quando kind = challenge")
        ev["result"] = None

    hint = raw.get("hint_level", None)
    if hint is not None:
        if not is_int(hint) or hint < 0 or hint > 5:
            die(5, "hint_level fora da faixa 0..5: %r" % (hint,))
        if kind != "challenge":
            die(5, "hint_level so existe quando kind = challenge")
    ev["hint_level"] = hint

    et = raw.get("error_type", None)
    if et in ("", None):
        et = "unknown" if kind == "challenge" else None
    if et is not None and et not in ERROR_TYPES:
        die(5, "error_type invalido: %r" % (et,))
    if et is not None and kind != "challenge":
        die(5, "error_type so existe quando kind = challenge")
    ev["error_type"] = et

    att = raw.get("attempts", None)
    if att is not None and (not is_int(att) or att < 0):
        die(5, "attempts precisa ser inteiro >= 0 ou null")
    ev["attempts"] = att

    attributed = raw.get("attributed_to", None)
    if attributed in ("", None):
        attributed = None
    if attributed is not None and (not isinstance(attributed, str)
                                   or not CID_RE.match(attributed)):
        die(5, "attributed_to fora do pattern de concept_id: %r" % (attributed,))
    if et == "prerequisite" and attributed is None:
        die(5, "error_type 'prerequisite' exige attributed_to (§6.4)")
    if et != "prerequisite" and attributed is not None:
        die(5, "attributed_to so existe quando error_type = prerequisite")
    ev["attributed_to"] = attributed

    claim = raw.get("self_report_claim", raw.get("self_report_polarity", None))
    if claim in ("", None):
        claim = None
    if claim is not None:
        if claim not in CLAIM_MAP:
            die(5, "self_report_claim invalido: %r (mastery|no_mastery)" % (claim,))
        claim = CLAIM_MAP[claim]
    if kind == "self_report" and claim is None:
        die(5, "kind 'self_report' exige self_report_claim: sem ele o auto-relato "
               "e ilegivel para o script")
    if kind != "self_report" and claim is not None:
        die(5, "self_report_claim so existe quando kind = self_report")
    ev["self_report_claim"] = claim

    note = raw.get("note", None)
    if note is not None:
        if not isinstance(note, str):
            die(5, "note precisa ser texto ou null")
        if len(note) > 240:
            warn("note truncada em 240 caracteres")
            note = note[:240]
    ev["note"] = note

    ev["_concept_id"] = raw.get("concept_id") or None
    ev["_label"] = raw.get("concept") or raw.get("label") or None
    if ev["_concept_id"] is not None and not CID_RE.match(str(ev["_concept_id"])):
        die(5, "concept_id fora do pattern ^[a-z][a-z0-9_]{1,62}$: %r" % (ev["_concept_id"],))
    return ev


# --------------------------------------------------------------------------
# a maquina de transicoes (§3.3, §3.5)
# --------------------------------------------------------------------------
def evidence_key(cid, kind, sid, chid, observed):
    return (cid, kind, sid, chid, observed)


def already_applied(concept, kind, sid, chid, observed):
    for e in (concept.get("evidence") or []):
        if (e.get("kind") == kind and e.get("session_id") == sid
                and e.get("challenge_id") == chid
                and e.get("observed_at") == observed):
            return True
    return False


def last_c_index(seq):
    idx = -1
    for i, e in enumerate(seq):
        if ev_class(e) == "C":
            idx = i
    return idx


def t5_applicable(seq):
    """fragile -> mastered com UMA passagem: so se a ultima democao foi T4 e
    nao houve evento classe C desde entao (§3.3 T5, §3.4)."""
    t4 = -1
    for i, e in enumerate(seq):
        if e.get("transition_rule") in ("T3", "T4", "T6"):
            t4 = i if e.get("transition_rule") == "T4" else -1
    if t4 < 0:
        return False
    for e in seq[t4 + 1:]:
        if ev_class(e) == "C":
            return False
    return True


def t2_applicable(seq, new_ev, pol):
    """duas classe A, sessoes distintas, >= 1 dia entre elas, ambas dentro da
    janela e posteriores ao ultimo classe C (§3.3 T2)."""
    start = last_c_index(seq) + 1
    for e in reversed(seq[start:]):
        if e.get("transition_rule") == "T6":
            break
        if ev_class(e) != "A":
            continue
        if e.get("session_id") == new_ev.get("session_id"):
            continue
        gap = dist(new_ev["observed_at"], e.get("observed_at"))
        if gap >= 1 and gap <= pol["mastery_window_days"]:
            return True
    return False


def t6_applicable(seq, new_ev):
    """2a conceitual consecutiva, em sessoes distintas, sem passagem entre elas."""
    for e in reversed(seq):
        if e.get("kind") != "challenge":
            continue
        if e.get("result") == "not_attempted":
            continue
        if ev_class(e) == "C" and e.get("error_type") == "conceptual":
            return e.get("session_id") != new_ev.get("session_id")
        return False
    return False


def transition(concept, ev, pol):
    """Devolve (state_after, transition_rule). §3.5 passos 3 a 6."""
    before = concept.get("proficiency_state") or "unknown"
    kind = ev["kind"]

    if kind in ("exposure", "review_declined"):
        return before, None
    if kind == "self_report":
        if ev.get("self_report_claim") == "no_mastery" and before == "mastered":
            return "fragile", "T8"
        return before, "T7"
    if kind == "decay":
        if before == "mastered":
            return "fragile", "T4"
        return before, "T7"

    # kind == challenge
    if ev.get("result") == "not_attempted":
        return before, None

    seq = chrono(concept)
    cls = ev_class(ev)
    if before == "mastered":
        if cls in ("B", "C"):
            return "fragile", "T3"
        return "mastered", "T7"
    if before == "fragile":
        if cls == "A":
            if t5_applicable(seq):
                return "mastered", "T5"
            if t2_applicable(seq, ev, pol):
                return "mastered", "T2"
            return "fragile", "T7"
        if cls == "B":
            return "fragile", "T7"
        if ev.get("error_type") == "conceptual" and t6_applicable(seq, ev):
            return "unknown", "T6"
        return "fragile", "T7"
    # before == unknown
    if cls in ("A", "B"):
        return "fragile", "T1"
    return "unknown", "T7"


def insert_evidence(concept, entry):
    """Insere em posicao cronologica (estavel) e avisa se fora de ordem."""
    ev = concept.setdefault("evidence", [])
    key = (entry.get("observed_at") or "", entry.get("recorded_at") or "")
    pos = len(ev)
    for i in range(len(ev) - 1, -1, -1):
        k = (ev[i].get("observed_at") or "", ev[i].get("recorded_at") or "")
        if k <= key:
            pos = i + 1
            break
        pos = i
    if pos != len(ev):
        warn("conceito '%s': evento de %s chegou fora de ordem cronologica; "
             "inserido na posicao %d e a transicao foi calculada contra o estado corrente"
             % (concept.get("concept_id"), entry.get("observed_at"), pos))
    ev.insert(pos, entry)


def make_entry(ev, kind, result, error_type, attributed_to, before, after, rule, note):
    return {
        "kind": kind,
        "session_id": ev.get("session_id"),
        "challenge_id": ev.get("challenge_id") if kind == "challenge" else None,
        "observed_at": ev["observed_at"],
        "recorded_at": ev["recorded_at"],
        "result": result,
        "attempts": ev.get("attempts") if kind == "challenge" else None,
        "hint_level": ev.get("hint_level") if kind == "challenge" else None,
        "error_type": error_type,
        "attributed_to": attributed_to,
        "state_before": before,
        "state_after": after,
        "transition_rule": rule,
        "note": note,
    }


def target_concept(doc, cid, label):
    c = find_concept(doc, cid)
    if c is None:
        c = new_concept(cid, label)
        doc["concepts"].append(c)
        return c, True
    seen = set()
    while c.get("status") == "superseded" and c.get("superseded_by"):
        nxt = c["superseded_by"]
        if nxt in seen:
            break
        seen.add(nxt)
        follow = find_concept(doc, nxt)
        if follow is None:
            break
        warn("conceito '%s' esta superseded; evidencia redirecionada para '%s'"
             % (c.get("concept_id"), nxt))
        c = follow
    return c, False


def apply_one(doc, pol, cid, label, ev, kind, result, error_type, attributed_to, note):
    concept, created = target_concept(doc, cid, label)
    cid = concept["concept_id"]
    if already_applied(concept, kind, ev.get("session_id"),
                       ev.get("challenge_id") if kind == "challenge" else None,
                       ev["observed_at"]):
        return {"concept_id": cid, "applied": False, "reason": "idempotente",
                "state_before": concept.get("proficiency_state"),
                "state_after": concept.get("proficiency_state"),
                "transition_rule": None}
    if label and label not in (concept.get("aliases") or []) \
            and label != concept.get("label"):
        concept.setdefault("aliases", []).append(label)

    shadow = dict(ev)
    shadow["kind"] = kind
    shadow["result"] = result
    shadow["error_type"] = error_type
    if kind != "challenge":
        shadow["hint_level"] = None
        shadow["attempts"] = None
        shadow["challenge_id"] = None

    before = concept.get("proficiency_state") or "unknown"
    after, rule = transition(concept, shadow, pol)
    entry = make_entry(shadow, kind, result, error_type, attributed_to,
                       before, after, rule, note)
    insert_evidence(concept, entry)
    concept["proficiency_state"] = after
    concept["recorded_at"] = ev["recorded_at"]
    keep_manual = (rule is None)
    apply_scalars(concept, pol, keep_manual=keep_manual)
    concept["proficiency_state"] = after
    return {"concept_id": cid, "applied": True, "created": created,
            "state_before": before, "state_after": after,
            "transition_rule": rule, "class": ev_class(entry)}


def mode_event(doc, pol):
    raw = read_event()
    ev = normalize_event(raw, doc)
    cid, _ = resolve_concept_id(doc, ev["_concept_id"], ev["_label"],
                                CTL.get("derived_concept_id") or None)
    label = ev["_label"]
    results = []

    if ev["kind"] == "challenge" and ev.get("error_type") == "prerequisite":
        # §6.4: o alvo recebe exposure (nunca muda estado); a evidencia
        # penalizante inteira vai para o pre-requisito.
        note_alvo = ev.get("note")
        results.append(apply_one(doc, pol, cid, label, ev, "exposure", None,
                                 "prerequisite", ev["attributed_to"], note_alvo))
        pre_note = ev.get("note")
        if pre_note is None:
            pre_note = "evidencia atribuida por pre-requisito a partir do conceito '%s'" % cid
        results.append(apply_one(doc, pol, ev["attributed_to"], None, ev,
                                 "challenge", ev["result"], "unknown", None,
                                 pre_note[:240]))
    else:
        results.append(apply_one(doc, pol, cid, label, ev, ev["kind"], ev["result"],
                                 ev.get("error_type"), ev.get("attributed_to"),
                                 ev.get("note")))
    applied = any(r["applied"] for r in results)
    return results, applied


def mode_due(doc, pol):
    """§5.3: decaimento preguicoso + fila de revisao vencida."""
    decayed = []
    ratio = pol["decay_overdue_ratio"]
    if ratio > 0:
        for c in doc["concepts"]:
            if c.get("status") != "active":
                continue
            if c.get("proficiency_state") != "mastered":
                continue
            obs = c.get("observed_at")
            if not obs:
                continue
            interval = c.get("interval_days") or 1
            threshold = int(math.ceil((1.0 + ratio) * interval))
            if dist(TODAY, obs) < threshold:
                continue
            crossed = shift(obs, threshold)
            if already_applied(c, "decay", None, None, crossed):
                continue
            entry = make_entry(
                {"session_id": None, "challenge_id": None,
                 "observed_at": crossed, "recorded_at": NOW,
                 "attempts": None, "hint_level": None},
                "decay", None, None, None,
                "mastered", "fragile", "T4",
                "atraso de %d dias sobre intervalo de %d; nenhuma falha observada"
                % (dist(TODAY, obs), interval))
            insert_evidence(c, entry)
            c["proficiency_state"] = "fragile"
            c["recorded_at"] = NOW
            apply_scalars(c, pol)
            c["proficiency_state"] = "fragile"
            decayed.append(c["concept_id"])

    due = []
    for c in doc["concepts"]:
        if c.get("status") != "active":
            continue
        if c.get("proficiency_state") not in ("fragile", "mastered"):
            continue
        nra = c.get("next_review_at")
        if not nra or nra > TODAY:
            continue
        interval = c.get("interval_days") or 1
        overdue = dist(TODAY, nra)
        due.append({
            "concept_id": c.get("concept_id"),
            "label": c.get("label"),
            "proficiency_state": c.get("proficiency_state"),
            "state_reason": c.get("state_reason"),
            "confidence": c.get("confidence"),
            "track_ref": c.get("track_ref"),
            "interval_days": interval,
            "next_review_at": nra,
            "days_overdue": overdue,
            "overdue_ratio": round(float(overdue) / float(interval), 4),
        })
    order = {"fragile": 0, "mastered": 1}
    due.sort(key=lambda x: (order.get(x["proficiency_state"], 9),
                            -x["overdue_ratio"], x["concept_id"]))
    # intercalar (§5.3 passo 4): evitar dois do mesmo track_ref havendo alternativa
    suggested = []
    used_tracks = set()
    limit = int(pol["max_review_suggestions_per_session"])
    pool = list(due)
    while pool and len(suggested) < limit:
        pick = None
        for i, cand in enumerate(pool):
            tr = cand.get("track_ref")
            if tr is None or tr not in used_tracks:
                pick = i
                break
        if pick is None:
            pick = 0
        cand = pool.pop(pick)
        if cand.get("track_ref"):
            used_tracks.add(cand["track_ref"])
        suggested.append(cand["concept_id"])
    return {"today": TODAY, "decayed": decayed, "due": due,
            "suggested": suggested}, bool(decayed)


def mode_recompute(doc, pol):
    changes = []
    for c in doc["concepts"]:
        changes.extend(apply_scalars(c, pol))
    return changes, bool(changes)


def write_out(doc):
    doc["recorded_at"] = NOW
    with open(CTL["out"], "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def main():
    doc, created = load_progress()
    pol = policy_of(doc)
    if not doc.get("setup_id") and CTL.get("setup_id"):
        doc["setup_id"] = CTL["setup_id"]
    doc.setdefault("schema_version", "1.0")

    if MODE == "event":
        results, changed = mode_event(doc, pol)
        out = {"mode": "event", "applied": changed, "results": results,
               "warnings": WARNINGS}
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        if changed or created:
            write_out(doc)
    elif MODE == "due":
        payload, changed = mode_due(doc, pol)
        payload["warnings"] = WARNINGS
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        if changed or created:
            write_out(doc)
    elif MODE == "recompute":
        changes, changed = mode_recompute(doc, pol)
        sys.stdout.write(json.dumps(
            {"mode": "recompute", "changed": len(changes), "diff": changes,
             "warnings": WARNINGS}, ensure_ascii=False, indent=2) + "\n")
        if changed or created:
            write_out(doc)
    else:
        die(2, "modo desconhecido: %s" % MODE)
    return 0


sys.exit(main())
SM_ENGINE_EOF
)

set +e
python3 -c "$SM_PU_ENGINE" "$sm_pu_ctl"
sm_pu_rc=$?
set -e
[ "$sm_pu_rc" -eq 0 ] || exit "$sm_pu_rc"

if [ -f "$sm_pu_out" ]; then
  if [ -n "$SM_PU_SCHEMAS" ] && [ -f "$SM_PU_SCHEMAS/progress.schema.json" ]; then
    sm_json_validate "$sm_pu_out" "$SM_PU_SCHEMAS/progress.schema.json" \
      || sm_die 5 "o progress.json resultante nao valida contra progress.schema.json"
  else
    sm_log warn "progress.schema.json nao encontrado; gravando sem validacao de schema"
  fi
  sm_atomic_write "$sm_pu_progress" < "$sm_pu_out" \
    || sm_die 1 "nao consegui gravar $sm_pu_progress"
fi

exit 0
