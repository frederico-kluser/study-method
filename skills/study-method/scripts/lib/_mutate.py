#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""_mutate.py — motor de mutacao do catalogo FIXO v1.0 (docs/05 §5).

Auxiliar de `challenge-verify.sh`. NAO e um script publico da skill: o nome
comeca com `_` justamente para nao entrar na tabela canonica de CLI (docs/00 §8)
e para nao colidir com nenhum outro script de `scripts/`.

O catalogo e MECANICO e DETERMINISTICO. Ele nunca e pedido a um modelo: o mesmo
vies que escreveu o teste escreveria os mutantes, e o score subiria sem que a
suite tivesse melhorado (docs/05 §5, MuTAP).

Operadores, na ordem canonica de aplicacao:
    ROR  relacionais      <  <-> <=   >  <-> >=   == <-> !=      1 por ocorrencia
    AOR  aritmeticos      + <-> -     * -> /     / -> *  % -> *  1 por ocorrencia NAO composta
    LCR  conectores       and <-> or  && <-> ||                  1 por ocorrencia
    UOI  unario           remove `not `  remove `!`              1 por ocorrencia
    CRP  constantes       cada literal inteiro n -> n+1 e n-1    2 por literal
    SDL  delecao          linha executavel elegivel -> no-op     1 por linha elegivel
    RVR  retorno          corpo da funcao -> return <valor-zero> 1 por funcao que devolve valor
    SVR  variavel         leitura local -> outra local ligada    1 por ocorrencia de leitura

REGRA QUE FECHA A AMBIGUIDADE (docs/05 §5.1): um caractere de operador que faca
parte de um operador COMPOSTO de atribuicao (`+=`, `*=`, `//=`, ...) NAO e mutado;
`**`, `//`, `<<`, `>>` e `->` tambem nao. Sem essa regra duas implementacoes do
"mesmo" catalogo produzem denominadores diferentes, e o portao de 0,90 passa a
significar coisas diferentes em cada maquina.

`mutant_id` = `<OP>@L<linha>C<coluna>`, 1-based nos dois. CRP acrescenta `+`/`-`
porque produz DOIS mutantes no mesmo sitio; sem o sufixo os ids colidem e o
pareamento pedido/resposta do REQUEST/APPLY quebra.

Strings e comentarios sao MASCARADOS antes de qualquer regex casar: o `404` de
`"erro 404"` nao e literal mutavel e o `<` de uma docstring nao e operador.

Uso:
    _mutate.py list  <fonte> [--language python] [--json]
    _mutate.py apply <fonte> <mutant_id> [--language python]   # escreve o mutante em stdout
    _mutate.py count <fonte> [--language python]               # distribuicao por operador

Saida de `list --json`: {"operators_version": "1.0", "language": "...",
"mutants": [{mutant_id, operator, line, column, before, after}, ...]}
"""

import argparse
import json
import re
import sys

OPERATORS_VERSION = "1.0"

# ---------------------------------------------------------------- perfis
# O motor e o mesmo para todas as linguagens; muda o marcador de comentario,
# o delimitador de string, os conectores logicos e a forma do no-op.
PROFILES = {
    "python": {
        "line_comment": ["#"],
        "block_comment": [],
        "quotes": ['"""', "'''", '"', "'"],
        "logical": [("and", "or"), ("or", "and")],
        "unary_not": [r"\bnot\s+"],
        "noop": "pass",
        "block_open_suffix": ":",
        "block_keywords": ("if", "for", "while", "else", "elif", "try", "with",
                           "except", "finally", "match", "case", "def", "class",
                           "async"),
        "skip_prefixes": ("return", "import", "from", "global", "nonlocal",
                          "pass", "yield", "def", "class", "@", "elif", "else"),
        "def_re": r"^(\s*)def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)",
        "return_re": r"^\s*return\s+(\S.*)$",
        "assign_re": r"^\s*([A-Za-z_]\w*)\s*(?:=(?!=)|[-+*/%&|^]=|//=|\*\*=|<<=|>>=)",
        "for_re": r"^\s*for\s+([A-Za-z_]\w*)\s+in\b",
        "keywords": {
            "and", "or", "not", "if", "else", "elif", "for", "while", "in", "is",
            "def", "class", "return", "raise", "try", "except", "finally", "with",
            "as", "import", "from", "global", "nonlocal", "lambda", "yield", "pass",
            "break", "continue", "assert", "del", "None", "True", "False", "async",
            "await", "match", "case", "self", "print", "range", "len", "int", "str",
            "float", "list", "dict", "set", "tuple", "sum", "min", "max", "abs",
            "enumerate", "zip", "sorted", "reversed", "type", "bool", "map", "filter",
        },
    },
    "c_family": {
        "line_comment": ["//"],
        "block_comment": [("/*", "*/")],
        "quotes": ['"', "'"],
        "logical": [("&&", "||"), ("||", "&&")],
        "unary_not": [r"!(?=[A-Za-z_(])"],
        "noop": ";",
        "block_open_suffix": "{",
        "block_keywords": ("if", "for", "while", "else", "do", "switch", "case",
                           "try", "catch", "finally", "function", "func", "fn"),
        "skip_prefixes": ("return", "import", "package", "use", "#include",
                          "#define", "}", "{", "break", "continue"),
        "def_re": r"^(\s*)(?:function|func|fn)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)",
        "return_re": r"^\s*return\s+(\S.*?);?\s*$",
        "assign_re": r"^\s*(?:var|let|const|int|long|double|float|char)?\s*([A-Za-z_]\w*)\s*(?:=(?!=)|[-+*/%&|^]=|<<=|>>=)",
        "for_re": r"^\s*for\s*\(\s*(?:var|let|const|int)?\s*([A-Za-z_]\w*)\b",
        "keywords": {
            "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
            "return", "int", "long", "double", "float", "char", "void", "const",
            "static", "struct", "typedef", "sizeof", "NULL", "true", "false", "null",
            "var", "let", "function", "func", "fn", "let", "mut", "pub", "use",
            "package", "import", "new", "this", "self", "printf", "console", "log",
        },
    },
}

LANGUAGE_PROFILE = {
    "python": "python",
    "javascript": "c_family", "typescript": "c_family", "java": "c_family",
    "kotlin": "c_family", "csharp": "c_family", "c": "c_family", "cpp": "c_family",
    "go": "c_family", "rust": "c_family", "php": "c_family", "swift": "c_family",
}

# Ordem canonica dos operadores: e tambem a ordem de amostragem (docs/05 §4.4).
OPERATOR_ORDER = ["ROR", "AOR", "LCR", "UOI", "CRP", "SDL", "RVR", "SVR"]

# Casamento guloso por comprimento decrescente. Sem isso `a=-1` viraria o token
# inexistente `=-`, e `**` viraria dois `*` mutaveis.
OPERATOR_TOKENS = [
    "**=", "//=", "<<=", ">>=",
    "==", "!=", "<=", ">=", "->", "**", "//", "<<", ">>",
    "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "&&", "||",
    "<", ">", "=", "+", "-", "*", "/", "%", "&", "|", "^", "~", "!",
]

ROR_MAP = {"<": "<=", "<=": "<", ">": ">=", ">=": ">", "==": "!=", "!=": "=="}
AOR_MAP = {"+": "-", "-": "+", "*": "/", "/": "*", "%": "*"}
LCR_SYM_MAP = {"&&": "||", "||": "&&"}

MASK_CHAR = "\x00"


# ---------------------------------------------------------------- mascaramento
def mask_source(text, profile):
    """Devolve um texto do MESMO comprimento com o conteudo de strings e
    comentarios trocado por MASK_CHAR. As posicoes se preservam, entao um casamento
    no texto mascarado aponta o offset exato no texto real."""
    out = list(text)
    i, n = 0, len(text)
    quotes = sorted(profile["quotes"], key=len, reverse=True)
    line_comments = profile["line_comment"]
    block_comments = profile["block_comment"]
    while i < n:
        ch = text[i]
        matched = False
        # comentario de bloco
        for op, cl in block_comments:
            if text.startswith(op, i):
                j = text.find(cl, i + len(op))
                j = n if j < 0 else j + len(cl)
                for k in range(i, j):
                    if text[k] != "\n":
                        out[k] = MASK_CHAR
                i = j
                matched = True
                break
        if matched:
            continue
        # comentario de linha
        for marker in line_comments:
            if text.startswith(marker, i):
                j = text.find("\n", i)
                j = n if j < 0 else j
                for k in range(i, j):
                    out[k] = MASK_CHAR
                i = j
                matched = True
                break
        if matched:
            continue
        # string
        for q in quotes:
            if text.startswith(q, i):
                j = i + len(q)
                while j < n:
                    if text[j] == "\\":
                        j += 2
                        continue
                    if text.startswith(q, j):
                        j += len(q)
                        break
                    j += 1
                else:
                    j = n
                for k in range(i, j):
                    if text[k] != "\n":
                        out[k] = MASK_CHAR
                i = j
                matched = True
                break
        if matched:
            continue
        i += 1
        del ch
    return "".join(out)


def line_starts(text):
    starts = [0]
    for idx, ch in enumerate(text):
        if ch == "\n":
            starts.append(idx + 1)
    return starts


def pos_to_linecol(starts, offset):
    lo, hi = 0, len(starts) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if starts[mid] <= offset:
            lo = mid
        else:
            hi = mid - 1
    return lo + 1, offset - starts[lo] + 1


# ---------------------------------------------------------------- tokens
def operator_tokens(masked):
    """Todos os tokens de operador do texto mascarado, casados gulosamente.
    Devolve [(offset, token)]."""
    toks = []
    i, n = 0, len(masked)
    opchars = set("<>=!+-*/%&|^~")
    while i < n:
        if masked[i] in opchars:
            for t in OPERATOR_TOKENS:
                if masked.startswith(t, i):
                    toks.append((i, t))
                    i += len(t)
                    break
            else:
                i += 1
        else:
            i += 1
    return toks


def is_masked_line(masked, starts, line):
    """True se a linha inteira e comentario/vazia no texto mascarado."""
    beg = starts[line - 1]
    end = starts[line] - 1 if line < len(starts) else len(masked)
    return masked[beg:end].strip("\x00 \t") == ""


# ---------------------------------------------------------------- operadores
def gen_ror(text, masked, starts):
    out = []
    for off, tok in operator_tokens(masked):
        if tok in ROR_MAP:
            line, col = pos_to_linecol(starts, off)
            out.append(_mk("ROR", line, col, off, len(tok), ROR_MAP[tok], text, starts))
    return out


def gen_aor(text, masked, starts):
    out = []
    for off, tok in operator_tokens(masked):
        # Somente o token EXATO de um caractere. `*=`, `**`, `//` e `->` casam como
        # tokens proprios e por isso nunca chegam aqui: e a regra §5.1 aplicada
        # pelo casamento guloso, nao por uma lista de excecoes.
        if tok in AOR_MAP:
            line, col = pos_to_linecol(starts, off)
            out.append(_mk("AOR", line, col, off, 1, AOR_MAP[tok], text, starts))
    return out


def gen_lcr(text, masked, starts, profile):
    out = []
    for off, tok in operator_tokens(masked):
        if tok in LCR_SYM_MAP:
            line, col = pos_to_linecol(starts, off)
            out.append(_mk("LCR", line, col, off, len(tok), LCR_SYM_MAP[tok], text, starts))
    for a, b in profile["logical"]:
        if not a.isalpha():
            continue
        for m in re.finditer(r"\b%s\b" % re.escape(a), masked):
            line, col = pos_to_linecol(starts, m.start())
            out.append(_mk("LCR", line, col, m.start(), len(a), b, text, starts))
    out.sort(key=lambda d: (d["line"], d["column"]))
    return out


def gen_uoi(text, masked, starts, profile):
    out = []
    for pat in profile["unary_not"]:
        for m in re.finditer(pat, masked):
            line, col = pos_to_linecol(starts, m.start())
            out.append(_mk("UOI", line, col, m.start(), m.end() - m.start(), "", text, starts))
    out.sort(key=lambda d: (d["line"], d["column"]))
    return out


INT_LITERAL = re.compile(r"(?<![\w.])(\d+)(?![\w.])")


def gen_crp(text, masked, starts):
    """Cada literal inteiro vira n+1 e n-1: DOIS mutantes por literal, com sufixo
    de direcao no id. Sem o sufixo os dois colidiriam no mesmo sitio."""
    out = []
    for m in INT_LITERAL.finditer(masked):
        val = int(m.group(1))
        line, col = pos_to_linecol(starts, m.start())
        for sign, new in (("+", val + 1), ("-", val - 1)):
            d = _mk("CRP", line, col, m.start(), len(m.group(1)), str(new), text, starts)
            d["mutant_id"] = "CRP@L%dC%d%s" % (line, col, sign)
            out.append(d)
    return out


def gen_sdl(text, masked, starts, profile):
    """Linha executavel elegivel -> no-op. Inelegiveis (docs/05 §5.3): assinatura,
    `return`, import, global/nonlocal, linha que ABRE bloco (deletar produziria
    mutante que nao compila: ruido no denominador) e linha que ja e no-op."""
    out = []
    lines = text.split("\n")
    for idx, raw in enumerate(lines, start=1):
        if is_masked_line(masked, starts, idx):
            continue
        beg = starts[idx - 1]
        end = starts[idx] - 1 if idx < len(starts) else len(masked)
        stripped_masked = masked[beg:end].rstrip()
        stripped = raw.strip()
        if not stripped:
            continue
        first_word = re.match(r"[A-Za-z_#@]+", stripped)
        first_word = first_word.group(0) if first_word else ""
        if first_word in profile["skip_prefixes"] or stripped.startswith("@"):
            continue
        if stripped_masked.endswith(profile["block_open_suffix"]):
            continue
        if first_word in profile["block_keywords"]:
            continue
        if stripped in ("pass", ";", "{", "}", "};"):
            continue
        indent = len(raw) - len(raw.lstrip())
        col = indent + 1
        after = " " * indent + profile["noop"]
        d = {
            "operator": "SDL", "line": idx, "column": col,
            "mutant_id": "SDL@L%dC%d" % (idx, col),
            "before": raw, "after": after,
            "_kind": "line", "_line": idx,
        }
        out.append(d)
    return out


def _zero_value(expr, body_lines, profile):
    """Valor-zero do tipo devolvido, inferido do fonte (docs/05 §5.3)."""
    e = expr.strip().rstrip(";").strip()
    if re.fullmatch(r"-?\d+", e):
        return "0"
    if re.fullmatch(r"-?\d*\.\d+([eE][-+]?\d+)?", e):
        return "0"
    if e[:1] in ('"', "'") or e[:2] in ('f"', "f'"):
        return '""'
    if e.startswith("["):
        return "[]"
    if e.startswith("{"):
        return "{}"
    if e in ("True", "False", "true", "false") or re.search(r"(==|!=|<=|>=|\bnot\b|\band\b|\bor\b)", e):
        return "False" if profile is PROFILES["python"] else "false"
    if re.search(r"[-+*/%]", e) or re.fullmatch(r"\w+\(.*\)", e) is None and re.search(r"\d", e):
        return "0"
    if re.fullmatch(r"[A-Za-z_]\w*", e):
        # Nome nu: resolve pela atribuicao a esse nome dentro do corpo. A atribuicao
        # SIMPLES manda, porque e ela que fixa o tipo; a composta (`acc *= i`) so
        # entra como desempate e, com operador aritmetico, ja implica numerico.
        plain, comp = None, None
        for src in body_lines:
            m = re.match(r"^\s*%s\s*=(?!=)\s*(.+)$" % re.escape(e), src)
            if m:
                plain = m.group(1).strip()
            m = re.match(r"^\s*%s\s*([-+*/%%])=\s*(.+)$" % re.escape(e), src)
            if m:
                comp = (m.group(1), m.group(2).strip())
        if plain is not None and plain != e:
            return _zero_value(plain, [], profile)
        if comp is not None:
            if comp[0] in "-*/%":
                return "0"
            return _zero_value(comp[1], [], profile)
        return "None" if profile is PROFILES["python"] else "null"
    return "None" if profile is PROFILES["python"] else "null"


def _functions(text, profile):
    """[(nome, linha_da_assinatura, primeira_linha_do_corpo, ultima_linha_do_corpo,
    indent_do_corpo, params)] — por indentacao na familia Python, por chave na
    familia C."""
    lines = text.split("\n")
    funcs = []
    def_re = re.compile(profile["def_re"])
    for i, raw in enumerate(lines, start=1):
        m = def_re.match(raw)
        if not m:
            continue
        sig_indent = len(m.group(1))
        params = [p.strip().split(":")[0].split("=")[0].strip()
                  for p in m.group(3).split(",") if p.strip()]
        params = [p for p in params if re.fullmatch(r"[A-Za-z_]\w*", p) and p != "self"]
        body_start = None
        body_end = i
        for j in range(i + 1, len(lines) + 1):
            raw_j = lines[j - 1]
            if not raw_j.strip():
                continue
            ind = len(raw_j) - len(raw_j.lstrip())
            if ind <= sig_indent:
                break
            if body_start is None:
                body_start = j
            body_end = j
        if body_start is None:
            continue
        body_indent = len(lines[body_start - 1]) - len(lines[body_start - 1].lstrip())
        funcs.append((m.group(2), i, body_start, body_end, body_indent, params))
    return funcs


def gen_rvr(text, masked, starts, profile):
    """1 mutante por funcao que devolve valor. Funcao so de efeito colateral gera
    ZERO: o mutante seria identico a referencia, equivalente por construcao, e
    equivalente por construcao nao entra no denominador para depois sair dele."""
    out = []
    lines = text.split("\n")
    ret_re = re.compile(profile["return_re"])
    for name, sig_line, body_start, body_end, body_indent, _params in _functions(text, profile):
        body = lines[body_start - 1:body_end]
        has_value_return = False
        for src in body:
            m = ret_re.match(src)
            if m and m.group(1).strip() not in ("", "None", "null", ";"):
                has_value_return = True
                zero_expr = m.group(1)
                break
        if not has_value_return:
            continue
        zero = _zero_value(zero_expr, body, profile)
        after = " " * body_indent + "return " + zero
        d = {
            "operator": "RVR", "line": body_start, "column": 1,
            "mutant_id": "RVR@L%dC1" % body_start,
            "before": "<corpo de %s>" % name,
            "after": after,
            "_kind": "block", "_from": body_start, "_to": body_end,
        }
        out.append(d)
        del sig_line
    out.sort(key=lambda d: (d["line"], d["column"]))
    return out


NAME_RE = re.compile(r"(?<![\w.])([A-Za-z_]\w*)")


def gen_svr(text, masked, starts, profile):
    """1 mutante por OCORRENCIA DE LEITURA elegivel — nunca por par de variaveis.
    Com 3 locais e 4 leituras, "todos os pares" daria 8; esta regra da 4."""
    out = []
    lines = text.split("\n")
    masked_lines = masked.split("\n")
    keywords = profile["keywords"]
    assign_re = re.compile(profile["assign_re"])
    for_re = re.compile(profile["for_re"])

    for _name, sig_line, body_start, body_end, _bi, params in _functions(text, profile):
        # ordem de ligacao: parametros primeiro, depois atribuicoes/for na ordem do fonte
        binding_order = list(dict.fromkeys(params))
        bound_at = {p: sig_line for p in params}
        for j in range(body_start, body_end + 1):
            src = masked_lines[j - 1]
            m = assign_re.match(src)
            if m and m.group(1) not in bound_at:
                binding_order.append(m.group(1))
                bound_at[m.group(1)] = j          # ligado a partir da PROXIMA linha
            m = for_re.match(src)
            if m and m.group(1) not in bound_at:
                binding_order.append(m.group(1))
                bound_at[m.group(1)] = j          # variavel de laco vale do CORPO em diante

        for j in range(body_start, body_end + 1):
            raw = lines[j - 1]
            msrc = masked_lines[j - 1]
            if not msrc.strip("\x00 \t"):
                continue
            # alvos de atribuicao nesta linha nao sao leitura
            targets = set()
            m = assign_re.match(msrc)
            if m:
                targets.add(m.group(1))
            m = for_re.match(msrc)
            if m:
                targets.add(m.group(1))
            bound_here = [b for b in binding_order if bound_at[b] < j]
            if len(bound_here) < 2:
                continue
            for nm in NAME_RE.finditer(msrc):
                ident = nm.group(1)
                col = nm.start() + 1
                if ident in keywords or ident in targets:
                    continue
                if ident not in bound_here:
                    continue
                after_ch = msrc[nm.end():nm.end() + 1]
                if after_ch == "(":                 # nome de funcao em chamada
                    continue
                if nm.start() > 0 and msrc[nm.start() - 1] == ".":
                    continue
                # primeira ocorrencia da linha do `for`: alvo do laco ja excluido acima
                idx = bound_here.index(ident)
                repl = bound_here[(idx - 1) % len(bound_here)]
                if repl == ident:
                    continue
                off = starts[j - 1] + nm.start()
                out.append(_mk("SVR", j, col, off, len(ident), repl, text, starts))
        del raw
    out.sort(key=lambda d: (d["line"], d["column"]))
    return out


def _mk(op, line, col, off, length, replacement, text, starts):
    beg = starts[line - 1]
    end = starts[line] - 1 if line < len(starts) else len(text)
    before = text[beg:end]
    after = text[beg:off] + replacement + text[off + length:end]
    return {
        "operator": op, "line": line, "column": col,
        "mutant_id": "%s@L%dC%d" % (op, line, col),
        "before": before, "after": after,
        "_kind": "span", "_off": off, "_len": length, "_repl": replacement,
    }


# ---------------------------------------------------------------- catalogo
def generate(text, language="python"):
    profile = PROFILES[LANGUAGE_PROFILE.get(language, "python")]
    masked = mask_source(text, profile)
    starts = line_starts(text)
    buckets = {
        "ROR": gen_ror(text, masked, starts),
        "AOR": gen_aor(text, masked, starts),
        "LCR": gen_lcr(text, masked, starts, profile),
        "UOI": gen_uoi(text, masked, starts, profile),
        "CRP": gen_crp(text, masked, starts),
        "SDL": gen_sdl(text, masked, starts, profile),
        "RVR": gen_rvr(text, masked, starts, profile),
        "SVR": gen_svr(text, masked, starts, profile),
    }
    mutants = []
    for op in OPERATOR_ORDER:
        for d in sorted(buckets[op], key=lambda x: (x["line"], x["column"], x["mutant_id"])):
            mutants.append(d)
    return mutants


def render(text, mutant):
    """Aplica UMA mutacao e devolve o fonte inteiro. Uma mutacao por mutante."""
    kind = mutant["_kind"]
    if kind == "span":
        off, ln, repl = mutant["_off"], mutant["_len"], mutant["_repl"]
        return text[:off] + repl + text[off + ln:]
    lines = text.split("\n")
    if kind == "line":
        i = mutant["_line"] - 1
        return "\n".join(lines[:i] + [mutant["after"]] + lines[i + 1:])
    if kind == "block":
        a, b = mutant["_from"] - 1, mutant["_to"]
        return "\n".join(lines[:a] + [mutant["after"]] + lines[b:])
    raise ValueError("kind desconhecido: %s" % kind)


def public(mutant):
    return {k: v for k, v in mutant.items() if not k.startswith("_")}


def main(argv=None):
    ap = argparse.ArgumentParser(add_help=True, description=__doc__.split("\n")[0])
    ap.add_argument("action", choices=["list", "apply", "count"])
    ap.add_argument("source")
    ap.add_argument("mutant_id", nargs="?")
    ap.add_argument("--language", default="python")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    try:
        with open(args.source, "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        sys.stderr.write("study-method: erro 1: nao consegui ler %s: %s\n" % (args.source, exc))
        return 1

    mutants = generate(text, args.language)

    if args.action == "list":
        if args.json:
            json.dump({"operators_version": OPERATORS_VERSION,
                       "language": args.language,
                       "generated": len(mutants),
                       "mutants": [public(m) for m in mutants]},
                      sys.stdout, ensure_ascii=False)
            sys.stdout.write("\n")
        else:
            for m in mutants:
                sys.stdout.write("%-12s %s -> %s\n" % (
                    m["mutant_id"], m["before"].strip(), m["after"].strip()))
        return 0

    if args.action == "count":
        dist = {op: 0 for op in OPERATOR_ORDER}
        for m in mutants:
            dist[m["operator"]] += 1
        if args.json:
            json.dump({"operators_version": OPERATORS_VERSION,
                       "generated": len(mutants), "by_operator": dist},
                      sys.stdout, ensure_ascii=False)
            sys.stdout.write("\n")
        else:
            sys.stdout.write("Total %d · %s\n" % (
                len(mutants), " · ".join("%s %d" % (o, dist[o]) for o in OPERATOR_ORDER)))
        return 0

    # apply
    if not args.mutant_id:
        sys.stderr.write("study-method: erro 2: `apply` exige <mutant_id>\n")
        return 2
    for m in mutants:
        if m["mutant_id"] == args.mutant_id:
            sys.stdout.write(render(text, m))
            return 0
    sys.stderr.write("study-method: erro 2: mutant_id desconhecido: %s\n" % args.mutant_id)
    return 2


if __name__ == "__main__":
    sys.exit(main())
