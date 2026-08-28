#!/usr/bin/env bash
# install.sh — instala o projeto study-method INTEIRO, sempre, com um comando. Sem flags.
# IDEMPOTENTE: rodar de novo com tudo instalado não refaz nada (skill idêntica não é
# recopiada; npm ci só roda se as dependências não estiverem instaladas; .env.local
# só é criado se faltar). A segunda execução é rápida.
#
# Faz, nesta ordem:
#   1. skill — confere a origem e instala ~/.claude/skills/study-method por cópia do clone
#      (só recopia se o destino DIFERIR da origem — comparação conteúdo a conteúdo;
#      sem rede, sem sudo, sem tocar em PATH, ~/.bashrc ou config do sistema);
#   2. app — cria app/.env.local a partir de app/.env.local.example se faltar
#      (chaves vazias — você preenche; o .env.local é gitignored);
#   3. app — roda `npm ci` em app/ se as dependências NÃO estiverem instaladas
#      (a ÚNICA parte com download; o .npmrc do app libera os postinstall de
#      esbuild/electron que o build exige). Um npm ci morto no meio não deixa
#      estado quebrado irreversível: sem o marcador node_modules/.install-ok,
#      a próxima execução refaz a instalação.
#
# Depois, rode o projeto com:  ./run.sh
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/check-env.sh
. "$SELF_DIR/tools/check-env.sh"

SKILL_NAME="study-method"
SRC="$SELF_DIR/skills/$SKILL_NAME"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
DEST="$SKILLS_DIR/$SKILL_NAME"
APP="$SELF_DIR/app"

# Exit 0 sse todo arquivo de $1 existe em $2 com conteúdo idêntico (cobertura da
# origem). Arquivos que existem só em $2 são ignorados de propósito: extras no
# destino não podem forçar recópia (recopiar por recopiar). Portável (bash 3.2,
# find/sort/sed/cmp do macOS e Linux).
src_installed_in() {
  local src="$1" dest="$2"
  local rel
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    [ -f "$dest/$rel" ] || return 1
    cmp -s -- "$src/$rel" "$dest/$rel" || return 1
  done < <(cd "$src" && find . -type f | sed 's#^\./##' | sort)
  return 0
}

# ───────────────────────────────────────────────────────────── 1. skill (idempotente)
[ -d "$SRC" ] || { echo "erro: não achei a skill em $SRC (rode a partir do clone)." >&2; exit 1; }
[ -f "$SRC/SKILL.md" ] || { echo "erro: não achei $SRC/SKILL.md" >&2; exit 1; }

# O `name` do frontmatter TEM que bater com o nome do diretório, senão a skill não carrega.
FM_NAME="$(sed -n '/^---[[:space:]]*$/,/^---[[:space:]]*$/p' "$SRC/SKILL.md" \
           | sed -n 's/^name:[[:space:]]*\([^[:space:]]*\)[[:space:]]*$/\1/p' | head -1)"
if [ "$FM_NAME" != "$SKILL_NAME" ]; then
  echo "erro: o frontmatter diz «name: $FM_NAME», mas o diretório é «$SKILL_NAME»." >&2
  echo "  Uma Agent Skill só carrega quando os dois são iguais. Corrija um dos dois." >&2
  exit 1
fi

# (sem `--` no chmod: o BSD/macOS não aceita e quebra o install.sh no primeiro uso)
[ -d "$SKILLS_DIR" ] || { mkdir -p -- "$SKILLS_DIR"; chmod 700 "$SKILLS_DIR"; }

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  # Guarda: só removemos o que é reconhecivelmente esta skill.
  if [ ! -L "$DEST" ] && ! grep -qxF "name: $SKILL_NAME" "$DEST/SKILL.md" 2>/dev/null; then
    echo "erro: $DEST existe e não parece a skill $SKILL_NAME — remova à mão e rode de novo." >&2
    exit 1
  fi
  # Idempotência: se todo arquivo da origem já está no destino com o mesmo
  # conteúdo, nada a copiar (arquivos extras no destino NÃO forçam recópia —
  # senão qualquer arquivo solto no destino faria recopiar por recopiar).
  if src_installed_in "$SRC" "$DEST"; then
    echo "Skill: já instalada em $DEST (origem íntegra no destino — nada a copiar)."
  else
    rm -rf -- "$DEST"
    cp -R -- "$SRC" "$DEST"
    echo "Skill: instalada por cópia em $DEST"
  fi
else
  cp -R -- "$SRC" "$DEST"
  echo "Skill: instalada por cópia em $DEST"
fi

# ───────────────────────────────────────────────────────────── 2. app: chaves
ensure_app_env_local "$APP"

# ───────────────────────────────────────────────────────────── 3. app: dependências
if [ ! -f "$APP/package.json" ] || [ ! -f "$APP/package-lock.json" ]; then
  echo "erro: não achei $APP/package.json + package-lock.json" >&2
  exit 1
fi
require_node_ge_22_13

if app_node_modules_ok "$APP"; then
  echo "App: dependências já instaladas em $APP/node_modules (nada a baixar)."
else
  echo "App: instalando dependências (npm ci — baixa pacotes; pode levar alguns minutos)..."
  npm --prefix "$APP" ci
  # Marcador de instalação COMPLETA — sem ele, a próxima execução refaz o ci.
  touch "$APP/node_modules/.install-ok"
  echo "App: dependências instaladas em $APP/node_modules."
fi

echo ""
echo "Pronto. Skill em $DEST; dependências do app em $APP/node_modules."
echo "Rode o projeto com:  $SELF_DIR/run.sh"
