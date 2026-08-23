# shellcheck shell=bash
# lib/sandbox.sh — isolamento de execução do código do aluno.
# Contrato em docs/00-contratos.md §7.3; garantias G1..G9 em docs/11-seguranca-privacidade.md §2.
# Valem LIB-1..LIB-6: apenas `source` (modo 0644, sem shebang, sem main), prefixo sm_/SM_,
# stdout só o valor documentado (log sempre em stderr), nenhum `exit` (só return), `set -u`
# assumido e `set -e` NÃO assumido — e nenhuma função quebra se o chamador tiver `set -e`.
#
# Pilha canônica, de fora para dentro (a ordem NÃO pode ser invertida; cada camada é sondada antes):
#   timeout -s KILL -k 5
#     -> systemd-run --user --scope -p MemoryMax -p MemorySwapMax=0 -p TasksMax=128
#       -> unshare --user --net --pid --fork --map-current-user   (ou bwrap --unshare-all)
#         -> bash -c 'ulimit -t … -f …; cd "$1" || exit 66; shift; exec "$@"'
#
# VERIFICADO: `timeout` SEM -s KILL não erra o código — ele TRAVA dentro desta pilha (o sinal não
# propaga através de unshare/systemd-run; medido: 12002 ms sem terminar). Detecção de timeout é
# por TEMPO DECORRIDO, nunca por exit code: 124 nunca chega.
# VERIFICADO: probe_bwrap exige os 4 --symlink (usr/bin, usr/sbin, usr/lib, usr/lib64); sem
# /lib64 o loader ELF não é encontrado em x86-64 e a sonda falha silenciosamente, desligando o
# confinamento de escrita em toda máquina Linux.
# VERIFICADO: `unshare --user --net --pid` NÃO confina escrita (não é mount namespace) — o
# processo grava em $HOME sem erro. Confinamento real só com bwrap ou Docker.
# VERIFICADO: `ulimit -v` quebra runtimes com JIT (Node 24 falha com -v 1G; JVM 17 com -v 2G).
# O limite de memória correto é MemoryMax do cgroup, sem root.
# VERIFICADO: `ulimit -u` conta processos do UID inteiro — inutilizável num desktop. Use TasksMax.
# ⭐ VERIFICADO, e corrige o default de docs/11 §2.2: `TasksMax=128` DERRUBA `go test` com cache
# de build frio. Medido nesta máquina (32 CPUs): rc=1 com "fork/exec …/compile: resource
# temporarily unavailable"; 256 já passa; o default aqui é 512. O motivo é que o cgroup conta
# THREADS, não processos, e o build do Go abre um `compile` por CPU, cada um multithread. 512
# continua contendo fork bomb com folga (uma sessão de desktop inteira roda com ~160 tarefas) e
# o cgroup só conta o escopo do desafio.

SM_SANDBOX_PROBE_SCHEMA="1"

# ---------------------------------------------------------------------------
# Infraestrutura interna (sm_sandbox__* são privadas deste arquivo)
# ---------------------------------------------------------------------------

# Log: delega a sm_log de lib/common.sh quando presente; senão escreve em stderr (LIB-3).
sm_sandbox__log() {
    local level="$1"; shift
    if declare -F sm_log >/dev/null 2>&1; then
        sm_log "$level" "$@"
    else
        printf 'study-method: [%s] %s\n' "$level" "$*" >&2
    fi
    return 0
}

sm_sandbox__have() { command -v "$1" >/dev/null 2>&1; }

# Milissegundos desde a epoch. EPOCHREALTIME é bash 5; `date` é o fallback.
sm_sandbox__now_ms() {
    local s f
    if [ -n "${EPOCHREALTIME:-}" ]; then
        s="${EPOCHREALTIME%%[.,]*}"; f="${EPOCHREALTIME#*[.,]}"
        f="${f}000000"
        printf '%s%s\n' "$s" "${f:0:3}"
    else
        date +%s%3N 2>/dev/null || printf '%s000\n' "$(date +%s)"
    fi
    return 0
}

# "2.001" -> 2001 ms. Aceita inteiro, decimal com ponto, ou vazio.
sm_sandbox__to_ms() {
    local v="${1:-0}" i f
    case "$v" in ''|*[!0-9.]*) printf '0\n'; return 0 ;; esac
    i="${v%%.*}"; f="${v#*.}"
    if [ "$f" = "$v" ]; then f=000; fi
    f="${f}000"; f="${f:0:3}"
    printf '%s\n' "$(( 10#${i:-0} * 1000 + 10#$f ))"
    return 0
}

sm_sandbox__home() {
    printf '%s\n' "${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}"
}

sm_sandbox__cache_file() {
    printf '%s\n' "${SM_SANDBOX_CACHE:-$(sm_sandbox__home)/sandbox-probe.json}"
}

# Lê um campo escalar do documento de capacidades. O `tr` quebra o JSON em uma-chave-por-linha
# ANTES do sed: sem ele um documento compacto (uma linha só) só entregaria a primeira chave, e a
# variável de override SM_SANDBOX_PROBE_DOC — que qualquer chamador ou teste pode passar compacta —
# faria toda capacidade parecer ausente. Os valores deste documento são tokens simples (booleano
# ou palavra do enum), então quebrar em vírgula é seguro. Não depende de jq (LIB-6).
sm_sandbox__field_of() {
    printf '%s\n' "$1" | tr ',{}' '\n\n\n' \
        | sed -n 's/^[[:space:]]*"'"$2"'"[[:space:]]*:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}.*$/\1/p' \
        | head -n1
    return 0
}

# ---------------------------------------------------------------------------
# Sondas — todas silenciosas, todas baratas, todas "roda um no-op"
# (docs/11-seguranca-privacidade.md §2.2)
# ---------------------------------------------------------------------------

# G1: qual mecanismo de relógio existe. Ordem verificada de degradação.
sm_sandbox__probe_timeout() {
    if sm_sandbox__have timeout; then printf 'coreutils_timeout\n'
    elif sm_sandbox__have gtimeout; then printf 'coreutils_gtimeout\n'
    elif sm_sandbox__have perl; then printf 'perl_alarm\n'
    else printf 'none\n'
    fi
    return 0
}

# G2/G9: RLIMIT_CPU e RLIMIT_FSIZE são builtins POSIX; sonda numa subshell para não sujar o shell.
sm_sandbox__probe_cpu() {
    ( ulimit -t 3600 && ulimit -f 65536 ) >/dev/null 2>&1
}

# G3/G4: qual flag de mapeamento o unshare aceita. -c (--map-current-user) é o preferido: com -r,
# `id -u` devolve 0 dentro e há toolchain que se recusa a rodar como root.
sm_sandbox__probe_unshare_map() {
    if ! sm_sandbox__have unshare; then printf 'none\n'; return 1; fi
    if unshare --user --map-current-user -- true >/dev/null 2>&1; then printf -- '-c\n'; return 0; fi
    if unshare --user --map-root-user -- true >/dev/null 2>&1; then printf -- '-r\n'; return 0; fi
    printf 'none\n'; return 1
}

sm_sandbox__probe_pidns() {
    local m="${1:--c}"
    if [ "$m" = none ] || [ -z "$m" ]; then return 1; fi
    unshare --user --pid --fork "$m" -- true >/dev/null 2>&1
}

# `unshare --net` sozinho exige CAP_SYS_ADMIN — tem que vir combinado com --user.
sm_sandbox__probe_netns() {
    local m="${1:--c}"
    if [ "$m" = none ] || [ -z "$m" ]; then return 1; fi
    unshare --user --net "$m" -- true >/dev/null 2>&1
}

# G7/G8: cgroup do usuário com os controladores delegados ao user slice. Sem root.
sm_sandbox__probe_memcg() {
    if ! sm_sandbox__have systemd-run; then return 1; fi
    systemd-run --user --scope -q -p MemoryMax=64M -p MemorySwapMax=0 -p TasksMax=64 \
        /bin/true >/dev/null 2>&1
}

# ⭐ VERIFICADO, e é um defeito que se esconde: sem `-p OOMPolicy=continue`, quando o cgroup
# estoura o systemd PARA o escopo inteiro e manda SIGTERM em quem sobrou. O comando sai 143 (não
# 137), o wrapper morre antes de ler memory.events e a EVIDÊNCIA DO OOM SOME — o 137 vira
# inclassificável. Medido nesta máquina: sem a propriedade, rc=143 e nenhum oom_kill lido; com
# ela, rc=137 e `oom_kill 1`. OOMPolicy existe a partir do systemd 243, então é sondada à parte.
sm_sandbox__probe_oompolicy() {
    if ! sm_sandbox__have systemd-run; then return 1; fi
    systemd-run --user --scope -q -p MemoryMax=64M -p MemorySwapMax=0 -p TasksMax=64 \
        -p OOMPolicy=continue /bin/true >/dev/null 2>&1
}

# G6: bubblewrap. Os QUATRO --symlink são obrigatórios — sem /lib64 o loader ELF não é achado em
# x86-64 e a sonda falha com "execvp /bin/true: No such file or directory", o que desligaria o
# confinamento de escrita silenciosamente. Em distro sem /usr unificado, tenta a forma --ro-bind.
# stdout: o estilo que funcionou — symlink | bind | none.
sm_sandbox__probe_bwrap() {
    if ! sm_sandbox__have bwrap; then printf 'none\n'; return 1; fi
    if bwrap --unshare-all --ro-bind /usr /usr \
             --symlink usr/bin /bin --symlink usr/sbin /sbin \
             --symlink usr/lib /lib --symlink usr/lib64 /lib64 \
             -- /bin/true >/dev/null 2>&1; then
        printf 'symlink\n'; return 0
    fi
    if bwrap --unshare-all --ro-bind /usr /usr \
             --ro-bind-try /bin /bin --ro-bind-try /sbin /sbin \
             --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64 \
             -- /bin/true >/dev/null 2>&1; then
        printf 'bind\n'; return 0
    fi
    printf 'none\n'; return 1
}

sm_sandbox__probe_docker() {
    if ! sm_sandbox__have docker; then return 1; fi
    if sm_sandbox__have timeout; then
        timeout -s KILL -k 2 5 docker info >/dev/null 2>&1
    else
        docker info >/dev/null 2>&1
    fi
}

# Roda todas as sondas e escreve o documento completo (capabilities + detail) em stdout.
sm_sandbox__probe_all() {
    local t cpu map pidns netns memcg fsc docker fscap oompol
    t="$(sm_sandbox__probe_timeout)"
    cpu=false; if sm_sandbox__probe_cpu; then cpu=true; fi
    map="$(sm_sandbox__probe_unshare_map || true)"; if [ -z "$map" ]; then map=none; fi
    pidns=false; if sm_sandbox__probe_pidns "$map"; then pidns=true; fi
    netns=false; if sm_sandbox__probe_netns "$map"; then netns=true; fi
    memcg=false; if sm_sandbox__probe_memcg; then memcg=true; fi
    oompol=none
    if [ "$memcg" = true ] && sm_sandbox__probe_oompolicy; then oompol=continue; fi
    fsc="$(sm_sandbox__probe_bwrap || true)"; if [ -z "$fsc" ]; then fsc=none; fi
    docker=false; if sm_sandbox__probe_docker; then docker=true; fi
    fscap=bwrap; if [ "$fsc" = none ]; then fscap=none; fi

    printf '{\n'
    printf '  "schema": "%s",\n' "$SM_SANDBOX_PROBE_SCHEMA"
    printf '  "host": "%s",\n' "$(uname -n 2>/dev/null || printf 'unknown')"
    printf '  "platform": "%s",\n' "$(uname -s 2>/dev/null || printf 'unknown')"
    printf '  "capabilities": {\n'
    printf '    "timeout": "%s",\n' "$t"
    printf '    "cpu": %s,\n' "$cpu"
    printf '    "pidns": %s,\n' "$pidns"
    printf '    "netns": %s,\n' "$netns"
    printf '    "memcg": %s,\n' "$memcg"
    printf '    "fs_confine": "%s",\n' "$fscap"
    printf '    "docker": %s\n' "$docker"
    printf '  },\n'
    printf '  "detail": {\n'
    printf '    "unshare_map": "%s",\n' "$map"
    printf '    "oom_policy": "%s",\n' "$oompol"
    printf '    "bwrap_bind_style": "%s"\n' "$fsc"
    printf '  }\n'
    printf '}\n'
    return 0
}

# ---------------------------------------------------------------------------
# sm_sandbox_probe [--force] [--detail]
# ---------------------------------------------------------------------------
# stdout: JSON com as 7 capacidades do contrato §7.3, nesta ordem:
#   {"timeout":"coreutils_timeout|coreutils_gtimeout|perl_alarm|none",
#    "cpu":bool,"pidns":bool,"netns":bool,"memcg":bool,
#    "fs_confine":"bwrap|none","docker":bool}
# --detail imprime o documento inteiro (schema, host, platform, capabilities, detail).
# Exit 0 sempre. Cacheado por sessão em memória (SM_SANDBOX_PROBE_DOC) e em disco, em
# ${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/sandbox-probe.json;
# o cache é descartado se o `schema` ou o `host` divergirem.
sm_sandbox_probe() {
    local force=0 detail=0 cache doc host_now
    while [ $# -gt 0 ]; do
        case "$1" in
            --force)  force=1 ;;
            --detail) detail=1 ;;
            *) sm_sandbox__log warn "sm_sandbox_probe: argumento ignorado: $1" ;;
        esac
        shift
    done

    cache="$(sm_sandbox__cache_file)"
    host_now="$(uname -n 2>/dev/null || printf 'unknown')"
    doc=""

    if [ "$force" -eq 0 ] && [ -n "${SM_SANDBOX_PROBE_DOC:-}" ]; then
        doc="$SM_SANDBOX_PROBE_DOC"
    elif [ "$force" -eq 0 ] && [ -r "$cache" ]; then
        doc="$(cat "$cache" 2>/dev/null || true)"
        if [ "$(sm_sandbox__field_of "$doc" schema)" != "$SM_SANDBOX_PROBE_SCHEMA" ] \
           || [ "$(sm_sandbox__field_of "$doc" host)" != "$host_now" ]; then
            doc=""
        fi
    fi
    if [ -z "$doc" ]; then
        doc="$(sm_sandbox__probe_all)"
        if mkdir -p "$(dirname "$cache")" 2>/dev/null; then
            if printf '%s\n' "$doc" > "$cache.tmp.$$" 2>/dev/null; then
                mv -f "$cache.tmp.$$" "$cache" 2>/dev/null || rm -f "$cache.tmp.$$" 2>/dev/null
            else
                rm -f "$cache.tmp.$$" 2>/dev/null || true
            fi
        fi
    fi
    SM_SANDBOX_PROBE_DOC="$doc"

    if [ "$detail" -eq 1 ]; then
        printf '%s\n' "$doc"
    else
        printf '{"timeout":"%s","cpu":%s,"pidns":%s,"netns":%s,"memcg":%s,"fs_confine":"%s","docker":%s}\n' \
            "$(sm_sandbox__field_of "$doc" timeout)" \
            "$(sm_sandbox__field_of "$doc" cpu)" \
            "$(sm_sandbox__field_of "$doc" pidns)" \
            "$(sm_sandbox__field_of "$doc" netns)" \
            "$(sm_sandbox__field_of "$doc" memcg)" \
            "$(sm_sandbox__field_of "$doc" fs_confine)" \
            "$(sm_sandbox__field_of "$doc" docker)"
    fi
    return 0
}

# Lê uma capacidade (ou um campo de `detail`) do documento cacheado, sondando se necessário.
sm_sandbox__cap() {
    if [ -z "${SM_SANDBOX_PROBE_DOC:-}" ]; then sm_sandbox_probe >/dev/null; fi
    sm_sandbox__field_of "${SM_SANDBOX_PROBE_DOC:-}" "$1"
    return 0
}

# ---------------------------------------------------------------------------
# sm_sandbox_report [--once <setup_root>] [--force]
# ---------------------------------------------------------------------------
# stdout: uma linha em pt-BR para o aluno. Exit 0 sempre.
#   Sandbox: tempo OK · memória OK (cgroup) · rede isolada OK · escrita confinada NÃO (…)
# Sem argumento imprime sempre. Com --once <setup_root>, imprime só na primeira vez por setup
# (marcador em $STUDY_METHOD_HOME/reported/) e devolve stdout vazio nas seguintes.
# HONESTIDADE OBRIGATÓRIA: o que não está protegido é declarado em voz alta, nunca escondido.
# O item de "netos" só aparece quando é má notícia — a linha canônica tem quatro itens.
sm_sandbox_report() {
    local once="" force=0 marker line t cpu pidns netns memcg fsc docker plat
    while [ $# -gt 0 ]; do
        case "$1" in
            --once)  once="${2:-}"; shift ;;
            --force) force=1 ;;
            *) sm_sandbox__log warn "sm_sandbox_report: argumento ignorado: $1" ;;
        esac
        shift
    done

    if [ -n "$once" ]; then
        marker="$(sm_sandbox__home)/reported/$(printf '%s' "$once" | cksum | tr -d ' ').flag"
        if [ "$force" -eq 0 ] && [ -e "$marker" ]; then return 0; fi
        if mkdir -p "$(dirname "$marker")" 2>/dev/null; then : > "$marker" 2>/dev/null || true; fi
    fi

    t="$(sm_sandbox__cap timeout)";   cpu="$(sm_sandbox__cap cpu)"
    pidns="$(sm_sandbox__cap pidns)"; netns="$(sm_sandbox__cap netns)"
    memcg="$(sm_sandbox__cap memcg)"; fsc="$(sm_sandbox__cap fs_confine)"
    docker="$(sm_sandbox__cap docker)"
    plat="$(uname -s 2>/dev/null || printf unknown)"

    case "$t" in
        coreutils_timeout)  line="Sandbox: tempo OK" ;;
        coreutils_gtimeout) line="Sandbox: tempo OK (gtimeout)" ;;
        perl_alarm)         line="Sandbox: tempo OK (perl alarm)" ;;
        *)
            if [ "$cpu" = true ]; then line="Sandbox: tempo SÓ de CPU (ulimit -t; loop que dorme não é morto)"
            else line="Sandbox: tempo NÃO"; fi ;;
    esac

    if [ "$memcg" = true ]; then
        line="$line · memória OK (cgroup)"
    elif [ "$plat" = Linux ]; then
        line="$line · memória parcial (ulimit -v, só C/C++/Python/Go)"
    else
        line="$line · memória NÃO"
    fi

    if [ "$netns" = true ] || [ "$fsc" = bwrap ]; then
        line="$line · rede isolada OK"
    else
        line="$line · rede isolada NÃO (só variáveis de proxy: lombada, não muro)"
    fi

    if [ "$pidns" != true ] && [ "$fsc" != bwrap ]; then
        line="$line · netos NÃO contidos (pode sobrar processo após o teste)"
    fi

    if [ "$fsc" = bwrap ]; then
        line="$line · escrita confinada OK (bubblewrap)"
    elif [ "$docker" = true ]; then
        line="$line · escrita confinada NÃO (rode com --docker para confinar)"
    else
        line="$line · escrita confinada NÃO (instale bubblewrap ou use --docker)"
    fi

    printf '%s\n' "$line"
    return 0
}

# ---------------------------------------------------------------------------
# sm_sandbox_run <challenge_dir> [opções] -- <argv…>
# ---------------------------------------------------------------------------
# Monta a pilha canônica de fora para dentro, sondando cada camada antes de entrar e pulando a
# que faltar. stdout/stderr são os do comando; o exit code BRUTO é preservado
# (verificado: `exit 101` sai 101).
#
# Opções (opcionais, antes do `--`), cada uma com env equivalente:
#   --wall N      SM_SANDBOX_WALL      relógio em segundos (default 30)
#   --cpu N       SM_SANDBOX_CPU       RLIMIT_CPU em segundos (default wall+5)
#   --mem V       SM_SANDBOX_MEM       MemoryMax do cgroup (default 512M)
#   --fsize N     SM_SANDBOX_FSIZE     RLIMIT_FSIZE em blocos de 1024 B (default 65536 = 64 MB)
#   --tasks N     SM_SANDBOX_TASKS     TasksMax do cgroup (default 512 — ver a nota abaixo)
#   --phase P     SM_SANDBOX_PHASE     test (default, SEM rede) | prepare (COM rede)
#   --language L  SM_SANDBOX_LANGUAGE  enum §4.1; decide se `ulimit -v` pode entrar
#   --mode M      SM_SANDBOX_MODE      posix_floor (default) | docker_strict | none
#   --image I     SM_SANDBOX_IMAGE     imagem do modo docker_strict
# SM_SANDBOX_CONSENT=1 é exigido para rodar sem relógio ou com --mode none.
# SM_SANDBOX_BIND_RO="a:b" acrescenta binds read-only dentro do bwrap.
#
# Códigos próprios: 2 uso incorreto · 66 não foi possível montar a sandbox (infra).
# Depois da execução ficam definidos: SM_SANDBOX_LAST_EXIT, SM_SANDBOX_LAST_ELAPSED (segundos com
# 3 casas), SM_SANDBOX_LAST_WALL, SM_SANDBOX_LAST_OOM (0|1|unknown), SM_SANDBOX_LAST_LAYERS,
# SM_SANDBOX_LAST_TIMEOUT_SOURCE, SM_SANDBOX_LAST_MODE.
sm_sandbox_run() {
    local dir wall cpu mem fsize tasks phase lang mode image
    if [ $# -lt 1 ]; then
        sm_sandbox__log error "sm_sandbox_run: uso: sm_sandbox_run <challenge_dir> [opções] -- <argv…>"
        return 2
    fi
    dir="$1"; shift

    wall="${SM_SANDBOX_WALL:-30}";   cpu="${SM_SANDBOX_CPU:-}"
    mem="${SM_SANDBOX_MEM:-512M}";   fsize="${SM_SANDBOX_FSIZE:-65536}"
    tasks="${SM_SANDBOX_TASKS:-512}"; phase="${SM_SANDBOX_PHASE:-test}"
    lang="${SM_SANDBOX_LANGUAGE:-}"; mode="${SM_SANDBOX_MODE:-posix_floor}"
    image="${SM_SANDBOX_IMAGE:-}"

    while [ $# -gt 0 ]; do
        case "$1" in
            --) shift; break ;;
            --wall)     wall="${2:-}";  shift 2 ;;
            --cpu)      cpu="${2:-}";   shift 2 ;;
            --mem)      mem="${2:-}";   shift 2 ;;
            --fsize)    fsize="${2:-}"; shift 2 ;;
            --tasks)    tasks="${2:-}"; shift 2 ;;
            --phase)    phase="${2:-}"; shift 2 ;;
            --language) lang="${2:-}";  shift 2 ;;
            --mode)     mode="${2:-}";  shift 2 ;;
            --image)    image="${2:-}"; shift 2 ;;
            *) sm_sandbox__log error "sm_sandbox_run: opção desconhecida: $1"; return 2 ;;
        esac
    done
    if [ $# -lt 1 ]; then
        sm_sandbox__log error "sm_sandbox_run: nenhum comando após --"
        return 2
    fi
    case "$phase" in test|prepare) ;; *)
        sm_sandbox__log error "sm_sandbox_run: --phase inválida: $phase"; return 2 ;; esac
    case "$mode" in posix_floor|docker_strict|none) ;; *)
        sm_sandbox__log error "sm_sandbox_run: --mode inválido: $mode"; return 2 ;; esac

    SM_SANDBOX_LAST_EXIT=66; SM_SANDBOX_LAST_ELAPSED="0.000"; SM_SANDBOX_LAST_WALL="$wall"
    SM_SANDBOX_LAST_OOM=unknown; SM_SANDBOX_LAST_LAYERS=""; SM_SANDBOX_LAST_MODE="$mode"
    SM_SANDBOX_LAST_TIMEOUT_SOURCE=none

    if [ ! -d "$dir" ]; then
        sm_sandbox__log error "sm_sandbox_run: diretório do desafio não existe: $dir"
        return 66
    fi
    if [ -z "$cpu" ]; then cpu=$(( wall + 5 )); fi
    local abs; abs="$(cd "$dir" 2>/dev/null && pwd -P)" || abs=""
    if [ -z "$abs" ]; then
        sm_sandbox__log error "sm_sandbox_run: não consegui entrar em $dir"
        return 66
    fi
    dir="$abs"

    local t_src memcg pidns netns fsc dockerok bstyle map
    t_src="$(sm_sandbox__cap timeout)";  memcg="$(sm_sandbox__cap memcg)"
    pidns="$(sm_sandbox__cap pidns)";    netns="$(sm_sandbox__cap netns)"
    fsc="$(sm_sandbox__cap fs_confine)"; dockerok="$(sm_sandbox__cap docker)"
    bstyle="$(sm_sandbox__cap bwrap_bind_style)"; map="$(sm_sandbox__cap unshare_map)"
    if [ -z "$map" ] || [ "$map" = none ]; then map="-c"; fi
    SM_SANDBOX_LAST_TIMEOUT_SOURCE="$t_src"

    local -a cmd=() layers=()

    # ---- camada 1: relógio (G1) — SEMPRE a mais externa -----------------------
    case "$t_src" in
        coreutils_timeout)  cmd+=(timeout -s KILL -k 5 "$wall");  layers+=(timeout) ;;
        coreutils_gtimeout) cmd+=(gtimeout -s KILL -k 5 "$wall"); layers+=(gtimeout) ;;
        perl_alarm)
            cmd+=(perl -e 'alarm shift; exec @ARGV' "$wall"); layers+=(perl_alarm)
            sm_sandbox__log warn "sandbox: sem coreutils timeout — usando perl alarm (SIGALRM, exit 142, sem período de graça)" ;;
        *)
            if [ "${SM_SANDBOX_CONSENT:-0}" != 1 ]; then
                sm_sandbox__log error "sandbox: nenhum mecanismo de relógio (timeout, gtimeout, perl). Rodar assim exige confirmação explícita do aluno: SM_SANDBOX_CONSENT=1. Se travar, interrompa com Ctrl-C."
                return 66
            fi
            sm_sandbox__log warn "sandbox: SEM limite de relógio (consentido). Resta só ulimit -t = ${cpu}s, que não mata processo dormindo." ;;
    esac

    # ---- modo docker_strict: pilha inteiramente diferente (docs/11 §2.5) ------
    if [ "$mode" = docker_strict ]; then
        if [ "$dockerok" != true ] || [ -z "$image" ]; then
            sm_sandbox__log error "sandbox: --mode docker_strict exige docker utilizável e --image <imagem>"
            return 66
        fi
        cmd+=(docker run --rm)
        if [ "$phase" = test ]; then cmd+=(--network none); fi
        cmd+=(--read-only --memory "$mem" --memory-swap "$mem" --pids-limit "$tasks" --cpus 1
              --cap-drop ALL --security-opt no-new-privileges
              --user "$(id -u):$(id -g)"
              -v "$dir:/work:rw" --tmpfs "/tmp:rw,size=64m" -w /work "$image")
        layers+=(docker)
        SM_SANDBOX_LAST_LAYERS="$(IFS=,; printf '%s' "${layers[*]}")"
        sm_sandbox__run_and_time "$wall" "" "${cmd[@]}" "$@"
        return $?
    fi

    # ---- modo none: piso absoluto, só com consentimento registrado ------------
    if [ "$mode" = none ]; then
        if [ "${SM_SANDBOX_CONSENT:-0}" != 1 ]; then
            sm_sandbox__log error "sandbox: --mode none exige consentimento registrado (SM_SANDBOX_CONSENT=1)"
            return 66
        fi
        sm_sandbox__log warn "sandbox: modo none — NENHUM isolamento além do relógio."
        cmd+=(bash -c 'cd "$1" || exit 66; shift; exec "$@"' _ "$dir")
        layers+=(none)
        SM_SANDBOX_LAST_LAYERS="$(IFS=,; printf '%s' "${layers[*]}")"
        sm_sandbox__run_and_time "$wall" "" "${cmd[@]}" "$@"
        return $?
    fi

    # ---- camada 2: cgroup (G7/G8) --------------------------------------------
    local statefile="" need_wrap=0 killgrp=0 readcg=0
    if [ "$memcg" = true ]; then
        cmd+=(systemd-run --user --scope -q
              -p MemoryMax="$mem" -p MemorySwapMax=0 -p TasksMax="$tasks")
        # Sem isto o systemd para o escopo no OOM e a evidência (memory.events) some — ver a nota
        # em sm_sandbox__probe_oompolicy.
        if [ "$(sm_sandbox__cap oom_policy)" = continue ]; then
            cmd+=(-p OOMPolicy=continue)
            layers+=(memcg oompolicy)
        else
            layers+=(memcg)
            sm_sandbox__log warn "sandbox: systemd sem OOMPolicy (anterior a 243): num estouro de memória o escopo é parado e o veredito cai para a heurística do SIGTERM."
        fi
        need_wrap=1; readcg=1
    else
        sm_sandbox__log warn "sandbox: sem systemd-run --user (cgroup): sem limite de RSS e sem TasksMax."
    fi
    # Sem PID namespace (e sem bwrap, que traz o seu), o wrapper mata o grupo de processos — é o
    # G3 degradado: cobre o caso comum, não cobre o neto que fez setsid.
    if [ "$pidns" != true ] && [ "$fsc" != bwrap ]; then need_wrap=1; killgrp=1; fi

    if [ "$need_wrap" -eq 1 ]; then
        statefile="$(mktemp "${TMPDIR:-/tmp}/sm-sandbox.XXXXXX" 2>/dev/null)" || statefile=""
        if [ -n "$statefile" ]; then
            cmd+=(bash -c "$(sm_sandbox__wrapper_snippet)" _ "$statefile" "$killgrp" "$readcg")
            layers+=(wrapper)
        else
            sm_sandbox__log warn "sandbox: não consegui criar arquivo temporário — sem desambiguação de OOM."
        fi
    fi

    # ---- camada 3: isolamento (G3/G4/G6) -------------------------------------
    local cddir="$dir"
    if [ "$fsc" = bwrap ]; then
        sm_sandbox__bwrap_args "$dir" "$bstyle" "$phase" "$1"
        cmd+=("${SM_SANDBOX_BWRAP_ARGS[@]}")
        cddir=/work
        layers+=(bwrap fsconfine)
        if [ "$phase" = test ]; then layers+=(netns); fi
    elif [ "$pidns" = true ] || [ "$netns" = true ]; then
        cmd+=(unshare --user)
        if [ "$netns" = true ] && [ "$phase" = test ]; then cmd+=(--net); layers+=(netns); fi
        if [ "$pidns" = true ]; then cmd+=(--pid --fork); layers+=(pidns); fi
        cmd+=("$map" --)
        sm_sandbox__log debug "sandbox: unshare não é mount namespace — G6 (escrita) fica sem cobertura."
    else
        sm_sandbox__log warn "sandbox: sem user namespaces e sem bubblewrap — sem isolamento de rede nem de escrita."
    fi

    # ---- camada 4: shell interno — ulimit + cd + exec ------------------------
    local vlimit="-"
    if [ "$memcg" != true ] && [ "$(uname -s 2>/dev/null)" = Linux ]; then
        case "$lang" in
            c|cpp|python|go)
                vlimit="$(sm_sandbox__mem_kb "$mem")"
                sm_sandbox__log warn "sandbox: sem cgroup — caindo para ulimit -v ${vlimit} KB (permitido só em C/C++/Python/Go)" ;;
            "")
                sm_sandbox__log warn "sandbox: sem cgroup e sem --language: NÃO aplico ulimit -v (quebraria Node/JVM). Sem limite de memória." ;;
            *)
                sm_sandbox__log warn "sandbox: sem cgroup e linguagem '$lang' pode ter JIT — ulimit -v proibido (Node 24 falha com 1G; JVM 17 com 2G). Sem limite de memória." ;;
        esac
    fi

    local -a netenv=()
    if [ "$phase" = test ] && [ "$netns" != true ] && [ "$fsc" != bwrap ]; then
        netenv=(env http_proxy=http://127.0.0.1:1 https_proxy=http://127.0.0.1:1
                all_proxy=http://127.0.0.1:1 HTTP_PROXY=http://127.0.0.1:1
                HTTPS_PROXY=http://127.0.0.1:1 ALL_PROXY=http://127.0.0.1:1 no_proxy=)
        layers+=(proxy_only)
        sm_sandbox__log warn "sandbox: sem isolamento de rede — só variáveis de proxy inválidas. Lombada, não muro: não impede socket bruto nem runtime que ignore as variáveis."
    fi

    cmd+=(bash -c '
ulimit -t "$1" 2>/dev/null
ulimit -f "$2" 2>/dev/null
[ "$3" = "-" ] || ulimit -v "$3" 2>/dev/null
cd "$4" || exit 66
shift 4
exec "$@"' _ "$cpu" "$fsize" "$vlimit" "$cddir")
    layers+=(ulimit_t ulimit_f cd)

    SM_SANDBOX_LAST_LAYERS="$(IFS=,; printf '%s' "${layers[*]}")"
    sm_sandbox__run_and_time "$wall" "$statefile" \
        "${cmd[@]}" ${netenv[@]+"${netenv[@]}"} "$@"
    return $?
}

# Converte 512M / 1G / 268435456 em KB, que é a unidade do `ulimit -v`.
sm_sandbox__mem_kb() {
    local v="${1:-512M}" n u
    n="${v%[KkMmGg]}"; u="${v#"$n"}"
    case "$u" in
        K|k) printf '%s\n' "$n" ;;
        M|m) printf '%s\n' "$(( n * 1024 ))" ;;
        G|g) printf '%s\n' "$(( n * 1024 * 1024 ))" ;;
        *)   printf '%s\n' "$(( n / 1024 ))" ;;
    esac
    return 0
}

# Wrapper que roda DENTRO do escopo do cgroup e FORA dos namespaces. Faz duas coisas que nenhuma
# outra camada consegue: (1) lê memory.events do próprio cgroup depois que o comando morreu — é o
# que desambigua o 137 por OOM; (2) mata o grupo de processos quando não há PID namespace.
# Preserva stdin (fd 8) e o exit code bruto. O `wait` tem stderr silenciado só para suprimir a
# mensagem "Morto"/"Killed" que o bash imprime ao reapear um filho morto por sinal.
sm_sandbox__wrapper_snippet() {
    # ATENÇÃO: nenhuma chave ${…} pode aparecer aqui dentro. Este texto viaja como argumento de
    # `systemd-run`, e o systemd expande ${VAR} na linha de comando ANTES de executar — verificado:
    # com ${__cg} no snippet, o systemd avisava "Referenced but unset environment variable
    # evaluates to an empty string: __cg" e apagava o trecho, matando a detecção de OOM em
    # silêncio. Só $VAR sem chaves sobrevive.
    cat <<'SNIP'
__sf=$1; __killgrp=$2; __readcg=$3; shift 3
__cg=
if [ "$__killgrp" = 1 ]; then set -m; fi
exec 8<&0
"$@" <&8 &
__p=$!
{ wait "$__p"; } 2>/dev/null
__r=$?
if [ "$__killgrp" = 1 ]; then kill -- -"$__p" 2>/dev/null || true; fi
if [ "$__readcg" = 1 ]; then
  __cg=$(cut -d: -f3 /proc/self/cgroup 2>/dev/null | head -n1)
  __ev=/sys/fs/cgroup$__cg/memory.events
  if [ -n "$__cg" ] && [ -r "$__ev" ]; then
    while read -r __k __v; do
      if [ "$__k" = oom_kill ]; then printf 'oom_kill=%s\n' "$__v" >> "$__sf"; fi
    done < "$__ev"
  fi
fi
exit $__r
SNIP
    return 0
}

# Monta os argumentos do bwrap no array global SM_SANDBOX_BWRAP_ARGS.
# $1 challenge_dir · $2 estilo (symlink|bind) · $3 fase · $4 argv[0] do comando
#
# ⭐ Decisão que sustenta G6: NADA é montado sob /home. Toolchain e cache que moram no $HOME do
# aluno (node em ~/.local/bin, cargo em ~/.cargo, módulos do Go em ~/go/pkg/mod) são REMAPEADOS
# para /sm/… e a variável de ambiente correspondente é reapontada. Montar em
# "$HOME/.cargo" pareceria mais simples, mas faz o bwrap CRIAR /home/<aluno> dentro do sandbox —
# e esse diretório criado é gravável. VERIFICADO: com os binds no caminho original, um programa
# escreveu em "$HOME/arquivo" sem erro (num diretório efêmero, invisível para o host); a garantia
# continuava valendo para o host, mas a mensagem que o aluno via era a errada. Com o remapeamento,
# /home não existe dentro do sandbox e a tentativa falha com FileNotFoundError, que é a verdade.
sm_sandbox__bwrap_args() {
    local dir="$1" style="$2" phase="$3" argv0="${4:-}" bin extra
    # /sm e não /opt/study-method: /opt é montado read-only logo abaixo (pode ter toolchain), e o
    # bwrap não consegue criar diretório dentro de um bind read-only.
    local root=/sm
    local path=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin
    SM_SANDBOX_BWRAP_ARGS=(bwrap --die-with-parent --unshare-all)
    if [ "$phase" = prepare ]; then SM_SANDBOX_BWRAP_ARGS+=(--share-net); fi
    SM_SANDBOX_BWRAP_ARGS+=(--ro-bind /usr /usr)
    if [ "$style" = symlink ]; then
        SM_SANDBOX_BWRAP_ARGS+=(--symlink usr/bin /bin --symlink usr/sbin /sbin
                                --symlink usr/lib /lib --symlink usr/lib64 /lib64)
    else
        SM_SANDBOX_BWRAP_ARGS+=(--ro-bind-try /bin /bin --ro-bind-try /sbin /sbin
                                --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64)
    fi
    SM_SANDBOX_BWRAP_ARGS+=(--ro-bind-try /etc /etc --ro-bind-try /opt /opt
                            --proc /proc --dev /dev --tmpfs /tmp
                            --setenv HOME /tmp --setenv XDG_CACHE_HOME /tmp/.cache
                            --setenv TMPDIR /tmp)

    # Toolchain fora de /usr desaparece dentro do bwrap. Monta o diretório do binário em
    # $root/bin e põe na frente do PATH.
    if [ -n "$argv0" ]; then
        bin="$(command -v "$argv0" 2>/dev/null || true)"
        if [ -n "$bin" ]; then
            bin="$(cd "$(dirname "$bin")" 2>/dev/null && pwd -P)" || bin=""
            case "$bin" in
                /usr/*|/bin|/sbin|"") ;;
                *) SM_SANDBOX_BWRAP_ARGS+=(--ro-bind-try "$bin" "$root/bin")
                   path="$root/bin:$path" ;;
            esac
        fi
    fi
    # Caches de toolchain read-only, remapeados para fora de /home, com a variável reapontada —
    # sem isso cargo/go procurariam em /tmp/.cargo e, sem rede, falhariam.
    if [ -d "$HOME/.cargo" ]; then
        SM_SANDBOX_BWRAP_ARGS+=(--ro-bind "$HOME/.cargo" "$root/cargo" --setenv CARGO_HOME "$root/cargo")
        path="$root/cargo/bin:$path"
    fi
    if [ -d "$HOME/.rustup" ]; then
        SM_SANDBOX_BWRAP_ARGS+=(--ro-bind "$HOME/.rustup" "$root/rustup" --setenv RUSTUP_HOME "$root/rustup")
    fi
    if [ -d "$HOME/go/pkg/mod" ]; then
        SM_SANDBOX_BWRAP_ARGS+=(--ro-bind "$HOME/go/pkg/mod" "$root/gomodcache" --setenv GOMODCACHE "$root/gomodcache")
    fi
    if [ -d "$HOME/.npm" ]; then
        SM_SANDBOX_BWRAP_ARGS+=(--ro-bind "$HOME/.npm" "$root/npm" --setenv npm_config_cache "$root/npm")
    fi
    # Caminhos extras pedidos pelo chamador entram no lugar original: é escolha explícita dele.
    if [ -n "${SM_SANDBOX_BIND_RO:-}" ]; then
        local IFS=:
        for extra in $SM_SANDBOX_BIND_RO; do
            if [ -n "$extra" ]; then SM_SANDBOX_BWRAP_ARGS+=(--ro-bind-try "$extra" "$extra"); fi
        done
        unset IFS
    fi
    SM_SANDBOX_BWRAP_ARGS+=(--setenv PATH "$path" --bind "$dir" /work --chdir /work --)
    return 0
}

# Executa, cronometra e publica os SM_SANDBOX_LAST_*. Não toca em stdout/stderr do comando.
sm_sandbox__run_and_time() {
    local wall="$1" statefile="$2"; shift 2
    local t0 t1 rc ms v fd p oom=unknown
    t0="$(sm_sandbox__now_ms)"
    # Roda em background e espera com o stderr do `wait` silenciado: é a única forma de suprimir a
    # linha "Morto"/"Killed" que o bash imprime ao reapear um filho morto por sinal — e o `timeout
    # -s KILL` morre do próprio sinal para reportá-lo. O fd duplicado preserva o stdin do comando,
    # que um job em background perderia para /dev/null.
    exec {fd}<&0
    "$@" <&"$fd" &
    p=$!
    { wait "$p"; } 2>/dev/null
    rc=$?
    exec {fd}<&-
    t1="$(sm_sandbox__now_ms)"
    ms=$(( t1 - t0 ))
    if [ "$ms" -lt 0 ]; then ms=0; fi
    SM_SANDBOX_LAST_ELAPSED="$(( ms / 1000 )).$(printf '%03d' "$(( ms % 1000 ))")"
    SM_SANDBOX_LAST_EXIT="$rc"
    SM_SANDBOX_LAST_WALL="$wall"
    if [ -n "$statefile" ] && [ -r "$statefile" ]; then
        v="$(sed -n 's/^oom_kill=//p' "$statefile" 2>/dev/null | tail -n1)"
        if [ -n "$v" ]; then
            if [ "$v" -gt 0 ] 2>/dev/null; then oom=1; else oom=0; fi
        fi
        rm -f "$statefile" 2>/dev/null || true
    fi
    SM_SANDBOX_LAST_OOM="$oom"
    return "$rc"
}

# ---------------------------------------------------------------------------
# sm_sandbox_classify_exit <code> <elapsed> <wall> [<oom_kill>]
# ---------------------------------------------------------------------------
# stdout: passed | failed | timeout | oom | cpu | infra. Exit 0 sempre.
# <elapsed> e <wall> em segundos (aceitam decimal). <oom_kill> default SM_SANDBOX_LAST_OOM.
#
# A regra de ouro: o veredito `timeout` sai da comparação de TEMPO DECORRIDO, jamais de um exit
# code — 124 nunca chega na pilha canônica (que usa -s KILL) e 137 é ambíguo (timeout, OOM do
# cgroup ou RLIMIT_CPU). A comparação de tempo arbitra entre os códigos de MORTE POR LIMITE
# (124/137/142/152); um processo que saiu normalmente (1, 2, 101, 134…) falhou o teste, por mais
# devagar que tenha sido — 134 é SIGABRT de assert em C, e não pode virar timeout por acidente.
#
# Desambiguação do 137, na ordem de docs/11 §2.3:
#   1. tempo_decorrido >= wall            -> timeout
#   2. memory.events.oom_kill > 0         -> oom
#   3. senão                              -> cpu
# O 143 (SIGTERM) entra na mesma família por um motivo verificado: num systemd sem
# OOMPolicy=continue, o estouro do cgroup faz o systemd PARAR o escopo, o comando sai 143 e o
# memory.events some antes de ser lido. Aí o 143 com cgroup ativo é lido como estouro de memória.
sm_sandbox_classify_exit() {
    local code="${1:-1}" elapsed="${2:-0}" wall="${3:-0}"
    local oom="${4:-${SM_SANDBOX_LAST_OOM:-unknown}}"
    local e_ms w_ms

    case "$code" in
        0)  printf 'passed\n'; return 0 ;;
        66) printf 'infra\n';  return 0 ;;
    esac

    case "$code" in
        124|137|142|152|143)
            e_ms="$(sm_sandbox__to_ms "$elapsed")"
            w_ms="$(sm_sandbox__to_ms "$wall")"
            if [ "$w_ms" -gt 0 ] && [ "$(( e_ms + 50 ))" -ge "$w_ms" ]; then
                printf 'timeout\n'; return 0
            fi
            case "$code" in
                124)
                    sm_sandbox__log warn "sandbox: exit 124 — a pilha foi montada sem -s KILL. Trate como timeout e corrija a composição."
                    printf 'timeout\n'; return 0 ;;
                142)
                    printf 'timeout\n'; return 0 ;;
            esac
            if [ "$oom" = 1 ]; then printf 'oom\n'; return 0; fi
            if [ "$code" = 143 ]; then
                # SIGTERM dentro da pilha canônica não vem do aluno: vem do systemd parando o
                # escopo depois de um OOM que ele observou — comportamento de systemd sem
                # OOMPolicy=continue, caminho em que memory.events já foi destruído.
                if [ "$(sm_sandbox__cap oom_policy)" != continue ] \
                   && [ "$(sm_sandbox__cap memcg)" = true ]; then
                    sm_sandbox__log warn "sandbox: exit 143 (SIGTERM) com cgroup e sem OOMPolicy=continue — tratando como estouro de memória."
                    printf 'oom\n'; return 0
                fi
                printf 'failed\n'; return 0
            fi
            printf 'cpu\n'; return 0 ;;
        153)
            sm_sandbox__log warn "sandbox: exit 153 (SIGXFSZ) — o programa passou do limite de tamanho de arquivo (ulimit -f)."
            printf 'failed\n'; return 0 ;;
    esac

    printf 'failed\n'
    return 0
}
