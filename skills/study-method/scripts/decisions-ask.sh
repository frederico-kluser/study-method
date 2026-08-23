#!/usr/bin/env bash
# decisions-ask.sh — a entrevista das decisoes abertas.
#
# Le SK/assets/decisions.json (a FONTE DE VERDADE — este script nunca inventa decisao,
# opcao ou default), filtra o que ainda esta em aberto para a fase pedida, e imprime em
# stdout um bloco estruturado para o modelo conduzir a conversa: a pergunta, o porque com
# analogia, as opcoes com pros e contras, o default e o custo de mudar de ideia.
#
# Contrato: docs/00-contratos.md §8 (CLI) e §5.1 (exit codes). Camada humana do mesmo
# catalogo: docs/08-decisoes-abertas.md. Como conduzir a conversa: references/decisoes.md.
#
# REGRA DURA: default nunca e aplicado em silencio. `--defaults` grava `default_used: true`
# E imprime, uma linha por decisao, o que foi assumido e como mudar.
set -euo pipefail

SM_SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh
. "$SM_SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/json.sh
. "$SM_SCRIPT_DIR/lib/json.sh"

SM_SK_DIR="$(cd -P -- "$SM_SCRIPT_DIR/.." && pwd -P)"
SM_CATALOG="${SM_DECISIONS_CATALOG:-$SM_SK_DIR/assets/decisions.json}"
SM_SETUP_SCHEMA="$SM_SK_DIR/assets/schemas/setup-manifest.schema.json"

# As quatro fases de runtime. `never` (camada 4, congelada) NAO e fase: nao se pergunta.
SM_PHASES='setup-init first-challenge session-15 on-demand'
# Caminhos de primeira classe do manifesto que sao inteiros — o catalogo guarda todo
# `value` como string, e gravar "60" onde o schema exige integer reprovaria a validacao.
SM_INT_PATHS='session_minutes docs_ingest.token_budget'
# Valores-sentinela: a opcao existe, mas o dado e texto livre do aluno. Sem `--value`
# nao ha o que gravar, e por isso essa decisao NUNCA entra em `--defaults`.
SM_FREETEXT_VALUES='free_text'

da_usage() {
    cat <<'HELP'
decisions-ask.sh — conduz (e registra) as decisoes abertas do catalogo.

USO
  decisions-ask.sh <setup_root> <fase> [--json]
  decisions-ask.sh <fase> --setup <setup_root> [--json]        (forma de docs/00-contratos.md §8)
  decisions-ask.sh <setup_root> --record <id> <opcao> [--value <texto>] [--session <NNNN>] [--note <t>]
  decisions-ask.sh <setup_root> --answer <id>=<opcao> [--value <texto>] [--session <NNNN>]
  decisions-ask.sh <setup_root> --defaults <fase> [--session <NNNN>] [--json]
  decisions-ask.sh --catalog-only <fase> [--json]              (sem setup: so lista a fase)
  decisions-ask.sh [-h|--help]

FASES
  setup-init        camada 1, dia zero — no maximo 6 perguntas, todas ao aluno
  first-challenge   camada 2 — a primeira vez que o aluno enfrenta um desafio
  session-15        camada 2 — quando o historico fica longo (limiar de compactacao)
  on-demand         camada 3 — so quando o aluno pergunta, ou no instante em que a skill
                    precisa da autorizacao para agir

O QUE E FILTRADO
  1. `ask_when` igual a fase pedida;
  2. `audience` em {student, both} — decisao de `builder` (forma de schema, exit code,
     namespace de $id, operador de mutacao) NUNCA e perguntada ao aluno;
  3. menos o que ja tem registro em `setup.json.decisions[<chave>]` — decisao respondida
     nao e perguntada de novo. A <chave> vem de `writes_to` quando ele aponta para
     `decisions.<X>`; senao e o proprio id.

STDOUT
  Por padrao: um bloco estruturado, uma decisao por vez, para o modelo conduzir a conversa.
  Com `--json`: as decisoes pendentes daquela fase em JSON (a forma do §8), no envelope
  {phase, setup_root, pending_count, answered_count, pending: [...], answered: [...]}.

--record / --answer
  Grava a resposta em `setup.json` no caminho de `writes_to`, por escrita atomica, e valida
  o manifesto resultante contra setup-manifest.schema.json. Sempre grava o registro em
  `decisions.<id>` (`{value, answered_at, default_used, asked_in_session?, note?}`) e, quando
  `writes_to` e um campo de primeira classe (`title`, `language.name`, `session_minutes`,
  `skill_level`, `theory_source`, `privacy.cross_read`, `docs_ingest.token_budget`), espelha
  o valor la tambem. `<opcao>` e o id da opcao; o `value` da opcao tambem e aceito.

--defaults <fase>
  Aplica o default de cada decisao pendente daquela fase, grava `default_used: true` e
  IMPRIME o que assumiu. Default nunca e aplicado em silencio. Decisao cujo default e texto
  livre do aluno (ex.: D-B13, o titulo do estudo) NAO e assumida: fica pendente e o script
  declara que ela nao tem default possivel.

EXIT CODES (docs/00-contratos.md §5.1)
  0 ok · 1 erro de execucao · 2 uso incorreto · 3 setup nao encontrado · 5 validacao falhou
HELP
}

# ---------------------------------------------------------------------------
da_is_phase() {
    case " $SM_PHASES " in *" ${1:-} "*) return 0 ;; *) return 1 ;; esac
}

da_in_list() {
    # da_in_list <agulha> <lista separada por espaco>
    case " ${2:-} " in *" ${1:-} "*) return 0 ;; *) return 1 ;; esac
}

da_rev_gloss() {
    case "${1:-}" in
        cheap)     printf 'muda numa linha, sem custo\n' ;;
        moderate)  printf 'mudar depois exige migrar dado ja escrito\n' ;;
        expensive) printf 'ha efeito que NAO se desfaz — decida com calma\n' ;;
        *)         printf 'custo de mudar nao declarado\n' ;;
    esac
}

da_catalog_or_die() {
    [ -r "$SM_CATALOG" ] || sm_die 1 "catalogo ausente ou ilegivel: $SM_CATALOG"
    sm_json_ok "$SM_CATALOG" || sm_die 5 "catalogo nao e JSON valido: $SM_CATALOG"
}

# da_resolve_id <id> -> o id vivo (segue alt_ids). stdout o id; 2 se nao existe.
da_resolve_id() {
    local want="${1:-}" live
    live="$(jq -r --arg w "$want" '
        (.decisions[] | select(.id == $w) | .id) //
        (.decisions[] | select((.alt_ids // []) | index($w)) | .id) // empty
    ' < "$SM_CATALOG" | head -1)" || return 1
    [ -n "$live" ] || return 2
    printf '%s\n' "$live"
    return 0
}

# da_entry <id> -> a entrada do catalogo em JSON compacto.
da_entry() {
    jq -c --arg i "${1:-}" '.decisions[] | select(.id == $i)' < "$SM_CATALOG"
}

# da_answered_ids <setup.json> -> array JSON das chaves ja registradas em `decisions`.
da_answered_ids() {
    local f="${1:-}"
    if [ -r "$f" ] && sm_json_ok "$f"; then
        jq -c '[ (.decisions // {}) | to_entries[] | select(.value != null) | .key ]' < "$f"
    else
        printf '[]\n'
    fi
}

# CHAVE DE ARMAZENAMENTO. Quase sempre e o proprio `id`, mas `writes_to` VENCE: o catalogo
# tem entrada cujo `writes_to` aponta para um id absorvido na deduplicacao (D-A21 grava em
# `decisions.D-S01`). Gravar em outro lugar que nao o declarado por `writes_to` seria o
# derivado contrariando a fonte de verdade — e a decisao ficaria invisivel para quem a le.
SM_STORE_KEY_JQ='(if (($d.writes_to // "") | startswith("decisions.")) then ($d.writes_to | ltrimstr("decisions.")) else $d.id end)'

# da_store_key <entrada-json> -> a chave de `setup.json.decisions` desta decisao.
da_store_key() {
    printf '%s' "${1:-}" | jq -r '. as $d | '"$SM_STORE_KEY_JQ"
}

# da_pending <fase> <array-json-de-chaves-respondidas> -> array JSON das entradas pendentes.
# Respondida = ha registro sob a chave de armazenamento OU sob o proprio id (as duas, porque
# um setup antigo pode ter sido gravado por qualquer uma das duas convencoes).
da_pending() {
    jq -c --arg fase "${1:-}" --argjson done "${2:-[]}" '
        [ .decisions[]
          | select(.ask_when == $fase)
          | select(.audience == "student" or .audience == "both")
          | . as $d
          | select(($done | index($d.id)) == null
                   and ($done | index('"$SM_STORE_KEY_JQ"')) == null) ]
    ' < "$SM_CATALOG"
}

# da_answered_of_phase <fase> <array-json-de-chaves-respondidas> -> entradas ja respondidas.
da_answered_of_phase() {
    jq -c --arg fase "${1:-}" --argjson done "${2:-[]}" '
        [ .decisions[]
          | select(.ask_when == $fase)
          | select(.audience == "student" or .audience == "both")
          | . as $d
          | select(($done | index($d.id)) != null
                   or ($done | index('"$SM_STORE_KEY_JQ"')) != null) ]
    ' < "$SM_CATALOG"
}

# da_print_block <fase> <setup_root_ou_vazio> <pendentes-json> <respondidas-json> <setup.json|vazio>
# O bloco que o modelo le para conduzir a conversa. Uma decisao por vez, nesta ordem:
# EXPLICA (por que importa) -> PERGUNTA -> OPCOES -> DEFAULT -> custo de mudar.
da_print_block() {
    local fase="$1" root="$2" pend="$3" ans="$4" setupf="$5"
    local n na
    n="$(printf '%s' "$pend" | jq 'length')"
    na="$(printf '%s' "$ans" | jq 'length')"

    printf 'DECISOES ABERTAS · fase %s\n' "$fase"
    [ -n "$root" ] && printf 'setup: %s\n' "$root"
    printf 'pendentes: %s · ja respondidas nesta fase: %s\n' "$n" "$na"
    printf 'REGRA DE CONDUCAO: uma pergunta por vez, explicando ANTES de perguntar. Nunca\n'
    printf 'despeje o bloco inteiro no aluno. Detalhe em references/decisoes.md.\n'

    if [ "$na" -gt 0 ] && [ -n "$setupf" ]; then
        printf '\nJA RESPONDIDAS (nao pergunte de novo):\n'
        printf '%s' "$ans" | jq -r '.[].id' | while IFS= read -r id; do
            skey="$(da_store_key "$(da_entry "$id")")"
            local_val="$(jq -r --arg i "$id" --arg k "$skey" '
                ((.decisions[$k] // .decisions[$i]) // {}) as $r
                | "\($r.value // "?")\(if ($r.default_used // false) then " (default assumido)" else "" end)"
            ' < "$setupf" 2>/dev/null || printf '?')"
            printf '  · %s = %s\n' "$id" "$local_val"
        done
    fi

    if [ "$n" -eq 0 ]; then
        printf '\nNada pendente nesta fase. Siga a aula.\n'
        return 0
    fi

    local i=0 id rev
    while IFS= read -r id; do
        i=$((i + 1))
        printf '%s' "$pend" | jq -r --arg i "$id" --argjson n "$n" --argjson k "$i" '
            .[] | select(.id == $i) | . as $d |
            "\n──────────────────────────────────────────────────────────────────────\n" +
            "[\($k)/\($n)] \($d.id) · publico: \($d.audience) · reversibilidade: \($d.reversibility)\n" +
            "\nPOR QUE IMPORTA (diga isto ANTES de perguntar):\n  \($d.why_it_matters)\n" +
            "\nPERGUNTE:\n  \($d.question_ptbr)\n" +
            "\nOPCOES:\n" +
            ( [ $d.options[] as $o | "  · \($o.id) — \($o.label)" +
                ( [ $o.pros[]? | "\n      + \(.)" ] | join("") ) +
                ( [ $o.cons[]? | "\n      − \(.)" ] | join("") ) ] | join("\n") ) +
            "\n\nDEFAULT (se o aluno nao responder): \($d.default) — " +
              (( [ $d.options[] | select(.id == $d.default) | .label ] | first) // "?") + "\n" +
            "  de onde vem: \($d.source)\n" +
            "GRAVA EM: \($d.writes_to // "(nada — decisao de quem constroi)")"
        '
        rev="$(printf '%s' "$pend" | jq -r --arg i "$id" '.[]|select(.id==$i)|.reversibility')"
        printf 'CUSTO DE MUDAR DEPOIS: %s — %s\n' "$rev" "$(da_rev_gloss "$rev")"
        printf 'PARA GRAVAR: decisions-ask.sh %s --record %s <opcao>\n' \
            "${root:-<setup_root>}" "$id"
    done < <(printf '%s' "$pend" | jq -r '.[].id')

    printf '\n──────────────────────────────────────────────────────────────────────\n'
    printf 'ATALHO SEMPRE DISPONIVEL: "posso assumir os padroes e a gente ajusta no caminho"\n'
    printf '  → decisions-ask.sh %s --defaults %s   (e ele DECLARA cada default assumido)\n' \
        "${root:-<setup_root>}" "$fase"
    return 0
}

# da_print_json <fase> <root> <pendentes> <respondidas>
da_print_json() {
    jq -n --arg fase "$1" --arg root "$2" --argjson pend "$3" --argjson ans "$4" '
        { phase: $fase,
          setup_root: (if $root == "" then null else $root end),
          pending_count: ($pend | length),
          answered_count: ($ans | length),
          pending: $pend,
          answered: ($ans | map(.id)) }'
}

# da_write_answer <setup.json> <entrada-json> <opcao-id> <valor-final> <default_used> <sessao> <nota>
# Escrita atomica + validacao contra o schema; reverte se o manifesto resultante nao validar.
da_write_answer() {
    local setupf="$1" entry="$2" optid="$3" val="$4" du="$5" sess="$6" note="$7"
    local id wt key now backup valjson mirror_json path_json rc

    id="$(printf '%s' "$entry" | jq -r '.id')"
    wt="$(printf '%s' "$entry" | jq -r '.writes_to // ""')"
    key="$(da_store_key "$entry")"
    sm_log debug "$id: gravando opcao $optid (default_used=$du) em ${wt:-decisions.$key}"
    now="$(sm_now_iso)"
    backup="$(cat -- "$setupf")"

    valjson="$(jq -n --arg v "$val" '$v')"
    mirror_json="$valjson"
    if [ -n "$wt" ] && da_in_list "$wt" "$SM_INT_PATHS"; then
        case "$val" in
            ''|*[!0-9-]*) sm_log error "$id: $wt exige inteiro, recebi: $val"; return 5 ;;
        esac
        mirror_json="$val"
    fi

    if [ -n "$wt" ] && [ "${wt#decisions.}" = "$wt" ]; then
        path_json="$(jq -n --arg p "$wt" '$p | split(".")')"
    else
        path_json='null'
    fi

    local out
    # A FORMA DO REGISTRO e contrato (docs/build-spec/10-decisoes.md §5):
    # {value, answered_at, default_used, asked_in_session?, note?}. Nenhuma chave a mais —
    # `decisions` e um mapa aberto, entao uma chave extra passaria na validacao em silencio.
    # O id da opcao NAO e gravado: dentro de uma entrada, `value` identifica a opcao.
    out="$(jq \
        --arg id "$key" --argjson valjson "$valjson" --arg now "$now" --arg du "$du" \
        --arg sess "$sess" --arg note "$note" \
        --argjson path "$path_json" --argjson mirror "$mirror_json" '
        .decisions = ((.decisions // {}) + { ($id): (
              { value: $valjson,
                answered_at: $now,
                default_used: ($du == "true") }
              + (if $sess == "" then {} else { asked_in_session: $sess } end)
              + (if $note == "" then {} else { note: $note } end) ) })
        | (if $path == null then . else setpath($path; $mirror) end)
        | .updated_at = $now
    ' < "$setupf" 2>&1)" || { sm_log error "$id: falha ao montar o manifesto: $out"; return 1; }

    printf '%s\n' "$out" | sm_atomic_write "$setupf" || {
        sm_log error "$id: falha de I/O ao gravar $setupf"
        return 1
    }

    # A validacao roda DENTRO do `if`: sob `set -e`, chamar a funcao solta abortaria o script
    # no exato ponto em que a reversao precisa acontecer, e o manifesto invalido ficaria em disco.
    if ! sm_json_validate "$setupf" "$SM_SETUP_SCHEMA"; then
        rc=5
        printf '%s\n' "$backup" | sm_atomic_write "$setupf" || rc=1
        sm_log error "$id: o manifesto resultante nao valida contra setup-manifest.schema.json — revertido, nada foi mudado"
        return "$rc"
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Argumentos. Duas formas aceitas, porque duas formas estao documentadas:
#   <setup_root> <fase>          (docs/08-decisoes-abertas.md, references/decisoes.md)
#   <fase> --setup <setup_root>  (docs/00-contratos.md §8, SKILL.md)
opt_json=0
opt_setup=""
opt_record_id=""
opt_record_opt=""
opt_defaults=""
opt_value=""
opt_session=""
opt_note=""
opt_catalog_only=0
mode=""
declare -a positional=()

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) da_usage; exit 0 ;;
        --json)    opt_json=1; shift ;;
        --catalog-only) opt_catalog_only=1; shift ;;
        --setup)   [ $# -ge 2 ] || sm_die 2 "--setup exige um valor"; opt_setup="$2"; shift 2 ;;
        --value)   [ $# -ge 2 ] || sm_die 2 "--value exige um valor"; opt_value="$2"; shift 2 ;;
        --session) [ $# -ge 2 ] || sm_die 2 "--session exige um valor"; opt_session="$2"; shift 2 ;;
        --note)    [ $# -ge 2 ] || sm_die 2 "--note exige um valor"; opt_note="$2"; shift 2 ;;
        --record)
            [ $# -ge 3 ] || sm_die 2 "--record exige <id> <opcao>"
            [ -z "$mode" ] || sm_die 2 "--record, --answer e --defaults sao mutuamente exclusivos"
            mode=record; opt_record_id="$2"; opt_record_opt="$3"; shift 3 ;;
        --answer)
            [ $# -ge 2 ] || sm_die 2 "--answer exige <id>=<opcao>"
            [ -z "$mode" ] || sm_die 2 "--record, --answer e --defaults sao mutuamente exclusivos"
            case "$2" in
                *=*) mode=record; opt_record_id="${2%%=*}"; opt_record_opt="${2#*=}" ;;
                *)   sm_die 2 "--answer exige a forma <id>=<opcao> (recebi: $2)" ;;
            esac
            shift 2 ;;
        --defaults)
            [ -z "$mode" ] || sm_die 2 "--record, --answer e --defaults sao mutuamente exclusivos"
            mode=defaults
            if [ $# -ge 2 ] && da_is_phase "$2"; then opt_defaults="$2"; shift 2; else shift; fi ;;
        --) shift
            while [ $# -gt 0 ]; do positional+=("$1"); shift; done ;;
        -*) sm_die 2 "flag desconhecida: $1 (use --help)" ;;
        *)  positional+=("$1"); shift ;;
    esac
done

sm_require_cmd jq || sm_die 1 "jq e a unica ferramenta estruturada garantida do projeto"
da_catalog_or_die

# Desembaralha os posicionais nas duas formas aceitas.
phase=""
root_hint="$opt_setup"
for tok in ${positional+"${positional[@]}"}; do
    if [ -z "$phase" ] && da_is_phase "$tok"; then
        phase="$tok"
    elif [ -z "$root_hint" ]; then
        root_hint="$tok"
    else
        sm_die 2 "argumento posicional extra: $tok (use --help)"
    fi
done
[ -n "$opt_defaults" ] && phase="$opt_defaults"

# ---------------------------------------------------------------------------
# Modo --catalog-only: sem setup, sem escrita. Serve para inspecionar a fase.
if [ "$opt_catalog_only" -eq 1 ]; then
    [ -z "$mode" ] || sm_die 2 "--catalog-only nao combina com --record/--answer/--defaults"
    [ -n "$phase" ] || sm_die 2 "faltou a fase (uma de: $SM_PHASES)"
    pend="$(da_pending "$phase" '[]')"
    if [ "$opt_json" -eq 1 ]; then
        da_print_json "$phase" "" "$pend" '[]'
    else
        da_print_block "$phase" "" "$pend" '[]' ""
    fi
    exit 0
fi

# A partir daqui o setup precisa existir.
root="$(sm_setup_root "$root_hint")" || sm_die 3 "nenhum setup.json legivel a partir de: ${root_hint:-$PWD}"
setup_json="$root/setup.json"
sm_json_ok "$setup_json" || sm_die 5 "setup.json nao e JSON valido: $setup_json"

if [ -n "$opt_session" ] && ! [[ "$opt_session" =~ ^[0-9]{4}$ ]]; then
    sm_die 2 "--session exige NNNN (4 digitos): $opt_session"
fi

case "$mode" in
# ---------------------------------------------------------------------------
record)
    live_id="$(da_resolve_id "$opt_record_id")" \
        || sm_die 2 "decisao inexistente no catalogo: $opt_record_id"
    [ "$live_id" = "$opt_record_id" ] \
        || sm_log warn "$opt_record_id e id alternativo; a entrada viva e $live_id"
    entry="$(da_entry "$live_id")"
    [ -n "$entry" ] || sm_die 1 "falha ao ler a entrada $live_id do catalogo"

    aud="$(printf '%s' "$entry" | jq -r '.audience')"
    aw="$(printf '%s' "$entry" | jq -r '.ask_when')"
    if [ "$aud" = "builder" ]; then
        sm_die 2 "$live_id tem audience=builder: e decisao de quem constroi a skill, nao do aluno"
    fi
    if [ "$aw" = "never" ]; then
        sm_die 2 "$live_id esta congelada (ask_when=never): nao e perguntada nem respondida em runtime"
    fi

    # A opcao pode vir pelo id ou pelo value.
    opt_json_entry="$(printf '%s' "$entry" | jq -c --arg o "$opt_record_opt" '
        (.options[] | select(.id == $o)) // (.options[] | select(.value == $o)) // empty' | head -1)"
    if [ -z "$opt_json_entry" ]; then
        sm_die 2 "$live_id: opcao invalida «$opt_record_opt». Validas: $(printf '%s' "$entry" | jq -r '[.options[].id] | join(", ")')"
    fi
    opt_id="$(printf '%s' "$opt_json_entry" | jq -r '.id')"
    opt_val="$(printf '%s' "$opt_json_entry" | jq -r '.value')"

    final_val="$opt_val"
    if da_in_list "$opt_val" "$SM_FREETEXT_VALUES"; then
        [ -n "$opt_value" ] \
            || sm_die 2 "$live_id/$opt_id e texto livre do aluno: use --value \"<o texto>\""
        final_val="$opt_value"
    elif [ -n "$opt_value" ]; then
        final_val="$opt_value"
        sm_log warn "$live_id: --value sobrescreve o value da opcao $opt_id ($opt_val -> $final_val)"
    fi

    da_write_answer "$setup_json" "$entry" "$opt_id" "$final_val" "false" "$opt_session" "$opt_note"
    rc=$?
    [ "$rc" -eq 0 ] || exit "$rc"

    wt="$(printf '%s' "$entry" | jq -r '.writes_to // "-"')"
    printf 'GRAVADO %s = %s (opcao %s) em %s · default_used: false\n' \
        "$live_id" "$final_val" "$opt_id" "$wt"
    printf 'PARA MUDAR DEPOIS: decisions-ask.sh %s --record %s <outra-opcao>   (custo: %s — %s)\n' \
        "$root" "$live_id" \
        "$(printf '%s' "$entry" | jq -r '.reversibility')" \
        "$(da_rev_gloss "$(printf '%s' "$entry" | jq -r '.reversibility')")"
    exit 0
    ;;
# ---------------------------------------------------------------------------
defaults)
    [ -n "$phase" ] || sm_die 2 "--defaults exige a fase (uma de: $SM_PHASES)"
    answered="$(da_answered_ids "$setup_json")"
    pend="$(da_pending "$phase" "$answered")"
    n="$(printf '%s' "$pend" | jq 'length')"

    declare -a applied_ids=() applied_opts=() applied_vals=() applied_wts=() applied_revs=()
    declare -a skipped_ids=() skipped_qs=()

    if [ "$n" -gt 0 ]; then
        while IFS= read -r id; do
            entry="$(printf '%s' "$pend" | jq -c --arg i "$id" '.[] | select(.id == $i)')"
            dflt="$(printf '%s' "$entry" | jq -r '.default')"
            oj="$(printf '%s' "$entry" | jq -c --arg d "$dflt" '.options[] | select(.id == $d)')"
            [ -n "$oj" ] || sm_die 5 "$id: o default «$dflt» nao e uma opcao desta entrada — bug do catalogo"
            val="$(printf '%s' "$oj" | jq -r '.value')"
            if da_in_list "$val" "$SM_FREETEXT_VALUES"; then
                skipped_ids+=("$id")
                skipped_qs+=("$(printf '%s' "$entry" | jq -r '.question_ptbr')")
                continue
            fi
            da_write_answer "$setup_json" "$entry" "$dflt" "$val" "true" "$opt_session" "" \
                || exit $?
            applied_ids+=("$id")
            applied_opts+=("$dflt")
            applied_vals+=("$(printf '%s' "$oj" | jq -r '.label')")
            applied_wts+=("$(printf '%s' "$entry" | jq -r '.writes_to // "-"')")
            applied_revs+=("$(printf '%s' "$entry" | jq -r '.reversibility')")
        done < <(printf '%s' "$pend" | jq -r '.[].id')
    fi

    if [ "$opt_json" -eq 1 ]; then
        jq -n --arg fase "$phase" --arg root "$root" \
              --argjson ids "$(printf '%s\n' ${applied_ids+"${applied_ids[@]}"} | jq -R . | jq -sc 'map(select(. != ""))')" \
              --argjson skipped "$(printf '%s\n' ${skipped_ids+"${skipped_ids[@]}"} | jq -R . | jq -sc 'map(select(. != ""))')" '
            { phase: $fase, setup_root: $root, defaults_applied: $ids,
              defaults_declared: true, no_default_possible: $skipped }'
        exit 0
    fi

    printf 'DEFAULTS ASSUMIDOS · fase %s · setup %s\n' "$phase" "$root"
    printf 'Isto NAO foi perguntado a voce: eu assumi o padrao e estou declarando cada um.\n'
    if [ "${#applied_ids[@]}" -eq 0 ]; then
        if [ "${#skipped_ids[@]}" -gt 0 ]; then
            printf 'Nenhum default aplicado: o que resta nesta fase nao tem default possivel.\n'
        else
            printf 'Nenhum default aplicado — nao havia decisao pendente nesta fase.\n'
        fi
    fi
    i=0
    while [ "$i" -lt "${#applied_ids[@]}" ]; do
        printf '  · %s  assumi: %s — %s\n' "${applied_ids[$i]}" "${applied_opts[$i]}" "${applied_vals[$i]}"
        printf '      grava em: %s · custo de mudar: %s (%s)\n' \
            "${applied_wts[$i]}" "${applied_revs[$i]}" "$(da_rev_gloss "${applied_revs[$i]}")"
        i=$((i + 1))
    done
    if [ "${#skipped_ids[@]}" -gt 0 ]; then
        printf '\nSEM DEFAULT POSSIVEL (continuam pendentes — precisam da sua resposta):\n'
        i=0
        while [ "$i" -lt "${#skipped_ids[@]}" ]; do
            printf '  · %s  %s\n' "${skipped_ids[$i]}" "${skipped_qs[$i]}"
            i=$((i + 1))
        done
    fi
    printf '\nPARA MUDAR QUALQUER UM: decisions-ask.sh %s --record <id> <opcao>\n' "$root"
    exit 0
    ;;
# ---------------------------------------------------------------------------
*)
    [ -n "$phase" ] || sm_die 2 "faltou a fase (uma de: $SM_PHASES) — use --help"
    answered="$(da_answered_ids "$setup_json")"
    pend="$(da_pending "$phase" "$answered")"
    ansp="$(da_answered_of_phase "$phase" "$answered")"
    if [ "$opt_json" -eq 1 ]; then
        da_print_json "$phase" "$root" "$pend" "$ansp"
    else
        da_print_block "$phase" "$root" "$pend" "$ansp" "$setup_json"
    fi
    exit 0
    ;;
esac
