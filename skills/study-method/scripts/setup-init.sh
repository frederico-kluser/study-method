#!/usr/bin/env bash
# setup-init.sh — cria (ou completa) um setup de estudo e o registra no registry global.
# Contrato: docs/00-contratos.md §8. Exit codes: §5.1. Ordem de escrita: docs/10-bootstrap.md §6.5.
set -euo pipefail

SM_SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SM_SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/json.sh
. "$SM_SCRIPT_DIR/lib/json.sh"

SM_SK_DIR="$(cd -P -- "$SM_SCRIPT_DIR/.." && pwd -P)"
SM_SCHEMAS_DIR="$SM_SK_DIR/assets/schemas"
SM_TEMPLATES_DIR="$SM_SK_DIR/assets/templates"
SM_SCHEMA_VERSION='1.0'
SM_LANGUAGES='python javascript typescript rust go java csharp ruby elixir kotlin swift c cpp php lua julia r haskell bash none'

si_usage() {
    cat <<'HELP'
setup-init.sh — cria um setup de estudo novo e o registra no registry global.

USO
  setup-init.sh <path> --subject <s> --subject-slug <sl> --title <t>
                [--language <l>] [--skill-level <n>] [--session-minutes <n>]
                [--theory-source <ts>] [--defaults-used <csv>] [-h|--help]

ARGUMENTOS
  <path>                  Raiz do setup. E criada se nao existir. Pode conter espacos.
  --subject <s>           Area do conhecimento; normalizada para snake_case
                          (ex.: "Matemática" -> matematica). Obrigatorio.
  --subject-slug <sl>     Handle do setup; normalizado para kebab-case
                          (ex.: "Cálculo I" -> calculo-i). Vira setup.json.setup_name. Obrigatorio.
  --title <t>             Titulo em pt-BR mostrado ao aluno (ex.: "Cálculo I"). Obrigatorio.
  --language <l>          Linguagem dos desafios. Default: none (assunto sem codigo).
                          Valores: python javascript typescript rust go java csharp ruby elixir
                          kotlin swift c cpp php lua julia r haskell bash none
  --skill-level <n>       beginner | intermediate | advanced. Omitido = campo ausente.
  --session-minutes <n>   Inteiro >= 1. Omitido = campo ausente.
  --theory-source <ts>    student_provided | generated | none. Omitido = campo ausente.
  --defaults-used <csv>   Decisoes assumidas por default, separadas por virgula, no formato
                          <D-id> ou <D-id>=<valor> (ex.: "D-B02=generated,D-B07").
                          Cada uma vira setup.json.decisions[<D-id>] com default_used: true.
                          O id casa ^D-[A-Z]{1,3}[0-9]{2,3}$ (docs/00-contratos.md §4.2).

O QUE ESCREVE, NESTA ORDEM (docs/10-bootstrap.md §6.5)
  1. <path>/{docs,memory,researchs,challenges}/   (chmod 700 na raiz)
  2. <path>/.gitignore                            (contem `memory/`; nunca sobrescreve)
  3. <path>/setup.json                            (validado contra setup-manifest.schema.json)
  4. entrada no registry global                   (por ultimo: nunca aponta para setup pela metade)
  NAO escreve o README.md do setup — isso e do `readme-sync.sh <setup_root> --init`.

STDOUT
  O setup_id alocado (12 hex), uma linha.

IDEMPOTENTE
  Rodar duas vezes no mesmo caminho nao duplica nem sobrescreve nada: a segunda execucao
  recria apenas diretorio estrutural que falte, mantem setup.json e .gitignore intactos,
  atualiza o registry e reimprime o setup_id existente.

EXIT CODES (docs/00-contratos.md §5.1)
  0 ok · 1 erro de execucao · 2 uso incorreto · 4 registry ocupado · 5 validacao de schema falhou
HELP
}

# ---------------------------------------------------------------------------
si_abspath() {
    # Caminho absoluto sem exigir que o alvo exista. Normalizacao lexica de . e ..
    local p="${1:-}" out part
    case "$p" in
        /*) ;;
        *)  p="$PWD/$p" ;;
    esac
    out=""
    local oldifs="$IFS"
    IFS='/'
    for part in $p; do
        case "$part" in
            ''|'.') continue ;;
            '..')   out="${out%/*}" ;;
            *)      out="$out/$part" ;;
        esac
    done
    IFS="$oldifs"
    printf '%s\n' "${out:-/}"
}

si_render_template() {
    # si_render_template <arquivo> <NOME=valor>...  -> conteudo com os {{NOME}} substituidos.
    local file="${1:-}" body pair name value
    shift || true
    [ -r "$file" ] || return 1
    body="$(cat -- "$file")"
    for pair do
        name="${pair%%=*}"
        value="${pair#*=}"
        body="${body//\{\{$name\}\}/$value}"
    done
    printf '%s\n' "$body"
}

si_registry_upsert() {
    # si_registry_upsert <entry-json> -> 0 ok · 4 registry ocupado · 5 registry invalido
    local entry="${1:-}" reg home base merged now check rc corrupt
    reg="$(sm_registry_path)"
    home="$(dirname -- "$reg")"
    if ! mkdir -p -- "$home" 2>/dev/null; then
        sm_log warn "nao consegui criar \$STUDY_METHOD_HOME ($home): o setup foi criado, mas nao registrado"
        return 0
    fi
    chmod 700 -- "$home" 2>/dev/null || true
    if [ ! -w "$home" ]; then
        sm_log warn "\$STUDY_METHOD_HOME nao e gravavel ($home): o setup foi criado, mas nao registrado"
        return 0
    fi
    sm_registry_lock || return 4
    now="$(sm_now_iso)"
    if [ -f "$reg" ]; then
        if sm_json_ok "$reg"; then
            base="$(cat -- "$reg")"
        else
            corrupt="$reg.corrupt-$(date +%s)"
            mv -f -- "$reg" "$corrupt" 2>/dev/null || true
            sm_log warn "registry ilegivel: preservado como $corrupt e recriado vazio"
            base='{"schema_version":"1.0","setups":[]}'
        fi
    else
        base='{"schema_version":"1.0","setups":[]}'
    fi
    merged="$(printf '%s' "$base" | jq --argjson e "$entry" --arg now "$now" '
        . as $r
        | ($r.setups // []) as $s
        | ($s | map(.setup_id) | index($e.setup_id)) as $at
        | $r
        | .schema_version = ($r.schema_version // "1.0")
        | .setups = (if $at == null
                     then ($s + [$e])
                     else ($s | map(if .setup_id == $e.setup_id then . + $e else . end))
                     end)
        | .updated_at = $now
    ')" || { sm_registry_unlock; sm_log error "falha ao montar a entrada do registry"; return 5; }
    check="$home/.registry.check.$$"
    printf '%s\n' "$merged" > "$check"
    rc=0
    sm_json_validate "$check" "$SM_SCHEMAS_DIR/registry.schema.json" || rc=$?
    rm -f -- "$check"
    if [ "$rc" -ne 0 ]; then
        sm_registry_unlock
        sm_log error "o registry resultante nao valida contra registry.schema.json: nada foi gravado"
        return 5
    fi
    printf '%s\n' "$merged" | sm_atomic_write "$reg" || { sm_registry_unlock; return 1; }
    sm_registry_unlock
    return 0
}

# ---------------------------------------------------------------------------
target=""
opt_subject=""
opt_subject_slug=""
opt_title=""
opt_language=""
opt_skill_level=""
opt_session_minutes=""
opt_theory_source=""
opt_defaults_used=""

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) si_usage; exit 0 ;;
        --subject)          [ $# -ge 2 ] || sm_die 2 "--subject exige um valor";          opt_subject="$2";          shift 2 ;;
        --subject-slug)     [ $# -ge 2 ] || sm_die 2 "--subject-slug exige um valor";     opt_subject_slug="$2";     shift 2 ;;
        --title)            [ $# -ge 2 ] || sm_die 2 "--title exige um valor";            opt_title="$2";            shift 2 ;;
        --language)         [ $# -ge 2 ] || sm_die 2 "--language exige um valor";         opt_language="$2";         shift 2 ;;
        --skill-level)      [ $# -ge 2 ] || sm_die 2 "--skill-level exige um valor";      opt_skill_level="$2";      shift 2 ;;
        --session-minutes)  [ $# -ge 2 ] || sm_die 2 "--session-minutes exige um valor";  opt_session_minutes="$2";  shift 2 ;;
        --theory-source)    [ $# -ge 2 ] || sm_die 2 "--theory-source exige um valor";    opt_theory_source="$2";    shift 2 ;;
        --defaults-used)    [ $# -ge 2 ] || sm_die 2 "--defaults-used exige um valor";    opt_defaults_used="$2";    shift 2 ;;
        --) shift
            if [ $# -gt 0 ]; then
                [ -z "$target" ] || sm_die 2 "apenas um <path> e aceito (recebi tambem: $1)"
                target="$1"; shift
            fi
            [ $# -eq 0 ] || sm_die 2 "argumento posicional extra: $1" ;;
        -*) sm_die 2 "flag desconhecida: $1 (use --help)" ;;
        *)  [ -z "$target" ] || sm_die 2 "apenas um <path> e aceito (recebi tambem: $1)"
            target="$1"; shift ;;
    esac
done

[ -n "$target" ]           || sm_die 2 "faltou <path> (use --help)"
[ -n "$opt_subject" ]      || sm_die 2 "faltou --subject"
[ -n "$opt_subject_slug" ] || sm_die 2 "faltou --subject-slug"
[ -n "$opt_title" ]        || sm_die 2 "faltou --title"

sm_require_cmd jq || sm_die 1 "jq e a unica ferramenta estruturada garantida do projeto"

subject="$(sm_normalize_concept_id "$opt_subject")" \
    || sm_die 2 "--subject nao produz um identificador valido: $opt_subject"
setup_name="$(sm_normalize_slug "$opt_subject_slug")" \
    || sm_die 2 "--subject-slug nao produz um slug valido: $opt_subject_slug"

language="${opt_language:-none}"
case " $SM_LANGUAGES " in
    *" $language "*) ;;
    *) sm_die 2 "--language invalida: $language (valores: $SM_LANGUAGES)" ;;
esac
if [ -z "$opt_language" ]; then
    sm_log warn "--language omitida: assumindo 'none' (assunto sem codigo)"
fi

if [ -n "$opt_skill_level" ]; then
    case "$opt_skill_level" in
        beginner|intermediate|advanced) ;;
        *) sm_die 2 "--skill-level invalido: $opt_skill_level (beginner|intermediate|advanced)" ;;
    esac
fi
if [ -n "$opt_session_minutes" ]; then
    [[ "$opt_session_minutes" =~ ^[0-9]+$ ]] && [ "$opt_session_minutes" -ge 1 ] \
        || sm_die 2 "--session-minutes deve ser um inteiro >= 1: $opt_session_minutes"
fi
if [ -n "$opt_theory_source" ]; then
    case "$opt_theory_source" in
        student_provided|generated|none) ;;
        *) sm_die 2 "--theory-source invalido: $opt_theory_source (student_provided|generated|none)" ;;
    esac
fi

root="$(si_abspath "$target")"
[ ! -e "$root" ] || [ -d "$root" ] || sm_die 1 "o caminho existe e nao e um diretorio: $root"

now="$(sm_now_iso)"

# --- decisions assumidas por default (BOOT-2) -------------------------------
decisions='{}'
if [ -n "$opt_defaults_used" ]; then
    oldifs="$IFS"; IFS=','
    for tok in $opt_defaults_used; do
        [ -n "$tok" ] || continue
        dkey="${tok%%=*}"
        if [ "$dkey" = "$tok" ]; then dval=""; else dval="${tok#*=}"; fi
        [[ "$dkey" =~ ^D-[A-Z]{1,3}[0-9]{2,3}$ ]] \
            || { IFS="$oldifs"; sm_die 2 "--defaults-used: id de decisao invalido: $dkey"; }
        decisions="$(printf '%s' "$decisions" | jq --arg k "$dkey" --arg v "$dval" --arg t "$now" '
            .[$k] = { value: (if $v == "" then null else (try ($v | fromjson) catch $v) end),
                      answered_at: $t, default_used: true }')" \
            || { IFS="$oldifs"; sm_die 1 "--defaults-used: falha ao registrar $dkey"; }
    done
    IFS="$oldifs"
fi

# --- 0. o caminho ja e um setup? (idempotencia — I-32) ----------------------
existing_id=""
if [ -e "$root/setup.json" ]; then
    if ! sm_json_ok "$root/setup.json"; then
        sm_die 5 "ja existe um setup.json ilegivel em $root — nada foi sobrescrito; reparo e decisao do aluno (B-07)"
    fi
    existing_id="$(sm_json_get "$root/setup.json" '.setup_id // ""')" || existing_id=""
    [[ "$existing_id" =~ ^[0-9a-f]{12}$ ]] \
        || sm_die 5 "setup.json em $root nao tem um setup_id valido — nada foi sobrescrito"
    sm_log warn "$root ja e um setup ($existing_id): nada foi sobrescrito"
fi

# --- 1. diretorios ----------------------------------------------------------
if ! mkdir -p -- "$root" 2>/dev/null; then
    sm_die 1 "sem permissao para criar $root"
fi
sm_chmod_private "$root" || sm_die 1 "falha ao aplicar chmod 700 em $root"
for d in docs memory researchs challenges; do
    if [ ! -d "$root/$d" ]; then
        mkdir -p -- "$root/$d" || sm_die 1 "falha ao criar $root/$d"
        [ -z "$existing_id" ] || sm_log info "diretorio estrutural recriado: $d/"
    fi
done

# --- 2. .gitignore (contem `memory/` — decisao de privacidade, docs/11 §1.4) -
if [ ! -e "$root/.gitignore" ]; then
    if [ -r "$SM_TEMPLATES_DIR/setup/gitignore.tmpl" ]; then
        si_render_template "$SM_TEMPLATES_DIR/setup/gitignore.tmpl" | sm_atomic_write "$root/.gitignore" \
            || sm_die 1 "falha ao escrever $root/.gitignore"
    else
        sm_log warn "template setup/gitignore.tmpl ausente: usando o conteudo minimo embutido"
        sm_atomic_write "$root/.gitignore" <<'GITIGNORE' || sm_die 1 "falha ao escrever $root/.gitignore"
# Perfil cognitivo do aluno — dado pessoal, não código-fonte.
# Ver docs/11-seguranca-privacidade.md (repositório) §1.4 antes de remover esta linha.
memory/
GITIGNORE
    fi
fi

# --- 3. setup.json ----------------------------------------------------------
if [ -n "$existing_id" ]; then
    setup_id="$existing_id"
else
    setup_id=""
    reg_path="$(sm_registry_path)"
    for attempt in 1 2 3 4 5; do
        cand="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
        [[ "$cand" =~ ^[0-9a-f]{12}$ ]] || continue
        if [ -f "$reg_path" ] && sm_json_ok "$reg_path"; then
            if [ "$(jq -r --arg id "$cand" '[.setups[]? | select(.setup_id == $id)] | length' < "$reg_path")" != "0" ]; then
                sm_log warn "setup_id sorteado ja existe no registry, sorteando outro (tentativa $attempt)"
                continue
            fi
        fi
        setup_id="$cand"
        break
    done
    [ -n "$setup_id" ] || sm_die 1 "nao consegui sortear um setup_id livre em 5 tentativas"

    base='{}'
    tmpl="$SM_TEMPLATES_DIR/setup/setup.json.tmpl"
    if [ -r "$tmpl" ]; then
        rendered="$(si_render_template "$tmpl" \
            "SETUP_ID=$setup_id" \
            "SETUP_NAME=$setup_name" \
            "SUBJECT=$subject" \
            "LANGUAGE=$language" \
            "SESSION_MINUTES=${opt_session_minutes:-null}" \
            "THEORY_SOURCE=$opt_theory_source" \
            "CREATED_AT=$now" \
            "SCHEMA_VERSION=$SM_SCHEMA_VERSION")" || rendered=""
        case "$rendered" in
            *'{{'*) sm_die 1 "template $tmpl deixou placeholder por substituir (veja assets/templates/MANIFEST.tsv)" ;;
        esac
        if printf '%s' "$rendered" | jq -e . >/dev/null 2>&1; then
            base="$rendered"
        else
            sm_log warn "template $tmpl nao produziu JSON valido: montando o manifesto sem ele"
        fi
    else
        sm_log warn "template setup/setup.json.tmpl ausente: montando o manifesto sem ele"
    fi

    doc="$(printf '%s' "$base" | jq \
        --arg schema_version "$SM_SCHEMA_VERSION" \
        --arg setup_id "$setup_id" \
        --arg setup_name "$setup_name" \
        --arg title "$opt_title" \
        --arg subject "$subject" \
        --arg language "$language" \
        --arg created_at "$now" \
        --arg skill_level "$opt_skill_level" \
        --arg theory_source "$opt_theory_source" \
        --arg session_minutes "$opt_session_minutes" \
        --argjson decisions "$decisions" '
          .schema_version = $schema_version
        | .setup_id       = $setup_id
        | .setup_name     = $setup_name
        | .title          = $title
        | .subject        = $subject
        | .taxonomy       = [$subject]
        | .language       = { name: $language, chosen_at: $created_at }
        | .created_at     = $created_at
        | .updated_at     = $created_at
        | .session_count  = 0
        | .decisions      = $decisions
        | .privacy        = { cross_read: ((.privacy.cross_read) // "ask") }
        | (if $skill_level    == "" then del(.skill_level)     else .skill_level = $skill_level         end)
        | (if $theory_source  == "" then del(.theory_source)   else .theory_source = $theory_source     end)
        | (if $session_minutes == "" then del(.session_minutes) else .session_minutes = ($session_minutes | tonumber) end)
    ')" || sm_die 1 "falha ao montar o setup.json"

    check="$root/setup.json.check.$$"
    printf '%s\n' "$doc" > "$check" || sm_die 1 "sem permissao para escrever em $root"
    rc=0
    sm_json_validate "$check" "$SM_SCHEMAS_DIR/setup-manifest.schema.json" || rc=$?
    rm -f -- "$check"
    [ "$rc" -eq 0 ] || sm_die 5 "o setup.json montado nao valida contra setup-manifest.schema.json: nada foi gravado"

    printf '%s\n' "$doc" | sm_atomic_write "$root/setup.json" \
        || sm_die 1 "falha ao gravar $root/setup.json"
fi

# --- 4. registry (por ultimo: nunca aponta para setup pela metade) ----------
entry="$(jq -n \
    --arg setup_id "$setup_id" \
    --arg setup_name "$(sm_json_get "$root/setup.json" '.setup_name')" \
    --arg title "$(sm_json_get "$root/setup.json" '.title')" \
    --arg subject "$(sm_json_get "$root/setup.json" '.subject')" \
    --arg path "$root" \
    --arg created_at "$(sm_json_get "$root/setup.json" '.created_at')" \
    --arg now "$now" \
    --arg language "$(sm_json_get "$root/setup.json" '.language.name // "none"')" \
    --arg cross_read "$(sm_json_get "$root/setup.json" '.privacy.cross_read // "ask"')" \
    --argjson taxonomy "$(sm_json_get_raw "$root/setup.json" '.taxonomy // []')" \
    --argjson session_count "$(sm_json_get "$root/setup.json" '.session_count // 0')" \
    '{setup_id:$setup_id, setup_name:$setup_name, title:$title, subject:$subject,
      taxonomy:$taxonomy, path:$path, language:$language, setup_status:"active",
      created_at:$created_at, last_seen_at:$now, checked_at:$now,
      session_count:$session_count, cross_read:$cross_read}
     | del(.missing_since) | del(.archived_at)')" \
    || sm_die 1 "falha ao montar a entrada do registry"

rc=0
si_registry_upsert "$entry" || rc=$?
case "$rc" in
    0) ;;
    4) sm_die 4 "registry ocupado por outro processo: o setup foi criado em $root, mas nao registrado" ;;
    5) sm_die 5 "o registry resultante nao valida: o setup foi criado em $root, mas nao registrado" ;;
    *) sm_die 1 "falha ao gravar o registry: o setup foi criado em $root, mas nao registrado" ;;
esac

printf '%s\n' "$setup_id"
exit 0
