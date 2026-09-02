#!/usr/bin/env bash
# tools/t.sh — test runner com a EMPTY-GLOB GUARD (contrato de verificação V-00).
# `node --test` sai 0 mesmo quando o glob/path não casa NENHUM arquivo de teste
# (medido no Node v24). Este wrapper transforma esse caso em FALHA: coleção vazia
# dispara a guarda e o run falha — um suíte inexistente nunca passa verde.
# Copiado da convenção de /home/ondokai/Projects/leet-code-rpg/tools/t.sh.
#
# Uso (a raiz do repo é resolvida sozinha, rode de qualquer lugar):
#   bash tools/t.sh <file>       roda um arquivo de teste
#   bash tools/t.sh <dir>        roda todo *.test.ts / *.test.tsx abaixo dele
#   bash tools/t.sh <glob>       roda arquivos que casam o padrão
#   npm test                     roda `bash tools/t.sh tests`
#
# Portabilidade: a coleta recursiva do caso DIRETÓRIO usa find (portável
# bash 3.2+/5) — o globstar do bash 5 não existe no bash 3.2 do macOS
# (shopt: globstar: invalid shell option name), então "$target"/** degradaria
# para um nível só de profundidade. O caso GLOB continua usando expansão de
# shell (comportamento esperado para padrões passados pelo usuário).
#
# Exit codes:
#   0  todo arquivo de teste casado passou
#   1  GUARD: nenhum arquivo de teste casou (nunca um verde silencioso)
#   1  node:test falhou (exit code propagado como está)
#   2  erro de uso
set -u

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

target="${1:-}"
if [[ -z "$target" ]]; then
  echo "usage: bash tools/t.sh <file|dir|glob>   (e.g. 'tests' ou 'tests/_helpers')" >&2
  exit 2
fi

if [[ ! -d node_modules/tsx ]]; then
  echo "[t.sh] node_modules/tsx not found — run \`npm install\` first" >&2
  exit 1
fi

guard() {
  echo "[t.sh GUARD] no test files matched '$target'" >&2
  echo "[t.sh GUARD] node --test exits 0 on an empty glob; the guard turns that into a" >&2
  echo "[t.sh GUARD] FAILURE, so a suite whose files do not exist can never pass green." >&2
  exit 1
}

files=()

if [[ "$target" == *'*'* || "$target" == *'?'* || "$target" == *'['* ]]; then
  # Padrão de shell — expande (sem casar => array vazio, a guarda dispara abaixo).
  shopt -s globstar nullglob dotglob
  # shellcheck disable=SC2206
  files=($target)
elif [[ -d "$target" ]]; then
  # Diretório — coleta todo arquivo de teste abaixo dele, recursivamente.
  # coleta por find (portável bash 3.2+/5) — o globstar do bash 5 não existe
  # no bash 3.2 do macOS. find inclui dotfiles por padrão; sort garante ordem
  # determinística; while/read evita problemas com espaços em paths.
  while IFS= read -r f; do files+=("$f"); done < <(find "$target" -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort)
else
  files=("$target")
fi

if [[ ${#files[@]} -eq 0 ]]; then
  guard
fi
if [[ ${#files[@]} -eq 1 && ! -f "${files[0]}" ]]; then
  # Path literal (sem glob) apontando para arquivo inexistente: igual a glob vazio.
  guard
fi

node --import tsx --test "${files[@]}"
exit $?
