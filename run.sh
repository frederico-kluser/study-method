#!/usr/bin/env bash
# run.sh — roda o projeto study-method (app GUI Electron). Sem flags.
#
# Faz:
#   1. confere que as dependências do app foram instaladas (app/node_modules);
#   2. delega para app/run-dev.sh, que carrega app/.env.local (chaves, se existir)
#      e sobe o `electron-vite dev` — janela VISÍVEL.
#
# Sem app/node_modules: rode ./install.sh primeiro (instala a skill + o npm ci do app).
set -u

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/app"

if [ ! -d "$APP/node_modules" ]; then
  echo "erro: dependências do app não instaladas (faltou $APP/node_modules)." >&2
  echo "  rode: $ROOT/install.sh   (instala a skill + o npm ci do app)" >&2
  exit 1
fi

exec bash "$APP/run-dev.sh"