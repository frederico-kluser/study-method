#!/usr/bin/env bash
# evals/run-evals.sh — a parte automatizável da suíte de avaliação da skill `study-method`.
#
# O QUE ESTE SCRIPT É: um verificador ESTÁTICO de coerência entre a suíte e o contrato, mais um
# aplicador de padrões de texto sobre transcrições JÁ GRAVADAS.
#
# O QUE ELE NÃO É: um avaliador de comportamento. Ele não conversa com modelo nenhum, não tem
# rede, não decide se uma analogia foi boa e não sabe se a escada subiu no degrau certo. Tudo
# isso ele ENUMERA como MANUAL — e o rodapé diz quantos itens ficaram assim. Se esse número for
# zero, o defeito é do script, não da skill.
#
# LIMITAÇÕES DECLARADAS (impressas no resumo — limitação conhecida vale mais que cobertura fingida):
#   · os padrões de `cases/patterns.tsv` pegam a violação LITERAL; paráfrase escapa;
#   · `require` NUNCA reprova sozinho: existe mais de um jeito certo de escrever uma frase;
#   · o alvo `primeira_frase` é a primeira frase do ARQUIVO de transcrição, não do turno que o
#     avaliador tinha em mente — grave um turno por arquivo quando isso importar;
#   · violações que só aparecem em disco (`memory/`, arquivos criados antes do consentimento)
#     não são verificáveis aqui; os casos EV-10, EV-13 e EV-15 dizem o que olhar.
#
# Uso:  evals/run-evals.sh [-h] [--list] [--strict] [--only E-01,E-04]
# Exit: 0 sem violação · 1 há violação (ou pendência, com --strict) · 2 uso incorreto

set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SELF_DIR/.." && pwd)"
SK="$ROOT/skills/study-method"
SKILL_MD="$SK/SKILL.md"
REFS="$SK/references"
CONTRACT="$ROOT/docs/00-contratos.md"
CASES_DIR="$SELF_DIR/cases"
ROUTING_DIR="$SELF_DIR/routing"
TRANSCRIPTS_DIR="$SELF_DIR/transcripts"
PATTERNS="$CASES_DIR/patterns.tsv"

STRICT=0
ONLY=""

# Prefixos de ID de regra do contrato. Usados para extrair citações dos casos.
RULE_PREFIX='(C|AS|AN|ESC|ERR|MEM|PRIV|SEG|DES|VIZ|BOOT)'
RULE_RE="\\b${RULE_PREFIX}-([0-9]+[ab]?|INICIAL|S|D|R)\\b"

CHECKS=(
  "E-01|as 90 regras permanentes do contrato §9 estão no corpo do SKILL.md"
  "E-02|todo ID de regra citado nos casos existe no SKILL.md ou nas references/"
  "E-03|os casos têm front-matter completo, id único e são pelo menos 10"
  "E-04|os conjuntos de roteamento estão bem formados, sem duplicata e nos dois idiomas"
  "E-05|o campo description do SKILL.md tem gatilho e cláusula de não-uso"
  "E-06|patterns.tsv referencia casos e regras existentes, e as regex compilam"
  "E-07|padrões aplicados às transcrições gravadas"
  "E-08|higiene da suíte: nenhuma afirmação proibida por I-43 nem promessa de ganho pedagógico"
  "E-09|o que exige julgamento humano — enumeração, não verificação"
)

# ------------------------------------------------------------------ argumentos

usage() { sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --list)
      for c in "${CHECKS[@]}"; do printf '%s  %s\n' "${c%%|*}" "${c#*|}"; done
      exit 0 ;;
    --strict) STRICT=1; shift ;;
    --only) ONLY="${2:-}"; [ -n "$ONLY" ] || { printf 'uso incorreto: --only exige valor.\n' >&2; exit 2; }; shift 2 ;;
    --only=*) ONLY="${1#--only=}"; shift ;;
    *) printf 'uso incorreto: argumento desconhecido «%s». Veja --help.\n' "$1" >&2; exit 2 ;;
  esac
done

# ------------------------------------------------------------------ apresentação

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'
  C_CYA=$'\033[36m'; C_MAG=$'\033[35m'; C_DIM=$'\033[2m'; C_BLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_RED=''; C_GRN=''; C_YEL=''; C_CYA=''; C_MAG=''; C_DIM=''; C_BLD=''; C_OFF=''
fi

N_PASS=0; N_FAIL=0; N_PEND=0; N_SKIP=0; N_MANUAL=0
FAILLOG=(); PENDLOG=(); MANUALLOG=()
CUR_ID=""

active() {
  [ -z "$ONLY" ] && return 0
  local want
  IFS=',' read -r -a want <<<"$ONLY"
  local w
  for w in "${want[@]}"; do
    case "$1" in "$w"*) return 0 ;; esac
  done
  return 1
}

section() {
  CUR_ID="$1"
  printf '\n%s\n' "${C_CYA}${C_BLD}── $1 · $2${C_OFF}"
}
ok()     { N_PASS=$((N_PASS+1));   printf '  %sPASS%s  %s\n' "$C_GRN" "$C_OFF" "$1"; }
bad()    { N_FAIL=$((N_FAIL+1));   printf '  %sFAIL%s  %s\n' "$C_RED" "$C_OFF" "$1"; FAILLOG+=("$CUR_ID: $1"); }
pend()   { N_PEND=$((N_PEND+1));   printf '  %sPEND%s  %s\n' "$C_YEL" "$C_OFF" "$1"; PENDLOG+=("$CUR_ID: $1"); }
skip()   { N_SKIP=$((N_SKIP+1));   printf '  %sSKIP%s  %s\n' "$C_DIM" "$C_OFF" "$1"; }
manual() { N_MANUAL=$((N_MANUAL+1)); printf '  %sMANUAL%s %s\n' "$C_MAG" "$C_OFF" "$1"; MANUALLOG+=("$CUR_ID: $1"); }
note()   { printf '        %s%s%s\n' "$C_DIM" "$1" "$C_OFF"; }

printf '%s\n' "${C_BLD}══ evals/run-evals.sh — conformidade estática da suíte de avaliação ══${C_OFF}"
printf '%s\n' "${C_DIM}raiz: $ROOT${C_OFF}"
[ -n "$ONLY" ] && printf '%s\n' "${C_DIM}filtro --only=$ONLY${C_OFF}"
printf '%s\n' "${C_DIM}avaliação de comportamento de modelo NÃO é determinística: o que sai daqui é sinal, não veredito.${C_OFF}"

for f in "$SKILL_MD" "$CONTRACT"; do
  [ -f "$f" ] || { printf '\n%sFATAL%s arquivo obrigatório ausente: %s\n' "$C_RED" "$C_OFF" "$f" >&2; exit 1; }
done

# ------------------------------------------------------------------ auxiliares

# rule_exists <id> — o ID aparece no SKILL.md ou em alguma reference/?
rule_exists() {
  local id="$1"
  grep -qE -e "\\b${id}\\b" "$SKILL_MD" && return 0
  grep -rqE -e "\\b${id}\\b" "$REFS" 2>/dev/null && return 0
  return 1
}

# fm_field <arquivo> <campo> — valor de um campo do front-matter (entre os dois `---`).
fm_field() {
  awk -v key="$2" '
    /^---[[:space:]]*$/ { n++; if (n>=2) exit; next }
    n==1 {
      if (index($0, key ":") == 1) { sub("^" key ":[[:space:]]*", ""); print; exit }
    }
  ' "$1"
}

# ids_in <arquivo> — todos os IDs de regra citados no arquivo, únicos.
ids_in() { grep -ohE -e "$RULE_RE" "$1" 2>/dev/null | sort -u; }

TMPD="$(mktemp -d)"
trap 'rm -rf -- "$TMPD"' EXIT

# ================================================================== E-01
if active E-01; then
section E-01 "as 90 regras permanentes do contrato §9 estão no corpo do SKILL.md"

awk '/^### 9\.1 /,/^## 10\. /' "$CONTRACT" \
  | grep -oE "^\| *${RULE_PREFIX}-[0-9A-Za-z]+" \
  | sed -E 's/^\| *//' | sort -u > "$TMPD/contract-ids.txt" || true

n_contract=$(wc -l < "$TMPD/contract-ids.txt" | tr -d ' ')
if [ "$n_contract" -eq 90 ]; then
  ok "o contrato §9 declara 90 regras com ID"
else
  bad "o contrato §9 declara $n_contract regras com ID, esperado 90 (§9.8 é a fonte do número)"
fi

missing=0
while IFS= read -r id; do
  [ -n "$id" ] || continue
  if ! grep -qE -e "\\*\\*${id}( †)?\\*\\*" "$SKILL_MD"; then
    bad "regra $id do contrato §9 não aparece em negrito no corpo do SKILL.md"
    missing=$((missing+1))
  fi
done < "$TMPD/contract-ids.txt"
[ "$missing" -eq 0 ] && ok "as $n_contract regras do contrato §9 aparecem no corpo do SKILL.md"
note "equivalente à invariante I-33; aqui é insumo da suíte, não substituto de tests/validate.sh"
fi

# ================================================================== E-02
if active E-02; then
section E-02 "todo ID de regra citado nos casos existe no SKILL.md ou nas references/"

if [ ! -d "$CASES_DIR" ]; then
  pend "cases/ ausente"
else
  : > "$TMPD/proposed.txt"
  for f in "$CASES_DIR"/EV-*.md; do
    [ -e "$f" ] || continue
    prop="$(fm_field "$f" regras_propostas || true)"
    if [ -n "$prop" ]; then
      printf '%s\n' "$prop" | tr ',' '\n' | tr -d ' ' | grep -v '^$' >> "$TMPD/proposed.txt" || true
    fi
  done
  sort -u -o "$TMPD/proposed.txt" "$TMPD/proposed.txt"

  : > "$TMPD/cited.txt"
  for f in "$CASES_DIR"/EV-*.md "$CASES_DIR/README.md"; do
    [ -e "$f" ] || continue
    ids_in "$f" >> "$TMPD/cited.txt"
  done
  sort -u -o "$TMPD/cited.txt" "$TMPD/cited.txt"

  n_cited=$(wc -l < "$TMPD/cited.txt" | tr -d ' ')
  bad_ids=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    if grep -qx -e "$id" "$TMPD/proposed.txt"; then
      if rule_exists "$id"; then
        manual "$id está marcada como PROPOSTA mas já existe no contrato — o achado foi endereçado; remova regras_propostas do caso"
      else
        manual "$id é uma regra PROPOSTA pela suíte — não existe no contrato. Achado, não falha."
      fi
      continue
    fi
    if ! rule_exists "$id"; then
      bad "ID citado nos casos não existe em SKILL.md nem em references/: $id"
      bad_ids=$((bad_ids+1))
    fi
  done < "$TMPD/cited.txt"
  [ "$bad_ids" -eq 0 ] && ok "os $n_cited IDs distintos citados nos casos existem nas referências"
  note "prova exigida pelo handoff: nenhum caso cita regra inventada"
fi
fi

# ================================================================== E-03
if active E-03; then
section E-03 "os casos têm front-matter completo, id único e são pelo menos 10"

if [ ! -d "$CASES_DIR" ]; then
  pend "cases/ ausente"
else
  n_cases=0
  : > "$TMPD/case-ids.txt"
  for f in "$CASES_DIR"/EV-*.md; do
    [ -e "$f" ] || continue
    n_cases=$((n_cases+1))
    base="$(basename "$f")"
    for field in id titulo familia regras verificacao; do
      v="$(fm_field "$f" "$field" || true)"
      [ -n "$v" ] || bad "$base: front-matter sem campo obrigatório «$field»"
    done
    cid="$(fm_field "$f" id || true)"
    printf '%s\n' "$cid" >> "$TMPD/case-ids.txt"
    case "$cid" in
      EV-[0-9][0-9]) ;;
      *) bad "$base: id «$cid» fora do formato EV-NN" ;;
    esac
    case "$base" in
      "$cid"-*) ;;
      *) bad "$base: nome do arquivo não começa pelo id «$cid»" ;;
    esac
    v="$(fm_field "$f" verificacao || true)"
    case "$v" in
      automatica|assistida|julgamento) ;;
      *) bad "$base: verificacao «$v» fora do vocabulário {automatica, assistida, julgamento}" ;;
    esac
    # toda regra do front-matter precisa aparecer no corpo do caso
    regras="$(fm_field "$f" regras || true)"
    for rid in $(printf '%s\n' "$regras" | tr ',' ' '); do
      [ -n "$rid" ] || continue
      grep -qE -e "\\b${rid}\\b" "$f" || bad "$base: regra $rid está no front-matter e não aparece no corpo"
    done
  done

  dupes="$(sort "$TMPD/case-ids.txt" | uniq -d | tr '\n' ' ' | sed 's/ $//')"
  [ -z "$dupes" ] && ok "ids de caso únicos" || bad "ids de caso duplicados: $dupes"

  if [ "$n_cases" -ge 10 ]; then
    ok "$n_cases casos (mínimo exigido: 10)"
  else
    bad "$n_cases casos — o mínimo é 10"
  fi
fi
fi

# ================================================================== E-04
if active E-04; then
section E-04 "os conjuntos de roteamento estão bem formados, sem duplicata e nos dois idiomas"

check_routing_set() {
  local file="$1" expected="$2" prefix="$3" min="$4"
  local base; base="$(basename "$file")"
  if [ ! -f "$file" ]; then bad "$base ausente"; return; fi

  local hdr; hdr="$(head -1 "$file")"
  if [ "$hdr" != "$(printf 'id\tidioma\tesperado\tfronteira\tprompt\tpor_que')" ]; then
    bad "$base: cabeçalho TSV inesperado"
  fi

  local n pt en fr bad_rows
  n=$(awk -F'\t' 'NR>1 && NF>0' "$file" | wc -l | tr -d ' ')
  pt=$(awk -F'\t' 'NR>1 && $2=="pt-BR"' "$file" | wc -l | tr -d ' ')
  en=$(awk -F'\t' 'NR>1 && $2=="en"' "$file" | wc -l | tr -d ' ')
  fr=$(awk -F'\t' 'NR>1 && $4=="sim"' "$file" | wc -l | tr -d ' ')

  if [ "$n" -ge "$min" ]; then ok "$base: $n prompts (mínimo $min)"; else bad "$base: $n prompts, mínimo $min"; fi
  if [ "$pt" -gt 0 ] && [ "$en" -gt 0 ]; then
    ok "$base: dois idiomas presentes (pt-BR $pt · en $en)"
  else
    bad "$base: falta um dos idiomas (pt-BR $pt · en $en)"
  fi
  note "$base: $fr prompts de fronteira — são os que informam sobre calibração"

  bad_rows=$(awk -F'\t' -v expv="$expected" -v pfx="$prefix" '
    NR>1 && NF>0 {
      if (NF != 6) { print "NF=" NF; next }
      if ($1 !~ "^" pfx "-[0-9][0-9]$") print "id " $1
      if ($2 != "pt-BR" && $2 != "en") print "idioma " $1
      if ($3 != expv) print "esperado " $1
      if ($4 != "sim" && $4 != "nao") print "fronteira " $1
      if ($5 == "") print "prompt vazio " $1
      if ($6 == "") print "por_que vazio " $1
    }' "$file" | head -20)
  if [ -n "$bad_rows" ]; then
    bad "$base: linhas malformadas"
    printf '%s\n' "$bad_rows" | while IFS= read -r l; do note "$l"; done
  else
    ok "$base: todas as linhas com 6 colunas e vocabulário válido"
  fi

  local dup
  dup=$(awk -F'\t' 'NR>1 && NF>0 {print tolower($5)}' "$file" | sort | uniq -d | head -5)
  [ -z "$dup" ] && ok "$base: sem prompt duplicado" || { bad "$base: prompt duplicado"; printf '%s\n' "$dup" | while IFS= read -r l; do note "$l"; done; }

  local dupid
  dupid=$(awk -F'\t' 'NR>1 && NF>0 {print $1}' "$file" | sort | uniq -d | head -5)
  [ -z "$dupid" ] || { bad "$base: id duplicado"; printf '%s\n' "$dupid" | while IFS= read -r l; do note "$l"; done; }
}

check_routing_set "$ROUTING_DIR/should-trigger.tsv"     "disparar"     "RT" 12
check_routing_set "$ROUTING_DIR/should-not-trigger.tsv" "nao_disparar" "RN" 12

# os dois conjuntos não podem compartilhar prompt
if [ -f "$ROUTING_DIR/should-trigger.tsv" ] && [ -f "$ROUTING_DIR/should-not-trigger.tsv" ]; then
  cross=$(comm -12 \
    <(awk -F'\t' 'NR>1 && NF>0 {print tolower($5)}' "$ROUTING_DIR/should-trigger.tsv" | sort) \
    <(awk -F'\t' 'NR>1 && NF>0 {print tolower($5)}' "$ROUTING_DIR/should-not-trigger.tsv" | sort) | head -5)
  [ -z "$cross" ] && ok "nenhum prompt aparece nos dois conjuntos" || bad "prompt presente nos dois conjuntos: $cross"
fi

manual "a decisão de disparo em si exige harness ou humano — ver routing/README.md §Protocolo"
fi

# ================================================================== E-05
if active E-05; then
section E-05 "o campo description do SKILL.md tem gatilho e cláusula de não-uso"

awk '/^---[[:space:]]*$/{n++; next} n==1' "$SKILL_MD" > "$TMPD/frontmatter.txt"
if grep -q '^description:' "$TMPD/frontmatter.txt"; then
  ok "frontmatter tem campo description"
  sed -n '/^description:/,$p' "$TMPD/frontmatter.txt" > "$TMPD/description.txt"
  dlen=$(wc -c < "$TMPD/description.txt" | tr -d ' ')
  note "description tem $dlen bytes — é o ÚNICO insumo de roteamento da skill"

  miss=0
  for t in "quero estudar" "me ensina" "vamos continuar de onde paramos" "me dá um desafio" "como estou indo" "teach me" "quiz me" "study session" "give me a challenge" "tutor"; do
    grep -qF -e "$t" "$TMPD/description.txt" || { bad "description não contém o gatilho «$t» que a suíte de roteamento assume"; miss=$((miss+1)); }
  done
  [ "$miss" -eq 0 ] && ok "os 10 gatilhos assumidos por routing/should-trigger.tsv estão na description"

  if grep -qF -e "Não use" "$TMPD/description.txt"; then
    ok "description tem cláusula de não-uso (a que deveria segurar os falsos positivos)"
  else
    bad "description sem cláusula de não-uso — routing/should-not-trigger.tsv fica sem apoio textual"
  fi
  amiss=0
  for t in "depurar" "revisar" "sintaxe"; do
    grep -qF -e "$t" "$TMPD/description.txt" || { bad "cláusula de não-uso não menciona «$t»"; amiss=$((amiss+1)); }
  done
  [ "$amiss" -eq 0 ] && ok "a cláusula de não-uso nomeia depurar, revisar e sintaxe"
else
  bad "frontmatter do SKILL.md sem campo description — a skill não tem insumo de roteamento"
fi
fi

# ================================================================== E-06
if active E-06; then
section E-06 "patterns.tsv referencia casos e regras existentes, e as regex compilam"

if [ ! -f "$PATTERNS" ]; then
  pend "cases/patterns.tsv ausente"
else
  hdr="$(head -1 "$PATTERNS")"
  if [ "$hdr" = "$(printf 'case_id\trule_id\tmodo\talvo\tseveridade\tregex\tdescricao')" ]; then
    ok "cabeçalho de patterns.tsv correto"
  else
    bad "cabeçalho de patterns.tsv inesperado"
  fi

  np=0; nbad=0
  while IFS=$'\t' read -r case_id rule_id modo alvo sev re desc; do
    [ -n "${case_id:-}" ] || continue
    [ "$case_id" = "case_id" ] && continue
    np=$((np+1))
    [ -f "$CASES_DIR/$case_id"-*.md ] 2>/dev/null || true
    if ! ls "$CASES_DIR/$case_id"-*.md >/dev/null 2>&1; then
      bad "patterns.tsv linha $np: case_id «$case_id» não tem arquivo em cases/"; nbad=$((nbad+1))
    fi
    if ! rule_exists "$rule_id"; then
      bad "patterns.tsv linha $np: rule_id «$rule_id» não existe nas referências"; nbad=$((nbad+1))
    fi
    case "$modo" in deny|require) ;; *) bad "patterns.tsv linha $np: modo «$modo» inválido"; nbad=$((nbad+1)) ;; esac
    case "$alvo" in turno|primeira_frase) ;; *) bad "patterns.tsv linha $np: alvo «$alvo» inválido"; nbad=$((nbad+1)) ;; esac
    case "$sev" in dura|sinal) ;; *) bad "patterns.tsv linha $np: severidade «$sev» inválida"; nbad=$((nbad+1)) ;; esac
    if [ "$modo" = "require" ] && [ "$sev" = "dura" ]; then
      bad "patterns.tsv linha $np: require+dura é proibido — ausência de padrão nunca reprova sozinha"; nbad=$((nbad+1))
    fi
    [ -n "${desc:-}" ] || { bad "patterns.tsv linha $np: descricao vazia"; nbad=$((nbad+1)); }
    set +e
    printf '' | grep -qE -e "$re" >/dev/null 2>&1
    st=$?
    set -e
    if [ "$st" -ge 2 ]; then
      bad "patterns.tsv linha $np: regex não compila em ERE: $re"; nbad=$((nbad+1))
    fi
  done < "$PATTERNS"
  [ "$nbad" -eq 0 ] && ok "$np padrões: case_id, rule_id, vocabulário e regex válidos"
fi
fi

# ================================================================== E-07
if active E-07; then
section E-07 "padrões aplicados às transcrições gravadas"

shopt -s nullglob
transcripts=("$TRANSCRIPTS_DIR"/EV-*.r*.txt)
shopt -u nullglob

if [ "${#transcripts[@]}" -eq 0 ]; then
  pend "nenhuma transcrição em transcripts/ — nada a verificar ainda (execução é da onda seguinte)"
  note "sem transcrição, este script NÃO tem como dizer nada sobre comportamento. Isto não é um PASS."
elif [ ! -f "$PATTERNS" ]; then
  pend "patterns.tsv ausente"
else
  for t in "${transcripts[@]}"; do
    tb="$(basename "$t")"
    tcase="${tb%%.*}"          # EV-05a
    base_case="$(printf '%s' "$tcase" | sed -E 's/^(EV-[0-9]{2}).*/\1/')"
    # corpo: remove linhas de proveniência iniciadas por '#'
    grep -v '^[[:space:]]*#' "$t" > "$TMPD/body.txt" || true
    # primeira frase: primeira linha não vazia, truncada no primeiro . ? !
    awk 'NF { print; exit }' "$TMPD/body.txt" | sed -E 's/([.?!]).*/\1/' > "$TMPD/first.txt" || true

    hits=0
    while IFS=$'\t' read -r case_id rule_id modo alvo sev re desc; do
      [ -n "${case_id:-}" ] || continue
      [ "$case_id" = "case_id" ] && continue
      [ "$case_id" = "$base_case" ] || continue
      target="$TMPD/body.txt"; [ "$alvo" = "primeira_frase" ] && target="$TMPD/first.txt"
      set +e
      grep -qiE -e "$re" "$target" >/dev/null 2>&1
      m=$?
      set -e
      if [ "$modo" = "deny" ] && [ "$m" -eq 0 ]; then
        if [ "$sev" = "dura" ]; then
          bad "$tb: padrão proibido de $rule_id encontrado em «$alvo» — $desc"
        else
          manual "$tb: indício de $rule_id em «$alvo» — $desc"
        fi
        hits=$((hits+1))
      elif [ "$modo" = "require" ] && [ "$m" -ne 0 ]; then
        manual "$tb: padrão esperado de $rule_id ausente — $desc (ausência é indício, não reprovação)"
        hits=$((hits+1))
      fi
    done < "$PATTERNS"
    [ "$hits" -eq 0 ] && ok "$tb: nenhum padrão proibido, nenhum esperado ausente"
  done
  note "aprovar aqui NÃO é aprovar o caso: a pontuação é humana, por rubric.md"
fi
fi

# ================================================================== E-08
if active E-08; then
section E-08 "higiene da suíte: nenhuma afirmação proibida por I-43 nem promessa de ganho pedagógico"

hits=0
CLAIMS_PROIBIDAS=(
  '2 sigma'                                  # afirmação proibida por I-43
  'd = 1,11'                                 # afirmação proibida por I-43
  'programar desenvolve raciocínio lógico'   # afirmação proibida por I-43
)
for claim in "${CLAIMS_PROIBIDAS[@]}"; do
  [ -n "$claim" ] || continue
  if grep -rqF -e "$claim" "$SELF_DIR" --include='*.md' --include='*.tsv' 2>/dev/null; then
    bad "afirmação proibida por I-43 presente em evals/: «$claim»"
    hits=$((hits+1))
  fi
done
[ "$hits" -eq 0 ] && ok "nenhuma das afirmações literais proibidas por I-43 aparece nos .md/.tsv de evals/"
note "o próprio run-evals.sh é excluído da busca: ele PRECISA conter a lista literal para procurá-la"

if grep -rqE -e '(melhora|aumenta|eleva)[^.]{0,40}(aprendizado|retenção|desempenho|proficiência)[^.]{0,40}[0-9]+[[:space:]]*%' "$SELF_DIR" --include='*.md' 2>/dev/null; then
  bad "evals/ promete ganho pedagógico quantificado — proibido pelo enunciado da suíte"
else
  ok "evals/ não promete ganho pedagógico quantificado"
fi

if grep -rqE -e '(conformidade|aprovação|score) (da suíte|geral)[^.]{0,20}[0-9]+[[:space:]]*%' "$SELF_DIR" --include='*.md' 2>/dev/null; then
  bad "evals/ reporta conformidade em percentual — a rubrica proíbe nota numérica"
else
  ok "evals/ não reporta conformidade em percentual"
fi
note "LIMITAÇÃO: exemplos de fala proibida dentro das tabelas «O que seria violação» são intencionais e NÃO são verificados aqui"
fi

# ================================================================== E-09
if active E-09; then
section E-09 "o que exige julgamento humano — enumeração, não verificação"

if [ -d "$CASES_DIR" ]; then
  for f in "$CASES_DIR"/EV-*.md; do
    [ -e "$f" ] || continue
    cid="$(fm_field "$f" id || true)"
    tit="$(fm_field "$f" titulo || true)"
    ver="$(fm_field "$f" verificacao || true)"
    case "$ver" in
      julgamento) manual "$cid ($ver): $tit" ;;
      assistida)  manual "$cid ($ver): $tit — padrões cobrem só a violação literal" ;;
      automatica) ok "$cid: decidível por padrão, sem julgamento" ;;
    esac
  done
fi
manual "roteamento: 40 prompts × 3 execuções — decisão de disparo não é observável por este script"
manual "EV-10, EV-13 e EV-15: a evidência primária está em DISCO (memory/, arquivos criados), não na transcrição"
manual "baseline sem-skill × com-skill: formato pronto em baseline.md, execução é da onda seguinte"
fi

# ------------------------------------------------------------------ resumo

printf '\n%s\n' "${C_BLD}══ resumo ══${C_OFF}"
printf '  PASS %-4s FAIL %-4s PEND %-4s SKIP %-4s MANUAL %s\n' "$N_PASS" "$N_FAIL" "$N_PEND" "$N_SKIP" "$N_MANUAL"

if [ "${#FAILLOG[@]}" -gt 0 ]; then
  printf '\n%sviolações:%s\n' "$C_RED" "$C_OFF"
  for l in "${FAILLOG[@]}"; do printf '  · %s\n' "$l"; done
fi
if [ "${#PENDLOG[@]}" -gt 0 ]; then
  printf '\n%spendências (pré-requisito ainda inexistente):%s\n' "$C_YEL" "$C_OFF"
  for l in "${PENDLOG[@]}"; do printf '  · %s\n' "$l"; done
fi

printf '\n%s%d itens ficaram em MANUAL — este script NÃO os avaliou.%s\n' "$C_MAG" "$N_MANUAL" "$C_OFF"
printf '%s\n' "${C_DIM}Comportamento de tutor não se verifica com grep. O que sai daqui é conformidade estática${C_OFF}"
printf '%s\n' "${C_DIM}mais padrões literais sobre transcrições gravadas. A pontuação é humana, por evals/rubric.md.${C_OFF}"

printf '\n%s\n' "${C_DIM}limitações declaradas:${C_OFF}"
printf '%s\n' "${C_DIM}  · padrões pegam a violação LITERAL; paráfrase escapa${C_OFF}"
printf '%s\n' "${C_DIM}  · require nunca reprova sozinho — ausência de padrão é indício, não veredito${C_OFF}"
printf '%s\n' "${C_DIM}  · primeira_frase é a primeira frase do ARQUIVO, não do turno que o avaliador tinha em mente${C_OFF}"
printf '%s\n' "${C_DIM}  · violações que só existem em disco não são visíveis aqui${C_OFF}"
printf '%s\n' "${C_DIM}  · sem rede, sem invocação de modelo: nenhuma linha deste script mede aprendizado${C_OFF}"

if [ "$N_FAIL" -gt 0 ]; then exit 1; fi
if [ "$STRICT" -eq 1 ] && [ "$N_PEND" -gt 0 ]; then
  printf '\n%s--strict: pendência reprova.%s\n' "$C_YEL" "$C_OFF"
  exit 1
fi
exit 0
