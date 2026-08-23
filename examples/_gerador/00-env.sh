# 00-env.sh — ambiente comum de todas as fases. Nenhum caminho de máquina fica gravado:
# a raiz do repositório é derivada da posição DESTE arquivo, e o destino vem de $1/$SM_DEST.
set -euo pipefail
export LC_ALL=C.UTF-8
export TZ=America/Sao_Paulo

EX="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO="$(cd -- "$EX/../.." && pwd -P)"
SK="$REPO/skills/study-method"
S="$SK/scripts"

# destino: $SM_DEST, ou um diretório temporário próprio
WORK="${SM_DEST:-${TMPDIR:-/tmp}/study-method-exemplo}"
export STUDY_METHOD_HOME="$WORK/state"
SETUP="$WORK/setup-calculo-python"
mkdir -p -- "$WORK" "$STUDY_METHOD_HOME"
