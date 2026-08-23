#!/usr/bin/env bash
# detect-toolchains.sh — quais linguagens estão instaladas nesta máquina, e em que versão.
#
# Contrato: docs/00-contratos.md §8. Comandos de detecção: SK/references/languages.md §3.1 (todos
# verificados executando). Exit codes: 0 ok · 1 erro de execução · 2 uso incorreto (§5.1).
#
# Uso:
#   detect-toolchains.sh [--cached] [--setup <setup_root>] [--language <l>] [--json]
#     --cached          lê o cache SEM re-sondar; falha (1) se não houver cache
#     --setup <root>    acrescenta o bloco "setup" com a linguagem declarada em setup.json
#     --language <l>    devolve só essa linguagem (enum de docs/00-contratos.md §4.1)
#     --json            explícito; a saída já é JSON sempre
#
# ESCOPO DESTA VERSÃO: as cinco linguagens zero-install — python, javascript (node), go, rust, c.
# As outras 14 do enum são DECLARADAS como "não implementadas nesta versão"
# ("available": null, "implemented": false) e NUNCA sondadas em silêncio: dizer "não instalada"
# sobre algo que não foi procurado é mentira, e o tutor tomaria decisão pedagógica em cima dela.
#
# NUNCA INSTALA NADA. Ausência de toolchain é informação devolvida, nunca ação tomada.
#
# Este script é deliberadamente autossuficiente: não dá `source` em lib/, porque roda no bootstrap
# — antes de existir setup, e antes de haver garantia de que lib/ esteja completa.

set -euo pipefail

SM_SELF="detect-toolchains.sh"
SM_SCHEMA_VERSION="1.0"

sm_err() { printf '%s: %s\n' "$SM_SELF" "$*" >&2; }
sm_die() { local c="$1"; shift; printf 'study-method: erro %s: %s\n' "$c" "$*" >&2; exit "$c"; }

# ---------------------------------------------------------------------------
# Enum fechado de linguagens (docs/00-contratos.md §4.1) e o subconjunto implementado
# ---------------------------------------------------------------------------
SM_LANGS_ALL="python javascript typescript rust go java csharp ruby elixir kotlin swift c cpp php lua julia r haskell bash"
SM_LANGS_IMPL="python javascript go rust c"

# Pertinência ao enum e ao subconjunto implementado. Os espaços das duas pontas são obrigatórios:
# sem eles o primeiro e o último item da lista nunca casam.
sm_is_known()       { case " $SM_LANGS_ALL "  in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
sm_is_implemented() { case " $SM_LANGS_IMPL " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

# Candidatos de binário e como extrair a versão. Um par por linguagem, na ordem verificada em
# SK/references/languages.md §3.1 — o primeiro candidato que responder vence.
sm_candidates() {
    case "$1" in
        python)     printf 'python3\npython\n' ;;
        javascript) printf 'node\n' ;;
        go)         printf 'go\n' ;;
        rust)       printf 'cargo\n' ;;
        c)          printf 'gcc\ncc\nclang\n' ;;
        *)          : ;;
    esac
}

# Comando de sonda de versão, por linguagem — exatamente os de languages.md §3.1.
sm_probe_argv() {
    case "$1" in
        python)     printf '%s --version' "$2" ;;
        javascript) printf '%s --version' "$2" ;;
        go)         printf '%s version' "$2" ;;
        rust)       printf '%s --version' "$2" ;;
        c)          printf '%s --version' "$2" ;;
        *)          : ;;
    esac
}

# Comando de teste do desafio, por linguagem (languages.md §3.1) — informativo, para o chamador
# não ter que reabrir a referência.
sm_test_command() {
    case "$1" in
        python)     printf 'python3 -m unittest discover -s tests -p "test_*.py" -v' ;;
        javascript) printf 'node --test --test-reporter=tap tests/stub.test.js' ;;
        go)         printf 'go test ./... -v' ;;
        rust)       printf 'cargo test' ;;
        c)          printf 'gcc -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner' ;;
        *)          : ;;
    esac
}

# Extrai a versão da saída bruta da sonda. Verificado contra a saída real de cada ferramenta.
sm_extract_version() {
    local lang="$1" raw="$2" first
    first="$(printf '%s\n' "$raw" | head -n1)"
    case "$lang" in
        python)     printf '%s' "${first#Python }" ;;                       # "Python 3.14.7"
        javascript) printf '%s' "${first#v}" ;;                             # "v24.19.0"
        go)         # "go version go1.26.5-X:nodwarf5 linux/amd64" — o sufixo de build do
                    # Arch/CachyOS entra no token, então recorta só o número.
                    printf '%s' "$(printf '%s' "$first" | awk '{print $3}' \
                                   | grep -oE '[0-9]+(\.[0-9]+)*' | head -n1)" ;;
        rust)       printf '%s' "$(printf '%s' "$first" | awk '{print $2}')" ;;   # "cargo 1.98.0 (…)"
        c)          printf '%s' "$(printf '%s' "$first" | grep -oE '[0-9]+(\.[0-9]+)+' | head -n1)" ;;
        *)          printf '%s' "$first" ;;
    esac
}

sm_json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\000-\037'
}

sm_home() {
    printf '%s' "${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}"
}

sm_now_iso() {
    date +%Y-%m-%dT%H:%M:%S%:z 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ
}

# Escrita atômica: tmp no mesmo diretório + mv. Inline de propósito — ver o cabeçalho.
sm_atomic_write_file() {
    local dest="$1" tmp
    tmp="$dest.tmp.$$"
    if ! cat > "$tmp" 2>/dev/null; then rm -f "$tmp" 2>/dev/null || true; return 1; fi
    if ! mv -f "$tmp" "$dest" 2>/dev/null; then rm -f "$tmp" 2>/dev/null || true; return 1; fi
    return 0
}

# ---------------------------------------------------------------------------
# Sonda de uma linguagem. stdout: "<available>\t<version>\t<command>\t<path>"
# Nunca deixa uma ferramenta travada segurar o bootstrap: usa `timeout` quando existe.
# ---------------------------------------------------------------------------
sm_detect_one() {
    local lang="$1" cand raw ver path rc
    while IFS= read -r cand; do
        [ -n "$cand" ] || continue
        path="$(command -v "$cand" 2>/dev/null || true)"
        [ -n "$path" ] || continue
        set +e
        if command -v timeout >/dev/null 2>&1; then
            raw="$(timeout -s KILL -k 2 10 sh -c "$(sm_probe_argv "$lang" "$cand") 2>&1")"
        else
            raw="$(sh -c "$(sm_probe_argv "$lang" "$cand") 2>&1")"
        fi
        rc=$?
        set -e
        [ "$rc" -eq 0 ] || continue
        ver="$(sm_extract_version "$lang" "$raw")"
        [ -n "$ver" ] || ver="desconhecida"
        printf 'true\t%s\t%s\t%s\n' "$ver" "$cand" "$path"
        return 0
    done <<EOF
$(sm_candidates "$lang")
EOF
    printf 'false\t\t\t\n'
    return 0
}

# ---------------------------------------------------------------------------
# Montagem do documento JSON
# ---------------------------------------------------------------------------
sm_emit_language() {
    local lang="$1" indent="    " avail ver cmd path
    if sm_is_implemented "$lang"; then
        IFS=$'\t' read -r avail ver cmd path <<EOF
$(sm_detect_one "$lang")
EOF
        printf '%s"%s": {' "$indent" "$lang"
        printf '"available": %s, ' "$avail"
        if [ "$avail" = true ]; then
            printf '"version": "%s", ' "$(sm_json_escape "$ver")"
            printf '"command": "%s", ' "$(sm_json_escape "$cmd")"
            printf '"path": "%s", ' "$(sm_json_escape "$path")"
        else
            printf '"version": null, "command": null, "path": null, '
        fi
        printf '"implemented": true, '
        printf '"test_command": "%s"}' "$(sm_json_escape "$(sm_test_command "$lang")")"
    else
        # Não implementada: NÃO sondada. `available: null` é "eu não sei", não "não tem".
        printf '%s"%s": {' "$indent" "$lang"
        printf '"available": null, "version": null, "command": null, "path": null, '
        printf '"implemented": false, "reason": "not_implemented_in_this_version"}'
    fi
}

sm_build_json() {
    local only="$1" setup_root="$2"
    local lang first=1 setup_lang="" setup_avail=null

    printf '{\n'
    printf '  "schema_version": "%s",\n' "$SM_SCHEMA_VERSION"
    printf '  "generated_at": "%s",\n' "$(sm_now_iso)"
    printf '  "host": "%s",\n' "$(sm_json_escape "$(uname -n 2>/dev/null || printf unknown)")"
    printf '  "platform": "%s",\n' "$(sm_json_escape "$(uname -s 2>/dev/null || printf unknown)")"
    printf '  "implemented_languages": ['
    first=1
    for lang in $SM_LANGS_IMPL; do
        [ "$first" -eq 1 ] || printf ', '
        printf '"%s"' "$lang"; first=0
    done
    printf '],\n'
    printf '  "languages": {\n'
    first=1
    for lang in $SM_LANGS_ALL; do
        if [ -n "$only" ] && [ "$lang" != "$only" ]; then continue; fi
        [ "$first" -eq 1 ] || printf ',\n'
        sm_emit_language "$lang"
        first=0
    done
    printf '\n  }'

    if [ -n "$setup_root" ]; then
        if [ -r "$setup_root/setup.json" ]; then
            setup_lang="$(sed -n 's/.*"language"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p' \
                          "$setup_root/setup.json" 2>/dev/null | head -n1)"
        fi
        if [ -n "$setup_lang" ]; then
            if sm_is_implemented "$setup_lang"; then
                setup_avail="$(sm_detect_one "$setup_lang" | cut -f1)"
            fi
        fi
        printf ',\n  "setup": {"root": "%s", "language": %s, "available": %s}' \
            "$(sm_json_escape "$setup_root")" \
            "$( [ -n "$setup_lang" ] && printf '"%s"' "$(sm_json_escape "$setup_lang")" || printf null )" \
            "$setup_avail"
    fi
    printf '\n}\n'
}

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
sm_usage() {
    printf 'uso: %s [--cached] [--setup <setup_root>] [--language <l>] [--json]\n' "$SM_SELF" >&2
}

main() {
    local cached=0 setup_root="" only="" doc cache

    while [ $# -gt 0 ]; do
        case "$1" in
            --cached)   cached=1; shift ;;
            --json)     shift ;;
            --setup)    [ $# -ge 2 ] || { sm_usage; sm_die 2 "--setup exige um caminho"; }
                        setup_root="$2"; shift 2 ;;
            --language) [ $# -ge 2 ] || { sm_usage; sm_die 2 "--language exige um valor"; }
                        only="$2"; shift 2 ;;
            -h|--help)  sm_usage; exit 0 ;;
            *)          sm_usage; sm_die 2 "argumento desconhecido: $1" ;;
        esac
    done

    if [ -n "$only" ] && ! sm_is_known "$only"; then
        sm_die 2 "linguagem fora do enum de docs/00-contratos.md §4.1: $only"
    fi
    if [ -n "$setup_root" ] && [ ! -d "$setup_root" ]; then
        sm_err "aviso: --setup aponta para um diretório inexistente: $setup_root"
        setup_root=""
    fi

    cache="$(sm_home)/toolchains.json"

    if [ "$cached" -eq 1 ]; then
        if [ ! -r "$cache" ]; then
            sm_die 1 "não há cache em $cache; rode $SM_SELF sem --cached para sondar"
        fi
        if [ -n "$only" ]; then
            # Recorta a linguagem pedida do cache, sem re-sondar nada.
            if command -v jq >/dev/null 2>&1; then
                jq -c --arg l "$only" '{schema_version, generated_at, host,
                                        languages: {($l): .languages[$l]}}' "$cache" \
                    || sm_die 1 "cache ilegível: $cache"
            else
                sm_err "aviso: sem jq — devolvendo o cache inteiro em vez de só '$only'"
                cat "$cache"
            fi
        else
            cat "$cache" || sm_die 1 "não consegui ler o cache: $cache"
        fi
        exit 0
    fi

    doc="$(sm_build_json "$only" "$setup_root")"
    printf '%s\n' "$doc"

    # O cache guarda SEMPRE o documento canônico da MÁQUINA, inteiro e sem o bloco "setup":
    # recortá-lo por --language, ou carimbá-lo com um setup específico, envenenaria toda leitura
    # posterior com --cached.
    if [ -z "$only" ] && [ -z "$setup_root" ]; then
        if mkdir -p "$(dirname "$cache")" 2>/dev/null; then
            if ! printf '%s\n' "$doc" | sm_atomic_write_file "$cache"; then
                sm_err "aviso: não consegui gravar o cache em $cache (a detecção acima vale mesmo assim)"
            fi
        else
            sm_err "aviso: não consegui criar $(dirname "$cache") (a detecção acima vale mesmo assim)"
        fi
    fi
    exit 0
}

main "$@"
