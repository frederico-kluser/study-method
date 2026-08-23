# shellcheck shell=bash
# lib/common.sh — STUB DE CONTRATO (COMMIT PREP onda 3).
# Contrato congelado em docs/00-contratos.md §7.1. NÃO altere assinaturas: preencha corpos.
# LIB-1 apenas `source`, nunca executado (modo 0644, sem shebang executável, sem main).
# LIB-2 toda função com prefixo sm_; toda global com prefixo SM_.
# LIB-3 nada em stdout além do valor documentado; log/aviso/diagnóstico SEMPRE em stderr.
# LIB-4 nenhuma função chama exit, exceto sm_die.
# LIB-5 `set -u` assumido; `set -e` NÃO assumido.
# LIB-6 permitido: bash 4+, coreutils, jq, python3 stdlib. Nada mais sem sm_require_cmd.

sm_setup_root() { :; }            # [<hint>] -> caminho absoluto | 0 achou · 3 não achou (sobe até $HOME inclusive)
sm_die() { :; }                   # <code> <msg...> -> termina com <code>; "study-method: erro <code>:" em stderr
sm_log() { :; }                   # debug|info|warn|error <msg...> -> stderr com carimbo ISO; debug só se STUDY_METHOD_LOG=debug
sm_require_cmd() { :; }           # <cmd>... -> 0 todos presentes · 1 nomeia o que falta (NUNCA instala)
sm_normalize_concept_id() { :; }  # <rótulo pt-BR> -> snake_case ^[a-z][a-z0-9_]{1,62}$ | 0 · 2 vazio
sm_normalize_slug() { :; }        # <rótulo pt-BR> -> kebab-case ^[a-z0-9]+(-[a-z0-9]+)*$ | 0 · 2 vazio
sm_atomic_write() { :; }          # <destino> (conteúdo em stdin) -> tmp no mesmo dir + sync + mv -f | 0 · 1 I/O
sm_next_seq() { :; }              # <dir> <sufixo> -> NNNN | 0 · 4 após 5 colisões (noclobber; nunca reaproveita purgado)
sm_registry_path() { :; }         # -> ${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/registry.json
sm_registry_lock() { :; }         # -> 0 obteve · 4 ocupado (mkdir atômico; lock com mtime>60s é morto: remove, avisa, retenta 1x)
sm_registry_unlock() { :; }       # -> 0 sempre (idempotente)
sm_setup_lock() { :; }            # <setup_root> -> 0 · 4 sessão viva (memory/.session.lock: pid, hostname, session_id, started_at)
sm_setup_unlock() { :; }          # <setup_root> -> 0 sempre (idempotente)
sm_now_iso() { :; }               # -> timestamp ISO 8601 com offset, casando o pattern de §4.2
sm_today() { :; }                 # -> YYYY-MM-DD; honra STUDY_METHOD_TODAY (determinismo do gate)
sm_relpath() { :; }               # <caminho> <raiz> -> relativo sem ./ | 0 · 2 fora da raiz
sm_chmod_private() { :; }         # <caminho> -> chmod 700 | 0 · 1
