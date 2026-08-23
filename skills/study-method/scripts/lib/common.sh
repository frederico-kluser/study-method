# shellcheck shell=bash
# lib/common.sh — biblioteca base do study-method.
# Contrato congelado em docs/00-contratos.md §7.1. NÃO altere assinaturas.
# LIB-1 apenas `source`, nunca executado (modo 0644, sem shebang executável, sem main).
# LIB-2 toda função com prefixo sm_; toda global com prefixo SM_.
# LIB-3 nada em stdout além do valor documentado; log/aviso/diagnóstico SEMPRE em stderr.
# LIB-4 nenhuma função chama exit, exceto sm_die.
# LIB-5 `set -u` assumido; `set -e` NÃO assumido.
# LIB-6 permitido: bash 4+, coreutils, jq, python3 stdlib. Nada mais sem sm_require_cmd.

# Diretório desta biblioteca. Usado por lib/json.sh para achar _jsonschema_min.py.
SM_LIB_DIR="${SM_LIB_DIR:-$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)}"

# Diretório do lock de registry tomado por sm_registry_lock (vazio = nenhum).
SM_REGISTRY_LOCK_DIR="${SM_REGISTRY_LOCK_DIR:-}"

# Tabela de dobra para ASCII, pares `origem:destino` separados por espaço.
# Aplicada por substituição de string em bash (byte-safe em UTF-8, independente de locale).
SM_ASCII_FOLD='á:a à:a â:a ã:a ä:a å:a ª:a Á:a À:a Â:a Ã:a Ä:a Å:a
é:e è:e ê:e ë:e É:e È:e Ê:e Ë:e
í:i ì:i î:i ï:i Í:i Ì:i Î:i Ï:i
ó:o ò:o ô:o õ:o ö:o ø:o º:o Ó:o Ò:o Ô:o Õ:o Ö:o Ø:o
ú:u ù:u û:u ü:u Ú:u Ù:u Û:u Ü:u
ç:c Ç:c ñ:n Ñ:n ý:y ÿ:y Ý:y
æ:ae Æ:ae œ:oe Œ:oe ß:ss'

# Stopwords removidas de concept_id (docs/00-contratos.md §7.1). Espaço nas pontas é proposital.
SM_STOPWORDS=' de da do em e a o por com '

# ---------------------------------------------------------------------------
# sm_die <code> <mensagem...>
# Termina o processo com <code>, mensagem prefixada em stderr.
# ÚNICA função da lib autorizada a chamar exit (LIB-4); a exceção do exit 10 é
# de sm_request, em lib/json.sh, por §7.2 e pelo invariante I-23.
sm_die() {
    local code="${1:-1}"
    shift || true
    printf 'study-method: erro %s: %s\n' "$code" "${*:-falha nao descrita}" >&2
    exit "$code"
}

# sm_log <debug|info|warn|error> <mensagem...>
# Sempre 0. Escreve em stderr com carimbo ISO. `debug` só com STUDY_METHOD_LOG=debug.
sm_log() {
    local level="${1:-info}"
    shift || true
    if [ "$level" = "debug" ] && [ "${STUDY_METHOD_LOG:-}" != "debug" ]; then
        return 0
    fi
    printf '[%s] %s: %s\n' "$(sm_now_iso)" "$level" "${*:-}" >&2
    return 0
}

# sm_now_iso -> timestamp ISO 8601 com offset, casando o pattern de §4.2.
# Honra STUDY_METHOD_NOW (mesma função de determinismo que STUDY_METHOD_TODAY tem para o dia).
sm_now_iso() {
    local now off
    if [ -n "${STUDY_METHOD_NOW:-}" ]; then
        if [[ "$STUDY_METHOD_NOW" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$ ]]; then
            printf '%s\n' "$STUDY_METHOD_NOW"
            return 0
        fi
        printf '[?] warn: STUDY_METHOD_NOW ignorado (formato invalido): %s\n' "$STUDY_METHOD_NOW" >&2
    fi
    now="$(date +%Y-%m-%dT%H:%M:%S%z 2>/dev/null || true)"
    if [ -z "$now" ]; then
        printf '1970-01-01T00:00:00+00:00\n'
        return 0
    fi
    off="${now: -5}"                       # +0300
    printf '%s%s:%s\n' "${now%?????}" "${off:0:3}" "${off:3:2}"
    return 0
}

# sm_today -> YYYY-MM-DD. Honra STUDY_METHOD_TODAY (determinismo do gate).
sm_today() {
    local t="${STUDY_METHOD_TODAY:-}"
    if [ -n "$t" ]; then
        if [[ "$t" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
            printf '%s\n' "$t"
            return 0
        fi
        sm_log warn "STUDY_METHOD_TODAY ignorado (formato invalido): $t"
    fi
    date +%Y-%m-%d
    return 0
}

# sm_require_cmd <cmd>...
# 0 se todos presentes; 1 e nomeia em stderr o que falta e como instalar. NUNCA instala.
sm_require_cmd() {
    local c hint missing=0
    for c do
        if command -v "$c" >/dev/null 2>&1; then
            continue
        fi
        missing=1
        case "$c" in
            jq)        hint='pacman -S jq        (Debian/Ubuntu: apt install jq)' ;;
            python3)   hint='pacman -S python    (Debian/Ubuntu: apt install python3)' ;;
            od|sha256sum|stat|timeout|sync|mktemp)
                       hint='pacote coreutils da sua distribuicao' ;;
            unshare)   hint='pacote util-linux da sua distribuicao' ;;
            systemd-run) hint='pacote systemd da sua distribuicao' ;;
            *)         hint='instale pelo gerenciador de pacotes da sua distribuicao' ;;
        esac
        sm_log error "comando ausente: $c — para instalar: $hint"
    done
    [ "$missing" -eq 0 ] || return 1
    return 0
}

# sm_setup_root [<hint>] -> caminho absoluto da raiz do setup (sem barra final).
# Sobe por ancestrais procurando `setup.json` legível. Para DEPOIS de examinar $HOME
# (nunca acima dele); um <hint> fora de $HOME sobe até `/` inclusive.
# 0 achou · 3 nenhum setup.json legível.
sm_setup_root() {
    local start="${1:-$PWD}" dir home parent
    if [ -d "$start" ]; then
        dir="$(cd -P -- "$start" 2>/dev/null && pwd -P)" || dir=""
    else
        dir="$(cd -P -- "$(dirname -- "$start")" 2>/dev/null && pwd -P)" || dir=""
    fi
    [ -n "$dir" ] || { sm_log debug "sm_setup_root: caminho inacessivel: $start"; return 3; }
    home="${HOME:-}"
    [ -z "$home" ] || home="${home%/}"
    while : ; do
        if [ -f "$dir/setup.json" ] && [ -r "$dir/setup.json" ]; then
            printf '%s\n' "$dir"
            return 0
        fi
        [ "$dir" != "${home:-/dev/null/nao-existe}" ] || break
        [ "$dir" != "/" ] || break
        parent="$(dirname -- "$dir")"
        [ "$parent" != "$dir" ] || break
        dir="$parent"
    done
    sm_log debug "sm_setup_root: nenhum setup.json a partir de $start"
    return 3
}

# sm_normalize_concept_id <rótulo pt-BR> -> snake_case ^[a-z][a-z0-9_]{1,62}$
# 0 · 2 rótulo vazio ou sem nenhum caractere aproveitável. Determinístico.
sm_normalize_concept_id() {
    local raw="${1:-}" s pair from to tok out oldifs
    [ -n "$raw" ] || { sm_log debug "sm_normalize_concept_id: rotulo vazio"; return 2; }
    s="$raw"
    # shellcheck disable=SC2086
    for pair in $SM_ASCII_FOLD; do
        from="${pair%%:*}"; to="${pair#*:}"
        s="${s//"$from"/"$to"}"
    done
    s="${s,,}"
    s="$(printf '%s' "$s" | LC_ALL=C tr -c 'a-z0-9' '_')"
    out=""
    oldifs="$IFS"; IFS='_'
    for tok in $s; do
        [ -n "$tok" ] || continue
        case "$SM_STOPWORDS" in
            *" $tok "*) continue ;;
        esac
        out="${out}_${tok}"
    done
    IFS="$oldifs"
    out="${out#_}"
    out="${out%_}"
    [ -n "$out" ] || { sm_log debug "sm_normalize_concept_id: nada aproveitavel em: $raw"; return 2; }
    [[ "$out" == [a-z]* ]] || out="c_$out"
    out="${out:0:63}"
    out="${out%_}"
    [ "${#out}" -ge 2 ] || out="${out}_"
    if [[ "$out" =~ ^[a-z][a-z0-9_]{1,62}$ ]]; then
        printf '%s\n' "$out"
        return 0
    fi
    sm_log debug "sm_normalize_concept_id: resultado invalido para: $raw"
    return 2
}

# sm_normalize_slug <rótulo pt-BR> -> kebab-case ^[a-z0-9]+(-[a-z0-9]+)*$
# 0 · 2 rótulo vazio ou sem nenhum caractere aproveitável.
# NÃO remove stopwords: slug é nome de diretório/arquivo, namespace distinto do de conceito (§4.2).
sm_normalize_slug() {
    local raw="${1:-}" s pair from to
    [ -n "$raw" ] || { sm_log debug "sm_normalize_slug: rotulo vazio"; return 2; }
    s="$raw"
    # shellcheck disable=SC2086
    for pair in $SM_ASCII_FOLD; do
        from="${pair%%:*}"; to="${pair#*:}"
        s="${s//"$from"/"$to"}"
    done
    s="${s,,}"
    s="$(printf '%s' "$s" | LC_ALL=C tr -c 'a-z0-9' '-')"
    while [ "$s" != "${s//--/-}" ]; do s="${s//--/-}"; done
    s="${s#-}"; s="${s%-}"
    s="${s:0:64}"
    s="${s%-}"
    [ -n "$s" ] || { sm_log debug "sm_normalize_slug: nada aproveitavel em: $raw"; return 2; }
    if [[ "$s" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        printf '%s\n' "$s"
        return 0
    fi
    sm_log debug "sm_normalize_slug: resultado invalido para: $raw"
    return 2
}

# sm_atomic_write <destino>   (conteúdo vem de STDIN)
# tmp no MESMO diretório + sync + mv -f. Obrigatório para todos os derivados. 0 · 1 I/O.
sm_atomic_write() {
    local dest="${1:-}" dir tmp
    [ -n "$dest" ] || { sm_log error "sm_atomic_write: destino nao informado"; return 1; }
    dir="$(dirname -- "$dest")"
    if ! mkdir -p -- "$dir" 2>/dev/null; then
        sm_log error "sm_atomic_write: nao consegui criar o diretorio: $dir"
        return 1
    fi
    tmp="$dest.tmp.$$"
    if ! cat > "$tmp"; then
        rm -f -- "$tmp" 2>/dev/null || true
        sm_log error "sm_atomic_write: falha ao escrever o temporario: $tmp"
        return 1
    fi
    sync -- "$tmp" 2>/dev/null || sync 2>/dev/null || true
    if ! mv -f -- "$tmp" "$dest"; then
        rm -f -- "$tmp" 2>/dev/null || true
        sm_log error "sm_atomic_write: falha ao publicar: $dest"
        return 1
    fi
    return 0
}

# sm_next_seq <dir> <sufixo> -> NNNN (4 dígitos, zero-padded)
# max+1 da listagem, criação com `set -o noclobber`. 5 tentativas; 4 após 5 colisões.
# A listagem cobre, além de "<dir>/NNNN<sufixo>":
#   - "<dir>/*/NNNN<sufixo>"  (memory/discarded/, memory/broken/): nunca reaproveita purgado;
#   - "<dir>/NNNN-*"          (challenges/<NNNN>-<slug>/), quando <sufixo> é vazio.
sm_next_seq() {
    local dir="${1:-}" suf="${2-}" max n f seq padded attempt base
    [ -n "$dir" ] || { sm_log error "sm_next_seq: diretorio nao informado"; return 1; }
    if ! mkdir -p -- "$dir" 2>/dev/null; then
        sm_log error "sm_next_seq: nao consegui criar o diretorio: $dir"
        return 1
    fi
    for attempt in 1 2 3 4 5; do
        max=0
        for f in "$dir"/[0-9][0-9][0-9][0-9]"$suf" "$dir"/*/[0-9][0-9][0-9][0-9]"$suf"; do
            [ -e "$f" ] || continue
            base="${f##*/}"
            n="${base%"$suf"}"
            [[ "$n" =~ ^[0-9]{4}$ ]] || continue
            n=$((10#$n))
            [ "$n" -le "$max" ] || max="$n"
        done
        if [ -z "$suf" ]; then
            for f in "$dir"/[0-9][0-9][0-9][0-9]-*; do
                [ -e "$f" ] || continue
                base="${f##*/}"
                n="${base:0:4}"
                [[ "$n" =~ ^[0-9]{4}$ ]] || continue
                n=$((10#$n))
                [ "$n" -le "$max" ] || max="$n"
            done
        fi
        seq=$(( max + 1 ))
        if [ "$seq" -gt 9999 ]; then
            sm_log error "sm_next_seq: sequencia esgotada em $dir (max 9999)"
            return 1
        fi
        printf -v padded '%04d' "$seq"
        if ( set -o noclobber; : > "$dir/$padded$suf" ) 2>/dev/null; then
            printf '%s\n' "$padded"
            return 0
        fi
        sm_log debug "sm_next_seq: colisao em $dir/$padded$suf (tentativa $attempt)"
        # Recuo curto e aleatorio: sob concorrencia, evita que os perdedores recomputem
        # o mesmo max+1 no mesmo instante. Nao altera o mecanismo (max+1 + noclobber).
        sleep "0.0$(( RANDOM % 10 ))" 2>/dev/null || true
    done
    sm_log error "sm_next_seq: 5 colisoes seguidas em $dir"
    return 4
}

# sm_registry_path -> caminho absoluto do registry global. 0 sempre.
sm_registry_path() {
    printf '%s/registry.json\n' "${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}"
    return 0
}

# sm_registry_lock -> 0 obteve · 4 ocupado.
# mkdir é atômico. Lock com mtime > 60 s é morto: remove, avisa em stderr, retenta UMA vez.
# Instala `trap sm_registry_unlock EXIT` — o chamador não deve instalar outro trap EXIT depois.
sm_registry_lock() {
    local reg home lock mt now age try
    reg="$(sm_registry_path)"
    home="$(dirname -- "$reg")"
    lock="$home/.registry.lock"
    if ! mkdir -p -- "$home" 2>/dev/null; then
        sm_log warn "sm_registry_lock: STUDY_METHOD_HOME nao gravavel: $home"
        return 4
    fi
    for try in 1 2; do
        if mkdir -- "$lock" 2>/dev/null; then
            SM_REGISTRY_LOCK_DIR="$lock"
            # shellcheck disable=SC2064
            trap 'sm_registry_unlock' EXIT
            return 0
        fi
        mt="$(stat -c %Y -- "$lock" 2>/dev/null || stat -f %m -- "$lock" 2>/dev/null || printf '0')"
        [[ "$mt" =~ ^[0-9]+$ ]] || mt=0
        now="$(date +%s)"
        age=$(( now - mt ))
        if [ "$mt" -gt 0 ] && [ "$age" -gt 60 ] && [ "$try" -eq 1 ]; then
            sm_log warn "lock de registry morto ha ${age}s, removendo: $lock"
            rmdir -- "$lock" 2>/dev/null || true
            continue
        fi
        break
    done
    sm_log warn "registry ocupado: $lock"
    return 4
}

# sm_registry_unlock -> 0 sempre (idempotente).
sm_registry_unlock() {
    if [ -n "${SM_REGISTRY_LOCK_DIR:-}" ]; then
        rmdir -- "$SM_REGISTRY_LOCK_DIR" 2>/dev/null || true
        SM_REGISTRY_LOCK_DIR=""
    fi
    return 0
}

# sm_setup_lock <setup_root> [<session_id>] -> 0 obteve · 4 sessão viva.
# Grava memory/.session.lock com {pid, hostname, session_id, started_at}.
# Lock existente com MESMO hostname E `kill -0 <pid>` bem-sucedido -> 4.
# Caso contrário é órfão: remove, avisa em stderr, prossegue.
# <session_id> cai para $SM_SESSION_ID quando omitido; ausente vira null.
sm_setup_lock() {
    local root="${1:-}" sid="${2:-${SM_SESSION_ID:-}}" lock hn lhost lpid
    [ -n "$root" ] || { sm_log error "sm_setup_lock: setup_root nao informado"; return 1; }
    lock="$root/memory/.session.lock"
    hn="${HOSTNAME:-}"
    [ -n "$hn" ] || hn="$(uname -n 2>/dev/null || printf 'desconhecido')"
    if [ -f "$lock" ]; then
        lhost="$(jq -r '.hostname // ""' < "$lock" 2>/dev/null || printf '')"
        lpid="$(jq -r '.pid // 0' < "$lock" 2>/dev/null || printf '0')"
        [[ "$lpid" =~ ^[0-9]+$ ]] || lpid=0
        if [ "$lhost" = "$hn" ] && [ "$lpid" -gt 0 ] && kill -0 "$lpid" 2>/dev/null; then
            sm_log warn "sessao viva neste setup (pid $lpid em $lhost): $lock"
            return 4
        fi
        sm_log warn "lock de sessao orfao removido (pid ${lpid:-?} em ${lhost:-?}): $lock"
        rm -f -- "$lock" 2>/dev/null || true
    fi
    if ! jq -n \
            --argjson pid "$$" \
            --arg hostname "$hn" \
            --arg session_id "$sid" \
            --arg started_at "$(sm_now_iso)" \
            '{pid:$pid, hostname:$hostname,
              session_id:(if $session_id == "" then null else $session_id end),
              started_at:$started_at}' \
        | sm_atomic_write "$lock"; then
        sm_log error "sm_setup_lock: nao consegui gravar o lock: $lock"
        return 1
    fi
    return 0
}

# sm_setup_unlock <setup_root> -> 0 sempre (idempotente).
sm_setup_unlock() {
    local root="${1:-}"
    [ -n "$root" ] || return 0
    rm -f -- "$root/memory/.session.lock" 2>/dev/null || true
    return 0
}

# sm_relpath <caminho> <raiz> -> relativo a <raiz>, sem `./` inicial. 0 · 2 fora da raiz.
# Comparação léxica sobre caminhos já normalizados; `.` quando <caminho> é a própria raiz.
sm_relpath() {
    local p="${1:-}" r="${2:-}"
    [ -n "$p" ] && [ -n "$r" ] || { sm_log debug "sm_relpath: argumento faltando"; return 2; }
    p="${p%/}"; r="${r%/}"
    [ -n "$p" ] || p="/"
    [ -n "$r" ] || r="/"
    if [ "$p" = "$r" ]; then
        printf '.\n'
        return 0
    fi
    case "$p" in
        "$r"/*)
            p="${p#"$r"/}"
            p="${p#./}"
            printf '%s\n' "$p"
            return 0
            ;;
    esac
    sm_log debug "sm_relpath: $p esta fora de $r"
    return 2
}

# sm_chmod_private <caminho> -> chmod 700. 0 · 1.
sm_chmod_private() {
    local p="${1:-}"
    [ -n "$p" ] || { sm_log error "sm_chmod_private: caminho nao informado"; return 1; }
    if [ ! -e "$p" ]; then
        sm_log error "sm_chmod_private: caminho inexistente: $p"
        return 1
    fi
    if ! chmod 700 -- "$p" 2>/dev/null; then
        sm_log error "sm_chmod_private: chmod 700 falhou: $p"
        return 1
    fi
    return 0
}
