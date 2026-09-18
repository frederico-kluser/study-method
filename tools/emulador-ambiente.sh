#!/usr/bin/env bash
# tools/emulador-ambiente.sh — emulador Docker de máquina limpa para o passo `preparar_ambiente`.
#
# Prova ponta a ponta o que a onda 2 entregou: dentro de CONTÊINERES SEM toolchain, o fluxo
# detectar → instalar → provar de `skills/study-method/scripts/_ensure-toolchain.sh` fecha com
# as provas das 3 linguagens (python, rust, c) + harness node/npm. O HOST não é tocado (o host
# CachyOS já está pronto e nada instala nele) — o repo entra no container SOMENTE LEITURA.
#
# Cenários (os dois rodam, em sequência; falha de um não impede o outro — o exit final reflete
# o conjunto, e o relatório separa por cenário):
#   1. ubuntu:24.04 — família apt. O próprio auxiliar roda `apt-get update` uma vez antes de
#      instalar (sm_apt_update_once) — o emulador NÃO duplica o update.
#   2. archlinux    — família pacman. O auxiliar deliberadamente NÃO roda `-Sy` (receita §3.4:
#      sincronizar a base é preparo do operador) — o emulador roda `pacman -Sy` antes do
#      `--ensure`, e, se o sync falhar por assinatura/base de dados velha, instala
#      `archlinux-keyring` e repete. É a ÚNICA preparação extra autorizada.
#
# O emulador NÃO reimplementa receita nenhuma: ele prepara o container, chama o auxiliar do
# repo (via bind-mount) e avalia o resultado (exit code + JSON: languages.<l>.proof.ok,
# ensure.installed/failed). NADA de npm ci/gates de engine dentro do container: a prova aqui é
# de AMBIENTE (fixtures do próprio auxiliar), não de produto.
#
# Rede: o emulador é a ferramenta que provisiona — downloads existem por desenho, mas SÓ via
# `docker pull` e gerenciadores de pacote dentro do container. Nenhum curl/wget no código
# (a regra de zero-rede I-26 vale para código de skill/gate, não para este tool).
#
# Uso:
#   tools/emulador-ambiente.sh [--json]
#     --json   além do relatório humano, imprime o agregado JSON no fim do stdout, após a
#              linha de marcação `--- emulador-ambiente: json ---`
#
# Exit: 0 só se TODOS os cenários fecharem com provas verdes · 1 algum cenário falhou OU o
# precheck reprovou o ambiente (daemon inacessível, docker/python3/timeout ausentes, auxiliar
# ilegível — nada é criado antes do precheck passar; o erro EXATO fica nos artefatos e no
# relatório — falha de receita real é gatilho de fix, nunca é escondida) · 2 uso incorreto
# (flag desconhecida).
#
# Timeouts: `docker pull` não tem teto (pode demorar); cada cenário de execução tem teto de
# 1800s. Idempotente: re-run reaproveita imagens já puxadas; containers são --rm.
#
# bash 3.2-safe por disciplina (tools/ está fora do escopo do gate-bash32, mas a regra vale).

set -euo pipefail

EMUL_SELF="emulador-ambiente.sh"
EMUL_SCHEMA_VERSION="1.0"
EMUL_TIMEOUT_SECS=1800
EMUL_REPO_ROOT=""
EMUL_ART=""
EMUL_WANT_JSON="0"
EMUL_CONTAINERS=""
EMUL_SCENARIO_N=0

em_err() { printf '%s: %s\n' "$EMUL_SELF" "$*" >&2; }
em_die() {
    local c="$1"
    shift
    printf '%s: erro %s: %s\n' "$EMUL_SELF" "$c" "$*" >&2
    exit "$c"
}

em_usage() {
    cat <<'EMUL_USAGE'
uso: tools/emulador-ambiente.sh [--json]

Prova ponta a ponta o passo `preparar_ambiente` em containers SEM toolchain:
para cada cenário (ubuntu:24.04 · archlinux) monta uma máquina limpa, roda o
--check inicial (espera ausência de tudo), prepara o gerenciador (na família
apt o próprio auxiliar roda apt-get update; na família pacman o emulador roda
pacman -Sy antes — com fallback de archlinux-keyring), chama
skills/study-method/scripts/_ensure-toolchain.sh --ensure --json e fecha com
--check --json provando as 3 linguagens + harness. O repo entra no container
somente leitura; nada é instalado no host; downloads só via docker pull e
gerenciadores de pacote dentro do container.

  --json   imprime também o agregado JSON no fim do stdout (após a linha de
           marcação `--- emulador-ambiente: json ---`)

exit: 0 só se TODOS os cenários fecharem com provas verdes; 1 se algum falhar
      (o erro exato vai para o relatório e para os artefatos) OU se o precheck
      reprovar o ambiente (nada é criado); 2 uso incorreto.
EMUL_USAGE
}

# ---------------------------------------------------------------------------
# Precheck — nada é criado antes de passar (daemon inacessível sai SEM criar nada).
# ---------------------------------------------------------------------------
em_precheck() {
    if ! command -v docker >/dev/null 2>&1; then
        em_err "docker não está no PATH — instale o Docker e rode de novo."
        exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
        em_err "o daemon do Docker não está acessível — nada foi criado."
        em_err "  suba o serviço e rode de novo:   systemctl start docker"
        em_err "  (como o dono costuma subir:      sudo systemctl start docker)"
        exit 1
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        em_err "python3 ausente no host — o emulador o usa para ler os JSONs de prova dos containers."
        em_err "  instale python3 e rode de novo."
        exit 1
    fi
    if ! command -v timeout >/dev/null 2>&1; then
        em_err "timeout (coreutils) ausente no host — é o teto de execução de 1800s por cenário."
        exit 1
    fi
    if [ ! -r "$EMUL_REPO_ROOT/skills/study-method/scripts/_ensure-toolchain.sh" ]; then
        em_err "auxiliar não encontrado sob o repo: $EMUL_REPO_ROOT/skills/study-method/scripts/_ensure-toolchain.sh"
        exit 1
    fi
}

em_cleanup_containers() {
    # se o timeout matar o client do docker, o container fica órfão — remove pelo nome.
    local c
    for c in $EMUL_CONTAINERS; do
        docker rm -f "$c" >/dev/null 2>&1 || true
    done
}
trap em_cleanup_containers EXIT

# ---------------------------------------------------------------------------
# inner.sh — roda DENTRO do container (como root). Estático: recebe a família
# por argv e grava initial/ensure/final em .json/.err/.rc + steps.log em /out.
# SEMPRE sai 0: o veredito é calculado pelo emulador FORA, a partir dos .rc/.json
# — o status do docker run só sinaliza container morto/timeout.
# ---------------------------------------------------------------------------
em_write_inner() {
    cat <<'EMUL_INNER_EOF'
#!/usr/bin/env bash
# inner.sh — gerado por tools/emulador-ambiente.sh; roda DENTRO do contêiner (root).
set -u

FAM="${1:-apt}"
ENS="/repo/skills/study-method/scripts/_ensure-toolchain.sh"
OUT="/out"
LOG="$OUT/steps.log"

step() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$1" >> "$LOG"; }

capture() {
    # $1 = nome do artefato; resto = argv do auxiliar. Grava .json/.err/.rc.
    local name="$1"
    shift
    step "início: $name"
    bash "$ENS" "$@" > "$OUT/$name.json" 2> "$OUT/$name.err"
    printf '%s\n' "$?" > "$OUT/$name.rc"
    step "fim: $name (status $(cat "$OUT/$name.rc"))"
}

step "container iniciado (família $FAM); auxiliar: $ENS"
if [ ! -r "$ENS" ]; then
    step "ERRO: auxiliar não encontrado em $ENS (bind-mount do repo ausente?)"
    exit 0
fi

# 1) check inicial — máquina limpa: espera rc 1 com ensure.missing preenchido
capture initial --check --json

# 2) preparação do gerenciador — ÚNICO trabalho extra autorizado fora do auxiliar
if [ "$FAM" = "pacman" ]; then
    # o _ensure roda 'pacman -S --needed --noconfirm' SEM -Sy de propósito (receita §3.4:
    # sincronizar a base é preparo do operador, não parte da instalação). Se o sync falhar
    # por assinatura/base de dados velha, instala o keyring e repete.
    step "prep: pacman -Sy"
    pacman -Sy >> "$LOG" 2>&1
    sync_rc=$?
    if [ "$sync_rc" -ne 0 ]; then
        step "pacman -Sy falhou (status $sync_rc) — fallback: pacman -Sy --noconfirm archlinux-keyring e repetir"
        pacman -Sy --noconfirm archlinux-keyring >> "$LOG" 2>&1
        step "keyring: status $? — repetindo pacman -Sy"
        pacman -Sy >> "$LOG" 2>&1
        step "pacman -Sy (2ª tentativa): status $?"
    fi
elif [ "$FAM" = "apt" ]; then
    # o próprio _ensure roda 'apt-get update' uma vez antes de instalar
    # (sm_apt_update_once) — o emulador NÃO duplica o update.
    step "prep apt: nada — o _ensure roda apt-get update sozinho (sm_apt_update_once)"
else
    step "prep: família desconhecida '$FAM' — seguindo sem preparo"
fi

# 3) ensure — instala pela receita da distro e RE-PROVA (receita é do auxiliar)
capture ensure --ensure --json

# 4) check final — a prova fechada: 3 linguagens + harness
capture final --check --json

chmod -R a+rX "$OUT" 2>/dev/null || true
step "container concluído"
exit 0
EMUL_INNER_EOF
}

# ---------------------------------------------------------------------------
# evaluate.py — roda NO HOST sobre os artefatos de UM cenário: escreve
# summary.json + human.txt e imprime PASS/FAIL no stdout.
# ---------------------------------------------------------------------------
em_write_evaluate() {
    cat <<'EMUL_EVAL_EOF'
import json
import os
import re
import sys

slug_dir = sys.argv[1]
fam = sys.argv[2]
timeout_secs = sys.argv[3] if len(sys.argv) > 3 else "1800"
LANGS = ("python", "rust", "c")


def rd(name):
    try:
        with open(os.path.join(slug_dir, name), encoding="utf-8", errors="replace") as fh:
            return fh.read().strip()
    except OSError:
        return None


def rj(name):
    raw = rd(name)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def recover_doc_after_noise(raw):
    # O auxiliar imprime o documento JSON no FIM do stdout; a saída do gerenciador
    # (apt-get update / apt install / pacman) pode ter vazado ANTES dele. Recupera o
    # documento pelo último '{' isolado numa linha e devolve (doc, linhas_de_ruído).
    lines = raw.splitlines()
    starts = [i for i, l in enumerate(lines) if l.strip() == "{"]
    for i in reversed(starts):
        try:
            return json.loads("\n".join(lines[i:])), i
        except ValueError:
            continue
    return None, None


def as_list(v):
    return v if isinstance(v, list) else []


def proof_state(doc):
    ok, vers, det = {}, {}, {}
    langs = doc.get("languages", {}) if isinstance(doc, dict) else {}
    if not isinstance(langs, dict):
        langs = {}
    for l in LANGS:
        obj = langs.get(l) if isinstance(langs.get(l), dict) else {}
        proof = obj.get("proof") if isinstance(obj.get("proof"), dict) else {}
        ok[l] = proof.get("ok") is True
        vers[l] = obj.get("version")
        det[l] = proof.get("detail") or ""
    return ok, vers, det


def fmt(s):
    if not isinstance(s, int):
        return "?"
    if s >= 60:
        return "%dm%02ds" % (s // 60, s % 60)
    return "%ds" % s


def main():
    meta = rj("meta.json") or {}
    doc_i = rj("initial.json")
    doc_e = rj("ensure.json")
    doc_f = rj("final.json")
    rc_i, rc_e, rc_f = rd("initial.rc"), rd("ensure.rc"), rd("final.rc")
    run_rc = rd("run.rc")

    # o JSON do --ensure pode ter saído poluído (saída do gerenciador vazando no stdout do
    # auxiliar): tenta RECUPERAR o documento para extração de evidência — mas a violação de
    # contrato segue registrada em problems e o veredito NÃO vira PASS por causa disso.
    ensure_recovered = False
    ensure_noise = 0
    if doc_e is None:
        raw_e = rd("ensure.json")
        if raw_e:
            doc_e, noise_at = recover_doc_after_noise(raw_e)
            if doc_e is not None:
                ensure_recovered = True
                ensure_noise = noise_at if isinstance(noise_at, int) else 0

    f_ok, f_vers, f_det = proof_state(doc_f)
    i_ok, _i_vers, _i_det = proof_state(doc_i)

    harness = doc_f.get("harness", {}) if isinstance(doc_f, dict) else {}
    if not isinstance(harness, dict):
        harness = {}
    node = harness.get("node") if isinstance(harness.get("node"), dict) else {}
    npm = harness.get("npm") if isinstance(harness.get("npm"), dict) else {}
    node_ok = node.get("ok") is True
    npm_ok = npm.get("ok") is True
    node_ver = node.get("version")
    npm_ver = npm.get("version")

    missing_i = as_list((doc_i or {}).get("ensure", {}).get("missing"))
    installed = as_list((doc_e or {}).get("ensure", {}).get("installed"))
    skipped = as_list((doc_e or {}).get("ensure", {}).get("skipped"))
    failed = []
    for f in as_list((doc_e or {}).get("ensure", {}).get("failed")):
        if isinstance(f, dict):
            failed.append({"label": f.get("label"), "reason": f.get("reason"),
                           "detail": f.get("detail")})
    # última rede de evidência: os rótulos "instalando 'X' via ..." vão para o stderr
    installed_stderr = re.findall(r"instalando '([^']+)' via", rd("ensure.err") or "")

    # narrativa honesta: a história "instalação do zero" só vale com a base TOTALMENTE limpa —
    # rc=1 E skipped vazio E os 4 rótulos ausentes (python, rust, c, node). Base parcialmente
    # suja (ex.: python pré-instalado → skipped=["python"]) NÃO é FAIL: a prova de ambiente
    # segue válida e o relatório apenas NÃO reivindica a instalação-do-zero.
    base_limpa = (rc_i == "1" and skipped == []
                  and set(missing_i) >= {"python", "rust", "c", "node"})

    problems = []
    if run_rc is not None and run_rc != "0":
        if run_rc in ("124", "137"):
            problems.append("a execução no container estourou o teto de %ss (status %s) — "
                            "veja steps.log e docker-run.log" % (timeout_secs, run_rc))
        else:
            problems.append("docker run saiu com o status %s — veja steps.log e docker-run.log" % run_rc)

    if rc_i is None or doc_i is None:
        problems.append("o --check inicial não produziu JSON válido (container morreu cedo? "
                        "veja steps.log e docker-run.log)")
    elif rc_i not in ("0", "1"):
        problems.append("o --check inicial saiu com status inesperado %s (esperado 0 ou 1)" % rc_i)
    elif rc_i == "1" and not missing_i:
        problems.append("o --check inicial saiu com status 1 mas sem lista de ausentes "
                        "(JSON fora do contrato)")
    elif not base_limpa:
        # narrativa, não FAIL: base parcialmente suja ou cheia — a prova de ambiente segue
        # válida; o veredito sai do resto das checagens (ensure, provas finais, harness)
        pass

    if rc_e is None and doc_e is None:
        if rd("ensure.json") is None:
            problems.append("o --ensure não produziu saída alguma (veja steps.log e docker-run.log)")
        else:
            problems.append("o --ensure saiu com o stdout ILEGÍVEL como JSON (documento não "
                            "recuperável do ruído) — veja ensure.json e ensure.err")
    elif doc_e is None:
        problems.append("o --ensure saiu com o stdout ILEGÍVEL como JSON (rc=%s) — veja ensure.json" % rc_e)
    else:
        if ensure_recovered:
            problems.append("CONTRATO VIOLADO no --ensure: o stdout do auxiliar não é JSON puro — a saída "
                            "do gerenciador (sm_apt_update_once / sm_exec_install não redirecionam o stdout "
                            "do apt/pacman) vazou %d linha(s) antes do documento; o JSON foi recuperado por "
                            "recorte e a evidência segue, mas o conserto (redirecionar o stdout do gerenciador "
                            "para stderr) é gatilho T1" % ensure_noise)
        if rc_e != "0":
            problems.append("o --ensure saiu com o status %s (esperado 0)" % rc_e)
        for f in failed:
            problems.append("ensure.failed: %s (%s): %s"
                            % (f["label"], f["reason"], (f["detail"] or "")[:200]))
        if not installed and rc_i == "1":
            problems.append("o --ensure não instalou nada (installed=[]) apesar de ausentes "
                            "no check inicial (%s)" % ", ".join(missing_i))

    if rc_f is None or doc_f is None:
        problems.append("o --check final não produziu JSON válido (veja steps.log e docker-run.log)")
    else:
        if rc_f != "0":
            problems.append("o --check final saiu com o status %s (esperado 0)" % rc_f)
        for l in LANGS:
            if not f_ok[l]:
                problems.append("prova final %s FALHOU: %s" % (l, (f_det[l] or "")[:200]))
        if not node_ok:
            problems.append("harness final: node não provado")
        if not npm_ok:
            problems.append("harness final: npm não provado")

    verdict = "PASS" if not problems else "FAIL"

    summary = {
        "slug": meta.get("slug"),
        "image": meta.get("image"),
        "family": meta.get("family"),
        "run_index": meta.get("run_index"),
        "pull_status": meta.get("pull_status"),
        "pull_seconds": meta.get("pull_seconds"),
        "run_rc": meta.get("run_rc"),
        "run_seconds": meta.get("run_seconds"),
        "verdict": verdict,
        "problems": problems,
        "initial": {"rc": rc_i, "proof_ok": i_ok, "missing": missing_i, "base_limpa": base_limpa,
                    "valid": doc_i is not None},
        "ensure": {"rc": rc_e, "installed": installed, "skipped": skipped, "failed": failed,
                   "valid": doc_e is not None, "recovered_from_noise": ensure_recovered,
                   "noise_lines": ensure_noise if ensure_recovered else 0,
                   "installed_stderr_evidence": installed_stderr},
        "final": {"rc": rc_f, "proof_ok": f_ok, "versions": f_vers, "node_ok": node_ok,
                  "npm_ok": npm_ok, "node_version": node_ver, "npm_version": npm_ver,
                  "valid": doc_f is not None},
    }
    with open(os.path.join(slug_dir, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    img = meta.get("image") or "?"
    lines = ["--- cenário: %s (família %s) ---" % (img, fam)]
    pull_s = meta.get("pull_seconds")
    pull_txt = {"ja-presente": "imagem já presente (pull pulado)",
                "baixada": "baixada via docker pull",
                "falhou": "FALHOU"}.get(meta.get("pull_status"), meta.get("pull_status") or "?")
    if isinstance(pull_s, int):
        pull_txt += " em %s" % fmt(pull_s)
    lines.append("pull             : %s" % pull_txt)
    run_txt = "status %s" % (meta.get("run_rc") if meta.get("run_rc") is not None else "?")
    if isinstance(meta.get("run_seconds"), int):
        run_txt += " em %s" % fmt(meta.get("run_seconds"))
    lines.append("execução         : %s" % run_txt)

    if rc_i is None:
        lines.append("check inicial    : sem JSON (execução morreu cedo)")
    elif base_limpa:
        lines.append("check inicial    : rc=%s — máquina limpa confirmada" % rc_i)
        lines.append("  ausentes       : %s" % (", ".join(missing_i) if missing_i else "(nenhum)"))
    elif rc_i == "1":
        lines.append("check inicial    : rc=1 — base NÃO estava limpa (skipped=[%s])"
                     % ", ".join(skipped))
        lines.append("  ausentes       : %s" % (", ".join(missing_i) if missing_i else "(nenhum)"))
        lines.append("  narrativa      : prova de ambiente válida; instalação-do-zero NÃO aplicável")
    elif rc_i == "0":
        lines.append("check inicial    : rc=0 — base NÃO estava limpa (nada ausente; skipped=[%s])"
                     % ", ".join(skipped))
        lines.append("  narrativa      : prova de ambiente válida; instalação-do-zero NÃO aplicável")
    else:
        lines.append("check inicial    : rc=%s — status inesperado" % rc_i)

    if rc_e is None:
        lines.append("ensure           : sem JSON (rc não capturado)")
        if installed_stderr:
            lines.append("  instalados     : %s (evidência do stderr — JSON ilegível)"
                         % ", ".join(installed_stderr))
    else:
        lines.append("ensure           : rc=%s%s" % (rc_e, " (JSON recuperado por recorte)" if ensure_recovered else ""))
        lines.append("  instalados     : %s" % (", ".join(installed) if installed else "(nenhum)"))
        lines.append("  skipped        : %s" % (", ".join(skipped) if skipped else "(nenhum)"))
        if failed:
            for f in failed:
                lines.append("  FALHA          : %s (%s): %s"
                             % (f["label"], f["reason"], (f["detail"] or "")[:200]))
        else:
            lines.append("  falhas         : (nenhuma)")

    if rc_f is None:
        lines.append("check final      : sem JSON")
    else:
        lines.append("check final      : rc=%s" % rc_f)
        for l in LANGS:
            mark = "PROVADO" if f_ok[l] else "FALHOU"
            lines.append("  %-14s : %s — %s" % (l, mark, f_vers.get(l) or "?"))
        hv = []
        if node_ver:
            hv.append("node %s" % node_ver)
        if npm_ver:
            hv.append("npm %s" % npm_ver)
        lines.append("  harness        : %s — %s"
                     % (" · ".join(hv) if hv else "node/npm ausentes",
                        "ok" if (node_ok and npm_ok) else "FALHOU"))

    lines.append("tempo do cenário : execução %s · pull %s"
                 % (fmt(meta.get("run_seconds")), fmt(meta.get("pull_seconds"))))
    lines.append("veredito         : %s" % ("PASSOU" if verdict == "PASS" else "FALHOU"))
    for p in problems:
        lines.append("  problema       : %s" % p)

    with open(os.path.join(slug_dir, "human.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(verdict)


try:
    main()
except Exception as exc:  # nunca travar o relatório do emulador
    with open(os.path.join(slug_dir, "human.txt"), "w", encoding="utf-8") as fh:
        fh.write("--- cenário: %s (família %s) ---\n" % (os.path.basename(slug_dir), fam))
        fh.write("veredito         : FALHOU\n")
        fh.write("  problema       : avaliação interna falhou: %r\n" % exc)
    with open(os.path.join(slug_dir, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump({"slug": os.path.basename(slug_dir), "verdict": "FAIL",
                   "problems": ["avaliação interna falhou: %r" % exc]},
                  fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("FAIL")
EMUL_EVAL_EOF
}

# ---------------------------------------------------------------------------
# aggregate.py — mescla os summary.json dos cenários no agregado do --json.
# ---------------------------------------------------------------------------
em_write_aggregate() {
    cat <<'EMUL_AGGR_EOF'
import datetime
import json
import os
import sys

art, host, repo_root, docker_version = sys.argv[1:5]
scen = []
for name in sorted(os.listdir(art)):
    sdir = os.path.join(art, name)
    sp = os.path.join(sdir, "summary.json")
    if not os.path.isfile(sp):
        continue
    try:
        with open(sp, encoding="utf-8") as fh:
            doc = json.load(fh)
    except (OSError, ValueError):
        doc = {"slug": name, "verdict": "FAIL", "problems": ["summary.json ilegível"]}
    scen.append(doc)


def run_index(d):
    v = d.get("run_index")
    return v if isinstance(v, int) else 99


scen.sort(key=run_index)
ok = all(d.get("verdict") == "PASS" for d in scen) and bool(scen)
out = {
    "schema_version": "1.0",
    "generated_at": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds"),
    "tool": "tools/emulador-ambiente.sh",
    "host": host,
    "repo_root": repo_root,
    "docker_version": docker_version,
    "ok": ok,
    "scenarios": scen,
}
print(json.dumps(out, ensure_ascii=False, indent=2))
EMUL_AGGR_EOF
}

em_write_meta() {
    # $1 dir · $2 image · $3 family · $4 slug · $5 pull_status · $6 pull_secs ·
    # $7 run_rc ("" = não rodou) · $8 run_secs · $9 run_index — todos valores simples,
    # sem aspas/backslash: a interpolação direta em JSON é segura.
    local dir="$1" image="$2" family="$3" slug="$4" pull_status="$5" pull_secs="$6" run_rc="$7" run_secs="$8" run_index="$9"
    local runrc="null"
    if [ -n "$run_rc" ]; then
        runrc="$run_rc"
    fi
    printf '{"image": "%s", "family": "%s", "slug": "%s", "pull_status": "%s", "pull_seconds": %s, "run_rc": %s, "run_seconds": %s, "run_index": %s}\n' \
        "$image" "$family" "$slug" "$pull_status" "$pull_secs" "$runrc" "$run_secs" "$run_index" \
        > "$dir/meta.json"
}

# ---------------------------------------------------------------------------
# Um cenário: pull (sem teto) → run com teto de 1800s → avaliação → relatório.
# Falha de cenário é REGISTRADA e o fluxo segue para o próximo.
# ---------------------------------------------------------------------------
em_scenario() {
    local image="$1" fam="$2" slug="$3"
    local dir="$EMUL_ART/$slug"
    mkdir -p "$dir"
    em_write_inner > "$dir/inner.sh"

    local cname="emul-ambiente-$slug"
    EMUL_CONTAINERS="$EMUL_CONTAINERS $cname"

    local pull_status="ja-presente" pull_secs=0
    local t0 t1
    if docker image inspect "$image" >/dev/null 2>&1; then
        pull_status="ja-presente"
    else
        t0=$(date +%s)
        set +e
        docker pull "$image" >&2
        local pull_rc=$?
        set -e
        t1=$(date +%s)
        pull_secs=$((t1 - t0))
        if [ "$pull_rc" -eq 0 ]; then
            pull_status="baixada"
        else
            pull_status="falhou"
        fi
    fi

    local run_rc="" run_secs=0
    if [ "$pull_status" != "falhou" ]; then
        t0=$(date +%s)
        set +e
        timeout -k 30 "$EMUL_TIMEOUT_SECS" docker run --rm --name "$cname" \
            -v "$EMUL_REPO_ROOT:/repo:ro" \
            -v "$dir:/out" \
            -e STUDY_METHOD_HOME=/tmp/sm-home \
            -w /tmp \
            "$image" bash /out/inner.sh "$fam" \
            > "$dir/docker-run.log" 2>&1
        run_rc=$?
        set -e
        t1=$(date +%s)
        run_secs=$((t1 - t0))
        printf '%s\n' "$run_rc" > "$dir/run.rc"
    fi
    em_write_meta "$dir" "$image" "$fam" "$slug" "$pull_status" "$pull_secs" "$run_rc" "$run_secs" "$EMUL_SCENARIO_N"

    local verdict="FAIL"
    set +e
    verdict="$(python3 "$EMUL_ART/evaluate.py" "$dir" "$fam" "$EMUL_TIMEOUT_SECS" 2>"$dir/evaluate.err")"
    set -e
    if [ "$verdict" != "PASS" ] && [ "$verdict" != "FAIL" ]; then
        verdict="FAIL"
    fi

    if [ -r "$dir/human.txt" ]; then
        cat "$dir/human.txt"
    else
        printf -- '--- cenário: %s (família %s) ---\n' "$image" "$fam"
        printf -- 'veredito         : FALHOU (avaliação não produziu relatório — veja %s/evaluate.err)\n' "$dir"
    fi
    if [ "$verdict" != "PASS" ]; then
        # o erro EXATO é parte da prova: falha de receita real nunca é escondida (gatilho T1)
        if [ -s "$dir/ensure.json" ]; then
            printf -- '[evidência bruta — primeiras linhas de ensure.json (o que vazou no stdout)]\n'
            head -n 6 "$dir/ensure.json" | sed 's/^/    /'
        fi
        if [ -s "$dir/ensure.err" ]; then
            printf -- '[evidência bruta — tail de ensure.err]\n'
            tail -n 25 "$dir/ensure.err" | sed 's/^/    /'
        fi
        if [ -s "$dir/docker-run.log" ]; then
            printf -- '[evidência bruta — tail de docker-run.log]\n'
            tail -n 15 "$dir/docker-run.log" | sed 's/^/    /'
        fi
    fi

    if [ "$verdict" = "PASS" ]; then
        printf '%s PASS\n' "$slug" >> "$EMUL_ART/status.txt"
    else
        printf '%s FAIL\n' "$slug" >> "$EMUL_ART/status.txt"
    fi
}

em_main() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --json) EMUL_WANT_JSON="1"; shift ;;
            -h|--help) em_usage; exit 0 ;;
            *) em_usage; em_die 2 "argumento desconhecido: $1" ;;
        esac
    done

    EMUL_REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
    em_precheck

    EMUL_ART="$(mktemp -d "${TMPDIR:-/tmp}/emulador-ambiente.XXXXXX")"
    em_write_evaluate > "$EMUL_ART/evaluate.py"
    em_write_aggregate > "$EMUL_ART/aggregate.py"

    printf '=================================================================\n'
    printf 'emulador Docker de máquina limpa — tools/emulador-ambiente.sh\n'
    printf 'repo (bind :ro)  : %s\n' "$EMUL_REPO_ROOT"
    printf 'auxiliar provado : skills/study-method/scripts/_ensure-toolchain.sh\n'
    printf 'docker           : %s\n' "$(docker --version 2>/dev/null)"
    printf 'precheck         : daemon ok · python3 ok · timeout ok (teto de %ss por cenário)\n' "$EMUL_TIMEOUT_SECS"
    printf 'artefatos        : %s\n' "$EMUL_ART"
    printf '=================================================================\n\n'

    EMUL_SCENARIO_N=1
    em_scenario "ubuntu:24.04" "apt" "cenario-ubuntu-2404"
    printf '\n'
    EMUL_SCENARIO_N=2
    em_scenario "archlinux" "pacman" "cenario-archlinux"

    printf '\n-----------------------------------------------------------------\n'
    printf 'resumo do emulador\n'
    local slug verdict fails=0 total=0
    if [ -r "$EMUL_ART/status.txt" ]; then
        while read -r slug verdict; do
            [ -n "$slug" ] || continue
            total=$((total + 1))
            if [ "$verdict" = "PASS" ]; then
                printf '  %-24s PASSOU\n' "$slug"
            else
                printf '  %-24s FALHOU\n' "$slug"
                fails=$((fails + 1))
            fi
        done < "$EMUL_ART/status.txt"
    fi
    if [ "$total" -eq 0 ]; then
        fails=1
        printf '  (nenhum cenário produziu veredito)\n'
    fi
    if [ "$fails" -eq 0 ]; then
        printf 'emulador         : PASSOU — %s/%s cenários com provas verdes\n' "$total" "$total"
    else
        printf 'emulador         : FALHOU — %s de %s cenários sem prova verde\n' "$fails" "$total"
    fi
    printf 'artefatos        : %s\n' "$EMUL_ART"

    if [ "$EMUL_WANT_JSON" = "1" ]; then
        printf -- '--- emulador-ambiente: json ---\n'
        python3 "$EMUL_ART/aggregate.py" "$EMUL_ART" \
            "$(uname -n 2>/dev/null || printf unknown)" "$EMUL_REPO_ROOT" \
            "$(docker --version 2>/dev/null || printf unknown)" || true
    fi

    if [ "$fails" -eq 0 ]; then
        exit 0
    fi
    exit 1
}

em_main "$@"
