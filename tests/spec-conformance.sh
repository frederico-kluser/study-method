#!/usr/bin/env bash
# tests/spec-conformance.sh — o gate de CONFORMIDADE do BUILD_SPEC.md contra o repositório.
#
# Responde a UMA pergunta: o documento-mestre (`BUILD_SPEC.md`, na raiz do repositório) ainda
# descreve o repositório de verdade? `docs/00-contratos.md` é a autoridade; o BUILD_SPEC
# TRANSCREVE contrato, nunca inventa (docs/12-conformidade.md tem a explicação completa,
# como interpretar cada FAIL, e o que fazer quando este gate acusa divergência).
#
# Onze checks, oito perguntas (docs/12-conformidade.md §2):
#   SC-01   todo caminho de arquivo citado (code span/link, fora de bloco cercado) existe no repo
#   SC-02a  todo script citado por caminho (SK/scripts/…) está na tabela §8 de 00-contratos.md
#   SC-02b  todo script da tabela §8 é citado em algum lugar do documento
#   SC-03   toda função sm_* citada em code span existe em SK/scripts/lib/*.sh
#   SC-04   todo schema transcrito (bloco ```json com "$id":"urn:study-method:schema:…") bate,
#           por igualdade estrutural após parse, com o arquivo em disco
#   SC-05a  todo marcador «PERGUNTE AO USUÁRIO (D-NNN)» cita um id real de assets/decisions.json
#   SC-05b  toda decisão elegível (audience ∈ {builder,both}, status == open) tem marcador
#   SC-06a  todo pattern citado (code span `^…$`) existe em algum schema do disco
#   SC-06b  todo enum citado (linha de tabela `campo` | `v1` · `v2` …) bate com o schema dono
#   SC-07   a tabela de exit codes do documento bate com docs/00-contratos.md §5.1
#   SC-08   nenhum termo revogado (§2.2/§10 do contrato) aparece sem marcador de revogação na
#           janela de 3 linhas
#
# PEND vs FAIL: se BUILD_SPEC.md não existir, TODO check sai PEND — "ainda não escrito", não
# "escrito errado". Um check individual também PEND quando a fatia que ele verifica ainda não
# apareceu no documento (nenhum caminho citado, nenhum bloco de schema, nenhum marcador…): é a
# mesma distinção que tests/validate.sh usa em G-12d. Uma vez que a fatia COMEÇA a aparecer,
# lacuna vira FAIL (omissão), não PEND.
#
# LIMITAÇÕES DECLARADAS (impressas no resumo — limitação escondida é pior que conhecida):
#   · Verificação TEXTUAL, não semântica: pega caminho que sumiu, script fora do inventário,
#     função sem definição, schema divergente, marcador de decisão sem par e termo revogado
#     sem aviso — NÃO pega uma explicação que ficou errada, um racional desatualizado, ou uma
#     decisão de arquitetura mal transcrita em prosa correta gramaticalmente.
#   · SC-01/02/03/05/06/07/08 leem só PROSA — linhas FORA de bloco cercado (```…```). Um bloco
#     cercado é ILUSTRAÇÃO (diagrama de árvore, formato-modelo de marcador), nunca afirmação de
#     caminho/função/enum real. SC-04 é o ÚNICO check que abre bloco ```json — é onde os schemas
#     são transcritos. Isso também protege SC-05 do próprio exemplo de FORMA do marcador que
#     docs/build-spec/10-decisoes.md §6.1 cita dentro de um bloco cercado.
#   · SC-01 só considera candidato um trecho iniciado por um destes prefixos: SK/,
#     skills/study-method/, docs/, tests/, examples/, evals/, .github/, README.md,
#     CONTRIBUTING.md, install.sh, LICENSE — e sem placeholder (<…>, {{…}}, *, NNNN, …, $).
#     Caminho de exemplo/fictício (ex.: `<setup_root>/memory/NNNN.json`) ou trecho de prosa sem
#     esse prefixo fica fora do escopo, de propósito. Quatro FAMÍLIAS NOMEADAS também ficam
#     fora, e são impressas no resumo: (a) `docs/generated/…`, que é o `docs/` do SETUP DO
#     ALUNO e não o do repositório; (b) `docs/NN` e `docs/research/NN`, abreviação de
#     referência a capítulo em prosa (o arquivo real é `docs/NN-nome.md`); (c) `tests/…` que
#     não termina em `.sh` nem está sob `tests/lib/`, que é caminho relativo ao diretório de um
#     DESAFIO; (d) `*.tmpl`, nome de template relativo a SK/assets/templates/. Nenhuma delas
#     pode casar um caminho de repositório que sumiu — `tests/gate-x.sh` e `docs/99-x.md`
#     continuam sendo FAIL.
#   · SC-02a/b só reconhecem citação de script pela forma `SK/scripts/…` ou
#     `skills/study-method/scripts/…` (direção a→inventário) e o NOME NU em qualquer lugar do
#     documento (direção inventário→citado). Não distingue "citou o script certo" de "citou o
#     nome certo por acaso" — é análise léxica, não semântica.
#   · SC-04 compara por IGUALDADE ESTRUTURAL após `json.load` (ordem de chave e formatação não
#     importam); "$id" que não existe em disco também é FAIL.
#   · SC-06a só reconhece pattern na forma exata `^…$` em code span, desfazendo antes o escape
#     `\|` de célula de tabela markdown (que é barra de coluna, não parte da regex). Nem toda
#     regex do projeto vem de schema: há um REGISTRO FECHADO de regexes de origem não-schema
#     (forma do nome de placeholder, `name` do frontmatter de SKILL.md, parser de TAP, dialeto
#     [0-9] do timestamp de docs/00-contratos.md §4.2). Cada entrada nomeia o arquivo que a
#     declara e um trecho que a corrobora — se o arquivo sumir, a isenção cai junto. Qualquer
#     outro `^…$` citado continua sendo cobrado contra os schemas.
#   · SC-06b só reconhece enum em linha de tabela `` `campo` | `v1` · `v2` … `` (o formato que
#     docs/00-contratos.md §4.1 usa) cuja célula de valores seja LISTAGEM PURA — tirados os code
#     spans e as anotações entre parênteses (que falam de NULIDADE, não de valor), tem de sobrar
#     só separador; sobrando prosa ou reticências de intervalo (`T1`…`T8`), a linha é
#     explicação/abreviação e fica fora. O campo é resolvido pelo
#     CAMINHO citado (`artifacts[].kind` casa `artifacts.kind`, nunca o `kind` de outro schema),
#     e `null` é ignorado dos DOIS lados (o schema o põe dentro do array `enum`; a tabela anota
#     a nulidade fora da lista — é a mesma informação escrita em lugares diferentes), e os
#     candidatos são restritos aos schemas que a própria coluna "onde" NOMEIA: linha que atribui
#     o enum a outra coisa (bloco `study-method:meta`, saída de `memory-digest.sh`) fica fora,
#     porque ali o enum não é apresentado como sendo de schema. Quando dois schemas têm ENUM
#     DIFERENTE para o MESMO caminho, basta bater com um dos dois.
#   · SC-07 compara só a tabela §5.1 (códigos 0/1/2/3/4/5/10 → "Significado", texto normalizado
#     por espaço), localizada no documento pela subseção "Tabela canônica" e terminada no
#     PRÓXIMO cabeçalho de qualquer nível. As exceções nomeadas de §5.2 e os códigos observados
#     de §5.3 NÃO são comparados mecanicamente — reusam os mesmos números com outro significado
#     (2 é `mix test` lá e "uso incorreto" aqui), e são texto multi-coluna heterogêneo demais
#     para diff confiável.
#   · SC-08 usa a MESMA lista de termos revogados e a MESMA janela de contexto revogatório
#     (3 linhas) que I-01/I-03/I-04/I-05 de tests/validate.sh, reimplementada aqui porque este
#     script não lê variável nenhuma de validate.sh — são gates independentes.
#
# Uso:  tests/spec-conformance.sh [-h]
# Exit: 0 tudo verde · 1 há falha ou pendência (inclusive BUILD_SPEC.md ainda não existir)
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tests/lib/assert.sh
. "$SELF_DIR/lib/assert.sh"

case "${1:-}" in
  -h|--help) sed -n '2,86p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) printf 'uso incorreto: argumento desconhecido «%s». Veja --help.\n' "$1" >&2; exit 2 ;;
esac

trap gate_cleanup_tmp EXIT
mkdir -p "$GATE_TMPDIR"

gate_init "spec-conformance — BUILD_SPEC.md × repositório"

gate_limitation "Verificação TEXTUAL, não semântica (docs/12-conformidade.md §3): pega caminho que sumiu, script fora do inventário, função sem definição, schema transcrito divergente, marcador de decisão sem par e termo revogado sem aviso — NÃO pega uma explicação que ficou errada nem um racional desatualizado."
gate_limitation "SC-01/02/03/05/06/07/08 leem só PROSA (fora de bloco cercado \`\`\`…\`\`\`): um bloco cercado é ILUSTRAÇÃO (diagrama, árvore de exemplo, formato-modelo de marcador), nunca afirmação de caminho/função/enum real. SC-04 é o ÚNICO check que abre bloco \`\`\`json — é onde os schemas são transcritos, e isso também blinda SC-05 contra o próprio exemplo de FORMA que docs/build-spec/10-decisoes.md §6.1 cita cercado."
gate_limitation "SC-01 só considera candidato um trecho com prefixo SK/, skills/study-method/, docs/, tests/, examples/, evals/, .github/, README.md, CONTRIBUTING.md, install.sh ou LICENSE, sem placeholder (<…>, {{…}}, *, NNNN, …, \$). Caminho de exemplo/fictício ou trecho de prosa sem esse prefixo fica fora do escopo, de propósito. Quatro FAMÍLIAS NOMEADAS também ficam fora (e a contagem de cada uma sai no PASS): docs/generated/… (é o docs/ do SETUP DO ALUNO, não o do repositório) · docs/NN e docs/research/NN (abreviação de referência a capítulo; o arquivo real é docs/NN-nome.md) · tests/… que não termina em .sh nem está sob tests/lib/ (é caminho relativo ao diretório de um DESAFIO) · *.tmpl (nome de template, relativo a SK/assets/templates/). Nenhuma delas casa um caminho de repositório que sumiu: tests/gate-x.sh e docs/99-x.md continuam FAIL."
gate_limitation "SC-04 compara por IGUALDADE ESTRUTURAL após json.load — ordem de chave e formatação/indentação não importam; só conteúdo importa."
gate_limitation "SC-06a só reconhece pattern na forma exata \`^…\$\`, desfazendo antes o escape \`\\|\` de célula de tabela (barra de coluna, não parte da regex). Nem toda regex do projeto vem de schema: há um REGISTRO FECHADO de regexes de origem não-schema — forma do nome de placeholder, \`name\` do frontmatter de SKILL.md, parser de saída TAP e o dialeto [0-9] do timestamp de docs/00-contratos.md §4.2. Cada entrada nomeia o arquivo que a declara e um trecho que a corrobora; origem que suma derruba a isenção. Qualquer outro \`^…\$\` citado continua sendo cobrado contra os schemas."
gate_limitation "SC-06b só reconhece enum em linha de tabela \`campo\` | \`v1\` · \`v2\` … (o formato de docs/00-contratos.md §4.1) cuja célula de valores seja LISTAGEM PURA — tirados os code spans e as anotações entre parênteses (que falam de NULIDADE, não de valor), tem de sobrar só separador; sobrando prosa ou reticências de intervalo, a linha é explicação/abreviação e fica fora. O campo é resolvido pelo CAMINHO citado (\`artifacts[].kind\` casa artifacts.kind, nunca o \`kind\` de outro schema) E restrito aos schemas que a própria coluna «onde» nomeia — linha que atribui o enum a outra coisa (bloco study-method:meta, saída de script) fica fora. \`null\` é ignorado dos DOIS lados. Quando dois schemas têm enums DIFERENTES para o MESMO caminho, aceita bater com qualquer um dos dois."
gate_limitation "SC-07 compara só a tabela §5.1, localizada no documento pela subseção «Tabela canônica» e terminada no PRÓXIMO cabeçalho de qualquer nível. As exceções nomeadas de §5.2 e os códigos observados de §5.3 não são comparados mecanicamente: reusam os mesmos números com outro significado (2 é \`mix test\` lá e «uso incorreto» aqui) e são texto multi-coluna heterogêneo demais para diff confiável."

BUILD_SPEC="$GATE_ROOT/BUILD_SPEC.md"
CONTRACT="$GATE_ROOT/docs/00-contratos.md"
SK="$GATE_SK"
SCHEMA_DIR="$SK/assets/schemas"
LIB_DIR="$SK/scripts/lib"
DECISIONS="$SK/assets/decisions.json"

ALL_IDS="SC-01 SC-02a SC-02b SC-03 SC-04 SC-05a SC-05b SC-06a SC-06b SC-07 SC-08"

# ═══════════════════════════════════════════════ motor python (spec_scan.py)
SCANNER="$GATE_TMPDIR/spec_scan.py"
cat > "$SCANNER" <<'PYEOF'
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""spec_scan.py — motor de conformidade BUILD_SPEC.md x repositorio (tests/spec-conformance.sh).

Protocolo de saida: uma linha por achado, campos separados por \x1f (unit separator):
    PASS<US>id<US>desc
    FAIL<US>id<US>desc<US>esperado<US>obtido<US>onde
    PEND<US>id<US>desc<US>ausente
    WARN<US>id<US>desc<US>detalhe

Subcomandos (cada um le SEMPRE BUILD_SPEC.md; alguns tambem leem uma fonte de verdade):
    paths      <root> <build_spec>
    scripts    <root> <build_spec> <contract>
    funcs      <root> <build_spec> <lib_dir>
    schemas    <root> <build_spec> <schema_dir>
    decisions  <root> <build_spec> <decisions_json>
    patterns   <root> <build_spec> <schema_dir>
    enums      <root> <build_spec> <schema_dir>
    exitcodes  <root> <build_spec> <contract>
    revoked    <root> <build_spec>
"""
import json
import os
import re
import sys

US = "\x1f"


def emit(kind, id_, *fields):
    clean = [str(f).replace("\n", " ⏎ ").replace("\x1f", " ") for f in fields]
    sys.stdout.write(US.join([kind, id_] + clean) + "\n")


def trunc(s, n=200):
    s = str(s)
    return s if len(s) <= n else s[:n] + "…"


# ─────────────────────────────────────────────────────────── leitura e blocos cercados

def read_lines(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read().split("\n")


FENCE_RE = re.compile(r'^(`{3,}|~{3,})(.*)$')


def scan_fences(lines):
    """in_fence[i] = True se a linha i esta DENTRO (ou E a linha) de um bloco cercado.
    blocks = lista de (start0, end0, lang, texto_interno) — start0/end0 sao indices 0-based
    das linhas de CERCA (abertura/fechamento); texto_interno nao inclui as cercas.
    """
    in_fence = [False] * len(lines)
    blocks = []
    fence_char = None
    open_line = None
    lang = None
    buf = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        m = FENCE_RE.match(stripped)
        if fence_char is None:
            if m:
                fence_char = m.group(1)[0]
                lang = m.group(2).strip()
                open_line = i
                buf = []
                in_fence[i] = True
                continue
            in_fence[i] = False
        else:
            if m and m.group(1)[0] == fence_char and not m.group(2).strip():
                in_fence[i] = True
                blocks.append((open_line, i, lang, "\n".join(buf)))
                fence_char = None
                open_line = None
                lang = None
                buf = []
                continue
            in_fence[i] = True
            buf.append(line)
    if fence_char is not None:
        blocks.append((open_line, len(lines) - 1, lang, "\n".join(buf)))
    return in_fence, blocks


CODE_SPAN_RE = re.compile(r'`([^`\n]+)`')
LINK_RE = re.compile(r'\[[^\]\n]*\]\(([^)\n]+)\)')


def prose_lines(lines, in_fence):
    for i, line in enumerate(lines):
        if in_fence[i]:
            continue
        yield i + 1, line


# ───────────────────────────────────────────────────────────────── SC-01 · caminhos

PATH_PREFIXES = (
    "SK/", "skills/study-method/", "docs/", "tests/", "examples/", "evals/",
    ".github/", "README.md", "CONTRIBUTING.md", "install.sh", "LICENSE",
)
BAD_SUBSTR = ("<", ">", "{{", "}}", "*", "NNNN", "…", "$", "\\", " ")
CANDIDATE_RE = re.compile(r'^[A-Za-z0-9_./-]+$')


def normalize_candidate(raw):
    s = raw.strip().strip("`").strip()
    s = s.split("#", 1)[0]
    m = re.match(r'^(.*?):(\d+)$', s)
    if m and ("/" in m.group(1) or "." in m.group(1)):
        s = m.group(1)
    s = s.rstrip(".,;:)")
    return s


def is_path_candidate(s):
    if not s.startswith(PATH_PREFIXES):
        return False
    if any(b in s for b in BAD_SUBSTR):
        return False
    if not CANDIDATE_RE.match(s):
        return False
    return True


# ── trechos que TÊM cara de caminho do repositório e não são. Cada família é NOMEADA: uma
# exclusão calada mentiria tanto quanto um falso positivo. Nenhuma delas pode casar um caminho
# de verdade que sumiu — é isso que mantém o dente do check.
SETUP_DOCS_RE = re.compile(r'^docs/generated(/|$)')
DOC_SHORTHAND_RE = re.compile(r'^docs/(research/)?[0-9]{2}$')


def not_a_repo_path(s):
    """Razão NOMEADA pela qual o trecho não é caminho da raiz do repositório, ou None."""
    if SETUP_DOCS_RE.match(s):
        return ("docs/ do SETUP do aluno", "`docs/generated/` é o `<setup_root>/docs/generated/` "
                "— a exceção de escrita da skill no material do aluno, não um diretório deste "
                "repositório")
    if DOC_SHORTHAND_RE.match(s):
        return ("abreviação de referência a capítulo", "`docs/NN` e `docs/research/NN` são a forma "
                "curta de citar um capítulo em prosa («ver `docs/01` §3»); o arquivo real é "
                "`docs/NN-nome.md`")
    if s.startswith("tests/") and not s.startswith("tests/lib/") and not s.endswith(".sh"):
        return ("caminho relativo ao diretório de um desafio", "o `tests/` do desafio gerado "
                "(`tests/test_stub.py`, `tests/stub.test.mjs`, `tests/__init__.py`); o `tests/` "
                "do repositório só tem `*.sh` e `lib/`")
    if s.endswith(".tmpl"):
        return ("nome de template", "`*.tmpl` é citado pelo nome, relativo a "
                "`SK/assets/templates/`, não à raiz do repositório")
    return None


def resolve_path(root, s):
    p = s
    if p.startswith("SK/"):
        p = "skills/study-method/" + p[len("SK/"):]
    return os.path.exists(os.path.join(root, p))


def cmd_paths(root, build_spec):
    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)
    checked = 0
    bad = []
    skipped = {}
    for lineno, line in prose_lines(lines, in_fence):
        cands = [m.group(1) for m in CODE_SPAN_RE.finditer(line)]
        cands += [m.group(1) for m in LINK_RE.finditer(line)]
        seen_here = set()
        for raw in cands:
            s = normalize_candidate(raw)
            if not is_path_candidate(s):
                continue
            if s in seen_here:
                continue
            seen_here.add(s)
            reason = not_a_repo_path(s)
            if reason:
                skipped.setdefault(reason[0], set()).add(s)
                continue
            checked += 1
            if not resolve_path(root, s):
                bad.append((lineno, s))
    if checked == 0:
        emit("PEND", "SC-01", "todo caminho de arquivo citado existe no repositório",
             "nenhum caminho no formato esperado (prefixo SK/, skills/study-method/, docs/, "
             "tests/, examples/, evals/, .github/, README.md, CONTRIBUTING.md, install.sh ou "
             "LICENSE, sem placeholder) foi encontrado ainda em code span ou link de BUILD_SPEC.md")
        return
    if bad:
        for lineno, s in bad:
            emit("FAIL", "SC-01", "caminho citado não existe no repositório",
                 "arquivo ou diretório existente sob a raiz do repositório",
                 "«%s»" % s, "BUILD_SPEC.md:%d" % lineno)
        return
    extra = ""
    if skipped:
        extra = "; fora de escopo, por família nomeada: " + " · ".join(
            "%s (%d)" % (k, len(v)) for k, v in sorted(skipped.items()))
    emit("PASS", "SC-01", "%d caminho(s) citado(s) resolvem no disco%s" % (checked, extra))


# ─────────────────────────────────────────────────────────── SC-02 · inventário §8

def canon_scripts(contract_lines):
    names = []
    infile = False
    for line in contract_lines:
        if re.match(r'^## 8\.', line):
            infile = True
            continue
        if re.match(r'^## 9\.', line):
            infile = False
            continue
        if infile:
            m = re.match(r'^\|\s*`((?:lib/)?[a-z0-9-]+\.(?:sh|py))`', line)
            if m:
                names.append(m.group(1))
    return sorted(set(names))


CITE_RE = re.compile(r'(?:SK|skills/study-method)/scripts/((?:lib/)?[A-Za-z0-9_-]+\.(?:sh|py))')


def basename(n):
    return n.split("/")[-1]


def bare_mentioned(lines, in_fence, name):
    pat = re.compile(r'(?<![A-Za-z0-9_.\-])' + re.escape(name) + r'(?![A-Za-z0-9_.\-])')
    for lineno, line in prose_lines(lines, in_fence):
        if pat.search(line):
            return lineno
    return None


def cmd_scripts(root, build_spec, contract):
    if not os.path.isfile(contract):
        emit("PEND", "SC-02a", "todo script citado por caminho está na tabela §8",
             "docs/00-contratos.md ausente")
        emit("PEND", "SC-02b", "todo script da tabela §8 é citado no documento",
             "docs/00-contratos.md ausente")
        return
    canon = canon_scripts(read_lines(contract))
    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)

    # SC-02a — direção "citado ⇒ está no inventário"
    cited = {}
    bad_a = []
    for lineno, line in prose_lines(lines, in_fence):
        for m in CITE_RE.finditer(line):
            name = m.group(1)
            cited.setdefault(name, lineno)
            if basename(name).startswith("_"):
                continue
            if name not in canon:
                bad_a.append((lineno, name))
    if not cited:
        emit("PEND", "SC-02a", "todo script citado por caminho (SK/scripts/…) está na tabela §8",
             "nenhuma citação por caminho SK/scripts/… ou skills/study-method/scripts/… "
             "encontrada ainda em BUILD_SPEC.md")
    elif bad_a:
        for lineno, name in bad_a:
            emit("FAIL", "SC-02a", "script citado por caminho não está na tabela §8",
                 "um dos 19 nomes de docs/00-contratos.md §8", "«%s»" % name,
                 "BUILD_SPEC.md:%d" % lineno)
    else:
        emit("PASS", "SC-02a", "%d citação(ões) por caminho, todas na tabela §8" % len(cited))

    # SC-02b — direção "está no inventário ⇒ é citado em algum lugar" (padrão graduado:
    # PEND enquanto a passada de descrição de scripts não começou; FAIL por omissão depois
    # que o primeiro nome aparece — mesmo critério de G-12d em tests/validate.sh).
    started = False
    missing = []
    for name in canon:
        b = basename(name)
        ln = bare_mentioned(lines, in_fence, b)
        if ln is not None:
            started = True
        else:
            missing.append(name)
    if not started:
        emit("PEND", "SC-02b", "todo script da tabela §8 é citado em algum lugar do documento",
             "a descrição dos %d scripts do inventário ainda não começou: zero nomes de §8 "
             "encontrados em BUILD_SPEC.md" % len(canon))
    elif missing:
        for name in missing:
            emit("FAIL", "SC-02b", "script do inventário §8 sem menção no documento",
                 "o nome «%s» em algum ponto de BUILD_SPEC.md" % basename(name),
                 "ausente", "BUILD_SPEC.md")
    else:
        emit("PASS", "SC-02b", "os %d scripts da tabela §8 são citados no documento" % len(canon))


# ─────────────────────────────────────────────────────────── SC-03 · funções de lib/

FUNC_DEF_RE = re.compile(r'^sm_[A-Za-z0-9_]+\(\)')
FUNC_CITE_RE = re.compile(r'\bsm_[A-Za-z0-9_]+\b')


def lib_functions(lib_dir):
    names = set()
    if not os.path.isdir(lib_dir):
        return names
    for fn in sorted(os.listdir(lib_dir)):
        if not fn.endswith(".sh"):
            continue
        fp = os.path.join(lib_dir, fn)
        try:
            with open(fp, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    m = FUNC_DEF_RE.match(line)
                    if m:
                        names.add(m.group(0)[:-2])
        except OSError:
            continue
    return names


def cmd_funcs(root, build_spec, lib_dir):
    if not os.path.isdir(lib_dir):
        emit("PEND", "SC-03", "toda função sm_* citada existe em skills/study-method/scripts/lib/",
             "diretório inexistente: %s" % os.path.relpath(lib_dir, root))
        return
    defined = lib_functions(lib_dir)
    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)
    checked = 0
    bad = []
    seen = set()
    for lineno, line in prose_lines(lines, in_fence):
        for m in CODE_SPAN_RE.finditer(line):
            for fm in FUNC_CITE_RE.finditer(m.group(1)):
                name = fm.group(0)
                key = (lineno, name)
                if key in seen:
                    continue
                seen.add(key)
                checked += 1
                if name not in defined:
                    bad.append((lineno, name))
    if checked == 0:
        emit("PEND", "SC-03", "toda função sm_* citada existe em skills/study-method/scripts/lib/",
             "nenhuma função sm_* citada em code span ainda em BUILD_SPEC.md")
        return
    if bad:
        for lineno, name in bad:
            emit("FAIL", "SC-03", "função citada não existe em lib/",
                 "definida em lib/common.sh, lib/json.sh ou lib/sandbox.sh (§7)",
                 "«%s»" % name, "BUILD_SPEC.md:%d" % lineno)
        return
    emit("PASS", "SC-03", "%d citação(ões) de função sm_*, todas definidas em lib/" % checked)


# ───────────────────────────────────────────────────────────── SC-04 · schemas verbatim

ID_RE = re.compile(r'"\$id"\s*:\s*"([^"]+)"')


def load_disk_schemas(schema_dir):
    disk = {}
    if not os.path.isdir(schema_dir):
        return disk
    for dirpath, _dirs, files in os.walk(schema_dir):
        for fn in files:
            if not fn.endswith(".json"):
                continue
            fp = os.path.join(dirpath, fn)
            try:
                with open(fp, encoding="utf-8") as fh:
                    data = json.load(fh)
            except (OSError, ValueError):
                continue
            sid = data.get("$id") if isinstance(data, dict) else None
            if sid:
                disk[sid] = (fp, data)
    return disk


def first_diff(disk_val, doc_val, path="$"):
    if isinstance(disk_val, dict) != isinstance(doc_val, dict):
        return "%s: tipo diferente — disco é %s, documento é %s" % (
            path, type(disk_val).__name__, type(doc_val).__name__)
    if isinstance(disk_val, dict):
        for k in sorted(set(disk_val) | set(doc_val)):
            if k not in doc_val:
                return "%s.%s: presente no disco, ausente no documento" % (path, k)
            if k not in disk_val:
                return "%s.%s: presente no documento, ausente no disco" % (path, k)
            d = first_diff(disk_val[k], doc_val[k], path + "." + k)
            if d:
                return d
        return None
    if isinstance(disk_val, list) != isinstance(doc_val, list):
        return "%s: tipo diferente — disco é %s, documento é %s" % (
            path, type(disk_val).__name__, type(doc_val).__name__)
    if isinstance(disk_val, list):
        if len(disk_val) != len(doc_val):
            return "%s: array com %d item(ns) no disco, %d no documento" % (
                path, len(disk_val), len(doc_val))
        for i, (a, b) in enumerate(zip(disk_val, doc_val)):
            d = first_diff(a, b, "%s[%d]" % (path, i))
            if d:
                return d
        return None
    if disk_val != doc_val:
        return "%s: «%r» no disco, «%r» no documento" % (path, disk_val, doc_val)
    return None


def cmd_schemas(root, build_spec, schema_dir):
    disk = load_disk_schemas(schema_dir)
    lines = read_lines(build_spec)
    _in_fence, blocks = scan_fences(lines)
    checked = 0
    bad = []
    seen = set()
    for start, _end, _lang, text in blocks:
        m = ID_RE.search(text)
        if not m:
            continue
        sid = m.group(1)
        if not sid.startswith("urn:study-method:schema:"):
            continue
        checked += 1
        try:
            parsed = json.loads(text)
        except ValueError as exc:
            bad.append((start + 1, sid, "bloco não parseia como JSON: %s" % exc, None))
            continue
        if sid in seen:
            continue
        seen.add(sid)
        if sid not in disk:
            bad.append((start + 1, sid, "\"$id\" não corresponde a nenhum schema em disco", None))
            continue
        fp, disk_data = disk[sid]
        if parsed != disk_data:
            d = first_diff(disk_data, parsed) or "diverge (comparação estrutural completa)"
            bad.append((start + 1, sid, d, os.path.relpath(fp, root)))
    if checked == 0:
        emit("PEND", "SC-04", "todo schema transcrito bate com o arquivo em disco",
             "nenhum bloco ```json com \"$id\": \"urn:study-method:schema:…\" encontrado "
             "ainda em BUILD_SPEC.md")
        return
    if bad:
        for lineno, sid, detail, fp in bad:
            where = "BUILD_SPEC.md:%d (bloco ```json)" % lineno
            expected = "idêntico (após parse) a %s" % (fp or "<arquivo do $id>")
            emit("FAIL", "SC-04", "schema transcrito diverge do arquivo em disco (id %s)" % sid,
                 expected, detail, where)
        return
    emit("PASS", "SC-04", "%d schema(s) transcrito(s) idênticos (após parse) aos de "
                          "skills/study-method/assets/schemas/" % len(seen))


# ─────────────────────────────────────────────────────── SC-05 · marcadores de decisão

MARKER_RE = re.compile(r'\*\*PERGUNTE AO USU[ÁA]RIO \((D-[A-Z]{1,3}[0-9]{2,3})\)\*\*')


def cmd_decisions(root, build_spec, decisions_json):
    if not os.path.isfile(decisions_json):
        emit("PEND", "SC-05a", "todo marcador PERGUNTE AO USUÁRIO cita um id real do catálogo",
             "catálogo ausente: %s" % os.path.relpath(decisions_json, root))
        emit("PEND", "SC-05b", "toda decisão elegível (audience builder/both, status open) "
                               "tem marcador no documento",
             "catálogo ausente: %s" % os.path.relpath(decisions_json, root))
        return
    try:
        with open(decisions_json, encoding="utf-8") as fh:
            catalog = json.load(fh)
    except (OSError, ValueError) as exc:
        emit("PEND", "SC-05a", "todo marcador PERGUNTE AO USUÁRIO cita um id real do catálogo",
             "catálogo ilegível: %s" % exc)
        emit("PEND", "SC-05b", "toda decisão elegível tem marcador no documento",
             "catálogo ilegível: %s" % exc)
        return
    decs = catalog.get("decisions", [])
    all_ids = {d["id"] for d in decs if "id" in d}
    eligible = sorted(d["id"] for d in decs
                       if d.get("audience") in ("builder", "both") and d.get("status") == "open")

    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)
    found = {}
    for lineno, line in prose_lines(lines, in_fence):
        for m in MARKER_RE.finditer(line):
            found.setdefault(m.group(1), lineno)

    # SC-05a
    bad_a = [(did, ln) for did, ln in found.items() if did not in all_ids]
    if not found:
        emit("PEND", "SC-05a", "todo marcador PERGUNTE AO USUÁRIO cita um id real do catálogo",
             "nenhum marcador «PERGUNTE AO USUÁRIO (D-…)» encontrado ainda em BUILD_SPEC.md "
             "(fora de bloco cercado — exemplos de FORMA em ``` não contam)")
    elif bad_a:
        for did, ln in bad_a:
            emit("FAIL", "SC-05a", "marcador cita id que não existe no catálogo",
                 "um id presente em skills/study-method/assets/decisions.json",
                 "«%s»" % did, "BUILD_SPEC.md:%d" % ln)
    else:
        emit("PASS", "SC-05a", "%d marcador(es), todos com id real no catálogo" % len(found))

    # SC-05b (padrão graduado — mesmo critério de G-12d em tests/validate.sh)
    missing_b = [d for d in eligible if d not in found]
    if not found:
        emit("PEND", "SC-05b", "toda decisão elegível (audience builder/both, status open) "
                               "tem marcador no documento",
             "a passada de marcação ainda não começou: zero marcadores encontrados. Faltam as "
             "%d decisões elegíveis (audience builder/both, status open)." % len(eligible))
    elif missing_b:
        for did in missing_b:
            emit("FAIL", "SC-05b", "decisão elegível sem marcador no documento",
                 "marcador «PERGUNTE AO USUÁRIO (%s)» em algum ponto de BUILD_SPEC.md" % did,
                 "ausente", "BUILD_SPEC.md")
    else:
        emit("PASS", "SC-05b", "as %d decisões elegíveis (audience builder/both, status open) "
                               "têm marcador" % len(eligible))


# ───────────────────────────────────────────────────────── SC-06a · patterns citados

PATTERN_SPAN_RE = re.compile(r'^\^.*\$$')

# `\|` dentro de célula de tabela markdown é ESCAPE DA BARRA DE COLUNA, não parte da regex.
# Sem desfazer isso, todo pattern com alternância citado numa tabela viraria falso positivo.
TABLE_PIPE_ESCAPE_RE = re.compile(r'\\\|')


def unescape_table_pipe(span):
    return TABLE_PIPE_ESCAPE_RE.sub("|", span)


# Registro FECHADO de regexes do projeto cuja origem NÃO é schema. Cada entrada nomeia
# (por que não é de schema, arquivo que a declara, trecho que corrobora). A isenção só vale se
# o arquivo existir E contiver o trecho — origem que sumiu derruba a isenção junto. Qualquer
# outro pattern citado continua sendo cobrado contra os schemas.
NON_SCHEMA_PATTERNS = {
    "^[A-Z0-9_]+$": (
        "forma do NOME de um placeholder de template (entre as chaves duplas). O repositório a "
        "aplica como `{{[A-Z0-9_]+}}` em L-03 de tests/gate-lint.sh e na renderização de "
        "tests/gate-build.sh — não existe schema JSON que a declare",
        "tests/gate-lint.sh", "[A-Z0-9_]+"),
    "^[a-z0-9-]+$": (
        "regra do campo `name` do frontmatter de SKILL.md, definida pela spec de Agent Skills — "
        "externa ao projeto, e por isso ausente dos schemas do repositório",
        "skills/study-method/SKILL.md", "name:"),
    "^(not )?ok \\d+ - (.+)$": (
        "parser da saída TAP do runner de Node, usado por challenge-verify.sh para extrair nomes "
        "de teste — contrato de saída de ferramenta, não formato de dado persistido",
        "skills/study-method/references/languages.md", "(not )?ok "),
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$": (
        "formato canônico de timestamp como docs/00-contratos.md §4.2 o escreve e lib/common.sh o "
        "aplica ao validar STUDY_METHOD_NOW — dialeto [0-9]; o schema escreve a MESMA linguagem no "
        "dialeto \\d",
        "skills/study-method/scripts/lib/common.sh",
        "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$"),
}


def non_schema_origin(root, span):
    """(motivo, arquivo) se `span` é uma regex de origem NÃO-schema declarada e corroborada."""
    ent = NON_SCHEMA_PATTERNS.get(span)
    if not ent:
        return None
    why, rel, corroboration = ent
    fp = os.path.join(root, rel)
    try:
        with open(fp, encoding="utf-8", errors="replace") as fh:
            if corroboration not in fh.read():
                return None
    except OSError:
        return None
    return (why, rel)


def all_schema_patterns(schema_dir):
    pats = set()

    def walk(node):
        if isinstance(node, dict):
            p = node.get("pattern")
            if isinstance(p, str):
                pats.add(p)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    if not os.path.isdir(schema_dir):
        return pats
    for dirpath, _dirs, files in os.walk(schema_dir):
        for fn in files:
            if not fn.endswith(".json"):
                continue
            try:
                with open(os.path.join(dirpath, fn), encoding="utf-8") as fh:
                    walk(json.load(fh))
            except (OSError, ValueError):
                continue
    return pats


def cmd_patterns(root, build_spec, schema_dir):
    canon = all_schema_patterns(schema_dir)
    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)
    checked = 0
    bad = []
    off = {}
    seen = set()
    for lineno, line in prose_lines(lines, in_fence):
        for m in CODE_SPAN_RE.finditer(line):
            span = unescape_table_pipe(m.group(1).strip())
            if not PATTERN_SPAN_RE.match(span):
                continue
            key = (lineno, span)
            if key in seen:
                continue
            seen.add(key)
            if span in canon:
                checked += 1
                continue
            origin = non_schema_origin(root, span)
            if origin:
                off.setdefault(span, origin)
                continue
            checked += 1
            bad.append((lineno, span))
    if checked == 0 and not off:
        emit("PEND", "SC-06a", "todo pattern citado (`^…$`) existe em algum schema do disco",
             "nenhum code span no formato `^…$` encontrado ainda em BUILD_SPEC.md")
        return
    if bad:
        for lineno, span in bad:
            emit("FAIL", "SC-06a", "pattern citado não existe em schema nenhum do disco",
                 "um `pattern` presente em algum schema de skills/study-method/assets/schemas/, "
                 "ou uma entrada do registro fechado de regexes de origem não-schema",
                 "«%s»" % span, "BUILD_SPEC.md:%d" % lineno)
        return
    extra = ""
    if off:
        extra = "; fora de escopo por origem não-schema DECLARADA: " + " · ".join(
            "«%s» (%s)" % (s, o[1]) for s, o in sorted(off.items()))
    emit("PASS", "SC-06a",
         "%d pattern(s) de schema citado(s), todos presentes em algum schema%s" % (checked, extra))


# ─────────────────────────────────────────────────────────── SC-06b · enums citados

ROW_FIELD_RE = re.compile(r'^\|\s*`([A-Za-z_][A-Za-z0-9_.\[\]]*)`\s*\|(.*)$')

# Uma célula só é LISTAGEM DE ENUM se, tirados os code spans, sobra separador — nada de prosa.
# Sem isso, «`generated` se o aluno disse que não tem material; `student_provided` se disse que
# tem» seria lido como "o enum tem 2 valores", e a frase explicativa viraria divergência.
# `…` fica DE FORA da classe: uma célula como `T1`…`T8` é INTERVALO abreviado, não listagem —
# ler dois tokens ali e cobrá-los contra oito valores acusaria a abreviação, não uma divergência.
ENUM_CELL_LEFTOVER_RE = re.compile(r'^[\s·,;/\[\]|*`\-–—]*$')
PAREN_RE = re.compile(r'\([^()]*\)')


def enum_cell_core(cell):
    """A célula sem as anotações entre parênteses — «(`null`)», «(`null` onde opcional)» dizem
    respeito à NULIDADE, não são membros do array `enum`."""
    return PAREN_RE.sub("", cell)


def is_enum_listing(core):
    return bool(ENUM_CELL_LEFTOVER_RE.match(CODE_SPAN_RE.sub("", core)))


OWNER_TOKEN_RE = re.compile(r'[A-Za-z0-9_.-]+')


def schema_stems(schema_dir):
    """nome citável -> arquivo. `session.schema.json` e `session` apontam para o mesmo."""
    stems = {}
    if not os.path.isdir(schema_dir):
        return stems
    for dirpath, _dirs, files in os.walk(schema_dir):
        for fn in sorted(files):
            if not fn.endswith(".json"):
                continue
            stems[fn] = fn
            stems[fn[:-len(".schema.json")] if fn.endswith(".schema.json") else fn[:-5]] = fn
    return stems


def owner_schemas(cell, stems):
    """Arquivos de schema que a célula "onde" ATRIBUI como donos do enum.

    Célula que não nomeia schema nenhum (`bloco study-method:meta`, `saída de memory-digest.sh`)
    põe a linha fora de escopo: o enum não é apresentado como sendo de schema, e cobrá-lo contra
    um campo homônimo de outro arquivo é o falso positivo que este filtro existe para matar.
    """
    return {stems[tok] for tok in OWNER_TOKEN_RE.findall(cell or "") if tok in stems}


def field_path(name):
    """`artifacts[].kind` -> ['artifacts', 'kind'] — o CAMINHO citado, não só a folha."""
    return [seg for seg in name.replace("[]", "").split(".") if seg]


def enum_values(raw):
    """Conjunto do enum SEM o `null`. O schema declara enum nulável pondo `null` no array;
    a tabela do documento anota a nulidade fora da lista. Comparar os dois conjuntos NÃO-nulos
    é comparar a mesma coisa — e continua pegando um valor real que diverge."""
    return frozenset(str(x) for x in raw
                     if x is not None and str(x).strip().lower() != "null")


def schema_enums_by_path(schema_dir):
    """caminho pontilhado (sem `items`) -> [(arquivo, conjunto-de-valores-não-nulos), …].

    Indexar por CAMINHO, e não pela folha, é o que impede `artifacts[].kind` de ser cobrado
    contra o `kind` de progress-event.schema.json — dois campos homônimos de schemas diferentes.
    """
    by_path = {}

    def walk(node, path, fn):
        if isinstance(node, dict):
            props = node.get("properties")
            if isinstance(props, dict):
                for name, sub in props.items():
                    p = path + [name]
                    if isinstance(sub, dict) and isinstance(sub.get("enum"), list):
                        by_path.setdefault(".".join(p), []).append(
                            (fn, enum_values(sub["enum"])))
                    walk(sub, p, fn)
            for k, v in node.items():
                if k == "properties":
                    continue
                walk(v, path, fn)   # items/oneOf/… não acrescentam segmento
        elif isinstance(node, list):
            for v in node:
                walk(v, path, fn)

    if not os.path.isdir(schema_dir):
        return by_path
    for dirpath, _dirs, files in os.walk(schema_dir):
        for fn in sorted(files):
            if not fn.endswith(".json"):
                continue
            try:
                with open(os.path.join(dirpath, fn), encoding="utf-8") as fh:
                    walk(json.load(fh), [], fn)
            except (OSError, ValueError):
                continue
    return by_path


def enums_for_path(by_path, cited):
    """Todo enum cujo caminho TERMINA no caminho citado (sufixo de segmentos, não substring)."""
    segs = field_path(cited)
    if not segs:
        return []
    hits = []
    for p, lst in sorted(by_path.items()):
        ps = p.split(".")
        if len(ps) >= len(segs) and ps[-len(segs):] == segs:
            hits.extend(lst)
    return hits


def cmd_enums(root, build_spec, schema_dir):
    by_path = schema_enums_by_path(schema_dir)
    stems = schema_stems(schema_dir)
    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)
    checked = 0
    bad = []
    prose_rows = 0
    unowned_rows = 0
    seen = set()
    for lineno, line in prose_lines(lines, in_fence):
        m = ROW_FIELD_RE.match(line.rstrip())
        if not m:
            continue
        field_raw, rest = m.group(1), m.group(2)
        cells = rest.split("|")
        if not cells:
            continue
        candidates = enums_for_path(by_path, field_raw)
        if not candidates:
            continue  # fora do escopo: o caminho não é propriedade com enum em schema nenhum
        owners = owner_schemas(cells[1] if len(cells) > 1 else "", stems)
        if not owners:
            unowned_rows += 1
            continue  # a linha não atribui o enum a schema nenhum
        candidates = [(fn, vals) for fn, vals in candidates if fn in owners]
        if not candidates:
            continue
        core = enum_cell_core(cells[0])
        if not is_enum_listing(core):
            prose_rows += 1
            continue  # a célula EXPLICA valores em prosa; não é a listagem do enum
        tokens = [x.strip() for x in CODE_SPAN_RE.findall(core)]
        tokens = [x for x in tokens if x.lower() != "null"]
        if len(tokens) < 2:
            continue
        key = (lineno, field_raw)
        if key in seen:
            continue
        seen.add(key)
        checked += 1
        cited = frozenset(tokens)
        if not any(cited == vals for _fn, vals in candidates):
            shown = " ⁄ ".join(sorted(set(
                "%s{%s}" % (fn, ", ".join(sorted(c))) for fn, c in candidates)))
            bad.append((lineno, field_raw, sorted(tokens), shown))
    if checked == 0:
        emit("PEND", "SC-06b", "todo enum citado bate com o enum do schema dono",
             "nenhuma linha de tabela `campo` | `v1` · `v2` … cujo campo seja uma propriedade "
             "com enum em algum schema foi encontrada ainda em BUILD_SPEC.md")
        return
    if bad:
        for lineno, field_raw, tokens, shown in bad:
            emit("FAIL", "SC-06b", "enum citado diverge do enum do schema dono (campo `%s`)" % field_raw,
                 "um dos conjuntos do schema: %s" % shown,
                 "{%s}" % ", ".join(tokens), "BUILD_SPEC.md:%d" % lineno)
        return
    extra = ""
    if prose_rows or unowned_rows:
        parts = []
        if prose_rows:
            parts.append("%d linha(s) descrevem valores em prosa ou por intervalo abreviado, "
                         "não por listagem" % prose_rows)
        if unowned_rows:
            parts.append("%d linha(s) não atribuem o enum a schema nenhum na coluna «onde»"
                         % unowned_rows)
        extra = "; fora de escopo: " + " · ".join(parts)
    emit("PASS", "SC-06b",
         "%d enum(s) citado(s) em tabela, todos batendo com o enum do MESMO caminho no schema "
         "dono (comparação sem o `null`)%s" % (checked, extra))


# ───────────────────────────────────────────────────────── SC-07 · tabela de exit codes

VALID_CODES = {"0", "1", "2", "3", "4", "5", "10"}


def normalize_text(s):
    s = s.strip()
    s = re.sub(r'\*\*', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s


def parse_table_row(line):
    line = line.strip()
    if not (line.startswith("|") and line.endswith("|")):
        return None
    return [p.strip() for p in line.strip("|").split("|")]


def contract_exit_table(contract_lines):
    table = {}
    infile = False
    for line in contract_lines:
        if re.match(r'^### 5\.1', line):
            infile = True
            continue
        if infile and re.match(r'^### 5\.2', line):
            break
        if not infile:
            continue
        parts = parse_table_row(line)
        if not parts or len(parts) < 2:
            continue
        code = re.sub(r'\*\*', '', parts[0]).strip()
        if not re.match(r'^\d+$', code) or code not in VALID_CODES:
            continue
        table[code] = normalize_text(parts[1])
    return table


HEADING_RE = re.compile(r'^(#{1,6})\s')
EXIT_HEADING_RE = re.compile(r'exit\s*codes?|c[oó]digos?\s+de\s+sa[ií]da', re.IGNORECASE)
# §5.1 do contrato se chama "Tabela canônica"; é ELA que SC-07 compara. As subseções irmãs
# (exceções nomeadas, códigos OBSERVADOS do ambiente) reusam os mesmos números com outro
# significado — 2 é `mix test` lá e "uso incorreto" aqui —, e lê-las juntas trocaria as duas.
CANON_TABLE_RE = re.compile(r'tabela\s+can[oô]nica', re.IGNORECASE)


def _rows_between(lines, in_fence, start, end):
    table = {}
    for i in range(start, end):
        if in_fence[i]:
            continue
        parts = parse_table_row(lines[i])
        if not parts or len(parts) < 2:
            continue
        code = re.sub(r'\*\*', '', parts[0]).strip()
        if not re.match(r'^\d+$', code) or code not in VALID_CODES:
            continue
        table[code] = normalize_text(parts[1])
    return table


def _next_heading(lines, in_fence, start):
    """Fim da seção = PRÓXIMO cabeçalho de QUALQUER nível — subseção também encerra."""
    for i in range(start + 1, len(lines)):
        if in_fence[i]:
            continue
        if HEADING_RE.match(lines[i]):
            return i
    return len(lines)


def build_spec_exit_table(lines, in_fence):
    """(tabela, rótulo-da-seção-lida) ou (None, None) se a seção ainda não existe."""
    exit_at = None
    for i, line in enumerate(lines):
        if in_fence[i]:
            continue
        if HEADING_RE.match(line) and EXIT_HEADING_RE.search(line):
            exit_at = i
            break
    if exit_at is None:
        return None, None
    # a tabela canônica é a primeira subseção "Tabela canônica" a partir do cabeçalho de
    # exit codes; ela termina no próximo cabeçalho, seja qual for o nível.
    for i in range(exit_at, len(lines)):
        if in_fence[i]:
            continue
        if HEADING_RE.match(lines[i]) and CANON_TABLE_RE.search(lines[i]):
            end = _next_heading(lines, in_fence, i)
            return _rows_between(lines, in_fence, i, end), lines[i].strip()
    # sem subseção nomeada: lê só até o próximo cabeçalho — nunca engolindo as irmãs.
    end = _next_heading(lines, in_fence, exit_at)
    return _rows_between(lines, in_fence, exit_at, end), lines[exit_at].strip()


def cmd_exitcodes(root, build_spec, contract):
    if not os.path.isfile(contract):
        emit("PEND", "SC-07", "a tabela de exit codes bate com docs/00-contratos.md §5.1",
             "docs/00-contratos.md ausente")
        return
    canon = contract_exit_table(read_lines(contract))
    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)
    doc_table, where = build_spec_exit_table(lines, in_fence)
    if doc_table is None:
        emit("PEND", "SC-07", "a tabela de exit codes bate com docs/00-contratos.md §5.1",
             "nenhum heading contendo «exit codes»/«códigos de saída» encontrado ainda em "
             "BUILD_SPEC.md")
        return
    bad = []
    for code, sig in canon.items():
        if code not in doc_table:
            bad.append((code, sig, "ausente da tabela do documento"))
        elif doc_table[code] != sig:
            bad.append((code, sig, "«%s»" % doc_table[code]))
    if bad:
        for code, sig, got in bad:
            emit("FAIL", "SC-07", "código %s diverge da tabela §5.1" % code,
                 "«%s» (§5.1)" % sig, got, "BUILD_SPEC.md, %s" % where)
        return
    emit("PASS", "SC-07", "os %d código(s) de §5.1 batem com a tabela canônica do documento (%s)"
         % (len(canon), where))


# ──────────────────────────────────────────────────────── SC-08 · termos revogados

REVOKED_TERMS = [
    (r'resolve_target', 'nome de passo revogado (§2.2) — vira `bootstrap`'),
    (r'verify_setup', 'nome de passo revogado (§2.2) — vira `bootstrap`'),
    (r'bootstrap_or_ask', 'nome de passo revogado (§2.2) — vira `setup_interview`'),
    (r'ingest_docs', 'nome de passo revogado (§2.2) — vira `load_docs`'),
    (r'teach_loop', 'nome de passo revogado (§2.2) — vira `teach`'),
    (r'challenge_cycle', 'nome de passo revogado (§2.2) — vira `challenge`'),
    (r'session_status', 'campo revogado (§4.1) — vira `status`'),
    (r'\.study-method/', 'diretório de controle revogado (§10) — não existe'),
    (r'(?<![-a-zA-Z])manifest\.json', 'nome de manifesto revogado (§10) — vira `setup.json`/`meta.json`'),
    (r'docs-manifest\.json', 'nome revogado (§3.2) — vira `docs-index.json`'),
    (r'SETUP_CTL', 'constante revogada (§10)'),
    (r'PROFILE\.json', 'nome revogado (A-11) — vira `profile.json`'),
    (r'challenge-run\.sh', 'script removido (§8, A-19)'),
    (r'render-html\.sh', 'script removido (§8, A-19)'),
    (r'allow_cross_read', 'campo revogado (§4.1, A-14) — vira `cross_read`'),
    (r'last_used_at', 'campo revogado — vira `last_seen_at`'),
]

REVOKE_MARKERS = re.compile(
    r'nao existe|não existe|inexistente|removid|revogad|descartad|resolvida|vence |'
    r'era `|antig[oa]|deixou de|proibid|nunca|não aparece|não pode|n[ãa]o [ée]|'
    r'não cite|em vez de|substitu|obsolet|legado|não tinham contrato|caiu junto|'
    r'versão anterior|mentind|diga:|não use|não confundir|desambigua',
    re.IGNORECASE)


def cmd_revoked(root, build_spec):
    lines = read_lines(build_spec)
    in_fence, _ = scan_fences(lines)
    bad = []
    for term_pat, desc in REVOKED_TERMS:
        rx = re.compile(term_pat)
        for lineno, line in prose_lines(lines, in_fence):
            if not rx.search(line):
                continue
            lo = max(0, lineno - 2)
            hi = min(len(lines), lineno + 1)
            window = "\n".join(lines[lo:hi])
            if REVOKE_MARKERS.search(window):
                continue
            bad.append((lineno, desc, trunc(line.strip(), 160)))
    if bad:
        for lineno, desc, text in bad:
            emit("FAIL", "SC-08", "termo revogado sem marcador de revogação na janela de 3 linhas",
                 desc, "«%s»" % text, "BUILD_SPEC.md:%d" % lineno)
        return
    emit("PASS", "SC-08", "nenhum termo revogado sem marcador de revogação")


# ─────────────────────────────────────────────────────────────────────── main

COMMANDS = {
    "paths": (cmd_paths, 2),
    "scripts": (cmd_scripts, 3),
    "funcs": (cmd_funcs, 3),
    "schemas": (cmd_schemas, 3),
    "decisions": (cmd_decisions, 3),
    "patterns": (cmd_patterns, 3),
    "enums": (cmd_enums, 3),
    "exitcodes": (cmd_exitcodes, 3),
    "revoked": (cmd_revoked, 2),
}


def main(argv):
    if len(argv) < 2 or argv[1] not in COMMANDS:
        sys.stderr.write("uso: spec_scan.py <%s> <root> <build_spec> [extra]\n"
                          % "|".join(sorted(COMMANDS)))
        return 2
    fn, nargs = COMMANDS[argv[1]]
    rest = argv[2:]
    if len(rest) != nargs:
        sys.stderr.write("spec_scan.py %s: esperava %d argumento(s), recebeu %d\n"
                          % (argv[1], nargs, len(rest)))
        return 2
    fn(*rest)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PYEOF

# _consume <arquivo-de-saída-do-scanner> — traduz o protocolo US-delimitado em chamadas de
# tests/lib/assert.sh. Cada linha já chega pronta (kind + campos); este laço só distribui.
_consume() {
  local outfile="$1" kind id a b c d
  while IFS=$'\x1f' read -r kind id a b c d; do
    case "$kind" in
      PASS) gate_pass "$id" "$a" ;;
      FAIL) gate_fail "$id" "$a" "$b" "$c" "$d" ;;
      PEND) gate_pend "$id" "$a" "$b" ;;
      WARN) gate_warn "$id" "$a" "$b" ;;
      *) : ;;
    esac
  done < "$outfile"
}

# ═══════════════════════════════════════════════════════════ BUILD_SPEC.md ainda não existe
if [ ! -f "$BUILD_SPEC" ]; then
  for id in $ALL_IDS; do
    gate_pend "$id" "conformidade do BUILD_SPEC.md contra o repositório" \
      "BUILD_SPEC.md ainda não existe na raiz do repositório — o documento-mestre ainda não foi costurado por esta onda (docs/build-spec/README.md: a onda 4 costura os fragmentos de docs/build-spec/*.md num BUILD_SPEC.md único). Isto é PENDÊNCIA, não violação de contrato."
  done
  gate_summary
  exit $?
fi

# ═══════════════════════════════════════════════════════════════════ os checks

gate_section "SC-01 · caminhos de arquivo citados existem no repositório"
python3 "$SCANNER" paths "$GATE_ROOT" "$BUILD_SPEC" > "$GATE_TMPDIR/sc01.out"
_consume "$GATE_TMPDIR/sc01.out"

gate_section "SC-02 · inventário de scripts (§8) — citação por caminho e cobertura"
python3 "$SCANNER" scripts "$GATE_ROOT" "$BUILD_SPEC" "$CONTRACT" > "$GATE_TMPDIR/sc02.out"
_consume "$GATE_TMPDIR/sc02.out"

gate_section "SC-03 · assinaturas de função de lib/ citadas existem"
python3 "$SCANNER" funcs "$GATE_ROOT" "$BUILD_SPEC" "$LIB_DIR" > "$GATE_TMPDIR/sc03.out"
_consume "$GATE_TMPDIR/sc03.out"

gate_section "SC-04 · schemas transcritos batem com os do disco"
python3 "$SCANNER" schemas "$GATE_ROOT" "$BUILD_SPEC" "$SCHEMA_DIR" > "$GATE_TMPDIR/sc04.out"
_consume "$GATE_TMPDIR/sc04.out"

gate_section "SC-05 · marcadores de decisão ⭐ — as duas direções"
python3 "$SCANNER" decisions "$GATE_ROOT" "$BUILD_SPEC" "$DECISIONS" > "$GATE_TMPDIR/sc05.out"
_consume "$GATE_TMPDIR/sc05.out"

gate_section "SC-06 · vocabulário — patterns e enums citados batem com os schemas"
python3 "$SCANNER" patterns "$GATE_ROOT" "$BUILD_SPEC" "$SCHEMA_DIR" > "$GATE_TMPDIR/sc06a.out"
_consume "$GATE_TMPDIR/sc06a.out"
python3 "$SCANNER" enums "$GATE_ROOT" "$BUILD_SPEC" "$SCHEMA_DIR" > "$GATE_TMPDIR/sc06b.out"
_consume "$GATE_TMPDIR/sc06b.out"

gate_section "SC-07 · tabela de exit codes bate com §5.1"
python3 "$SCANNER" exitcodes "$GATE_ROOT" "$BUILD_SPEC" "$CONTRACT" > "$GATE_TMPDIR/sc07.out"
_consume "$GATE_TMPDIR/sc07.out"

gate_section "SC-08 · nenhum termo revogado sem marcador de revogação"
python3 "$SCANNER" revoked "$GATE_ROOT" "$BUILD_SPEC" > "$GATE_TMPDIR/sc08.out"
_consume "$GATE_TMPDIR/sc08.out"

gate_summary
