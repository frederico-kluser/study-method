#!/usr/bin/env bash
# challenge-new.sh — materializa um desafio novo em <setup_root>/challenges/<NNNN>-<slug>/.
#
# Contrato: docs/00-contratos.md §3.2 (arvore), §5.1 (exit codes), §8 (CLI).
# Especificacao: docs/build-spec/51-challenge-new.md.
#
# O que este script NAO faz, por contrato:
#   - nao julga qualidade de teste (isso e challenge-verify.sh — DES-1);
#   - nao calcula SHA-256 de integridade (nasce null — docs/05 §9.1);
#   - nao sai com 10: nao ha REQUEST/APPLY aqui (§8 e I-22).
#
# stdout: SOMENTE o caminho relativo do desafio criado. Tudo mais vai para stderr.
set -euo pipefail

SM_SKILL_DIR="${STUDY_METHOD_SKILL_DIR:-}"
if [ -z "$SM_SKILL_DIR" ]; then
  SM_SKILL_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
fi
# shellcheck source=lib/common.sh
. "$SM_SKILL_DIR/scripts/lib/common.sh"
# shellcheck source=lib/json.sh
. "$SM_SKILL_DIR/scripts/lib/json.sh"

SM_TMPL_DIR="$SM_SKILL_DIR/assets/templates"
SM_MANIFEST="$SM_TMPL_DIR/MANIFEST.tsv"
SM_SCHEMA="$SM_SKILL_DIR/assets/schemas/challenge-manifest.schema.json"
SM_SCHEMA_VERSION="1.0"
SM_PROTOCOL_VERSION="1.0"

# Diretorio temporario de trabalho; limpo sempre. CH_CRIADO e desfeito se algo falhar
# no meio da materializacao (nao ha dado do aluno la dentro: o diretorio acabou de nascer).
SM_TMP=""
CH_CRIADO=""
ch_limpar() {
  local rc=$?
  [ -n "$SM_TMP" ] && [ -d "$SM_TMP" ] && rm -rf -- "$SM_TMP"
  if [ "$rc" -ne 0 ] && [ -n "$CH_CRIADO" ] && [ -d "$CH_CRIADO" ]; then
    rm -rf -- "$CH_CRIADO"
    sm_log warn "desafio parcial removido: $CH_CRIADO"
  fi
  return "$rc"
}
trap ch_limpar EXIT

# ---------------------------------------------------------------------------
# 1. Uso
# ---------------------------------------------------------------------------
ch_uso() {
  cat <<'AJUDA'
Uso: challenge-new.sh <setup_root> --language <l> --slug <sl> --concept <concept_id>
                      [--difficulty 1..5] [--skill-level beginner|intermediate|advanced]

Materializa um desafio novo (challenge_status: "draft") em
<setup_root>/challenges/<NNNN>-<slug>/ e imprime o caminho relativo em stdout.

Argumentos
  <setup_root>            Raiz do setup do aluno (onde vive setup.json).
  --language <l>          Linguagem do desafio. Implementadas nesta versao:
                          python, javascript (node), go, rust, c.
                          As outras 14 do enum estao na matriz de
                          references/languages.md e NAO sao geradas.
  --slug <sl>             Rotulo curto do desafio, kebab-case.
  --concept <concept_id>  Conceito-alvo primario, snake_case.
  --difficulty <1..5>     Dificuldade declarada. Default: 2.
  --skill-level <n>       beginner | intermediate | advanced. Default: beginner.
  --help                  Esta ajuda.

O que nasce no desafio
  VISIVEL   README.md (enunciado + cenarios nomeados), o stub (unico arquivo que o
            aluno edita), o teste (o aluno le, nao edita), runner.sh, meta.json.
  OCULTO    .solution/ com reference, reference_alt_* (>=2, corretas e
            estruturalmente diferentes) e empty_stub.

meta.json nasce com challenge_status "draft" e integrity.test_sha256 null: o hash e
gravado por challenge-verify.sh na aprovacao, nunca aqui.

Exit codes (docs/00-contratos.md §5.1)
  0 ok · 1 erro de execucao (toolchain ou template ausente) · 2 uso incorreto
  3 setup nao encontrado · 4 colisao de NNNN · 5 meta.json nao valida no schema
AJUDA
}

# ---------------------------------------------------------------------------
# 2. Tabela de linguagens (a matriz operacional de references/languages.md §3)
# ---------------------------------------------------------------------------
# Enum fechado de 19 (docs/00-contratos.md §4.1).
SM_LANGS_ENUM="python javascript typescript rust go java csharp ruby elixir kotlin swift c cpp php lua julia r haskell bash"
# As 5 zero-install desta onda.
SM_LANGS_IMPL="python javascript go rust c"

ch_lang_campo() { # <linguagem> <campo>
  local l="$1" campo="$2"
  case "$l:$campo" in
    python:bin)        echo "python3" ;;
    python:perfil)     echo "generic" ;;
    python:ext)        echo "py" ;;
    python:framework)  echo "unittest (stdlib)" ;;
    python:probe)      echo "python_unittest_ran_line" ;;
    python:timeout)    echo "15" ;;
    python:falha)      echo "1" ;;
    python:instalar)   echo "sudo pacman -S python" ;;
    python:vizinha)    echo "-" ;;

    javascript:bin)       echo "node" ;;
    javascript:perfil)    echo "generic" ;;
    javascript:ext)       echo "mjs" ;;
    javascript:framework) echo "node:test + node:assert" ;;
    javascript:probe)     echo "node_test_tap_summary" ;;
    javascript:timeout)   echo "15" ;;
    javascript:falha)     echo "1" ;;
    javascript:instalar)  echo "sudo pacman -S nodejs" ;;
    javascript:vizinha)   echo "-" ;;

    go:bin)        echo "go" ;;
    go:perfil)     echo "go_module" ;;
    go:ext)        echo "go" ;;
    go:framework)  echo "testing (stdlib)" ;;
    go:probe)      echo "go_test_json_run_events" ;;
    go:timeout)    echo "90" ;;
    go:falha)      echo "1" ;;
    go:instalar)   echo "sudo pacman -S go" ;;
    go:vizinha)    echo "-" ;;

    rust:bin)       echo "cargo" ;;
    rust:perfil)    echo "cargo_crate" ;;
    rust:ext)       echo "rs" ;;
    rust:framework) echo "cargo test (harness padrao)" ;;
    rust:probe)     echo "cargo_test_running_lines" ;;
    rust:timeout)   echo "120" ;;
    rust:falha)     echo "101" ;;
    rust:instalar)  echo "sudo pacman -S rust" ;;
    rust:vizinha)   echo "-" ;;

    c:bin)        echo "gcc" ;;
    c:perfil)     echo "generic" ;;
    c:ext)        echo "c" ;;
    c:framework)  echo "assert.h + counter_protocol" ;;
    c:probe)      echo "counter_protocol" ;;
    c:timeout)    echo "30" ;;
    c:falha)      echo "1" ;;
    c:instalar)   echo "sudo pacman -S gcc" ;;
    c:vizinha)    echo "-" ;;

    # As 14 nao implementadas: so o comando de instalacao e a vizinha natural,
    # para a recusa ser util (references/languages.md §5 e §6).
    cpp:instalar)      echo "sudo pacman -S gcc" ;;      cpp:vizinha)      echo "c" ;;
    java:instalar)     echo "sudo pacman -S jdk-openjdk" ;; java:vizinha)  echo "go" ;;
    csharp:instalar)   echo "sudo pacman -S dotnet-sdk" ;;  csharp:vizinha) echo "go" ;;
    ruby:instalar)     echo "sudo pacman -S ruby" ;;     ruby:vizinha)     echo "python" ;;
    elixir:instalar)   echo "sudo pacman -S elixir" ;;   elixir:vizinha)   echo "-" ;;
    kotlin:instalar)   echo "sudo pacman -S kotlin" ;;   kotlin:vizinha)   echo "go" ;;
    swift:instalar)    echo "toolchain do swift.org" ;;  swift:vizinha)    echo "rust" ;;
    php:instalar)      echo "sudo pacman -S php" ;;      php:vizinha)      echo "python" ;;
    lua:instalar)      echo "sudo pacman -S lua" ;;      lua:vizinha)      echo "python" ;;
    julia:instalar)    echo "sudo pacman -S julia" ;;    julia:vizinha)    echo "python" ;;
    r:instalar)        echo "sudo pacman -S r" ;;        r:vizinha)        echo "python" ;;
    haskell:instalar)  echo "sudo pacman -S ghc cabal-install" ;; haskell:vizinha) echo "-" ;;
    typescript:instalar) echo "sudo pacman -S nodejs" ;; typescript:vizinha) echo "javascript" ;;
    bash:instalar)     echo "ja instalado" ;;            bash:vizinha)     echo "python" ;;
    *) echo "" ;;
  esac
}

ch_na_lista() { # <valor> <lista separada por espaco>
  local v="$1" lista="$2" x
  for x in $lista; do [ "$x" = "$v" ] && return 0; done
  return 1
}

# ---------------------------------------------------------------------------
# 3. Templates — resolvidos SEMPRE pelo MANIFEST.tsv (assets/templates/MANIFEST.tsv)
# ---------------------------------------------------------------------------
ch_tmpl() { # <caminho relativo dentro de assets/templates> -> caminho absoluto
  local rel="$1" linha=""
  if [ ! -r "$SM_MANIFEST" ]; then
    sm_die 1 "MANIFEST.tsv dos templates nao encontrado em $SM_MANIFEST."
  fi
  linha="$(grep -v '^#' "$SM_MANIFEST" | awk -F'\t' -v c="$rel" '$1 == c {print $0}' | head -1)"
  if [ -z "$linha" ]; then
    sm_die 1 "template '$rel' nao esta declarado em MANIFEST.tsv; o contrato dos templates
  precisa listar o arquivo antes de challenge-new.sh consumi-lo."
  fi
  local consumidor
  consumidor="$(printf '%s\n' "$linha" | awk -F'\t' '{print $2}')"
  case "$consumidor" in
    *challenge-new.sh*) : ;;
    *) sm_die 1 "MANIFEST.tsv diz que '$rel' e consumido por '$consumidor', nao por challenge-new.sh." ;;
  esac
  local abs="$SM_TMPL_DIR/$rel"
  if [ ! -r "$abs" ]; then
    sm_die 1 "template obrigatorio ausente: $abs
  (declarado em MANIFEST.tsv). Instale a skill completa ou gere os templates antes."
  fi
  printf '%s\n' "$abs"
}

# Substitui {{PLACEHOLDER}} pelo valor do mapa JSON em $SM_TMP/valores.json.
# Falha se o template pedir um placeholder que o script nao sabe preencher, e falha
# se sobrar qualquer {{ }} no resultado (regra do gate: nenhum placeholder no artefato).
ch_render() { # <template abs> -> conteudo em stdout
  local tmpl="$1"
  python3 - "$tmpl" "$SM_TMP/valores.json" <<'PY'
import json, re, sys
tmpl_path, mapa_path = sys.argv[1], sys.argv[2]
with open(tmpl_path, encoding="utf-8") as fh:
    texto = fh.read()
with open(mapa_path, encoding="utf-8") as fh:
    valores = json.load(fh)
faltando = []
def troca(m):
    nome = m.group(1)
    if nome not in valores:
        faltando.append(nome)
        return m.group(0)
    return valores[nome]
saida = re.sub(r"\{\{([A-Z][A-Z0-9_]*)\}\}", troca, texto)
if faltando:
    sys.stderr.write("placeholder sem valor em %s: %s\n" % (tmpl_path, ", ".join(sorted(set(faltando)))))
    sys.exit(1)
if "{{" in saida:
    sys.stderr.write("sobrou '{{' no artefato gerado a partir de %s\n" % tmpl_path)
    sys.exit(1)
sys.stdout.write(saida)
PY
}

ch_materializar() { # <template rel> <destino abs>
  local rel="$1" destino="$2" abs
  abs="$(ch_tmpl "$rel")"
  mkdir -p -- "$(dirname -- "$destino")"
  if ! ch_render "$abs" | sm_atomic_write "$destino"; then
    sm_die 1 "falha ao materializar $destino a partir de $rel."
  fi
}

ch_set() { # <chave> <valor> — acrescenta ao mapa de placeholders
  local k="$1" v="$2"
  jq --arg k "$k" --arg v "$v" '.[$k] = $v' "$SM_TMP/valores.json" > "$SM_TMP/valores.next" \
    && mv -f "$SM_TMP/valores.next" "$SM_TMP/valores.json"
}

# ---------------------------------------------------------------------------
# 4. Argumentos
# ---------------------------------------------------------------------------
SETUP_HINT=""
LANG_IN=""
SLUG_IN=""
CONCEPT_IN=""
DIFICULDADE="2"
SKILL_LEVEL="beginner"

if [ "$#" -eq 0 ]; then ch_uso >&2; exit 2; fi
case "${1:-}" in
  --help|-h) ch_uso; exit 0 ;;
esac
SETUP_HINT="$1"; shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)      ch_uso; exit 0 ;;
    --language)     LANG_IN="${2:-}";     shift 2 || true ;;
    --slug)         SLUG_IN="${2:-}";     shift 2 || true ;;
    --concept)      CONCEPT_IN="${2:-}";  shift 2 || true ;;
    --difficulty)   DIFICULDADE="${2:-}"; shift 2 || true ;;
    --skill-level)  SKILL_LEVEL="${2:-}"; shift 2 || true ;;
    --language=*)   LANG_IN="${1#*=}";     shift ;;
    --slug=*)       SLUG_IN="${1#*=}";     shift ;;
    --concept=*)    CONCEPT_IN="${1#*=}";  shift ;;
    --difficulty=*) DIFICULDADE="${1#*=}"; shift ;;
    --skill-level=*) SKILL_LEVEL="${1#*=}"; shift ;;
    *) sm_die 2 "argumento desconhecido: $1 (use --help)." ;;
  esac
done

[ -n "$LANG_IN" ]    || sm_die 2 "--language e obrigatorio (use --help)."
[ -n "$SLUG_IN" ]    || sm_die 2 "--slug e obrigatorio (use --help)."
[ -n "$CONCEPT_IN" ] || sm_die 2 "--concept e obrigatorio (use --help)."

case "$DIFICULDADE" in
  1|2|3|4|5) : ;;
  *) sm_die 2 "--difficulty precisa ser um inteiro de 1 a 5 (recebi '$DIFICULDADE')." ;;
esac
case "$SKILL_LEVEL" in
  beginner|intermediate|advanced) : ;;
  *) sm_die 2 "--skill-level precisa ser beginner, intermediate ou advanced (recebi '$SKILL_LEVEL')." ;;
esac

sm_require_cmd jq python3 || sm_die 1 "dependencias ausentes; veja a mensagem acima."

# 'node' e apelido operacional de 'javascript' (o enum de §4.1 nao tem 'node').
LINGUAGEM="$LANG_IN"
[ "$LINGUAGEM" = "node" ] && LINGUAGEM="javascript"

if ! ch_na_lista "$LINGUAGEM" "$SM_LANGS_ENUM"; then
  sm_die 2 "linguagem '$LANG_IN' nao esta no enum de 19 de docs/00-contratos.md §4.1.
  Validas: $SM_LANGS_ENUM"
fi
if ! ch_na_lista "$LINGUAGEM" "$SM_LANGS_IMPL"; then
  viz="$(ch_lang_campo "$LINGUAGEM" vizinha)"
  inst="$(ch_lang_campo "$LINGUAGEM" instalar)"
  {
    echo "study-method: '$LINGUAGEM' esta na matriz de references/languages.md, mas esta versao"
    echo "  do gerador materializa desafio em 5 linguagens: $SM_LANGS_IMPL."
    [ -n "$inst" ] && [ "$inst" != "ja instalado" ] && echo "  Instalacao (voce decide, eu nunca instalo): $inst"
    [ -n "$viz" ] && [ "$viz" != "-" ] && echo "  Linguagem vizinha ja suportada, com a mesma ideia de desafio: $viz"
  } >&2
  sm_die 2 "linguagem nao implementada nesta versao."
fi

PERFIL="$(ch_lang_campo "$LINGUAGEM" perfil)"
EXT="$(ch_lang_campo "$LINGUAGEM" ext)"
BIN="$(ch_lang_campo "$LINGUAGEM" bin)"
FRAMEWORK="$(ch_lang_campo "$LINGUAGEM" framework)"
PROBE="$(ch_lang_campo "$LINGUAGEM" probe)"
TIMEOUT_S="$(ch_lang_campo "$LINGUAGEM" timeout)"
CODIGO_FALHA="$(ch_lang_campo "$LINGUAGEM" falha)"

# Toolchain: detectar ANTES de gerar qualquer coisa (references/languages.md §6).
# Nunca instala; nunca "tenta mesmo assim".
if ! command -v "$BIN" >/dev/null 2>&1; then
  inst="$(ch_lang_campo "$LINGUAGEM" instalar)"
  {
    echo "study-method: o toolchain de '$LINGUAGEM' nao esta nesta maquina ('$BIN' nao encontrado)."
    echo "  Instale com: $inst   (o comando e seu; eu nunca instalo nada)"
    echo "  Ou peca a mesma ideia de desafio em uma que ja roda aqui:"
    printf '   '
    for l in $SM_LANGS_IMPL; do
      b="$(ch_lang_campo "$l" bin)"
      command -v "$b" >/dev/null 2>&1 && printf ' %s' "$l"
    done
    echo ""
    echo "  Nao gero desafio em linguagem que nao confirmei: daria erro de shell sem diagnostico,"
    echo "  e voce nao distinguiria 'nao instalado' de 'meu codigo esta errado'."
  } >&2
  sm_die 1 "toolchain ausente para '$LINGUAGEM'."
fi

RUNTIME_VERSAO=""
case "$LINGUAGEM" in
  go) RUNTIME_VERSAO="$(go version 2>/dev/null | head -1 || true)" ;;
  *)  RUNTIME_VERSAO="$("$BIN" --version 2>&1 | head -1 || true)" ;;
esac

# ---------------------------------------------------------------------------
# 5. Setup, slug e conceito
# ---------------------------------------------------------------------------
if ! SETUP_ROOT="$(sm_setup_root "$SETUP_HINT")" || [ -z "$SETUP_ROOT" ]; then
  sm_die 3 "nenhum setup.json legivel em '$SETUP_HINT' nem em diretorio ancestral.
  Um desafio so existe dentro de um setup: rode setup-init.sh antes, ou aponte para a raiz certa."
fi

SLUG="$(sm_normalize_slug "$SLUG_IN")" || sm_die 2 "--slug '$SLUG_IN' nao produz um slug kebab-case valido."
[ "$SLUG" = "$SLUG_IN" ] || sm_log warn "slug normalizado: '$SLUG_IN' -> '$SLUG'"

CONCEPT="$(sm_normalize_concept_id "$CONCEPT_IN")" || sm_die 2 "--concept '$CONCEPT_IN' nao produz um concept_id snake_case valido."
[ "$CONCEPT" = "$CONCEPT_IN" ] || sm_log warn "concept_id normalizado: '$CONCEPT_IN' -> '$CONCEPT'"

SM_TMP="$(mktemp -d "${TMPDIR:-/tmp}/challenge-new.XXXXXX")"
echo '{}' > "$SM_TMP/valores.json"

DESAFIOS_DIR="$SETUP_ROOT/challenges"
mkdir -p -- "$DESAFIOS_DIR"

# ---------------------------------------------------------------------------
# 6. Alocacao do challenge_id — mesmo mecanismo do sm_next_seq, adaptado a diretorio
# ---------------------------------------------------------------------------
# sm_next_seq cria um ARQUIVO com `set -o noclobber`; aqui o recurso e um DIRETORIO
# (<NNNN>-<slug>), e `mkdir` e a primitiva atomica equivalente: falha se ja existe.
# Depois da tomada, confere se algum outro diretorio reivindicou o mesmo NNNN com
# outro slug (corrida real, ainda que rara: memory/.session.lock ja serializa a sessao).
ch_alocar_id() {
  local tentativa=0 maior=0 nnnn d base
  while [ "$tentativa" -lt 5 ]; do
    maior=0
    for d in "$DESAFIOS_DIR"/[0-9][0-9][0-9][0-9]-*; do
      [ -e "$d" ] || continue
      base="$(basename -- "$d")"
      base="${base%%-*}"
      base="${base#"${base%%[!0]*}"}"   # tira zeros a esquerda
      [ -z "$base" ] && base=0
      [ "$base" -gt "$maior" ] && maior="$base"
    done
    nnnn="$(printf '%04d' "$(( maior + 1 + tentativa ))")"
    if mkdir -- "$DESAFIOS_DIR/$nnnn-$SLUG" 2>/dev/null; then
      # confere colisao de prefixo com outro slug
      local n=0 outro
      for outro in "$DESAFIOS_DIR/$nnnn"-*; do
        [ -e "$outro" ] && n=$(( n + 1 ))
      done
      if [ "$n" -eq 1 ]; then
        printf '%s\n' "$nnnn"
        return 0
      fi
      rmdir -- "$DESAFIOS_DIR/$nnnn-$SLUG" 2>/dev/null || true
    fi
    tentativa=$(( tentativa + 1 ))
  done
  return 4
}

CHALLENGE_ID="$(ch_alocar_id)" || sm_die 4 "nao consegui alocar um challenge_id apos 5 tentativas em $DESAFIOS_DIR."
CH_DIR="$DESAFIOS_DIR/$CHALLENGE_ID-$SLUG"
CH_CRIADO="$CH_DIR"
CH_REL="challenges/$CHALLENGE_ID-$SLUG"

# ---------------------------------------------------------------------------
# 7. Semente do desafio — nomes derivados do slug, cenarios canonicos
# ---------------------------------------------------------------------------
# challenge-new.sh e deterministico: ele nao inventa semantica. Materializa a
# SEMENTE canonica (fatorial), coerente ponta a ponta — stub vazio falha, referencia
# passa, alternativas passam — e o tutor reescreve o conteudo antes da validacao.
# Por isso challenge_status nasce "draft" e DES-2 impede que isso chegue ao aluno.
FUNC_SNAKE="$(printf '%s' "$SLUG" | tr '-' '_')"
case "$FUNC_SNAKE" in [0-9]*) FUNC_SNAKE="f_$FUNC_SNAKE" ;; esac

ch_camel() { # <snake_case> -> CamelCase
  printf '%s' "$1" | awk -F_ '{s=""; for(i=1;i<=NF;i++){ s = s toupper(substr($i,1,1)) substr($i,2) } print s}'
}
FUNC_CAMEL="$(ch_camel "$FUNC_SNAKE")"

case "$LINGUAGEM" in
  go) FUNC_NAME="$FUNC_CAMEL" ;;
  *)  FUNC_NAME="$FUNC_SNAKE" ;;
esac

TITULO="Desafio $CHALLENGE_ID — $(printf '%s' "$SLUG" | tr '-' ' ')"

# Cenarios canonicos da semente: id|kind|entrada|esperado|descricao
SM_CENARIOS="
${FUNC_SNAKE}_de_zero|boundary|0|1|O fatorial de 0 e o produto vazio, que por definicao vale 1 — a borda que quase toda implementacao esquece.
${FUNC_SNAKE}_de_um|example|1|1|O fatorial de 1 e o proprio 1: o menor caso em que o laco roda uma vez.
${FUNC_SNAKE}_de_cinco|example|5|120|fatorial(5) e o produto 1*2*3*4*5 = 120.
${FUNC_SNAKE}_de_dez|example|10|3628800|fatorial(10) = 3628800: o valor cresce rapido, entao o tipo de retorno precisa ser largo.
"
CENARIOS_N="$(printf '%s\n' "$SM_CENARIOS" | grep -c '|' || true)"

ch_cada_cenario() { # le SM_CENARIOS e chama "$1" id kind entrada esperado descricao
  local fn="$1" linha id kind entrada esperado desc
  while IFS='|' read -r id kind entrada esperado desc; do
    [ -n "$id" ] || continue
    "$fn" "$id" "$kind" "$entrada" "$esperado" "$desc"
  done <<EOF
$(printf '%s\n' "$SM_CENARIOS" | grep '|')
EOF
}

# Sao DUAS coisas diferentes, e confundi-las quebrava o passo 6 do harness:
#
#   ch_test_name       o nome COMO O RUNNER REPORTA. E o que vai para
#                      `scenarios[].test_name` no meta.json, e o que
#                      challenge-verify.sh compara com o que extraiu da saida
#                      (cv_probe_names). Sempre o nome CURTO: `python -m unittest -v`
#                      imprime `test_<id> (tests.test_stub.TestStub.test_<id>)` e o
#                      rotulo do caso e o `test_<id>` da frente; o cargo imprime
#                      `test <id> ...` (as funcoes vivem no topo do teste de
#                      integracao, sem `mod tests`); o node imprime o nome dado ao
#                      `test('<id>', …)`; o go imprime `Test<Camel>`.
#
#   ch_filtro_cenario  o nome que FILTRA uma execucao unica, usado so pelo
#                      `traduzir_cenario()` do runner. Em Python tem de ser o caminho
#                      QUALIFICADO (`tests.test_stub.TestStub.test_<id>`): o unittest
#                      nao resolve nome curto. Nas outras quatro os dois coincidem.
#
# A classe e `TestStub`, como declarada em challenge/python/test_stub.py.tmpl.
ch_test_name() { # <scenario_id> -> nome curto, como o runner o reporta
  local id="$1"
  case "$LINGUAGEM" in
    python)     printf 'test_%s\n' "$id" ;;
    javascript) printf '%s\n' "$id" ;;
    go)         printf 'Test%s\n' "$(ch_camel "$id")" ;;
    rust)       printf '%s\n' "$id" ;;
    c)          printf '%s\n' "$id" ;;
  esac
}

ch_filtro_cenario() { # <scenario_id> -> nome que o runner usa para filtrar UM caso
  local id="$1"
  case "$LINGUAGEM" in
    python)     printf 'tests.test_stub.TestStub.test_%s\n' "$id" ;;
    *)          ch_test_name "$id" ;;
  esac
}

# ---------------------------------------------------------------------------
# 8. Geradores de codigo dos cenarios, por linguagem
# ---------------------------------------------------------------------------
ch_codigo_cenarios() {
  local out="$SM_TMP/cenarios.txt"
  : > "$out"
  local id kind entrada esperado desc
  while IFS='|' read -r id kind entrada esperado desc; do
    [ -n "$id" ] || continue
    case "$LINGUAGEM" in
      python)
        {
          printf '    def test_%s(self):\n' "$id"
          printf '        """%s"""\n' "$desc"
          printf '        obtido = %s(%s)\n' "$FUNC_NAME" "$entrada"
          printf '        self.assertEqual(\n'
          printf '            obtido, %s,\n' "$esperado"
          printf '            f"cenario %s: %s(%s) devolveu {obtido!r}, esperado %s. %s",\n' "$id" "$FUNC_NAME" "$entrada" "$esperado" "$desc"
          printf '        )\n\n'
        } >> "$out" ;;
      javascript)
        {
          printf "test('%s', () => {\n" "$id"
          printf '  // %s\n' "$desc"
          printf '  const obtido = %s(%s);\n' "$FUNC_NAME" "$entrada"
          printf '  assert.strictEqual(\n'
          printf '    obtido, %s,\n' "$esperado"
          printf "    \`cenario %s: %s(%s) devolveu \${obtido}, esperado %s. %s\`,\n" "$id" "$FUNC_NAME" "$entrada" "$esperado" "$desc"
          printf '  );\n});\n\n'
        } >> "$out" ;;
      go)
        {
          printf 'func Test%s(t *testing.T) {\n' "$(ch_camel "$id")"
          printf '\t// %s\n' "$desc"
          printf '\tobtido := %s(%s)\n' "$FUNC_NAME" "$entrada"
          printf '\tif obtido != %s {\n' "$esperado"
          printf '\t\tt.Errorf("cenario %s: %s(%s) devolveu %%d, esperado %s. %s", obtido)\n' "$id" "$FUNC_NAME" "$entrada" "$esperado" "$desc"
          printf '\t}\n}\n\n'
        } >> "$out" ;;
      rust)
        {
          printf '    #[test]\n'
          printf '    fn %s() {\n' "$id"
          printf '        // %s\n' "$desc"
          printf '        let obtido = %s(%s);\n' "$FUNC_NAME" "$entrada"
          printf '        assert_eq!(\n'
          printf '            obtido, %s,\n' "$esperado"
          printf '            "cenario %s: %s(%s) devolveu {}, esperado %s. %s",\n' "$id" "$FUNC_NAME" "$entrada" "$esperado" "$desc"
          printf '            obtido\n'
          printf '        );\n    }\n\n'
        } >> "$out" ;;
      c)
        {
          printf '    checa_long("%s", %s(%sL), %sL,\n' "$id" "$FUNC_NAME" "$entrada" "$esperado"
          printf '               "%s");\n' "$desc"
        } >> "$out" ;;
    esac
  done <<EOF
$(printf '%s\n' "$SM_CENARIOS" | grep '|')
EOF
  cat "$out"
}

ch_tabela_cenarios() { # tabela markdown do README do desafio
  local id kind entrada esperado desc
  printf '| Cenario | Tipo | O que ele cobra |\n'
  printf '|---|---|---|\n'
  while IFS='|' read -r id kind entrada esperado desc; do
    [ -n "$id" ] || continue
    printf '| `%s` | %s | %s |\n' "$id" "$kind" "$desc"
  done <<EOF
$(printf '%s\n' "$SM_CENARIOS" | grep '|')
EOF
}

ch_cenarios_json() {
  local id kind entrada esperado desc
  : > "$SM_TMP/cenarios.jsonl"
  while IFS='|' read -r id kind entrada esperado desc; do
    [ -n "$id" ] || continue
    jq -n -c --arg id "$id" --arg tn "$(ch_test_name "$id")" --arg k "$kind" --arg d "$desc" \
      '{scenario_id:$id, test_name:$tn, kind:$k, description:$d}' >> "$SM_TMP/cenarios.jsonl"
  done <<EOF
$(printf '%s\n' "$SM_CENARIOS" | grep '|')
EOF
  jq -sc '.' "$SM_TMP/cenarios.jsonl"
}

# ---------------------------------------------------------------------------
# 9. Comando de teste e probe de contagem — o miolo do runner.sh gerado
# ---------------------------------------------------------------------------
# TEST_CMD define TIMEOUT_PADRAO, traduzir_cenario() e executar_testes().
# COUNT_PROBE define contar_testes() e mostrar_saida().
# Sao os dois unicos pontos do runner que mudam por linguagem (docs/05 §3.3).

# traduzir_cenario: scenario_id -> nome de FILTRO da linguagem (ch_filtro_cenario, que
# em Python e o caminho qualificado). NAO e o `scenarios[].test_name` do meta.json, que
# guarda o nome curto reportado. O mapa nasce aqui, no gerador, e nao no runner: assim o
# runner nao precisa de jq para ler o meta.json na maquina do aluno.
ch_mapa_cenarios() {
  local id kind entrada esperado desc
  echo 'traduzir_cenario() {'
  echo '  case "$1" in'
  while IFS='|' read -r id kind entrada esperado desc; do
    [ -n "$id" ] || continue
    printf "    %s) printf '%%s' '%s' ;;\n" "$id" "$(ch_filtro_cenario "$id")"
  done <<EOF
$(printf '%s\n' "$SM_CENARIOS" | grep '|')
EOF
  echo '    *) return 1 ;;'
  echo '  esac'
  echo '}'
}

ch_test_cmd() {
  printf 'TIMEOUT_PADRAO=%s\n\n' "$TIMEOUT_S"
  ch_mapa_cenarios
  echo ""
  case "$LINGUAGEM" in
    python) cat <<'PYCMD'
executar_testes() {
  # SM_FILTRO vazio = suite inteira. Com filtro, o nome vai QUALIFICADO
  # (tests.test_stub.TestStub.test_<cenario>): nome curto o unittest nao resolve.
  # E por isso que o filtro difere de scenarios[].test_name, que guarda o nome curto
  # REPORTADO (`test_<cenario>`) — sao dois papeis, e traduzir_cenario() traz o de filtro.
  if [ -n "$SM_FILTRO" ]; then
    sandbox_exec python3 -B -m unittest -v "$SM_FILTRO"
  else
    sandbox_exec python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v
  fi
}
PYCMD
    ;;
    javascript) cat <<'JSCMD'
ARQUIVO_TESTE="tests/stub.test.mjs"
executar_testes() {
  if [ -n "$SM_FILTRO" ]; then
    sandbox_exec node --test --test-reporter=tap \
      --test-name-pattern="^${SM_FILTRO}$" "$ARQUIVO_TESTE"
  else
    sandbox_exec node --test --test-reporter=tap "$ARQUIVO_TESTE"
  fi
}
JSCMD
    ;;
    go) cat <<'GOCMD'
export GOFLAGS="${GOFLAGS:--mod=mod}"
export GOPROXY="${GOPROXY:-off}"   # SEG-5: o teste roda offline
executar_testes() {
  # -json e o unico formato estavel para contar execucoes (go_test_json_run_events).
  # Layout go_module: stub.go e stub_test.go no MESMO pacote e MESMO diretorio.
  # .solution/ comeca com ponto, e o go tool ignora diretorio com ponto — verificado.
  if [ -n "$SM_FILTRO" ]; then
    sandbox_exec go test -json -run "^${SM_FILTRO}$" ./...
  else
    sandbox_exec go test -json ./...
  fi
}
GOCMD
    ;;
    rust) cat <<'RSCMD'
export CARGO_TERM_COLOR=never
executar_testes() {
  # Sem filtro por padrao: e a forma segura num desafio de um arquivo so.
  # As funcoes #[test] vivem no TOPO de tests/test_stub.rs (teste de integracao, sem
  # `mod tests`), entao o cargo reporta e filtra pelo nome CURTO: `test <cenario> ... ok`.
  # `-- --exact` e obrigatorio: sem ele o filtro e por substring.
  if [ -n "$SM_FILTRO" ]; then
    sandbox_exec cargo test --offline "$SM_FILTRO" -- --exact
  else
    sandbox_exec cargo test --offline
  fi
}
RSCMD
    ;;
    c) cat <<'CCMD'
executar_testes() {
  # counter_protocol: o proprio teste conta e imprime TESTS_RUN/TESTS_FAILED.
  # assert.h abortaria no primeiro erro (SIGABRT/134) e esconderia os outros cenarios.
  mkdir -p .build
  SM_ONLY="$SM_FILTRO" sandbox_exec bash -c '
    set -e
    gcc -std=c11 -g -O0 -Wall -o .build/test_bin stub.c tests/test_stub.c -lm
    exec .build/test_bin'
}
CCMD
    ;;
  esac
}

ch_count_probe() {
  case "$PROBE" in
    python_unittest_ran_line) cat <<'P1'
contar_testes() {
  # Ultima linha "Ran N tests" (o unittest escreve em stderr; o runner junta 2>&1).
  local n
  n="$(grep -Eo '^Ran [0-9]+ tests?' "$SAIDA" | tail -1 | grep -Eo '[0-9]+')" || n=""
  printf '%s' "${n:-0}"
}
mostrar_saida() { cat "$SAIDA"; }
P1
    ;;
    node_test_tap_summary) cat <<'P2'
contar_testes() {
  # ARMADILHA VERIFICADA: um arquivo de teste vazio faz o node contar o PROPRIO
  # ARQUIVO ("ok 1 - tests/stub.test.mjs", "# tests 1", EXIT=0). Por isso todo rotulo
  # igual a um caminho passado na linha de comando e descartado aqui. Se sobrar zero,
  # nada rodou — e a igualdade com ESPERADO transforma isso em count_mismatch.
  local n
  n="$(grep -E '^[[:space:]]*(not )?ok [0-9]+ - ' "$SAIDA" \
       | sed -E 's/^[[:space:]]*(not )?ok [0-9]+ - //' \
       | sed -E 's/ # (SKIP|TODO).*$//' \
       | grep -vxF "$ARQUIVO_TESTE" \
       | grep -c .)" || n=""
  printf '%s' "${n:-0}"
}
mostrar_saida() { cat "$SAIDA"; }
P2
    ;;
    go_test_json_run_events) cat <<'P3'
contar_testes() {
  # Conta valores DISTINTOS de "Test" em eventos "Action":"run".
  # Com o layout generico (teste em tests/) isso da 0 e o go test sai 0: o falso
  # positivo mais perigoso do projeto. A igualdade com ESPERADO e o que o pega.
  local n
  n="$(grep -E '"Action":"run"' "$SAIDA" | grep -oE '"Test":"[^"]+"' | sort -u | grep -c .)" || n=""
  printf '%s' "${n:-0}"
}
mostrar_saida() {
  # -json e formato de maquina; devolve a saida legivel ao aluno.
  local decodificado
  decodificado="$(sed -n 's/.*"Output":"\(.*\)"}$/\1/p' "$SAIDA" \
                  | sed 's/\\n$//; s/\\t/\t/g; s/\\"/"/g; s/\\\\/\\/g')"
  if [ -n "$decodificado" ]; then printf '%s\n' "$decodificado"; else cat "$SAIDA"; fi
}
P3
    ;;
    cargo_test_running_lines) cat <<'P4'
contar_testes() {
  # O cargo imprime UMA linha "running N tests" POR BINARIO de teste (lib +
  # integracao): e preciso SOMAR. Verificado: "running 0 tests" + "running 2 tests" = 2.
  local total=0 n
  while read -r n; do total=$(( total + n )); done < <(
    grep -Eo '^running [0-9]+ tests?' "$SAIDA" | grep -Eo '[0-9]+')
  printf '%s' "$total"
}
mostrar_saida() { cat "$SAIDA"; }
P4
    ;;
    counter_protocol) cat <<'P5'
contar_testes() {
  # O teste imprime TESTS_RUN=<n> / TESTS_FAILED=<n> em stdout (docs/05 §3.2).
  local n
  n="$(grep -Eo '^TESTS_RUN=[0-9]+' "$SAIDA" | tail -1 | grep -Eo '[0-9]+')" || n=""
  printf '%s' "${n:-0}"
}
mostrar_saida() { cat "$SAIDA"; }
P5
    ;;
  esac
}

ch_run_cmd_humano() { # o que o README do desafio manda o aluno digitar
  printf './runner.sh'
}

# ---------------------------------------------------------------------------
# 10. Caminhos por layout_profile
# ---------------------------------------------------------------------------
# A arvore generica NAO serve para Go nem para Rust — verificado por execucao.
case "$PERFIL" in
  generic)
    case "$LINGUAGEM" in
      python)     STUB_REL="stub.py";  TESTE_REL="tests/test_stub.py" ;;
      javascript) STUB_REL="stub.mjs"; TESTE_REL="tests/stub.test.mjs" ;;
      c)          STUB_REL="stub.c";   TESTE_REL="tests/test_stub.c" ;;
    esac
    ;;
  go_module)
    # go.mod obrigatorio; teste com sufixo _test.go, no MESMO diretorio e pacote.
    STUB_REL="stub.go"; TESTE_REL="stub_test.go"
    ;;
  cargo_crate)
    # Cargo.toml obrigatorio; fonte DENTRO de src/; teste de integracao direto em tests/.
    STUB_REL="src/lib.rs"; TESTE_REL="tests/test_stub.rs"
    ;;
  *) sm_die 1 "layout_profile '$PERFIL' sem arvore implementada." ;;
esac

SOL_DIR=".solution"
REF_REL="$SOL_DIR/reference.$EXT"
ALT1_REL="$SOL_DIR/reference_alt_recursiva.$EXT"
ALT2_REL="$SOL_DIR/reference_alt_acumulador.$EXT"
EMPTY_REL="$SOL_DIR/empty_stub.$EXT"

MANIFEST_PATHS='[]'
SUPPORT_PATHS='[]'
case "$PERFIL" in
  go_module)   MANIFEST_PATHS='["go.mod"]' ;;
  cargo_crate) MANIFEST_PATHS='["Cargo.toml"]'; SUPPORT_PATHS='["target/"]' ;;
esac
[ "$LINGUAGEM" = "c" ]      && SUPPORT_PATHS='["stub.h",".build/"]'
[ "$LINGUAGEM" = "python" ] && SUPPORT_PATHS='["tests/__init__.py"]'

# ---------------------------------------------------------------------------
# 11. Mapa de placeholders
# ---------------------------------------------------------------------------
CRIADO_EM="$(sm_now_iso)"
SCENARIOS_JSON="$(ch_cenarios_json)"
CONCEPT_JSON="$(jq -n -c --arg c "$CONCEPT" --arg l "$CONCEPT_IN" \
  '[{concept_id:$c, label:$l, role:"primary"}]')"

ENUNCIADO="[RASCUNHO gerado por challenge-new.sh — o tutor reescreve este enunciado antes da
validacao.] Implemente \`$FUNC_NAME\` para o conceito \`$CONCEPT\`. A semente canonica calcula o
fatorial de um inteiro nao negativo: o produto de todos os inteiros de 1 ate n, com fatorial(0)
valendo 1 por definicao.

Edite **somente** o arquivo \`$STUB_REL\`. O arquivo de teste \`$TESTE_REL\` e a especificacao:
leia a vontade, nao precisa alterar.

Se voce acha que o teste esta errado, me diga — testes gerados automaticamente erram, e eu revalido."

ch_set CHALLENGE_ID       "$CHALLENGE_ID"
ch_set TITLE              "$TITULO"
ch_set STATEMENT          "$ENUNCIADO"
ch_set SCENARIOS_TABLE    "$(ch_tabela_cenarios)"
ch_set LANGUAGE           "$LINGUAGEM"
ch_set RUN_CMD            "$(ch_run_cmd_humano)"
ch_set LAYOUT_PROFILE     "$PERFIL"
ch_set CONCEPT_IDS        "$CONCEPT_JSON"
ch_set SCENARIOS_JSON     "$SCENARIOS_JSON"
ch_set EXPECTED_TEST_COUNT "$CENARIOS_N"
ch_set CREATED_AT         "$CRIADO_EM"
ch_set SCHEMA_VERSION     "$SM_SCHEMA_VERSION"
ch_set TEST_CMD           "$(ch_test_cmd)"
ch_set COUNT_PROBE        "$(ch_count_probe)"
ch_set FUNC_NAME          "$FUNC_NAME"
ch_set SCENARIOS_CODE     "$(ch_codigo_cenarios)"
ch_set MODULE             "$(case "$LINGUAGEM" in python) echo stub ;; javascript) echo '../stub.mjs' ;; *) echo stub ;; esac)"
ch_set PKG                "desafio"
ch_set CRATE              "desafio"
ch_set GO_VERSION         "$(go version 2>/dev/null | grep -Eo 'go[0-9]+\.[0-9]+' | head -1 | sed 's/^go//' || true)"
ch_set DOCSTRING          "Calcula o resultado pedido pelo enunciado. Devolva o valor; nao imprima nada."
# SIGNATURE e a DECLARACAO INTEIRA da funcao, nas 5 linguagens — nome incluido. Os cinco
# `*/stub.*.tmpl` interpolam `{{SIGNATURE}}` como a linha da declaracao e so acrescentam o
# abridor da linguagem (`{`; em Python o `:` ja vem na propria declaracao). Antes, quatro
# templates repetiam `def {{FUNC_NAME}}({{SIGNATURE}}):` e o stub saia
# `def fatorial(def fatorial(n):):` — invalido em Python, Node, Go e Rust.
# Go leva resultado NOMEADO (`saida`): o `return` nu do stub so compila assim. O nome nao pode
# ser `resultado`, que e a variavel dos corpos de ch_corpo_referencia (seria redeclaracao).
case "$LINGUAGEM" in
  python)     ch_set SIGNATURE "def $FUNC_NAME(n):" ;;
  javascript) ch_set SIGNATURE "export function $FUNC_NAME(n)" ;;
  go)         ch_set SIGNATURE "func $FUNC_NAME(n int) (saida int64)" ;;
  rust)       ch_set SIGNATURE "pub fn $FUNC_NAME(n: u64) -> u64" ;;
  c)          ch_set SIGNATURE "long $FUNC_NAME(long n)" ;;
esac

# ---------------------------------------------------------------------------
# 12. Materializacao da arvore
# ---------------------------------------------------------------------------
mkdir -p -- "$CH_DIR/$SOL_DIR"
[ "$PERFIL" = "cargo_crate" ] && mkdir -p -- "$CH_DIR/src"
case "$TESTE_REL" in */*) mkdir -p -- "$CH_DIR/$(dirname -- "$TESTE_REL")" ;; esac

TMPL_SUB=""
case "$LINGUAGEM" in
  python)     TMPL_SUB="python" ;;
  javascript) TMPL_SUB="node" ;;
  go)         TMPL_SUB="go" ;;
  rust)       TMPL_SUB="rust" ;;
  c)          TMPL_SUB="c" ;;
esac

# --- visiveis ---
ch_materializar "challenge/README.md.tmpl" "$CH_DIR/README.md"
ch_materializar "challenge/runner.sh.tmpl" "$CH_DIR/runner.sh"
chmod 0755 -- "$CH_DIR/runner.sh"

case "$LINGUAGEM" in
  python)
    ch_materializar "challenge/python/stub.py.tmpl"       "$CH_DIR/$STUB_REL"
    ch_materializar "challenge/python/test_stub.py.tmpl"  "$CH_DIR/$TESTE_REL"
    # tests/ precisa ser um PACOTE de verdade: o unittest do Python 3.14 recusa
    # "Start directory is not importable" para namespace package, e e esse arquivo
    # que faz `-t .` e o filtro qualificado `tests.test_stub....` funcionarem.
    printf '# Faz de tests/ um pacote: sem isto o `unittest discover -t .` recusa o diretorio.\n' \
      | sm_atomic_write "$CH_DIR/tests/__init__.py"
    ;;
  javascript)
    ch_materializar "challenge/node/stub.mjs.tmpl"        "$CH_DIR/$STUB_REL"
    ch_materializar "challenge/node/stub.test.mjs.tmpl"   "$CH_DIR/$TESTE_REL"
    ;;
  go)
    ch_materializar "challenge/go/go.mod.tmpl"            "$CH_DIR/go.mod"
    ch_materializar "challenge/go/stub.go.tmpl"           "$CH_DIR/$STUB_REL"
    ch_materializar "challenge/go/stub_test.go.tmpl"      "$CH_DIR/$TESTE_REL"
    ;;
  rust)
    ch_materializar "challenge/rust/Cargo.toml.tmpl"      "$CH_DIR/Cargo.toml"
    ch_materializar "challenge/rust/lib.rs.tmpl"          "$CH_DIR/$STUB_REL"
    ch_materializar "challenge/rust/test_stub.rs.tmpl"    "$CH_DIR/$TESTE_REL"
    ;;
  c)
    ch_materializar "challenge/c/stub.c.tmpl"             "$CH_DIR/$STUB_REL"
    ch_materializar "challenge/c/test_stub.c.tmpl"        "$CH_DIR/$TESTE_REL"
    # header com o prototipo: em C nao ha import, e sem declaracao o link falha
    # (ou, pior, o compilador antigo assume declaracao implicita). E o cabecalho que
    # tests/test_stub.c inclui — incluir o ../stub.c daria dupla definicao no link.
    printf '#ifndef STUB_H\n#define STUB_H\n\n%s;\n\n#endif\n' "$(jq -r '.SIGNATURE' "$SM_TMP/valores.json")" \
      | sm_atomic_write "$CH_DIR/stub.h"
    # `.build/` precisa EXISTIR antes do primeiro build: o build_command grava direto em
    # `.build/test_bin` e o `ld` nao cria o diretorio de saida. Sem isto o passo 0 de
    # challenge-verify.sh reprova todo desafio em C com build_failed, e o `mkdir -p .build`
    # do runner.sh nao salva — o harness roda o build_command do meta.json, nao o runner.
    mkdir -p -- "$CH_DIR/.build"
    ;;
esac

# --- ocultos: .solution/ ---
# empty_stub e a COPIA CANONICA do stub recem-materializado: e o que permite
# reexecutar o passo 1 depois que o aluno ja editou o stub, sem destruir o trabalho dele.
cp -- "$CH_DIR/$STUB_REL" "$CH_DIR/$EMPTY_REL"

ch_corpo_referencia() { # <variante: ref|recursiva|acumulador>
  local v="$1"
  case "$LINGUAGEM:$v" in
    python:ref)         printf '    resultado = 1\n    for i in range(2, n + 1):\n        resultado *= i\n    return resultado\n' ;;
    python:recursiva)   printf '    if n <= 1:\n        return 1\n    return n * %s(n - 1)\n' "$FUNC_NAME" ;;
    python:acumulador)  printf '    from functools import reduce\n    from operator import mul\n    return reduce(mul, range(1, n + 1), 1)\n' ;;

    javascript:ref)        printf '  let resultado = 1;\n  for (let i = 2; i <= n; i += 1) resultado *= i;\n  return resultado;\n' ;;
    javascript:recursiva)  printf '  if (n <= 1) return 1;\n  return n * %s(n - 1);\n' "$FUNC_NAME" ;;
    javascript:acumulador) printf '  return Array.from({ length: n }, (_, i) => i + 1).reduce((a, b) => a * b, 1);\n' ;;

    go:ref)        printf '\tvar resultado int64 = 1\n\tfor i := int64(2); i <= int64(n); i++ {\n\t\tresultado *= i\n\t}\n\treturn resultado\n' ;;
    go:recursiva)  printf '\tif n <= 1 {\n\t\treturn 1\n\t}\n\treturn int64(n) * %s(n-1)\n' "$FUNC_NAME" ;;
    go:acumulador) printf '\tresultado := int64(1)\n\tfor i := n; i > 1; i-- {\n\t\tresultado *= int64(i)\n\t}\n\treturn resultado\n' ;;

    rust:ref)        printf '    let mut resultado: u64 = 1;\n    for i in 2..=n {\n        resultado *= i;\n    }\n    resultado\n' ;;
    rust:recursiva)  printf '    if n <= 1 {\n        1\n    } else {\n        n * %s(n - 1)\n    }\n' "$FUNC_NAME" ;;
    rust:acumulador) printf '    (1..=n).fold(1u64, |a, b| a * b)\n' ;;

    c:ref)        printf '    long resultado = 1;\n    for (long i = 2; i <= n; i++) {\n        resultado *= i;\n    }\n    return resultado;\n' ;;
    c:recursiva)  printf '    if (n <= 1) {\n        return 1;\n    }\n    return n * %s(n - 1);\n' "$FUNC_NAME" ;;
    c:acumulador) printf '    long resultado = 1;\n    for (long i = n; i > 1; i--) {\n        resultado *= i;\n    }\n    return resultado;\n' ;;
  esac
}

# A referencia e as alternativas nascem do MESMO template do stub, trocando o corpo
# vazio pelo corpo real. Assim elas sao sempre compilaveis no lugar do stub — que e
# exatamente como challenge-verify.sh as usa (copia por cima de stub e roda).
ch_gerar_solucao() { # <variante> <destino rel>
  local v="$1" destino="$2"
  local corpo
  corpo="$(ch_corpo_referencia "$v")"
  python3 - "$CH_DIR/$STUB_REL" "$corpo" <<'PY' | sm_atomic_write "$CH_DIR/$destino"
import sys
stub_path, corpo = sys.argv[1], sys.argv[2]
with open(stub_path, encoding="utf-8") as fh:
    linhas = fh.readlines()
marca_ini = "SM_CORPO_INICIO"
marca_fim = "SM_CORPO_FIM"
ini = fim = None
for i, l in enumerate(linhas):
    if marca_ini in l:
        ini = i
    elif marca_fim in l:
        fim = i
if ini is None or fim is None or fim <= ini:
    sys.stderr.write(
        "o stub materializado nao tem as marcas %s / %s; o template do stub precisa\n"
        "delas para challenge-new.sh derivar reference/reference_alt_*/empty_stub.\n"
        % (marca_ini, marca_fim))
    sys.exit(1)
sys.stdout.write("".join(linhas[:ini]) + corpo + "".join(linhas[fim + 1:]))
PY
}

ch_gerar_solucao ref        "$REF_REL"
ch_gerar_solucao recursiva  "$ALT1_REL"
ch_gerar_solucao acumulador "$ALT2_REL"

# ---------------------------------------------------------------------------
# 13. meta.json — template + merge autoritativo, depois validacao no schema
# ---------------------------------------------------------------------------
ch_materializar "challenge/meta.json.tmpl" "$CH_DIR/meta.json"
sm_json_ok "$CH_DIR/meta.json" || sm_die 5 "o template challenge/meta.json.tmpl nao produziu JSON valido."

TIMEOUT_SOURCE="language_runtime"
if command -v timeout   >/dev/null 2>&1; then TIMEOUT_SOURCE="coreutils_timeout"
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT_SOURCE="coreutils_gtimeout"
elif command -v perl     >/dev/null 2>&1; then TIMEOUT_SOURCE="perl_alarm"
fi

case "$LINGUAGEM" in
  python)     TEST_COMMAND_JSON='["python3","-B","-m","unittest","discover","-s","tests","-t",".","-p","test_*.py","-v"]'; BUILD_JSON='null' ;;
  javascript) TEST_COMMAND_JSON='["node","--test","--test-reporter=tap","tests/stub.test.mjs"]'; BUILD_JSON='null' ;;
  go)         TEST_COMMAND_JSON='["go","test","-json","./..."]'; BUILD_JSON='["go","build","./..."]' ;;
  rust)       TEST_COMMAND_JSON='["cargo","test","--offline"]'; BUILD_JSON='["cargo","build","--offline"]' ;;
  c)          TEST_COMMAND_JSON='[".build/test_bin"]'; BUILD_JSON='["gcc","-std=c11","-g","-O0","-Wall","-o",".build/test_bin","stub.c","tests/test_stub.c","-lm"]' ;;
esac

ALT_PATHS_JSON="$(jq -n -c --arg a "$ALT1_REL" --arg b "$ALT2_REL" '[$a,$b]')"

jq \
  --arg schema_version "$SM_SCHEMA_VERSION" \
  --arg challenge_id "$CHALLENGE_ID" \
  --arg slug "$SLUG" \
  --arg title "$TITULO" \
  --arg created_at "$CRIADO_EM" \
  --arg language "$LINGUAGEM" \
  --arg runtime_version "$RUNTIME_VERSAO" \
  --arg test_framework "$FRAMEWORK" \
  --arg layout_profile "$PERFIL" \
  --arg skill_level "$SKILL_LEVEL" \
  --argjson difficulty "$DIFICULDADE" \
  --argjson target_concepts "$CONCEPT_JSON" \
  --arg statement_path "README.md" \
  --arg stub_path "$STUB_REL" \
  --arg test_path "$TESTE_REL" \
  --arg runner_path "runner.sh" \
  --arg hidden_dir "$SOL_DIR/" \
  --arg reference_path "$REF_REL" \
  --argjson reference_alt_paths "$ALT_PATHS_JSON" \
  --arg empty_stub_path "$EMPTY_REL" \
  --argjson manifest_paths "$MANIFEST_PATHS" \
  --argjson support_paths "$SUPPORT_PATHS" \
  --argjson test_command "$TEST_COMMAND_JSON" \
  --argjson build_command "$BUILD_JSON" \
  --argjson timeout_seconds "$TIMEOUT_S" \
  --argjson expected_test_count "$CENARIOS_N" \
  --arg test_count_probe "$PROBE" \
  --argjson known_failure_code "$CODIGO_FALHA" \
  --arg timeout_source "$TIMEOUT_SOURCE" \
  --argjson scenarios "$SCENARIOS_JSON" \
  --arg protocol_version "$SM_PROTOCOL_VERSION" \
  '
  .schema_version   = $schema_version
| .challenge_id     = $challenge_id
| .slug             = $slug
| .title            = $title
| .created_at       = $created_at
| .updated_at       = $created_at
| .language         = $language
| .layout_profile   = $layout_profile
| .skill_level      = $skill_level
| .difficulty       = $difficulty
| .target_concepts  = $target_concepts
| .challenge_status = "draft"
| (if ($runtime_version | length) > 0 then .runtime_version = $runtime_version else . end)
| .test_framework   = $test_framework
| .artifacts = {
    statement_path: $statement_path,
    stub_path: $stub_path,
    test_path: $test_path,
    runner_path: $runner_path,
    hidden_dir: $hidden_dir,
    reference_path: $reference_path,
    reference_alt_paths: $reference_alt_paths,
    empty_stub_path: $empty_stub_path,
    manifest_paths: $manifest_paths,
    support_paths: $support_paths
  }
| .execution = ({
    test_command: $test_command,
    working_dir: ".",
    timeout_seconds: $timeout_seconds,
    cpu_seconds: ($timeout_seconds + 5),
    file_size_blocks: 65536,
    env: { LC_ALL: "C.UTF-8", TZ: "UTC", PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1" },
    expected_test_count: $expected_test_count,
    test_count_probe: $test_count_probe,
    failure_exit_codes: {
      policy: "non_zero_is_failure",
      known_failure_code: $known_failure_code,
      timeout_exit_code: 137,
      requires_output_grep: false
    },
    sandbox: { mode: "posix_floor", network_isolated: false, timeout_source: $timeout_source }
  } | if $build_command == null then . else (.build_command = $build_command) end)
| .scenarios = $scenarios
| .oracle = { strategies: ["reference_impl"], numeric_mode: "exact_int" }
| .validation = {
    protocol_version: $protocol_version,
    harness: "challenge-verify.sh",
    verdict: "not_run",
    generation_attempts: 0,
    steps: {
      step_0_build:        { status: "skipped" },
      step_1_empty_stub:   { status: "skipped" },
      step_2_reference:    { status: "skipped" },
      step_3_alternatives: { status: "skipped" },
      step_4_mutation:     { status: "skipped" },
      step_5_determinism:  { status: "skipped" },
      step_6_counts:       { status: "skipped" }
    }
  }
| .integrity = { policy: "warn", test_sha256: null, reference_sha256: null }
| .student_progress = { attempts: 0, last_result: "not_run", hint_level_used: 0, solution_revealed: false }
' "$CH_DIR/meta.json" > "$SM_TMP/meta.json"

sm_atomic_write "$CH_DIR/meta.json" < "$SM_TMP/meta.json"

if ! sm_json_validate "$CH_DIR/meta.json" "$SM_SCHEMA"; then
  sm_die 5 "o meta.json gerado nao valida contra challenge-manifest.schema.json (erros acima)."
fi

# integrity.test_sha256 nasce null e SO o harness o preenche, na aprovacao.
# Uma LLM nao computa SHA-256; hash inventado faz a deteccao de adulteracao mentir
# para sempre (docs/05 §9.1). Esta assercao existe para que a regra nao se perca.
if [ "$(sm_json_get "$CH_DIR/meta.json" '.integrity.test_sha256')" != "null" ]; then
  sm_die 5 "meta.json nasceu com integrity.test_sha256 preenchido; em draft ele tem que ser null."
fi

# ---------------------------------------------------------------------------
# 14. Guarda final: nenhum {{PLACEHOLDER}} sobrevive no artefato materializado
# ---------------------------------------------------------------------------
if grep -rlF '{{' -- "$CH_DIR" >/dev/null 2>&1; then
  {
    echo "arquivos com placeholder nao substituido:"
    grep -rlF '{{' -- "$CH_DIR" || true
  } >&2
  sm_die 1 "sobrou placeholder no desafio materializado."
fi

# ---------------------------------------------------------------------------
# 15. Pronto
# ---------------------------------------------------------------------------
CH_CRIADO=""   # a partir daqui o diretorio e do aluno: nao se desfaz mais
sm_log info "desafio $CHALLENGE_ID ($LINGUAGEM, layout_profile=$PERFIL) criado em $CH_REL"
printf '%s\n' "$CH_REL"
