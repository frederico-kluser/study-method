#!/usr/bin/env bash
# docs-index.sh — passo `load_docs` (docs/00-contratos.md §2, passo 4).
#
# Duas invocações distintas, porque o protocolo REQUEST/APPLY proíbe escrever antes
# da resposta (docs/00-contratos.md §6, RA-1):
#
#   docs-index.sh <setup_root>            varre o `docs/` do setup e grava
#                                         memory/docs-index.json. Determinístico, exit 0.
#   docs-index.sh <setup_root> --select   emite o PEDIDO `select_sections` em stdout e
#                                         sai 10, SEM tocar em disco.
#   docs-index.sh <setup_root> --apply R  valida a RESPOSTA e grava a seleção.
#
# ⚠ LC_ALL=C é obrigatório no awk: sem isso `length()` conta CARACTERES, não bytes, e
#   os offsets saem errados em todo material em pt-BR (medido: 21 contra 23 correto).
#
# ⭐ `left_out[]` é campo obrigatório do docs-index.schema.json: a skill precisa poder
#    declarar ao aluno, POR NOME, o que não leu. Nunca ler pela metade em silêncio.
#
# Exit codes (docs/00-contratos.md §5.1): 0 · 1 · 2 · 3 · 5 · 10
set -euo pipefail

SM_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib/common.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/json.sh disable=SC1091
. "$SM_SCRIPT_DIR/lib/json.sh"

SM_SK_ROOT="$(cd -- "$SM_SCRIPT_DIR/.." && pwd -P)"
SM_SCHEMA_DIR="$SM_SK_ROOT/assets/schemas"
SM_INDEX_SCHEMA="$SM_SCHEMA_DIR/docs-index.schema.json"
SM_REQ_SCHEMA="$SM_SCHEMA_DIR/requests/docs-index.request.schema.json"
SM_RESP_SCHEMA="$SM_SCHEMA_DIR/requests/docs-index.response.schema.json"
SM_RESPONSE_SCHEMA_URN="urn:study-method:schema:docs-index-response:1"
SM_REQUEST_KIND="select_sections"                 # §6.4
SM_INDEX_SCHEMA_VERSION="1.0"

# Constantes de SK/references/docs-ingest.md §Constantes
DI_BUDGET_DEFAULT=80000        # ~20k tokens a 4 bytes/token
DI_MATERIAL_SHARE_NUM=60       # 60% para o material, 40% para a aula
DI_MAX_FILES=200
DI_MAX_TEXT_PER_FILE=5242880   # 5 MB de texto extraído força modo manifesto
DI_HARD_TEXT_CAP=20971520      # 20 MB: acima disso o arquivo não é ingerido

di_usage() {
  cat <<'EOF'
uso: docs-index.sh <setup_root> [--topics t1,t2] [--budget-bytes N] [--force]
                                [--select] [--apply <resposta.json>]

Passo `load_docs`: mede o `docs/` do setup, descobre seções com offsets EM BYTES e
decide o que cabe no orçamento. Imprime em stdout um resumo JSON
{mode, files, selected_sections, excluded, total_ingestible_bytes}.

argumentos
  <setup_root>            raiz do setup do aluno (ou um caminho dentro dele)
  --topics t1,t2          termos do tópico da aula, em snake_case. Entram na pontuação
                          mecânica (heading + corpo). Sem eles, entra o `subject` do
                          manifesto do setup.
  --budget-bytes N        teto de bytes de material nesta rodada (default 80000).
  --force                 reextrai PDF ignorando memory/.cache/docs-text/.
  --select                emite o PEDIDO `select_sections` (exit 10) sem tocar em disco.
  --apply <resposta.json> grava a seleção escolhida pelo modelo.
  -h, --help              esta ajuda

pontuação (mecânica, e só isso)
  score = 3*heading_hits + min(body_hits,10) + (material do aluno ? 1 : 0) - bytes/20000
  `next_topic`, "seção usada nas últimas 3 sessões" e `disputed` NÃO entram: nenhum dos
  três existe em schema algum do projeto (AR-28).

exit codes
  0 ok · 1 erro de execução · 2 uso incorreto · 3 setup não encontrado
  5 validação de schema falhou · 10 needs_model_input
EOF
}

# --------------------------------------------------------------------------- args
di_hint=""; di_topics_csv=""; di_budget=""; di_force=""; di_select=""; di_apply=""
while (($#)); do
  case "$1" in
    -h|--help)        di_usage; exit 0 ;;
    --topics)         [[ $# -ge 2 ]] || sm_die 2 "--topics exige um valor."; di_topics_csv="$2"; shift 2 ;;
    --topics=*)       di_topics_csv="${1#--topics=}"; shift ;;
    --budget-bytes)   [[ $# -ge 2 ]] || sm_die 2 "--budget-bytes exige um valor."; di_budget="$2"; shift 2 ;;
    --budget-bytes=*) di_budget="${1#--budget-bytes=}"; shift ;;
    --force)          di_force=1; shift ;;
    --select)         di_select=1; shift ;;
    --apply)          [[ $# -ge 2 ]] || sm_die 2 "--apply exige um caminho."; di_apply="$2"; shift 2 ;;
    --apply=*)        di_apply="${1#--apply=}"; shift ;;
    --)               shift; break ;;
    -*)               sm_die 2 "flag desconhecida: $1 (veja --help)." ;;
    *)                if [[ -z "$di_hint" ]]; then di_hint="$1"; shift
                      else sm_die 2 "argumento posicional extra: $1"; fi ;;
  esac
done
[[ $# -eq 0 ]] || sm_die 2 "argumento posicional extra: $1"
[[ -z "$di_select" || -z "$di_apply" ]] || sm_die 2 "--select e --apply são mutuamente exclusivos."
if [[ -n "$di_budget" ]]; then
  [[ "$di_budget" =~ ^[0-9]+$ ]] || sm_die 2 "--budget-bytes precisa ser um inteiro: '$di_budget'."
else
  di_budget="$DI_BUDGET_DEFAULT"
fi

sm_require_cmd jq sha256sum || sm_die 1 "jq e sha256sum são obrigatórios para docs-index.sh."

if ! SM_SETUP_ROOT="$(sm_setup_root "$di_hint")"; then
  sm_die 3 "nenhum setup.json legível em '${di_hint:-$PWD}' nem em nenhum ancestral até \$HOME."
fi
SM_MEMORY_DIR="$SM_SETUP_ROOT/memory"
DI_DOCS_ROOT="docs"
DI_DOCS_ABS="$SM_SETUP_ROOT/$DI_DOCS_ROOT"
DI_INDEX_FILE="$SM_MEMORY_DIR/docs-index.json"
DI_MATERIAL_BUDGET=$(( di_budget * DI_MATERIAL_SHARE_NUM / 100 ))

DI_SETUP_ID="$(sm_json_get "$SM_SETUP_ROOT/setup.json" '.setup_id // empty' 2>/dev/null || printf '')"
[[ "$DI_SETUP_ID" =~ ^[0-9a-f]{12}$ ]] || sm_die 5 "setup.json sem setup_id válido (^[0-9a-f]{12}$); docs-index.json não pode ser gravado sem ele."

# ------------------------------------------------------------ termos do tópico
# Ordem de origem: o que o aluno pediu agora (--topics), depois o `subject` do manifesto.
di_terms=()
if [[ -n "$di_topics_csv" ]]; then
  IFS=',' read -r -a di_raw_terms <<<"$di_topics_csv"
  for di_t in "${di_raw_terms[@]}"; do
    di_t="${di_t#"${di_t%%[![:space:]]*}"}"; di_t="${di_t%"${di_t##*[![:space:]]}"}"
    [[ -n "$di_t" ]] || continue
    if di_norm="$(sm_normalize_concept_id "$di_t")"; then di_terms+=("$di_norm"); fi
  done
fi
di_subject="$(sm_json_get "$SM_SETUP_ROOT/setup.json" '.subject // empty' 2>/dev/null || printf '')"
if [[ -n "$di_subject" ]] && di_norm="$(sm_normalize_concept_id "$di_subject")"; then
  di_terms+=("$di_norm")
fi
DI_TERMS_JOINED=""
if ((${#di_terms[@]})); then
  DI_TERMS_JOINED="$(printf '%s|' "${di_terms[@]}")"; DI_TERMS_JOINED="${DI_TERMS_JOINED%|}"
fi

# ================================================================== o motor awk
# LC_ALL=C: length() e substr() passam a contar BYTES. Sem isso, um heading acentuado
# desloca todos os offsets seguintes e o carregamento sob demanda abre no lugar errado.
read -r -d '' DI_AWK <<'AWK' || true
function fold(s,   r) {
  r = s
  gsub("\303\241","a",r); gsub("\303\240","a",r); gsub("\303\242","a",r)
  gsub("\303\243","a",r); gsub("\303\244","a",r)
  gsub("\303\251","e",r); gsub("\303\250","e",r); gsub("\303\252","e",r); gsub("\303\253","e",r)
  gsub("\303\255","i",r); gsub("\303\254","i",r); gsub("\303\256","i",r); gsub("\303\257","i",r)
  gsub("\303\263","o",r); gsub("\303\262","o",r); gsub("\303\264","o",r)
  gsub("\303\265","o",r); gsub("\303\266","o",r)
  gsub("\303\272","u",r); gsub("\303\271","u",r); gsub("\303\273","u",r); gsub("\303\274","u",r)
  gsub("\303\247","c",r); gsub("\303\261","n",r)
  gsub("\303\201","A",r); gsub("\303\200","A",r); gsub("\303\202","A",r)
  gsub("\303\203","A",r); gsub("\303\204","A",r)
  gsub("\303\211","E",r); gsub("\303\210","E",r); gsub("\303\212","E",r); gsub("\303\213","E",r)
  gsub("\303\215","I",r); gsub("\303\214","I",r); gsub("\303\216","I",r); gsub("\303\217","I",r)
  gsub("\303\223","O",r); gsub("\303\222","O",r); gsub("\303\224","O",r)
  gsub("\303\225","O",r); gsub("\303\226","O",r)
  gsub("\303\232","U",r); gsub("\303\231","U",r); gsub("\303\233","U",r); gsub("\303\234","U",r)
  gsub("\303\207","C",r); gsub("\303\221","N",r)
  return r
}
function mkid(h,   r) {
  r = tolower(fold(h))
  gsub(/[^a-z0-9]+/, "_", r)
  sub(/^_+/, "", r); sub(/_+$/, "", r)
  if (length(r) > 80) r = substr(r, 1, 80)
  sub(/_+$/, "", r)
  if (r !~ /^[a-z0-9]/) return ""
  return r
}
function count_hits(txt, distinct,   i, t, tmp, n, tot, low) {
  if (nterms == 0) return 0
  tot = 0
  low = tolower(fold(txt))
  for (i = 1; i <= nterms; i++) {
    t = T[i]
    if (t == "") continue
    gsub(/_/, "[^a-z0-9]+", t)
    tmp = low
    n = gsub(t, "&", tmp)
    if (distinct) { if (n > 0) tot++ } else tot += n
  }
  return tot
}
function is_rule(s) { return (s ~ /^=+[ \t]*$/ || s ~ /^-+[ \t]*$/) }
function headlevel(i,   lv, nd, s, pfx) {
  s = lines[i]
  if (s ~ /^#+[ \t]/) {
    match(s, /^#+/); lv = RLENGTH
    if (lv > 6) return 0
    return lv
  }
  if (ISMD) return 0
  if (is_rule(s)) return 0
  if (s ~ /^[0-9]+(\.[0-9]+)*[ \t]+[^ \t]/) {
    match(s, /^[0-9]+(\.[0-9]+)*/)
    pfx = substr(s, 1, RLENGTH)
    nd = gsub(/\./, ".", pfx)
    lv = nd + 1
    if (lv > 6) lv = 6
    return lv
  }
  if (i < NR && is_rule(lines[i+1]) && length(lines[i+1]) >= 3 && s ~ /[^ \t]/) {
    return (lines[i+1] ~ /^=/) ? 1 : 2
  }
  if (s ~ /[A-Z]/ && s !~ /[a-z]/ && length(s) <= 60 && s ~ /[A-Z]{3}/) return 1
  return 0
}
function headtext(i,   s) {
  s = lines[i]
  sub(/^#+[ \t]+/, "", s)
  sub(/[ \t]+#+[ \t]*$/, "", s)
  sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s)
  gsub(/\t/, " ", s)
  return s
}
BEGIN { nterms = (TERMS == "" ? 0 : split(TERMS, T, "|")) }
{ lines[NR] = $0; lb[NR] = length($0) + 1 }
END {
  off = 0
  for (i = 1; i <= NR; i++) { ofs[i] = off; off += lb[i] }
  total = (FILESIZE > 0 ? FILESIZE : off)
  pg = 1
  for (i = 1; i <= NR; i++) { pageat[i] = pg; tmp = lines[i]; pg += gsub(/\014/, "\014", tmp) }
  npages = (pg > 1 ? pg - 1 : 1)
  printf "T\t%d\t%d\n", total, (ISPDF ? npages : 0)
  nh = 0
  for (i = 1; i <= NR; i++) {
    lv = headlevel(i)
    if (lv > 0 && headtext(i) != "") { nh++; hidx[nh] = i; hlv[nh] = lv }
  }
  if (nh == 0) exit
  for (k = 1; k <= nh; k++) {
    i = hidx[k]
    start = (k == 1 ? 0 : ofs[i])
    end   = (k == nh ? total : ofs[hidx[k+1]])
    if (end < start) end = start
    head = headtext(i)
    hh = count_hits(head, 1)
    from = (k == 1 ? 1 : i)
    to   = (k == nh ? NR : hidx[k+1] - 1)
    bh = 0
    for (j = from; j <= to; j++) bh += count_hits(lines[j], 0)
    if (bh > 10) bh = 10
    id = mkid(head)
    if (id != "") {
      seen[id]++
      if (seen[id] > 1) id = substr(id "_" seen[id], 1, 80)
    }
    pfrom = pageat[from]; pto = pageat[to]
    printf "S\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%s\t%s\n", hlv[k], start, end - start, hh, bh, pfrom, pto, id, head
  }
}
AWK

DI_PY_IPYNB='
import json, sys
try:
    nb = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    sys.exit(1)
for c in nb.get("cells", []):
    if c.get("cell_type") in ("markdown", "code"):
        sys.stdout.write("".join(c.get("source", [])))
        sys.stdout.write("\n\n")
'

# ============================================================ extração de texto
di_ext_of() { local b; b="$(basename -- "$1")"; b="${b##*.}"; printf '%s' "${b,,}"; }

di_kind_of() {   # enum de docs-index.schema.json: markdown|text|pdf|html|binary|unknown
  case "$1" in
    md|markdown)                       printf 'markdown' ;;
    txt|rst|org|tex|csv|tsv|ipynb)     printf 'text' ;;
    pdf)                               printf 'pdf' ;;
    html|htm)                          printf 'html' ;;
    png|jpg|jpeg|gif|webp|bmp|tiff|svg|zip|gz|tar|xz|mp3|mp4|mkv|bin|exe|so|o|a|woff|woff2|ttf) printf 'binary' ;;
    *)                                 printf 'unknown' ;;
  esac
}

di_pdf_text() {  # $1 abs, $2 sha256
  local cache="$SM_MEMORY_DIR/.cache/docs-text/$2.txt"
  if [[ -f "$cache" && -z "$di_force" ]]; then cat -- "$cache"; return 0; fi
  if [[ -n "$di_select" || -n "$di_apply" ]]; then
    # RA-1: a fase de PEDIDO não escreve nada em disco — nem cache.
    pdftotext -layout -- "$1" - 2>/dev/null
    return $?
  fi
  mkdir -p -- "$(dirname -- "$cache")" || return 1
  pdftotext -layout -- "$1" - 2>/dev/null | sm_atomic_write "$cache" || return 1
  cat -- "$cache"
}

di_text_stream() {   # $1 abs, $2 ext, $3 sha256
  case "$2" in
    csv|tsv)   head -n 6 -- "$1" ;;
    ipynb)     python3 -c "$DI_PY_IPYNB" "$1" ;;
    html|htm)  sed -e 's/<[^>]*>//g' -- "$1" ;;
    pdf)       di_pdf_text "$1" "$3" ;;
    *)         cat -- "$1" ;;
  esac
}

# ================================================================== a varredura
DI_FILE_JSONS=()
DI_CAND_JSONS=()
DI_NOT_INGESTED=()
DI_TOTAL=0
DI_NFILES=0
DI_FORCE_INDEXED=0
DI_MAX_MTIME=0

di_note_not_ingested() {   # $1 path relativo, $2 reason, $3 detail
  DI_NOT_INGESTED+=("$(jq -n -c --arg p "$1" --arg r "$2" --arg d "$3" \
    '{path:$p, reason:$r, detail:(if $d == "" then null else $d end)}')")
}

di_scan() {
  local -a student=() generated=() symlinks=()
  local f rel

  if [[ ! -d "$DI_DOCS_ABS" ]]; then
    sm_log warn "não há '$DI_DOCS_ROOT/' em $SM_SETUP_ROOT. A skill não cria conteúdo lá: crie a pasta e ponha o material."
    return 0
  fi

  while IFS= read -r -d '' f; do
    rel="${f#"$DI_DOCS_ABS"/}"
    if [[ "$rel" == generated/* ]]; then generated+=("$rel"); else student+=("$rel"); fi
  done < <(find "$DI_DOCS_ABS" -type f -print0 2>/dev/null | sort -z)

  while IFS= read -r -d '' f; do
    symlinks+=("${f#"$DI_DOCS_ABS"/}")
  done < <(find "$DI_DOCS_ABS" -type l -print0 2>/dev/null | sort -z)

  local target
  for rel in "${symlinks[@]:-}"; do
    [[ -n "$rel" ]] || continue
    target="$(readlink -f -- "$DI_DOCS_ABS/$rel" 2>/dev/null || printf '')"
    if [[ -z "$target" || "$target" != "$SM_SETUP_ROOT"/* ]]; then
      di_note_not_ingested "$rel" "symlink_outside_setup" "link aponta para fora do setup; nunca é seguido."
    fi
  done

  # Ordem: material do aluno na raiz primeiro, `generated/` depois — o começo do
  # contexto é a posição forte da curva em U e ela pertence ao material real.
  local -a ordered=()
  ((${#student[@]}))   && ordered+=("${student[@]}")
  ((${#generated[@]})) && ordered+=("${generated[@]}")

  DI_NFILES=${#ordered[@]}
  if ((DI_NFILES > DI_MAX_FILES)); then
    sm_log warn "$DI_NFILES arquivos no $DI_DOCS_ROOT/ do setup (teto: $DI_MAX_FILES): indexo os $DI_MAX_FILES primeiros e declaro o resto."
    local i
    for ((i = DI_MAX_FILES; i < DI_NFILES; i++)); do
      di_note_not_ingested "${ordered[$i]}" "too_large" "acima do teto de $DI_MAX_FILES arquivos por varredura."
    done
    ordered=("${ordered[@]:0:$DI_MAX_FILES}")
    DI_FORCE_INDEXED=1
  fi

  local abs ext kind prov bytes sha mtime_epoch mtime_iso readable pages
  local awk_out tline slines extracted secs_all sections cands
  for rel in "${ordered[@]:-}"; do
    [[ -n "$rel" ]] || continue
    abs="$DI_DOCS_ABS/$rel"
    ext="$(di_ext_of "$abs")"
    kind="$(di_kind_of "$ext")"
    if [[ "$rel" == generated/* ]]; then prov="generated"; else prov="student_provided"; fi
    bytes="$(stat -c %s -- "$abs" 2>/dev/null || printf '0')"
    mtime_epoch="$(stat -c %Y -- "$abs" 2>/dev/null || printf '0')"
    ((mtime_epoch > DI_MAX_MTIME)) && DI_MAX_MTIME=$mtime_epoch
    mtime_iso="$(date -d "@$mtime_epoch" +%Y-%m-%dT%H:%M:%S%:z)"
    sha=""
    if [[ -r "$abs" ]]; then sha="$(sha256sum -- "$abs" | cut -d' ' -f1)"; fi

    readable=false; pages=null; extracted=null; local cache_rel=null
    secs_all='[]'; sections='[]'; cands='[]'

    if [[ ! -r "$abs" ]]; then
      di_note_not_ingested "$rel" "unreadable" "sem permissão de leitura."
    elif [[ "$kind" == "binary" ]]; then
      di_note_not_ingested "$rel" "binary" "conteúdo binário; não há texto a ingerir."
    elif [[ "$kind" == "unknown" ]]; then
      case "$ext" in
        docx|odt|epub) di_note_not_ingested "$rel" "no_extractor" "precisa de pandoc, que não está nesta máquina. Sugestão: 'sudo pacman -S pandoc' (Arch) ou exportar para .md/.txt. Eu nunca instalo nada." ;;
        *)             di_note_not_ingested "$rel" "unsupported_format" "a skill não lê esse formato; exportar para .md ou .txt resolve." ;;
      esac
    elif [[ "$kind" == "pdf" ]] && ! command -v pdftotext >/dev/null 2>&1; then
      di_note_not_ingested "$rel" "no_extractor" "não há extrator de PDF nesta máquina. Sugestão: 'sudo pacman -S poppler' (Arch) ou 'sudo apt install poppler-utils' (Debian) — eu SUGIRO, nunca instalo. Alternativa: exportar para .txt/.md."
    else
      local ismd=0 ispdf=0
      [[ "$kind" == "markdown" ]] && ismd=1
      [[ "$kind" == "pdf" ]] && ispdf=1
      # Offsets só são offsets DO ARQUIVO quando o texto é o próprio arquivo.
      local file_offsets=0
      case "$ext" in md|markdown|txt|rst|org|tex) file_offsets=1 ;; esac
      local filesize_arg=0
      ((file_offsets)) && filesize_arg="$bytes"

      awk_out=""
      if ! awk_out="$(di_text_stream "$abs" "$ext" "$sha" \
            | LC_ALL=C awk -v TERMS="$DI_TERMS_JOINED" -v ISMD="$ismd" -v ISPDF="$ispdf" \
                           -v FILESIZE="$filesize_arg" -- "$DI_AWK")"; then
        di_note_not_ingested "$rel" "unreadable" "a extração de texto falhou."
        awk_out=""
      fi

      if [[ -n "$awk_out" ]]; then
        tline="$(printf '%s\n' "$awk_out" | awk -F'\t' '$1 == "T" { print; exit }')"
        slines="$(printf '%s\n' "$awk_out" | awk -F'\t' '$1 == "S"')"
        local tbytes tpages
        tbytes="$(printf '%s' "$tline" | cut -f2)"; tpages="$(printf '%s' "$tline" | cut -f3)"
        [[ "$tbytes" =~ ^[0-9]+$ ]] || tbytes=0
        [[ "$tpages" =~ ^[0-9]+$ ]] || tpages=0

        if ((tbytes > DI_HARD_TEXT_CAP)); then
          di_note_not_ingested "$rel" "too_large" "$tbytes bytes de texto extraído, acima do teto de $DI_HARD_TEXT_CAP."
        else
          readable=true
          extracted="$tbytes"
          DI_TOTAL=$(( DI_TOTAL + tbytes ))
          ((tbytes > DI_MAX_TEXT_PER_FILE)) && DI_FORCE_INDEXED=1
          if ((ispdf)); then
            pages="$tpages"
            [[ -f "$SM_MEMORY_DIR/.cache/docs-text/$sha.txt" ]] && cache_rel="\"memory/.cache/docs-text/$sha.txt\""
            if ((tpages >= 5)) && (( tbytes / tpages < 100 )); then
              sm_log warn "'$rel' parece um PDF escaneado (menos de 100 bytes de texto por página): são imagens, não texto. Sem OCR eu não leio."
            fi
          fi
          secs_all="$(printf '%s\n' "$slines" | jq -Rn --argjson fileoff "$file_offsets" --argjson ispdf "$ispdf" '
            [ inputs | select(length > 0) | split("\t")
              | { level: (.[1]|tonumber), offset: (.[2]|tonumber), bytes: (.[3]|tonumber),
                  hh: (.[4]|tonumber), bh: (.[5]|tonumber),
                  page_from: (.[6]|tonumber), page_to: (.[7]|tonumber),
                  section_id: (if .[8] == "" then null else .[8] end),
                  heading: (.[9] // "") }
              | select(.heading != "")
              | .offset = (if $fileoff == 1 then .offset else null end)
              | .page_from = (if $ispdf == 1 then .page_from else null end)
              | .page_to = (if $ispdf == 1 then .page_to else null end) ]')"
          sections="$(printf '%s' "$secs_all" | jq -c 'map({section_id, heading, level, offset, bytes, page_from, page_to, disputed: null})')"
          cands="$(printf '%s' "$secs_all" | jq -c --arg file "$rel" --arg prov "$prov" '
            map({ file: $file, heading: .heading, section_id: .section_id, bytes: .bytes,
                  provenance: $prov,
                  score: ((3 * .hh) + .bh + (if $prov == "student_provided" then 1 else 0 end) - (.bytes / 20000)),
                  disputed: null, preview: null,
                  offset: .offset, page_from: .page_from, page_to: .page_to })')"
          # Arquivo sem estrutura detectável: uma unidade só (docs-index.schema.json §sections).
          if [[ "$(printf '%s' "$cands" | jq 'length')" -eq 0 ]]; then
            cands="$(jq -n -c --arg file "$rel" --arg prov "$prov" --argjson b "$tbytes" \
              --argjson ispdf "$ispdf" --argjson pages "${pages:-null}" '
              [{ file: $file, heading: "(arquivo inteiro)", section_id: null, bytes: $b,
                 provenance: $prov,
                 score: ((if $prov == "student_provided" then 1 else 0 end) - ($b / 20000)),
                 disputed: null, preview: null,
                 offset: (if $ispdf == 1 then null else 0 end),
                 page_from: (if $ispdf == 1 then 1 else null end),
                 page_to: (if $ispdf == 1 then $pages else null end) }]')"
          fi
        fi
      fi
    fi

    DI_FILE_JSONS+=("$(jq -n -c \
      --arg path "$rel" --arg prov "$prov" --argjson bytes "$bytes" \
      --arg sha "$sha" --arg mtime "$mtime_iso" --arg kind "$kind" \
      --argjson readable "$readable" --argjson pages "$pages" \
      --argjson extracted "$extracted" --argjson cache "$cache_rel" \
      --argjson sections "$sections" \
      '{path:$path, provenance:$prov, bytes:$bytes,
        sha256:(if $sha == "" then null else $sha end),
        mtime:$mtime, kind:$kind, readable:$readable, pages:$pages,
        extracted_text_bytes:$extracted, extract_cache:$cache, sections:$sections}')")

    if [[ "$(printf '%s' "$cands" | jq 'length')" -gt 0 ]]; then
      DI_CAND_JSONS+=("$cands")
    fi
  done
}

di_json_array() {   # junta os JSONs de "$@" num array
  if (($# == 0)); then printf '[]'; return 0; fi
  printf '%s\n' "$@" | jq -sc 'if (.[0]|type) == "array" then add else . end'
}

di_scan
DI_FILES_JSON="$(di_json_array ${DI_FILE_JSONS[@]+"${DI_FILE_JSONS[@]}"})"
DI_CANDS_JSON="$(di_json_array ${DI_CAND_JSONS[@]+"${DI_CAND_JSONS[@]}"})"
DI_NOT_ING_JSON="$(di_json_array ${DI_NOT_INGESTED[@]+"${DI_NOT_INGESTED[@]}"})"
[[ "$DI_CANDS_JSON" == "null" ]] && DI_CANDS_JSON='[]'
[[ "$DI_NOT_ING_JSON" == "null" ]] && DI_NOT_ING_JSON='[]'

DI_MODE="full"
if ((DI_TOTAL > di_budget)) || ((DI_FORCE_INDEXED)); then DI_MODE="indexed"; fi

# ToC: o sumário de todos os cabeçalhos entra SEMPRE em modo indexed. Custa pouco e é o
# que impede o tutor de negar a existência de algo que está na pasta.
DI_TOC_JSON="$(printf '%s' "$DI_CANDS_JSON" | jq -c '
  group_by(.file) | map({ file: .[0].file, heading: null, section_id: null,
                          bytes: (map(.heading | length + 1) | add),
                          reason: "table_of_contents", score: null })')"
DI_TOC_BYTES="$(printf '%s' "$DI_TOC_JSON" | jq '[.[].bytes] | add // 0')"
DI_REMAINING=$(( DI_MATERIAL_BUDGET - DI_TOC_BYTES ))
((DI_REMAINING < 0)) && DI_REMAINING=0

# ======================================================= seleção determinística
di_deterministic_lists() {   # -> {loaded, left_out}
  jq -n -c \
    --argjson cands "$DI_CANDS_JSON" \
    --argjson toc "$DI_TOC_JSON" \
    --argjson files "$DI_FILES_JSON" \
    --argjson notdone "$DI_NOT_ING_JSON" \
    --arg mode "$DI_MODE" \
    --argjson remaining "$DI_REMAINING" '
    def hint: if .page_from != null then "páginas \(.page_from)-\(.page_to)"
              elif .offset != null then "offset \(.offset) bytes, \(.bytes) bytes"
              else "arquivo inteiro" end;
    ($notdone | map({file: .path, heading: null, section_id: null, bytes: null,
                     reason: "not_ingestible", reopen_hint: .detail})) as $ni
    | if $mode == "full"
      then { loaded: [ $files[] | select(.readable) | {file: .path, heading: null, section_id: null,
                                                       bytes: (.extracted_text_bytes // .bytes),
                                                       reason: "full_mode", score: null} ],
             left_out: $ni }
      else
        ($cands | sort_by(-.score)) as $sorted
        | (reduce range(0; $sorted|length) as $i ({acc: 0, sel: [], out: []};
             ($sorted[$i]) as $c
             | if (.acc + $c.bytes) <= $remaining and $c.score > -1000
               then {acc: (.acc + $c.bytes), sel: (.sel + [$c]), out: .out}
               else {acc: .acc, sel: .sel, out: (.out + [$c])} end)) as $r
        | { loaded: ($toc + [ $r.sel[] | {file, heading, section_id, bytes,
                                          reason: "topic_match", score} ]),
            left_out: ([ $r.out[] | {file, heading, section_id, bytes,
                                     reason: (if .score > 0 then "budget_exhausted" else "low_relevance" end),
                                     reopen_hint: hint} ] + $ni) }
      end'
}

di_build_index() {   # $1 = {loaded, left_out}
  jq -n -c \
    --arg ver "$SM_INDEX_SCHEMA_VERSION" \
    --arg gen "$(sm_now_iso)" \
    --arg setup_id "$DI_SETUP_ID" \
    --arg docs_root "$DI_DOCS_ROOT" \
    --arg mode "$DI_MODE" \
    --argjson budget "$di_budget" \
    --argjson total "$DI_TOTAL" \
    --argjson files "$DI_FILES_JSON" \
    --argjson notdone "$DI_NOT_ING_JSON" \
    --argjson lists "$1" '
    { schema_version: $ver, generated_at: $gen, setup_id: $setup_id, docs_root: $docs_root,
      mode: $mode, budget_bytes: $budget, total_ingestible_bytes: $total,
      files: $files, loaded: $lists.loaded, left_out: $lists.left_out, not_ingested: $notdone }'
}

di_write_index() {   # $1 = documento completo
  if ! sm_json_validate <(printf '%s\n' "$1") "$SM_INDEX_SCHEMA"; then
    sm_die 5 "o docs-index.json produzido não valida contra docs-index.schema.json."
  fi
  [[ -d "$SM_MEMORY_DIR" ]] || { mkdir -p -- "$SM_MEMORY_DIR" && sm_chmod_private "$SM_MEMORY_DIR"; } \
    || sm_die 1 "não consegui criar '$SM_MEMORY_DIR'."
  printf '%s\n' "$1" | sm_atomic_write "$DI_INDEX_FILE" \
    || sm_die 1 "falha ao gravar '$DI_INDEX_FILE'."
}

di_summary() {   # $1 = documento completo -> stdout, contrato de §8
  printf '%s' "$1" | jq -c '{mode, files: (.files|length),
                             selected_sections: ([.loaded[] | select(.heading != null)] | length),
                             excluded: (.left_out|length),
                             total_ingestible_bytes}'
}

# ============================================================ PEDIDO (--select)
di_stable_stamp() {
  local e="$DI_MAX_MTIME"
  ((e > 0)) || e="$(stat -c %Y -- "$DI_DOCS_ABS" 2>/dev/null || printf '0')"
  date -d "@$e" +%Y-%m-%dT%H:%M:%S%:z
}

di_payload() {
  jq -n -c \
    --arg ver "$SM_INDEX_SCHEMA_VERSION" \
    --arg gen "$(di_stable_stamp)" \
    --arg setup_id "$DI_SETUP_ID" \
    --arg resp "${TMPDIR:-/tmp}/study-method-docs-index-$DI_SETUP_ID.json" \
    --arg lesson "$di_topics_csv" \
    --argjson terms "$(jq -n -c '$ARGS.positional' --args ${di_terms[@]+"${di_terms[@]}"})" \
    --argjson budget "$di_budget" \
    --argjson remaining "$DI_REMAINING" \
    --argjson cands "$DI_CANDS_JSON" '
    { schema_version: $ver, request_kind: "docs_index", generated_at: $gen, setup_id: $setup_id,
      response_path: $resp,
      lesson_topic: (if $lesson == "" then null else $lesson end),
      topic_terms: $terms, budget_bytes: $budget, remaining_bytes: $remaining,
      recent_sections: [],
      candidates: ($cands | sort_by(-.score)
                   | map({file, heading, section_id, bytes, provenance, score,
                          disputed: null, preview: null})) }'
}

di_request_id() { printf '%s' "$1" | sm_json_canon - | sha256sum | cut -c1-12; }

if [[ -n "$di_select" ]]; then
  if [[ "$(printf '%s' "$DI_CANDS_JSON" | jq 'length')" -eq 0 ]]; then
    # RA-7: exit 10 só acompanhado de um PEDIDO bem formado. Sem candidata, não há pedido.
    sm_log warn "não há seção candidata no $DI_DOCS_ROOT/ do setup: nada a selecionar."
    printf '{"mode":"%s","files":%s,"selected_sections":0,"excluded":0,"total_ingestible_bytes":%s}\n' \
      "$DI_MODE" "$(printf '%s' "$DI_FILES_JSON" | jq 'length')" "$DI_TOTAL"
    exit 0
  fi
  DI_PAYLOAD="$(di_payload)"
  sm_json_validate <(printf '%s\n' "$DI_PAYLOAD") "$SM_REQ_SCHEMA" \
    || sm_die 5 "o PEDIDO montado não valida contra docs-index.request.schema.json (bug do script)."
  sm_request "docs-index.sh" "$SM_REQUEST_KIND" "$SM_RESPONSE_SCHEMA_URN" \
    "Escolha, entre as candidatas, as seções que sustentam ESTE tópico. A soma dos bytes não pode passar de remaining_bytes; cada escolha vem com um motivo concreto, porque é ele que vira a frase dita ao aluno sobre o que ficou de fora." \
    "$DI_PAYLOAD" || exit "$?"
  exit 10
fi

# ============================================================== APPLY (--apply)
if [[ -n "$di_apply" ]]; then
  [[ -r "$di_apply" ]] || sm_die 2 "não consigo ler o arquivo de resposta '$di_apply'."
  sm_json_ok "$di_apply" || sm_die 5 "a RESPOSTA '$di_apply' não parseia como JSON."

  DI_PAYLOAD="$(di_payload)"
  DI_RID="$(di_request_id "$DI_PAYLOAD")"

  DI_P="$(sm_json_get "$di_apply" '.protocol // ""')"
  DI_V="$(sm_json_get "$di_apply" '.protocol_version // ""')"
  DI_K="$(sm_json_get "$di_apply" '.kind // ""')"
  DI_R="$(sm_json_get "$di_apply" '.request_id // ""')"
  [[ "$DI_P" == "study-method/request-apply" ]] || sm_die 5 "protocol divergente na RESPOSTA: '$DI_P'."
  [[ "${DI_V%%.*}" == "1" ]] || sm_die 5 "protocol_version divergente na RESPOSTA: '$DI_V'."
  [[ "$DI_K" == "$SM_REQUEST_KIND" ]] || sm_die 5 "kind divergente na RESPOSTA: '$DI_K' (esperado $SM_REQUEST_KIND)."
  [[ "$DI_R" == "$DI_RID" ]] \
    || sm_die 5 "request_id divergente: a RESPOSTA traz '$DI_R' e o estado atual do $DI_DOCS_ROOT/ produz '$DI_RID'. O material mudou entre o PEDIDO e o --apply; nada foi aplicado."

  DI_ITEMS="$(sm_apply_read "$di_apply" "$SM_REQUEST_KIND" "$DI_RID")" \
    || sm_die "$?" "sm_apply_read recusou a RESPOSTA '$di_apply'."
  DI_RESP="$(printf '%s' "$DI_ITEMS" | jq -c 'if type == "array" then (.[0] // {}) else . end')"
  sm_json_validate <(printf '%s\n' "$DI_RESP") "$SM_RESP_SCHEMA" \
    || sm_die 5 "a RESPOSTA não valida contra docs-index.response.schema.json; nada foi aplicado (RA-3)."
  [[ "$(printf '%s' "$DI_RESP" | jq -r '.request_kind // ""')" == "docs_index" ]] \
    || sm_die 5 "request_kind divergente dentro da RESPOSTA."

  # O script confere; não confia. Seção inventada derruba a resposta inteira.
  DI_UNKNOWN="$(jq -r -n --argjson resp "$DI_RESP" --argjson cands "$DI_CANDS_JSON" '
    [ $resp.selected[] as $s
      | select( ($cands | any(.file == $s.file and .heading == $s.heading)) | not )
      | "\($s.file)#\($s.heading)" ] | join(", ")')"
  [[ -z "$DI_UNKNOWN" ]] \
    || sm_die 5 "a RESPOSTA aponta seção que não está entre as candidatas: $DI_UNKNOWN. Nada foi aplicado."

  DI_LISTS="$(jq -n -c \
      --argjson resp "$DI_RESP" \
      --argjson cands "$DI_CANDS_JSON" \
      --argjson toc "$DI_TOC_JSON" \
      --argjson notdone "$DI_NOT_ING_JSON" \
      --argjson remaining "$DI_REMAINING" '
      def hint: if .page_from != null then "páginas \(.page_from)-\(.page_to)"
                elif .offset != null then "offset \(.offset) bytes, \(.bytes) bytes"
                else "arquivo inteiro" end;
      ($notdone | map({file: .path, heading: null, section_id: null, bytes: null,
                       reason: "not_ingestible", reopen_hint: .detail})) as $ni
      | ( [ $resp.selected[] as $s
            | ($cands | map(select(.file == $s.file and .heading == $s.heading)) | .[0]) as $c
            | { file: $c.file, heading: $c.heading, section_id: $c.section_id, bytes: $c.bytes,
                score: $c.score, rank: ($s.rank // 9999) } ]
          | sort_by(.rank) ) as $chosen
      | (reduce $chosen[] as $c ({acc: 0, sel: [], cut: []};
           if (.acc + $c.bytes) <= $remaining
           then {acc: (.acc + $c.bytes), sel: (.sel + [$c]), cut: .cut}
           else {acc: .acc, sel: .sel, cut: (.cut + [$c])} end)) as $r
      | ([ $r.sel[] | "\(.file)#\(.heading)" ]) as $keys
      | ([ $r.cut[] | "\(.file)#\(.heading)" ]) as $cutkeys
      | { loaded: ($toc + [ $r.sel[] | {file, heading, section_id, bytes,
                                        reason: "topic_match", score} ]),
          left_out: ([ $cands[] | . as $c
                       | select( ($keys | index("\($c.file)#\($c.heading)")) | not )
                       | {file, heading, section_id, bytes,
                          reason: (if ($cutkeys | index("\($c.file)#\($c.heading)")) then "budget_exhausted"
                                   else "low_relevance" end),
                          reopen_hint: hint} ] + $ni) }')" \
    || sm_die 5 "não consegui montar loaded[]/left_out[] a partir da RESPOSTA."

  DI_MODE="indexed"
  DI_DOC="$(di_build_index "$DI_LISTS")"
  di_write_index "$DI_DOC"
  DI_NOTE="$(printf '%s' "$DI_RESP" | jq -r '.left_out_note // ""')"
  [[ -z "$DI_NOTE" ]] || sm_log info "declaração ao aluno: $DI_NOTE"
  di_summary "$DI_DOC"
  exit 0
fi

# ================================================= varredura determinística (exit 0)
DI_DOC="$(di_build_index "$(di_deterministic_lists)")"
di_write_index "$DI_DOC"
if [[ "$DI_MODE" == "indexed" ]]; then
  sm_log warn "modo indexed: a seleção foi automática (ordem de score, corte no teto de $DI_MATERIAL_BUDGET bytes). Declare ao aluno, por nome, o que ficou em left_out[]."
fi
di_summary "$DI_DOC"
