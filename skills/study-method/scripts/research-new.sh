#!/usr/bin/env bash
# research-new.sh — aloca um destilado em `researchs/NNNN.md` (passo `teach`).
#
# Materializa o template com o BLOCO DE PROVENIÊNCIA da primeira linha
# (docs/00-contratos.md §3.4): comentário HTML com JSON, legível por `jq`.
# Frontmatter YAML é proibido em artefato gerado — não há PyYAML nesta máquina.
#
# Exit codes (docs/00-contratos.md §5.1): 0 · 1 · 2 · 3 · 4
set -euo pipefail

SM_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/json.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/json.sh"

SM_SK_ROOT="$(cd -- "$SM_SCRIPT_DIR/.." && pwd -P)"
SM_TEMPLATE_DIR="$SM_SK_ROOT/assets/templates"
SM_RESEARCH_SCHEMA_VERSION="1.0"

rn_usage() {
  cat <<'EOF'
uso: research-new.sh <setup_root> --topic <slug> [--sources <csv>] [--session <NNNN>]

Aloca researchs/NNNN.md e materializa o template com o bloco de proveniência
(docs/00-contratos.md §3.4). Imprime o caminho relativo criado em stdout.

argumentos
  <setup_root>        raiz do setup do aluno (ou um caminho dentro dele)
  --topic <slug>      tópico do destilado, em kebab-case (^[a-z0-9]+(-[a-z0-9]+)*$).
                      Rótulo em pt-BR é normalizado por sm_normalize_slug.
  --sources <csv>     caminhos RELATIVOS à raiz do setup, separados por vírgula.
                      Com fontes -> provenance "generated_researched";
                      sem fontes -> provenance "generated_unsourced".
  --session <NNNN>    sessão que criou este destilado. Sem a flag, é lido de
                      memory/.session.lock; se não houver lock, fica null.
  -h, --help          esta ajuda

exit codes
  0 ok · 1 erro de execução · 2 uso incorreto · 3 setup não encontrado
  4 não consegui alocar um NNNN livre
EOF
}

# --------------------------------------------------------------------------- args
rn_hint=""
rn_topic_raw=""
rn_sources_csv=""
rn_session=""
while (($#)); do
  case "$1" in
    -h|--help)   rn_usage; exit 0 ;;
    --topic)     [[ $# -ge 2 ]] || sm_die 2 "--topic exige um valor."; rn_topic_raw="$2"; shift 2 ;;
    --topic=*)   rn_topic_raw="${1#--topic=}"; shift ;;
    --sources)   [[ $# -ge 2 ]] || sm_die 2 "--sources exige um valor."; rn_sources_csv="$2"; shift 2 ;;
    --sources=*) rn_sources_csv="${1#--sources=}"; shift ;;
    --session)   [[ $# -ge 2 ]] || sm_die 2 "--session exige um valor."; rn_session="$2"; shift 2 ;;
    --session=*) rn_session="${1#--session=}"; shift ;;
    --)          shift; break ;;
    -*)          sm_die 2 "flag desconhecida: $1 (veja --help)." ;;
    *)           if [[ -z "$rn_hint" ]]; then rn_hint="$1"; shift
                 else sm_die 2 "argumento posicional extra: $1"; fi ;;
  esac
done
[[ $# -eq 0 ]] || sm_die 2 "argumento posicional extra: $1"
[[ -n "$rn_topic_raw" ]] || sm_die 2 "--topic é obrigatório."
[[ -z "$rn_session" || "$rn_session" =~ ^[0-9]{4}$ ]] || sm_die 2 "--session precisa ser NNNN (4 dígitos): '$rn_session'."

sm_require_cmd jq || sm_die 1 "jq é obrigatório para research-new.sh."

if ! SM_SETUP_ROOT="$(sm_setup_root "$rn_hint")"; then
  sm_die 3 "nenhum setup.json legível em '${rn_hint:-$PWD}' nem em nenhum ancestral até \$HOME."
fi

if ! rn_topic="$(sm_normalize_slug "$rn_topic_raw")"; then
  sm_die 2 "'--topic $rn_topic_raw' não produz um slug utilizável."
fi
[[ "$rn_topic" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || sm_die 2 "slug inválido depois da normalização: '$rn_topic'."

# --------------------------------------------------------------- sources[] (§3.4)
# "sources[] são caminhos RELATIVOS à raiz do setup. Nenhum caminho absoluto é
#  gravado em arquivo nenhum do setup — o setup pode ser movido."
rn_sources_json='[]'
if [[ -n "$rn_sources_csv" ]]; then
  rn_list=()
  IFS=',' read -r -a rn_raw_sources <<<"$rn_sources_csv"
  for rn_s in "${rn_raw_sources[@]}"; do
    rn_s="${rn_s#"${rn_s%%[![:space:]]*}"}"   # ltrim
    rn_s="${rn_s%"${rn_s##*[![:space:]]}"}"   # rtrim
    [[ -n "$rn_s" ]] || continue
    if [[ "$rn_s" == /* ]]; then
      if ! rn_s="$(sm_relpath "$rn_s" "$SM_SETUP_ROOT")"; then
        sm_die 2 "fonte fora da raiz do setup: '$rn_s'. Só caminhos relativos ao setup entram em sources[]."
      fi
    fi
    rn_list+=("$rn_s")
  done
  if ((${#rn_list[@]})); then
    rn_sources_json="$(jq -n -c '$ARGS.positional' --args "${rn_list[@]}")"
  fi
fi

# ------------------------------------------------------ sessão que está criando
if [[ -z "$rn_session" && -f "$SM_SETUP_ROOT/memory/.session.lock" ]]; then
  if sm_json_ok "$SM_SETUP_ROOT/memory/.session.lock"; then
    rn_session="$(sm_json_get "$SM_SETUP_ROOT/memory/.session.lock" '.session_id // empty' || printf '')"
    [[ "$rn_session" =~ ^[0-9]{4}$ ]] || rn_session=""
  fi
fi

# --------------------------------------------------------------------- template
# Placeholders congelados em SK/assets/templates/MANIFEST.tsv:
#   research/research.md.tmpl -> RESEARCH_ID, TOPIC, CREATED_IN_SESSION, CREATED_AT, SOURCES_JSON
rn_template_path="$SM_TEMPLATE_DIR/research/research.md.tmpl"
rn_read_template() {
  if [[ -f "$rn_template_path" ]]; then
    cat -- "$rn_template_path"
    return 0
  fi
  sm_log warn "template ausente ($rn_template_path); usando o esqueleto interno equivalente."
  cat <<'TMPL'
<!-- study-method:meta {"schema_version":"1.0","kind":"research","id":"{{RESEARCH_ID}}","topic":"{{TOPIC}}","sources":{{SOURCES_JSON}},"provenance":"generated_unsourced","created_in_session":"{{CREATED_IN_SESSION}}","status":"active","verified_by_student":false,"disputed":false} -->

# {{TOPIC}}

> Destilado escrito pela skill em {{CREATED_AT}} (sessão {{CREATED_IN_SESSION}}).
> Não é material do aluno: em conflito com o `docs/` do setup, o material do aluno vence.

## O que é

## Como funciona

## Onde quebra

## Fontes
TMPL
}

# ------------------------------------------------------------------- alocação
rn_dir="$SM_SETUP_ROOT/researchs"
if [[ ! -d "$rn_dir" ]]; then
  mkdir -p -- "$rn_dir" || sm_die 1 "não consegui criar '$rn_dir'."
  sm_log warn "recriei o diretório estrutural researchs/ (estrutura, não conteúdo)."
fi
[[ -w "$rn_dir" ]] || sm_die 1 "sem permissão de escrita em '$rn_dir'."

if ! rn_nnnn="$(sm_next_seq "$rn_dir" .md)"; then
  sm_die 4 "não consegui alocar um NNNN livre em researchs/ após 5 tentativas."
fi
[[ "$rn_nnnn" =~ ^[0-9]{4}$ ]] || sm_die 1 "sm_next_seq devolveu um NNNN inválido: '$rn_nnnn'."
rn_file="$rn_dir/$rn_nnnn.md"
rn_rollback() { rm -f -- "$rn_file"; }

rn_created_at="$(sm_now_iso)"
rn_doc="$(rn_read_template)"
rn_doc="${rn_doc//\{\{RESEARCH_ID\}\}/$rn_nnnn}"
rn_doc="${rn_doc//\{\{TOPIC\}\}/$rn_topic}"
rn_doc="${rn_doc//\{\{CREATED_IN_SESSION\}\}/$rn_session}"
rn_doc="${rn_doc//\{\{CREATED_AT\}\}/$rn_created_at}"
rn_doc="${rn_doc//\{\{SOURCES_JSON\}\}/$rn_sources_json}"

if [[ "$rn_doc" == *'{{'* ]]; then
  rn_rollback
  sm_die 1 "o template de destilado não foi materializado por completo: sobrou placeholder {{…}}."
fi

# ------------------------------------------------- bloco de proveniência (§3.4)
# O template não tem placeholder para `provenance` (a lista do MANIFEST.tsv está
# congelada), então o script normaliza o bloco depois de materializá-lo: é ele que
# sabe se houve fonte, e é ele que garante que a primeira linha é `jq`-legível.
rn_first_line="${rn_doc%%$'\n'*}"
rn_meta="$(printf '%s' "$rn_first_line" | sed -n 's/^<!--[[:space:]]*study-method:meta[[:space:]]*\(.*\)[[:space:]]*-->[[:space:]]*$/\1/p')"
if [[ -z "$rn_meta" ]]; then
  rn_rollback
  sm_die 1 "o template de destilado não começa com o bloco '<!-- study-method:meta {…} -->' (docs/00-contratos.md §3.4)."
fi

if [[ -n "$rn_sources_json" && "$rn_sources_json" != '[]' ]]; then
  rn_provenance="generated_researched"
else
  rn_provenance="generated_unsourced"
fi

if ! rn_meta_fixed="$(printf '%s' "$rn_meta" | jq -c \
      --arg id "$rn_nnnn" \
      --arg topic "$rn_topic" \
      --arg prov "$rn_provenance" \
      --arg sess "$rn_session" \
      --arg ver "$SM_RESEARCH_SCHEMA_VERSION" \
      --argjson sources "$rn_sources_json" \
      '.schema_version = $ver
       | .kind = "research"
       | .id = $id
       | .topic = $topic
       | .sources = $sources
       | .provenance = $prov
       | .created_in_session = (if $sess == "" or $sess == "null" then null else $sess end)
       | .status = (.status // "active")
       | .verified_by_student = (.verified_by_student // false)
       | .disputed = (.disputed // false)')"; then
  rn_rollback
  sm_die 1 "o bloco de proveniência do template não é JSON válido."
fi

rn_doc="<!-- study-method:meta $rn_meta_fixed -->${rn_doc#"$rn_first_line"}"

if ! printf '%s\n' "$rn_doc" | sm_atomic_write "$rn_file"; then
  rn_rollback
  sm_die 1 "falha ao gravar '$rn_file'."
fi

rn_rel="$(sm_relpath "$rn_file" "$SM_SETUP_ROOT")"
sm_log info "destilado $rn_nnnn criado em $rn_rel (provenance: $rn_provenance)."
printf '%s\n' "$rn_rel"
