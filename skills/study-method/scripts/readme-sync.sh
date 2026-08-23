#!/usr/bin/env bash
# readme-sync.sh — o README.md do setup como no de grafo de conhecimento.
#
# Regenera APENAS o interior dos marcadores
#   <!-- study-method:begin <secao> --> ... <!-- study-method:end <secao> -->
# As 8 secoes de docs/00-contratos.md §3.5 / docs/07-multi-setup.md §4.1.
# A prosa que o aluno escreveu FORA dos marcadores e preservada intacta (D-A20).
#
# Contratos: docs/00-contratos.md §3.5, §5 (exit codes), §7 (lib/), §8 (CLI), §11 (I-30, I-41).
set -euo pipefail

SM_RS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/common.sh
. "$SM_RS_DIR/lib/common.sh"
# shellcheck source=lib/json.sh
. "$SM_RS_DIR/lib/json.sh"

sm_rs_usage() {
  cat <<'SM_USAGE_EOF'
uso: readme-sync.sh [<setup_root>] [--init]

  Reescreve o interior dos 8 marcadores do README.md do setup, na ordem:
    identidade · taxonomia · base-teorica · destilados · desafios
    · linha-do-tempo · pontes · estado-atual

  Tudo que estiver FORA dos marcadores e do aluno e nunca e tocado.
  Teto de 200 linhas na parte gerada; acima disso encolhe primeiro
  'linha-do-tempo', depois 'destilados' e 'desafios' (docs/07 §4.3).

  A secao 'pontes' e UNILATERAL: registra apenas as pontes que ESTE setup
  criou (cross_setup_refs do INDEX.json daqui). Escrita cruzada entre setups
  e proibida: nenhum byte e escrito fora de <setup_root>.

  <setup_root>   raiz do setup; omitido, e descoberto a partir do diretorio
                 corrente subindo ate $HOME.
  --init         cria o README.md inicial com as 8 secoes vazias. Se o arquivo
                 ja existir, NAO sobrescreve.
  --help, -h     esta ajuda.

  stdout: o numero de linhas geradas.
  exit:   0 ok (inclusive com avisos) · 1 erro de execucao · 2 uso incorreto
          · 3 setup nao encontrado
SM_USAGE_EOF
}

sm_rs_init=0
sm_rs_root_arg=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) sm_rs_usage; exit 0 ;;
    --init) sm_rs_init=1; shift ;;
    --) shift; break ;;
    -*) sm_rs_usage >&2; sm_die 2 "flag desconhecida: $1" ;;
    *)
      [ -z "$sm_rs_root_arg" ] || { sm_rs_usage >&2; sm_die 2 "argumento posicional em excesso: $1"; }
      sm_rs_root_arg="$1"; shift ;;
  esac
done
if [ "$#" -gt 0 ]; then
  [ -z "$sm_rs_root_arg" ] || { sm_rs_usage >&2; sm_die 2 "argumento posicional em excesso: $1"; }
  sm_rs_root_arg="$1"
fi

sm_require_cmd jq python3 || sm_die 1 "dependencia ausente"

if ! sm_rs_root="$(sm_setup_root "$sm_rs_root_arg")"; then
  sm_die 3 "setup nao encontrado a partir de '${sm_rs_root_arg:-$PWD}'"
fi
[ -n "$sm_rs_root" ] || sm_die 3 "setup nao encontrado a partir de '${sm_rs_root_arg:-$PWD}'"

sm_rs_readme="$sm_rs_root/README.md"
sm_rs_tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/sm-readme.XXXXXX")" || sm_die 1 "nao consegui criar diretorio temporario"
trap 'rm -rf -- "$sm_rs_tmpdir"' EXIT
sm_rs_out="$sm_rs_tmpdir/README.md"

if [ "$sm_rs_init" = "1" ] && [ -f "$sm_rs_readme" ]; then
  sm_log warn "README.md ja existe em $sm_rs_readme; --init nao sobrescreve"
fi

SM_RS_ENGINE=$(cat <<'SM_ENGINE_EOF'
# -*- coding: utf-8 -*-
"""Renderizador do README.md do setup: so o interior dos marcadores."""
import glob
import json
import os
import re
import sys

CTL = json.loads(sys.argv[1])
ROOT = CTL["root"]
README = CTL["readme"]
OUT = CTL["out"]
INIT = bool(CTL["init"])
LIMIT = 200

SECTIONS = ["identidade", "taxonomia", "base-teorica", "destilados",
            "desafios", "linha-do-tempo", "pontes", "estado-atual"]
TITLES = {
    "identidade": "Identidade",
    "taxonomia": "Taxonomia e proficiencia",
    "base-teorica": "Base teorica",
    "destilados": "Destilados",
    "desafios": "Desafios",
    "linha-do-tempo": "Linha do tempo",
    "pontes": "Pontes para outros setups",
    "estado-atual": "Estado atual",
}
BEGIN = "<!-- study-method:begin %s -->"
END = "<!-- study-method:end %s -->"
MARK_RE = re.compile(r"^<!--\s*study-method:(begin|end)\s+([a-z0-9-]+)\s*-->\s*$")

WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)
    sys.stderr.write("readme-sync: aviso: %s\n" % msg)


def load_json(path, default=None):
    p = os.path.join(ROOT, path)
    if not os.path.isfile(p):
        return default
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, IOError) as exc:
        warn("nao consegui ler %s: %s" % (path, exc))
        return default
    except ValueError as exc:
        warn("%s nao parseia como JSON (%s); a secao correspondente sai vazia"
             % (path, exc))
        return default


SETUP = load_json("setup.json", {}) or {}
PROGRESS = load_json("memory/progress.json", {}) or {}
INDEX = load_json("memory/INDEX.json", {}) or {}
DOCSIDX = load_json("memory/docs-index.json", {}) or {}
PROFILE = load_json("memory/profile.json", {}) or {}


def concepts_active():
    out = []
    for c in (PROGRESS.get("concepts") or []):
        if isinstance(c, dict) and c.get("status") != "superseded":
            out.append(c)
    return out


def concept_by_id(cid):
    for c in concepts_active():
        if c.get("concept_id") == cid:
            return c
    return None


def esc(v):
    if v is None:
        return "-"
    s = str(v).replace("|", "\\|").replace("\n", " ").strip()
    return s or "-"


# ---------------------------------------------------------------------------
# as 8 secoes
# ---------------------------------------------------------------------------
def sec_identidade(level):
    lang = SETUP.get("language") or {}
    created = str(SETUP.get("created_at") or "")[:10] or "-"
    rows = [
        ("setup_id", SETUP.get("setup_id")),
        ("setup_name", SETUP.get("setup_name")),
        ("title", SETUP.get("title")),
        ("subject", SETUP.get("subject")),
        ("linguagem", lang.get("name")),
        ("criado em", created),
        ("sessoes abertas", SETUP.get("session_count")),
    ]
    out = ["| campo | valor |", "|---|---|"]
    for k, v in rows:
        out.append("| %s | %s |" % (k, esc(v)))
    return out


def sec_taxonomia(level):
    tax = [t for t in (SETUP.get("taxonomy") or []) if isinstance(t, str)]
    if not tax:
        return ["_Taxonomia ainda nao declarada em `setup.json`._"]
    out = []
    seen = []
    for topic in tax:
        parent = ""
        for prev in seen:
            if topic.startswith(prev + "_") and len(prev) > len(parent):
                parent = prev
        depth = 0
        if parent:
            depth = seen_depth.get(parent, 0) + 1
        seen_depth[topic] = depth
        seen.append(topic)
        c = concept_by_id(topic)
        if c is None:
            state = "sem registro"
        else:
            state = "`%s`" % c.get("proficiency_state", "unknown")
            label = c.get("label")
            if label and label != topic:
                state = "%s — %s" % (state, label)
        out.append("%s- `%s` · %s" % ("  " * depth, topic, state))
    extra = [c for c in concepts_active() if c.get("concept_id") not in tax]
    if extra:
        out.append("")
        out.append("Conceitos fora da taxonomia declarada (pre-requisitos descobertos):")
        for c in sorted(extra, key=lambda x: x.get("concept_id") or ""):
            out.append("- `%s` · `%s`" % (c.get("concept_id"),
                                          c.get("proficiency_state", "unknown")))
    return out


seen_depth = {}


def sec_base_teorica(level):
    files = DOCSIDX.get("files") or []
    if not files:
        return ["_Nenhum documento do `docs/` deste setup foi indexado ainda._"]
    out = ["| arquivo | topicos que sustenta | resumo |", "|---|---|---|"]
    for f in files:
        if not isinstance(f, dict):
            continue
        secs = [s.get("heading") for s in (f.get("sections") or [])
                if isinstance(s, dict) and s.get("heading")]
        resumo = secs[0] if secs else (f.get("kind") or "-")
        topicos = ", ".join(secs[:4]) if secs else "-"
        out.append("| `%s` | %s | %s |" % (esc(f.get("path")), esc(topicos), esc(resumo)))
    return out


def read_meta_block(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            head = fh.read(4096)
    except (OSError, IOError):
        return None
    i = head.find("study-method:meta")
    if i < 0:
        return None
    j = head.find("-->", i)
    if j < 0:
        return None
    blob = head[i + len("study-method:meta"):j].strip()
    try:
        return json.loads(blob)
    except ValueError:
        warn("bloco de proveniencia de %s nao parseia como JSON"
             % os.path.relpath(path, ROOT))
        return None


def sec_destilados(level):
    paths = sorted(glob.glob(os.path.join(ROOT, "researchs", "[0-9][0-9][0-9][0-9].md")))
    if not paths:
        return ["_Nenhum destilado em `researchs/` ainda._"]
    if level >= 5:
        return ["%d destilados em `researchs/`." % len(paths)]
    shown = paths[-10:] if level >= 4 else paths
    out = []
    if level >= 4 and len(paths) > len(shown):
        out.append("%d destilados em `researchs/`; os %d mais recentes:"
                   % (len(paths), len(shown)))
    out.append("| arquivo | topico | status |")
    out.append("|---|---|---|")
    for p in shown:
        meta = read_meta_block(p) or {}
        rel = "researchs/" + os.path.basename(p)
        out.append("| `%s` | %s | %s |" % (rel, esc(meta.get("topic")),
                                           esc(meta.get("status"))))
    return out


def sec_desafios(level):
    dirs = sorted(d for d in glob.glob(os.path.join(ROOT, "challenges", "*"))
                  if os.path.isdir(d))
    metas = []
    for d in dirs:
        m = os.path.join(d, "meta.json")
        if not os.path.isfile(m):
            continue
        try:
            with open(m, "r", encoding="utf-8") as fh:
                metas.append((os.path.basename(d), json.load(fh)))
        except (OSError, IOError, ValueError):
            warn("challenges/%s/meta.json ilegivel; desafio omitido da secao"
                 % os.path.basename(d))
    if not metas:
        return ["_Nenhum desafio em `challenges/` ainda._"]
    if level >= 5:
        return ["%d desafios em `challenges/`." % len(metas)]
    shown = metas[-10:] if level >= 4 else metas
    out = []
    if level >= 4 and len(metas) > len(shown):
        out.append("%d desafios em `challenges/`; os %d mais recentes:"
                   % (len(metas), len(shown)))
    out.append("| desafio | conceito | status |")
    out.append("|---|---|---|")
    for name, m in shown:
        cons = ", ".join(str(c.get("concept_id")) for c in (m.get("target_concepts") or [])
                         if isinstance(c, dict) and c.get("concept_id")) or "-"
        out.append("| `challenges/%s/` | %s | `%s` |"
                   % (esc(name), esc(cons), esc(m.get("challenge_status"))))
    return out


TIMELINE_N = {0: 10, 1: 5, 2: 3, 3: 0}


def sec_linha_do_tempo(level):
    sessions = [s for s in (INDEX.get("sessions") or []) if isinstance(s, dict)]
    if not sessions:
        return ["_Nenhuma sessao registrada em `memory/INDEX.json` ainda._"]
    dates = sorted(s.get("date") for s in sessions if s.get("date"))
    periodo = "%s a %s" % (dates[0], dates[-1]) if dates else "-"
    out = ["%d sessoes registradas · periodo: %s" % (len(sessions), periodo)]
    n = TIMELINE_N.get(min(level, 3), 0)
    if n <= 0:
        return out
    ordered = sorted(sessions, key=lambda s: (s.get("date") or "",
                                              s.get("session_id") or ""))
    tail = ordered[-n:]
    if tail:
        out.append("")
        for s in tail:
            out.append("- `%s` (%s) — %s" % (esc(s.get("session_id")),
                                             esc(s.get("date")),
                                             esc(s.get("one_line_summary"))))
    return out


def sec_pontes(level):
    """UNILATERAL: so as pontes que ESTE setup criou. Nenhum byte e escrito
    em outro setup — docs/07 §4.1 e §5.2."""
    refs = {}
    for s in (INDEX.get("sessions") or []):
        if not isinstance(s, dict):
            continue
        for r in (s.get("cross_setup_refs") or []):
            if not isinstance(r, dict) or not r.get("setup_id"):
                continue
            key = r["setup_id"]
            slot = refs.setdefault(key, {"setup_name": r.get("setup_name"),
                                         "reasons": [], "sessions": []})
            if r.get("reason") and r["reason"] not in slot["reasons"]:
                slot["reasons"].append(r["reason"])
            if s.get("session_id"):
                slot["sessions"].append(s["session_id"])
    if not refs:
        return ["_Nenhuma ponte para outro setup ainda._",
                "",
                "A ponte e unilateral: ela existe apenas aqui, no setup que leu."]
    out = ["| setup_id | setup_name | por que a ponte existe | sessoes |",
           "|---|---|---|---|"]
    for sid in sorted(refs):
        slot = refs[sid]
        out.append("| `%s` | %s | %s | %s |"
                   % (esc(sid), esc(slot["setup_name"]),
                      esc("; ".join(slot["reasons"])),
                      esc(", ".join(sorted(set(slot["sessions"]))))))
    out.append("")
    out.append("Pontes sao unilaterais: registradas so neste setup, nunca no de destino.")
    return out


def sec_estado_atual(level):
    cs = concepts_active()
    if not cs:
        return ["_Sem conceitos registrados em `memory/progress.json` ainda._"]
    by = {"mastered": [], "fragile": [], "unknown": []}
    for c in cs:
        by.setdefault(c.get("proficiency_state", "unknown"), []).append(c)
    total = len(cs)

    def names(lst, n=6):
        lst = sorted(lst, key=lambda x: x.get("concept_id") or "")
        got = [str(x.get("concept_id")) for x in lst[:n]]
        extra = len(lst) - len(got)
        s = ", ".join("`%s`" % g for g in got)
        if extra > 0:
            s += " (+%d)" % extra
        return s or "-"

    out = []
    out.append("- Solido: %d de %d conceitos em `mastered` — %s"
               % (len(by["mastered"]), total, names(by["mastered"])))
    out.append("- Em consolidacao: %d em `fragile` — %s"
               % (len(by["fragile"]), names(by["fragile"])))
    out.append("- Sem evidencia: %d em `unknown` — %s"
               % (len(by["unknown"]), names(by["unknown"])))
    nxt = sorted(c.get("next_review_at") for c in cs if c.get("next_review_at"))
    if nxt:
        out.append("- Proxima revisao agendada: %s" % nxt[0])
    pend = [p for p in (PROFILE.get("pending_followups") or [])
            if isinstance(p, dict) and p.get("state") == "open"]
    if pend:
        out.append("- Pendente: %d fio(s) em aberto — %s"
                   % (len(pend), esc(pend[0].get("text"))))
    out.append("")
    out.append("`unknown` quer dizer que nao ha registro de desafio, nao que o aluno nao sabe.")
    return out


BUILDERS = {
    "identidade": sec_identidade,
    "taxonomia": sec_taxonomia,
    "base-teorica": sec_base_teorica,
    "destilados": sec_destilados,
    "desafios": sec_desafios,
    "linha-do-tempo": sec_linha_do_tempo,
    "pontes": sec_pontes,
    "estado-atual": sec_estado_atual,
}


def build(level):
    global seen_depth
    seen_depth = {}
    return dict((name, BUILDERS[name](level)) for name in SECTIONS)


def generated_lines(blocks):
    # a "parte gerada" = interior + as duas linhas de marcador de cada secao
    return sum(len(v) + 2 for v in blocks.values())


def build_within_budget():
    for level in range(0, 6):
        blocks = build(level)
        n = generated_lines(blocks)
        if n <= LIMIT:
            if level > 0:
                warn("teto de %d linhas geradas: encolhi ate o nivel %d "
                     "(linha-do-tempo primeiro, depois destilados e desafios)"
                     % (LIMIT, level))
            return blocks, n
    warn("teto de %d linhas geradas estourado mesmo no nivel maximo de encolhimento"
         % LIMIT)
    return blocks, generated_lines(blocks)


# ---------------------------------------------------------------------------
# marcadores
# ---------------------------------------------------------------------------
def scan_markers(lines):
    """-> (spans, problems). spans[name] = (i_begin, i_end)."""
    found = {}
    problems = {}
    stack = []
    for i, line in enumerate(lines):
        m = MARK_RE.match(line.rstrip("\n"))
        if not m:
            continue
        what, name = m.group(1), m.group(2)
        if what == "begin":
            while stack:
                # um 'begin' novo antes do 'end' do anterior: o anterior e que
                # esta quebrado. Marca SO ele e segue — degradar tem de custar
                # a secao defeituosa, nao as sete que estao intactas.
                prev, _ = stack.pop()
                problems.setdefault(prev, "marcador 'begin' sem 'end' correspondente")
            stack.append((name, i))
        else:
            if not stack or stack[-1][0] != name:
                problems.setdefault(name, "marcador 'end' sem 'begin' correspondente")
                continue
            _, start = stack.pop()
            if name in found:
                problems[name] = "marcador duplicado"
            else:
                found[name] = (start, i)
    for name, _ in stack:
        problems.setdefault(name, "marcador 'begin' sem 'end' correspondente")
    for name in list(found):
        if name in problems:
            del found[name]
    return found, problems


def render_block(name, body):
    return [BEGIN % name] + list(body) + [END % name]


def skeleton(blocks):
    title = SETUP.get("title") or SETUP.get("setup_name") or "Setup do study-method"
    out = ["# %s" % title, ""]
    out.append("> No de grafo de conhecimento do study-method. As secoes entre os")
    out.append("> marcadores `<!-- study-method:begin ... -->` sao regeneradas por")
    out.append("> `readme-sync.sh`. Tudo que estiver fora deles e seu e nunca e reescrito.")
    out.append("")
    for name in SECTIONS:
        out.append("## %s" % TITLES[name])
        out.append("")
        out.extend(render_block(name, blocks[name]))
        out.append("")
    while out and out[-1] == "":
        out.pop()
    return out


def main():
    blocks, count = build_within_budget()

    exists = os.path.isfile(README)
    if not exists:
        lines = skeleton(blocks)
        with open(OUT, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
        sys.stdout.write(json.dumps({"generated_lines": count, "created": True,
                                     "sections_written": SECTIONS,
                                     "warnings": WARNINGS}) + "\n")
        return 0
    if INIT:
        sys.stdout.write(json.dumps({"generated_lines": 0, "created": False,
                                     "skipped": "readme_ja_existe",
                                     "warnings": WARNINGS}) + "\n")
        return 0

    try:
        with open(README, "r", encoding="utf-8") as fh:
            original = fh.read()
    except (OSError, IOError) as exc:
        sys.stderr.write("readme-sync: nao consegui ler o README.md: %s\n" % exc)
        return 1
    lines = original.split("\n")
    trailing_nl = original.endswith("\n")
    if trailing_nl:
        lines = lines[:-1]

    spans, problems = scan_markers(lines)
    for name, why in sorted(problems.items()):
        warn("secao '%s': %s — a secao NAO foi tocada" % (name, why))

    written = []
    # substitui de baixo para cima para nao invalidar os indices
    for name in sorted(spans, key=lambda n: spans[n][0], reverse=True):
        if name not in SECTIONS:
            warn("marcador desconhecido '%s' no README.md; preservado como esta" % name)
            continue
        i, j = spans[name]
        lines[i + 1:j] = list(blocks[name])
        written.append(name)

    missing = [n for n in SECTIONS if n not in spans and n not in problems]
    if missing:
        warn("secoes sem marcador no README.md: %s — acrescentadas ao final, "
             "sem tocar no que ja estava escrito" % ", ".join(missing))
        if lines and lines[-1].strip() != "":
            lines.append("")
        for name in missing:
            lines.append("## %s" % TITLES[name])
            lines.append("")
            lines.extend(render_block(name, blocks[name]))
            lines.append("")
            written.append(name)
        while lines and lines[-1] == "":
            lines.pop()

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    skipped = [n for n in SECTIONS if n not in written]
    sys.stdout.write(json.dumps({"generated_lines": count, "created": False,
                                 "sections_written": sorted(written),
                                 "sections_skipped": skipped,
                                 "warnings": WARNINGS}) + "\n")
    return 0


sys.exit(main())
SM_ENGINE_EOF
)

sm_rs_ctl="$(jq -n \
  --arg root "$sm_rs_root" \
  --arg readme "$sm_rs_readme" \
  --arg out "$sm_rs_out" \
  --argjson init "$sm_rs_init" \
  '{root:$root, readme:$readme, out:$out, init:($init==1)}')"

set +e
sm_rs_report="$(python3 -c "$SM_RS_ENGINE" "$sm_rs_ctl")"
sm_rs_rc=$?
set -e
[ "$sm_rs_rc" -eq 0 ] || sm_die 1 "falha ao renderizar o README.md do setup"
sm_log debug "$sm_rs_report"

if [ -f "$sm_rs_out" ]; then
  if [ -f "$sm_rs_readme" ] && cmp -s "$sm_rs_out" "$sm_rs_readme"; then
    : # nada mudou; nao reescreve (mantem mtime e prova a idempotencia)
  else
    sm_atomic_write "$sm_rs_readme" < "$sm_rs_out" \
      || sm_die 1 "nao consegui gravar $sm_rs_readme"
  fi
fi

printf '%s\n' "$sm_rs_report" | jq -r '.generated_lines'
exit 0
