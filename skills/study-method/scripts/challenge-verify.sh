#!/usr/bin/env bash
# challenge-verify.sh — o protocolo `validar_teste` (docs/05 §4), executado.
#
# O LLM AUTORA. ESTE SCRIPT JULGA.
# Nenhum veredito daqui sai de opiniao: sai de exit code, de contagem de casos
# executados e de aritmetica sobre um catalogo fixo de mutantes. Ha UMA excecao em
# todo o protocolo — decidir se um mutante sobrevivente e equivalente — e ela nao e
# palpite do script: e o ciclo REQUEST/APPLY do §4.6, com justificativa escrita e
# gravada no manifesto.
#
# Uso:
#   challenge-verify.sh <challenge_dir> [--sample-size N] [--n-rep N]
#                       [--threshold X] [--apply <resposta.json>]
#
# Exit codes (docs/00 §5.1):
#   0   terminou o protocolo — o VEREDITO vai em stdout. `weak` e `rejected` tambem
#       saem 0: reprovar um desafio nao e erro do script.
#   1   erro de execucao (I/O, dependencia ausente, sandbox indisponivel)
#   2   uso incorreto — inclusive resposta de --apply semanticamente recusada
#   3   desafio nao encontrado
#   5   validacao de schema falhou (meta.json, ou a resposta do --apply)
#   10  needs_model_input — o passo 4 achou sobreviventes; o PEDIDO esta em stdout
#       e NADA foi alterado em disco.
#
# stdout (exit 0): {"verdict","mutation_score","killed","survived","rejections"}
# stdout (exit 10): o envelope de PEDIDO do docs/00 §6.1

set -euo pipefail

SM_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SM_LIB_DIR="$SM_SCRIPT_DIR/lib"

# shellcheck source=lib/common.sh
. "$SM_LIB_DIR/common.sh"
# shellcheck source=lib/json.sh
. "$SM_LIB_DIR/json.sh"
# shellcheck source=lib/sandbox.sh
. "$SM_LIB_DIR/sandbox.sh"

readonly CV_PROTOCOL_VERSION="1.0"
readonly CV_OPERATORS_VERSION="1.0"
readonly CV_REQUEST_SCHEMA_VERSION="1.0"
readonly CV_HARNESS="challenge-verify.sh"
readonly CV_KIND="classify_survivor"
readonly CV_RESPONSE_SCHEMA="urn:study-method:schema:challenge-verify-response:1"
readonly CV_MUTATE="$SM_LIB_DIR/_mutate.py"
readonly CV_SCHEMA_MANIFEST="$SM_SCRIPT_DIR/../assets/schemas/challenge-manifest.schema.json"
readonly CV_SCHEMA_REQUEST="$SM_SCRIPT_DIR/../assets/schemas/requests/challenge-verify.request.schema.json"
readonly CV_SCHEMA_RESPONSE="$SM_SCRIPT_DIR/../assets/schemas/requests/challenge-verify.response.schema.json"
readonly CV_DEFAULT_THRESHOLD="0.90"
readonly CV_DEFAULT_NREP=3
readonly CV_MAX_ATTEMPTS=3
readonly CV_BUILD_BUDGET_S=120     # acima disto o passo 4 amostra (docs/05 §4.4)
readonly CV_MIN_JUSTIFICATION=40   # caracteres; docs/05 §4.6 item 4

# ---------------------------------------------------------------- estado
CV_DIR=""; CV_META=""; CV_WORK=""
CV_APPLY_FILE=""; CV_SAMPLE_SIZE=""; CV_NREP="$CV_DEFAULT_NREP"
# Corpo da RESPOSTA aplicada (o objeto do response_schema); `{}` enquanto nao houver uma.
CV_APPLY_NOTES_SRC="{}"
CV_THRESHOLD="$CV_DEFAULT_THRESHOLD"
CV_STUB_SAVED=0
CV_EXIT=0; CV_TESTS_RUN=0; CV_TESTS_FAILED=0; CV_WALL_MS=0; CV_OUTFILE=""
declare -a CV_REJ_CODE=() CV_REJ_MSG=()
declare -a CV_MUT_ID=() CV_MUT_OP=() CV_MUT_LINE=() CV_MUT_BEFORE=() CV_MUT_AFTER=()
declare -a CV_SURV_ID=()
declare -a CV_ALT_REJ=()            # JSON por alternativa reprovada
declare -A CV_CLASS=() CV_JUST=()   # mutant_id -> classificacao / justificativa
declare -A CV_STEP=()               # nome do passo -> status
declare -A CV_STEP_DETAIL=()

# ---------------------------------------------------------------- utilidades
cv_usage() {
  cat >&2 <<'USO'
uso: challenge-verify.sh <challenge_dir> [--sample-size N] [--n-rep N]
                         [--threshold X] [--apply <resposta.json>]
USO
}

cv_reject() {  # <codigo> <mensagem em pt-BR>
  CV_REJ_CODE+=("$1"); shift
  CV_REJ_MSG+=("$*")
  sm_log warn "rejeicao: ${CV_REJ_CODE[-1]}: $*"
}

cv_cleanup() {
  local rc=$?
  # O stub do aluno e restaurado SEMPRE, inclusive em caminho de erro. Perder o
  # trabalho dele por causa de uma validacao seria o pior defeito possivel aqui.
  if [ "$CV_STUB_SAVED" -eq 1 ] && [ -n "$CV_WORK" ] && [ -f "$CV_WORK/stub.orig" ]; then
    cp -f -- "$CV_WORK/stub.orig" "$CV_DIR/$CV_STUB_PATH" 2>/dev/null || true
  fi
  [ -n "$CV_WORK" ] && rm -rf -- "$CV_WORK" 2>/dev/null || true
  return "$rc"
}

cv_jqm() { sm_json_get "$CV_META" "$1"; }

# Percentual/divisao com 4 casas, sem `bc` (que nao e dependencia garantida).
cv_div() { awk -v a="$1" -v b="$2" 'BEGIN{ if (b+0==0) print "0.0000"; else printf "%.4f", a/b }'; }
cv_ge()  { awk -v a="$1" -v b="$2" 'BEGIN{ exit !(a+0 >= b+0) }'; }

# ---------------------------------------------------------------- CLI
cv_parse_args() {
  local -a pos=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --sample-size) [ $# -ge 2 ] || { cv_usage; exit 2; }; CV_SAMPLE_SIZE="$2"; shift 2 ;;
      --n-rep)       [ $# -ge 2 ] || { cv_usage; exit 2; }; CV_NREP="$2"; shift 2 ;;
      --threshold)   [ $# -ge 2 ] || { cv_usage; exit 2; }; CV_THRESHOLD="$2"; shift 2 ;;
      --apply)       [ $# -ge 2 ] || { cv_usage; exit 2; }; CV_APPLY_FILE="$2"; shift 2 ;;
      -h|--help)     cv_usage; exit 0 ;;
      --*)           sm_log error "flag desconhecida: $1"; cv_usage; exit 2 ;;
      *)             pos+=("$1"); shift ;;
    esac
  done
  if [ "${#pos[@]}" -gt 1 ]; then cv_usage; exit 2; fi
  if [ "${#pos[@]}" -eq 1 ]; then CV_DIR="${pos[0]}"; else CV_DIR="$PWD"; fi
  case "$CV_NREP" in ''|*[!0-9]*) sm_log error "--n-rep exige inteiro"; exit 2 ;; esac
  [ "$CV_NREP" -ge 1 ] || { sm_log error "--n-rep minimo 1"; exit 2; }
  if [ -n "$CV_SAMPLE_SIZE" ]; then
    case "$CV_SAMPLE_SIZE" in ''|*[!0-9]*) sm_log error "--sample-size exige inteiro"; exit 2 ;; esac
    [ "$CV_SAMPLE_SIZE" -ge 1 ] || { sm_log error "--sample-size minimo 1"; exit 2; }
  fi
}

# ================================================================ PASSO 0
# Build e sanidade estrutural. Rejeita por `build_failed`.
cv_step_0_build() {
  local ok=1 detail=""

  # 0.1 o manifesto valida contra o schema
  if ! sm_json_validate "$CV_META" "$CV_SCHEMA_MANIFEST"; then
    sm_log error "meta.json nao valida contra challenge-manifest.schema.json"
    exit 5
  fi

  CV_LANG="$(cv_jqm '.language')"
  CV_LAYOUT="$(cv_jqm '.layout_profile')"
  CV_CHALLENGE_ID="$(cv_jqm '.challenge_id')"
  CV_STUB_PATH="$(cv_jqm '.artifacts.stub_path')"
  CV_TEST_PATH="$(cv_jqm '.artifacts.test_path')"
  CV_REF_PATH="$(cv_jqm '.artifacts.reference_path')"
  CV_EMPTY_PATH="$(cv_jqm '.artifacts.empty_stub_path // ""')"
  CV_WORKDIR_REL="$(cv_jqm '.execution.working_dir')"
  CV_TIMEOUT_S="$(cv_jqm '.execution.timeout_seconds')"
  CV_EXPECTED="$(cv_jqm '.execution.expected_test_count')"
  CV_PROBE="$(cv_jqm '.execution.test_count_probe')"
  CV_SCEN_COUNT="$(cv_jqm '.scenarios | length')"
  CV_ATTEMPTS="$(cv_jqm '.validation.generation_attempts // 0')"
  CV_WORKDIR="$CV_DIR/$CV_WORKDIR_REL"

  mapfile -t CV_TEST_CMD < <(sm_json_get "$CV_META" '.execution.test_command[]')
  mapfile -t CV_BUILD_CMD < <(sm_json_get "$CV_META" '.execution.build_command[]? // empty')
  mapfile -t CV_ALT_PATHS < <(sm_json_get "$CV_META" '.artifacts.reference_alt_paths[]? // empty')
  mapfile -t CV_MANIFEST_PATHS < <(sm_json_get "$CV_META" '.artifacts.manifest_paths[]? // empty')
  mapfile -t CV_SCEN_NAMES < <(sm_json_get "$CV_META" '.scenarios[].test_name')

  # 0.2 todo caminho declarado existe
  local p
  for p in "$CV_STUB_PATH" "$CV_TEST_PATH" "$CV_REF_PATH" "$(cv_jqm '.artifacts.runner_path')" \
           "$(cv_jqm '.artifacts.statement_path')"; do
    [ -e "$CV_DIR/$p" ] || { ok=0; detail+="caminho declarado nao existe: $p. "; }
  done
  if [ -n "$CV_EMPTY_PATH" ]; then
    [ -e "$CV_DIR/$CV_EMPTY_PATH" ] || { ok=0; detail+="empty_stub_path nao existe: $CV_EMPTY_PATH. "; }
  else
    ok=0; detail+="artifacts.empty_stub_path ausente: sem ele o passo 1 nao tem contra o que rodar. "
  fi
  for p in "${CV_ALT_PATHS[@]}"; do
    [ -e "$CV_DIR/$p" ] || { ok=0; detail+="alternativa declarada nao existe: $p. "; }
  done
  [ -d "$CV_WORKDIR" ] || { ok=0; detail+="execution.working_dir nao existe: $CV_WORKDIR_REL. "; }

  # 0.3 len(scenarios) == expected_test_count
  if [ "$CV_SCEN_COUNT" -ne "$CV_EXPECTED" ]; then
    ok=0
    detail+="len(scenarios)=$CV_SCEN_COUNT diverge de execution.expected_test_count=$CV_EXPECTED. "
  fi

  # 0.4 layout_profile exigido pela linguagem (docs/05 §2.3)
  local exigido; exigido="$(cv_layout_for_language "$CV_LANG")"
  if [ "$exigido" != "$CV_LAYOUT" ]; then
    ok=0; detail+="layout_profile '$CV_LAYOUT' e errado para $CV_LANG; o exigido e '$exigido'. "
  fi
  local req_manifest; req_manifest="$(cv_manifest_for_layout "$CV_LAYOUT")"
  if [ -n "$req_manifest" ] && [ ! -e "$CV_DIR/$req_manifest" ]; then
    ok=0; detail+="layout $CV_LAYOUT exige $req_manifest na raiz do desafio. "
  fi

  # `none` nunca chega ao aluno (docs/05 §3.1)
  if [ "$CV_PROBE" = "none" ]; then
    ok=0; detail+="test_count_probe 'none' e proibido em desafio entregue: sem contagem nao ha como provar que algum caso rodou. "
  fi

  # 0.5 o stub VAZIO precisa compilar
  if [ "$ok" -eq 1 ] && [ "${#CV_BUILD_CMD[@]}" -gt 0 ] && [ -n "$CV_EMPTY_PATH" ]; then
    cv_install "$CV_DIR/$CV_EMPTY_PATH"
    local rc=0; cv_run_build || rc=$?
    if [ "$rc" -ne 0 ]; then
      ok=0; detail+="o stub vazio nao compila (build_command saiu $rc). "
    fi
  fi

  if [ "$ok" -eq 1 ]; then
    CV_STEP[step_0_build]="passed"
    CV_STEP_DETAIL[step_0_build]="Schema valido, ${CV_SCEN_COUNT} cenarios batendo com expected_test_count, layout ${CV_LAYOUT} correto para ${CV_LANG}."
  else
    CV_STEP[step_0_build]="failed"
    CV_STEP_DETAIL[step_0_build]="$detail"
    cv_reject build_failed "$detail"
  fi
}

cv_layout_for_language() {
  case "$1" in
    go)                 echo go_module ;;
    rust)               echo cargo_crate ;;
    java|kotlin)        echo java_classfile ;;
    csharp)             echo dotnet_project ;;
    elixir)             echo mix_project ;;
    swift)              echo swiftpm ;;
    julia)              echo julia_project ;;
    haskell)            echo cabal_project ;;
    *)                  echo generic ;;
  esac
}

cv_manifest_for_layout() {
  case "$1" in
    go_module)       echo go.mod ;;
    cargo_crate)     echo Cargo.toml ;;
    mix_project)     echo mix.exs ;;
    julia_project)   echo Project.toml ;;
    *)               echo "" ;;
  esac
}

# ================================================================ executar()
# A funcao UNICA por onde passa toda execucao de teste do protocolo.
# (a) instala a implementacao no stub_path · (b) limpa cache de bytecode ·
# (c) roda o build · (d) roda o test_command como ARGV, sem shell, dentro de
# sm_sandbox_run · (e) extrai a contagem pelo test_count_probe.

cv_install() {  # <arquivo de implementacao>
  cp -f -- "$1" "$CV_DIR/$CV_STUB_PATH"
}

# docs/05 §4.5 — o achado que decide entre aprovar e reprovar um teste fraco.
# O CPython invalida o .pyc por (mtime, tamanho) com granularidade de 1 SEGUNDO.
# Mutantes de troca de operador tem o MESMO tamanho do original e sao escritos em
# sucessao rapida: sem esta limpeza eles rodam o bytecode do mutante anterior e o
# kill loop reporta 100% falso.
cv_purge_bytecode() {
  find "$CV_DIR" -type d -name '__pycache__' -prune -exec rm -rf -- {} + 2>/dev/null || true
  find "$CV_DIR" -type f -name '*.pyc' -delete 2>/dev/null || true
  find "$CV_DIR" -type d -name '.pytest_cache' -prune -exec rm -rf -- {} + 2>/dev/null || true
}

cv_export_env() {  # <LC_ALL> <TZ> <PYTHONHASHSEED>
  export LC_ALL="$1" LANG="$1" TZ="$2" PYTHONHASHSEED="$3"
  export PYTHONDONTWRITEBYTECODE=1
  export NODE_COMPILE_CACHE=""
  export CHALLENGE_TIMEOUT="${CV_TIMEOUT_S:-15}"
  export CHALLENGE_EXPECTED_TESTS="${CV_EXPECTED:-0}"
  export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1700000000}"
  local kv
  while IFS= read -r kv; do
    [ -n "$kv" ] && export "${kv?}"
  done < <(sm_json_get "$CV_META" '.execution.env // {} | to_entries[] | "\(.key)=\(.value)"')
}

# Forca `-B` no interpretador Python: a protecao nao pode depender do que o
# challenge-new.sh escreveu no test_command.
cv_harden_argv() {
  local -n _sm_out="$1"; shift
  local -a _cmd=("$@")
  case "${_cmd[0]:-}" in
    python3|python|python3.*|*/python3|*/python)
      local _has_b=nao _a
      for _a in "${_cmd[@]}"; do [ "$_a" = "-B" ] && _has_b=sim; done
      if [ "$_has_b" = nao ]; then
        _sm_out=("${_cmd[0]}" "-B" "${_cmd[@]:1}")
        return 0
      fi
      ;;
  esac
  _sm_out=("${_cmd[@]}")
}

cv_run_build() {
  [ "${#CV_BUILD_CMD[@]}" -gt 0 ] || return 0
  local -a _bargv; cv_harden_argv _bargv "${CV_BUILD_CMD[@]}"
  local rc=0
  sm_sandbox_run "$CV_WORKDIR" -- "${_bargv[@]}" >"$CV_WORK/build.log" 2>&1 || rc=$?
  return "$rc"
}

cv_execute() {  # <implementacao> [--names]
  local impl="$1"; shift
  local want_names=0
  [ "${1:-}" = "--names" ] && want_names=1

  cv_install "$impl"
  cv_purge_bytecode

  local -a _targv; cv_harden_argv _targv "${CV_TEST_CMD[@]}"
  if [ "$want_names" -eq 1 ] && [ "$CV_PROBE" = "python_unittest_ran_line" ]; then
    _targv+=("-v")
  fi

  CV_OUTFILE="$CV_WORK/run.out"
  : >"$CV_OUTFILE"

  local rc=0
  if [ "${#CV_BUILD_CMD[@]}" -gt 0 ]; then
    cv_run_build || { CV_EXIT=$?; CV_TESTS_RUN=0; CV_TESTS_FAILED=0; CV_WALL_MS=0
                      cat "$CV_WORK/build.log" >>"$CV_OUTFILE" 2>/dev/null || true
                      return 0; }
  fi

  local t0 t1
  t0=$(date +%s%N)
  sm_sandbox_run "$CV_WORKDIR" -- "${_targv[@]}" >"$CV_OUTFILE" 2>&1 || rc=$?
  t1=$(date +%s%N)

  CV_EXIT="$rc"
  CV_WALL_MS=$(( (t1 - t0) / 1000000 ))
  cv_probe_counts "$CV_OUTFILE"
}

# ---------------------------------------------------------------- probes
# Invariante dos probes: com `set -o pipefail`, um grep que nao casa derruba a
# pipeline inteira e o script morre com stderr vazio. Toda pipeline abaixo
# devolve valor NEUTRO (contagem 0 / lista vazia) quando nada casa.
cv_probe_counts() {  # <arquivo de saida> -> CV_TESTS_RUN / CV_TESTS_FAILED
  local f="$1" n="" fl=""
  case "$CV_PROBE" in
    python_unittest_ran_line)
      n="$(grep -Eo '^Ran [0-9]+ tests?' "$f" | tail -1 | grep -Eo '[0-9]+' || true)"
      if grep -qE '^OK([[:space:]]|$)' "$f"; then
        fl=0
      else
        fl="$(grep -Eo '(failures|errors)=[0-9]+' "$f" \
              | grep -Eo '[0-9]+' | awk '{s+=$1} END{print s+0}' || true)"
      fi
      ;;
    node_test_tap_summary)
      n="$(grep -Eo '^# tests [0-9]+' "$f" | tail -1 | grep -Eo '[0-9]+' || true)"
      fl="$(grep -Eo '^# fail [0-9]+' "$f" | tail -1 | grep -Eo '[0-9]+' || true)"
      ;;
    go_test_json_run_events)
      n="$(grep -o '"Action":"run"[^}]*"Test":"[^"]*"' "$f" \
           | grep -o '"Test":"[^"]*"' | sort -u | wc -l || true)"
      fl="$(grep -o '"Action":"fail"[^}]*"Test":"[^"]*"' "$f" \
           | grep -o '"Test":"[^"]*"' | sort -u | wc -l || true)"
      ;;
    cargo_test_running_lines)
      n="$(grep -Eo '^running [0-9]+ tests?' "$f" | grep -Eo '[0-9]+' | awk '{s+=$1} END{print s+0}' || true)"
      fl="$(grep -Eo '[0-9]+ failed' "$f" | grep -Eo '[0-9]+' | awk '{s+=$1} END{print s+0}' || true)"
      ;;
    junit_console_summary)
      n="$(grep -Eo '[0-9]+ tests successful' "$f" | grep -Eo '^[0-9]+' | tail -1 || true)"
      fl="$(grep -Eo '[0-9]+ tests failed' "$f" | grep -Eo '^[0-9]+' | tail -1 || true)"
      ;;
    counter_protocol)
      n="$(grep -Eo '^TESTS_RUN=[0-9]+' "$f" | tail -1 | grep -Eo '[0-9]+' || true)"
      fl="$(grep -Eo '^TESTS_FAILED=[0-9]+' "$f" | tail -1 | grep -Eo '[0-9]+' || true)"
      ;;
    *) n=0; fl=0 ;;
  esac
  CV_TESTS_RUN="${n:-0}"; CV_TESTS_FAILED="${fl:-0}"
}

# Devolve o nome CURTO de cada caso, que e exatamente o que `scenarios[].test_name`
# guarda (challenge-manifest.schema.json: "como o runner o reporta"). O caminho
# qualificado so existe como FILTRO de execucao unica, dentro do runner.sh.
cv_probe_names() {  # <arquivo de saida> -> um nome por linha em stdout
  local f="$1"
  case "$CV_PROBE" in
    python_unittest_ran_line)
      # `test_x (tests.test_stub.TestStub.test_x)`, com ou sem ` ... ok` no fim da mesma
      # linha (o unittest quebra em duas linhas quando o caso tem docstring). Exigir o
      # caminho PONTUADO dentro dos parenteses e o que impede que `Traceback (most recent
      # call last):`, `FAILED (errors=2)` ou uma docstring como "derivada (numerica) ..."
      # entrem na lista como se fossem casos executados.
      grep -Eo '^[A-Za-z_][A-Za-z0-9_]* \([A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+\)' "$f" \
        | sed -E 's/ \(.*$//' | sort -u || true ;;
    node_test_tap_summary)
      grep -E '^(not )?ok [0-9]+ - ' "$f" | sed -E 's/^(not )?ok [0-9]+ - //' | sort -u || true ;;
    go_test_json_run_events)
      grep -o '"Action":"run"[^}]*"Test":"[^"]*"' "$f" \
        | grep -o '"Test":"[^"]*"' | sed 's/"Test":"//; s/"$//' | sort -u || true ;;
    cargo_test_running_lines)
      grep -Eo '^test [^ ]+ \.\.\.' "$f" | awk '{print $2}' | sort -u || true ;;
    *) : ;;
  esac
}

# ================================================================ PASSO 1
# O teste DEVE FALHAR contra o stub vazio. Sozinho, este passo elimina a classe
# inteira de assercoes vazias (`assert x is not None`).
cv_step_1_empty_stub() {
  cv_execute "$CV_DIR/$CV_EMPTY_PATH"
  local run="$CV_TESTS_RUN" failed="$CV_TESTS_FAILED" ec="$CV_EXIT"
  CV_S1_RUN="$run"; CV_S1_FAILED="$failed"; CV_S1_EXIT="$ec"

  if [ "$run" -eq 0 ]; then
    CV_STEP[step_1_empty_stub]="failed"
    CV_STEP_DETAIL[step_1_empty_stub]="Nenhum caso executou contra o stub vazio (exit=$ec)."
    cv_reject zero_tests_executed \
      "Contra o stub vazio o runner executou 0 casos (esperados $CV_EXPECTED). 'Passou' sem asserção avaliada é o pior falso positivo do produto."
    return
  fi
  if [ "$run" -ne "$CV_EXPECTED" ]; then
    CV_STEP[step_1_empty_stub]="failed"
    CV_STEP_DETAIL[step_1_empty_stub]="tests_run=$run != expected=$CV_EXPECTED."
    cv_reject test_count_mismatch \
      "Contra o stub vazio rodaram $run casos, mas expected_test_count é $CV_EXPECTED."
    return
  fi
  if [ "$ec" -eq 0 ]; then
    CV_STEP[step_1_empty_stub]="failed"
    CV_STEP_DETAIL[step_1_empty_stub]="O teste passou com o stub VAZIO (exit=0, $run casos)."
    cv_reject passes_on_empty_stub \
      "O teste passou contra o stub vazio: ele é tautológico. Alguma asserção verifica presença em vez de valor (assertIsNotNone, isinstance, Array.isArray)."
    return
  fi
  if [ "$failed" -lt 1 ]; then
    CV_STEP[step_1_empty_stub]="failed"
    CV_STEP_DETAIL[step_1_empty_stub]="exit=$ec mas nenhum caso reportado como falho: o teste nem carregou."
    cv_reject test_malformed \
      "O runner saiu $ec sem reportar nenhum caso falho: o arquivo de teste não carregou (erro de import ou de sintaxe)."
    return
  fi
  CV_STEP[step_1_empty_stub]="passed"
  CV_STEP_DETAIL[step_1_empty_stub]="Falhou contra o stub vazio como exigido: $run casos executados, $failed falhos, exit=$ec."
}

# ================================================================ PASSO 2
# O teste DEVE PASSAR contra a referencia. Vermelho aqui e o teste IMPOSSIVEL —
# o modo de falha mais destrutivo pedagogicamente.
cv_step_2_reference() {
  cv_execute "$CV_DIR/$CV_REF_PATH"
  local run="$CV_TESTS_RUN" failed="$CV_TESTS_FAILED" ec="$CV_EXIT" ms="$CV_WALL_MS"
  CV_S2_RUN="$run"; CV_S2_FAILED="$failed"; CV_S2_EXIT="$ec"

  if [ "$ms" -ge $(( CV_TIMEOUT_S * 1000 )) ]; then
    CV_STEP[step_2_reference]="failed"
    CV_STEP_DETAIL[step_2_reference]="Estourou o tempo: ${ms}ms >= ${CV_TIMEOUT_S}s."
    cv_reject timeout_on_reference \
      "O teste estourou ${CV_TIMEOUT_S}s rodando contra a própria referência (${ms}ms). O veredito de timeout vem do tempo decorrido, nunca do exit code."
    return
  fi
  if [ "$run" -ne "$CV_EXPECTED" ]; then
    CV_STEP[step_2_reference]="failed"
    CV_STEP_DETAIL[step_2_reference]="tests_run=$run != expected=$CV_EXPECTED."
    cv_reject test_count_mismatch \
      "Contra a referência rodaram $run casos, mas expected_test_count é $CV_EXPECTED."
    return
  fi
  if [ "$ec" -ne 0 ] || [ "$failed" -ne 0 ]; then
    CV_STEP[step_2_reference]="failed"
    CV_STEP_DETAIL[step_2_reference]="exit=$ec, $failed casos falhos contra a referência correta."
    cv_reject fails_on_reference \
      "O teste falha contra a implementação de referência ($failed casos, exit=$ec). É um teste impossível: o aluno 'corrigiria' um código já correto até quebrá-lo."
    return
  fi
  CV_STEP[step_2_reference]="passed"
  CV_STEP_DETAIL[step_2_reference]="Passou contra a referência: $run casos, exit=0, ${ms}ms (limite ${CV_TIMEOUT_S}s)."
}

# ================================================================ PASSO 3
# ⭐ O teste DEVE ACEITAR referencias alternativas CORRETAS.
# Este e o passo que detecta over-specification POR EXECUCAO, e nao por opiniao:
# em vez de pedir a um segundo modelo que "perceba" o acoplamento, roda-se o teste
# contra uma implementacao comprovadamente correta e estruturalmente diferente.
# Resposta binaria, sem alucinacao possivel.
cv_step_3_alternatives() {
  CV_ALT_RUN=0
  if [ "${#CV_ALT_PATHS[@]}" -eq 0 ]; then
    CV_STEP[step_3_alternatives]="not_applicable"
    CV_STEP_DETAIL[step_3_alternatives]="Nenhuma referência alternativa declarada em artifacts.reference_alt_paths. Omissão registrada não é aprovação silenciosa: se o desafio admite mais de uma estratégia idiomática, o mínimo são 2 alternativas."
    return
  fi
  local alt rejected=0
  for alt in "${CV_ALT_PATHS[@]}"; do
    cv_execute "$CV_DIR/$alt" --names
    CV_ALT_RUN=$(( CV_ALT_RUN + 1 ))
    if [ "$CV_EXIT" -ne 0 ] || [ "$CV_TESTS_FAILED" -ne 0 ] || [ "$CV_TESTS_RUN" -ne "$CV_EXPECTED" ]; then
      rejected=1
      local -a names=()
      mapfile -t names < <(cv_failing_names "$CV_OUTFILE")
      CV_ALT_REJ+=("$(jq -cn --arg p "$alt" --argjson n "$(printf '%s\n' "${names[@]:-}" \
          | jq -R . | jq -sc 'map(select(length>0))')" \
          '{path:$p, failing_test_names:$n, resolution:"unresolved"}')")
      cv_reject rejects_correct_alternative \
        "A alternativa correta $alt foi reprovada pelo teste (exit=$CV_EXIT, $CV_TESTS_FAILED casos falhos). O teste está acoplado a UMA implementação: ou a asserção culpada é isolável e deve ser afrouxada, ou o teste inteiro é regenerado. 'unresolved' é incompatível com approved."
    fi
  done
  if [ "$rejected" -eq 1 ]; then
    CV_STEP[step_3_alternatives]="failed"
    CV_STEP_DETAIL[step_3_alternatives]="$CV_ALT_RUN alternativas executadas, ${#CV_ALT_REJ[@]} reprovadas — evidência de over-specification."
  else
    CV_STEP[step_3_alternatives]="passed"
    CV_STEP_DETAIL[step_3_alternatives]="$CV_ALT_RUN alternativas corretas e estruturalmente diferentes foram aceitas pelo teste."
  fi
}

cv_failing_names() {  # <saida> -> nomes dos casos que falharam
  local f="$1"
  case "$CV_PROBE" in
    python_unittest_ran_line)
      grep -Eo '^(FAIL|ERROR): [A-Za-z_][A-Za-z0-9_]*' "$f" | awk '{print $2}' | sort -u || true ;;
    node_test_tap_summary)
      grep -E '^not ok [0-9]+ - ' "$f" | sed -E 's/^not ok [0-9]+ - //' | sort -u || true ;;
    go_test_json_run_events)
      grep -o '"Action":"fail"[^}]*"Test":"[^"]*"' "$f" \
        | grep -o '"Test":"[^"]*"' | sed 's/"Test":"//; s/"$//' | sort -u || true ;;
    cargo_test_running_lines)
      grep -Eo '^test [^ ]+ \.\.\. FAILED' "$f" | awk '{print $2}' | sort -u || true ;;
    *) : ;;
  esac
}

# ================================================================ PASSO 4
# ⭐ O teste DEVE MATAR o catalogo FIXO de mutantes.
# Os mutantes NUNCA sao pedidos a um modelo: o mesmo vies que gerou o teste geraria
# os mutantes, e o score subiria sem que a suite tivesse melhorado.
cv_step_4_mutation() {
  CV_MUT_GENERATED=0; CV_MUT_VALID=0; CV_MUT_INVALID=0; CV_MUT_KILLED=0; CV_MUT_SURVIVED=0
  CV_MUT_SCORE_BRUTO="0.0000"; CV_MUT_SCORE="0.0000"; CV_MUT_EQUIV=0; CV_MUT_SAMPLE=0; CV_MUT_LIMIT=0; CV_MUT_SAMPLED=0; CV_SAMPLE_REASON=""
  CV_MUT_DETAIL=""

  local catalog="$CV_WORK/catalog.json"
  if ! python3 "$CV_MUTATE" list "$CV_DIR/$CV_REF_PATH" --language "$CV_LANG" --json >"$catalog" 2>"$CV_WORK/mutate.err"; then
    sm_log error "motor de mutação falhou: $(cat "$CV_WORK/mutate.err")"
    CV_STEP[step_4_mutation]="failed"
    CV_STEP_DETAIL[step_4_mutation]="O motor de mutação não conseguiu processar a referência."
    cv_reject build_failed "O catálogo fixo não pôde ser gerado sobre $CV_REF_PATH."
    return
  fi

  mapfile -t CV_MUT_ID    < <(jq -r '.mutants[].mutant_id' "$catalog")
  mapfile -t CV_MUT_OP    < <(jq -r '.mutants[].operator'  "$catalog")
  mapfile -t CV_MUT_LINE  < <(jq -r '.mutants[].line'      "$catalog")
  mapfile -t CV_MUT_BEFORE< <(jq -r '.mutants[].before'    "$catalog")
  mapfile -t CV_MUT_AFTER < <(jq -r '.mutants[].after'     "$catalog")
  CV_MUT_GENERATED="${#CV_MUT_ID[@]}"

  if [ "$CV_MUT_GENERATED" -eq 0 ]; then
    CV_STEP[step_4_mutation]="failed"
    CV_STEP_DETAIL[step_4_mutation]="O catálogo fixo não gerou nenhum mutante."
    cv_reject build_failed \
      "O catálogo fixo v$CV_OPERATORS_VERSION não gerou nenhum mutante sobre a referência: ela é trivial demais para sustentar um desafio."
    return
  fi

  # Amostragem: os PRIMEIROS da ordem canonica, nunca sorteados — senao o score
  # deixa de ser comparavel entre tentativas de regeneracao.
  local limit="$CV_MUT_GENERATED" auto_reason=""
  if [ -n "$CV_SAMPLE_SIZE" ] && [ "$CV_SAMPLE_SIZE" -lt "$limit" ]; then
    limit="$CV_SAMPLE_SIZE"
    auto_reason="amostragem pedida por --sample-size"
  elif [ "${#CV_BUILD_CMD[@]}" -gt 0 ]; then
    local probe_ms; probe_ms=$(( CV_S2_MS_HINT > 0 ? CV_S2_MS_HINT : 1 ))
    local total_s=$(( CV_MUT_GENERATED * probe_ms / 1000 ))
    if [ "$total_s" -gt "$CV_BUILD_BUDGET_S" ]; then
      limit=$(( CV_BUILD_BUDGET_S * 1000 / probe_ms ))
      [ "$limit" -lt 1 ] && limit=1
      auto_reason="linguagem compilada: ${CV_MUT_GENERATED} mutantes × ${probe_ms}ms passariam de ${CV_BUILD_BUDGET_S}s"
    fi
  fi
  [ "$limit" -gt "$CV_MUT_GENERATED" ] && limit="$CV_MUT_GENERATED"
  CV_MUT_LIMIT="$limit"
  CV_MUT_SAMPLED=0
  [ "$limit" -lt "$CV_MUT_GENERATED" ] && CV_MUT_SAMPLED=1
  CV_SAMPLE_REASON="$auto_reason"

  local i mid mutsrc rc
  for (( i = 0; i < CV_MUT_LIMIT; i++ )); do
    mid="${CV_MUT_ID[$i]}"
    mutsrc="$CV_WORK/mutant.src"
    if ! python3 "$CV_MUTATE" apply "$CV_DIR/$CV_REF_PATH" "$mid" --language "$CV_LANG" >"$mutsrc" 2>/dev/null; then
      CV_MUT_INVALID=$(( CV_MUT_INVALID + 1 )); continue
    fi
    cv_execute "$mutsrc"
    rc="$CV_EXIT"
    if [ "$CV_TESTS_RUN" -ne "$CV_EXPECTED" ]; then
      # Nao compilou / nao carregou / contagem divergente: INVALIDO. Nao entra no
      # denominador e nao conta como morto — conta-lo como morto inflaria o score
      # exatamente onde ele deveria doer.
      CV_MUT_INVALID=$(( CV_MUT_INVALID + 1 ))
    elif [ "$rc" -ne 0 ]; then
      CV_MUT_KILLED=$(( CV_MUT_KILLED + 1 ))
    else
      CV_MUT_SURVIVED=$(( CV_MUT_SURVIVED + 1 ))
      CV_SURV_ID+=("$mid")
    fi
  done
  CV_MUT_VALID=$(( CV_MUT_KILLED + CV_MUT_SURVIVED ))

  if [ "$CV_MUT_VALID" -eq 0 ]; then
    CV_STEP[step_4_mutation]="failed"
    CV_STEP_DETAIL[step_4_mutation]="Zero mutantes válidos entre os $CV_MUT_GENERATED gerados."
    cv_reject build_failed \
      "Nenhum dos $CV_MUT_GENERATED mutantes do catálogo fixo foi válido. Uma referência que nenhuma mutação mecânica altera não sustenta um desafio."
    return
  fi
  CV_MUT_SCORE_BRUTO="$(cv_div "$CV_MUT_KILLED" "$CV_MUT_VALID")"
}

# ---------------------------------------------------------------- REQUEST
# ⭐ A UNICA etapa em que o modelo opina — e opina sobre um diff de UMA linha.
# Um sobrevivente tem exatamente duas explicacoes: `test_gap` (falta um cenario) ou
# `equivalent` (nenhum teste poderia mata-lo). Decidir entre as duas e julgamento, e
# script de shell NAO conversa com modelo. Entao: PEDIDO em stdout, exit 10, NADA
# em disco. Ninguem encontra estado meio-validado depois.
cv_build_request_payload() {
  local survivors="[]" i mid idx
  for mid in "${CV_SURV_ID[@]}"; do
    idx=-1
    for i in "${!CV_MUT_ID[@]}"; do [ "${CV_MUT_ID[$i]}" = "$mid" ] && { idx="$i"; break; }; done
    [ "$idx" -lt 0 ] && continue
    survivors="$(jq -c \
      --arg id "$mid" --arg op "${CV_MUT_OP[$idx]}" --arg f "$CV_REF_PATH" \
      --argjson ln "${CV_MUT_LINE[$idx]}" \
      --arg b "${CV_MUT_BEFORE[$idx]}" --arg a "${CV_MUT_AFTER[$idx]}" \
      '. + [{mutant_id:$id, operator:$op, file:$f, line:$ln, before:$b, after:$a,
             context:null, covered_by_tests:null}]' <<<"$survivors")"
  done
  local excerpt; excerpt="$(head -c 8000 -- "$CV_DIR/$CV_REF_PATH")"
  jq -cn \
    --arg sv "$CV_REQUEST_SCHEMA_VERSION" \
    --arg cid "$CV_CHALLENGE_ID" \
    --arg lang "$CV_LANG" \
    --arg ov "$CV_OPERATORS_VERSION" \
    --argjson score "$CV_MUT_SCORE_BRUTO" \
    --argjson thr "$CV_THRESHOLD" \
    --argjson valid "$CV_MUT_VALID" \
    --argjson surv "$CV_MUT_SURVIVED" \
    --arg exc "$excerpt" \
    --argjson survivors "$survivors" \
    '{schema_version:$sv, request_kind:"challenge_verify", challenge_id:$cid,
      response_path:null, language:$lang, operators_version:$ov,
      score:$score, threshold:$thr, valid:$valid, survived:$surv,
      reference_excerpt:$exc, survivors:$survivors}'
}

# `sm_request` calcula o request_id do sha256 do payload canonico. O payload NAO
# carrega `generated_at` de proposito: se carregasse, o id mudaria a cada segundo e
# o `--apply` nunca reconheceria o proprio pedido. O carimbo vive no envelope, e o
# script o injeta no payload so na hora de imprimir — para que o objeto impresso
# valide contra challenge-verify.request.schema.json.
cv_emit_request() {
  local payload; payload="$(cv_build_request_payload)"
  local instr
  instr="Classifique CADA mutante sobrevivente como 'equivalent' (comportamentalmente identico a referencia para toda entrada valida — nenhum teste poderia mata-lo) ou 'not_equivalent' (existe entrada que distingue: e um buraco no teste). A justificativa e OBRIGATORIA e tem no minimo ${CV_MIN_JUSTIFICATION} caracteres. Na duvida responda not_equivalent: classificar como equivalent o que e buraco entrega ao aluno um teste que aprova codigo errado."
  local env rc=0
  env="$(sm_request "$CV_HARNESS" "$CV_KIND" "$CV_RESPONSE_SCHEMA" "$instr" "$payload")" || rc=$?
  if [ "$rc" -ne 10 ]; then
    sm_log error "sm_request devolveu $rc; esperado 10"
    exit 1
  fi
  jq -c '.payload = (.payload + {generated_at: .generated_at})' <<<"$env"
  exit 10
}

cv_request_id() {
  local payload; payload="$(cv_build_request_payload)"
  local env rc=0
  env="$(sm_request "$CV_HARNESS" "$CV_KIND" "$CV_RESPONSE_SCHEMA" "-" "$payload")" || rc=$?
  [ "$rc" -eq 10 ] || { sm_log error "sm_request devolveu $rc; esperado 10"; exit 1; }
  jq -r '.request_id' <<<"$env"
}

# ---------------------------------------------------------------- APPLY
# O script recusa resposta malformada, incompleta, ou que fale de mutantes que ele
# nao pediu. O modelo nao consegue aprovar nada por acidente de formato.
cv_apply_response() {
  local file="$CV_APPLY_FILE"
  [ -r "$file" ] || { sm_log error "resposta ilegível: $file"; exit 2; }
  sm_json_ok "$file" || { sm_log error "resposta não é JSON válido: $file"; exit 5; }

  local expected_id; expected_id="$(cv_request_id)"
  local items=""

  if [ "$(jq -r 'has("protocol")' "$file")" = "true" ]; then
    # Forma ENVELOPE (docs/00 §6.2): sm_apply_read confere protocol,
    # protocol_version, kind, request_id E o response_schema (RA-3, §7.2).
    # Divergiu -> exit 5, nada e aplicado.
    local rc=0 envelope=""
    envelope="$(sm_apply_read "$file" "$CV_KIND" "$expected_id")" || rc=$?
    if [ "$rc" -ne 0 ]; then
      sm_log error "sm_apply_read recusou a resposta (código $rc). Envelope, kind, request_id ou o response_schema divergem: o estado em disco mudou entre o pedido e o --apply, a resposta é de outro pedido, ou o corpo não valida."
      exit "$rc"
    fi
    # RESP-1: `items[0]` E o objeto de challenge-verify.response.schema.json — nao a lista
    # de classificacoes. Ler `items` como se fosse `.classifications` (o que este ramo
    # fazia) so funcionava com uma RESPOSTA que o proprio response_schema recusa.
    local body; body="$(jq -c '.[0] // {}' <<<"$envelope")"
    local rk cid
    rk="$(jq -r '.request_kind // ""' <<<"$body")"
    cid="$(jq -r '.challenge_id // ""' <<<"$body")"
    [ "$rk" = "challenge_verify" ] || { sm_log error "request_kind divergente: $rk"; exit 5; }
    [ "$cid" = "$CV_CHALLENGE_ID" ] || {
      sm_log error "challenge_id da resposta ($cid) não é o do desafio ($CV_CHALLENGE_ID)"; exit 5; }
    items="$(jq -c '.classifications // []' <<<"$body")"
    CV_APPLY_NOTES_SRC="$body"
  else
    # Forma NATIVA: instancia direta de challenge-verify.response.schema.json.
    sm_json_validate "$file" "$CV_SCHEMA_RESPONSE" || {
      sm_log error "a resposta não valida contra challenge-verify.response.schema.json"; exit 5; }
    local rk cid
    rk="$(sm_json_get "$file" '.request_kind')"
    cid="$(sm_json_get "$file" '.challenge_id')"
    [ "$rk" = "challenge_verify" ] || { sm_log error "request_kind divergente: $rk"; exit 5; }
    [ "$cid" = "$CV_CHALLENGE_ID" ] || {
      sm_log error "challenge_id da resposta ($cid) não é o do desafio ($CV_CHALLENGE_ID)"; exit 5; }
    items="$(sm_json_get_raw "$file" '.classifications')"
    CV_APPLY_NOTES_SRC="$(jq -c '.' "$file")"
  fi

  # ---- validacao semantica, a que o schema nao expressa ----
  local -a resp_ids=()
  mapfile -t resp_ids < <(jq -r '.[].mutant_id' <<<"$items")

  local mid found r
  # 3. cobertura EXATA: nem a mais (mutante inventado), nem a menos (sem veredito)
  for mid in "${CV_SURV_ID[@]}"; do
    found=nao
    for r in "${resp_ids[@]}"; do [ "$r" = "$mid" ] && found=sim; done
    [ "$found" = sim ] || { sm_log error "sobrevivente sem classificação na resposta: $mid"; exit 2; }
  done
  for r in "${resp_ids[@]}"; do
    found=nao
    for mid in "${CV_SURV_ID[@]}"; do [ "$r" = "$mid" ] && found=sim; done
    [ "$found" = sim ] || { sm_log error "a resposta classifica um mutante que não foi pedido: $r"; exit 2; }
  done

  local n; n="$(jq 'length' <<<"$items")"
  local k cls just
  for (( k = 0; k < n; k++ )); do
    mid="$(jq -r ".[$k].mutant_id" <<<"$items")"
    cls="$(jq -r ".[$k].classification // \"\"" <<<"$items")"
    just="$(jq -r ".[$k].justification // \"\"" <<<"$items")"
    case "$cls" in
      equivalent) ;;
      not_equivalent|test_gap) cls="test_gap" ;;
      unclassified) cls="test_gap" ;;   # o lado conservador
      *) sm_log error "classification inválida para $mid: '$cls'"; exit 2 ;;
    esac
    # 4. a justificativa e o que torna a decisao auditavel; sem ela nao ha auditoria
    if [ -z "$just" ]; then
      sm_log error "classificação de $mid sem justification: a justificativa é obrigatória, é ela que permite alguém reler e discordar."
      exit 2
    fi
    if [ "$cls" = "equivalent" ] && [ "${#just}" -lt "$CV_MIN_JUSTIFICATION" ]; then
      sm_log error "justification de $mid tem ${#just} caracteres; o mínimo para 'equivalent' é $CV_MIN_JUSTIFICATION. Uma justificativa que não explica nada não é auditoria."
      exit 2
    fi
    CV_CLASS["$mid"]="$cls"
    CV_JUST["$mid"]="$just"
  done
  # `notes` e observacao geral do modelo sobre a rodada; vai para mutation.detail.
  # Sai do CORPO da resposta (o objeto do response_schema), nao da raiz do arquivo: na
  # forma envelope o `notes` mora em `items[0]`, e ler a raiz devolvia sempre vazio.
  CV_APPLY_NOTES="$(jq -r '.notes // ""' <<<"$CV_APPLY_NOTES_SRC" 2>/dev/null || true)"
  sm_log info "classificações aplicadas: $n sobreviventes"
}

# ---------------------------------------------------------------- score final
cv_close_mutation_score() {
  local mid
  CV_MUT_EQUIV=0
  for mid in "${CV_SURV_ID[@]}"; do
    [ "${CV_CLASS[$mid]:-unclassified}" = "equivalent" ] && CV_MUT_EQUIV=$(( CV_MUT_EQUIV + 1 ))
  done
  local denom=$(( CV_MUT_VALID - CV_MUT_EQUIV ))

  # ⭐ A guarda: todo mutante valido declarado equivalente NAO e score 1,0.
  if [ "$denom" -le 0 ]; then
    CV_MUT_SCORE="0.0000"
    CV_STEP[step_4_mutation]="failed"
    CV_MUT_DETAIL="Todos os $CV_MUT_VALID mutantes válidos foram classificados como equivalentes. Isso NÃO é score 1,0: uma referência cujo comportamento nenhuma mutação mecânica altera não sustenta um desafio."
    CV_STEP_DETAIL[step_4_mutation]="$CV_MUT_DETAIL"
    cv_reject build_failed "$CV_MUT_DETAIL"
    return
  fi

  CV_MUT_SCORE="$(cv_div "$CV_MUT_KILLED" "$denom")"

  # sample_size = quantos mutantes rodaram de fato; igual a `valid` quando nao houve
  # amostragem. A amostragem e REGISTRADA, nunca escondida.
  CV_MUT_SAMPLE="$CV_MUT_VALID"
  local amostra="sem amostragem: os $CV_MUT_VALID mutantes válidos rodaram (sample_size == valid)"
  if [ "${CV_MUT_SAMPLED:-0}" -eq 1 ]; then
    CV_MUT_SAMPLE="$CV_MUT_VALID"
    amostra="AMOSTRADO: rodaram os primeiros ${CV_MUT_LIMIT} mutantes da ordem canônica do catálogo, nunca sorteados — senão o score deixa de ser comparável entre tentativas (${CV_SAMPLE_REASON}); amostrar reduz a força do passo 4 e NÃO reduz o limiar"
  fi
  CV_MUT_DETAIL="Catálogo fixo v$CV_OPERATORS_VERSION: $CV_MUT_GENERATED gerados, $CV_MUT_VALID válidos, $CV_MUT_INVALID inválidos, $CV_MUT_KILLED mortos, $CV_MUT_SURVIVED sobreviventes. score_bruto = $CV_MUT_KILLED/$CV_MUT_VALID = $CV_MUT_SCORE_BRUTO; equivalent_count = $CV_MUT_EQUIV; score = $CV_MUT_KILLED/$denom = $CV_MUT_SCORE (limiar $CV_THRESHOLD). $amostra."
  for mid in "${CV_SURV_ID[@]}"; do
    CV_MUT_DETAIL+=" [$mid: ${CV_CLASS[$mid]:-unclassified}]"
  done
  [ -n "${CV_APPLY_NOTES:-}" ] && CV_MUT_DETAIL+=" Nota do modelo: ${CV_APPLY_NOTES}"
  [ "${#CV_MUT_DETAIL}" -gt 800 ] && CV_MUT_DETAIL="${CV_MUT_DETAIL:0:797}..."

  if cv_ge "$CV_MUT_SCORE" "$CV_THRESHOLD"; then
    CV_STEP[step_4_mutation]="passed"
  else
    CV_STEP[step_4_mutation]="failed"
    cv_reject mutation_score_below_threshold \
      "Mutation score $CV_MUT_SCORE abaixo do limiar $CV_THRESHOLD ($CV_MUT_KILLED mortos de $denom no denominador). Cada sobrevivente classificado como test_gap nomeia um cenário que falta."
  fi
  CV_STEP_DETAIL[step_4_mutation]="$CV_MUT_DETAIL"
}

# ================================================================ PASSO 5
# Determinismo: 3 execucoes VARIANDO o ambiente. Bug dependente de locale/timezone
# e deterministico dado um ambiente fixo — repetir 10x na mesma maquina no mesmo
# ambiente nunca o exporia.
cv_step_5_determinism() {
  local -a LOCALES=("C" "pt_BR.UTF-8" "C.UTF-8")
  local -a TZS=("UTC" "America/Sao_Paulo" "Asia/Tokyo")
  local -a SEEDS=("0" "1" "524287")
  local -a fp=() matrix=()
  local i li
  for (( i = 0; i < CV_NREP; i++ )); do
    li=$(( i % 3 ))
    cv_export_env "${LOCALES[$li]}" "${TZS[$li]}" "${SEEDS[$li]}"
    cv_execute "$CV_DIR/$CV_REF_PATH"
    fp+=("$CV_EXIT:$CV_TESTS_RUN:$CV_TESTS_FAILED")
    matrix+=("LC_ALL=${LOCALES[$li]} TZ=${TZS[$li]} PYTHONHASHSEED=${SEEDS[$li]}")
  done
  cv_export_env "C.UTF-8" "UTC" "0"

  CV_S5_MATRIX="$(printf '%s\n' "${matrix[@]}" | jq -Rc 'select(length>0)' | jq -sc .)"
  local stable=1
  for (( i = 1; i < ${#fp[@]}; i++ )); do
    [ "${fp[$i]}" = "${fp[0]}" ] || stable=0
  done
  if [ "$stable" -eq 1 ]; then
    CV_STEP[step_5_determinism]="passed"
    CV_S5_STABLE=true
    CV_STEP_DETAIL[step_5_determinism]="$CV_NREP execuções variando LC_ALL, TZ e PYTHONHASHSEED deram (exit,tests_run,tests_failed) idênticos: ${fp[0]}. Limitação honesta: esta matriz pega Time, Randomness, Unordered Collections e Platform Dependency; não pega Async-Wait nem Concurrency."
  else
    CV_STEP[step_5_determinism]="failed"
    CV_S5_STABLE=false
    CV_STEP_DETAIL[step_5_determinism]="Divergência entre repetições: $(printf '%s ' "${fp[@]}"). O teste depende de locale, fuso ou ordem de hash."
    cv_reject nondeterministic \
      "As $CV_NREP execuções contra a mesma referência deram resultados diferentes ($(printf '%s ' "${fp[@]}")). Um teste não determinístico ensina ao aluno que o erro é dele quando não é."
  fi
}

# ================================================================ PASSO 6
# Contagens e consistencia final. Pega o envelope de arquivo do node:test e pega o
# caso que o modelo escreveu e esqueceu de declarar em scenarios[].
cv_step_6_counts() {
  local ok=1 detail=""

  # 6.1 igualdade de contagem em todas as execucoes ja checadas
  if [ "${CV_S1_RUN:-0}" -ne "$CV_EXPECTED" ] || [ "${CV_S2_RUN:-0}" -ne "$CV_EXPECTED" ]; then
    ok=0; detail+="Alguma execução dos passos 1/2 não rodou exatamente $CV_EXPECTED casos. "
  fi

  # 6.2 os nomes executados cobrem EXATAMENTE scenarios[].test_name
  cv_export_env "C.UTF-8" "UTC" "0"
  cv_execute "$CV_DIR/$CV_REF_PATH" --names
  local -a observed=()
  mapfile -t observed < <(cv_probe_names "$CV_OUTFILE")
  CV_S6_OBSERVED="${#observed[@]}"
  if [ "${#observed[@]}" -eq 0 ]; then
    detail+="O probe '$CV_PROBE' não expõe nomes de casos; a checagem 6.2 caiu para igualdade de contagem apenas — registrado, não escondido. "
    CV_S6_OBSERVED="$CV_EXPECTED"
  else
    local decl obs f
    for decl in "${CV_SCEN_NAMES[@]}"; do
      f=nao; for obs in "${observed[@]}"; do [ "$obs" = "$decl" ] && f=sim; done
      [ "$f" = sim ] || { ok=0; detail+="cenário declarado '$decl' não foi executado. "; }
    done
    for obs in "${observed[@]}"; do
      f=nao; for decl in "${CV_SCEN_NAMES[@]}"; do [ "$obs" = "$decl" ] && f=sim; done
      if [ "$f" = nao ]; then
        ok=0
        if [ "$obs" = "$(basename -- "$CV_TEST_PATH")" ] || [ "$obs" = "$CV_TEST_PATH" ]; then
          detail+="o runner reportou o PRÓPRIO ARQUIVO '$obs' como caso — é o envelope de arquivo do node:test, zero asserções e exit 0. "
        else
          detail+="caso executado '$obs' não está declarado em scenarios[]. "
        fi
      fi
    done
  fi

  # 6.3 nenhuma alternativa com resolution unresolved
  if [ "${#CV_ALT_REJ[@]}" -gt 0 ]; then
    ok=0; detail+="${#CV_ALT_REJ[@]} alternativa(s) correta(s) reprovada(s) seguem com resolution='unresolved', o que é incompatível com approved. "
  fi

  # 6.4 float_tolerance exige rel_tol ou abs_tol
  local nmode rel abs
  nmode="$(cv_jqm '.oracle.numeric_mode')"
  if [ "$nmode" = "float_tolerance" ]; then
    rel="$(cv_jqm '.oracle.rel_tol // "null"')"; abs="$(cv_jqm '.oracle.abs_tol // "null"')"
    if [ "$rel" = "null" ] && [ "$abs" = "null" ]; then
      ok=0; detail+="oracle.numeric_mode='float_tolerance' sem rel_tol nem abs_tol: '==' entre floats é proibido e a tolerância tem que estar escrita. "
    fi
  fi

  if [ "$ok" -eq 1 ]; then
    CV_STEP[step_6_counts]="passed"
    CV_STEP_DETAIL[step_6_counts]="Os casos executados são exatamente os $CV_EXPECTED scenarios[].test_name declarados. $detail"
  else
    CV_STEP[step_6_counts]="failed"
    CV_STEP_DETAIL[step_6_counts]="$detail"
    cv_reject test_count_mismatch "$detail"
  fi
}

# ================================================================ PASSO 7
cv_step_7_verdict() {
  local verdict="approved" s
  for s in step_0_build step_1_empty_stub step_2_reference step_3_alternatives \
           step_5_determinism step_6_counts; do
    case "${CV_STEP[$s]:-skipped}" in
      failed) verdict="rejected" ;;
    esac
  done
  if [ "$verdict" = "approved" ]; then
    case "${CV_STEP[step_4_mutation]:-skipped}" in
      failed)
        # score abaixo do limiar e `weak`; catalogo degenerado ja rejeitou em 0/4.
        local c has_build=nao
        for c in "${CV_REJ_CODE[@]}"; do [ "$c" = "build_failed" ] && has_build=sim; done
        if [ "$has_build" = sim ]; then verdict="rejected"; else verdict="weak"; fi
        ;;
    esac
  fi
  CV_VERDICT="$verdict"

  CV_ATTEMPT=$(( CV_ATTEMPTS + 1 ))
  if [ "$verdict" = "approved" ]; then
    CV_STATUS="validated"
  elif [ "$CV_ATTEMPT" -ge "$CV_MAX_ATTEMPTS" ]; then
    CV_STATUS="rejected"
    cv_reject attempt_limit_reached \
      "Esgotadas as $CV_MAX_ATTEMPTS tentativas de geração. O tutor descarta este desafio e propõe outro do mesmo conceito; o meta.json fica em disco como material de diagnóstico."
  else
    CV_STATUS="draft"
  fi
}

# ---------------------------------------------------------------- gravacao
cv_write_meta() {
  local steps rejections survivors mutation

  steps="$(jq -cn \
    --arg s0 "${CV_STEP[step_0_build]:-skipped}"      --arg d0 "${CV_STEP_DETAIL[step_0_build]:-}" \
    --arg s1 "${CV_STEP[step_1_empty_stub]:-skipped}" --arg d1 "${CV_STEP_DETAIL[step_1_empty_stub]:-}" \
    --arg s2 "${CV_STEP[step_2_reference]:-skipped}"  --arg d2 "${CV_STEP_DETAIL[step_2_reference]:-}" \
    --arg s3 "${CV_STEP[step_3_alternatives]:-skipped}" --arg d3 "${CV_STEP_DETAIL[step_3_alternatives]:-}" \
    --arg s4 "${CV_STEP[step_4_mutation]:-skipped}"   --arg d4 "${CV_STEP_DETAIL[step_4_mutation]:-}" \
    --arg s5 "${CV_STEP[step_5_determinism]:-skipped}" --arg d5 "${CV_STEP_DETAIL[step_5_determinism]:-}" \
    --arg s6 "${CV_STEP[step_6_counts]:-skipped}"     --arg d6 "${CV_STEP_DETAIL[step_6_counts]:-}" \
    --argjson r1 "${CV_S1_RUN:-0}" --argjson f1 "${CV_S1_FAILED:-0}" --argjson e1 "${CV_S1_EXIT:-0}" \
    --argjson r2 "${CV_S2_RUN:-0}" --argjson f2 "${CV_S2_FAILED:-0}" --argjson e2 "${CV_S2_EXIT:-0}" \
    --argjson altrun "${CV_ALT_RUN:-0}" \
    --argjson altrej "$(printf '%s\n' "${CV_ALT_REJ[@]:-}" | jq -Rc 'select(length>0) | fromjson' | jq -sc .)" \
    --argjson nrep "$CV_NREP" \
    --argjson matrix "${CV_S5_MATRIX:-[]}" \
    --argjson stable "${CV_S5_STABLE:-false}" \
    --argjson exp "$CV_EXPECTED" --argjson obs "${CV_S6_OBSERVED:-0}" \
    '{step_0_build:{status:$s0, detail:$d0},
      step_1_empty_stub:{status:$s1, tests_run:$r1, tests_failed:$f1, exit_code:$e1, detail:$d1},
      step_2_reference:{status:$s2, tests_run:$r2, tests_failed:$f2, exit_code:$e2, detail:$d2},
      step_3_alternatives:{status:$s3, alternatives_run:$altrun, alternatives_rejected:$altrej, detail:$d3},
      step_4_mutation:{status:$s4, detail:$d4},
      step_5_determinism:{status:$s5, repetitions:$nrep, env_matrix:$matrix, stable:$stable, detail:$d5},
      step_6_counts:{status:$s6, expected:$exp, observed:$obs, detail:$d6}}')"

  rejections="[]"
  local i
  for i in "${!CV_REJ_CODE[@]}"; do
    rejections="$(jq -c --argjson a "$CV_ATTEMPT" --arg c "${CV_REJ_CODE[$i]}" --arg m "${CV_REJ_MSG[$i]}" \
      '. + [{attempt:$a, code:$c, message:$m}]' <<<"$rejections")"
  done

  survivors="[]"
  local mid idx
  for mid in "${CV_SURV_ID[@]}"; do
    idx=-1
    for i in "${!CV_MUT_ID[@]}"; do [ "${CV_MUT_ID[$i]}" = "$mid" ] && { idx="$i"; break; }; done
    [ "$idx" -lt 0 ] && continue
    survivors="$(jq -c --arg id "$mid" --arg op "${CV_MUT_OP[$idx]}" --arg f "$CV_REF_PATH" \
      --argjson ln "${CV_MUT_LINE[$idx]}" --arg b "${CV_MUT_BEFORE[$idx]}" --arg a "${CV_MUT_AFTER[$idx]}" \
      --arg cl "${CV_CLASS[$mid]:-unclassified}" --arg ju "${CV_JUST[$mid]:-}" \
      '. + [ ({mutant_id:$id, operator:$op, file:$f, line:$ln, before:$b, after:$a, classification:$cl}
              + (if $ju == "" then {} else {justification:$ju} end)) ]' <<<"$survivors")"
  done

  mutation="$(jq -cn \
    --arg ov "$CV_OPERATORS_VERSION" \
    --argjson gen "${CV_MUT_GENERATED:-0}" --argjson val "${CV_MUT_VALID:-0}" \
    --argjson inv "${CV_MUT_INVALID:-0}" --argjson kil "${CV_MUT_KILLED:-0}" \
    --argjson sur "${CV_MUT_SURVIVED:-0}" \
    --argjson sc "${CV_MUT_SCORE:-0}" --argjson thr "$CV_THRESHOLD" \
    --argjson eq "${CV_MUT_EQUIV:-0}" --argjson smp "${CV_MUT_SAMPLE:-0}" \
    --arg det "${CV_MUT_DETAIL:-}" --argjson sv "$survivors" \
    '{operators_version:$ov, generated:$gen, valid:$val, invalid:$inv, killed:$kil,
      survived:$sur, score:$sc, threshold:$thr, equivalent_count:$eq,
      sample_size:$smp, detail:$det, survivors:$sv}')"

  local now; now="$(sm_now_iso)"

  # O documento inteiro e montado, VALIDADO e so entao gravado. Validar depois de
  # gravar deixaria em disco um meta.json que a proxima execucao recusa a ler —
  # o desafio ficaria travado por causa do proprio harness.
  local cand="$CV_WORK/meta.new.json"
  jq "
    .validation = {
      protocol_version: \"$CV_PROTOCOL_VERSION\",
      harness: \"$CV_HARNESS\",
      validated_at: \"$now\",
      verdict: \"$CV_VERDICT\",
      generation_attempts: $CV_ATTEMPT,
      steps: $steps,
      mutation: $mutation,
      rejections: $rejections
    }
    | .challenge_status = \"$CV_STATUS\"
    | .updated_at = \"$now\"
  " "$CV_META" >"$cand" || { sm_log error "não consegui montar o meta.json"; exit 1; }

  # ⭐ Os SHA-256 sao do HARNESS, e so na aprovacao. Uma LLM nao computa SHA-256:
  # hash inventado mente para sempre, o aviso de adulteracao dispara desde a
  # primeira rodada, e o aluno aprende a ignorar o mecanismo inteiro.
  if [ "$CV_VERDICT" = "approved" ]; then
    local th rh
    th="$(sha256sum -- "$CV_DIR/$CV_TEST_PATH" | awk '{print $1}')"
    rh="$(sha256sum -- "$CV_DIR/$CV_REF_PATH"  | awk '{print $1}')"
    jq ".integrity.test_sha256 = \"$th\"
        | .integrity.reference_sha256 = \"$rh\"
        | .integrity.recorded_at = \"$now\"" "$cand" >"$cand.2" && mv -f "$cand.2" "$cand"
  else
    jq '.integrity.test_sha256 = null | .integrity.reference_sha256 = null' \
       "$cand" >"$cand.2" && mv -f "$cand.2" "$cand"
  fi

  sm_json_validate "$cand" "$CV_SCHEMA_MANIFEST" || {
    sm_log error "o meta.json que eu ia gravar não valida contra o schema; nada foi alterado"
    exit 5; }
  sm_atomic_write "$CV_META" <"$cand" || { sm_log error "não consegui gravar meta.json"; exit 1; }
}

cv_emit_summary() {
  jq -cn --arg v "$CV_VERDICT" --argjson s "${CV_MUT_SCORE:-0}" \
     --argjson k "${CV_MUT_KILLED:-0}" --argjson su "${CV_MUT_SURVIVED:-0}" \
     --argjson r "$(printf '%s\n' "${CV_REJ_CODE[@]:-}" | jq -R 'select(length>0)' | jq -sc .)" \
     '{verdict:$v, mutation_score:$s, killed:$k, survived:$su, rejections:$r}'
}

# ================================================================ main
main() {
  cv_parse_args "$@"
  sm_require_cmd jq python3 sha256sum find || exit 1

  CV_DIR="$(cd -- "$CV_DIR" 2>/dev/null && pwd)" || { sm_log error "diretório do desafio não encontrado"; exit 3; }
  CV_META="$CV_DIR/meta.json"
  [ -r "$CV_META" ] || { sm_log error "meta.json não encontrado em $CV_DIR"; exit 3; }

  CV_WORK="$(mktemp -d)" || exit 1
  trap cv_cleanup EXIT

  cv_step_0_build
  if [ "${CV_STEP[step_0_build]}" = "failed" ]; then
    CV_STEP[step_1_empty_stub]="skipped"; CV_STEP[step_2_reference]="skipped"
    CV_STEP[step_3_alternatives]="skipped"; CV_STEP[step_4_mutation]="skipped"
    CV_STEP[step_5_determinism]="skipped"; CV_STEP[step_6_counts]="skipped"
    CV_S5_MATRIX="[]"; CV_S5_STABLE=false
    cv_step_7_verdict; cv_write_meta; cv_emit_summary; exit 0
  fi

  cp -f -- "$CV_DIR/$CV_STUB_PATH" "$CV_WORK/stub.orig"; CV_STUB_SAVED=1
  cv_export_env "C.UTF-8" "UTC" "0"

  cv_step_1_empty_stub
  cv_step_2_reference
  CV_S2_MS_HINT="$CV_WALL_MS"
  cv_step_3_alternatives
  cv_step_4_mutation

  # ⭐ O ponto de parada do REQUEST/APPLY. Ate aqui NADA foi gravado em meta.json.
  #
  # So vale a pena gastar um ciclo com o modelo se a classificacao ainda puder mudar
  # o veredito. Com um passo obrigatorio ja reprovado o veredito e `rejected` faca o
  # que fizer a classificacao — entao o script segue pelo caminho degradado do
  # docs/00 §6.4: todo sobrevivente fica `unclassified` e conta como test_gap, o lado
  # conservador. Pedir opiniao que nao muda nada e desperdicar a cota de RA-6.
  local mandatorios_ok=1 _st
  for _st in step_0_build step_1_empty_stub step_2_reference step_3_alternatives; do
    [ "${CV_STEP[$_st]:-skipped}" = "failed" ] && mandatorios_ok=0
  done

  if [ "${CV_MUT_SURVIVED:-0}" -gt 0 ] && [ "$mandatorios_ok" -eq 1 ]; then
    if [ -z "$CV_APPLY_FILE" ]; then
      cv_emit_request           # stdout + exit 10, disco intacto
    fi
    cv_apply_response
  elif [ -n "$CV_APPLY_FILE" ]; then
    sm_log warn "--apply recebido, mas não há classificação pendente que possa mudar o veredito; a resposta é ignorada"
  elif [ "${CV_MUT_SURVIVED:-0}" -gt 0 ]; then
    sm_log warn "passo obrigatório já reprovado: os $CV_MUT_SURVIVED sobreviventes ficam 'unclassified' e contam como test_gap (caminho degradado, o lado conservador)"
  fi

  [ "${CV_STEP[step_4_mutation]:-}" = "failed" ] || cv_close_mutation_score
  cv_step_5_determinism
  cv_step_6_counts
  cv_step_7_verdict
  cv_write_meta
  cv_emit_summary
  exit 0
}

main "$@"
