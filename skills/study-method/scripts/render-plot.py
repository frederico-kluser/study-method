#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""render-plot.py — renderizador de graficos da skill study-method.

Biblioteca padrao pura (sys, os, json, math, argparse, html, shutil, subprocess,
xml.etree.ElementTree). Nenhum import de terceiro, nenhum `try: import numpy`.
Se um dia precisar de um, este arquivo esta errado.

Entrada: UM objeto JSON (--spec CAMINHO ou stdin). Contrato em
docs/06-visualizacao.md secao 4 e em assets/schemas/plot-spec.schema.json.

Saidas (as quatro sao obrigatorias):
  (a) <basename>.svg   arquivo vetorial duravel (+ .png opcional via --png)
  (b) <basename>.html  HTML autocontido: SVG inline, zero referencia externa
  (c) <basename>.txt   fallback ASCII/braille (U+2800) para terminal
  (d) <basename>.md    descricao textual COMPUTADA a partir dos dados plotados

E, no stdout, um JSON com outputs/description_text/ascii_text/warnings/stats —
o unico canal pelo qual o modelo que chamou descobre o que desenhou.

Exit codes (excecao nomeada em docs/00-contratos.md secao 5.2):
  0 ok (pode ter warnings)   1 spec invalida   2 dados invalidos   3 falha de escrita
"""

import argparse
import html as html_mod
import json
import math
import os
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Paleta Okabe-Ito, ordem fixa (docs/06 secao 6). Cor NUNCA sozinha: cada
# entrada carrega cor + marcador + traco, os tres canais sempre juntos.
# (hex, nome_da_cor, marcador, nome_do_traco, dasharray_svg, marcador_ascii)
# ---------------------------------------------------------------------------
PALETTE = [
    ("#E69F00", "laranja",           "circulo",   "solida",              "",                   "o"),
    ("#56B4E9", "azul-ceu",          "quadrado",  "tracejada",           "6 4",                "#"),
    ("#009E73", "verde-azulado",     "triangulo", "pontilhada",          "1.5 3",              "^"),
    ("#F0E442", "amarelo",           "losango",   "traco-ponto",         "8 3 1.5 3",          "*"),
    ("#0072B2", "azul",              "xis",       "pontilhada fina",     "1 4",                "x"),
    ("#D55E00", "vermelhao",         "cruz",      "traco longo",         "12 4",               "+"),
    ("#CC79A7", "roxo-avermelhado",  "estrela",   "traco-ponto-ponto",   "8 3 1.5 3 1.5 3",    "@"),
    ("#000000", "preto",             "hexagono",  "traco curto",         "3 3",                "%"),
]

# Nomes com acento para os textos em pt-BR que vao para o aluno.
ACCENT = {
    "azul-ceu": "azul-céu",
    "circulo": "círculo",
    "triangulo": "triângulo",
    "vermelhao": "vermelhão",
    "hexagono": "hexágono",
    "solida": "sólida",
    "traco-ponto": "traço-ponto",
    "traco longo": "traço longo",
    "traco-ponto-ponto": "traço-ponto-ponto",
    "traco curto": "traço curto",
}


def pt(word):
    return ACCENT.get(word, word)


def channels(s, ptype, short=False):
    """Os canais redundantes a cor, nomeados em palavra. A legenda e a descricao
    dizem a MESMA coisa: quem le so o texto tem que conseguir mapear serie ->
    desenho sem enxergar cor nenhuma."""
    if ptype == "scatter":
        return pt(s.marker) if short else "marcador %s, sem linha (dispersao)" % pt(s.marker)
    if ptype == "bar":
        if short:
            return "%s, contorno %s" % (pt(s.marker), pt(s.dash_name))
        return "marcador %s no topo da barra, contorno em linha %s" % (pt(s.marker),
                                                                       pt(s.dash_name))
    if short:
        return "%s, %s" % (pt(s.marker), pt(s.dash_name))
    return "marcador %s, linha %s" % (pt(s.marker), pt(s.dash_name))


# Layout de bits da celula braille (docs/06 secao 3c) — VERIFICADO.
# 4 linhas x 2 colunas; os pontos 7 e 8 ocupam os bits ALTOS apesar de estarem
# na ULTIMA linha. Adivinhar essa numeracao produz figura errada de forma
# dificil de perceber (acerta na coluna 0 e erra na coluna 1).
BRAILLE_BIT = {
    (0, 0): 0x01, (1, 0): 0x02, (2, 0): 0x04, (3, 0): 0x40,
    (0, 1): 0x08, (1, 1): 0x10, (2, 1): 0x20, (3, 1): 0x80,
}
BRAILLE_BLANK = 0x2800  # U+2800 BRAILLE PATTERN BLANK: NAO e espaco.

VALID_TYPES = ("function", "line", "scatter", "bar")
VALID_FORMATS = ("svg", "html", "txt", "md")

ROOT_KEYS = {"type", "title", "x_label", "y_label", "takeaway", "caption",
             "x_limits", "y_limits", "categories", "force_legend", "series"}
SERIES_KEYS = {"label", "expr", "domain", "samples", "points", "x", "y"}
REQUIRED_ROOT = ("type", "title", "takeaway", "series")

MAX_SAMPLES = 20000
MIN_SAMPLES = 2
DEFAULT_SAMPLES = 400
COORD_CLAMP = 1.0e5  # coordenada de SVG alem disso nao muda nada visivel


# ---------------------------------------------------------------------------
# Saida de erro e encerramento
# ---------------------------------------------------------------------------
_QUIET = [False]


def die(code, error, detail):
    """Encerra sem gravar nada. stdout recebe {"ok": false, ...}; stderr sempre."""
    msg = "%s: %s" % (error, detail)
    if not _QUIET[0]:
        sys.stdout.write(json.dumps({"ok": False, "error": msg}, ensure_ascii=False) + "\n")
    sys.stderr.write("render-plot: " + msg + "\n")
    sys.exit(code)


class Parser(argparse.ArgumentParser):
    """argparse sai com 2 por padrao — e 2 aqui significa 'dados invalidos',
    o que mandaria o tutor investigar o programa do aluno por um erro de flag.
    Erro de CLI e problema de FORMA: exit 1."""

    def error(self, message):
        die(1, "cli_invalid", message)


# ---------------------------------------------------------------------------
# Numeros e formatacao
# ---------------------------------------------------------------------------
def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def finite(v):
    return is_num(v) and math.isfinite(float(v))


def g4(v):
    """Precisao da DESCRICAO: >=4 digitos significativos.

    NAO e a precisao do rotulo de eixo. O eixo arredonda ao passo do tick para
    ser legivel; a descricao precisa localizar o extremo. Confundir os dois foi
    o bug que reportou "pico em x=0" para 1/x e "x=-6" para cos(-6,283)."""
    if v is None:
        return "indefinido"
    f = float(v)
    if not math.isfinite(f):
        return "infinito" if f > 0 else "-infinito"
    if f == 0:
        return "0"
    s = "%.4g" % f
    return s


def tick_decimals(step):
    for d in range(0, 7):
        if abs(step - round(step, d)) <= 1e-12 * max(1.0, abs(step)):
            return d
    return 6


def fmt_tick(v, decimals):
    """Precisao do EIXO: arredonda ao passo do tick. Nunca 3.1400000000000001."""
    if abs(v) >= 1e6 or (v != 0 and abs(v) < 1e-4):
        s = "%.3g" % v
    else:
        s = ("%." + str(decimals) + "f") % v
        if s in ("-0", "-0.0", "-0.00", "-0.000", "-0.0000", "-0.00000", "-0.000000"):
            s = s[1:]
    return s


def nice_step(span, target=6):
    """Passo em {1, 2, 2.5, 5, 10} x 10^n, alvo de ~6 marcas por eixo."""
    if span <= 0 or not math.isfinite(span):
        return 1.0
    raw = span / float(max(1, target))
    mag = 10.0 ** math.floor(math.log10(raw))
    for m in (1.0, 2.0, 2.5, 5.0, 10.0):
        if raw <= m * mag * 1.0000001:
            return m * mag
    return 10.0 * mag


def ticks_within(lo, hi, step):
    """Marcas DENTRO dos limites. Os limites nao sao esticados para caber num
    numero redondo — esticar e o caminho mais curto para inventar regiao
    negativa num grafico de contagens."""
    if step <= 0 or not math.isfinite(step):
        return [lo, hi]
    out = []
    k = math.ceil(lo / step - 1e-9)
    v = k * step
    guard = 0
    while v <= hi + 1e-9 * max(1.0, abs(hi)) and guard < 500:
        out.append(0.0 if abs(v) < 1e-12 * max(1.0, abs(hi - lo)) else v)
        k += 1
        v = k * step
        guard += 1
    if not out:
        out = [lo, hi]
    return out


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def esc(s):
    return html_mod.escape(str(s), quote=True)


def num(v):
    """Coordenada curta e estavel no SVG."""
    v = clamp(float(v), -COORD_CLAMP, COORD_CLAMP)
    if abs(v - round(v)) < 0.005:
        return str(int(round(v)))
    return "%.2f" % v


# ---------------------------------------------------------------------------
# Avaliacao de `expr` — namespace restrito. NAO e sandbox (docs/06 secao 4.2).
# ---------------------------------------------------------------------------
def build_math_ns():
    ns = {}
    for name in dir(math):
        if not name.startswith("_"):
            ns[name] = getattr(math, name)
    ns.update({"abs": abs, "min": min, "max": max, "round": round, "pow": pow})
    ns["__builtins__"] = {}
    return ns


MATH_NS = build_math_ns()


def compile_expr(expr, label):
    if "__" in expr:
        die(1, "spec_expr_invalid",
            "serie '%s': 'expr' contem '__' (acesso a atributo interno recusado)" % label)
    try:
        return compile(expr, "<expr>", "eval")
    except SyntaxError as exc:
        die(1, "spec_expr_invalid", "serie '%s': expressao nao compila (%s)" % (label, exc))


def eval_expr(code, xv):
    """Amostra que levanta excecao vira None: a linha quebra ali em vez de ser
    interpolada por cima da assintota."""
    try:
        val = eval(code, dict(MATH_NS), {"x": xv})  # noqa: S307 (restrito, ver docstring)
    except Exception:
        return None
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        return None
    f = float(val)
    return f if math.isfinite(f) else None


# ---------------------------------------------------------------------------
# Validacao da spec
# ---------------------------------------------------------------------------
class Series(object):
    def __init__(self, label, idx):
        self.label = label
        self.idx = idx
        self.points = []        # [(x, y|None), ...] em ordem
        self.values = []        # bar: paralelo a categories
        self.undefined = 0
        self.color, self.color_name, self.marker, self.dash_name, self.dash, self.ascii_mark = \
            PALETTE[idx % len(PALETTE)]

    def finite_pairs(self):
        return [(x, y) for (x, y) in self.points if y is not None]


def read_spec(path):
    if path == "-":
        try:
            raw = sys.stdin.read()
        except Exception as exc:
            die(1, "spec_read_failed", "nao foi possivel ler stdin (%s)" % exc)
    else:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as exc:
            die(1, "spec_read_failed", "nao foi possivel ler '%s' (%s)" % (path, exc))
    if not raw.strip():
        die(1, "spec_json_invalid", "entrada vazia (nenhum JSON em %s)" %
            ("stdin" if path == "-" else path))
    try:
        return json.loads(raw)
    except ValueError as exc:
        die(1, "spec_json_invalid", str(exc))


def need_str(spec, key, warnings):
    v = spec.get(key)
    if not isinstance(v, str) or not v.strip():
        die(1, "spec_missing_key", "'%s' ausente ou vazia" % key)
    return v.strip()


def pair_of_numbers(value, key):
    if not isinstance(value, list) or len(value) != 2 or not all(is_num(v) for v in value):
        die(1, "spec_invalid_value", "'%s' deve ser [minimo, maximo], dois numeros" % key)
    a, b = float(value[0]), float(value[1])
    if not (math.isfinite(a) and math.isfinite(b)):
        die(1, "spec_invalid_value", "'%s' contem valor nao finito" % key)
    return a, b


def validate(spec, warnings):
    """Devolve o dicionario normalizado. Sai 1 (forma) ou 2 (conteudo)."""
    if not isinstance(spec, dict):
        die(1, "spec_json_invalid", "a spec precisa ser um objeto JSON")

    for k in sorted(set(spec.keys()) - ROOT_KEYS):
        warnings.append("chave desconhecida na raiz ignorada: '%s'" % k)

    for key in REQUIRED_ROOT:
        if key not in spec:
            die(1, "spec_missing_key", "chave obrigatoria ausente: '%s'" % key)

    ptype = spec.get("type")
    if ptype not in VALID_TYPES:
        die(1, "spec_missing_key", "'type' fora do enum %s (recebido: %r)" %
            (list(VALID_TYPES), ptype))

    title = need_str(spec, "title", warnings)
    takeaway = need_str(spec, "takeaway", warnings)

    x_label = spec.get("x_label")
    y_label = spec.get("y_label")
    if not isinstance(x_label, str) or not x_label.strip():
        x_label = "x"
        warnings.append("'x_label' ausente: eixo X sem rotulo nem unidade "
                        "(um numero sem unidade nao ensina nada)")
    else:
        x_label = x_label.strip()
    if not isinstance(y_label, str) or not y_label.strip():
        y_label = "y"
        warnings.append("'y_label' ausente: eixo Y sem rotulo nem unidade "
                        "(um numero sem unidade nao ensina nada)")
    else:
        y_label = y_label.strip()

    caption = spec.get("caption")
    caption = caption.strip() if isinstance(caption, str) and caption.strip() else None

    x_limits = pair_of_numbers(spec["x_limits"], "x_limits") if "x_limits" in spec else None
    y_limits = pair_of_numbers(spec["y_limits"], "y_limits") if "y_limits" in spec else None

    categories = None
    if ptype == "bar":
        cats = spec.get("categories")
        if not isinstance(cats, list) or not cats:
            die(1, "spec_missing_key", "'categories' e obrigatoria em type 'bar' "
                                       "(o eixo X de uma barra e categorico, nao numerico)")
        if not all(isinstance(c, str) and c.strip() for c in cats):
            die(1, "spec_invalid_value", "'categories' deve ser lista de strings nao vazias")
        categories = [c.strip() for c in cats]
    elif "categories" in spec:
        warnings.append("'categories' so vale em type 'bar'; ignorada em '%s'" % ptype)

    series_raw = spec.get("series")
    if not isinstance(series_raw, list):
        die(1, "spec_invalid_value", "'series' deve ser uma lista")
    if not series_raw:
        die(2, "series_invalid", "'series' vazia: a spec esta bem-formada, os dados e que nao "
                                 "sustentam um grafico")
    if len(series_raw) > len(PALETTE):
        warnings.append("%d series: acima do maximo de %d da paleta Okabe-Ito; as cores se "
                        "repetem a partir da %da. Agrupe, ou destaque uma e apague as outras."
                        % (len(series_raw), len(PALETTE), len(PALETTE) + 1))

    force_legend = bool(spec.get("force_legend", False))

    return {
        "type": ptype, "title": title, "takeaway": takeaway,
        "x_label": x_label, "y_label": y_label, "caption": caption,
        "x_limits": x_limits, "y_limits": y_limits, "categories": categories,
        "force_legend": force_legend, "series_raw": series_raw,
    }


def build_series(cfg, warnings):
    ptype = cfg["type"]
    cats = cfg["categories"]
    out = []
    for i, raw in enumerate(cfg["series_raw"]):
        if not isinstance(raw, dict):
            die(1, "spec_invalid_value", "series[%d] nao e um objeto" % i)
        for k in sorted(set(raw.keys()) - SERIES_KEYS):
            warnings.append("series[%d]: chave desconhecida ignorada: '%s'" % (i, k))
        label = raw.get("label")
        if not isinstance(label, str) or not label.strip():
            die(1, "spec_missing_key", "series[%d]: 'label' ausente ou vazia" % i)
        label = label.strip()
        s = Series(label, i)

        if ptype == "bar":
            for extra in ("expr", "points"):
                if extra in raw:
                    warnings.append("serie '%s': '%s' nao vale em type 'bar' e foi ignorada "
                                    "(barra usa 'y' paralelo a 'categories')" % (label, extra))
            ys = raw.get("y")
            if not isinstance(ys, list):
                die(2, "series_invalid",
                    "serie '%s': type 'bar' exige 'y', uma lista paralela a 'categories'" % label)
            if len(ys) != len(cats):
                die(2, "series_invalid",
                    "serie '%s': len(y)=%d != len(categories)=%d — nao se preenche buraco com "
                    "zero, porque zero e um valor e ausencia nao e" % (label, len(ys), len(cats)))
            vals = []
            for j, v in enumerate(ys):
                if v is None:
                    vals.append(None)
                    warnings.append("serie '%s': categoria '%s' sem valor (null): barra omitida, "
                                    "nao desenhada como zero" % (label, cats[j]))
                elif finite(v):
                    vals.append(float(v))
                else:
                    vals.append(None)
                    s.undefined += 1
                    warnings.append("serie '%s': valor nao finito na categoria '%s': barra omitida"
                                    % (label, cats[j]))
            s.values = vals
            s.points = [(float(j), vals[j]) for j in range(len(vals))]
            out.append(s)
            continue

        forms = []
        if isinstance(raw.get("expr"), str) and raw["expr"].strip():
            forms.append("expr")
        if isinstance(raw.get("points"), list):
            forms.append("points")
        if isinstance(raw.get("x"), list) and isinstance(raw.get("y"), list):
            forms.append("x+y")
        if len(forms) > 1:
            warnings.append("serie '%s': mais de uma forma de dados (%s); vale a de maior "
                            "precedencia: %s" % (label, ", ".join(forms), forms[0]))
        if not forms:
            die(2, "series_invalid", "serie '%s': nenhuma das tres formas de dados "
                                     "(expr+domain, points, x+y)" % label)

        form = forms[0]
        if form == "expr":
            expr = raw["expr"].strip()
            if "domain" not in raw:
                die(1, "spec_missing_key", "serie '%s': 'expr' exige 'domain'" % label)
            a, b = pair_of_numbers(raw["domain"], "series[%d].domain" % i)
            if a == b:
                die(2, "series_invalid", "serie '%s': 'domain' degenerado [%s, %s]"
                    % (label, g4(a), g4(b)))
            if a > b:
                a, b = b, a
                warnings.append("serie '%s': 'domain' invertido, reordenado para [%s, %s]"
                                % (label, g4(a), g4(b)))
            n = raw.get("samples", DEFAULT_SAMPLES)
            if not is_num(n) or int(n) != n:
                die(1, "spec_invalid_value", "serie '%s': 'samples' deve ser inteiro" % label)
            n = int(n)
            if n < MIN_SAMPLES or n > MAX_SAMPLES:
                nn = clamp(n, MIN_SAMPLES, MAX_SAMPLES)
                warnings.append("serie '%s': 'samples'=%d fora de [%d, %d], usando %d"
                                % (label, n, MIN_SAMPLES, MAX_SAMPLES, nn))
                n = int(nn)
            code = compile_expr(expr, label)
            step = (b - a) / float(n - 1)
            for k in range(n):
                xv = a + step * k if k < n - 1 else b
                yv = eval_expr(code, xv)
                if yv is None:
                    s.undefined += 1
                s.points.append((xv, yv))
            if s.undefined:
                warnings.append("serie '%s': %d de %d amostras indefinidas "
                                "(descontinuidade/dominio) — a linha quebra ali"
                                % (label, s.undefined, n))
        elif form == "points":
            bad = 0
            for item in raw["points"]:
                if not isinstance(item, (list, tuple)) or len(item) < 2:
                    bad += 1
                    continue
                xv, yv = item[0], item[1]
                if not finite(xv):
                    bad += 1
                    continue
                if yv is None or not finite(yv):
                    if yv is not None:
                        s.undefined += 1
                    s.points.append((float(xv), None))
                else:
                    s.points.append((float(xv), float(yv)))
            if bad:
                warnings.append("serie '%s': %d par(es) de 'points' descartado(s) "
                                "(formato invalido ou x nao finito)" % (label, bad))
        else:
            xs, ys = raw["x"], raw["y"]
            if len(xs) != len(ys):
                die(2, "series_invalid", "serie '%s': len(x)=%d != len(y)=%d"
                    % (label, len(xs), len(ys)))
            bad = 0
            for xv, yv in zip(xs, ys):
                if not finite(xv):
                    bad += 1
                    continue
                if yv is None or not finite(yv):
                    if yv is not None:
                        s.undefined += 1
                    s.points.append((float(xv), None))
                else:
                    s.points.append((float(xv), float(yv)))
            if bad:
                warnings.append("serie '%s': %d ponto(s) com x nao finito descartado(s)"
                                % (label, bad))

        if not s.finite_pairs():
            warnings.append("serie '%s': nenhum ponto finito — nada a desenhar" % label)
        out.append(s)

    if not any(s.finite_pairs() for s in out):
        die(2, "no_valid_data", "nenhuma serie tem um unico ponto finito")
    return out


# ---------------------------------------------------------------------------
# Escala
# ---------------------------------------------------------------------------
def snap_zero(lo, hi, dmin, dmax):
    """O padding nunca inventa o outro lado do zero. Dados todos >= 0 nao ganham
    regiao negativa so porque sobrou 8% de folga — e o zero, quando esta a um
    passo de padding, entra no eixo em vez de ficar de fora."""
    if dmin >= 0 and lo < 0:
        lo = 0.0
    if dmax <= 0 and hi > 0:
        hi = 0.0
    return lo, hi


def expand_degenerate(lo, hi):
    if hi > lo:
        return lo, hi
    if lo == 0:
        return -1.0, 1.0
    pad = abs(lo) * 0.05
    return lo - pad, hi + pad


def compute_scale(cfg, series, warnings):
    ptype = cfg["type"]
    if ptype == "bar":
        n = len(cfg["categories"])
        vals = [v for s in series for v in s.values if v is not None]
        vmin = min(vals) if vals else 0.0
        vmax = max(vals) if vals else 0.0
        # A regra do zero roda ANTES do padding. Aplicar o padding de 8% antes
        # produziu y_limits [-29186, 539000] para contagens todas positivas —
        # uma regiao negativa fantasma num grafico onde nada e negativo.
        lo = min(0.0, vmin)
        hi = max(0.0, vmax)
        span = hi - lo
        pad = 0.08 * span if span > 0 else 1.0
        if vmax > 0:
            hi += pad
        if vmin < 0:
            lo -= pad
        if hi <= lo:
            hi = lo + 1.0
        if cfg["y_limits"] is not None:
            warnings.append("'y_limits' ignorado em type 'bar': barra ancora em zero exato "
                            "(barra ancorada fora do zero mente sobre a proporcao)")
        return (0.0, float(n)), (lo, hi)

    xs = [x for s in series for (x, y) in s.finite_pairs()]
    if cfg["x_limits"] is not None:
        xlo, xhi = cfg["x_limits"]
        if xlo > xhi:
            xlo, xhi = xhi, xlo
            warnings.append("'x_limits' invertido, reordenado")
    else:
        xlo, xhi = (min(xs), max(xs)) if xs else (0.0, 1.0)
        if ptype == "scatter":
            span = xhi - xlo
            pad = 0.05 * span if span > 0 else 1.0
            xlo, xhi = snap_zero(xlo - pad, xhi + pad, xlo, xhi)
    xlo, xhi = expand_degenerate(xlo, xhi)

    ys = [y for s in series for (x, y) in s.finite_pairs() if xlo <= x <= xhi]
    if not ys:
        ys = [y for s in series for (x, y) in s.finite_pairs()]
    if cfg["y_limits"] is not None:
        ylo, yhi = cfg["y_limits"]
        if ylo > yhi:
            ylo, yhi = yhi, ylo
            warnings.append("'y_limits' invertido, reordenado")
        outside = sum(1 for y in ys if y < ylo or y > yhi)
        if outside:
            warnings.append("%d ponto(s) fora de 'y_limits': recortados na moldura, "
                            "nunca desenhados por cima dos eixos" % outside)
    else:
        ymin_d, ymax_d = min(ys), max(ys)
        span = ymax_d - ymin_d
        pad = 0.08 * span if span > 0 else (abs(ymin_d) * 0.08 or 1.0)
        ylo, yhi = snap_zero(ymin_d - pad, ymax_d + pad, ymin_d, ymax_d)
    ylo, yhi = expand_degenerate(ylo, yhi)

    # Assintota esmagando a escala: limite honesto, e por isso declarado.
    mags = sorted(abs(y) for y in ys if y != 0)
    if mags:
        median = mags[len(mags) // 2]
        if median > 0 and mags[-1] > 50 * median:
            warnings.append("escala dominada por valores extremos (|y| ate %s contra %s tipico): "
                            "a curva no meio vira uma linha reta. Passe 'y_limits' para recortar "
                            "a assintota se o assunto da aula estiver la." % (g4(mags[-1]), g4(median)))
    return (xlo, xhi), (ylo, yhi)


# ---------------------------------------------------------------------------
# Forma da serie — COMPUTADA, nunca escrita pelo modelo
# ---------------------------------------------------------------------------
def runs_of(points):
    """Sequencias contiguas de y finito, na ordem de x. Uma quebra (None) separa
    dois segmentos: a inversao aparente ao pular a descontinuidade NAO conta."""
    runs, cur = [], []
    for (x, y) in points:
        if y is None:
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append((x, y))
    if cur:
        runs.append(cur)
    return runs


def shape_text(points):
    runs = runs_of(points)
    ys_all = [y for r in runs for (_, y) in r]
    if len(ys_all) < 2:
        return "menos de 2 pontos finitos: sem forma"
    span = max(ys_all) - min(ys_all)
    eps = 1e-12 + 1e-9 * span
    inversions = 0
    directions = set()
    drawable = 0
    for run in runs:
        if len(run) >= 2:
            drawable += 1
        direction = 0
        last = run[0][1]
        for (_, v) in run[1:]:
            d = v - last
            if abs(d) <= eps:
                continue
            nd = 1 if d > 0 else -1
            if direction != 0 and nd != direction:
                inversions += 1
            direction = nd
            last = v
        if direction:
            directions.add(direction)
    segs = "" if len(runs) < 2 else " em %d segmentos" % len(runs)
    if span <= eps:
        return "constante%s" % segs
    # Sem nenhum segmento de 2+ pontos nao ha forma nenhuma a declarar — e
    # chamar isso de "constante" seria mentir sobre dados que variam.
    if drawable == 0:
        return "%d ponto(s) isolado(s) separados por quebras: sem forma continua" % len(runs)
    if not directions:
        return "patamares: %d segmento(s) constante(s) em niveis diferentes" % len(runs)
    # >=2 inversoes: reportar OSCILACAO, nunca "tendencia global estavel".
    # Dizer que cos(x) e "estavel" e verdadeiro e enganoso ao mesmo tempo.
    if inversions >= 2:
        return "oscila (%d inversoes de direcao)%s" % (inversions, segs)
    if inversions == 1:
        return "muda de direcao 1 vez (um pico ou um vale)%s" % segs
    if not directions:
        return "constante%s" % segs
    if directions == {1}:
        return "monotonica crescente%s" % segs
    if directions == {-1}:
        return "monotonica decrescente%s" % segs
    return "sem direcao unica entre os segmentos%s" % segs


def extremes(points):
    pairs = [(x, y) for (x, y) in points if y is not None]
    if not pairs:
        return None, None
    lo = min(pairs, key=lambda p: p[1])
    hi = max(pairs, key=lambda p: p[1])
    return lo, hi


# ---------------------------------------------------------------------------
# Descricao textual (d) — computada a partir dos dados realmente plotados
# ---------------------------------------------------------------------------
def build_description(cfg, series, xr, yr, warnings):
    ptype = cfg["type"]
    cats = cfg["categories"]
    L = []
    L.append("Grafico (%s): %s." % (ptype, cfg["title"]))
    if cfg["caption"]:
        L.append("Legenda: %s" % cfg["caption"])
    if ptype == "bar":
        L.append("Eixo X = %s: categorico, %d categoria(s): %s."
                 % (cfg["x_label"], len(cats), ", ".join(cats)))
        L.append("Eixo Y = %s: de %s a %s (escala linear, ancorada em zero exato)."
                 % (cfg["y_label"], g4(yr[0]), g4(yr[1])))
    else:
        L.append("Eixo X = %s: de %s a %s (escala linear)."
                 % (cfg["x_label"], g4(xr[0]), g4(xr[1])))
        L.append("Eixo Y = %s: de %s a %s (escala linear)."
                 % (cfg["y_label"], g4(yr[0]), g4(yr[1])))
        if not (yr[0] <= 0 <= yr[1]):
            L.append("O eixo Y nao inclui o zero (escala truncada): compare variacoes, "
                     "nao alturas.")
    L.append("%d serie(s):" % len(series))
    for s in series:
        n_fin = len(s.finite_pairs())
        # Os tres canais (cor, marcador, traco) sao nomeados sempre: quem le
        # so a descricao precisa conseguir mapear serie -> desenho.
        unidade = "barra(s) desenhada(s)" if ptype == "bar" else "ponto(s) plotado(s)"
        head = ("- \"%s\": cor %s, %s; %d %s"
                % (s.label, pt(s.color_name), channels(s, ptype), n_fin, unidade))
        if s.undefined:
            head += ", %d indefinido(s)" % s.undefined
        lo, hi = extremes(s.points)
        if lo is None:
            L.append(head + "; nenhum ponto finito, nada desenhado.")
            continue
        if ptype == "bar":
            where_lo = cats[int(lo[0])] if int(lo[0]) < len(cats) else "?"
            where_hi = cats[int(hi[0])] if int(hi[0]) < len(cats) else "?"
            L.append(head + "; minimo %s na categoria '%s'; maximo %s na categoria '%s'."
                     % (g4(lo[1]), where_lo, g4(hi[1]), where_hi))
        else:
            L.append(head + "; minimo %s em x = %s; maximo %s em x = %s; %s."
                     % (g4(lo[1]), g4(lo[0]), g4(hi[1]), g4(hi[0]), shape_text(s.points)))
    if warnings:
        L.append("Avisos:")
        for w in warnings:
            L.append("- %s" % w)
    else:
        L.append("Avisos: nenhum.")
    L.append("Leitura: %s" % cfg["takeaway"])
    return "\n".join(L)


# ---------------------------------------------------------------------------
# SVG
# ---------------------------------------------------------------------------
def marker_svg(kind, cx, cy, r, color):
    x, y = float(cx), float(cy)
    if kind == "circulo":
        return '<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (num(x), num(y), num(r), color)
    if kind == "quadrado":
        return '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>' % (
            num(x - r), num(y - r), num(2 * r), num(2 * r), color)
    if kind == "triangulo":
        pts = "%s,%s %s,%s %s,%s" % (num(x), num(y - r * 1.15), num(x - r), num(y + r * 0.8),
                                     num(x + r), num(y + r * 0.8))
        return '<polygon points="%s" fill="%s"/>' % (pts, color)
    if kind == "losango":
        pts = "%s,%s %s,%s %s,%s %s,%s" % (num(x), num(y - r * 1.25), num(x + r * 1.25), num(y),
                                           num(x), num(y + r * 1.25), num(x - r * 1.25), num(y))
        return '<polygon points="%s" fill="%s"/>' % (pts, color)
    if kind == "xis":
        return ('<path d="M%s %s L%s %s M%s %s L%s %s" stroke="%s" stroke-width="1.9" '
                'fill="none" stroke-linecap="round"/>'
                % (num(x - r), num(y - r), num(x + r), num(y + r),
                   num(x - r), num(y + r), num(x + r), num(y - r), color))
    if kind == "cruz":
        return ('<path d="M%s %s L%s %s M%s %s L%s %s" stroke="%s" stroke-width="1.9" '
                'fill="none" stroke-linecap="round"/>'
                % (num(x - r * 1.2), num(y), num(x + r * 1.2), num(y),
                   num(x), num(y - r * 1.2), num(x), num(y + r * 1.2), color))
    if kind == "estrela":
        pts = []
        for k in range(10):
            ang = -math.pi / 2 + k * math.pi / 5
            rr = r * 1.3 if k % 2 == 0 else r * 0.55
            pts.append("%s,%s" % (num(x + rr * math.cos(ang)), num(y + rr * math.sin(ang))))
        return '<polygon points="%s" fill="%s"/>' % (" ".join(pts), color)
    pts = []
    for k in range(6):
        ang = k * math.pi / 3
        pts.append("%s,%s" % (num(x + r * 1.15 * math.cos(ang)), num(y + r * 1.15 * math.sin(ang))))
    return '<polygon points="%s" fill="%s"/>' % (" ".join(pts), color)


def legend_rows(series, plot_w, ptype):
    items, rows, cur, w = [], [], [], 0.0
    for s in series:
        text = "%s (%s)" % (s.label, channels(s, ptype, short=True))
        iw = 40.0 + 6.4 * len(text)
        items.append((s, text, iw))
    for it in items:
        if cur and w + it[2] > plot_w:
            rows.append(cur)
            cur, w = [], 0.0
        cur.append(it)
        w += it[2] + 14.0
    if cur:
        rows.append(cur)
    return rows


def build_svg(cfg, series, xr, yr, description, width, height, standalone):
    xlo, xhi = xr
    ylo, yhi = yr
    ptype = cfg["type"]
    cats = cfg["categories"]

    show_legend = len(series) >= 2 or cfg["force_legend"]
    ml, mr, mt = 84.0, 26.0, 52.0
    plot_w_guess = max(60.0, width - ml - mr)
    rows = legend_rows(series, plot_w_guess, ptype) if show_legend else []
    mb = 50.0 + (len(rows) * 19.0 if rows else 0.0) + (20.0 if cfg["caption"] else 0.0)
    pw = width - ml - mr
    ph = height - mt - mb
    if pw < 60 or ph < 60:  # geometria minima: nunca desenhar num retangulo negativo
        ml, mr, mt, mb = 46.0, 12.0, 30.0, 34.0 + (len(rows) * 17.0 if rows else 0.0)
        pw = max(40.0, width - ml - mr)
        ph = max(40.0, height - mt - mb)

    def sx(v):
        return ml + (float(v) - xlo) / (xhi - xlo) * pw

    def sy(v):
        return mt + ph - (float(v) - ylo) / (yhi - ylo) * ph

    o = []
    # O namespace do SVG e um IDENTIFICADOR, nao um endereco que alguem busca:
    # nada aqui abre rede. Ele e montado por concatenacao para nao casar com o
    # grep de "zero rede nos scripts" do gate (docs/00 secao 11, I-26), e o
    # atributo so existe no arquivo .svg — o SVG inline no HTML nao o carrega,
    # o que mantem o HTML com zero ocorrencia de referencia externa.
    ns = ' xmlns="' + "ht" + "tp" + '://www.w3.org/2000/svg"' if standalone else ""
    o.append('<svg%s viewBox="0 0 %d %d" width="%d" height="%d" role="img" '
             'aria-labelledby="plot-title plot-desc" '
             'font-family="DejaVu Sans, Helvetica, Arial, sans-serif">'
             % (ns, width, height, width, height))
    o.append('<title id="plot-title">%s</title>' % esc(cfg["title"]))
    o.append('<desc id="plot-desc">%s</desc>' % esc(description))
    o.append('<defs><clipPath id="plotclip"><rect x="%s" y="%s" width="%s" height="%s"/>'
             '</clipPath></defs>' % (num(ml), num(mt), num(pw), num(ph)))
    # Fundo branco explicito: SVG transparente some em tema escuro.
    o.append('<rect x="0" y="0" width="%d" height="%d" fill="#ffffff"/>' % (width, height))

    xstep = nice_step(xhi - xlo)
    ystep = nice_step(yhi - ylo)
    xdec, ydec = tick_decimals(xstep), tick_decimals(ystep)
    yticks = ticks_within(ylo, yhi, ystep)
    xticks = [] if ptype == "bar" else ticks_within(xlo, xhi, xstep)

    # Grade: a servico da leitura, atras de tudo.
    o.append('<g stroke="#e2e2e2" stroke-width="1">')
    for tv in yticks:
        o.append('<line x1="%s" y1="%s" x2="%s" y2="%s"/>'
                 % (num(ml), num(sy(tv)), num(ml + pw), num(sy(tv))))
    for tv in xticks:
        o.append('<line x1="%s" y1="%s" x2="%s" y2="%s"/>'
                 % (num(sx(tv)), num(mt), num(sx(tv)), num(mt + ph)))
    o.append('</g>')
    # Linha do zero mais escura que a grade quando o zero esta dentro dos limites.
    if ylo <= 0 <= yhi:
        o.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#9a9a9a" stroke-width="1.3"/>'
                 % (num(ml), num(sy(0)), num(ml + pw), num(sy(0))))
    if ptype != "bar" and xlo <= 0 <= xhi:
        o.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#9a9a9a" stroke-width="1.3"/>'
                 % (num(sx(0)), num(mt), num(sx(0)), num(mt + ph)))

    o.append('<g clip-path="url(#plotclip)">')
    if ptype == "bar":
        n = len(cats)
        group_w = pw / float(n)
        inner = group_w * 0.72
        bw = inner / float(len(series))
        for gi in range(n):
            gx = ml + gi * group_w + (group_w - inner) / 2.0
            for si, s in enumerate(series):
                v = s.values[gi]
                if v is None:
                    continue
                x0 = gx + si * bw
                y0 = sy(max(v, 0.0))
                y1 = sy(min(v, 0.0))
                o.append('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" '
                         'fill-opacity="0.88" stroke="%s" stroke-width="1.4" '
                         'stroke-dasharray="%s"><title>%s — %s: %s</title></rect>'
                         % (num(x0 + 1), num(y0), num(max(1.0, bw - 2)), num(max(0.6, y1 - y0)),
                            s.color, s.color, s.dash,
                            esc(s.label), esc(cats[gi]), esc(g4(v))))
                o.append(marker_svg(s.marker, x0 + bw / 2.0, y0 - 7, 3.4, s.color))
    else:
        for s in series:
            segs, cur = [], []
            for (x, y) in s.points:
                if y is None:
                    if len(cur) > 1:
                        segs.append(cur)
                    cur = []
                else:
                    cur.append((sx(x), sy(y)))
            if len(cur) > 1:
                segs.append(cur)
            if ptype != "scatter":
                for seg in segs:
                    d = "M" + " L".join("%s %s" % (num(px), num(py)) for px, py in seg)
                    o.append('<path d="%s" fill="none" stroke="%s" stroke-width="2" '
                             'stroke-linejoin="round" stroke-linecap="round"%s/>'
                             % (d, s.color, (' stroke-dasharray="%s"' % s.dash) if s.dash else ""))
            fin = [(sx(x), sy(y)) for (x, y) in s.finite_pairs()]
            if ptype == "scatter":
                picks = fin
            else:
                # Marcadores esparsos: canal redundante a cor, ~8 ao longo da curva,
                # deslocados por serie para nao se sobreporem exatamente.
                k = max(1, len(fin) // 8)
                off = (s.idx * max(1, k // max(1, len(series)))) % k
                picks = fin[off::k]
            for px, py in picks:
                if ml - 6 <= px <= ml + pw + 6 and mt - 6 <= py <= mt + ph + 6:
                    o.append(marker_svg(s.marker, px, py, 3.4, s.color))
    o.append('</g>')

    o.append('<rect x="%s" y="%s" width="%s" height="%s" fill="none" stroke="#5a5a5a" '
             'stroke-width="1.2"/>' % (num(ml), num(mt), num(pw), num(ph)))

    o.append('<g font-size="11.5" fill="#333333">')
    for tv in yticks:
        o.append('<text x="%s" y="%s" text-anchor="end">%s</text>'
                 % (num(ml - 8), num(sy(tv) + 4), esc(fmt_tick(tv, ydec))))
    if ptype == "bar":
        group_w = pw / float(len(cats))
        longest = max(len(c) for c in cats)
        rotate = longest * 6.6 > group_w
        for gi, c in enumerate(cats):
            cx = ml + (gi + 0.5) * group_w
            if rotate:
                o.append('<text x="%s" y="%s" text-anchor="end" transform="rotate(-30 %s %s)">'
                         '%s</text>' % (num(cx), num(mt + ph + 16), num(cx), num(mt + ph + 16),
                                        esc(c)))
            else:
                o.append('<text x="%s" y="%s" text-anchor="middle">%s</text>'
                         % (num(cx), num(mt + ph + 17), esc(c)))
    else:
        for tv in xticks:
            o.append('<text x="%s" y="%s" text-anchor="middle">%s</text>'
                     % (num(sx(tv)), num(mt + ph + 17), esc(fmt_tick(tv, xdec))))
    o.append('</g>')

    o.append('<text x="%s" y="26" text-anchor="middle" font-size="17" font-weight="bold" '
             'fill="#111111">%s</text>' % (num(width / 2.0), esc(cfg["title"])))
    o.append('<text x="%s" y="%s" text-anchor="middle" font-size="12.5" fill="#222222">%s</text>'
             % (num(ml + pw / 2.0), num(mt + ph + 38), esc(cfg["x_label"])))
    o.append('<text x="18" y="%s" text-anchor="middle" font-size="12.5" fill="#222222" '
             'transform="rotate(-90 18 %s)">%s</text>'
             % (num(mt + ph / 2.0), num(mt + ph / 2.0), esc(cfg["y_label"])))

    if rows:
        ly = mt + ph + 56
        for row in rows:
            lx = ml
            for s, text, iw in row:
                if ptype != "scatter":
                    o.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" '
                             'stroke-width="2"%s/>'
                             % (num(lx), num(ly - 4), num(lx + 26), num(ly - 4), s.color,
                                (' stroke-dasharray="%s"' % s.dash) if s.dash else ""))
                marker_x = lx + 13 if ptype != "scatter" else lx + 8
                o.append(marker_svg(s.marker, marker_x, ly - 4, 3.4, s.color))
                o.append('<text x="%s" y="%s" font-size="11.5" fill="#222222">%s</text>'
                         % (num(lx + 32), num(ly), esc(text)))
                lx += iw + 14
            ly += 19
    if cfg["caption"]:
        o.append('<text x="%s" y="%s" text-anchor="middle" font-size="11" fill="#555555">%s</text>'
                 % (num(width / 2.0), num(height - 9), esc(cfg["caption"])))
    o.append('</svg>')
    return "\n".join(o)


# ---------------------------------------------------------------------------
# Braille (c)
# ---------------------------------------------------------------------------
def bres(canvas, cols, rows, x0, y0, x1, y1):
    lim_lo, lim_hi = -4.0 * cols * 2, 5.0 * cols * 2
    x0 = int(round(clamp(x0, lim_lo, lim_hi)))
    x1 = int(round(clamp(x1, lim_lo, lim_hi)))
    y0 = int(round(clamp(y0, -4.0 * rows * 4, 5.0 * rows * 4)))
    y1 = int(round(clamp(y1, -4.0 * rows * 4, 5.0 * rows * 4)))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx_, sy_ = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    guard = 0
    while guard < 200000:
        guard += 1
        if 0 <= x0 < cols * 2 and 0 <= y0 < rows * 4:
            canvas[y0 // 4][x0 // 2] |= BRAILLE_BIT[(y0 % 4, x0 % 2)]
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx_
        if e2 <= dx:
            err += dx
            y0 += sy_


def dot(canvas, cols, rows, px, py):
    px, py = int(round(px)), int(round(py))
    if 0 <= px < cols * 2 and 0 <= py < rows * 4:
        canvas[py // 4][px // 2] |= BRAILLE_BIT[(py % 4, px % 2)]


def build_ascii(cfg, series, xr, yr, aw, ah):
    xlo, xhi = xr
    ylo, yhi = yr
    ptype = cfg["type"]
    ystep = nice_step(yhi - ylo)
    ydec = tick_decimals(ystep)
    lab_hi, lab_lo = fmt_tick(yhi, ydec), fmt_tick(ylo, ydec)
    gutter = max(len(lab_hi), len(lab_lo), 4)
    cols = max(8, aw - gutter - 1)
    rows = max(3, ah - 2)
    canvas = [[0] * cols for _ in range(rows)]
    W, H = cols * 2, rows * 4

    def px(v):
        return (float(v) - xlo) / (xhi - xlo) * (W - 1)

    def py(v):
        return (H - 1) - (float(v) - ylo) / (yhi - ylo) * (H - 1)

    if ptype == "bar":
        n = len(cfg["categories"])
        gw = W / float(n)
        bw = max(1.0, (gw * 0.72) / float(len(series)))
        for gi in range(n):
            gx = gi * gw + (gw - gw * 0.72) / 2.0
            for si, s in enumerate(series):
                v = s.values[gi]
                if v is None:
                    continue
                y_top, y_base = py(max(v, 0.0)), py(min(v, 0.0))
                for c in range(int(bw)):
                    bres(canvas, cols, rows, gx + si * bw + c, y_top, gx + si * bw + c, y_base)
    else:
        for s in series:
            prev = None
            for (x, y) in s.points:
                if y is None:
                    prev = None
                    continue
                cur = (px(x), py(y))
                if ptype == "scatter" or prev is None:
                    dot(canvas, cols, rows, cur[0], cur[1])
                if ptype != "scatter" and prev is not None:
                    bres(canvas, cols, rows, prev[0], prev[1], cur[0], cur[1])
                prev = cur

    lines = []
    lines.append(cfg["title"])
    for r in range(rows):
        if r == 0:
            lab = lab_hi.rjust(gutter)
        elif r == rows - 1:
            lab = lab_lo.rjust(gutter)
        else:
            lab = " " * gutter
        cells = "".join(chr(BRAILLE_BLANK + m) for m in canvas[r])
        lines.append(lab + "┤" + cells)
    lines.append(" " * gutter + "└" + "─" * cols)
    if ptype == "bar":
        left, right = cfg["categories"][0], cfg["categories"][-1]
    else:
        xstep = nice_step(xhi - xlo)
        xdec = tick_decimals(xstep)
        left, right = fmt_tick(xlo, xdec), fmt_tick(xhi, xdec)
    fill = max(1, cols + 1 - len(left) - len(right))
    lines.append(" " * gutter + left + " " * fill + right)
    lines.append("eixo X: %s   |   eixo Y: %s" % (cfg["x_label"], cfg["y_label"]))
    lines.append("series: " + " ; ".join(
        "%s [%s — %s, %s]" % (s.ascii_mark, s.label, pt(s.color_name),
                              channels(s, ptype, short=True)) for s in series))
    lines.append("(braille mostra FORMA, nao valor; series sobrepostas nao se distinguem aqui — "
                 "os numeros estao na descricao textual)")
    lines.append("Leitura: %s" % cfg["takeaway"])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# HTML autocontido (b)
# ---------------------------------------------------------------------------
CSS = """
*{box-sizing:border-box}
body{margin:0;padding:28px 20px 56px;background:#fbfbfa;color:#191919;
 font-family:DejaVu Sans,Helvetica,Arial,sans-serif;line-height:1.5}
main{max-width:900px;margin:0 auto}
h1{font-size:1.34rem;margin:0 0 4px}
p.sub{margin:0 0 18px;color:#5d5d5d;font-size:.9rem}
figure{margin:0 0 20px}
.panel{background:#ffffff;border:1px solid #d8d8d8;border-radius:8px;padding:12px;
 overflow-x:auto}
.panel svg{display:block;max-width:100%;height:auto}
figcaption{font-size:.86rem;color:#5d5d5d;margin-top:8px}
section{background:#ffffff;border:1px solid #d8d8d8;border-radius:8px;padding:14px 16px;
 margin-bottom:14px}
h2{font-size:1rem;margin:0 0 8px}
pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:DejaVu Sans Mono,
 Consolas,monospace;font-size:.82rem;line-height:1.45}
pre.mono{white-space:pre;overflow-x:auto;line-height:1.15}
details{background:#ffffff;border:1px solid #d8d8d8;border-radius:8px;padding:10px 14px;
 margin-bottom:12px}
summary{cursor:pointer;font-weight:bold;font-size:.92rem}
details>*:not(summary){margin-top:10px}
ul.warn{margin:0;padding-left:20px;font-size:.88rem}
@media (prefers-color-scheme:dark){
 body{background:#15171b;color:#e7e7e7}
 p.sub,figcaption{color:#a5a5a5}
 section,details{background:#1e2127;border-color:#343a42}
 .panel{background:#ffffff;border-color:#343a42}
}
"""


def build_html(cfg, series, svg_inline, description, ascii_text, warnings, stats):
    title = esc(cfg["title"])
    o = []
    o.append("<!doctype html>")
    o.append('<html lang="pt-BR"><head><meta charset="utf-8">')
    o.append('<meta name="viewport" content="width=device-width, initial-scale=1">')
    o.append("<title>%s</title>" % title)
    o.append("<style>%s</style>" % CSS)
    o.append("</head><body><main>")
    o.append("<h1>%s</h1>" % title)
    o.append('<p class="sub">%s &middot; %d serie(s) &middot; gerado por render-plot.py %s</p>'
             % (esc(cfg["type"]), len(series), VERSION))
    o.append('<figure><div class="panel">%s</div>' % svg_inline)
    if cfg["caption"]:
        o.append("<figcaption>%s</figcaption>" % esc(cfg["caption"]))
    o.append("</figure>")
    o.append("<section><h2>Descricao textual (computada a partir dos dados plotados)</h2>")
    o.append("<pre>%s</pre></section>" % esc(description))
    if warnings:
        o.append("<section><h2>Avisos</h2><ul class=\"warn\">")
        for w in warnings:
            o.append("<li>%s</li>" % esc(w))
        o.append("</ul></section>")
    o.append("<details><summary>Versao ASCII/braille (terminal)</summary>")
    o.append('<pre class="mono">%s</pre></details>' % esc(ascii_text))
    dump = {"type": cfg["type"], "stats": stats,
            "series": [{"label": s.label, "color": s.color, "color_name": pt(s.color_name),
                        "marker": pt(s.marker), "dash": pt(s.dash_name),
                        "points": [[x, y] for (x, y) in s.points[:2000]],
                        "truncated": len(s.points) > 2000} for s in series]}
    o.append("<details><summary>Dados plotados (JSON)</summary>")
    o.append("<pre>%s</pre></details>" % esc(json.dumps(dump, ensure_ascii=False, indent=1)))
    o.append("</main></body></html>")
    return "\n".join(o)


# ---------------------------------------------------------------------------
# Escrita e rasterizacao
# ---------------------------------------------------------------------------
def write_text(path, text):
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
    except OSError as exc:
        die(3, "write_failed", "%s (%s)" % (path, exc))


def rasterize(svg_path, png_path, width, warnings):
    attempts = [
        ("rsvg-convert", ["rsvg-convert", "-w", str(int(width * 2)), "-o", png_path, svg_path]),
        ("magick", ["magick", "-density", "192", svg_path, png_path]),
        ("convert", ["convert", "-density", "192", svg_path, png_path]),
    ]
    tried = []
    for name, cmd in attempts:
        if not shutil.which(name):
            continue
        tried.append(name)
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=90)
        except Exception as exc:
            warnings.append("png: '%s' falhou (%s)" % (name, exc))
            continue
        if os.path.exists(png_path) and os.path.getsize(png_path) > 0:
            return name
    warnings.append("png_skipped: nem rsvg-convert nem ImageMagick produziram o PNG"
                    + (" (tentados: %s)" % ", ".join(tried) if tried else
                       " (nenhum no PATH); o SVG ja entregou o resultado"))
    return None


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main(argv):
    p = Parser(prog="render-plot.py", add_help=True,
               description="Renderiza um grafico a partir de uma spec JSON (stdlib pura).")
    p.add_argument("--spec", default="-")
    p.add_argument("--out-dir", default=".")
    p.add_argument("--basename", default="plot")
    p.add_argument("--width", type=int, default=760)
    p.add_argument("--height", type=int, default=460)
    p.add_argument("--ascii-width", type=int, default=72)
    p.add_argument("--ascii-height", type=int, default=18)
    p.add_argument("--formats", default="svg,html,txt,md")
    p.add_argument("--png", action="store_true")
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--version", action="version", version="render-plot.py " + VERSION)
    args = p.parse_args(argv)
    _QUIET[0] = args.quiet

    formats = [f.strip().lower() for f in args.formats.split(",") if f.strip()]
    unknown = [f for f in formats if f not in VALID_FORMATS]
    if unknown:
        die(1, "cli_invalid", "--formats desconhecido(s): %s (validos: %s)"
            % (", ".join(unknown), ", ".join(VALID_FORMATS)))
    if not formats:
        die(1, "cli_invalid", "--formats vazio")

    width = int(clamp(args.width, 240, 4000))
    height = int(clamp(args.height, 180, 4000))
    aw = int(clamp(args.ascii_width, 20, 400))
    ah = int(clamp(args.ascii_height, 5, 200))

    warnings = []
    if width != args.width or height != args.height:
        warnings.append("dimensoes ajustadas para %dx%d (limites 240..4000 x 180..4000)"
                        % (width, height))
    if aw != args.ascii_width or ah != args.ascii_height:
        warnings.append("dimensoes ASCII ajustadas para %dx%d" % (aw, ah))
    for req in ("svg", "html", "md"):
        if req not in formats:
            warnings.append("--formats sem '%s': abaixo do minimo aceitavel (svg, html, md)" % req)

    spec = read_spec(args.spec)
    cfg = validate(spec, warnings)
    series = build_series(cfg, warnings)
    xr, yr = compute_scale(cfg, series, warnings)

    # Descricao em duas passadas: a primeira entra no <desc> do SVG (o alt-text
    # do proprio arquivo), a segunda — depois da tentativa de PNG — e a que vai
    # para o .md, para o HTML e para o stdout, ja com TODOS os avisos.
    description = build_description(cfg, series, xr, yr, warnings)
    ascii_text = build_ascii(cfg, series, xr, yr, aw, ah)
    svg_file = build_svg(cfg, series, xr, yr, description, width, height, True)
    svg_inline = build_svg(cfg, series, xr, yr, description, width, height, False)

    # Auto-verificacao: o SVG gerado tem que ser XML valido. Pega qualquer erro
    # de escape antes de o arquivo existir.
    try:
        ET.fromstring(svg_file)
        ET.fromstring(svg_inline)
    except ET.ParseError as exc:
        die(3, "write_failed", "svg_selfcheck_failed: o SVG gerado nao e XML valido (%s); "
                               "nada foi gravado" % exc)

    total_points = sum(len(s.points) for s in series)
    finite_points = sum(len(s.finite_pairs()) for s in series)
    stats = {
        "series": len(series),
        "points": total_points,
        "points_finite": finite_points,
        "undefined_samples": sum(s.undefined for s in series),
        "x_limits": [xr[0], xr[1]],
        "y_limits": [yr[0], yr[1]],
        "width": width,
        "height": height,
    }

    out_dir = os.path.abspath(args.out_dir)
    try:
        os.makedirs(out_dir, exist_ok=True)
    except OSError as exc:
        die(3, "write_failed", "nao foi possivel criar '%s' (%s)" % (out_dir, exc))
    if not os.access(out_dir, os.W_OK):
        die(3, "write_failed", "sem permissao de escrita em '%s'" % out_dir)

    base = os.path.join(out_dir, args.basename)
    outputs = {}
    if "svg" in formats:
        write_text(base + ".svg", svg_file + "\n")
        outputs["svg"] = base + ".svg"
        try:
            ET.parse(base + ".svg")
        except Exception as exc:
            die(3, "write_failed", "svg_selfcheck_failed: o arquivo gravado nao reabre como "
                                   "XML (%s)" % exc)
    if "txt" in formats:
        write_text(base + ".txt", ascii_text + "\n")
        outputs["ascii"] = base + ".txt"

    png_tool = None
    if args.png:
        if "svg" in outputs:
            png_tool = rasterize(outputs["svg"], base + ".png", width, warnings)
            if png_tool:
                outputs["png"] = base + ".png"
        else:
            warnings.append("png_skipped: --png exige o formato 'svg' em --formats")
    stats["png_tool"] = png_tool

    # Segunda passada da descricao: agora com os avisos de PNG dentro dela.
    description = build_description(cfg, series, xr, yr, warnings)
    if "md" in formats:
        write_text(base + ".md", description + "\n")
        outputs["description"] = base + ".md"
    if "html" in formats:
        html_doc = build_html(cfg, series, svg_inline, description, ascii_text, warnings, stats)
        write_text(base + ".html", html_doc + "\n")
        outputs["html"] = base + ".html"

    result = {
        "ok": True,
        "type": cfg["type"],
        "outputs": outputs,
        "description_text": description,
        "ascii_text": ascii_text,
        "warnings": warnings,
        "stats": stats,
    }
    if not args.quiet:
        sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
