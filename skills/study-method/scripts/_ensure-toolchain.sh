#!/usr/bin/env bash
# _ensure-toolchain.sh — PROVA por execução que a toolchain está pronta e, em --ensure, instala.
#
# Motor do passo `preparar_ambiente` da autoria de cursos (skill trilha-author): para CADA
# curso publicado (c-iniciante, python-iniciante, rust-iniciante) o veredito sai de EXECUÇÃO
# — a árvore mínima de desafio (languages.md §3.2) rodando as provas de prontidão da §3.1 —
# nunca de leitura de versão. É EXTENSÃO do formato de saída de detect-toolchains.sh (que só
# detecta; este prova e, em --ensure, instala pela receita da distro detectada até a prova
# passar).
#
# Contrato de interface:
#   --check               só detecta e prova; NUNCA instala; offline (modo default)
#   --ensure              se a prova falhar, instala pela receita da distro e RE-PROVA
#   --self-test           monta fixtures em $(mktemp -d), exercita provas e o contrato de
#                         exit/JSON SEM instalar nada; limpa ao sair
#   --language <l>        enum FECHADO deste auxiliar: python rust c (fora dele: exit 2 —
#                         é mais estreito que o enum de detect-toolchains.sh, de propósito:
#                         são as linguagens dos cursos publicados)
#   --json                aceito e explícito; a saída já é JSON sempre (stdout puro;
#                         progresso e resumo humanos vão para stderr)
#   Sem --language: cobre as 3 linguagens + o bloco harness. Com --language: só ela +
#   o bloco harness (node+npm+jq — pré-requisito dos gates em qualquer trilha).
#
# Garantia CRUZADA (hosts da engine — app/electron/main/engine/lang/rust.ts:9 e c.ts:11-12):
#   --ensure --language rust garante TAMBÉM node (host do parser WASM do tree-sitter);
#   --ensure --language c   garante TAMBÉM python3 (host do extrator) e clang — o PARSE de C
#   exige clang (-ast-dump=json é extensão do clang; o gcc NÃO serve pro parse — c.ts:27-31);
#   o gcc cobre só o RUNNER. O bloco harness (node+npm+jq) é reportado SEMPRE — e o --ensure
#   o garante em TODO escopo, com ou sem --language, qualquer linguagem: node+npm sobem a
#   CLI dos gates (via tsx) e o jq parseia o JSON da engine, em qualquer trilha. No --check,
#   o harness ausente entra em ensure.missing (rótulos node/jq) com aviso acionável no
#   stderr e NÃO derruba o exit — a prova das linguagens pedidas decide o veredito.
#
# Exit codes (docs/00-contratos.md §5.1 — só 0/1/2):
#   0  todas as linguagens pedidas PROVADAS (e, em --ensure, instaladas quando faltaram)
#   1  faltando / falha de prova / falha de instalação / sem privilégio — o JSON distingue
#      missing × install_failed × no_privilege no bloco ensure
#   2  uso incorreto
#
# Semântica do bloco ensure do JSON: missing = componentes que não passaram na prova e
# dispararam instalação (ou, em --check, os que faltariam); installed = blocos efetivamente
# instalados; failed = entradas {label, reason, detail} dos blocos que não conseguiram;
# skipped = linguagens pedidas que já passaram na prova de primeira ("já provado").
#
# LIMITAÇÃO v1: este script NÃO lê STUDY_METHOD_CARGO_BIN (a engine honra — rust.ts:257-259):
# um --check pode dar falso negativo numa máquina que resolve cargo por esse env de override.
# O remédio operacional está citado na mensagem de falha do rust, em prosa.
#
# Cache: $STUDY_METHOD_HOME/toolchain-ensure.json — default
# ${XDG_DATA_HOME:-$HOME/.local/share}/study-method (as mesmas 2 variáveis de §4.4; nenhuma
# outra é lida). Escrita atômica (tmp no mesmo diretório + mv). O cache guarda o documento
# COMPLETO da máquina: gravado só quando --check/--ensure roda SEM --language — mesmo
# critério do detector (recortar por linguagem envenenaria leitura posterior).
#
# Autossuficiente: sem source em lib/ — roda antes de qualquer setup (mesmo motivo do
# detector: pode ser o primeiro script da autoria a rodar na máquina).
#
# bash 3.2 (macOS): sem declare -A, sem mapfile/readarray, sem nameref, sem expansão de
# caixa. Pertinência a listas por `case " $LISTA " in *" item "*)`.

set -euo pipefail

SM_SELF="_ensure-toolchain.sh"
SM_SELF_PATH="$0"
SM_SCHEMA_VERSION="1.0"

# Enum FECHADO deste auxiliar (docs/00-contratos.md §4.1, subconjunto dos cursos publicados).
SM_LANGS="python rust c"

# Estado global (evita nameref, que é bash 4.3+).
SM_MODE="check"
SM_MODE_TAKEN=""
SM_ONLY=""
SM_TMP=""
SM_PATH=""
SM_HOME=""
SM_FAMILY="none"
SM_MANAGER=""
SM_APT_UPDATED="0"
SM_INSTALL_RC="0"
SM_INSTALL_DESC=""
SM_INSTALL_ARGV=()

# Provas — estado por linguagem.
SM_PY_AVAIL="false"; SM_PY_VER=""; SM_PY_CMD=""; SM_PY_PATH=""
SM_PY_OK="false"; SM_PY_ARGV=""; SM_PY_EXIT=""; SM_PY_DETAIL=""
SM_RS_AVAIL="false"; SM_RS_VER=""; SM_RS_CMD=""; SM_RS_PATH=""
SM_RS_OK="false"; SM_RS_ARGV=""; SM_RS_EXIT=""; SM_RS_DETAIL=""
SM_C_AVAIL="false"; SM_C_VER=""; SM_C_CMD=""; SM_C_PATH=""
SM_C_OK="false"; SM_C_ARGV=""; SM_C_EXIT=""; SM_C_DETAIL=""
SM_C_STEP_BUILD="nao"; SM_C_STEP_CLANG="nao"; SM_C_STEP_PY="nao"
SM_NODE_FOUND="false"; SM_NODE_VER=""; SM_NODE_OK="false"
SM_NPM_FOUND="false"; SM_NPM_VER=""; SM_NPM_OK="false"
SM_JQ_FOUND="false"; SM_JQ_VER=""; SM_JQ_OK="false"
SM_ENS_SKIPPED=""
SM_DOC=""

sm_err() { printf '%s: %s\n' "$SM_SELF" "$*" >&2; }
sm_die() {
    local c="$1"
    shift
    printf 'study-method: erro %s: %s\n' "$c" "$*" >&2
    exit "$c"
}

sm_is_lang() { case " $SM_LANGS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

sm_home() {
    printf '%s' "${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}"
}

sm_now_iso() {
    date +%Y-%m-%dT%H:%M:%S%:z 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ
}

sm_json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\000-\037'
}

# Escrita atômica: tmp no mesmo diretório + mv (padrão de detect-toolchains.sh).
sm_atomic_write_file() {
    local dest="$1" tmp
    tmp="$dest.tmp.$$"
    if ! cat > "$tmp" 2>/dev/null; then rm -f "$tmp" 2>/dev/null || true; return 1; fi
    if ! mv -f "$tmp" "$dest" 2>/dev/null; then rm -f "$tmp" 2>/dev/null || true; return 1; fi
    return 0
}

sm_cleanup() {
    if [ -n "$SM_TMP" ]; then
        rm -rf "$SM_TMP" 2>/dev/null || true
    fi
}

# ---------------------------------------------------------------------------
# Execução com captura — SM_OUT recebe stdout+stderr, SM_RC o status.
# `timeout` com -s KILL quando existe: nenhuma prova pode travar o passo (§7 de languages.md).
# ---------------------------------------------------------------------------
sm_run() {
    local out
    set +e
    if command -v timeout >/dev/null 2>&1; then
        out="$(timeout -s KILL -k 2 120 "$@" 2>&1)"
    else
        out="$("$@" 2>&1)"
    fi
    SM_RC=$?
    set -e
    SM_OUT="$out"
}

# Igual a sm_run, mas dentro de <dir> (provas de compilação/runner).
sm_run_in() {
    local dir="$1"
    shift
    local out
    set +e
    if command -v timeout >/dev/null 2>&1; then
        out="$(cd "$dir" && timeout -s KILL -k 2 120 "$@" 2>&1)"
    else
        out="$(cd "$dir" && "$@" 2>&1)"
    fi
    SM_RC=$?
    set -e
    SM_OUT="$out"
}

sm_first_line() {
    printf '%s\n' "$1" | sed -e '/^[[:space:]]*$/d' | head -n1
}

sm_last_line() {
    printf '%s\n' "$1" | sed -e '/^[[:space:]]*$/d' | tail -n1
}

sm_snip() {
    # recorta o trecho de saída que vai para o detail do JSON. O corte é por BYTES
    # (head -c, tail -c, od e wc -c são byte-based em QUALQUER locale) com guard de
    # fronteira UTF-8: sob locale single-byte (LC_ALL=C) o corte antigo soltava
    # 0xC3 no meio de um carácter — JSON UTF-8 inválido (json.loads rejeita). O
    # guard examina os últimos 4 bytes e só recua quando a sequência final está
    # INCOMPLETA: lead solto no fim; ou lead + continuations em quantidade MENOR
    # que o comprimento que o lead exige (2/3/4). Sequência completa no fim fica.
    local s="$1" len hexs n tn tok lead exp c i drop
    s="$(printf '%s' "$s" | head -c 160)"
    len="$(printf '%s' "$s" | wc -c | tr -d ' ')"
    while [ "$len" -gt 0 ]; do
        hexs="$(printf '%s' "$s" | tail -c 4 | od -An -tx1 | tr '\n' ' ')"
        set -- $hexs
        n=$#
        eval "tn=\${$n}"
        drop=0
        case "$tn" in
            0*|1*|2*|3*|4*|5*|6*|7*)
                break ;;  # ASCII no fim — fronteira limpa
            [89ab]*)
                # continuations no fim: acha o lead que os abre e decide se a
                # sequência final está completa ou foi cortada
                c=1; i=$((n - 1))
                while [ "$i" -ge 1 ]; do
                    eval "tok=\${$i}"
                    case "$tok" in [89ab]*) c=$((c + 1)); i=$((i - 1)) ;; *) break ;; esac
                done
                drop="$c"
                if [ "$i" -ge 1 ]; then
                    eval "lead=\${$i}"
                    case "$lead" in
                        c[2-9a-f]|d*) exp=2 ;;
                        e*)           exp=3 ;;
                        f[0-4])       exp=4 ;;
                        *)            exp=0 ;;  # lead inválido (c0/c1/f5–ff) — não abre sequência
                    esac
                    if [ "$exp" -gt 0 ] && [ $((c + 1)) -ge "$exp" ]; then
                        break  # sequência completa no fim — fronteira limpa
                    fi
                    [ "$exp" -gt 0 ] && drop=$((c + 1))
                fi
                ;;
            [cdef]*)
                drop=1 ;;  # lead solto no fim — a sequência foi cortada antes de abrir
        esac
        [ "$drop" -gt 0 ] || break
        len=$((len - drop))
        s="$(printf '%s' "$s" | head -c "$len")"
    done
    printf '%s' "$s"
}

# Extração de versão — mesmas regras de detect-toolchains.sh, provadas contra a saída real.
sm_extract_version() {
    local lang="$1" raw="$2" first
    first="$(printf '%s\n' "$raw" | head -n1)"
    case "$lang" in
        python) printf '%s' "${first#Python }" ;;
        rust)   printf '%s' "$(printf '%s' "$first" | awk '{print $2}')" ;;
        c)      printf '%s' "$(printf '%s' "$first" | grep -oE '[0-9]+(\.[0-9]+)+' | head -n1)" ;;
        node)   printf '%s' "${first#v}" ;;
        npm)    printf '%s' "$first" ;;
        jq)     printf '%s' "${first#jq-}" ;;
        *)      printf '%s' "$first" ;;
    esac
}

# Comando de teste do desafio, por linguagem (languages.md §3.1) — informativo, para o
# chamador não ter que reabrir a referência. Mesmas strings do detector.
sm_test_command() {
    case "$1" in
        python) printf 'python3 -m unittest discover -s tests -p "test_*.py" -v' ;;
        rust)   printf 'cargo test' ;;
        c)      printf 'gcc -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner' ;;
        *)      : ;;
    esac
}

# ---------------------------------------------------------------------------
# Fixtures — a árvore mínima de desafio (languages.md §3.2), provada por execução.
# $1 = diretório, $2 = "ok" (prova deve passar) | "falha" (teste deve falhar — auto-teste).
# ---------------------------------------------------------------------------
sm_fixture_python() {
    mkdir -p "$1/tests"
    printf 'def soma(a, b):\n    return a + b\n' > "$1/stub.py"
    : > "$1/tests/__init__.py"
    if [ "$2" = "falha" ]; then
        cat > "$1/tests/test_stub.py" <<'SM_FX_PY'
import unittest
from stub import soma
class TestStub(unittest.TestCase):
    def test_soma(self):
        self.assertEqual(soma(1, 2), 4)
SM_FX_PY
    else
        cat > "$1/tests/test_stub.py" <<'SM_FX_PY'
import unittest
from stub import soma
class TestStub(unittest.TestCase):
    def test_soma(self):
        self.assertEqual(soma(1, 2), 3)
SM_FX_PY
    fi
    return 0
}

sm_fixture_rust() {
    mkdir -p "$1/src" "$1/tests"
    cat > "$1/Cargo.toml" <<'SM_FX_RS'
[package]
name = "stub"
version = "0.1.0"
edition = "2021"
SM_FX_RS
    printf 'pub fn soma(a: i32, b: i32) -> i32 {\n    a + b\n}\n' > "$1/src/lib.rs"
    if [ "$2" = "falha" ]; then
        cat > "$1/tests/test_stub.rs" <<'SM_FX_RS2'
#[test]
fn soma() {
    assert_eq!(stub::soma(1, 2), 4);
}
SM_FX_RS2
    else
        cat > "$1/tests/test_stub.rs" <<'SM_FX_RS2'
#[test]
fn soma() {
    assert_eq!(stub::soma(1, 2), 3);
}
SM_FX_RS2
    fi
    return 0
}

sm_fixture_c() {
    mkdir -p "$1/tests"
    printf 'int soma(int a, int b);\n' > "$1/stub.h"
    printf '#include "stub.h"\nint soma(int a, int b) {\n    return a + b;\n}\n' > "$1/stub.c"
    if [ "$2" = "falha" ]; then
        cat > "$1/tests/test_stub.c" <<'SM_FX_C'
#include <assert.h>
#include "../stub.h"
int main(void) {
    assert(soma(1, 2) == 4);
    return 0;
}
SM_FX_C
    else
        cat > "$1/tests/test_stub.c" <<'SM_FX_C'
#include <assert.h>
#include "../stub.h"
int main(void) {
    assert(soma(1, 2) == 3);
    return 0;
}
SM_FX_C
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Os comandos de prova, fatorados para o auto-teste reusar.
# ---------------------------------------------------------------------------

# A prova do python roda sob env scrubado — a mesma allowlist do filho da engine (§6 obs. 2):
# só PATH/HOME/locales/determinismo. -B e PYTHONDONTWRITEBYTECODE são cinto e suspensório.
sm_run_python_proof() {
    sm_run_in "$1" env -i "PATH=$SM_PATH" "HOME=$SM_HOME" LC_ALL=C.UTF-8 TZ=UTC \
        PYTHONHASHSEED=0 PYTHONDONTWRITEBYTECODE=1 \
        "$2" -B -m unittest discover -s tests -t . -p "test_*.py" -v
}

# A prova do rust com as variáveis fixas da engine (rust.ts, política de env).
sm_run_rust_proof() {
    sm_run_in "$1" env CARGO_NET_OFFLINE=true CARGO_INCREMENTAL=0 CARGO_TERM_COLOR=never \
        RUST_BACKTRACE=0 cargo test --offline
}

# ---------------------------------------------------------------------------
# Provas por linguagem. Cada uma preenche o seu bloco de estado e NUNCA instala.
# proof.exit_code = status do último passo executado (null quando nenhum executou).
# ---------------------------------------------------------------------------
sm_proof_python() {
    SM_PY_AVAIL="false"; SM_PY_VER=""; SM_PY_CMD=""; SM_PY_PATH=""
    SM_PY_OK="false"; SM_PY_ARGV=""; SM_PY_EXIT=""; SM_PY_DETAIL=""
    local cand wpath winner=""
    for cand in python3 python; do
        wpath="$(command -v "$cand" 2>/dev/null || true)"
        if [ -n "$wpath" ]; then
            winner="$cand"
            break
        fi
    done
    if [ -z "$winner" ]; then
        SM_PY_DETAIL="nenhum python3/python no PATH — o parse e o runner de python não rodam; instale pela receita da família da distro (--ensure instala)"
        return 0
    fi
    SM_PY_AVAIL="true"; SM_PY_CMD="$winner"; SM_PY_PATH="$wpath"
    sm_run "$winner" --version
    if [ "$SM_RC" -eq 0 ]; then
        SM_PY_VER="$(sm_extract_version python "$SM_OUT")"
    fi
    if [ -z "$SM_PY_VER" ]; then
        SM_PY_VER="desconhecida"
    fi
    local fx="$SM_TMP/fx-python"
    sm_fixture_python "$fx" ok
    # O argv do JSON registra a FORMA do comando (PATH/HOME reais não vão para o relatório).
    SM_PY_ARGV="env -i PATH=<PATH> HOME=<HOME> LC_ALL=C.UTF-8 TZ=UTC PYTHONHASHSEED=0 PYTHONDONTWRITEBYTECODE=1 $winner -B -m unittest discover -s tests -t . -p test_*.py -v"
    sm_run_python_proof "$fx" "$winner"
    SM_PY_EXIT="$SM_RC"
    if [ "$SM_RC" -ne 0 ]; then
        SM_PY_DETAIL="a prova saiu com o status $SM_RC e não provou teste executado (o unittest com zero testes sai com o status 5 — docs/00 §5.3); última linha: $(sm_snip "$(sm_last_line "$SM_OUT")")"
        return 0
    fi
    local ran
    ran="$(printf '%s\n' "$SM_OUT" | grep -oE 'Ran [1-9][0-9]* tests?' | head -n1 | grep -oE '[0-9]+' || true)"
    if [ -z "$ran" ]; then
        SM_PY_DETAIL="a prova saiu limpa mas sem 'Ran N tests' com N >= 1 — nada rodou, e exit limpo sem teste é o falso positivo central (languages.md §1.2)"
        return 0
    fi
    SM_PY_OK="true"
    SM_PY_DETAIL="unittest provou sob env scrubado: $ran teste(s) rodou e passou"
    return 0
}

sm_proof_rust() {
    SM_RS_AVAIL="false"; SM_RS_VER=""; SM_RS_CMD=""; SM_RS_PATH=""
    SM_RS_OK="false"; SM_RS_ARGV=""; SM_RS_EXIT=""; SM_RS_DETAIL=""
    local wpath
    wpath="$(command -v cargo 2>/dev/null || true)"
    if [ -z "$wpath" ]; then
        SM_RS_DETAIL="nenhum cargo no PATH — nenhum desafio rust roda; instale pela receita da família da distro (--ensure instala)"
        return 0
    fi
    SM_RS_AVAIL="true"; SM_RS_CMD="cargo"; SM_RS_PATH="$wpath"
    # nível 1 — a sonda de versão
    sm_run cargo --version
    if [ "$SM_RC" -eq 0 ]; then
        SM_RS_VER="$(sm_extract_version rust "$SM_OUT")"
    fi
    if [ -z "$SM_RS_VER" ]; then
        SM_RS_VER="desconhecida"
    fi
    # nível 2 — prova da ENGINE (réplica de rust.ts:195-234): resolve o cargo REAL pelo
    # sysroot e o testa sob env scrubado, SEM RUSTUP_HOME/CARGO_HOME — é o que pega um
    # proxy rustup morto, a degradação medida que reprova gates inteiros por ambiente.
    local rustc_dir="${wpath%/*}" sysroot="" cargo_real=""
    sm_run "$rustc_dir/rustc" --print sysroot
    if [ "$SM_RC" -ne 0 ]; then
        sm_run rustc --print sysroot
    fi
    if [ "$SM_RC" -eq 0 ]; then
        sysroot="$(printf '%s\n' "$SM_OUT" | head -n1 | sed -e 's/[[:space:]]*$//')"
    fi
    if [ -z "$sysroot" ] || [ ! -d "$sysroot" ]; then
        SM_RS_EXIT="$SM_RC"
        SM_RS_DETAIL="cargo responde a --version mas rustc não resolveu o sysroot — o par (cargo, rustc) REAL não foi encontrado e o filho da engine morre em 'rustup could not choose a version' (rust.ts:195-234). Remédio operacional: apontar o cargo REAL da toolchain pelo env de override da engine (STUDY_METHOD_CARGO_BIN) — este auxiliar v1 não lê esse env, então o veredito aqui é de falha honesta"
        return 0
    fi
    cargo_real="$sysroot/bin/cargo"
    if [ ! -x "$cargo_real" ]; then
        SM_RS_EXIT="$SM_RC"
        SM_RS_DETAIL="sysroot resolvido ($sysroot) mas sem bin/cargo dentro — instalação rust incompleta"
        return 0
    fi
    sm_run env -i "PATH=$SM_PATH" "HOME=$SM_HOME" LC_ALL=C.UTF-8 TZ=UTC "$cargo_real" --version
    if [ "$SM_RC" -ne 0 ]; then
        SM_RS_EXIT="$SM_RC"
        SM_RS_DETAIL="o cargo REAL de <sysroot>/bin não respondeu sob o ambiente scrubado (sem RUSTUP_HOME/CARGO_HOME) — proxy rustup morto, exatamente o caso que rust.ts:195-234 pega. Remédio: usar o cargo REAL da toolchain (a engine aceita o env de override STUDY_METHOD_CARGO_BIN; este auxiliar v1 não lê esse env)"
        return 0
    fi
    # nível 3 — a prova de execução: teste de integração passando, offline, na árvore mínima
    local fx="$SM_TMP/fx-rust"
    sm_fixture_rust "$fx" ok
    SM_RS_ARGV="env CARGO_NET_OFFLINE=true CARGO_INCREMENTAL=0 CARGO_TERM_COLOR=never RUST_BACKTRACE=0 cargo test --offline"
    sm_run_rust_proof "$fx"
    SM_RS_EXIT="$SM_RC"
    if [ "$SM_RC" -ne 0 ]; then
        SM_RS_DETAIL="cargo test saiu com status de falha do cargo ($SM_RC — o §5.3 de docs/00 registra os status observados do cargo): $(sm_snip "$(sm_last_line "$SM_OUT")")"
        return 0
    fi
    if ! printf '%s\n' "$SM_OUT" | grep -qE 'test result: ok\. [1-9][0-9]* passed'; then
        SM_RS_DETAIL="cargo test saiu limpo mas sem 'test result: ok' com teste passado >= 1 — nada rodou (o filtro por nome qualificado que sai limpo sem rodar é a armadilha medida de languages.md §2.3)"
        return 0
    fi
    SM_RS_OK="true"
    SM_RS_DETAIL="rust provou em 3 níveis: cargo --version; o cargo REAL do sysroot responde sob env scrubado; teste de integração passou offline"
    return 0
}

sm_proof_c() {
    SM_C_AVAIL="false"; SM_C_VER=""; SM_C_CMD=""; SM_C_PATH=""
    SM_C_OK="false"; SM_C_ARGV=""; SM_C_EXIT=""; SM_C_DETAIL=""
    SM_C_STEP_BUILD="nao"; SM_C_STEP_CLANG="nao"; SM_C_STEP_PY="nao"
    local cand ccbin="" ccpath=""
    for cand in cc gcc clang; do
        ccpath="$(command -v "$cand" 2>/dev/null || true)"
        if [ -n "$ccpath" ]; then
            ccbin="$cand"
            break
        fi
    done
    if [ -z "$ccbin" ]; then
        SM_C_DETAIL="nenhum cc/gcc/clang no PATH — o runner de C não compila; instale a receita C da família da distro (o conjunto do compilador + clang) (--ensure instala)"
        return 0
    fi
    SM_C_AVAIL="true"; SM_C_CMD="$ccbin"; SM_C_PATH="$ccpath"
    sm_run "$ccbin" --version
    if [ "$SM_RC" -eq 0 ]; then
        SM_C_VER="$(sm_extract_version c "$SM_OUT")"
    fi
    if [ -z "$SM_C_VER" ]; then
        SM_C_VER="desconhecida"
    fi
    # passo 1 — compila e roda o runner (gcc serve; qualquer dos três cobre o runner)
    local fx="$SM_TMP/fx-c"
    sm_fixture_c "$fx" ok
    SM_C_ARGV="$ccbin -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner"
    sm_run_in "$fx" "$ccbin" -std=c11 -g stub.c tests/test_stub.c -o runner -lm
    if [ "$SM_RC" -ne 0 ]; then
        SM_C_EXIT="$SM_RC"
        SM_C_DETAIL="a compilação do runner falhou (status $SM_RC): $(sm_snip "$(sm_last_line "$SM_OUT")")"
        return 0
    fi
    sm_run_in "$fx" ./runner
    SM_C_EXIT="$SM_RC"
    if [ "$SM_RC" -ne 0 ]; then
        SM_C_STEP_BUILD="falha"
        SM_C_DETAIL="o runner compilou mas saiu com o status $SM_RC (o abort do assert.h chega como SIGABRT — status observado em docs/00 §5.3)"
        return 0
    fi
    SM_C_STEP_BUILD="ok"
    # passo 2 — clang funcional pro PARSE: gcc NÃO serve pro parse (a extensão -ast-dump=json
    # não existe no gcc); sem clang não há Porta 1 para C (c.ts:27-31)
    local clangpath
    clangpath="$(command -v clang 2>/dev/null || true)"
    if [ -z "$clangpath" ]; then
        SM_C_DETAIL="clang ausente — o PARSE de C exige clang (a extensão -ast-dump=json não existe no gcc; o gcc NÃO serve pro parse): sem clang não há Porta 1 para C e o gate reprova; instale a receita C (--ensure instala)"
        return 0
    fi
    sm_run_in "$fx" clang -std=c11 -fsyntax-only stub.c
    if [ "$SM_RC" -ne 0 ]; then
        SM_C_STEP_CLANG="falha"
        SM_C_EXIT="$SM_RC"
        SM_C_DETAIL="clang presente mas a prova de parse falhou (status $SM_RC): $(sm_snip "$(sm_last_line "$SM_OUT")")"
        return 0
    fi
    SM_C_STEP_CLANG="ok"
    # passo 3 — python3 presente: é o host do extrator do parse (vocab/c/extract_ast.py)
    local pypath
    pypath="$(command -v python3 2>/dev/null || true)"
    if [ -z "$pypath" ]; then
        pypath="$(command -v python 2>/dev/null || true)"
    fi
    if [ -z "$pypath" ]; then
        SM_C_DETAIL="python3 ausente — o extrator do parse de C é um subprocesso python3 (c.ts:184): sem ele a árvore normalizada não é produzida; instale a receita python (--ensure instala)"
        return 0
    fi
    SM_C_STEP_PY="ok"
    SM_C_OK="true"
    SM_C_DETAIL="C provou: runner compilou e rodou com $ccbin; clang -fsyntax-only passou (o parse depende de clang); python3 presente como host do extrator"
    return 0
}

# ---------------------------------------------------------------------------
# Bloco harness — node + npm + jq, reportados SEMPRE. O jq entra como RÓTULO no
# ensure.missing e na mensagem do aviso do stderr; o bloco harness do JSON segue
# com as chaves node/npm apenas (shape congelado — nenhuma chave nova).
# ---------------------------------------------------------------------------
sm_probe_harness() {
    SM_NODE_FOUND="false"; SM_NODE_VER=""; SM_NODE_OK="false"
    SM_NPM_FOUND="false"; SM_NPM_VER=""; SM_NPM_OK="false"
    SM_JQ_FOUND="false"; SM_JQ_VER=""; SM_JQ_OK="false"
    local p
    p="$(command -v node 2>/dev/null || true)"
    if [ -n "$p" ]; then
        SM_NODE_FOUND="true"
        sm_run node --version
        if [ "$SM_RC" -eq 0 ]; then
            SM_NODE_VER="$(sm_extract_version node "$SM_OUT")"
            SM_NODE_OK="true"
        fi
    fi
    p="$(command -v npm 2>/dev/null || true)"
    if [ -n "$p" ]; then
        SM_NPM_FOUND="true"
        sm_run npm --version
        if [ "$SM_RC" -eq 0 ]; then
            SM_NPM_VER="$(sm_extract_version npm "$SM_OUT")"
            SM_NPM_OK="true"
        fi
    fi
    p="$(command -v jq 2>/dev/null || true)"
    if [ -n "$p" ]; then
        SM_JQ_FOUND="true"
        sm_run jq --version
        if [ "$SM_RC" -eq 0 ]; then
            SM_JQ_VER="$(sm_extract_version jq "$SM_OUT")"
            SM_JQ_OK="true"
        fi
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Detecção da família de distro: /etc/os-release (ID + ID_LIKE) e, em falta, o
# gerenciador presente. macOS: uname Darwin + brew.
# ---------------------------------------------------------------------------
sm_detect_family() {
    SM_FAMILY="none"; SM_MANAGER=""
    if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
        if command -v brew >/dev/null 2>&1; then
            SM_FAMILY="macos"; SM_MANAGER="brew"
        fi
        return 0
    fi
    local id="" like=""
    if [ -r /etc/os-release ]; then
        id="$(sed -n 's/^ID=//p' /etc/os-release | head -n1 | tr -d '"')"
        like="$(sed -n 's/^ID_LIKE=//p' /etc/os-release | head -n1 | tr -d '"')"
    fi
    case "$id" in
        arch|cachyos|manjaro|endeavouros|garuda|artix)         SM_FAMILY="pacman" ;;
        debian|ubuntu|linuxmint|pop|raspbian|kali|deepin)      SM_FAMILY="apt" ;;
        fedora|rhel|centos|rocky|almalinux|nobara|ol|amzn)     SM_FAMILY="dnf" ;;
        alpine)                                                SM_FAMILY="apk" ;;
        *)
            case "$like" in
                *arch*)   SM_FAMILY="pacman" ;;
                *debian*) SM_FAMILY="apt" ;;
                *fedora*|*rhel*) SM_FAMILY="dnf" ;;
                *alpine*) SM_FAMILY="apk" ;;
            esac
            ;;
    esac
    # rede de segurança: o gerenciador presente decide
    if [ "$SM_FAMILY" = "none" ]; then
        if command -v pacman >/dev/null 2>&1; then
            SM_FAMILY="pacman"
        elif command -v apt-get >/dev/null 2>&1; then
            SM_FAMILY="apt"
        elif command -v dnf >/dev/null 2>&1; then
            SM_FAMILY="dnf"
        elif command -v apk >/dev/null 2>&1; then
            SM_FAMILY="apk"
        fi
    fi
    case "$SM_FAMILY" in
        pacman) if command -v pacman >/dev/null 2>&1; then SM_MANAGER="pacman"; else SM_FAMILY="none"; fi ;;
        apt)    if command -v apt-get >/dev/null 2>&1; then SM_MANAGER="apt-get"; else SM_FAMILY="none"; fi ;;
        dnf)    if command -v dnf >/dev/null 2>&1; then SM_MANAGER="dnf"; else SM_FAMILY="none"; fi ;;
        apk)    if command -v apk >/dev/null 2>&1; then SM_MANAGER="apk"; else SM_FAMILY="none"; fi ;;
        macos)  : ;;
        *)      SM_MANAGER="" ;;
    esac
    return 0
}

# ---------------------------------------------------------------------------
# Receitas --ensure — VERBATIM da referência de ambiente da autoria (§3), fonte canônica.
# $1 = família, $2 = bloco (python | rust | c | node | jq) → pacotes, um por linha.
# ---------------------------------------------------------------------------
sm_recipe_packages() {
    # Divergência pacman declarada: a receita canônica (referência de ambiente da autoria,
    # §3.4) usa `pacman -Syu --needed ...` — aqui o `pacman -S` roda SEM o refresh do banco
    # (-Sy/-Syu não roda; o -Sy sozinho é a armadilha do upgrade parcial e o -Syu faria um
    # upgrade do sistema que não cabe num --ensure).
    case "$1:$2" in
        pacman:python) printf 'python\n' ;;
        pacman:rust)   printf 'rust\n' ;;
        pacman:c)      printf 'base-devel\nclang\n' ;;
        pacman:node)   printf 'nodejs\nnpm\njq\n' ;;
        pacman:jq)     printf 'jq\n' ;;
        apt:python)    printf 'python3\n' ;;
        apt:rust)      printf 'cargo\nrustc\n' ;;
        apt:c)         printf 'build-essential\nclang\n' ;;
        apt:node)      printf 'nodejs\nnpm\njq\n' ;;
        apt:jq)        printf 'jq\n' ;;
        dnf:python)    printf 'python3\n' ;;
        dnf:rust)      printf 'rust\ncargo\n' ;;
        dnf:c)         printf 'gcc\nclang\ngcc-c++\nmake\n' ;;
        dnf:node)      printf 'nodejs\nnpm\njq\n' ;;
        dnf:jq)        printf 'jq\n' ;;
        apk:python)    printf 'python3\n' ;;
        apk:rust)      printf 'rust\ncargo\n' ;;
        apk:c)         printf 'build-base\nclang\n' ;;
        apk:node)      printf 'nodejs\nnpm\njq\n' ;;
        apk:jq)        printf 'jq\n' ;;
        macos:python)  printf 'python3\n' ;;
        # Divergência macos:rust declarada (referência de ambiente da autoria, §3.5/§4): o
        # caminho recomendado pela fonte canônica é o instalador do rustup.rs, que este
        # script NÃO usa — zero rede em linha de código, o download só nasce do gerenciador
        # — então a receita daqui é o brew rustup + o pós-install 'rustup default stable'
        # (bloco macos:rust no fluxo de instalação), que cobre a armadilha nº 1 da família:
        # rustup sem toolchain default não entrega cargo.
        macos:rust)    printf 'rustup\n' ;;
        macos:c)       : ;;  # o clang do macOS vem do Xcode Command Line Tools, não do brew
        macos:node)    printf 'node\njq\n' ;;
        macos:jq)      printf 'jq\n' ;;
        *)             : ;;
    esac
    return 0
}

sm_install_cmdline() {
    # o comando EXATO que o operador roda à mão quando não há privilégio aqui
    local block="$1" pkgs cmd
    case "$SM_FAMILY:$block" in
        macos:c) printf 'xcode-select --install'; return 0 ;;
    esac
    pkgs="$(sm_recipe_packages "$SM_FAMILY" "$block" | tr '\n' ' ')"
    case "$SM_FAMILY" in
        pacman) cmd="pacman -S --needed --noconfirm $pkgs" ;;
        apt)    cmd="apt-get update && apt-get install -y $pkgs" ;;
        dnf)    cmd="dnf install -y $pkgs" ;;
        apk)    cmd="apk add --no-cache $pkgs" ;;
        macos)  cmd="brew install $pkgs" ;;
        *)      cmd="" ;;
    esac
    if [ "$(id -u)" -ne 0 ] && [ "$SM_FAMILY" != "macos" ]; then
        cmd="sudo $cmd"
    fi
    printf '%s' "${cmd% }"
    return 0
}

sm_build_install_argv() {
    # preenche SM_INSTALL_ARGV com o argv do instalador (SEM o sudo — quem decide o sudo é
    # o exec; e SEM download fora do gerenciador: o download é filho do gerenciador).
    # Bloco sem pacote no gerenciador (ex.: o clang do macOS vem do Xcode CLT) deixa o
    # array vazio — o chamador trata como falha com o comando do operador.
    local block="$1" pkgs
    pkgs="$(sm_recipe_packages "$SM_FAMILY" "$block" | tr '\n' ' ')"
    SM_INSTALL_ARGV=()
    if [ -z "$pkgs" ]; then
        return 0
    fi
    case "$SM_FAMILY" in
        pacman) SM_INSTALL_ARGV=(pacman -S --needed --noconfirm $pkgs) ;;
        apt)    SM_INSTALL_ARGV=(env DEBIAN_FRONTEND=noninteractive apt-get install -y $pkgs) ;;
        dnf)    SM_INSTALL_ARGV=(dnf install -y $pkgs) ;;
        apk)    SM_INSTALL_ARGV=(apk add --no-cache $pkgs) ;;
        macos)  SM_INSTALL_ARGV=(brew install $pkgs) ;;
    esac
    return 0
}

sm_have_privilege() {
    # o gerenciador root no container é root direto; sem TTY não há prompt de senha
    if [ "$(id -u)" -eq 0 ]; then
        return 0
    fi
    if [ "$SM_FAMILY" = "macos" ]; then
        return 0
    fi
    if command -v sudo >/dev/null 2>&1; then
        if sudo -n true 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

sm_exec_install() {
    # roda a instalação com teto de 900s, stdin fechado (nunca pede senha) e sudo -n
    # quando precisa de privilégio; todo download nasce do gerenciador. O stdout do
    # gerenciador vai para o STDERR: o stdout deste script é SEMPRE o documento JSON
    # (contrato do cabeçalho) — o apt-get/pacman vaza milhares de linhas e um
    # json.load(stdout) quebraria para qualquer consumidor de --ensure --json.
    local rc
    set +e
    if [ "$(id -u)" -eq 0 ] || [ "$SM_FAMILY" = "macos" ]; then
        if command -v timeout >/dev/null 2>&1; then
            timeout -s KILL -k 2 900 "${SM_INSTALL_ARGV[@]}" </dev/null >&2
        else
            "${SM_INSTALL_ARGV[@]}" </dev/null >&2
        fi
    else
        if command -v timeout >/dev/null 2>&1; then
            timeout -s KILL -k 2 900 sudo -n "${SM_INSTALL_ARGV[@]}" </dev/null >&2
        else
            sudo -n "${SM_INSTALL_ARGV[@]}" </dev/null >&2
        fi
    fi
    rc=$?
    set -e
    SM_INSTALL_RC="$rc"
    return 0
}

sm_apt_update_once() {
    if [ "$SM_APT_UPDATED" = "1" ]; then
        return 0
    fi
    SM_APT_UPDATED="1"
    local rc
    set +e
    # stdout do gerenciador vai para o stderr — o stdout do script é SEMPRE o JSON
    if [ "$(id -u)" -eq 0 ]; then
        if command -v timeout >/dev/null 2>&1; then
            timeout -s KILL -k 2 300 apt-get update </dev/null >&2
        else
            apt-get update </dev/null >&2
        fi
    else
        if command -v timeout >/dev/null 2>&1; then
            timeout -s KILL -k 2 300 sudo -n apt-get update </dev/null >&2
        else
            sudo -n apt-get update </dev/null >&2
        fi
    fi
    rc=$?
    set -e
    if [ "$rc" -ne 0 ]; then
        sm_err "aviso: apt-get update falhou (status $rc) — a instalação segue mesmo assim"
    fi
    return 0
}

sm_add_missing() {
    # acrescenta um rótulo ao bloco missing sem duplicar — o arquivo é multilinha, então
    # o conteúdo é normalizado para espaço-único antes do teste de palavra inteira (sem
    # a normalização, "rust\nnode\n" não casa com " node " e o rótulo duplica)
    local label="$1" cur
    cur="$(tr '\n' ' ' < "$SM_TMP/missing.txt" 2>/dev/null || true)"
    case " $cur " in
        *" $label "*) : ;;
        *) printf '%s\n' "$label" >> "$SM_TMP/missing.txt" ;;
    esac
    return 0
}

# ---------------------------------------------------------------------------
# Derivação dos blocos necessários, a partir do estado das provas.
# ---------------------------------------------------------------------------
sm_needs_python() {
    if [ "$SM_PY_OK" = "true" ]; then return 0; fi
    printf 'python'
    return 0
}

sm_needs_rust() {
    if [ "$SM_RS_OK" = "true" ]; then return 0; fi
    local n="rust"
    if ! command -v node >/dev/null 2>&1; then
        n="$n node"
    fi
    printf '%s' "$n"
    return 0
}

sm_needs_c() {
    if [ "$SM_C_OK" = "true" ]; then return 0; fi
    local n=""
    if [ "$SM_C_STEP_BUILD" != "ok" ] || [ "$SM_C_STEP_CLANG" != "ok" ]; then
        n="c"
    fi
    if [ "$SM_C_STEP_PY" != "ok" ]; then
        n="$n python"
    fi
    printf '%s' "$n"
    return 0
}

# ---------------------------------------------------------------------------
# Fluxo --ensure: prova falhou → instala pela receita → RE-PROVA.
# ---------------------------------------------------------------------------
sm_ensure_flow() {
    local only="$1" l ok b b2 blocks detail cmdline
    # 1) quem passou de primeira entra em skipped; quem falhou deriva os blocos
    for l in python rust c; do
        if [ -n "$only" ] && [ "$l" != "$only" ]; then continue; fi
        case "$l" in
            python) ok="$SM_PY_OK" ;;
            rust)   ok="$SM_RS_OK" ;;
            c)      ok="$SM_C_OK" ;;
        esac
        if [ "$ok" = "true" ]; then
            printf '%s\n' "$l" >> "$SM_TMP/skipped.txt"
            sm_err "$l: já provado (nada a instalar)"
            continue
        fi
        case "$l" in
            python) b="$(sm_needs_python)" ;;
            rust)   b="$(sm_needs_rust)" ;;
            c)      b="$(sm_needs_c)" ;;
        esac
        for b2 in $b; do
            sm_add_missing "$b2"
        done
    done
    # 2) o bloco harness (node+npm+jq) entra no escopo do --ensure em TODO caso — com ou
    #    sem --language, QUALQUER linguagem: node+npm sobem a CLI dos gates (via tsx) e o
    #    jq parseia o JSON da engine, pré-requisito dos gates em qualquer trilha. É a
    #    mesma garantia cruzada no caminho "já provado" (rust.ts:9: o node é o host do
    #    parser WASM do tree-sitter; o rust provado não isenta o node, e o python/c
    #    provado não isenta o harness). O dedup por rótulo do missing evita o node
    #    duplicado quando a garantia cruzada do rust (needs) já o acrescentou.
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        sm_add_missing "node"
    fi
    if ! command -v jq >/dev/null 2>&1; then
        sm_add_missing "jq"
    fi
    # 3) nada faltando: as provas de primeira valem
    if [ ! -s "$SM_TMP/missing.txt" ]; then
        return 0
    fi
    # 4) família de distro
    sm_detect_family
    if [ "$SM_FAMILY" = "none" ]; then
        sm_err "família de distro não detectada (nem /etc/os-release conhecido, nem gerenciador de pacotes no PATH)"
        while IFS= read -r b2; do
            [ -n "$b2" ] || continue
            printf '%s\t%s\t%s\n' "$b2" "install_failed" \
                "sem receita: família de distro não detectada (nem os-release conhecido, nem gerenciador no PATH); instale à mão e re-execute --ensure" \
                >> "$SM_TMP/failed.txt"
        done < "$SM_TMP/missing.txt"
        return 0
    fi
    # 5) privilégio — mensagem acionável com o COMANDO EXATO, nunca prompt de senha
    if ! sm_have_privilege; then
        sm_err "sem privilégio para instalar (sem TTY para pedir senha — stdin fechado). Comando exato para o operador, por bloco:"
        while IFS= read -r b2; do
            [ -n "$b2" ] || continue
            cmdline="$(sm_install_cmdline "$b2")"
            sm_err "  [$b2] $cmdline"
            printf '%s\t%s\t%s\n' "$b2" "no_privilege" \
                "sem privilégio de instalação nesta execução (sem TTY); o comando exato para o operador foi emitido no stderr" \
                >> "$SM_TMP/failed.txt"
        done < "$SM_TMP/missing.txt"
        return 0
    fi
    # 6) instala por bloco, na ordem canônica, e RE-PROVA no fim
    if [ "$SM_FAMILY" = "apt" ]; then
        sm_apt_update_once
    fi
    for b2 in python rust c node jq; do
        grep -qx "$b2" "$SM_TMP/missing.txt" || continue
        sm_build_install_argv "$b2"
        if [ "${#SM_INSTALL_ARGV[@]}" -eq 0 ]; then
            # bloco sem pacote no gerenciador (ex.: clang do macOS vem do Xcode CLT)
            cmdline="$(sm_install_cmdline "$b2")"
            sm_err "nada a instalar pelo gerenciador para '$b2' — comando do operador: $cmdline"
            printf '%s\t%s\t%s\n' "$b2" "install_failed" \
                "sem pacote instalável pelo gerenciador desta família; comando do operador: $cmdline" \
                >> "$SM_TMP/failed.txt"
            continue
        fi
        sm_err "instalando '$b2' via $SM_MANAGER: ${SM_INSTALL_ARGV[*]}"
        sm_exec_install
        if [ "$SM_INSTALL_RC" -ne 0 ]; then
            sm_err "instalação de '$b2' falhou (status $SM_INSTALL_RC)"
            printf '%s\t%s\t%s\n' "$b2" "install_failed" \
                "o gerenciador $SM_MANAGER saiu com o status $SM_INSTALL_RC; a saída completa está no stderr acima" \
                >> "$SM_TMP/failed.txt"
            continue
        fi
        printf '%s\n' "$b2" >> "$SM_TMP/installed.txt"
        # pós-install da receita rust do macOS: o brew entrega o rustup, que precisa da
        # toolchain estável escolhida (a armadilha nº 1 da família, §3.4 da referência)
        if [ "$SM_FAMILY" = "macos" ] && [ "$b2" = "rust" ]; then
            if command -v rustup >/dev/null 2>&1; then
                sm_err "selecionando a toolchain stable do rustup (o formula não traz toolchain por si)"
                set +e
                # stdout do rustup vai para o stderr — o stdout do script é SEMPRE o JSON
                if command -v timeout >/dev/null 2>&1; then
                    timeout -s KILL -k 2 900 rustup default stable </dev/null >&2
                else
                    rustup default stable </dev/null >&2
                fi
                set -e
            else
                sm_err "aviso: brew instalou o formula rustup mas o binário rustup não está no PATH — rode 'rustup default stable' e re-execute"
            fi
        fi
    done
    # 7) RE-PROVA — o veredito sai de execução, nunca da saída do instalador
    for l in python rust c; do
        if [ -n "$only" ] && [ "$l" != "$only" ]; then continue; fi
        case "$l" in
            python) sm_proof_python ;;
            rust)   sm_proof_rust ;;
            c)      sm_proof_c ;;
        esac
    done
    sm_probe_harness
    # 8) honestidade do veredito: o bloco foi INSTALADO e a re-prova ainda falha
    #    (ex.: o cargo da distro não vence o proxy rustup do PATH) — a entrada de
    #    failed registra isso, em vez de o JSON ficar em silêncio sobre a lacuna.
    for l in python rust c; do
        if [ -n "$only" ] && [ "$l" != "$only" ]; then continue; fi
        case "$l" in
            python) ok="$SM_PY_OK"; blocks="$(sm_needs_python)"; detail="$SM_PY_DETAIL" ;;
            rust)   ok="$SM_RS_OK"; blocks="$(sm_needs_rust)"; detail="$SM_RS_DETAIL" ;;
            c)      ok="$SM_C_OK"; blocks="$(sm_needs_c)"; detail="$SM_C_DETAIL" ;;
        esac
        if [ "$ok" = "true" ]; then continue; fi
        for b in $blocks; do
            if grep -qx "$b" "$SM_TMP/installed.txt" 2>/dev/null; then
                printf '%s\t%s\t%s\n' "$l" "install_failed" \
                    "instalado ($b) e a re-prova por execução ainda falha: $detail" \
                    >> "$SM_TMP/failed.txt"
                break
            fi
        done
    done
    # honestidade do harness em QUALQUER escopo (o bloco entra em todo --ensure agora): o
    # bloco foi INSTALADO e o re-probe do harness ainda não encontra o conjunto no PATH —
    # registra failed em vez de o JSON ficar em silêncio sobre a lacuna.
    if grep -qx "node" "$SM_TMP/installed.txt" 2>/dev/null; then
        if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
            printf '%s\t%s\t%s\n' "node" "install_failed" \
                "instalado (node) e o re-probe do harness ainda não encontra node/npm no PATH" \
                >> "$SM_TMP/failed.txt"
        fi
    fi
    if grep -qx "jq" "$SM_TMP/installed.txt" 2>/dev/null; then
        if ! command -v jq >/dev/null 2>&1; then
            printf '%s\t%s\t%s\n' "jq" "install_failed" \
                "instalado (jq) e o re-probe do harness ainda não encontra jq no PATH" \
                >> "$SM_TMP/failed.txt"
        fi
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Aviso acionável do harness ausente no --check — QUALQUER escopo. Nunca derruba
# o exit (o veredito é da prova das linguagens pedidas): informa o que falta e
# traz o comando EXATO da receita desta família, como o --ensure aplicaria. Só
# fala no stderr — o shape do JSON não muda.
# ---------------------------------------------------------------------------
sm_harness_warn() {
    local faltam="" cmdline
    if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        faltam="node/npm"
    fi
    if ! command -v jq >/dev/null 2>&1; then
        if [ -n "$faltam" ]; then
            faltam="$faltam + jq"
        else
            faltam="jq"
        fi
    fi
    [ -n "$faltam" ] || return 0
    sm_detect_family
    cmdline="$(sm_install_cmdline node)"
    if [ "$SM_FAMILY" = "none" ] || [ -z "$cmdline" ]; then
        sm_err "aviso: harness ausente/incompleto (faltando: $faltam) — os gates rodam via npm/tsx e exigem node+npm+jq em qualquer trilha; família de distro não detectada: instale node+npm+jq à mão (o --ensure garante quando a família é detectada)"
    else
        sm_err "aviso: harness ausente/incompleto (faltando: $faltam) — os gates rodam via npm/tsx e exigem node+npm+jq em qualquer trilha; comando exato da receita 'node' desta família: $cmdline (o --ensure aplica e re-prova; o --check nunca instala)"
    fi
    return 0
}

sm_stderr_summary() {
    local l ok
    for l in python rust c; do
        if [ -n "$SM_ONLY" ] && [ "$l" != "$SM_ONLY" ]; then
            sm_err "$l: fora do escopo (--language $SM_ONLY)"
            continue
        fi
        case "$l" in
            python) ok="$SM_PY_OK" ;;
            rust)   ok="$SM_RS_OK" ;;
            c)      ok="$SM_C_OK" ;;
        esac
        if [ "$ok" = "true" ]; then
            sm_err "$l: prova ok"
        else
            sm_err "$l: prova FALHOU"
        fi
    done
    if [ "$SM_NODE_OK" = "true" ] && [ "$SM_NPM_OK" = "true" ] && [ "$SM_JQ_OK" = "true" ]; then
        sm_err "harness: node+npm+jq ok"
    else
        sm_err "harness: node/npm/jq incompleto (node=$SM_NODE_OK npm=$SM_NPM_OK jq=$SM_JQ_OK)"
    fi
    return 0
}

# ---------------------------------------------------------------------------
# Montagem do documento JSON — EXTENSÃO do formato de detect-toolchains.sh.
# ---------------------------------------------------------------------------
sm_line() {
    SM_DOC="$SM_DOC"$'\n'"$1"
}

sm_array_json() {
    # stdout: `"campo": ["a", "b"]` a partir de um arquivo com um rótulo por linha.
    # Leitura por `< arquivo` de propósito: o conteúdo é DADO, nunca re-expandido.
    local field="$1" file="$2" item out="[" first=1
    if [ -r "$file" ]; then
        while IFS= read -r item; do
            if [ -z "$item" ]; then continue; fi
            if [ "$first" -eq 1 ]; then
                first=0
            else
                out="$out, "
            fi
            out="$out\"$(sm_json_escape "$item")\""
        done < "$file"
    fi
    out="$out]"
    printf '"%s": %s' "$field" "$out"
}

sm_failed_json() {
    # stdout: `"failed": [{"label", "reason", "detail"}]` — arquivo com linhas
    # "label\treason\tdetail". Leitura por `< arquivo`: o conteúdo é DADO, nunca
    # re-expandido (a saída do gerenciador não pode virar execução).
    local item label reason detail out="[" first=1
    if [ -r "$SM_TMP/failed.txt" ]; then
        while IFS= read -r item; do
            if [ -z "$item" ]; then continue; fi
            label="${item%%$'\t'*}"
            item="${item#*$'\t'}"
            reason="${item%%$'\t'*}"
            detail="${item#*$'\t'}"
            if [ "$first" -eq 1 ]; then
                first=0
            else
                out="$out, "
            fi
            out="$out{\"label\": \"$(sm_json_escape "$label")\", \"reason\": \"$(sm_json_escape "$reason")\", \"detail\": \"$(sm_json_escape "$detail")\"}"
        done < "$SM_TMP/failed.txt"
    fi
    out="$out]"
    printf '"failed": %s' "$out"
}

sm_emit_lang_obj() {
    # uma linha: `"python": {...}` — lead="," nos objetos que não abrem a lista
    local lang="$1" lead="$2"
    local avail ver cmd pth ok pargv pexit pdetail obj
    case "$lang" in
        python) avail="$SM_PY_AVAIL"; ver="$SM_PY_VER"; cmd="$SM_PY_CMD"; pth="$SM_PY_PATH"
                ok="$SM_PY_OK"; pargv="$SM_PY_ARGV"; pexit="$SM_PY_EXIT"; pdetail="$SM_PY_DETAIL" ;;
        rust)   avail="$SM_RS_AVAIL"; ver="$SM_RS_VER"; cmd="$SM_RS_CMD"; pth="$SM_RS_PATH"
                ok="$SM_RS_OK"; pargv="$SM_RS_ARGV"; pexit="$SM_RS_EXIT"; pdetail="$SM_RS_DETAIL" ;;
        c)      avail="$SM_C_AVAIL"; ver="$SM_C_VER"; cmd="$SM_C_CMD"; pth="$SM_C_PATH"
                ok="$SM_C_OK"; pargv="$SM_C_ARGV"; pexit="$SM_C_EXIT"; pdetail="$SM_C_DETAIL" ;;
    esac
    obj="$lead    \"$lang\": {"
    obj="$obj\"available\": $avail, "
    if [ "$avail" = "true" ]; then
        obj="$obj\"version\": \"$(sm_json_escape "$ver")\", "
        obj="$obj\"command\": \"$(sm_json_escape "$cmd")\", "
        obj="$obj\"path\": \"$(sm_json_escape "$pth")\", "
    else
        obj="$obj\"version\": null, \"command\": null, \"path\": null, "
    fi
    obj="$obj\"implemented\": true, "
    obj="$obj\"test_command\": \"$(sm_json_escape "$(sm_test_command "$lang")")\", "
    obj="$obj\"proof\": {"
    obj="$obj\"ok\": $ok, "
    obj="$obj\"argv\": \"$(sm_json_escape "$pargv")\", "
    if [ -n "$pexit" ]; then
        obj="$obj\"exit_code\": $pexit, "
    else
        obj="$obj\"exit_code\": null, "
    fi
    obj="$obj\"detail\": \"$(sm_json_escape "$pdetail")\""
    obj="$obj}}"
    sm_line "$obj"
}

sm_build_doc() {
    local mode="$1" only="$2" l first=1
    SM_DOC="{"
    sm_line "  \"schema_version\": \"$SM_SCHEMA_VERSION\","
    sm_line "  \"generated_at\": \"$(sm_now_iso)\","
    sm_line "  \"host\": \"$(sm_json_escape "$(uname -n 2>/dev/null || printf unknown)")\","
    sm_line "  \"platform\": \"$(sm_json_escape "$(uname -s 2>/dev/null || printf unknown)")\","
    sm_line "  \"mode\": \"$mode\","
    sm_line '  "implemented_languages": ["python", "rust", "c"],'
    sm_line '  "languages": {'
    for l in python rust c; do
        if [ -n "$only" ] && [ "$l" != "$only" ]; then continue; fi
        if [ "$first" -eq 1 ]; then
            sm_emit_lang_obj "$l" ""
            first=0
        else
            sm_emit_lang_obj "$l" ","
        fi
    done
    sm_line '  },'
    sm_line "  \"ensure\": {$(sm_array_json missing "$SM_TMP/missing.txt"), $(sm_array_json installed "$SM_TMP/installed.txt"), $(sm_failed_json), $(sm_array_json skipped "$SM_TMP/skipped.txt")},"
    sm_line '  "harness": {'
    sm_line "    \"node\": {\"available\": $SM_NODE_FOUND, \"version\": $(if [ -n "$SM_NODE_VER" ]; then printf '"%s"' "$(sm_json_escape "$SM_NODE_VER")"; else printf null; fi), \"ok\": $SM_NODE_OK},"
    sm_line "    \"npm\": {\"available\": $SM_NPM_FOUND, \"version\": $(if [ -n "$SM_NPM_VER" ]; then printf '"%s"' "$(sm_json_escape "$SM_NPM_VER")"; else printf null; fi), \"ok\": $SM_NPM_OK}"
    sm_line '  }'
    sm_line '}'
    printf '%s' "$SM_DOC"
    return 0
}

sm_all_requested_ok() {
    local l ok
    for l in python rust c; do
        if [ -n "$SM_ONLY" ] && [ "$l" != "$SM_ONLY" ]; then continue; fi
        case "$l" in
            python) ok="$SM_PY_OK" ;;
            rust)   ok="$SM_RS_OK" ;;
            c)      ok="$SM_C_OK" ;;
        esac
        if [ "$ok" != "true" ]; then
            return 1
        fi
    done
    return 0
}

# ---------------------------------------------------------------------------
# Modos --check / --ensure
# ---------------------------------------------------------------------------
sm_main_run() {
    local mode="$1" doc cache verdict l b b2
    SM_ONLY="$2"
    SM_TMP="$(mktemp -d)" || sm_die 1 "sem diretório temporário para as fixtures"
    trap sm_cleanup EXIT
    # HOME/PATH do shell precedem (mesma postura do detector): é o PATH que as provas
    # scrubadas levam para dentro do `env -i`.
    SM_PATH="$PATH"
    SM_HOME="${HOME:-}"
    : > "$SM_TMP/missing.txt"; : > "$SM_TMP/installed.txt"
    : > "$SM_TMP/failed.txt";  : > "$SM_TMP/skipped.txt"

    local langs="python rust c"
    if [ -n "$SM_ONLY" ]; then
        langs="$SM_ONLY"
    fi

    # provas de primeira — o veredito nunca vem de leitura
    for l in $langs; do
        case "$l" in
            python) sm_proof_python ;;
            rust)   sm_proof_rust ;;
            c)      sm_proof_c ;;
        esac
    done
    sm_probe_harness

    if [ "$mode" = "ensure" ]; then
        sm_ensure_flow "$SM_ONLY"
    else
        # --check: o bloco ensure só DERIVA o que faltaria; nada instala
        for l in $langs; do
            case "$l" in
                python) b="$(sm_needs_python)" ;;
                rust)   b="$(sm_needs_rust)" ;;
                c)      b="$(sm_needs_c)" ;;
            esac
            for b2 in $b; do
                sm_add_missing "$b2"
            done
        done
        # o harness (node+npm+jq) é REPORTADO no --check em QUALQUER escopo — com ou sem
        # --language, qualquer linguagem — porque node+npm sobem a CLI dos gates (via tsx)
        # e o jq parseia o JSON da engine, em qualquer trilha. Entra em ensure.missing
        # (rótulos node/jq) com aviso acionável no stderr (comandos exatos por família),
        # mas NÃO derruba o exit do --check: a prova das linguagens pedidas decide o
        # veredito — garantir o harness é trabalho do --ensure, que o cobre em todo
        # escopo (o dedup por rótulo evita o node duplicado).
        if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
            sm_add_missing "node"
        fi
        if ! command -v jq >/dev/null 2>&1; then
            sm_add_missing "jq"
        fi
        sm_harness_warn
    fi
    sm_stderr_summary

    doc="$(sm_build_doc "$mode" "$SM_ONLY")"
    printf '%s\n' "$doc"

    if sm_all_requested_ok && [ ! -s "$SM_TMP/failed.txt" ]; then
        verdict=0
    else
        verdict=1
    fi

    # cache: documento COMPLETO da máquina (sem --language), só para --check/--ensure
    if [ -z "$SM_ONLY" ]; then
        cache="$(sm_home)/toolchain-ensure.json"
        if mkdir -p "$(dirname "$cache")" 2>/dev/null; then
            if ! printf '%s\n' "$doc" | sm_atomic_write_file "$cache"; then
                sm_err "aviso: não consegui gravar o cache em $cache (o resultado acima vale mesmo assim)"
            fi
        else
            sm_err "aviso: não consegui criar $(dirname "$cache") (o resultado acima vale mesmo assim)"
        fi
    fi
    exit "$verdict"
}

# ---------------------------------------------------------------------------
# --self-test: exercita provas e o contrato de exit/JSON SEM instalar nada.
# ---------------------------------------------------------------------------
SM_ST_FAILS="0"
sm_st_ok() { printf '  ok: %s\n' "$1"; }
sm_st_bad() {
    printf '  FALHA: %s\n' "$1" >&2
    SM_ST_FAILS=$((SM_ST_FAILS + 1))
}

sm_self_test() {
    local fx d rc outj
    fx="$(mktemp -d)" || sm_die 1 "sem diretório temporário para o auto-teste"
    SM_TMP="$fx"
    SM_PATH="$PATH"
    SM_HOME="${HOME:-}"
    trap sm_cleanup EXIT
    sm_err "auto-teste: fixtures em $fx (nada é instalado; o cache do sub-run vai para $fx/state)"

    # Forma de invocação — os sub-runs abaixo NÃO re-executam o arquivo: chamam main() num
    # SUBSHELL com o estado global re-inicializado aos defaults do topo do script. Motivo:
    # sob `bash <(git show branch:arquivo)` o $0 é /dev/fd/NN, um pipe JÁ CONSUMIDO pelo
    # parser — copiar $0 pegaria só o resto do stream (e roubaria o restante não lido do
    # próprio auto-teste), e re-executar por fd é indefinível. Via subshell o contrato é
    # exercido de forma idêntica nas três formas (direta, `bash /abs`, `bash <(fd)`), sem
    # depender da forma de invocação.

    # 1) fixtures com a forma certa
    d="$fx/py"; sm_fixture_python "$d" ok
    if [ -f "$d/stub.py" ] && [ -f "$d/tests/__init__.py" ] && [ -f "$d/tests/test_stub.py" ]; then
        sm_st_ok "fixture python completa (stub.py, tests/__init__.py, tests/test_stub.py)"
    else
        sm_st_bad "fixture python incompleta"
    fi
    d="$fx/rs"; sm_fixture_rust "$d" ok
    if [ -f "$d/Cargo.toml" ] && [ -f "$d/src/lib.rs" ] && [ -f "$d/tests/test_stub.rs" ]; then
        sm_st_ok "fixture rust completa (Cargo.toml, src/lib.rs, tests/test_stub.rs)"
    else
        sm_st_bad "fixture rust incompleta"
    fi
    d="$fx/c"; sm_fixture_c "$d" ok
    if [ -f "$d/stub.c" ] && [ -f "$d/stub.h" ] && [ -f "$d/tests/test_stub.c" ]; then
        sm_st_ok "fixture C completa (stub.c, stub.h, tests/test_stub.c)"
    else
        sm_st_bad "fixture C incompleta"
    fi

    # 2) prova do python: passa com a fixture ok; FALHA com a fixture doente (o guard
    #    dinâmico separa "passou" de "nada rodou")
    if command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1; then
        local pybin="python3"
        command -v python3 >/dev/null 2>&1 || pybin="python"
        sm_run_python_proof "$fx/py" "$pybin"
        if [ "$SM_RC" -eq 0 ] && printf '%s\n' "$SM_OUT" | grep -qE 'Ran [1-9][0-9]* tests?'; then
            sm_st_ok "prova python: fixture ok passa com contagem de teste >= 1"
        else
            sm_st_bad "prova python: fixture ok não passou no anfitrião (status $SM_RC)"
        fi
        d="$fx/py-bad"; sm_fixture_python "$d" falha
        sm_run_python_proof "$d" "$pybin"
        if [ "$SM_RC" -ne 0 ]; then
            sm_st_ok "prova python: fixture doente NÃO passa (status $SM_RC — falha nunca é lida como igual a um)"
        else
            sm_st_bad "prova python: fixture doente passou — o guard de contagem está frouxo"
        fi
    else
        sm_err "auto-teste: anfitrião sem python — prova python exercida no modo degradado"
    fi

    # 3) prova do rust: os 3 níveis na fixture ok; a doente não passa
    if command -v cargo >/dev/null 2>&1; then
        sm_run_rust_proof "$fx/rs"
        if [ "$SM_RC" -eq 0 ] && printf '%s\n' "$SM_OUT" | grep -qE 'test result: ok\. [1-9][0-9]* passed'; then
            sm_st_ok "prova rust: cargo test offline passa com teste passado >= 1"
        else
            sm_st_bad "prova rust: cargo test não passou no anfitrião (status $SM_RC)"
        fi
        d="$fx/rs-bad"; sm_fixture_rust "$d" falha
        sm_run_rust_proof "$d"
        if [ "$SM_RC" -ne 0 ]; then
            sm_st_ok "prova rust: fixture doente NÃO passa (status de falha do cargo $SM_RC — docs/00 §5.3)"
        else
            sm_st_bad "prova rust: fixture doente passou — o guard de resultado está frouxo"
        fi
    else
        sm_err "auto-teste: anfitrião sem cargo — prova rust exercida no modo degradado"
    fi

    # 4) prova do C: compila+roda e o clang de parse na fixture ok; a doente aborta
    if command -v cc >/dev/null 2>&1 || command -v gcc >/dev/null 2>&1 || command -v clang >/dev/null 2>&1; then
        local ccbin="cc"
        command -v cc >/dev/null 2>&1 || ccbin="gcc"
        command -v "$ccbin" >/dev/null 2>&1 || ccbin="clang"
        sm_run_in "$fx/c" "$ccbin" -std=c11 -g stub.c tests/test_stub.c -o runner -lm
        if [ "$SM_RC" -eq 0 ]; then
            sm_run_in "$fx/c" ./runner
            if [ "$SM_RC" -eq 0 ]; then
                sm_st_ok "prova C: runner compilou e rodou com $ccbin"
            else
                sm_st_bad "prova C: runner compilou mas não rodou limpo (status $SM_RC)"
            fi
        else
            sm_st_bad "prova C: compilação do runner falhou no anfitrião (status $SM_RC)"
        fi
        if command -v clang >/dev/null 2>&1; then
            sm_run_in "$fx/c" clang -std=c11 -fsyntax-only stub.c
            if [ "$SM_RC" -eq 0 ]; then
                sm_st_ok "prova C: clang de parse (-fsyntax-only) passou"
            else
                sm_st_bad "prova C: clang de parse falhou (status $SM_RC)"
            fi
        else
            sm_err "auto-teste: anfitrião sem clang — a etapa de parse foi só declarada"
        fi
        d="$fx/c-bad"; sm_fixture_c "$d" falha
        sm_run_in "$d" "$ccbin" -std=c11 -g stub.c tests/test_stub.c -o runner -lm
        if [ "$SM_RC" -eq 0 ]; then
            sm_run_in "$d" ./runner
            if [ "$SM_RC" -ne 0 ]; then
                sm_st_ok "prova C: fixture doente NÃO passa (o assert aborta — status $SM_RC)"
            else
                sm_st_bad "prova C: fixture doente passou — o assert não está a valer"
            fi
        else
            sm_st_bad "prova C: compilação da fixture doente falhou (status $SM_RC)"
        fi
    else
        sm_err "auto-teste: anfitrião sem compilador C — prova C exercida no modo degradado"
    fi

    # 5) contrato de uso: enum fechado e flag desconhecida saem com o código 2
    rc=0
    ( SM_MODE="check"; SM_ONLY=""; SM_MODE_TAKEN=""; main --language java ) >/dev/null 2>&1 || rc=$?
    if [ "$rc" -eq 2 ]; then
        sm_st_ok "contrato de uso: --language fora do enum fechado sai com o código 2"
    else
        sm_st_bad "contrato de uso: --language java saiu com o código $rc (esperado 2)"
    fi
    rc=0
    ( SM_MODE="check"; SM_ONLY=""; SM_MODE_TAKEN=""; main --flag-desconhecida ) >/dev/null 2>&1 || rc=$?
    if [ "$rc" -eq 2 ]; then
        sm_st_ok "contrato de uso: flag desconhecida sai com o código 2"
    else
        sm_st_bad "contrato de uso: flag desconhecida saiu com o código $rc (esperado 2)"
    fi

    # 5b) BUG fix (modo duplicado em QUALQUER ordem): o branch --check não marcava o
    #     modo como tomado — `--check --ensure` (nessa ordem) aceitava e ESCALAVA para
    #     ensure (instala de verdade com privilégio real), e `--check --self-test`
    #     re-entrava no auto-teste. Com o modo marcado, qualquer duplicação sai 2.
    rc=0
    ( SM_MODE="check"; SM_ONLY=""; SM_MODE_TAKEN=""; main --check --ensure ) >/dev/null 2>&1 || rc=$?
    if [ "$rc" -eq 2 ]; then
        sm_st_ok "contrato de uso: --check --ensure (nessa ordem) sai com o código 2 (não escala para ensure)"
    else
        sm_st_bad "contrato de uso: --check --ensure saiu com o código $rc (esperado 2)"
    fi
    rc=0
    ( SM_MODE="check"; SM_ONLY=""; SM_MODE_TAKEN=""; main --check --self-test ) >/dev/null 2>&1 || rc=$?
    if [ "$rc" -eq 2 ]; then
        sm_st_ok "contrato de uso: --check --self-test (nessa ordem) sai com o código 2 (não re-entra no auto-teste)"
    else
        sm_st_bad "contrato de uso: --check --self-test saiu com o código $rc (esperado 2)"
    fi

    # 6) contrato do JSON e do cache — um sub-run completo, com HOME de estado no tmp
    outj="$fx/out.json"
    rc=0
    ( STUDY_METHOD_HOME="$fx/state"; SM_MODE="check"; SM_ONLY=""; SM_MODE_TAKEN=""; main --check --json ) > "$outj" 2>/dev/null || rc=$?
    if [ "$rc" -eq 0 ] || [ "$rc" -eq 1 ]; then
        sm_st_ok "sub-run --check completo saiu com o código $rc (0 provado · 1 faltando)"
    else
        sm_st_bad "sub-run --check completo saiu com o código $rc (esperado 0 ou 1)"
    fi
    if [ -f "$fx/state/toolchain-ensure.json" ]; then
        sm_st_ok "cache gravado atomicamente em \$STUDY_METHOD_HOME do auto-teste"
    else
        sm_st_bad "cache não foi gravado no \$STUDY_METHOD_HOME do auto-teste"
    fi
    if command -v python3 >/dev/null 2>&1; then
        if python3 - "$outj" <<'SM_ST_JSON'
import json
import sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
for chave in ("schema_version", "generated_at", "host", "platform", "mode",
              "implemented_languages", "languages", "ensure", "harness"):
    if chave not in doc:
        raise SystemExit("chave ausente: %s" % chave)
if doc["mode"] != "check":
    raise SystemExit("mode esperado check")
if doc["implemented_languages"] != ["python", "rust", "c"]:
    raise SystemExit("implemented_languages divergente")
for lang in doc["languages"]:
    obj = doc["languages"][lang]
    for campo in ("available", "version", "command", "path", "implemented",
                  "test_command", "proof"):
        if campo not in obj:
            raise SystemExit("%s sem campo %s" % (lang, campo))
    for campo in ("ok", "argv", "exit_code", "detail"):
        if campo not in obj["proof"]:
            raise SystemExit("%s.proof sem campo %s" % (lang, campo))
for campo in ("missing", "installed", "failed", "skipped"):
    if campo not in doc["ensure"]:
        raise SystemExit("ensure sem campo %s" % campo)
for campo in ("node", "npm"):
    for sub in ("available", "version", "ok"):
        if sub not in doc["harness"][campo]:
            raise SystemExit("harness.%s sem campo %s" % (campo, sub))
raise SystemExit(0)
SM_ST_JSON
        then
            sm_st_ok "JSON valida: chaves do contrato em languages.proof, ensure e harness"
        else
            sm_st_bad "JSON não valida contra o contrato de chaves"
        fi
    else
        if grep -q '"proof"' "$outj" && grep -q '"ensure"' "$outj" && grep -q '"harness"' "$outj"; then
            sm_st_ok "JSON contém os blocos proof/ensure/harness (validação estrutural sem python3)"
        else
            sm_st_bad "JSON sem os blocos proof/ensure/harness"
        fi
    fi

    # 6b) BUG fix (corte multibyte): o sm_snip corta por BYTES com guard de fronteira
    #     UTF-8 — sob LC_ALL=C (locale single-byte) um corte no meio de um carácter
    #     multibyte não pode fabricar JSON UTF-8 inválido (o guard recua para a
    #     fronteira antes de emitir). Euro (0xE2 0x82 0xAC) força o corte a 160 bytes
    #     a cair em cima de um lead byte (160 = 3×53 + 1).
    if command -v python3 >/dev/null 2>&1; then
        local mbsnip="" mbstr="" mbdoc mbi=0
        while [ "$mbi" -lt 80 ]; do
            mbstr="${mbstr}€"
            mbi=$((mbi + 1))
        done
        mbsnip="$(LC_ALL=C sm_snip "$mbstr")"
        mbdoc="$(printf '{"detail": "%s"}' "$(sm_json_escape "$mbsnip")")"
        if [ -n "$mbsnip" ] && printf '%s' "$mbdoc" \
            | python3 -c 'import json, sys; json.loads(sys.stdin.buffer.read().decode("utf-8"))' 2>/dev/null; then
            sm_st_ok "corte multibyte sob LC_ALL=C: detail sai UTF-8 válido e o JSON parseia (guard de fronteira)"
        else
            sm_st_bad "corte multibyte sob LC_ALL=C: detail saiu com UTF-8 quebrado (JSON inválido)"
        fi
    else
        sm_err "auto-teste: corte multibyte não exercido (anfitrião sem python3)"
    fi

    # 7) caminho --ensure "já provado": NÃO instala nada (só com prova verde no anfitrião).
    #    O anfitrião precisa de node+npm+jq PRESENTES: o bloco harness entra no escopo de
    #    TODO --ensure (e nada pode ser instalado no auto-teste), então com o harness
    #    ausente este caminho é degradado e não é exercido aqui.
    if [ -f "$fx/state/toolchain-ensure.json" ] && command -v python3 >/dev/null 2>&1 \
        && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 \
        && command -v jq >/dev/null 2>&1 \
        && python3 - "$outj" <<'SM_ST_PYOK'
import json
import sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
sys.exit(0 if doc["languages"].get("python", {}).get("proof", {}).get("ok") is True else 1)
SM_ST_PYOK
    then
        local sk rc2
        sk="$fx/sk.json"
        rc2=0
        ( STUDY_METHOD_HOME="$fx/state"; SM_MODE="check"; SM_ONLY=""; SM_MODE_TAKEN=""; main --ensure --language python --json ) > "$sk" 2>/dev/null || rc2=$?
        if python3 - "$sk" <<'SM_ST_SKIP'
import json
import sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
if doc["ensure"]["installed"]:
    raise SystemExit("o --ensure instalou quando deveria só reprovar: %s" % doc["ensure"]["installed"])
if doc["ensure"]["failed"]:
    raise SystemExit("falha inesperada no --ensure já provado: %s" % doc["ensure"]["failed"])
if "python" not in doc["ensure"]["skipped"]:
    raise SystemExit("python não apareceu em ensure.skipped")
raise SystemExit(0)
SM_ST_SKIP
        then
            sm_st_ok "caminho --ensure já provado: skipped=python, sem instalar nada"
        else
            sm_st_bad "caminho --ensure já provado saiu inconsistente"
        fi
        rc="$rc2"
        if [ "$rc" -eq 0 ]; then
            sm_st_ok "caminho --ensure já provado saiu com o código 0"
        else
            sm_st_bad "caminho --ensure já provado saiu com o código $rc (esperado 0)"
        fi
    else
        sm_err "auto-teste: caminho --ensure já provado não exercido (prova python não está verde no anfitrião, ou node+npm+jq ausentes — o harness entra no escopo de todo --ensure e nada pode ser instalado aqui)"
    fi

    if [ "$SM_ST_FAILS" -gt 0 ]; then
        sm_die 1 "auto-teste: $SM_ST_FAILS assertiva(s) falharam"
    fi
    sm_err "auto-teste: todas as assertivas passaram; tmp limpo ao sair"
    exit 0
}

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
sm_usage() {
    printf 'uso: %s [--check] [--ensure] [--self-test] [--language <python|rust|c>] [--json]\n' "$SM_SELF" >&2
    printf '  --check        só prova por execução; NUNCA instala (default)\n' >&2
    printf '  --ensure       instala pela receita da distro quando a prova falha, e RE-PROVA\n' >&2
    printf '  --self-test    exercita provas e contrato de exit/JSON em tmp; não instala\n' >&2
    printf '  --language <l> enum fechado: python rust c (o harness entra em todo modo; sem a flag: as 3 linguagens)\n' >&2
    printf '  --json         aceito; a saída em stdout já é JSON sempre\n' >&2
}

main() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --check)
                if [ -n "$SM_MODE_TAKEN" ]; then
                    sm_usage; sm_die 2 "só um modo por execução (--check/--ensure/--self-test)"
                fi
                SM_MODE_TAKEN="check"
                shift
                ;;
            --ensure)
                if [ -n "$SM_MODE_TAKEN" ]; then
                    sm_usage; sm_die 2 "só um modo por execução (--check/--ensure/--self-test)"
                fi
                SM_MODE_TAKEN="ensure"; SM_MODE="ensure"
                shift
                ;;
            --self-test)
                if [ -n "$SM_MODE_TAKEN" ]; then
                    sm_usage; sm_die 2 "só um modo por execução (--check/--ensure/--self-test)"
                fi
                SM_MODE_TAKEN="self-test"; SM_MODE="self-test"
                shift
                ;;
            --language)
                if [ $# -lt 2 ]; then
                    sm_usage; sm_die 2 "--language exige um valor"
                fi
                if ! sm_is_lang "$2"; then
                    sm_usage; sm_die 2 "linguagem fora do enum fechado deste auxiliar (python rust c): $2"
                fi
                SM_ONLY="$2"
                shift 2
                ;;
            --json)
                shift
                ;;
            -h|--help)
                sm_usage
                exit 0
                ;;
            *)
                sm_usage
                sm_die 2 "argumento desconhecido: $1"
                ;;
        esac
    done

    case "$SM_SELF_PATH" in
        */*) : ;;
        *)   SM_SELF_PATH="$(command -v -- "$SM_SELF_PATH" 2>/dev/null || printf '%s' "$SM_SELF_PATH")" ;;
    esac

    if [ "$SM_MODE" = "self-test" ]; then
        if [ -n "$SM_ONLY" ]; then
            sm_die 2 "--self-test cobre as 3 linguagens e não aceita --language"
        fi
        sm_self_test
    fi
    sm_main_run "$SM_MODE" "$SM_ONLY"
}

main "$@"
