#!/usr/bin/env bash
# install.sh — instala o projeto study-method INTEIRO, sempre, com um comando. Sem flags.
#
# Faz, nesta ordem:
#   1. skill — confere a origem e instala ~/.claude/skills/study-method por cópia do clone
#      (sobrescreve uma instalação anterior desta skill; sem rede, sem sudo, sem tocar em
#      PATH, ~/.bashrc ou config do sistema);
#   2. app — cria app/.env.local a partir de app/.env.local.example se faltar
#      (chaves vazias — você preenche; o .env.local é gitignored);
#   3. app — roda `npm ci` em app/ (a ÚNICA parte com download; o .npmrc do app libera os
#      postinstall de esbuild/electron que o build exige).
#
# Depois, rode o projeto com:  ./run.sh
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="study-method"
SRC="$SELF_DIR/skills/$SKILL_NAME"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
DEST="$SKILLS_DIR/$SKILL_NAME"
APP="$SELF_DIR/app"

# ───────────────────────────────────────────────────────────── 1. skill
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

[ -d "$SKILLS_DIR" ] || { mkdir -p -- "$SKILLS_DIR"; chmod 700 -- "$SKILLS_DIR"; }

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  # Guarda: só removemos o que é reconhecivelmente esta skill.
  if [ ! -L "$DEST" ] && ! grep -qxF "name: $SKILL_NAME" "$DEST/SKILL.md" 2>/dev/null; then
    echo "erro: $DEST existe e não parece a skill $SKILL_NAME — remova à mão e rode de novo." >&2
    exit 1
  fi
  rm -rf -- "$DEST"
fi
cp -R -- "$SRC" "$DEST"
echo "Skill: instalada por cópia em $DEST"

# ───────────────────────────────────────────────────────────── 2. app: chaves
if [ -f "$APP/.env.local.example" ] && [ ! -e "$APP/.env.local" ]; then
  cp -- "$APP/.env.local.example" "$APP/.env.local"
  echo "App: criado $APP/.env.local — preencha as chaves e rode ./run.sh"
fi

# ───────────────────────────────────────────────────────────── 3. app: dependências
if [ ! -f "$APP/package.json" ] || [ ! -f "$APP/package-lock.json" ]; then
  echo "erro: não achei $APP/package.json + package-lock.json" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "erro: faltam node/npm no PATH (o app exige Node ≥ 20, npm ≥ 11). Instale e rode de novo." >&2
  exit 1
fi
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "${node_major:-0}" -lt 20 ]; then
  echo "erro: node $(node --version) é velho demais — o app exige Node ≥ 20." >&2
  exit 1
fi

echo "App: instalando dependências (npm ci — baixa pacotes; pode levar alguns minutos)..."
npm --prefix "$APP" ci

echo ""
echo "Pronto. Skill em $DEST; dependências do app em $APP/node_modules."
echo "Rode o projeto com:  $SELF_DIR/run.sh"