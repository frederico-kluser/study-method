#!/usr/bin/env bash
# tests/smoke.sh — O TESTE DE INTEGRAÇÃO PONTA A PONTA. É este script que decide se a
# implementação está pronta ou se precisa de mais uma rodada.
#
# Roda num diretório temporário, com `STUDY_METHOD_HOME` e `STUDY_METHOD_TODAY` próprios —
# nada toca o `$HOME` real, nada depende do relógio.
#
#   PASSO 1  cria um setup do zero (setup-init.sh → readme-sync.sh --init)
#   PASSO 2  abre e fecha 3 sessões (session-new.sh → session-close.sh, com REQUEST/APPLY)
#   PASSO 3  gera 1 desafio Python e o valida pelo protocolo completo (challenge-new.sh →
#            challenge-verify.sh, incluindo o ciclo de `classify_survivor`)
#   PASSO 3b gera 2 desafios Rust e os valida pelo protocolo completo: o esqueleto
#            canônico vira `approved`; um teste que NÃO compila vira `rejected` com
#            exit 0 — regressão do bug "challenge-verify.sh falhou (exit 1)"
#   PASSO 4  renderiza 1 gráfico (render-plot.py) e confere as 4 saídas obrigatórias
#   PASSO 5  roda readme-sync.sh e prova idempotência byte a byte
#   PASSO 6  valida TODO JSON produzido contra o schema dono
#
# Uso:  tests/smoke.sh [-h] [--keep]
#         --keep  não apaga o diretório de trabalho (para inspeção manual)
# Exit: 0 o fluxo inteiro passou · 1 algum passo falhou · 3 pré-requisito ausente
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/lib/assert.sh
. "$SELF_DIR/lib/assert.sh"

KEEP=0
case "${1:-}" in
  -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  --keep) KEEP=1 ;;
  "") ;;
  *) printf 'uso incorreto: argumento desconhecido «%s». Veja --help.\n' "$1" >&2; exit 2 ;;
esac

SK="$GATE_SK"
SCRIPTS="$SK/scripts"
SCHEMAS="$SK/assets/schemas"

WORK="$GATE_TMPDIR/smoke"
export STUDY_METHOD_HOME="$WORK/state"
export STUDY_METHOD_TODAY="${STUDY_METHOD_TODAY:-2026-08-23}"
# `SM_NOW` NAO existe: nenhum script a le. A variavel do vocabulario fechado de
# docs/00-contratos.md §4.4 e `STUDY_METHOD_NOW`, lida por `sm_now_iso` (lib/common.sh).
# Com o nome errado, esta linha prometia um determinismo que o smoke nao tinha.
export STUDY_METHOD_NOW="${STUDY_METHOD_TODAY}T09:00:00-03:00"
export TZ="${TZ:-America/Sao_Paulo}"
SETUP="$WORK/setup-calculo"

cleanup() {
  if [ "$KEEP" = 1 ]; then
    printf '\n%s\n' "diretório de trabalho preservado em: $WORK"
  else
    gate_cleanup_tmp
  fi
}
trap cleanup EXIT

gate_init "smoke — integração ponta a ponta"
gate_limitation "O modelo NÃO está no laço: as respostas do protocolo REQUEST/APPLY são sintetizadas mecanicamente a partir do \`response_schema\` (§6: \"o gate roda os 19 scripts com respostas fixas\"). O smoke prova o CAMINHO, não a qualidade do julgamento."
gate_limitation "A validação de JSON usa o verificador mínimo em Python stdlib — cobertura parcial por design (§4.3)."
gate_note "trabalho em: $WORK"
gate_note "STUDY_METHOD_HOME=$STUDY_METHOD_HOME · STUDY_METHOD_TODAY=$STUDY_METHOD_TODAY · STUDY_METHOD_NOW=$STUDY_METHOD_NOW"

# ────────────────────────────────────────────────────── pré-requisitos
gate_section "PASSO 0 · pré-requisitos"
NEEDED="setup-init.sh readme-sync.sh session-new.sh session-close.sh memory-index.sh
        memory-digest.sh memory-compact.sh progress-update.sh challenge-new.sh
        challenge-verify.sh detect-toolchains.sh render-plot.py"
missing=""
for s in $NEEDED; do
  [ -x "$SCRIPTS/$s" ] || missing="$missing $s"
done
if [ -n "$missing" ]; then
  gate_pend "S-00" "os executáveis usados pelo fluxo ponta a ponta existem" \
    "faltam em SK/scripts/:$missing"
  printf '\n  %s\n' "${C_YEL}${C_BLD}O SMOKE NÃO PODE RODAR: a implementação dos scripts ainda não fechou.${C_OFF}"
  printf '  %s\n' "Cada passo abaixo depende de um executável que não existe no disco:"
  for s in $missing; do printf '    · SK/scripts/%s\n' "$s"; done
  printf '\n  %s\n\n' "${C_RED}${C_BLD}GATE VERMELHO (exit 3 — pré-requisito ausente)${C_OFF}"
  exit 3
fi
gate_pass "S-00" "os 12 executáveis do fluxo estão presentes e executáveis"

VALIDATOR="$(gate_schema_validator)"
mkdir -p "$WORK" "$STUDY_METHOD_HOME"

# sintetizador de RESPOSTA do protocolo REQUEST/APPLY (§6.2) a partir do response_schema
SYNTH="$GATE_TMPDIR/synth_response.py"
cat > "$SYNTH" <<'PYEOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sintetiza a RESPOSTA do protocolo REQUEST/APPLY a partir do `response_schema`.

Uso: synth_response.py <pedido.json> <dir-de-schemas> > <resposta.json>

O modelo nao esta no laco: os valores sao MECANICOS e so precisam VALIDAR contra o schema
de resposta — e exatamente o que o §6 promete ao gate ("respostas fixas").
Exit: 0 ok · 2 nao achou o response_schema · 3 nao conseguiu sintetizar um campo
"""
import glob
import json
import os
import re
import sys

SAMPLE_BY_PATTERN = {
    r"^[0-9]{4}$": "0001",
    r"^[0-9a-f]{12}$": "0123456789ab",
    r"^f-[0-9]{4}$": "f-0001",
    r"^[a-z][a-z0-9_]{1,62}$": "conceito_de_teste",
    r"^[a-z0-9]+(-[a-z0-9]+)*$": "topico-de-teste",
    r"^[0-9]+\.[0-9]+$": "1.0",
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$": os.environ.get("STUDY_METHOD_TODAY", "2026-08-23"),
    r"^[a-f0-9]{64}$": "a" * 64,
    r"^memory/[0-9]{4}\.json$": "memory/0001.json",
    r"^/": "/tmp/smoke",
    r"^D-[A-Z]{1,3}[0-9]{2,3}$": "D-A01",
}
TS = "2026-08-23T09:00:00-03:00"


def sample_for_pattern(pat):
    if pat in SAMPLE_BY_PATTERN:
        return SAMPLE_BY_PATTERN[pat]
    if "T[0-9]{2}" in pat or "T\\d{2}" in pat:
        return TS
    for known, val in SAMPLE_BY_PATTERN.items():
        if known.replace("\\d", "[0-9]") == pat.replace("\\d", "[0-9]"):
            return val
    for cand in ("topico-de-teste", "conceito_de_teste", "texto", "x", "0001"):
        if re.search(pat, cand):
            return cand
    return None


def synth(schema, ptr, errs):
    if not isinstance(schema, dict):
        return None
    if "const" in schema:
        return schema["const"]
    if "enum" in schema:
        vals = [v for v in schema["enum"] if v is not None] or schema["enum"]
        return vals[0]
    t = schema.get("type", "string")
    types = t if isinstance(t, list) else [t]
    types = [x for x in types if x != "null"] or ["null"]
    t = types[0]
    if t == "object":
        obj = {}
        props = schema.get("properties", {})
        for name in schema.get("required", []):
            obj[name] = synth(props.get(name, {"type": "string"}),
                              "%s/%s" % (ptr, name), errs)
        return obj
    if t == "array":
        n = schema.get("minItems", 1) or 1
        item = schema.get("items", {"type": "string"})
        return [synth(item, ptr + "/0", errs) for _ in range(max(1, n))]
    if t in ("integer", "number"):
        lo = schema.get("minimum", 0)
        hi = schema.get("maximum")
        v = lo if hi is None or lo <= hi else hi
        return int(v) if t == "integer" else float(v)
    if t == "boolean":
        return False
    if t == "null":
        return None
    pat = schema.get("pattern")
    if pat:
        v = sample_for_pattern(pat)
        if v is None:
            errs.append("%s: nao sei sintetizar valor para o pattern %s" % (ptr, pat))
            return "?"
        return v
    minlen = schema.get("minLength", 0)
    base = "texto de teste sintetizado pelo smoke"
    return base if len(base) >= minlen else base + "x" * (minlen - len(base))


def main(argv):
    req = json.load(open(argv[1], encoding="utf-8"))
    schema_dir = argv[2]
    urn = req.get("response_schema", "")
    target = None
    for path in glob.glob(os.path.join(schema_dir, "**", "*.json"), recursive=True):
        try:
            doc = json.load(open(path, encoding="utf-8"))
        except ValueError:
            continue
        if doc.get("$id") == urn:
            target = doc
            break
    if target is None:
        sys.stderr.write("response_schema nao encontrado: %s\n" % urn)
        return 2
    errs = []
    body = synth(target, "", errs)
    if not isinstance(body, dict):
        body = {}
    # Um modelo real ECOA os identificadores do PEDIDO na RESPOSTA. Sem isso o
    # sintetizador so acerta a PRIMEIRA sessao: o sample do pattern ^[0-9]{4}$ e fixo
    # ("0001") e o --apply da sessao 0002 morre com "session_id divergente".
    # Regra: campo escalar do corpo cujo nome existe no payload do PEDIDO recebe o valor
    # do PEDIDO — salvo quando o proprio response_schema fixa o valor (const/enum).
    payload = req.get("payload") or {}
    props = target.get("properties", {}) if isinstance(target, dict) else {}
    if isinstance(payload, dict):
        for name in list(body.keys()):
            sub = props.get(name, {})
            if isinstance(sub, dict) and ("const" in sub or "enum" in sub):
                continue
            val = payload.get(name)
            if name in payload and isinstance(val, (str, int, float, bool)):
                body[name] = val
    # `classify_survivor` e o unico pedido cuja resposta e uma LISTA INDEXADA PELO
    # PEDIDO: uma entrada por mutante sobrevivente, com o `mutant_id` ecoado. O
    # sintetizador generico so sabe inventar UM item a partir de `items`/`minItems`, e
    # com um id inventado — challenge-verify.sh recusa isso (exit 2, "sobrevivente sem
    # classificacao"). Aqui a lista nasce do payload do PEDIDO, que e o que um modelo
    # real faria.
    #
    # A classificacao mecanica e `not_equivalent`, o lado CONSERVADOR que o proprio
    # response_schema manda escolher na duvida ("classificar como equivalent o que na
    # verdade e buraco entrega ao aluno um teste que aprova codigo errado"). O smoke
    # nunca aprova um desafio pela porta insegura: se o veredito depender de perdoar um
    # sobrevivente, ele NAO vem.
    if req.get("kind") == "classify_survivor":
        survivors = payload.get("survivors") or []
        body["classifications"] = [
            {
                "mutant_id": s.get("mutant_id"),
                "classification": "not_equivalent",
                "justification": (
                    "Resposta MECANICA do smoke: o modelo nao esta no laco, entao este "
                    "sobrevivente vai para o lado conservador (test_gap) sem exame do "
                    "diff. Nao e um julgamento sobre o mutante %s."
                    % s.get("mutant_id")
                ),
                "distinguishing_input": None,
                "suggested_scenario": None,
            }
            for s in survivors
            if isinstance(s, dict) and s.get("mutant_id")
        ]
        body["notes"] = (
            "Rodada sintetizada por tests/smoke.sh a partir do response_schema; "
            "nenhuma classificacao aqui e opiniao de modelo."
        )
    # docs/00-contratos.md §6.2: o ENVELOPE carrega `items`, e CADA item e uma
    # instancia do response_schema. Achatar o corpo na raiz e deixar items vazio
    # produz uma RESPOSTA que nenhum dos quatro consumidores aceita: os tres que
    # leem envelope fazem `.items[0]` e recebem {} — todo campo obrigatorio ausente.
    env = {
        "protocol": req.get("protocol", "study-method/request-apply"),
        "protocol_version": req.get("protocol_version", "1.0"),
        "request_id": req.get("request_id"),
        "kind": req.get("kind"),
        "items": [body],
    }
    json.dump(env, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    if errs:
        for e in errs:
            sys.stderr.write(e + "\n")
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PYEOF

# run_protocol <id> <descrição> <script> <args...>
# Roda o script; se ele sair com 10, sintetiza a RESPOSTA e re-invoca com --apply.
# RA-6: no máximo 2 ciclos.
run_protocol() {
  local id="$1" desc="$2"; shift 2
  local script="$1"; shift
  local out rc cycle=0
  while : ; do
    out="$("$script" "$@" 2>"$GATE_TMPDIR/err.txt")" && rc=0 || rc=$?
    if [ "$rc" = 10 ]; then
      cycle=$((cycle + 1))
      if [ "$cycle" -gt 2 ]; then
        gate_fail "$id" "$desc" "no máximo 2 ciclos REQUEST/APPLY (RA-6)" "o script pediu um 3º ciclo" "$script"
        return 1
      fi
      printf '%s' "$out" > "$GATE_TMPDIR/request.json"
      if ! jq -e '.protocol == "study-method/request-apply" and (.request_id|type=="string")' \
             "$GATE_TMPDIR/request.json" >/dev/null 2>&1; then
        gate_fail "$id" "$desc" "exit 10 acompanhado de um PEDIDO bem formado em stdout (RA-7)" \
          "$(gate_trunc "$out")" "$script"
        return 1
      fi
      if ! python3 "$SYNTH" "$GATE_TMPDIR/request.json" "$SCHEMAS" > "$GATE_TMPDIR/response.json" 2>"$GATE_TMPDIR/synth.err"; then
        gate_fail "$id" "$desc" "resposta sintetizável a partir do response_schema" \
          "$(gate_trunc "$(cat "$GATE_TMPDIR/synth.err")")" "$script"
        return 1
      fi
      gate_note "ciclo $cycle do protocolo: kind=$(jq -r .kind "$GATE_TMPDIR/request.json") — respondendo com --apply"
      set -- "$@" --apply "$GATE_TMPDIR/response.json"
      continue
    fi
    if [ "$rc" != 0 ]; then
      gate_fail "$id" "$desc" "exit 0 (ou 10 seguido de --apply bem-sucedido)" \
        "exit $rc — stderr: $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$script $*"
      return 1
    fi
    SMOKE_OUT="$out"
    gate_pass "$id" "$desc"
    return 0
  done
}

# validate_json <id> <arquivo> <schema>
validate_json() {
  local id="$1" file="$2" schema="$3"
  if [ ! -f "$file" ]; then gate_fail "$id" "$(gate_rel "$file") existe" "arquivo produzido pelo fluxo" "ausente" "$file"; return 1; fi
  if [ ! -f "$schema" ]; then gate_pend "$id" "validar $(basename "$file")" "schema ausente: $(gate_rel "$schema")"; return 1; fi
  local err
  if err="$(python3 "$VALIDATOR" "$file" "$schema" 2>&1)"; then
    gate_pass "$id" "$(basename "$file") valida contra $(basename "$schema")"
  else
    gate_fail "$id" "$(basename "$file") valida contra $(basename "$schema")" \
      "zero erros de validação" "$(gate_trunc "$err" 400)" "$file"
  fi
}

# ────────────────────────────────────────────────────── PASSO 1 · setup do zero
gate_section "PASSO 1 · criar um setup do zero"
if "$SCRIPTS/setup-init.sh" "$SETUP" --subject "Cálculo Diferencial" --subject-slug calculo \
     --title "Cálculo" --language python --skill-level beginner --session-minutes 45 \
     --theory-source student_provided > "$GATE_TMPDIR/setup_id.txt" 2>"$GATE_TMPDIR/err.txt"; then
  SETUP_ID="$(tr -d '[:space:]' < "$GATE_TMPDIR/setup_id.txt")"
  gate_pass "S-01a" "setup criado em $(gate_rel "$SETUP") com setup_id=$SETUP_ID"
else
  gate_fail "S-01a" "setup-init.sh cria o setup" "exit 0 e o setup_id em stdout" \
    "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/setup-init.sh"
fi
for d in memory researchs challenges docs; do
  [ -d "$SETUP/$d" ] && gate_pass "S-01b" "diretório $d/ criado" \
    || gate_fail "S-01b" "diretório $d/ criado" "os 4 diretórios de §3.2" "$d/ ausente" "$SETUP"
done
assert_file "S-01c" "$SETUP/setup.json" "setup.json na raiz do setup (nunca .study-method/)"
assert_file "S-01d" "$SETUP/.gitignore" ".gitignore gerado"
if [ -f "$SETUP/.gitignore" ]; then
  assert_match "S-01e" ".gitignore contém memory/" "$(cat "$SETUP/.gitignore")" '^memory/$' "$SETUP/.gitignore"
fi
run_protocol "S-01f" "readme-sync.sh --init escreve o README.md do setup" \
  "$SCRIPTS/readme-sync.sh" "$SETUP" --init || true
assert_file "S-01g" "$SETUP/README.md" "README.md do setup criado"

# ────────────────────────────────────────────────────── PASSO 2 · 3 sessões
gate_section "PASSO 2 · abrir e fechar 3 sessões"
SESSIONS=""
for i in 1 2 3; do
  if out="$("$SCRIPTS/session-new.sh" "$SETUP" --goal "sessão de smoke $i" 2>"$GATE_TMPDIR/err.txt")"; then
    nnnn="$(printf '%s' "$out" | tr -d '[:space:]')"
    SESSIONS="$SESSIONS $nnnn"
    gate_pass "S-02a" "sessão $i aberta como $nnnn"
  else
    gate_fail "S-02a" "session-new.sh abre a sessão $i" "exit 0 e o NNNN em stdout" \
      "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/session-new.sh"
    continue
  fi
  [ -f "$SETUP/memory/$nnnn.json" ] || gate_fail "S-02b" "memory/$nnnn.json em disco" \
    "a sessão é persistida na abertura (§2 passo 5)" "arquivo ausente" "$SETUP/memory"
  st="$(jq -r '.status // "?"' "$SETUP/memory/$nnnn.json" 2>/dev/null || echo '?')"
  assert_eq "S-02c" "sessão $nnnn nasce com status in_progress" "in_progress" "$st" "$SETUP/memory/$nnnn.json"
  run_protocol "S-02d" "session-close.sh fecha a sessão $nnnn" \
    "$SCRIPTS/session-close.sh" "$SETUP" --session "$nnnn" || true
  st="$(jq -r '.status // "?"' "$SETUP/memory/$nnnn.json" 2>/dev/null || echo '?')"
  case "$st" in
    completed|abandoned) gate_pass "S-02e" "sessão $nnnn saiu de in_progress (status=$st)" ;;
    *) gate_fail "S-02e" "sessão $nnnn saiu de in_progress" "completed ou abandoned (§2 passo 9)" "status=$st" "$SETUP/memory/$nnnn.json" ;;
  esac
done
[ -f "$SETUP/memory/.session.lock" ] \
  && gate_fail "S-02f" ".session.lock removido no fechamento" "sem lock após close_session" "lock presente" "$SETUP/memory/.session.lock" \
  || gate_pass "S-02f" ".session.lock removido no fechamento"
n_sessions="$(printf '%s' "$SESSIONS" | wc -w | tr -d ' ')"
assert_eq "S-02g" "3 sessões abertas e fechadas" "3" "$n_sessions" "$SETUP/memory"

# ─────────────────────────────────── PASSO 2b · o lock de sessão, vivo × vencido
# Regressão do modo de falha mais grave que o projeto teve: `memory-index.sh --verify`
# implementava a regra ANTIGA do lock (pid não-vazio + `kill -0`) e por isso lia como
# MORTO todo lock da via (b) de §7.4 — `pid: null`, o caso COMUM — fechando como
# `abandoned` a sessão que estava EM ANDAMENTO, com o aluno no meio da aula.
# Setup próprio: este passo precisa de uma sessão que fica ABERTA, e a do PASSO 2 fecha.
gate_section "PASSO 2b · o lock por TTL protege a sessão viva (§7.4)"
LOCKSETUP="$WORK/setup-lock"
if "$SCRIPTS/setup-init.sh" "$LOCKSETUP" --subject "Álgebra Linear" --subject-slug algebra \
     --title "Álgebra" --language python --skill-level beginner --session-minutes 45 \
     --theory-source student_provided >/dev/null 2>"$GATE_TMPDIR/err.txt"; then
  LK_N="$("$SCRIPTS/session-new.sh" "$LOCKSETUP" --goal "aula em andamento" 2>"$GATE_TMPDIR/err.txt" | tr -d '[:space:]')"
  LK_FILE="$LOCKSETUP/memory/$LK_N.json"
  LK_LOCK="$LOCKSETUP/memory/.session.lock"
  if [ -n "$LK_N" ] && [ -f "$LK_FILE" ] && [ -f "$LK_LOCK" ]; then
    assert_eq "S-02h" "sem SM_SESSION_OWNER_PID o lock nasce com pid null (via b de §7.4)" \
      "null" "$(jq -r '.pid' "$LK_LOCK" 2>/dev/null || echo '?')" "$LK_LOCK"

    "$SCRIPTS/memory-index.sh" "$LOCKSETUP" --verify >/dev/null 2>&1 || true
    assert_eq "S-02i" "--verify NÃO fecha a sessão viva de lock recente (o aluno está na aula)" \
      "in_progress" "$(jq -r '.status // "?"' "$LK_FILE" 2>/dev/null || echo '?')" "$LK_FILE"

    # envelhece o lock além do TTL: started_at 9 h antes do relógio congelado (TTL = 8 h)
    LK_EPOCH="$(date -d "$STUDY_METHOD_NOW" +%s)"
    LK_OLD="$(date -d "@$(( LK_EPOCH - 32400 ))" +%Y-%m-%dT%H:%M:%S%:z)"
    jq --arg s "$LK_OLD" '.started_at = $s' "$LK_LOCK" > "$LK_LOCK.aged" \
      && mv "$LK_LOCK.aged" "$LK_LOCK"
    touch -d "$LK_OLD" "$LK_LOCK"
    "$SCRIPTS/memory-index.sh" "$LOCKSETUP" --verify >/dev/null 2>&1 || true
    assert_eq "S-02j" "--verify fecha como abandonada a sessão cujo lock venceu o TTL" \
      "abandoned" "$(jq -r '.status // "?"' "$LK_FILE" 2>/dev/null || echo '?')" "$LK_FILE"
    assert_eq "S-02k" "a órfã recuperada carrega finalized_by auto_orphan_recovery" \
      "auto_orphan_recovery" "$(jq -r '.finalized_by // "?"' "$LK_FILE" 2>/dev/null || echo '?')" "$LK_FILE"
    [ -f "$LK_LOCK" ] \
      && gate_fail "S-02l" "o lock vencido é removido junto com a recuperação" \
         "sem .session.lock depois de --verify fechar a órfã" "lock presente" "$LK_LOCK" \
      || gate_pass "S-02l" "o lock vencido é removido junto com a recuperação"
  else
    gate_fail "S-02h" "session-new.sh abre a sessão do teste de lock" \
      "um NNNN.json e um .session.lock em disco" \
      "$(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$LOCKSETUP/memory"
  fi
else
  gate_fail "S-02h" "setup-init.sh cria o setup do teste de lock" "exit 0" \
    "$(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/setup-init.sh"
fi

# ────────────────────────────────────────────────────── PASSO 3 · desafio Python
gate_section "PASSO 3 · gerar 1 desafio Python e validá-lo pelo protocolo completo"
if out="$("$SCRIPTS/challenge-new.sh" "$SETUP" --language python --slug fatorial \
          --concept fatorial_recursivo --difficulty 2 2>"$GATE_TMPDIR/err.txt")"; then
  CH_REL="$(printf '%s' "$out" | tr -d '[:space:]')"
  CH_DIR="$SETUP/$CH_REL"
  gate_pass "S-03a" "desafio gerado em $CH_REL"
else
  CH_DIR=""
  gate_fail "S-03a" "challenge-new.sh gera o desafio" "exit 0 e o caminho relativo em stdout" \
    "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/challenge-new.sh"
fi
if [ -n "$CH_DIR" ] && [ -d "$CH_DIR" ]; then
  for want in meta.json README.md stub.py tests runner.sh .solution; do
    [ -e "$CH_DIR/$want" ] && gate_pass "S-03b" "desafio tem $want" \
      || gate_fail "S-03b" "desafio tem $want" "o esqueleto do perfil generic (§3.2)" "ausente" "$CH_DIR"
  done
  assert_match "S-03c" "o diretório do desafio usa o prefixo NNNN-<slug>" "$(basename "$CH_DIR")" '^[0-9]{4}-[a-z0-9-]+$' "$CH_DIR"
  run_protocol "S-03d" "challenge-verify.sh roda o protocolo completo" \
    "$SCRIPTS/challenge-verify.sh" "$CH_DIR" || true
  if [ -n "${SMOKE_OUT:-}" ]; then
    verdict="$(printf '%s' "$SMOKE_OUT" | jq -r '.verdict // "?"' 2>/dev/null || echo '?')"
    # ⭐ O esperado é `approved`, e nada menos. A semente canônica em Python é um desafio
    # BEM FORMADO por construção — stub vazio falha, referência passa, as duas alternativas
    # passam, o catálogo fixo mata 12 de 13 — e o produto inteiro existe para entregar
    # desafio validado ao aluno. Aceitar `approved|weak|rejected`, como esta asserção fazia,
    # é aceitar QUALQUER coisa: foi por isso que o smoke ficou 62/62 verde enquanto NENHUM
    # desafio Python ou JS conseguia ser aprovado (sm_json_get emitia uma linha vazia onde
    # jq não emitia nada, `build_command` vazio virava comando vazio, exit 127,
    # `build_failed` no passo 0). Um teste que aceita qualquer resultado não testa nada.
    if [ "$verdict" = approved ]; then
      gate_pass "S-03e" "veredito do harness: approved"
    else
      gate_fail "S-03e" "challenge-verify.sh aprova a semente canônica em Python" \
        "approved (a semente é bem formada por construção; DES-2 só deixa approved virar validated)" \
        "«$verdict» — rejeições: $(gate_trunc "$(jq -rc '[.validation.rejections[]? | "\(.code): \(.message)"] | join(" | ")' "$CH_DIR/meta.json" 2>/dev/null || echo '?')")" \
        "stdout de challenge-verify.sh + $CH_DIR/meta.json"
    fi
    cs="$(jq -r '.challenge_status // "?"' "$CH_DIR/meta.json" 2>/dev/null || echo '?')"
    if [ "$verdict" = approved ]; then
      assert_eq "S-03f" "só approved libera challenge_status validated (DES-2)" "validated" "$cs" "$CH_DIR/meta.json"
    else
      assert_ne "S-03f" "veredito não-approved NUNCA vira validated (DES-2)" "validated" "$cs" "$CH_DIR/meta.json"
    fi
    # Os 7 passos, um a um: `approved` sem saber QUAL passo rodou não prova protocolo.
    naopassou="$(jq -r '[.validation.steps | to_entries[]
                         | select(.value.status != "passed" and .value.status != "not_applicable")
                         | "\(.key)=\(.value.status)"] | join(" ")' "$CH_DIR/meta.json" 2>/dev/null || echo '?')"
    assert_eq "S-03g" "os 7 passos do protocolo passaram (nenhum skipped, nenhum failed)" \
      "" "$naopassou" "$CH_DIR/meta.json → validation.steps"
    # O passo 6 casa NOME por NOME: é o que pega scenarios[].test_name gravado num formato
    # que o runner nunca reporta (nome qualificado onde o runner imprime o curto).
    s6exp="$(jq -r '.validation.steps.step_6_counts.expected // -1' "$CH_DIR/meta.json" 2>/dev/null || echo -1)"
    s6obs="$(jq -r '.validation.steps.step_6_counts.observed // -2' "$CH_DIR/meta.json" 2>/dev/null || echo -2)"
    assert_eq "S-03h" "passo 6: os casos executados são exatamente os scenarios[].test_name declarados" \
      "$s6exp" "$s6obs" "$CH_DIR/meta.json → validation.steps.step_6_counts"
    # A mutação rodou DE VERDADE: catálogo não-vazio, mutantes válidos e mortos de fato.
    mut="$(jq -r '"\(.validation.mutation.valid // 0)/\(.validation.mutation.killed // 0)"' "$CH_DIR/meta.json" 2>/dev/null || echo '0/0')"
    if [ "${mut%%/*}" -gt 0 ] 2>/dev/null && [ "${mut##*/}" -gt 0 ] 2>/dev/null; then
      gate_pass "S-03i" "passo 4 rodou de verdade: ${mut##*/} mutantes mortos de ${mut%%/*} válidos (score $(jq -r '.validation.mutation.score // "?"' "$CH_DIR/meta.json"))"
    else
      gate_fail "S-03i" "o passo 4 executa o catálogo fixo de mutantes" \
        "valid > 0 e killed > 0" "valid/killed = $mut" "$CH_DIR/meta.json → validation.mutation"
    fi
  fi
fi

# ─────────────────── PASSO 3b · desafio Rust — compile-failure vira rejected (exit 0)
# Regressão do bug "Erro ao gerar a aula: challenge-verify.sh falhou (exit 1)": um
# desafio Rust cujo teste NÃO COMPILA (cargo test → exit 101, zero linhas "running N
# tests") derrubava o script com exit 1 e stderr vazio — com `set -o pipefail`, as
# pipelines de probe (grep|awk) que não casavam morriam antes de devolver a contagem.
# Hoje devolvem valor neutro e o fluxo segue até o veredito `rejected` com exit 0
# (docs/00-contratos.md §5.1: weak/rejected saem exit 0 com o veredito no stdout).
# O caminho feliz também é coberto: o esqueleto canônico Rust (crate SEMPRE
# `desafio`, layout cargo_crate) precisa fechar `approved` de ponta a ponta.
# Requer cargo instalado (sondado por `command -v`): sem ele o passo inteiro fica PEND.
gate_section "PASSO 3b · desafio Rust — compile-failure vira rejected (exit 0)"
if command -v cargo >/dev/null 2>&1; then
  gate_pass "S-03j" "toolchain cargo disponível ($(command -v cargo))"

  RSETUP="$WORK/setup-rust"
  if "$SCRIPTS/setup-init.sh" "$RSETUP" --subject "Estruturas de Dados" --subject-slug estruturas \
       --title "Estruturas" --language rust --skill-level beginner --session-minutes 45 \
       --theory-source student_provided >/dev/null 2>"$GATE_TMPDIR/err.txt"; then
    gate_pass "S-03k" "setup rust criado em $(gate_rel "$RSETUP")"
  else
    gate_fail "S-03k" "setup-init.sh cria o setup rust" "exit 0 e o setup_id em stdout" \
      "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/setup-init.sh"
  fi

  if out="$("$SCRIPTS/challenge-new.sh" "$RSETUP" --language rust --slug arvore \
            --concept arvore_recursiva --difficulty 2 2>"$GATE_TMPDIR/err.txt")"; then
    ROK_REL="$(printf '%s' "$out" | tr -d '[:space:]')"
    ROK_DIR="$RSETUP/$ROK_REL"
    gate_pass "S-03l" "desafio rust (esqueleto) gerado em $ROK_REL"
  else
    ROK_DIR=""
    gate_fail "S-03l" "challenge-new.sh gera o desafio rust" "exit 0 e o caminho relativo em stdout" \
      "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/challenge-new.sh"
  fi
  if [ -n "$ROK_DIR" ] && [ -d "$ROK_DIR" ]; then
    # O crate fixo `desafio` é o que o prompt do autor ensina (deepseekLessonAuthor.ts):
    # o teste do desafio substitui o arquivo inteiro de tests/test_stub.rs e importa
    # `use desafio::<fn>;` — um import de crate errado (ex.: `invert_tree`) NÃO compila.
    assert_match "S-03m" "o Cargo.toml declara o crate fixo \`desafio\`" \
      "$(grep -E '^name[[:space:]]*=' "$ROK_DIR/Cargo.toml" 2>/dev/null || true)" \
      '^name[[:space:]]*=[[:space:]]*"desafio"' "$ROK_DIR/Cargo.toml"
    assert_match "S-03n" "tests/test_stub.rs importa \`use desafio::<fn>;\` (o contrato do prompt do autor)" \
      "$(grep -E '^use desafio::' "$ROK_DIR/tests/test_stub.rs" 2>/dev/null || true)" \
      '^use desafio::' "$ROK_DIR/tests/test_stub.rs"

    # NÃO sobrescreve nada: o esqueleto canônico precisa ser aprovado como está.
    SMOKE_OUT=""  # o PASSO 3 (python) deixou o valor anterior; só leio o que ESTE passo escreveu
    run_protocol "S-03o" "challenge-verify.sh roda o protocolo completo no esqueleto Rust intacto" \
      "$SCRIPTS/challenge-verify.sh" "$ROK_DIR" || true
    if [ -n "${SMOKE_OUT:-}" ]; then
      rv_ok="$(printf '%s' "$SMOKE_OUT" | jq -r '.verdict // "?"' 2>/dev/null || echo '?')"
      if [ "$rv_ok" = approved ]; then
        gate_pass "S-03p" "veredito do harness no esqueleto rust: approved"
      else
        gate_fail "S-03p" "challenge-verify.sh aprova a semente canônica em Rust" \
          "approved (o esqueleto é bem formado por construção; DES-2 só deixa approved virar validated)" \
          "«$rv_ok» — rejeições: $(gate_trunc "$(jq -rc '[.validation.rejections[]? | "\(.code): \(.message)"] | join(" | ")' "$ROK_DIR/meta.json" 2>/dev/null || echo '?')")" \
          "stdout de challenge-verify.sh + $ROK_DIR/meta.json"
      fi
    fi

    # ── o cenário da regressão: teste que NÃO compila (cargo test → 101, zero "running N tests")
    if out="$("$SCRIPTS/challenge-new.sh" "$RSETUP" --language rust --slug invert \
              --concept arvore_recursiva --difficulty 2 2>"$GATE_TMPDIR/err.txt")"; then
      RBAD_REL="$(printf '%s' "$out" | tr -d '[:space:]')"
      RBAD_DIR="$RSETUP/$RBAD_REL"
      gate_pass "S-03q" "desafio rust da regressão gerado em $RBAD_REL"
      cat > "$RBAD_DIR/tests/test_stub.rs" <<'RSEOF'
// Regressão do bug "challenge-verify.sh falhou (exit 1)": este teste NÃO compila.
// O crate do desafio é `desafio` (Cargo.toml); `invert_tree` não existe → E0432,
// cargo test sai 101 e NENHUMA linha "running N tests" é impressa — exatamente o
// cenário em que o pipefail matava o verify com exit 1 e stderr vazio.
use invert_tree::*;

#[test]
fn caso_nao_compila() {
    assert_eq!(2 + 2, 4);
}
RSEOF
      if out="$("$SCRIPTS/challenge-verify.sh" "$RBAD_DIR" 2>"$GATE_TMPDIR/err.txt")"; then
        gate_pass "S-03r" "verify com teste que não compila sai exit 0 (nunca exit 1)"
        ROUT="$out"
      else
        rc=$?
        gate_fail "S-03r" "verify com teste que não compila sai exit 0 (nunca exit 1)" \
          "exit 0 — o compile-failure vira veredito rejected no stdout (§5.1)" \
          "exit $rc — stderr: $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/challenge-verify.sh"
      fi
      if [ -n "${ROUT:-}" ]; then
        rv="$(printf '%s' "$ROUT" | jq -r '.verdict // "?"' 2>/dev/null || echo '?')"
        rn="$(printf '%s' "$ROUT" | jq -r '[.rejections[]?] | length' 2>/dev/null || echo '?')"
        if [ "$rv" = rejected ] && [ "${rn:-0}" -gt 0 ]; then
          gate_pass "S-03s" "veredito rejected com $rn rejeição(ões) de diagnóstico no stdout"
        else
          gate_fail "S-03s" "compile-failure devolve veredito rejected com diagnóstico" \
            "verdict=rejected e rejections não-vazia no stdout" \
            "«$rv» com $rn rejeições — stdout: $(gate_trunc "$ROUT")" "stdout de challenge-verify.sh"
        fi
        cs_r="$(jq -r '.challenge_status // "?"' "$RBAD_DIR/meta.json" 2>/dev/null || echo '?')"
        assert_ne "S-03t" "compile-failure NUNCA vira challenge_status validated (DES-2)" \
          "validated" "$cs_r" "$RBAD_DIR/meta.json"
        s1exit="$(jq -r '.validation.steps.step_1_empty_stub.exit_code // -1' "$RBAD_DIR/meta.json" 2>/dev/null || echo -1)"
        assert_eq "S-03u" "o passo 1 registra cargo test exit 101 (erro de compilação, não caso falho)" \
          "101" "$s1exit" "$RBAD_DIR/meta.json → validation.steps.step_1_empty_stub"
      fi
    else
      gate_fail "S-03q" "challenge-new.sh gera o desafio rust da regressão" \
        "exit 0 e o caminho relativo em stdout" \
        "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/challenge-new.sh"
    fi
  fi
  if [ -n "${ROK_DIR:-}" ] && [ -f "$ROK_DIR/meta.json" ]; then
    validate_json "S-03v" "$ROK_DIR/meta.json" "$SCHEMAS/challenge-manifest.schema.json"
  fi
else
  gate_pend "S-03j" "toolchain cargo disponível para o cenário Rust" \
    "cargo não está no PATH — o PASSO 3b inteiro fica pendente (registrado, não escondido)"
fi

# ────────────────────────────────────────────────────── PASSO 4 · gráfico
gate_section "PASSO 4 · renderizar 1 gráfico"
SPEC="$GATE_TMPDIR/spec.json"
cat > "$SPEC" <<'JSONEOF'
{
  "type": "line",
  "title": "Erro da diferença progressiva em função de h",
  "takeaway": "O erro cai até h ≈ 1e-8 e volta a subir por cancelamento numérico.",
  "x_label": "h (passo)",
  "y_label": "erro absoluto",
  "series": [
    { "label": "diferença progressiva", "points": [[1.0, 0.5], [0.1, 0.05], [0.01, 0.005], [0.001, 0.0006]] }
  ]
}
JSONEOF
OUTDIR="$WORK/viz"; mkdir -p "$OUTDIR"
# SEM `--quiet`: docs/build-spec/70-render.md §2 e docs/06-visualizacao.md §5 dizem que
# `--quiet` SUPRIME o JSON de stdout ("documentado como «nunca use»: sem stdout o modelo
# fica cego sobre o que desenhou"). Pedir --quiet e depois exigir `ok` e `description_text`
# no stdout é exigir o que a flag existe para não entregar — S-04b e S-04e nunca poderiam
# passar. É justamente esse stdout que VIZ-2 obriga a existir.
if out="$("$SCRIPTS/render-plot.py" --spec "$SPEC" --out-dir "$OUTDIR" --basename erro-h \
          --formats svg,html,txt,md 2>"$GATE_TMPDIR/err.txt")"; then
  gate_pass "S-04a" "render-plot.py rendeu o gráfico"
  ok="$(printf '%s' "$out" | jq -r '.ok // false' 2>/dev/null || echo false)"
  assert_eq "S-04b" "a saída JSON traz ok=true" "true" "$ok" "stdout de render-plot.py"
  for ext in svg html txt md; do
    [ -f "$OUTDIR/erro-h.$ext" ] && gate_pass "S-04c" "saída .$ext gerada" \
      || gate_fail "S-04c" "saída .$ext gerada" "as 4 saídas obrigatórias (VIZ-1)" "erro-h.$ext ausente" "$OUTDIR"
  done
  if [ -f "$OUTDIR/erro-h.html" ]; then
    bad="$(grep -nE '<script[^>]+src=|<link[^>]+href=|https?://' "$OUTDIR/erro-h.html" || true)"
    assert_grep_empty "S-04d" "o HTML é autocontido" "sem <script src>, sem <link>, sem CDN (VIZ-1)" "$bad"
  fi
  dt="$(printf '%s' "$out" | jq -r '.description_text // ""' 2>/dev/null || true)"
  [ -n "$dt" ] && gate_pass "S-04e" "description_text presente (VIZ-2: você não enxerga o que gerou)" \
    || gate_fail "S-04e" "description_text presente" "descrição textual no stdout (VIZ-2)" "vazia" "stdout de render-plot.py"
else
  gate_fail "S-04a" "render-plot.py rende o gráfico" "exit 0" \
    "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/render-plot.py"
fi

# ────────────────────────────────────────────────────── PASSO 5 · idempotência
gate_section "PASSO 5 · readme-sync.sh e prova de idempotência"
if "$SCRIPTS/readme-sync.sh" "$SETUP" >/dev/null 2>"$GATE_TMPDIR/err.txt"; then
  cp "$SETUP/README.md" "$GATE_TMPDIR/readme-1.md"
  if "$SCRIPTS/readme-sync.sh" "$SETUP" >/dev/null 2>&1; then
    if diff -q "$GATE_TMPDIR/readme-1.md" "$SETUP/README.md" >/dev/null; then
      gate_pass "S-05a" "readme-sync.sh é idempotente (byte a byte)"
    else
      gate_fail "S-05a" "readme-sync.sh é idempotente" "duas execuções seguidas produzem o mesmo arquivo (§8)" \
        "$(gate_trunc "$(diff "$GATE_TMPDIR/readme-1.md" "$SETUP/README.md" | head -8)")" "$SETUP/README.md"
    fi
  else
    gate_fail "S-05a" "readme-sync.sh roda duas vezes" "exit 0 na segunda execução" "exit != 0" "$SCRIPTS/readme-sync.sh"
  fi
  miss=""
  for s in identidade taxonomia base-teorica destilados desafios linha-do-tempo pontes estado-atual; do
    grep -qF "study-method:begin $s" "$SETUP/README.md" || miss="$miss $s"
  done
  assert_grep_empty "S-05b" "as 8 seções de marcador estão no README.md do setup" \
    "identidade · taxonomia · base-teorica · destilados · desafios · linha-do-tempo · pontes · estado-atual (§3.5)" \
    "$( [ -n "$miss" ] && printf 'faltam:%s' "$miss" )"
  gen_lines="$(awk '/study-method:begin/{f=1} f{n++} /study-method:end estado-atual/{f=0} END{print n+0}' "$SETUP/README.md")"
  if [ "${gen_lines:-0}" -le 200 ]; then
    gate_pass "S-05c" "parte gerada do README com $gen_lines linhas (teto 200)"
  else
    gate_fail "S-05c" "parte gerada do README dentro do teto" "≤200 linhas (§3.5)" "$gen_lines linhas" "$SETUP/README.md"
  fi
else
  gate_fail "S-05a" "readme-sync.sh roda no setup pronto" "exit 0" \
    "exit $? — $(gate_trunc "$(cat "$GATE_TMPDIR/err.txt")")" "$SCRIPTS/readme-sync.sh"
fi

# ────────────────────────────────────────────────────── PASSO 6 · todo JSON valida
gate_section "PASSO 6 · todo JSON produzido valida contra o schema dono"
validate_json "S-06a" "$SETUP/setup.json" "$SCHEMAS/setup-manifest.schema.json"
for f in "$SETUP"/memory/[0-9][0-9][0-9][0-9].json; do
  [ -e "$f" ] || continue
  validate_json "S-06b" "$f" "$SCHEMAS/session.schema.json"
done
validate_json "S-06c" "$SETUP/memory/INDEX.json" "$SCHEMAS/index.schema.json"
[ -f "$SETUP/memory/profile.json" ]  && validate_json "S-06d" "$SETUP/memory/profile.json"  "$SCHEMAS/profile.schema.json"
[ -f "$SETUP/memory/progress.json" ] && validate_json "S-06e" "$SETUP/memory/progress.json" "$SCHEMAS/progress.schema.json"
[ -f "$SETUP/memory/docs-index.json" ] && validate_json "S-06f" "$SETUP/memory/docs-index.json" "$SCHEMAS/docs-index.schema.json"
[ -n "${CH_DIR:-}" ] && [ -f "$CH_DIR/meta.json" ] && validate_json "S-06g" "$CH_DIR/meta.json" "$SCHEMAS/challenge-manifest.schema.json"
validate_json "S-06h" "$STUDY_METHOD_HOME/registry.json" "$SCHEMAS/registry.schema.json"

# nenhum {{ }} sobrando em artefato materializado, e nenhum caminho absoluto gravado
leftover="$(grep -rlE '\{\{[A-Za-z0-9_]+\}\}' "$SETUP" 2>/dev/null || true)"
assert_grep_empty "S-06i" "nenhum placeholder {{ }} sobrou em artefato materializado" \
  "todo {{NOME}} substituído na materialização" "$leftover"
abs="$(grep -rlE '"[^"]*":[[:space:]]*"/[^"]*"' "$SETUP"/memory "$SETUP"/setup.json 2>/dev/null || true)"
assert_grep_empty "S-06j" "nenhum caminho absoluto gravado dentro do setup" \
  "o único absoluto do sistema é registry.json → setups[].path (§3.4, I-37)" "$abs"

gate_summary
