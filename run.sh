#!/usr/bin/env bash
# run.sh — roda o projeto study-method (app GUI Electron). Sem flags.
#
# Sempre, ANTES de subir, garante a instalação e a configuração do projeto:
#   1. checa node/npm presentes e versão ≥ 22.13 (erro claro ANTES de qualquer download);
#   2. garante app/.env.local — cria do example se faltar, com aviso p/ preencher as chaves;
#   3. garante app/node_modules — se faltar (ou estiver pela metade, sem o marcador
#      node_modules/.install-ok), roda `npm ci` direto em app/ (idempotente: com tudo
#      instalado, a segunda execução não refaz nada);
#   4. delega para app/run-dev.sh, que carrega app/.env.local e sobe o `npm run dev`
#      (electron-vite, janela VISÍVEL).
#
# NUNCA instala skill nenhuma (nem local, nem global): a instalação de skills é
# manual — ./install.sh (destino LOCAL: <repo>/.claude/skills/) ou "À mão" no README.
# Nada disso exige que o usuário rode ./install.sh antes: o run.sh instala sozinho
# a parte do app.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/app"

# shellcheck source=tools/check-env.sh
. "$ROOT/tools/check-env.sh"

# ───────────────────────────────────────────────────────────── 1. node/npm ≥ 22.13
require_node_ge_22_13

# ───────────────────────────────────────────────────────────── 2. app/.env.local
ensure_app_env_local "$APP"

# ───────────────────────────────────────────────────────────── 3. app/node_modules
if [ ! -f "$APP/package.json" ] || [ ! -f "$APP/package-lock.json" ]; then
  echo "erro: não achei $APP/package.json + package-lock.json" >&2
  exit 1
fi

if ! app_node_modules_ok "$APP"; then
  echo "App: dependências não instaladas (ou instaladas pela metade) — rodando npm ci em $APP..."
  echo "    (o npm ci baixa pacotes; na primeira vez pode levar alguns minutos)"
  # HUSKY=0: hooks de git não pertencem a este bootstrap — um husky ausente no clone
  # não pode quebrar a instalação das dependências.
  HUSKY=0 npm --prefix "$APP" ci
  # Marcador de instalação COMPLETA — sem ele, a próxima execução refaz o ci.
  touch "$APP/node_modules/.install-ok"
  echo "App: dependências instaladas em $APP/node_modules."
fi

# ───────────────────────────────────────────────────────────── 4. sobe o app
exec bash "$APP/run-dev.sh"
