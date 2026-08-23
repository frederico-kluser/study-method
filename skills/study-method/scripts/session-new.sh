#!/usr/bin/env bash
# session-new.sh — passo `open_session` (docs/00-contratos.md §2, passo 5).
#
# Aloca o próximo NNNN, materializa `memory/NNNN.json` com `status: "in_progress"` e
# toma o lock da sessão. Determinístico: nunca fala com o aluno, nunca chama o modelo.
#
# Exit codes (docs/00-contratos.md §5.1): 0 · 1 · 2 · 3 · 4 (lock vivo) · 5
set -euo pipefail

SM_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/json.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/json.sh"

SM_SK_ROOT="$(cd -- "$SM_SCRIPT_DIR/.." && pwd -P)"
SM_SCHEMA_DIR="$SM_SK_ROOT/assets/schemas"
SM_TEMPLATE_DIR="$SM_SK_ROOT/assets/templates"
SM_SESSION_SCHEMA_VERSION="1.0"

sn_usage() {
  cat <<'EOF'
uso: session-new.sh <setup_root> [--goal <texto>]

Passo `open_session`: aloca o próximo NNNN em memory/, grava memory/NNNN.json com
status "in_progress" e toma memory/.session.lock. Imprime o NNNN alocado em stdout.

argumentos
  <setup_root>        raiz do setup do aluno (ou um caminho dentro dele; a raiz é
                      resolvida subindo até $HOME procurando setup.json)
  --goal <texto>      o que o aluno quer conseguir hoje, em uma frase (pt-BR).
                      Vira `goal` e o `one_line_summary` provisório da sessão.
  -h, --help          esta ajuda

exit codes
  0 ok · 1 erro de execução · 2 uso incorreto · 3 setup não encontrado
  4 sessão viva (lock ocupado) · 5 o NNNN.json produzido não valida
EOF
}

# --------------------------------------------------------------------------- args
sn_hint=""
sn_goal=""
while (($#)); do
  case "$1" in
    -h|--help) sn_usage; exit 0 ;;
    --goal)    [[ $# -ge 2 ]] || sm_die 2 "--goal exige um valor."; sn_goal="$2"; shift 2 ;;
    --goal=*)  sn_goal="${1#--goal=}"; shift ;;
    --)        shift; break ;;
    -*)        sm_die 2 "flag desconhecida: $1 (veja --help)." ;;
    *)         if [[ -z "$sn_hint" ]]; then sn_hint="$1"; shift
               else sm_die 2 "argumento posicional extra: $1"; fi ;;
  esac
done
[[ $# -eq 0 ]] || sm_die 2 "argumento posicional extra: $1"

sm_require_cmd jq || sm_die 1 "jq é obrigatório para session-new.sh."

if ! SM_SETUP_ROOT="$(sm_setup_root "$sn_hint")"; then
  sm_die 3 "nenhum setup.json legível em '${sn_hint:-$PWD}' nem em nenhum ancestral até \$HOME."
fi

SM_MEMORY_DIR="$SM_SETUP_ROOT/memory"
SM_LOCK_FILE="$SM_MEMORY_DIR/.session.lock"

# ------------------------------------------------------------------- lock vivo?
# docs/01-arquitetura.md §4: lock_vivo ⇔ o arquivo existe ∧ hostname bate ∧ kill -0 pid
# sucede. Sonda somente-leitura ANTES de alocar o NNNN: assim o caminho comum de
# "sessão concorrente" não deixa um memory/NNNN.json vazio para trás.
sn_lock_alive() {
  local lock="$1" pid host
  [[ -f "$lock" ]] || return 1
  sm_json_ok "$lock" || return 1
  pid="$(sm_json_get "$lock" '.pid // empty')" || return 1
  host="$(sm_json_get "$lock" '.hostname // empty')" || return 1
  [[ -n "$pid" && -n "$host" ]] || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [[ "$host" == "$(uname -n)" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  return 0
}

if sn_lock_alive "$SM_LOCK_FILE"; then
  sn_other="$(sm_json_get "$SM_LOCK_FILE" '.session_id // "?"' 2>/dev/null || printf '?')"
  sm_die 4 "já há uma sessão viva neste setup (session_id ${sn_other}). Feche-a com session-close.sh, ou siga em modo somente-leitura (sem gravar NNNN.json)."
fi

# ------------------------------------------------------------------ diretórios
if [[ ! -d "$SM_MEMORY_DIR" ]]; then
  mkdir -p -- "$SM_MEMORY_DIR" || sm_die 1 "não consegui criar '$SM_MEMORY_DIR'."
  sm_chmod_private "$SM_MEMORY_DIR" || true
  sm_log warn "recriei o diretório estrutural memory/ (estrutura, não conteúdo)."
fi
[[ -w "$SM_MEMORY_DIR" ]] || sm_die 1 "sem permissão de escrita em '$SM_MEMORY_DIR'."

# ---------------------------------------------------------------- dados fixos
sn_setup_id=""
if [[ -r "$SM_SETUP_ROOT/setup.json" ]] && sm_json_ok "$SM_SETUP_ROOT/setup.json"; then
  sn_setup_id="$(sm_json_get "$SM_SETUP_ROOT/setup.json" '.setup_id // empty' || printf '')"
fi
sn_date="$(sm_today)"
sn_started_at="$(sm_now_iso)"

if [[ -n "$sn_goal" ]]; then
  sn_summary="Sessão em andamento: $sn_goal"
else
  sn_summary="Sessão iniciada, ainda sem resumo."
fi
# one_line_summary é obrigatório em TODO instante (docs/03-memoria.md §2): 160 chars.
sn_summary="${sn_summary:0:160}"

# ------------------------------------------------------------------- template
# Placeholders congelados em SK/assets/templates/MANIFEST.tsv:
#   session/session.json.tmpl -> SESSION_ID, SETUP_ID, DATE, STARTED_AT, SCHEMA_VERSION
sn_template_path="$SM_TEMPLATE_DIR/session/session.json.tmpl"
sn_read_template() {
  if [[ -f "$sn_template_path" ]]; then
    cat -- "$sn_template_path"
    return 0
  fi
  sm_log warn "template ausente ($sn_template_path); usando o esqueleto interno equivalente."
  cat <<'TMPL'
{
  "schema_version": "{{SCHEMA_VERSION}}",
  "session_id": "{{SESSION_ID}}",
  "setup_id": "{{SETUP_ID}}",
  "date": "{{DATE}}",
  "started_at": "{{STARTED_AT}}",
  "status": "in_progress",
  "one_line_summary": "Sessão iniciada, ainda sem resumo.",
  "topics": [],
  "goal": null,
  "plan": null,
  "artifacts": [],
  "cross_setup_refs": [],
  "validation_errors": []
}
TMPL
}

# ------------------------------------------------------------------ alocação
if ! sn_nnnn="$(sm_next_seq "$SM_MEMORY_DIR" .json)"; then
  sm_die 4 "não consegui alocar um NNNN livre em memory/ após 5 tentativas."
fi
[[ "$sn_nnnn" =~ ^[0-9]{4}$ ]] || sm_die 1 "sm_next_seq devolveu um NNNN inválido: '$sn_nnnn'."
sn_file="$SM_MEMORY_DIR/$sn_nnnn.json"

sn_rollback() { rm -f -- "$sn_file"; }

sn_doc="$(sn_read_template)"
sn_doc="${sn_doc//\{\{SCHEMA_VERSION\}\}/$SM_SESSION_SCHEMA_VERSION}"
sn_doc="${sn_doc//\{\{SESSION_ID\}\}/$sn_nnnn}"
sn_doc="${sn_doc//\{\{SETUP_ID\}\}/$sn_setup_id}"
sn_doc="${sn_doc//\{\{DATE\}\}/$sn_date}"
sn_doc="${sn_doc//\{\{STARTED_AT\}\}/$sn_started_at}"

if [[ "$sn_doc" == *'{{'* ]]; then
  sn_rollback
  sm_die 1 "o template de sessão não foi materializado por completo: sobrou placeholder {{…}}."
fi

# Campos que não vêm do template: goal, one_line_summary provisório e a limpeza do
# setup_id vazio (o schema exige ^[0-9a-f]{12}$ quando a chave existe).
if ! sn_doc="$(printf '%s' "$sn_doc" | jq \
      --arg summary "$sn_summary" \
      --arg goal "$sn_goal" \
      '. as $d
       | $d
       | .one_line_summary = $summary
       | (if $goal == "" then .goal = null else .goal = $goal end)
       | (if (.setup_id // "") == "" then del(.setup_id) else . end)')"; then
  sn_rollback
  sm_die 5 "o esqueleto da sessão não é JSON válido depois da materialização."
fi

# Valida ANTES de gravar: nada de NNNN.json inválido em disco.
if ! sm_json_validate <(printf '%s\n' "$sn_doc") "$SM_SCHEMA_DIR/session.schema.json"; then
  sn_rollback
  sm_die 5 "o memory/$sn_nnnn.json produzido não valida contra session.schema.json."
fi

if ! printf '%s\n' "$sn_doc" | sm_atomic_write "$sn_file"; then
  sn_rollback
  sm_die 1 "falha ao gravar '$sn_file'."
fi

# --------------------------------------------------------------------- o lock
# O lock é tomado DEPOIS de a sessão existir em disco: `sm_setup_lock` grava
# session_id, e é este NNNN que ele grava (docs/00-contratos.md §7.1).
SM_SESSION_ID="$sn_nnnn"
export SM_SESSION_ID
if ! sm_setup_lock "$SM_SETUP_ROOT"; then
  # Corrida: alguém tomou o lock entre a sonda e agora. Desfaz a alocação.
  sn_rollback
  sm_die 4 "outra sessão tomou o lock deste setup enquanto esta abria. Nada foi gravado."
fi

sm_log info "sessão $sn_nnnn aberta em $(sm_relpath "$sn_file" "$SM_SETUP_ROOT")."
printf '%s\n' "$sn_nnnn"
