#!/usr/bin/env bash
# app/run-dev.sh — RODE O APP DEV COM AS CHAVES, NUM COMANDO.
#
# Uso (a partir de app/):
#   ./run-dev.sh
# ou de qualquer lugar:
#   bash <worktree>/app/run-dev.sh
#
# O que faz:
#   1. Carrega app/.env.local (gitignored) p/ o ambiente — OPENROUTER_API_KEY e
#      BRAVE_API_KEY disponíveis (o app usa fallback por env se o store vazio);
#   2. roda `npm run dev` (electron-vite, janela VISÍVEL).
# Se .env.local não existir, roda mesmo assim (as chaves podem já estar no
# settingsStore do userData — validadas no boot).
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
  echo "[run-dev] chaves carregadas de .env.local"
else
  echo "[run-dev] sem .env.local — usando settingsStore do userData (ou env já exportadas)"
fi

exec npm run dev
